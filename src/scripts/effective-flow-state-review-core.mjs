// Runtime-state helper: the two `review` operations. `review open-report` is the overflow path of
// `review`'s local-mode persistence: it guards and creates `.effective-flow/review/`, allocates the `review-report-local` path,
// and reserves the report's finding IDs.
//
//   review open-report  {cwd, owner: {workflow: "review"}, count, waitSeconds?}
//
// It composes the existing parts instead of copying them: the directory guard of
// `runtime-state-guard.mjs`, the allocation of `dated-name-allocation.mjs` that `mechanics
// name-allocate` runs for the same family, with the same clock (`deps.now`) and time-zone
// (`deps.timeZone`, the process zone by default) sources, so both compute the same date, and the
// `memory reserve` transaction of `effective-flow-state-memory-core.mjs` with its outcomes
// (MIGRATION_REQUIRED, LOCK_HELD, LEGACY_MEMORY_INVALID and the others). The report directory is
// fixed here and no caller supplies it. The path is computed and guarded before anything is
// reserved, so a failed allocation or guard reserves nothing; a migration that is still required
// is reported before any directory is created. It writes no report file: the content stays with the
// caller. The result is the reserve result plus `reportPath` (absolute, already guarded),
// `reportName` and `reportDate`.
//
//   review write-report  {cwd, owner: {workflow: "review"}, language, invocationPrefix, scope,
//                         projectType, findings, skipped?, closedObservations?, notesFiltered?,
//                         validationSkipped?, waitSeconds?}
//
// The local-mode persistence of `review` as one call: it validates and sanitises the admitted
// findings (`review-report-render.mjs` owns that content contract), runs the read-only migration
// precheck, guards and creates the report directory and allocates the path as `open-report` does,
// reserves exactly one ID per finding, renders the report and creates it through the no-clobber
// primitive of `runtime-state-guard.mjs`, and returns the chat summary. A path taken between the
// allocation and the create is re-allocated here, at most MAX_REPORT_REALLOCATIONS times. Every
// failure before the reservation reserves nothing (INVALID_INPUT naming the key and finding index,
// MIGRATION_REQUIRED, the guard refusals, the reserve outcomes such as LOCK_HELD); every failure
// after it is the outcome REPORT_WRITE_FAILED with the reserved range, the failing step and any
// guard code, and leaves no report file of this call (`foreignPath` names a foreign file that took
// the report name, which stays). The result is the reserve result plus `reportPath`,
// `reportName`, `reportDate`, `ids` and `summary`. It only creates new reports: augmenting an
// existing one stays outside this operation.

import nodeFs from 'node:fs';
import path from 'node:path';
import { MechanicsError, allocateReviewReportLocal } from './dated-name-allocation.mjs';
import {
  OPERATION_KEYS,
  StateError,
  StateOutcome,
  fail,
  makeContext,
  requireClosedKeys,
  requireObject,
  requireOwnerInput,
  requireRootSyntax,
  requireWaitSeconds,
  resolveRoot,
} from './effective-flow-state-core.mjs';
import {
  MAX_RESERVE_COUNT,
  formatFindingId,
  precheckMigration,
  reserveMemory,
} from './effective-flow-state-memory-core.mjs';
import {
  ReportInputError,
  normaliseReportInput,
  renderReport,
  renderSummary,
} from './review-report-render.mjs';
import {
  RUNTIME_STATE_DIR,
  RuntimeStateError,
  createNoClobber,
  ensureGuardedDirectory,
  guardTarget,
} from './runtime-state-guard.mjs';

export const REVIEW_REPORT_DIR = `${RUNTIME_STATE_DIR}/review`;
export const REVIEW_WORKFLOW = 'review';
// How often `write-report` re-allocates a report path another writer took before its create.
export const MAX_REPORT_REALLOCATIONS = 3;
// The temporary-file family of the report create: `.write-report-<16 hex>.tmp`, which matches no
// `review-report-*` name and no `*.md` reader glob.
export const REPORT_TEMP_PREFIX = '.write-report-';
// The guard refusals a REPORT_WRITE_FAILED outcome names, so the run keeps its setup handling.
const GUARD_CODES = Object.freeze(['RUNTIME_STATE_UNSAFE', 'UNSAFE_TARGET']);

function requireReviewOwner(value) {
  const owner = requireOwnerInput('memory', value);
  if (owner.workflow !== REVIEW_WORKFLOW) {
    fail('INVALID_INPUT', `owner.workflow must be ${REVIEW_WORKFLOW}`);
  }
  return owner;
}

function requireRequest(input) {
  requireObject(input, 'input');
  requireClosedKeys(input, OPERATION_KEYS['review open-report'], 'input');
  const owner = requireReviewOwner(input.owner);
  requireWaitSeconds(input.waitSeconds);
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > MAX_RESERVE_COUNT) {
    fail('INVALID_INPUT', `count must be an integer from 1 to ${MAX_RESERVE_COUNT}`);
  }
  return owner;
}

// The allocation's own refusals keep their meaning: an unsafe report directory is UNSAFE_TARGET,
// anything else an internal failure.
function allocate(cwd, deps) {
  try {
    return allocateReviewReportLocal(deps.allocationFs ?? nodeFs, {
      cwdReal: cwd,
      dir: REVIEW_REPORT_DIR,
      now: new Date((deps.now ?? Date.now)()),
      timeZone: deps.timeZone,
    });
  } catch (error) {
    if (error instanceof MechanicsError) {
      throw new StateError(
        error.code === 'UNSAFE_PATH' ? 'UNSAFE_TARGET' : 'INTERNAL_ERROR',
        `cannot allocate the review report path: ${error.message}`,
      );
    }
    throw error;
  }
}

// Guards and creates `.effective-flow/review/` and allocates a guarded report path; nothing is
// reserved. Shared by `open-report` and `write-report`.
async function prepareReportPath(context, deps) {
  const stateDir = path.join(context.cwd, RUNTIME_STATE_DIR);
  const reviewDir = path.join(context.cwd, REVIEW_REPORT_DIR);
  await ensureGuardedDirectory(context, stateDir);
  await ensureGuardedDirectory(context, reviewDir);
  await guardTarget(context, reviewDir);
  return allocateGuarded(context, deps);
}

async function allocateGuarded(context, deps) {
  const allocation = allocate(context.cwd, deps);
  const reportPath = path.join(context.cwd, ...allocation.path.split('/'));
  await guardTarget(context, reportPath);
  return { ...allocation, reportPath };
}

function reserveInput(input, owner, count) {
  return {
    cwd: input.cwd,
    owner: { workflow: owner.workflow },
    count,
    ...(input.waitSeconds === undefined ? {} : { waitSeconds: input.waitSeconds }),
  };
}

export async function openReport(input, deps) {
  const owner = requireRequest(input);
  const context = makeContext(deps);
  await requireRootSyntax(input.cwd);
  await resolveRoot(context, input.cwd);
  // Read-only, before any directory exists: the reserve transaction re-checks under the lock.
  const pending = await precheckMigration(context);
  if (pending instanceof StateOutcome) return pending;

  const allocation = await prepareReportPath(context, deps);
  const reserved = await reserveMemory(reserveInput(input, owner, input.count), deps);
  if (reserved instanceof StateOutcome) return reserved;
  return {
    ...reserved,
    reportPath: allocation.reportPath,
    reportName: allocation.name,
    reportDate: allocation.date,
  };
}

// ---------------------------------------------------------------------------------------------
// review write-report

// Validates the whole input before any Git call: the closed keys, the review owner, the wait, and
// the report content. A refused content field is INVALID_INPUT carrying `key` and, for a finding
// field, `findingIndex`.
function requireWriteRequest(input) {
  requireObject(input, 'input');
  requireClosedKeys(input, OPERATION_KEYS['review write-report'], 'input');
  const owner = requireReviewOwner(input.owner);
  requireWaitSeconds(input.waitSeconds);
  const { cwd: _cwd, owner: _owner, waitSeconds: _wait, ...content } = input;
  try {
    return { owner, report: normaliseReportInput(content, { maxFindings: MAX_RESERVE_COUNT }) };
  } catch (error) {
    if (!(error instanceof ReportInputError)) throw error;
    const failure = new StateError('INVALID_INPUT', error.message);
    failure.envelopeDetails = {
      key: error.key,
      ...(error.findingIndex === undefined ? {} : { findingIndex: error.findingIndex }),
    };
    throw failure;
  }
}

// One step after the reservation; a throw becomes REPORT_WRITE_FAILED naming `step`.
class StepFailure extends Error {
  constructor(step, cause) {
    super(cause?.message ?? String(cause), { cause });
    this.step = step;
  }
}

async function step(name, fn) {
  try {
    return await fn();
  } catch (error) {
    throw new StepFailure(name, error);
  }
}

function writeFailed(reserved, failure) {
  const cause = failure.cause;
  const code = cause instanceof RuntimeStateError ? cause.code : undefined;
  return new StateOutcome('REPORT_WRITE_FAILED', {
    first: reserved.first,
    last: reserved.last,
    firstId: reserved.firstId,
    lastId: reserved.lastId,
    count: reserved.count,
    step: failure.step,
    ...(GUARD_CODES.includes(code) ? { guardCode: code } : {}),
    ...(typeof cause?.foreignPath === 'string' ? { foreignPath: cause.foreignPath } : {}),
    message: failure.message,
  });
}

// Renders the report and its summary for the reserved IDs and creates the report, re-allocating a
// taken path. Both are rendered before the create, so nothing can fail once the file exists.
// Returns the allocation the report was created at and the summary.
async function createReport(context, deps, report, ids, first) {
  let allocation = first;
  for (let attempt = 0; ; attempt += 1) {
    const { content, summary } = await step('render', () => ({
      content: renderReport(report, { ids, date: allocation.date }),
      summary: renderSummary(report, { ids, reportPath: allocation.reportPath }),
    }));
    const created = await step('create', () =>
      createNoClobber(context, allocation.reportPath, content, {
        tempPrefix: REPORT_TEMP_PREFIX,
        fs: context.fs,
        now: deps.now,
      }),
    );
    if (created.created) return { allocation, summary };
    if (attempt >= MAX_REPORT_REALLOCATIONS) {
      throw new StepFailure(
        'create',
        new Error(
          `the report path was taken ${attempt + 1} times; it was re-allocated ${MAX_REPORT_REALLOCATIONS} times`,
        ),
      );
    }
    allocation = await step('allocate', () => allocateGuarded(context, deps));
  }
}

export async function writeReport(input, deps) {
  const { owner, report } = requireWriteRequest(input);
  const context = makeContext(deps);
  await requireRootSyntax(input.cwd);
  await resolveRoot(context, input.cwd);
  const pending = await precheckMigration(context);
  if (pending instanceof StateOutcome) return pending;

  const allocation = await prepareReportPath(context, deps);
  const reserved = await reserveMemory(reserveInput(input, owner, report.findings.length), deps);
  if (reserved instanceof StateOutcome) return reserved;

  const ids = [];
  for (let number = reserved.first; number <= reserved.last; number += 1) {
    ids.push(formatFindingId(number));
  }
  try {
    const { allocation: written, summary } = await createReport(
      context,
      deps,
      report,
      ids,
      allocation,
    );
    return {
      ...reserved,
      reportPath: written.reportPath,
      reportName: written.name,
      reportDate: written.date,
      ids,
      summary,
    };
  } catch (error) {
    if (error instanceof StepFailure) return writeFailed(reserved, error);
    return writeFailed(reserved, new StepFailure('create', error));
  }
}
