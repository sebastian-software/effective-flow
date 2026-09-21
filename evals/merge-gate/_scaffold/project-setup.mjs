// The sandbox checkout's own two documents, as the `merge-gate` suite writes them: the `AGENTS.md`
// that carries the project-setup marker line and the living project-setup ADR whose key/value table
// is the configuration a gate run reads.
//
// They live here rather than in the shared scaffold because every row is a statement about what a
// `merge-gate` run sees — the completion mode, the check requirement, the conflict policy and the
// round cap decide what the gate does — and a second suite configures a different tool. That is also
// why this file is one of the suite's instrument files: a changed row changes what the run did, and
// the archived evidence has to go stale with it.

export function projectDocuments({ scenario, rows }) {
  const agents = `# AGENTS.md

**Effective Flow project setup:** docs/adr/effective-flow-project-setup.md

This checkout exists only as the target of a \`merge-gate\` behavioural eval run.
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
| language.documentation.technical | en            |
| language.workflow                | en             |
| language.forge                   | en             |
| language.git                     | en             |
| plan.dir                         | docs/plan      |
| tracker.mode                     | remote         |
| worktree.enabled                 | false          |
| delivery.baseBranch              | origin/develop |
| delivery.mergeMethod             | squash         |
| mergeGate.completion             | merge          |
| mergeGate.requireAllChecks       | true           |
| mergeGate.conflictResolution     | off            |
| mergeGate.maxRounds              | 2              |
${rows.map(([key, value]) => `| ${key.padEnd(32)} | ${value.padEnd(14)} |\n`).join('')}`;
  return { agents, setupAdr };
}
