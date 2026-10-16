# Per-spawn model tiers and a lean orchestrator

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Effective Flow orchestrators shall run every delegated subagent on a model and reasoning effort that fits the task, in every build target. They shall also move the heaviest inline work out of the main session, so that it does lightweight orchestration only.

Drafted on 2026-10-16 against `develop` at `6055c94`. At publication `origin/develop` was at `1c67144`. Of the files below, it already changes `build.mjs`, `docs/developer-guide/build-system.md`, `docs/developer-guide/configuration.md` and `docs/user-guide/getting-started.md`. Rebase onto `origin/develop` and re-measure `CONTEXT_BUDGET_LINES` before implementing.

Measured motivation (investigation of 2026-10-11 to 2026-10-16, `.effective-flow/investigation/investigation-2026-10-16-model-distribution-token-usage.md`, local only):

- 99.4 % of Claude Code usage ran on Opus 5.5 at effort `high`.
- The orchestrator main session carried 68 % of cost. Its average context was 422k tokens per request, and 90 % of its cost was cache read/write.
- Subagents carried 32 %: all portable `general-purpose` workers and Explore fan-outs inheriting the parent model.
- Sessions dominated by `merge-gate` carried 68 % of total cost.

Root causes:

- **Portable tiers nothing, by design.** `docs/adr/native-execution-profile-representation.md:36-39` keeps portable Quality-only, and `build.mjs:1922-1940` blocks model metadata in portable output.
- **Heavy work runs in the caller's context.** Workflow-to-workflow handoffs run there (`merge-gate` → `iterate` and others), and so does the `effective-delivery` judgment, which loads into the orchestrator.

Host capability as reported on 2026-10-16:

- **Claude Code 2.1.292:** the Agent tool takes a per-invocation `model` (aliases `haiku`, `sonnet`, `opus`) and `effort`. The per-invocation value wins over agent frontmatter and `CLAUDE_CODE_SUBAGENT_MODEL`.
  - `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` disables it, and `CLAUDE_CODE_EFFORT_LEVEL` overrides effort.
  - Subagents nest up to depth 3 by default.
  - Only the precedence over frontmatter is confirmed first-hand (the Agent tool schema in a live session). The rest comes from the documentation and is re-checked in the manual host check.
- **Codex:** a per-spawn `model` + `reasoning_effort` override ships for the native Fast path (`{{AGENT_PROFILE}}` rendering, `build-lib.mjs:3456-3469`). Its use with the built-in default agent is unverified and gated below.

Workflow rationale: this is deliberate new behavior across all targets (a new delegation contract, new build metadata, an ADR change), hence Feature.

Delivery: Stage A (per-spawn tiers) and Stage B (lean orchestrator at two concrete sites) ship as two pull requests from this plan. There is no release between them, and the three eval suites are re-recorded once, after Stage B.

## Architecture decisions

- **Three provider-neutral tiers** `mechanical`, `standard` and `deep`. Workflow prose names only the tier, never a model. The mapping lives once in build metadata (`MODEL_TIER_MAPPINGS` in `build.mjs`, next to `AGENT_PROFILE_MAPPINGS`):

  | Tier         | Claude Code         | Codex                     |
  | ------------ | ------------------- | ------------------------- |
  | `mechanical` | `haiku` / `low`     | `gpt-5.6-luna` / `low`    |
  | `standard`   | `sonnet` / `medium` | `gpt-5.6-luna` / `medium` |
  | `deep`       | `opus` / `high`     | `gpt-5.6-sol` / `high`    |

  The user chose `deep` = `opus`/`high`. This lowers native Claude implementers, reviewers and the merge-conflict resolver from `xhigh` to `high`; the Codex values stay byte-identical. The build validates Claude models against exactly `haiku`, `sonnet` and `opus`.

- **Role default tier as the single source.** Every `src/agents/*.md` declares one `tier:` instead of the four model/effort fields in its `claude:`/`codex:` blocks. The build derives native frontmatter from the mapping.
  - `deep`: the 5 implementers, the 4 reviewers and `merge-conflict-resolver`.
  - `standard`: `code-validator`, `test-writer`, `e2e-tester`, `docs-writer`, `code-documenter` and `marketing-writer`.
  - Native frontmatter stays as the harness-enforced fallback when no per-spawn value is passed.
- **A complete spawn-site table.** `src/shared/model-tiers.md` contains a table keyed by spawn site (tool + step), naming the task class of every spawn that is not a worker:
  - Explore and analysis sub-agents: `standard`;
  - plan-review fan-out and the Stage B judgment subagent: `deep`;
  - review source sub-agents (`review.md:452`): `standard`;
  - the Stage B delegated `merge-gate` run: `deep`;
  - cleanup and inventory scans: `mechanical`.

- **Tier values at the spawn site (user decision).** Every spawn instruction in `src/tools` and `src/shared` carries a marker line `<!-- spawn-site:<tool>/<id> -->` in the same paragraph. The build removes the marker line and renders the site's resolved tier with its values in its place: one line in the target's own form for the Claude or Codex target, and a short two-harness form for portable. The values therefore sit at the decision point, and a skipped lazy load cannot leave a spawn silently inheriting the parent model. `model-tiers` stays lazy and carries only the margin and override rules plus the full table.
  - **Detection rule for the contract test.** A paragraph that contains a spawn instruction must carry a marker. Spawn instructions are found through `{{AGENT:…}}`/`{{AGENT_PROFILE:…}}` references and a fixed phrase list (`sub-agent`, `subagent`, `fan-out`, `Explore`). Mentions that are not spawns (for example `merge-gate.md:66-72`) are recorded in an allowlist, each with a reason. The test reconciles markers and table rows in both directions.
  - **Sites with no downward move.** The site table flags sites where the ±1 margin may not go down, even for a `standard` role: the `code-validator` that verifies a `merge-gate` conflict resolution (`merge-gate.md:303-304`), and every validation or correction site of a Fast-pilot packet.

- **Every spawn carries a tier, in every target.** Claude passes `model` + `effort` on the Agent tool, Codex `model` + `reasoning_effort` on the spawn. Native targets also pass it, so one rule governs all targets.
- **The ±1 margin, bounded (user decision, constrained by the Fast pilot).**
  - Roles and sites whose default is `deep` never move down: a cheaper implementer exists only through the gated Fast selector.
  - `standard` roles and sites may move one step up or down, for a stated reason that appears in the spawn handoff and in the run summary. Example: a validator re-run after a pure docs change goes down; a failing cross-module validation goes up.
  - A move past either end of the scale is a no-op.
  - A retry or correction after a failed attempt runs at least on the role default.
- **Portable renders harness-keyed values, not prose.** Portable output is one artifact for Claude Code and Codex. Its `model-tiers` fragment carries a generated table between markers, one column per spawn mechanism, and each spawn site carries the short two-harness form. A host with neither mechanism inherits as today and says so once. Provider names may appear in portable output only in build-generated tier text, meaning the marked table and the rendered spawn-site lines; the guard knows both shapes.
- **Host overrides are respected, never bypassed.**
  - On Claude Code, an Agent tool without a `model` parameter means the host forces the subagent model (for example through `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`): the orchestrator passes only the tier's `effort` and says once that the host sets the subagent model (revised after the force counter-check; the first version passed no tier parameters).
  - A spawn rejected because of a tier parameter is retried once without it. If attribution between `model` and `effort` is unclear, the retry drops both. The rejected parameter is then omitted for the rest of the run and reported once.
  - `CLAUDE_CODE_EFFORT_LEVEL` is documented as a user override and not detected.
- **The Fast pilot keeps its contract.**
  - `{{AGENT_PROFILE:X:fast}}`, its gate, its first-attempt rule and its measurement stay unchanged.
  - The Quality intent token `strongest-available-configured-implementation-capability` stays. Prose in `src/shared/execution-profiles.md` and `docs/adr/risk-aware-model-tiering-pilot-policy.md` states that the configured strongest capability is the role's `deep` tier.
  - **Generation boundary for every install (user decision): protocol 1.2.0 with a migration.**
    - The Quality-mapping identity (the `deep` tier values per harness) becomes part of `protocolSource` in `pilot-measurement-protocol.mjs`, and therefore of `PILOT_MEASUREMENT_PROTOCOL_DIGEST`. A build guard checks the identity in the copied script against `MODEL_TIER_MAPPINGS`, because runtime scripts are copied byte for byte (`build.mjs:1536-1538`).
    - A one-step migration in `pilot-measurement-core.mjs` recognizes a persisted generation under the previous protocol digest. It moves that generation to suspended with the reason `quality-mapping-changed` before `validatePersistedState` (core 1035-1063) would reject the unknown digest as `UNSAFE_STORAGE`.
    - Evidence is never mixed across the change, on every user's machine.
  - **Reservation and `BLOCKED-USER` (user decision).** A delegated `merge-gate` run that returns `BLOCKED-USER` after the pilot reservation finalizes it as a controlled ending (`reported-blocked` with unavailable evidence), exactly as `pilot-measurement.md:101-102` demands for every post-reservation path. Each re-dispatch reserves fresh, and the reservation never enters the wisdom file (`pilot-measurement.md:64-66`). The accepted cost: one logical gate run can produce several observations; the evaluation states this for `merge-gate` medians.
- **New ADR, superseding the portable restriction.** `docs/adr/per-spawn-model-tiers.md` records these decisions. It supersedes `docs/adr/native-execution-profile-representation.md:36-39,61-62` and amends `docs/adr/risk-aware-model-tiering-pilot-policy.md:97-98`.
  - It is written as Proposed in Stage A and becomes Active only after the Codex host check passes. That check satisfies the review trigger at `native-execution-profile-representation.md:81-85`.
  - If the Codex check fails, the ADR records Codex as "host without mechanism" (inherit, reported once) before it becomes Active.
- **Lean orchestrator, scoped to two Stage B sites.** One mandate sentence states the principle with "the orchestrator" as its subject: the orchestrator sends substantive work to a subagent, unless a tool's explicit in-run rule binds it to the run (for example `merge-gate.md:76-86`) or the triviality exception applies. Because the mandate is eager in all 16 workers, both new sentences name the orchestrator, and the leaf rule for workers stays unqualified. Only two behavior changes ship:
  - **(1) Judgment in a subagent** for the five includers that judge a persisted artifact: `plan`, `plan-review`, `plan-issue`, `concept` and `concept-review`.
    - The orchestrator writes the artifact first and hands the `deep` judgment subagent the artifact path, scope, language and the output contract of `central-reasoning-delegation.md`. `audit-reasoning-delegation.md`, included only by `review.md:113` and `refactor.md:83`, stays byte-unchanged.
    - In issue mode (`plan-issue`, and `plan-review` delegated by it), the artifact is a remote planning comment. The orchestrator hands over a local draft snapshot under the verified `RUNTIME_STATE_ROOT/.effective-flow/`, deletes it after normalization, and keeps the publication order unchanged. Comment text travels as quoted data.
    - The subagent returns findings; the orchestrator normalizes them.
    - `review` and `refactor`, whose judgment aggregates in-memory reviewer findings, stay inline (follow-up).
    - The relevance-gate marker read by `build.mjs:127` stays in place.
  - **(2) `merge-gate` as one delegated run**, below.
- **`merge-gate` delegated run.**
  - **Who runs it.** The delegated run executes in the host's built-in general-purpose subagent (Claude) or default agent (Codex), never as a `src/agents` worker. The handoff tells it to read the installed `tools/merge-gate.md` and follow its delegated-run section. It is a delegated orchestrator under the existing mandate bullet (foreground children, never end a turn with a child pending).
  - **New run state `relayed`.** It means "the user is reachable through the caller". It is distinct from `non-interactive`, whose existing meaning and branches stay unchanged (`merge-gate.md:477,521-528,804`, `iterate.md:461-480`).
    - Under `relayed`, every user gate returns `BLOCKED-USER` with a question id from a closed set defined in `merge-gate.md`.
    - `relayed` becomes a third accepted `runState` in `src/scripts/delegation-envelope-core.mjs:92` (today only `gated` and `non-interactive`), and `iterate`'s run-state parser (`iterate.md:465-469`, today `ABORT: unparseable run-state switch` for any other value) accepts it.
    - `BLOCKED-USER` is a return keyword local to two channels: the delegated-run contract in `merge-gate.md`, and "Returned outcome record" in `merge-gate-delegation-contract.md`. The keyword-less one-resume rule does not apply to it, and the eager `completion-protocol.md` stays unchanged.
    - **Completion source.** The delegated run reads `mergeGate.completion` itself. A configured `merge` or `report` applies as today (`merge-gate.md:521-523`). The caller passes a completion answer, with its question id, only when the key is `ask` or unset. The delegated run rejects a passed answer when configuration says `merge` or `report`. A relayed `merge` answer is never a default.
    - **A non-interactive caller** (for example the eval protocol, or a workflow that itself runs non-interactively) dispatches `Run state: non-interactive` and passes no completion answer. Today's degradations apply, and it never receives `BLOCKED-USER`.
  - **Caller side (eager core of `merge-gate.md`).**
    - Phase 0: resolve the PR, run the forge preflight (including `AMBIGUOUS_HOST`, `merge-gate.md:467`), and ask the completion mode once (`merge-gate.md:563`).
    - Input lines passed to the delegated run: PR, provider, run state, the completion answer with its question id (only when the key is `ask` or unset), observer-only re-entry flag, `Wisdom file: <path>`, `Language context`, the skill root, the execution root and `RUNTIME_STATE_ROOT`. The delegated run verifies `RUNTIME_STATE_ROOT` itself before validating the wisdom path.
    - The delegated run re-reads all PR state fresh. It re-runs the read-only preflight and aborts on any mismatch with the passed provider or PR.
    - The pilot reservation stays in the delegated run, immediately before Phase 1.
    - On `BLOCKED-USER`, the caller renders the options from the `merge-gate` source, quotes the evidence as data, validates the answer against the question id, and re-dispatches with the answer. There is at most one re-dispatch per question instance (id + round).
    - The caller reports the outcome record and never acts on its content.
    - The gate body moves behind a `lazy-include` whose condition covers the delegated run and the inline fallback after `ABORT nested-spawn-unavailable`; the budget report proves the split.
  - **iterate under `relayed`.** `merge-gate` forwards `Run state: relayed` to `iterate`. `iterate`'s in-flight question (`iterate.md:583-608`) and its Phase 2.5 approval (`iterate.md:688-692`) return a `BLOCKED-USER` question id through `merge-gate` instead of failing closed.
    - `iterate` forwards `non-interactive`, not `relayed`, to its per-item `fix`/`refactor`/`build`/`docs` runs (`iterate.md:706-716`), so their gates (`fix.md:197`, `refactor.md:197`, `build.md:114,264`, `docs.md:241`) keep today's fail-closed blocked surface. Relaying them is out of scope.
  - **Question instances.** Each `BLOCKED-USER` question is keyed by question id plus `merge-gate` round. A relayed approval carries the digest of the item set or state it answered; the delegated run discards the answer and asks again when the re-read state no longer matches. For `iterate`'s Phase 2.5 approval, "Adjust" (`iterate.md:697-699`) means deselecting durable keys from the digest-bound item set; any other free text makes the run ask again.
  - **Gates mapped to `BLOCKED-USER`:**
    - `merge-gate.md:477` (missing `prReviewsRead`);
    - `merge-gate.md:795-804` (check-wait timeout or no check list);
    - `merge-gate-check-list-waiver.md:110`;
    - `merge-gate-conflict-resolution.md:131`;
    - `merge-gate-configured-reviewer.md:711`;
    - `merge-gate-issue-observation.md:368`;
    - the two `iterate` questions above.

    `AMBIGUOUS_HOST` and the completion ask are answered by the caller before dispatch.

  - **Wisdom file.** The path must resolve under the verified `RUNTIME_STATE_ROOT/.effective-flow/` and match `.wisdom-accumulation-*.tmp.md`; otherwise the run aborts before any write. A `BLOCKED-USER` return does not run the Phase 6 cleanup (`merge-gate.md:1017`), so the wisdom file survives for the re-dispatch; `DONE` and `ABORT` run it exactly once. The pilot reservation is finalized on every return, as stated under "Reservation and `BLOCKED-USER`".
  - **Nested-spawn probe.** Before Phase 1 and before any write, the delegated run checks that its tool set has a spawn mechanism. Without one, it returns `ABORT nested-spawn-unavailable`, and the caller runs the gate inline as today, saying so once. `merge-gate.md:72-74` stays intact.

## Affected files

| File                                                                                                                                                                                                                                                                                                                                                                                      | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build.mjs`                                                                                                                                                                                                                                                                                                                                                                               | A: `MODEL_TIER_MAPPINGS` and its validation; derive native agent frontmatter from `tier:`; render the tier table and the per-site tier lines per target, replacing each `<!-- spawn-site:… -->` marker line; portable guards at 1922-1940 allow provider names only in build-generated tier text; a guard that the Quality-mapping identity in the copied pilot script matches `MODEL_TIER_MAPPINGS`; `CONTEXT_BUDGET_LINES` raised by the measured deltas. B: budget entries for the split `merge-gate` and the five judgment includers |
| `build-lib.mjs`                                                                                                                                                                                                                                                                                                                                                                           | A: mapping validation against `CLAUDE_EFFORT_LEVELS` and `CODEX_MODEL_REASONING_EFFORTS` (`build-lib.mjs:214-228`) and the Claude alias set; the tier-block renderer. No change to `HARNESS_TOOL_PARAMETER_OWNERSHIP`                                                                                                                                                                                                                                                                                                                    |
| `src/agents/*.md` (16 files)                                                                                                                                                                                                                                                                                                                                                              | A: one `tier:` replaces the four model/effort fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/shared/model-tiers.md` (new)                                                                                                                                                                                                                                                                                                                                                         | A: vocabulary, role defaults (generated from `src/agents`), the spawn-site table with its no-downward-move flags, the margin rules, host-override rules, the marked harness block                                                                                                                                                                                                                                                                                                                                                        |
| `src/shared/delegation-mandate.md`                                                                                                                                                                                                                                                                                                                                                        | A: one eager sentence, "every spawn carries its tier per `model-tiers`", with a lazy pointer. B: one sentence for the lean principle with its precedence clause. Stays at or below the 16-line cap                                                                                                                                                                                                                                                                                                                                       |
| `src/shared/execution-profiles.md`                                                                                                                                                                                                                                                                                                                                                        | A: Quality prose names the role's `deep` tier (intent token unchanged); the generation-boundary rule                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/scripts/pilot-measurement-protocol.mjs`, `src/scripts/pilot-measurement-core.mjs`, `src/shared/pilot-measurement.md`                                                                                                                                                                                                                                                                 | A: protocol 1.2.0 with the Quality-mapping identity in `protocolSource`; the one-step migration to suspended(`quality-mapping-changed`). B: `reported-blocked` finalization for a `BLOCKED-USER` return                                                                                                                                                                                                                                                                                                                                  |
| `scripts/compare-native-agent-baseline.mjs`                                                                                                                                                                                                                                                                                                                                               | A: an explicit expected-config-delta allowlist (Claude `effort` `xhigh` → `high` in the 10 `deep` workers) instead of skipping changed workers (lines 170-205)                                                                                                                                                                                                                                                                                                                                                                           |
| `src/tools/merge-gate.md`                                                                                                                                                                                                                                                                                                                                                                 | B: caller core, delegated-run section behind a `lazy-include`, `relayed` input and return contract, closed question-id set, wisdom-path validation, nested-spawn probe                                                                                                                                                                                                                                                                                                                                                                   |
| `src/tools/iterate.md`                                                                                                                                                                                                                                                                                                                                                                    | B: `relayed` run state; the two questions return a `BLOCKED-USER` id; per-item runs still receive `non-interactive`                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/scripts/delegation-envelope-core.mjs`, `src/scripts/delegation-envelope.mjs`                                                                                                                                                                                                                                                                                                         | B: accept `relayed` as a third `runState` (`delegation-envelope-core.mjs:92`)                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/shared/merge-gate-delegation-contract.md`, `src/shared/merge-gate-check-list-waiver.md`, `src/shared/merge-gate-conflict-resolution.md`, `src/shared/merge-gate-configured-reviewer.md`, `src/shared/merge-gate-issue-observation.md`                                                                                                                                                | B: `relayed` branches for the listed gates; forwarding of `relayed` to `iterate`                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/shared/central-reasoning-delegation.md`                                                                                                                                                                                                                                                                                                                                              | B: judgment in a `deep` subagent for the five artifact-based includers, with the handoff fields, the output contract and the issue-mode draft snapshot; the relevance-gate marker stays. `audit-reasoning-delegation.md` stays byte-unchanged                                                                                                                                                                                                                                                                                            |
| `src/tools/plan.md`, `plan-review.md`, `plan-issue.md`, `concept.md`, `concept-review.md`                                                                                                                                                                                                                                                                                                 | B: write the artifact before the judgment handoff where they do not already                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `test/build-lib.test.mjs`, `test/execution-profile-rendering.test.mjs`, `test/execution-profile-contract.test.mjs`, `test/execution-profile-workflow-contract.test.mjs`, `test/native-sidecar-config.test.mjs`, `test/native-agent-inventory.test.mjs`, `test/delegation-mandate-contract.test.mjs`, the pilot-measurement tests, the delegation-envelope tests, the baseline-script test | A/B: portable-exclusion assertions (`execution-profile-rendering.test.mjs:200-226`) adapted to build-generated tier text; the portable Fast sentence (`execution-profile-workflow-contract.test.mjs:1739`) stays, because portable remains without Fast; new tests per the validation plan                                                                                                                                                                                                                                               |
| `docs/adr/per-spawn-model-tiers.md` (new), `docs/adr/native-execution-profile-representation.md`, `docs/adr/risk-aware-model-tiering-pilot-policy.md`                                                                                                                                                                                                                                     | A: new ADR (Proposed, then Active after the Codex check); superseded/amended notes with a link                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `AGENTS.md`                                                                                                                                                                                                                                                                                                                                                                               | A: the `src/agents` frontmatter rule (`claude:` requires `model` and `effort`) becomes `tier:`; the Execution profiles paragraph mentions tiers                                                                                                                                                                                                                                                                                                                                                                                          |
| `docs/developer-guide/architecture.md`, `docs/developer-guide/build-system.md`, `docs/developer-guide/configuration.md`, `docs/developer-guide/model-tiering-pilot-protocol.md`, `docs/user-guide/getting-started.md`, `docs/user-guide/tools-implement.md`                                                                                                                               | A: tiers, mapping ownership, host overrides; a per-spawn tier now overrides `CLAUDE_CODE_SUBAGENT_MODEL`, and `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` is the opt-out; the spawn-site directive row in `build-system.md` "Placeholder and directive syntax"; protocol 1.2.0 and its migration in the pilot protocol doc, including the stale "no released generation exists" (lines 360-363). B: the `merge-gate` delegated run and judgment delegation                                                                                        |
| `evals/merge-gate/`, `evals/iterate/`                                                                                                                                                                                                                                                                                                                                                     | B: `merge-gate` scenarios for a `non-interactive` caller dispatching the delegated run (`DONE`, nested-spawn abort); an `iterate` scenario for `Run state: relayed` parsing; the README states that the recorded profile is the caller's; then one re-record of all three suites                                                                                                                                                                                                                                                         |

## Implementation details

### Approach

**Stage A – per-spawn tiers (first pull request)**

1. Add `MODEL_TIER_MAPPINGS` and fail the build if any of these holds:
   - a tier or harness is missing, or the key set is not exactly `mechanical`/`standard`/`deep`;
   - a Claude model is outside `haiku`/`sonnet`/`opus`, or a Claude effort is outside `CLAUDE_EFFORT_LEVELS`;
   - a Codex model/effort pair is outside `CODEX_MODEL_REASONING_EFFORTS`.
2. Replace the per-agent fields with `tier:` in all 16 `src/agents/*.md`. Fail the build on a missing, unknown or duplicate `tier:`. The `-fast` sidecars keep `AGENT_PROFILE_MAPPINGS`.
3. Write `src/shared/model-tiers.md` with the role defaults, the spawn-site table, the margin rules, the host-override rules and the marked harness block. Target rendering:
   - Claude target: Claude column only;
   - Codex target: Codex column only;
   - portable: both columns, keyed by spawn mechanism.
4. Place a spawn-site marker at every spawn instruction, record the non-spawn allowlist, and add the build directive that replaces each marker line with the site's rendered tier line. Add its row to `build-system.md` "Placeholder and directive syntax".
5. Add the eager tier sentence to `delegation-mandate.md` with a lazy pointer to `model-tiers`. The router Rules (`src/SKILL.md:50-51`) keep pointing at the mandate, without a second copy.
   - Expected delta: +1 line in every tool that includes the mandate.
   - Tools with 0 headroom (apply-issues, iterate, maintain, fix) and 1 line of headroom (plan, review) get their `CONTEXT_BUDGET_LINES` entry raised by the measured value from the `node build.mjs` report.
6. Adapt the portable guards:
   - line-start `model:`/`effort:` keys stay forbidden;
   - provider model names are allowed only in build-generated tier text (the marked table and the rendered spawn-site lines);
   - Fast stems and the native-agent inventory stay forbidden.
7. Update `execution-profiles.md` and the risk ADR (the Quality prose; the generation boundary). Ship pilot protocol 1.2.0 with the identity guard and the one-step migration. Extend `compare-native-agent-baseline.mjs` with the expected-config-delta allowlist. Write the new ADR as Proposed and update `AGENTS.md` and the docs.
8. Run the manual host checks (validation plan). Set the ADR to Active only after the Codex check, or record Codex as inheriting before that.
9. Commit as `feat:` with no breaking marker; release-please derives the version.

**Stage B – lean orchestrator (second pull request, after Stage A merged; no release in between)**

1. Add the lean-principle sentence with its precedence clause to `delegation-mandate.md` (+1 line per includer, measured).
2. Rewrite `central-reasoning-delegation.md` for the five artifact-based includers: the artifact (or, in issue mode, a local draft snapshot) is written first, the judgment runs in a `deep` subagent with the stated handoff, and the orchestrator normalizes the result. `audit-reasoning-delegation.md`, `review` and `refactor` are unchanged.
3. Split `merge-gate.md` into the caller core and the delegated-run section behind a `lazy-include`. Add:
   - the `relayed` input lines and their validation (an unknown or malformed line aborts before any write);
   - the closed question-id set;
   - the `DONE`/`BLOCKED-USER`/`ABORT` return and the caller loop;
   - the wisdom-path validation and the nested-spawn probe.
4. Accept `relayed` in `delegation-envelope-core.mjs` and in `iterate`'s run-state parser. Add the `relayed` branches to the listed gates and fragments and to `iterate.md`, and forward `relayed` from `merge-gate` to `iterate`. Define the non-interactive caller path and the completion-source rule.
5. Finalize the pilot reservation as `reported-blocked` on a `BLOCKED-USER` return.
6. Add the eval scenarios (`merge-gate` with a `non-interactive` caller, `iterate` `relayed` parsing), then re-record all three suites once.

### Component structure

Not relevant: no UI or runtime component. The change is prompt contracts, build metadata and build guards.

### State management

- No new configuration key. Tiers are build metadata, like `AGENT_PROFILE_MAPPINGS`; `docs/developer-guide/configuration.md:273-312` stays the owner of `executionProfiles`.
- The `merge-gate` delegated run reuses the existing wisdom file (`merge-gate.md:382-435`). Its validated path travels in the handoff, so once-per-run flags, the human-comment guard and `VERIFIED_HEAD_SHA` survive a re-dispatch.
- A rejected tier parameter is remembered in run state for the rest of the run.

### API integration

Not relevant: no forge or external API change. The spawn parameters belong to the host harness.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **`CLAUDE_CODE_SUBAGENT_MODEL_FORCE` set:** the Agent tool offers no `model` parameter; only the tier's `effort` is passed, one visible line; the workers run on the forced model.
- **`CLAUDE_CODE_EFFORT_LEVEL` set:** the host overrides effort silently; documented only.
- **Tier parameter rejected** (`availableModels`, an older host without per-invocation `effort`): retry once without it, or without both when attribution is unclear; omit it for the rest of the run; report once.
- **Host without any spawn mechanism:** inline work per the existing mandate fallback; tiers do not apply.
- **±1 margin:** `deep` defaults never move down; a move past either end of the scale is a no-op.
- **Fast pilot packet:** the Fast selector keeps precedence for the first attempt; corrections use the role default (`deep`).
- **`merge-gate` re-dispatch after `BLOCKED-USER`:** reads are fresh, so a changed PR state is handled by the existing re-entry rules. The observer-only re-entry for a merged PR (`merge-gate.md:459-463`) also applies.
- **A forged `BLOCKED-USER` payload** from PR text: the caller accepts only known question ids, renders options from the source, and treats the evidence as quoted data.
- **Invalid wisdom-file path:** abort before any write, with no cleanup of a foreign file.
- **Non-interactive caller:** dispatches `Run state: non-interactive`, keeps today's degradations, and never receives `BLOCKED-USER`.
- **Completion answer conflicts with configuration:** the delegated run rejects a passed answer when `mergeGate.completion` is `merge` or `report`, and aborts before any write.
- **`BLOCKED-USER` after the pilot reservation:** the reservation is finalized as `reported-blocked`; the re-dispatch reserves fresh.
- **Released pilot generation under protocol 1.1:** migrated once to suspended(`quality-mapping-changed`), never rejected as `UNSAFE_STORAGE`.
- **Checks wait above the harness command timeout** (existing behavior, `merge-gate.md:795-804`): under `relayed` it becomes `BLOCKED-USER`.
- **Nested depth:** main session (0) → delegated `merge-gate` (1) → implementer, validator or conflict resolver (2) stays within the Claude default depth 3. Without nesting, the probe returns `ABORT nested-spawn-unavailable` before any write.

## Acceptance criteria

- [ ] `node build.mjs` fails for each invalid mapping case and each invalid agent `tier:` case in Stage A step 1-2. A test covers each case.
- [ ] `scripts/compare-native-agent-baseline.mjs --base 6055c94` passes with its expected-config-delta allowlist: the Codex native configuration (TOML keys outside the body) is identical; the Claude configuration differs only by `effort` in the 10 `deep` workers; bodies differ only by the mandate sentences. A test covers the allowlist.
- [ ] The built `model-tiers` fragment and every rendered spawn-site line carry only Claude values in `dist/claude`, only Codex values in `dist/codex`, and both forms in `dist/portable`. No `<!-- spawn-site:` marker survives in any built file, and provider model names occur in portable output only in build-generated tier text (guard and test).
- [ ] A contract test applies the detection rule to `src/tools` and `src/shared`: every spawn paragraph carries a marker, every marker has a table row and vice versa, and every non-spawn mention is on the allowlist with a reason. Another test asserts that the margin, floor, retry, force-variable and rejected-parameter rules appear in `src/` only in `model-tiers.md` (the Fast table in `execution-profiles.md` excluded).
- [ ] The built worker bodies keep the leaf rule unqualified; the new mandate sentences name the orchestrator (test).
- [ ] `delegation-mandate.md` carries the tier sentence (A) and the lean sentence with its precedence clause (B), and stays at or below 16 lines. The router Rules carry no copy.
- [ ] The Fast-pilot rendering tests (`test/execution-profile-rendering.test.mjs:240`, `test/build-lib.test.mjs:2292`) pass unchanged. Pilot tests show that a generation persisted under protocol 1.1 is migrated to suspended(`quality-mapping-changed`) instead of failing `UNSAFE_STORAGE`, that the build guard rejects a mismatched identity, and that a `BLOCKED-USER` return finalizes as `reported-blocked`.
- [ ] `docs/adr/per-spawn-model-tiers.md` exists. It is Active only with a recorded Codex check result, and both older ADRs carry a superseded/amended note linking it.
- [ ] Stage B: `merge-gate.md` defines `relayed`, the closed question-id set, question instances keyed by id + round with a state digest, the `DONE`/`BLOCKED-USER`/`ABORT` return, the wisdom-path validation and the nested-spawn probe. Every gate listed under "Gates mapped to `BLOCKED-USER`" has a `relayed` branch; `non-interactive` branches are textually unchanged; `iterate` forwards `non-interactive` to per-item runs; `delegation-envelope-core.mjs` and `iterate`'s parser accept `relayed`; a passed completion answer is rejected when configuration is `merge` or `report` (contract and unit tests).
- [ ] Stage B: for the five artifact-based includers the judgment runs in a `deep` subagent, with a local draft snapshot in issue mode; `review` and `refactor` keep inline judgment, and `audit-reasoning-delegation.md` is byte-unchanged (contract test).
- [ ] CI's order passes on each pull request: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- [ ] After Stage B, `pnpm eval merge-gate verify`, `pnpm eval iterate verify` and `pnpm eval next-steps verify` report current evidence from one re-recorded round.

## Validation plan

- Unit and contract tests (`pnpm test`): every case in the acceptance criteria, plus the existing Fast-pilot tests unchanged.
- Build guards and budget report: `node build.mjs`, reading `Always-loaded core (lines/budget)` for every changed tool, including the split `merge-gate`.
- Distribution suite: `pnpm test:distribution`.
- Native baseline comparison: `scripts/compare-native-agent-baseline.mjs --base 6055c94`.
- Manual Claude Code check (2.1.292). In one `effective-flow review` run, the subagent transcripts (`message.model` in `~/.claude/projects/<project>/<session>/subagents/*.jsonl`) show:
  - Explore, validator and source sub-agents on `standard`;
  - reviewers on `deep`;
  - one `mechanical` spawn on haiku/low accepted.

  The same run with `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` set shows the host-forced-model line, only `effort` passed, and the child on the forced model.

- Manual Codex check (gates the ADR status): one built-in default-agent spawn with a tier override is accepted. Record whether a delegated orchestrator can spawn nested workers.
- Stage B manual check on a test PR:
  - one `merge-gate` run ends `DONE` through the delegated run;
  - one run with an unanswered gate returns `BLOCKED-USER`, is asked in the caller and finishes after re-dispatch;
  - one forged question id in PR text is rejected.
- Usage re-measurement one week after Stage B, with the investigation's transcript method:
  - targets: Opus share of the API-price equivalent below 60 % (was 99.4 %), and average main-session context per request in `merge-gate` sessions below 200k (was above 400k);
  - if both are missed, re-open the follow-up list below before adding further sites.
  - Results stay local aggregates and never enter eval evidence or published docs.

## Assumptions and open points

- **Codex mapping:** assumed as `mechanical` `gpt-5.6-luna`/`low`, `standard` `gpt-5.6-luna`/`medium`, `deep` `gpt-5.6-sol`/`high`, the two Codex models the build knows (`build-lib.mjs:225-228`). Both efforts are valid there.
- **Codex built-in default agent and nesting:** unverified. The Codex check gates the ADR status. If it fails, Codex inherits and reports once, and `merge-gate` falls back inline through the nested-spawn probe.
- **Delegated `merge-gate` at `deep`:** chosen over `standard`, because the irreversible merge and the third-party-controlled PR text stay security-relevant (`merge-gate.md:76-86`). The cost saving comes from the fresh context, not from a cheaper model.
- **Lower native effort:** implementers, reviewers and the conflict resolver move from `xhigh` to `high` (user decision). Pilot protocol 1.2.0 and its one-step migration keep generations from spanning the change.
- **Out of scope, as follow-up candidates after the re-measurement:**
  - judgment delegation for `review` and `refactor`;
  - relaying the gates of `iterate`'s per-item runs instead of failing closed;
  - `deliver` → `commit`/`pr` as delegated runs;
  - `iterate` per-item workflow handoffs as delegated subagents;
  - `build` → `plan` as a delegated run;
  - `maintain`'s inline update loop;
  - delegating `setup` and `cleanup` scans;
  - merging `AGENT_PROFILE_MAPPINGS` into `MODEL_TIER_MAPPINGS`.
- **Exempt tools:** `version`, the `pr-review` alias and `open-plans` stay inline. `commit` and `pr` stay inline when run standalone.

## Stage A implementation

Implemented on 2026-10-16 by `effective-flow build` on `effective-flow/build/per-spawn-model-tiers-and-lean-orchestrator`. Stage B is not implemented; the plan status stays open until Stage B ships.

Deviations from the plan text, all recorded in `docs/adr/per-spawn-model-tiers.md`:

- The pilot protocol binds the Quality-mapping identity as a SHA-256 digest (`qualityMappingIdentity`), not as raw values: the protocol script is copied byte for byte into the portable target, which forbids provider names outside build-generated tier text.
- The orchestrator tier sentence closes the worker-start bullet of `delegation-mandate.md` instead of standing as its own bullet, so the file stays within its 16-line cap (15 lines).
- A Fast spawn passes only its Fast reference's own values, never the site's tier line (carve-out owned by `execution-profiles.md`); without it, a per-invocation tier would override the `-fast` sidecar.
- 44 spawn sites: the `concept-review` fan-out is `deep` by analogy with `plan-review`, the delegated workflow runs in `apply-issues`, `apply-review` and `iterate` are `deep`, and no `mechanical` site exists yet (no cleanup or inventory scan is a spawn today). The manual Claude check therefore proves the `mechanical` tier with a direct Agent call (`haiku`/`low`) instead of a `mechanical` site.
- Correction and respawn phrasing is not a detection candidate; such spawns resolve through the role or site default, and `deep` roles never move down.
- Guided setup block 10 never offers `resume` for a generation recorded under an earlier protocol (`inventory` exposes `protocolCurrent`); its exit runs through the helper directly.

Addendum, 2026-10-16 (user decision after the host checks): the Codex `deep` tier moves from `gpt-5.6-sol`/`high` to `gpt-6.1-sol`/`high`; Claude values, Codex `standard`/`mechanical` (`gpt-5.6-luna`) and the Fast mapping are unchanged.

- The Quality-mapping identity changes within the unreleased protocol `1.2.0`; the `1.1.0` → suspended (`quality-mapping-changed`) migration and the build's identity guard are unchanged.
- The Codex native configuration of the ten `deep` workers is no longer byte-identical: `compare-native-agent-baseline.mjs` allows the named delta `codex-deep-tier-model` (`model` `gpt-5.6-sol` → `gpt-6.1-sol`). This supersedes the "Codex native configuration is identical" part of the baseline acceptance criterion and test result.
- A read-only Codex CLI 0.159.3 check confirmed the built-in default agent accepts the `gpt-6.1-sol`/`high` override; details in the ADR status.

## Stage B implementation

Implemented on 2026-10-16 by `effective-flow build` on `effective-flow/build/per-spawn-model-tiers-and-lean-orchestrator-2`, from `origin/develop` at `e02d194`.

- **Lean sentence:** it closes the analysis-default bullet of `delegation-mandate.md`, which stays at 15 lines; no includer pays a line for it.
- **Judgment delegation:** `central-reasoning-delegation.md` carries a judgment handoff (spawn site `central-reasoning-delegation/judgment`, `deep`). The issue-mode draft snapshot sits behind the lazy fragment `judgment-draft-snapshot.md`. `concept` gained the eager mandate include, because it now spawns. `audit-reasoning-delegation.md` is byte-unchanged and pinned by SHA-256.
- **`merge-gate`:** `merge-gate.md` is the caller core (Phase 0, run states, the closed question-id table with a consequence per option, dispatch and caller loop; 1943 → 873 always-loaded lines). The gate body moved to the lazy fragment `merge-gate-delegated-run.md` (spawn site `merge-gate/delegated-run`, `deep`).
  - Question ids: `completion` (caller only), `reviews-unestablished`, `checks-pending`, `check-list-waiver`, `conflict-resolution`, `set-aside`, `issue-done`, `iterate-in-flight` (never reached from `merge-gate`), `iterate-approval`.
  - Entry runs eight ordered steps: input lines, roots, wisdom file, fresh state, completion source, stopping answer, nested-spawn probe, review verdicts.
- **`relayed`:** accepted by `delegation-envelope-core.mjs` and `iterate`. `iterate` forwards `non-interactive` to per-item runs.
- **Pilot:** a `BLOCKED-USER` return finalizes the reservation as `reported-blocked` with the transient blocker `relayed-user-decision` (`pilot-measurement.md`). No protocol change was needed.
- **Evals:** new scenarios `merge-gate/non-interactive-dispatch-reports`, `merge-gate/nested-spawn-abort-runs-inline` (tool-policy token `nesting-by-scenario`) and `iterate/relayed-run-state-clean-done`; the `merge-gate` instrument changed deliberately (`project-setup.mjs`, `configured-reviewer-scenario.mjs`).

Deviations from the plan text and additions from review:

- A question instance is keyed by id, round **and** state digest; a re-ask after state drift within one round is a new instance.
- The nested-spawn probe is behavioural: it starts one no-op `mechanical` child (spawn site `merge-gate-delegated-run/nested-spawn-probe`) and records that it passed, because Codex CLI keeps its spawn tool at the depth limit and only refuses the call. A spawn the host refuses for depth is a declined delegation, never a tier-parameter rejection (`model-tiers.md`).
- The edge case "Nested depth" above undercounts: a bot or CI repair runs main (0) → delegated gate (1) → `iterate` per-item `fix`/`build` run (2) → its implementer or validator (3); `docs/developer-guide/architecture.md` records the chain.
- A relayed `iterate-approval` travels to the approved round as the helper-built line `Approved outcomes: <identifier>=<outcome>,…` beside `Run state: non-interactive`; `iterate` returns an item whose new classification differs as `unassessed` without any write. A round without a delegated item passes none.
- A relayed stopping answer ends the run at Entry whatever its digest. After an invalid return the caller re-dispatches at most once with `Relayed answer: none`, which resolves completion to `report`.
- The caller leaves `prReviewsRead` to the delegated run, and the inline fallback applies it with the caller's own run state.
- The lean sentence keeps the plan-review wording, unbounded beyond its precedence clause; a reviewer proposal to bound it was declined as contrary to that decision.
- The manual check found the `iterate` handoff spawned as a bare nested subagent that never loaded `tools/iterate.md`; each round is now a named built-in subagent spawn at `deep` (spawn site `merge-gate-delegation-contract/iterate-delegation`) that reads it, `iterate` ends a delegated run with `DONE`, and the CI-repair instruction carries no process directive. This adds one nesting level; `architecture.md` records the chain.

## Test results

- `pnpm agent:check`, `node build.mjs`, `pnpm test:distribution`: pass.
- `pnpm test`: 2305 tests, 2303 pass, 1 skipped, 1 fail. The failure is environmental and also fails on the base commit: `test/next-steps-eval.test.mjs` "the shared seed commit disables inherited automatic Git maintenance…", because macOS blocks reading the iCloud-linked `~/.config/git/ignore`.
- `scripts/compare-native-agent-baseline.mjs --base 6055c94`: pass with the expected deltas `claude-deep-tier-effort` (10 `deep` workers, `effort` `xhigh` → `high`) and `delegation-mandate-model-tiers` (worker bodies: the tier sentence and the `model-tiers` pointer). Codex native configuration is byte-identical.
- Manual host checks, 2026-10-16: passed; `docs/adr/per-spawn-model-tiers.md` is Active and records the details.
  - Claude Code 2.1.292: subagent transcripts show `standard` on `claude-sonnet-5-5`/`medium`, `deep` on `claude-opus-5-5`/`high`, and a direct `mechanical` call on `claude-haiku-5-5`/`low`.
  - Codex CLI 0.159.3: the built-in default agent accepted `gpt-5.6-luna`/`low` and `gpt-5.6-sol`/`high` overrides (child thread settings confirm them), and a nested spawn worked at depth 2.
  - `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` counter-check (headless `claude -p` on 2.1.292 and the desktop's 2.1.299, Sonnet and Opus parents): the host drops the Agent tool's `model` parameter and forces the child onto the configured model (`claude-sonnet-5-5`, effort `high` honored). The first rule could not probe the variable and misread the missing parameter as inheritance; `model-tiers.md` now treats a missing `model` parameter as a host-forced model and passes only `effort`. A re-check on 2.1.299 confirmed the revised rule: only `effort: high` passed, no environment probe, the correct one-line notice, and the child on the forced `claude-sonnet-5-5`.
  - Observation for a later mapping decision: Codex's host default is `gpt-6.1-sol`, newer than the mapped `deep` model.
- Owed: the re-record of the three eval suites, which the plan schedules once after Stage B.

Stage B, 2026-10-16:

- `pnpm agent:check`, `node build.mjs`, `pnpm test:distribution`: pass.
- `pnpm test`: 2369 tests, 2355 pass, 13 skipped, 1 fail — the same environmental `next-steps-eval` failure as above.
- `scripts/compare-native-agent-baseline.mjs --base 6055c94`: pass with the expected deltas `claude-deep-tier-effort`, `codex-deep-tier-model`, `delegation-mandate-model-tiers` and `delegation-mandate-lean-orchestrator` (body deltas now combine in declared order).
- Always-loaded core (lines/budget): `merge-gate` 873/873, `iterate` 1572/1572, `plan` 713/713, `plan-review` 470/470, `plan-issue` 740/740, `concept` 362/362, `concept-review` 366/366.
- `pnpm eval … verify`: `next-steps` current; `merge-gate` stale (6 scenarios) plus 2 absent; `iterate` stale (6) plus 1 absent.
- Owed, not done in this run:
  - one re-recorded round of `merge-gate` and `iterate` in fresh sessions (the nested-spawn scenario needs a Codex setting under which a spawned agent's spawn is refused, e.g. `-c agents.max_depth=1`); `next-steps` currently needs none;
  - the manual Stage B check on a test PR (one `DONE`, one `BLOCKED-USER` round trip, one forged question id).

## Review findings

**Date:** 2026-10-16
**Reviewer:** generic-product-reviewer, nodejs-reviewer (plus one re-check after the incorporation pass)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    20 |
| Open / Not implemented |     0 |

By severity: 1 Critical, 5 Important, 14 Notes, all fixed.

### Stage B

**Date:** 2026-10-16
**Reviewer:** generic-product-reviewer, nodejs-reviewer (plus two re-checks of the correction passes)

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    36 |
| Open / Not implemented |     0 |

By severity: 9 Important and 7 Notes (product), 11 Notes (Node.js), then 3 Medium and 9 Low from the re-checks. Three were closed without change: the bound on the lean sentence (contrary to the plan-review decision), the probe-count proxy in the dispatch evaluator (accepted design, attested per slot), and the owed eval re-record (tracked under Test results).

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
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    0 |

Counts after revision. Two review passes on 2026-10-16 (`effective-delivery`, `deep` tier) found 5 Critical, 17 Important and 13 Notes; all are incorporated into the plan text above.

### Findings

- Security, Critical, incorporated: reusing `Run state: non-interactive` would have created a new merge authority. Now there is a separate `relayed` state, and `Completion mode: merge` is only a relayed user answer.
- Error cases, Critical, incorporated: `iterate`'s questions under a delegated gate were undefined. They are now relayed as `BLOCKED-USER`, and per-item runs keep `non-interactive`.
- Scope, Critical, incorporated: an unbounded eager lean rule contradicted in-run rules. It is now one sentence with a precedence clause and two concrete sites.
- Architecture, Critical, incorporated: who runs the delegated gate was unclear. It runs in the built-in general-purpose or default agent as a delegated orchestrator, never as a leaf worker.
- Scope, Critical, incorporated: the ±1 margin opened an ungated Fast path. `deep` defaults never move down.
- Security, Important, incorporated: the delegated gate runs at `deep`. `BLOCKED-USER` uses a closed question-id set, and the wisdom path is validated with defined cleanup per return.
- Error cases, Important, incorporated: Phase 0 split between caller and delegated run; nested-spawn probe before any write; a rejected parameter is remembered per run; question instances are keyed by id + round with a state digest.
- Testability, Important, incorporated: explicit gate list; spawn-site markers reconciled by a test; pilot generation boundary by Quality-mapping identity; re-measurement targets and a decision rule; manual `mechanical` and Codex checks gate the ADR status.
- Maintainability, Important, incorporated: `AGENTS.md` and `execution-profiles.md` added; the `merge-gate` body moves behind a lazy include.
- Notes, incorporated: Claude alias allowlist; no `HARNESS_TOOL_PARAMETER_OWNERSHIP` change; the native baseline comparison; one eval re-record after Stage B; base SHA recorded; local-only usage aggregates; the `deliver` row removed and listed as a follow-up.

### Deep interactive review (2026-10-16)

A third pass (`effective-delivery`, `deep` tier) found 3 Critical, 9 Important and 3 Notes that could be incorporated directly, plus 3 decisions. All are resolved:

- Testability, Critical, incorporated: `compare-native-agent-baseline.mjs` skips changed workers. It now gets an expected-config-delta allowlist, and the acceptance criterion names the exact allowed deltas.
- Error cases, Critical, incorporated: `relayed` was rejected by `delegation-envelope-core.mjs:92` and `iterate.md:465-469`. Both now accept it, and an `iterate` eval scenario covers the parsing.
- Error cases, Critical, incorporated: a non-interactive caller had no path. It dispatches `non-interactive`, and the `BLOCKED-USER` round trip moved to the manual check.
- Important, incorporated:
  - `BLOCKED-USER` is a local keyword, exempt from the keyword-less resume;
  - the completion source stays with configuration;
  - the skill, execution and state roots are passed;
  - judgment delegation is limited to `central-reasoning-delegation.md`, with a draft snapshot in issue mode;
  - the mandate sentences name the orchestrator, keeping the worker leaf rule;
  - "Adjust" is bound to the digest-bound item set;
  - a detection rule for spawn sites;
  - no-downward-move sites;
  - the single-owner test is scoped to `src/`, and the pilot protocol doc is added.
- Notes, incorporated: the directive row in `build-system.md`; the eval profile attestation.
- Decision B1 (user): a `BLOCKED-USER` return after the reservation finalizes as `reported-blocked`; each re-dispatch reserves fresh.
- Decision B2 (user): pilot protocol 1.2.0 with the Quality-mapping identity in `protocolSource` and a one-step migration to suspended(`quality-mapping-changed`).
- Decision B3 (user): the build renders each spawn site's tier values at its marker; `model-tiers` stays lazy for the rules.

Result after this pass: no Critical findings and no blocking open points remain.

## Open points

- No open points.
