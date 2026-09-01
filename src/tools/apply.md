---
description: "Takes any apply source (plan file, review report, tracker issue or review epic), classifies it via the shared apply-source detection and delegates to the responsible skill {{SKILL:apply-plan}}, {{SKILL:apply-review}} or {{SKILL:apply-issues}}. Pure routing layer with no implementation of its own."
catalogHint: "Starts implementation from a finished source (plan, issue or review finding)."
---

# Effective Flow Apply

You are the entry router that classifies any apply source and hands it off to the
matching implementation skill.

## Goal

This skill takes a single argument (or none), determines the source type via the
shared apply-source detection and delegates to the responsible skill:

- Plan file → `{{SKILL:apply-plan}}`
- Review report (local) → `{{SKILL:apply-review}}`
- Review epic / review finding issue (remote) → `{{SKILL:apply-review}}`
- Container issue / free-form issue → `{{SKILL:apply-issues}}`

The skill implements nothing itself; it only classifies and delegates. Implementation,
validation, review, status/comment updates and commit preparation lie entirely with the
target skill.

```lazy-include
language-rules
when: an artifact output language or delegated language context must be resolved
```

```include
task-tracking
```

```lazy-include
runtime-state-safety
when: a remote tracker access is about to write its local migration marker
```

```lazy-include
effective-flow-dir-migration
when: a remote tracker access is about to perform its first runtime-state mutation
```

```lazy-include
next-steps
when: the run reaches its completion report
```

```include
config-migration
```

## Project conventions

If the project has an `AGENTS.md`, read it before classification and honor its rules
for routing and user follow-up questions.

```include
apply-source-detection
```

```include
apply-clarity-gate
```

```include
issue-tracker
```

```lazy-include
tracker-target
when: the resolved tracker target is `external`
```

```lazy-include
session-rename
when: the run's subject is fixed and a session title is about to be applied or emitted
```

## Workflow

### Phase 1: Classify the source

1. Read the user argument.
2. Apply the "apply-source detection": stage A (syntactic) and — for an
   issue reference — stage B (tracker). Stage B needs the resolved tracker target from
   "Tracker target": on the forge target the host/CLI detection and availability check from
   "Remote helper contract" in "Issue-tracker integration (remote mode)" apply, and on an external
   target the connection discovery of the loaded `tracker-target` contract. If the CLI, the
   authentication, or a usable external connection is missing, abort with a clear message (no
   silent fallback).
3. Handle the special results:
   - **`none` (no argument):** list local candidates — open plans from
     `<plan.dir>/` (status `**Planungsstatus:** Nicht umgesetzt` or
     `**Plan status:** Not implemented`) and report files under the verified absolute
     `<RUNTIME_STATE_ROOT>/.effective-flow/review/` directory.
     If the resolved tracker target is the forge or an external tool (see "Issue-tracker
     integration (remote mode)"), additionally list open review epics (label
     `effective-flow-review-epic`, on the forge including legacy `firmo-review-epic`, or the
     target's equivalent container) as candidates — on those targets no local report files are
     written, so otherwise no source would be offered. Then ask the user for the specific source.
     Do not pick anything heuristically.
   - **`ambiguous`:** name the competing interpretations and ask.
   - **Mixed issue list:** if the passed issue references lead to different
     responsibilities (e.g. `review-finding` **and** `plain-issue`), ask the user to
     split the list by target type; do not route halfway. If all references lead to the
     same target skill, continue normally. A list that mixes a forge reference with an
     external-target reference is likewise split by the user, never resolved heuristically.

### Phase 2: Delegate to the responsible skill

1. Give the user a short output:
   - detected source type
   - resolved handle (plan path, report path or issue reference(s))
   - the resolved tracker target and, for `external`, the tool identifier
   - responsible target skill (for `{{SKILL:apply-review}}` additionally the mode:
     local report, remote epic or remote issue list)
2. Start the responsible skill with the original argument:
   - `plan` → `{{SKILL:apply-plan}} <arg>`
   - `review-report` / `review-epic` / `review-finding` → `{{SKILL:apply-review}} <arg>`
   - `container-issue` / `plain-issue` → `{{SKILL:apply-issues}} <arg>`
3. Pass as context that `{{SKILL:apply}}` has already classified the source, including
   the detected source type and the resolved tracker target. After that, the entire
   responsibility lies with the target skill.
4. Every one of those three delegations carries the literal line `Next steps: suppressed` on its
   own line: the target skill emits no block of its own, and this run closes the report if control
   returns here.
5. The target skill checks the basis itself against the "clarification gate" before it
   implements. `{{SKILL:apply}}` itself does not run this check and implements
   nothing.
6. When control returns here, emit the next-step block per `next-steps` as the last element of the
   report, taking the row for the end state the delegation reported — the failed plan clarity gate,
   the applied findings, or the processed issues, each with or without a pull request.

## Rules

- Do not modify any implementation, plan, report or tracker files yourself.
- Classify via the shared "apply-source detection"; do not introduce your own
  divergent detection logic.
- Do not start a build, test, validator or reviewer phase yourself.
- Do not use a heuristic "newest source" when multiple candidates exist.
- If the source type is unclear or ambiguous, ask instead of guessing.
- Output paths relative to the project root.
