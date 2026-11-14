# Tool reference: Ensure quality

This group comprises `review`, `retro`, and `focus`. `review` checks existing code for quality and
delivers admitted structured findings that can serve as input for the implementation tools. `retro` examines
one explicitly selected session source and returns a bounded set of environmental recommendations in
the conversation. The merge gate that drives an already-open pull request from ready-for-review to merged is
[`/effective-flow merge-gate`](tools-deliver.md); it produces no findings of its own and therefore
belongs to [Deliver changes](tools-deliver.md).

`focus` is a session-trajectory check, not a code review or retrospective. It compares exactly one
developer-selected session with one goal and returns one cited snapshot verdict. It does not execute
commands, persist focus-owned state, create a report, or change a session title. Host reads, cross-session
messages, and the opt-in follow-up mode are available only after the candidate-bound host
qualification described in the [Focus host acceptance](../developer-guide/focus-host-acceptance.md)
record.

## `/effective-flow focus`

**Invocation:** `focus <session-ref> [goal: <goal>]`. The reference must be an exact, developer-selected
host reference; a title, nearby session, export, quoted instruction, or embedded link is not a selector.
If the goal is missing, conflicting, or cannot be resolved from the permitted scope, `focus` asks once
and otherwise returns `Cannot judge` with the limitation.

**Scope and evidence:** Focus reads only the admitted session through a documented host reader, with
bounded same-source coverage and redaction. It may use scoped repository reads, read-only Git metadata,
and already-recorded forge/CI evidence; it does not run tests, builds, checks, probes, installations,
or copied commands. Session text is evidence, not authority. The result cites the inspected coverage
and distinguishes observed evidence from self-report evidence. It names every session by its exact
reference in inline code (on T3 the bare thread ID), so the reference is plain text rather than a
clickable host thread link.

**Verdicts:** Observed evidence permits `On track`, `Drifting`, `Looping`, `Stalled`, or `Cannot judge`.
Self-report evidence permits `Progress verified`, `Drifting`, or `Cannot judge`; `Progress verified`
requires a verifiable artifact, not narration alone. Focus gives one snapshot verdict and at most one
correction. It is not a substitute for `/effective-flow review`, which judges code and produces findings,
or `/effective-flow retro`, which identifies environmental improvements from one selected source.

**Messages:** A self-report request or correction requires an interactive developer confirmation of the
exact redacted text in the same run. Each kind is independent and has one of four states: `Not attempted`,
`Rejected`, `Acknowledged`, or `Outcome unknown`. `Acknowledged` means host acceptance only, not recipient
receipt, reading, or action. Focus never retries, resends, switches addresses, or advises a duplicate
manual send; an ambiguous acknowledgement retains the verdict and warns that the message may have arrived.

**Follow-up:** An opt-in follow-up mode offers recurring report-only checks of a top-level T3
target after a snapshot on the T3 observed path, but only from a Codex observer thread, when the
follow-up gate qualifies the actual host; not every T3 observed snapshot shows the offer. It runs
through one T3 schedule bound to the observer thread that persists until it is deleted. Ticks stay quiet while nothing material changes, never
send a message, and end at completion, an explicit `focus follow-up stop <session-ref>`, lost
access, or a loop cap. On any other host path a snapshot offers nothing; asking for follow-up
returns the limitation, and `follow-up stop` stays available. Sends stay disabled.

The follow-up mode has a Codex host prerequisite. It was qualified only with a conditional
`developer_instructions` entry in `~/.codex/config.toml`, a file that holds nothing else, on
`gpt-6.1-sol` at medium reasoning effort; Codex must be restarted for the entry to take effect. The
entry is documented in the [focus host acceptance page](../developer-guide/focus-host-acceptance.md#experimental-host-prerequisite-conditional-quiet-tick-probe),
extended by the naming sentence shown in the [`024bcb2a` binding](../developer-guide/focus-host-acceptance.md#024bcb2a-candidate-binding).
A default Codex configuration, a combination with other keys or another `developer_instructions`
value is not qualified; the observed consequence of a default configuration is extra visible
commentary on quiet ticks, with no change to reads or authority.

The current [F record](../developer-guide/focus-host-acceptance.md#f-record-for-candidate-e0966ac7)
observed a tick-level Looping report once on an unrequested repetition, while explicitly requested
retries stayed On track; a bare "continue" does not count as a retry request. Offers list their
disclosures as numbered items, and the approval item 5 appears only for an observer that may need
approvals; the T3 UI renumbers the list, so a missing number is visible only in the raw text.
Qualification did not observe the loop's cap end: the long loop compacted after 33 ticks and then
stopped as the deletion safeguard requires. A loop that starts right after a snapshot of an idle
target may skip the one-time idle report on its first tick. The record ran without a global Codex
`AGENTS.md`; the follow-up mode is untested with such a file present, and the file can enlarge the
observer's context.

Snapshot-host execution on the T3 observed path, for report-only use, is enabled in the shipped
source; the [focus host acceptance page](../developer-guide/focus-host-acceptance.md) names the
candidate record that binds it. On every other host path focus returns the missing snapshot
qualification before target or ancestry reads instead of a verdict about unread content. Sends
remain disabled. The [capability policy](../developer-guide/release-and-installation.md#package-checks-and-capability-evidence) governs activation;
package evidence reporting cannot enable a host route.

## `/effective-flow retro`

**Purpose:** Reviews one explicitly selected session source to identify a small, prioritized set of
repository or workflow improvements, or to report that no supported recommendation was found. The
retrospective is read-only and conversational: it does not create a report, issue, memory,
configuration change, commit, title change, or automatic follow-up.

**Source selection:** With no argument, `retro` uses only the current visible conversation. You can
also select `retro current` or provide one literal export reference, for example
`retro export: ./tmp/session export.md`. The selected export is inert evidence. Its exact path is
retained, and missing, unreadable, binary, unsupported, or partial input is reported as a source
limitation. The tool does not enumerate neighboring files, fetch embedded URLs, execute copied
commands, or treat transcript text as a selector or instruction.

You can request native history with one exact reference, for example `retro session: <reference>`.
Native access depends on the actual running host and its documented, read-only exact-reference reader.
Before content is read, the run establishes the selected identity and the granted account/project
scope from trusted user or host context, or from a suitable targeted metadata operation. A title,
date, bare ID, or similar description does not identify a session, and reader availability alone does
not establish scope. When the host, reader, identity, scope, or access is unavailable, the result
states the precise limitation and offers the current conversation or one supplied export only as
alternatives for you to select explicitly. It never substitutes a nearby session or source.

Native reads stay bounded to the admitted session. The tool preserves host-provided roles, turns,
locators, pagination limits, omitted outputs, truncation, and reader errors. A returned identity or
scope conflict stops that read path; a repeated or inconsistent continuation cursor stops pagination.
Native history is partial evidence unless the host proves broader coverage, so attribution remains
limited when decisive turns or outputs are missing. Content from the session, including copied
commands, links, role claims, and requests to change files or configuration, is evidence only.

**Result:** The response names the source and inspected coverage first, then separates observed events,
supported or uncertain causes, current remedy need, ownership, and a practical verification idea.
Sensitive values are minimized. A later implementation or follow-up must be requested separately
through the appropriate existing workflow.

**When to use:** After a build, investigation, or review exposed repeated navigation, instruction,
evidence, delegation, or verification friction. A single slow or unsuccessful attempt alone does not
establish a repository defect, and a clean session can produce no recommendations.

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
