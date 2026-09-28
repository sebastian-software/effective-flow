# Scored decision options

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Implement all three work packages of the elaborated concept [`docs/concept/2026-09-28-scored-decision-options.md`](../../concept/2026-09-28-scored-decision-options.md) in one change. When Effective Flow asks the user to choose between substantive alternatives, each option shows an absolute 1–10 fit score with a short reason, instead of an implied or prose "recommended" marker. Scores are computed at ask time, appear only in the dialog, and are never persisted.

1. **Scoring contract and `ask` grammar.** A new `scored` question type. A question-level list of exempted escape labels. A strict line grammar for `ask` fences. One localized scoring instruction line rendered by both `ask` renderers.
2. **Decision phases.** The prose Phase 3 of `plan-review` and `concept-review` switches from "whether it is recommended and why" to score and reason.
3. **Classification and conversion.** Every option fence outside the `merge-gate` eval load set is classified explicitly, and the 10 fences with substantive, non-destructive alternatives from trustworthy context are converted.

Workflow rationale: this is new user-visible behavior in the dialog of many tools, plus new build grammar. That makes it a Feature, not a refactoring or documentation change.

## Architecture decisions

- **`type: scored` is a third question type** next to `options` and `approval` in `ASK_ALLOWED_TYPES` (`build-lib.mjs:18`). A question is therefore scored or an approval by construction, never both. A scored fence otherwise parses exactly like an options fence.
- **Escape options are exempted at the question level** by a new optional key `unscored:`. It holds one or more exact option labels separated by `|`, since labels may contain commas. It is valid only with `type: scored`, and every listed label must name an existing option. At least two options must remain scorable. No per-option marker exists, because an extra line under an option is exactly the shape that the current option regex silently truncates.
- **`ask` fences get a strict line grammar.** Every non-blank line of a fence must be one of these:
  - an anchored key line (`header`, `question`, `type`, `when`, `language`, `unscored`);
  - `options:`;
  - an option `- label:` line;
  - the `description:` line directly after a label line.

  Duplicate keys are rejected. Any unconsumed line is a build error naming the file and fence. An options fence needs at least one option, which is what it tolerates today; the two-option minimum applies to scorable options of a scored fence only (user decision), so existing single-option test fixtures stay byte-stable. Option indentation stays free (`\s+`), as today. An `approval` fence carrying an `options:` block or option lines is rejected, where today they are silently ignored. All keys are matched anchored at line start, which closes the unanchored-match hole where a description containing `type: approval` changes the question type. All 48 existing fences already satisfy this grammar (verified by a strict scan), so their rendering does not change.

- **The source order of keys is fixed.** `type:` and `unscored:` follow `question:` and precede `options:`, and `when:` keeps its current position. This keeps the slice anchor that `test/workflow-contracts.test.mjs:4074` takes on the `when:` line of `plan.md`, and it never puts a line between `options:` and the first label. The grammar enforces only one ordering rule: after `options:` nothing but option lines may follow, so every key precedes it. The order among the keys before `options:` is a documented convention, not a guard.
- **The scoring instruction is exactly one rendered line**, localized in `ASK_SCAFFOLDING` (`build-lib.mjs:3219-3240`) for `en` and `de`. It is built from one exported shared constant, which is the single source of the bands. The handwritten Phase 3 prose in `plan-review` and `concept-review` is bound to that constant by contract tests, so the three copies cannot drift. It carries:
  - the prefix rule for each scorable option's description, in the fixed form `n/10 – <reason>; <original description>`, which keeps the original description, including encoded values such as `worktree.enabled = true (default)`, intact after the reason;
  - the exempted labels;
  - the calibration bands;
  - the tie rule;
  - the top-score clause, meaning a 9–10 names its edge over the next option;
  - the instruction to keep the listed options in order and add no "(Recommended)" marker.

  It deliberately says "keep the listed options in order and leave labels unchanged except for chat-language translation". This is a **deliberate deviation** from the concept's "keep every label exactly", because `src/shared/chat-language.md:17-18` lets labels follow the chat language at run time. An exempt label applies to its translated form. Illustrative English form, final wording in implementation:

  `Before asking, score each option except "Abort" for this context: start its description with "n/10 – <short reason>; " before the original text (1–2 not recommended, 3–4 weak, 5–6 viable with trade-offs, 7–8 good fit, 9–10 clearly right – then name its edge over the next option; equal fit gets equal scores); keep the listed options in order, leave labels unchanged except for chat-language translation, and add no "(Recommended)" marker.`

- **Placement of the instruction line:**
  - `transformAskClaude` emits it as the first line of the block, before the `claudeIntro` line. A `when:` condition therefore still wraps the whole block.
  - `transformAskCodex` emits it directly after the `Ask the user: **…**` line and before the option bullets. The inline `If <when>:` prefix therefore stays on the first line.
  - `portable` keeps using the Codex renderer (`build-lib.mjs:3280-3284`).
  - In every target a scored fence renders exactly one line more than the same fence as `options`.
- **Unscored fences render byte-identically.** Nothing in the existing rendering paths changes for `options` and `approval` fences. This is what keeps the `merge-gate` eval load set free of drift: the eval hashes the built portable load set, not `build-lib.mjs` (`evals/_scaffold/build-identity.mjs:16-50`, `evals/merge-gate/suite.config.mjs:36-47`).
- **The `merge-gate` eval load set is permanently unscored,** and a test enforces it. The built load set contains no fences anymore, because includes are inlined and fences rendered. The test therefore works on the rendered output:
  - it builds a portable skill into a temporary root with the existing `builtSkillRootForTests()` helper in `test/merge-gate-eval.test.mjs`;
  - it takes the load-set files from `Object.keys(builtSkillIdentity(root, suite.loadSetSeeds).files)`;
  - it asserts that none of them contains the rendered scoring sentinel, in `en` or `de`, taken from the exported constant.

  The rule therefore also holds for fragments that join the set later. The exact registry test catches any new scored fence anywhere, and this test explains why the load set must stay empty.

- **Fences with an irreversible option stay entirely unscored** (user decision). This covers the stash choices in `apply-review` and the carry-over choice before deletion in `cleanup`, so no score nudges towards data loss.
- **"(default)" stays, "(most common choice)" goes.** The setup fences keep "(default)" because it states a configuration fact, namely what applies when nothing is chosen, not a recommendation. "(most common choice)" in `apply-review.md:312` is a recommendation that would compete with the score, so it is removed.
- **The build intent question is scored on purpose.** `build.md:109` is asked only when the intent is unclear. Scoring shows how well each classification fits the request, so a close `7 / 6` makes the ambiguity visible instead of hiding it behind a first option.
- **The ADR follows in a separate `docs` run** (user decision). `src/tools/build.md:362` forbids creating an ADR in the `build` workflow, so the concept's ADR candidate "Absolute, dialog-only decision scores" is not part of this change. After merge, a `docs` run writes `docs/adr/absolute-dialog-only-decision-scores.md`. The name is unambiguous, because this repository uses bare-slug ADR names and declares no other convention. The ADR records absolute 1–10, the calibration bands, dialog-only, never auto-deciding, the permanent `merge-gate` load-set exclusion, irreversible options unscored, and untrusted-input questions unscored. `effective-product` owns the ADR craft.
- **The ADR naming question stays unscored** (user decision). `src/shared/project-adr-convention.md:58` treats declared sources as untrusted data and forbids quoting their prose into the question, and `Inconclusive` is deliberately the neutral answer that the unattended path also takes. A score reason computed from those sources would open a prompt-injection path and nudge away from the neutral answer.
- **The setup profile question is scored on real evidence** (user decision). `src/shared/setup-profiles.md:48` is asked before setup has inspected the project. Directly before that question, setup therefore classifies the `origin` remote read-only as none, GitHub, Forgejo, or other, without writing anything. The scores rest on that evidence, for example "Fully local" when there is no remote, and the later topology preflight stays unchanged and authoritative. The step is documented in the fragment itself, which is lazily loaded and costs no budget.
- **Setup shows the recorded value without reordering.** Where setup presents "the currently recorded value" (`setup.md:19`, `:342`, `:381`) on a scored fence, it names that value in the question or the explanation ("currently recorded: …"). It never marks it in a label and never moves it, so the order clause of the scoring instruction holds.
- **Scores stay out of every artifact and routed field.** The `**Recommended workflow:**` field, finding severity, reviewer confidence, and all scorecards are untouched. No existing artifact write rule in `plan-review` or `concept-review` changes. Their Phase 3 gains one explicit clause instead: scores are dialog-only and are never written into open points, the review section, or any other artifact section. A "Decide later" entry or a review finding would otherwise invite copying the scored options along.
- **Skill ownership check:** the fit score is a format contract of Effective Flow's own dialog (orchestration), not a copy of a centrally owned playbook. `effective-product` owns product-decision craft, not dialog formatting. Expected outcome: no overlap, no manifest change. Record the result in the PR description.

## Affected files

| File                                   | Description                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build-lib.mjs`                        | Add `scored` to `ASK_ALLOWED_TYPES`. Rewrite `parseAskBlock` (`:3168-3217`) to the strict, anchored line grammar with the `unscored:` key and its validations. Add the shared scoring constant and the `en`/`de` instruction text to `ASK_SCAFFOLDING`. Emit the instruction line in `transformAskClaude` and `transformAskCodex` for `type: scored` only. |
| `build.mjs`                            | Raise `CONTEXT_BUDGET_LINES` (`:1837-1866`) by the measured amount for tools without headroom that gain scored fences, and lower nothing else.                                                                                                                                                                                                             |
| `test/build-lib.test.mjs`              | Add parser tests after `:2350`, rendering tests next to `:2352-2452` and `:2454-2467`, and a scored fixture next to the snapshot at `:2888-2966`.                                                                                                                                                                                                          |
| `test/workflow-contracts.test.mjs`     | Add the scored-fence registry test, keyed by file and question because `source-upstream-sync.md` has two fences headed `Upstream`. Add the Phase 3 content assertions for `plan-review` and `concept-review`, including the binding to the exported `en` constant and a positive assertion on the dialog-only clause.                                      |
| `test/merge-gate-eval.test.mjs`        | Add the load-set sentinel test, built with `builtSkillRootForTests()`.                                                                                                                                                                                                                                                                                     |
| `src/tools/plan-review.md`             | Phase 3 (`:183-205`): the option bullet at `:194` becomes the score-and-reason rule with the calibration line and the dialog-only clause. The question-text fallback at `:199-201` places score and reason before each domain option. "Decide later" stays the fourth, unscored choice.                                                                    |
| `src/tools/concept-review.md`          | Same change in Phase 3 (`:146-147`, fallback `:151-152`).                                                                                                                                                                                                                                                                                                  |
| `src/tools/apply-review.md`            | Fence `:306` (Commits) becomes `type: scored`. Remove the competing "(most common choice)" prose from its first option.                                                                                                                                                                                                                                    |
| `src/tools/setup.md`                   | Fences `:388` (Worktree), `:402` (Completion, `unscored: Ask at run time`), and `:489` (Tracker) become `type: scored`. The recorded-value rule (`:19`, `:342`, `:381`) names the current value in the question or explanation for scored fences.                                                                                                          |
| `src/tools/plan.md`                    | Fence `:158` (Revision) becomes `type: scored` with `unscored: Abort`.                                                                                                                                                                                                                                                                                     |
| `src/tools/build.md`                   | Fence `:109` (Intent) becomes `type: scored`.                                                                                                                                                                                                                                                                                                              |
| `src/tools/maintain.md`                | Fence `:201` (Updates) becomes `type: scored` with `unscored: Selection`.                                                                                                                                                                                                                                                                                  |
| `src/shared/setup-profiles.md`         | Fence `:48` (Profile) becomes `type: scored`. A read-only `origin` classification (none, GitHub, Forgejo, other) directly precedes it and is documented there.                                                                                                                                                                                             |
| `src/shared/source-upstream-sync.md`   | Fence `:21` (Upstream) becomes `type: scored` with `unscored: Abort`.                                                                                                                                                                                                                                                                                      |
| `src/shared/issue-tracker.md`          | Fence `:62` (Tracker) becomes `type: scored`.                                                                                                                                                                                                                                                                                                              |
| `docs/developer-guide/build-system.md` | Extend the `ask` section (`:84-98`) with `type: scored`, `unscored:`, the strict grammar, the key order, and the single instruction line. Also state the permanent load-set exclusion and the rule that fences with an irreversible option stay unscored.                                                                                                  |
| `docs/developer-guide/terminology.md`  | At `:14`, which covers translation of fence keys, add that `type:` and `unscored:` stay verbatim and that an `unscored:` label is translated together with its option label (the build catches a mismatch).                                                                                                                                                |

## Implementation details

### Approach

1. **Parser.**
   - Replace the first-match regexes in `parseAskBlock` with a single pass over the block's lines.
   - Classify each line as a key, `options:`, a label line, or a description line. Reject duplicates, unconsumed lines, a description without a preceding label, and a label without a description.
   - Keep the existing error-message style: a `context` suffix, and a message that names the offending line.
   - Keep today's error precedence and wording, which existing tests pin:
     - a missing header is reported first (`test/build-lib.test.mjs:2302`);
     - the type check runs before any option check, since the `aproval` fixture has no options (`:2317`);
     - an empty `language:` is still consumed as a key line and reports `unknown language ""` (`:2324`);
     - a duplicate language keeps the message "duplicate language fields" (`:2340`).
   - Return `unscored` as an array (empty when absent), and validate the scored rules. Keep the returned object shape otherwise unchanged.
2. **Scaffolding and renderers.**
   - Add one frozen scoring constant (bands, tie rule, top-score clause, order clause) and its `en`/`de` line templates. The German form uses German typography: „…“ quotes and a spaced en dash.
   - Both renderers insert the line only for `type: scored`, with the exempt labels interpolated.
   - A scored fence with no `unscored:` renders the instruction without the "except" clause.
3. **Byte-identity proof.** The version stamp carries the Git hash, so builds are compared with a pinned hash. `pnpm eval merge-gate verify` prints no single load-set digest, only per-scenario combined digests and only for stale runs, so it is not the instrument here.
   - Before editing, build all targets with `EFFECTIVE_FLOW_BUILD_GIT_HASH=eval` and `EFFECTIVE_FLOW_BUILD_OUTPUT_ROOT=<tmp-before>`, record a tree hash, and record `builtSkillIdentity(<tmp-before>/portable/effective-flow, suite.loadSetSeeds).digest`.
   - After the parser and renderer changes, but before any fence is converted, build into `<tmp-after>` the same way. The trees must be identical.
   - After conversion, build into `<tmp-final>` the same way. Its load-set digest must equal the recorded value.
   - Record both digest values in the PR description so a reviewer can re-check them.
4. **Decision phases.** Rewrite the Phase 3 option bullet in both review tools to state four things:
   - the score and reason per domain option, using the same bands, tie rule, and top-score clause;
   - "Decide later" stays unscored;
   - in the question-text fallback, score and reason precede each domain option;
   - scores are dialog-only and are never written into open points, the review section, or any other artifact section.

   Keep each tool within its current budget (4 lines of headroom). If one line more is unavoidable, raise that entry by the measured amount. The after-answer artifact rules stay word for word unchanged.

5. **Conversion.**
   - Convert the 10 fences listed under Affected files by adding `type: scored`, and `unscored:` where named, after `question:`.
   - Add the read-only `origin` classification before the Profile question in `setup-profiles.md`, and the recorded-value wording in `setup.md`.
   - Change no label and no description, except removing "(most common choice)" in `apply-review.md:306`.
6. **Budgets.** Run `node build.mjs`, read the "Always-loaded core (lines/budget)" report, and raise each over-budget entry to its new measured count. Expected, verify by measurement:
   - `setup` +3 (three own fences), plus whatever the recorded-value wording adds;
   - `apply-review` +1 (one own fence);
   - `apply`, `apply-issues`, `cleanup`, `plan-issue`, and `maintain` +1 each.

   `apply-review-remote` (4 lines of headroom), `build` (3), and `plan` (9) likely fit without a raise. The lazily loaded `setup-profiles` and `source-upstream-sync` are not budgeted.

7. **Tests.** See the validation plan.
8. **Docs.** Extend the developer guide as listed under Affected files. The ADR is not part of this change; see the architecture decisions.

### Component structure

Not relevant: no new module. Everything stays inside the existing `ask` parse-and-render functions and one shared constant in `build-lib.mjs`.

### State management

Not relevant: scores are neither stored nor read back.

### API integration

Not relevant.

### Styling approach

Not relevant.

### Accessibility

Not relevant beyond the dialog wording: the score is plain text at the start of the description, readable by every host.

### Classification of the 37 option fences outside the load set

Scored (10):

- `apply-review.md:306` Commits
- `setup.md:388` Worktree
- `setup.md:402` Completion, exempt: Ask at run time
- `setup.md:489` Tracker
- `plan.md:158` Revision, exempt: Abort
- `build.md:109` Intent
- `maintain.md:201` Updates, exempt: Selection
- `setup-profiles.md:48` Profile
- `source-upstream-sync.md:21` Upstream, exempt: Abort
- `issue-tracker.md:62` Tracker

Unscored (27), by reason:

- **Confirmation or approval:**
  - `concept.md:180`
  - `fix.md:187`
  - `deliver.md:122`
  - `setup.md:549`, `:1094`, `:1202`
  - `apply-issues.md:266`
  - `refactor.md:187`
  - `plan.md:483`
  - `build.md:253`
  - `docs.md:236`
  - `plan-issue.md:404`
- **Default-picking or preference:**
  - `setup.md:191`, `:282`, `:432`, `:452`
  - `setup-profiles.md:27`
- **Authorization policy:** `setup.md:602`, which grants merge authority. Its run-time twin sits in the load set.
- **Mechanical:** `setup.md:707`, bot value conflict.
- **Irreversible option (user decision):**
  - `apply-review.md:331`, `:550`
  - `cleanup.md:212`, `:275`, `:288`
  - `setup.md:1170`
- **Only one scorable option:** `source-upstream-sync.md:38`.
- **Untrusted input, neutral by design (user decision):** `project-adr-convention.md:58`.

The 10 load-set fences and the approval fence `review.md:426` stay unchanged.

### Edge cases

- **A scored fence with `when:`:** in Claude, the condition wraps the instruction line and the block. In Codex and portable, the prefix stays inline on the question line and the instruction follows it.
- **`unscored:` on an `options` or `approval` fence:** build error.
- **An `unscored:` label that matches no option, or leaves fewer than two scorable options:** build error.
- **A label containing `|`:** none exists today. The separator rule is documented, and such a label cannot be exempted.
- **A description text containing `type:` or `when:`:** no longer affects parsing once keys are anchored.
- **Non-interactive or unattended runs:** fences resolve as today, and scores play no role.
- **Chat language `de`:** labels and descriptions may be posed in German at run time, the `n/10` token stays verbatim, and the reason follows the chat language. An exempt label such as "Abort" applies to its translated form.
- **`options:` or option lines in an `approval` fence:** build error.
- **A future fence added to a load-set fragment as `scored`:** the load-set exclusion test fails.
- **No `origin` remote, or an unreadable one, before the Profile question:** the classification reports "none" or "unknown", the scores say so in their reasons, and nothing is written.
- **A `language: de` scored fence:** none exists in `src/`. The `de` instruction line is required nonetheless, because `ASK_SCAFFOLDING[language]` must resolve for every allowed language. It is exercised only by fixtures, and the band strings are single-sourced per language.

## Acceptance criteria

- [ ] A fixture fence with `type: scored` and `unscored: Abort` renders in `claude`, `codex`, and `portable` with exactly one additional line, the localized scoring instruction naming "Abort" as exempt. This holds for `en` and `de` and with and without `when:`, and is asserted by exact-string unit tests.
- [ ] The build rejects each of the following, each with a unit test asserting its message:
  - `unscored:` without `type: scored`;
  - an `options:` block or option lines in an `approval` fence;
  - an unknown exempt label;
  - fewer than two scorable options;
  - an options fence without any option;
  - a duplicate key;
  - an unconsumed line after a description, between a label and its description, directly after `options:`, and after the options block.
- [ ] With `EFFECTIVE_FLOW_BUILD_GIT_HASH=eval`, the build after the parser and renderer change and before conversion is byte-identical to the pre-change build in all three targets. After conversion, `builtSkillIdentity(...).digest` of the pinned portable build equals the pre-change value. Both digests are recorded in the PR description.
- [ ] A contract test asserts that the set of `type: scored` fences across `src/`, keyed by file and question, equals exactly the 10 listed fences with their exempt labels.
- [ ] A test in `test/merge-gate-eval.test.mjs` builds the portable skill into a temporary root and asserts that no load-set file contains the rendered scoring sentinel in `en` or `de`.
- [ ] Contract tests assert that Phase 3 of `plan-review` and of `concept-review` requires a 1–10 score with reason per domain option, keeps "Decide later" unscored, and places score and reason before each option in the question-text fallback. The tests also assert that:
  - the wording "whether it is recommended and why" is gone from both tools;
  - the bands, tie rule, and top-score clause in both tools match the exported `en` scoring constant;
  - both tools carry the dialog-only clause.
- [ ] `docs/developer-guide/build-system.md` documents `type: scored`, `unscored:`, the key order, the strict grammar, and the exclusion rules: load set, irreversible options, untrusted input.
- [ ] `setup-profiles.md` documents the read-only `origin` classification before the Profile question, and a contract test asserts that it precedes the fence and names no write.
- [ ] The completion condition is that `pnpm agent:check`, `pnpm test`, `node build.mjs` (including the context-budget guard with the raised entries), and `pnpm test:distribution` all pass on the final tree.

## Validation plan

- Unit tests in `test/build-lib.test.mjs`:
  - parser acceptance and every rejection listed above;
  - exact rendering for Claude and Codex in `en` and `de`, with and without `when:`;
  - portable equals Codex for a scored fence;
  - the existing rendering and snapshot tests pass unchanged, which is the in-suite form of byte-identity.
- Contract tests in `test/workflow-contracts.test.mjs`: the scored registry, the Phase 3 assertions including the binding to the constant and the dialog-only clause, and the Profile pre-classification.
- The load-set sentinel test in `test/merge-gate-eval.test.mjs`. The existing tests that parse real fences (`:359`, `:1206`, `:14971-14990`, `:15682-15696`, `:16963`, and the slice at `:4074`) must stay green.
- The pinned-hash tree comparison and the `verify` digest comparison of step 3 in Approach.
- The CI sequence `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- Manual spot check: build the native Claude target, open `setup.md` and `plan-review.md` in `dist/claude/`, and read one scored fence and the Phase 3 text as a user would.

## Assumptions and open points

- **Line numbers** were taken from the tree at planning time. The edits committed meanwhile in `217292c` (`open-plans`, `concept`, runtime-script docs) touch none of the cited `ask` fences or Phase 3 lines, but the implementation re-verifies each reference before editing.
- **The `merge-gate` eval is already stale:** `pnpm eval merge-gate verify` currently reports all six scenarios as stale, most likely caused by #465 and #468 after the re-record in #464. This plan neither causes nor fixes that. Its obligation is limited to adding no load-set drift, which the digest comparison proves.
- **ADR follow-up:** out of scope for this build run because of `src/tools/build.md:362`. After merge, `effective-flow docs` writes `docs/adr/absolute-dialog-only-decision-scores.md`. This is a scope exclusion, not an open point.
- **Host behavior:** the plan assumes hosts follow a one-line instruction that suppresses their own "(Recommended)" convention. This is unverified across hosts and is observed after rollout.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    2 |
| Testability     |        0 |         2 |    2 |
| Scope           |        0 |         1 |    3 |
| Maintainability |        0 |         1 |    1 |

### Findings

- **Testability – Important – Load-set test unworkable as written (incorporated):** `deriveLoadSet` is not exported, and the built load set contains no fences. The test now builds a temporary portable skill and checks the rendered scoring sentinel in `test/merge-gate-eval.test.mjs`.
- **Testability – Important – Byte-identity not reproducible (incorporated):** builds are compared with `EFFECTIVE_FLOW_BUILD_GIT_HASH=eval`, and both digests go into the PR description. The deep review replaced the `verify` digest with `builtSkillIdentity`.
- **Scope – Important – Concept ADR candidate dropped silently (incorporated):** the ADR is named explicitly as a follow-up `docs` run; see the deep review for why it left this change.
- **Maintainability – Important – Calibration bands in three places (incorporated):** the constant is exported, and contract tests bind the Phase 3 prose of both tools to it.
- **Scope – Note – Deviation from the concept's label wording (incorporated):** named as a deliberate deviation, and an exempt label applies to its translated form.
- **Error cases – Note – Options inside an approval fence (incorporated):** now a build error.
- **Error cases – Note – Key order enforcement (incorporated):** only "nothing but options after `options:`" is enforced; the rest is a convention.
- **Scope – Note – "(default)" versus "(most common choice)" (incorporated):** the reason is stated in the architecture decisions.
- **Scope – Note – Build intent as a classification (incorporated):** scoring is confirmed on purpose, with its reason.
- **Testability – Note – Concept "no scores in artifacts" untested (incorporated):** first as a negative assertion; the deep review replaced it with an explicit dialog-only clause and a positive assertion.
- **Testability – Note – Overlap of registry and load-set tests (incorporated):** the load-set test is kept only in the cheap sentinel form.
- **Maintainability – Note – terminology.md edit (incorporated):** it now names the translation rule for `type:` and `unscored:`.

### Deep review 2026-09-28

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         1 |    0 |
| Data protection |        0 |         1 |    0 |
| Error cases     |        0 |         0 |    2 |
| Testability     |        0 |         2 |    1 |
| Scope           |        0 |         1 |    2 |
| Maintainability |        0 |         0 |    2 |

- **Testability – Important – Two-option minimum breaks an existing fixture (decided):** the minimum applies to scored fences only, and options fences keep at least one option.
- **Scope – Important – `build` forbids ADRs (decided):** the ADR moves to a separate `docs` run after merge.
- **Security – Important – ADR naming scores would read untrusted sources (decided):** the fence stays unscored, so the registry holds 10 fences.
- **Architecture – Important – Profile asked before project evidence exists (decided):** a read-only `origin` classification precedes the question.
- **Data protection – Important – "Never persisted" not enforced (incorporated):** an explicit dialog-only clause in Phase 3 with a positive contract test.
- **Testability – Important – `verify` prints no single load-set digest (incorporated):** the proof uses `builtSkillIdentity(...).digest` on pinned builds.
- **Error cases – Note – Error precedence and wording (incorporated):** listed in Approach step 1, and option indentation stays free.
- **Error cases – Note – Joining score and description (incorporated):** fixed form `n/10 – <reason>; <original description>`.
- **Testability – Note – Duplicate header `Upstream` (incorporated):** the registry is keyed by file and question.
- **Scope – Note – ADR file name (incorporated):** `docs/adr/absolute-dialog-only-decision-scores.md`, unambiguous in this repository.
- **Maintainability – Note – Recorded value versus order clause (incorporated):** setup names the recorded value in the text, never by marker or reordering.
- **Maintainability – Note – Reach of the `de` line (incorporated):** required for scaffolding completeness, exercised by fixtures only, bands single-sourced per language.

## Implementation notes

- **Deviation – origin classification:** the plan named `git remote get-url origin`, but the build's remote-tracker recipe guard (`manual-origin-parse`) forbids that command in prompt sources. `src/shared/setup-profiles.md` therefore uses the remote helper's read-only `repository-resolve` operation, invoked from the invocation directory as a documented pre-verification exception to the helper's `cwd` rule. Its result codes map as follows: `NOT_GIT_REPOSITORY` is "no Git repository", and every score reason then says setup will stop at the preflight; `NO_ORIGIN` is "none"; a resolved provider is GitHub or Forgejo; `AMBIGUOUS_HOST` is "other"; any other result is "unknown".
- **Beyond the affected-files table:**
  - The user guide gained a "Fit score" glossary entry (`docs/user-guide/glossary.md`) and consistent notes in `tools-understand.md` and `tools-setup.md`.
  - Review hardening added several parser rules: duplicate option labels are rejected in scored fences, quotation marks are rejected in `unscored:` labels, and a missing-header or missing-question error also names a pending structural error.
  - The instruction wording says "the next-best option unless the two are tied" and "add neither a "(Recommended)" marker nor a translated equivalent".
- **Budgets:** raised to their measured counts: `setup` 1918→1923, `apply-review` 1406→1407, `apply-issues` 1212→1213, `cleanup` 1043→1044, `plan-issue` 754→755, `maintain` 727→728, and `apply` 593→594. `concept-review` now sits exactly at its budget (344/344).
- **ADR follow-up:** as planned, `docs/adr/absolute-dialog-only-decision-scores.md` is left to a separate `effective-flow docs` run after merge.

## Test results

- `pnpm agent:check`: passed (497 files).
- `pnpm test`: 1442 tests, 1441 passed, 0 failed, 1 skipped. The skip is the existing, intentional merge-gate freshness skip.
- `node build.mjs`: passed, including the context-budget guard.
- `pnpm test:distribution`: offline checks passed.
- **Byte identity:**
  - The pinned pre-change tree (`EFFECTIVE_FLOW_BUILD_GIT_HASH=eval`) hashes to `8771f1b5d856606c02737d51b8c7db28b8b7a886a5a44d69db0353ba739dbe9b`. The tree after the parser and renderer change, before conversion, hashes to the same value.
  - A second, independent `git archive` build confirmed the identity.
- **Merge-gate load-set digest:** `builtSkillIdentity(...).digest` is `sha256:0b72475818d66e4ad59e13e00239fe315f5564b3963bd5b5c07238921d715b98` over 32 files, identical before and after the change.
- **Mutation checks:** 11 mutations each made the guarding test fail for the intended reason, among them:
  - an unregistered or removed scored fence;
  - a scored fence in the load set;
  - band drift in the Phase 3 prose;
  - misplacement of the Claude instruction line;
  - silently dropping unconsumed lines.

## Review findings

**Date:** 2026-09-29
**Reviewer:** effective-flow-nodejs-reviewer

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    13 |
| Open / Not implemented |     0 |

## Open points

- No open points.
