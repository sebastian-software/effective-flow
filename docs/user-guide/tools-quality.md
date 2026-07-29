# Tool reference: Ensure quality

This group comprises two tools: `review`, which checks existing code for quality and delivers
structured findings that serve directly as input for the implementation tools, and `pr-review`,
which drives an already-open pull request from ready-for-review to merged.

## `/effective-flow review`

**Purpose:** Orchestrates a comprehensive code review – or, when the argument clearly points to
a plan file, a deeper interactive plan review, or when it points to a concept file, the deep
concept review. In the code review, three
data-collection phases run in parallel: design-decision detection (ADRs, plans, conventions,
code comments, lint suppressions, earlier reviews), repository-native technical validation,
and per-file/domain qualitative reviewer passes. Afterwards the findings are
aggregated, filtered against documented design decisions (so that deliberate decisions
are not falsely reported as a problem), and reported.

Frontend JavaScript/TypeScript, Node.js, and Rust use specialist reviewers. Other clearly
identified product languages use the generic product reviewer after a visible reduced-depth
notice. Tooling-only files remain in technical validation, and mixed scopes keep every
recognized reviewer bucket. See [Language support](language-support.md).

**When to use:** Before a merge, after a larger implementation run, or whenever
a quality check of the code is wanted independently of a running workflow. Also
suitable to deeply cross-check an existing plan before implementation.

**Typical call:**

- `/effective-flow review` – without an argument: reviews uncommitted changes if present, otherwise the
  entire code
- `/effective-flow review <area>` – reviews only the described area
- `/effective-flow review <plan file>` – starts the deeper interactive
  plan review for that plan file instead
- `/effective-flow review <concept file>` – starts the deep concept review for that concept file
  instead: it elaborates the concept, clarifies decisions, and records the first work packages. An
  argument that matches both a plan and a concept is not guessed; the tool asks.

**Input/output:**

- The default finding scope is **critical + important only**; hints appear only with an
  explicitly requested comprehensive review.
- On the local tracker target (default): output is a report under
  `.effective-flow/review/review-report-YYYY-MM-DD[-N].md` with a finding table, severity,
  complexity, file+line, recommendation, and suggested follow-up action. Human-readable report
  fields and values use `language.workflow` consistently.
- On a tracker target (`tracker.mode: remote` for the Git forge, `external` for the tool named in
  the project setup): a finding issue per new finding plus a container that bundles them;
  already-present findings are deduplicated. Issue and comment prose uses `language.forge`. A local report is written only for security findings, which are never
  published on their own – see
  [Security findings stay local first](remote-tracker.md#security-findings-stay-local-first).
- Findings use repository-wide monotonic IDs (`R-0000001`, `R-0000002`, …) tracked in
  `.effective-flow/memory.json`. A review filters and deduplicates first, atomically reserves the
  exact range it needs, and only then publishes a local report or tracker issues. Parallel reviews
  therefore receive disjoint ranges. If publication fails after a reservation, the unused IDs
  remain as harmless gaps; Effective Flow never reuses them.

German and English reports remain readable. New reports and tracker issues localize their complete
human-readable template rather than mixing field names, headings, and displayed values. Finding
IDs, action values, labels, file paths, and other machine-facing tokens are identical in both
languages.

**Interplay:** Each finding carries a recommendation for the appropriate follow-up action –
`/effective-flow fix` (defect), `/effective-flow refactor` (structural problem), `/effective-flow build` (missing
functionality), or `/effective-flow docs` (documentation gap). The resulting report or the
epic is typically picked up via `/effective-flow apply`. The behavior and depth of the review
can be controlled via `review.profile` (`full`/`focused`/`fast`) in the project-setup ADR; see
[Configuration](configuration.md#block-review). The tracker targets are described in
[Remote tracker](remote-tracker.md).

## `/effective-flow pr-review [<PR reference>]`

**Purpose:** Shepherds an already-open pull request from "open" to "merged". `build`, `pr`, and
`review` create a pull request and can publish findings onto it, and `iterate` feeds review notes
back into it as new commits – but none of them decides when a pull request is genuinely ready and
presses merge. `pr-review` owns exactly that gap. It resolves the pull request, asks once whether
the run may merge at the end or only report merge-readiness, then drives an ordered gate:

1. **Check gate** – waits for pending checks and, once they complete, repairs any failure by
   delegating to `/effective-flow iterate`. A branch that has fallen behind its base is brought
   forward with a merge commit; a branch that conflicts with its base is reported, not repaired.
2. **Automatic-reviewer round** – for each configured bot (Greptile and comparable tools), re-
   triggers it if it has not yet run for the current head, then delegates its findings to
   `/effective-flow iterate`, which fixes the valid ones, replies, and resolves the threads.
3. **Human-comment guard** – if any unresolved comment or thread has a human author, the run
   implements no review note and merges nothing. CI repair stays permitted even then. A bot finding
   the run assesses but does not implement – because the guard is active, or because the finding was
   rejected – gets no thread reply at all: it is named in the run's chat summary instead, and the
   thread is left untouched and unresolved. See
   [Recognizing its own writes across runs](#recognizing-its-own-writes-across-runs).
4. **Merge** – only once every precondition holds (all checks green, the forge reports the pull
   request mergeable, the human guard is inactive, every configured bot has answered), the run
   merges with the configured merge method, guarded by the expected head commit.

**When to use:** On a pull request that is otherwise done and only needs CI to pass, its automatic
reviewers to be satisfied, and the merge button pressed – so you do not have to babysit checks and
bot notes by hand. Also useful as a pure merge-readiness report: run it in report mode to see
exactly what is still blocking a pull request.

**What it never does:** It never approves a pull request or submits a "request changes" review,
never rewrites history (no amend, rebase, squash, or force-push of the head branch – a branch
behind its base is only ever brought forward with a merge commit), and never merges past an open
human comment. It implements no code itself: every code change – CI repairs and bot-finding fixes
alike – is delegated to `/effective-flow iterate`.

#### Recognizing its own writes across runs

The human-comment guard only works if the gate can tell its own writes apart from a person's, and
it has to do that again on every later run – not only inside the run that wrote them. Two operating
modes exist:

- **App mode:** the gate posts as a dedicated bot account (planned, the way Greptile does today).
  Its writes are recognized by authorship alone – a login listed in `prReview.bots`, or a
  normalized bot account type – so no identity lookup is involved and nothing further is needed.
- **Manual mode (today):** the gate posts as the operator's own account, the same account a human
  might also comment from. Its one own write, the trigger comment posted in the automatic-reviewer
  round, is recognized by that account's authenticated identity **plus** an exact match against the
  configured `prReview.bots.<login>.trigger` text. A comment that matches only one of the two – the
  right account with different wording, or the right wording from a different account – does not
  count as the gate's own.

Because manual mode matches on exact wording, **the configured trigger text should be a distinctive
mention.** A generic value such as `please review` could be typed by a person who genuinely wants a
discussion; that comment would then match exactly and be excluded from the guard. A mention like
`@greptileai` does not have this problem.

Two further things worth knowing about what the gate writes:

- **A bot finding it assesses but does not implement gets no thread reply.** Whether the human
  guard is active or the finding was rejected, the gate reports that to you in the run's chat
  summary and writes nothing into the thread. Replies for findings the run does implement come from
  the delegated `iterate` run, not from the gate itself.
- **The gate writes no Effective Flow marker.** A marker in the raw comment body would keep
  announcing which tool composed it, so the trigger comment carries only the configured text and
  nothing else. Reading the raw body of anything the gate posted shows no tool or model attribution
  beyond the posting account itself.

**Typical call:**

- `/effective-flow pr-review` – resolves the pull request of the current branch
- `/effective-flow pr-review 42` / `/effective-flow pr-review #42` / a pull-request URL – resolves
  that specific pull request

**Input/output:**

- The entry question ("merge at the end, or only report merge-readiness?") is asked exactly once,
  at the start; a non-interactive run behaves as report-only.
- The result is either a merged pull request or a chat report naming the exact condition that is
  still blocking the merge (pending or failing checks, an unanswered bot, an open human comment, a
  non-mergeable state, or a squash-merge title that is not a Conventional Commit). The report also
  names every bot finding the run assessed but did not implement, since those get no thread reply.
- On GitHub, the check gate and the merge are performed by the remote-tracker helper described in
  [Remote tracker](remote-tracker.md#pr-review-gate-operations). Forgejo does not yet support the
  underlying operations, so a Forgejo run degrades to report-only there.

**Interplay:** Configured entirely under `prReview.*` in the project-setup ADR (completion mode,
check-wait timeout, round budget, bot registry) plus `delivery.mergeMethod`; see
[Configuration](configuration.md#block-prreview). Do not confuse `prReview.*` with the pre-existing
`delivery.prReview`, which controls whether a delivery workflow publishes its own findings onto the
pull request it just created – the two sit next to each other alphabetically but configure
different things.

## Further reading

- [Tools: Implement](tools-implement.md) – how findings feed into `fix`/`refactor`/`build`/`docs`
- [Language support](language-support.md) – specialist depth, reduced-depth review, and limitations
- [Configuration](configuration.md) – `review.*` keys in detail
- [Remote tracker](remote-tracker.md) – finding issues, epics, labels
