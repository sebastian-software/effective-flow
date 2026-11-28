## Autopilot delivery base

The first pre-delivery step, on an issue and a plan source alike: it checks whether the base moved
past the delivery branch's merge base and makes **exactly one** automatic attempt to resolve a
textual conflict with it. Its only outcomes are no merge commit or one merge commit on the
unrebased head. An unresolved conflict is **no blocker**: the run continues to the remaining
pre-delivery steps, `pr-appendix` and `{{SKILL:pr}}`, and publishes the draft with the appendix's
"Delivery base" flag; resolving it is left to a later session such as `{{SKILL:merge-gate}}`.
Never rebase, reset, force-push or retry here.

`<head-oid>` is the verified handback commit, `<branch>` the workflow's delivery branch and `<base>`
the resolved local base branch of that delivery. Each reaches a command only as one single-quoted
argument with every `'` written as `'\''`; every Git call names its root with `git -C`.

```lazy-include
merge-gate-conflict-resolution
when: step 2 returned `proof: "conflict"` and step 3 makes the attempt
```

```lazy-include
config-merge-gate-keys
when: step 3 resolves `mergeGate.conflictResolution`
```

```lazy-include
worktree-integration
when: step 4 has created the attempt worktree and is about to run its setup
```

```lazy-include
worktree-conflict-stop
when: step 4's `worktree path-resolve` for the attempt worktree returned a `source` other than `environment` and a `worktreePath` that a loaded system, `CLAUDE.md`, `AGENTS.md` or host instruction forbids, and its `worktree path-prepare` has not run
```

1. **Fetch.** `git -C <RUNTIME_STATE_ROOT> fetch origin 'refs/heads/<base>:refs/remotes/origin/<base>'`.
   A failed fetch, like any error envelope below, is a `post-branch-failure` blocker.
2. **Check.** Make the literal `autopilot.mjs delivery-base-check` call with
   `{cwd, runId, headOid: <head-oid>, baseRef: <base>}`. It reads only and returns
   `{moved, mergeBaseOid, baseOid, commitCount, proof, reason, conflictCount, conflictedPaths}`.
   - `moved: false`: nothing is recorded; the step ends.
   - `proof: "clean"`: no merge commit; step 11 records `result: "none"`.
   - `proof: "unavailable"`: step 11 records `result: "unchecked"` with the proof's `reason`.
   - `proof: "conflict"`: continue with step 3.
3. **Mode.** Resolve `mergeGate.conflictResolution` as `config-merge-gate-keys` defines it.
   `off` makes no attempt: step 11 records `unresolved` with `conflict-resolution-off`.
   `ask` cannot be posed in this unattended run and counts as the one
   automatic attempt, unlike merge-gate's non-interactive `off`; the record keeps
   `conflictResolution: "ask"`. `auto` attempts.
4. **Checkout.** When the run holds `DELIVERY_ROOT` (an issue source's plan pull request), the
   attempt runs there. Otherwise (a plan source or the plan-on-base path) create a run-owned
   **attempt worktree** on `<branch>` with the mechanics `autopilot-issue-source` "Restore the
   plan" uses for the delivery worktree: `worktree add` without `-b` at the path `worktree
path-resolve` and `worktree path-prepare` give for purpose `delivery` and `sessionId`
   `<run-id>-delivery-base`, with `worktree-conflict-stop` between them, a receipt with workflow
   `autopilot` and purpose `delivery`, `worktree record-init` with that `sessionId` (purpose
   `delivery` requires the path to end in the session id) and `creationOid` `<head-oid>`, then
   `worktree.setup`. A location conflict there creates nothing and records `unresolved` with
   `worktree-location-conflict`, no blocker. When `record-init` fails after `worktree add`, run
   `git -C <RUNTIME_STATE_ROOT> worktree remove '<path>'` without `--force`; if that fails, keep the
   worktree and report its path. The checkout must be on `<branch>` at `<head-oid>`, and
   `git -C <checkout> status --porcelain` must print nothing. A dirty checkout, a held branch or a
   failed creation, `record-init` or setup records `unresolved` with `checkout-unavailable`.
5. **Merge.** `git -C <checkout> merge --no-ff --no-commit '<baseOid>'`, with the full `baseOid`
   of step 2. Only a merge that stops with conflicts continues; any other outcome is
   `merge-failed`.
6. **Contract.** The attempt applies the "Conflict-resolution delegation contract" and "Conflict
   validation mode" sections of `merge-gate-conflict-resolution` unchanged, with these
   substitutions: run state non-interactive; the attempt's checkout as the provisioned checkout;
   no wisdom file, the record of step 11 replaces it; no push, `{{SKILL:pr}}` pushes, so every
   "push nothing" there means "commit nothing" here; no rounds, one attempt. The ceiling call keeps
   `tool: "merge-gate"`; where no pull request exists yet, the `pr-status-read` alternative is
   unknown.
7. **Resolve.** Capture the conflict state, determine the candidate mode and hand the conflict to
   `{{AGENT:merge-conflict-resolver}}` per that contract. `ABORT` or a declined spawn is
   `resolver-abort`.
   <!-- spawn-site:autopilot-delivery-conflict/resolver -->
8. **Reconcile, then verify independently**, in that order, through `{{AGENT:code-validator}}` in
   the effective mode. A reconciliation mismatch, a failing or unverified verification and an
   environment signature are `verification-failed`.
   <!-- spawn-site:autopilot-delivery-conflict/verification -->
9. **Review** the staged merge with the routed reviewers that contract's review bullet selects
   through `pre-commit-review`. A review that does not pass is `review-failed`.
   <!-- spawn-site:autopilot-delivery-conflict/review -->
10. **Complete or abort.** On success complete exactly one merge commit in the checkout. Under
    effective `full` keep Git's default message: `git -C <checkout> commit --no-edit`. Under
    effective `quick` run
    `git -C <checkout> commit --no-edit --cleanup=strip --trailer 'Effective-Flow-Conflict-Validation: quick'`,
    which drops the `# Conflicts:` comment lines and ends the message with the quick marker; the
    `quick-marker-scan` call with `{cwd: <checkout>, baseRef: <base>, headSha: <merge commit>}`
    must list the commit before the record. No `Co-Authored-By` trailer and no AI attribution. On
    any failure from step 5 on, while `git -C <checkout> rev-parse -q --verify MERGE_HEAD` finds a
    merge in progress, run `git -C <checkout> merge --abort`, leaving the branch at `<head-oid>`.
11. **Record.** Make the literal `autopilot.mjs delivery-base-record` call with `cwd`, `runId`
    and all thirteen record fields: `mergeBaseOid`, `baseOid`, `commitCount`, `conflictCount` and
    `conflictedPaths` copied from the check, `result`, `reason`, `conflictResolution`,
    `validationMode`, `headOid` (`<head-oid>`), `mergeOid`, `checkout` and `branch` (`<branch>`
    exactly when `checkout` is set), with `null` for every field the result does not use:
    - `none`: `reason`, `conflictResolution`, `validationMode`, `mergeOid`, `checkout`, `branch`
      null;
    - `unchecked`: `reason` the proof's, every other field but the first three and `headOid` null;
    - `resolved`: `reason` null, `conflictResolution` `ask` or `auto`, the effective
      `validationMode`, `mergeOid` the merge commit, `checkout` its absolute root;
    - `unresolved`: `reason` names the failed step, `mergeOid` is null, `conflictResolution` as resolved, the
      `validationMode` determined so far or null, `checkout` the attempt's root, null for
      `conflict-resolution-off`, `checkout-unavailable` and `worktree-location-conflict`.

    The helper verifies a named checkout with Git: on `refs/heads/<branch>`, a `resolved` tip with
    exactly the parents `[headOid, baseOid]`, an `unresolved` branch still at `headOid` with no
    merge in progress, and in both a clean checkout after the commit or abort. Its error envelope,
    a failed `merge --abort` or an unverified quick marker after the commit is a
    `post-branch-failure` blocker.

**Withdrawal.** Withdraw an attempt worktree that has a record after step 11 with one `worktree remove` call
(`sessionId` `<run-id>-delivery-base`, its record id), whatever the attempt's result. Only when the
step ends in a `post-branch-failure` blocker, transition its record `active` → `aborted` instead,
keep it and report its path. `DELIVERY_ROOT` stays with "Restore the plan".

From here the remaining pre-delivery steps and the workflow's final head OID use the branch tip:
the merge commit after `resolved`, otherwise `<head-oid>`. After `resolved`, `delivery-confirm`
refuses a pushed head that does not contain the merge commit (`MERGE_NOT_DELIVERED`), a
`post-branch-failure` blocker.
