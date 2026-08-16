## Portable worker delegation

Names matching `effective-flow-<worker>` in this instruction identify bundled worker contracts, not installed custom-agent roles. When a worker is selected, read only its matching `workers/effective-flow-<worker>.md` file, then delegate through the host harness's built-in general-purpose subagent mechanism with that contract as the worker instructions. Do not request a custom role by the contract name. If built-in subagent delegation is unavailable, stop with a clear explanation; never claim that an undiscoverable worker ran.

## PR review publication

This shared building block publishes Effective Flow's own review findings onto an existing pull
request. Both entry points use it: the explicit `effective-flow review <PR>` invocation and the automatic
step that runs after a delivery created a pull request. It owns **which** findings are published,
which gates run first and in what order, the judgment handoff to `pr-review`, the trigger, and the
idempotency key.

Three of its four call sites — the delivery completion action, ``tools/apply-issues.md``, and
``tools/apply-review-remote.md`` — carry neither the PR plumbing nor the security gate in their own
context. This fragment therefore loads both itself instead of assuming a host supplied them:

## PR review comment integration

This shared building block connects Effective Flow workflows with the review comments of an
existing pull request (GitHub via `gh`, Forgejo via `tea`). It encapsulates the
**PR-specific plumbing** that `issue-tracker.md` deliberately does not contain: PR resolution,
reading review threads, replying to a thread, resolving a thread, submitting a review with inline
comments, posting a PR summary comment, reading the pull-request status, waiting for pending
checks, and merging the pull request.

It serves both directions plus the merge gate. **Inbound**, `effective-flow iterate` reads and answers
what others wrote. **Outbound**, "PR review publication" writes Effective Flow's own findings onto
the pull request; that fragment owns which findings are published and which gates run first, while
this one provides the operations. **The gate**, `effective-flow merge-gate`, reads status and checks,
waits, posts its configured bot trigger — its only own write onto the pull request's **discussion** —
and finally merges; it owns the ordered gate and the merge decision, while this one again provides
the operations. Its writes to the head **branch** are a different surface, bounded by that tool's own
Git write boundary and not by this building block.

Boundary to `issue-tracker.md`: that building block is tailored to **issues** and the tracker
target. PR review threads are a different API object. A workflow working on a pull request is
**inherently forge-bound**: it never evaluates the tracker target and merely needs a Git repository,
an `origin` remote, and an authenticated CLI. That makes it tracker-independent in the same way
``tools/apply-issues.md``/`effective-flow plan-issue` are tracker-**bound** — those two follow the
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
comments (for the inbound direction see the error cases in `effective-flow iterate`).

### Read review threads (always fresh)

Read the review comments **directly before** classification fresh from the host – comments
can change between runs. Capture per thread: thread ID, author (and whether bot or
human), file + line, comment text, and the `resolved` status.

Use the normalized review-thread read and PR-comment read operations. **Both** carry the same
normalized author record — a review-thread comment and a top-level pull-request comment are read
the same way here — and that record includes `login`, `isBot`, and `authorType`; when a provider
does not expose a bot flag and the login has no canonical bot suffix, `authorType` is `unknown`
rather than guessed as human. A comment whose author the provider does not state at all keeps that
same shape with an absent `login` and `authorType: unknown`; unlike a missing **viewer** identity,
it does not fail the read.

The two surfaces do not spell one bot account identically: GitHub's REST API reports it with the
`[bot]` suffix and its GraphQL API without. The record preserves whatever the provider reported —
`isBot` is decided by the account class the provider states, `type` on REST and `__typename` on
GraphQL, and the suffix is only the fallback for a payload that states no class — so a consumer
comparing a reported login against a configured one resolves it through "Matching a configured
login" instead of comparing the two strings literally.
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
`effective-flow merge-gate` is that consumer: its human-comment guard excludes an item whose author
`login` equals the authenticated one, and that login is the whole comparison — no body, no thread
state, no second author field takes part. Its trigger idempotency establishes that comment's author
by mode before it compares the body it posted: in manual mode through this same login comparison, in
app mode from the normalized `authorType` instead, because a gate posting as an app has no viewer
login to recognize itself by.

Do not scrape the login out of the probe's authentication-status output. That is human-readable CLI
prose, and this building block reads normalized JSON only.

**On Forgejo** the identity is read through the same `tea api` transport the gate's status read
uses, and the capability is reported from that transport probe rather than assumed. Forgejo states
no account class, so the viewer carries a `login` and no `type` — which is sufficient, because a
consumer compares the login and nothing else. Where the capability is absent, or a read fails, a
consumer that cannot establish the identity fails closed and treats an item it cannot prove to be
its own as someone else's.

### Reply to a thread

Use the helper's review-thread reply operation. It stamps the marker
`<!-- effective-flow-iterate -->` onto the reply body from its own marker table, idempotently, so
never write that marker by hand (see idempotency). This matters beyond tidiness: the marker is what a
later `effective-flow iterate` run reads to recognize a thread it has already answered, so an unstamped
reply leaves that thread looking unaddressed and it is classified, implemented, and replied to a
second time.

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
and the `effective-flow iterate` separation are exact string matches, so a hand-written variant silently
defeats both.

On `UNSUPPORTED_CAPABILITY` – Forgejo supports neither review submission (`review-create`) nor a
reply into a review thread (`review-thread-reply`); thread **resolution** it does support – fall
back to exactly one structured PR comment carrying the `file:line`
references in its text, and report the reduced fidelity; do not improvise a provider request. Build
that fallback comment with the helper's `pr-review-comment-build` operation, **not** with
`pr-comment-build`: the latter stamps `<!-- effective-flow-iterate -->`, the marker
`effective-flow iterate` reads as its own already-processed work.

### Post summary comment

Use the helper's PR-comment payload builder and PR-comment mutation. Per run, **at most one**
summary comment with the marker `<!-- effective-flow-iterate -->` is
posted: which points were implemented, which skipped, and which pure questions are listed as
open/deferred.

A delegating caller may suppress that comment, and `effective-flow merge-gate` does so for every round it
delegates. Four grounds carry that, none of them about how a later read classifies the author. One
summary comment per delegated round accumulates: a gated run may spend up to `mergeGate.maxRounds`
rounds, and that is noise on someone's pull request. Nothing is lost, because the reader of that pull
request receives the same content in the gate's own chat summary. The gate's stated guarantee — a
gate-initiated run leaves **at most one** item of its own on the pull request, its trigger comment —
is false the moment a delegated round adds a second. And a gate authenticated as a **different**
account than the delegated run reads that summary as someone else's, where it would hold the very
merge the delegation was meant to reach. The content is handed back to the caller instead of being
dropped.

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

Merging is the most irreversible mutation in this tool set and belongs to `effective-flow merge-gate`. It
is never used to work around a blocked merge state, and this building block still never approves a
pull request and never requests changes — not even to unblock a merge.

**Forgejo limitation:** of the three, only `pr-checks-wait` is unsupported there and returns
`UNSUPPORTED_CAPABILITY` — `tea` has no `checks` subcommand and Forgejo offers no server-side
blocking watch, so the gate takes its documented no-watch degradation (report the pending checks and
ask once) rather than improvising a poll loop. `pr-status-read` and `pr-merge` are supported:
the status read composes the pull-request object, the combined commit status and the head commit's
date, and the merge sends `head_commit_id` as the server-side head guard. Two further operations
this building block uses stay unsupported on Forgejo — `review-create` and `review-thread-reply` —
and the gate still fails closed on anything it cannot read, improvising no provider request.

### Idempotency via the Effective Flow markers

Two distinct HTML markers keep the directions and the writers apart:

- `<!-- effective-flow-iterate -->` on thread replies and the `effective-flow iterate` summary comment.
- `<!-- effective-flow-pr-review -->` on outbound inline review comments, the review body, and the
  top-level pull-request comment that carries the findings whose line lies outside the diff.

**A marker is stamped as the body's leading line, and only that position counts as a marker.** The
helper's payload builder prepends it, so every body this tool writes begins with it. A reader must
require that position rather than searching the whole body: both providers prefix a quoted body with
`>`, so a quote-reply carries a copied marker inside a blockquote where it no longer opens the body.
Treating a marker found anywhere as authoritative lets any person reproduce one by pressing quote —
which is how a reader that trusts a marker's mere presence ends up misreading a human's comment as
this tool's own.

**`effective-flow merge-gate`, the merge gate, writes no marker at all — by design, not by oversight.** A
marker left in a raw comment body keeps announcing which tool composed that comment, and removing
that disclosure is exactly why the gate's former third marker (`effective-flow-pr-gate`) is gone.
The gate's only own write onto the pull request's **discussion** is its configured trigger comment,
and it establishes that comment's authorship again through the authenticated login rather than
through anything in the body — evidence that discloses nothing and needs no persistence. Do not
reintroduce a gate marker. Its writes to the head **branch** — the two kinds of base-into-head merge
its Git write boundary sanctions — are on another surface and carry no marker either: a merge commit
uses Git's default message and announces no tool.

Both strings are **distinct and neither is a substring of the other**; every match is an exact
string match. Reusing one for another writer would make `effective-flow iterate` treat foreign replies as
its own already-processed work, or make the outbound direction suppress a finding it never
published.

The helper's marker table stamps both of them, so neither is ever written by hand: idempotency and
the `effective-flow iterate` separation are exact string matches that a hand-written variant silently
defeats. A caller that supplies a body itself — as `effective-flow merge-gate` does for its trigger
comment — must therefore not use the `pr` comment-kind builder, which stamps
`<!-- effective-flow-iterate -->`, the marker `effective-flow iterate` reads as its own already-processed
work.

Read the existing PR and review comments **fresh before every write**, in both directions: a
thread that is already `resolved` or carries an `<!-- effective-flow-iterate -->` reply is
considered done and is not processed again. A thread carrying `<!-- effective-flow-pr-review -->` is
Effective Flow's own output – `effective-flow iterate` skips it unless the user names it explicitly, and
the outbound direction uses it for repeat suppression. **Backcompat (one generation):** a
still-present old marker `<!-- firmo-iterate -->` from an earlier run is recognized as equivalent to
`<!-- effective-flow-iterate -->` on read (no double processing of in-flight threads); newly written
is exclusively `<!-- effective-flow-iterate -->`. This keeps a second `effective-flow iterate` run on the
same PR clean.

### No history rewriting

New work goes exclusively as **new commits** onto the PR head branch and is pushed normally –
consistent with `effective-flow pr` and "Updating existing PRs" in the delivery
and worktree integration. No `commit --amend`, no rebase, no squash, no force-push.
If the push is rejected because of diverged remote history, stop and report the conflict
instead of overwriting history.

A head branch that has fallen **behind** its base is brought forward the same way: merge
`origin/<base>` into the head branch as a merge commit and push normally. That merge, performed by
`effective-flow merge-gate`, is the sanctioned repair; a rebase or a force-push of the head branch is not,
whatever the forge suggests.

A head branch that **conflicts** with its base is brought forward by the same merge, with its
conflicts resolved inside it: that is the **second** sanctioned repair, likewise performed by
`effective-flow merge-gate` and scoped to it – no other workflow resolves a conflict on a head branch.
It changes nothing about the rule above: the result is still one ordinary merge commit pushed
normally, and a resolution that would need a rebase, a squash, an amend, or a force-push to succeed
is reported instead of performed.

## Security disclosure gate

Security findings are never published to an issue tracker automatically. An issue for an unfixed
vulnerability describes it with file, line, problem, and a ready-made reproduction prompt, is
visible to everyone with read access, and is propagated through notifications, mail, feeds, and
mirrors — deleting it later does not undo the disclosure.

This fragment owns the classification, the local-first persistence, and the publication offer. The
cross-publisher contract lives in "Issue-tracker integration (remote mode)"; the artifact
lifecycle stays with the calling workflow.

### Classification

Classify every finding that survives confidence, scope, and design-decision filtering:

- `local-only` for every security-relevant finding, `publishable` for every other finding.
- Use the `Security relevance` value reported by the reviewer as a signal and check it against the
  finding's own area, problem, and recommendation. You may **escalate** a finding the reviewer
  marked `internal` or `none`; you may **never** de-escalate one marked `external`.
- Mark each `local-only` finding as `external` (reachable through untrusted input, a network
  boundary, or an auth boundary) or `internal`.
- A missing, unknown, or uncertain value classifies as `local-only`. In doubt, hold it back.
- Classify technical findings from a validator stream too; they never pass through a reviewer.
- Classification decides only **where** a finding is recorded. It never removes a finding, changes
  its severity, or alters the active finding scope.

The classification is a judgment, not a taxonomy: it rests on the reviewer signal plus the finding
text. The conservative default is the safeguard, at the price of occasionally withholding a
harmless finding.

### Local dedup

A withheld finding was never published, so remote dedup cannot see it and a re-run would mint a
new ID for the same problem. Before the calling workflow reserves IDs, compare each `local-only`
finding's normalized `Signature` against the finding blocks of the existing reports below
`<RUNTIME_STATE_ROOT>/.effective-flow/review/`. An exact match reserves no new ID and is not
written again; report it as already recorded, naming the existing report file and its finding ID.
Existing reports are read only here — this step never rewrites them, and each run writes its own
report file.

### Local-first persistence

After reservation and before any tracker mutation, persist the `local-only` findings, so a
declined offer, a CLI failure, or an interrupted session cannot lose them:

1. **Write the report.** Use the calling workflow's report path, guard, and collision mechanics,
   with the file name `review-report-YYYY-MM-DD-security[-N].md`. The `review-report-` prefix keeps
   the apply routing and the design-decision globbing intact. The report uses `language.workflow`
   even when the run's remote artifacts use `language.forge`; each artifact stays complete in its
   own language.
2. **Report fields.** Every finding block carries its `Security` field with the exposure value, and
   a report holding at least one security finding carries the disclosure banner directly below the
   header fields — for example
   `> **Security notice:** This report contains unpublished security findings. Do not paste it into public issues, pull requests, or chats.`
   or the German
   `> **Sicherheitshinweis:** Dieser Bericht enthält unveröffentlichte Sicherheitsbefunde. Nicht in öffentliche Issues, Pull Requests oder Chats einfügen.`
   The exposure values `external`, `internal`, and `none` are machine tokens and stay unlocalized.
3. **If the report cannot be written**, publish the `publishable` findings as usual, publish
   nothing from the withheld set, and output the withheld findings in the chat with an explicit
   warning that they were **not** persisted, the blocked path, the pointer to `effective-flow setup`,
   and the instruction to re-run after the repair. Do not offer publication in this state.

### Publication offer

Only when at least one `local-only` finding remains, present the withheld findings by ID,
severity, and short title, then ask. Keeping them local is the default: an unanswered, skipped, or
non-interactive run publishes nothing from the withheld set. The offer is per run and is not
remembered — a stored decision would silently suppress a finding that later grows more severe.

If at least one local-only finding remains after the security classification: Ask the user: **Publish the withheld security findings as issues as well? They are already saved locally. A public tracker entry describes an unfixed vulnerability with file, line, and reproduction prompt, is visible to everyone with read access, and is propagated through notifications, mail, feeds, and mirrors, so deleting the issue later does not undo the disclosure.**
- Keep local -- Default — the findings stay solely in the local report; no issue is created for them
- Publish as issues -- The withheld findings are additionally created as issues in this run's epic, with the disclosure accepted

On `Keep local`, publish only the `publishable` findings. On `Publish as issues`, treat the
withheld findings as publishable for this run, so a single epic covers both groups and the epic
invariant "an existing epic is never extended" holds. Afterwards append to each affected finding
block of the just-written report a publication note as its last entry, in the preserved report
language and analogous to the review-report backlinks; guard the report path again immediately
before that write. The note is machine-recognizable so the local apply route can skip an
already-published finding:

- English: `🔓 Published as #<issue number> on YYYY-MM-DD`
- German: `🔓 Veröffentlicht als #<issue number> am YYYY-MM-DD`

### Silence in public artifacts

The epic body and every issue body contain no count, title, signature, ID, or other reference to a
finding that stayed local. A public "N security findings withheld" line is itself an exploitable
signal. The withheld count belongs solely in the local report and the chat summary.

### Boundary

The gate covers the publication of review findings. It does not sanitize branch names, commit
subjects, or pull request bodies of a later fix — that disclosure decision belongs to the
delivering workflow and its user.

The loaded "PR review comment integration" owns PR resolution, the fresh thread and comment reads,
the review submission with its marker and its provider fallbacks, the summary comment, the
`language.forge` rule, and the "No AI attribution" rule — and through it the host detection, CLI
probing, envelope, dry-run, redaction, and error contract of the "Remote helper contract" in
`issue-tracker.md`. The loaded "Security disclosure gate" owns the security classification, the
local-first persistence, and the per-run publication offer. None of that is restated here. Pull
requests stay on the forge behind `origin` regardless of `tracker.mode`.

### Inputs

The caller supplies a **resolved pull request** (number, head ref, base ref, URL, state), its **run
state** — gated or non-interactive delegation — and exactly one of these three **input states**:

- **`finding-set`** — the caller's residual findings: what survived its own correction rounds, not
  its full finding history. Publish the survivors of the handoff and the gates below.
- **`reviewed-empty`** — the caller reviewed and nothing survived. Publish nothing and do **not**
  fall back to a fresh review; an empty result is a result, not a missing input.
- **`no-review-capability`** — the caller has no reviewer phase that could produce such a set. This
  fragment reviews the pull request itself and then publishes.

Resolve the state from the caller's declaration, not from the size of the set it handed over: an
**empty** set from a review that did run is `reviewed-empty`, while a declaration that the workflow
supplies **no complete finding set** is `no-review-capability`. `effective-flow fix` and `effective-flow docs`
make that declaration deliberately — `fix` routes only ``effective-flow-generic-product-reviewer`` for
degraded buckets, so its specialist buckets carry no reviewer findings, and `docs` has no review
phase at all. The three state names are stable identifiers and are never translated.

A merged or closed pull request, or one belonging to another repository, is reported read-only; no
comment is written.

### Rooted ref reads

Resolve all reviewed content from explicit refs, run from `RUNTIME_STATE_ROOT` — the verified main
checkout of the execution-location receipt — and never from `EXECUTION_ROOT` and never from a
working tree:

- `git diff <base>...<head>` for the change set, `--name-only` for the file list;
- `git show <head>:<path>` for file content.

By the time the automatic trigger fires, the delivery contract has already **withdrawn an Effective
Flow-owned worktree** in its step 4, so `EXECUTION_ROOT` may no longer exist at all, and its step 6
**restores the checkout** to the base branch, so working-tree content would be base-branch content.
The retained delivery branch stays in the main checkout, so `RUNTIME_STATE_ROOT` resolves both refs.
If a ref does not resolve there, report that and publish nothing rather than reading a different
tree.

### Reviewing the pull request (`no-review-capability` only)

This is the only input state in which this fragment starts reviewers. Both callers that reach it
already carry the project-routing contract: partition the pull request's changed files with that
ordered routing table and start, in parallel, the reviewer the table assigns to each non-empty
bucket, with the file content resolved through the rooted `git show` reads above. The resulting
findings then enter the same pipeline as a `finding-set` — same handoff, same gates, same
publication — and the scope rule below applies to them too.

### Order of operations

Regardless of entry point, run exactly this order and publish nothing before it completes:

1. **Finding scope.** Apply `effective-flow review`'s active finding scope — critical and important by
   default — to the incoming set. This binds every entry point: `effective-flow build`,
   `effective-flow refactor`, and `effective-flow maintain` deliberately collect **all** severities including
   notes for their internal correction rounds, and that deeper set must not reach a public pull
   request unmodified. Mention the notes this filter removes in the run summary, never on the pull
   request.
2. **Judgment handoff** to `pr-review`.
3. **Design-decision filter** — a finding covered by a documented design decision is not published.
   Which side runs it depends on the caller, so the caller declares it: `effective-flow review` filters
   centrally in its Phase 3 and hands over an already-filtered set. `effective-flow build`,
   `effective-flow refactor`, and `effective-flow maintain` run **no** such filter in their review phases, so
   for their sets this fragment performs the filter itself before publishing — search the ADR
   directories, the plan directory, and the repository convention files for documented decisions and
   drop every finding one of them covers, recording the source reference in the run summary. Do not
   assume `effective-flow review` Phase 3 is loaded here; at the automatic call sites it is not.
4. **Security classification and the loaded "Security disclosure gate".**
5. **Publication.**

### Judgment handoff to pr-review

`pr-review` is the declared domain owner for PR-level review-item judgment. Pack each finding as a
Mode C item with its stable ID, its location, and surrounding-code evidence resolved from the refs
above. Supply the caller constraints: Effective Flow owns authority, approval, publication, and
delivery; the analysis performs no discovery, implementation, Git, CI, or forge action and may only
classify the supplied context.

Consume the returned `pr-review-handoff/v1` object and require exactly one returned item per
supplied ID. Map its classifications:

- `valid_in_scope` + `caller_fix` → earns a comment on this pull request.
- `valid_out_of_scope` → a noted follow-up in the run summary, never a comment.
- `unsupported` → a rejected false positive; record the returned rationale and publish nothing.
- `question_or_information` → reported to the user, never posted as a defect.
- `needs_evidence` → dropped, with the exact missing proof recorded.

If `pr-review` is unavailable (not installed, `skills.enabled: false`, excluded), publish the
findings that survive the remaining steps and disclose that the PR-level judgment was unavailable.
Never invent the missing classification.

### Security binding

Step 4 runs the loaded "Security disclosure gate" on every finding still standing. A finding set
that arrives **without a recorded security classification** is classified there before anything is
published: `build`, `refactor`, and `maintain` hand over residual findings that never passed through
that classification, and an unclassified finding is never treated as publishable. A finding that
already carries a recorded class from the caller's own aggregation keeps it and is not re-derived.

A `local-only` finding reaches a pull request only after the gate's explicit per-run confirmation,
and **no configuration key changes that** — `delivery.prReview` included. Withheld findings stay in
the local security report, and nothing published here carries a count, title, signature, or ID of a
withheld finding.

### Publication

The loaded "Submit a review with inline comments" performs the submission; this fragment decides its
content. The helper's payload builder stamps the marker — never hand-write it.

- Each inline comment is anchored to the finding's `file:line` **inside the diff**.
- A finding on a line **outside the diff** cannot be anchored onto a wrong line. It does not go into
  the review body either: the review body is not readable through the plumbing's read operations, so
  a finding parked there would be invisible to the idempotency check below and republished on every
  rerun. Publish those findings as one additional marked pull-request comment instead, built through
  the loaded `pr-review-comment-build` operation, under a clearly labelled section. The review body
  stays human-facing prose and carries no idempotency key.
- **Every published finding, inline or outside the diff, carries its key.** Below the stamped
  marker, its body holds the finding's stable ID, its severity, its problem and recommendation
  prose, and — as its last line — the idempotency key in the canonical finding-issue form of
  `issue-tracker.md`:
  `- **Signature**: <path:line> · <Area> · <short summary of the problem>`. A finding published
  without that line cannot be recognized next run and is posted a second time.
- **Empty result:** on the explicit `effective-flow review <PR>` entry point, publish one short summary
  anyway so the reviewed state is visible; on the automatic trigger, publish nothing and report the
  clean result in chat instead. A submission with no inline comment at all — also the case when every
  survivor lies outside the diff — stays a review submission with an empty comment array; the loaded
  plumbing requires a review body and accepts the comment array as optional, so no separate
  publication path is needed for it.

### Idempotency

Read **fresh before every write**, and read both surfaces this fragment publishes to: the inline
review threads and the ordinary pull-request comments. Together they cover every published finding,
because outside-diff findings are published as a marked pull-request comment rather than in the
review body — a review body is not readable through those operations and would silently escape this
check.

Parse the `Signature` lines of the marked results with the helper's `signature-parse` operation and
compare the normalized values it returns; never hand-roll the normalization. A finding whose
normalized signature already appears under this fragment's marker is not published again. No new
persistence is introduced — the pull request itself is the state.

### Automatic trigger after delivery

Governed by the configuration key `delivery.prReview` with the values `ask` (default), `always`, and
`off`:

- `always` — publish after PR creation without asking, in every run state.
- `off` — no automatic publication. This disables the automatic trigger only; an explicit
  `effective-flow review <PR>` invocation is never affected.
- `ask` — resolved by the run state:
  - **gated** — ask exactly once with the question below.
  - **non-interactive delegation** — the state any higher-level orchestrator creates when it
    delegates a workflow non-interactively; the authoritative list of those orchestrators is the
    one in the documentation-sync contract. Publish nothing and report that the question could not be posed, naming
    `delivery.prReview: always` as the setting that would authorize publication in such a run. This
    follows the loaded gate, where an unanswered, skipped, or non-interactive run publishes nothing.

If a delivery created or reused a pull request, `delivery.prReview` is `ask` or unset, and the run is gated: Ask the user: **Publish this run's review findings as comments on the pull request?**
- Yes -- Submit the surviving findings as inline comments plus a summary on the pull request
- No -- Leave the pull request without comments; the findings stay in this run's report

Run nothing when the push or the PR creation failed — there is nothing to comment on. When
`effective-flow pr` reused an existing pull request rather than creating one, the trigger still runs; the
fresh read above decides what is genuinely new.
