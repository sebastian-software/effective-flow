# Merge gate no-CI policy

## Status

Active

## Context

Issue #392 added the no-check-list waiver to the merge gate: when a head reports no check list at
all, a gated run asks once whether that is expected, and a non-interactive run cannot ask and
therefore does not merge. That decision introduced no configuration key and pinned the invariant
that a repository without CI stays unmergeable from a non-interactive run. A repository that
intentionally runs no CI then has no way to be merged by an unattended gate, however deliberate
the operator's choice.

[Unattended run state](unattended-run-state.md) makes silence in a non-interactive run an open
point or a fail-closed abort, never a guess. That rule is about missing authority. It does not say
that an explicit, recorded operator decision must also be ignored.

## Decision

Two configuration keys declare the policy: `mergeGate.noCiPolicy.bases`, a comma list of exact,
case-sensitive base branch names (unset by default), and `mergeGate.noCiPolicy.unattended`
(`true` or `false`, default `false`). This amends #392's "no new configuration key" decision.

The pinned invariant is amended, not dropped: a repository without CI stays unmergeable from a
non-interactive run unless `mergeGate.noCiPolicy.unattended` is literally `true` and the policy is
active. A key whose decoded value is anything else, including a malformed one, is off and reported
once. A literal `true` confirmed on the base branch is explicit authority from the operator, so it
is granted rather than treated as the silence that
[Unattended run state](unattended-run-state.md) rejects.

**Authority limits.**

- The policy reaches only the reported-at-all clause of merge condition 2 and the pending-checks
  question that precedes it. It never reaches the check criterion, a pending or failing check, any
  other merge condition or branch protection.
- The forge still enforces required checks: a base that requires them refuses the merge
  server-side, and the gate reports that failed merge.
- It pre-answers and records no waiver. The wisdom file holds only a
  `no-ci-policy used: <base> @ <head>` line for the Phase 6 report, and no later evaluation reads
  it.
- It is re-evaluated on each fresh Phase 4 read: the read's `baseRef` must match a listed base, it
  must report no check at all, and its head must equal the verified head. A retargeted pull
  request, a revoked policy or a check that appeared ends the policy at the next read.
- Forgejo gets one `pr-status-read` instead of the bounded poll, and only where that read states
  no check list and zero checks.

**Base-blob guard.** `config-resolve.mjs no-ci-policy` compares the `mergeGate.noCiPolicy.*` rows
at `origin/<baseRef>` with the working checkout and reports the policy active only where both sets
are identical, so a pull request cannot grant the policy to itself by editing the rows. Adding,
removing or changing any such row on the head is a mismatch, and a missing or unreadable base blob
leaves the policy inactive. The base commit must locate the same setup source as the working
checkout (marker first, then the scan; a step-3 source requires the base to locate none), or the
result is `mismatch`. A missing exact ref `refs/remotes/origin/<baseRef>` or a missing file is
`missing`. Any other Git failure is a `GIT_FAILED` error envelope (exit 1), not a
`data.noCiPolicy` outcome, and merge-gate treats it as an inactive policy. `HEAD` is rejected as
`baseRef`.

Known limitations:

- In hidden mode the setup file is untracked, so the operation compares the local file with
  itself: it grants the policy but offers no pull-request-head guard.
- In a blobless partial clone the resolver never fetches lazily (`GIT_NO_LAZY_FETCH=1`), so a base
  blob that was not fetched makes the policy read fail closed.
- A setup source or marker reached through a symlink is not followed on the base side, and the
  policy read fails closed.

## Consequences

- A pull request that introduces CI after the fresh Phase 4 read, or a check that attaches after
  it, is indistinguishable from no CI. The operator accepts this residual risk by declaring the
  policy, and Phase 6 names it whenever the policy was used.
- Removing `bases` revokes the policy; no state outlives the configuration.
- Unattended merging also needs `mergeGate.completion: merge`, and a GitHub repository without CI
  also needs `mergeGate.requireAllChecks: false`, because its check wait fails first otherwise.
- Setup records the keys only on an explicit operator choice and explains the base-branch
  requirement and the residual risk.
- The resolver operation is one more allow rule, 63 in all.

## Review triggers

Review this living decision when the policy would reach any clause beyond reported-at-all, when a
forge can distinguish a repository that never had CI from a late-attaching check, or when hidden
mode gains a base-side record that could provide the missing head guard.

## References

- [Declared no-CI policy](../../src/shared/merge-gate-check-list-waiver.md)
- [Delegated run configuration](../../src/shared/merge-gate-delegated-run.md)
- [Merge-gate key table](../../src/shared/config-merge-gate-keys.md)
- [Unattended run state](unattended-run-state.md)
- [Configuration](../user-guide/configuration.md#block-mergegate)

This is a living decision. Update this file in place when the current policy changes; repository
history preserves earlier states.
