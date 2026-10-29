# Claude Code allowlist spike for the runtime-state helper

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Documentation (`effective-flow docs`)
**Doc category:** developer-guide
**Target path:** docs/developer-guide/claude-code-allowlist-evidence.md

## Requirement

This plan implements work package 1 ("Allowlist spike", stage 0) of `docs/concept/2026-10-29-runtime-state-cli.md`. The spike asks whether an absolute-path Claude Code allow rule for a non-destructive command prefix of a `node` helper removes permission prompts. It also checks that the same rule never approves a destructive prefix of that helper. Both questions are measured in default mode, auto mode, and subagent sessions.

The spike ends with one conclusion for the concept's stage 1:

- **go:** stage 1 can rely on the rule
- **hook fallback:** stage 1 needs the PreToolUse-hook fallback
- **stop:** stage 1 should not proceed

The spike also records today's baseline for `review`, `iterate`, and `cleanup`. The baseline covers prompts and auto-mode refusals, classified the way the concept's success criterion counts them. Work packages 3 and 4 measure against this baseline with the same harness.

**Deliverables.** The deliverable is a point-in-time developer-guide evidence document and its index link. Everything else is throwaway: the measurement host, the stub helper, the optional hook prototype, settings files, prompts, and raw transcripts. These stay uncommitted below the evidence root and are referenced by digest. The one exception is the temporary stub symlink in the installed skill, which is removed again.

**Workflow rationale: Documentation.** The package changes no runtime behaviour, no shipped script, no `setup` behaviour, and no source under `src/`. Unlike the precedent `docs/plan/archive/2026-10-01-codex-exec-unattended-spike.md`, whose documentation run reused evidence that already existed, this package takes new measurements. The section "Measurement (orchestrator, before Phase 2)" therefore approves those measurements and lists every write they need outside the documentation boundary.

## Architecture decisions

- **One measurement host on the Agent SDK.**
  - **What it is:** a throwaway TypeScript host built on the Claude Agent SDK, kept in the evidence root. It drives every headless run: path-form probe, stub matrix, and baseline.
  - **What it handles:** its `canUseTool` callback receives every permission request that no rule resolved. Depending on the run, it records the request and then approves or denies it. The callback also answers `AskUserQuestion` from a per-workflow answer script. Plain-text questions are answered with scripted user turns.
  - **Why:** `--input-format stream-json` alone cannot answer `AskUserQuestion`, and `--permission-prompts none` removes that tool entirely.
  - **Configuration per run:**
    - the requested permission mode
    - the `user` setting source only
    - strict MCP configuration
    - no session persistence
    - the CLI's `--debug-file`
- **Attribution in auto mode through the debug log.** Rules resolve before the classifier, so a call approved by the rule logs no `classifier_request_started` event, while an unmatched call logs one. A smoke test before the matrix confirms this:
  - one rule-matched call, which must log no event
  - one unmatched call, which must log one

  The smoke test also records the auto-mode server state. If server-side review hides these events, the matrix runs with `CLAUDE_CODE_AUTO_MODE_SERVER=0`, and the evidence document records that deviation.

- **A scrubbed run environment.**
  - **Launch:** every run starts from an emptied environment (`env -i` plus an explicit allowlist), so no `CLAUDECODE`, `CLAUDE_CODE_*` session, or messaging variable leaks in from the operator's session.
  - **Variables set:**
    - `ENABLE_CLAUDEAI_MCP_SERVERS=false`
    - `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`
    - `DISABLE_AUTOUPDATER=1`
  - **Working directory:** each run starts outside the `effective-flow` repository, whose tracked `.claude/settings.json` must not apply.
  - **Why the user source stays enabled:** excluding it would also stop `~/.claude/skills/effective-flow` from loading. Step 1 instead records evidence that no permission rule, hook, or plugin reaches the runs from the user, managed, or project sources, from `~/.claude.json`, or from the sandbox's `.claude/`.
- **Path form from a real skill transcript.** The probe runs `effective-flow setup status`, which calls `node <skill-root>/scripts/setup-status.mjs status` exactly once, asks no question, and changes nothing. It runs in a scratch Git repository, both top-level and from one subagent. The first form the model writes is recorded separately from any retry. The stub matrix then tests every observed form, and the matrix prompt names each form literally. This is not circular, because the probe fixed the form beforehand.
- **Stub at the install path through a symlink.**
  - **Placement:** the throwaway stub lives in the evidence root. A temporary symlink `<real skill root>/scripts/<stub>.mjs` makes it reachable through both the symlinked install path and the resolved real path.
  - **Commands:** one non-destructive prefix (`lock acquire`) and one destructive prefix (`cleanup apply`). The stub takes its JSON on stdin through a heredoc, as the shipped helpers do. It mutates nothing and only appends to its own run log.
  - **Guarding the DALO checkout:** it must be clean before and after the spike, and DALO updates stay frozen for the spike's duration. The symlink is removed on every exit path.
- **Baseline against a throwaway private GitHub sandbox repository.** The repository holds a seeded diff, an Effective Flow worktree with its lifecycle record, and an open test pull request with seeded review threads.
  - **Credentials:** a fine-grained token limited to that repository, read from the environment at run time and never written below the evidence root. Forge access in every run goes through it alone:
    - `GH_TOKEN` is set to the token, and `GH_CONFIG_DIR` points to an empty directory
    - `GIT_CONFIG_GLOBAL` names a sandbox config whose only credential helper is the token
    - `SSH_AUTH_SOCK` is unset
  - **Allowlist:** during the baseline the host approves only command shapes from an explicit allowlist, and only when the working directory is inside the sandbox. It denies everything else, and a denial still counts.
  - **Lifetime:** the repository is kept until work package 4 has measured against it. The token's expiry is recorded.
- **Hook prototype only where the rule fails.** It is built and measured only for the cells that miss the go conditions. The hook is an allowlist parser and allows a call only when all of these hold:
  - exactly one command whose argv starts with `node` and the resolved stub path under the real skill root
  - an operation that is exactly one non-destructive prefix
  - no further arguments
  - the heredoc as the only redirection
  - no expansion or substitution characters outside the quoted heredoc body

  In every other case it returns no decision.

- **The conclusion does not wait for the baseline.** The decision rule uses only the stub matrix. A pending baseline does not block work package 2. It must be measured, against the pre-stage-1 installed release recorded in step 1, before work package 3 starts.
- **Evidence root in the primary checkout.** The root is `<RUNTIME_STATE_ROOT>/.effective-flow/spikes/allowlist/<run-id>/` of the main worktree, never inside a linked worktree. The host, its answer scripts, the allowlists, and the reset procedure are kept there, so that work packages 3 and 4 can repeat the baseline unchanged.
- **Budget.**
  - Each run is capped at 3 USD and the whole spike at 150 USD.
  - A cell gets at most two reruns.
  - A run that hits its cap is incomplete. A cell that cannot reach three complete runs within the reruns or the ceiling counts as a miss.

## Measurement (orchestrator, before Phase 2)

This plan is the approval for tooling. The `effective-flow docs` orchestrator carries out steps 1 to 8 of the approach itself before it starts any documentation writer. No docs-writer or code-documenter runs a session, builds an instrument, or touches the sandbox.

The writes outside the documentation boundary that this plan approves are exactly these:

- everything below the evidence root, including the measurement host and its installed SDK dependency there
- the temporary stub symlink in the installed skill's `scripts/` directory, removed on every exit path
- a scratch Git repository outside `effective-flow` for the path-form probe
- the GitHub sandbox repository and its test PR, threads, and pushes, created only after the operator agrees (see Assumptions)

After step 8, the documentation phases write only the two files under "Affected files".

## Affected files

| File                                                                          | Description                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/developer-guide/claude-code-allowlist-evidence.md`                      | New point-in-time evidence document. Sections: question and scope, setup, smoke test, path-form probe, matrix, baseline, interactive cross-checks, decision, limits, retention, and the hand-off to work package 2. |
| `docs/developer-guide/README.md`                                              | One index entry next to the existing "Codex exec unattended evidence" entry.                                                                                                                                        |
| `<RUNTIME_STATE_ROOT>/.effective-flow/spikes/allowlist/<run-id>/` (untracked) | Measurement host, answer scripts, command allowlists, reset procedure, stub, settings, optional hook, debug logs, raw transcripts, per-run sandbox state, digest manifest.                                          |
| `<real skill root>/scripts/<stub>.mjs` (temporary symlink)                    | Removed on every exit path. Checked by the clean-status checks of the DALO checkout.                                                                                                                                |

No file under `src/`, `test/`, `evals/`, or `build.mjs` changes. The concept file is not edited.

## Implementation details

### Approach

1. **Record the setup and the starting state.**
   - Take a `git status --porcelain` snapshot of the `effective-flow` checkout and of the DALO checkout.
   - Record these values:
     - the Claude Code version
     - the version of the installed skill and the commit of its source
     - the `effective-flow` `develop` commit
     - the install form
     - the model
     - the run date
     - the isolation evidence named under "A scrubbed run environment"
   - Freeze DALO updates.
   - Confirm that the evidence root is gitignored and untracked.
   - Write the host, answer scripts, allowlists, and reset procedure into the evidence root before the first run.
2. **Run the smoke test.** Run the auto-mode attribution smoke test from the architecture decisions, and choose the attribution method.
3. **Run the path-form probe.** Run `setup status` in a scratch Git repository three times in default mode and three times in auto mode, plus once from a subagent. Record every first-attempt form and, separately, any retries.
4. **Build the instruments:**
   - the stub and its temporary symlink
   - one settings file that allows only `Bash(node <observed form> lock acquire *)` for each observed form, including a literal `~` form if one was observed, and nothing destructive
   - a planted file with the stub's name in a writable directory of the run workspace
5. **Run the stub matrix.**
   - **Cells:**
     - every combination of permission mode (`manual`/default or `auto`) and context (a top-level session, or a foreground subagent that the session spawns through the Agent tool)
     - one no-rule control cell per combination
   - **Runs per cell:** at least three complete headless runs.
   - **Calls per run, in this order:**
     1. the non-destructive prefix twice, using the heredoc shape
     2. the non-destructive prefix with an extra trailing argument
     3. a compound command: the non-destructive prefix, then `&&`, then the destructive prefix
     4. a substitution probe: the non-destructive prefix with the destructive prefix inside `$(…)`
     5. the destructive prefix
     6. the planted file
   - **Complete run:** a run is complete only when all six call types were actually emitted as tool calls. Otherwise it is rerun within the budget.
   - **Recorded per call:**
     - the outcome: ran, denied as a would-be prompt, refused by the classifier, or not emitted
     - the attribution: rule, hook, classifier, or host decision
     - the path form written
     - the denial reason
   - **Recorded per run:**
     - the Claude Code version and model from the session's init message; a mismatch makes the run incomplete
     - any hit of the auto-mode block threshold
     - for subagent cells, the subagent model and whether it ran in the foreground

     If the classifier refuses the spawn itself, the cell is recorded as "spawn refused, not measured".
6. **Run the interactive cross-checks.** For each permission mode, the operator repeats one top-level run interactively and tallies the visible prompts by hand. The run agrees with the headless result when every call type has the same outcome.
7. **Run the hook prototype where needed.** Only for cells that missed the go conditions: repeat them three times each with the hook instead of the allow rule, including the compound, substitution, and trailing-argument probes.
8. **Record the baseline**, unless the sandbox is unavailable. In that case the document marks the baseline as pending under the rule in the architecture decisions.
   - **Reset before each run.** Reset the sandbox to its recorded starting state:
     - reseed the diff for `review`
     - reseed the worktree and lifecycle record for `cleanup`
     - give `iterate` a fresh test PR from the recorded branch, with the same seeded review threads: one per classification `iterate` distinguishes
     - reset the sandbox's own Effective Flow runtime state
   - **Record per run:** the sandbox commit, the PR number, and the thread IDs.
   - **Runs.** Run `review`, `iterate`, and `cleanup` at least three times each in default mode and three times in auto mode. No helper rule is present, and the answer scripts supply every question.
   - **Classification.** Classify each permission request by its reason, as housekeeping (lock, memory, or worktree), destructive, or other. Count auto-mode refusals from the denial messages. For each destructive operation, record its prompt count and whether it was confirmed in the conversation.
   - **Fallback.** A workflow that cannot complete under the answer scripts is counted from three interactive runs per mode instead, and the document notes the change of method.
9. **Clean up.** Remove the stub symlink, confirm that the DALO checkout matches its step 1 snapshot, and unfreeze DALO updates.
10. **Decide.** Apply the decision rule and state exactly one conclusion. Name the path forms that `setup` must write in work package 3.
11. **Write the evidence document and its index entry.**
    - Follow the structure of `codex-exec-unattended-evidence.md`.
    - Publish only home-relative or redacted paths. Never publish session identifiers, credential contents, or private output paths.
    - Cite raw artifacts by their path below the evidence root and their SHA-256 digest.
    - Add a limits line: only the measured install form is covered. Local-link, copy installs, and native `effective-flow-*` sidecars are unmeasured.
    - Add a retention section: work packages 3 and 4 reuse the retained host, answer scripts, allowlists, and reset procedure.
    - Add a hand-off note to work package 2: the allowlisted prefixes must reject extra arguments and any argument containing substitution, because the rule's trailing `*` admits them.

### Decision rule

The rule is evaluated per cell, for the path forms observed in that cell.

- **Go:** every cell meets all of these conditions:
  - every non-destructive heredoc call runs without a denial in every run
  - in auto mode, every such call is attributed to the rule
  - the trailing-argument, compound, substitution, destructive, and planted calls are never approved by the rule
  - every observed path form is covered by a rule, and a literal `~` rule counts only if it was measured
- **Hook fallback:** at least one cell misses a go condition, and the hook prototype meets every go condition in those cells, with attribution to the hook.
- **Stop:** some cell misses the go conditions with both the rule and the hook.

A classifier or host verdict on a negative probe does not decide the outcome, because the rule did not approve it. The document records such verdicts separately. A missed cell counts as a miss.

### Edge cases and stop conditions

- **Classifier verdicts vary.** Report every run, not a majority. One rule-attributed miss in a cell makes that cell miss go.
- **A foreign rule is in effect.** The init message or the isolation evidence shows a mode, tool, MCP server, plugin, or rule that was not requested. Discard the run and repeat it once. If it happens again, stop the matrix and report an isolation failure.
- **The smoke test shows no usable attribution signal, even with `CLAUDE_CODE_AUTO_MODE_SERVER=0`.** Report auto-mode cells as "attribution unavailable", count them as misses, and state this as the main limit.
- **The SDK host cannot answer `AskUserQuestion` in some workflow.** Use the interactive fallback for that workflow and note the method.
- **The sandbox, the test PR, or the scoped token cannot be provided.** The baseline stays pending. The conclusion is still stated.
- **The evidence root is not ignored, or the DALO checkout is dirty before the start.** Stop before writing.
- **An exit path fails to remove the stub symlink.** Report it as the first line of the completion report.

## Acceptance criteria

- [ ] **Setup and smoke test.** `docs/developer-guide/claude-code-allowlist-evidence.md` exists and records:
  - the Claude Code version
  - the installed skill version and its source commit
  - the `develop` commit
  - the install form, the model, and the run date
  - the isolation evidence
  - the smoke-test result and the chosen attribution method
- [ ] **Path-form probe.** The document lists every first-attempt form, with three runs each in default and auto mode plus one subagent run, and lists retries separately.
- [ ] **Matrix.** The matrix covers every mode × context cell and its no-rule control cell. Each cell has at least three complete runs, or the outcome "spawn refused, not measured". Every run has an outcome and an attribution for all six call types.
- [ ] **Interactive cross-checks.** There is one operator cross-check per permission mode, recorded as agreeing or disagreeing, call type by call type.
- [ ] **Hook prototype.** Hook results exist for exactly the cells that missed the go conditions.
- [ ] **Conclusion.** The document states exactly one conclusion (`go`, `hook fallback`, or `stop`), derived by the decision rule, and names the path forms that `setup` must write.
- [ ] **Baseline.** The baseline table either gives counts for `review`, `iterate`, and `cleanup`, or is marked pending with its reason and its deadline before work package 3.
  - Counts come from at least three runs per mode each.
  - They are classified as housekeeping, destructive, or other prompts, plus auto-mode refusals.
  - Each destructive operation has its own prompt count and confirmation state.
  - The table states the counting method and the per-run sandbox state.
- [ ] **Publication rules.** The document uses only home-relative or redacted paths and contains no session identifiers. It has limits, retention, and work-package-2 hand-off sections, and states the budget actually spent.
- [ ] **Raw artifacts.** Every cited raw artifact matches its SHA-256 digest. The evidence root is ignored and untracked, holds the reusable host and procedures, and contains no token.
- [ ] **Cleanup.** The stub symlink is gone, and the DALO checkout matches its step 1 snapshot.
- [ ] **Index.** `docs/developer-guide/README.md` links the new document, and `pnpm agent:check` passes.

## Validation plan

- Recompute the SHA-256 digests of all cited raw artifacts and compare them with the document.
- Compare `git status --porcelain` of the checkout the `docs` run hands back with its step 1 snapshot. The allowed differences are exactly the two documentation files and this plan's own status change or archive move.
- Compare the DALO checkout's `git status --porcelain` with its step 1 snapshot. Confirm that the stub symlink is absent.
- Confirm the evidence root with `git check-ignore` and `git ls-files`, and search it for the token value.
- Re-derive the conclusion from the matrix table by hand, using the decision rule.
- Search the evidence document for the operator's absolute home path and for session-identifier patterns.
- Run `pnpm agent:check`.

## Assumptions and open points

- **Precondition for step 8.** The sandbox repository, its test PR, and a fine-grained token limited to that repository are provided at implementation time. Before step 8, the implementing run asks whether it may create the private repository under the operator's account, or uses an existing one that the operator names. Without these, the baseline stays pending, and the conclusion is still stated.
- **Flags.** The Agent SDK and Claude Code 2.1.310 support the permission modes, `canUseTool`, setting sources, strict MCP configuration, and `--debug-file` used here. A different installed version is recorded and may change the method.
- **Operator role.** The operator performs the interactive cross-checks.
- **Concept.** The concept's roadmap is not updated by this package. The evidence document is the hand-off to work packages 2 and 3.

## Plan review

**Result:** Approved

### Initial review 2026-10-29

#### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         1 |    0 |
| Security        |        0 |         2 |    0 |
| Data protection |        0 |         1 |    1 |
| Error cases     |        0 |         3 |    2 |
| Testability     |        0 |         2 |    2 |
| Scope           |        0 |         0 |    3 |
| Maintainability |        0 |         1 |    2 |

#### Findings

- **Critical (Architecture): excluding the user setting source stops the installed skill from loading, so the baseline could not run.** Incorporated: the user source stays active; there is evidence that it holds no permission rules; the run directory is outside the repository; connectors and auto memory are disabled.
- **Important (Testability): the path-form measurement was circular, because the stub prompt supplied the form.** Decision: the form is taken from real skill transcripts, and the stub matrix tests only the observed forms.
- **Important (Security): the hook prototype checked only the script path, so it would approve `cleanup apply` and compound commands.** Incorporated: the hook allows only single simple commands with an exact non-destructive prefix, and compound and trailing-argument probes were added.
- **Important (Error cases): in auto mode, rule approvals could not be told apart from classifier approvals, and there were no control cells.** Incorporated: a no-rule control cell per mode and context, an attribution per call, and go conditions phrased as "never approved by the rule".
- **Important (Error cases): the decision rule was ambiguous for mixed or uncoverable path forms.** Incorporated: per-cell evaluation and an explicit outcome for each case.
- **Important (Testability): the baseline counted only prompts, not auto-mode refusals and not the success criterion's classes.** Incorporated: each event is classified, and refusals are counted from `permission_denials`.
- **Important (Error cases): headless runs lose workflow questions, which contradicted the three-run criterion.** Decision: multi-turn headless runs with scripted answers, falling back to three interactive runs per mode.
- **Important (Architecture): the sandbox state was not reset between baseline runs.** Incorporated: a reset and reseed before every run, with the commit recorded per run.
- **Important (Security): the recording tool would approve every prompt with the operator's credentials.** Decision: it approves only commands confined to the sandbox, and a token is scoped to the sandbox repository.
- **Important (Data protection): isolation left connectors, auto memory, and the project settings file open.** Incorporated, as in the critical finding.
- **Important (Maintainability): the evidence location and reproducibility were unspecified.** Incorporated: the evidence root is the primary checkout, the harness and prompts are retained, and a retention section was added.
- **Note (Data protection): private paths and session identifiers could appear in the published document.** Incorporated: redaction rule and validation check.
- **Note (Testability): the `git status` check would fail on the current tree.** Incorporated: comparison against the step 1 snapshot.
- **Note (Error cases): the baseline would have recorded the repository version instead of the installed one.** Incorporated: the installed skill version and its source commit are recorded.
- **Note (Scope): the result was generalized from one install form.** Decision: the result is limited to the measured form, with a limits line.
- **Note (Error cases): the subagent context was underspecified.** Incorporated: a "spawn refused" outcome, plus the subagent's model and foreground status.
- **Note (Testability): the auto-mode block threshold could contaminate later calls in a run.** Incorporated: fixed call order, and threshold hits recorded.
- **Note (Maintainability): trailing arguments and the heredoc shape were not probed.** Incorporated: probes added, plus a hand-off note to work package 2.
- **Note (Scope): the conclusion was gated on the baseline.** Decision: the conclusion is stated independently, and the baseline may be pending.
- **Note (Scope): the matrix ran two path variants and had no budget cap.** Decision: one variant per observed form, plus `--max-budget-usd`.
- **Note (Maintainability): open points contradicted the assumptions.** Decision: the sandbox is a precondition the implementing run asks for before step 8, recorded under assumptions.

### Deep interactive review 2026-10-29

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         3 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        1 |         0 |    2 |
| Testability     |        0 |         2 |    4 |
| Scope           |        0 |         2 |    1 |
| Maintainability |        0 |         0 |    1 |

- **Critical (Error cases): in auto mode a no-rule control cell cannot attribute approvals, because the classifier likely approves the harmless stub too, so go was unreachable by construction.** Decision: per-call attribution through `classifier_request_started` events in the debug log, confirmed by a smoke test, with `CLAUDE_CODE_AUTO_MODE_SERVER=0` as fallback.
- **Important (Testability): multi-turn stream-json turns cannot answer `AskUserQuestion`.** Decision: an Agent SDK host whose `canUseTool` records permissions and answers questions, replacing the MCP recorder.
- **Important (Architecture): the stub's location contradicted the requirement that it be reachable through the install path.** Decision: a temporary symlink in the real skill root, with the DALO checkout checked before and after, and updates frozen.
- **Important (Testability): a negative probe that was never reached still satisfied "never approved".** Incorporated: a run is complete only when all call types were emitted.
- **Important (Security): runs inherited the parent session's environment, and the isolation mechanisms were not named.** Incorporated: a scrubbed environment, named variables and flags, init-message checks, and wider isolation evidence.
- **Important (Security): the scoped token was not enforced, and the recorder's confinement could not be decided.** Incorporated: `GH_TOKEN`, an empty `GH_CONFIG_DIR`, `GIT_CONFIG_GLOBAL`, no SSH agent, a command-shape allowlist, and the token never stored.
- **Important (Scope): the Documentation workflow has no measurement phase.** Decision: an explicit "Measurement (orchestrator, before Phase 2)" section that approves and lists the writes outside the documentation boundary, with the precedent sentence corrected.
- **Important (Scope): a pending baseline had no deadline relative to stage 1.** Decision: work package 2 may start, but the baseline is measured against the recorded pre-stage-1 release before work package 3.
- **Important (Testability): `iterate` had no seeded threads and no thread reset.** Incorporated: a fresh PR per run with seeded threads, and thread IDs recorded.
- **Important (Security): the hook and the probes ignored command substitution.** Incorporated: a substitution probe, a hook defined as an allowlist parser, and a no-trailing-argument policy.
- **Note (Testability): the probe named a helper that no read-only tool reaches.** Incorporated: `setup status`, first attempts recorded separately from retries, plus one subagent probe.
- **Note (Error cases): the premise about `--permission-prompt-tool` was weak.** Moot under the SDK host.
- **Note (Scope): the `~` form was resolved by definition.** Decision: it is measured with a literal `~` rule.
- **Note (Error cases): the budget was not concrete.** Decision: 3 USD per run, 150 USD in total, at most two reruns per cell, and a missed cell counts as a miss.
- **Note (Testability): the interactive cross-check had no actor and no agreement criterion.** Incorporated: the operator performs it, and agreement means the same outcome per call type.
- **Note (Testability): the `git status` validation ignored the `docs` handback and the DALO checkout.** Incorporated.
- **Note (Testability): destructive prompts were not counted per operation.** Incorporated: a count and confirmation state per operation.
- **Note (Maintainability): the Claude Code version could drift during the spike.** Incorporated: `DISABLE_AUTOUPDATER=1`, with the version checked on every run.

## Test results

- Measurement completed on 2026-10-29 in 67 headless runs for 9.40 USD in total (ceiling 150 USD): smoke tests, shape diagnosis, a 7-run path-form probe, a 24-run matrix, 12 hook-prototype runs, a pilot, and an 18-run baseline. Every matrix and hook run emitted all eight call types.
- Interactive cross-checks by the maintainer in default mode (CLI 2.1.310) and auto mode (CLI 2.1.312) agree with the headless results call by call.
- Conclusion by the decision rule, applied to the here-string shape: **hook fallback**. Recorded in `docs/developer-guide/claude-code-allowlist-evidence.md`.
- Validation: all six cited digests match the evidence root; `manifest.sha256.txt` verifies against its 609 files; no absolute home path, session identifier, token, or private repository name in the published document; the evidence root is ignored and untracked and contains no token; the stub symlink is removed and the DALO checkout status matches its pre-spike snapshot; `pnpm agent:check` passes.

## Review findings

- No review phase runs in the documentation workflow. Deviations from the plan, recorded in the evidence document: the measurement host is JavaScript rather than TypeScript; auto mode was measured with `CLAUDE_CODE_AUTO_MODE_SERVER=0` because the default server-side review exposes no attribution signal; by the maintainer's decision the here-string replaced the multi-line heredoc as the primary non-destructive shape, because an allow rule cannot cover a multi-line heredoc; interactive declines interrupt the turn and the operator resumed after each one.

## Open points

- No open points.
