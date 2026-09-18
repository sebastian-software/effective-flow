# Tool reference: Ensure quality

This group comprises one tool: `review`, which checks existing code for quality and delivers
admitted structured findings that can serve as input for the implementation tools. The merge gate that
drives an already-open pull request from ready-for-review to merged is
[`/effective-flow merge-gate`](tools-deliver.md); it produces no findings of its own and therefore
belongs to [Deliver changes](tools-deliver.md).

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
- On the local tracker target (default): admitted findings are written to a report under
  `.effective-flow/review/review-report-YYYY-MM-DD[-N].md` with a finding table, severity,
  complexity, file+line, recommendation, and suggested follow-up action. An explicitly requested
  standalone audit may add the non-executable closed-observations appendix described below.
  Human-readable report fields and values use `language.workflow` consistently.
- On a tracker target (`tracker.mode: remote` for the Git forge, `external` for the tool named in
  the project setup): one direct issue per admitted root cause; no new review epic is created.
  Already-present findings are deduplicated. Issue and comment prose uses `language.forge`. A local report is written only for security findings, which are never
  published on their own – see
  [Security findings stay local first](remote-tracker.md#security-findings-stay-local-first).
- Admitted findings use repository-wide monotonic IDs (`R-0000001`, `R-0000002`, …) tracked in
  `.effective-flow/memory.json`. A review filters and deduplicates first, atomically reserves the
  exact range it needs, and only then publishes a local report or tracker issues. Parallel reviews
  therefore receive disjoint ranges. If publication fails after a reservation, the unused IDs
  remain as harmless gaps; Effective Flow never reuses them.

German and English reports remain readable. New reports and tracker issues localize their complete
human-readable template rather than mixing field names, headings, and displayed values. Finding
IDs, action values, labels, file paths, and other machine-facing tokens are identical in both
languages.

Before any finding receives an ID, report entry, issue, or executable next step, Effective Flow
classifies it as `current-scope`, `admitted`, `closed`, or `uncertain`. Current-scope work stays in
the active delivery; uncertain qualifying risk gets one bounded evidence/containment check; closed
observations create no work. Admission requires concrete current reachability and exactly one
reason: `material-harm` or `irreversible-commitment`. Severity and “important” are not admission
reasons. An explicitly requested standalone audit may keep closed observations in a short
non-executable appendix without IDs, actions, prompts, or an `apply` handoff.

**Interplay:** Each admitted finding carries a recommendation for the appropriate follow-up action –
`/effective-flow fix` (defect), `/effective-flow refactor` (structural problem), `/effective-flow build` (missing
functionality), or `/effective-flow docs` (documentation gap). The resulting report or direct
finding issue is picked up via `/effective-flow apply`. Legacy epics remain readable. The behavior and depth of the review
can be controlled via `review.profile` (`full`/`focused`/`fast`) in the project-setup ADR; see
[Configuration](configuration.md#block-review). The tracker targets are described in
[Remote tracker](remote-tracker.md).

## Further reading

- [Tools: Implement](tools-implement.md) – how findings feed into `fix`/`refactor`/`build`/`docs`
- [Tools: Deliver](tools-deliver.md) – `commit`, `pr`, and the `merge-gate` merge gate
- [Language support](language-support.md) – specialist depth, reduced-depth review, and limitations
- [Configuration](configuration.md) – `review.*` keys in detail
- [Remote tracker](remote-tracker.md) – direct finding issues, legacy epics, labels
