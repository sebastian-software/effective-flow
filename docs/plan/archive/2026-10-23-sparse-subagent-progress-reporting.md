# Sparse subagent progress reporting

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Make long delegated work easier to follow from the main session. Eligible ordinary workers send
one compact meaningful checkpoint through an existing parent-message capability; the orchestrator
folds it into its existing overview. A credible remaining-time estimate or measurable progress
requires evidence; otherwise the checkpoint gives the phase, observed result and next action.

**Current acceptance, 2026-10-23:** the user explicitly accepts measured overhead above 10% and
delivery delay while the parent is busy. This supersedes the original “no material slowdown”
requirement and 10% readiness gate. The initial failed measurements remain historical failures.
The activated slice requires actual addressed tools at both ends and observed delivery during an
ordinary parent event wait before terminal completion. It establishes possibility for that
execution shape, not host-wide support or reliable timing. The archived status and location remain
unchanged; the initial fallback outcome and checks are preserved below as dated history.

The first iteration covers ordinary worker and analysis handoffs issued by the active overview
owner. The user selected this scope during deep review. Whole delegated workflows keep their
existing handoff formats and known-phase fallback; this feature does not forward progress across
workflow boundaries.

This changes shipped workflow behavior, so it is a Feature even though most implementation work
will edit Markdown instructions. It does not add a dashboard or change a host application's UI.

## Planning baseline

- Planned at `66ba847`, 2026-10-23; the worktree was clean before this plan was created.
- Configuration was read through the installed `config-resolve.mjs`: `plan.dir = docs/plan`,
  `language.workflow = en`, `delivery.baseBranch = origin/develop`.
- Stellara memory search failed with an internal error. No claim depends on remembered context.
- Context7 documentation lookup hit its quota; the official host documentation below was read
  directly instead. Host capabilities are volatile and must be checked again when implementing.
- Before implementation, compare the named source contracts, tool permissions, build rules and
  eval load sets with this baseline; revise affected steps if their ownership or behavior changed.

### Verified context

- `src/shared/delegation-mandate.md` owns worker handoffs and leaf boundaries, and is eagerly
  included by delegating tools and every worker. Its source has a separate context-size guard.
- `src/shared/goal-completion.md` already requires a single overview owner and updates after
  numbered phases and correction rounds. `src/shared/task-tracking.md` supplies the generic
  task-list fallback. Worker reports must feed this existing overview.
- `src/shared/completion-protocol.md` recognizes terminal `DONE` and `ABORT`. An intermediate
  message must never enter its missing-keyword recovery path or mark a task complete.
- The 16 `src/agents/*.md` Claude tool allowlists currently omit `SendMessage`, as well as the
  deliberately withheld `Agent` and `Task`. A prose request alone cannot give them a return channel.
- `build.mjs` and `build-lib.mjs` generate Claude, Codex and portable artifacts. They supply no
  timer, message bus or progress estimator. Portable workers use the host's built-in delegation.
- This planning host exposes parent messaging and mailbox waits through its collaboration tools;
  that is capability evidence for this host, not a guarantee for every Codex installation.
- The [official Codex documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents)
  describes agent orchestration and inspectable subagent activity. It does not establish an ETA
  or a universal intermediate-message delivery latency.
- The [official Claude subagent documentation](https://code.claude.com/docs/en/sub-agents)
  documents messaging an agent's launcher with `SendMessage`, without requiring agent teams.
  It also distinguishes blocking foreground work from concurrent background work. This does not
  imply a fixed delivery interval or that a model can report during one blocking tool call.

## Architecture decisions

1. **Use meaningful events, not periodic polling.** An established phase transition, completed
   work unit, or changed blocker can justify a short report. Do not introduce timer processes,
   status files, transcript scraping, clock-only tool calls, progress-only agents, or repeated
   requests asking an unchanged worker for status. Ordinary host waits remain available.
2. **Make the transport optional and explicit.** A compact handoff identifies the actual native
   parent-message capability and parent address, when available. Never invent tool names or
   addresses. Without a proven return channel, retain the known assigned phase and completion
   notifications. Describe that as the last known state, without claiming worker confirmation.
   The new fragment holds one small, canonical eligibility table for tested native channel semantics,
   execution mode, enablement and evidence. An available parent channel and worker channel, observed
   pre-completion delivery during an ordinary parent event wait and recorded bounded cost evidence
   determine eligibility under the user's accepted tradeoff. Missing/incompatible
   channels or unproven behavior select the phase fallback. Record host family/version only when
   authoritative metadata is already available; version is not a gate and introduces no probe.
   The user explicitly approved this channel-and-behavior rule during implementation preflight on
   2026-10-23, replacing the stricter version-identity requirement from the planning review.
3. **Keep one contract owner.** Add a short lazy pointer at the ordinary worker/analysis handoff
   seam owned by `delegation-mandate` and put the
   detailed contract in `src/shared/subagent-progress.md`. Only the active overview owner loads it,
   for longer ordinary worker/analysis work with an actual candidate channel and ordinary event
   wait. Workers never load it; their compact handoff supplies the actual tool, parent address and
   checkpoint instruction, and they check their own actual tool and supplied address before sending.
   Keep overview ownership in `goal-completion` and
   terminal handling in `completion-protocol`; refer to them instead of copying their rules.
4. **Bound reporting cost.** The orchestrator's assignment already supplies the initial phase;
   workers send no acknowledgement. During longer eligible work, send at most one meaningful
   checkpoint of at most 20 words: phase, observed result and next action. Coalesce smaller steps
   and continue productive work without an acknowledgement wait. Short tasks send no checkpoint.
   An idle parent integrates the message into its existing overview and resumes ordinary waiting;
   a busy parent queues/coalesces it until a natural boundary. No periodic or immediate guarantee
   applies, especially during a single blocking call.
5. **Prefer evidence over apparent precision.** Show an ETA only when the underlying running
   operation supplies a credible remaining-time estimate; label its source and scope, and retract
   stale estimates. Do not derive a deadline from elapsed time, token use, model tier, or phase
   number. No new estimator is in scope.
6. **Use counts before percentages.** A fixed, comparable workload can report completed units over
   its known total. Percentages are optional and scoped to those units. Unequal phases, an unknown
   denominator, a changing scope, or completed reviewers do not establish overall effort or time
   percentage. Otherwise show the current phase and next action. Never average parallel workers'
   percentages or add their ETAs into an overall estimate.
7. **Treat progress as advisory.** A report carries worker identity from the native channel, its
   current phase, a short observed outcome and next action; counts and ETA are optional. Missing
   metrics are omitted. Reports carry no authority to widen scope, approve actions, start children,
   or satisfy completion. No persistent schema or parser service is needed.
8. **Preserve harness and leaf boundaries.** Shared prose stays harness-neutral. Native Claude
   workers keep their current allowlists: do not grant unrestricted `SendMessage` solely for this
   feature. It can resume other agents, so a parent-only instruction would not preserve the current
   tool boundary. The first iteration therefore uses the phase fallback for these Claude workers;
   a future restricted parent-only channel can be evaluated separately. Hosts already exposing
   native messaging keep their existing permissions and receive a parent-only reporting instruction.
   They must not message siblings, broadcast, discover independent sessions or resume unrelated work;
   this recipient policy is instructed, not a new enforced sandbox. `Agent`/`Task` exclusions remain.

## Affected files

| File                                                                                   | Description                                                                                         |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/shared/subagent-progress.md`                                                      | New lazy contract for evidence, sparse reporting, transport fallback and aggregation.               |
| `src/shared/delegation-mandate.md`                                                     | Minimal lazy entry point and handoff reference; retain eager mandate and leaf contract.             |
| `src/shared/goal-completion.md`                                                        | Relate accepted reports to the existing single overview and phase updates.                          |
| `src/shared/completion-protocol.md`                                                    | Clarify that intermediate reports do not enter terminal result handling, if needed.                 |
| `src/agents/*.md`                                                                      | Verify lazy-contract reachability and preserve current Claude tool permissions.                     |
| `build.mjs`, `build-lib.mjs`                                                           | Only if required by measured context budgets or native rendering; no message runtime.               |
| `test/delegation-mandate-contract.test.mjs`, `test/workflow-contracts.test.mjs`        | Contract invariants for lazy loading, leaf boundaries, terminal separation and target behavior.     |
| `docs/developer-guide/architecture.md`, `docs/developer-guide/build-system.md`         | Document actual host mechanisms, limitations and context cost in the relevant existing sections.    |
| `docs/developer-guide/skill-ownership.json`, `docs/developer-guide/skill-ownership.md` | Reconcile the new orchestration fragment with the existing ownership classification where required. |

## Implementation details

### Approach

1. **Prove the return path before enabling it.** Inspect each target's current native tools and
   permissions, then conduct a bounded smoke run in an isolated execution context: a worker sends
   an intermediate message, continues useful work, and later returns its terminal result. Verify
   that the parent sees the message before completion and can keep working or waiting. Include
   one host without a return channel. If foreground waiting prevents useful intermediate display,
   keep that mode on the phase fallback; do not change scheduling or enable agent teams solely
   for progress. Do not grant new broad tools for this proof. Record each tested supported shape
   and its evidence for the eligibility table; targets lacking useful delivery keep the fallback.
2. **Implement the shared contract once.** Add the lazy fragment, its narrow handoff entry point,
   parent address/capability information and progress-versus-terminal distinction. The orchestrator
   associates reports with its own running assignments; late reports from a finished/replaced
   worker are ignored. Combine simultaneous updates into a concise overview rather than echoing
   every message. Existing output-language and single-owner rules remain authoritative. Do not add
   progress fields to workflow dispatches, strict control-line formats or delegation envelopes.
3. **Connect only supported transports.** Codex and portable handoffs use only their actual native
   parent channel after the observed ordinary-wait eligibility checks. The user accepts the
   recorded checkpoint overhead; the old 10% gate no longer blocks activation. Claude workers
   retain their existing permissions and phase fallback. Missing/denied messaging degrades once
   to the known phase without retry loops or failure of the underlying task. Reporting never
   requires a worker to wait for acknowledgement.
4. **Verify contracts and benefit.** Add focused assertions for the invariants below, inspect all
   generated targets and execute the representative smoke cases. Record the cost comparison and
   its timing scope and limitations under the accepted tradeoff; do not relabel a failed historical
   cost result as passing or generalize a single smoke into a reliability guarantee.
5. **Reconcile build and evidence obligations.** Measure the built eager-core sizes using
   `node build.mjs`, retain existing ratchets and at most ten lines of headroom, and document any
   necessary budget adjustment. Reconcile ownership and existing guide sections. Run CI's source
   checks and each affected eval verifier; re-record affected suites before the next release as
   their READMEs require. Do not create a new behavioral-eval framework for this feature.

### Edge cases

- A worker is inside one long tool call: show the last confirmed phase or known external wait;
  no claim of continuous monitoring or an exact heartbeat.
- Several workers report together: show relevant phase/count changes once; do not imply that
  worker completion means integration, review or delivery is already complete.
- No meaningful change: stay quiet. A user status request receives the last known state and
  uncertainty; it does not trigger a polling loop.
- A changing workload invalidates the denominator: replace it with a new scoped count or phase;
  explicitly correct earlier figures instead of preserving a misleading monotonic percentage.
- Duplicate, late or post-cancellation messages: do not reopen a task or overwrite a newer state.
- Report text contains a completion keyword or approval claim: it remains advisory channel content,
  never a terminal result or user consent. Existing final-response validation still runs.
- Child orchestration is delegated: keep the existing assigned-phase/completion fallback across
  that workflow boundary. No new envelope fields or nested progress relay is introduced; the
  delegated orchestrator still awaits its children before returning as already required.

### Out of scope

Host UI changes, independent user-owned chats, scheduled automations, a new progress store,
mandatory ETA/percentage fields, model-duration prediction, changes to execution-profile pilot
records, tracker writes, new dependencies, unrelated portable-bootstrap cleanup, and changes to
the workflow's authorization, completion or retry policy. Strict workflow-to-workflow dispatch,
delegation-envelope extensions and nested progress forwarding are outside this iteration.

## Acceptance criteria

- [x] One addressed ordinary worker delivered a useful checkpoint before its terminal result
      while its parent was in an ordinary event wait; the parent integrated it into the existing
      overview once and resumed waiting. This demonstrates possibility for that shape only.
- [x] Only the active overview owner loads the detailed contract. The handoff supplies the actual
      tool and parent address; the worker checks both and sends at most one meaningful checkpoint
      of at most 20 words containing phase, observed result and next action, without acknowledgement.
- [x] An idle parent integrates and resumes ordinary waiting; a busy parent queues/coalesces until
      a natural work boundary. No immediate or periodic delivery is promised during blocking work.
- [x] A short task requires no extra status call. No reporting path adds timers, polling,
      transcript reads, status files, progress-only agents or acknowledgement waits.
- [x] Missing transport, denied messaging and blocking foreground execution retain an honest
      phase fallback; missing progress never fails or restarts productive work.
- [x] ETA appears only with a named external source and scope. Unknown estimates are omitted;
      phase numbers and elapsed time never generate an ETA or an overall percentage.
- [x] A fixed comparable batch can show a scoped count/percentage; unknown/changing denominators
      and parallel unequal work use counts or phases without fabricated overall completion.
- [x] Intermediate reports do not complete tasks, trigger missing-keyword recovery, grant approval
      or create a second overview. Terminal results retain their checks; smoke runs verify compliance
      with the instructed recipient policy without claiming enforced per-recipient tool isolation.
- [x] Native Claude workers retain the leaf tool exclusions; shared and portable instructions
      contain no Claude-specific transport assumption. Every target documents its fallback.
- [x] Bounded cost evidence is recorded with its timing scope and limitations. The user's
      2026-10-23 acceptance of overhead above 10% supersedes the original cost gate; no historical
      failed measurement is claimed as passing.
- [x] Eligibility requires a matching enabled channel-contract row, available parent and worker
      addressed channels, observed pre-completion delivery during an ordinary event wait and
      bounded cost evidence under the accepted tradeoff; unproven modes or incompatible
      channels use the fallback. Host-version metadata is optional and never actively probed.
      No Claude role receives broader messaging permissions as part of this feature.
- [x] Direct reports cover ordinary worker/analysis handoffs from the overview owner only;
      whole workflow delegations retain existing formats and phase fallback without new fields.
- [x] Activation checks pass in CI's prescribed order; build budgets and ownership checks pass without
      editing generated `dist/`. Affected behavioral evidence is identified for release upkeep.

The direct-reporting criterion is supported by the fresh ordinary-wait smoke described below.
Checked metric and edge-case criteria describe contract invariants, not exhaustive runtime coverage.
Independent activation checks and review passed for the current source/test snapshot. Their
results are recorded separately below; the initial delivery checks remain historical evidence.

## Validation plan

- Run targeted contract tests with `node --test test/delegation-mandate-contract.test.mjs
test/workflow-contracts.test.mjs`; add only invariants that static tests can actually establish.
  Static prose matching does not establish message delivery, latency or runtime overhead.
- Verify the addressed ordinary-wait path with one ordinary leaf: a meaningful checkpoint arrives
  before the terminal result, the parent integrates it into its existing overview and resumes the
  ordinary wait, and the worker continues useful work without loading the detailed contract.
  Record actual capability and observed behavior; do not infer support from model, tier, inventory,
  parent-only tools or an installed CLI version. Keep missing/denied/unverified paths on fallback
  and native Claude allowlists unchanged.
- Check advisory/terminal separation, native sender association, stale/duplicate handling, short-task
  silence and fallback in focused contract tests. Static matches establish only those invariants;
  do not claim runtime coverage for every ETA, denominator, blocker or unavailable-channel case.
- Preserve the existing paired cost evidence and the five counterbalanced short-workload pairs.
  Distinguish coarse parent-observed time from native worker duration and transport latency.
  The 10% threshold was the original rollout condition and was explicitly superseded on
  2026-10-23; no new benchmark is required or authorized for activation. Report overhead and
  workload limits without claiming a formal cost pass or comparing different workloads as an
  improvement. Short production tasks still add zero status calls.
- Run `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution` in that order.
  Inspect Claude sidecars, Codex role variants and portable workers for permission/contract parity.
- Compare `pnpm eval merge-gate verify`, `pnpm eval iterate verify` and
  `pnpm eval next-steps verify` before/after. New lazy pointers may enter derived load sets even
  when a particular run never opens them; follow each suite's recording requirements before release.
- Keep initial planning and delivery results dated separately from activation results. Record
  fresh full-check counts only after the independent validator supplies them.

## Assumptions and open points

- Phase-only visibility remains useful when the actual channel or execution shape is ineligible.
  It must remain honest about which state was observed and which was only assigned.
- The user accepts the recorded overhead above 10% and busy-parent delay. A lack of evidence
  still never justifies a zero-overhead claim or default enabling for an unverified execution shape.
- Effective Flow owns this orchestration contract. Existing Effective Delivery ownership remains;
  no domain craft playbook is duplicated into the new fragment.

## Plan review

**Result:** Approved

Effective Delivery supplied independent read-only judgment for gap analysis and final plan review.
The gap analysis found one Important item and one Note, both incorporated below. The internal
review found no further issues. Deep interactive review then found two Important items and one
Note; direct fixes and the user's scope decision are recorded below. No blocking item remains.
At this initial planning review, runtime delivery and overhead remained implementation-time
checks. The later user decision above supersedes its 10% cost gate.

The scorecard passes clarity, measurable verification, verified context, overall purpose, no-code
scope, code frugality and workflow fit; documentation-only target fields are not applicable.

### Summary

Counts include the incorporated gap-analysis and deep-review items; none remains blocking.

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         0 |    1 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    1 |

### Gap analysis, 2026-10-23

- **Rollout/default behavior, Important:** capability detection alone did not establish eligibility
  after a failed or absent cost check. Incorporated a shipped support table with explicit matching
  rules, evidence pointers and conservative handling of unknown hosts and versions.
- **Permission/leaf guarantee, Note:** unrestricted Claude messaging would weaken a tool boundary,
  and a smoke run cannot prove recipient isolation. Incorporated the smaller first iteration:
  preserve Claude permissions and use the phase fallback; describe existing native recipient policy
  accurately as an instruction and verify compliant behavior without claiming sandbox enforcement.

### Internal plan review, 2026-10-23

No additional findings. Checked the persisted plan against the shared orchestration contracts,
Claude permissions, build boundaries and existing validation paths. No implementation or runtime
performance claim was inferred from static evidence.

### Deep interactive review, 2026-10-23

- **Architecture, Important:** ordinary handoffs and strict workflow dispatches cannot share added
  progress fields without extending the dispatch contracts. The user selected ordinary workers
  and analysis sub-sessions only. Incorporated into scope, implementation steps, edge cases and
  acceptance criteria; whole workflows retain their existing phase/completion fallback.
- **Testability, Important:** disabled workers would otherwise load additional instructions with
  no new information, outside the proposed cost test. Incorporated an explicit enabled-handoff
  trigger for workers and a comparison against current behavior that includes contract loading,
  eligibility lookup and long tasks on fallback targets.
- **Maintainability, Note:** messaging capability does not establish running-host identity.
  Incorporated an authoritative identity source per support row and fallback before direct-path
  work where that identity is unavailable. Installed CLI versions are not a substitute.

## Open points

- No open points.

## Implementation outcome

### Activated ordinary-wait slice, 2026-10-23

The current source enables one compact checkpoint for eligible longer ordinary worker and analysis
handoffs issued by the active overview owner. Eligibility uses actual addressed native tools at
both ends and observed useful delivery before terminal completion during an ordinary parent event
wait. The user explicitly accepts measured overhead above 10% and delayed delivery while the
parent is busy; the original readiness gate is superseded.

- Only the overview owner loads `subagent-progress`; workers receive the compact instruction,
  check their actual tool and supplied parent address, and send at most one meaningful checkpoint
  of at most 20 words containing phase, observed result and next action. Short tasks send none;
  no acknowledgement, detail-contract read, timer, poll, transcript read, status store or extra agent
  is introduced. Native Claude permissions and leaf boundaries remain unchanged.
- An idle owner integrates the checkpoint into the existing overview then resumes ordinary waiting;
  a busy owner queues/coalesces until a natural boundary. Native sender, stale/duplicate, advisory,
  terminal, authority and fallback rules remain in force. ETA and count honesty remain unchanged.
- The fresh source smoke used one ordinary native leaf (`gpt-6.1-sol`/`high`): it read the mandate
  and goal-completion sources, sent exactly one meaningful checkpoint of at most 20 German words,
  then read the completion protocol and baseline script and returned `DONE`. The parent was in an
  ordinary event wait, received and visibly integrated the checkpoint before terminal completion,
  and resumed waiting. There was no worker detail-contract read, acknowledgement, poll, clock,
  write or extra agent. No timings were collected. This establishes possibility for that addressed
  shape only, not host-wide support or reliable timing.
- Historical coarse parent-observed median paired overhead remains **+28.0839%**, failing the old
  10% gate; native worker-duration reconciliation of those pairs is **+12.2315%**. Five later
  counterbalanced short pairs with exactly two reads in each variant, three model responses in
  controls and four in reporting, adding one message of at most 20 words, give median paired
  worker overhead **+18.2861%** and median absolute
  difference **3,397 ms**. Different workloads establish no 28%-to-18% improvement or formal cost
  pass. The [architecture guide](../../developer-guide/architecture.md#paired-cost-evidence)
  preserves the historical table, timing-scope reconciliation and separate ordinary-wait timing.
- The baseline comparator adds only the exact declared compact-checkpoint replacement. Unique-edit
  matching and byte equality contain allowed deltas; optional delta matching is not proof of a
  total migration. Technical docs reflect activation and the accepted tradeoff. In-code/CLI,
  user documentation/README and AGENTS have no affected surface; Effective Flow still owns the
  orchestration, with no duplicated central domain playbook or new ownership relationship.

Whole workflow delegation, strict dispatch and nested relay remain outside this slice under
[#587](https://github.com/sebastian-software/effective-flow/issues/587). The plan's implemented
status and archived location are preserved. Independent validation and deep review passed for
this activation slice without fixes or residual findings; the initial checks below remain historical.

### Historical initial fallback outcome, 2026-10-23

The following records the initial delivery before the user superseded the cost gate.

Delivered on 2026-10-23 as a guarded, disabled direct-reporting contract with the known-phase
fallback. This is the conditional fallback outcome, not a successful live-reporting rollout.
The user-approved channel-and-behavior gate replaced mandatory host-version discovery; the
10% cost gate and ordinary-worker scope were preserved.

- Added `src/shared/subagent-progress.md` as the single lazy contract owner. A canonical
  conditional load pointer in `delegation-mandate` keeps both runtime and eval-load reachability;
  the mandate remains 16 lines. `goal-completion` folds accepted reports into its one overview,
  and `completion-protocol` separates advisory messages from terminal results.
- The contract requires actual tools at both ends, observed pre-completion delivery and passing
  cost evidence before an ordinary handoff can enable reporting. Native Claude permissions,
  workflow dispatches, envelopes, scheduling and leaf boundaries remain unchanged. No new runtime
  service, command, setting, dependency or estimator was introduced.
- Five fixed interleaved paired runs used the same `gpt-6.1-sol`/`high` model/effort and frozen
  input. Every reporting run sent exactly one useful parent-only update before completion and
  continued useful work; controls sent none. Median paired parent-observed wall-time overhead
  was **+28.0839%**, exceeding **10%**. Therefore the direct channel row is explicitly disabled.
  The architecture guide records each pair and the method. Tokens were unavailable; noisy
  parent-observed wall time is not causal model time or a statistical performance guarantee.
- The short baseline/current controls and a long fallback control loaded no detailed progress
  contract and sent zero parent status messages. These are qualitative observations only:
  the baseline needed a terminal-protocol resume and the long response language differed, so
  neither supports a matched timing claim. One standard-worker invocation lacked a return tool;
  this is an invocation-specific fallback observation, not a universal model claim.
- Focused invariants cover lazy entry, metrics, authority and terminal boundaries. Narrow
  integration changes in `scripts/compare-native-agent-baseline.mjs` and its tests allow only
  the exact new mandate delta; unrelated drift remains rejected. Explicit non-spawn mentions
  avoid false model-tier inventory candidates. A worker-only/tool-seed regression protects the
  static load graph. No generated `dist/` file was edited or committed.
- Technical documentation was updated in `architecture.md` and `build-system.md`. In-code/CLI,
  user documentation/README and AGENTS have no affected surface; no new central-skill ownership
  relationship required manifest changes.

At that initial checkpoint, activation still required a passing cost result and runtime checks.
The later user decision supersedes the cost gate and the fresh smoke establishes the bounded
ordinary-wait path. Richer runtime metric coverage and other hosts remain unproven; #587 remains
open for broader sub-agent and delegated-workflow coverage.

## Test results

### Activation validation, 2026-10-23

Independent validation passed CI's prescribed order on the activation source/test snapshot:

| Check                    | Result                                                                         |
| ------------------------ | ------------------------------------------------------------------------------ |
| `pnpm agent:check`       | Passed; 1,027 files formatted correctly.                                       |
| `pnpm test`              | 2,969 total, 2,968 passed, 0 failed, 1 known filesystem skip (`EILSEQ`).       |
| `node build.mjs`         | Passed; all three targets and all context/ownership budgets, without warnings. |
| `pnpm test:distribution` | Passed; offline distribution smoke.                                            |

Focused checks passed 47/47 and `git diff --check` passed. The actual native-agent baseline at
`2a47de0` accepted only the exact compact-checkpoint delta; the older `6055c94` baseline and negative
drift guards remain covered. Validation introduced no tracked source changes. The fresh source
smoke already recorded above demonstrates the addressed ordinary-wait possibility; it collected
no timings and establishes no reliability guarantee. Independent deep review passed without fixes
or residual findings on the same source/test snapshot.

All three eval verifiers exited successfully, but behavioral evidence remains **stale**:
`merge-gate` 8 scenarios × 5 recorded runs, `iterate` 7 × 5 and `next-steps` 11 × 5. These suites
were already stale before the feature. Affected recordings are due before release, not before
merge; no fresh model round or formal cost pass is claimed.

### Historical initial delivery validation, 2026-10-23

Independent validation of the initial fallback snapshot passed CI's required order:

| Check                    | Result                                                                   |
| ------------------------ | ------------------------------------------------------------------------ |
| `pnpm agent:check`       | Passed; 1,027 files formatted correctly.                                 |
| `pnpm test`              | 2,967 total, 2,966 passed, 0 failed, 1 known filesystem skip (`EILSEQ`). |
| `node build.mjs`         | Passed; all three targets, role parity, ownership and context budgets.   |
| `pnpm test:distribution` | Passed; offline distribution smoke.                                      |

The initial validator found two guard-integration failures, both corrected through the Quality
implementer before rerunning the full chain. The correction also repaired canonical deferred-load
recognition, without increasing budgets or relaxing unrelated baseline guards. Focused correction
tests passed 45/45. Review's final targeted checks and `git diff --check` passed.

All three eval verifier commands completed, but their behavioral evidence remains **stale**:
`merge-gate` 8/8 scenarios, `iterate` 7/7, `next-steps` 11/11, with five stale recorded runs per
scenario. The same scenario counts were stale before implementation. New deferred-load inputs
are identified correctly; no fresh behavioral round is claimed. Per AGENTS, affected suites owe
new recordings before the next release, not as a prerequisite to this merge.

Final independent reconciliation passed `pnpm agent:check`, `git diff --check` and
`node --test test/plan-lint.test.mjs` (62/62). The source/test snapshot matched the prior full
validation. Completion and archival are approved only for the guarded fallback slice.

## Review findings

**Date:** 2026-10-23
**Reviewer:** Independent code-validator (deep tooling/documentation review, all severities)

### Activation review, 2026-10-23

No findings found. Critical 0, Important 0, Note 0; complexity Low 0, Medium 0, High 0.
The independent deep review accepted the narrow ordinary-wait activation, advisory/terminal and
authority boundaries, fallback, explicit cost decision, documentation, ownership and exact baseline
guards. The reviewed source/test snapshot matched full validation. No fixes or residual findings
remain, and no separate review report is needed. This approval establishes neither a historical
cost pass nor broader host or workflow support.

### Historical initial fallback review, 2026-10-23

No findings found. Critical 0, Important 0, Note 0; complexity Low 0, Medium 0, High 0.
The initial review explicitly approved only disabled-contract/fallback delivery after required
checks and plan reconciliation. No residual finding report or publication was needed.
