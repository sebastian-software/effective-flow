# Per-spawn model tiers

## Status

Active

Both manual host checks ran on 2026-10-16:

- **Claude Code 2.1.292:** in an `effective-flow review` run following the built portable `review.md`, the subagent transcripts show the rendered tiers taking effect.
  - The design-decision collectors and the `code-validator` ran on `claude-sonnet-5-5` with effort `medium` (`standard`).
  - The `nodejs-reviewer` ran on `claude-opus-5-5` with effort `high` (`deep`).
  - A direct Agent call with `model: haiku`, `effort: low` ran on `claude-haiku-5-5` with effort `low` (`mechanical`).
  - A built-in Explore spawn accepted the `standard` override as well.
  - Not covered: the `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` counter-check, which needs a fresh process with that variable set.
- **Codex CLI 0.159.3:** `codex exec` spawned the built-in default agent with `model: gpt-5.6-luna`, `reasoning_effort: low` and with `model: gpt-5.6-sol`, `reasoning_effort: high`. Both overrides were accepted, and the child threads' recorded settings show exactly those values.
  - A child spawned a nested default agent at depth 2. Without its own override, the nested agent inherited the child's `gpt-5.6-sol`/`high`.
  - The parent thread itself ran on the host default `gpt-6.1-sol`, a newer model than the `deep` mapping names.

## Context

Effective Flow orchestrators start many subagents, but only the native worker sidecars carried a
model. A local investigation of usage from 2026-10-11 to 2026-10-16 found that 99.4 % of Claude Code
usage ran on the strongest model at effort `high`. The orchestrator main session carried 68 % of
the cost, 90 % of it cache reads and writes. The subagents carried the other 32 %: portable
`general-purpose` workers and Explore fan-outs inherited the parent model, because
[Native execution-profile representation](./native-execution-profile-representation.md) kept
portable output Quality-only and build guards blocked model metadata there. Sessions dominated by
`merge-gate` carried 68 % of the total. Only aggregates are recorded here; the detailed
measurements stay local.

Host capability moved as well. Claude Code takes a per-invocation `model` (aliases `haiku`,
`sonnet`, `opus`) and `effort` on its Agent tool, and the per-invocation value wins over agent
frontmatter and over `CLAUDE_CODE_SUBAGENT_MODEL`. Codex ships a per-spawn `model` and
`reasoning_effort` override for the native Fast path; its use with the built-in default agent is
unverified and gated by the status above.

## Decision

**Three provider-neutral tiers.** `mechanical`, `standard` and `deep` name the class of model a
spawn runs on. Workflow prose names only the tier. `MODEL_TIER_MAPPINGS` in `build.mjs`, next to
`AGENT_PROFILE_MAPPINGS`, is the one place that maps each tier to concrete values:

| Tier         | Claude Code         | Codex                     |
| ------------ | ------------------- | ------------------------- |
| `mechanical` | `haiku` / `low`     | `gpt-5.6-luna` / `low`    |
| `standard`   | `sonnet` / `medium` | `gpt-5.6-luna` / `medium` |
| `deep`       | `opus` / `high`     | `gpt-5.6-sol` / `high`    |

The build validates the mapping: exactly these tiers, Claude models limited to `haiku`, `sonnet`
and `opus`, and only supported effort and Codex model and reasoning-effort combinations. `deep`
lowers the Claude effort of implementers, reviewers and the merge-conflict resolver from `xhigh` to
`high`, a deliberate cost decision; the Codex values do not change. The concrete values are build
metadata and may change without superseding this record, except for the `deep` values, which the
pilot protocol binds (below).

**The role default is the single source.** Each `src/agents/*.md` declares one top-level `tier:`.
Implementers, reviewers and the merge-conflict resolver are `deep`; the validator, test, end-to-end,
documentation and marketing writers are `standard`. The native Claude and Codex frontmatter is
derived from it and remains the harness-enforced fallback for a spawn that passes nothing. A
per-agent model or effort field fails the build.

**Spawn-site markers.** Every spawn instruction in `src/tools` and `src/shared` carries a marker
line `<!-- spawn-site:<tool>/<id> -->`. The build replaces it with the site's resolved tier and the
tier's values in the target's own form, so the values sit at the decision point and a skipped lazy
load cannot leave a spawn silently inheriting the parent model. The site table in
`src/shared/model-tiers.md` (columns `Site`, `Spawn`, `Tier`, `Down`) assigns each site a tier or
`role:<agent>` (resolving to the role's tier) and flags whether the margin may move down. The
lazily loaded `model-tiers` fragment holds the rules and the table; the mandate's tier sentence
points to it. Sites are:

- worker spawns (implementers, reviewers, validators, test and documentation writers, the conflict
  resolver), resolved through their role;
- read-only exploration and analysis sub-agents: `standard`;
- fan-outs reviewing a plan or concept, and delegated implementation workflow runs: `deep`.

The `concept-review` fan-out is `deep` by analogy with the `plan-review` fan-out. The three
delegated implementation workflow runs (`apply-issues`, `apply-review`, `iterate`) are `deep`
because each orchestrates its own `deep` workers. No `mechanical` site exists yet; the tier is
defined for cleanup and inventory scans.

**Every spawn carries a tier, in every target.** Claude passes `model` and `effort` on the Agent
tool, Codex `model` and `reasoning_effort` on the spawn, and native targets pass them as well, so
one rule governs all targets.

**A bounded one-step margin.** A `deep` role or site never moves down; a cheaper implementer exists
only through the gated Fast selector. A `standard` role or site may move one step up or down for a
stated reason that appears in the spawn handoff and in the run summary, except at sites flagged
`Down: no`, such as the validator of a conflict resolution or any validation or correction after a
Fast packet. A move past either end of the scale is a no-op, and a retry or correction after a
failed attempt runs at least on the role or site default. A correction or respawn without a site
line of its own resolves through its role default.

**Portable renders harness-keyed values.** Portable output is one artifact for both harnesses. Its
`model-tiers` fragment carries a generated table with one column per spawn mechanism, and each
spawn site carries a short two-harness form. A host with neither mechanism inherits as before and
says so once. Provider model names may appear in portable output only in this build-generated tier
text; the guard recognizes both shapes, and a native target may name only its own provider.

**Host overrides are respected.**

- When `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` is present (presence only, never its value), the
  orchestrator passes no tier parameters and says so once. This is the opt-out; without it, a
  per-spawn tier now wins over `CLAUDE_CODE_SUBAGENT_MODEL`.
- A spawn rejected because of a tier parameter is retried once without it, or without both when it
  is unclear which one was rejected. The rejected parameter is omitted for the rest of the run and
  reported once.
- `CLAUDE_CODE_EFFORT_LEVEL` overrides the effort. It is documented and not detected.

**The Fast pilot keeps its contract.** `{{AGENT_PROFILE:X:fast}}`, its gate, its first-attempt rule
and its measurement are unchanged, and portable output stays without Fast. A Fast spawn passes
only its Fast reference's own values, never the site's tier line, because on Claude Code a
per-invocation value would override the `-fast` sidecar; `execution-profiles` owns that carve-out. The Quality intent token
is unchanged; the configured strongest capability it names is the role's `deep` tier. The
Quality-mapping identity, a SHA-256 digest of the canonical `deep` values per harness, becomes part
of the pilot protocol, so a change of those values starts a new generation. Protocol `1.2.0`
carries it; a generation persisted under `1.1.0` migrates once to a suspended state with the reason
`quality-mapping-changed`, is never extended or resumed, and can only be reviewed and discarded.
Evidence is never mixed across the change on any machine. The digest, rather than the values,
lets the portable copy of the protocol module stay free of provider names; the build checks it
against `MODEL_TIER_MAPPINGS`.

**Relation to earlier decisions.** This record supersedes the portable restriction in
[Native execution-profile representation](./native-execution-profile-representation.md), which kept
portable output Quality-only and without model metadata: that holds for Fast only, while portable
spawns now carry tiers. It amends
[Risk-aware model-tiering pilot policy](./risk-aware-model-tiering-pilot-policy.md) in the same
way for portable output, and it sharpens what Quality means there. The Codex host check (see
"Status") satisfies the review trigger of the representation record on per-spawn contracts.

**Planned follow-up.** A second change moves the heaviest inline orchestrator work out of the main
session (judgment in a subagent for planning artifacts and a delegated `merge-gate` run). It is not
part of this decision and ships separately; this record neither describes nor depends on it.

## Alternatives and tradeoffs

- **Keep portable Quality-only.** Rejected: portable workers were where the unmanaged inheritance
  cost arose, and the two harnesses already take per-spawn parameters.
- **Name models in workflow prose.** Rejected: aliases change faster than workflows, and prose
  would scatter the mapping. Tiers keep one build-owned map.
- **Put tier values only in a lazily loaded fragment.** Rejected: a skipped load would leave a
  spawn on the parent model. Rendering the values at each marker costs a line per site and closes
  that gap.
- **An unbounded or symmetric margin.** Rejected: letting a `deep` role move down would open an
  ungated cheaper implementer beside the Fast pilot.
- **A configuration key for tiers.** Rejected: tiers are build metadata like the Fast mappings; the
  only model-related project key stays `executionProfiles.fast.enabled`.
- **Resume pilot generations across the effort change.** Rejected: Quality evidence from before and
  after the change would mix on every machine without any visible boundary.

## Consequences

- Subagents stop inheriting the caller's strongest model by default in all three targets, trading
  some strength on `standard` roles for lower cost. Re-measuring Claude Code usage after the change
  decides whether further sites are added.
- Native Claude implementers, reviewers and the conflict resolver run at `high` instead of `xhigh`.
  Codex native configuration is byte-identical. The baseline-comparison script allows exactly this
  effort delta and the mandate sentence delta, and nothing else.
- Every spawn instruction needs a marker and a table row; the build fails on a missing, unknown,
  duplicate or surviving marker. Workflows add context lines per includer of the mandate.
- A user with `CLAUDE_CODE_SUBAGENT_MODEL` set now sees the per-spawn tier win; the opt-out is
  `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`.
- Existing pilot generations under protocol `1.1.0` are suspended once and must be reviewed and
  discarded before a new baseline starts.
- A host that rejects a tier parameter degrades to a spawn without it, which inherits or takes the
  native fallback; this is reported once and never blocks a run.

## Review triggers

Review this decision when a harness changes its per-spawn parameter or precedence contract, a
fourth tier or a `mechanical` site is added, usage re-measurement shows the targets missed, or the
`deep` mapping changes (which also needs a new pilot protocol generation boundary). Concrete model
aliases outside the `deep` identity are deliberately not review triggers. The Codex host check
showed a host default (`gpt-6.1-sol`) newer than the mapped `deep` model; whether `deep` moves to
it is such a `deep` mapping change.

## References

- [Native execution-profile representation](./native-execution-profile-representation.md)
- [Risk-aware model-tiering pilot policy](./risk-aware-model-tiering-pilot-policy.md)
- [Model tiers in the build system](../developer-guide/build-system.md#model-tiers)
- [Model tiers and host variables in configuration ownership](../developer-guide/configuration.md#model-tiers)
- [Pilot protocol: Quality-mapping identity](../developer-guide/model-tiering-pilot-protocol.md#quality-mapping-identity)
- [Getting started: calling model](../user-guide/getting-started.md#recommended-calling-model)

This is a living decision. Update this file in place when the current representation changes;
repository history preserves earlier states.
