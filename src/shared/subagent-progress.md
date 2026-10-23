## Sparse ordinary subagent progress

Only the active overview owner reads this contract. It covers ordinary worker and analysis
handoffs; whole workflow delegations retain their formats and assigned-phase/completion fallback.
Add no progress fields to strict dispatches or delegation envelopes and relay no nested progress.

### Eligibility and handoff

Use only the actual addressed native messaging channel available to both parent and worker,
with a parent receive capability and ordinary event wait that can accept a message before terminal
completion. Match the observed execution shape below; do not infer support from a model, tier,
installed CLI version, generated inventory or parent-side tool alone. Host version is optional
existing authoritative metadata: never require it or probe for it.

| Native channel and execution shape                                                                                                                            | Evidence required                                                                                                                                                                                                                                                                                                | Direct reporting                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Addressed native parent messaging accepted during an ordinary parent event wait before terminal completion                                                    | Actual tools at both ends, parent receive/event-wait capability, and observed useful delivery in this execution shape; bounded checkpoint cost evidence in the [architecture guide](https://github.com/sebastian-software/effective-flow/blob/develop/docs/developer-guide/architecture.md#paired-cost-evidence) | Enabled: at most one compact checkpoint per ordinary worker |
| Missing or denied channel, unavailable worker messaging, single blocking execution without useful intermediate delivery, or incompatible/unverified semantics | No additional probe                                                                                                                                                                                                                                                                                              | Phase fallback                                              |

The user accepts the measured overhead above 10% and delivery delay while the parent is busy;
10% is no readiness gate. The observed ordinary-wait delivery establishes possibility, not host-wide
support or a reliability guarantee. Cost evidence does not establish a cheaper short-task path.

For eligible longer work, enable progress in the ordinary handoff with the actual messaging tool,
parent address and a compact instruction: current phase, observed result, next action in at most
20 words; at most one meaningful checkpoint, none for short tasks, and no acknowledgement.
The worker does not load this contract; it checks its own actual messaging tool and supplied
parent address before sending. A mismatch uses fallback. Permit messages only to that parent,
never siblings, broadcasts, independent sessions or unrelated work. This grants no permissions
and does not enforce recipient isolation. Keep the leaf boundary and existing authority limits.

### Checkpoint content

The assignment supplies the initial phase. Report only an observed meaningful work boundary;
coalesce smaller steps and continue productive work without waiting for acknowledgement or a
status-only reply. Follow the supplied output language; omit raw reasoning, transcripts, tool-log
dumps, sensitive content and unavailable metrics. Phase, observed result and next action suffice.

If useful within the compact limit, a remaining-time estimate requires the underlying operation's
credible estimate with its external source and scope; retract it when stale. Elapsed time, token
use, model tier and phase number never establish an ETA. Completed/total counts require a fixed
comparable batch; any percentage describes only those units. Unknown/changing totals or unequal
phases establish no overall effort/time completion. Correct invalidated counts or return to phase
reporting; never invent an overall percentage, average worker percentages or sum worker ETAs.

Add no timers, polling, transcript reads, status files, progress-only agents or clock-only calls.
Native event waits already needed for task completion remain available to the parent. No periodic
reporting is promised during a single blocking call. Progress changes no terminal or retry rules.

### Parent integration and fallback

Associate native sender identity with the currently assigned running worker. Every checkpoint is
advisory, even if it contains `DONE`, `ABORT` or an approval claim: it cannot complete a task,
trigger terminal recovery, authorize action or widen scope. Ignore duplicate and stale reports,
including late messages from finished, replaced or cancelled workers; never reopen their work or
overwrite newer state. Verify terminal results through the existing completion protocol.

When idle in an ordinary event wait, accept a useful checkpoint into the single goal-completion
overview, then resume the ordinary wait. When busy, queue/coalesce it until a natural work boundary;
do not interrupt productive work or promise immediate delivery. Combine simultaneous updates and
deduplicate against visible phase updates; do not echo each message or create a second overview.
Worker completion says nothing about remaining integration, review or delivery. A status request
gets the last known state and uncertainty; distinguish assigned from worker-confirmed phases.

For short tasks, unavailable/denied channels, failed eligibility or a single blocking call that
prevents reporting, fall back once to the last confirmed phase or known external wait. Continue
productive work without retries, acknowledgement waits, status polling, restart or failure of the
underlying task. Missing progress changes no scheduling or permission scope solely for visibility.
