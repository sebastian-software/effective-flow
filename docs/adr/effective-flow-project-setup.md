# Effective Flow project setup

## Status

Active

## Context

This ADR holds the tracked Effective Flow configuration for this project. `.effective-flow/` is
a pure runtime directory and completely gitignored.

## Configuration

| Key                                      | Value                      |
| ---------------------------------------- | -------------------------- |
| review.profile                           | focused                    |
| review.autoConfirmScope                  | false                      |
| review.designDecisionSources             | standard                   |
| review.validation                        | full                       |
| applyReview.defaultCommitStrategy        | null                       |
| applyReview.finalValidation              | full                       |
| applyReview.stashPolicy                  | interactive                |
| applyReview.worktree.baseDir             | .effective-flow/.worktrees |
| applyReview.worktree.setup               | auto                       |
| plan.dir                                 | docs/plan                  |
| language.project                         | en                         |
| language.source                          | en                         |
| language.documentation.user              | en                         |
| language.documentation.technical         | en                         |
| language.workflow                        | en                         |
| language.forge                           | en                         |
| language.git                             | en                         |
| delivery.baseBranch                      | origin/develop             |
| delivery.branchPrefix                    | effective-flow             |
| delivery.completion                      | pr                         |
| delivery.returnBranch                    | auto                       |
| worktree.enabled                         | true                       |
| worktree.setup                           | auto                       |
| worktree.baseDir                         | .effective-flow/.worktrees |
| tracker.mode                             | remote                     |
| tracker.remoteToolOverride               | auto                       |
| prReview.bots                            | greptile-apps[bot]         |
| prReview.bots.greptile-apps[bot].trigger | @greptileai                |
