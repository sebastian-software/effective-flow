## Pre-selection upstream sync

This fragment carries the decision flow of `{{SKILL:deliver}}` step 1.1 after `upstream-status`
reports `behind`, `behind-overlap`, or `diverged` and the fetch was not attempted, or `fetch.ok` is
true and `fetch.stale` is false. A local upstream (`branch.<name>.remote = .`) is compared without
fetching. A failed or stale fetch, or one reported as `fetch.skipped`, never reaches this fragment:
the tool ends the check with one notice whatever the state. The status call, the notices for every
other state, and the source-checkout invariant stay in the tool.
Everything here runs after the source receipt is verified and before source `HEAD`, index, and
worktree evidence is recorded or any candidate is reconstructed.

It only brings the branch current with its own upstream `@{u}`: for a feature branch that tracks
its own remote branch, a conflict against `delivery.baseBranch` can still surface later in
`transfer`, which keeps failing closed.

### Questions

Offer a fast-forward only in state `behind`. Report the upstream name and the `behind` count, then
ask:

```ask
when: upstream-status reports behind and the fetch was not attempted, or fetch.ok is true and fetch.stale is false
header: Upstream
question: Update the local branch from its upstream before selecting?
options:
  - label: Fast-forward first
    description: Fast-forward the local branch to the reported upstream commit; uncommitted changes stay in place and hooks are skipped
  - label: Continue without update
    description: Keep the local branch as it is; the refreshed base still reaches the delivery branch through the existing three-way transfer
  - label: Abort
    description: End the run with the working tree, index, and local branch unchanged and before any delivery artifact exists; the preceding upstream fetch may already have written `FETCH_HEAD` and the remote-tracking ref
```

In state `diverged` or `behind-overlap`, and after a fast-forward failure that wrote nothing, first
report the `ahead` and `behind` counts, every path in `overlappingPaths`, and for a failure the
helper's structured diagnostic, including Git's `stderr` diagnostic when present, then ask:

```ask
when: upstream-status reports diverged or behind-overlap and the fetch was not attempted, or fetch.ok is true and fetch.stale is false; or a fast-forward failed with mutationMayHaveSucceeded false
header: Upstream
question: The local branch cannot be fast-forwarded. Continue without an update?
options:
  - label: Continue without update
    description: Keep the local branch as it is and continue with the selection; the existing three-way transfer onto the refreshed base still applies
  - label: Abort
    description: End the run with the working tree, index, and local branch unchanged and before any delivery artifact exists; the preceding upstream fetch may already have written `FETCH_HEAD` and the remote-tracking ref
```

An unanswered question, a skipped question, or a non-interactive run resolves to **Continue without
update** and the report says so. No fast-forward ever runs without an explicit **Fast-forward
first** answer. **Abort** ends the run without changing the working tree, the index, or the local
branch: no fast-forward, no evidence, no selection, and no delivery branch or worktree. The upstream
fetch that preceded the question may already have written fetched objects, `FETCH_HEAD`, and the
remote-tracking ref; Abort does not undo it.

### Fast-forward

After **Fast-forward first**:

1. Invoke `fast-forward` with `root: sourceRoot` and `expectedBranch`, `expectedHeadOid`, and
   `expectedUpstreamOid` taken unchanged from the status result's `branch`, `headOid`, and
   `upstreamOid`, in its default dry-run mode. Continue only when its `toOid` equals the status
   `upstreamOid` and `applied` is false; otherwise nothing was written, so report the result and pose
   the second question.
2. Invoke the same payload with `--apply`. The helper does not re-read `@{u}`: it rechecks the
   branch, `HEAD`, ancestry, and overlap against the pinned values, then runs
   `merge --ff-only --no-overwrite-ignore` with hooks disabled through `core.hooksPath=/dev/null`,
   and verifies the new `HEAD` and every previously staged, unstaged, untracked, and ignored path.
3. On success, report the old and new `HEAD` and that `post-merge` hooks were skipped, then return
   to step 1.1 and record the source evidence from the new `HEAD`.

Map a failed helper envelope from either call by `details.mutationMayHaveSucceeded`; a failure
without that field is treated as `true`:

- `false`, whether the code is `SOURCE_DRIFT` or `COMMAND_FAILED`: nothing was written; report the
  diagnostic and pose the second question.
- `true`: stop hard before selection. Report the old and new `HEAD` and every differing path; offer
  no continue option.

Never stash, rebase, create a merge commit, force, or retry the fast-forward, and never offer any of
them as an alternative.
