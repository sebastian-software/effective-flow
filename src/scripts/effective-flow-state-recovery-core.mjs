// Runtime-state helper: the delivery-progress ledger operations and the release transition of a
// retained `partial-diff` record.
//
//   ledger init           {cwd, executionRoot, recordId, sessionId, manifest, groups, base,
//                          visibility, language}
//   ledger append         {cwd, executionRoot, recordId, sessionId, commitOid}
//   worktree transition   with `release: "partial-diff"` (`releaseTransition`)
//
// `ledger init` writes the private ledger of an `active` `partial-diff` record once, no-clobber,
// under the record lock, from descriptors the helper computes itself; `ledger append` adds one
// verified commit. The release moves a retained `partial-diff` record from `aborted` or `failed`
// to `cleanup-ready` under its own proofs (`releaseProofs`), through the record lock, record
// reading and writing of `transition` in `effective-flow-state-worktree-core.mjs`.
//
// Layering: this module imports `effective-flow-state-worktree-core.mjs` (the record, lock, fact
// and guarded-Git internals it exports) and `effective-flow-state-ledger-core.mjs` (the ledger's
// schema, file and comparisons); neither imports this module back. `effective-flow-state-core.mjs`
// dispatches `ledger init`, `ledger append` and every `worktree transition` input that carries
// `release` here. Every Git call inside the recorded worktree or the selection's source root runs
// only after the common-directory proof of that root, and with `core.fsmonitor=false`.

import { asBuffer } from './runtime-state-guard.mjs';
import { StateOutcome, fail, requireObject } from './effective-flow-state-core.mjs';
import {
  DeliverySelectionError,
  describeDeliveryEndpoints,
  inspectResidual,
  validateSelectionManifest,
  verifySourceManifest,
  workingEndpointMatches,
} from './delivery-selection-core.mjs';
import {
  LEDGER_LANGUAGES,
  LEDGER_MAX_BYTES,
  LEDGER_VISIBILITIES,
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
  serializeLedger,
  worstCaseLedgerBytes,
} from './effective-flow-state-ledger-core.mjs';
import {
  OID_PATTERN,
  deferSignals,
  evaluateEligibility,
  gatherFacts,
  guardedGit,
  interruptedUnderLock,
  isBranchName,
  itemDigest,
  listWorktrees,
  lockStillOwned,
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
//            residual path is re-checked against its descriptor (working tree, and the index
//            entry HEAD's or the descriptor's) immediately before it is discarded, exactly the dirty residual paths are restored (`restoreResidual`) and the
//            worktree is proven clean
// A dirty worktree without a valid ledger is `residual`, with the exact dirty paths listed.
// Returns `{route, restored}` or the NOT_ELIGIBLE outcome. A signal seen at the last check before
// the restore is INTERRUPTED with nothing written and nothing restored; once the restore has
// started it runs to its end, and `transition` completes the record write for a release that
// restored paths (INTERRUPTED with `written: true` and the `release`, see `deferSignals`). A
// restore that stops part-way is an error that names the paths already restored and the index
// entries already removed, with the record unchanged; the retry releases the rest.
async function releaseProofs({ context, roots, paths, record, held, signals, deps }) {
  const refuse = (proofs, details = {}) =>
    new StateOutcome('NOT_ELIGIBLE', { recordId: record.recordId, proofs, ...details });
  const purpose = record.purpose === 'partial-diff' ? [] : ['purpose'];
  const worktrees = await listWorktrees(context);
  const facts = await gatherFacts(context, roots, worktrees, record, { ownLock: held.token });
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
    return proofs.length > 0 ? refuse(proofs, { route: 'gone' }) : { route: 'gone', restored: [] };
  }
  const proofs = [...purpose, ...conditionProofs(facts, statuses, [7, 8])];
  if (proofs.length > 0) return refuse(proofs);
  if (facts.clean) return { route: 'clean', restored: [] };
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
  const source = await proveSourceRoot(context, roots, ledger.manifest);
  const runner = selectionRunner(context, roots, [
    record.worktreePath,
    ...(source && source !== record.worktreePath ? [source] : []),
  ]);
  const sourceExact = async () =>
    source !== null &&
    (
      await selectionCall(() =>
        verifySourceManifest({ manifest: ledger.manifest, sourceRoot: source }, { runner }),
      )
    )?.exact === true;
  const residual = await selectionCall(() =>
    inspectResidual({ deliveryRoot: record.worktreePath, endpoints: descriptors }, { runner }),
  );
  const content = residual ? unreleasedContent(residual) : [];
  const failed = [];
  if (!residual || residual.extra.length > 0 || content.length > 0) failed.push('residual');
  if (residual && residual.index.length > 0) failed.push('index');
  if (!(await sourceExact())) failed.push('source');
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
  await phase(deps, 'releaseProven', { recordId: record.recordId });
  if (signals.signal) return interruptedUnderLock(signals, record.recordId, record.status);
  if (!(await lockStillOwned(context, paths, held))) {
    fail('WRITE_FAILED', `the lock of ${paths.record} was lost before the release restore`);
  }
  // The source again, after the last lock check and before the first discard: what the release
  // discards must still be in the source when it is discarded.
  if (!(await sourceExact())) return refuse(['source'], { route: 'ledger' });
  const inWorktree = guardedGit(context, record.worktreePath);
  const restored = await restoreResidual({
    git: inWorktree,
    fs: context.fs,
    root: record.worktreePath,
    residual,
    descriptors,
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
// (the manifest's source is this repository's) and `reconcile`. A ledger whose worst case
// (`worstCaseLedgerBytes`: every group committed with a 64-hex OID) would serialize above
// LEDGER_MAX_BYTES is not written: `{recordId, written: false, reason: "size-bound", bytes,
// limitBytes, status}` with that worst case as `bytes`, never an error. A written ledger reports
// its size as `bytes` and its worst case as `maxBytes`, so every later append stays readable.
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
        const source = await proveSourceRoot(context, roots, request.manifest);
        if (!source) {
          return new StateOutcome('NOT_ELIGIBLE', {
            recordId: record.recordId,
            proofs: ['source-root'],
          });
        }
        const runner = selectionRunner(context, roots, [
          record.worktreePath,
          ...(source !== record.worktreePath ? [source] : []),
        ]);
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
// The release transition

// `worktree transition` with `release: "partial-diff"`: the transition of
// `effective-flow-state-worktree-core.mjs` with the release proofs of this module.
export async function releaseTransition(input, deps) {
  return transition(input, deps, { releaseProofs });
}
