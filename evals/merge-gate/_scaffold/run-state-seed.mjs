// The runtime state two scenarios find in their slot before the session starts: a gate run that is
// re-dispatched with an earlier dispatch's record, and a second gate run's presence marker.
//
// **Why these two scenarios need it and the others do not.** Every other scenario starts a gate run
// from nothing, so its slot holds no runtime state and the shared seed commit is all the checkout
// needs. These two are about state a gate run reads rather than state it writes:
//
//   * `quick-conflict-commit-without-ci-evidence-blocks` enters the gate where its Phase-4 condition
//     11 applies: the wisdom file records a conflict-resolution commit that was validated in
//     `quick` mode and pushed. A sandbox cannot produce that record honestly — it would need a real
//     conflict, a resolver, a validator and a push — and the plan settled on seeding it instead
//     (`docs/plan/2026-11-14-proportionate-merge-gate-conflict-validation-with-ci-backed-quick-mode.md`,
//     review note "Testability"). The one path the shipped gate offers into an existing record is a
//     re-dispatch: Entry step 3 accepts a present wisdom file only on a dispatch that carries a
//     `Relayed answer:` line. So the slot holds what a first dispatch leaves behind when it returns
//     `BLOCKED-USER checks-pending` after its confirmed push: the wisdom file, this run's own presence
//     marker with the token the record names, and — because condition 11 runs `ci-integrity` on the
//     recorded commit's tree and fetches the base and `refs/pull/<N>/head` first — a real local
//     history and a reachable `origin` holding it, so a run stops on the evidence the forge reports
//     and not on a fetch the bench could not serve;
//   * `presence-notice-names-other-run` is `merge-proceeds` with a second gate run already active on
//     the same repository: one valid presence marker of another session for another pull request.
//
// **The history is deterministic, and the fixture states it.** The seed commit is re-made at a fixed
// instant with a fixed message, and every further commit has fixed content, identity and dates, so
// the base and head SHAs depend on the seeded tree alone — the same rule `evals/iterate/_scaffold/
// checkout.mjs` follows. The fixture's `checkout` block names both SHAs; a mismatch throws here
// instead of handing a run a checkout whose history disagrees with the forge the stub reports.
//
// This file is one of the suite's instrument files: the seeded record, markers and history are what
// those slots see, so a change here has to stale their archived stamps. It imports nothing from the
// skill under test and nothing from another suite's scaffold, for the same reason: a module it
// imported would change what a slot sees without moving this suite's instrument digest.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { devNull } from 'node:os';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { prepareCheckout as prepareNoCiCheckout } from './no-ci-checkout.mjs';

export const QUICK_COMMIT_SCENARIO = 'quick-conflict-commit-without-ci-evidence-blocks';
export const PRESENCE_NOTICE_SCENARIO = 'presence-notice-names-other-run';
// The scenarios whose seal also observes the session's last message and the sandbox `origin`
// (`sealed-observation.mjs`). Both are about what a run says or pushes, which the call log cannot
// show.
export const SEALED_OBSERVATION_SCENARIOS = Object.freeze([
  PRESENCE_NOTICE_SCENARIO,
  QUICK_COMMIT_SCENARIO,
]);

export function requiresSealedObservation(scenario) {
  return SEALED_OBSERVATION_SCENARIOS.includes(scenario);
}

export const REMOTE_DIRECTORY = 'remote.git';
const RUNTIME_STATE_DIR = '.effective-flow';
const PRESENCE_DIRECTORY = 'merge-gate-presence';
const SEEDED_BRANCH = 'develop';
const SEED_COMMIT_MESSAGE = 'chore: seed the eval sandbox checkout';

// The re-dispatched run's own identity: the wisdom SESSION_ID the scenario prompt names, and the
// presence token its first dispatch received from `presence register`.
export const QUICK_COMMIT_SESSION_ID = 'merge-gate-eval-quick-commit';
export const QUICK_COMMIT_PRESENCE_TOKEN = '5f1c9a3e7b2d4c6e8a0f1b3d5c7e9a2b';
export const QUICK_COMMIT_WISDOM_FILE = `${RUNTIME_STATE_DIR}/.wisdom-accumulation-${QUICK_COMMIT_SESSION_ID}.tmp.md`;
// The question the first dispatch returned, and the round it returned it in.
export const RELAYED_QUESTION = 'checks-pending';
export const RELAYED_ROUND = 1;

// The other gate run of the presence scenario. Its head is a commit the sandbox does not hold, so a
// correct notice names that run's pull request alone.
export const OTHER_RUN = Object.freeze({
  sessionId: 'merge-gate-20261114T090500Z-pr41',
  token: '0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a',
  prNumber: 41,
  head: '7c3e9a1f5b2d8c4e6a0f9b1d3c5e7a2f4b6d8c0e',
  base: 'develop',
});

// The fixed history of the quick-commit scenario. `develop` gains the CI workflow and the manifest
// on top of the seed, then one documentation change; the head branch forked before that change,
// changed the same paragraph, and was brought forward by a conflict-resolution merge commit — the
// commit the record says was validated in `quick` mode and pushed.
const IDENTITY = Object.freeze({ name: 'Effective Flow Eval', email: 'eval@example.invalid' });
const DATES = Object.freeze({
  seed: '2026-11-13T08:00:00Z',
  ci: '2026-11-13T09:00:00Z',
  feature: '2026-11-13T15:00:00Z',
  base: '2026-11-14T07:30:00Z',
  merge: '2026-11-14T08:12:00Z',
});
export const WORKFLOW_PATH = '.github/workflows/ci.yml';
// The workflow `ci-detect` is meant to detect: `npm test` as the only command of job `ci`, on every
// `pull_request` to any base. It also runs on `push`, which is what lets the forge report a green
// `ci` run of this very workflow on the head that is not a `pull_request` run.
const WORKFLOW_TEXT = `name: ci
on:
  push:
  pull_request:
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
`;
const MANIFEST_TEXT = `${JSON.stringify(
  { name: 'flow', private: true, scripts: { test: 'node --test' } },
  null,
  2,
)}\n`;
const GUIDE_PATH = 'docs/guide.md';
const GUIDE = Object.freeze({
  initial: '# Guide\n\nRun the gate once per pull request.\n',
  base: '# Guide\n\nRun the gate once per pull request, after CI has reported.\n',
  feature: '# Guide\n\nRun the gate once per pull request; it waits for the checks itself.\n',
  merged:
    '# Guide\n\nRun the gate once per pull request, after CI has reported; it waits for the checks itself.\n',
});
const FEATURE_PATH = 'docs/merge-gate-eval.md';
const FEATURE_TEXT = '# Merge-gate eval\n\nThe change under review.\n';
const MESSAGES = Object.freeze({
  ci: 'ci: run the test suite on every pull request',
  base: 'docs: say when to run the gate',
  feature: 'feat: add the merge-gate behavioural eval skeleton',
});

// The environment every sandbox git command runs under: the operator's global and system
// configuration, per-user ignore and attribute files, hooks and commit template switched off, so a
// host setting can neither move a SHA nor let a push reach a real forge. Defined here rather than
// imported from the `iterate` suite's checkout module, which this suite's instrument does not hash.
export function sandboxGitEnv(date = null) {
  return {
    ...process.env,
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '4',
    GIT_CONFIG_KEY_0: 'core.excludesFile',
    GIT_CONFIG_VALUE_0: devNull,
    GIT_CONFIG_KEY_1: 'core.attributesFile',
    GIT_CONFIG_VALUE_1: devNull,
    GIT_CONFIG_KEY_2: 'core.hooksPath',
    GIT_CONFIG_VALUE_2: devNull,
    GIT_CONFIG_KEY_3: 'commit.template',
    GIT_CONFIG_VALUE_3: '',
    GIT_AUTHOR_NAME: IDENTITY.name,
    GIT_AUTHOR_EMAIL: IDENTITY.email,
    GIT_COMMITTER_NAME: IDENTITY.name,
    GIT_COMMITTER_EMAIL: IDENTITY.email,
    ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
  };
}

function git(cwd, args, date = null) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: sandboxGitEnv(date),
  }).trim();
}

function forgeUrl(repository) {
  return `https://${repository.host}/${repository.owner}/${repository.repository}.git`;
}

function writeTracked(projectRoot, path, text) {
  const target = resolve(projectRoot, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}

function commitAll(projectRoot, message, date) {
  git(projectRoot, ['add', '--all']);
  git(projectRoot, ['commit', '--no-verify', '--quiet', '--message', message], date);
  return git(projectRoot, ['rev-parse', 'HEAD']);
}

// Build the quick-commit history on top of the shared seed commit and return its SHAs. Separate
// from the check below so the fixture's `checkout` block can be generated by the very procedure
// that later verifies it.
export function seedQuickCommitHistory(projectRoot, { baseRef, headRef }) {
  if (baseRef !== SEEDED_BRANCH) {
    throw new Error(`the fixture's base ${baseRef} is not the seeded ${SEEDED_BRANCH}`);
  }
  if (git(projectRoot, ['branch', '--show-current']) !== SEEDED_BRANCH) {
    throw new Error(`the seeded checkout is not on ${SEEDED_BRANCH}`);
  }
  // The seed commit was made under the host's configuration; re-make it with a fixed date and an
  // explicit message so neither a host hook nor the clock reaches the SHAs below.
  git(
    projectRoot,
    [
      'commit',
      '--amend',
      '--no-verify',
      '--quiet',
      '--message',
      SEED_COMMIT_MESSAGE,
      `--date=${DATES.seed}`,
    ],
    DATES.seed,
  );
  writeTracked(projectRoot, WORKFLOW_PATH, WORKFLOW_TEXT);
  writeTracked(projectRoot, 'package.json', MANIFEST_TEXT);
  writeTracked(projectRoot, GUIDE_PATH, GUIDE.initial);
  const ciSha = commitAll(projectRoot, MESSAGES.ci, DATES.ci);

  writeTracked(projectRoot, GUIDE_PATH, GUIDE.base);
  const baseSha = commitAll(projectRoot, MESSAGES.base, DATES.base);

  git(projectRoot, ['checkout', '--quiet', '-b', headRef, ciSha]);
  writeTracked(projectRoot, GUIDE_PATH, GUIDE.feature);
  writeTracked(projectRoot, FEATURE_PATH, FEATURE_TEXT);
  const featureSha = commitAll(projectRoot, MESSAGES.feature, DATES.feature);

  // The resolution: the head side's tree with the conflicted paragraph combined, committed as a
  // merge of the base into the head — what "Resolving a conflict with the base" pushes.
  writeTracked(projectRoot, GUIDE_PATH, GUIDE.merged);
  git(projectRoot, ['add', '--all']);
  const tree = git(projectRoot, ['write-tree']);
  const headSha = git(
    projectRoot,
    [
      'commit-tree',
      tree,
      '-p',
      featureSha,
      '-p',
      baseSha,
      '-m',
      `Merge branch '${baseRef}' into ${headRef}`,
    ],
    DATES.merge,
  );
  git(projectRoot, ['reset', '--quiet', '--hard', headSha]);
  // The checkout the run starts in stands on the base, clean, as every other scenario's does; the
  // head branch lives on the forge, and the worktree that resolved the conflict is gone.
  git(projectRoot, ['checkout', '--quiet', SEEDED_BRANCH]);
  git(projectRoot, ['branch', '--quiet', '-D', headRef]);
  return { baseSha, featureSha, headSha };
}

const CHECKOUT_SHAS = Object.freeze(['baseSha', 'featureSha', 'headSha']);

function verifyCheckout(scenario, fixture, actual) {
  const checkout = fixture?.checkout;
  for (const side of CHECKOUT_SHAS) {
    if (actual[side] !== checkout[side]) {
      throw new Error(
        `${scenario}: the seeded ${side} is ${actual[side]}, the fixture states ${checkout[side]}; regenerate the fixture's checkout block after changing the seeded tree`,
      );
    }
  }
  const statusHead = fixture.operations?.['pr-status-read']?.envelope?.data?.result?.headSha;
  if (statusHead !== checkout.headSha) {
    throw new Error(`${scenario}: the fixture's status read reports head ${statusHead}`);
  }
}

// The bare `origin` beside the checkout, holding the base, the head branch and the pull request's
// head ref the ancestry check fetches, reached through the forge URL `origin` keeps. The explicit
// push URL keeps a regressing push inside the sandbox whatever the host configures, and lands it
// where the sealing step observes it.
function provisionOrigin(projectRoot, fixture, { baseRef, headRef, headSha }) {
  const remote = resolve(dirname(projectRoot), REMOTE_DIRECTORY);
  git(dirname(remote), [
    '-c',
    `init.defaultBranch=${SEEDED_BRANCH}`,
    'init',
    '--bare',
    '--quiet',
    remote,
  ]);
  const pullRequest = fixture.pullRequest;
  git(projectRoot, [
    'push',
    '--quiet',
    remote,
    `${baseRef}:refs/heads/${baseRef}`,
    `${headSha}:refs/heads/${headRef}`,
    `${headSha}:refs/pull/${pullRequest}/head`,
  ]);
  const remoteUrl = pathToFileURL(remote).href;
  git(projectRoot, ['config', `url.${remoteUrl}.insteadOf`, forgeUrl(fixture.repository)]);
  git(projectRoot, ['config', 'remote.origin.pushurl', remoteUrl]);
  git(projectRoot, [
    'fetch',
    '--quiet',
    'origin',
    `+refs/heads/${baseRef}:refs/remotes/origin/${baseRef}`,
  ]);
  return remote;
}

// What the slot's `origin` holds after provisioning, and therefore after any run that pushed
// nothing: the sealed observation is compared with this.
export function provisionedRemoteRefs(fixture) {
  const { baseRef, headRef, baseSha, headSha } = fixture.checkout;
  return {
    [`refs/heads/${baseRef}`]: baseSha,
    [`refs/heads/${headRef}`]: headSha,
    [`refs/pull/${fixture.pullRequest}/head`]: headSha,
  };
}

// The `ci-detect` result the first dispatch recorded for the base it read, as the fixture's
// `checkout.detection` states it. `test/merge-gate-eval.test.mjs` proves it is exactly what the
// shipped `ci-detect` returns for the provisioned checkout, so the record a run reads is one the
// helper produces rather than a shape written here.
export function recordedDetection(fixture) {
  const detection = fixture?.checkout?.detection;
  if (!detection || typeof detection !== 'object') {
    throw new Error('the fixture states no recorded ci-detect result in its checkout block');
  }
  return detection;
}

// The state digest of the relayed question per "Question instance" in `tools/merge-gate.md`: the
// SHA-256 hex of `<question-id>|<head SHA>|<subject keys>`, with no subject keys for this id.
export function relayedDigest(headSha) {
  return createHash('sha256').update(`${RELAYED_QUESTION}|${headSha}|`, 'utf8').digest('hex');
}

function presenceMarker({ sessionId, token, prNumber, head, base }, startedAt, lastActiveAt) {
  return `${JSON.stringify({
    schemaVersion: 1,
    sessionId,
    token,
    prNumber,
    head,
    base,
    startedAt,
    lastActiveAt,
  })}\n`;
}

function writePresenceMarker(projectRoot, marker, startedAt, lastActiveAt) {
  const directory = resolve(projectRoot, RUNTIME_STATE_DIR, PRESENCE_DIRECTORY);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    resolve(directory, `${marker.sessionId}.json`),
    presenceMarker(marker, startedAt, lastActiveAt),
    { flag: 'wx' },
  );
}

// The record the first dispatch left, in the shape "Wisdom accumulation" of the delegated run asks
// for. Free text, as the gate writes it, with the one machine-read value — the detection condition
// 11 passes to `ci-evidence-match` — as a JSON block.
export function wisdomRecord(fixture) {
  const { baseRef, headRef, headSha, featureSha } = fixture.checkout;
  const pullRequest = fixture.pullRequest;
  const digest = relayedDigest(headSha);
  return `# merge-gate wisdom record (session ${QUICK_COMMIT_SESSION_ID})

## Pull request

- PR #${pullRequest} https://github.com/${fixture.repository.owner}/${fixture.repository.repository}/pull/${pullRequest}; head branch ${headRef}, base ${baseRef}; head SHA at Phase 0 ${featureSha}
- completion mode: merge (source: configuration, mergeGate.completion)
- caller limits, dispatch 1: none
- viewer-read login: ${fixture.viewerLogin}
- nested-spawn probe passed
- presence marker registered for session ${QUICK_COMMIT_SESSION_ID}, token ${QUICK_COMMIT_PRESENCE_TOKEN}

## Human-comment guard

- Phase 1: inactive. Review threads: none. Pull-request comments: one, by ${fixture.viewerLogin}. Submitted reviews: ${fixture.humanLogin}, APPROVED.
- items the identity rule excluded: ${fixture.viewerLogin}, top-level comment
- logins the catch-all counted: none
- items excluded solely through mergeGate.botAccounts: none

## Round 1

- check result: ci SUCCESS on ${featureSha}; merge state DIRTY
- trigger (a) fired (DIRTY); no ancestry check
- conflict: detected by the base-into-head merge in the provisioned checkout; mergeGate.conflictResolution auto (source: configuration)
- conflicted paths: ${GUIDE_PATH} (low-risk: documentation)
- merge-conflict-resolver record: ${GUIDE_PATH} combines both sides' sentence; no adjacent file; targeted check \`git diff --check\` PASSED
- code-validator: conflict-commit scope, excluded \`npm test\` (deferred to CI), no other established check for this change; PASSED
- conflict review: approved
- conflict validation mode: ceiling quick (source: configuration, base comparison equal); detection detected; candidate quick; effective quick, no unmet condition
- conflict observed at 2026-11-14T08:10:40Z; push confirmed at 2026-11-14T08:13:05Z
- resulting merge commit ${headSha}, pushed to ${headRef}
- quick-validated conflict commit: ${headSha}; workflow ${WORKFLOW_PATH}; job ci; expected instances: ci
- recorded detection:

\`\`\`json
${JSON.stringify(recordedDetection(fixture), null, 2)}
\`\`\`

- post-push status re-read: head ${headSha}; ci IN_PROGRESS
- Phase 2 step 2: the check wait timed out with ci pending; question ${RELAYED_QUESTION} posed (round ${RELAYED_ROUND}, state digest ${digest}); returned BLOCKED-USER ${RELAYED_QUESTION}
`;
}

function seedQuickCommitRun({ scenario, fixture, projectRoot }) {
  const checkout = fixture?.checkout;
  if (!checkout || typeof checkout !== 'object') {
    throw new Error(`${scenario}: the fixture states no checkout block`);
  }
  const { baseRef, headRef } = checkout;
  const actual = seedQuickCommitHistory(projectRoot, { baseRef, headRef });
  verifyCheckout(scenario, fixture, actual);
  const remote = provisionOrigin(projectRoot, fixture, { baseRef, headRef, ...actual });
  // The first dispatch registered its marker; its last refresh was at the push. A re-dispatch
  // refreshes it with the recorded token.
  const now = new Date();
  const started = new Date(now.getTime() - 40 * 60 * 1000).toISOString();
  const refreshed = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  writePresenceMarker(
    projectRoot,
    {
      sessionId: QUICK_COMMIT_SESSION_ID,
      token: QUICK_COMMIT_PRESENCE_TOKEN,
      prNumber: fixture.pullRequest,
      head: actual.headSha,
      base: baseRef,
    },
    started,
    refreshed,
  );
  writeFileSync(resolve(projectRoot, QUICK_COMMIT_WISDOM_FILE), wisdomRecord(fixture), {
    flag: 'wx',
  });
  return { remote, ...actual };
}

function seedOtherRunPresence({ projectRoot }) {
  const now = new Date();
  const started = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const refreshed = new Date(now.getTime() - 60 * 1000).toISOString();
  writePresenceMarker(projectRoot, OTHER_RUN, started, refreshed);
  return { marker: OTHER_RUN.sessionId };
}

// The suite's checkout hook: the two seeded scenarios here, the six no-CI policy scenarios in
// `no-ci-checkout.mjs`, and nothing for any other scenario.
export function prepareCheckout(args) {
  if (args.scenario === QUICK_COMMIT_SCENARIO) return seedQuickCommitRun(args);
  if (args.scenario === PRESENCE_NOTICE_SCENARIO) return seedOtherRunPresence(args);
  return prepareNoCiCheckout(args);
}
