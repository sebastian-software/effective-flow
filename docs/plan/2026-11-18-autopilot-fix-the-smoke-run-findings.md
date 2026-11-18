# Autopilot: fix the smoke-run findings

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Two manual smoke runs of `effective-flow autopilot` were run after PR #685 merged. Both used the built portable `develop` target:

- **Issue source:** issue #31 in the private sandbox `fastner/ef-allowlist-sandbox`. It ended in draft PR #32.
- **Plan source:** a plan in the new public repository `fastner/ef-autopilot-smoke-public`. It ended in draft PR #1.

Both runs met the acceptance bar: a draft PR with the appendix, no user question and no attribution. They also surfaced defects in the tool's chain. This plan fixes the six confirmed groups. Each was verified against `origin/develop` with file and line evidence before planning.

1. **Reviewed plan is not carried, and the stale plan is archived.**
   - Under autopilot, `plan-review` revises the plan in place in the primary checkout and leaves it uncommitted (`src/shared/unattended-planning.md`, in-place revision; `src/tools/plan-review.md`, no commits).
   - The implementing workflow then cuts its worktree from `<BASE_REF>` (`src/shared/worktree-integration.md`, "Worktree execution" step 2), so the worktree holds the pre-review plan.
   - Plan archival State A (`src/shared/plan-archival.md`, State A row) runs `git mv` and never re-stages the archived file after the marker edit. The archive commit can therefore capture the stale index blob.
   - The cleanup removes only an untracked source copy. The primary checkout keeps a modified plan still marked `Not implemented`.
   - The ledger's `planSha256` is the pre-review hash and is never refreshed.
   - `src/shared/build-delegated-run.md` Phase 7 step 2 ("update the referenced file") does not say which copy it updates, the worktree copy or the `SOURCE_ROOT` copy.
2. **Verification evidence understates a passing run.** `src/shared/verification-evidence.md`, the build bullet under "Worktree producers", maps every targeted Phase 7 final check to a full suite `skipped` with the limitation "full suite ran before later corrections; changes since verified targeted". That happens even when the Phase 7 tree equals the Phase 5 full-run tree and no correction happened.
3. **`run-close` loses the architecture fit.** `src/scripts/autopilot-core.mjs` `runCloseOperation` returns `fit: ledger.fit && ledger.fit.assessed ? ledger.fit.score : null`. This collapses "no sources", "scoring unavailable" and "never recorded" into `null` and drops the sources and the reason. Phase 6 of `src/tools/autopilot.md` needs all of them.
4. **Inaccurate `autopilot.md` instructions.**
   - Preflight step 1 retains `EXECUTION_ROOT` and an "execution-location receipt" that `config-resolve` does not return.
   - Pre-delivery step 1 collects architecture-fit sources "that exist in `EXECUTION_ROOT`". It runs inside the implementing workflow's handback step 5, after step 4 has already withdrawn that worktree.
   - Phase 3 says "delegate" for a plan-review run that Phase 2 defines as inline.
5. **Confirmation sites have no scored row.** The `worktree-integration` shared precondition 3 ("relevant uncommitted changes … Only continue if the user confirms") and the three partial-diff confirmations have no row in the question-site table of `src/shared/scored-decisions.md`. The run had to improvise; the table's own rule would record an `unknown-question` blocker.
6. **Small defects.**
   - (a) The appendix line "Source: plan `<path>`" names the pre-archival plan path, which no longer exists on the delivery branch.
   - (b) `build-lib.mjs` `transformRefs` wraps internal `{{SKILL:X}}`, `{{AGENT:X}}` and `{{AGENT_PROFILE:X:fast}}` expansions in backticks unconditionally. A code span that consists of exactly the placeholder renders with doubled backticks (` `tools/plan-review.md` `). A longer code span that contains one renders broken markup, for example `` `{{SKILL:apply-plan}} <arg>` `` in `src/tools/apply.md`. This affects dozens of rendered files in every target, native included.
   - (c) `src/shared/model-selection.md` does not say that `role` is the bare role name. `select` rejects the rendered `effective-flow-<role>` form that the same sources show everywhere else.

Not part of this plan: the smoke report's claim that `SKILL.md` and `host-pr-watch` contradict each other on T3 host identity was not confirmed. The router uses the `t3-code` tools only to choose the invocation syntax shown in chat. `host-pr-watch` governs PR waits and requires explicit runtime context. Neither rule contradicts the other.

The fixes correct a shipped tool. They also add helper operations and autopilot's first write to a file in the user's checkout, which is a data-protection boundary. The user therefore chose Feature (`effective-flow build`) for its full specialist review and validation budget.

## Outcome checkpoint

**Primary source:** sebastian-software/effective-flow, PR #685 (autopilot), smoke runs fastner/ef-allowlist-sandbox#32 and fastner/ef-autopilot-smoke-public#1
**Original outcome:** autopilot drives one issue or plan to a draft PR without asking, documents decisions and blockers, and leaves no inconsistent state behind
**Last evaluated attempt:** the two manual smoke runs of 2026-11-18. Both reached a draft PR; findings 1–6 above
**No-progress count:** 0
**Cumulative approach:** PR #685 shipped the tool. This plan corrects defects the smoke runs found and adds one gated restore of the run's own plan edit to autopilot's own writes. The draft-only, no-merge and no-attribution guardrails stay unchanged.
**Continuation decision:** none

## Architecture decisions

1. **Carry the reviewed plan instead of committing in the user's checkout.**
   - Autopilot never commits in the primary checkout. Under scored mode the implementing workflow copies the reviewed plan into its delivery worktree, and archival commits it there.
   - Rationale: it keeps the plan-only boundary of `plan-review` and puts the reviewed text on the delivery branch.
2. **The ledger records the reviewed plan and the delivery.**
   - After plan review, autopilot calls a new operation `plan-reviewed {cwd, runId}`. It is accepted only for `source.kind: plan` on an open run. The helper hashes the plan at `source.planPath` itself, with the bounded no-follow regular-file read, and stores `source.reviewedPlanSha256`. No model-computed hash enters the ledger.
   - The implementing workflow reads that value from the `run-check` result it already obtains under scored mode. No new chain line is needed, so the Recognition list and the emission guard stay unchanged.
   - The implementing workflow's handback reports the archive path, or that the plan stayed unarchived. `pr` reports the verified pushed head. The "Before `pr`" bullet of `scored-decisions` names both values as the handback output the Automation caller reads.
   - Two ledger writes follow, each at a fixed point:
     - `delivery-record {cwd, runId, archivePath | unarchived: true}` runs after the handback commit and before `pr-appendix`, because the appendix renders the archive path. `archivePath` must equal exactly `dirname(planPath)/archive/basename(planPath)`.
     - `delivery-confirm {cwd, runId, headOid}` runs only after `pr` returns a verified pushed head. A failed push therefore never counts as delivered.
   - `plan-reviewed` and `delivery-record` withdraw a rendered appendix, as the existing decision writes do. `delivery-confirm` does not, so a confirmed head never invalidates the merged digest. The module header comment lists the withdrawing operations. A unit test calls `appendix-merge` after `delivery-confirm` and expects it to accept the digest.
3. **Restore the user's plan copy, gated and only for run-owned content.** This is the user's decision for finding 1.
   - The restore acts on the invocation checkout (`SOURCE_ROOT`, the retained `checkoutRoot`). The helper receives it as `sourceRoot`, requires it to be its own `git rev-parse --show-toplevel` of the same repository, and hashes with the existing no-follow, bounded regular-file read.
   - Before `run-close`, autopilot calls `plan-copy-restore`. The helper restores the tracked plan `<P>` in `SOURCE_ROOT` to `HEAD` (`git restore --worktree --source=HEAD`) only when all of these hold:
     - the ledger records a confirmed head OID (`delivery-confirm`);
     - the ledger records an `archivePath`, and `git -C <sourceRoot> ls-tree -z <headOid> -- ':(literal)<archivePath>'` lists it, so the reviewed text is on the delivered head;
     - `HEAD:<P>` in `SOURCE_ROOT` still hashes to the preflight value;
     - the index entry for `<P>` equals `HEAD:<P>` (nothing staged);
     - the working copy hashes to `reviewedPlanSha256`, re-checked immediately before the write.
   - The result is `not-applicable` when nothing in `SOURCE_ROOT` is run-owned:
     - an issue source;
     - `<P>` missing or untracked in `SOURCE_ROOT`. This covers delivery in the invocation checkout itself, where archival already moved it;
     - a working copy that already equals `HEAD:<P>`.
   - Otherwise the copy stays. The result is `kept` and names the failed precondition, and the report repeats it. A Git failure of the restore itself, such as a held `index.lock`, is `kept`, not a helper error.
   - The checks and the restore live in one deterministic helper operation, so no prose re-derives the comparison. It is the helper's first project-file write. It uses no runtime-state guard primitive, because the target is a tracked project file restored only from `HEAD`, and it leaves the index entries unchanged.
4. **Plan archival stages what it wrote; completion notes go to the carried copy.**
   - State A writes the final marked content into the archived path and stages it explicitly after `git mv`.
   - State D's refresh stages too.
   - The `scored-decisions` carry-over bullet is the one owner of the carry-over rules:
     - the completion section is written into the carried `EXECUTION_ROOT` copy;
     - archival takes over from `EXECUTION_ROOT`;
     - a blocked archival commits the carried `<P>` unarchived at its own path and reports it.
   - `plan-archival` receives "carry-over happened, with `reviewedPlanSha256`" as an input, and its "Execution roots" table states the `EXECUTION_ROOT` take-over for that case. `build-delegated-run` Phase 7 step 2 and `docs` step 2 only point to "the plan copy `scored-decisions` names" and state no rule of their own.
   - **States A and C after a carry-over.** State A takes over from `EXECUTION_ROOT`. State C places `A` with its existing temp-file and no-clobber primitive and removes the carried `P` only after `A` is staged, so the worktree is clean at withdrawal. Cleanup precondition 3 compares the `SOURCE_ROOT` copy with `reviewedPlanSha256` instead of a value this step never read.
   - **Blocked archival after a carry-over.** A collision or a failed `ls-files` stops archival. The carried `<P>` is then committed unarchived at its own path, delivered as the plan state, and the handback reports "unarchived". This is the user's decision, and it matches plan-archival's rule that archival never aborts the handback. `delivery-record` then records `unarchived: true`, and the restore keeps the user's copy.
   - The user's copy then holds only the review edits, which is what the restore gate compares against. Without a carry-over, every take-over and cleanup rule stays unchanged.
   - **Carry-over preconditions.** The carry-over runs only when `SOURCE_ROOT` and `EXECUTION_ROOT` differ, and the source copy hashes to `reviewedPlanSha256`. For a tracked plan, `SOURCE_ROOT`'s `HEAD:<P>` must also equal `<BASE_REF>:<P>`, so an outdated checkout never reverts newer base edits of the plan. A failed precondition is a `post-branch-failure` blocker.
5. **Verification evidence follows tree identity.**
   - When the Phase 7 render's `currentTree` equals the retained `phase5Tree` of a valid Phase 5 full run with zero failures, the build maps the full suite as `passed` with provenance `executed`, scope "full suite on the verified tree", and no limitation. `validation-budget` retains that zero-failure fact next to `phase5Tree`. A valid run with `pre-existing` or approved `expected` failures keeps the existing `failed` mapping with its attribution limitation.
   - A used second full run maps as `passed` or `failed` from its result.
   - Tree OIDs stay compared, never printed.
6. **`run-close` returns the stored fit object.** It returns the ledger fit without `recordedAt`, or `null` when none was recorded. That is a small helper API change with no other reader. The appendix renderer already distinguishes the three cases.
7. **Correct helper and build mechanics at their owner.**
   - The appendix names the archived path from `delivery-record`. The helper renders it; prose never derives it. An unarchived delivery keeps the original path.
   - **Code spans.** `transformRefs` handles every internal-tool and agent placeholder (`{{SKILL:…}}`, `{{AGENT:…}}`, `{{AGENT_PROFILE:…}}`) that sits inside a code span. This is the user's decision, and it needs no new build guard:
     - it emits the bare name, so the span keeps exactly its own backtick pair;
     - a span that consists of exactly the placeholder renders as one pair;
     - a longer span stays one valid span;
     - an exposed tool keeps its current rendering;
     - the portable `AGENT_PROFILE` text keeps its parenthetical outside the span.
   - The role-name rule is one sentence in `model-selection.md`. The core keeps rejecting the prefixed form, so the contract does not loosen.
8. **Architecture-fit sources come from the delivery branch head.**
   - Autopilot lists candidates with `git -C <RUNTIME_STATE_ROOT> ls-tree -r --name-only -z <head-oid> -- ':(literal)docs/adr/' ':(literal)docs/developer-guide/architecture.md' ':(literal)docs/concept/' ':(literal)<plan.dir>/'`. It treats every returned path as untrusted under the quoting rule of `plan-archival` ("Paths") and excludes `<plan.dir>/archive/`, which also excludes the run's own archived plan.
   - Autopilot filters the candidates itself, reading each with `git show <head-oid>:<path>`: ADRs with status Accepted and plans with the canonical open status.
   - It hands the leaf the head OID and the filtered paths. The leaf reads only with `git show`, never from a working tree, and lists at most 20 sources it used.
   - When scoring is unavailable, `fit-record` accepts `unavailable: true` with no source list. This is the user's decision, so the fallback can never exceed the 20-source limit or turn into a blocker. The appendix keeps "not assessed — scoring unavailable".
   - Rationale: the worktree is already withdrawn at that point, and the user's working tree holds unrelated and run-owned uncommitted plans.
9. **Local changes in the invocation checkout block only when they matter.** This is the user's decision for finding 5.
   - The new row for `worktree-integration` precondition 3 is kind `fixed`: continue, and leave other changes untouched. It is listed under the `fixed` rows of the conditional-blocker list. An uncommitted change that overlaps the plan's Affected files, or a local commit ahead of the resolved base ref, is a `site-blocker`.
   - **Overlap** means one of these:
     - exact path equality with a backticked repository-relative path in the File column of the plan's Affected files table (`## Affected files` or `## Betroffene Dateien`), where every backticked path in a cell counts;
     - a path below a backticked entry that ends in `/`.
   - The run's own plan never counts, under this row and under S-STSH. The "Fixed answers" bullet on foreign uncommitted state is narrowed to match: it stops only on state this row or S-STSH treats as a blocker.
   - Untouched changes are named in the Phase 6 report.
   - The three partial-diff confirmations each get a `blocker` row with its own single-line anchor: "explicit user confirmation", "any explicitly confirmed additions" and "must know the files to include or ask". Under scored mode no partial-diff selection is confirmed.

## Affected files

| File                                                                          | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/autopilot.md`                                                      | **Preflight step 1:** retain `data.runtimeStateRoot` and `data.checkoutRoot`; drop the non-existent fields. **Phase 3:** "run" instead of "delegate"; call `plan-reviewed` after review. **Phase 4:** `delivery-record` before `pr-appendix`; `delivery-confirm` after `pr`; architecture-fit listing, filtering and leaf brief per decision 8. **Phase 5:** `plan-copy-restore` before `run-close`, also added to the tool's list of its own writes (intro paragraph); step 3 names the returned fit shape. **Phase 6:** name the restore result and every untouched local change. Re-measure `contextBudget`. |
| `src/scripts/autopilot-core.mjs`, `src/scripts/autopilot.mjs`                 | `run-close` returns the fit object. New operations `plan-reviewed`, `delivery-record`, `delivery-confirm` and `plan-copy-restore {cwd, runId, sourceRoot}`, with closed inputs, open-run checks and the results of decision 3. `run-check` returns `reviewedPlanSha256` in `source`. `fit-record` accepts `unavailable` without sources. `pr-appendix` renders the recorded archive path. The module header lists the withdrawing operations.                                                                                                                                                                   |
| `src/shared/scored-decisions.md`                                              | "Implementing workflows and `pr`": the carry-over bullet (decision 4), and the handback output the caller reads ("Before `pr`"). New site rows: precondition 3 (`fixed`, conditional blocker) and the three partial-diff `blocker` rows (decision 9). S-STSH and the "Fixed answers" bullet exclude the run's own plan and follow decision 9.                                                                                                                                                                                                                                                                   |
| `src/shared/worktree-integration.md`                                          | Only if a row needs a single-line anchor that the current wrapping does not provide; otherwise unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/shared/plan-archival.md`                                                 | New input "carry-over happened, with `reviewedPlanSha256`". "Execution roots" table: the `EXECUTION_ROOT` take-over after a carry-over. State A: write the final content into the archived path and `git add` it after `git mv`. State C after a carry-over: place `A` with the existing primitive and remove the carried `P` only after staging. State D: stage the refresh. Cleanup precondition 3 after a carry-over: compare with `reviewedPlanSha256`.                                                                                                                                                     |
| `src/shared/build-delegated-run.md`, `src/tools/docs.md`                      | The plan-file completion write (build Phase 7 step 2, docs step 2) points to the copy `scored-decisions` names, without a rule of its own. Build keeps the zero-failure fact of the Phase 5 full run in its validation-budget state and reports the archive path or "unarchived" in its handback.                                                                                                                                                                                                                                                                                                               |
| `src/shared/verification-evidence.md`                                         | Build bullet: identical-tree zero-failure arm and second-full-run arm.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/shared/model-selection.md`                                               | One sentence: `role` is the bare table name; `data.spawn.role` returns the prefixed identifier.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `build-lib.mjs`                                                               | `transformRefs`: code-span-aware expansion per decision 7. `collectRenderedWorkerRefs` keeps matching.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `test/autopilot-core.test.mjs`                                                | `run-close` fit shapes; `fit-record` unavailable without sources; `plan-reviewed`, `delivery-record`, `delivery-confirm`; archived and unarchived appendix path; every `plan-copy-restore` result.                                                                                                                                                                                                                                                                                                                                                                                                              |
| `test/scored-decisions-contract.test.mjs`                                     | The new rows, the narrowed bullet and S-STSH, and the carry-over bullet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `test/workflow-contracts.test.mjs`                                            | Plan archival: States A, C and D, the roots table and cleanup precondition 3 after a carry-over.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `test/build-validation-budget-contract.test.mjs`                              | The build mapping arms.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `test/build-lib.test.mjs`                                                     | `transformRefs` for exact and longer spans, exposed tools and portable `AGENT_PROFILE`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `test/model-selection.test.mjs`                                               | Prefixed role rejected.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `docs/developer-guide/build-system.md`, `docs/user-guide/tools-automation.md` | Only where they describe the `run-close` return, the appendix source line, the fit fallback or the restore.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Implementation details

### Approach

Work packages, each independently testable:

1. **WP1: helper (findings 3, 6a, part of 1).**
   - `run-close` returns the fit object; `fit-record` accepts `unavailable` without sources.
   - Add `plan-reviewed`, `delivery-record`, `delivery-confirm` and `plan-copy-restore` with closed inputs. `run-check` returns the hash in `source`.
   - `pr-appendix` renders the recorded archive path.
   - Extend the unit tests against temporary Git repositories. Cover:
     - every `plan-copy-restore` result;
     - a staged change, an edit between check and restore, and a held `index.lock`;
     - a missing archive on the head, an unarchived delivery, an unconfirmed delivery and a closed run;
     - a `sourceRoot` subdirectory and a symlinked plan;
     - `appendix-merge` after `delivery-confirm`.
2. **WP2: plan carry-over and archival (finding 1).**
   - Add the `scored-decisions` carry-over bullet with the preconditions, the completion target and the blocked-archival rule of decision 4. It runs after record-init and before the first dispatch, under verified scored mode whose `run-check` source carries `reviewedPlanSha256`.
   - Fix plan-archival: the new input, the roots table, States A, C and D, and cleanup precondition 3.
   - Point `build-delegated-run` Phase 7 step 2 and `docs` step 2 at the copy `scored-decisions` names. Add the handback's archive-path report.
   - Wire `autopilot.md`:
     - `plan-reviewed` after Phase 3;
     - `delivery-record` before `pr-appendix`;
     - `delivery-confirm` after `pr`;
     - `plan-copy-restore` before `run-close`.
3. **WP3: question-site rows (finding 5).**
   - Add the four rows of decision 9, with ids matching `^S-[A-Z]{2,5}$` and single-line anchors that occur verbatim in their files.
   - List the precondition-3 row under the `fixed` rows of the conditional-blocker list. Narrow S-STSH and the "Fixed answers" bullet.
   - Assert them in the contract test.
4. **WP4: verification evidence (finding 2).** Rewrite the build bullet with the identical-tree and second-full-run arms; update the pinned assertion.
5. **WP5: `autopilot.md` wording (finding 4).**
   - Change the preflight fields.
   - Change the source collection to decision 8.
   - Change "delegate" to "run".
   - Keep the `spawn-site:autopilot/architecture-fit` marker directly after its spawn.
6. **WP6: build and docs (6b, 6c).**
   - Make `transformRefs` code-span-aware and add its tests.
   - Rebuild and confirm that no rendered file has a doubled pair or an unbalanced span around a `tools/…` or `effective-flow-…` reference.
   - Add the `model-selection.md` sentence and its test.
7. Re-measure `contextBudget` for `autopilot.md` and every tool whose eager core changed, from the `node build.mjs` report.

### Edge cases

- **Plan unchanged by review:** in State A the post-review hash equals `HEAD:<P>`. The carry-over is a no-op, the completion notes go to the carried copy, and the restore returns `not-applicable` because the working copy already equals `HEAD`. For an untracked plan the carry-over is a real copy.
- **Harness-managed worktree session, or in-place delivery (`worktree.enabled: false`):** `SOURCE_ROOT` equals `EXECUTION_ROOT`, so there is no carry-over. Archival moves `<P>` in that checkout itself, so the restore returns `not-applicable`. Under in-place delivery, S-STSH still stops on foreign uncommitted changes, except the run's own plan.
- **Checkout behind the base:** for a tracked plan whose base copy differs from `SOURCE_ROOT`'s `HEAD:<P>`, the carry-over records a `post-branch-failure` blocker instead of reverting the newer base text.
- **User edits the plan copy during the run:** the carry-over hash check fails, which is a blocker. If the edit happens after delivery, the restore returns `kept` and the report names the file.
- **Untracked plan source (State C):** the carried copy is archived inside the worktree, so the worktree stays clean. The restore is `not-applicable` (no `HEAD:<P>`), and the existing cleanup removes the untracked source copy; its hash check now compares with `reviewedPlanSha256`.
- **Blocked archival after a carry-over:** the carried `<P>` is committed unarchived, the appendix keeps the original path, and the restore keeps the user's copy.
- **Plan source with a published plan pull request:** `plan-pr-continuation` compares the reviewed local plan with the PR head first (S-PDF). After `Republish`, the head already holds the reviewed plan, the carry-over is a no-op, and the take-over source is that head. After `Stop`, the run records the blocker before any carry-over.
- **Failed push:** `delivery-confirm` never runs, so the restore keeps the copy.
- **Issue source:** the restored-copy rules of `autopilot-issue-source` stay authoritative. `plan-copy-restore` returns `not-applicable` for `source.kind: issue`.
- **Plan-only draft path:** the plan stays at its original path, and no `delivery-record` runs.
- **Unrelated local work in the invocation checkout (worktree delivery):** an uncommitted change outside the plan's Affected files is left untouched and named in the report. A change inside them, or a local commit ahead of the base, records a `site-blocker` before delivery.
- **Blocker before delivery:** no confirmed head exists, so the restore keeps the copy, as the blocker path already keeps plans.

## Acceptance criteria

- [ ] **`run-close` and `fit-record`.** `run-close` returns one of `{assessed:true, score, reason, sources}`, `{assessed:false}`, `{assessed:false, unavailable:true}` or `null`. `fit-record` accepts `unavailable` without sources. Unit tests cover both.
- [ ] **Appendix path.** `pr-appendix` renders the recorded archive path, and for an unarchived delivery or none at all it renders the original path, covered by unit tests.
- [ ] **`plan-copy-restore`.** Unit tests against temporary Git repositories cover every result, and the index entries stay unchanged:
  - `restored`;
  - `kept`: user edit, edit between check and restore, staged change, moved `HEAD`, no confirmed delivery, archive missing on the head, unarchived delivery, and a held `index.lock`;
  - `not-applicable`: untracked plan, issue source, `<P>` already archived in `SOURCE_ROOT`, and a working copy equal to `HEAD`;
  - a closed-run rejection.
- [ ] **New ledger operations.** `plan-reviewed`, `delivery-record` and `delivery-confirm` accept only their closed inputs on an open run. `plan-reviewed` hashes the plan itself. `appendix-merge` accepts the rendered digest after `delivery-confirm`. Unit tests cover all three.
- [ ] **Plan archival.** `test/workflow-contracts.test.mjs` pins all of these:
  - State A stages the archived file after `git mv`, and State D stages its refresh.
  - After a carry-over, the roots table and State A take over from `EXECUTION_ROOT`.
  - After a carry-over, State C leaves no carried `P` behind.
  - After a carry-over, cleanup precondition 3 compares with `reviewedPlanSha256`.
- [ ] **`scored-decisions.md`.** `test/scored-decisions-contract.test.mjs` asserts all of these, and the existing row-structure test passes:
  - the carry-over bullet: preconditions, completion target, blocked-archival rule;
  - the handback output in "Before `pr`";
  - the four rows of decision 9;
  - S-STSH and the "Fixed answers" bullet excluding the run's own plan.
- [ ] **Verification mapping.** The build verification mapping has the identical-tree zero-failure arm (`passed`, `executed`, no limitation) and the second-full-run arm. `test/build-validation-budget-contract.test.mjs` pins both arms, the `failed` arm for a valid run with attributed failures, and the unchanged `skipped` arm for a differing tree.
- [ ] **`autopilot.md`.** It names only fields that `config-resolve` returns, collects and filters fit sources from the delivery head per decision 8, wires the four new helper calls in the stated order, and says "run" for the plan-review step.
- [ ] **Rendered references.** After `node build.mjs`, no file under `dist/` contains a doubled backtick pair or an unbalanced code span around a rendered `tools/…` or `effective-flow-…` reference. `test/build-lib.test.mjs` covers exact spans, longer spans, exposed tools and the portable `AGENT_PROFILE` text.
- [ ] **`model-selection.md`.** It states the bare role form, and a test asserts that `select` rejects the prefixed form.
- [ ] **CI order.** `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` all pass.
- [ ] **Smoke runs.** Two repeated plan-source smoke runs in `fastner/ef-autopilot-smoke-public` end in draft PRs. Both smoke plans recommend `build`.
  - One uses a new plan committed and pushed to `main` before the run (State A, restore `restored`).
  - One uses a new untracked plan (State C, existing cleanup).
  - On each branch, the archived plan contains the plan-review edits and the Build completion section.
  - Afterwards, the primary checkout's `git status --porcelain` is empty.
  - The appendix names the archived path.

## Validation plan

- Unit tests: `node --test test/autopilot-core.test.mjs test/scored-decisions-contract.test.mjs test/build-validation-budget-contract.test.mjs test/build-lib.test.mjs test/model-selection.test.mjs`, plus the plan-archival section of `test/workflow-contracts.test.mjs`.
- Full CI order through `t3-project exec --environment effective-flow-node24`.
- Rendered-output check: search `dist/` for doubled pairs and unbalanced spans around `tools/` and `effective-flow-` references after the build.
- Manual smoke runs: repeat the plan-source run twice against `fastner/ef-autopilot-smoke-public` from the built portable target. Use one committed-and-pushed and one untracked new plan, both recommending `build`. Check the branch content, the checkout status and the appendix.
- Report behavioural eval evidence debt (`pnpm eval <tool> verify`) for every suite whose load set includes a changed source; do not re-record it.

## Assumptions and open points

- No reader of `run-close`'s `data.fit` exists outside `autopilot.md` Phase 6. The implementer confirms this with a repository search before changing the shape.
- `build` runs inline-only today. If its delegated build-run transport is activated, the carried `EXECUTION_ROOT` copy must be reconciled with `build-run`'s plan binding and copy-removal rules (`src/scripts/build-run-core.mjs`, `src/shared/build-run-contract.md`).
- The architecture-fit leaf can read Git objects with `git show`. It already reads only, so this changes its handoff, not its authority.
- The second smoke run's improvisations are not regressions to keep: it treated the plan-review edit as non-foreign and collected sources before withdrawal. This plan replaces both with specified behaviour.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    1 |
| Security        |        0 |         0 |    1 |
| Data protection |        0 |         1 |    1 |
| Error cases     |        0 |         2 |    2 |
| Testability     |        0 |         1 |    1 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    0 |

### Findings

Deep plan review of 2026-11-18. Earlier rounds in this run (gap analysis, internal review, scoped re-review) are fully incorporated or were decided by the user, including one Critical finding: State C after a carry-over.

- **Data protection, Important, incorporated:** a confirmed head did not prove that the reviewed plan reached it. The restore now also requires the recorded archive path on the confirmed head (decision 3).
- **Architecture, Important, decided by the user:** `executionRoot` could not be recorded while the worktree still existed. The field is dropped. In-place delivery is detected by `<P>` being missing or untracked in `SOURCE_ROOT` (decision 3). The handback reports the archive path (decision 2).
- **Error cases, Important, decided by the user:** a blocked archival after a carry-over commits the carried plan unarchived and reports it (decision 4).
- **Error cases, Important, decided by the user:** autopilot filters fit sources itself. The leaf lists at most 20, and the `unavailable` fallback records no source list (decision 8).
- **Testability, Important, decided by the user:** `transformRefs` becomes code-span-aware for all internal placeholders, which also fixes broken longer spans, with no build guard (decision 7).
- **Scope, Important, decided by the user:** the recommended workflow is Feature (`effective-flow build`), because the plan adds helper operations and a write to the user's checkout.
- **Error cases, Note, incorporated:** all three partial-diff confirmations get `blocker` rows (decision 9).
- **Error cases, Note, incorporated:** the in-place edge case and the overlap rule now cover multi-path cells, directory entries and the German heading (decision 9).
- **Architecture, Note, incorporated:** the plan-archival "Execution roots" table is in the affected files.
- **Security, Note, incorporated:** `plan-reviewed` hashes the plan itself; no model-computed hash enters the ledger.
- **Testability, Note, incorporated:** "never touches the index" became "index entries unchanged", and a held `index.lock` maps to `kept`. The code-span collapse states its output for exposed tools and the portable `AGENT_PROFILE`.
- **Data protection, Note, incorporated:** a tracked plan whose checkout copy is behind the base blocks the carry-over instead of reverting newer base text (decision 4).

## Open points

- No open points.
