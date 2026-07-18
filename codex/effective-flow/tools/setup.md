
# Effective Flow Setup

You prepare a target project for using Effective Flow: a `.gitignore` entry for the pure runtime directory `.effective-flow/` and interactive maintenance of the Effective Flow configuration in a living **project setup ADR** (default `docs/adr/effective-flow-project-setup.md`) that a marker in `AGENTS.md` points to.

## Goal

- enter the runtime directory `.effective-flow/` completely and idempotently into `.gitignore` (only if the target state is not yet established)
- write the Effective Flow configuration via a guided wizard into the project setup ADR table or update it non-destructively, and set the `**Effective Flow project setup:**` marker in `AGENTS.md` (or `CLAUDE.md`)
- migrate an existing `.firmo/config.json` once into the ADR and then untrack it (leave the file content on disk)
- always start from safe defaults and offer the user two paths: **Express** (adopt defaults) or **Guided** (go through every option explained)
- explain every option so that it is understandable even without prior knowledge of how Effective Flow works
- for an existing config, show and pre-select the currently recorded value at every choice
- do not run project validation such as linting, tests, or build checks

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

## Project conventions

If the project has an `AGENTS.md`, read it before writing and follow its guidance on configuration, file formats, and project-wide conventions.

## Config schema

The Effective Flow configuration is optional and controls the defaults of the following blocks. Its source of truth is the project setup ADR table (see the building block above for encoding and locator). The respective skills are the authoritative source for valid values and defaults; this skill only summarizes them and must not count as the sole truth when the schema is extended. Unknown keys of an existing config are always preserved.

- **`review`** (source: `$effective-flow review`): `profile` (full/focused/fast), `autoConfirmScope` (bool), `designDecisionSources` (full/standard/minimal), `validation` (full/quick/off)
- **`applyReview`** (source: ``tools/apply-review.md``): `defaultCommitStrategy` (worktrees/single/none/`null` = ask at run time), `finalValidation` (full/changedScope/off), `stashPolicy` (interactive/keep/discard/apply), `worktree.baseDir`, `worktree.setup` (auto/none/command)
- **`plan`** (source: `$effective-flow plan`): `markerLanguage` (de/en), `dir` (string, default `docs/plan`) — directory of the plan files
- **`delivery`** (source: `$effective-flow build`, section "Delivery and worktree integration" – likewise embedded in the other code-changing workflows): delivery is implied by worktree/branch (no separate `enabled` switch anymore) — `baseBranch` (default `origin/main`), `branchPrefix` (default `effective-flow`), `completion` (pr/merge/branch, default `merge`), `returnBranch` (auto or local branch name)
- **`worktree`** (source: `$effective-flow build`, section "Delivery and worktree integration"): `enabled` (bool, default `true`), `setup` (auto/none/command), `baseDir`
- **`tracker`** (source: `$effective-flow review`, section "Issue-tracker integration" – likewise embedded in ``tools/apply-review.md`` and the other tracker workflows): `mode` (local/remote, default `local`), `remoteToolOverride` (auto/github/forgejo, default `auto`)
- **`skills`** (source: building block "Skill discovery"): `enabled` (bool, default `true` — toggles dynamic skill usage), `include` (list — prefer these skills project-wide), `exclude` (list — never apply these skills), `agents.<name>` and `tools.<name>` (each `include`/`exclude` for a single agent or a single tool). Keys are the source agent/tool names (e.g. `ui-implementer`, `plan`).

### Safe defaults (the single base)

The wizard **always** starts from this single named safe-defaults base. It comprises
the conservative `review`/`applyReview` values plus the core switches (values in the
ADR's table-encoding form):

| Key                               | Value                                               |
| --------------------------------- | --------------------------------------------------- |
| review.profile                    | focused                                             |
| review.autoConfirmScope           | false                                               |
| review.designDecisionSources      | standard                                            |
| review.validation                 | full                                                |
| applyReview.defaultCommitStrategy | null (ask at run time)                              |
| applyReview.finalValidation       | full                                                |
| applyReview.stashPolicy           | interactive                                         |
| applyReview.worktree.baseDir      | .effective-flow/.worktrees                          |
| applyReview.worktree.setup        | auto                                                |
| worktree.enabled                  | true                                                |
| delivery.completion               | merge                                               |
| delivery.baseBranch               | origin/main                                         |
| tracker.mode                      | local                                               |
| plan.dir                          | docs/plan                                           |
| plan.markerLanguage               | derived: detect from existing plans, otherwise `en` |

There is deliberately **no** second preset anymore. Anyone who wants a faster solo flow (e.g.
`review.profile: fast`, `review.validation: quick`, `applyReview.finalValidation:
changedScope`) reaches these values individually via the guided path (advanced
settings). For `plan.markerLanguage` there is no fixed value: detect the marker language
from existing plans (detection as in `$effective-flow plan`); without a clear signal,
English.

## Workflow

### Step 1: .gitignore entry

Target state: the entire runtime directory `.effective-flow/` (excluding the `config.json` migration — the config now lives in the ADR; runtime files like `memory.json`, `cache.json`, `review/`, `.worktrees/`) is ignored. The single line achieves this:

```gitignore
.effective-flow/
```

There is **no** `!.effective-flow/config.json` exception pattern anymore: the Effective Flow configuration is no longer kept as a tracked `config.json`, but in the project setup ADR. `.effective-flow/` is thus a pure runtime directory and is ignored completely.

1. Check whether the target state is already established — with Git available, via: `git check-ignore -q .effective-flow/config.json` must end with exit code 0 (the directory including `config.json` is ignored) and there must be **no** `!.effective-flow/config.json` negation line left in `.gitignore`. Without Git, via a line comparison of `.gitignore`: one line ignores `.effective-flow/` as a whole and **no** `!.effective-flow/…` negation line follows.
2. If the target state is not yet established:
   - Migrate the former two-line pattern: if `.gitignore` contains the lines `.effective-flow/*` and `!.effective-flow/config.json` (old target state with a tracked `config.json`), replace **both** with the single line `.effective-flow/`.
   - Migrate old directory patterns of the predecessor names: if a line ignores the former `.firmo/` or `.sf-plugin/` (common spellings with/without a leading or trailing slash, including the old `.firmo/*` + `!.firmo/config.json` two-line form), replace it with the single line `.effective-flow/`. Normalize an already-present blanket `.effective-flow/` (or `.effective-flow`, `/.effective-flow/`) to `.effective-flow/` and remove any subsequent `!.effective-flow/config.json` negation line.
   - If every `.effective-flow/` entry is missing, append the line `.effective-flow/`. Ensure a trailing newline before appending. If `.gitignore` is missing, create it with this single line.
3. If the target state is already established: change nothing and report that briefly.
4. If the project is not a Git repository: point out that a `.gitignore` is ineffective without Git, and ask whether it should be written anyway. Then use the same line comparison as above instead of `git check-ignore`. The config creation continues independently of this.

### Step 2: Determine the ADR location and read the existing config

1. **Detect the ADR directory.** Look for an existing ADR convention (following the
   search globs of `$effective-flow review`): `docs/adr/`, `docs/decisions/`, `adr/`. Use an
   existing directory. If none exists, the default is `docs/adr/`. If
   **several** exist, prefer `docs/adr/` for the project setup ADR; ask only on genuine
   ambiguity in the guided path:

Wenn several ADR directories exist and none is clearly `docs/adr/`: Frage den User: **In which directory should the Effective Flow project setup ADR live?**
- docs/adr/ -- Recommended default for the project setup ADR
- docs/decisions/ -- Use an existing directory
- adr/ -- Use an existing directory

2. **Resolve the project setup ADR.** Resolve an already-existing project setup ADR via the
   config locator (AGENTS.md marker `**Effective Flow project setup:** <path>` → default path/scan
   → transitional `.firmo/config.json`; see the building block above). If a marker points to a dead
   path, continue down the order and note the outdated marker for correction.
3. **Form the current values.** If an ADR exists: parse the `## Configuration` table
   per the encoding into an internal "current values" overview (key → currently
   recorded value). If no ADR exists (yet) but a `.firmo/config.json` does
   (migration case): read its values as the current values and note internally that a migration
   will happen. Show the respective value at every following question ("currently recorded:
   …") and use it as the pre-selection. If a key is missing, label the pre-selection as the
   default ("currently not set – default: …").
4. **Invalid source.** If the ADR table is invalid/ambiguous or an old `config.json`
   is not valid JSON: do not overwrite silently. Inform the user with the path and error and
   ask whether the configuration should be newly created (old backup/overwrite) or the run
   aborted.

### Step 3: Express or Guided

Briefly explain to the user that Effective Flow is immediately ready to use with safe defaults and that they only need to adjust something if they want to. Then offer the two paths:

Frage den User: **How would you like to set up the Effective Flow configuration?**
- Express -- Adopt safe defaults (keep the current values of an existing config) — one confirmation step, then done
- Guided -- Step by step through the options — each is explained, ideal if you do not yet know Effective Flow

- **Express:** Build the target configuration from the safe-defaults base (config schema above)
  plus – if a valid config exists – its existing values. Derive
  `plan.markerLanguage` per the base (detection, otherwise English). Jump directly to
  Step 6 (merge and write); the before/after list and confirmation there
  ensure that no existing, differing config is silently overwritten.
- **Guided:** Continue with Step 4 (core switches); the optional
  advanced gate follows afterwards (Step 5).

### Step 4: Core switches (guided path only)

These four switches determine the core behavior. **Before** each question, provide a short,
understandable explanation (what is it, why is it relevant, what does the choice mean) –
without assuming prior knowledge of Effective Flow – and state whether and with which value the
switch is currently set in the config (see Step 2); pre-select this value or the safe
default. Explain technical terms in one sentence at first mention.

**Worktree.** Explain: Effective Flow implements changes by default in a separate workspace
with its own branch (a "worktree"), so that your current state stays untouched and the
work is cleanly bundled; "No" works directly in your current checkout.

Frage den User: **Should the implementation run in a separate Git worktree?**
- Yes -- worktree.enabled = true (default) — the implementation runs in a separate worktree with its own delivery branch
- No -- worktree.enabled = false — in-place without a worktree; delivery branches are created in the main repo when needed

**Completion action.** Explain: how finished changes are brought in. `merge` brings them
directly into the target branch, `pr` opens a pull request (review before integration), `branch`
just leaves the branch; "ask at run time" decides anew each time.

Frage den User: **Which completion action should Effective Flow use by default?**
- Merge -- delivery.completion = merge (default) — merge the branch locally into the base branch, without a PR
- Pull request -- delivery.completion = pr
- Branch only -- delivery.completion = branch
- Ask at run time -- delivery.completion = null — the action is asked per run

Briefly explain the base branch (the branch that is delivered into) and ask for it as free text
(`delivery.baseBranch`, default `origin/main`); the switch-back target (`delivery.returnBranch`,
default `auto`) only optionally.

**Marker language.** Explain: the language of the small status marker at the head of
plan files (only the marker, not the plan content). Pre-selection: the value detected from existing
plans; if there is no signal, English.

Frage den User: **In which language should the status markers of new plan files be?**
- English -- plan.markerLanguage = en (default if no language can be detected from existing plans)
- German -- plan.markerLanguage = de

**Tracker.** Explain: where review findings end up – `local` as a Markdown report in the project
(`.effective-flow/review/`) or `remote` as issues on GitHub/Forgejo (useful for teamwork).

Frage den User: **Should review findings be kept locally as a Markdown report or remotely as issues (GitHub/Forgejo)?**
- Local -- tracker.mode = local (default) — Markdown report under .effective-flow/review/
- Remote -- tracker.mode = remote — findings as issues, tool automatically from origin (gh/tea)

For "Remote", ask for the tool override only if needed: the default `tracker.remoteToolOverride = auto` detects GitHub/Forgejo automatically from the `origin` URL. Only if the user has an ambiguous host (e.g. self-hosted GitHub Enterprise), capture `github` or `forgejo` as free text; otherwise leave `auto`.

### Step 5: Advanced settings (optional gate, guided path only)

The core switches suffice for everyday use. All remaining options are needed less often; therefore
first ask whether the user wants to adjust them at all:

Frage den User: **Would you like to adjust advanced settings (review, apply-review, paths, fine details)?**
- No -- Keep safe defaults or existing values — recommended if you are still getting to know Effective Flow
- Yes -- Go through the remaining options one by one, each explained

For "No": all advanced keys keep the safe default or the existing
config value; continue to Step 6. For "Yes": ask for each key block by block, each
with a short explanation, the valid values from the config schema above, and the current
config value or default as the pre-selection:

1. `review`: `review.profile` (full/focused/fast — depth of the review), `review.autoConfirmScope`, `review.designDecisionSources`, `review.validation`
2. `applyReview`: `applyReview.defaultCommitStrategy`, `applyReview.finalValidation`, `applyReview.stashPolicy`, `applyReview.worktree.baseDir`, `applyReview.worktree.setup`
3. `plan`: `plan.markerLanguage` (already asked in Step 4 — carry over), `plan.dir` (free text, default `docs/plan` — directory of the plan files)
4. `delivery`: `delivery.baseBranch` and `delivery.completion` (already asked in Step 4 — carry over), `delivery.branchPrefix`, `delivery.returnBranch`
5. `worktree`: `worktree.enabled` (already asked in Step 4 — carry over), `worktree.setup`, `worktree.baseDir`
6. `tracker`: `tracker.mode` (already asked in Step 4 — carry over), `tracker.remoteToolOverride` (auto/github/forgejo)
7. `skills`: `skills.enabled` (bool), `skills.include`/`skills.exclude` (global lists) as well as – as an advanced option – `skills.agents.<name>` and `skills.tools.<name>` for individual agents/tools. Additionally offer optionally (do not force) to materialize the built-in per-agent and per-tool recommendations visibly into the config as `skills.agents.<name>.include` or `skills.tools.<name>.include`; for a fallback recommendation (`effective-web › impeccable › frontend-design`), write only the **primary** skill (`effective-web`) — the built-in fallback stays active. Flat recommendations (e.g. `locale-typography`) are carried over unchanged.

Anyone who wants the former "fast solo workflow" sets, for example, `review.profile: fast`,
`review.validation: quick`, and `applyReview.finalValidation: changedScope` here.

Note: `applyReview.worktree.*` (apply-review's own worktree mechanism), the top-level `worktree.*` block (execution location), and the top-level `delivery.*` block (delivery branch/completion) are separate, independent config paths — do not confuse them when asking and merging.

Ask for free-text values (e.g. `baseBranch`, `branchPrefix`, `returnBranch`, `baseDir`, or an explicit `setup` command) as free text. On invalid input for an enumerated key, ask again or use the default and report that.

### Step 6: Merge and write

1. Build the target configuration non-destructively: set the known keys to the chosen values, carry over existing valid values for keys not asked about, and leave unknown keys unchanged.
2. This also applies to the safe defaults: a default value that would replace an already-present, differing config value is set only after explicit confirmation. Before writing, show a before/after list of **all** keys to be changed (whether from the express base, the core switches, or the advanced settings) and obtain confirmation. A full overwrite (discarding existing values) likewise only after explicit confirmation.
3. Resolve the project setup ADR freshly once more directly before writing (locator) and re-read an existing ADR table or old `config.json` freshly, so that intervening changes are not lost.
4. **Write the project setup ADR.** Determine the ADR directory (Step 2) and write the
   ADR to `<adr-dir>/effective-flow-project-setup.md` (default slug `effective-flow-project-setup`; an old slug `firmo-project-setup` is recognized as equivalent during the scan and switched to the new slug on write) in the
   living ADR format:
   - H1 `# Effective Flow project setup`
   - `## Status` with `Active`
   - a short `## Context` prose (this ADR holds the tracked Effective Flow configuration; `.effective-flow/` is a pure runtime directory)
   - `## Configuration` with the two-column table `| Key | Value |`; one row per key in the table-encoding form (boolean, unquoted string, literal `null`, `(empty)`, comma-separated list, dotted keys). Preserve unknown foreign keys from an existing source as their own rows.

   Example skeleton:

   ```markdown
   # Effective Flow project setup

   ## Status

   Active

   ## Context

   This ADR holds this project's tracked Effective Flow configuration. `.effective-flow/` is a pure
   runtime directory and completely gitignored.

   ## Configuration

   | Key                         | Value    |
   | --------------------------------- | ------- |
   | review.profile                    | focused |
   | applyReview.defaultCommitStrategy | null    |
   | worktree.enabled                  | true    |
   | tracker.mode                      | local   |
   ```

5. **Set the AGENTS.md marker.** Write the canonical line `**Effective Flow project setup:** <adr-path>` non-destructively: preferably into an existing `AGENTS.md`, otherwise into an existing `CLAUDE.md`, otherwise create a minimal `AGENTS.md` with this line. Leave the remaining content untouched; update an existing (possibly outdated) marker instead of duplicating it — this includes an old marker `**Firmo project setup:**`, which is switched to the new spelling in the process.
6. **Migration and untracking (migration case only).** If an old `.firmo/config.json` was read as the source:
   - Untrack it automatically with `git rm --cached .firmo/config.json`; **leave the file content on disk** (Effective Flow's non-destructive line), leaving the cleanup to the user. `git rm --cached` **stages** an index change but creates **no** commit — the setup rule "creates no commits" stays intact.
   - If the project is not a Git repository or the file is not tracked, skip the untracking and report that.
   - Mark the migration completion idempotently in `.effective-flow/memory.json` under `configMigration.adr` (`version` e.g. `config-to-adr-v1`, `appliedAt` timestamp), without losing existing `memory.json` fields. If this marker is already set, do not migrate again.

### Step 7: Summary

Report to the user:

- whether the `.gitignore` line `.effective-flow/` was added, a former two-line pattern (`.effective-flow/*` plus `!.effective-flow/config.json`) or an old `.firmo/`/`.sf-plugin/` line was migrated to it, or the target state was already established
- which path was chosen (Express or Guided) and whether advanced settings were adjusted
- the set central behavior values (`worktree.enabled` [default `true`], `delivery.completion` [default `merge`] including, if applicable, `delivery.baseBranch`/`delivery.returnBranch`, `plan.markerLanguage`, `tracker.mode`, and, if applicable, `tracker.remoteToolOverride`) as well as `plan.dir`, if set or changed from the default
- for a previously existing config: which keys were changed from the old state (before/after)
- the path of the written project setup ADR and the location of the set `**Effective Flow project setup:**` marker (`AGENTS.md`/`CLAUDE.md`)
- in the migration case: that the old `.firmo/config.json` was **removed staged** via `git rm --cached` (content left on disk) but **not** committed — and that the user handles the cleanup themselves

## Rules

- Change only `.gitignore` (the `.effective-flow/` line or its migration), the project setup ADR, and the `**Effective Flow project setup:**` marker in `AGENTS.md`/`CLAUDE.md`; no further setup steps like deployment or Git hooks.
- Never overwrite existing config values and unknown keys without asking.
- On an abort during the questions, leave no half-written ADR; write only once at the end.
- Do not start project validation; linting, tests, and build checks are the job of other skills such as ``code-validator``.
- Do not create commits; committing is done by the user or `$effective-flow commit`. Untracking an old `config.json` only stages an index change (`git rm --cached`) without committing.
- Do not process or store any secrets; the configuration contains only behavior defaults.
