# Tool reference: Ensure quality

This group comprises exactly one tool: `review`. It checks existing code for quality and
delivers structured findings that serve directly as input for the implementation tools.

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

## Further reading

- [Tools: Implement](tools-implement.md) – how findings feed into `fix`/`refactor`/`build`/`docs`
- [Language support](language-support.md) – specialist depth, reduced-depth review, and limitations
- [Configuration](configuration.md) – `review.*` keys in detail
- [Remote tracker](remote-tracker.md) – finding issues, epics, labels
