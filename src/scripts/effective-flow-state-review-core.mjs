// Runtime-state helper: `review open-report`, the local-mode persistence step of `review` in one
// call: it guards and creates `.effective-flow/review/`, allocates the `review-report-local` path,
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
  precheckMigration,
  reserveMemory,
} from './effective-flow-state-memory-core.mjs';
import { RUNTIME_STATE_DIR, ensureGuardedDirectory, guardTarget } from './runtime-state-guard.mjs';

export const REVIEW_REPORT_DIR = `${RUNTIME_STATE_DIR}/review`;
export const REVIEW_WORKFLOW = 'review';

function requireRequest(input) {
  requireObject(input, 'input');
  requireClosedKeys(input, OPERATION_KEYS['review open-report'], 'input');
  const owner = requireOwnerInput('memory', input.owner);
  if (owner.workflow !== REVIEW_WORKFLOW) {
    fail('INVALID_INPUT', `owner.workflow must be ${REVIEW_WORKFLOW}`);
  }
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

export async function openReport(input, deps) {
  const owner = requireRequest(input);
  const context = makeContext(deps);
  await requireRootSyntax(input.cwd);
  await resolveRoot(context, input.cwd);
  // Read-only, before any directory exists: the reserve transaction re-checks under the lock.
  const pending = await precheckMigration(context);
  if (pending instanceof StateOutcome) return pending;

  const stateDir = path.join(context.cwd, RUNTIME_STATE_DIR);
  const reviewDir = path.join(context.cwd, REVIEW_REPORT_DIR);
  await ensureGuardedDirectory(context, stateDir);
  await ensureGuardedDirectory(context, reviewDir);
  await guardTarget(context, reviewDir);
  const allocation = allocate(context.cwd, deps);
  const reportPath = path.join(context.cwd, ...allocation.path.split('/'));
  await guardTarget(context, reportPath);

  const reserved = await reserveMemory(
    {
      cwd: input.cwd,
      owner: { workflow: owner.workflow },
      count: input.count,
      ...(input.waitSeconds === undefined ? {} : { waitSeconds: input.waitSeconds }),
    },
    deps,
  );
  if (reserved instanceof StateOutcome) return reserved;
  return {
    ...reserved,
    reportPath,
    reportName: allocation.name,
    reportDate: allocation.date,
  };
}
