// The sandbox checkout's own two documents, as the `iterate` suite writes them: the `AGENTS.md` that
// carries the project-setup marker line and the living project-setup ADR whose key/value table is
// the configuration an `iterate` run reads.
//
// Every row is a statement about what an `iterate` run sees, which is why this file is one of the
// suite's instrument files. The rows are the ones `iterate` consults on the paths the scenarios
// take: the six languages (the delegated `Language context:` line supersedes them, but a run that
// lost the line would fall back here), the tracker mode and the base branch for Phase 1, and — for
// the one scenario that configures a reviewer — the `mergeGate.bots` rows Phase 1.5 observes.
// `worktree.enabled` is `false` because the prepared checkout already stands clean on the pull
// request's head branch, which is the case `iterate` works in place for.
//
// The document text is also part of the seeded commit's tree, so the head SHA every fixture states
// depends on it. Editing a row here therefore fails provisioning until the fixtures' `checkout`
// blocks are regenerated — loudly, in `checkout.mjs`, rather than as a checkout whose history no
// longer matches the forge the stub reports.

export function projectDocuments({ scenario, rows }) {
  const agents = `# AGENTS.md

**Effective Flow project setup:** docs/adr/effective-flow-project-setup.md

This checkout exists only as the target of an \`iterate\` behavioural eval run.
`;
  const setupAdr = `# Effective Flow project setup

## Status

Active

## Context

Scenario configuration for the \`${scenario}\` behavioural eval scenario.

## Configuration

| Key                              | Value          |
| -------------------------------- | -------------- |
| language.project                 | en             |
| language.source                  | en             |
| language.documentation.technical | en             |
| language.workflow                | en             |
| language.forge                   | en             |
| language.git                     | en             |
| plan.dir                         | docs/plan      |
| tracker.mode                     | remote         |
| worktree.enabled                 | false          |
| delivery.baseBranch              | origin/develop |
${rows.map(([key, value]) => `| ${key.padEnd(32)} | ${value.padEnd(14)} |\n`).join('')}`;
  return { agents, setupAdr };
}
