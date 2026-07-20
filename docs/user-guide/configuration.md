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
truth. A new ADR uses this structure:

```md
# Effective Flow project setup

## Status

Active

## Context

This ADR holds this project's tracked Effective Flow configuration. `.effective-flow/` is a pure
runtime directory and completely gitignored.

## Configuration

| Key              | Value       |
| ---------------- | ----------- |
| review.profile   | focused     |
| worktree.enabled | true        |
| tracker.mode     | local       |
| skills.exclude   | (empty)     |
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

Existing ADRs with the former German `## Konfiguration`, `| Schlüssel | Wert |`, `(leer)`,
`Aktiv`, or `Abgelöst` forms remain readable. `/effective-flow setup` normalizes them to the
English form on its next write. These tokens are backward compatibility, not an alternative
canonical encoding.

## Complete table example

The following example shows every configuration area and all current setting shapes. Values that
are not part of the safe-defaults base are illustrative defaults from their source tools; the
per-agent and per-tool skill rows demonstrate optional overrides.

```md
## Configuration

| Key                                      | Value                       |
| ---------------------------------------- | --------------------------- |
| review.profile                           | focused                     |
| review.autoConfirmScope                  | false                       |
| review.designDecisionSources             | standard                    |
| review.validation                        | full                        |
| applyReview.defaultCommitStrategy        | null                        |
| applyReview.finalValidation              | full                        |
| applyReview.stashPolicy                  | interactive                 |
| applyReview.worktree.baseDir             | .effective-flow/.worktrees  |
| applyReview.worktree.setup               | auto                        |
| plan.markerLanguage                      | en                          |
| plan.dir                                 | docs/plan                   |
| delivery.baseBranch                      | origin/main                 |
| delivery.branchPrefix                    | effective-flow              |
| delivery.completion                      | merge                       |
| delivery.returnBranch                    | auto                        |
| worktree.enabled                         | true                        |
| worktree.setup                           | auto                        |
| worktree.baseDir                         | .effective-flow/.worktrees  |
| tracker.mode                             | local                       |
| tracker.remoteToolOverride               | auto                        |
| skills.enabled                           | true                        |
| skills.include                           | (empty)                     |
| skills.exclude                           | (empty)                     |
| skills.agents.ui-implementer.include     | effective-web               |
| skills.tools.docs.exclude                | humanizer                   |
```

The `plan.markerLanguage` value shown here is an example. When that row is missing, Effective Flow
detects the language from existing plan markers and otherwise uses English. Omit optional skill
override rows when no override is needed.

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

## Block `plan`

Controls [`/effective-flow plan`](./tools-understand.md) and every tool that reads or writes plan
files.

| Key              | Values      | Default                                 | Meaning                                                             |
| ---------------- | ----------- | --------------------------------------- | ------------------------------------------------------------------- |
| `markerLanguage` | `de` / `en` | detected from existing plans, else `en` | Language of the status marker in the plan header, not the plan body |
| `dir`            | String      | `docs/plan`                             | Directory in which plan files live (`<plan.dir>`)                   |

## Block `delivery`

Describes the delivery branch, its base, its generated name, and its completion action. There is
no `delivery.enabled` setting: delivery is implied whenever work happens in a worktree or on a
dedicated delivery branch.

| Key            | Values                        | Default          | Meaning                                                            |
| -------------- | ----------------------------- | ---------------- | ------------------------------------------------------------------ |
| `baseBranch`   | Git ref as string             | `origin/main`    | Starting point of the delivery branch                              |
| `branchPrefix` | String                        | `effective-flow` | Prefix of generated branch names (`<branchPrefix>/<skill>/<slug>`) |
| `completion`   | `pr` / `merge` / `branch` / `null` | `merge`          | Open a PR, merge locally, retain the branch, or ask at run time     |
| `returnBranch` | `auto` or a local branch name | `auto`           | Checkout to restore after completion                               |

## Block `worktree`

Controls the execution location of the overall implementation, independently of
`applyReview.worktree.*`.

| Key       | Values                              | Default                      | Meaning                                              |
| --------- | ----------------------------------- | ---------------------------- | ---------------------------------------------------- |
| `enabled` | `true` / `false`                    | `true`                       | Run implementation in a separate Git worktree        |
| `setup`   | `auto` / `none` / free-text command | `auto`                       | Setup command in the newly created delivery worktree |
| `baseDir` | String                              | `.effective-flow/.worktrees` | Base directory for delivery worktrees                |

## Block `tracker`

Controls whether review findings are local Markdown reports or remote GitHub/Forgejo issues. See
[Remote tracker](./remote-tracker.md) for mode selection and CLI requirements.

| Key                  | Values                        | Default | Meaning                                              |
| -------------------- | ----------------------------- | ------- | ---------------------------------------------------- |
| `mode`               | `local` / `remote`            | `local` | Store findings in a Markdown report or remote issues |
| `remoteToolOverride` | `auto` / `github` / `forgejo` | `auto`  | Override host-based CLI detection                    |

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

| Key                                 | Value                                   |
| ----------------------------------- | --------------------------------------- |
| `review.profile`                    | `focused`                               |
| `review.autoConfirmScope`           | `false`                                 |
| `review.designDecisionSources`      | `standard`                              |
| `review.validation`                 | `full`                                  |
| `applyReview.defaultCommitStrategy` | `null` (ask at run time)                |
| `applyReview.finalValidation`       | `full`                                  |
| `applyReview.stashPolicy`           | `interactive`                           |
| `applyReview.worktree.baseDir`      | `.effective-flow/.worktrees`            |
| `applyReview.worktree.setup`        | `auto`                                  |
| `worktree.enabled`                  | `true`                                  |
| `delivery.completion`               | `merge`                                 |
| `delivery.baseBranch`               | `origin/main`                           |
| `tracker.mode`                      | `local`                                 |
| `plan.dir`                          | `docs/plan`                             |
| `plan.markerLanguage`               | detected from existing plans, else `en` |

There is no second “fast” preset. A faster solo flow is configured key by key, for example with
`review.profile: fast`, `review.validation: quick`, and
`applyReview.finalValidation: changedScope`.

## How `/effective-flow setup` maintains configuration

[`/effective-flow setup`](./tools-setup.md) is the Git-touching owner of project configuration.
It first normalizes `.gitignore` to the single runtime-directory entry:

```gitignore
.effective-flow/
```

The wizard then resolves and rereads any existing source, offers **Express** or **Guided** setup,
shows every proposed change, and writes only after confirmation. Express combines the safe base
with existing values. Guided explains the core settings and optionally exposes all advanced
settings. In both paths, existing values and unknown rows are preserved unless a change is
explicitly confirmed.

On write, setup creates or updates the living ADR, writes or corrects the convention-file marker,
and normalizes backward-compatible German ADR tokens to the canonical English encoding. Ordinary
config readers do none of these operations.

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
