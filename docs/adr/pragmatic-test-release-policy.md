# Pragmatic test and release policy

## Status

Accepted, November 4, 2026.

Status note, November 13, 2026: for `focus`, the applicable acceptance is the host acceptance record
alone, the [F record for candidate `024bcb2a`](../developer-guide/focus-host-acceptance.md#f-record-for-candidate-024bcb2a).
The `focus` and `build-context` eval rounds are post-merge debt and decide no activation. The
decision below is unchanged.

## Context

Package acceptance and experimental execution qualification answer different questions. A
complete multi-host model-recording campaign on every release delays delivery of baseline
behaviour without establishing that a particular execution boundary is safe. The owner approved
separating these obligations, including disabling unqualified routes.

## Decision

This decision supersedes the blanket package-release freshness requirement introduced by
`dcd28974` and recorded in
[the archived release-gating plan](../plan/archive/2026-09-21-release-gated-eval-freshness.md).
That requirement is superseded, not satisfied. Historical evidence, failures, budgets and the
host-driver race retain their original meaning.

Format, full unit/integration tests including host-driver cases, build guards, distribution and
installation smoke, Shellcheck, generated README checks and existing required-check reporting
remain mandatory. Other jobs retain their current required/advisory status. This policy permits
no test removal, selected-only acceptance, deadline increase, assertion weakening or protection
bypass. Routine package acceptance uses the existing CI environment; additional native/provider
validation belongs to changes whose capability contract requires that boundary.

CI verifies and reports all five behavioural suites (`merge-gate`, `iterate`, `next-steps`,
`build-context`, `focus`) identically on ordinary and release PRs, after broad package checks.
Each summary retains the current basis, freshness/coverage debt, independent validity, recorded
negative outcomes and any affected disabled capability. No model runs in CI.

| Disposition                                                                                              | Package evidence check                                   | Qualification meaning                                  |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| Current, internally valid                                                                                | Pass                                                     | Only the applicable contract can establish acceptance  |
| Stale, absent, short, missing stamp                                                                      | Report debt                                              | Unqualified; mandatory archive stamp rules still block |
| Validated waiver                                                                                         | Report as waived                                         | Existing scope only; no new waiver or current label    |
| Unproven                                                                                                 | Report debt only after independent integrity checks      | Capability remains unqualified                         |
| Valid recorded negative                                                                                  | Report outcome and require applicability/security triage | Never a passing behavioural result                     |
| Invalid archive, malformed record, inconsistent internal stamp, surplus, verifier crash or unknown state | Fail closed                                              | Repair/reconcile before delivery                       |

Expected source/loadset identity drift is staleness, not corruption. Coverage and staleness
rollups cannot hide subordinate invalidity or negative outcomes. Report-mode exit success cannot
mask integrity failures. Strict manual verification remains available and fails stale, absent,
incomplete, invalid or negative full-suite acceptance; package reporting grants no qualification.

Known unresolved security-critical behavioural defects affecting reachable functionality block
delivery until repaired or demonstrably unreachable. Old failed evidence does not by itself prove
a current defect; missing evidence does not prove safety. A maintainer must resolve applicability
and stop delivery when security-critical applicability is unresolved. There is no automated
semantic safety classifier or new waiver registry.

## Capability boundaries and re-entry

Existing supported baseline behaviour gains no blanket recording prerequisite. New or materially
changed experimental execution paths remain disabled until their applicable behavioural and host
acceptance passes. Planned-build workflow delegation is currently disabled across targets: the
caller selects the complete inline Quality phases 2–7 before mutation, preserving specialists,
review, validation and delivery. Fast default-off does not qualify Quality delegation. Mandatory
helper failures and post-mutation transport loss retain their stop/recovery boundaries.

Focus snapshot-host execution is disabled before target/ancestry reads pending current
candidate-bound T3 observed/report-only requalification. Follow-up and sends remain disabled
independently. Historical snapshot acceptance is not current support. Pure helpers, documentation
and dormant specifications can ship; the existing narrow follow-up cleanup authority remains.

Re-entry uses reviewed source activation and the existing acceptance owners: the
[build-context suite](../../evals/build-context/README.md) and
[Focus host acceptance record](../developer-guide/focus-host-acceptance.md), including the remaining
work in #613. Re-record and pass the applicable contract before activation. No host/model re-pin,
recording campaign, machine matrix or additional legacy budget is authorized here.

## Delivery

Deliver this source policy through a reviewed PR to `develop`. Reassess the generated release
head and its checks only after integration. This decision grants no release merge authority and
does not dispose of PR #618, release #595, #609's dependency/conflict, or separate recording and
snapshot-requalification work.
