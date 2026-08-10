
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

**Load on demand:** Read `shared/runtime-state-safety.md`, when a remote tracker access is about to write its local migration marker, or a session rename request is about to be written.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when a remote tracker access is about to perform its first runtime-state mutation, or a session rename request is about to be written.

**Load on demand:** Read `shared/next-steps.md`, when the run reaches its completion report.

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
- **`delivery.prReview`** → the literal string `ask` (default), `always`, or `off`; it governs the
  automatic PR review publication after a delivery. No `delivery.prReview` line → default `ask`,
  per the rule above.

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

### Merge-gate keys (`mergeGate.*`) and their legacy namespace

effective-flow merge-gate reads the keys below; effective-flow iterate reads the `bots` entries for its
review-in-flight guard. A missing line means the default, per the encoding rule above.

| Key                              | Values                             | Default   |
| -------------------------------- | ---------------------------------- | --------- |
| `mergeGate.completion`           | `ask`, `merge`, `report`           | `ask`     |
| `mergeGate.requireAllChecks`     | `true`, `false`                    | `true`    |
| `mergeGate.checkWaitMinutes`     | positive integer                   | `20`      |
| `mergeGate.maxRounds`            | positive integer                   | `3`       |
| `mergeGate.botWaitMinutes`       | positive integer                   | `10`      |
| `mergeGate.bots`                 | comma list of logins               | `(empty)` |
| `mergeGate.bots.<login>.trigger` | literal trigger comment text       | unset     |
| `mergeGate.bots.<login>.check`   | commit-status or check-run context | unset     |

A login containing brackets (`greptileai[bot]`) is a valid middle segment, because the encoding
splits on `.` only.

**Backcompat (one generation):** these keys were formerly named `prReview.*`. Where a
`mergeGate.<key>` line is absent, read `prReview.<key>` and use its value; report **once per run**
that the legacy namespace was read and that effective-flow setup migrates it. Precedence is per key: a
present `mergeGate.<key>` always wins over a present `prReview.<key>`, and the two namespaces are
never merged at a finer grain than the individual key. Reading is all this fallback does — only
effective-flow setup writes configuration, and it rewrites a legacy block in place (carry the values
over, remove the old rows, report a shadowed key). Once every project has run effective-flow setup once,
the fallback has no remaining reader and is removable rather than load-bearing.

**`delivery.prReview` is not part of this block** and is never migrated: it decides whether a run
publishes **its own review findings** onto a pull request it created (see the encoding rule above),
while `mergeGate.*` configures the gate that takes an **existing** pull request from open to merged.

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

## Project conventions

If the project has an `AGENTS.md`, read it before classification and honor its rules
for routing and user follow-up questions.

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
access — the host/CLI detection and availability check of the "Remote helper contract" on the forge
target, or the single established connection of the `tracker-target` contract on an external
target; a skill that uses stage B therefore also embeds `issue-tracker.md`.
``tools/apply-plan.md`` does not need stage B — for a plan skill, stage A is enough
to recognize an issue reference as a foreign type and forward it.

Per issue, read classification values and body **once fresh** from the tracker and determine the
subtype in this precedence — **classification before body structure**:

1. Label `effective-flow-review-epic` (or old `firmo-review-epic`) → `review-epic`.
2. Label `effective-flow-review-finding` (or old `firmo-review-finding`) → `review-finding`.
3. no review label, but the body contains a sub-issue checklist
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
`issue-tracker.md`) is the reliable discriminator and takes precedence over the
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
  tracker target is the forge or an external tool, it additionally lists open review epics (label
  `effective-flow-review-epic`, incl. old `firmo-review-epic`, or the target's equivalent
  container) as candidates, since on those targets no local report files exist.
- **`ambiguous`:** name the competing interpretations and ask, instead of
  guessing.
- **Mixed issue list** (different subtypes in one call, e.g. `review-finding`
  and `plain-issue`): do not guess. Ask the user to split the list by target type,
  or — in the router — route per issue. Conservative: ask. A list that mixes a forge reference
  with an external-target reference is never resolved heuristically either: ask the user to split
  the call by tracker target.
- **Issue reference, but the target is unreachable** (forge CLI missing or not authenticated, or
  no usable external connection): stage B cannot run → clear error message with a remediation hint
  per "Errors and edge cases" in `issue-tracker.md`; no silent fallback to a local type and none to
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

## Issue-tracker integration (remote mode)

This shared fragment connects `effective-flow review` and ``tools/apply-review.md`` with an issue tracker. Its own mechanics describe the **forge** target: the issue tracker of the Git forge behind the `origin` remote (GitHub via `gh`, Forgejo via `tea`). A project may instead resolve the `external` target, whose contract is named under "Tracker target" below. Publication is **opt-in** via the Effective Flow configuration (project setup ADR) and disabled by default (`local`). On the `local` target both skills behave unchanged – findings run through the Markdown report file under `.effective-flow/review/`, no issues are created and no CLI is invoked. On a publishing target a local report is written only for findings withheld by the "Security disclosure gate" below.

The tracker target (`tracker.mode`) affects exclusively **reviews**. **Investigations** (`effective-flow investigate`) are exempt from it and remain purely local on every target under `.effective-flow/investigation/` (never committed, never as an issue). Of the Effective Flow artifacts, only **plans** are committed.

It encapsulates the **shared** building blocks: the `tracker` config schema including migration, the mode determination, the provider-neutral remote-helper contract, the label convention, and the canonical issue and epic body formats. The actual orchestration – when issues are **created** (`effective-flow review`) and when they are **read and processed** (``tools/apply-review.md``) – stays in the respective skill.

In addition, ``tools/apply-issues.md`` and `effective-flow plan-issue` use this fragment for the same provider-neutral helper operations. These two skills process **arbitrary** human issues instead of the finding issues produced by `effective-flow review`; they are **inherently tracker-bound** and do **not** evaluate the local/remote toggle – they resolve the tracker target (see "Tracker target") and work against it. On the forge target they only need a Git repository, an `origin` remote and an authenticated CLI. The finding-/epic-specific sections (issue body format, epic body format, `R-XXXXXXX` convention) apply only to `effective-flow review`/``tools/apply-review.md``; the checkbox-ticking mechanics for epic bodies are used by ``tools/apply-issues.md`` analogously for container issues.

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

`remoteToolOverride` is intended only for ambiguous hosts (e.g. self-hosted GitHub Enterprise whose domain does not contain `github.com`). With `auto` the host detection below decides. It names a **forge** CLI and stays forge-only.

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

The determined mode names the **target** that owns issue identity for this run: `local` (Markdown report), `forge` (`remote` — the issue tracker of the `origin` remote), or `external` (the tool named by `tracker.externalTool`). Everything below in this fragment — the helper contract, the label convention with its `firmo-` compatibility and one-time `sf-` migration, the tracker operations, and the finding and epic body formats — describes the **forge** target.

`external` requires a non-empty `tracker.externalTool`. Without it the configuration is invalid: abort before any tracker access, name the missing key, and point to `effective-flow setup`. Never guess a tool, and never fall back to the forge or to `local`. While the mode is `local` or `remote`, `tracker.externalTool` and `tracker.externalToolHint` are ignored for routing and reported once as ignored. Both issue-carrying flows follow the resolved target: the issue-driven flow (``tools/apply-issues.md``, `effective-flow plan-issue`) and review publication.

The complete external contract — connection discovery with its fail-closed rules, the required capabilities, the write discipline, the classification mapping, the container mechanism, and the reference syntax — lives in the `tracker-target` fragment. Every source that embeds this fragment **must** carry its own deferred pointer to `tracker-target`, so a run loads that contract as soon as the resolved target is `external` and never for a `local` or `forge` run. A run that resolves `external` without that contract available aborts instead of improvising.

### Remote helper contract (remote mode only)

All deterministic remote mechanics of the forge target run through the shipped helper:

```text
node <skill-root>/scripts/remote-tracker.mjs <operation> [--apply]
```

Pass exactly one JSON object through standard input and parse exactly one JSON result envelope from standard output. Resolve `<skill-root>` from the currently loaded Effective Flow skill; never copy the helper into the target project. The helper owns origin/provider/reference parsing, `gh`/`tea` probing, capability normalization, command construction, JSON normalization, payload validation, compatibility aliases, exact body patching, redaction, and stale-write preconditions. It never opens a shell and never prompts.

Pass the verified absolute `RUNTIME_STATE_ROOT` as the top-level `cwd`. The helper runs `git`, `gh`
and `tea` in that directory, and every provider CLI resolves its repository context from it. The
runtime root is the one checkout guaranteed to exist for the whole run, whereas an execution
worktree may already have been withdrawn by the time a completion action runs. The field is
optional for compatibility — when it is absent the helper inherits the process working directory —
but an Effective Flow workflow always sets it. A `cwd` that is not an existing directory fails with
a structured error naming the path, never as a missing-CLI error.

For `finding-build` and `epic-build`, pass the already-resolved `language.forge` as the top-level
`language: en|de`; this applies equally when the finding or epic data is nested under its named
key. The optional field defaults to `en`, and unsupported values are rejected. The helper returns
the same language-stable payload keys in either language.

Successful envelopes contain `ok`, `operation`, `provider`, `data`, and `dryRun`. Failed envelopes additionally contain `error.code`, `error.message`, redacted `error.details`, and `error.retryable`, and the process exits nonzero. Treat errors as workflow input; do not discover flags, assemble API requests, read CLI credentials, or invent a fallback. In particular:

- `AMBIGUOUS_HOST`: obtain an explicit `github`/`forgejo` choice from configuration or the user, then retry with that override.
- `CLI_MISSING`/`AUTH_FAILED`: abort without side effects; offer local mode only with explicit user consent.
- `UNSUPPORTED_CAPABILITY`: report the unsupported provider capability and preserve the surrounding workflow state.
- `STALE_WRITE`: abort that write without retrying, merging, or overwriting; re-enter the workflow from a fresh read.
- all other structured errors: preserve scope and let the owning workflow decide whether a retry is safe.

Reads execute immediately. Mutations are dry runs by default: inspect the returned executable, argument vector, and redacted input preview, obtain every workflow-specific approval that still applies, and only then repeat the same operation with `--apply`. A dry run never changes Git, tracker state, memory, labels, issues, pull requests, comments, or review threads.

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
| `effective-flow-needs-planning`                                                                | skipped by ``tools/apply-issues.md``; planning via `effective-flow plan-issue` needed   |

`wontfix` already exists on many trackers; create it only if it is missing. `effective-flow-issue-done` and `effective-flow-needs-planning` belong to the issue-driven flow (``tools/apply-issues.md``/`effective-flow plan-issue`) and are created idempotently there.

**Backward compatibility (severity labels):** The English severity labels `critical`/`important`/`note` are the default; newly created or set is exclusively the English label. The former German labels `kritisch`/`wichtig`/`hinweis` are **not** upgraded but stay **recognized** permanently when reading, listing, deduplicating and detecting a finding's severity — run a severity query per language variant (once `critical`/`important`/`note`, once `kritisch`/`wichtig`/`hinweis`) and union by issue number, analogous to the `firmo-`/`effective-flow-` prefix rule above.

**Backward compatibility (legacy prefix `firmo-`):** Earlier versions used the prefix `firmo-` instead of `effective-flow-` (`firmo-review-finding`, `firmo-review-epic`, `firmo-fix`/`firmo-refactor`/`firmo-build`/`firmo-docs`, `firmo-issue-done`, `firmo-needs-planning`). Newly **created or set** is exclusively the `effective-flow-` label; an upgrade of existing `firmo-` labels is **not** needed. When **reading, listing, deduplicating and detecting**, every `firmo-` variant counts permanently as equivalent to the associated `effective-flow-` variant:

- **Listing/filtering** (dedup, epic/issue search): `gh`/`tea` combine multiple `--label` specifications with AND semantics. Therefore run the query **separately per prefix** (once `effective-flow-…`, once `firmo-…`) and union the matches by the issue number.
- **Removing a status label** (`effective-flow-needs-planning`, `effective-flow-issue-done`): additionally remove the legacy `firmo-` variant, if present, so an issue does not stay "stuck" through a leftover legacy label.

**One-time `sf-` label migration:** The even older prefix `sf-` (`sf-review-finding`, `sf-review-epic`, `sf-fix`/`sf-refactor`/`sf-build`/`sf-docs`, `sf-issue-done`, `sf-needs-planning`) is **no longer** detected continuously, but **migrated once per repo**. On the **first** remote tracker access — provided the marker `labelMigration.sf.done` in the retained absolute `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle is missing and an authenticated CLI is present — an idempotent migration moves every still-present `sf-<x>` label to `effective-flow-<x>`: first add `effective-flow-<x>` on the issue, then remove `sf-<x>` (not the other way around, so an abort leaves no issue unclassified). If the runtime directory is missing, apply the owning workflow's loaded “Runtime-state write safety” contract from `RUNTIME_STATE_ROOT` to that exact directory immediately before its `mkdir`. After the remote migration, use the loaded shared memory mutation contract against the retained absolute memory handle: acquire its lock, re-read memory, merge only `labelMigration.sf`, and atomically persist `done` plus the completion timestamp while preserving every sibling and unknown field. If this marker mutation blocks or fails, preserve local state, report that the remote labels may already have migrated, and direct the user to `effective-flow setup`; the next run may repeat the idempotent remote migration. If the migration finds no `sf-` labels, it is a silent no-op. If the marker is set, any further scan is skipped — ongoing operations know only `effective-flow-` and `firmo-`. `sf-` is referenced exclusively in this migration.

### Security disclosure gate

A finding classified as security relevant is **never** written to a tracker without an explicit
per-run confirmation by the user. This gate binds every publisher of review findings and
overrides `tracker.mode` as well as every other configuration value; there is no configuration key
that switches it off. Publication to a third-party tracker is a disclosure with the same
consequences as publication to a public forge, so the gate binds a forge target and an external
target alike. The producing workflow owns the classification and the confirmation
(see `effective-flow review`, Phase 3 and Phase 4).

Rules for every publisher, on whichever tracker target the run resolved:

- **Local first:** the withheld findings are persisted in a local report below
  `.effective-flow/review/` before any tracker mutation. That report is the authoritative record
  for them; it stays in the gitignored runtime state of the main checkout and is never committed.
- **Confirmation before publication:** publication happens only after an explicit user decision in
  that run, taken with knowledge of the disclosure consequence. Keeping them local is the default;
  an unanswered, skipped, or non-interactive run publishes nothing from the withheld set.
- **Silence in public artifacts:** epic bodies, issue bodies, and comments contain no count, title,
  signature, ID, or other reference to a withheld finding. A public hint that unfixed security
  findings exist is itself an exploitable signal.
- **Conservative classification:** an uncertain or missing security assessment counts as security
  relevant and stays local.
- **Scope:** the gate covers the publication of review findings. It does not sanitize branch names,
  commit subjects, or pull request bodies of a later fix; that disclosure decision belongs to the
  delivering workflow and its user.

The gate governs only the destination of a finding. It never removes a finding, changes its
severity, or narrows the active finding scope.

### No AI attribution in issue bodies and comments

Do not add AI attribution to issue bodies, epic bodies and comments: no "Generated with Claude Code/Codex" footers, no agent session links (e.g. `https://claude.ai/code/…`) and no `Co-Authored-By` trailers – not even when the harness appends them as a default. Factual mentions of Claude Code or Codex as the target harness are allowed, generation attribution is not. This binds every publisher on every tracker target, the forge and an external tool alike.

### Remote prose language

Resolve `language.forge` once per remote run and pass it to all issue/comment writers. Preserve
the clear language of an existing issue or thread when editing/replying; otherwise use the
resolved Forge language. Finding and epic bodies use one complete language for human-readable
titles, headings, field labels, displayed severity/complexity values, and prose.

The German display mapping is `Schweregrad`, `Komplexität`, `Bereich`, `Datei`, `Problem`,
`Empfehlung`, `Prompt-Vorschlag`, `Sicherheit`, `Befunde`, and
`Übersprungen (Architekturentscheidungen)`. English uses the template labels below. The exposure
values `external`, `internal`, and `none` of the `Security`/`Sicherheit` field are machine tokens
and stay unlocalized in both forms. `Action`,
`Epic`, and `Signature` are stable helper/dedup fields and remain canonical English in both
forms, as do their action values. Displayed severities map to
`Kritisch`/`Wichtig`/`Hinweis`, and displayed complexities map to
`Niedrig`/`Mittel`/`Hoch`; their helper input enums remain
`Critical`/`Important`/`Note` and `Low`/`Medium`/`High`. Labels, issue numbers, `R-XXXXXXX` IDs, HTML markers, body
hashes, checklist syntax, and helper payload keys are never localized. Readers accept both
German and English historical display fields, including legacy `Signatur`, but canonical writes
use `Signature`.

### Issue body format (finding issue)

A finding issue must be **self-contained**: a foreign LLM session must be able to process it without access to the producing session. It contains the same content fields as a finding block of the local report format (see the shared `review-report-format` fragment).

- **Title:** `[R-XXXXXXX] <short title in language.forge>`
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

A finding published through the "Security disclosure gate" keeps its `Security`/`Sicherheit` field
in the issue body, so the accepted disclosure stays visible; an ordinary finding omits that field
instead of carrying an empty `none`.

The **Signature** field fixes the content dedup key (file+line, area, problem). It is deliberately **not** the `R-XXXXXXX` ID, because that is assigned freshly per run. Canonical writes use `Signature`; helper reads and deduplication also accept the legacy field name `Signatur` and normalize both forms to the same identity.

### Epic body format (tracking issue)

- **Title:** `Code review YYYY-MM-DD[-N]` for English or
  `Code-Review YYYY-MM-DD[-N]` for German
- **Labels:** `effective-flow-review-epic`
- **Body** (canonical template):

```markdown
Code review of YYYY-MM-DD · Scope: [Entire code / Described area] · Project type: [...]

## Findings

- [ ] #<nr> [R-0000001] <short title> — Action: effective-flow-fix
- [ ] #<nr> [R-0000002] <short title> — Action: effective-flow-refactor

## Skipped (design decisions)

- <short title> — Signature: [normalized signature] — covered by [decision reference] ([Source])
```

Rules for the task list:

- Each entry under `## Findings` references exactly one finding issue via its number and carries the `R-XXXXXXX` ID as well as the action.
- The section `## Skipped (design decisions)` uses **no** checkboxes and lists only findings filtered out by design decisions. A skipped entry is identified by title, normalized signature, and decision reference; it carries no issue number and no `R-XXXXXXX` ID, and it never advances `lastFindingNumber`. The section is omitted when no such findings are present.
- Ticking off delegates the exact checklist patch to the helper, using the body hash from the preceding fresh read. It may append the PR link; a finding deliberately not implemented is marked with its decision reference.

### Tracker operations

Describe tracker access only as a helper operation: issue/PR read and list, issue/PR create,
comment read/create/update, label create/change, PR review-thread read/reply/resolve,
marker/checklist patch, or PR creation. Use the helper's normalized output rather than
provider-specific fields. For list operations, request the compatibility variants and let the
helper union matches by issue number before signature deduplication.

The targeted issue-comment update operation is `issue-comment-update`. Its input contains the
issue number, the positive `commentId` returned by `issue-comments-read`, the freshly computed
`expectedBodyHash` of that exact comment body, and `payload.body`. It is a mutation and therefore
uses the normal dry-run-first envelope. On apply, the helper reads the issue comments again,
requires exactly one matching comment ID, and compares its body hash before writing. A missing,
ambiguous, or changed comment fails with `TARGET_NOT_FOUND`, `AMBIGUOUS_TARGET`, or `STALE_WRITE`;
the caller must not fall back to `issue-comment` and create a competing comment.

Provider mapping for `issue-comment-update` is fixed and owned by the helper:

- GitHub: `PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}`.
- Forgejo: `PATCH /repos/{owner}/{repo}/issues/{index}/comments/{id}`; Forgejo currently ignores
  `index`, but the adapter still supplies the freshly resolved issue number.

Both send a JSON object with the validated, attribution-free `body`. If probing reports that the
provider or installed CLI cannot execute this API operation, abort with `UNSUPPORTED_CAPABILITY`
before a write; never append a replacement planning comment.

Body writes, including `issue-comment-update`, require `expectedBodyHash` from the immediately
preceding fresh read. Preview the exact patch and command in dry-run mode, then apply with the same
payload. Zero or multiple semantic matches are structured errors; unchanged state is successful
and idempotent. The helper exposes whether provider-level conditional writes are available; the
expected-body precondition is mandatory regardless. GitHub returns the read ETag for diagnostics
but documents unsafe-method conditional requests as unsupported for these endpoints, so the
adapter reports the write as non-atomic instead of sending a misleading `If-Match` header.

Legacy-label transitions use the helper's add and remove operations in that order. The one-time `sf-` migration returns its completion marker only after every step succeeds; a partial failure reports completed steps and keeps the marker pending. Cleanup of recognized `firmo-` aliases uses the same add-before-remove operations without changing that one-time marker contract.

### Error and edge cases

- **Missing/unauthenticated CLI:** abort clearly, give a remediation hint, leave no partial state; no silent fallback to `local`.
- **No Git repository / no `origin` remote:** remote mode not possible; report.
- **Ambiguous host:** use `remoteToolOverride` or a per-run hint; if both are unclear, ask the user.
- **Argument type contradicts `tracker.mode`:** The argument type overrides the config mode for this run (see "Determine mode").
- **External target:** connection discovery, its four fail-closed failure classes (missing tool identifier, no connection, ambiguous connection, missing capability) and the write discipline live in the loaded "Tracker target" fragment. There is no fallback to the forge or to `local`.

**Load on demand:** Read `shared/tracker-target.md`, when the resolved tracker target is `external`.

**Load on demand:** Read `shared/session-rename.md`, when the run's subject is fixed and a session title is about to be applied or emitted.

## Workflow

### Phase 1: Classify the source

1. Read the user argument.
2. Apply the "apply-source detection": stage A (syntactic) and — for an
   issue reference — stage B (tracker). Stage B needs the resolved tracker target from
   "Tracker target": on the forge target the host/CLI detection and availability check from
   "Remote helper contract" in "Issue-tracker integration (remote mode)" apply, and on an external
   target the connection discovery of the loaded `tracker-target` contract. If the CLI, the
   authentication, or a usable external connection is missing, abort with a clear message (no
   silent fallback).
3. Handle the special results:
   - **`none` (no argument):** list local candidates — open plans from
     `<plan.dir>/` (status `**Planungsstatus:** Nicht umgesetzt` or
     `**Plan status:** Not implemented`) and report files under the verified absolute
     `<RUNTIME_STATE_ROOT>/.effective-flow/review/` directory.
     If the resolved tracker target is the forge or an external tool (see "Issue-tracker
     integration (remote mode)"), additionally list open review epics (label
     `effective-flow-review-epic`, on the forge including legacy `firmo-review-epic`, or the
     target's equivalent container) as candidates — on those targets no local report files are
     written, so otherwise no source would be offered. Then ask the user for the specific source.
     Do not pick anything heuristically.
   - **`ambiguous`:** name the competing interpretations and ask.
   - **Mixed issue list:** if the passed issue references lead to different
     responsibilities (e.g. `review-finding` **and** `plain-issue`), ask the user to
     split the list by target type; do not route halfway. If all references lead to the
     same target skill, continue normally. A list that mixes a forge reference with an
     external-target reference is likewise split by the user, never resolved heuristically.

### Phase 2: Delegate to the responsible skill

1. Give the user a short output:
   - detected source type
   - resolved handle (plan path, report path or issue reference(s))
   - the resolved tracker target and, for `external`, the tool identifier
   - responsible target skill (for ``tools/apply-review.md`` additionally the mode:
     local report, remote epic or remote issue list)
2. Start the responsible skill with the original argument:
   - `plan` → ``tools/apply-plan.md` <arg>`
   - `review-report` / `review-epic` / `review-finding` → ``tools/apply-review.md` <arg>`
   - `container-issue` / `plain-issue` → ``tools/apply-issues.md` <arg>`
3. Pass as context that `effective-flow apply` has already classified the source, including
   the detected source type and the resolved tracker target. After that, the entire
   responsibility lies with the target skill.
4. Every one of those three delegations carries the literal line `Next steps: suppressed` on its
   own line: the target skill emits no block of its own, and this run closes the report if control
   returns here.
5. The target skill checks the basis itself against the "clarification gate" before it
   implements. `effective-flow apply` itself does not run this check and implements
   nothing.
6. When control returns here, emit the next-step block per `next-steps` as the last element of the
   report, taking the row for the end state the delegation reported — the failed plan clarity gate,
   the applied findings, or the processed issues, each with or without a pull request.

## Rules

- Do not modify any implementation, plan, report or tracker files yourself.
- Classify via the shared "apply-source detection"; do not introduce your own
  divergent detection logic.
- Do not start a build, test, validator or reviewer phase yourself.
- Do not use a heuristic "newest source" when multiple candidates exist.
- If the source type is unclear or ambiguous, ask instead of guessing.
- Output paths relative to the project root.
