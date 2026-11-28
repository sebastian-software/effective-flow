# Ban Git history rewriting in every Bash-capable worker

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #825

## Requirement

Ten worker sources under `src/agents/` hold `Bash` but say nothing about rewriting Git history: `nodejs-implementer`, `rust-implementer`, `ui-implementer`, `generic-implementer`, `generic-product-implementer`, `test-writer`, `e2e-tester`, `docs-writer`, `marketing-writer` and `code-validator`. One more worker, `code-documenter`, has no `Bash` on Claude, but its Codex role runs with `sandbox_mode: workspace-write` (`src/agents/code-documenter.md:8`). That gives it a shell on Codex.

The ban exists only in fragments that orchestrators read:

- `src/shared/worktree-integration.md`, "Update existing PRs" (lines 381–390);
- `src/shared/pr-review-comments.md`, "No history rewriting" (line 326 onward);
- `src/shared/plan-publication.md`, "Prohibited on every path" (line 366 onward).

The shared leaf contract `src/shared/delegation-mandate.md` has no history rule either. Only `merge-conflict-resolver` carries its own ban (`src/agents/merge-conflict-resolver.md:66-67`).

A worker runs in a delivery worktree whose branch may already have an open pull request. A worker that tries to "fix" a stale branch can drop the worktree record's `creationOid` from the branch history, for example with `git rebase`, a `reset` or a force-push. When that happens:

- condition 6 of `src/shared/worktree-lifecycle.md` (lines 113–115) fails;
- `worktree remove` refuses the worktree at handback;
- reviewers lose the pull request's history.

**Goal:** every worker that can write on any native target carries the ban in its own built contract, on all three targets. A guard test keeps future workers from shipping without it.

**Why Bugfix:** the change closes a safety gap in shipped product prose. Workers could do something the orchestrator contracts already forbid. It adds no capability. Per `AGENTS.md`, `src/**/*.md` is product source and routes through `node-backend-cli`, so this is a Bugfix (`effective-flow fix`), not Documentation.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow, issue #825. Planned against `96bb83b3` on 2026-11-27.
**Original outcome:** Every `src/agents/*.md` worker that can write on any native target carries an unconditional ban on rewriting Git history in its own built contract, on all three targets, and a test enforces it. A worker can write when its `claude.tools` contains `Bash` or its `codex.sandbox_mode` is not `read-only`. `merge-conflict-resolver` keeps its own ban. Tool context budgets and `delegation-mandate.md` stay unchanged.
**Last evaluated attempt:** None; fresh baseline.
**No-progress count:** 0
**Cumulative approach:** One new eager worker fragment, plus a source guard test, a built-output test, one declared native-baseline delta, and two developer-guide sentences.
**Continuation decision:** None.

## Architecture decisions

- **New fragment `src/shared/worker-git-history.md`, included eagerly in eleven workers.** These are the ten `Bash` workers plus `code-documenter`, which was decided by score (see "Decided by score").
  - The fragment is the single owner of the worker-side rule, per "State a contract once" in `AGENTS.md`.
  - The three orchestrator passages stay as they are. They also name the sanctioned repair: a merge of `origin/<base>`, made only by `merge-gate` or autopilot's delivery-base step. Workers do not perform it.
- **Selection rule.** A worker gets the include when its `claude.tools` contains `Bash` or its `codex.sandbox_mode` is not `read-only`; `merge-conflict-resolver` is the one exception.
  - All five reviewers are `read-only` on Codex and have no `Bash` on Claude, so they stay unchanged.
  - Portable reviewers that run in a shell-capable host subagent remain an accepted residual risk, because their role is read-only.
- **Not in `delegation-mandate.md`.** That fragment is eager in every delegating tool, and its cost would land in tools such as `iterate` and `merge-gate`, whose `contextBudget` is fully used.
  - Worker sources carry no `contextBudget`: `grep contextBudget src/agents/*.md` is empty, and `docs/developer-guide/build-system.md:716-722` forbids one there.
  - The new include therefore moves no tool budget.
- **`merge-conflict-resolver` is excepted.** Its ban at lines 66–69 is stricter on commit and push, which it forbids outright. It covers the same rewrites through its catch-all clauses ("rewrite the head branch's history in any other way", "never reset the checkout"). `test/workflow-contracts.test.mjs:9384-9463` already pins those clauses. The new guard test pins only that the exception set is exactly `merge-conflict-resolver`.
- **Enforced by tests, not a build guard.** This matches how the `delegation-mandate` leaf rule is enforced today (`test/delegation-mandate-contract.test.mjs`); `build.mjs` has no guard for it.
- **Fixed fragment text.** The fragment, the baseline delta and the tests all pin this text, so it is fixed here rather than left to the implementer:

  > **Git history.** Never rewrite or move back the Git history of the checkout, branches and remote you were handed: no `rebase` of any kind, including `pull --rebase` or a `pull` under `pull.rebase`; no `commit --amend`; no squash; no `reset --hard` at all and no `reset` of any other mode to an earlier commit; no command that points an existing branch at another commit, such as `branch -f`, `checkout -B` or `update-ref`; and no force-push in any form, `--force-with-lease` included. Report a rejected push, or a branch that is behind or conflicts with its base, to the orchestrator instead of updating it. Git commands inside a temporary or fixture repository you create yourself are not covered.
  - "Of any other mode to an earlier commit" keeps `git reset -- <path>` (unstaging) allowed. `reset --hard` stays banned without exception, because workers leave the run's work uncommitted in the delivery worktree (`src/shared/caller-owned-commit.md:14-21`) and a `reset --hard` would destroy it.
  - "Points an existing branch at another commit" keeps an ordinary `git commit`, `git fetch` and a fast-forward allowed.
  - The fixture clause keeps legitimate test work possible. Several tests create temporary repositories and run `reset --hard`, `commit --amend`, `update-ref` or a rebase inside them, for example `test/effective-flow-state-worktree.test.mjs:679` and `test/autopilot-delivery-base.test.mjs:267`.
  - The rejected-push clause mirrors `src/shared/worktree-integration.md:389-390`.
  - "Instead of updating it" also rules out a worker-made merge of the base, which matches `worktree-integration.md:386-390`.
  - Every item of the issue's list (`rebase`, `commit --amend`, squash, `reset --hard`, force-push) is kept. The list was widened because a model could read the shorter one as exhaustive: `reset --soft`/`--mixed` to an earlier commit followed by a new commit, `branch -f`, `pull --rebase` and `--force-with-lease` would drop `creationOid` just as well. `plan-publication.md:368-370` already names `reset --hard` and `--force-with-lease` explicitly.

- **Unconditional, including direct invocation.** A user can start a native worker directly. The ban then also refuses that user's explicit rebase request. This is deliberate and matches `merge-conflict-resolver`.
- **Non-goal: worker commit and push authority.** Orchestrators own the commits: `src/tools/build.md:373`, `src/tools/refactor.md:408`, `src/tools/maintain.md:91`, and `src/shared/caller-owned-commit.md:14-21`. No worker source forbids a plain `git commit` or `git push`.
  - This plan bans only rewriting and moving back history, which also covers rewriting a commit a worker made itself.
  - Whether workers may commit or push at all is out of scope for #825 and stays unchanged.

## Affected files

| File                                        | Description                                                                                                                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/worker-git-history.md`          | New fragment with the fixed text above. It has no spawn-site marker and no placeholders.                                                                                                            |
| `src/agents/nodejs-implementer.md`          | Add an eager `worker-git-history` include directly after the `delegation-mandate` include, before `## Recommended skills`.                                                                          |
| `src/agents/rust-implementer.md`            | Same include, same position.                                                                                                                                                                        |
| `src/agents/ui-implementer.md`              | Same include, same position.                                                                                                                                                                        |
| `src/agents/generic-implementer.md`         | Same include, same position.                                                                                                                                                                        |
| `src/agents/generic-product-implementer.md` | Same include, same position.                                                                                                                                                                        |
| `src/agents/test-writer.md`                 | Same include, same position.                                                                                                                                                                        |
| `src/agents/e2e-tester.md`                  | Same include, same position.                                                                                                                                                                        |
| `src/agents/docs-writer.md`                 | Same include, same position.                                                                                                                                                                        |
| `src/agents/marketing-writer.md`            | Same include, same position.                                                                                                                                                                        |
| `src/agents/code-validator.md`              | Same include, same position.                                                                                                                                                                        |
| `src/agents/code-documenter.md`             | Same include, same position (after line 30).                                                                                                                                                        |
| `test/worker-git-history-contract.test.mjs` | New source guard test: selection rule, exception, fragment clauses and a size floor.                                                                                                                |
| `scripts/compare-native-agent-baseline.mjs` | New `EXPECTED_NATIVE_DELTAS` body delta `worker-git-history`, declared after `delegation-mandate-model-tiers` and immediately before `code-span-placeholder-pairs`.                                 |
| `test/execution-profile-rendering.test.mjs` | Pin the new delta line in the baseline-proof stdout (around line 524) and extend the invariant comment (lines 503–514). Add the built-output test, which reuses the file's existing `before` build. |
| `docs/developer-guide/build-system.md`      | Item 6 of "Adding a tool or agent" (around line 810): a new agent that can write embeds `worker-git-history`. "Baseline proof" (around line 2129): name the new delta.                              |

## Implementation details

### Approach

1. Create `src/shared/worker-git-history.md` with exactly the fixed text from "Architecture decisions".
2. In each of the eleven worker sources, add an eager `include` fence for `worker-git-history` directly after the existing `delegation-mandate` include, before `## Recommended skills`. In all eleven files the `delegation-mandate` include is followed directly by `## Recommended skills`. Find the fence by its content, not by line number.
3. Add `test/worker-git-history-contract.test.mjs`. Open it with the invariant from `AGENTS.md` point 5: no worker that can run Git may rewrite the history of a delivery branch. The test does the following:
   - **Selection.** Enumerate `src/agents/*.md` and parse the frontmatter with `extractFrontmatter` from `build-lib.mjs`.
     - Read `claude.tools` with `getNestedArray` and strip parenthesised tool arguments, as `readAgentSources()` does in `test/delegation-mandate-contract.test.mjs:52-82`.
     - Read `codex.sandbox_mode` with `getNested` (`build-lib.mjs:109`). `getNestedArray` throws on that scalar. Assert the value is present, so the test fails closed.
     - An agent is write-capable when its `claude.tools` contains `Bash` or its `codex.sandbox_mode` is not `read-only`.
   - **Include.** Every write-capable agent lists `worker-git-history` among `collectIncludeNames(...).eager`, or belongs to a frozen exception set that holds exactly `merge-conflict-resolver`.
   - **Exact roster size.** Assert that the write-capable set has exactly twelve members: the eleven plus the resolver. A parser change then cannot pass while checking nothing. The failure message tells the editor to update the count deliberately.
   - **Exception.** Assert that the exception set is exactly `{merge-conflict-resolver}` and names an existing write-capable agent. A comment points to `test/workflow-contracts.test.mjs:9384-9463` as the owner of the resolver's ban clauses. No second copy of those clauses is added.
   - **Fragment.** The fragment contains these clauses:
     - `rebase` and `pull --rebase`;
     - `commit --amend` and squash;
     - `reset --hard`, and `reset` of any other mode;
     - `branch -f`;
     - force-push and `--force-with-lease`;
     - the rejected-push and report-to-orchestrator clause;
     - the fixture-repository scope clause.
4. Add the body delta `worker-git-history` to `EXPECTED_NATIVE_DELTAS` in `scripts/compare-native-agent-baseline.mjs`.
   - **Order.** Declare it after `delegation-mandate-model-tiers`, whose output its anchor depends on, and immediately before `code-span-placeholder-pairs`, which must stay last (comment at lines 543–546).
   - **Edit.** The literal `from` is the full rendered `model-tiers` load-on-demand line plus `\n\n## Recommended skills`. The `to` inserts the rendered fragment between the two. This binds both the position and the single occurrence.
   - **Comment.** The comment above the entry states the purpose.
5. Run `node scripts/compare-native-agent-baseline.mjs --base 6055c94` and pin its stdout in `test/execution-profile-rendering.test.mjs`.
   - The comparator checks only the workers in the baseline inventory (`compareBaseline`, lines 768–806). At `6055c94` that means Claude base and Fast workers and Codex base workers. That baseline has no tier variants, and its Codex inventory has `fastWorkers: []`.
   - The usage map merges names across harnesses, so the expected new line names exactly 16 workers: the eleven base workers and the five Claude `-fast` implementer variants.
   - Take the final list from the real run.
6. Add one built-output test in `test/execution-profile-rendering.test.mjs`. It reuses the existing `before` build in `distRoot` (lines 163–169), which holds all three targets and their variants; do not add another build. The suite-time plan `docs/plan/2026-11-25-speed-up-the-unit-test-suite-without-removing-tests.md` is still open.
   - **Selection.** Read the expected Fast and tier variants from the built native inventories (`fastWorkers`, `tierWorkers`), not from "where one exists". The file already defines `FAST_WORKERS` and `TIER_WORKERS` (lines 47–68).
   - **Positive check.** Assert that the full rendered fragment paragraph occurs exactly once in the built contract of each of the eleven workers:
     - Claude: `claude/agents/effective-flow-<name>.md` and every `-fast` sidecar.
     - Codex: inside `developer_instructions` of `codex/agents/effective-flow-<name>.toml` and of every Fast and tier variant.
     - Portable: `portable/effective-flow/workers/effective-flow-<name>.md`.
   - **Negative check.** Assert that the resolver's built contracts do not contain the fragment.
7. Update `docs/developer-guide/build-system.md` with one sentence each:
   - item 6 of "Adding a tool or agent": a new agent with `Bash`, or with a non-`read-only` Codex sandbox, also embeds `worker-git-history`;
   - "Baseline proof": name the new delta.
8. Run CI's order: `pnpm test:preflight`, `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.

### Component structure

Not relevant: the change adds no runtime component.

### State management

Not relevant: no runtime state changes.

### API integration

Not relevant: no API, helper or forge interaction.

### Styling approach

Not relevant: prose only.

### Accessibility

Not relevant: no user interface.

### Edge cases

- A `claude.tools` entry with arguments, such as `Bash(git:*)`, still counts as `Bash` once the argument is stripped.
- A future agent that gains `Bash` or a writable Codex sandbox without the include fails the guard test. So does any change in the size of the write-capable set, until the floor is updated deliberately.
- A `lazy-include` of `worker-git-history` does not satisfy the guard: the ban must be eager. One source cannot include a fragment both eagerly and lazily (`docs/developer-guide/build-system.md:633-641`).
- The five reviewers are `read-only` on Codex and have no `Bash` on Claude, so they need no include. A portable reviewer that runs in a shell-capable host subagent is the accepted residual risk.
- Rewording the resolver's ban so that a clause disappears fails its exception assertion. Moving the resolver onto the fragment would be a separate, deliberate change.
- Fast sidecars and Codex tier variants inherit the base body and carry the fragment without separate source edits. The baseline delta covers only Claude base and Fast workers and Codex base workers. Only the step-6 built-output test proves the Codex Fast sidecars, the Codex tier variants and the portable workers.
- Unstaging with `git reset -- <path>` stays allowed. So do an ordinary `git commit`, `git fetch` and a fast-forward, because none of them points an existing branch at a different, non-descendant commit. `reset --hard` stays banned in every form.
- A worker that writes or runs tests creating their own temporary repositories may run any Git command inside them. The scope clause keeps such test work from being refused.
- If a push is rejected, the worker reports it and does not run `pull`, rebase or force-push.

## Acceptance criteria

- [ ] `src/shared/worker-git-history.md` contains exactly the fixed text from "Architecture decisions".
- [ ] Each of the eleven listed workers includes `worker-git-history` eagerly, directly after its `delegation-mandate` include. `merge-conflict-resolver` and the five reviewers are unchanged.
- [ ] `src/shared/delegation-mandate.md` and every `contextBudget` line in `src/tools/*.md` are unchanged.
- [ ] `test/worker-git-history-contract.test.mjs` passes and names its invariant. It fails when any of these happens:
  - one worker's include is removed;
  - a new write-capable agent is added without the include;
  - a fragment clause is removed, `reset --hard` and the fixture-repository scope clause included;
  - the exception set changes.
- [ ] `node scripts/compare-native-agent-baseline.mjs --base 6055c94` exits 0. Its stdout, pinned in `test/execution-profile-rendering.test.mjs`, contains the `worker-git-history` delta line.
- [ ] The new built-output test passes. It proves the full rendered fragment paragraph occurs exactly once in the Claude, Codex (`developer_instructions`) and portable contract of each of the eleven workers and in every Fast and tier variant listed in the built inventories, and that it is absent from the resolver's built contracts.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` all pass, in CI order.

## Validation plan

- Run `node --test test/worker-git-history-contract.test.mjs`. In a scratch copy, remove one include and check that the test fails. Do not commit that check.
- Run `node scripts/compare-native-agent-baseline.mjs --base 6055c94`. Check that the new delta lists the eleven base workers and the five `-fast` variants, then pin the output.
- Run `node --test test/execution-profile-rendering.test.mjs`.
- Run the full CI order: `pnpm test:preflight`, `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- Run `pnpm eval build-context verify` and `pnpm eval merge-gate verify`, and report the freshness debt this change creates. See "Assumptions and open points".

## Assumptions and open points

- **Verified, agent inventory:** `src/agents/` holds 17 sources, read from frontmatter lines 6 and 8.
  - Twelve can write: the ten `Bash` workers, `merge-conflict-resolver`, and `code-documenter` (`workspace-write`).
  - The five reviewers are `read-only` on Codex.
  - Only the resolver states a history ban.
- **Verified, rendering:** eager includes in agent sources are resolved before rendering, and all three targets render the resolved body:
  - Claude, at `build.mjs:2143-2175`;
  - Codex `developer_instructions`, at `build.mjs:2176-2262`;
  - portable workers, from the same body.
- **Verified, anchor:** the rendered `model-tiers` load-on-demand line closes the delegation mandate in each worker body (`dist/claude/agents/effective-flow-nodejs-implementer.md:61-63`), followed by `## Recommended skills`.
- **Verified, baseline rule:** `docs/developer-guide/build-system.md:2145-2147` requires an exact allowlist entry in `EXPECTED_NATIVE_DELTAS` for any further edit to a worker-included fragment. The pinned stdout in `test/execution-profile-rendering.test.mjs:516-556` changes with it.
- **Eval evidence:** both suites below will report freshness debt. Under `docs/adr/pragmatic-test-release-policy.md` that debt is reported and does not block the merge.
  - `evals/build-context/suite.config.mjs:25-26` seeds every portable worker.
  - `evals/merge-gate/suite.config.mjs:100` seeds `code-validator`.
- **Skill ownership:** no `docs/developer-guide/skill-ownership.json` registration is needed. The fragment recommends no skill and copies no playbook owned by a central skill.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[{"site":"S-BAT","question":"Which agents receive the eager worker-git-history include (and are enforced by the guard test)?","options":["Write-capable workers","Every agent except the resolver","Claude Bash criterion only","Decide later"],"escape":["Decide later"],"scores":[{"label":"Write-capable workers","score":8,"reason":"Its criterion follows real shell and write capability on Claude and Codex, so it closes the code-documenter workspace-write gap for one extra name, though portable reviewers stay uncovered."},{"label":"Every agent except the resolver","score":6,"reason":"This covers portable reviewers that run in shell-capable general-purpose subagents, but it puts a redundant ban into five read-only reviewers and widens the baseline delta and pinned stdout."},{"label":"Claude Bash criterion only","score":5,"reason":"It matches the issue's scope exactly and has the smallest delta, but it knowingly leaves code-documenter's Codex workspace-write shell without the ban and records that gap only as a limitation."}]}]
```

<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    2 |
| Security        |        0 |         3 |    1 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         0 |    6 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        0 |         0 |    4 |

### Findings

Internal review, 2026-11-27:

- **Security, Important:** the worker set was selected only by `Bash` in `claude.tools`, which left `code-documenter` (Codex `workspace-write`) without the ban. Decided by score: select write-capable workers, which adds `code-documenter`. Incorporated in Requirement, Architecture decisions, Affected files and Approach.
- **Security, Important:** the issue's ban list could be read as exhaustive. It did not cover `reset --soft`/`--mixed` to an earlier commit, ref moves or `--force-with-lease`. Incorporated: the fragment text is now fixed and widened, and the tests pin the added clauses.
- **Testability, Note:** the comparator description was wrong. The comparator sees no tier variants or portable workers, because base `6055c94` has none. Incorporated in steps 5 and 6 and in Edge cases.
- **Maintainability, Note:** the order and anchor of the baseline delta were not specified. Incorporated in step 4.
- **Testability, Note:** the guards were not fail-closed: they read variants "where one exists" and had no floor on the set size. Incorporated: variants come from the inventory, each built contract must contain the sentence exactly once, the resolver must lack it, and the set size is fixed.
- **Scope, Note:** worker commit and push authority was unstated. Incorporated as a non-goal under Architecture decisions.
- **Architecture, Note:** the ban also applies when a user invokes a worker directly. Incorporated as a deliberate decision.
- **Maintainability, Note:** the plan recorded no planning HEAD, and one cited line range was wrong. Incorporated: the HEAD is recorded in the Outcome checkpoint, and the range is corrected.

Deep plan review, 2026-11-27:

- **Security, Important:** the widened text banned only `reset` "to an earlier commit", which no longer covered the issue's `reset --hard` that destroys uncommitted worker output. Incorporated: `reset --hard` is now banned in every form and pinned by the test, and the rationale is corrected.
- **Scope, Important:** the ban had no scope, so a worker could refuse legitimate test work in temporary fixture repositories. Incorporated: the text now covers only the handed checkout, branches and remote and names the fixture exception, with an edge case and a test clause.
- **Maintainability, Note:** "no ref move" also read as banning `git commit`, `git fetch` and fast-forwards. Incorporated: the text now names commands that point an existing branch at another commit.
- **Security, Note:** a rejected push could lead to a silent `pull --rebase`. Incorporated: the text now covers `pull --rebase` and a `pull` under `pull.rebase`, and requires reporting a rejected push.
- **Testability, Note:** `codex.sandbox_mode` is a scalar, and `getNestedArray` throws on it. Incorporated: the test reads it with `getNested` and fails closed.
- **Testability, Note:** "the fragment sentence" was ambiguous for a two-sentence fragment. Incorporated: the full rendered paragraph must occur exactly once.
- **Testability, Note:** the baseline at `6055c94` has no Codex Fast workers. Incorporated: the comparator scope and the edge case now say this, and the 16-name count stays as it was.
- **Maintainability, Note:** a second copy of the resolver's ban clauses would duplicate `test/workflow-contracts.test.mjs:9384-9463`. Incorporated: the new test pins only the exception set.
- **Architecture, Note:** "equivalent and stricter" overstated the resolver's ban. Incorporated: the wording is now precise.
- **Testability, Note:** the exact count was called a floor. Incorporated: it is now an exact roster-size assertion.

## Open points

- No open points.
