# Parallel issue planning with per-issue claims from the remote base

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Today Issue Buddy, and therefore every issue-sourced `effective-flow autopilot` run, is serialized per repository. Two mechanisms cause this:

- **A whole-pass `pass.lock`** in `.effective-flow/issue-buddy/`. While it is held, any other pass stops immediately with `LOCKED`.
- **A primary-checkout requirement.** The run has to start in the primary checkout, which must be clean and sit exactly at `origin/<base>`.

On 2026-11-19 a second autopilot run for #693 stopped with `LOCKED` 35 s after the first one started. A run for a different issue would have stopped the same way. The investigation report `.effective-flow/investigation/investigation-2026-11-20-autopilot-parallellaeufe-durch-issue-buddy-sperre-blockiert.md` in the primary checkout covers the details.

The new behavior:

1. **Start from the remote base.** Every planning run starts from the fetched tip of the repository's resolved remote base branch. The base is never hard-coded, and is resolved in this order:
   - `delivery.baseBranch` when it is configured (in this repository `origin/develop`);
   - otherwise the remote default branch `origin/HEAD`;
   - otherwise `origin/main`.

   This is the base resolution Issue Buddy uses today (`src/tools/issue-buddy.md` Phase 0 step 9). Most repositories have only `main` and no configuration, and resolve to `origin/main`. The local branch, cleanliness or position of the invoking checkout no longer matters. Runs may be started from the primary checkout or from any linked or harness worktree of the same repository.
2. **One run per issue.** An issue may be planned by at most one run at a time, across Issue Buddy (batch and `--issue`), issue-sourced autopilot and `effective-flow plan-issue`.
3. **Different issues in parallel.** Different issues may always be planned in parallel. No repository-wide lock spans a planning run any more.
4. **Batch skips.** An Issue Buddy batch pass skips an issue that another run is planning, records it as skipped (`issue-in-progress`) and keeps going with the remaining issues.
5. **Autopilot holds its issue until it ends.** An issue-sourced autopilot run holds its issue's claim from `run-init` until `run-close`, with or without a pull request. No second autopilot, Issue Buddy or `plan-issue` run can work on that issue in the meantime.
6. **Nothing that already has a pull request.** Autopilot neither plans nor implements an issue that already has an open pull request (Issue Buddy's `open-pull-request` skip, which also covers an existing plan PR). It stops with that reason and no pull request, instead of continuing on the existing plan PR.
7. **`plan-issue` holds its issue for the whole planning.** It claims each issue from the start of its planning, including interactive clarification, until that issue's tracker writes are done.
8. **Autopilot target unchanged.** Autopilot still ends in a draft pull request, as in the run that produced PR #697: the plan PR on `effective-flow/plan/issue-<N>` carries the implementation and stays a draft. Nothing about decisions, ledger, draft status or merge behavior changes, apart from item 6.

**Why Feature:** this is new user-visible behavior (parallel runs, a new skip reason, invocation from worktrees, a stricter existing-PR rule) across scripts, tool contracts, tests and docs. It is not the correction of a defect, because the current serialization is documented and intended.

## Outcome checkpoint

**Primary source:** user request in this session (sebastian-software/effective-flow, branch `develop`); evidence from the investigation of run `ap-20261119T220137Z-08cca959`
**Original outcome:** Issue planning runs start from `origin/<base>`, allow one run per issue, run in parallel across issues, and keep autopilot's draft-PR end state; autopilot never works on an issue that already has an open PR
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** none yet
**Continuation decision:** none

## Architecture decisions

### Claim

- **A shared per-issue planning claim replaces the whole-pass lock.** It is a durable record at `<RUNTIME_STATE_ROOT>/.effective-flow/planning-claims/<target-key>/<issue-key>.json`.
  - It follows the presence-marker pattern of `src/scripts/effective-flow-state-presence-core.mjs`: create only if absent, release by token, a read-only `list` that never returns the token, and `prune` for cleanup (`:20-24`).
  - Record fields: `claimId` (token), `workflow` (`issue-buddy` | `autopilot` | `plan-issue`), `runId` or `passId`, `acquiredAt`, `pid`, `hostname`.
- **One helper derives the claim key.** It is a single operation that derives `<target-key>`/`<issue-key>`:
  - on a forge target, from the `remote-tracker.mjs repository-resolve` result (repository identity);
  - on an external target, from the resolved tracker-target id plus the external issue key.
  
  Issue Buddy, autopilot and `plan-issue` all use it, so the keys cannot diverge between workflows.
- **The claim lives in its own operation group of the state helper.** It goes in `effective-flow-state.mjs` as `planning-claim key|acquire|release|list|prune`, not inside `issue-buddy-core.mjs`, because three workflows need it.
  - `acquire` also refuses while a legacy `.effective-flow/issue-buddy/pass.lock` exists. Today `rejectLegacyLocks` runs only inside the Issue Buddy mutex (`src/scripts/issue-buddy-core.mjs:526-543`).
- **Claims are never broken automatically.** A killed or abandoned run blocks only its own issue.
  - `list` reports age, the 2 h stale flag and pid/hostname liveness on the same host. A long, live autopilot run is therefore not mistaken for an orphan.
  - `prune` releases a claim without the token only with an orphan proof or after confirmed staleness, and re-checks the record identity immediately before unlinking. An orphan proof means: the owning pass record is gone, or the owning autopilot ledger is closed or gone, or the process is dead on the same host.
  - `effective-flow cleanup` gains this as a new, confirmed-per-claim section. Today it has no `pass.lock` rule.
- **Autopilot claims inside `run-init`.** `run-init` acquires the claim for an issue source and creates the ledger in the same helper call.
  - The order is: claim, then ledger. On `ISSUE_CLAIMED` no run is created, and the run ID of the holder is named.
  - `run-close` releases the claim, in both the PR and the no-PR outcome.
  - Preflight keeps its "writes nothing" rule (`src/tools/autopilot.md:118`), and Stage B classification still runs before `run-init`, so a `container-issue` or failed classification leaves no claim.
  - The token stays inside the helper. It is stored only in the claim record and in an internal ledger field that `pr-appendix` never renders.
  - Issue Buddy adopts the claim through the existing `Autopilot run: <run-id>` caller line. `planning-claim` verifies helper-internally that the claim's `runId` belongs to an open ledger whose source is `--issue <N>`, just as `consent-check` verifies the ledger today. No token ever enters a caller line, envelope or model context.

### Passes and concurrency

- **Each pass keeps a record, but not a lock.** `pass.lock` becomes `passes/<passId>.json`, keeping its collection intent and result, pending verdict journal and `outcomes`. Many passes can therefore exist at once. `pass-lock-acquire`/`pass-lock-release` become `pass-open`/`pass-close`. Orphaned pass records are pruned by `cleanup` with the same orphan proof as claims.
- **The mutation mutex covers no network or forge call.** Today `executeOperation` runs all of `pass-collect` inside `withMutationLock` (`issue-buddy-core.mjs:1841-1853`), including `git fetch` with a 60 s timeout (`:873`, `:404`), `ls-remote`, the issue and PR listings (`:900-901`) and per-issue permission and comment reads (`:917`, `:951`).
  - Local `git` calls of the runtime guard (`ls-files`, `check-ignore`, `:441-458`) stay allowed under the mutex.
  - Within that bound, `EADDRINUSE` triggers a jittered retry for a total of at most 10 s before `LOCKED`.
- **`pass-collect` runs in four steps:**
  1. Read phase, unlocked: fetch, forge reads, trust reads, selection, and identification of recovery candidates.
  2. Locked: claim the selected and recovery candidates, re-read the cache, apply cache skips, write the collection intent. A batch pass replaces an `issue-in-progress` candidate with the next eligible one, within `limits.judgments`.
  3. Unlocked: re-check open PR and plan branch for the claimed issues.
  4. Locked: finalize the collection result. Release claims of candidates dropped by the re-check.
- **Recovery and accounting only for claimed issues.** Orphan-branch and unrecorded-PR recovery are authorized today for every candidate (`:1185`, `:1198`). Stale-attempt accounting writes `failed` records (`:1138-1167`).
  - Both now require a claim the pass holds, so another live pass's in-flight branch or PR is never treated as orphaned.
  - No workflow currently passes `staleAttempts`, so its scoping is defensive.
- **Trusted text is cleared per claimed issue only.** `clearTrusted` (`:1058-1074`, called at `:1216`) today deletes every `trusted/issue-*.json`. It is restricted to the issues the pass has claimed, because a parallel pass's readiness leaf or plan run reads its own file at the fixed path from `src/shared/unattended-planning.md:83`.
- **Cache writes merge, and the journal compares per issue.** `verdicts.json` stays one file. Every writer re-reads it under the mutex and patches only the records of issues it holds a claim for, except closed-PR observations.
  - The pending-verdict journal today compares a digest of the whole cache (`:1395-1409`, `:1484-1499`). It becomes a per-issue, per-attempt comparison.
  - `last-pass.json` becomes "latest finished pass", written last-writer-wins and informational only.
  - `limits.judgments` and `limits.plans` count against each pass.

### Execution location

- **The runtime state root stays primary.** Every runtime-state helper keeps `cwd` = primary checkout (`RUNTIME_STATE_ROOT`), and `contextFor` (`:411-438`) keeps refusing a linked `cwd`.
  - The invoking tool derives the primary checkout from the first `git worktree list --porcelain` record, wherever it was invoked.
  - Plan sources use a separately validated `sourceRoot`, following `src/scripts/autopilot-core.mjs:945-952`, `:1747-1750`.
- **Issue Buddy gets a planning worktree per pass.** It is created after `pass-collect`, at `collect.baseOid`, so there is no second fetch and no HEAD ≠ `baseOid` stop.
  - It reuses the `base-validation` pattern of `src/scripts/effective-flow-state-worktree-core.mjs` (`:202-211`, `:2360-2366`): a temporary branch under the branch prefix, removed when unadvanced, with a new purpose `issue-planning`. The record schema does not change.
  - Under `applyReview.worktree.baseDir` (default `.effective-flow/.worktrees/`).
  - The primary checkout is touched neither for Git nor for plan files.
- **The plan writer gets the planning worktree as root.** `src/shared/unattended-planning.md` step 4 today resolves `EXECUTION_ROOT` from the sub-orchestrator's own checkout, and the envelope carries no root. The envelope gains an explicit, validated `Execution root:` control line naming the planning worktree.
  - `plan-lint publication-metadata` and `plan-publication` are called with `cwd` = planning worktree. `verifyRepositoryRoot` (`src/scripts/plan-publication-core.mjs:854-866`) already accepts a worktree root, and publication writes no runtime state, so `plan-publication-core.mjs` needs no change.
- **Preserved plans keep their worktree.** When Phase 5 must preserve a plan, for example because publication failed, the planning worktree stays. `git worktree remove` would refuse it anyway because of the untracked file.
  - Issue Buddy's Phase 1 leftover inventory (`src/tools/issue-buddy.md:144-158`) reads the `issue-planning` worktree records instead of the checkout's `plan.dir`.
  - `cleanup` reports such worktrees with path and issue.
  - The issue's claim is released anyway, so the issue stays plannable.
- **Autopilot uses its own delivery worktree for the restored plan.** Autopilot restores the plan in a run-owned `delivery` worktree on the plan head branch and passes absolute paths downstream.
  - `plan-pr-continuation` adopts that worktree as `SOURCE_ROOT` (`src/shared/plan-pr-continuation.md:157-160`), as do `decision-extract`, `plan-lint` and the build argument.
  - "Plan on the base" (`src/shared/autopilot-issue-source.md:117-125`) reads the plan from that worktree, created at the base, instead of from "the base-tip checkout".

### Workflows

- **Autopilot stops on an existing open PR.** The `open-pull-request` skip maps to a stop with no pull request. The "Existing plan pull request" continuation (`src/shared/autopilot-issue-source.md:104-114`) is removed. A plan PR published earlier by a batch pass is then continued by hand (for example `effective-flow apply` on its plan), not by autopilot.
- **`plan-issue` claims from the start of planning and reads code without a worktree.** The claim is taken per issue at the start of its Phase 2 (`src/tools/plan-issue.md:264`) and held through clarification until that issue's comment and label writes are done.
  - A single-issue run on a held claim stops with the holder. A multi-issue run reports a skip and continues.
  - Its read-only codebase examination fetches `origin/<base>` and reads it at that OID with `git ls-tree`, `git show` and `git grep`. No worktree is created, so an abandoned session leaves only its claim behind.
  - It still writes no plan file and keeps its comment contract.
- **Remote guards stay as the cross-machine safety net.** Claims are machine-local. `BRANCH_EXISTS`, `PR_EXISTS`, `plan-branch-exists`, the create-only push and the canonical planning comment ID keep preventing duplicates across machines.
- **`issue-in-progress` is not the lifecycle label.** It is a skip reason for a local claim. It is distinct from the label `effective-flow-issue-in-progress`, which maps to `lifecycle-label` (`issue-buddy-core.mjs:40-41`). The user docs state the difference.

## Affected files

| File | Description |
|---|---|
| `src/scripts/effective-flow-state.mjs`, new `src/scripts/effective-flow-state-planning-claim-core.mjs` | `planning-claim key/acquire/release/list/prune` on the presence-marker pattern; legacy-lock refusal; ledger-verified adoption for autopilot |
| `src/scripts/effective-flow-state-worktree-core.mjs` | Purpose `issue-planning` on the `base-validation` pattern |
| `src/scripts/issue-buddy-core.mjs` | Pass records under `passes/`; four-step `pass-collect`; claim-scoped recovery, stale accounting and `clearTrusted`; merge-only cache; per-issue journal digest; bounded mutex retry |
| `src/scripts/issue-buddy.mjs` | `pass-open`/`pass-close` replace `pass-lock-acquire`/`pass-lock-release` |
| `src/scripts/autopilot-core.mjs` | Claim inside `run-init`, release in `run-close`, internal unrendered token field |
| `build.mjs` (`RUNTIME_SCRIPT_FILES`) | Ship the new core module |
| `src/tools/issue-buddy.md` | Intro, helper discipline paragraph, Phase 0 steps 1, 7 and 9, planning worktree after collect, the Phase 2 HEAD check (on the planning worktree), Phase 1 leftover inventory from worktree records, Phase 5 preservation, the release section and the skip reason `issue-in-progress` |
| `src/shared/unattended-planning.md` | `Execution root:` control line and its validation |
| `src/shared/autopilot-issue-source.md` | Drop "Checkout preconditions" 1, 4 and 5; `ISSUE_CLAIMED` from `run-init` and `open-pull-request` as stops; remove "Existing plan pull request"; "Restore the plan" and "Plan on the base" via the delivery worktree |
| `src/shared/plan-pr-continuation.md` | Adopt the autopilot delivery worktree as `SOURCE_ROOT` |
| `src/tools/autopilot.md` | Preflight step 7, claim in `run-init`, release in `run-close`, delivery worktree, Phase 5 cleanup |
| `src/shared/issue-buddy-autopilot.md` | Claim adoption through `Autopilot run:`; wording on lock and root |
| `src/tools/plan-issue.md` | Claim from the start of Phase 2, skip or stop on a held claim, read-only examination at the fetched OID without a worktree, release on every exit |
| `src/tools/cleanup.md` | New sections for planning claims and orphaned pass records (list, confirmed `prune`), and for kept `issue-planning` worktrees |
| `src/shared/runtime-state-safety.md` | Execution-location wording for planning and delivery worktrees as `sourceRoot` |
| `test/issue-buddy.test.mjs`, `test/issue-buddy-git.test.mjs`, `test/issue-buddy-pass.test.mjs`, `test/issue-buddy-contract.test.mjs`, `test/fixtures/issue-buddy/world.mjs` | Adjust lock tests (`:365`, `:1360`, `:2362`) and contract labels ("Whole-pass lock.", primary-root text at `:45-60`); add parallel, claim, recovery-scope, trusted-text and journal cases |
| new `test/planning-claim.test.mjs` | Claim primitive, key derivation, prune proofs, legacy-lock refusal |
| `test/effective-flow-state-worktree.test.mjs`, `test/worktree-lifecycle-contract.test.mjs` | Purpose `issue-planning` |
| `test/autopilot-core.test.mjs` | Claim in `run-init`, release in `run-close`, token not rendered |
| `test/unattended-planning-contract.test.mjs`, `test/workflow-contracts.test.mjs`, `test/helper-call-shape-contract.test.mjs` | `Execution root:` line, removed continuation path, `plan-issue` claim contract, renamed operations |
| `docs/user-guide/tools-automation.md` (`:47`, `:124-125`, `:136-137`), `docs/user-guide/tools-understand.md` (Issue Buddy, `plan-issue`), `docs/user-guide/remote-tracker.md` (`:744` ff.), `docs/developer-guide/architecture.md` (`:518-520`) | Parallel planning, claims, base-tip start, existing-PR stop, claim cleanup, `issue-in-progress` vs. lifecycle label |
| new ADR `docs/adr/parallel-issue-planning.md` | Record the switch from the repo-wide pass lock to per-issue claims. Mark the lock statement in `docs/adr/plan-only-unattended-publication.md:14-17` as superseded by it |

## Implementation details

### Approach

1. **Claim primitive and key.** Implement `planning-claim` with guarded paths (`runtime-state-safety`), holder details without the token, the stale flag and liveness, and key derivation for forge and external targets.
   - `acquire` returns `CLAIMED` with `{workflow, runId|passId, ageMs, stale}` on an existing record and never waits. It refuses while a legacy `pass.lock` exists.
   - `prune` requires an orphan proof or explicit stale confirmation, plus an identity re-check.
2. **Worktree purpose.** Add `issue-planning` on the `base-validation` pattern, including `inspect` and cleanup support.
3. **Mutex scope.** Restructure `pass-collect` into the four steps. Audit every other operation for network or forge calls under the mutex. Add the jittered retry for at most 10 s.
4. **Pass records instead of the pass lock.** Move the record to `passes/<passId>.json` and rename the operations. `pass-close` deletes the record after the report.
5. **Claim-aware collection.**
   - With `--issue <N>` and an `Autopilot run:` caller line, adopt the claim verified against the open ledger. Without that line, a held claim fails the pass with `ISSUE_CLAIMED` and the holder.
   - In batch mode, a held claim yields `issue-in-progress` and the next eligible candidate.
   - Restrict recovery, stale accounting and `clearTrusted` to claimed issues.
   - The pass releases its own claims when each verdict is final, and the rest in `pass-close`. It never releases an adopted autopilot claim.
6. **Cache and journal.** Re-read and patch per-issue records under the mutex. Reject writes for unclaimed issues, except closed-PR observations. Switch the journal digest to per issue and per attempt.
7. **Planning worktree.**
   - After `pass-collect`, create the `issue-planning` worktree at `collect.baseOid` and pass it as `Execution root:` to the plan writer.
   - Run `plan-lint publication-metadata` and publication with `cwd` = that worktree. The Phase 2 HEAD check runs on it.
   - On exit, remove it, unless Phase 5 preserves a plan in it.
8. **Unattended planning.** Add and validate the `Execution root:` control line. The root must be a registered worktree of the same Git common directory.
9. **Autopilot.**
   - `run-init` claims and then creates the ledger.
   - Map `open-pull-request` to a no-PR stop and remove the "Existing plan pull request" path.
   - After publication, create a run-owned `delivery` worktree on the plan head branch. Restore the plan there and hand its absolute paths to `plan-pr-continuation`, `decision-extract`, `plan-lint` and the implementing workflow. "Plan on the base" uses the same worktree, created at the base.
   - `run-close` releases the claim.
   - The draft-PR end state, decisions and ledger contents stay untouched apart from the internal claim field.
10. **`plan-issue`.**
    - Claim at the start of Phase 2 per issue. On a held claim, stop a single-issue run or skip in a multi-issue run.
    - Examine the code read-only at the fetched `origin/<base>` OID.
    - Release after the issue's writes, and on every exit path.
11. **Cleanup.** List claims, orphaned pass records and kept `issue-planning` worktrees. Prune each claim or record only after confirmation, and remove worktrees through the worktree-record mechanism.
12. **Docs and ADR.** Update the user and developer docs listed above. Write the ADR and point the old ADR to it.

### State management

- **Local runtime state** (under the primary checkout's `.effective-flow/`):
  - `planning-claims/` holds one record per claimed issue.
  - `issue-buddy/passes/` holds one record per active pass.
  - `issue-buddy/trusted/` holds per-issue trusted text, cleared per claimed issue.
  - `issue-buddy/verdicts.json` is merged per issue, with a per-issue journal digest.
  - `issue-buddy/reports/` and `issue-buddy/last-pass.json` are informational.
  - The autopilot ledger has an internal, unrendered claim field.
  - Worktree records cover `issue-planning` and the autopilot `delivery` worktree.
- **Remote state** (branches, pull requests, planning comments) keeps its existing create-only and idempotency guards.

### Edge cases

- **Same issue, two autopilot runs:** the second `run-init` returns `ISSUE_CLAIMED` with the holder run ID, and no ledger or PR is created. This holds for the whole first run.
- **Autopilot on an issue with an open PR:** it stops with `open-pull-request` and no pull request. That includes a plan PR from an earlier batch pass and a PR from a finished autopilot run.
- **Same issue in a batch pass and an autopilot run:** whichever claims first wins. The batch pass records `issue-in-progress`, and the autopilot run stops with `ISSUE_CLAIMED`.
- **`plan-issue` and Issue Buddy on the same issue:** they exclude each other through the same derived key.
- **Abandoned interactive `plan-issue` session:** only its claim stays, with no worktree. `cleanup` shows it as stale after 2 h, or as orphaned once its process is gone, and prunes it after confirmation.
- **Run killed (SIGKILL, closed session):** its claim, pass record and possibly its worktree stay. Only that issue is blocked until `cleanup` prunes the claim with an orphan proof. Other issues stay plannable.
- **Long live autopilot run older than 2 h:** `list` shows it as stale but alive, and `prune` refuses without explicit confirmation.
- **Publication failed and the plan is preserved:** the planning worktree stays and is reported, and the claim is released. A later pass sees the leftover through the worktree records.
- **Parallel batch collections:** the read phases run concurrently and only the short locked steps serialize. `LOCKED` after 10 s points to a stuck helper.
- **Another pass's in-flight plan branch, PR or trusted text:** it is never recovered as an orphan or deleted, because recovery and `clearTrusted` require a held claim.
- **Run on another machine on the same issue:** the remote guards prevent duplicates. A run that loses the race stops as it does today.
- **Invoking checkout dirty, on another branch, or a T3 worktree:** irrelevant. Planning starts from the fetched resolved base (`origin/main` in a repository without configuration).
- **`origin/<base>` moves while a run is in progress:** each run keeps its own `collect.baseOid`. Publication compares `expectedBaseOid` as it does today.
- **Legacy `pass.lock` after upgrade:** every `planning-claim acquire` refuses with the operator-inspection message until the file is removed.
- **Hidden mode, missing remote tracker, non-GitHub origin for Issue Buddy:** unchanged stops.

## Acceptance criteria

- [ ] **Different issues:** two Issue Buddy `--issue` passes for different issues against one repository fixture, with overlapping lifetimes including overlapping `pass-collect` read phases and readiness reads, both reach `published`. Verified by a new test in `test/issue-buddy-pass.test.mjs`.
- [ ] **Same issue, single mode:** a second pass for the same issue fails with `ISSUE_CLAIMED`, carrying the holder, and has no side effects outside its own pass record. Verified by a new test in `test/issue-buddy.test.mjs`.
- [ ] **Same issue, batch mode:** a batch pass whose selected candidate is claimed elsewhere records `issue-in-progress` and judges the next eligible candidate. Verified by a new test.
- [ ] **Cache and journal:** concurrent `verdict-record` calls for different issues keep both records, and a pending journal survives another pass's write without `UNSAFE_RUNTIME_STATE`. Verified by new tests.
- [ ] **Claim scope:** a pass never authorizes recovery for, writes a stale-attempt record for, or deletes trusted text of an issue claimed by another pass. Verified by new tests.
- [ ] **Mutex scope:** no `fetch`, `ls-remote` or tracker operation runs while the mutation mutex is held, and contention shorter than 10 s does not produce `LOCKED`. Verified by a test with an instrumented runner.
- [ ] **Claim primitive:** create-only behavior, token-matched release, `list` without token, stale flag and liveness, `prune` only with an orphan proof or confirmed staleness, and refusal while a legacy `pass.lock` exists. Verified by `test/planning-claim.test.mjs`.
- [ ] **Key derivation:** `planning-claim key` yields the same key for the same GitHub issue on the Issue Buddy, autopilot and `plan-issue` paths, and distinct keys for different repositories and external targets. Verified by a behavioral test in `test/planning-claim.test.mjs`.
- [ ] **Base start:** with a dirty primary checkout on a non-base branch, an Issue Buddy pass plans from `origin/<base>` in an `issue-planning` worktree, and the primary checkout's working tree and index stay byte-identical. Verified by a git-level test in `test/issue-buddy-git.test.mjs`.
- [ ] **Base resolution without configuration:** in a fixture repository with only a `main` branch and no `delivery.baseBranch`, an Issue Buddy pass and the `plan-issue` examination start from the fetched `origin/main`, through `origin/HEAD` and through the `origin/main` fallback. With `delivery.baseBranch` configured, the configured branch wins. No source, contract or doc names `develop` as a default. Verified by a git-level test in `test/issue-buddy-git.test.mjs` and a contract test.
- [ ] **Autopilot claim lifetime:** `run-init` claims before creating the ledger and creates none on `ISSUE_CLAIMED`. `run-close` releases in both outcomes, and the token appears neither in the rendered appendix nor in any helper output. Verified by tests in `test/autopilot-core.test.mjs`.
- [ ] **Autopilot existing-PR stop:** no continuation path remains in `autopilot-issue-source.md`, and `open-pull-request` maps to a `no-pull-request` close. Verified by `test/workflow-contracts.test.mjs`.
- [ ] **Execution root line:** `unattended-planning.md` defines and validates `Execution root:`. Verified by `test/unattended-planning-contract.test.mjs`.
- [ ] **`plan-issue` contract:** `plan-issue` documents claiming at the start of Phase 2, stopping or skipping on a held claim, read-only examination at the fetched OID, and release on every exit. Verified by `test/workflow-contracts.test.mjs`.
- [ ] **Autopilot end state:** a fresh issue still ends in a draft pull request on `<prefix>/plan/issue-<N>`. Verified by the existing autopilot contract tests passing.
- [ ] **Docs and ADR:** the docs and the new ADR describe claims, parallel planning, the base-tip start, the existing-PR stop, claim cleanup and the `issue-in-progress` vs. lifecycle-label difference. No doc still states the primary-checkout or whole-pass-lock requirement for issue planning.
- [ ] **Completion condition:** `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` all pass on the implementation branch.

## Validation plan

- Unit tests: claim primitive and key, prune proofs, pass records, four-step collect, claim-aware selection, claim-scoped recovery, accounting and trusted text, merge-only cache, per-issue journal, bounded mutex retry, worktree purpose, autopilot claim lifetime.
- Git-level tests: `issue-planning` worktree at `collect.baseOid`, primary checkout unchanged, publication from the worktree.
- Contract tests: updated step labels in `issue-buddy.md`, `unattended-planning.md`, `autopilot-issue-source.md`, `plan-pr-continuation.md`, `autopilot.md`, `plan-issue.md`, `cleanup.md` and the helper call shape.
- Full CI order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- Manual, because helper tests cannot cover a whole autopilot run from a linked worktree:
  - Start two autopilot runs for two different open issues from two T3 worktrees at the same time. Both must end in draft PRs, and the primary checkout must stay untouched.
  - While one is still running, start a third run for the same issue. It must stop with `ISSUE_CLAIMED`.
  - After the first run has finished, start another run for that issue. It must stop with `open-pull-request`.

## Assumptions and open points

- **Assumption: the cache is not held across calls.** Each helper call loads `verdicts.json` fresh, and no pass keeps a cache snapshot across calls. The implementation verifies this in `issue-buddy-core.mjs` (`loadCache`/`saveCache`, `:708`, `:723`) before choosing merge-only patches over sharding.
- **Scope: claims are machine-local.** Cross-machine exclusion keeps relying on the existing remote guards. A remote claim, such as a label or comment marker, is out of scope.
- **Scope: other workflows are unchanged.** `effective-flow plan` with a free-text requirement and the implementing workflows keep their own worktree behavior. Only issue planning (Issue Buddy, issue-sourced autopilot, `plan-issue`) changes.
- **Consequence of the existing-PR stop:** a plan PR published by a batch Issue Buddy pass is no longer picked up by autopilot. It is implemented by hand from its plan.

## Plan review

**Result:** Approved

### Summary

| Area | Critical | Important | Note |
|---|---:|---:|---:|
| Architecture | 1 | 2 | 3 |
| Security | 0 | 1 | 0 |
| Data protection | 0 | 0 | 0 |
| Error cases | 2 | 3 | 1 |
| Testability | 0 | 1 | 1 |
| Scope | 0 | 3 | 2 |
| Maintainability | 0 | 0 | 1 |

### Findings

#### Round 1 (internal plan review)

- **Architecture, Critical, incorporated.** `pass-collect` holds the mutex across fetch and forge reads (`issue-buddy-core.mjs:1841-1853`). Adjustment: collect split and mutex audit.
- **Error cases, Important, incorporated.** The whole-cache journal digest conflicts with merge-only writes. Adjustment: per-issue, per-attempt digest.
- **Error cases, Important, incorporated.** Recovery and stale accounting covered unclaimed candidates. Adjustment: both restricted to claimed issues.
- **Architecture, Important, incorporated.** The draft loosened the primary-root guard. Adjustment: `cwd` stays primary, and a validated `sourceRoot` is used.
- **Scope, Important, incorporated.** A detached planning worktree did not fit the lifecycle record. Adjustment: purpose `issue-planning`.
- **Scope, Important, decided.** The `plan-issue` claim window was unclear. Decision: claim from the start of planning.
- **Testability, Important, incorporated.** Nothing proved key equality across workflows. Adjustment: one key derivation with a behavioral test.
- **Scope, Note, decided.** The autopilot guarantee after planning was unclear. Decision: claim until run end, and stop on any existing open PR.
- **Architecture, Note, incorporated.** Build the claim on the presence-marker pattern.

#### Round 2 (deep interactive plan review)

- **Error cases, Critical, decided.** The claim was taken before a run ID existed and broke "preflight writes nothing" (`autopilot-core.mjs:737`, `autopilot.md:118`). The token could leak into the appendix or the envelope. Decision: claim inside `run-init`; the token stays helper-internal; adoption is verified against the open ledger.
- **Error cases, Critical, incorporated.** `clearTrusted` deleted every pass's trusted text (`issue-buddy-core.mjs:1058-1074`). Adjustment: clear only claimed issues.
- **Architecture, Important, incorporated.** "No child process under the mutex" was infeasible, because the guard runs local `git` (`:441-458`). Adjustment: the rule covers network and forge calls.
- **Security, Important, incorporated.** Cleanup could not release a token-protected claim. Adjustment: `prune` with an orphan proof or confirmed staleness plus an identity re-check; orphaned pass records are pruned too.
- **Architecture, Important, decided.** The location of the restored autopilot plan was undefined (`plan-pr-continuation.md:157-160`). Decision: a run-owned delivery worktree on the plan head branch.
- **Error cases, Important, incorporated.** The plan writer had no root in the envelope (`unattended-planning.md` step 4). Adjustment: an `Execution root:` control line.
- **Scope, Important, decided.** Preserved plans would be lost with the worktree (`issue-buddy.md:144-158`). Decision: keep the worktree, read leftovers from worktree records, and release the claim.
- **Error cases, Important, incorporated.** The order of claim, recovery and re-check was contradictory (`:1137-1206`). Adjustment: the four-step collect.
- **Scope, Important, decided.** `plan-issue` had no key source for external targets and a worktree risk. Decision: key from `repository-resolve` or the tracker-target id; read-only examination without a worktree.
- **Architecture, Note, incorporated.** Reuse the `base-validation` worktree pattern instead of a detached kind.
- **Architecture, Note, incorporated.** Create the planning worktree after collect at `collect.baseOid`, and leave `plan-publication-core.mjs` unchanged.
- **Error cases, Note, incorporated.** The legacy-lock check moves into `planning-claim acquire`.
- **Scope, Note, incorporated.** The 2 h stale flag is complemented by liveness, so long live runs are not pruned.
- **Testability, Note, incorporated.** The linked-worktree autopilot criterion was untestable at helper level. Adjustment: contract tests plus the manual check.
- **Maintainability, Note, incorporated.** Document `issue-in-progress` vs. the lifecycle label.

## Open points

- No open points.
