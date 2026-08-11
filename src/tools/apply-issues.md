---
description: "Takes one or more issues of the resolved tracker target — GitHub/Forgejo or an external tool — (individually, as a list or as a container issue with sub-issues), analyzes and classifies the content and routes sufficiently specified issues to {{SKILL:build}}, {{SKILL:fix}}, {{SKILL:refactor}} or {{SKILL:docs}} (one PR per issue). Insufficiently specified issues are skipped and marked for {{SKILL:plan-issue}}. Status updates run as issue comments."
---

# Effective Flow Apply Issues

You are the orchestrator that analyzes arbitrary issues from the resolved tracker target and hands them off to the matching implementation workflow.

## Goal

This skill takes one or more issue references of the resolved tracker target (the forge behind `origin` via `gh`/`tea`, or the configured external tool) and works through them via the existing implementation skills. Unlike `{{SKILL:apply-review}}`, it does **not** process the structured finding issues produced by `{{SKILL:review}}`, but **free-form human issues** without plan or finding structure. That is why each issue's content is first **analyzed and classified** before it is routed:

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

```include
delegation-mandate
```

The per-issue delegation to the target workflow skill is **workflow-to-workflow** delegation, not a worker role: its non-interactive delegation contract, the per-issue execution root, and the skip and failure handling stay authoritative and are never replaced by inline implementation. The mandate adds authorization only.

```lazy-include
runtime-state-safety
when: any wisdom, tracker-marker, session rename, or other runtime-state mutation is imminent
```

```lazy-include
effective-flow-dir-migration
when: any wisdom, tracker-marker, session rename, or other runtime-state mutation is imminent
```

```lazy-include
session-rename
when: the run's subject is fixed and a session title is about to be applied or emitted
```

```include
commit-message-rules
```

## Recommended skills

- `pr-review`

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

This skill is **inherently tracker-bound**: it always works against the resolved tracker target. The local/remote switch from `{{SKILL:review}}`/`{{SKILL:apply-review}}` is **not** evaluated. Resolve the target per "Tracker target" in the following shared building block. On the forge target this skill uses the provider-neutral remote helper, its probe/dry-run/apply envelope, and its structured error cases; on an external target the connection, capability, classification, container, and write rules of the loaded `tracker-target` contract apply instead, and a missing connection or capability aborts before the first write. The finding/epic-specific body formats do not apply here; the exact checklist patch operation is reused analogously for container issues.

```include
config-migration
```

```include
issue-tracker
```

```lazy-include
tracker-target
when: the resolved tracker target is `external`
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

1. Resolve the tracker target per "Tracker target" in the included building block. On the forge target, determine host and CLI and check availability/authentication per "Remote helper contract"; precondition there is a git repository with an `origin` remote, and a missing `origin`, CLI, or authentication is reported clearly and aborts without side effects. On an external target, establish exactly one connection and verify the capabilities this skill needs — read issue and comments, list issues by classification, create a comment, add/remove a classification value, and patch an exact checklist entry. Because this skill ticks a container entry off only **after** a pull request exists, also settle the container mechanism here: use a native parent/sub-issue relation only when the connection proves it can write a sub-item's completion state, and otherwise select the checklist fallback and report why. An unproven completion write must never be discovered after delivery. Any of the four fail-closed classes aborts before the first write (no silent fallback to the forge or to a local flow).
2. Read the user argument and classify it via the "apply-source detection" (stage A and — for issue references — stage B):
   - source type `container-issue` or `plain-issue` → `{{SKILL:apply-issues}}` processes it itself; continue. Multiple issue references (number, `#123` or issue URL) are allowed as a list.
   - source type `plan` or `review-report` → point to the responsible skill (`{{SKILL:apply-plan}}` or `{{SKILL:apply-review}}`, or `{{SKILL:apply}}` for automatic routing) and end the skill.
   - source type `review-epic` or `review-finding` → these are epic/finding issues produced by `{{SKILL:review}}`; `{{SKILL:apply-review}}` is responsible for them. Point to it and end.
   - `ambiguous` → ask instead of guessing. When `{{SKILL:apply-issues}}` runs as a delegation from `{{SKILL:apply}}`, foreign types should not occur; the switch remains as a safeguard.
   - No argument (`none`): list open issues that carry neither `effective-flow-issue-done` nor `effective-flow-needs-planning`, and ask the user which ones to process. On the forge target, exclude the legacy prefix `firmo-` equivalently (see "Label convention"); on an external target that legacy prefix is forge history and is neither queried nor written. Do **not** use a heuristic auto-selection.
3. Create the required labels idempotently (`effective-flow-issue-done`, `effective-flow-needs-planning`). The helper's label creation reads the repository's existing labels first and creates only what is genuinely missing, so a repeated run adds no second copy; it reports per label whether it created one. Where it cannot read the existing labels, it aborts rather than creating — treat that as a blocked run, not as a reason to create the label another way. On an external target, ensure exactly these two canonical strings in the connection's classification primitive per the `tracker-target` classification mapping — never a `firmo-`/`sf-` variant, which would materialize forge history in a foreign workspace; if the target exposes no classification primitive, abort instead of losing the lifecycle.

### Phase 2: Expansion & work list

1. Read each referenced issue **fresh** from the tracker (body, labels, status and **comments** via the "read comments" operation). The comments are part of the analysis basis: a planning comment from `{{SKILL:plan-issue}}` (marker `<!-- effective-flow-plan-issues -->`) contains the completed specification, and maintainers may add clarifications as a comment rather than in the body. Your own Effective Flow comments (`<!-- effective-flow-apply-issues -->`) are only noted here for the idempotency check in Phase 4, not counted as a functional requirement. **Backcompat (one generation):** the legacy markers `<!-- firmo-plan-issues -->` and `<!-- firmo-apply-issues -->` from earlier runs are recognized equivalently when reading; only the `effective-flow-` variant is written anew.
2. **Container detection:** if the body contains a task list with issue references (`- [ ] <reference> …` / `- [x] <reference> …`, where `<reference>` is a forge `#NNN` or a tool-native identifier such as `ABC-123`), or — on a target whose connection exposes a native parent/sub-issue relation — if the issue has sub-items, treat the issue as a container. The reference-agnostic checklist form matters because it is the fallback container an external target without a native relation uses:
   - expand to the **open** (`- [ ]`) sub-issue references and remember the container issue as an epic for the later check-off,
   - skip done (`- [x]`) entries,
   - then read each open sub-issue fresh from the tracker.
     If the body contains no such list, the issue itself is a single work item.
3. Skip work items that are already closed or carry the label `effective-flow-issue-done` (idempotency); on the forge target the legacy `firmo-issue-done` counts as equivalent, on an external target it is not looked up.
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

- **Comments as a source:** evaluate body and comments together. The newest
  `<!-- effective-flow-plan-issues -->` planning comment is the authoritative planning artifact,
  even if the original body is thin; it is **not automatically sufficient**. If its
  `### Open points` / `### Offene Punkte` section is nonempty (anything other than exactly
  `- No open points.` / `- Keine offenen Punkte.`), or its plan-review result is
  `Revision required` / `Überarbeitung nötig`, treat the issue as `insufficient`. Also treat a
  review assumption explicitly marked as implementation-blocking as `insufficient`. Keep or add
  `effective-flow-needs-planning` and return it to `{{SKILL:plan-issue}}`; never route it to
  implementation.
  Further maintainer comments count as clarifications. Pure Effective Flow status comments
  (`<!-- effective-flow-apply-issues -->`) are not counted as requirements.
- **Classification:** Feature / Bugfix / Refactoring / Documentation (definitions as in `{{SKILL:plan}}`, Phase 1) and from that the target skill (`{{SKILL:build}}` / `{{SKILL:fix}}` / `{{SKILL:refactor}}` / `{{SKILL:docs}}`).
- **Sufficiency check:** applies the "clarification gate" analogously at issue granularity: can a clear target behavior and at least one **measurable acceptance criterion** be derived from the issue (body **and comments**), and are there enough file/area hints for the target workflow to start autonomously? Result: `sufficient` or `insufficient`. On `insufficient`: a concrete list of what is missing (open functional questions, missing acceptance criteria, unclear scope).
  A canonical planning comment passes this gate only when its required sections meet those checks
  and its review/open-points state contains no implementation blocker. Older planning comments
  without Plan-review or Open-points sections remain backward-compatible and are assessed by the
  existing target-behavior, measurable-acceptance-criterion, and file/area checks rather than
  rejected solely for missing the new sections.
- **Prompt suggestion:** a directly usable plain-text task for the target skill.
- **Confidence:** `High` / `Medium` / `Low` regarding the file scope (analogous to the pre-analysis in `{{SKILL:apply-review}}`).
- **Affected files:** best estimate of the touched files (for the conflict consideration in Phase 4).

Write each result into the wisdom file. When in doubt, an issue counts as `insufficient` — better to hand off cleanly to `{{SKILL:plan-issue}}` than to implement on an unclear basis.

### Phase 3.5: Approval

This is the approval boundary of this workflow: the classification is fixed, and the remaining phases (delegation, PRs, comments, summary) then run without a further regular approval gate.

1. Give the user an overview of the analysis: per work item the issue number, classification, `sufficient`/`insufficient` and the target skill or what is missing.

```markdown
| Issue | Classification | Result | Target / Missing |
|---|---|---|---|
| #<nr> | Feature/Bugfix/Refactoring/Docs | sufficient | {{SKILL:build}} … |
| #<nr> | … | insufficient | missing: … |
```

2. Per "Goal-driven completion control" (principle 1), declare the explicit completion condition for phases 4–5: every `sufficient` issue is implemented via the matching implementation skill and has either a newly created PR or a new commit on the specified target PR with a PR comment, label `effective-flow-issue-done` and — for container origin — a checked-off epic entry; every `insufficient` issue carries `effective-flow-needs-planning` together with a comment; the project-configured checks of the delegated workflows are green; nothing outside the chosen issues is changed.
3. **Dropping the gate:** if `{{SKILL:apply-issues}}` itself runs as a non-interactive sub-agent of a higher-level orchestrator (recognizable from the call context, e.g. "[Context from …]"), skip the following gate entirely and continue directly with Phase 4. A direct call by the user does **not** count as such a delegation.
4. Otherwise obtain the approval:

```ask
when: the run is not a non-interactive delegation
header: Approval
question: Start implementing the sufficiently specified issues?
options:
  - label: Yes
    description: Approval granted, the workflow continues (status update per issue)
  - label: Adjust
    description: Enter feedback as free text (e.g. correct the issue selection or target skill)
```

5. On "Adjust": incorporate the feedback (correct selection/target) and ask again. Start Phase 4 only after this approval.

### Phase 4: Routing & delegation

The commit/PR strategy is by default **"one PR per issue"** (no commit-strategy question). Every implementable issue without a target PR is its own sub-group in its own delivery branch, preferably with worktree isolation, analogous to the remote mode of `{{SKILL:apply-review}}` (Phase 4 remote): branch off the base branch from the `delivery` config block (legacy fallback: old `worktree.baseBranch`/`worktree.branchPrefix` values), one PR via `{{SKILL:pr}}`. File-overlapping issues run sequentially to avoid working-tree conflicts; non-overlapping ones run in parallel.

Every worktree this workflow creates carries the lifecycle contract below. It is embedded here
rather than referenced through `{{SKILL:apply-review}}`: a reference by analogy is not a contract,
and a worktree created without its record can never be removed by `{{SKILL:cleanup}}`, which
requires that record as its only proof of ownership. Write the record immediately after the
`effective-flow-created` receipt is verified, and transition it to `cleanup-ready` once the issue's
work is durably secured on the pushed branch — for the default strategy that is after its pull
request exists. A worktree reused from the harness or created by the user keeps its own ownership
and never receives a record.

```include
worktree-lifecycle
```

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
     The delegation sub-agent runs as a **non-interactive** delegation (context hint "[Context from {{FIRMO}} apply-issues: …]"): no approval gate of its own, completion protocol `DONE`/`ABORT`.
     Pass the absolute root and execution-location receipt established by that delegated workflow;
     never rely on an inherited current directory or create a nested worktree around a reused
     harness-native one. Pass the literal line `Next steps: suppressed` on its own line as well:
     the delegated skill is user-invocable, but it returns its result here and this run is an
     intermediate result of `{{SKILL:apply}}`.
2. Commit the changes using resolved `language.git` for the description (Conventional Commit
   type stable, no internal IDs, no `Co-Authored-By`) and push the branch. Pass resolved
   `language.git` and `language.forge` to the delegated delivery path. If a target PR is present:
   **do not create a new PR**, but use the existing PR link and optionally extend its body by one
   exact issue reference through the helper's idempotent body patch, using the fresh body hash so
   concurrent edits fail closed. If no target PR is present: take the branch through
   `{{SKILL:pr}}` as exactly one PR against the base branch — with the literal line
   `Next steps: suppressed` on its own line, because that run returns its result here — and include
   the issue reference in the helper-validated PR payload. Choose the reference form by tracker
   target per the
   `tracker-target` forge boundary: on the forge the auto-close keyword `Closes #<issue>` (or
   `Refs #<issue>`), on an external target a plain, non-auto-closing reference to the tool-native
   identifier. Never write `Closes #<number>` for an external issue — the code host would resolve
   it against its own issue of that number and close an unrelated one on merge.
3. **Immediately after a successful push or PR creation:** build and write the PR-link comment
   through the helper, set label `effective-flow-issue-done`, and — if the issue originates from
   a container — read the container body fresh and use the helper's exact checklist patch with
   its body hash and PR-link suffix. Apply only when the stale-write precondition still matches.
   On an external target, write the comment and the classification value through the resolved
   connection under the `tracker-target` write discipline, and complete the container with the
   mechanism decided once for this run — the native sub-item state or the checklist plus exact
   patch — never a mix of both. The pull request itself always stays on the forge behind `origin`.
4. **Release the worktree for cleanup:** if this issue ran in a worktree this workflow created,
   transition its lifecycle record from `active` to `cleanup-ready` under the record lock, per the
   embedded contract. The work is durably secured at this point — the branch is pushed and its pull
   request exists — so the worktree itself is no longer needed. Skipping this leaves a record stuck
   at `active`, which `{{SKILL:cleanup}}` must then retain forever. Every path out of this phase
   ends in a status: a failed delegation, a rejected push and a failed pull-request creation all set
   `failed`, a controlled stop sets `aborted`, and only a completed pull request sets
   `cleanup-ready`. A record must never be left at `active` once the issue is done with.
5. Task to `completed`.

This path creates its pull requests without the delivery completion action, so it invokes the
automatic review itself: after step 2 created a pull request, run "PR review publication" with that
pull request, whether the run is gated or a non-interactive delegation, and the residual finding set the
delegated implementation workflow reported — or its explicit declaration that it has none.
Because this tool creates one pull request per issue, ask the gated question only for the first
pull request and reuse that answer for every further pull request of this run — deliberately unlike
the security disclosure gate, whose offer is per run and never remembered, because this question
governs comment noise rather than disclosure.

```lazy-include
pr-review-integration
when: the completion action created or reused a pull request and the automatic PR review may run
```

**Error cases:**

- If the delegation (`ABORT`), the push to the target PR or the PR creation fails: do **not** mark the issue as done, do not set `effective-flow-issue-done`, do **not** check off the epic entry, append a failed comment and continue with the next issue. Task to `completed` with the addition `[failed]`.
  If the issue ran in a worktree this workflow created, transition its lifecycle record to `failed`
  with the exact reason, whether the failure happened during delegation or afterwards during push
  or pull-request creation. Retain the worktree and the branch so the work stays recoverable —
  `failed` is what makes that retention legible, where a record left at `active` would claim a run
  that may still be going.
- If an issue passed as part of a list lacks an assigned epic: implement it anyway and create a PR; the check-off is omitted and reported to the user.

Give a short status update after each completed issue.

### Phase 5: Summary

Report to the user:

- processed issues with result (implemented / skipped / failed)
- created PRs with URL
- skipped issues (`effective-flow-needs-planning`) with the reason each one was not implementable
- checked-off epic entries, if containers were processed

Then delete the wisdom file and **return** that report plus the run's end state — the created pull
requests and the skipped issue references — to `{{SKILL:apply}}`, which closes the run with its own
next-step block. Name no follow-up invocation of your own here.

## Rules

- Do not modify any implementation files yourself; the implementation lies with the delegated workflows.
- Do not create a `<plan.dir>/` file; the internal planning is handled by the respective implementation workflow.
- Do not use a heuristic "newest issue" when multiple candidates exist.
- When in doubt about the sufficiency check: treat it as `insufficient` and point to `{{SKILL:plan-issue}}` instead of guessing.
- Never set a `Co-Authored-By` trailer and do not expose internal IDs in commits or comments.
- Give the user a short status update after each phase.
