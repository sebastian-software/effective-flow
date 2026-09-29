// The history an `iterate` run finds in its sandbox checkout, and the `origin` it can fetch from.
//
// **Why this suite needs it and `merge-gate` does not.** `iterate` Phase 1 fetches the pull
// request's head branch before Phase 1.5 observes any reviewer and before Phase 2 selects anything.
// The shared scaffold seeds one commit on `develop` and an `origin` pointing at the fixture's forge
// URL, which no sandbox can reach. A forge-reading scenario would then stop at a failed fetch — a
// fact about the bench, not about the tool — before it ever reached the rule it exists to observe.
// So this module gives the checkout a real, local history for the pull request the stub reports:
//
//   * the shared seed commit on `develop`, re-dated to a fixed instant so its SHA depends on the
//     tree alone;
//   * one commit on the head branch, with fixed content and a fixed date — the head the stub's
//     `pr-read` and `pr-status-read` report, SHA for SHA;
//   * a bare repository beside the checkout holding both branches, reached through a
//     `url.<file URL>.insteadOf` rewrite of the forge URL `origin` keeps, so `git fetch origin`
//     works offline and `remote.origin.url` still names the forge the fixture describes;
//   * `remote.origin.pushurl` set to that same file URL. The fetch rewrite alone does not bind a
//     push: a host-global `url.<base>.pushInsteadOf` outranks `insteadOf` for pushes, so on such a
//     host a regressing run's `git push` would resolve to the real forge and carry the operator's
//     credentials there. An explicit push URL is exempt from `pushInsteadOf`, so every push stays in
//     the sandbox whatever the host configures;
//   * the checkout left clean on the head branch, tracking `origin/<head>` — the state `iterate`
//     Phase 1 works in place from, with no worktree to provision.
//
// **The fixture states the SHAs, and provisioning checks them.** Each fixture's `checkout` block
// carries the base and head SHAs this procedure produces for that scenario. They depend on every
// byte of the seeded tree — the project documents, whose ADR names the scenario, and the README the
// scaffold derives from the fixture's repository — so an edit to any of those moves them. A
// mismatch throws here, at provisioning, instead of handing a run a checkout whose head disagrees
// with the forge the stub reports.
//
// Every git command runs with the operator's global and system configuration switched off, hooks
// pointed at nothing and the commit template emptied, so a template, a signing default or a hook on
// the recording host cannot move a SHA. That includes `prepare-commit-msg`, which `--no-verify`
// does not skip. The checkout's own local configuration — the identity the scaffold set — is what
// the commits carry. The shared seed commit is made before this module runs and under the host's
// configuration, so it is re-made here with an explicit message rather than amended with
// `--no-edit`: whatever a host hook wrote into the original message does not survive into the SHA.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { devNull } from 'node:os';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const SEED_DATE = '2026-09-01T08:00:00Z';
export const HEAD_DATE = '2026-09-01T09:00:00Z';
export const HEAD_CHANGE_PATH = 'docs/iterate-eval-change.md';
export const HEAD_CHANGE_TEXT = '# Iterate eval change\n\nThe change under review.\n';
export const HEAD_COMMIT_MESSAGE = 'feat: add the iterate eval change';
// The seed commit's message after it is re-made here. It restates the shared scaffold's message, so
// a host without hooks produces the SHAs it always did; on any host it is what the commit carries,
// because the amend states it rather than inheriting whatever the original commit holds.
export const SEED_COMMIT_MESSAGE = 'chore: seed the eval sandbox checkout';
// The bare repository beside the checkout, inside the attempt root.
export const REMOTE_DIRECTORY = 'remote.git';
// The branch the shared scaffold seeds. A fixture naming another base cannot be served from it.
const SEEDED_BRANCH = 'develop';

function git(cwd, args, date = null) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: devNull,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
      // Without a global configuration git still falls back to the per-user ignore and attributes
      // files under `$XDG_CONFIG_HOME/git/`; point both at nothing so the host's files neither
      // shape the tree nor, where they are unreadable, fail the command.
      GIT_CONFIG_COUNT: '4',
      GIT_CONFIG_KEY_0: 'core.excludesFile',
      GIT_CONFIG_VALUE_0: devNull,
      GIT_CONFIG_KEY_1: 'core.attributesFile',
      GIT_CONFIG_VALUE_1: devNull,
      // Hooks live in the repository (`git init` copies a host's template hooks into it), so
      // switching off the global configuration does not reach them; pointing the hooks path at
      // nothing does. An empty template closes the remaining path a host could shape a message by.
      GIT_CONFIG_KEY_2: 'core.hooksPath',
      GIT_CONFIG_VALUE_2: devNull,
      GIT_CONFIG_KEY_3: 'commit.template',
      GIT_CONFIG_VALUE_3: '',
      ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
    },
  }).trim();
}

export function forgeUrl(repository) {
  return `https://${repository.host}/${repository.owner}/${repository.repository}.git`;
}

// Re-date the seed commit and add the head commit, returning both SHAs. Separate from the check so a
// fixture's `checkout` block can be generated by the very procedure that later verifies it.
export function seedPullRequestHistory(projectRoot, { baseRef, headRef }) {
  if (baseRef !== SEEDED_BRANCH) {
    throw new Error(`the fixture's base ${baseRef} is not the seeded ${SEEDED_BRANCH}`);
  }
  if (git(projectRoot, ['branch', '--show-current']) !== SEEDED_BRANCH) {
    throw new Error(`the seeded checkout is not on ${SEEDED_BRANCH}`);
  }
  git(
    projectRoot,
    [
      'commit',
      '--amend',
      '--no-verify',
      '--quiet',
      '--message',
      SEED_COMMIT_MESSAGE,
      `--date=${SEED_DATE}`,
    ],
    SEED_DATE,
  );
  const baseSha = git(projectRoot, ['rev-parse', 'HEAD']);
  git(projectRoot, ['checkout', '--quiet', '-b', headRef]);
  const changePath = resolve(projectRoot, HEAD_CHANGE_PATH);
  mkdirSync(dirname(changePath), { recursive: true });
  writeFileSync(changePath, HEAD_CHANGE_TEXT);
  git(projectRoot, ['add', '--', HEAD_CHANGE_PATH]);
  git(
    projectRoot,
    ['commit', '--no-verify', '--quiet', '--message', HEAD_COMMIT_MESSAGE, `--date=${HEAD_DATE}`],
    HEAD_DATE,
  );
  return { baseSha, headSha: git(projectRoot, ['rev-parse', 'HEAD']) };
}

export function prepareCheckout({ scenario, fixture, projectRoot }) {
  const checkout = fixture?.checkout;
  if (!checkout || typeof checkout !== 'object') {
    throw new Error(`${scenario}: the fixture states no checkout block`);
  }
  const { baseRef, headRef } = checkout;
  const actual = seedPullRequestHistory(projectRoot, { baseRef, headRef });
  for (const side of ['baseSha', 'headSha']) {
    if (actual[side] !== checkout[side]) {
      throw new Error(
        `${scenario}: the seeded ${side === 'baseSha' ? baseRef : headRef} commit is ${actual[side]}, the fixture states ${checkout[side]}; regenerate the fixture's checkout block after changing the seeded tree`,
      );
    }
  }

  const remote = resolve(projectRoot, '..', REMOTE_DIRECTORY);
  git(dirname(remote), [
    '-c',
    `init.defaultBranch=${SEEDED_BRANCH}`,
    'init',
    '--bare',
    '--quiet',
    remote,
  ]);
  git(projectRoot, [
    'push',
    '--quiet',
    remote,
    `${baseRef}:refs/heads/${baseRef}`,
    `${headRef}:refs/heads/${headRef}`,
  ]);
  const remoteUrl = pathToFileURL(remote).href;
  git(projectRoot, ['config', `url.${remoteUrl}.insteadOf`, forgeUrl(fixture.repository)]);
  git(projectRoot, ['config', 'remote.origin.pushurl', remoteUrl]);
  git(projectRoot, ['fetch', '--quiet', 'origin']);
  git(projectRoot, ['branch', '--quiet', `--set-upstream-to=origin/${baseRef}`, baseRef]);
  git(projectRoot, ['branch', '--quiet', `--set-upstream-to=origin/${headRef}`, headRef]);
  return { remote, ...actual };
}
