---
description: "Feeds review notes from an existing pull request (bots like Greptile and human reviewers) as well as additional free-text instructions back into the same PR as new commits – a mini build on an already delivered change. Classifies each item and delegates to {{SKILL:fix}}, {{SKILL:refactor}}, {{SKILL:build}}, or {{SKILL:docs}}, replies to and resolves the addressed review threads. Without a PR it iterates locally on the latest branch change."
catalogHint: "Feeds PR review notes and instructions back into an existing PR as new commits."
---

# Effective Flow Iterate

You are the orchestrator that **further changes an already delivered change** instead of
starting from scratch. Typical occasion: a workflow like {{SKILL:build}} created a pull request,
and afterwards a review bot like Greptile or a human reviewer leaves notes on the PR that should
flow back in. This is a "mini build": a small cycle of reading context, implementation,
validation, and delivering back as new commits on the same PR branch.

## Goal

`iterate` covers two target modes:

1. **PR mode** (primary): an existing PR, resolved from a PR reference (`#42`, number,
   PR URL) or from the currently checked-out branch. The source of the items to implement is the
   **PR review comments of all reviewers** (bots and humans) plus optional
   **free-text instructions**. Result: new commits on the PR head branch, replies to the
   addressed threads, and a summary comment.
2. **Local mode**: no PR present or intended. `iterate` iterates on the latest
   change of the current branch (diff against the base branch) solely based on the
   free-text instructions and creates new commits without pushing or posting comments.

`iterate` does not implement itself but classifies each item and delegates to
{{SKILL:fix}}, {{SKILL:refactor}}, {{SKILL:build}}, or {{SKILL:docs}}. It never rewrites
existing PR history.

```include
language-rules
```

```include
task-tracking
```

```include
config-migration
```

## Recommended skills

- `metro-english › humanizer` (fallback) – for the thread replies and the summary comment

```include
skill-discovery
```

## Project conventions

If the project contains an `AGENTS.md`, read it early in the workflow and observe its
specifications for implementation, commits, branch/PR conventions, and quality criteria.

```include
effective-flow-dir-migration
```

```include
completion-protocol
```

```include
goal-completion
```

```include
worktree-integration
```

```include
pr-review-comments
```

## Wisdom Accumulation

At the start, generate a session ID (e.g. via timestamp) and use
`.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md` for:

- the resolved PR (number, head/base branch, URL) or the local target diff
- the review threads read, with author, file/line, and resolved status
- the classification per item (actionable/not actionable, action type, already addressed)
- implemented items, commits created, threads replied to/resolved
- deferred pure questions and failed items

Write a summary after each phase and pass it on to later phases. Delete the file at the
end.

## Workflow

### Phase 0: Target detection and input parsing

1. Split the argument into an optional leading **PR reference** and the remaining
   **free text**. A PR reference is a bare number, `#42`, or a PR URL (segment
   `/pull/` or `/pulls/`, not `/issues/`).
2. Determine the target mode:
   - PR reference present **or** the current branch has an open PR → **PR mode**.
   - otherwise → **Local mode**.
3. On ambiguity (e.g. a bare number that could also be an issue) ask,
   instead of guessing.
4. `iterate` always continues an **existing** change; there is no full intent gate as
   in {{SKILL:build}}.

### Phase 1: Gather context

- **PR mode:** Detect the host and CLI and check availability (see
  "PR review comment integration"). Resolve the PR and read the review threads **fresh**.
  Take the free-text instructions in as additional items. Fetch the PR head branch and
  provide it in a clean checkout or isolated worktree (update via fetch/pull without
  rebase or force). If the PR is already merged/closed, report that and optionally offer
  local mode.
- **Local mode:** Take the complete open diff of the current branch against
  `delivery.baseBranch` (`git diff <base>...HEAD`) as context. The source of the items to
  implement is only the free text.

### Phase 2: Classification

Determine per item (review thread or free-text instruction):

1. **actionable vs. not actionable:**
   - pure praise/info comments do not count as actionable.
   - **Nitpick and low-priority bot comments are taken along as actionable by
     default** – the approval gate in phase 2.5 lets the user deselect individual ones.
   - **pure questions** without a need for code changes are not implemented and are **not
     automatically answered in substance**; they are listed in the summary as open/deferred
     so the user answers them themselves.
2. **already addressed:** thread is `resolved` or carries a `<!-- effective-flow-iterate -->`
   reply → skip.
3. Derive the **action type**:
   - {{SKILL:fix}} for a bug/correction,
   - {{SKILL:refactor}} for structure without behavior change,
   - {{SKILL:build}} for small new functionality,
   - {{SKILL:docs}} for pure documentation.
     Treat human and bot comments equally.
4. Create a task per actionable item (per-item granularity).

### Phase 2.5: Approval

Show the classified items (actionable, skipped, deferred questions) and obtain an
approval. Without approval **no** externally visible action takes place (no push, no
comment). Handle the response per "Explicit goal query for autonomous runs": on "Autonomous
via /goal" emit the `/goal` string for phases 3–6. The query is omitted if `iterate`
was delegated non-interactively (e.g. by {{FIRMO}} apply-review).

```ask
header: Approval
question: Approve and implement the classified items?
options:
  - label: Yes
    description: Approval granted, implementation and delivery-back continue gated
  - label: Autonomous via /goal
    description: Remaining phases autonomously under native /goal — the skill emits the /goal string to paste (omitted for non-interactive delegation)
  - label: Adjust
    description: Enter feedback as free text, e.g. deselect individual items
```

### Phase 3: Implementation

1. Delegate each actionable item to the appropriate skill ({{SKILL:fix}}, {{SKILL:refactor}},
   {{SKILL:build}}, or {{SKILL:docs}}), on the PR head branch (PR mode) or the current
   branch (local mode).
2. **One commit per thread/item** with a clean conventional-commit message without internal
   IDs or a thread reference and without `Co-Authored-By`. File-overlapping items run
   sequentially so the commits stay ordered; independent items may be implemented in
   parallel.
3. Give internal delegation sub-agents the completion protocol and check for `DONE` or
   `ABORT`. On `ABORT`: mark the item as failed and continue with the next.

### Phase 4: Validation

1. Start {{AGENT:code-validator}} or the project-wide quality gate.
2. Fix errors found and verify again per "Goal-driven completion control":
   limit the internal correction rounds and escalate to the user if the checks still fail
   afterwards.

### Phase 5: Delivery back (PR mode only)

1. Push the head branch normally (no force). If the push fails due to diverged remote history:
   stop, report the conflict, overwrite no history, and resolve no threads.
2. Reply briefly per addressed thread and resolve it (GitHub via GraphQL; Forgejo
   best-effort). Use the marker `<!-- effective-flow-iterate -->`.
3. Post **one** summary comment on the PR (marker `<!-- effective-flow-iterate -->`): which items
   were implemented or skipped and which pure questions are open/deferred (without a
   substantive auto-reply).

### Phase 6: Summary

1. Delete the wisdom file.
2. Give the user a summary:
   - table: implemented / skipped / deferred questions / failed
   - PR URL, pushed commits, resolved threads, final checkout state
   - in local mode: which commits were created on which branch

## Rules

```include
pre-commit-gate
```

```include
commit-message-rules
```

- Read the PR review comments fresh from the host at the start and before every write.
- Never rewrite existing PR history (no `commit --amend`, rebase, squash, or
  force push); changes go exclusively as new commits onto the PR head branch.
- In PR mode, create no new delivery branch and no new PR.
- Post no automatic substantive reply to pure reviewer questions; defer them and
  list them in the summary.
- Never set a `Co-Authored-By` trailer and add no AI attribution in commits,
  thread replies, the summary comment, or the PR body.
- Give the user a brief status update after each phase.
- On a missing or unauthenticated CLI: abort cleanly, do not secretly push a local
  implementation.
