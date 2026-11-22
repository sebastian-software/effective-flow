# Native execution-profile representation

## Status

Active

## Context

Effective Flow ships native Claude Code and Codex worker definitions plus a harness-neutral portable
manager target. Their delegation contracts differ: Claude Code and Codex represent fixed worker
profiles through registered sidecars, while a portable manager cannot guarantee either native
mechanism or a uniform Quality fallback. Codex also accepts spawn parameters, but the role file's
model and reasoning settings take precedence over those parameters.

The execution-profile policy must preserve the same safety behavior across targets without
pretending that all targets can enforce the same optimization. Concrete model names and reasoning
settings also change more frequently than the cross-harness representation and do not belong in a
project's configuration or in this durable rationale.

## Decision

Quality and Fast remain provider-neutral intents in the shared policy. Native rendering represents
Fast in both Claude Code and Codex with a generated implementer sidecar whose native metadata fixes
the mapped model and effort. Model-tier variants use the same representation for Codex's six
standard roles. Both paths continue to use the registered Quality role for exclusions,
unavailability, rejection, escalation, and correction. Central build metadata—not workflow prose
or project configuration—owns the concrete mappings.

Native capability is part of eligibility. A missing mapping, incomplete target support, or missing
spawn mechanism records `profile-unavailable` before any Fast attempt and selects Quality. On Claude
Code, the presence of `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` has the same effect because it erases the
distinction the policy intends to enforce. Detection is presence-only: Effective Flow never reads,
relays, displays, or persists the environment value. A host rejection after Fast was actually
requested is different: it consumes the sole attempt, records `spawn-rejected`, and continues once
with Quality. The run never claims enforcement that the host prevented.

Portable output may select Fast through the per-spawn Fast tier, but only on a qualified harness
(revised 2026-11-21). The build renders a Fast tier line from `AGENT_PROFILE_MAPPINGS.fast` beside
the Quality (`deep`) line at the first implementation spawn of `build` and `refactor`; a portable
manager has no role file that could override a per-spawn parameter, so the parameter decides. A
harness is qualified only when the shipped qualification record
(`src/scripts/fast-harness-qualification.json`) states a `qualified` probe outcome and a Fast-mapping
identity equal to the current mapping, and the pilot generation's snapshot records the same.
Anything else, including a missing `model` parameter on Claude Code's Agent tool, selects Quality
and records `profile-unavailable`. A per-packet `modelCompliance` check reads the child's actual
model; a mismatch keeps the work and leaves only the Fast metrics. The harness family comes from the
parameter shape of the spawn tool alone; a client surface such as T3 Code is not a signal. Native
builds keep the sidecar rendering unchanged.

> **Superseded in part** by [Per-spawn model tiers](./per-spawn-model-tiers.md): portable spawns no
> longer inherit the manager's model. They carry a provider-neutral tier whose values for both
> harnesses are build-generated, so "portable contains no model metadata" no longer holds for
> generated tier text.

The build now renders this native capability and publishes strict schema-2 native-agent inventories
as build/install consistency manifests. It generates five Fast implementer sidecars for each native
harness and Codex's twelve mechanical/deep variants for the six standard roles. Portable output
still contains no native profile artifact. Capability remains separate from activation: a valid
inventory does not prove runtime discovery or host acceptance. `build` Phase 2 and `refactor` Phase
3 are the two adopting phases; each renders the five Fast references inline and executes the
policy's runtime capability gate immediately before selection, and only an eligible packet in an
active pilot generation requests Fast.

## Alternatives and tradeoffs

- **Use one generic representation everywhere.** This would make the outputs look uniform while
  hiding differences in what each harness can enforce. It was rejected in favor of explicit native
  mechanisms and an explicit portable qualification gate.
- **Put provider model names in `executionProfiles.fast.enabled` or workflow prose.** That would tie
  project policy to volatile aliases and scatter mappings across consumers. The key remains Boolean,
  and mappings stay centralized in build-owned metadata.
- **Generate a second hierarchy of workers.** Execution profile is metadata on the existing
  delegation boundary, not a new orchestration layer. Only the native artifact required by a host
  is added when rendering lands.
- **Attempt Fast in portable mode on any harness and fall back opportunistically.** A
  manager-dependent attempt cannot prove consistent enforcement without evidence. Portable Fast
  therefore requires a qualified harness, a per-packet compliance check and the same Quality
  fallback as native.
- **Install native roles for DALO users.** DALO cannot install native Codex roles and has no verified
  path for Claude role metadata, so portable users would never reach Fast.

## Consequences

- Native Claude Code and Codex builds may realize the same Fast intent through different artifacts
  while sharing one eligibility and correction policy.
- Native inventories allow the build and local installer to reject representation drift without
  treating archive consistency as runtime capability or signed provenance.
- Portable users retain correct Quality behavior and may use Fast on a qualified harness. One
  host's probe qualifies the harness for every install of a release, and a provider gateway may map
  aliases differently, so the per-packet compliance check, not the probe, backs each Fast claim.
- Host overrides and missing native support degrade safely and observably instead of silently
  changing the effective profile.
- Concrete model aliases and effort values can evolve in their build-owned mapping without changing
  project configuration or this ADR.
- Build and distribution tests must prove target separation: native targets contain only their own
  representation, portable output contains no native profile metadata beyond build-generated tier
  text (the Fast tier line is exempted from the provider-alias guard by name), the build fails when
  the qualification record's Fast-mapping identity differs from the current mapping, and absent
  capability never produces a false enforcement claim.

## Review triggers

Review this living decision when a harness changes its per-spawn or sidecar contract, a qualified
harness changes how it resolves per-spawn model aliases, native override precedence
changes, a new target is added, or centralized mappings can no longer express the required
capability. Concrete aliases and pilot thresholds are deliberately not review triggers for this
record. The per-spawn trigger is satisfied by the Codex host check recorded in
[Per-spawn model tiers](./per-spawn-model-tiers.md).

## References

- [Risk-aware model-tiering pilot policy](./risk-aware-model-tiering-pilot-policy.md)
- [Per-spawn model tiers](./per-spawn-model-tiers.md)
- [Pilot protocol](../developer-guide/model-tiering-pilot-protocol.md)
- [Getting started: calling model](../user-guide/getting-started.md#recommended-calling-model)
- [Native and portable worker rendering](../developer-guide/build-system.md#native-and-portable-worker-rendering)

This is a living decision. Update this file in place when the current representation changes;
repository history preserves earlier states.
