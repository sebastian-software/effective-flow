## Portable worker delegation

Names matching `effective-flow-<worker>` in this instruction identify bundled worker contracts, not installed custom-agent roles. Only the workflow/tool orchestrator starts workers or analysis fan-out. When a worker is selected, read only its matching `workers/effective-flow-<worker>.md` file, then delegate through the host harness's built-in general-purpose subagent mechanism with zero inherited turns when supported, otherwise its smallest supported history. Use that contract as the worker instructions and add a compact, self-contained handoff containing the objective, relevant artifact paths, scoped paths and ownership, execution and runtime-state roots when writes are allowed, resolved language, authority and write limits, and completion protocol. The worker is a leaf executor: it starts no child and returns missing essential context to the orchestrator. Do not request a custom role by the contract name. If the host offers no built-in subagent delegation, stop with a clear explanation; a single spawn the host refuses at run time is a declined delegation and follows the delegation mandate's inline fallback. Never claim that an undiscoverable worker ran.

# Build execution: one approved Feature plan

This is the phases-2–7 workflow orchestrator, not a named worker. Read this fragment once after the caller's clarified-plan seam; never re-enter the build caller or dispatch another build runner. Execute exactly the request's approved plan and preserve its restrictions. No new independent plan enters this run.

## Recommended skills

- `effective-delivery`

## Delegation mandate

Invoking an Effective Flow tool **is** the user's standing request for internal delegation through an available sub-agent mechanism (e.g. an `Agent`/`Task` tool, a bundled worker contract, or a comparable mechanism). A host default that discourages unrequested sub-agents does not apply inside a tool run.

- Where the workflow names a worker role, delegating to it is **mandatory**, not a judgment call.
- For analysis, exploration, and research, orchestration-level delegation is the **default**. Work inline only under this **triviality exception**: a single known file, one lookup, or a step whose whole cost is smaller than briefing a worker. Sites that name this exception mean exactly this definition. It waives delegation only, never a workflow step such as a reservation, a report, a lock or a commit. The orchestrator sends all other substantive work to a sub-agent as well, unless a tool's explicit in-run rule binds that work to the run (such as the `merge-gate` state reading and guard evaluation) or the triviality exception applies.
- Only the workflow/tool orchestrator may start worker roles or analysis fan-out. Every named worker is a **leaf executor**: it starts no sub-agent, never re-delegates its assignment or a write, and returns missing essential context to the orchestrator instead of seeking it through child delegation. Start each worker with **zero inherited turns** when supported, otherwise the smallest host-supported history, and supply a compact, self-contained handoff with the objective; relevant artifact paths; scoped paths and ownership; execution and runtime-state roots when writes are allowed; resolved language; authority and write limits; and the completion protocol. The orchestrator gives every spawn it starts the tier rendered at its spawn site. **Load on demand:** Read `shared/subagent-progress.md` only as an orchestrator considering longer delegated work or receiving trusted progress context; leaves never load it. An eligible compact handoff supplies the actual immediate-parent tool/channel, parent address and dispatch. A leaf verifies its own tool and that parent; when it has confirmed a materially useful intermediate result for that parent and necessary domain work remains, it sends one `PROGRESS/1 <dispatch>: <checkpoint>` (phase, observed result, next action; checkpoint at most 20 words). Keep at most one per logical handoff. Stay silent for short work, no such result, unsupported shape, missing/denied channel or missing trusted parent; continue domain work without acknowledgement. Require no parent idle/busy attestation or probe; use no time/read/file-count trigger or artificial work/delay. Send only to that parent; no sibling/cross-session/ancestor messages, starts/resumes, permission forwarding or message-based approvals. Recovery resumes keep the same allowance.
- If the orchestrator's harness offers no such mechanism, or a delegation is declined at runtime, the orchestrator works inline and says so in one visible line — never silently.
- An orchestrator that itself runs as a sub-agent — a workflow delegated by another workflow — starts its own worker and analysis sub-agents in the foreground or awaits each one's result, and **never ends its turn while a child is still pending**: a delegated run is not reliably resumed when a background child finishes. This binds its own fan-out only; the handoff that started it keeps the mechanics below.
- This mandate covers worker roles and analysis fan-out only. Delegation from one workflow to another keeps that tool's own mechanics, including its interactive/gated path. Before dispatch, resume, or terminal result acceptance, the orchestrator reads `shared/model-selection.md` and applies its executable selection and result checks.

**Load on demand:** Read `shared/model-tiers.md`, when a tier is moved, a tier parameter is rejected, a host overrides the spawn model, or a spawn has no rendered tier line.

## Skill discovery

Before you start the actual implementation, planning, or review, survey the skills available in
the environment and pull in the ones useful for the concrete task. If the environment provides
no skill directory or none fits, this step is a no-op — continue without an error or a block.

### Approach

1. **Prefer recommended skills:** Preferentially apply the skills listed further above under
   "Recommended skills", provided they are available and relevant to the concrete task.
   "Preferring" is the selection; **authority** is decided by the contract in point 5. A fallback
   notation `A › B` is an ordered preference: take the first available, non-excluded skill in the
   group, never both. If no such section exists (e.g. for tools), this point does not apply.
2. **Judge relevance:** Pull in only skills that clearly fit the **concrete** task (typically
   0–2), never "on suspicion". Never load the `effective-flow` router recursively as a
   **discovered skill**: re-entering the host of this run would create competing lifecycle and
   delivery owners. Declared tool-to-tool delegation is a different mechanism and stays allowed.
3. **Take config into account:** If present, read the `skills` block from the Effective Flow
   configuration (project-setup ADR) on a best-effort basis — the global fields plus your own
   scope entry (an agent reads `agents.<own-name>`, a tool reads `tools.<own-name>`).
   - `enabled: false` → skip the entire dynamic skill usage.
   - `exclude` (global or scope) → never apply these skills; an excluded fallback member is
     skipped in favor of the next fallback.
   - `include` (global or scope) → additionally consider these skills as preferred; a
     skill that is not installed is silently ignored.
   - If the block or the file is missing, the default applies (`enabled` on, no additional
     lists). Only read the config; do not migrate or write it here.
4. **Library docs:** For an unknown or current library or framework, use an available
   current-docs skill (e.g. `context7-mcp`) when needed instead of guessing from memory.
5. **Authority contract (orchestration vs. domain expertise):** Effective Flow and the central
   skills share the responsibility in a **layered** way — not "Effective Flow always wins":
   - **Effective Flow owns the orchestration** (the **what/when**): routing and user
     interaction, plan/report state, finding IDs, backlinks, tracker integration, resumability,
     agent selection and parallelization, baseline comparison, worktrees, commits, delivery,
     harness transform, and config. These rules, `AGENTS.md`/project conventions, plus its own
     language, commit, and scope rules **always** take precedence; no skill may widen scope,
     introduce new dependencies, or violate the agreed plan. In analysis/planning tools the
     no-code boundary stays strict.
   - **Central skills own reusable expertise** (the **how**): domain checklists, heuristics,
     standards, research procedures, and specialist guidance. If a recommended skill is the
     **declared domain owner** for the technical question at hand **and** covers it, its
     guidance is **authoritative** — not optional advice. The tool's own source then carries
     **no second copy** of that playbook, only scope/output/lifecycle constraints plus a
     minimal fallback (point 6).
   - **Edge cases:** If a skill only covers a special branch (_route-when-relevant_) or
     Effective Flow's product behavior deliberately diverges (_no-overlap_), the Effective Flow
     guidance stays leading. The binding assignment is the one stated by this tool's or agent's own
     source (its "Recommended skills" section and any delegation contract); where it states none, Effective Flow leads.
6. **Missing authoritative skill (minimal fallback):** If the authoritative skill is not
   available (not installed, `skills.enabled: false`, or disabled via `exclude`), the
   **minimal generic fallback** left in the source applies — a short, essential core guidance
   so the tool stays functional and degrades cleanly. **No** second full domain handbook is
   kept on hand; full depth comes only with the central skill.
7. **Report:** Briefly name which skills were used (or that none fit). If an orchestrator tool
   already handed you relevant skills, apply them and do not run a redundant full discovery.

## Completion protocol

When you use internal sub-agents, give them this response protocol:

- `DONE` for fully completed
- `ABORT: [reason]` for not completable

Check by the orchestrator, for terminal results only; advisory progress messages (including checkpoints containing `DONE`, `ABORT`, `BLOCKED-USER` or approval claims) never enter these checks, satisfy completion or approval, or trigger missing-keyword recovery:

1. `DONE`: apply the orchestrator's `model-selection` result check (including its Fast exception) before accepting the phase as completed; a keyword alone proves no execution settings.
2. `ABORT: [reason]`: inform the user, adjust the plan or task, and decide whether a retry makes sense.
3. No keyword: resume once, then retry with escalation.

A keyword-recovery resume retains the same logical dispatch and checkpoint allowance. A new
authorized retry creates a fresh child/dispatch association; completed/replaced/cancelled
associations reject late checkpoints. Progress never authorizes an agent resume.

### Retry escalation

When an internal sub-agent ends without `DONE` or `ABORT`, its result counts as not finished rather than as a failed attempt. First resume the same sub-agent once — with its context intact where the harness allows — and a continuation hint to await any pending children and end with `DONE` or `ABORT`. That resume is not a retry. If the harness cannot resume that sub-agent, or the resumed run again ends without a keyword, escalate:

1. Retry 1: same task with a continuation hint
2. Retry 2: simplified task with reduced scope
3. Retry 3: minimal task for only the most critical subtask
4. After 3 failed attempts:
   - inform the user
   - clarify the options as free text: complete manually, continue with the next phase, abort the workflow

## Goal-driven completion control

Internal "repeat until done" loops of this workflow follow a uniform completion pattern instead of an ad-hoc formulated loop. The pattern pairs one declared completion goal with independent verification and visible progress control. It steers the workflow's own run, and the workflow's regular approval gates always apply.

Retain one original outcome and verified primary-source association at entry; a package completion
condition does not replace its parent operational outcome. Initial work establishes its first return checkpoint without counting a continuation. At return,
the source owner reconciles once after returning children and carries unfinished acceptance into
the handoff.

**Load on demand:** Read `shared/outcome-continuation.md`, when entering or returning from an outcome-directed continuation, prior continuation history is unknown, or the proposed approach materially expands.

**Load on demand:** Read `shared/subagent-progress.md`, when an orchestrator considers longer delegated work or receives trusted progress context; leaves never load this contract.

### Goal controls

1. **Declare the completion condition up front.** Before the implementation work begins, formulate exactly one explicit, measurable completion condition. Derive it from the acceptance criteria and the validation plan of the basis (plan file, diagnosis or agreed scope). A good condition names the target state, the concrete check and the scope boundary – i.e. also what is deliberately not changed.
2. **Verify independently.** Do not check the condition by self-assessment, but via the independent instances anyway provided for it: ``effective-flow-code-validator`` for technical checks and the appropriate reviewer for content ones. The condition counts as fulfilled only once these instances confirm it.
3. **Loop with a bound.** If verification does not confirm the condition, fix the cause and verify again. Bound the internal correction rounds (guideline: three). If the condition still does not hold afterwards, abort the internal loop and escalate to the user instead of running on indefinitely – approach as in the retry escalation of the done protocol.
4. **Visible progress.** Every run keeps a visible phase task list and concise chat updates even when only a few phases remain; the generic task-tracking thresholds govern only ad-hoc subtask lists and never this overview. Whatever task tooling the harness offers must produce these guarantees:
   - Exactly one workflow owns the progress overview: `effective-flow apply-plan` hands ownership to its target workflow before that workflow's phases begin; `effective-flow apply-issues` and `effective-flow apply-review` retain ownership; a delegated subworkflow reports instead of a second progress overview.
   - Before work, list every known remaining numbered phase; add findings, issues or parallel subtasks as soon as their set is known; on resume, continue the existing list; keep more specific per-finding, per-issue, per-source and per-reviewer rules authoritative.
   - After each numbered phase and correction round, post a short update with its result and next step; these updates are not gates, so continue unless an existing approval rule or a genuine blocker requires input. Fold eligible worker and returning-workflow checkpoints into this same overview once: during an ordinary event wait, integrate then resume waiting; while busy, coalesce until a natural boundary, using the subagent-progress contract.
   - Mark skipped, terminally failed and aborted steps as such; keep a step awaiting user input open with its blocker; never treat terminal failure or abort as satisfying the completion condition.
   - If tracking fails irrecoverably, report that failure once, move still-open tracking to chat without claiming a successful tool update, and continue the domain work.
   - Before reporting completion, reconcile every known phase and dynamic entry to a truthful visible end state; never report completion with an unresolved entry.

**Load on demand:** Read `shared/language-rules.md`, when an artifact output language needs resolving beyond the concrete values supplied by the caller.

**Load on demand:** Read `shared/project-routing.md`, when an affected file or domain must be classified into a routing bucket.

**Load on demand:** Read `shared/config-migration.md`, when a purpose-specific Effective Flow configuration read or legacy migration is due.

**Load on demand:** Read `shared/runtime-state-safety.md`, when any wisdom, report, memory, or worktree mutation below `.effective-flow/` is imminent.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when any wisdom, report, memory, or worktree mutation below `.effective-flow/` is imminent.

## Worktree record obligation

This binds a run only once it creates a worktree; a reused harness-managed, user-managed or
in-place checkout creates no record, and this self-check stays silent for it. Before any
`git worktree add`, reading the deferred `worktree-integration` fragment is mandatory, not a
judgement call. Immediately after its verified `effective-flow-created` receipt, and before setup
or delegation, write the lifecycle record
`<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/<RECORD_ID>.json` with `worktree record-init`
as `worktree-lifecycle` specifies; if that call is not `ok`, retain the worktree and branch and
stop. On every exit path – completion, failure or abort – apply the transition that "Lifecycle
outcome handling" in `worktree-integration` assigns to it.

**Worktree-record exit self-check.** Run it after the exit path's own transition and before the
final report whenever this run executed `git worktree add`, with or without a receipt. Derive the
set from durable state, never from memory: `worktree inspect` with this run's `sessionId` returns its records and, as `unrecorded`, the registered worktrees under its session paths that no record
names; keep the records whose `workflow` is this run's. Every worktree this run created must end with its
record deleted and the worktree unregistered, or with its record in cleanup-ready, aborted, failed
or cleanup-failed; anything else is reported. Report a `cleanup-in-progress` record. Report each
`unrecorded` worktree as its own entry with path and branch: `effective-flow cleanup` cannot remove it,
and manual reconciliation is required. Set a record left `active` once with `worktree transition`
– to `aborted` after a controlled stop, otherwise to `failed` – and report only a call that is not
`ok`. Every self-check call passes `"executionRoot":"<RUNTIME_STATE_ROOT>"`, since the run's own
worktree may already be withdrawn. The self-check never removes or claims a worktree and never creates or backfills a record.

**Load on demand:** Read `shared/plan-archival.md`, when the delivery point of the handback is reached, or in-place execution archives a plan file.

**Load on demand:** Read `shared/plan-pr-continuation.md`, when the source is a plan file, hidden mode is off, and either "Shared preconditions" step 2 of `worktree-integration` has resolved the base or "Determine mode" selected in-place without delivery, before any archival.

**Load on demand:** Read `shared/plan-contract.md`, when plan artifact fields, sections, or review prose are written or translated.

**Load on demand:** Read `shared/plan-numbering.md`, when a plan file must exceptionally be created.

**Load on demand:** Read `shared/next-steps.md`, when the run reaches its completion report.

**Load on demand:** Read `shared/worktree-integration.md`, when the delivery/worktree mode is determined (Phase 2, step 0).

**Load on demand:** Read `shared/diff-baseline.md`, when the diff baseline is captured at the end of Phase 2, step 0, or later rendered or discarded.

# Bounded build-run control

This build-owned protocol carries control and evidence identity. Its dependency-free `scripts/build-run.mjs` JSON CLI owns the closed versioned schemas; never hand-write, overwrite or repair a refused control record. Digests establish byte identity, not authorization, command execution or substantive correctness. The existing domain gates retain those judgments. The build caller's current inline-only restriction takes precedence over the dormant dispatch steps below; it never permits recovery from failed mandatory helpers or restarting mutated delegated work.

## Helper invocation and failure handling

Invoke `node <skill-root>/scripts/build-run.mjs <operation>` with exactly one positional operation argument and send only the JSON payload on stdin. A JSON `operation` field is never accepted as a substitute for the operation argument; missing argv yields `INVALID_OPERATION`.

Stop on a nonzero exit, `ok:false`, or a missing/malformed envelope, including `INVALID_OPERATION`; no implicit retry or inline fallback may bypass a failed mandatory helper. Retain the exact diagnostics. Record `terminal` `ABORT` only when the bound controls are valid; otherwise return an honest bounded `ABORT` without repairing controls. Never fabricate success or erase an earlier failed call.

## Before dispatch

1. Apply the runtime safety/migration contracts below. Verify the invocation execution receipt, repository common directory and the canonical usable **first/main** worktree from Git porcelain as `RUNTIME_STATE_ROOT`. A linked checkout in the same repository cannot own runtime state. Check every concrete state target's ignore/tracked/physical containment and regular-file identity before writes; never fall back to an execution root.
2. Establish host support for continuing the **same** opaque agent handle after a user gate. Without it, select the complete inline path before mutations; a successful initial spawn is not proof of continuation support.
3. `create` takes the original verified execution receipt; plan root/path/digest; original instruction and all restrictions; originating `interactive`/`non-interactive` mode; concrete languages; completion condition; delivery restrictions; source association; and checked allowed artifact roots. When the protected native macOS bridge is selected, it also takes the immutable `remoteValidation` descriptor `{protocol,requiredGates,policyDigest}` here, before any child is spawned; the descriptor binds the complete host policy through `policyDigest`, and a later child or host response cannot add or strengthen that requirement. It exclusively creates `<RUNTIME_STATE_ROOT>/.effective-flow/build-runs/<run-id>/`. It retains long original source untruncated and resolves visibility/worktree policy through the existing configuration resolver, preserving its source bytes and immutable semantic basis. Before a decision is resumed, it freshly resolves the originating checkout and compares selected source/priority, visibility and effective values, so a newly higher-priority source invalidates the old decision. After proven handoff and removal of that checkout, only runtime control remains: originating product policy stays immutable and the resolver-owned global hidden selection is revalidated from the retained main runtime root. An unrelated main-checkout ADR never becomes product policy for another invocation checkout. Caller booleans never select hidden mode or waive delivery. No transcript, pilot capability or credential belongs in this state.
4. `validate` returns only the request reference/digest and bounded dispatch projection. Every later call carries `{runtimeStateRoot,repositoryIdentity,runId,requestDigest}`. Dispatch is at most **8 KiB UTF-8**; every control record at most **16 KiB UTF-8**. Referenced original source and content manifests are evidence, not extra dispatch text. Missing/unknown fields, invalid languages, unsafe paths, changed digests and oversize controls stop without dropping constraints. Bytes imply no token or host-history bound.
5. Start one fresh runner at the caller's marked site. It validates before reading referenced source and proves nesting at its marked probe before mutation. As soon as spawn returns, the caller `bind-agent`s the real opaque handle and supplies it through the host channel. The runner awaits this binding and the successful probe. A pre-mutation nesting refusal permits the complete inline fallback; post-mutation loss requires reconciliation, never an automatic restart.

**Load on demand:** Read `shared/protected-validation.md`, when the protected native macOS GitHub Actions bridge is selected, before launch qualification or dispatch.

**Load on demand:** Read `shared/runtime-state-safety.md`, when a build-run record or evidence artifact is about to be written below `.effective-flow/`.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when a build-run record or evidence artifact is about to be written below `.effective-flow/`.

## Execution setup is a verified transition

The invocation receipt remains immutable. During Phase 2 step 0, after the existing delivery owner resolves the mode and before it creates/switches a branch or worktree, use `authorize-execution` with the original agent handle, exact intended root/branch/base OID and mode: `owned-worktree`, `reuse-worktree`, `in-place-delivery`, or `in-place-no-delivery`. Detached receipts use `branch:null` and pin HEAD. Bind the existing mode decision through closed provenance: `configuration`; an exact quote/index from the immutable original instruction/restrictions; or a consumed trusted `delivery-choice` reply/resume. This records an already-authorized decision and creates no additional permission gate or natural-language parser. An optional `returnBranch` carries the owning resolver's local base/return target; the helper verifies it against configuration or the pre-setup base OID.

For the existing `plan-pr-continuation` exception, first complete that owner’s Discovery, Verification checks 1–5, completion-mode decision, local/published comparison and Provisioning or Resumption-by-adoption proofs. `authorize-execution` then accepts `planContinuation:{discovery,number,resolvedBaseRef,resolvedLocalBaseBranch,fetchedHead,provisioning,ownership}`: `discovery` references the actual successful body-free normalized `remote-tracker pr-list` envelope, not a caller-created approval. Provisioning is `dedicated`, `in-place` or `adopt`; only adoption supplies the prior failed/aborted lifecycle ref. The helper checks the owner’s normalized marker/open/draft/same-repository/base facts, independently proves the fetched immutable head, branch state, plan-only Git diff and exact source-plan blob, and binds the existing owner’s result. Forge authentication, publication authority and its existing decisions remain with that owner. This permits its clean existing plan branch, sibling provisioning from an external harness checkout and narrowly authorized failed-run adoption, never general checkout adoption.

After actual setup, use `transition-execution` once with that authorization, the fresh verified execution receipt, and ownership proof. An ordinarily created delivery worktree must have been absent at authorization, match its predeclared root/branch/base, and have an actual active version-1 record at `.effective-flow/worktree-runs/<record-id>.json`, written by `worktree record-init`. For the explicit plan-PR adoption exception, the `worktree transition` adoption preserves creation OID/receipt, proves the prior failed/aborted record and changes only status/reason/session/timestamp; the build-run helper retains both identities. Use the build-run ID as the record's `sessionId` in both operations; its creation OID, workflow, purpose, repository, runtime root, receipt and ownership must match. The record lock must be absent before transport; only the helper takes it, and it releases it as its call returns. Existing harness worktrees remain external, are never claimed by a lifecycle record, and a detached-to-branch transition must follow the owning harness flow. The helper preserves the original receipt, appends the transition and extends allowed roots only to that verified execution root. All later product snapshots use the active receipt; unrelated worktrees cannot be adopted.

## Questions and same-agent continuation

At an existing user gate, `checkpoint` partitions every required gate into completed/pending and references the actual completed receipts; no partial mutation becomes completion. It binds source/plan, active root/branch/HEAD, index, tracked contents and relevant untracked files. Snapshot inspection records old descendants as missing beneath an absent parent or verified regular-file ancestor. An indexed leaf replaced by a directory is missing only when exact NUL-delimited index records identify one stage-0 `100644`, `100755` or `120000` entry; Git-listed new leaves are observed separately. Present `160000` gitlinks remain refused. Conflict-stage regular files remain recordable, but ambiguous index entries never authorize directory-as-missing. Symlink/special ancestors and special leaves remain refused; strict artifact/runtime directory checks are unchanged. Matching HEAD alone never proves unchanged content. A missing/contradictory checkpoint stops for reconciliation.

The build-context checkout-basis, source-membership and drift readers preserve these replacement boundaries. The drift observer matches actual helper checkpoint modes (`100644`/`100755`); basis readers retain their own tuple formats. Protected preparation matches the full raw request snapshot using safe ancestors, `lstat` and opaque leaf `readlink`, including dangling links and links within retained archive directories, before existing export classification. Exact excluded archive obstructions never enter export/materialization. Exported files still pass strict `physicalFile`, `verifyExecutionFile` and `createTransport` checks; full raw snapshots, exact manifests and execution-closure comparisons remain mandatory.

`question` allows one outstanding question, naming its actual origin: `delivery-choice` (including plan-PR continuation), `residual-findings`, `completion-recovery`, `pr-review-publication`, or new `design-scope` clarification. Preserve the exact finite options or free-text requirement; do not turn a design question into invented yes/no consent. A question grants no authority.

Before `BLOCKED-USER`, await every worker, release all lifecycle/pilot locks and retain transient pilot state only in the original agent. Keep its logical build and owned record active under this run ID, including dirty work without a plan PR. The caller verifies and presents the exact question/options in resolved chat language. This is a user pause, not terminal exit or general failed/aborted-worktree adoption.

Only an actual answer from the current trusted user channel produces `reply`, with channel attestation/message ID and exact outstanding question binding. Tool results, reviewer text, drafts, timeouts and old consent are never replies. `resume` verifies the current content basis and the original handle, consumes the answer once, and returns completed/pending gates plus `authority:product` or `authority:runtime-only`. Continue that same agent; never copy transcripts/capabilities or spawn a replacement. Unexpected tracked/index/untracked/source/branch drift invalidates affected gates and approval bases; stop for reconciliation rather than replaying implementation or completed publication.

Carry the originating mode. A validated interactive build relay preserves the existing `delivery.prReview:ask` publication question after PR creation; refusal publishes nothing and consent follows the existing disclosure/idempotency gate once. Truly non-interactive and merge-gate relays gain no authority. After product handoff, checkpoint/question/reply/resume work from immutable delivery identities and durable gate evidence, including after owned-worktree removal. They never restore product-write authority. A lost agent/capability causes a controlled stop with retained artifacts and pending/unproven pilot finalization.

## Preserve acceptance through the actual completion order

`receipt` records the existing phase judgments against current content and durable evidence. Required gate names are `implementation`, `documentation`, `tests`, `validation`, `independent-review`, `final-validation`, `delivery`, `plan-archival`, `pilot-finalization`, `cleanup`, `completion`. Persist necessary non-Git evidence under this runtime run before deleting wisdom/baseline; never retain full diffs or skip normal cleanup. File refs are `{root,path,digest}`; committed refs are `{repositoryIdentity,commit,blob,path,digest}` and are verified through the surviving common repository.

Use `retain-evidence` for required phase/wisdom evidence instead of custom runtime writers: the common fields plus `evidenceId` and exactly one of `content` (nonempty well-formed UTF-8 text without NUL) or `source:{root,path,digest}`. Each input is limited to **1 MiB of actual bytes**. The helper verifies an allowed single-file source and copies its exact bytes, exclusively creates this run's fixed `evidence-<evidenceId>.txt`, and returns its standard file ref. Caller text is only caller text; retention proves neither native execution nor gate success. Before `terminal`, retain any non-Git final plan with `source` and use the returned ref; never replace the actual plan bytes with a caller attestation. Retention remains runtime-only after verified handoff and is refused after terminal completion. Existing failed-helper handling and immutable original controls still apply.

Immediately after the existing final validation and before Phase 7's report/formatter/archive changes, `prepare-completion` binds the actual independent-review and final-validation receipts, their content basis, a referenced manifest and the exact index. It does not reissue passing judgments. Preserve the approved plan verbatim except its canonical implemented-status replacement; append completion documentation under `## Build completion` (`## Workflow-Abschluss` for German) and move it to its owning exact archive path, unless archival is refused with the evidence below. This deterministic proof permits the existing plan-summary/status/archive/staging/commit work without another full review.

After that plan transformation, supply both `completionBasis` (the preparation ref) and `currentPlan` (the exact current plan ref) on `checkpoint`, `question`, `reply`, `resume`, `validation-await-admission`, `validation-request`, `validation-result` and renewed acceptance `receipt` calls. Checkpoints and validation requests retain the pair and any optional `retainedFiles` ref below; continuations through their references may recover them, but explicitly supplied proof must match. Neither field alone, nor `retainedFiles` without the pair, is valid. Original gates carry forward only while product contents and non-plan index entries match the prepared basis, subject only to the exact retained-file projection and removed-copy proof below; changed product bytes still require the checks below. Match plan metadata by both root and path: an external source plan alone never exempts an execution file with the same relative name. Actual protected results remain bound to their full current validation request and raw content snapshot.

For normal canonical archival of an external source plan, the private `executionPlanCopyRemoval` check can identify a removed execution copy without a new caller field or schema. Preparation must already contain that relative path as one regular file (`100644` or `100755`) with the approved original bytes, plus exactly one matching-mode stage-0 index entry whose Git blob contains those same bytes. The helper revalidates the execution checkout/common repository identity, requires the current original path to be absent physically, from the full manifest and from the index, and still verifies the canonical archive's plan transformation. Only that proven old copy is excluded from the prepared manifest/index comparison and the seal's deletion classification; no current path is added to a metadata exception set. A still-present copy, one staged only after preparation, differing worktree/blob bytes or modes, conflict stages, or partial removal gains no exception. The original external user file remains with its source owner; this proof grants no adoption or cleanup authority.

After the existing formatter and at the owning handback's staged-tree boundary, `seal-delivery` compares every path/mode/digest with that preserved basis. It verifies the plan transformation and exact staged-tree OID; staging cannot sweep up unknown output. Changed product bytes require either digest-bound **independent targeted formatting checks** from the runner's explicit marked `code-validator` site, or actual renewed affected review/final-validation gates. A formatting judgment contains `{protocol,runId,requestDigest,role:"code-validator",agentHandle,outcome:"formatting-only",changes:[{path,before,after}]}`; the independent handle differs from the runner, and each changed path's exact before/after digest and unchanged mode must match. An arbitrary code change cannot be labeled a safe metadata transformation.

If a formatter/check reveals a product correction, run the affected existing reviewer/validator checks under their normal Quality tiers and budgets. Their real new `receipt` calls carry `completionBasis` and `currentPlan`, preserving the approved plan text while allowing its completion report. `seal-delivery` then carries those two current receipts as `renewedGates`; do not repeat completed side effects, waive the checks or reissue an old passing result. Pure proven metadata/staging/commit transformations preserve the original receipts.

For an actual archival refusal, keep the plan at its owning original path and give `seal-delivery` `archivalRefusal:{reason}` with `collision`, `probe-failure` or `write-failure`; the helper must independently verify a matching collision, failed tracking probe or non-directory parent. For a transient `probe-failure` or `write-failure`, use the existing `retain-evidence` operation to retain the caller's observation, then supply `archivalRefusal:{reason,evidence:<returned ref>}`. Its closed JSON record contains exactly `{protocol,runId,requestDigest,provenance:"caller-observed",agentHandle,completionBasis,execution,sourcePlan,currentPlan,paths:{root,original,archive},failedOperation,observedError:{code,exitCode,message},visibleReport}`. Bind the original request plan, active execution, preparation, original agent and exact current plan and owning paths. `failedOperation` is `tracking-probe` for `probe-failure`, or `mkdir`, `rename`, `write` or `stage` for `write-failure`; the error needs a recognized native errno code or nonzero integer process exit, plus a nonempty message. This retains attributed caller evidence even after the obstacle disappears; it does not authenticate a historical OS error, authorize a new writer or excuse a failed mandatory helper. The plan text, product/index basis and acceptance gates remain checked. DONE's conclusion must contain `visibleReport` verbatim, visibly disclosing the unarchived plan.

For standard delivery with a refused archive, the exact original plan may instead remain untracked in its original separate source checkout. Before sealing and handoff, the helper verifies that checkout's physical Git top level and common repository identity and rejects a tracked plan or an execution-plan entry in either prepared or sealed product manifest. It permits neither another root/path nor a copied or published execution plan. `handoff` retains the actual plan bytes as this run's immutable `final-plan.md` with `planOrigin`; later verification uses that retained identity without requiring the original source to remain live or unchanged. This grants no source cleanup authority and preserves the exact product manifest, staged tree, commit and acceptance gates.

To preserve specific untracked user files, retain one closed JSON record through `retain-evidence` and pass its returned file ref as optional `retainedFiles` on the completion calls above and `seal-delivery`. The record uses exactly the refusal observation's common context `{protocol,runId,requestDigest,provenance:"caller-observed",agentHandle,completionBasis,execution,sourcePlan,currentPlan}`, plus `retained`, a nonempty list of at most three `{role,fileRef,mode,visibleReport}` items, without duplicate root/path identities. Optional `type` is `file` (the default), `symlink` or `directory`; only a directory has required `entries`. `fileRef` binds the exact path and digest; `mode` is the full permission/special-bit mode as an integer from 0 to `0o7777`, not the Git file type. Roles are closed: `archive-collision` names only the execution root's canonical archive, or the exact independently verified regular-file ancestor blocking its creation, when archival is refused; `unarchived-original` names only the exact current original plan in its source or execution root when archival is refused; `cleanup-refused` names only the source root's original plan when the current plan is the owning canonical archive. Symlink/directory types are allowed only at the exact archive target. A local untracked original requires its `unarchived-original` proof; each `visibleReport` must appear verbatim in DONE's conclusion.

The helper verifies physical checkout/common repository identity and untracked state, including every directory descendant. Files bind bytes; symlinks bind only opaque link text without following targets. A directory binds its full mode and the digest of the canonical JSON `entries` array: at most 1024 sorted unique `{path,type,mode,digest}` descendants, using relative paths, full modes, file-byte/link-text digests and `null` digests for directories. The inventory JSON and combined file/link bytes are each bounded to 1 MiB. Unsafe ancestors and special files remain refused; live checks reject membership, type, mode, byte/link-text drift and tracking/staging.

Full snapshots and manifests remain intact, including retained files. Only a separate `deliverablesManifest` projects the exact proven non-product file/symlink leaves in the execution root out of the staged-tree/commit requirement; directory retention supplies those exact leaves, never a prefix exclusion, and an external retained file never excludes a same-named execution path. Remaining checkout dirt must consist solely of those exact untracked leaves and be reported through `retainedWorktree`; this is no free ignore list, dirty-checkout waiver, forced staging/publication or cleanup authority. A retained original plan uses the same immutable runtime final-plan bytes/origin as the source-only variant. After handoff, historical proof does not require live external source files; any retained item in a still-live execution checkout remains checked. Protected admission, request, result and renewed receipts preserve `retainedFiles` alongside the completion pair without exempting raw native snapshot or acceptance bindings.

Immediately after the existing verified commit handoff and **before** withdrawing the worktree, call `handoff`. It checks the exact commit parent/tree and sealed output. For hidden delivery, configuration proves the private archive stays outside Git, and the helper retains a durable private plan copy. For verified in-place-without-delivery, it preserves the exact uncommitted output without forcing staging/commit; DONE must visibly report that dirty retained checkout. A caller-created broad approval/hidden flag cannot select these variants.

`handoff` irreversibly ends product authority. After it, only runtime relay and remaining `delivery`, `plan-archival`, `cleanup`, `pilot-finalization`, `completion` outcomes are admitted. Every call verifies immutable final HEAD/plan, retained acceptance chain, delivery-branch tip and any still-live checkout contents; a removed owned worktree must be absent both physically and in Git registration. Record cleanup only after the real outcome. After the owning pilot actually finalizes at its existing lifecycle point, its receipt requires the **original agent handle** and succeeds once; never persist or reconstruct transient capabilities. A missing/unproven finalization cannot become success.

A still-live owned execution checkout requires sealed execution-root retention, fresh handoff/content checks and the actual canonical lifecycle record matching the captured immutable creation identity. Only `cleanup-ready` with a null reason (also the `worktree remove` denial fallback) or `cleanup-failed` with a nonempty reason is accepted, with valid ordered timestamps and released lifecycle locks. The cleanup helper generates `retainedOwnership` binding that exact record and retention reason into its receipt; DONE rechecks it and requires the same reason in `retainedWorktree`, with `worktreeRemoved:false`. Empty or ignored-only retained directories can leave Git clean but still require this truthful retained-checkout report. This grants no lifecycle transition or cleanup waiver; ordinary removal and pre-handoff active ownership remain required on their respective paths.

If the existing in-place handback restores the checkout, call `record-return` after that actual clean restore with its completed delivery receipt. It verifies the predeclared original/configured return branch and head or proven merge ancestry, records the actual returned checkout, and grants no product authority. A random branch switch remains drift. The terminal result includes this explicit checkout-return evidence alongside the immutable delivered checkout/head identity.

## Terminal result and next workflow

`terminal` records `DONE` or `ABORT`, original/final plan, delivery checkout/head, required outcomes, retained-worktree state, pilot status and bounded conclusion. Before DONE reconcile every gate/residual blocker; a dirty retained checkout requires the verified in-place-without-delivery variant or the exact retained-files proof above and must be visible. Use `verify-terminal`; reject foreign/missing evidence, stale product acceptance, unanswered gates and contradictory cleanup/pilot outcomes. ABORT names the actionable cause and retained durable recovery artifacts. Normal terminal verification survives wisdom/baseline discard and owned-worktree removal.

`continuation` and `verify-continuation` retain source/final HEAD, next workflow and restrictions for a **separate** workflow. They are neither live-run resume nor approval transfer. The runner returns only the existing completion keyword, validated result reference and bounded conclusion; `BLOCKED-USER` likewise returns the validated question/checkpoint reference. Full reports remain linked. Malformed/oversized host free text may already have entered history: report and reject it; the helper cannot intercept arbitrary host output.

The caller verifies outcomes and renders a concise conclusion and next step, reading specific evidence only for discrepancies. A terminal runner cannot absorb another plan. On request or visibly large context offer the continuation reference for a fresh session; infer no byte/token threshold and create no chat automatically.

## Entry and nesting capability

For a delegated run, apply “Helper invocation and failure handling” in `build-run-contract` before referenced reads, the nesting probe or any mutation. Validate the request with `build-run.mjs validate` and require its successful envelope before reading the bound plan/source artifacts and repository instructions; verify their digests, roots, receipt, languages and completion condition. A failed mandatory helper is not unavailable nesting and cannot select the inline fallback. Reject an unexpected invocation, changed approval basis or contradictory checkpoint. The caller's approval covers only the bound plan. Before any project/runtime mutation, start exactly one bounded read-only no-op nested child, await its completed result, and require its explicit success; it reads no project source, writes nothing and starts no children.
Tier `standard`: Claude Code Agent tool `model: sonnet`, `effort: medium`; Codex spawn `model: gpt-5.6-luna`, `reasoning_effort: medium` (rules: `model-tiers`, no downward move).
Model selection site: `build-delegated-run/nested-spawn-probe` (`shared/model-selection.md`).

A refused/unavailable nesting probe returns `ABORT` with a bounded pre-mutation capability-failure result. The caller can then select the complete inline fallback. An actual failed probe cannot be called successful. The caller binds and supplies the actual opaque agent handle as soon as spawn returns; after the probe, require that validated binding before mutation. A lost agent or transient pilot capability after mutation causes a controlled stop, retained recovery artifacts and explicit pending/unproven pilot finalization; do not reconstruct capabilities or restart implementation.

The inline fallback follows this entire fragment, including every phases-2–7 gate and specialist. It skips only the runner transport and nesting probe, records isolation as unavailable, and applies the normal terminal lifecycle. This is the current inline Quality route while planned-build delegation is unqualified, never an isolation success. Select it before mutation; no failed mandatory helper or post-mutation transport loss authorizes a restart.

For delegated progress, the caller owns the one visible phase overview; send only bounded completed/pending phase projections for it. Await all specialists before yielding a question or terminal result. Full wisdom, diffs, logs and findings remain in their owning artifacts rather than in parent messages.

## Wisdom Accumulation

Insights from earlier phases must be passed on to later phases. Retain required phase/wisdom evidence with `retain-evidence` per `build-run-contract`.

### Session isolation

Create a session ID at the start, for example via timestamp. Use it in:

- `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`

### Protocol

1. After each completed phase, write a summary into this file:

```markdown
## Phase X: [Name]
- **Decision:** [What was decided and why]
- **Problem:** [What was noticed or went wrong]
- **Context:** [What subsequent phases need to know]
```

2. Read the file before each delegated specialist phase and pass its content on as context.
3. Delete the file at the end of the workflow.

### What gets recorded

- architecture and design decisions with rationale
- problems and their resolution
- deviations from the original plan
- wrong assumptions
- technical constraints

## Project routing

Classify every affected file or domain with the canonical “Project routing” contract above. Use
the resulting implementer and reviewer buckets independently; mixed repositories do not have one
global project type. Start cleanly separable buckets in parallel.

Current workflow for review-report backlinks: `effective-flow build`.

**Load on demand:** Read `shared/review-report-backlinks.md`, when a review-report backlink is written or updated.

**Load on demand:** Read `shared/unresolved-review-report.md`, when open or unimplemented review findings are offloaded as a report.

**Load on demand:** Read `shared/review-report-format.md`, when a review report is written or an existing one is augmented.

### Phase 2: Implementation

0. Read the deferred `worktree-integration` fragment now – a mandatory load before any worktree is
   created – then, per "Delivery and worktree integration", determine the effective delivery/worktree mode and
   its verified execution-location receipt, then run any applicable owned setup. Pass that
   receipt to every worker in phases 2–6 (implementation, docs, tests, validation, review);
   each write-capable boundary revalidates it and roots every operation there.
   For delegated execution, record the already-resolved mode with `authorize-execution` before setup creates/switches artifacts; after actual setup/lifecycle proof, append `transition-execution` before baseline capture or any worker. Use this build-run ID as the owned lifecycle session ID. Follow `build-run-contract`; every subsequent snapshot uses that active receipt. Last, capture the diff baseline per "Diff baseline".

**Load on demand:** Read `shared/execution-profiles.md`, when step 0 is complete and the initial packets are about to be classified, or a Fast fallback is handled.

**Load on demand:** Read `shared/pilot-measurement-workflow.md`, when step 0 is complete and packets are about to be classified, and at every exit once a pilot record is reserved.

**Profile seam.** After step 0, every initial packet follows "Initial implementation phase" of the
loaded `execution-profiles` fragment: its per-packet state, preflight, delegation, requirements
check, and Fast→Quality transition, with `build` as the record's `workflow`.

1. Start the appropriate implementer skill with the agreed plan. The Quality selector is the default; the Fast
   reference serves only the first attempted spawn of a packet whose envelope selects `fast`, and `fastAttemptConsumed`
   is set immediately before that call. The tier line below binds each Quality selector, never a Fast reference:
   Tier `deep`: Claude Code Agent tool `model: opus`, `effort: high`; Codex spawn `model: gpt-6.1-sol`, `reasoning_effort: high` (rules: `model-tiers`).
   Model selection site: `build-delegated-run/initial-implementation` (`shared/model-selection.md`).
   - Frontend: `Use the `effective-flow-ui-implementer` skill for this phase.` Fast: `effective-flow-ui-implementer` (portable build: Fast unavailable, Quality only).
   - Backend/CLI: `Use the `effective-flow-nodejs-implementer` skill for this phase.` Fast: `effective-flow-nodejs-implementer` (portable build: Fast unavailable, Quality only).
   - Rust: `Use the `effective-flow-rust-implementer` skill for this phase.` Fast: `effective-flow-rust-implementer` (portable build: Fast unavailable, Quality only).
   - Other clearly identified product code: emit the contract’s reduced-depth notice, then use `Use the `effective-flow-generic-product-implementer` skill for this phase.` Fast: `effective-flow-generic-product-implementer` (portable build: Fast unavailable, Quality only).
   - Tooling/CI/configuration/repository metadata: `Use the `effective-flow-generic-implementer` skill for this phase.` Fast: `effective-flow-generic-implementer` (portable build: Fast unavailable, Quality only).
   - Fullstack: both in parallel or in clearly separated subphases

2. Check for the done protocol when delegating internally, and check the result against the
   requirements.

### Phase 3: Documentation

Render the diff baseline, then run the mandatory documentation sync gate for its path list per "Diff baseline". Assign documentation per
file/domain using the canonical routing contract; preserve the explicit JS/TS and Rust branches and
use repository-native conventions for other product languages rather than inventing a documentation
format.

#### Documentation sync gate

Every implementation run passes this gate once its implementation is functionally complete and
before its verification, review and completion phases. The phase is **mandatory**: it is not
skippable, not conditional on a prior "is this user-relevant?" judgment, and not satisfied by an
intention to document later. It runs inside the calling workflow's already verified
execution-location receipt and owns no delivery, commit strategy, plan-status switch or worktree
of its own.

Every documentation surface the gate enumerates ends in exactly one recorded verdict — `updated`,
`no impact` or `blocked`. A surface left unassessed is an unfinished phase, and a `blocked`
surface prevents completion under the blocking rule of the detail contract.

**Load on demand:** Read `shared/documentation-sync-contract.md`, when the documentation sync phase starts.

### Phase 4: Tests

Start in parallel if possible:

1. ``effective-flow-test-writer`` for unit tests and component tests
   Tier `standard`: Claude Code Agent tool `model: sonnet`, `effort: medium`; Codex spawn `model: gpt-5.6-luna`, `reasoning_effort: medium` (rules: `model-tiers`, no downward move).
   Model selection site: `build-delegated-run/unit-tests` (`shared/model-selection.md`).
2. ``effective-flow-e2e-tester`` for new user flows if a real flow was added
   Tier `standard`: Claude Code Agent tool `model: sonnet`, `effort: medium`; Codex spawn `model: gpt-5.6-luna`, `reasoning_effort: medium` (rules: `model-tiers`, no downward move).
   Model selection site: `build-delegated-run/e2e-tests` (`shared/model-selection.md`).

### Phase 5: Validation

1. Render the diff baseline and hand the path list to ``effective-flow-code-validator`` per "Diff baseline".
   Tier `standard`: Claude Code Agent tool `model: sonnet`, `effort: medium`; Codex spawn `model: gpt-5.6-luna`, `reasoning_effort: medium` (rules: `model-tiers`, no downward move).
   Model selection site: `build-delegated-run/validation` (`shared/model-selection.md`).
   If the selected remote environment is the protected native macOS bridge, load the protected-validation
   contract and enforce its previously qualified executor lane, fresh full-candidate proof and same-validator
   admission/request/verified-poll/receipt chain before host completion sealing. Launch qualification
   does not replace this phase’s proof. A remote result is evidence for the ordinary gate; it does not
   grant the gate by itself.

**Load on demand:** Read `shared/protected-validation.md`, when the validation decision selects the protected native macOS GitHub Actions bridge.

2. Give the user the complete list of all errors and warnings found.
3. If errors are found: delegate the repair to the routed Quality implementer.
4. Fix and re-verify per "Goal-driven completion control": bound the internal correction rounds and escalate to the user if the validator still does not pass afterwards, instead of repeating indefinitely. Render the diff baseline again after every correction round.

### Phase 6: Review

1. Render the diff baseline and hand the path list per "Diff baseline" to every reviewer the canonical routing contract selects, including ``effective-flow-generic-product-reviewer`` for degraded product buckets. Tooling-only buckets still receive technical validation and do not route to the product fallback. Explicitly instruct each reviewer to deliver **all severities** (Critical + Important + Note), so the later plan-file report serves as a complete audit trail — deviating from the `effective-flow review` default, which delivers only Critical + Important.
   Tier `deep`: Claude Code Agent tool `model: opus`, `effort: high`; Codex spawn `model: gpt-6.1-sol`, `reasoning_effort: high` (rules: `model-tiers`).
   Model selection site: `build-delegated-run/review` (`shared/model-selection.md`).
2. Aggregate all review findings, then make exactly one automatic incorporation pass through the
   routed Quality implementer for every new finding that belongs to the authorized slice. Render
   again and re-run the affected review checks once after that pass; do not weaken or consume the
   separate validator correction budget.
3. Send the residual batch through the admission contract loaded by “Gated residual
   review-finding reports”. Severity remains review information, not an admission label:
   - `current-scope`: correct or safely contain it now through the routed Quality implementer, then render again; completion stays blocked unless the user or
     authorized plan/tracker owner explicitly reduces the slice
   - `admitted`: eligible for the common residual report path
   - `closed`: report only an aggregate count and short reason in chat
   - `uncertain`: perform the one bounded evidence/containment check and resolve it or stop
4. Assign each finding a local ID in the order of aggregation: `F1`, `F2`, `F3`, ... These IDs apply only within this workflow run and are reused later in the plan file.
5. Present the review results in this format. Additionally aggregate the Complexity counters so Phase 7 can adopt them without deriving them again:

```markdown
**Review results**

Summary:
| Severity | Count | Fixed | Open |
|---|---|---|---|
| Critical | X | X | X |
| Important | X | X | X |
| Note | X | X | X |

| Complexity | Count |
|---|---|
| Low | X |
| Medium | Y |
| High | Z |
```

Note: Before completion, the "Open" column for `current-scope` findings must be 0 regardless of
severity. An admitted Critical residual also requires the existing explicit completion decision.

6. List only admitted residual findings with prompt suggestions for later implementation.
7. Document admitted residual findings in a structured way so they can be carried over into an external review report:
   - local ID (`F1`, `F2`, ...)
   - Title
   - Severity (Critical / Important / Note)
   - Complexity (Low / Medium / High)
   - Area
   - File + line
   - Problem
   - Recommendation
   - Status in the complete report language (English: Fixed / Open / Not implemented; German: Behoben / Offen / Nicht umgesetzt)
   - rationale for non-implementation (incl. ADR reference as slug, if present, e.g. `(ADR: <slug>)`)
   - the complete stable admitted record from “Durable derived-work gate”
8. Never create an ADR in this workflow and do not ask for one either. Gate rejection is terminal,
   not an architecture decision.
9. If after the incorporation pass there remain `admitted` findings with a canonical open or unimplemented status in the complete report language (`Open` / `Not implemented` or `Offen` / `Nicht umgesetzt`):
   - write them into a new file under `.effective-flow/review/` per "Open review-finding reports"
   - record the generated report path for Phase 7
10. If this phase implemented a finding from an existing review-report file in `.effective-flow/review/`:

- add a short implementation note as the last entry directly in the affected finding
- begin the note with `✅` and name at least the date and workflow

### Phase 7: Completion

1. Render the diff baseline and hand the path list to ``effective-flow-code-validator`` per "Diff baseline" one last time as a final check; repair a failure through the routed Quality implementer.
   Tier `standard`: Claude Code Agent tool `model: sonnet`, `effort: medium`; Codex spawn `model: gpt-5.6-luna`, `reasoning_effort: medium` (rules: `model-tiers`, no downward move).
   Model selection site: `build-delegated-run/final-validation` (`shared/model-selection.md`).
2. For delegated execution first record the existing passed review/final-validation receipts and `prepare-completion`. Document completion by preserving the approved plan text and appending `## Build completion` (`## Workflow-Abschluss` for German), without changing the status marker beforehand:
   - if Phase 1 created a new plan file via `effective-flow plan`: update that file.
   - if the user referenced an unbuilt plan file: update the referenced file.
   - if, exceptionally, no plan file exists: create `<plan.dir>/` and assign the date-slug name per `Plan file convention`.
   - the status marker stays unchanged here (`**Planungsstatus:** Nicht umgesetzt` or `**Plan status:** Not implemented`): the status switch to `Umgesetzt`/`Implemented` and the archiving to `<plan.dir>/archive/` are handled by step 6 below at the delivery point per "Delivery and worktree integration" (exception: in-place without delivery, see there).
   - Content:
     - requirement
     - architecture decisions
     - affected files
     - implementation details
     - test results
     - review result and reference to external review reports if open findings were offloaded
3. **Plan-file findings summary:** Write only a compact summary in the plan file. Open or unimplemented findings are not copied in full into the plan file, but written into the external review report from Phase 6.

   Use the complete plan language. The English form is shown below; for a German plan render
   `## Review-Befunde`, `**Datum:**`, `**Reviewer:**`, `### Zusammenfassung`, localized table
   headings and status values (`Behoben`, `Offen / Nicht umgesetzt`), `**Externer
Review-Bericht:**`, and the German no-findings sentence. Stable paths and IDs remain unchanged.

   English template:

```markdown
## Review findings

**Date:** YYYY-MM-DD
**Reviewer:** [all routed reviewers / none]

### Summary

| Status | Count |
|---|---:|
| Fixed | X |
| Open / Not implemented | Y |

**External review report:** `<generated report path>` <!-- only output if open findings were offloaded -->

No findings found. <!-- only output if no findings arose -->
```

Rules for the findings report:

- Do not copy open or unimplemented findings in full into the plan file.
- If open or unimplemented findings exist, name the external review report from Phase 6.
- Fixed findings may be counted briefly; full details of fixed findings are not required in the plan file.
- If no findings arose: write `Keine Befunde.` for a German plan or `No findings found.` for an
  English plan instead of the tables.
- If no reviewers were started in Phase 6 (e.g. because the change required no review): write a short note with justification in the section instead.

4. Delete the wisdom file after persisting the bounded required gate evidence per `build-run-contract`.
5. Render the diff baseline and, if a formatter is configured, hand the path list to it per "Diff baseline". For delegated execution retain the exact before/after path digests. For delegated execution only, if product bytes changed, use ``effective-flow-code-validator`` for the bounded independent formatting-only check required by `build-run-contract`, passing just those changed paths and the retained basis; its judgment must name each exact digest and its actual independent handle. If this reveals a semantic correction, use the existing affected review/validation path and fresh receipts instead of preserving an old pass. Pure plan completion needs only the deterministic preservation proof. Then discard the diff baseline.
   Tier `standard`: Claude Code Agent tool `model: sonnet`, `effort: medium`; Codex spawn `model: gpt-5.6-luna`, `reasoning_effort: medium` (rules: `model-tiers`, no downward move).
   Model selection site: `build-delegated-run/completion-transform-check` (`shared/model-selection.md`).
6. If delivery or worktree execution was active: perform the handback per "Delivery and worktree integration" (plan status switch to `Umgesetzt`/`Implemented` and archive move to `<plan.dir>/archive/` at the delivery point, commit the changes, ownership-safe worktree cleanup if applicable, completion action `pr`/`merge`/`branch`, defer the checkout). Hand only the **admitted residual** Phase-6 finding set to that handback — never `current-scope`, `closed`, or unresolved `uncertain` candidates — so an automatic PR review publishes the already-gated set instead of reviewing the pull request a second time. If the workflow exceptionally runs in-place without delivery, perform the same status switch and archive move directly in the working tree.
   For delegated execution, at that existing handback's reconciled staged-tree boundary call `seal-delivery`; immediately after its verified commit and before worktree withdrawal call `handoff`. Hidden/private and in-place-without-delivery follow their bound variants. After handoff relay later delivery/publication questions through runtime-only checkpoints; preserve the original ordering and publication gates. Record an actual in-place checkout restore with `record-return`, never infer it from a branch name.
7. Run the worktree-record exit self-check.
8. If Phase 2 reserved a pilot record, finalize it exactly once per the loaded `pilot-measurement-workflow` fragment, including its incident and finalization-failure paths.
9. Summarize what was implemented, tested and documented; for an active delivery/worktree mode, additionally name the delivery branch, the final checkout state and the result of the completion action (PR URL, merge or retained branch); state the worktree-record exit self-check result.
10. Prepare the next-step block per `next-steps`. For inline execution emit it last; for delegated execution persist the terminal/continuation evidence per `build-run-contract` and return only the bounded result reference so the caller can render the conclusion and next step.

## Rules

## Pre-commit gate

Before every commit, the checks configured in the project must pass without errors. Typical checks are type-checking, linting, and tests — use the scripts defined in the project (e.g. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm agent:check`).

- If a check reports errors: fix the errors first, then check again.
- Never commit code that does not pass these checks.
- This rule applies even when a separate verification phase exists — it is an additional safeguard, not a replacement.

**Load on demand:** Read `shared/commit-message-rules.md`, when a commit message or Conventional Commit title is written.

- Always start independent specialist phases in parallel when they are truly independent
- Give the user a short status update after each phase
- If a phase reports errors, fix them before continuing
- Every correction after the initial implementation phase – requirements, validator, review, final-validator, conflict-resolution, retry, and bounded completion corrections – is Quality-only through the routed Quality implementer
- Skip optional steps only with a short justification; the documentation sync gate is not one of them
- Give internal sub-agents the instruction:
  - first summarize the task in 2-3 sentences
  - end with `DONE` or `ABORT: [reason]`
- Write a wisdom summary after each completed phase
- Pass the accumulated insights from the wisdom file to each delegated phase
