# Risk-Aware Model Tiering for Effective Flow

**Concept status:** Elaborated
**Source:** effective-flow concept

## Problem and motivation

Effective Flow already delegates substantial work to specialized leaf agents, but every product-code implementer currently uses the same high-capability model tier. This protects quality, yet it also assigns the quality tier to tasks that may already be tightly constrained by an approved plan, bounded file ownership, repository conventions, tests, validation, and a later specialist review. Whether that allocation is a material source of latency or cost has not yet been measured.

The hypothesis is that deep reasoning can be reserved for decisions that need it – planning, coordination, risk classification, review, conflict resolution, and escalation – while a faster model executes well-specified implementation packets. The desired outcome is lower end-to-end latency and lower model cost without weakening the existing quality, safety, or delivery gates. A reversible field pilot must establish that executor inference is material enough to justify wider adoption.

Verified repository context: support roles such as test writing, code validation, and documentation already use an economical model tier, while implementers and reviewers use a quality tier. `build` and `refactor` both place independent validation and quality-tier review after implementation. Current Codex and Claude Code documentation also confirms that sub-agents can receive model-specific configuration or per-spawn overrides.

Assumption: both elapsed time and model cost matter, but unchanged workflow quality is the binding constraint. The concept must be revised if cost, speed, or maximum quality should instead dominate the other two.

## Target users and use cases

- Effective Flow users running `build`: implement an approved, measurable plan faster when the change has bounded ownership and no unresolved product or architecture decision.
- Effective Flow users running `refactor`: perform a behavior-preserving structural change with a faster executor while retaining baseline comparison, specialist review, and final validation.
- Effective Flow maintainers: evolve model assignments in one policy layer as Codex and Claude Code capabilities change, without scattering provider-specific model names through workflow instructions.

## Solution sketch

Effective Flow gains a small, risk-aware execution-profile layer. The orchestrating model remains selected by the user or host and continues to own interpretation, planning, coordination, and escalation. Before eligible implementation work is delegated, that orchestrator classifies the packet as either requiring the existing quality profile or being eligible for a fast-executor profile.

The field pilot is disabled by default. A project-level Effective Flow setting opts the project into automatic fast routing for eligible `build` and `refactor` packets. Removing or disabling that setting restores the existing quality-only behavior without a data or artifact migration. The setting controls policy only; projects do not configure concrete provider model names.

The first version applies the fast profile only to implementation phases in `build` and `refactor`. Eligibility is classified per delegation packet or existing project-routing bucket, never once for the whole workflow and never independently per file. A mixed change may use different profiles only when its packets have disjoint write ownership and no unresolved dependency; coupled packets share the quality profile.

The eligibility gate is ordered and fail-closed. A packet stays on quality if the target cannot enforce the fast profile; if it touches authentication, authorization or another trust boundary; if it contains destructive data work, migrations, concurrency, unsafe code, public compatibility contracts or merge conflicts; if its ownership or cross-domain dependencies are unclear; or if any required evidence is unknown. Only then may the coordinator admit a packet whose source is approved and measurable, whose allowed write paths and validation commands are established, and whose product and architecture decisions are closed. `unknown → quality` is binding at every step.

The profile is represented differently where the native harness contracts differ. Codex receives an explicit model and reasoning-effort override on the implementation spawn. Claude Code receives a generated fast implementer sidecar whose model and effort are fixed for that profile. Portable managers remain behaviorally correct but do not activate the optimization in the first version, because their generic delegation path cannot guarantee the same quality-profile fallback across hosts.

Reviewers and conflict-resolution workers remain on the quality profile. Test, validation, and documentation workers keep their existing economical assignments. Only the first implementation delegation of an eligible packet may use the fast profile. Validation repair, review incorporation, retries, and every other corrective implementation use quality without re-running the fast eligibility gate. If a fast executor discovers missing context, scope growth, or a new decision, the work returns once to the quality profile rather than continuing speculatively. The partial edits remain in the verified execution checkout. The quality worker first inspects that diff and receives the changed paths, completed and failed requirements, checks already run, dirty-state summary, and escalation reason. It then completes or corrects the packet; a second fast attempt is forbidden. Unsupported native optimization also falls back once to the registered quality worker, so optimization can disappear safely without discarding work or changing workflow correctness.

Three directions were considered: globally downgrading all implementers, adding a separate strong coordinator role, and risk-aware per-delegation tiering. Global downgrading exposes under-reviewed workflows such as `fix` and `iterate`; a new coordinator role would conflict with the current caller-owned orchestration model. Risk-aware tiering is the smallest reversible change that uses the existing safety structure.

## Scope

### In scope (first version)

- Introduce provider-neutral execution profiles for the existing quality default and an optional fast executor.
- Allow only the implementation phases of `build` and `refactor` to request the fast-executor profile.
- Classify eligibility per delegation packet or routing bucket through an ordered gate, with coupled scopes and every unknown routed to quality.
- Preserve partial fast-worker edits during escalation and require a complete state-transfer handoff before the quality worker continues.
- Restrict the fast profile to the first implementation delegation; route every correction and retry to quality.
- Render a per-spawn profile override for native Codex and a generated fast sidecar for native Claude Code; keep portable output correct and explicitly unoptimized in the first version.
- Preserve quality-tier specialist review and independent validation after fast implementation.
- Add structural guards and an opt-in field pilot that observes routing, fallback behavior, latency, supported cost proxies, workflow completion, and review findings in real `build` and `refactor` runs.
- Activate the pilot only through a project-level Effective Flow opt-in that can be disabled without migration.
- Store local minimal pilot measurements by default and allow detailed local traces only after an explicit per-run opt-in.

### Non-goals

- No override of the caller or orchestrator model; that remains user- and host-owned.
- No fast execution for `fix`, `iterate`, `merge-gate`, conflict resolution, reviewers, security-sensitive work, migrations, or unresolved design work in the first version.
- No fast validation repair, review incorporation, retry, or other corrective implementation.
- No repository-level configuration of concrete model names in the first version; profiles express intent and are mapped per harness.
- No redesign of workflow phases, existing concurrency rules, worker leaf boundaries, or delivery ownership.
- No claim that model routing reduces shell, test-suite, network, forge, or other non-model latency.
- No fast-executor optimization in portable managers in the first version.

## Technical direction

The source remains Markdown contracts under `src/`, transformed by the existing dependency-free Node.js build into native Claude Code, native Codex, and portable outputs. One shared policy describes profile semantics, eligibility, escalation, and fallback. Harness-specific build rendering turns the fast profile into an explicit Codex model-and-effort override and a generated Claude Code fast sidecar. Workflow sources refer to the profile intent rather than duplicating provider model names.

The coarse responsibility split remains unchanged: the caller orchestrates, the selected implementer writes within a bounded scope, economical workers add tests and validation, and quality-tier reviewers judge the result. The profile selection is metadata on an existing delegation boundary rather than a new agent hierarchy.

The coordinator records the gate outcome and the first decisive reason for each packet. Existing project routing remains the source of bucket identity; model tiering neither reclassifies files nor creates a second routing system.

Pilot activation is a project policy in the existing Effective Flow project-setup configuration. It defaults to off. When enabled, eligible native packets use the fast profile without another interactive question; ineligible packets and portable runs continue on their existing path. Disabling the policy is the rollback and requires no cleanup beyond the ordinary pilot-data retention rule.

Escalation is a continuation in the same verified execution checkout, not a clean restart. The orchestrator owns the transfer record and the single-escalation limit. The quality worker treats the retained diff as untrusted intermediate work, inspects it before writing, and remains bounded by the original approved packet.

The profile decision is consumed by the initial implementation spawn. Subsequent implementation delegations for that packet are quality-only, regardless of why the initial worker returned or which later gate found the defect.

No external service or new persistent application datastore is required. The first evaluation is an opt-in field pilot rather than a controlled paired benchmark. Its default record is local and minimal: workflow type, harness, selected profile, phase duration, fallback category, validation and review outcome, and completion status. It contains no prompts, diffs, source contents, file paths, secret values, environment values, or personal data.

An explicit per-run opt-in may add a detailed local trace with worker handoffs, affected paths, command outcomes, escalation context, and review findings. Raw secret or environment values and unredacted source contents remain prohibited even in detailed mode. Both modes live only in gitignored runtime state and are deleted after the selected pilot review. Publication requires a separate explicit release of an aggregated, redacted summary.

Aggregate results may be compared with pre-pilot history, but the review must disclose that task mix, host load, repository checks, and model availability limit causal claims.

Correctness gates remain prerequisites rather than metrics that speed can trade away. Pause the pilot immediately for an attributable critical safety, data-integrity, authorization, or scope-boundary failure. Change the routing policy when fallback or quality-correction patterns cluster, and keep the optimization only when real runs show a sustained latency or supported cost-proxy benefit without a material workflow-success or review regression. The pilot and its thresholds are deliberately reversible.

The direction depends on current host capabilities documented for [Codex sub-agent model overrides](https://github.com/openai/codex) and [Claude Code sub-agents and workflows](https://code.claude.com/docs/en/agents). Concrete model aliases are intentionally replaceable because host availability and naming can change.

**ADR candidate – Native execution-profile representation:** Record the hybrid Codex override and Claude Code sidecar design, plus the deliberate absence of portable optimization, because these cross-harness guarantees are durable and costly to reverse.

**ADR candidate – Fail-closed pilot policy and adoption gate:** Record project-level opt-in, packet-level eligibility, quality-only correction, retained-state escalation and the reversible keep/change/stop policy because they define the long-lived safety boundary for future model changes.

## Risks and open questions

- Faster executors may miss cross-file dependencies and create enough correction work to erase the latency and cost benefit.
- The coordinator's risk classification can be wrong; the first version therefore needs conservative exclusions and observable fallback reasons.
- A user may run a weak caller model even though the concept assumes strong planning and coordination. Effective Flow can recommend, but currently does not control, that choice.
- Model availability, aliases, and supported reasoning settings differ by harness and can change independently of Effective Flow.
- Native and portable distributions may remain behaviorally equivalent while realizing different performance gains.
- Repository checks may dominate wall-clock time, making model tiering a weak optimization for some projects.
- A field pilot cannot isolate model choice as cleanly as paired runs. Its initial signals remain at least 25% lower median implementation-phase wall time, at least 30% lower supported executor-cost proxy, and at least 70% fast-tier completion without escalation, with no material regression in workflow completion, CI success, important review findings, or merge-gate correction rounds. These are review hypotheses rather than irreversible release promises.

## Roadmap and work packages

1. **Execution-profile and activation contract**
   - **Goal:** Establish one canonical policy for profile meaning, project opt-in, packet eligibility, correction boundaries, retained-state escalation and portable behavior.
   - **Rough scope:** Shared workflow contract, project-setup configuration semantics, fallback rules and the two ADR candidates; no workflow adopts Fast yet.
   - **Done when:** Defaults, exclusions, gate evidence, state-transfer fields, rollback and target guarantees are unambiguous and structurally testable.
   - **Dependencies:** None.
   - **Handoff:** `effective-flow plan "Work package 1 — define the execution-profile and activation contract from docs/concept/2026-09-21-risk-aware-model-tiering.md, including project opt-in, packet eligibility, retained-state escalation, correction boundaries, portable semantics and ADR candidates"`
2. **Native profile rendering**
   - **Goal:** Make the fast-executor intent enforceable in both native targets without weakening the registered quality default.
   - **Rough scope:** Codex per-spawn model-and-effort override, generated Claude Code fast sidecars, build registration and distribution guards; portable output remains unoptimized.
   - **Done when:** Each native target renders only its supported mechanism, model mappings stay centralized, missing or invalid mappings fail safely, and portable artifacts contain no native profile metadata.
   - **Dependencies:** Work package 1.
   - **Handoff:** `effective-flow plan "Work package 2 — implement native profile rendering from docs/concept/2026-09-21-risk-aware-model-tiering.md with Codex spawn overrides, generated Claude Code fast sidecars, centralized mappings and portable non-optimization guards"`
3. **Pilot measurement and trace lifecycle**
   - **Goal:** Capture enough local evidence to evaluate the field pilot without creating uncontrolled telemetry.
   - **Rough scope:** Gitignored runtime records, minimal default fields, detailed per-run opt-in, redaction, retention, aggregation and deletion after pilot review.
   - **Done when:** Tests prove the allowed and prohibited fields, opt-in boundary, secret handling, retention cleanup and aggregated-summary path.
   - **Dependencies:** Work package 1.
   - **Handoff:** `effective-flow plan "Work package 3 — implement the local pilot measurement and trace lifecycle from docs/concept/2026-09-21-risk-aware-model-tiering.md, including minimal defaults, detailed per-run opt-in, redaction, retention, aggregation and deletion"`
4. **`build` field-pilot integration**
   - **Goal:** Route only the first implementation delegation of eligible native `build` packets through Fast while preserving all existing completion gates.
   - **Rough scope:** Project opt-in, per-bucket gate, mixed-scope handling, native spawn selection, retained-state escalation, quality-only correction and pilot measurements.
   - **Done when:** Representative workflow evaluations prove fail-closed routing, unchanged review and validation, bounded escalation, quality-only corrections and correct behavior when the pilot or native override is unavailable.
   - **Dependencies:** Work packages 1–3.
   - **Handoff:** `effective-flow plan "Work package 4 — integrate the risk-aware fast-executor field pilot into build as specified by docs/concept/2026-09-21-risk-aware-model-tiering.md, preserving packet routing, quality corrections, escalation and all completion gates"`
5. **`refactor` field-pilot integration**
   - **Goal:** Apply the same first-delegation optimization to eligible native `refactor` packets without weakening behavior invariance.
   - **Rough scope:** Reuse the activation, gate, target rendering, escalation and measurement contracts while preserving baseline comparison and refactor-specific review.
   - **Done when:** Representative workflow evaluations prove unchanged before/after behavior, fail-closed routing, quality-only corrections and safe rollback to quality-only execution.
   - **Dependencies:** Work packages 1–4.
   - **Handoff:** `effective-flow plan "Work package 5 — integrate the risk-aware fast-executor field pilot into refactor as specified by docs/concept/2026-09-21-risk-aware-model-tiering.md, preserving baseline comparison, behavior invariance, quality corrections and rollback"`
6. **Field-pilot review and adoption decision**
   - **Goal:** Decide from real opt-in runs whether to keep, change or stop the optimization.
   - **Rough scope:** Aggregate redacted evidence, disclose field confounders, review latency, supported cost proxy, escalation, workflow success and findings, then update architecture and user guidance for the decision.
   - **Done when:** The owner records a keep/change/stop decision, clustered fallback causes become routing changes or explicit exclusions, detailed traces and raw pilot records are deleted, and only an explicitly approved aggregate remains.
   - **Dependencies:** Work packages 4 and 5.
   - **Handoff:** `effective-flow plan "Work package 6 — evaluate the opt-in field pilot from docs/concept/2026-09-21-risk-aware-model-tiering.md, make the reversible keep-change-stop decision, update routing policy and documentation, and complete pilot-data cleanup"`

## Concept review

**Result:** Approved

| Area                  | Assessment                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| Product fit           | A reversible field pilot tests the plausible opportunity without claiming unmeasured value.                  |
| Scope                 | A narrow `build` and `refactor` pilot is coherent; only the initial implementation spawn may be fast.        |
| Technical feasibility | Native representation is selected: Codex per-spawn override, Claude Code fast sidecar, portable unoptimized. |
| Data and security     | Minimal local data is the default; detailed local traces require per-run opt-in and remain redacted.         |
| Risks                 | Escalation and eligibility are fail-closed; project opt-in and disablement keep adoption reversible.         |
| Roadmap               | Six ordered work packages separate policy, rendering, measurement, workflow adoption and pilot review.       |

### Findings

- **Critical – Cross-harness enforcement (incorporated):** V1 uses a Codex per-spawn model-and-effort override, a generated Claude Code fast sidecar, and no portable optimization. Behavioral correctness and profile enforcement are now distinct guarantees.
- **Critical – Partial-write escalation (incorporated):** Retain the dirty state, transfer paths, requirement progress, checks and escalation reason, require the quality worker to inspect the diff first, and prohibit a second fast attempt.
- **Important – Executable eligibility (incorporated):** Classify per delegation packet or routing bucket, preserve existing project routing, require disjoint ownership for mixed-profile execution, and route every exclusion or unknown to quality.
- **Important – Correction boundary (incorporated):** Only the first implementation delegation may be fast; validation repair, review incorporation, retries and all other corrections are quality-only.
- **Important – Evaluation contract (incorporated):** Use an opt-in field pilot, keep correctness gates non-negotiable, disclose confounders, count escalation in observed outcomes, and apply explicit pause, change and keep rules.
- **Important – Measurement privacy (incorporated):** Default to local minimal fields; permit detailed local traces only by per-run opt-in; prohibit raw secrets, environment values and unredacted source; delete detailed traces after review and publish only separately approved aggregates.
- **Important – Activation policy (incorporated):** The pilot is disabled by default, enabled project-wide through Effective Flow configuration, and reversible without migration; eligible packets then route automatically without per-run prompts.
- **Important – Evidence wording (incorporated):** The motivation presents latency and cost reduction as hypotheses to be tested through real opt-in runs before wider adoption.
- **Note – Durable decisions (incorporated):** Native profile representation and the fail-closed pilot/adoption policy are explicit ADR candidates; concrete model aliases and measured thresholds remain replaceable values.

## Open points

- No open points.
