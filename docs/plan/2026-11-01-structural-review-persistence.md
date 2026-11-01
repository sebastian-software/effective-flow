# Structural review persistence

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

This plan implements work package 9, "Structural review persistence", of `docs/concept/2026-10-29-runtime-state-cli.md`, on the branch of pull request #601. Its goals:

- Realistic `effective-flow review` runs persist their findings, because findings reach chat only through the report helper. A run that skips the helper then has nothing it may present.
- The migration cell is covered too. Without the anchor of fix round 1, it reaches the runtime directory migration only through the review persistence call.
- The success criterion is re-measured realistically with the work package 8 harness until review and the migration meet the work package 8 criterion.

Evidence from work package 8 (`docs/developer-guide/claude-code-allowlist-evidence.md`, "Work package 8 measurement", on the #601 branch):

- Across both rounds, review was exercised in 5 of 12 runs and the migration cell in 5 of 12.
- Every unexercised run made no helper call at all. Each gave the small diff as its reason, reviewed inline and wrote the findings straight into chat.
- `review open-report` made the step cheap and free of prompts, and the bold rule under `## Goal` made it explicit, but neither made it unskippable.

Today's local persistence is a chain of three skippable steps:

1. reserve the IDs and allocate the path through `open-report`;
2. write the report by hand;
3. present the findings.

This plan collapses the chain into one helper call, `review write-report`. It takes the admitted findings as structured input, reserves their IDs, renders and writes the report, and returns the chat summary. That summary is the run's only way to present findings.

The skipping runs of work package 8 never reached Phase 4, so the operation alone may not be enough. The fix rounds therefore have predetermined, stacking levers: first a Phase-1 anchor operation `review begin`, then the presentation rule in the router entry for review.

Workflow rationale: Feature (`effective-flow build`). The plan adds a new helper operation, changes review behaviour, and adds a no-clobber write primitive and a new allow rule.

## Architecture decisions

- **One write operation, not a render step after a hand-written report.** `review write-report` reserves, renders, writes and summarises in one call. The user chose this single write operation over a render step or a begin/finish pair for round 1.
- **The helper renders, and the fragment owns the format.** `src/shared/review-report-format.md` stays the only format owner. The renderer implements exactly that format in both complete languages (`en`, `de`).
  - The fragment gains the labels and line texts it lacks today, as a deliberate format addition:
    - German labels for Admission outcome, Admission reason, Admission gate, Evidence, Evidence digest, Current reachability, Root-cause signature, Scope and containment, Why now, Completion condition and Closed observations
    - the German displayed severity and complexity values
    - the notes-filtered and validation-skipped lines in both languages
  - The renderer test reads these lists from the fragment.
  - The other writers keep writing the format in prose: `build`, `fix`, `maintain` and `refactor` through `unresolved-review-report`, and the forge finding issue.
  - Augmenting an existing report also stays a prose path outside `write-report`. `write-report` only creates new reports.
- **Closed values; the helper fills the constants.**
  - **Closed sets:** `severity`, `complexity`, `action` (`fix`, `refactor`, `build`, `docs`) and `security` (`external`, `internal`, `none`).
  - **Filled by the helper:** the constants `Admission outcome: admitted` and `Admission gate: v1`. They are not input.
  - **Action values:** the format's `Action` field and Action table hold target-specific invocations. Runtime scripts are copied byte for byte, so the input carries a closed key `invocationPrefix`. The review prose fills it with the existing build placeholder `{{FLOW}}`, and the helper accepts only its three rendered forms: `/effective-flow`, `$effective-flow` and `effective-flow`.
- **Findings reach chat only through `result.summary`.** This rule replaces the work package 8 bold rule under `## Goal`:
  - Review presents no finding, finding title or severity count before `review write-report` returns.
  - In local mode, the chat presentation is `result.summary` as returned. After it come only framing without finding content (no restated finding, title, severity or location) and the next-steps block.
  - The rule names the small-diff inline review explicitly.
  - The overflow path has its own presentation: the report path and the severity counts, after the report file exists.
- **Predetermined, stacking levers (user decisions).** Each lever is applied only when the previous round misses the criterion, and it stays in place for the later rounds.
  - **Round 1:** `write-report` plus the presentation rule.
  - **Fix round 1:** a new anchor operation `review begin`, called in Phase 1 in local mode, before the diff is read.
    - It runs the migration precheck. On `MIGRATION_REQUIRED`, the run executes `memory migrate-directory` here and calls `begin` once more.
    - It guards and creates `.effective-flow/review/`, allocates the prospective report path, and records a single-use handle below `.effective-flow/review-sessions/`. That directory sits outside `review/`, so no report reader or name-allocation scan sees it.
    - From then on, `write-report` requires the handle and consumes it. An unknown or already consumed handle is `HANDLE_UNKNOWN`, with nothing reserved.
    - A zero-finding run leaves only the directory and an unconsumed handle. `begin` prunes handles older than 24 hours.
    - The rule set grows to 55.
  - **Fix round 2:** the presentation rule also goes into the catalog and dispatch entry for review in `src/SKILL.md`. The router carries it before `review.md` is read.
- **Scope: local mode and the migration only (user decision).** The publishing target and the pull-request special case keep `memory reserve` and their contract tests.
- **`review open-report` stays, as the overflow path.** The run falls back to today's `open-report` call plus a hand-written report in two cases:
  - `write-report` returns `INPUT_TOO_LARGE`;
  - the shell refuses the command with "Argument list too long", which happens before `node` starts.

  The overflow path sits behind a ` ```lazy-include ` at that decision point. The appendix-only report and the publishing target's security report keep the path-only `name-allocate` allocation.

- **Standard input stays at 64 KiB.** Roughly 20 or more findings fit. There is no per-operation limit: a larger one would collide with the per-argument limit of the wrapped shell command, and no unit test can reproduce that wrapper. Oversized input becomes a distinct error code, `INPUT_TOO_LARGE`, for every state operation. It is in the same exit class as `INVALID_INPUT` and replaces today's size case of `INVALID_INPUT`.
- **Allowlisted, with the bound stated.** `write-report` and, with fix round 1, `begin` join `ALLOWLISTED_OPERATIONS`.
  - Each comment in `claude-settings-core.mjs` states the operation's bound: it writes only below `.effective-flow/`, uses a generated name, never clobbers, caps input at 64 KiB, and consumes IDs per successful reservation.
  - An install with an earlier, smaller set reads as `stale` under the existing partial-set rule.
- **Delivery in place on #601 (user decision).**
  - **Where the build runs:** in a user-managed worktree on `effective-flow/build/helper-step-and-call-shape-compliance`, the branch of pull request #601 (currently 97f773b7). It runs in place and commits directly onto #601. The user's `develop` checkout stays untouched.
  - **The plan:** it gets no separate publication; it is committed with the build.
  - **No second pull request:** #601 is the only one, and it carries work packages 8 and 9 together into `develop`.
  - **Retitling:** at close-out, #601 is retitled to a Conventional Commits `feat:` title covering both work packages. Under its current `docs: plan …` title, release-please would see no feature.
  - **Draft state:** #601 is marked ready only when the criterion holds.
- **Measurement policy (user decisions).**
  - One measurement round is followed by at most two fix rounds.
  - Any change to review's load set triggers a re-measurement of both cells (review and migration) in both modes. The load set is `review.md` and the fragments it includes, the state helper and renderer, and `src/SKILL.md`.
  - The evidence standard stays at n=3 per mode, and the verdict names that sample limit.
  - One round costs about 2.50 USD.

## Affected files

All paths are relative to the #601 branch. Rows marked "fix round 1" or "fix round 2" apply only when that lever is applied.

| File                                                                                                                                                                     | Description                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/effective-flow-state-review-core.mjs`                                                                                                                       | New `writeReport` handler: validate and sanitise, migration precheck, path allocation, ID reservation, rendering, no-clobber create with a bounded internal re-allocation, verification, summary. Fix round 1 adds `begin` and the handle check.                                                                                                                                            |
| `src/scripts/review-report-render.mjs` (new; name decided at build time)                                                                                                 | Pure renderer: structured findings, language and invocation prefix in; report Markdown and chat summary out. Added to `RUNTIME_SCRIPT_FILES`.                                                                                                                                                                                                                                               |
| `src/scripts/runtime-state-guard.mjs`                                                                                                                                    | New no-clobber create primitive: a temp file named `.write-report-<random>.tmp`, then `link()` to the target, then unlink the temp. On a post-link verification failure, the target is removed only if its inode is the one the helper created. A temp file older than one hour is pruned on the next call. The temp-name pattern matches no `review-report-local` name and no reader glob. |
| `src/scripts/effective-flow-state-core.mjs`                                                                                                                              | Register the operation(s) in `STATE_OPERATIONS`, `STATE_OPERATION_CLASSES` (`allowlisted`), `OPERATION_KEYS` and `HANDLERS`. Add `INPUT_TOO_LARGE` to `STATE_ERROR_CODES` and `EXIT_CODES`, and `REPORT_WRITE_FAILED` (plus `HANDLE_UNKNOWN` with fix round 1) to `OUTCOME_CODES`, so `errorEnvelope` keeps the codes.                                                                      |
| `src/scripts/effective-flow-state.mjs`                                                                                                                                   | Raise `INPUT_TOO_LARGE` for oversized standard input; add `OUTCOME_MESSAGES` for the new outcomes.                                                                                                                                                                                                                                                                                          |
| `src/scripts/claude-settings-core.mjs`                                                                                                                                   | Add the operation(s) to `ALLOWLISTED_OPERATIONS` with the bound comment: 54 rules, or 55 with fix round 1.                                                                                                                                                                                                                                                                                  |
| `src/tools/review.md`                                                                                                                                                    | The presentation rule under `## Goal`; the local bullet of the persistence gate; local steps 2, 6 and 8 rewritten around one `write-report` call; handling of `INVALID_INPUT`, `MIGRATION_REQUIRED` and `REPORT_WRITE_FAILED`; Usage step 6; the task list. Fix round 1 adds the Phase-1 `begin` step.                                                                                      |
| `src/shared/review-write-report-fallback.md` (new, lazy)                                                                                                                 | The overflow path (`open-report` plus a hand-written report) and its presentation.                                                                                                                                                                                                                                                                                                          |
| `src/shared/review-report-format.md`                                                                                                                                     | The missing German labels, displayed values and the two line texts; names `review write-report` as review's renderer.                                                                                                                                                                                                                                                                       |
| `src/shared/helper-call-shape.md`                                                                                                                                        | Add the new operation(s) to the argv list.                                                                                                                                                                                                                                                                                                                                                  |
| `src/shared/review-state.md`, `src/shared/memory-state.md`                                                                                                               | Name `write-report` as the local reservation path, its `MIGRATION_REQUIRED` retry and `INPUT_TOO_LARGE`.                                                                                                                                                                                                                                                                                    |
| `src/shared/setup-allowlist.md`, `src/shared/setup-status.md`                                                                                                            | Rule count and operation list.                                                                                                                                                                                                                                                                                                                                                              |
| `src/SKILL.md` (fix round 2)                                                                                                                                             | The presentation rule in the review catalog and dispatch entry.                                                                                                                                                                                                                                                                                                                             |
| `build.mjs`                                                                                                                                                              | Add the renderer to `RUNTIME_SCRIPT_FILES`; re-measure the `CONTEXT_BUDGET_LINES` entry for `review`.                                                                                                                                                                                                                                                                                       |
| `evals/iterate/suite.config.mjs`, `evals/merge-gate/suite.config.mjs`                                                                                                    | Add the renderer module to `LOAD_SET_SEEDS`.                                                                                                                                                                                                                                                                                                                                                |
| `test/effective-flow-state-review.test.mjs`, `test/review-report-render.test.mjs` (new), `test/runtime-state-guard*.test.mjs`                                            | Operation, renderer and primitive cases (see Acceptance criteria).                                                                                                                                                                                                                                                                                                                          |
| `test/helper-step-contract.test.mjs`, `test/helper-call-shape-contract.test.mjs`, `test/setup-allowlist-contract.test.mjs`, `test/effective-flow-state-harness.test.mjs` | Pins for the rule, the call shape, the rule count and the error codes.                                                                                                                                                                                                                                                                                                                      |
| `docs/developer-guide/configuration.md`, `architecture.md`, `build-system.md`, `docs/user-guide/tools-setup.md`                                                          | Rule count, the new operation(s), the renderer module.                                                                                                                                                                                                                                                                                                                                      |
| `docs/developer-guide/claude-code-allowlist-evidence.md`                                                                                                                 | New section "Work package 9 measurement".                                                                                                                                                                                                                                                                                                                                                   |
| `docs/concept/2026-10-29-runtime-state-cli.md`                                                                                                                           | The work package 9 result. The work package 8 result is amended when the criterion holds.                                                                                                                                                                                                                                                                                                   |
| `docs/plan/2026-10-31-helper-step-and-call-shape-compliance.md` (tracked on #601)                                                                                        | Its blocked criterion is closed with a reference to the work package 9 evidence when the criterion holds.                                                                                                                                                                                                                                                                                   |
| `docs/plan/2026-11-01-structural-review-persistence.md`                                                                                                                  | This plan, taken over from the `develop` checkout into the #601 worktree and committed with the build.                                                                                                                                                                                                                                                                                      |
| `.effective-flow/spikes/allowlist/<new round dir>/` (untracked runtime state)                                                                                            | Harness copy with the edits in Approach step 12.                                                                                                                                                                                                                                                                                                                                            |

## Implementation details

### Approach

1. **Worktree.** The user creates a worktree on the #601 branch. The build runs in place there and verifies that the head equals 97f773b7, or records the newer head. It then copies this plan from the `develop` checkout into the worktree's `docs/plan/`.
2. **Fragment additions.** Add the missing German labels, displayed values and both line texts to `review-report-format.md`.
3. **No-clobber primitive.** Implement it in `runtime-state-guard.mjs` as described under Affected files.
   - It reports `EEXIST` distinctly.
   - It never leaves a partial target.
   - On a post-link failure it removes the target only when the inode matches.
4. **Renderer.** A pure module covering:
   - the title and header fields;
   - the three summary tables;
   - one finding block `### [R-NNNNNNN] <title>` per finding, in the fragment's field order;
   - the skipped-findings table and the optional closed observations;
   - the disclosure banner for a `local-only` finding;
   - the notes-filtered and validation-skipped lines.

   It renders one complete form per language. Machine tokens stay unchanged: IDs, paths and the `external`/`internal` exposure tokens. Action values are `<invocationPrefix> <action>`. The date is the helper's local date.

5. **Input contract.** One JSON object with closed keys.
   - **Top level:** `cwd`, `owner:{workflow:"review"}`, `language` (`en`|`de`), `invocationPrefix`, `scope`, `projectType` and `findings`. With fix round 1, `handle` is required too.
   - **Optional top-level keys:** `skipped`, `closedObservations`, `notesFiltered`, `validationSkipped`, `waitSeconds`.
   - **Required per finding:** title, severity, complexity, area, file, problem, recommendation and action, plus the stable gate fields that `apply-review` step 7 implements. Those are admission reason, evidence, evidence digest, current reachability, root-cause signature, scope and containment, why now, and completion condition.
   - **Optional per finding:** security, prompt suggestion, developer note.
6. **Sanitising.** Finding text must not forge report structure.
   - Single-line fields and table cells reject newlines, and table cells escape `|`.
   - In multi-line fields, the helper neutralises any line that starts with `#` or looks like a field-label line (`- **…**:`). Indentation is one way.
7. **Operation order.**
   1. Validate and sanitise the whole input. With fix round 1, also check the handle.
   2. Run the read-only `precheckMigration`: `MIGRATION_REQUIRED` comes before any write.
   3. Guard and create the report directory and allocate the path. With fix round 1, start from the handle's prospective path.
   4. Reserve exactly `findings.length` IDs.
   5. Render with the reserved IDs and create the file through the no-clobber primitive. On `EEXIST`, re-allocate and retry inside the helper, at most three times.
   6. Verify the written bytes, consume the handle and build the summary.

   The result carries the reserve result, `reportPath`, `reportName`, `reportDate`, `ids` and `summary`.

8. **Outcomes and errors.**
   - **Before the reservation (nothing reserved):** `INVALID_INPUT`, which names the failing key and finding index; `INPUT_TOO_LARGE`; `MIGRATION_REQUIRED`; `HANDLE_UNKNOWN` with fix round 1; and the inherited reserve outcomes, such as `LOCK_HELD`.
   - **After the reservation:** every failure is caught into the outcome `REPORT_WRITE_FAILED`. It carries `firstId`, `lastId`, the failing step and, for a guard refusal, the guard code (`RUNTIME_STATE_UNSAFE`, `UNSAFE_TARGET`), so the run keeps its "direct to setup" handling. No partial report remains.
9. **Summary.** Chat-ready Markdown in the report language:
   - the severity counts;
   - one line per finding with ID, severity, title and file;
   - the report path;
   - the notes-filtered and validation-skipped lines.

   A `local-only` finding's line is marked as withheld and drops the file location.

10. **Registration and allow rule.**
    - Register the operation in the four operation tables and the code lists, with its outcome messages.
    - Add it to `ALLOWLISTED_OPERATIONS` with the bound comment.
    - Update every prose and doc place that names the rule count or the state operations.
    - Add the renderer to `RUNTIME_SCRIPT_FILES` and to both eval suites' `LOAD_SET_SEEDS`.
11. **Review prose.**
    - Replace the Goal rule with the presentation rule, and rewrite the local persistence-gate bullet and local step 2 around one literal `write-report` call, with `"invocationPrefix":"{{FLOW}}"`.
    - Step 6 becomes "present `result.summary`". Step 8 says the next-steps block is the last element of the chat report.
    - Outcome handling:
      - `INVALID_INPUT`: one corrected retry, then stop and name the key.
      - `MIGRATION_REQUIRED`: one `memory migrate-directory` call, then one retry; a second `MIGRATION_REQUIRED` stops the run.
      - `INPUT_TOO_LARGE` or "Argument list too long": the lazy overflow path.
      - `REPORT_WRITE_FAILED`: stop and name the ID gap and the failing step.
    - Re-measure the `review` budget from the build report.
12. **Harness for round 1.** Copy the work package 8 harness into a new round directory and edit it:
    - **Build source:** `link-skill.sh` points at the #601 worktree's build output, not `build-wp8-20261031`.
    - **Paths and IDs:** the round-directory constant `N` in `run.sh` and the analyzer points at the new directory. Run IDs use the prefix `w9-`, in `drive.sh`, the analyzer's `ID_RE`, and `reset.sh`'s seed case.
    - **Literal shape:** the analyzer's literal-shape regex `LIT['state']` admits `review write-report` and `review begin`.
    - **Exercised, review:** `write-report` or `open-report` succeeded, a report file holds every ID from the result's `firstId` to `lastId`, and `lastFindingNumber` covers them. A zero-finding or no-call run is unexercised.
    - **Exercised, migration:** `memory migrate-directory` succeeded, the marker is present, and a successful `write-report` or `open-report` followed in the same run.
    - **Valid:** every completed run on the seeded diff. The seed-text heuristic and the overrides are removed. Only harness failures are invalid (timeout, crash, budget stop), and they are repeated up to the existing attempt cap.
    - **Presented before persisting:** a run counts as presented-before-persisting when an assistant text block containing an `R-` ID, a seeded finding's function name or a severity count appears before the first successful `write-report` result. The analyzer reports this flag per run; it does not enter the criterion.
13. **Rounds.**
    - Run round 1: the review and migration cells, default and auto, 3 runs each.
    - If the criterion fails, apply fix round 1 (`review begin`, 55 rules) and re-measure both cells in both modes.
    - If it still fails, apply fix round 2 (the router rule) on top and re-measure the same way.
    - Record each round's cost, numbers, flags and verdict.
14. **Close-out.**
    - Write "Work package 9 measurement" with the rounds, the n=3 limit, the WP9 validity rule and the uncovered points: the publishing target, the pull-request special case, and auto-mode behaviour on multi-KiB commands, since the seed holds about two findings.
    - Record the result in the concept and retitle #601.
    - **On success:** close work package 8's blocked criterion in its tracked plan, mark both plans implemented, and mark #601 ready.
    - **On a miss after fix round 2:** deliver blocked. #601 stays a draft, this plan stays `Not implemented`, and it gets one blocking open point naming the measured numbers.

### Edge cases

- **Zero admitted findings:** no `write-report` call, and no finding is presented. With fix round 1, the `begin` handle stays unconsumed and is pruned later.
- **Only the standalone-audit appendix:** path-only allocation, as today.
- **Notes filtered by the default scope:** they are not passed in; `notesFiltered: true` renders the line.
- **A `local-only` security finding:** the report shows the banner, and the summary withholds the location.
- **German project:** `language: "de"` renders the complete German form.
- **Report path taken:** the helper re-allocates internally, a bounded number of times. The prose has no branch for it.
- **A finding missing a stable gate field:** `INVALID_INPUT` without a reservation, then one corrected retry.
- **Very large review:** `INPUT_TOO_LARGE` or "Argument list too long" leads to the overflow path and its own presentation.
- **Apostrophes, newlines or forged headings:** JSON escaping, the `'\''` rule, then sanitising. A malformed here-string is `INVALID_INPUT`.
- **Legacy `.firmo/` directory:** `MIGRATION_REQUIRED` before any write, then `memory migrate-directory`, then one retry. With fix round 1 this happens at `begin`.
- **Augmenting an existing report:** stays the prose path; out of scope for `write-report`.

## Acceptance criteria

Criteria 1 to 4 cover the levers actually applied; the fix-round parts apply only when that lever was applied. The plan is complete when all five hold. A blocked delivery has criteria 1 to 4 checked, criterion 5 unchecked, and the evidence section written.

- [x] `review write-report` behaves as specified: input contract, closed values, sanitising, operation order, bounded re-allocation, outcomes and error codes. Tests cover:
  - a fresh repository
  - `MIGRATION_REQUIRED` before any write
  - `LOCK_HELD`, `INVALID_INPUT` and `INPUT_TOO_LARGE`, each with nothing reserved
  - a taken path resolved internally
  - `REPORT_WRITE_FAILED` carrying the range and guard code, with no partial report
  - English and German rendering against the fragment's label lists
  - all three `invocationPrefix` forms, and the rejection of any other
  - forged-structure input neutralised
  - a summary listing every reserved ID, with `local-only` locations withheld
  - with fix round 1: `review begin`, single-use handles, `HANDLE_UNKNOWN` and pruning
- [x] `review.md` presents local-mode findings only as `result.summary`, its Goal rule names the small-diff inline review, and `open-report` is reachable only through the lazy overflow path. `test/helper-step-contract.test.mjs` pins these points. With fix round 1 it also pins the Phase-1 `begin` step, and with fix round 2 the router rule.
- [x] The allow-rule set has 54 rules (55 with fix round 1), and the setup prose, docs and contract tests name that number.
- [x] CI's order passes in the #601 worktree: `pnpm agent:check`, `pnpm test`, `node build.mjs` (budgets included), `pnpm test:distribution`.
- [ ] **Blocked:** within one round, the realistic measurement with the edited harness meets the work package 8 criterion under the WP9 validity rule, for review and the migration cell. Each must be exercised in at least 2 of 3 valid runs per mode, with helper housekeeping at 0 prompts and 0 refusals.
  - The pass must come within at most two fix rounds.
  - Both cells and both modes are re-measured after every load-set change.
  - The result is recorded in "Work package 9 measurement" with the n=3 limit.

## Validation plan

- Unit tests for the renderer, the no-clobber primitive and the operation(s), as listed in the first acceptance criterion.
- Contract tests for the review prose, the call shape, the error codes and the rule count.
- CI order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- One manual literal `write-report` call in a scratch repository, with the report checked against `review-report-format.md`.
- The realistic measurement as in Approach steps 12 and 13, with the manifest digest in the evidence document.

## Assumptions and open points

- **One shared report format.** Moving the other report writers to the renderer is out of scope.
- **The summary is enough.** A summary without recommendations is an acceptable chat presentation, because the full content sits in the report it points to.
- **The user creates the #601 worktree.** The build runs in place there. The untracked copy of this plan in the `develop` checkout is not cleaned up by the build: plan archival handles it at delivery, as with work package 8's copy.
- **Eval suites.** `iterate` and `merge-gate` load the review and state cores and gain the renderer seed. They already owe a re-recorded round from work package 8. This plan adds to that debt, which falls due before the next release, not before the merge.

## Implementation notes

- **Round 1 as planned.** `review write-report` (handler in `src/scripts/effective-flow-state-review-core.mjs`, pure renderer `src/scripts/review-report-render.mjs`, `createNoClobber` in `src/scripts/runtime-state-guard.mjs`), `INPUT_TOO_LARGE` for every state operation, the `REPORT_WRITE_FAILED` outcome, 54 allow rules, the presentation rule in `review.md`, `open-report` behind the lazy `src/shared/review-write-report-fallback.md`, and the missing German labels in `review-report-format.md`.
- **Contract choices made during the build.** `admissionReason` is closed to `material-harm` and `irreversible-commitment`; `developerNote` is accepted only empty and is not listed in the prose; `security` is required on every finding; when `link()` is unsupported (`ENOTSUP`, `EOPNOTSUPP`, `EPERM`, `EXDEV`, `ENOSYS`) the create falls back to an exclusive no-follow create with verification; `REPORT_WRITE_FAILED` carries `foreignPath` when a foreign file holds the generated name.
- **`helper-call-shape.md` and `setup-status.md` unchanged.** Neither lists operations or a rule count, so nothing there was stale.
- **`apply-review` reads the German admission labels** (step 6 aliases), so a German report written by the helper passes step 7's gate.
- **Fix rounds deviate from the predetermined levers (user decisions).** Round 1 persisted in 12 of 12 runs, so the Phase-1 anchor `review begin` and its 55th rule were not built. Fix round 1 instead narrowed the `runtime-state-safety` and `effective-flow-dir-migration` lazy triggers in `review.md` to mutations outside a state-helper call and added "no `cd`" at the call; fix round 2 added the bare helper-call rule and review's presentation rule to the router (`src/SKILL.md`). Both are pinned in `test/helper-step-contract.test.mjs`. The `review` budget is 861/864.
- **Harness.** `.effective-flow/spikes/allowlist/2026-11-01-02/` with `analyze_wp9.py`, `w9-` run ids, the link to the #601 worktree build and the 54-rule assertion.

## Test results

- `corepack pnpm agent:check`: passed (1100 files).
- `corepack pnpm test`: 3372 tests, 3369 passed, 0 failed, 3 skipped (final run after fix round 2).
- `node build.mjs`: passed, every `CONTEXT_BUDGET_LINES` entry within budget.
- `corepack pnpm test:distribution`: offline checks passed.
- Realistic measurement: three rounds, 36 valid runs, 9.52 USD; persistence in 35 of 36 runs; criterion missed in the migration cell, default mode, by one housekeeping prompt per round. Details: `docs/developer-guide/claude-code-allowlist-evidence.md`, "Work package 9 measurement".

## Review findings

**Date:** 2026-11-01
**Reviewer:** Node.js reviewer, generic product reviewer (reduced depth), re-check reviewer

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    23 |
| Open / Not implemented |     1 |

The open item is a Note: `apply-review`'s step 7 gate sentence names only the English `Admission outcome: admitted`; German reports pass through step 6's aliases, and the sentence was not extended because `apply-review` is at its line budget (1053/1053).

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         6 |    1 |
| Security        |        0 |         1 |    1 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         4 |    3 |
| Testability     |        0 |         4 |    3 |
| Scope           |        0 |         0 |    4 |
| Maintainability |        0 |         1 |    1 |

### Findings

#### Internal plan review (2026-11-01)

- **Architecture, Important:**
  - **Problem:** The presentation rule alone was still prose, and work package 8's skipping runs never reached Phase 4.
  - **Change:** Incorporated by user decision: predetermined fix-round levers.
- **Architecture, Important:**
  - **Problem:** A raised input limit could not be guarded below the shell's per-argument limit.
  - **Change:** The 64 KiB limit stays. `INPUT_TOO_LARGE` and "Argument list too long" both route to the overflow path.
- **Architecture, Important:**
  - **Problem:** Runtime scripts cannot know the target-specific Action invocation.
  - **Change:** A `{{FLOW}}`-filled `invocationPrefix`.
- **Security, Important:**
  - **Problem:** Finding text could forge report structure.
  - **Change:** Newline rejection, `|` escaping and neutralised heading or field lines.
- **Security, Note:**
  - **Problem:** The allowlisted write of model content was prompt-free without a stated bound.
  - **Change:** The bound is stated in the allow-list comment, and the multi-KiB auto-mode limit is named as uncovered.
- **Data protection, Note:**
  - **Problem:** `local-only` locations would reach chat.
  - **Change:** Those summary lines are withheld.
- **Error cases, Important:**
  - **Problem:** The exclusive create had no primitive, and failures after the reservation lost the range.
  - **Change:** A temp-file-and-link primitive and `REPORT_WRITE_FAILED`.
- **Error cases, Important:**
  - **Problem:** The taken-path handling was undecided.
  - **Change:** Bounded internal re-allocation.
- **Error cases, Important:**
  - **Problem:** `INVALID_INPUT` had no handling, and the required set was unnamed.
  - **Change:** Named the required set and allowed one corrected retry.
- **Error cases, Note:**
  - **Problem:** The size code's class was unclear.
  - **Change:** An error in the `INVALID_INPUT` exit class, for every operation.
- **Testability, Important:**
  - **Problem:** Re-measuring only the failing cells could hide a regression.
  - **Change:** Both cells and both modes are re-measured after every load-set change.
- **Testability, Important:**
  - **Problem:** The validity heuristic moved skips into the invalid bucket.
  - **Change:** Every completed run is valid.
- **Testability, Note:**
  - **Problem:** n=3 is within the noise.
  - **Change:** Kept by user decision, with the limit disclosed.
- **Scope, Note:**
  - **Problem:** The framing could restate findings.
  - **Change:** The framing carries no finding content, and a presented-before-persisting flag is reported.
- **Scope, Note:**
  - **Problem:** The work package 8 plan copy and step 8's wording were ambiguous.
  - **Change:** The tracked copy is edited, and step 8 names the chat report.
- **Maintainability, Important:**
  - **Problem:** The fragment lacked German labels, which would have put a second format copy in code.
  - **Change:** The fragment gains them.
- **Maintainability, Note:**
  - **Problem:** The eval seeds were missing, and the tables were miscounted.
  - **Change:** Corrected.

#### Deep plan review (2026-11-01)

- **Architecture, Important:**
  - **Problem:** The build cannot target the #601 branch as configured.
  - **Change:** User decision: in-place delivery on #601 in a user-managed worktree, with no separate plan publication and #601 as the only pull request.
- **Architecture, Important:**
  - **Problem:** The fix-round-1 anchor contradicted the input contract, the rule count, the overflow rule and the zero-finding case.
  - **Change:** User decision: a new operation `review begin` with a single-use handle, 55 rules, acceptance criteria per lever, and a stricter migration criterion.
- **Architecture, Important:**
  - **Problem:** The reviewer-worker lever could not work. The reviewers have no Bash, run before admission, and are absent from inline runs.
  - **Change:** User decision: fix round 2 puts the rule into the router entry instead.
- **Architecture, Note:**
  - **Problem:** The enums, the helper-filled constants and the placeholder name were open.
  - **Change:** The closed sets, the constants and `{{FLOW}}` are stated.
- **Error cases, Important:**
  - **Problem:** New codes missing from the core's code lists would collapse to `INTERNAL_ERROR`.
  - **Change:** `STATE_ERROR_CODES`, `EXIT_CODES` and `OUTCOME_CODES` are named.
- **Error cases, Note:**
  - **Problem:** The overflow path had no defined presentation.
  - **Change:** It shows the report path and the severity counts.
- **Error cases, Note:**
  - **Problem:** Verification cleanup, the temp-file naming and guard-code handling were open.
  - **Change:** An inode-bound cleanup, a non-matching temp name with pruning, and the guard code kept in the outcome.
- **Testability, Important:**
  - **Problem:** The fix-round stacking, the "change" scope and the blocked exit were unspecified.
  - **Change:** The levers stack, the load set is defined, and the acceptance criteria state the blocked exit.
- **Testability, Important:**
  - **Problem:** The harness's hard-coded constants were not covered.
  - **Change:** Every harness edit is listed.
- **Testability, Note:**
  - **Problem:** The redefined validity made the work package 8 comparison unequal.
  - **Change:** Named "the WP8 criterion under the WP9 validity rule".
- **Testability, Note:**
  - **Problem:** The presented-before-persisting signal was undefined.
  - **Change:** Defined from the transcript order.
- **Scope, Note:**
  - **Problem:** A squash under the `docs:` title would hide the features, and the merge order was unnamed.
  - **Change:** Retitle #601 at close-out; it is the only pull request.
- **Scope, Note:**
  - **Problem:** Augmenting an existing report was unaddressed.
  - **Change:** It stays a prose path outside `write-report`.

## Open points

- **Blocking:** the migration cell in default mode still raises one helper-housekeeping prompt per round: after `MIGRATION_REQUIRED` a run may look up the next step in the skill source or the runtime files before calling `memory migrate-directory`. Re-entry: make the outcome carry the exact next call (or let `write-report` run the migration itself), then re-measure with `.effective-flow/spikes/allowlist/2026-11-01-02/` until the work package 8 criterion holds; `effective-flow plan docs/plan/2026-11-01-structural-review-persistence.md` revises this plan for that step.
