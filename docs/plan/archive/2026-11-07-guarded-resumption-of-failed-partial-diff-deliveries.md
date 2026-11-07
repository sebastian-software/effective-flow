# Guarded resumption of failed partial-diff deliveries

**Plan status:** Implemented
**Source:** sebastian-software/effective-flow #626 (planning comment)
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

A `deliver` run that fails after at least one successful commit group leaves a retained `partial-diff` worktree, branch, and uncommitted residual groups behind, and there is no supported way to continue. This issue adds two things:

- A dedicated, guarded **partial-diff resume adoption**. It reactivates exactly that retained worktree and continues only the unfinished groups. While the original evidence is unchanged, it does not ask for selection approval again.
- A guarded **release route** for retained `partial-diff` records that cannot be resumed. The route makes such records removable by `cleanup`.

This is a Feature: it adds a new lifecycle capability, namely a new adoption mode, a release transition, and durable delivery progress evidence. The existing adoption path deliberately refuses `partial-diff`, and a test pins that refusal.

Clarified decisions (maintainer, 2026-11-06):

- **Route.** A separate adoption mode for `partial-diff`/`deliver`, selected by an explicit input discriminator. Plan-PR continuation adoption keeps its current behavior.
- **Evidence.** `deliver` persists a progress ledger in private runtime state, so a resume also works from a new session.
- **Scope.** A resume requires at least one commit group that is provably on the branch, counted after tip recovery. A failure before the first commit keeps today's behavior, and release stays available.
- **Unrecorded tip commit.** A resume may prove and record at most one tip commit that was created but not yet recorded. This covers a helper failure after `git commit` but before its result was accepted, for example #624.
- **Commit-hook failure.** A resume accepts an index whose staged set and tree equal exactly the first uncommitted group. Any other staged content is refused.
- **Source check.** The resume checks source HEAD and the selected entries against the stored manifest (`verifySourceManifest`). Unselected paths may change in the meantime, as in any delivery. §4.5, the §5 receipts, and the §7 final comparison use a fresh source snapshot taken at resume time.
- **Validation.** Repository pre-commit validation (§4.3) and a resume-mode reconcile (§4.4) run again before the remaining groups.
- **Release.** With a valid ledger, release discards the residual only under proof. Three conditions must hold:
  - The dirty set equals the ledger's residual descriptors exactly.
  - `verifySourceManifest` is exact, so the content still exists in the source.
  - Condition 6 holds.

  Release then restores exactly those paths and moves the record to `cleanup-ready`. `cleanup` removes the worktree and ledger and keeps the branch. Without a ledger, release is allowed only for a clean worktree, or one whose directory or registration is already gone. For a dirty worktree it lists the exact residual paths instead.

- **Visibility switch.** If the ledger says `visible` but the current mode is hidden, the resume is refused and release is offered.
- **Ledger size.** Above a concrete bound, no ledger is written. The run shows one notice ("resume unavailable for this run") and the delivery continues unchanged.
- **Delivery shape.** Everything ships in one delivery with ordered commit groups:
  1. ledger plus release;
  2. resume adoption plus resume reconcile;
  3. the `deliver` resume entry plus docs.

## Outcome checkpoint

**Primary source:** sebastian-software/effective-flow #626
**Original outcome:** A failed `partial-diff` delivery can be resumed through a documented, helper-enforced route when at least one commit group is provably on the branch (including one recovered unrecorded tip). The route preserves the confirmed selection and the existing commits, revalidates source and residual content, reruns the validation gates, and commits only the remaining groups. Drift, a visibility downgrade, or unprovable ownership blocks resumption. A record that cannot be resumed has a supported, proof-guarded release route that leads to normal cleanup.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** The approach has five parts:

- an explicitly selected resume adoption and a release transition in the worktree lifecycle helper;
- a ledger with helper-computed descriptors, an immutable part and an append-only part;
- a resume-mode reconcile that reads the ledger itself;
- a read-only `resume-check`;
- a lazily loaded resume entry in `deliver`.
  **Continuation decision:** none

## Acceptance criteria

- [ ] **Ledger schema.** The ledger is a versioned, exact-key JSON document.
  - The immutable part holds `schemaVersion`, `recordId`, `creationOid`, `worktreePath`, `branch`, the receipt digest, the resolved base branch and base OID, visibility, the resolved `language.git` and `language.forge`, and the bound selection manifest.
  - It also holds the ordered group plan: group index → endpoint set, with rename sources included. This plan must be an exact, non-overlapping partition of the manifest endpoints.
  - For each endpoint it holds a descriptor: kind, mode, a digest of the bytes applied in the worktree, and the expected blob OID. The blob OID is computed with filters (`git hash-object --path`) and without `-w`.
  - The append-only part holds one entry per committed group: the group index and the commit OID.
  - The ledger contains no file content, credentials, or session tokens. An exact-key test checks this.
- [ ] **Ledger size bound.** `worktree-lifecycle.md` states a concrete byte bound, proposed at 256 KiB. Above it, ledger init is skipped with one notice and the delivery continues. A test covers the boundary.
- [ ] **Ledger init.** `ledger init` runs after the §4.4 reconcile is exact and before §5.1 staging.
  - It is written once, no-clobber and atomically, under the per-record lock.
  - The helper computes the descriptors itself from the bound manifest and the delivery worktree, using an internal reconcile that must be exact. It refuses a group plan that is not an exact partition.
  - It accepts no caller-supplied digests or descriptors.
- [ ] **Ledger append.** `ledger append` succeeds only if all of these hold:
  - the caller's session owns the `active` record;
  - the new OID is the branch tip;
  - its parent is the previous ledger tip, or `creationOid` for the first group;
  - its changed paths are exactly the next group's endpoint set;
  - its blob OIDs and modes equal that group's descriptors.
- [ ] **Ledger location.** The ledger lives in a dedicated path under `worktree-runs/` that does not end in `.json` or `.lock`. Tests show that `listRecordIds`, orphan-lock detection, `cleanup`, and the `build-run-core` scan of `worktree-runs/` never treat it as a record or a lock.
- [ ] **Ledger deletion.** The ledger is deleted under the same lock or claim immediately before its record is unlinked (`worktree remove`, `cleanup apply`). `worktree inspect` reports an orphan ledger but does not remove it.
- [ ] **Ledger access.** The ledger is read and written only by `effective-flow-state.mjs`, by `recordId` and through the runtime-state guard. No operation accepts ledger content from stdin.
- [ ] **Adoption discriminator.** `worktree transition` with `to: active` takes an explicit discriminator `adoption`: `plan-pr-continuation` (the default) or `partial-diff-resume`.
  - The resume value forbids `fetchedHeadOid` and requires `branch` and `workflow`.
  - Outside adoptions the discriminator is forbidden.
  - A `partial-diff` record without the discriminator still fails with `proofs: ['purpose']`, and the existing test stays unchanged.
- [ ] **Resume proofs.** A resume adoption succeeds only if every proof below passes. Each proof has a stable identifier that is reported in `proofs`:
  - `condition-1`: the record is schema-valid, `effective-flow-created`, and in status `aborted` or `failed`.
  - `purpose`, `workflow`, `branch`: the purpose is `partial-diff`, the workflow is `deliver`, and the branch and workflow inputs equal the record.
  - `condition-2` … `condition-6` and `condition-9`.
  - `visibility`: the ledger's visibility is not weaker than the current visibility.
  - `ledger`: a valid ledger is bound to this record.
  - `history`: the commits from `creationOid` to the tip equal the ledger's committed OIDs exactly, or those plus one extra tip that passes the tip-recovery subset of the append checks. That subset is: the commit is the tip, its parent is the previous one, its paths are the next group's exact endpoint set, and its blob OIDs and modes match.
  - `committed-count`: the ledger entries plus any recovered tip number at least 1.
  - `index`: the index is clean or stages exactly the first uncommitted group, with the same paths and tree. A recovered tip combined with a staged next group is refused.
  - `residual`: the worktree dirty set matches the uncommitted endpoints' byte digests exactly.
- [ ] **Single-proof tests.** Each proof identifier failing alone yields `NOT_ELIGIBLE` with the record and ledger unchanged. There is one unit test per identifier.
- [ ] **Adoption writes.** A successful resume adoption writes the recovered ledger append first (if any) and then the record, checking `lockStillOwned` before each write.
  - It rewrites only status, reason, `updatedAt`, and `sessionId`.
  - A recovered entry left over from a failed record write is idempotent for the next resume.
  - `creationOid`, `receipt`, and the ledger's immutable part never change.
- [ ] **Release transition.** A new transition `failed`/`aborted` → `cleanup-ready` exists only for `partial-diff` records. It is selected by an explicit discriminator `release: partial-diff` and keeps `reason: null`.
  - Its proofs replace the session-ownership check: `condition-1`, conditions 2–6, `condition-9`, and either the ledger route or the no-ledger route.
  - **Ledger route:** the dirty set equals the residual descriptors and `verifySourceManifest` is exact. The helper then restores exactly those paths.
  - **No-ledger route:** the worktree is clean, or its directory or registration is already gone. Otherwise the result is `NOT_ELIGIBLE` with the exact residual paths.
  - It rewrites only status, `updatedAt`, and `sessionId`.
  - Tests cover both routes, refusal for other purposes, and a released record actually being removed by `cleanup` with the branch kept.
- [ ] **Resume check.** A read-only operation `worktree resume-check {recordId}` evaluates every resume and release proof, including tip recovery, without writing anything. It observes the lock without taking it. A test shows that the record, ledger, and lock are unchanged afterwards.
- [ ] **Resume reconcile.** A resume-mode reconcile is exposed through `effective-flow-state.mjs`. It reads the ledger itself, checks committed endpoints against the branch tree by blob OID and mode, checks residual endpoints against the worktree and index by byte digest, and checks the source with `verifySourceManifest`. It never re-plans committed renames or three-way entries.
- [ ] **In-worktree Git safety.** Every Git call inside the recorded worktree runs only after the own-worktree and common-dir proof, with `core.fsmonitor=false`. This covers resume proofs, release, `resume-check`, ledger init, and the resume reconcile, including the reused `delivery-selection-core` functions through an injected runner. A test covers this.
- [ ] **Resume entry in `deliver`.** `deliver` has a resume entry after the §1.1 source receipt and before `upstream-status`, loaded as a lazy-include fragment when a retained `partial-diff` record exists.
  - It resolves the current visibility, then runs `resume-check` for each retained `partial-diff` record. Records with a ledger are scoped by the ledger's `manifest.source.root`. Records without a ledger are listed only for release, whatever their source.
  - It offers the provably resumable candidates in one question: resume one of them, or none.
  - It reports candidates that cannot be resumed and offers their release with explicit confirmation.
  - On decline, or when no candidate is resumable, it continues with a normal delivery.
  - It stops only when the user chose resume and the adoption itself then refuses.
- [ ] **Resume step map.** `deliver` documents which steps run after a resume.
  - **Skipped:** `upstream-status` and fast-forward, §1.3 selection and `bind-manifest`, §1.4, §2, §3, §4.1, §4.2, and `worktree.setup`.
  - **Runs:**
    - §1.2 with the current visibility (hidden wins);
    - receipt and expected HEAD rebuilt from the history tip;
    - in the hook-staged case, unstaging exactly the proven group's paths in the run-owned worktree (the "never unstage" rule belongs to `commit`, not to `deliver`);
    - §4.3 validation;
    - the resume reconcile;
    - §4.5 against the fresh snapshot;
    - §5 from the first uncommitted group;
    - §6;
    - §7.
  - **From the ledger:** languages, base, the §6 handoff evidence that every group was committed and verified, and the §7 commit list.
  - Selection approval is never asked for again.
- [ ] **Routine approval rule.** The `deliver` sole-routine-approval rule (around lines 75 and 140–143) names the resume and release questions as its only additions. The pinned test in `test/workflow-contracts.test.mjs` is updated accordingly.
- [ ] **Cleanup next step.** `cleanup`'s report row for retained `failed`/`aborted` `partial-diff` records names the `deliver` release route as the next step.
- [ ] **End-to-end tests.** A git-backed end-to-end test covers the issue's scenario: two groups, a failure after group 1, adoption from a new session, the rerun reconcile, and group 2 committed. It also covers these variants:
  - a committed rename;
  - three-way base drift;
  - a hook-rejected staged group;
  - one unrecorded tip commit with zero ledger entries;
  - source drift (refused);
  - a visibility downgrade (refused);
  - a second resume after a failed resume;
  - a ledger-route release followed by `cleanup` removal.
- [ ] **Shared docs.** `src/shared/worktree-lifecycle.md` and `src/shared/worktree-integration.md` document the adoption and release rows, the ledger and its lifecycle, the size bound, and the operations. Contract tests in `test/worktree-lifecycle-contract.test.mjs` assert them.
- [ ] **CI.** `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` pass, run via `t3-project`. This includes an updated `CONTEXT_BUDGET_LINES.deliver`, and `RUNTIME_SCRIPT_FILES` where affected.

## Affected areas/files

- `src/scripts/effective-flow-state-worktree-core.mjs`:
  - the adoption and release discriminators in `requireTransition`;
  - the resume and release proof sets, next to the unchanged `adoptionProofs`;
  - `resume-check`;
  - ledger init, append, read, and tip recovery;
  - ledger deletion during removal and cleanup;
  - orphan-ledger reporting in `inspect`.

  A sibling core module is acceptable if it is added to `RUNTIME_SCRIPT_FILES`.

- `src/scripts/effective-flow-state.mjs` exposes the ledger operations, `resume-check`, the resume reconcile, and both discriminators.
- `src/scripts/delivery-selection-core.mjs` gets pure functions for the resume reconcile and the descriptor computation (reusing `validateSelectionManifest`, `verifySourceManifest`, `expectedEndpoints`), plus an injectable Git runner.
- `src/scripts/build-run-core.mjs`: verify that its `worktree-runs/` scan ignores the ledger path, with a test.
- `src/tools/deliver.md`:
  - a lazy-include pointer to the resume entry;
  - ledger init between §4.4 and §5.1, including the size-bound notice;
  - ledger append in §5;
  - the failure clause names the resume re-entry;
  - the sole-routine-approval rule;
  - an exception to "do not write the manifest to runtime state", for the ledger only.
- New lazy-include fragment under `src/shared/` (name chosen during implementation) holding the resume and release entry and the resume step map.
- `src/tools/cleanup.md`: next-step hint for retained `partial-diff` records.
- `src/shared/worktree-lifecycle.md`: state-machine rows for adoption (currently "`plan-pr-continuation` only") and release, the ledger schema, lifecycle and size bound, and the helper operations table.
- `src/shared/worktree-integration.md`: the partial-diff section and the adoption exclusions.
- Tests:
  - `test/effective-flow-state-worktree.test.mjs`
  - `test/worktree-lifecycle-contract.test.mjs`
  - `test/delivery-selection*.test.mjs` (including the git-backed ones)
  - `test/effective-flow-state-git.test.mjs`
  - `test/workflow-contracts.test.mjs`
- `build.mjs`: `RUNTIME_SCRIPT_FILES` and `CONTEXT_BUDGET_LINES.deliver`.

## Edge cases

- **Ledger missing, malformed, or mismatched.** The ledger is missing, malformed, bound to another record or worktree, or has an unknown schema version → resume refused; release by the no-ledger route.
- **Selection over the size bound.** No ledger; the run shows one notice and continues. On a later failure, only the no-ledger release route applies.
- **History mismatch.** Extra commits beyond one provable tip, or missing, reordered, amended, or squashed commits → resume refused; release offered.
- **Residual mismatch.** Residual worktree content that differs from the descriptors, extra dirty or untracked paths, or an index that stages anything other than exactly the first uncommitted group → resume refused, and ledger-route release refused too.
- **Committed rename or three-way entry.** Verified against the branch tree by blob OID; never re-planned.
- **Clean or smudge filters, LFS, or EOL attributes.** Committed endpoints are compared by blob OID and residual endpoints by worktree bytes, so filtered paths stay resumable.
- **Base moved before the first run's transfer.** A residual merged three-way is accepted, because the comparison uses the persisted descriptors.
- **Source drift.** Source HEAD or the selected source bytes have changed → not resumable and no ledger-route release; only the no-ledger route applies when the worktree is clean or gone.
- **Visibility downgrade.** The ledger says `visible` but the current mode is hidden → resume refused; release offered.
- **Configuration changed in a new session.** Base and languages come from the ledger.
- **Lock or claim held by another live session.** Not offered; locks are never broken.
- **Abrupt interruption.** The record stays `active`, which is not adoptable (as today).
- **Several candidates.** One question that lists only the resumable ones; the rest are reported with release offered.
- **User declines.** A normal delivery continues and the records stay retained.
- **Failure before the first commit.** No resume offer; release available.
- **Resume fails again.** The record returns to `failed` and the ledger keeps its entries; a later resume works the same way.
- **Out of scope.** Failures after `worktree remove` in §6, where the record is gone or falls back to `cleanup-ready`, including `pr` failures.

## Assumptions

- The exact names of the ledger subdirectory and of the lazy-include fragment are chosen during implementation, within the rules above. Lifecycle record schema v1 stays unchanged.
- Storing digests, blob OIDs, modes, and absolute paths in private, git-ignored runtime state is acceptable. Because the ledger is deleted together with its record, its lifetime is bounded.
- 256 KiB is a proposed bound. The implementation may adjust it if it states the value and tests the boundary.
- Release keeps the branch. Removing the branch remains the user's choice.
- Model-evidence status for resumed worker turns is reported as observed (`unverified` on Claude). The resume makes no model-evidence claim.

## Plan review

**Result:** Approved

### Summary

Deep review round (2026-11-06):

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         3 |    0 |
| Security        |        0 |         1 |    1 |
| Data protection |        0 |         1 |    0 |
| Error cases     |        0 |         2 |    2 |
| Testability     |        0 |         1 |    1 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        0 |         0 |    1 |

### Findings

Deep review round. All findings below are incorporated.

**Architecture**

- **Critical:** A released dirty worktree could never be removed by `cleanup`, which only removes clean worktrees and never forces. Release now uses proof-guarded discard on the ledger route and clean-or-gone on the no-ledger route, and requires condition 6 (maintainer decision).
- **Important:** The release input contract conflicted with `reason: null` and the session-ownership rule. Release now has an explicit discriminator, keeps a null reason, and its proofs replace the ownership check. The rewritten fields are listed.
- **Important:** Committed renames failed the exact-path append check. Groups are now endpoint sets that include rename sources, and the group plan must be an exact partition.
- **Important:** Byte digests break blob comparison under filters, LFS, or EOL handling. The ledger now also stores filtered blob OIDs.

**Security**

- **Important:** The resume reconcile would have received ledger data from the caller. Now only `effective-flow-state.mjs` reads the ledger.
- **Note:** The `core.fsmonitor=false` guard did not cover the reused selection functions. It now covers every in-worktree Git call.

**Data protection**

- **Important:** The privacy claim was not checkable after a switch to hidden mode. The resume is now refused on a visibility downgrade (maintainer decision).

**Error cases**

- **Important:** It was unclear whether the at-least-one-commit rule was counted before tip recovery, and which append checks apply during adoption. It is now counted after recovery, the subset is named, and a recovered tip combined with a staged group is refused.
- **Important:** There was no step map for the resume path. Skipped and running steps, and the evidence taken from the ledger, are now explicit.
- **Note:** The write order for tip recovery was undefined. The ledger is written first, then the record, and a leftover entry is idempotent.
- **Note:** The validation context differed in the hook-staged case. The proven group is now unstaged before §4.3.

**Testability**

- **Important:** The read-only proof evaluation had no named operation. `worktree resume-check` is added, and records without a ledger are scoped for release only.
- **Note:** Proofs had no stable names. Identifiers, per-identifier tests, and the second-resume variant are added, and the wording about ignoring versus reporting the ledger is fixed.

**Scope**

- **Important:** A ledger size bound would have stopped deliveries that work today. Resume is now skipped with a notice instead (maintainer decision).
- **Note:** The scope is large for one delivery. It stays one delivery with ordered commit groups (maintainer decision).

**Maintainability**

- **Note:** The `deliver` context budget and the discoverability of release. The resume entry is now a lazy include, and `cleanup` points to release.

Earlier internal baseline round (same day): 4 Critical, 10 Important, 3 Note across all areas. All were incorporated. They covered ledger timing, the resume reconcile, tip recovery, non-blocking candidate handling, the entry position, §4.5 snapshot rules, append scope checks, helper-computed descriptors, the `fsmonitor` guard, the `build-run-core` scan, hidden visibility, an unreachable §6 case, the release route, end-to-end tests, orphan-ledger reporting, the discriminator name, and persisted languages.

## Open points

- No open points.

## Build completion

**Date:** 2026-11-07
**Workflow:** `effective-flow build`, delegated non-interactively from `effective-flow apply` for
issue #626, executed inline (Quality) with delegated implementer, test-writer, docs-writer,
validator and reviewer workers.

### Requirement

Implemented as planned above: a helper-enforced resume adoption for failed `partial-diff`
deliveries with at least one provable commit group, and a proof-guarded release route that leads
to normal cleanup. Delivered as three ordered commit groups: ledger and release; resume adoption
and resume reconcile; the `deliver` resume entry and documentation.

### Architecture decisions

- The ledger and recovery logic live in two new runtime modules,
  `src/scripts/effective-flow-state-ledger-core.mjs` (schema, path, bounded file access, Git
  comparisons, restore) and `src/scripts/effective-flow-state-recovery-core.mjs` (`ledger init`,
  `ledger append`, `ledger reconcile`, `worktree resume-check`, the release and resume proofs).
  The recovery module imports worktree-core internals; worktree-core never imports it back.
- Ledger path `.effective-flow/worktree-runs/ledgers/<recordId>.ledger`. The 256 KiB bound is
  checked against the worst case (every group committed with 64-hex OIDs), so appends never
  outgrow it; `ledger init` alone accepts stdin up to that bound and drains up to four times it.
- Release keeps the plan's `worktree transition` discriminator. Its `gone` route requires a fully
  gone worktree (unregistered and absent); a half-gone worktree is refused with proof `half-gone`.
  Cleanup removes a released `partial-diff` record whose worktree is fully gone, keeping the
  branch. A partially failed ledger-route release is retryable: residual endpoints already back
  at HEAD count as released.
- The resume adoption also proves `source` (unchanged selected source content), in line with the
  clarified source-check decision; `RESUME_OPERATION_PROOFS` names the operation-level proofs
  `repository`, `source-root` and `reconcile`.
- The ledger schema, proofs and call lines are owned by the lazily loaded
  `src/shared/worktree-partial-diff-recovery.md`; `src/shared/worktree-lifecycle.md` keeps the
  state-machine rows and the pointer, so hosts that always load the lifecycle fragment do not pay
  for the deliver-only path. The resume entry is the lazy `src/shared/deliver-partial-diff-resume.md`.
- `ledger init`, `ledger append`, `ledger reconcile` and `worktree resume-check` are allowlisted
  with their stated bounds, so an ordinary delivery gains no permission prompts (62 rules).
- A failed `ledger init` other than the size bound stops before staging, except that one
  corrected retry after `INVALID_INPUT` degrades to the "resume unavailable for this run" notice.

### Affected files

- Runtime: `src/scripts/effective-flow-state-{core,worktree-core,ledger-core,recovery-core}.mjs`,
  `src/scripts/effective-flow-state.mjs`, `src/scripts/delivery-selection-core.mjs`,
  `src/scripts/claude-settings-core.mjs`; `build.mjs` (`RUNTIME_SCRIPT_FILES`,
  `CONTEXT_BUDGET_LINES` for `deliver`, `cleanup`, `apply-review-commit-mechanics`);
  `scripts/distribution-smoke.mjs`.
- Prompt sources: `src/tools/deliver.md`, `src/tools/cleanup.md`,
  `src/shared/{worktree-lifecycle,worktree-integration,setup-allowlist}.md`, new
  `src/shared/deliver-partial-diff-resume.md` and `src/shared/worktree-partial-diff-recovery.md`.
- Tests: new `test/effective-flow-state-ledger.test.mjs`, `test/effective-flow-state-resume.test.mjs`,
  `test/support/ledger-fixtures.mjs`; updated state, harness, worktree, build-run,
  execution-profile, worktree-lifecycle, workflow, setup-allowlist, helper-call-shape and
  model-tiers contract tests.
- Documentation: `docs/user-guide/{tools-deliver,worktree-and-delivery,tools-setup,troubleshooting}.md`,
  `docs/developer-guide/{architecture,build-system,configuration,release-and-installation}.md`.

### Implementation details

Each commit group ran implementation, tests, validation and independent review, with one review
incorporation pass and a re-review, before it was committed. Deviations from the plan text: the
recovery contract placement in a lazy fragment, the stricter fully-gone `gone` release route, the
additional `source` resume proof, the gone-worktree cleanup exception, the allowlist
classification of the four new operations, and the `INVALID_INPUT` retry in `ledger init`.
Model execution evidence for every delegated worker is `unverified` (Claude host without an
exact-child evidence adapter).

### Test results

- `pnpm agent:check`, `node build.mjs` and `pnpm test:distribution` pass.
- `pnpm test` in the T3 container: every test of the changed set passes; 44 failures remain, all
  environmental and identical before and after each group (no Git repository visible inside the
  container, `ENOSPC` in the container `/tmp`, process-group termination tests, host-driver Python
  timeouts). CI is authoritative for those.

## Review findings

**Date:** 2026-11-07
**Reviewer:** effective-flow-nodejs-reviewer (one review and one re-review per commit group)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    46 |
| Open / Not implemented |     0 |

One further note (earlier lazy loads of two runtime-state fragments at deliver step 1.1) was
closed as an accepted cost without a change.
