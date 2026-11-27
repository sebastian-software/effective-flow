# Remove plan-preserved planning worktrees whose plan is already archived on the base

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)
**Issue:** #812

## Requirement

`effective-flow cleanup` cannot remove a kept Issue Buddy `issue-planning` worktree (lifecycle
record `aborted`, reason `plan-preserved`) while that worktree holds its untracked plan file.
Removal condition 7 (clean working tree, `src/shared/worktree-lifecycle.md`, "Removal
eligibility") fails, and cleanup only tells the operator to move or discard the plan and run
cleanup again (`src/tools/cleanup.md`, legacy-class paragraph and Phase 6 retained-worktree
reasons). The preserved plan is often one that a later pull request implemented and archived on the
base branch as `<plan.dir>/archive/<same file name>` with status Implemented. Cleanup does not check
for that case, so the operator has to diff the two copies by hand, delete the file outside cleanup
and run cleanup a second time. At planning time this repository keeps 25 `aborted`/`plan-preserved`
planning worktrees, each holding exactly one untracked plan. For 10 to 12 of them, depending on how
far the local `origin/develop` has advanced, an Implemented archive copy with the same name already
exists.

Goal: a helper-verified proof `preserved-plan-superseded`.

- `cleanup plan` uses the proof to offer such a worktree as a removal candidate.
- `cleanup apply` re-proves under the record lock. In the same call it discards the one proven plan
  file and removes the worktree, with the existing `issue-planning` branch policy.
- The proof never deletes content that exists only on disk. Every preserved byte must be
  recoverable from the base: either the preserved blob is in the base history, or the archived copy
  contains the preserved text unchanged apart from its status line, extended at most by a completion
  report (scored decisions, see "Decided by score").
- Every other state keeps the worktree blocked by condition 7, as today.

Workflow recommendation: **Feature**. The change adds a new cleanup capability: a new helper proof,
a new item shape and a new confirmation. That changes user-visible behaviour. It is not a bug fix,
because the current blocking is the documented behaviour.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #812, planned against
`origin/develop` at 21b47e55d40580f5fce06b5efd7141188eac1280. No parent outcome is known.
**Original outcome:** cleanup removes a `plan-preserved` `issue-planning` worktree in one confirmed
apply call, after a re-proof under the record lock, when its preserved plan is proven superseded by
an Implemented archive copy on the base. Every other dirty state stays blocked by condition 7.
Fixture tests cover the passing proof and each failing case.
**Last evaluated attempt:** none (fresh baseline).
**No-progress count:** 0
**Cumulative approach:** one helper proof in the existing worktree lifecycle core, one pure
plan-completion predicate shared with the build-run core, one cleanup confirmation class, one lazy
cleanup fragment, and prose plus tests in the existing cleanup and lifecycle contracts.
**Continuation decision:** none.

## Architecture decisions

- **The proof lives in the existing worktree lifecycle core.** It goes into
  `src/scripts/effective-flow-state-worktree-core.mjs`, next to `preservedPlanRelease`, and runs on
  the same fact-gathering and eligibility path for plan and apply. No new runtime script is added,
  so `RUNTIME_SCRIPT_FILES` in `build.mjs` stays unchanged.
- **The proof requires an Implemented archive copy and a recoverable content match** (scored
  decisions S-CLR "Archive plus blob history" and S-BAT "Blob history or completion prefix"). It
  holds only when all of the following hold:
  1. The record is a `plan-preserved` `issue-planning` record whose worktree is present.
  2. Condition 7 is the only failed condition, there are no `blockers`, and condition 7 fails only
     because the porcelain status is not empty. A release quarantine, an ignored endpoint or a hidden
     edit is not involved.
  3. The worktree's status has exactly one entry. That entry is an untracked regular file directly
     in `<plan.dir>/` whose name matches `UNATTENDED_PLAN_NAME` (`src/scripts/plan-lint-core.mjs`).
     No ignored entry exists under `<plan.dir>/`.
  4. The base commit, read from the local remote-tracking ref of the resolved `delivery.baseBranch`
     without fetching, holds `<plan.dir>/archive/<same name>` as a regular blob. That blob has exactly
     one canonical status line, and the line says Implemented. "Exactly one canonical status line"
     means both of the following, so either definition failing blocks the proof:
     `classifyPlanText` reports the status, and the build-run status regex counts exactly one
     match.
  5. One of these two content matches holds:
     - **blob history:** the preserved file's raw blob OID equals the blob of `<plan.dir>/<name>` or `<plan.dir>/archive/<name>` in a
       commit reachable from the base commit.
     - **completion prefix:** the preserved copy has exactly one canonical open status line. With
       the status lines masked, the archived copy either equals the preserved copy or continues it
       with a remainder that starts with a `## Build completion` or `## Workflow-Abschluss`
       heading. Both texts must decode as
       valid UTF-8 (fatal decoding); otherwise the proof reports `content-diverged`, so
       replacement characters can never make two different byte sequences compare equal.

  The raw blob OID is computed from the same bounded, no-follow read that the identity check
  uses. Those bytes are piped to `git hash-object --stdin --no-filters` without `-w`, so the
  match is byte-identical and the hashed node is the node that was checked.

  The base squash-merges, so the blob-history match alone almost never holds: of 20 archived
  issue plans on `origin/develop`, only one ever had `<plan.dir>/<name>` in base history. The
  completion-prefix match holds for 3 of the kept worktrees above: issues 761, 770 and 783. The
  others diverged and stay blocked. Most of them diverged because the plan was revised in its pull
  request. Some differ only by formatter reflows, such as indentation or blank lines. A
  whitespace-insensitive match would break the requirement that every byte stays recoverable, so it
  stays out of scope. Two variants were
  rejected because they could delete an edited draft that exists nowhere else: a status-only proof,
  and a proof that accepts any open status.

- **The completion convention is stated once, in code.** The build-run recheck already enforces
  "preserve approved plan text and append only its completion report" (`normalizedPlan` and the
  `RECHECK_REQUIRED` checks in `src/scripts/build-run-core.mjs`). Extract that check into one pure
  exported predicate in `build-run-core.mjs`. The predicate first requires exactly one canonical
  status line on each side, counted by the build-run regex. It then requires that the status-masked
  later text equal the earlier text, or that the remainder after the earlier text start with a
  `## Build completion`/`## Workflow-Abschluss` heading. The worktree core already imports from that module.
  The build-run recheck and the new proof both call the predicate. The fatal UTF-8 check is an
  option of the predicate that only the proof sets, so build-run behaviour stays unchanged. Status
  classification still uses `classifyPlanText` from `plan-lint-core.mjs`, through a new import edge
  from the worktree core to that module. `plan-lint-core.mjs` is not edited, because it is an
  instrument file of the `build-context` eval suite.
- **Inputs come from the existing configuration resolution.** The base ref comes from
  `deliveryConfiguration` (`delivery.baseBranch`, its existing `origin/HEAD`/`main` fallback, and
  `isSafeBaseRef`). `deliveryConfiguration` is extended, or `resolveConfiguration` is read once more
  in the same call, to supply `plan.dir` (default `docs/plan`) and the visibility. Hidden visibility
  never satisfies the proof.
- **The item ID stays, the proof is explicit, and the digest binds it.** A proven record keeps
  `itemId: worktree:<RECORD_ID>` and gains `proof: "preserved-plan-superseded"` plus these evidence
  fields: `planPath`, `planBlob`, `archivePath`, `archiveBlob`, `match` (`blob-history` or
  `completion-prefix`), `baseRef` and `baseCommit`. Its `itemDigest` binds `planPath`, `planBlob`,
  `archivePath`, `archiveBlob` and `match`, but not `baseCommit` (scored decision S-DEC "Bind archive
  blob only"). The digest follows the `branch:` precedent: under the lock, the proof is re-derived
  on the current base and must find the confirmed `archiveBlob` at the archive path and the same
  match. An unrelated advance of `origin/<base>` therefore does not abort the whole apply call.
  `worktreeDigestInput` adds the fields only for proven items, so the digest of every existing item
  stays byte-identical. `requireItems` and `cleanup apply` accept a `worktree:` value as either a
  digest string or exactly `{"itemDigest", "proof": "preserved-plan-superseded"}`. A proven item
  given as a plain string, and an ordinary item given as the object, are both a `PREVIEW_MISMATCH`.
- **Condition 7 is waived only in the cleanup callers, never in `evaluateEligibility`.** Three
  callers waive it: `cleanupPlan`, `recomputeItem` and `claimAndRemove`, each called with
  `mergeGateRelease: true`. Each admits a record as actionable when its conditions are exactly `[7]`,
  its blockers are empty and the proof holds. `worktree remove`, `worktree inspect` and adoptions
  keep condition 7 unchanged. A proven `items[]` entry carries `conditions: []` and
  `waivedConditions: [7]`, so the agent prose never reads a failed condition on an actionable item.
- **Confirmation is a separate bulk ask** (scored decision S-CLR "Own bulk ask"). Proven items form
  their own dry-run class and get their own `Superseded plans` ask in cleanup Phase 5, with the
  options "Discard all proven", "Select individually" and "Keep all". The ordinary `Worktrees` ask
  excludes them, so "Remove all verified" never deletes an untracked plan file.
- **Discard order, with an early refusal that keeps the record's identity** (scored decision S-BAT
  "Restore on early refusal"). Under the record lock, `claimAndRemove` re-derives the facts and the
  proof, compares the digest and writes the claim. `removeClaimed` then runs these steps:
  1. **In-place check:** `lstat` the file and re-check its identity and raw blob at its path.
     **Restore boundary:** every outcome before the quarantine rename restores the exact pre-claim
     record (`aborted`/`plan-preserved`, without `cleanupRunId` and `claimedAt`) instead of
     writing `cleanup-failed`. That covers a refused check, the interrupt check at the start of
     `removeClaimed` and any thrown error, such as a Git failure, a timeout or a hook error. The item
     fails with nothing removed and reports `status: "aborted"` and `restored: true` with its cause
     code. A refused check is `PLAN_CHANGED`, an interrupt is `INTERRUPTED`, and a thrown error
     keeps its own code (`GIT_FAILED`, `WRITE_FAILED` or the timeout). Only a failed restore write
     falls back to `cleanup-failed`. A failed rename is inside the boundary: after re-verifying that
     the file is still at its path, the helper restores the record. If the file is no longer at its
     path, the item ends `cleanup-failed`.
  2. **Quarantine:** rename the exact file into a `RELEASE_QUARANTINE_PREFIX` entry in the worktree
     root. In the quarantine, compare dev/ino and the blob again, the same check
     `removeLegacyListing` makes.
  3. **Unlink:** unlink the quarantined file. A mismatch in the quarantine leaves the quarantine in
     place, so condition 7 keeps failing through `quarantineRetained`. The record reconciles to
     `cleanup-failed`, and the report names the quarantine path.
  4. **Recheck condition 7:** re-derive the full removal-time condition-7 fact set: `clean`,
     `quarantineRetained`, `ignoredEndpoints` and `hiddenChanges`. Do not re-run the whole
     eligibility evaluation, because the status is now `cleanup-in-progress` and condition 1 would
     fail. A failing recheck ends the item `cleanup-failed` with its reason. The plan is already
     gone, but it stays recoverable from the base, and the worktree is kept.
  5. **Remove:** run ordinary `git worktree remove` (never `--force`), the branch policy and the
     record deletion.

  A crash between the rename and the unlink leaves a `cleanup-in-progress` claim and a release
  quarantine. Both are reported as they are today: condition 7 fails through `quarantineRetained`,
  and the claim is reported with its owner. The bytes in the quarantine are kept.

  The plain `guardedUnlink` is not used. It is `guardTarget` plus a pathname unlink, and it admits
  only targets below `.effective-flow/`, while `worktree.baseDir` is configurable.

- **Rare-path prose is loaded lazily.** The Phase 4 listing detail and the mapping from a failed
  proof reason to the operator's next action go into a new lazy fragment,
  `src/shared/cleanup-superseded-plans.md`. Its `when:` is "a proven item, or a blocked record whose
  `supersededPlan.reason` is not `archive-missing`", which follows the `cleanup-branches` precedent.
  The common `archive-missing` case (a plan not yet implemented) keeps the eager Phase 6 next action,
  so most cleanup runs do not load the fragment. The `Superseded plans` ask stays
  eager, like `Branches`.
- **Issue Buddy stays unchanged.** Its Phase 1 next action ("move the plan out of the kept worktree
  or discard it, then cleanup removes the worktree", pinned by `test/issue-buddy-contract.test.mjs`)
  stays correct: discarding through cleanup is one way to discard.

## Affected files

| File                                                                                                               | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/effective-flow-state-worktree-core.mjs`                                                               | Header comment (preserved-plan release and apply value shapes). Proof derivation: one `-z` status call that includes ignored entries; file safety; raw blob OID; archive read; status check; bounded history match; completion-prefix match through the shared predicate. Proof attached to the facts. `cleanupPlan` emits proven items with `proof` and evidence, and blocked records with `supersededPlan.reason`. `worktreeDigestInput` binds the proof for proven items only. `requireItems`, `recomputeItem` and `cleanupApply` handle the object form. `claimAndRemove`/`removeClaimed`: re-proof, in-place check with restore, quarantine discard, condition-7 recheck, removal. Apply result `discardedPlan`. Sandbox preflight extended to the plan directory and the quarantine location in the worktree.   |
| `src/scripts/build-run-core.mjs`                                                                                   | Extract the existing completion check (status-masked prefix plus an optional `## Build completion`/`## Workflow-Abschluss` suffix) into one pure exported predicate, and use it in the existing recheck. No behaviour change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/tools/cleanup.md`                                                                                             | Frontmatter `description` (superseded case). Workflow call shape and result text (`proof`, `supersededPlan`, object form for proven `worktree:` items). Legacy-class paragraph on kept `issue-planning` worktrees. Phase 4: the new class and a lazy-include pointer. Phase 5: new `Superseded plans` ask; the `Worktrees` ask narrowed to unproven candidates. Phase 6: retained reason, the cleanup-only-claims sentence and the apply-outcome list (restored items). `contextBudget` re-measured from `node build.mjs`.                                                                                                                                                                                                                                                                                            |
| `src/tools/deliver.md`, `src/tools/apply-review-commit-mechanics.md` (and every other tool whose built core grows) | They include `worktree-lifecycle.md` eagerly, so the new rows add lines to their built core. Re-measure `contextBudget` from `node build.mjs`. Keep the lifecycle additions to the new rows and one sentence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/shared/cleanup-superseded-plans.md`                                                                           | New lazy fragment: how proven items are listed (worktree, plan path, archive path, base ref, match), and each `supersededPlan.reason` with its safe next action. A multi-plan worktree is reported as `dirty-entries`. For `content-diverged`, the next action is to diff the two copies: formatting-only differences are common, and such a copy can be discarded by hand.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/shared/worktree-lifecycle.md`                                                                                 | Apply outcome table: rows for the restored item (`restored: true` with `PLAN_CHANGED`, `INTERRUPTED` or the thrown code, record back at `aborted`/`plan-preserved`), next to the existing rows that reconcile an interrupt or an in-flight claim to `cleanup-failed`. Transition table: add `aborted` `plan-preserved` `issue-planning` → `cleanup-in-progress` (claim inside `cleanup apply` only; it fills the gap the table already has for that claim) and `cleanup-in-progress` → `aborted` `plan-preserved` (restore by the claiming call while the plan is still in place). "Removal eligibility": cleanup's confirmed `preserved-plan-superseded` claim discards exactly the proven plan file under the lock, and the removal-time condition-7 facts must then hold fresh. The fully-gone route is unchanged. |
| `docs/developer-guide/architecture.md`                                                                             | Around line 544: a kept `issue-planning` worktree also becomes removable through the proof.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `test/effective-flow-state-worktree.test.mjs`                                                                      | New fixture tests (see Validation plan), next to "cleanup removes a kept issue-planning worktree with a preserved plan once the plan is gone". Its invariant comment ("cleanup never discards a plan") is rewritten to the new invariant. Fixture helpers stay in this file, or go to a new `test/support/` module if they grow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `test/workflow-contracts.test.mjs`                                                                                 | The pass-record contract test (around lines 29460–29484) pins the Phase 6 phrase "move the plan out of the worktree or discard it, then rerun cleanup, which offers the worktree for removal" and states that cleanup reaches a kept worktree only after the operator moved or discarded the plan. Update the pinned phrase and the invariant comment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `test/worktree-lifecycle-contract.test.mjs`                                                                        | Adjust or extend the prose assertions on cleanup and lifecycle text this change edits. Pin both new transition-table rows. Each assertion names the invariant it protects.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `test/build-run.test.mjs` (and the other existing `test/build-run-*.test.mjs` suites)                              | Only if needed: a direct test of the extracted predicate. The existing completion-recheck tests must pass unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Implementation details

### Approach

1. **Shared predicate.** In `build-run-core.mjs`, extract the status-masking and completion-suffix
   check into a pure exported function that takes the earlier and the later plan text. Switch the
   existing recheck to it without changing behaviour.
2. **Proof inputs.** Resolve `<plan.dir>`, the visibility and the base ref once per
   `cleanup plan`/`cleanup apply` call (see "Architecture decisions"). Hidden visibility, an unsafe
   or unset base ref, or a missing `refs/remotes/origin/<baseRef>` makes the proof unavailable, with
   a reason. The ref is resolved to a commit by a verify-only `rev-parse`. No fetch runs.
3. **Gate.** Derive the proof only for a record that `preservedPlanRelease` admits, whose worktree
   is present, and whose eligibility result is exactly `conditions: [7]` with empty `blockers`. Its
   removal-only condition-7 facts must also be clean.
4. **Dirty entry.** Run one `git status --porcelain=v1 -z --untracked-files=all --ignored=matching
--ignore-submodules=none` in the proven worktree through the bounded runner. Require exactly one
   `??` entry, a path with exactly one segment below `<plan.dir>/` that matches
   `UNATTENDED_PLAN_NAME`, and no `!!` entry under `<plan.dir>/`. `lstat` the path without following
   links, and require a regular file inside the canonical worktree path.
5. **Preserved content.** Read the file under the existing size bounds and compute its raw blob OID
   without filters and without writing an object.
6. **Archive copy.** On the base commit, list `<plan.dir>/archive/<name>` with a literal pathspec.
   Require exactly one regular-blob entry: not a symlink, not a gitlink. Read it and require
   `classifyPlanText(...).status === 'implemented'`.
7. **Content match.** First try the completion prefix: `classifyPlanText(preserved).status ===
'open'`, both texts decode as valid UTF-8, and the shared predicate accepts the preserved text
   against the archived text. The predicate's own count requires exactly one canonical line on
   each side. If that
   fails, run one bounded history query from the base commit. The query is limited to the literal
   paths `<plan.dir>/<name>` and `<plan.dir>/archive/<name>`, with renames disabled and full blob
   OIDs, and it looks for the preserved blob OID among the recorded post-images. A timeout or a Git
   failure is `proof-unavailable`, never a pass.
8. **Time budget.** Proofs run inside `cleanupPlan`'s existing deadline and before the branch
   proofs. Their budget is `min(SUPERSEDED_PLAN_PROOF_BUDGET_MS, remaining − BRANCH_PROOF_BUDGET_MS)`.
   `remaining` is the time left before `DEFAULT_DEADLINE_MS`. The constant is overridable through
   `deps.supersededPlanProofBudgetMs`. This formula keeps the branch proofs' full
   `BRANCH_PROOF_BUDGET_MS`, which is the measurable floor. Records not reached before the budget runs
   out report `proof-unavailable`. On the apply side, both re-proofs of each item (the pre-write pass
   and the one under the lock) run inside the existing apply deadline. An item the deadline cuts off
   reports `DEADLINE_REACHED`, as today.
9. **Plan output.** A holding proof makes the record an `items[]` entry with the unchanged
   `itemId`, the `proof`, the evidence fields and the extended `itemDigest`. A failing proof leaves
   the record in `blocked[]` with `conditions: [7]` and `supersededPlan: {reason}`. The reason comes
   from a closed vocabulary. The first failing check in this evaluation order wins: `hidden-mode`,
   `base-unavailable`, `dirty-entries`, `not-plan-file`, `unsafe-plan-file`, `archive-missing`,
   `archive-not-implemented`, `content-diverged`. A Git failure or timeout at any of these steps
   reports `proof-unavailable`. A record with any other failed condition gets no `supersededPlan` field. The
   same holds for a record whose condition 7 fails through a release quarantine, an ignored
   endpoint or a hidden edit.
10. **Apply.** `requireItems` admits the object form. `recomputeItem` and `claimAndRemove`
    re-derive the facts and the proof, compare the digest, and enforce the form rules. Then follow
    the discard order under "Architecture decisions", including the restore on an early refusal.
    The item result adds `discardedPlan: <planPath>`.
11. **Preflight.** Extend `preflightDirectories` to probe the `<plan.dir>` directory and the
    worktree root that the quarantine rename writes, for proven items only.
12. **Prose.** Update `cleanup.md`, add `cleanup-superseded-plans.md`, and update
    `worktree-lifecycle.md`, the core's header comment and `architecture.md`. State each contract
    once, in its owning fragment.
13. **Tests and budget.** Add the tests and update the prose contract tests. Run `node build.mjs`,
    then set the `contextBudget` of `cleanup.md`, `deliver.md`, `apply-review-commit-mechanics.md` and
    every other tool the report flags from its "Always-loaded core (lines/budget)" report, with at
    most ten lines of headroom.

### Component structure

Not relevant. The change has no UI components. It is a helper proof and workflow prose.

### State management

The lifecycle record schema (`RECORD_KEYS`) is unchanged. The proof is derived fresh from Git and
the working tree on every plan and apply call, and is never persisted. Transitions:

- claim (`cleanup-in-progress`), then removal;
- a refusal while the bytes are still in place restores `aborted`/`plan-preserved`, which is new
  and stays under the same lock;
- any later failure follows the existing `cleanup-failed` reconciliation.

### API integration

Not relevant. There is no forge or network call. Every Git read is local and bounded, and no fetch
runs.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **Extra untracked or modified entries:** a second file, a tracked edit, a staged change, a rename,
  a submodule change, or an ignored entry under `<plan.dir>/` → `dirty-entries`, blocked. A
  batch-pass worktree with several preserved plans always lands here.
- **The single entry is not a plan file:** it is outside `<plan.dir>/`, nested below it, not `.md`,
  or not a canonical issue-plan name → `not-plan-file`, blocked.
- **The plan path is unsafe:** a symlink, a directory, a non-regular entry, or a path that escapes
  the worktree → `unsafe-plan-file`, blocked.
- **No usable base:** no local remote-tracking base ref, an unsafe base ref, or a configuration
  failure → `base-unavailable`, blocked. A stale ref can only produce a false "not superseded",
  never a false pass.
- **No archive copy:** no archive copy with the same name (including when only a collision-suffixed
  name exists), or the copy is a symlink or gitlink → `archive-missing`, blocked.
- **Archive copy not Implemented:** its status is Not implemented, unclear (missing, duplicated,
  mixed) or invalid → `archive-not-implemented`, blocked.
- **Content diverged:** the preserved text was revised before archiving, or the archive appends
  something other than a completion section, and no blob-history match exists →
  `content-diverged`, blocked.
- **Git failure:** a Git call fails or times out, or the proof budget runs out →
  `proof-unavailable`, blocked.
- **Hidden visibility** → `hidden-mode`, blocked.
- **The file changes between plan and apply, before the claim:** the digest or identity re-check
  fails → `PREVIEW_MISMATCH`, and nothing is written.
- **The file changes after the claim, while still in place:** the record is restored to
  `aborted`/`plan-preserved`, and nothing is removed.
- **The file changes after the rename into the quarantine:** the quarantine is kept, the record
  becomes `cleanup-failed` with the quarantine path, and the bytes are kept.
- **The plan file is already gone at apply time:** the confirmed proof object is a
  `PREVIEW_MISMATCH`. A fresh `cleanup plan` offers the record as an ordinary candidate.
- **Another condition fails too** (locked, prunable, lock held, branch changed): no proof is derived,
  and the condition report is unchanged.
- **Fully gone worktree:** the existing gone route applies, and no proof is derived.
- **Ignored files elsewhere in the worktree:** the existing behaviour is unchanged. `git worktree
remove` without `--force` deletes ignored files, which is why the core's ignored-endpoint check
  exists for `partial-diff` records. The proof refuses only ignored entries under `<plan.dir>/`.
- **Condition 7 fails only through a quarantine, ignored endpoint or hidden edit:** no proof is
  derived and no `supersededPlan` field is set. The existing condition report is unchanged.
- **Interrupt or thrown error after the claim, before the quarantine rename:** the record is
  restored to `aborted`/`plan-preserved`, and nothing is removed.
- **Many proven items:** one bulk ask covers them, and each item is still re-proven under its own
  lock.

## Acceptance criteria

- [ ] For a `plan-preserved` `issue-planning` worktree whose only dirty entry is its plan, whose base
      has `<plan.dir>/archive/<same name>` with status Implemented, and whose preserved copy matches
      by completion prefix or by blob history, `cleanup plan` returns a `worktree:<RECORD_ID>` item
      with `proof: "preserved-plan-superseded"`, `match` and the evidence fields.
- [ ] `cleanup apply` with `{itemDigest, proof: "preserved-plan-superseded"}` removes that plan file
      and the worktree in one call, after re-proving under the record lock. It deletes the record,
      reports the `issue-planning` branch-policy outcome and names `discardedPlan`.
- [ ] `cleanup apply` rejects, with `PREVIEW_MISMATCH` and without removing anything, both a proven
      item given as a plain digest string and an ordinary `worktree:` item given with a proof
      object.
- [ ] Each failing reason keeps the record in `blocked[]` with `conditions: [7]` and its named
      `supersededPlan.reason`, and removes nothing. The reasons are `dirty-entries` (including an
      ignored entry under `<plan.dir>/`), `not-plan-file`, `unsafe-plan-file`, `base-unavailable`,
      `archive-missing`, `archive-not-implemented`, `content-diverged` (including invalid UTF-8),
      `proof-unavailable` (an injected Git failure, and an exhausted
      `deps.supersededPlanProofBudgetMs`, with the branch proofs still given their full
      `BRANCH_PROOF_BUDGET_MS`) and `hidden-mode`.
- [ ] A plan file changed between `cleanup plan` and `cleanup apply` yields `PREVIEW_MISMATCH`. A
      change injected after the claim (the existing `afterClaim` phase hook), an interrupt after the
      claim, or an injected Git failure during the in-place check each restore the record to
      `aborted`/`plan-preserved`. Each reports `restored: true` with `PLAN_CHANGED`, `INTERRUPTED` or
      `GIT_FAILED`. In every case the file and the worktree stay.
- [ ] An advance of the local `origin/<base>` between plan and apply that keeps the same archive
      blob does not yield `PREVIEW_MISMATCH`, and the item is removed. A changed archive blob yields
      `PREVIEW_MISMATCH`.
- [ ] Given several failing checks at once, the first failing reason in the stated evaluation order is
      reported.
- [ ] Output and digests for every record that is not `plan-preserved` stay byte-identical. The
      existing preserved-plan, merge-gate and build-run completion tests pass. The only changes to
      them are updated invariant comments and pinned phrases.
- [ ] `src/tools/cleanup.md` has a `Superseded plans` ask for proven items, and its `Worktrees` ask
      no longer covers them. `worktree-lifecycle.md` states the discard-then-condition-7 rule once.
- [ ] CI's order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs` (including the
      `cleanup.md` context-budget guard) and `pnpm test:distribution`.

## Validation plan

- **Targeted:** `node --test test/effective-flow-state-worktree.test.mjs`, run through
  `t3-project`. New fixture cases:
  - the completion-prefix pass (the archive equals the preserved copy, or extends it with a
    `## Build completion` section) and the blob-history pass, each from plan through apply;
  - each failing reason from "Edge cases";
  - another failed condition together with a superseded plan;
  - the plain-digest and proof-object mismatches;
  - a plan changed between plan and apply;
  - an `afterClaim` change, an interrupt after the claim, and an injected Git failure during the
    in-place check, each of which restores `plan-preserved`;
  - a proof-budget exhaustion through the `deps` override;
  - a quarantine-only condition-7 failure that gets no `supersededPlan` field;
  - invalid UTF-8 in the preserved copy;
  - a failing condition-7 recheck after the unlink, which ends `cleanup-failed` with the worktree
    kept;
  - a base advance with the same archive blob, and one with a changed archive blob;
  - a combination of failing checks, to test the evaluation order;
  - a quarantine mismatch that leaves `cleanup-failed` with the quarantine kept.

  The fixtures build a local `refs/remotes/origin/<base>` history with `update-ref` and no network
  remote: a squash-style commit that only adds the archived copy, plus a merge-style history for the
  blob-history case.

- **Build-run:** the existing build-run completion tests pass unchanged after the predicate
  extraction.
- **Contract:** `node --test test/workflow-contracts.test.mjs test/worktree-lifecycle-contract.test.mjs
test/context-budget.test.mjs test/issue-buddy-contract.test.mjs`. The Issue Buddy suite stays
  unchanged.
- **Full:** CI's order, `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`,
  through `t3-project`.
- **Eval evidence:** `pnpm eval build-context verify`, `pnpm eval merge-gate verify` and
  `pnpm eval iterate verify` show the freshness debt this change creates. Their suite configurations
  seed `src/tools/*`/`src/scripts/*` or `effective-flow-state-worktree-core.mjs`. Record the debt as
  visible debt in the delivery, per the pragmatic test and release policy. No instrument file
  changes, because `plan-lint-core.mjs` is not edited.
- **Manual:** on this checkout, `cleanup plan` reports every kept `plan-preserved` worktree that has a
  same-name archive copy on the local base ref either as a proven item or as `content-diverged`. At
  planning time those would be issues 761, 770 and 783 as proven items. All the others would be
  diverged. After
  "Discard all proven", the proven worktrees, their records and their `issue-planning/<passId>`
  branches are gone.

## Assumptions and open points

- Assumption (verified): the lifecycle record has no plan path, base ref or `plan.dir`
  (`RECORD_KEYS`), so the proof resolves `<plan.dir>` and the base ref from configuration at cleanup
  time.
- Assumption (verified): `classifyPlanText` and `UNATTENDED_PLAN_NAME` are pure exports of
  `plan-lint-core.mjs`. Importing them adds one new edge from the worktree core to that module. The
  edge is harmless: `plan-lint-core.mjs` stays unedited, and the `iterate` and `merge-gate` suites
  already seed it. The worktree core already imports from `build-run-core.mjs`, so the shared
  predicate adds no edge.
- Assumption (verified): `guardedUnlink` (`runtime-state-guard.mjs`) is a guard plus a pathname
  unlink, limited to `.effective-flow/` targets, so it cannot serve the discard. The plan uses the
  quarantine pattern instead.
- Assumption (verified on this checkout): of the 25 kept `plan-preserved` worktrees, 10 to 12 have
  an Implemented archive copy on the local `origin/develop` (the ref advanced during planning).
  3 of those pass the completion-prefix match, and the rest diverge, some only by formatting. These
  figures depend on the local ref state.
- Assumption: Issue Buddy's leftover wording and its contract test stay unchanged. Pointing them at
  the new proof is out of scope.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[
  {
    "site": "S-CLR",
    "question": "Which proof strictness should preserved-plan-superseded require before cleanup deletes the preserved plan file?",
    "options": ["Archive name and status", "Archive plus blob history", "Archive plus blob history or open status"],
    "escape": [],
    "stop": null,
    "scores": [
      { "label": "Archive name and status", "score": 2, "reason": "It never looks at the preserved bytes, so it can permanently delete a copy Issue Buddy preserved because it was changed, ambiguous, earlier or failed, whose content may exist nowhere else." },
      { "label": "Archive plus blob history", "score": 9, "reason": "Only option guaranteeing the deleted bytes are recoverable from base history while still covering the published-then-archived case; its edge over the open-status variant is that it never deletes content found only on disk." },
      { "label": "Archive plus blob history or open status", "score": 5, "reason": "Matches the issue's conservative wording, but the open-status branch deletes a Not implemented copy whose bytes differ from every committed version, reopening the irreversible-loss gap for little extra coverage." }
    ]
  },
  {
    "site": "S-CLR",
    "question": "How should cleanup confirm removal of a worktree whose preserved plan is proven superseded?",
    "options": ["Own bulk ask", "Per-item ask", "Inside Worktrees ask"],
    "escape": [],
    "stop": null,
    "scores": [
      { "label": "Own bulk ask", "score": 8, "reason": "Follows the Branches precedent for proof-backed items and keeps consent to delete an untracked file separate from ordinary worktree removal, while still handling 25 items with one bulk choice." },
      { "label": "Per-item ask", "score": 4, "reason": "Clearest per-item consent, but 25 accumulated worktrees force 25 confirmations, and the per-item pattern is meant for liveness-judged claims, not helper-proven items." },
      { "label": "Inside Worktrees ask", "score": 6, "reason": "Cheapest and follows how merge-gate and schema-invalid records joined the Worktrees ask, but Remove all verified would then delete untracked plan files without a separate choice." }
    ]
  },
  {
    "site": "S-BAT",
    "question": "Given squash-merged bases, which content match should the preserved-plan-superseded proof accept besides the Implemented archive copy?",
    "options": ["Blob history only", "Blob history or completion prefix", "Completion prefix or any remote-ref blob"],
    "escape": [],
    "stop": null,
    "scores": [
      { "label": "Blob history only", "score": 3, "reason": "Safest recoverability, but on this squash-merged base roughly 0 of the 11 archived cases pass, so the proof barely ever fires and issue #812 stays unsolved in practice." },
      { "label": "Blob history or completion prefix", "score": 8, "reason": "Reuses the existing build-run normalizedPlan check, keeps every preserved byte except the status value recoverable from base, and unblocks 3 of 11 real cases. The 8 revised plans stay safely blocked." },
      { "label": "Completion prefix or any remote-ref blob", "score": 4, "reason": "Gains little over option 2 because plan PR branches are deleted after merge. Pruned remote-tracking refs make recovery fragile, and a rev-list --objects --remotes scan per record is costly." }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How should a discard refusal at apply time be handled so the record keeps its plan-preserved identity?",
    "options": ["Verify before claim", "Restore on early refusal", "Keep cleanup-failed"],
    "escape": [],
    "stop": null,
    "scores": [
      { "label": "Verify before claim", "score": 6, "reason": "Refusal needs no record write, but the worktree is changed before the claim. A crash or lost lock after the rename leaves a quarantine that no claim records, and the move back can fail too." },
      { "label": "Restore on early refusal", "score": 8, "reason": "Keeps the plan's order (proof, claim, discard) and the claim-before-mutation rule. A refusal while the bytes are still in place restores aborted/plan-preserved, so Issue Buddy still lists the plan." },
      { "label": "Keep cleanup-failed", "score": 3, "reason": "Simplest, but a refusal means the user's live, changed plan loses plan-preserved. Issue Buddy Phase 1 and preservedPlanRelease then ignore it, the identity loss the question wants to avoid." }
    ]
  },
  {
    "site": "S-DEC",
    "question": "Should the proven superseded-plan item's digest bind baseCommit?",
    "options": ["Bind baseCommit", "Bind archive blob only"],
    "escape": [],
    "stop": null,
    "scores": [
      { "label": "Bind baseCommit", "score": 4, "reason": "It is safe, but any routine origin/<base> fetch between plan and apply aborts the whole call with PREVIEW_MISMATCH, legacy, branch and worktree items included, even though safety is re-derived under the lock." },
      { "label": "Bind archive blob only", "score": 9, "reason": "It follows the branch-class precedent (base commit left out of the digest, re-checked against the current base) and still binds the confirmed bytes; unlike binding baseCommit, an unrelated fetch no longer aborts the whole call." }
    ]
  }
]
```

<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    0 |
| Security        |        0 |         0 |    1 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         2 |    4 |
| Testability     |        0 |         0 |    3 |
| Scope           |        0 |         0 |    2 |
| Maintainability |        0 |         0 |    3 |

### Findings

The gap analysis (Phase 4) happened before this review, and its findings are already in the plan:

- the strict proof almost never holds on the squash-merging base, which led to the scored
  completion-prefix match;
- `guardedUnlink` cannot serve the discard, so the plan uses the quarantine pattern;
- a post-claim refusal lost the `plan-preserved` identity, which led to the scored restore;
- `requireItems`, the pinned contract phrase in `test/workflow-contracts.test.mjs`, the full eval-debt
  list, the correct ignored-file behaviour and the preflight scope were missing.

The internal review findings below are all incorporated:

- **Error cases, Important:** the restore boundary covered only a refused in-place check. It now
  covers every outcome before the quarantine rename, including an interrupt and a thrown error. Only
  a failed restore write falls back to `cleanup-failed`. Tests were added.
- **Architecture, Important:** the new claim and restore transitions were missing from the
  lifecycle transition table. Both rows are now in the `worktree-lifecycle.md` change and pinned in
  the contract test.
- **Error cases, Note:** the post-discard re-check now re-derives the full removal-time condition-7
  fact set, matching the lifecycle wording.
- **Security, Note:** the blob OID is now hashed from the same bounded no-follow read as the identity
  check (`hash-object --stdin --no-filters`).
- **Data protection, Note:** the completion-prefix match now requires valid UTF-8 on the proof side,
  so replacement characters cannot hide differing bytes.
- **Testability, Note:** the proof budget is now a named constant with a `deps` override, and a test
  covers budget exhaustion.
- **Error cases, Note:** a record that fails condition 7 only through a quarantine, an ignored
  endpoint or a hidden edit now explicitly gets no `supersededPlan` field, and a test covers it.
- **Scope, Note:** the worktree counts have been corrected to 25 kept, 10 archived, 3 proven and
  7 diverged. The manual check is now worded relative to the local base ref.
- **Maintainability, Note:** the plan now states the new import edge to `plan-lint-core.mjs`
  (harmless) and requires both status-line definitions. The lazy fragment's `when:` was narrowed, so
  the common `archive-missing` case does not load it.

### Deep review (2026-11-27)

These findings came from the deep plan review. All of them are incorporated, and none is Critical.
The summary above counts both rounds.

- **Architecture, Important:** the plan did not say where condition 7 is waived for a proven item.
  Without that, `recomputeItem` and `claimAndRemove` would reject every proven item. The waiver now
  lives only in the three cleanup callers, never in `evaluateEligibility`. A proven item carries
  `conditions: []` and `waivedConditions: [7]`.
- **Error cases, Important:** a restored item had no result code, and the restore contradicted the
  apply outcome table. The causes are now `PLAN_CHANGED`, `INTERRUPTED` and the thrown code, each
  reported with `restored: true`. Rows are added to the outcome table and to the apply-outcome list
  in `cleanup.md`, and the tests assert the codes.
- **Error cases, Note:** the plan now states the outcomes of three cases: a failing post-unlink
  recheck (`cleanup-failed`, worktree kept), a failed rename (inside the restore boundary), and a
  crash between the rename and the unlink (claim and quarantine reported, bytes kept).
- **Testability, Note:** the proof budget is now `min(constant, remaining − BRANCH_PROOF_BUDGET_MS)`,
  which gives the branch proofs a measurable floor. Both apply-side re-proofs run inside the
  existing apply deadline.
- **Error cases, Note (decision, scored S-DEC "Bind archive blob only"):** the digest no longer
  binds `baseCommit`. The archive blob is re-checked on the current base, following the `branch:`
  precedent, and tests cover both base-advance cases.
- **Scope, Note:** the reason given for diverged copies was corrected. Some copies differ only by
  formatting, and the `content-diverged` next action now says to diff the two copies. Counts are now
  given as ranges, because the local ref advanced during planning.
- **Testability, Note:** the failing reasons now have a single evaluation order, with a combination
  test.
- **Maintainability, Note:** the shared predicate now includes the exactly-one-status count on each
  side. The suffix rule is now worded as "the remainder starts with the heading".
- **Maintainability, Note:** `deliver.md` and `apply-review-commit-mechanics.md` include the
  lifecycle fragment eagerly. Their context budgets are now in the affected files and in step 13.

## Open points

- No open points.

## Build completion

### Requirement

`effective-flow cleanup` now removes a kept Issue Buddy `issue-planning` worktree
(`aborted`/`plan-preserved`) whose only dirty entry is its untracked plan, once a helper-verified
`preserved-plan-superseded` proof shows that the base holds an Implemented archive copy that keeps
every preserved byte recoverable. Every other dirty state stays blocked by condition 7.

### Architecture decisions

Implemented as planned, with these deviations:

- The new cleanup ask uses the header `Superseded`, because the build caps ask headers at 12
  characters. The question and options are unchanged.
- The proof is stricter than the plan on status: the archive copy's single canonical status line
  must say Implemented, and the preserved copy's must say Not implemented.
- Plan files are read with the 512 KiB bound plan-lint uses. An oversized preserved plan is
  `unsafe-plan-file` and an oversized archive copy is `archive-not-implemented`; the fragment names
  the bound.
- An `ENOENT` preflight probe of the plan directory or worktree root at apply time is
  `NOT_ELIGIBLE` with reason `plan-directory-missing`, not `SANDBOX_DENIED`.
- A refusal before the quarantine rename restores the pre-claim record. An error that is not a
  per-item error is then rethrown and ends the call, with the restored item reported.
- The plan directory is re-checked as its own canonical path right before the rename. A narrow
  path race between that check and the rename remains; Node has no `renameat`. It can only reach
  bytes the base already holds.

### Affected files

- `src/scripts/effective-flow-state-worktree-core.mjs`: proof derivation, proven items, digest
  binding, object-form apply values, re-proof under the lock, restore boundary, quarantine
  discard, condition-7 recheck.
- `src/scripts/build-run-core.mjs`: shared predicates `planCompletionMismatch` and
  `canonicalPlanStatusLines`; the build-run recheck uses them unchanged.
- `src/tools/cleanup.md`, `src/shared/cleanup-superseded-plans.md` (new lazy fragment),
  `src/shared/worktree-lifecycle.md`.
- `src/tools/deliver.md`, `src/tools/apply-review-commit-mechanics.md`: `contextBudget` only
  (cleanup 1063, deliver 834, apply-review-commit-mechanics 697).
- `docs/developer-guide/architecture.md`, `docs/user-guide/tools-setup.md`,
  `docs/user-guide/troubleshooting.md`.
- `test/effective-flow-state-worktree.test.mjs`, `test/build-run.test.mjs`,
  `test/workflow-contracts.test.mjs`, `test/worktree-lifecycle-contract.test.mjs`.

### Implementation details

Plan steps 1–13 are implemented. The proof budget is `SUPERSEDED_PLAN_PROOF_BUDGET_MS` (30 s),
which `deps.supersededPlanProofBudgetMs` can override, and the branch proofs keep their full
budget. Proven items carry `proof`, the evidence fields, `conditions: []` and
`waivedConditions: [7]`. Their digest binds the plan and archive blobs and the match, not the base
commit.

### Test results

- **Full suite at the Phase 5 tree:** `pnpm test` ran 7046 tests: 6959 pass, 1 fail, 1 cancelled
  and 85 skipped. Both failures are load timeouts in untouched files, proven pre-existing by a
  base run: `test/host-driver.test.mjs` (portable host-driver Python tests) and
  `test/merge-gate-eval-round-lifecycle.test.mjs`.
- **Other checks at the Phase 5 tree:** `pnpm test:preflight`, `node build.mjs` and
  `pnpm test:distribution` passed.
- **After the review corrections (targeted):** 839 of 839 tests passed in
  `test/effective-flow-state-worktree.test.mjs`, `test/worktree-lifecycle-contract.test.mjs`,
  `test/workflow-contracts.test.mjs`, `test/context-budget.test.mjs` and
  `test/issue-buddy-contract.test.mjs`. `node build.mjs` and `pnpm test:distribution` passed.
- **`pnpm agent:check`:** it flagged only this plan file, which was unformatted on the base. It is
  formatted at completion.
- **Eval evidence:** `pnpm eval build-context|merge-gate|iterate verify` found no integrity
  blockers. They report freshness debt, which this change leaves as visible debt.

## Review findings

**Date:** 2026-11-27
**Reviewer:** effective-flow-nodejs-reviewer

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    13 |
| Open / Not implemented |     0 |

All 13 findings were Notes: ten from the first review and three from the re-check of the
corrections. A floor-hit check confirmed every fix with no new findings.
