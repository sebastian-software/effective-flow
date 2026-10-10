## Portable worker delegation

Names matching `effective-flow-<worker>` in this instruction identify bundled worker contracts, not installed custom-agent roles. Only the workflow/tool orchestrator starts workers or analysis fan-out. When a worker is selected, read only its matching `workers/effective-flow-<worker>.md` file, then delegate through the host harness's built-in general-purpose subagent mechanism with zero inherited turns when supported, otherwise its smallest supported history. Use that contract as the worker instructions and add a compact, self-contained handoff containing the objective, relevant artifact paths, scoped paths and ownership, execution and runtime-state roots when writes are allowed, resolved language, authority and write limits, and completion protocol. The worker is a leaf executor: it starts no child and returns missing essential context to the orchestrator. Do not request a custom role by the contract name. If built-in subagent delegation is unavailable, stop with a clear explanation; never claim that an undiscoverable worker ran.

# Effective Flow Apply Review

You are the orchestrator for the automated implementation of review report findings.

## Goal

This workflow reads an existing review report file from `.effective-flow/review/`, evaluates the developer notes per finding and delegates the implementation to the matching workflows. Findings that should deliberately not be implemented are handed by the workflow as decision candidates to the `effective-product` skill; only permanent decisions are documented as an ADR, non-permanent rejections stay in the report or tracker artifact.

If the resolved tracker target is the forge or an external tool, the workflow reads the findings from that issue tracker instead: it is passed an epic/container issue or a list of concrete finding issues, one PR is created per finding, and the container entry is checked off after PR creation. The deviations are bundled in "Remote mode (issue tracker)"; there, `wontfix` findings replace the rejecting developer note.

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

The Phase 4 delegation sub-agent per overlap component is **workflow-to-workflow** delegation, not a worker role: its non-interactive delegation contract, the overlap components, the git commit mutex, the worktree isolation, the synchronization barrier, and the `failed (delegation)` handling stay authoritative and are never replaced by inline work. The mandate adds authorization only.

**Load on demand:** Read `shared/runtime-state-safety.md`, when any wisdom, memory, cache, report, lock, or worktree mutation is imminent.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when any wisdom, memory, cache, report, lock, or worktree mutation is imminent.

**Load on demand:** Read `shared/session-title.md`, when the run's subject is fixed and whether a session title is due must be decided.

**Load on demand:** Read `shared/session-rename.md`, when the run's subject is fixed and a session title is about to be applied or emitted.

## Effective Flow configuration (project setup ADR)

The tracked configuration is a living ADR "Effective Flow project setup" (default slug
`effective-flow-project-setup`) carrying a Markdown key/value table; hidden mode keeps it in the
untracked `<RUNTIME_STATE_ROOT>/.effective-flow/project-setup.md`. `.effective-flow/` is otherwise
private, ignored runtime state, and no `config.json` is a configuration source.

### Config locator (resolution call)

Before the first configuration-dependent step, run
`node <skill-root>/scripts/config-resolve.mjs resolve` with one JSON object on standard input:
`cwd` (the checkout this run works in), `tool` (this tool's own name, e.g. `refactor`; an internal
source such as `apply-plan` passes its own), and `mode` for `iterate` (`local`/`pr`) and
`apply-review` (`local`/`remote`). The script runs the whole config locator (steps 0–4), decodes
the table, forces the hidden-mode values, and classifies retired rows; never read the ADR by hand.
Fail closed: a missing Node, a nonzero exit, or anything but one parseable envelope line
`{ ok, operation, data }` stops the run before that step, reporting the cause. Exit 3
(`RUNTIME_ROOT_UNVERIFIED`, `RUNTIME_STATE_UNSAFE`) stops with the reported check and no write,
never continuing in standard mode. `data.runtimeStateRoot` is the verified `RUNTIME_STATE_ROOT`
(`null` outside Git), `data.visibility` is `standard` or `hidden`, and `data.source` names the
resolving step and path.

### Acting on the result

- **Values** come only from `data.values[<key>]`: `value` is decoded (`true`/`false`, `null`, `[]`
  for `(empty)`, else the literal string) and `items` is the comma-split list. An absent key or
  `state: unset` is not set → the owning tool's default; `value: null` is explicit and means "ask
  at run time" (no `delivery.completion` → default `merge`; `delivery.completion | null` → ask).
  For `state: invalid`, or a value the owning tool cannot interpret, use a safe default for the
  run, name the key to the user, and do **not** guess.
- **`executionProfiles.fast.enabled`** → its `profile`. `disabled` (missing row or literal `false`)
  and `invalid` (malformed, ambiguous, or unreadable) select Quality and stop new measurement
  without rewriting persisted pilot-generation state. `enabled` (only the literal `true`) admits
  the project to the pilot lifecycle but does not start a baseline, activate a generation, prove
  native Fast capability, or itself permit Fast. Only Guided setup (advanced block 10) sets it;
  Profile and Express preserve an existing value and never enable it. It has no legacy migration
  and names no provider model.
- **`delivery.prReview`** → `ask`, `always`, or `off`; unset resolves to `ask`. What it governs is
  the owning workflow's.
- **Diagnostics** (`data.diagnostics[].code`): `unknown-tool` needs nothing; every other code is
  reported once per run. `dead-marker`, `legacy-marker`, `marker-divergence`, `legacy-slug`,
  `transitional-fallback`, and `legacy-empty-token` also point to effective-flow setup; `several-match`
  names every listed path, and a run that writes configuration (`writerStop`) ends there;
  `ambiguous-key` and `invalid-value` take the safe default above.
- **Retired rows (retired-key rule).** Each `data.retired` entry names a retired row and its
  successor. `stop` ends the run, naming both keys and effective-flow setup, and never takes the
  successor's default — the one exception to the safe-default rule; `report` is reported once and
  points to effective-flow setup while the successor wins; `none` needs nothing. Only a `stop` entry with
  `conditional: reviewer-resolved` is downgraded to one report when the run resolves no reviewer
  matching its `normalizedLogin` under "Matching a configured login"; the conditional never changes
  `report` or `none`.

**Load on demand:** Read `shared/config-migration-edge-cases.md`, when `data.visibility` is `hidden`, a `data.retired` entry's action is `stop` or `report`, or a `tracker.mode: external` run resolves `tracker.externalStartedState` or `tracker.externalDoneState`.

### Table encoding (binding for writers)

Reading creates no file and mutates no Git; only effective-flow setup creates or changes the ADR, the
markers, the local hidden configuration, and the migration. It writes a flat two-column table
under English `## Configuration` with `| Key | Value |` or German `## Konfiguration` with
`| Schlüssel | Wert |`. Keys and encoded values stay English in both envelopes, and a normal update
preserves the existing envelope language; changing `language.documentation.technical` does not
translate an existing ADR.

- **Boolean** → `true` / `false`; **String** → literal and unquoted (e.g. `origin/main`); a writer escapes every literal `|` in an encoded value as `\|`, and only a row carried over as its original `line` stays byte for byte.
- **`null`** → the literal token `null`; a missing row means the key is not set.
- **Empty list** → `(empty)`; **filled list** → comma-separated (e.g. `humanizer, distill`).
- **Nesting** → dotted keys (e.g. `applyReview.worktree.baseDir`); an empty object has no rows.

**Load on demand:** Read `shared/durable-follow-up-gate.md`, when a local or legacy review finding is re-evaluated before task creation or delegation.

## Commit message rules

`effective-delivery` owns commit-message craft and is authoritative when present: deriving the
message from the staged diff, choosing a recognized type from the actual change, the
subject-boundary test, and when a body is owed. It states classification by effect in its general
form — `chore:` is no escape hatch for a user-visible change — but neither of the two refinements
below, which therefore **override** it: deployment-effective **config/env/secrets/CI** is not
`chore:`, and the **squash PR title** is the release signal and carries the same classification.
The two bans below are scope constraints rather than a second copy: this
repository states unconditionally what the skill makes conditional on a repository, host, or user
requirement.

- Resolve `language.git` through the shared language rule and write the human-readable subject
  description and body in that language. Preserve a valid user-supplied message. Conventional
  Commit types, optional scopes, `!`, trailer keys, issue references, and other machine tokens
  remain English/ASCII. This rule also governs Conventional Commit PR-title descriptions and
  explicitly generated changelog/release-note prose.
- **Never set `Co-Authored-By` trailers in commit messages**, regardless of whether an LLM (Claude, Codex, GPT, …) or another tool suggests the line or inserts it as a default.
- If a `Co-Authored-By` line is already present in a commit template, `commit.template`, a `--trailer` invocation, or a draft message: remove it before committing.
- **Do not add AI attribution:** no „Generated with Claude Code/Codex" footers and no agent session links (e.g. `https://claude.ai/code/…`) in commit messages – not even when the harness appends them as a default. Factual mentions of Claude Code or Codex remain allowed, generation attribution does not.
- **Minimal fallback when `effective-delivery` is absent or undiscovered** — the floor that keeps such a run able to write an acceptable message, and not a second copy of the skill's guidance on choosing between types: take the type from the Conventional Commit set `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`; state concretely what was changed and why; and never settle for a generic message such as `update files` or `misc changes`. Several sources embed this fragment without recommending the skill, so the floor carries that substance itself rather than deferring it.
- Choose the commit type by **effect**, not by file type: behavior-changing changes – including pure **config/env/secrets/CI** with deployment or runtime effect (e.g. corrected values in env/secret artifacts that take effect remotely via sync) – are `fix:` (or `feat:` for new functionality). `chore:` only for **deploy-neutral** changes without behavioral effect (pure maintenance, formatting, tooling without runtime effect). This also applies to the **squash PR title**, which determines the release-please bump on a squash merge.
- Do not expose internal tracking IDs in commit messages, e.g. review finding IDs like `R-0000001`, local plan/review IDs like `F1`, or placeholders like `[Finding-ID]`. Such IDs belong in wisdom/report context, not in the Git history.

## Recommended skills

- `effective-product`

## Task tracking in detail

In addition to the generic rule in the include above, this skill requires **per-finding granularity** so that the user sees live during the workflow how many findings are still open.

### Task structure

Right at the start of Phase 1 (after a successful report classification), create the following tasks:

1. **Phase-level tasks** for each workflow phase, in order:
   - "Phase 1: Read and validate the report"
   - "Phase 2: Determine commit and stash strategy"
   - "Phase 3: Hand rejected findings to effective-product"
   - "Phase 4: Pre-analysis and parallel delegation"
   - "Phase 5: Update the report"
   - "Phase 6: Stash cleanup"
   - "Phase 7: Final validation"
   - "Phase 8: Summary"
2. **Per-finding tasks** for each implementable finding from the classification in Phase 1 (not for "Already implemented" or "Do not implement" findings):
   - Subject: `Implement finding R-XXXXXXX` (with the concrete finding ID)
   - Initial status: `pending`

### Task lifecycle

- **Phase-level tasks:** to `in_progress` before the phase starts, to `completed` after completion. Phase 1 is already active when the tasks are created → set it to `in_progress` directly after creating them and to `completed` after Phase 1 is complete.
- **Per-finding tasks:**
  - `in_progress`: as soon as the pre-analysis for this finding starts in Phase 4.1.
  - `completed`: as soon as the delegation in Phase 4.3 reports `DONE` for this finding.
  - **On `ABORT` in Phase 4.1 or 4.3:** set to `completed` anyway (an open task line would block the list), but extend the subject with `[failed]` so the user recognizes the status.
- **On an early overall abort** (e.g. no implementable findings in Phase 1, report not found): set all still-open `pending` and `in_progress` tasks to `completed` and extend their subjects with `[aborted]` before the skill ends with `DONE`.

### Important

- Create **all** tasks (phase-level and per-finding) at the end of Phase 1, directly after a successful classification. That way the user sees the full list before any parallel sub-agents start.
- Update tasks promptly: each lifecycle change directly after the event (not batched at the phase end).

## Project conventions

If the project has an `AGENTS.md`, read it early in the workflow and honor its rules.

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

- the stash baseline from Phase 1 (list of already-existing stash references with descriptions and commit hashes)
- the pre-analysis per finding from Phase 4.1 (affected files, root cause / requirement, implementation sketch, risks, confidence)
- the computed components from Phase 4.2
- implemented findings and their result
- failed delegations
- rejected findings and their result (permanent decision with ADR slug or non-permanent without ADR)

Write a summary after each phase and pass it to later phases. Delete the file at the end.

## Effective Flow configuration

Effective Flow-internal files live under `.effective-flow/` in the verified main checkout.
Retain `EXECUTION_ROOT` and `RUNTIME_STATE_ROOT` separately from the first source-resolution
step through final cleanup. Every path below is resolved as an absolute handle below
`RUNTIME_STATE_ROOT`; entering a component worktree changes only `EXECUTION_ROOT`.

- Configuration: Effective Flow configuration from the project-setup ADR (see building block "Config migration")
- Memory file: `.effective-flow/memory.json`
- Cache file: `.effective-flow/cache.json`
- Review reports: `.effective-flow/review/`
- Temporary wisdom files: `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`

`apply-review` works without a fixed configuration. If the Effective Flow configuration (project-setup ADR) fixes apply-review values, they override the defaults (schema shown here for illustration):

```json
{
  "applyReview": {
    "defaultCommitStrategy": null,
    "finalValidation": "full",
    "stashPolicy": "interactive",
    "worktree": {
      "baseDir": ".effective-flow/.worktrees",
      "setup": "auto"
    }
  }
}
```

Missing values have these defaults:

- `applyReview.defaultCommitStrategy`: not set (the commit strategy is asked)
- `applyReview.finalValidation`: `full`
- `applyReview.stashPolicy`: `interactive` (today's interactive per-stash prompt)
- `applyReview.worktree.baseDir`: `.effective-flow/.worktrees`
- `applyReview.worktree.setup`: `auto`

Valid values:

- `applyReview.defaultCommitStrategy`: `worktrees`, `single`, `none`
- `applyReview.finalValidation`: `full`, `changedScope`, `off`
- `applyReview.stashPolicy`: `interactive`, `keep`, `discard`, `apply`
- `applyReview.worktree.setup`: `auto`, `none` or an explicit setup command as a string

### Config migration

Reading the Effective Flow configuration from the project-setup ADR (including the `applyReview` keys) and the one-time migration of a legacy config are handled centrally by the building block "Config migration" (`config-migration.md`); this building block no longer runs its own per-block migration for `applyReview`. The `applyReview` config schema above (configuration, valid values) remains unaffected by this.

### Cache file

Persistent cache data lives exclusively in `.effective-flow/cache.json`, not in `.effective-flow/memory.json` and not permanently in wisdom files.

`apply-review` may use this cache area:

| Area                  | Content                                                                               | Invalidation                                            |
| --------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `applyReviewAnalysis` | Pre-analysis results per report finding for interrupted or repeated apply-review runs | Report file hash, finding ID, relevant code file hashes |

Rules:

- Each cache entry needs `version`, `createdAt` and `sourceHash` or equivalent invalidation data.
- On uncertainty, a missing file, invalid JSON, a version change or invalidation that cannot be checked unambiguously: ignore the cache and recompute normally.
- Do not overwrite invalid cache files; briefly inform the user and continue without the cache.
- Do not cache user decisions about conflicts, stashes or ADR rejections.
- Do not use outputs of failed delegations as a basis for later successful runs.
- Wisdom files remain temporary in-run storage and are deleted at the end.

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

## Remote mode (issue tracker)

If the resolved tracker target is the forge or an external tool (the argument is an epic/container or finding issue), read and follow the internal sub-file `tools/apply-review-remote.md` **before** the local report flow. It contains the issue-tracker integration, the external-target contract, and the complete remote flow (phase 1–8 remote), and replaces or supplements the corresponding local steps. Only on the `local` target (report file under `.effective-flow/review/`) is it not loaded.

**Hidden mode stops the remote flow.** When the configuration resolves `visibility: hidden` (the main checkout's local configuration, config locator step 0) and the argument is an epic/container or finding issue, stop before loading the sub-file and before any tracker access or write, with one message: hidden mode is active, it pins the tracker to `local`, and remote apply-review would write tracker labels and markers. A local report file is processed normally.

## Workflow

### Phase 1: Read and validate the report

First determine the tracker target via the "apply-source detection" (report file under `.effective-flow/review/` → `local`; epic/container or finding issue → the target that reference belongs to, the forge or an external tool). For any target other than `local`, read and follow the internal sub-file `tools/apply-review-remote.md` (phase 1 remote and following) instead of the report-file steps 4–7 below; the config, stash and cache steps still apply.

1. Establish the verified dual-root execution receipt before resolving the source. Load the
   Effective Flow configuration, migrate it if necessary and determine the commit-strategy
   default, stash policy, worktree defaults and final validation profile.
2. Read the absolute `<RUNTIME_STATE_ROOT>/.effective-flow/cache.json` handle, if present and
   valid. Use only valid `applyReviewAnalysis` entries.
3. **Capture the stash baseline:** run `git stash list` and remember the full list of already-existing stash references (e.g. `stash@{0}`, `stash@{1}`, ... with their descriptions). Record the baseline in the wisdom file so that Phase 6 (stash cleanup) can later distinguish new stashes created by this workflow from it. If `git stash list` is empty: note "no baseline stashes".
4. Determine the report file:
   - if passed as an argument: use the absolute report handle returned by apply-source detection
   - otherwise: search for `review-report-*.md` only in the absolute
     `<RUNTIME_STATE_ROOT>/.effective-flow/review/` directory
   - with multiple reports: ask the user which one to use
   - if no report is found: error message and abort
5. **Read the file fresh from its retained absolute report handle.** Since the file can be
   deleted and recreated between conversations, no previously read content may be used.
   Revalidate the runtime root and handle containment first; never substitute a same-named file
   below the current execution root.
6. Detect and preserve the complete local report language, then parse all findings
   (`### [R-XXXXXXX] ...` blocks) using either complete English or German field labels:
   - finding ID and title
   - `Severity`
   - `Complexity`
   - `Area`
   - `File`
   - `Problem`
   - `Recommendation`
   - `Action` (`effective-flow fix`, `effective-flow refactor`, `effective-flow build`, `effective-flow docs`)
   - `Prompt suggestion`
   - `Developer note` (if present)
   - `Status` (if present) and already present implementation hints (✅)
   - the admission outcome, reason, gate version, evidence digest/reference, current-reachability
     anchor, and root-cause signature (when present)

   When reading an existing local report, also accept the historical German field aliases
   `Schweregrad`, `Komplexität`, `Bereich`, `Datei`, `Empfehlung`, `Aktion`,
   `Prompt-Vorschlag`, and `Entwickler-Anmerkung` / `Entwicklernotiz` / `Entwickler-Notiz`.
   Legacy values remain readable as well: severity `Kritisch` / `Wichtig` / `Hinweis`,
   complexity `Leicht` / `Niedrig` / `Mittel` / `Hoch`, and status `Offen` / `Behoben` /
   `Umgesetzt` / `Nicht umgesetzt`. Updates use the report's preserved language; action values,
   finding IDs, paths, and other machine tokens remain stable. A mixed/unclear report is not
   rewritten automatically. Remote issues independently use `language.forge`.

7. After freshness and exact-signature deduplication, validate admission before task creation or
   delegation. An explicit current `Admission outcome: admitted` record with all stable gate fields
   is implementable. Re-evaluate a legacy finding that lacks the record; open status or Importance
   is insufficient. A credible qualifying path with incomplete evidence is `uncertain` and blocks
   for the one bounded evidence/containment check. A finding without a credible qualifying
   consequence is `closed`: append one dated gate note carrying outcome, reason, gate version,
   normalized signature, evidence digest, and reachability anchor, then skip it idempotently while
   those inputs remain unchanged. Gate rejection never becomes an ADR candidate.
8. Classify each admitted or separately rejected finding:
   - **Already implemented:** the finding already has a ✅ hint → skip
   - **Already published as an issue:** the finding carries a 🔓 publication note (`Published as #<nr>` / `Veröffentlicht als #<nr>`) from the security disclosure gate → do not implement it from the report, because the local report and the issue would otherwise be implemented twice. Collect these findings with their issue numbers for the handover in step 9; the local flow never processes them silently. If a note is present but its issue number is unreadable or ambiguous, ask instead of guessing, and do not treat the finding as implementable in the meantime.
   - **Do not implement:** the developer note begins with "Do not implement" (the German form "Nicht umsetzen" is also recognized) → hand to `effective-product` as a decision candidate (ADR only for a permanent decision)
   - **Implement:** no ✅ hint, no rejecting note, and no publication note → delegate to a skill
   - **Implement with context:** a developer note is present that does not begin with "Do not implement" / "Nicht umsetzen" → delegate to a skill, passing the note as additional context
9. Give the user an overview:

```markdown
**Report:** [filename]
**Date:** [date from report]

| Status | Count |
|---|---|
| To implement | X |
| Do not implement (→ effective-product) | Y |
| Already implemented | Z |
| Already published (→ issue) | P |
| Closed by admission gate | C |
| Total | N |
```

10. **Hand over published findings:** If findings carry a publication note, name each one with its issue number and output the concrete re-entry `effective-flow apply #<nr> [#<nr> …]`, which processes them through the remote flow. Never drop them silently — the argument type decides the mode, so a report file cannot enter the remote flow by itself.
11. If no implementable findings and no rejected findings remain, report that briefly and end. A
    report containing only closed findings emits no substitute workflow recommendation. Published
    findings use the concrete handover from step 10.

### Phase 2: Commit and stash strategy

This phase is the workflow's only up-front strategy gate: the commit strategy and stash policy are determined here together, before the findings are worked through. After that no further **regular** approval gate follows; the remaining stops are exclusively conflict-driven data-integrity escalations: an `apply` merge conflict in Phase 6, a high-risk cherry-pick conflict in Phase 4.3 under the "Individually with worktrees" strategy and — rarely — an orphaned commit lock under the "Individually" strategy. With a non-`interactive` `applyReview.stashPolicy`, phases 3–8 therefore run through without a further stop if no such escalation occurs; with the default `interactive` policy, the stash decisions in Phase 6 and Phase 4.3 are additional stops.

If `applyReview.defaultCommitStrategy` is validly set, skip the ASK question and use the configured strategy:

- `worktrees` → **Individually with worktrees**
- `single` → **Individually**
- `none` → **No commits**

Briefly report that the commit strategy was taken from the Effective Flow configuration (project-setup ADR). If no valid value is set, ask as before:

If no valid value is set for `applyReview.defaultCommitStrategy`: Ask the user: **Which commit strategy should be used for the findings?**
Before asking, score each option for this context: start its description with "n/10 – <short reason>; " before the original text (1–2 not recommended, 3–4 weak, 5–6 viable with trade-offs, 7–8 good fit, 9–10 clearly right; a 9–10 names its edge over the next-best option unless the two are tied; equal fit gets equal scores); keep the listed options in order, leave labels unchanged except for chat-language translation, and add neither a "(Recommended)" marker nor a translated equivalent.
- Individually with worktrees -- Parallel components run in isolated git worktrees and are integrated back afterwards
- Individually -- Each finding is committed individually after implementation
- No commits -- All changes are made without automatic commits

Record the answer and pass it to each delegated skill as an instruction:

- **Individually with worktrees:** each parallel component works in its own git worktree, commits the findings individually there, and the orchestrator then integrates the commits back into the original branch sequentially via `git cherry-pick`. Commit messages follow the same rules as for "Individually": a concrete Conventional Commit message, no internal finding IDs, no `Co-Authored-By`.
- **Individually:** commit the changes after each completed finding. Use a concrete Conventional Commit message without an internal finding ID, e.g. `fix: clarify review decision filtering`. **Never** set a `Co-Authored-By` trailer (not even for LLMs); this applies to every commit created by this workflow or a delegated sub-agent. Log the mapping of finding ID to commit hash in the wisdom file directly after each successful commit.
- **No commits:** no automatic commits, the user commits themselves.

#### Stash policy

Part of the same up-front gate: the stash policy determines in advance how the stash cleanup in Phase 6 (classes B/C/D) and the abort cleanup in Phase 4.3 handle stashes left behind — for every value except the default `interactive`, without a later follow-up question. Concrete stashes do not yet exist at the start; therefore the policy is decided, not the individual case.

If `applyReview.stashPolicy` is validly set, skip the ASK question and use the value; briefly report that the stash policy was taken from the Effective Flow configuration (project-setup ADR). If no valid value is set, ask at the same gate as the commit strategy:

If no valid value is set for `applyReview.stashPolicy`: Ask the user: **How should stashes left behind during the run be handled when a decision is needed?**
- Interactive -- Ask per affected stash (today's behavior, blocks unattended runs)
- Keep -- Keep unclear stashes unchanged and report at the end (safe for unattended runs)
- Discard -- Discard unclear stashes (git stash drop) — possible data loss
- Apply -- Apply unclear stashes (git stash pop); on a merge conflict it still asks

Value mapping: Interactive → `interactive`, Keep → `keep`, Discard → `discard`, Apply → `apply`. Record the chosen policy in the wisdom file. For an unattended non-interactive delegation, `keep` is the safe value; `interactive` blocks such runs at Phase 6 and Phase 4.3.

#### Commit mechanics per strategy

The detailed mechanics of the committing strategies — **Individually** (git commit mutex) and **Individually with worktrees** (worktree isolation including cherry-pick conflict assessment) — are in the internal sub-file `tools/apply-review-commit-mechanics.md`. Read it once the strategy is fixed in Phase 2 and commits are created; with **No commits** it is omitted. The later phases refer to this sub-file for the detailed rules.

### Phase 3: Rejected findings → decision candidate (delegation to `effective-product`)

The ADR authoring is owned by the host skill `effective-product` (domain owner: ADR merit, repo-convention detection, lifecycle, supersession, index — one branch of the broader product-decision scope that skill carries). This workflow **no longer authors an ADR itself** and encodes neither `docs/adr/`, nor numbering, status text or a fixed template. Effective Flow keeps the **mapping** (finding + developer note → decision candidate), the approval/status flow, the **backlink** to the report/remote issue and the tracking of the result artifact in the summary.

First survey the available skills:

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

**Load on demand:** Read `shared/adr-convention.md`, when Phase 3 handles at least one rejected finding — a local "Do not implement" / "Nicht umsetzen" note or a remote `wontfix` finding (Phase 3 remote) — before its decision candidate is formed.

For each finding with a "Do not implement" note (German "Nicht umsetzen" also recognized; in remote mode: `wontfix` finding, with a `wontfix` rationale instead of a developer note):

**In hidden mode** (`visibility: hidden`) no tracked ADR is written, neither by `effective-product` nor by the fallback below: hand the candidate over for classification only, record a permanent decision in the local review report instead, and report in the status update that hidden mode withheld the ADR and which decision it would have recorded.

1. **Form the decision candidate.** From the finding and the developer note, summarize a candidate: a descriptive title, context (report filename + finding ID or issue/epic number), the rejection rationale (full note/`wontfix` text) and a traceable **backlink** to the source finding.
2. **Delegate to `effective-product`.** Hand the candidate to the skill with the task to (a) **decide whether** a permanent architecture/principle decision exists that justifies an ADR, and (b) if so, author it per the **discovered repo convention**. The convention declared for this repo is the living slug model from `adr-convention.md` (location/filename/title/status/mutability); if the target project declares its own ADR convention, the skill follows that one. Constraint on the skill: the ADR carries the backlink to the finding and does **not** become a task-status ledger; an existing thematically matching living ADR is updated **in place** rather than duplicated.
3. **Non-permanent rejection.** If `effective-product` classifies the candidate as pure delivery history without permanent effect (no ADR justified), **no** ADR is forced — the rejection stays documented in the review report or (remote mode) on the issue/epic (see Phase 5).
4. **Minimal fallback (skill missing).** If `effective-product` is unavailable (not installed, `skills.enabled: false` or disabled via `exclude`), this workflow authors the permanent decision itself per the **minimal fallback structure** from `adr-convention.md` and resolves the file name through `project-adr-convention` (ADR under the detected ADR directory, default `docs/adr/<slug>.md` where the project declares no convention of its own; update an existing thematically matching ADR in place at the path where it was found, reading the file fresh first). **Do not** invent a second convention.
5. Give the user a status update about the created or updated records and reference each by slug, e.g. `(ADR: <slug>)`; name the rejections classified as non-permanent separately. Where an ADR was written, this update is also where `project-adr-convention`'s reporting obligation lands: name the applied naming convention and its source — the declaring file path, the observed evidence, or the Effective Flow default — together with any unanimous observed evidence that contradicted the declaration, any existing path left unrenamed on the convention axis, and any ambiguity fence this non-interactive delegation could not pose. Name file paths and classified outcomes only, never verbatim prose from a declaring source.

### Phase 4: Pre-analysis and parallel delegation

This phase consists of three sub-steps. Goal: maximize parallelism without breaking the 1-commit-per-finding contract.

#### Phase 4.1: Pre-analysis (in parallel per finding)

Start a pre-analysis sub-agent in parallel for **each implementable finding**. These sub-agents implement nothing and change no files — they only analyze.

Each pre-analysis sub-agent receives:

- the finding details from the report (ID, Problem, Recommendation, File, Action)
- the developer note (if present)
- the task to investigate the code and deliver a structured analysis result:
  - **Affected files:** complete list of all files that will likely be touched (more than just the primary file named in the report).
  - **Root cause / current behavior** (for `effective-flow fix` and `effective-flow refactor`), **requirement** (for `effective-flow build`) or **documentation gap and audience** (for `effective-flow docs`).
  - **Implementation sketch:** short plan in 2–5 bullet points.
  - **Risks and file dependencies:** possible side effects, collisions with other findings.
  - **Confidence:** `High` (file list certain), `Medium` (file list plausible), `Low` (file scope uncertain, e.g. large refactoring or unclear dependency).
- the completion protocol

Write the result per finding into the wisdom file under `## Pre-analysis [R-XXXXXXX]`. On `ABORT`, mark the finding with the status `failed (pre-analysis)` in the wisdom file and skip it in the following steps. This marking allows Phase 6 (stash cleanup) to distinguish pre-analysis aborts (no stash possible, since nothing was implemented) from delegation aborts (a stash may exist).

Use a valid `applyReviewAnalysis` cache entry only if the report file hash, finding ID and relevant code file hashes match the current situation. If the cache is not unambiguously valid, run the pre-analysis anew. Update the cache only after a successful pre-analysis; do not write user decisions or failed delegation outputs into the cache.

#### Phase 4.2: Form overlap components (locally in the orchestrator)

Form the parallelization units **globally across all implementable findings of all action groups** (`effective-flow fix`, `effective-flow refactor`, `effective-flow build`, `effective-flow docs`), based on the file lists from Phase 4.1. A finding's action group later only determines which skill implements it (Phase 4.3), **not** the grouping: two findings that touch the same file may never run at the same time — not even if their actions differ. The approach is explicitly two-stage:

1. **Partition** all findings (across actions) into two sets:
   - **Low-confidence set:** findings with confidence `Low` (file scope uncertain).
   - **Rest set:** findings with confidence `High` or `Medium`.
2. Apply **union-find to the rest set of all action groups together**:
   - Initialize each finding of the rest set as its own component.
   - For each file path named by more than one finding of the rest set: union the components of the involved findings — regardless of their action group.
   - Result: two findings are in the same component exactly when they are connected via a chain of file overlaps (also transitively: if A–B and B–C each share a file without A–C overlapping directly, A, B, C land in the same component; also star-shaped: if A shares a file each with B and with C without B–C overlapping, all three land in the same component too). A component may contain findings of multiple action groups.
3. Add the **low-confidence set as one shared safety component** to the result. This component runs internally sequentially because the file scope is uncertain and parallel singleton streams could otherwise modify the same file without union-find recognizing the conflict.
4. Order within a component: order as in the report (deterministic). No severity sorting — severities can imply dependencies. Each finding keeps its action group; it decides the target skill in Phase 4.3.
5. Order **of the components** relative to each other: deterministic by the report position of their first finding. This order is at the same time the integration order in worktree mode (Phase 4.3, step 7).
6. Result: a global list of overlap components, each with 1–N findings (possibly of mixed action).

Edge cases:

- If all findings are confidence `Low`, a single safety component with all findings arises; the union-find step is omitted.
- If there is exactly one implementable finding, the result is always a single component.
- A finding that shares a file with no other finding remains its own component and runs in parallel with the rest.

Example (across actions) with five findings over multiple actions:

- F1 `[fix] src/auth.ts` and F2 `[refactor] src/auth.ts` → component A (sequential, mixed action: F1 via `effective-flow fix`, F2 via `effective-flow refactor`)
- F3 `[fix] src/billing.ts` → component B (parallel to A)
- F4 `[docs] docs/guide.md` and F5 `[build] docs/guide.md` → component C (parallel to A and B, internally sequential)
  Three parallel streams. The earlier separate-per-action grouping would have put F1 and F2 into different streams and let both write to `src/auth.ts` at the same time.

#### Phase 4.3: Parallel delegation

1. Start a delegation sub-agent for each **overlap component** from Phase 4.2. All components run in parallel (by construction they share no file); within a sub-agent its findings are worked through **sequentially** in component order — even if the component contains findings of multiple action groups.
   - With commit strategy `Individually with worktrees`: create the worktree and its separate
     execution-location receipt per component beforehand. Pass the sub-agent the canonical
     absolute root and receipt; do not rely on an inherited or assigned persistent working
     directory.
2. Each delegation sub-agent receives directly embedded in the prompt:
   - the finding details (ID, Problem, Recommendation, Prompt suggestion, File)
   - the corresponding pre-analysis from Phase 4.1 as an **inline context block** in the prompt — not as a reference to the wisdom file. The sub-skills do not read the wisdom file; they only process the prompt content. Embed the pre-analysis in full, for example under the heading `Pre-analysis for this finding:`.
   - the developer note (if present)
   - the commit strategy from Phase 2
   - **With commit strategy "Individually":** the full git commit mutex rule from `tools/apply-review-commit-mechanics.md`. The sub-agent must run every finding commit under the retained absolute `<RUNTIME_STATE_ROOT>/.effective-flow/apply-review-commit.lock` handle, may only stage finding-owned files and may never use `git add .`, `git add -A` or `git commit -a`.
   - **With commit strategy "Individually with worktrees":** the full git worktree isolation
     and execution-location rule from `tools/apply-review-commit-mechanics.md`. The sub-agent
     first verifies its component receipt, roots every operation there, commits each finding
     individually and logs commit hashes in the wisdom file. It must not switch into or operate
     on the original integration root.
   - the task to call, for **each** finding, the skill matching its action group (in mixed components thus determined anew per finding):
     - action fix: `Use the skill effective-flow fix for this finding.`
     - action refactor: `Use the skill effective-flow refactor for this finding.`
     - action build: `Use the skill effective-flow build for this finding.`
     - action docs: `Use the skill effective-flow docs for this finding.`
   - the prompt suggestion from the report as the task description
   - **Stash convention:** if any stash arises during the implementation of this finding (through a pre-commit hook, a manual `git stash` in the sub-skill or a tool-triggered stash), **the stash message must contain the finding ID**, e.g. `apply-review R-XXXXXXX <short description>`. This allows the stash cleanup in Phase 6 to reliably assign the stash to the finding.
   - the note that the sub-agent runs as a **non-interactive** delegation sub-agent of `effective-flow apply-review` and therefore opens no approval gate of its own. `effective-flow apply-review` steers the run at its own gate.
   - the literal line `Next steps: suppressed` on its own line. Each delegated skill is
     user-invocable and would otherwise close a per-finding recommendation into the chat, although
     it returns its result here and this run is an intermediate result of `effective-flow apply`.
   - the completion protocol
3. Check each sub-agent for `DONE` or `ABORT`.
4. On `ABORT`:
   - inform the user, mark the finding as `failed (delegation)` in the wisdom file.
   - **Before the next finding of the same component:** check via `git status` whether the working tree is clean. If uncommitted changes are present (a half-finished file from the aborted finding), clean the working tree per the `stashPolicy` fixed in Phase 2 before the next finding starts — otherwise it works on an inconsistent state:
     - `interactive` → ask the user whether to stash or discard the changes.
     - `keep` and `apply` → stash with the finding ID (`git stash push -m "apply-review abort R-XXXXXXX"`); `apply` makes no sense here, since this is about cleaning up before the next finding, and is therefore treated like `keep`.
     - `discard` → discard the changes.

     In every case, stash with the finding ID in the message so that Phase 6 can assign the stash.

   - Continue with the next finding within the same component. Other components keep running independently.

5. Give the user a status update after each completed component with the result per finding.
6. **Synchronization barrier before Phase 5:** start Phase 5 only when **all** delegation sub-agents started in Phase 4.3 have delivered a final status (`DONE` or `ABORT`).
7. With commit strategy `Individually with worktrees`: after the synchronization barrier,
   revalidate the original execution-location receipt and integrate all successful worktree
   branches sequentially via rooted `git cherry-pick` operations, in the **deterministic
   component order from Phase 4.2, step 5** (components by report position of their first
   finding; within a component the finding commits in component order). This fixed order makes
   the integration result reproducible. Phase 5 may only start once this integration is
   complete or the workflow has been halted due to a conflict/user decision.
8. A status update after a completed component is **not** a completion message of the overall workflow and **not** a halt. After each status update you actively check which delegation components are still running, wait for their final status and continue Phase 4.3 until no component is open anymore.

#### Known limitations

- **Cross-action file conflicts are detected:** the overlap components from Phase 4.2 are formed globally across all action groups. Findings that affect the same file therefore land in the same component and run sequentially — even with different actions they never write to a working tree at the same time. Remaining limitation: the detection is only as accurate as the file lists of the pre-analysis (Phase 4.1). If a finding touches a file at runtime that its analysis did not name, an overlap may go undetected; low-confidence findings with an uncertain file scope are covered here by the shared safety component.
- **Low-confidence findings** run across actions in a shared safety component sequentially, because their file scope is uncertain.
- The git commit mutex only isolates staging and commit in the original worktree. Worktree mode additionally isolates the working tree and git index, but shifts possible conflicts into the sequential cherry-pick integration (in deterministic component order).

### Phase 5: Update the report

**Precondition:** Phase 5 may only start once the synchronization barrier from Phase 4.3 is satisfied, i.e. no delegation component is open anymore.

1. Read the report file again fresh from the file system. The file could have changed during implementation.
2. Append to each successfully implemented finding as the last entry in the preserved report
   language: `✅ Implemented on YYYY-MM-DD via Effective Flow Apply-Review` or
   `✅ Umgesetzt am YYYY-MM-DD über Effective Flow Apply-Review`.
3. Append to each rejected finding as the last entry — depending on the classification by `effective-product`:
   - permanent decision with ADR: use matching English/German prose and retain `(ADR: <slug>)`
   - non-permanent rejection without ADR: use matching English/German prose; IDs and references
     remain stable
4. Save the updated report file.

### Phase 6: Stash cleanup

During the delegation in Phase 4, the called sub-skills or pre-commit hooks may create new stashes that remain without cleanup. This phase finds and handles them.

1. Run `git stash list` and compare the result with the baseline captured in Phase 1.
2. Determine the **new stashes** as all entries present in the current list but not in the baseline. Do not compare via `stash@{N}` indices (they shift), but via the full description (branch + commit hash + subject) and ideally additionally via the stash commit hashes (`git stash list --format='%H %gs'`).
3. If no new stashes are found: briefly output "No open stashes from this run." and go to the next phase.
4. **Stash-finding assignment:** determine for each new stash the corresponding finding via the following heuristics — in this priority:

   1. **Stash-message match (primary):** search via regex `R-\d{7}` in the stash message. On a match the assignment is unambiguous.
   2. **File overlap (fallback):** if no ID in the message: compare the changed files of the stash (`git stash show --name-only stash@{N}`) with the files logged per finding in the wisdom file. A significant overlap counts as an assignment.
   3. **No assignment:** if neither a message match nor a clear file overlap → the stash belongs to no finding from this run (e.g. from an external pre-commit hook).

5. **Classify each stash:**

   **A. Finding fully implemented AND stash content fully contained in the commit for the finding:**
   - Read the status of the assigned finding from the wisdom file. "Fully implemented" means: status `DONE` from Phase 4.3.
   - Fetch the commits belonging to this finding from the `finding ID -> commit hash` mapping logged in Phase 4.3; with "No commits" this path is omitted — see classification D below.
   - Compare `git stash show -p stash@{N}` with `git show <commit>` for the changed files. If the stash diff has been fully absorbed into the finding commit content-wise (the stash content is a subset of the commit changes) → **stash is an intermediate state, no longer needed**.

   **B. Finding fully implemented, but the stash contains changes that are NOT in the finding commit:**
   - The stash could contain a forgotten partial fix or unused intermediate state — user decision required.

   **C. Finding failed (status `failed (delegation)` or `failed (pre-analysis)`):**
   - The stash is potentially the only trace of the partial work — user decision required.

   **D. No finding assigned OR commit strategy "No commits":**
   - With "No commits" there is no commit to compare against → no auto-drop possible.
   - User decision required.

6. **Handle each stash based on its classification:**

   **Apply the stash policy from Phase 2:** class A remains auto-drop in all policies. Classes B/C/D follow the `stashPolicy`. The class steps below describe the case `stashPolicy = interactive` (default), which asks the stash question per stash. With the other values the question is omitted and you act directly: `keep` → keep the stash unchanged and note it as "kept" for the Phase 8 summary; `discard` → `git stash drop`; `apply` → `git stash pop` and on a merge conflict do **not** drop, but escalate to the user (the only remaining stop in the otherwise unattended run).

   - **Class A:** drop without asking.
     - `git stash drop stash@{N}`
     - Log to the user: "Stash for `[R-XXXXXXX]` discarded — finding fully implemented, intermediate state no longer needed."

   - **Class B:** inform the user and ask.
     - Show the stash description, affected files and the note: "Finding `[R-XXXXXXX]` was implemented, but the stash contains changes that did not flow into the commit — possibly a forgotten partial fix."
     - Ask the stash question below.

   - **Class C:** inform the user and ask.
     - Show the stash description, affected files and the note: "Finding `[R-XXXXXXX]` failed, the stash could be an incomplete attempt."
     - Ask the stash question below.

   - **Class D:** inform the user and ask.
     - Show the description and content (`git stash show -p stash@{N}`).
     - Ask the stash question below without a finding reference.

   Stash question (for classes B, C and D; only with `stashPolicy = interactive`):

Ask the user: **How should this stash be handled?**
- Apply and delete -- Run `git stash pop` and take the content into the branch
- Discard -- Run `git stash drop`, the content is lost
- Keep -- Leave the stash unchanged

7. Execute the decision — the interactive answer with `stashPolicy = interactive`, otherwise the policy action from step 6:
   - **Apply and delete:** `git stash pop stash@{N}`. On conflicts: inform the user, offer manual resolution, do not automatically drop the stash until the conflict is resolved.
   - **Discard:** `git stash drop stash@{N}`.
   - **Keep:** no action.
8. Important: after each `pop`/`drop` action the `stash@{N}` indices shift. Therefore read the list anew after each action and match via the description/commit hash captured in step 2, not via old indices.
9. Give the user a short status update about all handled stashes (automatically discarded, manually handled, kept). Record the list of kept stashes (reference and description) for the Phase 8 summary.

### Phase 7: Final validation

1. Observe `applyReview.finalValidation`:
   - `full`: the current project-wide quality gate.
   - `changedScope`: use only existing fast or scope-aware checks if the project offers them; do not invent your own tool arguments. If no such check exists, run a one-time standard check and do not start a global fix loop.
   - `off`: explicitly skip final validation, create no validation-fix commit and name the residual risk in the summary.
2. If `off` is active: after a short message go to Phase 8.
3. Check whether a validation script is configured in the project (e.g. `agent:check`, `typecheck`, `lint` in `package.json`).
4. If present: run the available checks per the validation profile (e.g. `pnpm agent:check`, `pnpm typecheck`, `pnpm lint`).
5. If errors or warnings are found:
   - fix all errors and warnings, even if they do not stem directly from the findings of this run. The final validation is a project-wide quality gate, not merely a finding-scope check.
   - With `changedScope`: fix only errors that clearly arose from this run in the changed scope or the one-time standard check; if the assignment is unclear, inform the user instead of broadly implementing unrelated fixes.
   - log in the wisdom file which files were changed by final validation fixes and whether they belong directly to findings or are unrelated validation fixes.
   - run the checks again
   - with `full`: fix and re-check per "Goal-driven completion control"; limit the internal correction rounds and escalate to the user if the checks still fail afterwards, instead of repeating without limit
   - with `changedScope`: repeat only if the affected check is scope-aware or fast enough; otherwise document the result and ask the user on unclear residual errors
6. If the commit strategy "Individually" was chosen in Phase 2 and fixes were necessary:
   - use the git commit mutex from `tools/apply-review-commit-mechanics.md` for the entire final staging/commit section.
   - run `git status --porcelain` before staging and distinguish final validation fixes from already-present user changes.
   - stage exclusively files changed by the final validation fix loop. Do not use blanket commands like `git add .`, `git add -A` or `git commit -a`.
   - check `git diff --cached --name-only` and `git diff --cached`.
   - commit the fixes with a commit message like `fix: resolve validation errors from final check`. If unrelated validation fixes are included, mention that concretely in the commit message, e.g. `fix: resolve final validation errors including unrelated warnings`.
7. If no validation script is present: skip this phase with a short message.
8. Give the user a short status update about the result.

### Phase 8: Summary

**Precondition:** Phase 8 may only start once phases 5 through 7 are fully complete. An earlier interim message does not end the workflow.

1. Delete the wisdom file.
2. Give the user a summary:

```markdown
**Apply-Review complete**

| Status | Count |
|---|---|
| Successfully implemented | X |
| ADR created (permanent decision) | Y |
| Rejected without ADR (non-permanent) | V |
| Failed | Z |
| Skipped (already implemented) | W |

[If findings failed:]
**Failed findings:**
- [R-XXXXXXX] [title]: [reason]

[If stashes were kept (e.g. stashPolicy keep):]
**Kept stashes:**
- `stash@{N}` [description] — please check manually
```

3. Return that summary and the run's end state — whether a pull request was opened and which source
   remains unprocessed — to `effective-flow apply`, which closes the run with its own next-step block.
   Name no follow-up invocation of your own here.

## Rules

- Pre-analysis (Phase 4.1) always in parallel per finding
- Delegation (Phase 4.3) in parallel per **overlap component** (formed globally across all action groups); sequential within a component so that same-file findings — even across actions — never write at the same time and the commit order stays clean
- After starting the delegation in Phase 4.3, actively wait for **all** component final statuses before Phase 5 begins or the workflow ends
- The report file must be read fresh from the file system when the skill starts
- Give the user a short status update after each phase
- If a delegated skill fails: inform the user, continue with the next finding
- Skip already-implemented findings (with ✅) without a message
- Prescribe the completion protocol to internal sub-agents
- Write a wisdom summary after each completed phase
- This skill does not assign new finding IDs. If new findings should be created in the future, `.effective-flow/memory.json` must be read and updated (see `effective-flow review`)
