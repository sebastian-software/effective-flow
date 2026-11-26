import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  createRound,
  loadRound,
  publicationLockPath,
  publishRound,
  retryAborted,
  retryInvalid,
  roundStatus,
  sealAttempt,
} from '../evals/_scaffold/round-core.mjs';
import { sandboxPaths } from '../evals/_scaffold/sandbox.mjs';
import { REQUIRED_RUNS } from '../evals/_scaffold/suite.mjs';
import suite from '../evals/merge-gate/suite.config.mjs';
import { waitForMarker } from './support/marker-wait.mjs';
import {
  childResult,
  copyRestampedResults,
  hostReceipt,
  legacyLog,
  PROFILE,
  REPOSITORY_RESULTS,
} from './support/merge-gate-round-fixtures.mjs';

const ROUND_CORE_URL = pathToFileURL(
  resolve(import.meta.dirname, '..', 'evals', '_scaffold', 'round-core.mjs'),
).href;

const SUITE_CONFIG_URL = pathToFileURL(
  resolve(import.meta.dirname, '..', 'evals', 'merge-gate', 'suite.config.mjs'),
).href;

function runCoreChild(exportName, argumentsValue, { env = {} } = {}) {
  const script = `import { ${exportName} } from ${JSON.stringify(ROUND_CORE_URL)}; import suite from ${JSON.stringify(SUITE_CONFIG_URL)}; const result = ${exportName}(suite, JSON.parse(process.argv[1])); if (result !== undefined) process.stdout.write(JSON.stringify(result));`;
  return spawn(
    process.execPath,
    ['--input-type=module', '--eval', script, JSON.stringify(argumentsValue)],
    {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

// The one rendering of a child's outcome in a failed marker wait: how it ended and the tail of
// its stderr, bounded so a noisy child cannot drown the message.
function describeChild({ code, signal, error, stderr }) {
  const failure = error === undefined ? '' : `, error ${error.message}`;
  return `code ${code}, signal ${signal}${failure}; stderr: ${stderr.slice(-4096)}`;
}

// The limit is twice its siblings' because the time is spent in the subject, not in the harness,
// and it grows with the corpus. The test runs `node build.mjs` 31 times, almost all of them
// serially: `createRound`, the restamp, and the up to two builds — current and final — that each
// publication makes to prove nothing drifted. Each build is followed by an identity pass over every
// discovered scenario, and a scenario that takes the `iterate` echo hashes its own full copy of the
// built tree, so every added scenario, an overlaid one about five times more, lengthens all 31
// passes. There is no fixed hold to cut: every pause ends on a marker, recovery refuses a live lock
// without waiting, and the lock-wait values set below are ceilings rather than sleeps. Alone in a
// two-CPU container the run takes 110–120 s, 79 s of it in the builds; shared CI runners took
// 64–113 s at 15 scenarios, one of them overlaid, and timed out at 120 s at 17, three overlaid. At
// 30 scenarios, six overlaid, it took 146 s alone and passed 240 s beside the rest of `pnpm test`.
test(
  'one immutable round provisions, seals, retries, and publishes isolated slots',
  { timeout: 360_000 },
  async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-round-test-'));
    // Release sentinels live beside `temporary`, never inside it: the `finally` removes `temporary`
    // with `rmSync`, which would race a parked child's 20 ms poll and could delete a release before
    // it was ever observed. Both this directory and the registry below are declared before the
    // `try` so they are in scope in the `finally`, following `driveVerifyWalk`.
    const gate = mkdtempSync(join(tmpdir(), 'effective-flow-round-gate-'));
    // Every long-lived child spawned inside the `try` — the ones that park at a boundary and any
    // other whose lifetime outlives the statement that spawned it — as `{ child, release, result }`,
    // the result promise captured once at the spawn site, because `childResult` attaches its `exit`
    // listener at call time and `exit` fires once: a second call on an exited child returns a
    // promise that never settles. The teardown kills and awaits these, so a failed assertion
    // reports instead of hanging on a parked child's still-open pipes.
    const parked = [];
    const base = resolve(temporary, 'rounds');
    const publicationRoot = resolve(temporary, 'publication');
    const resultsDir = resolve(publicationRoot, 'results');
    const publicationLock = publicationLockPath(suite, publicationRoot);
    // Atomic lock displacement needs a sibling path on the same filesystem.
    const displacedLock = `${publicationLock}.displaced-${randomUUID()}`;
    let ownsDisplacedLock = false;
    try {
      const prepared = createRound(suite, {
        scenarios: ['guard-blocks-merge'],
        profile: PROFILE,
        base,
        roundId: 'round-one',
      });
      assert.equal(prepared.manifest.slots.length, REQUIRED_RUNS);
      assert.equal(
        new Set(prepared.manifest.slots.map(({ slotRoot }) => slotRoot)).size,
        REQUIRED_RUNS,
      );
      assert.equal(
        new Set(prepared.manifest.slots.map(({ promptDigest }) => promptDigest)).size,
        REQUIRED_RUNS,
      );
      assert.equal(statMode(prepared.manifestPath) & 0o222, 0, 'manifest remains read-only');
      assert.ok(
        prepared.manifest.slots.every(({ slotRoot }) =>
          readFileSync(resolve(slotRoot, 'attempt-1', 'prompt.txt'), 'utf8').includes(slotRoot),
        ),
        'each rendered prompt names only its own slot tree',
      );

      chmodSync(prepared.manifestPath, 0o644);
      const canonicalManifest = readFileSync(prepared.manifestPath, 'utf8');
      const duplicatedSlotManifest = structuredClone(prepared.manifest);
      duplicatedSlotManifest.slots[REQUIRED_RUNS - 1] = duplicatedSlotManifest.slots[0];
      writeFileSync(prepared.manifestPath, `${JSON.stringify(duplicatedSlotManifest, null, 2)}\n`);
      assert.throws(
        () => loadRound(suite, prepared.manifestPath, { base }),
        /duplicates slot guard-blocks-merge:1/,
      );
      const missingSlotManifest = structuredClone(prepared.manifest);
      missingSlotManifest.slots.pop();
      writeFileSync(prepared.manifestPath, `${JSON.stringify(missingSlotManifest, null, 2)}\n`);
      assert.throws(
        () => loadRound(suite, prepared.manifestPath, { base }),
        new RegExp(`must state exactly ${REQUIRED_RUNS} slots`),
      );
      writeFileSync(prepared.manifestPath, canonicalManifest);
      chmodSync(prepared.manifestPath, 0o444);

      const slot = (number) => sandboxPaths(prepared.roundRoot, 'guard-blocks-merge', number, 1);

      writeFileSync(slot(1).callLog, legacyLog(slot(1).projectRoot));
      const sealArguments = {
        handle: prepared.manifestPath,
        scenario: 'guard-blocks-merge',
        slot: 1,
        hostReceipt: hostReceipt(slot(1).projectRoot),
        base,
      };
      const sealers = [
        runCoreChild('sealAttempt', sealArguments),
        runCoreChild('sealAttempt', sealArguments),
      ];
      const sealResults = await Promise.all(sealers.map(childResult));
      assert.deepEqual(
        sealResults.map(({ code }) => code).sort(),
        [0, 0],
        `identical concurrent sealers must converge: ${JSON.stringify(sealResults)}`,
      );
      assert.throws(
        () =>
          retryInvalid(suite, {
            handle: prepared.manifestPath,
            scenario: 'guard-blocks-merge',
            slot: 1,
            base,
          }),
        /valid evidence/,
      );

      writeFileSync(slot(2).callLog, legacyLog(slot(2).projectRoot, { wrongRoot: true }));
      sealAttempt(suite, {
        handle: prepared.manifestPath,
        scenario: 'guard-blocks-merge',
        slot: 2,
        hostReceipt: hostReceipt(slot(2).projectRoot),
        base,
      });
      const replacement2 = retryInvalid(suite, {
        handle: prepared.manifestPath,
        scenario: 'guard-blocks-merge',
        slot: 2,
        reason: 'wrong root',
        base,
      });
      assert.equal(replacement2.attempt, 2);

      const replacement2Paths = sandboxPaths(prepared.roundRoot, 'guard-blocks-merge', 2, 2);
      writeFileSync(replacement2Paths.callLog, legacyLog(replacement2Paths.projectRoot));
      const sealMarker = resolve(temporary, 'host-receipt-written');
      const interruptedSeal = runCoreChild(
        'sealAttempt',
        {
          handle: prepared.manifestPath,
          scenario: 'guard-blocks-merge',
          slot: 2,
          hostReceipt: hostReceipt(
            replacement2Paths.projectRoot,
            Object.fromEntries(Object.entries(PROFILE).reverse()),
          ),
          base,
        },
        {
          env: {
            EFFECTIVE_FLOW_EVAL_PAUSE_AT: 'host-receipt-written',
            EFFECTIVE_FLOW_EVAL_PAUSE_MARKER: sealMarker,
          },
        },
      );
      const interruptedSealResult = childResult(interruptedSeal);
      parked.push({ child: interruptedSeal, release: null, result: interruptedSealResult });
      await waitForMarker(sealMarker, { settled: interruptedSealResult, describe: describeChild });
      interruptedSeal.kill('SIGKILL');
      assert.equal((await interruptedSealResult).signal, 'SIGKILL');
      const resumedSeal = sealAttempt(suite, {
        handle: prepared.manifestPath,
        scenario: 'guard-blocks-merge',
        slot: 2,
        hostReceipt: hostReceipt(replacement2Paths.projectRoot),
        base,
      });
      assert.equal(resumedSeal.slot, 2);
      // This scenario carries no sealed observation — only the two run-state scenarios do — so
      // sealing writes no such file and digests exactly the files it always did.
      assert.equal(suite.sealedEvidence.required('guard-blocks-merge'), false);
      assert.deepEqual(Object.keys(resumedSeal.digests).sort(), [
        'buildIdentity',
        'fixture',
        'hostReceipt',
        'log',
        'projectAgents',
        'projectConfig',
        'prompt',
        'runMetadata',
        'trackerStub',
      ]);
      assert.deepEqual(readdirSync(replacement2Paths.traceDir).sort(), [
        'build-identity.json',
        'tracker-calls.jsonl',
      ]);

      const retryMarker = resolve(temporary, 'retry-quarantined');
      const interruptedRetry = runCoreChild(
        'retryAborted',
        {
          handle: prepared.manifestPath,
          scenario: 'guard-blocks-merge',
          slot: 3,
          assertion: { schemaVersion: 1, stopped: true, reason: 'host cancelled it' },
          base,
        },
        {
          env: {
            EFFECTIVE_FLOW_EVAL_PAUSE_AT: 'retry-quarantined',
            EFFECTIVE_FLOW_EVAL_PAUSE_MARKER: retryMarker,
          },
        },
      );
      const interruptedRetryResult = childResult(interruptedRetry);
      parked.push({ child: interruptedRetry, release: null, result: interruptedRetryResult });
      await waitForMarker(retryMarker, {
        settled: interruptedRetryResult,
        describe: describeChild,
      });
      const pendingRetry = roundStatus(suite, prepared.manifestPath, { base }).find(
        ({ slot: number }) => number === 3,
      );
      assert.equal(pendingRetry.status, 'retry-pending');
      assert.equal(pendingRetry.attempt, 2);
      interruptedRetry.kill('SIGKILL');
      assert.equal((await interruptedRetryResult).signal, 'SIGKILL');
      const replacement3 = retryAborted(suite, {
        handle: prepared.manifestPath,
        scenario: 'guard-blocks-merge',
        slot: 3,
        assertion: { schemaVersion: 1, stopped: true, reason: 'host cancelled it' },
        base,
      });
      assert.equal(replacement3.attempt, 2);

      writeFileSync(slot(4).callLog, legacyLog(slot(4).projectRoot));
      assert.throws(
        () =>
          retryAborted(suite, {
            handle: prepared.manifestPath,
            scenario: 'guard-blocks-merge',
            slot: 4,
            assertion: { schemaVersion: 1, stopped: true, reason: 'host cancelled it' },
            base,
          }),
        /non-empty log must be sealed/,
      );

      writeFileSync(slot(5).callLog, legacyLog(slot(5).projectRoot));
      assert.throws(
        () =>
          sealAttempt(suite, {
            handle: prepared.manifestPath,
            scenario: 'guard-blocks-merge',
            slot: 5,
            hostReceipt: { ...hostReceipt(slot(5).projectRoot), sessionId: 'secret' },
            base,
          }),
        /fields must be exactly/,
      );
      const missingField = hostReceipt(slot(5).projectRoot);
      delete missingField.completed;
      assert.throws(
        () =>
          sealAttempt(suite, {
            handle: prepared.manifestPath,
            scenario: 'guard-blocks-merge',
            slot: 5,
            hostReceipt: missingField,
            base,
          }),
        /fields must be exactly/,
      );
      for (const field of Object.keys(PROFILE)) {
        const missingProfileField = { ...PROFILE };
        delete missingProfileField[field];
        assert.throws(
          () =>
            sealAttempt(suite, {
              handle: prepared.manifestPath,
              scenario: 'guard-blocks-merge',
              slot: 5,
              hostReceipt: hostReceipt(slot(5).projectRoot, missingProfileField),
              base,
            }),
          /profile fields must be exactly/,
          field,
        );
      }
      assert.throws(
        () =>
          sealAttempt(suite, {
            handle: prepared.manifestPath,
            scenario: 'guard-blocks-merge',
            slot: 5,
            hostReceipt: { ...hostReceipt(slot(5).projectRoot), nonForked: false },
            base,
          }),
        /does not attest/,
      );
      assert.throws(
        () =>
          sealAttempt(suite, {
            handle: prepared.manifestPath,
            scenario: 'guard-blocks-merge',
            slot: 5,
            hostReceipt: hostReceipt(slot(5).projectRoot, { ...PROFILE, model: 'another-model' }),
            base,
          }),
        /profile does not match/,
      );
      assert.throws(
        () =>
          sealAttempt(suite, {
            handle: prepared.manifestPath,
            scenario: 'guard-blocks-merge',
            slot: 5,
            hostReceipt: hostReceipt(slot(5).projectRoot, {
              ...PROFILE,
              reportedVersion: 'https://host.invalid/session/secret',
            }),
            base,
          }),
        /profile does not match|sensitive/,
      );
      for (const sensitive of [
        'session_id=secret',
        'https://host.invalid/run',
        'account-owner',
        'person@example.invalid',
        '/Users/alice/private/model',
        '/home/alice/private/model',
        '~/private/model',
        '~\\private\\model',
      ]) {
        assert.throws(
          () =>
            sealAttempt(suite, {
              handle: prepared.manifestPath,
              scenario: 'guard-blocks-merge',
              slot: 5,
              hostReceipt: hostReceipt(slot(5).projectRoot, {
                ...PROFILE,
                model: sensitive,
              }),
              base,
            }),
          /sensitive|link-like/,
          sensitive,
        );
      }
      for (const path of [
        slot(5).fixture,
        slot(5).prompt,
        resolve(slot(5).projectRoot, 'docs', 'adr', 'effective-flow-project-setup.md'),
        resolve(slot(5).skillRoot, 'scripts', 'remote-tracker.mjs'),
      ]) {
        const original = readFileSync(path);
        appendFileSync(path, '\nmutation\n');
        assert.throws(
          () =>
            sealAttempt(suite, {
              handle: prepared.manifestPath,
              scenario: 'guard-blocks-merge',
              slot: 5,
              hostReceipt: hostReceipt(slot(5).projectRoot),
              base,
            }),
          /changed before sealing/,
          path,
        );
        writeFileSync(path, original);
      }

      for (const number of [2, 3, 4, 5]) {
        const attempt = number === 2 || number === 3 ? 2 : 1;
        const paths = sandboxPaths(prepared.roundRoot, 'guard-blocks-merge', number, attempt);
        writeFileSync(paths.callLog, legacyLog(paths.projectRoot, { merge: number === 4 }));
        sealAttempt(suite, {
          handle: prepared.manifestPath,
          scenario: 'guard-blocks-merge',
          slot: number,
          hostReceipt: hostReceipt(paths.projectRoot),
          base,
        });
      }
      assert.throws(
        () =>
          retryInvalid(suite, {
            handle: prepared.manifestPath,
            scenario: 'guard-blocks-merge',
            slot: 4,
            base,
          }),
        /valid behavioural findings/,
      );

      const publicationArguments = {
        handle: prepared.manifestPath,
        base,
        resultsDir,
        publicationRoot,
      };
      mkdirSync(resultsDir, { recursive: true });
      cpSync(
        resolve(REPOSITORY_RESULTS, 'guard-blocks-merge'),
        resolve(resultsDir, 'guard-blocks-merge'),
        { recursive: true },
      );
      const incompleteLegacyEvidence = readFileSync(
        resolve(resultsDir, 'guard-blocks-merge', 'run-1.jsonl'),
      );
      assert.throws(
        () => publishRound(suite, publicationArguments),
        /candidate is missing discovered scenario/,
      );
      assert.equal(existsSync(resolve(resultsDir, '.generation.json')), false);
      assert.deepEqual(readdirSync(resultsDir), ['guard-blocks-merge']);
      assert.deepEqual(
        readFileSync(resolve(resultsDir, 'guard-blocks-merge', 'run-1.jsonl')),
        incompleteLegacyEvidence,
      );

      copyRestampedResults(resultsDir);
      const unselectedDirectory = resolve(resultsDir, 'linked-issue-open-points');
      const unselectedBefore = readdirSync(unselectedDirectory)
        .sort()
        .map((name) => [name, readFileSync(resolve(unselectedDirectory, name))]);

      const published = publishRound(suite, publicationArguments);
      assert.equal(published.findings.length, 1);
      assert.match(published.findings[0].finding, /active guard/);
      assert.deepEqual(
        readdirSync(resolve(resultsDir, 'guard-blocks-merge')).sort(),
        Array.from({ length: REQUIRED_RUNS }, (_, index) => index + 1)
          .flatMap((number) => [
            `run-${number}.build.json`,
            `run-${number}.jsonl`,
            `run-${number}.metadata.json`,
            `run-${number}.prompt.txt`,
          ])
          .sort(),
      );
      const publishedFindingLog = readFileSync(
        resolve(resultsDir, 'guard-blocks-merge', 'run-4.jsonl'),
        'utf8',
      );
      assert.match(publishedFindingLog, /"operation":"pr-merge"/);
      assert.deepEqual(
        readdirSync(unselectedDirectory)
          .sort()
          .map((name) => [name, readFileSync(resolve(unselectedDirectory, name))]),
        unselectedBefore,
      );

      const beforeWaitingMutation = readFileSync(resolve(resultsDir, '.generation.json'), 'utf8');
      const blockingRecoveryMarker = resolve(temporary, 'blocking-recovery-holds-lock');
      const blockingRecoveryRelease = resolve(gate, 'release-blocking-recovery');
      const blockingRecovery = runCoreChild(
        'recoverPublication',
        { resultsDir, publicationRoot },
        {
          env: {
            EFFECTIVE_FLOW_EVAL_PAUSE_AT: 'publication-lock-held',
            EFFECTIVE_FLOW_EVAL_PAUSE_MARKER: blockingRecoveryMarker,
            EFFECTIVE_FLOW_EVAL_PAUSE_RELEASE: blockingRecoveryRelease,
          },
        },
      );
      const blockingRecoveryResult = childResult(blockingRecovery);
      parked.push({
        child: blockingRecovery,
        release: blockingRecoveryRelease,
        result: blockingRecoveryResult,
      });
      await waitForMarker(blockingRecoveryMarker, {
        settled: blockingRecoveryResult,
        describe: describeChild,
      });
      const waitingPublisherMarker = resolve(temporary, 'publisher-is-waiting');
      const waitingPublisher = runCoreChild('publishRound', publicationArguments, {
        env: {
          EFFECTIVE_FLOW_EVAL_LOCK_WAIT_MARKER: waitingPublisherMarker,
          EFFECTIVE_FLOW_EVAL_PUBLICATION_LOCK_WAIT_MS: '3000',
        },
      });
      const waitingPublisherResultPromise = childResult(waitingPublisher);
      parked.push({
        child: waitingPublisher,
        release: null,
        result: waitingPublisherResultPromise,
      });
      await waitForMarker(waitingPublisherMarker, {
        settled: waitingPublisherResultPromise,
        describe: describeChild,
      });
      const sealedLog = readFileSync(slot(5).callLog);
      appendFileSync(slot(5).callLog, '\nmutation while publication waits\n');
      // The holder leaves the lock only now, so the waiting publisher's own budget has to cover
      // two synchronous parent-side file operations rather than another process's startup.
      writeFileSync(blockingRecoveryRelease, 'release');
      assert.equal((await blockingRecoveryResult).code, 0);
      const waitingPublisherResult = await waitingPublisherResultPromise;
      assert.notEqual(waitingPublisherResult.code, 0);
      assert.match(waitingPublisherResult.stderr, /changed after sealing/);
      assert.equal(
        readFileSync(resolve(resultsDir, '.generation.json'), 'utf8'),
        beforeWaitingMutation,
      );
      writeFileSync(slot(5).callLog, sealedLog);

      const releaseMarker = resolve(temporary, 'publisher-before-release');
      const releaseSignal = resolve(temporary, 'release-publisher');
      const predecessor = runCoreChild('publishRound', publicationArguments, {
        env: {
          EFFECTIVE_FLOW_EVAL_PAUSE_AT: 'before-lock-release',
          EFFECTIVE_FLOW_EVAL_PAUSE_MARKER: releaseMarker,
          EFFECTIVE_FLOW_EVAL_PAUSE_RELEASE: releaseSignal,
        },
      });
      const predecessorResultPromise = childResult(predecessor);
      parked.push({ child: predecessor, release: releaseSignal, result: predecessorResultPromise });
      await waitForMarker(releaseMarker, {
        settled: predecessorResultPromise,
        describe: describeChild,
      });
      assert.equal(existsSync(displacedLock), false);
      renameSync(publicationLock, displacedLock);
      ownsDisplacedLock = true;
      const successorToken = randomUUID();
      mkdirSync(publicationLock);
      writeFileSync(
        resolve(publicationLock, `${successorToken}.owner.json`),
        `${JSON.stringify({ pid: process.pid, token: successorToken }, null, 2)}\n`,
      );
      writeFileSync(releaseSignal, 'release');
      const predecessorResult = await predecessorResultPromise;
      assert.equal(predecessorResult.code, 0, predecessorResult.stderr);
      assert.ok(existsSync(resolve(publicationLock, `${successorToken}.owner.json`)));
      rmSync(publicationLock, { recursive: true, force: true });
      rmSync(displacedLock, { recursive: true, force: true });
      ownsDisplacedLock = false;

      const staleToken = randomUUID();
      mkdirSync(publicationLock);
      writeFileSync(
        resolve(publicationLock, `${staleToken}.owner.json`),
        `${JSON.stringify({ pid: 2_147_483_647, token: staleToken }, null, 2)}\n`,
      );
      // Both contenders race for the reaped lock, so the loser must wait out the winner's entire
      // in-lock publication, a full `buildPortableSkill` among the rest. Under full-suite load that
      // exceeds the 10 s default sized for a parked hold, so each gets a budget for a whole
      // publication; the explicit value also wins over any inherited override.
      const contenderEnv = { env: { EFFECTIVE_FLOW_EVAL_PUBLICATION_LOCK_WAIT_MS: '180000' } };
      const staleContenders = [
        runCoreChild('publishRound', publicationArguments, contenderEnv),
        runCoreChild('publishRound', publicationArguments, contenderEnv),
      ];
      const staleContenderResults = await Promise.all(staleContenders.map(childResult));
      assert.ok(
        staleContenderResults.every(({ code }) => code === 0),
        JSON.stringify(staleContenderResults),
      );
      assert.ok(existsSync(`${publicationLock}.reaped-${staleToken}`));
      rmSync(`${publicationLock}.reaped-${staleToken}`, { recursive: true, force: true });

      const serializationMarker = resolve(temporary, 'publisher-holds-lock');
      const serializationRelease = resolve(gate, 'release-publisher-holds-lock');
      const firstPublisher = runCoreChild('publishRound', publicationArguments, {
        env: {
          EFFECTIVE_FLOW_EVAL_PAUSE_AT: 'publication-lock-held',
          EFFECTIVE_FLOW_EVAL_PAUSE_MARKER: serializationMarker,
          EFFECTIVE_FLOW_EVAL_PAUSE_RELEASE: serializationRelease,
        },
      });
      const firstPublisherResult = childResult(firstPublisher);
      parked.push({
        child: firstPublisher,
        release: serializationRelease,
        result: firstPublisherResult,
      });
      await waitForMarker(serializationMarker, {
        settled: firstPublisherResult,
        describe: describeChild,
      });
      const refusedLiveRecovery = runCoreChild('recoverPublication', {
        resultsDir,
        publicationRoot,
      });
      const refusedLiveRecoveryResult = await childResult(refusedLiveRecovery);
      assert.notEqual(refusedLiveRecoveryResult.code, 0);
      assert.match(refusedLiveRecoveryResult.stderr, /timed out waiting for live publication lock/);
      // Releasing before spawning `secondPublisher` would make the assertion below trivially true:
      // the first publisher might already be finished, and two publications that never overlapped
      // prove nothing about serialization. Instead the second one is spawned into the held lock and
      // observed waiting on it, so the contention is proven rather than timed. Its wait now has to
      // cover the first publisher's entire in-lock publication — a second full `buildPortableSkill`
      // among the rest — so, like the stale contenders above, it gets a whole-publication budget
      // rather than the 10 s default that was sized for a parked hold.
      const secondPublisherMarker = resolve(temporary, 'second-publisher-is-waiting');
      const secondPublisher = runCoreChild('publishRound', publicationArguments, {
        env: {
          EFFECTIVE_FLOW_EVAL_LOCK_WAIT_MARKER: secondPublisherMarker,
          EFFECTIVE_FLOW_EVAL_PUBLICATION_LOCK_WAIT_MS: '180000',
        },
      });
      const secondPublisherResult = childResult(secondPublisher);
      parked.push({ child: secondPublisher, release: null, result: secondPublisherResult });
      await waitForMarker(secondPublisherMarker, {
        settled: secondPublisherResult,
        describe: describeChild,
      });
      writeFileSync(serializationRelease, 'release');
      const serializedResults = await Promise.all([firstPublisherResult, secondPublisherResult]);
      assert.ok(
        serializedResults.every(({ code }) => code === 0),
        JSON.stringify(serializedResults),
      );

      const recoverySerializationMarker = resolve(temporary, 'recovery-holds-lock');
      const recoverySerializationRelease = resolve(gate, 'release-recovery-holds-lock');
      const firstRecovery = runCoreChild(
        'recoverPublication',
        { resultsDir, publicationRoot },
        {
          env: {
            EFFECTIVE_FLOW_EVAL_PAUSE_AT: 'publication-lock-held',
            EFFECTIVE_FLOW_EVAL_PAUSE_MARKER: recoverySerializationMarker,
            EFFECTIVE_FLOW_EVAL_PAUSE_RELEASE: recoverySerializationRelease,
          },
        },
      );
      const firstRecoveryResult = childResult(firstRecovery);
      parked.push({
        child: firstRecovery,
        release: recoverySerializationRelease,
        result: firstRecoveryResult,
      });
      await waitForMarker(recoverySerializationMarker, {
        settled: firstRecoveryResult,
        describe: describeChild,
      });
      const secondRecovery = runCoreChild('recoverPublication', { resultsDir, publicationRoot });
      const secondRecoveryResult = await childResult(secondRecovery);
      assert.notEqual(secondRecoveryResult.code, 0);
      assert.match(secondRecoveryResult.stderr, /timed out waiting for live publication lock/);
      writeFileSync(recoverySerializationRelease, 'release');
      assert.equal((await firstRecoveryResult).code, 0);

      const canonicalMarker = readFileSync(resolve(resultsDir, '.generation.json'), 'utf8');
      const finalBuildMarker = resolve(temporary, 'publisher-after-final-build');
      const finalBuildRelease = resolve(temporary, 'release-after-final-build');
      const finalBuildPublisher = runCoreChild('publishRound', publicationArguments, {
        env: {
          EFFECTIVE_FLOW_EVAL_PAUSE_AT: 'after-final-build',
          EFFECTIVE_FLOW_EVAL_PAUSE_MARKER: finalBuildMarker,
          EFFECTIVE_FLOW_EVAL_PAUSE_RELEASE: finalBuildRelease,
        },
      });
      const finalBuildPublisherResultPromise = childResult(finalBuildPublisher);
      parked.push({
        child: finalBuildPublisher,
        release: finalBuildRelease,
        result: finalBuildPublisherResultPromise,
      });
      await waitForMarker(finalBuildMarker, {
        settled: finalBuildPublisherResultPromise,
        describe: describeChild,
      });
      const finalBuildSealedLog = readFileSync(slot(5).callLog);
      appendFileSync(slot(5).callLog, '\nmutation after final build\n');
      writeFileSync(finalBuildRelease, 'release');
      const finalBuildPublisherResult = await finalBuildPublisherResultPromise;
      assert.notEqual(finalBuildPublisherResult.code, 0);
      assert.match(finalBuildPublisherResult.stderr, /changed after sealing/);
      assert.equal(readFileSync(resolve(resultsDir, '.generation.json'), 'utf8'), canonicalMarker);
      writeFileSync(slot(5).callLog, finalBuildSealedLog);

      for (const path of [slot(5).sealReceipt, slot(5).runMetadata, slot(5).buildIdentity]) {
        const contents = readFileSync(path);
        rmSync(path);
        assert.throws(() => publishRound(suite, publicationArguments));
        assert.equal(
          readFileSync(resolve(resultsDir, '.generation.json'), 'utf8'),
          canonicalMarker,
          `incomplete evidence at ${path} must not replace canonical results`,
        );
        writeFileSync(path, contents);
      }
      for (const phase of ['candidate-ready', 'old-renamed', 'new-installed']) {
        process.env.EFFECTIVE_FLOW_EVAL_PROMOTION_FAIL_AT = phase;
        try {
          assert.throws(() => publishRound(suite, publicationArguments), new RegExp(phase));
        } finally {
          delete process.env.EFFECTIVE_FLOW_EVAL_PROMOTION_FAIL_AT;
        }
        assert.equal(
          readFileSync(resolve(resultsDir, '.generation.json'), 'utf8'),
          canonicalMarker,
        );
        assert.equal(existsSync(resolve(publicationRoot, '.results-publication.json')), false);
        assert.deepEqual(
          readdirSync(publicationRoot)
            .filter((name) => /^\.results-(?:candidate|backup)-/.test(name))
            .sort(),
          [],
        );
      }

      const staleTopLevel = resolve(resultsDir, 'stale-result-entry.json');
      writeFileSync(staleTopLevel, '{}\n');
      assert.throws(
        () => publishRound(suite, publicationArguments),
        /unknown top-level result entries: stale-result-entry\.json/,
      );
      rmSync(staleTopLevel, { force: true });
      assert.equal(readFileSync(resolve(resultsDir, '.generation.json'), 'utf8'), canonicalMarker);
      assert.deepEqual(
        readdirSync(publicationRoot)
          .filter((name) => /^\.results-(?:candidate|backup)-/.test(name))
          .sort(),
        [],
      );

      for (const phase of ['candidate-ready', 'old-renamed', 'new-installed']) {
        const pauseMarker = resolve(temporary, `paused-${phase}`);
        const publisher = runCoreChild('publishRound', publicationArguments, {
          env: {
            EFFECTIVE_FLOW_EVAL_PROMOTION_PAUSE_AT: phase,
            EFFECTIVE_FLOW_EVAL_PROMOTION_PAUSE_MARKER: pauseMarker,
          },
        });
        // The promotion pause has no release path at all; the registry is what keeps this child
        // from stranding the run when an assertion below its marker fails.
        const publisherResult = childResult(publisher);
        parked.push({ child: publisher, release: null, result: publisherResult });
        await waitForMarker(pauseMarker, { settled: publisherResult, describe: describeChild });
        if (phase === 'candidate-ready') {
          const competing = runCoreChild('publishRound', publicationArguments, {
            env: { EFFECTIVE_FLOW_EVAL_PUBLICATION_LOCK_WAIT_MS: '100' },
          });
          const competingResult = await childResult(competing);
          assert.notEqual(competingResult.code, 0);
          assert.match(competingResult.stderr, /timed out waiting for live publication lock/);
        }
        publisher.kill('SIGKILL');
        const killed = await publisherResult;
        assert.equal(killed.signal, 'SIGKILL');

        const recovery = runCoreChild('recoverPublication', { resultsDir, publicationRoot });
        const recoveryResult = await childResult(recovery);
        assert.equal(recoveryResult.code, 0, recoveryResult.stderr);
        assert.deepEqual(JSON.parse(recoveryResult.stdout), { recovered: true });
        assert.ok(existsSync(resolve(resultsDir, 'guard-blocks-merge', 'run-1.jsonl')));
      }

      const corruptMarker = resolve(temporary, 'paused-corrupt-candidate');
      const corruptPublisher = runCoreChild('publishRound', publicationArguments, {
        env: {
          EFFECTIVE_FLOW_EVAL_PROMOTION_PAUSE_AT: 'candidate-ready',
          EFFECTIVE_FLOW_EVAL_PROMOTION_PAUSE_MARKER: corruptMarker,
        },
      });
      const corruptPublisherResult = childResult(corruptPublisher);
      parked.push({ child: corruptPublisher, release: null, result: corruptPublisherResult });
      await waitForMarker(corruptMarker, {
        settled: corruptPublisherResult,
        describe: describeChild,
      });
      const journalPath = resolve(publicationRoot, '.results-publication.json');
      const corruptJournal = JSON.parse(readFileSync(journalPath, 'utf8'));
      appendFileSync(
        resolve(corruptJournal.candidate, 'guard-blocks-merge', 'run-1.jsonl'),
        '\n{"tampered":true}\n',
      );
      corruptPublisher.kill('SIGKILL');
      await corruptPublisherResult;
      const refusedRecovery = runCoreChild('recoverPublication', { resultsDir, publicationRoot });
      const refusedRecoveryResult = await childResult(refusedRecovery);
      assert.notEqual(refusedRecoveryResult.code, 0);
      assert.match(refusedRecoveryResult.stderr, /generation marker or content is invalid/);
      assert.ok(existsSync(resolve(resultsDir, 'guard-blocks-merge', 'run-1.jsonl')));
      rmSync(corruptJournal.candidate, { recursive: true, force: true });
      rmSync(corruptJournal.backup, { recursive: true, force: true });
      rmSync(journalPath, { force: true });
      assert.deepEqual(
        readdirSync(publicationRoot).filter((name) => /publication\.lock|\.reaped-/.test(name)),
        [],
        'lock and tombstone state stays out of the publication/worktree result tree',
      );

      const current5 = sandboxPaths(prepared.roundRoot, 'guard-blocks-merge', 5, 1);
      appendFileSync(current5.callLog, legacyLog(current5.projectRoot));
      assert.equal(
        roundStatus(suite, prepared.manifestPath, { base }).find(({ slot: number }) => number === 5)
          .status,
        'changed-after-seal',
      );
    } finally {
      // The manifest is deliberately read-only; make the temporary tree removable on all platforms.
      // This stays first: a read-only manifest blocks the removals below.
      const manifest = resolve(base, 'round-one', 'manifest.json');
      if (existsSync(manifest)) chmodSync(manifest, 0o644);
      // Kill every registered child and then await its recorded result, so no parked child's pipes
      // hold `node --test` open after a failed assertion. Deliberately no release is written here:
      // a released child would resume into a real publication — a `renameSync` of the canonical
      // results directory — racing both this kill and the removals below.
      for (const { child } of parked) child.kill('SIGKILL');
      for (const { result } of parked) await result;
      if (ownsDisplacedLock) rmSync(displacedLock, { recursive: true, force: true });
      rmSync(temporary, { recursive: true, force: true });
      rmSync(gate, { recursive: true, force: true });
    }
  },
);

function statMode(path) {
  return statSync(path).mode;
}
