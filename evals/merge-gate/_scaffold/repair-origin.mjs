// The `origin` the two repair-accounting scenarios run against: a local bare repository holding real
// commits, so the gate's repair helper reads real history and the head can move through the run.
//
// **Why these two scenarios need more than `no-ci-checkout.mjs` gives.** Every other gate scenario
// reads the forge through the stub and never needs a commit beyond the shared seed. A repair round
// does: the gate runs `repair-attempt.mjs` against `git rev-list`, `diff-tree` and the merge base,
// pushes its own base merge, and reads the head the delegated repair left behind. So the checkout
// gets a pull request with real history — the shared seed on `develop`, one pull-request commit on
// the head branch — and the bare repository beside it holds that history plus the repairs, seeded
// now and landed later:
//
//   * `refs/heads/develop` and `refs/heads/<head>` with `refs/pull/<N>/head` beside it, as a forge
//     keeps them;
//   * `refs/eval/dispatch/<n>`: the repair commit the `iterate` echo lands at its n-th delegation,
//     seeded as a chain on the pull-request commit; `refs/eval/base/<n>`, where the scenario moves
//     the base during that delegation, the `develop` commit it moves to;
//   * `refs/eval/head/<label>` for the seeded head, the first label the fixture's `originHeads`
//     declares. The echo labels the repair heads it lands and the receive hook below labels the
//     gate's own base merge, so the stub can tell which declared state a read is looking at (see
//     "Origin-head mode" in the shared stub);
//   * a `post-receive` hook, bound by the repository's own `core.hooksPath`, that hands every push to
//     the echo's trace helper: a forge moves `refs/pull/<N>/head` with the branch, and a push is a
//     branch write the evaluator has to see, which the call log cannot show.
//
// Every seeded commit is made with a fixed author, committer and date, under the switched-off host
// configuration the `iterate` suite's checkout uses, so the same tree always gives the same commit.
// The checkout is left clean on the head branch, tracking `origin/<head>`, with `origin` reached
// through a `url.<file URL>.insteadOf` rewrite of the forge URL and `remote.origin.pushurl` bound to
// the same file URL, as in `no-ci-checkout.mjs`: a host-global `pushInsteadOf` cannot send a
// regressing run's push to the real forge.

import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { devNull } from 'node:os';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  REPAIR_AFTER_BASE_MERGE_SCENARIO,
  REPEATED_INEFFECTIVE_REPAIR_SCENARIO,
} from './configured-reviewer-scenario.mjs';

export const REMOTE_DIRECTORY = 'remote.git';
const SEEDED_BRANCH = 'develop';
// The skill-relative path of the trace helper the receive hook runs, as the overlay copies it.
const TRACE_SKILL_PATH = 'scripts/iterate-trace.mjs';

export const REPAIRED_PATH = 'src/limits.mjs';
export const BASE_CHANGE_PATH = 'docs/changelog.md';

// The pull-request file, with the line every reviewer thread of both scenarios is anchored on (5).
function limitsSource(delayLine) {
  return [
    '// Retry limits for the sync client.',
    'export const MAX_RETRIES = 3;',
    '',
    'export function retryDelay(attempt) {',
    `  ${delayLine}`,
    '}',
    '',
    'export function shouldRetry(status, attempt) {',
    '  return status >= 500 && attempt < MAX_RETRIES;',
    '}',
    '',
  ].join('\n');
}

const PULL_REQUEST_COMMIT = {
  message: 'feat: retry failed sync requests',
  date: '2026-09-01T09:00:00Z',
  files: { [REPAIRED_PATH]: limitsSource('return attempt * 100;') },
};
// The first repair caps the delay and leaves attempt 0 at zero, which the reviewer re-reports on the
// changed line: an ineffective repair in both scenarios.
const CAPPING_REPAIR = {
  message: 'fix: cap the retry delay',
  date: '2026-09-01T10:30:00Z',
  files: { [REPAIRED_PATH]: limitsSource('return Math.min(attempt * 100, 5_000);') },
};
const EFFECTIVE_REPAIR = {
  message: 'fix: never retry without a delay',
  date: '2026-09-01T12:30:00Z',
  files: { [REPAIRED_PATH]: limitsSource('return Math.min(Math.max(attempt, 1) * 100, 5_000);') },
};
const INEFFECTIVE_REPAIR = {
  message: 'fix: bound the retry attempt',
  date: '2026-09-01T12:30:00Z',
  files: { [REPAIRED_PATH]: limitsSource('return Math.min(attempt, 50) * 100;') },
};
// What lands on `develop` while the first repair is in flight: a file the pull request never touches,
// so the gate's base merge applies cleanly and changes no anchored path.
const BASE_ADVANCE = {
  message: 'docs: start the changelog',
  date: '2026-09-01T10:00:00Z',
  files: { [BASE_CHANGE_PATH]: '# Changelog\n\n- Document the sync client.\n' },
};

// Per scenario, one entry per planned delegation: the repair it lands and, optionally, the base
// commit `develop` moves to during it.
export const REPAIR_PLANS = Object.freeze({
  [REPAIR_AFTER_BASE_MERGE_SCENARIO]: [
    { repair: CAPPING_REPAIR, base: BASE_ADVANCE },
    { repair: EFFECTIVE_REPAIR },
  ],
  [REPEATED_INEFFECTIVE_REPAIR_SCENARIO]: [
    { repair: CAPPING_REPAIR },
    { repair: INEFFECTIVE_REPAIR },
  ],
});

export const SEEDED_IDENTITY = Object.freeze({
  name: 'Effective Flow Eval',
  email: 'eval@example.invalid',
});

function sandboxGitEnv(date = null) {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'core.hooksPath',
    GIT_CONFIG_VALUE_0: devNull,
    GIT_CONFIG_KEY_1: 'commit.gpgsign',
    GIT_CONFIG_VALUE_1: 'false',
    ...(date
      ? {
          GIT_AUTHOR_NAME: SEEDED_IDENTITY.name,
          GIT_AUTHOR_EMAIL: SEEDED_IDENTITY.email,
          GIT_AUTHOR_DATE: date,
          GIT_COMMITTER_NAME: SEEDED_IDENTITY.name,
          GIT_COMMITTER_EMAIL: SEEDED_IDENTITY.email,
          GIT_COMMITTER_DATE: date,
        }
      : {}),
  };
}

function git(cwd, args, { env = sandboxGitEnv(), input } = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    input,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'inherit'],
    env,
  }).trim();
}

function forgeUrl(repository) {
  return `https://${repository.host}/${repository.owner}/${repository.repository}.git`;
}

// One commit on `parent` that writes `files` over the parent's tree, made through a scratch index so
// the checkout's working tree and index stay untouched.
function seedCommit(projectRoot, parent, { message, date, files }) {
  const index = resolve(dirname(projectRoot), 'seed.index');
  const env = { ...sandboxGitEnv(date), GIT_INDEX_FILE: index };
  git(projectRoot, ['read-tree', parent], { env });
  for (const [path, content] of Object.entries(files)) {
    const blob = git(projectRoot, ['hash-object', '-w', '--stdin'], { env, input: content });
    git(projectRoot, ['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`], { env });
  }
  const tree = git(projectRoot, ['write-tree'], { env });
  const commit = git(projectRoot, ['commit-tree', tree, '-p', parent, '-m', message], { env });
  rmSync(index, { force: true });
  return commit;
}

export function isRepairScenario(scenario) {
  return Object.hasOwn(REPAIR_PLANS, scenario);
}

export function prepareRepairOrigin({ scenario, fixture, projectRoot }) {
  if (!isRepairScenario(scenario)) return null;
  const declaration = fixture?.originHeads;
  const base = fixture?.operations?.['pr-read']?.envelope?.data?.result?.base;
  const head = fixture?.operations?.['pr-read']?.envelope?.data?.result?.head;
  if (base !== SEEDED_BRANCH) {
    throw new Error(`${scenario}: the fixture's base ${base} is not the seeded ${SEEDED_BRANCH}`);
  }
  if (!declaration || declaration.branch !== head) {
    throw new Error(`${scenario}: the fixture's originHeads branch is not its pull-request head`);
  }
  const seedLabel = declaration.heads?.[0]?.label;
  const plan = REPAIR_PLANS[scenario];
  if (declaration.heads.filter((entry) => entry.source === 'dispatch').length !== plan.length) {
    throw new Error(
      `${scenario}: the fixture declares another number of repair heads than planned`,
    );
  }
  const attemptRoot = dirname(projectRoot);
  const skillRoot = resolve(attemptRoot, 'skill');
  const remote = resolve(attemptRoot, REMOTE_DIRECTORY);
  const tracePath = resolve(skillRoot, TRACE_SKILL_PATH);
  if (/['\n]/.test(tracePath)) throw new Error(`${scenario}: unquotable sandbox path ${tracePath}`);

  const seed = git(projectRoot, ['rev-parse', `refs/heads/${SEEDED_BRANCH}^{commit}`]);
  const pullRequestHead = seedCommit(projectRoot, seed, PULL_REQUEST_COMMIT);
  const refs = [
    `${seed}:refs/heads/${SEEDED_BRANCH}`,
    `${pullRequestHead}:refs/heads/${head}`,
    `${pullRequestHead}:refs/pull/${fixture.pullRequest}/head`,
    `${pullRequestHead}:refs/eval/head/${seedLabel}`,
  ];
  let parent = pullRequestHead;
  let baseTip = seed;
  plan.forEach((step, index) => {
    parent = seedCommit(projectRoot, parent, step.repair);
    refs.push(`${parent}:refs/eval/dispatch/${index + 1}`);
    if (step.base) {
      baseTip = seedCommit(projectRoot, baseTip, step.base);
      refs.push(`${baseTip}:refs/eval/base/${index + 1}`);
    }
  });

  git(attemptRoot, [
    '-c',
    `init.defaultBranch=${SEEDED_BRANCH}`,
    'init',
    '--bare',
    '--quiet',
    remote,
  ]);
  git(projectRoot, ['push', '--quiet', remote, ...refs]);

  // The hook is installed after the seeding push, so provisioning itself is no recorded branch write.
  const hooks = resolve(remote, 'hooks');
  mkdirSync(hooks, { recursive: true });
  const hook = resolve(hooks, 'post-receive');
  writeFileSync(hook, `#!/bin/sh\nexec node '${tracePath}' --receive\n`);
  chmodSync(hook, 0o755);
  git(remote, ['config', 'core.hooksPath', hooks]);

  const remoteUrl = pathToFileURL(remote).href;
  git(projectRoot, ['config', `url.${remoteUrl}.insteadOf`, forgeUrl(fixture.repository)]);
  git(projectRoot, ['config', 'remote.origin.pushurl', remoteUrl]);
  git(projectRoot, ['fetch', '--quiet', 'origin']);
  git(projectRoot, [
    'branch',
    '--quiet',
    `--set-upstream-to=origin/${SEEDED_BRANCH}`,
    SEEDED_BRANCH,
  ]);
  git(projectRoot, ['checkout', '--quiet', '--track', '-b', head, `origin/${head}`]);
  return { remote, seed, pullRequestHead };
}
