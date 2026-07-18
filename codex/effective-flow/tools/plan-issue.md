
# Effective Flow Plan Issues

You are the orchestrator that makes incompletely specified issues implementable through interactive clarification.

## Goal

``tools/apply-issues.md`` skips issues whose information is insufficient for an autonomous implementation and marks them with `effective-flow-needs-planning`. This skill collects exactly these issues, performs the **clarification methodology** of `$effective-flow plan` per issue (analysis + targeted follow-up questions to the user), and writes the completed, structured specification back to the issue **as a comment**. It then removes the label `effective-flow-needs-planning` so that ``tools/apply-issues.md`` picks up the issue as implementable on the next run.

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default `docs/plan`).

Hard scope boundary:

- This skill **generates no code** and starts no implementation, test, validator, or reviewer phase.
- It creates **no** `<plan.dir>/` file; the issue remains the only source. All results end up as an issue comment.
- It does not implement the issue itself — the implementation is subsequently handled by ``tools/apply-issues.md``.

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

## Project conventions

If the project contains an `AGENTS.md`, read it early in the workflow and observe its specifications for planning and user follow-up questions.

## Tracker integration

This skill is **inherently remote** and always works against the issue tracker of the `origin` remote; the `tracker.mode` switch is **not** evaluated. From the following building block it uses only the tool-generic plumbing (host and CLI detection, availability/auth check, operation-→-command mapping, error cases).

## Issue-tracker integration (remote mode)

This shared fragment connects `$effective-flow review` and ``tools/apply-review.md`` with an external issue tracker (GitHub via `gh`, Forgejo via `tea`). It is **opt-in** via the Effective Flow configuration (project setup ADR) and disabled by default (`local`). In local mode both skills behave unchanged – findings run through the Markdown report file under `.effective-flow/review/`, no issues are created and no CLI is invoked.

The local/remote toggle (`tracker.mode`) affects exclusively **reviews**. **Investigations** (`$effective-flow investigate`) are exempt from it and remain purely local in every mode under `.effective-flow/investigation/` (never committed, never as an issue). Of the Effective Flow artifacts, only **plans** are committed.

It encapsulates the **shared** building blocks: the `tracker` config schema including migration, the mode determination, the host and CLI detection, the label convention, the canonical issue and epic body formats as well as the mapping of tracker operations onto `gh`/`tea`. The actual orchestration – when issues are **created** (`$effective-flow review`) and when they are **read and processed** (``tools/apply-review.md``) – stays in the respective skill.

In addition, ``tools/apply-issues.md`` and `$effective-flow plan-issue` use this fragment, though only for the **tool-generic plumbing**: the host and CLI detection (below), the availability/auth check, the mapping of tracker operations onto `gh`/`tea` and the error cases. These two skills process **arbitrary** human issues instead of the finding issues produced by `$effective-flow review`; they are **inherently remote** and do **not** evaluate the `tracker.mode` toggle (local/remote) – they only need a Git repository, an `origin` remote and an authenticated CLI. The finding-/epic-specific sections (issue body format, epic body format, `R-XXXXXXX` convention) apply only to `$effective-flow review`/``tools/apply-review.md``; the checkbox-ticking mechanics for epic bodies are used by ``tools/apply-issues.md`` analogously for container issues.

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

Frage den User: **Should review findings be tracked locally as a Markdown report or remotely as issues (GitHub/Forgejo)?**
- Local -- tracker.mode = local — Markdown report under .effective-flow/review/ (previous behavior)
- Remote -- tracker.mode = remote — findings as issues, tool automatically from origin (gh/tea)

Use the chosen answer as the tracker mode **for this run**. Do **not** write it into the configuration yourself — permanently pinning `tracker.mode` in the project setup ADR is handled exclusively by `$effective-flow setup`. Briefly point this out to the user, e.g. "Tracker mode `remote` used for this run; pin permanently via `$effective-flow setup`."

### Host and CLI detection (remote mode only)

In remote mode, determine the tool analogously to `$effective-flow pr`:

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
| `effective-flow-needs-planning`                                                                | skipped by ``tools/apply-issues.md``; planning via `$effective-flow plan-issue` needed   |

`wontfix` already exists on many trackers; create it only if it is missing. `effective-flow-issue-done` and `effective-flow-needs-planning` belong to the issue-driven flow (``tools/apply-issues.md``/`$effective-flow plan-issue`) and are created idempotently there.

**Backward compatibility (severity labels):** The English severity labels `critical`/`important`/`note` are the default; newly created or set is exclusively the English label. The former German labels `kritisch`/`wichtig`/`hinweis` are **not** upgraded but stay **recognized** permanently when reading, listing, deduplicating and detecting a finding's severity — run a severity query per language variant (once `critical`/`important`/`note`, once `kritisch`/`wichtig`/`hinweis`) and union by issue number, analogous to the `firmo-`/`effective-flow-` prefix rule above.

**Backward compatibility (legacy prefix `firmo-`):** Earlier versions used the prefix `firmo-` instead of `effective-flow-` (`firmo-review-finding`, `firmo-review-epic`, `firmo-fix`/`firmo-refactor`/`firmo-build`/`firmo-docs`, `firmo-issue-done`, `firmo-needs-planning`). Newly **created or set** is exclusively the `effective-flow-` label; an upgrade of existing `firmo-` labels is **not** needed. When **reading, listing, deduplicating and detecting**, every `firmo-` variant counts permanently as equivalent to the associated `effective-flow-` variant:

- **Listing/filtering** (dedup, epic/issue search): `gh`/`tea` combine multiple `--label` specifications with AND semantics. Therefore run the query **separately per prefix** (once `effective-flow-…`, once `firmo-…`) and union the matches by the issue number.
- **Removing a status label** (`effective-flow-needs-planning`, `effective-flow-issue-done`): additionally remove the legacy `firmo-` variant, if present, so an issue does not stay "stuck" through a leftover legacy label.

**One-time `sf-` label migration:** The even older prefix `sf-` (`sf-review-finding`, `sf-review-epic`, `sf-fix`/`sf-refactor`/`sf-build`/`sf-docs`, `sf-issue-done`, `sf-needs-planning`) is **no longer** detected continuously, but **migrated once per repo**. On the **first** remote tracker access — provided the marker `labelMigration.sf.done` in `.effective-flow/memory.json` is missing and an authenticated CLI is present — an idempotent migration moves every still-present `sf-<x>` label to `effective-flow-<x>`: first add `effective-flow-<x>` on the issue, then remove `sf-<x>` (not the other way around, so an abort leaves no issue unclassified). Afterwards set the marker. If the migration finds no `sf-` labels, it is a silent no-op. If the marker is set, any further scan is skipped — ongoing operations know only `effective-flow-` and `firmo-`. `sf-` is referenced exclusively in this migration.

### No AI attribution in issue bodies and comments

Do not add AI attribution to issue bodies, epic bodies and comments: no "Generated with Claude Code/Codex" footers, no agent session links (e.g. `https://claude.ai/code/…`) and no `Co-Authored-By` trailers – not even when the harness appends them as a default. Factual mentions of Claude Code or Codex as the target harness are allowed, generation attribution is not.

### Issue body format (finding issue)

A finding issue must be **self-contained**: a foreign LLM session must be able to process it without access to the producing session. It contains the same content fields as a finding block of the local report format (see `$effective-flow review`, "Report format").

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

Describe all tracker accesses abstractly as an operation and choose the command by the detected tool. For Forgejo, check the exact flag names against the installed `tea` version if a call fails (as noted in `$effective-flow pr`).

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
| Create pull request                         | via `$effective-flow pr`                                                                         | via `$effective-flow pr`                                                                                       |

For the epic body update it applies: read the body freshly before changing, toggle only the affected line specifically and write it back, so parallel changes are not lost.

For the listing operations (dedup, open epics) the backward compatibility from "Label convention" applies: run the query separately per prefix (`effective-flow-…` **and** `firmo-…`) and union by the issue number.

### Error and edge cases

- **Missing/unauthenticated CLI:** abort clearly, give a remediation hint, leave no partial state; no silent fallback to `local`.
- **No Git repository / no `origin` remote:** remote mode not possible; report.
- **Ambiguous host:** use `remoteToolOverride` or a per-run hint; if both are unclear, ask the user.
- **Argument type contradicts `tracker.mode`:** The argument type overrides the config mode for this run (see "Determine mode").

## Comment convention

Write the planning result as an issue comment (operation "Add comment" from the mapping). Begin every Effective Flow comment with the marker `<!-- effective-flow-plan-issues -->`. Canonical structure of the comment:

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
```

## Workflow

### Phase 1: Tracker setup & collection

1. Determine the host and CLI and check availability/authentication according to "Host and CLI detection". Precondition: a Git repository with an `origin` remote. If something is missing: report clearly and abort.
2. Determine the issues to plan:
   - without an argument: list all open issues with the label `effective-flow-needs-planning` (also query the old label `firmo-needs-planning` as equivalent, see "Label convention").
   - with an argument: use the passed issue references (number, `#123`, URL).
3. If there are no matching issues: a short message ("no open `effective-flow-needs-planning` issues") and end.
4. Show the user the found list (number, title) and let them choose which issues should be planned (one, several, or all).
5. Create a task per chosen issue (task tracking).

Before planning, review useful skills according to the following building block. The no-code boundary of this
tool remains strict: skills only inform the clarification/planning, generate no code
and change nothing except the issue comments.

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

### Phase 2: Planning per issue (interactive)

For each chosen issue in turn:

1. Read the issue fresh from the tracker – **including comments** (operation "Read comments") – and examine the relevant codebase (locally or with an internal analysis sub-agent). Take maintainer clarifications from comments into account as part of the requirement. If a `<!-- effective-flow-plan-issues -->` planning comment from an earlier run already exists (the old marker `<!-- firmo-plan-issues -->` is recognized as equivalent, one generation of back-compat), treat this run as an **update**: build on the existing state instead of producing a second, competing plan.
2. Apply the clarification methodology from `$effective-flow plan` (Phase 1/2): identify the genuinely relevant ambiguities — target behavior, domain rules, technical requirements, dependencies, edge cases, acceptance criteria — and ask the user about them specifically.
3. Repeat the clarification until a reliable basis exists. Document unimportant remaining points as assumptions instead of blocking the process.
4. Determine the recommended implementation (Feature / Bugfix / Refactoring / Documentation) according to the classification definitions from `$effective-flow plan`.

### Phase 3: Write-back & release for implementation

Per planned issue:

1. Write the completed specification as a comment on the issue (canonical structure above). The comment must be self-contained: a foreign session must afterwards be able to implement the issue without this planning session. If a `<!-- effective-flow-plan-issues -->` comment from an earlier run already exists (known from the comment check in Phase 2), update or replace its content instead of appending a second one (idempotency based on the operation "Read comments").
2. Remove the label `effective-flow-needs-planning` (planning complete; also remove any existing old `firmo-needs-planning` variant, see "Label convention"). Do **not** set `effective-flow-issue-done` — the issue is planned but not yet implemented.
3. Set the task to `completed`.

### Phase 4: Summary

Report to the user which issues were planned and provided with a planning comment, and point out that they can now be implemented via $effective-flow apply. This skill itself implements nothing.

## Rules

- Do not change any implementation files and generate no code.
- Do not create any `<plan.dir>/` file.
- If the clarification does not enable a reliable plan (e.g. because the user does not answer central questions), leave the label `effective-flow-needs-planning` in place and document in the comment which decision is still outstanding.
- Never set `Co-Authored-By` trailers and do not expose internal IDs in comments.
- Give the user a brief status update after each phase.
