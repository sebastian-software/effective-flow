# Merge-gate marks a delivered draft ready after user confirmation

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

After `effective-flow autopilot`, the recommended next step is `effective-flow merge-gate <PR>` (`src/shared/next-steps.md:250`). Autopilot always ends in a draft (`src/tools/autopilot.md:2`), and merge-gate's Phase 4 condition 3 requires "mergeable and **not a draft**" (`src/shared/merge-gate-delegated-run.md:1216`). So the recommended step can never merge the PR it is recommended for. In the PR #697 session that took four invocations, a manual `gh pr ready`, and a manual issue close.

Goal: a merge-gate run in which the user can answer, on a draft holding a **delivered, unblocked implementation**, shows the PR's autopilot decision record (if one is present and verified; otherwise the note that it is missing or unverifiable) once all other merge conditions hold. It then asks whether to mark the PR ready for review. On confirmation it marks the PR ready with the existing `pr-mark-ready` tracker action, re-reads the state, and continues to the merge.

- Non-interactive runs never mark ready.
- Relayed runs mark ready only after the user's answer comes back through the caller.
- A plan-only draft, a draft with recorded blockers, or a draft whose plan-draft finish is incomplete is never offered.
- GitHub and Forgejo are both covered. Forgejo gets its own trigger rule, because there a draft is a WIP title prefix. Verified fact: issue-path autopilot continuations on Forgejo are already out of draft when merge-gate sees them. With `Keep draft: requested`, `pr-update-title` sets the final title without the WIP prefix (`pr-automation-lines.md:10-12`, `pr.md:288-289`, `remote-tracker-forgejo-core.mjs:381-384`). On Forgejo the feature therefore serves autopilot drafts from local plans and manual WIP drafts. The user decided to keep everything in one plan anyway.

The investigation `.effective-flow/investigation/investigation-2026-11-20-interactive-acceptance-tool-for-autopilot-prs.md` ruled out a new tool. The user chose to extend the existing tools, allowed merge-gate to mark drafts ready, excluded drafts with blockers from the offer, and asked for Forgejo coverage with its own rule.

Out of scope:

- The issue-close offer for autopilot PRs: parallel plan `docs/plan/2026-11-20-issue-lifecycle-receipt-for-plan-pr-continuations.md`.
- An acceptance lens in `review`: a separate decision that is still open, see Assumptions and open points.
- Autopilot itself: it keeps "never marks ready, never merges" (`docs/adr/automation-tool-category.md:40`). merge-gate is not an Automation tool, so that guardrail does not bind it.

Classification: Feature. This adds a new user-confirmed forge action and a new question to merge-gate.

## Outcome checkpoint

**Primary source:** user request in this session, following the investigation of PR #697 and issue #693 in `sebastian-software/effective-flow`
**Original outcome:** One gated `merge-gate <PR>` run takes a draft with a delivered, unblocked implementation through ready-for-review to the merge on GitHub and Forgejo, after the user has seen the decision record (or the note that none is verifiable) and confirmed. Plan-only drafts, drafts with blockers, and incomplete plan-draft finishes are never offered. Non-interactive runs never mark ready.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** none yet
**Continuation decision:** none

## Architecture decisions

- **Ask late, as a returned question, not at entry.** merge-gate reads the draft state only in its phases through `pr-status-read`. The entry `completion` question comes before any status read and is never returned (`src/tools/merge-gate.md:85-86`). The new question `ready-for-review` is posed by the delegated run in Phase 4, and only when the draft trigger below holds and every other condition passes. The user is never asked while checks or bots are still pending, and judges the decision record on a state that can actually merge.
- **Draft trigger per forge.**
  - **GitHub:** condition 3 fails solely because `draft: true`, and `mergeable` is proven.
  - **Forgejo:** the forge reports `mergeable: false` for any WIP-titled PR, and the adapter then omits the field (`src/scripts/remote-tracker-core.mjs:3621-3627, 3646`). A missing value can also mean a conflict check that is still running, or a real conflict. The Phase-2 exit requires `mergeable: MERGEABLE` (`merge-gate-delegated-run.md:1017-1031, 1039-1040`), so a WIP draft would never reach Phase 4. The user decided on a **local merge proof**:
    - The exception applies only when `provider: forgejo`. A WIP-titled draft (`draft: true`, mergeability absent) may leave the Phase-2 loop when every other exit criterion is met and a local proof shows that `headSha` merges into `origin/<baseRef>` without conflict.
    - The proof is its own read-only operation `merge-proof-local`. It is separate from `pr-draft-classify`, because Phase 2 needs it in every round without a permission read or `pr-read`. Before the proof, the exception runs the two ancestry fetches and the shallow check. The text at `merge-gate-delegated-run.md:831-833` ("only once the other conditions of trigger (b) hold") is amended so that these fetches also run for this exception. Any failure fails closed. The head fetch writes no ref (`:270-271`), so the inputs are `headSha` and `origin/<baseRef>`. The operation itself fetches nothing.
    - Phase 4 does not reuse Phase-2 results (`:1177`). It runs `merge-proof-local` again for a Forgejo WIP draft.
    - The proof uses `git merge-tree --write-tree`: exit 0 and no conflict entries. It needs Git ≥ 2.38, above the existing floor of 2.36 (`plan-publication-core.mjs:80`). A lower version fails closed with a named reason, and the run waits as today. Because `--write-tree` writes objects, the proof reuses the existing private-object-directory pattern (`diff-baseline-core.mjs:14-21, 323-341`; `verification-evidence-core.mjs:661, 790`): a temporary `GIT_OBJECT_DIRECTORY` with the repository's objects as an alternate, removed after the proof. The paragraph on Git reads (`merge-gate-delegated-run.md:268-275`) names the proof explicitly.
    - A proven local conflict ends the run directly with a conflict report, instead of waiting until `maxRounds` runs out. Only a proof that cannot be carried out (fetch, Git version) keeps the run waiting as today.
    - Every other missing mergeability keeps waiting as today.
    - In Phase 4, the local proof meets only the **mergeable** half of condition 3. The "not a draft" half stays false, and it is exactly the trigger for the question. A `report` run therefore never calls such a draft merge-ready, and Phase 5 never merges a draft. Condition 9 is checked against the helper's `readyTitle` (the title without the default WIP prefix; `:1237`).
    - The definition of `VERIFIED_HEAD_SHA` (`:1039-1040`, "verified as green and mergeable") gets a clause: for a Forgejo WIP draft, its mergeability may be proven only locally until the ready step. Only a forge-reported `MERGEABLE` allows the merge.
    - After the ready step, the forge must report mergeability itself. If it is still absent, the run returns to Phase 2's check wait under round accounting, which also covers GitHub's short-lived `UNKNOWN`. Only a forge-reported `MERGEABLE` allows the merge.
- **Only when the user can answer and the run would merge.** The question is asked only when the resolved completion is `merge`, either configured or answered `Merge` at entry. With `report`, `No merge`, or a non-interactive run, the gate never marks ready. It ends with the existing unmet-condition report and names the draft as the reason. A relayed run returns `BLOCKED-USER ready-for-review` through the existing round, digest and re-dispatch protocol (`merge-gate.md:118-131, 282-310`).
  - The `BLOCKED-USER` evidence carries the PR class, the blocker count, and the neutralized decision record or the note that none is verifiable.
  - The state digest's subject keys for this id are the class and the sha256 of the **raw** appendix block, before neutralization and size bounding. Consent is then bound to the head SHA and to the record shown. If the body is edited while the head stays unchanged, the gate asks again.
- **Classification is done by one deterministic, read-only helper operation.** The plan marker `effective-flow-plan-pr:v1` alone does not mean plan-only, because a delivered continuation keeps it (`src/tools/pr.md:277-290`). The helper returns one class:
  - `unmarked`: no plan marker. Counts as delivered.
  - `marker-invalid`: `planPrMarkerError` is set (`remote-tracker-core.mjs:3104-3110`). Fails closed, no question.
  - `plan-only`: a marker, and the merge-base diff lists no path other than plan path `P` and archive path `A`, whatever the archive state. A delivery whose archiving was refused (`unarchived: true`, `src/tools/autopilot.md:260-261`) therefore still counts as delivered.
  - `finish-incomplete`: a marker with delivery evidence, but the title still has plan-publication form (`plan-publication.md:350-357`). The `pr` plan-draft finish did not run, so a squash merge would land a feature under a `docs:` title. No question; the report routes to `pr` recovery (`pr.md:280`).
  - `delivered`: a marker, delivery evidence, and a finished title.

  The helper reads the parsed marker from `pr-read` and git state, never PR prose (`docs/adr/input-trust-boundary.md`). `pr.md` stays unchanged: its recovery rule answers a different question (whether the finish can still be applied) and already has the matched PR record.

- **Trust decides only whether the decision record is shown.** The helper returns the autopilot appendix between `<!-- effective-flow-autopilot-appendix:begin v1 -->` and `<!-- effective-flow-autopilot-appendix:end -->` (`src/scripts/autopilot-core.mjs:187-188`) as `verified` only when the PR is `sameRepository` and the PR author's write permission is proven through `collaborator-permission-read`, using the existing set of write levels (`backlog-audit-core.mjs:116`, including Forgejo's `owner`) (`remote-tracker-core.mjs:2488, 2651`; `input-trust-boundary.md:20-24`). Otherwise the record is `unverifiable`, and only its existence is reported, not its text. Shown text is neutralized: `<!--` and control characters are escaped, and the size is bounded.
- **Blockers exclude the offer, whatever the trust level.** This is the user's decision. The count is the number of bullet lines in the `### Blockers` / `### Blocker` section of every appendix found (`autopilot-core.mjs:1355, 1377, 1454-1467`); the helper takes both heading strings from the render constants. A count greater than 0 suppresses the question, because suppressing is always the safe direction. The gate ends with a report naming the blockers as stated in the PR body. A new merge-gate next-steps row routes to `apply <plan-file>`. Without an appendix, the question names the missing decision record explicitly.
- **Check the capability before asking, and recheck the state before applying.**
  - `pullRequestMarkReady` support is checked before the question. Without it, there is no question; the report names the missing capability.
  - After `Mark ready and continue`: a fresh `pr-status-read`. A PR that is no longer a draft skips the action. A dry run returns only a command preview and reads no PR state (`remote-tracker-core.mjs:5264-5276`). Then the dry run, then apply, following `pr.md:280-290`. On Forgejo, the call sends `payload.title: readyTitle` (`remote-tracker-forgejo-core.mjs:414-420`).
  - `COMMAND_FAILED` or `INVALID_PAYLOAD` stops the run before any merge and is reported. With `titleEdited: true` and a failed Forgejo read-back, the report names the changed title.
- **Re-evaluation after marking ready is an explicit new return path.** Phase 4 has a closed list of returns: only conditions 7 and 10 return, and condition 11 waits. Every other unmet condition ends the run (`merge-gate-delegated-run.md:1186-1200`). The plan adds one exception: after a successful mark-ready, the gate re-reads the status against the unchanged `VERIFIED_HEAD_SHA` and re-evaluates Phase 4 completely. In that re-evaluation, exactly these triggers return to Phase 2's check wait instead of ending the run:
  - checks or a bot become pending again (external bots may react to `ready_for_review`; this repository's `ci.yml` does not);
  - condition 3 fails only because mergeability is absent or `UNKNOWN` (Forgejo recomputing; GitHub's short-lived `UNKNOWN`).

  Each return consumes a round under the round accounting (`:1044-1060`), which names this return explicitly. Every other unmet condition ends the run as today. If `maxRounds` runs out after the ready step, the report names the PR as ready but not merged.
  - A second mark-ready in the same run is impossible, because the PR is then no longer a draft.

- **No config key.** The behaviour is bound to a run in which the user answers, and to the user's explicit answer. `completion: merge` does not imply consent to mark ready, so the question is always asked.

## Affected files

| File                                                                                                         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/shared/merge-gate-delegated-run.md`                                                                     | Phase 2: the exit exception for a WIP-titled Forgejo draft, which needs `merge-proof-local`; amend the ancestry-fetch condition at `:831-833`; name the proof in the Git-read paragraph `:268-275`; a proven conflict ends the run with a report. Entry step 6 (`:52-54`): add `Keep draft` to the stopping answers, so that a re-dispatch with `Keep draft` stops without running every phase again. Phase 4: the per-forge draft trigger; capability check; helper classification; when the class is `delivered` or `unmarked` and the blocker count is 0, the question (gated) or `BLOCKED-USER ready-for-review` (relayed) with the named evidence; on yes, a fresh status read, then a dry run, then apply, then a fresh read, then a full Phase 4 re-evaluation. Add the new return path to the closed list (`:1186-1200`) with both return triggers, and to the round accounting (`:1044-1060`). Phase 4 runs `merge-proof-local` again for Forgejo WIP drafts. Add the Forgejo rule for condition 3 and condition 9 against `readyTitle`. Extend the write-boundary sentence at `:1528` and the `no-branch-writes` clause at `:110`, so that mark-ready is a confirmed forge write of its own. |
| `src/tools/merge-gate.md`                                                                                    | Add a `ready-for-review` row to the question table (`:91-101`), with options `Mark ready and continue` / `Keep draft`, an ask fence with the same labels, and a relayed branch. Add subject keys (class, record sha256) to the digest rules (`:115-121`). Add a rules bullet: mark ready only after the user's answer in this run; never non-interactively, never for `plan-only`, `marker-invalid`, `finish-incomplete`, or a draft with blockers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/scripts/remote-tracker-core.mjs` plus a new git-only module                                             | Two new read-only operations. (a) `pr-draft-classify`: inputs PR number, `cwd`, `headSha`, `origin/<baseRef>` (the refs are already fetched by the caller); output `class`, `appendix` (neutralized, or `null` if missing or `unverifiable`), `appendixPresent`, `appendixDigest` (sha256 of the raw block), `appendixTrust` (`verified` / `unverifiable`), `blockers`, `readyTitle`. (b) `merge-proof-local`: inputs `cwd`, `headSha`, `origin/<baseRef>`; output `clean` / `conflict` / `unavailable` with a reason (for example the Git version). Both fail closed on any git or forge error. The two git functions (`plan-only` evidence; the merge proof with `git merge-tree --write-tree` against a private object directory, following `diff-baseline-core.mjs`) go into the git-only module, not into `conflict-validation-core.mjs` with its CI detection. The location is chosen in implementation step 1 and recorded in the developer guide.                                                                                                                                                                                                                                              |
| `src/scripts/remote-tracker.mjs`, `src/scripts/claude-settings-core.mjs`, the build's `RUNTIME_SCRIPT_FILES` | Register both new read operations and their allow rules. Add the git-only module to `RUNTIME_SCRIPT_FILES`; otherwise it is never shipped (`AGENTS.md:47`). Update the `contextBudget` of `merge-gate.md` (`AGENTS.md:70`). `pr-mark-ready` is already allowed (`claude-settings-core.mjs:200`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/shared/next-steps.md`                                                                                   | Row 250 (autopilot, draft PR) stays `merge-gate <PR>` first, which is now correct. Add these merge-gate rows, one condition each:                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

- "ended without merge: the user kept the draft" → `review <PR>`, `iterate <PR>`;
- "ended without merge: plan-only draft or draft with blockers" → `apply <plan-file>`, where `<plan-file>` comes from the validated `planPrMarker`, or the validated `Associated plan:` input for an `unmarked` draft; without either, `review <PR>`;
- "ended without merge: plan-draft finish incomplete" → `pr`;
- "ended without merge: invalid plan marker or missing mark-ready capability" → `review <PR>`, with the reason in the report;
- "marked ready, rounds exhausted before the merge" → `merge-gate <PR>`.

Keep the group order consistent with the test (`test/workflow-contracts.test.mjs:5205`). |
| `docs/user-guide/tool-flow.md` | Mirror the new next-steps rows (`:223-225`), checked by `findNextStepsDocViolations`. |
| `docs/user-guide/tools-deliver.md` | In the merge-gate section (`:405-440`), describe the draft path: the question after checks, the verified decision record, the excluded classes and blockers, the Forgejo rule, and that non-interactive runs never mark ready. |
| `docs/user-guide/tools-automation.md` | Near `:20` and `:84`: autopilot still never marks ready, but `merge-gate <PR>` shows the decision record and offers to mark the PR ready when the user can answer and there are no blockers. |
| `docs/user-guide/remote-tracker.md` | Near `:773-785`: merge-gate as a second caller of `pr-mark-ready`. Document `pr-draft-classify`. |
| `test/workflow-contracts.test.mjs` | Add `ready-for-review` to `RELAYED_QUESTION_IDS` (`:25165-25175`), to option-label parity (`:25322-25340`), and to the relayed-branch regex (`:25347-25375`). Assert the exclusion classes and the blocker rule, for hidden mode and external trackers too, the order (capability, question, fresh read, dry run, apply, fresh read, re-evaluation), the new return path in the closed list, and the subject keys. Add the next-steps rows to the edge table (`:4794-4807`). |
| `test/remote-tracker.test.mjs` | Unit tests for `pr-draft-classify`: each of the five classes; appendix in `en` and `de` with and without blockers; both trust levels (fork or missing permission → `unverifiable`, but blockers still counted); neutralization of `<!--` and control characters; Forgejo `readyTitle`; blocker count as bullet lines; digest of the raw block; fail closed on a git or forge error. |
| Tests for the git-only module | Evidence function: delivered, plan-only, `unarchived` delivery. `merge-proof-local`: clean, conflict, a missing ref, Git < 2.38 → `unavailable`; the repository's object set is unchanged after the proof (compare object sets, not modification times, because objects reached through the alternate can be freshened, `diff-baseline-core.mjs:19-21`). |
| `evals/merge-gate/scenario-registry.mjs`, `evals/merge-gate/fixtures/`, `evals/merge-gate/scenarios/` | New scenarios with `draft: true`, following the pattern of `scenarios/quick-conflict-commit-without-ci-evidence-blocks.md:24-38`. (1) Relayed run, delivered: expects `BLOCKED-USER ready-for-review` and no applied mutation. (2) Re-dispatch with `Relayed answer: ready-for-review … Mark ready and continue` and a precomputed digest: expects an applied `pr-mark-ready`, a fresh read and a merge. (3) Re-dispatch with `Keep draft`: no applied mutation, report. (4) `plan-only`: no question. (5) Draft with blockers: no question. (6) Non-interactive: no applied `pr-mark-ready`. (7) Forgejo WIP draft with a clean local merge proof: the Phase-2 exit, `BLOCKED-USER ready-for-review`, and on re-dispatch an applied `pr-mark-ready` with `payload.title`. (8) Forgejo WIP draft with a local conflict: it stays in the Phase-2 wait, with no question. No merge-gate eval uses Forgejo today (`Provider: github`), so both scenarios need a Forgejo registry entry and stub capabilities (`pullRequestMarkReady`, title edit, `pr-status-read` with WIP title). With a stubbed `merge-proof-local`, its result is a canned value, so (7) and (8) prove only the branching. The real conflict detection is proven by the unit tests of the git-only module. `pr-mark-ready` is already in the stub (`evals/_scaffold/remote-tracker.mjs:77`). Add `pr-draft-classify` and `merge-proof-local` as read operations to the stub table. Scenarios (1)-(3) and (7) run as relayed dispatches or re-dispatches with a precomputed digest. (4)-(6) and (8) are ordinary non-interactive or relayed runs without an answer. |

## Implementation details

### Approach

1. Implement the git-only module (evidence function, merge proof on a private object directory, Git version check) and `merge-proof-local`. Then implement `pr-draft-classify`: marker and marker error from `inspectPlanPrMarker`, the evidence rule, title form against plan publication, appendix extraction with the trust check and neutralization, blocker count from the render constants of both languages, and Forgejo `readyTitle`. Register both operations, allow them, add the module to `RUNTIME_SCRIPT_FILES`, test them, and record the location in the developer guide.
2. Add the Forgejo exit exception to Phase 2: ancestry fetches, `merge-proof-local`, a direct conflict report, and the amendment at `:831-833`.
3. Extend Phase 4 in `merge-gate-delegated-run.md` in this order: draft trigger per forge, capability check, classification, exclusions, then the question or `BLOCKED-USER`, then on yes a fresh status read, then dry run, then apply, then a fresh read, then a full Phase 4 re-evaluation. The two named return triggers go back to Phase 2's check wait under the newly named round accounting. A Forgejo WIP draft is proven again in Phase 4. Extend the write boundary.
4. In `merge-gate.md`, add the question row, ask fence, relayed branch, digest subject keys, rules bullet, and `Keep draft` among the stopping answers. Update `contextBudget`.
5. Add the next-steps rows, the doc mirror, and the user-guide texts.
6. Add the contract tests, helper tests, and eval scenarios. Then record or reconcile the eval evidence debt for the merge-gate and next-steps suites.

### Edge cases

- **`draft` absent from `pr-status-read`:** counts as unproven, as today (`merge-gate-delegated-run.md:1208`). No question, report.
- **Head or decision record changes between question and answer:** the digest no longer matches, the answer is not consumed, and the question is asked again on the fresh state.
- **Someone else marked the PR ready before the action:** the fresh status read after the answer sees no draft. The action is skipped and Phase 4 is re-evaluated.
- **`pr-mark-ready` or the Forgejo read-back fails:** no merge. Report the error code. With `titleEdited: true`, name the changed title.
- **Forgejo: mergeability still absent after marking ready:** return to Phase 2's check wait. One round is consumed, and only a forge-reported `MERGEABLE` allows the merge.
- **Forgejo: the local merge proof finds a conflict:** the run ends directly with a conflict report and no question.
- **Forgejo: the proof cannot be carried out (fetch, Git < 2.38):** no exception. The run waits as today, and the report names the reason.
- **Forgejo issue-path autopilot continuation:** it is already out of draft (verified, see Requirement). The gate behaves as today, with no question.
- **Checks or bots become pending again, or mergeability is `UNKNOWN`/absent, after marking ready:** return to Phase 2's check wait. One round is consumed, and `mergeGate.maxRounds` applies. If the rounds run out, the report names the PR as ready but not merged.
- **Fork PR or missing write permission:** the record is `unverifiable`, and its text is not shown. Blockers are still counted and exclude the offer. Without blockers, the question names the unverifiable record explicitly.
- **Manual draft without an appendix:** question with the note "no decision record present".
- **Blockers greater than 0:** no question. The report names the blockers as stated in the PR body, and routes to `apply <plan-file>`.
- **`marker-invalid` or `finish-incomplete`:** no question. Report, and route to `pr` recovery for `finish-incomplete`.
- **Completion `report` or `No merge`:** never asked. The report names the draft as an unmet condition.
- **Hidden mode, external tracker, or no `pullRequestMarkReady` capability:** no question. The report names the reason.

## Acceptance criteria

- [ ] A run in which the user can answer, on a `delivered` or `unmarked` draft without blockers, asks `ready-for-review` once per state digest, when the per-forge draft trigger holds and every other condition passes. A changed digest asks again. The question shows the neutralized decision record when it is `verified`, and otherwise the note that the record is missing or `unverifiable`.
- [ ] `Mark ready and continue` leads, in this order, to a fresh status read, then dry run, then apply of `pr-mark-ready`, then a fresh read and a full Phase 4 re-evaluation, and to the merge when every condition passes. On Forgejo: a WIP draft reaches Phase 4 only with a clean `merge-proof-local`, which Phase 4 repeats; a proven conflict ends the run with a report. The ready step sends `payload.title: readyTitle`, and the merge happens only after the forge reports `MERGEABLE`.
- [ ] `Keep draft` leaves the PR unchanged. On a re-dispatch, it stops before running the phases again, and ends with a report and the matching new next-steps row.
- [ ] `plan-only`, `marker-invalid`, `finish-incomplete`, blockers greater than 0, a non-interactive run, completion `report`/`No merge`, hidden mode, an external tracker, and a missing capability never produce an applied `pr-mark-ready`. The eval scenarios prove this behaviourally with `mutatingTrackerOperations()` for plan-only, blockers, non-interactive and `Keep draft`. For the other cases, the contract tests prove that the exclusion rule is in the contract, and the helper unit tests prove the classification.
- [ ] A relayed run returns `BLOCKED-USER ready-for-review` with round, digest (head SHA, class, record sha256), and the named evidence. It consumes the answer only when the digest matches the fresh state.
- [ ] `pr-draft-classify` is deterministic and covered by unit tests for all five classes, both languages, both trust levels (with blockers counted for each), neutralization, raw-block digest, and the Forgejo `readyTitle`. `pr.md` stays unchanged.
- [ ] `merge-proof-local` is covered by unit tests for clean, conflict, missing ref and Git < 2.38. The tests show that the repository's object set is unchanged after the proof.
- [ ] The git-only module is in `RUNTIME_SCRIPT_FILES`, and the `contextBudget` of `merge-gate.md` is updated.
- [ ] next-steps, `tool-flow.md`, `tools-deliver.md`, `tools-automation.md`, and `remote-tracker.md` describe the behaviour consistently, and `findNextStepsDocViolations` is green.
- [ ] The completion condition: `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` are green (`AGENTS.md:35`), and the eval evidence debt for merge-gate and next-steps is recorded or reconciled per the eval policy.

## Validation plan

- Unit tests for `pr-draft-classify`, the git evidence function, and `merge-proof-local` (including the object-set comparison).
- Contract assertions in `test/workflow-contracts.test.mjs`.
- Eight new merge-gate eval scenarios (including two for Forgejo). (1)-(3) and (7) run as relayed dispatches or re-dispatches with a precomputed digest, because a gated answer cannot be injected into the eval runner (`evals/merge-gate/README.md:22-27`). (4)-(6) and (8) run without an answer.
- `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- Manual check after release: run `merge-gate <PR>` gated on a real autopilot draft, both without blockers (expected: question, ready, merge) and with blockers (expected: no question, report). Together with the parallel receipt plan, the issue-close offer should follow.

## Assumptions and open points

- Verified (round 3): in Phase 2, the refs are not reliably fetched yet. The Forgejo exception therefore runs the ancestry fetches first; the helper fetches nothing itself.
- Assumption: counting blockers as bullet lines under the two rendered headings is stable enough, because both strings come from `autopilot-core.mjs`. If the implementation shows otherwise, the alternative is a machine marker in the appendix, which means a small change to autopilot.
- Assumption: on both forges, only the author and users with write access can edit a PR body. So same repository plus the author's write permission is a sufficient trust level. Neither forge reports the last body editor; the plan does not rely on that.
- Verified (deep review): Forgejo issue-path continuations from autopilot are already out of draft, see Requirement. The user accepted that the Forgejo path serves only local-plan autopilot drafts and manual WIP drafts.
- Assumption: Forgejo recomputes `mergeable` on each read from the stored conflict status and the title, so it reports `MERGEABLE` soon after the WIP prefix is removed. If not, the Phase-2 wait still covers this until `maxRounds` runs out.
- Deliberately not part of this plan: the acceptance lens in `review` (investigation part (c)). The user will decide on it separately after seeing the options. This plan does not depend on it. Re-entry: once decided, run `effective-flow plan` with the chosen option. That either creates a new plan or revises this one (next-steps row 250: `review <PR>` before `merge-gate <PR>`).
- Coordination: the parallel receipt plan also touches `docs/user-guide/tools-automation.md` and the merge-gate evals. Whichever lands second reconciles the texts and the evidence.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         7 |    7 |
| Security        |        0 |         3 |    2 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         3 |    3 |
| Testability     |        0 |         2 |    3 |
| Scope           |        0 |         2 |    1 |
| Maintainability |        0 |         2 |    3 |

### Findings

Internal plan review on 2026-11-20 (gap analysis and plan review, `effective-delivery`). All findings are incorporated:

- **Scope, Important:** "Blockers do not suppress the question" contradicted the investigation. The user decided that blockers exclude the offer.
- **Architecture, Important:** the "only the draft is missing" trigger never fires on Forgejo, because WIP titles make the PR unmergeable and condition 9 fails. The user decided that Forgejo gets its own trigger rule with `readyTitle`.
- **Error cases, Important:** a dry run reads no PR state. A fresh status read before apply was added, and the capability check moved before the question.
- **Architecture, Important:** the return after mark-ready is a new exception to the closed return list. It is now named explicitly, with round accounting and the correct phase (Phase 2's check wait).
- **Security, Important:** the appendix comes from the editable PR body. A trust check (same repository, write permission) and neutralization were added, and "stated in the PR body" is now named.
- **Architecture, Important:** a missing plan-draft finish would merge a feature under a `docs:` title. The new class `finish-incomplete` routes to `pr` recovery.
- **Error cases, Note:** an invalid marker now fails closed as `marker-invalid`.
- **Testability, Important:** gated answers cannot be injected in the eval runner. The scenarios now run as relayed re-dispatches, the stub change is reduced to the new read operation, and the criterion is now stated as "no applied `pr-mark-ready`".
- **Architecture, Note:** the class and the record sha256 are now subject keys of the digest, and the evidence contents are named.
- **Maintainability, Note:** the evidence rule should exist only once (in round 2 superseded by the Scope note below).
- **Maintainability, Note:** the next-steps row was split into separate rows, one per condition.

Round 2 on 2026-11-20 (full plan-level judgment after the user's decisions). All findings are incorporated:

- **Architecture/Error cases, Critical:** a Forgejo WIP draft never leaves the Phase-2 loop, and a missing mergeability can hide a real conflict. The user chose the local merge proof: a Phase-2 exit exception only for WIP drafts with a clean `merge-tree` proof, a return to the Phase-2 wait if mergeability is still missing after the ready step, and two Forgejo eval scenarios.
- **Security, Important:** the "last body editor" check was not backed by any forge data, and it was dropped. Trust is now same repository plus the author's write permission, and it decides only whether the text is shown. Blockers are counted at every trust level.
- **Error cases, Important:** an `unarchived` delivery was classified as `plan-only`. `plan-only` now means "no path other than `P`/`A` in the diff".
- **Scope, Note:** switching `pr.md` to the helper brought no gain. `pr.md` stays unchanged, and only the git-only module is shared.
- **Error cases, Note:** Forgejo continuation PRs with `Keep draft: requested` may already be out of draft. Recorded as an edge case and a check.
- **Architecture, Note:** `payload.title: readyTitle` for the Forgejo call is now named explicitly.

Round 3 on 2026-11-20 (scoped re-check of the round-2 changes). All round-2 findings were confirmed as resolved. The new findings are incorporated:

- **Architecture, Important:** `merge-tree --write-tree` writes objects. The proof now runs against a temporary object directory with an alternate, so the Git write boundary holds.
- **Error cases, Important:** in Phase 2 the refs are not reliably fetched. The exception now runs the ancestry fetches first, and the inputs are `headSha` and `origin/<baseRef>`.
- **Architecture, Important:** the local proof meets only the mergeable half of condition 3, so no draft is ever merged or reported as merge-ready.
- **Architecture, Note:** the exception is explicitly limited to `provider: forgejo`, and `VERIFIED_HEAD_SHA` got a clause for local proof.
- **Testability, Note:** the Forgejo eval scenarios need registry entries and stub capabilities, and prove only the branching. Conflict detection is proven by unit tests.
- **Security, Note:** the write permission levels are named (`write`, `maintain`, `admin`).

Deep interactive plan review on 2026-11-20. All findings are incorporated:

- **Scope, Important (user decision):** issue-path autopilot continuations on Forgejo are already out of draft, so the Forgejo path covers only local-plan autopilot drafts and manual WIP drafts. The user decided to keep everything in one plan, and the fact is now stated in Requirement.
- **Architecture, Important:** after mark-ready, an absent or `UNKNOWN` mergeability would have ended the run. It is now a named return trigger, and the rounds-exhausted case is covered.
- **Architecture, Important:** the Forgejo proof is now its own operation, `merge-proof-local`. The ancestry-fetch condition `:831-833` is amended, and Phase 4 runs the proof again.
- **Testability, Important:** `merge-proof-local` now has its own acceptance criterion and validation step.
- **Maintainability, Important:** next-steps now has one row per end state, including `marker-invalid`, missing capability, and "ready, but rounds exhausted", and the plan-file source is named.
- **Maintainability, Important:** added `RUNTIME_SCRIPT_FILES`, the `contextBudget`, and the actual commands (`pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`).
- **Security, Important:** the write levels now reuse the existing set, including Forgejo's `owner`.
- **Architecture, Note:** the proof reuses the private-object-directory pattern and its object-set comparison, has a Git ≥ 2.38 check, and is named in the Git-read paragraph.
- **Maintainability, Note:** fixed the wording on "exactly once" and on the "verified record".
- **Testability, Note:** criterion 4 now separates behavioural proof (evals) from contract proof, and covers hidden mode and external trackers.
- **Testability, Note:** the validation plan now says which scenarios are relayed.
- **Security, Note:** the digest uses the raw block, and the blocker count is defined as bullet lines.
- **Architecture, Note:** `Keep draft` is now one of the stopping answers at entry.
- **Error cases, Note:** a proven local conflict ends the run directly.
- **Open point moved:** the acceptance lens in `review` is a separate decision and is not part of this plan. It is now under Assumptions and open points, so this plan has no open points that block it.

## Open points

- No open points.

## Build completion

**Date:** 2026-11-20
**Workflow:** `effective-flow build` (via `effective-flow apply`), continuing plan PR #701

### Requirement

Implemented as planned: an interactive `merge-gate <PR>` run on a delivered, unblocked draft shows the autopilot decision record (or the note that it is missing or unverifiable), asks `ready-for-review` once all other merge conditions hold, marks the PR ready on confirmation, and continues to the merge. Plan-only, `marker-invalid` and `finish-incomplete` drafts, drafts with blockers, non-interactive runs, `report`/`No merge` completions, hidden mode, external trackers and a missing `pullRequestMarkReady` capability never mark ready.

### Architecture decisions

- Two new runtime modules instead of one: `src/scripts/pr-delivery-git-core.mjs` (plan-only evidence, `merge-tree --write-tree` proof in a private temporary object directory, Git ≥ 2.38 check) and `src/scripts/autopilot-appendix-core.mjs` (appendix extraction, raw-block digest, blocker count, trust, neutralization). The appendix constants moved there to avoid an import cycle (`autopilot-core` → `plan-publication-core` → `remote-tracker-core`). They are exported for reuse by the acceptance lens (PR #702).
- The write-permission set moved to `remote-tracker-shared-core.mjs` as a frozen `COLLABORATOR_WRITE_PERMISSIONS` array with `isWritePermission`; `backlog-audit-core.mjs` uses it unchanged.
- Both operations take the bare base branch name as `baseRef` and read `refs/remotes/origin/<baseRef>`.
- `pr-draft-classify` fails closed when the head SHA or base ref of its `pr-read` differs from the caller's input (`head-mismatch`, `base-mismatch`).
- The ask fence and the Rules bullet live in `merge-gate-delegated-run.md`, next to the gate, so `merge-gate.md` stays lean.
- The ready step re-reads all four surfaces, re-classifies and recomputes the digest before any write. The subsection runs at most once per run. After it, pending checks or bots, absent or `UNKNOWN` mergeability, and a `BEHIND` merge state return to Phase 2 under round accounting.
- The digest subject keys are `class`, `appendix` (raw-block sha256) and `trust`.
- Next-steps row 250 stays `merge-gate <PR>` first. The acceptance-lens plan (PR #702) switches it to `review <PR>` first when it lands.

### Affected files

- Runtime: `src/scripts/{pr-delivery-git-core,autopilot-appendix-core}.mjs` (new), `src/scripts/{remote-tracker-core,remote-tracker-shared-core,remote-tracker-forgejo-core,autopilot-core,backlog-audit-core,claude-settings-core}.mjs`, `build.mjs`, `scripts/distribution-smoke.mjs`.
- Contracts: `src/shared/merge-gate-delegated-run.md`, `src/tools/merge-gate.md` (`contextBudget` 945), `src/shared/next-steps.md`, `src/shared/setup-allowlist.md` (75 rules).
- Docs: `docs/user-guide/{tools-deliver,tools-automation,remote-tracker,tool-flow,tools-setup}.md`, `docs/developer-guide/{build-system,architecture,configuration}.md`.
- Evals: `evals/merge-gate/{README.md,scenario-registry.mjs,_scaffold/evaluate.mjs,_scaffold/merge-origin.mjs}`, eight scenarios and fixtures (`draft-ready-*`, `forgejo-wip-draft-*`), `evals/_scaffold/evaluate.mjs`, `evals/host-driver/tests/test_first_stage.py`.
- Tests: `test/{pr-delivery-git-core,autopilot-appendix-core,remote-tracker-draft-classify}.test.mjs` (new), `test/{workflow-contracts,eval-fixture-fidelity,execution-profile-contract,merge-gate-eval-round,iterate-eval}.test.mjs`.

### Implementation details

- Deviation: the diff baseline was not captured with the helper before the first write. The clean branch commit after merging `develop` served as the baseline.
- Deviation: the eval stub has no read-operation table, so it needed no entry. Scenario (7) covers only the re-dispatch; the first `BLOCKED-USER` is covered by scenario (1). The call log cannot show the returned `BLOCKED-USER` text or the `payload.title` value.
- `merge-proof-local` is classified as a runtime-state-reading local operation in `RUNTIME_STATE_TRACKER_OPERATIONS`, because it reads refs and the object store.

### Test results

- Phase 5 full run (valid, no environment signature): `pnpm agent:check`, `node build.mjs` and the five `pnpm eval <suite> verify` calls passed. `pnpm test` (6124 tests) and `pnpm test:distribution` failed on four new causes: frozen host-driver scenario counts, the runtime-state operation list, the allowlist rule count, and the distribution smoke list. All were fixed in one correction round.
- Later corrections were verified targeted: affected test files (up to 1834 tests, 0 failures), `pnpm agent:check`, `node build.mjs`, `pnpm test:distribution`, and eval verification without integrity blockers.
- Eval evidence debt: the merge-gate, next-steps, iterate, build-context and focus suites have stale or absent evidence, because their loaded sources and the shared `evals/_scaffold/evaluate.mjs` changed. No evidence was recorded in this run.

## Review findings

**Date:** 2026-11-20
**Reviewer:** `effective-flow-nodejs-reviewer`, `effective-flow-generic-product-reviewer` (reduced depth)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    21 |
| Open / Not implemented |     3 |

The three not-implemented findings were closed with a reason. `readyTitle` stays raw title text, because the plan requires it as the Forgejo payload and `pr-status-read` already exposes the title. The draft subsection stays eager, because drafts are the main path after autopilot. A table-formatting issue inside this plan's approved text was left unchanged.
