# T3 `delegate_task` as a delegation transport

## Status

Active

Decided on 2026-11-28 for the slice `child-02` of #832 (issue #835); decision 8 was added on re-entry
the same day. The transport contract ships dormant: no spawn site or preflight names it yet, and
`child-03` of #832 activates it. Issue Buddy's use of it (`child-04`, #837) references the contract
without changing it.

## Context

On T3 Code with the native multi-agent tools disabled or forbidden, every delegating tool falls back
inline or stops; Issue Buddy and Autopilot are the visible cases. T3 Code offers `delegate_task`, a
tool that starts a child task on a chosen provider instance and model, and
`orchestrator_capabilities`, which lists the provider instances, models and options the host offers.

The #834 acceptance runs recorded how `delegate_task` behaves, in
[T3 delegation transport acceptance](../developer-guide/t3-delegation-transport-acceptance.md). The
confirmation run of 2026-11-27 proved that `delegate_task` with `mode: async` wakes a top-level
parent after its turn ends, which makes a bounded transport viable.

Before this decision, [`model-selection`](../../src/shared/model-selection.md) classified a
delegation through `delegate_task` as "neither" a Claude nor a Codex spawn and left it without
settings. The executable helper had no way to resolve a model and effort for it, and the harness
rule ("the harness comes only from the parameter shape of the spawn tool") left no room for a tool
that takes a provider instance and a catalog ID.

## Decision

[`src/shared/t3-delegation-transport.md`](../../src/shared/t3-delegation-transport.md) owns the
contract once. `model-selection select` gains a `transport: "t3-delegate"` path that resolves the
spawn settings for it. The contract applies only where a spawn site or preflight names it, carries
worker leaves only, and is dormant in this slice.

### Maintainer decisions

1. **Pin location.** The T3 catalog IDs of the Claude aliases live only in the portable target's
   `scripts/model-selection-contract.json`, as `t3Pins`. The native Claude and Codex contracts stay
   byte-identical to their previous form. `T3_MODEL_PINS` in `build.mjs` is the one source; Codex
   model IDs are T3 catalog IDs already and pass through unchanged.
2. **Eligibility.** The new fragment owns eligibility once and stays dormant until a spawn site or
   preflight names it. The host is T3 Code by the identity rule of
   [`host-pr-watch`](../../src/shared/host-pr-watch.md), no native spawn tool is available or
   permitted, and "not permitted" means a user or instruction-file rule that names the native
   mechanism. `host-pr-watch` widens its `Host: t3-code` exception to an orchestrator started
   through the transport, within the scope of decision 8; the exception never makes a transport
   child eligible to dispatch.
3. **Capabilities input.** The orchestrator passes a bounded projection of
   `orchestrator_capabilities` (the inherited provider instance, the providers' instances and
   drivers, the models with their option IDs and offered values), never the raw envelope. The
   projection is bounded per field and in total (32 KiB), which leaves room for the echoed selection
   in a later `verify`. The test fixtures are synthetic; a verbatim recorded envelope may follow from
   #834.
4. **Forge writes.** A child's forge writes are an uncovered residual risk, recorded below. The brief
   forbids the forge tools explicitly.
5. **Option inheritance.** Which options a child inherits from its parent beyond the set the helper
   returns is unverified, and the evidence limits below say so. `interactionMode: "default"` is set
   explicitly, so the child does not depend on an inherited mode.
6. **Model compliance.** The fragment compares `executedModel` and `options` from the one
   `task_status` read with the dispatched target. A contradiction is `MODEL_MISMATCH`; a match stays
   `unverified`, because `verify` on a transport selection always returns `UNVERIFIED`.
7. **Fallback.** An unnamed handoff with `fallback` and `reason` is accepted under the transport,
   as in plain `select`.
8. **Transport-started orchestrators.** This slice carries worker leaves only. The widened
   `host-pr-watch` exception grants exactly the T3 wait path: such an orchestrator never watches
   and links nothing, and its caller links. Handing off a whole workflow through the transport is
   defined by `child-03`.

### Scope: portable target only, enforced by the validator

Only the portable build can delegate through T3 Code, so only its contract carries `t3Pins`. The
contract validator requires `t3Pins` exactly on a `portable` contract and rejects it on a native
contract. Keys must be exactly the Claude aliases that `MODEL_TIER_MAPPINGS` and
`PANEL_MODEL_ALLOWLIST` use, and values must be bounded catalog-ID tokens. A build guard derives the
alias set, so a missing pin and a pin no alias uses both fail the build. The pinned IDs join the
provider-name guard lists, so no shipped prose may name one. On a native build the helper's
transport path always returns `TRANSPORT_UNAVAILABLE` with the reason `no-t3-pins`.

The new fragment itself ships dormant to all three targets as a lazy fragment: the text carries no
model name or catalog ID, so shipping it everywhere changes no native behaviour.

### Transport selection is a separate path, not a harness classification

The rule that the harness comes only from the spawn tool's parameter shape stays intact. T3
`delegate_task` is no spawn tool and never a Fast spawn. Selecting the transport is an explicit
request (`transport: "t3-delegate"`), and it rejects `harness`, `native` and `fast` as
`INVALID_INPUT`. The helper then derives the harness from the driver of the inherited provider
instance (`codex` is `codex`, `claudeAgent` is `claude`) and resolves the site's existing tier, its
floors, its downward-move rule and its panel allowlist unchanged. The result targets the same
provider instance, with the pinned catalog ID and exactly the options the helper returns: `effort`
for Claude, `reasoningEffort` for Codex, plus `fastMode: false` wherever the model offers it.

`TRANSPORT_UNAVAILABLE` (exit code 3) carries a reason: `no-t3-pins`, `no-inherited-instance`,
`unknown-driver`, `model-not-advertised` (with `data.model`) or `effort-not-offered`. It means the
host offers no delegation mechanism for this spawn and follows the delegation mandate's no-mechanism
path; it is not a selection error. For `model-not-advertised` the orchestrator queries
`orchestrator_capabilities` once with `search` and repeats `select` once; a second miss is final.

### Supersession

This decision supersedes the sentence in `src/shared/model-selection.md` that classified
`delegate_task` as "neither" and a delegation to another provider. A pointer to the new fragment
replaces it, loaded only when the spawn site or preflight names the transport and no native spawn
tool is available or permitted. The Fast exclusion stays. The matching clause in
[Per-spawn model tiers](./per-spawn-model-tiers.md) about a delegation to another provider never
being a Fast spawn remains true.

### Accepted risk: leaf boundaries are prose-only

A native Claude worker loses the ability to start children because the build withholds `Agent` and
`Task` from its tool list. A T3 child has no such enforcement: its leaf boundary, its write limits
and its tool ban are text in the brief. The existing parent-side checks compensate for what a child
could change in the execution root:

- the HEAD, index and tracked-state snapshots the orchestrators take around a worker;
- the publication scan of what a worker produced;
- the `plan-lint` projections of plan files.

The cost is that these checks detect a change after the fact, where a native boundary prevents it.

### Residual risk: forge writes by a child

No existing check covers a child's writes to the forge. A T3 child can reach the T3 forge tools
(`pull_request_*`, `*_issue`, `set_issue_state`, `link_*`, `unlink_*`, `watch_pull_request`,
`unwatch_pull_request`, `ci_rerun`, `write_pull_request_guides`), thread- and task-creating or
messaging tools, `gh` and `git push`, and none of the parent-side snapshots or scans observes them.
Only the brief's explicit ban covers them: the fragment names each of these tools unqualified, as
`host-pr-watch` names its tools. This risk is accepted, and it is the first thing to revisit if a
child is ever observed ignoring the ban.

### Evidence basis and limits

The basis is the acceptance record above and the #834 confirmation run of 2026-11-27. Its limits
shape the contract:

- **Top-level wake: confirmed.** A top-level orchestrator can dispatch with `mode: async`, end its
  turn and resume on the completion wake. The contract therefore reads the woken task once with
  `task_status` and never polls.
- **Nested wake after turn end: undetermined.** The runs did not settle whether a delegated child
  that ends its turn is woken. The contract provides no nested async route: the delegation mandate's
  turn-end rule for a delegated orchestrator stays unchanged, and a transport child treats a nested
  spawn as unavailable.
- **Inherited options beyond the returned set: unverified.** The runs did not test option
  inheritance or `fastMode`, so the contract passes exactly the helper's option set and relies on no
  inherited option (decision 5). A model that offers `fastMode` receives `fastMode: false`. The host
  states in the `delegate_task` tool schema that `target.options` follows "Given values override
  inherited. [] or {} clears.", so an option the helper does not set is inherited from the parent. A
  parent's `fastMode: true` could therefore carry over to a child model whose projection lists no
  `fastMode`, and the run would then end `unverified`, not `MODEL_MISMATCH`. This is untested: the
  #834 confirmation run did not exercise inheritance, and its model offered no `fastMode`.
- **Model compliance is a single read.** `task_status` reports `executedModel` and options only
  when the host provides them. An absent field is no contradiction, and `verify` stays `UNVERIFIED`.
- **Questions arrive as notifications.** `task_status.hasPendingQuestion` stayed `false` while a
  child waited on a question, so the contract recognizes a question by its notification or
  `t3_pending_request`, and cancels the task rather than answering.
- **Pin evidence differs per alias.** `claude-sonnet-5-5` is confirmed as an explicitly requested
  `delegate_task` target: the settings run of the acceptance record started a child with it, and
  the child reported it as `executedModel`. `claude-haiku-5-5` is observed as the model of T3 Code
  delegated tasks and `claude-opus-5-5` as the model of a session inside T3 Code
  ([focus host evidence](../developer-guide/focus-host-evidence.md),
  [Per-spawn model tiers](./per-spawn-model-tiers.md)). The `claude-fable-5-2` pin, the Claude panel
  model, has no repository evidence: it comes from the current Claude API model table. No pin was
  checked against the catalog `orchestrator_capabilities` lists. A wrong or unadvertised pin is not
  silent: the selection returns `TRANSPORT_UNAVAILABLE` with `model-not-advertised`, one `search`
  round follows, and a second miss takes the no-mechanism path.

A record binds the host version and provider it names, so a later T3 Code or provider version needs
its own record before a contract change relies on it. If a later #834 result downgraded the
top-level wake to "no" or "undetermined", this slice and `child-03` to `child-05` would stop before
implementation and return to the maintainer.

## Alternatives and tradeoffs

- **Offers from any provider.** Rejected: a child on another provider instance changes the model,
  the subscription and the option vocabulary under the same tier, and the tier mapping and the
  settings checks assume the caller's own provider. Only an offer on the inherited instance counts.
- **Polling the task.** Rejected: the confirmed wake makes it unnecessary, and a poll loop costs
  turns without a bound on a hung child. The contract reads a task once on its own wake and states
  that the wait has no time bound on T3 Code.
- **Native-target support.** Rejected: a native build has a spawn tool with enforced leaf boundaries
  and sidecars, and the harness rule would have to bend to admit a second mechanism there. The
  portable target is the one without it.
- **Pins in every contract, with a digest that excludes them.** Rejected: the digest binds the
  contract a selection was made under, and a field excluded from it would be unbound data inside a
  bound document. Keeping the pins out of the native contracts keeps those byte-identical and the
  digest honest.
- **A separate pin file.** Rejected: a second shipped artifact would need its own validation, digest
  and drift guard, while the contract already has all three.
- **The raw `orchestrator_capabilities` envelope as helper input.** Rejected: the envelope is
  unbounded, carries fields the helper never uses, and would put host output into the echoed
  selection that `verify` recomputes. A bounded projection keeps the input small and typed.

## Consequences

- A portable build on T3 Code gains an executable way to resolve a delegated worker's model and
  effort, and the contract stays inert until `child-03` names it at a spawn site or preflight.
- `T3_MODEL_PINS` is one more build-owned table. A new tier or panel alias fails the build until it
  has a pin, and an alias that leaves the mapping fails it until its pin is removed.
- The portable contract's `contractDigest` changes with `t3Pins`; the native digests and the
  `select` output for existing inputs do not.
- Behavioural eval suites whose load set reaches `model-selection` show expected evidence staleness.
- Forge writes by a transport child stay unmonitored (see the residual risk).

## Review triggers

Review this decision when T3 Code changes `delegate_task`, `task_status` or
`orchestrator_capabilities` semantics, when a re-run settles the nested wake, option inheritance or
`fastMode`, when `child-03` defines handing off a whole workflow through the transport, when a
pin not yet checked against T3 Code's advertised catalog is checked, or when a child is observed
acting outside its brief.

## References

- [T3 delegation transport acceptance](../developer-guide/t3-delegation-transport-acceptance.md)
- [Per-spawn model tiers](./per-spawn-model-tiers.md)
- [Native execution-profile representation](./native-execution-profile-representation.md)
- [Model tiers in the build system](../developer-guide/build-system.md#model-tiers)
- [`t3-delegation-transport.md`](../../src/shared/t3-delegation-transport.md)
- [`model-selection.md`](../../src/shared/model-selection.md)
- [`host-pr-watch.md`](../../src/shared/host-pr-watch.md)

This is a living decision. Update this file in place when the current transport changes; repository
history preserves earlier states.
