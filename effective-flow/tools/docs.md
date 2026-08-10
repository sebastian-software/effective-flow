## Portable worker delegation

Names matching `effective-flow-<worker>` in this instruction identify bundled worker contracts, not installed custom-agent roles. When a worker is selected, read only its matching `workers/effective-flow-<worker>.md` file, then delegate through the host harness's built-in general-purpose subagent mechanism with that contract as the worker instructions. Do not request a custom role by the contract name. If built-in subagent delegation is unavailable, stop with a clear explanation; never claim that an undiscoverable worker ran.

# Effective Flow Docs

You are the orchestrator for documentation changes.

## Goal

This workflow specializes in README files, developer guides, API/CLI documentation, skill documentation, migration notes, changelogs and in-code documentation. It changes product or code behavior only when the change is documentation-adjacent, for example CLI help text or JSDoc/TSDoc in existing code files.

**Load on demand:** Read `shared/language-rules.md`, when documentation target languages or delegated language contexts must be resolved.

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

**Load on demand:** Read `shared/runtime-state-safety.md`, when any wisdom, report, backlink, or worktree mutation below `.effective-flow/` is imminent, or a session rename request is about to be written.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when any wisdom, report, backlink, or worktree mutation below `.effective-flow/` is imminent, or a session rename request is about to be written.

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

## Doc categories

Final documents from the documentation workflow are placed exclusively in one of the four fixed categories under `docs/`.

| Category        | Directory               | Audience                                                        |
| --------------- | ----------------------- | --------------------------------------------------------------- |
| User guide      | `docs/user-guide/`      | End users of the application                                    |
| Developer guide | `docs/developer-guide/` | Developers who contribute to the project                        |
| Operations      | `docs/operations/`      | Operations, deployment, monitoring, infrastructure              |
| Runbooks        | `docs/runbooks/`        | Step-by-step procedures for incident response and routine tasks |

### Prescribed standard doc structure

Unless the user, the underlying plan, or the repository itself specifies otherwise, this
**standard structure** of three roles applies to the project documentation. It is a prose default:
the documentation workflow applies it when no different structure is required; an explicit wish of
the user (e.g. a purely technical README without marketing) always takes precedence. There is
**no** config field for this.

**An established repository structure takes precedence over the prescribed standard structure.**
When the documentation owner's repository discovery reports an established, working documentation
structure, that structure is the target and the prescribed standard structure does not override
it. The four categories below are the default for repositories **without** an established
structure. Effective Flow defines **no** local test for what counts as "established" — that is
information-architecture judgment and belongs to the documentation owner; a repository whose
structure the owner cannot establish falls back to the prescribed default. Effective Flow keeps
the write boundary, the target-path approval, and the collision clarification in either case, and
a divergent structure is named explicitly in the doc plan so the user approves it before
implementation.

Resolve documentation language by target: root `README.md` and `docs/user-guide/**` use
`language.documentation.user`; `docs/developer-guide/**`, `docs/operations/**`,
`docs/runbooks/**`, standalone API documentation, and new ADRs use
`language.documentation.technical`; in-code documentation uses `language.source`; explicit
changelog/release prose uses `language.git`. Existing documents preserve their clear language
unless translation was explicitly requested. File/directory names and category values remain
stable and are not translated.

1. **Root `README.md` – marketing entry point.** A marketing page entirely from the user's
   perspective: value proposition first, promotional language allowed, kept short. It is
   created by the marketing agent (not by the factual documentation agent) and applies the
   conditional follow-up-link rule below.
2. **User documentation → `docs/user-guide/`.** Entirely from the user's perspective:
   describes installation and usage extensively, optionally with an FAQ and similar additions.
   The entry point is `docs/user-guide/README.md`.
3. **Technical documentation → `docs/developer-guide/`.** For developers and software
   architects: developers get an overview of the software, software architects can derive from
   it whether the software should be used from a technical standpoint. The entry point is
   `docs/developer-guide/README.md`.

**Conditional follow-up-link rule for the root README.** At the end of the documentation run,
inspect whether the two follow-up targets of the **effective** structure exist. Under the
prescribed standard structure those targets are `docs/user-guide/README.md` and
`docs/developer-guide/README.md`; under an established repository structure they are that
structure's user-facing and technical entry points. The final documentation follow-up section of
the root `README.md` includes only links whose targets exist, in user-facing then technical order:

- If both targets exist at the end of the run, the section contains exactly two links: first the
  user-facing entry point, then the technical one.
- If exactly one target exists, the section contains only that target's valid link. Report the
  other path as an open point in the workflow or agent result.
- If neither target exists, emit neither link. Report both missing paths individually as open
  points in the workflow or agent result.

Never add a placeholder or broken link for a missing target. Preserve existing unrelated
README links; they are outside the final documentation follow-up section and do not count
toward this invariant.

Two different absences are reported differently. A target the effective structure **defines but
has not created yet** is reported by its concrete path. A role the effective structure **does not
define at all** — an established structure with no user-facing or no technical entry point — has
no path to report: name the missing role instead (for example "no user-facing entry point in the
established structure"). Never invent a path for it and never substitute the standard path, which
would reintroduce exactly the fallback the precedence rule forbids.

### File name convention

This convention belongs to the prescribed standard structure and applies to documents in the four
categories. When an established repository documentation structure took precedence, that
structure's own naming conventions apply instead: follow the neighbouring documents rather than
renaming repository-native files to match the rules below.

- topic-based slugs in kebab-case, e.g. `installation.md`, `architecture.md`, `restart-database.md`
- no date or number prefix; the date-slug scheme is exclusive to the two Effective Flow artifact directories — the plan directory `<plan.dir>/` (from `plan.dir` of the Effective Flow configuration/project-setup ADR, default `docs/plan`, with a preserved legacy number) and the concept directory `<concept.dir>/` (from `concept.dir`, default `docs/concept`)
- slugs must be unique within their category
- file extension always `.md`

### Directory rules

- `docs/user-guide/README.md` as a curated entry point with a reading order is mandatory as soon as at least one user-guide document exists.
- `docs/developer-guide/README.md` as a curated entry point is mandatory as soon as at least one developer-guide document exists. It gives developers an overview and software architects a basis for decision-making, and is the target of the developer-guide follow-up link when that link is included under the conditional rule (see "Prescribed standard doc structure").
- `docs/operations/` and `docs/runbooks/` have no README by default.
- In `docs/runbooks/`, thematic subfolders are allowed, e.g. `docs/runbooks/database/restart.md`. They are optional; mandatory only once the flat list becomes unwieldy.
- Empty directories are not created in advance. A category directory comes into being only with the first document in it.

### Write boundary

- The documentation workflow may write final documents exclusively into these four directories and their subfolders. When an established repository documentation structure took precedence over the prescribed standard structure, that approved structure replaces the four directories as the write boundary; it never widens it beyond the structure named in the doc plan.
- **Exception root `README.md`:** As the marketing entry point of the standard doc structure, the root `README.md` is a sanctioned write target of the documentation workflow and does not need to be named individually in every plan table for that. It is written exclusively in this marketing-entry-point role; if a root README already exists, it is not silently overwritten but the replacement is clarified with the user (analogous to the collision rule for existing target paths).
- Every **other** existing file outside these directories may only be changed if it is explicitly named in the `Affected files` table of the underlying plan file.

### Plan headers for documentation plans

Plan files with `**Empfohlener Workflow:** Documentation` or
`**Recommended workflow:** Documentation` additionally contain the matching two lines directly
under the workflow recommendation:

- German: `**Doku-Kategorie:** user-guide | developer-guide | operations | runbooks` and
  `**Ziel-Pfad:** docs/<category>/<topic-slug>.md`
- English: `**Doc category:** user-guide | developer-guide | operations | runbooks` and
  `**Target path:** docs/<category>/<topic-slug>.md`

Rules:

- Both lines must use the complete plan language and be written exactly as above, including bold
  formatting, colon, and lowercasing of the stable category value.
- The target-path line is always present and names the concrete path.
- When a category line is present, it must match the directory prefix in the target-path field, and
  the target path must point to a file within the matching category directory.
- Example: `**Doku-Kategorie:** runbooks` with `**Ziel-Pfad:** docs/runbooks/database/restart.md`,
  or the complete English equivalent.
- **Sanctioned omission of the category line:** The doc-category line is omitted exactly when the
  target lies outside the four `docs/` categories – the root `README.md` as the marketing entry
  point (target path `README.md`), an existing file explicitly named in the plan, in-code
  documentation, or a divergent established repository structure. In every other case the category
  line is required.

## Project conventions

If the project has an `AGENTS.md`, read it before analysis and implementation and follow its guidance for documentation style, file formats, examples, tests, validation and commits.

## Recommended skills

- `tech-docs`
- `codebase-improvement`
- `pr-review`

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
   0–2), never "on suspicion". Never load the alternative orchestrator `effective-workflow`
   inside Effective Flow: nesting it would create competing lifecycle and delivery owners.
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
   current-docs skill (e.g. `context7`) when needed instead of guessing from memory.
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

## Delegation contract

`tech-docs` is the declared domain owner for technical-documentation craft. It owns repository
and audience discovery, document-shape judgment, interface and migration accuracy, executable
examples, in-code documentation, and verification design. This tool owns the Effective Flow
entry point, optional standard categories, target-path and replacement approval, plan/report
state, worker selection, validation phase, worktrees, commits, and delivery.

When the skill is unavailable, use only a minimal repository-led fallback: derive facts from the
implementation and neighboring docs, follow the existing structure, write the narrow requested
change, and run an established docs check when one exists. Ask about or mark as an assumption
anything the implementation does not verify, and keep every example consistent with it. Do not
recreate a documentation handbook here or add tooling without approval.

A request for a repository-wide documentation audit, gap inventory, or prioritization is not this
tool's job: route it to `codebase-improvement`, or to `effective-flow review` when the user wants the
Effective Flow report artifact, and return here for the selected documentation work. A single
scoped documentation change is not an audit and must not trigger this route.

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
- In-code API documentation, inline comments, and CLI help texts: ``effective-flow-code-documenter``
- Technical check for generated artifacts, CLI help, build files or code files: ``effective-flow-code-validator``

The roles and the standard structure (marketing root README, user docs, technical docs) are described in `Doc categories` under "Prescribed standard doc structure"; they apply as the prose default as long as neither the user, the plan, nor an established repository documentation structure reported by the documentation owner specifies otherwise.

### Language/project awareness

Classify documentation targets per file/domain with the canonical “Project routing” contract.
Resolve and pass the target language once per delegate: root `README.md` and `docs/user-guide/**`
use `language.documentation.user`; `docs/developer-guide/**`, `docs/operations/**`,
`docs/runbooks/**`, standalone API docs, and ADRs use `language.documentation.technical`;
in-code documentation uses `language.source`; explicit changelog/release prose uses
`language.git`. Existing files keep their clear language unless translation was requested.
Preserve JSDoc/TSDoc for JS/TS and rustdoc plus existing Cargo documentation checks for Rust.
For other product languages, the documentation agents discover and follow the repository’s
established format; they do not invent conventions or add tooling. Mixed repositories retain
every specialized branch independently.

### Initial doc setup (scaffold mode)

An initial setup of the project documentation is not a separate tool but a mode of this workflow. It applies when (a) the assignment is explicitly "set up project documentation initially" **or** (b) no doc structure exists yet.

- In **one** run, create the three roles of the standard structure: ``effective-flow-marketing-writer`` for the root `README.md`, ``effective-flow-docs-writer`` for `docs/user-guide/README.md` (plus initial guides) and `docs/developer-guide/README.md`. Because both follow-up targets then exist, the conditional rule emits both links in the prescribed order.
- Choose the order so both follow-up targets exist before the root README applies the conditional rule (create the category entry points first or in the same run).
- If part of the structure already exists, scaffold only the missing parts and link the existing ones; existing files are not silently overwritten but handled via the replacement clarification.
- The scaffold mode uses the regular phases, the delivery/worktree setup, the goal-driven completion control and the commit gate of this workflow; **no** new top-level tool is created.

Current workflow for review-report backlinks: `effective-flow docs`.

**Load on demand:** Read `shared/review-report-backlinks.md`, when a review-report backlink is written or updated.

Current workflow for plan references: Documentation (`effective-flow docs`).

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

When an open plan for `effective-flow docs` is confirmed, it first passes through the
"clarification gate". If it does not pass the gate, refer according to the gate behavior to
`effective-flow plan` or `effective-flow review <planfile>` and end the workflow. If
the plan passes the gate:

- use the plan file's contents as the agreed documentation basis
- read the matching `**Doku-Kategorie:**` / `**Ziel-Pfad:**` or
  `**Doc category:**` / `**Target path:**` from the header area
- the target-path line is always required; the doc-category line is required only when the target lies inside the four `docs/` categories, since `Doc categories` sanctions its omission for the root `README.md`, an explicitly named existing file, in-code documentation, and a divergent established structure
- ask the user for the missing value only when a required line is absent or when a present category contradicts its target path, and add the lines in the plan file before implementation
- if the target path points to an existing file: clarify replacement or a new slug with the user before ``effective-flow-docs-writer`` starts

## Workflow

### Phase 1: Scope and analysis

1. Apply `tech-docs` to establish the audience, reader task, owning source of truth, narrowest
   documentation surface, connected references, and verification strategy. Check early whether
   this is an initial doc setup (see "Initial doc setup (scaffold mode)"); if so, follow that mode
   and create the three roles of the standard structure in a coordinated single run.
2. Determine the Effective Flow route and doc category per `Doc categories`:
   - User guide, developer guide, operations or runbooks
   - for the marketing entry point (root `README.md`) the category is omitted: it is not one of the four `docs/` categories, the target path is `README.md` and the implementation goes to ``effective-flow-marketing-writer``
   - for in-code documentation or for an existing file explicitly named in the plan outside the category directories, the category may be omitted; record this explicitly in the doc plan
   - when the owner reports an established repository documentation structure, that structure takes precedence per `Doc categories`: the category is omitted, and the divergent structure is named in the doc plan for the user's approval
3. Set the target path for the final document:
   - for category docs: `docs/<category>/<topic-slug>.md`
   - for the marketing entry point: `README.md`
   - for an established repository structure: the path that structure prescribes for this document
   - for category docs, check the uniqueness of the slug within the category; under an established repository structure, check uniqueness within that structure's own scope and keep its naming conventions
   - on collision (also for an already existing root `README.md`): clarify replacement, extension or an alternative slug with the user
4. Clarify open questions directly with the user when the audience, scope, target, or substantive statements cannot be reliably derived.
5. Create a short documentation plan from the owner's analysis:
   - audience
   - doc category and target path
   - affected files
   - planned content changes
   - validation strategy
6. Derive the explicit completion condition from the validation strategy and the planned changes (see "Goal-driven completion control"); it covers phases 2–4.
7. Obtain approval.

Ask the user: **Documentation plan approved?**
- Yes -- Approval granted, the workflow continues with Phase 2
- Adjust -- Enter feedback as free text

### Phase 2: Implementation

0. Per "Delivery and worktree integration", determine the effective delivery/worktree mode and
   its verified execution-location receipt, then run any applicable owned setup. Pass that
   receipt into phases 2–3 (implementation and validation); each write-capable boundary
   revalidates it and roots every operation there.
1. Ensure the target directory exists:
   - for target paths under `docs/user-guide/`, `docs/developer-guide/`, `docs/operations/` or `docs/runbooks/`, create missing directories before writing
   - do not create empty category directories if no file is written in them
2. Start the appropriate agent:
   - ``effective-flow-marketing-writer`` for the root `README.md` as the marketing entry point
   - ``effective-flow-docs-writer`` for category guides, category entry-point READMEs (e.g. `docs/user-guide/README.md`, `docs/developer-guide/README.md`), API/CLI docs, migration, changelog and skill documentation – **not** for the root marketing README
   - ``effective-flow-code-documenter`` for repository-native API/code documentation, inline comments and CLI help texts in code files
3. For clearly separated file and doc areas, both agents may run in parallel.
4. Give the agents:
   - the approved documentation plan including doc category and target path
   - relevant code/doc contexts
   - the accumulated wisdom insights
   - the note not to change product logic
   - the write boundary per `Doc categories`
   - the concrete resolved output language and locale; agents do not independently re-read config

### Phase 3: Validation

1. Have the active `tech-docs` owner verify the changed documentation against its owning
   implementation and examples, and return the exact evidence and remaining gaps. The owner designs
   the verification and judges the evidence; ``effective-flow-code-validator`` executes the established
   repository checks (step 4). Neither re-runs the other's work, and a check that neither can run
   is reported as an evidence gap rather than silently dropped.
2. Check Effective Flow's write paths:
   - all newly created or changed final documents lie within the category directories from `Doc categories`, within the approved established repository structure when that structure took precedence, are the root `README.md` as the marketing entry point, or an existing file explicitly named in the plan
   - for category docs, slugs follow the convention (kebab-case, no date or number prefix); a document in an approved established repository structure follows that structure's naming instead and is never renamed to satisfy the category convention
   - for user-guide changes, `docs/user-guide/README.md` is present as soon as content exists under `docs/user-guide/`
   - for developer-guide changes, `docs/developer-guide/README.md` is present as soon as content exists under `docs/developer-guide/`
3. For the root `README.md` as the marketing entry point, check:
   - it is written from the user's perspective (value proposition, no internal architecture details)
   - at the end of the run, its final documentation follow-up section satisfies the conditional
     rule from `Doc categories`, evaluated against the **effective** structure's two entry points:
     `docs/user-guide/README.md` and `docs/developer-guide/README.md` under the prescribed standard
     structure, or the established structure's user-facing and technical entry points when that
     structure took precedence. If both exist, the section has exactly those two links in
     user-facing then technical order; if exactly one exists, it has only that valid link; if
     neither exists, it has neither link. A link to a standard path that the effective structure
     does not have is a validation failure, not a permitted fallback
   - each missing target is reported individually as an open point in the workflow or agent
     result, never as a placeholder or broken README link; an entry point the effective structure
     does not define at all is reported by its role rather than by an invented path
   - existing unrelated README links are preserved and excluded from the final documentation
     follow-up-section invariant
4. Start ``effective-flow-code-validator`` when doc changes affect technical artifacts or the project build can plausibly check the change.
5. If errors are found: fix them or delegate again to the appropriate doc agent – per "Goal-driven completion control": bound the internal correction rounds and escalate to the user if validation still reports errors afterwards, instead of repeating indefinitely.

### Phase 4: Completion

1. If this change implemented a finding from an existing review-report file in `.effective-flow/review/`:
   - add a short implementation note as the last entry directly in the affected finding
   - begin the note with `✅` and name at least the date and workflow
2. If a plan file was used as the basis, without changing the status marker beforehand:
   - the status marker stays unchanged here (`**Planungsstatus:** Nicht umgesetzt` or `**Plan status:** Not implemented`): the status switch to `Umgesetzt`/`Implemented` and the archiving to `<plan.dir>/archive/` are handled by step 4 below at the delivery point per "Delivery and worktree integration" (exception: in-place without delivery, see there).
   - add `## Testergebnisse` or `## Test results`, matching the plan language, with the checks
     that were run
   - add `## Review-Befunde` or `## Review findings`, matching the plan language, and use
     corresponding prose for the no-findings case
3. Delete the wisdom file.
4. If delivery or worktree execution was active: perform the handback per "Delivery and worktree integration" (for a guided plan file including the plan status switch to `Umgesetzt`/`Implemented` and archive move to `<plan.dir>/archive/` at the delivery point, commit the changes, ownership-safe worktree cleanup if applicable, completion action `pr`/`merge`/`branch`, defer the checkout). Declare to that handback that this workflow supplies **no** complete finding set — it has no review phase at all — so an automatic PR review reviews the pull request itself. If the workflow exceptionally runs in-place without delivery, it performs the same status switch and archive move directly in the working tree.
5. Summarize:
   - changed documentation areas
   - checked sources
   - validation performed
   - residual risks
   - for an active delivery/worktree mode: delivery branch, final checkout state and result of the completion action (PR URL, merge or retained branch)
6. Emit the next-step block per `next-steps` as the last element of the report.

## Pre-commit gate

Before every commit, the checks configured in the project must pass without errors. Typical checks are type-checking, linting, and tests — use the scripts defined in the project (e.g. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm agent:check`).

- If a check reports errors: fix the errors first, then check again.
- Never commit code that does not pass these checks.
- This rule applies even when a separate verification phase exists — it is an additional safeguard, not a replacement.

**Load on demand:** Read `shared/commit-message-rules.md`, when a commit message or Conventional Commit title is written.

## Rules

- Do not change product logic.
- Documentation-adjacent code changes are only allowed if they are documentation themselves, for example comments, JSDoc/TSDoc or CLI help texts.
- Give the user a short status update after each phase.
