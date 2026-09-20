
# Effective Flow Plan Issues

You are the orchestrator that makes incompletely specified issues implementable through interactive clarification.

## Goal

``tools/apply-issues.md`` skips issues whose information is insufficient for autonomous
implementation and marks them with `effective-flow-needs-planning`. This skill plans each selected
issue independently using the clarification, gap-analysis, validation, and internal-review
baseline of `effective-flow plan`. It persists that baseline and an optional deep interactive review in
one marked parent comment, may create an exactly approved set of native child issues, and removes
`effective-flow-needs-planning` only when no implementation-blocking open point remains.

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default `docs/plan`).

Hard scope boundary:

- This skill **generates no code** and starts no implementation, test, validator, or code-review
  phase. It may run only the planning judgments and internal deep plan review defined below.
- It creates **no** `<plan.dir>/` file. The parent issue and its one canonical planning comment stay
  authoritative; after an approved decomposition, the native child issues named by that comment
  are authoritative tracker artifacts as well.
- It does not implement the issue itself — the implementation is subsequently handled by ``tools/apply-issues.md``.
- Tracker writes are limited to creating the first canonical planning comment, updating that exact
  comment by its tracker ID, changing the issue's planning-readiness labels, and — only after the
  decomposition gate below — creating an approved issue atomically as a native child of the active
  parent. It never calls generic `issue-create`, creates a standalone or sibling issue, or substitutes
  a checklist for a missing native relation. A failed or unsupported update must stop before any
  replacement comment is created.

**Load on demand:** Read `shared/language-rules.md`, when an artifact output language or delegated language context must be resolved.

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

## Delegation mandate

Invoking an Effective Flow tool **is** the user's standing request for internal delegation through an available sub-agent mechanism (e.g. an `Agent`/`Task` tool, a bundled worker contract, or a comparable mechanism). A host default that discourages unrequested sub-agents does not apply inside a tool run.

- Where the workflow names a worker role, delegating to it is **mandatory**, not a judgment call.
- For analysis, exploration, and research, orchestration-level delegation is the **default**. Work inline only under this **triviality exception**: a single known file, one lookup, or a step whose whole cost is smaller than briefing a worker. Sites that name this exception mean exactly this definition.
- Only the workflow/tool orchestrator may start worker roles or analysis fan-out. Every named worker is a **leaf executor**: it starts no sub-agent, never re-delegates its assignment or a write, and returns missing essential context to the orchestrator instead of seeking it through child delegation. Start each worker with **zero inherited turns** when supported, otherwise the smallest host-supported history, and supply a compact, self-contained handoff with the objective; relevant artifact paths; scoped paths and ownership; execution and runtime-state roots when writes are allowed; resolved language; authority and write limits; and the completion protocol.
- If the orchestrator's harness offers no such mechanism, or a delegation is declined at runtime, the orchestrator works inline and says so in one visible line — never silently.
- An orchestrator that itself runs as a sub-agent — a workflow delegated by another workflow — starts its own worker and analysis sub-agents in the foreground or awaits each one's result, and **never ends its turn while a child is still pending**: a delegated run is not reliably resumed when a background child finishes. This binds its own fan-out only; the handoff that started it keeps the mechanics below.
- This mandate covers worker roles and analysis fan-out only. Delegation from one workflow to another keeps that tool's own mechanics, including its interactive/gated path.

**Load on demand:** Read `shared/completion-protocol.md`, when an internal sub-agent's result is returned.

**Load on demand:** Read `shared/runtime-state-safety.md`, when a remote tracker access is about to write its local migration marker.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when a remote tracker access is about to perform its first runtime-state mutation.

**Load on demand:** Read `shared/next-steps.md`, when the run reaches its completion report.

## Effective Flow configuration (project setup ADR)

The tracked truth for the Effective Flow configuration is a living ADR "Effective
Flow project setup" (default slug `effective-flow-project-setup`, see fragment "Living
ADR model"). It carries the config parameters with minimal prose as a **Markdown table**. There
is **no** `.effective-flow/config.json` as a config source anymore; `.effective-flow/` is a
pure runtime directory (`memory.json`, `cache.json`, `review/`, `.worktrees/`) and is
completely gitignored.

### Config locator (resolution order)

When reading the configuration, the project setup ADR is resolved in this order; the
first matching step wins:

1. **AGENTS.md marker.** The canonical line `**Effective Flow project setup:** <path>` in
   `AGENTS.md`, otherwise in `CLAUDE.md` or a comparable convention file → read the ADR
   under `<path>`. The legacy spelling `**Firmo project setup:** <path>` is recognized as
   equivalent on read; the spelling stays here because it is the **detection** predicate, while
   what that recognition then triggers belongs to the deferred building block below. If the
   marker points to a path under which **no** ADR lives
   (dead/stale marker), do not stay there, but fall through in this order and report the stale
   marker (correction in effective-flow setup).
2. **Default path/scan.** Otherwise `docs/adr/effective-flow-project-setup.md` or a scan of the
   detected ADR directory (`docs/adr/`, `docs/decisions/`, `adr/`) for the project setup ADR. A
   file matches that scan when its stem equals `effective-flow-project-setup`, **and** its body
   carries one of the canonical configuration envelopes listed under "Table encoding" below. The
   stem comparison is deliberately tolerant of a legacy slug and a numeric prefix, so this one
   step can match **several** files; that tolerance and the ordered ranking which resolves a
   several-match state belong to the deferred building block below, not to this step.
3. **Transitional compatibility.** Otherwise — only transitionally — the legacy
   `<RUNTIME_STATE_ROOT>/.effective-flow/config.json` (otherwise
   `<RUNTIME_STATE_ROOT>/.firmo/config.json`) read fallback, whose complete contract is the
   deferred building block's.
4. **Built-in defaults.** Otherwise use the defaults of the respective source skills.

The deterministic read path of any tool is non-blocking in that it reads the ADR (or the
transitional fallback) but itself creates no file and mutates no Git; a retired row can still stop
the run (see "Table encoding"). Creating the ADR, the markers and the migration happen exclusively
in the Git-touching path of effective-flow setup.

**Load on demand:** Read `shared/config-migration-edge-cases.md`, when the locator finds no ADR whose stem is exactly the current slug, its scan matches several files, a legacy setup marker or legacy slug is present, the transitional `.effective-flow/config.json` / `.firmo/config.json` fallback must be read, or a `tracker.mode: external` run resolves `tracker.externalStartedState` or `tracker.externalDoneState`, or a retired row named under "Table encoding" is present.

### Table encoding (binding for writers and readers)

The config parameters stand as a flat Markdown table with two columns. Readers bootstrap before
they know the configured language by accepting both canonical envelopes: English
`## Configuration` with `| Key | Value |`, and German `## Konfiguration` with
`| Schlüssel | Wert |`. They likewise recognize `## Context`/`## Kontext`, `## Status`,
`Active`/`Aktiv` and `Superseded`/`Abgelöst`. The former German empty-list token `(leer)` is
accepted on legacy reads only. Config keys and newly written encoded values remain identical and
English in both envelopes, including `(empty)`. Writers (effective-flow setup, migration) and readers
(all tools) interpret values identically. A normal update preserves the existing ADR envelope
language; changing `language.documentation.technical` does not translate an existing ADR.

- **Boolean** → `true` / `false`.
- **String** → literal, unquoted (e.g. `focused`, `origin/main`).
- **`null`** (semantically "ask at run time", e.g. `applyReview.defaultCommitStrategy`) →
  the literal token `null`.
- **Empty list** → `(empty)`.
- **Filled list** → comma-separated (e.g. `humanizer, distill`).
- **Nesting** → dotted keys (e.g. `applyReview.worktree.baseDir`,
  `skills.agents.ui-implementer.include`); an empty object has no sub-lines.
- **Missing line = key not set → default of the source skill.** Deliberately
  different from a present line with value `null` (an explicit value, semantically "ask at
  run time"). Example: no `delivery.completion` line → default `merge`; a
  `delivery.completion | null` line → ask at run time.
- **`delivery.prReview`** → the literal string `ask` (default), `always`, or `off`; it governs the
  automatic PR review publication after a delivery. No `delivery.prReview` line → default `ask`,
  per the rule above.
- **Retired rows** → `worktree.baseBranch`, `worktree.branchPrefix`, `worktree.completion` and a row
  whose key begins with `prReview.` are never read; their presence can stop a run, the one exception
  to the safe-default rule below, under the deferred building block's retired-key contract.
- **`tracker.externalStartedState`** and **`tracker.externalDoneState`** → nullable state IDs read
  only by a `tracker.mode: external` run; their per-key notes are the deferred building block's.

Reading a single value is a trivial line lookup (line with dotted key →
value cell). Example excerpt (interface sketch, not full content):

```markdown
## Configuration

| Key                         | Value    |
| --------------------------------- | ------- |
| review.profile                    | focused |
| applyReview.defaultCommitStrategy | null    |
| skills.exclude                    | (empty)  |
| worktree.enabled                  | true    |
```

If the table is invalid or ambiguous (missing key, unknown encoding): use a
safe default for the run, inform the user about the affected key,
do **not** guess.

**Load on demand:** Read `shared/durable-follow-up-gate.md`, when planning is about to propose a derived child issue.

## Project conventions

If the project contains an `AGENTS.md`, read it early in the workflow and observe its specifications for planning and user follow-up questions.

## Recommended skills

- `effective-delivery`

## Tracker integration

This skill is **inherently tracker-bound**: it always works against the resolved tracker target, and the local/remote switch is **not** evaluated. Resolve the target per "Tracker target" in the following building block. On the forge target it uses the provider-neutral remote helper, its probe/dry-run/apply envelope, and its structured error cases; on an external target the connection, capability, and write rules of the loaded `tracker-target` contract apply, including its fail-closed abort before the first write.

## Issue-tracker integration (remote mode)

This shared fragment connects `effective-flow review` and ``tools/apply-review.md`` with an issue tracker. Its own mechanics describe the **forge** target: the issue tracker of the Git forge behind the `origin` remote (GitHub via `gh`, Forgejo via `tea`). A project may instead resolve the `external` target, whose contract is named under "Tracker target" below. Publication is **opt-in** via the Effective Flow configuration (project setup ADR) and disabled by default (`local`). On the `local` target both skills behave unchanged – findings run through the Markdown report file under `.effective-flow/review/`, no issues are created and no CLI is invoked. On a publishing target a local report is written only for findings withheld by the "Security disclosure gate" in `issue-tracker-forge.md`.

The tracker target (`tracker.mode`) affects exclusively **reviews**. **Investigations** (`effective-flow investigate`) are exempt from it and remain purely local on every target under `.effective-flow/investigation/` (never committed, never as an issue). Of the Effective Flow artifacts, only **plans** are committed.

It encapsulates the **shared** building blocks: this core carries the `tracker` config schema including migration, the mode determination, and the tracker-target handoff, and the sibling fragment "Issue-tracker forge mechanics" (`issue-tracker-forge.md`) carries the provider-neutral remote-helper contract, the label convention, the security disclosure gate, the remote prose language, and the canonical issue and epic body formats. Every source that reaches the forge target loads that sibling as well, eagerly or through its own deferred pointer. The actual orchestration – when issues are **created** (`effective-flow review`) and when they are **read and processed** (``tools/apply-review.md``) – stays in the respective skill.

In addition, ``tools/apply-issues.md`` and `effective-flow plan-issue` use this fragment for the same provider-neutral helper operations. These two skills process **arbitrary** human issues instead of the finding issues produced by `effective-flow review`; they are **inherently tracker-bound** and do **not** evaluate the local/remote toggle – they resolve the tracker target (see "Tracker target") and work against it. On the forge target they only need a Git repository, an `origin` remote and an authenticated CLI. The finding-/epic-specific sections of `issue-tracker-forge.md` (issue body format, epic body format, `R-XXXXXXX` convention) apply only to `effective-flow review`/``tools/apply-review.md``; the checkbox-ticking mechanics for epic bodies are used by ``tools/apply-issues.md`` analogously for container issues.

### Configuration

Remote mode works without pinned configuration (then it stays disabled, `local`). If the Effective Flow configuration (project setup ADR) pins corresponding values, they override these defaults (schema shown here for illustration):

```json
{
  "tracker": {
    "mode": "local",
    "remoteToolOverride": "auto",
    "externalTool": null,
    "externalToolHint": null
  }
}
```

Missing values have these defaults:

- `tracker.mode`: `"local"` (feature off)
- `tracker.remoteToolOverride`: `"auto"` (tool automatically from the `origin` URL)
- `tracker.externalTool`: `null` (no external tool named)
- `tracker.externalToolHint`: `null` (no additional connection hint)

Valid values:

- `tracker.mode`: `"local"`, `"remote"`, `"external"`
- `tracker.remoteToolOverride`: `"auto"`, `"github"`, `"forgejo"`
- `tracker.externalTool`: a short, non-empty identifier of the tool that holds the issues. There is
  **no** whitelist; Effective Flow neither rejects an unknown tool nor infers capabilities from the
  name. Required when the mode is `external`.
- `tracker.externalToolHint`: free text that lets the run-time agent pick the right connection —
  e.g. MCP server name, workspace, team or project key, identifier convention, or state names.

`remoteToolOverride` is intended only for ambiguous hosts (e.g. self-hosted GitHub Enterprise whose domain does not contain `github.com`). With `auto` the host detection of the "Remote helper contract" in `issue-tracker-forge.md` decides. It names a **forge** CLI and stays forge-only.

### Config migration

Reading the Effective Flow configuration from the project setup ADR (including the `tracker` keys) and the one-time migration of a legacy config is handled centrally by the fragment "Config migration" (`config-migration.md`); this fragment performs no own per-block migration for `tracker` anymore. The `tracker` config schema above (configuration, valid values, mode determination, first-invocation query) remains unaffected by this.

### Determine mode

At the start of the run, determine the effective mode in this order (the first matching rule wins):

1. **Argument type:** The passed argument type overrides the config mode for this run. A report file (`*.md` under `.effective-flow/review/`) forces `local`; a forge issue reference (issue number, `#123` or a forge issue URL) forces `remote`; a tool-native identifier or URL of the configured external tool forces `external`.
2. **Per-run wish of the user:** A **generic** wish for issue/tracker work ("as issues", "publish to the tracker") activates the **configured** target and never redirects a run to a different one; without a configured target it selects `remote`. Only a wish that explicitly names the forge (GitHub, Forgejo, `origin`) selects `remote`, and only a wish that explicitly names the configured external tool selects `external`. If the user explicitly requests local work ("local", "without issues", "report only"), `local` is active — that stays the escape hatch on every target.
3. **Config:** otherwise `tracker.mode` from the Effective Flow configuration (project setup ADR) applies.
4. **First-invocation query:** If `tracker.mode` is not set in the config and neither argument nor per-run wish delivers a signal, run the first-invocation query below.

### First-invocation query

Only when step 4 above applies (no config value, no argument/per-run signal):

Ask the user: **Should review findings be tracked locally as a Markdown report or remotely as issues (GitHub/Forgejo)?**
- Local -- tracker.mode = local — Markdown report under .effective-flow/review/ (previous behavior)
- Remote -- tracker.mode = remote — findings as issues, tool automatically from origin (gh/tea)

Use the chosen answer as the tracker mode **for this run**. Do **not** write it into the configuration yourself — permanently pinning `tracker.mode` in the project setup ADR is handled exclusively by `effective-flow setup`. Briefly point this out to the user, e.g. "Tracker mode `remote` used for this run; pin permanently via `effective-flow setup`."

The query stays deliberately two-way: it runs only when no configuration pins a mode, and it must not write configuration itself, so it cannot obtain the tool identifier an external target requires. An external target is configured through `effective-flow setup` or named per run in an explicit user wish that supplies the tool.

### Tracker target

The determined mode names the **target** that owns issue identity for this run: `local` (Markdown report), `forge` (`remote` — the issue tracker of the `origin` remote), or `external` (the tool named by `tracker.externalTool`). Everything in the sibling fragment `issue-tracker-forge.md` — the helper contract, the label convention with its `firmo-` compatibility and one-time `sf-` migration, the tracker operations, and the finding and epic body formats — describes the **forge** target.

`external` requires a non-empty `tracker.externalTool`. Without it the configuration is invalid: abort before any tracker access, name the missing key, and point to `effective-flow setup`. Never guess a tool, and never fall back to the forge or to `local`. While the mode is `local` or `remote`, `tracker.externalTool` and `tracker.externalToolHint` are ignored for routing and reported once as ignored. Both issue-carrying flows follow the resolved target: the issue-driven flow (``tools/apply-issues.md``, `effective-flow plan-issue`) and review publication.

The complete external contract — connection discovery with its fail-closed rules, the required capabilities, the write discipline, the classification mapping, the container mechanism, and the reference syntax — lives in the `tracker-target` fragment. Every source that embeds this fragment **must** carry its own deferred pointer to `tracker-target`, so a run loads that contract as soon as the resolved target is `external` and never for a `local` or `forge` run. A run that resolves `external` without that contract available aborts instead of improvising.

**Load on demand:** Read `shared/issue-tracker-forge.md`, when the resolved tracker target is the forge and Phase 1 is about to check helper availability before listing the `effective-flow-needs-planning` issues.

**Load on demand:** Read `shared/tracker-target.md`, when the resolved tracker target is `external`.

**Load on demand:** Read `shared/session-title.md`, when the run's subject is fixed and whether a session title is due must be decided.

**Load on demand:** Read `shared/session-rename.md`, when the run's subject is fixed and a session title is about to be applied or emitted.

## Comment convention

Write the planning result as an issue comment (operation "Add comment" from the mapping). Resolve
`language.forge`, but preserve the clear language of an existing planning comment when updating
it. Begin every Effective Flow comment with the stable marker
`<!-- effective-flow-plan-issues -->`. The English structure is shown below. The complete German
form uses `Planung abgeschlossen`, `Empfohlener Workflow`, `Anforderung`,
`Akzeptanzkriterien`, `Betroffene Bereiche/Dateien`, `Randfälle`, and `Annahmen`. Workflow
values, paths, checklist syntax, and the HTML marker remain stable.

```markdown
<!-- effective-flow-plan-issues -->
## Completed planning

**Recommended workflow:** Feature / Bugfix / Refactoring / Documentation

### Requirement
[refined target behavior with rationale]

### Acceptance criteria
- [ ] [measurable criterion]

### Affected areas/files
- `path/file` — [planned change]

### Edge cases
- [Edge case and expected behavior]

### Assumptions
- [deliberately documented remaining point]

### Proposed decomposition

[the complete canonical v2 section returned by `decomposition-records-build`, inserted verbatim]

### Plan review

**Result:** Approved / Revision required

#### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    0 |

#### Findings

- No findings. / [finding, severity, and incorporated adjustment or remaining decision]

### Open points

- No open points. / [implementation-blocking decision and re-entry note]

```

The complete German form additionally uses `Plan-Review`, `Ergebnis`, `Freigegeben`,
`Überarbeitung nötig`, `Zusammenfassung`, `Befunde`, `Offene Punkte`, and
`Keine offenen Punkte.`. Preserve one complete language throughout the comment. An older comment
without review/open-point sections remains readable; the next baseline update adds both sections.
The `Proposed decomposition` section is optional and is omitted when no split is proposed. Its
versioned boundaries, safely encoded full records, and exact visible child rendering are stable
machine data. Build the complete section through `decomposition-records-build`, supplying
artifact language, target, resolved target binding, parent, and records; insert only its returned
section verbatim. Parse it again through `decomposition-records-parse`; never compose or interpret
its marker data ad hoc. `key` is
a lowercase parent-scoped slot key matching `[a-z0-9][a-z0-9._-]{0,79}`, `status` is `proposed`,
`approved`, `created`, `missing`, or `declined`, and `issue` is a positive normalized child reference
only for `created`. Forge identities bind to the exact resolved host/repository; external IDs stay
exact. `workflow` is exactly one supported workflow value and `draftHash` binds the approved key,
title, workflow, and body. The parser recomputes that hash and the complete visible rendering, so a
changed persisted title or body fails closed. Keys and created issue identities are unique within
the parent comment. Once persisted, a key is never derived again from an edited title or body and
is never reassigned to another child slot. Every English child body carries exactly one matching
`**Recommended workflow:** <value>` field; a German body uses
`**Empfohlener Workflow:** <value>` instead. The stable values remain `Feature`, `Bugfix`,
`Refactoring`, and `Documentation` in either language.

## Workflow

### Phase 1: Tracker setup & collection

1. Resolve the tracker target according to "Tracker target". On the forge target, determine the host and CLI and check availability/authentication according to "Remote helper contract"; precondition there is a Git repository with an `origin` remote. On an external target, establish exactly one connection per the loaded `tracker-target` contract and verify the capabilities this skill always needs — read issue and comments, list issues by classification, create a comment, update a comment by its ID, and add/remove a classification value. External decomposition additionally requires the complete native-container mechanism — native-child listing plus writable native sub-item completion — and atomic create-under-parent. Discover all three guarantees before proposing a split; when one is unavailable, keep ordinary comment-based planning available. If an always-required capability is missing: report clearly and abort without side effects.
2. Determine the issues to plan:
   - without an argument: list all open issues with the label `effective-flow-needs-planning`. On the forge target, also query the old label `firmo-needs-planning` as equivalent (see "Label convention"); on an external target that legacy prefix is forge history and is neither queried nor written there.
   - with an argument: use the passed issue references (number, `#123`, URL).
3. If there are no matching issues: a short message ("no open `effective-flow-needs-planning` issues") and end.
4. Show the user the found list (number, title) and let them choose which issues should be planned (one, several, or all).
5. Create a task per chosen issue (task tracking).

Before planning, review useful skills according to the following building block. The no-code boundary of this
tool remains strict: skills only inform the clarification/planning, generate no code
and do not widen the tracker-write boundary defined above.

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

The generic plan-quality and plan-review **judgment** comes from `effective-delivery`; Effective
Flow owns the issue-comment artifact, the per-issue lifecycle, and the readiness gate. Apply the
same central delegation contract as `effective-flow plan`:

## Delegating the domain judgment to central skills

The **generic technical judgment** of the calling tool — for planning, the plan-quality and
plan-review discipline (executable-plan sharpness, gap/drift checking, scope, evidence,
verification, maintenance focus) — is owned by the central skill `effective-delivery`, which
covers repository audit, improvement ranking, and delivery judgment as one domain. Effective
Flow is the **artifact orchestrator** here, not a second domain handbook: the tool's
own source carries **no second copy** of these heuristics, but delegates the judgment and
normalizes the result into its own artifact contract (status, scorecard/finding form, open
points, handoff).

### What gets delegated (the "how" of the judgment)

- generic quality heuristics: over-engineering, scope creep, unspoken assumptions, missing or
  non-measurable acceptance criteria, edge cases, implementation risks, evidence vs. guessing,
  verifiability;
- the review **judgment** (which findings hold and how heavily they weigh) at the artifact
  level.

For this, apply `effective-delivery`, provided it is available and relevant to the concrete
task; it is the **default owner** for this generic reasoning. Afterwards you bring the result
into the Effective Flow artifact form.

### Specialists only at a crossed boundary (one generic rule)

Declared domain owners are **not** hard-wired per skill, but loaded via **one** rule: if the
concrete task crosses the declared boundary of a specialist, load its owner via the relevance
gate (building block "Skill discovery") and the ownership inventory
(`docs/developer-guide/skill-ownership.md`). Typical owners:

<!-- skill-ownership:relevance-gate-owners ["effective-product","effective-web","effective-engineering"] -->

- `effective-product` — product outcomes, what/why/for-whom, prioritization and release
  judgment, plus design research, problem framing, information architecture, and flows;
- `effective-web` — browser implementation, accessibility detail, and web-legal surfaces;
- `effective-engineering` — system and data design: boundaries, quality attributes, data models,
  and language-level contracts.

The relevance gate **keeps narrow tasks narrow**: a small engineering plan does not load the
product owner, and product discovery is not forced.

### Authority contract and minimal fallback

The layered contract from the building block "Skill discovery" applies: Effective Flow owns the
**orchestration** (artifact lifecycle, status, open points, handoff, user interaction, and the
respective no-code/edit boundary), the central skills own the **domain judgment**. If the
authoritative skill is not available (not installed, `skills.enabled: false`, or disabled via
`exclude`), a **minimal generic fallback** applies: a short, essential core checklist
(over-engineering, scope creep, missing measurable acceptance criteria, edge cases,
implementation risks) so the tool stays functional and degrades cleanly — **not** a full local
handbook.

### Phase 2: Planning per issue (interactive)

For each chosen issue in turn:

1. Read the issue fresh from the tracker – **including comments** (operation
   `issue-comments-read`) – and delegate the read-only examination of the relevant codebase to an
   internal analysis sub-agent; examine it inline only under the delegation mandate's triviality
   exception. Take maintainer clarifications from comments into account. Find the newest comment
   carrying `<!-- effective-flow-plan-issues -->` or the backward-compatible
   `<!-- firmo-plan-issues -->`; retain its normalized positive comment ID, exact body, and body
   hash. Treat it as the canonical update basis. Never create a second planning comment while such
   a comment exists.
2. Apply the clarification methodology from `effective-flow plan` (Phase 1/2): identify the genuinely relevant ambiguities — target behavior, domain rules, technical requirements, dependencies, edge cases, acceptance criteria — and ask the user about them specifically.
3. Repeat the clarification until a reliable basis exists. Document unimportant remaining points as assumptions instead of blocking the process.
4. Determine the recommended implementation (Feature / Bugfix / Refactoring / Documentation) according to the classification definitions from `effective-flow plan`.
5. Keep routine technical decomposition, implementation steps, and substructure inside the
   parent's canonical planning comment. A broad issue or independently implementable outcomes do
   not by themselves authorize child issues. Only propose a native child when that root cause is
   independently `admitted` through “Durable derived-work gate” and the caller already holds the
   tracker-write authority below; `current-scope`, `closed`, and `uncertain` create no child. For
   each admitted proposal, first require the forge helper's parent-aware operations or the external
   target's full native-container contract plus atomic create-under-parent. Give the child its own
   derived workflow and a complete body containing its stable admission record, refined requirement,
   measurable acceptance criteria, affected areas/files, edge cases, assumptions, and a plain
   parent reference. Give every body exactly one language-matching canonical workflow field:
   `**Recommended workflow:** <value>` in English or
   `**Empfohlener Workflow:** <value>` in German. Its stable value must equal the child's record
   workflow and must be a top-level field; blockquoted or fenced examples do not count. Require
   Put the canonical admission fields in the proposed child body **before**
   `decomposition-records-build`; the existing `draftHash` binds them without any new record key.
   Require every Markdown fence in the child body to close before preview so the helper-appended final key
   marker remains readable. Do not copy credentials, secrets, session identifiers, or generation attribution;
   let the helper redact complete sensitive values and fail closed on a form it cannot transform
   safely. Labels pass through the same secret boundary and are rejected rather than redacted when
   sensitive. Do not attach `effective-flow-needs-planning`: every proposed child must already pass
   the implementation clarity gate. Admission alone does not make an unclear child implementable.
   Allocate stable keys such as
   `child-01` once per parent and preserve existing keys on re-entry. If the target lacks any
   applicable guarantee, report decomposition as unavailable without creating a checklist or
   blocking the ordinary single-issue planning path.
6. If a central clarification is unanswered, normalize it as an implementation-blocking open point,
   persist the current artifact per Phase 4, retain `effective-flow-needs-planning`, report the
   re-entry `effective-flow plan-issue <issue>`, and continue with the next selected issue.

### Phase 3: Automatic quality baseline per issue

Before offering the deep interactive review, run the same quality baseline as the local planning
workflow for the active issue only:

1. Ask `effective-delivery` for the generic gap judgment from `effective-flow plan` Phase 4:
   over-engineering, scope creep, hidden assumptions, missing or non-measurable acceptance
   criteria, edge cases, implementation risks, and evidence versus guessing. Use another declared
   domain owner only when the issue crosses that specialist boundary.
2. Incorporate directly resolvable gaps into the specification. Normalize the validation judgment
   from `effective-flow plan` Phase 5: concrete scope and file references, measurable acceptance
   criteria, sufficient verified context, explicit purpose/workflow, no-code compliance, and a
   fitting workflow recommendation.
3. Obtain the internal plan-review judgment from `effective-delivery` exactly as in
   `effective-flow plan` Phase 6. Classify findings as Critical, Important, or Note across Architecture,
   Security, Data protection, Error cases, Testability, Scope, and Maintainability. Incorporate all
   critical findings and every directly resolvable important finding; record remaining
   decision-requiring findings as concrete open points.
4. Normalize the active comment to the canonical structure, including its language-matching plan
   review, scorecard, findings, and open-points section. `Approved` / `Freigegeben` requires no
   critical finding and no implementation-blocking open point; otherwise use
   `Revision required` / `Überarbeitung nötig`.
5. When a decomposition was prepared, include its exact child records, titles, workflows, and
   publishable bodies in the canonical comment before any approval or create operation. Review the
   proposed children as implementation units as well as reviewing the overall parent. Any child
   that is not self-contained or that still has a blocking open point blocks the decomposition.
   Pass the artifact language, target binding, active parent, and complete record set through
   `decomposition-records-build`, insert only its complete canonical section verbatim, and then pass
   the assembled comment through `planning-comment-build`. A schema error,
   duplicate key or created issue identity, invalid workflow, invalid status/issue combination,
   unsafe secret form, unclosed child fence, or body/record workflow mismatch blocks persistence.
   For GitHub, both operations enforce the 65,536-byte aggregate UTF-8 comment limit: the section
   must fit at build time and the complete stamped planning comment must fit before persistence. If
   it does not, report the structured size contributions and reduce the proposal/comment; never
   truncate a child body or bypass the canonical section. A smaller provider-specific rejection is
   likewise fail closed.
6. If critical findings or implementation-blocking open points remain, persist the baseline,
   retain the Needs-Planning label, do **not** offer the deep review yet, report re-entry via
   `effective-flow plan-issue <issue>`, and continue with the next selected issue.

### Phase 4: Persist, deep-review gate, and readiness

Complete this entire phase for the active issue before starting another issue:

1. Persist the self-contained baseline comment. If no planning comment exists, use
   `planning-comment-build` followed by `issue-comment` once and retain the returned comment ID and
   fresh body hash. If one exists, canonicalize the marker to
   `<!-- effective-flow-plan-issues -->`, preview `issue-comment-update` with the retained comment
   ID and `expectedBodyHash`, then apply that same payload. On `UNSUPPORTED_CAPABILITY`,
   `TARGET_NOT_FOUND`, `AMBIGUOUS_TARGET`, or `STALE_WRITE`, stop processing this issue without
   adding a fallback comment or removing its label; report that a fresh
   `effective-flow plan-issue <issue>` run is required. On an external target the same sequence runs
   through the resolved connection's create-comment and update-comment-by-ID capabilities under
   the `tracker-target` write discipline: preview the payload, re-read the exact comment
   immediately before the update, compare it verbatim, and treat a missing capability, a missing or
   ambiguous comment, or a changed body as the same fail-closed stop.
2. If the freshly persisted baseline contains a proposed decomposition, re-read that exact comment
   and confirm its body hash. Parse the body through `decomposition-records-parse` and reject any
   noncanonical, duplicate, or invalid record before showing the parent and every exact child title,
   workflow, body, stable key, and bound draft hash. Ask whether to create **that exact set** as
   native children of this parent. An unanswered or rejected prompt creates nothing. On approval,
   rebuild the complete canonical section from the parsed records with exactly those `proposed`
   statuses changed to `approved` and unchanged title/body hashes, then perform the guarded comment
   update, re-read, and parse it again. On rejection, rebuild and guardedly persist the section with
   the proposal `declined`, then continue with the existing single-issue planning and deep-review path;
   do not interpret approval of another parent or an earlier draft as approval here.
3. After approval, re-read the parent and canonical comment. For an external target, revalidate the full native-container contract
   and atomic create-under-parent before the first mutation. Enforce child-count and parent-state
   constraints that these reads expose; treat hierarchy-depth, permission, parent-state, or limit
   rejections surfaced only by the provider as fail-closed create errors rather than claiming a
   local preflight. For each approved draft in order:
   - immediately before the create preview, call `issue-sub-issues-read` and replace the local
     reconciliation state with that fresh list. A child-level `decompositionKeyError`, more than one
     match for any canonical key, a wrong-parent marker, or another record/list integrity error
     fails closed for this parent. Match the draft's stable key: exactly one valid match is reused;
     zero permits a preview; multiple matches stop before a write;
   - when zero matches remain, preview the parent-aware create and verify that its parent, key, exact
     publishable payload, and workflow still match the approved draft. Validate the body again with
     `decomposition-child-workflow-parse` using its artifact language and record workflow.
     Immediately before apply,
     call `issue-sub-issues-read` again and replace the local reconciliation state. One now-matching
     child is recovered without applying, zero permits applying the unchanged previewed operation,
     and multiple matches or any marker/integrity error stop before a write. Never call
     `issue-create`, create first and link later, or fall back to a checklist;
   - after success or unique-key recovery, call `issue-sub-issues-read` once more and require exactly
     one valid same-parent match for the key. A concurrently visible duplicate fails closed before
     the comment update. **The just-created child's key being absent from that fresh list is marker
     non-persistence, not a failed create:** the tracker accepted the issue but did not store the
     stable-key marker in its body, so no later run can reconcile that child by key. This is the
     bounded proof that the marker survives on this connection — there is no pre-flight capability
     probe for it, because proving it would itself require creating a scratch item. The blast radius
     is bounded by this check running after **every** child: the run stops after at most one child,
     before any sibling is created and before the canonical comment is updated. Then guardedly
     update the canonical comment with the normalized child
     reference and a `created` status before continuing. Every status/reference transition rebuilds
     the complete section through `decomposition-records-build`; never patch encoded marker data or
     the visible rendering independently.
   - on an external target, `issue-sub-issues-read` and its marker normalization never run. The
     listing is carried by the connection's native-child listing proven in Phase 1 step 1: it
     supplies the fresh child list for all three reads of this loop and for every later
     reconciliation read, and because those children carry no normalized `decompositionKey`,
     `decomposition-key-parse` supplies the key per freshly re-read child body. The two canonical
     local operations carry the marker work instead: `decomposition-key-build` produces the
     exact child body for the create — it is the external child-body step and the only permitted
     writer of the marker — and `decomposition-key-parse` performs the post-create key match against
     the freshly re-read child body, with the same expected target and parent. Every fail-closed
     outcome of the three reads is unchanged on this path, including the bounded post-create proof
     that the marker survives. Never handwrite the
     marker or match keys by string comparison on the external path.

   If a create failure says `mutationMayHaveSucceeded`, perform `issue-sub-issues-read` immediately
   and replace the local reconciliation state before any decision; on an external target that read
   is the connection's proven native-child listing plus `decomposition-key-parse` over each re-read
   child body, and the outcomes below are the same. A unique valid key match recovers
   the result; zero, multiple, or marker-error matches remain blocked and are never blindly retried.
   If any later child fails, preserve created children, mark all missing or unknown drafts explicitly
   in the canonical comment when its hash guard still permits that update, retain
   `effective-flow-needs-planning`, report fresh re-entry through
   `effective-flow plan-issue <parent>`, and stop only this parent. Never delete or recreate a valid child.

   This three-read sequence and its duplicate checks protect the approved sequential/re-entry
   workflow but are not a cross-process lease. The forge comment update is a non-atomic
   read-then-PATCH and the provider exposes no supported conditional unsafe write here, so
   simultaneous writers can still race after the last pre-create read. Never claim the body hash
   closes that TOCTOU window; if a duplicate or uncertain result becomes visible, stop and reconcile
   rather than retrying.

4. With a baseline that has no critical findings, ask for this issue only:

Ask the user: **Start the deep interactive plan review now?**
- Yes -- Search now for unknown, imprecise, and decision-requiring points
- No -- Continue later via plan-issue <issue>

Do not reuse this answer for any other selected issue.

- On **Yes**, read ``tools/plan-review.md`` and invoke it in **issue mode** with exactly this issue,
  the current canonical planning-comment ID and body, its freshly computed body hash, the
  already-resolved tracker adapter, the concrete artifact language, and the literal line
  `Next steps: suppressed` on its own line, because that run returns its result here. The internal
  review may update only this existing comment and returns whether implementation-blocking open
  points remain. Do not create a plan file or a second comment.
- On **No**, retain the approved automatic baseline and record no artificial open point; the
  next-step block of Phase 5 carries the optional later re-entry.

After either branch, apply the readiness decision. For an approved decomposition, readiness also
requires a fresh `decomposition-container-compare` over the stored canonical comment and fresh
native-child list — read on the forge through `issue-sub-issues-read`, and on an external target
through the connection's proven native-child listing with `decomposition-key-parse` per child — to
return `ok: true`; every active record must be `created` and resolve to exactly
one same-parent native child with the recorded identity. The parent then remains a container and is
not itself an additional implementation work item. If the deep review is ended, deferred after it
starts, fails to persist, or returns a blocking open point, keep or add
`effective-flow-needs-planning` and persist the exact re-entry need in the comment. Otherwise
remove `effective-flow-needs-planning`, plus any present `firmo-needs-planning` variant on the
forge target. Never set
`effective-flow-issue-done`.

Set the issue task to `completed`, annotated `[blocked]` when it was not released, and continue
with the next selected issue. One blocked issue must not prevent the remaining issues from
receiving their own baseline, question, comment update, and label decision.

### Phase 5: Summary

Report per issue whether it was released for implementation, retained for planning with its open
points, or failed closed during comment persistence. This skill itself implements nothing.

Emit the next-step block per `next-steps` as the last element of the report. A run that released at
least one issue takes the released row; a run that released none takes the retained row.

## Rules

- Do not change any implementation files and generate no code.
- Do not create any `<plan.dir>/` file.
- If clarification, baseline, or deep review does not enable a reliable plan, leave
  `effective-flow-needs-planning` in place and document the blocking decision in the canonical
  comment's open-points section.
- A nonempty open-points section is implementation-blocking. Never remove the Needs-Planning
  label while an entry remains.
- Process multiple issues artifact by artifact. Questions and answers apply only to the currently
  named issue.
- Child creation is legal only through `issue-sub-issue-create` with the active parent supplied.
  Generic `issue-create`, a create-then-link sequence, sibling creation, and checklist degradation
  are forbidden in this tool.
- Never set `Co-Authored-By` trailers and do not expose internal IDs in comments.
- Give the user a brief status update after each phase.
