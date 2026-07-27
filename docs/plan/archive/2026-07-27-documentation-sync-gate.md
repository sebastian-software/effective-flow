# Documentation sync gate in the implementation tools

**Plan status:** Implemented
**Source:** /effective-flow plan
**Recommended workflow:** Feature (`/effective-flow build`)

## Requirement

After every implementation run the documentation must be brought back in sync with the change.
Today this is inconsistent across the implementation tools:

- `src/tools/build.md` has a "Phase 3: Documentation" (`code-documenter` + `docs-writer`), but it
  is explicitly skippable (`Skip user docs only with a short justification`).
- `src/tools/fix.md` has no documentation phase at all.
- `src/tools/refactor.md` forbids one (`do not introduce a documentation phase if the refactoring
changes no public behavior`).
- `src/tools/maintain.md` has no documentation phase at all.

The documentation check must become a fixed, non-skippable part of these four tools. Remaining
documentation gaps block completion the same way an open critical review finding does.

The user decided three questions up front:

1. **Mechanism:** a new shared fragment, not a nested `/effective-flow docs` sub-workflow.
2. **Scope:** `build`, `fix`, `refactor`, `maintain`.
3. **Strictness:** mandatory phase, blocking.

Three further decisions were taken in the deep plan review: the non-interactive blocking path
(D1), the delegated write boundary (D2), and the eager-core/lazy-detail split (D3). They are
recorded as architecture decisions with their rejected alternatives.

Rationale for the workflow recommendation: this adds a new cross-tool capability (a new shared
contract, a new build guard, new tests) rather than repairing a defect or restructuring existing
behavior, so `Feature` / `/effective-flow build` fits.

## Architecture decisions

- **A new shared fragment pair, not a nested `{{SKILL:docs}}`
  call.** `docs` is a complete workflow that owns its own worktree, commit, plan-status switch and
  delivery action (`src/tools/docs.md`, Phase 4). Invoking it from inside `build`/`fix`/`refactor`/
  `maintain` would create two competing delivery owners inside one run — the exact failure mode
  `skill-discovery` already warns about for nested orchestrators. The fragment therefore reuses the
  documentation _workers_ (`{{AGENT:code-documenter}}`, `{{AGENT:docs-writer}}`,
  `{{AGENT:marketing-writer}}`) inside the calling workflow's existing execution-location receipt,
  delivery and commit ownership.
- **The fragment delegates craft to `tech-docs` and owns only orchestration.** Per the layered
  ownership contract in `AGENTS.md`, `tech-docs` is the declared domain owner for documentation
  craft. The fragment must carry no second documentation handbook: it owns the trigger, the surface
  inventory, the verdict states, the blocking rule and the write boundary; audience analysis,
  document shape, example accuracy and verification design stay with `tech-docs` through the three
  documentation agents. `documentation-sync` is registered as an additional `tech-docs` consumer
  with classification `delegate` in both ownership files.
- **Split into an eager core and a lazy detail contract** (user decision D3). The unconditional part
  — the phase itself, "this phase is mandatory and unskippable", and the obligation to produce a
  verdict per documentation surface — lives in the eager `src/shared/documentation-sync.md`
  (target ≤ 20 lines) and is therefore always in the loaded core of all four tools. The detailed
  contract (surface inventory, worker routing, verdict definitions, blocking rule, write boundary)
  lives in `src/shared/documentation-sync-contract.md` and is pulled in via a `lazy-include` fence
  **inside** the eager core, with the unconditional trigger `when: the documentation sync phase
starts`. A fully eager single fragment was rejected because the ≤ 90-line ceiling forced by the
  context-budget guard (#99) would make every later addition fight the budget; raising the budget was
  rejected because it weakens a deliberately set guard for all five budget tools. A purely lazy
  fragment stays rejected: a `when:` condition the model may judge inapplicable is exactly the skip
  this change removes — which is why the _mandate_ is eager and only the _detail_ is deferred.
- **A build guard enforces membership, mirroring the project-routing consumer guard (#164).** A
  fixed consumer set (`build`, `fix`, `refactor`, `maintain`) must embed the fragment eagerly;
  otherwise the build fails. Unlike #164, the check logic goes into `build-lib.mjs` as a pure
  function so it is unit-testable in `test/build-lib.test.mjs` (pattern: `findRuntimeStateSafetyViolations`).
- **Phase position mirrors `build`: documentation runs directly after implementation and before
  the run's verification/review phases**, so the existing validators and reviewers cover the
  documentation changes (in-code documentation touches code files and must pass lint/format/build
  like any other change).
- **Sub-numbered phases (`Phase 3.5`) instead of renumbering.** `fix`, `refactor` and `maintain`
  reference their phase ranges in the goal-completion prose (e.g. "covers phases 3–5"). Sub-numbering
  is already native to this repository (`Phase 2.5` in `iterate`, `Phase 4.1/4.2/4.3` in
  `apply-review`) and avoids a ripple edit through every range reference.
- **Three explicit verdict states per documentation surface** (`updated`, `no impact`, `blocked`)
  make "the gate ran" verifiable instead of implicit. `no impact` requires a concrete, checkable
  rationale; a bare "not relevant" does not satisfy the gate.
- **Blocking behaves differently by interaction mode** (user decision D1). Interactive runs escalate
  to the user after the bounded correction rounds of "Goal-driven completion control"; no completion,
  plan-status switch or delivery action may run while a surface is `blocked`. Non-interactive
  delegations (`apply-review`, `apply-issues`, `iterate`) have no user to ask and must **not** abort:
  a still-blocked surface becomes an open finding with `Action: {{SKILL:docs}}` in the run's review
  report under `.effective-flow/review/` — the mechanism `build`, `fix` and `refactor` already own —
  and is named in the completion summary. Rejected alternative: returning
  `ABORT: documentation gate blocked` through the completion protocol. `apply-review` Phase 4.3
  marks an aborted delegation as `failed (delegation)` and then runs its stash cleanup, so a
  successful code fix would be reported as failed and its working tree cleaned up over a
  documentation gap. Also rejected: a new non-fatal blocked payload, which would extend this change
  into `apply-review`, `apply-issues` and `iterate`. Neither surviving path lets a blocked surface
  pass silently — the difference is escalation to a human versus escalation to the review report.
- **In non-interactive delegation the gate writes only documentation inside files the run already
  owns** (user decision D2) — in-code documentation, doc comments and CLI help text in the changed
  files. Separate documentation files are recorded as open findings with `Action: {{SKILL:docs}}`
  instead of being written. Reason: `apply-review` Phase 4.3 permits a delegation sub-agent to stage
  only finding-owned files, and `iterate` Phase 3 requires a delegation to stop before touching a
  path outside its analyzed set. Documentation files are almost never in those sets, so writing them
  would either violate the commit-integrity contract or force a serialization round through the
  orchestrator. Rejected alternatives: extending `apply-review`'s mutex rule to admit documentation
  paths (a real change to commit integrity, out of scope here), and unrestricted writing (breaks
  path ownership for parallel findings). Interactive runs are unaffected and write the full surface
  set.
- **`docs`, `iterate`, `apply-*` are not consumers.** `docs` _is_ the documentation workflow;
  `iterate` and the `apply-*` tools own no implementation phase of their own and inherit the gate
  through their delegations to `build`/`fix`/`refactor`/`docs`.

## Affected files

| File                                        | Description                                                                                                                                                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/documentation-sync.md`          | **New, eager core (≤ 20 lines).** Declares the mandatory, unskippable documentation phase and the obligation to produce a verdict per documentation surface; contains the `lazy-include` fence for the detail contract.                      |
| `src/shared/documentation-sync-contract.md` | **New, lazy detail.** Surface inventory, worker routing, verdict definitions, blocking rule per interaction mode, write boundary, reporting, and the `tech-docs` delegation statement.                                                       |
| `src/tools/build.md`                        | Replace the body of "Phase 3: Documentation" with the eager include; drop `Skip user docs only with a short justification`; adjust the `Skip optional steps only with a short justification` rule so it cannot be read as covering the gate. |
| `src/tools/fix.md`                          | Add the eager include and a new `### Phase 3.5: Documentation sync` between Phase 3 (Fix) and Phase 4 (Verification).                                                                                                                        |
| `src/tools/refactor.md`                     | Add the eager include and `### Phase 3.5: Documentation sync` between Phase 3 (Refactoring) and Phase 4 (Review); remove the rule `do not introduce a documentation phase if the refactoring changes no public behavior`.                    |
| `src/tools/maintain.md`                     | Add the eager include and `### Phase 3.5: Documentation sync` after the Phase 3 group loop and before Phase 4 (Review); state that the gate's changes get their own dedicated commit, because Phase 3 commits per update group.              |
| `build-lib.mjs`                             | New pure `findDocumentationSyncViolations` (or equivalent) plus its assertion helper, following the existing pure-guard pattern.                                                                                                             |
| `build.mjs`                                 | Wire the new guard into `readSource` next to the project-routing consumer guard; declare the consumer set.                                                                                                                                   |
| `docs/developer-guide/skill-ownership.json` | Add `{ "consumer": "documentation-sync", "classification": "delegate" }` to the `tech-docs` entry.                                                                                                                                           |
| `docs/developer-guide/skill-ownership.md`   | Add `documentation-sync` to the `tech-docs` consumer cell (line 76) so the Markdown table reconciles with the manifest, and extend the prose note at line 126.                                                                               |
| `docs/developer-guide/build-system.md`      | Document the new guard in the "Guards" list.                                                                                                                                                                                                 |
| `docs/user-guide/tools-implement.md`        | Document the new mandatory documentation phase for `build`, `fix`, `refactor`, `maintain`; correct the refactor statement at line 129.                                                                                                       |
| `test/build-lib.test.mjs`                   | Unit-test the pure guard: present/absent/lazy-only cases.                                                                                                                                                                                    |
| `test/workflow-contracts.test.mjs`          | Source-level contract test for the four consumers, the verdict states, the blocking rule and the removed skip clauses.                                                                                                                       |

## Implementation details

### Approach

0. **Reconcile with the open sibling plan first.**
   `docs/plan/2026-07-27-docs-tool-tech-docs-reconciliation.md` is open and touches four of the same
   files (`docs/developer-guide/skill-ownership.json`, `docs/developer-guide/skill-ownership.md`,
   `docs/user-guide/tools-implement.md`, `test/build-lib.test.mjs`) and rewrites
   `src/shared/doc-categories.md`. Implement that plan first, or rebase this one onto its result.
   Its substantive effect on this change: the four `docs/` categories become the _default_, and an
   established repository documentation structure discovered by `tech-docs` takes precedence. The
   surface inventory below must therefore name the **effective** documentation structure, not the
   four category paths as absolutes.

   A third open plan, `docs/plan/2026-07-27-concept-tool-and-concept-review.md`, also edits
   `build.mjs`, `docs/developer-guide/skill-ownership.json` / `.md`, `src/shared/doc-categories.md`
   and `test/workflow-contracts.test.mjs`. It adds independent rows and guards, so the overlap is
   textual rather than semantic — but land the three plans sequentially rather than in parallel
   worktrees, and re-run `node build.mjs` after each, because the ownership guard reconciles the
   manifest against the Markdown table as a whole.

1. Write the eager core `src/shared/documentation-sync.md` with an `## …` heading consistent with the
   other shared fragments (they contribute a section, e.g. `## Pre-commit gate`): the mandate, the
   verdict obligation, and a ` ```lazy-include ` fence for `documentation-sync-contract` with the
   unconditional trigger `when: the documentation sync phase starts`.
2. Write `src/shared/documentation-sync-contract.md` with elements 2–9 of the gate contract below;
   element 1 (mandate and verdict obligation) stays in the eager core.
3. Embed the eager core in the four consumer tools at the phase positions listed above; in `build`
   replace the existing Phase 3 body rather than adding a second documentation phase.
4. Remove the two clauses that contradict a mandatory gate (`build.md` skip clause, `refactor.md`
   no-documentation-phase rule) and the corresponding user-guide statement.
5. Add the pure guard function to `build-lib.mjs` and call it from `build.mjs` inside `readSource`,
   next to the existing project-routing consumer guard.
6. Register `documentation-sync` as a `tech-docs` consumer in the manifest **and** the Markdown
   inventory; both are reconciled by the central-skill ownership guard (#168), so they must be
   changed together.
7. Update the developer-guide and user-guide documentation for the new behavior and the new guard.
8. Add the unit test and the contract test.
9. Run the CI sequence: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.

### Gate contract

Element 1 lives in the eager core; elements 2–9 live in the lazy detail contract.

1. **Trigger and position (eager core).** Runs unconditionally in every consuming workflow once the
   implementation of the run is functionally complete and before its verification/review and
   completion phases. Not skippable, not conditional on a "user-relevant" pre-judgment. Every
   documentation surface it enumerates must end in one of the three verdicts of element 6. It runs
   inside the calling workflow's already-verified execution-location receipt and owns no delivery,
   commit strategy, plan-status switch or worktree of its own.
2. **Input.** The run's actually changed file set, the routing buckets from the canonical project
   routing contract, the accumulated wisdom context, and the documentation target languages resolved
   once by the orchestrator (`language.documentation.user`, `language.documentation.technical`,
   `language.source`, `language.git`, as mapped in `Doc categories`). Agents receive the concrete
   resolved language and do not re-read configuration.
3. **Surface inventory.** For the changed set, enumerate the documentation surfaces the change can
   invalidate, expressed against the **effective** documentation structure of the repository per
   `Doc categories` (the four `docs/` categories where they are the effective structure, otherwise
   the established structure the documentation owner discovered): in-code documentation and CLI help
   of changed or new public surfaces; user-facing documentation (root `README.md` and the user
   documentation entry point and its documents) for changed user-visible behavior, commands, flags,
   installation or configuration; technical documentation (developer guide, operations, runbooks)
   for changed architecture, interfaces, build/test commands, runtime or dependency requirements;
   repository convention files (e.g. `AGENTS.md`) when the change alters the documented workflow.
   Plan files and review reports are **not** documentation surfaces — they are artifacts owned by
   other contracts.
4. **Judgment delegation.** Whether a surface is actually stale, and what it must say, is decided by
   `tech-docs` through the routed documentation agents. The fragment names `tech-docs` as the
   declared domain owner and carries no documentation handbook of its own — it must satisfy the
   existing duplicate-handbook contract test (`test/build-lib.test.mjs`, `central-skill adapters
retain Effective Flow ownership without duplicate handbooks`). The minimal fallback when
   `tech-docs` is absent is the repository-led one already declared in `src/tools/docs.md`
   ("Delegation contract"); it is referenced, not restated.
5. **Worker routing.** `{{AGENT:code-documenter}}` for in-code documentation, inline comments and
   CLI help; `{{AGENT:docs-writer}}` for user and technical documents including category entry
   points; `{{AGENT:marketing-writer}}` for the root `README.md` in its marketing-entry-point role.
   Disjoint file sets may run in parallel. The `Doc categories` write boundary and the conditional
   root-README follow-up-link rule apply unchanged.
6. **Verdict.** Every enumerated surface ends in exactly one state:
   - `updated` — with the concrete path and what changed;
   - `no impact` — with a concrete, checkable rationale naming why the change cannot invalidate that
     surface (a bare "not relevant" does not satisfy the gate);
   - `blocked` — a real gap this run cannot close within the documentation write boundary (for
     example a missing standalone guide, or a statement that needs a product decision), recorded
     with a prompt suggestion for a follow-up `{{SKILL:docs}}` run.
7. **Blocking rule.** The gate's completion condition is: no surface is `blocked` and none is
   unassessed. A `blocked` surface is handled like an open critical review finding — bounded
   correction rounds per "Goal-driven completion control", then:
   - **interactive:** escalate to the user with the concrete options (implement now / record an
     explicit, justified downgrade to `no impact` / accept as an explicitly deferred follow-up),
     record the decision, and run no completion, plan-status switch or delivery action while a
     surface is still `blocked`;
   - **non-interactive delegation:** do **not** abort. Record each remaining `blocked` surface as an
     open finding with `Action: {{SKILL:docs}}` in the run's review report under
     `.effective-flow/review/` per "Open review-finding reports", including its prompt suggestion,
     and name it in the completion summary. The run completes; the gap is carried, not lost.
8. **Write boundary.** Documentation only. Product logic must not change; documentation-adjacent
   code changes (comments, JSDoc/TSDoc, rustdoc, CLI help text) are allowed, matching the rules in
   `src/tools/docs.md`. In a non-interactive delegation the gate additionally writes **only** inside
   files the run already owns (in-code documentation, doc comments, CLI help of the changed files);
   separate documentation files are recorded as `Action: {{SKILL:docs}}` findings instead of being
   written, so the path-ownership and commit-integrity contracts of `apply-review` and `iterate`
   stay intact.
9. **Reporting.** The verdict table is part of the workflow's completion summary and is written into
   the wisdom file like every other phase result.

### Build guard

- Consumer set: `tools/build.md`, `tools/fix.md`, `tools/refactor.md`, `tools/maintain.md`.
- Requirement: each must contain `documentation-sync` (the eager core) as an **eager**
  ` ```include `. A lazy-include does not satisfy the guard (and the existing eager/lazy overlap
  guard already forbids both). The guard does not look for `documentation-sync-contract` in the
  tools — that fragment is reached only through the core.
- Failure message names the offending file and the requirement, in the style of
  `project-routing consumer guard (#164)`.
- The pure function returns the violations; `build.mjs` throws. This keeps the check unit-testable
  without a full build.

### Context budget

The context-budget guard (#99) caps the always-loaded core of `build`, `fix`, `docs`, `review`,
`plan` at 700 lines. The current measured sizes (from `node build.mjs`) are
`build 546, fix 433, docs 544, review 630, plan 478`. Only the eager core counts toward that
budget: at ≤ 20 lines it costs `build` roughly 14 net lines after its existing six-line Phase 3
body is replaced, leaving ample headroom. The lazy detail contract ships as
`shared/documentation-sync-contract.md` for all three targets and is not counted.

### Edge cases

- **Change with genuinely no documentation impact** (internal refactor, test-only change): the
  normal outcome is `no impact` per surface with a concrete rationale. The gate must not manufacture
  documentation work — otherwise every delegated micro-fix from `apply-review` would grow a
  documentation phase it does not need.
- **Non-interactive delegation** (`apply-review` Phase 4.3, `apply-issues`, `iterate` Phase 3): no
  interactive stop, no abort. The gate writes only in-run-owned files and carries every remaining
  gap as an `Action: {{SKILL:docs}}` finding into the run's review report.
- **A delegated run whose only documentation surface is a separate file:** the gate produces no
  writes at all and exactly one `Action: {{SKILL:docs}}` finding. That is the intended, proportionate
  outcome — not a gate failure.
- **A workflow that changed no files** (e.g. `fix` concluding "no bug, intended behavior"): the gate
  runs, finds an empty changed set, and records a single `no impact` verdict with that reason.
- **`maintain`**: Phase 3 commits one clean commit per update group, so the gate's documentation
  changes need their own commit (`docs: …`) before Phase 4; otherwise they would ride along with an
  unrelated group commit or stay uncommitted at the handback.
- **`refactor`**: documentation changes must not disturb the behavior baseline of Phase 2/5. In-code
  documentation changes touch code files and are therefore covered by the Phase 5 post-validation,
  which is why the gate sits before it.
- **Tooling-only changes** (CI, build files, repository metadata): the relevant surfaces are usually
  `AGENTS.md` and `docs/developer-guide/**`; the gate still runs and still needs a verdict.
- **Mixed repositories / unsupported product languages**: the documentation agents follow
  repository-native conventions and invent no format; the gate adds no new language handling beyond
  the existing routing contract.
- **Worktree runs**: the gate writes through the calling workflow's verified receipt only; it must
  never root operations in the main checkout.
- **`docs` itself and the internal `apply-*` tools** are deliberately outside the consumer set; the
  guard must not require the include there.

## Acceptance criteria

- [ ] `src/shared/documentation-sync.md` exists, is ≤ 20 lines, declares the phase as mandatory and
      unskippable plus the per-surface verdict obligation, and carries the `lazy-include` fence for
      `documentation-sync-contract` with an unconditional trigger.
- [ ] `src/shared/documentation-sync-contract.md` exists and contains contract elements 2–9 from
      "Gate contract"; it ships as `shared/documentation-sync-contract.md` in all three targets.
- [ ] `src/tools/build.md`, `src/tools/fix.md`, `src/tools/refactor.md` and `src/tools/maintain.md`
      each embed `documentation-sync` exactly once as an eager ` ```include `, at the documented
      phase position.
- [ ] `src/tools/build.md` no longer contains `Skip user docs only with a short justification`, and
      `src/tools/refactor.md` no longer contains the rule
      `do not introduce a documentation phase if the refactoring changes no public behavior`.
- [ ] `node build.mjs` succeeds and its printed budget report shows every budget tool at or below
      700 lines.
- [ ] Removing the include from any one of the four consumer sources makes `node build.mjs` fail
      with the new guard's message — verified by the unit test in `test/build-lib.test.mjs` over the
      pure guard function (present / missing / lazy-only cases). The test edit lands **before** the
      guard implementation and its failing run is recorded in the plan's test-results section at
      completion, so the assertions are provably not vacuous.
- [ ] `src/shared/documentation-sync-contract.md` names `tech-docs` as the declared domain owner and
      adds no documentation craft rules of its own; the existing duplicate-handbook contract test in
      `test/build-lib.test.mjs` is extended to cover the new fragment and passes.
- [ ] The contract requires a `no impact` verdict to name the concrete surface and the concrete
      reason the change cannot reach it; a bare "not relevant" is explicitly declared insufficient.
- [ ] The contract states the non-interactive branch explicitly: no abort, writes restricted to
      run-owned files, and every remaining gap recorded as an open finding with
      `Action: /effective-flow docs` in the run's review report.
- [ ] `test/workflow-contracts.test.mjs` asserts, from the sources: the four consumers embed the
      eager core; the contract declares the three verdict states and both blocking branches
      (interactive escalation, non-interactive finding hand-off); the two removed skip clauses are
      gone.
- [ ] `documentation-sync` appears as a `tech-docs` consumer with classification `delegate` in both
      `docs/developer-guide/skill-ownership.json` and the `tech-docs` row of
      `docs/developer-guide/skill-ownership.md`, and the central-skill ownership guard (#168)
      passes.
- [ ] `docs/developer-guide/build-system.md` documents the new guard; `docs/user-guide/tools-implement.md`
      documents the mandatory documentation phase for the four tools and no longer claims that
      `refactor` introduces no documentation phase.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` all pass.

## Validation plan

- `pnpm agent:check` — formatting (oxfmt), CI-style, no writes.
- `pnpm test` — unit suite including the new `build-lib` guard test and the new workflow-contract
  test.
- `node build.mjs` — all guards (consumer guard, ownership guard #168, include-target, eager/lazy
  overlap, context budget #99) plus the printed budget report.
- `pnpm test:distribution` — isolated build/archive/delivery/install smoke suite.
- Manual spot check: the gate section is present in the rendered `build`, `fix`, `refactor` and
  `maintain` outputs of all three targets (`dist/claude/`, `dist/codex/`,
  `dist/portable/effective-flow/`).

## Assumptions and open points

### Planning state (drift detection)

- Planned at `70ed27e`, 2026-07-27. Tracked working tree clean; two untracked plan files in
  `docs/plan/` (this plan and the sibling reconciliation plan).
- The plan quotes exact positions that must be re-checked before execution if the sources moved:
  `src/tools/build.md` Phase 3 and its skip clause, `src/tools/refactor.md` rule
  "do not introduce a documentation phase…" (currently the last rule of the file),
  `docs/user-guide/tools-implement.md` "**Interplay:** Introduces no documentation phase…",
  the `tech-docs` row in `docs/developer-guide/skill-ownership.md`, the
  `projectRoutingConsumers` guard in `build.mjs`, and the budget report emitted by `node build.mjs`.
- Re-measure the budget report before sizing the fragments; the sizing above is derived from
  `build 546 / 700` at this SHA.

### Out of scope

- Merging the shared fragment with `src/tools/docs.md` Phase 2/3 worker routing. The standalone
  documentation workflow is not restructured here.
- Any Effective Flow configuration key to disable or weaken the gate; it is unconditional by
  decision.
- Adding the gate to `iterate`, the `apply-*` tools, `review`, `investigate`, `commit` or `pr`.
- A shared rendering template for the verdict table in the completion summaries. The plan requires
  the verdict to be reported; a fixed template can follow once the gate has been used in practice.
- Extending `apply-review`'s commit mutex or `iterate`'s path-ownership escalation so a delegated run
  may write separate documentation files (rejected alternative under decision D2).
- The content changes owned by the sibling plan `2026-07-27-docs-tool-tech-docs-reconciliation.md`.

### Stop conditions

- Stop if the eager core cannot state the mandate and the verdict obligation within the measured
  budget headroom of `build` — then the eager/lazy split must be re-decided with the user rather
  than silently deferring the mandate itself, which would reintroduce the skip.
- Stop if adding the consumer relationship requires changing the ownership manifest **schema** (not
  just adding an entry), or if the ownership guard rejects a shared fragment as a consumer.
- Stop if any consumer turns out to need real phase renumbering rather than a `Phase 3.5`
  sub-phase — the goal-completion phase-range prose would then have to change in the same run.
- Stop if the sibling plan has landed and changed `Doc categories` in a way that makes the surface
  inventory above inaccurate.

### Assumptions

- Assumption: `iterate` and the `apply-*` tools inherit the gate through their delegations to
  `build`/`fix`/`refactor`/`docs` and need no own include. Verified from
  `src/tools/iterate.md` (Phase 3, step 2) and `src/tools/apply-review.md` (Phase 4.3, step 2).
- Assumption: the four tool sources are the only implementation tools in scope; `plan`,
  `investigate`, `review`, `commit` and `pr` produce no implementation and stay untouched.
- Assumption: no configuration key is introduced. The gate is unconditional by decision; a project
  that wants less documentation work tunes the outcome through `tech-docs` availability and the
  `skills` block, not through an Effective Flow opt-out.
- Verified: the goal-completion phase-range prose of the four consumers (`build` "phases 2–7",
  `fix` "phases 3–5", `refactor` "phases 2–6", `maintain` "phases 3–5") already covers a `Phase 3.5`
  inserted inside the range, so no range reference needs editing.
- Verified: `knownOwnershipConsumers` in `build.mjs` is built from tool, agent **and**
  `src/shared/*.md` basenames, so `documentation-sync` is a valid ownership-consumer name once the
  file exists.
- Verified: `apply-review` Phase 4.3 marks an aborted delegation as `failed (delegation)` and then
  cleans the working tree per the run's stash policy, and permits a delegation sub-agent to stage
  only finding-owned files; `iterate` Phase 3 requires a delegation to stop before touching a path
  outside its analyzed set. These two facts are the evidence behind decisions D1 and D2.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         3 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         3 |    0 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    0 |

### Findings

- **Architecture, Important — incorporated.** An open sibling plan,
  `docs/plan/2026-07-27-docs-tool-tech-docs-reconciliation.md`, makes the four `docs/` categories a
  _default_ that an established repository documentation structure overrides, and it edits four of
  the same files. A surface inventory hard-coding `docs/user-guide/**` and `docs/developer-guide/**`
  would contradict that contract in every repository with its own structure. Step 0 now requires
  reconciling with that plan first, and the surface inventory is expressed against the effective
  documentation structure.
- **Architecture, Important — incorporated.** The repository already enforces a duplicate-handbook
  contract (`test/build-lib.test.mjs`, `central-skill adapters retain Effective Flow ownership
without duplicate handbooks`). A new shared fragment that routes documentation work is a new adapter
  surface and would have been an unguarded place for a second craft handbook to grow. The fragment
  must name `tech-docs` as declared domain owner, reference rather than restate the minimal
  fallback, and be covered by that test.
- **Testability, Important — incorporated.** "The guard fails when the include is missing" cannot be
  checked after the guard exists. Replaced by a red-then-green ordering requirement with the failing
  run recorded at completion, matching how the sibling plan resolved the same problem.
- **Error cases, Important — incorporated.** `no impact` was the verdict most likely to degrade into
  a rubber stamp, which would quietly restore today's skippable behavior under a new name. The
  fragment must require a concrete surface plus a concrete reason, and the plan states explicitly
  that a bare "not relevant" does not satisfy the gate.
- **Error cases, Important — decided by the user (deep review, D1).** The original non-interactive
  branch returned `ABORT` on a blocked surface. `apply-review` Phase 4.3 marks an aborted delegation
  as `failed (delegation)` and then cleans the working tree per the run's stash policy — so a
  successful code fix would have been reported as failed and its work cleaned up over a
  documentation gap. Resolved in favour of recording each remaining gap as an open finding with
  `Action: {{SKILL:docs}}` in the run's review report and completing the run. Rejected alternatives:
  keeping `ABORT` (mislabels successful work), and a new non-fatal blocked payload (would extend the
  change into `apply-review`, `apply-issues` and `iterate`).
- **Error cases, Important — decided by the user (deep review, D2).** The write boundary did not say
  whether a delegated run may write separate documentation files. `apply-review` permits a sub-agent
  to stage only finding-owned files and `iterate` requires a stop before any path outside the
  analyzed set, so the gate would have collided with the commit-integrity contract on nearly every
  delegated run. Resolved to restrict delegated writes to run-owned files, with separate
  documentation files carried as `Action: {{SKILL:docs}}` findings. Rejected: widening
  `apply-review`'s mutex, and unrestricted writing.
- **Architecture, Important — decided by the user (deep review, D3).** A single fully eager fragment
  put the nine contract elements under a ≤ 90-line ceiling derived from `build`'s 154 lines of budget
  headroom, so every later addition would fight guard #99. Resolved by splitting: the mandate and the
  verdict obligation stay eager (~20 lines, unskippable), the detail contract loads lazily at phase
  start. Rejected: raising `CONTEXT_BUDGET_MAX_LINES` (weakens a deliberate guard for all five budget
  tools) and a fully lazy fragment (restores the skip this change removes).
- Architecture / Note: `documentation-sync` overlaps conceptually with `src/tools/docs.md`
  Phase 2/3. The plan deliberately keeps the worker routing and write boundary in the shared
  fragment and leaves the standalone documentation workflow untouched, at the cost of two places
  describing worker routing. Merging them is possible later but would widen this change into a
  refactor of `docs`.
- Scope / Note: The change touches four tools, one new shared fragment, two build files, four
  documentation files and two test files. It is broad but shallow — no runtime behavior of the
  shipped scripts changes.

## Test results

**Date:** 2026-07-27
**Base:** `origin/develop` @ `2dddb72`, delivery branch `effective-flow/build/documentation-sync-gate`

| Check                    | Result                                                                         |
| ------------------------ | ------------------------------------------------------------------------------ |
| `pnpm agent:check`       | pass — 253 files correctly formatted                                           |
| `pnpm test`              | pass — 365/365                                                                 |
| `node build.mjs`         | pass — all guards; budget `build 551, fix 450, docs 543, review 601, plan 478` |
| `pnpm test:distribution` | pass — offline checks passed                                                   |

Red-then-green evidence for the new guard, as the acceptance criteria require: the test edit
landed first and its failing run was captured at 206 tests / 204 pass / **2 fail** —
`test/build-lib.test.mjs` (missing `findDocumentationSyncViolations` export) and
`the documentation sync gate is a fixed, blocking part of every implementation tool`
(`tools/build.md must embed documentation-sync eagerly`). After the implementation the same
assertions pass in a suite grown to 365 tests.

The guard was additionally verified end to end: with the eager include temporarily removed from
`src/tools/fix.md`, `node build.mjs` aborts with
`documentation-sync consumer guard: … tools/fix.md must include \`documentation-sync\` eagerly`.
The source was restored immediately afterwards.

Manual render spot check: the gate core is inlined in all four consumer tools across
`dist/claude/`, `dist/codex/` and `dist/portable/`, and `shared/documentation-sync-contract.md`
ships for all three targets with a resolving load pointer.

## Review findings

**Date:** 2026-07-27
**Reviewer:** orchestrator-run review over the Node.js and instruction-source buckets (see the
deviation note below)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     2 |
| Open / Not implemented |     0 |

Both findings were Important and were fixed inside this run, so no external review report was
created.

- **F1 — Architecture.** `src/shared/documentation-sync.md` opened at heading level two while being
  embedded inside a level-three phase heading, which made the rendered phases 4–7 read as
  subsections of the gate. Fixed by lowering the fragment to level four and recording the reason in
  `docs/developer-guide/build-system.md`.
- **F2 — Maintainability.** The guard's error message named itself twice because `build.mjs` passed
  a redundant `context`. Found while verifying the guard end to end; fixed by dropping the argument.

## Implementation notes

Deviations from the plan, all deliberate:

- **Consumer set location.** The plan's affected-files table put the consumer set in `build.mjs`;
  it lives in `build-lib.mjs` next to its pure checker instead, which follows the plan's own
  architecture decision that the check logic must be unit-testable without a full build.
- **Ownership consumer name.** Registered as `documentation-sync-contract` rather than
  `documentation-sync`: the detail fragment is the part that delegates to `tech-docs`, so the
  declared relationship points at the file that actually carries it.
- **Worker delegation.** The run's host forbids starting subagents without an explicit request, so
  phases 2–6 were executed by the orchestrator instead of the `effective-flow-*` workers. Phase
  structure, gates and checks were unchanged; this affects only who performed the work.
- **Sibling-plan coordination (approach step 0).** `docs-tool-tech-docs-reconciliation` had not
  landed, and the user chose the parallel path from `origin/develop`. The surface inventory is
  therefore written against the _effective_ documentation structure, which stays correct both
  before and after that plan lands. Whoever lands second merges the textual overlap in
  `skill-ownership.json` / `.md`, `docs/user-guide/tools-implement.md` and
  `test/build-lib.test.mjs`.

## Open points

- No open points.
