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
  'review-thread-reply',
  'review-thread-resolve',
]);

const REMOTE_OPERATIONS = new Set([
  'repository-resolve',
  'probe',
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
  'pr-create',
  'pr-update-body',
  'pr-comment',
  'review-threads-read',
  'review-thread-reply',
  'review-thread-resolve',
]);

const CAPABILITY_BY_OPERATION = Object.freeze({
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
  'pr-create': 'pullRequestCreate',
  'pr-update-body': 'pullRequestUpdate',
  'pr-comment': 'prComment',
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
});

export function buildCommentPayload(kind, input) {
  if (!Object.hasOwn(COMMENT_MARKERS, kind)) {
    fail('INVALID_PAYLOAD', 'comment kind must be planning, apply, or pr', { kind });
  }
  requireObject(input, 'comment');
  const content = assertPublishable(input.body, 'comment.body').trim();
  if (content === '') fail('INVALID_PAYLOAD', 'comment.body must not be empty');
  const marker = COMMENT_MARKERS[kind];
  return { kind, marker, body: `<!-- ${marker} -->\n${content}` };
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
      case 'review-threads-read': {
        const query = `query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100){nodes{id isResolved path line startLine diffSide comments(first:100){nodes{id databaseId body path line originalLine startLine originalStartLine author{__typename login}}}}}}}}`;
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
    case 'review-thread-reply':
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

function parseCommandOutput(result, plan, label) {
  const text = result.stdout.trim();
  if (plan.expectsJson === false) return { raw: { completed: true, output: text } };
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

async function runChecked(runner, plan, label) {
  const result = await runner(plan);
  if (result?.error?.code === 'ENOENT') {
    fail('CLI_MISSING', `${plan.executable} is not installed`, { executable: plan.executable });
  }
  if (!result || result.status !== 0) {
    if (label === 'label-create' && /already[_ ]exists/i.test(result?.stderr ?? '')) {
      return { ...result, status: 0, stdout: '{"unchanged":true}' };
    }
    fail(
      'COMMAND_FAILED',
      `${label} failed`,
      {
        executable: plan.executable,
        args: redact(plan.args),
        status: result?.status,
        stderr: redact(result?.stderr ?? ''),
      },
      true,
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

function assertMinimumVersion(actual, minimum, executable) {
  for (let index = 0; index < minimum.length; index += 1) {
    if (actual[index] > minimum[index]) return;
    if (actual[index] < minimum[index]) {
      fail('UNSUPPORTED_CAPABILITY', `${executable} is too old for the remote-tracker adapter`, {
        capability: 'version',
        installed: actual.join('.'),
        minimum: minimum.join('.'),
      });
    }
  }
}

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
  assertMinimumVersion(
    parseCliVersion(versionResult.stdout, executable),
    repository.provider === 'github' ? [2, 0, 0] : [0, 9, 0],
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
    return {
      executable,
      version,
      authenticated: true,
      capabilities: {
        json: true,
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
        pullRequestCreate: true,
        pullRequestUpdate: true,
        prComment: true,
        comments: true,
        labels: true,
        labelCreate: true,
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
      pullRequestCreate: pullCreate,
      pullRequestDraftCreate: pullCreate && pullCreateDraft,
      pullRequestUpdate: pullEdit,
      prComment: comment,
      comments: comment,
      labels: labelCreate && issueLabelAdd && issueLabelRemove,
      labelCreate,
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
    labels: (item.labels ?? []).map(normalizeLabel).filter(Boolean),
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

function normalizeComment(comment) {
  if (!comment || typeof comment !== 'object') {
    fail('INVALID_PAYLOAD', 'provider returned an invalid issue comment');
  }
  return {
    id: requireNumber(comment.id, 'provider comment id'),
    body: comment.body ?? comment.content ?? '',
    author: comment.user?.login ?? comment.poster?.login ?? comment.author?.login,
    url: comment.html_url ?? comment.url,
  };
}

function flattenPages(value) {
  return Array.isArray(value) && value.every(Array.isArray) ? value.flat() : value;
}

function normalizeTeaCreate(operation, raw, repository, input) {
  const output = raw?.output;
  const url =
    typeof output === 'string'
      ? output
          .split(/\r?\n/)
          .map((line) => line.trim())
          .reverse()
          .find((line) => /^https?:\/\/\S+$/.test(line))
      : undefined;
  if (!url) {
    fail('INVALID_PAYLOAD', `${operation} succeeded without a parseable tea result URL`, {
      mutationMayHaveSucceeded: true,
      stdout: redact(output ?? ''),
    });
  }
  const kind = operation === 'issue-create' ? 'issue' : 'pull-request';
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
    case 'review-threads-read': {
      const threads =
        flattened?.data?.repository?.pullRequest?.reviewThreads?.nodes ??
        flattened?.reviewThreads ??
        (Array.isArray(flattened) ? flattened : []);
      return threads.map((thread) => {
        if (thread.comments?.nodes) {
          return {
            id: thread.id,
            isResolved: thread.isResolved === true,
            path: thread.path ?? thread.comments.nodes[0]?.path,
            line: thread.line ?? thread.comments.nodes[0]?.line,
            startLine: thread.startLine ?? thread.comments.nodes[0]?.startLine,
            comments: thread.comments.nodes.map((comment) => ({
              id: comment.id,
              databaseId: comment.databaseId,
              body: comment.body ?? '',
              author: normalizeAuthor(comment.author),
              path: comment.path,
              line: comment.line ?? comment.originalLine,
              startLine: comment.startLine ?? comment.originalStartLine,
            })),
          };
        }
        return {
          id: thread.id,
          isResolved: Boolean(thread.resolver),
          path: thread.path,
          line: thread.line,
          comments: [
            {
              id: thread.id,
              body: thread.body ?? '',
              author: normalizeAuthor(thread.reviewer),
              path: thread.path,
              line: thread.line,
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

    const runner =
      options.runner ??
      (async () => fail('INVALID_PAYLOAD', 'remote operations require an injected process runner'));
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
    const result = await runChecked(runner, plan, operation);
    const parsed = parseCommandOutput(result, plan, operation);
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
