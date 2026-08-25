## Verified execution location

Every write-capable phase and delegated worker uses an **execution-location receipt**. The
receipt keeps `EXECUTION_ROOT` and `RUNTIME_STATE_ROOT` separate: tracked project work follows
the selected checkout, while private `.effective-flow/` state remains in the repository's main
checkout. It replaces any assumption that a one-time `cd`, an inherited current working
directory, or a subagent spawn option will keep later operations in the intended checkout.

### Receipt

Create the receipt before worktree creation, report-source resolution, or the first
write-capable action, whichever comes first. Pass it unchanged to every worker that may edit
files, read or mutate runtime state, run a formatter or a test that writes caches, run setup,
stage or commit, switch branches, or clean up a worktree. Record:

- the canonical absolute repository identity: the physical path returned by
  `git rev-parse --git-common-dir`, resolved against the command's working directory when Git
  returns a relative path;
- `EXECUTION_ROOT`, the canonical absolute execution root from
  `git rev-parse --show-toplevel`;
- `RUNTIME_STATE_ROOT`, the canonical absolute main-checkout root resolved by the procedure
  below;
- the checkout identity: either the exact branch name, or `detached` plus the exact commit OID
  when detached HEAD is explicitly expected;
- the origin: `in-place`, `harness-managed`, or `effective-flow-created`;
- setup ownership and status: who may run setup and whether it is pending, complete, skipped,
  or externally managed;
- the workflow or component that owns the receipt and its purpose.

Canonicalize paths before comparison: resolve symlinks, `..`, relative segments, and platform
case behavior through the host's physical-path facility. Path shape does not prove ownership.
A pre-existing user-created linked worktree counts as `harness-managed` for lifecycle purposes:
it is external to Effective Flow and must not be removed by this workflow.

### Runtime-state root

Before report-source resolution or any operation that may create or enter a delivery, native,
or component worktree, run `git worktree list --porcelain` from the verified current checkout.
Parse records by their empty-line separator and use only the first record, which Git defines as
the main worktree. The first record of `git worktree list --porcelain` must begin with exactly
one `worktree <path>` line. Reject a missing or duplicate path field, an empty path, or any record
that contains the boolean line `bare`. A `bare` first record has no usable main checkout and
therefore cannot own runtime state.

Canonicalize that path physically and require it to exist as a directory. From the candidate
root, require `git rev-parse --show-toplevel` to resolve back to the same root and
`git rev-parse --git-common-dir` to resolve to the same canonical Git common directory recorded
as the repository identity in the execution receipt. Record the result as
`RUNTIME_STATE_ROOT`. In an in-place run from the main checkout, `EXECUTION_ROOT` and
`RUNTIME_STATE_ROOT` are the same physical path. In a linked, native, delivery, or component
worktree, they differ.

Entering or creating another worktree changes only `EXECUTION_ROOT` and its checkout fields; it
must not change `RUNTIME_STATE_ROOT`. Revalidate the retained runtime root from the current
porcelain first record and its common-directory identity before every runtime-state read or
mutation and after resume or Handoff. A missing, moved, newly bare, repository-mismatched, or
otherwise unusable runtime root fails closed. Preserve every checkout and all existing state;
never fall back to `EXECUTION_ROOT`. If the root is valid but its runtime-state safety checks
fail, direct the user to `effective-flow setup` as specified by that contract.

### Fail-closed preflight

At each write-capable orchestrator or worker boundary, and again after resume or Handoff,
verify from the receipt's absolute execution root:

1. `git rev-parse --show-toplevel` resolves to the recorded execution root.
2. `git rev-parse --git-common-dir` resolves to the recorded repository identity.
3. `git branch --show-current` equals the recorded branch. If detached HEAD was explicitly
   recorded instead, the branch output must still be empty and `git rev-parse HEAD` must equal
   the recorded OID.
4. For a linked worktree, `git worktree list --porcelain` contains an entry whose canonical
   path and checkout identity match the receipt.

If any value is missing, cannot be canonicalized, or differs, abort before writing. Report the
expected and actual root and checkout identity, and retain every checkout. Do not edit, run
setup, run a formatter or test that may write, stage, commit, switch branches, or clean up.

After a Handoff or resume, a harness may provide a different execution root. Adopt it only by
issuing a new `harness-managed` receipt after proving the same repository identity and that the
expected work is present and consistent. Otherwise abort for reconciliation. A prior successful
preflight never authorizes later writes from an unverified runtime location.

### Rooted operations

After preflight, root tracked project, validation, staging, commit, and worktree lifecycle
operations in `EXECUTION_ROOT`:

- pass the absolute root as the per-call working directory when the harness supports it;
- use absolute paths for file tools;
- use `git -C <EXECUTION_ROOT> ...` for Git operations when a per-call working directory is not
  guaranteed.

Do not rely on a previous `cd` or on a worker inheriting the orchestrator's current directory.
If a worker cannot establish and verify the assigned root, it returns `ABORT` without writes.
Edits, validation, commits, and lifecycle operations for one receipt stay in that receipt's
execution root; component and delivery receipts are never interchangeable.

Root every `.effective-flow/` read, collision check, directory creation, report or backlink
write, cache or memory read/write, migration, and wisdom operation in `RUNTIME_STATE_ROOT`.
Resolve the concrete target to an absolute handle before entering another worktree and retain
that handle. For an existing path, physically canonicalize the path itself; for a target that
does not exist yet, physically canonicalize its nearest existing ancestor and append only the
validated missing path segments. The result must remain below the canonical absolute
`<RUNTIME_STATE_ROOT>/.effective-flow/` directory, and report handles must remain below
`<RUNTIME_STATE_ROOT>/.effective-flow/review/`. Reject `..`, path aliasing, or any existing
symlink that escapes those directories. A project-relative path is only presentation; it is
never an operational handle after the roots diverge.

Root every forge operation in `RUNTIME_STATE_ROOT` as well — for a different reason than runtime
state. A provider CLI such as `gh` or `tea` resolves its repository context from its working
directory, and the execution worktree is not guaranteed to exist when that call happens: the
completion action runs after an Effective Flow-owned worktree may already have been withdrawn, so
an inherited execution directory can be a deleted path. Pass the absolute runtime root as the
per-call working directory for every remote-helper invocation and for the repository-wide Git
operations that accompany a completion action, such as refreshing the base ref, resolving refs and
pushing the delivery branch. Those act on refs, not on a working tree. This holds while the
execution worktree still exists, so the behavior does not depend on cleanup order. It never
redirects tracked project work, and never any operation that reads or changes a working tree —
branch creation, branch checkout, cleanliness checks and a default derived from the checked-out
branch all stay in `EXECUTION_ROOT`.

### Harness-owned worktrees

- **Claude Code:** Subagents start from the parent context and directory changes do not persist
  as a portable cross-call contract. Native `isolation: worktree` creates a separate
  Claude-managed worktree. Use it only for a deliberately self-contained delegation that does
  not need an already selected Effective Flow worktree. Never combine native isolation with an
  assigned Effective Flow execution root.
- **Codex app:** A Codex app worktree is harness-managed, may start in detached HEAD, and remains
  associated with its task across Handoff. Reuse and revalidate it; do not wrap it in another
  Effective Flow worktree or remove it. Detached HEAD is valid only when the receipt explicitly
  pins its OID. If delivery requires a branch, create or adopt that branch through the supported
  app flow, then issue and verify a new branch receipt before committing.

The standalone `effective-flow deliver` partial-diff lifecycle is the narrow exception to reusing a
harness-managed source checkout as the delivery checkout. Its dirty or detached source receipt is
immutable input evidence, not the place where delivery work occurs. After confirming an exact
selection, `deliver` may create a separate `effective-flow-created` delivery worktree from the
refreshed configured base, issue a new purpose-scoped receipt for that worktree, and transfer only
the bound selection. It never switches, adopts, stages, commits in, or removes the harness-managed
source checkout. The source and delivery receipts remain distinct and must both pass preflight at
every cross-check; neither receipt may be substituted for the other.

### Setup and cleanup ownership

Automatic setup runs only when a receipt is `effective-flow-created` and its setup status is
`pending`. A reused linked or harness-native worktree is assumed to be prepared by its owner;
mark setup `externally managed` and do not repeat it. Run setup there only after an explicit user
request, or after reporting a missing prerequisite and obtaining the workflow's required
decision.

Remove a worktree or delete its temporary branch only when all of these are true:

1. Its receipt says `effective-flow-created` and names this workflow/component and purpose.
2. A fresh fail-closed preflight matches the recorded repository, root, and checkout identity.
3. `git worktree list --porcelain` still contains the matching entry.
4. The worktree is clean under the workflow's existing cleanup policy; unexpected untracked or
   modified files make it dirty.

If any proof fails, retain the worktree and branch and report why. Never force-remove a dirty,
moved, missing, mismatched, reused, in-place, user-owned, or harness-managed worktree. A failure
between `git worktree add` and successful receipt creation also leaves the new worktree in place
for manual reconciliation.

Cleanup targets only the exact Effective Flow-owned execution/component worktree named by its
receipt. It must never remove, rename, or otherwise alter `RUNTIME_STATE_ROOT` or use the runtime
root as a cleanup target. Runtime reports, backlinks, memory, caches, migrations, and wisdom
state remain in the main checkout after an owned worktree is removed.
