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
   addressed threads, and a summary comment — the last of which a delegating caller may suppress.
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

```lazy-include
runtime-state-safety
when: any wisdom, runtime migration, or worktree mutation below `.effective-flow/` is imminent
```

```lazy-include
effective-flow-dir-migration
when: any wisdom, runtime migration, or worktree mutation below `.effective-flow/` is imminent
```

```include
config-migration
```

## Recommended skills

- `pr-review`
- `metro-english › humanizer` (fallback) – for thread replies and the summary comment only when
  resolved `language.forge` is `en`; do not apply English rewriting to German output

```include
skill-discovery
```

## Project conventions

If the project contains an `AGENTS.md`, read it early in the workflow and observe its
specifications for implementation, commits, branch/PR conventions, and quality criteria.

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

## Classification delegation

`pr-review` is the declared domain owner for review-item judgment. Supply its caller-owned Mode C
with the already gathered change context, stable item IDs, authors and locations, thread state,
surrounding-code evidence, linked intent, and Effective Flow's authority constraints. It returns
the provider-neutral `pr-review-handoff/v1` JSON and performs no discovery, implementation, Git,
CI, forge, reply, or resolution action.

Effective Flow remains the caller and owns freshness, approval, action routing, implementation,
one-commit-per-item delivery, replies, and thread resolution. If `pr-review` is unavailable, use
the minimal local classification fallback in Phase 2 and disclose the reduced review depth.

## Wisdom Accumulation

At the start, generate a session ID (e.g. via timestamp) and use
`.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md` for:

- the resolved PR (number, head/base branch, URL) or the local target diff
- the received item filter (free-text-only, an explicit thread-ID list, or none) and whether the
  caller suppressed the summary comment
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
5. **Optional item filter.** A delegating workflow may restrict the run to a subset of the items.
   The filter is a caller contract, not user free text: only a delegation such as
   {{SKILL:pr-review}} sets it, and an interactive invocation never has one. It is announced on its
   own line, in exactly one of two literal forms:
   - `Item filter: free-text-only` — process the free-text instructions and classify **no** review
     thread;
   - `Item filter: threads=<id>,<id>` — process exactly the review threads whose thread ID appears
     in that comma-separated list, plus the free text only when free text was supplied as well.

   Two invariants bind this filter:
   - **An invocation without a filter keeps the current behavior exactly**: every unaddressed
     review thread plus the free text is classified, as before. The filter is purely additive.
   - **A filter that matches no item yields a clean empty run.** It never falls back to processing
     all items; see Phase 2.

   **Fail closed on an unparseable filter.** An invocation that announces `Item filter:` in any
   other form — a different keyword, a missing list, an unreadable ID — is a broken caller contract:
   return `ABORT: unparseable item filter` immediately, before Phase 1. Never continue such a run as
   an unfiltered one: that would silently classify and implement every open item of the pull request
   while the caller believes the run was scoped to one failing check.

   Record the received filter (or its absence) in the wisdom file and carry it into Phase 2.

6. **Optional summary-comment suppression.** A delegating workflow may suppress this run's
   pull-request summary comment. Like the item filter this is a caller contract and never user free
   text, and it is announced on its own line in exactly this literal form:
   - `Summary comment: suppressed` — post **no** summary comment in Phase 5 and hand the same
     content back to the caller, which reports it instead.

   The same two invariants bind it:
   - **An invocation without that line keeps the current behavior exactly**: Phase 5 posts its one
     summary comment, as before. The switch is purely additive, and an interactive invocation never
     carries it.
   - **Fail closed on an unparseable switch.** A line announcing `Summary comment:` in any other
     form is a broken caller contract: return `ABORT: unparseable summary-comment switch`
     immediately, before Phase 1. Never continue such a run as an unsuppressed one — a caller
     suppresses that comment because its own delegated output would otherwise be read back as a
     third party's writing on a later run.

   Suppression removes the **summary comment only**. The thread replies for implemented items,
   their resolution, the commits, and the push are unaffected.

   Record the switch (or its absence) in the wisdom file and carry it into Phase 5.

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

1. Exclude an already addressed thread when it is `resolved` or carries an
   `<!-- effective-flow-iterate -->` reply. Exclude a thread carrying
   `<!-- effective-flow-pr-review -->` as well — that is Effective Flow's own published review
   output, not third-party input — unless the user names those threads explicitly. The
   {{SKILL:pr-review}} gate needs no exclusion of its own: it writes nothing into a review thread,
   so no thread on a pull request is ever the gate's own reply.
2. **Apply the optional item filter** from Phase 0, after the exclusions above:
   - **no filter** — every remaining thread plus the free text enters classification. This is the
     unchanged default and the only behavior an interactive invocation ever sees.
   - **`free-text-only`** — no review thread enters classification, whatever the exclusions left;
     only the free-text instructions do.
   - **`threads=<id>,<id>`** — exactly the threads whose ID is in the list, plus the free text only
     when the delegation supplied free text as well. A caller-supplied ID names its thread
     explicitly, so the marker-based exclusions above do not remove it; a `resolved` thread and a
     thread already carrying an `<!-- effective-flow-iterate -->` reply stay excluded, because this
     workflow already addressed them.
   - **An empty selection is a valid result.** If the filter matches no item — every named thread
     was resolved between the caller's read and this delegation — continue with **no** items:
     report the empty selection, implement nothing, push nothing, reply to nothing, resolve
     nothing, post no summary comment, and end cleanly with `DONE`. Never fall back to processing
     all items, and never read an empty selection as a missing filter.
3. Send every remaining review thread and free-text instruction to `pr-review` Mode C with the
   caller constraints: Effective Flow owns authority, approval, implementation, commits,
   delivery, replies, and resolution; the analysis may only classify supplied context.
4. Require one returned item for every supplied stable ID and map the contract as follows:
   - `valid_in_scope` + `caller_fix` → actionable. Include valid nitpicks and low-priority bot
     findings by default; Phase 2.5 may deselect them.
   - `valid_out_of_scope` → follow-up or no action, never silently widen this PR.
   - `unsupported` → skipped with the returned rationale and optional proposed reply.
   - `question_or_information` → deferred or proposed reply; never implement it as code by
     assumption.
   - `needs_evidence` → gather the named evidence when it is already within the read-only scope
     and submit the item once more; otherwise defer it with the exact missing evidence.
5. For every actionable item, derive the Effective Flow **action type**:
   - {{SKILL:fix}} for a bug/correction,
   - {{SKILL:refactor}} for structure without behavior change,
   - {{SKILL:build}} for small new functionality,
   - {{SKILL:docs}} for pure documentation.
     Treat human and bot comments equally.
6. Create a task per actionable item (per-item granularity).

If `pr-review` is unavailable, apply only the same five classifications from supplied evidence;
never invent missing context, and report that the authoritative review owner was unavailable.

### Phase 2.5: Approval

Show the classified items (actionable, skipped, deferred questions) and obtain an
approval. Without approval **no** externally visible action takes place (no push, no
comment). The approval is omitted if `iterate` was delegated non-interactively
(e.g. by {{FIRMO}} apply-review).

```ask
header: Approval
question: Approve and implement the classified items?
options:
  - label: Yes
    description: Approval granted, implementation and delivery-back continue
  - label: Adjust
    description: Enter feedback as free text, e.g. deselect individual items
```

### Phase 3: Implementation

1. Before delegation, record the analyzed file ownership of every actionable item. Items whose
   analyzed file sets overlap run sequentially; only items with disjoint sets may implement in
   parallel.
2. Delegate each actionable item to the appropriate skill ({{SKILL:fix}}, {{SKILL:refactor}},
   {{SKILL:build}}, or {{SKILL:docs}}), on the PR head branch (PR mode) or the current
   branch (local mode). Each delegation receives its analyzed owned paths and reports its actual
   paths. If it discovers that it must touch a path outside its analyzed set, it must stop before
   modifying that path and return it to the orchestrator. Add the path to the item's actual
   ownership, compare it with every active item's analyzed and actual paths, and serialize the
   affected items before allowing work on that path to continue. Never let two active items edit
   the same path based only on the original analysis.
3. **One commit per thread/item** with a clean conventional-commit message without internal
   IDs or a thread reference and without `Co-Authored-By`. Independent items may implement in
   parallel, but every item uses the commit-integrity mutex below for staging and committing.
   Resolve `language.git` once and pass it to every item for its commit description.
4. Give internal delegation sub-agents the completion protocol and check for `DONE` or
   `ABORT`. On `ABORT`: mark the item as failed and continue with the next.

#### Commit integrity for parallel items

The following mutex applies in both PR and local mode. Parallel delegations may edit disjoint
files concurrently, but all operations that mutate or inspect the shared Git index and `HEAD`
for an item run in one critical section.

Mutex convention:

- Retain one absolute lock handle for the repository at
  `<RUNTIME_STATE_ROOT>/.effective-flow/iterate-commit.lock`. Every item delegation in this
  `iterate` run uses that same handle, including when the execution checkout is an isolated
  worktree.
- Apply "Runtime-state write safety" from `RUNTIME_STATE_ROOT` separately and immediately before
  every mutation of the exact lock directory or its `owner` file. Guard the repository-relative
  target `.effective-flow/iterate-commit.lock` before each acquisition attempt; do not create,
  remove, or modify the lock when a guard blocks.
- Acquire the lock atomically with `mkdir <absolute-lock-handle>`. Immediately after successful
  acquisition, write `<absolute-lock-handle>/owner` with the item identity, delegation identity,
  a unique acquisition token, and timestamp. The successful acquisition and matching owner
  record together prove ownership.
- If the lock exists, read its owner for diagnostics, wait, and retry without touching the index.
  Never infer permission to remove it from age alone. If it appears orphaned, obtain explicit
  user confirmation before removal, then rerun the runtime-state guards for the exact owner file
  and lock directory immediately before deleting either.
- Release the lock on every success, abort, and error path, but only after rereading the owner
  file and verifying that its complete identity and acquisition token match the current item.
  If ownership cannot be verified, do not remove or alter the lock; fail closed and report the
  mismatch.

Before acquiring the mutex, finish the item's configured pre-commit checks. Then, while holding
the lock for the entire sequence:

1. Run `git status --porcelain` and inspect `git diff --cached --name-only` and
   `git diff --cached`. If any staged state already exists, treat it as foreign: do not commit,
   take it over, or clean it up. Release the verified-owned lock and return `ABORT` for the item.
2. Reconfirm that the item's explicit stage list contains only its analyzed and dynamically
   approved actual paths. Stage exactly those paths. Never use `git add .`, `git add -A`,
   `git commit -a`, or an equivalent blanket operation.
3. Inspect `git diff --cached --name-only` and require it to equal the explicit item-owned path
   set, then inspect the complete `git diff --cached` and require every staged hunk to belong to
   the current item. Record the verified staged paths and content before committing.
4. Create the item's conventional commit, capture its hash immediately with
   `git rev-parse HEAD`, and write the `item identity -> commit hash` mapping to the wisdom file.
5. Immediately confirm the committed paths and content against the recorded staged diff. Run
   `git status --porcelain`, require `git diff --cached` to be empty, and inspect the remaining
   working-tree diff. Changes from other active items may remain only when they are unstaged and
   outside this item's owned paths; record that residual state in the wisdom file.

If a check fails before the commit, unstage only paths whose staging is provably attributable to
this item in the current lock acquisition, verify the resulting cached state, release the lock
only after owner verification, and return `ABORT`. Never unstage or otherwise clean foreign
changes. If immediate post-commit confirmation fails, do not amend, reset, rebase, or otherwise
rewrite history: record the discrepancy, release the verified-owned lock, mark the item failed,
and stop delivery for reconciliation.

### Phase 4: Validation

1. Start {{AGENT:code-validator}} or the project-wide quality gate.
2. Fix errors found and verify again per "Goal-driven completion control":
   limit the internal correction rounds and escalate to the user if the checks still fail
   afterwards.

### Phase 5: Delivery back (PR mode only)

1. Push the head branch normally (no force). If the push fails due to diverged remote history:
   stop, report the conflict, overwrite no history, and resolve no threads.
2. Reply briefly per addressed thread, preserving the clearly established thread language or
   otherwise using resolved `language.forge`, and resolve it through the remote helper's normalized
   review-thread operations. If resolution is an unsupported provider capability, keep the reply
   and report the required manual resolution. Use the marker `<!-- effective-flow-iterate -->`.
3. Post **one** summary comment on the PR in resolved `language.forge` (marker
   `<!-- effective-flow-iterate -->`): which items
   were implemented or skipped and which pure questions are open/deferred (without a
   substantive auto-reply). **Skip this step entirely when Phase 0 received
   `Summary comment: suppressed`**: post nothing at all and hand exactly that content back to the
   caller in the Phase 6 summary instead.
4. Declare to the handback of "Delivery and worktree integration" that this workflow supplies
   **no** complete finding set — it has no reviewer phase at all — so an automatic PR review
   reviews the pull request itself.

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
- Post **at most one** summary comment per run, and none at all when the caller announced
  `Summary comment: suppressed`; that content then goes back to the caller instead.
- Never set a `Co-Authored-By` trailer and add no AI attribution in commits,
  thread replies, the summary comment, or the PR body.
- Give the user a brief status update after each phase.
- On a missing or unauthenticated CLI: abort cleanly, do not secretly push a local
  implementation.
