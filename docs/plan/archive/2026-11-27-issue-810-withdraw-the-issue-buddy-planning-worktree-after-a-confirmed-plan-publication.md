# Withdraw the Issue Buddy planning worktree after a confirmed plan publication

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #810

## Requirement

An Issue Buddy pass should leave nothing behind after a successful publication. Today, though,
every publishing pass that wrote a plan keeps its `issue-planning` worktree with an `aborted` record
and the reason `plan-preserved`. Phase 5 of `src/tools/issue-buddy.md` allows removing the new plan
only when three things are proven: the pass created it, its blob is unchanged and equal to WP4's
`blobOid`, and it cannot be replaced between the check and the removal. Phase 5 also rules out a
hash check followed by a plain unlink. No shipped helper offers such a removal, so preservation is
the only outcome that can happen. The kept worktrees pile up until `effective-flow cleanup` runs,
and every later pass inventories all of them in Phase 1.

The removal is also blocked one level lower. The plan copy stays an untracked file in the planning
worktree, because WP4 builds the publication commit through plumbing
(`src/scripts/plan-publication-core.mjs`, `buildCommit`). `worktree remove` requires removal
condition 7, a clean `git status --porcelain --untracked-files=all`, and never forces a removal
(`src/shared/worktree-lifecycle.md`, "Removal eligibility"). The issue's variant 2 withdraws the
whole worktree, and that fails for as long as the plan file is still there.

Goal: suppose every plan this pass wrote into its planning worktree was published with confirmed
success and still has exactly the published bytes. Then the pass removes those plans through a
protected release and withdraws its planning worktree, and no `plan-preserved` record remains. Any
plan that is changed, replaced, ambiguous, earlier, failed, unpublished, or uncertain on push or
create is preserved with its worktree and its `plan-preserved` record, as today.

Workflow rationale: Bugfix. The documented removal branch of Phase 5 is unreachable, so the
documented "leave nothing behind" behaviour never happens. The fix makes the existing contract
reachable and adds no new capability.

## Outcome checkpoint

**Primary source:** `github.com/sebastian-software/effective-flow` issue #810
**Original outcome:** A publishing Issue Buddy pass whose plans were all published unchanged ends
with its planning worktree withdrawn and no `plan-preserved` record. Every other plan is still
preserved, together with its worktree. The pass never forces a removal, never prunes and never
deletes anything it has not proven.
**Last evaluated attempt:** none (fresh baseline)
**No-progress count:** 0
**Cumulative approach:** A protected plan release inside `worktree remove` (scored decision S-CLR
below), plus aligned Issue Buddy prose in Phase 2, Phase 5 and Phase 6.
**Continuation decision:** none

## Architecture decisions

- **The protected release lives in `worktree remove`, not in `plan-publication-core.mjs`.** This
  was decided by score (S-CLR, see "Decided by score").
  - `worktree remove` already holds the record lock. It also proves ownership (`sessionId`),
    purpose, path, branch and `creationOid` from fresh evidence.
  - Running the plan release under that same lock hold leaves no state in which the plan is deleted
    before ownership is proven.
- **Reuse the existing quarantine-and-prove pattern.** The pattern is `makeQuarantine` /
  `restoreResidual` in `src/scripts/effective-flow-state-ledger-core.mjs`, documented in
  `src/shared/worktree-partial-diff-recovery.md`.
  - The file is renamed into a private `.effective-flow-release-<hex>` directory directly below the
    worktree root, so the rename stays on the same file system.
  - The held bytes are read once without following links and proven there. What is proven is
    exactly what left the worktree, so a replacement before the rename is caught, and a replacement
    after it no longer matters.
  - A changed file is put back without overwriting anything.
  - An entry that cannot be put back keeps the quarantine. A kept quarantine already fails
    condition 7.

  This is the protection against replacement during the check-and-removal interval that Phase 5
  demands. Export the quarantine primitive for reuse; do not write a second copy.

- **Prove the publication commit, then anchor the released bytes under a release ref.** Both are
  decided by score (S-BAT).
  - **Commit proof.** Nothing is taken until all of these hold:
    - the supplied `commitOid` is a commit in the local object database;
    - it has exactly one parent, equal to the supplied `baseOid`;
    - the record's `creationOid` is an ancestor of `baseOid`;
    - it adds exactly the supplied path, with the supplied `blobOid`.

    `baseOid` comes from the confirmed success envelope. This covers a normal publication, where
    `baseOid` equals `creationOid`. It also covers a re-publish on `toBaseOid` after an assessed
    base move (`src/shared/issue-buddy-base-move.md`). A commit on unrelated history is still
    refused.

  - **Anchor.** Before the quarantine is cleared, the proven blobs are anchored as one tree under
    the existing ref family `refs/effective-flow/released/<RECORD_ID>/<tree>`. This is the same
    anchor `restoreResidual` uses (`preserveTree`).
    - The release is therefore lossless locally, whether or not `remote.origin.fetch` maps the
      plan branch, and whether or not the published branch is later pruned.
    - The published pull-request head remains the remote copy.
    - The cost is one ref per released pass. It stays until the user deletes it, as for a
      partial-diff release.
- **Issue Buddy decides whether to try the release.** Issue Buddy calls `worktree remove` with
  `publishedPlans` only when every plan this pass wrote into `PLANNING_ROOT` appears in its
  confirmed published-plan list, or calls it without the input when the pass wrote no plan.
  Otherwise it keeps today's path and goes straight to `active` → `aborted` with the reason
  `plan-preserved`, without any `worktree remove` call.
  - The helper still refuses on any other entry, and that refusal is a second safety net, not the
    primary decision.
  - This matters because condition 7 does not see ignored files. In a repository that ignores
    `plan.dir`, an unconditional remove call would delete an unpublished plan without force.
- **The tolerated pre-release check refuses unlisted untracked entries and ignored entries under
  `plan.dir`.** The `plan.dir` scope was decided by score (S-DEC).
  - With `publishedPlans`, the pre-release check accepts exactly the listed paths as untracked
    regular files.
  - It refuses all of the following:
    - any other untracked entry;
    - any ignored entry that `ignoredPathsAt` finds for `[plan.dir]` and the listed paths'
      parents;
    - a kept quarantine;
    - any hidden edit.
  - Other ignored files, such as hook caches from `commit-msg` or `pre-push`, are removed with the
    worktree as in every other removal. Hook residue therefore cannot block the release.
  - Untracked entries are read as NUL-separated porcelain v1 and compared byte for byte.
- **A proven-absent listed path counts as nothing to release.** Decided by score (S-BAT). A path
  counts as proven absent when `lstat` finds no entry and its parents are real directories.
  - The release skips such a path and reports it separately as `absentPaths`.
  - The commit proofs still run for it.
  - The re-check without tolerance afterwards catches a file that appears late.
  - No `plan-preserved` record is written for a worktree that holds no plan.
- **Every `issue-planning` removal refuses ignored entries under `plan.dir`.** Decided by score
  (S-BAT). This applies with or without `publishedPlans`, and in cleanup too.
  - For the `issue-planning` purpose, condition 7 also fails on any ignored entry that the
    existing `ignoredPathsAt` finds for `[plan.dir]`. That covers files directly under `plan.dir`,
    files below a nested ignored directory, and a file in place of a parent. So a gitignored plan
    can never be lost to a plain
    `git worktree remove`, and the cleanup sentence "fails condition 7 while its plan is there"
    holds for an ignored `plan.dir` too.
  - This is the one deliberate behaviour change for calls without the input. Other purposes are
    unaffected.
- **State after a successful release.** Once every listed plan is released, the record moves
  `active` → `cleanup-ready` under the same lock hold. The work is durably secured on the remote.
  Then the ordinary eligibility check runs without any tolerance, followed by the removal.
  - A later failure leaves a `cleanup-ready` or `cleanup-failed` record that no longer holds a
    plan.
  - Ordinary cleanup removes such a record. No `plan-preserved` record is written for it.
- **The Issue Buddy fallback overrides the generic denial fallback.** The generic denial fallback
  is in `worktree-lifecycle.md`, "Denial fallback". After its one `SANDBOX_DENIED` rerun, Issue
  Buddy handles a call that passed `publishedPlans` and was not fully `ok`, including a whole-call
  failure, like this:
  - The generic fallback's exemptions stay. An item that reports `removed: true`, whether as
    `BRANCH_RETAINED` or `REMOVE_FAILED`, means the plans were released and the worktree is gone.
    The pass reports the branch or record outcome, adds no leftovers, and makes no transition.
  - For every other non-`ok` outcome, it calls `worktree transition` `active` → `aborted` with
    reason `plan-preserved`.
    - The stored status decides the outcome, not the item details. Many failures, such as
      `SANDBOX_DENIED`, `LOCK_HELD` or a whole-call error, carry no status.
    - `STATUS_MISMATCH` means the release already moved the record to `cleanup-ready` or further.
      No plan remains, and the kept path is reported for `effective-flow cleanup`.
    - `RECORD_NOT_FOUND` means the worktree was withdrawn and nothing is preserved.
  - The generic denial fallback (`active` → `cleanup-ready`, reason `null`) applies only to calls
    without `publishedPlans`.
  - The reason for the override: Phase 1 inventories only `aborted`/`plan-preserved` records. A
    refused release moved to `cleanup-ready` would hide its plans from later passes, and its
    worktree would then fail condition 7 forever.
  - A pass that wrote no plan never gets a `plan-preserved` record.
- **Phase 6 withdraws the planning worktree before it persists the report.** Decided by score
  (S-BAT).
  - A v2 report is never rewritten, so the exit, meaning the remove call or the direct
    `plan-preserved` transition, moves before `pass-report` on every path that reaches Phase 6.
  - The leftovers are every plan this pass wrote, minus those listed as released or in
    `absentPaths` by an `ok` item or by an item that reports `removed: true`. Those plans enter
    `leftoverPlanFiles` as preserved new-file diagnostics.
    - This also covers a fallback transition that fails itself (`LOCK_HELD`, `INTERRUPTED`,
      `SANDBOX_DENIED`, a whole-call error). Such a record stays `active` and invisible to Phase 1,
      so the persisted report is the only durable trace of its plans.
    - The report also names a kept `quarantinePath` with its worktree path.
  - `pass-close` still follows report handling.
- **No forced removal and no relaxed condition 7.** Condition 7 stays absolute for the actual
  `git worktree remove`.

## Affected files

| File                                                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/effective-flow-state-worktree-core.mjs` | `worktree remove` accepts an optional `publishedPlans` input. Under the record lock and before the claim, it validates the input, runs the tolerated pre-release check, the commit proofs and the protected release, and anchors the released blobs. After the release it moves the record to `cleanup-ready`. It returns `planReleased`, the released paths, `absentPaths` and the new refusal details. Condition 7 for `issue-planning` also refuses ignored entries under `plan.dir`. Update the header comment and the documentation of `removeOne`, `claimAndRemove` and `gatherFacts`. |
| `src/scripts/effective-flow-state-ledger-core.mjs`   | Export the quarantine primitive (`makeQuarantine` or an extracted equivalent), the read-once capture with `realParents`, and the preserve-tree anchor (`preserveTree`, `RELEASE_PRESERVE_REF_PREFIX`) for reuse. `restoreResidual` keeps its behaviour.                                                                                                                                                                                                                                                                                                                                      |
| `src/scripts/effective-flow-state-core.mjs`          | Add `publishedPlans` to the closed input-key list of `worktree remove` (around line 382).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/shared/worktree-plan-release.md` (new)          | A lazy fragment that holds the `publishedPlans` contract: input, tolerated check, commit proofs, protected release, anchor ref, the move to `cleanup-ready`, the refusal outcomes and the Issue Buddy fallback override. Decided by score (S-DEC). It is reached only from the Issue Buddy Phase 2 exit, through a ` ```lazy-include ` with its `when:` line.                                                                                                                                                                                                                                |
| `src/shared/worktree-lifecycle.md`                   | Eagerly included by `cleanup`, `deliver`, `apply-review-commit-mechanics` and `worktree-integration`, so it gains only three things: a one-line pointer to `worktree-plan-release` under "Helper operations", the `issue-planning` ignored-entry sentence in condition 7, and a `PLAN_NOT_RELEASED` row in the outcome table.                                                                                                                                                                                                                                                                |
| `build.mjs`                                          | Only if shared fragments must be registered for lazy-include resolution or guards. Otherwise unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/tools/issue-buddy.md`                           | Phase 5: replace the unreachable removal paragraph with the published-plan list rule. Phase 2 exit rule: describe the reachable release, the preservation decision and the fallback that overrides the generic denial fallback. Phase 6: move the planning-worktree exit before `pass-report`, and take `leftoverPlanFiles` from the actual exit outcome. Update `contextBudget`.                                                                                                                                                                                                            |
| `src/tools/cleanup.md`                               | At about line 601, extend the `issue-planning` condition 7 explanation by one sentence: a kept `.effective-flow-release-*` quarantine, or an ignored plan under `plan.dir`, also blocks removal, and the operator moves the held plan out or removes the empty quarantine. Change nothing else.                                                                                                                                                                                                                                                                                              |
| `docs/developer-guide/architecture.md`               | Around line 544: a planning worktree is kept only when a plan is preserved, and a confirmed, unchanged publication withdraws it.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `test/effective-flow-state-worktree.test.mjs`        | New helper cases for the release, its refusals, the ignored-file case and the race (see Validation plan).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `test/issue-buddy-contract.test.mjs`                 | Replace the assertion at about lines 193–196, which matches the replaced "Only after confirmed publication may this pass remove…" sentence. Update the Phase 2 regex at about lines 390–393. Add assertions for the new Phase 5 rule, the exit rule and the fallback override, each naming the invariant it protects.                                                                                                                                                                                                                                                                        |
| `test/issue-buddy-pass.test.mjs`                     | At about lines 108–112, reword the assertion message "no protected removal proof is available, so the new plan survives". That test calls no `worktree remove`, so its assertion stays and only the reason changes.                                                                                                                                                                                                                                                                                                                                                                          |
| `test/worktree-lifecycle-contract.test.mjs`          | Add `PLAN_NOT_RELEASED` to the list of helper codes that the outcome table must cover (about lines 653–669). Assert the pointer to `worktree-plan-release` and the `issue-planning` ignored-entry rule.                                                                                                                                                                                                                                                                                                                                                                                      |

## Implementation details

### Approach

1. **Input shape and validation (`worktree remove`).**
   - `publishedPlans` is optional. When given, it is a non-empty array of
     `{path, blobOid, commitOid, baseOid}`.
   - `path` must satisfy all of these:
     - it is repository-relative and uses POSIX separators;
     - it has no leading `/`, no empty, `.`, `..` or `.git` segment, no backslash and no NUL;
     - it lies directly under the canonical `plan.dir`, resolved from `RUNTIME_STATE_ROOT` the way
       `resolveBases` already resolves its configuration;
     - its file name matches `UNATTENDED_PLAN_NAME`, imported from `plan-lint-core.mjs` rather than
       re-specified.

     A listed path outside the resolved `plan.dir`, for example because Issue Buddy froze a
     different `planDir`, fails closed as `INVALID_INPUT`.

     Paths must not repeat.

   - `blobOid`, `commitOid` and `baseOid` are full object IDs of the repository's hash length.
   - The following are `INVALID_INPUT`:
     - a malformed entry;
     - more than one record ID;
     - `publishedPlans` combined with `integrationRoot`.
   - A record of another session keeps the existing `NOT_OWNER`. A well-formed input on this
     session's record with the wrong purpose or status is `NOT_ELIGIBLE`.
   - Without `publishedPlans`, behaviour is unchanged except for the `issue-planning`
     ignored-entry rule in step 2.
2. **Condition 7 for `issue-planning`, and the tolerated pre-release check, under the record
   lock.**
   - **Every `issue-planning` removal, with or without the input, and in cleanup.** Condition 7
     additionally fails on any ignored entry that `ignoredPathsAt` reports for `[plan.dir]`.
   - **With `publishedPlans`.** Run the existing `gatherFacts`/`assessEligibility` with one
     replacement for condition 7:
     - read `git status --porcelain=v1 -z --untracked-files=all --ignored --ignore-submodules=none`;
     - accept only entries that are `??` for a listed path;
     - compare each entry path byte for byte with the validated list;
     - `lstat` each listed path and require a regular file;
     - treat a listed path that has no entry, and whose parents are real directories, as proven
       absent. It is reported in `absentPaths` and is not released.
   - Refuse on any other `??` entry, on an ignored entry that `ignoredPathsAt` reports for
     `[plan.dir]` and the listed paths' parents, on a kept quarantine (`quarantineRetained`) and on
     a hidden edit. Leave other ignored entries alone; the worktree removal deletes them, as it does
     today.
   - Every other condition stays required. A failure returns `NOT_ELIGIBLE`, writes nothing and
     leaves the record `active`.
3. **Commit proofs, before any file is taken.** For each listed plan:
   - `commitOid` is a commit whose single parent equals `baseOid`;
   - `git merge-base --is-ancestor <creationOid> <baseOid>` exits `0`;
   - `diff-tree` names exactly `path`, as an addition;
   - `rev-parse <commitOid>:<path>` equals `blobOid`;
   - `path` does not exist at `creationOid`.

   A failure returns `PLAN_NOT_RELEASED` with reason `commit-mismatch` and the path. It writes
   nothing and leaves the record `active`.

4. **Protected release.**
   - Run a new named phase hook, `beforePlanRelease`, after the commit proofs and before the first
     rename, so tests can inject a replacement in that interval.
   - Create one quarantine directly below the worktree root.
   - For each listed path, in sorted order:
     - require `realParents`, meaning every parent below the root is a real directory and not a
       symbolic link, immediately before the rename and again before any put-back;
     - rename the file into the quarantine;
     - `lstat` the held entry and require a regular file;
     - read its bytes once, through a standalone capture function extracted from the `capture`
       closure of `restoreResidual`. The implementer either opens the file without following links
       (`O_NOFOLLOW`) or keeps the existing `lstat`-then-read approach on the held entry, and
       records the choice in the function comment;
     - hash those bytes with `git hash-object --no-filters --stdin` through `guardedGit`, the
       hashing WP4 uses;
     - require the hash to equal `blobOid`.
   - If an entry differs or a rename fails, put every held entry back without overwriting. Then
     return `PLAN_NOT_RELEASED` with reason `changed` or `replaced` and the path, and leave the
     record `active`.
   - If an entry cannot be put back, keep the quarantine and return its path in the error details
     as `quarantinePath`. This includes a put-back that `realParents` refuses: catch its
     `UNSAFE_TARGET` and map it to `PLAN_NOT_RELEASED` with reason `replaced`. The kept quarantine
     fails condition 7 for every later removal.
   - Only when every entry is proven:
     - anchor the proven blobs as one tree at `refs/effective-flow/released/<RECORD_ID>/<tree>`
       through the shared `preserveTree`;
       - `preserveTree` needs a private scratch index and an `indexFile`-aware Git runner;
       - `worktreeGit` lives in `effective-flow-state-recovery-core.mjs`, which the worktree core
         must not import, so move that runner down into the ledger core (or the worktree core);
       - create the scratch index in a private temporary file and remove it in a `finally`, as
         `withLockedIndex`'s `scratch()` does;
     - then unlink the held entries and remove the quarantine with `rmdir`.

     A failed anchor puts the held entries back as above.
5. **After the release.**
   - Under the same lock hold, write `active` → `cleanup-ready`.
   - Re-derive the eligibility facts with no tolerance; condition 7 must now be clean.
   - Continue with the existing claim, `git worktree remove` without force, the branch policy and
     the record deletion. `issue-planning/<passId>` is still at `creationOid`, so the branch policy
     compare-and-deletes it as today.
   - A later failure keeps the existing outcomes: `NOT_ELIGIBLE` with status `cleanup-ready` before
     the claim, `cleanup-failed` after it.
   - The item result reports `planReleased: true`, the released paths, `absentPaths` and the
     anchor ref.
6. **Issue Buddy, Phase 5.**
   - Replace the paragraph that begins "Only after confirmed publication may this pass remove…".
     From a confirmed `publish --apply` success envelope only, append
     `{path: planFile, blobOid, commitOid, baseOid}` to the pass's published-plan list. Removal
     happens only through the protected release at the Phase 2 exit.
   - Plans that are changed, ambiguous, earlier, failed, unpublished, or uncertain on push or create
     are never listed. They are preserved, and so is the worktree that holds them.
   - Keep "Never force-push, force-clean or delete an earlier survivor".
   - Phase 5 no longer appends preserved new plans to the leftover diagnostics. Phase 6 adds them
     from the actual exit outcome (step 7).
7. **Issue Buddy, Phase 2 exit rule.**
   - **Every plan written is listed, or none was written.** Withdraw the planning worktree with
     one `worktree remove` call, and pass `publishedPlans` when the list is non-empty.
   - **At least one plan written is not listed.** Transition `active` → `aborted` with reason
     `plan-preserved` without a remove call, keep the worktree, and report its path and issues.
   - **Remove call with `publishedPlans`, item reports `removed: true`** (`BRANCH_RETAINED`,
     `REMOVE_FAILED`). The worktree is gone. Report the branch or record outcome; nothing is
     preserved.
   - **Remove call with `publishedPlans`, any other result that is not fully `ok`, whole-call
     failures included.**
     - After the one `SANDBOX_DENIED` rerun, call `worktree transition` `active` → `aborted` with
       reason `plan-preserved`.
     - Report the worktree path, the issues and any `quarantinePath`.
     - `STATUS_MISMATCH`: the release already moved the record on. Report the kept path for
       `effective-flow cleanup`.
     - `RECORD_NOT_FOUND`: the worktree is withdrawn.
   - **Remove call without `publishedPlans` that is not fully `ok`.** Apply the generic denial
     fallback, and report the kept path for `effective-flow cleanup`.
   - State in one sentence that this rule overrides the generic denial fallback for this record.
     The claim is released either way.
   - **Order in Phase 6.** Run this exit before `pass-report`, on every path that reaches Phase 6.
     The leftovers are every plan written, minus the released and `absentPaths` entries of an `ok`
     item or of an item that reports `removed: true`. A fallback transition that itself fails still
     counts its plans as leftovers. Pass them as validated preserved new-file diagnostics in
     `leftoverPlanFiles`, deduplicated by path. Initial metadata and selection stay unchanged.
     Phase 6's "Withdraw or keep the planning worktree as Phase 2 says" sentence moves accordingly.
8. **Prose budget.**
   - Keep the Issue Buddy additions compact, per point 1 of "Writing prompt text".
   - The helper mechanics and the fallback override belong in the new lazy fragment
     `worktree-plan-release.md`, not in `issue-buddy.md` and not in the eager
     `worktree-lifecycle.md`. `issue-buddy.md` names the decision points and points to the fragment
     through one ` ```lazy-include `.
   - Check that the budgets of `cleanup`, `deliver`, `apply-review-commit-mechanics` and every
     `worktree-integration` host grow by at most the three eager additions.
   - Set `contextBudget` from the `Always-loaded core (lines/budget)` report of `node build.mjs`.

### Component structure

Not relevant: no UI.

### State management

A successful release runs within one `worktree remove` call: `active` → `cleanup-ready` →
`cleanup-in-progress` → record deleted. The state machine table already has each of these
transitions.

On a refusal the record stays `active`, and Issue Buddy applies the existing `active` → `aborted`
transition with reason `plan-preserved`. A pass that never tries the release keeps today's direct
`active` → `aborted` (`plan-preserved`) transition. A successful release leaves one ref behind:
`refs/effective-flow/released/<RECORD_ID>/<tree>`.

### API integration

The only interface change is to the helper's `worktree remove` operation:

- new input `publishedPlans`, with entries `{path, blobOid, commitOid, baseOid}`;
- new result fields `planReleased`, the released paths, `absentPaths` and the anchor ref;
- new refusal code `PLAN_NOT_RELEASED`, with the reasons `commit-mismatch`, `changed` and
  `replaced`, plus an optional `quarantinePath`;
- condition 7 for `issue-planning` also fails on an ignored entry under `plan.dir`.

WP4 and every other helper operation stay unchanged. Issue Buddy takes `baseOid` from the existing
success envelope.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **Batch pass, all plans published and unchanged.** Every plan is released in one call, and the
  worktree is then withdrawn.
- **Batch pass, one plan not listed** (publish limit, failure, or uncertain push or create).
  Issue Buddy makes no remove call and writes `aborted`/`plan-preserved`. Every plan stays, as
  today, and Phase 6 reports them in `leftoverPlanFiles`.
- **Plan changed after publication.** The held bytes differ from `blobOid`. The file is put back
  at its path, and the worktree is kept with `plan-preserved`.
- **Plan replaced by a symbolic link, a directory or another file before the rename.** The held
  entry fails the regular-file proof or the blob proof, and it is put back. If the path is occupied
  again, the quarantine is kept and its path is reported. Nothing is overwritten.
- **A parent directory replaced by a symbolic link.** `realParents` refuses before the rename or
  the put-back, so no file outside the worktree is moved or written.
- **`commitOid` missing locally, or with a different parent, base ancestry or tree.**
  `PLAN_NOT_RELEASED` (`commit-mismatch`); nothing is taken.
- **Publication after an assessed base move** (`issue-buddy-base-move`). The commit's parent is
  `toBaseOid`, which is listed as `baseOid` and descends from `creationOid`. The plan is released
  like any other.
- **A listed plan already moved out.** The path is proven absent, reported in `absentPaths`, and
  not released. The worktree is withdrawn if nothing else remains.
- **An extra untracked file, or an ignored plan under `plan.dir`.** The tolerated check refuses
  before the release. An ignored entry under `plan.dir` also blocks every `issue-planning` removal
  without the input, cleanup included. An ignored file elsewhere, such as a hook cache, is removed
  with the worktree, as in every other removal.
- **`git worktree remove` fails after the release.** The record becomes `cleanup-failed`. The plan
  bytes stay under the anchor ref and on the published remote head. Cleanup retries the removal,
  and no `plan-preserved` record is written.
- **`SANDBOX_DENIED`, `LOCK_HELD`, `DEADLINE_REACHED`, `INTERRUPTED` or a whole-call failure
  before the release.** The record stays `active`. After the one rerun, Issue Buddy transitions it
  to `aborted`/`plan-preserved` when it passed `publishedPlans`. Otherwise the generic denial
  fallback applies.
- **Interrupted between the release and the claim.** The record is `cleanup-ready` and holds no
  plan. Ordinary cleanup removes it.
- **Process killed during the release.** The bytes stay safe, but no automatic path picks them up.
  - Killed after a rename and before the put-back or unlink: the record stays `active`, and the
    plan sits in `.effective-flow-release-<hex>`.
  - Killed after the unlink and before the `rmdir`: an empty quarantine is left behind.

  In both cases condition 7 fails closed. Phase 1 skips `active` records, so this surfaces only
  through `worktree inspect` (condition 7) and the killed pass's retained state. The operator moves
  the held plan out or deletes the empty quarantine, then runs `effective-flow cleanup`. This is the
  same operator action as for any interrupted `active` record.

- **Dry-run pass.** It creates no planning worktree, so nothing changes.

## Acceptance criteria

The plan is complete when every criterion below holds and the CI order `pnpm agent:check`,
`pnpm test`, `node build.mjs`, `pnpm test:distribution` is green.

- [ ] **Successful release.** A helper test in `test/effective-flow-state-worktree.test.mjs` uses
      this session's `active` `issue-planning` record, whose worktree holds exactly the published,
      unchanged plan or plans. It creates a matching publication commit by plumbing, as WP4 does.
      `worktree remove` with `publishedPlans` must then:
  - unregister the worktree and remove its directory;
  - delete the record and the `issue-planning/<SESSION_ID>` branch;
  - leave the anchor ref holding the plan blob;
  - report `planReleased: true`;
  - leave no `plan-preserved` record.

  A second case does the same for a commit built on a later base that descends from
  `creationOid`, which is the base-move re-publish.

- [ ] **Refusals.** Helper tests cover each of the following cases:
  - a changed plan;
  - a plan replaced between the eligibility check and the rename, injected through the new
    `beforePlanRelease` phase hook;
  - a plan replaced by a symbolic link;
  - a parent directory such as `docs/plan` swapped for a symbolic link before the rename;
  - an unlisted extra untracked plan;
  - an ignored plan under `plan.dir`. An ignored file outside `plan.dir`, such as a hook cache,
    does not refuse; a separate case shows that it is removed with the worktree;
  - a `commitOid` whose blob, parent, base ancestry or changed paths differ;
  - a path that is tracked at `creationOid`.

  After each refusal, every plan file is byte-identical at its path, the worktree is still
  registered, the record is still `active`, and no anchor ref was written.

- [ ] **Absent listed path.** A helper test shows that a listed plan proven absent is reported in
      `absentPaths` and does not stop the withdrawal of an otherwise clean worktree.
- [ ] **Ignored plan without the input.** A helper test shows that an `issue-planning` worktree
      with an ignored entry under `plan.dir` fails condition 7 for `worktree remove` and for cleanup.
      The file stays.
- [ ] **Put-back failure.** A helper test shows that a put-back failure keeps the quarantine and
      names it as `quarantinePath`. That includes a put-back refused by `realParents`, which is
      reported as `PLAN_NOT_RELEASED`. A later `worktree remove` and cleanup then fail condition 7.
- [ ] **Preserved end state.** A helper-sequence test runs a refused `worktree remove` with
      `publishedPlans` on a changed plan, followed by the `active` → `aborted` (`plan-preserved`)
      transition. It asserts that:
  - the worktree is still registered;
  - the record is `aborted` with reason `plan-preserved`;
  - the plan bytes are unchanged;
  - cleanup refuses with condition 7 while the plan is there.

  This is the issue's preservation criterion. A contract assertion in
  `test/issue-buddy-contract.test.mjs` adds that push-uncertain and create-uncertain outcomes are
  never appended to the published-plan list.

- [ ] **Failure after the release.** A helper test injects a failure after the release, either
      through the `afterClaim` hook or through a failing `git worktree remove`. The record must end
      `cleanup-ready` or `cleanup-failed`, with no plan left, the anchor ref present and no
      `plan-preserved` record. Ordinary cleanup must then remove it.
- [ ] **Unchanged behaviour without the input.** Apart from the ignored-entry rule, the existing
      `worktree remove`, cleanup and `plan-preserved` tests pass unchanged. That includes "cleanup
      removes a kept issue-planning worktree with a preserved plan once the plan is gone".
- [ ] **Input validation.** `INVALID_INPUT` is returned for:
  - a malformed entry;
  - a non-canonical path;
  - more than one record ID;
  - a combination with `integrationRoot`.

  A record of another session gets `NOT_OWNER`. This session's record with the wrong purpose or
  status gets `NOT_ELIGIBLE`.

- [ ] **Issue Buddy prose.** Phase 5, the Phase 2 exit rule and Phase 6 of
      `src/tools/issue-buddy.md` all describe the same reachable path:
  - only confirmed publications are listed, with `baseOid`;
  - a remove call carries `publishedPlans` only when every plan written is listed; otherwise the
    pass writes `plan-preserved` directly;
  - an item that reports `removed: true` preserves nothing;
  - after any other result of a call with `publishedPlans` that is not fully `ok`, the pass
    attempts `aborted`/`plan-preserved`, reports `STATUS_MISMATCH` for cleanup and treats
    `RECORD_NOT_FOUND` as withdrawn. This overrides the generic denial fallback;
  - the exit runs before `pass-report`, and `leftoverPlanFiles` holds every plan written minus the
    released and absent ones.

  The sentence "If the filesystem/harness cannot prove ownership and protected removal" is gone,
  and `test/issue-buddy-contract.test.mjs` asserts these sentences.

- [ ] **Lifecycle contract.** `src/shared/worktree-lifecycle.md` has a `PLAN_NOT_RELEASED` outcome
      row, and `test/worktree-lifecycle-contract.test.mjs` lists the code among those the table must
      cover. The `publishedPlans` mechanics live in the lazy fragment `worktree-plan-release.md`,
      which `issue-buddy.md` reaches through a ` ```lazy-include `.
- [ ] **Context budgets.** Each of the following equals its built line count plus at most ten
      lines of headroom, as reported by `node build.mjs`:
  - `contextBudget` in `src/tools/issue-buddy.md`;
  - the budget of every tool that eagerly includes `worktree-lifecycle` (`cleanup`, `deliver`,
    `apply-review-commit-mechanics`, `worktree-integration` hosts) and grows.

## Validation plan

- **Targeted tests first.** Run the new and changed cases in isolation:
  - `test/effective-flow-state-worktree.test.mjs`
  - `test/issue-buddy-contract.test.mjs`
  - `test/issue-buddy-pass.test.mjs`
  - `test/worktree-lifecycle-contract.test.mjs`

  Then run the full suite.

- **Full CI order through the project runner:** `pnpm agent:check`, `pnpm test`, `node build.mjs`,
  `pnpm test:distribution`. The full suite takes a long time under load.
- **Budget report.** Check the `node build.mjs` report for these budgets:
  - the updated `issue-buddy` budget;
  - the small growth of each tool that eagerly includes `worktree-lifecycle` or
    `worktree-integration`.

  No tool's always-loaded core may grow past its budget. The new `worktree-plan-release` fragment
  must add nothing to any eager core.

- **Behavioural-eval evidence.** The `merge-gate` and `iterate` suites seed
  `effective-flow-state-core.mjs` and `effective-flow-state-worktree-core.mjs`, so expect visible
  freshness debt there. Confirm it with `pnpm eval merge-gate verify` and `pnpm eval iterate verify`,
  or with the CI step `Behavioural eval evidence`. A routine change needs no new model runs
  (`docs/adr/pragmatic-test-release-policy.md`).
- **Optional manual check.** Run one publishing Issue Buddy pass on a test issue. It should end
  without a `plan-preserved` record and without a registered `-issue-planning` worktree.

## Assumptions and open points

- Verified: the plan copy stays untracked in the planning worktree after `publish --apply`.
  `buildCommit` in `plan-publication-core.mjs` commits through plumbing with
  `update-index --cacheinfo`.
- Verified: condition 7 blocks `worktree remove` while that file exists. The header comment of
  `effective-flow-state-worktree-core.mjs` says so, and the `plan-preserved` cleanup test shows it.
- Verified: condition 7's status call leaves out ignored files.
- Verified: the publish success envelope returns `planFile`, `blobOid`, `commitOid` and `baseOid`.
- Verified: WP4's commit has a single parent. That parent is `collect.baseOid`, which equals the
  record's `creationOid`, except after an assessed base move, when it is `toBaseOid`.
- Verified: WP4 pushes with the explicit refspec `<commitOid>:refs/heads/<branch>`. A local
  remote-tracking ref is therefore not guaranteed, which is why the release anchors its own ref.
- Assumption: all plans of one pass share the one planning worktree, so the release is all or
  nothing per worktree. This follows from "Every plan file, lint and publication of this pass uses
  `PLANNING_ROOT`".
- Assumption: exporting the quarantine, capture and preserve-tree primitives leaves
  `restoreResidual` unchanged. The existing partial-diff tests guard this.
- Legacy plans present: not applicable. The unattended run skipped migration.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[{"site": "S-CLR", "question": "Which removal mechanism should withdraw the planning worktree after a confirmed publication with an unchanged plan?", "options": ["Protected plan release inside worktree remove", "Separate protected removal operation in plan-publication-core", "Withdraw the whole worktree without a single-file step", "Document preservation as the normal outcome"], "escape": [], "stop": null, "scores": [{"label": "Protected plan release inside worktree remove", "score": 9, "reason": "It runs the quarantine-and-prove step under the same record lock as the ownership and condition-7 checks, so nothing can slip in between, which is its edge over a separate two-call operation."}, {"label": "Separate protected removal operation in plan-publication-core", "score": 5, "reason": "It reuses the quarantine pattern, but releasing the plan and removing the worktree become two separate lock scopes, so a failed or raced second call leaves an active record with its plan already deleted."}, {"label": "Withdraw the whole worktree without a single-file step", "score": 2, "reason": "Relaxing condition 7 or forcing removal breaks the never-force contract and could delete a changed plan or other untracked residue that the issue says must be preserved."}, {"label": "Document preservation as the normal outcome", "score": 2, "reason": "It contradicts the expected behaviour that a published, unchanged plan withdraws the planning worktree, and it leaves a plan-preserved record after every publication."}]}, {"site": "S-BAT", "question": "Which parent proof should the protected plan release require of the publication commit, given that a base-moved re-publish builds on toBaseOid rather than creationOid?", "options": ["List the base and require creationOid ancestry", "Drop the parent check", "Keep the strict creationOid parent"], "escape": [], "stop": null, "scores": [{"label": "List the base and require creationOid ancestry", "score": 9, "reason": "Binds the parent to the confirmed envelope's baseOid and keeps creationOid ancestry, so normal and base-moved publications both release; edge over dropping the check: commits on unrelated history are still refused."}, {"label": "Drop the parent check", "score": 5, "reason": "Blob and single-addition proofs still protect the bytes, but nothing ties the commit to the planning worktree's history, which weakens the claim that this commit is the pass's own publication."}, {"label": "Keep the strict creationOid parent", "score": 4, "reason": "Safe and simple, but every confirmed, unchanged base-moved publication stays plan-preserved, so the issue's goal of leaving nothing behind after success is only partly met."}]}, {"site": "S-BAT", "question": "How should Phase 6 order the persisted pass report and the planning-worktree exit, given that a v2 report is never rewritten?", "options": ["Withdraw before the report", "Pre-list every published plan", "Report only unlisted plans"], "escape": [], "stop": null, "scores": [{"label": "Withdraw before the report", "score": 9, "reason": "The report then records the actual remove result, which matters because a v2 report is never rewritten. pass-report only checks the shape of leftoverPlanFiles, so withdrawing first is a safe reorder. Neither alternative gives an accurate persisted report."}, {"label": "Pre-list every published plan", "score": 3, "reason": "After every successful release the stored report lists plans that no longer exist, each with a 'remove' action. That works against the goal that a pass leaves nothing behind."}, {"label": "Report only unlisted plans", "score": 5, "reason": "It keeps the current order and never overstates leftovers. But a refused release leaves a preserved plan that this pass's stored report omits, and only the chat summary and the next Phase 1 inventory show it."}]}, {"site": "S-BAT", "question": "How should the helper prove or secure the published bytes before deleting the plan's only working copy?", "options": ["Require the local tracking ref", "Anchor under a release ref", "Trust the caller and restate recovery"], "escape": [], "stop": null, "scores": [{"label": "Require the local tracking ref", "score": 6, "reason": "This is real local evidence of a successful push or fetch, but it fails closed when remote.origin.fetch has no mapping or the push timed out. The ref can move or be pruned, so local recovery is still not durable."}, {"label": "Anchor under a release ref", "score": 8, "reason": "It reuses preserveTree and the existing released-ref precedent, so the release is lossless. Its edge over the tracking ref: it does not depend on remote.origin.fetch and survives prune and gc. The cost is one uncleaned ref per pass."}, {"label": "Trust the caller and restate recovery", "score": 3, "reason": "It is honest about recovery, but a caller list built by an agent becomes the only guard before deleting the sole local copy, and nothing secures the bytes if that list is wrong."}]}, {"site": "S-BAT", "question": "What should the helper do when a listed published plan is already absent from the planning worktree?", "options": ["Require every listed path present", "Treat a proven-absent path as released"], "escape": [], "stop": null, "scores": [{"label": "Require every listed path present", "score": 5, "reason": "Fail-closed and simple, but it writes a misleading aborted/plan-preserved record for a worktree with no plan, which later Phase 1 passes inventory, and it misses the goal of leaving nothing behind."}, {"label": "Treat a proven-absent path as released", "score": 8, "reason": "Absence at lstat with real parents puts no bytes at risk, the commit proofs still run, and the untolerated condition-7 recheck catches a late file. Edge: no false plan-preserved record. Report absent paths separately."}]}, {"site": "S-BAT", "question": "Should this plan close the pre-existing gap that a worktree remove without publishedPlans cannot see an ignored plan?", "options": ["Leave it out of scope", "Refuse ignored plan entries for issue-planning"], "escape": [], "stop": null, "scores": [{"label": "Leave it out of scope", "score": 5, "reason": "It keeps scope tight and matches the plan's promise that calls without publishedPlans behave exactly as before, but a gitignored plan.dir stays deletable through a prose-only guard, cleanup of plan-preserved records included."}, {"label": "Refuse ignored plan entries for issue-planning", "score": 7, "reason": "It reuses the ignored-inclusive status read the plan already adds, makes cleanup.md's 'fails condition 7 while its plan is there' hold for ignored plan.dir, and fails closed; it does break the unchanged-without-input promise."}]}, {"site": "S-DEC", "question": "Where should the new worktree remove publishedPlans helper-operation prose live, given that worktree-lifecycle.md is eagerly included by several tools?", "options": ["New lazy fragment for the release", "Keep it in worktree-lifecycle and re-measure", "Minimal prose, proofs in the helper comment", "Decide later"], "escape": ["Decide later"], "stop": null, "scores": [{"label": "New lazy fragment for the release", "score": 8, "reason": "Only Issue Buddy passes publishedPlans, so its contract loads once, at the Phase 2 exit. The eager hosts (cleanup, deliver, apply-review mechanics, worktree-integration) gain only a pointer, the condition-7 rule and one outcome row. Edge: agents can read the proofs."}, {"label": "Keep it in worktree-lifecycle and re-measure", "score": 3, "reason": "It keeps the contract in its current fragment, but every eager host and worktree-integration consumer would pay for mechanics that only Issue Buddy uses. Re-measuring the budgets records that cost without avoiding it, against point 1."}, {"label": "Minimal prose, proofs in the helper comment", "score": 6, "reason": "It keeps the eager cost as small as option 1, but the release anchor and the refusal reasons would sit only in code. The agent then cannot read the recovery ref or explain a PLAN_NOT_RELEASED refusal from shipped prose."}]}, {"site": "S-DEC", "question": "How wide should the protected release's ignored-entry refusal be?", "options": ["Refuse any ignored entry, report it", "Refuse ignored entries under plan.dir only", "Refuse outside a hook-output allowlist", "Decide later"], "escape": ["Decide later"], "stop": null, "scores": [{"label": "Refuse any ignored entry, report it", "score": 5, "reason": "Fails closed and the reported paths help diagnosis. But a hook cache from commit-msg or pre-push would make every release refuse, so the bug comes back quietly, and no data is protected that the later plain removal would not delete anyway."}, {"label": "Refuse ignored entries under plan.dir only", "score": 9, "reason": "It matches the new issue-planning condition-7 rule and reuses ignoredPathsAt, so an ignored plan is still protected. Its edge: hook residue no longer blocks the release, and every other ignored file is removed the same way as in any other removal."}, {"label": "Refuse outside a hook-output allowlist", "score": 3, "reason": "Hook output differs from repository to repository and cannot be known ahead of time, so the allowlist will be incomplete and brittle. It adds upkeep and still refuses unlisted caches, and it protects nothing beyond the plan.dir rule."}]}]
```

<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    1 |
| Security        |        0 |         1 |    1 |
| Data protection |        0 |         1 |    2 |
| Error cases     |        0 |         3 |    3 |
| Testability     |        0 |         1 |    3 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         1 |    1 |

### Findings

Internal review, 2026-11-27. All findings are incorporated.

- **Data protection, Important.** The helper deleted the only working copy on the strength of a
  local `commitOid`, and the claim of a local tracking ref was unverified. Incorporated by score:
  the released blobs are anchored under `refs/effective-flow/released/<RECORD_ID>/<tree>`.
- **Security, Important.** The release had no parent-directory proof. Incorporated:
  `realParents` runs before every rename and every put-back.
- **Error cases, Important.** The fallback depended on item details that many failures lack.
  Incorporated: after any call with `publishedPlans` that is not fully `ok`, a compare-and-set
  transition `active` → `aborted`/`plan-preserved` follows, and `STATUS_MISMATCH` is reported for
  cleanup.
- **Testability, Note.** No hook fired between the check and the rename. Incorporated: a new
  `beforePlanRelease` phase hook.
- **Error cases, Note.** A kill during the release was not covered. Incorporated as an edge case
  with its operator action.
- **Security, Note.** Path validation was wider than its purpose. Incorporated: canonical
  `plan.dir` and file name, forbidden segments, and `INVALID_INPUT` for `integrationRoot` or more
  than one record.
- **Error cases, Note.** An already-absent listed path had no defined outcome. Incorporated by
  score: it is proven absent and reported in `absentPaths`.
- **Testability, Note.** The failure path after the release had no criterion. Incorporated as an
  acceptance criterion.
- **Data protection, Note.** A plain removal could delete an ignored plan. This predates the
  change. Incorporated by score: every `issue-planning` removal refuses ignored entries under
  `plan.dir`.

Deep plan review, 2026-11-27. All findings are incorporated.

- **Error cases, Important.** The fallback override dropped the generic exemptions for items that
  report `removed: true`, and it misread `RECORD_NOT_FOUND`. Incorporated: such an item preserves
  nothing, and `RECORD_NOT_FOUND` means the worktree was withdrawn.
- **Maintainability, Important.** Documenting the release in the eagerly included
  `worktree-lifecycle.md` would grow several always-loaded cores. Incorporated by score: a new
  lazy fragment, `worktree-plan-release.md`. Only a pointer, the condition 7 sentence and one
  outcome row stay eager, and the affected budgets are re-measured.
- **Error cases, Important.** The leftovers rule lost plans when the fallback transition itself
  failed. Incorporated: leftovers are every plan written, minus those reported released or absent.
- **Testability, Important.** The issue's preserved end state was not tested. Incorporated: a
  helper-sequence test, plus a contract assertion for uncertain outcomes.
- **Architecture, Note.** The reused primitives cannot be imported as described. Incorporated:
  the extraction is named, covering the `indexFile`-aware runner, the standalone capture, the
  scratch index and the mapping of a `realParents` refusal.
- **Testability, Note.** The new code needs an outcome row and coverage in the contract test.
  Incorporated as an acceptance criterion.
- **Maintainability, Note.** The plan-name rule and the ignored-entry check were specified a
  second time. Incorporated: import `UNATTENDED_PLAN_NAME`, reuse `ignoredPathsAt`, resolve
  `plan.dir` from `RUNTIME_STATE_ROOT`, and fail closed on a mismatch.
- **Error cases, Note.** The ownership refusal contradicted the code. Incorporated: `NOT_OWNER`
  stays for a foreign session.
- **Data protection, Note.** A kept quarantine was invisible to the cleanup operator.
  Incorporated: one sentence in `cleanup.md`.
- **Scope, Note.** Refusing ignored entries across the whole worktree could make the release
  unreachable when hooks leave caches behind. Incorporated by score: ignored entries are refused
  only under `plan.dir` and at the listed paths' parents.

## Open points

- No open points.
