# Deliver offers an upstream fast-forward before selection

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Before `deliver` assembles the candidate files, it should check whether the current source branch
is behind its remote. If it is, `deliver` offers to update the local branch from the remote first.
Today `deliver` never touches the source checkout, so a stale local branch only shows up indirectly:
the helper `transfer` rebases the selected delta onto the refreshed base with a three-way merge,
and it fails closed with a conflict when the upstream change overlaps a selected file. The user
then sees the problem late, after confirming a manifest, and in the isolated delivery worktree
rather than in their own checkout.

User decisions (2026-09-18):

- **Comparison target:** the current branch's upstream (`@{u}`), for example
  `develop` ↔ `origin/develop` or `feature/x` ↔ `origin/feature/x`. Without an upstream, on a
  detached HEAD, or with an upstream that no longer resolves, the check is skipped with one visible
  notice line. `delivery.baseBranch` is **not** compared here; step 3.1 keeps refreshing it as
  today.
- **Update method:** fast-forward only. No stash, no rebase, no merge commit. Uncommitted changes
  stay in place. If an incoming upstream change touches a path that is dirty or ignored locally,
  no fast-forward is offered.
- **No fast-forward possible** (branch diverged, or local paths overlap the incoming change): report
  the ahead/behind counts and, where relevant, the overlapping paths, then ask whether to continue
  without an update (the existing three-way transfer onto the refreshed base still applies) or to
  abort.
- **Hooks:** the fast-forward runs with hooks disabled, and the report says that `post-merge`
  hooks were skipped.

**Scope limit of the chosen target.** The late `transfer` conflict comes from
`delivery.baseBranch` (deliver.md step 3.1 and step 4.2). Fast-forwarding `@{u}` removes it only
when the upstream is the base branch, for example `develop` tracking `origin/develop`. For
`feature/x` tracking `origin/feature/x`, the check brings the feature branch current, but a
base-side conflict can still surface late in `transfer`. That remains the existing fail-closed
behaviour.

This is a Feature: new user-visible behaviour (a check, a new question, a possible source-branch
update) plus two new helper operations.

### Planning baseline

- Planned against `origin/develop` at `2c39546`, 2026-09-18. The local checkout was `538e224`, nine
  commits behind — the exact situation this plan addresses. None of those nine commits touches
  `src/tools/deliver.md` or `src/scripts/delivery-selection*.mjs`. They do change
  `docs/user-guide/tools-deliver.md`, and they move test line numbers, so the implementing run must
  start from the current `origin/develop`.
- On `origin/develop`, deliver measures **770** built lines against a `CONTEXT_BUDGET_LINES` entry
  of **775** (5 lines of headroom).
- On `origin/develop`, `test/workflow-contracts.test.mjs:13086` asserts that
  `src/tools/deliver.md` contains **exactly one** `ask` fence, the manifest confirmation.
  `:13101` pins the "sole routine approval" sentence, and `test/execution-location-contract.test.mjs:313`
  pins "leave the source checkout and its index unchanged".
- Verified by a throwaway-repo reproduction during the deep review:
  - `git merge --ff-only` keeps an unrelated staged change, an unstaged change and an untracked
    file.
  - It silently overwrites a locally ignored file that the upstream adds (default
    `--overwrite-ignore`).
  - It runs the `post-merge` hook, which can write into the checkout.
- The execution-location receipt records only the branch name for a branch checkout
  (`src/shared/execution-location.md:22-24`, preflight at 68-70). A fast-forward on the same branch
  therefore does not invalidate it; only deliver's own step 1.1 records `HEAD`.

## Architecture decisions

- **The source-checkout invariant gets one explicit, pre-evidence exception.** `deliver` keeps its
  promise to leave the source checkout and its index unchanged **from the moment the source
  evidence is captured**. The only write before that point is a fast-forward the user confirmed.
  The reasoning in the founding plan
  (`docs/plan/archive/2026-08-25-deliver-local-changes-through-clean-pr-branches.md`, lines 69-73
  and 214) is about protecting a confirmed manifest and the user's local state. A fast-forward
  before selection preserves both: it happens before any manifest exists, and it only runs when no
  dirty or ignored local path overlaps the incoming change.
- **Placement: after the source receipt is issued, before HEAD/index evidence and the selection.**
  Step 1.1 requires a verified execution-location receipt "before any operation that may write".
  Step 1.1 is therefore split:
  1. Issue and verify the receipt (repository identity, `EXECUTION_ROOT`, `RUNTIME_STATE_ROOT`).
  2. Run the upstream check and the optional fast-forward.
  3. Record source `HEAD`, branch, index and worktree state, and build the candidate selection.

  `bind-manifest` binds the source `HEAD`, and `verify-source` reports any later HEAD change as
  `SOURCE_DRIFT`. An update after binding would therefore force a new confirmation. That is why the
  check must run before the selection contract, which is also what the user asked for ("before
  assembling the files").

- **Entry gate in the core, decision flow in a lazy fragment.** This follows the rule recorded for
  `merge-gate-check-list-waiver` in `docs/developer-guide/build-system.md`: the entry gate stays in
  the always-loaded core, and the trigger is at least as wide as the text it defers.
  - `src/tools/deliver.md` carries the `upstream-status {root, fetch: true}` call and the one-line
    notices for `detached`, `no-upstream`, `upstream-gone`, a failed or stale fetch, `up-to-date`
    and `ahead`.
  - A new `src/shared/source-upstream-sync.md` holds the decision flow: both `ask` fences, the
    fast-forward rules, the hook rule, the unanswered default and the failure mapping.
  - deliver.md loads it through a ` ```lazy-include ` pointer with
    `when: upstream-status reports behind, behind-overlap, or diverged`.
  - Why a fragment: the budget, the existing one-`ask` test on `deliver.md` stays valid, and the
    fragment can be reused later (this plan wires only `deliver`).
  - `deliver` is not reachable from merge-gate, so the pointer does not widen the merge-gate eval
    identity (`docs/developer-guide/build-system.md`, lines 133-140).
- **Deterministic logic goes into the existing helper, not into prose.** Two new operations join
  `DELIVERY_SELECTION_OPERATIONS` in `src/scripts/delivery-selection-core.mjs`. Both follow the
  existing normalized envelope and exit-code scheme. No new runtime file, so `RUNTIME_SCRIPT_FILES`
  stays unchanged.
  - `upstream-status {root, fetch}`:
    - Resolves the current branch and its upstream the way `src/tools/pr.md:161-190` does
      (`for-each-ref` with `%(upstream:short)`), distinguishing detached, no upstream, and upstream
      gone. It also reads `branch.<name>.remote` and `branch.<name>.merge`.
    - With `fetch: true` and a named remote, it fetches `<remote> <merge ref>`. A local upstream
      (`.`) is never fetched. If `FETCH_HEAD` differs from the resolved `@{u}` afterwards (for
      example a narrowed single-branch refspec), the result carries `fetch.stale: true`. deliver
      then shows the "could not be refreshed" notice and continues without a question.
    - Git runs non-interactively: `GIT_TERMINAL_PROMPT=0` and an SSH `BatchMode=yes` command, so a
      credential prompt fails instead of hanging. This needs `env` support in the runner of
      `src/scripts/delivery-selection.mjs`.
    - It computes ahead/behind with `rev-list --left-right --count HEAD...<upstreamOid>`.
    - It computes the incoming paths with
      `git diff --name-only -z --no-renames <mergeBase> <upstreamOid>`, so both endpoints of an
      upstream rename count.
    - `overlappingPaths` lists every local path that is staged, unstaged, untracked **or ignored**
      (from the existing `statusInventory` read with `--ignored=matching`, rename endpoints
      included) and that equals an incoming path or is its parent or child directory.
    - An incoming gitlink (submodule) change is always blocking and is reported as overlap.
    - `state` is one of `detached`, `no-upstream`, `upstream-gone`, `up-to-date`, `ahead`,
      `behind`, `behind-overlap`, `diverged`.
    - It returns this shape:
      `{state, branch, upstream, headOid, upstreamOid, mergeBaseOid, ahead, behind, incomingPaths, overlappingPaths, fetch: {attempted, ok, stale}}`.
  - `fast-forward {root, expectedBranch, expectedHeadOid, expectedUpstreamOid}`: dry-run by
    default, like `transfer`. `executeOperation` and the CLI set `dryRun` for it as they do for
    `transfer`.
    - With `--apply`, the pre-check requires that the branch and `HEAD` are unchanged, that
      `expectedUpstreamOid` resolves to a commit, that `HEAD` is an ancestor of it
      (`git merge-base --is-ancestor`), and that a fresh overlap computation is still empty. `@{u}` is
      **not** re-read, so a concurrent fetch cannot fail or retarget the step.
    - It then runs
      `git -c core.hooksPath=/dev/null merge --ff-only --no-overwrite-ignore <expectedUpstreamOid>`.
    - Afterwards it verifies that `HEAD` equals `expectedUpstreamOid` and that every staged,
      unstaged, untracked and ignored path recorded before the merge still has its prior index
      and working-tree content and mode.
    - **Failure before any write** (pre-check mismatch, or Git refusing without moving `HEAD`)
      returns `SOURCE_DRIFT` or `COMMAND_FAILED` with `mutationMayHaveSucceeded: false`.
    - **Failure after the write** (`HEAD` moved but post-verification fails, or the outcome is
      unknown) returns `mutationMayHaveSucceeded: true` with the old and new `HEAD` and the
      differing paths, following `transfer`'s pattern (`delivery-selection-core.mjs:1358-1362`).
    - The fast-forward is never retried or forced.
- **Failure mapping in the fragment.**
  - A failure with `mutationMayHaveSucceeded: false` from either error code leads to the second
    question (continue without update / abort).
  - A failure with `mutationMayHaveSucceeded: true` is a hard stop before selection, reporting
    both `HEAD`s and the differing paths.
- **Hooks are disabled for the fast-forward.** A fast-forward runs `post-merge` and
  `reference-transaction`; no hook can refuse it, but a hook is repository code that can write
  into the source checkout. With `core.hooksPath=/dev/null` the invariant stays provable, and the
  report states that `post-merge` hooks were skipped.
- **A fetch failure never blocks delivery.** A failed or stale fetch (offline, auth, narrowed
  refspec) produces one notice and the run continues without the check. Step 3.1 still refreshes
  the base through `src/shared/base-branch-resolution.md`, which keeps its own stop-on-failure
  behaviour.
- **Two questions, both in the fragment:**
  - `behind`: "Update the local branch from its upstream before selecting?" with the options
    Fast-forward first / Continue without update / Abort.
  - `diverged`, `behind-overlap`, or a no-write fast-forward failure: "The local branch cannot be
    fast-forwarded. Continue without an update?" with the options Continue without update / Abort,
    after the counts and any overlapping paths have been reported.
  - **Unanswered or non-interactive:** both questions resolve to "Continue without update". No
    fast-forward ever happens without an explicit answer.
  - Abort happens before any mutation.
  - The "sole routine approval" sentence in deliver.md is extended to exempt this conditional
    pre-selection question. The phrase pinned at `test/workflow-contracts.test.mjs:13101` and the
    matching phrase in `docs/user-guide/tools-deliver.md:43` stay intact.
- **Ownership check:** no central skill owns Git branch synchronisation. `effective-delivery` owns
  repository validation, not upstream handling, so there is no second copy of a centrally owned
  playbook. `docs/developer-guide/skill-ownership.json` needs no change.

## Affected files

| File                                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/deliver.md`                      | Frontmatter `description` (line 2): qualify "without changing the source checkout". Split step 1.1 into "issue receipt" and "record evidence"; between them add the `upstream-status` call, the one-line notices and the lazy-include pointer, before the selection contract. Reword the invariant sentences (intro, Goal bullet "preserve the source checkout …", the "The source may be detached …" paragraph) to the "from the moment the source evidence is captured" form while keeping the regex-pinned phrases. Name both helper operations in the Project-conventions list. Extend the "sole routine approval" sentence. Add the upstream outcome (state, fast-forward done or skipped, hooks skipped) to the step 7 report list. |
| `src/shared/source-upstream-sync.md`        | New lazy fragment: both `ask` fences, unanswered default, fast-forward rules (dry run, `--apply`, hooks disabled, post-verification), failure mapping, abort boundary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/scripts/delivery-selection-core.mjs`   | Add `upstream-status` and `fast-forward` to `DELIVERY_SELECTION_OPERATIONS` and `executeOperation`; set `dryRun` for `fast-forward`. Reuse the git runner, `statusInventory` and the existing error codes; prefer `SOURCE_DRIFT` (3) and `COMMAND_FAILED` (6), plus `mutationMayHaveSucceeded` in `details`.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/scripts/delivery-selection.mjs`        | Extend the usage string and the operation list; accept `--apply` for `fast-forward`; add `env` support to the process runner for the non-interactive fetch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `build.mjs`                                 | Raise `CONTEXT_BUDGET_LINES.deliver` to the newly measured built line count plus at most ten, taken from the `Always-loaded core` report.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `test/delivery-selection-git.test.mjs`      | Real-repo cases with a local bare remote (see Validation plan).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `test/delivery-selection.test.mjs`          | Envelope and dispatch cases for the two operations, the dry-run default and input validation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `test/workflow-contracts.test.mjs`          | Keep the one-ask assertion on `deliver.md`. Add assertions: the `upstream-status` call and the lazy pointer appear before the selection contract; the pointer's `when:` trigger is pinned in the lazy-trigger battery (as at `:2693`); the fragment contains exactly two `ask` fences with the questions above, the unanswered default, the hooks-disabled rule and `--no-overwrite-ignore`, and forbids stash, rebase, merge commit, force and retry; deliver.md names both new helper operations.                                                                                                                                                                                                                                       |
| `test/execution-location-contract.test.mjs` | Adjust only if the reworded invariant no longer matches the pinned phrase at `:313`; the goal is to keep it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `docs/user-guide/tools-deliver.md`          | New subsection "When your branch is behind its upstream", including the scope limit for feature branches and the skipped hooks; qualify "without changing the source checkout" and "immutable source of evidence".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `docs/user-guide/worktree-and-delivery.md`  | Qualify the "remains unchanged, including its index" sentence (around lines 165-171).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `docs/user-guide/getting-started.md`        | Qualify "Your source checkout … remain[s] untouched" (around lines 214-230).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `docs/developer-guide/architecture.md`      | In the deliver section (around lines 199-248), describe the pre-evidence upstream step and why it sits before `bind-manifest`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `docs/developer-guide/build-system.md`      | Add `source-upstream-sync` to the list of mode-gated lazy fragments (around line 453).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## Implementation details

### Approach

1. Reset the working branch onto the current `origin/develop` and remeasure deliver's budget with
   `node build.mjs`.
2. Add `env` support to the helper's process runner.
3. Implement `upstream-status` in the helper core as described under Architecture decisions.
4. Implement `fast-forward` with dry-run default, pre-checks, the hook-free
   `--no-overwrite-ignore` merge, post-verification and the two failure classes.
5. Wire both operations into the CLI entry point and write the unit and real-repo tests.
6. Write `src/shared/source-upstream-sync.md` (English, like all sources).
7. Edit `src/tools/deliver.md`: frontmatter, split step 1.1, the status call and notices, the
   lazy pointer, the invariant and approval sentences, the report list.
8. Update the contract tests, then the five documentation files.
9. Build, remeasure, set the budget entry, then run the CI sequence.

### Edge cases

- **Detached HEAD, no upstream, upstream gone:** one notice line; continue with no question.
- **Local upstream (`branch.<name>.remote = .`):** compare without fetching.
- **`branch.<name>.merge` names a different branch than the local one:** fetch and compare exactly
  that merge ref.
- **`up-to-date` or `ahead` only:** no question; a short status line in the progress update.
- **Fetch fails or stays stale** (`FETCH_HEAD` ≠ `@{u}`): one notice ("upstream could not be
  refreshed; continuing without the check"); no question.
- **`behind`, dirty paths but none overlap:** offer the fast-forward. Unrelated staged, unstaged
  and untracked changes survive, and the post-verification proves it.
- **`behind-overlap`:** no fast-forward offer. List the overlapping paths and ask continue/abort.
  Overlap includes an untracked or ignored local file that the upstream adds, a local change to the
  source path of an upstream rename, a directory/file clash, and any incoming gitlink change.
- **`diverged`:** report the ahead/behind counts and ask continue/abort. Never offer a rebase or a
  merge commit.
- **Upstream moves between the status call and `--apply`:** the pre-check does not re-read `@{u}`
  and fast-forwards to the pinned `expectedUpstreamOid`. If the branch or `HEAD` moved, the no-write
  `SOURCE_DRIFT` leads to the second question.
- **Git refuses the fast-forward without writing** (lock, race, clash the overlap check missed):
  no-write `COMMAND_FAILED`, report the diagnostic and ask continue/abort; never retry.
- **`HEAD` moved but post-verification fails:** hard stop before selection with both `HEAD`s and
  the differing paths; no continue offer.
- **Repository has a `post-merge` hook:** skipped by `core.hooksPath=/dev/null` and reported.
- **Unanswered or non-interactive run:** continue without update.
- **Source on the base branch** (for example `develop` tracking `origin/develop`): the fast-forward
  also brings the local base current. Step 3.1 still fetches the base independently; a second fetch
  is accepted.
- **Feature branch tracking its own remote branch:** the fast-forward updates the feature branch;
  a base-side conflict can still surface late in `transfer`, as today.
- **Harness-managed source worktree on a branch:** same behaviour. A fast-forward of the
  checkout's own branch is not a switch, stash or clean.

## Acceptance criteria

- [ ] `upstream-status` returns the documented shape and classifies `detached`, `no-upstream`,
      `upstream-gone`, `up-to-date`, `ahead`, `behind`, `behind-overlap` and `diverged` correctly
      in real-repo tests against a local bare remote, including the overlap cases for ignored
      files, rename sources, directory/file clashes and gitlinks, and `fetch.stale` for a narrowed
      refspec.
- [ ] `fast-forward` without `--apply` changes nothing. With `--apply` it moves `HEAD` exactly to
      `expectedUpstreamOid` without running any hook, and it preserves every non-overlapping
      staged, unstaged, untracked and ignored path byte-for-byte and mode-for-mode. It returns a
      no-write failure without mutation when the branch, `HEAD` or overlap changed, and a
      `mutationMayHaveSucceeded: true` failure when post-verification fails after the move.
- [ ] `src/tools/deliver.md` calls `upstream-status` after the source receipt is issued and before
      source `HEAD`/index evidence and the selection contract, carries the skipped-state notices,
      and still contains exactly one `ask` fence, the manifest confirmation.
- [ ] `src/shared/source-upstream-sync.md` contains exactly two `ask` fences, offers a fast-forward
      only in state `behind`, resolves an unanswered question to "Continue without update", and
      forbids stash, rebase, merge commit, force and retry.
- [ ] The five user- and developer-guide files describe the confirmed-fast-forward exception and
      the skipped hooks consistently with `deliver.md`.
- [ ] `CONTEXT_BUDGET_LINES.deliver` equals the measured built line count plus at most ten.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` all pass.

## Validation plan

- Real-repo tests in `test/delivery-selection-git.test.mjs`. Each creates a bare "remote" and two
  clones, advances one clone, and exercises the other:
  - all eight states;
  - fetch disabled vs enabled, a local-dot upstream, a merge ref that differs from the branch
    name, and a narrowed refspec (`fetch.stale`);
  - a fast-forward with an unrelated staged change, an unrelated unstaged change and an unrelated
    untracked file (all preserved);
  - overlap through a modified tracked file, an untracked file the upstream adds, an ignored local
    file the upstream adds (content preserved, no offer), a local change to an upstream rename's
    source path, a directory/file clash, and an incoming gitlink (no offer; `--apply` refused);
  - a `post-merge` hook that writes a file (not run; no file created);
  - drift of `HEAD` between status and `--apply` (no-write `SOURCE_DRIFT`, `HEAD` unchanged);
  - the upstream moving between status and `--apply` (fast-forward to the pinned OID);
  - a simulated post-write verification failure (`mutationMayHaveSucceeded: true`).
- Unit tests in `test/delivery-selection.test.mjs` for dispatch, the dry-run flag and input
  validation errors.
- Contract tests in `test/workflow-contracts.test.mjs` as listed under Affected files, including
  the trigger pin and the unanswered default.
- The CI sequence: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- Manual smoke run: in a checkout of this repository that is behind `origin/develop`, run
  `/effective-flow deliver`. Confirm that the question appears before the manifest, that the
  fast-forward keeps an unrelated dirty file, and that the manifest shows only session changes.

## Assumptions and open points

- The fragment is wired only into `deliver`. Reusing it in `pr` or `commit` is out of scope.
- The late base-side conflict for feature branches stays as it is (see Requirement, scope limit).

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    1 |
| Testability     |        0 |         0 |    1 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    0 |

### Findings

- **Architecture, Important (incorporated):** An update after `bind-manifest` would trip
  `verify-source` as HEAD drift. The step is therefore placed before evidence capture, and step 1.1
  is split so that the "receipt before any write" rule still holds.
- **Error cases, Important (incorporated):** A plain `git merge --ff-only` in a dirty checkout
  could fail halfway or depend on Git's refusal behaviour. The plan now pre-computes the overlap,
  pins the target OID, and post-verifies every previously dirty path.
- **Error cases, Note:** A fetch failure is deliberately non-blocking here, because step 3.1
  already owns the stop-on-fetch-failure rule for the base.
- **Testability, Note:** The staged-entries behaviour of `--ff-only` was an explicit assumption; a
  deep-review reproduction has since confirmed it.
- **Scope, Note:** Rebase, merge commits, autostash and base-branch comparison were considered and
  excluded by user decision.

### Deep review 2026-09-18

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         1 |    0 |
| Data protection |        1 |         0 |    0 |
| Error cases     |        0 |         4 |    1 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    1 |

All findings are incorporated; none remains open.

- **Data protection, Critical (incorporated):** `git merge` defaults to `--overwrite-ignore` and
  silently replaced a locally ignored file in a reproduction. Ignored paths now count as overlap,
  the merge uses `--no-overwrite-ignore`, and post-verification and tests cover ignored files.
- **Security, Important (decided):** A fast-forward runs `post-merge`, which is repository code
  that can write into the source checkout, and no hook can refuse a fast-forward. User decision:
  disable hooks with `core.hooksPath=/dev/null` and report the skip.
- **Error cases, Important (incorporated):** A failure after `HEAD` moved was mapped to "refused"
  and offered continue. Failures now split into no-write (continue/abort) and post-write (hard
  stop with `mutationMayHaveSucceeded: true`), with one consistent mapping for both error codes.
- **Architecture, Important (incorporated):** A lazy trigger "branch is behind" depended on a call
  and notices that the fragment itself held. The status call and the skipped-state notices now
  live in deliver.md; the trigger covers all three question states and is pinned by a test.
- **Error cases, Important (incorporated):** The upstream-moved edge case contradicted the
  pre-check. The pre-check now uses `merge-base --is-ancestor` against the pinned OID and never
  re-reads `@{u}`.
- **Error cases, Important (incorporated):** The overlap computation was underspecified (HEAD vs
  merge base, rename sources, directory/file clashes, gitlinks). It now uses
  `--no-renames <mergeBase> <upstreamOid>`, matches parent and child paths, and blocks on gitlinks.
- **Error cases, Important (incorporated):** An unanswered or non-interactive question had no
  defined result. It now resolves to "Continue without update".
- **Error cases, Note (incorporated):** The fetch could hang on a credential prompt or stay stale
  under a narrowed refspec. It now fetches the merge ref non-interactively and compares
  `FETCH_HEAD` with `@{u}`.
- **Maintainability, Note (incorporated):** The frontmatter description, the build-system lazy
  fragment list, the `dryRun` flag handling and the pinned approval phrases were missing from the
  affected files; stale test line numbers were updated to `origin/develop`.
- **Scope, Note (incorporated):** Fast-forwarding `@{u}` removes the late conflict only when the
  upstream is the base branch; the limit is now stated in the Requirement and as an edge case.

## Implementation notes

Implemented on 2026-09-18 by `effective-flow build` on branch
`effective-flow/build/deliver-upstream-fast-forward`, created from `origin/develop` at `2c39546`.

Deviations from the plan and additions made during the review rounds:

- **Incoming paths** come from `git diff-tree -r -z --no-renames`, which lists the same paths as
  `git diff --name-only` and also yields the file modes the gitlink check needs.
- **Merge flags:** the fast-forward also passes `--no-autostash` and `--quiet`, so a
  `merge.autoStash` setting cannot stash local changes.
- **Fetch:**
  - runs with hooks disabled, `--no-tags` and a 60-second timeout;
  - respects the user's SSH command (`GIT_SSH_COMMAND` › `core.sshCommand` › `ssh`) and appends
    `-o BatchMode=yes` instead of overriding it;
  - reports a failure in `fetch.error`;
  - an invalid or option-like remote or merge ref skips the fetch
    (`fetch.skipped: 'invalid-config'`) instead of failing the status.
- **Case folding:** with `core.ignorecase` the overlap check folds case.
- **Post-verification scope:** only local entries whose parent directory contains, or is an
  ancestor of, an incoming path are snapshotted. Dirty and untracked entries are compared by
  content and mode; ignored entries by the metadata of the listed entry, without recursion. Entries
  a fast-forward cannot touch are not read, which avoids reading large ignored trees and false
  hard stops from unrelated writers. This narrows the acceptance wording "every … ignored path" to
  every path the fast-forward can touch.
- **Diagnostics:** a merge refusal carries Git's capped `stderr`. Any unexpected exception before
  the merge maps to `COMMAND_FAILED` with `mutationMayHaveSucceeded: false`, and a failure without
  that field is treated as `true` by the fragment.
- **deliver.md step 1.1:** a failed `upstream-status` envelope, a failed, stale or skipped fetch,
  and every non-question state end the check with one notice line. The lazy pointer keeps the
  trigger "upstream-status reports behind, behind-overlap, or diverged"; the fetch condition is
  stated in the step text and in both `ask` fences.
- **Budget:** `CONTEXT_BUDGET_LINES.deliver` is 790 for a measured 788 lines.

## Test results

- `pnpm agent:check`: passed (424 files).
- `pnpm test`: 992 tests, 992 passed.
- `node build.mjs`: passed; `deliver 788/790`.
- `pnpm test:distribution`: offline checks passed.

## Review findings

**Date:** 2026-09-18
**Reviewer:** effective-flow-nodejs-reviewer, effective-flow-generic-product-reviewer

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    16 |
| Open / Not implemented |     2 |

**External review report:** `.effective-flow/review/review-report-2026-09-18-plan-deliver-offers-upstream-fast-forward-before-selection.md`

## Open points

- No open points.
