## Durable derived-work gate

This contract governs the transition from an observation produced during an active workflow into
durable work. It does not narrow review or validation: collect and validate observations as before,
then apply this gate before reserving a finding ID, writing a report or issue, proposing a child
issue, or emitting an executable outward handoff. A direct user request, the active issue or plan,
and a roadmap commitment explicitly authorized before the observation are primary work and do not
pass through this gate. An observation cannot authorize itself by being renamed as roadmap work;
only a later user-initiated explicit instruction can establish new primary scope.

The workflow/tool orchestrator owns this decision point. After the owning workflow's existing
configuration preflight, it sends all unresolved candidates as one compact, self-contained batch to
the authoritative `effective-product` skill when available. Include the `effective-delivery`
finding record and evidence, primary-scope source and date, active delta, known source references,
and requested artifact boundary. Named workers remain leaf executors and neither make nor delegate
this judgment. Admission never grants write authority: a durable artifact is written only when the
calling workflow already holds mutation authority for that target.

### Ordered decision

For each normalized root cause, decide in this order:

1. Return `current-scope` when the observation is a regression introduced by the active delta,
   violates an explicit acceptance criterion or invariant documented before the observation, or is
   objectively necessary for the already authorized end-to-end path. “More robust”, “more
   complete”, or “more honest” is not enough. Only the user or authorized owner of the primary
   plan/tracker artifact may explicitly reduce or withdraw that scope.
2. Apply safe containment when available and assess only the residual risk.
3. Group same-run observations by a deterministic normalized root-cause signature. Deduplicate only
   through known source references and the existing exact-signature lookup; do not scan the whole
   plan, report, or tracker corpus for every candidate.
4. Require concrete evidence: a reproduction, targeted or existing test, complete trace through a
   currently supported path, or a named applicable contract or obligation. Name the role, input,
   configuration, or state that makes the path reachable now. For lock-in, name the unavoidable
   binding and near-term commitment independently created outside the active delta.
5. Admit only an evidenced residual that passes one of the two closed consequence tests below.

`material-harm` requires at least one concrete consequence: the primary job cannot complete; a false
durable success/state is reported; persistent data loss/corruption or a material destructive,
financial, entitlement, physical, privacy, authorization, or external effect occurs; a named
applicable obligation is violated; a confirmed required-accessibility barrier blocks the primary
path; or no safe ordinary recovery exists. A domain label alone is insufficient.

`irreversible-commitment` requires an independent, existing direction with a concrete near-term
external, public, or persisted commitment, why-now evidence and a deadline, whose recovery needs a
real data migration, a breaking/compatibility phase for a used public contract, migration of
identity/authorization/key/cryptographic formats, coordination across systems or external
consumers, or reversal of an external commitment. Lock-in created or materially deepened by the
active delta is `current-scope`; a dependency/provider choice or inconvenient refactor is `closed`.

When `effective-product` is unavailable or disabled, use only the consequence and reversibility
tests above and disclose the fallback. Do not recreate a general prioritization playbook.

### Four outcomes

- `current-scope` — fix or contain it in the active work, or keep the run blocked. It never creates
  a report, issue, child, plan, or executable follow-up. Scope can change only through an explicit
  authorized owner decision.
- `admitted` — an independent residual has sufficient evidence and exactly one admission reason,
  `material-harm` or `irreversible-commitment`. After deduplication it is eligible for at most one
  durable artifact per root cause, subject to the caller's existing write authority.
- `closed` — a valid observation below the threshold. Create no work artifact or executable next
  step. An explicitly requested standalone audit may keep only a short title and closure reason in
  the non-executable closed-observations appendix of that same report; no ID, action, prompt
  suggestion, or `apply` handoff is allowed. Internal workflow reviews report aggregate counts only.
- `uncertain` — a credible path to either admission reason exists but one material fact is missing.
  For that root cause in this run, name exactly one evidence question, one bounded check, and its
  completion criterion, or safely contain/disable the path. Then classify it as `current-scope`,
  `admitted`, or `closed`; if that is impossible, stop and escalate. Never loop it into another
  workflow or create a precautionary artifact.

A review candidate must first receive scope/high-risk triage so a possible current-scope or credible
qualifying path is not silently dropped for incomplete evidence. Only review candidates that then
pass the existing confidence-at-least-80 quality filter may become `admitted`; other entry points do
not invent a numeric confidence score. Design-decision filtering, severity reconciliation, and
deduplication still run before final admission.

### Stable admitted record and re-entry

An admitted artifact records these stable fields in its existing representation:

- `Admission outcome: admitted`;
- `Admission reason: material-harm | irreversible-commitment`;
- evidence type and concrete reference;
- current reachability statement and anchor/digest;
- normalized root-cause/dedup signature;
- why it is not `current-scope` and why containment is insufficient;
- why-now and one objective completion condition;
- gate version `v1` and evidence digest.

Missing admission metadata never implies `admitted`. On re-entry, first run freshness and exact
deduplication checks, then re-evaluate a legacy artifact. Importance, severity, open state, or an
existing issue is insufficient. A credible qualifying path with incomplete evidence is `uncertain`;
an observation with no credible qualifying consequence is `closed`. Reuse a terminal closure receipt
only while the gate version, normalized signature, evidence digest, and reachability anchor/digest
still match; changed code, configuration, contract, evidence, or reachability reopens classification.

For an existing local artifact, persist one canonical admission field and one dated gate note. For a
remote finding, use the helper-owned marker
`<!-- effective-flow-follow-up-admission:v1 -->` and classification
`effective-flow-follow-up-closed`. A closing transition may use only a target state whose semantics
are unambiguously cancelled/not planned; never use the completed `issue-close` operation or the
separate `wontfix` product-decision path. If no such terminal state is proven, leave the issue open
but exclude it from discovery through the marker/classification receipt. Reconcile a legacy epic
entry when one exists.

Within one run, keep closed signatures only in the existing transient wisdom state. Create no
persistent ledger, registry, parking lot, review epic, or configuration switch.
