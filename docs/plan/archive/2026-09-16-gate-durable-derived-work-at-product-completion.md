# Gate durable derived work at product completion

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Effective Flow currently turns technically valid observations into durable work too readily.
Terminaro served as the motivating case: a valid plan can lead to implementation, an implementation
review, a review report, `apply-review`, another full workflow, another plan, and new tracker issues.
This plan records only that generalized workflow failure and deliberately excludes repository metrics,
tracker contents, local paths, and product-specific details from the motivating project.

The goal is a product-completion invariant: an observation does not create a new issue, plan, review
report, executable follow-up, or child issue by default. The gate applies to work derived from an
active review, implementation, investigation, planning, or decomposition run. Explicit
user-originated product work remains primary scope. A roadmap item counts as primary only when the
user or tracker authorized it in an artifact that predates the finding. A later instruction can
establish new primary scope only when the user explicitly initiates that instruction; answering a
routine system confirmation does not suffice. A finding cannot promote itself by being renamed as
roadmap work.

The original threshold, “a concretely proven, reachable security problem or a hard-to-reverse
architecture lock-in”, is directionally correct but should be changed in two precise ways:

1. Replace “definitive security problem” with **evidence-backed, currently reachable material harm**.
   Classical security alone is too narrow: authorization/privacy breaches, persistent data loss or
   corruption, incorrect money or entitlement effects, a concrete applicable obligation, required
   accessibility blocking a primary path, physical safety, destructive external effects, and a
   reproducible violation of the product's current core promise can be equally release-critical. Core
   correctness/reliability qualifies only when the primary job cannot complete, a false durable
   success/state is reported, a substantial external side effect occurs, or no safe ordinary recovery
   exists. A domain label alone never qualifies work.
2. Replace estimated “very high effort” with **observable structural irreversibility**. Lock-in qualifies
   only when a revert is insufficient and recovery requires migration of real persisted data, a
   breaking/compatibility phase for a used public contract, migration of identity/authorization/key or
   cryptographic formats, coordination across systems or external consumers, or changing an external
   commitment. A dependency, provider, abstraction, or inconvenient future refactor is not sufficient.

Every candidate needs concrete evidence: a reproduction, a targeted or existing test, a complete
trace through a currently supported path, or a named applicable contract or obligation. A regulatory
or contractual duty names its authoritative source, applicable scope, and violated requirement;
required accessibility names either a confirmed primary-path barrier or the concrete binding duty.
The existing
confidence threshold of 80 remains a review-specific quality prefilter; other entry points do not
invent a numeric score. Across every entry point, the role/input/configuration/state that makes the
path reachable must be named. For an irreversible commitment, reachability also includes a binding
that the authorized delta will necessarily create at merge/deployment. Hypothetical future scale,
optional hardening, general reliability, maintainability, polish, documentation, test convenience,
and “would be cleaner” are below the threshold.

The gate has four outcomes:

| Outcome         | Meaning                                                                                                                             | Allowed result                                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `current-scope` | Introduced by the active delta, required by an explicit acceptance criterion, or provably necessary for the already authorized path | Fix in the active work or keep the run blocked; only an authorized owner decision may reduce/withdraw scope; never create durable follow-up work        |
| `admitted`      | Independent residual risk with sufficient evidence and either material harm or structural irreversibility                           | Eligible for at most one durable item per root cause after deduplication; admission alone does not grant tracker-write authority                        |
| `closed`        | Valid observation below the admission threshold                                                                                     | No work artifact or executable next step; an explicitly requested standalone audit keeps a compact non-executable appendix in its existing report       |
| `uncertain`     | A credible path to material harm or structural irreversibility exists, but evidence is incomplete                                   | Run a bounded evidence check or safe containment in the current workflow; if uncertainty remains, stop/escalate without creating durable follow-up work |

This keeps the quality bar for the active slice intact without treating technical completeness as an
unbounded product roadmap.

### Planning baseline

- Source baseline rechecked on 2026-09-17 against `origin/develop` at `2874b84` (through PR #426).
  The local `develop` checkout remains at `538e224`, eight commits behind; implementation must start
  from the reviewed source baseline or re-run this drift check before editing.
- PRs #415, #417–#420, #423–#424, and #426 introduce no competing durable-work admission contract.
  The relevant new boundaries are the retired-configuration preflight from PR #420 and the
  leaf-worker, compact-handoff, and centralized remote-helper contracts from PR #426; this plan
  preserves them.
- Existing filters in `src/tools/review.md` validate confidence, duplicates, severity, design
  decisions, and disclosure, but do not decide whether a valid finding deserves durable product work.
- `src/shared/security-disclosure-gate.md` decides where an already admitted security finding may be
  published. It must stay downstream and must not become the admission policy.
- `src/shared/unresolved-review-report.md` is the common materialization path for `build`, `fix`,
  `refactor`, and `maintain`.
- `effective-product` owns evidence-based scope and prioritization judgment. `effective-delivery`
  continues to own finding validity, evidence, impact, and review-item judgment. Effective Flow owns
  the closed outcome vocabulary, ordering, artifact boundaries, and lifecycle effects.

## Architecture decisions

- **Gate the transition, not the observation.** Reviews may still detect and validate all findings
  required by their configured scope. Admission is evaluated only before a finding becomes a durable
  artifact or an executable outward handoff.
- **Use one shared semantic source.** Add `src/shared/durable-follow-up-gate.md`. Tool files name only
  their entry point and lifecycle effect; they do not copy the criteria.
- **Keep admission orchestration out of leaf workers.** The workflow/tool orchestrator batches the
  unresolved candidates and invokes the authoritative product judgment. A named worker receives a
  compact, self-contained handoff, remains a leaf executor, and never delegates the admission
  decision or a write.
- **Preserve preflight and helper ownership.** Existing retired-configuration checks remain before
  delegation or mutation. Every forge-side admission read, payload build/parse, and mutation uses the
  shipped remote helper under `remote-helper-contract`, including verified `RUNTIME_STATE_ROOT` as
  `cwd`, dry-run-before-apply, redaction, and stale-write failure; no caller assembles provider
  commands or parses marker payloads independently.
- **Apply the gate to derived work only.** A direct user request, the active issue/plan, or a roadmap
  commitment explicitly authorized before the finding is immediately primary scope. Findings, decomposition
  children, residual reports, investigation recommendations, and out-of-scope PR comments are derived
  candidates. The source observation cannot authorize its own follow-up. A later user-initiated,
  explicit instruction may create new primary scope; a system-offered routine confirmation may not.
- **Current-scope work cannot be offloaded.** A regression introduced by the active delta, an unmet
  explicit acceptance criterion, a violation of a product/quality/contract invariant documented before
  the finding, or an objectively necessary step without which the authorized end-to-end path cannot
  complete is fixed now. “More robust”, “more complete”, and “more honest” are not scope-expansion
  reasons. Reducing or withdrawing primary scope requires a new explicit decision from the user or the
  authorized owner of the primary plan/tracker artifact; the workflow cannot grant itself that
  authority. Current-scope work never becomes a new issue or plan.
- **Material harm is consequence-based, not taxonomy-based.** Security, privacy, authorization, data,
  money, regulation, required accessibility, core correctness, and severe core-path reliability are
  lenses. Admission still requires evidence, current reachability, material consequence, and a residual
  risk after fix-now, authorized scope reduction, rollback, feature flag, safe disablement, or bounded
  recovery.
- **Lock-in is structural and imminent.** If the active delta creates or materially deepens a boundary
  whose reversal requires one of the observable migrations listed in the requirement, it is
  `current-scope` and is corrected or blocked before merge. `irreversible-commitment` can be
  `admitted` only for an independent, already existing direction with a concrete near-term external,
  public, or persisted commitment outside the delta, plus evidence and a why-now deadline.
  Speculative future inconvenience stays `closed`.
- **Uncertainty blocks risk, not the backlog.** A credible but incomplete material-harm/irreversibility
  path is `uncertain`: for each root cause and run, name exactly one evidence question, one check, and
  its completion criterion, or safely contain/disable the path in the current workflow. Afterwards
  classify it as `current-scope`, `admitted`, or `closed`; if that is impossible, stop and ask the user.
  Never repeat `uncertain` in another round or workflow and never create a precautionary issue. An
  observation with no credible qualifying consequence is `closed`, not `uncertain`.
- **Conservative default.** Missing gate metadata never implies `admitted`. Legacy reports/issues are
  re-evaluated at re-entry; they are not bulk-closed or auto-implemented.
- **One root cause, one durable item at bounded lookup cost.** First group same-run findings by a
  deterministic normalized root-cause signature, then use already-known source references and the
  tracker's existing exact signature lookup. Do not scan every plan, report, and issue per finding.
  Send the remaining borderline candidates to `effective-product` once as a batch. An admitted item
  carries evidence, current reachability, why-now, and one objective completion condition. Automatic
  parent/child decomposition is forbidden for derived work.
- **Admission never grants write authority.** `admitted` means only that a durable item is eligible.
  Automatic persistence is allowed solely when the calling workflow already holds tracker/artifact
  mutation authority for that target. Otherwise the run creates no issue and asks no routine extra
  confirmation; it reports the eligible result within its already authorized output boundary.
- **No mandatory review epic.** Remote code review publishes admitted root-cause issues directly.
  Where the caller already has tracker-write authority, it does not create
  a container issue whose own existence would fail the admission gate. The apply route already accepts
  concrete finding-issue lists.
- **Standalone audits keep a compact closed appendix.** An explicitly requested standalone audit
  records closed observations in a non-executable appendix of the same report, using only a short
  title and closure reason. The appendix has no finding IDs, actions, prompt suggestions, or `apply`
  handoff and creates no additional artifact. Internal implementation reviews keep only completion
  counts in chat.
- **Bound automatic correction without weakening validation.** Each implementation review gets one
  automatic incorporation pass for new findings. Test/validator failures still use the existing
  bounded goal-completion rules. A remaining `current-scope` item blocks or reduces the slice rather
  than being exported as follow-up work.
- **No configuration switch and no parking lot.** Product completion is an invariant, not a profile.
  The change introduces no debt ledger, backlog file, or option that restores the old behavior.
- **Preserve disclosure isolation.** Admission precedes the security disclosure classification. The
  latter still controls local-only versus publishable handling and never weakens severity or evidence.
  The required local security report is initially the sole persisted and executable representation.
  After explicit publication, the direct remote finding becomes the executable source and the existing
  publication receipt makes local `apply` skip the report entry. Both representations may remain for
  disclosure safety, but they can never be active implementation sources at the same time; publication
  never creates an epic.

## Affected files

| File                                        | Description                                                                                                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/durable-follow-up-gate.md`      | New single source for derived-work scope, four outcomes, evidence/reachability/materiality/irreversibility checks, deduplication, and artifact effects                        |
| `src/shared/unresolved-review-report.md`    | Apply the gate before ID reservation and report creation for all four implementation workflows; return `current-scope`/`uncertain` to the caller and suppress their artifacts |
| `src/tools/build.md`                        | Replace “Important can be follow-up” with one incorporation pass plus the gate; block on residual current-scope findings unless the owner explicitly reduces scope            |
| `src/tools/fix.md`                          | Consume the common gated residual-report contract and report only admitted residual work                                                                                      |
| `src/tools/refactor.md`                     | Consume the common gated residual-report contract without creating a report for sub-threshold findings                                                                        |
| `src/tools/maintain.md`                     | Consume the common gated residual-report contract and preserve security maintenance behavior                                                                                  |
| `src/tools/investigate.md`                  | Gate the diagnosis's derived workflow recommendation; retain the report as the explicit investigation output but emit no executable follow-up below threshold                 |
| `src/tools/review.md`                       | Run admission after finding-quality/design-decision filtering and before IDs, local reports, or remote publication; publish admitted issues directly without an epic          |
| `src/shared/review-report-format.md`        | Add the stable admission fields/outcomes needed by admitted reports and terminal standalone-audit observations                                                                |
| `src/shared/security-disclosure-gate.md`    | Replace epic-specific publication with the admitted direct-finding flow while preserving mandatory local-first security persistence and explicit publication consent          |
| `src/shared/documentation-sync-contract.md` | Keep documentation invalidated by the active delta in `current-scope`; return a blocked verdict to the owner instead of auto-offloading a non-interactive docs finding        |
| `src/tools/apply-review.md`                 | Reclassify legacy/local findings before tasks or delegation; never treat missing admission metadata as implementable and do not turn sub-threshold rejection into an ADR      |
| `src/tools/apply-review-remote.md`          | Enforce the same re-entry rule for concrete remote finding issues before one-PR-per-finding execution                                                                         |
| `src/tools/apply.md`                        | List direct open review-finding issues as no-argument candidates while retaining legacy epic discovery without duplicate child entries                                        |
| `src/shared/apply-source-detection.md`      | Preserve legacy `review-epic` reads and make direct `review-finding` lists the canonical new remote source                                                                    |
| `src/shared/issue-tracker-forge.md`         | Define idempotent remote admission closure and the new direct-finding lifecycle while retaining legacy epic reads                                                             |
| `src/shared/tracker-target.md`              | Map admission closure to an external target without reusing `wontfix` or requiring unsupported terminal transitions                                                           |
| `src/tools/plan-issue.md`                   | Keep routine technical decomposition inside the parent planning artifact; permit no derived child issue unless it is independently admitted                                   |
| `src/tools/iterate.md`                      | Keep `valid_in_scope` in the PR; map non-admitted `valid_out_of_scope` items to terminal closure rather than an unspecified follow-up                                         |
| `src/shared/pr-review-integration.md`       | Gate Effective Flow reviewer findings before publication/security classification; do not publish non-admitted out-of-scope observations                                       |
| `src/shared/next-steps.md`                  | Emit `apply <report>` or `apply #<issue>...` only when the run actually produced admitted durable work; remove the review-epic assumption                                     |
| `src/scripts/remote-tracker-core.mjs`       | Render and parse the admitted finding fields, closure marker payload, and direct-finding flow without extending the strict decomposition-record key schema                    |
| `docs/developer-guide/skill-ownership.json` | Declare the gate's product-judgment relationship to `effective-product`                                                                                                       |
| `docs/developer-guide/skill-ownership.md`   | Document the effective-product/effective-delivery/Effective Flow ownership split and new consumer                                                                             |
| `docs/developer-guide/build-system.md`      | Register the shared fragment and its consumers/lazy-loading choice                                                                                                            |
| `docs/user-guide/tool-flow.md`              | Mirror the gated next-step table and explain that completion does not automatically create work                                                                               |
| `docs/user-guide/tools-quality.md`          | Explain review observation versus durable-work admission and direct issue publication                                                                                         |
| `docs/user-guide/tools-implement.md`        | Explain current-scope handling and gated residual reports/apply-review re-entry                                                                                               |
| `docs/user-guide/tools-understand.md`       | Clarify that explicit investigation/planning inputs remain primary work rather than derived follow-up                                                                         |
| `docs/user-guide/remote-tracker.md`         | Document direct admitted finding issues, no automatic review epic, and no automatic child decomposition                                                                       |
| `test/workflow-contracts.test.mjs`          | Pin the vocabulary, ordering, all materializers, legacy fail-closed behavior, next-step condition, and disclosure separation                                                  |
| `test/build-lib.test.mjs`                   | Extend ownership/include/next-step structural checks only where the existing build-library guards own them                                                                    |
| `test/remote-tracker.test.mjs`              | Cover admitted issue payloads, idempotent closure, direct findings without epics, strict decomposition records, and legacy round trips                                        |
| `build.mjs`                                 | Register the fragment if required by the build and adjust measured tool budgets by no more than ten lines of headroom                                                         |

## Implementation details

### Approach

1. **Re-verify the producer map.** Before editing, diff the planning baseline against the current
   branch and enumerate every source that can create a review report, finding issue, child issue,
   plan, or executable derived-work next step. Preserve each tool's first-read retired-configuration
   preflight before any new admission delegation or write. Stop if any materializer is not covered by
   this plan.
2. **Add the central gate.** Define the derived-versus-primary boundary, the four exact outcomes,
   required evidence record, allowed admission reasons, disposition ordering, deduplication rule, and
   artifact effects in `durable-follow-up-gate.md`. At the workflow/tool orchestration level, delegate
   product scope/prioritization judgment to `effective-product` once per run with the unresolved
   candidates as one compact, self-contained batch; use the existing effective-delivery result as
   evidence input. Never route that delegation through a named leaf worker. Keep a minimal
   consequence/reversibility fallback for a missing or disabled product skill.
3. **Order disposition before admission.** For every candidate, decide in this order:
   1. If it is a delta regression, violates an explicit acceptance criterion or previously documented
      invariant, or is objectively necessary for the authorized end-to-end path, return
      `current-scope`.
   2. Apply safe containment when available and reassess only the residual risk.
   3. Group same-run candidates by normalized root-cause signature, then deduplicate only through
      known source references and the existing exact-signature lookup.
   4. Require evidence and current runtime reachability, or for lock-in an unavoidable binding created
      by the authorized delta at merge/deployment.
   5. Admit only material harm or structural irreversibility; otherwise return `closed` or
      `uncertain`.
4. **Gate common implementation residuals.** Load the gate from
   `unresolved-review-report.md` so `build`, `fix`, `refactor`, and `maintain` cannot diverge. Filter
   before IDs and writes. Return `current-scope` candidates to the owning workflow; it must correct,
   obtain an authorized scope decision, or remain blocked. Closed candidates produce only aggregate
   completion counts and reasons. An `uncertain` credible high-risk path runs the bounded
   evidence/containment branch and blocks/escalates if it remains unresolved.
5. **Keep documentation gaps in the active slice.** In `documentation-sync-contract`, replace the
   non-interactive automatic `Action: docs` report handoff with `current-scope`. Return the blocked
   surface to the owning workflow for its bounded documentation correction in the current execution
   context. If path ownership or scope prevents that correction, the current run stays blocked unless
   the authorized owner explicitly reduces the slice; no docs follow-up artifact is created.
6. **Change build review completion.** Give the Phase-6 review one automatic incorporation pass. Do
   not globally reduce `goal-completion` validation rounds. After the pass, reclassify the residual set:
   `current-scope` blocks unless the authorized owner changes scope, `admitted` may reach the common
   report path, and the other outcomes terminate without durable work.
7. **Gate standalone and publishing review.** In `review.md`, run a preliminary scope/high-risk triage
   before the confidence and design-decision filters: a possible current-scope violation or credible
   material-harm/irreversibility path with incomplete evidence becomes the bounded current-run check,
   not a silently dropped low-confidence finding. Only a candidate that passes the existing
   confidence-at-least-80 review-quality filter can become `admitted`; final admission still runs
   after deduplication, severity, and design-decision reconciliation and before memory reservation or
   disclosure classification. A publishing run creates one issue per admitted root cause directly
   and creates no review epic. An explicitly requested standalone audit keeps terminal closed
   observations only in a compact, non-executable appendix of the same report, with a short title and
   closure reason but no finding ID, action, prompt suggestion, or `apply` handoff. Actionable finding
   blocks contain admitted findings only.
8. **Gate security publication and investigation handoff.** Update `security-disclosure-gate` so its
   mandatory local-first report is the sole executable representation until explicit publication;
   publication creates the already admitted direct finding issue, makes that the executable source,
   and adds the existing local publication receipt so `apply-review` skips the report copy. It creates
   no epic. Keep the requested investigation report as the primary output, but run its diagnosis-derived
   `fix`/`refactor`/`build`/`docs` recommendation through admission before rendering the persisted
   invocation suggestion or chat next step. `current-scope` refers back to the already authorized
   source artifact; `admitted` may recommend one follow-up; `closed` emits none; `uncertain`
   performs/requests bounded evidence or containment and otherwise stops.
9. **Keep direct remote findings discoverable.** Make direct `review-finding` references the
   canonical new remote source. `apply` without an argument lists open direct finding issues as well
   as legacy review epics, excluding a legacy epic's children from the direct list so one item is not
   offered twice. Continue to classify and process existing epics for backward compatibility; create
   no new ones. Remove new-flow assumptions that every finding has an `Epic` field, while retaining
   optional epic reconciliation for legacy findings.
10. **Protect re-entry with an idempotent terminal transition.** In local and remote `apply-review`,
    accept an explicit valid `admitted`
    record only after freshness/dedup checks. Re-evaluate legacy artifacts that lack it; insufficient
    evidence is never `Implement`. For local reports, persist a canonical admission field and one
    dated gate note that later reads recognize before status. For remote findings, add deterministic
    helper-owned build/parse support, then upsert one comment beginning
    `<!-- effective-flow-follow-up-admission:v1 -->` and add the exact classification
    `effective-flow-follow-up-closed`; readers accept this v1 marker in direct findings and legacy
    epic children. Every helper call carries the verified runtime root as `cwd`; mutations follow the
    existing dry-run/apply and fresh-hash discipline. Terminalize only through a target state
    unambiguously meaning cancelled/not planned; never reuse the completed `issue-close` path. When no
    such state exists, leave the issue open but exclude it from discovery through the
    marker/classification receipt. Do not reuse `wontfix`, which remains an explicit product-decision
    path. Reconcile a legacy epic entry when one exists. A repeat run skips a terminal receipt only
    when gate version, normalized root-cause/finding signature, evidence digest, and reachability
    anchor/digest still match; any change re-runs classification.
11. **Stop decomposition growth.** In `plan-issue`, retain implementation steps and technical
    substructure inside the parent comment. Only an independently admitted root cause may become a
    native child. Put the canonical admission fields in the proposed child body before
    `decomposition-records-build`; the existing `draftHash` binds them. Do not extend that helper's
    closed record-key schema, add a manual checklist fallback, or create another container.
12. **Close PR-review escape paths.** In `iterate`, `valid_in_scope` remains actionable in the active
    PR. Send `valid_out_of_scope` through admission; `closed` becomes terminal, `uncertain` runs the
    bounded evidence/containment branch and blocks/escalates if unresolved, and admitted work is
    reported without silently widening the PR. Apply the same ordering to automatic reviewer findings
    in `pr-review-integration` before disclosure/publication.
13. **Make next steps state-dependent.** An `apply` recommendation requires the concrete path or issue
    reference of durable work created by the current run. With no admitted artifact, emit no
    substitute planning/review invocation. Update the mirrored user-guide flow in the same change.
14. **Update ownership and user documentation.** Record `effective-product` as the admission-judgment
    owner, `effective-delivery` as the finding/evidence owner, and Effective Flow as the state/artifact
    owner. Document examples at the consequence boundary without creating a domain allowlist.
15. **Measure, test, and trim.** Run `node build.mjs`, set every touched tool budget to its measured
    built core plus at most ten lines, and prefer lazy loading at decision points where an eager include
    would exceed budget. Run the repository validation sequence.

### State and artifact contract

An admitted finding persists these stable fields in its existing report or issue representation:

- outcome `admitted`;
- one reason: `material-harm` or `irreversible-commitment`;
- evidence type and concrete reference;
- current reachability statement;
- root-cause/dedup identity;
- why the candidate is not `current-scope` and why containment is insufficient;
- why-now and one objective completion condition.

`current-scope` and `uncertain` are blocking run outcomes, not a new backlog. `closed` is terminal:
when re-entry starts from an existing local/remote artifact, update that artifact once with its stable
outcome, short reason, evidence hash/reference, and gate version, so later runs skip it idempotently.
That skip is valid only while gate version, normalized root-cause/finding signature, evidence digest,
and reachability anchor/digest still match; changed code, configuration, contract, or reachability
reopens classification. Within one run, keep closed signatures only in the existing transient wisdom
state to avoid repeated judgment. Create no durable closed ledger. An explicitly requested standalone
audit renders closed observations only in a compact, non-executable appendix of its existing report;
other workflows do not persist closed observations solely for history.

### Edge cases

- **A current change introduces a Cross-Tenant path:** `current-scope`; block delivery and fix it now.
- **A pre-existing supported path exposes another tenant:** `admitted` as material harm after dedup;
  disclosure still stays local unless separately approved for publication.
- **A core transaction reports success without durable state:** current-scope if introduced/required
  by the active slice; otherwise admitted only when reproduced on the supported core path.
- **A payment may plausibly double-charge through a partially traced current path:** `uncertain`; run a
  bounded trace/test or safely disable the path, and stop/escalate if neither resolves the risk. Admit
  only after evidence establishes the current money effect.
- **Keyboard access to the primary completion action is blocked:** current-scope when introduced by the
  delta; otherwise admitted when the barrier is confirmed on the supported primary path or a concrete
  applicable requirement is named.
- **A new persisted format requires production-data migration to undo:** `current-scope` before merge;
  the change must provide compatibility/migration or remain blocked. Reducing the slice requires an
  explicit authorized scope decision; the workflow cannot choose it itself.
- **A pre-existing direction will sign an external provider commitment next week, independently of the
  active delta:** `admitted` as `irreversible-commitment` only when the concrete commitment, migration
  consequence, decision deadline, and why-now evidence are present; a possible future provider choice
  without that deadline is `closed`.
- **A provider or dependency is merely inconvenient to replace:** `closed`; provider names and
  abstraction wishes do not establish structural irreversibility.
- **A legacy report has an Important finding and no admission record:** re-evaluate. Importance alone
  is insufficient. A credible high-risk path with missing evidence is `uncertain` and blocks for a
  bounded evidence/containment decision; an observation without a credible qualifying consequence is
  `closed`. Neither starts implementation.
- **Several findings share one root cause:** at most one admitted issue, not one issue per observation
  and not an additional epic.
- **An explicit user asks to build a reversible feature:** outside this gate because it is primary
  authorized work; ordinary planning and implementation rules apply.

### Stop conditions

- Stop before implementation if any durable-work producer bypasses the shared gate.
- Stop if a candidate cannot be classified and it blocks the active acceptance criteria; obtain the
  decision in the current workflow instead of defaulting to follow-up.
- Stop if a credible `uncertain` material-harm/irreversibility path cannot be resolved by the bounded
  evidence check or safe containment; escalate in the current run without minting an issue.
- Stop if an alleged lock-in names no concrete boundary and no required migration/coordination effect.
- Stop if a `current-scope` item would be exported or scope would be reduced/withdrawn without an
  explicit decision by the user or authorized primary-artifact owner.
- For a legacy report/issue with insufficient evidence, stop only when a credible qualifying
  high-risk path makes the result `uncertain`; when no credible qualifying consequence exists, record
  `closed` idempotently and continue.
- Stop if admission can be disabled by configuration or if implementation introduces a new parking
  artifact.
- Stop if ownership manifest and guide, next-step source and user-guide mirror, or measured tool budget
  and `build.mjs` entry disagree.

## Acceptance criteria

- [ ] One shared contract defines exactly `current-scope`, `admitted`, `closed`, and `uncertain`, with
      conservative default and no second copy of the product-judgment playbook.
- [ ] Admission judgment is coordinated only by the workflow/tool orchestrator; named workers receive
      compact, self-contained handoffs, remain leaf executors, and never delegate the judgment or a
      write.
- [ ] Existing retired-configuration preflights still complete before any admission delegation or
      mutation. Every forge-side admission helper call passes the verified `RUNTIME_STATE_ROOT` as
      `cwd`; mutations preserve dry-run-before-apply and fresh-hash/stale-write failure.
- [ ] Every derived report, remote finding issue, child issue, and executable follow-up passes the gate
      before ID reservation or write; a structural test enumerates all materializers.
- [ ] Findings caused by or required for the current slice can never become a new report, issue, child,
      plan, or follow-up workflow unless the slice is first explicitly changed.
- [ ] Reducing or withdrawing primary scope requires a new explicit decision from the user or the
      authorized primary-artifact owner; the gate and its agents cannot grant themselves that
      authority.
- [ ] Pre-existing primary scope is limited to the direct user request, active issue/plan, or a roadmap
      commitment authorized before the finding; a finding cannot authorize itself through wording or
      labels. A later explicit instruction creates new primary scope only when initiated by the user,
      never through a routine system confirmation.
- [ ] Review candidates pass the existing confidence-at-least-80 quality filter before admission;
      non-review entry points invent no numeric score. Every `admitted` result requires named evidence,
      current reachability, bounded deduplication, insufficient containment, and either concrete
      material harm or observable structural irreversibility.
- [ ] A credible but unresolved qualifying risk is `uncertain`, triggers bounded evidence or safe
      containment through exactly one named question/check/completion criterion per root cause and run,
      and then becomes `current-scope`, `admitted`, `closed`, or a stop/escalation; it neither loops,
      silently ships, nor creates a precautionary durable artifact.
- [ ] Review performs scope/high-risk triage before dropping low-confidence findings; confidence below
      80 cannot become `admitted`, but a credible current-scope or high-risk path receives the bounded
      evidence/containment decision instead of disappearing.
- [ ] General maintainability, optional completeness, polish, documentation, testing convenience,
      theoretical scale, and provider/dependency choice do not qualify by themselves.
- [ ] Material harm requires one closed consequence test: primary job blocked, false durable
      success/state, material destructive/financial/physical/external effect, named applicable duty,
      confirmed primary-path accessibility barrier, or no safe ordinary recovery.
- [ ] Active-delta lock-in is `current-scope`; only an independent, existing direction with a concrete
      near-term commitment, structural migration consequence, why-now evidence, and deadline may be
      admitted as `irreversible-commitment`.
- [ ] Deduplication uses same-run grouping, known references, and exact canonical signatures before one
      batched product judgment; it does not scan the complete plan/issue corpus per finding.
- [ ] Admission grants eligibility only. A durable write occurs automatically only when the calling
      workflow already has mutation authority for that target; otherwise no issue and no routine
      confirmation prompt is created.
- [ ] An explicitly requested standalone audit keeps closed observations only in a compact,
      non-executable appendix of the same report, with a short title and closure reason and without
      finding IDs, actions, prompt suggestions, or an `apply` handoff; internal implementation reviews
      create no equivalent appendix.
- [ ] Local and remote review reserve IDs and run the security disclosure gate only after admission;
      disclosure behavior is otherwise unchanged.
- [ ] The security disclosure gate keeps its mandatory local safety record and explicit consent, but
      uses it as the sole executable source until publication; after publication only the direct issue
      is executable and the local receipt makes `apply-review` skip the copy. It never creates an epic.
- [ ] Remote review creates no automatic epic and no routine parent/child decomposition; it creates at
      most one direct issue per admitted root cause.
- [ ] `apply` without an argument discovers new direct review-finding issues and existing legacy
      review epics without offering the same legacy child twice; existing epics remain readable but
      no new run creates one.
- [ ] Local and remote `apply-review` do not implement legacy findings merely because they are open or
      Important. Insufficient evidence branches consistently: a credible qualifying high-risk path is
      `uncertain` and blocks for evidence/containment; no credible qualifying consequence is `closed`.
- [ ] `iterate` keeps in-scope work in the PR and produces no durable follow-up for non-admitted
      out-of-scope comments.
- [ ] `investigate` keeps its requested diagnosis report but emits a workflow invocation/next step only
      for admitted derived work; closed diagnoses terminate and unresolved credible risk blocks for
      evidence/containment.
- [ ] Documentation invalidated by the active delta remains `current-scope` in interactive and
      non-interactive chains; it is corrected or blocks unless the authorized owner explicitly reduces
      the slice, and is never automatically exported as an `Action: docs` report finding.
- [ ] Next steps offer `apply` only with a concrete admitted artifact produced by the run; no admitted
      artifact yields no recursive substitute.
- [ ] Explicit user-originated work remains unaffected, and no configuration switch, debt ledger, or
      parking-lot artifact is added.
- [ ] Ownership/build guards pass, touched context-budget entries equal measured built size plus at most
      ten lines, and documentation describes the same policy as the source contract.
- [ ] Local and remote terminal closure is idempotent, does not reuse `wontfix`, and skips a previously
      evaluated closed finding without creating another comment, label, ADR, or report only while gate
      version, normalized signature, evidence digest, and reachability anchor still match.
- [ ] Remote closure uses marker `<!-- effective-flow-follow-up-admission:v1 -->` and classification
      `effective-flow-follow-up-closed`; it uses a cancelled/not-planned terminal state only when the
      target exposes that exact meaning and never reuses completed `issue-close`.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all exit 0.

Together these criteria define one completion condition: every route from a derived observation to
durable work is mechanically gated, current-scope quality remains in the active slice, only evidenced
material harm or structural irreversibility can create one deduplicated follow-up item, and the full
repository validation sequence passes.

## Validation plan

| Purpose                         | Command/check                                                                                                                   | Expected result                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Gate and materializer contracts | Add focused cases to `test/workflow-contracts.test.mjs`, then run `node --test test/workflow-contracts.test.mjs`                | All producers are enumerated; ordering and fail-closed behavior pass                                                      |
| Ownership/build structure       | Add only the needed structural assertions to `test/build-lib.test.mjs`, then run `node --test test/build-lib.test.mjs`          | Skill ownership, include graph, and next-step structure reconcile                                                         |
| Remote payload/lifecycle        | Add focused cases to `test/remote-tracker.test.mjs`, then run `node --test test/remote-tracker.test.mjs`                        | Admission fields round-trip; closure is idempotent; direct/legacy modes, runtime-root `cwd`, and stale writes remain safe |
| Mutation proof                  | On temporary copies, remove one gate consumer, move admission behind ID reservation, and make missing metadata imply `admitted` | Each mutation fails the focused contract test; restore without `git checkout --`                                          |
| Full tests                      | `pnpm test`                                                                                                                     | Exit 0                                                                                                                    |
| Formatting                      | `pnpm agent:check`                                                                                                              | Exit 0                                                                                                                    |
| Build and budget report         | `node build.mjs`                                                                                                                | Exit 0; every touched tool stays within its measured budget                                                               |
| Distribution                    | `pnpm test:distribution`                                                                                                        | Exit 0                                                                                                                    |
| Manual policy matrix            | Exercise the edge cases above against investigate, local/publishing review, legacy apply-review, plan-issue, and iterate        | Only independent, evidenced material harm/irreversibility produces durable work; current-scope stays current              |

## Assumptions and open points

- Verified drift: the eight commits from `538e224` through `2874b84` do not introduce a competing
  admission contract. They do require the preserved configuration preflight, leaf-worker boundary,
  compact delegation handoff, and centralized remote-helper discipline named above.
- Verified planning context: explicit direct finding references already enter
  `apply-review-remote` issue-list mode, and missing epics are permitted there. The implementation must
  additionally remove the current no-argument discovery and summary assumptions that only epics are
  offered.
- Deliberately out of scope: automatically grooming or closing an existing project backlog, changing
  review detection depth, lowering test/validator quality, creating a new issue priority system, or
  changing security disclosure/publication consent.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         5 |    2 |
| Security        |        1 |         3 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         4 |    0 |
| Testability     |        0 |         3 |    0 |
| Scope           |        1 |         5 |    1 |
| Maintainability |        0 |         0 |    1 |

### Findings

- **Critical · Architecture · incorporated:** `investigate` was an uncovered executable re-entry.
  It now gates the diagnosis-derived recommendation while preserving the explicitly requested report.
- **Critical · Security · incorporated:** credible but incomplete material-harm evidence no longer
  behaves like terminal closure; it requires bounded evidence/containment and blocks/escalates if
  unresolved.
- **Important · Testability · incorporated:** remote payload ownership now names
  `remote-tracker-core.mjs` and its tests; strict decomposition records stay unchanged and bind
  admission through the child-body draft hash.
- **Important · Scope · incorporated:** deduplication is bounded to same-run grouping, known references,
  and exact signatures, followed by at most one batched product judgment.
- **Important · Architecture · incorporated:** primary scope now requires authorization predating the
  finding, and `current-scope` is limited to the delta, explicit acceptance criteria, or a necessary
  step of that authorized path.
- **Important · Error cases · incorporated:** local and remote legacy closure now has an idempotent
  receipt and does not reuse the ADR-oriented `wontfix` path.
- **Important · Testability · incorporated:** confidence 80 remains a review prefilter rather than a
  universal, freely invented admission score.
- **Important · Architecture · incorporated:** the security disclosure contract now loses its
  single-epic assumption while retaining the mandatory local safety record and explicit publication
  consent.
- **Important · Architecture · incorporated:** documentation invalidated by the active delta remains
  current-scope in non-interactive chains instead of automatically becoming a docs report finding.
- **Important · Error cases · incorporated:** insufficient evidence follows the same explicit branch
  everywhere: credible qualifying risk becomes blocking `uncertain`; otherwise the candidate is
  terminal `closed`.
- **Note · Architecture · confirmed:** direct review findings are supported without an epic; the plan
  adds no-argument discovery and retains legacy epic reads.
- **Note · Scope · incorporated:** admitted work no longer requires owner/re-entry metadata that would
  turn the gate into a parking-lot schema.
- **Critical · Scope · incorporated:** an agent cannot reduce or withdraw primary scope to escape a
  current-scope blocker; only the user or authorized primary-artifact owner may do so explicitly.
- **Important · Scope · incorporated:** current-scope now uses four closed tests—delta regression,
  explicit acceptance criterion, pre-existing invariant, or objectively necessary end-to-end step—and
  rejects “more robust/complete/honest” scope claims.
- **Important · Architecture · incorporated:** active-delta lock-in is current-scope; an independent
  irreversible commitment is admitted only with a concrete near-term commitment, migration effect,
  why-now evidence, and deadline.
- **Important · Security · incorporated:** materiality now uses closed consequence tests, including
  physical safety and destructive external effects, instead of domain labels.
- **Important · Security · incorporated:** regulatory and accessibility findings require a named
  applicable authority or a confirmed primary-path barrier.
- **Important · Error cases · incorporated:** `uncertain` gets exactly one evidence question/check and
  completion criterion per root cause/run, then resolves or stops without another workflow.
- **Important · Architecture · incorporated:** the local security report and published issue can no
  longer both be active apply sources; the publication receipt transfers execution authority remotely.
- **Important · Error cases · incorporated:** a closed receipt is reusable only while the gate version,
  normalized signature, evidence digest, and reachability anchor remain unchanged.
- **Important · Testability · incorporated:** remote closure now has one versioned marker, one canonical
  classification, and safe cancelled/not-planned semantics instead of completed `issue-close`.
- **Important · Security · incorporated:** review scope/high-risk triage now precedes the confidence
  filter, so low-confidence credible harm becomes bounded `uncertain` rather than disappearing.
- **Note · Maintainability · incorporated:** same-run closed signatures use transient wisdom state;
  no persistent closed ledger is introduced.
- **Note · Architecture · incorporated:** “four closed outcomes” was renamed to “four outcomes”.
- **Important · Scope · incorporated by user decision:** admission establishes eligibility only;
  automatic writing requires tracker/artifact mutation authority already held by the calling workflow.
- **Important · Scope · incorporated by user decision:** a later explicit user-initiated instruction
  may create new primary scope; routine system confirmation cannot.
- **Important · Scope · incorporated by user decision:** closed observations from an explicitly
  requested standalone audit remain visible only in a compact, non-executable appendix of the same
  report.

## Open points

- No open points.
