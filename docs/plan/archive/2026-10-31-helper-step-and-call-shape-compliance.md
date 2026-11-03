# Helper-step and call-shape compliance

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

This plan implements work package 8 ("Helper-step and call-shape compliance", stage 1 follow-up) of `docs/concept/2026-10-29-runtime-state-cli.md`. It builds on work package 3: the typed memory operations, the `effective-flow-state` allow rules written by `setup allowlist`, and the literal call-shape rule in `src/shared/state-helper-call.md`.

The work package 3 measurement (`docs/developer-guide/claude-code-allowlist-evidence.md`, "Stage 1 measurement", rounds 1 to 3) left two gaps:

1. **Skipped steps.** Rounds 1 and 2 had 26 realistic runs and made zero helper calls.
   - `review` answered inline and skipped both the finding-ID reservation and the local report.
   - `iterate` committed without `iterate-commit.lock`.
   - One run cited the delegation triviality exception as its reason. That exception waives delegation only, never a workflow step.
2. **Broken call shape.** Round 3 asked for the steps. All 19 literal-shape calls matched the allow rule without a prompt, but 29 of 48 calls broke the literal shape, and 9 of those prompted in default mode. The broken shapes were trailing `echo "exit=$?"`, pipes, compound commands and shell variables. The same habit shows in `remote-tracker.mjs` and `config-resolve.mjs` calls, and no rule covers those two helpers.

**Goal.** Realistic runs of `review` and `iterate` reach their persistence and lock steps. The literal call shape is required for every `effective-flow-state` call. Nothing enforces it mechanically: a call in any other shape prompts in default mode, which is exactly what the criterion of 0 housekeeping prompts counts. Fewer calls per run lower that exposure, but don't remove it. For `config-resolve.mjs` and `remote-tracker.mjs` the same rule applies and is measured and reported, but has no threshold. A realistic re-measurement meets the work package 8 criterion.

Decisions the user made for this plan:

- **iterate commits through an allowlisted helper operation.** A new operation, `commit create`, replaces the five-to-six-step lock and commit sequence with one call. It acquires the lock, checks for a clean index, stages exactly the listed paths, commits, verifies the result and releases the lock. `iterate` never runs `git add` or `git commit` for an item outside it.
  - Only `iterate` adopts it in this package; `apply-review-commit-mechanics` keeps its prose sequence for now.
  - The operation is allowlisted, and the plan states the risk this takes on: one unprompted call writes Git history and runs the repository's hooks. In auto mode it also bypasses the classifier. Until now the allow family covered only runtime state below `.effective-flow/`.
  - Several limits bound this risk. The operation commits only the listed paths. It rejects paths below `.effective-flow/`. It can't push, amend, reset or rebase.
  - **Hook code a PR can change is not trusted.** A PR head can bring its own hook configuration, and in a fork PR that is third-party code. `commit create` therefore refuses with `HOOKS_UNTRUSTED` when the head comes from a fork, or when it changes hook-relevant configuration compared with the base. In that case `iterate` falls back to the prompting prose commit sequence. Without such a change, the hooks it runs are the repository's own, the same ones a plain `git commit` on the base would run.
- **Codex escalates up front.** In Codex, `iterate` requests sandbox escalation for the `commit create` call before making it. This is new behaviour: no escalation rule exists today. A `SANDBOX_DENIED` despite the escalation ends the item with `ABORT` and diagnostics, without a retry.
- **review gets a persistence gate plus a combined operation.** An explicit gate in `review`'s always-loaded core names each review path's persistence step. It says that no finding is presented in chat or published before its IDs are reserved and its artifact exists. A new allowlisted operation, `review open-report`, reserves the IDs and allocates the local report path in one call. The model then writes the report itself.
- **The call-shape rule covers all three JSON helpers, with argv hardening and read-only allow rules.**
  - The literal shape and its contract test extend to `config-resolve.mjs` and `remote-tracker.mjs`.
  - `remote-tracker.mjs` rejects any argv except `<operation>` or `<operation> --apply`, and rejects `--apply` on an operation that is not a mutation.
  - `setup allowlist` additionally writes allow rules for `config-resolve.mjs resolve` and for every read-only `remote-tracker.mjs` operation, never for a mutation or a local write.
- **A missed criterion gets one fix round, then a hook package.** If the realistic measurement misses the criterion, one targeted fix round and one re-measurement follow. If that also misses it, the criterion counts as blocked: the plan is not marked implemented, and a narrow PreToolUse hook is added to the concept as a follow-up work package. This package ships no hook.

**Workflow rationale:** Feature. It adds two shipped helper operations, a new class of allow rules and a stricter argv contract, and it changes the commit and report behaviour of `iterate` and `review`.

## Architecture decisions

- **Structure over prose for multi-step housekeeping.** The prose already required the lock and the report, and realistic runs skipped both. Collapsing a sequence into one call makes it the cheapest path. It also moves the mechanical checks into code, where they can't be skipped one at a time: the clean index, the exact staged set, the staged content and lock ownership.
  - Prose keeps the judgment steps, the call itself, its outcomes and the rule that no other path exists. The judgment step is inspecting the item's diff before the call.
  - The staged-content check closes the gap that opens when that inspection moves out of the lock. `iterate` passes the blob OID it inspected for each path, `null` for a deletion. The helper compares these with the staged blobs, so a change between inspection and staging is detected rather than committed.
- **`commit create` lives in `effective-flow-state`, not in a new helper.** It reuses the existing lock core, owner-token check, path guard and argv contract, and it falls into the existing allow-rule family.
  - It takes the execution worktree as a separate field from `cwd`, which is the `RUNTIME_STATE_ROOT` that holds the lock, because an `iterate` item may commit in a linked worktree.
  - Its core, `effective-flow-state-commit-core.mjs`, is imported lazily by the dispatch, like the memory and harness cores, so the lock operations keep their current load graph.
- **The commit-lock contract is scoped, not deleted.** `src/shared/commit-lock-contract.md` stays shared with `apply-review-commit-mechanics`.
  - What `iterate` still needs is kept for it: the bounded wait on `LOCK_HELD`, the sibling re-dispatch, the foreign-owner and confirmed-break path, and tombstone reporting.
  - The contract gains one sentence: for `iterate`, "re-invoke `lock acquire`" and "the commit critical section" mean the unchanged `commit create` call. Its `LOCK_HELD` outcome carries the same owner and identity details as `lock acquire`, so the three-try wait still works.
  - The lines that describe steps the helper now performs internally are marked as applying to the prose sequence only. That is `apply-review`'s sequence and `iterate`'s `HOOKS_UNTRUSTED` fallback. The lines are `lock inspect` immediately before `git commit`, and "unstage only this unit's own staging".
  - The prose sequence `iterate` uses today moves into a lazy fragment, `iterate-commit-fallback`, loaded only on `HOOKS_UNTRUSTED`.
- **`review open-report` composes existing cores, it doesn't duplicate them.** It lives in a small `effective-flow-state-review-core.mjs` and is imported lazily.
  - It guards and creates `.effective-flow/review/` with the existing `ensureGuardedDirectory`, runs the `review-report-local` path allocation, and then runs the already exported `reserveMemory` transaction.
  - The helper fixes the directory itself, and passes the same time and time-zone sources the mechanics CLI uses, so the report date matches.
  - The allocation is imported from the narrowest module that owns it. If it lives in `effective-flow-mechanics-core.mjs` together with heavy imports (`plan-lint-core`, `delivery-selection-core`, `remote-tracker-shared-core`), it is first extracted into its own module, with no behaviour change, and both helpers import that module.
  - The path is computed first and the reservation second, so a failed allocation reserves nothing.
  - It doesn't write the report: report content stays with the model and `review-report-format`, and large Markdown bodies stay out of here-string JSON.
- **One canonical call-shape fragment for three helpers.** `src/shared/state-helper-call.md` becomes the helper-neutral `src/shared/helper-call-shape.md`. It defines the literal shape once, with the permitted argv per helper.
  - `iterate`, `apply-review-commit-mechanics`, `memory-state`, `setup-allowlist` and now `review` include it eagerly.
  - `config-migration` (config locator) and `remote-helper-contract` don't include it. `config-migration` is eager in about 13 tools, four of which have zero budget headroom, and a lazy pointer on a path every run takes saves nothing and depends on a lazy load being followed. Instead, each shows its own literal call line inline, followed by one sentence that bans a variable, pipe, trailing command and compound command.
  - The contract test names the new invariant: every shown call line of the three helpers is literal; every source that shows a state-helper call includes the fragment eagerly; and every source that shows a `config-resolve` or `remote-tracker` call carries the inline ban sentence.
- **The triviality exception says what it does not waive.** The exception's bullet in `src/shared/delegation-mandate.md` gains one clause: it waives delegation only, never a workflow step such as a reservation, a report, a lock or a commit. The clause stays in the same one-line bullet, so the fragment stays within its 16-line cap.
- **Read allow rules are a closed, classified list.** The allowlisted `remote-tracker` operations are an explicit list in `claude-settings-core.mjs`.
  - A unit test asserts that none of them is in `remote-tracker-core.mjs`'s `MUTATIONS` set or in a declared local-write set (today only `thread-ledger-record`).
  - `thread-ledger-lookup` is a local read of runtime state. It is listed: it writes nothing, and the hidden-mode `iterate` path reads its ledger through it.
  - It also asserts that every `remote-tracker` operation is classified as either listed or excluded, so a new operation fails the test until someone classifies it.
  - The argv hardening is what makes a trailing `*` in these rules safe, exactly as for the state helper.
- **The criterion's sub-class grows with the operations.** "Helper housekeeping" now includes `commit create` and `review open-report`. The two read helpers are reported in a separate "helper reads" sub-class, which is measured and reported but doesn't decide the criterion.

## Affected files

| File                                                                                                                                                   | Description                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/effective-flow-state-core.mjs`                                                                                                            | Register `commit create` and `review open-report` in the operation list, operation classes, input keys and allowlisted set; lazy dispatch to the two new cores.              |
| `src/scripts/effective-flow-state-commit-core.mjs` (new)                                                                                               | `commit create`: lock, clean-index check, exact staging, commit, verification, signal handling and release on every path.                                                    |
| `src/scripts/effective-flow-state-review-core.mjs` (new)                                                                                               | `review open-report`: path allocation, then the reserve transaction.                                                                                                         |
| `src/scripts/remote-tracker-shared-core.mjs` or a new redaction module                                                                                 | The existing redactor is importable by the state helper for hook and Git stderr.                                                                                             |
| `src/scripts/effective-flow-mechanics-core.mjs` and, if needed, a new allocation module                                                                | The `review-report-local` allocation is importable without the mechanics core's heavy imports, with no behaviour change.                                                     |
| `src/scripts/remote-tracker.mjs`                                                                                                                       | Closed argv: `<operation>` or `<operation> --apply`, `--apply` only for mutations, checked before stdin is read.                                                             |
| `src/scripts/remote-tracker-core.mjs`                                                                                                                  | Export the mutation and local-write classification that the argv check and the allow-rule test read.                                                                         |
| `evals/_scaffold/remote-tracker.mjs`                                                                                                                   | The eval stub mirrors the hardened argv, so the instrument behaves like the shipped helper.                                                                                  |
| `src/scripts/claude-settings-core.mjs`                                                                                                                 | New rule families for `config-resolve.mjs resolve` and the read-only `remote-tracker` list; extend widened-rule and never-allowlisted detection to both helpers.             |
| `src/scripts/effective-flow-state-harness-core.mjs`                                                                                                    | Write, preview and digest the extended rule set.                                                                                                                             |
| `src/scripts/setup-status-core.mjs`                                                                                                                    | `data.allowlist` judges `current`/`stale` against the extended set.                                                                                                          |
| `build.mjs`                                                                                                                                            | `RUNTIME_SCRIPT_FILES` gains the new cores (and the allocation module, if extracted); `CONTEXT_BUDGET_LINES` re-measured for every touched tool.                             |
| `evals/iterate/suite.config.mjs`, `evals/merge-gate/suite.config.mjs`, `test/execution-profile-contract.test.mjs`                                      | The new cores join the seeded script lists and the script inventory.                                                                                                         |
| `src/shared/state-helper-call.md` → `src/shared/helper-call-shape.md`                                                                                  | Helper-neutral literal shape with the permitted argv per helper; all includers renamed.                                                                                      |
| `src/shared/delegation-mandate.md`                                                                                                                     | One clause: the triviality exception never waives a workflow step.                                                                                                           |
| `src/shared/commit-lock-contract.md`                                                                                                                   | The `commit create` sentence for `iterate`; lines describing steps the helper now performs are scoped to the prose sequences.                                                |
| `src/shared/iterate-commit-fallback.md` (new, lazy)                                                                                                    | Today's prose commit sequence, loaded only on `HOOKS_UNTRUSTED`.                                                                                                             |
| `src/tools/iterate.md`                                                                                                                                 | Commit integrity reduced to the diff inspection, one `commit create` call per item, and outcome handling; the delegation handoff carries the call line, outcome map and ban. |
| `src/tools/review.md`                                                                                                                                  | Persistence gate per review path and task entry; `review open-report` in local mode; eager include of the call-shape fragment.                                               |
| `src/shared/memory-state.md`, `src/shared/review-state.md`                                                                                             | Name `review open-report` as the local-mode reservation path.                                                                                                                |
| `src/shared/config-migration.md`                                                                                                                       | The literal `config-resolve` call line plus its inline ban sentence.                                                                                                         |
| `src/shared/remote-helper-contract.md`                                                                                                                 | The literal `remote-tracker` call lines (read and `--apply`), the argv rule and the inline ban sentence.                                                                     |
| `src/shared/setup-allowlist.md`, `src/tools/setup.md`                                                                                                  | The rule families and the new rule count in the preview and the status.                                                                                                      |
| `src/tools/pr.md`, `src/tools/issue-buddy.md`, `src/shared/setup-profiles.md`, `src/shared/unattended-planning.md`, `src/shared/pr-review-comments.md` | Their `config-resolve` or `remote-tracker` call wording matches the literal shape.                                                                                           |
| `test/effective-flow-state-commit.test.mjs` (new), `test/effective-flow-state-review.test.mjs` (new)                                                   | Unit tests for both operations.                                                                                                                                              |
| `test/remote-tracker*.test.mjs`, `test/claude-settings*.test.mjs`, `test/effective-flow-state-harness.test.mjs`, `test/setup-status*.test.mjs`         | Argv hardening, rule families, classification completeness, rule count.                                                                                                      |
| `test/state-helper-call-contract.test.mjs` → `test/helper-call-shape-contract.test.mjs`                                                                | The new invariant (see Architecture decisions).                                                                                                                              |
| `test/delegation-mandate-contract.test.mjs`, `test/compare-native-agent-baseline.test.mjs`                                                             | Updated pinned wording of the exception bullet.                                                                                                                              |
| Further contract tests that pin the touched prose                                                                                                      | Updated to the new wording, each naming the invariant it protects.                                                                                                           |
| `docs/developer-guide/claude-code-allowlist-evidence.md`                                                                                               | New "Work package 8 measurement" section.                                                                                                                                    |
| `docs/developer-guide/architecture.md`, `configuration.md`, `build-system.md`                                                                          | The two operations, the rule families, the call-shape rule, the `commit create` risk statement.                                                                              |
| `docs/user-guide/` (setup and tool-flow pages that describe the allow rules)                                                                           | The extended rule set.                                                                                                                                                       |
| `docs/concept/2026-10-29-runtime-state-cli.md`                                                                                                         | The `commit create` risk under "Risks and open questions"; the work package 8 result; a hook work package only if the criterion stays blocked.                               |
| `.effective-flow/spikes/allowlist/<new run dir>/` (gitignored)                                                                                         | Harness copies with extended analysis and the rule-count assertion.                                                                                                          |

## Implementation details

### Approach

1. **`commit create`.**
   - **Input:**
     - `cwd`: the literal `RUNTIME_STATE_ROOT`
     - `worktree`: the absolute execution root
     - `lock`: `iterate-commit` in this package
     - `owner`: the existing `iterate-commit` owner fields
     - `paths`: a non-empty list of repository-relative paths
     - `expect`: one entry per listed path, holding the blob OID `iterate` inspected, or `null` for a deletion
     - `hookBase`: the base commit to compare hook configuration against (the PR base SHA in PR mode, the merge-base with the configured base branch in local mode)
     - `sameRepository`: whether the head comes from the same repository, taken from the PR read (`true` in local mode)
     - `message`: a non-empty string
     - `waitSeconds`: optional

     The closed key check rejects any other key.

   - **Validate before taking the lock** (`INVALID_INPUT`):
     - `worktree` is a registered worktree of the same Git common directory as `cwd`;
     - every path is relative, contains no `..`, resolves inside `worktree`, and is not below `.effective-flow/`;
     - the list has no duplicates, and `expect` names exactly the listed paths.
   - **Hook trust check, before the lock.** The outcome is `HOOKS_UNTRUSTED`, with the reason, when either of these holds:
     - `sameRepository` is `false`;
     - `HEAD` differs from `hookBase` in hook-relevant configuration;
     - the working tree differs from `HEAD` in hook-relevant configuration, which includes an item whose own paths change it.

     Hook-relevant configuration is a closed list in the commit core:
     - `.husky/`, `.githooks/`, `.pre-commit-config.yaml`, the `lefthook` configuration files, the `lint-staged` and `simple-git-hooks` configuration files;
     - the `husky`, `lint-staged`, `simple-git-hooks`, `scripts.prepare` and `scripts.postinstall` keys of `package.json`;
     - a `core.hooksPath` that points inside the worktree.

   - **Acquire the lock** with the existing protocol. `LOCK_HELD` stays an outcome and carries the same owner and identity details as `lock acquire`.
   - **Under the lock:**
     1. **Require an empty index.** Foreign staged state is an outcome, `INDEX_NOT_CLEAN`, and the helper touches nothing.
     2. **Stage exactly the listed paths** with literal pathspecs. Deletions and both sides of a rename are included. A failed `git add`, for example on an ignored path or a deleted path that was never tracked, unstages the listed paths and is an outcome, `STAGE_FAILED`, with the redacted stderr.
     3. **Check the staged set.** Read it with `git diff --cached --name-only --no-renames -z` and require it to equal the listed set. On a mismatch the helper unstages only the listed paths (`git restore --staged -- <paths>` or an equivalent), never the whole index. The outcome is `STAGED_SET_MISMATCH`, with both sets and whatever is still staged.
     4. **Check the staged content.** Every staged blob must equal its `expect` entry, and an `expect` of `null` must be a staged deletion. A mismatch unstages the listed paths and is an outcome, `STAGED_CONTENT_CHANGED`, with the differing paths.
     5. **Commit.** The message is passed as an argument through the process runner, never through a shell. Hooks run normally. The commit subprocess has a bounded timeout, and the commit uses the same Git environment a plain `git commit` in that worktree would use, with no stripped identity or signing configuration. A failed commit unstages only the listed paths and is an outcome, `COMMIT_FAILED`, with the redacted stderr.
     6. **Verify.** Read `HEAD`, and verify with `--no-renames -z` that the commit's changed paths equal the listed set and that the index is clean. A mismatch, for example a hook that changed the committed set, is an outcome, `COMMIT_UNVERIFIED`, carrying the SHA. The helper performs no amend, reset or rebase.
   - **Redaction.** Hook and Git stderr pass through the existing redactor, imported from `remote-tracker-shared-core.mjs` or extracted into its own module, and are capped in size.
   - **Sandbox denial.** A denied `.git` write, as in a Codex workspace-write sandbox, unstages the listed paths, releases the lock and is a distinct outcome, `SANDBOX_DENIED`. It is detected by errno and a closed stderr pattern list, and a unit test covers it. The helper never works around the sandbox.
   - **Termination.** On SIGINT, SIGTERM or SIGHUP the helper stops a running Git child and waits for it to exit, then reads `HEAD`.
     - If the commit landed, the envelope is `INTERRUPTED` with the SHA, and nothing is unstaged.
     - Otherwise the helper unstages the listed paths, and the envelope is `INTERRUPTED` without a SHA.

     In both cases it releases the lock. The handler extends the `forwardTermination` pattern of `remote-tracker.mjs` with SIGHUP.

   - **Release** the lock on every path. Every envelope where the lock may still be held carries the lock identity and `token`, so `iterate` can retry `lock release` once without a lock break. That covers a release failure after a successful commit (which still carries the SHA), `INTERRUPTED`, and `SANDBOX_DENIED`.
   - **Result:** `{commit, paths}`, plus `leftoverTombstone` from the internal release where present.
2. **`review open-report`.**
   - **Input:**
     - `cwd`
     - `owner`: `{workflow: "review"}`
     - `count`: 1..10000
     - `waitSeconds`: optional

     These are the closed keys. The helper fixes the report directory itself.

   - Guard and create `.effective-flow/review/`, compute the path, then run the reserve transaction.
   - It inherits the existing outcomes: `MIGRATION_REQUIRED`, `LOCK_HELD`, `LEGACY_MEMORY_INVALID` and the others.
   - **Result:** the reserve result plus `reportPath`, already checked by the guard. It writes no report file.
   - **Before writing the report**, `review` re-checks that `reportPath` is still absent, because no harness file tool is assumed to refuse an existing target. If it is present, the run re-allocates the path alone through `mechanics name-allocate` and keeps the reserved IDs. It never calls `review open-report` a second time, which would reserve a second range.
3. **Register both operations.** Add them to `STATE_OPERATIONS`, `STATE_OPERATION_CLASSES`, `OPERATION_KEYS` and `ALLOWLISTED_OPERATIONS`; the existing pinning test keeps these four sets consistent.
4. **`remote-tracker.mjs` argv.** Only `remote-tracker.mjs` needs hardening: `config-resolve.mjs` already rejects any argv other than one operation.
   - Accept only `[<operation>]` or `[<operation>, "--apply"]`, with the operation first.
   - `--apply` is accepted only for an operation in `MUTATIONS`.
   - Anything else fails with `INVALID_PAYLOAD` and the usage line, before stdin is read.
   - Empty stdin keeps parsing as `{}`.
   - The eval stub `evals/_scaffold/remote-tracker.mjs` mirrors the same check. Grep `src/`, `test/` and `evals/` for other argv uses and adapt them.
5. **Allow rules.**
   - Add `Bash(node <skillRoot>/scripts/config-resolve.mjs resolve *)`.
   - Add one `Bash(node <skillRoot>/scripts/remote-tracker.mjs <operation> *)` rule per listed read operation. The implementer derives the list from the operation dispatch:
     - remote read operations not in `MUTATIONS`;
     - pure local operations such as reference parsing, body hashing and receipt build or parse;
     - `thread-ledger-lookup`;
     - never `thread-ledger-record`, any local write, or any mutation.
   - Widened-rule detection treats a wildcard over either helper, or a rule for an excluded operation, exactly as it treats them for the state helper today: it warns and never removes. Its probe strings include `<mutation> --apply <<< '{}'` for every mutation and `thread-ledger-record <<< '{}'`, so a rule that admits the applied form is detected.
   - `setup allowlist` previews and writes the whole set under one digest. `setup status` reports `stale` for a project that has only the six work package 3 rules.
6. **Call-shape fragment.**
   - Rename the fragment and generalize it to `node <skill-root>/scripts/<helper>.mjs <argv> <<< '<json>'`, with the argv of each helper:
     - `effective-flow-state.mjs <group> <operation>`
     - `config-resolve.mjs resolve`
     - `remote-tracker.mjs <operation>` or `<operation> --apply`
   - Add the observed breakages to the forbidden list: a trailing `echo "exit=$?"` or any other trailing command, and `| grep` or any other pipe on the output. The exit status and the envelope are read from the tool result itself.
   - Keep the reason sentence: the allow rule matches only this shape, and the shape binds every harness.
7. **Owning fragments.**
   - `config-migration`'s locator shows `node <skill-root>/scripts/config-resolve.mjs resolve <<< '<json>'`, followed by the one-sentence inline ban.
   - `remote-helper-contract` shows the read line and the `--apply` line, followed by the same sentence.
   - Rewrite the other call sites listed under Affected files to say "the literal call" instead of "on standard input".
8. **`iterate`.** Replace the "Commit integrity for parallel items" sequence with these steps:
   1. **Pre-commit checks.**
   2. **Inspect the diff** of the item's paths (`git diff -- <paths>` plus untracked additions). Confirm that every hunk belongs to the item. Record the inspected content and each path's blob OID (`git hash-object`, or `null` for a deletion) in the wisdom file. The OIDs become the call's `expect`. This judgment step stays in prose, because the helper checks content identity, not which item a hunk belongs to.
   3. **One `commit create` call** per item. Set an explicit Bash timeout above the helper's commit-subprocess bound.
   4. **Handle the outcome:**
      - `LOCK_HELD`: follow the scoped commit-lock contract (bounded wait, sibling re-dispatch, foreign-owner and confirmed-break path).
      - `HOOKS_UNTRUSTED`: load `iterate-commit-fallback` and commit this item through today's prose sequence, which prompts in default mode. This is the only sanctioned commit path outside `commit create`.
      - `INDEX_NOT_CLEAN`, `STAGE_FAILED`, `STAGED_SET_MISMATCH`, `STAGED_CONTENT_CHANGED`, `COMMIT_FAILED`: `ABORT` with the reported sets.
      - `COMMIT_UNVERIFIED`: mark the item failed with its SHA, perform no amend, reset or rebase, and stop delivery for reconciliation. This is today's rule, kept.
      - `SANDBOX_DENIED`: `ABORT` with the diagnostics, with no retry, because escalation was already requested.
      - `INTERRUPTED`: report it, including the SHA when the commit landed.
      - An envelope that still holds the lock: retry `lock release` once with the returned token.
      - A `leftoverTombstone` is reported.
   5. **Record the commit** against its item in the wisdom file, using the returned SHA, together with any residual working-tree state of the item's paths.

   Then:
   - State that no `git add` or `git commit` for an item runs outside `commit create`, inline items included. The only exception is the `HOOKS_UNTRUSTED` fallback.
   - In Codex, `iterate` requests sandbox escalation for the `commit create` call up front. This rule is new.
   - Each item delegation receives the helper path, `runId`, `delegation <runId>/<n>` and the call shape verbatim, as today. It now also receives three things, also verbatim: the literal `commit create` call line, the outcome map above, and the ban on other commit paths. A contract test asserts that the handoff text carries them.

9. **`review`.**
   - **Persistence gate.** Add a short gate in the always-loaded core, at the point where findings are first presented. It names each path:
     - **Local mode:** with at least one admitted finding, call `review open-report` and write the report to `reportPath` before any finding appears in chat.
     - **Publishing target:** reserve through `memory reserve` before any tracker write. The local artifact there is only the security report, as today.
     - **Pull-request special case:** reserve through `memory reserve` before anything is published onto the PR. There is no local report.
     - **Plan-file and concept-file special cases:** no IDs and no report, and the gate says so explicitly.
     - **Standalone-audit appendix only:** with no admitted finding but an eligible appendix entry, local mode allocates the path alone through `mechanics name-allocate`, reserves nothing, and writes the appendix-only report, as today.
     - **No admitted finding and no appendix entry:** nothing is reserved or written on any path, as today.
   - The publishing target's security report keeps its reference to the directory-guard and collision mechanics. Those mechanics now stay described where that reference points, and never imply a second `review open-report` call.
   - Add "Reserve IDs and persist the findings" as its own task in the phase task list.
   - Extend the completion condition: the run is incomplete while an admitted finding has no reserved ID, or, in local mode, no report entry.
   - Reword local mode Phase 4 step 2 to the single call plus the pre-write re-check from step 2.
   - Include the call-shape fragment eagerly.
10. **Triviality clause and budgets.**
    - Add the triviality clause and update the pinned tests.
    - Re-measure `CONTEXT_BUDGET_LINES` from `node build.mjs` for every touched tool, at its built count plus up to ten lines.
11. **Documentation.** Update the developer and user guides listed under Affected files. Add the `commit create` risk to the concept's "Risks and open questions".
12. **Measurement.** This runs after CI is green, inside the build run and before delivery; see "Measurement procedure".
13. **Record the result.** Write the evidence section and the concept's work package 8 result. If the criterion is blocked, add the hook work package to the concept.

### Measurement procedure

- **Setup:**
  - Copy the stage 1 harness (`.effective-flow/spikes/allowlist/2026-10-29-02/`) into a new run directory.
  - Extend `reset.sh` to assert the new rule set instead of six rules.
  - Extend the analysis:
    - "Helper housekeeping" also matches `commit create` and `review open-report`.
    - A new "helper reads" sub-class covers `config-resolve.mjs` and `remote-tracker.mjs` calls.
    - Literal-shape scoring applies to all three helpers.
  - Rebuild `dist/` and point the sandbox `home-wp3` skill link at the portable build.
- **Authentication:** the dedicated token file `~/.config/ef-spike/claude-oauth-token`, as in work package 3. It is never echoed, logged or written to evidence.
- **Cells:** neutral prompts in the round 2 style, which never name a step:
  - `review` on seeded uncommitted defects;
  - `iterate` on a seeded sandbox PR with review threads;
  - the migration cell on a seeded legacy layout.

  Each cell runs 3 times in default mode and 3 times in auto mode: 18 valid runs, an estimated 10 to 15 USD.

- **Exercised means:**
  - `review`: `review open-report` succeeded, the report exists with the reserved IDs, and `lastFindingNumber` is persisted.
  - `iterate`: every item commit came through `commit create`, and at least one item commit happened.
  - Migration: `memory migrate-directory` ran and the marker is set.
- **Invalid runs:**
  - a `review` run that admits no finding;
  - an `iterate` run that implements no item, for example because it classified every thread as not to be changed.

  These are invalid, not unexercised. An invalid run is repeated at most twice per cell; after that the cell counts as not exercised for that run.

- **Criterion (concept work package 8):** each of `review`, `iterate` and the migration is exercised in at least 2 of 3 valid runs per mode, and "helper housekeeping" shows 0 prompts and 0 auto-mode refusals across all valid runs. Literal-shape compliance and "helper reads" prompts are reported for all three helpers but don't decide the criterion.
- **What the measurement doesn't cover:** the `review` cell is local mode only, so the publishing-target and pull-request gates are covered by contract tests alone. The sandbox PR is same-repository, with no hook configuration changes, so `HOOKS_UNTRUSTED` is covered by unit tests alone. The evidence section states both limits.
- **On a miss:** one targeted fix round, aimed at the cause the runs show, then one re-measurement. A second miss blocks the criterion: the plan stays not implemented, and the concept gains a narrow PreToolUse hook work package. The PR stays a draft, and the decision goes back to the user.

### Component structure

Not relevant: no UI.

### State management

- **`commit create`** holds `iterate-commit.lock` with the existing on-disk protocol. It changes Git state only inside the execution worktree, and it unstages only the paths it staged itself.
- **`review open-report`** changes `memory.json` only through the existing reserve transaction.

### API integration

Not relevant: no forge API changes. The argv hardening of `remote-tracker.mjs` is a stricter CLI contract, and its envelopes are unchanged.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **A path in `paths` that has no change:** the staged set misses it, so `STAGED_SET_MISMATCH` fires and the listed paths are unstaged.
- **A rename:** both the old and the new path must be listed. With `--no-renames` they appear as a deletion and an addition, so the set check matches.
- **A path that is absolute, contains `..`, lies outside the worktree, or lies below `.effective-flow/`:** rejected before the lock is taken (`INVALID_INPUT`).
- **`worktree` from another repository, or not registered:** rejected before the lock is taken.
- **Foreign changes staged by the user or by an `apply-review` unit holding its own lock:** if present before the call, `INDEX_NOT_CLEAN`. If they appear during the call, they show up in the staged set and give `STAGED_SET_MISMATCH`; only the listed paths are unstaged, and the foreign changes stay staged.
- **A sibling item or a formatter changes an item's file between inspection and the call:** the staged blob no longer matches `expect`, so `STAGED_CONTENT_CHANGED` fires and nothing is committed.
- **A fork PR, or a PR that changes `.husky/` or the `lint-staged` key:** `HOOKS_UNTRUSTED` before the lock, then the prompting fallback.
- **An item whose own change touches hook configuration:** `HOOKS_UNTRUSTED` through the working-tree check, for the same reason.
- **A pre-commit hook that fails:** `COMMIT_FAILED`. A hook that changes the committed set gives `COMMIT_UNVERIFIED`, with the SHA.
- **A slow hook:** the commit subprocess's timeout ends it and gives `COMMIT_FAILED`. `iterate`'s Bash timeout is above that bound, so the helper reports before the harness kills it.
- **A killed call:** on a catchable signal, `INTERRUPTED`, with the SHA if the commit landed. A SIGKILL leaves the lock to the existing orphan-break path, because the owner carries `pid: null`. This limitation is stated, not solved.
- **A commit message containing `'`:** escaped as `'\''` per the shape rule; JSON escaping covers newlines.
- **Lock held past `waitSeconds`:** `LOCK_HELD`, handled per the commit-lock contract. `iterate` falls back to `git commit` only on `HOOKS_UNTRUSTED`, never on `LOCK_HELD`.
- **`review open-report` on a legacy layout:** `MIGRATION_REQUIRED`. The existing prerequisite runs `memory migrate-directory`, and the call is repeated.
- **`reportPath` taken by a concurrent review:** path-only re-allocation, with the reserved IDs kept.
- **`remote-tracker.mjs pr-read --apply`:** rejected, because `pr-read` is not a mutation. `remote-tracker.mjs --apply pr-merge` is rejected because the operation isn't first.
- **A project with only the six work package 3 rules:** `setup status` reports `stale`, and `setup allowlist` previews the extended set. Until then, calls of the new operations prompt; they are never wrongly approved.
- **Codex and portable runs outside Claude Code:** they get no allow rules, but the shape rule, the argv hardening and both operations apply unchanged. In Codex, `iterate` escalates up front. A `SANDBOX_DENIED` despite that ends the item with `ABORT` and diagnostics.
- **Hidden mode:** `review open-report` honours the hidden-mode report location exactly as the allocation does today. `commit create` refuses runtime-state paths outright.

## Acceptance criteria

- [x] `commit create` is shipped, allowlisted and covered by unit tests against temporary Git repositories. The tests cover:
  - success with modified, added, deleted and renamed paths;
  - `INDEX_NOT_CLEAN`;
  - `STAGE_FAILED`;
  - `STAGED_SET_MISMATCH`, with only the listed paths unstaged and foreign staged changes preserved;
  - `STAGED_CONTENT_CHANGED` when a file changes after its `expect` OID was taken;
  - `HOOKS_UNTRUSTED` for `sameRepository: false`, for each class of hook-relevant configuration changed against `hookBase`, and for a working-tree change to it;
  - `COMMIT_FAILED` from a failing hook and from the subprocess timeout;
  - `COMMIT_UNVERIFIED` from a hook that changes the committed set;
  - `SANDBOX_DENIED` from a simulated read-only `.git`;
  - `INTERRUPTED` on SIGTERM, both before the commit and while it runs, with the SHA when it landed and the lock released;
  - `LOCK_HELD`, carrying owner and identity details;
  - invalid, `.effective-flow/` and foreign-worktree paths rejected before the lock;
  - lock release on every path, and the token returned wherever the lock may still be held;
  - redacted, size-capped stderr.
- [x] `review open-report` is shipped, allowlisted and covered by unit tests. The tests cover:
  - reserve plus a guarded path in one call, in a fresh repository without `.effective-flow/review/`;
  - no reservation when the allocation or the directory guard fails;
  - the report date matches the mechanics CLI's for the same clock and time zone;
  - the inherited `MIGRATION_REQUIRED` and `LOCK_HELD` outcomes.
- [x] `remote-tracker.mjs` and the eval stub reject every argv except `<operation>` or `<operation> --apply`, and reject `--apply` on a non-mutation, before stdin is read. Unit tests pin this.
- [x] `setup allowlist` writes the extended rule set. A unit test proves that every listed `remote-tracker` operation is neither a mutation nor a local write, and that every `remote-tracker` operation is classified. `setup status` reports a six-rule project as `stale`.
- [x] The call-shape contract test enforces the invariant stated under Architecture decisions for all three helpers.
- [x] A contract test pins `iterate.md`:
  - it contains no commit path for an item outside `commit create` except the `HOOKS_UNTRUSTED` fallback;
  - it maps every `commit create` outcome;
  - its item-delegation handoff carries the call line, the outcome map and the ban verbatim;
  - the commit-lock contract carries the `commit create` sentence.
- [x] A contract test pins `review.md`: it carries the per-path persistence gate, including the appendix-only path, the task entry and the extended completion condition.
- [x] The exception bullet in `delegation-mandate.md` states that it never waives a workflow step, and the fragment stays within its line cap.
- [x] CI's order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution`. Every touched `CONTEXT_BUDGET_LINES` entry is re-measured.
- [x] The realistic measurement meets the work package 8 criterion, as defined under "Measurement procedure", within at most one fix round. The result is recorded in `docs/developer-guide/claude-code-allowlist-evidence.md`, and the concept records the work package 8 result.
  - 2026-11-01: blocked — after the one fix round, `review` auto (1/3) and the migration cell (1/3 per mode) still miss the 2-of-3 bar, while helper housekeeping shows 0 prompts and 0 refusals; decision: deliver blocked; follow-up work package 9.
  - 2026-11-01: met through work package 9 — after `review write-report` and its in-call migration, round 4 of `docs/developer-guide/claude-code-allowlist-evidence.md`, "Work package 9 measurement", exercised `review` and the migration in 3 of 3 runs per mode with 0 housekeeping prompts and 0 refusals; `iterate` met the criterion in this plan's own measurement.

## Validation plan

- Unit tests for both operations, including the interrupt and sandbox-denial paths, the argv hardening, the rule families and their classification, and `setup-status`.
- Contract tests for the call shape, the `iterate` commit path and outcome mapping, the `review` gate, and the exception bullet.
- CI's order through `corepack pnpm`, because bare `pnpm` is not on `PATH` in this environment.
- `pnpm test:distribution`, to show the new cores in every target.
- The realistic measurement of 18 valid runs, with its analysis output and manifest hash recorded in the evidence document.

## Assumptions and open points

- **The `iterate` and `merge-gate` eval suites need a re-recorded round before the next release.** Their instruments hash `iterate.md`, `delegation-mandate.md`, the call-shape fragment, `config-migration.md`, `remote-helper-contract.md`, the eval stub and the seeded state-helper scripts. This package doesn't record that round. `review.md` is in no suite.
- **`apply-review-commit-mechanics` keeps its prose sequence.** Moving it to `commit create` is a natural follow-up, but it isn't part of this package.
- **`commit create` doesn't check for AI attribution.** The message is passed through unchanged; the commit rules stay in prose.
- **The read helpers' call shape is not part of the criterion.** The concept's criterion counts only housekeeping, and the user chose to keep it that way. The prompts and shape compliance of `config-resolve` and `remote-tracker` are measured and reported so that a later decision has data.
- **The measurement reuses the work package 3 sandbox resources.** These are the sandbox repository `fastner/ef-allowlist-sandbox`, its token and the dedicated OAuth token. Their cleanup stays deferred until after work package 4.
- **A SIGKILL during `commit create` is not handled.** It leaves the lock to the existing orphan-break path; detecting a crashed holder is out of scope.
- **`sameRepository` and `hookBase` come from `iterate`.** The helper can't read the forge, so it trusts the caller's values from the PR read. A wrong value can only weaken the hook trust check. It never widens the paths `commit create` commits.
- **The hook-relevant list is closed and can miss a hook manager.** A manager it doesn't name runs unprompted when its configuration changes. Extending the list is a code change with a test, not a configuration option.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    0 |
| Security        |        0 |         1 |    1 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         6 |    0 |
| Testability     |        0 |         0 |    3 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        0 |         1 |    1 |

### Findings

- **Security, Important.** Allowlisting `commit create` widens the allow family from runtime state to Git history and repository hooks. Incorporated: the user confirmed the allow rule, and the risk and its limits are stated in the Requirement, the docs and the concept.
- **Error cases, Important.** Restoring the whole index on a failure could unstage foreign changes. Incorporated: only the listed paths are unstaged.
- **Error cases, Important.** Rename detection and quoted paths would break the set check. Incorporated: `--no-renames -z`, plus the `STAGE_FAILED` outcome.
- **Error cases, Important.** A failed post-commit verification had no outcome. Incorporated: `COMMIT_UNVERIFIED`, mapped to today's rule of failing the item and stopping delivery.
- **Architecture, Important.** Dropping the commit-lock contract would lose the `LOCK_HELD` handling. Incorporated: the contract is scoped, not deleted, and `leftoverTombstone` is returned.
- **Error cases, Important.** The Codex sandbox denial was unhandled. Incorporated: `SANDBOX_DENIED` and up-front escalation.
- **Error cases, Important.** A long hook or a killed call could strand the lock. Incorporated: the `INTERRUPTED` path and its test; SIGKILL documented as out of scope.
- **Gap (Maintainability), Important.** Hunk inspection and residual-state recording would silently disappear. Incorporated: both stay in `iterate`'s prose around the call.
- **Error cases, Important.** A repeated `open-report` would burn an ID range, and existing-file refusal was assumed. Incorporated: path-only re-allocation and a pre-write re-check.
- **Scope, Important.** The gate ignored the plan, concept and pull-request paths of `review`. Incorporated: the gate names each path.
- **Architecture, Important.** A lazy pointer in `config-migration` would load on every run, and the pinned invariant was weakened. Incorporated: an inline ban sentence and a restated invariant.
- **Testability, Note.** The new cores were missing from the lazy-import rule, the eval seed lists and the script inventory, and the placement of the allocation was open. Incorporated.
- **Testability, Note.** The shape goal had no measure. Incorporated: the user narrowed the goal.
- **Testability, Note.** There was no validity rule for `iterate` runs and no repeat cap. Incorporated.
- **Scope, Note.** The delivery sequence around the measurement was unstated. Incorporated: the measurement runs before delivery, and a blocked criterion keeps the PR a draft.
- **Maintainability, Note.** `pr-review-comments.md` and the eval stub were missing. Incorporated.
- **Security, Note.** Paths below `.effective-flow/` could be committed. Incorporated: they are rejected before the lock.

### Deep review (2026-10-31)

**Result:** Approved

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         1 |    1 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         5 |    1 |
| Testability     |        0 |         0 |    2 |
| Scope           |        0 |         1 |    2 |
| Maintainability |        0 |         1 |    0 |

- **Error cases, Important.** Moving the hunk check out of the lock let a sibling's change slip into an item's commit. Decided by the user: `expect` blob OIDs and `STAGED_CONTENT_CHANGED`.
- **Security, Important.** A PR head can bring its own hook code, and in a fork PR that is third-party code, which the allowlisted call would run unprompted. Decided by the user: `HOOKS_UNTRUSTED` for fork heads and for hook-relevant configuration changes, with a prompting prose fallback.
- **Error cases, Important.** An interrupt during a running commit, a missing subprocess timeout and the Bash tool timeout were unhandled. Incorporated: wait for the child, re-read `HEAD`, a bounded commit timeout, an explicit Bash timeout, and SIGHUP.
- **Error cases, Important.** The lock token was lost when the internal release failed. Incorporated: the token and lock identity are returned wherever the lock may still be held.
- **Architecture, Important.** The scoped commit-lock contract still described `lock acquire` for `iterate`. Incorporated: the `commit create` sentence and owner details on `LOCK_HELD`.
- **Error cases, Important.** `review open-report` left the directory guard in prose, and the security report referred back to it. Incorporated: the operation guards and creates the directory, the closed keys are fixed, and the back-reference is kept.
- **Scope, Important.** The gate contradicted the standalone-audit appendix path. Incorporated: path-only allocation for that case.
- **Error cases, Important.** The Codex escalation was described as existing behaviour, and the retry rule contradicted it. Decided by the user: escalate up front only; `SANDBOX_DENIED` aborts, detected by errno and a stderr pattern list, with a unit test.
- **Maintainability, Important.** Item delegations would not see the `commit create` contract. Incorporated: the handoff carries the call line, outcome map and ban, pinned by a contract test.
- **Testability, Note.** The goal claimed the shape was enforced. Incorporated: reworded to "required", with the residual exposure stated.
- **Security, Note.** Widened-rule detection lacked `--apply` probes. Incorporated.
- **Scope, Note.** `thread-ledger-lookup` was unclassified. Incorporated: listed as a read.
- **Data protection, Note.** The source of the redactor and a size bound were unspecified. Incorporated.
- **Error cases, Note.** The Git environment and the report time-zone source were unspecified. Incorporated.
- **Scope, Note.** Two planned changes were already done: `reserveMemory` is exported, and `config-resolve` already rejects extra argv. Incorporated: the affected rows were dropped or reworded.
- **Testability, Note.** The publishing-target and pull-request gates, and `HOOKS_UNTRUSTED`, are not measured realistically. Incorporated: stated as a limit of the measurement.

## Implementation notes

- **`hookBase`** is the full SHA of a merge-base, not the PR base SHA the plan named, because `pr-read` returns no base SHA. In PR mode it is `git merge-base HEAD origin/<base>` after an explicit `git fetch origin <base>`; in local mode it is the merge-base with the local diff base. `sameRepository` comes from the Phase 1 PR read, `false` when absent and `true` in local mode.
- **husky v9:** the directory `.husky/_/`, which husky regenerates on every install, is exempt from the hook-relevant list; every other change under `.husky/` still gives `HOOKS_UNTRUSTED`.
- **`HOOKS_UNTRUSTED` in delegated items:** an item delegation returns the outcome instead of committing, and the orchestrator runs the prompting fallback from `iterate-commit-fallback`.
- **Allocation extraction:** the `review-report-local` allocation moved from `effective-flow-mechanics-core.mjs` into `src/scripts/dated-name-allocation.mjs`, with no behaviour change. Both helpers import it, and `RUNTIME_SCRIPT_FILES` lists it.
- **53 allow rules:** 8 `effective-flow-state.mjs` operations (lock acquire, release and inspect; memory reserve, set-marker and migrate-directory; commit create; review open-report), `config-resolve.mjs resolve`, and 44 read-only `remote-tracker.mjs` operations, `thread-ledger-lookup` included.
- **Stale semantics:** `setup status` reports `stale` for any partial set, the six work package 3 rules included, and `absent` only when none of the rules is present.
- **`gitCommitEnv`:** `commit create` runs `git commit` with the environment a plain `git commit` in that worktree would see. Identity, signing, `GIT_CONFIG_*` and locale stay; only the repository-redirecting variables are removed, and `GIT_TERMINAL_PROMPT=0` is set.
- **Sandbox detection:** after a failed Git step, `SANDBOX_DENIED` is detected by a closed stderr pattern list and by write probes into the worktree's Git directory and the object store (an `EPERM`, `EACCES` or `EROFS` on an exclusive create, removed at once).
- **`heldLock`:** every envelope where the lock may still be held carries `heldLock` (`lock`, `path`, `token`, `identity`) and `lockRelease`. It may sit at `result`, `outcome` or `error`, and `iterate`'s outcome handling covers all three.
- **Review `## Goal` rule (fix round):** after measurement round 1, a bold persistence rule under `## Goal` in `src/tools/review.md` states that an inline review of a small change still reserves and persists before presenting any finding. The `review` budget is 836 lines.
- **Accepted deviation from the plan:** the blocked criterion leads to a structural follow-up (work package 9 in the concept), not to the narrow PreToolUse hook the plan named. A hook addresses prompts, not skipped steps, and housekeeping prompts were already 0.

## Test results

- `corepack pnpm test`: 3335 tests, 3332 pass, 0 fail, 3 skipped.
- `corepack pnpm agent:check`, `node build.mjs` and `corepack pnpm test:distribution`: green.
- Behavioural evals: the `iterate`, `merge-gate` and `next-steps` suites are stale against this tree and owe a re-recorded round before the next release.
- Realistic measurement: criterion blocked, see `docs/developer-guide/claude-code-allowlist-evidence.md`, "Work package 8 measurement" (manifest SHA-256 `d702b78b185b538657ff69f5ae0d9356ccf9be93462308adcc28e793bbb1659a`).

## Review findings

**Date:** 2026-11-01
**Reviewer:** Node.js reviewer, generic product reviewer, re-review

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    27 |
| Open / Not implemented |     0 |

F22 and F23 were closed without a change: F22 (the `mechanics name-allocate` call shape) is outside this package's scope, and F23 (the repeated inline ban sentences) is the design the plan chose for `config-migration` and `remote-helper-contract`.

## Open points

- No open points.
