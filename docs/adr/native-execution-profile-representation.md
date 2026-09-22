# Native execution-profile representation

## Status

Active

## Context

Effective Flow ships native Claude Code and Codex worker definitions plus a harness-neutral portable
manager target. Their delegation contracts differ: Codex can apply model and reasoning settings to
an individual spawn, Claude Code represents a fixed worker profile through a registered sidecar,
and a portable manager cannot guarantee either native mechanism or a uniform Quality fallback.

The execution-profile policy must preserve the same safety behavior across targets without
pretending that all targets can enforce the same optimization. Concrete model names and reasoning
settings also change more frequently than the cross-harness representation and do not belong in a
project's configuration or in this durable rationale.

## Decision

Quality and Fast remain provider-neutral intents in the shared policy. Native rendering represents
Fast in Codex with an explicit model-and-reasoning override on an eligible implementation spawn.
Claude Code represents Fast with a generated implementer sidecar whose native metadata fixes the
mapped model and effort. Both paths continue to use the registered Quality role for exclusions,
unavailability, rejection, escalation, and correction. Central build metadata—not workflow prose
or project configuration—owns the concrete mappings.

Native capability is part of eligibility. A missing mapping, incomplete target support, or missing
spawn mechanism records `profile-unavailable` before any Fast attempt and selects Quality. On Claude
Code, the presence of `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` has the same effect because it erases the
distinction the policy intends to enforce. Detection is presence-only: Effective Flow never reads,
relays, displays, or persists the environment value. A host rejection after Fast was actually
requested is different: it consumes the sole attempt, records `spawn-rejected`, and continues once
with Quality. The run never claims enforcement that the host prevented.

Portable output is Quality-only in V1. Portable workers keep using the manager's general delegation
mechanism, but the optimization is not requested or emulated because the manager cannot guarantee
the native mapping and fallback contract. Behavioral correctness is shared across targets;
performance optimization is intentionally native-only.

The build now renders this native capability and publishes strict native-agent inventories as
build/install consistency manifests. It generates the sanctioned Claude Fast implementer sidecars
and can render the Codex per-spawn override form. Portable output still contains no native profile
artifact. Capability remains separate from activation: no workflow currently requests Fast, and a
valid inventory does not prove runtime discovery or host acceptance. Workflow adoption remains a
later decision and must execute the policy's runtime capability gate immediately before selection.

## Alternatives and tradeoffs

- **Use one generic representation everywhere.** This would make the outputs look uniform while
  hiding differences in what each harness can enforce. It was rejected in favor of explicit native
  mechanisms and a truthful portable limitation.
- **Put provider model names in `executionProfiles.fast.enabled` or workflow prose.** That would tie
  project policy to volatile aliases and scatter mappings across consumers. The key remains Boolean,
  and mappings stay centralized in build-owned metadata.
- **Generate a second hierarchy of workers.** Execution profile is metadata on the existing
  delegation boundary, not a new orchestration layer. Only the native artifact required by a host
  is added when rendering lands.
- **Attempt Fast in portable mode and fall back opportunistically.** A manager-dependent attempt
  cannot prove consistent enforcement or fallback behavior. V1 accepts no portable optimization.

## Consequences

- Native Claude Code and Codex builds may realize the same Fast intent through different artifacts
  while sharing one eligibility and correction policy.
- Native inventories allow the build and local installer to reject representation drift without
  treating archive consistency as runtime capability or signed provenance.
- Portable users retain correct Quality behavior but receive no V1 latency or cost optimization.
- Host overrides and missing native support degrade safely and observably instead of silently
  changing the effective profile.
- Concrete model aliases and effort values can evolve in their build-owned mapping without changing
  project configuration or this ADR.
- Build and distribution tests must prove target separation: native targets contain only their own
  representation, portable output contains no native profile metadata, and absent capability never
  produces a false enforcement claim.

## Review triggers

Review this living decision when a harness changes its per-spawn or sidecar contract, portable
managers can guarantee equivalent profile selection and Quality fallback, native override precedence
changes, a new target is added, or centralized mappings can no longer express the required
capability. Concrete aliases and pilot thresholds are deliberately not review triggers for this
record.

## References

- [Risk-aware model-tiering pilot policy](./risk-aware-model-tiering-pilot-policy.md)
- [Getting started: calling model](../user-guide/getting-started.md#recommended-calling-model)
- [Native and portable worker rendering](../developer-guide/build-system.md#native-and-portable-worker-rendering)

This is a living decision. Update this file in place when the current representation changes;
repository history preserves earlier states.
