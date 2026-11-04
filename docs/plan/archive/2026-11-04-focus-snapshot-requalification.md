# focus snapshot requalification on the develop head (WP2a of #613)

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Documentation (`effective-flow docs`)
**Doc category:** developer-guide
**Target path:** docs/developer-guide/focus-host-acceptance.md

## Requirement

This plan implements WP2a of issue #613, as defined in the approved #613 planning comment.

WP1 (`2b1e0f4`, #620) changed files whose SHA-256 digests bound the D snapshot qualification of `focus`. That qualification covers the T3 observed, report-only path, which is the only executable `focus` path. `docs/developer-guide/focus-host-acceptance.md` therefore marks the D binding as superseded with requalification pending. Until an operator records a new snapshot qualification, the page does not qualify the current source for release. WP2a is the release blocker; the follow-up qualification (WP2b) is not.

WP2a records one new phase, **E**, on the current `develop` head. It also writes the owner-approved binding-drift rule and the release duties into the page. The deliverable changes developer-guide and user-guide documentation only, so the workflow is Documentation.

Roles:

- **Operator:** the developer who swaps the skill slot, creates the throwaway threads, pastes the scripts, and checks the T3 UI.
- **Observer O1:** a top-level throwaway T3 Code thread on the Codex harness. It runs the positive snapshot and the self-refusal case.
- **Parent P and delegated observer O2:** P is a top-level throwaway Codex thread. O2 is its delegated child and runs the ancestor-refusal case against P.
- **Target T:** a top-level throwaway Codex thread with a synthetic multi-step task and an explicit goal.
- **Analysis leaf L:** the one child O1 creates for its verdict in R1. It is not registered, never read by the orchestrator, and outside the thread cap. Its model, effort and verdict come only from O1's `delegate_task` call and its `task_status` or result items.
- **Throwaway project** (owner decision): T, O1, P, O2 and L live in a dedicated T3 project rooted at `{project-root}`. This is an absolute directory outside every Git repository, for example `$HOME/t3-scratch/{run-id}/`; preflight confirms that `git -C {project-root} rev-parse` fails there. Threads are created on that project root without their own worktree, which the registration metadata read confirms.
- **Orchestrator:** the `effective-flow docs` session that runs this plan, in **T3 Code on the Claude harness** (owner decision). It is none of the above. It reads registered threads only through `t3_thread_read` and never sends to them.
  - The #613 comment says WP2a runs "in a T3/Codex session". This plan deliberately deviates: only the observers and the target run on Codex.
  - The Codex slot swap would otherwise feed a Codex orchestrator a mix of release and candidate fragments. The Claude harness loads its own slot under `$CLAUDE_CONFIG_DIR/skills` (here `~/.claude-eg/skills`), which the swap does not touch.

## Outcome checkpoint

**Primary source:** sebastian-software/effective-flow#613 (WP2a)
**Original outcome:** A passing, candidate-bound snapshot requalification of the T3 observed, report-only `focus` path on the current `develop` head. It includes explicit self and ancestor refusal and is merged before the next release PR merges.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** an operator-run phase E following the D format, with the candidate's portable build swapped into the Codex skill slot and restored afterwards, a Claude-harness orchestrator, and the binding-drift rule written into the acceptance page
**Continuation decision:** none

## Architecture decisions

- **Phase E follows the D format** ("D requalification after the guard correction"):
  - candidate binding;
  - digest table;
  - a narrative of the run;
  - a read ledger with the columns Call, Native selection, Charged upper bound and Result, plus totals;
  - the leaf model and verdict;
  - the send state;
  - the limitations.

  E stays comparable with D, and the matrix row cites one phase.

- **Candidate.** The fetched `origin/develop` head when the operator starts, which must be a descendant of `2b1e0f4`.
  - Build it in a scratch checkout with `git worktree add --detach <scratch path> <SHA>`. This checkout is not part of the lifecycle contract, which needs a branch. It is registered in the evidence register and removed with `git worktree remove` in step 8.
  - `<scratch path>` is the absolute path `{root}/candidate`. It lies under the gitignored evidence root, outside `.effective-flow/.worktrees` and outside the docs session's worktree base.
  - Before building, run `t3-project doctor` and `t3-project inspect --worktree <scratch path>`. A fresh scratch worktree has no binding, so `t3-project prepare --worktree <scratch path> --definition <recipe of the current effective-flow-node24 revision>` follows, logged in the runtime's private 0700/0600 log pattern. The build then runs `t3-project exec --environment effective-flow-node24 --worktree <scratch path> -- node build.mjs`. E records the version stamp the build used: the short SHA, or the `nogit` fallback.
- **Seven-entry digest table** (owner decision in #613). It covers:
  - `src/tools/focus.md`, `src/shared/focus-session-contract.md`, `src/shared/focus-follow-up.md`, `src/shared/retro-native-sources.md` and `build.mjs`;
  - the built `dist/portable/effective-flow/tools/focus.md` and `dist/portable/effective-flow/shared/focus-follow-up.md`.

  E also states whether the built portable `shared/retro-native-sources.md` matches its source digest, as D did.

- **Slot swap** (owner decision: copy, then restore). The Codex skill slot is `~/.agents/skills/effective-flow`. It is a DALO-managed symlink into the DALO store, which it shares with the Claude slot.
  - **Before the swap,** the operator records whether the slot is a symlink, its exact link target string, and the tree digest of that target.
  - **Tree digest** means `(cd <dir> && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum) | sha256sum`, computed the same way before the swap and after the restore.
  - **Install.** They `mv` the link itself, never its target, into the evidence root. They assert that the slot path is now free (`test ! -e` and `test ! -L`), then copy `dist/portable/effective-flow/` into it.
  - **During the swap,** no `dalo sync` or update runs. Preflight checks `dalo autosync status -g --json` and stops unless it shows no installed scheduler job. Preflight also records the exit code of `dalo status --check -g --json` and the digest of its output, and stops before the install unless the result is clean. After the restore, both must equal this baseline.
  - **Restore** removes the copied directory and moves the link back.
  - **The orchestrator verifies:**
    - the installed `tools/focus.md` and `shared/focus-follow-up.md` digests, and an empty `diff -r {scratch}/dist/portable/effective-flow ~/.agents/skills/effective-flow`, before R1 and after R3;
    - after the restore, the identical link target string and target tree digest;
    - a clean `dalo status --check -g`, which is a read-only state check. `dalo sync` is never run, because it refreshes the shared DALO store.
  - **Provider restart** (owner decision). The operator restarts the T3 Codex provider after the install and before step 3, and again after the restore, so no long-lived Codex process keeps the previously resolved skill.
  - **From the install on,** `RESTORE.md` in the evidence root holds the exact restore commands. Any stop after the install restores the slot first, and the orchestrator verifies the restore before anything else.
- **Host settings like D** (owner decision): T3 Code through the Codex harness, `full-access`, default interaction mode, observer effort high. E records the model and the T3 and harness versions where the host shows them, otherwise "unavailable", as D did.
- **Explicit refusal runs** (owner decisions). Besides the positive run R1, two separate `focus` invocations prove the refusals:
  - R2 is O1 on its own reference.
  - R3 is O2 on its parent P. The invocation reaches O2 as its delegation task: P creates O2 through `delegate_task` with the task text `$effective-flow focus <P-ref>` verbatim, the title `<run-id> O2`, provider `codex`, and runtime mode inherited. E records that this invocation arrived as a delegated task rather than a typed turn.
  - O2's ID comes from P's registered activity or the operator's link, never from a listing. A child that is not on Codex counts as "no delegated child".
- **Load proof.** R1 counts only when O1's activity shows a read of the slot's `tools/focus.md` during R1, and of `shared/retro-native-sources.md` when the reader branch is reached. Without such a host-visible read, E records the load as unverified and R1 fails.
- **Evidence root and register**, following the WP0 pattern:
  - The root is `<RUNTIME_STATE_ROOT>/.effective-flow/spikes/focus-requalification/<run-id>/`, which is gitignored. `<run-id>` is `fsr-<MMDDHHmm>`.
  - It holds:
    - the register of O1, P, O2, T and the scratch checkout, with real IDs;
    - the numbered scripts and `RESTORE.md`;
    - the slot link backup;
    - read excerpts and UI notes;
    - a SHA-256 manifest. It is written last, after step 8. It excludes `slot-backup/` (the register records both `readlink` strings and both tree digests) and is checked with `sha256sum -c` as the final evidence step.
  - Before anything is written, preflight confirms that the evidence root is gitignored and untracked, and stops otherwise.
  - The orchestrator registers a thread only after a metadata read confirms the `<run-id>` name prefix and the Codex provider instance. It never lists threads, and it checks the register before every read.
  - O2's registration metadata read is itself an O2 read. It, and every other O2 read, happens only after P's activity shows that P received O2's result, so no read changes O2's result delivery.
  - The orchestrator waits only with `t3_thread_wait` on registered top-level threads (T, O1, P), never on O2 or L.
- **Caps:** 4 registered threads plus 1 replacement (L is not counted), 2 attempts at R1, and 2 hours from install to restore.
- **Setup-invalid attempts.** A second R1 attempt is allowed only after a setup-invalid first attempt. It uses a fresh replacement O1, and R2 then runs in that replacement. Setup-invalid means:
  - a wrong provider or model;
  - T not ready;
  - an operator paste error;
  - a load proof that shows a path other than the slot, even after the provider restart (owner decision).

  Any `focus` behaviour failure records E as failed, with no retry.

- **Publication rule.**
  - The page uses only the pseudonyms O1, P, O2 and T, call numbers, positions, timestamps and digests.
  - The install path appears only as `~/.agents/skills/effective-flow`.
  - Thread IDs, links, titles, raw task content and absolute home paths stay in the evidence root.
- **Binding text on the page** (owner decisions in #613). WP2a writes the following into `focus-host-acceptance.md`:
  - the binding-drift rule;
  - the cause classification for built files, with its consequences;
  - the release duties.

  These replace the sentence "Changes to these contracts require renewed candidate qualification" and the "current candidate" requirement.

## Affected files

| File                                                                          | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/developer-guide/focus-host-acceptance.md`                               | New section "E requalification after the follow-up mode change (#613)" after the D section. Updated status paragraph, the intro of "Observed run and corrections" (labels A–E, E as the second requalification), "Candidate binding" (D content introduced as history; the closing sentence becomes the binding-drift rule), "Superseded binding" note, "T3 observed, report-only" matrix row, the "Every advertised path …" sentence, and the checklist item 1 suffix. |
| `docs/user-guide/tools-quality.md`                                            | The qualification paragraph ("requalification is pending before the next release") names the E binding.                                                                                                                                                                                                                                                                                                                                                                 |
| `<RUNTIME_STATE_ROOT>/.effective-flow/spikes/focus-requalification/<run-id>/` | Untracked evidence root, never committed.                                                                                                                                                                                                                                                                                                                                                                                                                               |

Both pages are extended in place, with no replacement and no new slug. `tools-quality.md` is user-guide and uses `language.documentation.user`. No `src/`, test, build or eval file changes. `docs/developer-guide/focus-session-shape-observations.md` and `evals/_scaffold/session-shapes.mjs` cite this page by line number, and those citations already drift. They stay untouched on purpose. Fixing them means changing `session-shapes.mjs` and the observations page's JSON block in lockstep (`test/session-stub.test.mjs:399`), which changes the focus suite's overlay seeds and belongs with the focus re-recording.

## Implementation details

### Mapping onto the `docs` workflow

The `docs` orchestrator completes steps 1–8 itself, after the plan's clarity gate and before its doc-plan approval and before any writer starts. No writer creates threads or reads sessions. Writers receive only the pseudonymized excerpts derived from the register, and they write only the two pages.

### Approach

1. **Preflight (orchestrator).**
   - Run `git fetch origin develop` and record the fetched SHA. Stop if it is not a descendant of `2b1e0f4`.
   - Create the scratch checkout, build it, and compute the seven digests, the retro-native-sources statement and the version stamp into the manifest.
   - Create the evidence root and the register.
2. **Slot swap (operator, script 1; orchestrator verifies).** Record the link, back it up, check that the slot is free, copy the build in, and check the installed digests. `RESTORE.md` is written before the copy.
3. **Threads (operator).**
   - Create T, O1 and P as new top-level Codex threads in the throwaway project, without their own worktrees, named `<run-id> T`, `<run-id> O1` and `<run-id> P`, in `full-access` and default mode. P uses the same model and high effort as O1.
   - Give the orchestrator the links. The orchestrator registers each thread after its metadata read.
4. **Target activity (operator pastes script 3 into T).** T works through steps 1–11 and pauses for confirmation, so at least 12 messages, and with them two history pages, exist before R1 (owner decision). T stays paused and pending during R1.
5. **R1 positive (script 4 into O1).** The orchestrator reads O1's activity and records:
   - the load proof;
   - the actual tool calls;
   - the ancestry walk to the root;
   - the state read of T;
   - the page reads;
   - the charged totals against 16 reads, 8 ancestry reads, 4 pages and 64,000 characters;
   - the one analysis leaf L, with its model, effort and verdict taken from O1's items only.

   It also checks that:
   - no correction was sent;
   - no follow-up offer appears, because the follow-up row is disabled;
   - the T3 UI shows no new schedule.

6. **R2 self refusal (script 5 into O1).** R2 has its own ledger:
   - at most one ancestry read, since O1 is the root and the contract may refuse self from the observer's own ID alone; the ledger records the actual count;
   - R2 relies on R1's load proof in the same O1 thread, and the record says so;
   - no target state read and no `messages` read;
   - no analysis leaf and no verdict;
   - a refusal naming self.
7. **R3 ancestor refusal (script 2 into P).**
   - P creates O2 with the invocation as its task and waits for the result. The orchestrator waits on P with `t3_thread_wait`, then registers and reads O2 once P's activity shows O2's result.
   - R3 has its own ledger:
     - an ancestry walk from O2 that stops at or before the root P (at most two reads), with the actual count recorded;
     - a host-visible read of the slot's `tools/focus.md` in O2's activity, as its load proof;
     - no target state read and no `messages` read;
     - no analysis leaf and no verdict;
     - a refusal naming an ancestor.
8. **Post-run (operator and orchestrator).**
   - Re-check the installed digests, then restore the slot through `RESTORE.md` and verify it as specified above.
   - The operator archives T, O1, P, O2 and L and the throwaway project, and confirms in the T3 UI that no run created a schedule.
   - The operator removes `{project-root}` after archiving T.
   - Run `t3-project clean --worktree <scratch path>`, then remove the scratch checkout with `git worktree remove`. Record the cleanup in the register.
9. **Write phase E** in the D format from the register and excerpts:
   - the candidate binding: SHA, version stamp, build target `portable`, host and settings, versions, the install path, the swap and restore checks, and the load proof;
   - the digest table;
   - R1–R3 with their ledgers and totals;
   - the leaf and its verdict;
   - send state "Not attempted", no follow-up offer, no schedule;
   - the limitations. One states that R1's observer is top-level (one ancestry read), unlike D's delegated observer, and that ancestor refusal is proven separately by R3. Another states that the `focus` eval suite is still stale, and that the next release still owes a re-recorded round.
10. **Update the binding text:**
    - **Status paragraph:** "T3 observed/report-only snapshot requalified on <date> (E, candidate `<short SHA>`)". The follow-up and send paths stay disabled. It adds the release duties: a passing record merged before the release PR merges, and the maintainer's drift comment on the release PR.
    - **"Candidate binding":**
      - D's existing prose and digest table are introduced as "D candidate (history):", and their content is unchanged.
      - The closing sentence "Changes to these contracts require renewed candidate qualification" becomes the binding-drift rule. A record binds its candidate only. A later change to a digest-bound file outside the focus sources (`src/tools/focus.md`, `src/shared/focus-session-contract.md`, `src/shared/focus-follow-up.md`, `src/shared/retro-native-sources.md`), and outside the `focus` `CONTEXT_BUDGET_LINES` line, is drift and owes no requalification. A focus-source change does owe requalification.
      - **Built files:** the maintainer rebuilds the release head and compares the digests with the record's table. A built-file change caused by a focus source owes requalification. A change caused by an eagerly included fragment (for example `chat-language`, `delegation-mandate`, `skill-discovery`) or by `build.mjs` rendering is drift.
      - **Release-PR comment:** before merging the release PR, the maintainer comments on it naming the record relied on, every digest-bound file changed since that record, and the cause of each changed built file.
    - **"Superseded binding" note:** E is the current snapshot binding, and D's binding is history.
    - **"T3 observed, report-only" matrix row:** "Passed E on the bound candidate `<short SHA>`", followed by the D history.
    - **"Every advertised path must have a completed row backed by the current candidate"** becomes "… backed by a candidate record whose differences from the current source are only binding drift".
    - **The intro of "Observed run and corrections"** names E as the second requalification, with labels A–E.
    - **Checklist item 1** gets the suffix "— recorded: E for `<short SHA>`".
    - **`tools-quality.md`:** the path passed the candidate-bound snapshot requalification (phase E, candidate `<short SHA>`) recorded on the acceptance page. The follow-up paragraph stays as it is.
11. **Deliver:** `pnpm agent:check`, archive this plan as Implemented, then one pull request against `develop` with `Refs #613`.

### Operator scripts

The orchestrator fills the `{…}` placeholders from the register and stores each filled script as a numbered file in the evidence root. Real IDs appear only there.

- **Script 1, swap and restore (shell on the host):**
  - **Record:** `readlink ~/.agents/skills/effective-flow` and the target's tree digest.
  - **Install:**
    1. `mv ~/.agents/skills/effective-flow {root}/slot-backup/effective-flow`
    2. `test ! -e ~/.agents/skills/effective-flow && test ! -L ~/.agents/skills/effective-flow`
    3. `cp -R {scratch}/dist/portable/effective-flow ~/.agents/skills/effective-flow`
  - **Restore half (also `RESTORE.md`):**
    1. Precondition: `test -L {root}/slot-backup/effective-flow && test -d ~/.agents/skills/effective-flow && test ! -L ~/.agents/skills/effective-flow`, and stop if it fails.
    2. `rm -r ~/.agents/skills/effective-flow` (the copied directory only)
    3. `mv {root}/slot-backup/effective-flow ~/.agents/skills/effective-flow`
    4. `readlink` and the tree digest
    5. `dalo status --check -g`
- **Script 2, into P:** "Create one delegated child with `delegate_task`. Use the task `$effective-flow focus {P-ref}`, the title `{run-id} O2`, `mode: 'wait'`, `timeoutMs: 1800000`, inherited runtime mode, and target `{providerInstanceId: 'codex', model: '{O1 model}', options: {effort: 'high'}}`. Do nothing else, and report only the child's result." E records O2's actual model.
- **Script 3, into T:** `{scratch-dir}` is `{project-root}/target-scratch/`. "Use no skill and no Effective Flow workflow. Do not read, modify, branch or commit in any repository, and write only inside `{scratch-dir}`. Goal: create the directory `{scratch-dir}` and, in at least 12 separate small steps, write one numbered text file per step containing that step's number and a one-line summary. Report after each step and pause for confirmation after step 11." The operator confirms only after R3, so T stays paused and pending during R1.
- **Script 4, into O1:** `$effective-flow focus {T-ref}`
- **Script 5, into O1:** `$effective-flow focus {O1-ref}`

### Edge cases

- **R1 fails, the load is unverified after a setup-invalid retry, or a refusal does not hold.**
  - E is recorded as failed with the observed calls.
  - The status paragraph, the note and the row keep "requalification pending", and the release stays blocked.
  - The defect goes through `effective-flow fix` with `Refs #613`, and WP2a re-runs on the `develop` head containing the fix.
  - Only the documentation of the failure is delivered.
- **The head is not a descendant of `2b1e0f4`.** Stop at preflight.
- **A focus-source or `focus` budget-line change lands on `develop` before the pull request merges.**
  - E stays a valid record of its candidate.
  - The status paragraph and the row keep "requalification pending" for the current source, and WP2a re-runs on the new head.
  - E names the drift known when the page is written; later drift goes into the maintainer's release-PR comment.
- **The restore precondition fails** (the install never moved the link, or the restore already ran). Do not delete anything. If the slot is missing, recreate the link with `ln -s '<recorded target string>' ~/.agents/skills/effective-flow`, then re-verify.
- **The slot is not a symlink, or the swap or restore fails.**
  - If the slot is not a symlink, stop at preflight.
  - A failure before R1 stops the run.
  - A restore that fails after the runs is recorded as a limitation. The operator repairs it from the backup path, and the orchestrator re-verifies, including `dalo status --check -g`.
- **R3 has no load proof, or O2 returns a missing capability instead of an ancestor refusal.** R3 failed; this is not the "no delegated child" case.
- **O2 refuses on selection grounds** (the invocation came from P, not from a developer turn) without reaching the ancestry check. Ancestor refusal counts as unproven, requalification stays pending, and the owner decides the next step (owner decision); this is not routed to `effective-flow fix`.
- **O2 delivers no result to P by the 2-hour cap.** R3 is unavailable and O2 is never read. Restore the slot; requalification stays pending.
- **No delegated child, or a child that is not on Codex.** R3 cannot run. Record ancestor refusal as unavailable, keep "requalification pending", restore the slot and stop. Do not substitute R1's ancestry walk.
- **T finishes before R1.** T is ready while its turn is running or it is paused at step 11, and finished only after it reports step 12. A finished T is restarted with a new step. Record the state actually observed.
- **The budget is exceeded or a cursor is inconsistent.** That is a failed R1.
- **A cap is reached.** Restore the slot, record the partial run as failed, and stop.
- **The host shows no versions.** Record "unavailable", as D did.

## Acceptance criteria

- [ ] `focus-host-acceptance.md` has a section "E requalification after the follow-up mode change (#613)" containing:
  - the candidate binding: a SHA descending from `2b1e0f4`, the version stamp, build target, host, settings, versions, `~/.agents/skills/effective-flow`, the install digests before R1 and after R3, and the R1 load proof;
  - the seven-entry digest table and the retro-native-sources statement;
  - R1 with a read ledger whose totals stay within 16 reads, 8 ancestry reads, 4 pages and 64,000 characters, plus the analysis-leaf model, effort and verdict;
  - R2 with at most one ancestry read and R3 with at most two, each with the actual count recorded, no target state read, no `messages` read, no leaf, and a refusal naming self or an ancestor;
  - the load proofs for R1 and R3, and the statement that R2 relies on R1's load;
  - R3 recorded as a delegated-task invocation, with O2's actual model;
  - L recorded only from O1's items;
  - send state "Not attempted", no follow-up offer, and no schedule created;
  - the limitations, including the stale `focus` eval suite.
- [ ] These read as specified in Approach step 10:
  - the status paragraph, with its release duties;
  - "Candidate binding", with the D history introduction and the binding-drift rule including the built-file cause classification and the release-PR comment;
  - the "Superseded binding" note;
  - the "T3 observed, report-only" row;
  - the "Every advertised path" sentence;
  - checklist item 1.

  The follow-up row and every send row are unchanged.

- [ ] `docs/user-guide/tools-quality.md` names the requalified binding, and "requalification is pending" no longer appears in it.
- [ ] `git diff --name-only origin/develop...HEAD` lists exactly `docs/developer-guide/focus-host-acceptance.md`, `docs/user-guide/tools-quality.md` and `docs/plan/archive/2026-11-04-focus-snapshot-requalification.md`.
- [ ] An identifier scan of every file in `git diff --name-only origin/develop...HEAD` finds no:
  - thread or task IDs;
  - `t3://` or `https://` thread links;
  - `/home/` or `/Users/` paths;
  - thread titles matching `<run-id> (T|O1|P|O2|L)`.
- [ ] The post-restore checks hold:
  - `sha256sum -c` on the final manifest passes;
  - after the restore, the slot is the original link with the identical target string and target tree digest;
  - `dalo status --check -g --json` equals the preflight baseline, and `dalo autosync status -g --json` still shows no installed job;
  - `{project-root}` is removed;
  - the scratch checkout is removed.
- [ ] `pnpm agent:check` passes, and the pull request uses `Refs #613`.

## Validation plan

- **Orchestrator checks during the run:**
  - the install digests before and after the runs;
  - the R1 load proof;
  - the R1–R3 tool calls and ledgers, read from O1 and O2 activity;
  - the refusal read counts;
  - the restored link, the target digest and `dalo status --check -g`.
- **Document checks:**
  - `pnpm agent:check` through `t3-project`;
  - the identifier scan with `git grep -nE` over every changed file, for UUID-like IDs, `t3://`, `/home/`, `/Users/` and `<run-id> (T|O1|P|O2|L)`;
  - a manual diff review against Approach step 10.
- **Merge:** `effective-flow merge-gate` on the pull request; it must merge before any release PR.

## Assumptions and open points

- Copying the portable build into the Codex skill slot is the only available way to load the exact portable artifact. No script installs a local portable build, and D documented no install method.
- During the swap, every Codex session on the host loads the candidate skill. The operator avoids unrelated Codex work during the run, which the 2-hour cap bounds.
- The orchestrator can read and wait on threads of the throwaway project from its own project by thread ID. If not, stop before step 3 and report it.
- T3 Code lets a Codex thread create a delegated Codex child with `delegate_task` and a caller-set title. If it does not, the "no delegated child" edge case applies.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    1 |
| Security        |        0 |         1 |    0 |
| Data protection |        0 |         1 |    0 |
| Error cases     |        0 |         3 |    4 |
| Testability     |        0 |         4 |    3 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    1 |

### Findings

Deep interactive review (the summary counts this round):

- **Important, Error cases.** R1's analysis leaf was an unregistered fifth thread. _Incorporated:_ leaf L is never read, is outside the cap, and is archived.
- **Important, Error cases.** O2's registration read could steal its result, and P's wait mode was unset. _Incorporated:_ reads only after P has the result, `mode: 'wait'`, and waits only on top-level threads.
- **Important, Testability.** A long-lived Codex process could keep loading the release skill. _Resolution by owner decision:_ restart the provider after install and restore, and treat a foreign load path as a setup-invalid retry.
- **Important, Error cases.** The cap of two R1 attempts contradicted the failure rule. _Incorporated:_ a retry only after a setup-invalid attempt.
- **Important, Testability.** Pausing T after step 6 gave only one history page. _Resolution by owner decision:_ pause after step 11.
- **Important, Testability.** `dalo status --check` had no baseline from before the swap. _Incorporated._
- **Important, Testability.** The manifest criterion could not pass. _Incorporated:_ the manifest is written last, excludes the backup, and is checked with `sha256sum -c`.
- **Important, Data protection.** The identifier scan missed the archived plan. _Incorporated:_ it covers every changed file.
- **Important, Security.** Full-access threads in a repository that mandates Effective Flow could act on the main checkout. _Resolution by owner decision:_ a throwaway T3 project outside every repository, plus the prohibitions in script 3.
- **Note, Architecture.** The Claude slot path was wrong for this host. _Incorporated._
- **Note, Error cases.** Path placement was contradictory. _Incorporated:_ a defined scratch path and the evidence-root ignore check.
- **Note, Error cases.** `prepare` lacked its definition. _Incorporated._
- **Note, Error cases.** The autosync check was not global. _Incorporated._
- **Note, Testability.** O2's model was unpinned. _Incorporated._
- **Note, Testability.** An R3 refusal on selection grounds was unclassified. _Resolution by owner decision:_ ancestor refusal counts as unproven, and the owner decides the next step.
- **Note, Error cases.** The non-symlink edge case contradicted the restore. _Incorporated:_ stop at preflight.
- **Note, Maintainability.** Naming all drift made E a moving target. _Incorporated:_ later drift goes into the release-PR comment.
- **Note, Testability.** The `tools-quality.md` wording did not name the binding. _Incorporated._
- **Note, Scope.** The docs workflow would stop to ask about the existing targets. _Incorporated:_ both pages are extended in place.

Internal plan review (5 important, 10 notes):

- **Important, Error cases.** `dalo sync --check` refreshes the shared DALO store. _Incorporated:_ `dalo status --check -g`, and an autosync precheck.
- **Important, Error cases.** The restore half could delete a live link when the install had not completed or the restore ran twice. _Incorporated:_ a precondition and a re-link path.
- **Important, Testability.** Exact ancestry-read counts for R2 and R3 were stricter than the contract. _Incorporated:_ upper bounds, with the actual count recorded.
- **Important, Testability.** R3 had no load proof, and a missing capability from O2 was unclassified. _Incorporated._
- **Important, Data protection.** The T3 project and the target's scratch directory were unplaced. _Incorporated:_ the same project, and a scratch directory under the evidence root that is removed afterwards.
- **Note, Testability.** The tree digest method was undefined. _Incorporated._
- **Note, Testability.** Install verification covered two files only. _Incorporated:_ an empty `diff -r` against the build.
- **Note, Error cases.** The `t3-project` runner steps were missing. _Incorporated:_ doctor, inspect, prepare and clean.
- **Note, Testability.** P's settings, which O2 inherits, were unset. _Incorporated._
- **Note, Error cases.** O2 might never deliver a result. _Incorporated:_ edge case.
- **Note, Testability.** T's readiness was ambiguous. _Incorporated._
- **Note, Testability.** The manifest could not hash the symlink backup. _Incorporated._
- **Note, Maintainability.** The page intro would be stale after E. _Incorporated._
- **Note, Architecture.** R1's topology differs from D's. _Incorporated_ as a limitation.
- **Note, Maintainability.** The reason for leaving line citations untouched was wrong. _Incorporated._

Gap analysis before the review (11 important, 6 notes), all incorporated or resolved by owner decision:

- orchestrator on the T3 Claude harness;
- R3 as a delegated task;
- the DALO-link-safe swap;
- load proof;
- refusal ledgers;
- the docs-workflow mapping;
- a scratch checkout outside the lifecycle contract;
- operator scripts;
- caps and `RESTORE.md`;
- the moving-`develop` rule;
- D content kept as history;
- archive path;
- fetch;
- home-path rule;
- citation note;
- stale eval limitation.

## Open points

- No open points.

## Test results

- Phase E run on November 4, 2026 against candidate `ada4fdae` (portable build, stamp `1.70.0 (nogit)`): R1 positive snapshot passed (7/16 native reads, 1/8 ancestry reads, 3/4 history pages, at most 46,024/64,000 charged characters; leaf verdict On track, no correction, send Not attempted, no follow-up offer, no schedule). R2 self refusal passed (one ancestry read, no target or history read). R3 ancestor refusal passed on its second attempt (one ancestry read, no target or history read); the first attempt was setup-invalid because the delegation script used an unsupported option name.
- Load proof: O1 and O2 read the swapped slot's `tools/focus.md` and `shared/retro-native-sources.md`; installed digests matched and `diff -r` against the build was empty before R1 and after R3; a new Codex app-server process started after the swap.
- Restore: original DALO link restored with identical target and target tree digest; `dalo status --check -g --json` byte-identical to the preflight baseline; autosync not installed before and after.
- Cleanup: throwaway threads and project archived, project root and scratch checkout removed, no schedule in the project; evidence manifest verified with `sha256sum -c` (17 files).
- `pnpm agent:check` passed; the identifier scan over every changed file found no thread or task IDs, links, home paths or run-id titles.

## Review findings

- Independent verification of the changed pages against the run evidence found no critical findings. Three important findings (an unbacked "no other Codex work" sentence, an unbacked "every reservation preceded its call" sentence copied from D, and the built `retro-native-sources.md` statement not yet in the supplied evidence) and eleven notes (cited positions, `runLimit`, O2's actual model, R3 charged characters, invocation wording, spelling, wrapping) were incorporated; the built-file digest was added to the evidence log from the preflight measurement.
- Deviations from the plan, recorded in phase E: the orchestrator created the throwaway threads and sent the target task and invocations through T3 tools at the operator's request, so they are agent-authored rather than typed; the leaf's model compliance stays unverified.
