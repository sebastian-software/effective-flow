# Explicit sub-agent delegation mandate

**Plan status:** Implemented
**Source:** /effective-flow plan
**Recommended workflow:** Feature (`/effective-flow build`)

## Requirement

Claude Code's host system prompt tells the model not to spawn sub-agents unless the user asked
for it. Effective Flow's sources never state that invoking `/effective-flow <tool>` **is** that
request, so a run can silently collapse its delegating pipeline into inline work by the
orchestrator — the model reads the harness default as the stronger signal and never reaches the
delegation step.

Today the intent is only implicit. Tools name their workers imperatively
(`build.md:237` "Start the appropriate implementer skill", `build.md:267`, `build.md:274`,
`apply-review.md:384`), and analysis steps are worded as an explicit free choice
(`plan.md:102`, `investigation-method.md:8`, `initial-state-documentation.md:8`,
`plan-issue.md:169` — all "locally or with an internal sub-agent"). Nothing anywhere declares
delegation to be the intended, authorized default.

Goal: make the delegation intent explicit and binding in the source, so that

- delegating to a named worker role is mandatory, not a judgment call;
- delegating an analysis or exploration step is the default rather than one of two equal options;
- a worker may itself fan out read-only analysis sub-agents;
- inline execution remains a legitimate but **disclosed** fallback, never a silent one.

Workflow recommendation rationale: this is a **Feature**, not a refactoring. It changes observable
run behavior — a rule that did not exist becomes binding, and workers gain a capability they do not
have today — so the "no behavior change" test for `/effective-flow refactor` fails. The change also
needs the full feature pipeline: a new shared contract, a new test, and three documentation
surfaces.

## Architecture decisions

- **One new shared fragment `src/shared/delegation-mandate.md` as the single source of truth.**
  The repository's established mechanism for a cross-tool rule is a shared include
  (`src/shared/*.md`, `AGENTS.md` build architecture). Duplicating the rule per tool would violate
  the repository's no-second-copy principle.
- **Eager (` ```include `), not lazy (` ```lazy-include `).** A lazy pointer renders as
  "Load on demand … when you are about to delegate" (`build-lib.mjs:1461`). The failure mode being
  corrected is precisely that the model never treats the delegation step as reachable, so a
  condition gated on that step can be skipped by the same reasoning. The mandate must be present
  before the model plans the run.
- **Hard size ceiling of 16 lines for the fragment.** The build enforces a 700-line context budget
  for the always-loaded core of `build`, `fix`, `docs`, `review`, `plan` (`build.mjs:1051`). The
  current build snapshot puts `review` at 664 lines — 36 lines of headroom, so 16 lines leaves 20
  to spare. The fragment is the only new eager content in this change; if its six points do not fit,
  compress the wording rather than adding lines.
- **Harness-neutral prose inside the fragment; no `{{WORKER_RESOLUTION}}`.** That placeholder is
  substituted for `SKILL.md` only (`build.mjs:766`), while the unresolved-placeholder guard
  (`build.mjs:998`) fails the build for every other rendered file. The fragment therefore names
  the mechanism generically, in the same style `task-tracking.md:3` uses for task tools.
- **The router carries one sentence.** `src/SKILL.md:49` already defines what workers are; it is
  always loaded and is the earliest point at which the standing authorization can be stated. One
  sentence there, the full contract in the fragment.
- **Analysis delegation flips from optional to default-on.** The four "locally or with an internal
  sub-agent" sites are rewritten to "delegate … unless the step is trivial", with the triviality
  test named inline so the rule stays falsifiable.
- **Workers get the mandate plus a read-only sub-agent grant.** Claude workers ship an explicit
  tool allowlist (`build.mjs:845`; every source at `src/agents/*.md:7`), so a delegation
  instruction without a matching grant would be unfulfillable. The grant is limited to read-only
  analysis fan-out: a worker never re-delegates its own assignment and never delegates a write.
- **No configuration key.** The mandate is unconditional. Adding `delegation.mode` would mean a
  new key in the project-setup ADR, a wizard question, a migration default and documentation, for
  an escape hatch nobody has asked for. The disclosed inline fallback already covers the only real
  constraint (a harness without a sub-agent mechanism).
- **A contract test pins the wiring — and no build guard.** `test/` already holds source-reading
  contract tests (`refactor-review-lifecycle-contract.test.mjs` is the pattern). Without one, an
  added tool or agent silently misses the mandate. A second enforcement layer in `build.mjs` would
  assert the same source facts the test already asserts, and `pnpm test` runs before
  `node build.mjs` in the documented CI sequence, so the guard would only ever fire on an
  already-red tree. `build.mjs` therefore stays untouched, which keeps this change to prose and
  frontmatter.
- **Two independently shippable steps.** Step 1 (fragment, router, tools, shared fragments, test,
  docs) is fully verifiable from the repository. Step 2 (worker mandate plus the read-only
  sub-agent grant) depends on an externally verified tool name and changes what a worker _can_ do.
  Keeping them separate means the unverifiable part cannot block or silently corrupt the rest.

## Affected files

| File                                        | Description                                                                                                                                                                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/delegation-mandate.md`          | **new** — the mandate: standing authorization, mandatory worker delegation, default-on analysis delegation, triviality exception, disclosed inline fallback, no nested write delegation, workflow-delegation carve-out. Maximum 16 lines. |
| `src/SKILL.md`                              | extend the worker rule (line 49) with one sentence: invoking a tool is the user's standing request for internal delegation.                                                                                                               |
| `src/tools/build.md`                        | add the eager include next to the existing `completion-protocol` include.                                                                                                                                                                 |
| `src/tools/fix.md`                          | add the eager include.                                                                                                                                                                                                                    |
| `src/tools/refactor.md`                     | add the eager include.                                                                                                                                                                                                                    |
| `src/tools/docs.md`                         | add the eager include.                                                                                                                                                                                                                    |
| `src/tools/maintain.md`                     | add the eager include.                                                                                                                                                                                                                    |
| `src/tools/review.md`                       | add the eager include (tightest budget headroom — measure after).                                                                                                                                                                         |
| `src/tools/iterate.md`                      | add the eager include.                                                                                                                                                                                                                    |
| `src/tools/apply-review.md`                 | add the eager include; leave the existing non-interactive delegation contract untouched.                                                                                                                                                  |
| `src/tools/apply-issues.md`                 | add the eager include; leave the existing analysis/delegation sub-agent contract untouched.                                                                                                                                               |
| `src/tools/plan.md`                         | add the eager include; rewrite step "Examine the relevant areas of the codebase locally or with an internal sub-agent" (line 102) to default-on delegation.                                                                               |
| `src/tools/plan-issue.md`                   | add the eager include; rewrite the analysis phrasing at line 169.                                                                                                                                                                         |
| `src/tools/investigate.md`                  | add the eager include.                                                                                                                                                                                                                    |
| `src/tools/plan-review.md`                  | add the eager include for read-only analysis fan-out only; its ban on starting implementers, test writers, validators and code reviewers stays untouched and must be restated where the include sits.                                     |
| `src/tools/concept-review.md`               | add the eager include on the same read-only terms.                                                                                                                                                                                        |
| `src/shared/investigation-method.md`        | rewrite step 2 (line 8) to default-on delegation of the read-only investigation. Consumers are `fix`, `investigate`, `build` — all already in scope.                                                                                      |
| `src/shared/initial-state-documentation.md` | rewrite the investigation step (line 8) to default-on delegation. Consumers are `fix`, `investigate`, `build`.                                                                                                                            |
| `src/agents/*.md` (15 files)                | **step 2** — add the eager include; add the harness's sub-agent tool to `claude.tools`, scoped read-only by the fragment's own wording.                                                                                                   |
| `test/delegation-mandate-contract.test.mjs` | **new** — contract test for fragment, wiring, line ceiling, rewritten phrasings and (in step 2) the tool grant.                                                                                                                           |
| `AGENTS.md`                                 | short "Delegation is the default" rule in the agent-behavior section.                                                                                                                                                                     |
| `docs/developer-guide/architecture.md`      | document the mandate next to the worker table (line 90 ff.) and the layered ownership contract.                                                                                                                                           |
| `docs/user-guide/troubleshooting.md`        | new symptom entry: "the tool did everything itself instead of delegating".                                                                                                                                                                |

## Implementation details

### Approach

**Step 1 — the mandate itself (self-contained, fully verifiable in-repo).**

1. Write `src/shared/delegation-mandate.md` with, at most, these points, in this order:
   - invoking an Effective Flow tool is the user's standing request for internal delegation; a
     host default that discourages unrequested sub-agents does not apply inside a tool run;
   - where the workflow names a worker role, delegating to it is **mandatory**;
   - for analysis, exploration and research, delegation is the **default**; work inline only when
     the step is trivial (a single known file, one lookup, or a step whose whole cost is smaller
     than briefing a worker);
   - a worker may fan out **read-only** analysis sub-agents; it never re-delegates its own
     assignment and never delegates a write;
   - if the harness offers no sub-agent mechanism, or the delegation is declined at runtime, work
     inline and say so in one visible line — never silently;
   - the mandate covers worker roles and analysis fan-out only. Delegation from one workflow to
     another keeps its own tool's mechanics, including its interactive/gated path.
2. Verify the fragment is at most 16 lines.
3. Extend the router rule in `src/SKILL.md`.
4. Add the eager include to each tool in the "Affected files" table, placed next to the existing
   `completion-protocol` / `task-tracking` include block so include order stays conventional.
5. Rewrite the four optional-delegation phrasings.
6. Run the ownership check `AGENTS.md` requires for a new shared include: does the fragment carry a
   second copy of a centrally owned playbook? Expected outcome is no — delegation mechanics are
   Effective Flow's own orchestration ownership — so `docs/developer-guide/skill-ownership.json`
   and its Markdown sibling stay unchanged. Record that outcome rather than skipping the check.
7. Write `test/delegation-mandate-contract.test.mjs` for everything above.
8. Update `AGENTS.md`, `docs/developer-guide/architecture.md` and
   `docs/user-guide/troubleshooting.md`.
9. Run the CI sequence: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
   Read the build's budget line and confirm every budget tool stays under 700 lines.
10. Smoke-check the behavior (see "Validation plan"). Step 1 is only done when a delegating tool
    demonstrably starts a worker.

**Step 2 — the worker grant (depends on one external fact).**

11. Confirm the exact sub-agent tool name the installed Claude Code version exposes to an agent
    allowlist. **Stop condition:** if it cannot be confirmed, ship step 1 alone and leave step 2
    open — do not guess a name. A wrong entry is silently dropped by the harness, which produces a
    worker that is told to delegate and cannot.
12. Add the eager include to all 15 `src/agents/*.md` sources and extend their `claude.tools` list
    with that tool. Do not touch the `codex:` blocks — Codex agents carry no tool allowlist, so
    prose alone is sufficient there.
13. Extend the contract test: every agent carrying the mandate also lists the sub-agent tool.
14. Re-run the CI sequence, then smoke-check that a worker can fan out a read-only analysis
    sub-agent and that nothing re-delegates a write.

### Component structure

Not relevant — this change is prose, agent frontmatter and one test.

### State management

Not relevant.

### API integration

Not relevant.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **Harness without a sub-agent mechanism** (portable/DALO target, restricted host): the tool works
  inline and prints one visible fallback line. Silent inline execution is the defect this change
  removes, so the notice is part of the contract, not optional.
- **Delegation declined at runtime** (user rejects the permission prompt): treated exactly like an
  unavailable mechanism — inline plus notice, no retry loop, no repeated prompting.
- **Trivial step**: the mandate must not force ceremony. The triviality test is named in the
  fragment; a one-file read stays inline.
- **Recursion**: a worker's read-only sub-agent may not delegate further and may not write. Without
  this, nested fan-out can multiply cost and produce concurrent edits to the same file.
- **Existing non-interactive delegation contracts** in `apply-review` and `apply-issues` (approval
  gates dropped for delegated runs, commit mutex, completion protocol) stay authoritative; the
  mandate adds authorization, it does not change their mechanics.
- **Budget guard trip**: if `review` exceeds 700 lines after the change, shorten the fragment
  rather than raising the budget — the budget is a deliberate context-cost decision.
- **Wrong tool name in the allowlist**: a mistyped tool name is silently dropped by the harness and
  the workers lose their grant without any error. Neither the build nor a source-reading test can
  catch that — only the step 2 stop condition (confirm the name first) and the step 2 smoke check
  can.

## Acceptance criteria

- [ ] `src/shared/delegation-mandate.md` exists and has at most 16 lines.
- [ ] The fragment states all six points from "Approach" step 1 and contains no
      `{{WORKER_RESOLUTION}}` placeholder.
- [ ] `src/SKILL.md` states that invoking a tool is the user's standing delegation request.
- [ ] Every tool listed in "Affected files" contains the eager ` ```include ` for the fragment;
      `commit`, `pr`, `setup`, `open-plans`, `cleanup`, `version`, `apply`, `concept`,
      `apply-plan` and `pr-review` do not.
- [ ] `plan-review.md` and `concept-review.md` still forbid starting implementers, test writers,
      validators and code reviewers, and that ban is restated next to the include.
- [ ] No occurrence of "locally or with an internal sub-agent" or "locally or via an internal
      Explore sub-agent" remains in `src/`.
- [ ] `node build.mjs` succeeds and reports every budget tool at or below 700 lines.
- [ ] `test/delegation-mandate-contract.test.mjs` covers fragment existence, the 16-line ceiling,
      per-tool wiring, the router sentence and the absence of the old phrasings — and passes.
- [ ] `build.mjs` is unchanged by this plan.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution` all pass.
- [ ] `AGENTS.md`, `docs/developer-guide/architecture.md` and `docs/user-guide/troubleshooting.md`
      describe the mandate.
- [ ] **Behavioral (manual, deliberately not CI-reproducible):** one `/effective-flow fix` run
      against a trivial defect in a throwaway scratch project starts the routed implementer worker;
      the transcript shows the worker invocation and no inline edit by the orchestrator. This is the
      criterion the whole change exists for — a green text-only criteria set does not satisfy it.
      Record the observation in the completion report.
- [ ] **Step 2 only:** all 15 `src/agents/*.md` contain the eager include and list the confirmed
      sub-agent tool in `claude.tools`, and the contract test asserts that pairing. If step 2 is
      deferred under its stop condition, this criterion is explicitly recorded as deferred rather
      than dropped.

## Validation plan

- `pnpm agent:check` — formatting of the changed Markdown and JS.
- `pnpm test` — unit suite including the new contract test.
- `node build.mjs` — include resolution, unresolved-placeholder guard, worker-reference guard and
  the context-budget report.
- `pnpm test:distribution` — the three built targets still install and deliver.
- Manual smoke check in a scratch project: run one delegating tool (`/effective-flow fix` on a
  trivial defect) and confirm from the transcript that the implementer worker was actually started
  rather than the orchestrator editing inline.

## Assumptions and open points

**Planning baseline:** `ad5462e`, 2026-08-05, branch `develop`. The worktree was clean apart from
two untracked plan files under `docs/plan/` (this one and
`2026-08-05-merge-gate-rename-and-review-in-flight-guard.md`); no in-scope source file had
uncommitted changes. Before executing, re-check the cited line numbers in `src/tools/build.md`,
`src/tools/plan.md`, `src/shared/investigation-method.md`, `src/shared/initial-state-documentation.md`
and `src/SKILL.md` — line movement is harmless, but a rewritten delegation phrasing or a changed
context budget invalidates the sizing decision.

**Out of scope**, deliberately, so this stays one reviewable change:

- no `delegation.mode` configuration key, no wizard question, no config migration;
- no change to the parallelization rule (`project-routing.md:41` stays "only when the buckets are
  cleanly separable");
- no mandate in the non-delegating tools (`commit`, `pr`, `setup`, `open-plans`, `cleanup`,
  `version`, `apply`, `concept`);
- no mandate in the workflow-delegating tools `apply-plan` and `pr-review`, and no rework of
  workflow-to-workflow delegation, including `pr-review`'s gated `iterate` path;
- no rework of the existing non-interactive delegation contracts in `apply-review` /
  `apply-issues`;
- no change to `build.mjs`.

Verification assumptions (each is a lookup during implementation, not a decision):

- The exact Claude Code sub-agent tool name for an agent allowlist could not be verified from the
  repository: no installed agent under `~/.claude/agents/` grants one, and `build.mjs` does not
  validate tool names, so a wrong name fails silently. This is what gates step 2 and carries its
  own stop condition.
- The `review` headroom figure (664 of 700 lines) comes from the existing `dist/` snapshot, which
  may be one build behind `src/`. Re-measure from a fresh `node build.mjs` before sizing the
  fragment.
- Parallelization rules stay untouched: "parallelize only when the buckets are cleanly separable"
  (`project-routing.md:41`) remains as is. This plan makes delegation explicit, not parallelism.
- Whether Codex behaves like Claude Code here is untested. The mandate is harness-neutral prose, so
  it applies, but the observed problem is a Claude Code one.

## Implementation notes

Implemented by `/effective-flow build` on 2026-08-05 from `origin/develop` at `ad5462e`, in the
delivery worktree of run `20260805-081111`. Delivered as one step, not two: the plan's step-2 stop
condition was resolved rather than triggered.

Deviations from the plan as written, all deliberate:

- **The step-2 stop condition cleared.** The sub-agent tool name was confirmed empirically against
  the installed Claude Code 2.1.220: the canonical name is `Agent`, with `Task` as a registered
  alias. Agent frontmatter grants **both**, because an unrecognized entry in a `tools:` allowlist
  is silently dropped and older CLIs know only `Task`. Step 2 therefore shipped with step 1 and no
  acceptance criterion was deferred.
- **The fragment's line ceiling moved from 12 to 16** during the plan review, when the
  workflow-delegation carve-out became a sixth point. The delivered fragment is 9 lines.
- **The fragment names `Agent`/`Task`** in a hedged list, deliberately diverging from the
  "harness-neutral prose" architecture decision — that naming is what makes the mandate actionable
  on the harness where the defect was observed. Recorded as `R-0000080`.
- **Five tools additionally gained a lazy `completion-protocol` include** (`plan`, `plan-issue`,
  `plan-review`, `concept-review`, `investigate`). Not in the plan, but caused directly by it:
  delegation became their default while their "the delegate returned nothing" path was undefined.
- **`apply-review` and `apply-issues` gained a one-line restatement** that their component and
  per-issue delegation is workflow-to-workflow, so the carve-out cannot be misread against their
  commit mutex, overlap components and synchronization barrier.
- **The triviality exception is defined once** in the fragment; the four rewritten analysis sites
  reference it instead of restating a narrower version.

Final always-loaded budget (guard 700): `build 528`, `fix 424`, `docs 557`, `review 675`,
`plan 490`. `review` is the tightest at 25 lines of headroom.

### Correction after review: the grant is conditional, not universal

The plan granted the sub-agent tool to all 15 workers. Review finding `R-0000079` showed why that
was wrong for the workers whose tool list cannot write: for them the allowlist **was** the read-only
guarantee, and a sub-agent tool starts a child with the child's own tool set, so a read-only worker
reaches a write through that child. Their Codex counterparts keep `sandbox_mode: read-only`, so the
two build targets were no longer equally strong.

The attempted middle ground — keep the grant and narrow it with the allowlist form
`Agent(<type>)` — was **empirically disproven**. A probe agent declared
`tools: Read, Glob, Grep, Agent(Explore)` successfully spawned a `general-purpose` subagent, twice,
in two independent runs. The parenthesised form reads as a grant and applies no type restriction.
The contract test now guards against reintroducing it.

The delivered rule is therefore conditional and keyed on role, not on raw write capability:

- a worker whose `claude.tools` lists `Write` or `Edit` **produces changes**, carries `Agent, Task`
  and may fan out read-only analysis sub-agents — ten workers today;
- a worker listing neither is an **observation role**, carries neither, and does not delegate at all
  — the four reviewers plus `code-validator`.

`Bash` is deliberately not the criterion. It is not harmless — `code-validator` holds it to run the
repository's checks and can reach a write through it — so for that one worker the withheld grant is
defence in depth, not a guarantee. For the four reviewers it is the whole guarantee. The fragment's
fan-out bullet states the mechanism rather than a promise: a worker whose tool list carries no
sub-agent tool does not delegate at all, and that limit rests on the tool list, not on prose.

## Test results

| Check                    | Result                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `pnpm agent:check`       | pass — 266 files, no formatting complaint                                                             |
| `pnpm test`              | pass — 476/476 (473 before the review fixes, +3 net)                                                  |
| `node build.mjs`         | pass — no include, placeholder, worker-reference, agent-frontmatter or eager/lazy-overlap guard fired |
| `pnpm test:distribution` | pass — offline checks passed                                                                          |

`test/delegation-mandate-contract.test.mjs` adds 9 tests. They derive the tool and agent sets by
scanning the directories, so a future tool or agent that misses the include or the `Agent, Task`
pairing fails in both directions. Mutation probes confirmed the two load-bearing assertions bite:
a lazily included fragment in an excluded tool fails, and inverting the mandate's default fails.

**Not satisfied by this run:** the plan's behavioral acceptance criterion — one
`/effective-flow fix` run in a throwaway scratch project whose transcript shows the routed
implementer worker actually starting. It is a manual, interactive check by design and cannot be
executed from inside this workflow. It remains outstanding for the maintainer.

## Review findings

**Date:** 2026-08-05
**Reviewer:** `effective-flow-generic-product-reviewer`, `effective-flow-nodejs-reviewer`

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    19 |
| Open / Not implemented |     1 |

One Critical (a contract-test guard that could never fire, because its lazy-include regex matched
no real fence shape) and six Important findings were fixed before completion. `R-0000079` — the
sub-agent grant on the observation-role workers — was fixed afterwards on the same branch, see
"Correction after review" above. The one remaining entry is a Note recorded in the external
report: the fragment names `Agent`/`Task` in a hedged list, a deliberate divergence from the
harness-neutral-prose decision.

**External review report:** `.effective-flow/review/review-report-2026-08-05-plan-explicit-sub-agent-delegation-mandate.md`

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         2 |    0 |
| Scope           |        0 |         3 |    1 |
| Maintainability |        0 |         1 |    0 |

### Findings

Every Important finding was incorporated before approval; the three decision-requiring ones were
resolved with the user during the deep review.

- Architecture, Important — _incorporated_: the first draft added a guard plus a name constant to
  `build.mjs` that asserted exactly what the contract test asserts, and `pnpm test` runs before
  `node build.mjs` anyway. Removed. The change no longer touches build code at all, which is a
  meaningfully smaller review surface for a prose change.
- Testability, Important — _incorporated_: the acceptance criteria were entirely textual. Every one
  of them could have been green while the actual defect — the orchestrator quietly doing the work
  itself — persisted. A behavioral criterion tied to an observed worker invocation was added and
  marked as the criterion the change exists for.
- Scope, Important — _incorporated_: the worker tool grant depends on a fact that could not be
  verified from the repository, yet was sequenced inline with fully verifiable work. It is now
  step 2 with an explicit stop condition, so an unconfirmable tool name defers one criterion
  instead of blocking or silently corrupting the whole change.
- Scope, Important — _incorporated_: no explicit exclusions. A change that touches 30-odd sources
  invites side quests (a config key, the parallelization rule, the `apply-*` delegation
  mechanics). An out-of-scope list was added.
- Maintainability, Important — _incorporated_: no planning baseline. The plan cites concrete line
  numbers throughout, so it needed a recorded HEAD and a drift instruction to stay executable
  later.
- Error cases, Important — _decided_: the first draft's mandate would have covered
  workflow-to-workflow delegation too. `pr-review` passes its own gated/non-interactive run state
  into the `iterate` delegation (`pr-review.md:186`), so a mandate that forces every named
  delegation target into a sub-agent would break the gated path — the delegate could no longer ask
  the user. Decision: the mandate covers worker roles and analysis fan-out only, says so explicitly,
  and `apply-plan` and `pr-review` are out of scope entirely.
- Scope, Important — _decided_: `plan-review` and `concept-review` were excluded although both read
  broadly in the code and would keep doing exactly the inline gathering this change removes.
  Decision: both get the mandate for read-only analysis fan-out; their ban on starting implementers,
  test writers, validators and reviewers is restated next to the include so the two rules cannot be
  confused.
- Testability, Important — _decided_: the behavioral criterion needed an owner and a venue.
  Decision: a manual run in a throwaway scratch project, observed from the transcript, explicitly
  accepted as not CI-reproducible and recorded in the completion report.
- Architecture, Note: eager inclusion in 15 agent sources plus 14 tools makes the fragment the most
  widely embedded shared block in the repository. That is intended — it is the point of the change
  — but every future edit to it becomes a repository-wide behavior change. The contract test keeps
  that visible; the 16-line ceiling keeps it affordable.
- Scope, Note: the read-only sub-agent grant is the only part that changes what a worker _can_ do
  rather than what it is told to do. It is capped (read-only, no re-delegation of its own
  assignment, no nested writes) and, as step 2, revertible on its own.

## Open points

- No open points.
