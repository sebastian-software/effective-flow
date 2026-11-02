# T3 Code current-thread renaming

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Allow Effective Flow to rename its current T3 Code thread, including when Codex runs through T3 Code. Setup currently reports that this host has no established rename path and therefore executes no rename attempt. Add the missing host integration to both the optional setup capability check and ordinary work-subject runs; changing setup alone would leave the regular title workflow unsupported.

This is a Feature: the existing fallback follows its documented contract, while this change establishes an additional supported host. It changes shipped workflow behavior, not just user documentation.

### Verified context

- Planning baseline: source checkout HEAD `6683c8e1`, inspected on 2026-11-02. Recheck affected sources and concurrent work before implementation.
- `src/shared/session-rename.md` dispatches only to ChatGPT Desktop's Codex tab and native Claude Code. Its catch-all explicitly selects suggestion-only behavior.
- `src/shared/setup-rename-probe.md` recognizes the same two hosts. `src/tools/setup.md`, Step 7, repeats this limitation and separately owns the consent gate.
- `src/shared/session-title.md` already permits an established host-native current-session operation with no identifier. It owns title derivation, eligible tools, the setup exception, and early application when a reference becomes available later.
- The T3 Code tool schema exposed to this planning session provides `mcp__t3_code.t3_thread_update`, with `action: rename`, a literal `title`, and an optional `threadId`. Omitting `threadId` targets the calling thread. No rename was executed to establish this schema evidence.
- `test/session-contracts.test.mjs` covers host dispatch, current-session safety, setup/mechanism parity, independent fallback, retired transports, and the session-title fragment's 58-line cap. These tests prove instruction contracts, not live host behavior.
- `docs/adr/session-rename-butler.md` records why caller-derived identifiers are unsafe: a fork once supplied its parent's identity and silently renamed the wrong session. This plan preserves that decision.

## Outcome checkpoint

**Primary source:** User-requested T3 Code rename integration in the `effective-flow` source repository, planned against HEAD `6683c8e1`; primary local reference is this plan.

**Original outcome:** Support current-thread renaming for ordinary T3 runs and the consented setup probe, without identifiers, cross-thread writes, persistent capability state, alternate transports, or regressions in existing supported hosts.

**Last evaluated attempt:** No implementation attempt evaluated; only repository contracts and the exposed tool schema were inspected.

**No-progress count:** 0

**Cumulative approach:** Add one host adapter across the shared mechanism, setup probe, tests, and two guides. Remaining proof is the focused/full repository checks and dedicated live T3 acceptance cases; no implementation investment or live result is claimed.

**Continuation decision:** No special continuation decision; proceed only through an explicitly invoked implementation workflow within this scope.

## Architecture decisions

1. Dispatch on the client host before the underlying model provider or harness. An explicitly identified T3 Code environment selects the T3 path whether it runs Codex or Claude; native Claude and Desktop paths remain separate. Merely seeing T3 management tools is not sufficient evidence of the active client host.
2. Establish exactly one T3 operation: `mcp__t3_code.t3_thread_update` with `action: rename` and the already-derived literal `title`. Omit `threadId` and `environmentId`; never derive either from a delegate, parent, fork, environment, or thread listing. Do not use title regeneration.
3. Keep title policy in `session-title.md` and transport behavior in `session-rename.md`. Setup uses that same transport and outcome contract, with its fixed probe title and existing explicit consent. Avoid a new shared abstraction or runtime helper for one additional adapter.
4. Ordinary runs attempt the operation once after their subject is fixed. Reported success is silent; an unavailable, denied, errored, or unconfirmed result yields the existing single suggestion without blocking the workflow. After success, a newly bound reference permits only the existing one additional rename, not a retry loop.
5. Never list, search, read back, or otherwise discover thread identity or title ownership. No alternate-host fallback follows a T3 failure. Do not infer Claude's manual-title consent guarantees for T3; explicitly document the possible replacement of an existing title, including a manually chosen title, unless verified host behavior establishes a narrower guarantee.
6. The adapter is Effective Flow orchestration, not a central domain playbook. Keep the existing skill-ownership relationships unchanged unless implementation actually introduces a new central-skill dependency.

## Affected files

| File                                 | Description                                                                                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/session-rename.md`       | Add host-first T3 dispatch and a bounded current-thread rename section, with explicit no-ID targeting and outcome handling.                                      |
| `src/shared/setup-rename-probe.md`   | Add the consented T3 capability check, its visible side-effect explanation, and concrete outcome reporting.                                                      |
| `src/shared/session-title.md`        | Generalize early-application wording to cover T3 without duplicating host transport policy or exceeding the 58-line guard.                                       |
| `src/tools/setup.md`                 | Remove two-host assumptions in Step 7 and the final capability-step Notes while retaining consent, lazy loading, no configuration key, and completion reporting. |
| `test/session-contracts.test.mjs`    | Extend dispatch, transport, probe parity, safety, and independent fallback invariants for T3.                                                                    |
| `docs/user-guide/tools-setup.md`     | Explain the T3 setup probe, consent, visible title replacement, and call-local failure behavior.                                                                 |
| `docs/user-guide/getting-started.md` | Document T3's automatic current-thread titles and distinguish its client host from plain Codex CLI or native Claude Code.                                        |

`build.mjs` is conditional scope only if the measured setup core exceeds its existing `CONTEXT_BUDGET_LINES` allowance. Prefer neutral wording that fits; if an entry must change, use the build report and at most ten lines of headroom. No other build changes are expected. The Claude-specific rename ADR need not be broadened; leave its retired-transport decision intact. Concurrent focus plans touch that ADR and are not part of this change.

## Implementation details

### Approach

1. Recheck the baseline, current T3 tool schema, scoped instructions, and any concurrent edits. Preserve unrelated untracked concept and focus-plan files. Confirm that omitted identifiers still target the caller; stop rather than replace this with an explicit thread ID if the contract changed.
2. Add the T3 host row and transport section to `session-rename.md`. Use an explicit T3 host signal from the running environment; unknown or ambiguous hosts retain suggestion-only behavior. A capability that is deferred should be attempted by its established name once before it is classified as unavailable, without speculative tool discovery.
3. Extend `setup-rename-probe.md` and update Step 7 and the final capability-step Notes, including their existing two-path enumeration. After the existing Yes answer, announce the visible change, then call the same current-thread operation once with `Effective Flow setup check`. No skips, failures, or success results write configuration or persist a capability decision.
4. Update the minimal early-application wording in `session-title.md`, retaining its format, 60-character title limit, eligible/silent tool lists, no-ID permission boundary, and setup-only probe exception.
5. Extend the existing source-contract tests with named invariants. Cover host precedence, exact T3 operation and arguments, absent IDs, no discovery/readback/regeneration, fallback, the one late-reference exception, consent, probe independence, setup's final Notes, and continued retirement of helper transports. Distinguish silent leaf workers from eligible delegated workflows and preserve native-host assertions rather than weakening them.
6. Update both user guides. Explain that T3 supplies the capability regardless of provider; plain Codex CLI still lacks an automatic path. State what happens to existing titles without inventing a title-ownership check.
7. Run the focused and full checks below. Record live acceptance evidence separately from source-contract coverage, using dedicated disposable threads for intentional rename probes.

### Edge cases

- T3 Code over Claude must not call native Claude's `set_session_title`; T3 over Codex must not call Desktop's `codex_app__set_thread_title`.
- Declining the setup question executes no rename. A failed or skipped setup probe does not disable subsequent ordinary attempts.
- A missing tool, permission denial, thrown error, or ambiguous acknowledgement is not reported as a successful rename. Neither setup nor ordinary runs retry or switch transport.
- A successful early title followed by a newly available reference allows one additional title update. Failure of the first call does not create another call budget; the final suggestion already includes the bound reference.
- Internal leaf workers never emit or apply session titles and never run setup probes. Eligible workflow-to-workflow delegates retain the existing title handoff and duplicate-emission rules; every permitted rename still targets only the calling thread. The orchestrator never supplies a parent ID to make an operation reach another thread.
- An interrupted ordinary run can leave the early title applied; setup likewise has an intentional visible side effect, not an automatic restoration step.

### Non-goals

No new configuration key, dependency, runtime script, hook, helper session, title-state file, identity resolution, cross-thread write, per-tool rename implementation, router change, or generated `dist/` edit. No live rename is required during planning. No README change or unrelated focus-work integration.

## Acceptance criteria

1. Source-contract tests prove that an explicitly identified T3 Code host selects its adapter ahead of Codex/Claude provider paths, while unknown hosts, plain Codex CLI, ChatGPT Desktop, and native Claude keep their existing behavior.
2. The T3 contract calls only `t3_thread_update` with `action: rename` and the derived literal title, with neither `threadId` nor `environmentId`, no regeneration, no discovery or readback, and no alternate transport or general retry.
3. The setup contract proves that Yes makes exactly one announced current-thread call with `Effective Flow setup check`; No makes none. The summary reports the actual path and outcome, and no probe outcome changes persisted configuration or later eligibility.
4. Ordinary title rules remain unchanged: successful calls stay silent, every non-success produces the single suggestion, and only success followed by a newly bound reference permits one additional update.
5. Focused session-contract tests and CI's formatting, unit, build, and distribution checks pass. Built Claude, Codex, and portable artifacts contain the T3 contract, preserve other hosts, and satisfy existing line-budget and retired-transport guards.
6. In dedicated live T3 threads over Codex and Claude, a consented setup check visibly renames only its calling thread; an ordinary eligible run applies its derived title without a suggestion after acknowledged success. Confirm sibling/parent isolation through a human observing the UI, not identity/readback calls from the workflow. If a provider lane cannot be exercised, record it as unverified rather than claiming support was live-tested there.
7. Both user guides and setup's final capability-step Notes describe the same consent, target, fallback, and title-overwrite behavior as the shipped contracts. Existing workflow-to-workflow title handoff remains allowed while internal leaf workers remain silent. No unrelated product files or private runtime state are introduced.

## Validation plan

- Before implementation, compare the affected contracts against the planning baseline. Use the normal local lane's `pnpm test:preflight` in the exact worker environment before product writes or native pilot readiness claims; a failed local qualification blocks that lane rather than becoming a reported pass.
- Run `node --test test/session-contracts.test.mjs` first for focused contract feedback.
- Run CI's required order after distribution-source edits: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`. Inspect the build's measured core/budget report; edit only sources, never generated output.
- Inspect the three built targets for retained T3 dispatch and transport instructions. The tests/build are instruction evidence only and do not substitute for the live cases above.
- Record live calls and host-reported outcomes without invented response fields. Test ordinary success, the setup Yes/No paths, and late-reference behavior in disposable threads. Denial, missing-tool, and ambiguous-outcome cases may use a controlled instruction-evaluation scenario when the host cannot safely produce them; label that evidence accordingly. Do not add retry/readback behavior solely to obtain evidence.
- Run read-only `pnpm eval merge-gate verify`, `pnpm eval iterate verify`, `pnpm eval next-steps verify`, and `pnpm eval build-context verify` to identify invalidated behavioral evidence. Re-record affected suites before the next release under their existing README contracts; do not claim source tests ran model evals.

## Assumptions and open points

- T3's concrete acknowledgement shape and title-ownership behavior were not exercised during planning. Implementation must use the actual host outcome rather than invent fields or inherit another host's consent semantics; the conservative replacement warning does not depend on that uncertainty being resolved.
- Host detection uses explicit runtime context, as in this session. Tool visibility alone is not a host identity proof.
- All proposed file paths and existing safety contracts were inspected. Live execution remains a validation task, not a planning claim.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         1 |    1 |

### Findings

- Scope — Important, resolved: the draft conflated silent leaf workers with eligible delegated workflows. Preserve the established workflow-to-workflow title handoff, prohibit title/probe actions only for leaf workers, and cover that distinction in contract tests.
- Maintainability — Note, resolved: setup's final capability-step Notes also enumerate exactly two paths. Include those Notes in the wording update and coverage, not only Step 7 and the mechanism fragment.
- Maintainability — Important, resolved: add the current source contract's six-field Outcome checkpoint after Requirement. Record a fresh baseline without invented implementation attempts, costs, or live evidence.

Internal plan-level review completed on 2026-11-02 using `effective-delivery`. The table counts findings before incorporation; all findings above are incorporated and none remains blocking. Architecture fit, current-thread security and data protection, non-success handling, testability, bounded scope, and maintenance consistency were checked. Live host execution is still pending implementation validation, not a review claim.

### Deep interactive review — 2026-11-02

The user approved the deep review. A fresh read-only judgment using `effective-delivery` found no additional correction or consequential decision. Checked scope: host-first dispatch and identifier-free targeting; title eligibility and workflow/leaf-worker boundaries; setup consent, fixed probe title, non-persistence and final Notes; independent failure handling and late-reference updates; test feasibility, line budgets, three-target shipping and retired transports; separation of instruction evidence from live-host proof and explicit implementation authorization. Result: Approved, with zero new findings in every summary area and zero blocking open points. No live rename, product change, or implementation test was performed by this review.

## Open points

- No open points.
