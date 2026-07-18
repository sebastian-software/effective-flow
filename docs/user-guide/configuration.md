# Configuration

Effective Flow works without any configuration – all tools start from safe defaults. Whoever
wants to adjust behavior permanently (e.g. merge instead of pull request, remote tracker
instead of a local report, stricter review depth) does so through a single file:
`.effective-flow/config.json`.

This page is the complete reference for all keys. The guides
[Worktree and Delivery](./worktree-and-delivery.md), [Remote Tracker](./remote-tracker.md),
and [Skill Discovery](./skill-discovery.md) explain their respective usage in detail and
link here for the exact field values instead of duplicating them.

## Basic principle

- `.effective-flow/config.json` is **optional**. If it is missing, the defaults documented below
  apply.
- A tool **never** overwrites existing values without asking. Unknown keys (e.g. from a future
  version or your own addition) are preserved unchanged when writing.
- An older config is automatically consolidated to the current schema on first read (moved,
  added, or removed keys – see "Migrating an existing config" below). This happens once and
  without a follow-up question, except in ambiguous cases.
- [`/effective-flow setup`](./tools-setup.md) is the guided way to create or maintain this
  file – editing it manually works just as well, as long as the file stays syntactically valid
  JSON.

## `.gitignore` entry

On its first run, `/effective-flow setup` adds this two-line pattern to `.gitignore`:

```gitignore
.effective-flow/*
!.effective-flow/config.json
```

Reason for the two lines: once a directory is fully ignored, Git cannot partially re-include
it through a later negation. `.effective-flow/*` therefore only ignores the _contents_ of
`.effective-flow/` (runtime state such as `memory.json`, `cache.json`, local review reports,
investigations, worktrees), while `!.effective-flow/config.json` specifically exempts the
config. This keeps `config.json` tracked and shareable in the repository, while the rest of
the runtime state stays – deliberately – local and untracked.

## Complete example

The following file shows all blocks with example values. With one exception they match the
respective defaults; `plan.markerLanguage` has **no** fixed default – the value `"de"` shown
here is only an example. In practice the marker language is detected from existing plans and
falls back to `en` without a clear signal (see [Block `plan`](#block-plan)).

```json
{
  "review": {
    "profile": "focused",
    "autoConfirmScope": false,
    "designDecisionSources": "standard",
    "validation": "full"
  },
  "applyReview": {
    "defaultCommitStrategy": null,
    "finalValidation": "full",
    "stashPolicy": "interactive",
    "worktree": {
      "baseDir": ".effective-flow/.worktrees",
      "setup": "auto"
    }
  },
  "plan": {
    "markerLanguage": "de",
    "dir": "docs/plan"
  },
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
  },
  "tracker": {
    "mode": "local",
    "remoteToolOverride": "auto"
  },
  "skills": {
    "enabled": true,
    "include": [],
    "exclude": [],
    "agents": {},
    "tools": {}
  }
}
```

Each block is independently optional; if a block or a key within it is missing entirely, the
respective default from the tables below applies.

## Block `review`

Controls the depth and behavior of [`/effective-flow review`](./tools-quality.md).

| Key                     | Values                          | Default    | Meaning                                                                                                  |
| ----------------------- | ------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `profile`               | `full` / `focused` / `fast`     | `focused`  | Scope and depth of the review                                                                            |
| `autoConfirmScope`      | `true` / `false`                | `false`    | Adopt the detected scope without a follow-up question                                                    |
| `designDecisionSources` | `full` / `standard` / `minimal` | `standard` | How thoroughly documented design decisions are searched before a finding counts as a deliberate decision |
| `validation`            | `full` / `quick` / `off`        | `full`     | Scope of the final technical validation                                                                  |

## Block `applyReview`

Controls [`/effective-flow apply`](./tools-implement.md) when working through review findings
(`apply-review`).

| Key                     | Values                                       | Default                      | Meaning                                                                      |
| ----------------------- | -------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| `defaultCommitStrategy` | `worktrees` / `single` / `none` / `null`     | `null`                       | `null` = the strategy is requested on every run                              |
| `finalValidation`       | `full` / `changedScope` / `off`              | `full`                       | Scope of the final validation after working through all findings             |
| `stashPolicy`           | `interactive` / `keep` / `discard` / `apply` | `interactive`                | Handling of uncommitted changes in the working tree before the start         |
| `worktree.baseDir`      | String                                       | `.effective-flow/.worktrees` | Base directory for the **findings-internal** isolation worktrees (see below) |
| `worktree.setup`        | `auto` / `none` / free-text command          | `auto`                       | Setup command per isolated finding worktree                                  |

`applyReview.worktree.*` is a separate mechanism, **independent of `worktree.*` (see below)**:
it isolates the parallel processing of individual findings and brings their commits back onto
the current branch via cherry-pick. Details on this and on the distinction from the delivery
worktree are in [Worktree and Delivery](./worktree-and-delivery.md).

## Block `plan`

Controls [`/effective-flow plan`](./tools-understand.md) and all tools that read or write plan
files.

| Key              | Values      | Default                                 | Meaning                                                                    |
| ---------------- | ----------- | --------------------------------------- | -------------------------------------------------------------------------- |
| `markerLanguage` | `de` / `en` | detected from existing plans, else `en` | Language of the status marker in the plan header (not of the plan content) |
| `dir`            | String      | `docs/plan`                             | Directory where plan files live (`<plan.dir>`)                             |

## Block `delivery`

Describes the delivery branch: base ref, name formation, and completion action. There is
deliberately **no** dedicated `delivery.enabled` switch anymore – delivery is always active
whenever work happens in a worktree or on a dedicated delivery branch (see
[Worktree and Delivery](./worktree-and-delivery.md)).

| Key            | Values                        | Default          | Meaning                                                                |
| -------------- | ----------------------------- | ---------------- | ---------------------------------------------------------------------- |
| `baseBranch`   | Git ref as string             | `origin/main`    | Starting point of the delivery branch                                  |
| `branchPrefix` | String                        | `effective-flow` | Prefix of the generated branch names (`<branchPrefix>/<skill>/<slug>`) |
| `completion`   | `pr` / `merge` / `branch`     | `merge`          | Completion action: open a PR, merge locally, or just leave the branch  |
| `returnBranch` | `auto` or a local branch name | `auto`           | Branch to switch back to after completion                              |

## Block `worktree`

Describes exclusively the **execution location** of the implementation – not whether delivery
happens.

| Key       | Values                              | Default                      | Meaning                                                 |
| --------- | ----------------------------------- | ---------------------------- | ------------------------------------------------------- |
| `enabled` | `true` / `false`                    | `true`                       | Does the implementation run in a separate Git worktree? |
| `setup`   | `auto` / `none` / free-text command | `auto`                       | Setup command in the freshly created worktree           |
| `baseDir` | String                              | `.effective-flow/.worktrees` | Base directory of all delivery worktrees                |

## Block `tracker`

Controls whether review findings are kept locally as a Markdown report or as issues on a
remote tracker. Details in [Remote Tracker](./remote-tracker.md).

| Key                  | Values                        | Default | Meaning                                               |
| -------------------- | ----------------------------- | ------- | ----------------------------------------------------- |
| `mode`               | `local` / `remote`            | `local` | Findings as a Markdown report or as issues            |
| `remoteToolOverride` | `auto` / `github` / `forgejo` | `auto`  | Forces a tool instead of host detection from `origin` |

## Block `skills`

Controls the dynamic [Skill Discovery](./skill-discovery.md) – that is, whether and which
host skills (e.g. `humanizer`, `impeccable`, `context7`) the tools and agents may use in
addition to their built-in instructions.

| Key             | Values                          | Default | Meaning                                                           |
| --------------- | ------------------------------- | ------- | ----------------------------------------------------------------- |
| `enabled`       | `true` / `false`                | `true`  | Turns off all dynamic skill usage globally when `false`           |
| `include`       | List of skill names             | `[]`    | Skills additionally preferred project-wide                        |
| `exclude`       | List of skill names             | `[]`    | Skills that are never applied                                     |
| `agents.<name>` | Object with `include`/`exclude` | `{}`    | As above, but only for the agent `<name>` (e.g. `ui-implementer`) |
| `tools.<name>`  | Object with `include`/`exclude` | `{}`    | As above, but only for the tool `<name>` (e.g. `plan`)            |

`<name>` is in each case the source agent or source tool name, not the display name of the
skill description. A member of a fallback recommendation (`A › B`) excluded via `exclude` is
skipped, and the next fallback takes effect instead.

## Safe defaults at a glance

These values form the single safe-defaults base that `/effective-flow setup` always starts from:

| Key                                 | Value                                   |
| ----------------------------------- | --------------------------------------- |
| `review.profile`                    | `focused`                               |
| `review.autoConfirmScope`           | `false`                                 |
| `review.designDecisionSources`      | `standard`                              |
| `review.validation`                 | `full`                                  |
| `applyReview.defaultCommitStrategy` | `null` (ask on the run)                 |
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

There is deliberately no second, "faster" preset. Whoever wants a brisker solo workflow
(e.g. `review.profile: fast`, `review.validation: quick`,
`applyReview.finalValidation: changedScope`) sets these values individually via the guided
path of `/effective-flow setup`.

## How `/effective-flow setup` maintains the config

[`/effective-flow setup`](./tools-setup.md) is the only place where both the `.gitignore`
entry and `.effective-flow/config.json` are written. The wizard offers two paths here:

- **Express:** the safe-defaults base plus – if a valid config already exists – adopting its
  existing values. A confirmation step with a before/after list, then done.
- **Guided:** the four core switches (worktree, completion action, marker language, tracker)
  explained and asked one by one, then optionally an advanced gate for all remaining keys
  including `skills`.

In both cases the same rule applies: a value that would replace an already existing, differing
config is written only after explicit confirmation – never silently overwritten. Unknown keys
are preserved in every case.

## Migrating an existing config

Every config-reading tool automatically consolidates an older `.effective-flow/config.json` to
the current schema on first read, among other things:

- old delivery values from `worktree.baseBranch`/`worktree.branchPrefix`/`worktree.completion`
  are moved – if not yet set there – to `delivery.baseBranch`/`delivery.branchPrefix`/
  `delivery.completion`,
- the invalidated `delivery.enabled` is removed (delivery has been implied by worktree/branch
  since 1.4x),
- missing keys are added additively with their defaults.

Ambiguous cases (e.g. the optional upgrade of `delivery.completion: null` to the new default
`merge`) are **not** decided automatically: the calling tool uses a safe default for the
current call, leaves the value unchanged, and points to `/effective-flow setup`. Only there is
the actual migration follow-up question asked.

## See also

- [Worktree and Delivery](./worktree-and-delivery.md) – usage of the blocks `delivery` and
  `worktree`
- [Remote Tracker](./remote-tracker.md) – usage of the block `tracker`
- [Skill Discovery](./skill-discovery.md) – usage of the block `skills`
- [Setup tools](./tools-setup.md) – `/effective-flow setup` and `/effective-flow version`
- [Glossary](./glossary.md) – terms such as worktree, delivery, finding
