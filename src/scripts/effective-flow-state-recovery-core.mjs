// Runtime-state helper: the delivery-progress ledger operations, the release transition and the
// resume adoption of a retained `partial-diff` record, and the read-only resume operations.
//
//   ledger init           {cwd, executionRoot, recordId, sessionId, manifest, groups, base,
//                          visibility, language}
//   ledger append         {cwd, executionRoot, recordId, sessionId, commitOid}
//   ledger reconcile      {cwd, executionRoot, recordId, sessionId}
//   worktree resume-check {cwd, executionRoot, recordId, visibility}
//   worktree transition   with `release: "partial-diff"` or `adoption: "partial-diff-resume"`
//                         (`recoveryTransition`)
//
// `ledger init` writes the private ledger of an `active` `partial-diff` record once, no-clobber,
// under the record lock, from descriptors the helper computes itself; `ledger append` adds one
// verified commit. The release moves a retained `partial-diff` record from `aborted` or `failed`
// to `cleanup-ready` under its own proofs (`releaseProofs`); the resume adoption moves it back to
// `active` for a new session under its own proofs (`resumeProofs`), recording at most one proven
// tip commit the failed run had not recorded. Both run through the record lock, record reading
// and writing of `transition` in `effective-flow-state-worktree-core.mjs`. `worktree resume-check`
// evaluates both proof sets without taking the lock or writing anything, and `ledger reconcile`
// compares the resumed worktree with the ledger's descriptors (`reconcileResume`), read-only too.
//
// Layering: this module imports `effective-flow-state-worktree-core.mjs` (the record, lock, fact
// and guarded-Git internals it exports) and `effective-flow-state-ledger-core.mjs` (the ledger's
// schema, file and comparisons); neither imports this module back. `effective-flow-state-core.mjs`
// dispatches `ledger init`, `ledger append` and every `worktree transition` input that carries
// `release` here. Every Git call inside the recorded worktree or the selection's source root runs
// only after the common-directory proof of that root, and with `core.fsmonitor=false`.

import { isDeepStrictEqual } from 'node:util';
import { asBuffer } from './runtime-state-guard.mjs';
import { StateOutcome, fail, requireObject } from './effective-flow-state-core.mjs';
import {
  DeliverySelectionError,
  describeDeliveryEndpoints,
  inspectResidual,
  reconcileResume,
  validateSelectionManifest,
  verifySourceEndpoint,
  verifySourceManifest,
  workingEndpointMatches,
} from './delivery-selection-core.mjs';
import {
  LEDGER_LANGUAGES,
  LEDGER_MAX_BYTES,
  LEDGER_VISIBILITIES,
  branchHistory,
  commitGroupProblems,
  createLedger,
  groupPlanProblem,
  ledgerExists,
  ledgerGroups,
  ledgerPaths,
  ledgerProgress,
  makeLedger,
  readLedger,
  replaceLedger,
  reportedPaths,
  residualEndpoints,
  restoreResidual,
  sameImmutablePart,
  serializeLedger,
  stagedGroupState,
  worstCaseLedgerBytes,
} from './effective-flow-state-ledger-core.mjs';
import {
  OID_PATTERN,
  VISIBILITIES,
  deferSignals,
  evaluateEligibility,
  gatherFacts,
  guardedGit,
  interruptedUnderLock,
  isBranchName,
  itemDigest,
  listWorktrees,
  lockStillOwned,
  observedLock,
  openRoots,
  phase,
  prepare,
  proveSourceRoot,
  readRecord,
  recordPaths,
  requireRecordId,
  requireSessionId,
  selectionRunner,
  transition,
  withRecordLock,
} from './effective-flow-state-worktree-core.mjs';

function gitOk(result) {
  return !result?.error && result?.status === 0;
}

// Runs one reused selection function; a DeliverySelectionError (the function could not prove or
// read what it needs) is null, every other error propagates.
async function selectionCall(fn) {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof DeliverySelectionError) return null;
    throw error;
  }
}

// The memo of the read-only checks `worktree resume-check` evaluates for both proof sets
// (`checkMemo`): `once(key, compute)` runs `compute` for the first call of `key` and hands every
// later call the same result, so the resume and the release evaluation share one `inspectResidual`
// of the unrecorded endpoints and one source proof and `verifySourceManifest`. The transitions
// evaluate under their own lock without a memo (`unmemoized`): every check runs where it is called.
function checkMemo() {
  const results = new Map();
  return (key, compute) => {
    if (!results.has(key)) results.set(key, compute());
    return results.get(key);
  };
}

function unmemoized(_key, compute) {
  return compute();
}

// The removal conditions of `facts` for `statuses`, without those in `skip`, as the stable proof
// identifiers `condition-<n>`.
function conditionProofs(facts, statuses, skip) {
  return evaluateEligibility(facts, { statuses })
    .filter((condition) => !skip.includes(condition))
    .map((condition) => `condition-${condition}`);
}

// The ledger binding of `record`: the fields a ledger must repeat exactly.
export function ledgerBinding(record) {
  return {
    recordId: record.recordId,
    creationOid: record.creationOid,
    worktreePath: record.worktreePath,
    branch: record.branch,
    receiptDigest: itemDigest(record.receipt),
  };
}

// The proofs of the release transition, which replace the session-ownership check. Each failed
// proof is reported by its stable identifier in `proofs` of NOT_ELIGIBLE, and a refusal changes
// nothing:
//   purpose       the record is a `partial-diff` record
//   condition-1   schema-valid, `effective-flow-created`, `aborted` or `failed`
//   condition-2 … condition-6, condition-9   registration, receipt, branch and tip, creation
//                 ancestry, no foreign lock or claim (7, the clean status, is the route below)
// and one route:
//   gone     the worktree is fully gone (unregistered and `lstat` ENOENT, the proof cleanup's
//            `goneRemovable` takes): only condition-1, condition-6, condition-9 and the receipt
//            fields of condition-2 apply, since the others need the worktree; nothing runs inside
//            it. A half-gone worktree (registered without its directory, or a path present without
//            the registration, another repository's checkout included) is `half-gone` with its
//            `shape` (`registered-missing-directory` or `unregistered-directory`): cleanup could
//            never remove it
//   clean    the worktree is clean: nothing to restore, with or without a ledger
//   ledger   the worktree is dirty and a valid ledger is bound to the record: `residual` (no dirty
//            or untracked path outside the uncommitted residual, every dirty residual endpoint
//            holds its descriptor's kind, mode and bytes, and every clean one holds its
//            descriptor or HEAD's state again, as a release that stopped part-way left it),
//            `index` (each staged residual entry is HEAD's or its descriptor's blob) and `source`
//            (`verifySourceManifest` is exact, so every discarded byte is still in the source).
//            Then, after the last lock check, the source is verified once more, each dirty
//            residual path is re-checked against its source (`verifySourceEndpoint`: the source's
//            repository, root and HEAD and the manifest entry covering the path) and then, as the
//            last read immediately before it is discarded, against its descriptor (working tree,
//            the index entry HEAD's or the descriptor's, and for a tracked path no index entry at
//            a parent or below it), exactly the dirty residual paths are restored
//            (`restoreResidual`) and the worktree is proven clean
// A dirty worktree without a valid ledger is `residual`, with the exact dirty paths listed.
// Returns `{route, restored}` or the NOT_ELIGIBLE outcome. A signal seen at the last check before
// the restore is INTERRUPTED with nothing written and nothing restored; once the restore has
// started it runs to its end, and `transition` completes the record write for a release that
// restored paths (INTERRUPTED with `written: true` and the `release`, see `deferSignals`). A
// restore that stops part-way is an error that names the paths already restored and the index
// entries already removed, with the record unchanged; the retry releases the rest.
async function releaseProofs({ context, roots, paths, record, held, signals, deps }) {
  const worktrees = await listWorktrees(context);
  const facts = await gatherFacts(context, roots, worktrees, record, { ownLock: held.token });
  const evaluation = await evaluateRelease({ context, roots, record, facts });
  if (evaluation.refusal) {
    return new StateOutcome('NOT_ELIGIBLE', {
      recordId: record.recordId,
      proofs: evaluation.refusal.proofs,
      ...evaluation.refusal.details,
    });
  }
  if (evaluation.route !== 'ledger') return { route: evaluation.route, restored: [] };
  const { ledger, descriptors, source, runner, residual } = evaluation;
  await phase(deps, 'releaseProven', { recordId: record.recordId });
  if (signals.signal) return interruptedUnderLock(signals, record.recordId, record.status);
  if (!(await lockStillOwned(context, paths, held))) {
    fail('WRITE_FAILED', `the lock of ${paths.record} was lost before the release restore`);
  }
  // The source again, after the last lock check and before the first discard, and each path's
  // source right before its own discard: what the release discards must still be in the source
  // when it is discarded.
  if (!(await sourceIsExact(ledger.manifest, source, runner))) {
    return new StateOutcome('NOT_ELIGIBLE', {
      recordId: record.recordId,
      proofs: ['source'],
      route: 'ledger',
    });
  }
  const inWorktree = guardedGit(context, record.worktreePath);
  const restored = await restoreResidual({
    git: inWorktree,
    fs: context.fs,
    root: record.worktreePath,
    residual,
    descriptors,
    // The phase opens each path's re-checks: its source first, its delivery checkout last.
    sourceRecheck: async (descriptor) => {
      await phase(deps, 'releaseRecheck', { recordId: record.recordId, path: descriptor.path });
      return await sourceEndpointIsExact(ledger.manifest, source, descriptor.path, runner);
    },
    recheck: async (descriptor) =>
      (await selectionCall(() =>
        workingEndpointMatches(record.worktreePath, descriptor, { runner }),
      )) === true,
  });
  const status = await inWorktree([
    'status',
    '--porcelain',
    '--untracked-files=all',
    '--ignore-submodules=none',
  ]);
  if (!gitOk(status) || asBuffer(status.stdout).length !== 0) {
    fail(
      'GIT_FAILED',
      `the release restore did not leave the worktree clean; already restored: ${restored.join(', ')}; the record is unchanged`,
    );
  }
  return { route: 'ledger', restored };
}

// Whether `verifySourceManifest` of `manifest` is exact at the proven `source` (null: not proven).
async function sourceIsExact(manifest, source, runner) {
  return (
    source !== null &&
    (await selectionCall(() => verifySourceManifest({ manifest, sourceRoot: source }, { runner })))
      ?.exact === true
  );
}

// Whether `verifySourceEndpoint` of `manifest` for `repoPath` is exact at the proven `source`
// (null: not proven).
async function sourceEndpointIsExact(manifest, source, repoPath, runner) {
  return (
    source !== null &&
    (
      await selectionCall(() =>
        verifySourceEndpoint({ manifest, sourceRoot: source, path: repoPath }, { runner }),
      )
    )?.exact === true
  );
}

// The read-only part of the release proofs over `facts` (`gatherFacts` of the record): every
// proof and the route, without the restore. Returns `{refusal: {proofs, details}}`, `{route:
// 'gone' | 'clean'}`, or for the ledger route `{route: 'ledger', ledger, descriptors, source,
// runner, residual}` with what the restore needs. Every Git call inside the worktree runs only
// once conditions 3 and 4 hold (its registration and its common directory proven ours). `once` is
// the memo `worktree resume-check` shares with `evaluateResume` (see `checkMemo`).
async function evaluateRelease({ context, roots, record, facts, once = unmemoized }) {
  const refuse = (proofs, details = {}) => ({ refusal: { proofs, details } });
  const purpose = record.purpose === 'partial-diff' ? [] : ['purpose'];
  const statuses = ['aborted', 'failed'];
  if (facts.registrationCount === 0 || !facts.directoryExists) {
    const proofs = [
      ...purpose,
      ...(facts.gone ? [] : ['half-gone']),
      ...conditionProofs(facts, statuses, [2, 3, 4, 5, 7, 8]),
      ...(facts.receiptFieldsMatch ? [] : ['condition-2']),
    ].sort(proofOrder);
    if (!facts.gone) {
      return refuse(proofs, {
        route: 'gone',
        shape:
          facts.registrationCount > 0 ? 'registered-missing-directory' : 'unregistered-directory',
      });
    }
    return proofs.length > 0 ? refuse(proofs, { route: 'gone' }) : { route: 'gone' };
  }
  const proofs = [...purpose, ...conditionProofs(facts, statuses, [7, 8])];
  if (proofs.length > 0) return refuse(proofs);
  if (facts.clean) return { route: 'clean' };
  // Conditions 3 and 4 hold: the worktree is registered and its common directory proven ours.
  const worktreeRunner = selectionRunner(context, roots, [record.worktreePath]);
  const read = await readLedger(context, roots.cwd, ledgerBinding(record));
  if (read.state !== 'ok') {
    const dirty = await dirtyPaths(record.worktreePath, worktreeRunner);
    return refuse(['residual'], {
      route: 'no-ledger',
      ledger: read.state === 'missing' ? 'missing' : `invalid:${read.reason}`,
      ...(dirty ? { residualPaths: dirty.paths, residualPathCount: dirty.count } : {}),
    });
  }
  const ledger = read.ledger;
  const descriptors = residualEndpoints(ledger);
  const source = await once('source-root', () =>
    proveSourceRoot(context, roots, ledger.manifest, record.worktreePath),
  );
  const runner = selectionRunner(context, roots, [
    record.worktreePath,
    ...(source ? [source] : []),
  ]);
  const residual = await once('residual', () =>
    selectionCall(() =>
      inspectResidual({ deliveryRoot: record.worktreePath, endpoints: descriptors }, { runner }),
    ),
  );
  const content = residual ? unreleasedContent(residual) : [];
  const failed = [];
  if (!residual || residual.extra.length > 0 || content.length > 0) failed.push('residual');
  if (residual && residual.index.length > 0) failed.push('index');
  if (!(await once('source', () => sourceIsExact(ledger.manifest, source, runner)))) {
    failed.push('source');
  }
  if (failed.length > 0) {
    return refuse(failed, {
      route: 'ledger',
      ...(residual
        ? {
            residualPaths: reportedPaths(residual.dirty).paths,
            residualPathCount: residual.dirty.length,
            extra: reportedPaths(residual.extra).paths,
            content: reportedPaths(content).paths,
          }
        : {}),
    });
  }
  return { route: 'ledger', ledger, descriptors, source, runner, residual };
}

// The residual endpoints whose content refuses the ledger route: a dirty endpoint that does not
// hold its descriptor, or a clean one that holds neither its descriptor nor HEAD's state. A clean
// endpoint at HEAD counts as released (a release that stopped part-way restored it already).
function unreleasedContent(residual) {
  const dirty = new Set(residual.dirty);
  const atHead = new Set(residual.atHead);
  return residual.content.filter((repoPath) => dirty.has(repoPath) || !atHead.has(repoPath));
}

// Orders proof identifiers: named proofs first as given, then `condition-<n>` ascending.
function proofOrder(left, right) {
  const number = (value) => (value.startsWith('condition-') ? Number(value.slice(10)) : -1);
  return number(left) - number(right);
}

// The changed paths of a proven worktree (untracked included), capped for a report; null when
// Git cannot list them.
async function dirtyPaths(worktreePath, runner) {
  const residual = await selectionCall(() =>
    inspectResidual({ deliveryRoot: worktreePath, endpoints: [] }, { runner }),
  );
  return residual ? reportedPaths(residual.dirty) : null;
}

// ---------------------------------------------------------------------------------------------
// ledger init and ledger append

function requireExactObject(value, keys, label) {
  requireObject(value, label);
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    fail('INVALID_INPUT', `${label} must contain exactly ${keys.join(', ')}`);
  }
  return value;
}

// The closed input of `ledger init`. The manifest is validated by `validateSelectionManifest` and
// the group plan must be an exact partition of its endpoints; neither carries a descriptor, which
// the helper computes itself.
function requireLedgerInit(input) {
  const recordId = requireRecordId(input.recordId);
  const sessionId = requireSessionId(input.sessionId);
  const base = requireExactObject(input.base, ['branch', 'oid'], 'base');
  if (!isBranchName(base.branch)) fail('INVALID_INPUT', 'base.branch is invalid');
  if (typeof base.oid !== 'string' || !OID_PATTERN.test(base.oid)) {
    fail('INVALID_INPUT', 'base.oid must be a full commit OID');
  }
  if (!LEDGER_VISIBILITIES.includes(input.visibility)) {
    fail('INVALID_INPUT', `visibility must be one of ${LEDGER_VISIBILITIES.join(', ')}`);
  }
  const language = requireExactObject(input.language, ['git', 'forge'], 'language');
  for (const key of ['git', 'forge']) {
    if (!LEDGER_LANGUAGES.includes(language[key])) {
      fail('INVALID_INPUT', `language.${key} must be one of ${LEDGER_LANGUAGES.join(', ')}`);
    }
  }
  let manifest;
  try {
    manifest = validateSelectionManifest(input.manifest);
  } catch (error) {
    if (error instanceof DeliverySelectionError) {
      fail('INVALID_INPUT', `manifest is not a bound selection manifest: ${error.message}`);
    }
    throw error;
  }
  const problem = groupPlanProblem(manifest, input.groups);
  if (problem)
    fail('INVALID_INPUT', `groups must be an exact partition of the endpoints: ${problem}`);
  return {
    recordId,
    sessionId,
    base: { branch: base.branch, oid: base.oid },
    visibility: input.visibility,
    language: { git: language.git, forge: language.forge },
    manifest,
    groups: input.groups,
  };
}

// The record of a ledger write under its lock: valid, `active`, owned by `sessionId`, of this
// repository. Returns the record or the refusal.
async function ownedActiveRecord(context, roots, paths, recordId, sessionId) {
  const read = await readRecord(context, paths, recordId);
  if (read.state === 'missing') return new StateOutcome('RECORD_NOT_FOUND', { recordId });
  if (read.state === 'invalid') {
    fail('INVALID_STATE', `${paths.record} is not a valid record (${read.reason})`);
  }
  const record = read.record;
  if (record.status !== 'active') {
    return new StateOutcome('STATUS_MISMATCH', {
      recordId,
      expected: 'active',
      status: record.status,
    });
  }
  if (record.sessionId !== sessionId) {
    return new StateOutcome('NOT_OWNER', { recordId, reason: 'session-mismatch' });
  }
  if (record.repositoryIdentity !== roots.common || record.runtimeStateRoot !== roots.cwd) {
    return new StateOutcome('NOT_ELIGIBLE', { recordId, proofs: ['repository'] });
  }
  return record;
}

// The worktree proofs of a ledger write: purpose `partial-diff` and the removal conditions 2 to 6
// and 9 of the `active` record (its dirt, condition 7, is the delivery's own content).
async function ledgerWriteProofs(context, roots, record, held) {
  const worktrees = await listWorktrees(context);
  const facts = await gatherFacts(context, roots, worktrees, record, { ownLock: held.token });
  const proofs = [
    ...(record.purpose === 'partial-diff' ? [] : ['purpose']),
    ...conditionProofs(facts, ['active'], [7, 8]),
  ];
  return { facts, proofs };
}

// `ledger init`: writes the ledger of an `active` `partial-diff` record exactly once, after the
// delivery's reconcile and before its first group is staged. Its descriptors come from an internal
// reconcile against the bound manifest (`describeDeliveryEndpoints`), which must be exact; nothing
// in the input is a descriptor. Proofs beyond the record's: `creation-tip` (the branch is still at
// `creationOid`: nothing is committed yet), `base` (`base.oid` is `creationOid`), `source-root`
// (the manifest's source is this repository's and not the delivery worktree) and `reconcile`. A
// ledger whose worst case (`worstCaseLedgerBytes`: every group committed with a 64-hex OID) would
// serialize above LEDGER_MAX_BYTES is not written: `{recordId, written: false, reason:
// "size-bound", bytes, limitBytes, status}` with that worst case as `bytes`, never an error. A
// written ledger reports its size as `bytes` and its worst case as `maxBytes`, so every later
// append stays readable.
export async function ledgerInit(input, deps) {
  const context = prepare('ledger init', input, deps);
  const request = requireLedgerInit(input);
  return deferSignals(deps, request.recordId, async (signals) => {
    const roots = await openRoots(context, input);
    const paths = recordPaths(roots.cwd, request.recordId);
    return withRecordLock(
      context,
      paths,
      { operation: 'ledger init', runId: request.sessionId },
      deps,
      async (held) => {
        await phase(deps, 'underLock', { operation: 'ledger init', recordId: request.recordId });
        const record = await ownedActiveRecord(
          context,
          roots,
          paths,
          request.recordId,
          request.sessionId,
        );
        if (record instanceof StateOutcome) return record;
        const ledgerPath = ledgerPaths(roots.cwd, record.recordId).ledger;
        if (await ledgerExists(context, roots.cwd, record.recordId)) {
          return new StateOutcome('LEDGER_EXISTS', { recordId: record.recordId, path: ledgerPath });
        }
        const { facts, proofs } = await ledgerWriteProofs(context, roots, record, held);
        if (facts.branchTip !== record.creationOid) proofs.push('creation-tip');
        if (request.base.oid !== record.creationOid) proofs.push('base');
        if (proofs.length > 0) {
          return new StateOutcome('NOT_ELIGIBLE', { recordId: record.recordId, proofs });
        }
        const source = await proveSourceRoot(context, roots, request.manifest, record.worktreePath);
        if (!source) {
          return new StateOutcome('NOT_ELIGIBLE', {
            recordId: record.recordId,
            proofs: ['source-root'],
          });
        }
        const runner = selectionRunner(context, roots, [record.worktreePath, source]);
        let described;
        try {
          described = await describeDeliveryEndpoints(
            { manifest: request.manifest, deliveryRoot: record.worktreePath, sourceRoot: source },
            { runner },
          );
        } catch (error) {
          if (!(error instanceof DeliverySelectionError)) throw error;
          return new StateOutcome('NOT_ELIGIBLE', {
            recordId: record.recordId,
            proofs: ['reconcile'],
            selectionError: error.code,
          });
        }
        if (!described.exact) {
          const { missing, extra, content, mode, sourceDrift } = described.mismatches;
          return new StateOutcome('NOT_ELIGIBLE', {
            recordId: record.recordId,
            proofs: ['reconcile'],
            mismatches: {
              missing: reportedPaths(missing).paths,
              extra: reportedPaths(extra).paths,
              content: reportedPaths(content.map((entry) => entry.path)).paths,
              mode: reportedPaths(mode.map((entry) => entry.path)).paths,
              sourceDrift: sourceDrift.length,
            },
          });
        }
        const ledger = makeLedger({
          binding: ledgerBinding(record),
          base: request.base,
          visibility: request.visibility,
          language: request.language,
          manifest: request.manifest,
          groups: ledgerGroups(request.groups, described.endpoints),
        });
        const serialized = serializeLedger(ledger);
        const bytes = Buffer.byteLength(serialized);
        const maxBytes = worstCaseLedgerBytes(ledger);
        if (signals.signal) return interruptedUnderLock(signals, record.recordId, record.status);
        if (maxBytes > LEDGER_MAX_BYTES) {
          return {
            recordId: record.recordId,
            written: false,
            reason: 'size-bound',
            bytes: maxBytes,
            limitBytes: LEDGER_MAX_BYTES,
            status: record.status,
          };
        }
        if (!(await lockStillOwned(context, paths, held))) {
          fail('WRITE_FAILED', `the lock of ${paths.record} was lost before the ledger write`);
        }
        const created = await createLedger(context, roots.cwd, record.recordId, serialized);
        if (!created.created) {
          return new StateOutcome('LEDGER_EXISTS', { recordId: record.recordId, path: ledgerPath });
        }
        return {
          recordId: record.recordId,
          written: true,
          path: ledgerPath,
          bytes,
          maxBytes,
          groups: ledger.groups.length,
          endpoints: described.endpoints.length,
          status: record.status,
        };
      },
    );
  });
}

// `ledger append`: records `commitOid` as the commit of the next group once the caller's session
// owns the `active` record and the commit is proven: `ledger` (a valid ledger is bound to the
// record), `complete` (a group is still uncommitted), `tip` (the commit is the branch tip),
// `parent` (its only parent is the previous ledger commit, or `creationOid` for the first group),
// `paths` (it changes exactly that group's endpoints) and `blobs` (each endpoint holds its
// descriptor's blob OID and mode, or is absent for a tombstone). Repeating the append of the
// recorded tip is `{appended: false}` and writes nothing.
export async function ledgerAppend(input, deps) {
  const context = prepare('ledger append', input, deps);
  const recordId = requireRecordId(input.recordId);
  const sessionId = requireSessionId(input.sessionId);
  if (typeof input.commitOid !== 'string' || !OID_PATTERN.test(input.commitOid)) {
    fail('INVALID_INPUT', 'commitOid must be a full commit OID');
  }
  const commitOid = input.commitOid;
  return deferSignals(deps, recordId, async (signals) => {
    const roots = await openRoots(context, input);
    const paths = recordPaths(roots.cwd, recordId);
    return withRecordLock(
      context,
      paths,
      { operation: 'ledger append', runId: sessionId },
      deps,
      async (held) => {
        await phase(deps, 'underLock', { operation: 'ledger append', recordId });
        const record = await ownedActiveRecord(context, roots, paths, recordId, sessionId);
        if (record instanceof StateOutcome) return record;
        const { facts, proofs } = await ledgerWriteProofs(context, roots, record, held);
        if (proofs.length > 0) return new StateOutcome('NOT_ELIGIBLE', { recordId, proofs });
        const read = await readLedger(context, roots.cwd, ledgerBinding(record));
        if (read.state !== 'ok') {
          return new StateOutcome('NOT_ELIGIBLE', {
            recordId,
            proofs: ['ledger'],
            ledger: read.state === 'missing' ? 'missing' : `invalid:${read.reason}`,
          });
        }
        const ledger = read.ledger;
        const progress = ledgerProgress(ledger);
        const last = ledger.commits.at(-1);
        const summary = (appended, group) => ({
          recordId,
          appended,
          group,
          commitOid,
          committed: ledger.commits.length + (appended ? 1 : 0),
          remaining: ledger.groups.length - ledger.commits.length - (appended ? 1 : 0),
          status: record.status,
        });
        if (last && last.oid === commitOid && facts.branchTip === commitOid) {
          return summary(false, last.group);
        }
        if (progress.complete) {
          return new StateOutcome('NOT_ELIGIBLE', { recordId, proofs: ['complete'] });
        }
        const failed = [
          ...(facts.branchTip === commitOid ? [] : ['tip']),
          ...(await commitGroupProblems(guardedGit(context, roots.cwd), {
            commitOid,
            parentOid: progress.parent,
            group: ledger.groups[progress.next],
          })),
        ];
        if (failed.length > 0) {
          return new StateOutcome('NOT_ELIGIBLE', {
            recordId,
            proofs: failed,
            group: progress.next,
          });
        }
        if (signals.signal) return interruptedUnderLock(signals, recordId, record.status);
        const next = {
          ...ledger,
          commits: [...ledger.commits, { group: progress.next, oid: commitOid }],
        };
        const written = await replaceLedger(context, roots.cwd, next, {
          beforeRename: async () =>
            (await lockStillOwned(context, paths, held)) ? null : 'lock-lost',
        });
        if (!written.written) {
          fail('WRITE_FAILED', `the lock of ${paths.record} was lost before the ledger write`);
        }
        return summary(true, progress.next);
      },
    );
  });
}

// ---------------------------------------------------------------------------------------------
// The release transition and the resume adoption

// `worktree transition` with `release: "partial-diff"` or `adoption: "partial-diff-resume"`: the
// transition of `effective-flow-state-worktree-core.mjs` with the release and resume proofs of
// this module. Any other input runs the plain transition unchanged.
export async function recoveryTransition(input, deps) {
  return transition(input, deps, { releaseProofs, resumeProofs });
}

// ---------------------------------------------------------------------------------------------
// Resume proofs

// The stable identifiers of the resume proofs, in the order a refusal reports them:
//   condition-1      schema-valid, `effective-flow-created`, `aborted` or `failed`
//   purpose          the record is a `partial-diff` record
//   workflow         the record's workflow is `deliver` and equals the input's
//   branch           the input's branch equals the record's
//   condition-2 … condition-6, condition-9   the removal conditions of the record (7, the clean
//                    status, is replaced by `index` and `residual`; 8 is skipped, as in adoption)
//   visibility       the ledger's visibility is not weaker than the current one: a ledger written
//                    `visible` refuses a current `hidden`
//   ledger           a valid ledger is bound to the record (`readLedger` with `ledgerBinding`)
//   history          the commits from `creationOid` to the branch tip are exactly the ledger's
//                    commits, or those plus one tip that passes the tip-recovery subset of the
//                    `ledger append` checks (its only parent is the previous commit, it changes
//                    exactly the next group's endpoints, each with its descriptor's blob and mode)
//   committed-count  the ledger's commits plus a recovered tip are at least one
//   index            the index holds HEAD's tree, or stages exactly the first uncommitted group
//                    (its endpoints, each with its descriptor's blob and mode, and nothing else);
//                    a recovered tip with anything staged is refused
//   residual         no dirty or untracked path outside the uncommitted endpoints, and each of them
//                    holds its descriptor's kind, mode and byte digest in the working tree
//   source           `verifySourceManifest` of the ledger's manifest is exact at its proven source
//                    root: source HEAD and every selected entry unchanged
export const RESUME_PROOFS = Object.freeze([
  'condition-1',
  'purpose',
  'workflow',
  'branch',
  'condition-2',
  'condition-3',
  'condition-4',
  'condition-5',
  'condition-6',
  'condition-9',
  'visibility',
  'ledger',
  'history',
  'committed-count',
  'index',
  'residual',
  'source',
]);
// The identifiers outside RESUME_PROOFS that the resume operations report besides them, each a
// refusal of its own that no single resume proof stands for:
//   repository   the record belongs to another repository or runtime-state root (`worktree
//                resume-check`, the resume adoption, `ledger reconcile`): nothing else is evaluated
//                and nothing runs in its worktree
//   source-root  `ledger reconcile`: the ledger manifest's source root is not proven this
//                repository's or is the delivery worktree (`proveSourceRoot`), so nothing runs
//                in it
//   reconcile    `ledger reconcile`: `reconcileResume` could not read the worktree or the source
//                (with the `selectionError` code)
export const RESUME_OPERATION_PROOFS = Object.freeze(['repository', 'source-root', 'reconcile']);
const RESUME_STATUSES = Object.freeze(['aborted', 'failed']);
// The proofs that need a valid ledger.
const LEDGER_PROOFS = Object.freeze([
  'visibility',
  'history',
  'committed-count',
  'index',
  'residual',
  'source',
]);

function inResumeOrder(proofs) {
  return RESUME_PROOFS.filter((proof) => proofs.has(proof));
}

// The `history` proof of `ledger` against the branch `tip`, through Git in the main checkout:
// `{ok: true, recovered: null}` when the commits from `creationOid` to `tip` are exactly the
// ledger's, `{ok: true, recovered: tip}` when they are those plus the tip and the tip passes the
// tip-recovery subset of the append checks, otherwise `{ok: false}` (with the failed subset as
// `recovery` when only that check refused).
async function historyProof(context, roots, ledger, tip) {
  const git = guardedGit(context, roots.cwd);
  const recorded = ledger.commits.map((commit) => commit.oid);
  const listed = await branchHistory(git, {
    creationOid: ledger.creationOid,
    tip,
    limit: recorded.length + 2,
  });
  if (listed === null) return { ok: false };
  const prefix = recorded.every((oid, index) => listed[index] === oid);
  if (prefix && listed.length === recorded.length) return { ok: true, recovered: null };
  const progress = ledgerProgress(ledger);
  if (!prefix || listed.length !== recorded.length + 1 || progress.complete) return { ok: false };
  const candidate = listed.at(-1);
  if (candidate !== tip) return { ok: false };
  const problems = await commitGroupProblems(git, {
    commitOid: candidate,
    parentOid: progress.parent,
    group: ledger.groups[progress.next],
  });
  return problems.length === 0
    ? { ok: true, recovered: candidate }
    : { ok: false, recovery: problems };
}

// Evaluates every resume proof over `facts` (`gatherFacts` of the record, with the lock this
// actor holds, if any) without writing anything. `request` carries the current `visibility` and,
// for an adoption, the input's `branch` and `workflow` (the `branch` proof and the input half of
// `workflow` apply only when given). Returns `{proofs, unevaluated, details, ledgerState, ledger,
// recovered, next, hookStaged, source, tip}`: the failed proofs in RESUME_PROOFS order, the proofs
// that a failed prerequisite left unevaluated (the ledger proofs without a valid ledger; `index`
// and `residual` unless conditions 3 and 4 prove the worktree ours; `history` without a branch tip
// that descends from `creationOid`), bounded refusal details, and what the adoption continues
// from. Every Git call inside the worktree runs only after that proof, with
// `core.fsmonitor=false`; the history runs in the main checkout, the source check only after
// `proveSourceRoot`. `inspectResidual` runs over every endpoint the ledger has not recorded (the
// set the release inspects, so `worktree resume-check` shares the one result through `once`, see
// `checkMemo`); a recovered tip's group is then committed and no residual (`resumeResidual`).
async function evaluateResume({ context, roots, record, facts, request, once = unmemoized }) {
  const failed = new Set();
  const unevaluated = new Set();
  const details = {};
  const result = {
    ledgerState: null,
    ledger: null,
    recovered: null,
    next: null,
    hookStaged: false,
    source: null,
    tip: facts.branchTip,
  };
  const finish = () => ({
    ...result,
    proofs: inResumeOrder(failed),
    unevaluated: inResumeOrder(new Set([...unevaluated].filter((proof) => !failed.has(proof)))),
    details,
  });
  if (record.purpose !== 'partial-diff') failed.add('purpose');
  if (
    record.workflow !== 'deliver' ||
    (request.workflow !== undefined && request.workflow !== record.workflow)
  ) {
    failed.add('workflow');
  }
  if (request.branch !== undefined && request.branch !== record.branch) failed.add('branch');
  for (const proof of conditionProofs(facts, RESUME_STATUSES, [7, 8])) failed.add(proof);
  const worktreeProven = !failed.has('condition-3') && !failed.has('condition-4');
  const read = await readLedger(context, roots.cwd, ledgerBinding(record));
  result.ledgerState =
    read.state === 'ok' ? 'ok' : read.state === 'missing' ? 'missing' : `invalid:${read.reason}`;
  if (read.state !== 'ok') {
    failed.add('ledger');
    details.ledger = result.ledgerState;
    for (const proof of LEDGER_PROOFS) unevaluated.add(proof);
    return finish();
  }
  const ledger = read.ledger;
  result.ledger = ledger;
  if (ledger.visibility === 'visible' && request.visibility === 'hidden') failed.add('visibility');
  let recovered = null;
  if (facts.branchTip && facts.creationIsCommit && facts.creationAncestor) {
    const history = await historyProof(context, roots, ledger, facts.branchTip);
    if (history.ok) recovered = history.recovered;
    else {
      failed.add('history');
      if (history.recovery) details.recovery = history.recovery;
    }
  } else {
    unevaluated.add('history');
  }
  const next = ledger.commits.length + (recovered === null ? 0 : 1);
  if (next < 1) {
    if (unevaluated.has('history')) unevaluated.add('committed-count');
    else failed.add('committed-count');
  }
  result.recovered = recovered;
  result.next = next;
  if (worktreeProven) {
    const staged = await stagedGroupState(
      guardedGit(context, record.worktreePath),
      ledger.groups[next] ?? null,
    );
    if (staged === null) failed.add('index');
    else if (!staged.clean) {
      if (recovered !== null || !staged.matches) {
        failed.add('index');
        const reported = reportedPaths(staged.paths);
        details.stagedPaths = reported.paths;
        details.stagedPathCount = reported.count;
      } else {
        result.hookStaged = true;
      }
    }
    const runner = selectionRunner(context, roots, [record.worktreePath]);
    const descriptors = residualEndpoints(ledger);
    const inspected = await once('residual', () =>
      selectionCall(() =>
        inspectResidual({ deliveryRoot: record.worktreePath, endpoints: descriptors }, { runner }),
      ),
    );
    const recoveredGroup = recovered === null ? null : ledger.groups[ledger.commits.length];
    const residual = inspected && resumeResidual(inspected, recoveredGroup);
    if (!residual || residual.extra.length > 0 || residual.content.length > 0) {
      failed.add('residual');
      if (residual) {
        details.extra = reportedPaths(residual.extra).paths;
        details.extraCount = residual.extra.length;
        details.content = reportedPaths(residual.content).paths;
        details.contentCount = residual.content.length;
      }
    }
  } else {
    unevaluated.add('index');
    unevaluated.add('residual');
  }
  const source = await once('source-root', () =>
    proveSourceRoot(context, roots, ledger.manifest, record.worktreePath),
  );
  result.source = source;
  const sourceRunner = source === null ? null : selectionRunner(context, roots, [source]);
  if (!(await once('source', () => sourceIsExact(ledger.manifest, source, sourceRunner)))) {
    failed.add('source');
  }
  return finish();
}

// The resume's view of `inspected` (`inspectResidual` over every unrecorded endpoint): with a
// recovered tip, the endpoints of its `recoveredGroup` are committed, not residual, so a dirty one
// is `extra` and their working-tree content is not compared; without one (null) it is unchanged.
// Each per-endpoint result of `inspectResidual` is independent of the other endpoints, so this is
// exactly the inspection of the remaining groups alone.
function resumeResidual(inspected, recoveredGroup) {
  if (recoveredGroup === null) return { extra: inspected.extra, content: inspected.content };
  const committed = new Set(recoveredGroup.endpoints.map((endpoint) => endpoint.path));
  return {
    extra: [
      ...inspected.extra,
      ...inspected.dirty.filter((repoPath) => committed.has(repoPath)),
    ].sort(),
    content: inspected.content.filter((repoPath) => !committed.has(repoPath)),
  };
}

// What `deliver` continues from after a resume adoption, from the (appended) ledger: content-free
// and bounded by the ledger itself (paths, modes, OIDs, selection origins and counts, no digest and
// no file content). Besides the progress, it carries what the final report of a new session needs
// without reading the ledger: `groups`, every group of the plan in order with its endpoint paths
// and its commit OID (null while uncommitted), and `selection`, the confirmed selection as the
// manifest entries' `path`, `selectionOrigin` (`staged` or `working`) and `renameFrom`. With
// `hookStaged`, `hookStagedEntries` lists the index entry each endpoint of the staged group (the
// first of `remainingGroups`) was proven to hold, as its `path`, `mode` and blob `oid` (both null
// for a tombstone, whose path the index lacks), so `deliver` unstages a path only while it still
// holds that entry; otherwise it is empty.
function resumeSummary(ledger, evaluation) {
  const progress = ledgerProgress(ledger);
  const stagedGroup = evaluation.hookStaged ? progress.residualGroups[0] : null;
  const commits = new Map(ledger.commits.map((commit) => [commit.group, commit.oid]));
  return {
    recovered: evaluation.recovered,
    committed: ledger.commits.map((commit) => ({ group: commit.group, oid: commit.oid })),
    next: progress.next,
    remaining: ledger.groups.length - ledger.commits.length,
    remainingGroups: progress.residualGroups.map((group) => ({
      group: group.index,
      paths: group.endpoints.map((endpoint) => endpoint.path),
    })),
    tip: evaluation.tip,
    hookStaged: evaluation.hookStaged,
    hookStagedEntries: (stagedGroup?.endpoints ?? []).map((endpoint) => ({
      path: endpoint.path,
      mode: endpoint.mode,
      oid: endpoint.oid,
    })),
    base: { branch: ledger.base.branch, oid: ledger.base.oid },
    language: { git: ledger.language.git, forge: ledger.language.forge },
    visibility: ledger.visibility,
    sourceRoot: ledger.manifest.source.root,
    groups: ledger.groups.map((group) => ({
      group: group.index,
      paths: group.endpoints.map((endpoint) => endpoint.path),
      oid: commits.get(group.index) ?? null,
    })),
    selection: ledger.manifest.entries.map((entry) => ({
      path: entry.path,
      selectionOrigin: entry.selectionOrigin,
      renameFrom: entry.renameFrom,
    })),
  };
}

// The proofs and writes of the resume adoption (`adoption: "partial-diff-resume"`), under the
// record lock `transition` holds. Every proof of RESUME_PROOFS must pass; a refusal is
// NOT_ELIGIBLE with the failed `proofs` (and `unevaluated` when a failed prerequisite left others
// open) and writes nothing. On success, a recovered tip is appended to the ledger first, after the
// re-read ledger proved its immutable part (LEDGER_IMMUTABLE_KEYS) and commits unchanged and the
// lock still ours (checked again before the rename); `transition` then writes the record, checking
// the lock again, and rewrites only `status`, `reason`, `updatedAt` and `sessionId`. A recovered
// entry whose record write then failed is the ledger's own commit on the next resume, which finds
// the history equal to the ledger and recovers nothing. The phase `resumeLedgerAppended` follows a
// landed append; a signal from there on is reported by `transition` with `ledgerAppended: true`
// (before the record write) or with the `resume` summary (after it). Returns `resumeSummary` or
// the outcome.
async function resumeProofs({ context, roots, paths, record, request, held, signals, deps }) {
  const worktrees = await listWorktrees(context);
  const facts = await gatherFacts(context, roots, worktrees, record, { ownLock: held.token });
  const evaluation = await evaluateResume({
    context,
    roots,
    record,
    facts,
    request: {
      branch: request.branch,
      workflow: request.workflow,
      visibility: request.visibility,
    },
  });
  if (evaluation.proofs.length > 0 || evaluation.unevaluated.length > 0) {
    return new StateOutcome('NOT_ELIGIBLE', {
      recordId: record.recordId,
      proofs: evaluation.proofs,
      ...(evaluation.unevaluated.length > 0 ? { unevaluated: evaluation.unevaluated } : {}),
      ...evaluation.details,
    });
  }
  await phase(deps, 'resumeProven', { recordId: record.recordId });
  if (signals.signal) return interruptedUnderLock(signals, record.recordId, record.status);
  let ledger = evaluation.ledger;
  if (evaluation.recovered !== null) {
    const reread = await readLedger(context, roots.cwd, ledgerBinding(record));
    if (
      reread.state !== 'ok' ||
      !sameImmutablePart(reread.ledger, ledger) ||
      !isDeepStrictEqual(reread.ledger.commits, ledger.commits)
    ) {
      fail('WRITE_FAILED', `the ledger of ${record.recordId} changed since its proof`);
    }
    const appended = {
      ...ledger,
      commits: [...ledger.commits, { group: ledger.commits.length, oid: evaluation.recovered }],
    };
    if (!(await lockStillOwned(context, paths, held))) {
      fail('WRITE_FAILED', `the lock of ${paths.record} was lost before the ledger write`);
    }
    const written = await replaceLedger(context, roots.cwd, appended, {
      beforeRename: async () => ((await lockStillOwned(context, paths, held)) ? null : 'lock-lost'),
    });
    if (!written.written) {
      fail('WRITE_FAILED', `the lock of ${paths.record} was lost before the ledger write`);
    }
    ledger = appended;
    await phase(deps, 'resumeLedgerAppended', {
      recordId: record.recordId,
      oid: evaluation.recovered,
    });
  }
  return resumeSummary(ledger, evaluation);
}

// ---------------------------------------------------------------------------------------------
// worktree resume-check

// `worktree resume-check`: evaluates every resume proof (with tip recovery) and every release
// proof of one record for the current `visibility`, read-only: it takes no lock, writes nothing,
// and observes the record lock only, so a lock or claim another actor holds is condition-9 of both
// (never broken). Returns:
//   recordId, valid, status, purpose, workflow
//   resumable, resumeProofs, unevaluated   the failed and the unevaluated resume proofs
//   releasable, releaseRoute, releaseProofs   the release route (`gone`, `clean`, `ledger`,
//                                          `no-ledger`, or null when a condition refused first)
//   releasePaths, releasePathCount         what an eligible `ledger` release discards: the
//                                          residual's dirty paths (bounded) and their count;
//                                          `[]` and 0 for every other result
//   hasLedger, ledger                      whether a valid ledger is bound, and its read state
//   source                                 `{root}`: the ledger manifest's source root, or null
//   committed, remaining, next             counts after tip recovery (null without a ledger)
//   recoveredTip, hookStaged               the tip a resume would record, a staged next group
//   lock                                   the observed record lock
//   details                                `{resume, release}`: the bounded refusal details
// A record that is not a valid version 1 record is `valid: false` with condition-1 for both and
// every other resume proof in `unevaluated`; a record of another repository or runtime-state root
// is `repository` (RESUME_OPERATION_PROOFS) for both, with every resume proof in `unevaluated` and
// nothing run in its worktree. A missing record is RECORD_NOT_FOUND. The resume and the release
// evaluation share one residual inspection and one source check (`checkMemo`).
export async function resumeCheck(input, deps) {
  const context = prepare('worktree resume-check', input, deps);
  const recordId = requireRecordId(input.recordId);
  if (!VISIBILITIES.includes(input.visibility)) {
    fail('INVALID_INPUT', `visibility must be one of ${VISIBILITIES.join(', ')}`);
  }
  const roots = await openRoots(context, input);
  const paths = recordPaths(roots.cwd, recordId);
  const read = await readRecord(context, paths, recordId);
  if (read.state === 'missing') return new StateOutcome('RECORD_NOT_FOUND', { recordId });
  const empty = {
    hasLedger: false,
    ledger: null,
    source: null,
    committed: null,
    remaining: null,
    next: null,
    recoveredTip: null,
    hookStaged: false,
  };
  const noRelease = { releasePaths: [], releasePathCount: 0 };
  if (read.state === 'invalid') {
    return {
      recordId,
      valid: false,
      reason: read.reason,
      status: null,
      purpose: null,
      workflow: null,
      resumable: false,
      resumeProofs: ['condition-1'],
      unevaluated: RESUME_PROOFS.filter((proof) => proof !== 'condition-1'),
      releasable: false,
      releaseRoute: null,
      releaseProofs: ['condition-1'],
      ...noRelease,
      ...empty,
      lock: await observedLock(context, paths),
      details: { resume: {}, release: {} },
    };
  }
  const record = read.record;
  const identity = {
    recordId,
    valid: true,
    status: record.status,
    purpose: record.purpose,
    workflow: record.workflow,
  };
  if (record.repositoryIdentity !== roots.common || record.runtimeStateRoot !== roots.cwd) {
    return {
      ...identity,
      resumable: false,
      resumeProofs: ['repository'],
      unevaluated: [...RESUME_PROOFS],
      releasable: false,
      releaseRoute: null,
      releaseProofs: ['repository'],
      ...noRelease,
      ...empty,
      lock: await observedLock(context, paths),
      details: { resume: {}, release: {} },
    };
  }
  const worktrees = await listWorktrees(context);
  const facts = await gatherFacts(context, roots, worktrees, record, {});
  const once = checkMemo();
  const resume = await evaluateResume({
    context,
    roots,
    record,
    facts,
    request: { visibility: input.visibility },
    once,
  });
  const release = await evaluateRelease({ context, roots, record, facts, once });
  const { route: refusedRoute = null, ...releaseDetails } = release.refusal?.details ?? {};
  const ledger = resume.ledger;
  const discarded =
    !release.refusal && release.route === 'ledger' ? reportedPaths(release.residual.dirty) : null;
  return {
    ...identity,
    resumable: resume.proofs.length === 0 && resume.unevaluated.length === 0,
    resumeProofs: resume.proofs,
    unevaluated: resume.unevaluated,
    releasable: !release.refusal,
    releaseRoute: release.refusal ? refusedRoute : release.route,
    releaseProofs: release.refusal ? release.refusal.proofs : [],
    ...(discarded
      ? { releasePaths: discarded.paths, releasePathCount: discarded.count }
      : noRelease),
    hasLedger: ledger !== null,
    ledger: resume.ledgerState,
    source: ledger ? { root: ledger.manifest.source.root } : null,
    committed: ledger ? resume.next : null,
    remaining: ledger ? ledger.groups.length - resume.next : null,
    next: ledger ? resume.next : null,
    recoveredTip: resume.recovered,
    hookStaged: resume.hookStaged,
    lock: facts.lock,
    details: { resume: resume.details, release: releaseDetails },
  };
}

// ---------------------------------------------------------------------------------------------
// ledger reconcile

// `ledger reconcile`: the resume-mode reconcile of an adopted `partial-diff` record, read-only
// (no lock taken, nothing written). The caller's session must own the `active` record (NOT_OWNER,
// STATUS_MISMATCH otherwise); then `purpose`, conditions 2 to 6 and 9 of the record (a lock any
// actor holds is condition-9), `ledger` (a valid ledger bound to it, read here and never taken as
// input), `history` (the commits from `creationOid` to the branch tip are exactly the ledger's: a
// tip is recovered only by the adoption) and `source-root` (the manifest's source is proven this
// repository's and is not the delivery worktree) are NOT_ELIGIBLE refusals. The comparison itself
// is `reconcileResume` of `delivery-selection-core.mjs` through the guarded runner: committed
// endpoints against the tip's tree by blob OID and mode, residual endpoints against the working
// tree by byte digest and the index (HEAD's or the descriptor's entry), no dirty path outside the
// residual, and `verifySourceManifest`; nothing is re-planned. Returns `{recordId, exact,
// mismatches: {head, committed, residual, index, extra, sourceDrift}, staged, next, remaining, tip,
// status}` with each path list `{paths, count}` and `sourceDrift` a count. `staged` lists the
// residual endpoints whose index entry differs from HEAD; a staged descriptor is no mismatch, so
// after unstaging a proven hook-staged group the caller requires `staged.count` to be 0.
export async function ledgerReconcile(input, deps) {
  const context = prepare('ledger reconcile', input, deps);
  const recordId = requireRecordId(input.recordId);
  const sessionId = requireSessionId(input.sessionId);
  const roots = await openRoots(context, input);
  const paths = recordPaths(roots.cwd, recordId);
  const record = await ownedActiveRecord(context, roots, paths, recordId, sessionId);
  if (record instanceof StateOutcome) return record;
  const refuse = (proofs, details = {}) =>
    new StateOutcome('NOT_ELIGIBLE', { recordId, proofs, ...details });
  const worktrees = await listWorktrees(context);
  const facts = await gatherFacts(context, roots, worktrees, record, {});
  const proofs = [
    ...(record.purpose === 'partial-diff' ? [] : ['purpose']),
    ...conditionProofs(facts, ['active'], [7, 8]),
  ];
  if (proofs.length > 0) return refuse(proofs);
  const read = await readLedger(context, roots.cwd, ledgerBinding(record));
  if (read.state !== 'ok') {
    return refuse(['ledger'], {
      ledger: read.state === 'missing' ? 'missing' : `invalid:${read.reason}`,
    });
  }
  const ledger = read.ledger;
  const history = await historyProof(context, roots, ledger, facts.branchTip);
  if (!history.ok || history.recovered !== null) return refuse(['history']);
  const source = await proveSourceRoot(context, roots, ledger.manifest, record.worktreePath);
  if (source === null) return refuse(['source-root']);
  const runner = selectionRunner(context, roots, [record.worktreePath, source]);
  const progress = ledgerProgress(ledger);
  let compared;
  try {
    compared = await reconcileResume(
      {
        manifest: ledger.manifest,
        deliveryRoot: record.worktreePath,
        commitOid: facts.branchTip,
        committed: ledger.groups.slice(0, progress.next).flatMap((group) => group.endpoints),
        residual: residualEndpoints(ledger),
        sourceRoot: source,
      },
      { runner },
    );
  } catch (error) {
    if (!(error instanceof DeliverySelectionError)) throw error;
    return refuse(['reconcile'], { selectionError: error.code });
  }
  const { mismatches } = compared;
  return {
    recordId,
    exact: compared.exact,
    mismatches: {
      head: mismatches.head,
      committed: reportedPaths(mismatches.committed),
      residual: reportedPaths(mismatches.residual),
      index: reportedPaths(mismatches.index),
      extra: reportedPaths(mismatches.extra),
      sourceDrift: mismatches.sourceDrift.length,
    },
    staged: reportedPaths(compared.staged),
    next: progress.next,
    remaining: ledger.groups.length - progress.next,
    tip: facts.branchTip,
    status: record.status,
  };
}
