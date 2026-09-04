# Behavioural evals for the merge gate

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`/effective-flow build`)

## Requirement

`merge-gate` has no behavioural safety net. All 671 assertions guarding `src/tools/merge-gate.md`
check its **text**; not one exercises a gate run. A restructure can therefore move a fail-closed
rule into a place the run never reaches and every test still passes, because the wording is present
somewhere.

That is not hypothetical. On 2026-09-02 a deferral moved a literal out of reach of its own trigger
condition; content preservation was provably complete, the full suite was green, and the rule was
unreachable. Two review bots caught it, no test did.

`merge-gate` is the security-densest file in the repository — the human-comment guard, the Git
write boundary, the round bound and ten merge preconditions all fail closed — which makes it the
worst candidate for a text-only net.

This plan exists because
[2026-09-02-merge-gate-deferring-tool-local-sections.md](2026-09-02-merge-gate-deferring-tool-local-sections.md)
declares such a layer a **blocking prerequisite** of its own first work package. Its minimum bar is
stated there and adopted verbatim here: _a merge which should be blocked is observed to be
blocked._

### Correction to the finding that prompted this

The architecture review recommended "add a behavioural eval layer (mirroring the central skills'
`evals/evals.json`)". That recommendation was wrong, and this plan does not follow it. The central
collection's own documentation states of that format: _"neither local checks nor CI runs a model,
grades a response, or establishes behavioral correctness from them. CI validates only their static
JSON shape"_ and _"it is not an executed behavioral-evaluation harness"_. It is a curated prompt
corpus with a human grading protocol. Mirroring it would have produced a file that looks like a
safety net and catches nothing — including, specifically, the defect that motivated this work.

## Architecture decisions

- **The stub's call log is the source of truth, not a run trace.** Every assertion this layer makes
  is about what the gate _did_: was a merge requested, was the status read, was a delegation
  started. The stub already observes all of it at the one boundary the gate must use, so it writes
  a JSON-lines record per call and that file is the evidence. An ordinary `node:test` reads it and
  asserts with `assert`. This is the decision the rest of the design follows from, and it was
  reached by asking what the check needs rather than by adopting an available harness's shape.
- **No eval harness, and therefore no graders, no scoring and no trace parsing.** `claude plugin
eval` was the intended mechanism and is gated behind early access on the target machine, so it is
  unavailable. That turned out to matter less than expected: three of the four things such a
  harness provides — capturing a trace, parsing it, scoring it against graders — exist only because
  the trace is the evidence. With the log as evidence they are not needed at all, and a
  model-graded verdict never enters the picture.
- **What remains is a launcher, not a runner.** One irreducible thing survives: something has to
  start the gate run _in isolation_. That is not a technical requirement but an epistemic one — a
  run started from a session that already knows the answer tests that session's memory, not the
  instruction, and the gate's own contract forbids exactly this ("Do not check the condition by
  self-assessment"). The launcher provides a fresh context per run and repeats it; it observes
  nothing and grades nothing.
- **Repetition stays at 5, and the reason is unchanged.** Model runs vary. For a fail-closed rule
  anything below 5 of 5 is a finding rather than variance, and the assertion is a file check, so
  repeating it is cheap in everything except model time.
- **Stub at the `remote-tracker.mjs` boundary, and nowhere else.** The whole forge input surface of
  a gate run passes through one subprocess with a JSON-in/JSON-out envelope, and the prompt
  contract forbids assembling provider requests itself (_"Never assemble provider requests or
  discover flags in the prompt"_). A fake `remote-tracker.mjs` on the scaffolded skill root that
  dispatches on the operation name and returns a canned envelope is therefore a **complete** input
  stub: no network, no `gh`, no `tea`, no recorded-cassette infrastructure.
- **The observable is the absence of the merge call in the log.** For every refusal scenario the
  assertion is that the call log holds no `pr-merge` record. That is a reachability assertion, not a
  wording assertion, and it is exactly the property the text suite cannot express. The gate states
  the consequence itself: under an active guard _"Phase 3 delegates nothing"_ and _"Phase 4 fails on
  this condition and the run ends with a report."_ The stub additionally refuses any merge it is
  asked to perform and records the refusal, so a gate that tries is caught rather than served.
- **Claude-only, with the gap named rather than papered over.** The launcher starts Claude runs;
  no Codex equivalent is built here. Both targets are built from one source and carry identical
  rules, so what stays unexercised is the **Codex execution**, not the rule. Recorded as a residual
  risk in the repository's established style for naming untestable properties, and not closed by
  weakening any criterion. Note this is now a smaller commitment than before: the launcher is the
  only Claude-bound piece, and a Codex driver would reuse the stub, the fixtures and every
  assertion unchanged.
- **The eval suite is not part of the shipped skill, and not part of CI.** It lives beside the
  source and is run deliberately. What makes it binding is evidence rather than automation: every
  pull request of the deferral round carries the suite's output in its body. CI has neither the
  credentials nor a cost budget for it today, and adding both is separate scope.

## Affected files

| File                                            | Description                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `evals/merge-gate/scenarios/<name>.md`          | New. One prompt per scenario, plus the expected outcome as prose for the human reading a failure             |
| `evals/merge-gate/run-scenario.mjs`             | New. The launcher: provisions the sandbox, starts N isolated runs, collects each run's call log              |
| `test/merge-gate-eval.test.mjs`                 | New. Ordinary `node:test` assertions over the collected call logs                                            |
| `evals/merge-gate/_scaffold/remote-tracker.mjs` | New. The canned-envelope stub standing in for the shipped helper                                             |
| `evals/merge-gate/_scaffold/scaffold.mjs`       | New. Provisions the sandbox: skill root, stub helper, project-setup ADR, temp git repository                 |
| `evals/merge-gate/fixtures/*.json`              | New. One envelope set per scenario, following the fixture-corpus pattern of `test/fixtures/project-routing/` |
| `test/eval-fixture-fidelity.test.mjs`           | New. Proves each fixture envelope is one the real helper could emit                                          |
| `package.json`                                  | An `eval:merge-gate` script that runs the launcher; the default `test` script is unchanged                   |
| `docs/developer-guide/`                         | The layer, what it covers, what it deliberately does not, and the Codex residual                             |

## Implementation details

### Approach

Six work packages. WP1 and WP2 are the load-bearing ones; if either fails, the plan is reported
back rather than continued, because the remaining packages are worthless without them.

### WP1 — Prove the mechanism on one scenario end to end

Before any scenario corpus is written, take **one** case all the way through: an active
human-comment guard caused by a single unresolved thread from an unconfigured, non-bot account,
where the correct behaviour is that no merge is attempted.

**Most of this package already exists** and is committed on
`effective-flow/build/merge-gate-behavioural-evals`: the scaffold, the stub with its call log, the
fixture set for this scenario, and the fidelity test of WP2. What was built against the withdrawn
harness — a case definition, four trace graders and a harness-bound package script — is discarded.

What remains unproven, and is the whole point of this package:

- does an isolated run started by the launcher discover the scaffolded skill root and load
  `merge-gate` at all,
- does that run call the stub rather than the shipped helper,
- and does the call log come back complete enough to assert on.

**If the stub is not reached, or the log does not distinguish a merge request from its absence,
stop and report.** The plan rests on those two facts, and no amount of launcher work substitutes
for them.

The third question the withdrawn design carried — whether a trace exposes the right events — is
gone with it. The log answers it by construction, because the stub writes it.

That stop is reciprocal with the plan this one unblocks: its prerequisite says _"if that plan
concludes the eval layer is not feasible, this one is re-opened rather than started without it."_
A WP1 failure is exactly that conclusion, so it is reported back to
[2026-09-02-merge-gate-deferring-tool-local-sections.md](2026-09-02-merge-gate-deferring-tool-local-sections.md)
rather than worked around here — and that plan is then re-opened rather than quietly proceeding
under a weaker net.

### WP2 — Fixture fidelity

A stub is only worth something if its envelopes are ones the real helper could produce. Otherwise
the suite tests the gate against a forge that does not exist.

`executeOperation` is importable, so each fixture payload is piped through the **real** normalizer
in a `node:test` case and the result compared against the envelope the stub hands out. This runs in
the ordinary suite and is what keeps the two from drifting.

Cover at minimum the operations the high-confidence scenarios read: `viewer-read`,
`pr-status-read`, `pr-comments-read`, `pr-reviews-read`, and the review-thread read.

**Already implemented and green** on the branch named in WP1: seven tests covering the envelopes
against the real normalizer, the stub's verbatim return, its merge refusal, its loud failure on an
undefined operation, and its error shape. Verified to fail when an envelope is mutated. This
package survives the harness change untouched, and it is the reason the change costs so little.

**One addition this revision requires:** the call log needs a stable schema, because it is now the
evidence rather than a convenience. Pin its shape here — one JSON object per line, with at minimum
the operation name, whether `--apply` was set, and a monotonic sequence number — and assert that
shape in this same test, so a stub change cannot silently reshape what every later assertion reads.

### WP3 — The human-comment guard scenarios

The guard is the single most deterministically assertable non-trivial thing in the file: an ordered
three-rule evaluation over a comment list, a thread list, a review list, a viewer identity and the
configured bot logins, ending in a binary verdict.

Cover at least the three cases the source itself records as past defects — a case-folded login
match, a `[bot]`-trimmed login match, and a resolved thread read as a filter over its contents —
plus the fail-closed direction where `viewer-read` fails and every non-bot item consequently
counts, and the carve-out that rule 1 stays untouched by that failure.

Each scenario asserts against the call log: no `pr-merge` record, and — where the run is expected
to _proceed_ — exactly one.

### WP4 — The pure-input preconditions

Conditions 1, 2, 3, 8 and 9 are decidable from configuration and one status envelope, and condition
9 is the purest of them: a table of pull-request titles against expected verdicts under
`delivery.mergeMethod: squash`.

Condition 2 deserves its own attention: the non-obvious branch is that an empty check list under
`requireAllChecks: true` must **not** pass, and that `checksReported: false` blocks outright. Both
are exactly the kind of rule a restructure could relocate silently.

### WP5 — Fail-closed inputs and the round bound

Every fail-closed input is expressed as an _absence_ — an absent login, an unset verified head, an
unreported check list, an unreadable thread list, an unknown review state. Absence is trivial to
express in an envelope and the correct verdict is always the same one, so this package is the
cheapest per scenario and the closest to the plan's stated minimum bar.

**Enumerate the set before writing scenarios** and record the enumeration in the pull-request body.
The acceptance criterion below counts them, so the count must be derived from the source rather
than copied from this plan: read `src/tools/merge-gate.md` for its own fail-closed statements, which
it marks explicitly with phrases such as "fails closed", "fail closed" and "never as an assumed
pass". The nine this plan names are a measurement taken on 2026-09-02, not a target — a different
count from the same derivation is a finding about this plan, not about the gate.

The round bound is exercised by setting `mergeGate.maxRounds: 2`, having the stub return an
unchanged blocking state, and asserting the run terminates with a bounded read count and no merge.

**Cost is quota and wall-clock time, not money.** This project runs on flat Claude Code and Codex
subscriptions, so a run produces no per-token charge. An earlier draft of this plan priced the
suite in dollars; that was an error of unit, not of precision, and the figures are withdrawn rather
than corrected.

What a run actually consumes is subscription quota shared with the project's real work, and time:
each scenario is a full multi-phase gate run over a 3147-line tool, repeated five times. Measure
**wall-clock per run** during WP1 and state the projected suite duration in the pull-request body.

The consequence is worth stating because it runs opposite to the withdrawn framing: with no
marginal charge, breadth is cheap and the pressure to cut scenarios largely disappears. The
scenario count is bounded by how much quota and time the suite may take from other work — a
scheduling question — rather than by a budget. The 5-of-5 requirement is not traded away for
breadth under either framing.

### WP6 — Phase 5.5 entry reachability

The plan this one unblocks defers the **body** of Phase 5.5 as its first work package. Covering the
gate's refusal conditions while leaving that phase entirely untested would satisfy the prerequisite
in letter and miss the path the change actually touches.

The risk WP1 carries is not that Phase 5.5 observes wrongly. It is that its **entry gate** becomes
undecidable once the steps behind it move — the same failure that produced the 2026-09-02 defect.
That is an input-driven decision and therefore in reach: given a merged pull request whose body
carries a valid lifecycle receipt, the run must enter observer-only mode and reach Phase 5.5;
given one with no receipt or an invalid one, it must not, and must report why observation is
unavailable.

Assert reachability only — that the phase was entered, or correctly was not. The observation steps
themselves stay out of scope, and this package does not turn into tracker-stub work.

### Explicitly out of scope

Recorded so a later pass does not mistake these for oversights:

- **Conditions 6, 7 and 10 end to end.** They are evaluated against identifiers the gate mints at
  run time, so a fixture cannot carry them; exercising them needs a second stub that fakes a
  _skill_ and echoes back what it was handed. Their **fail-closed halves** — a thread with no
  recorded outcome, a review whose author cannot be established — need no delegation and are
  covered in WP5.
- **The set-aside confirmation** (needs an interactive operator answer), **the conflict-resolution
  path** (needs two sub-agents and a genuinely conflicted tree), **the observation steps of Phase
  5.5** — its _entry reachability_ is covered by WP6 — and **the content of the Phase 6 report** as
  opposed to whether a merge happened.
- **Codex execution**, per the architecture decision above.

### Edge cases

- A scenario that asserts only "no merge call" passes trivially if the run crashed or never started
  the gate. Every refusal case therefore also asserts positive evidence that the gate ran and
  reached its decision — at minimum that the status read occurred.
- The suite must contain at least one scenario where the gate **does** merge. Without it, a
  regression that blocks everything would show as a fully green suite.
- Runs consume subscription quota and wall-clock time. The launcher is bounded in **runs and
  elapsed time**, not in currency, and the suite is not in the default `pnpm test` path so it never
  runs by accident.
- The launcher must fail loudly when a run produces no log at all. A missing log and an empty log
  are different facts: the second says the gate called nothing, the first says the run never
  started, and reading either as "no merge was requested" would pass a refusal scenario for the
  wrong reason.

## Acceptance criteria

- [ ] WP1 demonstrates, with a collected call log, that an isolated gate run loads `merge-gate`,
      calls the **stub** helper rather than the real one, and that the log distinguishes a merge
      request from its absence. Reported before any further scenario is written.
- [ ] Every refusal scenario holds in **5 of 5 runs**. A single deviating run is reported as a
      finding and never accommodated by relaxing the requirement.
- [ ] Every assertion is an ordinary `node:test` assertion over the call log. No model grades any
      verdict, and no assertion reads a run transcript.
- [ ] The call log's schema is pinned by a test, so a stub change cannot reshape the evidence every
      other assertion depends on.
- [ ] A run that produced no log fails loudly rather than counting as a refusal.
- [ ] Each refusal scenario asserts both that no merge call occurred **and** that the gate reached
      its decision, so a crashed run cannot pass.
- [ ] At least one scenario asserts a **successful** merge, so a blanket-refusal regression fails
      the suite.
- [ ] Every fixture envelope is proven, in the ordinary `node:test` suite, to be one the real
      `executeOperation` normalizer emits for the same input.
- [ ] The suite covers, at minimum: the human-comment guard's three ordered rules across its three
      counting surfaces; conditions 1, 2, 3, 8 and 9; every fail-closed input of the enumeration
      WP5 derives from the source; the round bound; and Phase 5.5 entry reachability in both
      directions.
- [ ] The fail-closed enumeration is derived from `src/tools/merge-gate.md` and recorded in the
      pull-request body. A count differing from the nine measured on 2026-09-02 is reported, not
      silently adopted.
- [ ] Wall-clock per run is measured during WP1 and the projected suite duration stated in the
      pull-request body. Where the suite must be shortened, the scenario count gives way — never
      the 5-of-5 requirement.
- [ ] The launcher's bound is expressed in runs and elapsed time. No acceptance criterion, script
      or flag in this layer is denominated in currency.
- [ ] Every pull request of the deferral round carries this suite's output — date, commit and
      per-case pass rate — in its body. That evidence is what makes the layer binding for that
      round in the absence of a CI job.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` still pass;
      the default `test` script does not invoke the eval harness.
- [ ] The developer guide states what the layer covers, what it deliberately does not, and that
      Codex execution is unexercised.

## Validation plan

- Run the eval suite and record per-case pass rates; a case below 1.0 is investigated rather than
  re-run until green.
- Adversarially verify the suite has teeth: temporarily weaken one guard rule in a scratch copy of
  `merge-gate.md` — remove the identity comparison of guard rule 2 — and confirm the corresponding
  scenario fails. A suite that stays green against a deliberately broken gate is worthless, and
  this is the only check that proves otherwise.
- Repeat that inversion for one fail-closed input and one precondition, so the proof is not a single
  lucky case.
- Confirm the fidelity test fails when a fixture envelope is altered to a shape the real normalizer
  would not emit.
- Run the four repository checks in the order `AGENTS.md` prescribes.

## Assumptions and open points

- Assumption, tested by WP1 rather than believed: a scaffolded skill root is discovered by the eval
  run, and the stub helper is reached in place of the shipped one. The research verified the
  harness's flags and grader types by reading the binary and its help output, but did not execute a
  suite.
- Assumption: the trace records helper invocations at a granularity that distinguishes `pr-merge`
  from a read. If it records only top-level tool calls and every helper call appears as one `Bash`
  invocation, the graders must match on the command string instead — a `regex` over the trace still
  works, but the grader shape changes.
- Resolved in the deep review: the suite does **not** run in CI, which has neither the credentials
  nor a cost budget for it. It is made binding instead by the evidence requirement above — every
  pull request of the deferral round carries its output. A CI job stays possible later and is not
  this plan's scope.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         2 |    0 |
| Testability     |        0 |         2 |    2 |
| Scope           |        0 |         2 |    0 |
| Maintainability |        0 |         1 |    1 |

### Findings

- **Architecture, Important — the recommended precedent does not work.** The review that prompted
  this plan proposed mirroring `evals/evals.json`, a format its own repository documents as not
  executed. Incorporated: the correction is stated in the requirement, and `claude plugin eval` is
  chosen with the reasons it is not that format.
- **Architecture, Important — a model-graded verdict would defeat the purpose.** Incorporated as a
  decision: deterministic graders only for refusal verdicts, with `llm` and `baseline` excluded by
  name.
- **Error cases, Important — "no merge call" passes trivially on a crashed run.** Incorporated: every
  refusal scenario must also assert the gate reached its decision, and it is an acceptance criterion.
- **Error cases, Important — a blanket-refusal regression would show as green.** Incorporated: at
  least one scenario must assert a successful merge.
- **Testability, Important — a stub can drift from the real helper.** Incorporated as WP2 and an
  acceptance criterion: fixtures are proven against the real normalizer in the ordinary suite.
- **Testability, Note — a suite that never fails proves nothing.** Incorporated into the validation
  plan as a deliberate inversion against a weakened gate, repeated across three rule classes.
- **Scope, Important — the delegation conditions cannot be reached.** Incorporated: conditions
  6/7/10 are out of scope end to end, with their fail-closed halves explicitly kept in WP5, so the
  boundary is a decision rather than a gap.
- **Maintainability, Note — Codex stays unexercised.** Recorded as a named residual in the
  repository's established style, and reflected in the documentation criterion.

### Deep review, 2026-09-02

Three findings were incorporated directly; two were put to the user as decisions.

- **Testability, Note — an uncountable criterion.** "The nine fail-closed inputs" was asserted by
  this plan rather than derived. Incorporated: WP5 derives the enumeration from the source and
  records it, and a count differing from the measured nine is reported rather than adopted.
- **Maintainability, Important — the failure linkage ran one way only.** The plan this one unblocks
  says it re-opens if the eval layer proves infeasible, but nothing here said a WP1 failure _is_
  that conclusion. Incorporated as a reciprocal stop.
- **Testability, Note — no cost bound.** Five runs per case against a 3147-line tool is not free.
  Incorporated: the consumption is measured in WP1 and stated in the pull-request body, and reduced
  by dropping scenarios rather than runs. Superseded in unit by the 2026-09-02 revision below,
  which withdraws the currency framing.
- **Scope, Important — the eval layer missed the path it was meant to protect (decided).** The
  deferral round's first work package moves Phase 5.5, which this plan had excluded entirely, so
  the prerequisite would have been met in letter while leaving that change untested. Decided: add
  WP6 covering Phase 5.5 **entry reachability** in both directions — the actual risk is an
  undecidable entry gate, not a mis-observation — while the observation steps stay out of scope.
- **Testability / Maintainability, Important — a suite outside CI binds nothing (decided).**
  Decided: every pull request of the deferral round carries the suite's output, with date, commit
  and per-case pass rate. The CI question is closed rather than deferred.

### Revision, 2026-09-02 — harness withdrawn, evidence source inverted

An implementation attempt reached WP1 and stopped: `claude plugin eval` is gated behind early
access on the target machine. The command exists with full help, and refuses to execute. Enabling
the gate was not this run's decision to take.

The operator then asked the question that reshaped the plan: **why does this need a runner at all,
in an environment that is already an LLM?** It was the right challenge and the answer was
substantially yes.

A harness of that kind does four things — start runs, capture a trace, parse it, score it against
graders. Three exist only because the trace is the evidence, and the trace is the evidence only
because that is how the harness is built. The facts under assertion were already being written to
disk by the stub, which sits at the one boundary the gate must use. Making that log the source of
truth removes the parser, the graders and the scoring outright, and removes a model-graded verdict
from a safety check where it never belonged.

What survives is a **launcher**: something must start each run in isolation. That requirement is
epistemic, not technical — a run started from a session that already knows the answer tests that
session's memory rather than the instruction, which the gate's own contract forbids by name.

Two arguments for a full runner were examined and did not hold. CI executability was already off
the table by the operator's own earlier decision that the suite runs deliberately, with evidence in
the pull-request body. And harness portability turned out to cut the other way: with the log as
evidence, the launcher is the only Claude-bound piece, so a later Codex driver reuses the stub, the
fixtures and every assertion unchanged.

The revision is a **reduction**. Nothing was added to compensate for the withdrawn harness, and the
prior implementation attempt is mostly preserved: the scaffold, the stub with its log, the fixtures
and the fidelity test carry over untouched on
`effective-flow/build/merge-gate-behavioural-evals` (commit `5c11bc9`). Only the case definition,
the four trace graders and the harness-bound package script are discarded.

One addition the inversion demands: the call log now needs a **pinned schema**, because it was
written as convenience evidence and is now the thing every assertion reads. That is folded into WP2.

Findings from this revision:

- **Architecture, Important — the harness was chosen before the requirement was understood.** The
  original decision adopted the available tool's shape. Incorporated: the evidence source is now
  derived from what the check needs, and the harness dependency is gone.
- **Architecture, Important — a gated feature is not a foundation.** Incorporated: nothing in the
  revised design depends on a feature flag.
- **Testability, Note — the log was demoted by its own author.** The stub's comment reads "never the
  grader's source of truth". Incorporated: it is now exactly that, with a schema test behind it.
- **Error cases, Important — a missing log would read as a refusal.** A run that never started
  produces no `pr-merge` record, which is indistinguishable from a correct refusal. Incorporated as
  an edge case and an acceptance criterion.

### Correction, 2026-09-02 — cost was priced in the wrong unit

The plan estimated the suite in dollars, derived from token counts and API pricing. This project
runs on flat Claude Code and Codex subscriptions, so no per-token charge arises and those figures
described a billing model that does not apply here. The error was inherited from a research step
and carried into the plan without the billing model being checked; it was then defended as
imprecise rather than recognised as wrong in kind.

The figures are withdrawn, not adjusted. Consumption is restated as **subscription quota and
wall-clock time**, and the launcher's bound is expressed in runs and elapsed time. Any residual
currency-denominated flag belonged to the withdrawn harness and is gone with it.

One design consequence points the opposite way from the withdrawn framing and is recorded so a
later pass does not re-derive the old trade-off: with no marginal charge per run, **breadth is
cheap**. The bound on scenario count is how much quota and time the suite may take from the
project's real work, which is a scheduling question rather than a budget one. WP3 to WP6 may
therefore be scoped more generously than the original cost framing implied. The 5-of-5 requirement
is unaffected either way.

## Open points

- No open points.
