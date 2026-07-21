## Portable worker delegation

Names matching `effective-flow-<worker>` in this instruction identify bundled worker contracts, not installed custom-agent roles. When a worker is selected, read only its matching `workers/effective-flow-<worker>.md` file, then delegate through the host harness's built-in general-purpose subagent mechanism with that contract as the worker instructions. Do not request a custom role by the contract name. If built-in subagent delegation is unavailable, stop with a clear explanation; never claim that an undiscoverable worker ran.

# Effective Flow Apply Plan

You are the orchestrator that hands off open plan files to the matching implementation workflow.

## Goal

This skill takes a plan file from `<plan.dir>/`, validates its canonical status marker and its workflow recommendation, and then starts the matching skill:

- Feature → `effective-flow build`
- Bugfix → `effective-flow fix`
- Refactoring → `effective-flow refactor`
- Documentation → `effective-flow docs`

The skill implements nothing itself. It is a routing layer over the existing workflow skills.

## Language resolution

Effective Flow resolves the language of persisted, human-readable content by **target surface**.
The project setup ADR may contain these stable keys; each value is `de` or `en`:

| Key                                | Surface                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `language.project`                 | Fallback for every surface; default `en`                                    |
| `language.source`                  | Comments, test descriptions, and in-code documentation                      |
| `language.documentation.user`      | Root README, marketing entry point, and user documentation                  |
| `language.documentation.technical` | Developer/API documentation, operations documentation, runbooks, and ADRs   |
| `language.workflow`                | Plans, plan reviews, local review reports, and investigation reports        |
| `language.forge`                   | Issues, PR bodies, issue/PR comments, and remote review replies             |
| `language.git`                     | Commit descriptions, Conventional Commit PR titles, changelog/release prose |

Identifiers, public API names, config keys, encoded values, schemas, paths, label names, HTML
markers, finding IDs, action values, Conventional Commit types, and branch slugs are not
localized. Product UI/CLI/error text follows the target project's product-i18n rules and is not
controlled by this configuration. Exact quotations and incoming third-party text are not
translated unless explicitly requested.

### Resolver (the single precedence rule)

For each artifact, determine its target surface first and resolve exactly once:

1. An explicit user language request for that artifact wins.
2. When editing an existing artifact, preserve its clearly recognizable language unless the user
   requests translation. If it is mixed or unclear, clarify before changing human-readable prose.
3. For a new artifact, use the valid surface-specific `language.*` override.
4. Otherwise use a valid `language.project`.
5. Otherwise use `en`.

Only `de` and `en` are valid. An invalid value has no special meaning: report the affected key,
ignore it, and continue with the next fallback. A missing override means inheritance; `null` is
not a language value. Interactive, non-persisted replies follow the user's current language,
using `language.project` only if the conversation language is not recognizable.

At overlap boundaries, the publication destination decides: local review prose uses
`language.workflow`, remote review prose uses `language.forge`, commit prose uses `language.git`.
A PR title that is a Conventional Commit subject uses `language.git`; its body and all comments
use `language.forge`.

An orchestrating tool resolves every required surface once per run and passes the concrete
`de`/`en` values to delegated agents. Agents must use that supplied language context and must not
independently re-read the project setup ADR. A directly invoked agent or standalone tool with no
orchestrator resolves the required values itself using this same rule.

### Transitional workflow fallback (read compatibility only)

When no valid `language.workflow` and no valid `language.project` exist, a legacy
`plan.markerLanguage = de|en` may temporarily supply `language.workflow`; report that the old
marker setting now controls the **whole workflow artifact** and point to `effective-flow setup`.
Writers never create `plan.markerLanguage`.

If no `language.*` or legacy marker key exists, an unconfigured project may temporarily derive
`language.workflow` from its existing plan corpus only when the plan prose, canonical fields,
and status marker consistently and unambiguously use one language across the corpus. A marker
alone is not evidence. Mixed, contradictory, empty, or unclear corpora supply no signal and fall
through to `en`; report the setup recommendation. This fallback is read-only compatibility and
does not authorize rewriting existing plans.

### Complete artifact consistency

One persisted artifact uses one language for all human-readable prose, including its headings,
field labels, displayed status values, review sections, and open-point sections. Readers accept
the documented complete German and English forms; writers never mix them. An explicit translation
changes the complete artifact, not only one marker or heading.

### Typography

Map `de` to `de-DE` and `en` to `en-US`. Locale-specific typography of visible prose — quotation
marks, dashes, umlauts and ß, non-breaking spaces, number and date formats — is owned by the
central `locale-typography` skill. Its locale guidance is authoritative; Effective Flow keeps no
second typography checklist.

If the skill is unavailable (not installed, `skills.enabled: false`, or disabled via `exclude`),
use only this minimal fallback for German prose: real umlauts and ß rather than ASCII
transliterations, German quotation marks „…“, and a spaced en dash – for parenthetical dashes.
Do not alter code, identifiers, commands, paths, or machine-readable values for typography.

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
   `**Firmo project setup:** <path>` is recognized as equivalent on read; effective-flow setup
   converts it non-destructively to the new spelling on the next run. If the
   marker points to a path under which **no** ADR lives (dead/stale marker), do not stay
   there, but fall through in this order and report the stale marker
   (correction in effective-flow setup).
2. **Default path/scan.** Otherwise `docs/adr/effective-flow-project-setup.md` (the legacy slug
   `firmo-project-setup` is recognized as equivalent during the scan) or a scan of the detected
   ADR directory (`docs/adr/`, `docs/decisions/`, `adr/`) for the project setup ADR.
3. **Transitional compatibility.** Otherwise — only transitionally — establish or reuse the
   verified execution-location receipt and resolve the fallback from `RUNTIME_STATE_ROOT`: read
   a still-present absolute `<RUNTIME_STATE_ROOT>/.effective-flow/config.json` handle (otherwise
   `<RUNTIME_STATE_ROOT>/.firmo/config.json`) and point to effective-flow setup. Never inspect a
   same-named fallback below a linked `EXECUTION_ROOT`. A missing, bare, moved, unsafe, or
   repository-mismatched runtime root blocks the fallback. This read path creates **nothing**
   and touches **no** Git.
4. **Built-in defaults.** Otherwise use the defaults of the respective source skills.

The deterministic read path of any tool is non-blocking: It reads the ADR (or
the transitional fallback), but itself creates no file and mutates no Git. Creating
the ADR, the markers and the migration happen exclusively in the Git-touching path of
effective-flow setup.

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

### Language configuration and compatibility migration

The supported language keys and their surface mapping live only in the shared "Language
resolution" fragment. This configuration contract accepts `language.project`,
`language.source`, `language.documentation.user`, `language.documentation.technical`,
`language.workflow`, `language.forge`, and `language.git`; every value is `de` or `en`.
Missing overrides inherit `language.project`, and a missing project language resolves to `en`.
Invalid values are ignored with a diagnostic and never guessed.

`plan.markerLanguage` is a legacy read/migration key, not part of the current schema. If
`language.workflow` is absent, effective-flow setup may propose migrating a valid legacy `de`/`en`
value to `language.workflow`; an existing `language.workflow` always wins. Show explicitly that
the old marker-only setting becomes the language of the complete workflow artifact. Apply the
addition and removal only in the confirmed before/after write step. Preserve the legacy key if
the write is not confirmed, and never emit it in a new configuration.

If neither language keys nor the legacy key exist, effective-flow setup may propose the read-only
plan-corpus fallback defined by "Language resolution" as `language.workflow`, but only when
prose, fields, and markers consistently identify one language. Mixed, contradictory, or empty
plan sets are not migrated. This compatibility path must be reported and confirmed like every
other config change.

<!-- runtime-state-safety: setup-repair-only:start -->

### One-time migration legacy `config.json` → project setup ADR

The migration of an existing `.effective-flow/config.json` or legacy `.firmo/config.json`
into the project setup ADR is **Git-touching** and runs exclusively in the
effective-flow setup path. It produces the ADR table from the current config content (encoding
as above), writes the AGENTS.md marker `**Effective Flow project setup:**`, switches
`.gitignore` to a single `.effective-flow/` and untracks the legacy `config.json`
(`git rm --cached`, leave the file content on disk). The exact procedure including
idempotency marking is in effective-flow setup.

Outside effective-flow setup, **no** migration takes place: The deterministic
read path creates nothing and touches no Git; on a missing ADR it reads instead a
still-present `<RUNTIME_STATE_ROOT>/.effective-flow/config.json` (otherwise
`<RUNTIME_STATE_ROOT>/.firmo/config.json`) and points to effective-flow setup.

<!-- runtime-state-safety: setup-repair-only:end -->

## Plan status convention

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default
`docs/plan`).

Plan files in `<plan.dir>/` use exactly one canonical status marker in their header. The marker may be written in either German or English:

- open (German): `**Planungsstatus:** Nicht umgesetzt`
- completed (German): `**Planungsstatus:** Umgesetzt`
- open (English): `**Plan status:** Not implemented`
- completed (English): `**Plan status:** Implemented`

Both marker forms are equivalent. Only one language is used per plan file. The marker is not an
independent language choice: it is part of the complete plan language resolved by "Language
resolution" (`language.workflow` for a new plan, or the preserved language of an existing plan).

### Canonical bilingual plan contract

Readers map these complete forms to the same internal meanings; writers choose one column and
use it consistently throughout the artifact:

| Meaning              | German                                              | English                                      |
| -------------------- | --------------------------------------------------- | -------------------------------------------- |
| Status, open         | `**Planungsstatus:** Nicht umgesetzt`               | `**Plan status:** Not implemented`           |
| Status, completed    | `**Planungsstatus:** Umgesetzt`                     | `**Plan status:** Implemented`               |
| Source               | `**Quelle:**`                                       | `**Source:**`                                |
| Workflow             | `**Empfohlener Workflow:**`                         | `**Recommended workflow:**`                  |
| Doc category         | `**Doku-Kategorie:**`                               | `**Doc category:**`                          |
| Target path          | `**Ziel-Pfad:**`                                    | `**Target path:**`                           |
| Requirement          | `## Anforderung`                                    | `## Requirement`                             |
| Architecture         | `## Architekturentscheidungen`                      | `## Architecture decisions`                  |
| Affected files       | `## Betroffene Dateien`                             | `## Affected files`                          |
| Implementation       | `## Implementierungsdetails`                        | `## Implementation details`                  |
| Approach             | `### Vorgehen`                                      | `### Approach`                               |
| Component structure  | `### Komponentenstruktur`                           | `### Component structure`                    |
| State management     | `### Zustandsverwaltung`                            | `### State management`                       |
| API integration      | `### API-Integration`                               | `### API integration`                        |
| Styling approach     | `### Styling-Ansatz`                                | `### Styling approach`                       |
| Accessibility        | `### Barrierefreiheit`                              | `### Accessibility`                          |
| Edge cases           | `### Randfälle`                                     | `### Edge cases`                             |
| Acceptance criteria  | `## Akzeptanzkriterien`                             | `## Acceptance criteria`                     |
| Validation plan      | `## Validierungsplan`                               | `## Validation plan`                         |
| Assumptions          | `## Annahmen und offene Punkte`                     | `## Assumptions and open points`             |
| Plan review          | `## Plan-Review`                                    | `## Plan review`                             |
| Review result        | `**Ergebnis:** Freigegeben` / `Überarbeitung nötig` | `**Result:** Approved` / `Revision required` |
| Review summary       | `### Zusammenfassung`                               | `### Summary`                                |
| Plan-review findings | `### Befunde`                                       | `### Findings`                               |
| Open points          | `## Offene Punkte`                                  | `## Open points`                             |
| Empty open points    | `- Keine offenen Punkte.`                           | `- No open points.`                          |
| Test results         | `## Testergebnisse`                                 | `## Test results`                            |
| Review findings      | `## Review-Befunde`                                 | `## Review findings`                         |

Tables and finding prose follow the same rule. Plan file tables use `Datei` / `Beschreibung`
and review scorecards use `Bereich` / `Kritisch` / `Wichtig` / `Hinweis` in German; English uses
`File` / `Description` and `Area` / `Critical` / `Important` / `Note`. Review dates, reviewer
labels, summary statuses, and no-findings prose are likewise rendered wholly in the plan
language. Machine-stable values called out below are the only exceptions.

Workflow routing values and skill references remain stable: `Feature`, `Bugfix`, `Refactoring`,
`Documentation`, and the referenced `effective-flow build`/`effective-flow fix`/`effective-flow refactor`/
`effective-flow docs` token are not translated. Doc-category values and target paths likewise remain
`user-guide`, `developer-guide`, `operations`, `runbooks`, and their stable paths.

Rules:

- The status marker must be written exactly as in the four canonical examples above, including bold, colon, and the capitalization of the marker keys and values.
- The plan status only applies when exactly one line with the prefix `**Planungsstatus:**` or `**Plan status:**` is present. Multiple status lines (even in different languages) make the plan status unclear (see below) and should be corrected.
- The only valid value pairs are the four key-value combinations listed above. Mixed forms of a German key and an English value or vice versa (e.g. `**Plan status:** Umgesetzt`) are **not** considered valid.
- Other values such as `Open`/`Done`, `Pending`/`Complete`, or arbitrary free text do not count either.
- Other occurrences of „Nicht umgesetzt“, „Umgesetzt“, "Not implemented", or "Implemented" in review findings, ADR rationales, or body text do not count as a plan status.
- If the marker is missing, occurs multiple times, contains an invalid value, or uses a mixed form of key and value language, the plan status is unclear. In that case, do not automatically treat the plan as open or completed.
- A writer must not combine fields or sections from both columns. A mixed plan is unclear and is
  not automatically rewritten. A requested translation converts the complete plan contract.
- When a workflow sets the status to completed, the complete plan language is preserved: a German marker becomes `**Planungsstatus:** Umgesetzt`, an English marker becomes `**Plan status:** Implemented`.

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
4. **Issue reference** → `issue-reference` (continue with stage B), when the remote helper's
   reference parser accepts the argument as a bare issue number (`123`), `#123`, or a
   host-neutral issue URL for the current repository. Multiple references are parsed as one list
   and classified individually in stage B; malformed or cross-repository references remain
   structured errors instead of heuristic matches.
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
`[R-XXXXXXX] …` together with a helper-parsed `Signature` field (legacy `Signatur` accepted on
read) is treated like `review-finding`. If the subtype remains unclear afterwards → `ambiguous`.

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
  lists local candidates (open plans from `<plan.dir>/`, report files under the absolute
  `<RUNTIME_STATE_ROOT>/.effective-flow/review/` directory) and asks for the specific source. If the effective
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

## Goal-driven completion control

Internal "repeat until done" loops of this workflow follow a uniform goal pattern instead of an ad-hoc formulated loop. The pattern adopts the three principles of the native `/goal` (Codex and Claude Code). At explicit goal gates, the directly following central `goal-start-action` fragment renders the action after an authorized autonomous choice per harness.

### The three principles

1. **Declare the completion condition up front.** Before the implementation work begins, formulate exactly one explicit, measurable completion condition. Derive it from the acceptance criteria and the validation plan of the basis (plan file, diagnosis or agreed scope). A good condition names the target state, the concrete check and the scope boundary – i.e. also what is deliberately not changed.
2. **Verify independently.** Do not check the condition by self-assessment, but via the independent instances anyway provided for it: ``effective-flow-code-validator`` for technical checks and the appropriate reviewer for content ones. The condition counts as fulfilled only once these instances confirm it.
3. **Loop with a bound.** If verification does not confirm the condition, fix the cause and verify again. Bound the internal correction rounds (guideline: three). If the condition still does not hold afterwards, abort the internal loop and escalate to the user instead of running on indefinitely – approach as in the retry escalation of the done protocol.

### Explicit goal query for autonomous runs

At the approval boundary of this workflow – where the completion condition is already fixed and the workflow is waiting for approval anyway – the user gets an **explicit choice** whether the remaining phases continue gated or autonomously under the native `/goal`. This replaces the earlier passive co-emitting of a `/goal` string: the option is actively queried, not merely offered. Workflows with this explicit gate include the central `goal-start-action` fragment directly after this control fragment.

#### When the query is omitted

Skip the goal query entirely (no extra option, no goal-start action and no `/goal` string) when the workflow runs as a **non-interactive sub-agent** of a superordinate orchestrator where no direct user interaction is intended – recognizable from the invocation context, for example "[Context from effective-flow apply-review: …]". `effective-flow apply-review` already steers its autonomous run at its own gate; an additional goal query per sub-delegation would be pointless there. Direct invocations and the handover through `effective-flow apply-plan` (interactive, individual) do **not** count as such delegation – there the goal query is retained.

#### Form of the query

- If the approval boundary is a yes/no approval, extend the approval question with a third option "Autonomous via `/goal`" next to "Yes" (continue gated) and "Adjust".
- If the approval boundary is a selection question (e.g. update groups) or if there is no yes/no approval at this boundary (e.g. because a planning phase was skipped), directly ask a concise standalone follow-up question "Run the remaining phases autonomously under `/goal`?". Depending on the interaction surface, use either yes/no answers or the explicit options "Continue gated" and "Autonomous via `/goal`".
- At the three-option approval gate, only "Autonomous via `/goal`" authorizes the harness-specific goal-start action; "Yes" continues gated and "Adjust" returns to clarification.
- At the standalone follow-up question, "Yes" or "Autonomous via `/goal`" authorizes the harness-specific goal-start action; "No" or "Continue gated" continues gated.
- No other response and no omitted query authorizes the goal-start action. On every gated path, **no** `/goal` string is emitted. The internal approval gates are retained in any case.

Rules for the `/goal` prompt and its objective in every harness path:

- **Self-sustaining:** Reference the underlying plan file, if present, and instruct to run through the remaining phases of this workflow – not "somehow make the criteria green".
- **Measurable:** Name the completion condition with the checks actually provided in the respective workflow (e.g. acceptance criteria fulfilled, project-configured checks green and – if the workflow has a review phase – reviewer without open critical findings) and the scope boundary. Leave out checks that do not apply.
- **Platform-neutral objective:** Restrict yourself to the condition text after `/goal `; that exact text is both the direct Codex `objective` and the objective in every prompt handoff or fallback.
- **Copy-ready presentation:** Whenever a `/goal` prompt is output for the user to paste – including a fallback after a failed direct start – put the fully resolved single-line command as the sole content of a dedicated fenced `text` code block. Keep the cause, explanation and paste prompt outside the fence; do not add a label, comment or other text inside it.
- **Only at gate-free boundaries:** Offer the autonomous run exclusively at approval boundaries after which no further approval gate follows, so an autonomous run does not get stuck at a later gate.

Form (replace placeholders, single line):

```text
/goal Fully implement <plan file or agreed task> and run through the remaining phases of this workflow: all acceptance criteria fulfilled, project-configured checks green<, reviewer without open critical findings – only if the workflow has a review phase>. Change nothing outside the scope. Stop when all criteria hold.
```

## Harness-specific goal-start action

When the explicit goal query in "Goal-driven completion control" authorizes an autonomous run, perform this harness-specific action:

After the user explicitly chooses the autonomous `/goal` option, output the full copy-pasteable `/goal` prompt prominently and ask the user to paste it as a new input. Use only this prompt handoff; without a pasted prompt, the workflow continues gated.

## Project conventions

If the project has an `AGENTS.md`, read it before evaluating the plan and honor its rules for workflow routing, plan files and user follow-up questions.

## Workflow

### Phase 1: Resolve and validate the plan reference

1. Read the user argument.
2. If no argument is present:
   - check `<plan.dir>/` for open plans with status `**Planungsstatus:** Nicht umgesetzt` or `**Plan status:** Not implemented`
   - output a short list of the open plans with number, title and path
   - ask the user for the specific plan file
   - do not start any implementation before a specific file is selected
3. If an argument is present, classify it first via the "apply-source detection". For ``tools/apply-plan.md``, stage A suffices (no tracker I/O needed):
   - source type `plan` → continue with step 4.
   - source type `review-report`, an issue reference (`review-epic` / `review-finding` / `container-issue` / `plain-issue`) or `ambiguous` → this argument does not belong to ``tools/apply-plan.md``. Point to the responsible skill (``tools/apply-review.md`` for review reports and review issues, ``tools/apply-issues.md`` for other issues, or `effective-flow apply` for automatic routing) and end the skill. When ``tools/apply-plan.md`` runs as a delegation from `effective-flow apply`, this case should not occur; the switch remains as a safeguard.
4. For a `plan` argument: use the shared plan-reference rule in routing mode.

Current workflow for plan references: ``tools/apply-plan.md`` routing.

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
3. If no file matches: report the error and note that `effective-flow open-plans` can list open plans.
4. If multiple files match: ask the user for the specific file.

### Check the status

1. Read the plan file fresh from the file system.
2. Determine the implementation status according to the plan status convention: exactly one line with the prefix `**Planungsstatus:**` or `**Plan status:**` and a valid value; if the status line is missing, duplicated, or invalid, the status is unclear.
3. Status rules (both marker languages are equivalent):
   - exactly one status line `**Planungsstatus:** Nicht umgesetzt` or `**Plan status:** Not implemented` → the plan can be used as a basis.
   - exactly one status line `**Planungsstatus:** Umgesetzt` or `**Plan status:** Implemented` → ask the user whether the plan should be implemented again, only checked, or whether the workflow should be aborted.
   - missing or contradictory status → check whether `## Testergebnisse` / `## Test results` or
     `## Review-Befunde` / `## Review findings` are present. If so, treat the plan as probably
     implemented and ask. If not, ask whether the plan should be used as an unbuilt specification.

### Check the workflow recommendation

1. Check whether exactly one canonical line `**Empfohlener Workflow:** ...` or
   `**Recommended workflow:** ...` is present in the header. It must match the language of the
   complete plan; a mixed header makes the language unclear.
2. Determine the recommendation:
   - Feature or `effective-flow build` → `effective-flow build`
   - Bugfix or `effective-flow fix` → `effective-flow fix`
   - Refactoring or `effective-flow refactor` → `effective-flow refactor`
   - Documentation or `effective-flow docs` → `effective-flow docs`
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
- The status update to completed happens only at the completion of the implementing workflow and
  preserves the complete plan language: a German plan becomes
  `**Planungsstatus:** Umgesetzt`, an English plan becomes `**Plan status:** Implemented`.

5. If no target workflow can be unambiguously determined: ask the user for the target workflow and name the four allowed options.
6. Additionally check the plan against the "clarification gate": only a fully clarified plan counts as a basis for implementation. If the plan does not pass the gate, per gate behavior point to `effective-flow plan` or `effective-flow review <planfile>` and end the skill instead of delegating.

### Phase 2: Handoff to the target workflow

1. Give the user a short output:
   - plan file
   - plan status
   - detected target workflow
   - for documentation plans, additionally the doc category and target path from the plan header
2. Since the plan has passed the clarification gate, a fully clarified basis is available: before delegating, offer the goal-driven, autonomous implementation — after an explicit confirmation at this approval boundary per "Explicit goal query for autonomous runs" from `goal-completion.md`. On "Yes", perform the central harness-specific goal-start action with the target workflow's remaining phases and completion condition. On "No", the existing interactive (gated) path remains the alternative.
3. Start the detected skill with the plan file as argument:
   - `effective-flow build <plan.dir>/YYYY-MM-DD-<slug>.md`
   - `effective-flow fix <plan.dir>/YYYY-MM-DD-<slug>.md`
   - `effective-flow refactor <plan.dir>/YYYY-MM-DD-<slug>.md`
   - `effective-flow docs <plan.dir>/YYYY-MM-DD-<slug>.md`
4. Pass as context:
   - that ``tools/apply-plan.md`` has already checked the plan status, the workflow recommendation and the clarification gate
   - the full plan path
   - the detected workflow
   - that the basis is already clarified and, if confirmed, the implementation should run goal-driven
   - for documentation plans, additionally the values found in the matching German
     `**Doku-Kategorie:**` / `**Ziel-Pfad:**` or English `**Doc category:**` /
     `**Target path:**` fields, or the note that one or both lines are missing
5. After that, responsibility for implementation, validation, review, plan status update and commit preparation lies with the target workflow.

## Rules

- Do not modify any implementation files yourself.
- Do not modify the plan file yourself; the status update is done by the target workflow.
- Do not start a build, test, validator or reviewer phase yourself.
- Do not use a heuristic "newest plan" when multiple open plans exist.
- If status or workflow are unclear, ask instead of guessing.
- Output paths relative to the project root.
