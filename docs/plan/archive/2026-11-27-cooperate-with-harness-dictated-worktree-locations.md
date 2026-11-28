# Cooperate with harness-dictated worktree locations

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Effective Flow runs in three hosts: Claude Code, Codex (CLI and app), and T3 Code, which runs Claude
or Codex as the model. Several of these hosts decide where worktrees may live. When one does,
Effective Flow should follow that decision instead of working against it.

**Trigger.** A T3 Code session with Claude ran `plan` with publication, then `apply` → `build` on
the published plan. Plan-PR continuation provisions a sibling worktree on the plan branch
(`src/shared/plan-pr-continuation.md:238-242`). That worktree is placed under the configured
`worktree.baseDir`, which was the default `.effective-flow/.worktrees`.

The user's global instructions allow temporary worktrees for the project runner only under one
machine directory. The agent honoured that and created the worktree there, outside the configured
base. The consequences:

- the worktree got no lifecycle record;
- cleanup was manual;
- the report had to list the deviation;
- `record-init` would have rejected a record at that path, because its location proof
  (`src/scripts/effective-flow-state-worktree-core.mjs:1790-1801`, `:801-811`) checks only the
  configured base.

Nothing in the contract lets a machine declare its location. **Part 3 fixes the trigger.**

**Scope.** The plan has four parts, delivered as three work packages. Part 2 is deferred.

1. **Harness branch reuse.** Today the only rule for obtaining a delivery branch in a reused
   harness-managed worktree is "create or adopt it through the harness-supported flow"
   (`src/shared/worktree-integration.md:198-203`), and its branch may not be switched (`:133-135`,
   `:508`).
   - A clean harness branch that has no commits beyond the base, and is not the base branch,
     becomes the delivery branch without a question.
   - A detached harness checkout gets an Effective Flow-created delivery branch, and so does a
     clean checkout on the base branch. In both cases the branch is created immediately before the
     first commit.
   - Every other case keeps today's behaviour.
2. **Host-created worktrees: deferred.** No host offers a usable facility to create a worktree in
   the middle of a session today.
   - Claude Code's `EnterWorktree` creates under `.claude/worktrees/` from the host's base ref. It
     is meant only for explicit user or instruction requests, and its remove path deletes the
     branch.
   - T3 Code and the Codex app create worktrees only at thread or task start.

   The decision record documents this gap.

3. **Machine-level worktree base.**
   - The environment variable `EFFECTIVE_FLOW_WORKTREE_BASE_DIR` wins over the ADR values
     `worktree.baseDir` and `applyReview.worktree.baseDir`, so no machine path enters a
     repository.
   - One helper computes every worktree path and prepares its parent directories.
   - The record schema stays at version 1.
4. **Conflict stop.** It applies when no environment base is set and an instruction in the agent's
   loaded context forbids the computed path. An interactive run then asks before creating anything,
   and a non-interactive run stops without publishing.

**Why Feature.** The change adds a configuration input, a delivery-branch rule for harness
worktrees, a stop, and a blocker kind. That is new observable workflow behaviour in every
worktree-creating tool, so it is not a refactoring.

**User decisions** (2026-11-27):

- The host-declared base wins over the ADR, and it comes from an environment variable only.
- An existing harness branch is reused.
- Part 2 is deferred for every host.
- A harness worktree that fails the reuse conditions keeps today's behaviour.
- In a detached checkout, and in a clean checkout on the base branch, Effective Flow creates the
  branch itself, immediately before the first commit.
- The record schema gets no version 2.
- The conflict question offers no agent-supplied location and no "continue here" option.

**Decisions during implementation** (2026-11-28):

- A location conflict in Autopilot's delivery-base attempt records `unresolved` and still
  publishes the draft. Other Autopilot location conflicts still block publication.
- A new delivery branch in a reused harness checkout starts at the freshly resolved base commit.
- Implement the fixture and evaluator support for the three new scenarios. Record missing live
  evidence separately from the automated tests of that support.

## Outcome checkpoint

**Primary source:** user request in a Recensor session retro, 2026-11-27, for
`sebastian-software/effective-flow` (base `origin/develop` @ `76572d46`).

**Original outcome:** in Claude Code, Codex and T3 Code, worktree-creating tools use the location
the host dictates. They leave no unrecorded worktrees, never deviate silently from a host rule, and
keep every existing ownership, receipt and cleanup guarantee.

**Last evaluated attempt:** all three work packages landed on the delivery branch. The merged
candidate built and passed the focused integration contracts. Full package validation is a PR CI
gate; live host observations are still outstanding.

**No-progress count:** 0

**Cumulative approach:** three work packages in this order:

1. the machine-level base and path helper (part 3);
2. the conflict stop (part 4);
3. harness branch reuse (part 1).

Host-created worktrees (part 2) are documented as deferred.

**Continuation decision:** deliver on the existing plan PR. Keep the missing live host evidence
visible rather than treating fixture tests as observations.

## Architecture decisions

### Host-agnostic by construction

Every new rule decides from two inputs only: Git facts and the helper's resolution of the
environment. It never decides from host identity or `{{BUILD_TARGET}}`. That keeps the behaviour
identical across these hosts:

- Claude Code;
- Codex CLI and Codex app;
- T3 Code with Claude or Codex, which runs the `claude` or `codex` bundle.

No new host-identity rule is introduced.

### One path helper (part 3)

**Path resolution.** A new helper operation, `worktree path-resolve`, takes the purpose, the
session ID, and the purpose's suffix or apply-review group. It returns:

- the complete leaf path;
- the parent segments still to create;
- the base;
- the base's source (`environment`, `configuration` or `default`; the list is closed);
- diagnostics.

The precedence is fixed:

1. `EFFECTIVE_FLOW_WORKTREE_BASE_DIR`, read through the injected `deps.env`. It reaches
   `resolveBases` today: the state CLI injects `process.env` at
   `src/scripts/effective-flow-state.mjs:213`.
2. The ADR key, `worktree.baseDir`, or `applyReview.worktree.baseDir` for apply-review.
3. The default.

An empty variable counts as unset, as an empty ADR value does today
(`effective-flow-state-worktree-core.mjs:776-779`). `resolveBases` uses the same implementation. The
agent learns whether the variable is set only from this output, never from a shell probe. An ADR
value that differs from an environment base is a diagnostic: the agent reports it once and
continues.

**Directory preparation.** A second helper operation, `worktree path-prepare`, checks and creates
the parent segments. The agent no longer runs `mkdir` for them. The trust check is
`foreignWriter` (`src/scripts/effective-flow-state-harness-core.mjs:189-202`), moved into a new
leaf module and applied to the base, its ancestors and each created segment. It already accepts a
user-private group and a sticky root directory, and it checks the whole resolution chain. The leaf
must not exist before `git worktree add`; it is checked after creation.

An invalid environment base, a failed trust check or a denied sandbox each fails closed with a
named error. None of them falls back to the ADR value or the default.

**Shared module.** The trust check and the reuse facts live in leaf modules that both cores import:
`src/scripts/path-trust-core.mjs` and `src/scripts/worktree-reuse-facts-core.mjs`. This avoids an
import cycle, because worktree-core already imports `build-run-core` at line 192
(ADR `mechanics-helpers-import-owning-cores.md`). Both modules are registered in `build.mjs`
`RUNTIME_SCRIPT_FILES`.

**No schema change.** Records stay at version 1.

- `record-init` keeps its location proof against the helper's current result.
- Cleanup has no location proof today (`:1153-1206`), so a later change of the variable cannot
  affect removal.
- The unrecorded-worktree scan (`:2236-2263`) additionally derives its roots from the parent of the
  session leaf of each existing record's `worktreePath`. A worktree under an earlier base therefore
  stays visible.

**Variable source.** The configuration guide names only user-level scopes for setting the variable:

- `~/.claude/settings.json` `env`;
- `~/.codex/config.toml` `shell_environment_policy`;
- the T3 Code provider environment.

It explicitly excludes project-level `.claude/settings.json` and `.codex/config.toml`, because a
repository could otherwise steer the base. The helper cannot tell where the variable came from, so
the ADR records this residual risk.

### Conflict stop (part 4)

The new lazy fragment `src/shared/worktree-conflict-stop.md` is included at every path-building
site. It applies only when `path-resolve` reports no environment source and an instruction in the
agent's loaded context forbids the computed path. That context includes the system context,
`CLAUDE.md` or `AGENTS.md`, and the host runtime information.

- **Interactive runs** ask before `path-prepare`. There are two options: set
  `EFFECTIVE_FLOW_WORKTREE_BASE_DIR` and restart, or abort.
- **Autopilot** records the new blocker kind `worktree-location-conflict`.
  - `prAppendixOperation` returns `withheld` for it (`src/scripts/autopilot-core.mjs:2236-2250`).
  - `blocker-record` accepts no `summary` for it and renders a fixed neutral line, with a closed
    key set as for `security` (`:1024-1030`, `:2183-2192`).
  - It publishes no plan-only draft.
  - It closes as the security blocker does (`autopilot-blockers.md:33-35`, `autopilot-core.mjs:208-214`):
    - `plan-pull-request-unchanged` with the PR number when an issue source already has a plan PR;
    - otherwise `no-pull-request`.
  - The ADR `docs/adr/plan-only-unattended-publication.md` gains this exception.
  - A location conflict in the delivery-base attempt is not a blocker: record `unresolved` with
    reason `worktree-location-conflict` and continue publishing without exposing the machine path.
- **Every other non-interactive run** ends with `ABORT: worktree-location-conflict` and the same
  neutral message. This includes `Run state: non-interactive` or `relayed`, an Issue Buddy pass,
  or a leaf without a user channel. Same-session delegation and `Run state: gated` inherit the
  caller's interactivity.
- **Public text never quotes the machine path or the instruction.** Both appear only in the local
  question or report.

### Harness branch reuse (part 1)

**Unchanged for reused worktrees.** A reused harness worktree stays `harness-managed`: it gets no
lifecycle record, no removal, and no automatic setup. The `deliver` partial-diff exception and the
plan-publication, plan-PR-continuation and plan-only-draft siblings are unchanged. They now land
under the resolved base, and that is the trigger's fix.

**Reuse facts.** A new read operation, `worktree reuse-facts`, fetches the base ref and the HEAD
branch's upstream, then reports:

- whether the tree and index are clean;
- untracked files outside the ignore rules;
- the commit count beyond the fresh base;
- whether HEAD is an ancestor of the base;
- upstream divergence;
- the detached state;
- whether HEAD is the base branch.

The build run re-derives these facts in `authorize-execution` and records a closed field,
`branchSource`, in `authorization.json`. Its values are `adopted`, `created` or `existing`, and the
rejection conditions are as listed below.

**Adopt.** The host branch becomes the delivery branch without a question when all of these hold:

- HEAD is a branch;
- that branch is not the base branch;
- the tree and index are clean;
- there are no untracked files outside the ignore rules;
- there are no commits beyond the base;
- no upstream commit is absent from both HEAD and the fresh base;
- in hidden mode, the name passes the `prefix-discloses` check of `delivery-branch-name`
  (`worktree-integration.md:162-168`).

If HEAD is a strict ancestor of the base, the order is fixed:

1. `authorize-execution` with `baseHead` equal to the target OID;
2. `git merge --ff-only`;
3. the transition, which requires `head === baseHead` (`build-run-core.mjs:1733-1737`, `:1957-1961`).

A failed fast-forward means no adoption.

The adopted branch keeps the host's name, and its branch-created flag stays false. Completion and
abort therefore never delete it. `effective-flow cleanup` deletes it only under the orphan-branch
class: it carries `delivery.branchPrefix`, it is not checked out, and its content has landed
(`effective-flow-state-worktree-core.mjs:3969-4007`).

**Create (detached or base branch).** This applies to a detached harness checkout, typically in the
Codex app. It also applies to a clean harness checkout on the base branch with no commits beyond the
base and no untracked files.

- Effective Flow creates the delivery branch, named through `delivery-branch-name`, immediately
  before the first commit.
- If HEAD is behind the base at setup, move it to the fresh base with `git switch --detach`,
  leaving the local base branch unchanged. Otherwise keep the checkout's existing identity.
- It sets the run's branch-created flag and records the creation OID in `authorization.json`. It
  issues a new verified receipt.
- An empty result or an abort before the first commit leaves no branch, so the empty-branch cleanup
  never has to switch the harness back (`worktree-integration.md:346-361`, `:419-421`).
- After a commit, the branch is kept and reported. The orphan-branch class removes it once the
  harness releases the worktree and its content has landed.
- This explicitly supersedes the "harness-supported flow" rule and the no-switch rule for these two
  cases, at `src/shared/execution-location.md:131-133`, `src/shared/worktree-integration.md:200-202`
  and `:508`, and `src/shared/build-run-contract.md:40`.

**Every other case keeps today's behaviour:** a dirty tree, commits beyond the base, a foreign
upstream commit, untracked files, or a hidden-mode name that discloses the prefix. That means reuse
with shared precondition 3 (`worktree-integration.md:157-161`), or the partial-diff path.

**Where part 1 applies.** It is reachable from every tool that loads `worktree-integration`:
`build` through `build-delegated-run`, and `fix`, `refactor`, `docs` and `maintain` directly. It is
also reachable from the build run's `reuse-worktree` mode. `apply-*` and `deliver` provision their
own worktrees and are unaffected.

### Host-created worktrees (part 2): deferred

The decision record documents the Claude Code `EnterWorktree` facts:

- it uses its own location and base ref;
- it is meant only for explicit requests;
- `ExitWorktree remove` deletes the branch;
- `EnterWorktree(path)` could later move a session into an Effective Flow-created worktree.

It also records that T3 Code and the Codex app create worktrees only at thread or task start. The
environment base covers all three hosts meanwhile, and no new ownership kind is added.

## Affected files

| File                                                                                                                                                                  | Description                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/adr/` (new ADR)                                                                                                                                                 | Decisions above; superseded harness-flow and no-switch rules for the two create cases; part 2 deferral facts; variable-source residual risk.                                                                                                                           |
| `docs/adr/plan-only-unattended-publication.md`                                                                                                                        | Exception for `worktree-location-conflict`.                                                                                                                                                                                                                            |
| `src/scripts/effective-flow-state-worktree-core.mjs`                                                                                                                  | `path-resolve`, `path-prepare`, `reuse-facts`; `resolveBases` (`:762-788`) on the shared resolver; scan roots from existing records (`:2236-2263`).                                                                                                                    |
| `src/scripts/path-trust-core.mjs` (new)                                                                                                                               | `foreignWriter` moved from `effective-flow-state-harness-core.mjs:189-202`; both cores import it.                                                                                                                                                                      |
| `src/scripts/worktree-reuse-facts-core.mjs` (new)                                                                                                                     | Fact derivation shared by worktree-core and build-run-core.                                                                                                                                                                                                            |
| `src/scripts/build-run-core.mjs`                                                                                                                                      | `authorize-execution` re-derives facts; `branchSource`; ff-only ordering; branch-created flag and creation OID for the create cases.                                                                                                                                   |
| `src/scripts/autopilot-core.mjs`                                                                                                                                      | `BLOCKER_KINDS` (`:183-198`), `blocker-record` (`:1024-1030`), summary rendering (`:2183-2192`), `prAppendixOperation` (`:2236-2250`), close outcome.                                                                                                                  |
| `src/scripts/effective-flow-state-core.mjs`                                                                                                                           | Register the three operations in `STATE_OPERATIONS`, `OPERATION_KEYS`, allowlist class (`:103-148`, `:365-381`).                                                                                                                                                       |
| `src/scripts/claude-settings-core.mjs`                                                                                                                                | Allow rules for the new operations (`:73-76`).                                                                                                                                                                                                                         |
| `build.mjs`                                                                                                                                                           | `RUNTIME_SCRIPT_FILES` for the two new modules.                                                                                                                                                                                                                        |
| `src/shared/worktree-integration.md`                                                                                                                                  | `:133-135`, `:198-203`, `:508`: part 1 rules. Step 2 (`:204-222`): `path-resolve` and `path-prepare`. Lazy pointers to the conflict stop and the reuse detail.                                                                                                         |
| `src/shared/worktree-conflict-stop.md` (new, lazy)                                                                                                                    | Part 4: question, autopilot blocker, non-interactive abort, neutral public text.                                                                                                                                                                                       |
| `src/shared/execution-location.md`                                                                                                                                    | Harness-owned worktrees (`:122-142`): reuse facts and the create cases replacing `:131-133`.                                                                                                                                                                           |
| `src/shared/build-run-contract.md`                                                                                                                                    | `:40` per the ADR; `branchSource`.                                                                                                                                                                                                                                     |
| `src/shared/worktree-lifecycle.md`                                                                                                                                    | Helper operations (`:131-209`): the three new operations and the scan roots.                                                                                                                                                                                           |
| `src/tools/apply-review-commit-mechanics.md`                                                                                                                          | `:94-103`: `path-resolve` with group; sandbox note pointer.                                                                                                                                                                                                            |
| `src/shared/plan-publication.md` (`:223-237`), `src/shared/plan-pr-continuation.md` (`:232`, `:238-242`), `src/shared/merge-gate-checkout-boundary.md` (`:37`)        | `path-resolve`/`path-prepare`; conflict-stop pointer.                                                                                                                                                                                                                  |
| `src/shared/autopilot-blockers.md` (`:33-35`, `:50-63`), `src/shared/autopilot-issue-source.md` (`:113`, `:140`), `src/shared/autopilot-delivery-conflict.md` (`:48`) | Same; blocker ending.                                                                                                                                                                                                                                                  |
| `src/tools/iterate.md` (`:593-597`), `src/tools/issue-buddy.md` (`:222-223`), `src/tools/apply-issues.md` (`:321-322`), `src/tools/deliver.md` (`:183`)               | Same.                                                                                                                                                                                                                                                                  |
| `src/tools/setup.md`, `src/shared/setup-advanced-settings.md`, `src/shared/setup-targeted-change.md`                                                                  | Name the variable beside `worktree.baseDir`, and that it wins.                                                                                                                                                                                                         |
| `src/tools/*.md`                                                                                                                                                      | `contextBudget` of every changed tool.                                                                                                                                                                                                                                 |
| `docs/developer-guide/configuration.md`                                                                                                                               | Precedence; user-scope settings per host, including Codex `sandbox_workspace_write.writable_roots` and Claude Code additional directories; project scopes excluded; environment-read sentence (`:415-417`); "available from the first release containing this change". |
| `test/effective-flow-state-worktree.test.mjs`, `test/support/worktree-fixtures.mjs`                                                                                   | Precedence, empty and invalid values, `path-prepare` trust cases (umask 002, private group, sticky, symlinked segment, existing leaf), scan roots after a base change.                                                                                                 |
| `test/path-trust-core.test.mjs`, `test/worktree-reuse-facts-core.test.mjs` (new)                                                                                      | Module-level tests.                                                                                                                                                                                                                                                    |
| `test/execution-location-git.test.mjs`, `test/execution-location-contract.test.mjs`                                                                                   | Git fixtures: adopt, behind (ff-only), dirty, ahead, foreign upstream, untracked, base branch (create), detached (create), hidden-mode disclosing name; superseded-rule text.                                                                                          |
| `test/build-run*.test.mjs`                                                                                                                                            | Re-derivation, `branchSource`, ff-only ordering, branch created at first commit, empty result leaves no branch.                                                                                                                                                        |
| `test/workflow-contracts.test.mjs`                                                                                                                                    | An explicit site list: each site uses `path-resolve` and carries the conflict-stop pointer; none composes `BASE_DIR/REPO_NAME`.                                                                                                                                        |
| `test/autopilot*.test.mjs`                                                                                                                                            | The new blocker: no summary accepted, appendix withheld, no draft, both close outcomes.                                                                                                                                                                                |
| `evals/` (`build-context`)                                                                                                                                            | A clean harness worktree adopted without `git worktree add`; a visible rule with no variable reaches the conflict stop; the ADR difference is reported once.                                                                                                           |

## Implementation details

### Approach

The work comes in three packages. Each is delivered with its own evidence, in this order.

**Work package A (part 3).**

1. Write the ADR, then the two leaf modules.
2. Add `path-resolve` and `path-prepare` with their registrations, move `resolveBases` onto the
   shared resolver, and derive the scan roots.
3. Do the site sweep. Use the explicit list in "Affected files", extended by
   `grep -rn "REPO_NAME\|worktree.baseDir\|BASE_DIR\|step 2\|worktree add" src/`.
4. Replace every path composition and `mkdir` with the helpers, and add the explicit-list contract
   test.
5. Update the configuration guide and setup.

**Work package B (part 4).**

1. Write `worktree-conflict-stop.md` and lazy-include it at every listed site.
2. Change the autopilot core and update the ADR exception.
3. Add the non-interactive abort.
4. Add the eval scenario.

**Work package C (part 1).**

1. Add `reuse-facts` and its re-derivation in `build-run-core`, with `branchSource` and the
   ff-only ordering.
2. Create the branch at the first commit for the two create cases.
3. Rewrite the harness passages and supersede the listed rules.
4. Add the eval scenario.

**Every package:**

- update the `contextBudget` lines;
- run `pnpm test:preflight` in the worker sandbox, then validate in CI order;
- record any eval evidence debt as `AGENTS.md` requires.

### Stop conditions

Stop and report instead of improvising when any of these occurs:

- the site sweep finds a path-building site whose provisioning cannot take the `path-resolve`
  result;
- `foreignWriter` semantics cannot cover a supported host's default layout;
- a host-tool fact the ADR states is contradicted by current behaviour;
- a test would have to weaken an existing ownership, receipt or removal guarantee to pass.

### Edge cases

- **Invalid or untrusted base:** a relative path, a missing directory, a failed `foreignWriter`
  check anywhere in the chain, a symlinked segment, or an existing leaf. The run stops before
  creation with a named error. An empty variable counts as unset.
- **Sandbox denies creation:** this covers Codex workspace-write without a writable root, and
  Claude Code without directory access. The run stops with a named error that points to the
  configuration guide.
- **The variable changes between creation and cleanup:** removal is unaffected, because cleanup
  has no location proof. The scan still sees the old root through the records.
- **The same basename in one session under one base:** `git worktree add` fails on the existing
  leaf, and the run stops. Nothing is overwritten.
- **Harness worktree behind the base:** for adoption, authorize, fast-forward the host branch,
  then transition. If the fast-forward fails, today's behaviour applies. For branch creation,
  authorize at the fresh base, switch to it detached, then transition without a delivery branch.
- **Abort after a commit on a created branch:** the branch is kept and reported. The harness is
  never switched back.
- **T3 Code session started without `workspaceStrategy`:** this is the main checkout, so there is
  no harness worktree. Part 3 applies, and part 4 applies when a rule is visible.
- **Hidden mode:** unchanged below `.effective-flow/`. An external environment base gets the
  `path-prepare` checks. An adopted name must pass `prefix-discloses`.

## Acceptance criteria

**Machine-level base (part 3)**

- [x] With the variable set to a valid directory and the ADR at `.effective-flow/.worktrees`, Git
      fixtures cover path resolution with source `environment`, parent creation, `git worktree add`,
      `record-init` and cleanup without manual steps.

- [x] `record-init` succeeds for the plan-publication and plan-PR-continuation leaves under an
      environment base, as fixture tests show. Contract tests pin their prose sites to
      `path-resolve`.
- [x] Every invalid or untrusted base in "Edge cases" stops before creation with a named error.
      Each case has a test, including `umask 002` own segments, which pass.
- [x] After the variable changes, the worktree stays removable and the scan reports an unrecorded
      worktree under the old root. Tests cover both.
- [x] Every site in the explicit list uses `path-resolve`/`path-prepare` and carries the
      conflict-stop pointer. No site composes `BASE_DIR/REPO_NAME`. A workflow-contract test
      enforces this.

**Conflict stop (part 4)**

- [x] The interactive contract requires a question before `path-prepare`, with exactly two
      options, when there is no variable and a visible rule forbids the worktree path.
- [x] Autopilot-core tests cover the `worktree-location-conflict` blocker: no summary, no
      appendix, no draft, and a `plan-pull-request-unchanged` or `no-pull-request` conclusion. For the
      delivery-base attempt they instead cover the `unresolved` reason without a blocker.

- [ ] Other non-interactive runs end with `ABORT: worktree-location-conflict`. Contract text
      covers this, and the `build-context` eval provides the evidence, or its debt is recorded with
      sign-off.

**Harness branch reuse (part 1)**

- [x] **Adopt:** Git fixtures and build-run tests cover adoption of a clean, non-base, unpublished
      harness branch with `branchSource: adopted`, including the ordered fast-forward when it lags.

- [x] **Today's path:** the dirty, ahead, foreign-upstream, untracked and hidden-mode-disclosing
      variants take today's path. Git-fixture tests cover them.
- [x] **Create:** for a detached checkout and for a clean base-branch checkout, the branch is
      created at the first commit with `branchSource: created`, the flag set, the creation OID
      recorded and a new receipt. An empty result leaves no branch. Tests cover both cases.

**Documentation and checks**

- [x] Reporting the ADR difference once per run has contract evidence.
- [x] The ADR and the ADR exception exist. The configuration guide documents user-scope settings
      for Claude Code, Codex and T3 Code and excludes project scopes.
- [ ] These pass: `pnpm test:preflight`, `pnpm agent:check`, `pnpm test`, `node build.mjs` and
      `pnpm test:distribution`. `pnpm eval build-context verify` passes, or the debt is recorded.
      Every changed tool's `contextBudget` is within its headroom.

## Implementation evidence

The three new `build-context` scenarios have runnable fixture setup and evaluator tests, but no
recorded host runs. The [suite's evidence notes](../../../evals/build-context/README.md) list the
remaining transcript checks. The live confirmation of the interactive question and the
post-release host matrix remain open. A package report without integrity errors does not replace
those observations.

## Validation plan

- **Automated:** the tests listed above via `pnpm test`, after `pnpm test:preflight` in the worker
  sandbox. Then `pnpm agent:check`, `node build.mjs` and `pnpm test:distribution`, in CI order, for
  each work package.
- **Evals:** the three `build-context` scenarios, followed by `pnpm eval build-context verify`.
  Rerun the suites that load the changed fragments, or record the evidence debt.
- **Manual acceptance after release:**
  - T3 Code with Claude: the trigger flow (`plan` with publication, then `apply`) with the
    variable set.
  - T3 Code with Codex: a clean T3 worktree, whose thread branch is adopted.
  - Claude Code: the main checkout, with the variable and directory access.
  - Codex CLI: with the variable and a writable root.
  - Codex app: a detached task, where the delivery branch is created at the first commit and the
    Handoff still works.

## Assumptions and open points

- **Assumption:** the variable reaches the helper scripts on every host when it is set in the user
  scopes named in the configuration guide. Codex's default inheritance does not filter this name.
  The manual runs confirm it.
- **Assumption:** a T3 Code thread branch may carry delivery commits and be pushed under its own
  name. T3 Code links the PR to the thread either way.
- **Assumption:** the Codex app's Handoff still works after Effective Flow creates a branch in a
  detached task worktree. The manual run confirms it; if it does not, the ADR records the limit.
- **Deliberately out of scope:**
  - host-created worktrees (part 2) on any host;
  - a user-level configuration file;
  - schema version 2 for lifecycle records.

  The ADR records each of these.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         7 |    1 |
| Security        |        0 |         2 |    0 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         2 |    1 |
| Testability     |        0 |         1 |    2 |
| Scope           |        0 |         1 |    3 |
| Maintainability |        0 |         1 |    1 |

The table counts the deep review. One finding spans error cases and data protection and is counted
under error cases.

### Findings

**Internal review (2026-11-27).** It found 1 critical, 13 important and 7 note findings. All were
incorporated or decided by the user. The main outcomes:

- Part 2 is deferred.
- A failed reuse condition keeps today's behaviour.
- The detached-checkout branch is owned by Effective Flow.
- There is no agent-supplied base.
- Blocker text is neutral.
- The site list is complete.
- Segment checks are added.
- The trigger is attributed to plan-PR continuation.

**Deep review (2026-11-27).** It found 0 critical, 14 important and 9 note findings. The user
decided four points on 2026-11-27; everything else was incorporated directly.

Decided by the user:

- **Important (Architecture/Scope):** schema version 2 and the stored base solved no cleanup
  problem. They are dropped. Records stay at version 1, and the scan roots come from existing
  records.
- **Important (Architecture):** the "continue here" option of the conflict question never applied.
  It is removed.
- **Important (Architecture):** a clean checkout on the base branch had no defined behaviour. It
  is now handled like the detached case.
- **Important (Architecture):** a branch Effective Flow creates in a harness checkout had no
  abort path. It is now created at the first commit, so an empty result leaves no branch.

Incorporated directly:

- **Important (Error cases/Data protection):** the new blocker would still have rendered and
  published. It now accepts no summary, withholds the appendix, publishes no draft, and adds the
  ADR exception.
- **Important (Error cases):** the close outcome is now `plan-pull-request-unchanged` when a plan
  PR exists.
- **Important (Architecture):** "unattended" outside autopilot is defined as
  `ABORT: worktree-location-conflict`.
- **Important (Architecture):** the ff-only ordering against `authorize-execution` and the
  `branchSource` field are specified.
- **Important (Maintainability):** an import cycle is avoided through leaf modules.
- **Important (Architecture):** the helper returns the full leaf path, not just the base.
- **Important (Security):** the segment checks now use `foreignWriter` through `path-prepare`, and
  the leaf is checked after creation.
- **Important (Security):** the variable is taken from user scopes only. Project scopes are
  excluded, and the residual risk is in the ADR.
- **Important (Scope):** the site list now includes `iterate`, plus indirect sites found by an
  extended grep and an explicit list.
- **Important (Testability):** a Codex app manual acceptance run is added, with a Handoff
  assumption.

Notes, all incorporated:

- the cleanup rationale for the adopted branch is corrected;
- an adopted name must pass the hidden-mode `prefix-discloses` check;
- an empty variable counts as unset;
- two acceptance criteria get the correct evidence type;
- the state and allow-rule registrations are added;
- availability is stated as "first release containing this change", not in hand-written release
  notes;
- `test:preflight` and `eval verify` are added, and the reuse facts fetch first;
- the change is split into three work packages;
- the ambiguous "foreign version" term no longer applies once version 2 is dropped.

## Open points

- No open points.
