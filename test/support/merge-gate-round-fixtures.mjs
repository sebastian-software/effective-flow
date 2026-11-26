// Fixtures shared by the merge-gate eval round tests: the attested receipt profile, child-process
// results, the re-stamped copy of the repository's archived results corpus, and the synthetic runs
// that stand in for a scenario the corpus has not recorded yet.

import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  buildPortableSkill,
  pristineScenarioBuildIdentity,
} from '../../evals/_scaffold/build-identity.mjs';
import { discoverSuite, REQUIRED_RUNS } from '../../evals/_scaffold/suite.mjs';
import { LINE_REQUEST_SENTENCE } from '../../evals/merge-gate/_scaffold/evaluate.mjs';
import suite from '../../evals/merge-gate/suite.config.mjs';
import {
  PRESENCE_NOTICE_SCENARIO,
  QUICK_COMMIT_SCENARIO,
  provisionedRemoteRefs,
} from '../../evals/merge-gate/_scaffold/run-state-seed.mjs';
import { SEALED_OBSERVATION_SCHEMA } from '../../evals/merge-gate/_scaffold/sealed-observation.mjs';

// This module lives one directory below `test/`, so the repository root is two levels up.
const REPOSITORY_ROOT = resolve(import.meta.dirname, '..', '..');

// The attested receipt profile of every sealed test slot. The keys the suite pins come from the pin
// itself, so the fixture drives the real suite with a profile `prepare` and `publish` accept; the
// unpinned keys stay synthetic, which also shows that they are free.
export const PROFILE = {
  harness: suite.expectedProfile.harness,
  model: suite.expectedProfile.model,
  reasoningEffort: suite.expectedProfile.reasoningEffort,
  reportedVersion: suite.expectedProfile.reportedVersion,
  toolPolicy: 'test-policy',
};

// Never rejects, so `Promise.all`, the teardown and the marker waits can all rely on it. A spawn
// failure (`error` before the child has a pid) settles it at once with `code: null`; an `error`
// from a running child, such as a failed `kill`, is recorded and reported with the later `exit`.
export function childResult(child) {
  return new Promise((resolveResult) => {
    let stdout = '';
    let stderr = '';
    let error;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (failure) => {
      if (child.pid === undefined) {
        resolveResult({ code: null, signal: null, stdout, stderr, error: failure });
      } else {
        error ??= failure;
      }
    });
    child.on('exit', (code, signal) =>
      resolveResult({ code, signal, stdout, stderr, ...(error === undefined ? {} : { error }) }),
    );
  });
}

export function legacyLog(projectRoot, { merge = false, wrongRoot = false } = {}) {
  const operations = [
    'review-threads-read',
    'pr-comments-read',
    'pr-reviews-read',
    'review-threads-read',
    'pr-comments-read',
    'pr-reviews-read',
    ...(merge ? ['pr-merge'] : []),
  ];
  return `${operations
    .map((operation, index) =>
      JSON.stringify({
        seq: index + 1,
        operation,
        apply: false,
        at: '2026-09-17T00:00:00.000Z',
        cwd: wrongRoot ? '/tmp/wrong-project' : projectRoot,
      }),
    )
    .join('\n')}\n`;
}

export function hostReceipt(projectRoot, profile = PROFILE) {
  return {
    schemaVersion: 1,
    nonForked: true,
    initialWorkingRoot: projectRoot,
    taskInput: 'rendered-prompt-only',
    completed: true,
    profile: { ...profile },
  };
}

export const REPOSITORY_RESULTS = resolve(REPOSITORY_ROOT, 'evals', 'merge-gate', 'results');

// The repository's archived corpus, copied into a temporary publication root so `publishRound` has
// standing evidence to carry forward, re-stamped to the identity of the tree the test is running
// against.
//
// These lifecycle fixtures use current stamps to keep locking, journalling and promotion checks
// independent of corpus freshness. Only temporary stamp/metadata bindings are rewritten; the
// recorded behavioral logs remain unchanged. The selective-publication regression below instead
// constructs one coherent stale unit and proves its provenance survives publication byte-for-byte.
//
// A scenario the repository corpus does not hold yet — one that landed before its first recorded
// round — is filled in with synthetic runs (`synthesizeUnrecordedScenario`), because publication and
// `verify` walk the whole discovered corpus and these tests are about the lifecycle, not about
// whether every scenario has been recorded. That question belongs to `verify` on the real corpus.
export function copyRestampedResults(resultsDir) {
  rmSync(resultsDir, { recursive: true, force: true });
  cpSync(REPOSITORY_RESULTS, resultsDir, { recursive: true });
  // The copied generation marker pins a content digest of the bytes as archived, and re-stamping
  // moves those bytes. Removing it leaves the tree as an unmarked — "legacy" — generation, which
  // the publication path handles explicitly; leaving a stale marker in place would fail the very
  // next `generationInfo` read with an integrity error the test is not about.
  //
  // It does change which publication branch the first publish onto this copy takes: from a marked
  // predecessor to an unmarked one. That is a deliberate trade and not a gap — the unmarked branch
  // is the one a checkout that has never published takes, the marked branch is exercised by every
  // later publish in the same test, and a caller that needs the marked branch on the *first*
  // publish has to write the marker itself rather than expect this helper to carry one.
  rmSync(resolve(resultsDir, '.generation.json'), { force: true });
  const outputRoot = mkdtempSync(join(tmpdir(), 'effective-flow-round-restamp-'));
  try {
    const skillRoot = buildPortableSkill(outputRoot);
    for (const scenario of discoverSuite(suite).scenarios) {
      const directory = resolve(resultsDir, scenario);
      if (!existsSync(directory)) {
        synthesizeUnrecordedScenario(
          directory,
          scenario,
          pristineScenarioBuildIdentity(suite, scenario, skillRoot),
        );
        continue;
      }
      const identity = pristineScenarioBuildIdentity(suite, scenario, skillRoot);
      for (const name of readdirSync(directory).filter((entry) =>
        /^run-\d+\.build\.json$/.test(entry),
      )) {
        const stampPath = resolve(directory, name);
        writeFileSync(stampPath, `${JSON.stringify(identity, null, 2)}\n`);
        const metadataPath = stampPath.replace(/\.build\.json$/, '.metadata.json');
        const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
        metadata.buildDigest = identity.digest;
        // The stamp now names the working tree's fixture, and `verify` requires the metadata to
        // bind the same fixture digest as its stamp. Left at the archived digest, any fixture edit
        // in the working tree turns every re-stamped run of that scenario into invalid evidence,
        // which is not what these tests are about.
        metadata.fixtureDigest =
          identity.scenario_inputs.files[`evals/merge-gate/fixtures/${scenario}.json`];
        // The archive was recorded under whatever profile the suite pinned at the time, and the
        // publication path holds every carried-forward slot to the current pin. Rewriting both
        // copies — sealing keeps them equal — keeps these tests about the stamps they re-point.
        metadata.profile = { ...PROFILE };
        metadata.hostAttestation.profile = { ...PROFILE };
        writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
      }
    }
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
}

// The smallest call log each not-yet-recorded scenario's evaluator passes, keyed by scenario. Every
// recorded scenario needs none. `bot-login-excluded` has no round yet, so it carries the smallest
// log its evaluator passes: a comment read, a requested merge, then the one applied merge. These runs exist only in a test's temporary
// copy and are never evidence. A scenario that lands without a recorded round and without an entry
// here fails loudly, naming the two ways out.
export const EARLY_ROUND_OPERATIONS = Object.freeze([
  'pr-status-read',
  'pr-status-read',
  'pr-checks-wait',
  'pr-status-read',
  'pr-status-read',
  'pr-status-read',
  'pr-status-read',
  'review-threads-read',
  'pr-comments-read',
  'pr-reviews-read',
  'review-threads-read',
  'pr-comments-read',
  'pr-reviews-read',
]);

// The time of the n-th synthetic lifecycle call, a second apart.
export function syntheticCallAt(index) {
  return `2026-10-16T00:01:${String(index).padStart(2, '0')}.000Z`;
}

export const UNRECORDED_SCENARIO_LOGS = Object.freeze({
  'bot-login-excluded': ['pr-comments-read', 'pr-merge', { operation: 'pr-merge', apply: true }],
  // The four no-CI policy refusals pass on the one status read that carries their deciding fact.
  'no-ci-policy-flag-absent-blocks': ['pr-status-read'],
  'no-ci-policy-reported-check-blocks': ['pr-status-read'],
  'no-ci-policy-unlisted-base-blocks': ['pr-status-read'],
  // The failing-read scenario needs the failing element served: a second status read.
  'no-ci-policy-status-read-failure-blocks': ['pr-status-read', 'pr-status-read'],
  // The two that attempt the merge: a preview, then exactly one applied call.
  'no-ci-policy-unattended-merges': ['pr-merge', { operation: 'pr-merge', apply: true }],
  'no-ci-policy-merge-failure-reports': ['pr-merge', { operation: 'pr-merge', apply: true }],
  // The presence scenario ends like merge-proceeds; the quick-commit refusal reads every guard
  // surface and the status fresh. Both also carry the sealed observation below.
  [PRESENCE_NOTICE_SCENARIO]: ['pr-merge', { operation: 'pr-merge', apply: true }],
  [QUICK_COMMIT_SCENARIO]: [
    'review-threads-read',
    'pr-comments-read',
    'pr-reviews-read',
    'pr-status-read',
  ],
  // The draft-ready scenarios. The questioning and refusing ones pass on the classification alone, the
  // two that end before it on one status read; the two re-dispatches that confirm the ready step
  // pass on the one ordered sequence the evaluator requires: classification, a fresh read of all
  // four surfaces, a second classification, a dry run, the applied call and a read after it. The
  // Forgejo ones add their local merge proof.
  'draft-ready-relayed-returns-question': ['pr-draft-classify'],
  'draft-ready-plan-only-asks-nothing': ['pr-draft-classify'],
  'draft-ready-blockers-ask-nothing': ['pr-draft-classify'],
  'draft-ready-keep-draft-stops': ['pr-status-read'],
  'draft-ready-non-interactive-never-marks': ['pr-status-read'],
  'draft-ready-redispatch-marks-ready': [
    'pr-draft-classify',
    'pr-status-read',
    'review-threads-read',
    'pr-comments-read',
    'pr-reviews-read',
    'pr-draft-classify',
    'pr-mark-ready',
    { operation: 'pr-mark-ready', apply: true },
    'pr-status-read',
  ],
  'forgejo-wip-draft-conflict-asks-nothing': ['merge-proof-local'],
  'forgejo-wip-draft-marks-ready': [
    'merge-proof-local',
    'pr-draft-classify',
    'pr-status-read',
    'review-threads-read',
    'pr-comments-read',
    'pr-reviews-read',
    'pr-draft-classify',
    'pr-mark-ready',
    { operation: 'pr-mark-ready', apply: true },
    'pr-status-read',
  ],
  // The two repair scenarios run head-indexed, sequenced fixtures, so their logs are lifecycle logs,
  // and each run pairs a repair trace: two delegations, plus the one gate push between them where the
  // composition holds one. The merging one applies its merge after the second delegation; the
  // stopping one reads the threads after it and merges nothing.
  'repair-after-base-merge-merges': {
    operations: ['pr-merge', { operation: 'pr-merge', apply: true }],
    trace: ['dispatch:seed>repair-1', 'push:repair-1>base-merge', 'dispatch:base-merge>repair-2'],
  },
  'repeated-ineffective-repair-stops': {
    operations: ['review-threads-read'],
    trace: ['dispatch:seed>repair-1', 'dispatch:repair-1>repair-2'],
  },
  // The line-request scenario reaches Phase 4, so it reads every guard surface twice, and pairs an
  // echo trace: the one delegation and the one line request carrying the contract sentence.
  'iterate-scope-line-request': {
    operations: [
      'review-threads-read',
      'pr-comments-read',
      'pr-reviews-read',
      'review-threads-read',
      'pr-comments-read',
      'pr-reviews-read',
    ],
    lineRequestTrace: true,
  },
  // The early-round pair runs a sequenced status read, so its logs are lifecycle logs: the green
  // element is the sixth status read, served after the first wait, and Phase 4 reads every guard
  // surface. Each run pairs an echo trace with one stamped delegation, after the call at
  // `dispatchAfter`: before the wait in the scenario, after the green read in the control.
  'early-bot-round-on-pending-checks': {
    operations: EARLY_ROUND_OPERATIONS,
    dispatchAfter: 1,
  },
  'early-bot-round-control-waits-for-green': {
    operations: EARLY_ROUND_OPERATIONS,
    dispatchAfter: 6,
  },
});

// The last message each not-yet-recorded scenario that declares a sealed observation passes with.
export const UNRECORDED_LAST_MESSAGES = Object.freeze({
  [PRESENCE_NOTICE_SCENARIO]:
    'Merged pull request 42. Notice: another merge-gate run is active for PR #41.\n',
  [QUICK_COMMIT_SCENARIO]:
    'DONE\nNot merged: condition 11 has no CI evidence for the quick-validated conflict commit.\n',
});

export function fixtureOf(scenario) {
  return JSON.parse(
    readFileSync(
      resolve(REPOSITORY_ROOT, 'evals', 'merge-gate', 'fixtures', `${scenario}.json`),
      'utf8',
    ),
  );
}

// A sealed observation of an `origin` exactly as provisioning left it, with the given last message:
// what a run that pushed nothing seals. The presence scenario provisions no `origin`.
export function untouchedSealedObservation(scenario, lastMessage = null) {
  const fixture = fixtureOf(scenario);
  const record = {
    schema: SEALED_OBSERVATION_SCHEMA,
    lastMessage,
    remoteRefs: fixture.checkout ? provisionedRemoteRefs(fixture) : null,
    errors: [],
  };
  return `${JSON.stringify(record, null, 2)}\n`;
}

export const SYNTHETIC_REPAIR_THREADS = ['PRRT_kwDOrepairCauseOne', 'PRRT_kwDOrepairCauseTwo'];

// The configured-reviewer echo trace of a line-request run, in the shape the echo writes: the one
// delegation the fixture's surfaces describe, then the one line request by size and digest.
export function syntheticLineRequestTrace(scenario, projectRoot) {
  const [review] = fixtureOf(scenario).operations['pr-reviews-read'].envelope.data.result;
  const digest = (text) => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
  const items = [
    { identifier: 'A'.repeat(32), kind: 'thread', threadId: 'PRRT_kwDOconfiguredReviewer' },
    {
      identifier: 'B'.repeat(32),
      kind: 'review-body',
      reviewId: String(review.id),
      author: review.author.login,
      url: 'https://github.com/example/flow/pull/42#pullrequestreview-700002',
    },
  ];
  const schema = 'effective-flow/merge-gate-iterate-echo/v1';
  return [
    {
      schema,
      seq: 1,
      cwd: projectRoot,
      pullRequest: 42,
      itemFilter: 'threads=PRRT_kwDOconfiguredReviewer',
      controls: {
        summaryComment: 'suppressed',
        nextSteps: 'suppressed',
        reviewGuard: 'established',
      },
      items,
      body: {
        spans: 1,
        bytes: Buffer.byteLength(review.body, 'utf8'),
        digest: digest(review.body),
      },
      outcomes: items.map(({ identifier }) => ({ identifier, outcome: 'deferred' })),
    },
    {
      schema,
      seq: 2,
      kind: 'line-request',
      cwd: projectRoot,
      pullRequest: 42,
      bytes: Buffer.byteLength(LINE_REQUEST_SENTENCE, 'utf8'),
      digest: digest(LINE_REQUEST_SENTENCE),
    },
  ];
}

// The early-round echo trace: the line-request trace's delegation, stamped half a second after the
// synthetic call at `dispatchAfter`, and no line request.
export function syntheticEarlyRoundTrace(scenario, projectRoot, dispatchAfter) {
  const [delegation] = syntheticLineRequestTrace(scenario, projectRoot);
  return [{ ...delegation, at: syntheticCallAt(dispatchAfter).replace('.000Z', '.500Z') }];
}

// One synthetic repair trace line per `kind:before>after` step, in the shape the echo writes.
export function syntheticRepairTrace(steps, projectRoot) {
  let dispatch = 0;
  return steps.map((step, index) => {
    const [kind, heads] = step.split(':');
    const [before, after] = heads.split('>');
    const common = {
      schema: 'effective-flow/merge-gate-repair-trace/v1',
      seq: index + 1,
      kind,
      at: `2026-10-16T00:00:0${index + 1}.000Z`,
    };
    if (kind === 'push') {
      return {
        ...common,
        cwd: resolve(dirname(projectRoot), 'remote.git'),
        ref: 'refs/heads/effective-flow/build/sync-retry-limits',
        merge: true,
        firstParent: before,
        secondParentIsBase: true,
        label: after,
      };
    }
    const identifier = String.fromCharCode(65 + dispatch).repeat(32);
    const thread = SYNTHETIC_REPAIR_THREADS[dispatch];
    dispatch += 1;
    return {
      ...common,
      cwd: projectRoot,
      pullRequest: 42,
      itemFilter: `threads=${thread}`,
      controls: {
        summaryComment: 'suppressed',
        nextSteps: 'suppressed',
        reviewGuard: 'established',
      },
      items: [{ identifier, kind: 'thread', threadId: thread }],
      scope: { valid: true, paths: ['src/limits.mjs'], head: 'seed', mergeBase: 'seed-base' },
      body: {
        spans: 0,
        bytes: 0,
        digest: `sha256:${createHash('sha256').update('').digest('hex')}`,
      },
      planned: true,
      headBefore: before,
      headAfter: after,
      baseAdvanced: dispatch === 1,
      outcomes: [{ identifier, outcome: 'implemented' }],
    };
  });
}

// A legacy call log, or for a lifecycle entry one start and one completion per call, timed after
// every synthetic trace line.
export function syntheticCallLog(operations, projectRoot, lifecycle) {
  const records = [];
  operations.forEach((entry, index) => {
    const operation = typeof entry === 'string' ? entry : entry.operation;
    const apply = typeof entry === 'string' ? false : entry.apply;
    const at = lifecycle ? syntheticCallAt(index) : '2026-10-16T00:00:00.000Z';
    if (!lifecycle) {
      records.push({ seq: records.length + 1, operation, apply, at, cwd: projectRoot });
      return;
    }
    const callId = `synthetic-${index + 1}`;
    records.push({
      seq: records.length + 1,
      event: 'start',
      callId,
      operation,
      apply,
      at,
      cwd: projectRoot,
    });
    records.push({ seq: records.length + 1, event: 'complete', callId, at });
  });
  return records.map((record) => JSON.stringify(record)).join('\n');
}

export function synthesizeUnrecordedScenario(directory, scenario, identity) {
  const entry = UNRECORDED_SCENARIO_LOGS[scenario];
  if (!entry) {
    throw new Error(
      `${scenario} has no archived runs and no synthetic passing log in UNRECORDED_SCENARIO_LOGS; record its round or add one`,
    );
  }
  mkdirSync(directory, { recursive: true });
  const sealed = suite.sealedEvidence?.required(scenario) ? suite.sealedEvidence : null;
  for (let slot = 1; slot <= REQUIRED_RUNS; slot += 1) {
    const projectRoot = `/tmp/effective-flow-merge-gate-eval/rounds/synthetic/slots/${scenario}/slot-${slot}/attempt-1/project`;
    const target = resolve(directory, `run-${slot}`);
    const repair = !Array.isArray(entry) && entry.trace !== undefined;
    const early = !Array.isArray(entry) && entry.dispatchAfter !== undefined;
    const log = syntheticCallLog(
      Array.isArray(entry) ? entry : entry.operations,
      projectRoot,
      repair || early,
    );
    writeFileSync(`${target}.jsonl`, `${log}\n`);
    const trace = repair
      ? syntheticRepairTrace(entry.trace, projectRoot)
      : early
        ? syntheticEarlyRoundTrace(scenario, projectRoot, entry.dispatchAfter)
        : entry.lineRequestTrace
          ? syntheticLineRequestTrace(scenario, projectRoot)
          : null;
    if (trace !== null) {
      writeFileSync(
        `${target}.iterate.jsonl`,
        `${trace.map((record) => JSON.stringify(record)).join('\n')}\n`,
      );
    }
    writeFileSync(`${target}.build.json`, `${JSON.stringify(identity, null, 2)}\n`);
    const prompt = `synthetic prompt for ${scenario} slot ${slot}\n`;
    writeFileSync(`${target}.prompt.txt`, prompt);
    const metadata = {
      schemaVersion: 1,
      roundId: 'synthetic',
      scenario,
      slot,
      attempt: 1,
      sourceRevision: 'synthetic',
      projectRoot,
      profile: { ...PROFILE },
      promptDigest: `sha256:${createHash('sha256').update(prompt).digest('hex')}`,
      fixtureDigest: identity.scenario_inputs.files[`evals/merge-gate/fixtures/${scenario}.json`],
      buildDigest: identity.digest,
      hostAttestation: sealed
        ? {
            ...hostReceipt(projectRoot),
            lastMessagePath: `/tmp/effective-flow-merge-gate-eval/rounds/synthetic/slots/${scenario}/slot-${slot}/attempt-1-last-message.txt`,
          }
        : hostReceipt(projectRoot),
    };
    writeFileSync(`${target}.metadata.json`, `${JSON.stringify(metadata, null, 2)}\n`);
    if (sealed) {
      writeFileSync(
        `${target}.${sealed.archiveSuffix}`,
        untouchedSealedObservation(scenario, UNRECORDED_LAST_MESSAGES[scenario]),
      );
    }
  }
}
