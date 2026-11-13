// The `origin` a declared-no-CI-policy scenario's gate run can fetch from.
//
// **Why these six scenarios need it and the others do not.** A policy read does not trust the
// working checkout's setup ADR on its own: the pull request's head may have added the policy rows
// itself, so `config-resolve.mjs no-ci-policy` compares the `mergeGate.noCiPolicy.*` rows with the
// copy of the same document at `refs/remotes/origin/<baseRef>`, and the gate fetches that base ref
// first. The shared scaffold seeds an `origin` that names the fixture's forge, which no sandbox can
// reach, so the fetch would fail and the resolver would state `base-blob-missing` — a fact about the
// bench that would turn every one of these scenarios into a refusal for the wrong reason, the
// positive one included.
//
// So the checkout gets a bare repository beside it holding the seeded `develop` — the same commit,
// hence the same setup ADR, the checkout is on — reached through a `url.<file URL>.insteadOf`
// rewrite of the forge URL `origin` keeps, and `refs/remotes/origin/develop` is fetched once here.
// `remote.origin.pushurl` is set to the same file URL: the rewrite alone does not bind a push, and a
// host-global `url.<base>.pushInsteadOf` would otherwise let a regressing run's push reach the real
// forge.
//
// The base is the seeded commit and nothing is committed on top of it, so the base blob and the
// working checkout cannot differ: the scenarios observe the gate's behaviour under an active policy,
// and the resolver's `base-blob-mismatch` path is proven by its own unit tests, not here. Every
// other scenario of the suite keeps the unreachable `origin` it always had.

import { execFileSync } from 'node:child_process';
import { devNull } from 'node:os';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { NO_CI_POLICY_SCENARIOS } from './configured-reviewer-scenario.mjs';

// The bare repository beside the checkout, inside the attempt root.
export const REMOTE_DIRECTORY = 'remote.git';
const SEEDED_BRANCH = 'develop';

// The host's own git configuration, hooks and templates stay out of the sandbox repository.
function sandboxGitEnv() {
  return {
    ...process.env,
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
  };
}

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: sandboxGitEnv(),
  }).trim();
}

function forgeUrl(repository) {
  return `https://${repository.host}/${repository.owner}/${repository.repository}.git`;
}

export function prepareCheckout({ scenario, fixture, projectRoot }) {
  if (!NO_CI_POLICY_SCENARIOS.includes(scenario)) return null;
  const base = fixture.operations?.['pr-read']?.envelope?.data?.result?.base;
  if (base !== SEEDED_BRANCH) {
    throw new Error(`${scenario}: the fixture's base ${base} is not the seeded ${SEEDED_BRANCH}`);
  }
  const remote = resolve(dirname(projectRoot), REMOTE_DIRECTORY);
  git(dirname(remote), [
    '-c',
    `init.defaultBranch=${SEEDED_BRANCH}`,
    'init',
    '--bare',
    '--quiet',
    remote,
  ]);
  git(projectRoot, ['push', '--quiet', remote, `${SEEDED_BRANCH}:refs/heads/${SEEDED_BRANCH}`]);
  const remoteUrl = pathToFileURL(remote).href;
  git(projectRoot, ['config', `url.${remoteUrl}.insteadOf`, forgeUrl(fixture.repository)]);
  git(projectRoot, ['config', 'remote.origin.pushurl', remoteUrl]);
  git(projectRoot, [
    'fetch',
    '--quiet',
    'origin',
    `+refs/heads/${SEEDED_BRANCH}:refs/remotes/origin/${SEEDED_BRANCH}`,
  ]);
  return { remote };
}
