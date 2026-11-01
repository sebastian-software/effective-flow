import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
export function projectDocuments({ scenario }) {
  return {
    agents:
      '# AGENTS.md\n\n**Effective Flow project setup:** docs/adr/effective-flow-project-setup.md\n\nUse only the explicitly supplied fixture skill; no installed skills or external services.\n',
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
| worktree.enabled | false |
| delivery.baseBranch | origin/develop |
| delivery.prReview | ask |
`,
  };
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
