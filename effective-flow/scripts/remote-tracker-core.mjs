import { createHash } from 'node:crypto';

export const ERROR_CODES = Object.freeze([
  'NOT_GIT_REPOSITORY',
  'NO_ORIGIN',
  'AMBIGUOUS_HOST',
  'CLI_MISSING',
  'AUTH_FAILED',
  'UNSUPPORTED_CAPABILITY',
  'INVALID_REFERENCE',
  'REFERENCE_REPOSITORY_MISMATCH',
  'INVALID_PAYLOAD',
  'TARGET_NOT_FOUND',
  'AMBIGUOUS_TARGET',
  'STALE_WRITE',
  'COMMAND_FAILED',
]);

const MUTATIONS = new Set([
  'label-create',
  'issue-create',
  'issue-sub-issue-create',
  'issue-update-body',
  'issue-close',
  'issue-comment',
  'issue-comment-update',
  'issue-labels',
  'issue-label-add',
  'issue-label-remove',
  'sf-label-migrate',
  'pr-create',
  'pr-update-body',
  'pr-comment',
  'pr-merge',
  'review-create',
  'review-thread-reply',
  'review-thread-resolve',
]);

const REMOTE_OPERATIONS = new Set([
  'repository-resolve',
  'probe',
  'viewer-read',
  'label-create',
  'issue-read',
  'issue-state-wait',
  'issue-comments-read',
  'issue-list',
  'issue-create',
  'issue-sub-issues-read',
  'issue-sub-issue-create',
  'issue-update-body',
  'issue-close',
  'issue-comment',
  'issue-comment-update',
  'issue-labels',
  'issue-label-add',
  'issue-label-remove',
  'sf-label-migrate',
  'pr-read',
  'pr-comments-read',
  'pr-reviews-read',
  'pr-list',
  'pr-status-read',
  'pr-checks-wait',
  'pr-create',
  'pr-update-body',
  'pr-comment',
  'pr-merge',
  'review-create',
  'review-threads-read',
  'review-thread-reply',
  'review-thread-resolve',
]);

const CAPABILITY_BY_OPERATION = Object.freeze({
  'viewer-read': 'viewerRead',
  'label-create': 'labelCreate',
  'issue-read': 'issueRead',
  'issue-state-wait': 'issueRead',
  'issue-comments-read': 'issueCommentsRead',
  'issue-list': 'issueList',
  'issue-create': 'issueCreate',
  'issue-sub-issues-read': 'issueSubIssuesRead',
  'issue-sub-issue-create': 'issueSubIssueCreate',
  'issue-update-body': 'issueUpdate',
  'issue-close': 'issueClose',
  'issue-comment': 'issueComment',
  'issue-comment-update': 'issueCommentUpdate',
  'issue-labels': 'issueLabelAdd',
  'issue-label-add': 'issueLabelAdd',
  'issue-label-remove': 'issueLabelRemove',
  'sf-label-migrate': 'labelMigration',
  'pr-read': 'pullRequestRead',
  'pr-comments-read': 'prCommentsRead',
  // A named entry, never an absent one. The operation gate tests `capabilities[key] === false`, so
  // an operation missing from this table is waved through unprobed on every provider — which for a
  // read the merge gate treats as a merge precondition would report "no reviewer requested changes"
  // on a forge that never answered the question.
  'pr-reviews-read': 'prReviewsRead',
  'pr-list': 'pullRequestList',
  'pr-status-read': 'pullRequestStatus',
  'pr-checks-wait': 'pullRequestChecksWait',
  'pr-create': 'pullRequestCreate',
  'pr-update-body': 'pullRequestUpdate',
  'pr-comment': 'prComment',
  'pr-merge': 'pullRequestMerge',
  'review-create': 'reviewCreate',
  'review-threads-read': 'reviewThreads',
  'review-thread-reply': 'reviewThreadReplies',
  'review-thread-resolve': 'reviewThreadResolution',
});

export class RemoteTrackerError extends Error {
  constructor(code, message, details = {}, retryable = false) {
    super(message);
    this.name = 'RemoteTrackerError';
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }
}

function fail(code, message, details = {}, retryable = false) {
  throw new RemoteTrackerError(code, message, details, retryable);
}

function assertPublishable(text, field) {
  const value = requireString(text, field, { allowEmpty: true });
  if (/Generated with (?:Claude Code|Codex)|claude\.ai\/code|Co-Authored-By:/i.test(value)) {
    fail('INVALID_PAYLOAD', `${field} contains prohibited generation attribution`, { field });
  }
  return value;
}

function requireObject(value, label = 'input') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_PAYLOAD', `${label} must be a JSON object`);
  }
  return value;
}

function requireString(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.trim() === '')) {
    fail('INVALID_PAYLOAD', `${label} must be ${allowEmpty ? 'a' : 'a non-empty'} string`, {
      field: label,
    });
  }
  return value;
}

function requireNumber(value, label) {
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(number) || number <= 0) {
    fail('INVALID_REFERENCE', `${label} must be a positive integer`, { field: label });
  }
  return number;
}

const REVIEW_BODY_LANGUAGE = Object.freeze({
  en: Object.freeze({
    findingFields: Object.freeze({
      severity: 'Severity',
      complexity: 'Complexity',
      area: 'Area',
      file: 'File',
      problem: 'Problem',
      recommendation: 'Recommendation',
      promptSuggestion: 'Prompt suggestion',
    }),
    severity: Object.freeze({ Critical: 'Critical', Important: 'Important', Note: 'Note' }),
    complexity: Object.freeze({ Low: 'Low', Medium: 'Medium', High: 'High' }),
    epicTitle: 'Code review',
    epicLead: (date, scope, projectType) =>
      `Code review of ${date} · Scope: ${scope} · Project type: ${projectType}`,
    findingsHeading: 'Findings',
    skippedHeading: 'Skipped (design decisions)',
    coveredBy: 'covered by',
  }),
  de: Object.freeze({
    findingFields: Object.freeze({
      severity: 'Schweregrad',
      complexity: 'Komplexität',
      area: 'Bereich',
      file: 'Datei',
      problem: 'Problem',
      recommendation: 'Empfehlung',
      promptSuggestion: 'Prompt-Vorschlag',
    }),
    severity: Object.freeze({ Critical: 'Kritisch', Important: 'Wichtig', Note: 'Hinweis' }),
    complexity: Object.freeze({ Low: 'Niedrig', Medium: 'Mittel', High: 'Hoch' }),
    epicTitle: 'Code-Review',
    epicLead: (date, scope, projectType) =>
      `Code-Review vom ${date} · Umfang: ${scope} · Projekttyp: ${projectType}`,
    findingsHeading: 'Befunde',
    skippedHeading: 'Übersprungen (Architekturentscheidungen)',
    coveredBy: 'abgedeckt durch',
  }),
});

function reviewBodyLanguage(value = 'en') {
  if (!Object.hasOwn(REVIEW_BODY_LANGUAGE, value)) {
    fail('INVALID_PAYLOAD', 'language must be en or de', { field: 'language', value });
  }
  return { language: value, strings: REVIEW_BODY_LANGUAGE[value] };
}

export function bodyHash(body) {
  return createHash('sha256')
    .update(requireString(body, 'body', { allowEmpty: true }))
    .digest('hex');
}

export const ISSUE_LIFECYCLE_RECEIPT_PREFIX = 'effective-flow-issue-lifecycle';
export const ISSUE_LIFECYCLE_RECEIPT_VERSION = 'v1';
export const ISSUE_STATE_READ_TIMEOUT_MS = 30_000;
export const ISSUE_STATE_WAIT_MS = 30_000;

const ISSUE_LIFECYCLE_TARGETS = new Set(['forge', 'external']);
const ISSUE_LIFECYCLE_RELATIONSHIPS = new Set(['closes', 'refs']);
const ISSUE_LIFECYCLE_CONTAINER_MECHANISMS = new Set(['native', 'checklist']);
const ISSUE_LIFECYCLE_RECEIPT_KEYS = Object.freeze([
  'target',
  'repository',
  'externalTool',
  'items',
]);
const ISSUE_LIFECYCLE_ITEM_KEYS = Object.freeze([
  'issue',
  'relationship',
  'container',
  'containerMechanism',
]);

function exactObjectKeys(value, expected, label) {
  requireObject(value, label);
  const keys = Object.keys(value);
  if (keys.length !== expected.length || keys.some((key) => !expected.includes(key))) {
    fail('INVALID_PAYLOAD', `${label} must contain exactly ${expected.join(', ')}`, {
      field: label,
      keys,
    });
  }
}

function lifecycleSafeString(value, label, { nullable = false } = {}) {
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

function lifecycleExternalTool(value, label) {
  const identifier = requireString(value, label);
  if (
    identifier.length > 64 ||
    !/^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u.test(identifier) ||
    redact(identifier) !== identifier
  ) {
    fail('INVALID_PAYLOAD', `${label} must be a short stable external-tool identifier`, {
      field: label,
      maximum: 64,
    });
  }
  return identifier;
}

function lifecycleRepository(value) {
  const repository = lifecycleSafeString(value, 'receipt.repository');
  if (!/^[^\s/@]+(?:\/[^\s/@]+)+$/u.test(repository)) {
    fail('INVALID_PAYLOAD', 'receipt.repository must be an owner/repository slug', {
      field: 'receipt.repository',
    });
  }
  return repository;
}

function lifecycleRepositoryBinding(context = {}) {
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

function normalizeForgeLifecycleReference(value, label, repository) {
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

function externalLifecycleUrlHasCredentialMaterial(reference, parsed) {
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

function normalizeExternalLifecycleReference(value, label) {
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

function normalizeLifecycleItem(item, target, repository, index) {
  const label = `receipt.items[${index}]`;
  exactObjectKeys(item, ISSUE_LIFECYCLE_ITEM_KEYS, label);
  const normalizeReference =
    target === 'forge' ? normalizeForgeLifecycleReference : normalizeExternalLifecycleReference;
  const issue = normalizeReference(item.issue, `${label}.issue`, repository);
  const relationship = lifecycleSafeString(item.relationship, `${label}.relationship`);
  if (!ISSUE_LIFECYCLE_RELATIONSHIPS.has(relationship)) {
    fail('INVALID_PAYLOAD', `${label}.relationship must be closes or refs`, {
      field: `${label}.relationship`,
    });
  }
  if (target === 'external' && relationship !== 'refs') {
    fail('INVALID_PAYLOAD', `${label}.relationship must be refs for an external target`, {
      field: `${label}.relationship`,
      target,
    });
  }
  const container =
    item.container === null
      ? null
      : normalizeReference(item.container, `${label}.container`, repository);
  const containerMechanism =
    item.containerMechanism === null
      ? null
      : lifecycleSafeString(item.containerMechanism, `${label}.containerMechanism`);
  if (
    containerMechanism !== null &&
    !ISSUE_LIFECYCLE_CONTAINER_MECHANISMS.has(containerMechanism)
  ) {
    fail('INVALID_PAYLOAD', `${label}.containerMechanism must be native, checklist, or null`, {
      field: `${label}.containerMechanism`,
    });
  }
  if ((container === null) !== (containerMechanism === null)) {
    fail('INVALID_PAYLOAD', `${label}.container and containerMechanism must both be null or set`, {
      field: label,
    });
  }
  return { issue, relationship, container, containerMechanism };
}

function normalizeIssueLifecycleReceipt(value, context = {}) {
  exactObjectKeys(value, ISSUE_LIFECYCLE_RECEIPT_KEYS, 'receipt');
  const target = lifecycleSafeString(value.target, 'receipt.target');
  if (!ISSUE_LIFECYCLE_TARGETS.has(target)) {
    fail('INVALID_PAYLOAD', 'receipt.target must be forge or external', {
      field: 'receipt.target',
    });
  }
  const expectedTarget = context.expectedTarget ?? context.target;
  if (expectedTarget !== undefined && target !== expectedTarget) {
    fail('INVALID_PAYLOAD', 'receipt target does not match the resolved tracker target', {
      expectedTarget,
      actualTarget: target,
    });
  }

  let repository = null;
  let repositoryBinding;
  let externalTool = null;
  if (target === 'forge') {
    repository = lifecycleRepository(value.repository);
    if (value.externalTool !== null) {
      fail('INVALID_PAYLOAD', 'a forge receipt must set externalTool to null', {
        field: 'receipt.externalTool',
      });
    }
    repositoryBinding = lifecycleRepositoryBinding(context) ?? { slug: repository };
    if (repository !== repositoryBinding.slug) {
      fail('REFERENCE_REPOSITORY_MISMATCH', 'receipt belongs to another repository', {
        expected: repositoryBinding.slug,
        actual: repository,
      });
    }
  } else {
    if (value.repository !== null) {
      fail('INVALID_PAYLOAD', 'an external receipt must set repository to null', {
        field: 'receipt.repository',
      });
    }
    externalTool = lifecycleExternalTool(value.externalTool, 'receipt.externalTool');
    const configuredExternalTool = context.expectedExternalTool ?? context.externalTool;
    const expectedExternalTool =
      configuredExternalTool === undefined
        ? undefined
        : lifecycleExternalTool(configuredExternalTool, 'tracker.externalTool');
    if (expectedExternalTool !== undefined && externalTool !== expectedExternalTool) {
      fail('INVALID_PAYLOAD', 'receipt externalTool does not match tracker configuration', {
        field: 'receipt.externalTool',
        configuredField: 'tracker.externalTool',
      });
    }
  }

  if (!Array.isArray(value.items) || value.items.length === 0) {
    fail('INVALID_PAYLOAD', 'receipt.items must be a non-empty array', {
      field: 'receipt.items',
    });
  }
  const items = [];
  const byIssue = new Map();
  for (const [index, rawItem] of value.items.entries()) {
    const item = normalizeLifecycleItem(rawItem, target, repositoryBinding, index);
    const prior = byIssue.get(item.issue);
    if (prior !== undefined) {
      if (JSON.stringify(prior) !== JSON.stringify(item)) {
        fail('INVALID_PAYLOAD', 'duplicate receipt issue carries conflicting lifecycle data', {
          issue: item.issue,
        });
      }
      continue;
    }
    byIssue.set(item.issue, item);
    items.push(item);
  }
  return { target, repository, externalTool, items };
}

function lifecycleReceiptMarker(receipt) {
  return `<!-- ${ISSUE_LIFECYCLE_RECEIPT_PREFIX}:${ISSUE_LIFECYCLE_RECEIPT_VERSION} ${JSON.stringify(receipt)} -->`;
}

export function parseIssueLifecycleReceipt(body, context = {}) {
  const text = requireString(body, 'body', { allowEmpty: true });
  const prefix = `<!-- ${ISSUE_LIFECYCLE_RECEIPT_PREFIX}:`;
  const starts = text.split(prefix).length - 1;
  if (starts === 0) return { found: false, receipt: null };
  if (starts !== 1) {
    fail('INVALID_PAYLOAD', 'pull-request body contains multiple issue lifecycle receipts', {
      count: starts,
    });
  }
  const lines = text.split(/\r?\n/).filter((line) => line.includes(prefix));
  if (lines.length !== 1 || lines[0].trim() !== lines[0]) {
    fail('INVALID_PAYLOAD', 'issue lifecycle receipt must occupy exactly one complete line');
  }
  const match = lines[0].match(/^<!-- effective-flow-issue-lifecycle:([^\s]+) (\{.*\}) -->$/);
  if (!match) fail('INVALID_PAYLOAD', 'issue lifecycle receipt is malformed');
  if (match[1] !== ISSUE_LIFECYCLE_RECEIPT_VERSION) {
    fail('INVALID_PAYLOAD', 'issue lifecycle receipt version is unsupported', {
      version: match[1],
      supported: [ISSUE_LIFECYCLE_RECEIPT_VERSION],
    });
  }
  let raw;
  try {
    raw = JSON.parse(match[2]);
  } catch {
    fail('INVALID_PAYLOAD', 'issue lifecycle receipt contains malformed JSON');
  }
  const receipt = normalizeIssueLifecycleReceipt(raw, context);
  return { found: true, version: ISSUE_LIFECYCLE_RECEIPT_VERSION, receipt };
}

export function buildIssueLifecycleReceipt(input, context = {}) {
  requireObject(input, 'input');
  const proposed = normalizeIssueLifecycleReceipt(input.receipt ?? input, context);
  if (input.body === undefined) {
    return { receipt: proposed, marker: lifecycleReceiptMarker(proposed) };
  }

  const body = requireString(input.body, 'body', { allowEmpty: true });
  const existing = parseIssueLifecycleReceipt(body, context);
  if (existing.found) {
    for (const field of ['target', 'repository', 'externalTool']) {
      if (existing.receipt[field] !== proposed[field]) {
        fail(
          'INVALID_PAYLOAD',
          'pull-request body contains a lifecycle receipt for another target',
          {
            field: `receipt.${field}`,
            existing: existing.receipt[field],
            proposed: proposed[field],
          },
        );
      }
    }
    const receipt = normalizeIssueLifecycleReceipt(
      { ...proposed, items: [...existing.receipt.items, ...proposed.items] },
      context,
    );
    const marker = lifecycleReceiptMarker(receipt);
    const existingLine = body
      .split(/\r?\n/)
      .find((line) => line.startsWith(`<!-- ${ISSUE_LIFECYCLE_RECEIPT_PREFIX}:`));
    const updatedBody = body.replace(existingLine, marker);
    return { receipt, marker, body: updatedBody, changed: updatedBody !== body };
  }
  const receipt = proposed;
  const marker = lifecycleReceiptMarker(receipt);
  const newline = body.includes('\r\n') ? '\r\n' : '\n';
  const separator = body === '' || body.endsWith('\n') ? '' : newline;
  const updatedBody = `${body}${separator}${marker}`;
  return { receipt, marker, body: updatedBody, changed: updatedBody !== body };
}

function normalizeHost(host) {
  return requireString(host, 'host').trim().toLowerCase().replace(/\.$/, '');
}

function normalizeProvider(provider) {
  if (provider === 'github' || provider === 'forgejo') return provider;
  if (provider === undefined || provider === null || provider === '' || provider === 'auto') {
    return undefined;
  }
  fail('INVALID_PAYLOAD', 'provider override must be github, forgejo, or auto', { provider });
}

function teaLoginHost(login) {
  const candidate = typeof login === 'string' ? login : (login?.url ?? login?.host ?? login?.name);
  if (typeof candidate !== 'string' || candidate.trim() === '') return undefined;
  try {
    return normalizeHost(
      new URL(candidate.includes('://') ? candidate : `https://${candidate}`).host,
    );
  } catch {
    return normalizeHost(candidate);
  }
}

function matchingTeaLogin(logins = [], host) {
  if (!Array.isArray(logins)) fail('INVALID_PAYLOAD', 'teaLogins must be an array');
  for (const login of logins) {
    if (teaLoginHost(login) !== normalizeHost(host)) continue;
    const name = typeof login === 'string' ? host : (login.name ?? login.login ?? host);
    return { host: normalizeHost(host), name: requireString(name, 'tea login name') };
  }
  return undefined;
}

function teaLoginHosts(logins = []) {
  if (!Array.isArray(logins)) fail('INVALID_PAYLOAD', 'teaLogins must be an array');
  return new Set(logins.map(teaLoginHost).filter(Boolean));
}

export function parseRemote(remote, options = {}) {
  requireString(remote, 'remote');
  let host;
  let path;
  try {
    // A failure below funnels this raw string into the error envelope, where `redact` is the only
    // thing between its userinfo and the caller. The two scheme grammars are therefore meant to
    // stay identical — anything accepted as a URL here must be redactable there. Narrowing either
    // one alone reopens that gap.
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(remote)) {
      const parsed = new URL(remote);
      host = parsed.hostname;
      path = parsed.pathname;
    } else {
      const scp = remote.match(/^(?:[^@/:]+@)?([^/:]+):(.+)$/);
      if (!scp) fail('INVALID_REFERENCE', 'origin remote is not a supported Git URL', { remote });
      host = scp[1];
      path = scp[2];
    }
  } catch (error) {
    if (error instanceof RemoteTrackerError) throw error;
    fail('INVALID_REFERENCE', 'origin remote is not a supported Git URL', { remote });
  }

  const segments = path
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.git$/i, '')
    .split('/')
    .map((part) => decodeURIComponent(part))
    .filter(Boolean);
  if (segments.length < 2) {
    fail('INVALID_REFERENCE', 'origin remote must contain an owner and repository', { remote });
  }
  const repository = segments.at(-1);
  const owner = segments.slice(0, -1).join('/');
  const normalized = {
    host: normalizeHost(host),
    owner,
    repository,
    slug: `${owner}/${repository}`,
  };

  const override = normalizeProvider(options.provider ?? options.remoteToolOverride);
  if (override) return { ...normalized, provider: override };
  if (normalized.host === 'github.com') return { ...normalized, provider: 'github' };
  const login = matchingTeaLogin(options.teaLogins, normalized.host);
  if (login) {
    return { ...normalized, provider: 'forgejo', login: login.name };
  }
  fail('AMBIGUOUS_HOST', 'remote host cannot be classified without an explicit provider', {
    host: normalized.host,
    supportedOverrides: ['github', 'forgejo'],
  });
}

function sameRepository(left, right) {
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

export function parseReferences(references, options = {}) {
  const values = Array.isArray(references)
    ? references
    : typeof references === 'string'
      ? references.split(/[\s,]+/).filter(Boolean)
      : [references];
  if (values.length === 0) fail('INVALID_REFERENCE', 'at least one reference is required');
  return values.map((reference) => parseReference(reference, options));
}

export function normalizeSignature(signature) {
  return requireString(signature, 'signature')
    .normalize('NFKC')
    .replace(/\s*[·•]\s*/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function bodyFieldValues(body, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const values = [];
  for (const line of requireString(body, 'body', { allowEmpty: true }).split(/\r?\n/)) {
    const match = line.match(/^\s*-?\s*\*\*([^*]+)\*\*\s*:\s*(.*?)\s*(?:<!--.*-->)?\s*$/);
    if (match && wanted.has(match[1].trim().toLowerCase())) values.push(match[2].trim());
  }
  return values;
}

export function parseFindingSignature(body) {
  const canonical = bodyFieldValues(body, ['Signature']);
  const legacy = bodyFieldValues(body, ['Signatur']);
  const values = [...canonical, ...legacy];
  if (values.length === 0) return undefined;
  const normalized = new Set(values.map(normalizeSignature));
  if (normalized.size > 1) {
    fail('INVALID_PAYLOAD', 'finding body contains conflicting Signature/Signatur fields', {
      fields: values,
    });
  }
  return { value: values[0], normalized: [...normalized][0], legacy: canonical.length === 0 };
}

function validateFinding(input) {
  requireObject(input, 'finding');
  const allowedSeverity = new Set(['Critical', 'Important', 'Note']);
  const allowedComplexity = new Set(['Low', 'Medium', 'High']);
  const allowedAction = new Set([
    'effective-flow-fix',
    'effective-flow-refactor',
    'effective-flow-build',
    'effective-flow-docs',
  ]);
  for (const field of ['title', 'area', 'file', 'problem', 'recommendation', 'promptSuggestion']) {
    requireString(input[field], `finding.${field}`);
  }
  if (!allowedSeverity.has(input.severity)) fail('INVALID_PAYLOAD', 'invalid finding severity');
  if (!allowedComplexity.has(input.complexity))
    fail('INVALID_PAYLOAD', 'invalid finding complexity');
  if (!allowedAction.has(input.action)) fail('INVALID_PAYLOAD', 'invalid finding action');
  return input;
}

export function buildFindingPayload(input, options = {}) {
  const finding = validateFinding(input);
  const { strings } = reviewBodyLanguage(options.language ?? finding.language);
  requireString(finding.id, 'finding.id');
  if (!/^R-\d{7}$/.test(finding.id)) fail('INVALID_PAYLOAD', 'finding.id must match R-XXXXXXX');
  const signature = finding.signature ?? `${finding.file} · ${finding.area} · ${finding.problem}`;
  const body = [
    `- **${strings.findingFields.severity}**: ${strings.severity[finding.severity]}`,
    `- **${strings.findingFields.complexity}**: ${strings.complexity[finding.complexity]}`,
    `- **${strings.findingFields.area}**: ${finding.area}`,
    `- **${strings.findingFields.file}**: ${finding.file}`,
    `- **${strings.findingFields.problem}**: ${assertPublishable(finding.problem, 'finding.problem')}`,
    `- **${strings.findingFields.recommendation}**: ${finding.recommendation}`,
    `- **Action**: ${finding.action}`,
    `- **${strings.findingFields.promptSuggestion}**: ${finding.promptSuggestion}`,
    `- **Epic**: ${finding.epic ? `#${requireNumber(finding.epic, 'finding.epic')}` : ''}`,
    `- **Signature**: ${signature}`,
  ].join('\n');
  return {
    title: `[${finding.id}] ${finding.title}`,
    body,
    labels: ['effective-flow-review-finding', finding.action, finding.severity.toLowerCase()],
    signature,
    normalizedSignature: normalizeSignature(signature),
  };
}

const COMMENT_MARKERS = Object.freeze({
  planning: 'effective-flow-plan-issues',
  apply: 'effective-flow-apply-issues',
  pr: 'effective-flow-iterate',
  'pr-review': 'effective-flow-pr-review',
});

function commentMarker(kind) {
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
function stampMarker(marker, content) {
  const text = content.trim();
  return text.startsWith(`<!-- ${marker} -->`) ? text : `<!-- ${marker} -->\n${text}`;
}

function publishableText(value, field) {
  const text = assertPublishable(value, field);
  if (text.trim() === '') fail('INVALID_PAYLOAD', `${field} must not be empty`, { field });
  return text;
}

export function buildCommentPayload(kind, input) {
  const marker = commentMarker(kind);
  requireObject(input, 'comment');
  const content = publishableText(input.body, 'comment.body');
  const body = stampMarker(marker, content);
  if (kind === 'planning') {
    const decomposition = parseDecompositionRecords(body);
    if (decomposition.found) {
      assertGithubDecompositionCommentSize(
        body,
        decomposition.context,
        decomposition.records,
        'comment.body',
      );
    }
  }
  return { kind, marker, body };
}

// A thread reply is an `iterate` write, so it carries the same marker as that direction's summary
// comment. It is stamped here rather than left to the caller because the marker contract states
// that these markers are never written by hand: the merge gate's guard matches them as exact
// strings, and a caller that forgot the stamp — or reworded it — produced a reply the guard later
// read as a human's, blocking the merge on this tool's own output.
function buildThreadReplyBody(payload) {
  const marker = commentMarker('pr');
  return stampMarker(marker, publishableText(payload.body, 'payload.body'));
}

const REVIEW_EVENTS = Object.freeze(['COMMENT']);
const REVIEW_SIDES = Object.freeze(['LEFT', 'RIGHT']);

// Deliberately not `requireNumber`: that helper guards issue and PR references and therefore
// reports a bad value as INVALID_REFERENCE, while a comment line, a wait bound, or a poll interval
// is payload data whose rejection must stay INVALID_PAYLOAD like every other field of a builder.
function payloadInteger(value, field) {
  const number =
    typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : value;
  if (!Number.isSafeInteger(number) || number <= 0) {
    fail('INVALID_PAYLOAD', `${field} must be a positive integer`, { field, value });
  }
  return number;
}

function reviewCommentSide(value, field) {
  const side =
    value === undefined || value === null
      ? 'RIGHT'
      : requireString(value, field).trim().toUpperCase();
  if (!REVIEW_SIDES.includes(side)) {
    fail('INVALID_PAYLOAD', `${field} must be LEFT or RIGHT`, {
      field,
      value,
      supported: [...REVIEW_SIDES],
    });
  }
  return side;
}

// Builds the provider-neutral payload for one pull-request review carrying inline comments.
// The event is pinned to the neutral comment event: this operation never approves a pull
// request and never requests changes, so any other event value is rejected here instead of
// being forwarded to the provider. Every input is validated before a request is planned, so
// an invalid comment fails closed with the same structured error shape as every other payload.
// The review body is mandatory and the comment array is optional: the publication contract
// requires body-only submissions — a short summary when nothing was found, and a finding on a
// line outside the diff that must not be anchored onto a wrong line — while a submission
// without body text carries nothing to publish and would be rejected by the provider anyway.
// Body and comment bodies are stamped with the `pr-review` marker from the marker table, so no
// caller has to hand-write it and repeat suppression cannot be defeated by a reworded marker.
export function buildReviewPayload(input) {
  requireObject(input, 'payload');
  const event =
    input.event === undefined || input.event === null
      ? 'COMMENT'
      : requireString(input.event, 'payload.event').trim().toUpperCase();
  if (!REVIEW_EVENTS.includes(event)) {
    fail('INVALID_PAYLOAD', 'payload.event must be COMMENT', {
      field: 'payload.event',
      value: input.event,
      supported: [...REVIEW_EVENTS],
    });
  }
  const marker = commentMarker('pr-review');
  const body = stampMarker(marker, publishableText(input.body, 'payload.body'));
  const comments = input.comments ?? [];
  if (!Array.isArray(comments)) {
    fail('INVALID_PAYLOAD', 'payload.comments must be an array', {
      field: 'payload.comments',
    });
  }
  return {
    body,
    event,
    comments: comments.map((comment, index) => {
      const field = `payload.comments[${index}]`;
      requireObject(comment, field);
      return {
        path: requireString(comment.path, `${field}.path`),
        line: payloadInteger(comment.line, `${field}.line`),
        side: reviewCommentSide(comment.side, `${field}.side`),
        body: stampMarker(marker, publishableText(comment.body, `${field}.body`)),
      };
    }),
  };
}

export function buildSkippedFindingEntry(input, options = {}) {
  requireObject(input, 'skippedFinding');
  const { strings } = reviewBodyLanguage(options.language ?? input.language);
  const title = assertPublishable(input.title, 'skippedFinding.title');
  const signature = assertPublishable(input.signature, 'skippedFinding.signature');
  const decisionReference = assertPublishable(
    input.decisionReference,
    'skippedFinding.decisionReference',
  );
  if (input.id !== undefined || input.issue !== undefined) {
    fail('INVALID_PAYLOAD', 'design-decision-skipped findings must not carry an issue or R-ID');
  }
  return {
    title,
    signature,
    normalizedSignature: normalizeSignature(signature),
    decisionReference,
    line: `- ${title} — Signature: ${signature} — ${strings.coveredBy} ${decisionReference}`,
  };
}

export function buildEpicPayload(input, options = {}) {
  requireObject(input, 'epic');
  const { language, strings } = reviewBodyLanguage(options.language ?? input.language);
  const date = requireString(input.date, 'epic.date');
  const scope = requireString(input.scope, 'epic.scope');
  const projectType = requireString(input.projectType, 'epic.projectType');
  const findings = Array.isArray(input.findings) ? input.findings : [];
  const skipped = Array.isArray(input.skipped)
    ? input.skipped.map((item) => buildSkippedFindingEntry(item, { language }))
    : [];
  const findingLines = findings.map((finding, index) => {
    requireObject(finding, `epic.findings[${index}]`);
    const number = requireNumber(finding.number, `epic.findings[${index}].number`);
    const id = requireString(finding.id, `epic.findings[${index}].id`);
    if (!/^R-\d{7}$/.test(id)) fail('INVALID_PAYLOAD', 'epic finding IDs must match R-XXXXXXX');
    return `- [ ] #${number} [${id}] ${requireString(finding.title, 'finding.title')} — Action: ${requireString(finding.action, 'finding.action')}`;
  });
  const lines = [
    strings.epicLead(date, scope, projectType),
    '',
    `## ${strings.findingsHeading}`,
    '',
    ...findingLines,
  ];
  if (skipped.length > 0)
    lines.push('', `## ${strings.skippedHeading}`, '', ...skipped.map((item) => item.line));
  return {
    title: `${strings.epicTitle} ${date}${input.suffix ?? ''}`,
    body: lines.join('\n'),
    labels: ['effective-flow-review-epic'],
    lastFindingNumber: input.lastFindingNumber,
    skipped,
  };
}

export function deduplicateFindings(existingIssues, findings) {
  if (!Array.isArray(existingIssues) || !Array.isArray(findings)) {
    fail('INVALID_PAYLOAD', 'existingIssues and findings must be arrays');
  }
  const issuesByNumber = new Map();
  for (const issue of existingIssues) {
    requireObject(issue, 'existing issue');
    const number = requireNumber(issue.number, 'existing issue number');
    if (!issuesByNumber.has(number)) issuesByNumber.set(number, issue);
  }
  const signatures = new Map();
  for (const issue of issuesByNumber.values()) {
    const parsed = parseFindingSignature(issue.body ?? '');
    if (parsed && !signatures.has(parsed.normalized)) signatures.set(parsed.normalized, issue);
  }
  const duplicate = [];
  const fresh = [];
  for (const finding of findings) {
    const signature = normalizeSignature(finding.signature);
    const issue = signatures.get(signature);
    if (issue) duplicate.push({ finding, issueNumber: issue.number });
    else fresh.push(finding);
  }
  return { existingIssues: [...issuesByNumber.values()], duplicate, fresh };
}

export function labelQueryVariants(labels) {
  if (!Array.isArray(labels)) fail('INVALID_PAYLOAD', 'labels must be an array');
  const variants = [];
  for (const label of labels) {
    requireString(label, 'label');
    const prefixVariants = label.startsWith('effective-flow-')
      ? [label, label.replace(/^effective-flow-/, 'firmo-')]
      : [label];
    const severityVariants =
      label === 'critical'
        ? ['critical', 'kritisch']
        : label === 'important'
          ? ['important', 'wichtig']
          : label === 'note'
            ? ['note', 'hinweis']
            : prefixVariants;
    for (const value of severityVariants) if (!variants.includes(value)) variants.push(value);
  }
  return variants.map((label) => [label]);
}

export function planSfLabelMigration(issues, marker = {}) {
  if (marker?.done === true) return { skipped: true, steps: [], marker };
  if (!Array.isArray(issues)) fail('INVALID_PAYLOAD', 'issues must be an array');
  const steps = [];
  for (const issue of issues) {
    const number = requireNumber(issue.number, 'issue.number');
    const labels = Array.isArray(issue.labels) ? issue.labels : [];
    // Deduplicated per issue, because an issue can genuinely carry the same legacy label more than
    // once: labels are attached by name, so a repository that accumulated duplicate label objects
    // hands back one entry per copy. Each copy would otherwise emit its own add/remove pair — the
    // add is idempotent and the remove detaches the name outright, so every pair after the first is
    // a redundant round trip, and a failure among them reports a partial migration of work that was
    // already complete. The same label on two different issues stays two pairs; that is not a
    // duplicate.
    const migrated = new Set();
    for (const label of labels) {
      if (
        !/^sf-(review-finding|review-epic|fix|refactor|build|docs|issue-done|needs-planning)$/.test(
          label,
        )
      )
        continue;
      if (migrated.has(label)) continue;
      migrated.add(label);
      const current = label.replace(/^sf-/, 'effective-flow-');
      steps.push({ operation: 'add', issue: number, label: current });
      steps.push({ operation: 'remove', issue: number, label });
    }
  }
  return {
    skipped: false,
    steps,
    marker: { ...marker, done: false },
    completionMarker: { ...marker, done: true },
  };
}

function findExactlyOne(lines, predicate, target) {
  const matches = [];
  lines.forEach((line, index) => {
    if (predicate(line)) matches.push(index);
  });
  if (matches.length === 0)
    fail('TARGET_NOT_FOUND', `semantic target not found: ${target}`, { target });
  if (matches.length > 1) {
    fail('AMBIGUOUS_TARGET', `semantic target matched more than once: ${target}`, {
      target,
      matches: matches.length,
    });
  }
  return matches[0];
}

export function patchMarkedBlock(body, input) {
  requireObject(input, 'patch');
  const marker = requireString(input.marker, 'patch.marker')
    .replace(/^<!--\s*|\s*-->$/g, '')
    .trim();
  const replacement = requireString(input.replacement, 'patch.replacement', { allowEmpty: true });
  const lines = requireString(body, 'body', { allowEmpty: true }).split(/\r?\n/);
  const start = findExactlyOne(lines, (line) => line.trim() === `<!-- ${marker} -->`, marker);
  const explicitEnd = lines.findIndex(
    (line, index) => index > start && line.trim() === `<!-- /${marker} -->`,
  );
  const nextMarker = lines.findIndex(
    (line, index) => index > start && /^<!--\s*[^/][^>]*-->\s*$/.test(line.trim()),
  );
  const end = explicitEnd >= 0 ? explicitEnd + 1 : nextMarker >= 0 ? nextMarker : lines.length;
  const replacementLines = [`<!-- ${marker} -->`, ...replacement.split(/\r?\n/)];
  if (explicitEnd >= 0) replacementLines.push(`<!-- /${marker} -->`);
  const updated = [...lines.slice(0, start), ...replacementLines, ...lines.slice(end)].join('\n');
  return { body: updated, changed: updated !== body, matched: 1 };
}

export function patchChecklistEntry(body, input) {
  requireObject(input, 'patch');
  const reference = requireString(input.reference, 'patch.reference');
  const checked = input.checked !== false;
  const lines = requireString(body, 'body', { allowEmpty: true }).split(/\r?\n/);
  const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(`^\\s*- \\[([ xX])\\].*(?:^|\\s)${escaped}(?:\\s|$)`);
  const index = findExactlyOne(lines, (line) => matcher.test(line), reference);
  let next = lines[index].replace(/^(\s*- \[)[ xX](\])/, `$1${checked ? 'x' : ' '}$2`);
  if (input.append && !next.includes(input.append)) next += ` ${input.append}`;
  lines[index] = next;
  const updated = lines.join('\n');
  return { body: updated, changed: updated !== body, matched: 1 };
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

function repositoryFromInput(input) {
  if (input.repository) {
    const repository = requireObject(input.repository, 'repository');
    const host = normalizeHost(repository.host);
    const owner = requireString(repository.owner, 'repository.owner');
    const name = requireString(repository.repository ?? repository.name, 'repository.repository');
    const provider =
      normalizeProvider(repository.provider ?? input.provider) ??
      (host === 'github.com'
        ? 'github'
        : teaLoginHosts(input.teaLogins).has(host)
          ? 'forgejo'
          : undefined);
    if (!provider)
      fail('AMBIGUOUS_HOST', 'repository host requires an explicit provider', { host });
    const login = repository.login ?? matchingTeaLogin(input.teaLogins, host)?.name;
    return {
      host,
      owner,
      repository: name,
      slug: `${owner}/${name}`,
      provider,
      ...(login ? { login } : {}),
    };
  }
  if (!input.remote) fail('NO_ORIGIN', 'remote operation requires origin remote data');
  return parseRemote(input.remote, input);
}

async function resolveRepositoryInput(input, runner) {
  if (input.repository || input.remote) return repositoryFromInput(input);
  const inside = await runner({
    executable: 'git',
    args: ['rev-parse', '--is-inside-work-tree'],
    cwd: input.cwd,
  });
  if (
    inside?.error?.code === 'ENOENT' ||
    inside?.status !== 0 ||
    inside?.stdout.trim() !== 'true'
  ) {
    fail('NOT_GIT_REPOSITORY', 'current directory is not inside a Git repository', {
      cwd: input.cwd,
    });
  }
  const origin = await runner({
    executable: 'git',
    args: ['remote', 'get-url', 'origin'],
    cwd: input.cwd,
  });
  if (origin?.status !== 0 || origin?.stdout.trim() === '') {
    fail('NO_ORIGIN', 'Git repository has no origin remote', { cwd: input.cwd });
  }
  try {
    return parseRemote(origin.stdout.trim(), input);
  } catch (error) {
    if (
      error.code !== 'AMBIGUOUS_HOST' ||
      normalizeProvider(input.provider ?? input.remoteToolOverride)
    ) {
      throw error;
    }
    const logins = await runner({
      executable: 'tea',
      args: ['logins', 'list', '--output', 'json'],
    });
    if (logins?.status !== 0) throw error;
    const parsed = parseJsonOutput(logins, 'tea logins');
    return parseRemote(origin.stdout.trim(), {
      ...input,
      teaLogins: Array.isArray(parsed) ? parsed : (parsed?.logins ?? []),
    });
  }
}

function ghHostArgs(repository) {
  return repository.host === 'github.com' ? [] : ['--hostname', repository.host];
}

// `gh api` selects the host with `--hostname`, but the porcelain commands the pull-request gate
// needs (`pr view`, `pr checks`, `pr merge`) take the repository as `[HOST/]OWNER/REPO` instead.
// They are used deliberately: watching checks and merging with a head-commit guard have no `gh api`
// equivalent, and a merge state read through the same porcelain stays consistent with them.
function ghRepoArgs(repository) {
  const slug = `${repository.owner}/${repository.repository}`;
  return ['--repo', repository.host === 'github.com' ? slug : `${repository.host}/${slug}`];
}

// The selections of the two JSON reads of the gate. Both are pinned rather than requested
// wholesale: an unknown field is rejected outright, so naming every field fails loudly on an
// incompatible provider instead of silently returning a differently shaped payload.
//
// The status read has to be GraphQL rather than `gh pr view --json`, because requiredness is the one
// fact the porcelain projection cannot express at all: none of its fields states whether branch
// protection marks a check as required, so `mergeGate.requireAllChecks: false` — documented as "the
// forge's own required-checks definition decides" — had no definition to consult, and the check list
// correctly reported no `required` flag rather than guessing one. GraphQL states it per context as
// `isRequired(pullRequestNumber:)`, on both members of the rollup union, and a single query returns
// it together with everything the old projection returned. That is what makes the switch worth it:
// head SHA, base ref, state, draft flag, check list, requiredness, and the forge's own merge state
// stay read at one instant instead of being correlated across two requests, which is the property
// that makes them usable as a merge precondition at all.
//
// `commits(last:1)` is requested for exactly one value: the head commit's own timestamp, which the
// gate compares against an automatic reviewer's latest comment. It rides on this read rather than on
// a second request, so the two values it correlates describe the same instant. `contexts` reports
// its `totalCount` alongside its nodes so a truncated page can be detected — see
// `flattenPullRequestStatus`, which is where that count is acted on.
const PR_STATUS_QUERY = `query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){number title url state isDraft mergeable mergeStateStatus baseRefName headRefOid commits(last:1){nodes{commit{oid committedDate statusCheckRollup{contexts(first:100){totalCount nodes{__typename ... on CheckRun{name status conclusion detailsUrl isRequired(pullRequestNumber:$number)} ... on StatusContext{context state targetUrl isRequired(pullRequestNumber:$number)}}}}}}}}}}`;
const PR_CHECK_FIELDS = 'bucket,link,name,state';

const MERGE_METHOD_FLAGS = Object.freeze({
  squash: '--squash',
  merge: '--merge',
  rebase: '--rebase',
});

const DEFAULT_CHECKS_WAIT_MINUTES = 20;
const DEFAULT_CHECKS_INTERVAL_SECONDS = 10;

// The wait's structured read carries a fixed bound of its own instead of a share of the caller's.
// As a single bounded command the operation had a guaranteed end-to-end ceiling, and splitting it
// into a watch plus a read must not drop that property silently: an unbounded read could hold a run
// open long after the watch it followed was already stopped. The value bounds one JSON read, not a
// wait — waiting is the watch's job — so it is deliberately not derived from `payload.timeoutMs`.
const CHECKS_READ_TIMEOUT_MS = 60_000;

// Node clamps a `setTimeout` delay above this ceiling to 1 ms. An over-large bound would therefore
// not relax the wait but invert it into an instant, fake timeout — repeated once per gate round —
// so it is rejected rather than accepted and silently reinterpreted.
const MAX_TIMEOUT_MS = 2_147_483_647;

// `gh pr checks --watch` blocks until the checks finish and has no timeout flag of its own, so the
// caller's bound travels with the plan as `timeoutMs` and the process runner enforces it. Without
// that bound a stuck check would hold a run open indefinitely. `--required` is passed only when the
// caller asks for the required-checks-only criterion; the default watches every check.
function checksWaitSettings(payload) {
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

// The structured half of the wait. `gh pr checks` rejects `--watch` together with `--json`, so the
// blocking watch cannot also be the read; `--required` and `--json` do combine, which is why this
// read is the only place the required-checks criterion is applied at all. The watch deliberately
// waits on every check, so the narrowing happens here, once, on a payload rather than on the
// blocking. It resolves that criterion through `checksWaitSettings`, the same helper the watch uses
// for its bound, so both commands stay derived from one settings object. It stays out of
// `buildCommandPlan` on purpose: that builder answers `pr-checks-wait` with the watch, which is the
// plan a caller previews and the only one carrying a caller-supplied bound.
function buildChecksReadPlan(input, repository) {
  const { requiredOnly } = checksWaitSettings(input.payload ?? input);
  return mutationPlan(
    'gh',
    [
      'pr',
      'checks',
      String(prNumber(input)),
      ...ghRepoArgs(repository),
      ...(requiredOnly ? ['--required'] : []),
      '--json',
      PR_CHECK_FIELDS,
    ],
    undefined,
    { timeoutMs: CHECKS_READ_TIMEOUT_MS },
  );
}

function mergeMethod(payload) {
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
function mergeSubject(payload, method) {
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
function expectedHeadSha(payload) {
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

function jsonStdin(payload) {
  return `${JSON.stringify(payload)}\n`;
}

function issueNumber(input) {
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
const ISSUE_CLOSE_REJECTED_FIELDS = Object.freeze([
  'state',
  'reason',
  'stateReason',
  'state_reason',
]);

function assertNoIssueCloseStateOverride(input) {
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

const DECOMPOSITION_KEY_MARKER = 'effective-flow-decomposition-key';
const DECOMPOSITION_KEY_VERSION = 'v2';
const DECOMPOSITION_KEY_PREFIX = `${DECOMPOSITION_KEY_MARKER}:${DECOMPOSITION_KEY_VERSION}`;
const DECOMPOSITION_SECTION_MARKER = 'effective-flow-decomposition';
const DECOMPOSITION_SECTION_VERSION = 'v2';
const DECOMPOSITION_SECTION_PREFIX = `${DECOMPOSITION_SECTION_MARKER}:${DECOMPOSITION_SECTION_VERSION}`;
const DECOMPOSITION_RECORD_MARKER = 'effective-flow-decomposition-record';
const DECOMPOSITION_RECORD_VERSION = 'v2';
const DECOMPOSITION_RECORD_PREFIX = `${DECOMPOSITION_RECORD_MARKER}:${DECOMPOSITION_RECORD_VERSION}`;
// Every marker version this file writes is `v<N>`, so a probe that reports a stored version back
// to a caller captures exactly that shape and nothing wider.
const DECOMPOSITION_MARKER_VERSION_PATTERN = 'v[0-9]{1,3}';
const GITHUB_DECOMPOSITION_COMMENT_MAX_BYTES = 65_536;
const DECOMPOSITION_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const DECOMPOSITION_WORKFLOWS = Object.freeze([
  'Feature',
  'Bugfix',
  'Refactoring',
  'Documentation',
]);
const DECOMPOSITION_STATUSES = Object.freeze([
  'proposed',
  'approved',
  'created',
  'missing',
  'declined',
]);
const ACTIVE_DECOMPOSITION_STATUSES = new Set(['proposed', 'approved', 'created', 'missing']);
const SENSITIVE_CHILD_FIELD =
  '(?:(?:[A-Z][A-Z0-9]*_)+(?:TOKEN|PASSWORD|SECRET|API_KEY|ACCESS_KEY_ID|SECRET_ACCESS_KEY|PRIVATE_KEY|CLIENT_SECRET|SESSION_ID)|access[ _-]?token|refresh[ _-]?token|api[ _-]?key|client[ _-]?secret|password|private[ _-]?key|secret|session[ _-]?id|aws[ _-]?access[ _-]?key[ _-]?id|aws[ _-]?secret[ _-]?access[ _-]?key|token)';
const SENSITIVE_CHILD_ASSIGNMENT = `(?<![A-Za-z0-9_])["']?${SENSITIVE_CHILD_FIELD}["']?(?![A-Za-z0-9_])\\s*[:=]\\s*`;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function markdownLineInventory(text) {
  const lines = text.split(/\r?\n/);
  const inventory = [];
  let fence;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const quoted = /^\s{0,3}>/.test(line);
    const fenceMatch = quoted ? null : line.match(/^ {0,3}(`{3,}|~{3,})(?:.*)$/);
    const outsideFence = fence === undefined;
    inventory.push({ index, line, quoted, outsideFence });
    if (quoted || !fenceMatch) continue;
    const marker = fenceMatch[1];
    if (fence === undefined) {
      fence = { character: marker[0], length: marker.length };
      continue;
    }
    if (
      marker[0] === fence.character &&
      marker.length >= fence.length &&
      new RegExp(`^ {0,3}${escapeRegExp(marker[0])}{${fence.length},}\\s*$`).test(line)
    ) {
      fence = undefined;
    }
  }
  return { lines, inventory, unclosedFence: fence };
}

function assertClosedMarkdownFences(text, field) {
  const inventory = markdownLineInventory(text);
  if (inventory.unclosedFence !== undefined) {
    fail('INVALID_PAYLOAD', `${field} contains an unclosed Markdown fence`, {
      field,
      reason: 'unclosed-markdown-fence',
      fence: inventory.unclosedFence.character,
      minimumClosingLength: inventory.unclosedFence.length,
    });
  }
  return inventory;
}

function untrustedControlLines(text, marker) {
  const inventory = markdownLineInventory(text);
  return {
    ...inventory,
    controls: inventory.inventory.filter(
      ({ line, quoted, outsideFence }) =>
        outsideFence && !quoted && line.startsWith(`<!-- ${marker}`),
    ),
  };
}

function parentIssueNumber(input, repository) {
  const parent = input.parent ?? input.parentIssue;
  if (parent === undefined || parent === null) {
    fail('INVALID_REFERENCE', 'parent issue is required', { field: 'parent' });
  }
  return parseReference(parent, { expectedKind: 'issue', repository }).number;
}

function decompositionKey(value, field = 'payload.decompositionKey') {
  const key = requireString(value, field).trim();
  if (!DECOMPOSITION_KEY_PATTERN.test(key) || redact(key) !== key) {
    fail('INVALID_PAYLOAD', `${field} must be a stable lowercase decomposition key`, {
      field,
      maximum: 80,
    });
  }
  return key;
}

// The marker is target-aware because an external tracker names its parents with tool-native
// identifiers (`SEB-31`), not forge issue numbers. The caller supplies the target it expects — as
// the bare literal `'forge'` on the forge path, or as a context object when a repository binding is
// needed to resolve an issue URL — and the marker carries its own target so a parse can cross-check
// it instead of guessing from the shape of the parent.
function decompositionKeyContext(value, field = 'decomposition key context') {
  const input = typeof value === 'string' ? { target: value } : requireObject(value ?? {}, field);
  const target = requireString(input.target, `${field}.target`).trim();
  if (!['forge', 'external'].includes(target)) {
    fail('INVALID_PAYLOAD', `${field}.target must be forge or external`, {
      field: `${field}.target`,
    });
  }
  if (target !== 'forge') return { target, host: null, repository: null };
  const repository = lifecycleRepositoryBinding({ repository: input.repository });
  return { target, host: repository?.host, repository: repository?.slug };
}

export function buildDecompositionKeyMarker(parent, key, context) {
  const scope = decompositionKeyContext(context);
  return `<!-- ${DECOMPOSITION_KEY_PREFIX} ${encodeCanonicalDecomposition({
    target: scope.target,
    parent: normalizeCanonicalDecompositionReference(parent, 'decomposition key parent', scope),
    key: decompositionKey(key, 'decomposition key'),
  })} -->`;
}

function decompositionKeyFailure(code, message, details = {}) {
  return { code, message, details: redact(details) };
}

function inspectDecompositionKey(body, expectedParent, context) {
  const text = requireString(body, 'issue body', { allowEmpty: true });
  const scope = decompositionKeyContext(context);
  const inspected = untrustedControlLines(text, `${DECOMPOSITION_KEY_MARKER}:`);
  if (inspected.controls.length === 0) return { status: 'absent' };
  if (inspected.controls.length > 1) {
    return {
      status: 'invalid',
      error: decompositionKeyFailure(
        'DUPLICATE',
        'issue body contains more than one decomposition key marker',
        { matches: inspected.controls.length },
      ),
    };
  }
  const candidate = inspected.controls[0];
  if (inspected.lines.slice(candidate.index + 1).some((line) => line.trim() !== '')) {
    return {
      status: 'invalid',
      error: decompositionKeyFailure(
        'INVALID_POSITION',
        'decomposition key marker must be the final nonblank standalone line',
      ),
    };
  }
  // Two stages, both derived from the versioned prefix contract rather than a literal marker
  // string: the strict current form first, and only on no match a version probe that names the
  // stored version in a fail-closed diagnostic. A legacy marker is never parsed or rewritten.
  // The marker line comes from an issue body on a tracker this repository does not control, and
  // the probe echoes the captured segment into a failure envelope an agent reads; `redact()` does
  // not cover a `version` key. The capture is therefore bounded by the grammar every version this
  // file writes actually uses, so an attacker-chosen segment falls through to `MALFORMED`, whose
  // details stay empty, instead of being repeated back verbatim and unbounded.
  const exact = new RegExp(`^<!-- ${escapeRegExp(DECOMPOSITION_KEY_PREFIX)} ([A-Za-z0-9_-]+) -->$`);
  const match = candidate.line.match(exact);
  if (!match) {
    const versioned = candidate.line.match(
      new RegExp(
        `^<!-- ${escapeRegExp(DECOMPOSITION_KEY_MARKER)}:(${DECOMPOSITION_MARKER_VERSION_PATTERN})(?: [^\\r\\n]*)? -->$`,
      ),
    );
    if (versioned && versioned[1] !== DECOMPOSITION_KEY_VERSION) {
      return {
        status: 'invalid',
        error: decompositionKeyFailure(
          'UNSUPPORTED_VERSION',
          'decomposition key marker version is unsupported',
          { version: versioned[1], supported: [DECOMPOSITION_KEY_VERSION] },
        ),
      };
    }
    return {
      status: 'invalid',
      error: decompositionKeyFailure(
        'MALFORMED',
        'issue body contains a malformed decomposition key marker',
      ),
    };
  }
  // Decoding is routed separately from schema validation on purpose: the shared base64url decoder
  // reports its own `INVALID_PAYLOAD`, so folding it into the schema guard below would report an
  // undecodable payload as a schema error instead of a malformed marker.
  let value;
  try {
    value = decodeCanonicalDecomposition(match[1], 'decomposition key marker payload');
  } catch {
    return {
      status: 'invalid',
      error: decompositionKeyFailure(
        'MALFORMED',
        'issue body contains a malformed decomposition key marker',
      ),
    };
  }
  try {
    exactObjectKeys(value, ['target', 'parent', 'key'], 'decomposition key marker');
    const markerTarget = requireString(value.target, 'decomposition key marker target').trim();
    if (!['forge', 'external'].includes(markerTarget)) {
      fail('INVALID_PAYLOAD', 'decomposition key marker target must be forge or external', {
        field: 'decomposition key marker target',
      });
    }
    if (markerTarget !== scope.target) {
      return {
        status: 'invalid',
        error: decompositionKeyFailure(
          'TARGET_MISMATCH',
          'decomposition key marker names a different tracker target',
          { expectedTarget: scope.target, actualTarget: markerTarget },
        ),
      };
    }
    const parent = normalizeCanonicalDecompositionReference(
      value.parent,
      'decomposition key marker parent',
      scope,
    );
    const key = decompositionKey(value.key, 'decomposition key marker key');
    if (expectedParent !== undefined && expectedParent !== null) {
      const expected = normalizeCanonicalDecompositionReference(
        expectedParent,
        'parent issue',
        scope,
      );
      if (parent !== expected) {
        return {
          status: 'invalid',
          error: decompositionKeyFailure(
            'PARENT_MISMATCH',
            'decomposition key marker names a different parent issue',
            { expectedParent: expected, actualParent: parent },
          ),
        };
      }
    }
    return { status: 'valid', target: markerTarget, parent, key };
  } catch (error) {
    return {
      status: 'invalid',
      error: decompositionKeyFailure(
        'INVALID_SCHEMA',
        error?.message ?? 'decomposition key marker has an invalid schema',
      ),
    };
  }
}

// The absent case returns a wrapper rather than `undefined`: `executeOperation` reads an
// `undefined` local result as "not a local operation", so a bare `undefined` here would make every
// clean body fail as an unknown operation.
export function parseDecompositionKey(body, context = {}) {
  const scope =
    typeof context === 'string' ? { target: context } : requireObject(context ?? {}, 'context');
  const inspected = inspectDecompositionKey(body, scope.parent, scope);
  if (inspected.status === 'absent') return { found: false, key: null };
  if (inspected.status === 'valid') {
    return {
      found: true,
      version: DECOMPOSITION_KEY_VERSION,
      target: inspected.target,
      parent: inspected.parent,
      key: inspected.key,
    };
  }
  fail(
    inspected.error.code === 'DUPLICATE' ? 'AMBIGUOUS_TARGET' : 'INVALID_PAYLOAD',
    inspected.error.message,
    inspected.error.details,
  );
}

// The canonical writer for both targets. Without a body it returns the marker only; with one it
// performs the same four guards the forge-only child payload applies — child-text sanitization
// (generation-attribution rejection plus the redaction passes), closed fences, no caller-supplied
// marker, and a post-append re-inspection — so an external caller never has to concatenate marker
// data by hand. Sanitization runs first because redaction can delete backticks, so a fence balance
// checked before it would be measured on text that is about to change.
export function buildDecompositionKey(input) {
  requireObject(input, 'input');
  const proposal = requireObject(input.decomposition ?? input, 'decomposition');
  const scope = decompositionKeyContext(proposal, 'decomposition');
  const parent = normalizeCanonicalDecompositionReference(
    proposal.parent,
    'decomposition.parent',
    scope,
  );
  const key = decompositionKey(proposal.key ?? proposal.decompositionKey, 'decomposition.key');
  const marker = buildDecompositionKeyMarker(parent, key, scope);
  if (input.body === undefined) return { marker };

  const body = sanitizeChildText(input.body, 'body');
  assertClosedMarkdownFences(body, 'body');
  if (inspectDecompositionKey(body, parent, scope).status !== 'absent') {
    fail('INVALID_PAYLOAD', 'body must not supply its own decomposition key marker', {
      field: 'body',
    });
  }
  const updated = `${body.trimEnd()}\n\n${marker}`;
  const appended = inspectDecompositionKey(updated, parent, scope);
  if (appended.status !== 'valid' || appended.key !== key) {
    fail('INVALID_PAYLOAD', 'body cannot carry one readable final decomposition key marker', {
      field: 'body',
      reason: 'unreadable-appended-decomposition-marker',
    });
  }
  return { marker, body: updated, parent: appended.parent, key: appended.key };
}

function sensitiveChildAssignmentPattern(flags = 'gi') {
  return new RegExp(`(${SENSITIVE_CHILD_ASSIGNMENT})`, flags);
}

function failUnsafeChildSecret(field, reason) {
  fail('INVALID_PAYLOAD', `${field} contains credential material that cannot be safely redacted`, {
    field,
    reason,
  });
}

function redactChildPrivateKeys(text, field) {
  const begin = /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----/g;
  const end = /-----END(?: [A-Z0-9]+)* PRIVATE KEY-----/g;
  if ((text.match(begin) ?? []).length !== (text.match(end) ?? []).length) {
    failUnsafeChildSecret(field, 'unterminated-private-key');
  }
  return text.replace(
    /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)* PRIVATE KEY-----/g,
    '[REDACTED PRIVATE KEY]',
  );
}

function redactChildQuotedAssignments(text, field) {
  const matcher = sensitiveChildAssignmentPattern('gi');
  let cursor = 0;
  let output = '';
  for (const match of text.matchAll(matcher)) {
    if (match.index < cursor) continue;
    const valueStart = match.index + match[0].length;
    const quote = text[valueStart];
    if (quote !== '"' && quote !== "'") continue;
    let valueCursor = valueStart + 1;
    let consecutiveBackslashes = 0;
    let closed = false;
    while (valueCursor < text.length) {
      const character = text[valueCursor];
      if (character === quote && consecutiveBackslashes % 2 === 0) {
        closed = true;
        break;
      }
      consecutiveBackslashes = character === '\\' ? consecutiveBackslashes + 1 : 0;
      valueCursor += 1;
    }
    if (!closed) failUnsafeChildSecret(field, 'unterminated-quoted-secret');
    output += `${text.slice(cursor, valueStart)}[REDACTED]`;
    cursor = valueCursor + 1;
  }
  return `${output}${text.slice(cursor)}`;
}

function indentationWidth(value) {
  return value.replace(/\t/g, '    ').length;
}

function redactChildBlockAssignments(text, field) {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const output = [];
  const blockStart = new RegExp(`^(\\s*)(${SENSITIVE_CHILD_ASSIGNMENT})(?:[|>]\\s*)?$`, 'i');
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(blockStart);
    if (!match) {
      output.push(lines[index]);
      continue;
    }
    const baseIndent = indentationWidth(match[1]);
    output.push(`${match[1]}${match[2]}[REDACTED]`);
    let consumedValue = false;
    while (index + 1 < lines.length) {
      const next = lines[index + 1];
      const nextIndent = next.match(/^\s*/)?.[0] ?? '';
      if (next.trim() !== '' && indentationWidth(nextIndent) <= baseIndent) break;
      if (next.trim() !== '') consumedValue = true;
      index += 1;
    }
    if (!consumedValue) failUnsafeChildSecret(field, 'ambiguous-empty-secret-assignment');
  }
  return output.join(newline);
}

function redactChildAssignments(text, field) {
  const assignment = new RegExp(
    `(${SENSITIVE_CHILD_ASSIGNMENT})(?!\\[REDACTED(?: PRIVATE KEY)?\\])[^\\r\\n]*`,
    'gi',
  );
  return text.replace(assignment, (matched, prefix) => {
    const value = matched.slice(prefix.length);
    if (value.startsWith('[REDACTED]')) return matched;
    if (value.trim() === '') failUnsafeChildSecret(field, 'empty-secret-assignment');
    if (/=\s*$/.test(prefix) || /^\S+$/.test(value.trim())) return `${prefix}[REDACTED]`;
    if (!/:\s*$/.test(prefix)) failUnsafeChildSecret(field, 'ambiguous-secret-assignment');
    if (isLegitimateCredentialProse(prefix, value)) return matched;
    failUnsafeChildSecret(field, 'ambiguous-colon-credential-assignment');
  });
}

function isLegitimateCredentialProse(prefix, value) {
  if (!/:\s*$/.test(prefix)) return false;
  const prose = value.trim();
  if (!/^\p{Ll}[\p{L}\p{N}._,'’()\/-]*(?:\s+[^\s]+)+[.!?]?$/u.test(prose)) return false;
  return /^(?:require|support|do|never|avoid|keep|use|store|rotate|redact|document|accept|reject|must|should|is|are|verlange|unterstütze|nutze|verwende|speichere|rotiere|protokolliere)\b/iu.test(
    prose,
  );
}

function isLegitimateCredentialProseMatch(match, text) {
  const prefix = match[0];
  const value = text.slice(match.index + prefix.length).split(/\r?\n/, 1)[0];
  return isLegitimateCredentialProse(prefix, value);
}

function sanitizeChildText(value, field) {
  let text = publishableText(value, field);
  text = redactChildPrivateKeys(text, field);
  text = redactChildBlockAssignments(text, field);
  text = redactChildQuotedAssignments(text, field);
  text = redactChildAssignments(redact(text), field);
  for (const match of text.matchAll(sensitiveChildAssignmentPattern('gi'))) {
    if (
      !text.slice(match.index + match[0].length).startsWith('[REDACTED]') &&
      !isLegitimateCredentialProseMatch(match, text)
    ) {
      failUnsafeChildSecret(field, 'residual-secret-assignment');
    }
  }
  if (/-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----/.test(text)) {
    failUnsafeChildSecret(field, 'residual-private-key');
  }
  return publishableText(text, field);
}

function sanitizeChildLabel(value, field) {
  const label = publishableText(value, field);
  const sanitized = sanitizeChildText(label, field);
  if (sanitized !== label) failUnsafeChildSecret(field, 'secret-in-label');
  return label;
}

function decompositionWorkflow(value, field = 'record.workflow') {
  const workflow = requireString(value, field).trim();
  if (!DECOMPOSITION_WORKFLOWS.includes(workflow)) {
    fail('INVALID_PAYLOAD', `${field} must name a supported implementation workflow`, {
      field,
      supported: [...DECOMPOSITION_WORKFLOWS],
    });
  }
  return workflow;
}

export function parseDecompositionChildWorkflow(input) {
  requireObject(input, 'decomposition child workflow');
  const body = requireString(input.body, 'decomposition child workflow body');
  const language = requireString(input.language, 'decomposition child workflow language').trim();
  if (!['en', 'de'].includes(language)) {
    fail('INVALID_PAYLOAD', 'decomposition child workflow language must be en or de', {
      field: 'language',
      supported: ['en', 'de'],
    });
  }
  const inventory = markdownLineInventory(body).inventory.filter(
    ({ quoted, outsideFence }) => !quoted && outsideFence,
  );
  const collect = (pattern) =>
    inventory.map(({ line }) => line.match(pattern)).filter((match) => match !== null);
  const english = collect(/^\*\*Recommended workflow:\*\*\s*([^\r\n]+)\s*$/);
  const german = collect(/^\*\*Empfohlener Workflow:\*\*\s*([^\r\n]+)\s*$/);
  const matching = language === 'de' ? german : english;
  const foreign = language === 'de' ? english : german;
  if (matching.length !== 1 || foreign.length !== 0) {
    fail(
      'INVALID_PAYLOAD',
      'decomposition child body must contain exactly one language-matching recommended workflow field',
      { field: 'body', language, matches: matching.length, foreignMatches: foreign.length },
    );
  }
  const workflow = decompositionWorkflow(matching[0][1], 'decomposition child workflow');
  if (
    input.expectedWorkflow !== undefined &&
    workflow !== decompositionWorkflow(input.expectedWorkflow, 'expected decomposition workflow')
  ) {
    fail('INVALID_PAYLOAD', 'decomposition child workflow does not match its canonical record', {
      field: 'body',
    });
  }
  const implementationWorkflow = {
    Feature: 'build',
    Bugfix: 'fix',
    Refactoring: 'refactor',
    Documentation: 'docs',
  }[workflow];
  return { workflow, implementationWorkflow };
}

function decompositionStatus(value, field = 'record.status') {
  const status = requireString(value, field).trim();
  if (!DECOMPOSITION_STATUSES.includes(status)) {
    fail('INVALID_PAYLOAD', `${field} must name a supported decomposition status`, {
      field,
      supported: [...DECOMPOSITION_STATUSES],
    });
  }
  return status;
}

function decompositionDraftHash(record) {
  return bodyHash(
    JSON.stringify({
      key: record.key,
      title: record.title,
      workflow: record.workflow,
      body: record.body,
    }),
  );
}

function decompositionLanguage(value, field = 'decomposition.language') {
  const language = requireString(value, field).trim();
  if (!['en', 'de'].includes(language)) {
    fail('INVALID_PAYLOAD', `${field} must be en or de`, { field, supported: ['en', 'de'] });
  }
  return language;
}

function canonicalDecompositionContext(input, field = 'decomposition') {
  requireObject(input, field);
  const language = decompositionLanguage(input.language, `${field}.language`);
  const target = requireString(input.target, `${field}.target`).trim();
  if (!['forge', 'external'].includes(target)) {
    fail('INVALID_PAYLOAD', `${field}.target must be forge or external`, {
      field: `${field}.target`,
    });
  }
  if (target === 'forge') {
    const repository = lifecycleRepositoryBinding({ repository: input.repository });
    if (repository?.host === undefined) {
      fail('INVALID_PAYLOAD', `${field}.repository must include the resolved forge host`, {
        field: `${field}.repository`,
      });
    }
    if (input.externalTool !== null) {
      fail('INVALID_PAYLOAD', `${field}.externalTool must be null for forge`, {
        field: `${field}.externalTool`,
      });
    }
    return {
      language,
      target,
      host: repository.host,
      repository: repository.slug,
      externalTool: null,
      parent: normalizeForgeLifecycleReference(
        typeof input.parent === 'number' ? String(input.parent) : input.parent,
        `${field}.parent`,
        repository,
      ),
    };
  }
  if (input.repository !== null) {
    fail('INVALID_PAYLOAD', `${field}.repository must be null for external`, {
      field: `${field}.repository`,
    });
  }
  return {
    language,
    target,
    host: null,
    repository: null,
    externalTool: lifecycleExternalTool(input.externalTool, `${field}.externalTool`),
    parent: normalizeExternalLifecycleReference(input.parent, `${field}.parent`),
  };
}

function canonicalDecompositionRepository(context) {
  return context.target === 'forge' ? { host: context.host, slug: context.repository } : undefined;
}

function normalizeCanonicalDecompositionReference(value, field, context) {
  return context.target === 'forge'
    ? normalizeForgeLifecycleReference(
        typeof value === 'number' ? String(value) : value,
        field,
        canonicalDecompositionRepository(context),
      )
    : normalizeExternalLifecycleReference(value, field);
}

function canonicalDecompositionIssue(value, status, field, context) {
  if (status !== 'created') {
    if (value !== null) {
      fail('INVALID_PAYLOAD', `${field} must be null unless record.status is created`, { field });
    }
    return null;
  }
  return normalizeCanonicalDecompositionReference(value, field, context);
}

function encodeCanonicalDecomposition(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCanonicalDecomposition(value, field) {
  const encoded = requireString(value, field).trim();
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) {
    fail('INVALID_PAYLOAD', `${field} must be canonical base64url`, { field });
  }
  const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
  if (Buffer.from(decoded, 'utf8').toString('base64url') !== encoded) {
    fail('INVALID_PAYLOAD', `${field} must use canonical base64url encoding`, { field });
  }
  try {
    return JSON.parse(decoded);
  } catch {
    fail('INVALID_PAYLOAD', `${field} does not contain valid JSON`, { field });
  }
}

function canonicalDecompositionRecordPayload(record) {
  return {
    key: record.key,
    title: record.title,
    workflow: record.workflow,
    body: record.body,
    status: record.status,
    issue: record.issue,
    draftHash: record.draftHash,
  };
}

function canonicalDecompositionRecordMarker(record) {
  return `<!-- ${DECOMPOSITION_RECORD_PREFIX} ${encodeCanonicalDecomposition(
    canonicalDecompositionRecordPayload(record),
  )} -->`;
}

function canonicalDecompositionHeader(context) {
  return `<!-- ${DECOMPOSITION_SECTION_PREFIX}:begin ${encodeCanonicalDecomposition(context)} -->`;
}

function canonicalDecompositionEnd() {
  return `<!-- ${DECOMPOSITION_SECTION_PREFIX}:end -->`;
}

function canonicalDecompositionBodyFence(body) {
  const longest = Math.max(0, ...(body.match(/`+/g) ?? []).map((run) => run.length));
  return '`'.repeat(Math.max(3, longest + 1));
}

function canonicalDecompositionStatus(record, language) {
  const values =
    language === 'de'
      ? {
          proposed: 'Vorgeschlagen',
          approved: 'Freigegeben',
          created: `Erstellt als ${record.issue}`,
          missing: 'Fehlend',
          declined: 'Abgelehnt',
        }
      : {
          proposed: 'Proposed',
          approved: 'Approved',
          created: `Created as ${record.issue}`,
          missing: 'Missing',
          declined: 'Declined',
        };
  return values[record.status];
}

function renderCanonicalDecompositionSection(context, records) {
  const strings =
    context.language === 'de'
      ? { workflow: 'Workflow', status: 'Status', body: 'Body (exaktes Markdown)' }
      : { workflow: 'Workflow', status: 'Status', body: 'Body (exact Markdown)' };
  const blocks = records.map((record) => {
    const fence = canonicalDecompositionBodyFence(record.body);
    return [
      canonicalDecompositionRecordMarker(record),
      `#### \`${record.key}\` — ${record.title}`,
      '',
      `**${strings.workflow}:** ${record.workflow}`,
      `**${strings.status}:** ${canonicalDecompositionStatus(record, context.language)}`,
      '',
      `**${strings.body}:**`,
      `${fence}markdown`,
      record.body,
      fence,
    ].join('\n');
  });
  return [canonicalDecompositionHeader(context), ...blocks, canonicalDecompositionEnd()].join(
    '\n\n',
  );
}

function decompositionSizeContributions(commentBody, context, records) {
  const sectionBytes = Buffer.byteLength(
    renderCanonicalDecompositionSection(context, records),
    'utf8',
  );
  return {
    sectionBytes,
    otherCommentBytes: Math.max(0, Buffer.byteLength(commentBody, 'utf8') - sectionBytes),
    records: records.map((record) => ({
      key: record.key,
      titleBytes: Buffer.byteLength(record.title, 'utf8'),
      bodyBytes: Buffer.byteLength(record.body, 'utf8'),
      encodedRecordBytes: Buffer.byteLength(canonicalDecompositionRecordMarker(record), 'utf8'),
    })),
  };
}

function assertGithubDecompositionCommentSize(commentBody, context, records, field) {
  if (context.target !== 'forge') return;
  const actual = Buffer.byteLength(commentBody, 'utf8');
  if (actual <= GITHUB_DECOMPOSITION_COMMENT_MAX_BYTES) return;
  fail('INVALID_PAYLOAD', `${field} exceeds GitHub's decomposition planning comment limit`, {
    field,
    maximum: GITHUB_DECOMPOSITION_COMMENT_MAX_BYTES,
    actual,
    unit: 'utf8-bytes',
    contributions: decompositionSizeContributions(commentBody, context, records),
  });
}

function normalizeCanonicalDecompositionRecord(raw, index, context, persisted = false) {
  const field = `decomposition.records[${index}]`;
  exactObjectKeys(
    raw,
    persisted
      ? ['key', 'title', 'workflow', 'body', 'status', 'issue', 'draftHash']
      : ['key', 'title', 'workflow', 'body', 'status', 'issue'],
    field,
  );
  const title = sanitizeChildText(raw.title, `${field}.title`).trim();
  if (/\r|\n/.test(title)) {
    fail('INVALID_PAYLOAD', `${field}.title must occupy one line`, { field: `${field}.title` });
  }
  const workflow = decompositionWorkflow(raw.workflow, `${field}.workflow`);
  const body = sanitizeChildText(raw.body, `${field}.body`).trim();
  assertClosedMarkdownFences(body, `${field}.body`);
  parseDecompositionChildWorkflow({ body, language: context.language, expectedWorkflow: workflow });
  const status = decompositionStatus(raw.status, `${field}.status`);
  const record = {
    key: decompositionKey(raw.key, `${field}.key`),
    title,
    workflow,
    body,
    status,
    issue: canonicalDecompositionIssue(raw.issue, status, `${field}.issue`, context),
  };
  const draftHash = decompositionDraftHash(record);
  if (persisted) {
    const supplied = requireString(raw.draftHash, `${field}.draftHash`).trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(supplied) || supplied !== draftHash) {
      fail('INVALID_PAYLOAD', `${field}.draftHash does not match the persisted draft`, {
        field: `${field}.draftHash`,
      });
    }
  }
  return { ...record, draftHash };
}

function validateUniqueDecompositionRecords(records) {
  const keys = new Set();
  const issues = new Set();
  for (const record of records) {
    if (keys.has(record.key)) {
      fail('AMBIGUOUS_TARGET', 'decomposition records contain a duplicate key', {
        key: record.key,
      });
    }
    keys.add(record.key);
    if (record.issue === null) continue;
    if (issues.has(record.issue)) {
      fail('AMBIGUOUS_TARGET', 'decomposition records contain a duplicate created issue', {
        issue: record.issue,
      });
    }
    issues.add(record.issue);
  }
  return records;
}

export function buildDecompositionRecords(input) {
  requireObject(input, 'decomposition');
  exactObjectKeys(
    input,
    ['language', 'target', 'repository', 'externalTool', 'parent', 'records'],
    'decomposition',
  );
  if (!Array.isArray(input.records) || input.records.length === 0) {
    fail('INVALID_PAYLOAD', 'decomposition.records must be a non-empty array', {
      field: 'decomposition.records',
    });
  }
  const context = canonicalDecompositionContext(input);
  const records = validateUniqueDecompositionRecords(
    input.records.map((raw, index) => normalizeCanonicalDecompositionRecord(raw, index, context)),
  );
  const section = renderCanonicalDecompositionSection(context, records);
  assertGithubDecompositionCommentSize(section, context, records, 'decomposition.section');
  return { context, records, section };
}

export function parseDecompositionRecords(body) {
  const text = requireString(body, 'planning comment body', { allowEmpty: true });
  const sectionInventory = untrustedControlLines(text, `${DECOMPOSITION_SECTION_MARKER}:`);
  const recordInventory = untrustedControlLines(text, `${DECOMPOSITION_RECORD_MARKER}:`);
  const obsoleteInventory = untrustedControlLines(text, 'effective-flow-decomposition-child:');
  if (obsoleteInventory.controls.length > 0) {
    fail(
      'INVALID_PAYLOAD',
      'planning comment contains a noncanonical decomposition record version',
    );
  }
  if (sectionInventory.controls.length === 0 && recordInventory.controls.length === 0) {
    return { found: false, active: false, context: null, records: [] };
  }
  if (sectionInventory.controls.length !== 2) {
    fail(
      'INVALID_PAYLOAD',
      'planning comment must contain exactly one canonical decomposition section',
    );
  }
  const [begin, end] = sectionInventory.controls;
  const beginMatch = begin.line.match(
    new RegExp(`^<!-- ${escapeRegExp(DECOMPOSITION_SECTION_PREFIX)}:begin ([A-Za-z0-9_-]+) -->$`),
  );
  if (
    !beginMatch ||
    end.line !== canonicalDecompositionEnd() ||
    begin.index >= end.index ||
    recordInventory.controls.some(
      (record) => record.index <= begin.index || record.index >= end.index,
    )
  ) {
    fail('INVALID_PAYLOAD', 'planning comment contains malformed decomposition section boundaries');
  }
  const rawContext = decodeCanonicalDecomposition(beginMatch[1], 'decomposition section context');
  exactObjectKeys(
    rawContext,
    ['language', 'target', 'host', 'repository', 'externalTool', 'parent'],
    'decomposition section context',
  );
  const repositoryParts =
    rawContext.target === 'forge' ? String(rawContext.repository).split('/') : [];
  const context = canonicalDecompositionContext({
    language: rawContext.language,
    target: rawContext.target,
    repository:
      rawContext.target === 'forge'
        ? {
            host: rawContext.host,
            owner: repositoryParts.slice(0, -1).join('/'),
            repository: repositoryParts.at(-1),
          }
        : null,
    externalTool: rawContext.externalTool,
    parent: rawContext.parent,
  });
  if (JSON.stringify(context) !== JSON.stringify(rawContext)) {
    fail('INVALID_PAYLOAD', 'decomposition section context is not canonical');
  }
  if (recordInventory.controls.length === 0) {
    fail('INVALID_PAYLOAD', 'canonical decomposition section must contain at least one record');
  }
  const records = validateUniqueDecompositionRecords(
    recordInventory.controls.map((record, index) => {
      const match = record.line.match(
        new RegExp(`^<!-- ${escapeRegExp(DECOMPOSITION_RECORD_PREFIX)} ([A-Za-z0-9_-]+) -->$`),
      );
      if (!match) {
        fail('INVALID_PAYLOAD', 'planning comment contains a malformed decomposition record');
      }
      const raw = decodeCanonicalDecomposition(match[1], `decomposition.records[${index}]`);
      return normalizeCanonicalDecompositionRecord(raw, index, context, true);
    }),
  );
  const persistedSection = sectionInventory.lines.slice(begin.index, end.index + 1).join('\n');
  if (persistedSection !== renderCanonicalDecompositionSection(context, records)) {
    fail('INVALID_PAYLOAD', 'canonical decomposition section visible content was modified');
  }
  return {
    found: true,
    active: records.some((record) => ACTIVE_DECOMPOSITION_STATUSES.has(record.status)),
    context,
    records,
  };
}

function decompositionChildIdentity(child, context) {
  if (
    context.target === 'forge' &&
    child.repository !== undefined &&
    child.repository !== context.repository
  ) {
    fail('REFERENCE_REPOSITORY_MISMATCH', 'decomposition child belongs to another repository');
  }
  const value =
    context.target === 'forge'
      ? (child.reference ?? child.issue ?? child.url ?? child.number ?? child.id)
      : (child.reference ?? child.issue ?? child.id ?? child.url);
  if (value === undefined || value === null) {
    fail('INVALID_PAYLOAD', 'decomposition child must carry a stable issue identity', {
      field: 'children',
    });
  }
  return normalizeCanonicalDecompositionReference(value, 'decomposition child identity', context);
}

function decompositionParentIdentity(parent, context) {
  if (parent === undefined || parent === null) return undefined;
  if (typeof parent !== 'object') {
    return normalizeCanonicalDecompositionReference(parent, 'decomposition parent', context);
  }
  if (
    context.target === 'forge' &&
    parent.repository !== undefined &&
    parent.repository !== context.repository
  ) {
    return undefined;
  }
  const value =
    context.target === 'forge'
      ? (parent.reference ?? parent.issue ?? parent.url ?? parent.number ?? parent.id)
      : (parent.reference ?? parent.issue ?? parent.id ?? parent.url);
  return value === undefined
    ? undefined
    : normalizeCanonicalDecompositionReference(value, 'decomposition parent', context);
}

export function compareDecompositionContainer(input) {
  requireObject(input, 'decomposition container');
  const proposal = parseDecompositionRecords(input.body ?? input.commentBody ?? '');
  if (!proposal.active) {
    return {
      canonical: proposal.found,
      active: false,
      containerOnly: false,
      ok: true,
      records: proposal.records,
      discrepancies: [],
    };
  }
  if (!Array.isArray(input.children)) {
    fail('INVALID_PAYLOAD', 'decomposition container children must be an array', {
      field: 'children',
    });
  }
  const discrepancies = [];
  const expectedParent = proposal.context.parent;
  if (decompositionParentIdentity(input.parent, proposal.context) !== expectedParent) {
    discrepancies.push({ code: 'PARENT_MISMATCH' });
  }
  const recordsByKey = new Map(proposal.records.map((record) => [record.key, record]));
  const childrenByKey = new Map();
  for (const child of input.children) {
    requireObject(child, 'decomposition child');
    let issue;
    try {
      issue = decompositionChildIdentity(child, proposal.context);
    } catch (error) {
      if (!(error instanceof RemoteTrackerError)) throw error;
      discrepancies.push({ code: 'INVALID_CHILD_IDENTITY' });
      continue;
    }
    if (child.decompositionKeyError !== undefined) {
      discrepancies.push({ code: 'INVALID_CHILD_MARKER', issue });
      continue;
    }
    if (child.decompositionKey === undefined) {
      discrepancies.push({ code: 'DETACHED_CHILD', issue });
      continue;
    }
    const key = decompositionKey(child.decompositionKey, 'decomposition child key');
    if (!recordsByKey.has(key)) {
      discrepancies.push({ code: 'UNEXPECTED_KEY', issue, key });
      continue;
    }
    const group = childrenByKey.get(key) ?? [];
    group.push(child);
    childrenByKey.set(key, group);
  }
  for (const record of proposal.records) {
    if (!ACTIVE_DECOMPOSITION_STATUSES.has(record.status)) continue;
    if (record.status !== 'created') {
      discrepancies.push({ code: 'INCOMPLETE_RECORD', key: record.key, status: record.status });
      continue;
    }
    const matches = childrenByKey.get(record.key) ?? [];
    if (matches.length === 0) {
      discrepancies.push({ code: 'MISSING_CHILD', key: record.key, issue: record.issue });
      continue;
    }
    if (matches.length > 1) {
      discrepancies.push({ code: 'DUPLICATE_KEY', key: record.key, matches: matches.length });
      continue;
    }
    const child = matches[0];
    const childIdentity = decompositionChildIdentity(child, proposal.context);
    if (record.issue !== childIdentity) {
      discrepancies.push({ code: 'ISSUE_MISMATCH', key: record.key, issue: childIdentity });
    }
    if (decompositionParentIdentity(child.parent, proposal.context) !== expectedParent) {
      discrepancies.push({ code: 'DETACHED_CHILD', key: record.key, issue: childIdentity });
    }
  }
  return {
    canonical: true,
    active: true,
    containerOnly: true,
    ok: discrepancies.length === 0,
    context: proposal.context,
    records: proposal.records,
    discrepancies,
  };
}

function childIssuePayload(input, repository) {
  const payload = requireObject(input.payload ?? input, 'payload');
  const parent = parentIssueNumber(input, repository);
  const key = decompositionKey(payload.decompositionKey);
  const title = sanitizeChildText(payload.title, 'payload.title');
  const sourceBody = sanitizeChildText(payload.body, 'payload.body');
  assertClosedMarkdownFences(sourceBody, 'payload.body');
  if (inspectDecompositionKey(sourceBody, parent, 'forge').status !== 'absent') {
    fail('INVALID_PAYLOAD', 'payload.body must not supply its own decomposition key marker', {
      field: 'payload.body',
    });
  }
  const labels = payload.labels ?? [];
  if (!Array.isArray(labels)) fail('INVALID_PAYLOAD', 'payload.labels must be an array');
  const normalizedLabels = labels.map((label, index) =>
    sanitizeChildLabel(label, `payload.labels[${index}]`),
  );
  const body = `${sourceBody.trimEnd()}\n\n${buildDecompositionKeyMarker(parent, key, 'forge')}`;
  const appended = inspectDecompositionKey(body, parent, 'forge');
  if (appended.status !== 'valid' || appended.key !== key) {
    fail('INVALID_PAYLOAD', 'payload.body cannot carry one readable final decomposition marker', {
      field: 'payload.body',
      reason: 'unreadable-appended-decomposition-marker',
    });
  }
  return {
    parent,
    decompositionKey: key,
    title,
    body,
    labels: normalizedLabels,
  };
}

function prNumber(input) {
  return requireNumber(input.number ?? input.pullRequest, 'pull-request number');
}

function mutationPlan(executable, args, stdin, metadata = {}) {
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
function teaApiReadPlan(repository, endpoint) {
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
const FORGEJO_PAGE_LIMIT = 100;
const FORGEJO_MAX_PAGES = 1000;

function forgejoPagedEndpoint(endpoint, page, limit = FORGEJO_PAGE_LIMIT) {
  const query = new URLSearchParams({ limit: String(limit), page: String(page) });
  return `${endpoint}${endpoint.includes('?') ? '&' : '?'}${query}`;
}

// The shape and the total, read off one `tea api --include` response. A body that is not an array is
// never silently treated as an empty page: on this transport a 4xx body is an object, and
// `teaApiSuccess` has already rejected those, so anything else left here is a payload nobody can
// interpret.
function forgejoListPage(response, label, page) {
  if (!Array.isArray(response.body)) {
    fail('INVALID_PAYLOAD', `${label} returned a non-list payload`, {
      ...(page === undefined ? {} : { page }),
    });
  }
  // A header that is absent, blank, or not a plain count states no total. `Number('')` is `0`, so
  // reading it numerically without this test would turn an empty header into "the forge reported
  // zero items" — and a guard whose whole job is failing closed would wave the first page through as
  // complete.
  const stated = response.headers.get('x-total-count');
  const total =
    typeof stated === 'string' && /^\d+$/.test(stated.trim()) ? Number(stated) : undefined;
  return { items: response.body, total };
}

// A single unpaginated raw-API list read. Forgejo's review-comment endpoint takes no `page` or
// `limit`, so paging it would re-request the same list until the bound ran out; it is read once and
// guarded by the header instead.
async function readForgejoList(repository, endpoint, runner, label) {
  const plan = teaApiReadPlan(repository, endpoint);
  const response = teaApiSuccess(await runChecked(runner, plan, label), label);
  const { items, total } = forgejoListPage(response, label);
  if (total !== undefined && total > items.length) {
    fail('INVALID_PAYLOAD', `${label} returned a truncated list`, {
      totalCount: total,
      returnedCount: items.length,
    });
  }
  return { items, commands: [redact(plan)] };
}

// One bounded pagination loop for every paginated Forgejo raw-API list read. It fails closed on a
// short result rather than returning a prefix, which is what a criterion evaluated over the list
// requires: an incomplete thread list would let `merge-gate` report every thread assessed while an
// unassessed finding sits open, and an incomplete issue list would let a dedup pass miss a
// duplicate.
//
// **`totalIsExact` decides whether `X-Total-Count` may prove truncation, and it is not uniform
// across the endpoints this loop serves.** On the issue and pull-request listings the header is
// counted from the same search options that produce the body, so a total above the item count means
// items are missing. On `…/pulls/{index}/reviews` it is not: `ListPullReviews` counts the `review`
// rows with `CountReviews`, while `convert.ToPullReviewList` then **omits** every pending review
// belonging to another user unless the caller is an admin. The header there legitimately exceeds the
// body, so treating it as an exact count would fail an ordinary read with `INVALID_PAYLOAD` for as
// long as a third party keeps an unsubmitted review open — and take `merge-gate` condition 7 down
// with it. For such an endpoint the header stays an upper bound: it may end the walk early but never
// condemn it, and exhaustion is proved the way `tea`'s `resp.NextPage` proved it, by paging until a
// page comes back empty. A short page is deliberately **not** the terminator: Forgejo clamps `limit`
// to `MAX_RESPONSE_ITEMS`, so a full page is routinely shorter than the page size requested.
async function readForgejoPaginated(repository, endpoint, runner, label, options = {}) {
  const limit = options.limit ?? FORGEJO_PAGE_LIMIT;
  const maxPages = options.maxPages ?? FORGEJO_MAX_PAGES;
  const totalIsExact = options.totalIsExact ?? true;
  const items = [];
  const commands = [];
  let total;
  for (let page = 1; page <= maxPages; page += 1) {
    const plan = teaApiReadPlan(repository, forgejoPagedEndpoint(endpoint, page, limit));
    commands.push(redact(plan));
    const stepLabel = `${label} page ${page}`;
    const response = teaApiSuccess(await runChecked(runner, plan, stepLabel), stepLabel);
    const parsed = forgejoListPage(response, label, page);
    if (parsed.total !== undefined) total = parsed.total;
    items.push(...parsed.items);
    if (parsed.items.length === 0 || (total !== undefined && items.length >= total)) {
      if (totalIsExact && total !== undefined && total > items.length) {
        fail('INVALID_PAYLOAD', `${label} returned a truncated list`, {
          totalCount: total,
          returnedCount: items.length,
        });
      }
      return { items, commands, pagesFetched: page };
    }
  }
  fail('UNSUPPORTED_CAPABILITY', `${label} exceeded the bounded pagination limit`, {
    maxPages,
    itemsRead: items.length,
  });
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
function forgejoIssueListEndpoint(input, repository) {
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
function forgejoPullListEndpoint(input, repository) {
  const query = new URLSearchParams({ state: input.state ?? 'open' });
  return `repos/${repository.owner}/${repository.repository}/pulls?${query}`;
}

export function buildCommandPlan(operation, input, repository) {
  requireObject(input);
  const { provider, owner, repository: repo, slug, host } = repository;
  // Both provider CLIs address the same REST path shape, so one builder serves `gh api` and
  // `tea api` alike.
  const apiEndpoint = (suffix) => `repos/${owner}/${repo}/${suffix}`;
  const ghEndpoint = apiEndpoint;
  const teaTarget = ['--login', repository.login ?? host, '--repo', slug];
  const teaJson = [...teaTarget, '--output', 'json'];
  const payload = input.payload ?? input;

  if (provider === 'github') {
    const hostArgs = ghHostArgs(repository);
    switch (operation) {
      // The account the current authentication belongs to. `gh auth status` prints the same login
      // inside human-readable prose, but this adapter reads provider JSON and nothing else, so the
      // identity is asked for as data. It rides on the repository only for its host: the credential
      // is selected per host, so the identity has to be read against the same one.
      case 'viewer-read':
        return mutationPlan('gh', ['api', ...hostArgs, 'user']);
      // `label-list` is an internal plan, deliberately absent from `REMOTE_OPERATIONS`,
      // `MUTATIONS`, and `CAPABILITY_BY_OPERATION`. It exists because the `label-create`
      // pre-check and `executeTeaPaginatedList` both build every plan through this function, and
      // a name they can construct is the cheapest way to give them one. Leaving it unregistered is
      // what keeps it internal: `executeOperation` consults `REMOTE_OPERATIONS` and refuses the
      // name from outside, so the read stays owned by the one branch whose contract defines it.
      // The explicit `per_page=100` matches this adapter's other `gh api` list reads; without it
      // the endpoint pages at 30 and
      // a target name on page 2 would be read as absent.
      case 'label-list':
        return mutationPlan('gh', [
          'api',
          ...hostArgs,
          '--paginate',
          '--slurp',
          `${ghEndpoint('labels')}?${new URLSearchParams({ per_page: '100' })}`,
        ]);
      case 'label-create':
        return mutationPlan(
          'gh',
          ['api', ...hostArgs, '-X', 'POST', ghEndpoint('labels'), '--input', '-'],
          jsonStdin({
            name: requireString(payload.name, 'name'),
            color: payload.color ?? 'ededed',
            description: payload.description ?? '',
          }),
          { tolerateAlreadyExists: true },
        );
      case 'issue-read':
        return mutationPlan(
          'gh',
          ['api', ...hostArgs, '--include', ghEndpoint(`issues/${issueNumber(input)}`)],
          undefined,
          { includesHeaders: true },
        );
      case 'issue-state-wait':
        return mutationPlan(
          'gh',
          ['api', ...hostArgs, '--include', ghEndpoint(`issues/${issueNumber(input)}`)],
          undefined,
          { includesHeaders: true, timeoutMs: ISSUE_STATE_READ_TIMEOUT_MS },
        );
      case 'issue-comments-read':
        return mutationPlan('gh', [
          'api',
          ...hostArgs,
          '--paginate',
          '--slurp',
          ghEndpoint(`issues/${issueNumber(input)}/comments`),
        ]);
      case 'issue-sub-issues-read':
        return mutationPlan('gh', [
          'api',
          ...hostArgs,
          '--paginate',
          '--slurp',
          `${ghEndpoint(`issues/${parentIssueNumber(input, repository)}/sub_issues`)}?${new URLSearchParams({ per_page: '100' })}`,
        ]);
      case 'issue-list': {
        const query = new URLSearchParams({ state: input.state ?? 'all', per_page: '100' });
        if (input.labels?.length) query.set('labels', input.labels.join(','));
        return mutationPlan('gh', [
          'api',
          ...hostArgs,
          '--paginate',
          '--slurp',
          `${ghEndpoint('issues')}?${query}`,
        ]);
      }
      case 'issue-create':
        return mutationPlan(
          'gh',
          ['api', ...hostArgs, '-X', 'POST', ghEndpoint('issues'), '--input', '-'],
          jsonStdin({
            title: assertPublishable(payload.title, 'payload.title'),
            body: assertPublishable(payload.body, 'payload.body'),
            labels: payload.labels ?? [],
          }),
        );
      case 'issue-sub-issue-create': {
        const child = childIssuePayload(input, repository);
        const args = [
          'issue',
          'create',
          ...ghRepoArgs(repository),
          '--title',
          child.title,
          '--body',
          child.body,
          '--parent',
          String(child.parent),
        ];
        for (const label of child.labels) args.push('--label', label);
        return mutationPlan('gh', args, undefined, {
          expectsJson: false,
          parent: child.parent,
          decompositionKey: child.decompositionKey,
          childPayload: child,
        });
      }
      case 'issue-update-body':
        return mutationPlan(
          'gh',
          [
            'api',
            ...hostArgs,
            '-X',
            'PATCH',
            ghEndpoint(`issues/${issueNumber(input)}`),
            '--input',
            '-',
          ],
          jsonStdin({ body: assertPublishable(payload.body, 'payload.body') }),
        );
      // A close is a state change of the issue itself, so it is a `PATCH` of the issue resource
      // exactly as `issue-update-body` is — not a `POST` to a sub-resource the way
      // `issue-label-add` is. Both body values are literals rather than payload fields: the only
      // transition this adapter offers is the one that records a completed issue, and `completed`
      // is the only state reason that statement has.
      case 'issue-close':
        assertNoIssueCloseStateOverride(input);
        return mutationPlan(
          'gh',
          [
            'api',
            ...hostArgs,
            '-X',
            'PATCH',
            ghEndpoint(`issues/${issueNumber(input)}`),
            '--input',
            '-',
          ],
          jsonStdin({ state: 'closed', state_reason: 'completed' }),
        );
      case 'issue-comment':
        return mutationPlan(
          'gh',
          [
            'api',
            ...hostArgs,
            '-X',
            'POST',
            ghEndpoint(`issues/${issueNumber(input)}/comments`),
            '--input',
            '-',
          ],
          jsonStdin({ body: assertPublishable(payload.body, 'payload.body') }),
        );
      case 'issue-comment-update': {
        issueNumber(input);
        return mutationPlan(
          'gh',
          [
            'api',
            ...hostArgs,
            '-X',
            'PATCH',
            ghEndpoint(`issues/comments/${requireNumber(input.commentId, 'commentId')}`),
            '--input',
            '-',
          ],
          jsonStdin({ body: assertPublishable(payload.body, 'payload.body') }),
        );
      }
      case 'issue-labels':
      case 'issue-label-add': {
        const labels = payload.labels ?? (payload.label ? [payload.label] : []);
        if (labels.length === 0) fail('INVALID_PAYLOAD', 'payload.labels must not be empty');
        return mutationPlan(
          'gh',
          [
            'api',
            ...hostArgs,
            '-X',
            'POST',
            ghEndpoint(`issues/${issueNumber(input)}/labels`),
            '--input',
            '-',
          ],
          jsonStdin({ labels }),
        );
      }
      case 'issue-label-remove': {
        const label = encodeURIComponent(requireString(payload.label, 'payload.label'));
        return mutationPlan('gh', [
          'api',
          ...hostArgs,
          '-X',
          'DELETE',
          ghEndpoint(`issues/${issueNumber(input)}/labels/${label}`),
        ]);
      }
      case 'pr-read':
        return mutationPlan(
          'gh',
          ['api', ...hostArgs, '--include', ghEndpoint(`pulls/${prNumber(input)}`)],
          undefined,
          { includesHeaders: true },
        );
      case 'pr-comments-read':
        return mutationPlan('gh', [
          'api',
          ...hostArgs,
          '--paginate',
          '--slurp',
          ghEndpoint(`issues/${prNumber(input)}/comments`),
        ]);
      // `--paginate --slurp` **plus** an explicit `per_page=100`, which is the pairing `label-list`,
      // `issue-list` and `pr-list` use and which `pr-comments-read` omits. `--paginate` follows the
      // `Link` header whatever the page size, so the flag alone is not wrong — it is merely thirty
      // items per request on an endpoint that serves a hundred, and a reviewer that submits a review
      // per push turns that into a request per three reviews. The gate reads this list on every
      // Phase-1 and Phase-4 evaluation, so the page size is the difference between one request and
      // several on an ordinary pull request.
      case 'pr-reviews-read': {
        const query = new URLSearchParams({ per_page: '100' });
        return mutationPlan('gh', [
          'api',
          ...hostArgs,
          '--paginate',
          '--slurp',
          `${ghEndpoint(`pulls/${prNumber(input)}/reviews`)}?${query}`,
        ]);
      }
      case 'pr-list': {
        const query = new URLSearchParams({ state: input.state ?? 'open', per_page: '100' });
        if (input.head) query.set('head', input.head);
        return mutationPlan('gh', [
          'api',
          ...hostArgs,
          '--paginate',
          '--slurp',
          `${ghEndpoint('pulls')}?${query}`,
        ]);
      }
      // One read, not two: head SHA, base ref, state, draft flag, check list, per-check requiredness,
      // and the forge's own merge state have to describe the same instant to be usable as a merge
      // precondition. `PR_STATUS_QUERY` explains why that one read is a GraphQL query.
      case 'pr-status-read':
        return mutationPlan(
          'gh',
          ['api', ...hostArgs, 'graphql', '--input', '-'],
          jsonStdin({
            query: PR_STATUS_QUERY,
            variables: { owner, repo, number: prNumber(input) },
          }),
        );
      // The watch and nothing else: `gh pr checks` refuses `--watch` together with `--json` outright,
      // so a plan carrying both is not a slow read but a guaranteed failure on every invocation.
      // `executeOperation` runs `buildChecksReadPlan` after this one for the payload.
      // The watch never carries `--required` either, no matter how the caller set that criterion.
      // `--required` filters the rollup by a per-context flag that only a context which has already
      // reported can carry, so on a branch where no required check has reported yet the filtered
      // watch finds nothing to watch and returns immediately — the wait stops waiting, which is the
      // one thing it exists for. Waiting on every check is a superset of waiting on the required
      // ones and stays bounded by the caller's `timeoutMs`, so the criterion loses nothing by
      // riding on the structured read alone.
      case 'pr-checks-wait': {
        const wait = checksWaitSettings(payload);
        return mutationPlan(
          'gh',
          [
            'pr',
            'checks',
            String(prNumber(input)),
            ...ghRepoArgs(repository),
            '--watch',
            '--interval',
            String(wait.intervalSeconds),
          ],
          undefined,
          { timeoutMs: wait.timeoutMs },
        );
      }
      case 'pr-create':
        return mutationPlan(
          'gh',
          ['api', ...hostArgs, '-X', 'POST', ghEndpoint('pulls'), '--input', '-'],
          jsonStdin({
            title: assertPublishable(payload.title, 'payload.title'),
            body: assertPublishable(payload.body, 'payload.body'),
            head: requireString(payload.head, 'payload.head'),
            base: requireString(payload.base, 'payload.base'),
            draft: payload.draft === true,
          }),
        );
      case 'pr-update-body':
        return mutationPlan(
          'gh',
          [
            'api',
            ...hostArgs,
            '-X',
            'PATCH',
            ghEndpoint(`pulls/${prNumber(input)}`),
            '--input',
            '-',
          ],
          jsonStdin({ body: assertPublishable(payload.body, 'payload.body') }),
        );
      case 'pr-comment':
        return mutationPlan(
          'gh',
          [
            'api',
            ...hostArgs,
            '-X',
            'POST',
            ghEndpoint(`issues/${prNumber(input)}/comments`),
            '--input',
            '-',
          ],
          jsonStdin({ body: assertPublishable(payload.body, 'payload.body') }),
        );
      // The merge carries the head the caller verified. `--match-head-commit` makes the provider
      // itself reject a moved head, so the guard survives even if the local precondition read and
      // the merge are separated by a push; `gh pr merge` prints prose, not JSON.
      case 'pr-merge': {
        const method = mergeMethod(payload);
        const subject = mergeSubject(payload, method);
        return mutationPlan(
          'gh',
          [
            'pr',
            'merge',
            String(prNumber(input)),
            ...ghRepoArgs(repository),
            MERGE_METHOD_FLAGS[method],
            ...(subject === undefined ? [] : ['--subject', subject]),
            '--match-head-commit',
            expectedHeadSha(payload),
          ],
          undefined,
          { expectsJson: false },
        );
      }
      case 'review-create':
        return mutationPlan(
          'gh',
          [
            'api',
            ...hostArgs,
            '-X',
            'POST',
            ghEndpoint(`pulls/${prNumber(input)}/reviews`),
            '--input',
            '-',
          ],
          jsonStdin(buildReviewPayload(payload)),
        );
      case 'review-threads-read': {
        const query = `query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100){nodes{id isResolved path line startLine diffSide comments(first:100){nodes{id databaseId url body path line originalLine startLine originalStartLine createdAt author{__typename login}}}}}}}}`;
        return mutationPlan(
          'gh',
          ['api', ...hostArgs, 'graphql', '--input', '-'],
          jsonStdin({ query, variables: { owner, repo, number: prNumber(input) } }),
        );
      }
      case 'review-thread-reply':
        return mutationPlan(
          'gh',
          [
            'api',
            ...hostArgs,
            '-X',
            'POST',
            ghEndpoint(
              `pulls/${prNumber(input)}/comments/${requireNumber(input.commentId, 'commentId')}/replies`,
            ),
            '--input',
            '-',
          ],
          jsonStdin({ body: buildThreadReplyBody(payload) }),
        );
      case 'review-thread-resolve': {
        const query = `mutation($threadId:ID!){resolveReviewThread(input:{threadId:$threadId}){thread{id isResolved}}}`;
        return mutationPlan(
          'gh',
          ['api', ...hostArgs, 'graphql', '--input', '-'],
          jsonStdin({ query, variables: { threadId: requireString(input.threadId, 'threadId') } }),
        );
      }
      default:
        fail('UNSUPPORTED_CAPABILITY', `unsupported GitHub operation: ${operation}`, { operation });
    }
  }

  // Every Forgejo read below consumes one of **two** wire formats, and which one is not visible
  // from the read site unless it says so — that invisibility is what produced every defect this
  // adapter has had in this area, #355 included. Each case therefore states its class:
  //
  // - **Class A — raw Gitea/Forgejo API JSON**, obtained through `tea api`. The JSON **tags** of
  //   `modules/structs` are the authority for every key, and the Go **field names** are not: `Index`
  //   is `number`, `Poster` is `user`, `LineNum` is `position`, `PRBranchInfo.Name` is `label`,
  //   `HTMLURL` is `html_url`. Reading a field name instead of its tag yields `undefined`, which
  //   looks like an absent value rather than an error.
  // - **Class B — tea's own CLI renderers**, obtained through `tea … --output json`. The Go tags are
  //   **irrelevant** here: `modules/print` and `cmd/detail_json.go` re-shape every value, stringify
  //   every table cell, drop what the `--fields` list did not request, and join collections into
  //   display strings. The authority is tea's source at the pinned floor, not the forge's structs.
  //
  // A new read belongs in Class A unless there is a reason it cannot be, and it states which one.
  switch (operation) {
    // Class B: tea renderer output; the authority for its keys is tea's `modules/print`, not
    // `modules/structs`. Colors arrive without a leading `#` and `index` arrives stringified.
    // See the GitHub case above for why this plan exists without a registered operation.
    // `--exclude-org` scopes the pre-check to repository labels: an organization label of the same
    // name must not suppress creating the repository-scoped one, because the worst case of a
    // redundant repository label is cosmetic while the worst case of the opposite is an issue that
    // silently never gets its label.
    case 'label-list':
      return mutationPlan('tea', [
        'labels',
        'list',
        ...teaJson,
        '--exclude-org',
        '--page',
        String(input.page ?? 1),
        '--limit',
        String(input.limit ?? 100),
      ]);
    // `expectsJson: false` matches every other tea write: tea's create commands render for humans,
    // so a JSON parse of their output is a failure mode rather than a contract. Nothing is lost —
    // the outcome this operation reports comes from the pre-check list, not from this command's
    // stdout.
    case 'label-create':
      return mutationPlan(
        'tea',
        [
          'labels',
          'create',
          ...teaJson,
          '--name',
          requireString(payload.name, 'name'),
          '--color',
          payload.color ?? 'ededed',
          '--description',
          payload.description ?? '',
        ],
        undefined,
        { tolerateAlreadyExists: true, expectsJson: false },
      );
    // Class B: tea's detail renderer (`cmd/detail_json.go`). `--fields` is ignored on this path, so
    // the object arrives whole and stringified; `labels` is an array here, not the joined string the
    // list renderer produced.
    case 'issue-read':
      return mutationPlan('tea', [
        'issues',
        String(issueNumber(input)),
        ...teaJson,
        '--fields',
        'index,title,state,body,labels,url',
      ]);
    case 'issue-state-wait':
      return mutationPlan(
        'tea',
        [
          'issues',
          String(issueNumber(input)),
          ...teaJson,
          '--fields',
          'index,title,state,body,labels,url',
        ],
        undefined,
        { timeoutMs: ISSUE_STATE_READ_TIMEOUT_MS },
      );
    // Class B: tea renderer output.
    case 'issue-comments-read':
      return mutationPlan('tea', [
        'issues',
        String(issueNumber(input)),
        ...teaJson,
        '--comments',
        '--fields',
        'index,comments',
      ]);
    // Class A: raw Gitea/Forgejo API JSON, read through the `modules/structs` tags — `Index` is
    // `number`, `Poster` is `user`. `tea issues list` is deliberately not used and could not be
    // repaired in place: its renderer joins `Labels` into one whitespace-separated string, and Gitea
    // permits a space inside a label name, so that string cannot be decoded back into the set it
    // came from. The raw API states `Labels` as a real array.
    //
    // The builder answers with page 1; the reader pages to exhaustion and guards `X-Total-Count`.
    case 'issue-list':
      return teaApiReadPlan(
        repository,
        forgejoPagedEndpoint(
          forgejoIssueListEndpoint(input, repository),
          input.page ?? 1,
          input.limit ?? FORGEJO_PAGE_LIMIT,
        ),
      );
    case 'issue-create': {
      const args = [
        'issues',
        'create',
        ...teaTarget,
        '--title',
        assertPublishable(payload.title, 'payload.title'),
        '--description',
        assertPublishable(payload.body, 'payload.body'),
      ];
      if (payload.labels?.length) args.push('--labels', payload.labels.join(','));
      return mutationPlan('tea', args, undefined, { expectsJson: false });
    }
    case 'issue-sub-issues-read':
    case 'issue-sub-issue-create':
      fail('UNSUPPORTED_CAPABILITY', `installed tea adapter does not safely support ${operation}`, {
        operation,
        provider: 'forgejo',
      });
    case 'issue-update-body':
      return mutationPlan(
        'tea',
        [
          'issues',
          'edit',
          String(issueNumber(input)),
          ...teaTarget,
          '--description',
          assertPublishable(payload.body, 'payload.body'),
        ],
        undefined,
        { expectsJson: false },
      );
    // The close rides the `tea api` transport, which is what lets its capability derive from a
    // probe that already runs — but it carries `--include`, and `issue-comment-update` does not.
    // That divergence is deliberate and is the whole point of the case. `tea api` never inspects
    // `resp.StatusCode` and exits 0 on every 4xx and 5xx alike (see `teaApiReadPlan` above), so
    // without the status line a refusal arrives as an ordinary body and a close the forge rejected
    // would be reported to the operator as a completed transition. The refusals are ordinary rather
    // than exotic — a token without `write:issue`, a locked or archived issue, a rate limit, and
    // Gitea's 412 for an issue with open blocking dependencies, which is exactly the population an
    // issue assessed as complete belongs to. `pr-merge` is the precedent this follows, not
    // `issue-comment-update`: both are state mutations, and it carries the flag for this reason.
    //
    // The body travels on stdin for the reason the merge body does: the dry-run preview publishes
    // the argv, so an inline `--data '<json>'` would put the request body into that preview. It
    // carries the state alone — Forgejo states no state reason on an issue, so GitHub's
    // `completed` has nothing here to map onto.
    case 'issue-close':
      assertNoIssueCloseStateOverride(input);
      return mutationPlan(
        'tea',
        [
          'api',
          apiEndpoint(`issues/${issueNumber(input)}`),
          '--method',
          'PATCH',
          '--include',
          ...teaTarget,
          '--data',
          '@-',
        ],
        jsonStdin({ state: 'closed' }),
      );
    case 'issue-comment':
      return mutationPlan('tea', [
        'comment',
        String(issueNumber(input)),
        ...teaJson,
        assertPublishable(payload.body, 'payload.body'),
      ]);
    case 'issue-comment-update':
      return mutationPlan(
        'tea',
        [
          'api',
          `repos/${owner}/${repo}/issues/${issueNumber(input)}/comments/${requireNumber(input.commentId, 'commentId')}`,
          '--method',
          'PATCH',
          ...teaTarget,
          '--data',
          '@-',
        ],
        jsonStdin({ body: assertPublishable(payload.body, 'payload.body') }),
      );
    case 'issue-labels':
    case 'issue-label-add': {
      const labels = payload.labels ?? (payload.label ? [payload.label] : []);
      if (labels.length === 0) fail('INVALID_PAYLOAD', 'payload.labels must not be empty');
      return mutationPlan(
        'tea',
        [
          'issues',
          'edit',
          String(issueNumber(input)),
          ...teaTarget,
          '--add-labels',
          labels.map((label) => requireString(label, 'payload label')).join(','),
        ],
        undefined,
        { expectsJson: false },
      );
    }
    case 'issue-label-remove':
      return mutationPlan(
        'tea',
        [
          'issues',
          'edit',
          String(issueNumber(input)),
          ...teaTarget,
          '--remove-labels',
          requireString(payload.label, 'payload.label'),
        ],
        undefined,
        { expectsJson: false },
      );
    // Class B: tea's detail renderer, as `issue-read` is.
    case 'pr-read':
      return mutationPlan('tea', [
        'pulls',
        String(prNumber(input)),
        ...teaJson,
        '--fields',
        'index,title,state,body,labels,url,head,base',
      ]);
    // Class B: tea renderer output.
    case 'pr-comments-read':
      return mutationPlan('tea', [
        'pulls',
        String(prNumber(input)),
        ...teaJson,
        '--comments',
        '--fields',
        'index,comments',
      ]);
    // Class A, and no field selection: the raw API always returns the complete object, including
    // `head`, `base` and `draft`. Two values change with the move and both are corrections. `head`
    // becomes the bare branch name — tea's `formatPRHead` prefixed `owner:` for a cross-fork head,
    // which no other provider path does and which nothing downstream parsed; `normalizeBranchRef`
    // owns which of the object's two branch keys states it. And `draft` becomes real: tea's list
    // renderer never carried it, so it fell through to `false` on every Forgejo pull request, and a
    // draft one will now be reported as one.
    case 'pr-list':
      return teaApiReadPlan(
        repository,
        forgejoPagedEndpoint(
          forgejoPullListEndpoint(input, repository),
          input.page ?? 1,
          input.limit ?? FORGEJO_PAGE_LIMIT,
        ),
      );
    case 'pr-create':
      return mutationPlan(
        'tea',
        [
          'pulls',
          'create',
          ...teaTarget,
          '--title',
          assertPublishable(payload.title, 'payload.title'),
          '--description',
          assertPublishable(payload.body, 'payload.body'),
          '--head',
          requireString(payload.head, 'payload.head'),
          '--base',
          requireString(payload.base, 'payload.base'),
          ...(payload.draft === true ? ['--draft'] : []),
        ],
        undefined,
        { expectsJson: false },
      );
    case 'pr-update-body':
      return mutationPlan(
        'tea',
        [
          'pulls',
          'edit',
          String(prNumber(input)),
          ...teaTarget,
          '--description',
          assertPublishable(payload.body, 'payload.body'),
        ],
        undefined,
        { expectsJson: false },
      );
    case 'pr-comment':
      return mutationPlan('tea', [
        'comment',
        String(prNumber(input)),
        ...teaJson,
        assertPublishable(payload.body, 'payload.body'),
      ]);
    // Call 1 of the review-thread walk, and the only one this builder can answer. Neither forge
    // exposes a flat review-comment listing — Forgejo's router declares
    // `GET …/pulls/{index}/reviews` and `GET …/pulls/{index}/reviews/{id}/comments` and nothing
    // between them — so the comment reads are addressed by the review IDs call 1 returns and are
    // not knowable before it has run. `readForgejoReviewThreads` issues them and publishes every
    // preview in `data.commands`, exactly as `readForgejoPullRequestStatus` does.
    //
    // The `tea pulls review-comments` renderer is deliberately not used here, and could not be
    // repaired in place: `modules/print` renders `reviewer` through `formatUserName`, which returns
    // the display name whenever the account has one, so **no login is obtainable from that surface
    // at all** — and the field list carries no timestamp under any spelling. Both are read here
    // from the raw API, where `modules/structs` states them.
    case 'review-threads-read':
      return teaApiReadPlan(
        repository,
        forgejoPagedEndpoint(apiEndpoint(`pulls/${prNumber(input)}/reviews`), 1),
      );
    // Class A: raw API JSON (`modules/structs.PullReview`), and the **same** endpoint the
    // review-thread walk pages — this operation is that walk's call 1 without its per-review comment
    // fan-out, kept as an operation of its own because the review object itself is what a verdict
    // lives on and the thread walk discards everything but `id`. The preview is page 1 alone;
    // `executeOperation` pages it and publishes every request in `data.commands`.
    case 'pr-reviews-read':
      return teaApiReadPlan(
        repository,
        forgejoPagedEndpoint(apiEndpoint(`pulls/${prNumber(input)}/reviews`), 1),
      );
    // Class A: raw API JSON (`modules/structs.User`).
    // The identity read is credential-scoped, not repository-scoped: `--login` selects the
    // credential and `tea api user` answers for exactly that one, so no `--repo` is passed at all.
    // It deliberately does not read `tea logins list`, which reports the locally configured logins —
    // a client-side setting rather than the account the forge attributes a write to. The two can
    // differ, and a caller that separates its own comments from a person's would then claim a
    // stranger's comment as its own.
    case 'viewer-read':
      return mutationPlan('tea', ['api', 'user', '--include', '--login', repository.login ?? host]);
    // Class A: raw API JSON (`modules/structs.PullRequest`, `CombinedStatus`, `Commit`).
    // Call 1 of three, and the only one this builder can answer. The head SHA it returns is what
    // addresses calls 2 and 3, so they are not knowable before it has run;
    // `readForgejoPullRequestStatus` issues them and publishes all three previews in
    // `data.commands`. The existing `tea pulls … --output json` renderer is deliberately not used
    // here: it carries no `mergeable`, no `draft` and no head SHA, so a merge guard built on it
    // would fail `STALE_WRITE` on every merge.
    case 'pr-status-read':
      return teaApiReadPlan(repository, apiEndpoint(`pulls/${prNumber(input)}`));
    // The merge runs through `tea api` rather than through `tea pulls merge`, because
    // `MergePullRequestOption` accepts `head_commit_id` and the porcelain subcommand exposes no way
    // to send it. That field is the atomic server-side head guard `gh --match-head-commit` provides,
    // and the merge is the most irreversible mutation in the set, so it keeps that guard. The body
    // travels on stdin via `--data @-` exactly as `issue-comment-update` does: the dry-run preview
    // publishes the argv, so an inline `--data '<json>'` would put the merge body into the preview.
    // It carries no `force_merge` (which would bypass the branch protection this adapter relies on
    // for the merge states Forgejo does not report), no `merge_when_checks_succeed` (which would
    // turn a guarded synchronous merge into a deferred one the gate never observes), and no
    // `delete_branch_after_merge`.
    case 'pr-merge': {
      const method = mergeMethod(payload);
      const subject = mergeSubject(payload, method);
      return mutationPlan(
        'tea',
        [
          'api',
          apiEndpoint(`pulls/${prNumber(input)}/merge`),
          '--method',
          'POST',
          '--include',
          ...teaTarget,
          '--data',
          '@-',
        ],
        // The mixed spelling of this body is not an inconsistency but the wire format itself.
        // Forgejo's `MergePullRequestForm` (`services/forms/repo_form.go`, branch `forgejo`) tags
        // only some of its fields: `HeadCommitID` carries `json:"head_commit_id,omitempty"`, while
        // `Do`, `MergeTitleField`, `MergeMessageField` and `MergeCommitID` carry **no** json tag at
        // all, so their wire key is the Go field name. Go's `encoding/json` — and the jsoniter
        // config Forgejo runs in standard-library-compatible mode — matches an incoming key to a
        // field name case-insensitively but performs **no** snake_case conversion, so a
        // helpfully-normalized `merge_title_field` would never bind and the subject would be
        // dropped without a word on every squash merge. That is exactly the failure pinning the
        // subject exists to prevent: a squash subject that is not a Conventional Commit drops the
        // change from the changelog silently. Verify against Forgejo before "tidying" this body —
        // upstream go-gitea/gitea has since tagged every field of the same struct, and reading the
        // Gitea source instead is the way to arrive confidently at the broken spelling.
        jsonStdin({
          Do: method,
          head_commit_id: expectedHeadSha(payload),
          ...(subject === undefined ? {} : { MergeTitleField: subject }),
        }),
      );
    }
    // These three stay refused. `tea` has no `checks` subcommand and Forgejo offers no server-side
    // blocking watch comparable to `gh pr checks --watch`, so `pr-checks-wait` would have to become
    // the poll loop the gate explicitly rejects; the documented no-watch degradation carries it
    // instead. The two review operations have no verified tea surface either.
    // `review-thread-resolve` joins them: `tea pulls resolve` exists as a client subcommand, but
    // the route behind it does not. Forgejo's `/pulls` router group declares no `resolve`,
    // `unresolve` or `replies` path at any nesting level, where Gitea `main` declares all three, and
    // a live instance confirms it — see the user guide. The former `--help` probe attested the
    // subcommand and never the route, so it reported a write capability the forge does not serve.
    case 'review-create':
    case 'review-thread-reply':
    case 'review-thread-resolve':
    case 'pr-checks-wait':
      fail('UNSUPPORTED_CAPABILITY', `installed tea adapter does not safely support ${operation}`, {
        operation,
        provider: 'forgejo',
      });
    default:
      fail('UNSUPPORTED_CAPABILITY', `unsupported Forgejo operation: ${operation}`, { operation });
  }
}

function parseJsonOutput(result, label) {
  const text = result.stdout.trim();
  if (text === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    fail('INVALID_PAYLOAD', `${label} returned malformed JSON`, {
      stdout: redact(text.slice(0, 500)),
    });
  }
}

// tea prints result URLs as OSC 8 terminal hyperlinks, so its human output carries escape
// sequences even when stdout is a pipe. Remove whole sequences rather than stripping ESC
// characters: OSC 8 embeds its target URI inside the opening marker, so a character-level strip
// would leave `]8;id=…;https://…` fragments behind and make the text harder to parse, not easier.
// Both terminators are covered because tea's choice varies by build. An unterminated sequence
// simply does not match and survives into the output, where it stays visible for diagnosis.
const ANSI_SEQUENCE = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b\[[0-9;?]*[ -/]*[@-~]/g;

function stripAnsiSequences(text) {
  return text.replace(ANSI_SEQUENCE, '');
}

function parseCommandOutput(result, plan, label) {
  const text = result.stdout.trim();
  // Only the human-rendered branch is sanitized. Structured output is parsed as-is, because a
  // stripper run over JSON could corrupt legitimate string content.
  if (plan.expectsJson === false) {
    return { raw: { completed: true, output: stripAnsiSequences(text) } };
  }
  if (!plan.includesHeaders || !/^HTTP\/\S+\s+\d+/i.test(text)) {
    return { raw: parseJsonOutput(result, label) };
  }
  const boundary = text.search(/\r?\n\r?\n/);
  if (boundary === -1) {
    fail('INVALID_PAYLOAD', `${label} returned malformed HTTP headers`);
  }
  const headerText = text.slice(0, boundary);
  const body = text.slice(boundary).replace(/^\r?\n\r?\n/, '');
  const etag = headerText.match(/^etag:\s*(.+)$/im)?.[1]?.trim();
  return {
    raw: parseJsonOutput({ ...result, stdout: body }, label),
    ...(etag ? { version: etag } : {}),
  };
}

// The response of a `tea api --include` call, split into its status, its headers and its body.
// `parseCommandOutput`'s `includesHeaders` branch cannot serve this: tea writes the status line and
// the header block to **stderr** where `gh --include` writes them to stdout, so that branch would
// find plain JSON on stdout, take the early return, and hand a 403 body on as data. The last status
// line wins, so an intermediate redirect never masks the response that actually answered.
//
// The body is **not** parsed here, and that ordering is the contract rather than a refactoring
// convenience: only a 2xx body is data, and only a caller that has read the status knows which it
// holds. Parsing eagerly made the strict JSON parse decide the outcome before the status was ever
// inspected, so a 5xx a reverse proxy answered with an HTML error page became a plain
// `INVALID_PAYLOAD` — losing the `mutationMayHaveSucceeded` flag on exactly the mutations whose
// documented recovery is a state re-read. A non-JSON body is a diagnostic on that path, never a
// reason to discard a status the forge did state.
function readTeaApiResponse(result, label) {
  const headerText = stripAnsiSequences(result?.stderr ?? '');
  const statusLines = [...headerText.matchAll(/^HTTP\/\S+\s+(\d{3})\b/gim)];
  if (statusLines.length === 0) {
    fail('INVALID_PAYLOAD', `${label} returned no HTTP status line`, {
      stderr: redact(headerText.slice(0, 500)),
    });
  }
  const headers = new Map();
  for (const line of headerText.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9-]+):\s*(.*)$/);
    if (match) headers.set(match[1].toLowerCase(), match[2].trim());
  }
  return {
    status: Number(statusLines.at(-1)[1]),
    headers,
    // Strict: a 2xx body that is not JSON is a provider payload nobody can read, and that is an
    // `INVALID_PAYLOAD` exactly as before. Callers invoke this only after the status admitted the
    // body as data.
    readBody: () => parseJsonOutput(result, label),
  };
}

// The tolerant counterpart, for a status that already decided the outcome. It reports whatever
// object the body happens to be so `teaApiMessage` can quote the forge's own wording, and reports
// nothing at all when the body is empty or is not JSON. It never fails: on this path the status is
// the verdict, and an unparseable diagnostic must not be able to overrule it.
function teaApiDiagnosticBody(result) {
  const text = typeof result?.stdout === 'string' ? result.stdout.trim() : '';
  if (text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isTeaApiIncludePlan(plan) {
  return plan.executable === 'tea' && plan.args[0] === 'api' && plan.args.includes('--include');
}

function teaApiMessage(body) {
  return typeof body?.message === 'string' && body.message.trim() !== ''
    ? redact(body.message.trim())
    : undefined;
}

// The three operations whose documented recovery is "never re-run after
// `mutationMayHaveSucceeded: true`; re-read the state instead". Every failure path that can end one
// of them has to agree about which three they are, so the membership lives here rather than in each
// path: `runChecked` reads it when the CLI itself failed, and `teaApiSuccess` reads it when
// `tea api` exited 0 and the forge answered 5xx, which on that transport is the same ambiguity
// wearing a status line. Two copies of the rule are what let a Forgejo `issue-close` take the one
// path neither of them covered.
const POSSIBLY_APPLIED_MUTATIONS = new Set(['pr-merge', 'issue-sub-issue-create', 'issue-close']);

function mutationMayHaveApplied(label) {
  return POSSIBLY_APPLIED_MUTATIONS.has(label);
}

// A non-2xx status becomes a structured error rather than data. A 4xx is never retryable: an auth,
// path or permission failure repeats identically. A 5xx is retryable for a read, which observes
// nothing and changes nothing by being repeated — but for one of the mutations above it is the
// ambiguous outcome this transport would otherwise hide. `tea api` exits 0 whatever the status, so
// such a 5xx never reaches `runChecked`'s exit-code tolerance and would be reported as a plain
// retryable refusal: the forge may have applied the request before it failed to answer, and a
// caller that reads that as "the forge did not act" retries a write that already landed and skips
// the re-read the operation documents. It is reported as possibly applied and non-retryable
// instead, and its message stops claiming a refusal nobody stated.
function teaApiSuccess(result, label) {
  const response = readTeaApiResponse(result, label);
  if (response.status < 200 || response.status >= 300) {
    // Read tolerantly, because the status has already decided this. A forge behind a reverse proxy
    // answers a 502 with that proxy's HTML error page, and a strict parse of it would raise
    // `INVALID_PAYLOAD` and take the flag below with it.
    const message = teaApiMessage(teaApiDiagnosticBody(result));
    const mayHaveApplied = response.status >= 500 && mutationMayHaveApplied(label);
    fail(
      'COMMAND_FAILED',
      mayHaveApplied ? `${label} left its outcome unstated` : `${label} was refused by the forge`,
      {
        status: response.status,
        ...(message === undefined ? {} : { message }),
        ...(mayHaveApplied ? { mutationMayHaveSucceeded: true } : {}),
      },
      response.status >= 500 && !mayHaveApplied,
    );
  }
  return { status: response.status, headers: response.headers, body: response.readBody() };
}

// `gh pr checks` reports "the checks are still pending" through exit code 8 rather than through its
// payload, and a wait that outruns the plan's timeout is killed by the process runner. Both are the
// documented outcome of a bounded wait, not a failure, so they become a result here instead of a
// COMMAND_FAILED. A watch killed while writing can leave a truncated payload behind; the truncation
// is dropped so the timeout is still reported as a timeout and not as malformed provider JSON.
const CHECKS_PENDING_EXIT_CODE = 8;

function isChecksWaitTimeout(result) {
  if (!result) return false;
  if (result.status === CHECKS_PENDING_EXIT_CODE) return true;
  if (result.timedOut === true || result.error?.code === 'ETIMEDOUT') return true;
  return result.status === null && typeof result.signal === 'string' && result.signal !== '';
}

function parsableJsonOrEmpty(text) {
  const value = typeof text === 'string' ? text : '';
  if (value.trim() === '') return '';
  try {
    JSON.parse(value);
    return value;
  } catch {
    return '';
  }
}

function isJsonArrayPayload(text) {
  const value = typeof text === 'string' ? text.trim() : '';
  if (!value.startsWith('[')) return false;
  try {
    return Array.isArray(JSON.parse(value));
  } catch {
    return false;
  }
}

// `gh pr checks --required` filters the rollup by a per-context `isRequired` flag, and only a
// context that has already reported carries one. The filtered list therefore comes back empty in
// two different situations — the forge defines no required checks, and required checks are defined
// but none of them has reported yet — and gh answers both the same way: a non-zero exit, an empty
// payload, and a stderr line claiming no more than that no required check was reported. This
// predicate recognizes that response and nothing beyond it, which is why what follows from it is
// deliberately weak. Both halves of the match carry weight: without the flag this would reach reads
// that never asked for the criterion, and without the phrase every failed `--required` read — an
// unresolvable reference, an expired token — would pass as satisfied, which is the exact class of
// defect the surrounding rules were written against. The message names the head branch rather than
// the base, so the branch name inside it proves nothing about the criterion and is deliberately not
// part of the match.
const NO_REQUIRED_CHECKS_STDERR = 'no required checks reported';

// A create that lost a race against a concurrent run is not a failed command, but recognizing that
// means reading the right stream. `gh api` writes the provider's error body to **stdout** on a
// non-zero exit and puts only its own one-line summary (`gh: Validation Failed (HTTP 422)`) on
// stderr, so a predicate over stderr — which is what this code did before — could never match, and
// the tolerance it guarded had never once fired. The machine-readable reason lives in the body:
// GitHub answers a duplicate label with `errors: [{ code: 'already_exists' }]`. The parse is
// defensive because stdout is whatever the provider sent, including nothing at all; anything that
// is not that exact shape falls through to COMMAND_FAILED, which is the honest answer for it.
function reportsAlreadyExists(result) {
  const text = typeof result?.stdout === 'string' ? result.stdout.trim() : '';
  if (text === '') return false;
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return false;
  }
  return (
    Array.isArray(payload?.errors) &&
    payload.errors.some((entry) => entry?.code === 'already_exists')
  );
}

function isNoRequiredChecksResponse(result, plan) {
  if (!result || result.status === 0) return false;
  if (!plan.args.includes('--required')) return false;
  return (result.stderr ?? '').includes(NO_REQUIRED_CHECKS_STDERR);
}

async function runChecked(runner, plan, label) {
  const result = await runner(plan);
  if (result?.error?.code === 'ENOENT') {
    fail('CLI_MISSING', `${plan.executable} is not installed`, { executable: plan.executable });
  }
  // The watch half of the wait is asked for nothing but the blocking itself. Its stdout is a TSV
  // table it may reprint several times, and its exit status conflates a red check with a broken
  // invocation, so both belong to the JSON read that follows rather than here. Exactly one fact
  // survives — that the bound elapsed or the checks were still pending when gh gave up — because
  // nothing downstream can observe it. Treating any other exit as a failure would turn a finished
  // watch over a red check into a COMMAND_FAILED and withhold the list the caller waited for; a
  // missing gh is already caught above and stays a CLI_MISSING.
  if (label === 'pr-checks-watch') {
    return isChecksWaitTimeout(result) ? { ...result, timedOut: true } : result;
  }
  if (label === 'pr-checks-wait') {
    if (isChecksWaitTimeout(result)) {
      return { ...result, status: 0, stdout: parsableJsonOrEmpty(result.stdout), timedOut: true };
    }
    // A red check also makes `gh pr checks` exit non-zero, although it printed exactly the check
    // list the caller asked for. A finished watch with a failing check is the outcome the gate has
    // to read, not a failed command, so a non-zero exit that carries a check list stays a result.
    // An operational failure — no checks, bad reference, missing auth — prints no list and keeps
    // falling through to COMMAND_FAILED below.
    if (result && result.status !== 0 && isJsonArrayPayload(result.stdout)) {
      return { ...result, status: 0 };
    }
    // "No required check was reported" describes an empty query result, not a broken command, so it
    // becomes a successful envelope carrying a discriminator instead of a COMMAND_FAILED. The
    // discriminator records what gh reported and stops there: it does not prove that the branch
    // defines no required checks, so nothing here concludes that the wait is over. The rule sits
    // last on purpose: the timeout and the red-check rules above still decide everything they
    // decided before, and only what would otherwise fail reaches this point. stdout is emptied
    // rather than filled with a synthetic list, because an empty payload is what already makes the
    // normalizer report no rollup and an empty list; inventing one would claim checks that ran.
    if (isNoRequiredChecksResponse(result, plan)) {
      return { ...result, status: 0, stdout: '', requiredChecksDefined: false };
    }
  }
  if (!result || result.status !== 0) {
    // The tolerance is keyed on the plan's own metadata rather than on the step label, because a
    // label is display text: the moment a caller renames its step — which `label-create` now does,
    // since it runs two commands — a string comparison would silently stop tolerating the race it
    // was written for. It signals on the runner result instead of through a synthetic stdout
    // sentinel, following the `requiredChecksDefined` idiom above: a caller that has to reshape
    // stdout to state a fact about the run is stating it in the wrong place.
    if (plan.tolerateAlreadyExists === true && reportsAlreadyExists(result)) {
      return { ...result, status: 0, stdout: '', alreadyExists: true };
    }
    // A failed merge, a failed parent-aware issue create, or a failed issue close is not safely
    // retryable: the forge may have accepted it before the connection dropped, so a second attempt
    // could act on state nobody verified. The caller has to re-read instead — the same discipline
    // the human-output create normalizers require when a successful command yields no usable result
    // URL. `issue-close` earns its place for the re-read half rather than the retry half: repeating
    // the PATCH would be harmless, but the flag is the only thing that tells a caller the forge may
    // already have acted, and a caller that reads its absence as "nothing happened" leaves the
    // in-progress label on a closed issue and its container entry open. Membership is therefore
    // decided by the operation's documented recovery — each of these three is documented as "never
    // re-run after `mutationMayHaveSucceeded: true`; re-read the state instead" — and not by whether
    // a repeat would duplicate anything. The membership itself lives beside `teaApiSuccess`, which
    // applies the same three to a 5xx the forge did state: on the `tea api` transport that failure
    // exits 0 and never reaches this exit-code path at all.
    const mayHaveApplied = mutationMayHaveApplied(label);
    fail(
      'COMMAND_FAILED',
      `${label} failed`,
      {
        executable: plan.executable,
        args: redact(plan.args),
        status: result?.status,
        stderr: redact(result?.stderr ?? ''),
        ...(mayHaveApplied ? { mutationMayHaveSucceeded: true } : {}),
      },
      !mayHaveApplied,
    );
  }
  return result;
}

function parseCliVersion(text, executable) {
  const match = text.match(/\b(\d+)\.(\d+)\.(\d+)\b/);
  if (!match) {
    fail('UNSUPPORTED_CAPABILITY', `${executable} version output is not supported`, {
      capability: 'version',
      version: redact(text.trim()),
    });
  }
  return match.slice(1).map(Number);
}

function meetsMinimumVersion(actual, minimum) {
  for (let index = 0; index < minimum.length; index += 1) {
    if (actual[index] > minimum[index]) return true;
    if (actual[index] < minimum[index]) return false;
  }
  return true;
}

function assertMinimumVersion(actual, minimum, executable) {
  if (meetsMinimumVersion(actual, minimum)) return;
  fail('UNSUPPORTED_CAPABILITY', `${executable} is too old for the remote-tracker adapter`, {
    capability: 'version',
    installed: actual.join('.'),
    minimum: minimum.join('.'),
  });
}

// The pull-request gate needs four flags that all postdate the adapter's general gh floor, so it
// gets its own floor rather than a blanket "recent enough" assumption. The binding one is
// `gh pr checks --json`, released in gh 2.50.0 (cli/cli#9079); `--watch` (2.5), `--match-head-commit`
// (2.14), and `--required` (2.16) are older. Below this line the three capabilities are reported as
// unsupported, so a run degrades to report-only instead of failing mid-merge on an unknown flag.
// Availability is not compatibility: at and above this floor `gh pr checks` still rejects `--watch`
// together with `--json`, which is why the wait runs a watch and a read as two commands instead of
// one. `--required` does combine with `--json`, so the criterion rides along on the read. The floor
// stays where it is regardless — the read still needs `--json`.
const GH_PR_GATE_MINIMUM_VERSION = Object.freeze([2, 50, 0]);

async function probeTeaHelp(runner, args, required = []) {
  const result = await runner({ executable: 'tea', args: [...args, '--help'] });
  if (!result || result.status !== 0) return false;
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  return required.every((token) => output.includes(token));
}

async function probeGhHelp(runner, args, required = []) {
  const result = await runner({ executable: 'gh', args: [...args, '--help'] });
  if (!result || result.status !== 0) return false;
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  return required.every((token) => output.includes(token));
}

export async function probeProvider(repository, runner, requestedCapabilities) {
  if (typeof runner !== 'function') {
    fail('INVALID_PAYLOAD', 'probeProvider requires an injected process runner');
  }
  const executable = repository.provider === 'github' ? 'gh' : 'tea';
  const versionResult = await runner({ executable, args: ['--version'] });
  if (versionResult?.error?.code === 'ENOENT') {
    fail('CLI_MISSING', `${executable} is not installed`, { executable });
  }
  if (!versionResult || versionResult.status !== 0) {
    fail('COMMAND_FAILED', `could not determine ${executable} version`, {
      executable,
      stderr: redact(versionResult?.stderr ?? ''),
    });
  }
  const version = versionResult.stdout.trim().split(/\r?\n/)[0];
  const versionTuple = parseCliVersion(versionResult.stdout, executable);
  assertMinimumVersion(
    versionTuple,
    // tea 0.14.2 is the first release whose `pulls create` accepts a `--repo` slug together with an
    // explicit `--head`; 0.14.1 rejects that combination outright.
    repository.provider === 'github' ? [2, 0, 0] : [0, 14, 2],
    executable,
  );
  if (repository.provider === 'github') {
    const auth = await runner({
      executable,
      args: ['auth', 'status', '--hostname', repository.host],
    });
    if (!auth || auth.status !== 0) {
      fail('AUTH_FAILED', `gh is not authenticated for ${repository.host}`, {
        host: repository.host,
        stderr: redact(auth?.stderr ?? ''),
      });
    }
    // Native sub-issue creation is deliberately tied to the installed porcelain surface rather
    // than to a guessed gh version. The operation is atomic only when `issue create` itself accepts
    // `--parent`; without that flag the adapter must fail before it can create a standalone issue.
    const probeSubIssueCreate =
      requestedCapabilities === undefined || requestedCapabilities.issueSubIssueCreate === true;
    const issueSubIssueCreate = probeSubIssueCreate
      ? await probeGhHelp(runner, ['issue', 'create'], ['--parent'])
      : undefined;
    // Read from the version already parsed above — the floor costs no extra spawn.
    const gateSupported = meetsMinimumVersion(versionTuple, GH_PR_GATE_MINIMUM_VERSION);
    return {
      executable,
      version,
      authenticated: true,
      capabilities: {
        json: true,
        // `gh api user` needs no flag beyond the ones every 2.x line has and no scope beyond the
        // ones an authenticated gh already holds, so it is not tied to the gate's version floor.
        viewerRead: true,
        issues: true,
        issueRead: true,
        issueCommentsRead: true,
        issueList: true,
        issueCreate: true,
        issueSubIssuesRead: true,
        ...(issueSubIssueCreate === undefined ? {} : { issueSubIssueCreate }),
        issueUpdate: true,
        issueClose: true,
        issueComment: true,
        issueCommentUpdate: true,
        issueLabelAdd: true,
        issueLabelRemove: true,
        labelMigration: true,
        pullRequests: true,
        pullRequestRead: true,
        prCommentsRead: true,
        prReviewsRead: true,
        pullRequestList: true,
        // Tied to the gate's own version floor: an older gh parses none of the flags these three
        // operations depend on, and an unsupported capability is the honest answer there — not a
        // command plan that dies at runtime with a retryable failure.
        pullRequestStatus: gateSupported,
        pullRequestChecksWait: gateSupported,
        pullRequestMerge: gateSupported,
        pullRequestCreate: true,
        pullRequestUpdate: true,
        prComment: true,
        comments: true,
        labels: true,
        labelList: true,
        labelCreate: true,
        reviewCreate: true,
        reviewThreads: true,
        reviewThreadReplies: true,
        reviewThreadResolution: true,
        conditionalWrites: false,
      },
    };
  }
  const auth = await runner({ executable, args: ['logins', 'list', '--output', 'json'] });
  if (!auth || auth.status !== 0) {
    fail('AUTH_FAILED', `tea has no usable login for ${repository.host}`, {
      host: repository.host,
      stderr: redact(auth?.stderr ?? ''),
    });
  }
  let logins;
  try {
    logins = parseJsonOutput(auth, 'tea logins');
  } catch (error) {
    if (error.code === 'INVALID_PAYLOAD') {
      fail('UNSUPPORTED_CAPABILITY', 'tea login output does not provide usable JSON', {
        capability: 'json',
      });
    }
    throw error;
  }
  const loginList = Array.isArray(logins) ? logins : (logins?.logins ?? []);
  const login = matchingTeaLogin(loginList, repository.host);
  if (!login) {
    fail('AUTH_FAILED', `tea has no login matching ${repository.host}`, { host: repository.host });
  }
  const [
    issues,
    issueComments,
    issueCreate,
    issueUpdate,
    issueLabelAdd,
    issueLabelRemove,
    pulls,
    pullComments,
    pullCreate,
    pullCreateDraft,
    pullEdit,
    comment,
    commentUpdate,
    labelCreate,
    labelList,
    apiInclude,
  ] = await Promise.all([
    probeTeaHelp(runner, ['issues'], ['--output']),
    probeTeaHelp(runner, ['issues'], ['--comments']),
    probeTeaHelp(runner, ['issues', 'create'], ['--title', '--description']),
    probeTeaHelp(runner, ['issues', 'edit'], ['--description']),
    probeTeaHelp(runner, ['issues', 'edit'], ['--add-labels']),
    probeTeaHelp(runner, ['issues', 'edit'], ['--remove-labels']),
    probeTeaHelp(runner, ['pulls'], ['--output']),
    probeTeaHelp(runner, ['pulls'], ['--comments']),
    probeTeaHelp(runner, ['pulls', 'create'], ['--head', '--base']),
    probeTeaHelp(runner, ['pulls', 'create'], ['--draft']),
    probeTeaHelp(runner, ['pulls', 'edit'], ['--description']),
    probeTeaHelp(runner, ['comment'], ['--output']),
    probeTeaHelp(runner, ['api'], ['--method', '--data']),
    probeTeaHelp(runner, ['labels', 'create'], ['--output', '--name']),
    // Label creation is idempotent only because it reads the existing labels first, so the read is
    // part of the create's contract and every flag that read depends on is probed, not just
    // `--output`. An older tea missing any of them would otherwise fail the pre-check with an
    // unstructured COMMAND_FAILED on an unknown flag instead of reporting an unsupported
    // capability.
    probeTeaHelp(runner, ['labels', 'list'], ['--output', '--exclude-org', '--page', '--limit']),
    // The one probe decision 7 requires. `tea api` itself landed in v0.12.0, below this adapter's
    // 0.14.2 floor, so the transport needs no new version floor; `--include` is source-verified for
    // `v0.15.1`/`main` only, so it is probed rather than assumed and the floor stays where it is.
    probeTeaHelp(runner, ['api'], ['--include']),
  ]);
  const labelCreateSupported = labelCreate && labelList;
  // The `tea api` transport probe the three gate capabilities are gated on: the reads need
  // `--include`, and the merge needs `--method` and `--data` on top of it. It attests transport
  // only — a request-body field such as `head_commit_id` cannot be probed at all.
  const teaApiTransport = commentUpdate && apiInclude;
  return {
    executable,
    version,
    login: login.name,
    authenticated: true,
    capabilities: {
      json: true,
      // `tea api user` states the account the forge attributes a write to, which is a different fact
      // from the locally configured login `tea logins list` reports. It rides on the same transport
      // probe as the gate reads.
      viewerRead: teaApiTransport,
      issues,
      issueRead: issues,
      issueCommentsRead: issues && issueComments,
      issueList: issues,
      issueCreate,
      issueSubIssuesRead: false,
      issueSubIssueCreate: false,
      issueUpdate,
      // The close is a raw-API write on the `tea api` transport the gate reads and the merge
      // already ride, so it derives from that one probe and adds no `probeTeaHelp` spawn of its
      // own — the same reasoning `prReviewsRead` and `reviewThreads` below carry. The fit is
      // exact rather than merely safe: `teaApiTransport` attests `--method`, `--data` and
      // `--include`, and the close plan uses all three, so the capability and the plan state one
      // requirement rather than the capability over-gating a plan that needs less.
      issueClose: teaApiTransport,
      issueComment: comment,
      issueCommentUpdate: commentUpdate,
      issueLabelAdd,
      issueLabelRemove,
      labelMigration: issueLabelAdd && issueLabelRemove,
      pullRequests: pulls,
      pullRequestRead: pulls,
      prCommentsRead: pulls && pullComments,
      // The review listing is a raw-API read on the same `tea api` transport the status read and the
      // review-thread walk already ride, so it derives from that one probe exactly as `reviewThreads`
      // does and adds no `probeTeaHelp` spawn of its own. `tea` has no review-listing subcommand
      // whose `--help` could attest anything here, and the renderer that comes closest states no
      // login and no timestamp — the same reason the thread walk left it.
      prReviewsRead: teaApiTransport,
      pullRequestList: pulls,
      // Two of the three gate operations ride on the `tea api` transport: the status read composes
      // the pull-request object, the combined commit status and the head commit's date, and the
      // merge sends `head_commit_id` as the server-side head guard. The watch is the one genuine
      // provider limitation — `tea` has no `checks` subcommand and Forgejo offers no server-side
      // blocking watch — and stays `false` rather than becoming the poll loop the gate rejects; the
      // documented no-watch degradation reports the pending checks and asks once instead.
      pullRequestStatus: teaApiTransport,
      pullRequestChecksWait: false,
      pullRequestMerge: teaApiTransport,
      pullRequestCreate: pullCreate,
      pullRequestDraftCreate: pullCreate && pullCreateDraft,
      pullRequestUpdate: pullEdit,
      prComment: comment,
      comments: comment,
      labels: labelCreateSupported && issueLabelAdd && issueLabelRemove,
      labelList,
      // `labelCreate` is the key the operation gate reads, so the read the create depends on is
      // folded into it rather than exposed as a second per-operation entry. A tea that cannot list
      // labels therefore reports `label-create` as unsupported and creates nothing, instead of
      // falling back to the unconditional create whose duplicates this whole path exists to stop.
      labelCreate: labelCreateSupported,
      reviewCreate: false,
      // The review-thread read rides on the same `tea api` transport as the gate reads, because that
      // is where it now goes: `tea pulls review-comments` states no login and no timestamp, so the
      // subcommand's presence never attested a usable read in the first place.
      reviewThreads: teaApiTransport,
      reviewThreadReplies: false,
      // A stated provider fact, as `pullRequestStatus` and `pullRequestMerge` already are, and no
      // longer a `--help` probe of `tea pulls resolve`. That probe attested the **client
      // subcommand**; the route behind it does not exist on Forgejo. `/swagger.v1.json` on a live
      // `15.0.3+gitea-1.22.0` instance declares 314 paths and not one `…/pulls/comments/…`, no
      // `resolve`, no `unresolve`, no `replies`; an authenticated `POST …/pulls/comments/{id}/resolve`
      // is rejected by the router with the same 405 a deliberately nonsense path draws, while the
      // neighbouring `…/reviews/{id}/dismissals` reaches its handler. Reporting this as supported
      // made `merge-gate` act on a write the forge never serves.
      reviewThreadResolution: false,
      conditionalWrites: false,
    },
  };
}

function normalizeLabel(label) {
  return typeof label === 'string' ? label : label?.name;
}

// tea's list renderer flattens `labels` into a **whitespace**-joined string while its single-item
// renderer returns an array, so the same field arrives in two shapes one call apart. Splitting
// the string rather than discarding it matters: an `Array.isArray(...) ? ... : []` guard would
// stop the crash but silently drop every label the list form actually carries.
//
// The separator is a space, not a comma: `modules/print` joins the names with `" "` in v0.14.2
// and v0.15.1 alike, so splitting on `,` returned the whole joined list as one label name. That
// makes the split lossy in the other direction — Gitea permits a space inside a label name, and
// `good first issue` cannot be told apart from three labels on this wire format at all. Every
// read that has somewhere better to go now takes the raw API instead, where `Labels` is a real
// array; this split is what remains for the renderer paths that have no such alternative, and it
// is a best effort rather than a faithful decoding.
function normalizeLabels(value) {
  const items = typeof value === 'string' ? value.split(/\s+/) : value;
  if (!Array.isArray(items)) return [];
  return items
    .map(normalizeLabel)
    .map((label) => (typeof label === 'string' ? label.trim() : label))
    .filter(Boolean);
}

// The only two account classes an authorship read can prove. GitHub states the class under two
// spellings for the same two values — `type` on the REST simple-user object, `__typename` on the
// GraphQL actor — so one allow-list decides both. A class outside them (a GHES
// `EnterpriseUserAccount`, a migration `Mannequin`, an `Organization`) proves nothing about
// automation and must stay undecided: reporting `human` for it would state as a fact something the
// provider never said, and `unknown` is precisely this record's word for "nobody decided". Matching
// ignores case, because case is spelling rather than class — the same discipline
// `VIEWER_ACCOUNT_TYPES` applies to the identity read.
const AUTHOR_ACCOUNT_TYPES = Object.freeze(['User', 'Bot']);

function declaredAccountBot(value) {
  const declared = typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
  const type = AUTHOR_ACCOUNT_TYPES.find(
    (candidate) => candidate.toLowerCase() === declared?.toLowerCase(),
  );
  return type === undefined ? undefined : type === 'Bot';
}

function normalizeAuthor(author) {
  const login =
    typeof author === 'string'
      ? author
      : (author?.login ?? author?.username ?? author?.user_name ?? author?.name);
  const explicitBot =
    typeof author === 'object' && author !== null
      ? (author.is_bot ??
        author.isBot ??
        declaredAccountBot(author.type) ??
        declaredAccountBot(author.__typename))
      : undefined;
  const inferredBot = typeof login === 'string' && /\[bot\]$/i.test(login) ? true : undefined;
  const isBot = explicitBot ?? inferredBot;
  return {
    login,
    isBot: isBot ?? null,
    authorType: isBot === true ? 'bot' : isBot === false ? 'human' : 'unknown',
  };
}

function normalizeIssue(item, repository, metadata = {}) {
  if (!item || typeof item !== 'object')
    fail('INVALID_PAYLOAD', 'provider returned an invalid issue');
  // Truthiness, never key presence. `Issue.PullRequest` carries no `omitempty`, so **every** raw
  // Gitea/Forgejo issue arrives with `"pull_request": null` and a key-presence guard would reject
  // the entire result set rather than the pull requests in it. The sibling filters that drop pull
  // requests out of an issue listing are truthiness-based for the same reason.
  if (item.pull_request) {
    fail('INVALID_PAYLOAD', 'provider returned a pull request where an issue was required');
  }
  return {
    number: requireNumber(item.number ?? item.index, 'provider issue number'),
    title: item.title ?? '',
    body: item.body ?? item.description ?? '',
    state: String(item.state ?? '').toLowerCase(),
    // Terminal and done are two facts, and only this field separates them. GitHub states why a
    // closed issue is closed — `completed` for delivered work, `not_planned` for withdrawn work —
    // while Forgejo states nothing of the kind, so the field is emitted only where the provider
    // actually spells one and is **absent** rather than guessed otherwise. A consumer therefore
    // reads an absence as "this provider states no reason" and never as a cancellation: inferring
    // one would make every Forgejo issue, and every GitHub issue closed before the field existed,
    // permanently unreconcilable. The merge gate's post-merge observation phase is the consumer, and it
    // is what keeps a cancelled issue from having its in-progress label stripped and its container
    // entry ticked as if the work had shipped.
    ...(typeof item.state_reason === 'string' && item.state_reason.length > 0
      ? { stateReason: item.state_reason.toLowerCase() }
      : {}),
    labels: normalizeLabels(item.labels),
    url: item.html_url ?? item.url ?? item.web_url,
    repository: repository.slug,
    ...(metadata.version ? { version: metadata.version } : {}),
  };
}

function normalizeSubIssue(item, repository, parent, metadata = {}) {
  const issue = normalizeIssue(item, repository, metadata);
  const marker = inspectDecompositionKey(issue.body, parent, 'forge');
  return {
    ...issue,
    parent: { number: parent, repository: repository.slug },
    ...(marker.status === 'valid' ? { decompositionKey: marker.key } : {}),
    ...(marker.status === 'invalid' ? { decompositionKeyError: marker.error } : {}),
  };
}

// A pull request states its branch twice, and the two providers spell the pair the other way round.
// Gitea's `PRBranchInfo` declares `Ref json:"ref"` and `Name json:"label"`: `services/convert` sets
// `Ref` to the branch name only while **both** the head repository record and the head branch still
// exist, and otherwise leaves it at `refs/pull/<index>/head` — a deleted head branch, a deleted fork
// and an AGit-flow pull request all land there — while `Name` is unconditionally `pr.HeadBranch`.
// GitHub states the same two keys with the opposite meaning: its `ref` is the bare branch and its
// `label` is `owner:branch`.
//
// So neither key can be preferred unconditionally. `ref` wins, and `label` is consulted only when
// `ref` is a pull ref, which GitHub never states — so the fallback is unreachable there and exact on
// Gitea. Getting this wrong is silent in the worst way: `pr-list`'s `input.head` filter and
// `src/tools/pr.md`'s `head === <head-branch>` match would both miss an open pull request whose
// branch the forge has already deleted, and the caller would create a second one.
const PULL_HEAD_REF = /^refs\/pull\/\d+\/head$/;

function normalizeBranchRef(branch) {
  if (typeof branch !== 'object' || branch === null) return undefined;
  const ref = typeof branch.ref === 'string' && branch.ref !== '' ? branch.ref : undefined;
  if (ref !== undefined && !PULL_HEAD_REF.test(ref)) return ref;
  const label = typeof branch.label === 'string' && branch.label !== '' ? branch.label : undefined;
  return label ?? ref;
}

function normalizePullRequest(item, repository, metadata = {}) {
  const issue = normalizeIssue(item, repository, metadata);
  return {
    ...issue,
    head: normalizeBranchRef(item.head) ?? item.headRefName ?? item.head_branch ?? item.head,
    base: normalizeBranchRef(item.base) ?? item.baseRefName ?? item.base_branch ?? item.base,
    draft: item.draft ?? item.isDraft ?? false,
  };
}

// Provider timestamps arrive under several spellings, and a caller that has to decide whether a
// comment is newer than the head commit must not parse three shapes to do it. The first usable
// value wins and is re-emitted in UTC: Gitea reports a local offset while GitHub reports `Z`, so
// without canonicalization an ordinary string comparison of two instants would order them wrongly.
// An unusable or absent value yields no field at all — the caller reads a missing timestamp as
// "cannot prove this is current", which blocks a merge instead of waving a stale run through.
function normalizeTimestamp(...values) {
  for (const value of values) {
    if (typeof value !== 'string' || value.trim() === '') continue;
    const parsed = new Date(value.trim());
    if (Number.isNaN(parsed.getTime())) continue;
    return parsed.toISOString();
  }
  return undefined;
}

// **The Go zero instant is not a timestamp; it is the marshalled form of "never set".** Gitea
// declares its review submission field as a plain `time.Time` with no `omitempty`, so a review that
// was never submitted serialises `0001-01-01T00:00:00Z` instead of omitting the field.
//
// What counts as that instant is decided by the **instant**, never by the string: every
// serialisation that parses to the same moment counts — the bare `Z` form, any UTC-offset variant of
// it (`0001-01-01T00:00:00+00:00`, `0000-12-31T23:00:00-01:00`), and any sub-second form
// (`0001-01-01T00:00:00.000Z`). Every other timestamp is left untouched, so the only thing this can
// misread is a genuine year-1 submission time, which no forge can produce.
const GO_ZERO_INSTANT_MS = Date.parse('0001-01-01T00:00:00Z');

function isGoZeroInstant(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  const parsed = Date.parse(value.trim());
  return !Number.isNaN(parsed) && parsed === GO_ZERO_INSTANT_MS;
}

// A pending check has no conclusion yet. Every state that is not a finished one counts as pending,
// so an unknown future provider state blocks a merge instead of being read as a green result.
const PENDING_CHECK_STATES = new Set([
  'PENDING',
  'EXPECTED',
  'QUEUED',
  'WAITING',
  'REQUESTED',
  'IN_PROGRESS',
]);

function upperCaseField(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim().toUpperCase() : undefined;
}

// One check arrives in three provider shapes: the `CheckRun` and `StatusContext` members of
// `statusCheckRollup`, and the flattened item `gh pr checks --json` prints. They are folded into one
// record so `pr-status-read` and `pr-checks-wait` report the same list. Fields the provider does not
// expose stay absent instead of being guessed — the discipline `authorType` already follows for an
// undecidable bot flag. `required` is the concrete case: only the GraphQL status read states per
// context whether branch protection marks a check as required, `gh pr checks --json` never does, and
// Forgejo has no such flag at all — so a check from either of the latter two reports no flag rather
// than a guessed one, which a caller reads as "requiredness unknown" instead of "not required".
function normalizeCheck(item) {
  if (!item || typeof item !== 'object') {
    fail('INVALID_PAYLOAD', 'provider returned an invalid check');
  }
  const status = upperCaseField(item.status);
  const state = upperCaseField(item.state);
  const bucket = typeof item.bucket === 'string' ? item.bucket.trim().toLowerCase() : undefined;
  const pending =
    bucket !== undefined
      ? bucket === 'pending'
      : status !== undefined
        ? status !== 'COMPLETED'
        : PENDING_CHECK_STATES.has(state ?? '');
  const conclusion = upperCaseField(item.conclusion) ?? (status === undefined ? state : undefined);
  const url = item.detailsUrl ?? item.targetUrl ?? item.link ?? item.url;
  const required =
    typeof item.isRequired === 'boolean'
      ? item.isRequired
      : typeof item.required === 'boolean'
        ? item.required
        : undefined;
  return {
    name: item.name ?? item.context ?? item.workflowName,
    status: pending ? 'PENDING' : 'COMPLETED',
    ...(pending || conclusion === undefined ? {} : { conclusion }),
    ...(typeof url === 'string' && url !== '' ? { url } : {}),
    ...(required === undefined ? {} : { required }),
  };
}

// The head commit is identified by its object name, never by its position in the commit list.
// GitHub returns the first page of commits, so on a pull request with more than one page the last
// entry is not the head — and a timestamp taken from the wrong commit would silently certify stale
// bot feedback as current. Nothing matching means no field, which the caller reads as unprovable.
function headCommitTimestamp(item, headSha) {
  // A directly stated value outranks the `oid` comparison below, because a value the provider
  // states outright is its own answer rather than one this code reconstructed. Exactly one producer
  // sets it, and that is why the precedence is safe there: `flattenForgejoPullRequestStatus` reads
  // the head commit **by** the head SHA the pull-request read just returned, so the value cannot
  // describe a different commit — the match this function would perform has already happened, in
  // the request itself. The GitHub path still reaches the comparison, because `PR_STATUS_QUERY`
  // selects no top-level timestamp. The precedence stays the hazard: adding such a field to the
  // query, or to a flattener that does not address the commit by its object name, switches head
  // verification off without touching a line of this function, so anyone introducing one has to
  // decide here whether the stated value may still skip the match.
  const direct = normalizeTimestamp(item.headCommittedAt, item.head?.commit?.committer?.date);
  if (direct !== undefined) return direct;
  if (typeof headSha !== 'string' || headSha === '') return undefined;
  const commits = Array.isArray(item.commits) ? item.commits : [];
  const head = commits.find(
    (commit) =>
      typeof commit?.oid === 'string' && commit.oid.toLowerCase() === headSha.toLowerCase(),
  );
  if (head === undefined) return undefined;
  return normalizeTimestamp(head.committedDate, head.committed_date, head.authoredDate);
}

// The GraphQL envelope, restated as the flat provider record the status normalizer already reads.
// The query nests the head commit's timestamp and its check rollup under `commits(last:1)` because
// that is where the schema keeps them, not because the gate wants two levels of nesting; unfolding
// them here keeps `normalizePullRequestStatus` written against one record shape instead of teaching
// it a second one, and hands the rollup over as the plain array of contexts the previous `--json`
// read produced. The commits stay an array so the head timestamp is still attached by matching
// `oid` against the head SHA rather than by trusting a position in a list, and the rollup is
// selected by that same match. GitHub materializes the `commits` connection asynchronously, so
// shortly after a push the returned node can still be the previous commit while `headRefOid`
// already names the new one; taking the rollup from whichever node happens to come last would then
// report that earlier commit's green checks as the head's, and "every reported check completed
// successfully" would be satisfied by checks belonging to a commit that is not the one about to be
// merged. No node matching the head SHA therefore yields no rollup at all, which the caller reads
// as `checksReported: false` and the gate blocks on — the same answer an empty `commits` selection
// already gives.
//
// A truncated rollup fails the read outright. `contexts(first:100)` is a page, and a pull request
// can carry more contexts than that; a caller that evaluated "all checks green" against a page
// which silently dropped contexts would merge a commit whose actual check list it never saw in
// full. A merge criterion must never be evaluated on a partial check list, so a `totalCount` ahead
// of the returned nodes is reported as an invalid payload naming both numbers instead of being
// passed on as a plausible-looking shorter list.
function flattenPullRequestStatus(raw) {
  // GraphQL answers a partial failure with both halves at once: a `data` block for the fields that
  // resolved and an `errors` array for the ones that did not — a sub-resolver that failed, a field
  // the token may not read, a rate limit reached mid-query. Read as a clean payload, such a response
  // would let the merge gate decide on a check list the provider never finished assembling. Whether
  // `gh` also exits non-zero for it is the CLI's business and nothing here pins it, so the one read
  // that gates a merge states the failure on its own evidence instead. The provider's wording
  // travels along redacted, like every other piece of provider text this file reports.
  const errors = Array.isArray(raw?.errors) ? raw.errors : [];
  if (errors.length > 0) {
    fail('INVALID_PAYLOAD', 'provider reported GraphQL errors for the status read', {
      messages: redact(
        errors.map((entry) =>
          typeof entry?.message === 'string' ? entry.message : 'provider stated no message',
        ),
      ),
    });
  }
  const pullRequest = raw?.data?.repository?.pullRequest;
  if (!pullRequest || typeof pullRequest !== 'object') {
    fail('INVALID_PAYLOAD', 'provider returned no pull request for the status read');
  }
  const commitNodes = Array.isArray(pullRequest.commits?.nodes) ? pullRequest.commits.nodes : [];
  const commits = commitNodes
    .map((node) => node?.commit)
    .filter((commit) => commit !== null && typeof commit === 'object');
  const headRefOid = pullRequest.headRefOid;
  const headCommit =
    typeof headRefOid === 'string' && headRefOid !== ''
      ? commits.find(
          (commit) =>
            typeof commit.oid === 'string' && commit.oid.toLowerCase() === headRefOid.toLowerCase(),
        )
      : undefined;
  const contexts = headCommit?.statusCheckRollup?.contexts;
  // `null` — the rollup itself, its contexts, or its nodes — means the provider reported nothing
  // here, which is a different fact from an empty list and stays distinguishable by omitting the
  // field entirely rather than substituting an empty array.
  const rollup = Array.isArray(contexts?.nodes) ? contexts.nodes : undefined;
  if (
    rollup !== undefined &&
    typeof contexts.totalCount === 'number' &&
    contexts.totalCount > rollup.length
  ) {
    fail('INVALID_PAYLOAD', 'provider returned a truncated check rollup', {
      totalCount: contexts.totalCount,
      returnedCount: rollup.length,
    });
  }
  return {
    ...pullRequest,
    commits,
    ...(rollup === undefined ? {} : { statusCheckRollup: rollup }),
  };
}

// One Gitea commit status, restated as a check record. Read the JSON tag, never the Go field name:
// `structs.CommitStatus` declares its `State` field with the tag `status`, so a per-entry state
// arrives on the wire as `status`, while only the enclosing `structs.CombinedStatus` declares its
// `State` with the tag `state`. The Go field is called `State` at both levels — that is the trap,
// and reading the field name instead of the tag is what gives the wrong key for an entry.
//
// The translation into a check record is not optional either: a raw `status: "success"` reaching
// `normalizeCheck` unchanged would be read through `pending = status !== 'COMPLETED'`, and
// `success` is not `COMPLETED`, so a finished check would report as pending. Mapping it here keeps
// one shape for both providers, and the record deliberately carries only `name`, `status`,
// `conclusion` and `url`: no raw Gitea key (`context`, `target_url`, `status`, `id`,
// `description`) survives into the envelope. The record's own `status` key is the normalized
// output field `normalizeCheck` reads back; despite the shared name it is unrelated to the raw
// input key above.
//
// `warning` and `skipped` are non-success **completed** checks and therefore block under
// `requireAllChecks: true`. That matches how GitHub's own `SKIPPED` conclusion already behaves.
// Anything unknown is `PENDING`, so an unrecognized future state blocks a merge rather than reading
// as a green result — the same discipline `PENDING_CHECK_STATES` applies on the GitHub side.
const FORGEJO_CHECK_STATES = Object.freeze({
  pending: Object.freeze({ status: 'PENDING' }),
  success: Object.freeze({ status: 'COMPLETED', conclusion: 'SUCCESS' }),
  failure: Object.freeze({ status: 'COMPLETED', conclusion: 'FAILURE' }),
  error: Object.freeze({ status: 'COMPLETED', conclusion: 'ERROR' }),
  warning: Object.freeze({ status: 'COMPLETED', conclusion: 'WARNING' }),
  skipped: Object.freeze({ status: 'COMPLETED', conclusion: 'SKIPPED' }),
});

function forgejoCheckRecord(item, index) {
  if (!item || typeof item !== 'object') {
    fail('INVALID_PAYLOAD', 'provider returned an invalid commit status');
  }
  // `status` is the per-entry tag; `state` is kept as a fallback for any fork or older
  // serialization that ever spelled it the other way. The type test rather than a plain `??` on
  // `item.status` is deliberate: a non-string `status` must not shadow a usable `state`.
  const raw = typeof item.status === 'string' ? item.status : item.state;
  // A key that is present but holds an unrecognized value is a state this adapter does not know
  // yet, and falls through to `PENDING` below. A key that is absent entirely is a payload it
  // cannot read at all, and reading that as pending is precisely what made the wrong-key bug
  // invisible from the outside — so it fails closed here, like the truncation guard below.
  if (typeof raw !== 'string') {
    fail('INVALID_PAYLOAD', 'provider returned a commit status with no state', {
      index,
      context: item.context,
    });
  }
  const state = raw.trim().toLowerCase();
  const mapped = FORGEJO_CHECK_STATES[state] ?? FORGEJO_CHECK_STATES.pending;
  const url = item.target_url;
  // No `required`: Forgejo states no requiredness anywhere, so every check reports it as unstated
  // and `mergeGate.requireAllChecks: false` fails closed on each of them — stricter than the
  // default, never looser.
  return {
    name: item.context,
    status: mapped.status,
    ...(mapped.conclusion === undefined ? {} : { conclusion: mapped.conclusion }),
    ...(typeof url === 'string' && url !== '' ? { url } : {}),
  };
}

// Forgejo clamps `limit` to its `MAX_RESPONSE_ITEMS` setting, so this value is a request rather than
// a guarantee — the truncation guard below reads the response header instead of comparing against
// it.
const FORGEJO_STATUS_LIMIT = 100;

function forgejoCommitStatuses(response) {
  const statuses = Array.isArray(response.body?.statuses) ? response.body.statuses : [];
  // A null and an empty `statuses` list mean the same thing here and are reported the same way: the
  // endpoint answers identically for a repository with no CI at all and for one whose CI has simply
  // not reported yet, and the two are indistinguishable. No rollup therefore reaches the normalizer,
  // which makes it state `checksReported: false`. A caller that read emptiness as green would merge
  // a commit whose checks never ran, and with no merge state to catch it — Forgejo reports none —
  // nothing else would. A non-2xx status never reaches this path; `teaApiSuccess` failed first.
  if (statuses.length === 0) return undefined;
  // The only sound truncation guard on this endpoint. Forgejo clamps `limit` to `MAX_RESPONSE_ITEMS`
  // (default 50, operator-configurable), so a requested 100 returns 50 and "returned equals
  // requested" can never fire, while omitting `limit` returns 30 rather than all. The body's own
  // `total_count` reports the returned page length, not the total. `X-Total-Count` is the
  // response-wide total, and a merge criterion must never be evaluated on a partial check list —
  // the same reason GitHub's rollup is compared against its `totalCount`.
  const total = Number(response.headers.get('x-total-count'));
  if (Number.isFinite(total) && total > statuses.length) {
    fail('INVALID_PAYLOAD', 'provider returned a truncated check rollup', {
      totalCount: total,
      returnedCount: statuses.length,
    });
  }
  return statuses.map((item, index) => forgejoCheckRecord(item, index));
}

// The three Forgejo reads, restated as the flat provider record `normalizePullRequestStatus` already
// reads. The record is built field by field rather than spread from the provider object, so its
// shape is constrained here and no raw Gitea key can leak into the envelope.
//
// `mergeState` is deliberately absent. Forgejo's pull-request object has no `mergeStateStatus`
// equivalent (`modules/structs/pull.go`: `mergeable` bool, `merge_base`, `draft`, `head.sha`, and no
// merge-state field), so the adapter states none rather than fabricating a `CLEAN` the provider
// never reported. `BEHIND` is therefore undetectable on Forgejo; a branch-protection rule that
// blocks an outdated branch fails the merge closed server-side instead.
//
// `mergeable` is emitted as the string `MERGEABLE`, never as the boolean the provider stated, and
// `false` is emitted as **no field at all**. Forgejo returns `mergeable: false` while its conflict
// check is still running and for any WIP-titled pull request, so mapping that to `CONFLICTING` would
// make a caller report a conflict that does not exist — on a branch it may have just repaired. The
// string form is what makes that irreversible: `normalizePullRequestStatus` accepts a string enum
// only, so passing the raw boolean through as a "simplification" yields no field rather than the
// old defect.
function flattenForgejoPullRequestStatus(pull, statuses, headCommittedAt) {
  if (!pull || typeof pull !== 'object' || Array.isArray(pull)) {
    fail('INVALID_PAYLOAD', 'provider returned no pull request for the status read');
  }
  // The browser URL replaces the API `url` the pull-request object carries.
  // `normalizePullRequestStatus` reads exactly `item.url` — unlike `normalizeIssue`, which falls
  // back through `html_url` — and adding such a fallback there would silently change GitHub's
  // behaviour too, so the substitution belongs here. The result round-trips through
  // `parseReference`; the API address does not.
  const browserUrl = typeof pull.html_url === 'string' ? pull.html_url.trim() : '';
  return {
    number: pull.number ?? pull.index,
    title: pull.title,
    state: pull.state,
    draft: pull.draft,
    head: pull.head,
    base: pull.base,
    ...(browserUrl === '' ? {} : { url: browserUrl }),
    ...(pull.mergeable === true ? { mergeable: 'MERGEABLE' } : {}),
    ...(headCommittedAt === undefined ? {} : { headCommittedAt }),
    ...(statuses === undefined ? {} : { statusCheckRollup: statuses }),
  };
}

// The merge state is read from the forge, never inferred from the check list: a protected branch can
// additionally require an approval, an up-to-date branch, or linear history, so "all checks green"
// and "mergeable" are different statements and both travel in this envelope.
function normalizePullRequestStatus(item, repository) {
  if (!item || typeof item !== 'object') {
    fail('INVALID_PAYLOAD', 'provider returned an invalid pull-request status');
  }
  const rollup = item.statusCheckRollup ?? item.checks;
  const headSha = item.headRefOid ?? item.head?.sha ?? item.headSha;
  const baseRef = item.baseRefName ?? item.base?.ref ?? item.baseRef;
  const draft = item.isDraft ?? item.draft;
  const mergeState = upperCaseField(item.mergeStateStatus ?? item.mergeState);
  // Read as a string enum only, and deliberately so. A provider that states mergeability as a
  // boolean has its flattener map the true case to `MERGEABLE` and omit the field otherwise — see
  // `flattenForgejoPullRequestStatus`, the only such producer — so no boolean ever reaches here. A
  // boolean branch mapping `false` to `CONFLICTING` used to exist for exactly that provider and was
  // wrong for it: Forgejo returns `false` while its conflict check is still running and for any
  // WIP-titled pull request. Without the branch, a later "simplification" that passes the raw field
  // through cannot restore that defect: `upperCaseField(false)` is `undefined`, which omits the
  // field, and an unstated mergeability fails closed everywhere it is consumed.
  const mergeable = upperCaseField(item.mergeable);
  const checks = (Array.isArray(rollup) ? rollup : []).map(normalizeCheck);
  const headCommittedAt = headCommitTimestamp(item, headSha);
  return {
    number: requireNumber(item.number ?? item.index, 'provider pull-request number'),
    repository: repository.slug,
    // The title rides along because the same read decides the merge: a squash merge publishes the
    // pull-request title as the commit subject, so it is a merge precondition, not decoration.
    title: item.title ?? '',
    state: String(item.state ?? '').toLowerCase(),
    // A missing draft flag is stated as missing. It is the one field whose guessed default would
    // point toward "merge allowed", so an absent value must block the gate rather than unblock it.
    ...(typeof draft === 'boolean' ? { draft } : {}),
    ...(typeof headSha === 'string' && headSha !== '' ? { headSha } : {}),
    // The head commit's instant, so a caller can decide from this one read whether a reviewer's
    // feedback belongs to the commit it is about to merge or to an earlier one.
    ...(headCommittedAt === undefined ? {} : { headCommittedAt }),
    ...(typeof baseRef === 'string' && baseRef !== '' ? { baseRef } : {}),
    ...(mergeState === undefined ? {} : { mergeState }),
    ...(mergeable === undefined ? {} : { mergeable }),
    ...(item.url ? { url: item.url } : {}),
    // "The provider reported no checks" and "the provider reported an empty list" both arrive as an
    // empty array, and directly after a push GitHub may not have attached any run to the new head
    // yet. Both facts are stated explicitly, because a caller that reads emptiness as green would
    // merge a commit whose CI never ran.
    checksReported: Array.isArray(rollup),
    checkCount: checks.length,
    checks,
  };
}

// The only two account classes this read can prove. A class outside them — a GHES
// `EnterpriseUserAccount`, a migration `Mannequin`, an `Organization` — is reported as no type at
// all rather than passed through: a caller branching `type === 'User'` for the shared-account path
// would read every unknown class as a dedicated bot account and skip the identity comparison
// entirely, which is the one direction this read exists to prevent. Matching ignores case, because
// case is spelling rather than class, and the canonical form is what a caller compares against.
const VIEWER_ACCOUNT_TYPES = Object.freeze(['User', 'Bot']);

// The identity the current authentication belongs to. A caller that has to tell its own writes from
// a person's cannot use the comment ID its own mutation returned: that ID lives only as long as the
// process that created it, while the forge's authorship record survives every later run and cannot
// be forged by a commenter. Only a value the provider actually states as a string is reported, so a
// numeric, boolean, or structured field can never be coerced into a plausible-looking identity — a
// fabricated login would let a caller claim a stranger's comment as its own.
// The login is not one field among many but the whole answer, so a response that states none is a
// failure rather than an empty result: the caller must not have to tell "no login" apart from
// "login unknown" in prose. `type` stays optional and only distinguishes an account shared with a
// person from a dedicated bot account.
function normalizeViewer(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    fail('INVALID_PAYLOAD', 'provider returned an invalid viewer identity');
  }
  const stated = (value) =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
  const login = stated(item.login);
  if (login === undefined) {
    fail('INVALID_PAYLOAD', 'provider stated no authenticated login');
  }
  const declared = stated(item.type);
  const type = VIEWER_ACCOUNT_TYPES.find(
    (candidate) => candidate.toLowerCase() === declared?.toLowerCase(),
  );
  return { login, ...(type === undefined ? {} : { type }) };
}

function normalizeComment(comment) {
  if (!comment || typeof comment !== 'object') {
    fail('INVALID_PAYLOAD', 'provider returned an invalid issue comment');
  }
  // The timestamp is what makes an automatic reviewer's feedback attributable to one head commit
  // rather than to the pull request as a whole, so it travels with every comment that can carry it.
  const createdAt = normalizeTimestamp(comment.created_at, comment.createdAt, comment.created);
  // The author is normalized exactly as a review-thread author is. Passing the provider's login
  // straight through left this surface without `isBot` and `authorType` at all, which cost more
  // than a missing field: the merge gate's human-comment guard could establish bot authorship for a
  // top-level comment only from a configured login, and its trigger idempotency in app mode — which
  // recognizes its own comment by `authorType: bot` — could never be proven and re-posted the
  // trigger every round. This read selects no fields, so the REST `user` object arrives complete and
  // states the account class in `type` — the same `User`/`Bot` distinction the GraphQL actor spells
  // as `__typename`. The `[bot]` login suffix REST additionally carries stays the fallback for a
  // payload that states no class.
  return {
    id: requireNumber(comment.id, 'provider comment id'),
    body: comment.body ?? comment.content ?? '',
    author: normalizeAuthor(comment.user ?? comment.poster ?? comment.author),
    url: comment.html_url ?? comment.url,
    ...(createdAt === undefined ? {} : { createdAt }),
  };
}

// The provider-neutral review verdict, and the reason it exists: the two forges spell the same five
// outcomes differently, and a consumer keyed on either spelling is a rule that silently never fires
// on the other provider. This is the same reconciliation `AUTHOR_ACCOUNT_TYPES` performs for the
// account class, one level up: the mapping lives here so every workflow contract can name one token
// set and no prompt has to know which forge answered.
//
// Gitea's authority is `modules/structs/pull_review.go`, read by JSON tag and never by Go field
// name — `Reviewer` is `user`, `ReviewerTeam` is `team`, `CommitID` is `commit_id`, `Submitted` is
// `submitted_at`, `HTMLURL` is `html_url`. Its `ReviewStateType` constants are `APPROVED`,
// `PENDING`, `COMMENT`, `REQUEST_CHANGES`, `REQUEST_REVIEW` and the empty string; GitHub's REST
// review object spells the middle three `COMMENTED`, `CHANGES_REQUESTED` and nothing at all.
const REVIEW_STATES = Object.freeze({
  APPROVED: 'APPROVED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  REQUEST_CHANGES: 'CHANGES_REQUESTED',
  COMMENTED: 'COMMENTED',
  COMMENT: 'COMMENTED',
  DISMISSED: 'DISMISSED',
  PENDING: 'PENDING',
  REQUEST_REVIEW: 'REVIEW_REQUESTED',
});

// **Dismissal is a state on one forge and a flag on the other.** GitHub restates a withdrawn verdict
// as the `DISMISSED` state; Gitea leaves `state` at `REQUEST_CHANGES` and sets a separate
// `dismissed` boolean, so a consumer reading `state` alone would keep a merge blocked on Forgejo
// with no clearing path at all. Folding the flag in here is what gives both forges one token.
//
// An unrecognized value **fails closed and is never passed through**: `UNKNOWN` is this record's
// word for "the provider stated no verdict this contract can name", exactly as `authorType:
// 'unknown'` is for the account class. Returning the raw string instead would let a future provider
// spelling flow into a rule that compares against the neutral tokens and quietly match none of them.
function normalizeReviewState(state, dismissed) {
  if (dismissed === true) return 'DISMISSED';
  const declared = typeof state === 'string' ? state.trim().toUpperCase() : '';
  return REVIEW_STATES[declared] ?? 'UNKNOWN';
}

// One submitted (or pending) review, normalized for both providers. The author goes through
// `normalizeAuthor` verbatim — the same record, the same `[bot]` inference and the same `unknown`
// fallback every other authorship surface reports — so "Matching a configured login" resolves a
// reviewer here exactly as it does on a comment or a thread.
//
// `commitSha` is the head binding, and it is what makes a verdict decidable against one head rather
// than against the pull request as a whole. `submittedAt` is absent for a **pending** review, which
// both forges return in this listing and neither has submitted: an absent submission time is how a
// consumer tells a draft verdict from a published one, so it is reported as absent and never
// defaulted to the read's own instant. **The two forges state that absence differently** — GitHub
// omits the field or nulls it, Gitea serialises the Go zero instant — and normalizing the second
// onto the first is what makes that one sentence true on both. The `PENDING` state token is the
// portable cross-check for a consumer that wants a second signal: both providers emit it, so the
// state answers the same question the missing instant does.
// A **team**-authored review carries `team` rather than `user`;
// it is a real review and its team name is what the author record can state, so the team is read as
// the author rather than leaving the review author-unestablished.
function normalizeReview(review) {
  if (!review || typeof review !== 'object') {
    fail('INVALID_PAYLOAD', 'provider returned a review that is not an object');
  }
  // **Short-circuit the whole candidate chain**, not merely the candidate that states it. The chain
  // resolves `submitted_at → submittedAt → submitted → created_at`, so skipping only the declared
  // submission field would let `created_at` resurface as a submission time and re-break the pending
  // discriminator one candidate later.
  const declaredSubmission = [review.submitted_at, review.submittedAt, review.submitted];
  const submittedAt = declaredSubmission.some(isGoZeroInstant)
    ? undefined
    : normalizeTimestamp(...declaredSubmission, review.created_at);
  const commitSha = review.commit_id ?? review.commitId ?? review.commit?.sha;
  return {
    id: review.id,
    url: review.html_url ?? review.url,
    author: normalizeAuthor(review.user ?? review.reviewer ?? review.author ?? review.team),
    ...(typeof commitSha === 'string' && commitSha.trim() !== ''
      ? { commitSha: commitSha.trim() }
      : {}),
    state: normalizeReviewState(review.state, review.dismissed),
    body: review.body ?? '',
    ...(submittedAt === undefined ? {} : { submittedAt }),
  };
}

function flattenPages(value) {
  return Array.isArray(value) && value.every(Array.isArray) ? value.flat() : value;
}

const URL_CANDIDATE = /https?:\/\/[^\s<>"']+/g;

// tea's create commands have no `--output json`, so the result URL has to come out of the human
// rendering. Selecting by validity instead of by position is what keeps that safe: a docs link or
// an error hint in the output can never be reported as the created resource, because only a
// candidate `parseReference` accepts for this repository and this kind is eligible. That makes the
// relaxed match stricter about what it accepts than the previous whole-line match was.
function selectTeaResultUrl(output, expectedKind, repository) {
  if (typeof output !== 'string') return undefined;
  const candidates = output.match(URL_CANDIDATE) ?? [];
  for (const candidate of candidates.reverse()) {
    const url = candidate.replace(/[.,;:!?)\]}>'"]+$/, '');
    try {
      parseReference(url, { expectedKind, repository });
      return url;
    } catch {
      // Not the created resource; keep looking at the earlier candidates.
    }
  }
  return undefined;
}

function normalizeTeaCreate(operation, raw, repository, input) {
  const output = raw?.output;
  const kind = operation === 'issue-create' ? 'issue' : 'pull-request';
  const url = selectTeaResultUrl(output, kind, repository);
  if (!url) {
    fail('INVALID_PAYLOAD', `${operation} succeeded without a parseable tea result URL`, {
      mutationMayHaveSucceeded: true,
      stdout: redact(output ?? ''),
    });
  }
  const reference = parseReference(url, { expectedKind: kind, repository });
  const payload = input.payload ?? input;
  const normalized = {
    number: reference.number,
    title: payload.title,
    body: payload.body ?? '',
    state: 'open',
    labels: payload.labels ?? [],
    url,
    repository: repository.slug,
  };
  if (kind === 'pull-request') {
    return {
      ...normalized,
      head: payload.head,
      base: payload.base,
      draft: payload.draft === true,
    };
  }
  return normalized;
}

function normalizeSubIssueCreate(raw, repository, input) {
  const output = raw?.output;
  const url = selectTeaResultUrl(output, 'issue', repository);
  if (!url) {
    fail('INVALID_PAYLOAD', 'issue-sub-issue-create succeeded without a parseable result URL', {
      mutationMayHaveSucceeded: true,
      stdout: redact(output ?? ''),
    });
  }
  const reference = parseReference(url, { expectedKind: 'issue', repository });
  const child = childIssuePayload(input, repository);
  return {
    number: reference.number,
    title: child.title,
    body: child.body,
    state: 'open',
    labels: child.labels,
    url,
    repository: repository.slug,
    parent: { number: child.parent, repository: repository.slug },
    decompositionKey: child.decompositionKey,
  };
}

function normalizeRemoteData(operation, raw, repository, input = {}, metadata = {}) {
  const flattened = flattenPages(raw);
  switch (operation) {
    case 'viewer-read':
      return normalizeViewer(flattened);
    // Both providers answer this endpoint with the full updated issue, and `issue-close` is the
    // same resource under a different field, so it shares the branch its sibling mutation already
    // uses. A consumer confirming the transition then reads one normalized lowercase `state`
    // instead of knowing that GitHub says `number`/`html_url` where Forgejo says `index`/`url`.
    // It also fails loudly on a body that is not an issue: `normalizeIssue` requires a number.
    case 'issue-read':
    case 'issue-update-body':
    case 'issue-close':
      return flattened?.output !== undefined
        ? { ...flattened, repository: repository.slug }
        : normalizeIssue(flattened, repository, metadata);
    case 'issue-create':
      return repository.provider === 'forgejo'
        ? normalizeTeaCreate(operation, flattened, repository, input)
        : normalizeIssue(flattened, repository, metadata);
    case 'issue-sub-issue-create':
      return normalizeSubIssueCreate(flattened, repository, input);
    case 'issue-sub-issues-read': {
      const parent = parentIssueNumber(input, repository);
      return (Array.isArray(flattened) ? flattened : (flattened?.issues ?? []))
        .filter((item) => !item.pull_request)
        .map((item) => normalizeSubIssue(item, repository, parent));
    }
    case 'issue-list':
      return (Array.isArray(flattened) ? flattened : (flattened?.issues ?? []))
        .filter((item) => !item.pull_request)
        .map((item) => normalizeIssue(item, repository));
    case 'issue-comments-read':
    case 'pr-comments-read':
      return (Array.isArray(flattened) ? flattened : (flattened?.comments ?? [])).map(
        normalizeComment,
      );
    // Both providers answer with a plain array of review objects — GitHub's REST pages collapsed by
    // `flattenPages`, Forgejo's pages concatenated by `readForgejoPaginated` — so one branch serves
    // both and the neutral state enum is applied in exactly one place.
    case 'pr-reviews-read':
      return (Array.isArray(flattened) ? flattened : (flattened?.reviews ?? [])).map(
        normalizeReview,
      );
    case 'issue-comment-update':
      return normalizeComment(flattened);
    case 'pr-read':
    case 'pr-update-body':
      return flattened?.output !== undefined
        ? { ...flattened, repository: repository.slug }
        : normalizePullRequest(flattened, repository, metadata);
    case 'pr-create':
      return repository.provider === 'forgejo'
        ? normalizeTeaCreate(operation, flattened, repository, input)
        : normalizePullRequest(flattened, repository, metadata);
    case 'pr-list':
      return (Array.isArray(flattened) ? flattened : (flattened?.pulls ?? []))
        .map((item) => normalizePullRequest(item, repository))
        .filter((pullRequest) => !input.head || pullRequest.head === input.head);
    case 'pr-status-read':
      return normalizePullRequestStatus(flattenPullRequestStatus(flattened), repository);
    // The wait reports its own outcome, so "the checks finished" and "the bound elapsed" stay
    // distinguishable for the caller: a timed-out wait is a result to report, never a green light.
    case 'pr-checks-wait': {
      const reported = Array.isArray(flattened) ? flattened : flattened?.checks;
      const checks = (Array.isArray(reported) ? reported : []).map(normalizeCheck);
      const timedOut = metadata.timedOut === true;
      // What gh reported, not what branch protection says: the `--required` read came back empty,
      // which happens both when no required check exists and when none has reported yet. The flag
      // passes that observation on so a consumer can tell this empty list apart from an ordinary
      // one, and it is set only when the read actually saw that response, never as `true` and never
      // on any other path. It deliberately says nothing about completeness — see below.
      const noRequiredChecks = metadata.requiredChecksDefined === false;
      return {
        number: prNumber(input),
        repository: repository.slug,
        // An empty list is never complete. `every` on an empty array is vacuously true, so a head
        // whose checks have not been attached yet would otherwise read exactly like a green run.
        // `requiredChecksDefined: false` is no exception: it only says gh reported no required
        // check, which a branch whose required checks are all still pending produces just as well,
        // so accepting it here would call an unfinished run finished. Nothing downstream loses by
        // that — the gate takes its criterion from a fresh `pr-status-read`, and the wait matters
        // through its blocking and its `timedOut` flag.
        complete:
          !timedOut && checks.length > 0 && checks.every((check) => check.status === 'COMPLETED'),
        timedOut,
        ...(metadata.forcedKill === true ? { forcedKill: true } : {}),
        ...(noRequiredChecks ? { requiredChecksDefined: false } : {}),
        checksReported: Array.isArray(reported),
        checkCount: checks.length,
        checks,
      };
    }
    case 'pr-merge': {
      const payload = input.payload ?? input;
      // `headSha` names the head the merge applied, so it is reported only where a provider stated
      // it. On GitHub the request itself is exact: `--match-head-commit` makes the server refuse
      // any other head, so an accepted merge corroborates the requested value and the fallback
      // below is that corroboration. Forgejo has no such guarantee — a server older than the Gitea
      // 1.16 API surface silently ignores `head_commit_id` — so its apply path re-reads the pull
      // request after the merge and hands the confirmed head down as `confirmedHeadSha`, or states
      // through `headShaUnconfirmed` why it could not. The gate on the fallback lives here rather
      // than at that call site because the generic mutation tail passes its `parsed` object as
      // metadata for every operation, so an absent `confirmedHeadSha` alone cannot tell a Forgejo
      // read-back that came back unusable apart from a GitHub merge that never runs one.
      // An absent `headSha` says nothing about the merge: `merged` is decided by the HTTP status.
      const confirmedHeadSha =
        typeof metadata.confirmedHeadSha === 'string'
          ? metadata.confirmedHeadSha
          : repository.provider === 'github'
            ? expectedHeadSha(payload)
            : undefined;
      return {
        number: prNumber(input),
        repository: repository.slug,
        merged: true,
        method: mergeMethod(payload),
        ...(confirmedHeadSha === undefined ? {} : { headSha: confirmedHeadSha }),
        ...(metadata.headShaUnconfirmed === undefined
          ? {}
          : { headShaUnconfirmed: metadata.headShaUnconfirmed }),
        // The only provider prose the gate publishes into its envelope: gh echoes the merged
        // branch, and a remote URL carrying an embedded credential is exactly what redaction is for.
        output: redact(flattened?.output ?? ''),
      };
    }
    case 'review-threads-read': {
      const threads =
        flattened?.data?.repository?.pullRequest?.reviewThreads?.nodes ??
        flattened?.reviewThreads ??
        (Array.isArray(flattened) ? flattened : []);
      return threads.map((thread) => {
        if (thread.comments?.nodes) {
          const comments = thread.comments.nodes.map((comment) => {
            const createdAt = normalizeTimestamp(
              comment.createdAt,
              comment.created_at,
              comment.created,
            );
            const url =
              typeof comment.url === 'string' && comment.url.trim() !== ''
                ? comment.url.trim()
                : undefined;
            return {
              id: comment.id,
              databaseId: comment.databaseId,
              body: comment.body ?? '',
              author: normalizeAuthor(comment.author),
              path: comment.path,
              line: comment.line ?? comment.originalLine,
              startLine: comment.startLine ?? comment.originalStartLine,
              ...(createdAt === undefined ? {} : { createdAt }),
              ...(url === undefined ? {} : { url }),
            };
          });
          // A thread has no creation time of its own in the provider's schema; its first comment is
          // its beginning by definition. Reading it off that comment is a restatement, not a guess,
          // and a thread whose first comment carries no timestamp still reports none. Every reply
          // keeps its own timestamp, because a bot that answers later must count as newer.
          const threadCreatedAt = comments[0]?.createdAt;
          // The thread's browser link is its first comment's, for the same reason its instant is:
          // the provider gives a thread no address of its own, and the comment that opened it is
          // where a reader lands. A consumer that promises somebody a link to read the finding at -
          // `merge-gate`'s set-aside confirmation - has nowhere else to take it from, and a record
          // carrying the thread ID alone cannot supply one at all.
          const threadUrl = comments[0]?.url;
          return {
            id: thread.id,
            isResolved: thread.isResolved === true,
            path: thread.path ?? thread.comments.nodes[0]?.path,
            line: thread.line ?? thread.comments.nodes[0]?.line,
            startLine: thread.startLine ?? thread.comments.nodes[0]?.startLine,
            ...(threadCreatedAt === undefined ? {} : { createdAt: threadCreatedAt }),
            ...(threadUrl === undefined ? {} : { url: threadUrl }),
            comments,
          };
        }
        // Class A: raw Gitea/Forgejo API JSON. `modules/structs/pull_review.go` declares
        // `PullReviewComment` with `ID json:"id"`, `Poster json:"user"`, `Resolver json:"resolver"`,
        // `LineNum json:"position"` and `HTMLURL json:"html_url"`, and those tags — not the Go field
        // names — are the authority for every key read here.
        //
        // **`position`, never `line`.** That pair is the same Go-field-versus-JSON-tag divergence
        // that shipped as #354, inside this very struct: reading `line` returns `undefined` on every
        // comment, which is a plausible-looking absence rather than an error.
        //
        // `id` is stringified because the pre-port renderer stringified every table cell, so a
        // thread identifier stays byte-identical across the port and no caller holding one from an
        // earlier read has to be told which side of the change produced it.
        const createdAt = normalizeTimestamp(thread.created_at, thread.createdAt, thread.created);
        const line = thread.position ?? thread.line;
        // `HTMLURL json:"html_url"` per the struct comment above - the tag, never the Go field name.
        const rawUrl = thread.html_url ?? thread.url;
        const url = typeof rawUrl === 'string' && rawUrl.trim() !== '' ? rawUrl.trim() : undefined;
        return {
          id: String(thread.id),
          // `resolver` is `null` while a thread is open and an object once someone resolved it, so
          // truthiness is the whole test. `Boolean(null)` is false and `Boolean({})` is true.
          isResolved: Boolean(thread.resolver),
          path: thread.path,
          line,
          ...(createdAt === undefined ? {} : { createdAt }),
          ...(url === undefined ? {} : { url }),
          comments: [
            {
              id: String(thread.id),
              body: thread.body ?? '',
              // `user`, not `reviewer`: `Poster` carries the tag `user`, and a comment whose author
              // the forge does not state leaves the login unset. `merge-gate` counts an item with no
              // login as human, so the guard activates — the fail-safe direction.
              author: normalizeAuthor(thread.user ?? thread.reviewer),
              path: thread.path,
              line,
              ...(createdAt === undefined ? {} : { createdAt }),
              ...(url === undefined ? {} : { url }),
            },
          ],
        };
      });
    }
    default:
      return flattened;
  }
}

function localOperation(operation, input) {
  switch (operation) {
    case 'remote-parse':
      return parseRemote(input.remote, input);
    case 'reference-parse':
      return parseReferences(input.references ?? input.reference, input);
    case 'signature-parse':
      return parseFindingSignature(input.body);
    case 'finding-build':
      return buildFindingPayload(input.finding ?? input, { language: input.language });
    case 'epic-build':
      return buildEpicPayload(input.epic ?? input, { language: input.language });
    case 'planning-comment-build':
      return buildCommentPayload('planning', input.comment ?? input);
    case 'decomposition-records-build':
      return buildDecompositionRecords(input.decomposition ?? input);
    case 'decomposition-records-parse':
      return parseDecompositionRecords(input.body);
    case 'decomposition-key-build':
      return buildDecompositionKey(input);
    case 'decomposition-key-parse':
      return parseDecompositionKey(input.body, input.context ?? input);
    case 'decomposition-container-compare':
      return compareDecompositionContainer(input.container ?? input);
    case 'decomposition-child-workflow-parse':
      return parseDecompositionChildWorkflow(input.workflow ?? input);
    case 'apply-comment-build':
      return buildCommentPayload('apply', input.comment ?? input);
    case 'pr-comment-build':
      return buildCommentPayload('pr', input.comment ?? input);
    // The Forgejo fallback for `review-create` posts one ordinary pull-request comment. It must
    // not use the `pr` kind: that stamps the iterate marker, which iterate reads as its own
    // completed work, so the fallback would feed the tool its own findings back.
    case 'pr-review-comment-build':
      return buildCommentPayload('pr-review', input.comment ?? input);
    case 'finding-deduplicate':
      return deduplicateFindings(input.existingIssues, input.findings);
    case 'label-query-variants':
      return labelQueryVariants(input.labels);
    case 'sf-label-migration-plan':
      return planSfLabelMigration(input.issues, input.marker);
    case 'marker-patch':
      return patchMarkedBlock(input.body, input.patch ?? input);
    case 'checklist-patch':
      return patchChecklistEntry(input.body, input.patch ?? input);
    case 'body-hash':
      return { hash: bodyHash(input.body) };
    case 'issue-lifecycle-receipt-build':
      return buildIssueLifecycleReceipt(input, input.context ?? input);
    case 'issue-lifecycle-receipt-parse':
      return parseIssueLifecycleReceipt(input.body, input.context ?? input);
    default:
      return undefined;
  }
}

function issueStateWaitClock(clock) {
  const read =
    typeof clock === 'function'
      ? clock
      : clock && typeof clock.now === 'function'
        ? () => clock.now()
        : () => Date.now();
  return () => {
    const value = read();
    if (!Number.isFinite(value)) {
      fail('INVALID_PAYLOAD', 'issue-state-wait clock returned an invalid time');
    }
    return value;
  };
}

function assertFixedIssueStateWait(input) {
  const payload = input.payload ?? input;
  for (const field of [
    'timeoutMs',
    'timeoutSeconds',
    'timeoutMinutes',
    'waitMs',
    'waitSeconds',
    'waitMinutes',
    'intervalSeconds',
  ]) {
    if (payload[field] !== undefined) {
      fail('INVALID_PAYLOAD', 'issue-state-wait uses a fixed 30-second grace period', {
        field: `payload.${field}`,
        waitMs: ISSUE_STATE_WAIT_MS,
      });
    }
  }
}

async function readIssueForStateWait(input, repository, runner) {
  const plan = buildCommandPlan('issue-state-wait', input, repository);
  const result = await runChecked(runner, plan, 'issue-state-wait read');
  const parsed = isTeaApiIncludePlan(plan)
    ? { raw: teaApiSuccess(result, 'issue-state-wait read').body }
    : parseCommandOutput(result, plan, 'issue-state-wait read');
  const issue = normalizeRemoteData('issue-read', parsed.raw, repository, input, parsed);
  if (!['open', 'closed'].includes(issue.state)) {
    fail('INVALID_PAYLOAD', 'forge returned an unsupported issue lifecycle state', {
      number: issue.number,
      state: issue.state,
      supported: ['open', 'closed'],
    });
  }
  return { issue, command: redact(plan) };
}

async function executeIssueStateWait(input, repository, runner, options = {}) {
  assertFixedIssueStateWait(input);
  const now = issueStateWaitClock(options.clock);
  const sleeper =
    options.sleeper ?? ((durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs)));
  if (typeof sleeper !== 'function') {
    fail('INVALID_PAYLOAD', 'issue-state-wait requires a callable sleeper');
  }

  const first = await readIssueForStateWait(input, repository, runner);
  if (first.issue.state === 'closed') {
    return {
      result: {
        issue: first.issue,
        outcome: 'terminal',
        terminal: true,
        timedOut: false,
        waitMs: 0,
      },
      commands: [first.command],
    };
  }

  const startedAt = now();
  await sleeper(ISSUE_STATE_WAIT_MS);
  const waitedMs = Math.min(ISSUE_STATE_WAIT_MS, Math.max(0, now() - startedAt));
  const final = await readIssueForStateWait(input, repository, runner);
  const terminal = final.issue.state === 'closed';
  return {
    result: {
      issue: final.issue,
      outcome: terminal ? 'terminal' : 'open',
      terminal,
      timedOut: !terminal,
      waitMs: ISSUE_STATE_WAIT_MS,
      observedWaitMs: waitedMs,
    },
    commands: [first.command, final.command],
  };
}

async function staleWriteGuard(operation, input, repository, runner, conditionalWriteAvailable) {
  if (!['issue-update-body', 'pr-update-body', 'issue-comment-update'].includes(operation)) {
    return undefined;
  }
  const expected = requireString(input.expectedBodyHash, 'expectedBodyHash');
  const desired = requireString((input.payload ?? input).body, 'payload.body', {
    allowEmpty: true,
  });
  if (operation === 'issue-comment-update') {
    const commentId = requireNumber(input.commentId, 'commentId');
    const readPlan = buildCommandPlan('issue-comments-read', input, repository);
    const readResult = await runChecked(runner, readPlan, 'issue-comments-read precondition');
    const parsed = parseCommandOutput(readResult, readPlan, 'issue-comments-read');
    const comments = normalizeRemoteData(
      'issue-comments-read',
      parsed.raw,
      repository,
      input,
      parsed,
    );
    const matches = comments.filter((comment) => comment.id === commentId);
    if (matches.length === 0) {
      fail('TARGET_NOT_FOUND', 'issue comment no longer exists', { commentId });
    }
    if (matches.length > 1) {
      fail('AMBIGUOUS_TARGET', 'issue comment ID matched more than once', {
        commentId,
        matches: matches.length,
      });
    }
    const current = matches[0];
    if (current.body === desired) return { unchanged: true, current };
    const actual = bodyHash(current.body);
    if (actual !== expected) {
      fail('STALE_WRITE', 'issue comment changed after the caller read it', {
        commentId,
        expectedBodyHash: expected,
        actualBodyHash: actual,
        conditionalWriteAvailable: false,
      });
    }
    return { unchanged: false, current };
  }
  const readOperation = operation === 'issue-update-body' ? 'issue-read' : 'pr-read';
  const readPlan = buildCommandPlan(readOperation, input, repository);
  const readResult = await runChecked(runner, readPlan, `${readOperation} precondition`);
  const parsed = parseCommandOutput(readResult, readPlan, readOperation);
  const current = normalizeRemoteData(readOperation, parsed.raw, repository, input, parsed);
  if (current.body === desired) return { unchanged: true, current };
  const actual = bodyHash(current.body);
  const expectedVersion = input.expectedVersion;
  const versionChanged =
    conditionalWriteAvailable === true &&
    requireString(expectedVersion, 'expectedVersion') !== current.version;
  if (actual !== expected || versionChanged) {
    fail('STALE_WRITE', 'remote body changed after the caller read it', {
      expectedBodyHash: expected,
      actualBodyHash: actual,
      expectedVersion,
      actualVersion: current.version,
      conditionalWriteAvailable: conditionalWriteAvailable === true,
    });
  }
  return { unchanged: false, current };
}

// A full object name and nothing else. Calls 2 and 3 of the Forgejo status read are addressed by
// the head SHA call 1 returned, so a missing or malformed value skips them entirely rather than
// falling back to a branch name: a branch resolves to whatever it points at now, which is a
// different commit from the one this read is about.
const FULL_OBJECT_NAME = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

// The Forgejo status read is three `tea api` calls where GitHub's is one GraphQL query. It has to
// be: the pull-request object supplies the merge state, the draft flag, `mergeable` and the head
// SHA, the combined commit status supplies the checks, and the head commit supplies the committer
// date the automatic-reviewer fallback compares against. Only the first is knowable in advance, so
// `buildCommandPlan` answers with that one and this reader publishes all three previews.
async function readForgejoPullRequestStatus(input, repository, runner) {
  const pullPlan = buildCommandPlan('pr-status-read', input, repository);
  const commands = [redact(pullPlan)];
  const pull = teaApiSuccess(
    await runChecked(runner, pullPlan, 'pr-status-read'),
    'pr-status-read',
  ).body;
  const headSha = typeof pull?.head?.sha === 'string' ? pull.head.sha.trim() : '';
  const endpoint = (suffix) => `repos/${repository.owner}/${repository.repository}/${suffix}`;
  let statuses;
  let headCommittedAt;
  if (FULL_OBJECT_NAME.test(headSha)) {
    const statusPlan = teaApiReadPlan(
      repository,
      `${endpoint(`commits/${headSha}/status`)}?limit=${FORGEJO_STATUS_LIMIT}`,
    );
    commands.push(redact(statusPlan));
    statuses = forgejoCommitStatuses(
      teaApiSuccess(
        await runChecked(runner, statusPlan, 'pr-status-read checks'),
        'pr-status-read checks',
      ),
    );
    const commitPlan = teaApiReadPlan(repository, endpoint(`git/commits/${headSha}`));
    commands.push(redact(commitPlan));
    const commit = teaApiSuccess(
      await runChecked(runner, commitPlan, 'pr-status-read head commit'),
      'pr-status-read head commit',
    ).body;
    headCommittedAt = normalizeTimestamp(
      commit?.commit?.committer?.date,
      commit?.commit?.author?.date,
      commit?.created,
    );
  }
  return {
    result: normalizePullRequestStatus(
      flattenForgejoPullRequestStatus(pull, statuses, headCommittedAt),
      repository,
    ),
    commands,
  };
}

// The two-step walk both forges force. Forgejo's router declares `GET …/pulls/{index}/reviews` and
// `GET …/pulls/{index}/reviews/{id}/comments`; there is no flat review-comment listing at any
// nesting level on either forge, so the reviews have to be enumerated before their comments can be
// addressed. This adds no requests: `tea pulls review-comments` already performs the same
// `ceil(N/50) + N` fan-out client-side, so the port relocates that cost into `data.commands` rather
// than creating it. What the adapter newly owns is the pagination over `/reviews` and its truncation
// guard, which tea handled through `resp.NextPage`.
async function readForgejoReviewThreads(input, repository, runner) {
  const number = prNumber(input);
  const endpoint = (suffix) => `repos/${repository.owner}/${repository.repository}/${suffix}`;
  const reviews = await readForgejoPaginated(
    repository,
    endpoint(`pulls/${number}/reviews`),
    runner,
    'review-threads-read reviews',
    // The reviews listing counts pending reviews its body hides, so its header cannot prove
    // truncation. See `readForgejoPaginated`.
    { totalIsExact: false },
  );
  const commands = [...reviews.commands];
  const comments = [];
  for (const review of reviews.items) {
    const id = review?.id;
    if (!Number.isSafeInteger(id) || id <= 0) {
      fail('INVALID_PAYLOAD', 'provider returned a review without a usable id');
    }
    // A pull request with no reviews yields no comment read at all, and a review with no inline
    // comments yields an empty list — neither is a failed read, exactly as `forgejoCommitStatuses`
    // keeps an empty rollup distinct from a refused one.
    const page = await readForgejoList(
      repository,
      endpoint(`pulls/${number}/reviews/${id}/comments`),
      runner,
      `review-threads-read review ${id} comments`,
    );
    commands.push(...page.commands);
    comments.push(...page.items);
  }
  return {
    result: normalizeRemoteData('review-threads-read', comments, repository, input),
    commands,
  };
}

// One status reader for both providers, used by `pr-status-read` and by `mergeHeadGuard` alike, so
// the merge precondition and the status the caller sees can never be read through two code paths
// that drifted apart.
async function readPullRequestStatus(input, repository, runner) {
  if (repository.provider === 'forgejo') {
    return await readForgejoPullRequestStatus(input, repository, runner);
  }
  const readPlan = buildCommandPlan('pr-status-read', input, repository);
  const readResult = await runChecked(runner, readPlan, 'pr-status-read');
  const parsed = parseCommandOutput(readResult, readPlan, 'pr-status-read');
  return {
    result: normalizeRemoteData('pr-status-read', parsed.raw, repository, input, parsed),
    commands: [redact(readPlan)],
  };
}

// The merge is the most irreversible mutation of the set, so the head the caller verified is
// re-checked against a fresh read immediately before it runs. The provider-side head guard —
// `--match-head-commit` on GitHub, `head_commit_id` in the Forgejo merge body — guards the same
// race, but only this local check turns a moved head into the tool's own structured error — with the
// actual head reported and `merged: false` stated — instead of a generic command failure. It closes
// **no** race of its own: it runs before the request, so a server that ignores `head_commit_id`
// (older than the Gitea 1.16 API surface) leaves the window itself unguarded, and there is no local
// substitute for that.
async function mergeHeadGuard(input, repository, runner) {
  const expected = expectedHeadSha(input.payload ?? input);
  const status = (await readPullRequestStatus(input, repository, runner)).result;
  const actual = typeof status.headSha === 'string' ? status.headSha.toLowerCase() : undefined;
  if (actual !== expected) {
    fail('STALE_WRITE', 'pull-request head moved after the caller verified it', {
      number: status.number,
      expectedHeadSha: expected,
      actualHeadSha: actual,
      merged: false,
    });
  }
  return status;
}

async function executeSfLabelMigration(input, repository, runner, dryRun) {
  const migration = planSfLabelMigration(input.issues, input.marker);
  if (migration.skipped || migration.steps.length === 0) {
    return {
      ok: true,
      operation: 'sf-label-migrate',
      provider: repository.provider,
      data: {
        unchanged: true,
        completedSteps: [],
        marker: migration.skipped ? migration.marker : migration.completionMarker,
      },
      dryRun,
    };
  }
  const planned = migration.steps.map((step) => {
    const operation = step.operation === 'add' ? 'issue-label-add' : 'issue-label-remove';
    const plan = buildCommandPlan(
      operation,
      { number: step.issue, payload: { label: step.label, labels: [step.label] } },
      repository,
    );
    return { ...step, command: redact(plan) };
  });
  if (dryRun) {
    return {
      ok: true,
      operation: 'sf-label-migrate',
      provider: repository.provider,
      data: {
        steps: planned,
        completedSteps: [],
        marker: migration.marker,
        completionMarker: migration.completionMarker,
      },
      dryRun: true,
    };
  }
  const completedSteps = [];
  for (const step of migration.steps) {
    const operation = step.operation === 'add' ? 'issue-label-add' : 'issue-label-remove';
    const plan = buildCommandPlan(
      operation,
      { number: step.issue, payload: { label: step.label, labels: [step.label] } },
      repository,
    );
    try {
      await runChecked(runner, plan, `sf-label-migrate ${step.operation}`);
      completedSteps.push(step);
    } catch (error) {
      if (error instanceof RemoteTrackerError) {
        error.details = {
          ...error.details,
          completedSteps,
          failedStep: step,
          marker: migration.marker,
        };
      }
      throw error;
    }
  }
  return {
    ok: true,
    operation: 'sf-label-migrate',
    provider: repository.provider,
    data: { unchanged: false, completedSteps, marker: migration.completionMarker },
    dryRun: false,
  };
}

// One label shape for both providers. tea names the identifier `index` and prints every value as a
// string, while gh's REST payload names it `id` and keeps it typed, so both spellings are read and
// the result is normalized rather than passed through. A payload that states no name is not a
// label and is dropped, so it can never match the name being looked for.
function normalizeRepositoryLabel(label) {
  if (!label || typeof label !== 'object') return null;
  const name = label.name;
  if (typeof name !== 'string' || name === '') return null;
  return {
    id: label.id ?? label.index ?? null,
    name,
    color: label.color ?? null,
    description: label.description ?? null,
  };
}

// tea 0.14.2 answers a failed label read with **exit 0 and an empty list**: `cmd/labels/list.go`
// logs the API error from `ListRepoLabels` and returns the labels it does not have, where 0.14.1
// still returned the error. A transient forge failure is therefore byte-for-byte indistinguishable
// from a repository that simply carries no labels — and reading it as "no labels" is exactly the
// input that makes the pre-check conclude "absent", create, and produce the duplicate this whole
// path exists to prevent. The warning tea writes to stderr is the only surviving signal, so an
// **any** page whose read emits that warning invalidates the whole accumulated list and the
// operation fails closed instead of writing. It has to be any page, not just the first: a warned
// read yields an empty page, an empty page is what ends pagination, so the warning always marks the
// point where enumeration stopped early — the pages already collected are a prefix that may well
// omit the name being looked for. The coupling to tea's log text is deliberate and is the reason
// this comment exists: if a later tea drops or rewords the message, this guard degrades to no guard
// — an empty list is trusted again, exactly as before — rather than to a wrong answer.
const TEA_LABEL_LIST_FAILURE = /failed to list repository labels/i;

// `label` names the caller in every diagnostic this loop produces. It defaults to the operation, so
// the two public list operations report exactly as before; an internal read passes the operation it
// belongs to, so its failure is never attributed to a name no caller can invoke.
async function executeTeaPaginatedList(operation, input, repository, runner, label = operation) {
  const limit = input.limit === undefined ? 100 : requireNumber(input.limit, 'limit');
  const maxPages = input.maxPages === undefined ? 1000 : requireNumber(input.maxPages, 'maxPages');
  const items = [];
  const commands = [];
  const diagnostics = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const plan = buildCommandPlan(operation, { ...input, page, limit }, repository);
    commands.push(redact(plan));
    const result = await runChecked(runner, plan, `${label} page ${page}`);
    if (typeof result?.stderr === 'string' && result.stderr !== '') diagnostics.push(result.stderr);
    const parsed = parseCommandOutput(result, plan, operation);
    const pageItems = Array.isArray(parsed.raw)
      ? parsed.raw
      : (parsed.raw?.issues ?? parsed.raw?.pulls);
    if (!Array.isArray(pageItems)) {
      fail('INVALID_PAYLOAD', `${operation} returned a non-list page`, { page });
    }
    if (pageItems.length === 0) {
      return { raw: items, commands, pagesFetched: page, stderr: diagnostics.join('\n') };
    }
    items.push(...pageItems);
  }
  fail('UNSUPPORTED_CAPABILITY', `${operation} exceeded the bounded tea pagination limit`, {
    maxPages,
    itemsRead: items.length,
  });
}

async function readRepositoryLabels(input, repository, runner) {
  if (repository.provider === 'forgejo') {
    // `limit` and `maxPages` are pinned here instead of inherited from the caller's payload, which
    // for this operation is the label to create: a stray `limit` field in it would otherwise shrink
    // the pre-check's window until it stops seeing the label it is looking for.
    const paginated = await executeTeaPaginatedList(
      'label-list',
      { ...input, limit: 100, maxPages: 100 },
      repository,
      runner,
      'label-create list',
    );
    if (TEA_LABEL_LIST_FAILURE.test(paginated.stderr ?? '')) {
      fail(
        'COMMAND_FAILED',
        'label-create could not read the repository labels',
        { step: 'list', stderr: redact(paginated.stderr) },
        true,
      );
    }
    return {
      labels: paginated.raw,
      steps: paginated.commands.map((command) => ({ step: 'list', command })),
    };
  }
  const plan = buildCommandPlan('label-list', input, repository);
  const result = await runChecked(runner, plan, 'label-create list');
  const labels = flattenPages(parseCommandOutput(result, plan, 'label-create list').raw) ?? [];
  if (!Array.isArray(labels)) {
    fail('INVALID_PAYLOAD', 'label-create list returned a non-list payload');
  }
  return { labels, steps: [{ step: 'list', command: redact(plan) }] };
}

// Creating a label is a read-then-write, because neither provider offers an idempotent create and
// only one of them even rejects a duplicate. Forgejo happily creates a second label of the same
// name, and `issue-label-add` resolves by name, so every repeated run added another copy and then
// attached all of them to the issue. The pre-check is what stops that growth on both providers, and
// it is also what lets this operation report whether it created anything instead of assuming it did.
async function executeLabelCreate(input, repository, runner, dryRun, probe) {
  const payload = input.payload ?? input;
  const name = requireString(payload.name, 'name');
  const createPlan = buildCommandPlan('label-create', input, repository);
  const command = redact(createPlan);
  const envelope = (data) => ({
    ok: true,
    operation: 'label-create',
    provider: repository.provider,
    data,
    dryRun,
  });
  if (dryRun) {
    // No provider call, deliberately. Every other mutation's dry run is a pure plan preview, and a
    // read here would be the one place in this helper where previewing a mutation talks to the
    // forge and can fail with a COMMAND_FAILED. The cost is that the preview shows a create that
    // may not run — which is what `steps` says out loud. `data.command` keeps naming the create so
    // the generic mutation contract, which tells a caller to inspect exactly that, stays true.
    return envelope({
      repository,
      command,
      steps: [
        {
          step: 'list',
          command: redact(buildCommandPlan('label-list', { ...input, limit: 100 }, repository)),
        },
        { step: 'create', command },
      ],
      capability: probe.capabilities?.labelCreate ?? true,
      conditionalWriteAvailable: probe.capabilities?.conditionalWrites === true,
    });
  }
  const { labels, steps } = await readRepositoryLabels(input, repository, runner);
  const existing = labels.map(normalizeRepositoryLabel).find((label) => label?.name === name);
  if (existing) {
    return envelope({
      result: { name, created: false, label: existing },
      unchanged: true,
      steps,
      command,
    });
  }
  // Both steps name themselves, following `sf-label-migrate`: a failure of either has to say which
  // of the two commands produced it rather than reporting under the operation as a whole. That the
  // create's label is no longer the bare operation name is exactly why the 422 tolerance had to
  // stop keying on it.
  const result = await runChecked(runner, createPlan, 'label-create write');
  steps.push({ step: 'create', command });
  // The tolerated duplicate rejection: a concurrent run created the label between this run's read
  // and its write. GitHub's own uniqueness constraint is the only place that race can be caught, so
  // catching it proves the label exists — the outcome this operation promises — without this run
  // having created it and without any payload describing it, hence the null label.
  if (result?.alreadyExists === true) {
    return envelope({
      result: { name, created: false, label: null },
      unchanged: true,
      steps,
      command,
    });
  }
  const parsed = parseCommandOutput(result, createPlan, 'label-create write');
  // tea's create renders for humans and states no label, so the created label falls back to what
  // was asked for. Only the provider-assigned id is genuinely unknown there, and it stays null
  // rather than being invented.
  const created =
    normalizeRepositoryLabel(parsed.raw) ??
    normalizeRepositoryLabel({
      name,
      color: payload.color ?? 'ededed',
      description: payload.description ?? '',
    });
  return envelope({
    result: { name, created: true, label: created },
    unchanged: false,
    steps,
    command,
  });
}

export async function executeOperation(operation, input = {}, options = {}) {
  requireString(operation, 'operation');
  requireObject(input);
  const dryRun = MUTATIONS.has(operation) && options.apply !== true;
  try {
    const local = localOperation(operation, input);
    if (local !== undefined) {
      return { ok: true, operation, provider: null, data: local, dryRun: false };
    }
    if (!REMOTE_OPERATIONS.has(operation)) {
      fail('INVALID_PAYLOAD', `unknown operation: ${operation}`, { operation });
    }

    const baseRunner =
      options.runner ??
      (async () => fail('INVALID_PAYLOAD', 'remote operations require an injected process runner'));
    if (input.cwd !== undefined) requireString(input.cwd, 'cwd');
    // Single choke point: every provider CLI resolves its repository from the working directory,
    // so root all of them - repository resolution, probe, command plan, pagination, guards - in
    // the caller's `cwd` rather than in whatever directory the process happens to sit in.
    const runner = async (call) => {
      const result = await baseRunner(
        call?.cwd === undefined && input.cwd !== undefined ? { ...call, cwd: input.cwd } : call,
      );
      if (result?.error?.code === 'INVALID_CWD') {
        fail('INVALID_PAYLOAD', 'working directory is not an existing directory', {
          cwd: result.error.path,
        });
      }
      return result;
    };
    const repository = await resolveRepositoryInput(input, runner);
    if (operation === 'repository-resolve') {
      return {
        ok: true,
        operation,
        provider: repository.provider,
        data: repository,
        dryRun: false,
      };
    }
    const probe =
      options.skipProbe === true
        ? (input.probe ?? {
            executable: repository.provider === 'github' ? 'gh' : 'tea',
            capabilities: {},
          })
        : await probeProvider(repository, runner, {
            issueSubIssueCreate: operation === 'probe' || operation === 'issue-sub-issue-create',
          });
    if (operation === 'probe') {
      return {
        ok: true,
        operation,
        provider: repository.provider,
        data: { repository, ...probe },
        dryRun: false,
      };
    }
    const activeRepository =
      repository.provider === 'forgejo' && probe.login
        ? { ...repository, login: probe.login }
        : repository;
    const capability = CAPABILITY_BY_OPERATION[operation];
    if (probe.capabilities?.[capability] === false) {
      fail('UNSUPPORTED_CAPABILITY', `${repository.provider} does not support ${operation}`, {
        operation,
        capability,
      });
    }
    if (
      operation === 'pr-create' &&
      repository.provider === 'forgejo' &&
      (input.payload ?? input).draft === true &&
      probe.capabilities?.pullRequestDraftCreate !== true
    ) {
      fail('UNSUPPORTED_CAPABILITY', 'forgejo does not support draft pull-request creation', {
        operation,
        capability: 'pullRequestDraftCreate',
      });
    }
    if (['issue-update-body', 'pr-update-body', 'issue-comment-update'].includes(operation)) {
      requireString(input.expectedBodyHash, 'expectedBodyHash');
      if (operation !== 'issue-comment-update' && probe.capabilities?.conditionalWrites === true) {
        requireString(input.expectedVersion, 'expectedVersion');
      }
    }
    if (operation === 'sf-label-migrate') {
      return await executeSfLabelMigration(input, activeRepository, runner, dryRun);
    }
    // Both branches sit ahead of the generic dry-run return below, because both run more than one
    // command and therefore build their own envelope.
    if (operation === 'label-create') {
      return await executeLabelCreate(input, activeRepository, runner, dryRun, probe);
    }
    if (operation === 'issue-state-wait') {
      const observed = await executeIssueStateWait(input, activeRepository, runner, options);
      return {
        ok: true,
        operation,
        provider: activeRepository.provider,
        data: {
          ...observed,
          conditionalWriteAvailable: probe.capabilities?.conditionalWrites === true,
        },
        dryRun: false,
      };
    }
    const plan = buildCommandPlan(operation, input, activeRepository);
    const preview = redact(plan);
    if (dryRun) {
      return {
        ok: true,
        operation,
        provider: repository.provider,
        data: {
          repository: activeRepository,
          command: preview,
          capability: probe.capabilities?.[capability] ?? true,
          conditionalWriteAvailable: probe.capabilities?.conditionalWrites === true,
        },
        dryRun: true,
      };
    }
    if (operation === 'pr-merge') {
      await mergeHeadGuard(input, activeRepository, runner);
    }
    const guarded = await staleWriteGuard(
      operation,
      input,
      activeRepository,
      runner,
      probe.capabilities?.conditionalWrites === true,
    );
    if (guarded?.unchanged) {
      return {
        ok: true,
        operation,
        provider: activeRepository.provider,
        data: { unchanged: true, item: guarded.current, command: preview },
        dryRun: false,
      };
    }
    if (
      activeRepository.provider === 'forgejo' &&
      (operation === 'issue-list' || operation === 'pr-list')
    ) {
      const endpoint =
        operation === 'issue-list'
          ? forgejoIssueListEndpoint(input, activeRepository)
          : forgejoPullListEndpoint(input, activeRepository);
      const paginated = await readForgejoPaginated(activeRepository, endpoint, runner, operation, {
        ...(input.limit === undefined ? {} : { limit: requireNumber(input.limit, 'limit') }),
        ...(input.maxPages === undefined
          ? {}
          : { maxPages: requireNumber(input.maxPages, 'maxPages') }),
      });
      return {
        ok: true,
        operation,
        provider: activeRepository.provider,
        data: {
          result: normalizeRemoteData(operation, paginated.items, activeRepository, input),
          commands: paginated.commands,
          pagesFetched: paginated.pagesFetched,
          conditionalWriteAvailable: false,
        },
        dryRun: false,
      };
    }
    // A **named** Forgejo branch, because the generic pagination branch above is hard-coded to
    // `issue-list` and `pr-list` and nothing routes a third operation into it. Without this branch
    // the read falls through to the generic mutation tail, issues exactly one request for page 1,
    // and reports whatever `MAX_RESPONSE_ITEMS` returned as the complete list — the truncation
    // `readForgejoPaginated` exists to prevent, and on this operation it would drop precisely the
    // changes-requested review a merge precondition is evaluated over.
    //
    // `totalIsExact: false` for the same reason the thread walk keeps it: `ListPullReviews` counts
    // the review rows with `CountReviews` while `convert.ToPullReviewList` omits every pending
    // review belonging to another user, so the header legitimately exceeds the body and may end the
    // walk early but never condemn it. And the envelope publishes `data.commands` **plural**, as
    // every paginated Forgejo read does — the generic tail's singular `data.command` states one
    // request, which this path is not.
    if (operation === 'pr-reviews-read' && activeRepository.provider === 'forgejo') {
      const reviewsEndpoint = `repos/${activeRepository.owner}/${activeRepository.repository}/pulls/${prNumber(input)}/reviews`;
      const paginated = await readForgejoPaginated(
        activeRepository,
        reviewsEndpoint,
        runner,
        operation,
        {
          totalIsExact: false,
          ...(input.limit === undefined ? {} : { limit: requireNumber(input.limit, 'limit') }),
          ...(input.maxPages === undefined
            ? {}
            : { maxPages: requireNumber(input.maxPages, 'maxPages') }),
        },
      );
      return {
        ok: true,
        operation,
        provider: activeRepository.provider,
        data: {
          result: normalizeRemoteData(operation, paginated.items, activeRepository, input),
          commands: paginated.commands,
          pagesFetched: paginated.pagesFetched,
          conditionalWriteAvailable: false,
        },
        dryRun: false,
      };
    }
    // The review-thread walk publishes every call it made, for the same reason the status read does:
    // the plan `buildCommandPlan` answered with — and therefore the preview computed above — is the
    // review listing alone, because the per-review comment reads are addressed by the IDs it
    // returns and are not knowable before it has run.
    if (operation === 'review-threads-read' && activeRepository.provider === 'forgejo') {
      const threads = await readForgejoReviewThreads(input, activeRepository, runner);
      return {
        ok: true,
        operation,
        provider: activeRepository.provider,
        data: {
          result: threads.result,
          commands: threads.commands,
          conditionalWriteAvailable: false,
        },
        dryRun: false,
      };
    }
    // Both providers read the status through the same reader, so `mergeHeadGuard` and this branch
    // can never diverge. What differs is only how many commands that took: GitHub's one GraphQL
    // query is reported as `data.command`, Forgejo's three `tea api` calls as `data.commands`,
    // mirroring the `pr-checks-wait` branch below. The plan `buildCommandPlan` answers with — and
    // therefore the preview computed above — is call 1 alone, because calls 2 and 3 are addressed
    // by the head SHA call 1 returns and are not knowable before it has run. Only the executed
    // list below reports all three.
    if (operation === 'pr-status-read') {
      const status = await readPullRequestStatus(input, activeRepository, runner);
      return {
        ok: true,
        operation,
        provider: activeRepository.provider,
        data: {
          result: status.result,
          ...(activeRepository.provider === 'forgejo'
            ? { commands: status.commands }
            : { command: status.commands[0] }),
          conditionalWriteAvailable: probe.capabilities?.conditionalWrites === true,
        },
        dryRun: false,
      };
    }
    // `tea api` exits 0 on every 4xx and 5xx, so the merge result is decided by the HTTP status
    // rather than by the exit code. A moved head is the one rejection that must stay distinguishable
    // from every other: Forgejo answers it with 409, which becomes a `STALE_WRITE` stating
    // `merged: false` instead of a `COMMAND_FAILED` carrying `mutationMayHaveSucceeded: true` — the
    // caller may safely re-read after this, and must not be told the merge might have gone through.
    // Every other rejection — 405 for a merge style the repository does not allow, 403 for a
    // permission or branch-protection refusal — is a failure the server definitively did not act on.
    if (operation === 'pr-merge' && activeRepository.provider === 'forgejo') {
      const result = await runChecked(runner, plan, operation);
      const response = readTeaApiResponse(result, operation);
      // Tolerant on every path the status decides, for the reason `teaApiSuccess` states: a proxy's
      // HTML 502 page must not become an `INVALID_PAYLOAD` that hides a merge the forge may have
      // applied. The 2xx body below is read strictly, because there it is data.
      const message = teaApiMessage(teaApiDiagnosticBody(result));
      if (response.status === 409) {
        fail('STALE_WRITE', 'pull-request head moved before the forge accepted the merge', {
          number: prNumber(input),
          expectedHeadSha: expectedHeadSha(input.payload ?? input),
          merged: false,
          status: response.status,
          ...(message === undefined ? {} : { message }),
        });
      }
      // The second, cheaper assertion beside the status: Forgejo answers an accepted merge with 200
      // and an **empty** body, which `parseJsonOutput` turns into `null`, so any returned object is
      // a rejection carrying `{"message":…}` however the status was spelled.
      //
      // A 5xx is the one rejection here the server did not choose, and it is exactly as
      // unobservable as a dropped connection: Forgejo may have merged before it failed to answer.
      // It therefore carries the possibly-applied flag rather than denying it, and the message
      // stops calling it a refusal. Every status below 500 stays a deliberate answer — 409 was
      // already taken above, 405 for a merge style the repository does not allow, 403 for a
      // permission or branch-protection refusal — and a 2xx carrying a body is the forge stating a
      // rejection it spelled as success.
      if (
        response.status < 200 ||
        response.status >= 300 ||
        // Only reached for a 2xx, where the body is data and an unreadable one is genuinely an
        // `INVALID_PAYLOAD`. Short-circuiting keeps it out of every non-2xx decision above.
        response.readBody() !== null
      ) {
        const mayHaveApplied = response.status >= 500;
        fail(
          'COMMAND_FAILED',
          mayHaveApplied ? 'forgejo left the merge outcome unstated' : 'forgejo refused the merge',
          {
            number: prNumber(input),
            status: response.status,
            mutationMayHaveSucceeded: mayHaveApplied,
            ...(message === undefined ? {} : { message }),
          },
          false,
        );
      }
      // The merge is applied from here on; everything below only decides what the envelope may
      // claim about the head it applied. `mergeHeadGuard` corroborated that head one call earlier,
      // but it closes no race of its own — a server that ignores `head_commit_id` leaves exactly
      // the window between that read and the merge unguarded — so the head is read back once
      // afterwards. It is confirm-or-omit deliberately: a differing head has two indistinguishable
      // causes, the ignored-`head_commit_id` race and a push that landed after a correct merge, so
      // adopting it could replace a correct record with a wrong one.
      const expected = expectedHeadSha(input.payload ?? input);
      const readBackPlan = {
        ...buildCommandPlan('pr-status-read', input, activeRepository),
        // Bounded at the call site rather than in `buildCommandPlan`, so the builder keeps
        // answering with an unbounded plan for every caller: only this one read bounds itself. The
        // merge already happened, and a forge that stops answering must not leave the operation
        // hanging on a read whose whole job is a corroboration the envelope can also do without.
        timeoutMs: 30_000,
      };
      let confirmedHeadSha;
      let headShaUnconfirmed;
      try {
        const readBack = teaApiSuccess(
          await runChecked(runner, readBackPlan, 'pr-merge head read-back'),
          'pr-merge head read-back',
        ).body;
        // Normalized on both sides before comparing: `expectedHeadSha` lowercases and the forge
        // states whatever casing it stores, so a literal comparison would report a confirmed head
        // as unconfirmed. A head the response does not state as a usable string is not a differing
        // head — it is no statement at all.
        const stated = typeof readBack?.head?.sha === 'string' ? readBack.head.sha.trim() : '';
        if (stated === '') headShaUnconfirmed = 'unavailable';
        else if (stated.toLowerCase() === expected) confirmedHeadSha = expected;
        else headShaUnconfirmed = 'differs';
      } catch {
        // Every failure this read can raise is discarded here, and it can raise several: a non-zero
        // exit is a `COMMAND_FAILED` from `runChecked`, a non-2xx status one from `teaApiSuccess`,
        // a response without a status line an `INVALID_PAYLOAD` from `readTeaApiResponse`. None of
        // them may reach the operation catch, where an applied merge would be reported as failed.
        // The distinct label keeps that error out of the `pr-merge` tolerance too, so no failure
        // here can ever be dressed up as `mutationMayHaveSucceeded`.
        headShaUnconfirmed = 'unavailable';
      }
      return {
        ok: true,
        operation,
        provider: activeRepository.provider,
        data: {
          result: normalizeRemoteData(operation, null, activeRepository, input, {
            ...(confirmedHeadSha === undefined ? {} : { confirmedHeadSha }),
            ...(headShaUnconfirmed === undefined ? {} : { headShaUnconfirmed }),
          }),
          // `data.command` keeps naming the merge, as `label-create` does for its own second call,
          // so the generic mutation contract — inspect exactly that command — stays true; `steps`
          // is what states the read-back beside it.
          command: preview,
          steps: [
            { step: 'merge', command: preview },
            { step: 'head-read-back', command: redact(readBackPlan) },
          ],
          conditionalWriteAvailable: false,
        },
        dryRun: false,
      };
    }
    // The wait is two gh invocations because one cannot exist: `gh pr checks` rejects `--watch`
    // together with `--json`, so the blocking watch and the structured read never share an argument
    // vector. It stays a single blocking wait for the caller, not a prompt-driven poll loop — the
    // watch does all the waiting under the caller's bound, and the read that follows is the sole
    // authority for the payload and for any operational error. The read runs in every case,
    // including after a timeout, because a timed-out wait that reported no checks would withhold
    // exactly the pending list the caller has to act on.
    if (operation === 'pr-checks-wait') {
      const watch = await runChecked(runner, plan, 'pr-checks-watch');
      const readPlan = buildChecksReadPlan(input, activeRepository);
      const readResult = await runChecked(runner, readPlan, operation);
      const parsed = parseCommandOutput(readResult, readPlan, operation);
      // Either step can report that the checks were not finished, and both statements count. The
      // watch says so by running out of its bound; the read says so independently through exit code
      // 8, which is the provider's own "still pending" and the only such signal when the watch
      // returned cleanly. Dropping either would call a wait clean that the provider called pending,
      // and a timeout keeps `complete` false even when the read comes back all green — the wait was
      // cut short, so nothing about it is proven done. `forcedKill` stays the watch's alone: it
      // describes a child that had to be killed, which says nothing about the read.
      if (watch?.timedOut === true || readResult?.timedOut === true) parsed.timedOut = true;
      if (watch?.forcedKill === true) parsed.forcedKill = true;
      // The read is also the only step that can observe gh reporting no required check for this
      // branch — the watch never applies `--required` at all, and its exit status is discarded
      // regardless. The fact rides the same metadata channel because the payload it explains is
      // empty by definition, and the normalizer needs it to tell an empty `--required` response
      // apart from a read that returned a rollup. It stays a record of what gh reported rather than
      // a statement about branch protection, which is why it never makes the wait complete.
      if (readResult?.requiredChecksDefined === false) parsed.requiredChecksDefined = false;
      return {
        ok: true,
        operation,
        provider: activeRepository.provider,
        data: {
          result: normalizeRemoteData(operation, parsed.raw, activeRepository, input, parsed),
          commands: [preview, redact(readPlan)],
          conditionalWriteAvailable: probe.capabilities?.conditionalWrites === true,
        },
        dryRun: false,
      };
    }
    const result = await runChecked(runner, plan, operation);
    // Every `tea api --include` plan reads its HTTP status before its body is trusted, whichever
    // operation built it. `parseCommandOutput` cannot do that: tea prints the header block to
    // stderr where `gh --include` prints it to stdout, so its `includesHeaders` branch would find
    // plain JSON on stdout and hand a 401 body on as data — and `tea api` exits 0 for it.
    const parsed = isTeaApiIncludePlan(plan)
      ? { raw: teaApiSuccess(result, operation).body }
      : parseCommandOutput(result, plan, operation);
    // A bounded wait reports its outcome through the exit status, not through its payload, so the
    // wait result travels next to the parsed output into the normalizer. A forced stop is reported
    // separately from a clean one: it means the provider ignored SIGTERM, which is worth seeing.
    if (result.timedOut === true) parsed.timedOut = true;
    if (result.forcedKill === true) parsed.forcedKill = true;
    return {
      ok: true,
      operation,
      provider: activeRepository.provider,
      data: {
        result: normalizeRemoteData(operation, parsed.raw, activeRepository, input, parsed),
        command: preview,
        conditionalWriteAvailable: probe.capabilities?.conditionalWrites === true,
      },
      dryRun: false,
    };
  } catch (error) {
    return errorEnvelope(operation, error, dryRun);
  }
}

export function errorEnvelope(operation, error, dryRun = false) {
  const normalized =
    error instanceof RemoteTrackerError
      ? error
      : new RemoteTrackerError('COMMAND_FAILED', error?.message ?? 'unexpected failure', {}, false);
  return {
    ok: false,
    operation,
    provider: null,
    data: null,
    dryRun,
    error: {
      code: normalized.code,
      message: normalized.message,
      details: redact(normalized.details),
      retryable: normalized.retryable,
    },
  };
}
