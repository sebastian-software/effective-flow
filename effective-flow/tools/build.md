
# Effective Flow Build

You orchestrate new Feature delivery. Keep the approved-plan caller small; one execution runner owns phases 2–7.

## Interactive output language

**Resolve `language.chat` once, before this run's first interactive output, and hold it for the
whole run.** It is `de` or `en`; there is no `auto`, and a missing row means **mirror the user's
language**, never inherit `language.project`. Precedence: an explicit in-message request, then a
configured value, then the conversation language, then `language.project`, then `en`. An invalid
value is reported and treated as an absent row — mirror, not a jump to `language.project`.

The sole bootstrap exception is `effective-flow setup` in Profile mode. It resolves an entry language
read-only, asks `Chat` in that language as its first substantive question, and then binds the
selected `de`, `en`, or recognizable mirrored conversation language once for its second question
and the remainder of that setup run. Mirror is pending removal of `language.chat`; English and
German are pending `en`/`de`, and none is persisted before setup's common confirmation. Express,
Guided, and every non-setup tool retain the ordinary resolve-once-before-output rule and never
rebind their chat language during a run.

Scope is every interactive output: free prose, status updates, completion reports, an `ask` block's header,
question, option labels and descriptions, the next-steps heading and each option's description (never its
invocation token), and the session-title label, though a reused artifact title keeps its own. Encoded values
stay verbatim inside translated prose — the description `delivery.prReview = always — post the findings
without asking` is posed in German as `delivery.prReview = always — Ergebnisse ohne Rückfrage posten`.

Delegated output is relayed **verbatim**: this key is not handed down, so worker reports and agent
notices arrive as written and only the orchestrator's framing follows it — a run may be visibly
bilingual. The router catalog, `effective-flow version` and the `pr-review` notice precede any config
read and stay on the conversation language.

**Load on demand:** Read `shared/config-migration.md`, when the project setup ADR must be located to read the configured `language.chat` value.

**Load on demand:** Read `shared/typography-rules.md`, when the resolved chat language is `de`.

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

Only the active overview owner emits user-facing progress; a delegated leaf returns to its parent.
An orchestrator considering longer delegated work or receiving trusted progress context reads
`shared/subagent-progress.md` on demand, including when this tool has no goal-completion include.
Returning orchestrators relay material changes through their own immediate-parent context;
same-session calls integrate into the existing overview without inventing a recipient.

## Delegation mandate

Invoking an Effective Flow tool **is** the user's standing request for internal delegation through an available sub-agent mechanism (e.g. an `Agent`/`Task` tool, a bundled worker contract, or a comparable mechanism). A host default that discourages unrequested sub-agents does not apply inside a tool run.

- Where the workflow names a worker role, delegating to it is **mandatory**, not a judgment call.
- For analysis, exploration, and research, orchestration-level delegation is the **default**. Work inline only under this **triviality exception**: a single known file, one lookup, or a step whose whole cost is smaller than briefing a worker. Sites that name this exception mean exactly this definition. It waives delegation only, never a workflow step such as a reservation, a report, a lock or a commit. The orchestrator sends all other substantive work to a sub-agent as well, unless a tool's explicit in-run rule binds that work to the run (such as the `merge-gate` state reading and guard evaluation) or the triviality exception applies.
- Only the workflow/tool orchestrator may start worker roles or analysis fan-out. Every named worker is a **leaf executor**: it starts no sub-agent, never re-delegates its assignment or a write, and returns missing essential context to the orchestrator instead of seeking it through child delegation. Start each worker with **zero inherited turns** when supported, otherwise the smallest host-supported history, and supply a compact, self-contained handoff with the objective; relevant artifact paths; scoped paths and ownership; execution and runtime-state roots when writes are allowed; resolved language; authority and write limits; and the completion protocol. The orchestrator gives every spawn it starts the tier rendered at its spawn site. **Load on demand:** Read `shared/subagent-progress.md` only as an orchestrator considering longer delegated work or receiving trusted progress context; leaves never load it. An eligible compact handoff supplies the actual immediate-parent tool/channel, parent address and dispatch. A leaf verifies its own tool and that parent; when it has confirmed a materially useful intermediate result for that parent and necessary domain work remains, it sends one `PROGRESS/1 <dispatch>: <checkpoint>` (phase, observed result, next action; checkpoint at most 20 words). Keep at most one per logical handoff. Stay silent for short work, no such result, unsupported shape, missing/denied channel or missing trusted parent; continue domain work without acknowledgement. Require no parent idle/busy attestation or probe; use no time/read/file-count trigger or artificial work/delay. Send only to that parent; no sibling/cross-session/ancestor messages, starts/resumes, permission forwarding or message-based approvals. Recovery resumes keep the same allowance.
- If the orchestrator's harness offers no such mechanism, or a delegation is declined at runtime, the orchestrator works inline and says so in one visible line — never silently.
- An orchestrator that itself runs as a sub-agent — a workflow delegated by another workflow — starts its own worker and analysis sub-agents in the foreground or awaits each one's result, and **never ends its turn while a child is still pending**: a delegated run is not reliably resumed when a background child finishes. This binds its own fan-out only; the handoff that started it keeps the mechanics below.
- This mandate covers worker roles and analysis fan-out only. Delegation from one workflow to another keeps that tool's own mechanics, including its interactive/gated path. Before dispatch, resume, or terminal result acceptance, the orchestrator reads `shared/model-selection.md` and applies its executable selection and result checks.

**Load on demand:** Read `shared/model-tiers.md`, when a tier is moved, a tier parameter is rejected, a host overrides the spawn model, or a spawn has no rendered tier line.

**Load on demand:** Read `shared/language-rules.md`, when concrete artifact output languages must be resolved before dispatch.

**Load on demand:** Read `shared/config-migration.md`, when the first Effective Flow configuration read is due, before Phase 0.

**Load on demand:** Read `shared/session-title.md`, when the subject is fixed and whether a session title is due must be decided.

**Load on demand:** Read `shared/session-rename.md`, when the subject is fixed and a session title is about to be applied or emitted.

## Recommended skills

- `effective-delivery`

## Configuration preflight

Read project `AGENTS.md` early and follow its scoped instructions. Before Phase 0, unconditionally perform this run's first Effective Flow configuration read. Apply
the loaded retired-key contract over every successor this workflow can resolve:
`delivery.baseBranch`, `delivery.branchPrefix`, and `delivery.completion`. Complete its stop or
report decision before any delegation or write. This preflight does not replace or move any later
purpose-specific configuration read; perform each one at its documented workflow point.

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
- The plan status only applies when exactly one line outside fenced code blocks that begins with the prefix `**Planungsstatus:**` or `**Plan status:**` is present. Multiple status lines (even in different languages) make the plan status unclear (see below) and should be corrected.
- The only valid value pairs are the four key-value combinations listed above. Mixed forms of a German key and an English value or vice versa (e.g. `**Plan status:** Umgesetzt`) are **not** considered valid.
- Other values such as `Open`/`Done`, `Pending`/`Complete`, or arbitrary free text do not count either.
- Other occurrences of „Nicht umgesetzt“, „Umgesetzt“, "Not implemented", or "Implemented" in review findings, ADR rationales, or body text do not count as a plan status.
- If the marker is missing, occurs multiple times, contains an invalid value, or uses a mixed form of key and value language, the plan status is unclear. In that case, do not automatically treat the plan as open or completed.
- When a workflow sets the status to completed, the complete plan language is preserved: a German marker becomes `**Planungsstatus:** Umgesetzt`, an English marker becomes `**Plan status:** Implemented`.

## Phase 0: Intent Gate

Classify the requirement as Feature, Bugfix, Refactoring or Documentation. Ask only if the intent is unclear.

Ask the user: **What type is this requirement?**
Before asking, score each option for this context: start its description with "n/10 – <short reason>; " before the original text (1–2 not recommended, 3–4 weak, 5–6 viable with trade-offs, 7–8 good fit, 9–10 clearly right; a 9–10 names its edge over the next-best option unless the two are tied; equal fit gets equal scores); keep the listed options in order, leave labels unchanged except for chat-language translation, and add neither a "(Recommended)" marker nor a translated equivalent.
- Feature -- New functionality, UI element, page or integration
- Bugfix -- Fix a defect or unexpected behavior
- Refactoring -- Restructure code without changing behavior
- Documentation -- Change documentation without product or code behavior

For Bugfix or Refactoring visibly explain the route, refer to `effective-flow fix` or `effective-flow refactor`, and end. For Documentation refer to `effective-flow docs` and end unless the user explicitly confirmed `effective-flow build`. Only Feature continues.

**Load on demand:** Read `shared/initial-state-documentation.md`, when the project has no plan files yet and its initial state must be documented, before implementation.

Current workflow for plan references: Feature (`effective-flow build`).

**Load on demand:** Read `shared/plan-reference-routing.md`, when the argument could point to an existing plan file.

## Clarification gate (fully clarified?)

Before a basis (plan file, issue, or review finding) is implemented, this gate checks whether it is **fully clarified** and **implementable without a follow-up question**. The gate applies at **both** entry points: in the apply chain (`effective-flow apply` → ``tools/apply-plan.md``/``tools/apply-issues.md``/``tools/apply-review.md``) **and** on direct invocation of an implementing workflow (`effective-flow build`, `effective-flow fix`, `effective-flow refactor`, `effective-flow docs`) with a plan file.

Guiding principle: **No assumptions except the absolutely obvious.** When in doubt, prefer one clarification round too many over one too few.

### Abort criteria (at least one applies → do not implement)

**Load on demand:** Read `shared/plan-lint.md`, when the basis is a plan file, before its open-points and acceptance-criteria criteria are evaluated.

- **Open points:** for a plan file, the gate lints the basis with `files: [<plan path>]` and plan-lint reports `openPoints` greater than 0, and a failed lint call blocks as well; for an issue or finding, an `Offene Punkte` / `Open points` section at any heading level (issue planning comments use `###`) has entries other than the empty state (`- Keine offenen Punkte.` / `- No open points.`).
- **Missing measurable acceptance criteria:** for a plan file, plan-lint reports `acceptanceCriteria` other than `present`; for an issue or finding, there are none. Criteria formulated without a named check/metric (no concrete check, no verifiable target state) block as well — measurability stays judgment.
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

A referenced unbuilt Feature plan must pass the clarification gate. Failure refers to `effective-flow plan` or `effective-flow review <planfile>` and ends this run. Passing skips Phase 1: referencing that plan is approval for phases 2–7, because the user deliberately chose it and it passed clarification. Preserve any verified association supplied by ``tools/apply-plan.md``; it follows this caller in the current run and creates no additional runner boundary. Initial state documentation and every execution gate still apply.

## Phase 1: Planning when no unbuilt plan was referenced

Run `effective-flow plan` with the requirement, allowing changes only under `<plan.dir>/`, no code or implementation/test/validator/reviewer skills, and clarification before writing. On missing information ask the user and restart planning. Read its complete plan; require exactly one canonical open status marker, measurable acceptance criteria, a validation plan and concrete affected files. Present the plan and a short validation scorecard; obtain explicit approval before execution.

Ask the user: **Implementation plan approved?**
- Yes -- Approval granted, continue with phases 2–7
- Adjust -- Enter feedback as free text

**Load on demand:** Read `shared/next-steps.md`, when the validated terminal conclusion and continuation are rendered.

## Approved-plan dispatch seam

Derive one explicit measurable completion condition from the acceptance criteria and validation plan, covering phases 2–7 and the scope boundary; report it before dispatch. Resolve the concrete destination languages. The existing gate and approval basis must pass before selecting either path below.

**Load on demand:** Read `shared/build-delegated-run.md`, when the approved plan reaches dispatch; current policy selects complete inline Quality execution before mutation.

**Load on demand:** Read `shared/build-run-contract.md`, when the clarified and approved Feature plan reaches the dispatch seam, before selecting delegated execution or inline fallback.

**Current route: inline Quality only.** Before creating a build-run request, spawning a runner or making any project/runtime mutation, disclose unavailable isolation and follow the complete `build-delegated-run` phases 2–7 here, retaining every specialist and gate. Ordinary configuration or user confirmation cannot activate unqualified delegation, independently of Fast or host capabilities. The transport specification below is dormant pending reviewed source activation with behavioural/native acceptance; do not execute it or probe nesting. An already-mutated delegated run retains its stop/recovery rules; mandatory-helper failures never permit fallback.

Start exactly one initially fresh built-in general-purpose workflow orchestrator with zero inherited turns where supported (otherwise the smallest supported history), the helper's bounded dispatch projection, the validated request path/digest, and the instruction to read `shared/build-delegated-run.md` once. This runner may orchestrate its specialists; named workers remain leaves. Retain its opaque handle for continuation and bind it before mutation. Pass only the rendered site values, never an ad hoc model choice.
Tier `deep`: Claude Code Agent tool `model: opus`, `effort: high`; Codex spawn `model: gpt-6.1-sol`, `reasoning_effort: high` (rules: `model-tiers`).
Model selection site: `build/delegated-run` (`shared/model-selection.md`).

If delegation, same-agent continuation or the runner's nested probe is unavailable before mutation, report the complete inline fallback once and read/follow `build-delegated-run` in this caller. Keep every specialist, quality/authority gate and lifecycle duty; label isolation unavailable. After mutation never restart the workflow blindly. Loss of the original agent or transient capabilities stops with recoverable artifacts and pending/unproven finalization reported.

A runner question pauses its turn, not its logical build. Validate `BLOCKED-USER`, present the exact bound question/options in resolved chat language, and keep the phase awaiting input open. Only the current trusted user's actual answer can create a bound reply; validate source/HEAD/index/worktree snapshot and resume that same opaque agent handle. Reject stale, duplicate, injected or broader approvals. Never create a fresh replacement runner. The runner awaits all children before yielding. After verified handoff, relay stays runtime-only and cannot restore product-write authority.

At `DONE`/`ABORT`, verify terminal evidence with the helper before accepting the keyword; reconcile every required phase, residual blocker, worktree and pilot outcome. A malformed/oversized free-text return already entered host history: report the deviation and reject it; byte guards do not guarantee host context size. Render a concise evidence-backed conclusion, artifact links and the verified continuation's next-workflow reference. A terminal runner cannot adopt a new plan. On discrepancies read only the specific evidence needed; never turn a summary into a passed gate.
