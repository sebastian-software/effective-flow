# Remote Tracker

[`/effective-flow review`](./tools-quality.md) and the review processing in
[`/effective-flow apply`](./tools-implement.md) can keep findings in three ways: locally as a
Markdown report, remotely as issues on GitHub or Forgejo, or in an external project-management
tool your team already uses. This guide explains all three targets and how you switch between
them; the field reference is in [Configuration](./configuration.md#block-tracker).

The target is the place that owns issue identity for a run. `tracker.mode` selects it:

| `tracker.mode` | Target                                                        |
| -------------- | ------------------------------------------------------------- |
| `local`        | Markdown report under `.effective-flow/review/` (default)     |
| `remote`       | the issue tracker of your `origin` remote (GitHub or Forgejo) |
| `external`     | the tool named by `tracker.externalTool`                      |

## Local mode (default)

Without further configuration (`tracker.mode: local`), review and findings processing behave
as usual: findings land in a Markdown report file under `.effective-flow/review/`, no external
CLI is called, and no network connection is needed. This report stays – like all runtime state
under `.effective-flow/` – local and untracked.

## Remote mode (Git forge)

With `tracker.mode: remote`, `/effective-flow review` instead creates an issue for each finding
on your Git hosting service, bundled under an epic/tracking issue. `/effective-flow apply` then
reads these issues back in and works through them.

Local Markdown reports use `language.workflow`. Issue bodies, epic prose, issue comments, remote
review content, and review-thread replies use `language.forge`; existing German and English
artifacts retain their language when updated. Headings, field names, and displayed values are
rendered consistently in the selected artifact language. Labels, finding IDs, action values,
paths, and HTML idempotency markers remain identical across languages so deduplication and routing
continue to work.

### Tool detection

For the forge target, Effective Flow does not distinguish between GitHub and Forgejo itself, but
reads your repository's `origin` remote:

- host exactly `github.com` → tool `gh`
- any other host → tool `tea` (Forgejo/Gitea)

For an ambiguous host (e.g. self-hosted GitHub Enterprise), you force the tool via
`tracker.remoteToolOverride: github` or `forgejo`; in the default `auto`, automatic detection
decides. The prerequisite in every case is a Git repository with an `origin` remote as well as
an installed and authenticated CLI (`gh auth status` or the corresponding `tea` login) – if one
of these is missing, Effective Flow aborts with a clear error message instead of silently
falling back to `local` (see [Troubleshooting](./troubleshooting.md)).

`tracker.remoteToolOverride` is a forge setting. It is ignored while the target is `external`.

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
ongoing basis afterward. Both compatibility rules are forge history and are never applied to an
external target.

## External target

With `tracker.mode: external`, issue work lives in a project-management tool outside your Git
forge. Two settings describe it:

- `tracker.externalTool` – the short, stable identifier of the tool that holds the issues.
  Required for this mode.
- `tracker.externalToolHint` – optional free text that lets a run find the right connection:
  the name of an MCP server, a workspace, a team or project key, the tool's identifier
  convention, or the names of its states.

Effective Flow ships **no** adapter, no list of supported tools, and no mapping onto any
product's API. Both values are hints for the run, not a dispatch table: a run establishes the
connection and its capabilities at run time, from a connection you have already set up on this
machine – an MCP connection or an installed, authenticated CLI. There is no whitelist, and no
capability is ever inferred from the tool's name. Naming your tool here does not make it a
supported integration: a run knows only what the connection you provide can actually do.

Configure the target with [`/effective-flow setup`](./tools-setup.md). The first-call query
(see below) can only offer local and remote, because it never writes configuration and therefore
cannot record the tool identifier this mode requires.

### What sends its content to the external tool

| Artifact                                             | Where it lives on an external target                    |
| ---------------------------------------------------- | ------------------------------------------------------- |
| Review findings, their container, and their comments | the external tool                                       |
| Issue-driven work (`apply`, `plan-issue`)            | the external tool                                       |
| Pull requests, PR comments, PR review threads        | always the Git forge behind `origin`                    |
| Plan files                                           | always committed under `plan.dir` (default `docs/plan`) |
| Investigations                                       | always local under `.effective-flow/investigation/`     |

Both issue-carrying flows follow the same target; one run never splits them across two systems.
Prose written to the external tool uses `language.forge`, exactly as forge issue prose does.

### This sends your content to a third party

Choosing an external target means Effective Flow writes issue and finding content into a system
outside your Git forge – typically a hosted third-party service. That content includes problem
descriptions, affected file paths and line references, recommendations, and the ready-made
reproduction prompt of a finding. Everyone with access to that tool, plus its operator, its
notifications, and its integrations, can see it.

Decide this deliberately, with whoever owns data protection in your team. Effective Flow does not
anonymize, summarize, or redact finding content for an external target; it writes the same bodies
it would write to a forge issue.

### Connection and fail-closed behavior

Before its first read, a run resolves exactly **one** connection for `tracker.externalTool`,
guided by the hint, and names it in its status output. If it cannot, it aborts – it never guesses
and never quietly writes somewhere else:

| Situation                                                               | What happens                                                |
| ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| `tracker.mode: external` without `tracker.externalTool`                 | abort, pointing to `/effective-flow setup`                  |
| no MCP connection and no authenticated CLI for that tool                | abort with the missing connection named                     |
| several plausible connections and no decisive hint                      | abort; sharpen `tracker.externalToolHint`                   |
| the connection cannot do something a flow needs (e.g. update a comment) | abort before the first write, naming the missing capability |

There is no fallback to the forge and none to `local`. Publishing to the forge instead would
scatter your issues across two systems, and falling back to a local report would hide work you
asked to publish. Every abort happens before the first write and leaves your workflow state
intact, so the run is resumable once the connection is fixed. See
[Troubleshooting](./troubleshooting.md#the-external-tracker-connection-could-not-be-resolved).

### Labels, containers, and deduplication

Effective Flow's label strings stay canonical on an external target: `effective-flow-review-finding`,
`effective-flow-review-epic`, the action labels, the severity labels, `wontfix`,
`effective-flow-issue-done`, and `effective-flow-needs-planning` keep exactly the spellings listed
under [Labels](#labels). A run stores them in whichever classification primitive your tool offers –
labels, tags, workflow states, or a custom field – and reports which one it used. If the connection
exposes no such primitive, the run aborts rather than creating findings without severity and action
or losing the lifecycle states.

The container that groups a review run's findings uses the tool's native parent/sub-issue relation
when the connection exposes one, and the Markdown checklist otherwise. Which mechanism was used is
reported per run. Either way, every finding stays reachable from its container and its completion
stays visible.

**Deduplication does not span targets.** A run only sees the target it currently resolves, so if
you switch targets, findings that already exist in the old one are published again in the new one.
Effective Flow reports this when a run publishes to a different target than the previous one; it
does not attempt to match findings across systems.

## Determining the target per run

Effective Flow determines the effective target in this order:

1. **Argument type:** if you pass a report file, that forces `local`; a forge issue number or URL
   forces `remote`; a tool-native identifier (e.g. `ABC-123`) or a URL of the configured external
   tool forces `external` – regardless of the config. A bare four-digit number always stays a
   legacy plan reference, and a mixed list that combines a forge reference with an external one is
   not resolved by guessing: Effective Flow asks you to split the call.
2. **Explicit wish in the task:** a plain issue or tracker wish ("as issues", "publish the
   findings") activates the target your project is configured for – it never overrides an external
   target with the forge. Only a wish that explicitly names the forge (GitHub, Forgejo, `origin`)
   selects `remote`, and only one that names the configured external tool selects `external`.
   "Local only", "without issues", or "report only" selects `local`.
3. **Configuration:** otherwise `tracker.mode` from the
   [project-setup ADR](./configuration.md#block-tracker) applies.
4. **First-call query:** if none of these determines the target, Effective Flow asks for this run –
   local or remote. To persist an answer, and to configure an external target at all, use
   `/effective-flow setup`; the review workflow does not write configuration itself.

**Keeping a single run local.** Because `external` means publication to the configured tool, the
"local only" wish is your escape hatch: ask for "local only", "without issues", or "report only"
and that run writes a Markdown report under `.effective-flow/review/` instead of creating issues.
There is no configuration for the combination "issues in the external tool, findings only in a
local report" – you request it per run.

`tracker.externalTool` and `tracker.externalToolHint` are ignored for routing while the mode is
`local` or `remote`. They are kept in the ADR and reported once as ignored.

Independently of the target: [investigations](./tools-understand.md) remain purely local under
`.effective-flow/investigation/` – they are never committed and never created as an issue – and
of the Effective Flow artifacts only the plan file is committed (see
[Worktree and Delivery](./worktree-and-delivery.md)).

## Security findings stay local first

Whenever findings would be published to a tracker – on the forge or in an external tool – a
finding classified as security relevant is **never** published on its own. An issue for an unfixed
vulnerability describes it with file, line, problem, and a ready-made reproduction prompt, is
visible to everyone with read access, and is propagated through notifications, mail, feeds, and
mirrors – deleting the issue later does not undo that. Publishing it into a third-party tool is a
disclosure with the same consequences, so the gate binds that target too.

Therefore `/effective-flow review` does this whenever it publishes to a tracker:

1. The findings of the run are classified. Anything security relevant – above all anything
   reachable from outside through untrusted input, a network boundary, or an auth boundary –
   becomes `local-only`. An uncertain assessment counts as security relevant.
2. The withheld findings are written first to a local report
   `.effective-flow/review/review-report-YYYY-MM-DD-security[-N].md`, with a notice that the file
   must not be pasted into public issues, pull requests, or chats. Like all runtime state it stays
   local and untracked.
3. The remaining findings become issues plus a container, exactly as before. The container and
   every issue body stay silent about the withheld findings – even a bare "3 security findings
   withheld" would tell an attacker that unfixed vulnerabilities exist.
4. Only then does Effective Flow offer to publish the withheld findings as issues as well, naming
   the disclosure consequence. Keeping them local is the default; an unanswered or non-interactive
   run publishes nothing. If you accept, the findings land in the same container and their report
   entry records the issue number.

This gate overrides `tracker.mode` and every other configuration value; there is no config key
that switches it off. Process the withheld findings with
`/effective-flow apply .effective-flow/review/review-report-YYYY-MM-DD-security.md`, exactly like
any local report.

**What the gate does not cover:** the fix delivery. A branch named after the vulnerability, a
commit subject like "prevent SQL injection in the upload endpoint", or a descriptive pull request
body discloses the same thing the gate withheld – and a PR is public as soon as the repository is.
Decide the wording of that delivery yourself, or fix security findings in a private fork before
publishing.

## Interplay with issue-driven tools

Besides `/effective-flow review`/`/effective-flow apply`, [`/effective-flow apply` (issue mode)](./tools-implement.md)
and [`/effective-flow plan-issue`](./tools-understand.md) also work on the resolved tracker target
– but for **arbitrary** issues, not only for findings created by Effective Flow. These two tools
are inherently tracker-bound: they do not evaluate whether findings are kept locally, and always
need a reachable tracker. On the forge target that means a Git repository with an `origin` remote
and an authenticated CLI; on an external target it means the resolved connection of that tool.

Delivery stays with the forge in either case: these tools create branches and pull requests on
`origin`, reference the issue by its identifier in the PR body, and post the PR link back as a
comment on the issue.

## See also

- [Configuration](./configuration.md) – complete field reference for `tracker`
- [Quality tools](./tools-quality.md) – `/effective-flow review`
- [Implementation tools](./tools-implement.md) – `/effective-flow apply`
- [Troubleshooting](./troubleshooting.md) – missing or unauthenticated CLI, unresolved external
  connection
- [Glossary](./glossary.md) – finding, tracker target
