// The decomposition-key and child-sanitizing subsystem of the `remote-tracker` helper.
//
// It owns the versioned `DECOMPOSITION_*` wire prefixes, the key inspector that reads them back,
// and the redaction boundary every sub-issue draft passes through before it reaches a forge. The
// prefixes are a wire contract: a parser and the writer that produced the text it reads have to
// derive their matcher from the same constant, which is why the constants and the parsers live in
// one module rather than next to their callers.
//
// It imports from `remote-tracker-shared-core.mjs` only, and is imported by
// `remote-tracker-github-core.mjs` and `remote-tracker-core.mjs`.

import {
  exactObjectKeys,
  fail,
  lifecycleRepositoryBinding,
  normalizeExternalLifecycleReference,
  normalizeForgeLifecycleReference,
  parseReference,
  publishableText,
  redact,
  requireObject,
  requireString,
} from './remote-tracker-shared-core.mjs';

const DECOMPOSITION_KEY_MARKER = 'effective-flow-decomposition-key';

const DECOMPOSITION_KEY_VERSION = 'v2';

const DECOMPOSITION_KEY_PREFIX = `${DECOMPOSITION_KEY_MARKER}:${DECOMPOSITION_KEY_VERSION}`;

export const DECOMPOSITION_SECTION_MARKER = 'effective-flow-decomposition';

const DECOMPOSITION_SECTION_VERSION = 'v2';

export const DECOMPOSITION_SECTION_PREFIX = `${DECOMPOSITION_SECTION_MARKER}:${DECOMPOSITION_SECTION_VERSION}`;

export const DECOMPOSITION_RECORD_MARKER = 'effective-flow-decomposition-record';

const DECOMPOSITION_RECORD_VERSION = 'v2';

export const DECOMPOSITION_RECORD_PREFIX = `${DECOMPOSITION_RECORD_MARKER}:${DECOMPOSITION_RECORD_VERSION}`;

// Every marker version this file writes is `v<N>`, so a probe that reports a stored version back
// to a caller captures exactly that shape and nothing wider.
const DECOMPOSITION_MARKER_VERSION_PATTERN = 'v[0-9]{1,3}';

export const GITHUB_DECOMPOSITION_COMMENT_MAX_BYTES = 65_536;

const DECOMPOSITION_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;

export const DECOMPOSITION_WORKFLOWS = Object.freeze([
  'Feature',
  'Bugfix',
  'Refactoring',
  'Documentation',
]);

export const DECOMPOSITION_STATUSES = Object.freeze([
  'proposed',
  'approved',
  'created',
  'missing',
  'declined',
]);

export const ACTIVE_DECOMPOSITION_STATUSES = new Set([
  'proposed',
  'approved',
  'created',
  'missing',
]);

const SENSITIVE_CHILD_FIELD =
  '(?:(?:[A-Z][A-Z0-9]*_)+(?:TOKEN|PASSWORD|SECRET|API_KEY|ACCESS_KEY_ID|SECRET_ACCESS_KEY|PRIVATE_KEY|CLIENT_SECRET|SESSION_ID)|access[ _-]?token|refresh[ _-]?token|api[ _-]?key|client[ _-]?secret|password|private[ _-]?key|secret|session[ _-]?id|aws[ _-]?access[ _-]?key[ _-]?id|aws[ _-]?secret[ _-]?access[ _-]?key|token)';

const SENSITIVE_CHILD_ASSIGNMENT = `(?<![A-Za-z0-9_])["']?${SENSITIVE_CHILD_FIELD}["']?(?![A-Za-z0-9_])\\s*[:=]\\s*`;

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function markdownLineInventory(text) {
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

export function assertClosedMarkdownFences(text, field) {
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

export function untrustedControlLines(text, marker) {
  const inventory = markdownLineInventory(text);
  return {
    ...inventory,
    controls: inventory.inventory.filter(
      ({ line, quoted, outsideFence }) =>
        outsideFence && !quoted && line.startsWith(`<!-- ${marker}`),
    ),
  };
}

export function parentIssueNumber(input, repository) {
  const parent = input.parent ?? input.parentIssue;
  if (parent === undefined || parent === null) {
    fail('INVALID_REFERENCE', 'parent issue is required', { field: 'parent' });
  }
  return parseReference(parent, { expectedKind: 'issue', repository }).number;
}

export function decompositionKey(value, field = 'payload.decompositionKey') {
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

export function inspectDecompositionKey(body, expectedParent, context) {
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

// The absent case returns a wrapper rather than `undefined`: `executeOperation` in
// `remote-tracker-core.mjs` reads an `undefined` local result as "not a local operation", so a bare
// `undefined` here would make every clean body fail as an unknown operation.
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

export function sanitizeChildText(value, field) {
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

function canonicalDecompositionRepository(context) {
  return context.target === 'forge' ? { host: context.host, slug: context.repository } : undefined;
}

export function normalizeCanonicalDecompositionReference(value, field, context) {
  return context.target === 'forge'
    ? normalizeForgeLifecycleReference(
        typeof value === 'number' ? String(value) : value,
        field,
        canonicalDecompositionRepository(context),
      )
    : normalizeExternalLifecycleReference(value, field);
}

export function encodeCanonicalDecomposition(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCanonicalDecomposition(value, field) {
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

export function childIssuePayload(input, repository) {
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
