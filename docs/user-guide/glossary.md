# Glossary

Short explanations of the recurring technical terms around Effective Flow, sorted
alphabetically. English terms (tool, agent, worktree, pull request) are deliberately left
untranslated – that matches the language used in the Effective Flow docs and the tools
themselves.

## Agent

A specialist that a tool calls **internally** as a subagent – for example an implementer, a
reviewer, a validator, or a docs writer. Agents are themselves **not** `/effective-flow` tools
and are never called directly; at most you see them in a tool's intermediate updates (e.g.
"delegated to the UI implementer"). Calling a named agent is Effective Flow's default, not an
optional choice; see [Delegation](#delegation).

## Delegation

The default way an Effective Flow tool gets work done: invoking a tool is your standing request
to hand a named step to an internal [agent](#agent) rather than have the orchestrator do it
inline. A worker may itself fan out read-only analysis subagents but never re-delegates its own
assignment or a write. Inline execution stays legitimate only as a disclosed fallback – for
example when the harness offers no subagent mechanism, or a delegation is declined at runtime –
and is always announced, never silent. See
[Troubleshooting](./troubleshooting.md#the-tool-did-everything-itself-instead-of-delegating).

## Delivery / delivery branch

Delivery refers to bringing finished changes into your target branch. It is always active
whenever work happens in a [worktree](#worktree) or on a dedicated **delivery branch** – there
is no separate on/off switch for it. The delivery branch follows the pattern
`<branchPrefix>/<skill>/<slug>` (e.g. `effective-flow/build/user-login`) and, depending on
`delivery.completion`, ends as a merge, a pull request, or a branch simply left in place.
Details in [Worktree and Delivery](./worktree-and-delivery.md).

## Finding

A single, concretely locatable finding from [`/effective-flow review`](./tools-quality.md) –
e.g. a bug, missing error handling, or a security vulnerability – with severity
(critical/important/hint), affected file, problem and recommendation text, and a proposed
target action (`effective-flow-fix`, `effective-flow-refactor`, `effective-flow-build`, `effective-flow-docs`).
Depending on the [tracker target](#tracker-target), findings land either in a local Markdown
report or as an issue on the Git forge or in an external tool (see
[Remote Tracker](./remote-tracker.md)), and are worked through by
[`/effective-flow apply`](./tools-implement.md).

## Harness

The environment in which Effective Flow runs as a skill – currently Claude Code and Codex.
Effective Flow is built from a shared source tree for both harnesses; as a user you usually
notice nothing of this, except in the exact call syntax (`/effective-flow <tool>` on Claude Code,
`$effective-flow <tool>` on Codex).

## Clarification gate

The check of whether a basis – plan file, issue, or review [finding](#finding) – is
**fully clarified** and implementable without any further follow-up question, before an
implementing tool actually starts work. If the basis does not pass the gate (e.g. because of
open points or missing measurable acceptance criteria), Effective Flow refers back to
clarification instead of guessing or partially implementing. See
[Troubleshooting](./troubleshooting.md#the-clarification-gate-was-not-passed).

## Completion control

The uniform pattern with which an Effective Flow tool decides that it is done; the tools and the
developer documentation call it "Goal-driven completion control". Before the implementation work
starts, it formulates one measurable completion condition derived from the acceptance criteria and
the validation plan, including the scope boundary — what is deliberately not changed. It verifies
that condition through independent instances (the validator, the routed reviewers) rather than by
self-assessment, and it bounds its correction rounds: if the condition still does not hold, it
escalates to you instead of looping on.

Effective Flow never hands the remaining phases to a harness-native autonomous mode; the regular
approval gates of each workflow always apply.

Every run maintains a visible overview of the known remaining phases and reconciles every entry
before reporting completion. After each major phase, it reports the result and next step in chat
and continues with the next step unless an approval gate or a genuine blocker requires input. If
task tracking is unavailable or fails irrecoverably, the overview and subsequent progress are
carried in chat instead. The harness determines the exact visual presentation.

## Concept (file)

A Markdown file created by [`/effective-flow concept`](./tools-understand.md) under
`<concept.dir>` (default `docs/concept`) that describes a **new application** one step before
planning: problem, target users, use cases, first-version scope, non-goals, and a coarse technical
direction. The file name follows the pattern `YYYY-MM-DD-<slug>.md`. Its status is
`Draft`/`Entwurf` until the deep concept review has elaborated it to
`Elaborated`/`Ausgearbeitet`. Unlike a plan, a concept is never implemented directly: its roadmap
hands work packages over to `/effective-flow plan`, and concepts are neither archived nor marked as
implemented.

## Plan (file)

A Markdown file created by [`/effective-flow plan`](./tools-understand.md) under `<plan.dir>`
(default `docs/plan`) that analyzes a requirement, clarifies open questions, records
architecture and implementation decisions, and recommends the appropriate subsequent workflow
(`build`, `fix`, `refactor`, or `docs`). The file name follows the pattern
`YYYY-MM-DD-<slug>.md`; after implementation the file is marked as implemented and archived
under `<plan.dir>/archive/`, by a rename or an add depending on whether the plan was already
tracked, and never re-added at top level if an earlier run already archived it.

## Skill discovery

The mechanism with which Effective Flow tools and agents survey available host skills at
runtime (e.g. `humanizer`, `impeccable`, `context7`) and additionally include the ones
suited to the concrete task – controlled via `skills.*` rows in the project-setup ADR, globally
and per agent or tool. Details in [Skill Discovery](./skill-discovery.md).

## Tool

A workflow called via `/effective-flow <tool>`, e.g. `plan`, `build`, `review`, or `pr`. Each
tool covers a clearly delimited intent (understanding, implementing, quality, delivering,
setup); the complete tool reference lives in the five guides under
[Understanding tools](./tools-understand.md), [Implementation tools](./tools-implement.md),
[Quality tools](./tools-quality.md), [Delivery tools](./tools-deliver.md), and
[Setup tools](./tools-setup.md).

## Tracker target

The place that owns issue identity for a run, selected by `tracker.mode`: `local` (a Markdown
report under `.effective-flow/review/`), `remote` (the issue tracker of your `origin` remote,
GitHub or Forgejo), or `external` (the project-management tool named by `tracker.externalTool`).
Review publication and the issue-driven tools always follow the same target within one run, while
pull requests stay on the Git forge, plan files stay committed under `plan.dir`, and
[investigations](./tools-understand.md) stay local – in every target. An external target needs a
connection you already have (an MCP connection or an authenticated CLI); Effective Flow ships no
product-specific adapter and aborts instead of guessing a target. Details in
[Remote Tracker](./remote-tracker.md).

## Worktree

A separate Git working area (`git worktree`) with its own checkout and its own branch, in
which Effective Flow by default (`worktree.enabled: true`) carries out the actual
implementation – independent of your current checkout. Not to be confused with the
findings-internal isolation mechanism of `applyReview.worktree.*`, which isolates parallel
review findings instead of creating a delivery branch. Details in
[Worktree and Delivery](./worktree-and-delivery.md).
