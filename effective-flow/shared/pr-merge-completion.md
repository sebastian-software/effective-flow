## PR merge completion

This shared building block holds the two **terminal mutations** of a gated pull request: merging it
and closing the issue that pull request completed. Both are reached only from
`effective-flow merge-gate`'s merge phase and its post-merge phase, which is why that tool defers this
fragment instead of carrying it in its always-loaded core and why no other workflow loads it at all.
The shared read surface these mutations are decided from — PR resolution, the pull-request status
and submitted-reviews reads, the check wait together with the Forgejo capability matrix that states
which of these operations a provider serves, and the "Remote helper" reference to the helper
contract in `issue-tracker.md` — stays in the "PR review comment integration" building block, which
`effective-flow merge-gate` loads eagerly and reads long before it reaches either mutation here.

### Merge a pull request

Use the helper's `pr-merge` operation (capability key `pullRequestMerge`). It is a **mutation**, so a
run without `apply` produces a dry-run plan and merges nothing. It takes the pull-request number,
the merge method (`delivery.mergeMethod`), and the **expected head SHA**: the merge must apply to
exactly the commit that was verified, so a head that moved in the meantime fails closed instead of
merging a state nobody checked. Never re-run the mutation after a structured error carrying
`mutationMayHaveSucceeded: true` — re-read the pull-request state and report what it shows.

Merging is the most irreversible mutation in this tool set and belongs to `effective-flow merge-gate`. It
is never used to work around a blocked merge state, and this building block still never approves a
pull request and never requests changes — not even to unblock a merge.

### Close an issue as completed

Use the helper's `issue-close` operation (capability key `issueClose`). It is a **mutation**, so a run
without `apply` produces a dry-run plan and closes nothing. It takes the issue number only: the closed
state and, on GitHub, its completed state reason are fixed in the plan builder and are never
caller-supplied, because the one workflow that reaches this operation only ever transitions an issue
it assessed as completed and Forgejo has no state-reason concept at all. Never re-run the mutation
after a structured error carrying `mutationMayHaveSucceeded: true` — re-read the issue state and
report what it shows.

This is an **issue** operation documented in the pull-request building block deliberately. It is
reached only from `effective-flow merge-gate`'s post-merge phase, and that tool does not load
`issue-tracker`: it reaches the helper contract solely through the "Remote helper" reference above,
so this fragment is its one reachable path to per-operation documentation.

The transition this operation performs is offered only after an evidence-backed completion assessment
and an explicit operator confirmation in a gated run. It is never a force-close, never runs
unattended, and never substitutes for a linked issue's own auto-close.

**Forgejo limitation:** `issue-close` rides the same probed `tea api … --method PATCH` transport as
`issue-comment-update`, so a `tea` built without `--include` reports it `UNSUPPORTED_CAPABILITY`
beside the other operations that depend on that transport. The offer is then unavailable for forge
issues and nothing else degrades. On GitHub the capability is constant.
