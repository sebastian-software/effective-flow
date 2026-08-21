## Portable worker delegation

Names matching `effective-flow-<worker>` in this instruction identify bundled worker contracts, not installed custom-agent roles. When a worker is selected, read only its matching `workers/effective-flow-<worker>.md` file, then delegate through the host harness's built-in general-purpose subagent mechanism with that contract as the worker instructions. Do not request a custom role by the contract name. If built-in subagent delegation is unavailable, stop with a clear explanation; never claim that an undiscoverable worker ran.

# Effective Flow Fix

You are the orchestrator for the bugfix workflow.

## Goal

This workflow is optimized for finding and fixing defects, without unnecessary planning or documentation phases.

**Load on demand:** Read `shared/language-rules.md`, when an artifact output language or delegated language context must be resolved.

## Task tracking

When there are several tasks to complete, use an available TODO or task-tracking tool (e.g. `TaskCreate`/`TaskUpdate`, `TodoWrite`, or a comparable tool) to create a task list. Set each task to "in progress" before starting it and to "done" after completing it.

If no task tool is available, give the user a short progress update after each completed step instead.

### When to use

- with three or more subtasks or steps
- with complex tasks that have multiple phases
- when the user names several tasks at once

### When not to use

- with a single, trivial task
- when the task is done in fewer than three simple steps

## Delegation mandate

Invoking an Effective Flow tool **is** the user's standing request for internal delegation through an available sub-agent mechanism (e.g. an `Agent`/`Task` tool, a bundled worker contract, or a comparable mechanism). A host default that discourages unrequested sub-agents does not apply inside a tool run.

- Where the workflow names a worker role, delegating to it is **mandatory**, not a judgment call.
- For analysis, exploration, and research, delegation is the **default**. Work inline only under this **triviality exception**: a single known file, one lookup, or a step whose whole cost is smaller than briefing a worker. Sites that name this exception mean exactly this definition.
- A worker that **has** a sub-agent tool may fan out **read-only** analysis sub-agents and passes its supplied language context to them. It never re-delegates its own assignment, never delegates a write, and never selects or sequences another worker role; that stays with the orchestrator. A worker whose tool list carries no sub-agent tool does not delegate at all — that limit rests on the tool list, not on prose.
- If the harness offers no such mechanism, or a delegation is declined at runtime, work inline and say so in one visible line — never silently.
- This mandate covers worker roles and analysis fan-out only. Delegation from one workflow to another keeps that tool's own mechanics, including its interactive/gated path.

**Load on demand:** Read `shared/plan-archival.md`, when the delivery point of the handback is reached, or in-place execution archives a plan file.

**Load on demand:** Read `shared/runtime-state-safety.md`, when any wisdom, report, backlink, or worktree mutation below `.effective-flow/` is imminent.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when any wisdom, report, backlink, or worktree mutation below `.effective-flow/` is imminent.

**Load on demand:** Read `shared/project-routing.md`, when an affected file or domain must be classified into a routing bucket.

**Load on demand:** Read `shared/config-migration.md`, when the Effective Flow configuration is first read or a legacy config is migrated.

**Load on demand:** Read `shared/session-rename.md`, when the run's subject is fixed and a session title is about to be applied or emitted.

## Plan status convention

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default
`docs/plan`).

Plan files in `<plan.dir>/` use exactly one canonical status marker in their header. The marker may be written in either German or English:

- open (German): `**Planungsstatus:** Nicht umgesetzt`
- completed (German): `**Planungsstatus:** Umgesetzt`
- open (English): `**Plan status:** Not implemented`
- completed (English): `**Plan status:** Implemented`

Both marker forms are equivalent. Only one language is used per plan file. The marker is not an
independent language choice: it is part of the complete plan language resolved by "Language
resolution" (`language.workflow` for a new plan, or the preserved language of an existing plan).

The complete bilingual field and section mapping lives in `plan-contract`; a workflow that writes
or translates a plan artifact loads it, a workflow that only recognizes the status does not.

Rules:

- The status marker must be written exactly as in the four canonical examples above, including bold, colon, and the capitalization of the marker keys and values.
- The plan status only applies when exactly one line with the prefix `**Planungsstatus:**` or `**Plan status:**` is present. Multiple status lines (even in different languages) make the plan status unclear (see below) and should be corrected.
- The only valid value pairs are the four key-value combinations listed above. Mixed forms of a German key and an English value or vice versa (e.g. `**Plan status:** Umgesetzt`) are **not** considered valid.
- Other values such as `Open`/`Done`, `Pending`/`Complete`, or arbitrary free text do not count either.
- Other occurrences of „Nicht umgesetzt“, „Umgesetzt“, "Not implemented", or "Implemented" in review findings, ADR rationales, or body text do not count as a plan status.
- If the marker is missing, occurs multiple times, contains an invalid value, or uses a mixed form of key and value language, the plan status is unclear. In that case, do not automatically treat the plan as open or completed.
- When a workflow sets the status to completed, the complete plan language is preserved: a German marker becomes `**Planungsstatus:** Umgesetzt`, an English marker becomes `**Plan status:** Implemented`.

**Load on demand:** Read `shared/plan-contract.md`, when a plan artifact's fields, sections, or review prose are written or translated.

## Recommended skills

- `effective-delivery`

## Project conventions

If the project has an `AGENTS.md`, read it before investigation and fix and follow its guidance for analysis, implementation, tests, validation and commits.

## Completion protocol

When you use internal sub-agents, give them this response protocol:

- `DONE` for fully completed
- `ABORT: [reason]` for not completable

Check by the orchestrator:

1. `DONE`: phase completed.
2. `ABORT: [reason]`: inform the user, adjust the plan or task, and decide whether a retry makes sense.
3. No keyword: retry with escalation.

### Retry escalation

When an internal sub-agent ends without `DONE` or `ABORT`:

1. Retry 1: same task with a continuation hint
2. Retry 2: simplified task with reduced scope
3. Retry 3: minimal task for only the most critical subtask
4. After 3 failed attempts:
   - inform the user
   - clarify the options as free text: complete manually, continue with the next phase, abort the workflow

## Goal-driven completion control

Internal "repeat until done" loops of this workflow follow a uniform completion pattern instead of an ad-hoc formulated loop. The pattern pairs one declared completion goal with independent verification and visible progress control. It steers the workflow's own run; Effective Flow neither offers nor starts a harness-native autonomous run for it, and the workflow's regular approval gates always apply.

### Goal controls

1. **Declare the completion condition up front.** Before the implementation work begins, formulate exactly one explicit, measurable completion condition. Derive it from the acceptance criteria and the validation plan of the basis (plan file, diagnosis or agreed scope). A good condition names the target state, the concrete check and the scope boundary – i.e. also what is deliberately not changed.
2. **Verify independently.** Do not check the condition by self-assessment, but via the independent instances anyway provided for it: ``effective-flow-code-validator`` for technical checks and the appropriate reviewer for content ones. The condition counts as fulfilled only once these instances confirm it.
3. **Loop with a bound.** If verification does not confirm the condition, fix the cause and verify again. Bound the internal correction rounds (guideline: three). If the condition still does not hold afterwards, abort the internal loop and escalate to the user instead of running on indefinitely – approach as in the retry escalation of the done protocol.
4. **Visible progress.** Every run maintains a visible phase task list and concise chat updates even when only a few phases remain. This overview is required regardless of the generic task-tracking thresholds, which keep governing only ad-hoc subtask lists: before work, create or reconcile every known remaining numbered phase in stable order; mark each phase when it starts and reaches an end state; add findings, issues or parallel subtasks as soon as their set is known, without matching duplicates; on resume, continue the existing list; and keep more specific per-finding, per-issue, per-source and per-reviewer detail rules authoritative. Exactly one workflow owns the progress overview on the shared interaction surface: the orchestrator responsible for the remaining scope; `effective-flow apply-plan` hands ownership to its selected target workflow before that workflow’s remaining phases begin and opens no competing list, while `effective-flow apply-issues` and `effective-flow apply-review` retain ownership of their overall phases and issue or finding tasks; a non-interactively delegated subworkflow reports status and results to the owner and may keep a local detail list only in a harness-isolated subcontext, never as a second progress overview. Follow the native task tool’s state model: if only one entry may be active, keep the overall phase active while parallel detail work follows its existing rules and is summarized in chat; submit result-dependent status changes only after the determining tool result is known, never in the same parallel tool batch. After each numbered phase and each bounded correction round, post a short update with its result and the next step, adding a deviation or blocker only when present; during correction keep the phase active, report the failed check and correction result, and name the retry or escalation; these updates are not gates, so continue with the next step unless an existing approval rule or genuine blocker requires user input. Give skipped, terminally failed and aborted steps the best native end state, or an unambiguous `[skipped]`, `[failed]` or `[aborted]` suffix when none exists; keep a step awaiting user input open with its blocker, and never treat terminal failure or abort as satisfying the completion condition. If the task tool is unavailable, list the known remaining phases compactly in chat before continuing and carry their state in later updates; if updates fail irrecoverably, report that failure once, move all still-open tracking to chat without claiming a successful tool update, and continue the domain work. Immediately before reporting completion, the owner reconciles every known phase and dynamic entry—including the equivalent final chat summary in fallback mode—to a truthful visible end state, and independently verifies the domain completion condition; never report completion with an unresolved entry.

**Load on demand:** Read `shared/worktree-integration.md`, when the delivery/worktree mode is determined.

## Investigation method

This building block describes the read-only core of a bug and behavior investigation. The investigation steps described here are themselves read-only: they change no code and write no tests; a reproduction happens within these steps only through observation – running existing checks, describing logs and behavior – or through a documented reproduction guide. Whether the embedding workflow additionally produces a reproduction test is decided by that workflow itself (e.g. `effective-flow fix` additionally writes a failing test); `effective-flow investigate`, by contrast, stays fully read-only.

### Investigate symptom and code

1. Analyze the symptom or error description thoroughly: expected versus actual behavior.
2. Delegate the read-only investigation of the relevant code to an internal Explore sub-agent; work inline only under the delegation mandate's triviality exception. Either way it stays read-only.
3. Clarify open questions directly with the user:
   - when does the behavior occur
   - is there an error message or a clearly nameable expected versus actual behavior
   - since when has the behavior existed
4. Identify the suspected root cause and the affected files.

### Diagnosis validation

Assess the diagnosis with a scorecard before making a follow-up decision:

- **Clarity:** root cause as well as file and line named concretely.
- **Verification:** behavior reproducible or described as a concrete reproduction guide.
- **Context:** assumptions explicitly marked, target <= 10 % guessing.

## Wisdom Accumulation

At the start, generate a session ID (e.g. via timestamp `date +%Y%m%d%H%M%S`) and use it consistently for the wisdom file `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`. This prevents collisions with parallel runs.

If the wisdom write needs `.effective-flow/` to be created, apply the owning workflow's loaded
“Runtime-state write safety” contract to that exact directory immediately before its `mkdir`.
Immediately before creating, updating, or deleting the wisdom file, apply the contract again to
that concrete file path. A blocked guard leaves the file and directory unchanged.

Contents:

- discarded root-cause hypotheses
- reproduction steps and results
- discovered dependencies and side effects
- wrong assumptions

After each phase, write a summary and pass it on to later phases. Delete the file at the end.

## Project routing

Classify affected files and domains with the canonical “Project routing” contract above. Route
specialized and degraded product buckets separately from tooling-only work; ask only when the file
role is genuinely ambiguous.

Current workflow for review-report backlinks: `effective-flow fix`.

**Load on demand:** Read `shared/review-report-backlinks.md`, when a review-report backlink is written or updated.

**Load on demand:** Read `shared/unresolved-review-report.md`, when open or unimplemented review findings are offloaded as a report.

**Load on demand:** Read `shared/review-report-format.md`, when a review report is written or an existing one is augmented.

Current workflow for plan references: Bugfix (`effective-flow fix`).

**Load on demand:** Read `shared/plan-reference-routing.md`, when the argument could point to an existing plan file.

**Load on demand:** Read `shared/next-steps.md`, when the run reaches its completion report.

## Clarification gate (fully clarified?)

Before a basis (plan file, issue, or review finding) is implemented, this
gate checks whether it is **fully clarified** and **implementable without a follow-up question**. The gate applies
at **both** entry points: in the apply chain (`effective-flow apply` →
``tools/apply-plan.md``/``tools/apply-issues.md``/``tools/apply-review.md``) **and** on
direct invocation of an implementing workflow (`effective-flow build`, `effective-flow fix`,
`effective-flow refactor`, `effective-flow docs`) with a plan file.

Guiding principle: **No assumptions except the absolutely obvious.** When in doubt, prefer one
clarification round too many over one too few.

### Abort criteria (at least one applies → do not implement)

- **Open points:** the plan contains an `## Offene Punkte` or canonical `## Open points` section
  with entries other than the empty state (`- Keine offenen Punkte.` / `- No open points.`).
  Continue to recognize the former English spelling `## Open Points` when reading existing plans.
- **Missing measurable acceptance criteria:** there are no acceptance criteria, or they are
  formulated without a named check/metric (no concrete check, no verifiable
  target state).
- **Implementation-relevant assumptions:** the plan contains uncertainties marked as assumptions that
  materially affect the behavior, scope, or risk of the implementation.
- **Not self-contained (issues/findings):** an issue or finding does not describe the
  intended implementation self-containedly enough to work through it without a follow-up question.

Pure, uncritical assumptions with no implementation relevance do not block.

### Behavior at the gate

- **Passed** (no criterion applies): continue to implementation. Before delegating, the
  orchestrating workflow resolves the concrete output language for every destination surface
  through the shared language rules and includes those `de`/`en` values in the agent task. The
  agent uses the supplied values and does not reinterpret project configuration.
- **Not passed:** briefly name the affected points, refer back to a clarification round,
  and end the current skill instead of partially implementing or guessing.
  Target skill of the clarification: a plan file goes to `effective-flow plan` or its in-depth
  plan review (`effective-flow review <planfile>`); an issue or finding goes to
  `effective-flow plan-issue`.

The gate replaces the former separate "check open points" check: where a workflow previously
ran this check on its own, this gate now serves as the single authoritative instance,
to avoid duplicate maintenance.

When an open plan for `effective-flow fix` is confirmed, it first passes through the
"clarification gate". If it does not pass the gate, refer according to the gate behavior to
`effective-flow plan` or `effective-flow review <planfile>` and end the workflow. If
the plan passes the gate:

- use the plan file's contents as the basis for diagnosis and fix
- do not skip reproduction automatically; if the plan already contains reproduction hints, validate them in Phase 2

## Workflow

### Phase 1: Investigation

Run the read-only investigation per "Investigation method", section "Investigate symptom and code": analyze the error description, investigate the relevant code via an internal explore sub-agent, clarify the standard follow-up questions (when does the error occur, error message or expected versus actual behavior, since when) and identify the probable root cause along with the affected files.

### Phase 2: Reproduction

1. Try to reproduce the bug:
   - ``effective-flow-code-validator`` for the current technical state
   - if possible: ``effective-flow-test-writer`` for a failing test that documents the behavior
2. Perform a gap analysis for the diagnosis and fix strategy:
   - over-engineering
   - unspoken assumptions
   - missing acceptance criteria
   - edge cases
   - scope creep
3. Perform the diagnosis validation per "Investigation method" (Clarity, Verification, Context) and extend it with:
   - fix scope: minimal fix clearly defined
4. Present to the user:
   - where the bug is
   - what the root cause is
   - how it can be reproduced
   - gap-analysis insights
   - validation scorecard
5. Derive the explicit completion condition from the diagnosis, fix scope and acceptance criteria (see "Goal-driven completion control"); it covers phases 3–5.
6. Obtain approval.

Ask the user: **Diagnosis and fix strategy approved?**
- Yes -- Approval granted, the workflow continues with the next phase
- Adjust -- Enter feedback as free text

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
     guidance stays leading. The binding assignment per skill/intersection is in the ownership
     inventory in the Developer Guide (`docs/developer-guide/skill-ownership.md`).
6. **Missing authoritative skill (minimal fallback):** If the authoritative skill is not
   available (not installed, `skills.enabled: false`, or disabled via `exclude`), the
   **minimal generic fallback** left in the source applies — a short, essential core guidance
   so the tool stays functional and degrades cleanly. **No** second full domain handbook is
   kept on hand; full depth comes only with the central skill.
7. **Report:** Briefly name which skills were used (or that none fit). If an orchestrator tool
   already handed you relevant skills, apply them and do not run a redundant full discovery.

### Phase 3: Fix

0. Per "Delivery and worktree integration", determine the effective delivery/worktree mode and
   its verified execution-location receipt, then run any applicable owned setup. Pass that
   receipt into phases 3–4 (fix, verification); each write-capable boundary revalidates it and
   roots every operation there.
1. Start every implementer selected by the canonical routing contract. Before
   ``effective-flow-generic-product-implementer``, emit the reduced-depth notice. Never send product code
   to ``effective-flow-generic-implementer``.
2. Give a precise assignment:
   - root cause
   - affected files
   - desired behavior after the fix
   - note: minimal change, no refactoring

### Phase 3.5: Documentation sync

Run the mandatory documentation sync gate for the files this fix changed, before verification, so
the checks of Phase 4 cover the documentation changes as well. A minimal fix commonly ends in
`no impact` verdicts; the gate still runs and still records them.

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

### Phase 4: Verification

Start in parallel if possible:

1. ``effective-flow-test-writer``
   - confirms the failing test from Phase 2 or writes a regression test
2. ``effective-flow-code-validator``
   - repository-native lint, type, build and documentation checks that can be discovered safely
3. For every degraded generic product bucket, ``effective-flow-generic-product-reviewer``
   - performs a read-only qualitative review with the reduced-depth limitation
   - reports all severities; critical findings must be fixed before completion

If open findings or residual risks arise in the process, document them in a structured way so Phase 5 can write them as a review report:

- Title
- Severity (Critical / Important / Note)
- Complexity (Low / Medium / High)
- Area
- File + line
- Problem
- Recommendation
- Action (`effective-flow fix`, `effective-flow refactor`, `effective-flow build` or `effective-flow docs`)
- Prompt suggestion
- Status in the complete report language (English: Fixed / Open / Not implemented; German:
  Behoben / Offen / Nicht umgesetzt)
- rationale for non-implementation or ADR reference as slug, if present, e.g. `(ADR: <slug>)`

### Phase 5: Completion

1. If errors were found in Phase 4: fix them and re-verify Phase 4 per "Goal-driven completion control": bound the internal correction rounds and escalate to the user if the completion condition still does not hold afterwards, instead of repeating indefinitely.
2. If findings or residual risks with a canonical open or unimplemented status in the complete
   report language (`Open` / `Not implemented` or `Offen` / `Nicht umgesetzt`) remain from
   verification, regression test or review-like check:
   - write them into a new file under `.effective-flow/review/` per "Open review-finding reports"
   - if a plan file exists, use the file name `review-report-YYYY-MM-DD-plan-<slug>.md`
   - name the generated report path in the completion summary
3. If this fix resolved a finding from an existing review-report file in `.effective-flow/review/`:
   - add a short implementation note as the last entry directly in the affected finding
   - begin the note with `✅` and name at least the date and workflow
4. Delete the wisdom file.
5. If delivery or worktree execution was active: perform the handback per "Delivery and worktree integration" (for a guided plan file including the plan status switch to `Umgesetzt`/`Implemented` and archive move to `<plan.dir>/archive/` at the delivery point, commit the changes, ownership-safe worktree cleanup if applicable, completion action `pr`/`merge`/`branch`, defer the checkout). Declare to that handback that this workflow supplies **no** complete finding set — Phase 4 routes only ``effective-flow-generic-product-reviewer`` for degraded buckets, so a specialist bucket carries no reviewer findings — so an automatic PR review reviews the pull request itself. If the workflow exceptionally runs in-place without delivery, it performs the same status switch and archive move directly in the working tree.
6. Summarize:
   - root cause
   - changes
   - new or adjusted tests
   - residual risks
   - for an active delivery/worktree mode: delivery branch, final checkout state and result of the completion action (PR URL, merge or retained branch)
7. Emit the next-step block per `next-steps` as the last element of the report.

## Pre-commit gate

Before every commit, the checks configured in the project must pass without errors. Typical checks are type-checking, linting, and tests — use the scripts defined in the project (e.g. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm agent:check`).

- If a check reports errors: fix the errors first, then check again.
- Never commit code that does not pass these checks.
- This rule applies even when a separate verification phase exists — it is an additional safeguard, not a replacement.

**Load on demand:** Read `shared/commit-message-rules.md`, when a commit message or Conventional Commit title is written.

## Rules

- Start independent specialist phases in parallel
- give the user a short status update after each phase
- fix errors before continuing
- keep changes minimal
- give internal sub-agents the done protocol
