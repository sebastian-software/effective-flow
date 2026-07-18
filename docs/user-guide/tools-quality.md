# Tool reference: Ensure quality

This group comprises exactly one tool: `review`. It checks existing code for quality and
delivers structured findings that serve directly as input for the implementation tools.

## `/effective-flow review`

**Purpose:** Orchestrates a comprehensive code review – or, when the argument clearly points to
a plan file, a deeper interactive plan review. In the code review, three
data-collection phases run in parallel: design-decision detection (ADRs, plans, conventions,
code comments, lint suppressions, earlier reviews), technical validation
(TypeScript/lint/build), and a project-type-appropriate reviewer pass. Afterwards the findings are
aggregated, filtered against documented design decisions (so that deliberate decisions
are not falsely reported as a problem), and reported.

**When to use:** Before a merge, after a larger implementation run, or whenever
a quality check of the code is wanted independently of a running workflow. Also
suitable to deeply cross-check an existing plan before implementation.

**Typical call:**

- `/effective-flow review` – without an argument: reviews uncommitted changes if present, otherwise the
  entire code
- `/effective-flow review <area>` – reviews only the described area
- `/effective-flow review <plan file>` – starts the deeper interactive
  plan review for that plan file instead

**Input/output:**

- The default finding scope is **critical + important only**; hints appear only with an
  explicitly requested comprehensive review.
- In local tracker mode (default): output is a report under
  `.effective-flow/review/review-report-YYYY-MM-DD[-N].md` with a finding table, severity,
  complexity, file+line, recommendation, and suggested follow-up action.
- In remote tracker mode (`tracker.mode: remote`): no local report, but instead a
  finding issue per new finding plus an epic issue that bundles them; already-present
  findings are deduplicated.
- Findings are numbered sequentially (`R-0000001`, `R-0000002`, …) and tracked in
  `.effective-flow/memory.json`.

**Interplay:** Each finding carries a recommendation for the appropriate follow-up action –
`/effective-flow fix` (defect), `/effective-flow refactor` (structural problem), `/effective-flow build` (missing
functionality), or `/effective-flow docs` (documentation gap). The resulting report or the
epic is typically picked up via `/effective-flow apply`. The behavior and depth of the review
can be controlled via `review.profile` (`full`/`focused`/`fast`) in `.effective-flow/config.json`,
see [Configuration](configuration.md). Remote mode is described in
[Remote tracker](remote-tracker.md).

## Further reading

- [Tools: Implement](tools-implement.md) – how findings feed into `fix`/`refactor`/`build`/`docs`
- [Configuration](configuration.md) – `review.*` keys in detail
- [Remote tracker](remote-tracker.md) – finding issues, epics, labels
