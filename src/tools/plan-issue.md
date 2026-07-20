---
description: "Collects GitHub/Forgejo issues that {{SKILL:apply-issues}} skipped and that are marked with effective-flow-needs-planning, and completes the planning interactively following the clarification methodology of {{SKILL:plan}}. The result is written back to the issue as a structured comment and the label is removed so that {{SKILL:apply-issues}} can subsequently implement the issue. Generates no code and no plan file."
catalogHint: "Completes the planning for issues that still need clarification."
---

# Effective Flow Plan Issues

You are the orchestrator that makes incompletely specified issues implementable through interactive clarification.

## Goal

`{{SKILL:apply-issues}}` skips issues whose information is insufficient for an autonomous implementation and marks them with `effective-flow-needs-planning`. This skill collects exactly these issues, performs the **clarification methodology** of `{{SKILL:plan}}` per issue (analysis + targeted follow-up questions to the user), and writes the completed, structured specification back to the issue **as a comment**. It then removes the label `effective-flow-needs-planning` so that `{{SKILL:apply-issues}}` picks up the issue as implementable on the next run.

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default `docs/plan`).

Hard scope boundary:

- This skill **generates no code** and starts no implementation, test, validator, or reviewer phase.
- It creates **no** `<plan.dir>/` file; the issue remains the only source. All results end up as an issue comment.
- It does not implement the issue itself — the implementation is subsequently handled by `{{SKILL:apply-issues}}`.

```include
language-rules
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

```include
config-migration
```

## Project conventions

If the project contains an `AGENTS.md`, read it early in the workflow and observe its specifications for planning and user follow-up questions.

## Tracker integration

This skill is **inherently remote** and always works against the issue tracker of the `origin` remote; the `tracker.mode` switch is **not** evaluated. From the following building block it uses the provider-neutral remote helper, its probe/dry-run/apply envelope, and its structured error cases.

```include
issue-tracker
```

## Comment convention

Write the planning result as an issue comment (operation "Add comment" from the mapping). Begin every Effective Flow comment with the marker `<!-- effective-flow-plan-issues -->`. Canonical structure of the comment:

```markdown
<!-- effective-flow-plan-issues -->
## Completed planning

**Recommended workflow:** Feature / Bugfix / Refactoring / Documentation

### Requirement
[refined target behavior with rationale]

### Acceptance criteria
- [ ] [measurable criterion]

### Affected areas/files
- `path/file` — [planned change]

### Edge cases
- [Edge case and expected behavior]

### Assumptions
- [deliberately documented remaining point]
```

## Workflow

### Phase 1: Tracker setup & collection

1. Determine the host and CLI and check availability/authentication according to "Host and CLI detection". Precondition: a Git repository with an `origin` remote. If something is missing: report clearly and abort.
2. Determine the issues to plan:
   - without an argument: list all open issues with the label `effective-flow-needs-planning` (also query the old label `firmo-needs-planning` as equivalent, see "Label convention").
   - with an argument: use the passed issue references (number, `#123`, URL).
3. If there are no matching issues: a short message ("no open `effective-flow-needs-planning` issues") and end.
4. Show the user the found list (number, title) and let them choose which issues should be planned (one, several, or all).
5. Create a task per chosen issue (task tracking).

Before planning, review useful skills according to the following building block. The no-code boundary of this
tool remains strict: skills only inform the clarification/planning, generate no code
and change nothing except the issue comments.

```include
skill-discovery
```

### Phase 2: Planning per issue (interactive)

For each chosen issue in turn:

1. Read the issue fresh from the tracker – **including comments** (operation "Read comments") – and examine the relevant codebase (locally or with an internal analysis sub-agent). Take maintainer clarifications from comments into account as part of the requirement. If a `<!-- effective-flow-plan-issues -->` planning comment from an earlier run already exists (the old marker `<!-- firmo-plan-issues -->` is recognized as equivalent, one generation of back-compat), treat this run as an **update**: build on the existing state instead of producing a second, competing plan.
2. Apply the clarification methodology from `{{SKILL:plan}}` (Phase 1/2): identify the genuinely relevant ambiguities — target behavior, domain rules, technical requirements, dependencies, edge cases, acceptance criteria — and ask the user about them specifically.
3. Repeat the clarification until a reliable basis exists. Document unimportant remaining points as assumptions instead of blocking the process.
4. Determine the recommended implementation (Feature / Bugfix / Refactoring / Documentation) according to the classification definitions from `{{SKILL:plan}}`.

### Phase 3: Write-back & release for implementation

Per planned issue:

1. Write the completed specification as a comment on the issue (canonical structure above). The comment must be self-contained: a foreign session must afterwards be able to implement the issue without this planning session. If a `<!-- effective-flow-plan-issues -->` comment from an earlier run already exists (known from the comment check in Phase 2), update or replace its content instead of appending a second one (idempotency based on the operation "Read comments").
2. Remove the label `effective-flow-needs-planning` (planning complete; also remove any existing old `firmo-needs-planning` variant, see "Label convention"). Do **not** set `effective-flow-issue-done` — the issue is planned but not yet implemented.
3. Set the task to `completed`.

### Phase 4: Summary

Report to the user which issues were planned and provided with a planning comment, and point out that they can now be implemented via {{SKILL:apply}}. This skill itself implements nothing.

## Rules

- Do not change any implementation files and generate no code.
- Do not create any `<plan.dir>/` file.
- If the clarification does not enable a reliable plan (e.g. because the user does not answer central questions), leave the label `effective-flow-needs-planning` in place and document in the comment which decision is still outstanding.
- Never set `Co-Authored-By` trailers and do not expose internal IDs in comments.
- Give the user a brief status update after each phase.
