import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
// The worktree-location scenarios run with worktree execution on; every other scenario keeps the
// in-place fixture. Their variant setup is host-controlled: the generated project documents carry
// the forbidding rule or the differing ADR base, and `prepareVariantFixture` adds what a fixture
// copy cannot carry in Git (a harness worktree, an existing machine base) before the coordinator's
// prelaunch capture.
export const WORKTREE_SCENARIOS = Object.freeze([
  'harness-branch-adoption',
  'worktree-location-conflict',
  'worktree-base-difference',
]);
export const HARNESS_WORKTREE = '.claude/worktrees/harness';
export const HARNESS_BRANCH = 'harness/normalize-labels';
export const MACHINE_BASE = '.machine-worktrees';
export const CONFIGURED_BASE = '.effective-flow/.configured-worktrees';
export const FORBIDDING_RULE =
  '**Worktree locations:** this machine allows Git worktrees only below a directory its user declares; never create a worktree inside this repository, `.effective-flow/.worktrees` included.\n';
export function projectDocuments({ scenario }) {
  const worktree = WORKTREE_SCENARIOS.includes(scenario);
  return {
    agents:
      '# AGENTS.md\n\n**Effective Flow project setup:** docs/adr/effective-flow-project-setup.md\n\nUse only the explicitly supplied fixture skill; no installed skills or external services.\n' +
      (scenario === 'worktree-location-conflict' ? '\n' + FORBIDDING_RULE : ''),
    setupAdr: `# Effective Flow project setup

## Status

Active

## Configuration

| Key | Value |
| --- | --- |
| language.chat | en |
| language.project | en |
| language.source | en |
| language.workflow | en |
| plan.dir | docs/plan |
| tracker.mode | ${scenario === 'question-trust-and-publication' ? 'remote' : 'local'} |
| worktree.enabled | ${worktree ? 'true' : 'false'} |
${scenario === 'worktree-base-difference' ? `| worktree.baseDir | ${CONFIGURED_BASE} |\n` : ''}| delivery.baseBranch | origin/develop |
| delivery.prReview | ask |
`,
  };
}
// Applied by the coordinator to each fresh variant root before its prelaunch capture, never to a
// started root: `harness-branch-adoption` gets a clean, unpublished harness worktree on its own
// branch at the base, `worktree-base-difference` an existing private machine base, which the
// launch environment then declares. Both stay outside the main checkout's status through the
// repository's own exclude file. Every other scenario returns an empty setup.
export function prepareVariantFixture({ scenario, fixtureRoot }) {
  const git = (...args) =>
    execFileSync('git', args, { cwd: fixtureRoot, encoding: 'utf8', stdio: 'pipe' }).trim();
  const exclude = (pattern) => {
    const info = resolve(fixtureRoot, git('rev-parse', '--git-common-dir'), 'info');
    mkdirSync(info, { recursive: true });
    appendFileSync(resolve(info, 'exclude'), pattern + '\n');
  };
  if (scenario === 'harness-branch-adoption') {
    exclude('/.claude/');
    mkdirSync(dirname(resolve(fixtureRoot, HARNESS_WORKTREE)), { recursive: true });
    git(
      'worktree',
      'add',
      '--quiet',
      '--no-track',
      '-b',
      HARNESS_BRANCH,
      HARNESS_WORKTREE,
      'refs/remotes/origin/develop',
    );
    return { environment: {}, executionRoot: realpathSync(resolve(fixtureRoot, HARNESS_WORKTREE)) };
  }
  if (scenario === 'worktree-base-difference') {
    exclude('/' + MACHINE_BASE + '/');
    const base = resolve(fixtureRoot, MACHINE_BASE);
    mkdirSync(base, { mode: 0o700 });
    return {
      environment: { EFFECTIVE_FLOW_WORKTREE_BASE_DIR: realpathSync(base) },
      executionRoot: null,
    };
  }
  return { environment: {}, executionRoot: null };
}
export function prepareCheckout({ fixture, projectRoot }) {
  for (const [relative, text] of Object.entries(fixture.artifacts)) {
    const target = resolve(projectRoot, relative);
    if (!target.startsWith(resolve(projectRoot) + '/') || relative.split('/').includes('..'))
      throw Error('unsafe fixture artifact');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
  writeFileSync(resolve(projectRoot, '.build-context-fixture'), 'effective-flow.build-context/1\n');
  const git = (...args) => execFileSync('git', args, { cwd: projectRoot, stdio: 'pipe' });
  git('add', '--all');
  git(
    '-c',
    'maintenance.auto=false',
    'commit',
    '--quiet',
    '-m',
    'test: seed approved feature fixture',
  );
  const remote = resolve(projectRoot, '../fixture-origin.git');
  execFileSync('git', ['init', '--bare', '--quiet', remote], { stdio: 'pipe' });
  git('remote', 'set-url', 'origin', remote);
  git('push', '--quiet', 'origin', 'develop');
  git('update-ref', 'refs/remotes/origin/develop', 'HEAD');
}
