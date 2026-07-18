
# Effective Flow Apply Review

You are the orchestrator for the automated implementation of review report findings.

## Goal

This workflow reads an existing review report file from `.effective-flow/review/`, evaluates the developer notes per finding and delegates the implementation to the matching workflows. Findings that should deliberately not be implemented are handed by the workflow as decision candidates to the `decision-records` skill; only permanent decisions are documented as an ADR, non-permanent rejections stay in the report or tracker artifact.

In **remote mode** (tracker mode `remote`) the workflow reads the findings from an issue tracker instead: it is passed an epic issue or a list of concrete finding issues, one PR is created per finding, and the epic entry is checked off after PR creation. The deviations are bundled in "Remote mode (issue tracker)"; there, `wontfix` findings replace the rejecting developer note.

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
   under `<path>`. **Backcompat (one generation):** a still-present legacy marker
   `**Firmo project setup:** <path>` is recognized as equivalent on read; /effective-flow setup
   converts it non-destructively to the new spelling on the next run. If the
   marker points to a path under which **no** ADR lives (dead/stale marker), do not stay
   there, but fall through in this order and report the stale marker
   (correction in /effective-flow setup).
2. **Default path/scan.** Otherwise `docs/adr/effective-flow-project-setup.md` (the legacy slug
   `firmo-project-setup` is recognized as equivalent during the scan) or a scan of the detected
   ADR directory (`docs/adr/`, `docs/decisions/`, `adr/`) for the project setup ADR.
3. **Transitional compatibility.** Otherwise — only transitionally — read a still-present
   `.effective-flow/config.json` (otherwise a legacy `.firmo/config.json`) and point to
   /effective-flow setup. This read path creates **nothing** and touches **no** Git.
4. **Built-in defaults.** Otherwise use the defaults of the respective source skills.

The deterministic read path of any tool is non-blocking: It reads the ADR (or
the transitional fallback), but itself creates no file and mutates no Git. Creating
the ADR, the markers and the migration happen exclusively in the Git-touching path of
/effective-flow setup.

### Table encoding (binding for writers and readers)

The config parameters stand as a flat Markdown table with two columns
`| Key | Value |`. Writers (/effective-flow setup, migration) and readers (all tools)
interpret the values identically per this encoding. English is the default encoding;
a pre-existing ADR written in the former German form (`## Konfiguration`, header
`| Schlüssel | Wert |`, `## Kontext`, status `Aktiv`/`Abgelöst`, empty list `(leer)`) stays
recognized on read and is rewritten to the English form on the next write:

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

### One-time migration legacy `config.json` → project setup ADR

The migration of an existing `.effective-flow/config.json` or legacy `.firmo/config.json`
into the project setup ADR is **Git-touching** and runs exclusively in the
/effective-flow setup path. It produces the ADR table from the current config content (encoding
as above), writes the AGENTS.md marker `**Effective Flow project setup:**`, switches
`.gitignore` to a single `.effective-flow/` and untracks the legacy `config.json`
(`git rm --cached`, leave the file content on disk). The exact procedure including
idempotency marking is in /effective-flow setup.

Outside /effective-flow setup, **no** migration takes place: The deterministic
read path creates nothing and touches no Git; on a missing ADR it reads instead a
still-present `.effective-flow/config.json` (otherwise `.firmo/config.json`) and points to
/effective-flow setup.

## Living ADR model

Effective Flow keeps architecture decisions (ADRs) as **living documents**: mutable
Markdown files that always carry the currently valid state of a decision. There is
no numbering and no supersede chain; the current file is the truth. This
building block is the authoritative convention for all ADRs **produced by Effective Flow**.

### Form and location

- **Location:** ADRs live in the project's detected ADR directory, default `docs/adr/`.
- **File name:** numberless, kebab-case slug — `docs/adr/<slug>.md` (e.g.
  `docs/adr/effective-flow-project-setup.md`).
- **Title:** an H1 with the descriptive title — `# <Title>` (no `NNNN` prefix).
- **Status:** a `## Status` section holds the current state. Canonical values (English by
  default): `Active`, `Superseded`, `Not implemented`. The former German values `Aktiv`,
  `Abgelöst`, `Nicht umgesetzt` stay recognized when reading an existing ADR.
- **Mutability:** an existing ADR is updated **in place** when the decision changes
  (content and `## Status`), not duplicated or replaced by a successor record.
- **Concurrency:** read the file fresh immediately before writing.

### Referencing

References to ADRs use the **slug or title**, not a number, e.g.
`(ADR: <slug>)`. Slug references stay stable across content changes.

### Backward read compatibility for numbered legacy ADRs

Existing numbered legacy ADRs (`NNNN-*.md`, H1 `# NNNN — Title`) remain **readable and
resolvable by number**. There is **no** mandatory bulk rename; legacy ADRs are not
touched. New ADRs are created exclusively in the living slug format. This mirrors Effective Flow's
established compatibility line (plan numbers via H1, `firmo-`/`effective-flow-` labels).

### Relationship to the `decision-records` skill (declared convention + fallback)

The living slug model described above is the **declared ADR convention of this
repo**. The host skill `decision-records` is the domain owner for ADR craft (whether a
decision is even ADR-worthy, lifecycle, supersession, index); its first
operating rule is to **discover the existing repo convention and follow it**, rather than
enforcing its own. This very building block is that convention — so the skill authors
Effective Flow ADRs in the living slug format (location/file name/title/status/mutability as
above), not in an immutably numbered one.

The layered contract therefore applies (see `skill-discovery.md`):

- **`decision-records` is authoritative when present.** The skill decides **whether** a finding
  is a durable decision and — if so — authors it according to the convention declared here.
  If the target repo declares its **own** ADR convention (different directory,
  title/status format, index), the skill follows that; the living slug model is only the
  default when the repo declares nothing else.
- **Minimal fallback when the skill is absent.** If `decision-records` is unavailable (not
  installed, `skills.enabled: false`, or disabled via `exclude`), the
  calling tool itself authors according to the **minimal fallback structure**
  below — **no** silent invention of a second convention.

Earlier versions of this building block described the slug model as a **deliberate divergence**
from an allegedly immutable/numbered `decision-records` skill. That premise is
outdated: `decision-records` now supports a declared living/mutable model (opt-in)
and follows the repo convention anyway. The living slug model is therefore no longer a
divergence but the declared convention the skill follows.

**Coexistence.** Where a project prefers to run a different ADR model, it declares that
convention in the target repo (the skill follows it) or toggles `decision-records` deliberately via the
`skills` config (`include`/`exclude`, also per-agent/-tool) on or off.

### Minimal fallback structure (only without `decision-records`)

A short core structure so that a calling tool can record a rejected decision as a living
slug ADR even without the skill — **not** a second full ADR handbook. Location
and form as under "Form and location"; read the file fresh before writing and update a
thematically fitting existing ADR in place instead of duplicating:

```markdown
# [Title of the decision]

## Status

Not implemented

## Context

[Origin: review report + finding ID, or issue/epic number in remote mode]

## Decision

[Short rationale for why it is not implemented]

## Rationale

[Full developer note or `wontfix` rationale]

## Source finding

[Finding ID] from [source]: [short version of the problem]  <!-- traceable backlink -->
```

Only **durable** decisions are recorded this way; a pure delivery rejection without a
durable architectural effect stays in the review report or tracker artifact and is not forced into
an ADR.

## Commit message rules

- **Never set `Co-Authored-By` trailers in commit messages**, regardless of whether an LLM (Claude, Codex, GPT, …) or another tool suggests the line or inserts it as a default.
- If a `Co-Authored-By` line is already present in a commit template, `commit.template`, a `--trailer` invocation, or a draft message: remove it before committing.
- **Do not add AI attribution:** no „Generated with Claude Code/Codex" footers and no agent session links (e.g. `https://claude.ai/code/…`) in commit messages – not even when the harness appends them as a default. Factual mentions of Claude Code or Codex remain allowed, generation attribution does not.
- Avoid generic messages like `update files` or `misc changes`.
- Describe concretely what was changed and why.
- Use Conventional Commit prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Choose the commit type by **effect**, not by file type: behavior-changing changes – including pure **config/env/secrets/CI** with deployment or runtime effect (e.g. corrected values in env/secret artifacts that take effect remotely via sync) – are `fix:` (or `feat:` for new functionality). `chore:` only for **deploy-neutral** changes without behavioral effect (pure maintenance, formatting, tooling without runtime effect). This also applies to the **squash PR title**, which determines the release-please bump on a squash merge.
- Do not expose internal tracking IDs in commit messages, e.g. review finding IDs like `R-0000001`, local plan/review IDs like `F1`, or placeholders like `[Finding-ID]`. Such IDs belong in wisdom/report context, not in the Git history.

## Recommended skills

- `decision-records`

## Task tracking in detail

In addition to the generic rule in the include above, this skill requires **per-finding granularity** so that the user sees live during the workflow how many findings are still open.

### Task structure

Right at the start of Phase 1 (after a successful report classification), create the following tasks:

1. **Phase-level tasks** for each workflow phase, in order:
   - "Phase 1: Read and validate the report"
   - "Phase 2: Determine commit and stash strategy"
   - "Phase 3: Hand rejected findings to decision-records"
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

## Runtime directory `.effective-flow/` and migration from `.firmo/`/`.sf-plugin/`

Effective Flow keeps project-local runtime data under `.effective-flow/` (`memory.json`, `cache.json`, `review/`, `investigation/`, `.worktrees/`, wisdom files; a legacy `config.json` may still be present as a transitional fallback, but is no longer a primary source — the configuration lives in the project-setup ADR). Earlier versions used `.firmo/`, still older ones `.sf-plugin/`. When this skill reads or writes `.effective-flow/` data, these rules apply:

1. **No unrequested footprint:** Create `.effective-flow/` only when runtime data is actually written. A run with no data to save produces no `.effective-flow/`.
2. **Fallback reading:** If `.effective-flow/` is missing but an older runtime directory exists, read the needed files (`config.json`, `memory.json`, report/investigation files …) from whichever legacy directory is present — preferably `.firmo/`, otherwise `.sf-plugin/` — as long as migration has not yet happened.
3. **One-time, non-destructive migration:** As soon as a write to `.effective-flow/` would occur and no `.effective-flow/` exists yet, but a `.firmo/` or `.sf-plugin/` is present: create `.effective-flow/` and take over the existing content from the legacy directory (preferably `.firmo/` over `.sf-plugin/`; copy, do not move), then write the change into `.effective-flow/`. If `.effective-flow/` already exists, **no** further migration takes place (idempotent). Parallel-safe: a file already present in the target is not overwritten.
4. **No silent deletion:** `.firmo/` and `.sf-plugin/` are preserved; Effective Flow leaves the cleanup to the user.

The `.gitignore` switch to a single `.effective-flow/` (including migration of the earlier two-line pattern `.effective-flow/*` plus `!.effective-flow/config.json` as well as a blanket `.firmo/` or `.sf-plugin/` ignore line) is handled by `/effective-flow setup`.

## Project conventions

If the project has an `AGENTS.md`, read it early in the workflow and honor its rules.

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

Effective Flow-internal files live under `.effective-flow/` in the project root.

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
apply source type** a given argument is. It is used by `/effective-flow apply`
(router) as well as by ``tools/apply-plan.md``, ``tools/apply-review.md``, and
``tools/apply-issues.md`` for the upstream argument classification.

The building block only classifies and resolves the reference to a handle (file path or
issue number(s)). It makes **no** implementation decision, changes nothing, and
does not read findings/container contents deeper than necessary for classification. The
type-specific depth logic (plan status, finding parsing, container expansion) stays
in the respective skill.

### Canonical source types

| Type              | Meaning                                                                                                       | Responsible skill                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `plan`            | plan file under `<plan.dir>/`                                                                                 | ``tools/apply-plan.md``                        |
| `review-report`   | review report file under `.effective-flow/review/`                                                            | ``tools/apply-review.md`` (local)              |
| `review-epic`     | tracking/epic issue of a `/effective-flow review` run                                                               | ``tools/apply-review.md`` (remote, epic)       |
| `review-finding`  | single finding issue of a `/effective-flow review` run                                                              | ``tools/apply-review.md`` (remote, issue list) |
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
3. **Review report** → `review-report`, if the argument is a `*.md` path under
   `.effective-flow/review/` (or a file name that resolves there).
4. **Issue reference** → `issue-reference` (continue with stage B), if the argument is a
   bare issue number (`123`), a `#123`, or an issue URL. Issue URLs are
   host-neutral: recognize `https://<host>/<owner>/<repo>/issues/<nr>` and comparable
   Forgejo/Gitea URL forms just like GitHub URLs. Multiple such references are
   treated as a list and classified individually in stage B.
5. **Otherwise** → `ambiguous`: the argument resolves to no category or matches
   both a plan **and** a review file at the same time. Do not guess — the caller
   asks (see "Ambiguity and fallbacks").

Distinguishing plan vs. report: primarily via the directory (`<plan.dir>/` or
`<plan.dir>/archive/` vs. `.effective-flow/review/`), secondarily via the header content
(plan status marker `**Planungsstatus:**` / `**Plan status:**` vs.
`### [R-XXXXXXX]` finding blocks). A four-digit number without a path is always a
(legacy) plan reference, never an issue reference.

### Stage B: issue subtype (tracker)

Stage B refines an `issue-reference` from stage A into the concrete subtype. It
requires the host/CLI detection and availability check from `issue-tracker.md`;
a skill that uses stage B therefore also embeds `issue-tracker.md`.
``tools/apply-plan.md`` does not need stage B — for a plan skill, stage A is enough
to recognize an issue reference as a foreign type and forward it.

Per issue, read labels and body **once fresh** from the tracker and determine the subtype in
this precedence — **label before body structure**:

1. Label `effective-flow-review-epic` (or old `firmo-review-epic`) → `review-epic`.
2. Label `effective-flow-review-finding` (or old `firmo-review-finding`) → `review-finding`.
3. no review label, but the body contains a sub-issue checklist
   (`- [ ] #NNN …` / `- [x] #NNN …`) → `container-issue`.
4. otherwise → `plain-issue`.

Secondary signal when a label is missing (e.g. removed manually): a title in the format
`[R-XXXXXXX] …` together with a `**Signature**` field in the body is treated like
`review-finding`. If the subtype remains unclear afterwards → `ambiguous`.

Why label before body: a `review-epic` carries — like a generic
`container-issue` — a `- [ ] #NNN` checklist. The label `effective-flow-review-epic` or
`effective-flow-review-finding` (old prefix `firmo-` equivalent, see "Label convention" in
`issue-tracker.md`) is the reliable discriminator and takes precedence over the
body structure.

### Ownership and mode

From the final source type follows exactly one responsible skill and — for
``tools/apply-review.md`` — the mode:

| Source type       | Responsible skill        | Mode / note                      |
| ----------------- | ------------------------ | -------------------------------- |
| `plan`            | ``tools/apply-plan.md``   | –                                |
| `review-report`   | ``tools/apply-review.md`` | local report flow                |
| `review-epic`     | ``tools/apply-review.md`` | remote mode, epic mode           |
| `review-finding`  | ``tools/apply-review.md`` | remote mode, issue-list mode     |
| `container-issue` | ``tools/apply-issues.md`` | container expansion in the skill |
| `plain-issue`     | ``tools/apply-issues.md`` | single work item                 |

Consistency with `issue-tracker.md`: the rule there, "argument type overrides the
config mode", stays valid — a `review-report` forces `local`, a
`review-epic`/`review-finding` forces `remote`. This building block delivers exactly that
argument type.

### Ambiguity and fallbacks

- **`none` (no argument):** do not heuristically pick the "newest". The caller
  lists local candidates (open plans from `<plan.dir>/`, report files under
  `.effective-flow/review/`) and asks for the specific source. If the effective
  tracker mode is `remote`, it additionally lists open review epics (label
  `effective-flow-review-epic`, incl. old `firmo-review-epic`) as candidates, since in
  remote mode no local report files exist.
- **`ambiguous`:** name the competing interpretations and ask, instead of
  guessing.
- **Mixed issue list** (different subtypes in one call, e.g. `review-finding`
  and `plain-issue`): do not guess. Ask the user to split the list by target type,
  or — in the router — route per issue. Conservative: ask.
- **Issue reference, but tracker CLI missing/not authenticated:** stage B cannot
  run → clear error message with a remediation hint per "Errors and edge cases" in
  `issue-tracker.md`; no silent fallback to a local type.
- **Unresolvable path:** `ambiguous` → ask or error message; note that
  `/effective-flow open-plans` can list open plans.

### Use by the skills

- **Router (`/effective-flow apply`):** runs stage A and — for issue references —
  stage B, reports the detected type, and delegates to the responsible skill with the
  original argument. On `none`/`ambiguous`/mixed list: ask.
- **Responsibility skill (each of the three apply skills):** classifies the argument
  early via this building block. If the type matches its own responsibility → continue with its
  own depth logic. If it does not match:
  - **Direct invocation by the user:** clearly point to the responsible skill (or
    `/effective-flow apply`) and end.
  - **Delegation from `/effective-flow apply`:** should not occur, since the router
    routed correctly; the switch remains as a safeguard.

## Remote mode (issue tracker)

If the tracker mode is `remote` (the argument is an epic or finding issue), read and follow the internal sub-file `tools/apply-review-remote.md` **before** the local report flow. It contains the issue-tracker integration as well as the complete remote flow (phase 1–8 remote) and replaces or supplements the corresponding local steps. In local mode (report file under `.effective-flow/review/`) it is not loaded.

## Workflow

### Phase 1: Read and validate the report

First determine the tracker mode via the "apply-source detection" (report file under `.effective-flow/review/` → `local`; epic/finding issue → `remote`). If it is `remote`, read and follow the internal sub-file `tools/apply-review-remote.md` (phase 1 remote and following) instead of the report-file steps 4–7 below; the config, stash and cache steps still apply.

1. Load the Effective Flow configuration, migrate it if necessary and determine the commit-strategy default, stash policy, worktree defaults and final validation profile.
2. Read `.effective-flow/cache.json`, if present and valid. Use only valid `applyReviewAnalysis` entries.
3. **Capture the stash baseline:** run `git stash list` and remember the full list of already-existing stash references (e.g. `stash@{0}`, `stash@{1}`, ... with their descriptions). Record the baseline in the wisdom file so that Phase 6 (stash cleanup) can later distinguish new stashes created by this workflow from it. If `git stash list` is empty: note "no baseline stashes".
4. Determine the report file:
   - if passed as an argument: use this file
   - otherwise: search for `.effective-flow/review/review-report-*.md` in `.effective-flow/review/`
   - with multiple reports: ask the user which one to use
   - if no report is found: error message and abort
5. **Read the file fresh.** Since the file can be deleted and recreated between conversations, no previously read content may be used. Always read the file directly from the file system.
6. Parse all findings (`### [R-XXXXXXX] ...` blocks) with:
   - finding ID and title
   - Severity
   - Complexity
   - action (`/effective-flow fix`, `/effective-flow refactor`, `/effective-flow build`, `/effective-flow docs`)
   - Prompt suggestion
   - developer note (if present)
   - already present implementation hints (✅)
7. Classify each finding:
   - **Already implemented:** the finding already has a ✅ hint → skip
   - **Do not implement:** the developer note begins with "Do not implement" (the German form "Nicht umsetzen" is also recognized) → hand to `decision-records` as a decision candidate (ADR only for a permanent decision)
   - **Implement:** no ✅ hint and no rejecting note → delegate to a skill
   - **Implement with context:** a developer note is present that does not begin with "Do not implement" / "Nicht umsetzen" → delegate to a skill, passing the note as additional context
8. Give the user an overview:

```markdown
**Report:** [filename]
**Date:** [date from report]

| Status | Count |
|---|---|
| To implement | X |
| Do not implement (→ decision-records) | Y |
| Already implemented | Z |
| Total | N |
```

9. If there are no implementable findings and no rejected findings to handle: short message and abort.

### Phase 2: Commit and stash strategy

This phase is the workflow's only up-front strategy gate: the commit strategy and stash policy are determined here together, before the findings are worked through. After that no further **regular** approval gate follows; the remaining stops are exclusively conflict-driven data-integrity escalations: an `apply` merge conflict in Phase 6, a high-risk cherry-pick conflict in Phase 4.3 under the "Individually with worktrees" strategy and — rarely — an orphaned commit lock under the "Individually" strategy. If no such escalation occurs, phases 3–8 run autonomously under native `/goal`.

If `applyReview.defaultCommitStrategy` is validly set, skip the ASK question and use the configured strategy:

- `worktrees` → **Individually with worktrees**
- `single` → **Individually**
- `none` → **No commits**

Briefly report that the commit strategy was taken from the Effective Flow configuration (project-setup ADR). If no valid value is set, ask as before:

Wenn no valid value is set for `applyReview.defaultCommitStrategy`:

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Commits"
- question: "Which commit strategy should be used for the findings?"
- multiSelect: false
- options:
  - label: "Individually with worktrees", description: "Parallel components run in isolated git worktrees and are integrated back afterwards (most common choice)"
  - label: "Individually", description: "Each finding is committed individually after implementation"
  - label: "No commits", description: "All changes are made without automatic commits"

Record the answer and pass it to each delegated skill as an instruction:

- **Individually with worktrees:** each parallel component works in its own git worktree, commits the findings individually there, and the orchestrator then integrates the commits back into the original branch sequentially via `git cherry-pick`. Commit messages follow the same rules as for "Individually": a concrete Conventional Commit message, no internal finding IDs, no `Co-Authored-By`.
- **Individually:** commit the changes after each completed finding. Use a concrete Conventional Commit message without an internal finding ID, e.g. `fix: clarify review decision filtering`. **Never** set a `Co-Authored-By` trailer (not even for LLMs); this applies to every commit created by this workflow or a delegated sub-agent. Log the mapping of finding ID to commit hash in the wisdom file directly after each successful commit.
- **No commits:** no automatic commits, the user commits themselves.

#### Stash policy

Part of the same up-front gate: the stash policy determines in advance how the stash cleanup in Phase 6 (classes B/C/D) and the abort cleanup in Phase 4.3 handle stashes left behind — without a later follow-up question. Concrete stashes do not yet exist at the start; therefore the policy is decided, not the individual case.

If `applyReview.stashPolicy` is validly set, skip the ASK question and use the value; briefly report that the stash policy was taken from the Effective Flow configuration (project-setup ADR). If no valid value is set, ask at the same gate as the commit strategy:

Wenn no valid value is set for `applyReview.stashPolicy`:

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Stashes"
- question: "How should stashes left behind during the run be handled when a decision is needed?"
- multiSelect: false
- options:
  - label: "Interactive", description: "Ask per affected stash (today's behavior, blocks autonomous runs)"
  - label: "Keep", description: "Keep unclear stashes unchanged and report at the end (safe for autonomous runs)"
  - label: "Discard", description: "Discard unclear stashes (git stash drop) — possible data loss"
  - label: "Apply", description: "Apply unclear stashes (git stash pop); on a merge conflict it still asks"

Value mapping: Interactive → `interactive`, Keep → `keep`, Discard → `discard`, Apply → `apply`. Record the chosen policy in the wisdom file. For unattended `/goal` runs, `keep` is the safe value; `interactive` blocks such runs at Phase 6 and Phase 4.3.

#### Optional `/goal` string

Once the commit strategy and stash policy are fixed, output the optional `/goal` string per "Goal-driven completion control"; it covers phases 3–8. The string references the report file and instructs the user to run through the remaining phases. With `stashPolicy != interactive` (recommended `keep`), these phases run without a regular approval gate; the remaining stops are only the conflict-driven escalations from the phase intro (`apply` merge conflict, high-risk cherry-pick conflict with worktrees, rarely an orphaned lock).

#### Commit mechanics per strategy

The detailed mechanics of the committing strategies — **Individually** (git commit mutex) and **Individually with worktrees** (worktree isolation including cherry-pick conflict assessment) — are in the internal sub-file `tools/apply-review-commit-mechanics.md`. Read it once the strategy is fixed in Phase 2 and commits are created; with **No commits** it is omitted. The later phases refer to this sub-file for the detailed rules.

### Phase 3: Rejected findings → decision candidate (delegation to `decision-records`)

The ADR authoring is owned by the host skill `decision-records` (domain owner: ADR merit, repo-convention detection, lifecycle, supersession, index). This workflow **no longer authors an ADR itself** and encodes neither `docs/adr/`, nor numbering, status text or a fixed template. Firmo keeps the **mapping** (finding + developer note → decision candidate), the approval/status flow, the **backlink** to the report/remote issue and the tracking of the result artifact in the summary.

First survey the available skills:

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

For each finding with a "Do not implement" note (German "Nicht umsetzen" also recognized; in remote mode: `wontfix` finding, with a `wontfix` rationale instead of a developer note):

1. **Form the decision candidate.** From the finding and the developer note, summarize a candidate: a descriptive title, context (report filename + finding ID or issue/epic number), the rejection rationale (full note/`wontfix` text) and a traceable **backlink** to the source finding.
2. **Delegate to `decision-records`.** Hand the candidate to the skill with the task to (a) **decide whether** a permanent architecture/principle decision exists that justifies an ADR, and (b) if so, author it per the **discovered repo convention**. The convention declared for this repo is the living slug model from `adr-convention.md` (location/filename/title/status/mutability); if the target project declares its own ADR convention, the skill follows that one. Constraint on the skill: the ADR carries the backlink to the finding and does **not** become a task-status ledger; an existing thematically matching living ADR is updated **in place** rather than duplicated.
3. **Non-permanent rejection.** If `decision-records` classifies the candidate as pure delivery history without permanent effect (no ADR justified), **no** ADR is forced — the rejection stays documented in the review report or (remote mode) on the issue/epic (see Phase 5).
4. **Minimal fallback (skill missing).** If `decision-records` is unavailable (not installed, `skills.enabled: false` or disabled via `exclude`), this workflow authors the permanent decision itself per the **minimal fallback structure** from `adr-convention.md` (living slug ADR under the detected ADR directory, default `docs/adr/<slug>.md`; update an existing thematically matching ADR in place, reading the file fresh first). **Do not** invent a second convention.
5. Give the user a status update about the created or updated records and reference each by slug, e.g. `(ADR: <slug>)`; name the rejections classified as non-permanent separately.

### Phase 4: Pre-analysis and parallel delegation

This phase consists of three sub-steps. Goal: maximize parallelism without breaking the 1-commit-per-finding contract.

#### Phase 4.1: Pre-analysis (in parallel per finding)

Start a pre-analysis sub-agent in parallel for **each implementable finding**. These sub-agents implement nothing and change no files — they only analyze.

Each pre-analysis sub-agent receives:

- the finding details from the report (ID, Problem, Empfehlung, Datei, action)
- the developer note (if present)
- the task to investigate the code and deliver a structured analysis result:
  - **Affected files:** complete list of all files that will likely be touched (more than just the primary file named in the report).
  - **Root cause / current behavior** (for `/effective-flow fix` and `/effective-flow refactor`), **requirement** (for `/effective-flow build`) or **documentation gap and audience** (for `/effective-flow docs`).
  - **Implementation sketch:** short plan in 2–5 bullet points.
  - **Risks and file dependencies:** possible side effects, collisions with other findings.
  - **Confidence:** `High` (file list certain), `Medium` (file list plausible), `Low` (file scope uncertain, e.g. large refactoring or unclear dependency).
- the completion protocol

Write the result per finding into the wisdom file under `## Pre-analysis [R-XXXXXXX]`. On `ABORT`, mark the finding with the status `failed (pre-analysis)` in the wisdom file and skip it in the following steps. This marking allows Phase 6 (stash cleanup) to distinguish pre-analysis aborts (no stash possible, since nothing was implemented) from delegation aborts (a stash may exist).

Use a valid `applyReviewAnalysis` cache entry only if the report file hash, finding ID and relevant code file hashes match the current situation. If the cache is not unambiguously valid, run the pre-analysis anew. Update the cache only after a successful pre-analysis; do not write user decisions or failed delegation outputs into the cache.

#### Phase 4.2: Form overlap components (locally in the orchestrator)

Form the parallelization units **globally across all implementable findings of all action groups** (`/effective-flow fix`, `/effective-flow refactor`, `/effective-flow build`, `/effective-flow docs`), based on the file lists from Phase 4.1. A finding's action group later only determines which skill implements it (Phase 4.3), **not** the grouping: two findings that touch the same file may never run at the same time — not even if their actions differ. The approach is explicitly two-stage:

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

- F1 `[fix] src/auth.ts` and F2 `[refactor] src/auth.ts` → component A (sequential, mixed action: F1 via `/effective-flow fix`, F2 via `/effective-flow refactor`)
- F3 `[fix] src/billing.ts` → component B (parallel to A)
- F4 `[docs] docs/guide.md` and F5 `[build] docs/guide.md` → component C (parallel to A and B, internally sequential)
  Three parallel streams. The earlier separate-per-action grouping would have put F1 and F2 into different streams and let both write to `src/auth.ts` at the same time.

#### Phase 4.3: Parallel delegation

1. Start a delegation sub-agent for each **overlap component** from Phase 4.2. All components run in parallel (by construction they share no file); within a sub-agent its findings are worked through **sequentially** in component order — even if the component contains findings of multiple action groups.
   - With commit strategy `Individually with worktrees`: create the worktree per component beforehand per the worktree rules and start the sub-agent with this worktree as the working directory.
2. Each delegation sub-agent receives directly embedded in the prompt:
   - the finding details (ID, Problem, Empfehlung, Prompt-Vorschlag, Datei)
   - the corresponding pre-analysis from Phase 4.1 as an **inline context block** in the prompt — not as a reference to the wisdom file. The sub-skills do not read the wisdom file; they only process the prompt content. Embed the pre-analysis in full, for example under the heading `Pre-analysis for this finding:`.
   - the developer note (if present)
   - the commit strategy from Phase 2
   - **With commit strategy "Individually":** the full git commit mutex rule from `tools/apply-review-commit-mechanics.md`. The sub-agent must run every finding commit under `.effective-flow/apply-review-commit.lock`, may only stage finding-owned files and may never use `git add .`, `git add -A` or `git commit -a`.
   - **With commit strategy "Individually with worktrees":** the full git worktree isolation rule from `tools/apply-review-commit-mechanics.md`. The sub-agent works exclusively in the assigned worktree, commits each finding individually there and logs commit hashes in the wisdom file. The sub-agent must not switch into the original worktree.
   - the task to call, for **each** finding, the skill matching its action group (in mixed components thus determined anew per finding):
     - action fix: `Use the skill /effective-flow fix for this finding.`
     - action refactor: `Use the skill /effective-flow refactor for this finding.`
     - action build: `Use the skill /effective-flow build for this finding.`
     - action docs: `Use the skill /effective-flow docs for this finding.`
   - the prompt suggestion from the report as the task description
   - **Stash convention:** if any stash arises during the implementation of this finding (through a pre-commit hook, a manual `git stash` in the sub-skill or a tool-triggered stash), **the stash message must contain the finding ID**, e.g. `apply-review R-XXXXXXX <short description>`. This allows the stash cleanup in Phase 6 to reliably assign the stash to the finding.
   - the note that the sub-agent runs as a **non-interactive** delegation sub-agent of `/effective-flow apply-review` and therefore skips the explicit goal query per "Explicit goal query for autonomous runs": no extra option "Autonomous via /goal", no `/goal` string. `/effective-flow apply-review` steers the autonomous run at its own gate.
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
7. With commit strategy `Individually with worktrees`: after the synchronization barrier, integrate all successful worktree branches sequentially via `git cherry-pick` into the original branch, in the **deterministic component order from Phase 4.2, step 5** (components by report position of their first finding; within a component the finding commits in component order). This fixed order makes the integration result reproducible. Phase 5 may only start once this integration is complete or the workflow has been halted due to a conflict/user decision.
8. A status update after a completed component is **not** a completion message of the overall workflow and **not** a halt. After each status update you actively check which delegation components are still running, wait for their final status and continue Phase 4.3 until no component is open anymore.

#### Known limitations

- **Cross-action file conflicts are detected:** the overlap components from Phase 4.2 are formed globally across all action groups. Findings that affect the same file therefore land in the same component and run sequentially — even with different actions they never write to a working tree at the same time. Remaining limitation: the detection is only as accurate as the file lists of the pre-analysis (Phase 4.1). If a finding touches a file at runtime that its analysis did not name, an overlap may go undetected; low-confidence findings with an uncertain file scope are covered here by the shared safety component.
- **Low-confidence findings** run across actions in a shared safety component sequentially, because their file scope is uncertain.
- The git commit mutex only isolates staging and commit in the original worktree. Worktree mode additionally isolates the working tree and git index, but shifts possible conflicts into the sequential cherry-pick integration (in deterministic component order).

### Phase 5: Update the report

**Precondition:** Phase 5 may only start once the synchronization barrier from Phase 4.3 is satisfied, i.e. no delegation component is open anymore.

1. Read the report file again fresh from the file system. The file could have changed during implementation.
2. Append to each successfully implemented finding as the last entry:
   `✅ Implemented on YYYY-MM-DD via Effective Flow Apply-Review`
3. Append to each rejected finding as the last entry — depending on the classification by `decision-records`:
   - permanent decision with ADR: `📋 ADR created/updated on YYYY-MM-DD: not implemented (ADR: <slug>)`
   - non-permanent rejection without ADR: `⏭️ Documented on YYYY-MM-DD as not implemented (no permanent decision, no ADR)`
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

   **Apply the stash policy from Phase 2:** class A remains auto-drop in all policies. Classes B/C/D follow the `stashPolicy`. The class steps below describe the case `stashPolicy = interactive` (default), which asks the stash question per stash. With the other values the question is omitted and you act directly: `keep` → keep the stash unchanged and note it as "kept" for the Phase 8 summary; `discard` → `git stash drop`; `apply` → `git stash pop` and on a merge conflict do **not** drop, but escalate to the user (the only remaining stop in the autonomous run).

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

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Stash"
- question: "How should this stash be handled?"
- multiSelect: false
- options:
  - label: "Apply and delete", description: "Run `git stash pop` and take the content into the branch"
  - label: "Discard", description: "Run `git stash drop`, the content is lost"
  - label: "Keep", description: "Leave the stash unchanged"

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
- This skill does not assign new finding IDs. If new findings should be created in the future, `.effective-flow/memory.json` must be read and updated (see `/effective-flow review`)
