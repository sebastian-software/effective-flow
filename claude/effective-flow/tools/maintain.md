
# Effective Flow Maintain

You are the orchestrator for recurring project maintenance – a **thin adapter** around the central `smart-dependency-updater` skill.

## Goal

A project is maintained without changing its behavior: outdated dependencies are upgraded in a risk-aware way, security/audit findings are fixed, and on major bumps the code is adapted to changed APIs. A green before-baseline serves as a safety net.

`maintain` **does not own the domain update mechanics itself** – they come from the central skill (see "Delegation contract"). `maintain` only steers the orchestration and the delivery.

Sharp scope boundary – `maintain` is deliberately lean:

- **In scope:** dependency updates, security/audit fixes, breaking-change adaptation.
- **Not in scope:** general refactoring or dead code (→ `/effective-flow refactor`), bugfixes unrelated to dependencies (→ `/effective-flow fix`), pure formatting/config upkeep (→ ``effective-flow-code-validator``), new functionality (→ `/effective-flow build`).
- **Not a scheduler:** automatic, time-triggered bumping is handled by tools like Renovate or Dependabot. `maintain` is the interactive "clean up now" run.

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

## Runtime directory `.effective-flow/` and migration from `.firmo/`/`.sf-plugin/`

Effective Flow keeps project-local runtime data under `.effective-flow/` (`memory.json`, `cache.json`, `review/`, `investigation/`, `.worktrees/`, wisdom files; a legacy `config.json` may still be present as a transitional fallback, but is no longer a primary source — the configuration lives in the project-setup ADR). Earlier versions used `.firmo/`, still older ones `.sf-plugin/`. When this skill reads or writes `.effective-flow/` data, these rules apply:

1. **No unrequested footprint:** Create `.effective-flow/` only when runtime data is actually written. A run with no data to save produces no `.effective-flow/`.
2. **Fallback reading:** If `.effective-flow/` is missing but an older runtime directory exists, read the needed files (`config.json`, `memory.json`, report/investigation files …) from whichever legacy directory is present — preferably `.firmo/`, otherwise `.sf-plugin/` — as long as migration has not yet happened.
3. **One-time, non-destructive migration:** As soon as a write to `.effective-flow/` would occur and no `.effective-flow/` exists yet, but a `.firmo/` or `.sf-plugin/` is present: create `.effective-flow/` and take over the existing content from the legacy directory (preferably `.firmo/` over `.sf-plugin/`; copy, do not move), then write the change into `.effective-flow/`. If `.effective-flow/` already exists, **no** further migration takes place (idempotent). Parallel-safe: a file already present in the target is not overwritten.
4. **No silent deletion:** `.firmo/` and `.sf-plugin/` are preserved; Effective Flow leaves the cleanup to the user.

The `.gitignore` switch to a single `.effective-flow/` (including migration of the earlier two-line pattern `.effective-flow/*` plus `!.effective-flow/config.json` as well as a blanket `.firmo/` or `.sf-plugin/` ignore line) is handled by `/effective-flow setup`.

## Recommended skills

- `smart-dependency-updater`

## Delegation contract

`smart-dependency-updater` is the **declared domain owner** for dependency updates (classification `delegate`, see [Skill ownership](../../docs/developer-guide/skill-ownership.md)). Its guidance is **authoritative**, not optional advice; `maintain` carries **no second copy** of this playbook.

**The skill owns the update mechanics (the "how"):**

- ecosystem/package-manager detection and update inventory (outdated + security audit),
- grouping by real coupling and risk (safe batch, major individually, security),
- changelog/release-notes research for the exact version jump,
- local impact analysis and compatibility adaptation to changed APIs,
- validation strategy and update-specific reporting (what changed upstream, risk).

**`maintain` owns the orchestration and delivery (the "what/when"):**

- the `/effective-flow maintain` entry point, the scope gate, and the progress updates,
- Effective Flow configuration, goal/completion steering, and review-report backlinks,
- the green before/after baseline as a safety net,
- the delivery policy: **one commit per group**, worktree isolation, and delivery handback.

**Delivery constraint on the skill (binding).** By default the skill delivers on its own (one PR per group, its own branch/worktree, push). In `maintain`, **Effective Flow owns the delivery**: explicitly tell the skill that it **creates no branches or worktrees, pushes nothing, and creates no pull requests** and does **not** stop after a mere chat summary. It confines itself to **analysis, research, update, and local validation per group**; the commit per group, the worktree, and the handback are done exclusively by `maintain`. This way two delivery loops do not run in parallel.

**Minimal fallback (skill missing).** If `smart-dependency-updater` is unavailable (not installed, `skills.enabled: false`, or disabled via `exclude`), the short core guidance under "Minimal fallback without the skill" applies. It keeps `maintain` functional but holds **no** second complete update manual – full depth comes only with the skill.

## Project conventions

If the project contains an `AGENTS.md`, read it before the scan and observe its specifications for dependencies, tests, review, and commits.

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
4. Commit in the worktree and run `/effective-flow pr` against `delivery.baseBranch`.
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
`/effective-flow investigate`).

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
   commit logic from `/effective-flow commit` (stage exclusively known changed files
   explicitly, derive a concrete Conventional Commit message, never set a
   `Co-Authored-By` trailer). Workflows that have already committed their work
   (e.g. `/effective-flow maintain` with one commit per group) only commit the
   plan file here afterwards, if needed. If there is nothing to commit: inform the user,
   remove an automatically created empty delivery branch and end without
   PR/merge.
3. **Determine completion action:** If `delivery.completion` has a valid value,
   use it and briefly report that the action was taken from the Effective Flow configuration
   (project setup ADR). Otherwise ask:

Wenn Delivery was active and no valid value for `delivery.completion` is set:

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Completion"
- question: "How should the delivery branch be completed?"
- multiSelect: false
- options:
  - label: "Pull request", description: "Push the branch and create a PR against the base branch via pr"
  - label: "Merge", description: "Merge the branch locally into the base branch, without a PR"
  - label: "Branch only", description: "Leave the branch in the local repo, no further action"

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
   - `pr`: delegate to `/effective-flow pr` and pass the delivery branch, base branch and the
     workflow/change type (`feat`/`fix`/`refactor`/`docs`/`chore` depending on the implementing
     workflow and effect) as a title-type hint, so the PR title carries a
     valid Conventional Commit type — with a squash merge it is the release signal.
6. **Restore checkout:** After successful PR creation or with `branch`, switch back to
   `delivery.returnBranch` or, with `auto`, to the local branch part of
   `delivery.baseBranch`, provided the working tree is clean. If the
   switch-back fails, explicitly report the actual branch as a side effect.

## Wisdom Accumulation

At the start, generate a session ID (e.g. via timestamp `date +%Y%m%d%H%M%S`) and use it consistently for the wisdom file `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`. This prevents collisions on parallel runs.

Contents:

- baseline values and their meaning
- chosen update groups and rationale
- result per group (committed, rolled back, or marked as "manual")
- breaking changes reported by the skill with migration source (changelog/release notes)

Read the file before every delegated domain phase and pass its contents on as context. Delete it at the end of the workflow.

Current workflow for review-report backlinks: `/effective-flow maintain`.

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
current `/effective-flow review` format is German):

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
   the still-German `/effective-flow review` format):
   - `**Origin plan:** [path or "Keiner"]`
   - `**Source workflow:** /effective-flow build / /effective-flow fix / /effective-flow refactor / /effective-flow maintain`
   - `**Source review:** [reviewer skill or phase]`

### Finding IDs and memory

This report uses the same global finding IDs as `/effective-flow review`.

1. Read `.effective-flow/memory.json`, if present.
2. If the file is missing, start with `lastFindingNumber: 0`.
3. Number new findings consecutively from `lastFindingNumber + 1` with seven digits, e.g. `R-0000021`.
4. After the report, write the highest assigned number back to `.effective-flow/memory.json`.
5. Preserve existing fields such as `configMigration` unchanged.
6. If memory cannot be written, inform the user and name the report path anyway.

### Report format

Use the canonical report format from `/effective-flow review` section "Report format". Do not duplicate the template here and do not deviate from it.

Additional header fields for workflow reports:

- Directly below `**Project type:** ...` set these three lines:
  - `**Origin plan:** [<plan.dir>/YYYY-MM-DD-<slug>.md or Keiner]` (`<plan.dir>` is the plan directory from `plan.dir` of the Effective Flow configuration/project-setup ADR, default `docs/plan`)
  - `**Source workflow:** [/effective-flow build / /effective-flow fix / /effective-flow refactor / /effective-flow maintain]`
  - `**Source review:** [reviewer or phase]`
- All tables and finding blocks stay in the `/effective-flow review` format.
- The `## Skipped findings (design decisions)` section is only emitted when such findings are present.

Rules:

- Critical findings may only remain in this report if the user has explicitly decided to complete the workflow despite an open critical finding.
- Determine the action as in `/effective-flow review`: defect → `/effective-flow fix`, structural problem → `/effective-flow refactor`, missing functionality or safeguard → `/effective-flow build`, pure documentation gap → `/effective-flow docs`.
- Never enter anything automatically in `developer note`. This field is reserved exclusively for the developer's manual notes and stays empty in automatically generated reports. When a finding was deliberately not implemented and an ADR exists, note the ADR reference in the `Status` via slug, e.g. `Nicht umgesetzt (ADR: <slug>)`.
- After writing, output the report path to the user.

## Workflow

### Phase 0: Scope gate

1. Confirm that this is maintenance in the sense above. If the task is actually a feature, a bugfix unrelated to dependencies, or a general refactoring, emit a clearly visible message, point to the appropriate workflow, and end.
2. Detect the project type as in `/effective-flow build`; this determines which implementer carries out a compatibility adaptation and which reviewer checks changed code. The ecosystem/package-manager detection itself is handled by the skill.
3. If no `package.json` and no lockfile are present: report that no supported Node project was detected, and end.

### Phase 1: Skill discovery and delivery setup

1. Review the available skills and bring in `smart-dependency-updater` per skill discovery. If it is missing, the "Minimal fallback without the skill" at the end applies.

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

2. Determine the effective delivery/worktree mode per "Delivery and worktree integration" and, when a mode is active, run the appropriate setup (worktree setup for worktree execution, or delivery-branch setup in the main repo for in-place delivery), **before** baseline and updates run. All following phases run in the delivery working directory so that the per-group commits land directly on the delivery branch.

### Phase 2: Baseline

Start in parallel in the delivery working directory:

1. ``effective-flow-code-validator`` – type checking, lint, build status.
2. ``effective-flow-test-writer`` – run only the existing tests and document the result; write no new tests in this phase.

Document the baseline. If the baseline is already red (build/tests broken before any update): do not update, but point to `/effective-flow fix`, since otherwise later regressions cannot be distinguished from pre-existing problems.

### Phase 3: Delegated update implementation

For the actual update work, follow the `smart-dependency-updater` skill under the **delivery constraint** established above. The skill handles: the update inventory (outdated + audit), grouping by risk and coupling, changelog/migration research, local impact analysis and compatibility adaptation, as well as the validation strategy per group. `maintain` steers the orchestration, the selection gate, and the delivery around this work.

1. **Selection gate:** Present the groups proposed by the skill and clarify which are implemented now.

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Updates"
- question: "Which of the proposed update groups should be implemented now?"
- multiSelect: false
- options:
  - label: "All safe ones", description: "Safe batch (patch/minor) and security fixes automatically, skip major bumps"
  - label: "Major too", description: "Additionally the major bumps individually with breaking-change adaptation"
  - label: "Security only", description: "Apply audit/security fixes exclusively"
  - label: "Selection", description: "Name specific groups as free text"

2. From the chosen update selection, derive the explicit completion condition (implemented groups, baseline comparison green, reviewer with no open critical findings on code adaptations; see "Goal-driven completion control"); it covers phases 3–5. Since the update gate is a selection question, ask the standalone goal follow-up question directly after the selection per "Explicit goal query for autonomous runs". If "Autonomous via /goal" is chosen, emit the `/goal` string for phases 3–5; the follow-up question is omitted if the workflow was delegated non-interactively.

Wenn the workflow runs interactively and was not delegated as a non-interactive sub-agent (e.g. by /effective-flow apply-review):

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Goal"
- question: "Run the remaining phases autonomously under /goal?"
- multiSelect: false
- options:
  - label: "Continue gated", description: "The workflow continues with the usual stops"
  - label: "Autonomous via /goal", description: "Remaining phases autonomously under native /goal — the skill emits the /goal string to paste"

3. Work through the approved groups **one after another**. For each group the skill applies the version jump, updates the lockfile via the detected manager, researches breaking changes, and where needed adapts local code to the changed API – carried out via the implementer determined in phase 0 (``effective-flow-ui-implementer``, ``effective-flow-nodejs-implementer``, ``effective-flow-rust-implementer``, or ``effective-flow-generic-implementer`` for tooling/CI/config; task: only adapt to the changed API, no new behavior). Afterwards `maintain` compares against the baseline:
   - green → **one clean commit per group** (see commit rules), a meaningful message, e.g. `chore(deps): …`.
   - red and repairable → follow up with an adaptation via the implementer, validate again – limit the internal correction rounds per "Goal-driven completion control"; if the group stays red afterwards, treat it as "not sensibly repairable" instead of repeating indefinitely.
   - red and not sensibly repairable → roll the group back (manifest and lockfile to the state before the group) and mark it as "manual".
4. Record the result and rationale per group in the wisdom file.

### Phase 4: Review

Only if code was adapted for breaking changes in phase 3:

1. Start the appropriate reviewer for the changed files (``effective-flow-frontend-reviewer``, ``effective-flow-nodejs-reviewer``, or ``effective-flow-rust-reviewer``).
2. Fix critical findings before completion.
3. If findings with status `Open` or `Not implemented` remain, write them per "Open review-finding reports" into a new file under `.effective-flow/review/` and name the report path in the completion summary.

Pure dependency bumps without code adaptation need no reviewer pass; note that briefly.

### Phase 5: Report and completion

1. Run ``effective-flow-code-validator`` one last time as a final check.
2. Summarize based on the update-specific reporting from the skill:
   - which groups were implemented and committed (with version jumps),
   - which audit findings were fixed,
   - which updates were deferred as "manual" and why,
   - a reference to an offloaded review report, if present.
3. Confirm that the behavior stayed unchanged (baseline comparison green).
4. Delete the wisdom file.
5. If delivery or worktree execution was active: run the handback per "Delivery and worktree integration". The per-group commits already sit on the delivery branch; the handback withdraws the worktree if applicable, runs the completion action `pr`/`merge`/`branch`, and restores the checkout. Name the delivery branch, the final checkout state, and the result in the summary.

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

Only relevant when `smart-dependency-updater` is unavailable. Short core guidance so that `maintain` degrades cleanly – **not** a second complete update manual:

- Detect the package manager from the lockfile (`pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `bun.lockb` → bun, otherwise `package-lock.json`/npm) and derive all commands from it – never hardcode npm.
- Collect outdated dependencies (`outdated`) and security findings (`audit`) via the detected manager.
- Group roughly: safe batch (patch/minor without known breaking changes), major individually (with a changelog note), security separately.
- Per group: apply the bump, update the lockfile via the manager, validate against the baseline; green → one commit per group, red → roll back and mark as "manual".
- On major bumps read the changelog/release notes and adapt code only to the changed API (no new behavior).

## Rules

- Start independent phases (baseline validation and tests) in parallel.
- Give a brief status update after each phase.
- One commit per group, not a single collective commit across all updates.
- Never update while the baseline is red.
- No new features, no unplanned bugfixes, and no general refactoring in the maintenance run.
- On unclear risk (major without tests in the affected area) get individual confirmation instead of waving it through in the batch.
- Delivery stays with `maintain`: the delegated skill creates no branches/PRs and does not push.
