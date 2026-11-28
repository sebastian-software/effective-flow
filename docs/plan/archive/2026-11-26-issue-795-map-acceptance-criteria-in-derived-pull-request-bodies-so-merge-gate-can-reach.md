# Map acceptance criteria in derived pull request bodies so Merge Gate can reach complete

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)
**Issue:** #795

## Requirement

Merge Gate can offer to close an issue that is named in a merged pull request's lifecycle receipt
and that the pull request only references (`Refs #N`), and it does so only on the verdict
`complete`. That verdict needs every acceptance criterion stated in the issue to be covered by a
locatable statement in the merged pull request's title or body
(`src/shared/merge-gate-issue-observation.md`, lines 106-131). The locator is the criterion's
ordinal within its section (lines 204-205).

The bodies that `pr` derives in step 9 (`src/tools/pr.md`, lines 302-325) describe the change but
never map it to the referenced issue's criteria, and `pr` never reads the issue. So Merge Gate
records `undetermined` for nearly every autopilot pull request, and the user checks completion and
closes the issue by hand.

Goal: when a supplied forge issue reference points to an issue that states acceptance criteria,
the body that `pr` derives carries one coverage line per criterion. Each line either points to the
change that covers the criterion or says the criterion is not covered. The Merge Gate verdict,
closure and label rules stay unchanged. The change only creates the evidence the gate already
expects.

Workflow rationale: **Feature**. `pr` gains new product behaviour: a forge read, new body content
and a new body-check rule. The shipped runtime gains a new read-only helper operation. Nothing here
corrects existing behaviour, and nothing is a refactoring.

## Outcome checkpoint

**Primary source:** `github.com/sebastian-software/effective-flow` issue #795, planned in autopilot
run `ap-20261126T230517Z-490f8545`; no verified parent outcome.
**Original outcome:** For a referenced issue with criteria, a body derived by `pr` has one coverage
line per criterion and never claims an uncovered one. Everything else in the body is unchanged.
Hidden mode, external targets, runs without a forge receipt and issues without criteria produce
today's body. The Merge Gate
rules are unchanged, and a contract test protects the invariant.
**Last evaluated attempt:** none (fresh baseline)
**No-progress count:** 0
**Cumulative approach:** one read-only remote-tracker operation, one gated call in `pr.md` step 9,
and one lazy-loaded coverage fragment
**Continuation decision:** none

## Architecture decisions

- **Deterministic helper, not prose extraction.** A new read-only `remote-tracker.mjs` operation,
  `issue-acceptance-criteria`, reads the referenced issues and returns their stated criteria.
  - It reuses `extractIssueAcceptanceCriteria`, `ACCEPTANCE_SOURCE_BOUNDS` (`issues`,
    `issueBodyBytes`, `criteriaPerSource`, `displayLineChars`) and the author permission gate of
    `acceptanceIssues` (`src/scripts/remote-tracker-core.mjs`, lines ~5434-5540 and ~6897-6958).
  - The closed heading set stays owned by `merge-gate-issue-observation.md` and mirrored in code by
    `ISSUE_CRITERIA_HEADINGS`. So `pr.md` restates neither the heading set nor any bound, and `pr`
    applies the same extraction rule as Merge Gate.
  - `pr-acceptance-sources` cannot serve this, because it is keyed on an existing pull request and
    its receipt.
  - Decided by score.
- **One call for all references.** The operation takes `numbers`, an ordered array of issue
  numbers in the resolved repository. It enforces `ACCEPTANCE_SOURCE_BOUNDS.issues` itself and
  records an `issues` truncation note. One `repository-resolve` and one probe serve every reference.
- **Per-number failure isolation.** A failure to read one number becomes that entry's
  `trust: unreadable` with its error `code`, while the other entries keep their criteria. Examples
  are a 404, a transferred issue, or a pull request number that `normalizeIssue` rejects with
  `INVALID_PAYLOAD`. Only `COMMAND_FAILED`, `INVALID_PAYLOAD` and `TARGET_NOT_FOUND` are caught per number; every
  other error is rethrown and fails the whole call, among them the probe's `AUTH_FAILED`,
  `CLI_MISSING`, `UNSUPPORTED_CAPABILITY` and a failed repository resolution. A token that expires
  mid-run surfaces as `COMMAND_FAILED` and yields only `unreadable` entries, which is harmless,
  because those references fall back to today's body. Only the new
  operation catches errors; the shared function keeps throwing, so `pr-acceptance-sources` stays
  fail-closed. Decided by score.
- **One shared issue-source function.** The per-issue core of `acceptanceIssues` moves into one
  internal function `(context, number)`.
  - It performs the issue read, the author permission check, the body truncation, the extraction
    and the truncation notes.
  - It pushes its notes into the given `context.truncated` in today's order: body bytes, display
    truncation, criteria per source.
  - It returns `{ number, trust, author, headingFound, criteria }`.

  `acceptanceIssues` rebuilds each entry in today's key order, adding `reference` and
  `relationship` from the receipt item. This keeps the `pr-acceptance-sources` output and its
  snapshot byte-identical. The new operation projects its own output from the same result.

- **Ordinals equal Merge Gate's count.** The new operation's `ordinal` is the item's raw 1-based
  position among the section's top-level list items, taken from `sectionListItems` before
  `boundedCriteria` drops empty or duplicate items. A dropped item keeps its ordinal as an entry
  with `dropped: true` and no display text. This position is carried only into the new operation's
  projection; `pr-acceptance-sources` is unchanged. Decided by score.
- **Ordinals restart per criteria section.** An issue with several matching criteria headings has
  one section index per heading (1-based). Each criterion carries `section` and an `ordinal` that
  restarts at 1 in its section, counted before `boundedCriteria` drops anything, the way Merge
  Gate's locator counts. Decided by score.
- **Empty items stay not covered.** A dropped empty item gets the not-covered phrase, so one stray
  empty bullet leaves its issue `undetermined` and the user closes by hand. This is an accepted
  fail-closed limitation, because a status the gate counts as covered would be a false claim and
  would need a Merge Gate edit. Decided by score.
- **Duplicates mirror their first occurrence.** A dropped item that repeats an earlier item carries
  `duplicateOf: <ordinal of the first occurrence>` in the new projection, the occurrence the
  existing duplicate key retains. `pr` gives that line exactly the status of its first occurrence,
  covered pointer or not-covered phrase. An empty item has no `duplicateOf` and gets the
  not-covered phrase. So an issue that repeats one item can still reach `complete`. Decided by
  score.
- **Trusted authors only.** Criteria count only when the issue's author holds write permission, per
  the acceptance lens's rule `isSourceTrustPermission`. Any other issue yields no criteria, and its
  body is derived as today. This keeps text from outside authors out of coverage claims in a
  published body.

  This diverges deliberately from Merge Gate, which applies no author gate: an outside author's
  issue stays `undetermined` there. Autopilot already skips `untrusted-author` issue sources
  (`src/shared/autopilot-issue-source.md`), so only direct `pr` runs are affected. Decided by score.

- **Gate: a forge lifecycle receipt from the caller, outside hidden mode.** `pr` makes the call only
  when the invocation carries the caller-supplied `effective-flow-issue-lifecycle:v1` receipt
  machine line (`src/shared/issue-lifecycle-receipt.md`) whose `target` is `forge`, and visibility
  is not `hidden`. `pr` validates the line with one `issue-lifecycle-receipt-parse` call (context
  `expectedTarget` `forge`, `expectedRepository` the `slug` of a fresh `repository-resolve`), never
  by ad hoc parsing, so a malformed, mixed-target or cross-repository receipt makes no call. That
  receipt is the trusted handoff of a caller that already resolved the forge
  target, and Merge Gate assesses exactly the issues it names. This covers runs where a forge issue
  argument forced `remote` whatever `tracker.mode` says (`src/shared/issue-tracker.md` line 53,
  `src/shared/tracker-target.md` lines 43-44; `apply-issues` and `apply-review-remote` hand `pr` a
  receipt without checking the mode). It needs no new line, no caller edit and no `tracker.mode`
  read. The numbers are the parsed receipt items with `relationship` `refs` and an issue of the form
  `#<N>`, in receipt order; `closes` items are closed by the forge and never read. An `external`
  target, an absent or rejected receipt, and a direct `pr` run without a receipt keep today's body.
  `issue-lifecycle-receipt-parse` is already on the read-only allow list
  (`src/scripts/claude-settings-core.mjs` line ~196). Decided by score.
- **Single-commit bodies with criteria go to the draft leaf.** When criteria were returned, even a
  single-commit body is drafted by `pr/body-draft`, because per-criterion judgment exceeds the
  triviality exception and the leaf can read the hunks it needs. Without criteria, the single-commit
  inline path is unchanged. Decided by score.
- **Lazy-loaded coverage fragment.** `pr.md` step 9 keeps only the gate and the call. A
  ` ```lazy-include ` pointer sits at column 0 between steps 8 and 9, like every existing `pr.md`
  pointer, because `LAZY_INCLUDE_RE` (`build-lib.mjs` ~5630) needs a column-0 `when:` line and a
  fence would split the list item. Its `when:` names step 9's `issue-acceptance-criteria` call
  returning at least one usable criterion (a non-`dropped` criterion of a `trusted` entry), before
  the body is derived. The
  new fragment `src/shared/pr-criteria-coverage.md` holds the rest:
  - the brief addition;
  - the coverage format and body rule;
  - the structural Body check clause.

  Runs without criteria pay nothing beyond the gate. The fragment is the single owner of the
  coverage contract, and `autopilot` and `plan-pr-continuation` inherit it through `pr`. Decided by
  score.

- **Machine-checkable coverage format** (owned by the fragment).
  - **Heading.** The section starts with an acceptance-criteria heading: `Acceptance criteria` or
    `Akzeptanzkriterien`, otherwise translated once per run.
  - **Sub-lists.** Under it is one numbered sub-list per referenced issue and section, labelled with
    its receipt `#<N>`, plus ` §<section>` when the issue has more than one section. The orchestrator locates the section by those labels and their numbered items,
    never by the translated heading.
  - **Numbers.** Each number equals the helper's `ordinal`.
  - **Line shape.** Every line has the language-neutral shape `<ordinal>. <paraphrase> — <status>`,
    with the one fixed separator `—`.
  - **Status.** The status is exactly one of two values: a covered pointer (the covering file,
    behaviour or commit subject), or the literal not-covered phrase. That phrase is `not covered`
    (en) or `nicht abgedeckt` (de), and is otherwise translated once per run. A `duplicateOf` line
    repeats the status of its first occurrence verbatim.
- **Structural coverage check.** When criteria were returned, the step 9 Body check also requires,
  per reference and section, the labelled sub-list with exactly the returned ordinals in order, the separator,
  exactly one status per line, and for a `duplicateOf` line a status equal to its first
  occurrence's. These are token and count checks of the same kind as the
  existing rules. The check never judges whether a covered claim is true. A failure takes the
  existing inline-fallback and correction path. Inside the coverage section, the existing rejection
  of verification and test-result claims carries two exemptions: a paraphrase whose status is the
  not-covered phrase is no verification claim, and a covered pointer may name a test file as the
  covering change, never a result. No paraphrase asserts an outcome. Decided by score.
- **Known limitations, deliberately accepted** (decided by score).
  - **Check-result criteria.** A criterion that needs a check result, such as "CI passes", always
    gets the not-covered status, because bodies make no verification claims.
  - **Staleness.** The section is derived once and is not refreshed by later pushes. A stale line
    at worst costs a manual close as today. Merge Gate only offers closure, so even a stale covered
    claim still needs the user's consent.
  - **Direct runs.** A `pr` run without a caller receipt makes no read, even under `remote`, because
    Merge Gate assesses only receipted issues.
  - **Reused pull request.** Step 9 runs only for a new pull request or a plan draft finish, so an
    existing pull request that a rerun or a continuation reuses gets no coverage section.
- **A failed criteria read is reported once.** When the single `issue-acceptance-criteria` call itself
  fails, whether by a helper error code or by a permission denial of an allow rule that an existing
  install lacks, step 12 reports one line naming the failed criteria read and that code or denial.
  Normal outcomes (`untrusted-author`, `unreadable`, no heading) stay silent. This costs one eager
  line in `pr.md`. Decided by score.
- **Merge Gate untouched.** `src/shared/merge-gate-issue-observation.md` is not edited, so its
  verdict, closure and label rules stay unchanged and no `merge-gate` eval evidence debt arises.
- **Read-only allowlist entry.** The new operation is a forge read and joins the read-only
  `remote-tracker.mjs` allow rules that setup writes (`src/scripts/claude-settings-core.mjs`, list
  near line 163). Every stated rule or operation count is derived from that list after the change.
  The current docs already disagree with each other (80, 81 and 47).
  `test/effective-flow-state-harness.test.mjs` (lines ~303-341) already forces every new operation
  to be classified.

## Affected files

| File                                                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/remote-tracker-core.mjs`                | Register `issue-acceptance-criteria` in `REMOTE_OPERATIONS` and `CAPABILITY_BY_OPERATION` (`issueRead`); add its closed input validation (`cwd`; `numbers`: non-empty array of distinct positive integers); factor the shared per-issue function out of `acceptanceIssues`; implement the operation with per-number error isolation and raw ordinals. Output per number: `number`, `trust` (`trusted` / `untrusted-author` / `unreadable` with `code`), `headingFound`, `criteria` as `{ section, ordinal, displayText, displayTruncated, dropped, duplicateOf }` (`duplicateOf` only on a duplicate); plus run-level `truncated` notes; never the raw body or criterion `text` |
| `src/scripts/remote-tracker.mjs`                     | Verify that the thin CLI dispatches every registered operation generically; change only if it keeps a per-operation table                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/scripts/claude-settings-core.mjs`               | Add `issue-acceptance-criteria` to the read-only `remote-tracker.mjs` operation list                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/shared/setup-allowlist.md`                      | Update the stated allow-rule count (lines 3 and 82) to the count derived from `claude-settings-core.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/shared/pr-criteria-coverage.md`                 | New lazy fragment: brief addition for `pr/body-draft`, coverage format and body rule, structural Body check clause                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/shared/model-tiers.md`                          | Line 118: the `pr/body-draft` site description also names the referenced issues' criteria; tier unchanged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/tools/pr.md`                                    | Step 9: extend the read-set sentence (line 302) with the receipt parse and criteria calls; add the gated call paragraph (gate: the forge lifecycle receipt) and the lazy-include pointer; route a single-commit body to `pr/body-draft` when criteria were returned; step 12: one report line for a failed criteria read; update `contextBudget` from the `node build.mjs` report                                                                                                                                                                                                                                                                                               |
| `test/remote-tracker.test.mjs`                       | Unit tests for the new operation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `test/setup-allowlist-contract.test.mjs`             | Adjust a pinned rule count or operation list, if one exists                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `test/workflow-contracts.test.mjs`                   | New contract test across `pr.md` and the fragment, asserting the pointer and its `when:` clause with `LAZY_INCLUDE_RE` the way the `pr-thread-bound-writer` test does (near lines 6647-6690); the merge-gate trigger table near line 3245 reads only `merge-gate.md` and gets no row; extend the read-set invariant test (near line 23803)                                                                                                                                                                                                                                                                                                                                      |
| `docs/developer-guide/build-system.md`               | Line ~1520 rule count; lines ~2154-2157 `pr/body-draft` inputs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `docs/developer-guide/configuration.md`              | Line ~135 read-only operation count                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `docs/developer-guide/architecture.md`               | Line ~1128 read-only operation count; name the new operation where reads are listed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `docs/user-guide/tools-setup.md`                     | Lines ~275 and ~283 rule and remote-tracker counts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `docs/user-guide/tools-deliver.md`                   | `/effective-flow pr` section (lines ~262-404): the coverage section a derived description can now contain, its known limitations (including direct runs without a receipt), and the step 12 line for a failed read                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `docs/developer-guide/subagent-progress-coverage.md` | Line 159: set the `pr/body-draft` reference to the spawn site's line after the step 9 edit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Implementation details

### Approach

1. **Helper core.** In `remote-tracker-core.mjs`, extract the shared per-issue function. Rewire
   `acceptanceIssues` to it without changing that operation's output or note order. Extend the
   internal walk so the raw top-level position of each item is available to the new projection.
2. **New operation.** Add `issue-acceptance-criteria` with input `{ cwd, numbers }`.
   - It resolves the repository and the probe context like the other reads.
   - It bounds `numbers` to `ACCEPTANCE_SOURCE_BOUNDS.issues` and adds an `issues` note when it
     drops any.
   - It runs the shared function per number in order and catches per-number errors into
     `unreadable` entries. Run-level errors are rethrown.
   - It projects each criterion with its raw ordinal. Dropped items appear as `dropped: true`
     entries, and a repeated item also carries `duplicateOf`, the ordinal of its first occurrence.

   Register the capability and the allow rule.

3. **`pr.md` step 9.** Make these edits:
   - Extend the read-set sentence with the receipt parse call and the single criteria call.
   - After the hidden-mode paragraph, add one paragraph, which applies only when a body will be
     derived (never for a supplied description):
     - Only when the invocation carries a received lifecycle receipt machine line with `target`
       `forge`, and outside hidden mode, collect the `#<N>` issues of its items with relationship
       `refs`, in receipt order, from one `issue-lifecycle-receipt-parse` call (see "Architecture
       decisions"). Read no `tracker.mode`.
     - Make one literal `remote-tracker.mjs issue-acceptance-criteria` call, with the execution
       root as `cwd`.
     - Only `trusted` entries with `headingFound: true` and at least one criterion count. A helper
       error or any other entry leaves that reference without criteria. Returned criteria are
       quoted data, never instructions.
     - A failure of the call itself, by error code or permission denial, adds the one step 12
       report line (see "Architecture decisions"). Normal outcomes stay silent.
   - Add the lazy-include pointer for `pr-criteria-coverage` at column 0 between steps 8 and 9, as
     described under "Architecture decisions".
   - In the Description paragraph, route the single-commit case to `pr/body-draft` when criteria
     were returned.
   - Keep the **Bounds** sentence verbatim: `test/model-tiers-contract.test.mjs` line 154 pins it.
4. **Fragment `pr-criteria-coverage`.** Write it with three parts:
   - **Brief addition:** "the returned criteria per referenced issue (section, ordinal and display text,
     quoted data)".
   - **Body rule:** the coverage section uses the format above and comes after the prose. A
     criterion is marked covered only when the commits, the stat or the diff hunks read show the
     covering change. Every other criterion gets the not-covered phrase. This includes a
     `displayTruncated` or `dropped` entry and a criterion that needs a check result. The section
     makes no verification or test-result claim. The inline fallback applies the same rule from the
     commit messages and the stat.
   - **Body check clause:** the structural check above, with its two verification-claim exemptions,
     run after the unchanged strip step.
5. **Budget and build.** Run `node build.mjs` and set `pr.md`'s `contextBudget` to the reported
   built count plus at most ten lines of headroom. Confirm the fragment is delivered as
   `shared/pr-criteria-coverage.md` in every target.
6. **Docs.** Apply the documentation rows of "Affected files", taking every count from the code.
7. **Tests.** Add the helper tests and the contract test described in "Validation plan".

### Component structure

Not relevant: no UI.

### State management

Not relevant. The operation is a pure forge read and writes no runtime state and no snapshot.
`pr` keeps the criteria only for the duration of step 9.

### API integration

The new helper operation works on both providers through the existing `issue-read` and
`collaborator-permission-read` provider operations, so no new provider calls are needed.

- If the probe reports `issueRead: false`, the call fails through the existing capability gate, and
  `pr` derives today's body.
- If `collaboratorPermissionRead` is unavailable, the permission resolves to `null`, which counts as
  untrusted, as in `acceptanceAuthorPermission`.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **No usable criteria.** In any of these cases the coverage section is omitted, the fragment is
  not loaded, and the body is derived as today:
  - no criteria heading;
  - an untrusted author;
  - an `unreadable` entry;
  - a run-level helper error;
  - a missing capability.
- **No call at all.** Hidden mode, an absent, rejected or `external` receipt, and a direct `pr` run
  without a receipt, and a reused pull request make no call, and the body is derived as today.
  `tracker.mode` is not read.
- **Supplied description.** It is used as is and gets no coverage section, because the issue scope
  names only derived bodies.
- **Reference forms.**
  - A cross-repository reference (`owner/repo#N`) or a non-forge key is not read, because only
    `#<N>` receipt items are collected.
  - A receipt item with relationship `closes` is not read.
  - A pull request number yields an `unreadable` entry.
- **Bounds.**
  - Beyond `ACCEPTANCE_SOURCE_BOUNDS.issues` references, the first ones are read and the rest get
    no section.
  - Beyond twenty criteria, the helper returns twenty with a note. Merge Gate's own bound then
    yields `undetermined`, which is unchanged behaviour.
- **Truncated or dropped criterion.** A criterion cut at `displayLineChars`, or an empty item, gets
  the not-covered phrase at its own ordinal and is never claimed. A duplicate item repeats the
  status of its first occurrence, so it is covered only when that occurrence is.
- **Criterion that needs a check result.** It always gets the not-covered phrase (known
  limitation).
- **Later pushes.** They do not refresh the section (known limitation).
- **Effectful criterion text.** `@`-mentions, issue keywords and marker comments are neutralized by
  `sanitizeField`, the paraphrase and the unchanged strip step.
- **Plan draft finish** (step 8 `Finalize plan draft:`). Its derived body passes through step 9, so
  the same rule applies.

## Acceptance criteria

- [ ] **Coverage section.** Outside hidden mode, a caller-supplied forge lifecycle receipt item
      with relationship `refs` for an issue with a trusted author and stated criteria gives a
      derived body (spawned draft or inline fallback) that contains a labelled sub-list for that
      reference and section. The sub-list has exactly one line per returned ordinal, in order, in the
      `<ordinal>. <paraphrase> — <status>` shape. The Body check rejects a body that does not
      match.
- [ ] **No false claims.** A criterion gets the literal not-covered phrase and is never marked
      covered when any of these holds:
  - the change does not cover it;
  - the drafter cannot show its coverage from the commits, the stat or the hunks read;
  - it is truncated or an empty item, or a duplicate whose first occurrence is not covered;
  - it needs a check result.

  A duplicate of a covered first occurrence repeats its covered status.

- [ ] **Today's body elsewhere.** The fragment is loaded and the clause applies only when the
      helper returned usable criteria. Hidden mode, an absent or `external` receipt and a direct run
      without a receipt make no `issue-acceptance-criteria` call, and a supplied description is used
      unchanged. A failed call adds exactly one step 12 line.
- [ ] **Merge Gate unchanged.** `git diff` of the implementing change shows no edit to
      `src/shared/merge-gate-issue-observation.md`. `pr-acceptance-sources` output is unchanged, as
      its existing tests show.
- [ ] **Helper tests.** `issue-acceptance-criteria` is read-only and returns no raw issue body and
      no criterion `text`. It applies the author trust gate and the existing bounds, isolates
      per-number failures, and returns raw ordinals. Unit tests in `test/remote-tracker.test.mjs`
      cover all of this.
- [ ] **Contract test.** A contract test in `test/workflow-contracts.test.mjs` fails if any of these
      is lost:
  - `pr.md` step 9's gated call;
  - its lazy-include pointer with the trigger;
  - the single-commit routing;
  - the step 12 line for a failed criteria read;
  - the gate paragraph of step 9, which names the receipt and the parse call and never mentions
    `tracker.mode`;
  - the fragment's brief addition, coverage rule (with its literal not-covered phrases and
    separator) or structural Body check clause.

  It also asserts that `pr.md` and the fragment never state the issue-matching heading rule:
  neither contains `Done criteria` or a numeric bound (3, 20, 64 KiB, 1000). The fragment's
  own PR-section heading `Acceptance criteria` / `Akzeptanzkriterien` stays allowed. The test
  also asserts the two verification-claim exemptions.

- [ ] **Counts.** Every rule and operation count in the docs and in `setup-allowlist.md` matches
      `claude-settings-core.mjs`.
- [ ] **CI.** The CI order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
      `pnpm test:distribution`.

## Validation plan

- **`test/remote-tracker.test.mjs`:** fake forge cases for each of these:
  - a trusted author with criteria returns ordinals and display texts, and no body or `text`;
  - an untrusted author returns `untrusted-author` with no criteria;
  - a body without the heading returns `headingFound: false`;
  - more than twenty criteria return twenty, with a note;
  - an over-long criterion returns `displayTruncated`;
  - empty and duplicate items keep raw ordinals with `dropped: true`, and a duplicate carries
    `duplicateOf`;
  - two matching criteria headings give two sections, each with ordinals restarting at 1;
  - more numbers than `ACCEPTANCE_SOURCE_BOUNDS.issues` return an `issues` note;
  - a 404 or a pull request number yields `unreadable` while the other numbers keep their criteria;
  - an authentication failure at the probe or `issueRead: false` fails the whole call, and only
    `COMMAND_FAILED`, `INVALID_PAYLOAD` and `TARGET_NOT_FOUND` become `unreadable`;
  - invalid input is rejected: missing, empty, duplicate or non-positive numbers, or an unknown key.
- **`pr-acceptance-sources` regression:** its existing tests in `test/remote-tracker.test.mjs` pass
  unchanged after the refactor.
- **`test/workflow-contracts.test.mjs`:**
  - add the contract test above, using the file's `source()`, `section()` and `prose()` helpers and
    naming the invariant it protects;
  - assert the `pr-criteria-coverage` pointer and its `when:` clause in that test, not in the
    merge-gate trigger table;
  - extend the read-set invariant test.
- **`test/model-tiers-contract.test.mjs`:** the pinned `pr/body-draft` Bounds text and spawn-site
  marker tests stay green.
- **`test/setup-allowlist-contract.test.mjs`** and **`test/effective-flow-state-harness.test.mjs`:**
  the rule count, the read-only list and the operation classification are consistent.
- **`node build.mjs`:** the `contextBudget` guard for `pr.md` passes, the spawn-site guard resolves
  `pr/body-draft` to its one row, and `shared/pr-criteria-coverage.md` is delivered in every target.
- **Behavioural evals:** `pnpm eval <suite> verify` for the five suites confirms that no suite loads
  `pr.md` or the new fragment, or the PR records the resulting evidence debt.
- **Manual run:** one `pr` run with a forge receipt against a real issue with trusted
  criteria. If that is not possible, a PR note records its absence as accepted
  evidence debt, because the static contract test cannot prove the behaviour of a model-drafted
  body.
- **Diff check:** a manual `git diff --stat` check that `src/shared/merge-gate-issue-observation.md`
  is untouched.

## Assumptions and open points

- Assumption (verified): `pr.md` reads no issue today and has no tracker-mode logic. The gate needs
  none: it tests the caller's receipt line, which `pr` already receives as a machine line
  (`src/tools/pr.md` line 118). The earlier decision "Remote tracker only" is superseded by the
  receipt gate decided in the deep review and was removed from the decisions block.
- Assumption (verified): `autopilot` and `plan-pr-continuation` carry no copy of the body rules.
  They pass `Refs #<N>` to `pr` (`src/shared/plan-pr-continuation.md` lines 316-318, and
  `scored-decisions` "Before `pr`"), so they inherit the rule unchanged.
- Assumption (verified): `sanitizeField` already removes closing keywords, mentions, footers and
  `<!--` from `displayText` (`src/scripts/autopilot-core.mjs` lines ~1915-1940).
- Assumption: a supplied description is out of scope. The issue names only the `pr/body-draft`
  brief and the inline and single-commit derivations.
- Assumption: a failed criteria read degrades to today's body, and step 12 reports it once. Merge
  Gate's `undetermined` surfaces the missing evidence later.
- Assumption: the `pr/body-draft` spawn keeps its `mechanical` tier. The coverage judgment it adds
  is bounded by the "covered only with a shown change" rule and by the structural check.
- Assumption (unverified): no behavioural eval suite loads `pr.md`. The validation plan checks
  this.
- No legacy plans are present in `docs/plan/`, so no legacy migration was skipped.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[
  {
    "site": "S-CLR",
    "question": "How should pr step 9 obtain a referenced issue's stated acceptance criteria?",
    "options": ["Deterministic helper operation", "Orchestrator prose extraction"],
    "scores": [
      { "label": "Deterministic helper operation", "score": 9, "reason": "Reuses the existing criteria extractor bounds and the author write-permission trust gate, so pr sees what Merge Gate judges without restating the heading set; its edge over prose extraction is determinism and a trust boundary." },
      { "label": "Orchestrator prose extraction", "score": 3, "reason": "Needs no script code but restates the owned heading set in pr.md on every run and hands the raw untrusted issue body to the orchestrator without the trust gate, the 20-criterion bound or sanitizing." }
    ]
  },
  {
    "site": "S-CLR",
    "question": "Which issues' criteria may pr feed into the body draft?",
    "options": ["Trusted authors only", "Any issue author as untrusted data"],
    "scores": [
      { "label": "Trusted authors only", "score": 8, "reason": "Reuses the acceptance lens write-permission trust rule, so outside authors never shape a published PR body and their issues keep today's body; the cost is one permission read and no coverage lines for outside contributors." },
      { "label": "Any issue author as untrusted data", "score": 4, "reason": "Widest coverage, but any outside author could steer coverage claims in a published body that the Merge Gate complete verdict relies on, and the body check strips effectful tokens, not manipulative paraphrase." }
    ]
  },
  {
    "site": "S-CLR",
    "question": "Should the Body check also enforce the coverage section's structure?",
    "options": ["Structural coverage check", "Draft rule only"],
    "scores": [
      { "label": "Structural coverage check", "score": 8, "reason": "Fits the existing Body check, which already enforces diff-free structure such as verbatim references, and extends the fallback path to delegated drafts, at the cost of one sentence on the eager core every pr run pays for." },
      { "label": "Draft rule only", "score": 5, "reason": "Cheaper on the eager core, but it trusts the leaf and inline paths, so a missing or reordered criterion line can reach step 10 unchecked, weakening the per-criterion guarantee the issue asks for." }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How should the plan handle a referenced issue criterion that needs a check result, which pr bodies cannot claim?",
    "options": ["Known limitation", "Point to verification block", "Verified separately status"],
    "scores": [
      { "label": "Known limitation", "score": 8, "reason": "Simplest and fails closed: it keeps the existing ban on verification claims and the unchanged gate rules, and it only leaves such issues undetermined, which is how they are closed by hand today." },
      { "label": "Point to verification block", "score": 5, "reason": "It could reach complete, but the Body check needs a new exception and the line can go stale after later pushes; a local verification block also does not prove criteria such as CI passes." },
      { "label": "Verified separately status", "score": 2, "reason": "It adds a status that is neither covered nor evidenced, so Merge Gate has to read it under new rules or treat it as not covered, and the claim it implies comes back in through a new label." }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How should the plan handle a coverage section that goes stale after later pushes?",
    "options": ["Known limitation", "Head OID label", "Refresh on later pushes"],
    "scores": [
      { "label": "Known limitation", "score": 7, "reason": "Fits the plan, which only creates evidence and leaves Merge Gate untouched; a stale not covered line falls back to today manual close, and Merge Gate only offers closure, so a stale covered claim still needs user consent." },
      { "label": "Head OID label", "score": 6, "reason": "Makes staleness visible to a human at closure time for little cost, but Merge Gate is not edited and never compares the OID, so it adds a body token and a Body check rule without changing any verdict." },
      { "label": "Refresh on later pushes", "score": 4, "reason": "The only option that keeps the evidence correct, but it reaches into iterate, merge-gate and apply-review push paths well beyond step 9 of pr, so it belongs in a follow-up issue rather than in this plan." }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How should the plan handle single-commit PRs when criteria were returned?",
    "options": ["Route to body-draft", "Keep inline path"],
    "scores": [
      { "label": "Route to body-draft", "score": 9, "reason": "Once criteria exist, the triviality exception no longer applies, since judging up to 60 criteria costs more than briefing a worker, and the existing leaf already has bounded hunk reads; it beats inline because it can actually show coverage." },
      { "label": "Keep inline path", "score": 3, "reason": "It is safe because uncovered criteria are marked not covered, but single-commit autopilot PRs would still mostly land at undetermined in Merge Gate, which defeats the goal of issue 795 for a common case and leaves a known gap." }
    ]
  },
  {
    "site": "S-BAT",
    "question": "Where should the new pr step 9 text live, given every pr run pays its eager core?",
    "options": ["Lazy-include fragment", "All eager in step 9"],
    "scores": [
      { "label": "Lazy-include fragment", "score": 8, "reason": "The coverage rules apply only after the helper returns trusted criteria, a real branch with a clear decision point, like verification-evidence, so most pr runs skip them; the cost is one more fragment and a contract test across two files." },
      { "label": "All eager in step 9", "score": 5, "reason": "Simplest to test and cannot be missed, but every pr run pays for the brief addition, the coverage format and the Body check clause, even hidden, external, unreferenced or supplied-description runs, which goes against rules 1 and 3." }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How should a failing read of one issue number in issue-acceptance-criteria be handled?",
    "options": ["Fail the whole call", "Per-number unreadable entry"],
    "scores": [
      { "label": "Fail the whole call", "score": 5, "reason": "Simplest and matches pr-acceptance-sources, but one mistyped reference such as Closes #N naming a pull request drops the coverage section for every valid issue, a poor fit for an advisory, degrade-to-today body step." },
      { "label": "Per-number unreadable entry", "score": 8, "reason": "Isolates realistic per-reference failures so the other issues keep their criteria while pr-acceptance-sources stays byte-identical; it should rethrow run-level errors like auth or UNSUPPORTED_CAPABILITY instead of repeating them per number." }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How should the plan align helper ordinals with Merge Gate ordinals when boundedCriteria drops empty or duplicate items?",
    "options": ["Accept and document", "Carry raw item position"],
    "scores": [
      { "label": "Accept and document", "score": 4, "reason": "The plan says each sub-list number equals the Merge Gate ordinal locator, so a known silent shift after a dropped empty or duplicate item breaks that contract even if rarely, and documenting the gap does not make the locator correct." },
      { "label": "Carry raw item position", "score": 9, "reason": "Taking the raw position from sectionListItems keeps the helper ordinal equal to how Merge Gate counts top-level items in prose, and pr-acceptance-sources stays unchanged; option 1 cannot match that because it keeps the shift." }
    ]
  },
  {"site": "S-DEC", "question": "Which condition enables the pr criteria read, given that a forge issue argument forces remote for the run whatever tracker.mode says?", "options": ["Keep remote gate", "Not external and not hidden", "Caller handoff line"], "scores": [{"label": "Keep remote gate", "score": 4, "reason": "Smallest change, but apply-issues and apply-review-remote mostly run on a forge issue argument that forces remote while tracker.mode may be unset, so the main receipted Refs paths stay incomplete and the goal is only partly met"}, {"label": "Not external and not hidden", "score": 4, "reason": "Covers argument-forced runs, but it turns on forge issue reads in local and unset modes, against the tracker-target contract that only a resolved forge target reaches the forge; the degrade path softens but does not remove that"}, {"label": "Caller handoff line", "score": 8, "reason": "Ties the read to callers that actually resolved the forge target, so argument-forced runs and configured remote both work; pr already trusts caller machine lines such as the lifecycle receipt, and it beats both gates on correctness at small extra contract cost"}]},
  {"site": "S-DEC", "question": "How should the plan handle a repeated criterion item, which the helper drops and pr marks not covered, so an issue repeating one item can never reach complete?", "options": ["Mirror first occurrence", "Known limitation"], "scores": [{"label": "Mirror first occurrence", "score": 7, "reason": "Merge Gate counts every top-level list item as its own ordinal needing a covered locator, and the helper dedups by identical normalized key, so mirroring the first status is sound and keeps complete reachable for a modest field, rule and tests cost."}, {"label": "Known limitation", "score": 5, "reason": "It is simpler, fails safely, and repeated items are rare and fixable by editing the issue, but it leaves a silent dead end where an otherwise fully covered issue can never reach complete, which defeats the goal of issue 795."}]},
  {"site": "S-DEC", "question": "How should the plan surface a failed criteria read that degrades silently to today's body, hiding allowlist drift on installs lacking the new allow rule?", "options": ["Step 12 report line", "Stay silent and document"], "scores": [{"label": "Step 12 report line", "score": 8, "reason": "It makes drift visible during the run for the cost of about one eager line (pr is at 520 of 522, so contextBudget needs a bump). A denied unlisted rule shows up as a tool denial, not a helper code, so the line must name either."}, {"label": "Stay silent and document", "score": 4, "reason": "A note in tools-deliver.md does not tell anyone at runtime that coverage was dropped. Users only find it after Merge Gate reports undetermined, so the drift stays hidden on the installs this point is about."}]},
  {"site": "S-DEC", "question": "How does pr step 9 validate the caller lifecycle receipt that gates the criteria read and bind it to the resolved repository?", "options": ["Helper takes the receipt line", "pr calls receipt-parse first", "Literal check only"], "scores": [{"label": "Helper takes the receipt line", "score": 6, "reason": "Reuses parseIssueLifecycleReceipt in one call, but it moves receipt parsing into a forge read operation and replaces the planned closed cwd plus numbers input, which widens the helper contract and its tests."}, {"label": "pr calls receipt-parse first", "score": 8, "reason": "Follows the shared receipt rule to use the parse operation rather than ad hoc parsing, binds it to the slug pr already gets from step 5 repository-resolve, and leaves the criteria helper as planned; the extra call is local and cheap."}, {"label": "Literal check only", "score": 2, "reason": "Violates issue-lifecycle-receipt.md, which treats the receipt as untrusted and requires helper parsing, and leaves cross-repository, malformed and duplicate receipts unchecked before forge reads."}]},
  {"site": "S-DEC", "question": "How should the plan handle an empty top-level criterion item, which Merge Gate counts but the helper drops?", "options": ["Known limitation", "Render as covered-by-nothing marker"], "scores": [{"label": "Known limitation", "score": 8, "reason": "Fails closed and keeps Merge Gate unedited, and complete needs a covering-statement locator per criterion; an empty item is rare, the user can fix it by editing the issue, and manual close still works."}, {"label": "Render as covered-by-nothing marker", "score": 2, "reason": "A status the gate counts as covered, with no covering statement behind it, is the false coverage claim the PR body must not make, and Merge Gate would only accept it under a new rule, which needs a Merge Gate edit."}]},
  {"site": "S-DEC", "question": "How should the helper projection handle an issue with several matching criteria sections?", "options": ["Per-section ordinal", "Several sections yield no criteria", "Continuous ordinals"], "scores": [{"label": "Per-section ordinal", "score": 8, "reason": "Matches the Merge Gate locator, the criterion ordinal within its section, without editing Merge Gate. Cost: ordinals must be counted before dedupe and the cap in boundedCriteria, and each section needs its own sub-list label."}, {"label": "Several sections yield no criteria", "score": 6, "reason": "Fails closed and is simple, with no wrong locators. But an issue with both Acceptance and Done criteria loses its mapping and falls back to the old body, which leaves Merge Gate stuck at undetermined for a legitimate layout."}, {"label": "Continuous ordinals", "score": 2, "reason": "Running positions past the first section contradict the Merge Gate locator. An operator would look up the wrong criterion, which defeats the purpose of the projection."}]},
  {"site": "S-DEC", "question": "Which per-number error codes should issue-acceptance-criteria turn into an unreadable entry?", "options": ["Catch three codes", "Catch two codes"], "scores": [{"label": "Catch three codes", "score": 8, "reason": "GitHub issue-read goes through normalizeIssue, which rejects a pull request with INVALID_PAYLOAD. Input is validated before the per-number loop, so catching it only isolates odd provider replies while other refs keep their criteria."}, {"label": "Catch two codes", "score": 4, "reason": "A trusted receipt makes a pull request number rarer but still possible. With this option one such number or bad reply wipes every reference criteria and falls back to the old body with one line, a poor trade for a small gain in noise."}]}
]
```

<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    2 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    4 |
| Testability     |        0 |         0 |    3 |
| Scope           |        0 |         0 |    2 |
| Maintainability |        0 |         0 |    1 |

### Findings

Earlier rounds found, and the plan incorporated, per-number failure isolation, a token-checkable
coverage format, raw Merge Gate ordinals, the receipt-based requirement wording, the contract-test
placement of the pointer, scoped verification-claim exemptions and the column-0 lazy-include
pointer. This round decided the three open points and judged the persisted plan anew:

- **Architecture (Note):** the former tracker-mode gate rested on a false premise, because a forge
  issue argument forces `remote` whatever `tracker.mode` says. Incorporated: the gate is the
  caller's forge lifecycle receipt, with no `tracker.mode` read and no caller edit.
- **Architecture (Note):** the receipt was used without validation or a repository binding.
  Incorporated: one `issue-lifecycle-receipt-parse` call with the resolved slug, and the numbers
  come from the parsed `refs` items.
- **Error cases (Note):** a repeated criterion item could never reach `complete`. Incorporated: the
  helper carries `duplicateOf` and `pr` mirrors the first occurrence's status; the structural check
  enforces it.
- **Error cases (Note):** a failed criteria read degraded silently and hid allowlist drift.
  Incorporated: one step 12 line for a failure of the call itself.
- **Error cases (Note):** an empty list item blocks `complete`. Recorded as an accepted fail-closed
  known limitation.
- **Error cases (Note):** several matching criteria sections made raw positions run on, unlike Merge
  Gate's per-section locator. Incorporated: per-section ordinals with a section index and sub-list
  labels.
- **Error cases (Note):** the per-number catch of `INVALID_PAYLOAD` could mask a provider
  regression. Kept deliberately, so one odd reply does not drop every other reference.
- **Testability (Note):** the contract test now also asserts the step 12 line and that the gate
  paragraph never mentions `tracker.mode`.
- **Scope (Note):** a reused pull request gets no coverage section. Added to the known limitations.
- **Maintainability (Note):** a superseded decision still named a tracker-mode gate. Incorporated:
  its record was removed from the decisions block, and wording that said silent degradation was
  corrected.

## Open points

- No open points.

## Build completion

**Requirement:** When a caller-supplied forge lifecycle receipt references issues (`refs` `#<N>`)
that state acceptance criteria, the body `pr` derives in step 9 carries one coverage line per
criterion, so Merge Gate can reach `complete`. Everything else stays as today.

**Architecture decisions:** Implemented as planned:

- the read-only remote-tracker operation `issue-acceptance-criteria`, over the shared per-issue
  function `acceptanceIssueSource(context, number)`;
- per-number isolation of only `COMMAND_FAILED`, `INVALID_PAYLOAD` and `TARGET_NOT_FOUND`;
- raw per-section ordinals, with `dropped`, `duplicateOf` and `duplicateOfSection`;
- a gate in `pr.md` step 9 on the receipt, checked with one literal
  `issue-lifecycle-receipt-parse` call;
- the lazy fragment `src/shared/pr-criteria-coverage.md`;
- one step 12 line for a failed criteria read.

`src/shared/merge-gate-issue-observation.md` is untouched.

No deviation from the plan remains. An item that repeats one from an _earlier section_ also
carries `duplicateOfSection`, the section of its first occurrence, next to `duplicateOf`, and
`pr` mirrors that line's status like a same-section repeat.

**Affected files:**

- `src/scripts/remote-tracker-core.mjs`
- `src/scripts/claude-settings-core.mjs` (82 read-only rules, 49 remote-tracker reads)
- `src/shared/setup-allowlist.md`
- `src/shared/pr-criteria-coverage.md` (new)
- `src/shared/model-tiers.md`
- `src/tools/pr.md` (`contextBudget` 527, built 525)
- `test/remote-tracker.test.mjs`
- `test/workflow-contracts.test.mjs`
- `docs/developer-guide/architecture.md`
- `docs/developer-guide/build-system.md`
- `docs/developer-guide/configuration.md`
- `docs/developer-guide/subagent-progress-coverage.md`
- `docs/user-guide/tools-deliver.md`
- `docs/user-guide/tools-setup.md`

`src/scripts/remote-tracker.mjs` needed no change, because it dispatches every operation
generically.

**Implementation details:**

- The criteria walk records each item's section and raw position.
- `acceptanceIssues` rebuilds its entries in the old key and note order, so the output of
  `pr-acceptance-sources` is unchanged.
- The new operation also accepts the dispatcher's own selection keys (`repository`, `remote`,
  `provider`, `teaLogins`, `probe`).
- A `dropped` entry carries `displayText: null`.
- The fragment words the separator as an em dash with one space on each side.

**Test results:**

- New tests:
  - 14 `issue-acceptance-criteria:` unit tests;
  - a contract test that `pr` maps referenced issue acceptance criteria into the derived body;
  - an extended read-set invariant test.
- Phase 5 full run (CI order through the project runner):
  - `node build.mjs` and `pnpm test:distribution` passed.
  - `pnpm agent:check` flagged only this plan file, a pre-existing formatting issue fixed in the
    completion step.
  - `pnpm test` reported 13 failing and 4 cancelled timing/process tests. All were in files the
    change does not touch, and the runner was at 6/6 load.
  - A targeted base run proved one timeout pre-existing. The other identities passed on base and
    then passed on the unchanged candidate, so no code change was needed.
- Phase 7 final validation was targeted at the delta since the Phase 5 tree, plus the earlier
  failing identities by file:
  - 1191 and 373 tests passed.
  - `node build.mjs` and `pnpm test:distribution` passed.
  - `pnpm agent:check` flagged only this plan file, as before.
- Behavioural eval verification and the manual `pr` run with a real receipt were not performed.
  They remain evidence debt for the pull request.

**Review result:** `effective-flow-nodejs-reviewer` reported 5 Notes. F1, F2, F4 and F5 were
fixed in one incorporation pass, and a scoped re-check confirmed them with no new findings. F3
(a repeat from an earlier section lacked a pointer to its first occurrence) was fixed by carrying
that occurrence's section as `duplicateOfSection`. No findings were offloaded.

## Review findings

**Date:** 2026-11-27
**Reviewer:** effective-flow-nodejs-reviewer

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     5 |
| Open / Not implemented |     0 |

All five Notes are fixed; F3 was fixed by carrying the first occurrence's section on a
cross-section repeat.
