# Typed memory operations and allowlist setup

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

This plan implements work package 3 ("Typed memory operations and allowlist setup", stage 1) of `docs/concept/2026-10-29-runtime-state-cli.md`. It builds on work package 2: the helper `effective-flow-state.mjs` already exists, with its path guard and lock core.

It has three parts:

1. **Typed memory operations.** Every writer of `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` moves to a typed helper operation:
   - reserving a finding range
   - setting a named marker
   - the `.effective-flow/` directory migration
   - implicit adoption of the legacy `.sf-memory.json`

   No prose writer of `memory.json` remains.

2. **Allowlist setup.** In Claude Code, `setup` writes one allow rule per non-destructive helper operation, bound to the absolute install path, into the project's untracked `.claude/settings.local.json`.
3. **Measurement.** The concept's success criterion is re-checked for `review` and `iterate` against the work package 1 baseline.

Decisions the user made for this plan:

- **Rule only, no hook.** The spike (`docs/developer-guide/claude-code-allowlist-evidence.md`) concluded "hook fallback", because a rule's trailing `*` also admits extra arguments. It also named an option: the rule alone suffices if the helper rejects extra arguments itself. Work package 2 built exactly that rejection: `src/scripts/effective-flow-state.mjs` checks for exactly two argv tokens before it reads stdin. This package ships no PreToolUse hook. The measurement confirms or refutes the rule-only decision.
- **The rule goes into `.claude/settings.local.json`.** This matches `setup`'s project scope, and nothing machine-specific reaches the repository. `setup` must run once per repository.
- **The whole directory migration moves in this package.** That means the no-clobber tree copy, the memory merge, and the `runtimeMigration.directory` marker. The marker depends on a complete copy, so only the helper can write it after a verified copy. Work package 4 keeps only the removal of the legacy directories, plus the worktree lifecycle and cleanup.
- **The portable build detects Claude Code at run time.** DALO and the Skills CLI install only the portable build, and it is the build the spike measured. The step is therefore offered as follows:
  - native Claude build: always
  - portable build: only when the orchestrator recognises at run time that it is running in Claude Code, using the same harness detection as `setup` Step 7
  - native Codex build: never

  The measurement uses the portable build.

- **The criterion counts lock and memory helper calls.** `analyze_baseline.py`'s "housekeeping" regex also matches report writes below `.effective-flow/review/` and the prose guard's `git check-ignore`, which this package does not move. The criterion is therefore judged on a new sub-class, and the regex class is reported next to it.
- **Non-regular legacy entries are skipped.** A symlink or special file in `.firmo/` or `.sf-plugin/` is never followed or copied. It is reported with its path and excluded from the completeness check, and the migration completes.
- **A failed measurement blocks.** If the measurement misses the criterion for `review` or `iterate`, the plan is not marked implemented and work package 4 does not start. The fallback decision (hook or narrower prefixes) goes back to the user.

**Workflow rationale:** Feature. This adds new shipped helper operations and a new `setup` write target, and it changes the memory contract of every writer.

## Architecture decisions

- **One command family `memory` in the existing helper.** It has three operations: `memory reserve`, `memory set-marker`, and `memory migrate-directory`. They follow the work package 2 conventions:
  - exactly two argv tokens, from a closed set
  - stdin of at most 64 KiB, carrying one JSON object with a closed key set per operation
  - one envelope line on stdout
  - outcomes on exit 4; the work package 2 error codes and exit codes; `cwd` as the verified `RUNTIME_STATE_ROOT`, with the same alias and metacharacter refusal

  No generic write or merge operation exists. A new key family needs a new operation (concept non-goal "Generic memory writes").

- **Closed key sets** (all three operations take `cwd`, `owner.workflow` and an optional `waitSeconds` from 0 to 30, default 30):

  | Operation                  | Further keys                                            |
  | -------------------------- | ------------------------------------------------------- |
  | `memory reserve`           | `count`                                                 |
  | `memory set-marker`        | `marker`, and `version` for `config-migration-adr` only |
  | `memory migrate-directory` | none                                                    |

- **Each memory operation is one complete transaction.** It runs these steps:
  1. take the `memory` lock internally, with the same `waitSeconds` semantics as `lock acquire`
  2. re-read canonical memory, which must be a JSON object of at most 1 MiB (the pilot's bound)
  3. adopt the legacy file when canonical memory is absent
  4. apply only its own field
  5. immediately before the rename, re-inspect the lock and require the retained owner token; a lock broken and re-acquired by another session in between returns `NOT_OWNER`, with no write and no reservation
  6. write through the shared `atomicWrite`, preserving unknown fields with the same JSON meaning
  7. release the lock in a `finally`

  A missing `.effective-flow/` is created through `ensureGuardedDirectory`, as the forge prose does today. Each call is an authorized write. The prose no longer calls `lock acquire` or `lock release` for memory. The `memory` lock name stays in the `lock` enum for `lock inspect` and the user-confirmed `lock break`. A held lock returns `LOCK_HELD` with the observed owner, as `lock acquire` does.

- **The on-disk protocol stays exactly compatible.** Older installs still mutate `memory.json` through the prose protocol. They use the same `memory.lock/owner.json` and a temp-plus-rename write. The helper keeps:
  - the lock path and owner format of work package 2
  - the full-object JSON with a trailing newline
  - the counter semantics (`lastFindingNumber` is a nonnegative safe integer, a missing counter starts at 0, and a counter is never decremented)
  - the marker shapes the prose writes today
- **`memory reserve`:**
  - Input: `count`, an integer from 1 to 10000.
  - Result: `first` and `last` as numbers, and the formatted IDs `R-<7 digits>` of both ends.
  - The prose never calls it with a count of 0.
  - A counter that is not a nonnegative safe integer, or a range past `R-9999999`, returns `INVALID_STATE` (new error code, exit 3). The file is not changed.
- **`memory set-marker` with fixed shapes:**
  - `marker` is a closed enum:
    - `config-migration-adr` writes `configMigration.adr = {version, appliedAt}`. `version` comes from a closed set that today holds only `config-to-adr-v1`.
    - `label-migration-sf` writes `labelMigration.sf = {done: true, completedAt}`.
  - Both timestamps are UTC ISO 8601 without milliseconds (`YYYY-MM-DDTHH:mm:ssZ`), the format `review-state.md` shows, and the helper generates them.
  - **Presence test:**
    - `configMigration.adr` counts as present when its `version` equals the requested one.
    - `labelMigration.sf` counts as present when `done === true`.

    Either way, any other field a prose writer added is accepted, and a present marker is not rewritten (`changed: false`).

  - `runtimeMigration.directory` is not settable through this operation.
- **`memory migrate-directory`:**
  - **Source:** `.firmo/` if it exists, otherwise `.sf-plugin/`, never both, read from `RUNTIME_STATE_ROOT`.
  - **Copy:** runs **outside** the memory lock, so a large tree cannot starve concurrent reservations. It copies no-clobber into `.effective-flow/` and excludes `.worktrees/`. An existing target always wins, and every copy target passes the guard on its own. Each file is copied atomically, through a temporary file and an exclusive link, so the helper never leaves a partial target. Non-regular entries (symlinks, devices, sockets, FIFOs) are skipped, never followed, and reported in `skipped` with their path. The copy records the list of expected targets.
  - **Commit step:** runs inside the memory lock.
    1. Re-verify with `lstat` that every target on the recorded list exists as a regular file. This is a set of `lstat` calls, not a second source walk.
    2. Merge the legacy `memory.json` recursively, adding absent keys only. The base is canonical memory or a valid `.sf-memory.json`, and base values win.
    3. Write the marker `runtimeMigration.directory.version: 1` last, in the same atomic replacement as the merge.
  - **No legacy source:** the operation writes the marker alone. Today's prose writes it with the first runtime write even then, and the pilot core requires it on every mutation (`src/scripts/pilot-measurement-core.mjs`, `MIGRATION_REQUIRED`).
  - **Outcomes (exit 4):**
    - `MIGRATION_NOT_NEEDED`: the marker is already present
    - `LEGACY_MEMORY_INVALID`: the marker stays unset
    - `MIGRATION_INCOMPLETE`: a copy failed or a target is missing at re-verification; no marker, and the copied files stay
  - Both legacy directories are preserved; deleting them stays with `cleanup` and work package 4.
  - **Accepted residual risk:** the re-verification checks presence only. A target that an older prose install created non-atomically at the same moment (a partial copy) is certified by the marker. Today's protocol has the same limit, and the copy is add-only, so no data is overwritten.
- **Migration defence in code.** `memory reserve` and `memory set-marker` return the new outcome `MIGRATION_REQUIRED` (exit 4) when the `runtimeMigration.directory` marker is absent, whether or not a legacy directory exists. This matches the pilot core, which refuses every mutation without the marker as an error (exit 3). The prose prerequisite stays: the run calls `migrate-directory` before its first runtime write. Since `migrate-directory` always completes for a valid source, this defence has a recovery path.
  - **Handling at every call site**, stated once in `memory-state.md`: on `MIGRATION_REQUIRED`, call `memory migrate-directory` once and retry the operation once. Any non-success outcome of that call blocks with its code. A delegated worker reports it and never asks the user.
  - Every migration-prerequisite `when:` trigger of a host that reserves or sets a marker names memory, so that host loads the prerequisite. Today `fix.md`'s trigger does not mention memory, and the fragment loads only because a report write happens at the same time.
  - The reworked build guard checks that every `memory` operation call site loads the prerequisite.
- **Legacy adoption of `.sf-memory.json` is implicit and treated as non-destructive.** When canonical memory is absent inside the lock, every memory operation runs these steps:
  1. read the legacy file once, recording its identity and digest
  2. build canonical memory from the **whole** legacy object plus its own mutation
  3. re-verify the identity and digest just before the rename
  4. after a successful rename, re-check identity and digest and remove the legacy file through a new exact-name guard class

  Steps 2 and 3 are the stated invariants that justify the non-destructive classification: the removed content provably survives in canonical memory. The removal is not a separate operation. The two mismatch timings are handled differently, as in today's protocol:
  - **Before the rename:** the error `LEGACY_CHANGED` (exit 3), with no canonical write and no reservation. A stale legacy counter is never persisted, and the caller may retry.
  - **After the rename:** success. The legacy file is kept and the result carries `legacyConflict: {path}`. A failed removal is reported in the result as `legacyRemoval: {path, error}`, with no rollback.

  An invalid or unreadable legacy memory (root `.sf-memory.json`, or a legacy directory's `memory.json`) returns `LEGACY_MEMORY_INVALID` in every operation.

- **Two new path-guard classes in `runtime-state-guard.mjs`.** Today `guardTarget` admits only targets below `.effective-flow/` that are git-ignored. The existing class stays unchanged.

  | Class            | Admitted target                                            | Conditions                                                                                                                                               | Unlink                         |
  | ---------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
  | Legacy memory    | exactly `<RUNTIME_STATE_ROOT>/.sf-memory.json`             | regular file under `lstat`, untracked, not required to be ignored                                                                                        | only through the adoption step |
  | Harness settings | exactly `<RUNTIME_STATE_ROOT>/.claude/settings.local.json` | the directory chain passes `lstat`, untracked, ignored according to `git check-ignore` (`.gitignore`, `info/exclude`, or the global `core.excludesFile`) | never                          |

- **Allowlist rule written by code, not prose.** `setup` delegates the write to a new helper operation `harness allow-rules`. It is non-destructive but not allowlisted itself, so it prompts once in default mode.
  - **Input:**
    - `cwd`
    - `skillRoot`: the directory of the loaded skill, in the symlinked install form, never resolved through `realpath`; the spike showed that a rule must name the symlinked path
    - `mode`: `preview` or `apply`
    - `digest`: for `apply` only
  - **Checks, each failing with `UNSUPPORTED_PATH`** (no write; `setup` shows the rules for manual entry and states the reason):
    - `skillRoot` is not absolute.
    - It contains whitespace, a quote, `$`, a backtick, a backslash, `*`, `(`, `)` or a control character.
    - `realpath(<skillRoot>/scripts/effective-flow-state.mjs)` differs from the helper's own resolved file.
    - `skillRoot` resolves below `RUNTIME_STATE_ROOT`, or inside any worktree that `git worktree list` reports for the current repository (the same Git common directory). A project-level install is writable by everyone who can push to the repository, so the rule would auto-approve a file they control. An install in another clone, such as a DALO source checkout or a `local-link.sh` link into another checkout's `dist/`, is accepted.
    - A directory on the **symlinked** chain (for example `~/.claude` and `~/.claude/skills`, plus the symlink's own directory) or on the **resolved** chain can be written by a principal other than its owner and root. Whoever can write the symlinked side can re-point the link. Group-writable is accepted only when the group is the owner's private group: its gid equals the owner's primary gid, and the group has no other members. World-writable is accepted only with the sticky bit set and root as owner, as for `/tmp`.
  - **Harness gate:** without the environment variable `CLAUDECODE`, which Claude Code sets in its Bash environment, `preview` and `apply` return `UNSUPPORTED_HARNESS` and write nothing.
  - **Rules:** exactly one per non-destructive operation, `Bash(node <skillRoot>/scripts/effective-flow-state.mjs <group> <operation> *)`, for:
    - `lock acquire`, `lock release`, `lock inspect`
    - `memory reserve`, `memory set-marker`, `memory migrate-directory`

    `lock break` and `harness allow-rules` get no rule. A unit test pins the classification of every entry in `STATE_OPERATIONS` as allowlisted or not, so a new operation fails the test until it is classified.

  - **Target and merge:**
    - The target is `<RUNTIME_STATE_ROOT>/.claude/settings.local.json`.
    - A missing ignore entry returns `SETTINGS_NOT_IGNORED`, and a tracked file returns `SETTINGS_TRACKED`; neither writes anything.
    - An unparsable file returns `SETTINGS_INVALID`, and nothing is written.
    - The helper preserves every other key and rule, adds missing rules idempotently, and keeps the existing entry order.
    - Of the rules of exactly this shape that name another `skillRoot`, it removes only those whose `scripts/effective-flow-state.mjs` no longer resolves to a regular file. A second live install, such as a local link next to a DALO install, keeps its rules, and the preview lists them as "other install, kept".
    - A missing `.claude/` is created on `apply` only, through the guarded `mkdir`.
    - The write is atomic: temp file plus rename. Immediately before the rename, the helper re-checks the file's identity and digest. Claude Code itself writes this file, for example on "don't ask again", so a change since `preview` returns `PREVIEW_MISMATCH` and nothing is written.
  - **Preview and apply:**
    - `preview` returns the added rules, the removed rules, the kept rules of other installs, and every widened Effective Flow-related rule it detects (such as `Bash(node *)` or `Bash(node <skillRoot>/scripts/effective-flow-state.mjs *)`), each with a warning, plus a digest.
    - `apply` requires that digest and applies exactly that change set. Otherwise it returns `PREVIEW_MISMATCH`.
- **The `setup` step:**
  - **Where it runs.** It runs after Step 6's config write, as its own step behind a ` ```lazy-include ` at its decision point, so non-Claude runs do not pay for it.
  - **Modes.** It runs in the Profile, Express and Guided modes and in hidden mode. It also runs in a new seventh keyword form, `setup allowlist`, with its own small contract. That form needs no existing configuration, includes the ignore remedy, and is the way to refresh the rule after an install moves. Step 0 recognises the keyword. Targeted mode stays unchanged.
  - **Harness detection.** The orchestrator judges the harness from its running environment. The helper's `CLAUDECODE` gate is authoritative, so a misjudgement fails closed. This plan does not point to `setup` Step 7's detection: it is model judgment inside `setup-rename-probe.md`, loaded only after a Yes to Step 7.
  - **Status.** `setup status` reports the rule state through a read-only probe:
    - The closed `setup-status` input gains the optional key `skillRoot`.
    - A rule counts as this install's rule when the realpath of its helper equals the realpath of `<skillRoot>/scripts/effective-flow-state.mjs`.
    - States: `absent`, `current`, `stale` (a rule whose helper no longer resolves), `not-applicable` (no `skillRoot`, or outside Claude Code), and `could-not-check`.
    - `absent` and `stale` set `setupFixable: true` with the new `setupForm` value `allowlist`, in a new `data.allowlist` section.
    - The settings parser and the rule-shape matcher live in one shared module that `effective-flow-state-core.mjs` and `setup-status-core.mjs` both import. Neither imports the other.
  - **Preview and confirmation.** The step shows the preview, then requires an explicit confirmation in the conversation before `apply`, in every mode. In auto mode the classifier's approval of `apply` does not replace that confirmation.
  - **`SETTINGS_NOT_IGNORED`.** The allowlist step owns its own ignore remedy and does not re-enter Step 1:
    - **Standard mode:** offer the `.claude/settings.local.json` line in `.gitignore` after a confirmation, then re-run `preview`.
    - **Hidden mode:** add the line to `info/exclude`. `setup-hidden-mode.md` is extended from the `.effective-flow/` line to this second line.
  - **Summary.** The summary warns never to accept Claude Code's "don't ask again" suggestion for helper calls, because it widens to `node <helper> *` or `node *`.
- **Codex writes no rule.** The native Codex build, and a portable build running outside Claude Code, explain in one sentence that the step is specific to Claude Code, and write nothing. The concept sets no Codex execpolicy, and neither does this plan.
- **The prose shrinks to calls and outcome handling.**
  - `src/shared/memory-state.md` becomes the contract of the three operations: call shapes, outcomes, the orchestrator-only `lock break` for the memory lock, and the reserve-after-filter ordering rule.
  - The protocol replay is removed: the atomic write steps, the lock replay, and the legacy adoption steps.
  - The reservation and ordering rules that are judgment stay in prose: reserve exactly the admitted count after the filters, and persist before publishing.

## Affected files

| File                                                                                                                                                                                                                  | Description                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/effective-flow-state-core.mjs`                                                                                                                                                                           | Add the `memory` and `harness` operation groups: closed key sets, transactions, outcomes, legacy adoption, migration copy, settings merge and preview digest                                                           |
| `src/scripts/effective-flow-state.mjs`                                                                                                                                                                                | Extend the usage string and the operation dispatch; keep the two-token argv rejection before stdin is read                                                                                                             |
| `src/scripts/runtime-state-guard.mjs`                                                                                                                                                                                 | Add the legacy-memory and harness-settings target classes; add the read-only legacy source walk for `.firmo/` and `.sf-plugin/`                                                                                        |
| `src/shared/memory-state.md`                                                                                                                                                                                          | Rewrite as the helper-operation contract; remove the protocol replay                                                                                                                                                   |
| `src/shared/effective-flow-dir-migration.md`                                                                                                                                                                          | Replace the copy, merge and marker replay with the `memory migrate-directory` call and its outcomes, including the `skipped` report                                                                                    |
| `src/shared/review-state.md`                                                                                                                                                                                          | Point reservation to `memory reserve`; leave the example shape unchanged                                                                                                                                               |
| `src/tools/review.md`                                                                                                                                                                                                 | Reserve through `memory reserve`, at all three reservation sites (about lines 235–262, 573–584 and 615–623)                                                                                                            |
| `src/shared/unresolved-review-report.md`                                                                                                                                                                              | Reserve through `memory reserve`                                                                                                                                                                                       |
| `src/shared/issue-tracker-forge.md`                                                                                                                                                                                   | Write `labelMigration.sf` through `memory set-marker`                                                                                                                                                                  |
| `src/tools/setup.md`                                                                                                                                                                                                  | Write `configMigration.adr` through `memory set-marker`; add the lazy pointer to the allowlist step after Step 6; add the `setup allowlist` keyword form to Step 0; amend `## Goal`, `## Rules` and the Step 8 summary |
| `src/shared/setup-hidden-mode.md`                                                                                                                                                                                     | Add the `.claude/settings.local.json` line to the hidden-mode `info/exclude` contract                                                                                                                                  |
| new shared settings module in `src/scripts/` (for example `claude-settings-core.mjs`), listed in `RUNTIME_SCRIPT_FILES`                                                                                               | Settings parser and rule-shape matcher, imported by the state core and the setup-status core; the `iterate` and `merge-gate` suite configs seed it when the helper imports it                                          |
| new `src/shared/setup-allowlist.md`                                                                                                                                                                                   | The lazy-loaded allowlist step: harness detection, preview, confirmation, apply, ignore remedy, warnings                                                                                                               |
| `src/shared/setup-status.md`, `src/scripts/setup-status-core.mjs`                                                                                                                                                     | The optional `skillRoot` input, the `data.allowlist` section, and the `allowlist` value in `SETUP_FORMS`                                                                                                               |
| every host whose migration-prerequisite `when:` trigger omits memory (at least `src/tools/fix.md`)                                                                                                                    | Name memory in the trigger                                                                                                                                                                                             |
| `build.mjs`                                                                                                                                                                                                           | Update `CONTEXT_BUDGET_LINES` for every touched tool; rework the memory-state writer guard (#176)                                                                                                                      |
| `build-lib.mjs`                                                                                                                                                                                                       | `findMemoryStateContractViolations`: a source that mutates memory must do so through a named `memory` operation and include the contract; a prose instruction to write `memory.json` directly is a violation           |
| `scripts/distribution-smoke.mjs`                                                                                                                                                                                      | Smoke-test one `memory reserve` and the argv rejection of a `memory` operation in every target                                                                                                                         |
| `test/effective-flow-state.test.mjs`, new `test/effective-flow-state-memory.test.mjs`, new `test/effective-flow-state-harness.test.mjs`                                                                               | Unit tests for the new operations (see validation plan)                                                                                                                                                                |
| `test/memory-state-contract.test.mjs`, `test/generated-memory-state-contract.test.mjs`, `test/runtime-dir-migration-contract.test.mjs`, `test/build-lib.test.mjs`, and other contract tests that assert the old prose | Adjust to the new contract; each assertion names the invariant it protects                                                                                                                                             |
| `docs/concept/2026-10-29-runtime-state-cli.md`                                                                                                                                                                        | Amend WP3 and WP4 scope and handoffs: the directory migration moves to WP3, WP4 keeps legacy-directory removal, and `worktree-integration` is not a memory writer                                                      |
| `docs/developer-guide/claude-code-allowlist-evidence.md`                                                                                                                                                              | New section "Stage 1 measurement", with the results, the rule-only verdict, the recorded harness deviations, the limit of unmeasured server-side auto mode, and retention digests                                      |
| `docs/developer-guide/build-system.md`, `architecture.md`, `configuration.md`, `release-and-installation.md`                                                                                                          | Describe the memory operations, the settings target, the allowlisted operation list, and the boundary that destructive operations are never allowlisted                                                                |

## Implementation details

### Approach

1. **Pin today's behaviour first.** Fixtures cover:
   - the reservation arithmetic, including a missing counter and the legacy example "41 plus two gives R-0000042 to R-0000043, persisted 43"
   - the marker shapes and presence tests decided above, including prose-written variants with extra fields
   - the migration's no-clobber, base-wins and marker-last rules

   A conformance test runs a helper reservation against a `memory.json` and lock that the prose protocol wrote, and the reverse, to prove mixed-version operation.

2. Add the two guard classes. Implement `memory reserve` with the transaction, legacy adoption and `MIGRATION_REQUIRED`. Then implement `memory set-marker`.
3. Implement `memory migrate-directory`, with the copy outside the lock and the commit step inside it.
4. Implement `harness allow-rules` with `preview` and `apply`, the path checks, the kept-other-install rule, and the test that pins the operation classification.
5. Rewrite the prose:
   - `memory-state.md` first
   - then every writer site from the affected-file table
   - then the `setup` step, the setup-status probe and the concept amendment

   Run `node build.mjs` and update every `CONTEXT_BUDGET_LINES` entry it reports to its built count plus at most ten.

6. Update the build guard, the contract tests, the distribution smoke and the developer-guide documents. Run `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution`.
7. **Measure** (see "Measurement" below), then write the evidence section.

### Measurement

The measurement reuses the work package 1 harness: `host.mjs`, `reset.sh`, the prompts, `analyze_baseline.py` and the sandbox repository `fastner/ef-allowlist-sandbox` with its token file. It follows these rules:

- **Evidence root.** A new root, `.effective-flow/spikes/allowlist/2026-10-29-02/` or the next free run directory on the measurement day, keeps the work package 1 evidence untouched.
- **Separate install.** The run must not change the user's installed skill.
  - A measurement `HOME` **outside** the evidence root holds `.claude/skills/effective-flow` as a symlink to this checkout's built `dist/portable/effective-flow`. The portable build needs no agent sidecars, and it matches the baseline install.
  - The run passes this `HOME` through `cfg.extraEnv.HOME`. If authentication fails there, the next attempt is `CLAUDE_CONFIG_DIR`.
  - Credentials, the token, `.claude.json` and `.credentials.json` never land in the evidence root or its manifest.
  - Linking the user's real install requires the user's explicit permission in the run.
- **Recorded harness deviations.** The changed copies of `host.mjs`, `reset.sh`, the prompts and `analyze_baseline.py` live only under the new run root. The work package 1 files stay byte-identical, which a check against its `manifest.sha256.txt` confirms. Each deviation is listed in the evidence section:
  - the rule cells pass `settingSources: ['user', 'local']`, so the cells load the `.claude/settings.local.json` that `harness allow-rules apply` wrote, never inline rules
  - `reset.sh` gets one step that, after each fresh clone, adds the ignore entry to the clone's `info/exclude` (never `.gitignore`, which would join the review seed's uncommitted diff) and runs `harness allow-rules preview` and then `apply` in the clone, with `CLAUDECODE=1`
  - a review seed with unambiguous defects that leads to a reservation
  - a seed with `.firmo/` and without the migration marker
  - `allowedRoots` names the measurement `HOME` instead of the real skill path
  - `analyze_baseline.py` gets the new sub-class "helper housekeeping": calls of `effective-flow-state.mjs lock|memory`, the legacy prose lock and `memory.json` replays, and every `memory.json` write
- **Cells.**
  - `review` and `iterate` run 3 times each in default mode and 3 times each in auto mode, with `CLAUDE_CODE_AUTO_MODE_SERVER=0`: 12 runs.
  - One extra default-mode `review` run uses the `.firmo/` seed, to show that `migrate-directory` runs without a prompt.
  - A review run in which the model admits no finding is invalid. It is repeated, and the repeat is recorded.
  - One interactive `setup allowlist` run in a fresh sandbox clone. The host answers the confirmation with the scripted answer. It checks that the `setup` prose (detection, preview, confirmation, apply) writes the same rules as the direct helper call. It is a cross-check and is not part of the pass condition.
- **Pass condition.** In every valid run, the "helper housekeeping" sub-class counts 0 permission prompts and 0 auto-mode refusals, and every review run shows a persisted `lastFindingNumber`. The regex class and prompts for other helpers (for example `remote-tracker.mjs`) are reported, but they are outside the criterion.
- **Failure** blocks the plan's implemented status and work package 4, as the user decided. The evidence and the PR state the miss and the run IDs.
- **Limit.** Server-side auto mode, which is the default, stays unmeasured. As in work package 1, it gives no attribution. The evidence section carries this limit forward.

### Edge cases

- **`LOCK_HELD`:** a delegated worker reports it and never asks the user. Only a gated orchestrator offers `lock inspect` and the confirmed `lock break`, as the work package 2 contract already says.
- **Canonical `memory.json` is not a JSON object, or is larger than 1 MiB:** `INVALID_STATE`, no write, and the transaction fails.
- **Canonical memory appears inside the lock:** it wins, and the legacy file stays untouched.
- **Count would push the counter past `R-9999999`:** `INVALID_STATE`, and nothing is reserved.
- **Failure after a successful reservation:** this leaves a permanent gap, never a decrement, as today.
- **A fresh repository with no legacy state:** the prerequisite's `migrate-directory` call writes the marker alone, and the later operations succeed.
- **Hidden mode:** `.effective-flow/` is in `info/exclude`, and the guard accepts it as today. The settings line is added to `info/exclude` as described for the `setup` step.
- **Install path rejected (`UNSUPPORTED_PATH`):** `setup` shows the rules for manual entry and states the reason.
- **Two live installs:** both sets of rules stay, and the preview names the other one.
- **Install moved:** the next `setup` run removes the rules whose helper no longer resolves and adds the new ones. Both appear in the preview.
- **The user accepted "don't ask again" earlier:** the helper does not remove a widened rule, but the preview warns about it.
- **Session in a linked worktree:** the helper writes only below the main checkout, and Claude Code may read the linked worktree's own `.claude/` (see open points). The `setup` summary states this limit.
- **Codex workspace-write:** writes below `.effective-flow/` are inside the workspace and are not affected by the `.git` protection. No sandbox widening.

## Acceptance criteria

- [x] `memory reserve`, `memory set-marker` and `memory migrate-directory` exist with the closed key sets of this plan and reject any extra argv before stdin is read. Unit tests cover every outcome and error code this plan names.
- [x] The conformance tests pass in both directions:
  - a helper reservation on prose-written state
  - prose-protocol state after a helper write, with identical JSON meaning, preserved unknown fields, and the same lock path and owner format
- [x] `src/` contains no prose instruction that writes `memory.json` directly: every former writer site in the affected-file table calls a `memory` operation, and the reworked build guard fails a fixture that writes directly.
- [x] `harness allow-rules` writes exactly the six allowlisted operations and never writes a rule for `lock break` or `harness allow-rules`. A test fails when an operation in `STATE_OPERATIONS` is not classified. Tests cover:
  - preview-digest binding and idempotence
  - kept rules of other installs, and removal of a dead install's rules
  - the warning for widened rules
  - `SETTINGS_NOT_IGNORED`, `SETTINGS_TRACKED` and `SETTINGS_INVALID`
  - every `UNSUPPORTED_PATH` check: a `skillRoot` inside a worktree of the current repository is refused, while one in another clone (DALO layout, local-link layout) is accepted; a foreign-writable directory on either chain is refused, while a private-group or sticky root-owned directory is accepted
  - `UNSUPPORTED_HARNESS` without `CLAUDECODE`
  - `PREVIEW_MISMATCH` after a concurrent change to the settings file
- [x] `setup` behaves per target:
  - The native Claude build and the portable build running in Claude Code offer the step with a preview, a conversational confirmation and the "don't ask again" warning.
  - The native Codex build, and the portable build outside Claude Code, write no rule and say so.
  - `setup allowlist` works without an existing configuration and includes the ignore remedy.
  - `setup status` reports the rule state with the five states of this plan.
- [x] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass. Every changed `CONTEXT_BUDGET_LINES` entry equals the built count plus at most ten.
- [x] The "Stage 1 measurement" section in `docs/developer-guide/claude-code-allowlist-evidence.md` records the 12 valid runs plus the migration run. In every valid run, the "helper housekeeping" sub-class shows 0 prompts and 0 refusals, and every review run shows a persisted reservation. The plan is marked implemented only when this criterion holds.
  - **Amended on 2026-10-31 (user decision).** Two realistic rounds (26 runs) never reached a helper call. `review` skipped the reservation and the report, and `iterate` skipped the commit lock, so the criterion went unexercised rather than refuted. The criterion now holds for exercised calls: in a targeted round 3, all 19 calls in the literal shape ran without a prompt or refusal, and every cell was exercised in 3 of 3 runs. The realistic exercise of the steps, and compliance with the call shape (29 of 48 calls were non-literal, 9 of them prompted in default mode), move to work package 8 of the concept.

## Validation plan

- **Unit tests for `memory` operations** (injected `fs`, runner and clock, as in work package 2):
  - reservation ranges and the boundary at `R-9999999`
  - a missing counter
  - a non-integer counter or oversized file giving `INVALID_STATE`
  - `MIGRATION_REQUIRED` with and without a legacy directory
  - legacy adoption: success; a change before the rename giving `LEGACY_CHANGED` with no write; a change after the rename giving `legacyConflict`; a failed removal; canonical memory appearing inside the lock; an invalid legacy file giving `LEGACY_MEMORY_INVALID`
  - a lock broken and re-acquired between read and rename giving `NOT_OWNER` with no write
  - unknown fields preserved
  - marker presence with prose-written extra fields
  - `LOCK_HELD` after `waitSeconds`
  - lock release in every error path
- **Migration tests:**
  - `.firmo/` over `.sf-plugin/`
  - `.worktrees/` excluded
  - an existing target kept
  - a symlink and a FIFO skipped and reported
  - an invalid legacy memory leaving no marker
  - `MIGRATION_INCOMPLETE` after an injected copy failure, with no marker
  - the marker written when no legacy source exists
  - a repeat call giving `MIGRATION_NOT_NEEDED`
  - a concurrent reservation during the copy completing within its wait
- **Harness tests:**
  - a fixture settings file with foreign keys and rules
  - stale-rule removal
  - kept rules of other installs
  - preview and apply digest binding
  - tracked or unignored targets
  - an unparsable file
  - metacharacter paths
  - a path inside a worktree of the current repository versus another clone
  - a foreign-writable directory on the symlinked chain and on the resolved chain
  - a private-group directory and a sticky root-owned directory
  - a missing `.claude/` created on `apply` only
  - the `CLAUDECODE` gate
  - a `skillRoot` whose helper does not resolve to the running helper
- **Git-backed tests** in `test/effective-flow-state-git.test.mjs` for the ignore and tracked checks of both new target classes.
- **Setup-status tests:** every rule state, the `skillRoot` key, and `setupForm: allowlist`.
- **Build-guard fixtures:** a `memory` call site without the migration prerequisite fails.
- **Contract tests:** each named prose invariant still holds through the new call: reserve after the filters, persist before publish, worker never asks, orchestrator-only break, conversational confirmation before `harness allow-rules apply`.
- **Distribution smoke:** a `memory reserve` in each target's install layout.
- **Measurement:** as described in "Measurement", with the evidence retained under the run root and a manifest digest, as in work package 1.

## Assumptions and open points

- **Verified code context:** the writer sites, line counts, helper API, budgets, build guard and harness are taken from `origin/develop` at `c626151e` and from the work package 1 evidence root. `worktree-integration.md` names `memory.json` but writes nothing, so it needs no change, although the concept lists it as a writer.
- **The `configMigration.{review,applyReview,tracker,worktree}` keys:** they appear only in the example in `review-state.md` and have no writer in `src/`. They get no operation. The helper preserves them as unknown fields.
- **Settings in linked worktrees:** whether Claude Code reads the main checkout's `.claude/settings.local.json` in a session started inside a linked worktree is unverified. The measurement runs in the main checkout. The `setup` summary states the limit, and a later package may verify it.
- **Separate `HOME`:** that `host.mjs` can authenticate under a separate `HOME` or with `CLAUDE_CONFIG_DIR` is an assumption. The measurement names the fallback, and it never changes the user's install without permission.
- **Count limit:** the upper bound of 10000 for `count` is a protective value, not a domain rule. A larger value can be set with a reason during implementation.
- **Not blocking:** the linked-worktree settings behaviour, the separate `HOME` and the count limit do not block implementation. Each either has a stated fallback, or is a stated limit that the `setup` summary or the evidence section reports.
- **No ADR:** the concept's ADR candidate "Destructive helper operations are never allowlisted" is not written as an ADR in this package. The boundary is documented in `configuration.md` and in the evidence document. Whether a full ADR is worth writing is left to later work.
- **Eval re-recording:** the `iterate` and `merge-gate` suites hash `effective-flow-state*.mjs`, so their instruments move. Re-recording is owed before the next release, as already noted for work package 2. It is not part of this package.

## Plan review

**Result:** Approved

### Summary

Both rounds combined: the internal review on 2026-10-29 and the deep review on 2026-10-30.

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         4 |    3 |
| Security        |        2 |         1 |    0 |
| Data protection |        0 |         1 |    2 |
| Error cases     |        0 |         4 |    1 |
| Testability     |        0 |         3 |    3 |
| Scope           |        0 |         2 |    1 |
| Maintainability |        0 |         0 |    2 |

### Findings

#### Deep review (2026-10-30)

- **Critical, Security.** The refusal "`skillRoot` inside a Git worktree" would have rejected every normal install, the measurement install included: DALO is a Git clone, and `local-link.sh` links into a checkout. Incorporated (user decision): only worktrees of the current repository and paths below `RUNTIME_STATE_ROOT` are refused.
- **Critical, Security.** The refusal "group- or world-writable" would have rejected installs on systems with user-private groups, such as the maintainer's DALO directories. It also checked only the resolved chain, while the rule names the symlinked one. Incorporated (user decision): refuse writers other than the owner and root, accept a private owner group and sticky root-owned directories, and check both chains.
- **Important, Architecture.** The `setup status` probe was not implementable as written: its input is closed, it had no symlinked path, and it had no state for outside Claude Code. Incorporated: the `skillRoot` key, realpath matching, five states, `data.allowlist`, `setupForm: allowlist`, and a shared settings module.
- **Important, Scope.** The Targeted keyword `allowlist` contradicted the Targeted contract, which requires a configuration and never repairs ignore files. Incorporated (user decision): a seventh keyword form, `setup allowlist`, with its own ignore remedy. `setup-hidden-mode.md` is added to the affected files.
- **Important, Error cases.** A legacy-file change before the rename and one after it were treated alike. Incorporated: `LEGACY_CHANGED` with no write before the rename, and `legacyConflict` after it. `LEGACY_MEMORY_INVALID` applies in every operation.
- **Important, Error cases.** The handling of `MIGRATION_REQUIRED` at call sites was undefined, and the `fix` trigger does not name memory. Incorporated: migrate once and retry once, a memory trigger in every reserving host, and a build-guard check.
- **Important, Architecture.** The transaction had lost today's ownership check before the rename, and the in-lock re-verification walked the source again. Incorporated: a token check with `NOT_OWNER`, atomic per-file copies, a recorded target list, and the presence-only check as an accepted residual risk.
- **Note, Architecture.** Step 7's harness detection is not reusable. Incorporated: model judgment, with the helper's `CLAUDECODE` gate as the authoritative check (`UNSUPPORTED_HARNESS`).
- **Note, Data protection.** Global excludes, a missing `.claude/` and concurrent writes by Claude Code were unspecified. Incorporated: `check-ignore` semantics, `.claude/` created on `apply` only, and an identity re-check before the rename.
- **Note, Testability.** The changed harness copies, where the ignore entry goes, and the untested `setup` prose were unspecified. Incorporated: copies only under the new root, a byte-identity check of the WP1 files, `info/exclude`, and one interactive `setup allowlist` cross-check.
- **Note, Maintainability.** "No open points" stood next to unverified assumptions, and the earlier verdict was stale. Incorporated: the assumptions are labelled non-blocking with their fallback or stated limit, and the result was re-judged after this round.

#### Internal review (2026-10-29)

- **Critical, Architecture.** Excluding the portable build from the allow rule would have excluded every DALO and Skills CLI user in Claude Code. Incorporated: the portable build offers the step when it detects Claude Code at run time (user decision), and the measurement uses the portable build.
- **Important, Architecture.** The existing guard cannot remove `.sf-memory.json`, because it admits only ignored targets below `.effective-flow/`. Incorporated: a new exact-name legacy-memory class. Building canonical memory from the whole legacy object, with identity and digest re-checked, is stated as the invariant behind the non-destructive classification.
- **Important, Architecture.** Removing every rule with a different `skillRoot` would break repositories driven by two installs at once. Incorporated: only rules of a dead install are removed, and live other installs are kept and shown.
- **Important, Error cases.** Fresh repositories would never get the migration marker, and the pilot would then fail permanently. Incorporated: `migrate-directory` writes the marker without a legacy source, and the claim about the pilot is corrected.
- **Important, Error cases.** A symlink in the legacy tree would have blocked every reservation with no recovery. Incorporated: non-regular entries are skipped and reported (user decision).
- **Important, Security.** A `skillRoot` inside a repository would let the rule approve a file anyone with push access controls. Incorporated: worktree, runtime-root and writable-chain refusals under `UNSUPPORTED_PATH`.
- **Important, Testability.** The measurement did not load the settings file that `setup` writes, and it understated the harness changes. Incorporated: `settingSources` includes `local`, the rules are applied in the clone after each reset, and all deviations are listed.
- **Important, Testability.** The measured install was not comparable to the baseline, and native agent sidecars were missing. Incorporated: the portable build under a measurement `HOME`.
- **Important, Testability.** The pass condition counted housekeeping outside this package. Incorporated: a "helper housekeeping" sub-class, with the regex class reported next to it (user decision).
- **Important, Data protection.** A measurement `HOME` below the evidence root would retain credentials. Incorporated: `HOME` lives outside the root, and credentials are excluded from evidence.
- **Important, Scope.** A failed measurement would still have counted as done. Incorporated: a failure blocks the implemented status and work package 4 (user decision).
- **Note, Data protection.** The marker shapes were not fully prescribed. Incorporated: field names, timestamp format and presence tests are fixed.
- **Note, Error cases.** `SETTINGS_NOT_IGNORED` had no remedy in standard mode, and the linked-worktree behaviour was unknown. Incorporated: the remedy goes through `setup`'s ignore handling, and the worktree limit is an open assumption stated in the summary.
- **Note, Scope.** The concept still assigned the directory migration to WP4. Incorporated: a concept amendment is in the affected files.
- **Note, Architecture.** Modes, status reporting and the auto-mode confirmation for the `setup` step were unclear. Incorporated: modes and the Targeted keyword are named, a `setup status` row is added, and the conversational confirmation is required in every mode.
- **Note, Maintainability.** The allowlist step would have grown the always-loaded `setup` core. Incorporated: it sits behind a lazy include.
- **Note, Architecture.** The transaction details were unspecified. Incorporated: full key sets, a 1 MiB bound, the directory-creation rule, and the copy outside the lock.
- **Note, Testability.** Server-side auto mode stays unmeasured. Incorporated as a stated limit in the evidence section.
- **Note, Testability.** A review run without findings had no defined result. Incorporated: such a run is invalid and is repeated.

## Implementation notes

- **Module split.** The memory and harness operations live in `effective-flow-state-memory-core.mjs` and `effective-flow-state-harness-core.mjs`. The core loads both through literal dynamic imports. `claude-settings-core.mjs` is the read-only parser and rule-shape matcher shared with `setup-status`, and `runtime-file-primitives.mjs` holds the bounded-read primitives. Together they bring the shipped runtime scripts to 38.
- **Harness results are outcomes.** The harness results (`UNSUPPORTED_HARNESS`, `UNSUPPORTED_PATH`, `SETTINGS_*`, `PREVIEW_MISMATCH`) are exit-4 outcomes, and `UNSUPPORTED_PATH` carries the rules for manual entry. `LEGACY_MEMORY_INVALID` is an outcome in every operation.
- **`skillRoot` charset.** `skillRoot` must match `^[A-Za-z0-9._@+/-]+$`. A non-ASCII install path is refused, and no rules are offered for it.
- **Rule state.** `setup status` reports `current` only when a rule's literal `skillRoot` matches, because Claude Code matches the literal command. Rules under another path to the same helper are listed in `aliases[]`.
- **Call shape.** Every `effective-flow-state.mjs` call must be the literal shape `node <absolute skill root>/scripts/effective-flow-state.mjs <group> <op> <<< '<json>'`, with no variables, pipes or compound commands. `src/shared/state-helper-call.md` states this once and a contract test pins it. It was added after measurement round 1.
- **Measurement.** Auth uses a dedicated `CLAUDE_CODE_OAUTH_TOKEN` read from a file outside the evidence root. The evidence root is `.effective-flow/spikes/allowlist/2026-10-29-02/`, with manifest SHA-256 `889c929fc4a945076045d3d162765cbf5892dac11f2388f74d382c982c03caa3`. The measurement cost 12.20 USD in total.
- **Concept.** It now carries the WP3/WP4 scope amendment and the new work package 8, "Helper-step and call-shape compliance".

## Test results

- `corepack pnpm agent:check`: pass.
- `corepack pnpm test`: 3271 tests, 3268 pass, 0 fail, 3 skipped (the same three as before).
- `node build.mjs`: pass. Always-loaded cores are within budget: setup 1521/1524, iterate 1644/1648, review 773/777, investigate 523/527.
- `corepack pnpm test:distribution`: pass.
- Stage 1 measurement: rounds 1 and 2 were not exercised (0 helper calls in 26 runs). Round 3 confirmed the rule for exercised calls (19 of 19 literal calls with no prompt). The `setup allowlist` cross-check matched the direct helper call.
- The `iterate` and `merge-gate` eval evidence is stale, as expected. A re-recorded round is owed before the next release.

## Review findings

**Date:** 2026-10-31
**Reviewer:** effective-flow-nodejs-reviewer, effective-flow-generic-product-reviewer (plus one combined re-check)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    28 |
| Open / Not implemented |     0 |

## Open points

- No open points.
