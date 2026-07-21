---
description: "Takes one or more GitHub/Forgejo issues (individually, as a list or as a container issue with a sub-issue checklist), analyzes and classifies the content and routes sufficiently specified issues to {{SKILL:build}}, {{SKILL:fix}}, {{SKILL:refactor}} or {{SKILL:docs}} (one PR per issue). Insufficiently specified issues are skipped and marked for {{SKILL:plan-issue}}. Status updates run as issue comments."
---

# Effective Flow Apply Issues

You are the orchestrator that analyzes arbitrary issues from an external tracker and hands them off to the matching implementation workflow.

## Goal

This skill takes one or more issue references (GitHub via `gh`, Forgejo via `tea`) and works through them via the existing implementation skills. Unlike `{{SKILL:apply-review}}`, it does **not** process the structured finding issues produced by `{{SKILL:review}}`, but **free-form human issues** without plan or finding structure. That is why each issue's content is first **analyzed and classified** before it is routed:

- Feature → `{{SKILL:build}}`
- Bugfix → `{{SKILL:fix}}`
- Refactoring → `{{SKILL:refactor}}`
- Documentation → `{{SKILL:docs}}`

If the information is not sufficient for an autonomous implementation, the issue is **skipped**, marked with the label `effective-flow-needs-planning` and explained via a comment. `{{SKILL:plan-issue}}` later collects these issues and completes the planning.

The skill implements nothing itself. It is an analysis and routing layer over the existing workflow skills. All status updates are appended **as comments on the respective issue**.

```include
language-rules
```

```include
task-tracking
```

```lazy-include
runtime-state-safety
when: any wisdom, tracker-marker, or other runtime-state mutation is imminent
```

```lazy-include
effective-flow-dir-migration
when: any wisdom, tracker-marker, or other runtime-state mutation is imminent
```

```include
commit-message-rules
```

## Project conventions

If the project has an `AGENTS.md`, read it early in the workflow and honor its rules for routing, commits and user follow-up questions.

```include
completion-protocol
```

```include
goal-completion
```

## Wisdom Accumulation

Use `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md` for:

- the resolved work list (issue number, optional epic reference)
- the analysis per issue (classification, sufficient/insufficient, target skill, prompt suggestion, confidence, what is missing)
- created PRs and checked-off epic entries
- skipped issues with reason
- failed delegations

Write a summary after each phase and pass it to later phases. Delete the file at the end.

## Tracker integration

This skill is **inherently remote**: it always works against the issue tracker of the `origin` remote. The `tracker.mode` switch from `{{SKILL:review}}`/`{{SKILL:apply-review}}` is **not** evaluated. From the following shared building block, this skill uses the provider-neutral remote helper, its probe/dry-run/apply envelope, and its structured error cases. The finding/epic-specific body formats do not apply here; the exact checklist patch operation is reused analogously for container issues.

```include
config-migration
```

```include
issue-tracker
```

```include
apply-source-detection
```

```include
apply-clarity-gate
```

## Comment conventions

All status updates are written as issue comments (operation "add comment" from the mapping above).
Resolve `language.forge` once and use it for new comment prose, preserving a clearly established
existing thread language. Use the English templates below or their complete German equivalents
(`Umgesetzt`, `Übersprungen`, `Umsetzung fehlgeschlagen` and corresponding sentences). Begin
every comment with the stable marker `<!-- effective-flow-apply-issues -->` so later runs
recognize their own comments and avoid duplicates:

- **Implemented:** `🤖 Implemented via {{FIRMO}} apply — PR #<nr>` (no internal IDs, no `Co-Authored-By`).
- **Skipped:** `⏭️ Skipped: some details are still missing for an autonomous implementation: <list of what is missing>. Complete with {{FIRMO}} plan-issue.`
- **Failed:** `⚠️ Implementation failed: <short reason>. Issue remains open.`

Do not expose internal tracking IDs or session details in comments.

## Workflow

### Phase 1: Argument & tracker setup

1. Determine host and CLI and check availability/authentication per "Host and CLI detection" in the included building block. Precondition: a git repository with an `origin` remote. If `origin`, the CLI or authentication is missing: report clearly and abort without side effects (no silent fallback).
2. Read the user argument and classify it via the "apply-source detection" (stage A and — for issue references — stage B):
   - source type `container-issue` or `plain-issue` → `{{SKILL:apply-issues}}` processes it itself; continue. Multiple issue references (number, `#123` or issue URL) are allowed as a list.
   - source type `plan` or `review-report` → point to the responsible skill (`{{SKILL:apply-plan}}` or `{{SKILL:apply-review}}`, or `{{SKILL:apply}}` for automatic routing) and end the skill.
   - source type `review-epic` or `review-finding` → these are epic/finding issues produced by `{{SKILL:review}}`; `{{SKILL:apply-review}}` is responsible for them. Point to it and end.
   - `ambiguous` → ask instead of guessing. When `{{SKILL:apply-issues}}` runs as a delegation from `{{SKILL:apply}}`, foreign types should not occur; the switch remains as a safeguard.
   - No argument (`none`): list open issues that carry neither `effective-flow-issue-done` nor `effective-flow-needs-planning` (exclude the legacy prefix `firmo-` equivalently, see "Label convention"), and ask the user which ones to process. Do **not** use a heuristic auto-selection.
3. Create the required labels idempotently (`effective-flow-issue-done`, `effective-flow-needs-planning`; tolerate an "already exists" message).

### Phase 2: Expansion & work list

1. Read each referenced issue **fresh** from the tracker (body, labels, status and **comments** via the "read comments" operation). The comments are part of the analysis basis: a planning comment from `{{SKILL:plan-issue}}` (marker `<!-- effective-flow-plan-issues -->`) contains the completed specification, and maintainers may add clarifications as a comment rather than in the body. Your own Effective Flow comments (`<!-- effective-flow-apply-issues -->`) are only noted here for the idempotency check in Phase 4, not counted as a functional requirement. **Backcompat (one generation):** the legacy markers `<!-- firmo-plan-issues -->` and `<!-- firmo-apply-issues -->` from earlier runs are recognized equivalently when reading; only the `effective-flow-` variant is written anew.
2. **Container detection:** if the body contains a task list with issue references (`- [ ] #NNN …` / `- [x] #NNN …`), treat the issue as a container:
   - expand to the **open** (`- [ ]`) sub-issue references and remember the container issue as an epic for the later check-off,
   - skip done (`- [x]`) entries,
   - then read each open sub-issue fresh from the tracker.
     If the body contains no such list, the issue itself is a single work item.
3. Skip work items that are already closed or carry the label `effective-flow-issue-done` (or legacy `firmo-issue-done`) (idempotency).
4. Deduplicate the work list (the same issue number only once, even if it is reachable via multiple containers).
5. Result: a flat list of work-item issues, each with an optional epic reference. Record it in the wisdom file.
6. Create a task per work item (task tracking with per-issue granularity) and give the user an overview:

```markdown
| Status | Count |
|---|---|
| To analyze | X |
| of which expanded from containers | C |
| already done (skipped) | Z |
| Total | N |
```

7. If the work list is empty: short message and abort.

### Phase 3: Analysis & classification (in parallel per work item)

Start an analysis sub-agent in parallel for **each work item**. These sub-agents implement nothing and change no files — they only analyze.

Each analysis sub-agent receives the issue body **and the issue comments** and the task to investigate the codebase and deliver a structured result:

- **Comments as a source:** evaluate body and comments together. A `<!-- effective-flow-plan-issues -->` planning comment provides the specification completed by `{{SKILL:plan-issue}}` (target behavior, acceptance criteria, affected areas) and counts as the **authoritative, sufficient** basis — even if the original body is thin; if several exist, the newest counts. Further maintainer comments count as clarifications for the sufficiency check. Pure Effective Flow status comments (`<!-- effective-flow-apply-issues -->`) are not counted as a requirement.
- **Classification:** Feature / Bugfix / Refactoring / Documentation (definitions as in `{{SKILL:plan}}`, Phase 1) and from that the target skill (`{{SKILL:build}}` / `{{SKILL:fix}}` / `{{SKILL:refactor}}` / `{{SKILL:docs}}`).
- **Sufficiency check:** applies the "clarification gate" analogously at issue granularity: can a clear target behavior and at least one **measurable acceptance criterion** be derived from the issue (body **and comments**), and are there enough file/area hints for the target workflow to start autonomously? Result: `sufficient` or `insufficient`. On `insufficient`: a concrete list of what is missing (open functional questions, missing acceptance criteria, unclear scope).
- **Prompt suggestion:** a directly usable plain-text task for the target skill.
- **Confidence:** `High` / `Medium` / `Low` regarding the file scope (analogous to the pre-analysis in `{{SKILL:apply-review}}`).
- **Affected files:** best estimate of the touched files (for the conflict consideration in Phase 4).

Write each result into the wisdom file. When in doubt, an issue counts as `insufficient` — better to hand off cleanly to `{{SKILL:plan-issue}}` than to implement on an unclear basis.

### Phase 3.5: Approval and goal query

This is the approval boundary of this workflow: the classification is fixed, and the remaining phases (delegation, PRs, comments, summary) then run without a further regular approval gate.

1. Give the user an overview of the analysis: per work item the issue number, classification, `sufficient`/`insufficient` and the target skill or what is missing.

```markdown
| Issue | Classification | Result | Target / Missing |
|---|---|---|---|
| #<nr> | Feature/Bugfix/Refactoring/Docs | sufficient | {{SKILL:build}} … |
| #<nr> | … | insufficient | missing: … |
```

2. Per "Goal-driven completion control" (principle 1), declare the explicit completion condition for phases 4–5: every `sufficient` issue is implemented via the matching implementation skill and has either a newly created PR or a new commit on the specified target PR with a PR comment, label `effective-flow-issue-done` and — for container origin — a checked-off epic entry; every `insufficient` issue carries `effective-flow-needs-planning` together with a comment; the project-configured checks of the delegated workflows are green; nothing outside the chosen issues is changed.
3. Ask the goal query per "Explicit goal query for autonomous runs". The approval boundary here is a yes/no approval, hence "Autonomous via `/goal`" as a third option:

```ask
header: Approval
question: Start implementing the sufficiently specified issues?
options:
  - label: Yes
    description: Approval granted, the workflow continues gated (status update per issue)
  - label: Autonomous via /goal
    description: Remaining phases autonomous under native /goal — the skill outputs the /goal string to paste
  - label: Adjust
    description: Enter feedback as free text (e.g. correct the issue selection or target skill)
```

4. **Dropping the query:** if `{{SKILL:apply-issues}}` itself runs as a non-interactive sub-agent of a higher-level orchestrator (recognizable from the call context, e.g. "[Context from …]"), skip this gate entirely (no extra option, no `/goal` string) and continue directly with Phase 4. A direct call by the user does **not** count as such a delegation.
5. On choosing "Autonomous via `/goal`": output the `/goal` string prominently and prompt the user to paste it as a new input. Without pasting, the skill continues gated. Form (single line, without internal IDs):

```text
/goal Fully work through the issues analyzed via {{FIRMO}} apply (#… , #…) and run the remaining phases of this workflow: implement each sufficiently specified issue via the matching implementation skill, create exactly one PR per issue without a target PR, update issues with a target PR exclusively through new commits on the existing PR branch, comment the PR link, set effective-flow-issue-done and check off the epic entry; mark insufficient issues with effective-flow-needs-planning and a comment; project-configured checks of the delegated workflows green. Change nothing outside the named issues. Stop when all chosen issues are processed.
```

6. On "Yes"/gated (or a normal answer): continue gated without a `/goal` string. On "Adjust": incorporate the feedback (correct selection/target) and ask the query again. Start Phase 4 only after this approval.

### Phase 4: Routing & delegation

The commit/PR strategy is by default **"one PR per issue"** (no commit-strategy question). Every implementable issue without a target PR is its own sub-group in its own delivery branch, preferably with worktree isolation, analogous to the remote mode of `{{SKILL:apply-review}}` (Phase 4 remote): branch off the base branch from the `delivery` config block (legacy fallback: old `worktree.baseBranch`/`worktree.branchPrefix` values), one PR via `{{SKILL:pr}}`. File-overlapping issues run sequentially to avoid working-tree conflicts; non-overlapping ones run in parallel.

If an issue body or non-Effective Flow comment names a target PR (`Ziel-PR: #<nr>`, `Target PR: #<nr>` or a PR URL), **"new commit on existing PR"** applies instead:

1. Do not create a new delivery branch and no new PR.
2. Fetch the head branch of the target PR, check it out in an isolated worktree or in the clean
   current checkout, issue and verify the downstream workflow's execution-location receipt, and
   update it via rooted pull/fetch operations without any rebase or force operation.
3. Implement the issue there and commit the change as a new commit on the PR branch. Existing PR commits must not be rewritten via `commit --amend`, rebase, squash or force-push.
4. Push the PR branch normally. If the push is rejected due to diverged remote history, mark the issue as failed and report the conflict instead of overwriting history.
5. Use the URL of the existing PR as the result PR link for the issue comment, epic entry and summary.

Issues with the same target PR run sequentially so that new commits are created in order on the same PR branch.

**Insufficient issues (`insufficient`):**

1. Do not implement.
2. Set label `effective-flow-needs-planning`.
3. Append a skipped comment with the list of what is missing (template above), unless the comments read in Phase 2 already contain an identical `<!-- effective-flow-apply-issues -->` skipped comment (idempotency based on the "read comments" operation).
4. Task to `completed` with the addition `[skipped]`.

**Sufficient issues (`sufficient`), each with its own verified execution root:**

1. Delegate to the target skill determined in Phase 3 and pass along the prompt suggestion as the task description:
   - Feature: `Use the skill {{SKILL:build}} for this issue.`
   - Bugfix: `Use the skill {{SKILL:fix}} for this issue.`
   - Refactoring: `Use the skill {{SKILL:refactor}} for this issue.`
   - Documentation: `Use the skill {{SKILL:docs}} for this issue.`
     The delegation sub-agent runs as a **non-interactive** delegation (context hint "[Context from {{FIRMO}} apply-issues: …]"): no explicit goal query, no `/goal` string, completion protocol `DONE`/`ABORT`.
     Pass the absolute root and execution-location receipt established by that delegated workflow;
     never rely on an inherited current directory or create a nested worktree around a reused
     harness-native one.
2. Commit the changes using resolved `language.git` for the description (Conventional Commit
   type stable, no internal IDs, no `Co-Authored-By`) and push the branch. Pass resolved
   `language.git` and `language.forge` to the delegated delivery path. If a target PR is present:
   **do not create a new PR**, but use the existing PR link and optionally extend its body by one
   exact `Closes #<issue>` or `Refs #<issue>` entry through the helper's idempotent body patch,
   using the fresh body hash so concurrent edits fail closed. If no target PR is present: take
   the branch through `{{SKILL:pr}}` as exactly one PR against the base branch; include
   `Closes #<issue>` in the helper-validated PR payload.
3. **Immediately after a successful push or PR creation:** build and write the PR-link comment
   through the helper, set label `effective-flow-issue-done`, and — if the issue originates from
   a container — read the container body fresh and use the helper's exact checklist patch with
   its body hash and PR-link suffix. Apply only when the stale-write precondition still matches.
4. Task to `completed`.

**Error cases:**

- If the delegation (`ABORT`), the push to the target PR or the PR creation fails: do **not** mark the issue as done, do not set `effective-flow-issue-done`, do **not** check off the epic entry, append a failed comment and continue with the next issue. Task to `completed` with the addition `[failed]`.
- If an issue passed as part of a list lacks an assigned epic: implement it anyway and create a PR; the check-off is omitted and reported to the user.

Give a short status update after each completed issue.

### Phase 5: Summary

Report to the user:

- processed issues with result (implemented / skipped / failed)
- created PRs with URL
- skipped issues (`effective-flow-needs-planning`) with reason and the note that `{{SKILL:plan-issue}}` can complete the planning
- checked-off epic entries, if containers were processed

Then delete the wisdom file.

## Rules

- Do not modify any implementation files yourself; the implementation lies with the delegated workflows.
- Do not create a `<plan.dir>/` file; the internal planning is handled by the respective implementation workflow.
- Do not use a heuristic "newest issue" when multiple candidates exist.
- When in doubt about the sufficiency check: treat it as `insufficient` and point to `{{SKILL:plan-issue}}` instead of guessing.
- Never set a `Co-Authored-By` trailer and do not expose internal IDs in commits or comments.
- Give the user a short status update after each phase.
