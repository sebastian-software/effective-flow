# Configuration

Effective Flow works without project configuration: every tool starts from its own safe defaults.
To keep project-specific choices in Git, use one living **Effective Flow project-setup ADR**. The
default path is `docs/adr/effective-flow-project-setup.md`; a marker in the project convention
file can select another path.

This page is the complete reference for the ADR location, table encoding, configuration keys,
defaults, and migration behavior. The guides [Worktree and delivery](./worktree-and-delivery.md),
[Remote tracker](./remote-tracker.md), and [Skill discovery](./skill-discovery.md) explain how the
corresponding settings affect everyday use.

## Project-setup ADR

The configuration is a mutable, numberless Markdown ADR whose current contents are the tracked
truth. A new ADR uses the configured technical-documentation language. This English example and
the equivalent German envelope use the same stable keys and encoded values:

```md
# Effective Flow project setup

## Status

Active

## Context

This ADR holds this project's tracked Effective Flow configuration. `.effective-flow/` is a pure
runtime directory and completely gitignored.

## Configuration

| Key              | Value   |
| ---------------- | ------- |
| review.profile   | focused |
| worktree.enabled | true    |
| tracker.mode     | local   |
| skills.exclude   | (empty) |
```

The same configuration in a German envelope starts like this:

```md
# Effective-Flow-Projektsetup

## Status

Aktiv

## Kontext

Diese ADR enthält die versionierte Effective-Flow-Konfiguration dieses Projekts.

## Konfiguration

| Schlüssel        | Wert    |
| ---------------- | ------- |
| review.profile   | focused |
| worktree.enabled | true    |
| tracker.mode     | local   |
| skills.exclude   | (empty) |
```

The file name is a kebab-case slug without a number. Effective Flow updates the ADR in place when
the configuration changes; it does not create a superseding record for each edit.

The canonical locator line is:

```md
**Effective Flow project setup:** docs/adr/effective-flow-project-setup.md
```

[`/effective-flow setup`](./tools-setup.md) writes or updates both the ADR and this marker. A
person may also edit the table directly, but ordinary tools that read configuration never create
files, rewrite the ADR, or touch Git.

## Resolution order

Every config-reading tool uses the following order and stops at the first valid source:

1. **Convention-file marker.** Read `**Effective Flow project setup:** <path>` from `AGENTS.md`,
   otherwise `CLAUDE.md` or a comparable convention file. The former
   `**Firmo project setup:** <path>` spelling remains readable for one compatibility generation.
   A marker whose target no longer exists is reported and does not block the later fallbacks.
2. **Default path and ADR scan.** Try `docs/adr/effective-flow-project-setup.md`, then scan the
   detected ADR directory (`docs/adr/`, `docs/decisions/`, or `adr/`) for the project-setup ADR.
   The former `firmo-project-setup` slug remains readable during this scan.
3. **Transitional legacy input.** If no ADR exists, read a still-present legacy JSON config
   without writing anything, and direct the user to `/effective-flow setup`. See
   [Migrating a legacy JSON configuration](#migrating-a-legacy-json-configuration).
4. **Built-in defaults.** If no project source exists, each tool uses its documented defaults.

If a table is invalid or ambiguous, the tool uses a safe default for the affected key, reports
the problem, and does not guess or rewrite the source.

## Table encoding

The `## Configuration` section uses a flat, two-column Markdown table with the canonical header
`| Key | Value |`. One row represents one setting:

- **Boolean:** `true` or `false`.
- **String:** literal and unquoted, for example `focused` or `origin/main`.
- **Ask at run time:** the literal token `null`.
- **Empty list:** `(empty)`.
- **Filled list:** comma-separated names, for example `humanizer, distill`.
- **Nested setting:** a dotted key, for example `applyReview.worktree.baseDir` or
  `skills.tools.docs.exclude`.
- **Empty object:** no rows for that object.

A missing row and an explicit `null` have different meanings. A missing row leaves the key unset,
so the source tool's default applies. A present row whose value is `null` explicitly means “ask at
run time” for keys that accept it.

The bootstrap reader accepts both canonical envelopes: English `## Configuration`,
`| Key | Value |`, `Active`, and `Superseded`; and German `## Konfiguration`,
`| Schlüssel | Wert |`, `Aktiv`, and `Abgelöst`. Config keys and encoded values—including
`(empty)`—remain identical and English in either form. The former translated token `(leer)`
remains readable only for backward compatibility. Setup creates a new ADR in
`language.documentation.technical`; a normal update preserves an existing ADR's envelope and
prose language rather than translating it as a side effect.

## Complete table example

The following example shows every configuration area and all current setting shapes. Values that
are not part of the safe-defaults base are illustrative defaults from their source tools; the
per-agent and per-tool skill rows demonstrate optional overrides.

```md
## Configuration

| Key                                  | Value                      |
| ------------------------------------ | -------------------------- |
| review.profile                       | focused                    |
| review.autoConfirmScope              | false                      |
| review.designDecisionSources         | standard                   |
| review.validation                    | full                       |
| applyReview.defaultCommitStrategy    | null                       |
| applyReview.finalValidation          | full                       |
| applyReview.stashPolicy              | interactive                |
| applyReview.worktree.baseDir         | .effective-flow/.worktrees |
| applyReview.worktree.setup           | auto                       |
| mergeGate.completion                 | ask                        |
| mergeGate.conflictResolution         | auto                       |
| mergeGate.requireAllChecks           | true                       |
| mergeGate.checkWaitMinutes           | 20                         |
| mergeGate.maxRounds                  | 10                         |
| mergeGate.botWaitMinutes             | 10                         |
| mergeGate.bots                       | (empty)                    |
| language.project                     | en                         |
| language.source                      | en                         |
| language.documentation.user          | en                         |
| language.documentation.technical     | en                         |
| language.workflow                    | en                         |
| language.forge                       | en                         |
| language.git                         | en                         |
| plan.dir                             | docs/plan                  |
| concept.dir                          | docs/concept               |
| delivery.baseBranch                  | origin/main                |
| delivery.branchPrefix                | effective-flow             |
| delivery.completion                  | merge                      |
| delivery.returnBranch                | auto                       |
| delivery.mergeMethod                 | squash                     |
| worktree.enabled                     | true                       |
| worktree.setup                       | auto                       |
| worktree.baseDir                     | .effective-flow/.worktrees |
| tracker.mode                         | local                      |
| tracker.remoteToolOverride           | auto                       |
| skills.enabled                       | true                       |
| skills.include                       | (empty)                    |
| skills.exclude                       | (empty)                    |
| skills.agents.ui-implementer.include | effective-web              |
| skills.tools.docs.exclude            | humanizer                  |
```

The seven explicit language rows illustrate every override. In a typical project, only
`language.project` is needed; omit an override to inherit the project language. Omit optional
skill override rows when no override is needed. `tracker.externalTool`,
`tracker.externalToolHint`, and `tracker.externalStartedState` are absent because this example pins
`tracker.mode: local`; they belong to an external target only (see
[Block `tracker`](#block-tracker)).

## Block `language`

Controls the language of human-readable content created or edited by Effective Flow. Every value
is `de` or `en`; `null` has no special meaning for these keys.

| Key                       | Scope                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| `project`                 | Default for every human-readable surface without an override                                |
| `source`                  | Comments, test descriptions, and in-code documentation                                      |
| `documentation.user`      | Root README, marketing entry points, and user documentation                                 |
| `documentation.technical` | Developer and API documentation, operations documentation, runbooks, and ADRs               |
| `workflow`                | Plans, plan reviews, local review reports, investigations, and other local workflow prose   |
| `forge`                   | Issues, PR bodies, issue/PR comments, remote reviews, and review-thread replies             |
| `git`                     | Commit descriptions, Conventional-Commit PR titles, changelog prose, and release-note prose |

For a new artifact, the surface-specific override wins, then `language.project`, then the
built-in default `en`. An explicit user instruction for that artifact wins over configuration.
When editing an existing artifact, its recognizable language is preserved unless translation is
requested. Incoming third-party text and verbatim quotations are not translated automatically.
Interactive, non-persisted replies follow the current user's language; the project language is
only a fallback when the conversation language is unclear.

A local review therefore follows `language.workflow`, while the same review published as issues
follows `language.forge`. PR bodies and comments follow `language.forge`, but a
Conventional-Commit PR title follows `language.git` because squash merges may turn it into the
commit subject. Commit descriptions and generated changelog/release prose also follow
`language.git`; Conventional-Commit types remain English.

Stable machine-facing tokens are never localized: config keys and encoded values, labels, HTML
idempotency markers, finding IDs, action values, paths, Conventional-Commit types, branch slugs,
schemas, and runtime/wisdom headings. `language.source` does not rename identifiers, public API
names, or data formats. Product UI, CLI, and error-message localization remains governed by the
target project's i18n policy. English content uses `en-US` typography and German content uses
`de-DE`; this feature does not add independent locale selection.

## Block `review`

Controls the depth and behavior of [`/effective-flow review`](./tools-quality.md).

| Key                     | Values                          | Default    | Meaning                                                                                                  |
| ----------------------- | ------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `profile`               | `full` / `focused` / `fast`     | `focused`  | Scope and depth of the review                                                                            |
| `autoConfirmScope`      | `true` / `false`                | `false`    | Adopt the detected scope without a follow-up question                                                    |
| `designDecisionSources` | `full` / `standard` / `minimal` | `standard` | How thoroughly documented design decisions are searched before a finding counts as a deliberate decision |
| `validation`            | `full` / `quick` / `off`        | `full`     | Scope of the final technical validation                                                                  |

## Block `applyReview`

Controls [`/effective-flow apply`](./tools-implement.md) when it processes review findings.

| Key                     | Values                                       | Default                      | Meaning                                                  |
| ----------------------- | -------------------------------------------- | ---------------------------- | -------------------------------------------------------- |
| `defaultCommitStrategy` | `worktrees` / `single` / `none` / `null`     | `null`                       | Ask for the findings commit strategy on every run        |
| `finalValidation`       | `full` / `changedScope` / `off`              | `full`                       | Scope of final validation after all findings             |
| `stashPolicy`           | `interactive` / `keep` / `discard` / `apply` | `interactive`                | Handling of uncommitted changes before processing        |
| `worktree.baseDir`      | String                                       | `.effective-flow/.worktrees` | Base directory for findings-internal isolation worktrees |
| `worktree.setup`        | `auto` / `none` / free-text command          | `auto`                       | Setup command for each findings-internal worktree        |

`applyReview.worktree.*` is independent of the top-level `worktree.*` block: the former isolates
parallel review findings and cherry-picks their commits, while the latter selects the execution
location of the overall workflow. See [Worktree and delivery](./worktree-and-delivery.md).

## Block `mergeGate`

Controls [`/effective-flow merge-gate`](./tools-deliver.md), the merge gate that drives an
already-open pull request to merge-readiness and, if allowed, merges it.

| Key                    | Values                              | Default   | Meaning                                                                  |
| ---------------------- | ----------------------------------- | --------- | ------------------------------------------------------------------------ |
| `completion`           | `ask` / `merge` / `report` / `null` | `ask`     | May the run merge at the end, or only report merge-readiness             |
| `conflictResolution`   | `off` / `ask` / `auto`              | `auto`    | May the run resolve a conflict between the head branch and its base      |
| `requireAllChecks`     | `true` / `false`                    | `true`    | Require every reported check green, not only the forge's required ones   |
| `checkWaitMinutes`     | Positive integer                    | `20`      | Timeout, in minutes, for one wait on pending checks                      |
| `maxRounds`            | Positive integer                    | `10`      | Upper bound on check-gate rounds for the whole run                       |
| `botWaitMinutes`       | Positive integer                    | `10`      | Timeout, in minutes, for one wait after triggering an automatic reviewer |
| `bots`                 | Comma list of logins                | `(empty)` | Automatic reviewers (e.g. Greptile) the gate waits for and answers       |
| `bots.<login>.trigger` | Literal trigger comment text        | `(unset)` | Comment posted to re-trigger that reviewer when it has not started yet   |
| `bots.<login>.check`   | Commit-status or check-run context  | `(unset)` | Check that proves whether that reviewer is running or has run            |

`mergeGate.completion: ask` (or an unset key) poses the entry question exactly once, at the start of
a gated run; a non-interactive delegation cannot be asked and behaves as `report`. An empty
`mergeGate.bots` list means no automatic reviewer is expected, so the bot round is skipped rather
than blocking the merge forever. `mergeGate.bots.<login>.trigger` and `mergeGate.bots.<login>.check`
are one dotted key each per bot; a login containing brackets (for example `greptile-apps[bot]`) is a
valid middle segment because the encoding splits on `.` only.

**`mergeGate.conflictResolution` decides what happens when the head branch conflicts with its base.**
The gate already brings a branch that has merely fallen _behind_ its base forward with a merge
commit; this key covers the case where that same merge does not apply cleanly.

- `auto` (the default) hands the conflicted files to the gate's dedicated resolver, has the resolved
  tree verified independently before anything is committed, and pushes one ordinary merge commit.
  The run then continues its gate instead of ending at the conflict.
- `off` makes **no commit and no push**: the merge is aborted, the conflict is reported with its
  conflicted paths, and the run ends. That is exactly the outcome the gate produced **on the branch**
  before this key existed. It is not a claim that such a run touches nothing at all — the gate
  provisions its local checkout before it reads this key, and cleans that checkout up again on the
  same stop path.
- `ask` poses the question once per **conflicted round** in a gated run — once per conflict, not once
  per run. Each round's conflict is a different conflict against a base that has moved again, so
  consent given for one is not consent for the next, and with the default `mergeGate.maxRounds: 10`
  a single run may therefore pose the question up to ten times. This deliberately deviates from
  `mergeGate.completion`, whose entry question settles one fixed decision for the whole run and is
  never asked again. A **non-interactive delegated** run has nobody to ask, so that combination
  behaves as `off` and the report names `mergeGate.conflictResolution: auto` as the setting that
  would authorize the resolution — that part is the same way `mergeGate.completion` degrades.

**An unreadable or invalid value resolves to `off`, not to the documented default `auto`.** For every
other key in this block the safe fallback and the documented default are the same value; for this one
they diverge, because an unparseable line must never authorize a commit and a push. The run reports
the affected key and continues with `off`.

**The head branch is untrusted input.** The gate runs on any open pull request, including one whose
head branch lives in a fork this repository does not control. To validate a resolution, the resolver
discovers the repository's own validation commands from files that head branch supplies — scoped
instructions, CI workflows, task runners, manifests, package scripts — and executes them in the
provisioned checkout with full filesystem and network access. Under `auto`, the default, that happens
automatically and without anyone being asked. A project that gates pull requests it does not trust
should set `ask`, so a human authorizes every resolution, or `off`, so no untrusted branch's commands
are executed by this gate at all.

The default `auto` **changes behavior when you upgrade**: a project that never configured this key
gets automatic conflict resolution, and `off` restores the branch behavior of an earlier generation
exactly. Note also that completion mode `report` does not withhold it. `report` withholds exactly one
action, the merge of the pull request itself, so a `report` run still resolves a conflict and pushes
that one merge commit; `conflictResolution: off` is the switch for a run that makes no commit and no
push at all. What the resolver does with a conflict, and where it refuses to guess, is described
under [`/effective-flow merge-gate`](./tools-deliver.md#resolving-a-conflict-with-the-base).

**This key is new and has no legacy `prReview.*` counterpart.** It never existed as
`prReview.conflictResolution`, so the per-key legacy fallback described below finds nothing for it
and `/effective-flow setup` has no row to migrate. A project that carries only an unmigrated legacy
block therefore gets the default `auto` here.

**Either spelling of a bot login works.** GitHub shows `greptile-apps[bot]` in its interface and
reports that form through its REST API, but reports the same account as bare `greptile-apps` through
the GraphQL API the gate uses to read review threads. The gate matches a configured login against a
reported one after trimming a trailing `[bot]` from each, so one entry covers both surfaces and you
do not need to list a reviewer twice. **That trim applies only to an account the forge reports as a
bot.** A reported login the forge does not type as a bot has to match your configured spelling
exactly, so an ordinary user or organization named `greptile-apps` is never taken for the reviewer
`greptile-apps[bot]`. On a forge that states no account type at all (Forgejo), only the exact
spelling matches: a bare login configured as `greptile-apps[bot]` then counts as a reviewer that has
not run, which the gate reports rather than merges past. **Spell a Forgejo entry as the bare login**
for that reason — since a Forgejo gate can merge, a suffixed entry there blocks the merge on that
reviewer permanently rather than only making the report noisier. If a project already lists both spellings, they now count as
one reviewer — one round, one mention, one wait — and the gate reports the collapse so the redundant
row can be removed. The first of the two rows in `mergeGate.bots` order is the one whose `.trigger`
and `.check` the gate then uses, and a value set on only one of the rows is simply adopted. Two rows
that set the same key to different values are a configuration conflict: the gate names the key and
both values, posts no trigger for that reviewer, and blocks the merge on it rather than guessing
which of the two you meant.

`bots.<login>.check` names a commit status or check run that reviewer publishes, for example
`recensor/review`. With it, the gate can tell a reviewer that is **still running** from one that has
**not started**: it waits for the former and triggers only the latter. Leave it unset for a reviewer
that publishes no such check (Greptile today), and the gate keeps its previous two-state behavior
for that reviewer. See
[Three reviewer states, not two](./tools-deliver.md#three-reviewer-states-not-two).

**Do not confuse `mergeGate.*` with the pre-existing `delivery.prReview`.** `delivery.prReview`
controls whether a delivery workflow (`build`, `fix`, `refactor`, and comparable tools) publishes
**its own review findings** onto the pull request it just created. `mergeGate.*` configures the
**separate merge-gate tool**: whether that tool may merge, how long it waits, and which automatic
reviewers it expects. They control unrelated things – one is about publishing your own findings,
the other is about driving somebody else's pull request to merge.

**Legacy `prReview.*` keys.** The gate's keys were called `prReview.*` before the tool was renamed
to `merge-gate`. A run still reads each legacy key when its `mergeGate.*` counterpart is absent, so
an unmigrated project keeps its configured behavior instead of silently falling back to the
defaults; the run reports once that it did so. A present `mergeGate.<key>` always wins over the
legacy name, per key. This fallback lasts one generation: run
[`/effective-flow setup`](./tools-setup.md), which carries the values over, removes the old rows,
and names any legacy key it discarded because a `mergeGate.*` value already existed. No other tool
writes configuration.

The merge method itself is a delivery property, not a gate property, and lives under
[Block `delivery`](#block-delivery) as `delivery.mergeMethod`.

## Block `plan`

Controls [`/effective-flow plan`](./tools-understand.md) and every tool that reads or writes plan
files.

| Key   | Values | Default     | Meaning                                           |
| ----- | ------ | ----------- | ------------------------------------------------- |
| `dir` | String | `docs/plan` | Directory in which plan files live (`<plan.dir>`) |

Plan headers, sections, review content, open points, and the status marker all use one artifact
language. New plans follow `language.workflow`; existing German and English plans retain their
recognizable language when read, edited, or completed.

## Block `concept`

Controls [`/effective-flow concept`](./tools-understand.md) and the deep concept review.

| Key   | Values | Default        | Meaning                                                 |
| ----- | ------ | -------------- | ------------------------------------------------------- |
| `dir` | String | `docs/concept` | Directory in which concept files live (`<concept.dir>`) |

`concept.dir` must differ from `plan.dir`; an identical value is rejected, because a plan
reference and a concept reference could no longer be told apart. Concept files follow the same
one-language rule as plans and use their own status marker
(`**Concept status:** Draft`/`Elaborated` or `**Konzeptstatus:** Entwurf`/`Ausgearbeitet`).

## Block `delivery`

Describes the delivery branch, its base, its generated name, and its completion action. There is
no `delivery.enabled` setting: delivery is implied whenever work happens in a worktree or on a
dedicated delivery branch.

| Key            | Values                             | Default          | Meaning                                                            |
| -------------- | ---------------------------------- | ---------------- | ------------------------------------------------------------------ |
| `baseBranch`   | Git ref as string                  | `origin/main`    | Starting point of the delivery branch                              |
| `branchPrefix` | String                             | `effective-flow` | Prefix of generated branch names (`<branchPrefix>/<skill>/<slug>`) |
| `completion`   | `pr` / `merge` / `branch` / `null` | `merge`          | Open a PR, merge locally, retain the branch, or ask at run time    |
| `returnBranch` | `auto` or a local branch name      | `auto`           | Checkout to restore after completion                               |
| `mergeMethod`  | `squash` / `merge` / `rebase`      | `squash`         | Merge method used both by `pr` completion and by `merge-gate`      |

`delivery.completion` is the fallback when the current invocation does not already contain one
unambiguous affirmative directive to perform exactly one of `pr`, `merge`, or `branch`. A qualifying
directive overrides the configured value for that run; Effective Flow reports the configured value
and the applied override without editing the ADR. Negated, hypothetical, descriptive, and merely
mentioned actions are not override evidence. Alternatives or simultaneous requests for several
actions trigger a focused question and abort before delivery mutation if no single action is
confirmed.

`/effective-flow deliver` is deliberately narrower: invoking it is itself affirmative `pr` intent.
It always targets a pull request after its confirmed commits, ignores `delivery.completion` as an
action default, and reports when its `pr` outcome replaces a different configured value. The other
delivery settings still control its refreshed base, branch prefix, setup, and worktree location.

## Block `worktree`

Controls the execution location of the overall implementation, independently of
`applyReview.worktree.*`.

| Key       | Values                              | Default                      | Meaning                                              |
| --------- | ----------------------------------- | ---------------------------- | ---------------------------------------------------- |
| `enabled` | `true` / `false`                    | `true`                       | Run implementation in a separate Git worktree        |
| `setup`   | `auto` / `none` / free-text command | `auto`                       | Setup command in the newly created delivery worktree |
| `baseDir` | String                              | `.effective-flow/.worktrees` | Base directory for delivery worktrees                |

## Block `tracker`

Controls where issue-shaped work lives: in local Markdown reports, in GitHub/Forgejo issues, or in
an external project-management tool. See [Remote tracker](./remote-tracker.md) for target
selection, CLI requirements, and what an external target sends to a third party.

| Key                    | Values                           | Default   | Meaning                                                                         |
| ---------------------- | -------------------------------- | --------- | ------------------------------------------------------------------------------- |
| `mode`                 | `local` / `remote` / `external`  | `local`   | Markdown report, forge issues, or issues in the tool named below                |
| `remoteToolOverride`   | `auto` / `github` / `forgejo`    | `auto`    | Override host-based CLI detection; forge only, ignored for `external`           |
| `externalTool`         | Short identifier                 | `(unset)` | Tool that holds the issues; required for `mode: external`, no whitelist         |
| `externalToolHint`     | Free text                        | `(unset)` | How to find the connection: MCP server, workspace, key, state names             |
| `externalStartedState` | Stable ID / exact token / `null` | `(unset)` | Writable, non-terminal native state normalized as started; external target only |

`externalTool` and `externalToolHint` are hints for the run, not an adapter: Effective Flow ships
no product-specific integration and establishes every capability from the connection it resolves
at run time. Both keys are ignored for routing while the mode is `local` or `remote`, and are kept
in the ADR. A `mode: external` without a non-empty `externalTool` is invalid configuration: the run
aborts instead of falling back to the forge or to `local`.

`externalStartedState` is a nullable structured connection value, not a display-name preference.
Missing or `null` means unset and never authorizes a guessed transition. A non-null value stores the
state ID exposed by the selected workspace, team, or project. Only when the connection exposes no
stable ID may it store the exact token accepted by the transition operation. Before use,
Effective Flow lists writable states fresh in that same context and requires the configured value
to resolve to exactly one writable, non-terminal state normalized as started. A stale,
cross-context, read-only, terminal, missing, or display-name-only match fails before implementation.

When this key is absent and the tracker exposes exactly one qualifying started candidate, an
interactive implementation run may propose the candidate's display name and stable value for that
run. The run does not edit configuration. Only `/effective-flow setup`, after repeating discovery
and showing the before/after table for confirmation, persists the suggestion. Zero or several
candidates and non-interactive runs fail closed instead of choosing a familiar state name.

The post-merge issue grace period is fixed at 30 seconds and is deliberately not configurable. It
is separate from `mergeGate.checkWaitMinutes`, which controls pull-request checks. Use
`/effective-flow merge-gate <PR>` again for observer-only re-entry when tracker automation needs
longer.

## Block `skills`

Controls dynamic [skill discovery](./skill-discovery.md): whether and which host skills the tools
and agents may apply in addition to their built-in instructions.

| Key                     | Values              | Default   | Meaning                                                  |
| ----------------------- | ------------------- | --------- | -------------------------------------------------------- |
| `enabled`               | `true` / `false`    | `true`    | Turn off all dynamic skill use project-wide when `false` |
| `include`               | List of skill names | `(empty)` | Additionally prefer these skills project-wide            |
| `exclude`               | List of skill names | `(empty)` | Never apply these skills                                 |
| `agents.<name>.include` | List of skill names | `(empty)` | Additionally prefer skills for one source agent          |
| `agents.<name>.exclude` | List of skill names | `(empty)` | Never apply skills for one source agent                  |
| `tools.<name>.include`  | List of skill names | `(empty)` | Additionally prefer skills for one source tool           |
| `tools.<name>.exclude`  | List of skill names | `(empty)` | Never apply skills for one source tool                   |

`<name>` is the source agent or tool name, such as `ui-implementer` or `plan`. An excluded member
of an ordered recommendation (`A › B`) is skipped in favor of the next member. A named but
uninstalled included skill is ignored.

## Safe defaults at a glance

`/effective-flow setup` always starts from this single conservative base. Existing differing
values are retained unless the user explicitly confirms a change.

| Key                                 | Value                        |
| ----------------------------------- | ---------------------------- |
| `review.profile`                    | `focused`                    |
| `review.autoConfirmScope`           | `false`                      |
| `review.designDecisionSources`      | `standard`                   |
| `review.validation`                 | `full`                       |
| `applyReview.defaultCommitStrategy` | `null` (ask at run time)     |
| `applyReview.finalValidation`       | `full`                       |
| `applyReview.stashPolicy`           | `interactive`                |
| `applyReview.worktree.baseDir`      | `.effective-flow/.worktrees` |
| `applyReview.worktree.setup`        | `auto`                       |
| `mergeGate.completion`              | `ask` (ask at run time)      |
| `mergeGate.conflictResolution`      | `auto`                       |
| `mergeGate.requireAllChecks`        | `true`                       |
| `mergeGate.checkWaitMinutes`        | `20`                         |
| `mergeGate.maxRounds`               | `10`                         |
| `mergeGate.botWaitMinutes`          | `10`                         |
| `language.project`                  | `en`                         |
| `worktree.enabled`                  | `true`                       |
| `delivery.completion`               | `merge`                      |
| `delivery.baseBranch`               | `origin/main`                |
| `delivery.mergeMethod`              | `squash`                     |
| `tracker.mode`                      | `local`                      |
| `plan.dir`                          | `docs/plan`                  |
| `concept.dir`                       | `docs/concept`               |

Language overrides are absent in the safe base and therefore inherit `language.project`. If the
entire `language.*` block is absent, the default remains `en`.

The `mergeGate.*` rows and `delivery.mergeMethod` are listed here as the values a run uses, not as
rows Express writes: they belong to their source tools, a missing line means exactly the value above,
and the Express path writes no row for them. One of them is worth singling out. **`mergeGate.conflictResolution: auto` is the only default in this
list that leads a run to write:** it authorizes a merge-gate run to resolve a conflict between the
head branch and its base and to push the resulting merge commit. Every other default here only
changes how a run decides or how long it waits. A project upgrading from an earlier generation
therefore gets that one behavior change without configuring anything; see
[Block `mergeGate`](#block-mergegate) for how to switch it off.

There is no second “fast” preset. A faster solo flow is configured key by key, for example with
`review.profile: fast`, `review.validation: quick`, and
`applyReview.finalValidation: changedScope`.

## Runtime-state safety

Effective Flow writes below `.effective-flow/` only when that whole directory is ignored and no
path below it is tracked. Immediately before each runtime-state mutation, the owning Git
worktree checks both a sentinel and the concrete target with non-verbose `git check-ignore`, and
also checks the Git index. If Git is unavailable, the directory is not ignored, any runtime path
is tracked, or a check fails, the workflow leaves existing state untouched and directs you to
`/effective-flow setup`. Other workflows never edit `.gitignore` themselves.

## How `/effective-flow setup` maintains configuration

[`/effective-flow setup`](./tools-setup.md) is the Git-touching owner of project configuration.
It first normalizes `.gitignore` to the single runtime-directory entry:

```gitignore
.effective-flow/
```

The wizard then resolves and rereads any existing source, offers **Express** or **Guided** setup,
shows every proposed change, and writes only after confirmation. Express combines the safe base,
including `language.project: en`, with existing values. Guided first explains the project
language, then offers each optional language override with “inherit project language” represented
by an absent row. Removing an existing override appears in the same before/after diff as any other
change. In both paths, existing values and unknown rows are preserved unless a change is
explicitly confirmed.

On write, setup creates or updates the living ADR and writes or corrects the convention-file
marker. A new ADR uses `language.documentation.technical`; an existing ADR retains its envelope
and prose language. Ordinary config readers do none of these operations.

### Migrating `plan.markerLanguage`

`plan.markerLanguage` is no longer an active setting or writer output. For one compatibility
generation, readers may use a legacy value as the fallback for `language.workflow` only when
neither a valid workflow override nor a valid project language exists, and they direct the user
to setup. Setup may still propose the explicit migration whenever `language.workflow` is absent:
it shows that the old marker setting now controls the complete workflow artifact language,
proposes `language.workflow: de|en`, and removes the legacy row only in the confirmed write. An
existing `language.workflow` always wins and is never overwritten.

If neither language settings nor a legacy marker exists, a consistently German or English plan
collection may temporarily supply the workflow fallback. Plan prose and markers must agree;
mixed, contradictory, or empty collections provide no signal and fall back to `en` or require
clarification. Setup reports this inference before persisting it. Existing plans, reports,
issues, PRs, and documentation are never mass-translated.

## Migrating a legacy JSON configuration

If no ADR can be found, config readers may transitionally read `.effective-flow/config.json` or
the predecessor `.firmo/config.json`. This fallback is read-only: the tool uses the values for
the current run and directs you to `/effective-flow setup`.

Setup owns the one-time migration. It converts the current legacy values into the flat ADR table,
preserves unknown settings, writes the canonical marker, and changes `.gitignore` to the single
`.effective-flow/` entry. If the legacy config was tracked, setup removes it from the Git index
with `git rm --cached` but leaves its content on disk. Later deletion is deliberately separate:
use [`/effective-flow cleanup`](./tools-setup.md) after confirming that all values were carried
over.

## See also

- [Worktree and delivery](./worktree-and-delivery.md) – `delivery.*`, `worktree.*`, and
  `applyReview.worktree.*`
- [Remote tracker](./remote-tracker.md) – `tracker.*`
- [Skill discovery](./skill-discovery.md) – `skills.*`
- [Setup and info tools](./tools-setup.md) – `setup`, `cleanup`, and `version`
- [Glossary](./glossary.md) – recurring terms
