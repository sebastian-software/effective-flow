# Define the T3 delegate_task delegation transport contract and model-selection path

**Plan status:** Implemented
**Source:** GitHub issue #835, planning comment (`effective-flow plan-issue`)

**Recommended workflow:** Feature

## Requirement

Define one owning contract for T3 Code's `delegate_task` as an Effective Flow delegation transport for the **portable build target only**, and teach the executable model-selection helper to resolve its spawn settings. The contract ships **dormant**: it applies only where a spawn site or preflight names it, and `child-03` of #832 activates it there; `child-04` (Issue Buddy Phase 4, #837) references it. Rationale: on T3 Code with native multi-agent tools disabled or forbidden, every delegating tool currently falls back inline or stops (Issue Buddy, Autopilot). The #834 confirmation run proved that `delegate_task` with `mode: async` wakes a top-level parent after turn end, which makes a bounded transport viable.

Maintainer decisions recorded during planning on 2026-11-28 (decision 8 on re-entry the same day):

1. **Pin location:** T3 alias pins live only in the portable target's `scripts/model-selection-contract.json` as `t3Pins`; the native Claude and Codex contracts stay byte-identical.
2. **Eligibility:** owned once by the new fragment, which stays dormant until a spawn site or preflight names it (`child-03`); `src/shared/host-pr-watch.md` widens its `Host: t3-code` exception to an orchestrator started through the T3 delegation transport, within the scope of decision 8.
3. **Capabilities input:** the orchestrator passes a bounded projection of `orchestrator_capabilities`, not the raw envelope; fixtures are synthetic, and a verbatim recorded envelope may follow from #834.
4. **Forge writes:** named in the ADR as an uncovered residual risk; the brief forbids forge tools explicitly.
5. **Option inheritance:** documented as unverified in the ADR's evidence limits; `interactionMode: "default"` is set explicitly.
6. **Model compliance:** the fragment compares `executedModel`/`options` from the one `task_status` read with the target; a contradiction is `MODEL_MISMATCH`, a match stays `unverified`.
7. **Fallback:** an unnamed handoff with `fallback` and `reason` is accepted under the transport as in plain `select`.
8. **Transport-started orchestrators:** this slice carries worker leaves only. The widened `host-pr-watch` exception grants exactly the T3 wait path; such an orchestrator never watches and links nothing, and its caller links. Handing off a whole workflow through the transport is defined by `child-03`.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow #835 (child slot `child-02` of #832)
**Original outcome:** one owning transport contract plus a `t3-delegate` select path; no spawn-site or preflight wording changes (owned by `child-03`); native selection unchanged.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** fresh baseline; prerequisite evidence from #834 (PR #845 spike; confirmation run 2026-11-27: top-level async wake confirmed, nested wake after turn end undetermined, option inheritance and `fastMode` untested).
**Continuation decision:** none

## Acceptance criteria

- [ ] New ADR `docs/adr/t3-delegate-task-transport.md` (numberless kebab-case, `## Status` `Active`, like the existing ADRs) records the eight maintainer decisions and:
  - portable-target-only scope, enforced by the contract validator;
  - that transport selection is a separate path, not a harness classification, so the rule "harness comes only from the spawn tool's parameter shape" in `src/shared/model-selection.md` stays intact;
  - accepted risk: T3 leaf boundaries are prose-only, compensated by the existing parent-side checks (HEAD/index/tracked-state snapshots, publication scan, `plan-lint` projections); residual risk: forge writes by a child (T3 forge tools, `gh`, `git push`) are covered by no check, only by the brief's ban;
  - evidence basis and limits: `docs/developer-guide/t3-delegation-transport-acceptance.md` and the #834 confirmation run (top-level wake confirmed; nested wake after turn end undetermined, so no nested async route; inherited options beyond the returned set unverified);
  - rejected alternatives: any-provider offers, polling, native-target support, pins in every contract with a digest that excludes them, a separate pin file, the raw envelope as helper input;
  - that it supersedes the sentence in `src/shared/model-selection.md` that classifies `delegate_task` as "neither".
- [ ] New fragment `src/shared/t3-delegation-transport.md` owns, once:
  - **Scope:** applies only where a spawn site or preflight names it, and carries worker leaves only; handing off a whole workflow is outside this fragment until `child-03` defines it.
  - **Eligibility:** host identity per `host-pr-watch`; its transport-orchestrator exception never makes a transport child eligible to dispatch; no native spawn tool available or permitted, where "not permitted" means a user or instruction-file rule naming the native mechanism.
  - **Settings:** same provider instance — `target.providerInstanceId` equals the projection's `inheritedProviderInstanceId`; driver map `codex`→`codex`, `claudeAgent`→`claude`. Model and effort come from the spawn site's existing tier; `target.options` is exactly the set the helper returns (`effort` for Claude, `reasoningEffort` for Codex, plus `fastMode: false` wherever the model offers it). On `TRANSPORT_UNAVAILABLE` with `data.reason: "model-not-advertised"`, query `orchestrator_capabilities` once with `search: <data.model>` and repeat `select` exactly once with the identical input except `capabilities`, now the bounded projection of the `search` result, never adding `retry: true`; a second miss is final. `TRANSPORT_UNAVAILABLE` (any reason, after at most that one round) means the host offers no delegation mechanism for this spawn: follow the delegation mandate's no-mechanism path, or the tool's existing stop where it has one, in one visible line; it is not a selection error that stops dispatch.
  - **Handoff:** fresh context, the existing compact worker brief with the bundled `workers/effective-flow-<role>.md` path, permission/write limits, leaf boundary, the `Host: t3-code` line, and an explicit ban, named unqualified as `host-pr-watch` names its tools, on every T3 forge tool (`pull_request_*`, `*_issue`, `set_issue_state`, `link_*`, `unlink_*`, `watch_pull_request`, `unwatch_pull_request`, `ci_rerun`, `write_pull_request_guides`), every thread- or task-creating or thread-messaging tool (`delegate_task`, `create_threads`, `t3_thread_launch`, `t3_thread_transfer`, `t3_thread_send`, `t3_thread_send_attachments`, `schedule_task`, `run_scheduled_task_now`), `request_secret`, `gh` and `git push`. Always `isolation: shared`; the brief names the absolute execution root and the child acts only through it (`git -C <root>`, absolute paths); never `isolation: worktree`. `role`: `review` for read-only judgment and validation leaves, `research` for analysis, `implementation` for writers; `interactionMode: "default"`; `runtimeMode` omitted.
  - **Completion:** dispatch `mode: async`; only a top-level orchestrator ends its turn and resumes on a task's completion wake. The delegation mandate's turn-end rule for a delegated orchestrator stays unchanged, so a transport child has no async route and treats a nested spawn as unavailable. After a wake, read only the woken task, once, with `task_status`. Anything but `status: completed` with `workState: result_available` and a completion-protocol result is the site's existing failure or blocker (write-capable) or declined spawn (read-only), with no second read. With several pending tasks, read each only on its own wake and end the turn again while any remains pending; that is no re-`wait` loop. Before ending a turn with pending tasks, state in one visible line which tasks are pending and that the wait has no time bound on T3 Code. Never `task_status` on a running task, no sleep, no new top-level thread.
  - **Questions and cancellation:** a child's question or approval request is recognized by its notification or a `t3_pending_request` for that task, never by `task_status.hasPendingQuestion`; a final summary that is a question instead of the completion protocol's result counts the same, without `task_cancel`, since that task has already completed. The orchestrator answers nothing and `task_cancel`s the task: a declined spawn for a read-only role, ambiguous completion for a write-capable role, never an inline redo. `task_cancel` also ends a superseded task. Ambiguous completion of a write-capable task is never replayed and becomes the site's existing failure or blocker.
  - **Evidence:** Fast is never selected. Compare the one `task_status` read with `spawn.target`. A contradiction is an `executedModel` different from `target.model`, or an option in `target.options` reported with a different value; an absent field or an extra option is no contradiction and stays `unverified`. A contradiction is `MODEL_MISMATCH` regardless of `verify`'s `UNVERIFIED`, and is not the "contradictory metadata" of `model-selection`'s `UNVERIFIED`.
  - **Precedence:** a tool's explicit ban on thread-creating dispatch (such as `focus`) wins.
  - **Wording limits:** names no model, alias or catalog ID and links no `docs/` file; concrete IDs live only in the contract JSON.
- [ ] `src/shared/host-pr-watch.md` widens the T3 dispatch-table row and the exception sentence (now "The exceptions are …") from "the delegated `merge-gate` run" to "a delegated `merge-gate` run or an orchestrator started through the T3 delegation transport, each having received `Host: t3-code`"; that input line alone is their host identity. The widened exception grants exactly the T3 wait path: the T3 section's wait prohibitions and the delegated run's endings (`SUSPENDED host-pr-watch` return or report-and-stop). Whatever its running environment reports, such an orchestrator counts as a delegated sub-agent here: it never calls `watch_pull_request`, `unwatch_pull_request`, `link_pull_request` or `link_issue`, and its caller links.
- [ ] `src/shared/model-selection.md` replaces the "neither" sentence with a short lazy-include pointer to the new fragment with `when: the spawn site or preflight names the T3 delegation transport and no native spawn tool is available or permitted`; the Fast exclusion stays. All three targets ship `shared/t3-delegation-transport.md` (lazy-fragment guard), and a test asserts that; on a native build the helper always returns `TRANSPORT_UNAVAILABLE` with `no-t3-pins`.
- [ ] `src/scripts/model-selection-core.mjs` gains a `transport: "t3-delegate"` select path:
  - input `{transport: "t3-delegate", site?, role?, fallback?, reason?, tier?, retry?, panelModel?, capabilities}` without `harness` (derived from the driver map); `harness` or `native` together with `transport` is `INVALID_INPUT`; site, role-only correction and `fallback` + `reason` behave as in plain `select`;
  - `capabilities` is the projection `{inheritedProviderInstanceId, providers: [{providerInstanceId, driverKind}], models: [{id, providerInstanceId, options: [{id, values}]}]}`, `values` a bounded array of strings or booleans, with per-field type and length bounds and a total size that leaves room for the echoed selection in a later `verify` within `MAX_STDIN_BYTES`;
  - output: the normal selection envelope (`request` echoing the complete transport input, `contractDigest`, `defaultTier`, `tier`, `expected`, where `expected` is `{model: spawn.target.model, effort}`, so `expected.model` is the pinned catalog ID) plus `transport: "t3-delegate"` and `spawn: {target: {providerInstanceId, model, options}}`; tier rules (floors, downward-move flag, panel allowlist with `panelModel` resolved through its pin) apply unchanged;
  - `TRANSPORT_UNAVAILABLE` carries `data.reason` (`no-inherited-instance`, `unknown-driver`, `no-t3-pins`, `model-not-advertised`, `effort-not-offered`) and, for `model-not-advertised`, `data.model`, with CLI exit code 3; a portable contract with a missing pin never reaches `select`, it is `INVALID_CONTRACT`;
  - `verify` accepts a transport selection without `parentId`, `childId` or `evidence` (as for Fast), recomputes it and returns `UNVERIFIED` with `{status: "unverified"}` before any evidence branch, also when handles or a `codex-rollout` evidence object are supplied;
  - `fast` with `transport` returns `INVALID_INPUT` (existing key check, exit 2).
- [ ] `build.mjs` adds `T3_MODEL_PINS` beside `MODEL_TIER_MAPPINGS` and writes it as `t3Pins` into the **portable** contract only; Codex IDs pass through unchanged. A build guard derives the alias set from `MODEL_TIER_MAPPINGS[*].claude.model` ∪ `PANEL_MODEL_ALLOWLIST.claude` and rejects a missing or an unused pin. `validateContract` requires `t3Pins` exactly on a `portable` contract (`(target === 'portable') === Object.hasOwn(contract, 't3Pins')`), with keys exactly those aliases and bounded catalog-ID values. The `T3_MODEL_PINS` values join the provider-name lists of the portable alias guard and the native foreign-name guard; a unit test asserts that a pinned catalog ID in shipped prose fails the build.
- [ ] `dist/claude/…/model-selection-contract.json` and `dist/codex/…/model-selection-contract.json` hash identically on the base commit and the branch (SHA-256 recorded in the PR); a unit test asserts that native contracts have no `t3Pins`; for every contract, `select` output for existing inputs is unchanged except `contractDigest` on the portable target.
- [ ] `test/model-selection.test.mjs` covers: advertised match; alias pin advertised, not advertised in the short list but found by `search`, not found after `search`; missing effort; other-provider-instance-only offer (rejected); unknown driver; contract without `t3Pins`; native contract with `t3Pins`, portable contract without it, extra or missing pin (`INVALID_CONTRACT`); transport with `harness` or `native` and an oversized or mistyped projection (`INVALID_INPUT`); role-only correction; `fallback` + `reason`; panel site including `panelModel` through its pin; a model offering `fastMode` (the target carries `fastMode: false`) and one not offering it (no `fastMode` in the target); Fast rejection; `verify` on a transport selection with and without handles and near the size bound; `TRANSPORT_UNAVAILABLE` reason and exit code through the CLI; unchanged native output. `test/model-tiers-contract.test.mjs` expects `t3Pins` in the portable contract and adds `SPAWN_MENTION_ALLOWLIST` entries for each `sub-agent` paragraph of `shared/t3-delegation-transport.md` and the widened `host-pr-watch` exception paragraph (reason: transport contract or host-identity rule for a spawn marked at its own site; starts nothing).
- [ ] `test/workflow-contracts.test.mjs` asserts, each with a named invariant, that `src/shared/t3-delegation-transport.md` requires `mode: async` and `isolation: shared`, forbids `isolation: worktree`, carries the tool ban (naming `set_issue_state` and `t3_thread_send` explicitly), forbids `task_status` on a running task and answering a child's question, and links no `docs/` file, and that `host-pr-watch`'s dispatch row and exception sentence name both the delegated `merge-gate` run and the transport orchestrator with `Host: t3-code` as their host identity (the existing row and proximity assertions and their invariant comment are updated to the plural exception, not loosened), and that within the exception sentence's paragraph the transport orchestrator sits near "never" + `watch_pull_request` and "links nothing" + "caller".
- [ ] `src/tools/focus.md` has no `include` or `lazy-include` fence naming `t3-delegation-transport`, its `delegate_task` decline sentence is unchanged, and `test/focus-contracts.test.mjs` stays unchanged and green.
- [ ] `pnpm eval <suite> verify` shows only expected staleness and no integrity failure for every suite whose load set reaches `model-selection` (determined during implementation, `focus` included if it does); the PR lists those suites and names the evidence debt; no model runs.
- [ ] CI order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.

## Affected areas/files

- `docs/adr/t3-delegate-task-transport.md` (new) — decisions, accepted and residual risks, evidence limits, rejected alternatives.
- `src/shared/t3-delegation-transport.md` (new) — owning contract.
- `src/shared/model-selection.md` — lazy-include pointer instead of the "neither" sentence.
- `src/shared/host-pr-watch.md` — widened T3 row and exception sentence.
- `src/scripts/model-selection-core.mjs`, `src/scripts/model-selection.mjs` — transport select path, projection validation, `TRANSPORT_UNAVAILABLE`, `t3Pins` validation, `verify` handling.
- `build.mjs`, `build-lib.mjs` — `T3_MODEL_PINS`, portable-only emission, derived pin guard, provider-name guard lists.
- `test/model-selection.test.mjs`, `test/model-tiers-contract.test.mjs`, `test/workflow-contracts.test.mjs`; the build/distribution test that lists shipped shared fragments.
- `docs/developer-guide/build-system.md` — `t3Pins` beside `panelModels` in "Model tiers" (with its guard), `t3-delegation-transport` in the mode-gated lazy list.

## Edge cases

- Native spawn tool present and permitted: native wins; the transport is never selected.
- No spawn site names the transport yet (this slice): it stays dormant on every host.
- Native target contract (no `t3Pins`): `TRANSPORT_UNAVAILABLE` (`no-t3-pins`), then the mandate's no-mechanism path.
- Panel sites (`Panel: yes`): the panel model resolves through its pin on the same provider instance, else unavailable.
- Pinned catalog ID not in the short list: one `search` round, then final.
- Transport child that would itself delegate: no nested async route; the nested spawn is unavailable.
- Orchestrator started through the transport: cannot occur in this slice (worker leaves only); the widened `host-pr-watch` exception is forward wording for `child-03`, which also owns any change to the tools' `host-pr-watch` pointer `when:` clauses.
- A child asks a question or requests approval: cancelled, never answered.
- A child hangs: the parent waits without a time bound and says so before ending its turn.
- If a later #834 result downgraded the top-level wake to "no" or "undetermined", this slice and `child-03`–`child-05` stop before implementation and the parent returns to the maintainer.

## Assumptions

- No spawn-site or preflight wording changes in this slice; `child-03` owns activation.
- `docs/developer-guide/t3-delegation-transport-acceptance.md` still records only the first spike; adding the confirmation run belongs to #834.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         1 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    2 |

### Findings

- Important (Architecture/Security): the widened `host-pr-watch` exception and the worker-only handoff left open how an orchestrator started through the transport is handed off and what T3 identity unlocks for it; decided by the maintainer on re-entry (decision 8: worker leaves only, the exception grants the wait path only).
- Important (Security): the forge ban named no concrete tools; incorporated as an explicit unqualified tool list plus `gh` and `git push`, and the ADR's residual risk names the same.
- Important (Error cases): "contradiction" in the model-compliance check was undefined and collided with `model-selection`'s contradictory-metadata rule; incorporated with an exact definition and ordering against `verify`.
- Important (Testability): the fragment's safety prose had no contract test; incorporated as a `workflow-contracts` criterion with named invariants.
- Note (Maintainability): `host-pr-watch` table row and "The one exception" wording; incorporated.
- Note (Maintainability): the brief-line host rule was stated twice; Eligibility now points to `host-pr-watch`.
- Deep plan review on re-entry (2 Important, 6 Note, all incorporated): the tool ban now also names `set_issue_state`, the thread-messaging tools and `request_secret`; the unreachable `alias-without-pin` reason and its test were removed (a missing pin is `INVALID_CONTRACT`); the `fastMode` test is expressed through the offered options and option value types are stated; the `search` retry keeps the input except `capabilities` and never adds `retry: true`; a completed question-summary task is not cancelled; the CLI exit code (3) and `expected.model` are fixed; the spawn-mention allowlist entries and the pointer's `when:` clause are specified.
- Re-entry review of the decision-8 changes (2 Important, 2 Note, all incorporated): the `host-pr-watch` criterion now defines the granted wait path and how a transport-started orchestrator is treated whatever its environment reports; the `workflow-contracts` criterion pins the restriction and says how the existing row and proximity assertions adapt; an edge case states that the exception cannot occur in this slice; Eligibility states that the exception never makes a transport child eligible to dispatch.
- Earlier rounds (gap judgment and internal review): all directly incorporable findings incorporated; six decision-requiring findings decided by the maintainer (decisions 2–7).

## Open points

- No open points.

## Build completion

**Date:** 2026-11-28

**Requirement:** as above. The T3 Code `delegate_task` transport now has one dormant owning
contract, and the model-selection helper resolves its spawn settings through a
`transport: "t3-delegate"` select path on the portable target only. No spawn site or preflight
names the transport yet; `child-03` of #832 activates it.

**Architecture decisions as built:**

- `src/shared/t3-delegation-transport.md` owns Scope, Eligibility, Settings, Handoff (the full
  unqualified tool ban), Completion, Questions and cancellation, Evidence and Precedence. It ships to
  all three targets as a lazy fragment behind the `src/shared/model-selection.md` pointer.
- Deviation from the plan's Eligibility wording (review correction): Eligibility also requires a
  top-level orchestrator, so every delegated orchestrator, a transport child included, treats the
  transport as unavailable. This follows from the delegation mandate's turn-end rule, which the
  Completion section already states.
- The helper splits tier resolution into harness-independent rules and a harness-dependent
  `panelPolicy`. Invalid input and tier-policy refusals precede every `TRANSPORT_UNAVAILABLE`
  reason, so a caller defect never becomes the no-mechanism path. Native selection runs the same
  checks in the same order.
- `T3_MODEL_PINS` in `build.mjs` maps `haiku`, `sonnet`, `opus` and `fable` to catalog IDs; only
  the portable contract carries them as `t3Pins`. The `fable` pin has no repository evidence (see
  the ADR).

**Affected files:** `src/shared/t3-delegation-transport.md` (new), `src/shared/model-selection.md`,
`src/shared/host-pr-watch.md`, `src/scripts/model-selection-core.mjs`,
`src/scripts/model-selection.mjs`, `build.mjs`, `build-lib.mjs`;
`docs/adr/t3-delegate-task-transport.md` (new), `docs/adr/per-spawn-model-tiers.md`,
`docs/developer-guide/build-system.md`; tests in `test/model-selection.test.mjs`,
`test/model-selection-fast.test.mjs`, `test/model-tiers-contract.test.mjs`,
`test/workflow-contracts.test.mjs`, `test/build-lib.test.mjs`,
`test/execution-profile-rendering.test.mjs`, `test/support/native-profile-config.mjs`.

**Native contracts:** `model-selection-contract.json` SHA-256 is unchanged on the base commit and
the branch: Claude `66f889ee422c158e6c420c5e97d5cb16014973060194628de2849544509c46d7`, Codex
`8bd80b7e8c013fe7eb638c0cbb23f05d311db06c9484236483f60b0a9a925578`. The portable contract changes
from `c5bfd90eb9f0a4bccecf7fa942979ce728a671d05425a83112efd5837f6bfdd6` to
`db8fb3e997f3127cbfd7a7b9dd6ba8c8bc0db1f955acdb922f7631f6e2fe048b` (adds `t3Pins`).

**Test results:** Phase 5 ran the CI order on the implementation state before review corrections:
`pnpm agent:check`, `node build.mjs` and `pnpm test:distribution` green; `pnpm test` ran 7202
tests with 7115 passing, 85 skipped and 2 failing. The two failures
(`merge-gate-eval-round-lifecycle` "one immutable round provisions, seals, retries, and publishes
isolated slots"; `protected-validation-operator` "history control applies one overall deadline
across cumulative Git metadata reads") import no changed module and pass when re-run by identity;
no base run was available, so they stay unattributed. Later corrections were verified targeted:
46 affected test files (2629 tests, 2563 passing, 0 failing, 66 skipped), both former failures by
identity, `pnpm agent:check`, `node build.mjs` and `pnpm test:distribution`. `pnpm eval <suite>
verify --mode report` shows no integrity blocker in any suite; merge-gate, iterate, build-context
and focus load changed sources and carry freshness debt, next-steps does not.

## Review findings

**Date:** 2026-11-28
**Reviewer:** effective-flow-nodejs-reviewer (review, scoped re-check, floor full pass)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     7 |
| Open / Not implemented |     4 |

The four not implemented were closed below the follow-up threshold: a deny-by-default T3 tool ban
(the approved plan fixes the list), `fastMode` value checking (the plan sets `fastMode: false`
wherever offered), `host-pr-watch` linking bullets for a transport-started orchestrator (forward
wording owned by `child-03`), and the Completion section's restatement of the nested-spawn rule
(plan wording).
