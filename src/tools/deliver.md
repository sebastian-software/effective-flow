---
description: "Turns a confirmed selection of current-session local changes into coherent commits on a fresh delivery branch and opens a pull request without changing the source checkout."
catalogHint: "Delivers confirmed local changes as coherent commits in a clean pull request."
---

# Effective Flow Deliver

You turn an exact, user-confirmed selection of local changes into one or more coherent commits on a
fresh delivery branch, then open a pull request. You leave the source checkout and its index
unchanged.

```include
task-tracking
```

```include
delegation-mandate
```

```lazy-include
language-rules
when: commit and forge output languages are resolved
```

```lazy-include
config-migration
when: the Effective Flow configuration is first read or a legacy config is migrated
```

```lazy-include
runtime-state-safety
when: worktree lifecycle state below .effective-flow is read or mutated
```

```lazy-include
effective-flow-dir-migration
when: worktree lifecycle state below .effective-flow is read or mutated
```

```include
execution-location
```

```include
worktree-lifecycle
```

```lazy-include
session-title
when: the confirmed delivery subject is known and whether a session title is due must be decided
```

```lazy-include
session-rename
when: the confirmed delivery subject is known and a session title is about to be applied or emitted
```

```include
completion-protocol
```

```lazy-include
next-steps
when: the run reaches its completion report
```

## Goal

- derive the candidate files and selected states from changes made in the current session
- require confirmation of the exact ordered selection as the sole routine approval
- derive and display an exact ordered commit partition, then continue automatically
- transfer only those states to a fresh branch/worktree based on the refreshed configured base
- stage and commit one derived coherent group at a time through `{{SKILL:commit}}`
- call commit-only `{{SKILL:pr}}` only after every group is a verified commit
- preserve the source checkout byte-for-byte and index-for-index

This tool always targets a pull request. Its invocation is itself affirmative current-run PR intent,
so it does not inherit `delivery.completion`. Existing pull-request updates belong to
`{{SKILL:iterate}}`, not this fresh-branch workflow.

## Recommended skills

- `effective-delivery`

```include
skill-discovery
```

## Project conventions

Read the project's `AGENTS.md` before any mutation. Use the repository's configured base, branch
prefix, setup, validation, language, and forge conventions. No external dependency is required: use
the shipped dependency-free `scripts/delivery-selection.mjs` helper for its `inventory`,
`bind-manifest`, `verify-source`, `transfer`, and `reconcile` operations.

## Selection contract

There is no structured public path argument. Reconstruct the candidate from the current session's
known output set and concrete file-operation evidence, then reconcile it with the helper's NUL-safe
`inventory {root}` result for staged, unstaged, untracked, deleted, renamed, and partially staged
paths. Recency or repository dirt alone is never evidence that a path belongs to this session.

For every candidate, show the exact repository-relative literal path, state, and selection origin in
a stable order. A partially staged path exposes its staged state and full working-tree state as two
different choices. Never collapse them or infer which one the user means.

If session and Git evidence are absent, incomplete, contradictory, or admit several scopes, interact
with the user until the exact manifest is clear. The user may identify unstaged or untracked paths in
normal conversation; reconcile every name literally against Git instead of interpreting a glob,
directory, alias, or inferred path. Abort before branch, worktree, index, commit, remote, or forge
mutation when exact agreement cannot be reached.

Always show the complete ordered manifest immediately before asking:

```ask
header: Selection
question: Should exactly this ordered file/state manifest be delivered?
options:
  - label: Confirm
    description: Bind this exact selection and continue automatically through grouping and delivery
  - label: Refine
    description: Correct the files or selected states before any mutation
```

Confirmation binds the helper's internal ordered `selection: [{path, state}]` array, where `state`
is exactly `staged` or `working`; it does not introduce a public structured-input syntax. Reject
paths outside the repository, ignored paths, force-add
behavior, directories, globs, aliases, and untracked symlinks. Preserve a tracked symlink as its link
blob and mode without dereferencing it. Bind each selected state to source `HEAD`, source blob/mode or
absence, selected content digest/blob/mode or tombstone, and both rename endpoints without printing
file contents.

This manifest confirmation is the sole routine approval. An affirmative answer authorizes automatic
derivation, non-blocking display, validation, and sequential execution of coherent commit groups,
subject to every drift check, invariant, verification step, and abort boundary below.

## Approach

### 1. Establish immutable source evidence

1. Issue and verify a source execution-location receipt before any operation that may write. Record
   the source `HEAD`, branch or detached OID, complete index state, worktree state, repository
   identity, `EXECUTION_ROOT`, and `RUNTIME_STATE_ROOT`.
2. Resolve `language.git` and `language.forge`. Read `delivery.baseBranch`,
   `delivery.branchPrefix`, `worktree.baseDir`, and `worktree.setup` through the shared configuration
   contract. `deliver` reports that its explicit PR intent replaces any different configured
   `delivery.completion`; it does not change the stored value.
3. Resolve and confirm the selection contract above. Invoke `bind-manifest` with
   `{sourceRoot, selection}` and retain the returned ephemeral manifest plus source receipt for every
   later comparison. Do not write it to tracked files or runtime state.
4. Verify after confirmation that source `HEAD`, the complete source index, and every selected state
   still match the captured evidence through `verify-source {manifest, sourceRoot}`. Drift requires
   a newly displayed and confirmed manifest.

### 2. Derive and display coherent commit groups

Derive candidate groups from the current session's task boundaries and substantive diff
relationships. Present a non-blocking progress update that lists each group in order with its exact
selected paths and tentative Conventional Commit type/effect, then continue automatically without a
commit-group approval or refinement round. Before creating the delivery worktree, validate that the
groups form a complete, non-overlapping ordered partition: every confirmed path belongs to exactly
one group and the ordered union equals the confirmed manifest exactly.

If a path's topic, group, order, or effect cannot be resolved unambiguously, report the exact
unresolved path or decision and abort before staging. Never guess, create a mixed catch-all commit,
silently broaden the manifest, or restore a commit-group question as a fallback.

### 3. Create the isolated delivery branch

1. Revalidate the source receipt and runtime root. Refresh the configured remote base and resolve its
   exact OID before creating delivery artifacts.
2. Derive a collision-safe `<delivery.branchPrefix>/deliver/<slug>` name. Verify both the proposed
   branch and absolute worktree path are unused in refs and `git worktree list --porcelain`.
3. Create a fresh branch/worktree from the refreshed base without switching, adopting, stashing,
   cleaning, resetting, or otherwise changing the source checkout. Issue a separate
   `effective-flow-created` receipt with purpose `partial-diff`, record the exact creation OID and
   current-run ownership flags, and initialize its version 1 lifecycle record as `active` with
   branch policy `retain`. Receipt or record failure retains both artifacts and stops.
4. Run setup only for the newly owned receipt according to `worktree.setup`, record its terminal
   setup status, then require its tracked tree and index to remain clean. A tracked setup change is
   not selected content and aborts before transfer.

The source may be detached, on the configured base, dirty, or harness-managed. Those states are why
this tool creates its own verified delivery worktree; they never authorize switching or committing
in the source checkout.

### 4. Transfer and validate the confirmed selection

1. Revalidate both receipts and invoke `transfer` with
   `{manifest, sourceRoot, deliveryRoot, deliveryReceipt: {repositoryIdentity, executionRoot,
headOid}}` in its default redacted dry-run mode. Inspect the planned paths, modes, additions,
   modifications, deletions, and rename endpoints; no file content may appear in its output.
2. Invoke the same `transfer` payload with `--apply` only when the dry run matches the confirmed
   manifest. The helper compares the refreshed base blob with the captured source-HEAD blob. It may
   apply a selected delta directly only when the base is unchanged; otherwise it uses deterministic
   three-way application and fails closed on unresolved content, binary, mode, rename, or
   delete/modify conflicts.
3. Run the repository's established pre-commit validation in the isolated checkout under
   `effective-delivery`'s repository-validation contract. Do not invent commands or duplicate its
   validation playbook here.
4. Immediately after validation, invoke
   `reconcile {manifest, deliveryRoot, sourceRoot}` to compare every selected content digest/blob
   and mode plus the complete changed-path set with the confirmed manifest. Any selected drift,
   missing or extra path, different origin, or validation-produced change stops and requires a new
   selection; never silently refresh or broaden the manifest.
5. Revalidate that the source receipt, source `HEAD`, complete source index, and non-selected source
   paths are unchanged. A mismatch retains the delivery artifacts and blocks commit and PR.

### 5. Commit each derived group

Process groups sequentially in their displayed order:

1. Stage only the current group's literal paths in the verified delivery `EXECUTION_ROOT`. Never use
   a repository-wide staging sweep. Reconcile the complete staged path set with exactly that group.
2. Record the exact expected index-tree OID and pre-commit `HEAD`.
3. Delegate to `{{SKILL:commit}}` with the full delivery execution-location receipt, exact branch,
   resolved base, declared group paths, expected index-tree OID, and this literal line:

   `Next steps: suppressed`

4. Require the returned commit OID to be a new child of the expected `HEAD` on the exact delivery
   branch, and require its tree OID to equal the expected index-tree OID. Verify the residual changed
   paths equal the ordered union of all later groups, with no staged residue from the completed
   group. Advance the receipt's expected commit only after all checks pass.

If delegation, a hook, tree comparison, receipt validation, or residual comparison fails, preserve
the worktree, branch, verified earlier commits, and remaining uncommitted groups. Report the exact
boundary and expected/actual state; never amend, squash, reorder, delete, or retry successful
commits, and never push or create a PR.

### 6. Publish only the verified commits

After every group is a verified commit, require a clean delivery worktree and a non-empty commit
range against the refreshed base. Record the final head OID and strongest Conventional Commit effect
across the range. Transition only the run-owned lifecycle record through `cleanup-ready` and
`cleanup-in-progress`, remove only its verified clean worktree without force, reconcile the result,
and retain the local branch.

Delegate to `{{SKILL:pr}}` from the verified `RUNTIME_STATE_ROOT` with the exact head branch, base
branch, final verified head OID, successful committed-handoff evidence, strongest type/effect hint,
and this literal line:

`Next steps: suppressed`

`pr` may push and create or reuse the exact head/base pull request; it must not stage, commit, create
a branch, or publish a changed OID. On mutation uncertainty, use the exact head/base lookup once and
never repeat a possibly successful creation. A PR failure retains the committed branch and reports
its exact state.

### 7. Report

Report the confirmed selected paths/states, ordered groups, created commit OIDs, delivery branch,
base, pull-request URL, lifecycle result, explicit-PR override when configuration differed, and the
final source-checkout/index comparison. Never report file content or claim that `delivery.completion`
was changed. Emit the `deliver` next-step block last unless this run itself received
`Next steps: suppressed`.

## Abort boundaries

Every helper call must return its normalized `{ok, operation, data, dryRun}` envelope. A failure
uses the helper's stable code, details, and exit code; report that structured diagnostic and stop at
the operation's mutation boundary instead of guessing a recovery or calling an unrecognized
operation.

- No meaningful selected diff against the refreshed base creates no commit or PR; clean up only
  empty artifacts proven current-run-owned.
- A dirty direct `{{SKILL:pr}}` invocation is not a fallback. Keep the exact manifest in this tool.
- An existing open PR is not updated here; use `{{SKILL:iterate}}` or an explicitly prepared branch
  followed by staged-only `{{SKILL:commit}}` and commit-only `{{SKILL:pr}}`.
- Never treat all current dirt as session-owned, force-add ignored content, dereference an untracked
  symlink, overwrite newer base content, rewrite commit history, or force cleanup.
- A failure after artifact creation records `aborted`, `failed`, or `cleanup-failed` through the
  shared lifecycle contract when safely possible and otherwise retains the artifacts with the
  failed proof.
