# Plan-only unattended publication

**Status:** Active

## Context

Issue Buddy needs a bounded unattended path from trusted GitHub issues to implementation plans.
The path must remain reviewable and recoverable while the first release lacks a credential-isolated
bot identity and verified branch rules. It must also preserve the existing interactive plan
publication contract and report readers.

## Decision

Stage 1 publishes only draft, plan-only pull requests. The pass runs in the primary checkout and
does not create a worktree, switch branches, stage files, merge, close issues, or write issue
comments or labels. It keeps the existing runtime-state guard, loopback TCP mutation mutex, and
whole-pass lock. A held lock is an operator stop and is never broken automatically; an operator
removes prior leftovers, including leftovers after a push, before retrying.

The default mode is a local dry run. `--publish` is allowed only when the repository visibility
read reports `public`; private repositories are dry-run-only, and unknown visibility stops
publication. A public operator-run pass may reach the operator's forge credential through the
unsandboxed model steps, so the single-file assertion and content scan are advisory in stage 1.
Credential isolation and verified bot branch rules are deferred to WP6b and WP7 before scheduled
publishing.

Publication text is fixed and contains only the issue number, review result, and open-point count.
The plan helper owns content scanning, single-file inspection, expected base/tip/blob checks,
create-only branch publication, and draft pull-request confirmation. A changed base, branch tip,
or plan blob stops the pass without spending an issue retry. Preserved plan files are reported with
the operator action; the pass never deletes an ambiguous or earlier file.

Reports keep version 1 as the default schema. Version 2 is explicit and adds repository visibility
and normalized leftover metadata. New readers accept both versions; v1 behavior remains unchanged.
Collection filters leftover metadata before judgment limits, slicing, and recovery authorization.

## Consequences

Issue Buddy is suitable for bounded, operator-run planning on public repositories. A dry run can
be used for private repositories or before publication authority is available. The resulting draft
pull request contains only the plan; implementation continues later from the pull-request branch.
Scheduled unattended publication remains out of scope until credential isolation and bot branch
rules are verified.

## Scope boundary

This decision adds no new runtime family. `issue-buddy` owns the workflow edge, while the existing
remote-tracker, plan-lint, and plan-publication helpers own their respective interfaces. The
build's continuation path restores the plan from its pull-request branch before starting the next
implementation workflow.
