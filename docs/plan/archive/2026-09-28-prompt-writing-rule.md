# Prompt-writing rule for shipped prompt text

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Documentation (`effective-flow docs`)
**Doc category:** developer-guide
**Target path:** docs/developer-guide/build-system.md

## Requirement

Stage 1 of [#487](https://github.com/sebastian-software/effective-flow/issues/487), and only stage 1. Stage 2 (triage of the prose-reading test assertions) and stage 3 (lazy splits of `setup`, `iterate` and `merge-gate`) are separate pull requests and are not part of this plan.

`CONTEXT_BUDGET_LINES` measures each tool's always-loaded core but does not reduce it. No document says how prompt text should be written to keep that cost down, and no document says what a test that reads source prose has to justify. Stage 1 adds that rule, so stages 2 and 3 have a written standard to apply and cite. The rule has five points, taken from the issue:

1. Length is paid on every run.
2. State a contract once, in its owning fragment.
3. Keep rare edge cases out of eager text and put them behind a `lazy-include` at their decision point.
4. Prefer one precise sentence to an explanation of its history.
5. A test that reads source prose must name the invariant it protects.

The rule goes into `AGENTS.md` and into `docs/developer-guide/build-system.md`. It must agree with the existing section "Progressive disclosure beyond the router" (`build-system.md:553-702`) and must not loosen its eager-only list.

Documentation is the right workflow: the change touches two Markdown documents plus the index lines that describe them. It changes no source under `src/`, no test, no build guard and no shipped behavior.

## Architecture decisions

- **`AGENTS.md` owns the rule; `build-system.md` owns its mechanics.** That is the split the repository already uses. `build-system.md:3-9` says it is canonical for mechanics and that `AGENTS.md` "stays canonical for the two **rules** it owns". `AGENTS.md:101` says rules stay there when they are "not derivable from reading the code". This rule qualifies, and `AGENTS.md` is the file an agent reads before it writes prompt text. Keeping the reasoning in one place is point 2 of the rule applied to itself.
- **`AGENTS.md` gets a new `### Writing prompt text` subsection under `## Build architecture`,** directly after `### Adding a tool or agent` (ends at `AGENTS.md:106`) and before `## Delegation`. It holds the five points as five short bullets and one link to the build-system section. It carries no rationale and no case list.
- **`build-system.md` gets a new `## Writing prompt text` section directly after "Progressive disclosure beyond the router"** and before `## Native and portable worker rendering` (`build-system.md:704`). One opening sentence names `AGENTS.md` as the canonical source of the rule. Then one bullet per point, each opening with the point's bold short form and continuing with only the mechanics: where the cost is measured, which existing rule decides, which convention applies. It does not re-argue the rule. This satisfies "contains the rule" without keeping a second copy of its rationale.
- **Point 3 adds no new deferral criterion.** It links to the qualifying rule "one nameable decision point and the pointer states that trigger" (`build-system.md:679-682`) and to the "Core flow stays inline" list (`build-system.md:561-584`). It states that an edge case in an eager-only fragment stays eager, and that "rare" alone never qualifies text for deferral. This is the core of "matches the existing section".
- **Point 4 separates history from constraint.** A sentence explaining why a gate is ordered the way it is protects the next edit and stays. A sentence about how the text came to be (an earlier issue, an older wording, a migration story) goes to the plan archive, the commit message or an ADR. Without that distinction the rule could be read as permission to delete safety rationale.
- **Point 5 names the existing convention and invents no marker.** The repository already names invariants in a comment block above the test plus an assertion message that names the property. Examples: `test/workflow-contracts.test.mjs:1740-1750` ("pinned by the _trigger token_ … so rewording the clause stays free while dropping the decision point fails") and `:5198-5199`. The rule also asks for the smallest stable phrase or marker as the anchor. It applies to assertions written or edited from now on. Retrofitting existing assertions is stage 2.
- **Scope of the rule (decided in the deep review):** points 1-4 govern shipped prompt text under `src/` (`SKILL.md`, `tools/`, `shared/`, `agents/`) **and `AGENTS.md`**, because `CLAUDE.md` is `@AGENTS.md` and so it is paid in every agent session on this repository, like an eager core. Point 5 governs `test/*.test.mjs`. The developer guide is read on demand, so it is not in scope; point 2 already applies there through the existing no-second-copy statements. `AGENTS.md` has no budget guard, and this stage adds none: for `AGENTS.md` the rule is a writing standard, not a measured ratchet. The new `AGENTS.md` subsection is the first text that must meet it.

## Affected files

| File                                   | Description                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                            | New `### Writing prompt text` subsection after `### Adding a tool or agent`: five one-sentence bullets and a link to `docs/developer-guide/build-system.md`, section "Writing prompt text".                                                                                                                                                                             |
| `docs/developer-guide/build-system.md` | New `## Writing prompt text` section after "Progressive disclosure beyond the router". Intro (`:5-9`): add the prompt-writing mechanics to what this file is canonical for, and make "the two **rules**" three by naming the prompt-writing rule. "Further reading" `AGENTS.md` bullet (`:803-805`): add the prompt-writing rule to the list of rules `AGENTS.md` owns. |
| `docs/developer-guide/README.md`       | Entry 2 (`:15-16`): add the writing rules for prompt text to the build-system summary. "See also" (`:34-37`): add the prompt-writing rule to the rules `AGENTS.md` is canonical for.                                                                                                                                                                                    |

## Implementation details

### Approach

1. **Check for drift and record the baseline.** The plan was written against `e846936` on 2026-09-28. At that commit `AGENTS.md` and `docs/developer-guide/` had no uncommitted changes. Re-read the cited line ranges. If "Progressive disclosure beyond the router" was renamed or its eager list changed, stop and revise point 3 first. Before the first edit, record the `node build.mjs` "Always-loaded core" report and the `pnpm eval merge-gate verify` verdict for comparison.
2. **Write the `AGENTS.md` subsection.** Five bullets, one sentence each, in the order of the requirement. The subsection opens with one sentence naming the rule's scope: prompt text under `src/` and `AGENTS.md` itself for points 1-4, `test/*.test.mjs` for point 5. Point 1 names the three costs: a tool's eager core on every run of that tool, an eager `src/shared` fragment on every host that includes it, and `AGENTS.md` in every session. Point 3 says "only where the section's qualifying rule allows it" and does not list the exceptions. Close with one sentence that links to the build-system section for the mechanics. Stay in the style of the surrounding file: bold lead-ins, no history, no examples.
3. **Write the `build-system.md` section.** One opening sentence: the rule is canonical in `AGENTS.md`, and this section maps each point onto the build. Use the terms of "Progressive disclosure beyond the router" unchanged (eager, mode-gated, decision point, load trigger `when:`) and wrap at about 100 columns like the rest of the file. Then five bullets:
   - point 1 → the context-budget guard under "Guards" and the "**Context budget.**" paragraph (ratchet, not room to fill); eager shared fragments are charged to every host; `AGENTS.md` is paid per session but carries no guard, so the rule is the only thing that holds it;
   - point 2 → owning fragment plus `include`/`lazy-include` or a named pointer; link to the ownership contract in `skill-ownership.md` for central playbooks;
   - point 3 → the qualifying rule and the "Core flow stays inline" list, as decided above;
   - point 4 → keep the reason that constrains the next edit and move the history to plan archive, commit or ADR;
   - point 5 → the comment-plus-message convention with the `workflow-contracts.test.mjs` example; anchor on the smallest stable phrase or marker; when tightening an assertion, check with a deliberate mutation that it still fails.
4. **Update the index sentences** (`build-system.md` intro and "Further reading", `docs/developer-guide/README.md` entry 2 and "See also"). The `build-system.md` intro needs both halves: the new section joins the mechanics it is canonical for, and the prompt-writing rule joins the rules `AGENTS.md` owns. Change no other sentence.
5. **Format and check.** `pnpm format`, then the validation sequence below.
6. **Deliver** as one `docs:` pull request against `develop`. The body references the issue with `Refs #487`, never with a closing keyword: a closing keyword would close the three-stage issue when this merges into `develop`.

### Edge cases

- **Wording that trips a guard.** `build.mjs:416-420` flags "deliberate divergence" or "diverges deliberately" in any `AGENTS.md` paragraph that mentions `effective-product`, and `build.mjs:480-488` bans the retired "Firmo" brand. The new text uses neither.
- **Pinned sentences in `build-system.md`.** `test/build-lib.test.mjs:4300-4305` pins two sentences about `durable-follow-up-gate`. They are not in the edited range; leave them untouched.
- **Section rename temptation.** `build.mjs:1789`, `build-lib.mjs:3471` and `docs/developer-guide/architecture.md:106` refer to "Progressive disclosure beyond the router" by name. Do not rename it.
- **Merge-gate eval evidence.** The eval instrument digests the `AGENTS.md` that `evals/_scaffold/scaffold.mjs:38` writes into its sandbox, not this repository's. Neither edited file is a source the gate loads, so `pnpm eval merge-gate verify` must give the same verdict before and after the change. If it does not, stop: the change would owe a re-recorded round and needs a decision first.
- **Stale numbers nearby.** The per-tool figures in the "Context budget" paragraph (`build-system.md:776-778`) no longer match the build report. Fixing them is out of scope for this plan (see Assumptions).

## Acceptance criteria

- [ ] `AGENTS.md` contains a `### Writing prompt text` subsection under `## Build architecture`: one scope sentence naming `src/` and `AGENTS.md` for points 1-4 and `test/*.test.mjs` for point 5, exactly the five points of the requirement as one sentence each, and a link to the build-system section. Nothing else.
- [ ] `docs/developer-guide/build-system.md` contains a `## Writing prompt text` section directly after "Progressive disclosure beyond the router". It names `AGENTS.md` as canonical for the rule and gives one mechanics bullet per point.
- [ ] Point 3 in both files defers to the qualifying rule and the eager-only list of "Progressive disclosure beyond the router" and states no competing criterion. The eager-only list and its section are unchanged (`git diff` shows no edits between the section heading and `## Writing prompt text`).
- [ ] Point 5 in `build-system.md` names the comment-plus-assertion-message convention with at least one existing example path.
- [ ] The `build-system.md` intro and "Further reading" bullet and the `docs/developer-guide/README.md` entry 2 and "See also" name the new rule. No other file changes.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass, and `pnpm eval merge-gate verify` reports the same verdict as on the base commit.

## Validation plan

- `pnpm agent:check`: oxfmt check over both Markdown files, exit 0.
- `pnpm test`: unit and contract suites, exit 0. None of them pins the edited ranges; a failure means a guarded sentence was touched by mistake.
- `node build.mjs`: build guards (stale ADR claim, stale brand) pass, and the "Always-loaded core" report is identical to the base commit, since no `src/` file changed.
- `pnpm test:distribution`: exit 0.
- `pnpm eval merge-gate verify`: run once before the first edit and once after the change; same verdict.
- Manual reading: every `AGENTS.md` bullet is one sentence, the build-system section restates no rationale from "Progressive disclosure beyond the router", and both link targets resolve.

## Assumptions and open points

- `AGENTS.md` is the canonical owner of the rule and `build-system.md` carries its mechanics. This follows the repository's existing rules/mechanics split. The issue asked for the rule in both files without naming an owner.
- The rule applies to text written or edited after it lands. Existing prompt text and existing test assertions are not rewritten in this stage; that is stages 2 and 3.
- The stale per-tool figures in `build-system.md:776-778` are left alone. They belong to the stage 3 pull requests, which lower those budgets anyway, or to a separate docs fix.
- The eval-instrument claim (the repository `AGENTS.md` is not digested) was checked in `evals/_scaffold/scaffold.mjs` and `round-core.mjs` but not by running `verify`. The validation plan runs it before and after the change.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    1 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         2 |    1 |
| Maintainability |        0 |         0 |    1 |

### Findings

- **Architecture, Important (incorporated):** Writing the full rule in both files would break point 2 of the rule itself and create two copies that drift. Fixed: `AGENTS.md` owns the rule, `build-system.md` states each point only as a bold short form followed by its mechanics, and the intro names the owner.
- **Testability, Important (incorporated):** "Matches the existing section" was not measurable. Fixed: point 3 must defer to the named qualifying rule and eager-only list, and the acceptance criteria require the Progressive-disclosure section to be byte-unchanged.
- **Scope, Important (incorporated):** Read literally, point 4 could license deleting rationale that guards a safety ordering. Fixed: the plan separates history (moves out) from constraining rationale (stays).
- **Error cases, Note:** The merge-gate eval claim rests on reading the scaffold, not on a run. The validation plan runs `pnpm eval merge-gate verify` before and after and stops if the verdict changes.
- **Scope, Note:** The stale budget figures at `build-system.md:776-778` are adjacent and tempting. They are explicitly out of scope.

#### Deep review 2026-09-29

- **Scope, Important (decided):** The plan limited points 1-4 to `src/`, although `AGENTS.md` is loaded in every session through `CLAUDE.md` and pays the same per-run cost. The user chose `src/` plus `AGENTS.md`; the developer guide stays out. Incorporated into the scope decision, the `AGENTS.md` subsection, the point 1 mechanics bullet and the acceptance criteria.
- **Maintainability, Note (incorporated):** Four direct corrections. The `build-system.md` intro also lists the new mechanics, not only the third rule. The new section uses the Progressive-disclosure terms unchanged. The build report and the eval verdict are recorded before the first edit, so there is a baseline to compare against. The wrap instruction formerly sat inside the point 5 bullet and now sits at step 3.

## Test results

Run in the delivery worktree on `effective-flow/docs/prompt-writing-rule` (base `e846936`), sequentially:

- `pnpm agent:check`: exit 0, all 496 files formatted.
- `pnpm test`: exit 0; 1380 tests, 1379 pass, 0 fail, 1 skipped (skipped before this change as well).
- `node build.mjs`: exit 0; the "Always-loaded core (lines/budget)" line is byte-identical to the baseline recorded before the first edit.
- `pnpm test:distribution`: exit 0, offline distribution checks passed.
- `pnpm eval merge-gate verify`: output identical to the baseline recorded on the base commit. The base already reports stale evidence (skill, instrument and fixture files); no new entry appeared and none names `AGENTS.md` or `docs/`.
- `git status --porcelain`: exactly `AGENTS.md`, `docs/developer-guide/build-system.md` and `docs/developer-guide/README.md` modified.
- Manual check: every cross-reference resolves ("Guards", "Placeholder and directive syntax", the "Context budget" paragraph, `skill-ownership.md` "The layered contract", the merge-gate lazy-pointer test), and the diff of `build-system.md` touches only the intro, the new section and "Further reading", leaving "Progressive disclosure beyond the router" unchanged.

## Review findings

- No findings. Two deliberate refinements: the five points in `AGENTS.md` are numbered so the scope sentence can refer to "points 1-4" and "point 5", and the `docs/developer-guide/README.md` "See also" bullet also names `build-system.md` as the home of the prompt-writing mechanics, keeping that bullet's rules/mechanics pairing consistent.

## Open points

- No open points.
