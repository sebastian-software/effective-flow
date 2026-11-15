// Claude Code settings: the parser of `<RUNTIME_STATE_ROOT>/.claude/settings.local.json` and the
// matcher of the helper allow-rule shapes. It is shared by the runtime-state helper, which writes
// the rules (`harness allow-rules`), and by the read-only `setup-status` probe, which reports them;
// neither of those imports the other. This module reads only and imports no script but the
// dependency-free `runtime-file-primitives.mjs`.
//
// One rule shape per allowlisted operation of four JSON helpers (see RULE_ENTRIES):
//
//   Bash(node <skillRoot>/scripts/effective-flow-state.mjs <group> <operation> *)
//   Bash(node <skillRoot>/scripts/config-resolve.mjs <operation> *)
//   Bash(node <skillRoot>/scripts/remote-tracker.mjs <operation> *)
//   Bash(node <skillRoot>/scripts/conflict-validation.mjs <operation> *)
//
// `<skillRoot>` is the loaded skill's directory in its symlinked install form. The trailing `*`
// admits the here-string; each helper itself rejects any argv beyond its operation tokens, and
// `remote-tracker.mjs` also rejects `--apply` on an operation that is not a mutation, which is what
// makes the `*` safe. The `remote-tracker` list is closed and classified here rather than derived
// from its core, so this module stays free of the tracker's import graph; a unit test pins every
// listed operation against the core's mutation and local-write classification, and requires every
// operation of the core to be either listed or excluded.

import path from 'node:path';
import { isObject, readBoundedFile, sameFileRead } from './runtime-file-primitives.mjs';

export const HELPER_RELATIVE_PATH = 'scripts/effective-flow-state.mjs';
export const CONFIG_RESOLVE_RELATIVE_PATH = 'scripts/config-resolve.mjs';
export const REMOTE_TRACKER_RELATIVE_PATH = 'scripts/remote-tracker.mjs';
export const CONFLICT_VALIDATION_RELATIVE_PATH = 'scripts/conflict-validation.mjs';
export const SETTINGS_RELATIVE_PATH = '.claude/settings.local.json';

// The four helpers an allow rule may name, by script name.
export const RULE_SCRIPTS = Object.freeze({
  'effective-flow-state': HELPER_RELATIVE_PATH,
  'config-resolve': CONFIG_RESOLVE_RELATIVE_PATH,
  'remote-tracker': REMOTE_TRACKER_RELATIVE_PATH,
  'conflict-validation': CONFLICT_VALIDATION_RELATIVE_PATH,
});
export const RULE_SCRIPT_NAMES = Object.freeze(Object.keys(RULE_SCRIPTS));

// The non-destructive runtime-state helper operations that get one allow rule each. `lock break`
// and `harness allow-rules` never get a rule; the helper's operation classification pins that.
// `commit create` writes Git history and runs the repository's hooks; its own guards bound what an
// unprompted call can commit (see `effective-flow-state-commit-core.mjs`).
export const ALLOWLISTED_OPERATIONS = Object.freeze([
  'lock acquire',
  'lock release',
  'lock inspect',
  'memory reserve',
  'memory set-marker',
  'memory migrate-directory',
  'commit create',
  'review open-report',
  // `review write-report` writes model-supplied report text without a prompt. Its report bound: it
  // writes the report only below `.effective-flow/review/` (through a `.write-report-*.tmp`
  // sibling, both through the runtime-state guard), under a generated name the caller cannot
  // choose, never over an existing file, from at most 64 KiB of input, and it consumes finding IDs
  // only through one successful reservation per call. Separately, and only without the
  // `runtimeMigration.directory` marker, it first runs the legacy-directory migration of
  // `memory migrate-directory`, whose own bound applies: a no-clobber copy into `.effective-flow/`,
  // the memory merge, the marker, and adopting and removing a root `.sf-memory.json` through its
  // own guard class.
  'review write-report',
  // The worktree-lifecycle housekeeping: `record-init` writes one new `active` record no-clobber,
  // `transition` rewrites one record's status under its lock, and `inspect` and `cleanup plan` only
  // read. With `release: "partial-diff"`, `transition` also restores, in that record's own proven
  // worktree, exactly the proven residual paths to their HEAD state: paths whose bytes and mode it
  // proved equal to the record's ledger descriptors (re-checked immediately before each discard)
  // and whose selected source content it proved still present through `verifySourceManifest`;
  // otherwise it, too, only rewrites the one record. With `adoption: "partial-diff-resume"`, it
  // also appends at most one commit to that record's ledger first: the branch tip, proven the next
  // group's exact commit (parent, paths, blobs and modes) with the ledger's immutable part
  // unchanged. None of them removes a worktree, a branch, a record or a legacy path.
  'worktree record-init',
  'worktree transition',
  'worktree inspect',
  // `resume-check` only reads: it takes no lock, writes nothing, and runs Git with
  // `GIT_OPTIONAL_LOCKS=0`.
  'worktree resume-check',
  'cleanup plan',
  // The delivery-progress ledger housekeeping. `ledger init` writes one private ledger file below
  // `.effective-flow/worktree-runs/ledgers/`, no-clobber and under the record lock, only for the
  // calling session's own `active` `partial-diff` record, from descriptors the helper computes
  // itself, and only when its worst case (every group committed) fits LEDGER_MAX_BYTES (256 KiB).
  // `ledger append` adds one commit entry to that ledger, only for the branch tip it proved the
  // next group's exact commit (parent, paths, blobs and modes). Neither touches a worktree, a
  // branch or a record. `ledger reconcile` only reads, like `worktree resume-check`.
  'ledger init',
  'ledger append',
  'ledger reconcile',
  // The run-presence markers: `presence register` creates the calling session's own marker (at most
  // MAX_MARKER_BYTES) no-clobber below `.effective-flow/merge-gate-presence/`, `refresh` and
  // `release` rewrite or remove only that marker and only with its `token`, and `list` only reads.
  // None of them changes or removes another run's marker (see
  // `effective-flow-state-presence-core.mjs`).
  'presence register',
  'presence refresh',
  'presence list',
  'presence release',
]);
// The runtime-state helper operations that never get a rule: destructive (`lock break`, the
// worktree and branch removal of `worktree remove`, the confirmed removals of `cleanup apply`, the
// removal of other runs' presence markers by `presence prune`) or the writer of the rules itself.
// A rule that would also admit one of them is widened.
export const NEVER_ALLOWLISTED_OPERATIONS = Object.freeze([
  'lock break',
  'harness allow-rules',
  'worktree remove',
  'cleanup apply',
  'presence prune',
]);

// Every `config-resolve.mjs` operation reads only: `resolve`, and `no-ci-policy` and
// `conflict-validation`, which also read one Git blob of the base branch's remote-tracking ref.
export const CONFIG_RESOLVE_ALLOWLISTED_OPERATIONS = Object.freeze([
  'resolve',
  'no-ci-policy',
  'conflict-validation',
]);

// Every `conflict-validation.mjs` operation reads only: `ci-detect` and `ci-integrity` read Git
// objects of the base branch's remote-tracking ref (and of the given tree) without fetching,
// `ci-evidence-match` is a pure computation over its input, and `quick-marker-scan` reads the
// commit messages between that ref's merge base and a given head.
export const CONFLICT_VALIDATION_ALLOWLISTED_OPERATIONS = Object.freeze([
  'ci-detect',
  'ci-integrity',
  'ci-evidence-match',
  'quick-marker-scan',
]);

// The `remote-tracker.mjs` operations that get one allow rule each: the forge reads, the pure local
// computations, and `thread-ledger-lookup`, a local read of runtime state. Never a mutation, never
// a local write.
export const REMOTE_TRACKER_READ_OPERATIONS = Object.freeze([
  'repository-resolve',
  'probe',
  'viewer-read',
  'collaborator-permission-read',
  'repository-visibility-read',
  'issue-read',
  'issue-state-wait',
  'issue-comments-read',
  'issue-list',
  'issue-sub-issues-read',
  'pr-read',
  'pr-comments-read',
  'pr-reviews-read',
  'pr-list',
  'pr-status-read',
  'pr-checks-wait',
  'review-threads-read',
  'remote-parse',
  'reference-parse',
  'signature-parse',
  'finding-build',
  'follow-up-admission-build',
  'follow-up-admission-parse',
  'follow-up-admission-supersede',
  'epic-build',
  'planning-comment-build',
  'decomposition-records-build',
  'decomposition-records-parse',
  'decomposition-key-build',
  'decomposition-key-parse',
  'decomposition-container-compare',
  'decomposition-child-workflow-parse',
  'apply-comment-build',
  'pr-comment-build',
  'pr-review-comment-build',
  'finding-deduplicate',
  'label-query-variants',
  'sf-label-migration-plan',
  'marker-patch',
  'checklist-patch',
  'body-hash',
  'issue-lifecycle-receipt-build',
  'issue-lifecycle-receipt-parse',
  'thread-ledger-lookup',
]);
// The `remote-tracker.mjs` operations that never get a rule: every forge mutation, and the local
// write `thread-ledger-record`. A rule that would also admit one of them, `--apply` included, is
// widened.
export const REMOTE_TRACKER_EXCLUDED_OPERATIONS = Object.freeze([
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
  'pr-update-title',
  'pr-mark-ready',
  'pr-comment',
  'pr-merge',
  'review-create',
  'review-thread-reply',
  'review-thread-resolve',
  'thread-ledger-record',
]);
const REMOTE_TRACKER_LOCAL_WRITES = Object.freeze(['thread-ledger-record']);

// The allowlisted operations per helper.
export const ALLOWLISTED_BY_SCRIPT = Object.freeze({
  'effective-flow-state': ALLOWLISTED_OPERATIONS,
  'config-resolve': CONFIG_RESOLVE_ALLOWLISTED_OPERATIONS,
  'remote-tracker': REMOTE_TRACKER_READ_OPERATIONS,
  'conflict-validation': CONFLICT_VALIDATION_ALLOWLISTED_OPERATIONS,
});

// Every rule `harness allow-rules` writes, in write order: `{ script, operation }`.
export const RULE_ENTRIES = Object.freeze(
  RULE_SCRIPT_NAMES.flatMap((script) =>
    ALLOWLISTED_BY_SCRIPT[script].map((operation) => Object.freeze({ script, operation })),
  ),
);

// The command lines a rule must never admit, per helper, without their `node <path> ` prefix: the
// documented here-string and a heredoc for every never-allowlisted state operation and for the
// local write, and the applied form of every mutation.
const NEVER_ADMITTED_CALLS = Object.freeze({
  'effective-flow-state': NEVER_ALLOWLISTED_OPERATIONS.flatMap((operation) => [
    `${operation} <<< '{}'`,
    `${operation} <<'EOF'`,
  ]),
  'config-resolve': [],
  'remote-tracker': REMOTE_TRACKER_EXCLUDED_OPERATIONS.flatMap((operation) =>
    REMOTE_TRACKER_LOCAL_WRITES.includes(operation)
      ? [`${operation} <<< '{}'`, `${operation} <<'EOF'`]
      : [`${operation} --apply <<< '{}'`, `${operation} --apply <<'EOF'`],
  ),
  'conflict-validation': [],
});

export const MAX_SETTINGS_BYTES = 1024 * 1024;

// The only characters a `skillRoot` may contain. Every other character, a shell or glob
// metacharacter, whitespace, a quote, `~`, a control or non-ASCII character, could change the
// meaning of the rule or of the command line it matches, so the set is an allowlist.
export const SKILL_ROOT_PATTERN = /^[A-Za-z0-9._@+/-]+$/;

const OPERATION_TOKEN = '[a-z][a-z-]*';
const ROOT_GROUP = '(/[A-Za-z0-9._@+/-]*)';
const RULE_PATTERNS = Object.freeze({
  'effective-flow-state': new RegExp(
    `^Bash\\(node ${ROOT_GROUP}/scripts/effective-flow-state\\.mjs (${OPERATION_TOKEN}) (${OPERATION_TOKEN}) \\*\\)$`,
  ),
  'config-resolve': new RegExp(
    `^Bash\\(node ${ROOT_GROUP}/scripts/config-resolve\\.mjs (${OPERATION_TOKEN}) \\*\\)$`,
  ),
  'remote-tracker': new RegExp(
    `^Bash\\(node ${ROOT_GROUP}/scripts/remote-tracker\\.mjs (${OPERATION_TOKEN}) \\*\\)$`,
  ),
  'conflict-validation': new RegExp(
    `^Bash\\(node ${ROOT_GROUP}/scripts/conflict-validation\\.mjs (${OPERATION_TOKEN}) \\*\\)$`,
  ),
});
// A rule naming one of the helper files in any other form than its exact shape is widened.
const HELPER_FILE_NAMES = Object.freeze(
  RULE_SCRIPT_NAMES.map((script) => path.posix.basename(RULE_SCRIPTS[script])),
);

export class SettingsError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SettingsError';
    this.code = code;
  }
}

// One allow rule; `script` defaults to the runtime-state helper.
export function helperRule(skillRoot, operation, script = 'effective-flow-state') {
  return `Bash(node ${skillRoot}/${RULE_SCRIPTS[script]} ${operation} *)`;
}

// Every rule of an install, in RULE_ENTRIES order.
export function helperRules(skillRoot) {
  return RULE_ENTRIES.map(({ script, operation }) => helperRule(skillRoot, operation, script));
}

// Parses a rule of exactly one helper shape: `{ skillRoot, script, operation }`, or null for any
// other rule. The operation may be one that is not allowlisted; the caller decides what that means.
export function parseHelperRule(rule) {
  if (typeof rule !== 'string') return null;
  for (const script of RULE_SCRIPT_NAMES) {
    const match = RULE_PATTERNS[script].exec(rule);
    if (!match) continue;
    const skillRoot = match[1];
    if (!SKILL_ROOT_PATTERN.test(skillRoot)) return null;
    if (
      skillRoot !== '/' &&
      (skillRoot.endsWith('/') || path.posix.normalize(skillRoot) !== skillRoot)
    ) {
      return null;
    }
    const operation = match[3] === undefined ? match[2] : `${match[2]} ${match[3]}`;
    return { skillRoot, script, operation };
  }
  return null;
}

// Why an allow rule is wider than the helper shapes and admits a helper call it should not, or
// null. The widened rules are warned about and never removed: the user may have chosen them.
//   any-command        `Bash` or `Bash(*)`
//   any-node-command   `Bash(node *)`, `Bash(node:*)` or another bare `node` prefix
//   helper-wildcard    a rule naming one of the four helper files that is not of its exact shape,
//                      or any pattern that matches a never-admitted call (NEVER_ADMITTED_CALLS) of
//                      a helper beside one of `helperPaths`, such as
//                      `Bash(node <skillRoot>/scripts/*)` or `Bash(node ~/.claude/skills/*)`
//   not-allowlisted    an exact helper-shape rule for an operation that is never allowlisted
//
// `options.helperPaths` lists the runtime-state helper file paths a command line may name (the
// install form and its realpath); the other two helpers are probed beside each of them.
// `options.home` expands a leading `~/` in the rule as the shell would.
export function widenedRuleReason(rule, { helperPaths = [], home } = {}) {
  if (typeof rule !== 'string') return null;
  const compact = rule.replace(/\s+/g, ' ').trim();
  if (compact === 'Bash' || compact === 'Bash(*)' || compact === 'Bash(:*)') return 'any-command';
  if (/^Bash\(node(?:[ :]?\*)?\)$/.test(compact)) return 'any-node-command';
  const parsed = parseHelperRule(rule);
  if (parsed) {
    return ALLOWLISTED_BY_SCRIPT[parsed.script].includes(parsed.operation)
      ? null
      : 'not-allowlisted';
  }
  if (compact.includes('effective-flow-state')) return 'helper-wildcard';
  if (HELPER_FILE_NAMES.some((name) => compact.includes(name))) return 'helper-wildcard';
  if (admitsNeverAdmitted(compact, helperPaths, home)) return 'helper-wildcard';
  return null;
}

// Whether a `Bash(...)` rule pattern matches a never-admitted command line of a helper beside one
// of `helperPaths`. `*` matches any text; a trailing `:*` is the legacy prefix form.
function admitsNeverAdmitted(compact, helperPaths, home) {
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
    RULE_SCRIPT_NAMES.some((script) => {
      const scriptPath = path.posix.join(
        path.posix.dirname(helperPath),
        path.posix.basename(RULE_SCRIPTS[script]),
      );
      return NEVER_ADMITTED_CALLS[script].some((call) => glob.test(`node ${scriptPath} ${call}`));
    }),
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

// The canonical file of one helper of an install: the realpath of `<skillRoot>/<RULE_SCRIPTS
// path>` when it resolves to a regular file, otherwise null. `fs` provides `realpath` and `stat`.
export async function resolveInstallHelper(fs, skillRoot, script = 'effective-flow-state') {
  try {
    const resolved = await fs.realpath(path.join(skillRoot, RULE_SCRIPTS[script]));
    return (await fs.stat(resolved)).isFile() ? resolved : null;
  } catch {
    return null;
  }
}

// Every allow rule of an exact helper shape, in file order, with its index, install root, script,
// operation and resolved helper file (null when it no longer resolves to a regular file).
export async function helperRulesIn(fs, allow) {
  const found = [];
  for (const [index, rule] of allow.entries()) {
    const parsed = parseHelperRule(rule);
    if (!parsed) continue;
    found.push({
      index,
      rule,
      ...parsed,
      helper: await resolveInstallHelper(fs, parsed.skillRoot, parsed.script),
    });
  }
  return found;
}
