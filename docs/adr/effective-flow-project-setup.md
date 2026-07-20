# Effective Flow project setup

## Status

Active

## Context

This ADR holds the tracked Effective Flow configuration for this project. `.effective-flow/` is
a pure runtime directory and completely gitignored.

## Configuration

| Key                               | Value                          |
| --------------------------------- | ------------------------------ |
| review.profile                    | focused                        |
| review.autoConfirmScope           | false                          |
| review.designDecisionSources      | standard                       |
| review.validation                 | full                           |
| applyReview.defaultCommitStrategy | null                           |
| applyReview.finalValidation       | full                           |
| applyReview.stashPolicy           | interactive                    |
| applyReview.worktree.baseDir      | .effective-flow/.worktrees     |
| applyReview.worktree.setup        | auto                           |
| plan.markerLanguage               | de                             |
| plan.dir                          | docs/plan                      |
| delivery.baseBranch               | origin/develop                 |
| delivery.branchPrefix             | effective-flow                 |
| delivery.completion               | pr                             |
| delivery.returnBranch             | auto                           |
| worktree.enabled                  | true                           |
| worktree.setup                    | auto                           |
| worktree.baseDir                  | .effective-flow/.worktrees     |
| tracker.mode                      | remote                         |
| tracker.remoteToolOverride        | auto                           |
