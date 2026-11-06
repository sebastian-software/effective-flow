# Focus follow-up and snapshot enabling candidate

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

This plan is WP2b-1 of #613, the first of the two WP2b runs that share one branch. It builds the
**enabling candidate**: the source state in which the `focus` T3 observed snapshot path and its
opt-in follow-up mode are available, so that the operator can record the 16 items of the
"Follow-up qualification checklist" in `docs/developer-guide/focus-host-acceptance.md` against it in
WP2b-2. WP2b-2 is a separate local plan, written after this run once the candidate's branch head and
digests exist. It runs through `effective-flow docs` inside a worktree checked out on this branch
(plan-PR continuation does not apply to it) and changes only the record files and the two ADR
status notes.

The scope has grown since #613 was approved. Commit `23ea36e3` ("separate package release checks
from capability qualification", ADR `docs/adr/pragmatic-test-release-policy.md`) landed after WP2a
(#621, `a3e6c40`). It disabled the T3 observed/report-only snapshot row again, because that policy
edited a focus source, and phase E therefore no longer qualifies the current artifact. It also
removed the "sole executable path" sentence and replaced the #613 binding-drift rule with a stricter
one. The ADR's re-entry section names "the remaining work in #613" as the path back:

> Re-record and pass the applicable contract before activation.

So this candidate enables **both** rows (owner decision, 2026-11-05):

- "T3 observed, report-only";
- "T3 observed follow-up (schedule_task, T3/Codex)".

Every send row stays disabled. The failure rule from #613 still applies: the enabled rows exist only
on the unmerged candidate branch, and `develop` keeps both rows disabled until every checklist item
passes in WP2b-2.

**Why Feature (`effective-flow build`):** the run changes shipped product behaviour (gate rows,
tool description) together with its tests, budget and a digest guard. It is not a documentation-only
change. The operator recording that qualifies the change belongs to WP2b-2.

## Outcome checkpoint

**Primary source:** sebastian-software/effective-flow#613, canonical planning comment (WP2b section)
**Original outcome:** A developer can have Effective Flow supervise one explicitly selected session
over time. This means:

- evidence-backed drift and loop detection;
- quiet unchanged ticks and no repeated nudges;
- honest capability limits;
- clean stop, pause and resume;
- reuse of focus's existing progress and authority rules.

**Last evaluated attempt:** WP2a, merged in `a3e6c40` (#621). Phase E passed for candidate
`ada4fdae`, which was qualifying evidence for the snapshot path. Afterwards `23ea36e3` disabled the
snapshot row by policy, so E is history and qualifies no current artifact.
**No-progress count:** 0
**Cumulative approach:**

- done: WP0 spike (go) and WP1 gate-disabled follow-up mode (`2b1e0f4`);
- done: WP2a snapshot requalification (`a3e6c40`);
- open: WP2b-1, this enabling candidate;
- open: WP2b-2, the operator recording of 16 items on that candidate, followed by the single
  pull request with `Closes #613`.

No new tool, worker, script or focus-owned runtime state.

**Continuation decision:** Continue within authority (owner decisions of 2026-11-05):

- both rows are enabled on the candidate;
- the stricter binding-drift rule from `23ea36e3` governs;
- after WP2b, a behavioural focus-source change brings a passing candidate record or disables both
  rows again before integration (ADR-strict);
- the focus host acceptance record is the applicable acceptance, and the `focus` eval round stays
  post-merge debt as decided in #613;
- `catalogHint` stays unchanged;
- WP2b-2 adds dated status notes to the two focus-related ADRs;
- a digest guard makes the ADR-strict rule fail visibly;
- the published plan pull request becomes the single WP2b pull request.

Next observable proof: the WP2b-2 record of all 16 items on this candidate. Stop condition: the
#613 failure rule.

## Architecture decisions

- **Both rows are enabled in one candidate.** Item 1 of the checklist is the snapshot
  requalification. It must run on the same candidate that shows the follow-up offer, and the
  follow-up offer requires an admitted snapshot. A separate snapshot-only package would cost one more
  plan, pull request and requalification without improving acceptance (owner decision).
- **Activation means integration into `develop`.** The ADR's "re-record and pass the applicable
  contract before activation" is read as: enabled rows reach `develop` only together with a passing
  candidate record. The candidate branch carries enabled source before recording, because the
  operator can only record a path that executes. It is a pre-activation recording artifact, never
  merged without its record. Contract `:66–69` ("Changing availability requires review … does not
  unlock a disabled path") is reworded to say exactly this (step 5).
- **After WP2b: ADR-strict** (owner decision). The enabled rows check no record at runtime. A later
  pull request that changes a focus source, or the built focus artifact, in a way that is not a
  documented, demonstrably nonbehavioral difference must do one of two things before it merges:
  - bring a passing candidate record for its own head;
  - return both rows to disabled, as `23ea36e3` did.

  This replaces #613's "carry-over stays, requalify before the next release". The rule is stated in
  the reworded contract sentence (step 5) and, by WP2b-2, in the acceptance page's closing
  paragraph.
- **A digest guard triggers the ADR-strict rule** (owner decision). While the contract's report-only
  row is enabled, a test compares the SHA-256 digests of the built portable `tools/focus.md` and
  `shared/focus-follow-up.md` with a tracked digest file. On a mismatch it fails and names the two
  ADR-strict paths. This catches eager-fragment and `build.mjs` rendering changes that no author
  would otherwise connect to focus. When both rows are disabled again, the guard is inert.
- **Enabled rows state only their runtime match.** The model cannot check a record at runtime, and
  `docs/developer-guide/` is repository-only and never shipped. Each enabled row therefore states its
  runtime match condition and that no record lookup happens at runtime. The binding requirement
  (a candidate record whose differences from the current source are only binding drift) is a
  maintainer and integration duty in the step 5 sentence, phrased "the operator acceptance record",
  never naming the repository-only file. The rows name no SHA or digest, so writing a row cannot
  change its own binding, as #613 requires.
- **The binding-drift rule stays as `23ea36e3` wrote it** (owner decision). It already sits in
  `focus-host-acceptance.md` and is guarded by the test `Focus acceptance requires requalification
  for material shared-fragment and rendered changes`. This run does not touch it. #613's looser
  "outside the focus sources is drift" rule is superseded. A `develop` update of the candidate branch
  is drift only when it is a documented, demonstrably nonbehavioral difference; anything else makes a
  new candidate under the #613 failure rule.
- **Applicable acceptance is the host record only** (owner decision). The ADR names the Focus host
  acceptance record as the re-entry owner. Stale eval suites stay visible debt in CI report mode. The
  maintainer re-records the `focus` round after the merge and before the next release, as #613
  decided. It is no merge criterion.
- **`catalogHint` stays unchanged** (owner decision). It renders into the router `SKILL.md` that
  every eval suite seeds, so a change would stale all five suites. "subject to host qualification"
  stays true. Only the `description` changes; it lives in `tools/focus.md`, which stales `focus`
  and `build-context` (that suite seeds `tools/`).
- **The plan pull request becomes the WP2b pull request** (owner decision). The plan is published as
  a draft pull request. `effective-flow apply` continues on its branch, and the build's handback
  finalizes it, since `effective-flow pr` has no keep-draft option. The operator then returns it to
  draft at once and corrects the body, so it cannot be merged before WP2b-2. WP2b-2 commits on the
  same branch, switches the body to `Closes #613` and marks it ready. This replaces #613's "branch
  only, no pull request" for WP2b-1 and "opens one pull request" for WP2b-2.
- **Record files stay with WP2b-2.** `docs/developer-guide/focus-host-acceptance.md` names the
  recorded candidate, so this run leaves it unchanged. On the unrecorded candidate several of its
  sentences describe `develop`'s still-disabled state; WP2b-2 rewrites them (see Assumptions). The
  user guide and the other non-record documents name no SHA. They point to the current binding on
  the acceptance page, so WP2b-2 does not need to edit them.

## Affected files

All line numbers refer to `origin/develop` at `87b7bfc0`. The build re-reads them on its base.

| File | Description |
|---|---|
| `src/shared/focus-session-contract.md` | Section `## Current qualification gate`: binding paragraph (`:50`), report-only row (`:58`), follow-up row (`:64`), availability sentences (`:66–71`). |
| `src/tools/focus.md` | Frontmatter `description` (`:2`) only. `catalogHint` (`:3`) and the eager offer condition (`:25–30`) stay. |
| `src/shared/focus-follow-up.md` | Expected unchanged; verify that `## Gate and grammar` and the tick gate re-check (`:99–101`) read correctly with an enabled row. |
| `build.mjs` | Only the `focus` entry of `CONTEXT_BUDGET_LINES` (`:2485`, now `404`), set to the measured count. |
| `test/focus-contracts.test.mjs` | Test `Focus binds runtime host qualification and fails closed for unqualified paths` (`:103–136`); test `Focus follow-up offer requires the qualified follow-up gate row` (`:360–394`); new assertions for the reworded availability sentences. |
| `test/` (new test) and a new tracked digest file under `test/fixtures/` | The digest guard of step 9a. File names are the build's choice; neither file is digest-bound. |
| `docs/user-guide/tools-quality.md` | Focus "Follow-up" paragraph (`:42–48`) and qualification paragraph (`:50–55`, including the `ada4fdae` sentence). |
| `docs/concept/2026-11-02-focus-session-check.md` | `:141`: the follow-up mode is no longer "defined but disabled pending candidate-bound qualification". |
| `docs/developer-guide/release-and-installation.md` | `:88–89`: focus snapshot execution and follow-up are no longer listed as disabled; sends stay disabled. |
| `evals/focus/README.md` | `:160–161`: same correction. This README is no suite seed, so editing it stales nothing. |

Deliberately unchanged in this run:

- `docs/developer-guide/focus-host-acceptance.md`: WP2b-2 edits it;
- `docs/adr/pragmatic-test-release-policy.md` and `docs/adr/focus-cross-session-messages.md`: WP2b-2
  adds dated status notes;
- `docs/developer-guide/build-system.md`: `focus-follow-up` stays mode-gated and lazy.

## Implementation details

### Approach

1. **Preconditions and branch.**
   - The draft plan pull request exists. If it does not, stop and publish it first. Without it,
     the handback would open a new, ready pull request on a new branch.
   - The plan branch's merge base equals current `origin/develop`. If not, the diff since the merge
     base must touch no focus source, no eagerly included fragment of `tools/focus.md` and not
     `build.mjs`; otherwise republish the plan from current `develop` first.
   - Then run `effective-flow apply` on this plan. It continues on the plan pull request's branch at
     its fetched head. Plan-PR continuation neither rebases nor merges the base. The delivery
     completion is `pr`, fixed by the plan pull request.
2. **Report-only row (contract `:58`).** Replace "Disabled pending snapshot-host requalification …"
   with the qualified form:
   - The row matches at runtime only on the T3 observed path admitted from trusted host context,
     with report-only use. No record lookup happens at runtime.
   - When the row does not match, focus still returns the missing snapshot qualification before any
     target or ancestry read, with no content access, analysis leaf or verdict about unread content.

   The row names no SHA and no repository-only file. Historical acceptance alone still does not
   qualify.
3. **Binding paragraph (`:50`).** Reword "The T3 observed/report-only snapshot route is disabled
   pending candidate-bound observed/report-only acceptance" so that the route is enabled in this
   source through a reviewed activation backed by candidate-bound observed/report-only acceptance.
   Keep the phrase "candidate-bound observed/report-only acceptance", "package evidence reporting
   does not qualify it" and the rest of the binding sentence. Keep "build target" and any
   "qualification" on separate source lines, because the regex at `:135` matches within a line.
4. **Follow-up row (`:64`).** State qualified availability in the same form as step 2:
   - It matches only when trusted host context (`orchestrator_capabilities` or the observer thread's
     own metadata) names provider instance `codex` for the observer thread, never a self-report, on
     an admitted T3 observed path.
   - No record lookup happens at runtime.

   Reword "While disabled:" to "When the row does not match:" and keep its content: no offer, resume
   or tick target read; `follow-up stop` and a tick's deletion of its own handle stay available.
5. **Availability sentences (`:66–71`).**
   - Reword "Changing availability requires review … does not unlock a disabled path" so that it
     states the maintainer and integration duty:
     - enabled rows reach `develop` only with a candidate record in the operator acceptance record
       whose differences from the current source are only binding drift;
     - a focus-source or rendered change that is not demonstrably nonbehavioral brings a passing
       record or returns both rows to disabled;
     - a user confirmation, passing build, primitive rerun or historical spike still unlocks
       nothing.
   - Replace "No snapshot execution route is currently qualified; ordinary configuration or developer
     confirmation cannot enable one." with one sentence naming the only executable paths: the T3
     observed report-only snapshot, the opted-in schedule creation and update, the follow-up ticks,
     and the cleanup deletions (`follow-up stop`, a tick's own-handle deletion, the failed-update
     cleanup). None of them sends a message. Ordinary configuration or developer confirmation cannot
     enable any other path.
   - Reword the dormant-specification sentence so that the reader/analysis specifications of the
     disabled rows stay dormant and all sends stay disabled. Drop the "follow-up … stay disabled"
     part.
6. **Tool `description` (`focus.md:2`).** Rewrite it to say:
   - one cited snapshot verdict on the qualified T3 observed path, report-only;
   - an opt-in follow-up mode of recurring report-only checks on that path;
   - unqualified host paths and all sends stay disabled;
   - no focus-owned persistent state.

   `catalogHint` stays byte-identical.
7. **Tests.**
   - In `Focus binds runtime host qualification …`, the report-only regex (`:120–122`) follows the
     enabled row wording. The phrase regexes `:117` (`candidate-bound observed\/report-only
     acceptance`), `:123` and `:124` keep matching. They now refer to the binding paragraph and the
     unmatched case.
   - Replace the `:125` and `:126` regexes with assertions on the reworded sentences: the executable
     paths, "sends" excluded, the "cannot enable any other path" clause, and the ADR-strict
     integration clause of step 5, and the three cleanup deletions. This is the new test #613 asked
     for.
   - Assert that the gate section names no `focus-host-acceptance` file.
   - Re-check `:135` (`build target.*qualif…`) after the step 3 rewording.
   - Every fail-closed assertion for the other rows (`:127–130`) passes unchanged.
   - Update the invariant comments (`:104–105`, `:118`) to name the enabled report-only invariant.
   - In `Focus follow-up offer requires the qualified follow-up gate row`, assert the enabled row
     wording (`:372`) and the "When the row does not match:" clause (`:378`), and let the invariant
     comment (`:361–363`) name the enabled-gate invariant.
   - Every other send-path assertion, including the `messaging` assertion "delegated correction
     sends remain disabled", and the drift-rule test `:89–101` pass unchanged.
8. **Non-record docs.**
   - `tools-quality.md:42–48`: the follow-up mode is available as opt-in, report-only checks after a
     snapshot on the T3 observed path.
   - `tools-quality.md:50–55`: the sentence naming phase E and `ada4fdae` goes. Snapshot-host
     execution is available on that path while a current candidate record exists, and the sentence
     points to the acceptance page for the current binding, without a SHA.
   - Sends stay disabled in both paragraphs.
   - Apply the same correction to the concept `:141`, `release-and-installation.md:88–89` and
     `evals/focus/README.md:160–161`.
9. **Budget.** Run `node build.mjs`, take the `focus` count from the "Always-loaded core
   (lines/budget)" report, and set the budget entry within ten lines of headroom.
9a. **Digest guard.** Add a `node:test` test that runs in `pnpm test`:
    - It renders the portable target through the cheapest existing test build path.
    - It computes the SHA-256 of `effective-flow/tools/focus.md` and
      `effective-flow/shared/focus-follow-up.md`.
    - While the contract's report-only row carries the enabled wording, it compares both digests
      with the tracked digest file.
    - On a mismatch, it fails with a message naming the two ADR-strict paths: record a passing
      candidate and update the digest file in the same pull request, or return both rows to
      disabled.
    - A test comment names the invariant.

    The digest file is written last, after review incorporation, from the final candidate build.
    WP2b-2 checks that it equals the record's built-file digests.
10. **Consistency sweep.** Before review, `git grep -n -i -E "disabled|enable|pending qualification|currently qualified"`
    over the files of the Affected files table and `focus-host-acceptance.md`. Every hit about the
    snapshot or follow-up path is either rewritten here or belongs to a WP2b-2 obligation listed
    under Assumptions.
11. **Validation and delivery.** Run the CI order (Validation plan). The build's handback archives
    this plan and finalizes the pull request through `effective-flow pr`. The run's final report
    says that the pull request must not merge and `effective-flow merge-gate` must not run on it
    before WP2b-2, regardless of any generated next-step suggestion.

### Post-run operator steps

These steps are outside the build's completion condition. The human operator performs them
immediately after the build run ends:

1. Return the pull request to draft: `gh pr ready --undo <number>`.
2. Edit the body:
   - add `Refs #613` if missing (the `pr` handback carries no issue references and strips foreign
     issue keywords);
   - add the line "Recording (WP2b-2) pending: do not merge";
   - remove any `Closes`.
3. Confirm with `gh pr view <number> --json isDraft,body`.
4. Ignore any `merge-gate` next-step suggestion until WP2b-2.

### Edge cases

- **`develop` moves before or during the build.** The candidate sits on the plan branch's merge
  base, not on current `develop`. Step 1's precondition covers the start. Any update of the branch
  from `develop` happens before WP2b-2's first recorded item. A later update follows the drift rule
  and the #613 failure rule, and the digest guard flags a rendered change. Line numbers above are
  orientation only.
- **A review, iterate or CI fix after the candidate is final.** Any change to a focus source or the
  `focus` budget line after WP2b-2 has started recording makes a new candidate (#613 failure rule).
  This includes fixes prompted by the PR review the handback publishes and by CI on the pull
  request. WP2b-2 therefore starts recording only after that review is published and CI is green,
  or every failure is reproduced on the base and explained.
- **The handback cannot finalize** (archival collision or finish failure). The pull request stays a
  draft, which is the target state anyway. The report names the archival outcome, and the plan is
  archived by hand before WP2b-2 starts.
- **Merge before recording.** Prevented by the draft state, the body notice and the final report. If
  the pull request is found ready without a WP2b-2 record, it goes back to draft. `develop` must
  never receive enabled rows without a passing record.
- **The eager offer condition already reads "is qualified for the actual host".** It needs no
  change. With the row enabled, the offer appears after an admitted snapshot, which is what WP2b-2
  item 1 observes and declines.

### Component structure

Not relevant: no new component, tool, worker, script or include.

### State management

Not relevant: focus keeps no persistent state. The only host artifact stays the opted-in
`schedule_task`.

### API integration

Not relevant: no new host operation. The T3 operations stay as the contract lists them.

### Styling approach

Not relevant: Markdown and tests only.

### Accessibility

Not relevant: no user interface.

## Acceptance criteria

- [ ] The rows "T3 observed, report-only" and "T3 observed follow-up (schedule_task, T3/Codex)" in
  `src/shared/focus-session-contract.md` state qualified availability as in steps 2 and 4. Neither
  names a SHA or digest. The unmatched case still returns the missing capability before any target
  or ancestry read, and `follow-up stop` and own-handle deletion stay available.
- [ ] The binding paragraph and the availability sentences read as in steps 3 and 5, including the
  ADR-strict integration rule. Every send row and the Local Claude section stay disabled.
- [ ] The `focus` `description` names report-only snapshots and opt-in report-only follow-up checks;
  `catalogHint` is byte-identical to `origin/develop`.
- [ ] The four non-record documents of step 8 no longer call snapshot or follow-up disabled, and none
  of them names a candidate SHA. The step 10 sweep leaves no unassigned hit.
- [ ] `focus-host-acceptance.md`, the binding-drift rule and both ADRs are unchanged:
  `git diff --name-only origin/develop...HEAD` lists neither the acceptance page nor any file under
  `docs/adr/`.
- [ ] In `test/focus-contracts.test.mjs`:
  - both gate tests assert the enabled wording;
  - assertions cover the reworded availability sentences;
  - all other-row, send-path and drift-rule assertions pass unchanged.
- [ ] The `focus` `CONTEXT_BUDGET_LINES` entry equals the measured count plus at most ten lines.
- [ ] The digest guard exists in `pnpm test`:
  - it passes on the final candidate build;
  - it fails, naming the two ADR-strict paths, when either built file's digest differs while the
    report-only row is enabled.
- [ ] The gate section names no repository-only file, and each enabled row states that no record
  lookup happens at runtime.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass. If
  `pnpm test` fails, every failure must also reproduce on the unmodified base and be listed in the
  pull request. `pnpm eval <suite> verify` runs for all five suites, and the pull request names every
  stale suite as owed before the next release.
- [ ] The run ends with:
  - the plan archived as Implemented on the branch;
  - the plan pull request finalized by the handback;
  - a final report that forbids merging and `effective-flow merge-gate` before WP2b-2.

  The post-run operator steps are outside this completion condition.

## Validation plan

- `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution` in CI order, through
  `t3-project exec --environment effective-flow-node24 --worktree <worktree> -- …`.
- `pnpm test` failures are compared against the unmodified build base, re-measured in the same
  environment; the WP1 count of 44 is from an older base and is not reused. CI's result on the pull
  request is reported separately.
- `node --test test/focus-contracts.test.mjs` on its own, for a fast check of the changed tests.
- `pnpm eval <suite> verify` for `merge-gate`, `iterate`, `next-steps`, `build-context` and `focus`,
  with results in the pull request.
- Manual check of `dist/portable/effective-flow/tools/focus.md` and the built contract: the enabled
  rows render and no `{{…}}` remains. WP2b-2 installs this portable build.
- The step 10 consistency sweep, with its hits assigned.
- Post-run (operator, outside the build): `gh pr view <number> --json isDraft,body` shows a draft,
  `Refs #613`, the recording notice and no `Closes`.

## Assumptions and open points

- **Verified code context:** line references, current wording and test assertions come from
  `origin/develop` at `87b7bfc0` (gate section `:48–72`, tests `:89–136` and `:360–394`,
  `CONTEXT_BUDGET_LINES` `:2485`). The eval seeds come from each `evals/<suite>/suite.config.mjs`
  there.
- **Assumption:** `src/shared/focus-follow-up.md` needs no change, because it refers to the gate row
  only by its qualification state. The build verifies this and edits it only if a sentence presumes a
  disabled row.
- **Verified mechanics:**
  - The handback's `effective-flow pr` finalizes the draft and has no keep-draft option.
  - It rebuilds the body and strips issue keywords it was not handed, and the handback hands it
    none. The post-run operator steps therefore restore the draft state and `Refs #613`.
- **Superseded #613 details:**
  - the drift rule (now `23ea36e3`'s);
  - the carry-over after WP2b (now ADR-strict);
  - WP2b-1 "branch only, no pull request" and WP2b-2 "opens one pull request" (now the draft plan
    pull request);
  - enabling the follow-up row only (now both rows), so the report-only row assertion changes
    instead of passing unchanged;
  - the `catalogHint` change (now unchanged);
  - the user-guide sentence naming the WP2b item-1 record (now a SHA-free pointer to the acceptance
    page).

  The canonical planning comment still states the old details. `effective-flow plan-issue 613`
  brings it in line before WP2b-2 records. This does not block WP2b-1.
- **WP2b-2 obligations** (separate plan, after this run): record the 16 items on this branch head
  with the seven-entry digest table, then update `focus-host-acceptance.md`:
  - the status line (`:3`);
  - the recorded-bindings note (`:56`);
  - both T3 observed matrix rows;
  - the sentences "current activation still needs …" (`:268`, `:293`);
  - the checklist intro (`:289`, "merged candidate" becomes the recorded candidate);
  - the item-1 suffix;
  - the closing paragraph (`:311–316`): "Only then does the operator enable the gate row; in the
    same step … `catalogHint` … owed eval recordings" is rewritten to the actual order (enabled
    candidate, then record), `catalogHint` unchanged and the eval round as post-merge debt, and it
    gains the ADR-strict rule and the digest guard;
  - the evidence-relationship paragraph (`:347–350`, "only a completed candidate-bound row can
    enable a host path in the source"), reworded to "integrate an enabled host path".

  WP2b-2 runs in a worktree on this branch, without plan-PR continuation. It checks that the
  digest-guard file matches the record's built-file digests, and also adds dated status notes to `docs/adr/pragmatic-test-release-policy.md` and
  `docs/adr/focus-cross-session-messages.md`, posts the deferred-steering comment on #613, switches
  the body to `Closes #613` and marks the pull request ready.

## Plan review

**Result:** Approved

### Summary

| Area | Critical | Important | Note |
|---|---:|---:|---:|
| Architecture | 0 | 1 | 1 |
| Security | 0 | 0 | 0 |
| Data protection | 0 | 0 | 0 |
| Error cases | 0 | 1 | 1 |
| Testability | 0 | 0 | 3 |
| Scope | 0 | 1 | 2 |
| Maintainability | 0 | 1 | 1 |

### Findings

- **Important, Architecture.** What happened to the enabled rows after the merge was undefined, and
  #613's carry-over contradicted the ADR's "remain disabled until … acceptance passes". *Resolution
  by owner decision:* ADR-strict. Stated in "Architecture decisions" and step 5.
- **Important, Maintainability.** The candidate contradicted the acceptance page and contract
  `:66–69`, and the plan never defined "activation". *Incorporated:* activation means integration
  into `develop`; contract `:66–69` reworded (step 5); WP2b-2's acceptance-page obligations are
  listed by line.
- **Important, Scope.** A `catalogHint` change stales all five eval suites. *Resolution by owner
  decision:* `catalogHint` stays unchanged; only `focus` and `build-context` go stale.
- **Important, Error cases.** Nothing made the finalized body carry `Refs #613` and the recording
  notice. *Incorporated:* the handback passes `#613`; the operator re-drafts and corrects the body;
  the final report forbids `merge-gate` (step 11).
- **Note, Scope.** The list of superseded #613 details was incomplete. *Incorporated.*
- **Note, Architecture.** The executable-path sentence omitted schedule creation and update.
  *Incorporated* in step 5.
- **Note, Testability.** Step 8 did not name the `ada4fdae` sentence. *Incorporated.*
- **Note, Testability.** Step 7 did not name the affected regexes `:117` and `:126`. *Incorporated.*
- **Note, Maintainability.** Both ADRs would state a false present-tense status. *Resolution by
  owner decision:* WP2b-2 adds dated status notes.
- **Note, Error cases.** Fixes prompted by the published PR review or CI were not covered.
  *Incorporated:* recording starts only after both; later fixes make a new candidate.
- **Note, Testability.** The base failure count came from an older base. *Incorporated:*
  re-measured.
- **Note, Scope.** No test guards wording consistency across the docs. *Incorporated* as the step 10
  sweep; no new test.

### Deep review (2026-11-06)

**Result:** Approved

| Area | Critical | Important | Note |
|---|---:|---:|---:|
| Architecture | 0 | 1 | 0 |
| Security | 0 | 0 | 0 |
| Data protection | 0 | 0 | 0 |
| Error cases | 0 | 3 | 1 |
| Testability | 0 | 0 | 1 |
| Scope | 0 | 1 | 1 |
| Maintainability | 0 | 1 | 1 |

- **Important, Architecture.** The enabled rows read as a runtime record check the model cannot
  perform, against a repository-only file. *Incorporated:* rows state only their runtime match; the
  binding duty moves into the step 5 sentence as "the operator acceptance record"; a test asserts
  that no repository-only file is named.
- **Important, Error cases.** The "only executable paths" sentence omitted the cleanup deletions.
  *Incorporated* in steps 5 and 7.
- **Important, Error cases.** Plan-PR continuation neither rebases nor merges, so the candidate sits
  on the plan branch's merge base. *Incorporated:* step 1 precondition and the revised edge case.
- **Important, Scope.** The completion condition depended on manual steps after the build.
  *Incorporated:* the build criteria end at the finalized pull request and the report; the
  re-draft and body correction moved to "Post-run operator steps".
- **Important, Error cases.** The `pr` handback carries no issue references and strips foreign
  keywords. *Incorporated:* the operator restores `Refs #613`.
- **Important, Maintainability.** The ADR-strict rule had no trigger for eager-fragment or rendering
  changes. *Resolution by owner decision:* the digest guard (step 9a).
- **Note, Maintainability.** The WP2b-2 obligations missed the acceptance page `:311–316` and
  `:347–350`, and the sweep pattern could not find them. *Incorporated.*
- **Note, Scope.** WP2b-2 cannot reach this branch through plan-PR continuation and also edits the
  ADRs. *Incorporated* in the Requirement and the WP2b-2 obligations.
- **Note, Error cases.** A missing plan pull request was unhandled. *Incorporated* as a step 1
  precondition.
- **Note, Testability.** The `:135` negative regex is sensitive to line breaks. *Incorporated* in
  steps 3 and 7.

## Open points

- No open points.
