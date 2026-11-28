# Leaf workers await every command they started before returning DONE or ABORT

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #841

## Requirement

A delegated leaf worker can end its turn while shell commands it started in the background are still
running. Its orchestrator then receives a report that carries neither `DONE` nor `ABORT` and has to
resume the worker. This was observed with `effective-flow-code-validator` in a docs workflow. The
project runs its checks through a shared runner that queues commands for admission, so the validator
started `pnpm agent:check` and a focused `pnpm test` in the background and returned an interim report
while it waited.

The delegation mandate only covers an orchestrator that runs as a sub-agent, and only its child
sub-agents (`src/shared/delegation-mandate.md:9`, "never ends its turn while a child is still
pending"). The leaf-executor clause (`src/shared/delegation-mandate.md:7`) and
`src/agents/code-validator.md:120` ("Run sequentially unless isolation is clear") say nothing about
commands a worker starts itself.

Goal: every leaf worker contract states that a worker awaits every command it started before it
returns `DONE` or `ABORT`. The contract takes a foreground-first form:

- a leaf starts no background command it would have to wait for;
- it runs each command in the foreground and returns `DONE` or `ABORT` only after every foreground
  call it made has returned;
- a command it expects to outlast the foreground limit stays unstarted and is named in its result
  as not run.

The rule ships through the fragment's existing eager include in every `src/agents/*.md` worker.
It matches the rule the repository already uses for hand-written sub-agent briefs: a native
sub-agent is not reliably woken by background work it started
(`docs/developer-guide/t3-acceptance-runs.md:97-106`).

Workflow rationale: this is a Bugfix. The shipped worker contract lets workers return keyword-less
interim results, which the completion protocol treats as unfinished. That costs a resume round trip
or a wasted retry. Prompt text under `src/` is product source in this repository, so `fix` is the
right workflow and `docs` is not.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #841
**Original outcome:** Every shipped leaf worker contract (native Claude, native Codex, portable)
says that a worker awaits every command it started before it returns `DONE` or `ABORT`. A source
prose test names this invariant and pins the text in the built worker contracts. The CI order
`pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` passes. The fragment
stays harness-neutral and within its line cap, and no tool `contextBudget` changes.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** One foreground-first insertion in the existing leaf-executor bullet. The
native-agent baseline comparator gets one declared body delta. Pinning tests and one guide sync
follow. No new fragment, include or worker-specific rule.
**Continuation decision:** none

## Architecture decisions

- **Single owner: the leaf-executor clause of `src/shared/delegation-mandate.md`.** Every
  `src/agents/*.md` worker already includes the fragment eagerly
  (`test/delegation-mandate-contract.test.mjs:503` asserts this). An insertion there reaches all
  native Claude and Codex sidecars and all portable `workers/effective-flow-<name>.md` contracts.
  No worker gets its own copy, which follows AGENTS.md "State a contract once". `code-validator.md`
  stays unchanged.
- **Foreground-first, not "foreground or await" (decided by score).** The issue's proposed sentence
  also lets a leaf start a background command and "explicitly await" it. The repository records
  that a native sub-agent is not reliably woken by background work it started, and that polling is
  no substitute for a wait (`docs/developer-guide/t3-acceptance-runs.md:97-106`). Claude worker
  grants carry no wait tool (`src/agents/code-validator.md:6`). Keeping the await branch in the
  shipped prose would leave the #841 failure reachable on Claude Code. A foreground command is
  awaited by construction, so the issue's acceptance criterion 1 still holds.
- **Finish condition: every foreground call has returned (decided by score).** The leaf's condition
  is that each call it made has returned, not that the workload has finished. When the host's tool
  timeout cuts off a call, a queued runner job can outlive the client. In that case the domain
  owner's states classify the result: `effective-delivery` reports `TIMEOUT` only for a confirmed
  stopped and reaped process tree, and `TERMINATION_UNCONFIRMED` otherwise. A leaf can always tell
  that a call has returned. "Has finished" would leave it unable either to return or to poll,
  which leads back to the #841 symptom.
- **A command left unstarted is named in the worker's result, not handed to the orchestrator
  (decided by score).** Each worker's own result contract picks the state. The validator reports
  `SKIPPED (<reason>)` with the remaining evidence gap (`src/agents/code-validator.md:120`, `:131`),
  so checks that passed survive. A worker without such a state returns `ABORT`. No workflow runs a
  handed-back command (`src/shared/completion-protocol.md:11`), and adding that duty would break the
  leaf-only scope.
- **No stop-and-report clause (decided by score).** What happens to a command that runs past a
  bound stays with the domain owner: `effective-delivery` owns concurrency, process cleanup,
  terminal result states and the timeout protocol (`src/agents/code-validator.md:46-50`). The eager
  fragment carries no second copy of that playbook (AGENTS.md "Layered ownership contract"). Its
  length is also paid on every run.
- **"Foreground limit" is defined in the guide, not in the fragment.** It means the longest wait
  the host's foreground command call allows, with its per-call timeout raised to the maximum. A
  leaf "expects" a command to outlast that limit only from evidence: project guidance, CI timings,
  or an earlier cut-off of the same command. Queue admission cannot be predicted and falls under
  the cut-off case above. Harness mapping lives in `docs/developer-guide/architecture.md`. On Codex,
  continuing the same exec session after its yield time is the same foreground call; it is neither
  a background command nor a polling loop, and it has not returned while the session still runs.
- **Place the insertion directly after the leaf-executor definition, inside the same physical
  line.** It goes after "…instead of seeking it through child delegation." and before "Start each
  worker with **zero inherited turns**…". The bullet is one physical line (line 7). The fragment
  stays at 16 by the guard's `split('\n').length` count, which is exactly the cap of
  `test/delegation-mandate-contract.test.mjs:171-182`. A separate bullet would fail that cap test
  and add one line to every including tool. The built line count of the 25 including tools does not
  change, and `contextBudget` counts lines (`build.mjs:2614-2672`), so no budget is touched.
- **Harness-neutral wording.** The fragment ships to Codex and portable targets. The insertion names
  no harness tool or parameter: no `run_in_background`, no `SendMessage`, no shell tool name. The
  test at `test/delegation-mandate-contract.test.mjs:279-289` and the build's harness leak guard
  (`build-lib.mjs:4773-4780`) enforce this. Say "background command", "foreground call" and
  "foreground limit".
- **Scope stays at the leaf (decided by score).** The orchestrator rule at line 9 (child
  sub-agents) and the workflow-to-workflow carve-out at line 10 stay unchanged. So do their test
  anchors (`test/delegation-mandate-contract.test.mjs:242-292`). A delegated orchestrator's own
  background commands are out of scope; see Assumptions.
- **The native baseline proof gets one new declared body delta.**
  `scripts/compare-native-agent-baseline.mjs` fails on any native sidecar body change outside its
  declared `EXPECTED_NATIVE_DELTAS.body`. The new delta, `delegation-mandate-await-commands`, is a
  single substring edit. It follows the pattern of `delegation-mandate-triviality-scope`: a unique
  `from` anchor across the end of the leaf definition and the start of the handoff sentence, and a
  `to` with the insertion between them. It must go after every earlier `delegation-mandate-*` delta,
  directly after `delegation-mandate-triviality-scope`. Three earlier deltas embed the full
  `${MANDATE_WORKER_BULLET}` text in their `from` (`scripts/compare-native-agent-baseline.mjs:199`,
  `:226`, `:271`). `applyEdits` matches each literal exactly once, in declared order (`:594-609`). An
  insertion that ran first would break those three matches.

## Affected files

| File                                          | Description                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/delegation-mandate.md`            | Insert the foreground-first text (one insertion, one or more sentences) into the leaf-executor bullet (line 7), right after the leaf definition; line count unchanged                                                                                                                                                                              |
| `scripts/compare-native-agent-baseline.mjs`   | Add the declared body delta `delegation-mandate-await-commands` after `delegation-mandate-triviality-scope`, with a one-line comment                                                                                                                                                                                                               |
| `test/delegation-mandate-contract.test.mjs`   | New test whose title and comment name the invariant; it pins the insertion's clauses in the leaf-executor bullet with `assertClauses`, checks its position after the leaf definition, and keeps the harness-neutrality checks                                                                                                                      |
| `test/compare-native-agent-baseline.test.mjs` | Add the new id at index 8 of the ordered `EXPECTED_NATIVE_DELTAS.body` list (lines 134-155), directly after `delegation-mandate-triviality-scope`, and add a composition/relocation test like the triviality-scope test (lines 618-650)                                                                                                            |
| `test/execution-profile-rendering.test.mjs`   | Add the `Expected delta delegation-mandate-await-commands: …` line to the pinned comparator stdout (lines 526-552), with exactly the workers the comparator reports                                                                                                                                                                                |
| `test/model-tiers-contract.test.mjs`          | Add one test next to the lean-sentence test (lines 1270-1292). Through the existing `workerArtifacts(target)` helper it asserts that every built worker in all three targets carries the insertion exactly once. The insertion is extracted from `src/shared/delegation-mandate.md`, never hardcoded                                               |
| `test/workflow-contracts.test.mjs`            | In the architecture-guide test at lines 19962-19986, add one `assert.match` for the new rationale (a Claude Code sub-agent is not woken by its own background command) and the `t3-acceptance-runs.md` link                                                                                                                                        |
| `docs/developer-guide/architecture.md`        | Add the foreground-first duty to the leaf-executor restatement (lines 129-135). Next to the existing `run_in_background` explanation (lines 136-147), record the Claude Code reason, the "foreground limit" definition and the Codex exec-session mapping, and link `t3-acceptance-runs.md`, since the shipped fragment names no harness specifics |

## Implementation details

### Approach

1. In `src/shared/delegation-mandate.md` line 7, insert after "…instead of seeking it through child
   delegation." one insertion (one or more sentences) with this substance:
   - a leaf starts no background command it would have to wait for;
   - it runs each command in the foreground and returns `DONE` or `ABORT` only after every
     foreground call it made has returned;
   - a command it expects to outlast the foreground limit stays unstarted and is named in its
     result as not run.

   Use short clauses and no harness tool names. Do not wrap the line. Wording constraints from
   `test/model-tiers-contract.test.mjs:1124-1147` and `:1270-1292`: no new sentence may contain the
   word "tier" or the phrase "substantive work". The insertion must stay separate from the leaf
   sentence, which stays byte-identical and must not gain "substantive" or "unless".

2. In `scripts/compare-native-agent-baseline.mjs`, add the body delta
   `delegation-mandate-await-commands`. Its `from` is a substring that occurs exactly once per
   sidecar: the end of the leaf definition plus the start of "Start each worker". Its `to` is the
   same substring with the insertion between them. Place it directly after
   `delegation-mandate-triviality-scope`, for the ordering reason in Architecture decisions.
3. In `test/delegation-mandate-contract.test.mjs`, add a test like the pending-child test at lines
   238-292. Its comment names the invariant: a leaf worker never returns a terminal result while a
   foreground call it made is still running, and starts no background command it would have to wait
   for. Find the leaf-executor bullet by `/\*\*leaf executor\*\*/`. Assert three clauses:
   - no background command it would have to wait for;
   - `DONE`/`ABORT` only after every foreground call has returned;
   - a command expected to outlast the foreground limit stays unstarted and is named in the result.

   Assert that the insertion comes after "child delegation" and before "zero inherited turns". Keep
   the existing `doesNotMatch` neutrality checks.

4. In `test/compare-native-agent-baseline.test.mjs`, add the id to the ordered body-delta list.
   Add one composition test: the delta applies onto the current mandate body and is rejected when
   the insertion moves to another bullet.
5. Run the comparator. Copy its new `Expected delta delegation-mandate-await-commands: …` line,
   with its exact worker list, into the pinned stdout in `test/execution-profile-rendering.test.mjs`.
   Do not hand-write that list; the comparator output decides it.
6. In `test/model-tiers-contract.test.mjs`, add a test next to the lean-sentence test. Name the
   invariant in its title and comment. It extracts the whole insertion from the source mandate as
   the span between `child delegation. ` and ` Start each worker` (for example
   `/child delegation\. ([^\n]+?) Start each worker/`). It then walks `workerArtifacts(target)` for
   every target: `claude/agents`, `codex/agents` (including `-fast` and tier variants) and portable
   `workers/`. For each artifact body it asserts `body.split(span).length === 2`. That file's
   existing build and walk already prove that every built worker carries the mandate
   (`test/model-tiers-contract.test.mjs:1270-1292`), so no second walk is needed.
7. In `docs/developer-guide/architecture.md`, extend the leaf-executor restatement (lines 129-135)
   by one clause. Next to the existing `run_in_background` explanation (lines 136-147), add:
   - the Claude Code rationale: a sub-agent is not reliably woken by a background command it
     started, so it would hand its caller a keyword-less interim result;
   - the "foreground limit" definition: the longest wait the host's foreground call allows, with
     its per-call timeout raised to the maximum;
   - the Codex mapping: continuing the same exec session after its yield time is the same
     foreground call;
   - a link to `docs/developer-guide/t3-acceptance-runs.md` for the matching rule on hand-written
     briefs.
8. In `test/workflow-contracts.test.mjs` (lines 19962-19986), add the `assert.match` for the new
   rationale and link.
9. Run the CI order from the Validation plan.

### Component structure

Not relevant: no runtime code, no new module or include.

### State management

Not relevant: prompt text and tests only.

### API integration

Not relevant.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **Command known to outlast the foreground limit** (from project guidance, CI timings or an earlier
  cut-off): the leaf does not start it. It names the command in its result as not run. The
  validator reports `SKIPPED (<reason>)` with the evidence gap; a worker without such a state
  returns `ABORT`. It uses no polling loop or detached helper as a substitute wait.
- **Queue admission or a host tool timeout cuts off a foreground call:** admission cannot be
  predicted, so this is the usual #841 path. The host call has returned, but the runner's workload
  may not have ended. The leaf returns its terminal result with the state the domain owner assigns:
  `effective-delivery`'s `TIMEOUT` for a confirmed stop, `TERMINATION_UNCONFIRMED` otherwise. It
  returns no interim result and starts no polling loop.
- **Minimal fallback without `effective-delivery`:** `src/agents/code-validator.md:120` knows
  `TIMEOUT` but no unconfirmed-termination state, and other command-running leaves (test writer,
  implementers) have no timeout fallback at all. This known gap is out of scope; see Assumptions.
  Such leaves name the cut-off call in their result per the clause above.
- **Delegated orchestrator (line 9):** unchanged and out of scope. The insertion binds named workers
  only.
- **Fast sidecars (`-fast`):** they carry the same mandate body, so the comparator delta list
  includes them. The pinned stdout takes them from the comparator output.
- **`effective-flow-acceptance-reviewer`:** a declared added worker with no base sidecar. It does
  not appear in delta lines but must still carry the insertion in the built-contract assertion.

## Acceptance criteria

- [ ] The leaf-executor bullet of `src/shared/delegation-mandate.md` states, right after the leaf
      definition, three things: a worker starts no background command it would have to wait for; it
      runs its commands in the foreground and returns `DONE` or `ABORT` only after every foreground
      call it made has returned; and a command it expects to outlast the foreground limit stays
      unstarted and is named in its result as not run. The fragment still counts at most 16 by the
      guard's count and names no harness tool or parameter.
- [ ] A new test in `test/delegation-mandate-contract.test.mjs`, whose title or comment names the
      invariant, pins that insertion in the source bullet. A new test in
      `test/model-tiers-contract.test.mjs` pins it exactly once in every built portable worker
      contract and every native Claude and Codex worker sidecar.
- [ ] `scripts/compare-native-agent-baseline.mjs --base 6055c94` reports
      `Native agents match 6055c94` with the new `delegation-mandate-await-commands` delta line, and
      the pinned stdout in `test/execution-profile-rendering.test.mjs` matches it exactly.
- [ ] `docs/developer-guide/architecture.md` carries the Claude Code rationale, the "foreground
      limit" definition, the Codex mapping and the `t3-acceptance-runs.md` link. The new assertion
      in `test/workflow-contracts.test.mjs` pins the rationale and the link.
- [ ] No `contextBudget` line in `src/tools/*.md` changes, and `node build.mjs` reports no budget
      overrun.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` all exit 0 in
      that order.

## Validation plan

- `pnpm agent:check`
- `pnpm test`, including `test/delegation-mandate-contract.test.mjs`,
  `test/model-tiers-contract.test.mjs`, `test/compare-native-agent-baseline.test.mjs`,
  `test/execution-profile-rendering.test.mjs` and `test/workflow-contracts.test.mjs`
- `node build.mjs`; check the "Always-loaded core (lines/budget)" report for unchanged counts on
  the tools that include `delegation-mandate`
- `pnpm test:distribution`
- `pnpm eval <suite> verify` (read-only) for the five suites, to record the visible
  eval-evidence debt this source edit creates

## Assumptions and open points

- Assumption: inserting text into an existing physical line leaves every built tool's line count
  unchanged. Verified mechanism: `build.mjs:2614-2672` counts `split('\n').length`. The measured
  numbers are confirmed only by the build run in the Validation plan.
- Assumption: eval-evidence freshness debt from editing a loaded source is reported, not blocking,
  per `docs/adr/pragmatic-test-release-policy.md`. Recording new eval evidence is out of scope.
- Assumption: no change to `src/shared/completion-protocol.md` is needed. Its resume hint ("await
  any pending children", line 20) stays the caller-side recovery and is pinned by
  `test/workflow-contracts.test.mjs:19809`. No `src/agents/*.md` worker includes
  `completion-protocol`; only tools and `src/shared/build-delegated-run.md` do. A resumed worker
  already carries the new leaf rule through the mandate.
- Assumption: a check reported as `SKIPPED (<reason>)` with its evidence gap does not read as green.
  The validator's existing "one honest overall result and the evidence gaps that remain"
  (`src/agents/code-validator.md:131`) and each workflow's existing handling of skipped checks
  stay in force unchanged.
- Assumption: `docs/developer-guide/t3-acceptance-runs.md` needs no change. Its rule for
  hand-written briefs (lines 97-106) already matches the foreground-first contract.
- Assumption: CI does not verify the behavioural effect. One manual Claude Code run of a docs
  workflow, whose validator runs `pnpm agent:check` and `pnpm test` through the shared runner, is a
  recommended follow-up and not an acceptance gate.
- Assumption: `src/SKILL.md` (router) needs no change. It only states that workers are leaf
  executors and points to the fragment for the full contract.
- Out of scope, possible follow-up: a delegated orchestrator's own background shell commands. Line
  9 binds only its child sub-agents. #841 observed the failure in a leaf only.
- Out of scope, possible follow-up: the validator's minimal fallback has no
  unconfirmed-termination state, and other command-running leaves have no timeout fallback.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[
  {
    "site": "S-BAT",
    "question": "For the leaf-executor sentence, how should a leaf handle commands it starts: is the issue's 'or explicitly awaits each background command' branch kept?",
    "options": ["Foreground-first", "Foreground or await", "Grant wait tool", "Decide later"],
    "escape": ["Decide later"],
    "stop": [],
    "scores": [
      { "label": "Foreground-first", "score": 8, "reason": "It stays harness-neutral, matches the documented fact that a native sub-agent is not reliably woken by background work, and handles the queued-runner timeout by handing the command back unstarted." },
      { "label": "Foreground or await", "score": 6, "reason": "It follows the issue's wording and criterion 1, but the shipped bullet keeps a background-await branch that Claude workers cannot use reliably, and the architecture.md caveat never reaches the worker prompt." },
      { "label": "Grant wait tool", "score": 2, "reason": "Claude workers have no native wait tool to grant, a host-specific MCP wait would break the harness-neutral leaf contract, and Codex and portable workers would not be covered." }
    ]
  },
  {
    "site": "S-BAT",
    "question": "Should the shipped leaf sentence carry a stop-and-report clause for a command that cannot be awaited?",
    "options": ["Issue sentence only", "Finished or stopped", "Declared bound", "Decide later"],
    "escape": ["Decide later"],
    "stop": [],
    "scores": [
      { "label": "Issue sentence only", "score": 8, "reason": "Under R1 a leaf only runs bounded foreground commands and returns unstartable ones with ABORT, so the eager fragment needs no stop clause; timeouts stay with effective-delivery, as the ownership contract requires." },
      { "label": "Finished or stopped", "score": 3, "reason": "An unqualified \"been stopped\" lets a leaf count an unconfirmed kill as finished, which contradicts effective-delivery's TIMEOUT (stopped and reaped) and TERMINATION_UNCONFIRMED (keep monitoring) states." },
      { "label": "Declared bound", "score": 5, "reason": "It closes the unconfirmed-termination gap, but it puts part of effective-delivery's timeout protocol into an eager fragment every run pays for, and R1's foreground-first rule already covers most of it." }
    ]
  },
  {
    "site": "S-BAT",
    "question": "Does this fix also cover a delegated orchestrator's own background commands?",
    "options": ["Leaf only", "Extend line 9", "Decide later"],
    "escape": ["Decide later"],
    "stop": [],
    "scores": [
      { "label": "Leaf only", "score": 8, "reason": "Matches what #841 observed and asks for, keeps line 9 and its test anchors at 242-292 untouched, and adds no second comparator delta or eval debt; its edge is that the orchestrator gap stays recorded as a follow-up." },
      { "label": "Extend line 9", "score": 4, "reason": "It closes a real but unobserved gap, but it widens the scope beyond #841 and adds a second sidecar delta, new test anchors, eval-evidence debt and eager length paid on every delegated run." }
    ]
  },
  {
    "site": "S-DEC",
    "question": "Which finish condition does the shipped leaf sentence use?",
    "options": ["Call-returned condition", "Keep finished", "Declared bound", "Decide later"],
    "escape": ["Decide later"],
    "stop": [],
    "scores": [
      { "label": "Call-returned condition", "score": 8, "reason": "It ends the deadlock because a leaf can always tell that a call has returned, and owner states classify any surviving workload; on Codex, a session still running after its yield time must not count as returned." },
      { "label": "Keep finished", "score": 3, "reason": "The shipped sentence would contradict its own edge case, because a leaf facing TERMINATION_UNCONFIRMED may neither return nor poll, which leads straight back to the keyword-less #841 return." },
      { "label": "Declared bound", "score": 4, "reason": "It closes the gap but reopens the settled \"Issue sentence only\" decision, adds eager length every worker pays for, and copies part of effective-delivery's timeout protocol against the ownership contract." }
    ]
  },
  {
    "site": "S-DEC",
    "question": "How does a leaf report a command it leaves unstarted because it would outlast the foreground limit?",
    "options": ["Name in result", "Keep ABORT", "Orchestrator runs it", "Decide later"],
    "escape": ["Decide later"],
    "stop": [],
    "scores": [
      { "label": "Name in result", "score": 8, "reason": "Uses the validator's existing SKIPPED (<reason>) state and evidence-gap line, so PASSED checks survive and the gap stays visible; stays leaf-only; the overall result must still not read green." },
      { "label": "Keep ABORT", "score": 5, "reason": "Honest, and completion-protocol step 2 already handles it, but a whole-run ABORT throws away PASSED checks and ignores the validator's own SKIPPED state; it also defers the run path as a follow-up." },
      { "label": "Orchestrator runs it", "score": 2, "reason": "Gives the lean orchestrator a new duty, conflicts with delegation-mandate.md:5-6, breaks the leaf-only scope and adds eager length; a delegated orchestrator hits the same foreground limit anyway." }
    ]
  }
]
```

<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    1 |
| Testability     |        0 |         0 |    2 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        0 |         0 |    0 |

### Findings

- Error cases, Important: the finish condition "every command it started has finished" deadlocks
  when a host timeout cuts off a foreground call whose queued runner job survives. The owner's
  `TERMINATION_UNCONFIRMED` forbids finalizing and the plan forbids polling. Adjustment: decided by
  score as "every foreground call it made has returned". Edge cases now route a cut-off call through
  the owner's states.
- Architecture, Important: handing an unstarted command back via `ABORT` assumed an orchestrator
  path that no workflow has (`completion-protocol.md:11`), and it discarded the validator's `PASSED`
  results. Adjustment: decided by score as "named in the worker's result as not run". The validator
  uses `SKIPPED (<reason>)` with its evidence gap; a worker without such a state returns `ABORT`.
- Scope, Important: "foreground limit" was undefined, and edge case 1 assumed a leaf can predict
  queue admission. Adjustment: the guide defines the term and maps it to Codex exec sessions. The
  clause covers only commands expected from evidence to outlast the limit, and queue admission
  falls under the cut-off case.
- Error cases, Note: the validator's minimal-fallback `TIMEOUT` citation lacked the owner's confirmed
  and unconfirmed distinction. Adjustment: the owner's states are cited as authoritative, and the
  fallback gap is recorded as an out-of-scope follow-up.
- Testability, Note: how the new test extracts the inserted text was unspecified. Adjustment: step 6
  extracts the whole insertion span between `child delegation. ` and ` Start each worker` and
  asserts exactly one occurrence per built artifact.
- Testability, Note: the `architecture.md` sync had no pin. Adjustment: an `assert.match` was added
  in `test/workflow-contracts.test.mjs` (lines 19962-19986).
- Scope, Note: the line-count wording was imprecise. Adjustment: the fragment is stated as 16 by the
  guard's count, exactly at the cap, and a separate bullet would fail the cap test.

### Review history (2026-11-27, plan)

Result at that time: Approved

#### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         0 |    1 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    0 |

#### Findings

- Architecture, Important: the issue's "or explicitly awaits a background command" branch
  contradicts the repository's own evidence that a native sub-agent is not reliably woken by
  background work it started (`docs/developer-guide/t3-acceptance-runs.md:97-106`). Adjustment:
  decided by score as foreground-first.
- Testability, Note: the criteria prove that the text ships, not that the observed failure stops.
  Adjustment: an assumption records a manual Claude Code docs-workflow run as a recommended
  follow-up, not an acceptance gate.
- Gap analysis (worked in before this review): the stop-and-report clause was dropped and the scope
  kept at the leaf, both decided by score. The built-contract assertion moved to the existing
  `workerArtifacts` walk in `test/model-tiers-contract.test.mjs`. The required ordering of the
  comparator delta and the completion-protocol evidence were added.

## Open points

- No open points.
