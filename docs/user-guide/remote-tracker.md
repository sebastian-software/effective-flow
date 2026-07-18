# Remote Tracker

[`/effective-flow review`](./tools-quality.md) and the review processing in
[`/effective-flow apply`](./tools-implement.md) can keep findings in two ways: locally as a
Markdown report or remotely as issues on GitHub or Forgejo. This guide explains both modes and
how you switch between them; the field reference is in
[Configuration](./configuration.md#block-tracker).

## Local mode (default)

Without further configuration (`tracker.mode: local`), review and findings processing behave
as usual: findings land in a Markdown report file under `.effective-flow/review/`, no external
CLI is called, and no network connection is needed. This report stays – like all runtime state
under `.effective-flow/` – local and untracked.

## Remote mode

With `tracker.mode: remote`, `/effective-flow review` instead creates an issue for each finding
on your Git hosting service, bundled under an epic/tracking issue. `/effective-flow apply` then
reads these issues back in and works through them.

Important: the local/remote switch concerns **reviews only**.
[Investigations](./tools-understand.md) remain purely local under
`.effective-flow/investigation/` in either mode – they are never committed and never created as
an issue. Of the Effective Flow artifacts, only the plan file is committed (see
[Worktree and Delivery](./worktree-and-delivery.md)).

### Tool detection

Effective Flow does not distinguish between GitHub and Forgejo itself, but reads your
repository's `origin` remote:

- host exactly `github.com` → tool `gh`
- any other host → tool `tea` (Forgejo/Gitea)

For an ambiguous host (e.g. self-hosted GitHub Enterprise), you force the tool via
`tracker.remoteToolOverride: github` or `forgejo`; in the default `auto`, automatic detection
decides. The prerequisite in every case is a Git repository with an `origin` remote as well as
an installed and authenticated CLI (`gh auth status` or the corresponding `tea` login) – if one
of these is missing, Effective Flow aborts with a clear error message instead of silently
falling back to `local` (see [Troubleshooting](./troubleshooting.md)).

### Determining the mode per run

Effective Flow determines the effective mode in this order:

1. **Argument type:** if you pass a report file, that forces `local`; if you pass an issue
   number or URL, that forces `remote` – regardless of the config.
2. **Explicit wish in the task:** "as issues" or "local only, without issues".
3. **Config:** otherwise `tracker.mode` from `.effective-flow/config.json` applies.
4. **First-call query:** if none of these is set, Effective Flow asks once and stores the
   answer non-destructively in `.effective-flow/config.json`.

### Labels

In remote mode, Effective Flow assigns labels with the prefix `effective-flow-` and creates
missing labels idempotently as needed:

| Label                                                                                             | Meaning                                                                                          |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `effective-flow-review-finding`                                                                   | single finding issue                                                                             |
| `effective-flow-review-epic`                                                                      | epic/tracking issue                                                                              |
| `effective-flow-fix` / `effective-flow-refactor` / `effective-flow-build` / `effective-flow-docs` | target action of the finding (exactly one per finding issue)                                     |
| `critical` / `important` / `note`                                                                 | severity (exactly one per finding issue; German `kritisch`/`wichtig`/`hinweis` still recognized) |
| `wontfix`                                                                                         | deliberately not implemented (ADR instead of code)                                               |
| `effective-flow-issue-done`                                                                       | implemented by `/effective-flow apply` (issue-driven), PR created                                |
| `effective-flow-needs-planning`                                                                   | skipped, clarification via `/effective-flow plan-issue` needed                                   |

Only `effective-flow-…` is newly created or set; when reading, listing, and deduplicating, the
predecessor prefix `firmo-` additionally still counts as equivalent (one generation of
backward compatibility) – so a manual rename is not necessary. The even older prefix `sf-` is
migrated to `effective-flow-` **once** on the first remote access and is not recognized on an
ongoing basis afterward.

## Interplay with issue-driven tools

Besides `/effective-flow review`/`/effective-flow apply`, [`/effective-flow apply` (issue mode)](./tools-implement.md)
and [`/effective-flow plan-issue`](./tools-understand.md) also use the same host and CLI
detection and the same tool mapping – but for **arbitrary** issues, not only for findings
created by Effective Flow. These two tools are inherently remote: they do not evaluate
`tracker.mode`, but merely need a Git repository with an `origin` remote and an authenticated
CLI.

## See also

- [Configuration](./configuration.md) – complete field reference for `tracker`
- [Quality tools](./tools-quality.md) – `/effective-flow review`
- [Implementation tools](./tools-implement.md) – `/effective-flow apply`
- [Troubleshooting](./troubleshooting.md) – missing or unauthenticated CLI
- [Glossary](./glossary.md) – finding, tracker
