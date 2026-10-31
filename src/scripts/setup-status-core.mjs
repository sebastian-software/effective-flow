// Read-only setup status: the deterministic part of `setup status`. One `status` call diagnoses the
// Effective Flow configuration of a checkout, the ignore state of `.effective-flow/`, the central
// domain-owner skills the configuration disables, and the installed version against the latest
// published release. It writes nothing, asks nothing and repairs nothing; every finding only names
// the setup invocation form, or the manual step, that would fix it. `setup` stays the only writer.
//
// Input (one JSON object): `{ "cwd": "<absolute directory>", "skillRoot"?: "<absolute directory>" }`.
// `skillRoot` is the loaded skill's directory in its symlinked install form; without it the
// allow-rule probe is `not-applicable`.
//
// Envelope: `{ ok: true, operation: "status", data }`, or
// `{ ok: false, operation, error: { code, message, details, retryable: false } }` only for invalid
// input (`INVALID_INPUT`) or an internal failure (`INTERNAL_ERROR`). A resolver failure is no
// envelope failure: it is reported in `data.configuration` and every other section still renders.
//
// `data`:
//   cwd                  the canonical directory the status ran for
//   setupFixable         true iff any finding below carries `setupFixable: true`
//   setupForms[]         the distinct `setupForm` values of those findings, in `SETUP_FORMS` order
//                        (`setup`, `setup guided`, `setup hidden`, `targeted`, `allowlist`); one
//                        entry names the single form that fixes everything setup can fix
//   Every finding that carries `setupFixable` also carries `setupForm`: the setup invocation form
//   its remediation names when setup-fixable, otherwise null (always null for domain owners and
//   the version).
//   configuration
//     state              configured | not-set-up | error
//     runtimeStateRoot   verified main checkout (null outside Git or on error)
//     checkoutRoot       checkout root of `cwd` (null on error)
//     visibility         standard | hidden (null on error)
//     chatLanguage       the resolved `language.chat` (`de` | `en`), or null when unset, invalid,
//                        unsupported, or on error
//     projectLanguage    the resolved `language.project` (`de` | `en`) from the same call, or null
//                        under the same conditions; the chat-language fallback after the
//                        conversation language
//     source             { step, path, language, visibility } of the winning locator step, or null
//                        (`step` 0–3 configured, 4 not set up)
//     diagnostics[]      every resolver diagnostic with its original fields plus
//                        `remediation` (text), `setupFixable` (bool) and `setupForm`; an
//                        invalid-source diagnostic (`ambiguous-key`, `invalid-value` with
//                        `reason: cell-count`, `unrepresentable-row`, `duplicate-envelope`) is a
//                        manual step, and a value-domain `invalid-value` names `targeted`, or the
//                        form that accepts a key Targeted refuses (`REMEDIATIONS.invalidValue`)
//     error              null, or { code, message, detail, details, remediation, setupFixable,
//                        setupForm } for RUNTIME_ROOT_UNVERIFIED (detail = details.check),
//                        RUNTIME_STATE_UNSAFE (detail = details.reason), GIT_FAILED, INVALID_INPUT,
//                        INTERNAL_ERROR
//     remediation        text for the not-set-up state, otherwise null
//     setupForm          the form of that remediation (`setup`), otherwise null
//     setupFixable       true iff this section holds a setup-fixable finding
//   retired[]            one entry per retired configuration row:
//     key, successor, successorPresent, state? ('invalid'), conditional? ('reviewer-resolved'),
//     login?, normalizedLogin?
//     stop[]             exposed tools that would stop on this row
//     report[]           exposed tools that would only report it (never also in `stop`)
//     toolMapping        exposed (mapped through the projection) | resolver-names (projection
//                        unavailable, so `stop`/`report` carry the resolver's own tool names)
//     unmappedTools[]    resolver tools no exposed tool reaches in the evaluated mode; each keeps
//                        its own name in `stop`/`report` (empty for `resolver-names`)
//     evaluations[]      { tool, mode, action } per SUCCESSOR_SETS entry, or { tool, mode, error }
//     remediation, setupFixable, setupForm
//                        variant per row: ordinary migration (`setup`), an invalid row (a manual
//                        repair naming its `ambiguous-key`/`invalid-value` diagnostic, not
//                        setup-fixable: setup treats it as an invalid source) or a login-keyed
//                        reviewer-resolved row (`setup`, kept by setup while the login matches no
//                        configured reviewer)
//   ignore
//     state              ok | problem | not-applicable | could-not-check
//     visibility         standard | hidden | null
//     reason             null, or the problem/could-not-check reason (see `REMEDIATIONS.ignore`);
//                        standard: not-ignored | negated-entry | other-negated-entry |
//                        tracked-runtime-content (only when the predicate holds); hidden:
//                        tracked-runtime-content | exclude-unsafe | exclude-entry-missing |
//                        outranked-by-gitignore; could-not-check: configuration-unresolved |
//                        git-failed; not-applicable: not-a-git-repository
//     detail             null, or diagnostic text (a `check-ignore -v` line, the negation lines as
//                        `file:line:text` joined by `; `, a git error)
//     paths[]            tracked paths below `.effective-flow/`
//     remediation, setupFixable, setupForm   for `reason`
//     notes[]            { code, path, paths, detail, remediation, setupFixable, setupForm }:
//                        standard `tracked-runtime-content` (paths) and `other-negated-entry` (path
//                        of `.gitignore`, detail as above) beside a `not-ignored` reason; hidden
//                        `gitignore-leftover` (path)
//   domainOwners
//     state              ok | could-not-check
//     reason             null, or why the projection could not be read
//     configurationApplied  false when the configuration could not be resolved (no skills scopes)
//     owners[]           one per delegate owner skill:
//       skill
//       tools[]          every exposed tool that consumes the owner (for the session skill overlay)
//       consumers[]      { consumer, consumerKind } of the owner's delegate rows
//       disabled[]       { tool, causes[] (scope keys), consequence } per tool the configuration
//                        disables the owner for; consequence is "`<tool>` runs its minimal fallback"
//       remediation      text when `disabled` is non-empty (the `skills.enabled` text, the exclude
//                        text, or both joined), otherwise null
//       setupFixable     false: a disabling scope is a deliberate configuration choice
//       setupForm        null
//       missingRemediation  manual install step for an owner missing from the session's skill list
//   version
//     state              current | outdated | ahead | could-not-check
//     installed          installed SemVer from the projection, or null
//     latest             validated latest published SemVer, or null (never the raw tag_name)
//     reason             null, or why the comparison could not be made
//     request            { method: "GET", url } of the lookup made, or null when none was made
//     remediation        text for `outdated`, otherwise null
//     setupFixable       false
//     setupForm          null
//   allowlist            the Claude Code allow rules of the runtime-state helper, read from
//                        `<runtimeStateRoot>/.claude/settings.local.json`:
//     state              absent | current | stale | not-applicable | could-not-check
//     reason             null, or not-applicable: no-skill-root | not-claude-code (`CLAUDECODE`
//                        unset); could-not-check: runtime-root-unresolved | helper-unresolved |
//                        settings-invalid | settings-unreadable
//     detail             only for settings-invalid and settings-unreadable: the parser message
//     skillRoot, target  the probed install root and settings file, or null
//     expected[]         the six rules of this install
//     present[]          the rules naming this install's `skillRoot` literally whose helper
//                        resolves to this install's helper
//     missing[]          the expected rules of the operations no present rule covers
//     aliases[]          helper-shape rules naming another path to this install's helper: Claude
//                        Code matches the literal command path, so they never fire for this
//                        install and count as neither present nor stale
//     stale[]            helper-shape rules whose helper no longer resolves to a regular file
//     remediation, setupFixable, setupForm   `allowlist` for absent and stale, otherwise null
//
// The remediation texts are frozen data in this module (`REMEDIATIONS`): they name a setup
// invocation form or a manual step, never an inline fix. The configuration comes from one
// `resolveConfiguration` call with `tool: "setup"` and no visibility override; the retired rows are
// classified by one further call per `SUCCESSOR_SETS` entry, because `setup` is exempt and would
// only see `none`, and the resolver's classifier stays its own.

import nodeFs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  CONFIG_RESOLVE_ERROR_CODES,
  DIAGNOSTIC_CODES,
  HIDDEN_FORCED_VALUES,
  ROOT_CHECKS,
  SUCCESSOR_SETS,
  UNSAFE_REASONS,
  createProcessRunner,
  gitBaseEnv,
  resolveConfiguration,
} from './config-resolve-core.mjs';
import {
  ALLOWLISTED_OPERATIONS,
  SETTINGS_RELATIVE_PATH,
  SettingsError,
  helperRule,
  helperRulesIn,
  readSettingsFile,
  resolveInstallHelper,
} from './claude-settings-core.mjs';

export const SETUP_STATUS_OPERATIONS = Object.freeze(['status']);
export const SETUP_STATUS_ERROR_CODES = Object.freeze(['INVALID_INPUT', 'INTERNAL_ERROR']);
const EXIT_CODES = Object.freeze({ INVALID_INPUT: 2, INTERNAL_ERROR: 1 });
export const MAX_STDIN_BYTES = 64 * 1024;

// The build-generated ownership projection, shipped next to this script in every target.
export const OWNERS_PROJECTION_FILE = 'setup-status-owners.json';
export const OWNERS_PROJECTION_SCHEMA_VERSION = 1;

// The release lookup: one anonymous GET to the public releases endpoint of the published
// repository. Host, owner and repository live here only.
export const RELEASE_REPOSITORY = Object.freeze({
  host: 'api.github.com',
  owner: 'sebastian-software',
  repo: 'effective-flow',
});
export const RELEASE_LATEST_URL = `https://${RELEASE_REPOSITORY.host}/repos/${RELEASE_REPOSITORY.owner}/${RELEASE_REPOSITORY.repo}/releases/latest`;
export const RELEASE_REQUEST_HEADERS = Object.freeze({
  'User-Agent': 'effective-flow-setup-status',
  Accept: 'application/vnd.github+json',
});
export const RELEASE_TIMEOUT_MS = 4000;
export const MAX_RELEASE_BODY_BYTES = 64 * 1024;
const RELEASE_TAG_PREFIX = 'effective-flow-v';
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const INSTALLED_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:[-+][0-9A-Za-z.-]+)?$/;

const STATE_DIR = '.effective-flow';
// The one key a Targeted request redirects to Guided setup, Advanced, Block 10.
const FAST_PROFILE_KEY = 'executionProfiles.fast.enabled';
const IGNORE_ENTRY = '.effective-flow/';
const STANDARD_PROBE = '.effective-flow/config.json';
const HIDDEN_PROBES = Object.freeze([
  '.effective-flow/config.json',
  '.effective-flow/project-setup.md',
]);
const GITIGNORE_LEFTOVER = /^\/?\.effective-flow(?:\/(?:\*)?)?$/;
// A `.gitignore` negation line below `.effective-flow/`; setup migrates only the config.json one.
const GITIGNORE_NEGATION = /^!\s*\/?\.effective-flow(?:\/|$)/;
const GITIGNORE_CONFIG_NEGATION = /^!\s*\/?\.effective-flow\/config\.json$/;

// ---------------------------------------------------------------------------------------------
// Remediation map (frozen data)

// `setupForm` names the setup invocation form that fixes a setup-fixable finding (one of
// `SETUP_FORMS`), and is null for a finding setup cannot fix.
export const SETUP_FORMS = Object.freeze([
  'setup',
  'setup guided',
  'setup hidden',
  'targeted',
  'allowlist',
]);

function entry(remediation, setupFixable, setupForm = null) {
  return Object.freeze({ remediation, setupFixable, setupForm: setupFixable ? setupForm : null });
}

const MANUAL_GIT_HEALTH =
  'Manual step: repair the repository so that `git worktree list --porcelain` names the main checkout (for a moved checkout run `git worktree repair` from it), then run `effective-flow setup status` again.';
// Setup Step 2 item 5 and the Targeted precondition treat these as an invalid source: setup only
// offers to recreate the configuration from scratch (backup and overwrite) or to abort, and a
// Targeted request stops without a write. Recreating discards every recorded value, so the fix is
// the manual repair, and these findings are not setup-fixable.
const INVALID_SOURCE_NOTE =
  'until then `effective-flow setup` treats the table as an invalid source (it only offers to recreate the configuration from scratch, backing up the old one) and a Targeted request stops without a change.';
const MANUAL_LOCAL_FILE =
  'Manual step: fix `.effective-flow/project-setup.md` in the main checkout so that it holds one configuration table with exactly one `| visibility | hidden |` row (or remove the file), then run `effective-flow setup hidden`.';

// `{key}`, `{successor}`, `{path}`, `{skill}`, `{login}` and `{diagnostic}` are replaced with the
// finding's own values.
export const REMEDIATIONS = Object.freeze({
  notSetUp: entry(
    'Run `effective-flow setup` (or `effective-flow setup express` to adopt the safe defaults) to create the project setup configuration.',
    true,
    'setup',
  ),
  diagnostics: Object.freeze({
    'local-file-not-hidden': entry(
      'Run `effective-flow setup hidden` to turn `{path}` into the hidden local configuration, or remove the file by hand if it is a leftover; while it does not declare `visibility | hidden` it is never read.',
      true,
      'setup hidden',
    ),
    'ignored-linked-root-file': entry(
      'Manual step: remove or move `{path}`; configuration below a linked checkout is never read, only the main checkout holds runtime-state configuration.',
      false,
    ),
    'shadowed-tracked-config': entry(
      'Nothing to fix while hidden mode is intended; to use the tracked configuration `{path}` again, run `effective-flow setup` and answer Standard on the Visibility question.',
      false,
    ),
    'tracked-hidden-ignored': entry(
      'Run `effective-flow setup hidden` to move to hidden mode with a local configuration, or remove the ignored `| visibility | hidden |` row from `{path}` by hand (a Targeted request refuses the `visibility` key).',
      true,
      'setup hidden',
    ),
    'forced-value-override': entry(
      'Run `effective-flow setup hidden` to rewrite the local configuration without the `{key}` row that contradicts the hidden-mode value.',
      true,
      'setup hidden',
    ),
    'dead-marker': entry(
      'Run `effective-flow setup` to point the project setup marker at an existing project setup ADR again.',
      true,
      'setup',
    ),
    'legacy-marker': entry(
      'Run `effective-flow setup` to replace the legacy setup marker with the current `**Effective Flow project setup:**` marker.',
      true,
      'setup',
    ),
    'marker-divergence': entry(
      'Run `effective-flow setup` to align the setup markers in `AGENTS.md` and `CLAUDE.md` on one project setup ADR.',
      true,
      'setup',
    ),
    'legacy-slug': entry(
      'Run `effective-flow setup` to move the configuration from the legacy ADR name `{path}` to the current `effective-flow-project-setup` ADR.',
      true,
      'setup',
    ),
    'several-match': entry(
      'Manual step: keep exactly one project setup ADR in the ADR directory (remove or rename the others), then run `effective-flow setup`; setup stops while several match.',
      false,
    ),
    'candidate-outside-root': entry(
      'Manual step: replace `{path}` with a regular file inside the checkout; a project setup ADR that resolves outside the checkout is never read.',
      false,
    ),
    'transitional-fallback': entry(
      'Run `effective-flow setup` to migrate the transitional JSON configuration `{path}` into the project setup ADR.',
      true,
      'setup',
    ),
    'invalid-source': entry(
      'Manual step: fix or remove the unreadable configuration file `{path}`, then run `effective-flow setup`.',
      false,
    ),
    'duplicate-envelope': entry(
      `Manual step: merge the configuration tables of \`{path}\` into one \`## Configuration\` table by hand, then run \`effective-flow setup status\` again; only the first one is read, and ${INVALID_SOURCE_NOTE}`,
      false,
    ),
    'adr-superseded': entry(
      'Manual step: set the status of `{path}` back to Active, or point the setup marker at the ADR that superseded it, then run `effective-flow setup`.',
      false,
    ),
    'legacy-empty-token': entry(
      'Run `effective-flow setup` to rewrite the legacy `(leer)` value of `{key}` as `(empty)`.',
      true,
      'setup',
    ),
    'ambiguous-key': entry(
      `Manual step: remove the duplicate \`{key}\` rows from \`{path}\` by hand so that exactly one remains, then run \`effective-flow setup status\` again; no row of \`{key}\` is used, and ${INVALID_SOURCE_NOTE}`,
      false,
    ),
    // A value-domain `invalid-value` on a key a Targeted request accepts; `invalidValue` below holds
    // the variants for a structural one and for the keys Targeted refuses.
    'invalid-value': entry(
      'Run `effective-flow setup set {key} to a valid value` (a Targeted request); until then the run uses the safe default for `{key}`.',
      true,
      'targeted',
    ),
    'unrepresentable-row': entry(
      `Manual step: remove the configuration row with the empty key from \`{path}\` by hand, then run \`effective-flow setup status\` again; it can never become a value, and ${INVALID_SOURCE_NOTE}`,
      false,
    ),
    'unknown-tool': entry('Nothing to fix: the calling tool resolves no successor set.', false),
  }),
  // The `invalid-value` variants other than the value-domain default above, chosen by the
  // diagnostic's `reason` and key (see `invalidValueRemediation`).
  invalidValue: Object.freeze({
    'cell-count': entry(
      `Manual step: fix the \`{key}\` row in \`{path}\` by hand so that it holds exactly one key cell and one value cell, then run \`effective-flow setup status\` again; no row of \`{key}\` is used, and ${INVALID_SOURCE_NOTE}`,
      false,
    ),
    visibility: entry(
      'Manual step: remove the `visibility` row with the invalid value from `{path}` by hand; a tracked configuration needs no `visibility` row (standard is the default), and a Targeted request refuses the key. To move to hidden mode instead, run `effective-flow setup hidden`.',
      false,
    ),
    fastProfile: entry(
      'Run `effective-flow setup guided` and set `{key}` under Advanced, Block 10 (a Targeted request refuses this key); until then Fast stays disabled.',
      true,
      'setup guided',
    ),
    hiddenForced: entry(
      'Run `effective-flow setup hidden` to rewrite the local configuration without the invalid `{key}` row; hidden mode forces `{key}`, and a Targeted request refuses it.',
      true,
      'setup hidden',
    ),
  }),
  errors: Object.freeze({
    INVALID_INPUT: entry(
      'Manual step: run `effective-flow setup status` again from an existing checkout directory.',
      false,
    ),
    RUNTIME_ROOT_UNVERIFIED: entry(MANUAL_GIT_HEALTH, false),
    RUNTIME_STATE_UNSAFE: entry(MANUAL_LOCAL_FILE, false),
    GIT_FAILED: entry(
      'Manual step: make Git usable in this checkout (`git rev-parse --show-toplevel` must succeed), then run `effective-flow setup status` again.',
      false,
    ),
    INTERNAL_ERROR: entry(
      'Manual step: run `effective-flow setup status` again; if the failure persists, report it with the message above.',
      false,
    ),
  }),
  rootChecks: Object.freeze({
    'porcelain-failed': entry(
      'Manual step: make `git worktree list --porcelain` succeed in this repository (check the Git installation and the repository health), then run `effective-flow setup status` again.',
      false,
    ),
    'missing-path': entry(MANUAL_GIT_HEALTH, false),
    bare: entry(
      'Manual step: run Effective Flow from a repository whose main worktree is not bare; a bare main record has no checkout to hold runtime state.',
      false,
    ),
    moved: entry(
      'Manual step: the main checkout was moved or deleted; restore it or run `git worktree repair` from its new location, then run `effective-flow setup status` again.',
      false,
    ),
    'toplevel-mismatch': entry(MANUAL_GIT_HEALTH, false),
    'common-dir-mismatch': entry(MANUAL_GIT_HEALTH, false),
  }),
  unsafeReasons: Object.freeze({
    symlink: entry(
      'Manual step: replace the symlinked runtime-state file `{path}` with a regular file or remove it; it is never followed.',
      false,
    ),
    'not-regular-file': entry(
      'Manual step: replace `{path}` with a regular file or remove it; only a regular file is read.',
      false,
    ),
    'escapes-root': entry(
      'Manual step: move `{path}` back inside the main checkout; runtime-state files that resolve outside it are never read.',
      false,
    ),
    unreadable: entry(
      'Manual step: make `{path}` readable (check its permissions) or remove it.',
      false,
    ),
    'hidden-file-multiple-envelopes': entry(MANUAL_LOCAL_FILE, false),
    'ambiguous-visibility-row': entry(MANUAL_LOCAL_FILE, false),
    'malformed-visibility-row': entry(MANUAL_LOCAL_FILE, false),
    'unparseable-hidden-declaration': entry(MANUAL_LOCAL_FILE, false),
  }),
  // One variant per retired-row shape: an ordinary row, an invalid one (an `ambiguous-key` or a
  // `cell-count` `invalid-value`, so setup takes its invalid-source path and migrates nothing until
  // the row is repaired by hand), and a login-keyed row, which setup migrates only for a configured
  // reviewer and otherwise retains as an explicit exception.
  retired: Object.freeze({
    migrate: entry(
      'Run `effective-flow setup` to migrate the retired row `{key}` to `{successor}`.',
      true,
      'setup',
    ),
    invalid: entry(
      'Manual step: repair the retired row `{key}` in `{path}` by hand, as its {diagnostic} diagnostic says (exactly one `{key}` row with one key cell and one value cell), then run `effective-flow setup status` again; while it is invalid setup treats the table as an invalid source and does not migrate `{key}` to `{successor}`, and a Targeted request stops without a change.',
      false,
    ),
    reviewerResolved: entry(
      'Run `effective-flow setup` to migrate the retired row `{key}` to `{successor}`; setup migrates it only while `{login}` matches a reviewer in the effective `mergeGate.bots` list and otherwise reports and keeps the row, which you then remove by hand if that reviewer is gone.',
      true,
      'setup',
    ),
  }),
  ignore: Object.freeze({
    'not-ignored': entry(
      'Run `effective-flow setup` to enter `.effective-flow/` into `.gitignore`.',
      true,
      'setup',
    ),
    'negated-entry': entry(
      'Run `effective-flow setup` to remove the `!.effective-flow/config.json` negation line from `.gitignore`; `.effective-flow/` is a pure runtime directory and is ignored as a whole.',
      true,
      'setup',
    ),
    'other-negated-entry': entry(
      'Manual step: remove the `!.effective-flow/…` negation line(s) from `.gitignore` that setup does not migrate (it removes only `!.effective-flow/config.json`), then run `effective-flow setup status` again.',
      false,
    ),
    'tracked-runtime-content': entry(
      'Manual step: untrack the listed paths below `.effective-flow/` (for example with `git rm --cached`); setup never untracks files.',
      false,
    ),
    'exclude-entry-missing': entry(
      "Run `effective-flow setup hidden` to enter `.effective-flow/` into the Git common directory's `info/exclude`.",
      true,
      'setup hidden',
    ),
    'outranked-by-gitignore': entry(
      'Manual step: a tracked `.gitignore` rule outranks `info/exclude` for `.effective-flow/`; removing or editing it is your decision, setup reports it and never edits it.',
      false,
    ),
    'exclude-unsafe': entry(
      'Manual step: replace the symlinked or non-regular `info` directory or `info/exclude` file of the Git common directory with a real one; setup refuses to write through it.',
      false,
    ),
    'gitignore-leftover': entry(
      'Optional manual step: the tracked `.gitignore` still names `.effective-flow/`; removing that line is your decision.',
      false,
    ),
  }),
  // One text per disabling cause: the global switch, or an exclude scope (global or per tool/agent).
  ownerDisabled: Object.freeze({
    'skills.enabled': entry(
      'If this is unintended, run `effective-flow setup set skills.enabled to true` (a Targeted request) to re-enable the central domain-owner skills; while `skills.enabled` is `false` no tool loads `{skill}` or any other skill.',
      false,
    ),
    exclude: entry(
      'If this is unintended, run `effective-flow setup <request>` (a Targeted request such as `effective-flow setup stop excluding {skill}`) to re-enable the skill for the listed exclude scopes.',
      false,
    ),
  }),
  // An owner the session's skill list lacks: no configuration change installs a skill.
  ownerMissing: entry(
    'Manual step: install `{skill}` through the skill manager you install skills with; until then every listed tool runs its minimal fallback.',
    false,
  ),
  outdated: entry(
    'Manual step: update the installed Effective Flow skill through the skill manager you installed it with.',
    false,
  ),
  // The Claude Code allow rules of the helper operations in `.claude/settings.local.json`.
  allowlist: Object.freeze({
    absent: entry(
      'Run `effective-flow setup allowlist` to preview and confirm the allow rules of the runtime-state helper for this install.',
      true,
      'allowlist',
    ),
    stale: entry(
      'Run `effective-flow setup allowlist` to preview and confirm the removal of the allow rules whose helper no longer exists, together with the rules of this install.',
      true,
      'allowlist',
    ),
  }),
});

function render(template, values) {
  return template.replace(/\{(key|successor|path|skill|login|diagnostic)\}/g, (match, name) =>
    values[name] === undefined || values[name] === null ? match : String(values[name]),
  );
}

// ---------------------------------------------------------------------------------------------
// Errors

export class SetupStatusError extends Error {
  constructor(code, message, details = {}, options) {
    super(message, options);
    this.name = 'SetupStatusError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new SetupStatusError(code, message, details);
}

// ---------------------------------------------------------------------------------------------
// Input

const INPUT_KEYS = Object.freeze(['cwd', 'skillRoot']);

async function validateInput(input, fs) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('INVALID_INPUT', 'input must be a JSON object');
  }
  for (const key of Object.keys(input)) {
    if (!INPUT_KEYS.includes(key)) fail('INVALID_INPUT', `unknown input field: ${key}`, { key });
  }
  const { skillRoot } = input;
  if (
    skillRoot !== undefined &&
    (typeof skillRoot !== 'string' || skillRoot.includes('\0') || !path.isAbsolute(skillRoot))
  ) {
    fail('INVALID_INPUT', 'skillRoot must be an absolute path string', { field: 'skillRoot' });
  }
  const { cwd } = input;
  if (typeof cwd !== 'string' || cwd === '' || cwd.includes('\0')) {
    fail('INVALID_INPUT', 'cwd must be a non-empty path string', { field: 'cwd' });
  }
  if (!path.isAbsolute(cwd))
    fail('INVALID_INPUT', 'cwd must be an absolute path', { field: 'cwd' });
  let canonical;
  try {
    canonical = await fs.realpath(cwd);
    if (!(await fs.stat(canonical)).isDirectory()) throw new Error('not a directory');
  } catch {
    fail('INVALID_INPUT', 'cwd must be an existing directory', { field: 'cwd' });
  }
  return canonical;
}

// ---------------------------------------------------------------------------------------------
// Configuration

function remediationFor(map, key, values) {
  const found = Object.hasOwn(map, key) ? map[key] : null;
  if (!found) return { remediation: null, setupFixable: false, setupForm: null };
  return finding(found, values);
}

// The rendered `{ remediation, setupFixable, setupForm }` of one frozen remediation entry.
function finding(found, values = {}) {
  return {
    remediation: render(found.remediation, values),
    setupFixable: found.setupFixable,
    setupForm: found.setupForm,
  };
}

// The `invalid-value` variant for one diagnostic: a structural one (`reason: cell-count`) is an
// invalid source; a value-domain one names the form that accepts its key, because a Targeted request
// refuses `visibility`, `executionProfiles.fast.enabled` and, in hidden mode, every forced key.
function invalidValueRemediation(diagnostic, visibility) {
  const variants = REMEDIATIONS.invalidValue;
  if (diagnostic.reason === 'cell-count') return variants['cell-count'];
  if (diagnostic.key === 'visibility') return variants.visibility;
  if (diagnostic.key === FAST_PROFILE_KEY) return variants.fastProfile;
  if (visibility === 'hidden' && Object.hasOwn(HIDDEN_FORCED_VALUES, diagnostic.key)) {
    return variants.hiddenForced;
  }
  return REMEDIATIONS.diagnostics['invalid-value'];
}

// A diagnostic without a path of its own (`ambiguous-key`, `invalid-value`, `unrepresentable-row`)
// names the configuration source it was found in.
function diagnosticFinding(diagnostic, { sourcePath, visibility }) {
  const values = {
    key: diagnostic.key,
    path: diagnostic.path ?? diagnostic.markerFile ?? diagnostic.paths?.[0] ?? sourcePath,
  };
  if (diagnostic.code === 'invalid-value') {
    return { ...diagnostic, ...finding(invalidValueRemediation(diagnostic, visibility), values) };
  }
  return { ...diagnostic, ...remediationFor(REMEDIATIONS.diagnostics, diagnostic.code, values) };
}

function errorFinding(error) {
  const code = CONFIG_RESOLVE_ERROR_CODES.includes(error?.code) ? error.code : 'INTERNAL_ERROR';
  const details = error?.details && typeof error.details === 'object' ? error.details : {};
  let detail = null;
  let found = REMEDIATIONS.errors[code];
  if (code === 'RUNTIME_ROOT_UNVERIFIED' && Object.hasOwn(REMEDIATIONS.rootChecks, details.check)) {
    detail = details.check;
    found = REMEDIATIONS.rootChecks[detail];
  } else if (
    code === 'RUNTIME_STATE_UNSAFE' &&
    Object.hasOwn(REMEDIATIONS.unsafeReasons, details.reason)
  ) {
    detail = details.reason;
    found = REMEDIATIONS.unsafeReasons[detail];
  }
  return {
    code,
    message: error?.message ?? 'unexpected configuration resolver failure',
    detail,
    details,
    ...finding(found, { path: details.path }),
  };
}

const LANGUAGES = Object.freeze(['de', 'en']);

// The resolved `language.chat` or `language.project` of the setup call: `de` or `en` when the row is
// set to one of them, otherwise null (unset, invalid, or an unsupported value); the caller then
// continues its own fallback chain.
function languageOf(values, key) {
  const entry = values?.[key];
  if (!entry || entry.state !== 'set' || typeof entry.value !== 'string') return null;
  const value = entry.value.trim();
  return LANGUAGES.includes(value) ? value : null;
}

function configurationSection(outcome) {
  if (!outcome.ok) {
    const error = errorFinding(outcome.error);
    return {
      state: 'error',
      runtimeStateRoot: null,
      checkoutRoot: null,
      visibility: null,
      chatLanguage: null,
      projectLanguage: null,
      source: null,
      diagnostics: [],
      error,
      remediation: null,
      setupForm: null,
      setupFixable: error.setupFixable,
    };
  }
  const { data } = outcome;
  const context = { sourcePath: data.source.path, visibility: data.visibility };
  const diagnostics = data.diagnostics.map((diagnostic) => diagnosticFinding(diagnostic, context));
  const configured = data.source.step !== 4;
  const notSetUp = configured ? null : REMEDIATIONS.notSetUp;
  return {
    state: configured ? 'configured' : 'not-set-up',
    runtimeStateRoot: data.runtimeStateRoot,
    checkoutRoot: data.checkoutRoot,
    visibility: data.visibility,
    chatLanguage: languageOf(data.values, 'language.chat'),
    projectLanguage: languageOf(data.values, 'language.project'),
    source: {
      step: data.source.step,
      path: data.source.path,
      language: data.source.language,
      visibility: data.visibility,
    },
    diagnostics,
    error: null,
    remediation: notSetUp?.remediation ?? null,
    setupForm: notSetUp?.setupForm ?? null,
    setupFixable: Boolean(notSetUp?.setupFixable) || diagnostics.some((d) => d.setupFixable),
  };
}

async function resolveSafely(input, deps) {
  try {
    return { ok: true, data: await resolveConfiguration(input, deps) };
  } catch (error) {
    return { ok: false, error };
  }
}

// ---------------------------------------------------------------------------------------------
// Ownership projection

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item !== '');
}

// Returns the validated projection, or throws a plain Error naming what is wrong.
export function validateOwnersProjection(projection) {
  const problem = (message) => {
    throw new Error(`malformed ownership projection: ${message}`);
  };
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) {
    problem('not a JSON object');
  }
  if (projection.schemaVersion !== OWNERS_PROJECTION_SCHEMA_VERSION) {
    problem(`schemaVersion must be ${OWNERS_PROJECTION_SCHEMA_VERSION}`);
  }
  if (typeof projection.version !== 'string' || !INSTALLED_SEMVER.test(projection.version)) {
    problem('version must be a SemVer string');
  }
  if (!isStringArray(projection.exposedTools)) problem('exposedTools must be a list of names');
  if (
    !Array.isArray(projection.workflowEdges) ||
    !projection.workflowEdges.every(
      (edge) =>
        edge &&
        typeof edge.from === 'string' &&
        typeof edge.to === 'string' &&
        (edge.mode === undefined ||
          edge.mode === null ||
          (typeof edge.mode === 'string' && edge.mode !== '')),
    )
  ) {
    problem('workflowEdges must be a list of { from, to, mode }');
  }
  if (!Array.isArray(projection.owners)) problem('owners must be a list');
  for (const owner of projection.owners) {
    if (
      !owner ||
      typeof owner.skill !== 'string' ||
      typeof owner.consumer !== 'string' ||
      !['tool', 'agent', 'shared'].includes(owner.consumerKind) ||
      owner.classification !== 'delegate' ||
      !isStringArray(owner.tools) ||
      !Array.isArray(owner.reach) ||
      !owner.reach.every(
        (reach) =>
          reach &&
          typeof reach.tool === 'string' &&
          typeof reach.scope === 'string' &&
          /^(?:tools|agents)\.[a-z0-9-]+$/.test(reach.scope),
      )
    ) {
      problem(`invalid owner row ${JSON.stringify(owner?.consumer ?? null)}`);
    }
  }
  return projection;
}

export function defaultProjectionPath() {
  return fileURLToPath(new URL(`./${OWNERS_PROJECTION_FILE}`, import.meta.url));
}

async function loadProjection(deps) {
  const target = deps.projectionPath ?? defaultProjectionPath();
  let text;
  try {
    text = await (deps.fs ?? nodeFs).readFile(target, 'utf8');
  } catch (error) {
    return {
      ok: false,
      reason:
        error?.code === 'ENOENT'
          ? 'the ownership projection is missing'
          : 'the ownership projection is unreadable',
    };
  }
  try {
    return { ok: true, projection: validateOwnersProjection(JSON.parse(text)) };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof SyntaxError ? 'the ownership projection is not valid JSON' : error.message,
    };
  }
}

// An edge with a `mode` runs its target only in that mode, an edge without one in every mode.
function edgeRunsMode(edge, tool, mode) {
  if (edge.to !== tool) return true;
  return edge.mode === undefined || edge.mode === null || mode === null || edge.mode === mode;
}

// Every exposed tool that runs `tool` in `mode` (null: every mode): the tool itself when exposed,
// and every exposed tool that reaches it through the declared workflow edges, transitively. The mode
// constrains only the final edge into `tool`; an intermediate tool counts in every mode, because
// the resolver classifies retired rows for the evaluated tool, not for the tools on the way.
export function exposedToolsReaching(tool, { exposedTools, workflowEdges }, mode = null) {
  const reached = new Set();
  for (const start of exposedTools) {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === tool) {
        reached.add(start);
        break;
      }
      for (const edge of workflowEdges) {
        if (edge.from === current && !seen.has(edge.to) && edgeRunsMode(edge, tool, mode)) {
          seen.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
  }
  return [...reached].sort();
}

// ---------------------------------------------------------------------------------------------
// Retired rows

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

// The frozen variant for one retired row: an invalid row first (setup migrates nothing while it is
// invalid), then a login-keyed row, otherwise the ordinary migration.
function retiredRemediation(row, { diagnostics, source }) {
  if (row.state === 'invalid') {
    const codes = diagnostics
      .filter(
        (diagnostic) =>
          diagnostic.key === row.key &&
          ['ambiguous-key', 'invalid-value'].includes(diagnostic.code),
      )
      .map((diagnostic) => `\`${diagnostic.code}\``);
    return finding(REMEDIATIONS.retired.invalid, {
      key: row.key,
      path: source.path,
      successor: row.successor,
      diagnostic:
        codes.length > 0 ? sortedUnique(codes).join(' and ') : '`ambiguous-key` or `invalid-value`',
    });
  }
  const variant =
    row.conditional === 'reviewer-resolved'
      ? REMEDIATIONS.retired.reviewerResolved
      : REMEDIATIONS.retired.migrate;
  return finding(variant, { key: row.key, successor: row.successor, login: row.login });
}

async function retiredSection(cwd, setupData, projection, deps) {
  if (!setupData || setupData.retired.length === 0) return [];
  const evaluations = [];
  for (const set of SUCCESSOR_SETS) {
    const input =
      set.mode === null ? { cwd, tool: set.tool } : { cwd, tool: set.tool, mode: set.mode };
    const outcome = await resolveSafely(input, deps);
    evaluations.push({ set, outcome });
  }
  // A resolver tool no exposed tool reaches keeps its own name in `stop`/`report` and is listed in
  // `unmappedTools`, so a missing workflow edge never silently drops a stopping tool.
  const mapping = projection
    ? (tool, mode) =>
        exposedToolsReaching(
          tool,
          { exposedTools: projection.exposedTools, workflowEdges: projection.workflowEdges },
          mode,
        )
    : (tool) => [tool];
  return setupData.retired.map((row) => {
    const rowEvaluations = evaluations.map(({ set, outcome }) => {
      if (!outcome.ok) {
        return { tool: set.tool, mode: set.mode, error: outcome.error?.code ?? 'INTERNAL_ERROR' };
      }
      const match = outcome.data.retired.find((candidate) => candidate.key === row.key);
      return { tool: set.tool, mode: set.mode, action: match?.action ?? 'none' };
    });
    const unmapped = new Set();
    const mapped = (evaluation) => {
      const tools = mapping(evaluation.tool, evaluation.mode);
      if (tools.length > 0) return tools;
      unmapped.add(evaluation.tool);
      return [evaluation.tool];
    };
    const stop = sortedUnique(rowEvaluations.filter((e) => e.action === 'stop').flatMap(mapped));
    const stopSet = new Set(stop);
    const report = sortedUnique(
      rowEvaluations.filter((e) => e.action === 'report').flatMap(mapped),
    ).filter((tool) => !stopSet.has(tool));
    const result = {
      key: row.key,
      successor: row.successor,
      successorPresent: row.successorPresent,
    };
    if (row.state !== undefined) result.state = row.state;
    if (row.conditional !== undefined) {
      result.conditional = row.conditional;
      result.login = row.login;
      result.normalizedLogin = row.normalizedLogin;
    }
    return {
      ...result,
      stop,
      report,
      toolMapping: projection ? 'exposed' : 'resolver-names',
      unmappedTools: projection ? [...unmapped].sort() : [],
      evaluations: rowEvaluations,
      ...retiredRemediation(row, setupData),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Ignore state

function asText(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array)
    return Buffer.from(value).toString('utf8');
  return String(value ?? '');
}

async function git(context, cwd, args) {
  const result = await context.runner({
    executable: 'git',
    args: ['-C', cwd, ...args],
    cwd,
    env: context.env,
  });
  return {
    status: result?.status ?? null,
    stdout: asText(result?.stdout),
    stderr: asText(result?.stderr),
    error: result?.error,
  };
}

function gitDetail(args, result) {
  const line =
    result.error?.message ??
    asText(result.stderr)
      .split('\n')
      .map((text) => text.trim())
      .find((text) => text !== '') ??
    `exit ${result.status}`;
  return `git ${args.join(' ')}: ${line}`;
}

class CouldNotCheck extends Error {}

// 0 ignored, 1 not ignored; anything else cannot be decided.
async function isIgnored(context, root, probe) {
  const args = ['check-ignore', '--no-index', '--', probe];
  const result = await git(context, root, args);
  if (result.error || (result.status !== 0 && result.status !== 1)) {
    throw new CouldNotCheck(gitDetail(args, result));
  }
  return result.status === 0;
}

async function trackedRuntimePaths(context, root) {
  const args = ['ls-files', '-z', '--', `${STATE_DIR}/`];
  const result = await git(context, root, args);
  if (result.error || result.status !== 0) throw new CouldNotCheck(gitDetail(args, result));
  return result.stdout.split('\0').filter((item) => item !== '');
}

async function verboseRule(context, root, probe) {
  const args = ['check-ignore', '-v', '--no-index', '--', probe];
  const result = await git(context, root, args);
  return result.stdout.split('\n').find((line) => line.trim() !== '') ?? null;
}

// Reads `<common-dir>/info/exclude` without following a link. Returns its lines, null when absent,
// or 'unsafe' when `info` or the file is a symlink or not a regular entry.
async function readExclude(context, commonDir) {
  const info = path.join(commonDir, 'info');
  const file = path.join(info, 'exclude');
  for (const [target, wantDirectory] of [
    [info, true],
    [file, false],
  ]) {
    let stat;
    try {
      stat = await context.fs.lstat(target);
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw new CouldNotCheck(`cannot inspect ${target}: ${error.message}`);
    }
    if (stat.isSymbolicLink()) return 'unsafe';
    if (wantDirectory ? !stat.isDirectory() : !stat.isFile()) return 'unsafe';
  }
  let handle;
  try {
    handle = await context.fs.open(
      file,
      nodeFs.constants.O_RDONLY | nodeFs.constants.O_NOFOLLOW | (nodeFs.constants.O_NONBLOCK ?? 0),
    );
    if (!(await handle.stat()).isFile()) return 'unsafe';
    return (await handle.readFile('utf8')).split(/\r?\n/);
  } catch (error) {
    if (error?.code === 'ELOOP') return 'unsafe';
    throw new CouldNotCheck(`cannot read ${file}: ${error.message}`);
  } finally {
    await handle?.close();
  }
}

async function gitignoreLines(context, checkoutRoot) {
  const file = path.join(checkoutRoot, '.gitignore');
  try {
    const stat = await context.fs.lstat(file);
    if (!stat.isFile()) return { file, lines: [] };
    return { file, lines: (await context.fs.readFile(file, 'utf8')).split(/\r?\n/) };
  } catch {
    return { file, lines: [] };
  }
}

// `check-ignore -v` names no rule for a path a negation re-includes, so the outranking line is
// looked up in the checkout's `.gitignore` for the report.
function outrankingLine({ file, lines }) {
  const index = lines.findIndex((line) => /^!.*\.effective-flow/.test(line.trim()));
  return index === -1 ? null : `${file}:${index + 1}:${lines[index].trim()}`;
}

// The negation lines of the checkout's `.gitignore` below `.effective-flow/`, as `file:line:text`.
function negationLines({ file, lines }) {
  const found = [];
  lines.forEach((line, index) => {
    const text = line.trim();
    if (GITIGNORE_NEGATION.test(text)) {
      found.push({ text, location: `${file}:${index + 1}:${text}` });
    }
  });
  return found;
}

function ignoreNote(code, extra = {}) {
  return {
    code,
    path: extra.path ?? null,
    paths: extra.paths ?? [],
    detail: extra.detail ?? null,
    ...finding(REMEDIATIONS.ignore[code]),
  };
}

function ignoreResult(visibility, state, extra = {}) {
  const reason = extra.reason ?? null;
  const found =
    state === 'problem' && reason && Object.hasOwn(REMEDIATIONS.ignore, reason)
      ? REMEDIATIONS.ignore[reason]
      : null;
  return {
    state,
    visibility,
    reason,
    detail: extra.detail ?? null,
    paths: extra.paths ?? [],
    remediation: found?.remediation ?? null,
    setupFixable: found?.setupFixable ?? false,
    setupForm: found?.setupForm ?? null,
    notes: extra.notes ?? [],
  };
}

// Standard mode evaluates setup Step 1's whole target state: the ignore predicate, no remaining
// `!.effective-flow/…` negation line, and no tracked runtime content. The predicate result is the
// section's reason; tracked content is the reason only when the predicate holds, and otherwise an
// additional `tracked-runtime-content` note, so `setupFixable` reflects the part setup can fix. A
// negation line setup does not migrate is likewise a note beside a failed predicate, so the first
// report already names every manual step.
async function standardIgnore(context, checkoutRoot, tracked) {
  const notes = [];
  const trackedNote = () => {
    if (tracked.length > 0) notes.push(ignoreNote('tracked-runtime-content', { paths: tracked }));
  };
  const gitignore = await gitignoreLines(context, checkoutRoot);
  const negations = negationLines(gitignore);
  if (!(await isIgnored(context, checkoutRoot, STANDARD_PROBE))) {
    trackedNote();
    const others = negations.filter(({ text }) => !GITIGNORE_CONFIG_NEGATION.test(text));
    if (others.length > 0) {
      notes.push(
        ignoreNote('other-negated-entry', {
          path: gitignore.file,
          detail: others.map(({ location }) => location).join('; '),
        }),
      );
    }
    return ignoreResult('standard', 'problem', {
      reason: 'not-ignored',
      detail: await verboseRule(context, checkoutRoot, STANDARD_PROBE),
      paths: tracked,
      notes,
    });
  }
  if (negations.length > 0) {
    trackedNote();
    const onlyConfig = negations.every(({ text }) => GITIGNORE_CONFIG_NEGATION.test(text));
    return ignoreResult('standard', 'problem', {
      reason: onlyConfig ? 'negated-entry' : 'other-negated-entry',
      detail: negations.map(({ location }) => location).join('; '),
      paths: tracked,
      notes,
    });
  }
  if (tracked.length > 0) {
    return ignoreResult('standard', 'problem', {
      reason: 'tracked-runtime-content',
      paths: tracked,
    });
  }
  return ignoreResult('standard', 'ok');
}

async function ignoreSection(configuration, context) {
  if (configuration.state === 'error') {
    return ignoreResult(null, 'could-not-check', {
      reason: 'configuration-unresolved',
      detail: 'the configuration could not be resolved, so its visibility is unknown',
    });
  }
  const { visibility, checkoutRoot, runtimeStateRoot } = configuration;
  if (runtimeStateRoot === null) {
    return ignoreResult(visibility, 'not-applicable', { reason: 'not-a-git-repository' });
  }
  try {
    const tracked = await trackedRuntimePaths(context, checkoutRoot);
    if (visibility === 'standard') return await standardIgnore(context, checkoutRoot, tracked);

    // Hidden mode keeps setup-hidden-mode's order: tracked runtime content short-circuits.
    const notes = [];
    const gitignore = await gitignoreLines(context, checkoutRoot);
    if (gitignore.lines.some((line) => GITIGNORE_LEFTOVER.test(line.trim()))) {
      notes.push(ignoreNote('gitignore-leftover', { path: gitignore.file }));
    }
    if (tracked.length > 0) {
      return ignoreResult(visibility, 'problem', {
        reason: 'tracked-runtime-content',
        paths: tracked,
        notes,
      });
    }
    const commonArgs = ['rev-parse', '--path-format=absolute', '--git-common-dir'];
    const common = await git(context, checkoutRoot, commonArgs);
    if (common.error || common.status !== 0) {
      throw new CouldNotCheck(gitDetail(commonArgs, common));
    }
    const commonDir = common.stdout.replace(/\r?\n$/, '');
    const exclude = await readExclude(context, commonDir);
    if (exclude === 'unsafe') {
      return ignoreResult(visibility, 'problem', {
        reason: 'exclude-unsafe',
        detail: path.join(commonDir, 'info', 'exclude'),
        notes,
      });
    }
    const hasEntry = Array.isArray(exclude) && exclude.includes(IGNORE_ENTRY);
    if (!hasEntry) {
      return ignoreResult(visibility, 'problem', { reason: 'exclude-entry-missing', notes });
    }
    for (const probe of HIDDEN_PROBES) {
      if (!(await isIgnored(context, checkoutRoot, probe))) {
        return ignoreResult(visibility, 'problem', {
          reason: 'outranked-by-gitignore',
          detail: (await verboseRule(context, checkoutRoot, probe)) ?? outrankingLine(gitignore),
          notes,
        });
      }
    }
    return ignoreResult(visibility, 'ok', { notes });
  } catch (error) {
    if (!(error instanceof CouldNotCheck)) throw error;
    return ignoreResult(visibility, 'could-not-check', {
      reason: 'git-failed',
      detail: error.message,
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Domain owners

function itemsOfValue(entry) {
  if (!entry || entry.state !== 'set') return [];
  return Array.isArray(entry.items) ? entry.items : [];
}

// The scope keys that disable `skill` for one reach scope: global switch, global exclude, and the
// consumer's own `tools.<name>` or `agents.<name>` exclude.
export function disablingCauses(skill, scope, values) {
  const causes = [];
  const enabled = values['skills.enabled'];
  if (enabled?.state === 'set' && enabled.value === false) causes.push('skills.enabled');
  if (itemsOfValue(values['skills.exclude']).includes(skill)) causes.push('skills.exclude');
  const scoped = `skills.${scope}.exclude`;
  if (itemsOfValue(values[scoped]).includes(skill)) causes.push(scoped);
  return causes;
}

// One text per kind of disabling cause the owner meets: the global `skills.enabled` switch first,
// then the exclude scopes; null when nothing disables it.
function ownerDisabledRemediation(skill, disabled) {
  const causes = new Set(disabled.flatMap((entry) => entry.causes));
  const texts = [];
  if (causes.has('skills.enabled')) {
    texts.push(render(REMEDIATIONS.ownerDisabled['skills.enabled'].remediation, { skill }));
  }
  if ([...causes].some((cause) => cause !== 'skills.enabled')) {
    texts.push(render(REMEDIATIONS.ownerDisabled.exclude.remediation, { skill }));
  }
  return texts.length > 0 ? texts.join(' ') : null;
}

export function domainOwnersFrom(projection, values) {
  const bySkill = new Map();
  for (const row of projection.owners) {
    if (!bySkill.has(row.skill)) bySkill.set(row.skill, []);
    bySkill.get(row.skill).push(row);
  }
  return [...bySkill.keys()].sort().map((skill) => {
    const rows = bySkill.get(skill);
    const disabledCauses = new Map();
    for (const row of rows) {
      for (const reach of row.reach) {
        const causes = values ? disablingCauses(skill, reach.scope, values) : [];
        if (causes.length === 0) continue;
        if (!disabledCauses.has(reach.tool)) disabledCauses.set(reach.tool, new Set());
        for (const cause of causes) disabledCauses.get(reach.tool).add(cause);
      }
    }
    const disabled = [...disabledCauses.keys()].sort().map((tool) => ({
      tool,
      causes: [...disabledCauses.get(tool)].sort(),
      consequence: `\`${tool}\` runs its minimal fallback`,
    }));
    return {
      skill,
      tools: sortedUnique(rows.flatMap((row) => row.tools)),
      consumers: rows
        .map((row) => ({ consumer: row.consumer, consumerKind: row.consumerKind }))
        .sort((left, right) => left.consumer.localeCompare(right.consumer)),
      disabled,
      remediation: ownerDisabledRemediation(skill, disabled),
      setupFixable: false,
      setupForm: null,
      missingRemediation: render(REMEDIATIONS.ownerMissing.remediation, { skill }),
    };
  });
}

function domainOwnersSection(projectionOutcome, setupData) {
  if (!projectionOutcome.ok) {
    return {
      state: 'could-not-check',
      reason: projectionOutcome.reason,
      configurationApplied: false,
      owners: [],
    };
  }
  const values = setupData?.values ?? null;
  return {
    state: 'ok',
    reason: null,
    configurationApplied: values !== null,
    owners: domainOwnersFrom(projectionOutcome.projection, values),
  };
}

// ---------------------------------------------------------------------------------------------
// Version

function semverParts(text) {
  return text.split('.').map((part) => Number.parseInt(part, 10));
}

export function compareSemver(left, right) {
  const a = semverParts(left);
  const b = semverParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

// The validated SemVer of a release tag, or null: the `effective-flow-v` prefix is stripped and only
// a plain `X.Y.Z` is accepted.
export function releaseSemver(tagName) {
  if (typeof tagName !== 'string') return null;
  const candidate = tagName.startsWith(RELEASE_TAG_PREFIX)
    ? tagName.slice(RELEASE_TAG_PREFIX.length)
    : tagName;
  return SEMVER.test(candidate) ? candidate : null;
}

async function readCappedBody(response) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RELEASE_BODY_BYTES) return null;
    return text;
  }
  const chunks = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_RELEASE_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function versionResult(state, extra = {}) {
  return {
    state,
    installed: extra.installed ?? null,
    latest: extra.latest ?? null,
    reason: extra.reason ?? null,
    request: extra.request ?? null,
    remediation: state === 'outdated' ? REMEDIATIONS.outdated.remediation : null,
    setupFixable: false,
    setupForm: null,
  };
}

async function lookupLatest(deps) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'no fetch implementation' };
  const timeoutMs = deps.releaseTimeoutMs ?? RELEASE_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(RELEASE_LATEST_URL, {
      method: 'GET',
      headers: { ...RELEASE_REQUEST_HEADERS },
      signal: controller.signal,
    });
    const status = response?.status;
    if (status === 403 || status === 429) {
      return { ok: false, reason: `rate limited or refused (HTTP ${status})` };
    }
    if (status === 404) return { ok: false, reason: 'no published release (HTTP 404)' };
    if (typeof status !== 'number' || status < 200 || status > 299) {
      return { ok: false, reason: `HTTP ${status ?? 'error'}` };
    }
    const text = await readCappedBody(response);
    if (text === null) {
      return { ok: false, reason: `response exceeds ${MAX_RELEASE_BODY_BYTES} bytes` };
    }
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return { ok: false, reason: 'malformed JSON response' };
    }
    if (!body || typeof body !== 'object' || body.draft === true || body.prerelease === true) {
      return { ok: false, reason: 'the latest release is not a published release' };
    }
    const latest = releaseSemver(body.tag_name);
    if (!latest) return { ok: false, reason: 'the latest release tag is not a plain SemVer' };
    return { ok: true, latest };
  } catch (error) {
    if (controller.signal.aborted) return { ok: false, reason: `timed out after ${timeoutMs} ms` };
    return {
      ok: false,
      reason: `request failed (${error?.cause?.code ?? error?.name ?? 'error'})`,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function versionSection(projectionOutcome, deps) {
  if (!projectionOutcome.ok) {
    return versionResult('could-not-check', {
      reason: `installed version unknown: ${projectionOutcome.reason}`,
    });
  }
  const installed = projectionOutcome.projection.version.match(/^\d+\.\d+\.\d+/)[0];
  const request = { method: 'GET', url: RELEASE_LATEST_URL };
  const lookup = await lookupLatest(deps);
  if (!lookup.ok)
    return versionResult('could-not-check', { installed, reason: lookup.reason, request });
  const order = compareSemver(installed, lookup.latest);
  const state = order === 0 ? 'current' : order < 0 ? 'outdated' : 'ahead';
  return versionResult(state, { installed, latest: lookup.latest, request });
}

// ---------------------------------------------------------------------------------------------
// Allow rules (read-only)

function allowlistResult(state, extra = {}) {
  const found = state === 'absent' || state === 'stale' ? REMEDIATIONS.allowlist[state] : null;
  return {
    state,
    reason: null,
    skillRoot: null,
    target: null,
    expected: [],
    present: [],
    missing: [],
    stale: [],
    aliases: [],
    ...extra,
    remediation: found?.remediation ?? null,
    setupFixable: found?.setupFixable ?? false,
    setupForm: found?.setupForm ?? null,
  };
}

// The state of this install's helper allow rules in `<runtimeStateRoot>/.claude/settings.local.json`.
// A rule is this install's when it names `skillRoot` literally and its helper resolves to the
// realpath of `<skillRoot>/scripts/effective-flow-state.mjs`: Claude Code matches the literal
// command path, so a rule under another alias of the same helper is reported in `aliases` and never
// counts as present. A helper-shape rule whose helper no longer resolves to a regular file is
// stale. Precedence: stale, then absent, then current.
async function allowlistSection(skillRoot, configuration, env, fs) {
  if (skillRoot === undefined)
    return allowlistResult('not-applicable', { reason: 'no-skill-root' });
  if (typeof env.CLAUDECODE !== 'string' || env.CLAUDECODE === '') {
    return allowlistResult('not-applicable', { reason: 'not-claude-code', skillRoot });
  }
  const root = configuration.runtimeStateRoot;
  if (!root) {
    return allowlistResult('could-not-check', { reason: 'runtime-root-unresolved', skillRoot });
  }
  const target = path.join(root, SETTINGS_RELATIVE_PATH);
  const expected = ALLOWLISTED_OPERATIONS.map((operation) => helperRule(skillRoot, operation));
  const base = { skillRoot, target, expected };
  const ownHelper = await resolveInstallHelper(fs, skillRoot);
  if (!ownHelper)
    return allowlistResult('could-not-check', { ...base, reason: 'helper-unresolved' });
  let read;
  try {
    read = await readSettingsFile(fs, target);
  } catch (error) {
    if (!(error instanceof SettingsError)) throw error;
    return allowlistResult('could-not-check', {
      ...base,
      reason: error.code === 'SETTINGS_INVALID' ? 'settings-invalid' : 'settings-unreadable',
      detail: error.message,
    });
  }
  const rules = read.exists ? await helperRulesIn(fs, read.allow) : [];
  const own = rules.filter((rule) => rule.helper === ownHelper && rule.skillRoot === skillRoot);
  const covered = new Set(own.map((rule) => rule.operation));
  const present = own.map((rule) => rule.rule);
  const aliases = rules
    .filter((rule) => rule.helper === ownHelper && rule.skillRoot !== skillRoot)
    .map((rule) => rule.rule);
  const missing = ALLOWLISTED_OPERATIONS.filter((operation) => !covered.has(operation)).map(
    (operation) => helperRule(skillRoot, operation),
  );
  const stale = rules.filter((rule) => rule.helper === null).map((rule) => rule.rule);
  const state = stale.length > 0 ? 'stale' : missing.length > 0 ? 'absent' : 'current';
  return allowlistResult(state, { ...base, present, missing, stale, aliases });
}

// ---------------------------------------------------------------------------------------------
// Status

export async function setupStatus(input, deps = {}) {
  const fs = deps.fs ?? nodeFs;
  const cwd = await validateInput(input, fs);
  // One runner and one lock-free Git environment for every resolver call and Git query.
  const runner = deps.runner ?? createProcessRunner();
  const env = deps.env ?? process.env;
  const resolverDeps = { runner, env, fs };
  const context = { runner, env: gitBaseEnv(env), fs };

  const setupOutcome = await resolveSafely({ cwd, tool: 'setup' }, resolverDeps);
  const configuration = configurationSection(setupOutcome);
  const setupData = setupOutcome.ok ? setupOutcome.data : null;
  const projectionOutcome = await loadProjection({ ...deps, fs });
  const projection = projectionOutcome.ok ? projectionOutcome.projection : null;

  const retired = await retiredSection(cwd, setupData, projection, resolverDeps);
  const ignore = await ignoreSection(configuration, context);
  const domainOwners = domainOwnersSection(projectionOutcome, setupData);
  const version = await versionSection(projectionOutcome, deps);
  const allowlist = await allowlistSection(input.skillRoot, configuration, env, fs);

  // Every setup-fixable finding with its form; domain owners and the version never are.
  const fixable = [
    { setupFixable: configuration.setupForm !== null, setupForm: configuration.setupForm },
    ...(configuration.error ? [configuration.error] : []),
    ...configuration.diagnostics,
    ...retired,
    ignore,
    ...ignore.notes,
    allowlist,
  ].filter((item) => item.setupFixable);
  const setupFixable = fixable.length > 0;
  const forms = new Set(fixable.map((item) => item.setupForm));
  const setupForms = SETUP_FORMS.filter((form) => forms.has(form));

  return {
    cwd,
    setupFixable,
    setupForms,
    configuration,
    retired,
    ignore,
    domainOwners,
    version,
    allowlist,
  };
}

// ---------------------------------------------------------------------------------------------
// Envelopes

const HANDLERS = Object.freeze({ status: setupStatus });

export async function executeOperation(operation, input = {}, deps = {}) {
  try {
    if (!SETUP_STATUS_OPERATIONS.includes(operation)) {
      fail('INVALID_INPUT', `unknown operation: ${operation}`);
    }
    const data = await HANDLERS[operation](input, deps);
    return { ok: true, operation, data };
  } catch (error) {
    return errorEnvelope(operation, error);
  }
}

export function errorEnvelope(operation, error) {
  const normalized =
    error instanceof SetupStatusError
      ? error
      : new SetupStatusError('INTERNAL_ERROR', error?.message ?? 'unexpected setup-status failure');
  return {
    ok: false,
    operation: operation ?? null,
    error: {
      code: normalized.code,
      message: normalized.message,
      details: normalized.details ?? {},
      retryable: false,
    },
  };
}

export function exitCodeFor(envelope) {
  if (envelope.ok) return 0;
  return EXIT_CODES[envelope.error.code] ?? 1;
}

// The codes the remediation map must cover; re-exported so a coverage test reads one place.
export const REMEDIATION_COVERAGE = Object.freeze({
  diagnostics: DIAGNOSTIC_CODES,
  errors: CONFIG_RESOLVE_ERROR_CODES,
  rootChecks: ROOT_CHECKS,
  unsafeReasons: UNSAFE_REASONS,
});
