# Autopilot architecture fit keeps Active ADRs and drops only superseded, rejected or deprecated ones

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #843

## Requirement

Autopilot's pre-delivery step 2, "Architecture fit", builds a candidate set of architecture
sources and hands it to a read-only scoring leaf. Its filter says to "keep ADRs whose status is
Accepted" (`src/tools/autopilot.md:257-258`). The ADRs in this repository mostly say `Active`, so
a literal reading drops most of the decisions in force. The fit score then rests on a fraction of
the recorded architecture but still looks complete. That score is published in the draft pull
request's appendix as a review signal. In the observed run the orchestrator kept `Active` ADRs on
its own judgment. Nothing specifies that judgment, so runs can differ and their scores cannot be
compared.

Goal: the filter keeps every ADR except one whose status marks it superseded, rejected or
deprecated. It matches the status case-insensitively in each status form the repository uses. It
keeps an ADR with no recognizable status. A prose contract test pins the rule: `Active` and
`Accepted` ADRs both reach the fit leaf.

Workflow rationale: Bugfix. The shipped instruction (`src/**/*.md` is product source) gives a
wrong result for the repository's normal ADR status. The fix corrects one filter clause and its
test. It adds no capability and changes no other part of the architecture-fit step.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #843
**Original outcome:** `src/tools/autopilot.md` pre-delivery step 2 keeps every ADR except one whose status is superseded, rejected or deprecated. It matches case-insensitively and keeps an ADR with no status. A contract test that reads the source prose names the invariant that `Active` and `Accepted` ADRs both reach the fit leaf. `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** fresh baseline: the ADR filter in `src/tools/autopilot.md` step 2 split into a read, an ADR drop and a keep sentence, its prose contract test, and two documentation lines
**Continuation decision:** none

## Architecture decisions

- **Exclusion list instead of an inclusion list.** The filter names the states that remove an ADR
  from the set (superseded, rejected, deprecated) and keeps everything else. An inclusion list
  breaks whenever a project uses a status word it does not name, as `Active` does today. An
  exclusion list fails safe: an unknown or missing status keeps the ADR, so the fit leaf sees too
  much rather than too little.
- **The status value, not the body, decides.** The rule reads an ADR's own status value only: the
  first line under its Status heading, or the value of its `Status:` line. Body text never counts.
  This is the one rule that prevents a harmful error. `docs/adr/parallel-issue-planning.md:5` is an
  `Active` ADR whose next line starts "Supersedes the whole-pass lock…". A body or substring match
  on "supersed" would drop it by mistake. Decided by score: the shipped prose names the status
  value in these general terms and nothing more. It defines no file-head boundary, no emphasis or
  quote stripping and no named list-item or front matter form. A status form the wording misses
  only keeps an extra ADR, which fails safe for an advisory score. The generic "`Status:` value"
  also covers a bold `**Status:**` line, a `* Status:` list item and a MADR front matter `status:`
  key.
- **Only the first status line decides.** Decided by score: for a Status section, its first
  non-empty line is the status value, which matches the existing parser and the living-ADR rule
  that the section holds the current state. Later lines of the section, such as wrapped status
  notes, never count. An `Accepted` first line followed by a later `Superseded by …` line is
  therefore kept. That gap is known and fails safe.
- **Prefix match, case-insensitive.** A status value is dropped when it begins with one of the
  exclusion words, in any case, so `Superseded by <ADR>`, `SUPERSEDED` and `Deprecated, <date>.`
  count too. Real status values are free text: `Accepted, November 4, 2026.`
  (`docs/adr/pragmatic-test-release-policy.md:5`) already has this shape.
- **The ADR convention stays the vocabulary owner.** `src/shared/adr-convention.md:25-27` owns
  the living-ADR status values `Active`, `Superseded`, `Not implemented` and their German forms
  `Aktiv`, `Abgelöst`, `Nicht umgesetzt`. The filter does not copy that vocabulary. It names only
  its own exclusion words, plus `Abgelöst`, because the convention defines that as the German
  form of `Superseded`. `Not implemented` / `Nicht umgesetzt` ADRs stay in the set. They record a
  decided target architecture, and step 2 also scores fit with long-term plans. `Rejected` and
  `Deprecated` come from the issue. They cover projects whose ADRs follow the common
  Nygard-style vocabulary, which step 2 also reads. `Proposed` and `Draft` ADRs are kept on
  purpose: the issue drops only the three named states, and the fit score is advisory, so an
  extra undecided source fails safe. The fit leaf still weighs each source's status when it reads
  it.
- **State the rule once, in the step that applies it.** The clause stays inline in
  `src/tools/autopilot.md` step 2, and the rule fits in one ADR drop sentence plus the keep
  sentence. A second "ADR in force" rule already exists in runtime code: `parseAdrStatus` and
  `classifyAdrCandidate` in `src/scripts/remote-tracker-core.mjs:5641-5680`, which feed the review
  acceptance lens (`src/shared/review-acceptance-lens.md:44`). That classifier keeps only
  `Accepted` / `Active`. It drops a missing, `Proposed` or other unknown status, and always drops
  `docs/adr/effective-flow-project-setup.md` as configuration. Its parser (`parseAdrStatus`) is a
  precise location rule: the first match in the first 80 lines, with heading, bold and plain forms.
  The autopilot prose stays generic instead (see the status-value bullet). Decided by score: the
  autopilot rule diverges from that classifier on purpose, and this issue changes neither the
  classifier nor the review lens. The architecture-fit score is advisory and fails safe: an extra
  source only widens what the leaf reads. The review lens judges conflicts and fails closed. The
  project-setup ADR stays in the fit set because the issue drops only the three named states.
  Aligning the two rules, or sharing one parser, is a candidate for a follow-up issue. The new
  test's `// Invariant:` comment records the divergence, so a later editor of the autopilot rule or
  its test sees it. `src/scripts/remote-tracker-core.mjs` is not changed.

## Affected files

| File                                                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/autopilot.md`                             | Pre-delivery step 2, lines 256-258: split the filter sentence into a read sentence, an ADR drop sentence (the ADR's own status value, never body text, prefix match in any case, `Abgelöst` as the German superseded form) and a keep sentence. Remove "keep ADRs whose status is Accepted", and name `Active`, `Accepted` and no-status ADRs as kept. Adjust the `contextBudget:` frontmatter line only if `node build.mjs` reports the budget exceeded. |
| `docs/user-guide/tools-automation.md`                | Line 89: replace "your accepted ADRs in `docs/adr/`" with "your ADRs in `docs/adr/` except superseded, rejected or deprecated ones".                                                                                                                                                                                                                                                                                                                      |
| `docs/developer-guide/subagent-progress-coverage.md` | Line 108: update the `src/tools/autopilot.md:273` pointer of `autopilot/architecture-fit` to the new line of the spawn-site marker, if the marker moves. No test catches a stale number here.                                                                                                                                                                                                                                                             |
| `test/scored-decisions-contract.test.mjs`            | Line ~871: replace the pinned old clause in the test "autopilot wires the delivery-state calls and reads fit sources from the delivery head" with the new wording. Add one test beside the reason-limit test (line ~886) that slices step 2 and pins the ADR-filter invariant, with an `// Invariant:` comment.                                                                                                                                           |

## Implementation details

### Approach

1. **Rewrite the ADR rule in step 2.** In `src/tools/autopilot.md`, the filter is one sentence
   today. It drops `<plan.dir>/archive/` and the run's own plan, reads each other candidate with
   `git -C <RUNTIME_STATE_ROOT> show '<head-oid>:<path>'`, and keeps ADRs, plans and every other
   candidate. A status can only be judged after the read, so split the sentence in three:
   - **Read sentence:** the unchanged drop of `<plan.dir>/archive/` and the run's own plan, and
     the unchanged read of each other candidate.
   - **ADR drop sentence:** drop every ADR whose own status value begins, in any case, with
     `Superseded`, `Rejected`, `Deprecated` or `Abgelöst`. The status value is the first line
     under the ADR's Status heading or its `Status:` value, never body text.
   - **Keep sentence:** keep the rest, named as `Active` and `Accepted` ADRs, ADRs without a
     status, plans with one canonical open status line, and every other candidate.

   The ADR rule stands in its own drop sentence, not in the keep list, so the "every other
   candidate" catch-all cannot be read as overriding it.

   Add nothing else to the prose: no file-head boundary, no emphasis or quote rule, no named
   list-item or front matter form, and no list of this repository's ADR files or spellings. Leave
   the plan filter, the quoting rule, the `notAssessed` path and the leaf handoff unchanged.

2. **Update the existing pin.** In the test at `test/scored-decisions-contract.test.mjs:813-880`,
   keep the part string `"Drop `<plan.dir>/archive/` and the run's own plan"`, which the read
   sentence still contains. Replace `'keep ADRs whose status is Accepted, plans with one canonical
open status line'` with a substring of the new keep sentence that includes its plan clause.
3. **Add the invariant test.** Add one `test(...)` after the reason-limit test (line ~886). It
   slices `tool('autopilot')` from `**Architecture fit.**` to
   `<!-- spawn-site:autopilot/architecture-fit -->`, the same way that test does, and flattens it
   with `flat(...)`. Inside that slice it cuts out two sentences by their boundaries:
   - the ADR drop sentence, the one that names `Superseded`;
   - the keep sentence that follows it.

   Open the test with an `// Invariant:` comment that names the rule. `Active` and `Accepted`
   ADRs both reach the fit leaf. Only an ADR whose own status value begins, in any case, with
   superseded, rejected or deprecated (or `Abgelöst`) is dropped. An ADR without a status is
   kept. The comment also says that this rule deliberately differs from `classifyAdrCandidate` in
   `src/scripts/remote-tracker-core.mjs`: the advisory fit fails safe, while the review lens
   fails closed.

   The test asserts that:
   - the ADR drop sentence contains each of the four exclusion words, and none of `Active`,
     `Accepted`, `Proposed` or `Not implemented`;
   - the ADR drop sentence states case-insensitive matching and that body text never counts;
   - the keep sentence names `Active`, `Accepted` and an ADR without a status;
   - the slice no longer contains `whose status is Accepted`.

   It asserts with `assert.ok(<part>.includes(...), <message>)` / `assert.match`, following the
   file's existing pattern. If a sentence boundary cannot be found, it fails with a message that
   names the missing anchor.

4. **Build and budget.** Run `node build.mjs`. If the `Always-loaded core (lines/budget)` report
   shows `tools/autopilot.md` over budget, set the `contextBudget:` line to the reported built
   count plus up to ten lines of headroom, per `AGENTS.md`. Otherwise leave it unchanged.
5. **Validate in CI order:** `pnpm agent:check`, `pnpm test`, `node build.mjs`,
   `pnpm test:distribution`. Run `pnpm format` first if `agent:check` reports Markdown or JS
   formatting.
6. **Commit** as a Conventional Commit of type `fix` with scope `autopilot`. It is not breaking
   and needs no version change; release-please derives the release.

### Component structure

Not relevant: one prose clause and one contract test, no new module or fragment.

### State management

Not relevant: the filter keeps no state. `fit-record` and `pr-appendix` in
`src/scripts/autopilot-core.mjs` are unchanged.

### API integration

Not relevant: no helper, CLI payload or forge call changes.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- `## Status` section with `Active` (13 ADRs) or a `**Status:** Active` line (2 ADRs): kept.
- `Accepted` (`automation-tool-category.md`), `Accepted, November 4, 2026.`
  (`pragmatic-test-release-policy.md`) and `Status: accepted` (`compose-readme-with-mdtheme.md`):
  kept. No exclusion word is a prefix of these values.
- `Superseded by <ADR>`, `SUPERSEDED`, `deprecated` or `Rejected, <date>.` as the status value:
  dropped, because the prefix match ignores case.
- German `Abgelöst`: dropped. `Aktiv` and `Nicht umgesetzt`: kept.
- `Not implemented`, `Proposed` or `Draft`: kept, because they are not on the exclusion list. No
  ADR in this repository has one of these statuses today.
- An `Active` ADR whose body says "Supersedes …" (`parallel-issue-planning.md:5`): kept, because
  only the status value counts.
- A trailing status note below the status value, such as `Status note, November 13, 2026: …` in
  `pragmatic-test-release-policy.md:7`: ignored. The value is the first non-empty line of the
  section.
- An ADR with no status section or line, or an empty `## Status` section: kept.
- A `## Status` section whose first line is `Superseded by …`: dropped.
- A status value wrapped in emphasis or quotes, such as `**Superseded** by …` or
  `status: "deprecated"`: not covered by the prose. It may be kept, which fails safe.
- A Status section whose first line is `Accepted` and whose later line says `Superseded by …`:
  kept, because only the first line counts. This is a known, fail-safe gap.
- `docs/adr/effective-flow-project-setup.md` (`Active`): kept, unlike in the review lens's
  classifier.
- A MADR-style ADR with a front matter `status: superseded by …` key or a `* Status: deprecated`
  list item: dropped, because the generic "`Status:` value" covers both. A run that misses either
  form keeps the ADR, which fails safe.
- A `Status:` line inside a fenced example in the body: body text, so it never counts.
- Every ADR dropped, and no other candidate: the existing `notAssessed: true` path applies
  unchanged.

## Acceptance criteria

- [ ] `src/tools/autopilot.md` pre-delivery step 2 no longer contains "whose status is Accepted".
      It drops an ADR only when its status value begins with `Superseded`, `Rejected`, `Deprecated` or
      `Abgelöst`, matched case-insensitively. That rule stands in its own ADR drop sentence after the
      read, and the status value is the ADR's own: the first line under its Status heading or its
      `Status:` value, never body text. The keep sentence names `Active`, `Accepted` and ADRs without
      a status. The prose adds no file-head, emphasis or named-form rule.
- [ ] `test/scored-decisions-contract.test.mjs` contains a new test whose `// Invariant:` comment
      states that `Active` and `Accepted` ADRs both reach the fit leaf. Its assertions on the ADR
      drop sentence and the keep sentence cover every point of Approach step 3. It fails against the
      current source and passes against the changed source.
- [ ] The existing test "autopilot wires the delivery-state calls and reads fit sources from the
      delivery head" pins the new clause instead of the old one and passes.
- [ ] `docs/user-guide/tools-automation.md` says the fit is scored against "your ADRs in
      `docs/adr/` except superseded, rejected or deprecated ones". The `autopilot/architecture-fit` row
      in `docs/developer-guide/subagent-progress-coverage.md` names the marker's actual line in
      `src/tools/autopilot.md`.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` all pass, run
      in this order.

## Validation plan

- Run the new test against the unchanged source first and confirm it fails on the old clause. Then
  confirm it passes after the change: `node --test test/scored-decisions-contract.test.mjs`.
- Review the rewritten clause by hand against the ADR forms under `docs/adr/` listed in "Edge
  cases". Each `Active` or `Accepted` form must be kept, and the
  `parallel-issue-planning.md` body text must not trigger a drop.
- Run `node build.mjs` and read the `Always-loaded core (lines/budget)` row for
  `tools/autopilot.md`.
- Full CI order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- Run `pnpm eval build-context verify`, which is read-only. Confirm that the reported freshness
  debt comes from the `src/tools/autopilot.md` edit and that no integrity error appears.

## Assumptions and open points

- Assumption: the orchestrator applies the architecture-fit filter by reading prose.
  `src/scripts/autopilot-core.mjs` only records and renders the result, and the autopilot step
  does not call the remote-tracker classifier. A prose change and a prose contract test therefore
  cover autopilot's behaviour.
- Assumption: German equivalents of `Rejected` and `Deprecated` are not added. They are not part of
  the status vocabulary that `src/shared/adr-convention.md` owns, and inventing them would start a
  second vocabulary. `Abgelöst` is included because that convention defines it.
- Assumption: editing `src/tools/autopilot.md` creates freshness debt in the `build-context` eval
  suite, whose seeds are every `tools/*` file (`evals/build-context/suite.config.mjs:20-21`). CI
  reports that debt without failing. Re-recording evidence is not part of this issue.
- Assumption: apart from the user-guide sentence and the coverage-page line pointer under
  "Affected files", no guide or ADR describes the status filter.
  `docs/adr/automation-tool-category.md:140-143` only says the fit is scored against the
  repository's ADRs.
- Out of scope: aligning `classifyAdrCandidate` in `src/scripts/remote-tracker-core.mjs` with the
  autopilot rule (see "Architecture decisions").
- Out of scope: normalizing the ADR status forms under `docs/adr/` to the convention's `Active`
  vocabulary, and any change to how plans or other candidates are filtered.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[
  {
    "site": "S-BAT",
    "question": "How does the new autopilot architecture-fit ADR rule relate to the existing classifyAdrCandidate classifier, which uses the opposite policy for a missing, Proposed or unknown status and for the project-setup ADR?",
    "options": [
      "Autopilot-only rule, divergence documented",
      "Autopilot-only rule, project-setup ADR also dropped",
      "Change both rules",
      "Reuse classifier via helper"
    ],
    "escape": [],
    "stop": null,
    "scores": [
      {
        "label": "Autopilot-only rule, divergence documented",
        "score": 8,
        "reason": "It does what the issue asks: the exclusion rule goes only in the prose-applied, advisory step 2, which can fail safe, while the review lens keeps its fail-closed classifier and recording the divergence stops a later edit from aligning one rule to the other by accident."
      },
      {
        "label": "Autopilot-only rule, project-setup ADR also dropped",
        "score": 5,
        "reason": "Viable because the setup ADR holds configuration rather than architecture, but it adds an exclusion the issue does not ask for and a path special case to prose paid on every run."
      },
      {
        "label": "Change both rules",
        "score": 2,
        "reason": "It widens scope into the review acceptance lens, whose fail-closed policy is deliberate, and changes review behaviour and remote-tracker tests the issue does not ask about."
      },
      {
        "label": "Reuse classifier via helper",
        "score": 3,
        "reason": "The existing classifier drops missing or unknown statuses, the opposite of what the issue requires, so the helper would need a second policy mode and a new runtime step for an advisory check."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "Which lines of an ADR's Status section decide whether it is dropped?",
    "options": [
      "First status line only",
      "Any line of the Status section"
    ],
    "escape": [],
    "stop": null,
    "scores": [
      {
        "label": "First status line only",
        "score": 8,
        "reason": "It matches the existing parser, which takes the first non-blank Status line, and the living-ADR convention that the Status section holds the current state; its only gap keeps an extra ADR, which fails safe for an advisory score."
      },
      {
        "label": "Any line of the Status section",
        "score": 5,
        "reason": "It closes the later-Superseded gap, which no current ADR shows, but a wrapped prose line in the long status notes could drop an Active ADR without anyone noticing."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "How specific must the shipped autopilot step-2 prose be about where the ADR status value is read?",
    "options": [
      "Minimal clause",
      "Middle",
      "Keep the plan as is",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "stop": null,
    "scores": [
      {
        "label": "Minimal clause",
        "score": 9,
        "reason": "Ahead of Middle because it keeps the one rule that prevents harm, that body text never counts, at the lowest per-run prose cost, while a form it fails to name only keeps an extra ADR, which fails safe for an advisory score."
      },
      {
        "label": "Middle",
        "score": 6,
        "reason": "Naming every status form adds per-run prose but buys little, since the generic wording already covers these forms and a missed form only keeps an extra ADR."
      },
      {
        "label": "Keep the plan as is",
        "score": 4,
        "reason": "It spends the most per-run prompt length on fail-safe edge cases, and a test pinning about eight phrasings makes later edits brittle, against the issue's smallest-fix framing."
      }
    ]
  }
]
```

<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    1 |

### Findings

Deep plan review (Phase 6b):

- Architecture, Important: the shipped prose had grown into a status-parser specification (file
  head, named forms, emphasis and quote stripping), paid on every autopilot run, while only a false
  drop through body text does harm. Adjusted by score: one drop sentence names the ADR's own
  status value in general terms and says body text never counts. The other rules leave the prose
  and remain edge cases that fail safe.
- Testability, Important: assertions over the whole step 2 slice could not tell whether `Active`
  sat in the drop sentence or the keep list. Adjusted: the filter is split so the ADR drop
  sentence follows the read, and the test cuts out the ADR drop sentence and the keep sentence.
  It asserts that the exclusion words are in the drop sentence and `Active`, `Accepted`,
  `Proposed` and `Not implemented` are not, and that the keep sentence names `Active`,
  `Accepted` and no-status ADRs.
- Maintainability, Note: the claim that an editor of either rule sees the divergence note was
  overstated, because `classifyAdrCandidate` carries no pointer. Adjusted: the claim now covers the
  autopilot rule and its test, and `remote-tracker-core.mjs` stays unchanged.
- Scope, Note: the user-guide wording was only an example. Adjusted: the replacement wording is
  binding in "Affected files" and the acceptance criteria.

### Review history (2026-11-27, plan)

Result at that time: Approved

#### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    2 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    3 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         1 |    3 |

#### Findings

Gap analysis (Phase 4): the existing `classifyAdrCandidate` classifier and the location of the
status value were added to the plan. Two points needed a decision, the relation to that classifier
and which Status lines count, and both were decided by score (see "Decided by score").

Internal review (Phase 6):

- Error cases, Note: the ADR rule sat in the keep list beside the "every other candidate"
  catch-all, which a loose reading could let override it. Adjusted: the rule moves into the drop
  sentence.
- Maintainability, Note: the user guide said the fit uses "accepted ADRs". Adjusted:
  `docs/user-guide/tools-automation.md` is in "Affected files" and the acceptance criteria.
- Maintainability, Note: the coverage page's line pointer to the spawn-site marker would go stale
  without a failing check. Adjusted: `docs/developer-guide/subagent-progress-coverage.md` is in
  "Affected files" and the acceptance criteria.
- Architecture, Note: the plan claimed the classifier's location rule matched this plan's.
  Adjusted: the differences are named.
- Architecture, Note: MADR-style front matter and list-item status forms were not recognized.
  Adjusted: the status forms are named in general terms, and an edge case covers them.
- Error cases, Note: matching any line of a Status section could drop an `Active` ADR through
  wrapped status-note prose. Adjusted: the risk was added to the pending option before scoring.

Scoped re-check after the scored decisions (planning ladder, architecture decisions changed):

- Architecture, Important: "before its first content section" could put a `## Status` section
  outside the file head. Adjusted: the head ends at the first heading other than the title and a
  Status heading, and an edge case covers a `## Status` / `Superseded by …` ADR.
- Maintainability, Important: Approach step 1 pointed the shipped prose at the plan for the status
  forms and capped it at two sentences. Adjusted: the prose names the general forms and may use at
  most three sentences.
- Testability, Important: the first-line decision had no assertion and no acceptance criterion.
  Adjusted: the new test asserts it, and acceptance criterion 1 states it.
- Error cases, Note: a status value wrapped in emphasis or quotes would miss the prefix match.
  Adjusted: the match ignores leading Markdown emphasis or quotes, and an edge case covers it.
- Maintainability, Note: the classifier divergence was recorded only in the plan. Adjusted: the
  new test's `// Invariant:` comment records it.

## Open points

- No open points.
