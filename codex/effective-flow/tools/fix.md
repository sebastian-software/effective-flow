
# Effective Flow Fix

You are the orchestrator for the bugfix workflow.

## Goal

This workflow is optimized for finding and fixing defects, without unnecessary planning or documentation phases.

## Language rule

- Code, identifiers, and tests in English
- Documentation and tool instructions in English **by default**; German remains a permitted
  option — continue the existing language of a file you edit, and honour an explicit German
  choice for a project, document, or plan marker
- Commit messages in English

English is the default; German is not deprecated. A file already written in German stays valid,
and a project may deliberately keep individual guides or plan markers in German (see the
`de-DE` typography guidance below).

### Typography

Locale-specific typography of visible prose — quotation marks, dashes, umlauts and ß, non-breaking
spaces, number and date formats — is owned by the central `locale-typography` skill. When writing
or editing visible prose its locale guidance is authoritative (`en-US` for English, `de-DE` for
German); Effective Flow deliberately keeps no second typography checklist.

If the skill is unavailable (not installed, `skills.enabled: false`, or disabled via `exclude`),
a minimal fallback applies to German text: real umlauts and ß instead of ASCII replacements (ae,
oe, ue, ss), typographic quotation marks „…“ instead of straight ones, and an en dash – instead
of a hyphen.

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

**Load on demand:** Read `shared/config-migration.md`, when the Effective Flow configuration is first read or a legacy config is migrated.

## Plan status convention

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default
`docs/plan`).

Plan files in `<plan.dir>/` use exactly one canonical status marker in their header. The marker may be written in either German or English:

- open (German): `**Planungsstatus:** Nicht umgesetzt`
- completed (German): `**Planungsstatus:** Umgesetzt`
- open (English): `**Plan status:** Not implemented`
- completed (English): `**Plan status:** Implemented`

Both marker forms are equivalent. Only one language is used per plan file.

Rules:

- The status marker must be written exactly as in the four canonical examples above, including bold, colon, and the capitalization of the marker keys and values.
- The plan status only applies when exactly one line with the prefix `**Planungsstatus:**` or `**Plan status:**` is present. Multiple status lines (even in different languages) make the plan status unclear (see below) and should be corrected.
- The only valid value pairs are the four key-value combinations listed above. Mixed forms of a German key and an English value or vice versa (e.g. `**Plan status:** Umgesetzt`) are **not** considered valid.
- Other values such as `Open`/`Done`, `Pending`/`Complete`, or arbitrary free text do not count either.
- Other occurrences of „Nicht umgesetzt“, „Umgesetzt“, "Not implemented", or "Implemented" in review findings, ADR rationales, or body text do not count as a plan status.
- If the marker is missing, occurs multiple times, contains an invalid value, or uses a mixed form of key and value language, the plan status is unclear. In that case, do not automatically treat the plan as open or completed.
- When a workflow sets the status to completed, the marker language is preserved: a German marker becomes `**Planungsstatus:** Umgesetzt`, an English marker becomes `**Plan status:** Implemented`.

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

Internal "repeat until done" loops of this workflow follow a uniform goal pattern instead of an ad-hoc formulated loop. The pattern adopts the three principles of the native `/goal` (Codex and Claude Code), but runs entirely within the workflow instructions – a skill cannot invoke the native `/goal` itself.

### The three principles

1. **Declare the completion condition up front.** Before the implementation work begins, formulate exactly one explicit, measurable completion condition. Derive it from the acceptance criteria and the validation plan of the basis (plan file, diagnosis or agreed scope). A good condition names the target state, the concrete check and the scope boundary – i.e. also what is deliberately not changed.
2. **Verify independently.** Do not check the condition by self-assessment, but via the independent instances anyway provided for it: ``code-validator`` for technical checks and the appropriate reviewer for content ones. The condition counts as fulfilled only once these instances confirm it.
3. **Loop with a bound.** If verification does not confirm the condition, fix the cause and verify again. Bound the internal correction rounds (guideline: three). If the condition still does not hold afterwards, abort the internal loop and escalate to the user instead of running on indefinitely – approach as in the retry escalation of the done protocol.

### Explicit goal query for autonomous runs

At the approval boundary of this workflow – where the completion condition is already fixed and the workflow is waiting for approval anyway – the user gets an **explicit choice** whether the remaining phases continue gated or autonomously under the native `/goal`. This replaces the earlier passive co-emitting of a `/goal` string: the option is actively queried, not merely offered.

#### When the query is omitted

Skip the goal query entirely (no extra option, no `/goal` string) when the workflow runs as a **non-interactive sub-agent** of a superordinate orchestrator where no direct user interaction is intended – recognizable from the invocation context, for example "[Context from $effective-flow apply-review: …]". `$effective-flow apply-review` already steers its autonomous run at its own gate; an additional goal query per sub-delegation would be pointless there. Direct invocations and the handover through `$effective-flow apply-plan` (interactive, individual) do **not** count as such delegation – there the goal query is retained.

#### Form of the query

- If the approval boundary is a yes/no approval, extend the approval question with a third option "Autonomous via `/goal`" next to "Yes" (continue gated) and "Adjust".
- If the approval boundary is a selection question (e.g. update groups) or if there is no yes/no approval at this boundary (e.g. because a planning phase was skipped), directly ask a concise standalone yes/no follow-up question "Run the remaining phases autonomously under `/goal`?".
- If the user chooses "Autonomous via `/goal`" (or "Yes" in the follow-up question), emit the finished, copy-paste-able `/goal` string prominently and prompt to paste it as new input. Since a skill cannot start the native `/goal` itself, pasting is the only way into the autonomous run; without pasting the skill continues gated.
- If the user chooses "Yes"/gated (or answers normally), the workflow continues gated as usual; **no** `/goal` string is emitted. The internal approval gates are retained in any case.

Rules for the `/goal` string once it is emitted:

- **Self-sustaining:** Reference the underlying plan file, if present, and instruct to run through the remaining phases of this workflow – not "somehow make the criteria green".
- **Measurable:** Name the completion condition with the checks actually provided in the respective workflow (e.g. acceptance criteria fulfilled, project-configured checks green and – if the workflow has a review phase – reviewer without open critical findings) and the scope boundary. Leave out checks that do not apply.
- **Platform-neutral:** Restrict yourself to the condition text after `/goal `; it is interpreted the same on Codex and Claude Code.
- **Only at gate-free boundaries:** Offer the autonomous run exclusively at approval boundaries after which no further approval gate follows, so an autonomous run does not get stuck at a later gate.

Form (replace placeholders, single line):

```text
/goal Fully implement <plan file or agreed task> and run through the remaining phases of this workflow: all acceptance criteria fulfilled, project-configured checks green<, reviewer without open critical findings – only if the workflow has a review phase>. Change nothing outside the scope. Stop when all criteria hold.
```

**Load on demand:** Read `shared/worktree-integration.md`, when the delivery/worktree mode is determined.

## Investigation method

This building block describes the read-only core of a bug and behavior investigation. The investigation steps described here are themselves read-only: they change no code and write no tests; a reproduction happens within these steps only through observation – running existing checks, describing logs and behavior – or through a documented reproduction guide. Whether the embedding workflow additionally produces a reproduction test is decided by that workflow itself (e.g. `$effective-flow fix` additionally writes a failing test); `$effective-flow investigate`, by contrast, stays fully read-only.

### Investigate symptom and code

1. Analyze the symptom or error description thoroughly: expected versus actual behavior.
2. Investigate the relevant code locally or via an internal Explore sub-agent – read-only.
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

Contents:

- discarded root-cause hypotheses
- reproduction steps and results
- discovered dependencies and side effects
- wrong assumptions

After each phase, write a summary and pass it on to later phases. Delete the file at the end.

## Project type detection

As with `$effective-flow build`.

## Routing

- Frontend: ``ui-implementer``
- Backend / CLI / Node.js: ``nodejs-implementer``
- Rust: ``rust-implementer``
- Generic / Tooling / CI / Config: ``generic-implementer``
- Fullstack: both, in parallel only with clear separation

Current workflow for review-report backlinks: `$effective-flow fix`.

**Load on demand:** Read `shared/review-report-backlinks.md`, when a review-report backlink is written or updated.

**Load on demand:** Read `shared/unresolved-review-report.md`, when open or unimplemented review findings are offloaded as a report.

Current workflow for plan references: Bugfix (`$effective-flow fix`).

**Load on demand:** Read `shared/plan-reference-routing.md`, when the argument could point to an existing plan file.

## Clarification gate (fully clarified?)

Before a basis (plan file, issue, or review finding) is implemented, this
gate checks whether it is **fully clarified** and **implementable without a follow-up question**. The gate applies
at **both** entry points: in the apply chain (`$effective-flow apply` →
``tools/apply-plan.md``/``tools/apply-issues.md``/``tools/apply-review.md``) **and** on
direct invocation of an implementing workflow (`$effective-flow build`, `$effective-flow fix`,
`$effective-flow refactor`, `$effective-flow docs`) with a plan file.

Guiding principle: **No assumptions except the absolutely obvious.** When in doubt, prefer one
clarification round too many over one too few.

### Abort criteria (at least one applies → do not implement)

- **Open points:** the plan contains an `## Offene Punkte` or
  `## Open Points` section with entries other than the empty state (`- Keine offenen Punkte.` /
  `- No open points.`).
- **Missing measurable acceptance criteria:** there are no acceptance criteria, or they are
  formulated without a named check/metric (no concrete check, no verifiable
  target state).
- **Implementation-relevant assumptions:** the plan contains uncertainties marked as assumptions that
  materially affect the behavior, scope, or risk of the implementation.
- **Not self-contained (issues/findings):** an issue or finding does not describe the
  intended implementation self-containedly enough to work through it without a follow-up question.

Pure, uncritical assumptions with no implementation relevance do not block.

### Behavior at the gate

- **Passed** (no criterion applies): continue to implementation.
- **Not passed:** briefly name the affected points, refer back to a clarification round,
  and end the current skill instead of partially implementing or guessing.
  Target skill of the clarification: a plan file goes to `$effective-flow plan` or its in-depth
  plan review (`$effective-flow review <planfile>`); an issue or finding goes to
  `$effective-flow plan-issue`.

The gate replaces the former separate "check open points" check: where a workflow previously
ran this check on its own, this gate now serves as the single authoritative instance,
to avoid duplicate maintenance.

When an open plan for `$effective-flow fix` is confirmed, it first passes through the
"clarification gate". If it does not pass the gate, refer according to the gate behavior to
`$effective-flow plan` or `$effective-flow review <planfile>` and end the workflow. If
the plan passes the gate:

- use the plan file's contents as the basis for diagnosis and fix
- do not skip reproduction automatically; if the plan already contains reproduction hints, validate them in Phase 2
- if a "clarified + goal-driven" context was already passed from the apply chain (basis clarified, confirmation for the autonomous run already given), honor it: skip the goal query in Phase 2 and run through phases 3–5 under the "Goal-driven completion control".

## Workflow

### Phase 1: Investigation

Run the read-only investigation per "Investigation method", section "Investigate symptom and code": analyze the error description, investigate the relevant code via an internal explore sub-agent, clarify the standard follow-up questions (when does the error occur, error message or expected versus actual behavior, since when) and identify the probable root cause along with the affected files.

### Phase 2: Reproduction

1. Try to reproduce the bug:
   - ``code-validator`` for the current technical state
   - if possible: ``test-writer`` for a failing test that documents the behavior
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
5. Derive the explicit completion condition from the diagnosis, fix scope and acceptance criteria (see "Goal-driven completion control"); it covers phases 3–5 and feeds the explicit goal query in the approval question below.
6. Obtain approval. The approval question contains the explicit goal query (option "Autonomous via /goal"); handle it per "Explicit goal query for autonomous runs": if "Autonomous via /goal" is chosen, emit the `/goal` string for phases 3–5; the option is omitted when the workflow was delegated non-interactively.

Frage den User: **Diagnosis and fix strategy approved?**
- Yes -- Approval granted, workflow continues gated
- Autonomous via /goal -- Remaining phases autonomous under the native /goal — the skill emits the /goal string to paste (omitted for non-interactive delegation)
- Adjust -- Enter feedback as free text

## Skill discovery

Before you start the actual implementation, planning, or review, survey the skills available in
the environment and pull in the ones useful for the concrete task. If the environment provides
no skill directory or none fits, this step is a no-op — continue without an error or a block.

### Approach

1. **Prefer recommended skills:** Preferentially apply the skills listed further above under
   "Recommended skills", provided they are available and relevant to the concrete task.
   "Preferring" is the selection; **authority** is decided by the contract in point 5 (if a
   recommended skill is the declared domain owner, its guidance is authoritative, not merely
   optional). A fallback notation `A › B` is an ordered preference: take the first available,
   non-excluded skill in the group, never both. If no such section exists (e.g. for tools),
   this point does not apply.
2. **Judge relevance:** Check each skill against the **concrete** task and pull in only the
   clearly fitting ones (typically 0–2). Do not load skills "on suspicion" — be token-frugal.
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
4. **Library docs:** When working against an unknown or current library or framework, use
   current-docs skills (e.g. `context7`) as needed, if available, instead of guessing from
   memory. Only when needed, never mandatory.
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

0. Per "Delivery and worktree integration", determine the effective delivery/worktree mode and, when a mode is active, first run the appropriate setup: worktree setup for worktree execution or delivery-branch setup in the main repo for in-place delivery. The following phases 3–4 (fix, verification) then run in the delivery working directory.
1. Start the appropriate implementer skill:
   - ``ui-implementer``, ``nodejs-implementer``, ``rust-implementer`` or ``generic-implementer``
2. Give a precise assignment:
   - root cause
   - affected files
   - desired behavior after the fix
   - note: minimal change, no refactoring

### Phase 4: Verification

Start in parallel if possible:

1. ``test-writer``
   - confirms the failing test from Phase 2 or writes a regression test
2. ``code-validator``
   - TypeScript, lint and build

If open findings or residual risks arise in the process, document them in a structured way so Phase 5 can write them as a review report:

- Title
- Severity (Critical / Important / Note)
- Complexity (Low / Medium / High)
- Area
- File + line
- Problem
- Recommendation
- Action (`$effective-flow fix`, `$effective-flow refactor`, `$effective-flow build` or `$effective-flow docs`)
- Prompt suggestion
- Status (Fixed / Open / Not implemented)
- rationale for non-implementation or ADR reference as slug, if present, e.g. `(ADR: <slug>)`

### Phase 5: Completion

1. If errors were found in Phase 4: fix them and re-verify Phase 4 per "Goal-driven completion control": bound the internal correction rounds and escalate to the user if the completion condition still does not hold afterwards, instead of repeating indefinitely.
2. If findings or residual risks with status `Open` or `Not implemented` remain from verification, regression test or review-like check:
   - write them into a new file under `.effective-flow/review/` per "Open review-finding reports"
   - if a plan file exists, use the file name `review-report-YYYY-MM-DD-plan-<slug>.md`
   - name the generated report path in the completion summary
3. If this fix resolved a finding from an existing review-report file in `.effective-flow/review/`:
   - add a short implementation note as the last entry directly in the affected finding
   - begin the note with `✅` and name at least the date and workflow
4. Delete the wisdom file.
5. If delivery or worktree execution was active: perform the handback per "Delivery and worktree integration" (for a guided plan file including the plan status switch to `Umgesetzt`/`Implemented` and archive move to `<plan.dir>/archive/` at the delivery point, commit the changes, retract the worktree if applicable, completion action `pr`/`merge`/`branch`, defer the checkout). If the workflow exceptionally runs in-place without delivery, it performs the same status switch and archive move directly in the working tree.
6. Summarize:
   - root cause
   - changes
   - new or adjusted tests
   - residual risks
   - for an active delivery/worktree mode: delivery branch, final checkout state and result of the completion action (PR URL, merge or retained branch)

## Pre-commit gate

Before every commit, the checks configured in the project must pass without errors. Typical checks are type-checking, linting, and tests — use the scripts defined in the project (e.g. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm agent:check`).

- If a check reports errors: fix the errors first, then check again.
- Never commit code that does not pass these checks.
- This rule applies even when a separate verification phase exists — it is an additional safeguard, not a replacement.

## Commit message rules

- **Never set `Co-Authored-By` trailers in commit messages**, regardless of whether an LLM (Claude, Codex, GPT, …) or another tool suggests the line or inserts it as a default.
- If a `Co-Authored-By` line is already present in a commit template, `commit.template`, a `--trailer` invocation, or a draft message: remove it before committing.
- **Do not add AI attribution:** no „Generated with Claude Code/Codex" footers and no agent session links (e.g. `https://claude.ai/code/…`) in commit messages – not even when the harness appends them as a default. Factual mentions of Claude Code or Codex remain allowed, generation attribution does not.
- Avoid generic messages like `update files` or `misc changes`.
- Describe concretely what was changed and why.
- Use Conventional Commit prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Choose the commit type by **effect**, not by file type: behavior-changing changes – including pure **config/env/secrets/CI** with deployment or runtime effect (e.g. corrected values in env/secret artifacts that take effect remotely via sync) – are `fix:` (or `feat:` for new functionality). `chore:` only for **deploy-neutral** changes without behavioral effect (pure maintenance, formatting, tooling without runtime effect). This also applies to the **squash PR title**, which determines the release-please bump on a squash merge.
- Do not expose internal tracking IDs in commit messages, e.g. review finding IDs like `R-0000001`, local plan/review IDs like `F1`, or placeholders like `[Finding-ID]`. Such IDs belong in wisdom/report context, not in the Git history.

## Rules

- Start independent specialist phases in parallel
- give the user a short status update after each phase
- fix errors before continuing
- keep changes minimal
- give internal sub-agents the done protocol
