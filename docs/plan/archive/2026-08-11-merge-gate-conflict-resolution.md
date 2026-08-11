# Merge-gate resolves a conflict with the merge target

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`/effective-flow build`)
**Planning basis:** `36ea4fe` on `develop`, 2026-08-11; working tree clean apart from this plan file

## Requirement

`/effective-flow merge-gate` currently ends a run as soon as the pull request conflicts with its
base branch. Phase 2 step 2 of [`src/tools/merge-gate.md:546`](../../src/tools/merge-gate.md#L546)
states it plainly: "**Conflict with the base (`DIRTY`).** Not repaired automatically: stop, report
the conflict, and do not merge." The same dead end is reached from the other direction in step 1,
where a base-into-head merge that turns out to conflict aborts the run
([`src/tools/merge-gate.md:543`](../../src/tools/merge-gate.md#L543)).

A conflict with the merge target is an objective defect of the branch, not an opinion under
discussion. The gate already owns the one repair of that shape — merging `origin/<base>` into the
head branch when the branch is `BEHIND` — and stops one step short of the case where that merge does
not apply cleanly. The requirement is to close that gap: the gate resolves the conflict, verifies the
result, pushes it as a normal merge commit, and continues its ordered gate instead of reporting a
dead end.

Rationale for the **Feature** classification: this adds a new capability (a new configuration key, a
new worker role, a second sanctioned kind of Git write) rather than correcting behavior that was
already specified. The existing behavior is deliberate and documented, so this is not a bugfix, and
the change is not behavior-preserving, so it is not a refactoring.

**Out of scope.** Each of these is adjacent, tempting, and deliberately excluded:

- the push-rejection stop in `/effective-flow iterate` Phase 5 — a diverged remote history is a
  different failure from a conflict with the base, and it stays a report;
- the `merge` completion action in `src/shared/worktree-integration.md`, which merges a **delivery
  branch** and keeps its explicit "no automatic conflict resolution" rule;
- the cherry-pick conflict protocol in `src/tools/apply-review-commit-mechanics.md` — not unified,
  not extended, not consumed by the new worker;
- a `prReview.conflictResolution` legacy alias — the key is new and never existed under the old
  namespace;
- any change to `delivery.mergeMethod` or to the forge-side merge in Phase 5.

**Drift detection.** The line references above are anchors to quoted text, not stable addresses.
Before executing this plan, confirm each quoted sentence still exists in `src/tools/merge-gate.md`;
if the Git-write-boundary wording or the Phase-2 step numbering has changed since `36ea4fe`, re-read
those sections before editing and revise this plan where the architecture decisions no longer
describe reality.

## Architecture decisions

- **One base-into-head step with a clean and a conflicted branch.** Phase 2's steps 1 (`BEHIND`) and
  2 (`DIRTY`) are unified into a single "bring the head branch forward" step. Both forge states are
  repaired by the same local operation — merge `origin/<base>` into the head branch — and `DIRTY`
  only states in advance that the operation will conflict. Keeping two steps would mean two
  provisioning paths, two lifecycle closures, and two places where a conflict can appear, since a
  branch reported `BEHIND` can still conflict once the merge actually runs. Rationale: the conflict
  is discovered locally in exactly one place either way.
- **The conflicted merge is a second sanctioned kind of Git write, stated as such.** The current
  boundary is written as a single exception
  ([`src/tools/merge-gate.md:140`](../../src/tools/merge-gate.md#L140)) and is pinned by
  `test/workflow-contracts.test.mjs` (the "merge-gate states its no-commit/no-push boundary"
  assertion). It is reworded to name two kinds of write — the clean base-into-head merge and the
  conflict-resolving one — with the same per-occurrence bound: one merge commit plus one normal push
  per Phase-2 round, and no Git write of any other kind. The no-history-rewriting rule is untouched:
  a conflict is still resolved by merging forward, never by rebasing or force-pushing the head
  branch.
- **A new dedicated worker role performs the resolution.** `src/agents/merge-conflict-resolver.md`
  is added as a quality-tier implementer role. The gate stays an orchestrator: it provisions the
  checkout, starts the merge, hands the conflicted state to the worker, and owns the commit, the
  push, and the lifecycle. The worker owns the resolution playbook. Rejected alternatives:
  delegating to `/effective-flow iterate` (its item model is review threads plus free text and
  nothing in it resolves an in-progress merge), and resolving inline (the gate would implement code
  for the first time, against its own stated role).
- **The resolver consumes `project-routing`.** A merge conflict can land in product code, tests,
  tooling, or repository metadata, and the repository already routes that classification through one
  shared fragment. `agents/merge-conflict-resolver.md` is therefore added to the
  `projectRoutingConsumers` allowlist in `build.mjs`, alongside `generic-product-implementer` and
  `code-validator`.
- **merge-gate gains the eager `delegation-mandate` include.** It is deliberately absent today,
  because merge-gate was purely a workflow-to-workflow delegator; that exclusion is pinned by
  `test/delegation-mandate-contract.test.mjs`. Delegating to a _named worker role_ is exactly what
  the mandate governs, so the include is added and the test's expected set plus its explaining
  comment are updated in the same change. The mandate's carve-out for the `merge-gate` → `iterate`
  delegation stays valid and is unaffected.
- **Two independent verification layers before the push, then CI.** The worker runs the repository's
  own checks on the resolved tree, and the gate additionally has the resolved tree checked by the
  existing observation role `code-validator` before it commits and pushes. Only then does the run
  continue into the check gate, where CI remains the final criterion and a failure is repaired
  through `/effective-flow iterate` as before. The gate itself still starts no validation of its
  own — both verifications happen inside delegated roles, which is how `iterate` already works.
- **Configuration key `mergeGate.conflictResolution`, default `auto`.** Values `off`, `ask`, `auto`.
  The default changes existing behavior on upgrade; `off` restores the current behavior exactly, and
  the run reports what it resolved. `ask` in a non-interactive delegated run behaves as `off`,
  mirroring how `mergeGate.completion` degrades. The key is new and has **no** `prReview.*`
  predecessor, so the per-key legacy fallback finds nothing for it; that is stated in the
  configuration fragment rather than left to inference.
- **The human-comment guard does not block the resolution.** It is treated like the CI repair and
  like the existing `BEHIND` merge: a conflict is an objective defect, not a position a reviewer is
  negotiating. The guard continues to block review-driven implementation and the merge itself.
- **Completion mode `report` does not withhold the resolution.** The gate's existing rule — "`report`
  withholds exactly one action: the merge in Phase 5" — is kept intact rather than given a second
  exception. A `report` run therefore resolves the conflict, pushes the merge commit, and ends by
  reporting merge-readiness. The accepted cost is stated plainly: a run the operator asked only to
  _report_ still writes one semantic merge commit onto the head branch. The alternative is worse in
  practice — a report run would otherwise report the same conflict forever, which is the very state
  the operator invoked the gate to clear.
- **The resolver may touch a non-conflicted file when validation demands it**, and every such file
  is named and justified individually in the report. A conflict whose two sides both change behavior
  frequently invalidates an adjacent test or caller that Git never marks as conflicted; restricting
  the worker to conflicted paths would turn those into `ABORT` even where the correct resolution is
  obvious. The boundary that remains: an additional file is only ever touched to make the
  repository's own checks pass on the resolved tree, never to improve anything, and the merge commit
  that results is auditable file by file from the chat summary.
- **The playbook lives in the worker, not in a second copy.** `src/tools/apply-review-commit-mechanics.md`
  already carries a cherry-pick conflict protocol (low-risk/high-risk classification, marker removal,
  explicit-path staging). It is cherry-pick-specific and stays where it is; the new worker carries
  its own merge-specific playbook, and merge-gate carries orchestration only. The statement in
  `src/shared/worktree-integration.md` that the `merge` completion action performs "no automatic
  conflict resolution" is about a _delivery branch_ in a different workflow and is deliberately left
  unchanged; the new text names that scoping so the two do not read as a contradiction.

## Affected files

| File                                                | Description                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/merge-gate.md`                           | Reword the Git write boundary to two sanctioned write kinds; unify Phase 2 steps 1–2 into one base-into-head step with a clean and a conflicted branch; add the `mergeGate.conflictResolution` row and its prose; add a resolver delegation contract beside the existing `iterate` one; extend the human-comment-guard bullet list, the wisdom-file list, the Phase 6 report, Edge cases, and Rules; add the eager `delegation-mandate` include |
| `src/agents/merge-conflict-resolver.md`             | **New.** Quality-tier worker role (Claude `opus`/`xhigh`, Codex `gpt-5.6-sol`/`high`, tools `Read, Write, Edit, Bash, Glob, Grep, Skill, Agent, Task`): conflict inventory, risk classification, resolution rules, repository-native validation, `DONE`/`ABORT` report. Includes `delegation-mandate`, `project-routing`, `skill-discovery`, `completion-protocol`                                                                              |
| `src/shared/config-migration.md`                    | Add the `mergeGate.conflictResolution` row to the merge-gate key table and state that this key has no `prReview.*` predecessor                                                                                                                                                                                                                                                                                                                  |
| `src/shared/pr-review-comments.md`                  | In "No history rewriting": name the conflict-resolving base-into-head merge as the second sanctioned repair, scoped to merge-gate, beside the existing `BEHIND` sentence                                                                                                                                                                                                                                                                        |
| `src/tools/setup.md`                                | Block-9 key list, the block-9 key table, the per-key explanation, and the closing report list                                                                                                                                                                                                                                                                                                                                                   |
| `build.mjs`                                         | Add `agents/merge-conflict-resolver.md` to `projectRoutingConsumers`                                                                                                                                                                                                                                                                                                                                                                            |
| `test/workflow-contracts.test.mjs`                  | Update the pinned single-exception regex to the two-kind wording; add contract assertions for the conflict path, the new config key in its three required places, and the resolver delegation                                                                                                                                                                                                                                                   |
| `test/delegation-mandate-contract.test.mjs`         | Add `merge-gate` to the expected eager-include tool set and update the comment that explains the exclusion                                                                                                                                                                                                                                                                                                                                      |
| `docs/user-guide/configuration.md`                  | Example table, `## Block mergeGate` prose, and the defaults table                                                                                                                                                                                                                                                                                                                                                                               |
| `docs/user-guide/tools-deliver.md`                  | The merge-gate behavior description: what happens on a conflict, and what `off`/`ask`/`auto` mean                                                                                                                                                                                                                                                                                                                                               |
| `docs/developer-guide/architecture.md`              | The worker count in the delegation section ("today ten workers qualify")                                                                                                                                                                                                                                                                                                                                                                        |
| `AGENTS.md`                                         | The same worker count in the "Delegation" section                                                                                                                                                                                                                                                                                                                                                                                               |
| `docs/developer-guide/skill-ownership.md` / `.json` | `.json` **unchanged** as planned — the worker declares no recommended central skill, so it adds no consumer relationship. The `.md` **prose** was corrected: it claimed "every code-affecting decision is delegated instead to `iterate`", which the resolver delegation falsified                                                                                                                                                              |

**Surface actually touched, beyond this table.** The documentation sync gate reaches every surface the
change can invalidate, which is wider than this table forecast. Four further documents were updated,
each because the change made an existing statement false:

| File                                    | Why                                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `docs/user-guide/troubleshooting.md`    | stated that a merge conflict is never resolved automatically                                             |
| `docs/user-guide/tools-setup.md`        | the Express path's enumeration of gate defaults omitted the one default that now writes                  |
| `docs/developer-guide/configuration.md` | needed the no-legacy-predecessor rule and the invalid-value-resolves-to-`off` fallback                   |
| `docs/developer-guide/architecture.md`  | its model-tier sentence scoped the quality tier to "implementers and reviewers"; the resolver is neither |

## Implementation details

### Approach

The order matters: the `{{AGENT:X}}` dead-reference guard fails the build when `merge-gate.md`
names a worker whose source does not exist yet, and the contract tests fail the moment a source
sentence they pin changes without them. Each step below leaves the repository buildable.

1. **Write `src/agents/merge-conflict-resolver.md`** with its full frontmatter and the contract
   sketched under "Component structure". Run `node build.mjs` — the agent is built into all three
   targets and nothing references it yet.
2. **Add `agents/merge-conflict-resolver.md` to `projectRoutingConsumers` in `build.mjs`** and add
   the `project-routing` include to the agent. Run `node build.mjs` again; the consumer guard now
   passes for it.
3. **Add the configuration key** in its three required places at once —
   `src/shared/config-migration.md`, `src/tools/setup.md` (block-9 list, table, per-key explanation,
   report list), `docs/user-guide/configuration.md` (example table, `## Block mergeGate`, defaults
   table). The three-place contract test passes only when all three land together.
4. **Rewrite `src/tools/merge-gate.md`**: the Git write boundary, the unified Phase-2 step, the
   resolver delegation contract, the eager `delegation-mandate` include, the human-comment-guard
   bullet list, the wisdom-file list, the Phase-6 report, Edge cases, and Rules.
5. **Update the two contract tests in lockstep** — the pinned single-exception regex in
   `test/workflow-contracts.test.mjs` and the expected eager-include set plus its comment in
   `test/delegation-mandate-contract.test.mjs` — and add the new assertions.
6. **Update `src/shared/pr-review-comments.md`** with the second sanctioned repair.
7. **Update the prose documentation last**: `docs/user-guide/tools-deliver.md`,
   `docs/developer-guide/architecture.md`, `AGENTS.md`, and — only if the worker declares a
   recommended central skill — `docs/developer-guide/skill-ownership.md` and `.json`.
8. **Run the full CI sequence** in the order `AGENTS.md` prescribes.

### Runtime flow of the new step

1. **Detect the conflict from the two entry points.** `pr-status-read` reports `mergeState`
   (`BEHIND`, `DIRTY`, …) and `mergeable` (`MERGEABLE`, `CONFLICTING`), but exposes no conflicted-file
   list — the helper shells out to the forge CLI and knows nothing about hunks. The conflict is
   therefore always discovered locally, by starting the merge in the provisioned checkout. `DIRTY`
   and `CONFLICTING` are the advance warning; a `BEHIND` merge that conflicts anyway enters the same
   path.
2. **Resolve the mode before any write.** Read `mergeGate.conflictResolution`. `off` keeps today's
   behavior — abort the merge, report the conflict, merge nothing. `ask` poses a single question in a
   gated run and behaves as `off` in a non-interactive delegated run, naming `auto` as the setting
   that would authorize the resolution. `auto` proceeds.
3. **Provision one checkout for the whole step**, per the existing "Checkout provisioning boundary":
   the invocation checkout when it already holds the head branch cleanly, otherwise one Effective
   Flow-owned worktree with its lifecycle record. Fetch the base, then merge `origin/<base>` into the
   head branch.
4. **Clean merge:** commit with Git's default merge-commit message and push normally — unchanged
   behavior.
5. **Conflicted merge:** capture the conflict state (conflicted paths, staged/unstaged status, the
   two sides per file) and hand it to `{{AGENT:merge-conflict-resolver}}` with the provisioned
   checkout's absolute root, the base and head refs, the conflicted paths, the resolved language
   values, and this run's gated/non-interactive state. The worker resolves the files, removes every
   conflict marker, runs the repository's own checks, adjusts an adjacent non-conflicted file only
   where those checks demand it, stages every file it touched by explicit path, and returns `DONE`
   with a per-file record (side kept, side merged, or adjacent-file justification) or `ABORT` with
   the reason. `git add .`, `git add -A`, and `git commit -a` stay forbidden, as they are for
   `/effective-flow iterate`.
6. **Verify independently.** On `DONE`, delegate the resolved but uncommitted tree to
   `{{AGENT:code-validator}}` for an independent check. A failing verdict from either role is treated
   as `ABORT`.
7. **Commit and push.** The gate — not the worker — completes the merge commit and pushes the head
   branch normally. Keep Git's default merge-commit message, which already lists the conflicted
   paths; add no `Co-Authored-By` trailer and no AI attribution. Then re-read the status; the round
   ends and a new round begins, per "A round runs forward only".
8. **Close the lifecycle in the same step.** After a confirmed push, an Effective Flow-owned worktree
   goes `active` → `cleanup-ready` and through the shared claim/remove/reconcile sequence. On a
   controlled stop — `off`, an unanswered `ask`, an `ABORT` from either role — run `git merge --abort`
   so the checkout is left clean, transition the record to `aborted`, and report. On an error
   (a failed push, an unusable checkout, a state-persistence failure) transition to `failed`.
   `aborted` and `failed` retain the worktree and branch for inspection.
9. **Bound it.** The step lives inside a Phase-2 round and consumes one round like any other. There
   is no retry loop inside the step: one resolution attempt per round, and `mergeGate.maxRounds`
   bounds the run.

### Component structure

The new worker's contract, in outline:

- **Inventory** — every conflicted path with its file role from `project-routing`, plus the two
  sides and the merge base for each conflicted region.
- **Risk classification per file**, in the vocabulary the repository already uses in
  `src/tools/apply-review-commit-mechanics.md`: additive and independent changes, contradictory
  functional statements, generated or lock files, schemas and migrations, public API surfaces,
  behavior-asserting tests.
- **Resolution rules** — preserve both sides where they are independent; regenerate a generated or
  lock file from its source rather than merging its text; keep both sides' intent where they touch
  the same behavior and state how; remove every conflict marker.
- **The adjacent-file allowance and its bound.** A non-conflicted file may be changed only to make
  the repository's own checks pass on the resolved tree — a test both sides made stale, a caller
  whose signature moved. Never to improve, tidy, or extend anything. Every such file is reported
  with the check that demanded it; a change the worker cannot tie to a named failing check is an
  `ABORT`, not a judgment call.
- **The abort condition, stated as the default.** Where the two sides make contradictory functional
  statements that cannot be reconciled without a new product or architecture decision, the worker
  returns `ABORT` naming the file and the contradiction. Uncertainty resolves to `ABORT`, never to a
  guess.
- **Validation** — the repository's own checks on the resolved tree, run through the repository's
  native commands, with the output carried into the report.
- **Report** — `DONE` or `ABORT` per the completion protocol, with a per-file record of what was kept
  and why, so the gate can report it in chat.

### State management

The wisdom file gains, per round: the observed merge state and the entry point that detected the
conflict, the resolved `mergeGate.conflictResolution` mode with its source, the conflicted paths with
their risk classification, the worker's per-file resolution record, both verification verdicts, and
the resulting merge commit or the abort reason.

### Edge cases

- **Forgejo:** `pr-status-read` is unsupported there, so the run is report-only by construction and
  this path is never reached. Stated so it is not later read as an oversight.
  - ✅ 2026-08-11, `effective-flow build`: superseded. `pr-status-read` and `pr-merge` are now
    supported on Forgejo, so the run is no longer report-only. The conclusion survives for a
    different reason: Forgejo reports no merge state at all and states `mergeable: false` as
    unstated, so neither `BEHIND` nor `DIRTY` is ever observed and this path still has no entry
    point there.
- **`mergeState` is unstated:** the loop already fails closed on an unstated merge state. The
  resolution path is entered only from an observed conflict, so an unstated state keeps the loop
  running rather than starting a speculative merge.
- **The push is rejected after a successful resolution** (someone pushed to the head branch while the
  worker was working): stop, report, rewrite no history, transition the worktree to `failed`. Do not
  retry with force.
- **The conflict is in a file the repository generates** (a lockfile, `dist/`): regenerate from
  source. `dist/` is gitignored in this repository and cannot conflict here, but a consumer project's
  generated tracked files can.
- **The conflict re-appears in a later round** because the base moved again: the next round runs the
  same step, and the round counter bounds it.
- **The human-comment guard is active:** the resolution runs, the merge does not. This mirrors the CI
  repair and is named beside it.
- **`mergeGate.conflictResolution: ask` in a non-interactive delegated run:** behaves as `off`, and
  the report names `auto` as the setting that would authorize it.
- **Both roles disagree** — the worker reports `DONE`, `code-validator` reports a failure: treated as
  `ABORT`, the merge is aborted, and both verdicts are reported.
- **The worker changed a file it did not report:** the gate compares the modified paths against the
  worker's own record before committing. A file in the working tree that the record does not name
  and justify is an error — abort the merge, report it, commit nothing. The allowance is for
  _reported_ adjacent files, never for unreported ones.
- **Completion mode `report` with a conflict:** the resolution runs, the merge commit is pushed, and
  the run ends by reporting merge-readiness. Only the Phase-5 merge is withheld.
- **The head branch is protected against direct pushes:** the resolution succeeds locally and the
  push is rejected. Report that the branch protection blocks the repair and transition the worktree
  to `failed`; never work around it.

## Acceptance criteria

- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all pass in that
      order.
- [ ] `src/tools/merge-gate.md` no longer contains the sentence "Not repaired automatically: stop,
      report the conflict, and do not merge", and its Git write boundary names exactly two sanctioned
      kinds of write with the per-round bound retained.
- [ ] `src/agents/merge-conflict-resolver.md` exists, passes every agent frontmatter guard
      (quoted `description`, `claude.model`, `claude.effort`, `codex.model`,
      `codex.model_reasoning_effort`, `codex.sandbox_mode`), carries `Write`/`Edit` **and**
      `Agent, Task` in `claude.tools`, and is built into all three targets.
- [ ] `mergeGate.conflictResolution` appears in all three places the contract test requires:
      the block-9 table in `src/tools/setup.md`, `## Block mergeGate` in
      `docs/user-guide/configuration.md`, and the merge-gate key table in
      `src/shared/config-migration.md` — with the default `auto` identical in each.
- [ ] `test/delegation-mandate-contract.test.mjs` lists `merge-gate` among the tools carrying the
      eager `delegation-mandate` include, and its explaining comment no longer claims merge-gate is
      excluded.
- [ ] New contract tests fail when: the conflict path loses its abort-on-uncertainty rule; the
      resolver delegation loses the `code-validator` verification; or the human-comment-guard bullet
      list stops naming the conflict resolution as permitted.
- [ ] `AGENTS.md` and `docs/developer-guide/architecture.md` state eleven qualifying workers, not ten.
- [ ] A `mergeGate.conflictResolution: off` run reproduces the current behavior exactly: report the
      conflict, write nothing, merge nothing.
- [ ] `src/tools/merge-gate.md` states that `report` withholds only the Phase-5 merge and names the
      conflict resolution among the actions it does **not** withhold, so the existing rule keeps
      exactly one exception rather than two.
- [ ] The resolver contract names the adjacent-file allowance together with its bound (only to make
      a named failing check pass) and the gate's reconciliation of reported against actually
      modified paths.

## Validation plan

| Purpose                 | Command                  | Expected result                                                                                 |
| ----------------------- | ------------------------ | ----------------------------------------------------------------------------------------------- |
| Format check (CI-style) | `pnpm agent:check`       | exit 0, no files reported                                                                       |
| Unit and contract suite | `pnpm test`              | exit 0; the merge-gate boundary, delegation-mandate, and three-place config-key assertions pass |
| Build and guards        | `node build.mjs`         | exit 0; sixteen agents built into all three targets, no guard error                             |
| Distribution smoke      | `pnpm test:distribution` | exit 0                                                                                          |

Run them in that order — the sequence `AGENTS.md` prescribes after editing distribution sources.

- Confirm the build guards that this change can trip: the `{{AGENT:merge-conflict-resolver}}`
  dead-reference guard, the `project-routing` consumer guard for the new agent, the eager/lazy include
  overlap guard on `merge-gate.md`, the self-contained agent guard, and the version-drift guard across
  the three targets.
- Confirm `merge-gate` is **not** subject to the 700-line context budget (`BUDGET_TOOLS` covers
  `build`, `fix`, `docs`, `review`, `plan` only), so the added prose cannot fail the build — and keep
  the added text proportionate anyway, since the file is already 970 lines.
- Manual verification on a real pull request in this repository: create a branch that conflicts with
  `develop` in one mechanically resolvable file, run `/effective-flow merge-gate` with
  `conflictResolution: auto`, and confirm one merge commit, one push, the per-file record in the chat
  summary, and a closed worktree lifecycle record.
- Manual negative verification: a branch with a contradictory functional conflict must produce an
  `ABORT`, a clean checkout after `git merge --abort`, an `aborted` lifecycle record, and no push.

### Stop conditions

Stop and revise this plan rather than improvising when any of these holds:

- The `Next steps: suppressed` delegation-site assertion turns out to cover `{{AGENT:…}}`
  delegations too. Adding the line is trivial, but it means the gate's delegation contract has a
  shape this plan did not anticipate — re-read it before extending it.
- The `project-routing` include cannot be added to the new worker without pulling in an implementer
  role selection the gate is supposed to own. The routing fragment classifies files; if it also
  selects a worker, the architecture decision above is wrong and the worker needs a different shape.
- Adding `mergeGate.conflictResolution` to `src/shared/config-migration.md` fails a test that
  requires a `prReview.<key>` fallback row for **every** merge-gate key. That would mean the legacy
  namespace is structural rather than historical, and the key needs a different home.
- The resolution would require rewriting the head branch's history to succeed. That is forbidden
  without exception; report instead.
- The repository's own checks are already failing on the base branch, so a validation result cannot
  be attributed to the resolution.

## Assumptions and open points

- The `Next steps: suppressed` delegation-site assertion in `test/workflow-contracts.test.mjs`
  covers `{{SKILL:…}}` delegations. The resolver is an `{{AGENT:…}}` delegation, so it is assumed to
  need no next-step suppression line; verify against the test when implementing, and add the line if
  the assertion is broader than assumed.
- No new tool source file is introduced, so no `NEXT_STEPS_EXEMPT_TOOLS` entry is needed. If the
  implementation instead splits the playbook into an internal `src/tools/*.md` sub-file, that file
  needs an exemption entry in **both** `build.mjs` and the contract test, per the
  `apply-review-commit-mechanics` precedent.
- The new worker declares **no** recommended central skill and relies on generic skill discovery
  (decided in the deep review): merge-conflict resolution has no declared central domain owner, and
  the validation depth already comes from `code-validator`'s adapter of `software-validation`. Both
  skill-ownership files therefore stay unchanged.
- The default `auto` is the user's explicit decision. It changes behavior for every project on
  upgrade; the change ships as a `feat` commit so the changelog carries it, and `off` restores the
  previous behavior exactly.

## Test results

**Date:** 2026-08-11 · **Base:** `aba3373` (`origin/develop`)

| Check                    | Result                                                            |
| ------------------------ | ----------------------------------------------------------------- |
| `pnpm agent:check`       | exit 0 — 285 files correctly formatted                            |
| `pnpm test`              | exit 0 — 613 tests, 613 pass, 0 fail                              |
| `node build.mjs`         | exit 0 — 19 tools (+8 internal), 16 agents into all three targets |
| `pnpm test:distribution` | exit 0 — offline checks passed                                    |

Test coverage added: four new contract tests (resolver abort-on-uncertainty plus the staging and
push bans; the mandatory independent `code-validator` verification with an ordered
resolver → validator → commit pin; the human-comment guard and `report` mode; the adjacent-file
bound at both ends), one new mode-gate test for `mergeGate.conflictResolution`, the reworked
Git-write-boundary test, and column-anchored default assertions for the `mergeGate.*` keys.

Every added or changed assertion was verified **by mutation** against the real suite: each weakening
was applied to a scratch copy and confirmed to fail exactly the intended test, and four
meaning-preserving rewrites were confirmed to still pass. This matters because an earlier
self-reported negative verification used a re-implemented harness rather than the real tests, and a
review measured 18 of 42 mutations surviving.

**Not covered here, deliberately.** The plan's two manual end-to-end verifications — a real
conflicting pull request resolved with `conflictResolution: auto`, and the negative `ABORT` case with
`git merge --abort`, an `aborted` lifecycle record and no push — were **not** performed. They need a
live conflicting pull request. The acceptance criterion "an `off` run reproduces the current
behaviour exactly" is likewise a runtime property that text-matching contract tests cannot reach;
what is pinned is the prose contract that encodes it.

## Review findings

**Date:** 2026-08-11
**Reviewer:** `generic-product-reviewer` (the `src/` bucket), `nodejs-reviewer` (the `test/` bucket),
`code-validator` (validation, twice)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    35 |
| Open / Not implemented |     0 |

| Severity  | Count | Fixed | Open |
| --------- | ----: | ----: | ---: |
| Critical  |     4 |     4 |    0 |
| Important |    17 |    17 |    0 |
| Note      |    14 |    14 |    0 |

The four Critical findings were: no fail-closed rule when both verification layers execute **zero**
checks, so an all-skipped run would push an unverified semantic merge; a rebase-and-force-push
conflict repair passing every new boundary assertion, a net loss against the single regex it
replaced; guard and `report` assertions passing on an **inverted** source, because proximity proves
co-occurrence and never direction; and the independent verification being downgradable to optional
with the reconciliation reduced to a warning, both undetected.

No findings remain open, so no external review report was written.

**One deliberate non-implementation.** The security review's optional hardening — making `ask` rather
than `auto` the default when the head branch comes from a **fork** — was not implemented. The
finding's substance did land: the threat model is now stated explicitly (the resolver executes
validation commands discovered from files the head branch supplies, under full filesystem and network
access, automatically under the default), together with the guidance that a project gating untrusted
pull requests should set `ask` or `off`. Making fork provenance change a default is a design decision
beyond this plan's agreed scope and belongs in its own change.

**Two pre-existing gaps were found and deliberately left out of scope**, each recorded as a
follow-up rather than widened into this change: no test pins `projectRoutingConsumers` membership for
any of its entries, and `merge-gate.md`'s own configuration table — the one the workflow actually
reads — is pinned by no test, so a key must agree in four places while the operative one is
unchecked.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        3 |         1 |    1 |
| Security        |        0 |         0 |    1 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         2 |    0 |
| Testability     |        0 |         2 |    0 |
| Scope           |        1 |         2 |    0 |
| Maintainability |        0 |         1 |    2 |

### Findings

- **Architecture, Critical — incorporated.** The Git write boundary is written as a single exception
  and is pinned by a regex in `test/workflow-contracts.test.mjs` that matches "with exactly one
  exception" and "no Git write of any other kind". A second sanctioned write breaks that assertion.
  The approach now reworks the boundary text and the test in lockstep, and the acceptance criteria
  name it.
- **Architecture, Critical — incorporated.** merge-gate is deliberately excluded from the eager
  `delegation-mandate` include, pinned by `test/delegation-mandate-contract.test.mjs` with a comment
  naming the workflow-to-workflow carve-out. A worker-role delegation is precisely what that mandate
  governs, so the include, the expected set, and the comment change together, and the qualifying-worker
  counts in `AGENTS.md` and `docs/developer-guide/architecture.md` move from ten to eleven.
- **Architecture, Note.** `pr-status-read` exposes `mergeState` and `mergeable` but no conflicted-file
  list, so the conflict is only ever visible locally. The plan states this explicitly so the
  implementation does not look for a helper operation that does not exist.
- **Security, Note.** A semantic resolution can silently drop one side's change, including a
  security-relevant one. Mitigated by three layers, none of which is optional: the worker's
  abort-on-uncertainty default, the independent `code-validator` verdict before the push, and CI as
  the final criterion with `iterate` repairing what it catches. The per-file rationale in the chat
  summary makes the decision auditable rather than silent.
- **Error cases, Important — incorporated.** The plan distinguishes a controlled stop (`git merge
--abort`, worktree `aborted`) from an error (`failed`), and names the push-rejection-after-resolution
  case, so the checkout is never left mid-merge and `/effective-flow cleanup` is never handed an
  `active` record.
- **Testability, Important — incorporated.** No existing test pins the `DIRTY` sentence, so removing
  it would go unnoticed. Three new contract assertions are specified, and the `off` mode gives a
  behavioral criterion that reproduces the current behavior exactly.
- **Scope, Important — documented, deliberately accepted.** Default `auto` changes behavior for every
  existing project on upgrade rather than opting in. This was the user's explicit decision; the
  rationale, the `off` escape hatch, and the `feat` changelog signal are recorded in "Assumptions and
  open points" rather than being quietly folded into the default.
- **Maintainability, Note.** The cherry-pick conflict protocol in
  `src/tools/apply-review-commit-mechanics.md` is not copied. The worker carries the merge-specific
  playbook, merge-gate carries orchestration only, and the unrelated "no automatic conflict
  resolution" rule for the delivery-branch `merge` completion action in
  `src/shared/worktree-integration.md` stays untouched and is named as deliberately scoped.

### Deep interactive review — 2026-08-11

- **Architecture, Critical — decided.** The plan said nothing about completion mode `report`, while
  merge-gate's existing rule states that `report` withholds exactly one action. Left unaddressed,
  the implementer would either invent a second exception or push a semantic merge commit from a
  run the operator asked only to report — silently, either way. Decided: the resolution runs in
  `report` too, the rule keeps its single exception, and the accepted cost is written into the
  architecture decisions instead of discovered at run time.
- **Scope, Critical — decided.** The plan simultaneously required the worker to make the
  repository's checks pass and forbade it to touch any non-conflicted file. Those cannot both hold:
  a conflict whose two sides change behavior routinely makes an adjacent test stale without Git ever
  marking it conflicted, so every such case would have ended as `ABORT`. Decided: an adjacent file may be
  changed only to make a **named** failing check pass, each one reported and justified, with the
  gate reconciling reported against actually modified paths before it commits.
- **Architecture, Important — incorporated.** "Approach" described the feature's runtime control
  flow, not the implementation order. Order is load-bearing here: the `{{AGENT:X}}` dead-reference
  guard fails the build if `merge-gate.md` names the worker before its source exists, and the
  three-place config-key test passes only when all three places land together. An eight-step
  ordered sequence was added and the runtime flow moved to its own subsection.
- **Scope, Important — incorporated.** No out-of-scope boundary was stated, next to four adjacent
  conflict-handling sites that all look like natural extensions. They are now named and excluded.
- **Testability, Important — incorporated.** The validation plan named commands without expected
  results. It is now a command table with expected results, plus the order `AGENTS.md` prescribes.
- **Error cases, Important — incorporated.** The plan carried abort behavior inside the feature
  description but no stop conditions for the implementer. Five were added, each tied to a concrete
  assumption that would invalidate an architecture decision if false.
- **Maintainability, Important — incorporated.** The plan quoted three line-anchored references
  with no recorded planning basis. It now records `36ea4fe`, the date, the working state, and how to
  detect that the quoted sentences have drifted.
- **Maintainability, Note — decided.** The worker's central-skill relationship was left "to the
  implementation". Decided: none, so both skill-ownership files stay unchanged and the open question
  does not reach the implementer.

## Open points

- No open points.
