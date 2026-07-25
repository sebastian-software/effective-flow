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

Local Markdown reports use `language.workflow`. Issue bodies, epic prose, issue comments, remote
review content, and review-thread replies use `language.forge`; existing German and English
artifacts retain their language when updated. Headings, field names, and displayed values are
rendered consistently in the selected artifact language. Labels, finding IDs, action values,
paths, and HTML idempotency markers remain identical across languages so deduplication and routing
continue to work.

Important: the local/remote switch concerns **reviews only**.
[Investigations](./tools-understand.md) remain purely local under
`.effective-flow/investigation/` in either mode – they are never committed and never created as
an issue. Of the Effective Flow artifacts, only the plan file is committed (see
[Worktree and Delivery](./worktree-and-delivery.md)).

## Security findings stay local first

Even in remote mode, a finding classified as security relevant is **never** published to the
tracker on its own. An issue for an unfixed vulnerability describes it with file, line, problem,
and a ready-made reproduction prompt, is visible to everyone with read access, and is propagated
through notifications, mail, feeds, and mirrors – deleting the issue later does not undo that.

Therefore `/effective-flow review` does this in remote mode:

1. The findings of the run are classified. Anything security relevant – above all anything
   reachable from outside through untrusted input, a network boundary, or an auth boundary –
   becomes `local-only`. An uncertain assessment counts as security relevant.
2. The withheld findings are written first to a local report
   `.effective-flow/review/review-report-YYYY-MM-DD-security[-N].md`, with a notice that the file
   must not be pasted into public issues, pull requests, or chats. Like all runtime state it stays
   local and untracked.
3. The remaining findings become issues plus an epic, exactly as before. The epic and every issue
   body stay silent about the withheld findings – even a bare "3 security findings withheld" would
   tell an attacker that unfixed vulnerabilities exist.
4. Only then does Effective Flow offer to publish the withheld findings as issues as well, naming
   the disclosure consequence. Keeping them local is the default; an unanswered or non-interactive
   run publishes nothing. If you accept, the findings land in the same epic and their report entry
   records the issue number.

This gate overrides `tracker.mode` and every other configuration value; there is no config key
that switches it off. Process the withheld findings with
`/effective-flow apply .effective-flow/review/review-report-YYYY-MM-DD-security.md`, exactly like
any local report.

**What the gate does not cover:** the fix delivery. A branch named after the vulnerability, a
commit subject like "prevent SQL injection in the upload endpoint", or a descriptive pull request
body discloses the same thing the gate withheld – and a PR is public as soon as the repository is.
Decide the wording of that delivery yourself, or fix security findings in a private fork before
publishing.

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
3. **Configuration:** otherwise `tracker.mode` from the
   [project-setup ADR](./configuration.md#block-tracker) applies.
4. **First-call query:** if none of these determines the mode, Effective Flow asks for this run.
   To persist the answer, use `/effective-flow setup`; the review workflow does not write
   configuration itself.

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
