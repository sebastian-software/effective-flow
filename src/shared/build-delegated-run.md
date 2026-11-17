# Build execution: one approved Feature plan

This is the phases-2–7 workflow orchestrator, not a named worker. Read this fragment once after the caller's clarified-plan seam; never re-enter the build caller or dispatch another build runner. Execute exactly the request's approved plan and preserve its restrictions. No new independent plan enters this run.

## Recommended skills

- `effective-delivery`

```include
delegation-mandate
```

```include
skill-discovery
```

```include
completion-protocol
```

```include
goal-completion
```

```lazy-include
language-rules
when: an artifact output language needs resolving beyond the concrete values supplied by the caller
```

```lazy-include
project-routing
when: an affected file or domain must be classified into a routing bucket
```

```lazy-include
config-migration
when: a purpose-specific Effective Flow configuration read or legacy migration is due
```

```lazy-include
runtime-state-safety
when: any wisdom, report, memory, or worktree mutation below `.effective-flow/` is imminent
```

```lazy-include
effective-flow-dir-migration
when: any wisdom, report, memory, or worktree mutation below `.effective-flow/` is imminent
```

```include
worktree-record-obligation
```

```lazy-include
plan-archival
when: the delivery point of the handback is reached, or in-place execution archives a plan file
```

```lazy-include
plan-pr-continuation
when: the source is a plan file, hidden mode is off, and either "Shared preconditions" step 2 of `worktree-integration` has resolved the base or "Determine mode" selected in-place without delivery, before any archival
```

```lazy-include
plan-contract
when: plan artifact fields, sections, or review prose are written or translated
```

```lazy-include
plan-numbering
when: a plan file must exceptionally be created
```

```lazy-include
next-steps
when: the run reaches its completion report, or aborts after spawning its first domain sub-agent
```

```lazy-include
worktree-integration
when: the delivery/worktree mode is determined (Phase 2, step 0)
```

```lazy-include
diff-baseline
when: the diff baseline is captured at the end of Phase 2, step 0, or later rendered or discarded
```

```lazy-include
verification-evidence
when: Phase 7 step 5 builds the verification record, before the diff baseline is discarded
```

```include
build-run-contract
```

## Entry and nesting capability

For a delegated run, apply “Helper invocation and failure handling” in `build-run-contract` before referenced reads, the nesting probe or any mutation. Validate the request with `build-run.mjs validate` and require its successful envelope before reading the bound plan/source artifacts and repository instructions; verify their digests, roots, receipt, languages and completion condition. A failed mandatory helper is not unavailable nesting and cannot select the inline fallback. Reject an unexpected invocation, changed approval basis or contradictory checkpoint. The caller's approval covers only the bound plan. Before any project/runtime mutation, start exactly one bounded read-only no-op nested child, await its completed result, and require its explicit success; it reads no project source, writes nothing and starts no children.
<!-- spawn-site:build-delegated-run/nested-spawn-probe -->

A refused/unavailable nesting probe returns `ABORT` with a bounded pre-mutation capability-failure result. The caller can then select the complete inline fallback. An actual failed probe cannot be called successful. The caller binds and supplies the actual opaque agent handle as soon as spawn returns; after the probe, require that validated binding before mutation. A lost agent or transient pilot capability after mutation causes a controlled stop, retained recovery artifacts and explicit pending/unproven pilot finalization; do not reconstruct capabilities or restart implementation.

The inline fallback follows this entire fragment, including every phases-2–7 gate and specialist. It skips only the runner transport and nesting probe, records isolation as unavailable, and applies the normal terminal lifecycle. This is the current inline Quality route while planned-build delegation is unqualified, never an isolation success. Select it before mutation; no failed mandatory helper or post-mutation transport loss authorizes a restart.

For delegated progress, the caller owns the one visible phase overview; send only bounded completed/pending phase projections for it. Await all specialists before yielding a question or terminal result. Full wisdom, diffs, logs and findings remain in their owning artifacts rather than in parent messages.

## Wisdom Accumulation

Insights from earlier phases must be passed on to later phases. Retain required phase/wisdom evidence with `retain-evidence` per `build-run-contract`.

### Session isolation

Create a session ID at the start, for example via timestamp. Use it in:

- `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`

### Protocol

1. After each completed phase, write a summary into this file:

```markdown
## Phase X: [Name]
- **Decision:** [What was decided and why]
- **Problem:** [What was noticed or went wrong]
- **Context:** [What subsequent phases need to know]
```

2. Read the file before each delegated specialist phase and pass its content on as context.
3. Delete the file at the end of the workflow.

### What gets recorded

- architecture and design decisions with rationale
- problems and their resolution
- deviations from the original plan
- wrong assumptions
- technical constraints

## Project routing

Classify every affected file or domain with the canonical “Project routing” contract above. Use
the resulting implementer and reviewer buckets independently; mixed repositories do not have one
global project type. Start cleanly separable buckets in parallel.

Current workflow for review-report backlinks: `{{SKILL:build}}`.

```lazy-include
review-report-backlinks
when: a review-report backlink is written or updated
```

```lazy-include
unresolved-review-report
when: open or unimplemented review findings are offloaded as a report
```

```lazy-include
review-report-format
when: a review report is written or an existing one is augmented
```

### Phase 2: Implementation

0. Read the deferred `worktree-integration` fragment now – a mandatory load before any worktree is
   created – then, per "Delivery and worktree integration", determine the effective delivery/worktree mode and
   its verified execution-location receipt, then run any applicable owned setup. Pass that
   receipt to every worker in phases 2–6 (implementation, docs, tests, validation, review);
   each write-capable boundary revalidates it and roots every operation there.
   For delegated execution, record the already-resolved mode with `authorize-execution` before setup creates/switches artifacts; after actual setup/lifecycle proof, append `transition-execution` before baseline capture or any worker. Use this build-run ID as the owned lifecycle session ID. Follow `build-run-contract`; every subsequent snapshot uses that active receipt. Last, capture the diff baseline per "Diff baseline".

```lazy-include
execution-profiles
when: step 0 is complete and the initial packets are about to be classified, or a Fast fallback is handled
```

```lazy-include
pilot-measurement-workflow
when: step 0 is complete and packets are about to be classified, and at every exit once a pilot record is reserved
```

**Profile seam.** After step 0, every initial packet follows "Initial implementation phase" of the
loaded `execution-profiles` fragment: its per-packet state, preflight, delegation, requirements
check, and Fast→Quality transition, with `build` as the record's `workflow`.

1. Start the appropriate implementer skill with the agreed plan. The Quality selector is the default; the Fast
   reference serves only the first attempted spawn of a packet whose envelope selects `fast`, and `fastAttemptConsumed`
   is set immediately before that call. The tier line below binds each Quality selector, never a Fast reference:
   <!-- spawn-site:build-delegated-run/initial-implementation -->
   - Frontend: `Use the {{AGENT:ui-implementer}} skill for this phase.` Fast: {{AGENT_PROFILE:ui-implementer:fast}}.
   - Backend/CLI: `Use the {{AGENT:nodejs-implementer}} skill for this phase.` Fast: {{AGENT_PROFILE:nodejs-implementer:fast}}.
   - Rust: `Use the {{AGENT:rust-implementer}} skill for this phase.` Fast: {{AGENT_PROFILE:rust-implementer:fast}}.
   - Other clearly identified product code: emit the contract’s reduced-depth notice, then use `Use the {{AGENT:generic-product-implementer}} skill for this phase.` Fast: {{AGENT_PROFILE:generic-product-implementer:fast}}.
   - Tooling/CI/configuration/repository metadata: `Use the {{AGENT:generic-implementer}} skill for this phase.` Fast: {{AGENT_PROFILE:generic-implementer:fast}}.
   - Fullstack: both in parallel or in clearly separated subphases

2. Check for the done protocol when delegating internally, and check the result against the
   requirements.

### Phase 3: Documentation

Render the diff baseline, then run the mandatory documentation sync gate for its path list per "Diff baseline". Assign documentation per
file/domain using the canonical routing contract; preserve the explicit JS/TS and Rust branches and
use repository-native conventions for other product languages rather than inventing a documentation
format.

```include
documentation-sync
```

### Phase 4: Tests

Start in parallel if possible, and assign each writer only new tests and the existing tests the
change affects, never a whole-suite run; outside `Validation: targeted`, Phase 5 step 1 is the
run's one full-suite point:

1. `{{AGENT:test-writer}}` for unit tests and component tests
   <!-- spawn-site:build-delegated-run/unit-tests -->
2. `{{AGENT:e2e-tester}}` for new user flows if a real flow was added
   <!-- spawn-site:build-delegated-run/e2e-tests -->

### Phase 5: Validation

1. Render the diff baseline and hand the path list to `{{AGENT:code-validator}}` per "Diff baseline".
   Under `Validation: targeted` (`caller-owned-commit`) that list is its targeted scope, here and in
   Phase 7's final check, and none of the validation budget below applies: no full run in either
   phase, no (a) or (b), no `Failure attribution:` line, and signature handling stays with the caller.
   <!-- spawn-site:build-delegated-run/validation -->

   If the selected remote environment is the protected native macOS bridge, load the protected-validation
   contract and enforce its previously qualified executor lane, fresh full-candidate proof and same-validator
   admission/request/verified-poll/receipt chain before host completion sealing. Launch qualification
   does not replace this phase’s proof. A remote result is evidence for the ordinary gate; it does not
   grant the gate by itself. The validation budget never narrows that full-candidate proof, here or
   in Phase 7.
   A suite the validator reports as `SKIPPED (environment: <prerequisite id>)` is an environment
   result: for delegated execution record the `validation` gate as provisionally `limited` with that
   id; Phase 7 step 1 decides whether the run continues. A check reported with an environment
   signature, and a validator host-tool timeout, is such a result too: not executed, with its class
   (`wall-clock`, `no-space`, `version-control`, `process-termination`) or `host-timeout` as the id.

   **Validation budget.** This step is the run's one full-suite point. Phase 4's tests, every
   correction round and Phase 7 run targeted; a second full run happens at most once, only in
   Phase 7 under its condition (a) or (b), so the run never exceeds two full runs. Beside the path
   list, hand the validator the line `Failure attribution: base-ci-then-local`, `baselineHead` and
   `baselineTree`, the approved expected-failure lines of the plan's `## Validation plan`
   (`## Validierungsplan`) verbatim,
   and the rule **"on an environment signature, report the check and its diagnostic; no suite
   split, no base comparison, no rerun"** with the four signature classes of
   `environment-signature-classes`, never its preflight mapping. A full run is **valid** when no
   check was cancelled or left unexecuted by an environment signature or a host-tool timeout (a
   `SKIPPED` because no established command exists does not count) and every remaining failure was
   repaired and re-verified, proven `pre-existing`, or matched as approved `expected`. When Phase 5
   ends, keep the budget state `{phase5Tree, validFullRun, reason, secondFullUsed}` in the wisdom
   file and, for delegated execution, retain it with `retain-evidence` as `validation-budget`:
   `phase5Tree` is the `currentTree` of the render that started the full run, `reason` names why the
   run is or is not valid (such as the signature class), and `secondFullUsed` is `false`.

   **Base attribution.** When the validator returns `attribution: pending-base-run`, wait until
   that candidate run has ended; never run the base in parallel with it. Then create the
   `base-validation` worktree with its lifecycle record per `worktree-lifecycle`, and start
   `{{AGENT:code-validator}}` there with `Failure attribution: base-ci-then-local`, a
   `Base attribution run:` line naming only the pending identities, the same signature rule, and the
   reason step 2 ran.
   <!-- spawn-site:build-delegated-run/base-attribution -->

   Merge each returned `pre-existing`, `new` or `unknown` into the original annotation. Before
   `worktree remove`, on every exit path, run
   `git -C <WORKTREE_PATH> restore --source=<CREATION_OID> --staged --worktree -- :/`, then
   `git -C <WORKTREE_PATH> clean -f -d -- <PATH>...` on only the untracked, non-ignored paths the
   validator reported as generated, never `-x`, skipping the clean when it reported none; then
   remove the worktree. The report states why step 2 ran.

```lazy-include
protected-validation
when: the validation decision selects the protected native macOS GitHub Actions bridge
```

```lazy-include
validation-environment-unsupported
when: the validator reports the suite stopped at the project's own environment preflight, or a check reports version control unavailable
```

```lazy-include
validation-environment-continuation
when: the validator reports the suite as `SKIPPED (environment: <prerequisite id>)`
```

2. Give the user the complete list of all errors and warnings found.
3. If errors are found: delegate the repair to the routed Quality implementer. An environment
   result is no error and goes to no implementer. Neither does a failure annotated `pre-existing` or
   approved `expected`: it counts as no failed verification and starts no correction round, and the
   gate's receipt stays `passed` with a `reason` naming the attribution.
4. Fix and re-verify per "Goal-driven completion control": bound the internal correction rounds and escalate to the user if the validator still does not pass afterwards, instead of repeating indefinitely. Render the diff baseline again after every correction round, then a Delta with `sinceTree` the pre-round render's `currentTree`, and re-verify targeted: the previously failing tests by identity plus the affected tests of the Delta, never their suite command, with the non-test checks at repository-native breadth.

### Phase 6: Review

1. Render the diff baseline and hand the path list per "Diff baseline" to every reviewer the canonical routing contract selects, including `{{AGENT:generic-product-reviewer}}` for degraded product buckets. Tooling-only buckets still receive technical validation and do not route to the product fallback. Explicitly instruct each reviewer to deliver **all severities** (Critical + Important + Note), so the later plan-file report serves as a complete audit trail — deviating from the `{{SKILL:review}}` default, which delivers only Critical + Important.
   Retain this render's `currentTree` as `reviewTree`; a `review-depth` floor hit on a tooling or
   CI path goes to `{{AGENT:generic-product-reviewer}}` with its reduced-depth notice, under an
   explicit bounded implementation full-pass assignment from `{{SKILL:build}}`; supply only the
   floor-hit tooling/CI path list and each path's confirmed route.
   <!-- spawn-site:build-delegated-run/review -->

```lazy-include
review-depth
when: Phase 6 aggregates review findings for the incorporation pass, or a step 3 correction or containment is about to be accepted
```

2. Aggregate all review findings, then make exactly one automatic incorporation pass through the
   routed Quality implementer for every new finding that belongs to the authorized slice. Then
   re-run the affected review checks once per `review-depth`. Do not weaken or consume the
   separate validator correction budget.
3. Send the residual batch through the admission contract loaded by “Gated residual
   review-finding reports”. Severity remains review information, not an admission label:
   - `current-scope`: correct or safely contain it now through the routed Quality implementer, then render again and classify that correction or containment against the `review-depth` floor before accepting it; completion stays blocked unless the user or
     authorized plan/tracker owner explicitly reduces the slice
   - `admitted`: eligible for the common residual report path
   - `closed`: report only an aggregate count and short reason in chat
   - `uncertain`: perform the one bounded evidence/containment check and resolve it or stop
4. Assign each finding a local ID in the order of aggregation: `F1`, `F2`, `F3`, ... These IDs apply only within this workflow run and are reused later in the plan file.
5. Present the review results in this format, followed by the `review-depth` floor classification record and re-check report. Additionally aggregate the Complexity counters so Phase 7 can adopt them without deriving them again:

```markdown
**Review results**

Summary:
| Severity | Count | Fixed | Open |
|---|---|---|---|
| Critical | X | X | X |
| Important | X | X | X |
| Note | X | X | X |

| Complexity | Count |
|---|---|
| Low | X |
| Medium | Y |
| High | Z |
```

Note: Before completion, the "Open" column for `current-scope` findings must be 0 regardless of
severity. An admitted Critical residual also requires the existing explicit completion decision.

6. List only admitted residual findings with prompt suggestions for later implementation.
7. Document admitted residual findings in a structured way so they can be carried over into an external review report:
   - local ID (`F1`, `F2`, ...)
   - Title
   - Severity (Critical / Important / Note)
   - Complexity (Low / Medium / High)
   - Area
   - File + line
   - Problem
   - Recommendation
   - Status in the complete report language (English: Fixed / Open / Not implemented; German: Behoben / Offen / Nicht umgesetzt)
   - rationale for non-implementation (incl. ADR reference as slug, if present, e.g. `(ADR: <slug>)`)
   - the complete stable admitted record from “Durable derived-work gate”
8. Never create an ADR in this workflow and do not ask for one either. Gate rejection is terminal,
   not an architecture decision.
9. If after the incorporation pass there remain `admitted` findings with a canonical open or unimplemented status in the complete report language (`Open` / `Not implemented` or `Offen` / `Nicht umgesetzt`):
   - write them into a new file under `.effective-flow/review/` per "Open review-finding reports"
   - record the generated report path for Phase 7
10. If this phase implemented a finding from an existing review-report file in `.effective-flow/review/`:

- add a short implementation note as the last entry directly in the affected finding
- begin the note with `✅` and name at least the date and workflow

### Phase 7: Completion

1. Render the diff baseline and hand the path list to `{{AGENT:code-validator}}` per "Diff baseline" one last time as a final check; repair a failure through the routed Quality implementer.
   <!-- spawn-site:build-delegated-run/final-validation -->

   **Final scope.** Hand the same lines as Phase 5 step 1; its attribution, base-attribution and
   correction-loop rules apply here unchanged. Read the budget state, `validation-budget` merged with
   `validation-budget-second-full` when present: a missing or unreadable one means Phase 5 has no
   valid full run, and an unknown slot counts as used. After a valid Phase 5
   full run, render a Delta with `sinceTree` `phase5Tree` directly after the cumulative render: its
   path list is the targeted test scope, while the non-test checks (format or agent check,
   typecheck, lint, build) run at repository-native breadth; with no affected test the test surface
   reports `SKIPPED (no affected test; full run at Phase 5 tree)`. After a Phase 5 environment
   signature or host-tool timeout, stay targeted over the cumulative path list: the affected tests
   of the whole change plus the non-test checks, no Delta and no full run; any other Phase 5 run
   without a valid full run takes that cumulative scope too unless `full` applies. You, never the
   validator, classify `full`, and only while the second-full slot is unused:
   - (a) Phase 5 has no valid full run because its validator was never reached or the persisted
     budget state is missing;
   - (b) a Delta path is on this closed list, and on nothing else: `.github/workflows/`,
     `.forgejo/workflows/`, `.gitea/workflows/`; `action.yml` or `action.yaml` anywhere; the root
     files of `MANIFEST_FILES` in `conflict-validation-core.mjs` (`package.json`, `Cargo.toml`,
     `go.mod`, `pyproject.toml`, `pytest.ini`, `setup.cfg`, `setup.py`, `tox.ini`, `GNUmakefile`,
     `makefile`, `Makefile`) plus `pnpm-workspace.yaml`; the root lockfiles `pnpm-lock.yaml`,
     `package-lock.json`, `yarn.lock`, `Cargo.lock`, `poetry.lock`, `uv.lock`; `conftest.py`
     anywhere; `*.config.{js,mjs,cjs,ts}`, `tsconfig*.json`, `build.mjs`.

   Before that second full run, record `secondFullUsed: true` in the wisdom file and, for delegated
   execution, retain the updated state with `retain-evidence` as `validation-budget-second-full`;
   only that exclusive creation proves an unknown slot free, and its `COLLISION` means the slot is
   used, so Phase 7 stays targeted rather than stopping on a helper failure. After a repair here, render again and
   re-check targeted over that repair's Delta; `full` follows only while the slot is unused and (a)
   or (b) holds. The `final-validation` receipt `reason` names the targeted scope or the condition
   that applied.

   **Environment lane.** When this final validation reports the suite as
   `SKIPPED (environment: <prerequisite id>)`, reports a check with an environment signature or a
   host-tool timeout, or follows a Phase 5 one on the cumulative path, record `final-validation` as
   `limited` with that prerequisite id and decide here, before `prepare-completion` and the
   handback commit. The lane is the explicit run override, else `delivery.completion`: `pr`, or
   continuing an existing plan pull request, continues; `merge`, `branch`, an unset row (default
   `merge`) and in-place without delivery stop; a `null` or invalid row is asked now, in a delegated
   run through `question` with origin `delivery-choice`, and the answer is recorded in the
   "Determine mode" slot of `worktree-integration`, so handback step 3 does not ask again. A
   non-interactive run that cannot be answered counts as no-PR. Under an Automation caller's
   scored decision mode the recorded explicit `pr` continues (row S-DCH of `scored-decisions`). For delegated execution record the
   lane with `record-lane` after the `final-validation` gate's `limited` receipt, and ask any lane
   question only from a checkpoint holding that receipt. `record-lane` binds a source quote only to
   a stopping lane, so an explicit `pr` override that configuration does not name is confirmed
   through that `delivery-choice` question. The stop is a terminal
   `ABORT` naming the prerequisite id: keep and report the owned worktree and branch, finalize the
   pilot record with `completionStatus: aborted`, and recover through a fresh run once the
   prerequisite holds. Under `Commit: caller-owned` decide nothing: return `DONE` with the
   limitation and let the caller decide. Under protected validation this decision does not apply.

2. For delegated execution first record the existing passed (or PR-lane `limited`) review/final-validation receipts and `prepare-completion`. Document completion by preserving the approved plan text and appending `## Build completion` (`## Workflow-Abschluss` for German), without changing the status marker beforehand:
   - if Phase 1 created a new plan file via `{{SKILL:plan}}`: update that file.
   - if the user referenced an unbuilt plan file: update the referenced file.
   - if, exceptionally, no plan file exists: create `<plan.dir>/` and assign the date-slug name per `Plan file convention`.
   - the status marker stays unchanged here (`**Planungsstatus:** Nicht umgesetzt` or `**Plan status:** Not implemented`): the status switch to `Umgesetzt`/`Implemented` and the archiving to `<plan.dir>/archive/` are handled by step 6 below at the delivery point per "Delivery and worktree integration" (exception: in-place without delivery, see there).
   - Content:
     - requirement
     - architecture decisions
     - affected files
     - implementation details
     - test results
     - review result and reference to external review reports if open findings were offloaded
3. **Plan-file findings summary:** Write only a compact summary in the plan file. Open or unimplemented findings are not copied in full into the plan file, but written into the external review report from Phase 6.

   Use the complete plan language. The English form is shown below; for a German plan render
   `## Review-Befunde`, `**Datum:**`, `**Reviewer:**`, `### Zusammenfassung`, localized table
   headings and status values (`Behoben`, `Offen / Nicht umgesetzt`), `**Externer
Review-Bericht:**`, and the German no-findings sentence. Stable paths and IDs remain unchanged.

   English template:

```markdown
## Review findings

**Date:** YYYY-MM-DD
**Reviewer:** [all routed reviewers / none]

### Summary

| Status | Count |
|---|---:|
| Fixed | X |
| Open / Not implemented | Y |

**External review report:** `<generated report path>` <!-- only output if open findings were offloaded -->

No findings found. <!-- only output if no findings arose -->
```

Rules for the findings report:

- Do not copy open or unimplemented findings in full into the plan file.
- If open or unimplemented findings exist, name the external review report from Phase 6.
- Fixed findings may be counted briefly; full details of fixed findings are not required in the plan file.
- If no findings arose: write `Keine Befunde.` for a German plan or `No findings found.` for an
  English plan instead of the tables.
- If no reviewers were started in Phase 6 (e.g. because the change required no review): write a short note with justification in the section instead.

4. Delete the wisdom file after persisting the bounded required gate evidence per `build-run-contract`.
5. Render the diff baseline and, if a formatter is configured, hand the path list to it per "Diff baseline". For delegated execution retain the exact before/after path digests. For delegated execution only, if product bytes changed, use `{{AGENT:code-validator}}` for the bounded independent formatting-only check required by `build-run-contract`, passing just those changed paths and the retained basis; its judgment must name each exact digest and its actual independent handle. If this reveals a semantic correction, use the existing affected review/validation path and fresh receipts instead of preserving an old pass. Pure plan completion needs only the deterministic preservation proof. When step 6 will run a handback, build the verification record per `verification-evidence` from the step 1 render and only the checks this run observed; a step 1 repair without a fresh render before the passing validator run builds none. Then discard the diff baseline.
   <!-- spawn-site:build-delegated-run/completion-transform-check -->
6. If delivery or worktree execution was active: perform the handback per "Delivery and worktree integration" (plan status switch to `Umgesetzt`/`Implemented` and archive move to `<plan.dir>/archive/` at the delivery point, commit the changes, ownership-safe worktree cleanup if applicable, completion action `pr`/`merge`/`branch`, defer the checkout). Hand only the **admitted residual** Phase-6 finding set to that handback — never `current-scope`, `closed`, or unresolved `uncertain` candidates — so an automatic PR review publishes the already-gated set instead of reviewing the pull request a second time. If the workflow exceptionally runs in-place without delivery, perform the same status switch and archive move directly in the working tree.
   Under `Commit: caller-owned` (`caller-owned-commit`) no commit, completion action or worktree withdrawal of this step runs, no plan is switched or archived (a plan this run wrote stays untracked and is reported), and neither do the `build-run-contract` calls `seal-delivery` and `handoff` below. For delegated execution, at that existing handback's reconciled staged-tree boundary call `seal-delivery`; immediately after its verified commit and before worktree withdrawal call `handoff`. Hidden/private and in-place-without-delivery follow their bound variants. After handoff relay later delivery/publication questions through runtime-only checkpoints; preserve the original ordering and publication gates. Record an actual in-place checkout restore with `record-return`, never infer it from a branch name.
7. Run the worktree-record exit self-check.
8. If Phase 2 reserved a pilot record, finalize it exactly once per the loaded `pilot-measurement-workflow` fragment, including its incident and finalization-failure paths.
9. Summarize what was implemented, tested and documented; describe the state the full suite covered
   (Phase 5, before later corrections), never a snapshot tree id, that later changes were verified
   targeted, and every attribution and approved expected failure
   invoked, and never say "fully verified" while a gap exists; for an active delivery/worktree mode, additionally name the delivery branch, the final checkout state and the result of the completion action (PR URL, merge or retained branch); name the report path Phase 6 step 9 recorded, also after a merge; state the worktree-record exit self-check result.
10. Prepare the next-step block per `next-steps`. For inline execution emit it last; for delegated execution persist the terminal/continuation evidence per `build-run-contract` and return only the bounded result reference so the caller can render the conclusion and next step. A delegated execution's `ABORT` emits nothing; the caller alone applies the retrospective slot.

## Rules

```include
pre-commit-gate
```

```lazy-include
commit-message-rules
when: a commit message or Conventional Commit title is written
```

- Always start independent specialist phases in parallel when they are truly independent
- Give the user a short status update after each phase
- If a phase reports errors, fix them before continuing
- Every correction after the initial implementation phase – requirements, validator, review, final-validator, conflict-resolution, retry, and bounded completion corrections – is Quality-only through the routed Quality implementer
- Skip optional steps only with a short justification; the documentation sync gate is not one of them
- Give internal sub-agents the instruction:
  - first summarize the task in 2-3 sentences
  - end with `DONE` or `ABORT: [reason]`
- Write a wisdom summary after each completed phase
- Pass the accumulated insights from the wisdom file to each delegated phase
