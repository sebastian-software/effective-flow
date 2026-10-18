# Unattended run state

## Status

Active

## Context

Effective Flow tools contain question fences and prose instructions to clarify decisions with
the user. A fence has no general default for an unanswered question. In a non-interactive run,
waiting for an answer can end the pass without a completed artifact; silently choosing an answer
can instead turn missing authority or information into an implementation decision.

Planning needs a complete artifact that records uncertainty for its caller. Deep plan review must
preserve the same boundary, including questions raised by a loaded central skill, judgment
fallbacks and exhausted sub-agent retries. A prose preamble alone leaves the tool's question
instructions in force and gives contract checks no explicit entry point.

## Decision

Across Effective Flow tools, an unanswered question in a non-interactive run becomes an open
point or a fail-closed abort, never a guess. Non-interactive execution does not grant consent for
publication or other actions that require authority from the caller.

The first application is `plan` and its deep file-mode `plan-review`. A caller explicitly selects
`Run state: non-interactive`; the ordinary interactive path is unchanged. The shared
[`unattended-planning` fragment](../../src/shared/unattended-planning.md) owns the strict entry
contracts, site mapping and completion result. Planning validates its control envelope before
issue routing. File review receives the exact generated artifact and its verified context through
a distinct entry contract, rather than parsing a planning envelope again.

The planning child may write one new plan. Missing decisions remain visible as blocking open
points and force `Revision required`; the review records “Decide later” with options and a
recommendation. Invalid input, unsafe state and unreachable interactive branches abort with an
explicit reason. Publication stays behind the existing non-interactive gate and belongs to the
caller after planning.

Exact control grammar, site outcomes and readiness criteria remain in their owning shared
fragments. The ADR records the cross-tool rule; it does not introduce a second planning or
readiness playbook or apply new mechanics to every existing tool in this change.

## Consequences

- Every new question site on a mapped path requires a site-table row with an explicit outcome.
  Changed includes and central-skill entry points must preserve the same no-question rule.
- A completed plan can still require revision. Callers must inspect the artifact and its blocking
  points rather than treating `DONE` as approval to implement or publish it.
- Existing per-fence defaults in `tracker-target`, `security-disclosure-gate` and
  `project-adr-convention` are consistent with this rule and remain unchanged.
- Static inventory and rendering checks protect known question sites and entry precedence.
  Runtime evidence remains separate: those checks do not prove every model execution completes
  without a question or that a host supports the required delegation.

## Review triggers

Review this living decision when another tool adopts non-interactive execution, a new question
site changes the mapped path, or a harness cannot preserve delegation, terminal results or the
caller-owned authority boundary.

## References

- [Plan conventions](../developer-guide/plan-conventions.md#unattended-planning-and-file-review)
- [Planning-readiness contract](../../src/shared/planning-readiness.md)
- [Unattended planning plan](../plan/archive/2026-10-01-unattended-planning-and-readiness-contract.md)

This is a living decision. Update this file in place when the current policy changes; repository
history preserves earlier states.
