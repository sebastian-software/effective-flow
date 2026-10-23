# Sparse subagent progress reporting

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Make long delegated work easier to follow from the main session without materially slowing it
down. Workers should report meaningful progress through an existing parent-message capability;
the orchestrator folds those reports into its existing overview. The requested preference is a
credible remaining-time estimate, otherwise measurable progress, otherwise the current phase.
Availability and evidence govern which information can actually be shown.

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
   The new fragment holds one small, canonical eligibility table: tested host family and version
   or explicitly verified version range, native channel contract, execution mode, reporting enabled
   or phase fallback, and a pointer to the validation evidence in the architecture guide. Only a
   matching enabled row plus an available channel permits a reporting handoff. Unknown identity,
   an unlisted version or incompatible channel semantics select the phase fallback. This is shipped
   support policy, not a runtime registry, active probe, user setting or new state store.
   Each proposed enabled row names its authoritative identity source: metadata supplied by the
   running host or an already available native session capability. If family/version/mode cannot
   be established from that source, classify it as fallback before implementation or performance
   runs for direct reporting. An installed CLI version and generated agent inventories do not prove
   which host serves the current session; no extra identity probe is introduced for this feature.
3. **Keep one contract owner.** Add a short lazy pointer at the ordinary worker/analysis handoff
   seam owned by `delegation-mandate` and put the
   detailed contract in `src/shared/subagent-progress.md`. The orchestrator loads it only for long
   or multi-stage work with an actual candidate channel; a worker loads it only when its handoff
   explicitly enables reporting after eligibility checks. Known fallback workers never load it.
   Keep overview ownership in `goal-completion` and
   terminal handling in `completion-protocol`; refer to them instead of copying their rules.
4. **Bound reporting cost.** The orchestrator's assignment already supplies the initial phase;
   workers need no separate acknowledgement. Send at most one report per meaningful phase or
   work-unit boundary, coalesce small steps, and aim for no more than one non-blocker update per
   minute when timestamps are already available. This is best effort, never a timer guarantee.
   Short tasks normally return only their final result. A material blocker is reported promptly.
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
   parent channel after the support-table and cost checks pass. Claude workers retain their existing
   permissions and phase fallback. Missing/denied messaging degrades once to the known phase without retry loops or
   failure of the underlying task. Reporting never requires a worker to wait for acknowledgement.
4. **Verify contracts and benefit.** Add focused assertions for the invariants below, inspect all
   generated targets and execute the representative smoke cases. Record the cost comparison and
   whether it passes the rollout condition before treating the feature as ready.
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

- [ ] A supported long-running worker can deliver a useful intermediate phase/outcome report to
      its parent before the terminal result; the parent updates the existing overview once.
- [ ] A short task requires no extra status call. No reporting path adds timers, polling,
      transcript reads, status files, progress-only agents or acknowledgement waits.
- [ ] Missing transport, denied messaging and blocking foreground execution retain an honest
      phase fallback; missing progress never fails or restarts productive work.
- [ ] ETA appears only with a named external source and scope. Unknown estimates are omitted;
      phase numbers and elapsed time never generate an ETA or an overall percentage.
- [ ] A fixed comparable batch can show a scoped count/percentage; unknown/changing denominators
      and parallel unequal work use counts or phases without fabricated overall completion.
- [ ] Intermediate reports do not complete tasks, trigger missing-keyword recovery, grant approval
      or create a second overview. Terminal results retain their checks; smoke runs verify compliance
      with the instructed recipient policy without claiming enforced per-recipient tool isolation.
- [ ] Native Claude workers retain the leaf tool exclusions; shared and portable instructions
      contain no Claude-specific transport assumption. Every target documents its fallback.
- [ ] Representative paired runs demonstrate a useful pre-completion update and meet the cost
      gate below. If a target fails, its direct reporting stays disabled in the delivered behavior.
- [ ] Eligibility requires a matching enabled support-table row and an available native channel;
      unknown host/version, unlisted execution modes and incompatible contracts use the fallback.
      No Claude role receives broader messaging permissions as part of this feature.
- [ ] Direct reports cover ordinary worker/analysis handoffs from the overview owner only;
      whole workflow delegations retain existing formats and phase fallback without new fields.
- [ ] CI's checks pass in the prescribed order; build budgets and ownership checks pass without
      editing generated `dist/`. Affected behavioral evidence is identified for release upkeep.

## Validation plan

- Run targeted contract tests with `node --test test/delegation-mandate-contract.test.mjs
test/workflow-contracts.test.mjs`; add only invariants that static tests can actually establish.
  Static prose matching does not establish message delivery, latency or runtime overhead.
- In a native Codex host and a portable host proposed for direct reporting, observe intermediate
  delivery, unchanged-state silence, a blocker, terminal completion and missing-channel fallback.
  Verify the Claude phase-only path with unchanged allowlists. Record tested versions/capabilities
  and mirror only the support eligibility into the canonical table; untested targets stay on fallback.
- Include unknown ETA, fixed comparable units, unequal phases, changed denominator and stale
  worker messages in those bounded behavioral checks; inspect both parent-visible output and calls.
- Compare the complete proposed behavior against the current behavior, including eligibility lookup,
  contract loading and phase fallback, not just message calls. Cover each direct-reporting target
  and a long task on a disabled target, plus a short-task control, with identical model/effort and tool
  permissions except the message capability. Use at least five interleaved paired runs; record
  wall time, tokens where available, added status calls and useful visible updates. Proposed
  readiness threshold: median extra wall time at most 10%, zero extra status calls for the short
  control, and no duplicate/unchanged-state chatter. This threshold operationalizes "no material
  slowdown"; it is a rollout condition, not an existing measurement or statistical guarantee.
  Inconclusive/noisy results keep direct reporting off for that target rather than asserting success.
  A fallback-path regression requires reducing its added loading cost before delivery.
- Run `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution` in that order.
  Inspect Claude sidecars, Codex role variants and portable workers for permission/contract parity.
- Compare `pnpm eval merge-gate verify`, `pnpm eval iterate verify` and
  `pnpm eval next-steps verify` before/after. New lazy pointers may enter derived load sets even
  when a particular run never opens them; follow each suite's recording requirements before release.
- During this planning run, format and lint only this plan; no implementation tests are claimed.

## Assumptions and open points

- Phase-only visibility is useful when richer reporting cannot meet the user's cost constraint.
  It must remain honest about which state was observed and which was only assigned.
- The 10% median cost budget is a conservative planning choice, subject to actual paired evidence.
  A lack of evidence never justifies a zero-overhead claim or default enabling for an untested host.
- Effective Flow owns this orchestration contract. Existing Effective Delivery ownership remains;
  no domain craft playbook is duplicated into the new fragment.

## Plan review

**Result:** Approved

Effective Delivery supplied independent read-only judgment for gap analysis and final plan review.
The gap analysis found one Important item and one Note, both incorporated below. The internal
review found no further issues. Deep interactive review then found two Important items and one
Note; direct fixes and the user's scope decision are recorded below. No blocking item remains.
Runtime delivery and overhead remain implementation-time gates.

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
