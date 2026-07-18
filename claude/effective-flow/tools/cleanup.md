
# Effective Flow Cleanup

You clean up the legacy remnants that Effective Flow's migrations deliberately leave behind. All migrations are **non-destructive** and explicitly defer the actual deletion to the user (see `effective-flow-dir-migration.md`: "Effective Flow leaves the cleanup to the user"; `/effective-flow setup`: the untracked old `config.json` is "left on disk"). This skill is the sanctioned, user-driven path that handles this finalization — and the **only** place that actually deletes old data.

## Goal

- capture all outdated migration artifacts in the current project (discovery)
- check them against their new counterpart and determine whether anything still needs to be carried over (carry-over)
- have the user confirm every carry-over candidate and carry over what is confirmed
- then delete the old data **git-aware** and only after explicit confirmation (dry run first)
- never delete before the new counterpart exists and the carry-over is complete or deliberately discarded
- do not create a commit and do not create a backup directory
- be a no-op with a clear message when no legacy remnants are present

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

## Runtime directory `.effective-flow/` and migration from `.firmo/`/`.sf-plugin/`

Effective Flow keeps project-local runtime data under `.effective-flow/` (`memory.json`, `cache.json`, `review/`, `investigation/`, `.worktrees/`, wisdom files; a legacy `config.json` may still be present as a transitional fallback, but is no longer a primary source — the configuration lives in the project-setup ADR). Earlier versions used `.firmo/`, still older ones `.sf-plugin/`. When this skill reads or writes `.effective-flow/` data, these rules apply:

1. **No unrequested footprint:** Create `.effective-flow/` only when runtime data is actually written. A run with no data to save produces no `.effective-flow/`.
2. **Fallback reading:** If `.effective-flow/` is missing but an older runtime directory exists, read the needed files (`config.json`, `memory.json`, report/investigation files …) from whichever legacy directory is present — preferably `.firmo/`, otherwise `.sf-plugin/` — as long as migration has not yet happened.
3. **One-time, non-destructive migration:** As soon as a write to `.effective-flow/` would occur and no `.effective-flow/` exists yet, but a `.firmo/` or `.sf-plugin/` is present: create `.effective-flow/` and take over the existing content from the legacy directory (preferably `.firmo/` over `.sf-plugin/`; copy, do not move), then write the change into `.effective-flow/`. If `.effective-flow/` already exists, **no** further migration takes place (idempotent). Parallel-safe: a file already present in the target is not overwritten.
4. **No silent deletion:** `.firmo/` and `.sf-plugin/` are preserved; Effective Flow leaves the cleanup to the user.

The `.gitignore` switch to a single `.effective-flow/` (including migration of the earlier two-line pattern `.effective-flow/*` plus `!.effective-flow/config.json` as well as a blanket `.firmo/` or `.sf-plugin/` ignore line) is handled by `/effective-flow setup`.

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

## Issue-tracker integration (remote mode)

This shared fragment connects `/effective-flow review` and ``tools/apply-review.md`` with an external issue tracker (GitHub via `gh`, Forgejo via `tea`). It is **opt-in** via the Effective Flow configuration (project setup ADR) and disabled by default (`local`). In local mode both skills behave unchanged – findings run through the Markdown report file under `.effective-flow/review/`, no issues are created and no CLI is invoked.

The local/remote toggle (`tracker.mode`) affects exclusively **reviews**. **Investigations** (`/effective-flow investigate`) are exempt from it and remain purely local in every mode under `.effective-flow/investigation/` (never committed, never as an issue). Of the Effective Flow artifacts, only **plans** are committed.

It encapsulates the **shared** building blocks: the `tracker` config schema including migration, the mode determination, the host and CLI detection, the label convention, the canonical issue and epic body formats as well as the mapping of tracker operations onto `gh`/`tea`. The actual orchestration – when issues are **created** (`/effective-flow review`) and when they are **read and processed** (``tools/apply-review.md``) – stays in the respective skill.

In addition, ``tools/apply-issues.md`` and `/effective-flow plan-issue` use this fragment, though only for the **tool-generic plumbing**: the host and CLI detection (below), the availability/auth check, the mapping of tracker operations onto `gh`/`tea` and the error cases. These two skills process **arbitrary** human issues instead of the finding issues produced by `/effective-flow review`; they are **inherently remote** and do **not** evaluate the `tracker.mode` toggle (local/remote) – they only need a Git repository, an `origin` remote and an authenticated CLI. The finding-/epic-specific sections (issue body format, epic body format, `R-XXXXXXX` convention) apply only to `/effective-flow review`/``tools/apply-review.md``; the checkbox-ticking mechanics for epic bodies are used by ``tools/apply-issues.md`` analogously for container issues.

### Configuration

Remote mode works without pinned configuration (then it stays disabled, `local`). If the Effective Flow configuration (project setup ADR) pins corresponding values, they override these defaults (schema shown here for illustration):

```json
{
  "tracker": {
    "mode": "local",
    "remoteToolOverride": "auto"
  }
}
```

Missing values have these defaults:

- `tracker.mode`: `"local"` (feature off)
- `tracker.remoteToolOverride`: `"auto"` (tool automatically from the `origin` URL)

Valid values:

- `tracker.mode`: `"local"`, `"remote"`
- `tracker.remoteToolOverride`: `"auto"`, `"github"`, `"forgejo"`

`remoteToolOverride` is intended only for ambiguous hosts (e.g. self-hosted GitHub Enterprise whose domain does not contain `github.com`). With `auto` the host detection below decides.

### Config migration

Reading the Effective Flow configuration from the project setup ADR (including the `tracker` keys) and the one-time migration of a legacy config is handled centrally by the fragment "Config migration" (`config-migration.md`); this fragment performs no own per-block migration for `tracker` anymore. The `tracker` config schema above (configuration, valid values, mode determination, first-invocation query) remains unaffected by this.

### Determine mode

At the start of the run, determine the effective mode in this order (the first matching rule wins):

1. **Argument type:** The passed argument type overrides the config mode for this run. A report file (`*.md` under `.effective-flow/review/`) forces `local`; an issue reference (issue number, `#123` or an issue URL) forces `remote`.
2. **Per-run wish of the user:** If the user explicitly requests issue/tracker work, `remote` is active; if they explicitly request local work ("local", "without issues", "report only"), `local` is active.
3. **Config:** otherwise `tracker.mode` from the Effective Flow configuration (project setup ADR) applies.
4. **First-invocation query:** If `tracker.mode` is not set in the config and neither argument nor per-run wish delivers a signal, run the first-invocation query below.

### First-invocation query

Only when step 4 above applies (no config value, no argument/per-run signal):

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Tracker"
- question: "Should review findings be tracked locally as a Markdown report or remotely as issues (GitHub/Forgejo)?"
- multiSelect: false
- options:
  - label: "Local", description: "tracker.mode = local — Markdown report under .effective-flow/review/ (previous behavior)"
  - label: "Remote", description: "tracker.mode = remote — findings as issues, tool automatically from origin (gh/tea)"

Use the chosen answer as the tracker mode **for this run**. Do **not** write it into the configuration yourself — permanently pinning `tracker.mode` in the project setup ADR is handled exclusively by `/effective-flow setup`. Briefly point this out to the user, e.g. "Tracker mode `remote` used for this run; pin permanently via `/effective-flow setup`."

### Host and CLI detection (remote mode only)

In remote mode, determine the tool analogously to `/effective-flow pr`:

1. **Precondition:** A Git repository with an `origin` remote is present. If `origin` is missing or it is not a Git repository, remote mode is not possible: report clearly and abort.
2. **Choose tool:**
   - `tracker.remoteToolOverride: "github"` → `gh`; `"forgejo"` → `tea`.
   - otherwise (`auto`): Read the `origin` URL (`git remote get-url origin`) and extract the host from it robustly for HTTPS and SSH forms (`https://host/owner/repo.git`, `ssh://git@host/owner/repo.git`, `git@host:owner/repo.git`). If the host is exactly `github.com`, the tool is `gh`; **for any other host** Forgejo/Gitea is assumed and `tea` is used.
   - An explicit per-run hint from the user about the tool takes precedence for an ambiguous host (e.g. GitHub Enterprise). If the host is ambiguous and neither override nor per-run hint is present, ask the user for the desired tool.
3. **Check availability:** Ensure the chosen CLI is installed and authenticated (`gh auth status` or `tea` with a configured login). If the CLI or the authentication is missing: emit a clear error message with a remediation hint and abort without side effect. Do **not** silently fall back to `local`; offer a fallback to `local` only after explicit user consent.

### Label convention

In remote mode, use these labels and create missing labels idempotently (tolerate an "already exists" message, do not treat it as an error):

| Label                                                                                          | Meaning                                                                           |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `effective-flow-review-finding`                                                                | marks a single finding issue                                                      |
| `effective-flow-review-epic`                                                                   | marks the epic/tracking issue                                                     |
| `effective-flow-fix`, `effective-flow-refactor`, `effective-flow-build`, `effective-flow-docs` | target action of the finding (exactly one per finding issue)                      |
| `critical`, `important`, `note`                                                                | severity of the finding (exactly one per finding issue; `note` for note findings) |
| `wontfix`                                                                                      | deliberately do not implement finding → ADR instead of code                       |
| `effective-flow-issue-done`                                                                    | issue implemented by ``tools/apply-issues.md`` (PR created)                        |
| `effective-flow-needs-planning`                                                                | skipped by ``tools/apply-issues.md``; planning via `/effective-flow plan-issue` needed   |

`wontfix` already exists on many trackers; create it only if it is missing. `effective-flow-issue-done` and `effective-flow-needs-planning` belong to the issue-driven flow (``tools/apply-issues.md``/`/effective-flow plan-issue`) and are created idempotently there.

**Backward compatibility (severity labels):** The English severity labels `critical`/`important`/`note` are the default; newly created or set is exclusively the English label. The former German labels `kritisch`/`wichtig`/`hinweis` are **not** upgraded but stay **recognized** permanently when reading, listing, deduplicating and detecting a finding's severity — run a severity query per language variant (once `critical`/`important`/`note`, once `kritisch`/`wichtig`/`hinweis`) and union by issue number, analogous to the `firmo-`/`effective-flow-` prefix rule above.

**Backward compatibility (legacy prefix `firmo-`):** Earlier versions used the prefix `firmo-` instead of `effective-flow-` (`firmo-review-finding`, `firmo-review-epic`, `firmo-fix`/`firmo-refactor`/`firmo-build`/`firmo-docs`, `firmo-issue-done`, `firmo-needs-planning`). Newly **created or set** is exclusively the `effective-flow-` label; an upgrade of existing `firmo-` labels is **not** needed. When **reading, listing, deduplicating and detecting**, every `firmo-` variant counts permanently as equivalent to the associated `effective-flow-` variant:

- **Listing/filtering** (dedup, epic/issue search): `gh`/`tea` combine multiple `--label` specifications with AND semantics. Therefore run the query **separately per prefix** (once `effective-flow-…`, once `firmo-…`) and union the matches by the issue number.
- **Removing a status label** (`effective-flow-needs-planning`, `effective-flow-issue-done`): additionally remove the legacy `firmo-` variant, if present, so an issue does not stay "stuck" through a leftover legacy label.

**One-time `sf-` label migration:** The even older prefix `sf-` (`sf-review-finding`, `sf-review-epic`, `sf-fix`/`sf-refactor`/`sf-build`/`sf-docs`, `sf-issue-done`, `sf-needs-planning`) is **no longer** detected continuously, but **migrated once per repo**. On the **first** remote tracker access — provided the marker `labelMigration.sf.done` in `.effective-flow/memory.json` is missing and an authenticated CLI is present — an idempotent migration moves every still-present `sf-<x>` label to `effective-flow-<x>`: first add `effective-flow-<x>` on the issue, then remove `sf-<x>` (not the other way around, so an abort leaves no issue unclassified). Afterwards set the marker. If the migration finds no `sf-` labels, it is a silent no-op. If the marker is set, any further scan is skipped — ongoing operations know only `effective-flow-` and `firmo-`. `sf-` is referenced exclusively in this migration.

### No AI attribution in issue bodies and comments

Do not add AI attribution to issue bodies, epic bodies and comments: no "Generated with Claude Code/Codex" footers, no agent session links (e.g. `https://claude.ai/code/…`) and no `Co-Authored-By` trailers – not even when the harness appends them as a default. Factual mentions of Claude Code or Codex as the target harness are allowed, generation attribution is not.

### Issue body format (finding issue)

A finding issue must be **self-contained**: a foreign LLM session must be able to process it without access to the producing session. It contains the same content fields as a finding block of the local report format (see `/effective-flow review`, "Report format").

- **Title:** `[R-XXXXXXX] <short title>`
- **Labels:** `effective-flow-review-finding`, the action label and the severity label.
- **Body** (canonical template):

```markdown
- **Severity**: Critical / Important / Note
- **Complexity**: Low / Medium / High
- **Area**: [...]
- **File**: [path:line]
- **Problem**: [...]
- **Recommendation**: [...]
- **Action**: effective-flow-fix | effective-flow-refactor | effective-flow-build | effective-flow-docs
- **Prompt suggestion**: [directly copy-pasteable plain text, without enclosing quotation marks, without escape sequences]
- **Epic**: #<epic number> (empty if no epic)
- **Signature**: [path:line] · [Area] · [short summary of the problem]  <!-- Dedup key -->
```

The **Signature** field fixes the content dedup key (file+line, area, problem). It is deliberately **not** the `R-XXXXXXX` ID, because that is assigned freshly per run.

### Epic body format (tracking issue)

- **Title:** `Code review YYYY-MM-DD[-N]`
- **Labels:** `effective-flow-review-epic`
- **Body** (canonical template):

```markdown
Code review of YYYY-MM-DD · Scope: [Entire code / Described area] · Project type: [...]

## Findings

- [ ] #<nr> [R-0000001] <short title> — Action: effective-flow-fix
- [ ] #<nr> [R-0000002] <short title> — Action: effective-flow-refactor

## Skipped (design decisions)

- #<nr-or-none> [R-XXXXXXX] <short title> — covered by [DD-XXX] ([Source])
```

Rules for the task list:

- Each entry under `## Findings` references exactly one finding issue via its number and carries the `R-XXXXXXX` ID as well as the action.
- The section `## Skipped (design decisions)` uses **no** checkboxes and lists only findings filtered out by design decisions. It is omitted when no such findings are present.
- Ticking off is done by toggling `- [ ]` → `- [x]` and optionally appending the PR link on the entry; a finding deliberately not implemented is marked via a slug reference as `- [x] … — nicht umgesetzt (ADR: <slug>)`.

### Tracker operations (tool mapping)

Describe all tracker accesses abstractly as an operation and choose the command by the detected tool. For Forgejo, check the exact flag names against the installed `tea` version if a call fails (as noted in `/effective-flow pr`).

| Operation                                   | GitHub (`gh`)                                                                              | Forgejo (`tea`)                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Create label (idempotent)                   | `gh label create <name> --force`                                                           | `tea labels create --name <name>`                                                                        |
| Create issue                                | `gh issue create --title … --body-file … --label …`                                        | `tea issue create --title … --body … --labels …`                                                         |
| Read issue (body + labels + status)         | `gh issue view <nr> --json title,body,labels,state`                                        | `tea issue <nr>` or `tea issue view <nr>`                                                                |
| Read comments (clarifications, idempotency) | `gh issue view <nr> --json comments`                                                       | `tea issue view <nr> --comments`, otherwise Forgejo API `GET /repos/<owner>/<repo>/issues/<nr>/comments` |
| List finding issues (for dedup)             | `gh issue list --label effective-flow-review-finding --state all --json number,title,body` | `tea issues list --labels effective-flow-review-finding --state all`                                     |
| List open epics                             | `gh issue list --label effective-flow-review-epic --state open`                            | `tea issues list --labels effective-flow-review-epic --state open`                                       |
| Update issue body (tick off epic)           | `gh issue edit <nr> --body-file …`                                                         | `tea issue edit <nr> --body …`                                                                           |
| Add comment (e.g. PR link)                  | `gh issue comment <nr> --body …`                                                           | `tea comment <nr> …`                                                                                     |
| Set/remove label                            | `gh issue edit <nr> --add-label … --remove-label …`                                        | `tea issue edit <nr> --labels …`                                                                         |
| Create pull request                         | via `/effective-flow pr`                                                                         | via `/effective-flow pr`                                                                                       |

For the epic body update it applies: read the body freshly before changing, toggle only the affected line specifically and write it back, so parallel changes are not lost.

For the listing operations (dedup, open epics) the backward compatibility from "Label convention" applies: run the query separately per prefix (`effective-flow-…` **and** `firmo-…`) and union by the issue number.

### Error and edge cases

- **Missing/unauthenticated CLI:** abort clearly, give a remediation hint, leave no partial state; no silent fallback to `local`.
- **No Git repository / no `origin` remote:** remote mode not possible; report.
- **Ambiguous host:** use `remoteToolOverride` or a per-run hint; if both are unclear, ask the user.
- **Argument type contradicts `tracker.mode`:** The argument type overrides the config mode for this run (see "Determine mode").

## Project conventions

If the project has an `AGENTS.md`, read it before cleaning up and follow its guidance on file formats, configuration, and project-wide conventions.

## Hard scope boundary

- **Only the current project.** This skill does **not** touch any global skill installation (e.g. `~/.claude/skills/effective-flow` or `~/.claude/skills/firmo`, `firmo-*`/`effective-flow-*` agents). Removing old installed skills/agents is done by the deploy scripts, not this tool.
- **Never delete the new.** The active runtime directory `.effective-flow/` (except for legacy content within it that is explicitly recognized as outdated, see legacy classes) and the project setup ADR are **never** deleted.
- **No auto-commit.** The skill at most stages `git rm` changes and removes untracked files physically; it does not commit. Committing is done by the user or `/effective-flow commit`.
- **No backup.** For artifacts that are not git-recoverable, no backup directory is deliberately created; the safety net is the explicit confirmation.
- **Do not write config.** This skill does not itself write carried-over config values into the project setup ADR — `/effective-flow setup` is responsible for that (see Phase 3).
- **Delete only with consent.** Every deletion happens only after a dry run and explicit confirmation.

## Legacy classes

The skill knows exactly these four classes of migration remnants, each with its new counterpart:

| Class                       | Legacy remnant                                                                                                                                 | New counterpart                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Runtime directories         | `.firmo/`, `.sf-plugin/` (deliberately left after migration)                                                                                   | `.effective-flow/`                              |
| Legacy `config.json`        | untracked `.firmo/config.json` or a legacy `config.json` in a runtime directory                                                                | project setup ADR (see `/effective-flow setup`)       |
| Legacy `.gitignore` entries | outdated ignore lines for `.firmo/`/`.sf-plugin/` or the old two-line pattern `.effective-flow/*` + `!.effective-flow/config.json`             | the single line `.effective-flow/`              |
| `firmo-` labels             | `firmo-review-finding`, `firmo-review-epic`, `firmo-fix`/`-refactor`/`-build`/`-docs`, `firmo-issue-done`, `firmo-needs-planning` on the issue | the `effective-flow-` variant on the same issue |

`sf-` labels are **not** a standalone target: they are already moved to `effective-flow-` by the one-time `sf-` label migration (see "Label convention" in `issue-tracker.md`). This skill only clears up remaining `firmo-` labels.

## Workflow

### Phase 1: Discovery / inventory

1. Capture the existing legacy remnants in the project root:
   - **Runtime directories:** do `.firmo/` and/or `.sf-plugin/` exist?
   - **Legacy `config.json`:** does `.firmo/config.json`, `.sf-plugin/config.json`, or a `config.json` recognizable as outdated in `.effective-flow/` (transitional fallback whose values belong in the ADR) exist?
   - **`.gitignore`:** does it contain outdated lines for `.firmo/`/`.sf-plugin/` or the old two-line pattern?
   - **`firmo-` labels:** only in remote mode with an authenticated CLI (see "Host and CLI detection" in `issue-tracker.md`) — list issues with `firmo-` labels separately per prefix. If remote mode, a Git repository, `origin`, or an authenticated CLI is missing, skip this class and report that briefly.
2. For each existing legacy remnant, determine whether its **new counterpart** exists (`.effective-flow/`, project setup ADR, or `effective-flow-` labels).
3. If no legacy remnants are present, the run is a **no-op**: report that clearly and end.
4. Give the user a compact inventory (class → artifacts found → whether a new counterpart exists).

### Phase 2: Carry-over check (read + compare)

Read the legacy remnants and determine whether anything still needs to be carried over before deleting:

- **Runtime directories:** Compare the content of the legacy directory (preferring `.firmo/` over `.sf-plugin/`) with `.effective-flow/`. Collect files that are present in the legacy directory but **missing** in `.effective-flow/` (or differ in content / are newer) as carry-over candidates. Pure runtime artifacts (`cache.json`, `.worktrees/`) are usually dispensable; name them as such.
- **Legacy `config.json`:** Parse it. If it is not valid JSON, it is **not** a carry-over source: report the path and error and treat the file only as a deletion candidate (after confirmation). For valid JSON, compare each set value with the project setup ADR; values not represented there are carry-over candidates.
- **`.gitignore`/labels:** no file carry-over. For labels, the add-before-remove step in Phase 5 applies.

### Phase 3: Confirm and perform carry-over

Present the carry-over candidates to the user grouped and obtain a decision per group. Carry over only explicitly confirmed candidates.

Wenn there are runtime file candidates that are missing in `.effective-flow/` or differ:

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Carry over"
- question: "Which files from the old runtime directory should be carried over to `.effective-flow/` before it is deleted?"
- multiSelect: false
- options:
  - label: "Carry over all", description: "Copy every listed file to .effective-flow/ (do not overwrite existing files in the target)"
  - label: "Select individually", description: "Decide per file which is carried over and which is discarded"
  - label: "Carry over nothing", description: "Carry over no file — the entire old content is released for deletion"

- **Runtime files:** Copy confirmed items to `.effective-flow/` (do not move); do **not** overwrite a file already present in the target. Rejected items remain deletion candidates.
- **Config values:** Do **not** write differing values into the ADR yourself. Disclose them and refer to `/effective-flow setup` for the carry-over. Output the affected keys concretely so the user can confirm them in `/effective-flow setup`. Only once the values are in the ADR or the user explicitly discards them is the legacy `config.json` considered free of carry-over and thus deletable.
- **Labels:** no file carry-over; the carry-over happens in Phase 5 as add-`effective-flow-`-before-remove-`firmo-`.

### Phase 4: Dry-run preview

Before any deletion, list exactly what will be removed — **without** deleting yet:

1. Per artifact: path or label and the class.
2. Per file/directory, the Git status: **tracked**, **untracked**, or **gitignored**. Tracked ones are recoverable via the Git history; untracked/gitignored artifacts (`.effective-flow/`, `.firmo/`, `.sf-plugin/` are gitignored) are **not** recoverable via Git.
3. Warn on a dirty working tree and recommend committing/stashing first, so that a `git rm` staging is clean.
4. For each legacy remnant, demonstrate that its new counterpart exists and the carry-over is complete or deliberately discarded. If the new counterpart is missing (e.g. `.effective-flow/` does not exist because the migration has not run yet), do **not** offer this remnant for deletion: report that and point out that a normal tool run triggers the migration to `.effective-flow/`.
5. **Couple nested classes:** A legacy `config.json` lies physically **inside** a runtime directory (e.g. `.firmo/config.json` in `.firmo/`). Do **not** offer the containing runtime directory (class "Runtime directories") for deletion while the contained legacy `config.json` (class "Legacy `config.json`") still has open carry-over — otherwise deleting the directory would take the not-yet-carried-over `config.json` with it. Only once its values are in the ADR or explicitly discarded is the containing directory also considered deletable.

### Phase 5: Confirm deletion and execute git-aware

Obtain confirmation **per artifact class** and only then execute the deletion.

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Delete"
- question: "Remove the legacy remnants listed above now? Tracked files via `git rm` (recoverable via the history); untracked/gitignored directories are removed physically and irreversibly."
- multiSelect: false
- options:
  - label: "Yes, remove as listed", description: "Tracked via git rm (staged, no commit); untracked/gitignored deleted physically; firmo labels detached from the issue"
  - label: "Remove tracked only", description: "Only the git-recoverable, tracked artifacts via git rm; keep untracked directories and labels for now"
  - label: "Cancel", description: "Delete nothing; the inventory remains"

Execute per class:

- **Tracked files:** remove via `git rm` (staged, **no** commit). For untracked/gitignored, `git rm` does not apply.
- **Untracked/gitignored directories** (`.firmo/`, `.sf-plugin/`, a gitignored legacy `config.json`): remove physically — only after the explicit "irreversible" confirmation above, without a backup.
- **`.gitignore`:** remove only clearly outdated lines (`.firmo/`, `.sf-plugin/`, old two-line pattern). Ensure that `.effective-flow/` remains ignored; leave foreign lines untouched. The canonical `.gitignore` normalization is the job of `/effective-flow setup`; here only remove the old remnants.
- **`firmo-` labels:** only in remote mode with a CLI. First add `effective-flow-<x>` on the issue, **then** detach `firmo-<x>` from the issue (add-new before remove-old, so an abort leaves no issue unclassified). The label **definition** in the tracker remains — do **not** run `label delete`. Use the tool mapping from `issue-tracker.md` (`--add-label`/`--remove-label`, or `tea issue edit`).

On any error (e.g. `git rm` fails, tracker unreachable), abort in a controlled manner: report the partial state and delete nothing whose new counterpart is not secured.

### Phase 6: Completion

Report to the user:

- what was carried over (files to `.effective-flow/`) and which config values were referred to `/effective-flow setup`
- what was deleted, separated into tracked (via `git rm`, staged) and physically removed
- which `.gitignore` lines were removed
- which `firmo-` labels were detached from how many issues (or that the label class was skipped)
- what deliberately remains and why
- that **no** commit was created; refer to `/effective-flow commit` for the staged changes

## Rules

- Never delete without a dry run and explicit confirmation.
- Do not delete any artifact before its new counterpart exists and the carry-over is complete or deliberately discarded.
- Do not delete a runtime directory while it contains a legacy `config.json` with open carry-over; only after carry-over into the ADR or deliberate discard is it deletable.
- Do not touch `.effective-flow/` (the active directory) or the project setup ADR, nor a global skill installation.
- Do not create commits or backup directories.
- Do not write config yourself; config carry-over runs through `/effective-flow setup`.
- For label cleanup, first add `effective-flow-`, then detach `firmo-` from the issue; the label definition remains.
- If no legacy remnant is present, the run is a no-op.
- Output paths relative to the project root.
