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

Minimum versions: `gh` 2.0.0 and `tea` 0.14.2. Effective Flow checks them once at the start of a
remote run, so an unsupported CLI surfaces before any work is done rather than at the delivery
point. `tea` 0.14.2 is the first release that can create a pull request from a repository slug
together with an explicit head branch, which is the form Effective Flow uses. Three of the
operations behind the `merge-gate` tool need a higher `gh` floor of their own; see
[Merge gate operations](#merge-gate-operations).

`tracker.remoteToolOverride` is a forge setting. It is ignored while the target is `external`.

### Labels

In remote mode, Effective Flow assigns labels with the prefix `effective-flow-` and creates
missing labels idempotently as needed – it reads the repository's existing labels first and
creates only the ones that are genuinely missing:

| Label                                                                                             | Meaning                                                                                          |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `effective-flow-review-finding`                                                                   | single finding issue                                                                             |
| `effective-flow-review-epic`                                                                      | epic/tracking issue                                                                              |
| `effective-flow-fix` / `effective-flow-refactor` / `effective-flow-build` / `effective-flow-docs` | target action of the finding (exactly one per finding issue)                                     |
| `critical` / `important` / `note`                                                                 | severity (exactly one per finding issue; German `kritisch`/`wichtig`/`hinweis` still recognized) |
| `wontfix`                                                                                         | deliberately not implemented (ADR instead of code)                                               |
| `effective-flow-issue-in-progress`                                                                | issue-backed implementation has started; removed after terminal closure is observed              |
| `effective-flow-issue-done`                                                                       | implemented by `/effective-flow apply` (issue-driven), PR created                                |
| `effective-flow-needs-planning`                                                                   | skipped, clarification via `/effective-flow plan-issue` needed                                   |

Only `effective-flow-…` is newly created or set; when reading, listing, and deduplicating, the
predecessor prefix `firmo-` additionally still counts as equivalent (one generation of
backward compatibility) – so a manual rename is not necessary. The even older prefix `sf-` is
migrated to `effective-flow-` **once** on the first remote access and is not recognized on an
ongoing basis afterward. Both compatibility rules are forge history and are never applied to an
external target.

**Label creation reads before it writes.** Creating a label is two commands, not one: Effective
Flow lists the repository's labels and only then creates the ones that are missing. That read is
what makes repeated runs safe. Neither forge offers an idempotent create, and Forgejo in
particular accepts a second label with the same name, so an unconditional create used to add
another copy of every lifecycle label on each run – and because labels are attached to issues by
name, one "add label" then attached all the copies. The read costs one extra `gh` call on GitHub
and two extra `tea` calls on Forgejo per label, which is the price of not producing duplicates.

The consequence to know about: if that read cannot run, Effective Flow **aborts instead of
creating**. Label creation is the first tracker write of `/effective-flow review` and of the
issue-driven `/effective-flow apply`, so the whole run stops before it changes anything. Two
things can trigger it, each with its own error code rather than a silent workaround:

- **`tea` cannot list labels the way the pre-check needs.** Reported as
  `UNSUPPORTED_CAPABILITY`, raised before any label command runs. Effective Flow checks at startup
  that `tea labels list` accepts `--output`, `--exclude-org`, `--page`, and `--limit`. All four
  exist from `tea` 0.14.2, the minimum version named above, so this only appears on an installation
  that reports a new enough version but is patched or replaced. Install an official `tea` 0.14.2 or
  newer.
- **The forge failed the label read.** Reported as `COMMAND_FAILED`, marked retryable. On Forgejo,
  `tea` 0.14.2 answers a failed label listing with an empty list and a
  `Failed to list repository labels` warning rather than an error exit, which is indistinguishable
  from a repository that has no labels at all. Effective Flow reads that warning and stops, because
  trusting the empty list would create the duplicates this pre-check exists to prevent. On GitHub
  the read fails outright and stops the run in the same place. Either way this is usually transient
  – a forge outage, an expired token, a repository your login cannot read – so check the forge's
  availability and your CLI login, then run the command again.

Labels that a previous version already duplicated are **not** cleaned up; the pre-check stops the
growth but removes nothing. Deleting a label on Forgejo also detaches it from every issue that
carries it, so that cleanup is a deliberate manual decision rather than something a run does on
your behalf. An existing label is likewise never updated: a label that already carries a different
color or description keeps it.

### Native sub-issues created during planning

`/effective-flow plan-issue` may propose splitting a broad issue into independently implementable
children, but only when the resolved tracker proves that it can both list native children and
create an issue under the current parent as one operation. These capabilities are deliberately
stricter than generic issue creation:

- **GitHub:** the tracker helper owns the provider-specific mapping for native child reads and
  atomic parent-aware creation. It probes that capability before the first creation preview or
  write; workflows use only the provider-neutral helper operations and never assemble a raw GitHub
  command themselves.
- **Forgejo/Gitea:** the `tea` adapter currently exposes neither verified native operation, so
  decomposition fails closed. `plan-issue` can still complete the parent as one issue; it does not
  create standalone children or invent a checklist relation.

Before the first child write, the canonical planning comment records the exact proposed set in one
v2 section built by the tracker helper. The whole section is bound to the artifact language,
the resolved target, the active parent, and every child's unique stable key, title, workflow,
self-contained body, status, and draft hash. On a forge, identities belong to the exact resolved
host and repository; a URL from another host or repository never aliases the same issue number. An
external tracker keeps each tool-native identifier or URL as an exact identity and never collapses
it by a trailing number. Created child identities must also be unique, and only a record with
status `created` may carry one. You approve that exact set explicitly.

The helper validates the complete persisted section against its bound records and byte-for-byte
visible rendering. Editing a displayed title, body, workflow, status, identity, or the encoded
record independently is treated as tampering or corruption and fails closed. The workflow rebuilds
the full section for a legitimate state transition; it never patches one hidden marker or visible
entry in isolation.

Before persistence, each child body must contain exactly one language-matching workflow field that
agrees with its bound record. The field must be top-level: blockquoted and fenced examples do not
count. Every Markdown fence in the body must close before persistence; otherwise the helper-appended
final child marker would remain hidden inside the fence and the operation fails closed. Child titles
and bodies are also sanitized: recognizable assigned values such as AWS access keys, refresh tokens,
Authorization Bearer/token/Basic credentials, private keys, client or session credentials, and
prefixed environment variables such as `GH_TOKEN`, `NPM_TOKEN`, or `DATABASE_PASSWORD` are redacted.
Sentence-like, punctuated security prose such as `Token: support refresh-token rotation.` remains
unchanged. Empty, unterminated, residual, or other ambiguous credential forms fail closed rather
than being guessed at, and secret-bearing labels are rejected rather than redacted. This boundary
does not claim to recognize every possible secret.

For a GitHub decomposition, the complete canonical planning comment has an aggregate limit of
65,536 UTF-8 bytes. The helper checks the generated child section and then the complete stamped
comment before persistence, reporting the section, other comment content, and per-child size
contributions if it does not fit. It never truncates a child or bypasses the canonical section.
This decomposition-specific validation does not apply to ordinary planning comments without a
decomposition; a provider can still reject its own smaller limit as a fail-closed persistence error.

For each approved draft, Effective Flow reads the native child list immediately before the create
preview and again immediately before applying the unchanged preview. If the child appears between
the two reads, its stable key recovers it without another write. The local checks enforce only the
child-count and parent-state constraints those reads expose. Hierarchy depth, permissions, or
provider limits that cannot be proved locally remain fail-closed provider errors; the guide does
not treat them as preflighted. After a successful create or recovery, a third native-child read
must show exactly one valid same-parent match before the canonical comment is updated to `created`.

The three-read sequence reduces duplicate creation for one sequential or resumed workflow, but it
is not a provider-wide lock. Where the provider offers no atomic conditional mutation, simultaneous
runs can still race after the final pre-create read. A duplicate that becomes visible during the
post-create read or later reconciliation fails closed. Effective Flow therefore does not promise
global uniqueness across concurrent writers.

If a create command fails after the tracker may already have accepted it, Effective Flow does not
retry blindly. It reads the native children again: one matching key recovers the child, while zero
or multiple matches keep that proposal unresolved. If only part of a set was created, valid
children remain in place, the planning comment records created and missing items, and the parent
keeps `effective-flow-needs-planning` until a fresh run reconciles the set. There is no fallback to
generic issue creation, a create-then-link sequence, sibling issues, or a Markdown checklist.

A native child's decomposition key is recognized only as the final nonblank standalone line of its
body. Quoted or fenced child markers remain ordinary prose. The parent comment likewise accepts
one ordered canonical section whose record controls stay inside its boundaries; quoted or fenced
section examples are ignored. Record controls outside those boundaries, duplicate controls, or any
noncanonical encoded or visible rendering are rejected, and callers must not handwrite them. A
malformed, duplicated, invalid, misplaced, or wrong-parent child marker is isolated as a structured
diagnostic on that provider-verified child; it does not discard the child or abort reads of its
siblings. Planning and implementation reconciliation still fail closed on that diagnostic. They
never infer a key from the child's title or quietly accept an incomplete mapping. Lifecycle and
merge observation can still use the provider-verified native relationship and the receipted child
identity.

## External target

With `tracker.mode: external`, issue work lives in a project-management tool outside your Git
forge. Three settings describe it:

- `tracker.externalTool` – the short, stable identifier of the tool that holds the issues.
  Required for this mode.
- `tracker.externalToolHint` – optional free text that lets a run find the right connection:
  the name of an MCP server, a workspace, a team or project key, the tool's identifier
  convention, or the names of its states.
- `tracker.externalStartedState` – the stable ID of the native state that means started in that
  exact tracker context, or the connection's exact write token only when it exposes no ID.

Effective Flow ships **no** adapter, no list of supported tools, and no mapping onto any
product's API. `externalTool` and `externalToolHint` are connection hints for the run, not a
dispatch table; `externalStartedState` is a tracker-native value that the run verifies against that
connection. A run establishes the connection and its capabilities at run time, from a connection
you have already set up on this machine – an MCP connection or an installed, authenticated CLI.
There is no whitelist, and no capability is ever inferred from the tool's name. Naming your tool
here does not make it a supported integration: a run knows only what the connection you provide
can actually do.

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
| no single writable started state can be resolved for implementation     | abort before code; run `/effective-flow setup`              |

There is no fallback to the forge and none to `local`. Publishing to the forge instead would
scatter your issues across two systems, and falling back to a local report would hide work you
asked to publish. Every abort happens before the first write and leaves your workflow state
intact, so the run is resumable once the connection is fixed. See
[Troubleshooting](./troubleshooting.md#the-external-tracker-connection-could-not-be-resolved).

### Labels, containers, and deduplication

Effective Flow's classification strings stay canonical on an external target:
`effective-flow-review-finding`,
`effective-flow-review-epic`, the action labels, the severity labels, `wontfix`,
`effective-flow-issue-done`, and `effective-flow-needs-planning` keep exactly the spellings listed
under [Labels](#labels). A run stores them in whichever classification primitive your tool offers –
labels, tags, workflow states, or a custom field – and reports which one it used. If the connection
exposes no such primitive, the run aborts rather than creating findings without severity and action
or losing the lifecycle states.

These classifications are separate from the tracker's native workflow state.
`effective-flow-issue-done` means that implementation is secured in a pull request; it does not
mean that the issue is closed. Before issue-backed implementation begins, Effective Flow lists the
writable native states fresh in the workspace, team, or project selected by
`tracker.externalToolHint`. A configured `tracker.externalStartedState` must resolve by stable ID
or exact accepted token to one writable, non-terminal state normalized as started. A display-name
match is not enough. If the key is unset and exactly one candidate qualifies, an interactive run
may propose its display name and stable value for that run. Only `/effective-flow setup` persists
the value. Zero or several candidates, a stale value, or a non-interactive run without a configured
value stops before implementation rather than guessing.

The container that groups a review run's findings uses the tool's native parent/sub-issue relation
only when the connection both exposes it and can write the sub-item's completion state; otherwise
it uses the Markdown checklist. Which mechanism was used is reported per run. Either way, every
finding stays reachable from its container and its completion stays visible. Creating the pull
request does not complete the native sub-item or tick its checklist entry. That happens only after
`merge-gate` observes the linked work item in a terminal state after merge.

That checklist fallback applies to containers that group review findings; it does **not** authorize
issue decomposition by `plan-issue`. An external connection can offer decomposition only when it
proves the complete native-container mechanism—native child listing plus writable native sub-item
completion—and atomic create-under-parent. When any guarantee is missing, the parent can still
follow the ordinary canonical-comment planning path, but no child issue is created and Effective
Flow does not fall back to the forge or a checklist. When all three are proven, the same exact-set
approval, stable-key reconciliation, and no-blind-retry behavior described for the forge applies
through that one external connection.

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

## Merge gate operations

[`/effective-flow merge-gate`](./tools-deliver.md) reads pull-request status, waits for checks, and
merges through five additional forge operations of the same remote-tracker helper. Like all PR
work, they are inherently forge-bound: they never evaluate `tracker.mode` and only need a Git
repository, an `origin` remote, and an authenticated CLI.

| Operation          | Capability              | What it does                                                                                                                                                                                                                                                                                    |
| ------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pr-status-read`   | `pullRequestStatus`     | Reads the head SHA, base ref, PR state, draft flag, check list, and mergeability as one logical read. On GitHub that is one GraphQL call carrying per-check requiredness and the forge's merge state; on Forgejo it is three `tea api` calls and reports neither of those two facts (see below) |
| `pr-checks-wait`   | `pullRequestChecksWait` | Blocks inside the provider's own watch until checks complete or the supplied timeout elapses, then reads back the normalized check list as a second call                                                                                                                                        |
| `pr-merge`         | `pullRequestMerge`      | Merges the pull request with the configured method; a mutation, so a run without `--apply` produces a dry-run plan and merges nothing                                                                                                                                                           |
| `viewer-read`      | `viewerRead`            | A read, not a mutation. Returns the authenticated login and, where the provider states it, the account type (`User` or `Bot`), so the gate can tell its own writes from another account's across runs                                                                                           |
| `issue-state-wait` | `issueRead`             | Reads a linked forge issue, waits once for the fixed 30-second grace period when it is still open, then performs one final read; it never polls or closes the issue                                                                                                                             |

`issue-state-wait` uses the adapter's general CLI floor, not the higher GitHub merge-gate floor.
Its 30-second bound is fixed and has no configuration key. A still-open issue is a successful
observation result, not a merge failure.

**GitHub** supports `pr-status-read`, `pr-checks-wait`, and `pr-merge`, but only from **`gh`
2.50.0** – a higher floor than the adapter's general `gh` 2.0.0 minimum. `gh pr checks --json`, the
flag the gate depends on most, only landed in 2.50.0; the other flags those three operations use
(`--watch`, `--match-head-commit`, `--required`) are older. On a `gh` below 2.50.0 – common on a
distro-packaged install – those three capabilities report `UNSUPPORTED_CAPABILITY` instead of
failing mid-run on an unknown flag, and `merge-gate` degrades to report-only there. If you see that
message on GitHub, upgrade `gh` rather than suspect your repository's forge access. `viewer-read`
needs no flag beyond every `gh` 2.x line and no scope beyond an authenticated `gh` already holds, so
it is unaffected by that version floor; it maps to `gh api user`.

**Forgejo** supports `pr-status-read`, `pr-merge`, and `viewer-read`, and declares only
`pr-checks-wait` unsupported among the three: `tea` has no `checks` subcommand and Forgejo offers no
server-side blocking watch comparable to `gh pr checks --watch`, so `merge-gate` takes its documented
no-watch degradation there – report the pending checks by name and ask once – instead of blocking. A
Forgejo run is therefore the whole gate minus the blocking wait. Three other operations `merge-gate`
and `iterate` use stay unsupported on Forgejo: `review-create`, `review-thread-reply`, and
`review-thread-resolve`.

**`review-thread-resolve` is unsupported because Forgejo serves no route for it**, not because
`tea` lacks a subcommand – `tea pulls resolve` exists. Forgejo's `/pulls` router group declares no
`resolve`, `unresolve` or `replies` path at any nesting level, where Gitea `main` declares all three,
and a live `15.0.3+gitea-1.22.0` instance confirms it: its `/swagger.v1.json` lists 314 paths and not
one of them matches `…/pulls/comments/…`; an authenticated `POST …/pulls/comments/{id}/resolve` is
rejected by the router with the same status a deliberately nonsense path draws, while the
neighbouring `…/reviews/{id}/dismissals` reaches its handler. The capability is therefore stated as a
provider fact, exactly as `pullRequestStatus` and `pullRequestMerge` are, rather than derived from a
`--help` probe that could only ever attest the client subcommand. `iterate` keeps its reply, leaves
the thread unresolved and says so; `merge-gate` reads the same refusal as workflow input rather than
as a failure.

**Reading review threads costs one request per review, plus one.** Forgejo exposes no flat
review-comment listing at any nesting level, so the read enumerates `…/pulls/{index}/reviews` and
then asks each review for its comments – `ceil(N/50) + N` requests for `N` reviews, the same fan-out
`tea pulls review-comments` performed internally and did not report. Every call appears in
`data.commands`. What moved is not the cost but the wire format: the renderer states no login and no
timestamp under any spelling, so the read now goes through the raw API, where `modules/structs`
declares both.

The three capabilities are gated on a `tea api` transport probe rather than on a version floor.
`tea api` itself landed in `tea` v0.12.0, below the adapter's existing 0.14.2 minimum, so nothing
here raises that floor; what is probed is the `--include` flag, which is source-verified for
`v0.15.1`/`main` only. A `tea` whose `api` command lacks it reports all three as
`UNSUPPORTED_CAPABILITY` rather than issuing a request whose HTTP status it could never read – and
reading that status matters, because `tea api` exits `0` on every 4xx and 5xx alike. The probe
attests transport only: `head_commit_id`, the field that makes the merge's head guard atomic, is a
request-body field and cannot be probed at all, so a server older than the Gitea 1.16 API surface
would ignore it silently.

What a Forgejo `pr-status-read` does **not** report is worth knowing before you configure the gate
against it:

- **No merge state.** Forgejo's pull-request object has no `mergeStateStatus` equivalent, so the
  adapter states none rather than fabricating a `CLEAN`. `BEHIND` is therefore undetectable; a
  branch-protection rule that blocks an outdated branch fails the merge closed server-side instead.
- **No requiredness per check.** Forgejo has no such flag, so every check reports it as unstated and
  `mergeGate.requireAllChecks: false` fails closed on each of them – stricter than the default,
  never looser.
- **`mergeable: false` is reported as no field at all.** Forgejo returns `false` while its conflict
  check is still running and for any WIP-titled pull request, so mapping it to `CONFLICTING` would
  make the gate report a conflict that does not exist. Only `true` is stated, as `MERGEABLE`.
- **The command previews arrive as `data.commands`.** The Forgejo status read issues three calls –
  the pull request, its head commit's combined status, and that commit's committer date – because
  the last two are addressed by the head SHA the first returns and are not knowable before it runs.
- **`mergeGate.bots` entries must be spelled as the bare login** on Forgejo, without a `[bot]`
  suffix: the forge states no account class, so a suffixed entry matches nothing and leaves that
  reviewer permanently _not started_.
- **A commit status with no readable state fails the whole read.** An entry that states neither
  `status` nor `state` ends the `pr-status-read` with `INVALID_PAYLOAD` instead of degrading to a
  silent pending reading – a state that is present but unrecognized still reads as pending. The
  reach is wider than `merge-gate`'s check loop: `readPullRequestStatus` is the single reader
  shared with the merge's head guard, and `pr-status-read` also feeds the bot-state observation and
  the review-in-flight guard of `iterate`.

Several behaviors worth knowing if you inspect the gate's output or a `merge-gate` transcript:

- **A configured reviewer check is read from the same check list, not from a separate call.** The
  context named in `mergeGate.bots.<login>.check` is matched against the normalized check list that
  `pr-status-read` already returns. A GitHub commit status (such as `recensor/review`) and a check
  run are indistinguishable there, so either form works, and a context that never appears at all is
  reported by name rather than treated as passed.
- **`pr-checks-wait` runs two `gh` commands, not one.** `gh` rejects `--watch` together with
  `--json` outright, so a single call can no longer do both jobs. The operation first watches the
  checks to their natural conclusion (or the supplied timeout) and discards that step's exit
  status entirely, then issues a second, plain `gh pr checks --json` call that is the sole
  authority for the payload and for any operational error.
- **A finished check run with a red check still counts as a result, not a command failure.** Because
  the watch step's exit status is discarded, a failed check can no longer fail the operation by
  itself. The read step carries the old discriminator instead: a non-zero exit whose stdout is
  still a parsable JSON array is normalized into a completed result carrying the failing check's
  `conclusion: FAILURE`, so the gate can report and repair it like any other finding. Only an exit
  with no parsable check list at all – no checks configured, a bad reference, missing auth – is
  treated as an operational error. Separately, the read step's exit code 8 ("checks still pending")
  is normalized into a timeout result, not an error either.
- **A timed-out wait still reports the real pending check list.** The read step runs even after the
  watch step times out, so `pr-checks-wait` no longer returns an empty list on a timeout – it
  reports whatever check states the provider had at that point, letting the gate show what was
  actually still pending instead of nothing at all.
- **`data.commands` replaces `data.command` wherever one logical read issues several commands.**
  `pr-checks-wait` does, because `gh` rejects `--watch` together with `--json`, so it reports both
  previews in execution order in a `commands` array. A Forgejo `pr-status-read` does too, for its
  three `tea api` calls. Every other operation, and `pr-status-read` on GitHub, still reports a
  single `data.command`.
- **An empty check list is not read as "all green".** Both `pr-status-read` and `pr-checks-wait`
  report `checksReported` (whether the provider returned a check rollup at all) and `checkCount`
  (how many checks it contains) alongside the list itself. A wait or a status read only counts as
  complete when the list is also non-empty, so a pull request GitHub has not yet attached any check
  runs to cannot be mistaken for one that already passed everything. This is a different empty
  case from the one below, where `requiredChecksDefined` records what gh reported without claiming
  completeness either way.
- **An empty `--required` result is recorded, not interpreted.** `gh pr checks --required` filters
  the check rollup by a per-context `isRequired` flag, and only a context that has already reported
  carries that flag at all, so the filtered list comes back empty both when the forge defines no
  required checks for the branch and when required checks are defined but none of them has reported
  yet – `gh` exits non-zero with an empty payload and a stderr message of "no required checks
  reported" in either case, and the two are not distinguishable from that message alone. The read
  step recognizes exactly that combination (the `--required` flag plus that stderr phrase) and turns
  it into a successful result with `requiredChecksDefined: false` instead of failing the operation
  with `COMMAND_FAILED`; without this, `mergeGate.requireAllChecks: false` would fail the wait on
  every repository where required checks simply have not reported yet. The watch step never carries
  `--required` for this reason – filtering it would make it return immediately on such a branch
  instead of blocking, which is the one thing it exists for, so the required-checks criterion is
  applied only by the structured read that follows. `requiredChecksDefined` appears only in this
  detected case and is never emitted as `true` or on any other path; any other non-zero exit of the
  read (an unresolvable reference, a missing token) still counts as an operational error.
  `complete` follows the ordinary rule regardless – it is `true` only when the list is non-empty and
  every check has finished, so `requiredChecksDefined: false` does not shortcut it, because it can
  just as well mean a branch whose required checks are all still pending.
- **A missing `draft` flag is reported as absent, not as `false`.** When the provider does not
  expose the draft state, `pr-status-read` omits the field instead of guessing – the same "absent
  rather than guessed" rule the check list's `required` flag already follows, except that the
  `required` flag now does come back on every check the forge states a requiredness for. Treat an
  absent `draft` as blocking, the same as a confirmed `true`.
- **`pr-status-read` reads its check list through one GraphQL query, not `gh pr view --json`.**
  That is still a single call, so the check list and the merge state continue to describe the same
  instant, but the query additionally states each context's requiredness, which the older
  projection had no field for at all. The `required` flag is purely additive: it is present on a
  check where the forge states its requiredness and absent, never guessed, when the forge does
  not. The rollup is read from the commit whose object name matches the head SHA, never from
  whichever commit the provider happened to return last: a pull request's commit list is
  materialized asynchronously and can trail the head right after a push, and reporting an earlier
  commit's green checks against the head is how a commit whose CI never ran gets merged. When no
  returned commit matches the head, the check list is reported as absent rather than guessed.
  The query requests **one page** of the rollup, currently a hundred contexts, and refuses a
  partial one: if the provider reports more contexts than it returned, the operation fails with
  `INVALID_PAYLOAD` naming both the total and the returned count rather than evaluating a merge
  criterion on a partial check list. A pull request that genuinely exceeds that ceiling therefore
  fails this read until the query learns to page.
- **`pr-checks-wait` may report `forcedKill: true`.** If the watching child process ignores a clean
  `SIGTERM` and has to be escalated to `SIGKILL` after a one-second grace period, the result carries
  that flag; a clean bounded stop simply omits it.
- **`pr-merge` accepts an optional `payload.subject`, valid only for `delivery.mergeMethod: squash`.**
  Supplying it together with `merge` or `rebase` fails with `INVALID_PAYLOAD`. It pins the squash
  commit's subject to the verified pull-request title: a repository configured with
  `COMMIT_OR_PR_TITLE` would otherwise publish a single commit's subject instead, and release-please
  reads that subject.
- **`pr-merge` re-verifies the head itself.** Before merging, it performs its own read of the
  current head SHA and fails with `STALE_WRITE` if it no longer matches the SHA the caller
  verified – in addition to the provider-side `--match-head-commit` guard. A human pushing to the
  branch while the gate was working is therefore caught twice, not once.
- **`pr-merge` reports a head SHA only when a provider stated it.** On GitHub `--match-head-commit`
  makes the request itself exact – the server refuses any other head – so an accepted merge
  corroborates the requested SHA and `headSha` always carries it. Forgejo has no equivalent the
  server is bound to honour: one older than the Gitea 1.16 API surface silently ignores
  `head_commit_id`, so an accepted merge reads the pull request back once (bounded at 30 seconds,
  reported as the `head-read-back` entry of `data.steps` beside the merge that stays `data.command`)
  and reports `headSha` only when that read states a head equal to the requested one. Otherwise the
  field is **omitted** and a `headShaUnconfirmed` field says why: `differs` when the read-back stated
  a usable head that is not the requested one, `unavailable` when it could state no head at all – it
  failed, timed out, or answered without one. A differing head is never adopted, because it has two
  indistinguishable causes: the ignored `head_commit_id`, and a push that landed right after a
  correct merge. **An absent `headSha` is not a failure signal.** `merged: true` is decided by the
  HTTP status and the empty response body, never by the read-back, so a merge that went through is
  reported as such whatever the read-back did; `headShaUnconfirmed` appears only where `headSha` is
  omitted, and only on Forgejo.
- **A failed `pr-merge` reports `retryable: false`, and `mutationMayHaveSucceeded: true` whenever the
  outcome is genuinely unknown.** The forge may have accepted the merge before the connection
  dropped, so a second attempt could act on a state nobody verified. Re-read the pull-request state
  and report what it shows – never blind-retry the mutation. On Forgejo the merge is an HTTP request
  whose status the adapter reads, so a refusal the server actually stated is reported as what it is:
  a rejection for a moved head (409) becomes `STALE_WRITE` with `merged: false`, and a rejection for
  merge style or permission carries `mutationMayHaveSucceeded: false`. Only a merge whose outcome the
  adapter could not observe at all – a transport failure – carries `true` there.

## Interplay with issue-driven tools

Besides `/effective-flow review`/`/effective-flow apply`, [`/effective-flow apply` (issue mode)](./tools-implement.md)
and [`/effective-flow plan-issue`](./tools-understand.md#effective-flow-plan-issue) also work on the
resolved tracker target – but for **arbitrary** issues, not only for findings created by Effective
Flow. These two tools are inherently tracker-bound: they do not evaluate whether findings are kept
locally, and always need a reachable tracker. On the forge target that means a Git repository with
an `origin` remote and an authenticated CLI; on an external target it means the resolved connection
of that tool.

Delivery stays with the forge in either case: these tools create branches and pull requests on
`origin`, reference the issue by its identifier in the PR body, and post the PR link back as a
comment on the issue.

When `plan-issue` has created native children, the parent becomes a container. Issue-mode `apply`
reads the canonical parent comment and native relationship fresh, then requires an exact one-to-one
match between active records and native children. An active decomposition keeps the parent
container-only even when the child list is empty. A malformed proposal record, proposed, approved,
or missing status, absent or detached child, marker diagnostic, duplicated identity, recorded-issue
mismatch, or unexpected key retains `effective-flow-needs-planning`, routes the parent back to
`plan-issue`, and expands neither parent nor children. Only a complete match expands the open
children; a verified native relationship still wins if the parent body also contains a checklist,
so the mechanisms are never mixed.

For an expanded child, the workflow in its canonical parent record is authoritative. Its body must
contain exactly one language-matching workflow field with the same stable value. Issue-mode `apply`
routes `Feature` to `build`, `Bugfix` to `fix`, `Refactoring` to `refactor`, and `Documentation` to
`docs` without reclassifying the child. A missing, duplicated, wrong-language, invalid, or
mismatched workflow field keeps the parent container-only and routes it back to `plan-issue`.

After clarity and approval, but immediately before the first implementation delegation, an
implementable issue advances at least to started. A forge issue receives the idempotent
`effective-flow-issue-in-progress` fallback label; an external issue moves to the freshly validated
native state selected by `tracker.externalStartedState`. Terminal, skipped, `wontfix`, and
container-only items are not moved. If the transition cannot be proved, implementation fails closed
before code changes. An issue that is already started or in a later active state stays there; the
workflow never moves it backwards. The delegated `build`, `fix`, `refactor`, or `docs` run does not
repeat this transition; its issue-owning `apply` workflow already performed it.

Every resulting pull request carries one strict, versioned lifecycle receipt in its body. The
receipt binds the issue references to the resolved tracker target and records the closing or
non-closing relationship plus any container mechanism. It contains no credentials or connection
details. A malformed, duplicated, cross-repository, or configuration-mismatched receipt authorizes
no tracker access and is never replaced by guessing identifiers from PR prose.

Once the pull request is confirmed merged, `merge-gate` gives tracker automation one fixed
30-second grace period and reads every receipted issue again. It never force-closes an issue. A
terminal forge issue loses its in-progress label. For a GitHub-native container, `merge-gate`
re-reads the parent, verifies that the completed issue is still its child, and reports the remaining
open children; GitHub derives parent progress from child state, so Effective Flow performs no
second completion write or checklist patch. External-native containers use only the connection's
previously proven completion operation. For an open, missing, mismatched, or unobservable issue,
the container remains unchanged and the report names the first observable closing step: an
intentional `Refs` relationship, open sub-items or checklist entries, the planning path, a
still-started external state, or the remaining terminal tracker transition. Run
`/effective-flow merge-gate <PR>` again to use its observer-only path when automation takes longer
or tracker access was unavailable.

## See also

- [Configuration](./configuration.md) – complete field reference for `tracker` and `mergeGate`
- [Quality tools](./tools-quality.md) – `/effective-flow review`
- [Delivery tools](./tools-deliver.md) – `/effective-flow merge-gate`
- [Implementation tools](./tools-implement.md) – `/effective-flow apply`
- [Troubleshooting](./troubleshooting.md) – missing or unauthenticated CLI, unresolved external
  connection
- [Glossary](./glossary.md) – finding, tracker target
