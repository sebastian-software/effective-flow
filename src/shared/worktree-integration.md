## Delivery and worktree integration

This shared fragment ties code-changing workflows to delivery branches, pull requests and
Git worktrees. The general values for base branch, branch-name construction and
completion action live in the `delivery` config block; the `worktree` block controls
exclusively whether and how the implementation runs in a separate Git worktree.

**By default the implementation runs in a Git worktree** (`worktree.enabled` default `true`):
an existing linked or harness-native worktree is reused, otherwise Effective Flow creates one
with its own branch. As soon as work happens in a worktree or on a dedicated delivery branch,
**delivery is implicitly active** and completes via `merge`
(default) or `pr`. There is no separate `delivery.enabled` switch anymore (see
"Delivery is implied by worktree/branch").

Only when the user explicitly asks for in-place work without a worktree and wants no
branch/PR/merge action does the workflow behave as if without this fragment: no
forced branch creation, no forced commits and no automatic
PR creation.

`<plan.dir>` is the plan directory from the Effective Flow configuration (project setup ADR) `plan.dir` (default
`docs/plan`).

### Roles of the config blocks

- **`delivery`** describes the delivery branch and its completion: base ref,
  branch prefix, completion action and return target.
- **`worktree`** describes exclusively the execution location: whether a worktree
  is used, where it lives and which setup runs in it.

Scope boundary: this fragment is **not** the per-finding worktree mechanism from
`{{SKILL:apply-review}}` (`applyReview.worktree`). That one isolates parallel local
review findings and folds commits back onto the current branch via cherry-pick.
This fragment creates delivery branches for PR, merge or "branch only". Both
may use the same physical `baseDir`, since session and path segments
distinguish them.

```include
execution-location
```

```include
worktree-lifecycle
```

### Configuration

If the Effective Flow configuration (project setup ADR) pins corresponding values, they override these defaults (schema shown here for illustration):

```json
{
  "delivery": {
    "baseBranch": "origin/main",
    "branchPrefix": "effective-flow",
    "completion": "merge",
    "returnBranch": "auto",
    "prReview": "ask"
  },
  "worktree": {
    "enabled": true,
    "setup": "auto",
    "baseDir": ".effective-flow/.worktrees"
  }
}
```

Missing values have these defaults:

- `delivery.baseBranch`: `"origin/main"`
- `delivery.branchPrefix`: `"effective-flow"`
- `delivery.completion`: `"merge"` (merge into the target branch as the default completion)
- `delivery.returnBranch`: `"auto"` (local branch part from `delivery.baseBranch`)
- `delivery.prReview`: `"ask"` (a gated run asks once per created pull request)
- `worktree.enabled`: `true` (implementation runs in its own worktree)
- `worktree.setup`: `"auto"`
- `worktree.baseDir`: `.effective-flow/.worktrees`

Valid values:

- `delivery.completion`: `"pr"`, `"merge"`, `"branch"`
- `delivery.returnBranch`: `"auto"` or a local branch name as a string
- `delivery.prReview`: `"ask"`, `"always"`, `"off"`
- `worktree.enabled`: `true`, `false`
- `worktree.setup`: `"auto"`, `"none"` or an explicit setup command as a string

`delivery.enabled` is **retired**: delivery is no longer activated via its own switch,
but is active whenever work happens in a worktree/dedicated branch
(see "Delivery is implied by worktree/branch"). A `delivery.enabled` still
present in a legacy config is ignored on read and removed by the full config migration
(see "Config migration").

### Config migration

Reading the Effective Flow configuration from the project setup ADR and the one-time consolidation
of a legacy config onto the current schema – in particular moving old delivery values out of
`worktree.baseBranch`/`worktree.branchPrefix`/`worktree.completion` into `delivery.*` and
removing the retired `delivery.enabled` – is handled by the shared fragment
"Config migration" (`config-migration.md`) once and centrally. This fragment performs **no** own
per-block migration anymore. Until a config is migrated, reading applies: new value from
`delivery.*` before legacy value from `worktree.*` before default; an existing
`delivery.enabled` is ignored.

### Determine mode (setup phase): Delivery is implied by worktree/branch

At the start of the actual implementation work, determine the effective mode:

- Before delivery setup, classify completion intent from the current invocation. Only an
  unambiguous affirmative directive to perform exactly one of `pr`, `merge`, or `branch` in this
  run is explicit intent. A negated, hypothetical, descriptive, or merely mentioned action is not
  override evidence. Alternatives such as "create a PR or keep a branch" and simultaneous requests
  for more than one action are ambiguous: interact for one affirmative action and abort before any
  mutation if unresolved.
- Record the explicit action and its evidence separately from configuration. When one exists, it is
  the effective completion even when it differs from `delivery.completion`; do not modify the
  configured value. The completion report names both the configured value and applied override.
  With no qualifying directive, retain the configured value and existing fallback behavior.
- Before any fetch, setup, branch change or other write-capable action, issue and verify an
  execution-location receipt for the current checkout. Before worktree creation, resolve and
  retain its verified `RUNTIME_STATE_ROOT` from the first record of
  `git worktree list --porcelain`; a path below `.effective-flow/.worktrees` does not prove
  ownership. Keep `EXECUTION_ROOT` and `RUNTIME_STATE_ROOT` separate for the entire run.
- **Worktree execution is active by default** (`worktree.enabled` default `true`). It
  stays off only when `worktree.enabled: false` is set or the user explicitly requests
  in-place work ("without worktree", "directly on the current branch").
- When the current receipt points to an existing linked or harness-native worktree rather than
  the repository's main worktree, reuse it as `harness-managed`. Do not create a nested delivery
  worktree, switch its branch, repeat automatic setup or remove it during handback.
- **Delivery is active as soon as work happens in a worktree or on a dedicated delivery
  branch** – so in the default case always. In addition, delivery is active when the
  user explicitly requests PR, branch or merge work (even with in-place work; then
  the delivery branch is created in the main repo).
- If the worktree is disabled via config (`worktree.enabled: false`), give a brief
  note that the (default) worktree mode is off via config. If the user then also
  requests no delivery action, perform no further steps from this fragment
  (in-place without delivery). Plan archival still applies in that mode: it is owned by
  `plan-archival`, which the workflow loads through its own pointer rather than from here.

### Shared preconditions

When delivery or worktree is active:

1. `git` and, for worktree execution, `git worktree` must be available. The current execution
   receipt must pass the fail-closed preflight before continuing.
2. `delivery.baseBranch` must be resolvable. If it is a remote ref (e.g.
   `origin/main`), first run `git fetch REMOTE BRANCH`, so the delivery branch
   starts from the current remote state.
3. If the current HEAD has relevant uncommitted changes or local commits that
   are not contained in `delivery.baseBranch`, point that out. A delivery branch freshly
   created from the base branch does not contain this work. Only continue
   if the user confirms the chosen mode or the workflow creates a safe
   partial-diff PR by the procedure described below.
4. Construct delivery branch names: `<delivery.branchPrefix>/<skill>/<slug>`, e.g.
   `effective-flow/build/user-login`. Derive the slug from the plan title, the task description,
   the issue or finding. If the branch name already exists, append a
   numeric suffix and report the chosen name.

### Run-owned delivery state

Before creating or switching any delivery artifact, retain the original verified
execution-location receipt and initialize explicit current-run ownership flags for the delivery
worktree and branch. After the current run creates a delivery branch, record its exact name and
creation OID immediately; do not substitute the base ref or a later-moving remote tip. After the
current run creates a worktree, record that ownership separately from its
`effective-flow-created` receipt. A name, path, configured base directory or pre-existing receipt
never proves current-run ownership.

Carry this state through baseline validation and every later phase:

- original checkout receipt and checkout identity,
- delivery branch name and exact creation OID,
- whether this run created the delivery branch,
- whether this run created the delivery worktree,
- the delivery execution-location receipt,
- for an Effective Flow-created worktree, its lifecycle record ID and retained absolute record
  handle below `RUNTIME_STATE_ROOT`.

For a reused `harness-managed` or user-managed worktree or branch, both creation flags stay
false and no lifecycle record is created. For in-place execution without delivery, no delivery
artifact is recorded.

### Worktree execution

When worktree execution is active:

1. If the current receipt identifies a linked or harness-native worktree, keep that root and
   checkout identity and mark setup as `externally managed`. A detached harness-native checkout
   remains valid only at its pinned OID. If delivery requires a branch, create or adopt it
   through the harness-supported flow and issue a new verified receipt before committing; never
   silently switch a harness-managed worktree. The linked or native checkout becomes
   `EXECUTION_ROOT`; the porcelain main checkout remains `RUNTIME_STATE_ROOT`.
2. Otherwise determine the repo name from `basename "$(git rev-parse --show-toplevel)"` and use
   `worktree.baseDir` (default `.effective-flow/.worktrees`) as the base dir. Worktree path:
   `BASE_DIR/REPO_NAME/SESSION_ID`. Resolve a relative `BASE_DIR` against
   `RUNTIME_STATE_ROOT`, never against a disposable worktree. When that path is below
   `.effective-flow/`, resolve every missing base or parent directory that will be created.
   From `RUNTIME_STATE_ROOT`, apply the owning workflow's loaded “Runtime-state write safety”
   contract to each exact directory path immediately before its `mkdir`; a guard for the
   eventual worktree path does not authorize creating its parents. Apply the contract again to
   the exact `WORKTREE_PATH` immediately before `git worktree add`.
   Create the worktree and delivery branch with
   `git worktree add <WORKTREE_PATH> -b <BRANCH_NAME> <BASE_REF>`, then immediately issue and
   verify an `effective-flow-created` receipt for the exact path, branch, workflow and delivery
   purpose. Record both artifacts as current-run-owned and capture the branch's exact creation
   OID. Immediately after that receipt succeeds, initialize its version 1 worktree-lifecycle
   record as `active`, with branch policy `retain`, under the verified runtime root. Do this
   before setup or delegation. If receipt or lifecycle-record creation fails, retain the
   worktree and branch for manual reconciliation and do not continue inside it.
3. Only for that newly Effective Flow-created receipt, run setup per `worktree.setup` and
   briefly announce the mode beforehand:
   - `auto` or missing: decide by lockfile – `pnpm-lock.yaml` →
     `pnpm install --frozen-lockfile --prefer-offline`, `package-lock.json` →
     `npm ci`, `yarn.lock` → `yarn install --frozen-lockfile`, `Cargo.toml` →
     `cargo fetch --locked`, `go.mod` → `go mod download`, `uv.lock` →
     `uv sync --frozen`, `poetry.lock` → `poetry install --sync`, no known
     file → no setup.
   - `none`: run no setup.
   - String value: run this explicit command in the worktree.
     Record the final setup status as `complete` or `skipped` before delegation.
4. Pass the full receipt, including both roots, to every subsequent phase and delegated worker
   that creates or changes code, tests, documentation, or runtime state. Each boundary runs the
   fail-closed preflight. Project operations are explicitly rooted in `EXECUTION_ROOT`; runtime
   reads and writes use retained absolute handles below `RUNTIME_STATE_ROOT`. This also applies
   through the completion phase and the final validator/formatter.

### Lifecycle outcome handling

For a current-run-owned `effective-flow-created` delivery or partial-diff worktree, keep its
lifecycle record synchronized at every terminal workflow boundary. Perform every transition
under the record lock and the runtime-state write-safety guard:

- keep `active` while implementation, validation, commit, integration, or delivery preparation
  can still change the checkout;
- on a controlled stop before readiness, transition `active` to `aborted` with the concrete
  reason and retain both worktree and branch;
- on an implementation, validation, integration, ownership, or state error before readiness,
  transition `active` to `failed` with the exact reason and retain both artifacts;
- only after the intended changes are durably committed to the delivery branch may the owning
  workflow transition `active` to `cleanup-ready` and enter the shared claim/remove/reconcile
  sequence.

If a lifecycle transition cannot be persisted safely, retain the worktree and branch and report
the record handle and failed guard or operation. A sudden interruption deliberately leaves
`active`; no age check upgrades or downgrades it.

### In-place delivery without worktree

When delivery is active and worktree execution stays off:

1. Keep and verify the current checkout's `in-place` receipt, and remember the originally
   checked-out branch.
2. Ensure the working tree contains no uncommitted changes that
   should not become part of the delivery branch. If such changes exist,
   do not silently stage, stash or overwrite them; either obtain a user decision
   or use the partial-diff PR via worktree.
3. Create and check out the delivery branch from `delivery.baseBranch`.
4. Issue a new receipt for the delivery branch after switching. Record the branch as
   current-run-owned and capture its exact creation OID before setup or implementation. Run
   implementation, tests, validation and final formatting through explicitly rooted operations
   after a successful preflight at every write-capable boundary.
5. After completion, proceed per "Handback and completion action".

### Partial-diff PR via worktree

When the main checkout already holds changes that should not fully go into the PR,
a separate worktree is the preferred safe path, provided these
preconditions are met:

1. `git worktree` is available.
2. `delivery.baseBranch` is resolvable and, for remote refs, updatable.
3. The workflow knows the exact repository-relative files and final states that belong to its own
   output. A standalone local-change selection uses `{{SKILL:deliver}}`; implementation handback
   uses only the workflow's recorded output set plus any explicitly confirmed additions.

The procedure:

1. Refresh and resolve `delivery.baseBranch`. Create a fresh worktree branch from that exact OID,
   then immediately issue and verify
   a separate `effective-flow-created` receipt whose purpose is `partial-diff`. Before setup or
   file transfer, initialize its lifecycle record as `active` with branch policy `retain`; a
   record-creation failure retains both worktree and branch and aborts the partial-diff flow.
2. Take only the selected delivery states from the source checkout into the worktree. Permitted
   evidence is plan affected-file scope reconciled with actual output, review finding scope, issue
   scope, files recorded as produced by the workflow, or explicit user confirmation. Preserve
   additions, modifications, modes, deletions, and both rename endpoints; never use a whole-tree
   copy or infer ownership from recency.
3. Run setup only under the new receipt's setup ownership, then require its tracked tree and index
   to be clean before transfer. In the verified execution root, compare the exact transferred
   changed-path/state set with the selected output and require a meaningful diff against the base.
   Any extra, missing, or mismatched path aborts; an empty diff creates no commit or PR.
4. Stage only the explicitly known residual output and delegate the actual commit to
   `{{SKILL:commit}}` with the full verified receipt, expected branch and staged-tree OID plus the
   literal line `Next steps: suppressed`. Verify the returned commit OID, parent, branch, tree and
   residual state before continuing. Never describe locally reproduced commit behavior as a commit
   delegation.
5. Run `{{SKILL:pr}}` only for effective `pr` completion and only with the exact verified committed
   head handoff described below.
6. Remove the worktree only through the shared lifecycle transition, claim, ordinary remove, and
   reconciliation sequence after the receipt passes every ownership-safe cleanup check. Leave
   the delivery branch locally and the main checkout unchanged. Non-selected changes in the
   main checkout remain untouched.

A heuristic partial-diff selection by "all changed files
except <plan.dir>" is not allowed. The workflow must know the files to include or
ask. This reliably keeps newly created plans, `.effective-flow/` state and other
local working files outside the PR.

### What lives in the delivery branch and what stays in the main repo

Data-keeping invariant: **Of the Effective Flow artifacts, only plans are
committed.** Reviews (local reports) and investigations always stay local and
untracked; in remote mode reviews are tracked as issues instead (never in the repo),
investigations remain purely local in any case (see "Issue-tracker integration" and
`{{SKILL:investigate}}`).

- **In the delivery branch:** the actual code, test and documentation deliverables of the
  workflow as well as – if the workflow kept a plan file – its final
  state (in the implemented case the archived, implemented-marked plan file).
- **Only in the main repo, never committed:** pure Effective Flow bookkeeping and runtime state, i.e.
  all remaining `.effective-flow/` artifacts – `memory.json`, `cache.json`, local review reports
  under `.effective-flow/review/`, investigation reports under `.effective-flow/investigation/`,
  config migration status and wisdom files. Their operational paths are absolute handles below
  `RUNTIME_STATE_ROOT`, even while tracked work executes elsewhere.

### Abort handback before implementation

Use this handback only when a workflow must abort after delivery setup but before implementation,
for example when `maintain` finds a red baseline. It is separate from normal completion: do not
mark or archive a plan, commit, ask for or execute a completion action, push, merge or create a
pull request. Preserve all abort diagnostics before lifecycle cleanup.

Fail closed. Mutate only artifacts that the retained run-owned delivery state proves were created
by the current run:

1. **No delivery artifacts:** For in-place execution without delivery, perform no lifecycle
   cleanup. Report the unchanged checkout.
2. **Externally managed state:** For `harness-managed`, user-managed or adopted worktrees and
   branches, perform no lifecycle mutation. Report every retained path or branch and that it is
   externally managed.
3. **Effective Flow-owned worktree:** Only when both current-run creation flags are true, the
   receipt is `effective-flow-created`, and the matching lifecycle record is still `active`,
   acquire its record lock and transition it to `aborted` with the concrete pre-implementation
   stop reason. Retain the worktree and branch for inspection; an aborted worktree is never a
   cleanup candidate. If the transition cannot be persisted, retain both artifacts and report
   the lifecycle failure. Do not remove the worktree merely because `HEAD` and the branch tip
   still equal the creation OID. Never compare against a moving remote tip when proving ownership
   or deciding whether any current-run artifact may be changed.
4. **In-place transient branch:** Only when the current run created the delivery branch, freshly
   verify the delivery receipt, clean status, exact branch name and recorded creation OID. Verify
   that the retained original checkout belongs to the same repository and can still be restored.
   Restore the original branch or detached OID first, revalidate its retained receipt, then
   revalidate and safely delete the unchanged transient branch with
   `git branch -d <BRANCH_NAME>`.
5. **Retention and partial cleanup:** Any lifecycle-write failure, dirty state, changed tip,
   ownership mismatch, receipt or registration mismatch, or failed restoration retains the
   affected artifact. Report its exact path or branch and the failed proof or command. If
   restoration succeeds but safe deletion of an in-place transient branch is refused, report
   partial cleanup explicitly and retain that branch. Never force-remove a worktree or
   force-delete a branch in this abort handback.

End the workflow immediately after reporting the abort handback. Do not enter implementation or
normal delivery completion.

### Handback and completion action (completion phase)

Following the workflow's regular completion logic (including completion-condition verification).
The final status switch of the plan file to `Umgesetzt`/`Implemented` and its
archiving is handled by step 1 below at the delivery point – the implementing workflow therefore does **not** set the
status beforehand, but leaves it to this phase (exception: in-place without
delivery, see step 1):

**Update existing PRs:** If the delivery branch already has a pull request
and subsequent changes are needed, those changes are always created and pushed as new
commits on the same PR branch. Existing PR commits must not
be rewritten via `commit --amend`, interactive rebase, squash or force-push.
If a normal push fails because of diverged remote history,
stop and report the conflict instead of overwriting history.

1. **Mark the plan as implemented, archive it and take it into the delivery branch:**
   Provided the workflow kept a plan file, this is the **delivery point** at which
   the plan counts as implemented (immediately before the PR is opened or the delivery branch
   is merged). The contract for that — which state the plan is in, what that state's action is,
   where every operation runs, and how the main-checkout copy is cleaned up — is owned by
   `plan-archival`, which every workflow that keeps a plan file loads through its own deferred
   pointer. Hand it the inputs it declares: `EXECUTION_ROOT` and `RUNTIME_STATE_ROOT` from this
   run's verified receipt, `plan.dir`, the plan file's repository-relative path, the plan's complete
   language, the delivery shape, and — only when this run recorded one — the delivery branch's
   creation OID. Marking and move are **committed along with it** by step 2 and are thereby part of the
   PR/merge (implementation documentation). The `.effective-flow/` artifacts stay in the main repo.
   If the workflow kept no plan file, this step does not apply.
2. **Ensure committed handoff:** Preserve every verified commit already created by the implementing
   workflow, such as `{{SKILL:maintain}}`'s per-group commits. Verify that each expected commit is
   still reachable in order from the exact delivery branch and never amend, squash, reorder, or
   replace it. Then inventory only the uncommitted residual output: known code, test and
   documentation deliverables plus the plan state from step 1. An unselected changed path blocks
   handback rather than being swept into the commit.
   - When residual output exists, stage exclusively its literal known paths, reconcile the complete
     staged set, and record the exact staged-tree OID and pre-commit `HEAD`. Delegate the actual
     commit to `{{SKILL:commit}}` with the full verified execution-location receipt, expected branch,
     declared residual paths and expected tree, plus the literal line `Next steps: suppressed`.
     Resolve `language.git` for the human-readable description and keep Conventional Commit types
     stable. Require the returned commit to be a new child of the expected `HEAD` on the exact
     branch with the expected tree and no unaccounted residual state before advancing the receipt.
   - When no residual output exists but verified earlier commits do, continue without creating an
     empty commit.
   - When neither residual output nor a verified commit range exists, inform the user, safely remove
     only an automatically created empty delivery branch/worktree under its ownership contract, and
     end without PR or merge.
3. **Determine completion action:** Use the unambiguous affirmative current-run action recorded
   during setup first. If it overrides a valid `delivery.completion`, report both the configured
   value and the applied explicit action. If no qualifying explicit action exists and
   `delivery.completion` has a valid value, use it and briefly report that the action came from the
   Effective Flow configuration (project setup ADR). Otherwise ask:

```ask
when: Delivery was active and no valid value for `delivery.completion` is set
header: Completion
question: How should the delivery branch be completed?
options:
  - label: Pull request
    description: Push the branch and create a PR against the base branch via pr
  - label: Merge
    description: Merge the branch locally into the base branch, without a PR
  - label: Branch only
    description: Leave the branch in the local repo, no further action
```

4. **Withdraw an Effective Flow-owned worktree:** Only when the receipt is
   `effective-flow-created` and the intended changes are durably committed on its delivery
   branch, acquire the lifecycle record lock, freshly reverify every eligibility proof, and
   transition `active` to `cleanup-ready`. Claim it as `cleanup-in-progress` for this workflow's
   cleanup run, execute only `git worktree remove <WORKTREE_PATH>` without force, and reconcile
   the result while retaining the lock. The `retain` branch policy leaves the delivery branch in
   the local repository. Delete only the successfully reconciled lifecycle record; a proof,
   remove, or record-finalization failure becomes `cleanup-failed` where safely writable and is
   reported with the retained path or partial state. For `in-place` and `harness-managed`
   receipts, perform no worktree cleanup and create no lifecycle state; leave handling to the
   user or harness. The verified `RUNTIME_STATE_ROOT` is never a cleanup target, and local review
   state there remains intact.
5. **Execute action:** Run this step and every Git, remote-helper and provider-CLI operation it
   performs in `RUNTIME_STATE_ROOT`, per "Rooted operations". Step 4 may already have removed the
   Effective Flow-owned worktree, so an inherited execution directory can be a deleted path; the
   delivery branch and its commits are repository-wide and need no worktree. Never fall back to
   `EXECUTION_ROOT` for this step.
   - `branch` / Branch only: leave the branch, report the name and a note about later
     PR creation.
   - `merge`: the target is the local branch part of `delivery.baseBranch` or the
     explicit `delivery.returnBranch`. Ensure that the target working tree
     is clean; otherwise inform instead of merging. If the local target branch is
     behind its remote-tracking ref, point that out. Merge the delivery branch –
     prefer fast-forward, otherwise a merge commit; on conflict stop, leave the branch
     and inform the user, no automatic conflict resolution.
   - `pr`: resolve and record the final delivery-branch head OID after every intended commit and
     require a non-empty verified commit range against the refreshed base. Delegate to
     `{{SKILL:pr}}` and pass the exact delivery branch, base branch, verified final head OID,
     successful commit-only handoff evidence, the verified `RUNTIME_STATE_ROOT` as its execution
     root, and the workflow/change type
     (`feat`/`fix`/`refactor`/`docs`/`chore` depending on the implementing workflow and effect) as
     a title-type hint, so the PR title carries a valid Conventional Commit type — with a squash
     merge it is the release signal — and the literal line `Next steps: suppressed` on its own
     line, because `{{SKILL:pr}}` returns its result here and the implementing workflow is the one
     that closes this run.
     Once `{{SKILL:pr}}` returned the pull request, run "PR review publication" with that pull
     request, whether this run is gated or a non-interactive delegation, and either the workflow's
     residual finding set or its explicit declaration that it has none. It uses the same verified
     `RUNTIME_STATE_ROOT`. This stays inside step 5 deliberately: step 4 has already withdrawn an
     Effective Flow-owned worktree and step 6 restores the checkout to the base branch, so a review
     running after them would have no execution root and would read base-branch content.

```lazy-include
pr-review-integration
when: the completion action created or reused a pull request and the automatic PR review may run
```

6. **Restore checkout:** For in-place delivery that switched the current checkout, after
   successful PR creation or with `branch`, switch back to `delivery.returnBranch` or, with
   `auto`, to the local branch part of `delivery.baseBranch`, provided the working tree is clean.
   Do not switch a reused harness-managed checkout. If an applicable switch-back fails,
   explicitly report the actual branch as a side effect.
