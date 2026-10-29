# Guard and lock core for the runtime-state helper

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

This plan implements work package 2 ("Guard and lock core", stage 1) of `docs/concept/2026-10-29-runtime-state-cli.md`.

It adds a bundled runtime-state helper, `effective-flow-state.mjs`, built on a shared path guard and a lock core. The helper takes over three locks that the agent currently acquires and releases by following prose: `memory.lock`, `iterate-commit.lock`, and `apply-review-commit.lock`. It also takes over the guarded break of an apparently orphaned lock. The on-disk lock protocol stays compatible with every installed release, and the prose that replays the protocol shrinks to helper calls.

The allowlist spike (`docs/developer-guide/claude-code-allowlist-evidence.md`) fixes three constraints:

- **Command shape.** Helper calls take their JSON through a here-string, because a multi-line heredoc cannot be allowlisted. The helper is invoked through the symlinked install path the skill is loaded from.
- **No extra arguments.** An allowlisted prefix must reject any extra argument, because a rule's trailing `*` admits them.
- **Destructive operations.** These sit under their own command prefix and are never allowlisted.

The spike concluded **hook fallback**: the rule alone also approves an extra argument. It named one option: the rule alone suffices if the helper rejects extra argv itself. This package builds that argv rejection, which keeps both branches open, and work package 3 decides between them.

Out of scope here, because they belong to work package 3: the allowlist rule, the choice between rule and PreToolUse hook, and any `setup` change.

**Workflow rationale:** Feature, because this adds a new shipped runtime helper and changes the lock-handling contract of three workflows.

## Architecture decisions

- **Shared runtime-state module.** A new dependency-free module, `src/scripts/runtime-state-guard.mjs`, receives these parts of `src/scripts/diff-baseline-core.mjs`:
  - `guardTarget`
  - the directory-chain symlink check
  - the guarded directory ensure and `mkdir`
  - the atomic write (temporary file opened `O_EXCL|O_NOFOLLOW`, fsync, rename)
  - the guarded unlink
  - `resolveRuntimeRoot`
  - the `git` wrapper with `gitBaseEnv`, which strips inherited `GIT_DIR`, `GIT_WORK_TREE`, and related variables
  - `relativeToRoot`

  The module exports a shared error class, `RuntimeStateError`, and the moved functions throw it. `DiffBaselineError` becomes a subclass of it. The `instanceof` checks and `errorEnvelope` in `diff-baseline-core.mjs` test for `RuntimeStateError`, so a refusal raised by the moved guard keeps its code (`UNSAFE_TARGET`, `RUNTIME_STATE_UNSAFE`, `GIT_FAILED`, …) instead of becoming `INTERNAL_ERROR`. Each helper derives its exit code from `error.code` through its own map. `diff-baseline-core.mjs` re-exports every moved symbol it exports today (for example `gitBaseEnv`), so its tests and importers stay unchanged. The moved `git` wrapper requests `stdoutBuffer: true`, or normalises output through `asBuffer`, so it works with both `diff-baseline`'s runner and the shared `process-runner.mjs`. `diff-baseline-core.mjs` and the new helper core both import the module, so there is one guard and one root check.

  The guard order stays the one `diff-baseline` uses today:
  1. containment and the symlink chain
  2. `git ls-files -- .effective-flow/`
  3. `git check-ignore --no-index` on `.effective-flow/config.json`, then on the target

  Every predicate must pass, so the order does not change the outcome.

- **One helper CLI, built on the `plan-lint` pattern.**
  - The CLI `effective-flow-state.mjs` wraps an importable `effective-flow-state-core.mjs`. Git runs through the module's `git` wrapper with the injected `process-runner.mjs`. `main` runs only on direct invocation.
  - The operation is exactly two argv tokens from a closed set. Any other argv, including any extra token, is rejected **before** stdin is read.
  - Stdin carries exactly one JSON object, capped at 64 KiB, under a closed schema in which unknown keys are rejected.
  - Stdout carries exactly one envelope line.
- **No path comes from the model.**
  - The input names a lock by a closed enum: `memory`, `iterate-commit`, `apply-review-commit`. The core maps each name to its fixed path below `.effective-flow/`.
  - `cwd` must be the verified `RUNTIME_STATE_ROOT`. Before it calls the shared `resolveRuntimeRoot`, the helper itself checks two things: the raw `cwd` equals its `realpath`, which refuses a symlinked alias, and it contains none of `'`, `$`, backtick, backslash, or a control character. It maps the shared function's linked-worktree refusal to `INVALID_ROOT`, while `diff-baseline` keeps its own codes. The helper never uses `process.cwd()`. A caller running in a linked worktree passes the main checkout's root.
  - Worktree-run locks are not in the enum; they stay with work package 4.
- **Owner content and field ownership.** The owner is a JSON object.
  - Fields the helper generates: `token`, the UTC timestamp, `host`, and `pid: null`. The helper process exits right after it acquires the lock, so a pid would make every live lock look orphaned to older prose.
  - Fields the caller supplies:
    - `workflow` for every lock
    - `runId` for both commit locks only. The 22 memory writers have no run concept, so `memory` takes no `runId`.
    - for `iterate-commit`: `item` and `delegation`
      - `item` is the caller-supplied identifier, else the thread ID, else `item-<n>`
      - `delegation` is `<runId>/<n>`, also when the item runs inline
    - for `apply-review-commit`: `purpose` (`finding` or `final-validation`), plus `findingId` and `component` for `finding` (both optional for `final-validation`)

  `runId` is minted once per run by `iterate` (Phase 0) and `apply-review` (Phase 1). Its form is `<workflow>-<at least 16 random hex characters>`, unique across concurrent runs. Each item and finding delegation receives it. Under `merge-gate`, `iterate` mints its own.

  Every caller string must match `^[A-Za-z0-9._:/@=+-]{1,128}$`. This admits forge node IDs with `=` and `+`, which are inert inside single quotes, and never admits a single quote or a shell metacharacter.

- **On-disk protocol unchanged.**
  - Every lock is a `mkdir` directory, and the owner file name stays the same per lock: `owner.json` for `memory`, `owner` for both commit locks.
  - `apply-review-commit.lock` gains the token field it lacks today. Older prose reads the owner only for diagnostics.
  - The helper treats a lock without a token it holds as foreign, so a lock taken by older prose is never released by the helper.
  - The helper uses no `flock` and no exclusive lock file.
- **Operations and their classification.** Work package 3's allowlist rule must name the full two-token operation, never `lock *`.

  | Operation      | Kind                           | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                              |
  | -------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
  | `lock acquire` | non-destructive                | 1. Ensure `.effective-flow/` through the guarded ensure step. 2. Guard the lock directory, `mkdir` it, and record its device and inode. 3. Write the owner file exclusively. 4. Re-check device and inode before reporting success. 5. Retry for up to `waitSeconds` (an integer from 0 to 30, default 30), then return `LOCK_HELD`. 6. If the owner write fails, remove the empty directory, but only while it is still this acquisition's directory. |
  | `lock release` | non-destructive                | Removes only the lock whose owner token equals the supplied token: the owner file first, then the empty directory. Returns `NOT_OWNER` on a token mismatch and `NOT_HELD` when the lock is absent, changing nothing in either case.                                                                                                                                                                                                                    |
  | `lock inspect` | read-only                      | Returns the parsed owner, or `missing`, or `invalid` (as a byte count plus a SHA-256 digest, never verbatim text). Also returns the directory identity (device, inode, nanosecond modification time) and the list of entries.                                                                                                                                                                                                                          |
  | `lock break`   | destructive, never allowlisted | Compare-and-remove. Requires the observed token, or, for a missing or invalid owner, the observed directory identity plus, if present, the owner digest. Refuses with `BREAK_MISMATCH` before deleting anything if any observation changed or if the directory holds anything but the one known owner file. Only the orchestrator calls it, and only after the user has confirmed the break in the conversation.                                       |

- **Waiting and orphan rules.**
  - **`memory`.** Keeps today's behaviour. One `LOCK_HELD` after the bounded wait means: report the owner and block the owning mutation. The break path (`lock inspect`, then the user's confirmation, then `lock break`) is offered only for an apparent orphan as today's memory contract defines it: a missing or malformed owner, or an owner the user identifies as stale. Age alone never qualifies.
  - **`iterate-commit` and `apply-review-commit`.**
    - While the owner's `runId` equals the caller's own `runId` and the owning delegation is still active, the caller re-invokes without limit and never takes the orphan path. A delegation is a sibling item of the same run. Once the orchestrator holds that delegation's result and its lock remains, the lock counts as foreign.
    - A foreign owner is an apparent orphan only under the memory criteria: owner missing, owner `invalid`, or the user identifies it as stale. Three consecutive `LOCK_HELD` results with an unchanged owner and directory identity only trigger a report of the owner to the user, with no break suggestion. Age alone never qualifies.
    - After a confirmed break, the orchestrator re-dispatches that item's commit critical section once. The item's edits are still unstaged in the tree.
  - **Workers, for every lock, `memory` included.** A worker sub-agent never asks the user. It returns the `LOCK_HELD` diagnostics to its orchestrator. In a gated run the orchestrator asks the user. In a relayed or non-interactive run it fails closed with the diagnostics and offers no break.
- **Envelope and exit codes.**
  - Success is `{"ok":true,"operation":…,"result":…}` with exit 0.
  - `LOCK_HELD`, `NOT_OWNER`, `NOT_HELD`, and `BREAK_MISMATCH` are outcome codes with exit 4, in the shape `{"ok":false,"operation":…,"outcome":{"code":…,…}}`, distinct from `error`. `LOCK_HELD` carries the owner diagnostics and the directory identity in `outcome`. The prose branches on these four codes and does not apply the generic "non-zero exit stops the step" rule to them.
  - Error codes: `INVALID_INPUT` and `INVALID_ROOT` (exit 2); `UNSAFE_TARGET`, `RUNTIME_STATE_UNSAFE`, and `WRITE_FAILED` (exit 3); `GIT_FAILED` and `INTERNAL_ERROR` (exit 1).
- **Prose shape.** Each fragment states one call per step and branches on the returned code, in this form:

  ```text
  node <skill-root>/scripts/effective-flow-state.mjs lock acquire <<< '<json>'
  ```

  The here-string requires bash, which every supported harness's shell tool provides.
  - Delegating orchestrators (`iterate` Phase 3, `apply-review` delegation) pass the absolute helper path, `RUNTIME_STATE_ROOT`, and `runId` in the worker handoff, so a worker never resolves `<skill-root>` itself. `apply-review` Phase 7 runs at orchestrator level and calls the helper directly.
  - The memory protocol checks ownership again right before the atomic rename of `memory.json`, using `lock inspect` and comparing the token.

- **Memory content stays prose in this package.** Only the `memory.lock` acquire, release, ownership check, and break move to the helper. Reading and writing `memory.json` under the lock stays prose until work package 3.

## Affected files

| File                                                                                                                         | Description                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/runtime-state-guard.mjs`                                                                                        | New. Holds the guard, write primitives, root resolution, the `git` wrapper with `gitBaseEnv`, `relativeToRoot`, and `RuntimeStateError`.                                                                                                                               |
| `src/scripts/diff-baseline-core.mjs`                                                                                         | Imports the moved functions. `DiffBaselineError` extends `RuntimeStateError`. No behaviour change.                                                                                                                                                                     |
| `src/scripts/effective-flow-state.mjs`                                                                                       | New thin CLI: argv check, stdin cap, envelope, exit codes.                                                                                                                                                                                                             |
| `src/scripts/effective-flow-state-core.mjs`                                                                                  | New core: lock enum, owner schema and patterns, the four operations, outcome and error codes.                                                                                                                                                                          |
| `build.mjs`                                                                                                                  | Adds the three new files to `RUNTIME_SCRIPT_FILES` (29 → 32 entries). Re-measures the `CONTEXT_BUDGET_LINES` entries for every touched tool.                                                                                                                           |
| `scripts/distribution-smoke.mjs`                                                                                             | Adds the three files to its duplicate script list, plus a smoke run of `lock acquire` and `lock release` on a temporary repository in every target.                                                                                                                    |
| `src/shared/memory-state.md`                                                                                                 | The lock acquire, owner, release, ownership check, and orphan break become helper calls with outcome handling. The `memory.json` protocol stays.                                                                                                                       |
| `src/tools/iterate.md`                                                                                                       | Mints `runId` in Phase 0. "Commit integrity for parallel items": the mutex goes through the helper, with the `runId` sibling rule and the one-time re-dispatch after a confirmed break. Phase 3 hands the helper path, `RUNTIME_STATE_ROOT`, and `runId` to each item. |
| `src/tools/apply-review-commit-mechanics.md`                                                                                 | The lock section goes through the helper, with token, `runId`, and `purpose`.                                                                                                                                                                                          |
| `src/tools/apply-review.md`                                                                                                  | Mints `runId` in Phase 1. Verifies that the pointers around lines 450 and 604 still hold. The delegation handoff gains the helper path, `RUNTIME_STATE_ROOT`, and `runId`. Phase 7 calls the helper directly.                                                          |
| `docs/developer-guide/configuration.md`                                                                                      | Describes the `memory.lock` behaviour through the helper, unchanged in effect.                                                                                                                                                                                         |
| `test/runtime-state-guard.test.mjs`                                                                                          | New: the module's surface, the error class, and `GIT_DIR` stripping.                                                                                                                                                                                                   |
| `test/effective-flow-state.test.mjs`                                                                                         | New: argv, schema, patterns, the operations, outcome codes, and the CLI envelope.                                                                                                                                                                                      |
| `test/effective-flow-state-git.test.mjs`                                                                                     | New: real-Git root verification, guard refusals, missing `.effective-flow/`, the conformance cases, and the inode-reuse race.                                                                                                                                          |
| `test/memory-state-contract.test.mjs`, `test/generated-memory-state-contract.test.mjs`, `test/model-tiers-contract.test.mjs` | Update the pinned phrases to the new prose and name the invariant each one protects.                                                                                                                                                                                   |
| `docs/developer-guide/build-system.md`                                                                                       | Runtime-script count (29 → 32, correcting the stale 27), the subsystem enumeration, a new "Runtime scripts" entry, and the distribution-check paragraph.                                                                                                               |
| `docs/developer-guide/architecture.md`                                                                                       | A new subsystem section for the state helper, the shared module, and the lock contract. Adjusts the subsystem counts.                                                                                                                                                  |
| `docs/developer-guide/release-and-installation.md`                                                                           | Runtime-script count.                                                                                                                                                                                                                                                  |
| `evals/iterate/suite.config.mjs`, `evals/merge-gate/suite.config.mjs`                                                        | Seed `effective-flow-state.mjs`, `effective-flow-state-core.mjs`, and `runtime-state-guard.mjs` into the instrument, because a first memory write executes them.                                                                                                       |

## Implementation details

### Approach

1. **Extract the shared module.** Move the listed functions and introduce `RuntimeStateError`, with `DiffBaselineError` as its subclass. Run the existing `diff-baseline` tests unchanged; they must stay green. Add `runtime-state-guard.test.mjs`.
2. **Write the helper core.** It covers the closed schema per operation, the owner patterns, the lock enum, the four operations with the semantics above, and the codes.
3. **Write the thin CLI.** It rejects argv before reading stdin, enforces the stdin cap, and emits one envelope.
4. **Ship the helper.**
   - Add the files to `RUNTIME_SCRIPT_FILES` and to the distribution-smoke list.
   - Add the smoke run.
5. **Replace the prose.** Each step names one call and its outcome handling. Also:
   - Keep the runtime-state guard prose for every mutation the helper does not take over.
   - Add `runId` minting to `iterate` Phase 0 and `apply-review` Phase 1.
   - Add the worker handoff fields to `iterate` Phase 3 and to the `apply-review` delegation.
   - Have `apply-review` Phase 7 call the helper directly.
6. **Update tests and guards.**
   - Update the pinned contract tests.
   - Confirm that `findRuntimeStateSafetyViolations` in `build-lib.mjs` still passes and still catches an unguarded lock mutation in the new prose.
   - `findMemoryStateContractViolations` checks only the ordering of `memory.json` mutations and stays unchanged.
7. **Measure the context budgets.**
   - Run `node build.mjs` and read the "Always-loaded core" report.
   - Set the `CONTEXT_BUDGET_LINES` entry of every touched tool to its built count plus at most ten lines. This includes `investigate`, which loads `memory-state` eagerly through `effective-flow-dir-migration`.
8. **Update the developer guide.** Update the counts, the runtime-script entry, the architecture section (lock contract, operations and classification, the "full two-token rule" constraint for work package 3), and `configuration.md`.

### Edge cases

- **Lock held by older prose** (owner without a token, or free text): `lock acquire` returns `LOCK_HELD` with the owner reported as `invalid` (byte count plus digest). `lock release` refuses with `NOT_OWNER`. Only a confirmed `lock break` with the observed identity and digest removes it.
- **`.effective-flow/` missing:** `lock acquire` creates it through the guarded ensure step. If the guard refuses, nothing is created and the result is `RUNTIME_STATE_UNSAFE` or `UNSAFE_TARGET`.
- **Owner write fails after `mkdir`:** the helper removes the empty directory only if its device and inode still match, then returns `WRITE_FAILED`.
- **Break races a release and re-acquire, even with inode reuse:** the modification time, the owner token, or the owner digest differs, so `lock break` returns `BREAK_MISMATCH` and removes nothing.
- **Unexpected entries in the lock directory:** `lock break` refuses before deleting anything.
- **`cwd` is a linked worktree, a symlinked alias, or a path containing `'`:** `INVALID_ROOT`. There is no fallback.
- **Inherited `GIT_DIR` or `GIT_WORK_TREE` in the environment:** stripped before every Git predicate, so the guard always judges the real repository.
- **Symlink on the lock path:** `UNSAFE_TARGET`, and nothing is created.
- **Extra argv token, unknown operation, or `--help`:** rejected before stdin is read.
- **`lock release` on an absent lock:** `NOT_HELD`. The prose reports it and treats the lock as lost.
- **Ownership lost before the `memory.json` rename:** the ownership check fails, so the mutation blocks and nothing is renamed.
- **Interrupted process holding a lock:** the lock stays. Nothing breaks it automatically, and age never counts.

## Acceptance criteria

- [ ] `runtime-state-guard.mjs` exists with the listed functions and `RuntimeStateError`. `diff-baseline-core.mjs` defines no copy, and all existing `diff-baseline` tests pass unchanged.
- [ ] `effective-flow-state.mjs` accepts exactly the four two-token operations and rejects every other argv before reading stdin. Tests cover an extra token, an unknown operation, and input above the stdin cap.
- [ ] Unit tests cover every documented operation semantic and every outcome and error code, including:
  - the bounded wait
  - `NOT_HELD`
  - break by token and by identity plus digest
  - break refusal on unexpected entries
  - the `INVALID_ROOT` rejection of a root containing `'`
  - the owner pattern rejection
  - `GIT_DIR` stripping
- [ ] A real-Git test reproduces a release and re-acquire between `lock inspect` and `lock break` with forced inode reuse, and `lock break` returns `BREAK_MISMATCH`.
- [ ] Conformance tests show both directions of compatibility for all three locks:
  - A lock created the way the current prose creates it blocks `lock acquire` and cannot be released by the helper.
  - A helper-created lock sits at the same path, with the owner file name the prose expects.
- [ ] `memory-state.md`, `iterate.md`, and `apply-review-commit-mechanics.md` contain no prose replay of `mkdir`, the owner write, the token reread, or lock removal for these three locks. Every lock step is a helper call in the here-string shape.
- [ ] The worker handoffs of `iterate` and `apply-review` carry the helper path, `RUNTIME_STATE_ROOT`, and `runId`.
- [ ] `RUNTIME_SCRIPT_FILES` (32 entries) and the distribution-smoke list contain the three new files. `pnpm test:distribution` shows them byte-identical in every target, and the smoke run of `lock acquire` and `lock release` passes there.
- [ ] `iterate` (Phase 0) and `apply-review` (Phase 1) mint a `runId` matching `<workflow>-<≥16 random hex>`. A test or build guard confirms that the sibling rule, the report after three `LOCK_HELD` results, and the single re-dispatch after a confirmed break are stated in the built prose.
- [ ] `evals/iterate/suite.config.mjs` and `evals/merge-gate/suite.config.mjs` seed the three new scripts, and `pnpm eval iterate verify` and `pnpm eval merge-gate verify` report the expected stale-evidence state rather than an instrument error.
- [ ] Every touched `CONTEXT_BUDGET_LINES` entry, including `investigate`, equals its built count plus at most ten lines.
- [ ] `build-system.md`, `architecture.md`, `release-and-installation.md`, and `configuration.md` state the correct script count (32) and describe the helper and its lock contract.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` pass in that order.

## Validation plan

- Run CI's order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- Run a manual check against a scratch repository with the built native Claude target:
  - acquire, then a concurrent acquire that returns `LOCK_HELD` after the wait
  - release, then a release of the now-absent lock that returns `NOT_HELD`
  - inspect
  - break after a simulated orphan
  - break after a simulated race, which returns `BREAK_MISMATCH`
- Read the built `iterate`, `apply-review-commit-mechanics`, and `memory-state` output and confirm that every lock step names the helper with a here-string and no heredoc.
- In the pull request, record that the `iterate` and `merge-gate` behavioural eval suites load changed sources and owe a re-recorded round before the next release. Both suites seed the three new scripts into their instrument, because a first memory write executes the helper.

## Assumptions and open points

- The owners of `iterate-commit.lock` and `apply-review-commit.lock` have no fixed format today. JSON owner content is compatible, because the prose reads them only for diagnostics and the token comparison.
- Work package 3 owns the allowlist rule, the PreToolUse-hook decision, and any `setup` change. This package adds no rule and changes no harness configuration.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    1 |
| Security        |        0 |         1 |    1 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         6 |    2 |
| Testability     |        0 |         1 |    1 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        0 |         2 |    0 |

### Findings

- **Important (Error cases): the helper's code list omitted the moved guard's `UNSAFE_TARGET` and `GIT_FAILED`.** Incorporated into the code table and the edge cases.
- **Important (Architecture): the guard depended on `DiffBaselineError`, the `git` wrapper, `gitBaseEnv`, and `relativeToRoot`.** Decision: a shared `RuntimeStateError` with `DiffBaselineError` as a subclass. The wrapper, `gitBaseEnv`, and `relativeToRoot` move as well.
- **Important (Error cases): behaviour with a missing `.effective-flow/` was undefined.** Decision: `lock acquire` ensures it through the guarded step.
- **Important (Error cases): the break race relied on the inode alone.** Incorporated: device, inode, nanosecond modification time and owner digest, tested with forced inode reuse.
- **Important (Security): the here-string guarantee was unspecified for `cwd` and the owner strings.** Decision: `INVALID_ROOT` for a root containing `'`, and a fixed pattern for every owner string.
- **Important (Error cases): `pid` had no meaning, and a live lock looked orphaned to older prose.** Decision: `pid: null`. The split between generated and caller-supplied fields is stated.
- **Important (Error cases): the waiting rules contradicted each other and had no channel in delegated runs.** Decision: the `runId` sibling rule, fail-closed in relayed and non-interactive runs, and workers that report to their orchestrator.
- **Important (Scope): the `memory.lock` timeout contract changed silently.** Decision: today's behaviour is kept, and `configuration.md` is added.
- **Important (Architecture): workers had no handoff for the helper path and root.** Incorporated into `iterate` Phase 3 and the `apply-review` delegation.
- **Important (Error cases): the `apply-review` final-validation commit has no finding ID.** Incorporated: `findingId` is optional, plus `purpose`.
- **Important (Maintainability): the build-guard row targeted a function that does not check locks.** Decision: the row is dropped, and `findRuntimeStateSafetyViolations` is verified instead.
- **Important (Maintainability): the runtime-script count was stale.** Corrected: 29 → 32.
- **Important (Testability): the budget criterion missed `investigate` and conflicted with the headroom rule.** Incorporated: built count plus at most ten lines, `investigate` included.
- **Note (Error cases): no `NOT_HELD` outcome, and no ownership check before the `memory.json` rename.** Incorporated.
- **Note (Error cases): the owner write could land in a re-created directory, and a break could leave a half-removed lock.** Incorporated: a post-write identity check, and refusal on unexpected entries.
- **Note (Architecture): there were two root checks.** Decision: `resolveRuntimeRoot` moves into the shared module.
- **Note (Testability): the envelope contract was underspecified.** Incorporated: envelope shape, exit 4 for outcome codes, the 64 KiB cap, and identity in the `LOCK_HELD` diagnostics.
- **Note (Scope): the evals obligation did not decide on seeding.** Decision: record that no scenario reaches the commit mutex, seed nothing, and re-record before the release.
- **Note (Security): `lock break` shares its first token with the allowlisted operations, and the here-string needs bash.** Incorporated as a work package 3 constraint and a stated requirement.

### Deep interactive review 2026-10-29

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    2 |
| Security        |        0 |         0 |    1 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         4 |    1 |
| Testability     |        0 |         0 |    1 |
| Scope           |        0 |         1 |    2 |
| Maintainability |        0 |         0 |    0 |

- **Important (Architecture): `runId` was required for the `memory` lock, whose 22 writers have no run concept.** Decision: `runId` is required only for the commit locks.
- **Important (Scope): nobody minted `runId`, and its format and uniqueness were open.** Incorporated: `iterate` mints it in Phase 0 and `apply-review` in Phase 1, as `<workflow>-<≥16 random hex>`.
- **Important (Error cases): three `LOCK_HELD` results were an age rule in disguise and invited breaking a live lock.** Decision: memory orphan criteria only. Three `LOCK_HELD` results only trigger a report.
- **Important (Error cases): the sibling wait deadlocked on a crashed sibling.** Incorporated: the sibling rule holds only while the owning delegation is active.
- **Important (Error cases): the flow after a break was undefined.** Decision: the orchestrator re-dispatches that item's commit critical section once.
- **Important (Architecture): the error-class direction was inverted, and `gitBaseEnv` was not re-exported.** Incorporated: `instanceof RuntimeStateError`, per-helper exit codes, and re-exports.
- **Important (Error cases): the promised `INVALID_ROOT` conflicted with the shared `resolveRuntimeRoot`.** Incorporated: the helper's own pre-check and code mapping.
- **Note (Security): the root rejected only `'`.** Incorporated: `$`, backtick, backslash, and control characters are rejected as well.
- **Note (Scope): the owner fields were underspecified.** Incorporated: `item` and `delegation` defined, `=` and `+` allowed, `component` optional for `final-validation`.
- **Note (Testability): the outcome envelope shape was open.** Incorporated: a separate `outcome` member.
- **Note (Architecture): Phase 7 was listed as a handoff, and no worker rule existed for `memory`.** Incorporated.
- **Note (Architecture): the `git` wrapper's compatibility with both runners was unstated.** Incorporated.
- **Note (Scope): the new scripts were not seeded although a memory write executes them.** Decision: seed them in both suites.
- **Note (Scope): the spike outcome was not recorded in the Requirement.** Incorporated.
- **Note (Data protection): inspect returned raw owner text without a cap.** Incorporated: an `invalid` owner is reported as a byte count and digest.

## Open points

- No open points.
