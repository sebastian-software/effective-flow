## PR review comment integration

This shared building block connects Effective Flow workflows with the review comments of an
existing pull request (GitHub via `gh`, Forgejo via `tea`). It encapsulates the
**PR-specific plumbing** that `issue-tracker.md` deliberately does not contain: PR resolution,
reading review threads, replying to a thread, resolving a thread, submitting a review with inline
comments, posting a PR summary comment, reading the pull-request status, waiting for pending
checks, and merging the pull request.

It serves both directions plus the merge gate. **Inbound**, `{{SKILL:iterate}}` reads and answers
what others wrote. **Outbound**, "PR review publication" writes Effective Flow's own findings onto
the pull request; that fragment owns which findings are published and which gates run first, while
this one provides the operations. **The gate**, `{{SKILL:pr-review}}`, reads status and checks,
waits, posts its configured bot trigger — its only own write — and finally merges; it owns the
ordered gate and the merge decision, while this one again provides the operations.

Boundary to `issue-tracker.md`: that building block is tailored to **issues** and the tracker
target. PR review threads are a different API object. A workflow working on a pull request is
**inherently forge-bound**: it never evaluates the tracker target and merely needs a Git repository,
an `origin` remote, and an authenticated CLI. That makes it tracker-independent in the same way
`{{SKILL:apply-issues}}`/`{{SKILL:plan-issue}}` are tracker-**bound** — those two follow the
resolved target, while PR work always stays on the forge. The **host detection, CLI probing, and
availability check** are taken from the "Remote helper contract" in `issue-tracker.md` (not
reinvented); this building block only adds the PR operations.

Pull requests, PR comments, and PR review threads are code-host objects and stay with the forge
behind `origin` even when the tracker target is `external`; a tracker target never redirects them
to another tool.

### No AI attribution

Do not add AI attribution to thread replies, review comments, or the summary comment: no „Generated
with Claude Code/Codex" footers, no agent session links (e.g. `https://claude.ai/code/…`),
and no `Co-Authored-By` trailers – not even when the harness appends them as a default.
Reply texts in natural language according to the language rules.

Resolve `language.forge` once for newly authored remote prose. A reply preserves the clearly
recognizable language of the existing thread; otherwise it uses `language.forge`. The per-run
summary comment and every outbound review comment and review body use `language.forge`. HTML
markers, thread IDs, states, finding IDs, and helper payload fields remain stable and are never
translated.

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

If the PR is already `merged`/`closed`: report it and perform no write – no commits and no
comments (for the inbound direction see the error cases in `{{SKILL:iterate}}`).

### Read review threads (always fresh)

Read the review comments **directly before** classification fresh from the host – comments
can change between runs. Capture per thread: thread ID, author (and whether bot or
human), file + line, comment text, and the `resolved` status.

Use the normalized review-thread read and PR-comment read operations. The normalized author
record includes `login`, `isBot`, and `authorType`; when Forgejo does not expose a bot flag and
the login has no canonical bot suffix, `authorType` is `unknown` rather than guessed as human.
If the provider reports that resolved status is unavailable, keep the item unresolved and expose
that limitation in the workflow summary; do not guess.

Normalized pull-request comments, review threads, and thread replies additionally carry
`createdAt`, an RFC-3339 timestamp, whenever the provider exposes one; an unexposed value is absent
rather than guessed. It is the only freshness evidence these reads provide – a reaction carries
none – so a consumer that needs "newer than the current head" compares it against
`headCommittedAt` from `pr-status-read` and fails closed when either side is missing.

**The author record is the only authorship evidence.** A body never is: an Effective Flow marker
inside a comment says which workflow's write it repeats, not who wrote that comment, and a
quote-reply copies a quoted body verbatim, marker included. Decide "who wrote this" from `login`
and `authorType` — and, where the question is "did _I_ write this?", by comparing that `login`
against the authenticated identity below.

### Read the authenticated identity

Use the helper's `viewer-read` operation (capability key `viewerRead`). It is a **read**, not a
mutation, so it needs no `apply` gate. It returns the login the provider CLI is authenticated as
plus that account's type, which lets one call tell a caller whether it is posting as a bot or as a
person. A value the provider does not expose stays absent rather than being guessed.

This is the only authorship evidence that **survives a run**. The ID a mutation returned identifies
a write only inside the run that performed it, so a workflow asking "did I write this on an earlier
run?" has nothing to compare it against and must use the authenticated login instead.
`{{SKILL:pr-review}}` is that consumer: it pairs the login with the exact configured body of its
trigger comment.

Do not scrape the login out of the probe's authentication-status output. That is human-readable CLI
prose, and this building block reads normalized JSON only.

**Forgejo limitation:** `viewerRead` is unsupported there and returns `UNSUPPORTED_CAPABILITY`. A
consumer that cannot establish the identity fails closed and treats an item it cannot prove to be
its own as someone else's.

### Reply to a thread

Use the helper's review-thread reply operation. Every reply carries the marker
`<!-- effective-flow-iterate -->` (see idempotency).

### Resolve a thread

Use the helper's review-thread resolve operation. On `UNSUPPORTED_CAPABILITY`, keep the reply,
leave the thread unresolved, and note that manual resolution is needed; do not improvise.

### Submit a review with inline comments

The outbound direction. Use the helper's review-create operation (`review-create`, capability key
`reviewCreate`): **one** review submission per run, carrying a review body plus an optional array of
inline comments anchored to `file:line`. The body is mandatory, the comment array is not, so a
body-only submission is valid. Never approve and never request changes – the submission carries
comments only.

The helper stamps the marker `<!-- effective-flow-pr-review -->` onto the review body and every
comment body from its own marker table, idempotently. Never write that marker by hand: idempotency
and the `{{SKILL:iterate}}` separation are exact string matches, so a hand-written variant silently
defeats both.

On `UNSUPPORTED_CAPABILITY` – Forgejo does not support review submission, just as it does not
support thread resolution – fall back to exactly one structured PR comment carrying the `file:line`
references in its text, and report the reduced fidelity; do not improvise a provider request. Build
that fallback comment with the helper's `pr-review-comment-build` operation, **not** with
`pr-comment-build`: the latter stamps `<!-- effective-flow-iterate -->`, the marker
`{{SKILL:iterate}}` reads as its own already-processed work.

### Post summary comment

Use the helper's PR-comment payload builder and PR-comment mutation. Per run, **at most one**
summary comment with the marker `<!-- effective-flow-iterate -->` is
posted: which points were implemented, which skipped, and which pure questions are listed as
open/deferred.

A delegating caller may suppress that comment, and `{{SKILL:pr-review}}` does so for every round it
delegates. The reason is the guard: the delegated run posts under the same account in manual mode,
so a summary comment left on the pull request would be a top-level, unresolvable item that the next
authorship evaluation counts as a human comment. The content is handed back to the caller instead of
being dropped.

### Read the pull-request status

Use the helper's `pr-status-read` operation (capability key `pullRequestStatus`). One call returns,
in one normalized envelope read at one instant: the head SHA, the base ref, the pull-request state,
the draft flag, a check list (name, status, conclusion, the required flag where the provider exposes
one, URL), the forge's own merge state, and `headCommittedAt` — the head commit's committer
timestamp as an RFC-3339 string. A value the provider does not expose is absent rather than guessed
— exactly as `authorType` is for bot detection. Reading checks and mergeability in one call is
deliberate: both values must be read at the same instant to be consistent.

`headCommittedAt` is the reference side of every "newer than the current head" question, paired with
the `createdAt` of a comment, thread, or reply. Both sides are required: with either one absent the
answer is unprovable, and a consumer treats it as "not newer" rather than assuming freshness.

Mergeability is read here, never inferred from the check list. A protected branch can additionally
require named checks, an approval, an up-to-date branch, or linear history, so "all checks green"
and "mergeable" are different statements. The forge's merge state is authoritative; a blocked state
is reported, never worked around.

### Wait for pending checks

Use the helper's `pr-checks-wait` operation (capability key `pullRequestChecksWait`). It blocks
inside the provider CLI until the checks are complete or the supplied timeout elapses and returns
the same normalized check list; a timeout is a normalized timeout result, not an error. It is a read
operation and needs an explicit timeout so it cannot hang a run indefinitely.

Never rebuild this wait as a prompt-driven poll loop around the status read: that spends a model
turn per interval for no additional information. On a timeout, or on `UNSUPPORTED_CAPABILITY`,
report the still-pending checks and ask the user once instead.

### Merge a pull request

Use the helper's `pr-merge` operation (capability key `pullRequestMerge`). It is a **mutation**, so a
run without `apply` produces a dry-run plan and merges nothing. It takes the pull-request number,
the merge method (`delivery.mergeMethod`), and the **expected head SHA**: the merge must apply to
exactly the commit that was verified, so a head that moved in the meantime fails closed instead of
merging a state nobody checked. Never re-run the mutation after a structured error carrying
`mutationMayHaveSucceeded: true` — re-read the pull-request state and report what it shows.

Merging is the most irreversible mutation in this tool set and belongs to `{{SKILL:pr-review}}`. It
is never used to work around a blocked merge state, and this building block still never approves a
pull request and never requests changes — not even to unblock a merge.

**Forgejo limitation:** `pr-status-read`, `pr-checks-wait`, and `pr-merge` are all unsupported there
and return `UNSUPPORTED_CAPABILITY`. The gate fails closed: it degrades to report-only, states that
reason, and improvises no provider request.

### Idempotency via the Effective Flow markers

Two distinct HTML markers keep the directions and the writers apart:

- `<!-- effective-flow-iterate -->` on thread replies and the `{{SKILL:iterate}}` summary comment.
- `<!-- effective-flow-pr-review -->` on outbound inline review comments and the review body.

**`{{SKILL:pr-review}}`, the merge gate, writes no marker at all — by design, not by oversight.** A
marker left in a raw comment body keeps announcing which tool composed that comment, and removing
that disclosure is exactly why the gate's former third marker (`effective-flow-pr-gate`) is gone.
The gate's only own write is its configured trigger comment, and it recognizes that comment again
through the authenticated login plus the comment's exact configured body — evidence that discloses
nothing and needs no persistence. Do not reintroduce a gate marker.

Both strings are **distinct and neither is a substring of the other**; every match is an exact
string match. Reusing one for another writer would make `{{SKILL:iterate}}` treat foreign replies as
its own already-processed work, or make the outbound direction suppress a finding it never
published.

The helper's marker table stamps both of them, so neither is ever written by hand: idempotency and
the `{{SKILL:iterate}}` separation are exact string matches that a hand-written variant silently
defeats. A caller that supplies a body itself — as `{{SKILL:pr-review}}` does for its trigger
comment — must therefore not use the `pr` comment-kind builder, which stamps
`<!-- effective-flow-iterate -->`, the marker `{{SKILL:iterate}}` reads as its own already-processed
work.

Read the existing PR and review comments **fresh before every write**, in both directions: a
thread that is already `resolved` or carries an `<!-- effective-flow-iterate -->` reply is
considered done and is not processed again. A thread carrying `<!-- effective-flow-pr-review -->` is
Effective Flow's own output – `{{SKILL:iterate}}` skips it unless the user names it explicitly, and
the outbound direction uses it for repeat suppression. **Backcompat (one generation):** a
still-present old marker `<!-- firmo-iterate -->` from an earlier run is recognized as equivalent to
`<!-- effective-flow-iterate -->` on read (no double processing of in-flight threads); newly written
is exclusively `<!-- effective-flow-iterate -->`. This keeps a second `{{SKILL:iterate}}` run on the
same PR clean.

### No history rewriting

New work goes exclusively as **new commits** onto the PR head branch and is pushed normally –
consistent with `{{SKILL:pr}}` and "Updating existing PRs" in the delivery
and worktree integration. No `commit --amend`, no rebase, no squash, no force-push.
If the push is rejected because of diverged remote history, stop and report the conflict
instead of overwriting history.

A head branch that has fallen **behind** its base is brought forward the same way: merge
`origin/<base>` into the head branch as a merge commit and push normally. That merge, performed by
`{{SKILL:pr-review}}`, is the sanctioned repair; a rebase or a force-push of the head branch is not,
whatever the forge suggests.
