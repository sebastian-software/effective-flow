# Deliver local changes through clean PR branches

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Effective Flow needs a smooth, explicit path from local implementation changes to a pull request
without weakening the boundaries of the existing delivery tools:

- `effective-flow commit` consumes only changes that are already staged. It never selects or stages
  files itself.
- `effective-flow pr` consumes only commits on a named head branch. It never stages or commits
  working-tree content.
- A new standalone `effective-flow deliver` workflow owns the transition between those boundaries:
  it resolves an exact change selection, places only that selection on a clean delivery branch,
  proposes and confirms an ordered partition into coherent commits, stages each group in turn,
  delegates every commit to `effective-flow commit`, and delegates the resulting committed branch
  to `effective-flow pr`.
- Implementation workflows such as `build`, `fix`, `refactor`, `docs`, and `maintain` continue to use
  the shared delivery handback. An explicit completion request such as “create a PR” overrides
  `delivery.completion`; the workflow reports both the configured value and the explicit override.
- When the requested PR contents cannot be determined exactly, the workflow stops before branch,
  index, commit, push, or forge mutations. Explicitly named unstaged or untracked paths are eligible:
  the delivery orchestrator stages only those paths in its clean delivery checkout before invoking
  the staged-only commit tool.

This is a Feature because it adds a user-invocable workflow and changes the observable orchestration
of local changes, branches, commits, and pull requests while preserving the narrow contracts of the
existing tools.

The plan is based on `origin/develop` at `c6f810d` on 2026-08-25. The current Codex checkout is a
clean detached checkout of the generated `main` delivery payload; the canonical source and tests
live on `develop`. The existing local `develop` checkout is one commit behind `origin/develop` and
contains unrelated untracked plan files. Implementation must therefore start in a new clean
worktree/branch from `origin/develop`, preserve those unrelated files, and edit `src/`, never the
generated `effective-flow/` payload.

## Architecture decisions

- **Add `deliver` as the orchestration boundary.** The public tool name is `deliver`, placed in the
  “Deliver changes” router group. It owns selection, clean-branch preparation, staging, and the two
  returning delegations. This keeps `commit` and `pr` individually safe and makes the complete local
  changes-to-PR operation invocable without teaching either leaf tool to absorb another lifecycle.
- **Derive a candidate from session evidence, then require confirmation.** `deliver` has no
  structured public path syntax. It first reconstructs the files changed by the current session from
  the orchestrator’s known output set and file-operation evidence, then reconciles that candidate
  against the NUL-safe Git inventory. It always presents the exact candidate manifest for user
  confirmation before any write. The confirmation binds the ordered JSON path array passed to the
  helper. When session evidence is missing, spans multiple plausible scopes, disagrees with Git, or
  contains partial staging whose intended state is unclear, `deliver` asks the user to refine the
  manifest interactively and aborts if exact agreement is not reached. Non-selected changes remain
  untouched in the source checkout.
- **Partition the manifest into coherent commits.** After the full file/state manifest is confirmed,
  `deliver` groups it by the current session's task boundaries and substantive diff evidence. It
  presents every ordered group with its exact paths and tentative Conventional Commit type/effect
  for mandatory confirmation. If the partition or its order remains ambiguous after focused
  interaction, the workflow aborts before staging. A confirmed selection may therefore produce
  multiple commits, but every selected state belongs to exactly one group.
- **Make selection transfer deterministic and testable.** A dependency-free
  `delivery-selection` runtime helper owns NUL-safe Git inventory, manifest construction,
  source-drift detection, three-way application, and exact reconciliation. Each manifest entry
  binds the lexical repository path, selection origin, source-HEAD blob/mode or absence, selected
  blob or content digest/mode or tombstone, and both endpoints of a rename. The helper never emits
  file content. If the refreshed base changed a selected path relative to source HEAD, the helper
  applies the selected delta three-way; an unresolvable text or binary conflict fails closed rather
  than replacing the newer base blob.
- **Use a clean partial-diff delivery worktree for local changes.** Reuse and strengthen the existing
  partial-diff path in `worktree-integration`: refresh `delivery.baseBranch`, create a uniquely named
  `<delivery.branchPrefix>/deliver/<slug>` branch and Effective Flow-owned worktree from that base,
  transfer only the selected states, and verify the resulting diff before staging. Never switch,
  stash, reset, or clean the dirty source checkout.
- **Stage in the orchestrator, commit in `commit`.** `deliver` and the implementation handback own
  explicit path staging in their verified delivery checkout. They then delegate to
  `effective-flow commit` with `Next steps: suppressed`. The commit tool continues to read only the
  staged diff and returns the created commit OID, branch, and any remaining staged or unstaged state
  needed by its caller. No caller describes this as “using commit logic” while performing the
  commit itself.
- **Root delegated commits through a verified receipt.** `commit` accepts an optional supplied
  execution-location receipt from a delivery caller, verifies it immediately before reading the
  index and committing, and roots every Git operation in that receipt’s `EXECUTION_ROOT`. A direct
  invocation resolves its current checkout as before. A missing, stale, detached, base-branch, or
  mismatched delivery receipt stops the returning delegation before commit.
- **PR creation is commit-only and branch-only.** Remove the incomplete “fresh branch” behavior from
  standalone `pr`; fresh branch creation with local-change transfer belongs to `deliver` or an
  implementation handback. `pr` requires a named, non-base head with at least one commit against the
  refreshed remote-tracking base. It never runs `git add` or `git commit` and derives all published
  content from that commit range.
- **Fail closed on dirty standalone PR invocations.** A direct `pr` call stops when its invocation
  checkout contains staged, unstaged, or untracked changes, because their omission from the PR would
  be ambiguous. A returning delivery handback may bypass that checkout-level ambiguity only by
  passing an exact head branch, base branch, verified head OID, and a successful commit-only handoff;
  unrelated dirt in the main checkout is never interpreted as PR content.
- **Create new PR branches only; do not overload existing-PR updates.** `deliver` always creates a
  fresh branch from the refreshed base. Changes for an existing PR stay with the established
  `iterate` flow or with an explicitly prepared PR head followed by staged-only `commit` and
  commit-only `pr`. This prevents a fresh-branch workflow from claiming it can also mutate an
  existing remote head.
- **Explicit completion intent outranks configuration, without changing defaults.** Only an
  unambiguous affirmative directive to perform `pr`, `merge`, or `branch` in the current invocation
  is recorded before delivery setup and takes precedence over a valid `delivery.completion`. Merely
  mentioning an action, negating it, discussing it hypothetically, or presenting alternatives is not
  override evidence. Ambiguous wording triggers focused interaction and aborts before mutation if it
  is not resolved. The workflow reports the override, for example that explicit `pr` replaced
  configured `merge`. With no qualifying directive, the configured value and existing built-in
  fallback remain unchanged.
- **Preserve run-owned lifecycle evidence.** Branch names, paths, or prefixes never prove ownership.
  The new workflow uses the existing execution-location receipt, runtime-state safety, and worktree
  lifecycle contracts. A failed selection transfer, hook, commit, push, or PR creation retains only
  the artifacts proven to belong to the run and reports their exact state; cleanup never forces a
  worktree or branch removal.

## Affected files

| File                                        | Description                                                                                                                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/tools/deliver.md`                      | New public workflow for explicit local-change selection, confirmed multi-commit partitioning, clean delivery-branch preparation, staged-only commit delegation, commit-only PR delegation, cleanup, and reporting. |
| `build.mjs`                                 | Add `deliver` to the “Deliver changes” tool group so the router, native targets, portable target, and catalog contract expose it.                                                                                  |
| `src/scripts/delivery-selection-core.mjs`   | New dependency-free core for Git porcelain parsing, manifest validation, selection/source drift checks, three-way transfer planning, and result reconciliation without exposing file content.                      |
| `src/scripts/delivery-selection.mjs`        | New JSON CLI wrapper with dry-run and explicit apply operations; register it in `RUNTIME_SCRIPT_FILES` so every distribution ships the helper.                                                                     |
| `src/tools/commit.md`                       | Preserve staged-only behavior and make the successful/blocked result sufficiently explicit for a returning delivery caller, including commit OID, branch, and residual index/working-tree state.                   |
| `src/tools/pr.md`                           | Tighten the tool to prepared committed branches, remove the ineffective fresh-branch mode, add direct-call dirty/detached/base-branch guards, and accept the verified committed handoff from delivery callers.     |
| `src/shared/worktree-integration.md`        | Define exact completion-intent precedence, turn the partial-diff procedure into the shared local-change delivery path, and delegate actual commits to `commit` after caller-owned explicit staging.                |
| `src/shared/execution-location.md`          | Clarify how `deliver` escapes a detached or harness-managed source checkout by creating its own verified delivery worktree without switching or adopting the source checkout.                                      |
| `src/shared/next-steps.md`                  | Add the successful `deliver` → `merge-gate <PR>` edge and keep returning `commit`/`pr` delegations suppressed so only `deliver` reports the final recommendation.                                                  |
| `docs/user-guide/tools-deliver.md`          | Document the three boundaries (`deliver`, `commit`, `pr`), accepted selection forms, abort behavior, and the prepared-branch-only PR contract.                                                                     |
| `README.md`                                 | Add `deliver` to the public lifecycle overview between implementation and the staged-only/commit-only leaf tools.                                                                                                  |
| `docs/user-guide/README.md`                 | Add `deliver` to the delivery tool group and its document index description.                                                                                                                                       |
| `docs/user-guide/worktree-and-delivery.md`  | Document local-change isolation, explicit completion overrides, and the shared clean-branch handback used by implementation workflows and `deliver`.                                                               |
| `docs/user-guide/tool-flow.md`              | Mirror the new next-step edge and updated delivery outcomes required by the build-validated table contract.                                                                                                        |
| `docs/user-guide/tools-implement.md`        | Explain that explicit completion intent overrides `delivery.completion` and that implementation workflows stage their known result before delegating commit and PR.                                                |
| `docs/user-guide/getting-started.md`        | Add the standalone local-changes → `deliver` → PR path beside the plan/build flow.                                                                                                                                 |
| `docs/user-guide/configuration.md`          | Define the precedence of explicit completion intent over `delivery.completion` without changing the configured or built-in defaults.                                                                               |
| `docs/developer-guide/architecture.md`      | Record the leaf-tool/orchestrator boundary and the detached-harness checkout escape through an owned delivery worktree.                                                                                            |
| `docs/developer-guide/skill-ownership.json` | Register `deliver` as an `effective-delivery` consumer using the existing machine-checked relationship classification.                                                                                             |
| `docs/developer-guide/skill-ownership.md`   | Mirror and explain the new workflow’s central-skill ownership relationship.                                                                                                                                        |
| `test/delivery-selection.test.mjs`          | Unit-test manifest parsing, path policy, source-state binding, rename/delete modeling, and redacted dry-run output.                                                                                                |
| `test/delivery-selection-git.test.mjs`      | Exercise staged/unstaged transfer, partial staging, upstream drift, three-way success/conflict, symlinks, hooks, and source-index preservation in temporary Git repositories.                                      |
| `test/workflow-contracts.test.mjs`          | Assert router exposure, staged-only `commit`, commit-only `pr`, confirmed group ordering, per-group delegation and failure stops, suppression literals, next-step coverage, and documentation mirrors.             |
| `test/execution-location-contract.test.mjs` | Assert that local-change delivery never switches the dirty or detached source checkout and roots delivery/forge operations in the correct verified roots.                                                          |
| `test/worktree-lifecycle-contract.test.mjs` | Assert run-owned lifecycle registration, retention, and cleanup behavior for successful and failed `deliver` partial-diff worktrees.                                                                               |

## Implementation details

### Approach

1. Add `deliver` to the public tool catalog and give it the standard delegation mandate,
   configuration/language resolution, task tracking, worktree/runtime safety pointers, and
   next-step pointer. Recommend `effective-delivery` for repository-native validation and register
   that relationship in the ownership inventory. Its default outcome is a pull request; the tool
   does not reuse `delivery.completion` because invoking `deliver` is itself explicit PR intent.
2. Resolve a selection manifest before any write:
   - inventory staged, unstaged, deleted, renamed, and untracked paths with NUL-safe Git output;
   - derive the candidate path/state set from the current session’s known output and file-operation
     evidence; never treat all repository dirt as session-owned merely because it is recent;
   - reconcile the candidate against Git and show the exact ordered manifest, including staged,
     unstaged, untracked, deleted, renamed, and partially staged states, for mandatory user
     confirmation;
   - if evidence is absent or contradictory, refine the candidate through focused interaction until
     every repository-relative literal path and selected state is unambiguous; there is no
     structured `--` path interface and no silent natural-language-to-path guess;
   - validate lexical containment and existence/deletion state, and reject directories, globs, path
     aliases, every ignored path, force-add behavior, or paths outside the repository;
   - after confirmation, bind every selected path to its agreed staged or current working-tree
     state, capture source-HEAD blob/mode and a selected blob or content digest/mode or tombstone
     without emitting content, and retain the source checkout receipt plus this ephemeral manifest
     for later reconciliation.
3. Provision a fresh delivery branch/worktree from the refreshed `delivery.baseBranch` through the
   shared partial-diff lifecycle. Derive a collision-safe branch name under
   `<delivery.branchPrefix>/deliver/`, issue and verify the delivery receipt, initialize its
   lifecycle record, and leave the source checkout unchanged. Run applicable owned setup according
   to `worktree.setup`, record its lifecycle status, and require the tracked delivery tree and index
   to remain clean before applying the selection. Any tracked change produced by setup aborts rather
   than becoming part of the selection manifest.
4. Implement and invoke the registered `delivery-selection` helper. Its default call produces a
   redacted dry-run plan; only an explicit apply call may mutate the verified delivery checkout. For
   every entry, compare the refreshed base blob with the source-HEAD blob. Apply the selected delta
   directly only when the base is unchanged; otherwise use deterministic three-way application and
   abort on any unresolved content, binary, mode, delete/modify, or rename conflict. Preserve
   additions, modifications, executable bits, symlinks as link blobs without dereferencing,
   deletions, and renames without copying unrelated files or runtime state. Reject untracked
   symlinks and all ignored paths. Compare the delivery diff against the manifest; an extra,
   missing, content-mismatched, or differently sourced path is an abort before staging.
5. Partition the confirmed manifest into an ordered commit plan. Derive candidate groups from the
   current session's task boundaries and substantive diff relationships, then show each group's
   exact selected paths plus its tentative Conventional Commit type/effect for mandatory user
   confirmation. Require a complete, non-overlapping partition whose union exactly equals the
   confirmed manifest. If grouping or order remains ambiguous after focused interaction, abort
   before staging rather than creating a mixed or guessed commit.
6. Run the repository’s established pre-commit checks in the isolated delivery checkout through the
   existing pre-commit/validation ownership. Immediately afterwards, reconcile every selected path’s
   content and mode plus the complete changed-path set against the original manifest again. Any
   selected-content drift or unselected changed path requires a new explicit selection and stops the
   current run; validation or formatting never silently refreshes the manifest. Never sweep in
   changes with `git add -A` or an equivalent broad operation.
7. Process the confirmed groups sequentially. For each group, stage only its paths, reconcile the
   index path set with that group, and record the exact expected index tree OID immediately before
   delegating to `effective-flow commit` with the full verified execution-location receipt and
   `Next steps: suppressed`. `commit` roots every Git call in `EXECUTION_ROOT` and returns the
   created commit OID and actual branch. Require a new commit on the exact delivery branch, compare
   its tree OID with the expected index tree OID, and verify that the remaining changed paths equal
   the union of later groups. On any failure, retain the worktree, branch, and earlier commits, block
   push/PR, and never amend, squash, reorder, or delete already-created commits.
8. After every confirmed group has become a verified commit, delegate to `effective-flow pr` with
   the exact head branch, base branch, verified head OID, committed-handoff evidence, the strongest
   Conventional Commit effect across the created commit range for title derivation, and
   `Next steps: suppressed`. `pr` refreshes the base, verifies that the supplied head still resolves
   to the same OID and has a non-empty commit range, then pushes and creates or reuses the exact
   head/base PR as today.
9. After all commits are durable and their trees match, follow the existing handback order:
   transition and withdraw only an Effective Flow-owned worktree through the shared claim and
   non-forced cleanup sequence, preserve the local delivery branch, and then perform repository-wide
   PR operations from `RUNTIME_STATE_ROOT`. Leave the source checkout byte-for-byte and
   index-for-index unchanged. On push/PR failure, retain the committed branch and report the PR
   uncertainty, selected paths, commits, branch, override information, retained artifacts, and final
   source-checkout state.
10. In `worktree-integration`, record explicit completion intent during mode selection. At handback,
    reject contradictory explicit actions before delivery setup, then choose unambiguous explicit
    intent first, configuration second, and the existing fallback last. Stage only uncommitted
    residual output from the implementing workflow and delegate the actual residual commit to
    `commit`. Preserve and verify already-created commits such as `maintain`’s per-group commits on
    the exact delivery branch. Pass the final verified head to `pr` only when the effective completion
    is `pr`; `merge` and `branch` retain their existing actions.
11. Simplify `pr` documentation and behavior around one input shape: a prepared committed head
    branch. A direct dirty checkout, detached HEAD, base branch as head, missing commit range, or
    changed handoff OID stops before push. Keep existing exact-PR reuse, no-history-rewrite,
    provider, title, language, and mutation-uncertainty behavior intact.
12. Update user/developer documentation and add contract tests that exercise every transition and
    abort boundary before running the repository’s complete source-to-distribution verification.

### Edge cases

- **Clear session-owned staged changes:** propose the session-derived staged states, reconcile them
  against Git, and transfer them only after the user confirms the exact manifest.
- **Explicitly named unstaged or untracked paths:** transfer their full current working-tree state,
  stage only those paths in the delivery checkout, and commit them through `commit`.
- **Partially staged file:** show staged and full working-tree states as distinct evidence and ask
  which state belongs in the confirmed manifest; never infer the choice from staging alone.
- **Mixed-topic selection:** propose separate ordered commit groups from session task boundaries and
  diff relationships, show the exact partition for confirmation, and abort before staging if any
  path's group or the required order remains ambiguous.
- **Deletion or rename:** represent the selected final tree state and reconcile both old and new
  paths so the delivery diff cannot retain a source path accidentally.
- **Unrelated staged changes in the source checkout:** never include them when explicit paths select
  a different scope; the isolated delivery index starts clean.
- **No meaningful selected diff against the refreshed base:** remove only current-run-owned empty
  artifacts through safe cleanup and create no commit or PR.
- **Selected path conflicts with newer base content:** stop and retain the isolated worktree for
  inspection when deterministic three-way application cannot resolve it; never replace newer base
  content with a whole selected file snapshot.
- **Ignored or symlink path:** reject every ignored path, including ignored secret/config files, and
  never force-add it. Transfer a tracked symlink as its link blob/mode without dereferencing; reject
  an untracked symlink because its target and containment cannot be inferred as PR content.
- **Detached or base-branch source checkout:** create the owned delivery worktree from the base;
  never commit on detached HEAD or the base branch as part of `deliver`.
- **Dirty standalone `pr`:** abort and point to `deliver` with an exact path selection; do not push a
  commit range while silently omitting local changes.
- **Explicit `build … create a PR` with configured `merge`:** use `pr`, report that the explicit
  request overrode `delivery.completion: merge`, and make no local merge attempt.
- **Negated, hypothetical, or alternative completion wording:** do not override configuration from
  phrases such as “do not create a PR,” “could this become a PR?”, or “create a PR or keep a branch.”
  Ask for one affirmative current-run action when required and stop before delivery setup if it is
  not resolved.
- **Commit hook changes the index or working tree:** stop before PR creation, report the changed
  paths and expected/actual tree OIDs, and preserve the delivery checkout and any already-created
  mismatched commit for reconciliation.
- **A later commit group fails:** preserve the verified earlier commits and the remaining uncommitted
  groups in the local delivery worktree, report the exact boundary reached, and create no push or PR;
  never rewrite the successful commits to retry automatically.
- **Validation or formatter changes selected content:** reconcile against the original manifest,
  stop, and require a new explicit selection; do not stage the modified result implicitly.
- **Existing open PR:** `deliver` does not update it. Use `iterate`, or explicitly prepare its head
  branch and then use staged-only `commit` plus commit-only `pr`; never amend, rebase, squash, or
  force-push existing PR history.
- **Conflicting explicit completions:** a request that simultaneously asks for more than one of
  `pr`, `merge`, or `branch` is ambiguous and stops before delivery setup.
- **Push or PR mutation uncertainty:** retain the committed branch and use the existing exact
  head/base lookup before deciding whether creation succeeded; never repeat a possibly successful
  mutation.

## Acceptance criteria

- [x] `effective-flow deliver` is exposed in the router, derives a candidate from current-session
      change evidence, requires confirmation of the exact manifest, and can turn that confirmed
      selection into one or more confirmed, coherent, ordered commits and one pull request from a
      fresh branch based on the refreshed `delivery.baseBranch`.
- [x] With missing, contradictory, or ambiguous session/working-tree evidence, `deliver` interacts
      until the exact manifest is confirmed or aborts before changing a branch, worktree, index,
      commit, remote, or forge state.
- [x] Non-selected source-checkout files and index entries are unchanged after both successful and
      failed `deliver` runs.
- [x] `commit` contains no staging step, reads only the staged diff, and a delegated delivery commit
      uses a verified execution root, contains exactly the expected index tree staged by its caller,
      and exposes any post-hook mismatch before remote mutation.
- [x] Every confirmed path belongs to exactly one commit group; groups are committed in the
      confirmed order, and a failure in any group retains earlier commits and blocks push and PR.
- [x] `pr` contains no staging or commit step, refuses dirty direct invocations, detached/base heads,
      and empty commit ranges, and publishes only the verified commits of the prepared head branch.
- [x] An explicitly requested `pr`, `merge`, or `branch` completion overrides
      `delivery.completion`, and the completion report names the configured value and the applied
      override; negated, hypothetical, descriptive, or alternative mentions do not override it, and
      absent qualifying intent preserves current configuration/default behavior.
- [x] `build`, `fix`, `refactor`, `docs`, and `maintain` delegate only uncommitted residual content
      to `commit`, preserve verified earlier commits such as maintenance group commits, and delegate
      the final committed branch to `pr` only when `pr` is the effective completion.
- [x] The focused contract tests cover staged-only, explicit unstaged selection, ambiguous dirty
      state, partial-staging rejection, confirmed multi-commit grouping and order, later-group
      failure, completion precedence, commit/PR leaf boundaries, detached/base guards, and lifecycle
      cleanup; helper unit/Git tests cover manifest, transfer,
      deletion/rename, upstream drift, three-way success/conflict, ignored paths, symlinks,
      post-validation reconciliation, and hook-created tree mismatch.
- [x] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all exit 0 from
      a clean implementation checkout, and `git diff --check` reports no whitespace errors.

Together these criteria form one completion condition: the generated Claude, Codex, and portable
distributions expose a contract-tested `deliver` workflow that is the only local-change-to-PR
orchestrator available as a standalone tool, while implementation workflows continue through the
shared handback, coherent topics become separately confirmed commits, `commit` remains staged-only,
`pr` remains commit-only, explicit completion intent has visible precedence, and the repository’s
full CI-equivalent sequence passes.

## Validation plan

- Run focused contract tests first:
  `node --test test/workflow-contracts.test.mjs test/execution-location-contract.test.mjs test/worktree-lifecycle-contract.test.mjs`.
- Run the helper’s unit and Git-backed integration tests in isolated temporary repositories:
  confirmed staged/unstaged/untracked manifest entries, ambiguous and contradictory evidence,
  partially staged states, deletions/renames, unchanged and changed upstream blobs, three-way
  success/conflict, ignored files, tracked/untracked symlinks, post-validation content drift,
  source-index preservation, and expected/actual tree comparison.
- Manually exercise orchestration scenarios that remain instruction-driven: detached HEAD and
  base-branch source checkouts, confirmed multi-commit partition and ordering, an ambiguous
  mixed-topic partition, later-group failure retention, conflicting and explicit completion intents,
  a prepared committed PR branch, direct dirty `pr`, empty delivery branches, commit-hook mismatch
  retention, push/PR uncertainty, and ownership-safe lifecycle cleanup. Contract tests must assert
  the corresponding required guards and ordering even where no executable orchestrator exists.
- Run `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` in the order
  required by `AGENTS.md`.
- Run `git diff --check` and inspect the generated native/portable `deliver`, `commit`, and `pr`
  artifacts to confirm that includes, tool references, delegation suppression, and router catalog
  text resolve correctly without editing generated output.

## Test results

- `node --test test/delivery-selection.test.mjs test/delivery-selection-git.test.mjs` passed all
  20 focused helper and real-Git integration tests after review corrections.
- The focused workflow, execution-location, and lifecycle contract run passed all 198 tests before
  the repository-wide gate.
- The final post-archival sequence passed: `pnpm agent:check` checked 305 files, `pnpm test` passed
  all 741 tests, `node build.mjs` generated all three targets, `pnpm test:distribution` passed its
  offline smoke checks, and `git diff --check` reported no whitespace errors.
- The generated Claude, Codex, and portable distributions include the `deliver` workflow and its
  dependency-free helper; the offline distribution smoke test passed.

## Review findings

- The routed Node.js review found three Important filesystem-transfer findings. All were corrected:
  file/directory tree-shape transitions are topology-aware; unchanged tombstones never authorize
  deletion of ignored or local artifacts; and exact-path reconciliation handles fully and partly
  already-applied file-to-directory transitions without weakening bind-time directory rejection.
- Real Git regressions cover both tree-shape directions, refreshed-base descendants, ignored
  tombstone occupants, fully already-applied transitions, mixed manifests, and source/index
  preservation.
- The final Node.js re-review reported no must-fix, optional, or security findings. Residual review
  limits are concurrent filesystem mutation, disk or permission failures, custom Git filters, and
  non-UTF-8 path bytes; none produced a confidence threshold finding in this change.

## Assumptions and open points

- The public workflow name is `deliver`; it belongs to the existing “Deliver changes” group and is
  additive, so no deprecated alias is required.
- The built-in default for `delivery.completion` remains unchanged. This plan changes only explicit
  intent precedence and makes the override visible.
- `deliver` targets pull-request delivery. Users who already have a clean committed branch continue
  to call `pr`; users who want a configured implementation completion continue to call the relevant
  implementation workflow.
- The plan’s absolute source handle is
  `/Users/bs5/.codex/worktrees/b95c/effective-flow/docs/plan/2026-08-25-deliver-local-changes-through-clean-pr-branches.md`.
  Because that artifact currently lives in a detached release checkout, the implementation handoff
  must explicitly take it into the clean `origin/develop` delivery worktree as an untracked plan
  source, preserve unrelated plans in the existing local `develop` checkout, and let the established
  plan-archival state model commit only its final implemented archive form.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    0 |

### Findings

- No findings remain after revision. The review required deterministic three-way transfer rather
  than whole-file copying, mandatory executable helper tests, receipt-rooted commit delegation,
  residual-only handling for workflows with earlier commits, removal of existing-PR behavior from
  `deliver`, post-hook tree comparison, ignored/symlink policy, ownership-inventory updates, and an
  ambiguity gate for conflicting explicit completion actions, unambiguous partial-staging behavior,
  post-validation manifest reconciliation, correctly scoped executable tests, and complete public
  documentation surfaces, plus setup/cleanliness handling for the partial-diff worktree; all were
  incorporated above.
- **[Architecture] Important — incorporated:** `deliver` derives a candidate manifest from
  current-session change evidence, reconciles it with Git, and always obtains user confirmation;
  unclear evidence triggers focused interaction rather than a structured path syntax or silent
  natural-language parsing.
- **[Architecture] Important — incorporated:** `deliver` partitions a confirmed selection into one
  or more coherent, ordered commit groups using session task boundaries and diff evidence, requires
  confirmation of the exact partition, and aborts if it cannot obtain an unambiguous partition.
- **[Error cases] Important — incorporated:** only an unambiguous affirmative directive for the
  current invocation overrides `delivery.completion`; negated, hypothetical, descriptive, and
  alternative mentions do not, and unresolved ambiguity stops before mutation.

## Open points

None.
