# Retro and follow-up artifact next-step edges

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Extend the next-step recommendation contract (`src/shared/next-steps.md`) so that runs point to
work they leave behind today without naming it, and to a session retrospective when a run was
demonstrably turbulent. The owner selected these edges on 2026-11-16 from a proposal of possible
follow-up links and confirmed the scope decisions recorded below:

- **A1–A5, retrospective slot:** any tool that emits a next-step block may recommend
  `effective-flow retro` (bare, current conversation): after a merge-gate merge (A1, A2), after a
  merged delivery (A4), after an aborted run (A5), and after any other completed ending. It is
  offered only when a mechanical turbulence signal is present (A3). The owner chose “turbulence
  filters everything” and confirmed applying the slot to all emitting tools.
- **B1:** `merge-gate` blocked by failing checks → `effective-flow iterate <PR> fix the failing checks`,
  or `effective-flow investigate failing checks on #<PR>`. Both arguments are fixed text.
- **C2:** an open residual review-finding report → `effective-flow apply <report>`, both (a) after a
  merged delivery of `build`/`fix`/`refactor`/`maintain` that wrote the report, and (b) after a
  merge-gate merge whose verified associated plan points to such a report. The plan path reaches
  the delegated gate through a new validated `Associated plan:` input line.
- **C3:** an `issue-buddy` pass with `not-ready` issues (the owner's “retained”) or
  `READINESS_INVALID` failures → `effective-flow plan-issue <issue>`.
- **C4:** `open-plans` with status-unclear plans → `effective-flow plan <path>`.
- **D2:** `deliver | PR opened` → second option `effective-flow review <PR>`, because `deliver` performs
  no content review.

C1 (follow-up issues after a merge) is dropped by owner decision. `iterate` creates no issues:
admitted out-of-scope items end as `deferred` (`src/tools/iterate.md`), so there is nothing to
pass through.

Workflow recommendation: Feature. This changes the observable behavior of every emitting tool's
completion and abort reports, and it adds one input line to the merge-gate delegation contract.
There is no defect to fix, and the change is not a pure refactoring or a documentation change.

## Outcome checkpoint

**Primary source:** sebastian-software/effective-flow, local plan `docs/plan/2026-11-16-retro-and-follow-up-artifact-next-step-edges.md`
**Original outcome:** Completed and post-dispatch aborted runs recommend the selected follow-ups (retrospective slot A1–A5, B1, C2, C3, C4, D2) under the existing contract limits (at most two options, real arguments, chat only, no auto-start). The build guard, the mirrored user-guide table and the tests stay green.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** none
**Continuation decision:** none

## Architecture decisions

- **Retro is a contract-level slot rule, not a table edge.** `assertNextStepsContract`
  (`build-lib.mjs`) accepts only emitting tools as `Then`/`Or` targets, and `retro` is in
  `NEXT_STEPS_EXEMPT_TOOLS` (`build.mjs`). A table edge would need `retro` rows for every tool and
  a new target category in the guard. Instead, `next-steps.md` gets one section, “Retrospective
  slot”. It applies after plan-aware selection and the fallback table, for every emitting tool.
  The contract is stated once, the guard invariant (“table targets are emitting tools”) holds, and
  `retro` stays a non-emitter (`retro.md` “Conversation result”, `test/retro-contracts.test.mjs`
  unchanged). Trade-off: the table no longer lists every recommendation. The fragment already
  calls it “not an exhaustive whitelist”.
- **Closed signal list.** Retro is offered only when at least one of these holds. Each is a
  closed list. Ordinary approval pauses never count.
  - **T1:** at least one delegated `iterate` round ended with one of exactly these outcomes: a
    whole-run `ABORT` other than `nested-spawn-unavailable`, a refused CI-repair instruction, a
    second keyword-less return, or a reviewer cause still open after its second repair attempt. A
    round end caused by `BLOCKED-USER iterate-approval` never counts, and neither does any
    successful round.
  - **T2:** a delegation needed its one keyword-less recovery resume, or any completion-protocol
    retry (Retry 1 or higher) occurred.
  - **T3 (merge-gate):** the gate consumed at least two relayed answers to exceptional questions:
    `checks-pending`, `reviews-unestablished`, `check-list-waiver`, `conflict-resolution` or
    `set-aside`. `iterate-approval`, `issue-done` and `iterate-in-flight` never count. The
    delegated run counts consumed `Relayed answer:` lines in its wisdom file. That count survives
    re-dispatch, and Phase 6 carries it past the wisdom-file deletion.
  - **T4 (aborts only):** the run aborted after it had spawned at least one sub-agent for domain
    work. No-op probes are not domain work. Never counted: argument, preflight, configuration and
    migration aborts; delegated-run Entry aborts (`unparseable input line`, `invalid wisdom file`);
    every `nested-spawn-unavailable` or capability abort; and user-initiated stops, declines or
    restrictions.

  The former “inline continuation after `ABORT`” signal is dropped. Its only source in `src/` is
  `nested-spawn-unavailable`, which is excluded anyway.

- **Report duty and visibility.** The slot section itself states the duty: a run that observed a
  T-fact states it in one report line before the block. A signal counts only when that line is in
  this run's own report. This applies uniformly to every emitting tool, and merge-gate's Phase 6
  is one instance of it. It keeps the signal mechanical and gives bare `retro`, which reads only
  the visible conversation, the triggering events to analyze.
- **Mechanical eligibility.** The slot is considered unless the run received
  `Next steps: suppressed` or runs under a declared non-interactive state (`Run state:
non-interactive`, or the unattended planning envelope). `Run state: relayed` is eligible: an
  interactive caller stands behind it, and the delegated merge-gate run keeps emitting the block,
  as today.
- **Retro never displaces a candidate.** It takes the second slot when that is free. It becomes
  the first and only option when no other valid candidate exists (A2). If both slots are filled,
  it is dropped. Its description names its basis only by signal class (for example “reviews this
  run's failed iterate round”), never quoting abort reasons, check names or other forge text. On
  an abort (A5) the report still names the blocker first. Retro is then the only option of a block
  that otherwise would not exist.
- **Contract amendments, stated where the rules live.** Each sentence below contradicts a new edge
  and gains a clause:
  1. “Emit it only for a completed run …”: the retrospective-slot abort clause.
  2. Selection step 1 (“aborts, explicit no-action endings … still end without options”): the same
     clause.
  3. “Emit only applicable unfinished work …”: the retrospective-slot clause.
  4. The finding/review `apply` rule (“exists only when this run actually created an admitted
     durable report …”): it also admits the report that the verified associated plan points to,
     once resolved and still holding an open finding (C2(b)).
  5. The implemented/archived-plan rule (“needs `plan` reconciliation, never `apply`”): residual
     findings offloaded to an external report are not unfinished work of the implemented plan,
     and C2 is their candidate.
  6. The merged-delivery bullet: names the new findings-report rows (C2(a)) and the slot.
  7. The multiple-pull-request rule (“name the first one …”): generalized to several same-kind
     targets (pull requests, issues, plans).
  8. The `retro`/`focus` silence paragraph is rewritten: both still emit nothing. Only `retro` is
     recommendable, and only through the slot. `focus` is never recommended.

  Tool-local emission gates restate “only when …” today and also gain one clause, “the
  retrospective slot of `next-steps` still applies”. These sites are `investigate.md`,
  `review.md`, `setup.md`, `issue-buddy.md` and `open-plans.md`, at their next-step emission
  sentences.

- **Aborting runs load the contract.** Every `lazy-include next-steps` fence under `src/`, in tool
  files and in shared fragments such as `build-delegated-run.md`, gets its `when:` trigger widened
  to also cover “the run aborts after spawning its first domain sub-agent”. The trigger lines are
  not uniform, so each is reworded individually. The `issue-buddy` “completed pass” trigger in
  particular needs a reworded clause. A contract test covers every fence under `src/`.
- **Single merge-gate emitter.** On an `ABORT` return, the delegated run's Phase 6 step 3 emits
  nothing. The merge-gate caller alone emits the T4 block. On `DONE`, emission stays in the
  delegated run, as today.
- **C2(b) via a validated `Associated plan:` input line.** The delegated run starts with zero
  inherited turns and accepts a closed list of input lines (`merge-gate.md` dispatch section,
  `merge-gate-delegated-run.md` Entry). Add one optional line, `Associated plan: <repo-relative
path>`. The caller sends it only when it holds a verified association under the next-steps
  rules: explicit user input, or a retained link from a workflow in this session. It never infers
  the path from PR prose or a title match. At Entry, the delegated run validates the path with
  `plan-reference-resolve` (exact match, inside `<plan.dir>/` or `<plan.dir>/archive/`). Anything
  else is an unparseable input line, handled like every other malformed line. After a merge, the
  selection reads that plan's `**External review report:** <path>` (German:
  `**Externer Review-Bericht:**`). The edge applies only when that path resolves inside
  `<RUNTIME_STATE_ROOT>/.effective-flow/review/` under the review-report rule of
  `src/shared/apply-source-detection.md`, and the report still holds at least one finding with
  status `Open`/`Not implemented` (or the German form). That is one local artifact read within the
  existing bound. Without the line there is no edge: no inventory of `.effective-flow/review/`, no
  newest-report guess.
- **Order of merged merge-gate candidates.** The step-3 result of plan-aware selection comes first,
  including its existing rule that real post-merge reconciliation goes before a later package.
  Then follow, in order: the linked-issue reconciliation row (unless already chosen), C2(b), the
  `open-plans` fallback, and the retrospective slot. One composition sentence: the first applicable
  candidate in this order takes slot one, and the next independently applicable one takes slot
  two. This intentionally changes today's behavior: a merged PR with an open linked issue now also
  shows `open-plans` (when open plans exist) as its second option. The rule that omits `open-plans`
  when `<plan.dir>/` has no open plan applies to every `{{SKILL:open-plans}}` cell.
- **B1 uses fixed arguments and excludes user restrictions.** The options are
  `iterate <PR> fix the failing checks` and `investigate failing checks on #<PR>`. Check names and
  failure detail come from the forge and can be attacker-controlled (fork PRs, check-run apps), so
  they never enter an invocation. `iterate` looks up the CI details itself. An ending caused by the
  caller restriction `no-branch-writes` is never B1. The B1 condition is the closed set of existing
  failing-check paths: a refused CI-repair instruction, an unsuccessful CI-repair round,
  `maxRounds` reached with a red check, and a Phase 4 precondition unmet because of a red check.
  Pending checks and check-wait timeouts are not B1.
- **C3 set.** The edge covers `not-ready` verdicts and `failed` verdicts with
  `failures[].stage: readiness` (`READINESS_INVALID`). `issue-buddy` itself classifies the latter
  as an issue-content failure. Publish, persistence, Phase-4 plan-content and environment failures
  keep their report line only. The C3 row applies to any completed pass with at least one such
  issue when no other `issue-buddy` row applies. The existing rows gain it as their `Or`.
- **C4 covers status-unclear plans only.** In revision mode, `effective-flow plan <path>` handles an
  unclear status with a confirmation. For a top-level/archive duplicate no tool resolves it:
  revision mode stops on that collision by design. So duplicates keep their report line and get no
  invocation.

## Affected files

| File                                                                                                                                                                                                                                                                                                     | Description                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/next-steps.md`                                                                                                                                                                                                                                                                               | New “Retrospective slot” section (T1–T4, report duty, visibility, eligibility, placement, signal-class description). The eight contract amendments. Merged-candidate order with the composition sentence. `open-plans` omission for every cell. New and changed table rows at the positions in Approach step 3.                                      |
| `src/shared/merge-gate-delegated-run.md`                                                                                                                                                                                                                                                                 | Entry: parse and validate the optional `Associated plan:` line. Wisdom file: count consumed exceptional `Relayed answer:` lines (T3). Phase 6: state the T1–T3 facts in the report, carry the T3 count past the wisdom-file deletion, emit nothing on `ABORT`, and apply the merged-candidate order including C2(b). Define the closed B1 end state. |
| `src/shared/merge-gate-delegation-contract.md`                                                                                                                                                                                                                                                           | Document the `Associated plan:` line in the closed input list, if the list is stated there.                                                                                                                                                                                                                                                          |
| `src/tools/merge-gate.md`                                                                                                                                                                                                                                                                                | Dispatch: send `Associated plan:` only with a verified association. Caller emission for a post-dispatch `ABORT` (T4, only option `retro`).                                                                                                                                                                                                           |
| Every file holding a `lazy-include next-steps` fence under `src/` (tool files and shared fragments such as `src/shared/build-delegated-run.md`)                                                                                                                                                          | Widen the `when:` trigger individually to cover aborts after the first domain sub-agent spawn.                                                                                                                                                                                                                                                       |
| `src/tools/investigate.md`, `src/tools/review.md`, `src/tools/setup.md`, `src/tools/issue-buddy.md`, `src/tools/open-plans.md`                                                                                                                                                                           | Add the clause “the retrospective slot of `next-steps` still applies” to the tool-local emission gate. `open-plans.md` step 5: no open plan plus a status-unclear plan emits the new row. `issue-buddy.md` Phase 6: name the first `not-ready` or readiness-failed issue.                                                                            |
| `src/shared/build-delegated-run.md`, `src/tools/fix.md`, `src/tools/refactor.md`, `src/tools/maintain.md`                                                                                                                                                                                                | Make sure the completion summary keeps the report path when the delivery merged the branch, so the C2(a) row can be filled. Change only where a merged path omits it.                                                                                                                                                                                |
| `src/tools/<tool>.md` frontmatter                                                                                                                                                                                                                                                                        | Raise the `contextBudget:` of every tool whose eager core grows, from the build's `Always-loaded core (lines/budget)` report. Budgets moved into frontmatter with #680.                                                                                                                                                                              |
| `docs/user-guide/tool-flow.md`                                                                                                                                                                                                                                                                           | Mirror the new table rows in order. New subsection on when `retro` appears. Update “Why a recommendation is sometimes missing” (abort exception, merged deliveries with a report, duplicates).                                                                                                                                                       |
| `docs/user-guide/tools-quality.md`                                                                                                                                                                                                                                                                       | In the `retro` section, one sentence saying other tools may recommend it after turbulent runs.                                                                                                                                                                                                                                                       |
| `docs/user-guide/tools-deliver.md`                                                                                                                                                                                                                                                                       | In the `merge-gate` section, mention that a known associated plan lets the gate recommend its open review report.                                                                                                                                                                                                                                    |
| `docs/developer-guide/build-system.md`                                                                                                                                                                                                                                                                   | “Next-steps contract guard”: the retrospective slot is a contract rule outside the table, and the guard's target invariant is unchanged.                                                                                                                                                                                                             |
| `test/workflow-contracts.test.mjs`                                                                                                                                                                                                                                                                       | New assertions (Validation plan). Update the pinned finding-`apply` prose assertion, and extend the fence test from `src/tools` to every `next-steps` fence under `src/`.                                                                                                                                                                            |
| `test/build-lib.test.mjs`                                                                                                                                                                                                                                                                                | The live-table test keeps passing with the new rows.                                                                                                                                                                                                                                                                                                 |
| `evals/next-steps/scenario-registry.mjs`, `evals/next-steps/scenarios/*.md`, `evals/next-steps/fixtures/*.json`, `evals/next-steps/_scaffold/evaluate.mjs` (`EXPECTATIONS` oracles), `evals/next-steps/README.md` (scenario and run counts), `test/next-steps-eval.test.mjs` (hard-coded scenario count) | New scenarios with fixtures and oracles (Validation plan).                                                                                                                                                                                                                                                                                           |

## Implementation details

### Approach

1. **Contract section.** In `src/shared/next-steps.md`, add “Retrospective slot” after “Select from
   the associated plan before the fallback” and before the generic table. It holds T1–T4, the
   report duty and visibility rule, eligibility, placement, the signal-class description rule and
   the bare invocation `{{SKILL:retro}}`. Keep it inline: the fragment is already lazily loaded by
   every consumer.
2. **Amendments.** Apply the eight contract amendments, each in the sentence that owns the rule.
   Add the merged-candidate order with its composition sentence. Extend the `open-plans` omission
   to every cell. Add the tool-local clause at the five emission gates.
3. **Table rows.** Keep all existing rows. Add or change these, keeping `{{SKILL:x}}` cells:
   - After `merge-gate | blocked by review notes`: `merge-gate | blocked by failing checks` →
     `iterate <PR> fix the failing checks` | `investigate failing checks on #<PR>`
   - Between `merge-gate | merged but at least one linked issue …` and `merge-gate | merged`:
     `merge-gate | merged, associated plan's review report has open findings` → `apply <report>` |
     `open-plans`
   - After each tool's existing rows: `build`/`fix`/`refactor | delivery merged, findings report
written` → `apply <findings report>` | — (three rows), and `maintain | delivery merged,
offloaded report written` → `apply <offloaded report>` | —
   - `issue-buddy | dry run; would-publish …` and `issue-buddy | draft plan PR published …` gain
     Or `plan-issue <not-ready or readiness-failed issue>`. A new row after them:
     `issue-buddy | completed pass with a not-ready or readiness-failed issue, no other row
applies` → `plan-issue <issue>` | —
   - `open-plans | at least one open plan` gains Or `plan <status-unclear plan>`. A new row after
     it: `open-plans | no open plan, status-unclear plan` → `plan <status-unclear plan>` | —
   - `deliver | PR opened` gains Or `review <PR>`

   If the build guard rejects multi-word arguments such as `fix the failing checks`, keep the
   argument text inside one cell argument as the guard's existing argument grammar allows. Never
   weaken the guard.

4. **merge-gate.** In `merge-gate-delegated-run.md`: Entry parsing of `Associated plan:`, the T3
   counter in the wisdom file, the Phase 6 T-fact lines, no emission on `ABORT`, the merged order
   and the B1 definition. In `merge-gate.md`: send the line only with a verified association, and
   add the caller's T4 emission.
5. **Abort triggers.** Reword every `next-steps` fence trigger under `src/` to cover the T4 abort
   case. Each tool's abort report already names the blocker. The slot appends `retro` only when T4
   holds.
6. **C2(b) read.** In the merged branch of the merge-gate selection, with a validated
   `Associated plan:`, extract the external-report field, resolve it under the review-report rule,
   and read that one report to confirm an open finding. A failed or unsupported read is not
   retried, and the edge is dropped with a one-line limitation.
7. **Docs.** Update `docs/user-guide/tool-flow.md`, `docs/user-guide/tools-quality.md`,
   `docs/user-guide/tools-deliver.md` and `docs/developer-guide/build-system.md`.
8. **Tests and evals** per Validation plan. Then run `pnpm format`, and in CI order
   `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`. Raise frontmatter
   `contextBudget:` values from the build report.

### Component structure

Not relevant: prompt-contract change without UI components.

### State management

No new artifact. merge-gate adds one counter (consumed exceptional relayed answers) to its existing
wisdom file and carries it into Phase 6. Every other signal is a fact the run already observes and
now reports in one line. The retrospective slot writes nothing.

### API integration

Not relevant: no new helper operation and no tracker call. `Associated plan:` validation reuses
`plan-reference-resolve`. C2(b) is one local read under the existing bound.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **Turbulent run whose two slots are both filled:** retro is dropped. No third option, no
  displacement.
- **Calm run without any candidate:** no block, exactly as today.
- **Routine interactive merge-gate (approval pauses, `issue-done`, several successful rounds):** no
  T1, no T3, no retro.
- **Host without nested spawn:** never a signal.
- **Run with `Next steps: suppressed`, or a declared non-interactive or unattended run:** no retro.
  A relayed merge-gate run is eligible.
- **Preflight, argument, configuration, migration or Entry abort, or a user-initiated stop:**
  blocker only, no retro.
- **Abort after a domain sub-agent spawn:** blocker first, then a block containing only `retro`.
  For merge-gate, only the caller emits it.
- **T-fact missing from the visible report:** no signal. The slot never infers it from memory.
- **Conversation compacted:** retro is still offered when the signal line is visible. `retro`
  reports its coverage limits itself.
- **`Associated plan:` absent, unresolvable or ambiguous:** absent means no C2(b). An invalid line
  is an unparseable input line under the existing Entry rule.
- **External review report path missing, outside `.effective-flow/review/`, unreadable, or without
  open findings:** no C2(b) edge, one-line limitation.
- **Archived implemented plan with an open external report:** not plan reconciliation. C2 is the
  candidate (amendment 5).
- **Merged delivery with a report and also an unfinished associated plan package:** the plan
  package leads, and `apply <findings report>` takes the second slot.
- **B1 with only pending checks, a timed-out wait, or a `no-branch-writes` restriction:** not B1.
- **Mixed issue-buddy pass (for example, would-publish plus not-ready):** the existing row leads,
  with the C3 edge as its `Or`.
- **Several not-ready issues or several status-unclear plans:** name the first and state that the
  rest follow the same way (amendment 7).
- **open-plans duplicate without status problem:** reported as today, no invocation.

## Acceptance criteria

- [ ] `src/shared/next-steps.md` contains a “Retrospective slot” section that names `{{SKILL:retro}}`, T1–T4 as closed lists defined here, the report duty, the visibility rule, the suppression and non-interactive exclusion, the never-displace placement and the signal-class description rule. It also contains the eight contract amendments, the merged-candidate order with the composition sentence, and the `open-plans` omission for every cell.
- [ ] The next-steps table contains all existing rows plus the rows and `Or` changes of Approach step 3 at the stated positions. `node build.mjs` passes `assertNextStepsContract` and the documentation mirror guard, and `retro`/`focus` remain in `NEXT_STEPS_EXEMPT_TOOLS`.
- [ ] Every `lazy-include next-steps` fence under `src/` covers aborts after the first domain sub-agent spawn, and the five tool-local emission gates carry the slot clause. A contract test fails if either is missing.
- [ ] `merge-gate-delegated-run.md` validates `Associated plan:` at Entry, counts consumed exceptional relayed answers (T3), states T1–T3 facts in Phase 6, emits nothing on `ABORT`, defines the closed B1 end state, and applies the merged-candidate order including C2(b). `merge-gate.md` sends the line only with a verified association and emits the T4 block on a post-dispatch `ABORT`.
- [ ] `open-plans.md` emits the status-unclear row when there is no open plan. `issue-buddy.md` names the first `not-ready` or readiness-failed issue.
- [ ] No invocation or retro description the contract produces contains forge-supplied check names, failure text or abort reasons. A contract test pins the fixed B1 arguments and the signal-class description rule.
- [ ] `docs/user-guide/tool-flow.md` mirrors the table and explains the retrospective slot. `docs/user-guide/tools-quality.md`, `docs/user-guide/tools-deliver.md` and `docs/developer-guide/build-system.md` are updated.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` all succeed in that order.
- [ ] `evals/next-steps` registers the scenarios of the Validation plan with scenario files, fixtures and `EXPECTATIONS` oracles. The README and `test/next-steps-eval.test.mjs` counts are updated, and `pnpm eval next-steps verify` lists the new scenarios.

## Validation plan

- `test/workflow-contracts.test.mjs`, each test naming the invariant it protects (AGENTS.md “Writing prompt text” point 5):
  - The retrospective-slot section exists with T1–T4, the report duty, the eligibility exclusions, the signal-class description rule and `{{SKILL:retro}}`.
  - The eight amendments are in place, including the updated finding-`apply` sentence (replaces the pinned prose assertion).
  - Every `next-steps` fence under `src/` includes the post-spawn abort case, and the five tool-local gates carry the slot clause.
  - `merge-gate-delegated-run.md` defines the closed B1 path list and the `Associated plan:` Entry validation.
  - The B1 options use the fixed arguments.
  - `open-plans.md` no longer says a run without open plans always emits nothing.
- `test/build-lib.test.mjs`: the live-table test still parses, and every new row passes `assertNextStepsContract`.
- `test/retro-contracts.test.mjs` and `test/focus-contracts.test.mjs`: unchanged and green, which proves retro and focus still emit no block.
- `node build.mjs`: the next-steps guards, the doc mirror and the frontmatter context budgets pass.
- `pnpm test:distribution`: green.
- `evals/next-steps` new scenarios, each with fixture and oracle:
  - `turbulent-merge-offers-retro` (a failed `iterate` round, retro second)
  - `routine-merge-no-retro` (approval pauses and several successful rounds, no retro)
  - `post-dispatch-abort-offers-retro`
  - `both-slots-full-drops-retro`
  - `merged-plan-pointed-review-report` (C2(b))
  - `merged-delivery-findings-report` (C2(a))

  B1 is pinned by the contract test, because this suite does not load `merge-gate-delegated-run.md`.
  Run `pnpm eval next-steps verify` and `pnpm eval merge-gate verify` to list the stale suites.
  Record a round of the affected scenarios before the release PR, under the recording rule in force
  at that time (today `--mode strict` on the release PR; `docs/plan/2026-11-04-pragmatic-test-release-policy.md`
  may change it).

- Manual check: in a fresh interactive session, run a merge-gate that merges after one failed
  `iterate` round. Confirm `retro` appears as the second option with a signal-class description,
  and does not displace `open-plans`. Then run a routine merge and confirm no `retro` appears.

## Assumptions and open points

- Assumption: the T3 threshold (two consumed exceptional relayed answers) is a starting point. Changing it later is a contract edit, not a configuration switch. No configuration key is added.
- Assumption: `investigate` accepts free-text symptom input, and `iterate` accepts a free-text instruction after the PR reference, so both fixed B1 arguments are valid real arguments.
- Deliberately not incorporated: C1 (follow-up issues after merge). The owner dropped it, because `iterate` creates no issues and no other tool in the merge path does.
- Deliberately not incorporated: an invocation for top-level/archive duplicate plans, because no tool resolves that collision.
- Deliberately not incorporated: recommending `focus` (not available yet, sebastian-software/effective-flow#613), and any edge originating from `retro`.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        4 |         6 |    0 |
| Security        |        0 |         1 |    1 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         4 |    3 |
| Testability     |        0 |         3 |    4 |
| Scope           |        0 |         4 |    2 |
| Maintainability |        0 |         1 |    3 |

### Findings

Round 1 (gap analysis and plan review, 2026-11-16):

- **Architecture, Critical, incorporated:** The C1 pass-through had no data source, because `iterate` creates no follow-up issues. The owner dropped C1.
- **Architecture, Critical, incorporated:** No emitter for merge-gate retro on the real path. Relayed runs are now eligible, emission stays in the delegated run, and the caller emits only the abort block.
- **Error cases, Important, incorporated:** A5 could not fire, because aborting runs never load `next-steps`. Every fence trigger now covers post-spawn aborts.
- **Architecture, Important, incorporated:** C2 contradicted the finding-`apply` rule and the merged-delivery bullet. Both are amended.
- **Architecture, Important, incorporated:** The merged-candidate order and slot composition were undefined. A composition sentence was added, and the `open-plans` omission now covers every cell.
- **Security, Important, incorporated:** B1 copied forge-controlled check names into a copy-paste invocation. B1 now uses fixed arguments.
- **Error cases, Important, incorporated:** T2 and T4 did not match the resume and retry mechanics. T2 is redefined, and capability faults are excluded.
- **Scope, Important, incorporated:** The slot was wider than A1–A5. The owner confirmed all tools.
- **Testability, Important, incorporated:** Signals had no defined source. Signals now count only when stated in the run's own report.
- **Scope, Important, incorporated:** C3 included machine-fault `failed` verdicts. It is narrowed (refined in round 2).
- **Error cases, Important, incorporated:** Bare retro might lack evidence for nested turbulence. The visibility rule addresses this.
- **Testability, Note, incorporated:** The eval coverage was thin. Scenarios were added.
- **Error cases, Note, incorporated:** T1 counted healthy rounds. The owner chose unsuccessful rounds only.
- **Error cases, Note, incorporated:** The abort signal fired on deliberate user stops. They are excluded.
- **Maintainability, Note, incorporated:** The review-report rule was cited wrongly. It now points to `apply-source-detection.md`.
- **Maintainability, Note, incorporated:** “Interactive” had no mechanical meaning. Eligibility is defined by suppression and declared non-interactive states.

Round 2 (deep interactive review, 2026-11-16):

- **Architecture, Critical, incorporated:** T1 and T3 fired on routine merge-gate runs, because every interactive `iterate` round pauses with `BLOCKED-USER iterate-approval`. T1 is now a closed list without approval pauses. By owner decision, T3 counts only exceptional question ids.
- **Architecture, Critical, incorporated:** C2(b) could not fire on the dispatched path, because the delegated run knows no plan. By owner decision, there is a validated `Associated plan:` input line.
- **Scope, Important, incorporated:** The C3 set contradicted itself (`READINESS_INVALID` was both included and excluded). By owner decision, C3 is `not-ready` plus `READINESS_INVALID`.
- **Architecture, Important, incorporated:** The merged order contradicted selection step 3. The step-3 result now leads, and the new second option is stated as intended.
- **Architecture, Important, incorporated:** The amendment list missed selection step 1 and the tool-local gates. Both are added.
- **Architecture, Important, incorporated:** A bare `iterate <PR>` repairs no CI. By owner decision, it uses a fixed free text, and `no-branch-writes` endings are excluded.
- **Testability, Important, incorporated:** T3 was never reported and was deleted with the wisdom file. It now counts consumed answers, is carried past deletion and is stated in Phase 6.
- **Error cases, Important, incorporated:** A delegated `ABORT` could produce two blocks. The delegated run now emits nothing on `ABORT`.
- **Maintainability, Important, incorporated:** `CONTEXT_BUDGET_LINES` no longer exists. The plan now targets frontmatter `contextBudget:` (#680).
- **Testability, Important, incorporated:** The eval change missed oracles, fixtures, the README and the count test. All are added to Affected files.
- **Architecture, Important, incorporated:** C2 collided with the implemented-plan rule. Amendment 5 exempts offloaded findings.
- **Scope, Important, incorporated:** Tools outside merge-gate had no report duty. The duty now lives in the slot section.
- **Error cases, Note, incorporated:** The abort signal counted capability faults and Entry aborts. Both are excluded, and “domain sub-agent” is defined.
- **Scope, Note, incorporated:** The inline-continuation signal had no source. It is dropped.
- **Testability, Note, incorporated:** The fence test missed shared fragments, and the trigger lines differ. The test now covers all of `src/`, with individual rewording.
- **Maintainability, Note, incorporated:** The multiple-target rule covered PRs only. Amendment 7 generalizes it.
- **Testability, Note, incorporated:** Acceptance criterion 2 omitted existing rows and positions. Both are fixed.
- **Scope, Note, incorporated:** The C3 row missed mixed passes. C3 is now the `Or` on existing rows plus a fallback row.
- **Security, Note, incorporated:** The retro description could leak forge text. It is now restricted to signal-class wording and pinned by a test.
- **Testability, Note, incorporated:** The B1 eval scenarios could not test the B1 definition. They are replaced by a contract test.

## Open points

- No open points.

## Build completion

**Date:** 2026-11-16
**Workflow:** effective-flow build (inline Quality route), continued on plan PR #683

### Requirement

Implemented as planned: the retrospective slot (A1–A5, signals T1–T4), B1, C2(a) and C2(b) via the
validated `Associated plan:` line, C3, C4 and D2. C1 stays dropped.

### Architecture decisions

As planned, with these refinements from implementation and review:

- The slot section names an explicit abort clause: after an abort only T4 qualifies.
- Retro eligibility is mechanical: only the literal `Run state: non-interactive` line, the
  unattended planning envelope, or a `non-interactive` state a tool infers by its own documented
  fallback excludes it.
- The full `Associated plan:` check lives once in the always-loaded merge-gate core. The caller drops
  a line that fails it before every dispatch, re-dispatches included, or an inline run. The
  delegated run's Entry applies the same check as a strict backstop, and an Entry abort returns
  `Entry abort: yes`, which T4 never counts.
- C2(b) counts only `Open` or bare `Not implemented` findings, never `(ADR: <slug>)` statuses.
- The closed B1 set is phrased as endings. Pending-check, wait-timeout and `no-branch-writes`
  endings win, and `blocked by review notes` precedes `blocked by failing checks`.
- A delegated build `ABORT` emits nothing; its caller alone applies the slot.

### Affected files

- `src/shared/next-steps.md`, `src/shared/merge-gate-delegated-run.md`, `src/tools/merge-gate.md`,
  `src/shared/build-delegated-run.md`, `src/shared/setup-targeted-change.md`, and the next-steps
  fence triggers or emission gates of 21 tool files under `src/tools/`
- `contextBudget:` raised for `issue-buddy` (490 → 494) and `merge-gate` (922 → 925)
- `docs/user-guide/tool-flow.md`, `tools-quality.md`, `tools-deliver.md`,
  `docs/developer-guide/build-system.md`
- `test/workflow-contracts.test.mjs`, `test/next-steps-eval.test.mjs`,
  `test/helper-step-contract.test.mjs`, `test/model-tiers-contract.test.mjs`
- `evals/next-steps/` (six scenarios, fixtures, oracles, registry, README) and
  `evals/host-driver/tests/test_first_stage.py` (per-suite frozen branch tables, so post-freeze
  next-steps scenarios stay outside the frozen 155-slot corpus)

### Implementation details

`merge-gate-delegation-contract.md` needed no change, because it holds no caller input-line list.
`fix`, `refactor` and `maintain` already name their report path after a merge; `build` now does too.
Commit, cleanup and setup Targeted/Status endings spawn no sub-agent, so their wording was narrowed
to "matches no next-steps row" instead of gaining the slot clause.

### Test results

- `pnpm agent:check`, `node build.mjs` and `pnpm test:distribution` pass.
- No local full-suite evidence (environment: version-control): the test preflight's `git-checkout`
  check fails inside the validation container for this linked worktree. The pull request's CI runs
  the full suite.
- The targeted contract, eval and host-driver tests of the change pass. The remaining local failures
  all carry the version-control environment signature. Two composed host-driver tests timed out
  once under parallel load and passed in an isolated run on the same tree.
- `pnpm eval next-steps verify` and `pnpm eval merge-gate verify` report no integrity blockers. The
  six new next-steps scenarios have no recorded evidence yet, and the existing scenarios are stale;
  record a round before the release PR.

## Review findings

**Date:** 2026-11-16
**Reviewer:** effective-flow-nodejs-reviewer

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    21 |
| Open / Not implemented |     0 |

Three further observations were closed below the admission threshold: T3 coverage for inline gate
runs, an Entry-abort marker for the dormant delegated build route, and harmless setup Status
wording.
