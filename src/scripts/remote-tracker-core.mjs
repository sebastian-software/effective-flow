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
  'issue-update-body',
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
  'issue-comments-read',
  'issue-list',
  'issue-create',
  'issue-update-body',
  'issue-comment',
  'issue-comment-update',
  'issue-labels',
  'issue-label-add',
  'issue-label-remove',
  'sf-label-migrate',
  'pr-read',
  'pr-comments-read',
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
  'issue-comments-read': 'issueCommentsRead',
  'issue-list': 'issueList',
  'issue-create': 'issueCreate',
  'issue-update-body': 'issueUpdate',
  'issue-comment': 'issueComment',
  'issue-comment-update': 'issueCommentUpdate',
  'issue-labels': 'issueLabelAdd',
  'issue-label-add': 'issueLabelAdd',
  'issue-label-remove': 'issueLabelRemove',
  'sf-label-migrate': 'labelMigration',
  'pr-read': 'pullRequestRead',
  'pr-comments-read': 'prCommentsRead',
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
  return { kind, marker, body: stampMarker(marker, content) };
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
    for (const label of labels) {
      if (
        !/^sf-(review-finding|review-epic|fix|refactor|build|docs|issue-done|needs-planning)$/.test(
          label,
        )
      )
        continue;
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
  return value
    .replace(/([a-z][a-z\d+.-]*:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, '$1[REDACTED]@')
    .replace(/\b(?:gh[opusr]_|github_pat_|gitea_)[A-Za-z0-9_=-]+\b/g, '[REDACTED]')
    .replace(/(Authorization\s*:\s*(?:Bearer|token)\s+)\S+/gi, '$1[REDACTED]')
    .replace(/([?&](?:access_)?token=)[^&\s]+/gi, '$1[REDACTED]');
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
// protection marks a check as required, so `prReview.requireAllChecks: false` — documented as "the
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

function prNumber(input) {
  return requireNumber(input.number ?? input.pullRequest, 'pull-request number');
}

function mutationPlan(executable, args, stdin, metadata = {}) {
  return { executable, args, ...(stdin === undefined ? {} : { stdin }), ...metadata };
}

export function buildCommandPlan(operation, input, repository) {
  requireObject(input);
  const { provider, owner, repository: repo, slug, host } = repository;
  const ghEndpoint = (suffix) => `repos/${owner}/${repo}/${suffix}`;
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
      case 'label-create':
        return mutationPlan(
          'gh',
          ['api', ...hostArgs, '-X', 'POST', ghEndpoint('labels'), '--input', '-'],
          jsonStdin({
            name: requireString(payload.name, 'name'),
            color: payload.color ?? 'ededed',
            description: payload.description ?? '',
          }),
        );
      case 'issue-read':
        return mutationPlan(
          'gh',
          ['api', ...hostArgs, '--include', ghEndpoint(`issues/${issueNumber(input)}`)],
          undefined,
          { includesHeaders: true },
        );
      case 'issue-comments-read':
        return mutationPlan('gh', [
          'api',
          ...hostArgs,
          '--paginate',
          '--slurp',
          ghEndpoint(`issues/${issueNumber(input)}/comments`),
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
        const query = `query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100){nodes{id isResolved path line startLine diffSide comments(first:100){nodes{id databaseId body path line originalLine startLine originalStartLine createdAt author{__typename login}}}}}}}}`;
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
          jsonStdin({ body: assertPublishable(payload.body, 'payload.body') }),
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

  switch (operation) {
    case 'label-create':
      return mutationPlan('tea', [
        'labels',
        'create',
        ...teaJson,
        '--name',
        requireString(payload.name, 'name'),
        '--color',
        payload.color ?? 'ededed',
        '--description',
        payload.description ?? '',
      ]);
    case 'issue-read':
      return mutationPlan('tea', [
        'issues',
        String(issueNumber(input)),
        ...teaJson,
        '--fields',
        'index,title,state,body,labels,url',
      ]);
    case 'issue-comments-read':
      return mutationPlan('tea', [
        'issues',
        String(issueNumber(input)),
        ...teaJson,
        '--comments',
        '--fields',
        'index,comments',
      ]);
    case 'issue-list': {
      const args = [
        'issues',
        'list',
        ...teaJson,
        '--state',
        input.state ?? 'all',
        '--page',
        String(input.page ?? 1),
        '--limit',
        String(input.limit ?? 100),
      ];
      if (input.labels?.length) args.push('--labels', input.labels.join(','));
      return mutationPlan('tea', args);
    }
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
    case 'pr-read':
      return mutationPlan('tea', [
        'pulls',
        String(prNumber(input)),
        ...teaJson,
        '--fields',
        'index,title,state,body,labels,url,head,base',
      ]);
    case 'pr-comments-read':
      return mutationPlan('tea', [
        'pulls',
        String(prNumber(input)),
        ...teaJson,
        '--comments',
        '--fields',
        'index,comments',
      ]);
    case 'pr-list': {
      return mutationPlan('tea', [
        'pulls',
        'list',
        ...teaJson,
        '--state',
        input.state ?? 'open',
        '--page',
        String(input.page ?? 1),
        '--limit',
        String(input.limit ?? 100),
        // Same field list as `pr-read`: without it tea's list renderer omits head and base, and
        // every item has to be hydrated through a separate read. Purely additive — callers keep
        // hydrating an incomplete item, so a tea that ignores the request behaves as before.
        '--fields',
        'index,title,state,body,labels,url,head,base',
      ]);
    }
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
    case 'review-threads-read':
      return mutationPlan('tea', [
        'pulls',
        'review-comments',
        String(prNumber(input)),
        ...teaJson,
        '--fields',
        'id,body,reviewer,path,line,resolver,url',
      ]);
    // The identity read joins the same group for a reason of its own. `tea logins list` reports the
    // locally configured logins, which is a client-side setting rather than the account the forge
    // attributes a write to; the two can differ, and a caller that separates its own comments from a
    // person's would then claim a stranger's comment as its own. No verified tea surface states the
    // authenticated account, so this is declared absent instead of guessed from local configuration.
    case 'viewer-read':
    // The pull-request gate operations join this group deliberately. The installed tea adapter
    // exposes no verified surface for a check rollup, for a blocking watch, or for a merge that
    // honours an expected head commit, so a Forgejo run fails closed here instead of improvising a
    // provider request around the most irreversible mutation in the set.
    case 'review-create':
    case 'review-thread-reply':
    case 'pr-status-read':
    case 'pr-checks-wait':
    case 'pr-merge':
      fail('UNSUPPORTED_CAPABILITY', `installed tea adapter does not safely support ${operation}`, {
        operation,
        provider: 'forgejo',
      });
    case 'review-thread-resolve':
      return mutationPlan('tea', [
        'pulls',
        'resolve',
        String(requireNumber(input.threadId, 'threadId')),
        ...teaJson,
      ]);
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
    if (label === 'label-create' && /already[_ ]exists/i.test(result?.stderr ?? '')) {
      return { ...result, status: 0, stdout: '{"unchanged":true}' };
    }
    // A failed merge is not safely retryable: the forge may have accepted it before the connection
    // dropped, so a second attempt could act on a state nobody verified. The caller has to re-read
    // instead — the same discipline the tea create fallback already states for its own writes.
    const irreversible = label === 'pr-merge';
    fail(
      'COMMAND_FAILED',
      `${label} failed`,
      {
        executable: plan.executable,
        args: redact(plan.args),
        status: result?.status,
        stderr: redact(result?.stderr ?? ''),
        ...(irreversible ? { mutationMayHaveSucceeded: true } : {}),
      },
      !irreversible,
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

export async function probeProvider(repository, runner) {
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
        issueUpdate: true,
        issueComment: true,
        issueCommentUpdate: true,
        issueLabelAdd: true,
        issueLabelRemove: true,
        labelMigration: true,
        pullRequests: true,
        pullRequestRead: true,
        prCommentsRead: true,
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
    pullReviewComments,
    pullResolve,
    pullCreate,
    pullCreateDraft,
    pullEdit,
    comment,
    commentUpdate,
    labelCreate,
  ] = await Promise.all([
    probeTeaHelp(runner, ['issues'], ['--output']),
    probeTeaHelp(runner, ['issues'], ['--comments']),
    probeTeaHelp(runner, ['issues', 'create'], ['--title', '--description']),
    probeTeaHelp(runner, ['issues', 'edit'], ['--description']),
    probeTeaHelp(runner, ['issues', 'edit'], ['--add-labels']),
    probeTeaHelp(runner, ['issues', 'edit'], ['--remove-labels']),
    probeTeaHelp(runner, ['pulls'], ['--output']),
    probeTeaHelp(runner, ['pulls'], ['--comments']),
    probeTeaHelp(runner, ['pulls', 'review-comments'], ['--output', '--fields']),
    probeTeaHelp(runner, ['pulls', 'resolve'], ['--output']),
    probeTeaHelp(runner, ['pulls', 'create'], ['--head', '--base']),
    probeTeaHelp(runner, ['pulls', 'create'], ['--draft']),
    probeTeaHelp(runner, ['pulls', 'edit'], ['--description']),
    probeTeaHelp(runner, ['comment'], ['--output']),
    probeTeaHelp(runner, ['api'], ['--method', '--data']),
    probeTeaHelp(runner, ['labels', 'create'], ['--output', '--name']),
  ]);
  return {
    executable,
    version,
    login: login.name,
    authenticated: true,
    capabilities: {
      json: true,
      // No probe is attempted for the identity read either: the login this adapter knows is the one
      // configured locally, not the one the forge attributes a write to, so the capability is
      // reported as absent rather than answered from a client-side setting.
      viewerRead: false,
      issues,
      issueRead: issues,
      issueCommentsRead: issues && issueComments,
      issueList: issues,
      issueCreate,
      issueUpdate,
      issueComment: comment,
      issueCommentUpdate: commentUpdate,
      issueLabelAdd,
      issueLabelRemove,
      labelMigration: issueLabelAdd && issueLabelRemove,
      pullRequests: pulls,
      pullRequestRead: pulls,
      prCommentsRead: pulls && pullComments,
      pullRequestList: pulls,
      // No probe is attempted for the gate operations: the installed tea adapter has no verified
      // check rollup, no blocking watch, and no merge that honours an expected head commit, so
      // they stay unsupported until an adapter check proves otherwise. Enabling them later is an
      // additive change; guessing them now would put an irreversible merge behind a guess.
      pullRequestStatus: false,
      pullRequestChecksWait: false,
      pullRequestMerge: false,
      pullRequestCreate: pullCreate,
      pullRequestDraftCreate: pullCreate && pullCreateDraft,
      pullRequestUpdate: pullEdit,
      prComment: comment,
      comments: comment,
      labels: labelCreate && issueLabelAdd && issueLabelRemove,
      labelCreate,
      reviewCreate: false,
      reviewThreads: pullReviewComments,
      reviewThreadReplies: false,
      reviewThreadResolution: pullResolve,
      conditionalWrites: false,
    },
  };
}

function normalizeLabel(label) {
  return typeof label === 'string' ? label : label?.name;
}

// tea's list renderer flattens `labels` into a comma-separated string while its single-item
// renderer returns an array, so the same field arrives in two shapes one call apart. Splitting
// the string rather than discarding it matters: an `Array.isArray(...) ? ... : []` guard would
// stop the crash but silently drop every label the list form actually carries.
function normalizeLabels(value) {
  const items = typeof value === 'string' ? value.split(',') : value;
  if (!Array.isArray(items)) return [];
  return items
    .map(normalizeLabel)
    .map((label) => (typeof label === 'string' ? label.trim() : label))
    .filter(Boolean);
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
        (typeof author.__typename === 'string' ? author.__typename === 'Bot' : undefined))
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
  return {
    number: requireNumber(item.number ?? item.index, 'provider issue number'),
    title: item.title ?? '',
    body: item.body ?? item.description ?? '',
    state: String(item.state ?? '').toLowerCase(),
    labels: normalizeLabels(item.labels),
    url: item.html_url ?? item.url ?? item.web_url,
    repository: repository.slug,
    ...(metadata.version ? { version: metadata.version } : {}),
  };
}

function normalizePullRequest(item, repository, metadata = {}) {
  const issue = normalizeIssue(item, repository, metadata);
  return {
    ...issue,
    head: item.head?.ref ?? item.headRefName ?? item.head_branch ?? item.head,
    base: item.base?.ref ?? item.baseRefName ?? item.base_branch ?? item.base,
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
  // Through the only caller this branch cannot fire: `PR_STATUS_QUERY` selects no top-level
  // timestamp, and the flattener builds the record from the head commit node itself, so no directly
  // stated field ever reaches it. It stays because it deliberately outranks the `oid` comparison
  // below: a value the provider states outright is its own answer rather than one this code
  // reconstructed. That precedence is the hazard, not the branch. Adding such a field to the query
  // or to the flattener as a convenience switches head verification off without touching a line of
  // this function, so anyone introducing one has to decide here whether the stated value may still
  // skip the match.
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
  const mergeable =
    typeof item.mergeable === 'boolean'
      ? item.mergeable
        ? 'MERGEABLE'
        : 'CONFLICTING'
      : upperCaseField(item.mergeable);
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
  return {
    id: requireNumber(comment.id, 'provider comment id'),
    body: comment.body ?? comment.content ?? '',
    author: comment.user?.login ?? comment.poster?.login ?? comment.author?.login,
    url: comment.html_url ?? comment.url,
    ...(createdAt === undefined ? {} : { createdAt }),
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

function normalizeRemoteData(operation, raw, repository, input = {}, metadata = {}) {
  const flattened = flattenPages(raw);
  switch (operation) {
    case 'viewer-read':
      return normalizeViewer(flattened);
    case 'issue-read':
    case 'issue-update-body':
      return flattened?.output !== undefined
        ? { ...flattened, repository: repository.slug }
        : normalizeIssue(flattened, repository, metadata);
    case 'issue-create':
      return repository.provider === 'forgejo'
        ? normalizeTeaCreate(operation, flattened, repository, input)
        : normalizeIssue(flattened, repository, metadata);
    case 'issue-list':
      return (Array.isArray(flattened) ? flattened : (flattened?.issues ?? []))
        .filter((item) => !item.pull_request)
        .map((item) => normalizeIssue(item, repository));
    case 'issue-comments-read':
    case 'pr-comments-read':
      return (Array.isArray(flattened) ? flattened : (flattened?.comments ?? [])).map(
        normalizeComment,
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
      return {
        number: prNumber(input),
        repository: repository.slug,
        merged: true,
        method: mergeMethod(payload),
        headSha: expectedHeadSha(payload),
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
            return {
              id: comment.id,
              databaseId: comment.databaseId,
              body: comment.body ?? '',
              author: normalizeAuthor(comment.author),
              path: comment.path,
              line: comment.line ?? comment.originalLine,
              startLine: comment.startLine ?? comment.originalStartLine,
              ...(createdAt === undefined ? {} : { createdAt }),
            };
          });
          // A thread has no creation time of its own in the provider's schema; its first comment is
          // its beginning by definition. Reading it off that comment is a restatement, not a guess,
          // and a thread whose first comment carries no timestamp still reports none. Every reply
          // keeps its own timestamp, because a bot that answers later must count as newer.
          const threadCreatedAt = comments[0]?.createdAt;
          return {
            id: thread.id,
            isResolved: thread.isResolved === true,
            path: thread.path ?? thread.comments.nodes[0]?.path,
            line: thread.line ?? thread.comments.nodes[0]?.line,
            startLine: thread.startLine ?? thread.comments.nodes[0]?.startLine,
            ...(threadCreatedAt === undefined ? {} : { createdAt: threadCreatedAt }),
            comments,
          };
        }
        const createdAt = normalizeTimestamp(thread.created_at, thread.createdAt, thread.created);
        return {
          id: thread.id,
          isResolved: Boolean(thread.resolver),
          path: thread.path,
          line: thread.line,
          ...(createdAt === undefined ? {} : { createdAt }),
          comments: [
            {
              id: thread.id,
              body: thread.body ?? '',
              author: normalizeAuthor(thread.reviewer),
              path: thread.path,
              line: thread.line,
              ...(createdAt === undefined ? {} : { createdAt }),
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
    default:
      return undefined;
  }
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

// The merge is the most irreversible mutation of the set, so the head the caller verified is
// re-checked against a fresh read immediately before it runs. The provider-side
// `--match-head-commit` guards the same race, but only this local check turns a moved head into the
// tool's own structured error — with the actual head reported and `merged: false` stated — instead
// of a generic command failure, and it keeps the guard intact for a provider without that flag.
async function mergeHeadGuard(input, repository, runner) {
  const expected = expectedHeadSha(input.payload ?? input);
  const readPlan = buildCommandPlan('pr-status-read', input, repository);
  const readResult = await runChecked(runner, readPlan, 'pr-status-read precondition');
  const parsed = parseCommandOutput(readResult, readPlan, 'pr-status-read');
  const status = normalizeRemoteData('pr-status-read', parsed.raw, repository, input, parsed);
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

async function executeTeaPaginatedList(operation, input, repository, runner) {
  const limit = input.limit === undefined ? 100 : requireNumber(input.limit, 'limit');
  const maxPages = input.maxPages === undefined ? 1000 : requireNumber(input.maxPages, 'maxPages');
  const items = [];
  const commands = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const plan = buildCommandPlan(operation, { ...input, page, limit }, repository);
    commands.push(redact(plan));
    const result = await runChecked(runner, plan, `${operation} page ${page}`);
    const parsed = parseCommandOutput(result, plan, operation);
    const pageItems = Array.isArray(parsed.raw)
      ? parsed.raw
      : (parsed.raw?.issues ?? parsed.raw?.pulls);
    if (!Array.isArray(pageItems)) {
      fail('INVALID_PAYLOAD', `${operation} returned a non-list page`, { page });
    }
    if (pageItems.length === 0) {
      return { raw: items, commands, pagesFetched: page };
    }
    items.push(...pageItems);
  }
  fail('UNSUPPORTED_CAPABILITY', `${operation} exceeded the bounded tea pagination limit`, {
    maxPages,
    itemsRead: items.length,
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
        : await probeProvider(repository, runner);
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
      const paginated = await executeTeaPaginatedList(operation, input, activeRepository, runner);
      return {
        ok: true,
        operation,
        provider: activeRepository.provider,
        data: {
          result: normalizeRemoteData(operation, paginated.raw, activeRepository, input),
          commands: paginated.commands,
          pagesFetched: paginated.pagesFetched,
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
    const parsed = parseCommandOutput(result, plan, operation);
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
