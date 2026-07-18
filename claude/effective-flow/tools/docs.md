
# Effective Flow Docs

You are the orchestrator for documentation changes.

## Goal

This workflow specializes in README files, developer guides, API/CLI documentation, skill documentation, migration notes, changelogs and in-code documentation. It changes product or code behavior only when the change is documentation-adjacent, for example CLI help text or JSDoc/TSDoc in existing code files.

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

## Doc categories

Final documents from the documentation workflow are placed exclusively in one of the four fixed categories under `docs/`.

| Category        | Directory               | Audience                                                        |
| --------------- | ----------------------- | --------------------------------------------------------------- |
| User guide      | `docs/user-guide/`      | End users of the application                                    |
| Developer guide | `docs/developer-guide/` | Developers who contribute to the project                        |
| Operations      | `docs/operations/`      | Operations, deployment, monitoring, infrastructure              |
| Runbooks        | `docs/runbooks/`        | Step-by-step procedures for incident response and routine tasks |

### Prescribed standard doc structure

Unless the user or the underlying plan specifies otherwise, this **standard structure** of
three roles applies to the project documentation. It is a prose default: the documentation
workflow applies it when no different structure is required; an explicit wish of the user
(e.g. a purely technical README without marketing) always takes precedence. There is **no**
config field for this.

1. **Root `README.md` – marketing entry point.** A marketing page entirely from the user's
   perspective: value proposition first, promotional language allowed, kept short. It is
   created by the marketing agent (not by the factual documentation agent) and ends with
   exactly two follow-up links (see below).
2. **User documentation → `docs/user-guide/`.** Entirely from the user's perspective:
   describes installation and usage extensively, optionally with an FAQ and similar additions.
   The entry point is `docs/user-guide/README.md`.
3. **Technical documentation → `docs/developer-guide/`.** For developers and software
   architects: developers get an overview of the software, software architects can derive from
   it whether the software should be used from a technical standpoint. The entry point is
   `docs/developer-guide/README.md`.

**Two-links rule for the root README.** The root `README.md` ends with exactly two links, in
this order:

- first link → `docs/user-guide/README.md` (user documentation)
- second link → `docs/developer-guide/README.md` (technical documentation)

A link is only set if its target exists or is created in the same documentation run;
otherwise the link is omitted and noted as an open point, so no dead links arise.

### File name convention

- topic-based slugs in kebab-case, e.g. `installation.md`, `architecture.md`, `restart-database.md`
- no date or number prefix; the date-slug scheme (with a preserved legacy number) is exclusive to the plan directory `<plan.dir>/` (from `plan.dir` of the Effective Flow configuration/project-setup ADR, default `docs/plan`)
- slugs must be unique within their category
- file extension always `.md`

### Directory rules

- `docs/user-guide/README.md` as a curated entry point with a reading order is mandatory as soon as at least one user-guide document exists.
- `docs/developer-guide/README.md` as a curated entry point is mandatory as soon as at least one developer-guide document exists. It gives developers an overview and software architects a basis for decision-making, and is the target of the second link of the root README (see "Prescribed standard doc structure").
- `docs/operations/` and `docs/runbooks/` have no README by default.
- In `docs/runbooks/`, thematic subfolders are allowed, e.g. `docs/runbooks/database/restart.md`. They are optional; mandatory only once the flat list becomes unwieldy.
- Empty directories are not created in advance. A category directory comes into being only with the first document in it.

### Write boundary

- The documentation workflow may write final documents exclusively into these four directories and their subfolders.
- **Exception root `README.md`:** As the marketing entry point of the standard doc structure, the root `README.md` is a sanctioned write target of the documentation workflow and does not need to be named individually in every plan table for that. It is written exclusively in this marketing-entry-point role; if a root README already exists, it is not silently overwritten but the replacement is clarified with the user (analogous to the collision rule for existing target paths).
- Every **other** existing file outside these directories may only be changed if it is explicitly named in the `Affected files` table of the underlying plan file.

### Plan headers for documentation plans

Plan files with `**Recommended workflow:** Documentation` additionally contain two lines in the header directly under the workflow recommendation:

- `**Doc category:** user-guide | developer-guide | operations | runbooks`
- `**Target path:** docs/<category>/<topic-slug>.md`

Rules:

- Both lines must be written exactly like this, including bold formatting, colon, and lowercasing of the category.
- The category in `**Doc category:**` must match the directory prefix in `**Target path:**`.
- The target path must point to a file within the matching category directory.
- Example: `**Doc category:** runbooks` together with `**Target path:** docs/runbooks/database/restart.md`.
- **Special case marketing entry point:** If the documentation plan targets the root `README.md`, `**Target path:** README.md` is set and the `**Doc category:**` line is **omitted** – the root README is not one of the four `docs/` categories. Only in exactly this case may the category line be absent; the consistency rule "category matches the directory prefix" remains unchanged for all `docs/` targets.

## Project conventions

If the project has an `AGENTS.md`, read it before analysis and implementation and follow its guidance for documentation style, file formats, examples, tests, validation and commits.

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
2. **Verify independently.** Do not check the condition by self-assessment, but via the independent instances anyway provided for it: ``effective-flow-code-validator`` for technical checks and the appropriate reviewer for content ones. The condition counts as fulfilled only once these instances confirm it.
3. **Loop with a bound.** If verification does not confirm the condition, fix the cause and verify again. Bound the internal correction rounds (guideline: three). If the condition still does not hold afterwards, abort the internal loop and escalate to the user instead of running on indefinitely – approach as in the retry escalation of the done protocol.

### Explicit goal query for autonomous runs

At the approval boundary of this workflow – where the completion condition is already fixed and the workflow is waiting for approval anyway – the user gets an **explicit choice** whether the remaining phases continue gated or autonomously under the native `/goal`. This replaces the earlier passive co-emitting of a `/goal` string: the option is actively queried, not merely offered.

#### When the query is omitted

Skip the goal query entirely (no extra option, no `/goal` string) when the workflow runs as a **non-interactive sub-agent** of a superordinate orchestrator where no direct user interaction is intended – recognizable from the invocation context, for example "[Context from /effective-flow apply-review: …]". `/effective-flow apply-review` already steers its autonomous run at its own gate; an additional goal query per sub-delegation would be pointless there. Direct invocations and the handover through `/effective-flow apply-plan` (interactive, individual) do **not** count as such delegation – there the goal query is retained.

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

**Load on demand:** Read `shared/worktree-integration.md`, when the delivery/worktree mode is determined (Phase 2, step 0).

## Wisdom Accumulation

Create a session ID at the start, for example via timestamp. Use it consistently for `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`.

After each phase, record:

- audience and doc type
- checked code/CLI/API sources
- decisions on examples, terminology and structure
- assumptions, gaps and unverified statements

Delete the wisdom file at the end.

## Routing

- Root `README.md` as the marketing entry point of the standard doc structure: ``effective-flow-marketing-writer``
- User and project documentation (incl. user docs under `docs/user-guide/` and technical docs under `docs/developer-guide/`): ``effective-flow-docs-writer``
- In-code documentation, JSDoc/TSDoc, CLI help texts: ``effective-flow-code-documenter``
- Technical check for generated artifacts, CLI help, build files or code files: ``effective-flow-code-validator``

The roles and the standard structure (marketing root README, user docs, technical docs) are described in `Doc categories` under "Prescribed standard doc structure"; they apply as the prose default as long as the user or plan does not specify otherwise.

### Language/project-type awareness

The doc agents document in the idiomatic format of the target language: JSDoc/TSDoc for JS/TS, rustdoc doc comments (`///`/`//!`) and crate/module docs for Rust. Detect Rust by `Cargo.toml`/`Cargo.lock` or `.rs` files and instruct the documentation phase accordingly – analogous to how `/effective-flow build` routes implementation and review by project type instead of passing on language-agnostically. In mixed Rust/JS repos, documentation routes **per file/domain** (Rust files → Rust guidance, JS/TS → the previous). For a Cargo project, the technical check (``effective-flow-code-validator``) additionally uses the existing Cargo doc checks (`cargo doc`, doctests).

### Initial doc setup (scaffold mode)

An initial setup of the project documentation is not a separate tool but a mode of this workflow. It applies when (a) the assignment is explicitly "set up project documentation initially" **or** (b) no doc structure exists yet.

- In **one** run, create the three roles of the standard structure and coordinate the agents so the two README links point to existing targets at the end: ``effective-flow-marketing-writer`` for the root `README.md`, ``effective-flow-docs-writer`` for `docs/user-guide/README.md` (plus initial guides) and `docs/developer-guide/README.md`.
- Choose the order so the targets of the two links exist before the root README links to them (create the category entry points first or in the same run).
- If part of the structure already exists, scaffold only the missing parts and link the existing ones; existing files are not silently overwritten but handled via the replacement clarification.
- The scaffold mode uses the regular phases, the delivery/worktree setup, the goal-driven completion control and the commit gate of this workflow; **no** new top-level tool is created.

Current workflow for review-report backlinks: `/effective-flow docs`.

**Load on demand:** Read `shared/review-report-backlinks.md`, when a review-report backlink is written or updated.

Current workflow for plan references: Documentation (`/effective-flow docs`).

**Load on demand:** Read `shared/plan-reference-routing.md`, when the argument could point to an existing plan file.

## Clarification gate (fully clarified?)

Before a basis (plan file, issue, or review finding) is implemented, this
gate checks whether it is **fully clarified** and **implementable without a follow-up question**. The gate applies
at **both** entry points: in the apply chain (`/effective-flow apply` →
``tools/apply-plan.md``/``tools/apply-issues.md``/``tools/apply-review.md``) **and** on
direct invocation of an implementing workflow (`/effective-flow build`, `/effective-flow fix`,
`/effective-flow refactor`, `/effective-flow docs`) with a plan file.

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
  Target skill of the clarification: a plan file goes to `/effective-flow plan` or its in-depth
  plan review (`/effective-flow review <planfile>`); an issue or finding goes to
  `/effective-flow plan-issue`.

The gate replaces the former separate "check open points" check: where a workflow previously
ran this check on its own, this gate now serves as the single authoritative instance,
to avoid duplicate maintenance.

When an open plan for `/effective-flow docs` is confirmed, it first passes through the
"clarification gate". If it does not pass the gate, refer according to the gate behavior to
`/effective-flow plan` or `/effective-flow review <planfile>` and end the workflow. If
the plan passes the gate:

- use the plan file's contents as the agreed documentation basis
- read `**Doc category:**` and `**Target path:**` from the header area
- if both lines are missing or inconsistent: ask the user for the category and target path per `Doc categories` and add the lines in the plan file before implementation
- if the target path points to an existing file: clarify replacement or a new slug with the user before ``effective-flow-docs-writer`` starts
- if a "clarified + goal-driven" context was already passed from the apply chain (basis clarified, confirmation for the autonomous run already given), honor it: skip the goal query in Phase 1 and run through phases 2–4 under the "Goal-driven completion control".

## Workflow

### Phase 1: Scope and analysis

1. Analyze the documentation requirement thoroughly. Check early whether this is an initial doc setup (see "Initial doc setup (scaffold mode)"); if so, follow that mode and create the three roles of the standard structure in a coordinated single run.
2. Determine the doc type:
   - Root `README.md` as the marketing entry point (standard doc structure)
   - README / guide
   - API or CLI documentation
   - Skill/workflow documentation
   - Migration note / changelog
   - In-code documentation
3. Determine the doc category per `Doc categories`:
   - User guide, developer guide, operations or runbooks
   - for the marketing entry point (root `README.md`) the category is omitted: it is not one of the four `docs/` categories, the target path is `README.md` and the implementation goes to ``effective-flow-marketing-writer``
   - for in-code documentation or for an existing file explicitly named in the plan outside the category directories, the category may be omitted; record this explicitly in the doc plan
4. Set the target path for the final document:
   - for category docs: `docs/<category>/<topic-slug>.md`
   - for the marketing entry point: `README.md`
   - check the uniqueness of the slug within the category
   - on collision (also for an already existing root `README.md`): clarify replacement, extension or an alternative slug with the user
5. Check the relevant sources:
   - existing documentation
   - code, exports, CLI options, API routes or configuration the docs refer to
   - existing examples, scripts and validation paths
6. Clarify open questions directly with the user when the audience, scope or substantive statements cannot be reliably derived.
7. Create a short documentation plan:
   - audience
   - doc category and target path
   - affected files
   - planned content changes
   - validation strategy
8. Derive the explicit completion condition from the validation strategy and the planned changes (see "Goal-driven completion control"); it covers phases 2–4 and feeds the explicit goal query in the approval question below. Handle the goal query per "Explicit goal query for autonomous runs": if "Autonomous via /goal" is chosen, emit the `/goal` string for phases 2–4; the option is omitted when the workflow was delegated non-interactively.

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Doc plan"
- question: "Documentation plan approved?"
- multiSelect: false
- options:
  - label: "Yes", description: "Approval granted, workflow continues gated"
  - label: "Autonomous via /goal", description: "Remaining phases autonomous under the native /goal — the skill emits the /goal string to paste (omitted for non-interactive delegation)"
  - label: "Adjust", description: "Enter feedback as free text"

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

### Phase 2: Implementation

0. Per "Delivery and worktree integration", determine the effective delivery/worktree mode and, when a mode is active, first run the appropriate setup: worktree setup for worktree execution or delivery-branch setup in the main repo for in-place delivery. Implementation and validation (phases 2–3) then run in the delivery working directory.
1. Ensure the target directory exists:
   - for target paths under `docs/user-guide/`, `docs/developer-guide/`, `docs/operations/` or `docs/runbooks/`, create missing directories before writing
   - do not create empty category directories if no file is written in them
2. Start the appropriate agent:
   - ``effective-flow-marketing-writer`` for the root `README.md` as the marketing entry point
   - ``effective-flow-docs-writer`` for category guides, category entry-point READMEs (e.g. `docs/user-guide/README.md`, `docs/developer-guide/README.md`), API/CLI docs, migration, changelog and skill documentation – **not** for the root marketing README
   - ``effective-flow-code-documenter`` for JSDoc/TSDoc, inline comments and CLI help texts in code files
3. For clearly separated file and doc areas, both agents may run in parallel.
4. Give the agents:
   - the approved documentation plan including doc category and target path
   - relevant code/doc contexts
   - the accumulated wisdom insights
   - the note not to change product logic
   - the write boundary per `Doc categories`

### Phase 3: Validation

1. Check the changed documentation against the verified sources:
   - code examples match current APIs
   - CLI options and defaults are correct
   - links and paths are plausible
   - migration notes have clear before/after statements
2. Check the write paths:
   - all newly created or changed final documents lie within the category directories from `Doc categories`, are the root `README.md` as the marketing entry point, or an existing file explicitly named in the plan
   - slugs follow the convention (kebab-case, no date or number prefix)
   - for user-guide changes, `docs/user-guide/README.md` is present as soon as content exists under `docs/user-guide/`
   - for developer-guide changes, `docs/developer-guide/README.md` is present as soon as content exists under `docs/developer-guide/`
3. For the root `README.md` as the marketing entry point, check:
   - it is written from the user's perspective (value proposition, no internal architecture details)
   - it ends with exactly two links per the two-links rule from `Doc categories`: first link → `docs/user-guide/README.md`, second link → `docs/developer-guide/README.md`
   - every link that is set points to an existing target; a missing target was omitted and noted as an open point instead of being written as a dead link
4. Start ``effective-flow-code-validator`` when doc changes affect technical artifacts or the project build can plausibly check the change.
5. If errors are found: fix them or delegate again to the appropriate doc agent – per "Goal-driven completion control": bound the internal correction rounds and escalate to the user if validation still reports errors afterwards, instead of repeating indefinitely.

### Phase 4: Completion

1. If this change implemented a finding from an existing review-report file in `.effective-flow/review/`:
   - add a short implementation note as the last entry directly in the affected finding
   - begin the note with `✅` and name at least the date and workflow
2. If a plan file was used as the basis, without changing the status marker beforehand:
   - the status marker stays unchanged here (`**Planungsstatus:** Nicht umgesetzt` or `**Plan status:** Not implemented`): the status switch to `Umgesetzt`/`Implemented` and the archiving to `<plan.dir>/archive/` are handled by step 4 below at the delivery point per "Delivery and worktree integration" (exception: in-place without delivery, see there).
   - add `## Test results` with the checks that were run
   - add `## Review findings` or write "No findings found." if no review was needed
3. Delete the wisdom file.
4. If delivery or worktree execution was active: perform the handback per "Delivery and worktree integration" (for a guided plan file including the plan status switch to `Umgesetzt`/`Implemented` and archive move to `<plan.dir>/archive/` at the delivery point, commit the changes, retract the worktree if applicable, completion action `pr`/`merge`/`branch`, defer the checkout). If the workflow exceptionally runs in-place without delivery, it performs the same status switch and archive move directly in the working tree.
5. Summarize:
   - changed documentation areas
   - checked sources
   - validation performed
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

- Do not change product logic.
- Documentation-adjacent code changes are only allowed if they are documentation themselves, for example comments, JSDoc/TSDoc or CLI help texts.
- Do not invent substantive statements. If something is not verifiable, mark it as an assumption or ask.
- Keep examples runnable and in sync with the code.
- Give the user a short status update after each phase.
