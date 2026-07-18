
# Effective Flow Apply Review – Commit mechanics

This internal sub-file is loaded by `tools/apply-review.md` as soon as the commit strategy `Individually` or `Individually with worktrees` is fixed in Phase 2. With `No commits` it is not needed.

#### Git commit mutex for "Individually"

If the commit strategy **Individually** was chosen, a global commit mutex applies to all delegation sub-agents. The mutex protects the entire critical git section, not just the final `git commit`.

Goal: parallel sub-agents may edit files at the same time, but must never perform staging or commit at the same time. This ensures a finding commit contains only changes of that finding.

Mutex convention:

- Lock path: `.effective-flow/apply-review-commit.lock`
- Lock acquisition: atomically via `mkdir .effective-flow/apply-review-commit.lock`
- Lock content: after a successful acquisition, write a short owner file, e.g. `owner`, with finding ID, component and timestamp.
- Lock release: delete only the lock you acquired yourself, after a commit success, commit abort or error handling.
- If the lock already exists: wait and retry. If the lock clearly seems orphaned, ask the user before removing it.

Critical section under the lock:

1. Run `git status --porcelain`.
2. If staged changes are already present that do not clearly belong to this finding: **do not commit**, inform the user and end with `ABORT` for this finding. Foreign staged changes must not be taken over or cleaned up.
3. Stage exclusively the files known from the pre-analysis and the actual implementation of this finding. Do not use blanket commands like `git add .`, `git add -A` or `git commit -a`.
4. Check `git diff --cached --name-only`. The list may only contain files of this finding.
5. Check `git diff --cached` whether the staged diff belongs content-wise to the current finding.
6. Run the commit with the message fixed in Phase 2.
7. Determine the commit hash directly afterwards with `git rev-parse HEAD` and log the `finding ID -> commit hash` mapping in the wisdom file.
8. Run `git status --porcelain` directly afterwards and log in the wisdom file whether uncommitted changes of other parallel findings still lie in the working tree. These residual changes are allowed as long as they are not staged and not part of the current commit.

If a check in the critical section fails, the sub-agent must unstage its own staged changes as far as clearly possible, release the lock and report `ABORT: [reason]`.

#### Git worktree isolation for "Individually with worktrees"

If the commit strategy **Individually with worktrees** was chosen, a worktree isolation per delegation component applies instead of the git commit mutex.

Preconditions:

- The original working tree must be clean before creating the worktrees (`git status --porcelain` empty), apart from ignored Effective Flow files under `.effective-flow/`.
- `git worktree` must be available.
- Read the Effective Flow configuration (project-setup ADR), if present. If it is missing or contains no worktree values, use the defaults.

Worktree paths:

1. Determine the repo name from `basename "$(git rev-parse --show-toplevel)"`.
2. Use `applyReview.worktree.baseDir` from the Effective Flow configuration (project-setup ADR) as the BaseDir, or the default `.effective-flow/.worktrees`.
3. Create worktrees under:
   `BASE_DIR/REPO_NAME/SESSION_ID/GROUP_NAME`
4. `GROUP_NAME` must be deterministic, short and filesystem-safe and identify the component from Phase 4.2, e.g. `component-1`, `component-2` or a slugified component description. Not an action-bound name, since a component can contain findings of multiple actions.

The default deliberately lies inside the project root. This keeps worktree creation, file changes and setup commands within the usual workspace sandbox. External BaseDirs are to be used only if they are explicitly fixed in the Effective Flow configuration (project-setup ADR) and the environment allows write and execute rights for them.

Branch convention:

- Per component: `apply-review/<SESSION_ID>/<GROUP_NAME>`
- Create the worktree with:
  `git worktree add <WORKTREE_PATH> -b <BRANCH_NAME> HEAD`

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

Delegation in the worktree:

- Start the delegation sub-agent with the working directory `<WORKTREE_PATH>`.
- Pass it the commit strategy `Individually with worktrees`.
- Within the worktree, sub-agents commit after each finding individually, without an internal finding ID in the commit message.
- Log in the wisdom file per finding: worktree path, branch, commit hash, commit message.

Integration back into the original branch:

1. Wait for all worktree component final statuses.
2. Process the successful components in the **deterministic component order from Phase 4.2, step 5** (by report position of their first finding). Determine per component the new commits on its branch since `HEAD` of the original branch, in component order.
3. Integrate the commits back into the original worktree sequentially with `git cherry-pick <commit>`.
4. On a cherry-pick conflict: first run the cherry-pick conflict assessment. Resolve low-risk conflicts directly; ask the user only on high-risk or unclear conflicts.
5. After a successful integration and validation: remove the worktree (`git worktree remove <WORKTREE_PATH>`) and delete the temporary branch (`git branch -d <BRANCH_NAME>`).
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
