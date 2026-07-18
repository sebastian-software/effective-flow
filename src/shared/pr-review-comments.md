## PR review comment integration

This shared building block connects `{{SKILL:iterate}}` with the review comments of an
existing pull request (GitHub via `gh`, Forgejo via `tea`). It encapsulates the
**PR-specific plumbing** that `issue-tracker.md` deliberately does not contain: PR resolution,
reading review threads, replying to a thread, resolving a thread, and posting a PR summary
comment.

Boundary to `issue-tracker.md`: that building block is tailored to **issues** and the
`tracker.mode` switch. PR review threads are a different API object.
`{{SKILL:iterate}}` is – like `{{SKILL:apply-issues}}`/`{{SKILL:plan-issue}}` – **inherently
remote** in PR mode and does not evaluate `tracker.mode`; it merely needs a
Git repository, an `origin` remote, and an authenticated CLI. The **host and
CLI detection** is taken from `issue-tracker.md` (not reinvented); this building block
only adds the PR operations.

### No AI attribution

Do not add AI attribution to thread replies or the summary comment: no „Generated
with Claude Code/Codex" footers, no agent session links (e.g. `https://claude.ai/code/…`),
and no `Co-Authored-By` trailers – not even when the harness appends them as a default.
Reply texts in natural language according to the language rules.

### Host and CLI detection

Determine the tool analogously to `{{SKILL:pr}}` and to "Host and CLI detection" in
`issue-tracker.md`:

1. **Precondition:** There is a Git repository with an `origin` remote present. If
   `origin` is missing or it is not a Git repository, PR mode is not possible: report clearly.
2. **Choose the tool:** Read the `origin` URL (`git remote get-url origin`) and extract the
   host robustly for HTTPS and SSH forms. If the host is exactly `github.com`, the tool is
   `gh`; for any other host, Forgejo/Gitea is assumed and `tea` is used. An
   explicit per-run hint from the user takes precedence for an ambiguous host (e.g. GitHub
   Enterprise); if the host is ambiguous and neither a hint nor an override is present,
   ask the user.
3. **Check availability:** Make sure the chosen CLI is installed and
   authenticated (`gh auth status` or `tea` with a configured login). If the CLI
   or the authentication is missing: emit a clear error message with a remediation hint and abort
   without side effect. Do **not** silently fall back to local work; a local
   fallback only after explicit user consent.

### PR resolution

Resolve the target PR from the argument or the current branch and determine the PR number,
head branch, base branch, URL, and state:

- **From argument:** a PR reference is a bare number (`42`), `#42`, or a PR URL. A
  PR URL carries the segment `/pull/` (GitHub) or `/pulls/` (Forgejo) – this distinguishes it
  from an issue URL (`/issues/`).
- **From the current branch:** if no PR reference was passed, try to determine the open PR of the
  currently checked-out branch.

| Operation              | GitHub (`gh`)                                                                       | Forgejo (`tea`)                                                     |
| ---------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Read PR from number    | `gh pr view <nr> --json number,headRefName,baseRefName,url,state,isCrossRepository` | `tea pr <nr>` or Forgejo API `GET /repos/<owner>/<repo>/pulls/<nr>` |
| PR from current branch | `gh pr view --json number,headRefName,baseRefName,url,state`                        | `tea pr list --state open` and filter by the head branch            |

If the PR is already `merged`/`closed`: report and push no commits (see error cases in
`{{SKILL:iterate}}`).

### Read review threads (always fresh)

Read the review comments **directly before** classification fresh from the host – comments
can change between runs. Capture per thread: thread ID, author (and whether bot or
human), file + line, comment text, and the `resolved` status.

| Operation                   | GitHub (`gh`)                                                               | Forgejo (`tea`)                                                                                   |
| --------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Read inline review comments | `gh api repos/<owner>/<repo>/pulls/<nr>/comments`                           | Forgejo API `GET /repos/<owner>/<repo>/pulls/<nr>/reviews` or `.../comments`                      |
| Read thread/resolved status | GraphQL `pullRequest.reviewThreads` (fields `id`, `isResolved`, `comments`) | best-effort via the Forgejo API; if the resolved status is not available, treat all as unresolved |
| Read PR-level comments      | `gh pr view <nr> --json comments`                                           | `tea pr <nr> --comments`, otherwise Forgejo API                                                   |

For the GraphQL query, determine `owner`/`repo` from the `origin` URL. For Forgejo, check the
exact flag/endpoint names against the installed `tea` version if a call
fails (as noted in `{{SKILL:pr}}`).

### Reply to a thread

| Operation                 | GitHub (`gh`)                                                                    | Forgejo (`tea`)                                                                     |
| ------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Reply to a review comment | `gh api repos/<owner>/<repo>/pulls/<nr>/comments/<comment-id>/replies -f body=…` | Forgejo API `POST /repos/<owner>/<repo>/pulls/<nr>/reviews` referencing the comment |

Every reply carries the marker `<!-- effective-flow-iterate -->` (see idempotency).

### Resolve a thread

| Operation             | GitHub (`gh`)                                               | Forgejo (`tea`)                                                                                                                                                    |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Resolve review thread | GraphQL mutation `resolveReviewThread(input: { threadId })` | best-effort; if the installed API/`tea` version does not support resolving, **only reply** and note in the summary that manual resolution is needed – **no abort** |

### Post summary comment

| Operation       | GitHub (`gh`)                 | Forgejo (`tea`)                             |
| --------------- | ----------------------------- | ------------------------------------------- |
| Post PR comment | `gh pr comment <nr> --body …` | `tea comment <nr> …`, otherwise Forgejo API |

Per run, **exactly one** summary comment with the marker `<!-- effective-flow-iterate -->` is
posted: which points were implemented, which skipped, and which pure questions are listed as
open/deferred.

### Idempotency via the Effective Flow marker

Replies and the summary comment carry the HTML marker `<!-- effective-flow-iterate -->`. Read
the existing PR and review comments **fresh before every write**: a thread that is
already `resolved` or carries an `<!-- effective-flow-iterate -->` reply is considered done and
is not processed again. **Backcompat (one generation):** a still-present old marker
`<!-- firmo-iterate -->` from an earlier run is recognized as equivalent on read (no
double processing of in-flight threads); newly written is exclusively
`<!-- effective-flow-iterate -->`. This keeps a second `{{SKILL:iterate}}` run on the same PR
clean.

### No history rewriting

New work goes exclusively as **new commits** onto the PR head branch and is pushed normally –
consistent with `{{SKILL:pr}}` and "Updating existing PRs" in the delivery
and worktree integration. No `commit --amend`, no rebase, no squash, no force-push.
If the push is rejected because of diverged remote history, stop and report the conflict
instead of overwriting history.
