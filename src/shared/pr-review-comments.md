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

### Remote helper

Use the shipped `scripts/remote-tracker.mjs` helper and the envelope, dry-run, capability,
redaction, and error contract from `issue-tracker.md`. PR mode requires a successful provider
probe. `AMBIGUOUS_HOST` returns to the orchestrator for an explicit provider choice;
`CLI_MISSING`/`AUTH_FAILED` abort without side effects. Never assemble provider requests or
discover flags in the prompt.

### PR resolution

Resolve the target PR from the argument or the current branch and determine the PR number,
head branch, base branch, URL, and state:

- **From argument:** a PR reference is a bare number (`42`), `#42`, or a PR URL. A
  PR URL carries the segment `/pull/` (GitHub) or `/pulls/` (Forgejo) – this distinguishes it
  from an issue URL (`/issues/`).
- **From the current branch:** if no PR reference was passed, try to determine the open PR of the
  currently checked-out branch.

Use helper reference parsing followed by the normalized PR read/list operations. For current-
branch resolution, list open PRs for the exact head branch and require exactly one match.

If the PR is already `merged`/`closed`: report and push no commits (see error cases in
`{{SKILL:iterate}}`).

### Read review threads (always fresh)

Read the review comments **directly before** classification fresh from the host – comments
can change between runs. Capture per thread: thread ID, author (and whether bot or
human), file + line, comment text, and the `resolved` status.

Use the normalized review-thread read and PR-comment read operations. The normalized author
record includes `login`, `isBot`, and `authorType`; when Forgejo does not expose a bot flag and
the login has no canonical bot suffix, `authorType` is `unknown` rather than guessed as human.
If the provider reports that resolved status is unavailable, keep the item unresolved and expose
that limitation in the workflow summary; do not guess.

### Reply to a thread

Use the helper's review-thread reply operation. Every reply carries the marker
`<!-- effective-flow-iterate -->` (see idempotency).

### Resolve a thread

Use the helper's review-thread resolve operation. On `UNSUPPORTED_CAPABILITY`, keep the reply,
leave the thread unresolved, and note that manual resolution is needed; do not improvise.

### Post summary comment

Use the helper's PR-comment payload builder and PR-comment mutation. Per run, **exactly one**
summary comment with the marker `<!-- effective-flow-iterate -->` is
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
