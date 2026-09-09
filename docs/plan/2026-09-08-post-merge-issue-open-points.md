# Post-merge analysis of an issue's open points and its closure follow-up

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

When `merge-gate` merges a pull request that was built from an issue and that merge does **not**
close the issue, the run should analyse what is still open in that issue and show the concrete
follow-up steps that would close it.

"Not closed by the merge" is already an observable state, not a new one. The lifecycle receipt in
the pull-request body records each linked issue with `relationship: closes` or `refs`
(`src/shared/issue-lifecycle.md:40`), and Phase 5.5 step 2 waits out a fixed 30-second grace period
and records `open` or `timed out` for every issue that is still nonterminal afterwards. The
requirement therefore lands on issues linked with `refs` — which is every external issue
(`src/shared/issue-lifecycle.md:54`) — plus `closes` links whose provider auto-close did not fire
inside that window.

Most of the surrounding machinery exists. Phase 5.5 already assesses completion unasked for every
`open` or `timed out` issue, already names which dimension is unmet, and already derives a five-step
closure guidance (`src/shared/issue-post-merge-observation.md:154-174`). One concrete gap keeps that
from answering the requirement:

**The analysis reads the wrong surface.** Step 3 takes its evidence from the issue **body** and its
native children (`src/shared/merge-gate-issue-observation.md:80-95`). But `effective-flow plan-issue`
persists its plan — including `### Open points`, the recorded implementation-blocking decisions —
in the canonical `<!-- effective-flow-plan-issues -->` **comment**, never in the body
(`src/tools/plan-issue.md:111-113`, `:164-166`). The richest existing record of what is still open in
an issue is therefore invisible to the gate, and the report the operator gets after a merge names
none of it.

Scope is the merge gate's post-merge observation and its Phase 6 report. It is a
**read-and-report** change: one added read, one added report item, and one widened guidance
sentence. Nothing about the completion verdict, the terminal-transition offer, the grace period, the
merge itself, the container reconciliation, or the next-steps routing table changes.

## Architecture decisions

- **Extend Phase 5.5 step 3 rather than add a phase.** The observation already owns the issue read,
  the fixed read budget, the untrusted-data discipline and the per-issue report. A second post-merge
  pass would duplicate all four and would have to re-establish the receipt.
- **Read the canonical planning comment for its open points only — never for acceptance criteria.**
  This is the decision the rest of the plan rests on, and it was taken deliberately after the
  criteria idea was examined and rejected. Feeding comment-derived criteria into the verdict would
  have made a tracker write reachable on evidence any account with comment rights can author, which
  in turn forced a `viewer-read` authorship gate — and that gate cannot be relied on anywhere:
  Forgejo's comment read is the `tea` porcelain renderer (`src/scripts/remote-tracker-core.mjs:3221-3229`)
  whose sibling is recorded as stating no login at all (`:4140-4142`); `src/shared/tracker-target.md:85-94`
  declares no identity capability for an external target; and observer-only mode skips Phase 1
  (`src/tools/merge-gate.md:803-805`, `:857`), the only place the run reads its own account
  (`:899-900`). It would additionally have collided with the `complete` gate's "no unchecked entry in
  the issue's own task list" dimension, because `plan-issue` writes criteria as an unchecked task
  list (`src/tools/plan-issue.md:128-129`) that nothing ever ticks. Reading open points only removes
  every one of those problems at once.
- **Open points are report-only and feed no gate.** They do not enter the `complete` verdict, do not
  block it, do not reach the terminal-transition offer, and authorize no write. The
  `effective-flow-needs-planning` classification remains the planning blocker _by contract_ — it is
  the durable classification the tracker holds, and `apply-issues` keeps or adds exactly it when open
  points are nonempty (`src/tools/apply-issues.md:206-214`). A comment section is not a durable
  classification and nothing keeps it in step with the label once a human edits it.
- **Because they feed no gate, step 4 is untouched.** Step 4's revalidation re-derives the _verdict_
  from a fresh basis and carries its own budget literal
  (`src/shared/merge-gate-issue-observation.md:193-196`). The verdict does not depend on the comment,
  so nothing there needs re-reading and its budget does not move. The two budgets stay the separate
  literals the source insists they are.
- **Reporting is not gated on the guidance order.** The closure guidance is explicitly
  stop-at-first-match and its rule 1 is `relationship: refs`
  (`src/shared/issue-post-merge-observation.md:154`, `:164`), which every `refs`-linked issue matches
  unconditionally — so a rule placed at position 3 would never be reached for the primary case this
  requirement is about. The recorded open points are therefore reported as a **per-issue observation**
  in Phase 6, for every issue step 3 assessed, independent of which rule the guidance stopped at.
  Rule 1's and rule 3's guidance text additionally name them when they fire. This changes no rule's
  position and does not weaken stop-at-first-match.
- **No next-steps edge.** The follow-up is delivered as the Phase 6 closure guidance, not as a
  routing edge. `{{SKILL:apply}} <issue>` would abort on exactly these issues: `apply-issues` Phase 2
  skips any item carrying `effective-flow-issue-done` (`src/tools/apply-issues.md:184`) and aborts on
  an empty work list (`:198`), while `apply-issues` sets that label immediately after PR creation
  (`:341-342`) — so every issue behind a merged PR is skipped. Routing to `{{SKILL:plan-issue}}`
  instead would cover only the planning half. The next-steps table, its `tool-flow.md` mirror and the
  build guards are consequently **not** touched.
- **The report quotes the open-point text, as a stated exception to the phase's no-quoting rule.**
  Phase 5.5 otherwise quotes no issue or pull-request text
  (`src/shared/merge-gate-issue-observation.md:127`). The carve-out is narrow and its reason is
  stated where it is taken: open points feed no gate, so text that misleads the operator cannot make
  the run do anything — the property that makes quoting safe here is exactly the report-only property
  above, and the exception must be written to depend on it rather than to stand alone. It carries a
  display discipline: the text is rendered as inert content, an instruction found inside it is never
  executed, and a per-item length cap applies. Criterion locators and pull-request text stay
  unquoted.
- **Parse the comment in prose under a stated closed heading set; add no helper operation.**
  `planning-comment-build` has no parse counterpart, and merge-gate deliberately loads neither
  `issue-tracker` nor `issue-tracker-forge`, reaching the helper only through the "Remote helper"
  reference (`src/shared/pr-merge-completion.md:36-41`). A new script operation would pull tracker
  fragments into a tool whose context budget is built on not loading them.
- **Only the newest comment carrying the canonical marker counts.** Selection follows the rule
  `plan-issue` and apply-source-detection stage B already use: newest comment beginning with
  `<!-- effective-flow-plan-issues -->` or its one-generation legacy spelling
  `<!-- firmo-plan-issues -->`. Every other comment is ignored, so arbitrary maintainer prose never
  becomes an observation.
- **A failed or unsupported comment read costs the observation and nothing else.** It is reported as
  "open points unobserved" and the verdict is exactly what it is today. This is a strict
  non-regression, and it is only available because the verdict never depends on the comment — the
  fail-closed rule the child read carries (`src/shared/merge-gate-issue-observation.md:86-87`) exists
  because an unread child list hides an open sub-issue that _does_ gate the verdict, and that
  reasoning does not transfer here.
- **`issueCommentsRead` joins Phase 0's capability preflight.** The six capabilities merge-gate names
  today (`src/tools/merge-gate.md:817`) do not include it, and the degradation list at `:820-856`
  carries an explicit paragraph for each of `viewerRead` and `issueClose`. The new dependency gets
  the same treatment rather than being an unnamed assumption.
- **No new configuration key.** Consistent with the grace period and the completion assessment, which
  both state they carry none.

## Affected files

| File                                                        | Description                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/issue-post-merge-observation.md`                | Provider-neutral half: the canonical planning comment as an observation input, the open-points definition, the report-only property, the quoting exception with its display discipline, and the open points named in guidance rules 1 and 3.                                             |
| `src/shared/merge-gate-issue-observation.md`                | Step 3: add the comment read with its forge/external target split, raise the step-3 budget literal by one comment read, define the closed heading set and the failed-read degradation. Step 7: name the recorded open points where rules 1 and 3 fire. Step 4 is deliberately unchanged. |
| `src/tools/merge-gate.md`                                   | Phase 0: add `issueCommentsRead` to the capability preflight and its degradation paragraph. Phase 6: the per-issue open-points report item, quoted under the stated exception, not gated on the guidance rule.                                                                           |
| `docs/user-guide/tools-deliver.md`                          | The merge-gate report description (around lines 615-627): the new observation and the widened guidance sentence.                                                                                                                                                                         |
| `docs/user-guide/troubleshooting.md`                        | The "A linked issue remains open after merge" entry, pinned by `test/workflow-contracts.test.mjs:7838`; and the `tea`-without-`--include` build note, pinned at `:7816-7818`.                                                                                                            |
| `docs/user-guide/remote-tracker.md`                         | The "Merge gate operations" section: an `issue-comments-read` row in the operations table with its capability and effect, and the lead-in's operation count raised from seven to eight.                                                                                                  |
| `test/workflow-contracts.test.mjs`                          | Source-text assertions for the new observation, the report-only property, and the quoting exception.                                                                                                                                                                                     |
| `evals/merge-gate/scenarios/`, `evals/merge-gate/fixtures/` | New observer-only `linked-issue-open-points` scenario and its fixture, whose envelopes are generated through the real normalizer.                                                                                                                                                        |
| `evals/merge-gate/results/`                                 | Five archived runs for the new scenario; re-archived runs for the two existing ones.                                                                                                                                                                                                     |
| `test/merge-gate-eval.test.mjs`                             | The `SCENARIOS` entry (`:73`) and the new scenario's outcome assertion; without the entry the scenario is inert.                                                                                                                                                                         |
| `test/eval-fixture-fidelity.test.mjs`                       | Its required-operation list (`:173-191`) and byte-identity assertions (`:119-150`) cover every new envelope.                                                                                                                                                                             |
| `evals/merge-gate/README.md`                                | Its "Phase 5.5 entry is not exercised" statement (`:161-165`), the two-scenario framing (`:149-160`) and the cost paragraph (`:73-79`) all move.                                                                                                                                         |
| `build.mjs`                                                 | Only if the measured `merge-gate` core exceeds its `CONTEXT_BUDGET_LINES` entry (2787; measured 2721 today, so 66 lines of headroom).                                                                                                                                                    |

## Implementation details

### Approach

1. **Provider-neutral contract first** (`src/shared/issue-post-merge-observation.md`). Add the
   canonical planning comment as an observation input, define the recorded open-point section, and
   state the report-only property explicitly — it is what every later safety argument rests on. Then
   state the quoting exception as depending on that property, with its display discipline and cap.
   Finally, name the open points in guidance rules 1 and 3 without moving either rule.
2. **Merge-gate body** (`src/shared/merge-gate-issue-observation.md`). In step 3, add the comment
   read per issue with its target split — the forge uses `issue-comments-read`, an external issue
   uses the connection's own equivalent, and neither target's operations are invoked against the
   other, exactly as steps 1, 2, 4 and 6 already split. State the canonical-marker selection rule,
   the closed heading set, and that a failed or unsupported read costs the observation and not the
   verdict. Raise the step-3 budget literal by one comment read and state it carries no configuration
   key. State that step 4 is deliberately unaffected, and why.
3. **Report** (`src/tools/merge-gate.md`, Phase 6). Add the per-issue open-points item for every
   issue step 3 assessed, independent of the guidance rule, with the text quoted under the stated
   exception. Say explicitly that a `terminal` or `unobservable` issue carries no such item, matching
   how the verdict item already reports why it was not assessed.
4. **Capability preflight** (`src/tools/merge-gate.md`, Phase 0). Add `issueCommentsRead` to the
   named capabilities and give it a degradation paragraph in the same shape as `viewerRead`'s.
5. **Tests** (`test/workflow-contracts.test.mjs`). Assert the report-only property and the quoting
   exception as source text, so a later edit cannot quietly turn the observation into a gate — the
   invariant the whole safety argument depends on.
6. **Documentation** (`docs/user-guide/tools-deliver.md`, `docs/user-guide/troubleshooting.md`).
7. **Build and measure.** Run `node build.mjs`; take the `merge-gate` figure from the
   `Always-loaded core (lines/budget)` report and bump `CONTEXT_BUDGET_LINES` only if the edit
   exceeds the current entry. Both observation fragments are ` ```lazy-include `
   (`src/tools/merge-gate.md:111`, `:1723`), so only the Phase 0 and Phase 6 growth counts.
8. **Evals.** Add an **observer-only** `linked-issue-open-points` scenario: an already-merged pull
   request carrying a valid receipt, which is the only way Phase 5.5 is reachable in a stateless stub
   (see the validation plan). Generate every envelope through the real normalizer per
   `evals/merge-gate/README.md:251-258` — at minimum `issue-lifecycle-receipt-parse` with
   `found: true` (both existing fixtures state `found: false`), `issue-state-wait`, `issue-read`,
   `issue-sub-issues-read` and `issue-comments-read` — and declare `issueRead`, `issueCommentsRead`
   and `issueSubIssuesRead` in the probe envelope's capability map, none of which it carries today. A
   run whose operation set is not fully covered is discarded (`test/merge-gate-eval.test.mjs:344-353`).
   Then re-run all three scenarios, five runs each.

### Component structure

Not relevant — Markdown source changes, test assertions and eval fixtures; no runtime script changes.

### API integration

No new helper operation. The only new call is the already-shipped `issue-comments-read`
(`src/scripts/remote-tracker-core.mjs:47`, `:2796` on GitHub, `:3221` on Forgejo), and on an external
target the connection's declared "read comments" capability (`src/shared/tracker-target.md:90`).
Because no authorship is established, the Forgejo renderer's missing poster field is irrelevant here
— the reason the criteria idea was cut.

### Edge cases

- **No canonical comment on the issue.** No open points are observed; the report says so. Distinct
  from a failed read.
- **Comment read fails or is unsupported.** Reported as "open points unobserved". The verdict, the
  offer and every write are exactly what they are today.
- **`tea` built without `--include`.** Reads comments fine (`issueCommentsRead` is gated on
  `issues && issueComments`, `src/scripts/remote-tracker-core.mjs:4090`, not on the `tea api`
  transport), so this configuration is fully served. Worth a named line because
  `docs/user-guide/troubleshooting.md` already documents that build.
- **Legacy `<!-- firmo-plan-issues -->` marker.** Recognised on read, one generation. Never written.
- **Several comments carry the marker.** Only the newest counts.
- **The open-points section is at its empty state** (`- No open points.` / `- Keine offenen Punkte.`).
  That is an observation of _no_ open points, reported as such, and never as an unobserved one.
- **An open-point entry exceeding the display cap.** Truncated at the cap with the truncation stated,
  and the comment URL given.
- **An open-point entry containing something shaped like an instruction.** Rendered as inert text and
  never executed. The report-only property is what bounds the damage: nothing the text says can
  change a verdict or a write.
- **German comment sections.** `### Offene Punkte` with `- Keine offenen Punkte.` alongside
  `### Open points` with `- No open points.`
- **Observer-only mode.** Fully supported and unaffected: nothing in this change reads the
  authenticated account, so the path that skips Phase 1 loses nothing. This is also the eval's entry
  point.
- **A `refs`-linked issue whose guidance stops at rule 1.** Its open points are still reported —
  that is the whole point of decoupling the report from the guidance order — and rule 1's text names
  them.
- **`terminal (cancelled)` and `terminal (reconciliation unavailable)`.** Step 3 does not assess
  them, so no comment is read and no open-points item appears.

## Acceptance criteria

- [ ] `src/shared/issue-post-merge-observation.md` states the recorded open points as report-only in
      so many words — not feeding the verdict, not blocking `complete`, not reaching the offer, and
      authorizing no write — and states the quoting exception as depending on that property.
- [ ] `src/shared/merge-gate-issue-observation.md` step 3 raises its budget literal by one comment
      read, states it carries no configuration key, and states that a failed or unsupported comment
      read leaves the verdict unchanged.
- [ ] Step 4's budget literal in `src/shared/merge-gate-issue-observation.md` is **unchanged**, with a
      sentence saying why — the two budgets are documented as "never read as one shared budget"
      (`:193-196`).
- [ ] The open-points report item in `src/tools/merge-gate.md` Phase 6 is stated for every assessed
      issue and is not conditioned on which closure-guidance rule matched.
- [ ] `issueCommentsRead` appears in Phase 0's capability list and has a degradation paragraph.
- [ ] `src/shared/next-steps.md`, `docs/user-guide/tool-flow.md` and the next-steps build guards are
      **unmodified** — this change adds no routing edge.
- [ ] `test/workflow-contracts.test.mjs` asserts the report-only property and the quoting exception as
      source text, and passes.
- [ ] The `linked-issue-open-points` eval scenario exists with five archived runs, and its call log
      shows exactly one `issue-comments-read` for the open linked issue and no second one.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all pass —
      including the eval build-stamp assertions, which requires all three scenarios re-archived
      against the post-change tree.
- [ ] The printed `merge-gate` core stays within its `CONTEXT_BUDGET_LINES` entry, bumped by at most
      ten lines of headroom if it does not.
- [ ] No new configuration key appears in `src/shared/config-merge-gate-keys.md`,
      `src/tools/setup.md`, or the project-setup ADR.

## Validation plan

- `pnpm agent:check`, then `pnpm test`, then `node build.mjs`, then `pnpm test:distribution` — the
  sequence CI runs after a distribution-source edit.
- **The eval re-run is a scheduled work step, not a check.** `test/merge-gate-eval.test.mjs:128-140`
  hashes the built tree into each run's identity, and `assertBoundToCurrentBuild` (`:206-226`)
  hard-fails every archived run whose stamp differs. Ten runs are archived today and the suite is
  green; any edit here makes all ten red with certainty. Refreshing a stamp onto a log produced by an
  older tree would forge exactly the evidence the stamp exists to prevent, so the only correct remedy
  is to re-run: `pnpm prepare:merge-gate-eval <scenario>`, hand the printed prompt to a **fresh**
  agent, re-run prepare to archive. Three scenarios × five runs = **15 runs at roughly five minutes
  each**, serialized — the README forbids concurrent rounds across checkouts (`:81-87`).
- **The new scenario must be observer-only, and that is a property of the harness, not a preference.**
  The stub resolves envelopes by operation name alone, with one document per operation and no state
  (`evals/merge-gate/_scaffold/remote-tracker.mjs:194-221`), so a merging scenario's post-merge
  `pr-read` returns the same open-PR document and the fresh read that Phase 5.5 entry requires
  (`src/tools/merge-gate.md:1719-1722`) never proves the merge. The README states this and defers the
  stateful stub to "WP6" (`:161-165`). An already-merged fixture reaches Phase 5.5 through the
  observer-only branch instead, and that statement in the README must be corrected as part of this
  change.
- **What the eval can and cannot show.** The suite asserts what the gate _did_, from a call log whose
  record schema is `{seq, operation, apply, at, cwd}` (`test/merge-gate-eval.test.mjs:58`,
  `:255-266`); the chat report is captured nowhere. So the observable assertion is the presence and
  count of `issue-comments-read`, which is real evidence that the new read happens once per open
  issue. That the open points reach the _report_ is asserted as source text in
  `test/workflow-contracts.test.mjs`, not in the eval — stated here so the acceptance criteria are
  not read as promising more than the instrument can carry.
- The eval sandbox's project-setup ADR is identical for every scenario by design
  (`evals/merge-gate/_scaffold/scaffold.mjs:114-122`); the new scenario is compatible with it as
  written (`tracker.mode: remote`, `mergeGate.completion: merge`) and must not change it.
- Manual read-through of the two observation fragments confirming the target split is stated for the
  new read exactly as it is for the existing ones.

## Assumptions and open points

- **Assumption:** the requirement is read-and-report. The run shows the analysis and the follow-up in
  chat; it does not write the analysis back onto the issue. Nothing in merge-gate's write boundary
  would permit that today, and "anzeigen" in the requirement points at reporting.
- **Assumption:** an external connection that declares "read comments" returns enough of a comment
  body to locate the marker and the section. The capability is declared in terms of "the full comment
  list with stable comment identifiers" (`src/shared/tracker-target.md:90`); bodies are what the
  planning workflow already round-trips through that same capability, so this is consistent rather
  than novel — but it is an inference from `plan-issue`'s use, not a stated guarantee.
- **Assumption:** a per-item display cap is the right shape for bounding quoted text. The concrete
  number is an implementation detail, not a plan-level decision.

## Test results

**Date:** 2026-09-09

| Check                    | Result                                                          |
| ------------------------ | --------------------------------------------------------------- |
| `pnpm agent:check`       | pass, 358 files                                                 |
| `node build.mjs`         | pass; `merge-gate` always-loaded core 2752/2787, no budget bump |
| `pnpm test`              | 867 pass, 2 fail, 3 skipped                                     |
| `pnpm test:distribution` | pass                                                            |

The two failures are `guard-blocks-merge` and `merge-proceeds` in `test/merge-gate-eval.test.mjs`,
both reporting that their archived runs observed a different build. This is the build-stamp drift
the validation plan predicted with certainty: the stamp hashes the built tree, so any edit here
invalidates all ten archived runs. The remedy is the scheduled re-run, never a refreshed stamp,
which would forge the evidence the stamp exists to prevent. **The 15 rounds were deferred by an
explicit decision during implementation**; the scenario, its fixture, its `SCENARIOS` entry, its
outcome assertion and the corrected eval README all shipped, so the rounds can be executed without
further authoring. The three skipped tests are the new scenario's, skipping cleanly for want of
archived runs rather than failing.

Acceptance criteria 8 and 9 are therefore **not met** and the branch is not mergeable until the
rounds run. Every other criterion is met.

One regression was found and fixed during implementation rather than shipped: adding the
`issue-state-wait` envelope made `test/eval-fixture-fidelity.test.mjs` replay the helper's real
30-second grace period, taking the suite from ~1.5 s to ~31 s and making the emitted
`observedWaitMs` depend on the wall clock. A no-op sleeper plus a stepping clock in that test
reproduce the same envelope deterministically; it now runs in 1.4 s.

## Review findings

**Date:** 2026-09-09
**Reviewer:** `effective-flow-code-validator` (tooling bucket, per the project-routing contract)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    14 |
| Open / Not implemented |     5 |

Delivered at all severities, as a build run's audit trail requires: 1 critical, 4 important,
14 notes.

The critical finding is the unimplemented eval half; it is open by the deferral decision recorded
above, with its scaffolding shipped. All four important findings are fixed: the quoting exception
was scoped by subject but not by **venue**, so read literally it permitted quoting into the offer
prompt; the `ask` fence still asserted the run quotes no issue text, which the change had made
false while a test pinned it; the independence of the open-points report from the matched
closure-guidance rule — the resolution of the plan's own architecture critical — was stated in
three files and pinned by none, and mutation testing confirmed the regression could be
reintroduced silently in any of them; and a canonical comment predating the open-points section
matched none of the reported result states. Nine notes were fixed, including a factual error about
which `tea` capabilities the new read rides.

Four notes stay open as accepted: the "three capabilities whose absence ends nothing" count is
loose in the same way it was at "two"; the two fragments carry near-duplicate literals that no
assertion requires to agree; parts of the Phase 6 discrimination and the user-guide statements of
the report-only property are unpinned, which is within the plan's stated contract; and
`merge-gate`'s 38 lines of budget headroom exceed the ten-line ceiling `AGENTS.md` states, which
predates this change and which the plan explicitly directed not to touch.

No findings were offloaded to an external review report; all fixed findings were closed in this
run.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        2 |         1 |    1 |
| Security        |        1 |         0 |    1 |
| Data protection |        0 |         1 |    0 |
| Error cases     |        0 |         2 |    0 |
| Testability     |        2 |         1 |    0 |
| Scope           |        1 |         0 |    1 |
| Maintainability |        0 |         0 |    2 |

The plan passed two review passes. The first, an `effective-delivery` quality review, found four
criticals that were incorporated into the draft. The second, the deep interactive review below, found
that three of those incorporations rested on unverified facts and removed them. Every critical is
resolved in the current text; the counts above are cumulative across both passes.

### Findings

#### Deep interactive review (2026-09-08)

- **Architecture, critical — the widened guidance rule was unreachable for the primary case.** The
  closure guidance is stop-at-first-match and rule 1 is `relationship: refs`
  (`src/shared/issue-post-merge-observation.md:154`, `:164`), which every `refs`-linked issue — and
  therefore every external issue — matches unconditionally. A rule placed at position 3 would never
  be reached for exactly the issues the requirement is about. Resolved: the open points are reported
  as a per-issue observation independent of the guidance order, and rules 1 and 3 name them when they
  fire. No rule moved and stop-at-first-match is intact.
- **Scope, critical — the planned routing edge pointed at a tool that would abort.** `apply-issues`
  Phase 2 skips any item carrying `effective-flow-issue-done` (`src/tools/apply-issues.md:184`) and
  aborts on an empty work list (`:198`), while `apply-issues` sets that label immediately after PR
  creation (`:341-342`). Every issue behind a merged PR is therefore skipped before the
  insufficient/needs-planning detection at `:206-214` is ever reached. Resolved by decision: the
  follow-up is Phase 6 guidance prose and no next-steps edge is added, so the table, its mirror and
  the build guards are untouched.
- **Security, critical — the authorship gate could not hold on any target class.** The gate existed
  only to make comment-derived acceptance criteria safe enough to feed a tracker write. Forgejo's
  comment read is the `tea` porcelain renderer whose sibling is recorded as stating no login
  (`src/scripts/remote-tracker-core.mjs:3221-3229`, `:4140-4142`);
  `src/shared/tracker-target.md:85-94` declares no identity capability for an external target; and
  observer-only mode skips Phase 1 (`src/tools/merge-gate.md:803-805`, `:857`), the only place the
  authenticated account is read (`:899-900`). Resolved by decision: acceptance criteria are not read
  at all, which removes the write path and the gate together.
- **Architecture, critical — comment criteria would have collided with the task-list dimension.**
  `plan-issue` writes criteria as an unchecked task list (`src/tools/plan-issue.md:128-129`) that
  nothing ever ticks, while `complete` requires "no unchecked entry in the issue's own task list"
  (`src/shared/merge-gate-issue-observation.md:108`) — structurally the same trap the contract already
  documents and closes for the container entry (`:93-95`). Moot under the criteria cut, and recorded
  because it is the second independent reason that cut was right.
- **Testability, critical — Phase 5.5 is not reachable in the eval harness.** The stub is stateless
  (`evals/merge-gate/_scaffold/remote-tracker.mjs:194-221`), so a merging scenario's post-merge
  `pr-read` returns the same open-PR document and the entry condition
  (`src/tools/merge-gate.md:1719-1722`) never holds; the README states this and defers the fix
  (`:161-165`). Resolved: the new scenario is observer-only, and correcting that README statement is
  in the affected files.
- **Testability, critical — the earlier eval cost was wrong and the criteria were unobservable.** The
  suite asserts what the gate did, from a call log that captures no report text
  (`test/merge-gate-eval.test.mjs:19-23`, `:58`); a foreign-author variant is a whole second scenario,
  not "a second envelope set", since `scaffold.mjs:51` binds one fixture per scenario. Resolved: the
  criteria cut removes the foreign-author scenario entirely; the surviving assertion is the
  `issue-comments-read` call count, and the validation plan now states what the instrument cannot
  carry. Corrected cost: 15 runs, serialized.
- **Error cases, important — a failed comment read was specified to be worse than today.** The draft
  inherited the child read's fail-closed rule and would have yielded `undetermined` for issues that
  are `complete` today. Resolved: with the verdict no longer depending on the comment, a failed read
  costs the observation and nothing else — a strict non-regression, with the reason stated rather
  than the analogy reused.
- **Error cases, important — `issueCommentsRead` is not in Phase 0's capability preflight**
  (`src/tools/merge-gate.md:817`), unlike `viewerRead` and `issueClose`, which each carry a
  degradation paragraph. Incorporated as its own affected-file item and acceptance criterion.
- **Architecture, important — the twenty-criteria union bound would have regressed today-passing
  issues.** An issue with fifteen body criteria plus ten comment criteria would have become
  `undetermined` and lost its offer, contradicting the draft's own "never worse than today". Moot
  under the criteria cut; the dedup and ordinal-namespace questions it raised die with it.
- **Data protection, important — quoting open-point text is an exception to a stated invariant.**
  Phase 5.5 quotes no issue or pull-request text (`src/shared/merge-gate-issue-observation.md:127`).
  Decided deliberately: the text is quoted, and the exception is written to depend on the report-only
  property rather than to stand alone, with a display discipline and a cap. A source-text assertion
  pins the property, so a later edit cannot turn the observation into a gate and leave the quoting
  exception resting on nothing.
- **Testability, important — three files were missing from the affected list.**
  `test/merge-gate-eval.test.mjs` (the hardcoded `SCENARIOS` list at `:73` and the scenario's own
  outcome assertion), `test/eval-fixture-fidelity.test.mjs` (byte-identity and required-operation
  coverage for every new envelope), and `evals/merge-gate/README.md`. All three added, with the
  fixture-generation procedure named in the approach.
- **Maintainability, note — several sentences admitted two readings.** "Matched rule 2 or 3", "the
  affected dimension", "a second envelope set", and the reuse of the unfillable-edge rule for a
  policy drop. All either rewritten or removed with the design they described.
- **Security, note — the quoting exception is the one place a later edit could go wrong quietly.**
  Its safety is derived, not intrinsic: it holds only while open points feed no gate. Pinning that
  property in `test/workflow-contracts.test.mjs` is what keeps the derivation honest.
- **Maintainability, note — the eval sandbox's shared ADR is identical for every scenario by design**
  (`evals/merge-gate/_scaffold/scaffold.mjs:114-122`). The new scenario is compatible as written and
  must not change it. Stated in the validation plan.

#### First review pass (2026-09-08)

- **Security, critical** — comment-derived criteria could authorize a tracker write on evidence any
  account with comment rights can author. Mitigated in the draft with an authorship gate; superseded
  by the deep review, which removed the write path itself.
- **Scope, critical** — a bare `<issue>` argument misroutes, because apply-source-detection Stage A
  treats a four-digit number without a path as always a legacy plan reference. Moot: no edge is added.
- **Scope, critical** — the routing row fires for four states, three of which must not send anyone to
  do work. Moot for the same reason.
- **Testability, critical** — the eval build stamp fails with certainty and the draft's proposed
  remedy would have forged evidence. Carried forward and refined by the deep review.
- **Architecture, important** — the "already blocked by needs-planning" equivalence was overstated.
  Restated: the label is the blocker by contract; a comment is not a durable classification.
- **Error cases, important** — the new read needed its own fail-closed reasoning rather than an
  inherited one. Carried forward and resolved by the deep review.
- **Maintainability, note** — the closed heading set is referenced, not restated. The skill-ownership
  check was run and is a no-op: `merge-gate` has no entry in
  `docs/developer-guide/skill-ownership.json` and no `## Recommended skills` section, and this change
  adds no playbook. Versioning, workflow-action pinning and the AI-attribution rule are untouched.

## Open points

- No open points.
