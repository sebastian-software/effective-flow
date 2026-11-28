// Deterministic decision core of the Automation tool `autopilot`: the core behind `autopilot.mjs`.
//
// Model judgment stays outside. A fresh scoring leaf returns 1–10 option scores; this module
// validates and classifies them, persists the run ledger and renders the pull-request appendix.
// The contract that calls it is `shared/scored-decisions.md`; the category rules are
// `docs/adr/automation-tool-category.md`.
//
// Operations (one JSON object in, one `{ ok, operation, data | error }` envelope out):
// - `decision-classify` (pure): validation, classification, tie rule, floor and budget.
// - `decision-extract` (pure, reads only): the "Decided by score" machine block of a plan file.
// - `run-init`, `decision-record`, `blocker-record`, `fit-record`, `base-move-record`,
//   `delivery-base-record`, `plan-reviewed`, `delivery-record`, `delivery-confirm`, `run-close`:
//   the run ledger
//   `<cwd>/.effective-flow/autopilot/<run-id>/run.json`, written only through the
//   `runtime-state-guard.mjs` primitives; `cwd` must be the primary checkout (RUNTIME_STATE_ROOT).
//   `plan-reviewed` hashes the reviewed plan itself; `delivery-record` stores the archive path (or
//   an unarchived delivery) and `delivery-confirm` the verified pushed head, which after a
//   resolved delivery base must contain its merge commit (MERGE_NOT_DELIVERED). `base-move-record`
//   keeps at most one base move of an issue source's plan publication: a fitting one, or an
//   unresolved one published with its flag (never a reason in `BASE_MOVE_STOPPING_REASONS`).
//   `delivery-base-record` keeps at most one result of the pre-delivery base step on either
//   source (`none`, `resolved`, `unresolved`, `unchecked`) and verifies a named checkout with Git:
//   it is on the recorded `branch`, a resolved conflict is exactly one merge commit
//   `[headOid, baseOid]` at the branch tip, an unresolved one left the branch at `headOid` with no
//   merge in progress.
// - `delivery-base-check` (reads only, fetches nothing): whether the fetched `origin/<baseRef>`
//   moved past the head's merge base, with `localMergeProof` for a moved base.
// - Planning claim: `run-init` on an issue source first takes the issue's shared planning claim
//   (`effective-flow-state-planning-claim-core.mjs`, workflow `autopilot`, holder the minted run id)
//   and only then creates the run directory and ledger; a held claim is ISSUE_CLAIMED with the
//   holder and a legacy Issue Buddy `pass.lock` is LEGACY_PASS_LOCK, both before anything is
//   written. The claim token is stored only in the internal ledger field `planningClaim`, which no
//   operation output and no appendix ever carries. `run-close` writes the closed ledger first and
//   only then releases the claim, for every outcome, reporting the release as `planningClaim`. A
//   plan source takes no claim. `run-close` also reports the recorded `fit`, `baseMove` and
//   `deliveryBase` (without timestamps, `null` when none was recorded).
// - `consent-check` (reads only): an open ledger whose recorded source is the given issue and whose
//   recorded visibility is `private`.
// - `run-check` (reads only): an open ledger for the run id, or RUN_NOT_OPEN.
// - `pr-appendix`: renders, sanitizes and scans the appendix, writes it beside the ledger and
//   records its SHA-256 in the ledger; it is `withheld` under a public security blocker and under
//   any `worktree-location-conflict` blocker, which `run-close` also limits to `no-pull-request`
//   or, on an issue source, `plan-pull-request-unchanged`. A `blocked` or `withheld` result and
//   every later `decision-record`, `blocker-record`, `fit-record`, `base-move-record`,
//   `delivery-base-record`, `plan-reviewed` and `delivery-record` withdraw that digest, so only a
//   render of the current ledger can be merged. `delivery-confirm` changes nothing the appendix
//   renders and keeps it. A recorded base move and a recorded delivery base each render as their
//   own appendix section.
// - `plan-copy-restore`: the one project-file write. It replaces the run's own review edit of a
//   tracked plan in the invocation checkout (`sourceRoot`) with `HEAD`'s working-tree bytes, and
//   only when every precondition holds; otherwise it reports `kept` or `not-applicable`. It never
//   overwrites the plan path (a no-clobber install, no `git restore`, so the index stays
//   unchanged) and never deletes the reviewed copy: that copy is hard-linked into the run ledger
//   directory through the runtime-state guard and reported as `retainedCopy`. A failed retain or
//   install puts the reviewed copy back without clobbering and reports `putBack`. The ledger
//   directory must be on the plan checkout's filesystem; otherwise (EXDEV) it reports
//   `retain-failed` and copies nothing. `retain-failed` also carries `retainedCopy` when the
//   moved-aside name cannot be removed after the link.
// - `appendix-merge` (reads only): replaces the one appendix block of a pull-request body or
//   appends it, for `pr`'s `Appendix:` input; it reads the run's appendix only when its SHA-256 is
//   the one `pr-appendix` recorded, and never while a security blocker stands on a repository whose
//   recorded visibility is not `private` or a `worktree-location-conflict` blocker stands at all.
// - `ledger-list` (reads only) and `ledger-prune`: `cleanup`'s inventory and removal of run
//   ledgers. A ledger is removable only when its run is closed and it produced no pull request or
//   its pull request is merged or closed, as the caller's `pr-read` stated; an unavailable forge
//   retains it. A retained plan copy (`plan-copy-<16 hex>.md`) is never deleted here: no check
//   can exclude a save through an open descriptor or an atomic replacement between the check and
//   the unlink, so any run holding one is retained as `retained-plan-copy` with the copies' paths.
//
// Classification: lead > 3 is `silent`, lead 1–3 `documented` with every alternative within 3
// points, lead 0 a `tie`. Tie re-scores rank only the tied options, must be pairwise distinct, and
// the highest wins as `documented`. A winning score ≤ 2 (either round), a stop option as winner and
// an exhausted budget are blockers. Escape options are never scored and never chosen.
//
// Local-only content (a decision about a local-only finding, a security blocker) is stored only as
// review-report path plus finding ID and never reaches the appendix. No `-core.mjs` module imports
// `process-runner.mjs`; the CLI injects the runner the guard uses for its git checks.

import { createHash, randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { link, lstat, open, readdir, realpath, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';
import {
  APPENDIX_BEGIN,
  APPENDIX_BLOCKER_HEADINGS,
  APPENDIX_END,
  MAX_APPENDIX_BYTES,
} from './autopilot-appendix-core.mjs';
import {
  BASE_MOVE_REASONS,
  BASE_MOVE_VERDICTS,
  MAX_BASE_MOVE_PATHS,
  baseMoveRepublishes,
  hasClosingKeyword,
  scanEntries,
} from './plan-publication-core.mjs';
import {
  MAX_CONFLICTED_PATHS,
  MERGE_PROOF_UNAVAILABLE_REASONS,
  PrDeliveryGitError,
  archivePathFor,
  localMergeProof,
  parseRangeInput,
} from './pr-delivery-git-core.mjs';
import {
  O_NOFOLLOW,
  RUNTIME_STATE_DIR,
  RuntimeStateError,
  asBuffer,
  assertDirectoryChain,
  atomicWrite,
  createNoClobber,
  ensureGuardedDirectory,
  errorDetail,
  gitBaseEnv,
  guardTarget,
  guardedMkdir,
  guardedRmdir,
  guardedUnlink,
  resolveDirectory,
  resolveRuntimeRoot,
  runGit,
} from './runtime-state-guard.mjs';
import {
  planningClaimAcquire,
  planningClaimRelease,
} from './effective-flow-state-planning-claim-core.mjs';
import { StateOutcome } from './effective-flow-state-core.mjs';
import { isSafeBaseRef } from './config-resolve-core.mjs';

export const AUTOPILOT_OPERATIONS = Object.freeze([
  'run-init',
  'decision-classify',
  'decision-extract',
  'decision-record',
  'blocker-record',
  'fit-record',
  'base-move-record',
  'delivery-base-check',
  'delivery-base-record',
  'plan-reviewed',
  'delivery-record',
  'delivery-confirm',
  'consent-check',
  'run-check',
  'pr-appendix',
  'appendix-merge',
  'plan-copy-restore',
  'run-close',
  'ledger-list',
  'ledger-prune',
]);

export const SCORE_MIN = 1;
export const SCORE_MAX = 10;
// "More than 3 points" read strictly on integers: a lead of 4 or more is silent.
export const SILENT_MIN_LEAD = 4;
// Alternatives within this many points of the winner are documented.
export const CLOSE_WINDOW = 3;
// A winning score at or below the floor is a blocker.
export const SCORE_FLOOR = 2;
export const DECISION_CAP = 20;
export const AUTOPILOT_DIR = `${RUNTIME_STATE_DIR}/autopilot`;
export const LEDGER_FILE = 'run.json';
export const APPENDIX_FILE = 'appendix.md';
export const LEDGER_SCHEMA_VERSION = 1;
export const MAX_STDIN_BYTES = 1024 * 1024;
const MAX_LEDGER_BYTES = 1024 * 1024;
const MAX_PLAN_BYTES = 512 * 1024;
const MAX_BODY_BYTES = 256 * 1024;

export const RUN_ID = /^ap-\d{8}T\d{6}Z-[0-9a-f]{8}$/;
// The question-site ids of `shared/scored-decisions.md`.
export const SITE_ID = /^S-[A-Z]{2,5}$/;
const REPOSITORY = /^[a-z0-9.-]+\/[a-z0-9_.-]+\/[a-z0-9_.-]+$/;
const FINDING_ID = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const SHA256 = /^[0-9a-f]{64}$/;
// A Git object id: SHA-1 or SHA-256 repositories.
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export const VISIBILITIES = Object.freeze(['public', 'private', 'unknown']);
export const LANGUAGES = Object.freeze(['en', 'de']);
export const CLASSIFICATIONS = Object.freeze(['silent', 'documented']);
export const BLOCKER_KINDS = Object.freeze([
  'validation-red',
  'floor',
  'duplicate-rescore',
  'scoring-failure',
  'unknown-question',
  'stop-option',
  'clarity-gate',
  'decision-cap',
  'plan-not-approved',
  'security',
  'appendix-scan',
  'post-branch-failure',
  // A worktree path that an instruction in the run's loaded context forbids, with no machine-level
  // base declared (`shared/worktree-conflict-stop.md`). It carries no summary, withholds the
  // appendix and closes without publishing.
  'worktree-location-conflict',
  // A `blocker` row of the question-site table; it always carries that row's `site`.
  'site-blocker',
]);
// The blocker kinds that always name the question site they arose at.
export const SITE_REQUIRED_KINDS = Object.freeze(['site-blocker']);
// The blocker kind whose ledger entry is `{kind, recordedAt}` and nothing else: no summary, no
// site, no local-only reference. Its computed path and the forbidding instruction stay in the
// local report, so nothing of it can reach an appendix or a forge.
export const WORKTREE_LOCATION_CONFLICT = 'worktree-location-conflict';
// The outcomes a run holding a worktree-location-conflict blocker closes with: nothing published,
// or on an issue source the plan pull request it left as it was.
export const WORKTREE_LOCATION_CONFLICT_OUTCOMES = Object.freeze([
  'plan-pull-request-unchanged',
  'no-pull-request',
]);
// The pull-request states `cleanup` passes to `ledger-prune`: `pr-read`'s `state` (`open`,
// `closed`, `merged`), or `unavailable` when the forge could not be read.
export const PULL_REQUEST_STATES = Object.freeze(['open', 'closed', 'merged', 'unavailable']);
// At most this many runs per `ledger-prune` call.
export const MAX_PRUNE_RUNS = 64;
export const RUN_OUTCOMES = Object.freeze([
  'pull-request',
  'plan-only-pull-request',
  'appendix-update',
  // A plan pull request whose appendix a blocker left unchanged: on an issue source a public
  // security blocker, a worktree location conflict, a blocked appendix or a failed appendix-only
  // update; on a plan source a rerun whose update of the verified draft failed. Its appendix
  // stayed as it was, and the ledger records that pull request so `cleanup` keeps it while the
  // pull request is open.
  'plan-pull-request-unchanged',
  'no-pull-request',
]);

export const LIMITS = Object.freeze({
  question: 300,
  label: 120,
  reason: 300,
  summary: 500,
  options: 12,
  sources: 20,
  path: 512,
});

// The machine block a planning sub-run writes under the plan's assumptions section.
export const MACHINE_BLOCK_BEGIN = '<!-- effective-flow-scored-decisions:begin v1 -->';
export const MACHINE_BLOCK_END = '<!-- effective-flow-scored-decisions:end -->';
const ASSUMPTION_HEADINGS = Object.freeze([
  '## Assumptions and open points',
  '## Annahmen und offene Punkte',
]);

// The appendix markers live in `autopilot-appendix-core.mjs`, which the reading side shares; they
// stay exported here for existing importers.
export { APPENDIX_BEGIN, APPENDIX_END };

export class AutopilotError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AutopilotError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new AutopilotError(code, message, details);
}

function invalid(message) {
  fail('INVALID_INPUT', message);
}

// ---------------------------------------------------------------------------------------------
// Input validation

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function closed(value, required, optional, label) {
  if (!isObject(value)) invalid(`${label} must be a JSON object`);
  for (const key of required) {
    if (!Object.hasOwn(value, key)) invalid(`${label}.${key} is required`);
  }
  for (const key of Object.keys(value)) {
    if (!required.includes(key) && !optional.includes(key)) {
      invalid(`${label}.${key} is not allowed`);
    }
  }
  return value;
}

function text(value, label, max) {
  if (typeof value !== 'string' || value.trim() === '')
    invalid(`${label} must be a non-empty string`);
  if (value.length > max) invalid(`${label} exceeds ${max} characters`);
  return value;
}

function oneOf(value, values, label) {
  if (!values.includes(value)) invalid(`${label} must be one of ${values.join(', ')}`);
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) invalid(`${label} must be a positive integer`);
  return value;
}

function labelList(value, label, { allowEmpty = true } = {}) {
  if (!Array.isArray(value)) invalid(`${label} must be an array of option labels`);
  if (!allowEmpty && value.length === 0) invalid(`${label} must not be empty`);
  if (value.length > LIMITS.options) invalid(`${label} exceeds ${LIMITS.options} options`);
  const seen = new Set();
  for (const [index, entry] of value.entries()) {
    text(entry, `${label}[${index}]`, LIMITS.label);
    if (seen.has(entry)) invalid(`${label} repeats "${entry}"`);
    seen.add(entry);
  }
  return value;
}

// Characters a path may not carry: C0/C1 controls, line and paragraph separators, and the
// backtick that would close the appendix's inline code span.
const UNSAFE_PATH_CHARACTER = /[\u0000-\u001f\u007f-\u009f\u2028\u2029`]/;

// A repository-relative POSIX path: never absolute, never with a `..` segment, never with a
// control character or a backtick.
function relativePath(value, label) {
  text(value, label, LIMITS.path);
  if (UNSAFE_PATH_CHARACTER.test(value))
    invalid(`${label} carries a control character or backtick`);
  if (
    path.posix.isAbsolute(value) ||
    /^[A-Za-z]:/.test(value) ||
    value.includes('\\') ||
    value.split('/').some((part) => part === '..' || part === '.' || part === '')
  ) {
    invalid(`${label} must be a repository-relative path`);
  }
  return value;
}

function requireRunId(value) {
  if (typeof value !== 'string' || !RUN_ID.test(value)) invalid('runId is not an autopilot run id');
  return value;
}

function localOnlyReference(value, label) {
  closed(value, ['reportPath', 'findingId'], [], label);
  text(value.reportPath, `${label}.reportPath`, LIMITS.path);
  if (typeof value.findingId !== 'string' || !FINDING_ID.test(value.findingId)) {
    invalid(`${label}.findingId is not a finding ID`);
  }
  return { reportPath: value.reportPath, findingId: value.findingId };
}

// ---------------------------------------------------------------------------------------------
// Classification

function scoreList(value, label, expected) {
  if (!Array.isArray(value)) invalid(`${label} must be an array`);
  const byLabel = new Map();
  for (const [index, entry] of value.entries()) {
    const where = `${label}[${index}]`;
    closed(entry, ['label', 'score', 'reason'], [], where);
    text(entry.label, `${where}.label`, LIMITS.label);
    if (!Number.isInteger(entry.score) || entry.score < SCORE_MIN || entry.score > SCORE_MAX) {
      fail('INVALID_SCORE', `${where}.score must be an integer from ${SCORE_MIN} to ${SCORE_MAX}`, {
        label: entry.label,
      });
    }
    text(entry.reason, `${where}.reason`, LIMITS.reason);
    if (byLabel.has(entry.label)) {
      fail('INVALID_SCORE', `${label} scores "${entry.label}" twice`, { label: entry.label });
    }
    byLabel.set(entry.label, { label: entry.label, score: entry.score, reason: entry.reason });
  }
  for (const entry of byLabel.keys()) {
    if (!expected.includes(entry)) {
      fail('INVALID_SCORE', `${label} scores "${entry}", which is not a scorable option here`, {
        label: entry,
      });
    }
  }
  for (const entry of expected) {
    if (!byLabel.has(entry)) {
      fail('INVALID_SCORE', `${label} has no score for "${entry}"`, { label: entry });
    }
  }
  return expected.map((entry) => byLabel.get(entry));
}

function byScore(left, right) {
  return right.score - left.score;
}

function blocker(reason, budgetRemaining, extra = {}) {
  return { outcome: 'blocker', blocker: reason, budgetRemaining, ...extra };
}

// The question record a scoring round classifies. `options` lists every option in its order,
// `escape` the never-scored escape options ("Decide later", "Abort"), `stop` the options whose
// choice is itself a stop. `budgetRemaining` is the run's remaining scored-decision budget.
const DECISION_KEYS = ['site', 'question', 'options', 'scores'];
const DECISION_OPTIONAL = ['escape', 'stop', 'tieScores'];

function normalizeDecision(input, label) {
  closed(input, DECISION_KEYS, DECISION_OPTIONAL, label);
  if (typeof input.site !== 'string' || !SITE_ID.test(input.site)) {
    invalid(`${label}.site is not a question-site id`);
  }
  text(input.question, `${label}.question`, LIMITS.question);
  const options = labelList(input.options, `${label}.options`, { allowEmpty: false });
  const escape = labelList(input.escape ?? [], `${label}.escape`);
  const stop = labelList(input.stop ?? [], `${label}.stop`);
  for (const entry of [...escape, ...stop]) {
    if (!options.includes(entry)) invalid(`${label} names "${entry}", which is not an option`);
  }
  if (stop.some((entry) => escape.includes(entry))) {
    invalid(`${label} lists an option as both escape and stop`);
  }
  const scorable = options.filter((entry) => !escape.includes(entry));
  if (scorable.length === 0) invalid(`${label} has no scorable option`);
  for (const entry of Array.isArray(input.scores) ? input.scores : []) {
    if (isObject(entry) && escape.includes(entry.label)) {
      fail('ESCAPE_SCORED', `${label} scores the escape option "${entry.label}"`, {
        label: entry.label,
      });
    }
  }
  return {
    site: input.site,
    question: input.question,
    options,
    escape,
    stop,
    scorable,
    scores: input.scores,
    tieScores: input.tieScores,
  };
}

function requireBudget(value) {
  if (!Number.isInteger(value) || value < 0 || value > DECISION_CAP) {
    invalid(`budgetRemaining must be an integer from 0 to ${DECISION_CAP}`);
  }
  return value;
}

// Classifies one question's scores. Returns `{ outcome: 'decided', classification, winner,
// alternatives, tieResolved, budgetRemaining }`, `{ outcome: 'tie', tied, budgetRemaining }` when a
// re-score is owed, or `{ outcome: 'blocker', blocker, budgetRemaining }`. A malformed score set is
// an error (INVALID_SCORE, ESCAPE_SCORED, DUPLICATE_RESCORE), which the procedure retries once.
export function classifyDecision(input, budgetRemaining) {
  const decision = normalizeDecision(input, 'decision');
  requireBudget(budgetRemaining);
  if (budgetRemaining === 0) return blocker('decision-cap', 0);
  const first = scoreList(decision.scores, 'scores', decision.scorable).sort(byScore);
  const top = first[0].score;
  if (top <= SCORE_FLOOR) return blocker('floor', budgetRemaining, { scores: first });
  const tied = first.filter((entry) => entry.score === top);

  let winner;
  let alternatives;
  let tieResolved = false;
  let rescores = null;
  if (tied.length > 1) {
    if (decision.tieScores === undefined) {
      return {
        outcome: 'tie',
        tied: tied.map((entry) => entry.label),
        scores: first,
        budgetRemaining,
      };
    }
    const tiedLabels = tied.map((entry) => entry.label);
    rescores = scoreList(decision.tieScores, 'tieScores', tiedLabels).sort(byScore);
    const distinct = new Set(rescores.map((entry) => entry.score));
    if (distinct.size !== rescores.length) {
      fail('DUPLICATE_RESCORE', 'tie re-scores must be pairwise distinct', {
        scores: rescores.map(({ label, score }) => ({ label, score })),
      });
    }
    if (rescores[0].score <= SCORE_FLOOR) {
      return blocker('floor', budgetRemaining, { scores: first, tieScores: rescores });
    }
    const rescoreOf = new Map(rescores.map((entry) => [entry.label, entry]));
    winner = { ...first.find((entry) => entry.label === rescores[0].label) };
    winner.rescore = rescores[0].score;
    winner.rescoreReason = rescores[0].reason;
    alternatives = first
      .filter((entry) => entry.label !== winner.label && entry.score >= top - CLOSE_WINDOW)
      .map((entry) => {
        const rescore = rescoreOf.get(entry.label);
        return rescore
          ? { ...entry, rescore: rescore.score, rescoreReason: rescore.reason }
          : { ...entry };
      })
      .sort(
        (left, right) => right.score - left.score || (right.rescore ?? 0) - (left.rescore ?? 0),
      );
    tieResolved = true;
  } else {
    if (decision.tieScores !== undefined) {
      invalid('tieScores are only allowed when the first round ties');
    }
    winner = { ...first[0] };
    alternatives = first
      .slice(1)
      .filter((entry) => entry.score >= top - CLOSE_WINDOW)
      .map((entry) => ({ ...entry }));
  }
  if (decision.stop.includes(winner.label)) {
    return blocker('stop-option', budgetRemaining, { winner });
  }
  const lead = first.length === 1 ? null : top - (first[1]?.score ?? 0);
  const classification =
    !tieResolved && (lead === null || lead >= SILENT_MIN_LEAD) ? 'silent' : 'documented';
  return {
    outcome: 'decided',
    classification,
    tieResolved,
    lead: tieResolved ? 0 : lead,
    winner,
    alternatives: classification === 'silent' ? [] : alternatives,
    budgetRemaining: budgetRemaining - 1,
  };
}

function classifyOperation(input) {
  closed(input, ['decision', 'budgetRemaining'], [], 'input');
  return classifyDecision(input.decision, input.budgetRemaining);
}

// ---------------------------------------------------------------------------------------------
// Machine block extraction

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function readBoundedRegular(target, max, label) {
  let handle;
  try {
    handle = await open(target, fsConstants.O_RDONLY | O_NOFOLLOW);
  } catch (error) {
    if (error?.code === 'ENOENT') fail('NOT_FOUND', `${label} does not exist`);
    fail('UNSAFE_TARGET', `cannot open ${label}: ${error?.code ?? error?.message}`);
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) fail('UNSAFE_TARGET', `${label} is not a regular file`);
    if (info.size > max) fail('INPUT_TOO_LARGE', `${label} exceeds ${max} bytes`);
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

function blockInvalid(message, details) {
  fail('MACHINE_BLOCK_INVALID', message, details);
}

// The indices of prose lines (outside every fence and not a fence line), and whether a fence is
// still open at the end of the text.
function outsideFences(lines) {
  const result = [];
  let fence = null;
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^[ \t]*(`{3,}|~{3,})/);
    if (match) {
      if (fence === null) fence = match[1];
      else if (
        match[1][0] === fence[0] &&
        match[1].length >= fence.length &&
        line.trim() === match[1]
      ) {
        fence = null;
        continue;
      }
    }
    if (fence === null && !match) result.push(index);
  }
  return { prose: new Set(result), openAtEnd: fence !== null };
}

// Parses the one marker-delimited "Decided by score" block of a plan text. No marker at all is
// `absent`; anything else that is not exactly one well-formed block inside the assumptions
// section, holding one JSON array of valid decision records, is MACHINE_BLOCK_INVALID. A fence
// left open at the end of the text that hides marker-shaped lines is MACHINE_BLOCK_INVALID too,
// so an unterminated fence cannot swallow the block and turn it into `absent`.
export function extractDecisions(planText) {
  const lines = planText.replace(/\r\n/g, '\n').split('\n');
  const { prose, openAtEnd } = outsideFences(lines);
  const begins = [];
  const ends = [];
  let fencedMarkers = 0;
  for (const [index, line] of lines.entries()) {
    if (line.includes('effective-flow-scored-decisions:') && !prose.has(index)) {
      fencedMarkers += 1;
      continue;
    }
    if (line.trim() === MACHINE_BLOCK_BEGIN) begins.push(index);
    else if (line.trim() === MACHINE_BLOCK_END) ends.push(index);
    else if (line.includes('effective-flow-scored-decisions:')) {
      blockInvalid(`line ${index + 1} carries a malformed machine-block marker`);
    }
  }
  if (openAtEnd && fencedMarkers > 0) {
    blockInvalid(
      'a code fence is still open at the end of the plan and hides machine-block markers',
    );
  }
  if (begins.length === 0 && ends.length === 0) return { status: 'absent', records: [] };
  if (begins.length !== 1 || ends.length !== 1 || ends[0] < begins[0]) {
    blockInvalid('the plan must hold exactly one begin and one end marker, in that order');
  }
  const heading = lines.findLastIndex(
    (line, index) => index < begins[0] && prose.has(index) && /^## /.test(line),
  );
  const nextHeading = lines.findIndex(
    (line, index) => index > begins[0] && prose.has(index) && /^## /.test(line),
  );
  if (heading === -1 || !ASSUMPTION_HEADINGS.includes(lines[heading].trim())) {
    blockInvalid('the machine block must sit in the assumptions and open points section');
  }
  if (nextHeading !== -1 && nextHeading < ends[0]) {
    blockInvalid('the machine block must end inside the assumptions and open points section');
  }
  const inner = lines
    .slice(begins[0] + 1, ends[0])
    .join('\n')
    .trim();
  const fenced = inner.match(/^```json\n([\s\S]*)\n```$/);
  if (!fenced) blockInvalid('the machine block must hold exactly one ```json fence');
  let parsed;
  try {
    parsed = JSON.parse(fenced[1]);
  } catch {
    blockInvalid('the machine block is not valid JSON');
  }
  if (!Array.isArray(parsed)) blockInvalid('the machine block must hold a JSON array');
  if (parsed.length > DECISION_CAP) {
    blockInvalid(`the machine block holds more than ${DECISION_CAP} decisions`);
  }
  const records = parsed.map((entry, index) => {
    try {
      const { budgetRemaining: _unused, ...result } = classifyDecision(entry, DECISION_CAP);
      if (result.outcome === 'tie') {
        fail('TIE_UNRESOLVED', `record ${index} ties and carries no tie re-scores`);
      }
      // Only applied decisions belong in the block; a blocker is an open point, never a record.
      if (result.outcome === 'blocker') {
        fail('NOT_APPLIED', `record ${index} classifies as blocker ${result.blocker}`);
      }
      return { record: entry, result };
    } catch (error) {
      if (error instanceof AutopilotError) {
        blockInvalid(`record ${index} is invalid: ${error.message}`, { index, code: error.code });
      }
      throw error;
    }
  });
  return { status: 'valid', records };
}

async function extractOperation(input) {
  closed(input, [], ['planPath', 'text'], 'input');
  if ((input.planPath === undefined) === (input.text === undefined)) {
    invalid('exactly one of planPath and text is required');
  }
  let bytes;
  if (input.planPath !== undefined) {
    text(input.planPath, 'planPath', LIMITS.path);
    if (!path.isAbsolute(input.planPath)) invalid('planPath must be absolute');
    bytes = await readBoundedRegular(input.planPath, MAX_PLAN_BYTES, 'planPath');
  } else {
    if (typeof input.text !== 'string') invalid('text must be a string');
    bytes = Buffer.from(input.text, 'utf8');
    if (bytes.length > MAX_PLAN_BYTES)
      fail('INPUT_TOO_LARGE', `text exceeds ${MAX_PLAN_BYTES} bytes`);
  }
  let planText;
  try {
    planText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('INVALID_CONTENT', 'the plan is not valid UTF-8');
  }
  return { sha256: sha256(bytes), ...extractDecisions(planText) };
}

// ---------------------------------------------------------------------------------------------
// Ledger

function context(deps) {
  return { runner: deps.runner, env: gitBaseEnv(deps.env ?? process.env) };
}

function requireRunner(deps) {
  if (typeof deps.runner !== 'function') fail('INTERNAL', 'no process runner injected');
}

async function rootContext(input, deps) {
  requireRunner(deps);
  if (typeof input.cwd !== 'string' || !path.isAbsolute(input.cwd)) {
    invalid('cwd must be an absolute path');
  }
  const ctx = context(deps);
  await resolveRuntimeRoot(ctx, input.cwd);
  return ctx;
}

function runDirectory(ctx, runId) {
  return path.join(ctx.cwd, AUTOPILOT_DIR, runId);
}

function timestamp(deps) {
  return new Date((deps.now ?? Date.now)()).toISOString();
}

function mintRunId(deps) {
  const iso = timestamp(deps);
  const compact = `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
  const suffix = (deps.randomHex ?? (() => randomBytes(4).toString('hex')))();
  return `ap-${compact}-${suffix}`;
}

async function readLedger(ctx, runId) {
  const directory = runDirectory(ctx, runId);
  const present = await assertDirectoryChain(ctx.cwd, directory, { allowMissing: true });
  if (!present) return null;
  const target = path.join(directory, LEDGER_FILE);
  let bytes;
  try {
    bytes = await readBoundedRegular(target, MAX_LEDGER_BYTES, 'the run ledger');
  } catch (error) {
    if (error instanceof AutopilotError && error.code === 'NOT_FOUND') return null;
    throw error;
  }
  let ledger;
  try {
    ledger = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('LEDGER_INVALID', 'the run ledger is not valid JSON');
  }
  if (
    !isObject(ledger) ||
    ledger.schemaVersion !== LEDGER_SCHEMA_VERSION ||
    ledger.runId !== runId ||
    !Array.isArray(ledger.decisions) ||
    !Array.isArray(ledger.blockers)
  ) {
    fail('LEDGER_INVALID', 'the run ledger does not match its schema');
  }
  return ledger;
}

async function openLedger(ctx, runId) {
  const ledger = await readLedger(ctx, runId);
  if (ledger === null) fail('RUN_NOT_FOUND', `no ledger for run ${runId}`);
  if (ledger.status !== 'open') fail('RUN_CLOSED', `run ${runId} is closed`);
  return ledger;
}

async function writeLedger(ctx, ledger) {
  const target = path.join(runDirectory(ctx, ledger.runId), LEDGER_FILE);
  await atomicWrite(ctx, target, `${JSON.stringify(ledger, null, 2)}\n`);
}

function usedBudget(ledger) {
  return ledger.decisions.length;
}

function requireSource(value) {
  if (!isObject(value)) invalid('source must be a JSON object');
  if (value.kind === 'issue') {
    closed(value, ['kind', 'issue', 'repository'], [], 'source');
    positiveInteger(value.issue, 'source.issue');
    if (typeof value.repository !== 'string' || !REPOSITORY.test(value.repository)) {
      invalid('source.repository must be <host>/<owner>/<name> in lower case');
    }
    return { kind: 'issue', issue: value.issue, repository: value.repository };
  }
  if (value.kind === 'plan') {
    closed(value, ['kind', 'planPath', 'planSha256'], [], 'source');
    relativePath(value.planPath, 'source.planPath');
    if (!value.planPath.endsWith('.md')) invalid('source.planPath must name a Markdown plan');
    if (typeof value.planSha256 !== 'string' || !SHA256.test(value.planSha256)) {
      invalid('source.planSha256 must be a lowercase SHA-256 hex digest');
    }
    return { kind: 'plan', planPath: value.planPath, planSha256: value.planSha256 };
  }
  invalid('source.kind must be issue or plan');
}

// ---------------------------------------------------------------------------------------------
// Planning claim of an issue source

// The planning-claim target of an issue source: its `<host>/<owner>/<name>` repository as the
// forge identity `repository-resolve` returns, so the claim key equals the one Issue Buddy and
// `plan-issue` derive for the same issue.
function claimTarget(source) {
  const [host, owner, repository] = source.repository.split('/');
  return { kind: 'forge', host, owner, repository };
}

// The holder a CLAIMED outcome names, never its token: workflow, run or pass id, age, stale flag
// and liveness, or the invalid record's reason.
function claimHolder(details) {
  if (details.state !== 'valid') return { state: 'invalid', reason: details.reason };
  const holder = { workflow: details.workflow };
  for (const key of ['runId', 'passId']) {
    if (details[key] !== undefined) holder[key] = details[key];
  }
  return {
    ...holder,
    acquiredAt: details.acquiredAt,
    ageMs: details.ageMs,
    stale: details.stale,
    liveness: details.liveness,
  };
}

// Takes the claim of an issue source for `runId`. Returns the internal ledger field
// `{claimId, targetKey, issueKey, acquiredAt}`; a held claim fails ISSUE_CLAIMED, a legacy pass
// lock LEGACY_PASS_LOCK, both before any write of this run.
async function acquireRunClaim(ctx, source, runId, deps) {
  const acquired = await planningClaimAcquire(
    {
      cwd: ctx.cwd,
      target: claimTarget(source),
      issue: source.issue,
      workflow: 'autopilot',
      runId,
    },
    deps,
  );
  if (acquired instanceof StateOutcome) {
    if (acquired.code === 'LEGACY_PASS_LOCK') {
      fail(
        'LEGACY_PASS_LOCK',
        `a legacy Issue Buddy pass lock exists at ${acquired.details.path}; inspect and remove it before planning`,
        { path: acquired.details.path },
      );
    }
    fail('ISSUE_CLAIMED', `issue #${source.issue} is already claimed for planning`, {
      issue: source.issue,
      repository: source.repository,
      holder: claimHolder(acquired.details),
    });
  }
  return {
    claimId: acquired.claimId,
    targetKey: acquired.targetKey,
    issueKey: acquired.issueKey,
    acquiredAt: acquired.acquiredAt,
  };
}

// Releases the claim a ledger holds, token from its internal field. Returns `null` for a ledger
// without one (a plan source or a ledger written before claims), else the reported release:
// `{targetKey, issueKey, released: true}`, `{..., released: false, reason: 'missing'}` (already
// released or pruned), `{..., released: false, reason: 'not-owner', detail}` (the record is no
// longer this run's) or `{..., released: false, reason: 'release-failed', code, message}`. A
// failure never keeps the ledger open: `cleanup` prunes the claim of a closed ledger.
async function releaseRunClaim(ctx, ledger, deps) {
  const claim = ledger.planningClaim;
  if (!isObject(claim) || ledger.source?.kind !== 'issue') return null;
  const names = { targetKey: claim.targetKey, issueKey: claim.issueKey };
  try {
    const result = await planningClaimRelease(
      {
        cwd: ctx.cwd,
        target: claimTarget(ledger.source),
        issue: ledger.source.issue,
        claimId: claim.claimId,
      },
      deps,
    );
    if (result instanceof StateOutcome) {
      return { ...names, released: false, reason: 'not-owner', detail: result.details.reason };
    }
    return result.released
      ? { ...names, released: true }
      : { ...names, released: false, reason: 'missing' };
  } catch (error) {
    if (!(error instanceof RuntimeStateError || error instanceof AutopilotError)) throw error;
    return {
      ...names,
      released: false,
      reason: 'release-failed',
      code: error.code,
      message: error.message,
    };
  }
}

async function runInitOperation(input, deps) {
  closed(input, ['cwd', 'source', 'visibility', 'language'], [], 'input');
  const source = requireSource(input.source);
  oneOf(input.visibility, VISIBILITIES, 'visibility');
  oneOf(input.language, LANGUAGES, 'language');
  const ctx = await rootContext(input, deps);
  const runId = mintRunId(deps);
  // Claim, then ledger: a held claim creates no run directory and no ledger.
  const planningClaim =
    source.kind === 'issue' ? await acquireRunClaim(ctx, source, runId, deps) : null;
  try {
    await ensureGuardedDirectory(ctx, path.join(ctx.cwd, RUNTIME_STATE_DIR));
    await ensureGuardedDirectory(ctx, path.join(ctx.cwd, AUTOPILOT_DIR));
    const directory = runDirectory(ctx, runId);
    if (!(await guardedMkdir(ctx, directory))) fail('RUN_EXISTS', `run ${runId} already exists`);
    const ledger = {
      schemaVersion: LEDGER_SCHEMA_VERSION,
      runId,
      status: 'open',
      startedAt: timestamp(deps),
      source,
      visibility: input.visibility,
      language: input.language,
      budget: DECISION_CAP,
      decisions: [],
      blockers: [],
      fit: null,
      ...(planningClaim === null ? {} : { planningClaim }),
    };
    const created = await createNoClobber(
      ctx,
      path.join(directory, LEDGER_FILE),
      `${JSON.stringify(ledger, null, 2)}\n`,
      { tempPrefix: '.autopilot-' },
    );
    if (!created.created) fail('RUN_EXISTS', `run ${runId} already exists`);
    return { runId, ledgerDirectory: directory, budget: DECISION_CAP };
  } catch (error) {
    // No ledger holds the claim, so nothing could release it later: give it back now. A release
    // that fails as well never hides the original error: it is attached as `claimReleaseError`
    // (non-enumerable, so no envelope changes) and the original is rethrown; `cleanup` can still
    // prune the left claim once its ledger proves absent.
    if (planningClaim !== null) {
      try {
        await releaseRunClaim(ctx, { source, planningClaim }, deps);
      } catch (releaseError) {
        if (error !== null && typeof error === 'object' && Object.isExtensible(error)) {
          Object.defineProperty(error, 'claimReleaseError', {
            value: releaseError,
            configurable: true,
          });
        }
      }
    }
    throw error;
  }
}

// The fixed summary of a decision-cap blocker hit by a local-only decision: its question stays
// local, so the ledger keeps this neutral text and the appendix renders the neutral blocker copy.
const LOCAL_ONLY_CAP_SUMMARY = 'The scored-decision budget of this run was exhausted.';

function blockerEntry(kind, details, deps) {
  return { kind, ...details, recordedAt: timestamp(deps) };
}

// Every ledger change after a render makes that render stale: `appendix-merge` then refuses it
// until `pr-appendix` renders the current ledger again.
function withdrawAppendix(ledger) {
  delete ledger.appendixSha256;
}

async function decisionRecordOperation(input, deps) {
  closed(input, ['cwd', 'runId', 'record'], [], 'input');
  requireRunId(input.runId);
  const record = input.record;
  if (isObject(record) && Object.hasOwn(record, 'localOnly')) {
    closed(record, ['site', 'localOnly', 'classification'], [], 'record');
    if (typeof record.site !== 'string' || !SITE_ID.test(record.site)) {
      invalid('record.site is not a question-site id');
    }
    const reference = localOnlyReference(record.localOnly, 'record.localOnly');
    oneOf(record.classification, CLASSIFICATIONS, 'record.classification');
    const ctx = await rootContext(input, deps);
    const ledger = await openLedger(ctx, input.runId);
    if (usedBudget(ledger) >= ledger.budget) {
      ledger.blockers.push(
        blockerEntry(
          'decision-cap',
          { site: record.site, summary: LOCAL_ONLY_CAP_SUMMARY, localOnly: reference },
          deps,
        ),
      );
      withdrawAppendix(ledger);
      await writeLedger(ctx, ledger);
      return { recorded: false, outcome: 'blocker', blocker: 'decision-cap', budgetRemaining: 0 };
    }
    ledger.decisions.push({
      site: record.site,
      localOnly: reference,
      classification: record.classification,
      recordedAt: timestamp(deps),
    });
    withdrawAppendix(ledger);
    await writeLedger(ctx, ledger);
    return {
      recorded: true,
      outcome: 'decided',
      localOnly: true,
      budgetRemaining: ledger.budget - usedBudget(ledger),
    };
  }
  normalizeDecision(record, 'record');
  const ctx = await rootContext(input, deps);
  const ledger = await openLedger(ctx, input.runId);
  const result = classifyDecision(record, ledger.budget - usedBudget(ledger));
  if (result.outcome === 'tie') {
    fail('TIE_UNRESOLVED', 'the record ties and carries no tie re-scores', { tied: result.tied });
  }
  if (result.outcome === 'blocker') {
    ledger.blockers.push(
      blockerEntry(result.blocker, { site: record.site, summary: record.question }, deps),
    );
    withdrawAppendix(ledger);
    await writeLedger(ctx, ledger);
    return { recorded: false, ...result };
  }
  ledger.decisions.push({
    site: record.site,
    question: record.question,
    classification: result.classification,
    tieResolved: result.tieResolved,
    winner: result.winner,
    alternatives: result.alternatives,
    recordedAt: timestamp(deps),
  });
  withdrawAppendix(ledger);
  await writeLedger(ctx, ledger);
  return { recorded: true, ...result };
}

async function blockerRecordOperation(input, deps) {
  if (isObject(input) && input.kind === 'security') {
    closed(input, ['cwd', 'runId', 'kind', 'localOnly'], ['site'], 'input');
  } else if (isObject(input) && input.kind === WORKTREE_LOCATION_CONFLICT) {
    closed(input, ['cwd', 'runId', 'kind'], [], 'input');
  } else {
    closed(input, ['cwd', 'runId', 'kind', 'summary'], ['site'], 'input');
  }
  requireRunId(input.runId);
  oneOf(input.kind, BLOCKER_KINDS, 'kind');
  if (input.site !== undefined && (typeof input.site !== 'string' || !SITE_ID.test(input.site))) {
    invalid('site is not a question-site id');
  }
  if (input.site === undefined && SITE_REQUIRED_KINDS.includes(input.kind)) {
    invalid(`site is required for a ${input.kind} blocker`);
  }
  const details = input.site === undefined ? {} : { site: input.site };
  if (input.kind === 'security')
    details.localOnly = localOnlyReference(input.localOnly, 'localOnly');
  else if (input.kind !== WORKTREE_LOCATION_CONFLICT)
    details.summary = text(input.summary, 'summary', LIMITS.summary);
  const ctx = await rootContext(input, deps);
  const ledger = await openLedger(ctx, input.runId);
  ledger.blockers.push(blockerEntry(input.kind, details, deps));
  withdrawAppendix(ledger);
  await writeLedger(ctx, ledger);
  return { recorded: true, blockers: ledger.blockers.length };
}

function fitSources(value, emptyHint) {
  if (!Array.isArray(value) || value.length === 0) {
    invalid(`sources must list at least one repository source; ${emptyHint}`);
  }
  if (value.length > LIMITS.sources) invalid(`sources exceeds ${LIMITS.sources} entries`);
  value.forEach((entry, index) => relativePath(entry, `sources[${index}]`));
  return [...new Set(value)];
}

// Three forms: a score with reason and sources; `notAssessed` when no architecture or roadmap
// source exists; `unavailable` when scoring could not produce a score. The `unavailable` fallback
// takes no source list, so it can never exceed the source limit or turn into a blocker.
async function fitRecordOperation(input, deps) {
  if (isObject(input) && input.notAssessed === true) {
    closed(input, ['cwd', 'runId', 'notAssessed'], [], 'input');
  } else if (isObject(input) && input.unavailable === true) {
    closed(input, ['cwd', 'runId', 'unavailable'], [], 'input');
  } else {
    closed(input, ['cwd', 'runId', 'score', 'reason', 'sources'], [], 'input');
    if (!Number.isInteger(input.score) || input.score < SCORE_MIN || input.score > SCORE_MAX) {
      fail('INVALID_SCORE', `score must be an integer from ${SCORE_MIN} to ${SCORE_MAX}`);
    }
    text(input.reason, 'reason', LIMITS.reason);
    fitSources(input.sources, 'use notAssessed without any');
  }
  requireRunId(input.runId);
  const ctx = await rootContext(input, deps);
  const ledger = await openLedger(ctx, input.runId);
  if (input.notAssessed) ledger.fit = { assessed: false, recordedAt: timestamp(deps) };
  else if (input.unavailable) {
    ledger.fit = { assessed: false, unavailable: true, recordedAt: timestamp(deps) };
  } else {
    ledger.fit = {
      assessed: true,
      score: input.score,
      reason: input.reason,
      sources: [...new Set(input.sources)],
      recordedAt: timestamp(deps),
    };
  }
  withdrawAppendix(ledger);
  await writeLedger(ctx, ledger);
  const { recordedAt: _recordedAt, ...fit } = ledger.fit;
  return { recorded: true, fit };
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) invalid(`${label} must be a non-negative integer`);
  return value;
}

function objectId(value, label) {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    invalid(`${label} must be a full lowercase Git object id`);
  }
  return value;
}

const BASE_MOVE_FIELDS = Object.freeze([
  'fromBaseOid',
  'toBaseOid',
  'verdict',
  'reason',
  'commitCount',
  'changedPathCount',
  'citedPathCount',
  'citedPaths',
  'overlappingPaths',
]);

// After a confirmed plan pull request on an issue source: the base move Issue Buddy's
// `assess-base-move` reported, from the pass report's `baseMoves` entry. Only a re-publishing move
// sits beside a confirmed PR, so a stopping reason is INVALID_INPUT; a `fits` move has `reason:
// null` and no overlapping path. A run keeps at most one: an identical repeat returns `recorded:
// true` without a write, a different one is INVALID_STATE. `citedPaths` holds at most
// `LIMITS.sources` of the `citedPathCount` cited paths, `overlappingPaths` the assessment's bound.
async function baseMoveRecordOperation(input, deps) {
  closed(input, ['cwd', 'runId', ...BASE_MOVE_FIELDS], [], 'input');
  requireRunId(input.runId);
  objectId(input.fromBaseOid, 'fromBaseOid');
  objectId(input.toBaseOid, 'toBaseOid');
  if (!BASE_MOVE_VERDICTS.includes(input.verdict)) {
    invalid(`verdict must be one of ${BASE_MOVE_VERDICTS.join(', ')}`);
  }
  if (!BASE_MOVE_REASONS[input.verdict].includes(input.reason)) {
    invalid(`reason does not belong to the ${input.verdict} verdict`);
  }
  if (!baseMoveRepublishes(input.reason)) {
    invalid(`reason ${input.reason} stops the publication, so no pull request carries the move`);
  }
  nonNegativeInteger(input.commitCount, 'commitCount');
  nonNegativeInteger(input.changedPathCount, 'changedPathCount');
  nonNegativeInteger(input.citedPathCount, 'citedPathCount');
  if (!Array.isArray(input.citedPaths)) invalid('citedPaths must be an array');
  if (input.citedPaths.length > LIMITS.sources) {
    invalid(`citedPaths exceeds ${LIMITS.sources} entries`);
  }
  input.citedPaths.forEach((entry, index) => relativePath(entry, `citedPaths[${index}]`));
  if (input.citedPaths.length > input.citedPathCount) {
    invalid('citedPaths lists more paths than citedPathCount');
  }
  if (!Array.isArray(input.overlappingPaths)) invalid('overlappingPaths must be an array');
  if (input.overlappingPaths.length > MAX_BASE_MOVE_PATHS) {
    invalid(`overlappingPaths exceeds ${MAX_BASE_MOVE_PATHS} entries`);
  }
  input.overlappingPaths.forEach((entry, index) =>
    relativePath(entry, `overlappingPaths[${index}]`),
  );
  if (input.verdict === 'fits' && input.overlappingPaths.length > 0) {
    invalid('a fitting base move lists no overlapping path');
  }
  const record = Object.fromEntries(BASE_MOVE_FIELDS.map((key) => [key, input[key]]));
  const ctx = await rootContext(input, deps);
  const ledger = await openLedger(ctx, input.runId);
  if (ledger.source?.kind !== 'issue') invalid('base-move-record requires an issue source');
  const stored = storedBaseMove(ledger);
  if (stored !== null) {
    if (!isDeepStrictEqual(stored, record)) {
      fail('INVALID_STATE', 'this run already recorded a different base move');
    }
    return { recorded: true, baseMove: stored };
  }
  ledger.baseMove = { ...record, recordedAt: timestamp(deps) };
  withdrawAppendix(ledger);
  await writeLedger(ctx, ledger);
  return { recorded: true, baseMove: record };
}

// The recorded base move without its timestamp, or `null` when none was recorded.
function storedBaseMove(ledger) {
  if (!isObject(ledger.baseMove)) return null;
  const { recordedAt: _recordedAt, ...baseMove } = ledger.baseMove;
  return baseMove;
}

// ---------------------------------------------------------------------------------------------
// Delivery base: autopilot's one pre-delivery check of the base and its single conflict attempt

// The results a delivery-base record states: no conflict, a conflict resolved by one merge commit,
// a conflict left unresolved with the branch unchanged, or a merge that could not be checked.
export const DELIVERY_BASE_RESULTS = Object.freeze(['none', 'resolved', 'unresolved', 'unchecked']);
// Why a conflict stayed unresolved: `mergeGate.conflictResolution` is `off` (or unreadable), no
// clean checkout was available, the attempt's checkout location is forbidden
// (`worktree-location-conflict`, which at this step records no blocker), or the one attempt failed
// at its resolver, verification, review or merge.
export const DELIVERY_BASE_UNRESOLVED_REASONS = Object.freeze([
  'conflict-resolution-off',
  'checkout-unavailable',
  'worktree-location-conflict',
  'resolver-abort',
  'verification-failed',
  'review-failed',
  'merge-failed',
]);
// The unresolved reasons of an attempt that never had a checkout.
const NO_CHECKOUT_REASONS = Object.freeze(['checkout-unavailable', 'worktree-location-conflict']);
export const DELIVERY_CONFLICT_RESOLUTION_MODES = Object.freeze(['off', 'ask', 'auto']);
export const DELIVERY_VALIDATION_MODES = Object.freeze(['full', 'quick']);
const DELIVERY_BASE_FIELDS = Object.freeze([
  'mergeBaseOid',
  'baseOid',
  'commitCount',
  'result',
  'reason',
  'conflictResolution',
  'validationMode',
  'conflictCount',
  'conflictedPaths',
  'headOid',
  'mergeOid',
  'checkout',
  'branch',
]);

// A Git read for the delivery-base operations: GIT_FAILED instead of GitReadFailure.
async function deliveryGit(ctx, root, args, options) {
  try {
    return await readGit(ctx, root, args, options);
  } catch (error) {
    if (error instanceof GitReadFailure) fail('GIT_FAILED', error.message);
    throw error;
  }
}

// The commit `rev` names in `root`, or `null` when it names none.
async function deliveryCommit(ctx, root, rev) {
  const result = await deliveryGit(
    ctx,
    root,
    ['--no-replace-objects', 'rev-parse', '--verify', '-q', `${rev}^{commit}`],
    { allowed: [0, 1] },
  );
  const oid = result.stdout.toString('utf8').trim().toLowerCase();
  if (result.status === 1) return null;
  if (!OBJECT_ID.test(oid)) fail('GIT_FAILED', 'git rev-parse printed no commit');
  return oid;
}

// Reads only, fetches nothing: whether `origin/<baseRef>` (fetched by the caller) moved past the
// head's merge base, and for a moved base the local merge proof of `pr-delivery-git-core.mjs`.
// Input `{cwd, runId, headOid, baseRef}` with an open run; `baseRef` is the base branch name.
// Returns `{moved, mergeBaseOid, baseOid, commitCount, proof, reason, conflictCount,
// conflictedPaths}`: an unmoved base (`origin/<baseRef>` an ancestor of the head) has
// `commitCount: 0` and null proof fields; a moved one carries the proof's `status` as `proof`
// (`clean`, `conflict` or `unavailable`) with its `reason`, `conflictCount` and `conflictedPaths`.
// A missing base ref or head, no merge base, or a failed Git read is GIT_FAILED.
async function deliveryBaseCheckOperation(input, deps) {
  closed(input, ['cwd', 'runId', 'headOid', 'baseRef'], [], 'input');
  requireRunId(input.runId);
  objectId(input.headOid, 'headOid');
  try {
    parseRangeInput({ cwd: input.cwd, headSha: input.headOid, baseRef: input.baseRef });
  } catch (error) {
    if (error instanceof PrDeliveryGitError) invalid(error.message);
    throw error;
  }
  const ctx = await rootContext(input, deps);
  await openLedger(ctx, input.runId);
  const root = ctx.cwd;
  const baseOid = await deliveryCommit(ctx, root, `refs/remotes/origin/${input.baseRef}`);
  if (baseOid === null) fail('GIT_FAILED', `origin/${input.baseRef} names no commit`);
  if ((await deliveryCommit(ctx, root, input.headOid)) !== input.headOid) {
    fail('GIT_FAILED', 'headOid names no commit in the repository');
  }
  const base = await deliveryGit(
    ctx,
    root,
    ['--no-replace-objects', 'merge-base', baseOid, input.headOid],
    { allowed: [0, 1] },
  );
  const mergeBaseOid = base.stdout.toString('utf8').trim().toLowerCase();
  if (base.status === 1) fail('GIT_FAILED', 'the head shares no history with the base');
  if (!OBJECT_ID.test(mergeBaseOid)) fail('GIT_FAILED', 'git merge-base printed no commit');
  const unproven = { proof: null, reason: null, conflictCount: null, conflictedPaths: null };
  if (mergeBaseOid === baseOid) {
    return { moved: false, mergeBaseOid, baseOid, commitCount: 0, ...unproven };
  }
  const count = await deliveryGit(ctx, root, [
    '--no-replace-objects',
    'rev-list',
    '--count',
    `${mergeBaseOid}..${baseOid}`,
  ]);
  const commitCount = Number(count.stdout.toString('utf8').trim());
  if (!Number.isSafeInteger(commitCount) || commitCount < 1) {
    fail('GIT_FAILED', 'git rev-list printed no commit count');
  }
  const proof = await localMergeProof(
    { cwd: root, headSha: input.headOid, baseRef: input.baseRef },
    { runner: deps.runner, env: deps.env, tmpdir: deps.tmpdir },
  );
  if (proof.baseCommit !== null && proof.baseCommit !== baseOid) {
    fail('GIT_FAILED', `origin/${input.baseRef} moved during the check`);
  }
  return {
    moved: true,
    mergeBaseOid,
    baseOid,
    commitCount,
    proof: proof.status,
    reason: proof.reason,
    conflictCount: proof.conflictCount,
    conflictedPaths: proof.conflictedPaths,
  };
}

function nullField(value, label) {
  if (value !== null) invalid(`${label} must be null for this result`);
}

function conflictedPathList(value, conflictCount) {
  if (!Array.isArray(value)) invalid('conflictedPaths must be an array');
  if (value.length > MAX_CONFLICTED_PATHS) {
    invalid(`conflictedPaths exceeds ${MAX_CONFLICTED_PATHS} entries`);
  }
  value.forEach((entry, index) => relativePath(entry, `conflictedPaths[${index}]`));
  if (new Set(value).size !== value.length) invalid('conflictedPaths repeats a path');
  if (value.length > conflictCount) invalid('conflictedPaths lists more paths than conflictCount');
}

// The closed record schema, per result. Every field is present; a field the result does not use is
// null. `none`: a clean proof (`conflictCount: 0`, `conflictedPaths: []`). `unchecked`: an
// unavailable proof, `reason` one of MERGE_PROOF_UNAVAILABLE_REASONS. `resolved`: `ask` or `auto`,
// a validation mode, `mergeOid` and `checkout`. `unresolved`: a reason of
// DELIVERY_BASE_UNRESOLVED_REASONS; `conflict-resolution-off` pairs with `off` and no checkout,
// `checkout-unavailable` and `worktree-location-conflict` name no checkout either, every other
// reason names the checkout of the attempt.
// `branch`, the delivery branch, is set exactly when `checkout` is.
function validateDeliveryBase(input) {
  objectId(input.mergeBaseOid, 'mergeBaseOid');
  objectId(input.baseOid, 'baseOid');
  objectId(input.headOid, 'headOid');
  if (input.mergeBaseOid === input.baseOid) invalid('a delivery-base record needs a moved base');
  positiveInteger(input.commitCount, 'commitCount');
  oneOf(input.result, DELIVERY_BASE_RESULTS, 'result');
  if (input.result === 'none' || input.result === 'unchecked') {
    for (const key of ['conflictResolution', 'validationMode', 'mergeOid', 'checkout', 'branch']) {
      nullField(input[key], key);
    }
    if (input.result === 'none') {
      nullField(input.reason, 'reason');
      if (input.conflictCount !== 0) invalid('conflictCount must be 0 for result none');
      if (!Array.isArray(input.conflictedPaths) || input.conflictedPaths.length !== 0) {
        invalid('conflictedPaths must be [] for result none');
      }
    } else {
      oneOf(input.reason, MERGE_PROOF_UNAVAILABLE_REASONS, 'reason');
      nullField(input.conflictCount, 'conflictCount');
      nullField(input.conflictedPaths, 'conflictedPaths');
    }
    return;
  }
  positiveInteger(input.conflictCount, 'conflictCount');
  conflictedPathList(input.conflictedPaths, input.conflictCount);
  oneOf(input.conflictResolution, DELIVERY_CONFLICT_RESOLUTION_MODES, 'conflictResolution');
  if (input.validationMode !== null) {
    oneOf(input.validationMode, DELIVERY_VALIDATION_MODES, 'validationMode');
  }
  if (input.result === 'resolved') {
    nullField(input.reason, 'reason');
    if (input.conflictResolution === 'off') invalid('conflictResolution off resolves nothing');
    if (input.validationMode === null) invalid('a resolved conflict names its validationMode');
    objectId(input.mergeOid, 'mergeOid');
    requireAbsoluteSourceRoot(input.checkout, 'checkout');
    deliveryBranch(input.branch);
    return;
  }
  oneOf(input.reason, DELIVERY_BASE_UNRESOLVED_REASONS, 'reason');
  nullField(input.mergeOid, 'mergeOid');
  const off = input.reason === 'conflict-resolution-off';
  if (off !== (input.conflictResolution === 'off')) {
    invalid('reason conflict-resolution-off pairs exactly with conflictResolution off');
  }
  if (off || NO_CHECKOUT_REASONS.includes(input.reason)) {
    nullField(input.checkout, 'checkout');
    nullField(input.branch, 'branch');
    if (off) nullField(input.validationMode, 'validationMode');
    return;
  }
  requireAbsoluteSourceRoot(input.checkout, 'checkout');
  deliveryBranch(input.branch);
}

// The delivery branch a record with a checkout names: a safe local branch name (`feature/x`, never
// `refs/heads/feature/x`), so `refs/heads/<branch>` is the one ref the checkout must be on.
function deliveryBranch(value) {
  if (!isSafeBaseRef(value)) invalid('branch must be a safe local branch name');
}

function invariantFailed(invariant, message) {
  fail('INVARIANT_FAILED', message, { invariant });
}

// The Git invariants of a record that names a checkout: the checkout is on `refs/heads/<branch>`,
// no merge is in progress there, no tracked or untracked change survives the commit or abort, and
// the branch tip is `mergeOid` with exactly the parents
// `[headOid, baseOid]` (`resolved`) or still `headOid` (`unresolved`).
async function verifyDeliveryCheckout(ctx, record) {
  let root;
  try {
    root = await requireSourceRoot(ctx, record.checkout, 'checkout');
  } catch (error) {
    if (error instanceof GitReadFailure) fail('GIT_FAILED', error.message);
    throw error;
  }
  const branch = await deliveryGit(ctx, root, ['symbolic-ref', '-q', 'HEAD'], {
    allowed: [0, 1],
  });
  if (branch.status !== 0) invariantFailed('detached-head', 'the checkout is not on a branch');
  if (branch.stdout.toString('utf8').trim() !== `refs/heads/${record.branch}`) {
    invariantFailed('wrong-branch', `the checkout is not on branch ${record.branch}`);
  }
  const merging = await deliveryGit(ctx, root, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], {
    allowed: [0, 1],
  });
  if (merging.status === 0) {
    invariantFailed('merge-in-progress', 'the checkout still has a merge in progress');
  }
  const status = await deliveryGit(ctx, root, [
    'status',
    '--porcelain',
    '-z',
    '--untracked-files=all',
  ]);
  if (status.stdout.length > 0) {
    invariantFailed('dirty-checkout', 'the checkout has uncommitted or untracked changes');
  }
  const tip = await deliveryCommit(ctx, root, 'HEAD');
  if (record.result === 'unresolved') {
    if (tip !== record.headOid) {
      invariantFailed('branch-tip', 'the checkout branch no longer points at headOid');
    }
    return;
  }
  if (tip !== record.mergeOid) {
    invariantFailed('branch-tip', 'the checkout branch tip is not mergeOid');
  }
  const parents = await deliveryGit(ctx, root, [
    '--no-replace-objects',
    'rev-list',
    '--parents',
    '-n',
    '1',
    record.mergeOid,
  ]);
  const listed = parents.stdout.toString('utf8').trim().toLowerCase().split(/\s+/);
  if (!isDeepStrictEqual(listed, [record.mergeOid, record.headOid, record.baseOid])) {
    invariantFailed(
      'merge-parents',
      'mergeOid is not one merge commit with exactly the parents headOid and baseOid',
    );
  }
}

// After `delivery-base-check` reported a moved base, on either source: the result of the step. A
// run keeps at most one record; an identical repeat returns `recorded: true` without a write, a
// different one is INVALID_STATE. A record naming a checkout is verified with Git first; a failed
// invariant is INVARIANT_FAILED with `details.invariant`. A write withdraws the appendix digest.
async function deliveryBaseRecordOperation(input, deps) {
  closed(input, ['cwd', 'runId', ...DELIVERY_BASE_FIELDS], [], 'input');
  requireRunId(input.runId);
  validateDeliveryBase(input);
  const record = Object.fromEntries(DELIVERY_BASE_FIELDS.map((key) => [key, input[key]]));
  const ctx = await rootContext(input, deps);
  const ledger = await openLedger(ctx, input.runId);
  const stored = storedDeliveryBase(ledger);
  if (stored !== null) {
    if (!isDeepStrictEqual(stored, record)) {
      fail('INVALID_STATE', 'this run already recorded a different delivery base');
    }
    return { recorded: true, deliveryBase: stored };
  }
  if (record.checkout !== null) await verifyDeliveryCheckout(ctx, record);
  ledger.deliveryBase = { ...record, recordedAt: timestamp(deps) };
  withdrawAppendix(ledger);
  await writeLedger(ctx, ledger);
  return { recorded: true, deliveryBase: record };
}

// The resolved merge commit `mergeOid` is `headOid` or one of its ancestors in the primary
// checkout's repository; a head the repository does not hold proves nothing and is refused too.
async function requireMergeDelivered(ctx, mergeOid, headOid) {
  const root = ctx.cwd;
  if ((await deliveryCommit(ctx, root, headOid)) !== headOid) {
    fail('MERGE_NOT_DELIVERED', 'the pushed head names no commit in the repository');
  }
  const ancestor = await deliveryGit(
    ctx,
    root,
    ['--no-replace-objects', 'merge-base', '--is-ancestor', mergeOid, headOid],
    { allowed: [0, 1] },
  );
  if (ancestor.status !== 0) {
    fail('MERGE_NOT_DELIVERED', 'the pushed head does not contain the resolved merge commit');
  }
}

// The recorded delivery base without its timestamp, or `null` when none was recorded.
function storedDeliveryBase(ledger) {
  if (!isObject(ledger.deliveryBase)) return null;
  const { recordedAt: _recordedAt, ...deliveryBase } = ledger.deliveryBase;
  return deliveryBase;
}

// The plan file below `root` at a repository-relative path, read with the bounded no-follow
// regular-file read after proving that every parent component is a real directory. Returns
// `{ state: 'file', bytes, sha256 }`, `{ state: 'missing' }` or `{ state: 'unsafe', code }`.
async function readPlanFile(root, relative) {
  const target = path.join(root, ...relative.split('/'));
  try {
    if (!(await assertDirectoryChain(root, path.dirname(target), { allowMissing: true }))) {
      return { state: 'missing' };
    }
    const bytes = await readBoundedRegular(target, MAX_PLAN_BYTES, 'the plan');
    return { state: 'file', bytes, sha256: sha256(bytes) };
  } catch (error) {
    if (error instanceof AutopilotError && error.code === 'NOT_FOUND') return { state: 'missing' };
    if (error instanceof AutopilotError || error instanceof RuntimeStateError) {
      return { state: 'unsafe', code: error.code };
    }
    throw error;
  }
}

function requirePlanSource(ledger, operation) {
  if (ledger.source?.kind !== 'plan') invalid(`${operation} requires a plan source`);
  return ledger.source;
}

// After plan review: the helper hashes the reviewed plan at `source.planPath` below the invocation
// checkout `sourceRoot` itself (which differs from `cwd` in a harness worktree session) and stores
// the digest as `source.reviewedPlanSha256` with that checkout's physical toplevel as
// `source.sourceRoot`, so no model-computed hash enters the ledger and the carry-over and the
// restore act on the reviewed copy. A later call replaces both, but only before any delivery
// record: afterwards the delivered head carries the reviewed text, and a new digest would let the
// restore discard an edit made after delivery (INVALID_STATE).
async function planReviewedOperation(input, deps) {
  closed(input, ['cwd', 'runId', 'sourceRoot'], [], 'input');
  requireRunId(input.runId);
  const ctx = await rootContext(input, deps);
  const ledger = await openLedger(ctx, input.runId);
  const source = requirePlanSource(ledger, 'plan-reviewed');
  if (ledger.delivery !== undefined) {
    fail('INVALID_STATE', 'plan-reviewed is not allowed once a delivery is recorded');
  }
  let root;
  try {
    root = await requireSourceRoot(ctx, input.sourceRoot);
  } catch (error) {
    if (error instanceof GitReadFailure) fail('GIT_FAILED', error.message);
    throw error;
  }
  const plan = await readPlanFile(root, source.planPath);
  if (plan.state === 'missing') fail('NOT_FOUND', 'the reviewed plan does not exist');
  if (plan.state === 'unsafe') {
    fail(plan.code, 'the reviewed plan is not a bounded regular file below sourceRoot');
  }
  source.reviewedPlanSha256 = plan.sha256;
  source.sourceRoot = root;
  withdrawAppendix(ledger);
  await writeLedger(ctx, ledger);
  return { recorded: true, reviewedPlanSha256: plan.sha256, sourceRoot: root };
}

// The archive-path rule lives in `pr-delivery-git-core.mjs`, which the plan-only evidence shares;
// it stays exported here for existing importers.
export { archivePathFor };

// After the handback commit and before `pr-appendix`: the delivered plan state, either the
// archive path or an unarchived delivery. A new record replaces an earlier one, including its
// confirmed head, because it describes a new delivery.
async function deliveryRecordOperation(input, deps) {
  if (isObject(input) && Object.hasOwn(input, 'unarchived')) {
    closed(input, ['cwd', 'runId', 'unarchived'], [], 'input');
    if (input.unarchived !== true) invalid('unarchived must be true');
  } else {
    closed(input, ['cwd', 'runId', 'archivePath'], [], 'input');
    relativePath(input.archivePath, 'archivePath');
  }
  requireRunId(input.runId);
  const ctx = await rootContext(input, deps);
  const ledger = await openLedger(ctx, input.runId);
  const source = requirePlanSource(ledger, 'delivery-record');
  if (input.archivePath !== undefined && input.archivePath !== archivePathFor(source.planPath)) {
    invalid(`archivePath must be ${archivePathFor(source.planPath)}`);
  }
  ledger.delivery =
    input.archivePath === undefined
      ? { unarchived: true, recordedAt: timestamp(deps) }
      : { archivePath: input.archivePath, recordedAt: timestamp(deps) };
  withdrawAppendix(ledger);
  await writeLedger(ctx, ledger);
  const { recordedAt: _recordedAt, ...delivery } = ledger.delivery;
  return { recorded: true, delivery };
}

// After `pr` returned a verified pushed head: records that head. It changes nothing the appendix
// renders, so it keeps a rendered appendix mergeable. After a `resolved` delivery base the pushed
// head must be the recorded merge commit or a descendant of it, else MERGE_NOT_DELIVERED and nothing
// is written: a push that dropped the merge commit never counts as delivered.
async function confirmDeliveryOperation(input, deps) {
  closed(input, ['cwd', 'runId', 'headOid'], [], 'input');
  requireRunId(input.runId);
  if (typeof input.headOid !== 'string' || !OBJECT_ID.test(input.headOid)) {
    invalid('headOid must be a full lowercase Git object id');
  }
  const ctx = await rootContext(input, deps);
  const ledger = await openLedger(ctx, input.runId);
  if (isObject(ledger.deliveryBase) && ledger.deliveryBase.result === 'resolved') {
    await requireMergeDelivered(ctx, ledger.deliveryBase.mergeOid, input.headOid);
  }
  ledger.delivery = {
    ...(isObject(ledger.delivery) ? ledger.delivery : {}),
    headOid: input.headOid,
    confirmedAt: timestamp(deps),
  };
  await writeLedger(ctx, ledger);
  return { recorded: true, headOid: input.headOid };
}

async function consentCheckOperation(input, deps) {
  closed(input, ['cwd', 'runId', 'issue', 'repository'], [], 'input');
  requireRunId(input.runId);
  positiveInteger(input.issue, 'issue');
  if (typeof input.repository !== 'string' || !REPOSITORY.test(input.repository)) {
    invalid('repository must be <host>/<owner>/<name> in lower case');
  }
  const ctx = await rootContext(input, deps);
  const ledger = await readLedger(ctx, input.runId);
  if (ledger === null) return { consent: 'refused', reason: 'no-ledger' };
  if (ledger.status !== 'open') return { consent: 'refused', reason: 'run-closed' };
  const { source } = ledger;
  if (
    source?.kind !== 'issue' ||
    source.issue !== input.issue ||
    source.repository !== input.repository
  ) {
    return { consent: 'refused', reason: 'wrong-source' };
  }
  // The consent line is a private-publication consent: a ledger that recorded any other
  // visibility never grants it.
  if (ledger.visibility !== 'private') return { consent: 'refused', reason: 'wrong-visibility' };
  return { consent: 'granted', runId: ledger.runId };
}

// Reads only: an open ledger for the run id. A malformed run id, a missing ledger and a closed run
// are all RUN_NOT_OPEN, so a downstream tool handed an `Autopilot run:` line can fail closed.
async function runCheckOperation(input, deps) {
  closed(input, ['cwd', 'runId'], [], 'input');
  if (typeof input.runId !== 'string' || !RUN_ID.test(input.runId)) {
    fail('RUN_NOT_OPEN', 'runId is not an autopilot run id');
  }
  const ctx = await rootContext(input, deps);
  const ledger = await readLedger(ctx, input.runId);
  if (ledger === null) fail('RUN_NOT_OPEN', `no ledger for run ${input.runId}`);
  if (ledger.status !== 'open') fail('RUN_NOT_OPEN', `run ${input.runId} is closed`);
  return { runId: ledger.runId, status: 'open', source: ledger.source };
}

function counts(ledger) {
  const visible = ledger.decisions.filter((entry) => !entry.localOnly);
  return {
    silent: visible.filter((entry) => entry.classification === 'silent').length,
    documented: visible.filter(
      (entry) => entry.classification === 'documented' && !entry.tieResolved,
    ).length,
    tieResolved: visible.filter((entry) => entry.tieResolved).length,
    localOnly: ledger.decisions.length - visible.length,
    decisions: ledger.decisions.length,
    blockers: ledger.blockers.length,
    budgetRemaining: ledger.budget - usedBudget(ledger),
  };
}

async function runCloseOperation(input, deps) {
  closed(input, ['cwd', 'runId', 'outcome'], ['pullRequest'], 'input');
  requireRunId(input.runId);
  oneOf(input.outcome, RUN_OUTCOMES, 'outcome');
  const withPr = input.outcome !== 'no-pull-request';
  if (withPr) positiveInteger(input.pullRequest, 'pullRequest');
  else if (input.pullRequest !== undefined)
    invalid('pullRequest is not allowed without a pull request');
  const ctx = await rootContext(input, deps);
  const ledger = await openLedger(ctx, input.runId);
  if (input.outcome === 'appendix-update' && ledger.source.kind !== 'issue') {
    invalid('appendix-update requires an issue source');
  }
  // A worktree location conflict publishes nothing: the run closes without a pull request, or on
  // an issue source with the plan pull request it left unchanged, like a public security blocker.
  if (worktreeLocationConflict(ledger)) {
    if (!WORKTREE_LOCATION_CONFLICT_OUTCOMES.includes(input.outcome)) {
      invalid(
        `a worktree-location-conflict blocker closes only with ${WORKTREE_LOCATION_CONFLICT_OUTCOMES.join(' or ')}`,
      );
    }
    if (input.outcome === 'plan-pull-request-unchanged' && ledger.source.kind !== 'issue') {
      invalid(
        'a worktree-location-conflict blocker keeps a plan pull request only on an issue source',
      );
    }
  }
  // The closed ledger is written first and the claim released only afterwards, whatever the
  // outcome and whatever blockers stand: a failed ledger write leaves the run open with its claim,
  // and a repeated `run-close` closes and releases both. A failed release after the write is
  // reported and leaves a closed ledger whose claim `cleanup` prunes (`run-ledger-closed`).
  ledger.status = 'closed';
  ledger.closedAt = timestamp(deps);
  ledger.outcome = input.outcome;
  if (withPr) ledger.pullRequest = input.pullRequest;
  await writeLedger(ctx, ledger);
  const planningClaim = await releaseRunClaim(ctx, ledger, deps);
  return {
    runId: ledger.runId,
    outcome: ledger.outcome,
    counts: counts(ledger),
    fit: storedFit(ledger),
    baseMove: storedBaseMove(ledger),
    deliveryBase: storedDeliveryBase(ledger),
    ...(planningClaim === null ? {} : { planningClaim }),
  };
}

// The recorded architecture fit without its timestamp, or `null` when none was recorded:
// `{assessed: true, score, reason, sources}`, `{assessed: false}` or
// `{assessed: false, unavailable: true}`.
function storedFit(ledger) {
  if (!isObject(ledger.fit)) return null;
  const { recordedAt: _recordedAt, ...fit } = ledger.fit;
  return fit;
}

// ---------------------------------------------------------------------------------------------
// Ledger cleanup: `cleanup`'s inventory and removal

// Whether a closed ledger's outcome and pull request agree: `no-pull-request` carries no pull
// request, every other outcome exactly one positive pull-request number.
function closedLedgerConsistent(ledger) {
  if (!RUN_OUTCOMES.includes(ledger.outcome)) return false;
  if (ledger.outcome === 'no-pull-request') return !Object.hasOwn(ledger, 'pullRequest');
  return Number.isSafeInteger(ledger.pullRequest) && ledger.pullRequest > 0;
}

// Whether `cleanup` may remove a ledger, from the ledger and the pull-request state the caller
// read with `pr-read` (`undefined` when it read none). Returns `{ removable, reason }`: an open run
// and an open pull request are retained, and so is a pull request whose state is unavailable or
// was not supplied; a closed run whose outcome is explicitly `no-pull-request`, or with a merged
// or closed pull request, is removable. A closed ledger whose outcome and pull request disagree is
// retained as `ledger-invalid`.
export function ledgerRemoval(ledger, pullRequestState) {
  if (ledger.status !== 'closed') return { removable: false, reason: 'run-open' };
  if (!closedLedgerConsistent(ledger)) return { removable: false, reason: 'ledger-invalid' };
  if (ledger.outcome === 'no-pull-request') return { removable: true, reason: 'no-pull-request' };
  if (pullRequestState === 'merged') return { removable: true, reason: 'pull-request-merged' };
  if (pullRequestState === 'closed') return { removable: true, reason: 'pull-request-closed' };
  if (pullRequestState === 'open') return { removable: false, reason: 'pull-request-open' };
  if (pullRequestState === 'unavailable') return { removable: false, reason: 'forge-unavailable' };
  return { removable: false, reason: 'pull-request-state-missing' };
}

// The run directories below `.effective-flow/autopilot/`, or `null` when that directory is absent.
async function runDirectoryNames(ctx) {
  const root = path.join(ctx.cwd, AUTOPILOT_DIR);
  if (!(await assertDirectoryChain(ctx.cwd, root, { allowMissing: true }))) return null;
  return (await readdir(root, { withFileTypes: true }))
    .map((entry) => ({ name: entry.name, directory: entry.isDirectory() }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function ledgerListOperation(input, deps) {
  closed(input, ['cwd'], [], 'input');
  const ctx = await rootContext(input, deps);
  const names = await runDirectoryNames(ctx);
  const runs = [];
  const ignored = [];
  for (const { name, directory } of names ?? []) {
    if (!directory || !RUN_ID.test(name)) {
      ignored.push(name);
      continue;
    }
    let ledger;
    try {
      ledger = await readLedger(ctx, name);
    } catch (error) {
      if (!(error instanceof AutopilotError || error instanceof RuntimeStateError)) throw error;
      runs.push({ runId: name, state: 'invalid', reason: error.code });
      continue;
    }
    if (ledger === null) {
      runs.push({ runId: name, state: 'invalid', reason: 'NOT_FOUND' });
      continue;
    }
    const pullRequest = Number.isSafeInteger(ledger.pullRequest) ? ledger.pullRequest : null;
    const removal = ledgerRemoval(ledger, undefined);
    const pending = removal.removable || removal.reason === 'pull-request-state-missing';
    // A retained plan copy keeps the run whatever its pull request's state is.
    const copies = pending ? await planCopies(runDirectory(ctx, name)) : [];
    runs.push({
      runId: name,
      state: 'valid',
      status: ledger.status,
      outcome: ledger.outcome ?? null,
      pullRequest,
      source: ledger.source,
      // `needs-pull-request-state`: closed with a pull request, so `pr-read` decides.
      removal:
        copies.length > 0
          ? 'retained-plan-copy'
          : removal.reason === 'pull-request-state-missing'
            ? 'needs-pull-request-state'
            : removal.removable
              ? 'removable'
              : removal.reason,
      ...(copies.length > 0 ? { planCopies: copies } : {}),
    });
  }
  return { directory: names === null ? 'absent' : 'present', runs, ignored };
}

const PLAN_COPY = /^plan-copy-[0-9a-f]{16}\.md$/;

// The plan copies `plan-copy-restore` retained in a run directory (absolute paths). Each may hold
// a late save, and none is ever deleted by the prune.
async function planCopies(directory, names) {
  return (names ?? (await readdir(directory)))
    .filter((name) => PLAN_COPY.test(name))
    .map((name) => path.join(directory, name));
}

// Removes one run directory: an appendix beside the ledger, the ledger, then the empty directory.
// Any other entry, and every retained plan copy, keeps the directory and its ledger.
// `pullRequest` is the number the caller read with `ledger-list` and passed to `pr-read`; it must
// be the ledger's own, so a state read for another pull request never removes this ledger.
async function pruneRun(ctx, runId, pullRequestState, pullRequest) {
  const directory = runDirectory(ctx, runId);
  if (!(await assertDirectoryChain(ctx.cwd, directory, { allowMissing: true }))) {
    return { runId, result: 'missing' };
  }
  let ledger;
  try {
    ledger = await readLedger(ctx, runId);
  } catch (error) {
    if (!(error instanceof AutopilotError || error instanceof RuntimeStateError)) throw error;
    return { runId, result: 'retained', reason: 'ledger-invalid' };
  }
  if (ledger === null) return { runId, result: 'retained', reason: 'ledger-invalid' };
  if (
    ledger.status === 'closed' &&
    closedLedgerConsistent(ledger) &&
    (ledger.pullRequest ?? null) !== (pullRequest ?? null)
  ) {
    return { runId, result: 'retained', reason: 'pull-request-mismatch' };
  }
  const removal = ledgerRemoval(ledger, pullRequestState);
  if (!removal.removable) return { runId, result: 'retained', reason: removal.reason };
  const entries = await readdir(directory);
  const known = new Set([LEDGER_FILE, APPENDIX_FILE]);
  if (entries.some((name) => !known.has(name) && !PLAN_COPY.test(name))) {
    return { runId, result: 'retained', reason: 'unexpected-entry' };
  }
  for (const name of entries.filter((entry) => known.has(entry))) {
    const target = path.join(directory, name);
    const info = await lstat(target);
    if (!info.isFile()) return { runId, result: 'retained', reason: 'unexpected-entry' };
  }
  const copies = await planCopies(directory, entries);
  if (copies.length > 0) {
    return { runId, result: 'retained', reason: 'retained-plan-copy', planCopies: copies };
  }
  // The appendix first, so an interrupted removal still leaves a readable ledger.
  for (const name of [APPENDIX_FILE, LEDGER_FILE].filter((entry) => entries.includes(entry))) {
    await assertDirectoryChain(ctx.cwd, directory);
    await guardedUnlink(ctx, path.join(directory, name));
  }
  await guardedRmdir(ctx, directory);
  return { runId, result: 'removed', reason: removal.reason };
}

async function ledgerPruneOperation(input, deps) {
  closed(input, ['cwd', 'runs'], [], 'input');
  if (!Array.isArray(input.runs) || input.runs.length === 0 || input.runs.length > MAX_PRUNE_RUNS) {
    invalid(`runs must hold 1 to ${MAX_PRUNE_RUNS} entries`);
  }
  const seen = new Set();
  for (const [index, entry] of input.runs.entries()) {
    closed(entry, ['runId'], ['pullRequestState', 'pullRequest'], `runs[${index}]`);
    requireRunId(entry.runId);
    if (entry.pullRequestState !== undefined) {
      oneOf(entry.pullRequestState, PULL_REQUEST_STATES, `runs[${index}].pullRequestState`);
    }
    if (entry.pullRequest !== undefined) {
      positiveInteger(entry.pullRequest, `runs[${index}].pullRequest`);
    }
    if (seen.has(entry.runId)) invalid('runs must name each run once');
    seen.add(entry.runId);
  }
  const ctx = await rootContext(input, deps);
  const items = [];
  for (const entry of input.runs) {
    items.push(await pruneRun(ctx, entry.runId, entry.pullRequestState, entry.pullRequest));
  }
  return { items };
}

// ---------------------------------------------------------------------------------------------
// Appendix: sanitization, rendering, scan

const CLOSING_KEYWORD_STRIP =
  /\b(close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b\s*(?::\s*)?(?=#\d|[\w.-]{1,100}\/[\w.-]{1,100}#\d|https?:\/\/)/gi;
// An `@` before an alphanumeric is a mention unless a word character precedes it (`a@b.example`).
const MENTION = /(^|[^A-Za-z0-9_])@(?=[A-Za-z0-9])/g;
const RESIDUAL_MENTION = /(?:^|[^A-Za-z0-9_])@[A-Za-z0-9]/;
const FOOTER_LINE = /^\s*(?:Release-As|BREAKING[ -]CHANGE)\s*:/i;
const FOOTER_TOKEN = /\b(Release-As|BREAKING[ -]CHANGE)\s*:/gi;

// Whether a rendered line still carries a mention the field sanitizer left behind (`@@name`
// becomes `@name` after one pass). The appendix scan blocks on it rather than repairing it.
export function hasResidualMention(line) {
  return RESIDUAL_MENTION.test(line);
}

// The body check's strip rules for one free-text field: footer lines dropped, the rest joined into
// one line, closing keywords and `@`-mentions removed, footer tokens and `<!--` neutralized. Each
// applied rule is reported by name, never with the stripped value.
export function sanitizeField(value) {
  const applied = new Set();
  const kept = value.split(/\r?\n/).filter((line) => {
    if (FOOTER_LINE.test(line)) {
      applied.add('footer-line');
      return false;
    }
    return true;
  });
  let result = kept.join(' ').replace(/\s+/g, ' ').trim();
  const strip = (pattern, replacement, rule) => {
    const next = result.replace(pattern, replacement);
    if (next !== result) applied.add(rule);
    result = next;
  };
  strip(CLOSING_KEYWORD_STRIP, '', 'closing-keyword');
  strip(MENTION, '$1', 'mention');
  strip(FOOTER_TOKEN, '$1', 'footer-token');
  strip(/<!--/g, '&lt;!--', 'comment-opener');
  result = result.trim();
  if (result === '') {
    result = '—';
    applied.add('empty');
  }
  return { text: result, applied: [...applied] };
}

const COPY = Object.freeze({
  en: Object.freeze({
    title: '## Autopilot record',
    source: '**Source:**',
    issue: (number) => `Refs #${number}`,
    planPr: (number) => `continues plan pull request #${number}`,
    plan: (planPath) => `plan \`${planPath}\``,
    close: '### Close decisions',
    none: 'None.',
    chosen: 'chosen',
    alternative: 'Alternative',
    tie: 'tie re-scored',
    automatic: '### Automatic decisions',
    automaticCount: (count) =>
      `${count} decision${count === 1 ? ' was' : 's were'} taken automatically with a clear lead.`,
    blockers: APPENDIX_BLOCKER_HEADINGS.en,
    neutralBlocker:
      'Implementation stopped at a blocker that needs maintainer attention; the details are kept locally.',
    fit: '### Architecture fit',
    fitSources: 'Sources',
    notAssessed: 'Architecture fit: not assessed — no architecture or roadmap sources found',
    unavailable: 'Architecture fit: not assessed — scoring unavailable',
    baseMove: '### Base move',
    baseMoveRange: (from, to, commits, changed) =>
      `The base moved from \`${from}\` to \`${to}\` during planning: ${commits} ${commits === 1 ? 'commit' : 'commits'}, ${changed} changed ${changed === 1 ? 'path' : 'paths'}. The plan was published on the new base.`,
    baseMoveCited: (cited) =>
      `No changed path overlaps the ${cited === 1 ? 'path' : `${cited} paths`} the plan cites`,
    baseMoveUnresolved: (reason) =>
      `The move is unresolved (\`${reason}\`): reconciling the plan with the new base is left to review.`,
    baseMoveOverlapping: 'Overlapping paths',
    deliveryBase: '### Delivery base',
    deliveryBaseRange: (from, to, commits) =>
      `The base moved from the merge base \`${from}\` to \`${to}\` before delivery: ${commits} ${commits === 1 ? 'commit' : 'commits'}.`,
    deliveryBaseNone:
      'The head merges into the new base without a conflict; the branch carries no merge commit.',
    deliveryBaseResolved: (count, merge, mode) =>
      `The conflict in ${count} ${count === 1 ? 'path' : 'paths'} was resolved by merge commit \`${merge}\` (validation mode \`${mode}\`).`,
    deliveryBaseUnresolved: (count, reason) =>
      `The conflict in ${count} ${count === 1 ? 'path' : 'paths'} is unresolved (\`${reason}\`); the branch is unchanged.`,
    deliveryBaseUnchecked: (reason) =>
      `The merge was not checked (\`${reason}\`); the branch is unchanged.`,
    deliveryBaseConflicted: 'Conflicted paths',
    deliveryBaseFlag:
      'Unresolved delivery conflict: resolving it is left to a later session such as `merge-gate`.',
    deliveryBaseAsk:
      '`mergeGate.conflictResolution` is `ask`; this unattended run counted it as its one automatic resolution attempt.',
    more: (count) => `(+${count} more)`,
  }),
  de: Object.freeze({
    title: '## Autopilot-Protokoll',
    source: '**Quelle:**',
    issue: (number) => `Refs #${number}`,
    planPr: (number) => `setzt Plan-Pull-Request #${number} fort`,
    plan: (planPath) => `Plan \`${planPath}\``,
    close: '### Knappe Entscheidungen',
    none: 'Keine.',
    chosen: 'gewählt',
    alternative: 'Alternative',
    tie: 'Gleichstand neu bewertet',
    automatic: '### Automatische Entscheidungen',
    automaticCount: (count) =>
      `${count} ${count === 1 ? 'Entscheidung wurde' : 'Entscheidungen wurden'} mit klarem Vorsprung automatisch getroffen.`,
    blockers: APPENDIX_BLOCKER_HEADINGS.de,
    neutralBlocker:
      'Die Umsetzung wurde an einem Blocker angehalten, der die Aufmerksamkeit der Maintainer braucht; die Details liegen lokal vor.',
    fit: '### Architektur-Passung',
    fitSources: 'Quellen',
    notAssessed:
      'Architektur-Passung: nicht bewertet — keine Architektur- oder Roadmap-Quellen gefunden',
    unavailable: 'Architektur-Passung: nicht bewertet — Bewertung nicht verfügbar',
    baseMove: '### Basis-Verschiebung',
    baseMoveRange: (from, to, commits, changed) =>
      `Die Basis hat sich während der Planung von \`${from}\` auf \`${to}\` verschoben: ${commits} ${commits === 1 ? 'Commit' : 'Commits'}, ${changed} ${changed === 1 ? 'geänderter Pfad' : 'geänderte Pfade'}. Der Plan wurde auf der neuen Basis veröffentlicht.`,
    baseMoveCited: (cited) =>
      `Kein geänderter Pfad überschneidet sich mit ${cited === 1 ? 'dem Pfad' : `den ${cited} Pfaden`}, die der Plan nennt`,
    baseMoveUnresolved: (reason) =>
      `Die Verschiebung ist ungelöst (\`${reason}\`): den Plan mit der neuen Basis abzugleichen bleibt dem Review überlassen.`,
    baseMoveOverlapping: 'Überschneidende Pfade',
    deliveryBase: '### Basis bei Auslieferung',
    deliveryBaseRange: (from, to, commits) =>
      `Die Basis hat sich vor der Auslieferung von der Merge-Basis \`${from}\` auf \`${to}\` verschoben: ${commits} ${commits === 1 ? 'Commit' : 'Commits'}.`,
    deliveryBaseNone:
      'Der Head lässt sich ohne Konflikt in die neue Basis mergen; der Branch trägt keinen Merge-Commit.',
    deliveryBaseResolved: (count, merge, mode) =>
      `Der Konflikt in ${count} ${count === 1 ? 'Pfad' : 'Pfaden'} wurde durch den Merge-Commit \`${merge}\` gelöst (Validierungsmodus \`${mode}\`).`,
    deliveryBaseUnresolved: (count, reason) =>
      `Der Konflikt in ${count} ${count === 1 ? 'Pfad' : 'Pfaden'} ist ungelöst (\`${reason}\`); der Branch ist unverändert.`,
    deliveryBaseUnchecked: (reason) =>
      `Der Merge wurde nicht geprüft (\`${reason}\`); der Branch ist unverändert.`,
    deliveryBaseConflicted: 'Konfliktpfade',
    deliveryBaseFlag:
      'Ungelöster Auslieferungskonflikt: ihn zu lösen bleibt einer späteren Sitzung wie `merge-gate` überlassen.',
    deliveryBaseAsk:
      '`mergeGate.conflictResolution` steht auf `ask`; dieser unbeaufsichtigte Lauf hat das als seinen einen automatischen Lösungsversuch gezählt.',
    more: (count) => `(+${count} weitere)`,
  }),
});

// The abbreviated object id the appendix shows for a base, Git's default short length.
const SHORT_OID_LENGTH = 7;

function scored(entry, field, sanitized) {
  return `${entry.score}/10 — ${field(entry.reason, sanitized)}`;
}

// The plan path the appendix names: the archive path `delivery-record` recorded, otherwise (an
// unarchived delivery or none at all) the original plan path.
function appendixPlanPath(ledger) {
  const archivePath = ledger.delivery?.archivePath;
  return typeof archivePath === 'string' ? archivePath : ledger.source.planPath;
}

// Renders the appendix text for a ledger. Every free-text field passes `sanitizeField`; the result
// lists which rules applied. Local-only decisions are left out entirely, with no count. A security
// blocker, a blocker with a local-only reference and a blocker without a summary render one
// neutral line. Returns `{ appendix, sanitized }`.
export function renderAppendix(ledger, { planPullRequest } = {}) {
  const copy = COPY[ledger.language];
  const sanitized = [];
  const field = (value, where) => {
    const result = sanitizeField(value);
    for (const rule of result.applied) sanitized.push({ field: where, rule });
    return result.text;
  };
  const lines = [APPENDIX_BEGIN, copy.title, ''];
  const reference =
    ledger.source.kind === 'issue'
      ? [copy.issue(ledger.source.issue)]
      : [copy.plan(field(appendixPlanPath(ledger), 'source.planPath'))];
  if (planPullRequest !== undefined) reference.push(copy.planPr(planPullRequest));
  lines.push(`${copy.source} ${reference.join('; ')}`, '');

  const visible = ledger.decisions.filter((entry) => !entry.localOnly);
  const documented = visible.filter((entry) => entry.classification === 'documented');
  lines.push(copy.close, '');
  if (documented.length === 0) lines.push(copy.none);
  for (const [index, entry] of documented.entries()) {
    const where = `decision ${index + 1}`;
    const winner = entry.winner;
    lines.push(
      `- **${field(entry.question, `${where}.question`)}** — ${copy.chosen}: **${field(winner.label, `${where}.winner.label`)}** (${scored(winner, (value) => field(value, `${where}.winner.reason`))})`,
    );
    for (const [position, alternative] of entry.alternatives.entries()) {
      const at = `${where}.alternatives[${position}]`;
      lines.push(
        `  - ${copy.alternative}: ${field(alternative.label, `${at}.label`)} (${scored(alternative, (value) => field(value, `${at}.reason`))})`,
      );
    }
    if (entry.tieResolved) {
      const tied = [winner, ...entry.alternatives.filter((item) => item.rescore !== undefined)];
      const rounds = tied
        .map((item, position) => {
          const at = `${where}.tie[${position}]`;
          return `${field(item.label, `${at}.label`)} ${item.score}/10 → ${item.rescore}/10 — ${field(item.rescoreReason, `${at}.reason`)}`;
        })
        .join('; ');
      lines.push(`  - ${copy.tie}: ${rounds}`);
    }
  }
  lines.push('');
  lines.push(
    copy.automatic,
    '',
    copy.automaticCount(visible.filter((entry) => entry.classification === 'silent').length),
    '',
  );

  // The base move sits before the blocker section, so blocker counting never reads its lines. An
  // unresolved move is the PR's flag: its line replaces the "no overlap" line of a fitting one.
  if (isObject(ledger.baseMove)) {
    const move = ledger.baseMove;
    const paths = (list, label) => list.map((entry) => `\`${field(entry, label)}\``).join(', ');
    const moveLines = [
      copy.baseMoveRange(
        move.fromBaseOid.slice(0, SHORT_OID_LENGTH),
        move.toBaseOid.slice(0, SHORT_OID_LENGTH),
        move.commitCount,
        move.changedPathCount,
      ),
    ];
    if (move.verdict === 'fits') {
      const cited = paths(move.citedPaths, 'baseMove.citedPaths');
      const hidden = move.citedPathCount - move.citedPaths.length;
      moveLines.push(
        `${copy.baseMoveCited(move.citedPathCount)}${cited === '' ? '.' : `: ${cited}`}${hidden > 0 ? ` ${copy.more(hidden)}` : ''}`,
      );
    } else {
      moveLines.push(copy.baseMoveUnresolved(move.reason));
      if (move.overlappingPaths.length > 0) {
        moveLines.push(
          `${copy.baseMoveOverlapping}: ${paths(move.overlappingPaths, 'baseMove.overlappingPaths')}`,
        );
      }
    }
    lines.push(copy.baseMove, '', ...moveLines, '');
  }

  // The delivery base follows the base move, still before the blocker section, so blocker counting
  // never reads its lines either. An unresolved conflict is no blocker: its flag sentence is the
  // PR's notice that resolving it is left to a later session.
  if (isObject(ledger.deliveryBase)) {
    const delivery = ledger.deliveryBase;
    const short = (oid) => oid.slice(0, SHORT_OID_LENGTH);
    const deliveryLines = [
      copy.deliveryBaseRange(
        short(delivery.mergeBaseOid),
        short(delivery.baseOid),
        delivery.commitCount,
      ),
    ];
    if (delivery.result === 'none') deliveryLines.push(copy.deliveryBaseNone);
    else if (delivery.result === 'unchecked') {
      deliveryLines.push(copy.deliveryBaseUnchecked(delivery.reason));
    } else if (delivery.result === 'resolved') {
      deliveryLines.push(
        copy.deliveryBaseResolved(
          delivery.conflictCount,
          short(delivery.mergeOid),
          delivery.validationMode,
        ),
      );
    } else {
      deliveryLines.push(copy.deliveryBaseUnresolved(delivery.conflictCount, delivery.reason));
      const listed = delivery.conflictedPaths
        .map((entry) => `\`${field(entry, 'deliveryBase.conflictedPaths')}\``)
        .join(', ');
      const hidden = delivery.conflictCount - delivery.conflictedPaths.length;
      if (listed !== '' || hidden > 0) {
        deliveryLines.push(
          `${copy.deliveryBaseConflicted}: ${[listed, hidden > 0 ? copy.more(hidden) : ''].filter(Boolean).join(' ')}`,
        );
      }
      deliveryLines.push(copy.deliveryBaseFlag);
    }
    if (delivery.conflictResolution === 'ask') deliveryLines.push(copy.deliveryBaseAsk);
    lines.push(copy.deliveryBase, '', ...deliveryLines, '');
  }

  if (ledger.blockers.length > 0) {
    lines.push(copy.blockers, '');
    for (const [index, entry] of ledger.blockers.entries()) {
      const neutral =
        entry.kind === 'security' ||
        entry.kind === WORKTREE_LOCATION_CONFLICT ||
        entry.localOnly !== undefined ||
        typeof entry.summary !== 'string' ||
        entry.summary.trim() === '';
      lines.push(
        neutral
          ? `- ${copy.neutralBlocker}`
          : `- ${field(entry.summary, `blocker ${index + 1}.summary`)}`,
      );
    }
    lines.push('');
  }

  if (ledger.fit) {
    lines.push(copy.fit, '');
    if (ledger.fit.assessed) {
      const sources = ledger.fit.sources
        .map((entry) => `\`${field(entry, 'fit.sources')}\``)
        .join(', ');
      lines.push(
        `${ledger.fit.score}/10 — ${field(ledger.fit.reason, 'fit.reason')} ${copy.fitSources}: ${sources}`,
      );
    } else {
      lines.push(ledger.fit.unavailable ? copy.unavailable : copy.notAssessed);
    }
    lines.push('');
  }
  if (lines.at(-1) === '') lines.pop();
  lines.push(APPENDIX_END);
  return { appendix: `${lines.join('\n')}\n`, sanitized };
}

// Exactly one begin marker as the first line, one end marker as the last line, and no other HTML
// comment opener anywhere: sanitization neutralizes every `<!--` in free text.
export function validateAppendixMarkers(appendix) {
  const lines = appendix.replace(/\n$/, '').split('\n');
  const begins = lines.filter((line) => line === APPENDIX_BEGIN).length;
  const ends = lines.filter((line) => line === APPENDIX_END).length;
  const stray = lines.filter(
    (line) => line !== APPENDIX_BEGIN && line !== APPENDIX_END && line.includes('<!--'),
  ).length;
  return (
    begins === 1 &&
    ends === 1 &&
    stray === 0 &&
    lines[0] === APPENDIX_BEGIN &&
    lines.at(-1) === APPENDIX_END
  );
}

// A security blocker on a repository whose recorded visibility is not `private` (`unknown` counts
// as public): nothing of the run may reach the forge.
function publicSecurityBlocker(ledger) {
  return (
    ledger.visibility !== 'private' && ledger.blockers.some((entry) => entry.kind === 'security')
  );
}

// A worktree location conflict on any repository: the run publishes nothing, so no appendix is
// rendered or merged whatever its visibility.
function worktreeLocationConflict(ledger) {
  return ledger.blockers.some((entry) => entry.kind === WORKTREE_LOCATION_CONFLICT);
}

async function prAppendixOperation(input, deps) {
  closed(input, ['cwd', 'runId'], ['planPullRequest'], 'input');
  requireRunId(input.runId);
  if (input.planPullRequest !== undefined)
    positiveInteger(input.planPullRequest, 'planPullRequest');
  const ctx = await rootContext(input, deps);
  const ledger = await openLedger(ctx, input.runId);
  if (publicSecurityBlocker(ledger)) {
    // A withheld render also withdraws any earlier appendix from `appendix-merge`.
    withdrawAppendix(ledger);
    await writeLedger(ctx, ledger);
    return { status: 'withheld', reason: 'public-security-blocker' };
  }
  if (worktreeLocationConflict(ledger)) {
    withdrawAppendix(ledger);
    await writeLedger(ctx, ledger);
    return { status: 'withheld', reason: WORKTREE_LOCATION_CONFLICT };
  }
  const { appendix, sanitized } = renderAppendix(ledger, {
    planPullRequest: input.planPullRequest,
  });
  const scan = scanEntries([{ field: 'body', text: appendix }], 'unattended');
  const appendixLines = appendix.split('\n');
  const residualKeyword = appendixLines.some((line) => hasClosingKeyword(line));
  const residualMention = appendixLines.some((line) => hasResidualMention(line));
  if (
    scan.blocking.length > 0 ||
    residualKeyword ||
    residualMention ||
    !validateAppendixMarkers(appendix)
  ) {
    const blocking = [
      ...scan.blocking,
      ...(residualKeyword ? ['closing-keyword'] : []),
      ...(residualMention ? ['mention'] : []),
    ];
    // A blocked render withdraws any earlier appendix from `appendix-merge`.
    withdrawAppendix(ledger);
    ledger.blockers.push(
      blockerEntry(
        'appendix-scan',
        { summary: 'The pull-request appendix failed its content scan and was not published.' },
        deps,
      ),
    );
    await writeLedger(ctx, ledger);
    return { status: 'blocked', blocking, sanitized };
  }
  const target = path.join(runDirectory(ctx, ledger.runId), APPENDIX_FILE);
  const digest = sha256(appendix);
  await atomicWrite(ctx, target, appendix);
  ledger.appendixSha256 = digest;
  await writeLedger(ctx, ledger);
  return {
    status: 'rendered',
    appendixPath: target,
    sha256: digest,
    appendix,
    sanitized,
  };
}

// A pull-request body with the appendix in place: an existing block (exactly one begin line
// followed by exactly one end line) is replaced, never stacked; without one the appendix is
// appended after one blank line. Any other marker state is APPENDIX_MARKERS_INVALID.
export function mergeAppendix(body, appendix) {
  if (!validateAppendixMarkers(appendix)) {
    fail('APPENDIX_MARKERS_INVALID', 'the appendix does not carry exactly its marker pair');
  }
  const block = appendix.replace(/\n$/, '').split('\n');
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const begins = [];
  const ends = [];
  for (const [index, line] of lines.entries()) {
    if (line.trim() === APPENDIX_BEGIN) begins.push(index);
    else if (line.trim() === APPENDIX_END) ends.push(index);
    else if (line.includes('effective-flow-autopilot-appendix:')) {
      fail(
        'APPENDIX_MARKERS_INVALID',
        `body line ${index + 1} carries a malformed appendix marker`,
      );
    }
  }
  if (begins.length === 0 && ends.length === 0) {
    const kept = lines.join('\n').replace(/\s+$/, '');
    return { body: `${kept === '' ? '' : `${kept}\n\n`}${block.join('\n')}\n`, replaced: false };
  }
  if (begins.length !== 1 || ends.length !== 1 || ends[0] < begins[0]) {
    fail(
      'APPENDIX_MARKERS_INVALID',
      'the body must hold no appendix block or exactly one, begin before end',
    );
  }
  const merged = [...lines.slice(0, begins[0]), ...block, ...lines.slice(ends[0] + 1)];
  return { body: merged.join('\n'), replaced: true };
}

// Reads the appendix `pr-appendix` wrote for an open run, at the path the run directory decides
// (`<root>/.effective-flow/autopilot/<run-id>/appendix.md`), and only when the caller's
// `appendixSha256` is the digest `pr-appendix` returned and recorded in the ledger and the file
// still has that digest. Anything else is APPENDIX_MISMATCH. A security blocker on a repository
// whose recorded visibility is not `private` is APPENDIX_WITHHELD even under a matching digest.
async function appendixMergeOperation(input, deps) {
  closed(input, ['cwd', 'runId', 'appendixSha256', 'body'], [], 'input');
  requireRunId(input.runId);
  if (typeof input.appendixSha256 !== 'string' || !SHA256.test(input.appendixSha256)) {
    invalid('appendixSha256 must be a lowercase SHA-256 hex digest');
  }
  if (typeof input.body !== 'string') invalid('body must be a string');
  if (Buffer.byteLength(input.body, 'utf8') > MAX_BODY_BYTES) {
    fail('INPUT_TOO_LARGE', `body exceeds ${MAX_BODY_BYTES} bytes`);
  }
  const ctx = await rootContext(input, deps);
  const ledger = await openLedger(ctx, input.runId);
  if (ledger.appendixSha256 !== input.appendixSha256) {
    fail('APPENDIX_MISMATCH', 'appendixSha256 is not the digest pr-appendix recorded for this run');
  }
  if (publicSecurityBlocker(ledger)) {
    fail(
      'APPENDIX_WITHHELD',
      'a security blocker on a non-private repository withholds the appendix',
    );
  }
  if (worktreeLocationConflict(ledger)) {
    fail('APPENDIX_WITHHELD', 'a worktree-location-conflict blocker withholds the appendix');
  }
  const directory = runDirectory(ctx, ledger.runId);
  await assertDirectoryChain(ctx.cwd, directory);
  const bytes = await readBoundedRegular(
    path.join(directory, APPENDIX_FILE),
    MAX_APPENDIX_BYTES,
    'the run appendix',
  );
  if (sha256(bytes) !== input.appendixSha256) {
    fail('APPENDIX_MISMATCH', 'the run appendix changed since pr-appendix rendered it');
  }
  let appendix;
  try {
    appendix = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('INVALID_CONTENT', 'the appendix is not valid UTF-8');
  }
  const { body, replaced } = mergeAppendix(input.body, appendix);
  return { body, replaced, appendixSha256: sha256(bytes) };
}

// ---------------------------------------------------------------------------------------------
// Plan copy restore: the run's own review edit in the invocation checkout

// A Git read in `sourceRoot` that failed (spawn error, timeout or an unexpected exit status). The
// restore maps it to `kept` with `git-read-failed`, never to `not-applicable`.
class GitReadFailure extends Error {}

async function readGit(ctx, root, args, { allowed = [0] } = {}) {
  const result = await runGit(ctx, root, args);
  if (result?.error || !allowed.includes(result?.status)) {
    const command = args[0];
    const detail = result?.error?.message ?? errorDetail(result?.stderr);
    throw new GitReadFailure(`git ${command} failed${detail ? `: ${detail}` : ''}`);
  }
  return {
    status: result.status,
    stdout: asBuffer(result.stdout),
    stderr: asBuffer(result.stderr),
  };
}

// The one tree entry `git ls-tree -z <rev> -- :(literal)<path>` lists for exactly that path, as
// `{ mode, type, oid }`, or `null` when a successful listing has none. A failed listing (an
// unknown revision included) throws GitReadFailure.
async function treeEntry(ctx, root, rev, relative) {
  const result = await readGit(ctx, root, ['ls-tree', '-z', rev, '--', `:(literal)${relative}`]);
  for (const record of result.stdout.toString('utf8').split('\0')) {
    const match = record.match(/^(\d{6}) (\w+) ([0-9a-f]+)\t([\s\S]*)$/);
    if (match && match[4] === relative) return { mode: match[1], type: match[2], oid: match[3] };
  }
  return null;
}

// Whether the index holds exactly the stage-0 entry `HEAD:<path>` has, so nothing is staged.
async function indexMatches(ctx, root, relative, head) {
  const listed = await readGit(ctx, root, ['ls-files', '-s', '-z', '--', `:(literal)${relative}`]);
  const entries = listed.stdout
    .toString('utf8')
    .split('\0')
    .filter((record) => record !== '')
    .map((record) => record.match(/^(\d{6}) ([0-9a-f]+) (\d)\t([\s\S]*)$/));
  if (entries.length !== 1 || !entries[0]) return false;
  const [, mode, oid, stage, entryPath] = entries[0];
  return stage === '0' && entryPath === relative && mode === head.mode && oid === head.oid;
}

// `<commit>:<path>` in working-tree form, which is what a checkout writes and what the working
// copy and the preflight `planSha256` hash: `git cat-file --filters` applies the checkout's
// end-of-line conversion and smudge filters. `null` for a non-regular entry or a blob over the
// plan bound, in either form. The restore hashes these bytes and installs the same buffer, so the
// installed file is exactly the content every `HEAD:<P>` comparison saw.
async function workingFormBytes(ctx, root, commit, relative, entry) {
  if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) return null;
  const size = Number(
    (await readGit(ctx, root, ['cat-file', '-s', entry.oid])).stdout.toString('utf8').trim(),
  );
  if (!Number.isSafeInteger(size) || size > MAX_PLAN_BYTES) return null;
  const filtered = (await readGit(ctx, root, ['cat-file', '--filters', `${commit}:${relative}`]))
    .stdout;
  if (filtered.length > MAX_PLAN_BYTES) return null;
  return filtered;
}

// The commit `HEAD` names, or `null` for an unborn `HEAD` (`--verify -q` exits 1 without output).
// Any other failure throws GitReadFailure.
async function headCommit(ctx, root) {
  const result = await readGit(ctx, root, ['rev-parse', '--verify', '-q', 'HEAD^{commit}'], {
    allowed: [0, 1],
  });
  const oid = result.stdout.toString('utf8').trim();
  if (result.status === 1) {
    if (oid === '' && result.stderr.length === 0) return null;
    throw new GitReadFailure(`git rev-parse failed: ${errorDetail(result.stderr)}`);
  }
  if (!OBJECT_ID.test(oid)) throw new GitReadFailure('git rev-parse returned no commit id');
  return oid;
}

function requireAbsoluteSourceRoot(value, label = 'sourceRoot') {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    invalid(`${label} must be an absolute path`);
  }
  return value;
}

async function canonical(value, label) {
  try {
    return await realpath(value);
  } catch {
    fail('UNSAFE_TARGET', `cannot resolve ${label}`);
  }
}

// `sourceRoot` must be its own `--show-toplevel` and belong to the repository `cwd` belongs to; a
// linked worktree of it is allowed. A directory outside any repository, a `.git`, common or bare
// repository directory, a subdirectory and another repository are UNSAFE_TARGET; a Git read that fails otherwise (spawn error, timeout, another
// exit status) throws GitReadFailure. `delivery-base-record` applies the same rule to its
// `checkout` under that label.
async function requireSourceRoot(ctx, value, label = 'sourceRoot') {
  const root = await resolveDirectory(requireAbsoluteSourceRoot(value, label), label);
  const top = await runGit(ctx, root, ['rev-parse', '--show-toplevel']);
  // Outside any repository, or a `.git`, common or bare repository directory: no working tree.
  if (
    !top?.error &&
    top?.status !== 0 &&
    /not a git repository|must be run in a work tree/i.test(errorDetail(top?.stderr))
  ) {
    fail('UNSAFE_TARGET', `${label} is not inside a git working tree`);
  }
  if (top?.error || top?.status !== 0) {
    throw new GitReadFailure(
      `git rev-parse failed: ${top?.error?.message ?? errorDetail(top?.stderr)}`,
    );
  }
  const toplevel = asBuffer(top.stdout).toString('utf8').trim();
  if ((await canonical(toplevel, `the toplevel of ${label}`)) !== root) {
    fail('UNSAFE_TARGET', `${label} is not the toplevel of its working tree`);
  }
  const common = async (where, name) =>
    canonical(
      (
        await readGit(ctx, where, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
      ).stdout
        .toString('utf8')
        .trim(),
      `the git common directory of ${name}`,
    );
  if ((await common(root, label)) !== (await common(ctx.cwd, 'cwd'))) {
    fail('UNSAFE_TARGET', `${label} does not belong to the repository of cwd`);
  }
  return root;
}

// Replaces the tracked plan `<P>` in `sourceRoot` with the working-tree bytes of the verified
// `HEAD` commit when all of these hold: `sourceRoot` is the checkout `plan-reviewed` recorded; a
// confirmed delivery head; a recorded archive path listed on that head; `HEAD:<P>` in working-tree
// form still hashing to the preflight `planSha256`; an index entry equal to `HEAD:<P>`; and a
// working copy hashing to `reviewedPlanSha256`. `HEAD`, the index entry and the working copy are
// re-checked immediately before the write. Every `HEAD:<P>` comparison uses the working-tree form,
// so end-of-line and smudge filters never make an unchanged plan look changed. The plan path is
// never overwritten and the reviewed copy is never deleted: the working copy is moved aside and
// re-hashed, hard-linked into the run ledger directory (`retainedCopy`, an absolute path), and
// `HEAD`'s bytes are installed by a hard link from an exclusive temporary file, so a file recreated
// at the plan path in the meantime wins. No `git restore` runs, so the index is never touched. Results:
// - `{ result: 'restored', planPath, retainedCopy }`;
// - `{ result: 'not-applicable', reason }` when nothing in `sourceRoot` is run-owned:
//   `issue-source`, `untracked` (no `HEAD:<P>`, which covers a plan archival already moved there),
//   `missing` (no working copy) or `unchanged` (the working copy equals `HEAD:<P>` in
//   working-tree form);
// - `{ result: 'kept', reason, planPath }` naming the failed precondition: `source-root-mismatch`
//   (checked first, before anything in `sourceRoot` is read), `working-copy-unsafe`,
//   `head-unreadable` (`HEAD:<P>` is no regular file or exceeds the plan bound),
//   `delivery-unconfirmed`, `unarchived`, `archive-not-on-head`, `head-moved`, `staged-change`,
//   `review-unrecorded`, `working-copy-changed` (also when a file was recreated at the plan path
//   before the install, then with `retainedCopy`), `git-read-failed` with a one-line `detail` when
//   a Git read fails (the `sourceRoot` checks included), `retain-failed` with a `detail` and
//   `putBack` when the reviewed copy cannot be linked into the run ledger (a guard refusal, or
//   EXDEV: the ledger directory must be on the checkout's filesystem; with `putBack: false` the
//   `detail` names where the copy is; when the moved-aside name cannot be removed after a
//   successful link, `retain-failed` also carries `retainedCopy`), or `restore-failed` with a
//   `detail` when moving the copy aside or the install fails (the latter with `retainedCopy` and
//   `putBack`, whether the retained copy was linked back to the plan path). A kept copy is never an
//   error.
async function planCopyRestoreOperation(input, deps) {
  closed(input, ['cwd', 'runId', 'sourceRoot'], [], 'input');
  requireRunId(input.runId);
  const ctx = await rootContext(input, deps);
  const ledger = await openLedger(ctx, input.runId);
  requireAbsoluteSourceRoot(input.sourceRoot);
  const { source } = ledger;
  // Nothing in an issue source's checkout is run-owned, so its root is never even checked.
  if (source?.kind !== 'plan') return { result: 'not-applicable', reason: 'issue-source' };
  const planPath = source.planPath;
  const notApplicable = (reason) => ({ result: 'not-applicable', reason, planPath });
  const kept = (reason, extra = {}) => ({ result: 'kept', reason, planPath, ...extra });
  try {
    const root = await requireSourceRoot(ctx, input.sourceRoot);
    if (typeof source.sourceRoot === 'string' && source.sourceRoot !== root) {
      return kept('source-root-mismatch');
    }
    return await restorePlanCopy(ctx, root, ledger, deps, { planPath, notApplicable, kept });
  } catch (error) {
    if (error instanceof GitReadFailure) return kept('git-read-failed', { detail: error.message });
    throw error;
  }
}

async function restorePlanCopy(ctx, root, ledger, deps, { planPath, notApplicable, kept }) {
  const { source } = ledger;
  const commit = await headCommit(ctx, root);
  const head = commit === null ? null : await treeEntry(ctx, root, commit, planPath);
  if (head === null) return notApplicable('untracked');
  const working = await readPlanFile(root, planPath);
  if (working.state === 'missing') return notApplicable('missing');
  if (working.state === 'unsafe') return kept('working-copy-unsafe');
  const headBytes = await workingFormBytes(ctx, root, commit, planPath, head);
  if (headBytes === null) return kept('head-unreadable');
  const headSha256 = sha256(headBytes);
  if (working.sha256 === headSha256) return notApplicable('unchanged');

  const delivery = isObject(ledger.delivery) ? ledger.delivery : {};
  if (typeof delivery.headOid !== 'string') return kept('delivery-unconfirmed');
  if (typeof delivery.archivePath !== 'string') return kept('unarchived');
  const archived = await treeEntry(ctx, root, delivery.headOid, delivery.archivePath);
  if (archived === null || archived.type !== 'blob') return kept('archive-not-on-head');
  if (headSha256 !== source.planSha256) return kept('head-moved');
  if (!(await indexMatches(ctx, root, planPath, head))) return kept('staged-change');
  if (typeof source.reviewedPlanSha256 !== 'string' || typeof source.sourceRoot !== 'string') {
    return kept('review-unrecorded');
  }
  if (working.sha256 !== source.reviewedPlanSha256) return kept('working-copy-changed');

  if (typeof deps.beforePlanRestore === 'function') await deps.beforePlanRestore();
  // Immediately before the write: the same HEAD commit, an unchanged index entry and the reviewed
  // working copy. The install writes the bytes read from that verified commit, which hash to the
  // preflight `planSha256`, not whatever `HEAD` names now.
  if ((await headCommit(ctx, root)) !== commit) return kept('head-moved');
  if (!(await indexMatches(ctx, root, planPath, head))) return kept('staged-change');
  const current = await readPlanFile(root, planPath);
  if (current.state !== 'file') return kept('working-copy-unsafe');
  if (current.sha256 !== source.reviewedPlanSha256) return kept('working-copy-changed');
  // The check above and the install leave a window in which an editor can save the plan. Moving
  // the file aside first closes it: the rename captures whatever is on disk at that instant, and it
  // is hashed again before anything is installed.
  const target = path.join(root, ...planPath.split('/'));
  if (typeof deps.afterPlanRestoreChecks === 'function') await deps.afterPlanRestoreChecks();
  const aside = `${target}.autopilot-restore-${randomBytes(6).toString('hex')}`;
  try {
    await rename(target, aside);
  } catch (error) {
    return kept('restore-failed', { detail: String(error?.message ?? error) });
  }
  if (typeof deps.afterPlanMovedAside === 'function') await deps.afterPlanMovedAside();
  // Puts the moved-aside copy back without clobbering a file recreated at the plan path.
  const putBack = async () => {
    try {
      await link(aside, target);
      await unlink(aside);
      return true;
    } catch {
      return false;
    }
  };
  let moved;
  try {
    moved = sha256(await readBoundedRegular(aside, MAX_PLAN_BYTES, 'the plan'));
  } catch {
    moved = null;
  }
  if (moved !== source.reviewedPlanSha256) {
    const back = await putBack();
    return kept('working-copy-changed', back ? {} : { detail: `saved copy kept at ${aside}` });
  }
  if (typeof deps.afterPlanAsideVerified === 'function') await deps.afterPlanAsideVerified();

  // The reviewed copy is never deleted: a write through a descriptor opened before the move lands
  // in this inode after the hash check, so the same inode is hard-linked into the run ledger
  // directory, through the runtime-state guard and under a fresh name (a no-clobber link, so the
  // ledger directory must be on the checkout's filesystem; EXDEV is `retain-failed`, and nothing
  // is copied). A failed link restores nothing and puts the copy back.
  const directory = runDirectory(ctx, ledger.runId);
  const retainedCopy = path.join(directory, `plan-copy-${randomBytes(8).toString('hex')}.md`);
  try {
    await guardTarget(ctx, retainedCopy);
    await assertDirectoryChain(ctx.cwd, directory);
    await (deps.retainLink ?? link)(aside, retainedCopy);
  } catch (error) {
    const back = await putBack();
    return kept('retain-failed', {
      detail:
        String(error?.message ?? error) + (back ? '' : `; the reviewed copy is kept at ${aside}`),
      putBack: back,
    });
  }
  // Puts the retained copy back at the plan path without clobbering a file recreated there.
  const linkBack = async () => {
    try {
      await link(retainedCopy, target);
      return true;
    } catch {
      return false;
    }
  };
  try {
    await unlink(aside);
  } catch (error) {
    return kept('retain-failed', {
      detail: `cannot remove ${aside}: ${error?.code ?? error?.message}`,
      retainedCopy,
      putBack: await linkBack(),
    });
  }

  // Installs `HEAD`'s bytes from an exclusive temporary sibling by a hard link, which never
  // replaces an existing plan path; the temporary file is removed on every path. A failed install
  // puts the retained copy back at the plan path, also without clobbering.
  const temporary = `${target}.autopilot-install-${randomBytes(6).toString('hex')}`;
  let created = false;
  try {
    const handle = await open(
      temporary,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | O_NOFOLLOW,
      head.mode === '100755' ? 0o755 : 0o644,
    );
    created = true;
    try {
      await handle.writeFile(headBytes);
    } finally {
      await handle.close();
    }
    if (typeof deps.beforePlanInstall === 'function') await deps.beforePlanInstall();
    await link(temporary, target);
  } catch (error) {
    if (error?.code === 'EEXIST' && created) {
      return kept('working-copy-changed', { retainedCopy });
    }
    return kept('restore-failed', {
      detail: String(error?.message ?? error),
      retainedCopy,
      putBack: await linkBack(),
    });
  } finally {
    if (created) await unlink(temporary).catch(() => {});
  }
  return { result: 'restored', planPath, retainedCopy };
}

// ---------------------------------------------------------------------------------------------
// Dispatch and envelopes

const HANDLERS = Object.freeze({
  'run-init': runInitOperation,
  'decision-classify': classifyOperation,
  'decision-extract': extractOperation,
  'decision-record': decisionRecordOperation,
  'blocker-record': blockerRecordOperation,
  'fit-record': fitRecordOperation,
  'base-move-record': baseMoveRecordOperation,
  'delivery-base-check': deliveryBaseCheckOperation,
  'delivery-base-record': deliveryBaseRecordOperation,
  'plan-reviewed': planReviewedOperation,
  'delivery-record': deliveryRecordOperation,
  'delivery-confirm': confirmDeliveryOperation,
  'consent-check': consentCheckOperation,
  'run-check': runCheckOperation,
  'pr-appendix': prAppendixOperation,
  'appendix-merge': appendixMergeOperation,
  'plan-copy-restore': planCopyRestoreOperation,
  'run-close': runCloseOperation,
  'ledger-list': ledgerListOperation,
  'ledger-prune': ledgerPruneOperation,
});

export async function executeOperation(operation, input = {}, deps = {}) {
  try {
    if (!AUTOPILOT_OPERATIONS.includes(operation)) invalid(`unknown operation: ${operation}`);
    const data = await HANDLERS[operation](input, deps);
    return { ok: true, operation, data };
  } catch (error) {
    return errorEnvelope(operation, error);
  }
}

export function errorEnvelope(operation, error) {
  if (error instanceof AutopilotError || error instanceof RuntimeStateError) {
    return {
      ok: false,
      operation: operation ?? null,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details && Object.keys(error.details).length > 0
          ? { details: error.details }
          : {}),
      },
    };
  }
  return {
    ok: false,
    operation: operation ?? null,
    error: { code: 'INTERNAL', message: error?.message ?? String(error) },
  };
}

// Exit code 2 for a caller error (including a run that is not open), 1 for everything else.
export function exitCodeFor(envelope) {
  if (envelope.ok) return 0;
  return [
    'INVALID_INPUT',
    'INVALID_SCORE',
    'ESCAPE_SCORED',
    'DUPLICATE_RESCORE',
    'RUN_NOT_OPEN',
  ].includes(envelope.error.code)
    ? 2
    : 1;
}
