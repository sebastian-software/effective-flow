# Descriptive titles and bodies for Issue Buddy plan pull requests

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

When `autopilot` plans an issue through `issue-buddy --publish`, the draft pull request it opens has generic text. Examples are #745, #746 and #749.

- **Title:** `docs: plan issue #<N>`.
- **Body:** one fixed sentence, `Plan for issue #<N>; review result: approved; open points: 0.`, followed by the marker line and `Refs #<N>`.

In the PR list these cannot be told apart, and the body says nothing about the plan.

Plans that `effective-flow plan` publishes locally already get descriptive text (`src/shared/plan-publication.md:350-356`). Their title is `docs: plan <plan title>`. Their body holds a sentence saying the implementation follows on the branch, the plan path, and the `Requirement` summary.

Target: Issue Buddy plan PRs get the same shape, both when first published and when recovered.

- **Title (user decision):** `docs: plan <plan title>`, without the issue number. With `language.git = de` it reads `docs: Plan <plan title>`.
- **Body (user decision):** the local-plan content plus the workflow and review status:
  - the implementation-follows sentence;
  - the plan path;
  - the `Requirement` summary;
  - the recommended workflow;
  - the review result and open-point count.
- **Tail (unchanged):** the marker line and `Refs #<N>` stay last.

The fixed template was a deliberate security decision (`docs/plan/archive/2026-10-01-issue-buddy-tool-stage-1.md:211`, `:224`; `docs/adr/plan-only-unattended-publication.md:32`). The authority-holding orchestrator of the unattended pass must never read plan or issue prose.

This plan keeps that boundary. The descriptive text is built **deterministically inside the `plan-publication` helper**, from the plan bytes it reads and binds to `expectedBlobOid`. The helper sanitizes it and never returns it to a model step.

Classification is Feature: the published forge text changes visibly, and the helper's input contract changes.

## Outcome checkpoint

- **Primary outcome:** Issue Buddy and autopilot plan PRs are recognizable by title and summarized by body. The input trust boundary is unchanged.
- **Boundaries:**
  - Out of scope:
    - autopilot's plan-only draft path (`src/shared/autopilot-blockers.md:48-125`), which `pr` step 9 already titles descriptively;
    - local `plan` Phase 7 publication, which goes through `pr`, not `publish`;
    - the delivery-time retitle;
    - retitling #745, #746 and #749.
  - `plan-lint publication-metadata` stays unchanged (user decision). That keeps autopilot's approval gate, `inspect-branch` recovery and the base-move re-run accepting exactly the plans they accept today.
- **Approach:**
  - The helper derives title, body and commit subject from the plan, and replaces caller-supplied text in `publish` and `complete-branch`.
  - The derivation is tolerant: only an unusable title fails.
  - Issue Buddy, its recovery path and the base-move fragment switch to the new input.
- **Remaining proof:**
  - helper, plan-lint and Issue Buddy tests;
  - eval evidence-debt report;
  - post-merge, one real autopilot run.

## Architecture decisions

- **Composition lives in the helper and replaces caller text.**
  - Only `src/tools/issue-buddy.md` and `src/shared/issue-buddy-base-move.md` call `publish` and `complete-branch` (`plan-publication-core.mjs:254-259`).
  - `publish` loses `title`, `body` and `commitMessage`; `complete-branch` loses `title` and `body`. It creates no commit and has no commit-message key.
  - Both gain only `languageGit` and `languageForge` (each `de` or `en`). An old key is an unknown key, which yields `INVALID_INPUT` under the existing schema check.
  - The review result and open-point count are **derived by the helper** from the verified bytes through `publicationMetadataFromText`, exactly as `inspect-branch` already does (`:2575`). They are no longer caller inputs, so the PR text cannot contradict the plan it publishes.
  - Rendered values: review result `approved` / `revision required` (de `freigegeben` / `Überarbeitung nötig`); open points as a non-negative integer.
  - Effective Flow owns this orchestration; no central skill is involved.
- **Derive after the plan read, validate before `fetchBase`, bind by the blob.**
  - Schema and enum checks stay up front.
  - Right after `readPlanFile` (`publish`), or from the verified `blobBytes` (`complete-branch`, `:2515-2518`), the helper:
    - derives the text;
    - runs the existing title, closing-keyword, marker and size validators;
    - runs the secret scan on the derived title, prose and subject, on their own and before `fetchBase`.
  - The full body, with any base-move flag appended, is scanned again where it is scanned today (`:2324-2335`).
  - The existing post-commit `committedBytes.equals(plan.bytes)` and `expectedBlobOid` checks (`:2398-2417`) then bind the published text to the plan.
  - The documented "before any Git or forge call" claim narrows to schema and enum faults, and the guide says so.
- **Refusals name their source.** Every refusal raised on the derived text carries `details.source: "derived"`. A refusal on the base-move flag carries `details.source: "base-move-flag"`. `commit-msg` hook refusals keep their existing stage and carry no `derived` source. Issue Buddy classifies by `source`, never by field name.
- **Commit message is the subject only.**
  - The commit message equals the derived title. Plan prose in a commit body could carry footers that release-please reads.
  - The `docs:` type stays, so no release is triggered.
  - The whole subject is capped at 72 characters: the description gets 72 minus the prefix length (61 after `docs: plan `). This keeps common commitlint header limits.
  - A repository `commit-msg` hook that still rejects the derived subject remains an item-5 hook fault, accepted as a residual risk.
- **Tolerant derivation (user decision).** `publication-metadata` gains no new requirement. The helper derives:
  - **Title:** the H1 from `classifyPlanText` (`plan-lint-core.mjs:571-585`). A title that is missing or empty after sanitizing is the only refusal: `PLAN_TEXT_UNUSABLE`.
  - **Summary:**
    - from the `## Requirement` / `## Anforderung` section, the first prose paragraph;
    - otherwise, the text of its first list item;
    - otherwise, the summary paragraph is omitted.
  - **Prose paragraph:** the first block of consecutive non-empty lines outside fences that is not a list item, blockquote (`>`), table row (`|`), heading, HTML block or indented code. Soft-wrapped lines are joined with single spaces.
  - **Workflow:** the leading word of the workflow header if it is `Feature`, `Bugfix`, `Refactoring` or `Documentation`. Otherwise, a backticked skill name maps as follows: `effective-flow build` → Feature, `fix` → Bugfix, `refactor` → Refactoring, `docs` → Documentation. Otherwise the workflow paragraph is omitted.
  - **Shared extraction:** the pure extraction (`planForgeFields(text)` → `{title, summary, workflow}`) lives in `plan-lint-core.mjs` and reuses its line inventory and fence handling. `classifyPlanText` and `publicationMetadataFromText` behave unchanged.
- **Sanitizer with a fixed order and a fixed point.** It applies to the title and the summary, in this order:
  1. Join lines and collapse whitespace.
  2. Remove HTML comments, including an unterminated `<!--` up to the end of the text, then HTML tags, then Markdown images. Turn Markdown links `[text](url)` into `text`. Delete every remaining `<` and `>`.
  3. Delete bare `http://` and `https://` URLs.
  4. Defuse commit footers: `BREAKING CHANGE:`, `BREAKING-CHANGE:` and `Release-As:` lose their colon.
  5. Defuse references: `#N` → `N`, `owner/repo#N` → `owner/repo N`, `GH-N` → `GH N`. A closing keyword without a reference is harmless; `CLOSING_KEYWORD` needs a reference (`:719-737`).
  6. Defuse mentions: an `@` at the start or after whitespace or punctuation, followed by a letter or digit, is dropped. E-mail addresses (`a@b.c`) stay; `@org/team` becomes `org/team`.
  7. Repeat steps 1–6 until the text no longer changes (at most five rounds). Then assert that none of these remains: `#\d`, a mention-position `@`, `<`, `>`, `GH-\d`, a footer token. Anything left is `PLAN_TEXT_UNUSABLE`.
  8. Truncate by Unicode code points, never inside a surrogate pair:
     - title description to 72 minus the prefix length;
     - summary to 600 code points, at a sentence boundary, else at a word boundary, else with a hard cut;
     - the cut always appends `…`.

  The fixed point also prevents Issue Buddy's `prReference` (`issue-buddy-core.mjs:1496-1507`) from matching a foreign `#B` and wrongly skipping issue B in later passes.

  Exact expectations:
  - `Fixes #12 for @someone` → `Fixes 12 for someone`
  - `#<!-- -->12` → `12`
  - `Release-As: 2.0.0` → `Release-As 2.0.0`

- **Rendered body.** The connecting words follow `languageForge`; derived values stay in the plan's language. One paragraph each, omitted paragraphs dropped:
  - English:
    1. `Plan for issue #<N>. The implementation follows as further commits on this branch.`
    2. `Plan: <plan path>`
    3. `Recommended workflow: <label>`
    4. the summary
    5. `Review result: <approved|revision required>; open points: <n>.`
  - German:
    1. `Plan für Issue #<N>. Die Umsetzung folgt als weitere Commits auf diesem Branch.`
    2. `Plan: <plan path>`
    3. `Empfohlener Workflow: <label>`
    4. the summary
    5. `Review-Ergebnis: <freigegeben|Überarbeitung nötig>; offene Punkte: <n>.`

  `#<N>` in paragraph 1 is the helper's own trusted issue number. Then come the marker line and `Refs #<N>` as today.

- **No derived prose in envelopes.** The dry-run envelopes of `publish` and `complete-branch` (`:2341-2350`, `:2756-2765`) return only the length and SHA-256 of the title and body.
- **Outcome mapping in Issue Buddy.** A refusal with `details.source: "derived"` is a plan-content fault: item 4, issue `failed` (`src/tools/issue-buddy.md:398-408`). This covers `PLAN_TEXT_UNUSABLE` and `INVALID_TITLE`, `CLOSING_KEYWORD`, `MARKER_INVALID`, `INPUT_TOO_LARGE`, `INVALID_CONTENT` or `SCAN_BLOCKED` raised on derived text. It prevents the same issue from stopping every later pass. In `issue-buddy-base-move.md:26-34`, derived faults can no longer occur at the re-publish, because they are rejected before `fetchBase`. Its `body` refusal mapping therefore applies to `source: "base-move-flag"` only.
- **ADR update.** `docs/adr/plan-only-unattended-publication.md:32` is superseded in part: the text is helper-derived, sanitized and kept away from the parent, and the boundary rationale stays. `docs/adr/input-trust-boundary.md` gains one sentence on the same point.

## Affected files

| File                                                                                                          | Description                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/plan-lint-core.mjs`                                                                              | Export the pure `planForgeFields(text)`. Existing classification and `publication-metadata` are unchanged.                                                                                                                                                                                                                  |
| `src/scripts/plan-publication-core.mjs`                                                                       | Schema changes. Derive review result, open points and text from the verified bytes. Add the sanitizer, the limits, `PLAN_TEXT_UNUSABLE`, `details.source`, validation before `fetchBase`, the subject-only commit message and redacted dry-run envelopes. Update the header comment at `:25`.                               |
| `src/tools/issue-buddy.md`                                                                                    | Phase 5 (`:346-360`): drop the fixed templates and pass `languageGit` and `languageForge`. Recovery (`:237-243`): the same for `complete-branch`. Outcome table (`:398-408`): map `source: "derived"` to item 4 and reword "fixed-template". Set `contextBudget` to the measured count.                                     |
| `src/shared/issue-buddy-base-move.md`                                                                         | Re-publish passes the unchanged two keys. The `body` refusal mapping is limited to `source: "base-move-flag"`.                                                                                                                                                                                                              |
| `src/shared/plan-publication.md`                                                                              | One sentence: the unattended Issue Buddy path renders the same title and body shape inside the helper.                                                                                                                                                                                                                      |
| `test/plan-lint.test.mjs`                                                                                     | `planForgeFields`: prose paragraph, list fallback, omission, skill-name workflow mapping, fences, blockquotes, tables.                                                                                                                                                                                                      |
| `test/plan-publication.test.mjs`, `test/plan-publication-git.test.mjs`                                        | Every acceptance criterion below. Migrate fixtures from `title`/`body`/`commitMessage` input. Keep `PLAN_TEXT` (`plan-publication-git.test.mjs:41-53`) as it is for the scan line assertions, and add a separate fixture with H1, workflow and Requirement for the derivation tests. Adapt `plan-publication.test.mjs:323`. |
| `test/issue-buddy-contract.test.mjs`, `test/issue-buddy-pass.test.mjs`, `test/fixtures/issue-buddy/world.mjs` | Replace the `plan issue #` and fixed-sentence assertions (`:162-169`, `:79-81`, `:948-950`, `world.mjs:312-314`). Cover the recovery and base-move inputs and the `source` mapping.                                                                                                                                         |
| `docs/developer-guide/build-system.md` (`:1179-1210`)                                                         | Helper contract: inputs, derivation, refusal timing, `details.source`.                                                                                                                                                                                                                                                      |
| `docs/user-guide/tools-automation.md`, `docs/user-guide/tools-understand.md` (incl. `:497`)                   | New Issue Buddy and autopilot plan PR title and body.                                                                                                                                                                                                                                                                       |
| `docs/adr/plan-only-unattended-publication.md`, `docs/adr/input-trust-boundary.md`                            | The partial supersession and the boundary sentence.                                                                                                                                                                                                                                                                         |

## Implementation details

### Approach

1. **plan-lint.** Add `planForgeFields` with tests.
2. **Helper schemas.** Replace the text keys with `languageGit` and `languageForge` in `publish` and `complete-branch`.
3. **Helper derivation**, after the plan read or from the branch blob:
   - derive the review result and open points through `publicationMetadataFromText`;
   - extract the fields;
   - sanitize them;
   - render the title, subject and body prose;
   - validate and scan them with `details.source: "derived"`.

   All of this happens before `fetchBase`. Then continue with the unchanged base check, the full-body scan, the hook, the commit, the blob binding, the marker and the `Refs #<N>` tail.

4. **Helper envelopes.** Redact the dry-run envelopes in both operations.
5. **Issue Buddy.** Switch Phase 5, recovery and the outcome table, and update the base-move fragment.
6. **Docs and budget.**
   - Update the tests, guides and ADRs.
   - Run `node build.mjs` and set `issue-buddy`'s `contextBudget` from the reported core count.

### Edge cases

- **Requirement is only a list.** The first list item becomes the summary.
- **Requirement has no usable text.** The summary paragraph is omitted, and the PR is still published.
- **The workflow is written only as a skill name.** It is mapped. An unknown form omits the workflow paragraph.
- **A single word longer than the limit.** It is hard-cut and ends with `…`.
- **Truncation creates a secret-scan finding.** The result is `SCAN_BLOCKED` with `source: "derived"`, which is item 4 and an issue `failed`.
- **A repository `commit-msg` hook rejects the subject.** This is an item-5 hook fault, the residual risk named in the commit-message decision above.
- **The plan language differs from `language.git` / `language.forge`.** Derived values stay in the plan language.
- **A recovered orphan branch.** It keeps its original commit subject, which may be `docs: plan issue #N`. Only its new PR gets the derived title and body. Old-format plans recover thanks to the tolerant derivation.
- **An already open PR with the old title.** It is not retitled.

## Acceptance criteria

- [ ] For a plan with H1 `Name helper input fields`, `publish` with `languageGit: en` creates a PR titled exactly `docs: plan Name helper input fields`. With `de` the title is `docs: Plan Name helper input fields`. The message passed to the `commit-msg` hook equals that title. Asserted in `test/plan-publication-git.test.mjs`.
- [ ] For `languageForge` `en` and `de`, the body contains the five rendered paragraphs in the stated order, then the marker line, with `Refs #<N>` as the final line. The review result and open points match the plan's own `## Plan review` and open-points sections. Asserted by test.
- [ ] `complete-branch` renders the same title and body from the branch blob. Asserted by test.
- [ ] A Requirement made only of a list yields the first list item as the summary. A Requirement without text omits the summary paragraph. A workflow written as `` `effective-flow fix` `` renders as `Bugfix`. Asserted by test.
- [ ] Sanitizer:
  - `Fixes #12 for @someone` renders as `Fixes 12 for someone`;
  - `#<!-- -->12` renders as `12`;
  - `Release-As: 2.0.0` renders as `Release-As 2.0.0`;
  - `a@b.c` is unchanged;
  - an `owner/repo#3`, an issue URL and `![x](https://…)` leave no `#\d`, URL or image.

  Asserted by test.

- [ ] Limits:
  - a 200-code-point H1 yields a title of at most 72 code points ending in `…`;
  - a 2,000-code-point paragraph yields a summary of at most 600 code points ending in `…`;
  - a cut next to an emoji leaves well-formed text.

  Asserted by test.

- [ ] A plan whose H1 sanitizes to empty yields `PLAN_TEXT_UNUSABLE` with `details.source: "derived"`, before `fetchBase`, and with no commit, push or PR. Asserted by test.
- [ ] `publish` rejects `title`, `body` or `commitMessage` with `INVALID_INPUT`, and `complete-branch` rejects `title` or `body` with `INVALID_INPUT`. Asserted by test.
- [ ] Dry-run envelopes contain no derived title or body text. Asserted by test.
- [ ] `src/tools/issue-buddy.md` and `src/shared/issue-buddy-base-move.md` contain neither `docs: plan issue #` nor the fixed body sentence. Their calls pass no title, body or commit message. `source: "derived"` maps to issue `failed`. Asserted by the updated contract and pass tests.
- [ ] `test/plan-lint.test.mjs` and the existing `publication-metadata` tests pass unchanged except for the new `planForgeFields` cases.
- [ ] CI's order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs` (including the context-budget guard) and `pnpm test:distribution`.

Together these are the completion condition. The manual autopilot run below is post-merge verification outside it.

## Validation plan

- The tests named in the acceptance criteria.
- `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- `pnpm eval build-context verify`, `pnpm eval iterate verify`, `pnpm eval merge-gate verify` and `pnpm eval next-steps verify`. All four suites load `plan-lint-core.mjs` (`evals/build-context/suite.config.mjs:56`, `evals/iterate/suite.config.mjs:76`, `evals/merge-gate/suite.config.mjs:128`, `evals/next-steps/suite.config.mjs:35`). Report their evidence debt; re-recording follows the pragmatic test and release policy.
- Post-merge verification: an `autopilot` run on a test issue opens a plan PR whose title starts with `docs: plan ` and is followed by the plan H1, and whose body shows the five paragraphs, the marker and `Refs #<N>`.

## Assumptions and open points

- Assumption: the H1 that the planning leaf writes names the change well enough to serve as the PR title. It already serves as the local-path title and the plan file slug.
- Assumption: nothing depends on the `plan issue #` wording except Issue Buddy and its tests and fixtures, and `tools-understand.md:497`. No hits under `evals/`. The draft classifier `isPlanPublicationTitle` (`remote-tracker-core.mjs:7821`) matches the new English and German form. `publish` is GitHub-only, so the Forgejo WIP path does not apply.
- Assumption: no autopilot ledger, appendix, Issue Buddy report or fingerprint reads the PR title or body. Envelopes carry only `{number, url}`.
- Deliberately not covered: renaming the open PRs #745, #746 and #749. This can be done by hand.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         3 |    2 |
| Security        |        0 |         2 |    1 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         4 |    0 |
| Testability     |        0 |         1 |    4 |
| Scope           |        0 |         2 |    1 |
| Maintainability |        0 |         1 |    1 |

### Findings

Internal review (Phase 6), all incorporated:

- Architecture, Important: text was to be derived "after blob verification", but it was validated before the plan read. Derivation now runs after the read and is bound by the post-commit blob checks.
- Scope, Important: the recovery path through `complete-branch` used the fixed templates. It now derives from the branch blob.
- Scope, Important: `issue-buddy-base-move.md` was missing. It is updated.
- Error cases, Important: refusals of derived text would have stopped every later pass. They now map to item 4.
- Security, Important: a commit body from plan prose could inject release footers. The commit message is now subject-only.
- Error cases, Important: required structure was unchecked. This is superseded by the deep-review decision below.
- Notes: eval suites, the error-code name, the dead caller mode, redacted envelopes, the sanitizer scope, fixed limits and wording, and the guide, header and ADR rows are all incorporated.

### Deep review (2026-11-25)

- Architecture/Scope, Important (user decision: tolerant derivation): a stricter `publication-metadata` would have refused plans that autopilot approval, recovery and base-move accept today. That function stays unchanged. The helper falls back to the first list item, omits missing parts and maps skill-name workflows. Only an unusable title fails.
- Security, Important (incorporated): the sanitizer had no order, so removal could rebuild `#N` or `@user`, and Issue Buddy's `prReference` could then skip a foreign issue. It now has a fixed order, a fixed point, a residual-token assertion, `BREAKING-CHANGE:`, `GH-N`, URL removal, a mention rule and exact expected outputs.
- Error cases, Important (incorporated): "derived field" was undefined, and the scan sat after `fetchBase`. Derived text is now validated and scanned before `fetchBase`, refusals carry `details.source`, and the base-move rule is simplified.
- Error cases, Important (incorporated): a 72-character description gave subjects of 83 or more characters, which `commit-msg` hooks may reject. The whole subject is now capped at 72, the criterion is about the message passed to the hook, and hook rejection is named as a residual risk.
- Maintainability, Important (incorporated): `docs/adr/plan-only-unattended-publication.md:32` was not updated. It is now listed as superseded in part.
- Testability, Important (incorporated): `merge-gate` and `next-steps` also load `plan-lint-core.mjs`. All four suites are verified and reported.
- Testability, Note (incorporated): the fixture migration and `test/plan-lint.test.mjs` are named, and the scan line assertions are protected.
- Architecture, Note (incorporated): the review result and open points are now derived by the helper, not supplied by the caller.
- Testability, Note (incorporated): code-point truncation, the hard cut for a long word and the prose-paragraph definition are fixed.
- Scope, Note (incorporated): `complete-branch` loses only `title` and `body`. A recovered branch keeps its original commit subject.
- Testability, Note (incorporated): the Requirement wording is corrected. The manual run is post-merge verification outside the completion condition.

## Open points

- No open points.

## Build completion

**Date:** 2026-11-25

### Requirement

Implemented as planned: Issue Buddy and autopilot plan pull requests get the title `docs: plan <plan title>` (`docs: Plan …` for `language.git = de`), a subject-only commit message, and a derived body. The `plan-publication` helper composes and sanitizes all of it from the verified plan bytes, and the orchestrator never sees the text.

### Architecture decisions

All plan decisions hold. The implementation adds the following, each confirmed in review:

- **Metadata failure:** a plan that fails `publicationMetadataFromText` still publishes. Only the review paragraph is omitted, which keeps "only an unusable title fails".
- **Sanitizer scope:**
  - It reads at most the first 4096 code points of a raw value.
  - It also removes:
    - numeric and named character references, and every leftover `&#`;
    - all `[` and `]` after links are turned into text;
    - protocol-relative and `www.` URLs;
    - runs of three or more backticks or tildes.
  - The commit-footer rule also covers the `#` separator.
  - A mention, `GH-N` or `www.` counts after anything but an ASCII letter or digit, so `_` (Markdown emphasis) protects none of them.
  - Runs of `#` and `@` are removed in one linear pass.
  - A leftover token in the summary drops the summary paragraph; a title still refuses.
- **Subject limit:** the 72-character subject limit counts UTF-16 code units, matching commitlint, and never splits a surrogate pair.
- **Hook errors:** `COMMIT_MSG_HOOK_REJECTED` and `PUSH_REJECTED` report hook stderr only as `{length, sha256}`, so a hook that echoes the derived subject cannot leak it to the orchestrator.
- **Marker check:** the marker check on `planFile` stays before any Git call.

### Affected files

- `src/scripts/plan-lint-core.mjs`, `src/scripts/plan-publication-core.mjs`
- `src/tools/issue-buddy.md`, `src/shared/issue-buddy-base-move.md`, `src/shared/plan-publication.md`
- `docs/developer-guide/build-system.md`, `docs/user-guide/tools-understand.md`, `docs/adr/input-trust-boundary.md`, `docs/adr/plan-only-unattended-publication.md`
- `test/plan-lint.test.mjs`, `test/plan-publication.test.mjs`, `test/plan-publication-git.test.mjs`, `test/issue-buddy-contract.test.mjs`, `test/issue-buddy-pass.test.mjs`, `test/fixtures/issue-buddy/world.mjs`

`docs/user-guide/tools-automation.md` needed no change, because it does not describe the plan pull request text.

### Implementation details

The steps followed the plan's approach. `issue-buddy`'s always-loaded core is 579 of 580 budget lines, so `contextBudget` is unchanged.

### Test results

- **Full suite** (`pnpm test`) on the implementation before the review corrections: 6721 passed, 0 failed, 85 skipped.
- **Also passed at that point:** `pnpm agent:check` (after formatting this plan file), `node build.mjs` and `pnpm test:distribution`.
- **After the review corrections, targeted:**
  - `pnpm agent:check`, `node build.mjs` and `pnpm test:distribution` passed.
  - The ten affected test files passed: 1666 passed, 0 failed.
- **Eval verify** for `build-context`, `iterate`, `merge-gate` and `next-steps`: no integrity blockers. Evidence debt (stale or absent scenarios) is reported, not re-recorded.
- **Not yet run:** the post-merge manual autopilot run.

### Review result

One Node.js review, one incorporation pass and one re-check. Every finding was in the current scope, all are fixed, and none was offloaded.

## Review findings

**Date:** 2026-11-25
**Reviewer:** effective-flow-nodejs-reviewer

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    10 |
| Open / Not implemented |     0 |
