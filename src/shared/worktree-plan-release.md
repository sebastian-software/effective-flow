## Plan release before the planning-worktree withdrawal

`worktree remove` takes `publishedPlans` to withdraw an `issue-planning` worktree whose plans were
published: the helper proves and releases those untracked plans, then removes the worktree as
usual. The call lists exactly one record ID, this session's `active` `issue-planning` record, and
no `integrationRoot`:

```text
{"cwd":"<RUNTIME_STATE_ROOT>","executionRoot":"<RUNTIME_STATE_ROOT>","sessionId":"<passId>","recordIds":["<RECORD_ID>"],"publishedPlans":[{"path":"<planFile>","blobOid":"<blobOid>","commitOid":"<commitOid>","baseOid":"<baseOid>"}]}
```

Each entry is copied from one confirmed `publish --apply` success envelope. `path` lies directly
under the canonical `plan.dir` of `RUNTIME_STATE_ROOT` and carries an unattended plan file name;
the object IDs are full. A malformed entry, a non-canonical or repeated path, more than one record
ID or `integrationRoot` is `INVALID_INPUT`. Another session's record is `NOT_OWNER`; a record of
another purpose or status is `NOT_ELIGIBLE` (`plan-release-not-applicable`).

**What the helper proves, under the record lock and before any write:**

1. **Condition 7, tolerated.** Every untracked entry is a listed path holding a regular file below
   real parent directories. A listed path with no entry is proven absent (`absentPaths`). Any other
   untracked entry, an ignored entry under `plan.dir`, a kept `.effective-flow-release-*`
   quarantine or a hidden edit refuses with `NOT_ELIGIBLE` (condition 7). Every other condition
   stays required. Other ignored files, such as hook caches, go with the worktree.
2. **Commit proofs, for every listed plan.** `commitOid` is a local commit whose only parent is
   `baseOid` and whose one change adds `path` with `blobOid`; `creationOid` is an ancestor of
   `baseOid`; `path` exists at neither. A re-publish on an assessed base move therefore releases
   too. A failure is `PLAN_NOT_RELEASED` with reason `commit-mismatch` and the path.
3. **Protected release.** Each present plan is renamed into one private quarantine directly below
   the worktree root, read there once and hashed; only a regular file whose blob is `blobOid`
   passes. A changed or replaced plan, or a parent replaced by a symbolic link, is put back
   without overwriting anything: `PLAN_NOT_RELEASED` with reason `changed` or `replaced` and the
   path. A held plan that cannot be put back stays in the quarantine, named as `quarantinePath`;
   it fails condition 7 of every later removal until the operator moves the plan out or deletes
   the empty quarantine.
4. **Anchor.** Once every plan is proven, their blobs are anchored as one tree at
   `refs/effective-flow/released/<RECORD_ID>/<tree>` (`anchorRef`), and only then is the
   quarantine cleared. The ref stays until the user deletes it.

After the release the record moves `active` → `cleanup-ready` under the same lock hold, and the
ordinary removal follows with condition 7 untolerated. Every item from then on carries
`planReleased: true`, `releasedPaths`, `absentPaths` and `anchorRef`. A later failure leaves a
`cleanup-ready` or `cleanup-failed` record that holds no plan and that ordinary cleanup removes.
Every refusal before the release leaves the record `active` and every plan in place.

**Issue Buddy's handling.** This rule overrides the lifecycle denial fallback for the planning
record. After the one `SANDBOX_DENIED` rerun:

- An `ok` item, or one that reports `removed: true` (`BRANCH_RETAINED`, `REMOVE_FAILED`): the
  worktree is gone and nothing is preserved; report the branch or record outcome.
- Every other result, whole-call failures included: call `worktree transition` `active` →
  `aborted` with reason `plan-preserved`, and report the worktree path, the issues and any
  `quarantinePath`. The stored status decides: `STATUS_MISMATCH` means the release already moved
  the record on and no plan remains, so report the kept path for `{{SKILL:cleanup}}`;
  `RECORD_NOT_FOUND` means the worktree is withdrawn.
