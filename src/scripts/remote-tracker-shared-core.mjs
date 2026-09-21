// Leaf primitives shared by the `remote-tracker` modules.
//
// This module is the bottom of the tracker's import layering: it imports nothing from the package,
// and `remote-tracker-decomposition-core.mjs`, `remote-tracker-github-core.mjs`,
// `remote-tracker-forgejo-core.mjs` and `remote-tracker-core.mjs` all import from it. A symbol
// belongs here when its code consumers span more than one of those modules; a symbol whose only
// consumer is one provider adapter belongs to that adapter instead, which is what keeps this file
// from growing into a second core.

export class RemoteTrackerError extends Error {
  constructor(code, message, details = {}, retryable = false) {
    super(message);
    this.name = 'RemoteTrackerError';
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }
}

export function fail(code, message, details = {}, retryable = false) {
  throw new RemoteTrackerError(code, message, details, retryable);
}

export function assertPublishable(text, field) {
  const value = requireString(text, field, { allowEmpty: true });
  if (/Generated with (?:Claude Code|Codex)|claude\.ai\/code|Co-Authored-By:/i.test(value)) {
    fail('INVALID_PAYLOAD', `${field} contains prohibited generation attribution`, { field });
  }
  return value;
}

export function requireObject(value, label = 'input') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_PAYLOAD', `${label} must be a JSON object`);
  }
  return value;
}

export function requireString(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.trim() === '')) {
    fail('INVALID_PAYLOAD', `${label} must be ${allowEmpty ? 'a' : 'a non-empty'} string`, {
      field: label,
    });
  }
  return value;
}

export function requireNumber(value, label) {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(number) || number <= 0) {
    fail('INVALID_REFERENCE', `${label} must be a positive integer`, { field: label });
  }
  return number;
}

export const ISSUE_STATE_READ_TIMEOUT_MS = 30_000;

export function exactObjectKeys(value, expected, label) {
  requireObject(value, label);
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) {
    fail('INVALID_PAYLOAD', `${label} must contain exactly ${expected.join(', ')}`, {
      field: label,
      keys,
    });
  }
}

export function lifecycleSafeString(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  const text = requireString(value, label).trim();
  if (text.length > 512) {
    fail('INVALID_PAYLOAD', `${label} is too long`, { field: label, maximum: 512 });
  }
  if (/\p{Cc}|<!--|-->/u.test(text)) {
    fail('INVALID_PAYLOAD', `${label} contains unsafe comment or control characters`, {
      field: label,
    });
  }
  return text;
}

export function lifecycleRepository(value) {
  const repository = lifecycleSafeString(value, 'receipt.repository');
  if (!/^[^\s/@]+(?:\/[^\s/@]+)+$/u.test(repository)) {
    fail('INVALID_PAYLOAD', 'receipt.repository must be an owner/repository slug', {
      field: 'receipt.repository',
    });
  }
  return repository;
}

export function lifecycleRepositoryBinding(context = {}) {
  const configured = context.expectedRepository ?? context.repository;
  if (configured === undefined) return undefined;
  if (typeof configured === 'string') return { slug: lifecycleRepository(configured) };
  requireObject(configured, 'receipt repository context');
  const owner = lifecycleSafeString(configured.owner, 'receipt repository context.owner');
  const name = lifecycleSafeString(
    configured.repository ?? configured.name,
    'receipt repository context.repository',
  );
  return {
    slug: lifecycleRepository(configured.slug ?? `${owner}/${name}`),
    host: normalizeHost(configured.host),
  };
}

export function normalizeForgeLifecycleReference(value, label, repository) {
  const reference = lifecycleSafeString(value, label);
  const shorthand = reference.match(/^#?([1-9]\d*)$/);
  if (shorthand) return `#${shorthand[1]}`;
  let parsed;
  try {
    parsed = new URL(reference);
  } catch {
    fail('INVALID_REFERENCE', `${label} must be a forge issue number or issue URL`, {
      field: label,
    });
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    redact(reference) !== reference
  ) {
    fail('INVALID_REFERENCE', `${label} must be a plain credential-free HTTP(S) issue URL`, {
      field: label,
    });
  }
  if (repository?.host === undefined) {
    fail('INVALID_PAYLOAD', `${label} requires the resolved forge repository host`, {
      field: label,
    });
  }
  let parsedReference;
  try {
    parsedReference = parseReference(reference, { expectedKind: 'issue' });
  } catch (error) {
    if (error instanceof RemoteTrackerError) {
      fail(error.code, error.message, redact(error.details), error.retryable);
    }
    throw error;
  }
  if (
    parsedReference.repository.slug !== repository.slug ||
    normalizeHost(parsedReference.repository.host) !== repository.host
  ) {
    fail('REFERENCE_REPOSITORY_MISMATCH', `${label} belongs to another repository`, {
      expected: `${repository.host}/${repository.slug}`,
      actual: redact(`${parsedReference.repository.host}/${parsedReference.repository.slug}`),
    });
  }
  return `#${parsedReference.number}`;
}

export function externalLifecycleUrlHasCredentialMaterial(reference, parsed) {
  if (parsed.username || parsed.password) return true;
  const credentialName =
    /auth(?:orization)?|cookie|credential|pass(?:word)?|secret|session|token|api[_-]?key/i;
  for (const name of parsed.searchParams.keys()) {
    if (credentialName.test(name)) return true;
  }
  const rawFragment = parsed.hash.replace(/^#/, '');
  let fragment = rawFragment;
  try {
    fragment = decodeURIComponent(rawFragment);
  } catch {
    // A malformed escape is not credential evidence by itself; the raw fragment is still screened.
  }
  if (credentialName.test(fragment)) return true;
  return redact(reference) !== reference;
}

export function normalizeExternalLifecycleReference(value, label) {
  const reference = lifecycleSafeString(value, label);
  if (/^#?\d+$/.test(reference)) {
    fail('INVALID_REFERENCE', `${label} must not be an ambiguous bare number`, { field: label });
  }
  if (/^https?:\/\//i.test(reference)) {
    let parsed;
    try {
      parsed = new URL(reference);
    } catch {
      fail('INVALID_REFERENCE', `${label} is not a valid external issue URL`, { field: label });
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      externalLifecycleUrlHasCredentialMaterial(reference, parsed)
    ) {
      fail('INVALID_REFERENCE', `${label} must be a credential-free HTTP(S) issue URL`, {
        field: label,
      });
    }
    return reference;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(reference) || /[\s?&=#@]/u.test(reference)) {
    fail('INVALID_REFERENCE', `${label} must be one tool-native identifier or HTTP(S) URL`, {
      field: label,
    });
  }
  return reference;
}

export function normalizeHost(host) {
  return requireString(host, 'host').trim().toLowerCase().replace(/\.$/, '');
}

export function sameRepository(left, right) {
  return (
    normalizeHost(left.host) === normalizeHost(right.host) &&
    left.owner.toLowerCase() === right.owner.toLowerCase() &&
    left.repository.toLowerCase() === right.repository.toLowerCase()
  );
}

export function parseReference(reference, options = {}) {
  const expectedKind = options.expectedKind;
  if (expectedKind && !['issue', 'pull-request'].includes(expectedKind)) {
    fail('INVALID_PAYLOAD', 'expectedKind must be issue or pull-request');
  }

  if (
    typeof reference === 'number' ||
    (typeof reference === 'string' && /^#?\d+$/.test(reference.trim()))
  ) {
    if (!expectedKind) {
      fail('INVALID_REFERENCE', 'a bare reference requires expectedKind', { reference });
    }
    const number = requireNumber(String(reference).replace(/^#/, ''), 'reference');
    return { kind: expectedKind, number, repository: options.repository };
  }

  requireString(reference, 'reference');
  let url;
  try {
    url = new URL(reference);
  } catch {
    fail('INVALID_REFERENCE', 'reference must be a number, #number, or issue/pull-request URL', {
      reference,
    });
  }
  const match = url.pathname.match(/^\/(.+)\/([^/]+)\/(issues|pull|pulls)\/(\d+)\/?$/);
  if (!match)
    fail('INVALID_REFERENCE', 'URL is not an issue or pull-request reference', { reference });
  const kind = match[3] === 'issues' ? 'issue' : 'pull-request';
  if (expectedKind && expectedKind !== kind) {
    fail('INVALID_REFERENCE', `expected ${expectedKind} reference but received ${kind}`, {
      reference,
    });
  }
  const repository = {
    host: normalizeHost(url.hostname),
    owner: decodeURIComponent(match[1]),
    repository: decodeURIComponent(match[2]).replace(/\.git$/i, ''),
  };
  repository.slug = `${repository.owner}/${repository.repository}`;
  if (options.repository && !sameRepository(repository, options.repository)) {
    fail('REFERENCE_REPOSITORY_MISMATCH', 'reference belongs to another repository', {
      expected: options.repository.slug,
      actual: repository.slug,
      host: repository.host,
    });
  }
  return { kind, number: Number(match[4]), repository };
}

export const COMMENT_MARKERS = Object.freeze({
  planning: 'effective-flow-plan-issues',
  apply: 'effective-flow-apply-issues',
  pr: 'effective-flow-iterate',
  'pr-review': 'effective-flow-pr-review',
});

export function commentMarker(kind) {
  if (!Object.hasOwn(COMMENT_MARKERS, kind)) {
    fail(
      'INVALID_PAYLOAD',
      `comment kind must be one of ${Object.keys(COMMENT_MARKERS).join(', ')}`,
      { kind },
    );
  }
  return COMMENT_MARKERS[kind];
}

// Stamps the marker of one kind onto a body as its leading line. Idempotent on purpose: a body
// that already opens with its marker is returned unchanged instead of collecting a second one.
//
// The check is anchored to the start rather than searching the whole body, and that is a
// correctness requirement, not a style choice. A quote-reply body literally contains an earlier
// marker behind a `>` prefix; a containment check would read that as already stamped and publish
// the reply unmarked. Readers likewise only honour a marker that opens a body, because a marker
// anywhere else is quoted text any person can reproduce by pressing quote.
export function stampMarker(marker, content) {
  const text = content.trim();
  return text.startsWith(`<!-- ${marker} -->`) ? text : `<!-- ${marker} -->\n${text}`;
}

export function publishableText(value, field) {
  const text = assertPublishable(value, field);
  if (text.trim() === '') fail('INVALID_PAYLOAD', `${field} must not be empty`, { field });
  return text;
}

// Deliberately not `requireNumber`: that helper guards issue and PR references and therefore
// reports a bad value as INVALID_REFERENCE, while a comment line, a wait bound, or a poll interval
// is payload data whose rejection must stay INVALID_PAYLOAD like every other field of a builder.
export function payloadInteger(value, field) {
  const number =
    typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value;
  if (!Number.isSafeInteger(number) || number <= 0) {
    fail('INVALID_PAYLOAD', `${field} must be a positive integer`, { field, value });
  }
  return number;
}

export function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /token|secret|password|authorization|cookie/i.test(key) ? '[REDACTED]' : redact(item),
      ]),
    );
  }
  if (typeof value !== 'string') return value;
  // Two guards keep the URL-credential pattern linear, because it runs over whatever an issue or
  // pull-request body carried into a command plan — text this repository does not control. Both
  // guard against the same failure: a quantifier handing its match back one character at a time.
  //
  // The lookbehind is the load-bearing one. `[a-z\d+.-]*` is anchored to the start of a run of
  // those characters, so a 128 000-character run offers the engine one start position instead of
  // 128 000. Without it, every position starts a doomed scan that gives the run back character by
  // character, which is O(n) per position and quadratic over the string. It costs no coverage: a
  // scheme cannot begin midway through such a run anyway, so every start it rejects could only
  // have produced a match another start already covers.
  //
  // The second is the absent `(?::[^\s/@]*)?` after the userinfo. That group used to let its `*`
  // re-consume to the end at every backtrack step of the `+` over the same character class. It was
  // redundant — `[^\s/@]+` already accepts the colon between user and password — so dropping it
  // removed the overlap without narrowing anything.
  //
  // Do not bound the scheme instead. A bound is the obvious fix and it is worse on both counts: it
  // still does its bounded amount of work at every position, and it silently stops redacting a
  // scheme longer than the bound whose tail holds no letter to restart from, while `parseRemote`
  // (see its scheme guard) keeps accepting that same string as a URL. The grammar here is
  // deliberately identical to that guard's.
  return value
    .replace(/(?<![a-z\d+.-])([a-z][a-z\d+.-]*:\/\/)[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(/\b(?:gh[opusr]_|github_pat_|gitea_)[A-Za-z0-9_=-]+\b/g, '[REDACTED]')
    .replace(/(Authorization\s*:\s*(?:Bearer|token|Basic)\s+)\S+/gi, '$1[REDACTED]')
    .replace(/([?&](?:access_|refresh_)?token=)[^&\s]+/gi, '$1[REDACTED]');
}

// `gh api` selects the host with `--hostname`, but the porcelain commands the pull-request gate
// needs (`pr view`, `pr checks`, `pr merge`) take the repository as `[HOST/]OWNER/REPO` instead.
// They are used deliberately: watching checks and merging with a head-commit guard have no `gh api`
// equivalent, and a merge state read through the same porcelain stays consistent with them.
export function ghRepoArgs(repository) {
  const slug = `${repository.owner}/${repository.repository}`;
  return ['--repo', repository.host === 'github.com' ? slug : `${repository.host}/${slug}`];
}

export const MERGE_METHOD_FLAGS = Object.freeze({
  squash: '--squash',
  merge: '--merge',
  rebase: '--rebase',
});

export const DEFAULT_CHECKS_WAIT_MINUTES = 20;

export const DEFAULT_CHECKS_INTERVAL_SECONDS = 10;

// Node clamps a `setTimeout` delay above this ceiling to 1 ms. An over-large bound would therefore
// not relax the wait but invert it into an instant, fake timeout — repeated once per gate round —
// so it is rejected rather than accepted and silently reinterpreted.
export const MAX_TIMEOUT_MS = 2_147_483_647;

// `gh pr checks --watch` blocks until the checks finish and has no timeout flag of its own, so the
// caller's bound travels with the plan as `timeoutMs` and the process runner enforces it. Without
// that bound a stuck check would hold a run open indefinitely. `--required` is passed only when the
// caller asks for the required-checks-only criterion; the default watches every check.
export function checksWaitSettings(payload) {
  const timeoutMs =
    payload.timeoutMs === undefined
      ? payloadInteger(
          payload.timeoutMinutes ?? payload.waitMinutes ?? DEFAULT_CHECKS_WAIT_MINUTES,
          'payload.timeoutMinutes',
        ) * 60_000
      : payloadInteger(payload.timeoutMs, 'payload.timeoutMs');
  if (timeoutMs > MAX_TIMEOUT_MS) {
    fail('INVALID_PAYLOAD', 'payload.timeoutMs exceeds the supported timer ceiling', {
      field: 'payload.timeoutMs',
      value: timeoutMs,
      maximum: MAX_TIMEOUT_MS,
    });
  }
  return {
    timeoutMs,
    intervalSeconds: payloadInteger(
      payload.intervalSeconds ?? DEFAULT_CHECKS_INTERVAL_SECONDS,
      'payload.intervalSeconds',
    ),
    requiredOnly: payload.requiredOnly === true,
  };
}

export function mergeMethod(payload) {
  const method = requireString(payload.method ?? payload.mergeMethod, 'payload.method')
    .trim()
    .toLowerCase();
  if (!Object.hasOwn(MERGE_METHOD_FLAGS, method)) {
    fail('INVALID_PAYLOAD', 'payload.method must be squash, merge, or rebase', {
      field: 'payload.method',
      value: method,
      supported: Object.keys(MERGE_METHOD_FLAGS),
    });
  }
  return method;
}

// A repository configured with `squash_merge_commit_title: COMMIT_OR_PR_TITLE` lets GitHub take the
// single commit's subject instead of the pull-request title, so the subject the gate verified and
// the subject that actually gets published can differ — and a squash subject that is not a
// Conventional Commit drops the change from the changelog without a word. Pinning it closes that
// gap. Only a squash carries one here: a rebase creates no commit of its own and a merge commit's
// subject is not the release signal, so a subject supplied for either is a caller mistake rather
// than something to swallow.
export function mergeSubject(payload, method) {
  if (payload.subject === undefined || payload.subject === null) return undefined;
  if (method !== 'squash') {
    fail('INVALID_PAYLOAD', 'payload.subject applies only to a squash merge', {
      field: 'payload.subject',
      method,
    });
  }
  return publishableText(payload.subject, 'payload.subject');
}

// The expected head SHA is the merge guard, so it is validated as a full object name rather than as
// free text: an abbreviated or malformed value can never equal the head the forge reports, and
// rejecting it here keeps that caller error an INVALID_PAYLOAD instead of a late, confusing
// mismatch. Both SHA-1 and SHA-256 object names are accepted.
export function expectedHeadSha(payload) {
  const value = requireString(
    payload.expectedHeadSha ?? payload.headSha,
    'payload.expectedHeadSha',
  ).trim();
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(value)) {
    fail('INVALID_PAYLOAD', 'payload.expectedHeadSha must be a full commit SHA', {
      field: 'payload.expectedHeadSha',
    });
  }
  return value.toLowerCase();
}

export function jsonStdin(payload) {
  return `${JSON.stringify(payload)}\n`;
}

export function issueNumber(input) {
  return requireNumber(input.number ?? input.issue, 'issue number');
}

// `issue-close` takes an issue number and nothing else: the state, and on GitHub its reason, are
// literals of the plan builders. A caller-supplied value is refused rather than dropped. `state`
// is the field that makes this a guard rather than a nicety — it is the wire key on both providers
// and the one a caller reaches for first, so accepting `state: 'open'` and sending `closed` would
// not drop a nuance but silently invert the transition into its opposite. A caller-supplied reason
// is refused for its own reason: this operation only ever transitions an issue that was assessed as
// completed, and Forgejo states no state reason at all, so the field would carry one legal value on
// one provider and none on the other.
//
// Both levels are inspected. The builders read `input.payload ?? input`, so a field set beside a
// `payload` object would otherwise never be looked at — harmless for the plan that is built, but
// this guard is the operation's stated contract and a contract that silently skips half its input
// is not one.
export const ISSUE_CLOSE_REJECTED_FIELDS = Object.freeze([
  'state',
  'reason',
  'stateReason',
  'state_reason',
]);

export function assertNoIssueCloseStateOverride(input) {
  const sources =
    input.payload === undefined
      ? [[input, 'payload']]
      : [
          [input.payload, 'payload'],
          [input, 'input'],
        ];
  for (const [source, label] of sources) {
    if (source === null || typeof source !== 'object') continue;
    for (const field of ISSUE_CLOSE_REJECTED_FIELDS) {
      if (source[field] !== undefined) {
        fail('INVALID_PAYLOAD', 'issue-close takes an issue number and no state or reason field', {
          field: `${label}.${field}`,
        });
      }
    }
  }
}

export function prNumber(input) {
  return requireNumber(input.number ?? input.pullRequest, 'pull-request number');
}

export function mutationPlan(executable, args, stdin, metadata = {}) {
  return { executable, args, ...(stdin === undefined ? {} : { stdin }), ...metadata };
}

// One builder for every Forgejo `tea api` read. `--include` is not a convenience here: `tea api`
// does not use the Gitea SDK and never inspects `resp.StatusCode` — it copies the response body to
// stdout and returns `nil` (`cmd/api.go` `runApi`, `modules/api/client.go` `Client.Do`, identical at
// `main` and `v0.15.1`) — so it exits 0 on every 4xx and 5xx alike. Without the status line a 401,
// 403 or 404 on the combined-status read arrives as a body with no `statuses` key, which is exactly
// the shape "this repository has no CI" has, and an operator told that would wave through a head
// whose checks were never read. The same mechanism yields `X-Total-Count`, which is the only sound
// truncation guard this endpoint offers.
//
// The flag is a transport attestation and nothing more. `head_commit_id` is a request-body field
// and cannot be probed at all, so a server older than the Gitea 1.16 API surface would ignore it
// silently and leave the merge race unguarded — see `mergeHeadGuard`, which closes no race of its
// own.
export function teaApiReadPlan(repository, endpoint) {
  return mutationPlan('tea', [
    'api',
    endpoint,
    '--include',
    '--login',
    repository.login ?? repository.host,
    '--repo',
    repository.slug ?? `${repository.owner}/${repository.repository}`,
  ]);
}

// Forgejo clamps `limit` to `MAX_RESPONSE_ITEMS` (default 50, operator-configurable) and pages at
// 30 when it is omitted, so this value is a request rather than a guarantee. Every raw-API list read
// below therefore pages until the forge stops answering and checks `X-Total-Count` instead of
// comparing what came back against what was asked for.
export const FORGEJO_PAGE_LIMIT = 100;

export function forgejoPagedEndpoint(endpoint, page, limit = FORGEJO_PAGE_LIMIT) {
  const query = new URLSearchParams({ limit: String(limit), page: String(page) });
  return `${endpoint}${endpoint.includes('?') ? '&' : '?'}${query}`;
}

// The two Forgejo list endpoints, built once and shared by the plan builder — which answers with
// page 1 as the preview — and by the reader that pages them. Keeping one builder is what makes the
// preview and the executed request provably the same request.
//
// `type=issues` is mandatory rather than decorative. `ListIssues` defaults `type` to
// `optional.None`, which returns issues **and** pull requests together, and an unrecognized value
// falls through to that same default with no error path — so a port that dropped or misspelled it
// would return a plausible superset that nothing downstream could tell apart. The client-side
// `pull_request` filter is the second line of defence, not the first.
export function forgejoIssueListEndpoint(input, repository) {
  const query = new URLSearchParams({ state: input.state ?? 'all', type: 'issues' });
  // One single-label query per variant, exactly as the renderer path passed. `/issues?labels=`
  // resolves label **names** and means **AND** — `count(*) = len(includedLabelIDs)` — so a
  // multi-label value would intersect rather than union. `labelQueryVariants` exists to express OR
  // across label *spellings* (`effective-flow-fix` ∪ `firmo-fix`), which no endpoint offers by name,
  // and it already emits one single-label query per variant. Nothing about this endpoint obsoletes
  // it, and collapsing its variants into one `labels=` value would silently intersect them.
  if (input.labels?.length) query.set('labels', input.labels.join(','));
  return `repos/${repository.owner}/${repository.repository}/issues?${query}`;
}

// No label filter, and none may be added here. `/pulls?labels=` takes numeric label **IDs** as
// repeated parameters and means OR; a label *name* fails `StringsToInt64s` and the forge answers
// HTTP 500 rather than an empty result. Filtering pull requests by label would need a name-to-ID
// resolution step first.
export function forgejoPullListEndpoint(input, repository) {
  const query = new URLSearchParams({ state: input.state ?? 'open' });
  return `repos/${repository.owner}/${repository.repository}/pulls?${query}`;
}
