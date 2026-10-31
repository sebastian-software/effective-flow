// Claude Code settings: the parser of `<RUNTIME_STATE_ROOT>/.claude/settings.local.json` and the
// matcher of the helper allow-rule shape. It is shared by the runtime-state helper, which writes
// the rules (`harness allow-rules`), and by the read-only `setup-status` probe, which reports them;
// neither of those imports the other. This module reads only and imports no script but the
// dependency-free `runtime-file-primitives.mjs`.
//
// The one rule shape, per allowlisted helper operation (see ALLOWLISTED_OPERATIONS):
//
//   Bash(node <skillRoot>/scripts/effective-flow-state.mjs <group> <operation> *)
//
// `<skillRoot>` is the loaded skill's directory in its symlinked install form. The trailing `*`
// admits the here-string; the helper itself rejects any argv beyond its two operation tokens.

import path from 'node:path';
import { isObject, readBoundedFile, sameFileRead } from './runtime-file-primitives.mjs';

export const HELPER_RELATIVE_PATH = 'scripts/effective-flow-state.mjs';
export const SETTINGS_RELATIVE_PATH = '.claude/settings.local.json';

// The non-destructive helper operations that get one allow rule each. `lock break` and
// `harness allow-rules` never get a rule; the helper's operation classification pins that.
export const ALLOWLISTED_OPERATIONS = Object.freeze([
  'lock acquire',
  'lock release',
  'lock inspect',
  'memory reserve',
  'memory set-marker',
  'memory migrate-directory',
]);
// The helper operations that never get a rule: destructive, or the writer of the rules itself. A
// rule that would also admit one of them is widened.
export const NEVER_ALLOWLISTED_OPERATIONS = Object.freeze(['lock break', 'harness allow-rules']);

export const MAX_SETTINGS_BYTES = 1024 * 1024;

// The only characters a `skillRoot` may contain. Every other character, a shell or glob
// metacharacter, whitespace, a quote, `~`, a control or non-ASCII character, could change the
// meaning of the rule or of the command line it matches, so the set is an allowlist.
export const SKILL_ROOT_PATTERN = /^[A-Za-z0-9._@+/-]+$/;

const OPERATION_TOKEN = '[a-z][a-z-]*';
const HELPER_RULE_PATTERN = new RegExp(
  `^Bash\\(node (/[A-Za-z0-9._@+/-]*)/scripts/effective-flow-state\\.mjs (${OPERATION_TOKEN}) (${OPERATION_TOKEN}) \\*\\)$`,
);

export class SettingsError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SettingsError';
    this.code = code;
  }
}

export function helperRule(skillRoot, operation) {
  return `Bash(node ${skillRoot}/${HELPER_RELATIVE_PATH} ${operation} *)`;
}

export function helperRules(skillRoot) {
  return ALLOWLISTED_OPERATIONS.map((operation) => helperRule(skillRoot, operation));
}

// Parses a rule of exactly the helper shape: `{ skillRoot, operation }`, or null for any other
// rule. The operation may be one that is not allowlisted; the caller decides what that means.
export function parseHelperRule(rule) {
  if (typeof rule !== 'string') return null;
  const match = HELPER_RULE_PATTERN.exec(rule);
  if (!match) return null;
  const skillRoot = match[1];
  if (!SKILL_ROOT_PATTERN.test(skillRoot)) return null;
  if (
    skillRoot !== '/' &&
    (skillRoot.endsWith('/') || path.posix.normalize(skillRoot) !== skillRoot)
  ) {
    return null;
  }
  return { skillRoot, operation: `${match[2]} ${match[3]}` };
}

// Why an allow rule is wider than the helper shape and admits a helper call it should not, or null.
// The widened rules are warned about and never removed: the user may have chosen them.
//   any-command        `Bash` or `Bash(*)`
//   any-node-command   `Bash(node *)`, `Bash(node:*)` or another bare `node` prefix
//   helper-wildcard    a rule naming the helper that is not of the exact helper shape, or any
//                      pattern that matches a never-allowlisted call of one of `helperPaths`,
//                      such as `Bash(node <skillRoot>/scripts/*)` or `Bash(node ~/.claude/skills/*)`
//   not-allowlisted    an exact helper-shape rule for an operation that is never allowlisted
//
// `options.helperPaths` lists the helper file paths a command line may name (the install form and
// its realpath); `options.home` expands a leading `~/` in the rule as the shell would.
export function widenedRuleReason(rule, { helperPaths = [], home } = {}) {
  if (typeof rule !== 'string') return null;
  const compact = rule.replace(/\s+/g, ' ').trim();
  if (compact === 'Bash' || compact === 'Bash(*)' || compact === 'Bash(:*)') return 'any-command';
  if (/^Bash\(node(?:[ :]?\*)?\)$/.test(compact)) return 'any-node-command';
  const parsed = parseHelperRule(rule);
  if (parsed) return ALLOWLISTED_OPERATIONS.includes(parsed.operation) ? null : 'not-allowlisted';
  if (compact.includes('effective-flow-state')) return 'helper-wildcard';
  if (admitsNeverAllowlisted(compact, helperPaths, home)) return 'helper-wildcard';
  return null;
}

// Whether a `Bash(...)` rule pattern matches a command line running a never-allowlisted operation
// through one of `helperPaths`, in the documented here-string form or a heredoc. `*` matches any
// text; a trailing `:*` is the legacy prefix form.
function admitsNeverAllowlisted(compact, helperPaths, home) {
  const match = /^Bash\((.*)\)$/.exec(compact);
  if (!match || !match[1].includes('*')) return false;
  let pattern = match[1].endsWith(':*') ? `${match[1].slice(0, -2)}*` : match[1];
  if (typeof home === 'string' && home !== '' && pattern.startsWith('node ~/')) {
    pattern = `node ${home}/${pattern.slice('node ~/'.length)}`;
  }
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^$|()[\]{}\\]/g, '\\$&'))
    .join('.*');
  const glob = new RegExp(`^${escaped}$`, 's');
  return helperPaths.some((helperPath) =>
    NEVER_ALLOWLISTED_OPERATIONS.some((operation) =>
      [`<<< '{}'`, `<<'EOF'`].some((input) =>
        glob.test(`node ${helperPath} ${operation} ${input}`),
      ),
    ),
  );
}

// Parses settings text. The root must be a JSON object; `permissions`, when present, an object;
// `permissions.allow`, when present, an array of strings. Returns `{ settings, allow }` with
// `allow` an empty array when absent. Any other shape is SETTINGS_INVALID.
export function parseSettings(text) {
  let settings;
  try {
    settings = JSON.parse(text);
  } catch (error) {
    throw new SettingsError('SETTINGS_INVALID', `settings are not valid JSON: ${error.message}`);
  }
  if (!isObject(settings))
    throw new SettingsError('SETTINGS_INVALID', 'settings must be a JSON object');
  if (settings.permissions === undefined) return { settings, allow: [] };
  if (!isObject(settings.permissions)) {
    throw new SettingsError('SETTINGS_INVALID', 'settings permissions must be a JSON object');
  }
  const { allow } = settings.permissions;
  if (allow === undefined) return { settings, allow: [] };
  if (!Array.isArray(allow) || allow.some((rule) => typeof rule !== 'string')) {
    throw new SettingsError(
      'SETTINGS_INVALID',
      'settings permissions.allow must be an array of strings',
    );
  }
  return { settings, allow: [...allow] };
}

// Reads the settings file without following a symlink. `fs` provides `lstat` and `open` (promise
// API). Returns `{ exists: false }` or `{ exists: true, identity, bytes, sha256, settings, allow }`.
// A non-regular target is SETTINGS_UNSAFE, a read failure SETTINGS_UNREADABLE, content above
// MAX_SETTINGS_BYTES or of the wrong shape SETTINGS_INVALID.
export async function readSettingsFile(fs, target) {
  const read = await readBoundedFile(fs, target, MAX_SETTINGS_BYTES);
  switch (read.state) {
    case 'missing':
      return { exists: false };
    case 'ok':
      break;
    case 'not-regular':
      throw new SettingsError('SETTINGS_UNSAFE', `${target}: ${read.detail}`);
    case 'oversized':
      throw new SettingsError('SETTINGS_INVALID', `${target} exceeds ${MAX_SETTINGS_BYTES} bytes`);
    default:
      throw new SettingsError(
        'SETTINGS_UNREADABLE',
        `cannot ${read.stage} ${target}: ${read.detail}`,
      );
  }
  const { settings, allow } = parseSettings(read.content.toString('utf8'));
  return {
    exists: true,
    identity: read.identity,
    bytes: read.bytes,
    sha256: read.sha256,
    settings,
    allow,
  };
}

// Whether two reads saw the same file: both absent, or the same identity, size and digest.
export function sameSettingsRead(left, right) {
  if (!left.exists || !right.exists) return left.exists === right.exists;
  return sameFileRead(left, right);
}

// The canonical helper file of an install: the realpath of `<skillRoot>/scripts/effective-flow-
// state.mjs` when it resolves to a regular file, otherwise null. `fs` provides `realpath` and `stat`.
export async function resolveInstallHelper(fs, skillRoot) {
  try {
    const resolved = await fs.realpath(path.join(skillRoot, HELPER_RELATIVE_PATH));
    return (await fs.stat(resolved)).isFile() ? resolved : null;
  } catch {
    return null;
  }
}

// Every allow rule of the exact helper shape, in file order, with its index, install root,
// operation and resolved helper (null when it no longer resolves to a regular file).
export async function helperRulesIn(fs, allow) {
  const found = [];
  for (const [index, rule] of allow.entries()) {
    const parsed = parseHelperRule(rule);
    if (!parsed) continue;
    found.push({
      index,
      rule,
      ...parsed,
      helper: await resolveInstallHelper(fs, parsed.skillRoot),
    });
  }
  return found;
}
