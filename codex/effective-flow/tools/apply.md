
# Effective Flow Apply

You are the entry router that classifies any apply source and hands it off to the
matching implementation skill.

## Goal

This skill takes a single argument (or none), determines the source type via the
shared apply-source detection and delegates to the responsible skill:

- Plan file → ``tools/apply-plan.md``
- Review report (local) → ``tools/apply-review.md``
- Review epic / review finding issue (remote) → ``tools/apply-review.md``
- Container issue / free-form issue → ``tools/apply-issues.md``

The skill implements nothing itself; it only classifies and delegates. Implementation,
validation, review, status/comment updates and commit preparation lie entirely with the
target skill.

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

If the project has an `AGENTS.md`, read it before classification and honor its rules
for routing and user follow-up questions.

## Apply source detection

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default
`docs/plan`).

This shared building block is the single source of truth for **which
apply source type** a given argument is. It is used by `$effective-flow apply`
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
| `review-epic`     | tracking/epic issue of a `$effective-flow review` run                                                               | ``tools/apply-review.md`` (remote, epic)       |
| `review-finding`  | single finding issue of a `$effective-flow review` run                                                              | ``tools/apply-review.md`` (remote, issue list) |
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
  `$effective-flow open-plans` can list open plans.

### Use by the skills

- **Router (`$effective-flow apply`):** runs stage A and — for issue references —
  stage B, reports the detected type, and delegates to the responsible skill with the
  original argument. On `none`/`ambiguous`/mixed list: ask.
- **Responsibility skill (each of the three apply skills):** classifies the argument
  early via this building block. If the type matches its own responsibility → continue with its
  own depth logic. If it does not match:
  - **Direct invocation by the user:** clearly point to the responsible skill (or
    `$effective-flow apply`) and end.
  - **Delegation from `$effective-flow apply`:** should not occur, since the router
    routed correctly; the switch remains as a safeguard.

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

## Workflow

### Phase 1: Classify the source

1. Read the user argument.
2. Apply the "apply-source detection": stage A (syntactic) and — for an
   issue reference — stage B (tracker). For stage B, the host/CLI detection and
   availability check from "Issue-Tracker Integration (remote mode)" apply; if the CLI
   or authentication is missing, abort with a clear message (no silent fallback).
3. Handle the special results:
   - **`none` (no argument):** list local candidates — open plans from
     `<plan.dir>/` (status `**Planungsstatus:** Nicht umgesetzt` or
     `**Plan status:** Not implemented`) and report files under `.effective-flow/review/`.
     If the effective tracker mode is `remote` (see "Issue-Tracker Integration"),
     additionally list open review epics (label `effective-flow-review-epic`, incl. legacy
     `firmo-review-epic`) as candidates — in remote mode no local report files are written,
     so otherwise no source would be offered. Then ask the user for the specific source.
     Do not pick anything heuristically.
   - **`ambiguous`:** name the competing interpretations and ask.
   - **Mixed issue list:** if the passed issue references lead to different
     responsibilities (e.g. `review-finding` **and** `plain-issue`), ask the user to
     split the list by target type; do not route halfway. If all references lead to the
     same target skill, continue normally.

### Phase 2: Delegate to the responsible skill

1. Give the user a short output:
   - detected source type
   - resolved handle (plan path, report path or issue number(s))
   - responsible target skill (for ``tools/apply-review.md`` additionally the mode:
     local report, remote epic or remote issue list)
2. Start the responsible skill with the original argument:
   - `plan` → ``tools/apply-plan.md` <arg>`
   - `review-report` / `review-epic` / `review-finding` → ``tools/apply-review.md` <arg>`
   - `container-issue` / `plain-issue` → ``tools/apply-issues.md` <arg>`
3. Pass as context that `$effective-flow apply` has already classified the source, including
   the detected source type. After that, the entire responsibility lies with the target skill.
4. The target skill checks the basis itself against the "clarification gate" before it
   implements. `$effective-flow apply` itself does not run this check and implements
   nothing. With a clarified basis, the target skill — after a confirmation — prefers the
   goal-driven, autonomous implementation (see "Explicit goal query for autonomous
   runs" in `goal-completion.md`).

## Rules

- Do not modify any implementation, plan, report or tracker files yourself.
- Classify via the shared "apply-source detection"; do not introduce your own
  divergent detection logic.
- Do not start a build, test, validator or reviewer phase yourself.
- Do not use a heuristic "newest source" when multiple candidates exist.
- If the source type is unclear or ambiguous, ask instead of guessing.
- Output paths relative to the project root.
