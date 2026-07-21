
# Effective Flow Apply Review – Commit mechanics

This internal sub-file is loaded by `tools/apply-review.md` as soon as the commit strategy `Individually` or `Individually with worktrees` is fixed in Phase 2. With `No commits` it is not needed.

**Load on demand:** Read `shared/runtime-state-safety.md`, when the commit lock or a component worktree below `.effective-flow/` is about to be mutated.

**Load on demand:** Read `shared/effective-flow-dir-migration.md`, when the commit lock or a component worktree below `.effective-flow/` is about to be mutated.

#### Git commit mutex for "Individually"

If the commit strategy **Individually** was chosen, a global commit mutex applies to all delegation sub-agents. The mutex protects the entire critical git section, not just the final `git commit`.

Goal: parallel sub-agents may edit files at the same time, but must never perform staging or commit at the same time. This ensures a finding commit contains only changes of that finding.

Mutex convention:

- Lock handle: absolute
  `<RUNTIME_STATE_ROOT>/.effective-flow/apply-review-commit.lock`. Every concurrent delegation
  for the repository uses this one retained main-checkout handle, even when its
  `EXECUTION_ROOT` is linked or native.
- If the runtime directory is missing, from `RUNTIME_STATE_ROOT` apply “Runtime-state write
  safety” to that exact parent directory immediately before its `mkdir`. Immediately before
  every acquisition attempt, from the same root apply the guard again to the exact
  repository-relative lock target `.effective-flow/apply-review-commit.lock`. Do not create or
  remove a lock when the relevant guard blocks.
- Lock acquisition: atomically via `mkdir <absolute-lock-handle>`.
- Lock content: after a successful acquisition, write a short `owner` file below that absolute
  lock handle, with finding ID, component and timestamp.
- Lock release: delete only the lock you acquired yourself, after a commit success, commit abort or error handling.
- If the lock already exists: wait and retry. If the lock clearly seems orphaned, ask the user before removing it.

Critical section under the lock:

1. Run `git status --porcelain`.
2. If staged changes are already present that do not clearly belong to this finding: **do not commit**, inform the user and end with `ABORT` for this finding. Foreign staged changes must not be taken over or cleaned up.
3. Stage exclusively the files known from the pre-analysis and the actual implementation of this finding. Do not use blanket commands like `git add .`, `git add -A` or `git commit -a`.
4. Check `git diff --cached --name-only`. The list may only contain files of this finding.
5. Check `git diff --cached` whether the staged diff belongs content-wise to the current finding.
6. Run the commit with the message fixed in Phase 2.
   Its human-readable description uses the `language.git` value resolved by the orchestrator;
   the Conventional Commit type and other machine tokens remain stable English/ASCII.
7. Determine the commit hash directly afterwards with `git rev-parse HEAD` and log the `finding ID -> commit hash` mapping in the wisdom file.
8. Run `git status --porcelain` directly afterwards and log in the wisdom file whether uncommitted changes of other parallel findings still lie in the working tree. These residual changes are allowed as long as they are not staged and not part of the current commit.

If a check in the critical section fails, the sub-agent must unstage its own staged changes as far as clearly possible, release the lock and report `ABORT: [reason]`.

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

#### Git worktree isolation for "Individually with worktrees"

If the commit strategy **Individually with worktrees** was chosen, a worktree isolation per delegation component applies instead of the git commit mutex.

Preconditions:

- The original working tree must be clean before creating the worktrees (`git status --porcelain` empty), apart from ignored Effective Flow files under `.effective-flow/`.
- `git worktree` must be available.
- Read the Effective Flow configuration (project-setup ADR), if present. If it is missing or contains no worktree values, use the defaults.
- Issue and verify the original integration root's own execution-location receipt before
  creating any component worktree. That receipt retains the verified main checkout as
  `RUNTIME_STATE_ROOT`, even if the original integration root is itself linked or native.
  Revalidate both roots before every integration or runtime-state write.

Worktree paths:

1. Determine the repo name from `basename "$(git rev-parse --show-toplevel)"`.
2. Use `applyReview.worktree.baseDir` from the Effective Flow configuration (project-setup ADR) as the BaseDir, or the default `.effective-flow/.worktrees`.
   Resolve a relative BaseDir against `RUNTIME_STATE_ROOT`; an explicitly configured absolute
   external BaseDir remains absolute and must still pass the environment and ownership checks.
3. Create worktrees under:
   `BASE_DIR/REPO_NAME/SESSION_ID/GROUP_NAME`
4. `GROUP_NAME` must be deterministic, short and filesystem-safe and identify the component from Phase 4.2, e.g. `component-1`, `component-2` or a slugified component description. Not an action-bound name, since a component can contain findings of multiple actions.

The default deliberately lies inside the project root. This keeps worktree creation, file changes and setup commands within the usual workspace sandbox. External BaseDirs are to be used only if they are explicitly fixed in the Effective Flow configuration (project-setup ADR) and the environment allows write and execute rights for them.

Branch convention:

- Per component: `apply-review/<SESSION_ID>/<GROUP_NAME>`
- When the concrete worktree path is below `.effective-flow/`, resolve every missing base or
  parent directory. From `RUNTIME_STATE_ROOT`, apply “Runtime-state write safety” to each exact
  directory immediately before its `mkdir`. Guard the exact absolute `WORKTREE_PATH` separately
  from that same root and immediately before the worktree operation. Create the worktree with:
  `git worktree add <WORKTREE_PATH> -b <BRANCH_NAME> HEAD`
- Immediately issue and verify a separate `effective-flow-created` execution-location receipt
  for the component path, branch, repository, component owner and `apply-review` purpose. Keep
  the original integration root under its own receipt and the main checkout under the unchanged
  runtime-state handle. If component receipt creation fails, retain the new worktree for
  reconciliation and do not delegate.

Setup detection in the worktree:

- `applyReview.worktree.setup: "auto"` or a missing value:
  - `pnpm-lock.yaml` → `pnpm install --frozen-lockfile --prefer-offline`
  - `package-lock.json` → `npm ci`
  - `yarn.lock` → `yarn install --frozen-lockfile`
  - `Cargo.toml` → `cargo fetch --locked`
  - `go.mod` → `go mod download`
  - `uv.lock` → `uv sync --frozen`
  - `poetry.lock` → `poetry install --sync`
  - no known file → no setup
- `applyReview.worktree.setup: "none"`: run no setup.
- `applyReview.worktree.setup` as a string: run this explicit setup command in the worktree.

Git hooks are not used for this setup. The setup is an explicit `apply-review` step so that it stays visible, reproducible and limited to the temporary worktree.

Before running the worktree setup, briefly show which setup mode is active and which command is planned. With `setup: "none"` no install/fetch command is run; if a sub-agent later fails due to missing dependencies, name the setup profile in the summary as a possible cause.
Record the component receipt's final setup status as `complete` or `skipped` before delegation.

Delegation in the worktree:

- Pass the delegation sub-agent the component receipt and its canonical absolute execution
  root together with the unchanged canonical `RUNTIME_STATE_ROOT`. Require its fail-closed
  preflight before the first write and explicitly rooted file, shell, validation, staging and
  commit operations throughout. Reports, backlinks, memory, cache, migrations, and wisdom use
  only retained absolute handles below the runtime root.
- Pass it the commit strategy `Individually with worktrees`.
- Within the verified component root, sub-agents commit after each finding individually,
  without an internal finding ID in the commit message.
- Log in the wisdom file per finding: execution-location receipt, commit hash and commit message.

Integration back into the original branch:

1. Wait for all worktree component final statuses.
2. Process the successful components in the **deterministic component order from Phase 4.2, step 5** (by report position of their first finding). Determine per component the new commits on its branch since `HEAD` of the original branch, in component order.
3. Revalidate the original integration receipt, then integrate the commits back into that
   verified root sequentially with `git -C <ORIGINAL_ROOT> cherry-pick <commit>`.
4. On a cherry-pick conflict: first run the cherry-pick conflict assessment. Resolve low-risk conflicts directly; ask the user only on high-risk or unclear conflicts.
5. After successful integration and validation, reverify each component receipt and clean
   state. Remove the worktree and delete the temporary branch only when the ownership-safe
   cleanup contract proves that this exact component was Effective Flow-created. Otherwise
   retain both and report the mismatch. Never remove, rename, or otherwise alter
   `RUNTIME_STATE_ROOT` or its local review state.
6. On a failed component: keep the worktree and branch for now, name the paths in the summary and obtain a user decision on cleanup.

Cherry-pick conflict assessment:

1. Capture the conflict state:
   - `git status --porcelain`
   - affected conflict files
   - current commit, worktree branch and finding assignment from the wisdom file
   - conflict markers and affected sections per file
2. Assess the risk per file and for the entire conflict.

A conflict counts as **low-risk** only if all conditions are met:

- The conflict is small, locally contained and unambiguously understandable.
- The affected changes are additive or mechanically combinable.
- There are no contradictory functional statements.
- No code paths with non-obvious runtime logic are affected.
- The resolution requires no new architecture or product decision.

Typical low-risk cases:

- identical changes on both sides
- additive Markdown or documentation sections that can both be preserved
- independent entries in lists, tables or changelogs
- trivial ordering conflicts without semantic meaning
- formatting or comment conflicts without effect on behavior

A conflict counts as **high-risk** as soon as at least one condition applies:

- Production code, tests with behavior assertions, public APIs, schemas, migrations, lockfiles or build/runtime configurations are affected.
- Both sides change the same logic, the same control flow, the same data structure or the same error message with a different meaning.
- The resolution could remove, hide or recombine behavior.
- The conflict area is large, distributed or not safely assessable without full context.
- An automatic resolution would make assumptions about product behavior, architecture or priority between findings.

When in doubt, treat the conflict as high-risk.

Automatic resolution of low-risk conflicts:

1. Edit exclusively the conflict-affected files.
2. Preserve both sides if they are independent and additive.
3. Remove conflict markers completely.
4. Stage only the resolved conflict files with explicit paths.
5. Run `git cherry-pick --continue`.
6. Log in the wisdom file: commit, worktree branch, affected files, risk level, resolution strategy and rationale.

User query on high-risk or unclear conflicts:

Stop the integration and give the user a compact conflict assessment:

- commit and worktree branch
- affected files
- conflict type per file
- suspected cause
- risk level with rationale
- proposed options:
  - resolve manually
  - specify a concrete resolution strategy
  - skip the commit
  - abort the workflow

Do not perform any automatic conflict resolution as long as the user has given no direction.
