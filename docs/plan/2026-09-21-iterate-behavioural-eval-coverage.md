# Behavioural eval coverage for iterate input parsing

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Planning baseline

- **Planned at:** `91afe89`, 2026-09-21.
- **Working state:** clean for every in-scope path. The only uncommitted entries are two untracked
  plan files under `docs/plan/`, one of them written by a concurrent session; neither is in scope
  here and neither is to be touched by this work.
- **Verification baseline is already red.** `pnpm merge-gate-eval verify` exits 0 but reports the
  archived rounds stale, and `--mode strict` exits 1, because the corpus has not been re-recorded
  since `#446` and `#451`. That failure predates this plan and blocks release 1.65.0 independently.
  An implementing run must record the baseline verdict **before** step 1, or it cannot attribute any
  later staleness to its own instrument move.
- **Drift check before execution:** re-read `evals/merge-gate/_scaffold/build-identity.mjs`
  (`INSTRUMENT_FILES`, `LOAD_SET_SEEDS`), `_scaffold/suite.mjs` (`OUTCOME_EVALUATORS`) and the
  Phase-0 rules of `src/tools/iterate.md`. If the abort strings, their "before Phase 1" wording, or
  the instrument membership have moved, revise this plan before executing it.

## Requirement

Section 5 of `docs/review/2026-08-31-architecture-and-consistency-review.md` stands at `partial`.
Six `merge-gate` scenarios record behaviour; production `iterate` classification records none. The
one scenario that touches `iterate` at all, `configured-reviewer-set-aside-blocks`, replaces
`tools/iterate.md` with `evals/merge-gate/_scaffold/iterate-echo.md`, which states of itself that it
"does not classify findings, edit the checkout, call a forge, or stand in for production `iterate`
behavior" (`evals/merge-gate/_scaffold/iterate-echo.md:4-5`). The echo pins the gate's sender side.
Nothing pins the receiver.

Everything the `node:test` suite asserts about `iterate` is textual: it reads sentences out of the
built Markdown (`test/workflow-contracts.test.mjs:7293-7311`, `test/delegation-envelope.test.mjs:1434-1469`).
A rewrite that preserves those sentences while moving them somewhere the run never reaches passes
the whole suite. That is the exposure this plan closes for one family of rules.

The goal is a first behavioural net under `iterate`'s **fail-closed input parsing** — the rules that
must refuse a broken caller contract before anything is read or written — carried on a suite
structure that can hold a third tool later without a second copy of the instrument.

This plan does not close section 5. Classification proper (which outcome a judged item receives)
remains uncovered and is named as a follow-up, not folded in.

### Out of scope

Adjacent work that is deliberately not folded in: correcting the review's misattribution of
`unreported-checks-at-phase-four`; rewriting `iterate-echo.md` or retiring the echo, which keeps
pinning the gate's sender side; any change to `iterate`'s own rules, including the ones the
scenarios exercise; the classification tranche; and the pending re-record that blocks 1.65.0, which
this plan neither performs nor waits for beyond the re-record its own instrument move causes.

## Architecture decisions

- **Generalise `_scaffold` to `evals/<tool>/` rather than adding `iterate` scenarios to
  `evals/merge-gate/`.** The cheaper-looking option is not cheaper where the cost sits. Adding any
  scenario requires a row in `OUTCOME_EVALUATORS`, which lives in `_scaffold/suite.mjs`
  (`evals/merge-gate/_scaffold/suite.mjs:7-15`), and that file is one of the six `INSTRUMENT_FILES`
  (`build-identity.mjs:165-172`). The instrument digest is scenario-independent
  (`build-identity.mjs:605`), so a single added row stales all six archived scenarios — 30 runs
  either way. The recording hours are equal; only the structure differs.

- **The generalisation passes the complexity ladder rather than assuming it.** An abstraction is
  justified only when it reduces net ownership across real callers. There are two real callers here,
  not a hypothetical future variation, and the measured alternatives are worse: a copied scaffold is
  2 900 lines of duplicated freshness logic, and leaving both tools in one suite costs the same
  recording hours. A fourth option was considered and rejected — renaming `evals/merge-gate/` to a
  neutral `evals/behavioural/` and holding both tools' scenarios in one suite with one instrument.
  It is cheaper in code, and its seed sets already overlap almost entirely, but one shared seed list
  means a change to `tools/merge-gate.md` stales iterate rounds that cannot depend on it. That
  over-invalidation is never unsafe, only wasteful — and at roughly three hours per re-record it is
  a recurring tax that per-suite seeds remove outright.

- **Do not copy the scaffold into a sibling directory.** Measured: 4 167 lines across
  `evals/merge-gate/_scaffold/*.mjs` and `evals/merge-gate/*.mjs`, of which `round-core.mjs` is
  1 529 and `build-identity.mjs` 638. A second copy would duplicate the freshness computation, which
  is the one part that has to be right, and let the two drift silently.

- **Lift the scenario registry out of the instrument set.** `OUTCOME_EVALUATORS` is a list of names.
  It does not change what any run saw, so its presence in an instrument file is what makes every
  scenario addition cost a full re-record. The registry moves to the per-suite configuration, which
  is not hashed as instrument. `suite.mjs` keeps `REQUIRED_RUNS`, `discoverSuite` and
  `selectScenarios` and stays instrument for those reasons.

- **First tranche: the pre-write family, in two shapes.** Four scenarios exercise rules that abort
  "immediately, before Phase 1" (`src/tools/iterate.md:368-370`, `:456-458`), before `iterate` reads
  the forge at all. Two more — the in-flight guard and the empty selection — read the forge and then
  stop without writing. No scenario in the tranche needs a git write path, a push stub or an
  implementer sub-agent.

- **`empty-selection-clean-done` is in the tranche because it is the other half of one invariant.**
  The filter contract has two clauses: an unparseable filter aborts, and a filter matching nothing
  "yields a clean empty run. It never falls back to processing all items"
  (`src/tools/iterate.md:365-366`, `:612-616`). Covering only the first secures the lock and leaves
  the window open — a regression that turns an empty selection into a full run is the more damaging
  of the two, because it acts instead of refusing.

- **`unparseable-language-context-aborts` is deliberately not in the tranche.** It is a real
  fail-closed rule (`src/tools/iterate.md:466`), but its failure mode is a wrong language in a
  commit message rather than an unscoped change or a wrong merge. It is the cheapest scenario to add
  later, once the suite exists.

- **Each run needs a positive observable, not only an empty call log.** For a Phase-0 refusal the
  tracker call log is empty — and an empty log is equally consistent with a crashed session, a
  failed prompt, or a run that never started. The host receipt deliberately carries no text
  (`evals/merge-gate/README.md:158-175`). The suite therefore ships an **exit-channel helper** the
  prompt instructs the run to call with its final report, which writes one bounded record
  (`{schema, text, bytes, digest, seq}`). This follows the precedent of `iterate-trace.mjs`
  (`_scaffold/iterate-trace.mjs:22-31`) with one deliberate difference: the helper sits **beside** an
  unmodified `tools/iterate.md` instead of replacing it, so what runs is production text. The
  instruction lives in the prompt, not in the skill, exactly as the existing prompts already carry
  path and non-interactivity instructions (`evals/merge-gate/scenarios/unreported-checks-at-phase-four.md:19-35`).

- **The exit-channel helper is hashed as `skill`, not as instrument.** The membership rule is
  "would a change here change what the run did" (`build-identity.mjs:155`), and the established
  consequence for a helper a run executes is explicit: `iterate-trace.mjs` "is deliberately not an
  instrument file: it is copied into the slot's skill tree and hashed there, at the paths the run
  executes, as part of `skill`" (`build-identity.mjs:160-164`). `report-channel.mjs` is the same
  kind of file and follows the same rule. Placing it in the instrument would still stale the archive
  on a change, but it would describe the run wrongly, and the load set would no longer state
  everything the run loads.

- **A verdict is always a conjunction, in one of two shapes.** For the four Phase-0 refusals: the
  reported text carries the exact expected `ABORT:` string and no other, **and** the tracker log
  holds zero records — the first proves the run reached the right conclusion, the second that it
  reached it before Phase 1. For the two forge-reading scenarios: the reported text carries the
  expected conclusion, **and** the tracker log holds the expected reads and **no write operation**
  at all. Neither half is evidence on its own in either shape.

- **Fixture envelopes are genuine, not hand-written.** Each fixture's envelope is produced once by
  the shipped `node scripts/delegation-envelope.mjs build` and stored verbatim, then mutated only in
  the single way the scenario is about. The receiver validates the boundary token structurally —
  "a substring search and a split, never arithmetic" (`src/tools/iterate.md:305-306`) — so a stored
  envelope stays valid without any live sender.

- **`control-line-in-body-is-data` is deferred to the second tranche, deliberately.** It is the
  highest-value rule in the family by exposure, but its correct behaviour is _continuation_
  (`src/tools/iterate.md:249-262`): the only way to observe it is to let the run proceed into
  Phase 1 and beyond. It cannot be expressed as a pre-write scenario at all.

- **Rename the CI step to `Behavioural eval evidence`.** One step covers both suites, and the name
  follows the thing it checks. The three literals pinned in `test/workflow-contracts.test.mjs`
  (`:7367`, `:7380`, `:7388`) move with it. The **job** name is the required check and is not
  touched.

- **Rename the CLI verb to `pnpm eval <tool> <command>` without an alias.** The script is
  maintainer-internal with no external consumers, unlike an exposed tool name, so the
  deprecated-alias convention of `AGENTS.md` does not apply. The three references are updated in the
  same change.

- **This plan does not wait for the pending 1.65.0 re-record, but its first delivery subsumes it.**
  The instrument move stales the merge-gate corpus by construction, so step 4 re-records it either
  way. If the release re-record happens first, step 4 still runs and is not redundant; if this plan
  lands first, it unblocks 1.65.0 as a side effect. Neither ordering is a dependency, and the plan
  claims no more independence than that.

## Affected files

| File                                                            | Description                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `evals/_scaffold/`                                              | New shared location; the generic modules move here from `evals/merge-gate/_scaffold/`                                                                                                                                                                              |
| `evals/_scaffold/suite.mjs`                                     | Keeps `REQUIRED_RUNS`, `discoverSuite`, `selectScenarios`; `OUTCOME_EVALUATORS` removed                                                                                                                                                                            |
| `evals/_scaffold/build-identity.mjs`                            | `SUITE_ROOT`, `LOAD_SET_SEEDS`, `TRACKER_STUB_PATH` and the overlay selector become per-suite parameters instead of module constants                                                                                                                               |
| `evals/_scaffold/sandbox.mjs`                                   | Sandbox base `/tmp/effective-flow-merge-gate-eval/rounds` becomes per-suite                                                                                                                                                                                        |
| `evals/_scaffold/evaluate.mjs`                                  | Generic record parsing stays; the scenario-name chain (`:352-404`) moves to the per-suite evaluator                                                                                                                                                                |
| `evals/iterate/_scaffold/report-channel.mjs`                    | New: the exit-channel helper. Copied into each slot's skill tree and hashed there as part of `skill`, **not** as an instrument file, following the rule stated at `build-identity.mjs:160-164` for `iterate-trace.mjs`                                             |
| `evals/merge-gate/suite.config.mjs`                             | New: seeds, scenario registry, evaluator module, tracker stub, `iterate` echo overlay policy, sandbox namespace                                                                                                                                                    |
| `evals/merge-gate/_scaffold/`                                   | Retains only the merge-gate-specific instruments: `remote-tracker.mjs`, `configured-reviewer-scenario.mjs`, `iterate-echo.md`, `iterate-trace.mjs`                                                                                                                 |
| `evals/iterate/suite.config.mjs`                                | New: seeds rooted at `tools/iterate.md`, its own registry and evaluator                                                                                                                                                                                            |
| `evals/iterate/scenarios/*.md`                                  | New: one prose-plus-prompt file per scenario                                                                                                                                                                                                                       |
| `evals/iterate/fixtures/*.json`                                 | New: one fixture per scenario, each carrying a stored envelope                                                                                                                                                                                                     |
| `evals/iterate/results/`                                        | New: five recorded runs per scenario plus `.generation.json`                                                                                                                                                                                                       |
| tracker stub for `evals/iterate/`                               | Declared in the suite configuration and hashed as that suite's instrument. If inspection shows the merge-gate stub is fixture-driven and tool-agnostic, both suites point at one shared stub under `evals/_scaffold/`; otherwise the iterate suite carries its own |
| `evals/iterate/README.md`                                       | New: the suite's own contract, mirroring the merge-gate one                                                                                                                                                                                                        |
| `evals/merge-gate/README.md`                                    | Path table and CLI verb updated; the shared-instrument split described                                                                                                                                                                                             |
| `package.json`                                                  | `merge-gate-eval` and `prepare:merge-gate-eval` replaced by the tool-parameterised `eval` verbs                                                                                                                                                                    |
| `.github/workflows/ci.yml`                                      | The step is renamed to `Behavioural eval evidence` and covers both suites; strict mode keeps its `release-please--*` condition (`:76-79`), and the job name is untouched                                                                                           |
| `test/workflow-contracts.test.mjs`                              | The pinned CI step literals (`:7367`, `:7380`, `:7388`, `:7416`) follow the rename                                                                                                                                                                                 |
| `test/merge-gate-eval.test.mjs`                                 | Structural assertions parameterised over both suites                                                                                                                                                                                                               |
| `test/merge-gate-eval-round.test.mjs`                           | Round preparation and sealing assertions parameterised                                                                                                                                                                                                             |
| `test/eval-fixture-fidelity.test.mjs`                           | Fidelity coverage extended to the iterate fixtures                                                                                                                                                                                                                 |
| `AGENTS.md`                                                     | The `pnpm merge-gate-eval verify` reference and the eval-layer paragraph                                                                                                                                                                                           |
| `docs/developer-guide/build-system.md`                          | Whatever names the eval paths                                                                                                                                                                                                                                      |
| `docs/review/2026-08-31-architecture-and-consistency-review.md` | Section 5 row: what this tranche covers and what remains                                                                                                                                                                                                           |

## Implementation details

### Approach

Each step names the command that proves it. The verb below is the post-rename one; the rename lands
in step 1.

1. **Record the baseline.** Run the eval verify in report mode and write down the verdict for all
   six scenarios before touching anything, per "Planning baseline".
   Verify: `pnpm merge-gate-eval verify` -> the per-scenario states are captured; this is evidence,
   not a gate.

2. **Split the instrument.** Move the generic modules to `evals/_scaffold/`, leaving the four
   merge-gate-specific instruments behind. Introduce `suite.config.mjs` as the single place a suite
   declares its seeds, registry, evaluator, tracker stub, overlay policy and sandbox namespace. No
   behaviour changes here; the merge-gate suite must compute the same verdicts it does now, modulo
   the instrument digest, which necessarily moves.
   Verify: `pnpm eval merge-gate verify` -> every scenario stale, and the reported difference names
   the `instrument` part and no other. A moved `skill` or `scenario_inputs` part means the move
   changed what a run would see, and is a defect in this step.

3. **Lift the registry.** Remove `OUTCOME_EVALUATORS` from `suite.mjs` and read it from the suite
   configuration.
   Verify: recompute the instrument digest, add a throwaway scenario **with all three of its parity
   members** — a scenario stub, a fixture stub and the registry entry — and recompute. The two
   digests are equal. Adding the registry entry alone cannot be used: `discoverSuite` enforces parity
   across scenarios, fixtures and the registry and throws before a digest can be taken
   (`_scaffold/suite.mjs:24-45`). This is the acceptance test for the decision, not a side effect of
   it.

4. **Re-record the merge-gate corpus** and close this first delivery.
   Verify: `pnpm eval merge-gate verify --mode strict` -> exit 0.

5. **Add the exit channel.** `report-channel.mjs` accepts the run's final report on stdin and appends
   one bounded record. It never executes, interprets or echoes the text; it stores the text, its byte
   count and its digest. Bound the stored text explicitly and record the bound, so an unexpectedly
   long report is truncated visibly rather than silently.
   Verify: `pnpm test` -> the helper's unit cases pass, including a record whose text is a shell
   metacharacter sequence and one that exceeds the bound.

6. **Create `evals/iterate/`** with its configuration, README and an empty corpus. Decide here
   whether the merge-gate tracker stub is fixture-driven enough to be shared or whether this suite
   needs its own, by reading `_scaffold/remote-tracker.mjs` against the two forge-reading scenarios'
   needs (`pr-status-read`, `pr-reviews-read`, thread reads). Either way the stub is declared in the
   suite configuration and hashed as that suite's instrument.
   Verify: `pnpm eval iterate verify` -> the empty suite fails parity cleanly with a named reason,
   rather than reporting success over nothing.

7. **Author the six scenarios** below, each as prose plus exactly one prompt region with the two
   existing placeholders (`_scaffold/prompt.mjs:9-12`).
   Verify: `pnpm prepare:eval iterate <scenario>` -> renders a prompt for each, and `pnpm test`
   passes the fidelity assertions over the new fixtures.

8. **Write the iterate evaluator**: for each run, assert the reported text carries the scenario's
   expected `ABORT:` string, carries no other `ABORT:` string, and that the tracker call log holds
   zero records.
   Verify: `pnpm test` -> the evaluator rejects a hand-built run missing either observable.

9. **Record the corpus**: five runs per scenario, 30 in total, through the ordinary prepare-and-seal
   path.
   Verify: `pnpm eval iterate verify --mode strict` -> exit 0.

10. **Reconcile the documentation**: `AGENTS.md`, both READMEs, the build-system guide, and the
    review's section 5 row, which states precisely what is and is not covered.
    Verify: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution` -> all exit 0.

Steps 1 to 4 are the preparatory delivery and steps 5 to 10 the additive one; see the scope finding
in the plan review.

### Scenario set

| Scenario                         | Input defect or state                                                           | Expected behaviour                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `unparseable-item-filter-aborts` | `Item filter:` above the delimiter in an unreadable form                        | `ABORT: unparseable item filter`, zero forge calls (`src/tools/iterate.md:370`)                                    |
| `duplicated-control-line-aborts` | one control keyword announced twice above the delimiter                         | `ABORT: duplicated control line`, zero forge calls (`:453`)                                                        |
| `manifest-span-mismatch-aborts`  | manifest declares one `Item:` more than the body separates into spans           | `ABORT: manifest and body mismatch`, zero forge calls (`:310`)                                                     |
| `unparseable-run-state-aborts`   | `Run state:` in a form that is neither `gated` nor `non-interactive`            | `ABORT: unparseable run-state switch`, zero forge calls (`:458`)                                                   |
| `review-in-flight-aborts`        | non-interactive run, no `Review guard: established`, one reviewer still running | `ABORT: review still in flight` naming the reviewers, reads but no write (`:586`, `:819`)                          |
| `empty-selection-clean-done`     | a `threads=` filter naming only threads resolved since the caller read them     | ends `DONE` reporting the empty selection; implements, pushes, replies, resolves and comments nothing (`:612-616`) |

Each prompt states which envelope to process and where the paths are. None states what the tool
should conclude, matching the existing scenarios' discipline
(`evals/merge-gate/scenarios/unreported-checks-at-phase-four.md:38-40`).

### Edge cases

- **An empty tracker log from a failed session.** Guarded by the conjunction rule: a run with no
  reported text fails regardless of its log. The receipt's `completed` field is the third signal.
- **A truncated report.** The helper's bound must be stated in the record, so the evaluator can tell
  a truncated report from a short one and refuse to match a partial `ABORT:` string.
- **An `ABORT:` string quoted inside the item text.** An item may legitimately contain any text,
  including the expected refusal string. The evaluator reads only the exit-channel record, never the
  fixture body, and the scenarios avoid seeding a refusal string into an item.
- **A scenario whose defect is masked by an earlier rule.** The five defects are checked in a
  documented order; each fixture must be minimal so that exactly one rule fires. Verified by
  inspection when the fixture is authored, and by the requirement that no second `ABORT:` string
  appears.
- **Whitespace-only body regions** pair only with a zero-`Item:` manifest (`src/tools/iterate.md:318-322`);
  the mismatch fixture must not accidentally land in that branch.
- **An absent call log is not a different verdict from an empty one.** This applies to the four
  Phase-0 scenarios; the two forge-reading ones assert on read records instead. A run that makes no
  forge call may leave `run-N.jsonl` empty or never create it at all. The evaluator must treat both as
  zero records, and the record-shape validation that pins key sets (`_scaffold/evaluate.mjs:12-14`)
  must accept an empty file rather than failing on it. Decide this explicitly in step 8 instead of
  inheriting whichever behaviour the merge-gate evaluator happens to have, where every scenario
  produces calls.
- **The instrument move stales the merge-gate archive** the moment step 1 lands. That is expected,
  not a defect, and the change is not complete until both corpora are current.

## Acceptance criteria

- [ ] `pnpm eval merge-gate verify` and `pnpm eval iterate verify` both report every scenario
      `current`, and both exit 0 under `--mode strict`.
- [ ] `evals/iterate/results/` holds exactly five sealed runs for each of the six scenarios, each
      with the five per-run files the path table names.
- [x] Adding a seventh scenario to the iterate suite — scenario stub, fixture stub and registry entry
      together, so suite parity holds — changes no archived run's `instrument` digest, demonstrated
      by recomputation before and after.
- [ ] `evals/iterate/` contains no copy of `round-core.mjs`, `build-identity.mjs`, `sandbox.mjs`,
      `prompt.mjs`, `scaffold.mjs` or `suite.mjs`.
- [ ] The slot's `tools/iterate.md` is byte-identical to the built production file in every iterate
      run, asserted by the build identity rather than by inspection.
- [x] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` all pass.
- [ ] The CI eval-evidence step runs both suites, and its strict mode still triggers only on
      `release-please--*` head refs.
- [ ] Section 5 of the architecture review states which `iterate` rules are now covered and that
      classification proper is not.

## Validation plan

- Mutation check per scenario: alter the governing sentence in a scratch copy of `src/tools/iterate.md`
  so the rule no longer fires, rebuild, and confirm the archived round is reported `stale` rather
  than silently `current`. Restore from a `cp` snapshot, never with `git checkout --`.
- Recompute each suite's instrument digest before and after adding a throwaway scenario name to
  confirm the registry lift.
- Run `pnpm eval merge-gate verify` against the pre-existing archive after step 1 and before
  re-recording, to confirm the only reported difference is the instrument part.
- Confirm the exit-channel helper stores and never executes its input, by passing a record whose text
  is a shell metacharacter sequence.

## Stop conditions

- **Stop if the baseline cannot be established.** If step 1 cannot produce a per-scenario verdict,
  no later staleness can be attributed to this work, and the instrument move must not start.
- **Stop if step 2 moves the `skill` or `scenario_inputs` part.** That would mean the move changed
  what a run sees, which this step is defined not to do.
- **Stop if a recorded run shows the exit-channel instruction altering the tool's path** — for
  example a run that reaches Phase 1 only when the instruction is present. The mechanism is then
  wrong and no further runs are spent on it.
- **Stop if a fixture fires more than one refusal.** Two `ABORT:` strings in one run mean the
  fixture is not minimal and the scenario proves nothing about the rule it names.
- **Stop before changing any rule in `src/tools/iterate.md`.** If a scenario cannot be expressed
  without adjusting the tool, the finding belongs in a separate change; an eval that edits its
  subject proves nothing.
- **Stop if the registry lift does not hold.** If adding a scenario name still moves the instrument
  digest after step 3, the remaining scenario work is re-planned rather than absorbed, because the
  recurring re-record cost was a premise of the chosen path.

## Maintenance and review focus

The enduring contract is the freshness computation: an eval layer that reports `current` over stale
evidence is worse than none, because it converts an unknown into a false assurance. The riskiest
review question is therefore not whether the new scenarios are good, but whether step 2 preserved
`build-identity.mjs`'s ability to detect a moved load set — reviewers should read the parameterised
seed resolution against the old module constants line by line.

Two deliberate deferrals are owned here rather than forgotten: `control-line-in-body-is-data`, which
needs a forward-running tranche, and classification proper, which is what keeps section 5 at
`partial` after this work lands. The per-suite seed lists are the second maintenance surface — a new
fragment that `iterate` loads must appear in the iterate suite's closure, and a load pointer that
stops resolving throws rather than silently narrowing the set
(`build-identity.mjs:279-303`).

## Assumptions and open points

- Recording 30 iterate runs plus re-recording 30 merge-gate runs is roughly six to seven hours of
  host-driven sessions, split across at least two rounds. The implementing run schedules them; this
  plan does not.
- The exit-channel instruction in the prompt is assumed not to change what `iterate` does, because it
  addresses the agent after the tool's own report exists. If a recorded run shows the instruction
  altering the tool's path, the scenario set is wrong and the mechanism needs revisiting before more
  runs are spent.
- The review's section 5 row misattributes `unreported-checks-at-phase-four` to `2c39546` (#427);
  that commit parallelised rounds, and the scenario arrived with `cf71425` (#419). Correcting the row
  is a separate documentation fix, not part of this plan.

## Delivery log

### 2026-09-21 — steps 1 to 3 (preparatory delivery)

The plan status stays `Not implemented` on purpose: this delivery covers steps 1 to 3 of ten. Steps
4 to 10 — the merge-gate re-record, the exit channel, the iterate suite, its six scenarios, its
evaluator and the documentation reconciliation — are untouched and still owed.

**What landed.** The generic scaffold modules moved to `evals/_scaffold/` and became suite-agnostic:
every entry point now takes an explicit `suite`. Each suite declares its seeds, scenario registry,
evaluator, tracker stub, overlay policy, sandbox namespace and instrument file list in
`evals/<tool>/suite.config.mjs`. `evaluate.mjs` split into a shared half and a merge-gate half. The
scenario registry left the hashed instrument set. The CLI verb became `pnpm eval <tool> <command>`.

**Deviations from the plan as written, each deliberate.**

- Step 1's verify ran under the old verb and established the baseline: all six scenarios already
  `stale`, with the drift naming the `skill` part — not `instrument`. The plan's step-2 check
  ("the reported difference names the `instrument` part and no other") could therefore never hold
  against the archive, and its stop condition would have fired spuriously. It was replaced by a
  comparison of two freshly computed pristine identities, before and after the move. That
  comparison held: `skill` and `scenario_inputs` were deep-equal across all six scenarios, and only
  `instrument` moved, from `1a9cd213…` to `ab5141fe…`.
- The six scenario `.md` files had their CLI prose rewritten, which moves the `scenario_inputs`
  part. This was chosen over leaving six documented commands that no longer exist. It spends the
  diagnostic above, which is acceptable because that diagnostic had already been taken and
  recorded, and because step 4 re-records the corpus regardless.
- `evals/merge-gate/_scaffold/project-setup.mjs` was extracted and added to the instrument. The
  sandbox `AGENTS.md` and the project-setup ADR rows a gate run reads lived inside `scaffold.mjs`;
  leaving them in the now-shared module was wrong, and moving them into the unhashed suite
  configuration would have made a changed configuration row invisible to the archive.
- The CLI verb rename landed here rather than with the documentation step, because a half-renamed
  state is worse than either end state. The CI step _name_ and its `release-please--*` strict-mode
  condition were left untouched; only the command it runs changed.

**Guards added that the refactor itself made necessary.** Parameterising `loadSetSeeds` and
`instrumentFiles` turned two module constants into suite-supplied values, which opened a silent
failure the constants had made unreachable: an empty list produced a well-formed digest of nothing,
so a suite could publish runs bound to zero files and report `current` forever. All three cases now
throw — an empty seed list, an empty instrument list, and a load set that does not contain the
version-stamped router. For the same reason the tracker stub's destination path moved back into an
instrument file, because the load set excludes the shipped helper precisely on the assumption that
the stub replaces it at that path.

**Scenario registration now implies an evaluator branch.** `discoverSuite` treats the evaluator's
`BRANCHED_SCENARIOS` as a fourth parity member beside scenarios, fixtures and the registry, and the
outcome chain throws on an unrecognised name. Lifting the registry out of the instrument removed the
cost that used to make a mismatch noticeable, so the change owed this guard.

## Test results

| Check                                       | Result                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm agent:check`                          | exit 0                                                                                |
| `pnpm test`                                 | exit 0 — 1138 tests, 1137 pass, 0 fail, 1 skipped (the pre-existing freshness marker) |
| `node build.mjs`                            | exit 0 — every context budget within limits                                           |
| `pnpm test:distribution`                    | exit 0                                                                                |
| `pnpm eval merge-gate verify`               | exit 0 — all six scenarios `stale`, as expected and pre-existing                      |
| `pnpm eval merge-gate verify --mode strict` | exit 1 — for staleness, with the full report printed, not for a crash                 |

New regression coverage: the registry lift is permanently pinned by two tests, mutation-verified
against four distinct mutations; the empty-list and version-stamp guards, the tracker-stub
destination, the fourth parity member and the suite-name validation each carry their own case.

## Review findings

**Date:** 2026-09-21
**Reviewer:** effective-flow-nodejs-reviewer, effective-flow-code-validator

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     6 |
| Open / Not implemented |     0 |

All six should-fix findings were incorporated and each new guard was demonstrated firing with its
exact error message. Two of them — the empty-list digest and the unhashed tracker-stub destination —
were silent-failure paths this refactor introduced, not pre-existing defects. Seven notes were also
fixed: a discard message reporting a threshold as a count, a duplicated seed rationale, an ignored
`requiresAuxiliary` parameter, two wrong README paths, and a stray destructuring placement.

## Plan review

**Result:** Approved

The generic plan-quality and plan-review judgment was obtained from `effective-delivery`
(routes "Codebase Audit and Plans" and "Safe Legacy Change Strategy"); Effective Flow normalised it
into the form below. No specialist boundary was crossed, so the relevance gate loaded no further
owner: this is a tooling and evidence change with no product, browser or system-design surface.

### Summary

Totals across both passes: the internal plan review and the deep interactive review of 2026-09-21.

| Area            | Critical | Important | Note |
| --------------- | -------- | --------- | ---- |
| Architecture    | 0        | 1         | 2    |
| Security        | 0        | 0         | 1    |
| Data protection | 0        | 0         | 0    |
| Error cases     | 0        | 0         | 1    |
| Testability     | 0        | 3         | 0    |
| Scope           | 0        | 2         | 2    |
| Maintainability | 0        | 0         | 2    |

### Findings — internal plan review

- **Testability, Important — the plan recorded no drift or working state, and the verification
  baseline is already red.** A plan that does not state the code state it was written against cannot
  tell an executor whether it still describes reality. Worse here: the merge-gate archive is stale
  before this work starts, so an implementer who runs `verify` after the instrument move cannot tell
  self-inflicted staleness from the pre-existing kind. Incorporated as "Planning baseline", with
  recording the baseline promoted to step 1 and a matching stop condition.

- **Testability, Important — the steps named no commands.** The acceptance criteria carried commands
  but the steps did not, so no individual step was independently provable. Incorporated: every step
  now carries a `Verify:` line with a real repository command and its expected result.

- **Scope, Important — the instrument move and the new suite are separable and must land as two
  changes.** Preparatory structure work and the behaviour addition have different risk, different
  reviewers and different rollback. Incorporated: steps 1 to 4 are the preparatory delivery, ending
  with the merge-gate corpus re-recorded and strict mode green; steps 5 to 10 are the additive one.

- **Scope, Note — no explicit exclusion list.** A plan that names only what is in scope invites
  attractive side quests, and this change sits next to several. Incorporated as "Out of scope".

- **Architecture, Note — the generalisation was justified by cost equality alone.** Cost equality
  answers "why not the cheap path" but not "why an abstraction at all". Incorporated: the decision
  now records that it passes the complexity ladder on two real callers, and names the fourth option
  that was considered and rejected, with over-invalidation as the concrete reason.

- **Architecture, Note — the exit channel is a second way for a prompt to shape a run.** The existing
  prompts already instruct on paths and non-interactivity, so the class is not new, but the suite now
  depends on an instruction the tool text does not mention. Kept as a stated assumption with a named
  falsification and a stop condition, rather than designed away: the alternative, instrumenting the
  tool itself, is exactly the echo this plan exists to stop relying on.

- **Security, Note — the exit channel stores caller-supplied text.** It follows `iterate-trace.mjs`
  in storing bytes and a digest and never executing content; the validation plan exercises that with
  a shell metacharacter sequence.

- **Maintainability, Note — the deferred work had no owner.** Incorporated as "Maintenance and review
  focus", which names both deferrals, the enduring contract, and the riskiest review question.

### Findings — deep interactive review, 2026-09-21

- **Architecture, Important — the exit-channel helper was placed in the instrument, against the
  stated membership rule.** `report-channel.mjs` is copied into a slot's skill tree and executed
  there, which is exactly the case the scaffold already decided: `iterate-trace.mjs` "is deliberately
  not an instrument file: it is copied into the slot's skill tree and hashed there, at the paths the
  run executes, as part of `skill`" (`build-identity.mjs:160-164`). The original placement would
  still have staled the archive on a change, so the error was not loud — it would simply have
  described the run wrongly and left the load set incomplete. Incorporated: the file moves to
  `evals/iterate/_scaffold/` and is hashed as `skill`.

- **Testability, Important — the registry-lift acceptance test could not be executed as written.**
  It asked for a throwaway scenario _name_ to be added to the registry, but `discoverSuite` enforces
  parity across scenarios, fixtures and the registry and throws before any digest can be taken
  (`_scaffold/suite.mjs:24-45`). Incorporated: the throwaway scenario is added with all three parity
  members.

- **Scope, Important — the tranche had narrowed away two rules that were explicitly approved.**
  Restricting to Phase-0 refusals silently dropped `review-in-flight` and `empty-selection`, the
  latter being the second half of the very filter invariant the tranche covers: an unparseable filter
  aborts, and a filter matching nothing must not fall back to processing everything
  (`src/tools/iterate.md:365-366`). Resolved by decision: the tranche is six scenarios, the two
  forge-reading ones are back in, and `unparseable-language-context` is dropped as the weakest of the
  candidates. The verdict rule now has two documented shapes.

- **Error cases, Note — an absent call log was not distinguished from an empty one.** A run that
  makes no forge call may leave `run-N.jsonl` empty or never create it. Incorporated as an edge case
  with an explicit instruction to decide it in the evaluator rather than inherit it.

- **Scope, Note — the independence claim contradicted the approach.** The plan claimed independence
  from the pending 1.65.0 re-record while step 4 necessarily performs it. Incorporated: the decision
  now states that the plan does not wait for that re-record but that its first delivery subsumes it,
  in either ordering.

- **Maintainability, Note — the CI step name was left undecided.** Resolved by decision: the step is
  renamed to `Behavioural eval evidence`, the three pinned literals move with it, and the job name —
  the required check — is untouched.

## Open points

- No open points.
