import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { digest, treeState } from './state.mjs';
const REPORT_SOURCE = resolve(import.meta.dirname, '../../iterate/_scaffold/report-channel.mjs');
export const REPORT_PATH = 'scripts/report-channel.mjs';
export function applyOverlay(scenario, skillRoot) {
  const target = resolve(skillRoot, REPORT_PATH);
  if (existsSync(target))
    throw new Error(`${scenario}: report channel must never replace production`);
  copyFileSync(REPORT_SOURCE, target);
}
export function projectDocuments({ scenario }) {
  return {
    agents:
      '# AGENTS.md\n\n**Effective Flow project setup:** docs/adr/effective-flow-project-setup.md\n\nThis hermetic checkout is a completed-run reporting fixture.\n',
    setupAdr: `# Effective Flow project setup

## Status

Active

## Configuration

| Key | Value |
| --- | --- |
| language.chat | de |
| language.project | en |
| language.source | en |
| language.workflow | en |
| plan.dir | docs/plan |
| tracker.mode | ${scenario === 'external-issue-identity-retained' ? 'external' : 'remote'} |
${scenario === 'external-issue-identity-retained' ? '| tracker.externalTool | linear |\n' : ''}
| worktree.enabled | false |
| delivery.baseBranch | origin/develop |
`,
  };
}
export function prepareCheckout({ fixture, projectRoot }) {
  for (const [relative, text] of Object.entries(fixture.artifacts)) {
    const path = resolve(projectRoot, relative);
    if (!path.startsWith(`${resolve(projectRoot)}/`) || relative.split('/').includes('..')) {
      throw new Error(`fixture artifact escapes the project: ${relative}`);
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
  // Expectations stay in the fixture/evaluator; the agent sees only observed run facts.
  writeFileSync(
    resolve(projectRoot, 'completed-run.json'),
    `${JSON.stringify(fixture.snapshot, null, 2)}\n`,
  );
  const trace = resolve(projectRoot, '..', 'trace');
  mkdirSync(trace, { recursive: true });
  const before = `${JSON.stringify(treeState(projectRoot), null, 2)}\n`;
  writeFileSync(resolve(trace, 'state-before.json'), before);
  const config = resolve(projectRoot, 'docs/adr/effective-flow-project-setup.md');
  writeFileSync(
    config,
    `${readFileSync(config, 'utf8')}\n<!-- recommendation-baseline:${digest(before)} -->\n`,
  );
}
