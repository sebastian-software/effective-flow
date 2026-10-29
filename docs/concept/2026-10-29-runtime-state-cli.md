# Runtime State and Mechanics Helpers

**Concept status:** Elaborated
**Source:** effective-flow concept

## Problem and motivation

Effective Flow keeps mechanical runtime state below `.effective-flow/`: locks, the review memory, worktree-run records, and the files that `cleanup` removes. Today most of this state is handled by prose that the agent carries out with its own shell commands, such as `mkdir` for a lock, writing an owner file, rereading it, `rm`, `rename`, and `git worktree remove`. This causes three problems.

- **Permission friction in Claude Code.** Each prose step becomes a different ad-hoc shell command. A user cannot allowlist these commands with one stable rule. Deleting memory, lock, or worktree files triggers permission prompts or auto-mode refusals mid-run. The maintainer has observed these prompts and refusals; the concept also addresses them as a preventive architecture step.
- **Unreliable protocol execution.** A lock protocol with an owner token, a reread, and a bounded retry is precise work, and an agent replaying it from prose can skip steps or vary them. No unit test can cover a protocol that exists only as instructions.
- **Harness drift and per-call context.** Claude Code and Codex each interpret the same prose with their own shell habits. Every protocol replay also costs tokens per call. Most protocol fragments are already lazy-loaded, so the saving in always-loaded context is small and limited to the few eager hosts.

The same pattern reaches beyond runtime state. Several deterministic git and artifact procedures exist only as prose: resolving the base branch, archiving a plan, allocating a dated file name, naming a delivery branch, numbering an ADR, editing `.gitignore`, resolving a plan reference, and classifying leftover stashes. Some are duplicated across tools, and some spend more prose on quoting pitfalls than on the rule itself. Unlike runtime state, they operate on tracked files, the index, and git refs. They carry the same reliability and parity problems, but their main gain is correctness and per-call context rather than fewer prompts.

Verified repository context:

- Prose-owned locks:
  - `.effective-flow/memory.lock` with an `owner.json`, a token, and a retry of at most 30 s (`src/shared/memory-state.md`)
  - the worktree-run locks `.effective-flow/worktree-runs/<RECORD_ID>.lock`, which have no stale timeout and are never broken (`src/shared/worktree-lifecycle.md`)
  - the commit locks `iterate-commit.lock` (`src/tools/iterate.md`) and `apply-review-commit.lock` (`src/tools/apply-review-commit-mechanics.md`)

  The worktree-run lock and both commit locks keep their owner in a file named `owner`. Only the memory lock uses `owner.json`. The memory lock and both commit locks let the user confirm removal of an apparent orphan, and the agent then removes it under the guard after rereading the owner.

- The review memory `memory.json` is written through a temporary file and an atomic replace (`src/shared/memory-state.md`), and every writer must use that one protocol. The writers are:
  - `review` and the review-state fragments
  - `setup`
  - the label-migration marker (`src/shared/issue-tracker-forge.md`)
  - the directory-migration marker (`src/shared/effective-flow-dir-migration.md`)
  - `src/shared/worktree-integration.md`

  The protocol defines a small, closed set of operations: reserving a finding range, which changes only the counter; writing a named marker; the directory-migration merge, where absent keys are added and the target wins; and adopting legacy memory inside every transaction, which removes `<RUNTIME_STATE_ROOT>/.sf-memory.json` at the repository root afterwards.

- Worktree runs follow a state machine: `active`, `cleanup-ready`, `cleanup-in-progress`, `cleanup-failed`, `aborted`. Each transition has an owner. Removal is preceded by nine eligibility conditions and a claim-and-reconcile sequence (`src/shared/worktree-lifecycle.md`). Every condition derives from git or from the record. The receipt is in-run state, not a file. Records are written through a temporary file and `rename`. The worktree base directory may lie outside the repository (`src/tools/apply-review-commit-mechanics.md`).
- The runtime-state guard runs `git check-ignore --no-index` and `git ls-files` before every write or delete below `.effective-flow/` (`src/shared/runtime-state-safety.md`). The agent executes it from prose. 29 sources include the guard, and many of them protect mutations outside this concept, such as plan publication and archival, setup, and `git worktree add`.
- `cleanup` handles legacy remnants as follows (`src/tools/cleanup.md`):
  - tracked remnants are removed with `git rm`
  - the untracked legacy runtime directories `.firmo/` and `.sf-plugin/` are removed physically; they lie outside `.effective-flow/` and were created by predecessor tools without any record
  - worktrees are removed with exactly `git worktree remove <path>` followed by `git branch -d`, never with force, and git itself refuses a dirty worktree or an unmerged branch
  - only stale diff baselines go through a script (`diff-baseline.mjs discard`)
- Script-owned state already exists. A thin JSON CLI `<name>.mjs` wraps an importable `<name>-core.mjs` and is shipped byte-for-byte to every target through `RUNTIME_SCRIPT_FILES` in `build.mjs`. Tools invoke it as `node <skill-root>/scripts/<name>.mjs`, with the JSON on stdin, usually through a heredoc. Conventions vary:
  - `plan-publication`, `remote-tracker`, and `delivery-selection` treat writes as dry runs unless `--apply` is passed
  - `diff-baseline` uses operation names instead of a flag
  - `plan-lint`, `plan-publication`, `issue-buddy`, and `remote-tracker` use the shared `process-runner.mjs`; several other scripts spawn processes directly
- Script-owned locks exist in `issue-buddy-core.mjs` (age-based staleness of over 2 h), `pilot-measurement-core.mjs` (PID-probe recovery), and `remote-tracker-ledger-core.mjs` (a stale lock is never broken).
- No ADR or developer-guide document discusses moving this logic into scripts or covers Claude Code permission prompts.

Verified context for the deterministic mechanics (stage 3):

1. **Base-branch resolution** (`src/shared/base-branch-resolution.md`, used by `pr`, `worktree-integration`, and the plan-PR continuation): decides whether a value is a remote ref against the configured remotes. With a remote configured, it fetches and resolves, and a failed fetch or resolution **reports and stops, never falling back**, because a stale local branch would start delivery from the wrong commit. Only without a configured remote does it resolve a local ref, substituting the branch part once. After success it compares `origin/HEAD` and names a divergence. The only non-mechanical part is a silence rule when the setup ADR's prose calls the divergence deliberate.
2. **Plan archival** (`src/shared/plan-archival.md`, 297 lines, plus the status flip in `plan-status`): runs automatically at the delivery point and never aborts the handback. It detects one of several archive states through `git ls-files` with literal pathspecs, checks the archive target for collisions, and moves or writes and stages the plan. It writes through a temporary file and `link`, not an exclusive create, so a run that dies midway leaves no partial file that later reads as a collision. It also deletes the redundant untracked plan copy in `SOURCE_ROOT`, a project file outside `.effective-flow/`, and in hidden mode it renames files below the runtime directory.
3. **Dated file allocation** (`src/shared/plan-numbering.md`, `src/shared/concept-contract.md`, and the report and artifact names in `plan`, `review`, `build`, `fix`, `investigate`, `docs`, `unresolved-review-report`, and `security-disclosure-gate`): the local date from `date +%F`, a kebab-case slug limited to `a–z`, `0–9`, and hyphen, and a collision suffix. The suffix scheme differs by family: `-2`/`-3` for plans and concepts, `-1`/`-2` for unresolved review reports, and `[-N]` for review and security reports. Targets are tracked directories (`plan.dir`, `concept.dir`) or runtime directories (`.effective-flow/review/`, `.effective-flow/investigation/`). The plan and concept conventions forbid reservations and stubs, and the existence check is separate from the write.
4. **Delivery branch naming** (`src/shared/worktree-integration.md`, restated in `deliver`): `<prefix>/<skill>/<slug>`, slugification, repeated stripping of the hidden-mode disclosure forms, the `change` fallback, and a numeric suffix for an existing branch. `pr` does not restate it; it takes a prepared head branch. Related code exists but does not cover the rule: `assertUndisclosed` in `remote-tracker-shared-core.mjs` only asserts, and its spaced pattern is case-sensitive, while the prose strips case-insensitively. `plan-publication-core.mjs` already has a `branch-name` operation and the plan slug alphabet. Choosing the text the slug is derived from stays judgment.
5. **ADR numbering** (`src/shared/project-adr-convention.md`, 227 lines): number parsing, pad-width widening, containment, and the collision procedure. The fragment itself labels these parts mechanical.
6. **`.gitignore` target state** (`src/tools/setup.md`): `git check-ignore --no-index` with fail-closed exit codes, a check against tracked files, rewriting the legacy patterns (spellings with or without leading and trailing slashes), and appending with a trailing newline. A non-Git project asks the user first. Hidden mode writes `info/exclude` in the Git common directory instead. `setup-status-core.mjs` already implements the read side (ignore state, negations, legacy leftovers, `exclude-unsafe`, `outranked-by-gitignore`), offers only a read-only `status` operation, and states that `setup` stays the only writer.
7. **Plan legacy migration and reference resolution:** the migration (`src/shared/plan-numbering.md`) renames legacy numbered plans with `git mv` when a plan is read, including in `plan-review`, `review`, and `apply-plan`. Resolution (`src/shared/plan-reference-routing.md`, hosted by `build`, `fix`, `refactor`, `docs`, `plan`, `apply-plan`, and `apply-source-detection`) matches a reference by path, file name, legacy number through the H1, or title slug across the plan and archive directories, and asks when several match. Whether an argument is a plan reference at all is decided by `apply-source-detection`. `plan-lint-core.mjs` offers only `lint` and `publication-metadata`, but it owns the bilingual status-marker mapping and already detects same-name files at the top level and in the archive.
8. **Stash classification** (`src/tools/apply-review.md`, Phases 1 and 6): Phase 1 records the baseline as `stash@{N}` references with descriptions, and Phase 6 compares by description and "ideally additionally" by stash hash. It assigns a stash to a finding by `R-\d{7}` in the message, or else by a "significant" overlap with files the model logged in the wisdom file. Class A requires the stash content to be a subset of the finding commit and is dropped without asking in every stash policy. Classes B to D are user decisions or follow `stashPolicy`, whose `discard` also drops. `git stash drop` accepts only a `stash@{N}` entry, not a commit hash.

Verified harness context:

- **Claude Code** ([permissions](https://code.claude.com/docs/en/permissions), [permission modes](https://code.claude.com/docs/en/permission-modes)):
  - Bash allow rules match command text by prefix, and `*` matches anything.
  - Heredocs and here-strings are not checked as redirect targets.
  - A command that matches an allow rule resolves before the auto-mode classifier sees it.
  - Entering auto mode drops wildcarded interpreter rules such as `Bash(python*)` but keeps narrow rules.
  - A rule such as `Bash(node *effective-flow-state.mjs *)` would approve any file of that name anywhere, including one planted in a writable directory.
- **Codex:** workspace-write keeps `.git` read-only even inside a writable root (`WritableRoot` in `codex-rs/protocol/src/protocol.rs`). This means every git write below `.git` needs escalation in Codex, with or without a helper, exactly like today's `git worktree add` and commits: `git worktree remove`, `git branch -d`, `git fetch` (remote-tracking refs, plus network access), `git mv` and `git add` (the index), `git stash drop` (the stash reflog), and the hidden-mode `info/exclude` write. Locks and memory below `.effective-flow/` are not affected.

Reference: the sibling tool Dalo puts every store, link, lock, and ownership change behind its CLI, and its skill forbids hand-editing that state. Destructive actions are guarded by a dry run, by preview-then-apply, and by its rule "Dalo may manage what it owns. It does not take ownership by surprise." Dalo pays for this with a separately installed binary whose version must match the skill. Effective Flow avoids that cost because its scripts ship inside the skill.

## Target users and use cases

- **Effective Flow users in Claude Code:**
  - Allowlist the helper's non-destructive operations once with the rule `setup` writes, and then run `review`, `iterate`, `apply`, or `cleanup` without permission prompts for lock and memory housekeeping.
  - See exactly what a cleanup would delete, and confirm each destructive step once.
- **Effective Flow users in Codex:** get the same lock and memory semantics as in Claude Code without new sandbox denials. Every operation that writes below `.git` (worktree cleanup, fetch, staged moves, stash drops) keeps the escalation such writes already need, because Codex protects `.git`.
- **Maintainers:**
  - Test lock, memory, and worktree-lifecycle semantics with `node:test` instead of relying on behavioural evals.
  - Retire hand-replayed protocols from the prose.
  - Replace duplicated and pitfall-heavy git and artifact procedures with one tested implementation each.

**Success criterion:** each of the following runs is repeated at least three times in Claude Code default mode and three times in auto mode, with the allowlist rule that `setup` writes: one `review`, one `iterate`, and one `cleanup`.

- Outside the destructive operations, the runs produce no permission prompt and no auto-mode refusal for lock, memory, or worktree housekeeping.
- Each destructive operation the user confirms in the conversation produces at most one harness prompt.

Before stage 1 starts, today's prompt counts for the same runs are recorded as the baseline.

**Stage 3 criteria:** stage 3 is about correctness and context, not prompts. Each of the eight procedures is done when:

- unit and conformance fixtures cover it, including its edge cases (the remote-configured fetch failure, the suffix scheme of every artifact family, local-date boundaries, and slug transliteration)
- its owning fragment is reduced to the helper call and outcome handling, with no restated copy left in another host
- the `CONTEXT_BUDGET_LINES` entries of its eager hosts are lowered by the measured amount

## Solution sketch

One bundled runtime-state helper, `effective-flow-state.mjs`, ships in the skill's `scripts/` directory next to the existing helpers. It covers locks, the review memory, worktree-run records, and cleanup, over one shared guard core. Tools call it the same way they call the existing helpers: `node <skill-root>/scripts/…`, with JSON in and one JSON result out.

**Destructive and non-destructive operations are separate commands.** The operation always appears in the command line, never only in the JSON input. Non-destructive operations such as acquiring and releasing an own lock, reserving a finding range, or a cleanup dry run have their own command prefixes. Destructive operations, namely applying a cleanup and breaking an orphaned lock, have different prefixes. `setup` writes an allowlist rule only for the non-destructive prefixes, bound to the helper's absolute path in that install, so a planted file of the same name elsewhere is never approved. A destructive operation therefore keeps its harness prompt in Claude Code, and in auto mode it stays visible to the classifier. Applying a cleanup also requires the digest of the dry-run plan the user was shown, so the apply cannot remove anything beyond that plan.

**The guard moves with the deletion.** A script that takes `rm` out of the agent's own commands must enforce every check that the harness can no longer see. The helper has three safety layers:

1. **Path guard.** The helper canonicalizes every path it receives and treats all input as untrusted model output. It checks every path component with `lstat`, refuses symlink escapes, and checks again immediately before each unlink. The helper itself unlinks only these target classes:
   - runtime state below `RUNTIME_STATE_ROOT/.effective-flow/`, which must be gitignored and untracked
   - a closed list of legacy files and directories, accepted only by exact name at the repository root and only while untracked: `.firmo/`, `.sf-plugin/`, and `.sf-memory.json`

   The helper never unlinks a worktree path. It passes worktree paths only to a non-force `git worktree remove`, and only after a record match, so a worktree base directory outside the repository needs no path class of its own.

2. **Ownership and lifecycle guard.** The helper manages only what Effective Flow created:
   - It refuses a lock held by another token.
   - It enforces the worktree lifecycle's transitions, all nine eligibility conditions, and claim-remove-reconcile in code.
   - When a run record is initialized, the helper checks that the branch tip equals the recorded creation commit and that the path is newly registered with git.

   Creation itself stays self-attested, because `git worktree add` remains in prose.

3. **Git's own refusal.** Worktree removal never uses force, and the helper requires a clean status, so git still refuses a dirty worktree and `git branch -d` still refuses an unmerged branch. This layer protects even against a forged record.

**Orphaned locks.** Breaking an apparent orphan is a destructive compare-and-remove. It takes either the observed owner token, or, when the owner file is missing, the identity of the observed lock directory: device, inode, and modification time. That identity check closes the race in which the lock is released and re-acquired between the observation and the removal. The prose calls the break only after the user has confirmed in the conversation. Worktree-run locks are never broken.

**Review memory.** The helper exposes only typed operations: reserving a finding range, setting a named marker, and the directory migration. Legacy adoption runs implicitly inside every transaction. The helper has no generic write or merge operation, so the protocol is enforced and tested in code, and a new key family needs a new operation.

**Deterministic git and artifact mechanics.** The eight stage 3 procedures go into a second bundled helper, `effective-flow-mechanics.mjs`. It follows the same conventions: operation in the command line, JSON in and out, outcome codes, and destructive operations under their own prefixes. It **imports** the code that already owns parts of these rules instead of copying it: the status-marker mapping and archive collision detection from `plan-lint-core.mjs`, the branch-name and slug code from `plan-publication-core.mjs`, the ignore-state read side from `setup-status-core.mjs`, and the shared path guard from stage 1. Its operations fall into four classes:

- **Computation and reads (allowlisted):**
  - base-branch resolution, apart from its fetch
  - name allocation, which computes only the name; the collision suffix scheme is a parameter of each artifact family, so no existing name changes
  - delivery branch naming
  - ADR numbering, width, containment, and collision
  - plan-reference resolution, with exact slug equality
  - stash baseline capture and new-stash detection by hash
  - every dry run
- **Fetch (allowlisted under its own prefix):** the remote fetch of base-branch resolution, labelled as a read with a ref update. With a remote configured, a failed fetch or resolution stops with an outcome code, never falling back to the local branch.
- **Non-destructive writes:**
  - a place operation that writes a new artifact through a temporary file and `link`, so it can never overwrite and never leaves a stub; dated allocation and archival share it
  - the plan archive move with its status-marker flip
  - the plan legacy migration
  - the `.gitignore` or `info/exclude` rewrite

  Only the `.gitignore` rewrite and the bulk legacy migration ask for confirmation, after a preview with a digest. Archival keeps its current unattended path and its idempotent collision stop, without a new gate.

- **Destructive (never allowlisted):**
  - deleting the redundant untracked plan copy in `SOURCE_ROOT`, as a new target class bound to the hash of the copy that was checked
  - every stash drop, whether class A or a `discard` under `stashPolicy`, addressed by stash hash; the helper re-resolves the hash to its current `stash@{N}` and drops it within one call

Judgment stays in prose. For assignment by file overlap and for class A containment, the helper returns candidates and evidence (file sets, overlap, and whether each hunk is contained), and the prose decides. The assignment by an `R-\d{7}` ID in the stash message is exact and done in code. The prose also keeps the text a slug is derived from, the question when a plan reference is ambiguous, the decision whether an argument is a plan reference at all, the non-Git question before a `.gitignore` write, and the stash decisions for classes B to D. The silence rule for a deliberate base-branch divergence is passed in as a flag, not inferred in code.

The prose keeps every judgment and every interaction: whether a cleanup is wanted, the preview shown to the user, and the confirmation before a destructive operation. Only mechanical execution leaves the prose: locking, atomic writes, removals, git sequences, and the deterministic rules for names and references.

## Scope

### In scope (first version)

The first version is delivered in stages. Stages 0, 1, and 2 are each gated on the previous one. Stage 3 is split by risk class and depends on stages 0 to 2 only where noted.

- **Stage 0, allowlist spike.** A stub helper at the install's absolute path, with one non-destructive and one destructive prefix. The spike measures prompt behaviour in Claude Code default mode, auto mode, and subagent sessions. It also records the baseline prompt counts of today's prose.
- **Stage 1, guard, locks, and memory:**
  - the shared path guard
  - the lock core, taking over the memory lock and both commit locks, including the guarded orphan break
  - the typed memory operations for every existing writer and key family
  - the `setup` step that writes the absolute-path allowlist rule for the non-destructive prefixes
  - a before-and-after measurement against the success criterion
- **Stage 2, worktree lifecycle and cleanup:**
  - worktree-run records and their locks
  - the nine eligibility conditions with claim-remove-reconcile
  - worktree removal through non-force git
  - removal of the closed legacy list
  - the `.effective-flow/` directory migration
  - cleanup dry run and apply bound to the plan digest
- **Stage 3a, computation (independent of stages 0 to 2, can start now):**
  - the `effective-flow-mechanics.mjs` skeleton, importing the existing cores
  - base-branch resolution with its fetch prefix
  - name allocation with per-family suffix schemes, the local date, and a defined transliteration rule
  - delivery branch naming, with the disclosure stripping reconciled with `assertUndisclosed`
  - ADR numbering
  - plan-reference resolution
- **Stage 3b, non-destructive writes (after the stage 1 guard core):**
  - the shared place operation
  - plan archival with the status-marker flip
  - the plan legacy migration
  - the `.gitignore` and hidden-mode `info/exclude` target state, with closed lists of accepted legacy spellings
- **Stage 3c, stashes and destructive mechanics (after stage 0 has validated destructive prefixes):**
  - stash baseline by hash in Phase 1
  - detection, ID assignment, and candidate evidence for overlap and containment
  - the hash-addressed stash drop
  - deleting the untracked plan copy bound to its hash
- **Throughout:**
  - unit tests for the core
  - a conformance test against the current on-disk protocol
  - a distribution check that both helpers ship in every target
  - the prose guard `runtime-state-safety.md` stays for every mutation the helper does not take over

### Non-goals

- **A separately installed binary like Dalo's.** It would add a second install channel and version drift between the skill and the binary, while the bundled script already covers every harness.
- **Bypassing harness security as a goal.** The helper replaces many unpredictable commands with one auditable entry point. Destructive operations keep their harness prompt.
- **Allowlisting destructive operations.** Applying a cleanup and breaking a lock are never covered by the recommended rule.
- **Widening the Codex sandbox.** The helper runs inside the same sandbox as the shell. Where Codex refuses a write, as with `.git`, the helper reports the denial and does not work around it.
- **Moving `git worktree add` or the `git rm` of legacy remnants in `cleanup` out of prose.** Worktree creation stays where it is today. Removing tracked legacy remnants is a rare, user-visible deletion that `cleanup` presents for the user's own commit. Staged moves such as plan archival are a different case, and they do move into the helper.
- **Generic memory writes.** No operation writes an arbitrary object into `memory.json`.
- **Migrating script-owned state that already works.** The issue-buddy, pilot, ledger, and diff-baseline state stays in its own scripts.
- **Harmonizing the conventions of all existing helpers.** The new helper follows one convention. Retrofitting the others is separate work.
- **Commit-type choice, session-title choice, and the merge-gate ask and repair logic.** These involve judgment. At most their syntax checks could later become helper operations.
- **The smaller mechanics found alongside stage 3.** The worktree setup command lookup, the commit staged-subset check, the PR-body filter, and the commit-message attribution lint are left for later.
- **Moving decisions, confirmations, or review judgment into code.** These remain the orchestrator's responsibility.

## Technical direction

- **Platform:** a dependency-free Node.js 22 ES module in `src/scripts/`, listed in `RUNTIME_SCRIPT_FILES` and shipped unchanged to the native Claude, native Codex, and portable targets.
- **Options considered:**
  - **One bundled helper (chosen).** One allowlist rule for the non-destructive prefixes, plus one shared guard and lock core.
  - **One helper per domain** (memory, worktree runs, …). This matches `diff-baseline`, but needs one allowlist rule per script and spreads the guard across scripts.
  - **A permission template only.** `.claude/settings.json` rules for the current shell commands would mean no code to write, but the commands stay unpredictable, the protocols stay untested, and Codex gains nothing.
  - **A PreToolUse hook that verifies the script path.** The most robust binding, but an extra mechanism that exists only in Claude Code. It stays a fallback in case the stage 0 spike fails.
- **Coarse architecture:**
  - a thin CLI over a testable core, with git calls injected through the shared `process-runner.mjs` so the core spawns no processes
  - one command family per domain, with destructive operations under their own command prefixes
  - results returned as machine-readable outcome codes, so the prose branches on an outcome instead of parsing text
- **Stage 3 placement:**
  - **A separate mechanics helper (chosen).** `effective-flow-mechanics.mjs` imports the cores that already own parts of the rules. It is independent of the stage 0 outcome and of the runtime-state ADR, and costs one more absolute-path allowlist rule, which `setup` writes anyway.
  - **Extending the owning scripts.** This stays close to each owner, but retrofits `plan-lint` and `setup-status`, whose header states that `setup` stays the only writer, with new conventions.
  - **The runtime-state helper.** This needs one rule fewer, but ties stage 3 to a stage 0 stop and blurs the helper's purpose.
- **Prose side:** the lock, memory, worktree-lifecycle, and mechanics fragments shrink to the call and the handling of each outcome. The always-loaded context saving is limited to the eager hosts:
  - for stages 1 and 2: `cleanup`, `deliver`, `apply-review-commit-mechanics`, `worktree-integration`, and `effective-flow-dir-migration`
  - for stage 3: `pr` (base-branch resolution), `refactor` (plan-reference routing), and `setup` (the ADR convention)

  `plan-archival`, `plan-numbering`, and `concept-contract` are lazy everywhere, so their saving is per call.

- **Data and compatibility:**
  - The helper keeps the existing on-disk protocol exactly: a lock is a `mkdir` directory with an `owner.json` (memory) or `owner` (worktree-run and both commit locks), and writes go through a temporary file and a rename. It uses no `flock`, no exclusive lock files, and no new schema.
  - This compatibility is permanent rather than transitional. One repository can be driven at the same time by different installs, such as a native local link and a portable DALO install, Codex and Claude, or a session started before an update.

### ADR candidates

- **Runtime state is mutated only through the bundled helper.** This shifts responsibility from prose to code for a whole state family and binds future tools.
- **Destructive helper operations are never allowlisted, and the operation always appears in the command line.** This is the security boundary that keeps harness prompts and classifier review on every deletion.
- **The lock on-disk protocol is a permanent compatibility contract.** Different installs can operate on one repository at the same time, so the format cannot evolve freely.
- **Mechanics helpers import the code that owns a rule and never copy it.** This keeps one source of truth for status markers, slugs, and ignore state across scripts.
- **Effective Flow does not widen the harness sandbox.** This sets the limit on Codex parity and rules out workarounds.

## Risks and open questions

- **Stage 0 may fail.** If auto mode or subagent sessions drop or ignore an absolute-path rule, the success criterion cannot be met through the allowlist alone. The fallback is the PreToolUse hook, which applies to Claude Code only.
- **Install path changes.** The absolute-path rule must be rewritten when the skill moves, for example from a DALO install to a local link. A stale rule causes prompts but never wrongly approves a command.
- **Self-attested creation.** Run records start from prose-executed `git worktree add`. The creation-commit and fresh-registration checks narrow this, and git's non-force refusal is the backstop.
- **Typed memory is rigid.** Every new memory key family needs a new helper operation and release. This is intended, but it adds friction for future tools.
- **Stage 3 touches many hosts.** Base-branch resolution, name allocation, and reference resolution are hosted by many tools, so the per-call behaviour of most workflows changes at once, even though few hosts load them eagerly.
- **Fetch inside the helper.** An allowlisted fetch gives network egress and ref writes without a prompt. The remote name is bounded by `git remote`. In Codex the fetch needs network and `.git` escalation. With a remote configured, a failed fetch must keep stopping and never fall back to the local branch.
- **Silent behaviour changes.** Fixing the local date, slug transliteration, exact slug matching, and the reconciled disclosure stripping in code can change names that the prose produced slightly differently before. Fixtures must pin today's intended behaviour first.
- **Unattended archival gains a prompt.** Deleting the untracked plan copy is destructive and therefore prompts in Claude Code, even during an otherwise unattended delivery.
- **Behavioural eval re-recording.**
  - Lock and memory fragments may be loaded by all three suites (`merge-gate`, `iterate`, `next-steps`).
  - Stage 3 also moves the `merge-gate` and `iterate` instruments, through `worktree-integration` with base-branch resolution and branch naming.
  - Sharing code with `remote-tracker-shared-core.mjs` moves the `next-steps` instrument, which hashes that file directly.
  - Every affected suite must be re-recorded before the next release.

## Roadmap and work packages

1. **Allowlist spike (stage 0)**
   - **Goal:** prove or disprove that an absolute-path allow rule for a non-destructive prefix removes the prompts, while a destructive prefix keeps prompting, in default mode, auto mode, and subagent sessions.
   - **Scope:** a throwaway stub helper; today's prompt counts as the baseline; a short written result.
   - **Done when:** each mode has been run at least three times and the result says go, go with the hook fallback, or stop.
   - **Depends on:** nothing.
   - **Handoff:** `effective-flow plan "Work package 1 'Allowlist spike' from docs/concept/2026-10-29-runtime-state-cli.md: measure Claude Code prompt behaviour for an absolute-path node allow rule with separate non-destructive and destructive command prefixes in default mode, auto mode and subagent sessions, record today's baseline prompt counts for review, iterate and cleanup, and conclude go, hook fallback, or stop."`
2. **Guard and lock core (stage 1)**
   - **Goal:** the helper skeleton with the path guard and the lock core, taking over the memory lock and both commit locks, including the guarded orphan break.
   - **Scope:**
     - the shipped helper and its `RUNTIME_SCRIPT_FILES` entry
     - unit tests, plus a conformance test against the prose protocol
     - the prose of `memory-state`, `iterate`, and `apply-review-commit-mechanics` reduced to helper calls for locking
   - **Done when:** the tests pass, the distribution check shows the helper in every target, and no prose lock replay remains for these three locks.
   - **Depends on:** 1 (go).
   - **Handoff:** `effective-flow plan "Work package 2 'Guard and lock core' from docs/concept/2026-10-29-runtime-state-cli.md: add the bundled effective-flow-state helper with the shared path guard and lock core, take over memory.lock, iterate-commit.lock and apply-review-commit.lock including the guarded orphan break, keep the on-disk lock protocol exactly, and replace the prose lock replays with helper calls."`
3. **Typed memory operations and allowlist setup (stage 1)**
   - **Goal:** every `memory.json` writer uses the typed helper operations, and `setup` writes the absolute-path allowlist rule for the non-destructive prefixes.
   - **Scope:** reserving a finding range, setting a marker, the directory migration, and implicit legacy adoption; the writers in `review`, the review-state fragments, `setup`, `issue-tracker-forge`, `effective-flow-dir-migration`, and `worktree-integration`; a re-check of the success criterion against the baseline.
   - **Done when:** no prose writer of `memory.json` remains, and the stage 1 measurement meets the success criterion for `review` and `iterate`.
   - **Depends on:** 2.
   - **Handoff:** `effective-flow plan "Work package 3 'Typed memory operations and allowlist setup' from docs/concept/2026-10-29-runtime-state-cli.md: move every memory.json writer to typed helper operations (reserve, set-marker, migrate-directory, implicit legacy adoption), let setup write the absolute-path allow rule for the non-destructive prefixes only, and measure review and iterate against the baseline."`
4. **Worktree lifecycle and cleanup (stage 2)**
   - **Goal:** worktree-run records, their locks, eligibility and claim-remove-reconcile, worktree removal, legacy removal, and the directory migration go through the helper. Cleanup apply is bound to the dry-run digest.
   - **Scope:**
     - the prose of `worktree-lifecycle` and `cleanup` reduced to helper calls and outcome handling
     - the Codex escalation notice for `.git` writes
     - eval re-recording for every affected suite
   - **Done when:**
     - the lifecycle tests cover every transition and eligibility condition
     - the `cleanup` measurement meets the success criterion
     - no prose `rm` remains for runtime state or the legacy list
   - **Depends on:** 2 and 3.
   - **Handoff:** `effective-flow plan "Work package 4 'Worktree lifecycle and cleanup' from docs/concept/2026-10-29-runtime-state-cli.md: move worktree-run records, their locks, the nine eligibility conditions with claim-remove-reconcile, non-force worktree removal, the closed legacy removal list and the .effective-flow directory migration into the helper, bind cleanup apply to the dry-run plan digest, and re-record the affected behavioural eval suites."`

5. **Mechanics computation (stage 3a)**
   - **Goal:** the mechanics helper with base-branch resolution, name allocation, delivery branch naming, ADR numbering, and plan-reference resolution, importing the existing cores.
   - **Scope:**
     - fixtures that pin today's intended behaviour first
     - the owning fragments reduced to helper calls, with the restated copies removed
     - the fetch prefix
   - **Done when:** the stage 3 criteria hold for all five procedures, and the `CONTEXT_BUDGET_LINES` entries of `pr`, `refactor`, and `setup` are lowered.
   - **Depends on:** nothing; it can run in parallel with 1.
   - **Handoff:** `effective-flow plan "Work package 5 'Mechanics computation' from docs/concept/2026-10-29-runtime-state-cli.md: add the bundled effective-flow-mechanics helper that imports plan-lint-core, plan-publication-core and setup-status-core instead of copying them, and move base-branch resolution (no local fallback after a failed fetch with a remote configured), name allocation with per-family suffix schemes, delivery branch naming, ADR numbering and plan-reference resolution into it, pinned by fixtures first."`
6. **Mechanics writes (stage 3b)**
   - **Goal:** the shared place operation, plan archival with the status flip, the plan legacy migration, and the `.gitignore`/`info/exclude` target state go through the mechanics helper.
   - **Scope:** a preview with a digest for the `.gitignore` rewrite and the bulk legacy migration; archival unchanged in its unattended path; closed lists of legacy spellings.
   - **Done when:** the stage 3 criteria hold for these procedures, and no prose replays the archive state table or the ignore rewrite.
   - **Depends on:** 2 (guard core) and 5.
   - **Handoff:** `effective-flow plan "Work package 6 'Mechanics writes' from docs/concept/2026-10-29-runtime-state-cli.md: add a shared temp-file-and-link place operation to the mechanics helper and move plan archival with the status-marker flip, the plan legacy migration and the .gitignore and hidden-mode info/exclude target state into it, with a confirmed digest preview only for the gitignore rewrite and the bulk legacy migration."`
7. **Stashes and destructive mechanics (stage 3c)**
   - **Goal:** the stash baseline by hash, detection, ID assignment, candidate evidence, and the hash-addressed drop, plus deleting the untracked plan copy bound to its hash.
   - **Scope:** Phases 1 and 6 of `apply-review` reduced to helper calls, with classes B to D still decided in prose; destructive prefixes only.
   - **Done when:** no stash is addressed by index in prose, every drop goes through the helper, and fixtures cover index shifts between detection and drop.
   - **Depends on:** 1 (destructive prefixes validated), 2, and 6.
   - **Handoff:** `effective-flow plan "Work package 7 'Stashes and destructive mechanics' from docs/concept/2026-10-29-runtime-state-cli.md: move the apply-review stash baseline, new-stash detection by hash, R-ID assignment, overlap and containment evidence and every stash drop (class A and discard) into hash-addressed mechanics helper operations under destructive prefixes, and move the deletion of the untracked plan copy in SOURCE_ROOT into a hash-bound destructive operation."`

## Concept review

**Result:** Approved

| Area                  | Assessment                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product fit           | Clear problem with a measurable success criterion. The context-cost claim is limited to the eager hosts.                                           |
| Scope                 | Delivered in stages; destructive operations, generic memory writes and sandbox widening are explicitly excluded.                                   |
| Technical feasibility | Builds on the existing script pattern. The Codex `.git` protection is verified, and Codex parity is limited to locks and memory accordingly.       |
| Data and security     | Three guard layers. Destructive operations are never allowlisted. The rule is bound to an absolute path, and orphan breaks are compare-and-remove. |
| Risks                 | Stage 0 is the main uncertainty and has a defined fallback. Permanent protocol compatibility is acknowledged.                                      |
| Roadmap               | Seven ordered work packages with done criteria and handoffs. Stage 3a can start in parallel with the spike.                                        |

Findings:

- **Critical: an allowlist rule without a fixed path approves a planted file of the same name, and auto mode drops wildcarded interpreter rules.** Decision: `setup` writes an absolute-path rule per install, and stage 0 verifies it first.
- **Critical: an allowlisted apply mode lets deletions bypass both the prompt and the auto-mode classifier.** Decision: destructive operations get separate command prefixes and are never allowlisted, and cleanup apply is bound to the dry-run digest. The success criterion is restated accordingly.
- **Important: the Codex `.git` protection was unverified.** Now verified from the Codex source, and the parity claim is limited to locks and memory.
- **Important: the path guard rejected `.sf-memory.json`, which the memory protocol deletes, and a worktree base directory outside the repository.** Incorporated: the legacy list now includes `.sf-memory.json`, and the helper never unlinks worktree paths itself.
- **Important: whether worktree ownership checks move into code was left open.** Incorporated: eligibility and claim-remove-reconcile live in the helper, record initialization is verified against git, and creation remains self-attested.
- **Important: the shape of the memory API was unspecified.** Decision: typed operations only.
- **Important: the concept treated mixed-version operation as a rollout risk only.** Incorporated: protocol compatibility is now a permanent constraint with a conformance test.
- **Important: orphan-lock recovery was unresolved.** Decision: a guarded compare-and-remove break with a lock-directory identity check, treated as destructive.
- **Important: the riskiest assumption was tested last, and the measurement sample was thin.** Decision: a staged rollout that starts with a stage 0 spike, with at least three runs per mode.
- **Note: the context-cost motivation was overstated.** Incorporated: the claim is limited to the five eager hosts.
- **Note: two factual errors.** Corrected: the owner file names and the users of `process-runner.mjs`.
- **Note: the eval cost was understated.** Incorporated: all three suites are named as possibly affected.

Findings of the stage 3 round:

- **Critical: the concept claimed base-branch resolution falls back to the local branch after a failed fetch.** The source says the opposite when a remote is configured. Corrected, and the stop is pinned as a fixture.
- **Important: the stage 3 placement made it hostage to stage 0 and copied existing code.** Decision: a separate mechanics helper that imports the owning cores.
- **Important: stage 3 mixed three risk classes and waited for stages 0 to 2.** Decision: split into 3a, 3b, and 3c with their own dependencies.
- **Important: archival deletes an untracked project file that the path guard did not allow.** Decision: a hash-bound destructive target class.
- **Important: exclusive create contradicts archival's temp-and-link design and the no-stub rule.** Decision: allocation computes only the name, and a shared place operation writes.
- **Important: three suffix schemes exist.** Decision: one parameter per family, with no renamed outputs.
- **Important: the `git rm` non-goal contradicted the staged moves, and stash drops had two paths.** Decision: the non-goal is narrowed to legacy remnants in `cleanup`, and every drop goes through one hash-addressed command.
- **Important: hidden judgment in overlap assignment, containment, and slug matching.** Decision: ID match and slug equality are exact in code; overlap and containment come back as evidence for the prose.
- **Important: preview-then-apply was undefined and would gate unattended archival.** Decision: confirmation only for the `.gitignore` rewrite and the bulk legacy migration.
- **Important: the stash baseline is not hash-based today, and `git stash drop` takes no hash.** Incorporated: baseline by hash, with the hash re-resolved to its index inside the drop call.
- **Important: Codex `.git` protection also covers fetch, staged moves, stash drops, and `info/exclude`.** Incorporated into the harness context and use cases.
- **Important: no measurable criterion for stage 3.** Incorporated: per-procedure fixtures, reduced fragments, and lowered budgets.
- **Important: the eval and context costs were misstated.** Incorporated: all three suites named, and the context saving restated per eager host.
- **Note: the fetch is networked but was labelled a read.** Decision: an allowlisted prefix of its own, labelled as a read with a ref update.
- **Note: wrong citations for branch naming, the disclosure check, and reference resolution.** Corrected.
- **Note: the local date and transliteration were unspecified.** Incorporated as fixtures and a risk.
- **Note: wording still framed the helper around `.effective-flow/` only.** Corrected.
- **Note: the `.gitignore` procedure was understated.** Incorporated: closed spelling lists, the non-Git question in prose, and the hidden-mode `info/exclude` arm in scope.

## Open points

- No open points.
