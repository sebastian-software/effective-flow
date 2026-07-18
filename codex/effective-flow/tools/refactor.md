
# Effective Flow Refactor

You are the orchestrator for the refactoring workflow.

## Goal

Code is restructured without changing existing behavior, with before/after validation as a safety net.

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
   `**Firmo project setup:** <path>` is recognized as equivalent on read; $effective-flow setup
   converts it non-destructively to the new spelling on the next run. If the
   marker points to a path under which **no** ADR lives (dead/stale marker), do not stay
   there, but fall through in this order and report the stale marker
   (correction in $effective-flow setup).
2. **Default path/scan.** Otherwise `docs/adr/effective-flow-project-setup.md` (the legacy slug
   `firmo-project-setup` is recognized as equivalent during the scan) or a scan of the detected
   ADR directory (`docs/adr/`, `docs/decisions/`, `adr/`) for the project setup ADR.
3. **Transitional compatibility.** Otherwise — only transitionally — read a still-present
   `.effective-flow/config.json` (otherwise a legacy `.firmo/config.json`) and point to
   $effective-flow setup. This read path creates **nothing** and touches **no** Git.
4. **Built-in defaults.** Otherwise use the defaults of the respective source skills.

The deterministic read path of any tool is non-blocking: It reads the ADR (or
the transitional fallback), but itself creates no file and mutates no Git. Creating
the ADR, the markers and the migration happen exclusively in the Git-touching path of
$effective-flow setup.

### Table encoding (binding for writers and readers)

The config parameters stand as a flat Markdown table with two columns
`| Key | Value |`. Writers ($effective-flow setup, migration) and readers (all tools)
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
$effective-flow setup path. It produces the ADR table from the current config content (encoding
as above), writes the AGENTS.md marker `**Effective Flow project setup:**`, switches
`.gitignore` to a single `.effective-flow/` and untracks the legacy `config.json`
(`git rm --cached`, leave the file content on disk). The exact procedure including
idempotency marking is in $effective-flow setup.

Outside $effective-flow setup, **no** migration takes place: The deterministic
read path creates nothing and touches no Git; on a missing ADR it reads instead a
still-present `.effective-flow/config.json` (otherwise `.firmo/config.json`) and points to
$effective-flow setup.

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

## Recommended skills

- `codebase-improvement`
- `port-codebases`

## Delegation contract: generic audit reasoning

The central skill `codebase-improvement` is the **declared owner** of the generic audit
reasoning (classification `route-when-relevant`, see
[Skill ownership](../../docs/developer-guide/skill-ownership.md)). Where this reasoning applies,
its guidance is **authoritative**, not optional advice; this tool carries **no second copy** of
the audit playbook – only the output contract, the lifecycle constraints, and a minimal
fallback.

**The skill owns the generic reasoning (the "how"):**

- repository reconnaissance and project-convention detection,
- evidence standards plus finding validation, rejection, and deduplication judgment,
- leverage-based prioritization, complexity and over-engineering lenses,
- gap analysis, root-cause placement, scope/risk control, and plan quality.

**This tool owns the orchestration and the output contract (the "what/when"):**

- the `$effective-flow` entry point, the scope gate, and the progress updates,
- the agent selection, parallelization, and – in review – the directory-split heuristic,
- the finding schema (IDs `R-XXXXXXX`, severity, complexity, confidence gate), the
  report/tracker persistence, baselines/behavior invariance, resumability, and delivery.

**Output contract to the skill (binding).** Hand the skill the Effective Flow finding schema
(file+line, severity, complexity, area, problem, recommendation, confidence) as the target
format and instruct it to create **no report, issue, or delivery artifact of its own** and
**not** to stop after a mere summary. It delivers reasoning and finding candidates in this
schema; the deterministic thresholds and keys (confidence gate, dedup keys, scorecard bounds),
the persistence, the baseline, and the delivery are owned exclusively by this tool. That way no
two persistence/delivery loops run in parallel.

**Special branches** still route to their narrower owners when their declared scope applies:
`effective-web` (frontend, accessibility, CSS architecture, React), `software-architecture`
(architecture reasoning), `port-codebases` (cross-language/runtime migration),
`smart-dependency-updater` (dependency updates), and `decision-records` (ADR authoring) –
consistent with the [ownership inventory](../../docs/developer-guide/skill-ownership.md).

**Minimal fallback (skill missing).** If `codebase-improvement` is not available (not
installed, `skills.enabled: false`, or disabled via `exclude`), the short core guidance in this
tool's "Minimal fallback without skill" section applies. It keeps the workflow functional but
holds **no** second full audit handbook on hand – full depth comes only with the skill.

`refactor.md` carries more inline reasoning than `$effective-flow review`; the delegable part is
the **gap analysis and plan validation** in Phase 1 (root cause, complexity/over-engineering,
scope, risk, refactor-plan quality). The cross-language/runtime migration branch routes
further to `port-codebases`. Baseline, behavior invariance, reports and delivery remain
Effective Flow contract.

## Project conventions

If the project has an `AGENTS.md`, read it before analysis and refactoring and follow its guidance for structure, boundaries, tests, review and commits.

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

## Delivery and worktree integration

This shared fragment ties code-changing workflows to delivery branches, pull requests and
Git worktrees. The general values for base branch, branch-name construction and
completion action live in the `delivery` config block; the `worktree` block controls
exclusively whether and how the implementation runs in a separate Git worktree.

**By default the implementation runs in its own Git worktree with its own branch**
(`worktree.enabled` default `true`). As soon as work happens in a worktree or on a dedicated
delivery branch, **delivery is implicitly active** and completes via `merge`
(default) or `pr`. There is no separate `delivery.enabled` switch anymore (see
"Delivery is implied by worktree/branch").

Only when the user explicitly asks for in-place work without a worktree and wants no
branch/PR/merge action does the workflow behave as if without this fragment: no
forced branch creation, no forced commits and no automatic
PR creation.

`<plan.dir>` is the plan directory from the Effective Flow configuration (project setup ADR) `plan.dir` (default
`docs/plan`).

### Roles of the config blocks

- **`delivery`** describes the delivery branch and its completion: base ref,
  branch prefix, completion action and return target.
- **`worktree`** describes exclusively the execution location: whether a worktree
  is used, where it lives and which setup runs in it.

Scope boundary: this fragment is **not** the per-finding worktree mechanism from
``tools/apply-review.md`` (`applyReview.worktree`). That one isolates parallel local
review findings and folds commits back onto the current branch via cherry-pick.
This fragment creates delivery branches for PR, merge or "branch only". Both
may use the same physical `baseDir`, since session and path segments
distinguish them.

### Configuration

If the Effective Flow configuration (project setup ADR) pins corresponding values, they override these defaults (schema shown here for illustration):

```json
{
  "delivery": {
    "baseBranch": "origin/main",
    "branchPrefix": "effective-flow",
    "completion": "merge",
    "returnBranch": "auto"
  },
  "worktree": {
    "enabled": true,
    "setup": "auto",
    "baseDir": ".effective-flow/.worktrees"
  }
}
```

Missing values have these defaults:

- `delivery.baseBranch`: `"origin/main"`
- `delivery.branchPrefix`: `"effective-flow"`
- `delivery.completion`: `"merge"` (merge into the target branch as the default completion)
- `delivery.returnBranch`: `"auto"` (local branch part from `delivery.baseBranch`)
- `worktree.enabled`: `true` (implementation runs in its own worktree)
- `worktree.setup`: `"auto"`
- `worktree.baseDir`: `.effective-flow/.worktrees`

Valid values:

- `delivery.completion`: `"pr"`, `"merge"`, `"branch"`
- `delivery.returnBranch`: `"auto"` or a local branch name as a string
- `worktree.enabled`: `true`, `false`
- `worktree.setup`: `"auto"`, `"none"` or an explicit setup command as a string

`delivery.enabled` is **retired**: delivery is no longer activated via its own switch,
but is active whenever work happens in a worktree/dedicated branch
(see "Delivery is implied by worktree/branch"). A `delivery.enabled` still
present in a legacy config is ignored on read and removed by the full config migration
(see "Config migration").

### Config migration

Reading the Effective Flow configuration from the project setup ADR and the one-time consolidation
of a legacy config onto the current schema – in particular moving old delivery values out of
`worktree.baseBranch`/`worktree.branchPrefix`/`worktree.completion` into `delivery.*` and
removing the retired `delivery.enabled` – is handled by the shared fragment
"Config migration" (`config-migration.md`) once and centrally. This fragment performs **no** own
per-block migration anymore. Until a config is migrated, reading applies: new value from
`delivery.*` before legacy value from `worktree.*` before default; an existing
`delivery.enabled` is ignored.

### Determine mode (setup phase): Delivery is implied by worktree/branch

At the start of the actual implementation work, determine the effective mode:

- **Worktree execution is active by default** (`worktree.enabled` default `true`). It
  stays off only when `worktree.enabled: false` is set or the user explicitly requests
  in-place work ("without worktree", "directly on the current branch").
- **Delivery is active as soon as work happens in a worktree or on a dedicated delivery
  branch** – so in the default case always. In addition, delivery is active when the
  user explicitly requests PR, branch or merge work (even with in-place work; then
  the delivery branch is created in the main repo).
- If the worktree is disabled via config (`worktree.enabled: false`), give a brief
  note that the (default) worktree mode is off via config. If the user then also
  requests no delivery action, perform no further steps from this fragment
  (in-place without delivery).

### Shared preconditions

When delivery or worktree is active:

1. `git` and, for worktree execution, `git worktree` must be available.
2. `delivery.baseBranch` must be resolvable. If it is a remote ref (e.g.
   `origin/main`), first run `git fetch REMOTE BRANCH`, so the delivery branch
   starts from the current remote state.
3. If the current HEAD has relevant uncommitted changes or local commits that
   are not contained in `delivery.baseBranch`, point that out. A delivery branch freshly
   created from the base branch does not contain this work. Only continue
   if the user confirms the chosen mode or the workflow creates a safe
   partial-diff PR by the procedure described below.
4. Construct delivery branch names: `<delivery.branchPrefix>/<skill>/<slug>`, e.g.
   `firmo/build/user-login`. Derive the slug from the plan title, the task description,
   the issue or finding. If the branch name already exists, append a
   numeric suffix and report the chosen name.

### Worktree execution

When worktree execution is active:

1. Determine the repo name from `basename "$(git rev-parse --show-toplevel)"` and use
   `worktree.baseDir` (default `.effective-flow/.worktrees`) as the base dir. Worktree path:
   `BASE_DIR/REPO_NAME/SESSION_ID`.
2. Create the worktree and delivery branch:
   `git worktree add <WORKTREE_PATH> -b <BRANCH_NAME> <BASE_REF>`.
3. Run setup per `worktree.setup` in the worktree and briefly announce the
   mode beforehand:
   - `auto` or missing: decide by lockfile – `pnpm-lock.yaml` →
     `pnpm install --frozen-lockfile --prefer-offline`, `package-lock.json` →
     `npm ci`, `yarn.lock` → `yarn install --frozen-lockfile`, `Cargo.toml` →
     `cargo fetch --locked`, `go.mod` → `go mod download`, `uv.lock` →
     `uv sync --frozen`, `poetry.lock` → `poetry install --sync`, no known
     file → no setup.
   - `none`: run no setup.
   - String value: run this explicit command in the worktree.
4. Run all subsequent phases that create or change code, test or documentation
   files with the working directory in the worktree. This also applies to the
   completion phase up to and including the final validator/formatter.

### In-place delivery without worktree

When delivery is active and worktree execution stays off:

1. Remember the originally checked-out branch.
2. Ensure the working tree contains no uncommitted changes that
   should not become part of the delivery branch. If such changes exist,
   do not silently stage, stash or overwrite them; either obtain a user decision
   or use the partial-diff PR via worktree.
3. Create and check out the delivery branch from `delivery.baseBranch`.
4. Run implementation, tests, validation and final formatting on this delivery branch.
5. After completion, proceed per "Handback and completion action".

### Partial-diff PR via worktree

When the main checkout already holds changes that should not fully go into the PR,
a separate worktree is the preferred safe path, provided these
preconditions are met:

1. `git worktree` is available.
2. `delivery.baseBranch` is resolvable and, for remote refs, updatable.
3. The workflow knows an explicit list of the files that should go into the PR.

The procedure:

1. Create a fresh worktree branch from `delivery.baseBranch`.
2. Take only the selected delivery files from the main checkout into the worktree.
   Permitted sources for this selection are plan affected files,
   review finding scope, issue scope, known files produced by the workflow, or
   an explicit user selection.
3. In the worktree, check whether the taken-over files produce a meaningful diff
   against the base ref. If not, abort and create no empty PR.
4. Commit in the worktree and run `$effective-flow pr` against `delivery.baseBranch`.
5. Remove the worktree, leave the delivery branch locally and leave the main checkout
   unchanged. Non-selected changes in the main checkout remain untouched.

A heuristic partial-diff selection by "all changed files
except <plan.dir>" is not allowed. The workflow must know the files to include or
ask. This reliably keeps newly created plans, `.effective-flow/` state and other
local working files outside the PR.

### What lives in the delivery branch and what stays in the main repo

Data-keeping invariant: **Of the Effective Flow artifacts, only plans are
committed.** Reviews (local reports) and investigations always stay local and
untracked; in remote mode reviews are tracked as issues instead (never in the repo),
investigations remain purely local in any case (see "Issue-tracker integration" and
`$effective-flow investigate`).

- **In the delivery branch:** the actual code, test and documentation deliverables of the
  workflow as well as – if the workflow kept a plan file – its final
  state (in the implemented case the archived, implemented-marked plan file).
- **Only in the main repo, never committed:** pure Effective Flow bookkeeping and runtime state, i.e.
  all remaining `.effective-flow/` artifacts – `memory.json`, `cache.json`, local review reports
  under `.effective-flow/review/`, investigation reports under `.effective-flow/investigation/`,
  config migration status and wisdom files.

### Handback and completion action (completion phase)

Following the workflow's regular completion logic (including goal verification).
The final status switch of the plan file to `Umgesetzt`/`Implemented` and its
archiving is handled by step 1 below at the delivery point – the implementing workflow therefore does **not** set the
status beforehand, but leaves it to this phase (exception: in-place without
delivery, see step 1):

**Update existing PRs:** If the delivery branch already has a pull request
and subsequent changes are needed, those changes are always created and pushed as new
commits on the same PR branch. Existing PR commits must not
be rewritten via `commit --amend`, interactive rebase, squash or force-push.
If a normal push fails because of diverged remote history,
stop and report the conflict instead of overwriting history.

1. **Mark the plan as implemented, archive it and take it into the delivery branch:**
   Provided the workflow kept a plan file, this is the **delivery point** at which
   the plan counts as implemented (immediately before the PR is opened or the delivery branch
   is merged):
   - Set the canonical status marker to `Umgesetzt`/`Implemented` (preserve marker
     language: German marker → `**Planungsstatus:** Umgesetzt`, English →
     `**Plan status:** Implemented`).
   - Move the plan file via `git mv` to `<plan.dir>/archive/` (create the directory if
     needed), per "Archive of implemented plans" of the plan-file convention.
   - If the implementation ran in a worktree or partial-diff worktree, provide this final,
     archived and implemented-marked state in the worktree (under
     `<plan.dir>/archive/<file>`). Marking and move are **committed along with it** and
     are thereby part of the PR/merge (implementation documentation). The `.effective-flow/` artifacts stay in the
     main repo.
   - If the workflow kept no plan file, this step does not apply.
   - If the workflow exceptionally runs in-place without delivery (no worktree, no
     branch/PR/merge action), the workflow performs the same status switch and
     archive move directly in the working tree; the final commit/merge into the
     target branch is then the delivery event.
2. **Ensure commit:** Commit all intended changes in the delivery branch
   – code, test and documentation deliverables as well as the taken-over plan file – via the
   commit logic from `$effective-flow commit` (stage exclusively known changed files
   explicitly, derive a concrete Conventional Commit message, never set a
   `Co-Authored-By` trailer). Workflows that have already committed their work
   (e.g. `$effective-flow maintain` with one commit per group) only commit the
   plan file here afterwards, if needed. If there is nothing to commit: inform the user,
   remove an automatically created empty delivery branch and end without
   PR/merge.
3. **Determine completion action:** If `delivery.completion` has a valid value,
   use it and briefly report that the action was taken from the Effective Flow configuration
   (project setup ADR). Otherwise ask:

Wenn Delivery was active and no valid value for `delivery.completion` is set: Frage den User: **How should the delivery branch be completed?**
- Pull request -- Push the branch and create a PR against the base branch via pr
- Merge -- Merge the branch locally into the base branch, without a PR
- Branch only -- Leave the branch in the local repo, no further action

4. **Withdraw worktree:** If a worktree was involved, run `git worktree remove
<WORKTREE_PATH>`; the delivery branch is retained in the local repo.
   If removal fails because of uncommitted remnants: first ensure that
   everything intended is committed; if something remains, keep the worktree and
   report the path.
5. **Execute action:**
   - `branch` / Branch only: leave the branch, report the name and a note about later
     PR creation.
   - `merge`: the target is the local branch part of `delivery.baseBranch` or the
     explicit `delivery.returnBranch`. Ensure that the target working tree
     is clean; otherwise inform instead of merging. If the local target branch is
     behind its remote-tracking ref, point that out. Merge the delivery branch –
     prefer fast-forward, otherwise a merge commit; on conflict stop, leave the branch
     and inform the user, no automatic conflict resolution.
   - `pr`: delegate to `$effective-flow pr` and pass the delivery branch, base branch and the
     workflow/change type (`feat`/`fix`/`refactor`/`docs`/`chore` depending on the implementing
     workflow and effect) as a title-type hint, so the PR title carries a
     valid Conventional Commit type — with a squash merge it is the release signal.
6. **Restore checkout:** After successful PR creation or with `branch`, switch back to
   `delivery.returnBranch` or, with `auto`, to the local branch part of
   `delivery.baseBranch`, provided the working tree is clean. If the
   switch-back fails, explicitly report the actual branch as a side effect.

## Wisdom Accumulation

At the start, create a session ID (e.g. via timestamp `date +%Y%m%d%H%M%S`) and use it consistently for the wisdom file `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`. This prevents collisions with parallel runs.

Contents:

- baseline values and their meaning
- structural decisions and rationale
- discovered dependencies
- problems during the restructuring
- wrong assumptions

## Project type detection and routing

As with `$effective-flow build`.

Use ``generic-implementer`` for refactorings of CI/CD, tooling, build/release configuration, dependency manifests, container configuration and other artifacts that do not clearly belong to a language implementer.

Current workflow for review-report backlinks: `$effective-flow refactor`.

## Review-report backlinks

When this workflow implements a finding from an existing review-report file in `.effective-flow/review/`:

- identify the affected report file early in the workflow
- append to the affected finding, as the last entry, a short implementation note
- start the note with a green check mark, for example `✅ Implemented on YYYY-MM-DD via [current workflow]`
- update only the findings that were actually addressed by this workflow
- if several reports or findings are candidates, ask instead of marking indiscriminately

## Open review-finding reports

When a workflow review produces findings that are not fixed directly before completion, write these open findings additionally into a review-report file under `.effective-flow/review/`.

Goal:

- Open or deliberately unimplemented findings do not get lost in long plan files.
- ``tools/apply-review.md`` can process the findings later in the familiar report format.
- The plan file stays completion documentation and only points to the external report.

Applies to findings with status (canonical report tokens stay in the report's language; the
current `$effective-flow review` format is German):

- `Open`
- `Not implemented`
- `Nicht umgesetzt (ADR: <slug>)` or comparable ADR statuses

Do not carry over into the external report:

- Findings with status `Fixed`
- Findings that were fixed directly during the workflow
- purely informational reviewer comments without a concrete recommendation

### Report path

1. Create `.effective-flow/review/` if needed.
2. If the workflow has a plan file as its basis, prefer:
   - `.effective-flow/review/review-report-YYYY-MM-DD-plan-<slug>.md`
   - on collision: `.effective-flow/review/review-report-YYYY-MM-DD-plan-<slug>-1.md`, `-2`, ...
3. If no plan file exists as a basis, use:
   - `.effective-flow/review/review-report-YYYY-MM-DD-WORKFLOW.md`
   - on collision: `.effective-flow/review/review-report-YYYY-MM-DD-WORKFLOW-1.md`, `-2`, ...
4. Always write the origin at the top of the report (canonical German header tokens, matched by
   the still-German `$effective-flow review` format):
   - `**Origin plan:** [path or "Keiner"]`
   - `**Source workflow:** $effective-flow build / $effective-flow fix / $effective-flow refactor / $effective-flow maintain`
   - `**Source review:** [reviewer skill or phase]`

### Finding IDs and memory

This report uses the same global finding IDs as `$effective-flow review`.

1. Read `.effective-flow/memory.json`, if present.
2. If the file is missing, start with `lastFindingNumber: 0`.
3. Number new findings consecutively from `lastFindingNumber + 1` with seven digits, e.g. `R-0000021`.
4. After the report, write the highest assigned number back to `.effective-flow/memory.json`.
5. Preserve existing fields such as `configMigration` unchanged.
6. If memory cannot be written, inform the user and name the report path anyway.

### Report format

Use the canonical report format from `$effective-flow review` section "Report format". Do not duplicate the template here and do not deviate from it.

Additional header fields for workflow reports:

- Directly below `**Project type:** ...` set these three lines:
  - `**Origin plan:** [<plan.dir>/YYYY-MM-DD-<slug>.md or Keiner]` (`<plan.dir>` is the plan directory from `plan.dir` of the Effective Flow configuration/project-setup ADR, default `docs/plan`)
  - `**Source workflow:** [$effective-flow build / $effective-flow fix / $effective-flow refactor / $effective-flow maintain]`
  - `**Source review:** [reviewer or phase]`
- All tables and finding blocks stay in the `$effective-flow review` format.
- The `## Skipped findings (design decisions)` section is only emitted when such findings are present.

Rules:

- Critical findings may only remain in this report if the user has explicitly decided to complete the workflow despite an open critical finding.
- Determine the action as in `$effective-flow review`: defect → `$effective-flow fix`, structural problem → `$effective-flow refactor`, missing functionality or safeguard → `$effective-flow build`, pure documentation gap → `$effective-flow docs`.
- Never enter anything automatically in `developer note`. This field is reserved exclusively for the developer's manual notes and stays empty in automatically generated reports. When a finding was deliberately not implemented and an ADR exists, note the ADR reference in the `Status` via slug, e.g. `Nicht umgesetzt (ADR: <slug>)`.
- After writing, output the report path to the user.

Current workflow for plan references: Refactoring (`$effective-flow refactor`).

## Plan references

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default `docs/plan`).

When the user references an existing plan file on invocation — for example `<plan.dir>/2024-06-01-feature.md`, `2024-06-01-feature.md`, `0030` (legacy number), or `feature` (title slug) — check the plan before the first substantive workflow phase.

### Resolve the reference

1. Resolve the reference to exactly one file under `<plan.dir>/` **or** `<plan.dir>/archive/`.
2. Permitted forms:
   - full path, e.g. `<plan.dir>/2024-06-01-feature.md` or `<plan.dir>/archive/2024-06-01-feature.md`
   - date-slug file name, e.g. `2024-06-01-feature.md`
   - legacy number, e.g. `0030` (resolved primarily via the H1 `# 0030: …`, see `Plan file convention`, not via the file name segment)
   - title slug, e.g. `feature`
3. If no file matches: report the error and note that `$effective-flow open-plans` can list open plans.
4. If multiple files match: ask the user for the specific file.

### Check the status

1. Read the plan file fresh from the file system.
2. Determine the implementation status according to the plan status convention: exactly one line with the prefix `**Planungsstatus:**` or `**Plan status:**` and a valid value; if the status line is missing, duplicated, or invalid, the status is unclear.
3. Status rules (both marker languages are equivalent):
   - exactly one status line `**Planungsstatus:** Nicht umgesetzt` or `**Plan status:** Not implemented` → the plan can be used as a basis.
   - exactly one status line `**Planungsstatus:** Umgesetzt` or `**Plan status:** Implemented` → ask the user whether the plan should be implemented again, only checked, or whether the workflow should be aborted.
   - missing or contradictory status → check whether `## Test results` or `## Review findings` are present. If so, treat the plan as probably implemented and ask. If not, ask whether the plan should be used as an unbuilt specification.

### Check the workflow recommendation

1. Check whether a line `**Empfohlener Workflow:** ...` is present in the header.
2. Determine the recommendation:
   - Feature or `$effective-flow build` → `$effective-flow build`
   - Bugfix or `$effective-flow fix` → `$effective-flow fix`
   - Refactoring or `$effective-flow refactor` → `$effective-flow refactor`
   - Documentation or `$effective-flow docs` → `$effective-flow docs`
3. If the current skill is ``tools/apply-plan.md``: use the recommendation as the target workflow and continue.
4. If the recommendation matches the current workflow: continue.
5. If the recommendation points to a different workflow:
   - emit a clearly visible message stating which workflow is recommended
   - only ask to continue if the user explicitly wants to use the plan with the current workflow anyway
6. If the recommendation is missing or unclear: continue after the status check, but point out the missing or unclear recommendation.

### Check open points

The check for open or unclarified points is handled by the "clarification gate"
(`apply-clarity-gate.md`), which the implementing workflows and the apply chain themselves
embed. This reference rule does not duplicate that check separately.

### After a successful check

- Use the contents of the plan file as the agreed basis for the current workflow.
- Record in the wisdom file which plan file is the source and which workflow recommendation it contains.
- The status update to completed happens only at the completion of the implementing workflow and preserves the marker language: a German marker becomes `**Planungsstatus:** Umgesetzt`, an English marker becomes `**Plan status:** Implemented`.

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

When an open plan for `$effective-flow refactor` is confirmed, it first passes through the
"clarification gate". If it does not pass the gate, refer according to the gate behavior to
`$effective-flow plan` or `$effective-flow review <planfile>` and end the workflow. If
the plan passes the gate:

- use the plan file's contents as the refactoring plan
- still validate in Phase 1 that no intended behavior change is included
- if a "clarified + goal-driven" context was already passed from the apply chain (basis clarified, confirmation for the autonomous run already given), honor it: skip the goal query in Phase 1 and run through phases 2–6 under the "Goal-driven completion control".

## Workflow

### Phase 1: Analysis

1. Analyze the refactoring requirement thoroughly.
2. Investigate the affected code:
   - current structure and dependencies
   - existing tests
   - affected spots
3. Clarify open questions directly with the user:
   - what exactly should be refactored
   - which constraints apply
4. Create a compact refactoring plan:
   - before -> after
   - affected files and dependencies
   - risks and side effects
5. Perform the gap analysis. The **reasoning** (root-cause placement, over-engineering/complexity lens, scope control, risk, unspoken assumptions, edge cases) follows `codebase-improvement` (see "Delegation contract: generic audit reasoning"), if available; if the skill is missing, the minimal fallback applies. What stays Effective-Flow-specific is the check for **possible behavior changes** (refactoring must not change behavior) and **missing measurable acceptance criteria**.
6. Perform the plan validation. The substantive judgment (is the refactor plan viable, executable, correctly scoped) follows the same skill; the following **deterministic scorecard thresholds** and the **behavior invariance** remain Effective Flow output contract and are not handed off to the skill:
   - Clarity: file references, target >= 80%
   - Verification: measurable acceptance criteria beyond "tests pass"
   - Context: <= 10% guessing
   - Big Picture: benefit clear
   - Behavior invariance: every change justified
7. Present the plan with scorecard.
8. Derive the explicit completion condition from the measurable acceptance criteria (see "Goal-driven completion control"); it covers phases 2–6 and feeds the explicit goal query in the approval question below. The completion condition includes behavior invariance: the baseline collected in Phase 2 must remain unchanged.
9. Obtain approval. The approval question contains the explicit goal query (option "Autonomous via /goal"); handle it per "Explicit goal query for autonomous runs": if "Autonomous via /goal" is chosen, emit the `/goal` string for phases 2–6; the option is omitted when the workflow was delegated non-interactively.

Frage den User: **Refactoring plan approved?**
- Yes -- Approval granted, workflow continues gated
- Autonomous via /goal -- Remaining phases autonomous under the native /goal — the skill emits the /goal string to paste (omitted for non-interactive delegation)
- Adjust -- Enter feedback as free text

### Phase 2: Baseline

First, per "Delivery and worktree integration", determine the effective delivery/worktree mode and, when a mode is active, run the appropriate setup before the baseline is collected: worktree setup for worktree execution or delivery-branch setup in the main repo for in-place delivery. Baseline, refactoring and post-validation (phases 2–5) then run in the delivery working directory.

Start in parallel:

1. ``code-validator``
   - TypeScript errors
   - lint errors
   - build status
2. ``test-writer``
   - run all existing tests and document the result
   - do not write new tests in this phase

Document the baseline for the later comparison.

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

### Phase 3: Refactoring

1. Start the appropriate implementer skill.
2. Assignment:
   - change only structure
   - no new behavior
   - no new features
   - no unplanned bug fixes

### Phase 4: Review

1. Start the appropriate reviewer skill for the changed files.
2. Aggregate findings:
   - Critical: fix before completion
   - Important: should be fixed
   - Note: optional
3. Present the review results in detail, including status per finding.
4. Document each finding in a structured way so open or unimplemented findings can be written as a review report:
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
5. Never create an ADR in this workflow and do not ask for one either. Deliberately unimplemented findings are documented exclusively in the review report. The developer decides on later implementation or on an ADR for a deliberate non-implementation when going through the findings file, typically via `tools/apply-review.md`.
6. If after review there remain findings with status `Open` or `Not implemented`:
   - write them into a new file under `.effective-flow/review/` per "Open review-finding reports"
   - if a plan file exists, use the file name `review-report-YYYY-MM-DD-plan-<slug>.md`
   - name the generated report path in the completion summary
7. If this phase implemented a finding from an existing review-report file in `.effective-flow/review/`:
   - add a short implementation note as the last entry directly in the affected finding
   - begin the note with `✅` and name at least the date and workflow

### Phase 5: Post-validation

Start in parallel:

1. ``code-validator``
2. ``test-writer``
   - runs all existing tests again
   - writes no new tests

### Phase 6: Before/after comparison and completion

1. Compare the results from Phase 5 with the baseline:
   - tests
   - TypeScript
   - lint
   - build
2. If regressions are found:
   - inform the user
   - back to Phase 3, then phases 5 and 6 again – per "Goal-driven completion control": bound the internal correction rounds and escalate to the user if the baseline is still not reached afterwards, instead of repeating indefinitely
3. If no regressions:
   - delete the wisdom file
   - if delivery or worktree execution was active: perform the handback per "Delivery and worktree integration" (for a guided plan file including the plan status switch to `Umgesetzt`/`Implemented` and archive move to `<plan.dir>/archive/` at the delivery point, commit the changes, retract the worktree if applicable, completion action `pr`/`merge`/`branch`, defer the checkout). If the workflow exceptionally runs in-place without delivery, it performs the same status switch and archive move directly in the working tree.
   - summarize what was refactored; for an active delivery/worktree mode, additionally name the delivery branch, the final checkout state and the result of the completion action (PR URL, merge or retained branch)
   - confirm that the behavior stayed unchanged

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

## Minimal fallback without the skill

Only relevant when `codebase-improvement` is not available. Brief core guidance for the gap analysis and plan validation in Phase 1, so `refactor` degrades cleanly – **not** a second complete audit handbook:

- Place the cause in the right spot: address the structural problem itself, not the nearest symptom.
- Keep the scope narrow: only the planned restructuring; no features, no bug fixes, no gold-plating (over-engineering lens).
- Assess risk by blast radius: treat widely used or untestable spots more cautiously and in smaller steps.
- The deterministic scorecard thresholds above (Clarity >= 80%, Context <= 10% guessing) and the behavior invariance remain unchanged.

## Rules

- Start independent specialist phases in parallel
- give a status update after each phase
- do not introduce a documentation phase if the refactoring changes no public behavior
- no new features or bug fixes during the refactoring
