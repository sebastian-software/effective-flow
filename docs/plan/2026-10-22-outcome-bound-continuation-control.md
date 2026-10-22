# Bound cumulative effort against the original outcome

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

**Planned against:** `b575bee` on 2026-10-22; clean harness-managed source checkout.
**Owner decision:** Reassess after two continuations without evidenced progress toward the original
outcome, and immediately before a material expansion of the approach. Quality and required safety
checks remain binding.

## Requirement

Effective Flow bounds correction rounds within a workflow and filters new derived work, but neither
mechanism reliably limits the cumulative approach across repeated planning, implementation and
review runs. A dependency-alignment task in the retrospective delivered useful intermediate code,
then accumulated infrastructure and runtime qualification while its original operational result
remained unproved. Successful tests and individually approved next steps did not establish that the
complete approach remained proportionate.

Make the existing orchestrator preserve the original outcome, assess cumulative investment and
remaining ownership, and reconsider the approach at defined boundaries. The result must be a bounded
continuation, an authorized change of approach, a genuinely consequential owner decision, or an
honest stop. It must not automatically generate another plan, review workflow, issue, or approval.

**Completion condition:** All affected source entry, return and recommendation paths preserve one
primary outcome and its continuation state; the second consecutive no-progress continuation and
any material expansion invoke the same reassessment before further optional work; behavioral
acceptance demonstrates this without skipping a required quality or safety check.

## Architecture decisions

- **One orchestration contract, existing domain owners.** Put the continuation protocol in one new
  shared fragment, `src/shared/outcome-continuation.md`. It owns identity, state, triggers and
  handoff. Delegate proportionality and smallest-coherent-outcome judgment to `effective-product`,
  using `effective-delivery` for delivery evidence and complexity judgment, and specialist skills
  only at their established boundaries. Keep a small fallback; do not copy those playbooks.
- **Existing primary source is authoritative.** Prefer the active local plan or the issue's existing
  canonical planning comment. For a sufficient plain issue, reuse an already required lifecycle
  comment; report-based fixes reuse an already authorized implementation note when available.
  Sources without a writable artifact carry the checkpoint in the existing return/handoff and
  explicitly retain unknown history when continuity is lost. Never create a planning artifact only
  for bookkeeping. No global ledger, wisdom persistence, runtime database, telemetry, product CLI,
  new tool or configuration switch.
- **Use source identity and explicit text, not a new digest system.** Keep the verified repository /
  tracker identity and primary source reference, a short original outcome with its acceptance
  references, and dated owner changes. Existing publication hashes and mutation guards remain
  authoritative for their current purposes. A new goal hash would not establish authorization.
- **A small checkpoint, not a history transcript.** Retain the last evaluated attempt, consecutive
  no-progress count, latest decisive evidence, cumulative approach/ownership summary and any active
  bounded decision. Keep earlier owner decisions readable; replace routine status summaries. Do
  not count tokens, model calls, commits or elapsed chat time as outcome progress or invent costs.
- **Automatic reassessment, selective questions.** Use the existing judgment mechanism within the
  active run; do not route into another workflow merely to reassess. Continue within existing
  authority when the outcome, invariants, supported boundary and bounded approach are unchanged.
  Ask only when the proposed decision exceeds authority or changes those commitments.
- **Prompt contract with behavioral proof.** V1 adds orchestration instructions and human-readable
  source state, not a deterministic execution sandbox. Do not claim that a counter prevents an
  uncooperative agent from running tools. Validate actual model behavior as well as wiring.
- **Keep the normal path small.** New planning sources add the short anchor/checkpoint convention.
  Detailed reassessment guidance is loaded only for continuation, escalation or a triggered review.
  A straightforward successful change does not acquire a second review or a new approval gate.

## Affected files

| File or existing surface                                                                                          | Planned change                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/outcome-continuation.md` (new)                                                                        | Single protocol and checkpoint representation, with English/German artifact labels and minimal fallback.                                                                    |
| `src/shared/goal-completion.md`                                                                                   | Short entry/return requirements and conditional pointer; preserve current completion and correction invariants.                                                             |
| `src/shared/plan-contract.md`, `src/tools/plan.md`, `src/tools/plan-issue.md`                                     | Add and maintain the outcome checkpoint within the existing primary planning surface; review it with the plan.                                                              |
| `src/shared/central-reasoning-delegation.md`                                                                      | Carry the original outcome, cumulative summary and current trigger in existing judgment handoffs where applicable.                                                          |
| `src/tools/apply-plan.md`, `src/tools/apply-issues.md`, `src/tools/apply-review.md`                               | Preserve primary association and single-owner attempt accounting through routing, decomposition and returning delegates.                                                    |
| `src/shared/durable-follow-up-gate.md`                                                                            | Keep admission semantics; primary work remains primary but is also subject to continuation reassessment.                                                                    |
| `src/shared/next-steps.md`                                                                                        | Apply the continuation decision before selecting an outward invocation, without changing the read-only boundary.                                                            |
| `src/tools/investigate.md`, `src/tools/review.md`                                                                 | Carry verified primary associations and consult the same protocol before recommending another step in an existing chain.                                                    |
| `src/shared/unattended-planning.md`                                                                               | Keep no-question and one-file limits; retain the primary association in the generated artifact and return a blocker when a decision is required.                            |
| `src/scripts/plan-lint-core.mjs`, `test/plan-lint.test.mjs`                                                       | Extend only the bilingual heading projection if a canonical heading is added; prove legacy and checkpoint-bearing plans remain lintable. No new lint payload/result schema. |
| `test/workflow-contracts.test.mjs`, `test/unattended-planning-contract.test.mjs`                                  | Protect integration, existing safety invariants and the no-question boundary. Name the invariant each prose-reading assertion protects.                                     |
| `evals/next-steps/` and `test/next-steps-eval.test.mjs`                                                           | Add bounded recommendation cases; keep final-report-only evidence distinct from source-update/re-entry acceptance.                                                          |
| `docs/developer-guide/skill-ownership.json`, `docs/developer-guide/skill-ownership.md`                            | Record the new fragment's consumer relationships to central owners.                                                                                                         |
| `docs/developer-guide/architecture.md`, `docs/developer-guide/build-system.md`                                    | Document the state owner, trigger behavior, limits and behavioral-evidence obligations in the existing guides.                                                              |
| `build.mjs`                                                                                                       | Update measured context budgets only where required by the actual build output. New shared fragments use existing discovery.                                                |
| `evals/next-steps/_scaffold/continuation-exercise.mjs` (new), `test/outcome-continuation-exercise.test.mjs` (new) | Bounded host-driven persistence exercise and fidelity tests; capture actual submitted bodies instead of using canned write success.                                         |

## Implementation details

### 1. Preserve the original outcome and one source of state

Add one optional canonical outcome-checkpoint section to the bilingual plan contract and the
canonical issue-planning format. Its short fields are:

1. Primary source identity and original outcome, including the acceptance references and required
   safety / support boundaries. This baseline is not silently rewritten by a new plan revision.
2. Latest evaluated attempt identity and its original-criterion evidence delta; no-progress count
   as `0`, `1` or `2` (saturated at `2`, meaning reassessment is required), or `unknown` for
   unreconstructable prior continuation history.
3. Cumulative investment / owned components, remaining decisive proof, and current approach. Use
   observed facts and clearly labeled estimates; missing cost data is unknown, not zero.
4. Latest bounded continuation decision: approach, next observable proof, positive finite attempt
   allowance and attempts remaining, stop condition and any explicit owner authorization reference.
   An observable effort bound may additionally apply; unknown time/cost is not a usable bound.

Use existing artifact language rules and tracker mutation contracts. This is a small prose section;
no JSON fence, new schema version, cryptographic anchor or second planning comment is needed. Child
sources inherit the verified parent reference and do not independently own/reset the counter.

Source coverage and write ownership are explicit:

| Existing source                                                            | Authorized state carrier                                                                                                                                                         |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local plan or canonical planning comment                                   | Active source-owning orchestrator updates the checkpoint through its existing file/tracker authority.                                                                            |
| Sufficient plain issue without a planning comment                          | Keep the original requirement in the issue; carry the checkpoint in the workflow's already required PR-link/failure lifecycle comment. No planning-comment creation is required. |
| Review-report fix                                                          | Append the checkpoint to the implementation note the fix already writes on that finding.                                                                                         |
| Investigation-report fix or direct request without another writable source | Return the verified source association and checkpoint in the existing completion/handoff; do not grant `fix` authority to rewrite the diagnosis or create a bookkeeping report.  |
| Read-only re-entry                                                         | Consume the retained handoff or known source and return a proposed delta only; missing history takes the `unknown` rule below.                                                   |

For lifecycle-comment state, inspect only the known issue's already permitted fresh comments and
its retained workflow/source association; ambiguous competing checkpoints mean `unknown`, not a
heuristic newest-source selection. Original issue body and owner clarifications remain the goal
basis. For chat/handoff-only state, exact counting is supported while that context is retained;
after loss it is deliberately unknown and requires the compact reassessment. V1 does not claim
durable exact counts across unrelated fresh chats without an accessible carrier.

Legacy sources remain usable. Establish the baseline from the known original requirement,
acceptance and explicit owner decisions in the already associated source; preserve a concise note
of what is known. Do not scan the whole session/tracker corpus or bulk-migrate plans. A known goal
with unknown prior continuation history retains `unknown` and receives one compact reassessment
before dependent continuation. A justified bounded decision permits work within existing authority
without pretending the earlier count was zero; the new decision boundary records subsequent
attempts while preserving the unknown earlier effort. Fresh initial work starts normally at `0`.
If identity or the original outcome cannot be established, name that specific missing context and
withhold only the dependent continuation. Missing new metadata alone does not create a planning
blocker or force another planning workflow.

### 2. Define progress and count the chain once

An attempt is one deliberately bounded continuation toward the same original outcome after an
earlier attempt returned. Initial implementation establishes the first return checkpoint; the next
two outcome-directed continuations can increment its no-progress count. A router, returning
subworkflow, worker retry, formatting fix or repeated read-only status query is not another attempt.
The outer source-owning orchestrator assigns the attempt reference and accounts for it once after
all returning children; resumes retain that reference.

Qualifying progress is new verified evidence that satisfies or materially advances a previously
defined original acceptance proof or resolves its named blocker. A necessary negative result can
qualify when it decisively answers a bounded evidence question that was specified beforehand and
closes an uncertainty on that original proof. Record which proof and how it advances. New model
fixtures, green local tests, merged sub-PRs, rewritten plans or newly invented subgoals do not qualify
by themselves. Approach-created prerequisites and renamed blockers cannot reset the count merely
by becoming more specific.

At `2`, keep the reassessment state until its decision is recorded. Changing workflow, session,
repository, worker, child issue, plan filename or validation package does not restart the allowance.
A genuinely new owner-originated goal is separate work with its own baseline; preserve the old
goal's unfinished/withdrawn state. A routine “yes”, deep-review approval or repair approval is not
such a goal change or an unlimited budget extension.

### 3. Reassess before expansion or a third no-progress continuation

Trigger immediately when the proposed next step introduces a new maintained component/service,
custom platform/library build, trust boundary, deployment target or substantial operating duty not
already accepted in the approach. Trigger also when a finite effort/attempt allowance is exhausted
or the no-progress count reaches `2` with no valid remaining allowance from its recorded
reassessment. The second no-progress return has no such allowance until reassessment occurs there.
A failed required safety check remains blocking regardless of count; it never waits for two failures.

Perform one compact judgment in the current workflow, using the original outcome, cumulative
investment, evidence delta, remaining proof, runtime/maintenance ownership and current authority.
Compare the current approach with the smallest supported alternative and a truthful stop; use
central owners for that judgment. Sunk cost is not a reason to continue. Unknown alternatives are
labeled unknown, not asserted safe. Do not launch a general repository audit or discovery program.

Allowed results are:

- **Continue within authority:** a concrete finite next allowance, proof and stop condition justify
  the same or a smaller approach without altering accepted guarantees. Record the rationale and
  resume; do not ask for a redundant confirmation. The reassessment must not renew an identical
  failed experiment without changed evidence or a specific owner decision accepting the bounded
  additional attempt.
- **Owner decision required:** show the smallest consequential decision, relevant alternatives,
  cumulative cost/ownership and recommended bound in the existing artifact/chat. Preserve the
  blocked endpoint while independent authorized work can continue.
- **Stop this approach:** retain unfinished acceptance and the concrete reason. Stop does not mean
  implemented, accepted risk, waived test, withdrawn requirement or automatic cancellation.

Reassessment does not automatically reset no-progress history. New qualifying evidence resets the
count to `0`. The following allowance example applies to a reassessment entered at saturated `2`;
reassessment triggered at `0`, `1` or `unknown` preserves that value until ordinary attempt evidence
updates it. At saturated `2`, a justified decision may authorize, for example,
two specifically bounded attempts: record that allowance and `remaining: 2`, consume one exactly
once per completed attempt, and retain count `2` on an unsuccessful return. With `remaining: 1`
and unchanged decision assumptions/authority, the next authorized attempt proceeds without repeating
the same reassessment. At `remaining: 0`, the decision is exhausted; material expansion or changed
evidence that invalidates its rationale terminates it earlier. Restore the review-required state
at that boundary. A duplicate/resumed return consumes nothing twice. A progress reset invalidates
the old special allowance so it cannot be reused later. Renewing an exhausted decision still needs
changed evidence or the specific consequential owner decision described above, not another routine
approval or renamed question. Earlier effort and the decision reason remain visible.

### 4. Preserve safety, authority and continuity

- Never remove required authorization, compatibility, accessibility, data-integrity, rollback,
  isolation or other original safety checks to satisfy an effort bound. Narrowing supported scope
  requires the existing owner decision and applicable safety judgment; it does not waive checks for
  the scope that remains. A required check that cannot pass means the relevant outcome is blocked.
- Existing safe containment and actions necessary to restore a safe state remain eligible under
  their current authority. They do not authorize resuming the broader blocked approach afterward.
- Only the active source-owning orchestrator updates the checkpoint, using already granted write
  authority and existing tracker expected-body/hash protections. Returning workers provide evidence
  and do not write competing counters. Parallel work shares one parent attempt, not a distributed
  counter per worker.
- Read-only review, investigation and `next-steps` do not acquire primary-artifact write authority.
  They return a proposed checkpoint delta to the authorized caller or report the pending source
  update. They can block a continuation recommendation; they must not invent a write or guess zero
  history. No substitute `plan`, `review` or issue-creation invocation evades that block.
- A fresh source read invalidates a stale write proposal. Concurrent/conflicting primary updates
  are reconciled through the existing mutation contract; never overwrite another owner's evidence.
- Unattended runs ask nothing. A consequential unresolved choice returns an explicit blocker under
  the existing `Revision required` / `ABORT` distinction and its one-artifact write boundary.
- Preserve current decomposition parsing, plan-PR continuation, archival and lifecycle receipts.
  A code-delivery milestone may still be complete while the parent operational outcome is open;
  report both without either losing the original endpoint or reopening finished work.

### 5. Integrate and verify as one delivered feature

Wire the shared contract through the listed source-entry, completion and recommendation surfaces.
Existing `goal-completion` consumers inherit the common rule; update a direct tool only where its
different source/write authority requires it. Keep `next-steps` read-only and its maximum two options.
Use conditional load pointers at the actual decision points; do not duplicate the protocol.

Run the ownership check before expanding consumers. Register the new fragment as a consumer of
`effective-product` for proportionality and `effective-delivery` for evidence/complexity judgment;
reuse the established specialist relevance gate. Do not change the sister project's domain skills.
Measure built context from the `Always-loaded core (lines/budget)` report; add only justified
headroom of at most ten lines and retain all native/portable and role-tier contracts.

Add source-wiring and format compatibility tests, then behavioral cases that can distinguish the
new behavior from today's valid continuation suggestions. Use anonymized synthetic source content;
do not publish live project evidence or raw chat logs. Complete source and behavioral acceptance
within this feature; do not declare it delivered because a new eval plan was written.

## Acceptance criteria

- [ ] Local plans and canonical issue planning comments preserve the original goal, accepted
      boundaries, primary association and a single compact checkpoint through re-entry and child
      handoff; legacy missing metadata alone does not block ordinary valid work.
- [ ] The first no-progress continuation records `1`; the second records `2` and performs the
      reassessment before further optional work. Resuming the same attempt and returning delegates
      do not double-count; changing session/workflow/child source does not reset history.
- [ ] Material expansion triggers before the new component, platform, trust boundary or operating
      duty is implemented, including when intermediate tests pass or the existing issue is primary.
- [ ] Judgment compares cumulative and remaining effort/ownership against the original outcome,
      records a finite continuation or real blocker, and never renews a failed approach through a
      routine approval, a renamed question, a new planning artifact or invented outcome progress.
- [ ] Required quality/safety failures remain blocking. Their corrective/containment work preserves
      existing authority, and a counter or effort limit never causes a test waiver or false success.
- [ ] Read-only paths do not mutate primary state; unattended paths ask no questions; concurrent
      source changes and unresolved legacy identity stop only the affected continuation honestly.
- [ ] Sufficient plain issues and report/direct-request fixes remain usable without creating a
      plan or canonical planning comment; lost handoff-only history becomes `unknown`, never zero.
- [ ] A justified allowance spanning two attempts is consumed once per return without repeated
      review after the first, hidden history reset, or execution beyond its exhausted/invalid bound.
- [ ] Successful short work and genuinely advancing multi-package work continue with no redundant
      owner question or second full review. A documented negative proof can count when it actually
      resolves the prior original-outcome question; unrelated model success cannot.
- [ ] Behavioral recommendation evidence and the bounded source-update/re-entry exercise below
      demonstrate the chosen threshold, safety preservation, legitimate continuation and no reset.
      The completion report states exactly what each evidence layer proves.
- [ ] The repository's four required checks pass in order; affected release-evidence freshness is
      reported accurately, with no forged or automatic model evidence and no version bump by hand.

## Validation plan

- Extend existing contract tests for the single owner, trigger placement, preserved completion /
  safety invariants and unattended limits. Test plan-lint against English/German checkpoint-bearing
  and legacy documents, and unchanged closed CLI payloads; do not create a second parser.
- Extend the existing next-steps suite with completed-run states for threshold reached, material
  expansion despite green subchecks, justified advancing continuation and missing/conflicting
  source context. Reuse the production fragment and fixture stub; keep expectations out of prompts,
  follow the suite's five-fresh-runs rule and independent qualitative reading. This evidence proves
  recommendation choice only, not state updates or a complete implementation workflow.
- Separately run the bounded host-driven exercise through the new
  `evals/next-steps/_scaffold/continuation-exercise.mjs` module's `prepare`, `record`, and `verify`
  entry points. These are test-coordinator operations, not a product CLI or a new general eval
  suite. Reuse the existing built-skill provenance, isolated checkout and actual host receipt
  conventions. The host launches fresh contexts; the helper never fabricates model output or
  launches a model itself. Use one local plan and one issue-comment fixture with normal source-write
  authority. For the latter, use a narrowly scoped offline adapter that captures the actual submitted
  `payload.body`, checks the existing expected-body/hash precondition through the production helper
  contract, persists that exact body and serves it on subsequent reads. The existing canned-envelope
  tracker stub cannot prove this and remains unchanged. Unsupported writes and network access fail.
- In that exercise, an outer run and returning child account for one attempt. Assert that the first
  no-progress continuation returns with `1`, and the second returns with persisted `2` **and an
  actual reassessment result before another optional step**. A fresh re-entry reads that same state
  and does not repeat or erase the decision. Replay a stale/duplicate return and a read-only entry:
  neither increments nor overwrites state. Include a necessary safety failure, an advancing control,
  a legacy `unknown` history, and one investigation-report/direct-request fix with handoff-only
  state and no artifact creation. Exercise a sufficient plain issue through its existing lifecycle
  comment as a second issue carrier. After reassessment grants two attempts at saturated `2`,
  verify `remaining: 2` to `1` to `0`, no duplicate consumption, no early repeat review, and a real
  stop/reassessment at exhaustion; changed material assumptions invalidate it immediately. Retain
  prepared inputs, observed outputs, captured mutation bodies,
  source before/after diffs and real host receipts with the implementation's acceptance evidence.
  Run `node --test test/outcome-continuation-exercise.test.mjs` to prove the adapter cannot replace
  an incorrect submitted checkpoint with a canned correct body, and rejects stale updates. This
  evidence does not model arbitrary distributed sessions or production environments. Do not relax
  the next-steps suite's read-only state invariant to accommodate this exercise.
- Run `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution` from the verified
  execution root. Inspect native Claude, native Codex and portable delivery for the same threshold
  and preservation rules; no generated `dist/` changes are committed.
- Run `pnpm eval next-steps verify`, `pnpm eval merge-gate verify`, and `pnpm eval iterate verify`.
  Source/load-set changes may stale all three existing suites. Follow each README's real recording
  protocol and release deadline; source checks cannot claim model evidence. The new targeted
  behavior above is part of this feature's acceptance, not postponed behind release housekeeping.

## Assumptions and open points

- Verified: the source already has bounded per-run repair, derived-work admission, plan/comment
  ownership, read-only recommendation and central judgment contracts; this plan extends their
  cross-run coordination rather than replacing their quality or security rules.
- Owner-set policy: two no-progress continuations trigger reassessment; material expansion triggers
  immediately. This is a decision boundary, not a claim that every task should finish in two runs.
- V1 intentionally uses a visible, instruction-enforced checkpoint. It cannot guarantee continuity
  when a fresh chat has no accessible primary association, nor prevent deliberate source tampering;
  it reports that missing context instead of introducing a tracking platform.
- Rejected exploration option: mandatory goal hashes, a global lifetime counter, fixed elapsed-time
  estimates and a blanket legacy migration add mechanics without establishing goal relevance or
  safety. The original-outcome comparison remains an evidence-based domain judgment.
- Source drift in the listed orchestration surfaces requires a targeted compatibility check at
  implementation entry. Unrelated newer commits do not invalidate the original outcome.
- Gap analysis, 2026-10-22: incorporated the actual-body capture requirement for issue fixtures,
  explicit legacy `unknown` handling and observation of reassessment at the second return itself.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         2 |    0 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    0 |

### Findings

Internal plan review, 2026-10-22; the counts record findings addressed in this plan.

- **Important (Error cases) — incorporated.** Saturated no-progress history and an authorized new
  attempt allowance now have explicit separate transitions, consumption, invalidation and expiry.
  Acceptance includes an allowance spanning more than one attempt and duplicate-return handling.
- **Important (Error cases) — incorporated after focused recheck.** The saturated-count example
  applies only to a reassessment entered at `2`; material-expansion and legacy reassessments retain
  their prior `0`, `1` or `unknown` instead of manufacturing failed attempts.
- **Important (Architecture) — incorporated.** The source/write-ownership matrix covers sufficient
  plain issues and report/direct-request fixes without creating new planning artifacts. Handoff-only
  counting has an explicit continuity limit and unknown-history reassessment rather than a false
  persistent-state guarantee. Acceptance includes those carriers.

### Deep interactive review, 2026-10-22

No additional findings or decision-requiring open points. Checked the original outcome, the fixed
two-continuation boundary, early and saturated allowances, consumption/expiry/reset, unknown prior
history, source/write ownership, read-only and unattended re-entry, mandatory quality/safety checks,
and the cost and limits of the bounded behavioral acceptance. Compared the plan with the affected
completion, recommendation, Apply/Fix and eval contracts. The existing review record above remains
prior-round history.

## Open points

- No open points.
