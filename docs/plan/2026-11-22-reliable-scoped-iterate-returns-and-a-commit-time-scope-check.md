# Reliable scoped iterate returns and a commit-time scope check

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)

## Requirement

A merge-gate run on PR #704 (2026-11-21, round 1) stopped with `scope-line-missing`. The run had
already pushed `iterate`'s two repair commits and resolved both review threads. The diagnosis is in
the local report
`.effective-flow/investigation/investigation-2026-11-22-merge-gate-pr-704-stopped-with-scope-line-missing.md`.

**What went wrong:**

- The delegated `effective-flow iterate` run received an `Authorized scope:` line. It returned
  without the mandatory `Returned commits:` and `Scope expansion:` lines.
- Those two lines are specified only in `src/shared/delegated-scope-return.md`. `iterate` reaches
  that fragment through a single lazy pointer at the end of "Returned outcome record"
  (`src/tools/iterate.md:227-230`).
- The steps the worker follows while composing its return never name the lines: Phase 5 step 3,
  Phase 6 step 4 (`iterate.md:1043`) and Rules.
- The worker read the pointer and did not follow it.

**A second, more serious gap:** the same worker skipped the per-commit `scope-check`.

- It ran the check once, with a 4-path scope it built itself instead of the line's 92-path scope.
- It committed the second item (`5da358b2`) with no check at all.
- The per-commit check is a single prose sentence at the end of Commit integrity step 1
  (`iterate.md:~899`).
- `commit create` (`src/scripts/effective-flow-state-commit-core.mjs`) has no notion of a scope,
  so nothing enforces the check.

**Goal:**

- A dispatched scoped `iterate` round's missing return lines are recovered by one targeted
  merge-gate request before the run stops. That is measured by the new eval scenario.
- An inline round has no spawn to continue, so it keeps today's behavior.
- The eager Phase 6 sentence is an additional nudge. Its effect is confirmed only in the field: the
  same worker also dropped `DONE`, which Phase 6 already states inline.
- Once a scoped run has bound its scope in Phase 0, every scope check of that run reads the bound
  scope by `runId`. That covers the pre-delegation checks and `commit create`. The worker never
  supplies the scope by value again.
- A skipped bind is caught at the first `scope-check`, which refuses an unknown `runId`.
- What stays out of reach: a raw `git commit` that bypasses `commit create`. Merge-gate's existing
  `post-check` stays the guarantee for that case.

**The user decided in this planning run:**

- Name the obligation eagerly in Phase 6, and keep the fragment lazy.
- Enforce the scope mechanically, bound in Phase 0 by `runId` rather than passed by the caller.
- Keep the spawn tier (`standard`) unchanged.
- Allow exactly one targeted line request before `scope-line-missing`.
- Add a merge-gate eval scenario for that request.
- On a bind failure other than a shape refusal, return a new Phase-0 reason,
  `ABORT: scope bind refused: <CODE>`.
- Handle scope refusals by cause instead of treating every refusal as a path violation.
- Remove the record through a guarded `scope-release` operation in Phase 6.

## Outcome checkpoint

**Primary source:** investigation report
`.effective-flow/investigation/investigation-2026-11-22-merge-gate-pr-704-stopped-with-scope-line-missing.md`
(local, `sebastian-software/effective-flow`, `develop`)
**Original outcome:** a merge-gate bot or CI repair round that delegates to `iterate` with
`Authorized scope:` ends with a parseable scoped return. Once the scope is bound, every scope check
and every `commit create` of that run refuses paths outside it, and merge-gate's `post-check`
remains the backstop. A missing line can still stop the run, failing closed, but only after one
targeted request.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** none yet
**Continuation decision:** none

## Architecture decisions

### Return lines

- **Obligation at the decision point, format in its owner.**
  - Phase 6 step 4 of `iterate.md` gains one eager sentence. On a run whose Phase 0 recorded an
    `Authorized scope:` line, the final `DONE` return states `Returned commits:` and
    `Scope expansion:` per `delegated-scope-return`.
  - `delegated-scope-return.md` stays the only owner of the format and stays lazy. This follows
    AGENTS.md "Writing prompt text" points 2–3 and the test "iterate keeps its scope parse and
    checks eager and defers only the return format".
  - A whole-run `ABORT` from Phases 1–5 never passes Phase 6. That case is left to the lazy pointer
    plus merge-gate's line request, rather than a second eager copy.
  - Rejected: making the fragment eager. Every unscoped run would pay for it, and it would break
    that test.
  - Rejected: restating the lines in the merge-gate envelope. That would be a second copy of the
    contract.

### Scope binding and enforcement

- **Scope bound once, in Phase 0.**
  - Right after run identity (Phase 0 step 11, `iterate.md:548`), a scoped run calls a new
    operation `node <skill-root>/scripts/repair-attempt.mjs scope-bind`. Its closed input keys are
    `stateRoot` (the verified `RUNTIME_STATE_ROOT`, validated as the main checkout with
    `resolveRuntimeRoot`), `runId`, and `authorizedScope` (the `Authorized scope:` JSON verbatim).
  - The operation validates `authorizedScope` with the same rules Phase 0 states today: `version`
    `1`, the `scope` shape through `normalizeScope`, and two distinct identifiers of the stated
    form.
  - It creates the parent chain with `ensureGuardedDirectory` on `.effective-flow/`, `runs/` and
    `runs/<runId>/`, as `diff-baseline-core.mjs:~578-583` does. It then writes
    `<RUNTIME_STATE_ROOT>/.effective-flow/runs/<runId>/iterate-scope.json` once, with the no-clobber
    primitive of `runtime-state-guard.mjs` (`createNoClobber`, a named `tempPrefix`). This follows
    the existing per-run convention (`runs/<RUN_ID>/`, `shared/diff-baseline.md:40`).
  - An identical re-bind is idempotent. A different scope under the same `runId` is refused, so a
    bound scope can never be widened mid-run.
  - The record is versioned: `{version: 1, runId, scope, freeText, correction}`, and its `runId`
    must match the directory name.
  - `scope-bind` refuses a record whose serialized size exceeds the reader's bound
    (`SCOPE_RECORD_MAX_BYTES`, one shared constant), so a bound record always reads back.
  - `runId` must match `^iterate-[0-9a-f]{16,}$` (the form `iterate.md:548` mints) and stay within
    the 128-character owner-string limit of `commit create` (`effective-flow-state-core.mjs:~264`)
    before it is used in a path.
  - Errors are reported as follows:
    - A shape refusal maps to the existing `ABORT: unparseable authorized scope` before Phase 1,
      turning the prose shape check into a mechanical one.
    - Any other refusal, such as a runtime-guard refusal or a conflicting re-bind, returns the new
      Phase-0 reason `ABORT: scope bind refused: <CODE>`.
    - `merge-gate-delegation-contract.md` (~352-354) adds that reason to its list of Phase-0
      refusals, so merge-gate handles it like `unparseable …`: `record` with `returned: []` and
      `scopeExpansion: []`, and no line request. The maintainer sees the actual code.
  - The operation lives in `repair-attempt`, the owner of the scope shape. Its stdin bound is
    4 MiB (`repair-attempt-core.mjs:161`), so a large PR fits.
- **Record reader rules, shared by all readers.**
  - It reads `<stateRoot>/.effective-flow/runs/<runId>/iterate-scope.json` with a plain filesystem
    check, which spawns no git process.
  - It checks the directory chain `.effective-flow/runs/<runId>/` with `assertDirectoryChain`, which
    refuses symlinked directories. It refuses a symlinked or non-regular file, bounds the read at
    `SCOPE_RECORD_MAX_BYTES`, and validates the schema and the `runId` match.
  - It returns "absent" only for a missing file. Anything else is `scope-record-invalid`.
- **`commit create` enforces the bound scope by `owner.runId`.**
  - When the record for `owner.runId` exists below `cwd` (the `RUNTIME_STATE_ROOT` that
    `commit create` already takes), the helper runs the existing path logic (`scopeCheck`,
    `repair-attempt-core.mjs:560`) on the listed paths.
  - All scope git reads run in `worktree`, not in `cwd`.
  - The check runs between `requireHookBase` and the first `hookTrust`
    (`effective-flow-state-commit-core.mjs:~1391-1395`; re-verify after updating `develop`). So a
    `HOOKS_UNTRUSTED` outcome implies the scope already passed, and the prose fallback
    (`src/shared/iterate-commit-fallback.md`) commits only checked paths.
  - The helper first resolves the `HEAD` OID in `worktree`. It passes that OID as `scopeCheck`'s
    `tip` and as the revision of the status read, never symbolic `HEAD`.
  - Under the lock, before `git add`, it compares the `before` HEAD it already reads
    (`effective-flow-state-commit-core.mjs:~1148`) with that OID. A difference is
    `SCOPE_REFUSED` with reason `head-moved`, with nothing staged. This closes the window between
    the pre-lock check and the commit.
  - Any `outside` or `undetermined` path is refused with the new outcome code `SCOPE_REFUSED`,
    reason `outside`, carrying `outside` and `undetermined`. Nothing is locked, staged or committed.
  - A malformed record file fails closed with `SCOPE_REFUSED` and reason `scope-record-invalid`,
    never an unscoped commit.
  - No caller-supplied `scope` field exists, so the `commit create` stdin size is unchanged.
- **Refusals are handled by cause in `iterate`.**
  - **Reason `outside`** (and a `scope-check` `expansion`): the existing "Authorized scope"
    refusal. Record exactly the reported `outside` and `undetermined` paths as the item's scope
    expansion, leave the paths uncommitted, and return the item `unassessed`.
  - **Reason `head-moved`:** re-inspect and retry the commit once. If it recurs, return the item
    `unassessed` and declare no scope expansion.
  - **Reason `scope-read-timeout`:** return the item `unassessed` and declare no scope expansion.
  - **Reason `scope-record-missing` or `scope-record-invalid`,** from `commit create` or
    `scope-check`: end the whole run with `ABORT: scope record unavailable`. This is an `ABORT`
    after Phase 0, so it carries both return lines.
  - The rule "after a failed call, the checked paths" (`iterate.md:~803`,
    `delegated-scope-return.md:~24-26`) is narrowed to a call that returned no envelope at all. A
    well-formed refusal declares only what it reports.
- **Change status is derived, never supplied.**
  - `expect: null` means `D`. Otherwise the helper reads `HEAD` in `worktree`: an absent path is
    `A`, a present one is `M`.
  - A failed or unreadable status read is `undetermined`, which gives `SCOPE_REFUSED`. It never
    falls back to `A`, which would fail open for test-glob paths.
  - A rename is checked as its two listed sides, a `D` plus an `A`, which is exactly how the `R`
    branch of `sidesOf` treats it (`repair-attempt-core.mjs:~532-540`).
- **Read budget and timeout arithmetic.**
  - The `HEAD` resolution, the status read and `scopeCheck`'s test-path reads share
    `SCOPE_READ_BUDGET_MS = 10000`.
  - Each call gets the remaining budget as `timeoutMs` through a wrapper that tracks it. A read
    that times out or is refused because the budget is spent maps to `SCOPE_REFUSED` with reason
    `scope-read-timeout`. Other read failures, such as `createGitReads`' `tree-unreadable`-style
    codes, are `undetermined`.
  - The existing budget already uses the 360000 ms that iterate gives the commit call. The new
    arithmetic in the header lists every term:
    - 300 s `git commit`;
    - 20 s filters;
    - the 30 s lock wait plus its final acquire attempt;
    - the 10 s lock-guard wait for acquire and for release;
    - the unbounded git reads (`requireWorktree`, `hookScope` listings, verify) at their measured
      worst case;
    - `SCOPE_READ_BUDGET_MS`.
  - `iterate.md` Commit integrity step 2 raises the explicit Bash timeout from 360000 ms to
    420000 ms (the Claude Bash maximum is 600000 ms) and states the same sum.
    `DEFAULT_WAIT_SECONDS` stays unchanged, because other locks share it.
- **`scope-check` reads the bound scope in scoped runs.**
  - `repair-attempt scope-check` accepts `runId` plus `stateRoot` as the alternative to `scope`,
    resolving the same record. Exactly one form is required, and `cwd` stays the execution root for
    git reads.
  - `stateRoot` is validated with `resolveRuntimeRoot` as the main checkout of `cwd`'s repository,
    so a worker cannot point it at a directory holding a hand-written record. Spawning git is fine
    here, unlike on `commit create`'s no-record path.
  - A `runId` without a record is a refusal (`scope-record-missing`), never an unscoped pass. This
    catches a skipped bind at the first check.
  - In a scoped run, every scope check uses `runId`:
    - the "Authorized scope" paragraph's general call shape (`iterate.md:796-805`);
    - Phase 3 step 1's pre-delegation check;
    - step 2's dynamic-path check (`iterate.md:~838-840`);
    - the Phase 4 correction items.
  - That removes the self-built-scope path the investigation found.
- **Coupling.**
  - `effective-flow-state-commit-core.mjs` imports `scopeCheck`, `normalizeScope` and the record
    reader from `repair-attempt-core.mjs`. That module imports only `node:process` and
    `runtime-state-guard.mjs`, so no cycle arises.
  - The header of `repair-attempt-core.mjs` is updated: lines 5-6, since `createGitReads` then has
    a second creator, and lines 10-11, since the helper is then no longer stateless.
    `docs/developer-guide/build-system.md:~970-978` ("The core is pure", operation list) changes
    accordingly.
  - Rejected: extracting a separate scope module. That would add `RUNTIME_SCRIPT_FILES`,
    distribution and contract-test list changes for no behavioral gain.
- **Record lifecycle: a `scope-release` operation.**
  - Phase 6 calls `node <skill-root>/scripts/repair-attempt.mjs scope-release` with `stateRoot` and
    `runId`, before the worktree-record self-check and next to the wisdom-file deletion.
  - The operation uses `guardedUnlink` on the record and `guardedRmdir` on `runs/<runId>/` if it is
    then empty (`runtime-state-guard.mjs:~670-692`). An already absent record is success.
  - Misuse risk: a mid-run release would turn the run's later commits back into unscoped commits.
    The contract states that `scope-release` is called only in Phase 6, and nowhere else. A
    premature release is still caught at the next `scope-check`, which then returns
    `scope-record-missing` and so `ABORT: scope record unavailable`. Merge-gate's `post-check`
    remains the backstop for a commit made between the release and that check. This residual is
    accepted with the user's choice of this option.
  - A record stays behind after every whole-run `ABORT` after Phase 0, every relayed
    `BLOCKED-USER`, and every crash, because Phase 6 is the only release point
    (`iterate.md:~1025-1027`).
  - For a `BLOCKED-USER` this is intended: the dispatch consuming the answer is a new run with a
    new `runId`, so it binds afresh. Every leftover is inert, because its random `runId` is never
    reused. It is not covered by `effective-flow cleanup` (see Assumptions).

### Line request

- **One targeted line request, a bounded exception.**
  - The trigger: in `merge-gate-delegation-contract.md`, a final return with a keyword (`DONE`, or
    an `ABORT` after Phase 0) that lacks a parseable `Scope expansion:` or `Returned commits:` line.
  - That return gets exactly one more continuation of the same spawn. The continuation carries one
    literal sentence fixed in the contract, naming only the two labels and `delegated-scope-return`.
    It carries no control keyword, no `Item:` line or item text, and no copy of the format.
  - The contract states this as the single, bounded exception to its rule that the return protocol
    is "never an instruction to the delegated run" (`merge-gate-delegation-contract.md:283-284`).
  - The existing keyword-less resume (`:387-399`) keeps its own rule. It runs first, and each
    dispatch has at most one of each. A CI repair and a reviewer dispatch in the same gate round
    count separately.
  - Like the resume, the line request does not advance the round counter and mints no new
    `dispatch` (contract `:~394`).
  - An inline round gets no line request, matching the resume rule (`:388-389`).
  - A Phase-0 refusal, including the new `scope bind refused`, and a `BLOCKED-USER` return get no
    line request.
- **What the answer may contribute.**
  - **`Scope expansion:`** counts as carried whenever its label is present in the preceding final
    return, whether it parses or not. A present but unparseable line keeps `scopeLineMissing: true`
    and is never taken from the answer. Only an absent `Scope expansion:` label is taken from the
    answer, so a declared expansion can never be withdrawn.
  - **`Returned commits:`** is taken from the answer whenever the preceding return lacked a
    parseable one, because its worst case is an `uncertain` round.
  - **Everything else stays with the preceding final return:** the keyword, the outcome record and
    a `Review-fix validation result:` line. Nothing else in the answer counts.
  - `merge-gate-review-fix-validation.md` (~55-59) reads that result line "where its
    `Returned commits:` line is read". That wording changes to "from the dispatch's final return,
    after any keyword-less resume, never from a line-request answer".
  - Still missing or unparseable afterwards, or the spawn cannot be continued: today's receiver
    rule applies unchanged (`scopeLineMissing: true` → `scope-line-missing`; no `Returned commits:`
    → `returned: []`).
- **How `iterate` answers.**
  - This is stated once, in `delegated-scope-return.md`: only the requested lines, then the same
    keyword again. No `Review-fix validation result:` line, and no edit, commit, push, reply or
    resolve.
  - That fragment's sentence "the caller ends the run on a missing `Scope expansion:` line"
    (pinned at `test/repair-attempt-contract.test.mjs:~480`) becomes "… after one line request".
  - The identifier-to-SHA mapping comes from the run's own `commit create` results in its context.
    Where the worktree still exists, the SHAs are checked with a read-only
    `git log <head before the run>..HEAD`. A SHA the run did not create is never named.
  - If the run cannot state the mapping with certainty, it omits `Returned commits:`, which the
    receiver reads as `returned: []`. It still states `Scope expansion:`.
  - The wisdom file may already be deleted at that point, so it is not the source.
  - The `when:` of iterate's lazy pointer to `delegated-scope-return` (`iterate.md:~229`) is
    extended to cover answering a merge-gate line request.

### Spawn tier

The spawn site `merge-gate-delegation-contract/iterate-delegation` stays `standard`
(`src/shared/model-tiers.md:134`).


## Affected files

Line references were taken from local `develop`, which is 7 commits behind `origin/develop`.
Re-verify every citation on the delivery base before editing.

| File | Description |
|---|---|
| `src/tools/iterate.md` | **Phase 0:** a `scope-bind` call after step 11, with `ABORT: unparseable authorized scope` for a shape refusal and `ABORT: scope bind refused: <CODE>` otherwise. **"Authorized scope" paragraph (796-805):** the general call shape uses `runId` + `stateRoot`, the "after a failed call" rule is narrowed, and its "Commit integrity step 1" citation is updated. **Step 2 dynamic-path check, Phase 3 step 1, Phase 4 correction items:** `scope-check` by `runId`. **Commit integrity:** step 1's trailing scope-check sentence is replaced by a statement that `commit create` enforces the bound scope. The refusal handling by cause from "Refusals are handled by cause", including `ABORT: scope record unavailable`. Step 2's Bash timeout goes to 420000 ms with the stated sum. **Phase 6:** step 4's eager return-line sentence, and the `scope-release` call. **Lazy pointer `when:` (~229):** extended to the line-request answer. Raise `contextBudget` per the build report. |
| `src/shared/delegated-scope-return.md` | The line-request answer rule, with its SHA source, the omit-if-uncertain rule and no `Review-fix validation result:` line. The narrowed "after a failed call" rule. The "ends the run on a missing `Scope expansion:` line" sentence becomes "… after one line request". |
| `src/shared/merge-gate-review-fix-validation.md` | ~55-59: the result line is read from the dispatch's final return, after any keyword-less resume, never from a line-request answer. |
| `test/iterate-quick-validation-contract.test.mjs` | ~467: follows that rewording. |
| `src/shared/iterate-commit-fallback.md` | One clause: the fallback runs only after `commit create` returned `HOOKS_UNTRUSTED`, so its paths have passed the scope check. |
| `src/shared/merge-gate-delegation-contract.md` | **Receiver rule (~340-368):** the targeted line request, the literal sentence, what the answer may contribute (the label-present rule for `Scope expansion:`), and the fallback. **Phase-0 refusal list (~352-354):** `scope bind refused`. **Principle (~283-284):** the bounded exception. **Resume rule (~387-399):** order relative to the line request per dispatch, no round advance and no new dispatch, and none for an inline round. |
| `src/shared/merge-gate-delegated-run.md` | "Repair checkpoints" step 3: record after the line request has been answered or refused, never on the interim return. |
| `src/shared/merge-gate-repair-report.md` | Line 13: `scope-line-missing` means the lines were still missing after the line request. |
| `src/shared/setup-allowlist.md` | Lines ~20-21: add the scope refusal to what `commit create` refuses. Pinned by `test/setup-allowlist-contract.test.mjs:~87`. |
| `src/scripts/repair-attempt-core.mjs`, `src/scripts/repair-attempt.mjs` | **New:** `scope-bind` (`stateRoot`, `runId`, `authorizedScope`), `scope-release`, the shared record reader, `SCOPE_RECORD_MAX_BYTES`, and closed input keys for every new form. **Changed:** `scope-check` accepts `runId` + `stateRoot` (validated) or `scope`. **Header (5-6, 10-11):** updated. |
| `src/scripts/effective-flow-state-commit-core.mjs` | Scope enforcement between `requireHookBase` and `hookTrust`, from the bound record. Also: `HEAD` resolved to an OID first and used as `tip` and status revision, reads in `worktree`, derived change status, `SCOPE_READ_BUDGET_MS` through a budget-tracking wrapper, the `before`-equals-checked-OID check before `git add`, and the `SCOPE_REFUSED` outcome with its reasons. Header comment with the full time arithmetic. |
| `src/scripts/effective-flow-state-core.mjs` | `OUTCOME_CODES` gains `SCOPE_REFUSED`. The `commit create` key list is unchanged, since there is no new input key. |
| `src/scripts/effective-flow-state.mjs` | Per-outcome message map: the `SCOPE_REFUSED` entry. |
| `test/repair-attempt-core.test.mjs` | `scope-bind` and `scope-check`-by-`runId` cases (see Validation plan). |
| `test/effective-flow-state-commit.test.mjs` | Cases listed under Validation plan. |
| `test/effective-flow-state.test.mjs` | The `OUTCOME_CODES` `deepEqual`. |
| `test/repair-attempt-contract.test.mjs` | **Update:** ":~204-216" (step 2 and `ordered(... 'Run the scope check', 'before commit create' ...)`) and "the gate states its side of a missing or unparseable return line" (~464). **New assertions:** listed under Acceptance criteria. **Keep:** "iterate keeps its scope parse and checks eager and defers only the return format" (~321-345). |
| `test/workflow-contracts.test.mjs` | Assertions of the "never an instruction to the delegated run" principle (local ~17846 and ~18785-18790; on `origin/develop` ~18038 and ~18977): admit exactly the bounded line request. |
| `test/setup-allowlist-contract.test.mjs` | The new refusal in the list. |
| `docs/developer-guide/build-system.md` | **`commit create` paragraph (~1331-1345):** the scope check from the bound record, `SCOPE_REFUSED` and the read budget. **`repair-attempt` paragraph (~970-978):** `scope-bind` and the core no longer being pure. |
| `docs/developer-guide/configuration.md` | The `.effective-flow/` contents list (~24-31): `runs/<runId>/iterate-scope.json`. |
| `evals/merge-gate/_scaffold/iterate-echo.md`, `evals/merge-gate/_scaffold/iterate-trace.mjs` | An echo variant whose first return omits both lines. The echo pipes the continuation message to a new `iterate-trace.mjs --line-request` mode, which records the received message and prints the lines. |
| `evals/merge-gate/scenarios/<new scenario>.md`, `evals/merge-gate/fixtures/<new scenario>.json`, `evals/merge-gate/scenario-registry.mjs`, `evals/merge-gate/_scaffold/configured-reviewer-scenario.mjs`, `evals/merge-gate/_scaffold/evaluate.mjs` | The scenario, its fixture and registry entry. Its binding (`scenarioSetup`, `overlayApplies`, `requiresIterateTrace`) goes in `configured-reviewer-scenario.mjs`, not `suite.config.mjs`. The evaluator asserts exactly one line request carrying exactly the literal sentence, and that the run records the round instead of stopping. |
| `evals/merge-gate/README.md` | The receiver sequence (~180-188) with the line request. |
| `test/merge-gate-eval.test.mjs`, `test/eval-fixture-fidelity.test.mjs`, `test/merge-gate-eval-repair.test.mjs` | Scenario parity and fidelity of the new echo variant. Existing assertions on the two-line echo stay. |

## Implementation details

### Approach

0. **Base.** Work from current `origin/develop`, the delivery base, and re-verify the line
   citations of this plan there.
1. **Record and `scope-check` (TDD).**
   - Write the failing cases in `test/repair-attempt-core.test.mjs` first.
   - Then implement `scope-bind`:
     - guarded parent chain and no-clobber write;
     - idempotent identical re-bind, conflicting re-bind refused;
     - `runId` pattern and length cap;
     - `SCOPE_RECORD_MAX_BYTES`.
   - Then the shared reader rules and `scope-release`.
   - Then `scope-check` by `runId` + validated `stateRoot`, with `scope-record-missing`.
2. **`commit create` enforcement (TDD).**
   - Write the failing cases in `test/effective-flow-state-commit.test.mjs` first.
   - Then add:
     - the lookup by `owner.runId` below `cwd`, with git reads in `worktree`;
     - the `HEAD` OID resolved first, then the derived status with unreadable treated as
       `undetermined`;
     - `SCOPE_READ_BUDGET_MS` through the budget wrapper, and the full time arithmetic;
     - placement between `requireHookBase` and `hookTrust`;
     - the `before`-equals-checked-OID check before `git add`;
     - `SCOPE_REFUSED` with its reasons, and its message.
   - Update `test/effective-flow-state.test.mjs`.
3. **iterate.**
   - Phase 0 `scope-bind` and its two ABORT reasons.
   - Every scoped `scope-check` call shape by `runId`, and the narrowed "after a failed call" rule.
   - Commit integrity: the enforcement statement, the refusal handling by cause, and the
     420000 ms timeout with its sum.
   - The "Authorized scope" citation.
   - Phase 6 step 4: the eager return-line sentence. Phase 6: the `scope-release` call.
   - The lazy pointer `when:` extension.
   - The one clause in `iterate-commit-fallback.md`.
4. **`delegated-scope-return.md`.** The line-request answer rule.
5. **Merge-gate receiver.**
   - In `merge-gate-delegation-contract.md`:
     - the line request, its literal sentence and the bounded exception;
     - the per-dispatch order, with no round advance and no new dispatch;
     - the contribution rule, including the label-present rule;
     - the fallback;
     - no continuation for an inline round, a Phase-0 refusal or a `BLOCKED-USER`;
     - `scope bind refused` in the Phase-0 refusal list.
   - Then `merge-gate-delegated-run.md` "Repair checkpoints" step 3,
     `merge-gate-repair-report.md` and `merge-gate-review-fix-validation.md`.
6. **Contract tests.**
   - `test/repair-attempt-contract.test.mjs`, `test/workflow-contracts.test.mjs` and
     `test/iterate-quick-validation-contract.test.mjs`.
   - `src/shared/setup-allowlist.md` with `test/setup-allowlist-contract.test.mjs`.
7. **Docs.** The `build-system.md` paragraphs, `configuration.md`, and the
   `evals/merge-gate/README.md` receiver sequence.
8. **Eval scenario.** The echo variant, the scenario, its fixture, registry, binding and evaluator
   assertion, plus the parity and fidelity tests. Recording evidence is the manual step under the
   pragmatic test and release policy.
9. **Budgets and build.** Run `node build.mjs`, then set the `contextBudget` of
   `src/tools/iterate.md` from the "Always-loaded core (lines/budget)" report. `merge-gate`'s
   budget is unaffected, because its delegation contract is lazy.

### Component structure

Not relevant: Markdown contracts plus two Node.js helpers and their tests.

### State management

**New runtime file:** `<RUNTIME_STATE_ROOT>/.effective-flow/runs/<runId>/iterate-scope.json`.

- Written once, no-clobber, by `scope-bind` in Phase 0.
- Read by `commit create` and `scope-check` through the shared reader.
- Removed by `scope-release` in Phase 6.
- Private runtime data, never tracked.

**Unchanged state:**

- A `commit create` scope refusal changes no state: no lock, nothing staged. The `head-moved`
  check under the lock fails before staging.
- `repair-attempt record` input and state are unchanged. Only the moment at which merge-gate calls
  it moves behind the line request.

### API integration

Not relevant: no forge or tracker API changes.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

**Unscoped and unbound runs**

- **No `Authorized scope:` line:** no `scope-bind` and no record, so `commit create` behaves exactly
  as today, with a plain filesystem check and no extra git process. No line request is sent.
- **Scoped run that skipped `scope-bind`:** its first `scope-check` by `runId` returns
  `scope-record-missing`, and the run ends with `ABORT: scope record unavailable`. A run that also
  skips every `scope-check` and commits through `commit create` commits without a scope check.
  Merge-gate's `post-check` remains the backstop for that, as stated in the Goal.
- **`scope-bind` refused by the runtime guard, or a conflicting re-bind:**
  `ABORT: scope bind refused: <CODE>`. Merge-gate treats it as a Phase-0 refusal: no line request
  and nothing counted.
- **`scope-release` called before Phase 6:** the next `scope-check` returns
  `scope-record-missing`, which ends the run with `ABORT: scope record unavailable`. A commit made
  in between is unscoped, and `post-check` is the backstop. This residual risk is accepted.

**Binding and reading the record**

- **Second `scope-bind` with a different scope:** refused. The bound scope stays.
- **`runId` of the wrong form, or a symlinked, oversized or malformed record:** refused or
  `scope-record-invalid`, never an unscoped commit.
- **A record for another `runId`:** ignored. Lookup is by `owner.runId` only.

**`commit create` checks**

- **Status read fails:** `SCOPE_REFUSED` (`outside` with the path under `undetermined`). The item is
  refused, and that path is declared.
- **The budget runs out:** `SCOPE_REFUSED` with `scope-read-timeout`. The item is `unassessed`, and
  no expansion is declared.
- **Another writer moves `HEAD` between the check and the commit:** `SCOPE_REFUSED` with
  `head-moved`, before staging. One retry. If it recurs, the item is `unassessed` and no expansion
  is declared.
- **Large scope near `SCOPE_RECORD_MAX_BYTES`:** `scope-bind` refuses it with
  `ABORT: scope bind refused: <CODE>`, rather than binding a record that cannot be read back.
- **Rename with the source in scope and the destination outside:** refused, with the destination
  under `outside`.
- **Test path:** an added test-glob path outside the listed paths is allowed exactly when
  `scope-check` allows it. A test path the run added and then modified is allowed through
  `addedByRun`. A pre-existing modified test path outside the scope is refused.
- **Fork head (`sameRepository: false`):** the scope check runs before `HOOKS_UNTRUSTED`. The
  fallback commits only checked paths.
- **Large scope (more than 1,000 paths):** `scope-bind` takes it within its 4 MiB stdin. The
  `commit create` stdin carries no scope.

**Returns and the line request**

- **Keyword-less return whose resumed turn has a keyword but no lines:** the keyword-less resume
  runs first, then the one line request, then today's rule. There is never a third continuation per
  dispatch.
- **First return carries `Scope expansion: [X]` but no `Returned commits:`:** only
  `Returned commits:` is taken from the answer. `[X]` stays and stops the run.
- **First return carries a `Scope expansion:` label with unparseable JSON:** that line counts as
  carried. The answer never replaces it, and `scopeLineMissing: true` stops the run.
- **First return carried a `Review-fix validation result:` line:** it stays authoritative. One in
  the answer is ignored.
- **Inline round (no spawn):** no line request. Today's rule applies.
- **`BLOCKED-USER` return or Phase-0 refusal `ABORT`:** carries neither line by contract. No line
  request is sent, and `record` handling is unchanged. The record of a `BLOCKED-USER` run stays,
  inert.
- **Line-request answer that brings new commits, a different keyword, or outcome entries:** only
  the lacking lines count. A SHA outside the attributed range makes the round `uncertain`, as
  today.
- **Harness cannot continue the spawn:** today's rule applies directly (`scope-line-missing`).

## Acceptance criteria

- [ ] **`scope-bind`:**
  - It creates the missing parent chain and writes the versioned record once for a valid line. It
    accepts an identical re-bind.
  - It refuses:
    - a conflicting re-bind;
    - a malformed or over-long `runId`;
    - a record above `SCOPE_RECORD_MAX_BYTES`;
    - every invalid form that Phase 0 lists today.
  - The shared reader refuses symlinked directories and files, oversized records and
    schema-invalid records.
  - `scope-release` removes the record and the empty directory, and succeeds when the record is
    already absent.
  - `scope-check` with `runId` gives the same result as with the equivalent `scope`. It returns
    `scope-record-missing` without a record and refuses a `stateRoot` that is not the main
    checkout.
  - All of this is shown by new cases in `test/repair-attempt-core.test.mjs`.
- [ ] **`commit create` with a bound record:**
  - It returns `SCOPE_REFUSED` before the lock and before the hook trust check, with nothing
    staged, for every listed path set that `scope-check` reports as `outside` or `undetermined`.
  - It also returns `SCOPE_REFUSED` for an unreadable status, an exhausted `SCOPE_READ_BUDGET_MS`,
    and a moved `HEAD`.
  - It commits every set reported `in-scope`.
  - All of this is shown by new cases in `test/effective-flow-state-commit.test.mjs`, including a
    fork-head case that proves the scope check precedes `HOOKS_UNTRUSTED`.
- [ ] **`commit create` without a record:** every existing case in
  `test/effective-flow-state-commit.test.mjs` passes unchanged.
- [ ] **`src/tools/iterate.md`** contains each of these, asserted in
  `test/repair-attempt-contract.test.mjs`:
  - the Phase 0 `scope-bind` call with `ABORT: unparseable authorized scope` and
    `ABORT: scope bind refused: <CODE>`;
  - the refusal handling by cause, including `ABORT: scope record unavailable`;
  - the 420000 ms commit timeout;
  - the Phase 6 `scope-release` call;
  - `scope-check` by `runId` in the "Authorized scope" call shape, step 2, Phase 3 step 1 and
    Phase 4, and no remaining `"scope":<the line's scope>` call shape;
  - the `SCOPE_REFUSED` → `unassessed` mapping;
  - the Phase 6 step 4 sentence naming `Returned commits:` and `Scope expansion:`;
  - the extended lazy-pointer `when:`.
- [ ] **Line request in the contracts.**
  - `src/shared/merge-gate-delegation-contract.md` states:
    - the single per-dispatch line request with its literal sentence, its order after the
      keyword-less resume, no round advance and no new dispatch;
    - no request for an inline round, a Phase-0 refusal or a `BLOCKED-USER`;
    - the contribution rule, including that a present `Scope expansion:` label is never replaced;
    - `scope bind refused` as a Phase-0 refusal;
    - the fallback to `scope-line-missing`.
  - `src/shared/delegated-scope-return.md` states the answer rule, including omit-if-uncertain and
    no `Review-fix validation result:` line.
  - `src/shared/merge-gate-review-fix-validation.md` reads the result line never from a
    line-request answer.
  - These are asserted in `test/repair-attempt-contract.test.mjs` and
    `test/iterate-quick-validation-contract.test.mjs`. `test/workflow-contracts.test.mjs` admits
    exactly that one exception.
- [ ] **Lazy fragment unchanged:** "iterate keeps its scope parse and checks eager and defers only
  the return format" still passes. The fragment stays lazy and contains no `scope-check`.
- [ ] **Eval scenario:** the new merge-gate scenario is registered and bound in
  `configured-reviewer-scenario.mjs`. `evaluate.mjs` asserts exactly one line request with the
  literal sentence, recorded through `iterate-trace.mjs --line-request`. The scenario is covered by
  the parity and fidelity tests.
- [ ] **CI order passes:** `pnpm agent:check`, `pnpm test`, `node build.mjs` (with updated
  `contextBudget`), `pnpm test:distribution`.

## Validation plan

**Unit tests**

- `test/repair-attempt-core.test.mjs`:
  - `scope-bind`:
    - first bind with a missing parent chain, and a valid line;
    - each invalid form, a malformed and an over-long `runId`, an oversized record;
    - identical and conflicting re-bind.
  - The reader's symlinked-directory, symlinked-file, size and schema refusals.
  - `scope-release`: removes the record, and succeeds when the record is absent.
  - `scope-check` by `runId`, including `scope-record-missing` and an invalid `stateRoot`.
- `test/effective-flow-state-commit.test.mjs`:
  - in-scope commit;
  - outside path refused before the lock;
  - undetermined path refused;
  - unreadable status refused;
  - budget exhausted;
  - `head-moved`;
  - rename with one side outside;
  - test paths: pre-existing modified refused, added allowed, added-then-modified allowed;
  - fork head: scope refusal precedes `HOOKS_UNTRUSTED`;
  - malformed record;
  - no record behaves as today.
- `test/effective-flow-state.test.mjs`: outcome codes.
- The `scopeLineMissing` cases in `test/repair-attempt-core.test.mjs` stay green unchanged.

**Contract tests:** `test/repair-attempt-contract.test.mjs`, `test/workflow-contracts.test.mjs`,
`test/iterate-quick-validation-contract.test.mjs`, `test/setup-allowlist-contract.test.mjs`.

**Build guards:** `node build.mjs` for the budget, lazy-fragment shipping and eager/lazy
exclusivity guards. Then `pnpm test:distribution`.

**Behavioural evals**

- The new merge-gate scenario.
- Editing `src/tools/iterate.md` and the delegation contract creates evidence debt for
  `evals/iterate/` and `evals/merge-gate/`.
- Editing `iterate-trace.mjs` also makes the archived evidence of the configured-reviewer and
  repair scenarios stale, because it is part of their shared hashed identity.
- The seeded `repair-attempt*.mjs`, the commit core and `iterate.md` make the whole merge-gate
  suite's evidence stale anyway.
- Report all of it via `pnpm eval iterate verify` and `pnpm eval merge-gate verify`. Recording is
  the manual step under the pragmatic test and release policy.

**Field confirmation:** the next real merge-gate bot round with a scoped `iterate` delegation. That
is the only evidence for the eager Phase 6 sentence itself.

## Assumptions and open points

**Assumptions:**

- **Confirmed in the deep review:** `createNoClobber` (`runtime-state-guard.mjs:591`) exists, and
  so do `ensureGuardedDirectory`, `guardedUnlink`, `guardedRmdir` and `resolveRuntimeRoot`.
  `commit create`'s `cwd` is the main checkout. `owner.runId` is iterate's `runId`, also on the
  `HOOKS_UNTRUSTED` fallback.
- **Assumption:** the measured worst case of the existing unbounded git reads fits the 420000 ms
  sum. If it does not, the implementing run raises it as a decision instead of loosening the
  check.

**Deliberately out of scope:**

- **Raw `git commit` that bypasses `commit create`**, or a run that skips both the bind and every
  `scope-check`: no helper can intercept it. Merge-gate's `post-check` remains the guarantee, as it
  is today for foreign commits.
- **`effective-flow cleanup` for leftover `runs/<runId>/iterate-scope.json` records** (after
  whole-run `ABORT`s, relayed `BLOCKED-USER`s and crashes): they are inert, small and never reused.
  A cleanup extension can follow if they become visible.
- **The merge-gate orchestrator slips seen in the same run:**
  - a `record` call with a shortened 6-path scope;
  - a skipped read of `delegated-scope-return.md` after its own `pkill` killed the shell.

  They are not causal, and no contract change addresses an orchestrator not following an existing
  rule.
- **Raising the spawn tier:** excluded by the user's decision.

## Plan review

**Result:** Approved

### Summary

| Area | Critical | Important | Note |
|---|---:|---:|---:|
| Architecture | 0 | 5 | 1 |
| Security | 0 | 3 | 4 |
| Data protection | 0 | 0 | 0 |
| Error cases | 0 | 6 | 6 |
| Testability | 0 | 3 | 2 |
| Scope | 0 | 2 | 1 |
| Maintainability | 0 | 1 | 5 |

### Findings

Three judgment rounds (2026-11-22):

- two internal rounds;
- the second after the user's batch decisions on scope binding and the eval scenario;
- one deep interactive review with three user decisions: bind-failure reason, refusal handling by
  cause, and `scope-release`.

All findings are incorporated. None was deliberately rejected.

#### Deep interactive review (2026-11-22)

**Decided by the user**

- **Important:** bind failures were mislabelled or caused a wrong `scope-line-missing` stop.
  Decided: the new Phase-0 reason `ABORT: scope bind refused: <CODE>`, with the receiver updated.
- **Important:** refusals that are not path violations declared in-scope paths as an expansion.
  Decided: handling by cause, with `ABORT: scope record unavailable`.
- **Important:** how the record is deleted was undecided. Decided: a guarded `scope-release`
  operation. The mid-run misuse residual is accepted, with `post-check` as the backstop.

**Incorporated directly**

- **Important:** a present but unparseable `Scope expansion:` could be replaced by the answer.
  Incorporated: the label-present rule.
- **Important:** `merge-gate-review-fix-validation.md` could read the result line from the answer.
  Incorporated: added to Affected files, with its test reworded.
- **Important:** the timeout arithmetic had no headroom. Incorporated: 420000 ms, a fixed
  `SCOPE_READ_BUDGET_MS = 10000`, and every term listed.
- **Note:** `createNoClobber` needs an existing parent chain. Incorporated: `ensureGuardedDirectory`.
- **Note:** record size bound, `runId` length cap and input key name. Incorporated:
  `SCOPE_RECORD_MAX_BYTES`, the 128-character cap, `authorizedScope`.
- **Note:** `HEAD` drift and the wording of the parent check. Incorporated: OID first, compared
  before `git add`, budget wrapper.
- **Note:** reader hardening. Incorporated: `assertDirectoryChain` and validated `stateRoot`.
- **Note:** line-request bookkeeping and the pinned fragment sentence. Incorporated.
- **Note:** inline round missing from Goal, Edge cases and Acceptance criteria. Incorporated.
- **Note:** eval binding location and the literal-sentence assertion. Incorporated:
  `configured-reviewer-scenario.mjs` and the `iterate-trace.mjs --line-request` mode.
- **Note:** `workflow-contracts.test.mjs` citations. Incorporated: `origin/develop` lines added.

#### Earlier internal rounds (2026-11-22)

**Architecture**

- **Important:** the scope check had to precede the hook trust check, or the `HOOKS_UNTRUSTED`
  fallback would commit unchecked paths. Incorporated: placement between `requireHookBase` and
  `hookTrust`.
- **Important:** the line request is an exception to "never an instruction to the delegated run".
  Incorporated: stated as a bounded exception, with a literal sentence and test updates.
- **Important:** `scope-check` by `runId` could not find a record kept under `RUNTIME_STATE_ROOT`
  from a linked worktree. Incorporated: separate `stateRoot`, and git reads in `worktree`.
- **Important:** caller-supplied, optional scope. Resolved by the user's decision: Phase 0 binding
  by `runId`.
- **Note:** coupling to `repair-attempt-core.mjs`. Incorporated: header and `build-system.md`
  updates, with module extraction rejected.

**Security**

- **Important:** a skipped bind failed open silently. Incorporated: `scope-record-missing` and
  every scoped check by `runId`.
- **Important:** a bound scope could be overwritten. Incorporated: no-clobber write, with
  conflicting re-binds refused.
- **Note:** a caller-supplied per-path status would bypass the test-glob rule. Incorporated: the
  status is derived.
- **Note:** record path safety. Incorporated: `runId` pattern and reader rules.

**Error cases**

- **Important:** the `commit create` stdin limit. Resolved: no scope travels in that stdin.
- **Important:** a line-request answer could withdraw a declared expansion. Incorporated: only
  lacking lines count.
- **Important:** a failed status read failed open, and no read budget existed. Incorporated:
  `undetermined` and `SCOPE_READ_BUDGET_MS`.
- **Note:** the Phase 6 sentence misses mid-run `ABORT`s. Incorporated: left to the lazy pointer
  plus the line request.
- **Note:** the answer's SHA source. Incorporated: own results, verified, and omitted if uncertain.
- **Note:** misleading error mapping, the lazy-pointer `when:`, and per-dispatch counting.
  Incorporated.
- **Note:** the pre-lock check-to-commit window. Incorporated: `head-moved`.

**Testability**

- **Important:** missing files and tests (outcome codes, allowlist, workflow-contract assertions).
  Incorporated into Affected files.
- **Important:** the behavioural effect was unproven. Resolved by the user's decision: eval
  scenario, with the goal reworded as measurable.
- **Important:** the eval scenario was under-specified. Incorporated: full file list and the wider
  evidence debt.
- **Note:** the added-then-modified test path case. Incorporated.

**Scope**

- **Important:** the goal overstated the guarantee. Incorporated: reworded, with `post-check` as
  the backstop.
- **Important:** the self-built-scope path remained in two call shapes. Incorporated: every scoped
  check by `runId`.

**Maintainability**

- **Important:** stale headers and docs (`repair-attempt-core`, `build-system.md`,
  `configuration.md`, `setup-allowlist.md`, eval README). Incorporated.
- **Note:** wrong citations and the base 7 commits behind. Incorporated: approach step 0 and the
  re-verify note.
- **Note:** follow the `runs/<RUN_ID>/` convention. Incorporated.
- **Note:** leftover records occur on more paths than crashes. Incorporated in lifecycle and
  Assumptions.

## Open points

- No open points.
