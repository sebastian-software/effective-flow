## Portable worker delegation

Names matching `effective-flow-<worker>` in this instruction identify bundled worker contracts, not installed custom-agent roles. Only the workflow/tool orchestrator starts workers or analysis fan-out. When a worker is selected, read only its matching `workers/effective-flow-<worker>.md` file, then delegate through the host harness's built-in general-purpose subagent mechanism with zero inherited turns when supported, otherwise its smallest supported history. Use that contract as the worker instructions and add a compact, self-contained handoff containing the objective, relevant artifact paths, scoped paths and ownership, execution and runtime-state roots when writes are allowed, resolved language, authority and write limits, and completion protocol. The worker is a leaf executor: it starts no child and returns missing essential context to the orchestrator. Do not request a custom role by the contract name. If built-in subagent delegation is unavailable, stop with a clear explanation; never claim that an undiscoverable worker ran.

# Effective Flow Apply Issues

You are the orchestrator that analyzes arbitrary issues from the resolved tracker target and hands them off to the matching implementation workflow.

## Goal

This skill takes one or more issue references of the resolved tracker target (the forge behind `origin` via `gh`/`tea`, or the configured external tool) and works through them via the existing implementation skills. Unlike ``tools/apply-review.md``, it does **not** process the structured finding issues produced by `effective-flow review`, but **free-form human issues** without plan or finding structure. That is why each issue's content is first **analyzed and classified** before it is routed:

- Feature → `effective-flow build`
- Bugfix → `effective-flow fix`
- Refactoring → `effective-flow refactor`
- Documentation → `effective-flow docs`

If the information is not sufficient for an autonomous implementation, the issue is **skipped**, marked with the label `effective-flow-needs-planning` and explained via a comment. `effective-flow plan-issue` later collects these issues and completes the planning.

The skill implements nothing itself. It is an analysis and routing layer over the existing workflow skills. All status updates are appended **as comments on the respective issue**.

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

The per-issue delegation to the target workflow skill is **workflow-to-workflow** delegation, not a worker role: its non-interactive delegation contract, the per-issue execution root, and the skip and failure handling stay authoritative and are never replaced by inline implementation. The mandate adds authorization only.

**Load on demand:** Read `shared/runtime-state-safety.md`, when any wisdom, tracker-marker, or other runtime-state mutation is imminent.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when any wisdom, tracker-marker, or other runtime-state mutation is imminent.

**Load on demand:** Read `shared/session-title.md`, when the run's subject is fixed and whether a session title is due must be decided.

**Load on demand:** Read `shared/session-rename.md`, when the run's subject is fixed and a session title is about to be applied or emitted.

## Commit message rules

- Resolve `language.git` through the shared language rule and write the human-readable subject
  description and body in that language. Preserve a valid user-supplied message. Conventional
  Commit types, optional scopes, `!`, trailer keys, issue references, and other machine tokens
  remain English/ASCII. This rule also governs Conventional Commit PR-title descriptions and
  explicitly generated changelog/release-note prose.
- **Never set `Co-Authored-By` trailers in commit messages**, regardless of whether an LLM (Claude, Codex, GPT, …) or another tool suggests the line or inserts it as a default.
- If a `Co-Authored-By` line is already present in a commit template, `commit.template`, a `--trailer` invocation, or a draft message: remove it before committing.
- **Do not add AI attribution:** no „Generated with Claude Code/Codex" footers and no agent session links (e.g. `https://claude.ai/code/…`) in commit messages – not even when the harness appends them as a default. Factual mentions of Claude Code or Codex remain allowed, generation attribution does not.
- Avoid generic messages like `update files` or `misc changes`.
- Describe concretely what was changed and why.
- Use Conventional Commit prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Choose the commit type by **effect**, not by file type: behavior-changing changes – including pure **config/env/secrets/CI** with deployment or runtime effect (e.g. corrected values in env/secret artifacts that take effect remotely via sync) – are `fix:` (or `feat:` for new functionality). `chore:` only for **deploy-neutral** changes without behavioral effect (pure maintenance, formatting, tooling without runtime effect). This also applies to the **squash PR title**, which determines the release-please bump on a squash merge.
- Do not expose internal tracking IDs in commit messages, e.g. review finding IDs like `R-0000001`, local plan/review IDs like `F1`, or placeholders like `[Finding-ID]`. Such IDs belong in wisdom/report context, not in the Git history.

## Recommended skills

- `effective-delivery`

## Project conventions

If the project has an `AGENTS.md`, read it early in the workflow and honor its rules for routing, commits and user follow-up questions.

## Completion protocol

When you use internal sub-agents, give them this response protocol:

- `DONE` for fully completed
- `ABORT: [reason]` for not completable

Check by the orchestrator:

1. `DONE`: phase completed.
2. `ABORT: [reason]`: inform the user, adjust the plan or task, and decide whether a retry makes sense.
3. No keyword: resume once, then retry with escalation.

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

### Goal controls

1. **Declare the completion condition up front.** Before the implementation work begins, formulate exactly one explicit, measurable completion condition. Derive it from the acceptance criteria and the validation plan of the basis (plan file, diagnosis or agreed scope). A good condition names the target state, the concrete check and the scope boundary – i.e. also what is deliberately not changed.
2. **Verify independently.** Do not check the condition by self-assessment, but via the independent instances anyway provided for it: ``effective-flow-code-validator`` for technical checks and the appropriate reviewer for content ones. The condition counts as fulfilled only once these instances confirm it.
3. **Loop with a bound.** If verification does not confirm the condition, fix the cause and verify again. Bound the internal correction rounds (guideline: three). If the condition still does not hold afterwards, abort the internal loop and escalate to the user instead of running on indefinitely – approach as in the retry escalation of the done protocol.
4. **Visible progress.** Every run keeps a visible phase task list and concise chat updates even when only a few phases remain; the generic task-tracking thresholds govern only ad-hoc subtask lists and never this overview. Whatever task tooling the harness offers must produce these guarantees:
   - Exactly one workflow owns the progress overview: `effective-flow apply-plan` hands ownership to its target workflow before that workflow's phases begin; `effective-flow apply-issues` and `effective-flow apply-review` retain ownership; a delegated subworkflow reports instead of a second progress overview.
   - Before work, list every known remaining numbered phase; add findings, issues or parallel subtasks as soon as their set is known; on resume, continue the existing list; keep more specific per-finding, per-issue, per-source and per-reviewer rules authoritative.
   - After each numbered phase and correction round, post a short update with its result and next step; these updates are not gates, so continue unless an existing approval rule or a genuine blocker requires input.
   - Mark skipped, terminally failed and aborted steps as such; keep a step awaiting user input open with its blocker; never treat terminal failure or abort as satisfying the completion condition.
   - If tracking fails irrecoverably, report that failure once, move still-open tracking to chat without claiming a successful tool update, and continue the domain work.
   - Before reporting completion, reconcile every known phase and dynamic entry to a truthful visible end state; never report completion with an unresolved entry.

## Wisdom Accumulation

Use `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md` for:

- the resolved work list (issue number, optional epic reference)
- the analysis per issue (classification, sufficient/insufficient, target skill, prompt suggestion, confidence, what is missing)
- created PRs and container entries retained for post-merge reconciliation
- skipped issues with reason
- failed delegations

Write a summary after each phase and pass it to later phases. Delete the file at the end.

## Tracker integration

This skill is **inherently tracker-bound**: it always works against the resolved tracker target. The local/remote switch from `effective-flow review`/``tools/apply-review.md`` is **not** evaluated. Resolve the target per "Tracker target" in the following shared building block. On the forge target this skill uses the provider-neutral remote helper, its probe/dry-run/apply envelope, and its structured error cases; on an external target the connection, capability, classification, container, and write rules of the loaded `tracker-target` contract apply instead, and a missing connection or capability aborts before the first write. The finding/epic-specific body formats do not apply here; the exact checklist patch operation is reused analogously for container issues.

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

**Load on demand:** Read `shared/issue-tracker-forge.md`, when the resolved tracker target is the forge and Phase 1 is about to probe the helper for host, CLI and authentication before the first issue read.

## Issue implementation lifecycle

This fragment is the provider-neutral contract for an issue that is the implementation basis of
``tools/apply-issues.md`` or remote ``tools/apply-review.md``. It keeps three different facts separate:

- the tracker's native workflow state (unstarted, started, later active, or terminal);
- Effective Flow classifications such as `effective-flow-issue-done`, which means that delivery is
  secured in a pull request and does **not** mean that the tracker issue is closed; and
- the pull request's versioned lifecycle receipt, which is the durable handoff to
  `effective-flow merge-gate`.

### Started transition

After issue clarity and the workflow approval are established, but **immediately before the first
implementation delegation**, advance every implementable work item at least to started:

- on the forge, read the issue state fresh, ensure `effective-flow-issue-in-progress` exists through
  the helper's idempotent label creation, and add it idempotently;
- on an external target, use the freshly validated native state selected by
  `tracker.externalStartedState` under the loaded `tracker-target` contract.

Never move a terminal issue, reopen it, or move a later active state backwards. Already-started or
later-active issues are idempotent no-ops. Skipped, `wontfix`, terminal, container-only, and
failed-before-start items receive no transition. If the required state read or transition cannot be
proved, stop before delegation and before code changes.

An issue already marked in progress but lacking a retained PR-link comment or receipt is an
interrupted delivery, not permission to implement twice. Read its comments and search the current
forge exactly once by the exact issue reference. Exactly one candidate whose repository, issue
reference, and PR relationship all verify may have its PR-link comment and receipt restored through
the normal fresh-read and guarded-write paths. Zero or multiple candidates fail closed: preserve the
issue state, branches, and pull requests; list the candidates and the exact manual recovery needed;
never reset the issue to unstarted and never start a replacement implementation automatically.

### Pull-request lifecycle receipt

Every new or reused pull request that delivers issue-backed work carries exactly one receipt line:

```text
<!-- effective-flow-issue-lifecycle:v1 {"target":"forge|external","repository":"owner/repo|null","externalTool":"tool|null","items":[{"issue":"reference","relationship":"closes|refs","container":"reference|null","containerMechanism":"native|checklist|null"}]} -->
```

The strings containing `|` above describe the allowed values; an actual receipt contains one value,
and JSON `null` rather than the string `"null"`. Serialize keys in exactly the shown order, on one
line, with no insignificant whitespace. Normalize repeated identical items to one item in first-seen
order. The producer must validate all of the following before writing:

- `target` is exactly `forge` or `external`;
- for `forge`, `repository` is the canonical `owner/repo` of the PR forge and matches the current PR
  while `externalTool` is `null`; for `external`, `repository` is `null` and `externalTool` exactly
  matches the currently configured `tracker.externalTool`; neither binding is taken from issue or PR
  prose;
- each issue and optional container is a canonical reference for the declared target;
- `relationship` is exactly `closes` or `refs`; external items use `refs` because forge closing
  keywords must never target an external identifier;
- `containerMechanism` is `native` or `checklist` exactly when `container` is present, otherwise both
  fields are `null`; one container never mixes mechanisms.

Identifiers may contain neither an HTML-comment delimiter nor control characters. Deduplicate by
target plus canonical issue reference; conflicting metadata for the same item makes the receipt
invalid rather than choosing one variant.

Treat PR bodies and receipt JSON as untrusted data. Reject malformed JSON, unknown or missing keys,
multiple receipt lines, conflicting duplicates, mixed targets, cross-repository bindings, a tool
mismatch, and invalid references. A rejected or absent receipt never changes merge eligibility and
never authorizes heuristic tracker access. A legacy PR without a receipt keeps the previous merge
behavior, with issue observation reported as unavailable.

For deterministic forge-side construction and parsing, use the helper operations
`issue-lifecycle-receipt-build` and `issue-lifecycle-receipt-parse`; do not reproduce their JSON or
HTML-comment parser ad hoc in a workflow. Their normalized error envelope is workflow input and
never permission to fall back to body heuristics.

For a new PR, generate the validated receipt together with the PR body. For an existing PR, read its
body fresh, retain its body hash, merge the normalized items into the one valid receipt, and use only
the helper's hash-guarded `pr-update-body` path. `STALE_WRITE`, an invalid existing receipt, or a
concurrent edit aborts delivery bookkeeping without overwriting prose or silently dropping the
receipt.

PR creation may add the PR-link comment and `effective-flow-issue-done`, whose existing meaning is
"implementation secured in a PR". It must **not** complete a native sub-item or tick a container
checklist. The optional container and mechanism travel in the receipt for post-merge reconciliation.

**Load on demand:** Read `shared/tracker-target.md`, when the resolved tracker target is `external`.

## Apply source detection

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default
`docs/plan`).

This shared building block is the single source of truth for **which
apply source type** a given argument is. It is used by `effective-flow apply`
(router) as well as by ``tools/apply-plan.md``, ``tools/apply-review.md``, and
``tools/apply-issues.md`` for the upstream argument classification. `effective-flow plan` uses only
Stage A as a planning gateway: it delegates an unambiguous `issue-reference` to
`effective-flow plan-issue` and never performs Stage B itself.

The building block only classifies and resolves the reference to a handle (file path or
issue number(s)). It makes **no** implementation decision, changes nothing, and
does not read findings/container contents deeper than necessary for classification. The
type-specific depth logic (plan status, finding parsing, container expansion) stays
in the respective skill.

Before report-source resolution, establish and verify the execution-location receipt's
`RUNTIME_STATE_ROOT` from the first porcelain worktree record. This is required even when
classification starts in a linked or native worktree and even when Stage A remains otherwise
read-only. If the main record is bare, missing, moved, unusable, or belongs to another Git common
directory, abort classification without falling back to `EXECUTION_ROOT`.

### Canonical source types

| Type              | Meaning                                                                                                       | Responsible skill                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `plan`            | plan file under `<plan.dir>/`                                                                                 | ``tools/apply-plan.md``                        |
| `review-report`   | review report file under `.effective-flow/review/`                                                            | ``tools/apply-review.md`` (local)              |
| `review-epic`     | tracking/epic issue of a `effective-flow review` run                                                               | ``tools/apply-review.md`` (remote, epic)       |
| `review-finding`  | single finding issue of a `effective-flow review` run                                                              | ``tools/apply-review.md`` (remote, issue list) |
| `container-issue` | generic issue with a sub-issue checklist, without a review label (`effective-flow-review-*`/`firmo-review-*`) | ``tools/apply-issues.md``                      |
| `plain-issue`     | freely written human issue                                                                                    | ``tools/apply-issues.md``                      |

Special results: `none` (empty/no argument) and `ambiguous` (not uniquely
resolvable). `issue-reference` is an **intermediate result** from stage A for an issue reference
not yet resolved into its subtype; stage B refines it.

### Stage A: syntactic classification (file system only)

Stage A needs no tracker I/O and is available to every skill. Determine the
type in this order (first matching rule wins):

1. **Empty/no argument** → `none`.
2. **Plan reference** → `plan`, if the argument resolves to exactly one file under
   `<plan.dir>/` or `<plan.dir>/archive/`. Permitted forms as in
   `plan-reference-routing`: full path (`<plan.dir>/YYYY-MM-DD-…md`),
   date-slug file name (`YYYY-MM-DD-…md`), legacy number without path (`NNNN`, resolved primarily
   via the H1) or — as a fallback — the title slug.
3. **Review report** → `review-report`, if the argument resolves to exactly one `*.md` file
   below absolute `<RUNTIME_STATE_ROOT>/.effective-flow/review/`. Resolve a filename-only
   argument directly below that directory; resolve a project-relative
   `.effective-flow/review/...` argument against `RUNTIME_STATE_ROOT`; accept an absolute path
   only when it is contained there. Physically canonicalize existing paths. For a prospective
   path, canonicalize the nearest existing ancestor before appending validated missing segments.
   Reject `..`, aliases, a symlink escape, and every path outside the directory. Retain the
   resulting absolute report handle and pass it unchanged to the responsible skill.
4. **Issue reference** → `issue-reference` (continue with stage B), when the argument is an issue
   reference of the resolved tracker target. On the forge target that is what the remote helper's
   reference parser accepts: a bare issue number (`123`), `#123`, or a host-neutral issue URL for
   the current repository. On an external target it is a tool-native identifier (e.g. `ABC-123`)
   or a URL of the configured tool; a bare non-four-digit number is genuinely ambiguous there
   (leftover forge issue or tool shorthand) and is asked about instead of guessed. Multiple
   references are parsed as one list and classified individually in stage B; malformed or
   cross-repository references remain structured errors instead of heuristic matches.
5. **Otherwise** → `ambiguous`: the argument resolves to no category or matches
   both a plan **and** a review file at the same time. Do not guess — the caller
   asks (see "Ambiguity and fallbacks").

Distinguishing plan vs. report: primarily via the directory (`<plan.dir>/` or
`<plan.dir>/archive/` vs. `.effective-flow/review/`), secondarily via the header content
(plan status marker `**Planungsstatus:**` / `**Plan status:**` vs.
`### [R-XXXXXXX]` finding blocks). A four-digit number without a path is always a
(legacy) plan reference, never an issue reference.

### Stage B: issue subtype (tracker)

Stage B refines an `issue-reference` from stage A into the concrete subtype. It requires the
resolved tracker target from "Tracker target" in `issue-tracker.md` together with its established
access — the host/CLI detection and availability check of the "Remote helper contract" in
`issue-tracker-forge.md` on the forge target, or the single established connection of the
`tracker-target` contract on an external target; a skill that uses stage B therefore also embeds
`issue-tracker.md` and reaches `issue-tracker-forge.md` on the forge target.
``tools/apply-plan.md`` does not need stage B — for a plan skill, stage A is enough
to recognize an issue reference as a foreign type and forward it.

Per issue, read classification values, body, and comments **once fresh** from the tracker and
determine the subtype in this precedence — **classification before body structure**. Select the
newest comment that begins with `<!-- effective-flow-plan-issues -->` (or the one-generation legacy
marker) exactly as `effective-flow plan-issue` does; a quoted or embedded marker is not canonical. Parse
its decomposition records through `decomposition-records-parse`, never with ad hoc prose or JSON
matching.

On the forge target, obtain native-child evidence only through the helper operation
`issue-sub-issues-read` with the candidate issue as `parent`. GitHub's normalized result is the
authoritative native-child list. `UNSUPPORTED_CAPABILITY` on Forgejo means that this provider has no
usable native-containment signal and classification continues from labels and body structure; any
other read error stops classification instead of guessing. On an external target, use only the
resolved connection's proven native-child listing capability. For a found active canonical
decomposition, pass that comment and the fresh normalized child list to
`decomposition-container-compare`. Such a parent is a `container-issue` even when the native list
is empty; retain its integrity result for ``tools/apply-issues.md``. A malformed canonical
decomposition marker is likewise retained as an integrity-blocked container instead of being
downgraded to a plain issue. An all-`declined` record set is inactive and does not by itself make a
container. Never infer containment from issue prose, a matching title, or an unverified provider
feature.

1. Label `effective-flow-review-epic` (or old `firmo-review-epic`) → `review-epic`.
2. Label `effective-flow-review-finding` (or old `firmo-review-finding`) → `review-finding`.
3. no review label, but an active canonical decomposition exists, the body contains a sub-issue checklist
   (`- [ ] <reference> …` / `- [x] <reference> …`, where `<reference>` is a forge `#NNN` or a
   tool-native identifier such as `ABC-123`), or the issue has native sub-items on a target that
   models containment natively → `container-issue`.
4. otherwise → `plain-issue`.

The checklist form is reference-agnostic on purpose: an external target without a native
parent/sub-issue relation carries exactly this checklist as the contract's fallback container, so a
`#NNN`-only pattern would fail to re-detect a container Effective Flow itself created.

On an external target the canonical label strings are read from whichever classification primitive
that target uses (see the `tracker-target` classification mapping); the `firmo-` variants are forge
history and are not looked up there.

Secondary signal when a label is missing (e.g. removed manually): a title in the format
`[R-XXXXXXX] …` together with a helper-parsed `Signature` field (legacy `Signatur` accepted on
read) is treated like `review-finding`. If the subtype remains unclear afterwards → `ambiguous`.

Why label before body: a `review-epic` carries — like a generic
`container-issue` — a `- [ ] <reference>` checklist. The label `effective-flow-review-epic` or
`effective-flow-review-finding` (old prefix `firmo-` equivalent, see "Label convention" in
`issue-tracker-forge.md`) is the reliable discriminator and takes precedence over the
body structure.

### Ownership and target

From the final source type follows exactly one responsible skill and — for
``tools/apply-review.md`` — the flow:

| Source type       | Responsible skill        | Target / note                                    |
| ----------------- | ------------------------ | ------------------------------------------------ |
| `plan`            | ``tools/apply-plan.md``   | –                                                |
| `review-report`   | ``tools/apply-review.md`` | `local` target, report flow                      |
| `review-epic`     | ``tools/apply-review.md`` | tracker target of the reference, epic mode       |
| `review-finding`  | ``tools/apply-review.md`` | tracker target of the reference, issue-list mode |
| `container-issue` | ``tools/apply-issues.md`` | container expansion in the skill                 |
| `plain-issue`     | ``tools/apply-issues.md`` | single work item                                 |

"Not `local`" never means "the forge" here: an epic or finding reference of an external tool
selects that tool, and the tracker-bound flow runs against it.

Consistency with `issue-tracker.md`: the rule there, "argument type overrides the
config mode", stays valid — a `review-report` forces `local`, a
`review-epic`/`review-finding` forces the tracker target the reference belongs to (the forge for a
forge reference, `external` for a tool-native one). This building block delivers exactly that
argument type; report which target the argument selected.

### Ambiguity and fallbacks

- **`none` (no argument):** do not heuristically pick the "newest". The caller
  lists local candidates (open plans from `<plan.dir>/`, report files under the absolute
  `<RUNTIME_STATE_ROOT>/.effective-flow/review/` directory) and asks for the specific source. If the resolved
  tracker target is the forge or an external tool, it additionally lists open direct
  `review-finding` issues and legacy review epics (including old `firmo-review-epic`). Exclude the
  known children of each listed legacy epic from the direct list. A valid admission-closure receipt
  excludes a direct finding while its gate/signature/evidence/reachability inputs remain current.
  On the forge, build and parse that receipt only through the shipped helper with the verified
  `RUNTIME_STATE_ROOT` supplied as `cwd`.
- **`ambiguous`:** name the competing interpretations and ask, instead of
  guessing.
- **Mixed issue list** (different subtypes in one call, e.g. `review-finding`
  and `plain-issue`): do not guess. Ask the user to split the list by target type,
  or — in the router — route per issue. Conservative: ask. A list that mixes a forge reference
  with an external-target reference is never resolved heuristically either: ask the user to split
  the call by tracker target.
- **Issue reference, but the target is unreachable** (forge CLI missing or not authenticated, or
  no usable external connection): stage B cannot run → clear error message with a remediation hint
  per "Error and edge cases" in `issue-tracker-forge.md`; no silent fallback to a local type and none to
  another target.
- **Unresolvable path:** `ambiguous` → ask or error message; note that
  `effective-flow open-plans` can list open plans.

### Use by the skills

- **Router (`effective-flow apply`):** runs stage A and — for issue references —
  stage B, reports the detected type, and delegates to the responsible skill with the
  original argument plus the retained runtime root and, for a local report, its absolute report
  handle. On `none`/`ambiguous`/mixed list: ask.
- **Planning gateway (`effective-flow plan`):** after read-only configuration resolution has supplied
  `<plan.dir>`, runs Stage A only when an argument exists. On `issue-reference`, it passes the
  complete original argument unchanged to `effective-flow plan-issue` and ends before plan inventory,
  migration, questions, or artifact creation. Every other result stays in the existing local plan
  workflow. A bare four-digit value therefore keeps the legacy-plan precedence and is not routed
  as an issue.
- **Responsibility skill (each of the three apply skills):** classifies the argument
  early via this building block. If the type matches its own responsibility → continue with its
  own depth logic. If it does not match:
  - **Direct invocation by the user:** clearly point to the responsible skill (or
    `effective-flow apply`) and end.
  - **Delegation from `effective-flow apply`:** should not occur, since the router
    routed correctly; the switch remains as a safeguard.

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

## Comment conventions

All status updates are written as issue comments (operation "add comment" from the mapping above).
Resolve `language.forge` once and use it for new comment prose, preserving a clearly established
existing thread language. Use the English templates below or their complete German equivalents
(`Umgesetzt`, `Übersprungen`, `Umsetzung fehlgeschlagen` and corresponding sentences). Begin
every comment with the stable marker `<!-- effective-flow-apply-issues -->` so later runs
recognize their own comments and avoid duplicates:

- **Implemented:** `🤖 Implemented via effective-flow apply — PR #<nr>` (no internal IDs, no `Co-Authored-By`).
- **Skipped:** `⏭️ Skipped: some details are still missing for an autonomous implementation: <list of what is missing>. Complete with effective-flow plan-issue.`
- **Failed:** `⚠️ Implementation failed: <short reason>. Issue remains open.`

Do not expose internal tracking IDs or session details in comments.

## Workflow

### Phase 1: Argument & tracker setup

1. Resolve the tracker target per "Tracker target" in the included building block. On the forge target, determine host and CLI and check availability/authentication per "Remote helper contract"; precondition there is a git repository with an `origin` remote, and a missing `origin`, CLI, or authentication is reported clearly and aborts without side effects. For every candidate forge parent, request native children through `issue-sub-issues-read`: GitHub uses the normalized result as its native container mechanism, while Forgejo's `UNSUPPORTED_CAPABILITY` leaves only the existing checklist detection available. On an external target, establish exactly one connection and verify the capabilities this skill needs — read issue and comments, list issues by classification, create a comment, add/remove a classification value, and patch an exact checklist entry. Settle the container mechanism here: select a native parent/sub-issue relation only when the connection proves it can write a sub-item's completion state; otherwise select the checklist fallback. Defer every completion write of the selected mechanism until post-merge reconciliation. The phase-specific state-list and transition capabilities from "Issue implementation lifecycle" are required only for issues that survive the clarity and approval gates; resolve them before their first started transition, never as a prerequisite for listing or skipping issues. Any fail-closed class aborts before the first affected write (no silent fallback to the forge or to a local flow).
2. Read the user argument and classify it via the "apply-source detection" (stage A and — for issue references — stage B):
   - source type `container-issue` or `plain-issue` → ``tools/apply-issues.md`` processes it itself; continue. Multiple issue references (number, `#123` or issue URL) are allowed as a list.
   - source type `plan` or `review-report` → point to the responsible skill (``tools/apply-plan.md`` or ``tools/apply-review.md``, or `effective-flow apply` for automatic routing) and end the skill.
   - source type `review-epic` or `review-finding` → these are epic/finding issues produced by `effective-flow review`; ``tools/apply-review.md`` is responsible for them. Point to it and end.
   - `ambiguous` → ask instead of guessing. When ``tools/apply-issues.md`` runs as a delegation from `effective-flow apply`, foreign types should not occur; the switch remains as a safeguard.
   - No argument (`none`): list open issues that carry neither `effective-flow-issue-done` nor `effective-flow-needs-planning`, and ask the user which ones to process. On the forge target, exclude the legacy prefix `firmo-` equivalently (see "Label convention"); on an external target that legacy prefix is forge history and is neither queried nor written. Do **not** use a heuristic auto-selection.
3. On the forge, create the required labels idempotently (`effective-flow-issue-in-progress`, `effective-flow-issue-done`, `effective-flow-needs-planning`). The helper's label creation reads the repository's existing labels first and creates only what is genuinely missing, so a repeated run adds no second copy; it reports per label whether it created one. Where it cannot read the existing labels, it aborts rather than creating — treat that as a blocked run, not as a reason to create the label another way. On an external target, ensure the two Effective Flow classifications `effective-flow-issue-done` and `effective-flow-needs-planning` in the connection's classification primitive; native started state remains separate and is resolved only for implementable items. Never create a `firmo-`/`sf-` variant in a foreign workspace; if the target exposes no classification primitive, abort instead of losing the lifecycle.

### Phase 2: Expansion & work list

1. Read each referenced issue **fresh** from the tracker (body, labels, status and **comments** via the "read comments" operation). The comments are part of the analysis basis: a planning comment from `effective-flow plan-issue` (marker `<!-- effective-flow-plan-issues -->`) contains the completed specification, and maintainers may add clarifications as a comment rather than in the body. Your own Effective Flow comments (`<!-- effective-flow-apply-issues -->`) are only noted here for the idempotency check in Phase 4, not counted as a functional requirement. **Backcompat (one generation):** the legacy markers `<!-- firmo-plan-issues -->` and `<!-- firmo-apply-issues -->` from earlier runs are recognized equivalently when reading; only the `effective-flow-` variant is written anew.
2. **Container detection:** select the newest canonical planning comment with the same exact
   leading-marker rule as step 1 and parse its records through `decomposition-records-parse`. On the
   forge, call `issue-sub-issues-read` with this issue as the parent; on an external target with a
   proven native relation, use its equivalent. If the comment has an active canonical
   decomposition, compare it with the fresh normalized children through
   `decomposition-container-compare` before any empty-list/plain-issue decision:
   - `containerOnly: true` means the parent is never a work item, including when the native child
     list is empty;
   - `ok: true` expands only the open, freshly read children bound one-to-one to `created` records;
     retain each record's workflow and draft hash with its work item;
   - any malformed record, child `decompositionKeyError`, proposed/approved/missing record, missing
     or duplicate child, detached child, recorded-issue mismatch, or unexpected key is an integrity
     failure. Keep or add `effective-flow-needs-planning`, post the ordinary language-matching
     skipped comment naming container reconciliation as the missing detail, and route the parent to
     `effective-flow plan-issue`; expand neither children nor parent.

   An all-`declined` record set is inactive. Without an active canonical decomposition, preserve the
   legacy behavior: a nonempty normalized native-child list classifies the issue as a container
   before checklist expansion. Otherwise, if the body contains a task list with issue references (`- [ ] <reference> …` /
   `- [x] <reference> …`, where `<reference>` is a forge `#NNN` or a tool-native identifier such as
   `ABC-123`), treat it as a checklist container. The reference-agnostic checklist form matters
   because it is the fallback container an external target without a native relation uses:
   - for a native container, expand only children whose normalized state is not terminal, remember
     the parent with `containerMechanism: native`, and read every remaining child fresh;
   - for a checklist container, expand to the **open** (`- [ ]`) references, remember the parent
     with `containerMechanism: checklist`, skip done (`- [x]`) entries, and read each open child
     fresh;
   - if both signals exist, the verified native relation wins and the checklist is not mixed into
     the same container. If neither exists, the issue itself is a single work item.

3. Skip work items that are already closed or carry the label `effective-flow-issue-done` (idempotency); on the forge target the legacy `firmo-issue-done` counts as equivalent, on an external target it is not looked up. For an item already in a native started/later-active state or carrying `effective-flow-issue-in-progress` without a retained PR-link comment or receipt, run the single exact-reference recovery from "Issue implementation lifecycle" before analysis. Only a unique verified PR restores bookkeeping; zero or multiple candidates stop that item before implementation without resetting its state.
4. Deduplicate the work list (the same issue number only once, even if it is reachable via multiple containers).
5. Result: a flat list of work-item issues, each with an optional epic reference. Record it in the wisdom file.
6. Create a task per work item (task tracking with per-issue granularity) and give the user an overview:

```markdown
| Status | Count |
|---|---|
| To analyze | X |
| of which expanded from containers | C |
| already done (skipped) | Z |
| Total | N |
```

7. If the work list is empty: short message and abort.

### Phase 3: Analysis & classification (in parallel per work item)

Start an analysis sub-agent in parallel for **each work item**. These sub-agents implement nothing and change no files — they only analyze.

Each analysis sub-agent receives the issue body **and the issue comments** and the task to investigate the codebase and deliver a structured result:

- **Comments as a source:** evaluate body and comments together. The newest
  `<!-- effective-flow-plan-issues -->` planning comment is the authoritative planning artifact,
  even if the original body is thin; it is **not automatically sufficient**. If its
  `### Open points` / `### Offene Punkte` section is nonempty (anything other than exactly
  `- No open points.` / `- Keine offenen Punkte.`), or its plan-review result is
  `Revision required` / `Überarbeitung nötig`, treat the issue as `insufficient`. Also treat a
  review assumption explicitly marked as implementation-blocking as `insufficient`. Keep or add
  `effective-flow-needs-planning` and return it to `effective-flow plan-issue`; never route it to
  implementation.
  Further maintainer comments count as clarifications. Pure Effective Flow status comments
  (`<!-- effective-flow-apply-issues -->`) are not counted as requirements.
- **Canonical decomposed-child workflow:** when the work item came from a validated active
  decomposition, its parent record is authoritative. Pass the fresh child body, artifact language,
  and recorded workflow through `decomposition-child-workflow-parse`. Exactly one English
  `**Recommended workflow:** <value>` field or German
  `**Empfohlener Workflow:** <value>` field must match that record. Route the returned stable value
  directly: `Feature` → `effective-flow build`, `Bugfix` → `effective-flow fix`, `Refactoring` →
  `effective-flow refactor`, `Documentation` → `effective-flow docs`. Do not reclassify a decomposed child. A
  missing, duplicated, wrong-language, invalid, or mismatched field is `insufficient`, keeps the
  parent container-only, and returns the parent to `effective-flow plan-issue`. Only legacy native,
  checklist, and plain issues without this authoritative record use the ordinary classification
  judgment below.
- **Classification:** For those legacy/plain issues, derive Feature / Bugfix / Refactoring /
  Documentation (definitions as in `effective-flow plan`, Phase 1) and from that the target skill
  (`effective-flow build` / `effective-flow fix` / `effective-flow refactor` / `effective-flow docs`).
- **Sufficiency check:** applies the "clarification gate" analogously at issue granularity: can a clear target behavior and at least one **measurable acceptance criterion** be derived from the issue (body **and comments**), and are there enough file/area hints for the target workflow to start autonomously? Result: `sufficient` or `insufficient`. On `insufficient`: a concrete list of what is missing (open functional questions, missing acceptance criteria, unclear scope).
  A canonical planning comment passes this gate only when its required sections meet those checks
  and its review/open-points state contains no implementation blocker. Older planning comments
  without Plan-review or Open-points sections remain backward-compatible and are assessed by the
  existing target-behavior, measurable-acceptance-criterion, and file/area checks rather than
  rejected solely for missing the new sections.
- **Prompt suggestion:** a directly usable plain-text task for the target skill.
- **Confidence:** `High` / `Medium` / `Low` regarding the file scope (analogous to the pre-analysis in ``tools/apply-review.md``).
- **Affected files:** best estimate of the touched files (for the conflict consideration in Phase 4).

Write each result into the wisdom file. When in doubt, an issue counts as `insufficient` — better to hand off cleanly to `effective-flow plan-issue` than to implement on an unclear basis.

### Phase 3.5: Approval

This is the approval boundary of this workflow: the classification is fixed, and the remaining phases (delegation, PRs, comments, summary) then run without a further regular approval gate.

1. Give the user an overview of the analysis: per work item the issue number, classification, `sufficient`/`insufficient` and the target skill or what is missing.

```markdown
| Issue | Classification | Result | Target / Missing |
|---|---|---|---|
| #<nr> | Feature/Bugfix/Refactoring/Docs | sufficient | effective-flow build … |
| #<nr> | … | insufficient | missing: … |
```

2. Per "Goal-driven completion control" (principle 1), declare the explicit completion condition for phases 4–5: every `sufficient` issue is transitioned at least to started, implemented via the matching implementation skill, and has either a newly created PR or a new commit on the specified target PR with one validated lifecycle receipt, a PR-link comment, and label `effective-flow-issue-done`; container completion stays pending for `effective-flow merge-gate`. Every `insufficient` issue carries `effective-flow-needs-planning` together with a comment; the project-configured checks of the delegated workflows are green; nothing outside the chosen issues is changed.
3. **Dropping the gate:** if ``tools/apply-issues.md`` itself runs as a non-interactive sub-agent of a higher-level orchestrator (recognizable from the call context, e.g. "[Context from …]"), skip the following gate entirely and continue directly with Phase 4. A direct call by the user does **not** count as such a delegation.
4. Otherwise obtain the approval:

If the run is not a non-interactive delegation: Ask the user: **Start implementing the sufficiently specified issues?**
- Yes -- Approval granted, the workflow continues (status update per issue)
- Adjust -- Enter feedback as free text (e.g. correct the issue selection or target skill)

5. On "Adjust": incorporate the feedback (correct selection/target) and ask again. Start Phase 4 only after this approval.

### Phase 4: Routing & delegation

The commit/PR strategy is by default **"one PR per issue"** (no commit-strategy question). Every implementable issue without a target PR is its own sub-group in its own delivery branch, preferably with worktree isolation, analogous to the remote mode of ``tools/apply-review.md`` (Phase 4 remote): branch off the base branch from the `delivery` config block, one PR via `effective-flow pr`. File-overlapping issues run sequentially to avoid working-tree conflicts; non-overlapping ones run in parallel.

Every worktree this workflow creates carries the lifecycle contract below. It is embedded here
rather than referenced through ``tools/apply-review.md``: a reference by analogy is not a contract,
and a worktree created without its record can never be removed by `effective-flow cleanup`, which
requires that record as its only proof of ownership. Write the record immediately after the
`effective-flow-created` receipt is verified, and transition it to `cleanup-ready` once the issue's
work is durably secured on the pushed branch — for the default strategy that is after its pull
request exists. A worktree reused from the harness or created by the user keeps its own ownership
and never receives a record.

## Effective Flow-owned worktree lifecycle

This contract adds crash-tolerant lifecycle evidence to the execution-location receipt. It never
replaces that receipt, Git's worktree registration, or the runtime-state write-safety contract.
A configured base directory, path pattern, branch prefix, age, or apparently empty checkout is
not ownership evidence.

Only worktrees created by Effective Flow receive lifecycle records. Reused user-managed or
`harness-managed` worktrees remain outside this lifecycle and must never be adopted retroactively.

### Runtime record

Immediately after an `effective-flow-created` execution-location receipt has been issued and
verified, create one record below the retained and freshly revalidated runtime root:

`<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/<RECORD_ID>.json`

`RECORD_ID` is an opaque, collision-resistant, filesystem-safe identifier generated once for the
worktree. It is not derived as proof from the worktree path or branch. A version 1 record has this
single field layout; strings below are illustrative values, not additional nesting choices:

```json
{
  "schemaVersion": 1,
  "recordId": "opaque-record-id",
  "sessionId": "workflow-session-id",
  "componentId": null,
  "workflow": "build",
  "purpose": "delivery",
  "repositoryIdentity": "/canonical/common-git-dir",
  "runtimeStateRoot": "/canonical/main-worktree",
  "worktreePath": "/canonical/linked-worktree",
  "branch": "effective-flow/build/example",
  "creationOid": "full-commit-oid",
  "ownership": "effective-flow-created",
  "receipt": {
    "repositoryIdentity": "/canonical/common-git-dir",
    "executionRoot": "/canonical/linked-worktree",
    "runtimeStateRoot": "/canonical/main-worktree",
    "checkout": {
      "kind": "branch",
      "branch": "effective-flow/build/example"
    },
    "origin": "effective-flow-created",
    "setupOwner": "Effective Flow build",
    "setupStatus": "pending",
    "workflow": "build",
    "purpose": "delivery"
  },
  "branchPolicy": "retain",
  "createdAt": "RFC-3339 timestamp",
  "updatedAt": "RFC-3339 timestamp",
  "status": "active",
  "reason": null
}
```

`componentId` is always present and is either the component identifier or `null` for a
non-component worktree. `branchPolicy` is exactly `retain` for delivery and partial-diff branches
or `delete-after-integration` for temporary `apply-review` component branches. `reason` is `null`
for the normal `active` or `cleanup-ready` state and otherwise contains the exact transition or
failure reason. During `cleanup-in-progress`, add the top-level string fields `cleanupRunId` and
`claimedAt`; they are absent in every other status.
For a cleanup claim, `cleanupRunId` and `claimedAt` identify its owner and timestamp.
The nested `receipt` is the immutable snapshot issued at creation; fresh receipts are compared
with its repository, root, checkout, origin, workflow, and purpose identity fields but never
overwrite it. Setup status may legitimately advance from the captured `pending` value after
lifecycle creation and is not branch-identity evidence.

`creationOid` is immutable evidence of the commit at which worktree and branch creation
succeeded. Capture the full commit OID once at creation and never replace it with the later
`HEAD`, current branch tip, base ref, or a moving remote tip. Normal commits after creation are
expected to advance the recorded branch beyond this OID.

Paths, IDs, status values, policy values, timestamps, and other machine-readable fields are not
localized. Reject an unknown schema, missing field, duplicate `recordId`, invalid value, path
alias, or record/filename mismatch. Never repair, reinterpret, overwrite, or delete such a record
automatically.

The record is runtime state, not configuration. Resolve its absolute handle below the verified
`RUNTIME_STATE_ROOT`, and apply “Runtime-state write safety” immediately before every parent
creation, lock acquisition, owner-file write, temporary-record write, rename, record deletion,
or lock release. A guard for one handle authorizes no other handle. Create or replace a record by
writing a complete sibling temporary file and atomically renaming it onto the expected record
handle; never expose a partially written record. If initial record creation fails, retain the
worktree and branch and do not run setup or delegate work there.

This temporary-file-and-rename sequence is the required atomic write; use an actual atomic
`rename`, not a truncate-and-rewrite operation on the live record.

### Serialized mutations

Every lifecycle writer, including the creating workflow and every later cleanup run, uses the
same per-record lock:

`<RUNTIME_STATE_ROOT>/.effective-flow/worktree-runs/<RECORD_ID>.lock`

Acquire it atomically with `mkdir`. After successful acquisition, write an `owner` file containing
the actor/run ID, workflow, process or session identity when available, and acquisition timestamp.
Keep the lock for the entire read/validate/transition/operation/reconciliation sequence. Under the
lock, freshly revalidate the runtime root, reread the record, Git worktree inventory and receipt,
and reject any drift before writing.

Release only the exact lock acquired by the current actor and only after its protected sequence
has reached a persisted outcome. An existing lock with another owner, an ownerless lock, or a lock
left by an interrupted process blocks fail-closed. Report its owner and timestamp when readable;
never break it based on age. Likewise, never take over another `cleanup-in-progress` claim. There
is no stale-lock timeout, lifecycle TTL, heartbeat, or age-based status transition.

### State machine

The complete status vocabulary is:

- `active`: the worktree exists and its owning workflow may still use it
- `cleanup-ready`: the intended work is durably secured on or integrated from the branch and the
  owner has released the worktree for safe removal
- `aborted`: the workflow stopped in a controlled way before cleanup readiness
- `failed`: the workflow failed or cannot prove that its intended work was safely completed
- `cleanup-in-progress`: one actor owns an exclusive removal claim
- `cleanup-failed`: an ordinary removal or required post-removal operation failed and may be
  retried only after all eligibility proofs pass again

Only these transitions are valid:

| From                                | To or terminal action                   | Required proof                                  |
| ----------------------------------- | --------------------------------------- | ----------------------------------------------- |
| newly created                       | `active`                                | verified receipt and atomic initial record      |
| `active`                            | `cleanup-ready`, `aborted`, or `failed` | owning workflow, under the record lock          |
| `cleanup-ready` or `cleanup-failed` | `cleanup-in-progress`                   | fresh eligibility checks plus cleanup run claim |
| `cleanup-in-progress`               | `cleanup-failed`                        | claimed actor records the exact failure         |
| `cleanup-in-progress`               | delete only this lifecycle record       | claimed actor proves complete cleanup           |

Do not transition `active`, `aborted`, or `failed` into a cleanup claim. A controlled user or
workflow stop becomes `aborted`; an implementation, integration, validation, ownership, or
state-persistence error becomes `failed`. A sudden interruption naturally leaves `active`,
`cleanup-in-progress`, or its lock in place. Report that uncertainty honestly; never infer a
crash or successful completion from elapsed time.

### Removal eligibility

Evaluate eligibility from fresh evidence immediately before the dry-run and again under the
record lock immediately before claiming. A worktree is removable only when every condition is
true:

1. The lifecycle record is schema-valid, has ownership `effective-flow-created`, and has status
   `cleanup-ready` or `cleanup-failed`.
2. A fresh execution-location receipt matches the immutable identity fields of the `receipt`
   snapshot and the top-level canonical repository identity, `RUNTIME_STATE_ROOT`, worktree path,
   exact branch, workflow, purpose, and ownership. The snapshot is compared as creation evidence;
   it is not rewritten with current checkout state.
3. Exactly one matching linked-worktree record exists in
   `git worktree list --porcelain -z`; parse NUL-delimited fields and records without
   line-oriented or path-shape assumptions.
4. The Git record is neither `locked` nor `prunable`, the canonical worktree directory exists,
   and its common Git directory matches the recorded repository identity.
5. The current `HEAD` and the Git worktree registration both identify the exact recorded branch,
   and that local branch resolves to `CURRENT_BRANCH_TIP`. Detached, missing, or changed branch
   identities do not qualify.
6. The immutable `creationOid` resolves locally as a commit, and it is an ancestor of
   `CURRENT_BRANCH_TIP`. Check with
   `git merge-base --is-ancestor <CREATION_OID> <CURRENT_BRANCH_TIP>`: exit `0` passes, exit `1`
   blocks, and every other exit code or command error also blocks. History rewriting that drops
   `creationOid` therefore fails closed. Never compare this proof against a moving remote tip.
7. `git -C <WORKTREE_PATH> status --porcelain --untracked-files=all --ignore-submodules=none`
   is empty. Modified submodules and every unexpected tracked or untracked path make it dirty.
8. The target is neither the main worktree/`RUNTIME_STATE_ROOT` nor the execution worktree from
   which the cleanup run itself is operating.
9. No foreign or ownerless lifecycle lock or cleanup claim exists.

Any failed, unavailable, contradictory, or ambiguous proof means retain. Worktrees created before
this lifecycle existed have no record and therefore remain ineligible even if their path, branch,
or contents look familiar.

### Claim, remove, and reconcile

After explicit user confirmation, process each selected candidate independently:

1. Acquire its record lock, rerun every eligibility check, generate a cleanup run ID, and
   atomically transition `cleanup-ready` or `cleanup-failed` to `cleanup-in-progress` with
   `cleanupRunId` and `claimedAt`. These fields are the cleanup run ID and claim timestamp that
   identify the claim owner.
2. While retaining the lock, require the freshly reread record and matching receipt to still
   prove ownership `effective-flow-created`, then run only
   `git worktree remove <WORKTREE_PATH>`. Never add `--force`, and never substitute
   `git worktree prune`.
3. If removal fails, atomically persist `cleanup-failed` with the exact command error, clear the
   claim fields, release the owned lock, and continue only with independently verified
   candidates.
4. If removal succeeds, re-read Git registration, the claimed record, path state, and branch
   policy. Do not reconstruct a removed worktree. A delivery or partial-diff branch with policy
   `retain` remains. A temporary component branch with policy `delete-after-integration` may be
   removed only after its integration is still proven, and only with
   `git branch -d <BRANCH_NAME>`; never use `git branch -D`.
5. Delete only the claimed lifecycle record after absence of the worktree is proven and the
   branch policy is completely satisfied. Then release the owned lock. If worktree removal
   succeeded but record or branch handling did not, preserve the record as `cleanup-failed` when
   it can still be written by the claim owner and report partial cleanup. If persistence itself
   fails, retain the lock/claim evidence and report manual reconciliation rather than claiming
   success.

A lifecycle record whose worktree is already absent is not a normal removal candidate. Reconcile
it only while the current actor still owns the matching lock and `cleanup-in-progress` claim and
can prove the exact successful removal plus branch outcome. Otherwise retain the record and report
the missing/mismatched worktree or interrupted claim for manual reconciliation.

### Retention reasons and final reporting

Classify every linked worktree other than the main worktree deterministically. At minimum retain
and distinguish:

- the current cleanup execution worktree: cleanup is running in this worktree
- `active`: an Effective Flow run is registered as active and may still be running or may have
  been interrupted unexpectedly
- `aborted`: the owning run stopped in a controlled way
- `failed`: the owning run failed before safe cleanup readiness
- `cleanup-in-progress` or an existing lock: cleanup is claimed, active, or may have been
  interrupted; include known owner and timestamp
- dirty, locked, prunable, missing, detached, branch/OID-mismatched, receipt-mismatched, or
  repository-mismatched worktrees: name the failed proof
- reused, user-managed, foreign, or `harness-managed` worktrees: not Effective Flow-owned
- no lifecycle record or an unknown/invalid schema: ownership or lifecycle cannot be proven
- `cleanup-failed`: include the recorded or current removal failure when it is not selected or
  no longer eligible for retry

Pair each reason with a conservative next step: let the named owner finish an active run or
claim; inspect and recover work from `aborted` or `failed`; clean a still-eligible dirty checkout
before rerunning cleanup; ask the known owner before unlocking a Git-locked worktree; let the
harness or user manage external worktrees; and manually reconcile recordless, prunable, missing,
invalid-schema, foreign-lock, or partial-cleanup state. Cleanup itself never breaks a lock or
upgrades a retained lifecycle status to make it eligible.

The completion report is mandatory even when no removal candidate or migration remnant exists.
List removed worktrees, failed or partial cleanup attempts, and every remaining linked worktree
other than the main worktree. For each remaining worktree show a project-relative path when it is
inside the runtime root (otherwise its canonical path), checkout identity, lifecycle/verification
status, one concrete retention reason, and one safe next step. Never collapse several worktrees
behind a shared reason. State explicitly when no linked worktrees remain. Report unmatched
lifecycle records separately so partial cleanup evidence is not hidden.

If an issue body or non-Effective Flow comment names a target PR (`Ziel-PR: #<nr>`, `Target PR: #<nr>` or a PR URL), **"new commit on existing PR"** applies instead:

1. Do not create a new delivery branch and no new PR.
2. Fetch the head branch of the target PR, check it out in an isolated worktree or in the clean
   current checkout, issue and verify the downstream workflow's execution-location receipt, and
   update it via rooted pull/fetch operations without any rebase or force operation.
3. Implement the issue there and commit the change as a new commit on the PR branch. Existing PR commits must not be rewritten via `commit --amend`, rebase, squash or force-push.
4. Push the PR branch normally. If the push is rejected due to diverged remote history, mark the issue as failed and report the conflict instead of overwriting history.
5. Use the URL of the existing PR as the result PR link for the issue comment, epic entry and summary.

Issues with the same target PR run sequentially so that new commits are created in order on the same PR branch.

**Insufficient issues (`insufficient`):**

1. Do not implement.
2. Set label `effective-flow-needs-planning`.
3. Append a skipped comment with the list of what is missing (template above), unless the comments read in Phase 2 already contain an identical `<!-- effective-flow-apply-issues -->` skipped comment (idempotency based on the "read comments" operation).
4. Task to `completed` with the addition `[skipped]`.

**Sufficient issues (`sufficient`), each with its own verified execution root:**

1. **Immediately before delegation**, apply the started transition from "Issue implementation lifecycle" exactly once. On the forge add `effective-flow-issue-in-progress`; on an external target freshly list states, validate or gatedly confirm `tracker.externalStartedState`, and make the native transition. Preserve terminal or later-active states. A missing, stale, ambiguous, non-writable, or unconfirmable external state stops this item before code; a transition error likewise delegates nothing.
2. Delegate to the target skill determined in Phase 3 and pass along the prompt suggestion as the task description:
   - Feature: `Use the skill effective-flow build for this issue.`
   - Bugfix: `Use the skill effective-flow fix for this issue.`
   - Refactoring: `Use the skill effective-flow refactor for this issue.`
   - Documentation: `Use the skill effective-flow docs for this issue.`
     The delegation sub-agent runs as a **non-interactive** delegation (context hint "[Context from effective-flow apply-issues: …]"): no approval gate of its own, completion protocol `DONE`/`ABORT`.
     Pass the absolute root and execution-location receipt established by that delegated workflow;
     never rely on an inherited current directory or create a nested worktree around a reused
     harness-native one. Pass the literal line `Next steps: suppressed` on its own line as well:
     the delegated skill is user-invocable, but it returns its result here and this run is an
     intermediate result of `effective-flow apply`.
3. Commit the changes using resolved `language.git` for the description (Conventional Commit
   type stable, no internal IDs, no `Co-Authored-By`) and push the branch. Pass resolved
   `language.git` and `language.forge` to the delegated delivery path. If a target PR is present:
   **do not create a new PR**, but use the existing PR link and optionally extend its body by one
   exact issue reference through the helper's idempotent body patch, using the fresh body hash so
   concurrent edits fail closed. If no target PR is present: take the branch through
   `effective-flow pr` as exactly one PR against the base branch — with the literal line
   `Next steps: suppressed` on its own line, because that run returns its result here — and include
   the issue reference in the helper-validated PR payload. Choose the reference form by tracker
   target per the
   `tracker-target` forge boundary: on the forge the auto-close keyword `Closes #<issue>` (or
   `Refs #<issue>`), on an external target a plain, non-auto-closing reference to the tool-native
   identifier. Both forge keywords are machine tokens the code host parses: write them in English
   whatever `language.forge` resolves to, never translated. Never write `Closes #<number>`
   for an external issue — the code host would resolve it against its own issue of that number and
   close an unrelated one on merge. Build the exact versioned lifecycle receipt from the retained
   target, repository, relationship, issue, optional container, and container mechanism. A new PR
   contains it at creation; a reused PR is extended only after a fresh body read through the
   hash-guarded `pr-update-body` path. Invalid, duplicate, mismatched, or stale receipt state fails
   closed.
4. **Immediately after a successful push or PR creation:** write the PR-link comment through the
   helper and set label `effective-flow-issue-done`; on an external target use the resolved
   connection under the `tracker-target` write discipline. Do **not** set a native sub-item to done
   and do not tick a checklist entry. The receipt retains the optional container/mechanism until
   `effective-flow merge-gate` observes the linked issue as terminal. The pull request itself always stays
   on the forge behind `origin`.
5. **Release the worktree for cleanup:** if this issue ran in a worktree this workflow created,
   transition its lifecycle record from `active` to `cleanup-ready` under the record lock, per the
   embedded contract. The work is durably secured at this point — the branch is pushed and its pull
   request exists — so the worktree itself is no longer needed. Skipping this leaves a record stuck
   at `active`, which `effective-flow cleanup` must then retain forever. Every path out of this phase
   ends in a status: a failed delegation, a rejected push and a failed pull-request creation all set
   `failed`, a controlled stop sets `aborted`, and only a completed pull request sets
   `cleanup-ready`. A record must never be left at `active` once the issue is done with.
6. Task to `completed`.

This path creates its pull requests without the delivery completion action, so it invokes the
automatic review itself: after step 2 created a pull request, run "PR review publication" with that
pull request, whether the run is gated or a non-interactive delegation, and the residual finding set the
delegated implementation workflow reported — or its explicit declaration that it has none.
Because this tool creates one pull request per issue, ask the gated question only for the first
pull request and reuse that answer for every further pull request of this run — deliberately unlike
the security disclosure gate, whose offer is per run and never remembered, because this question
governs comment noise rather than disclosure.

**Load on demand:** Read `shared/pr-review-integration.md`, when the completion action created or reused a pull request and the automatic PR review may run.

**Error cases:**

- If the started transition, delegation (`ABORT`), push, PR creation, or guarded receipt write fails: do **not** mark the issue as done, do not set `effective-flow-issue-done`, do **not** complete the container, append a failed comment where a transition had already started the issue, and continue with the next issue. Preserve the in-progress/native state because resetting it would hide interrupted work. Task to `completed` with the addition `[failed]`.
  If the issue ran in a worktree this workflow created, transition its lifecycle record to `failed`
  with the exact reason, whether the failure happened during delegation or afterwards during push
  or pull-request creation. Retain the worktree and the branch so the work stays recoverable —
  `failed` is what makes that retention legible, where a record left at `active` would claim a run
  that may still be going.
- If an issue passed as part of a list lacks an assigned epic: implement it anyway and create a PR; the check-off is omitted and reported to the user.

Give a short status update after each completed issue.

### Phase 5: Summary

Report to the user:

- processed issues with result (implemented / skipped / failed)
- created PRs with URL
- skipped issues (`effective-flow-needs-planning`) with the reason each one was not implementable
- container entries retained for post-merge reconciliation, if containers were processed

Then delete the wisdom file and **return** that report plus the run's end state — the created pull
requests and the skipped issue references — to `effective-flow apply`, which closes the run with its own
next-step block. Name no follow-up invocation of your own here.

## Rules

- Do not modify any implementation files yourself; the implementation lies with the delegated workflows.
- Do not create a `<plan.dir>/` file; the internal planning is handled by the respective implementation workflow.
- Do not use a heuristic "newest issue" when multiple candidates exist.
- When in doubt about the sufficiency check: treat it as `insufficient` and point to `effective-flow plan-issue` instead of guessing.
- Never set a `Co-Authored-By` trailer and do not expose internal IDs in commits or comments.
- Give the user a short status update after each phase.
