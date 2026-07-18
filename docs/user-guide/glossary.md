# Glossary

Short explanations of the recurring technical terms around Effective Flow, sorted
alphabetically. English terms (tool, agent, worktree, pull request) are deliberately left
untranslated – that matches the language used in the Effective Flow docs and the tools
themselves.

## Agent

A specialist that a tool calls **internally** as a subagent – for example an implementer, a
reviewer, a validator, or a docs writer. Agents are themselves **not** `/effective-flow` tools
and are never called directly; at most you see them in a tool's intermediate updates (e.g.
"delegated to the UI implementer").

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
Depending on `tracker.mode`, findings land either in a local Markdown report or as an issue on
a remote tracker (see [Remote Tracker](./remote-tracker.md)) and are worked through by
[`/effective-flow apply`](./tools-implement.md).

## Goal steering

A uniform pattern with which interactive Effective Flow tools offer, at an approval boundary, to
run the remaining phases **autonomously** instead of stepwise-gated – via your harness's native
`/goal`. For this, Effective Flow formulates a measurable completion condition derived from the
acceptance criteria, outputs a ready-to-insert `/goal` string, and then verifies the condition
through independent instances (e.g. a validator or reviewer) rather than by self-assessment.
Without your explicit insertion of the `/goal` string, the tool continues perfectly normally
in gated mode.

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

## Plan (file)

A Markdown file created by [`/effective-flow plan`](./tools-understand.md) under `<plan.dir>`
(default `docs/plan`) that analyzes a requirement, clarifies open questions, records
architecture and implementation decisions, and recommends the appropriate subsequent workflow
(`build`, `fix`, `refactor`, or `docs`). The file name follows the pattern
`YYYY-MM-DD-<slug>.md`; after implementation the file is marked as implemented and moved to
`<plan.dir>/archive/`.

## Skill discovery

The mechanism with which Effective Flow tools and agents survey available host skills at
runtime (e.g. `humanizer`, `impeccable`, `context7`) and additionally include the ones
suited to the concrete task – controlled via the `skills` block in `.effective-flow/config.json`,
globally as well as per agent and tool. Details in [Skill Discovery](./skill-discovery.md).

## Tool

A workflow called via `/effective-flow <tool>`, e.g. `plan`, `build`, `review`, or `pr`. Each
tool covers a clearly delimited intent (understanding, implementing, quality, delivering,
setup); the complete tool reference lives in the five guides under
[Understanding tools](./tools-understand.md), [Implementation tools](./tools-implement.md),
[Quality tools](./tools-quality.md), [Delivery tools](./tools-deliver.md), and
[Setup tools](./tools-setup.md).

## Worktree

A separate Git working area (`git worktree`) with its own checkout and its own branch, in
which Effective Flow by default (`worktree.enabled: true`) carries out the actual
implementation – independent of your current checkout. Not to be confused with the
findings-internal isolation mechanism of `applyReview.worktree.*`, which isolates parallel
review findings instead of creating a delivery branch. Details in
[Worktree and Delivery](./worktree-and-delivery.md).
