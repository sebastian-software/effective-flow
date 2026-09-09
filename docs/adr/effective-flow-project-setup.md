# Effective Flow project setup

## Status

Active

## Context

This ADR holds the tracked Effective Flow configuration for this project. `.effective-flow/` is
a pure runtime directory and completely gitignored.

## Configuration

| Key                               | Value                      |
| --------------------------------- | -------------------------- |
| review.profile                    | focused                    |
| review.autoConfirmScope           | false                      |
| review.designDecisionSources      | standard                   |
| review.validation                 | full                       |
| applyReview.defaultCommitStrategy | null                       |
| applyReview.finalValidation       | full                       |
| applyReview.stashPolicy           | interactive                |
| applyReview.worktree.baseDir      | .effective-flow/.worktrees |
| applyReview.worktree.setup        | auto                       |
| plan.dir                          | docs/plan                  |
| language.project                  | en                         |
| language.source                   | en                         |
| language.documentation.user       | en                         |
| language.documentation.technical  | en                         |
| language.workflow                 | en                         |
| language.forge                    | en                         |
| language.git                      | en                         |
| delivery.baseBranch               | origin/develop             |
| delivery.branchPrefix             | effective-flow             |
| delivery.completion               | pr                         |
| delivery.returnBranch             | auto                       |
| worktree.enabled                  | true                       |
| worktree.setup                    | auto                       |
| worktree.baseDir                  | .effective-flow/.worktrees |
| tracker.mode                      | remote                     |
| tracker.remoteToolOverride        | auto                       |
| mergeGate.completion              | merge                      |
| mergeGate.bots                    | recensor                   |
| mergeGate.bots.recensor.trigger   | /recensor review           |
| mergeGate.bots.recensor.check     | recensor/review            |

## Branch model

`develop` is the integration branch. All source work happens there, and the `delivery.baseBranch`
row above names it as the base every delivery branch starts from.

`main` is the published delivery artifact, written mechanically by the release workflow. It carries
the portable skill payload and the consumer-facing documentation, and no source tree, build script
or developer guide. Nothing is implemented on it.

`origin/HEAD` and the forge's default branch both point at `main`, so any mechanism that branches
off the repository default — a harness-managed worktree, `gh pr create` without an explicit
`--base` — starts from a tree with no source in it. The divergence between `delivery.baseBranch`
and the repository default is deliberate and permanent.
