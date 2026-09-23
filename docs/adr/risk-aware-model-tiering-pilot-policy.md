# Risk-aware model-tiering pilot policy

## Status

Active

## Context

Effective Flow currently favors the strongest configured implementation capability for product
work. Some approved plans and refactors can be divided into bounded implementation packets with
clear ownership, established validation, and independent review, so a distinct lower-cost,
lower-latency executor might reduce time and cost. That benefit is a hypothesis rather than an
established result, and an incorrect classification can create safety, scope, or correction risk.

The experiment therefore needs a durable admission boundary that remains provider-neutral,
defaults to existing behavior, and can be stopped without a source or data migration. Workflow
correctness, review, and validation are prerequisites; they are not benefits that speed may trade
away.

## Decision

Effective Flow defines two implementation intents: **Quality** is the strongest available
configured implementation capability and the safe default; **Fast** is a distinct native
lower-cost, lower-latency capability for a bounded eligible packet. These are policy intents, not
provider model names.

The project-level `executionProfiles.fast.enabled` key is a strict Boolean and defaults off. Missing
or `false` is disabled. Malformed, ambiguous, or unreadable input is invalid. Both states select
Quality and stop new measurement. Literal `true` only admits the project to the pilot lifecycle; an
explicit prospective Quality-only baseline and a successfully activated generation are still
required before an eligible packet may use Fast. Disabling or removing the key is the configuration
rollback: it stops new admission without rewriting generation state, clearing a suspension, or
discarding already captured evidence.

Packet admission uses the ordered, fail-closed gate in
[`src/shared/execution-profiles.md`](../../src/shared/execution-profiles.md). Evaluation stops at the
first failed row and records only that exclusion reason. Missing, conflicting, incomplete, or
unknown evidence selects Quality. Existing project-routing buckets remain the packet identity
unless an approved plan already defines narrower independent packets. Disjoint packets may differ
only when ownership and dependencies are explicit; coupled or mixed-scope packets share Quality.

Fast is limited to the first attempted implementation spawn. A keyword-less resume remains the same
attempt. Every newly spawned retry, correction, validation repair, review incorporation, conflict
resolution, or scope-growth continuation is Quality-only. If escalation is required, work continues
in the same verified checkout with the retained diff and a fresh orchestrator-owned transfer record;
the Quality worker inspects that intermediate work first, and a second Fast attempt is forbidden.

Pilot-control failures are separate from implementation fallback. The later protocol owner must
persist suspension and incomplete-record controls where possible, block new Fast reservations until
reconciliation, and require an explicit confirmed resume from suspended state. Configuration
changes and a successful Quality run never clear that state automatically.

The policy is now paired with rendered native capability and a local measurement subsystem:
generated Claude Fast implementer sidecars, a Codex per-spawn override representation, strict
native inventories, and a dependency-free runtime helper with preregistered lifecycle, evidence,
aggregation, evaluation, purge, and exceptional discard operations. Evidence remains private below
`.effective-flow/model-tiering-pilot/`. Minimal structured records exclude content and identity;
optional detailed traces require an explicit request in the current run and never inherit consent
from project configuration. While a baseline or active generation exists, `merge-gate` may record
anonymous period-level correction observations, but those observations carry no workflow-record or
forge/repository identity and cannot be linked to a `build` or `refactor` run.

Lifecycle capability still does not activate the pilot. Neither `build` nor `refactor` requests
Fast, setup exposes no baseline or activation action, and portable output remains Quality-only.
Configuration, generation state, trace consent, native capability, and publication approval remain
separate decisions. Review freezes new reservations; private aggregate evaluation precedes any
separately approved publication of a suppressed candidate. Normal purge is digest-bound and
review-gated. Exceptional discard is available only for malformed or unknown owned evidence after
configuration is disabled, review has begun, and a separate `change` or `stop` confirmation is
bound to the opaque inventory; it emits no aggregate and cannot result in Keep.

Generation discovery has closed zero, one, or ambiguous-multiple outcomes and never selects among
several candidates. Lifecycle transitions, capacity suspension, timing cleanup, recovery, and
deletion are crash-safe and fail closed. Aggregate evaluation compares only preregistered compatible
strata, treats insufficient evidence as unavailable, suppresses publication per cell, and keeps the
generation identifier in the private review binding rather than either metric view.

## Alternatives and tradeoffs

- **Globally use a faster implementer.** This would be simple, but it would expose work without the
  same approval, ownership, validation, and review structure. It was rejected.
- **Enable Fast automatically whenever a host supports it.** Capability does not establish packet
  safety or project consent. An explicit default-off project policy and lifecycle gate are retained.
- **Use historical work as the comparison baseline.** Task mix, host load, and repository checks
  make that comparison weak. The pilot requires an explicitly started prospective Quality-only
  baseline.
- **Retry Fast after a failure or correction.** Repeated speculative attempts can erase the expected
  benefit and compound scope uncertainty. Corrections and retries therefore use Quality.
- **Duplicate eligibility rules in each workflow.** That would allow order and fallback behavior to
  drift. One marked, build-validated policy source owns the gate instead.

## Consequences

- Existing projects and current workflows retain Quality behavior until later adoption and explicit
  activation.
- The pilot can fail closed when configuration, evidence, lifecycle state, or native enforcement is
  uncertain.
- A possible performance gain is deliberately forgone for excluded, coupled, corrective, portable,
  and unsupported work.
- Retained-state escalation avoids discarding useful edits, but the Quality continuation must treat
  the diff and worker report as unverified intermediate evidence.
- Local evidence has an explicit review, retention, purge, and exceptional-discard lifecycle;
  disabling configuration alone never deletes it.
- Anonymous merge-gate observations strengthen period-level operational evidence without creating
  per-run linkage to implementation records.
- The exact gate order, state algebra, fallback/control vocabularies, and transfer fields are
  executable policy guarded by the build; this ADR records why those boundaries exist rather than
  duplicating their full values.

## Review triggers

Review this living decision when an adopting workflow needs a different safety boundary; native or
portable hosts can enforce materially different guarantees; pilot evidence shows clustered
fallbacks or correction cost; a critical safety, authorization, data-integrity, or scope incident is
attributable to profile selection; or lifecycle persistence and rollback semantics change. Exact
model aliases and numerical pilot thresholds remain outside this ADR and may change without
rewriting the durable policy.

## References

- [Execution-profile configuration](../user-guide/configuration.md#block-executionprofiles)
- [Configuration ownership](../developer-guide/configuration.md#reserved-execution-profile-key)
- [Build-system guard](../developer-guide/build-system.md#guards)
- [Pilot data and privacy](../user-guide/model-tiering-pilot.md)
- [Pilot protocol](../developer-guide/model-tiering-pilot-protocol.md)
- [Native execution-profile representation](./native-execution-profile-representation.md)

This is a living decision. Update this file in place when the current policy changes; repository
history preserves earlier states.
