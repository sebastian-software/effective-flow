
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

**Load on demand:** Read `shared/runtime-state-safety.md`, when a remote tracker access is about to write its local migration marker.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when a remote tracker access is about to perform its first runtime-state mutation.

**Load on demand:** Read `shared/next-steps.md`, when the run reaches its completion report.

## Effective Flow configuration (project setup ADR)

The tracked truth for the Effective Flow configuration is a living ADR "Effective Flow project
setup" (default slug `effective-flow-project-setup`, see fragment "Living ADR model"). It carries
the config parameters with minimal prose as a **Markdown table**. There is **no**
`.effective-flow/config.json` as a config source anymore; `.effective-flow/` is a private runtime
directory (`memory.json`, `cache.json`, `review/`, `.worktrees/`), completely ignored through
`.gitignore` or, in hidden mode, the Git common directory's `info/exclude`.

### Config locator (resolution order)

When reading the configuration, the project setup ADR is resolved in this order; the
first matching step wins:

0. **Local hidden configuration.** `<RUNTIME_STATE_ROOT>/.effective-flow/project-setup.md` (main
   checkout only, table encoding below) wins only if it declares `visibility | hidden` — **hidden
   mode**, whose forced values the deferred building block enforces; otherwise report it, go on.
   A reader without a verified `RUNTIME_STATE_ROOT` resolves it here first, read-only, from the
   first `git worktree list --porcelain` record (deferred building block); in a Git checkout where
   that fails it stops with a report and never falls through to standard mode. A tracked ADR's
   `visibility | hidden` row is never honoured: report and ignore it.
1. **AGENTS.md marker.** The canonical line `**Effective Flow project setup:** <path>` in
   `AGENTS.md`, otherwise in `CLAUDE.md` or a comparable convention file → read the ADR under
   `<path>`. The legacy spelling `**Firmo project setup:** <path>` is recognized as equivalent on
   read; the spelling stays here because it is the **detection** predicate, while what that
   recognition then triggers belongs to the deferred building block below. If the marker points to a
   path under which **no** ADR lives (dead/stale marker), do not stay there, but fall through in
   this order and report the stale marker (correction in effective-flow setup).
2. **Default path/scan.** Otherwise `docs/adr/effective-flow-project-setup.md` or a scan of the
   detected ADR directory (`docs/adr/`, `docs/decisions/`, `adr/`) for the project setup ADR. A
   file matches that scan when its stem equals `effective-flow-project-setup`, **and** its body
   carries one of the canonical configuration envelopes listed under "Table encoding" below. The
   stem comparison is deliberately tolerant of a legacy slug and a numeric prefix, so this one
   step can match **several** files; that tolerance and the ordered ranking which resolves a
   several-match state belong to the deferred building block below, not to this step.
3. **Transitional compatibility.** Otherwise — only transitionally — the legacy
   `<RUNTIME_STATE_ROOT>/.effective-flow/config.json` (otherwise
   `<RUNTIME_STATE_ROOT>/.firmo/config.json`) read fallback, whose complete contract is the
   deferred building block's.
4. **Built-in defaults.** Otherwise use the defaults of the respective source skills.

The deterministic read path of any tool is non-blocking in that it reads the ADR (or the
transitional fallback) but itself creates no file and mutates no Git; a retired row can still stop
the run (see "Table encoding"). Creating the ADR, the markers, the local hidden configuration and
the migration happen exclusively in effective-flow setup.

**Load on demand:** Read `shared/config-migration-edge-cases.md`, when step 0 must resolve `RUNTIME_STATE_ROOT` itself, the local `.effective-flow/project-setup.md` of step 0 exists or a `visibility` row is present, the locator finds no ADR whose stem is exactly the current slug, its scan matches several files, a legacy setup marker or legacy slug is present, the transitional `.effective-flow/config.json` / `.firmo/config.json` fallback must be read, or a `tracker.mode: external` run resolves `tracker.externalStartedState` or `tracker.externalDoneState`, or a retired row named under "Table encoding" is present.

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
- **`executionProfiles.fast.enabled`** → strict Boolean and fail-closed. A missing row or literal
  `false` is `disabled`; malformed, ambiguous, or unreadable input is `invalid`; both states select
  Quality and stop new measurement without rewriting persisted pilot-generation state. Only the
  literal `true` is `enabled`, and it admits the project to the pilot lifecycle but does not start a
  baseline, activate a generation, prove native Fast capability, or itself permit Fast. The key is
  reserved until an adopting workflow ships, has no legacy migration, names no provider model, and
  is not yet an interactive setup choice.
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
- **`delivery.prReview`** → the literal string `ask`, `always`, or `off`; a missing line resolves to
  `ask` through the rule above. What the value governs is the owning workflow's, not this fragment's.
- **Retired rows** → `worktree.baseBranch`, `worktree.branchPrefix`, `worktree.completion` and a row
  whose key begins with `prReview.` are never read; their presence can stop a run, the one exception
  to the safe-default rule below, under the deferred building block's retired-key contract.
- **`tracker.externalStartedState`** and **`tracker.externalDoneState`** → nullable state IDs read
  only by a `tracker.mode: external` run; their per-key notes are the deferred building block's.

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

If the table is invalid or ambiguous (missing key, unknown encoding): use a safe default for the
run, inform the user about the affected key, do **not** guess.

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

This shared fragment connects `effective-flow review` and ``tools/apply-review.md`` with an issue tracker. Its own mechanics describe the **forge** target: the issue tracker of the Git forge behind the `origin` remote (GitHub via `gh`, Forgejo via `tea`). A project may instead resolve the `external` target, whose contract is named under "Tracker target" below. Publication is **opt-in** via the Effective Flow configuration (project setup ADR) and disabled by default (`local`). On the `local` target both skills behave unchanged – findings run through the Markdown report file under `.effective-flow/review/`, no issues are created and no CLI is invoked. On a publishing target a local report is written only for findings withheld by the "Security disclosure gate" in `issue-tracker-forge.md`.

The tracker target (`tracker.mode`) affects exclusively **reviews**. **Investigations** (`effective-flow investigate`) are exempt from it and remain purely local on every target under `.effective-flow/investigation/` (never committed, never as an issue). Of the Effective Flow artifacts, only **plans** are committed.

It encapsulates the **shared** building blocks: this core carries the `tracker` config schema including migration, the mode determination, and the tracker-target handoff, and the sibling fragment "Issue-tracker forge mechanics" (`issue-tracker-forge.md`) carries the provider-neutral remote-helper contract, the label convention, the security disclosure gate, the remote prose language, and the canonical issue and epic body formats. Every source that reaches the forge target loads that sibling as well, eagerly or through its own deferred pointer. The actual orchestration – when issues are **created** (`effective-flow review`) and when they are **read and processed** (``tools/apply-review.md``) – stays in the respective skill.

In addition, ``tools/apply-issues.md`` and `effective-flow plan-issue` use this fragment for the same provider-neutral helper operations. These two skills process **arbitrary** human issues instead of the finding issues produced by `effective-flow review`; they are **inherently tracker-bound** and do **not** evaluate the local/remote toggle – they resolve the tracker target (see "Tracker target") and work against it. On the forge target they only need a Git repository, an `origin` remote and an authenticated CLI. The finding-/epic-specific sections of `issue-tracker-forge.md` (issue body format, epic body format, `R-XXXXXXX` convention) apply only to `effective-flow review`/``tools/apply-review.md``; the checkbox-ticking mechanics for epic bodies are used by ``tools/apply-issues.md`` analogously for container issues.

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

`remoteToolOverride` is intended only for ambiguous hosts (e.g. self-hosted GitHub Enterprise whose domain does not contain `github.com`). With `auto` the host detection of the "Remote helper contract" in `issue-tracker-forge.md` decides. It names a **forge** CLI and stays forge-only.

### Config migration

Reading the Effective Flow configuration from the project setup ADR (including the `tracker` keys) and the one-time migration of a legacy config is handled centrally by the fragment "Config migration" (`config-migration.md`); this fragment performs no own per-block migration for `tracker` anymore. The `tracker` config schema above (configuration, valid values, mode determination, first-invocation query) remains unaffected by this.

### Determine mode

At the start of the run, determine the effective mode in this order (the first matching rule wins):

1. **Argument type:** The passed argument type overrides the config mode for this run. A report file (`*.md` under `.effective-flow/review/`) forces `local`; a forge issue reference (issue number, `#123` or a forge issue URL) forces `remote`; a tool-native identifier or URL of the configured external tool forces `external`. In hidden mode (config locator step 0) no argument overrides the forced `local` target: an issue reference stops the run instead.
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

The determined mode names the **target** that owns issue identity for this run: `local` (Markdown report), `forge` (`remote` — the issue tracker of the `origin` remote), or `external` (the tool named by `tracker.externalTool`). Everything in the sibling fragment `issue-tracker-forge.md` — the helper contract, the label convention with its `firmo-` compatibility and one-time `sf-` migration, the tracker operations, and the finding and epic body formats — describes the **forge** target.

`external` requires a non-empty `tracker.externalTool`. Without it the configuration is invalid: abort before any tracker access, name the missing key, and point to `effective-flow setup`. Never guess a tool, and never fall back to the forge or to `local`. While the mode is `local` or `remote`, `tracker.externalTool` and `tracker.externalToolHint` are ignored for routing and reported once as ignored. Both issue-carrying flows follow the resolved target: the issue-driven flow (``tools/apply-issues.md``, `effective-flow plan-issue`) and review publication.

The complete external contract — connection discovery with its fail-closed rules, the required capabilities, the write discipline, the classification mapping, the container mechanism, and the reference syntax — lives in the `tracker-target` fragment. Every source that embeds this fragment **must** carry its own deferred pointer to `tracker-target`, so a run loads that contract as soon as the resolved target is `external` and never for a `local` or `forge` run. A run that resolves `external` without that contract available aborts instead of improvising.

**Load on demand:** Read `shared/issue-tracker-forge.md`, when the resolved tracker target is the forge and stage B classification or the review-epic listing is about to make its first forge read.

**Load on demand:** Read `shared/tracker-target.md`, when the resolved tracker target is `external`.

**Load on demand:** Read `shared/session-title.md`, when the run's subject is fixed and whether a session title is due must be decided.

**Load on demand:** Read `shared/session-rename.md`, when the run's subject is fixed and a session title is about to be applied or emitted.

## Workflow

### Phase 1: Classify the source

1. Read the user argument.
   **Hidden mode stops issue-driven apply.** When the configuration resolves `visibility: hidden`
   (config locator step 0) and stage A classifies the argument as an issue reference, stop before
   stage B and any tracker access or write — no probe, label migration, or classification — with
   one message: hidden mode is active, it pins the tracker to `local`, and issue-driven apply works
   only against a forge or external tracker. Plans and local report files stay available.
2. Apply the "apply-source detection": stage A (syntactic) and — for an
   issue reference — stage B (tracker). Stage B needs the resolved tracker target from
   "Tracker target": on the forge target the host/CLI detection and availability check from
   "Remote helper contract" in the loaded "Issue-tracker forge mechanics" apply, and on an external
   target the connection discovery of the loaded `tracker-target` contract. If the CLI, the
   authentication, or a usable external connection is missing, abort with a clear message (no
   silent fallback).
3. Handle the special results:
   - **`none` (no argument):** list local candidates — open plans from
     `<plan.dir>/` (status `**Planungsstatus:** Nicht umgesetzt` or
     `**Plan status:** Not implemented`) and report files under the verified absolute
     `<RUNTIME_STATE_ROOT>/.effective-flow/review/` directory.
     If the resolved tracker target is the forge or an external tool (see “Issue-tracker
     integration (remote mode)”), additionally list direct findings with
     `effective-flow-review-finding`: open findings without a closure receipt, plus closure-marked
     findings across tracker states long enough to parse and compare the helper-owned receipt's gate
     version, normalized signature, evidence digest, and reachability anchor/digest. Suppress a
     still-current receipt; list a stale one so `apply-review` re-enters admission even if the issue
     is terminal. Also list legacy review epics (`effective-flow-review-epic`, on the forge including
     `firmo-review-epic`). Exclude every child of a listed legacy epic from the direct-finding list
     so no candidate appears twice.
     Then ask the user for the specific source. Do not pick heuristically.
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
