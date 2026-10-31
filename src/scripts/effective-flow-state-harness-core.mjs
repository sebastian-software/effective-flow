// Runtime-state helper: `harness allow-rules`, the writer of the Claude Code allow rules for the
// allowlisted helper operations into `<RUNTIME_STATE_ROOT>/.claude/settings.local.json`.
//
//   harness allow-rules  {cwd, skillRoot, mode: "preview" | "apply", digest (apply only)}
//
// It is non-destructive but never allowlisted itself. `preview` reads only and returns the change
// set with its digest; `apply` recomputes the change set, requires that digest, and writes exactly
// that change. Outcomes (exit 4), each writing nothing:
//
//   UNSUPPORTED_HARNESS   `CLAUDECODE` is not set: not running inside Claude Code
//   UNSUPPORTED_PATH      `skillRoot` is refused (`reason`, see UNSUPPORTED_PATH_REASONS); carries
//                         the `rules` for manual entry when the path itself is well-formed
//   SETTINGS_NOT_IGNORED  the settings file is not ignored by Git
//   SETTINGS_TRACKED      the settings file is tracked
//   SETTINGS_INVALID      the settings file is not a JSON object with a string-array
//                         `permissions.allow`, or exceeds MAX_SETTINGS_BYTES
//   PREVIEW_MISMATCH      the digest differs from the recomputed change set, or the file changed
//                         between the read and the rename
//
// The merge keeps every other key and rule in place, appends the missing rules of this install in
// operation order, removes only helper-shape rules of another install whose helper no longer
// resolves to a regular file, keeps those of a live other install, and warns about every widened
// rule without touching it. A missing `.claude/` is created on `apply` only.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  HARNESS_SETTINGS_FILE,
  RuntimeStateError,
  atomicWriteHarnessSettings,
  git,
  guardHarnessSettings,
} from './runtime-state-guard.mjs';
import {
  HELPER_RELATIVE_PATH,
  SKILL_ROOT_PATTERN,
  SettingsError,
  helperRules,
  helperRulesIn,
  readSettingsFile,
  sameSettingsRead,
  widenedRuleReason,
} from './claude-settings-core.mjs';
import {
  StateOutcome,
  fail,
  makeContext,
  requireClosedKeys,
  requireObject,
  requireRootSyntax,
  resolveRoot,
} from './effective-flow-state-core.mjs';
import { isObject, setOwn } from './runtime-file-primitives.mjs';

export const HARNESS_MODES = Object.freeze(['preview', 'apply']);
export const UNSUPPORTED_PATH_REASONS = Object.freeze([
  'not-absolute',
  'forbidden-character',
  'not-normalized',
  'helper-mismatch',
  'inside-runtime-root',
  'inside-repository-worktree',
  'foreign-writable',
  'unresolvable',
]);
export const WIDENED_RULE_WARNINGS = Object.freeze({
  'any-command': 'This rule auto-approves every Bash command, every helper call included.',
  'any-node-command':
    'This rule auto-approves every node command, so any script runs without a prompt.',
  'helper-wildcard':
    'This rule names the helper with a wider pattern than one operation, so it also auto-approves `lock break` and `harness allow-rules`.',
  'not-allowlisted':
    'This rule auto-approves a helper operation that is never allowlisted, because it is destructive or writes the allow rules.',
});

const HARNESS_KEYS = Object.freeze(['cwd', 'skillRoot', 'mode', 'digest']);
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const MAX_LINK_HOPS = 40;
// The helper this module ships beside; a rule may only name an install that resolves to it.
const OWN_HELPER = fileURLToPath(new URL('./effective-flow-state.mjs', import.meta.url));

function requireHarnessInput(input) {
  requireObject(input, 'input');
  requireClosedKeys(input, HARNESS_KEYS, 'input');
  if (!HARNESS_MODES.includes(input.mode)) {
    fail('INVALID_INPUT', `mode must be one of ${HARNESS_MODES.join(', ')}`);
  }
  if (typeof input.skillRoot !== 'string' || input.skillRoot === '') {
    fail('INVALID_INPUT', 'skillRoot must be a non-empty string');
  }
  if (input.mode === 'apply') {
    if (typeof input.digest !== 'string' || !DIGEST_PATTERN.test(input.digest)) {
      fail('INVALID_INPUT', `apply needs the preview digest matching ${DIGEST_PATTERN.source}`);
    }
  } else if (input.digest !== undefined) {
    fail('INVALID_INPUT', 'digest is only valid for mode apply');
  }
  return { skillRoot: input.skillRoot, mode: input.mode, digest: input.digest };
}

// ---------------------------------------------------------------------------------------------
// Install path checks

function isWithin(parent, child) {
  if (child === parent) return true;
  return child.startsWith(parent === '/' ? '/' : `${parent}/`);
}

// Every directory consulted while resolving `target`, link targets included, and the resolved
// target itself. A link's own directory is consulted to read the link, so whoever can write it can
// re-point the link: both the symlinked and the resolved chain are therefore covered. A relative
// link resolves against the link's directory; more than MAX_LINK_HOPS links is an error.
export async function resolutionChain(fs, target) {
  const consulted = new Set(['/']);
  let pending = target.split('/').filter(Boolean);
  let current = '/';
  let hops = 0;
  while (pending.length > 0) {
    const name = pending.shift();
    if (name === '.') continue;
    if (name === '..') {
      current = path.dirname(current);
      continue;
    }
    consulted.add(current);
    const next = path.join(current, name);
    const info = await fs.lstat(next);
    if (info.isSymbolicLink()) {
      hops += 1;
      if (hops > MAX_LINK_HOPS) throw new Error(`too many links resolving ${target}`);
      const link = await fs.readlink(next);
      if (path.isAbsolute(link)) current = '/';
      pending = [...link.split('/').filter(Boolean), ...pending];
      continue;
    }
    current = next;
  }
  return { directories: [...consulted], resolved: current };
}

function parseAccounts(text) {
  return text
    .split('\n')
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => line.split(':'));
}

// Whether `gid` is the private group of the user `uid`, given the parsed `/etc/passwd` and
// `/etc/group` records: the user's primary group, with no other user having it as primary group
// and no other user listed as a member.
export function isPrivateGroupIn(users, groups, gid, uid) {
  const owner = users.find((fields) => Number(fields[2]) === uid);
  if (!owner || Number(owner[3]) !== gid) return false;
  if (users.some((fields) => Number(fields[3]) === gid && Number(fields[2]) !== uid)) {
    return false;
  }
  const group = groups.find((fields) => Number(fields[2]) === gid);
  const members = (group?.[3] ?? '').split(',').filter((name) => name !== '');
  return members.every((name) => name === owner[0]);
}

// The default account lookup over `/etc/passwd` and `/etc/group`; `read` (a `readFile`-shaped
// function) is injectable. Unreadable files make every group count as shared, so a group-writable
// directory is refused (fail closed).
export function systemAccounts({ read = readFile } = {}) {
  let cache;
  const load = async () => {
    cache ??= Promise.all([
      read('/etc/passwd', 'utf8').then(parseAccounts),
      read('/etc/group', 'utf8').then(parseAccounts),
    ]).catch(() => null);
    return cache;
  };
  return {
    async isPrivateGroup(gid, uid) {
      const loaded = await load();
      return loaded ? isPrivateGroupIn(loaded[0], loaded[1], gid, uid) : false;
    },
  };
}

// Whether a principal other than the owner and root can write the node. World-writable is accepted
// only for a sticky directory owned by root (as `/tmp`); group-writable only for the owner's
// private group.
async function foreignWriter(info, accounts) {
  const mode = Number(info.mode);
  if (mode & 0o002) {
    if (info.isDirectory() && mode & 0o1000 && Number(info.uid) === 0) return null;
    return 'world-writable';
  }
  if (mode & 0o020 && !(await accounts.isPrivateGroup(Number(info.gid), Number(info.uid)))) {
    return 'group-writable';
  }
  return null;
}

async function worktreePaths(context) {
  const result = await git(context, context.cwd, ['worktree', 'list', '--porcelain', '-z']);
  return result.stdout
    .toString('utf8')
    .split('\0')
    .filter((field) => field.startsWith('worktree '))
    .map((field) => field.slice('worktree '.length));
}

async function realOrSelf(fs, value) {
  try {
    return await fs.realpath(value);
  } catch {
    return value;
  }
}

function refused(reason, details = {}) {
  return { reason, ...details };
}

// Returns `{ helperPaths }` when `skillRoot` may be named by a rule (the helper in its install form
// and its realpath), otherwise `{ refusal: { reason, path?, detail? } }`.
async function checkSkillRoot(context, skillRoot, deps) {
  const { fs } = context;
  const refuse = (reason, details) => ({ refusal: refused(reason, details) });
  if (!path.isAbsolute(skillRoot)) return refuse('not-absolute');
  if (!SKILL_ROOT_PATTERN.test(skillRoot)) return refuse('forbidden-character');
  if (skillRoot !== '/' && (skillRoot.endsWith('/') || path.normalize(skillRoot) !== skillRoot)) {
    return refuse('not-normalized');
  }
  const helperPath = path.join(skillRoot, HELPER_RELATIVE_PATH);
  let theirs;
  let own;
  try {
    own = await fs.realpath(deps.helperPath ?? OWN_HELPER);
    theirs = await fs.realpath(helperPath);
  } catch (error) {
    // Only a missing helper is a mismatch; any other failure (EACCES, ELOOP, …) leaves it unknown.
    const missing = error?.code === 'ENOENT' || error?.code === 'ENOTDIR';
    return refuse(missing ? 'helper-mismatch' : 'unresolvable', {
      path: helperPath,
      detail: error?.code ?? error?.message,
    });
  }
  if (theirs !== own) return refuse('helper-mismatch', { path: helperPath });
  let resolvedRoot;
  let chain;
  try {
    resolvedRoot = await fs.realpath(skillRoot);
    chain = await resolutionChain(fs, helperPath);
  } catch (error) {
    return refuse('unresolvable', { path: helperPath, detail: error?.code ?? error?.message });
  }
  // The chain walk must land where `realpath` did; anything else means the tree moved under us.
  if (chain.resolved !== own) return refuse('helper-mismatch', { path: chain.resolved });

  // Every path the install form, the resolved helper or any link on the way passes through: none
  // may lie in the runtime-state root or in a worktree of this repository, which the repository's
  // own content (a checkout, a merge, an agent's write) could replace.
  const candidates = [
    ...new Set([skillRoot, resolvedRoot, theirs, chain.resolved, ...chain.directories]),
  ];
  const inside = (parent) => candidates.find((candidate) => isWithin(parent, candidate));
  const inRoot = inside(context.cwd);
  if (inRoot) return refuse('inside-runtime-root', { path: inRoot });
  for (const worktree of await worktreePaths(context)) {
    for (const parent of new Set([worktree, await realOrSelf(fs, worktree)])) {
      if (inside(parent)) return refuse('inside-repository-worktree', { path: worktree });
    }
  }

  const accounts = deps.accounts ?? systemAccounts();
  for (const node of [...chain.directories, chain.resolved]) {
    let info;
    try {
      info = await fs.lstat(node);
    } catch (error) {
      return refuse('unresolvable', { path: node, detail: error?.code ?? error?.message });
    }
    const writer = await foreignWriter(info, accounts);
    if (writer) return refuse('foreign-writable', { path: node, detail: writer });
  }
  return { helperPaths: [...new Set([helperPath, theirs])] };
}

// ---------------------------------------------------------------------------------------------
// Change set

function digestOf(target, skillRoot, read, added, removed) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        schema: 1,
        target,
        skillRoot,
        before: read.exists ? read.sha256 : null,
        added,
        removed,
      }),
    )
    .digest('hex');
}

async function planChanges(fs, target, skillRoot, read, widening) {
  const allow = read.exists ? read.allow : [];
  const rules = helperRules(skillRoot);
  const found = await helperRulesIn(fs, allow);
  const others = found.filter((entry) => entry.skillRoot !== skillRoot);
  const removed = others.filter((entry) => entry.helper === null).map((entry) => entry.rule);
  const keptOtherInstalls = others
    .filter((entry) => entry.helper !== null)
    .map(({ rule, skillRoot: root }) => ({ rule, skillRoot: root }));
  const added = rules.filter((rule) => !allow.includes(rule));
  const warnings = allow
    .map((rule) => ({ rule, reason: widenedRuleReason(rule, widening) }))
    .filter((warning) => warning.reason !== null)
    .map((warning) => ({ ...warning, message: WIDENED_RULE_WARNINGS[warning.reason] }));
  return {
    target,
    settingsExists: read.exists,
    rules,
    added,
    removed,
    keptOtherInstalls,
    warnings,
    changed: added.length > 0 || removed.length > 0,
    digest: digestOf(target, skillRoot, read, added, removed),
    next: [...allow.filter((rule) => !removed.includes(rule)), ...added],
  };
}

function publicPlan({ next, ...plan }) {
  return plan;
}

const GUARD_OUTCOMES = Object.freeze(['SETTINGS_TRACKED', 'SETTINGS_NOT_IGNORED']);

// The settings guard's own refusals as the outcomes they are, on the read and the write path alike.
function guardOutcome(error, target) {
  if (error instanceof RuntimeStateError && GUARD_OUTCOMES.includes(error.code)) {
    return new StateOutcome(error.code, { target, path: HARNESS_SETTINGS_FILE });
  }
  return null;
}

async function readGuardedSettings(context, target, options) {
  try {
    await guardHarnessSettings(context, target, options);
  } catch (error) {
    const outcome = guardOutcome(error, target);
    if (outcome) return outcome;
    throw error;
  }
  try {
    return await readSettingsFile(context.fs, target);
  } catch (error) {
    if (!(error instanceof SettingsError)) throw error;
    if (error.code === 'SETTINGS_INVALID') {
      return new StateOutcome('SETTINGS_INVALID', { target, detail: error.message });
    }
    fail('UNSAFE_TARGET', error.message);
  }
}

// ---------------------------------------------------------------------------------------------
// harness allow-rules

export async function allowRules(input, deps) {
  const request = requireHarnessInput(input);
  const env = deps.env ?? process.env;
  if (typeof env.CLAUDECODE !== 'string' || env.CLAUDECODE === '') {
    return new StateOutcome('UNSUPPORTED_HARNESS', {
      reason: 'not-claude-code',
      detail: 'CLAUDECODE is not set; the allow rules are specific to Claude Code',
    });
  }
  const context = makeContext(deps);
  await requireRootSyntax(input.cwd);
  await resolveRoot(context, input.cwd);
  const target = path.join(context.cwd, HARNESS_SETTINGS_FILE);

  const checked = await checkSkillRoot(context, request.skillRoot, deps);
  if (checked.refusal) {
    const manual = ['not-absolute', 'forbidden-character', 'not-normalized'].includes(
      checked.refusal.reason,
    )
      ? []
      : helperRules(request.skillRoot);
    return new StateOutcome('UNSUPPORTED_PATH', { ...checked.refusal, target, rules: manual });
  }

  const read = await readGuardedSettings(context, target, { allowMissingDirectory: true });
  if (read instanceof StateOutcome) return read;
  const plan = await planChanges(context.fs, target, request.skillRoot, read, {
    helperPaths: checked.helperPaths,
    home: deps.home ?? homedir(),
  });
  if (request.mode === 'preview') return { mode: 'preview', ...publicPlan(plan) };

  if (request.digest !== plan.digest) {
    return new StateOutcome('PREVIEW_MISMATCH', {
      reason: 'digest-mismatch',
      expected: request.digest,
      ...publicPlan(plan),
    });
  }
  if (!plan.changed) return { mode: 'apply', applied: false, ...publicPlan(plan) };

  const settings = read.exists ? read.settings : {};
  if (!isObject(settings.permissions)) setOwn(settings, 'permissions', {});
  setOwn(settings.permissions, 'allow', plan.next);
  let written;
  try {
    // One guard run on the write path; a missing `.claude/` is created inside it.
    written = await atomicWriteHarnessSettings(context, `${JSON.stringify(settings, null, 2)}\n`, {
      createDirectory: !read.exists,
      beforeRename: async () => {
        await deps.onPhase?.('beforeRename');
        let again;
        try {
          again = await readSettingsFile(context.fs, target);
        } catch {
          again = null;
        }
        if (again && sameSettingsRead(again, read)) return null;
        return new StateOutcome('PREVIEW_MISMATCH', {
          reason: 'changed-before-write',
          ...publicPlan(plan),
        });
      },
    });
  } catch (error) {
    const outcome = guardOutcome(error, target);
    if (outcome) return outcome;
    throw error;
  }
  if (!written.written) return written.aborted;
  return { mode: 'apply', applied: true, ...publicPlan(plan) };
}
