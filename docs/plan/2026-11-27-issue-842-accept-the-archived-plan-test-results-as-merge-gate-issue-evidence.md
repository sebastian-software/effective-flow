# Accept the archived plan test results as merge-gate issue evidence

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)
**Issue:** #842

## Requirement

After a merge, merge-gate's Phase 5.5 issue observation records an acceptance criterion as covered
only with "the locator of the covering statement in the merged pull request's title or body"
(`src/shared/merge-gate-issue-observation.md`, step 3). A criterion that is a mechanical check, such
as a command that must print nothing, can be verified only by a result. The `pr` body check forbids
verification and test-result claims in the body, and only `build`, `fix` and `refactor` produce a
verification block. A `docs` pull request, or one from any other workflow that produces no
verification block, therefore never gives the observation a verified result to point at. The
criterion stays unmatched, the verdict is `undetermined`, and no done offer is made, even when the
workflow ran the check and recorded the result in the plan's `## Test results` section.

Goal: the observation also accepts one more source as covering evidence. That source is the
`## Test results` / `## Testergebnisse` section of an archived plan, and it counts only when all of
the following hold:

- the plan file is part of the merged pull request's changed paths;
- it lies directly under `<plan.dir>/archive/`;
- its `**Issue:**` header names the observed issue;
- the pull request passes the existing source-trust gate.

The locator for this source is the archived plan path plus its section heading in the observation
report. The step 4 offer shows "archived plan" plus an ordinal into the helper's admitted list
instead, because the file name of an issue-sourced plan embeds a slug of the third-party issue
title. The rest of the verdict logic stays as it is, with one addition: an admitted recorded result
that contradicts a criterion makes that criterion observably unmet (`incomplete`). A criterion that
no admitted source covers keeps the verdict `undetermined`, and the observation still quotes no
issue text.

Workflow rationale: **Feature**. The change adds a new read-only remote-tracker helper operation and
widens what the observation may accept as evidence, so merge-gate behaves differently after a merge.
It is more than correcting one wrong rule, because a new evidence channel and its trust, bounds and
locator form have to be built. Ticking task-list checkboxes is a separate issue and out of scope.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #842 (autopilot run `ap-20261127T184125Z-35dd4d95`, issue-sourced).
**Original outcome:** The post-merge observation can find an issue's mechanical criterion covered
when it is backed by the archived plan's recorded test results in the merged diff, bound to the same
issue. Without such a plan, or with a plan for another issue, the verdict is unchanged. No new
quoting of issue text and no weakening of the input-trust boundary.
**Last evaluated attempt:** none (fresh baseline).
**No-progress count:** 0
**Cumulative approach:** One read-only helper operation that supplies admitted archived-plan
evidence, one prose rule in `merge-gate-issue-observation.md` that consumes it, and pointers and
docs aligned to that rule.
**Continuation decision:** none.

## Architecture decisions

- **A deterministic read-only helper selects the evidence, and the model judges coverage.** A new
  forge-read operation `pr-merged-plan-evidence` in `src/scripts/remote-tracker-core.mjs` decides
  mechanically which archived plans are admitted and returns their bounded test-results sections as
  data. Matching a criterion to a recorded result stays the observation's judgment, exactly as it is
  for the title and body today. This keeps the admission rules testable with fixtures (acceptance
  criterion (b)) and keeps the Phase 5.5 reads bounded, instead of letting the model run ad-hoc diff
  or file reads after the merge.
- **The changed paths come from the forge's pull-request file listing.** The plan blobs are read at
  the pull request's merge commit (decided by score, see "Decided by score"). The listing still works
  after the head branch is deleted, works for squash, merge-commit and rebase merges, and works in
  observer-only mode. A rebase merge's first-parent diff, by contrast, would miss an earlier commit's
  archive move. The listing is paginated and bounded. If it is truncated or fails, the helper admits
  no plan. It never admits a partial guess.
- **Plan evidence passes the existing source-trust gate** (decided by score). The helper admits plan
  text only when `pullRequestSourceTrust` holds: the pull request is same-repository and its author
  has a permission in `SOURCE_TRUST_PERMISSIONS`. This is the same rule that `pr-acceptance-sources`
  applies to plan text a pull request carries. An untrusted or unreadable permission admits nothing.
  Observer-only mode can observe pull requests merged outside merge-gate, so a merge alone is no
  proof that the plan text was vetted.
- **The rule is owned once, in `merge-gate-issue-observation.md`** (decided by score). Step 3 there
  states the extended evidence rule and the locator form. The two duplicated sentences in
  `src/shared/issue-post-merge-observation.md` (the `complete` verdict condition and the offer-locator
  wording) become a pointer to that step's evidence locators. This follows AGENTS.md "state a
  contract once" and avoids growing the duplicate.
- **Admission is purely structural and mirrors existing contracts.** A plan is admitted only when all
  of the following hold:
  - its changed path, or for a rename its new path, passes the existing path-safety rules
    (`isSafePlanPath` and the `PATH_UNSAFE_CHARACTERS` check that `validateAppendixPlanPath` uses in
    `src/scripts/remote-tracker-core.mjs`), lies directly under `<plan.dir>/archive/` and ends in
    `.md`. Only listed paths under the `<plan.dir>/archive/` prefix become candidates at all. A
    candidate's path is validated before any git read and before it can appear in the report;
  - the plan was archived by this pull request (decided by score). Its change status is `added`, or
    it is `renamed` and `planArchivePath(previousPath, planDir)` equals its path. A `modified`
    archived plan or an archive-to-archive rename is rejected as `not-archived-here`: its test
    results were recorded by an earlier pull request against an earlier tree;
  - its blob at the merge commit is at most `ACCEPTANCE_SOURCE_BOUNDS.planBytes`;
  - it carries exactly one canonical implemented status marker (Plan status convention);
  - it has exactly one `**Issue:** #<N>` header line before the first `##` heading, the same rule
    `src/shared/plan-pr-continuation.md` applies, and `<N>` equals the observed forge issue;
  - it has exactly one test-results section with non-blank content, within a fixed section bound.
    The headings are taken from the `Test results` row of the exported `PLAN_CONTRACT_MAPPING`
    (`## Test results` / `## Testergebnisse`), not written out again. Lines are read through the
    fence-aware line inventory that `classifyPlanText` uses, so a heading inside a code fence does
    not count. The section ends at the next heading of level 1 or 2. Two such headings are rejected
    as `test-results-ambiguous`. An oversized section is rejected, never cut to a prefix, as
    `pr-acceptance-sources` treats an oversized plan; a cut-off section could hide a failing line.

  Each rejected candidate is returned with a closed reason. No rejected candidate ever becomes
  evidence.
- **The plan parsers are shared, not copied, and the layering stays acyclic.** `parseIssueHeader`
  lives in `src/scripts/plan-publication-core.mjs`, which imports `remote-tracker-core.mjs`, so
  importing it from there would create a cycle. Add a non-throwing classifier to
  `src/scripts/plan-lint-core.mjs`, for example `readIssueHeader(text)`, returning either the issue
  number or `null`, or an error of `invalid` or `ambiguous`. That module imports only Node built-ins
  and already owns the `**Issue:**` contract row, and the classifier does its own line splitting.
  `parseIssueHeader` stays in `plan-publication-core.mjs` as a thin wrapper over the classifier. It
  keeps throwing `PlanPublicationError('ISSUE_HEADER_INVALID')` with the same messages, so its
  callers' `instanceof PlanPublicationError` handling and the asserted error envelopes are
  unchanged. The helper maps the classifier result straight onto `issue-header-invalid` and
  `issue-header-ambiguous`, and the status marker is read through the exported `classifyPlanText`.
  The classifier keeps today's precedence: the first malformed line yields `invalid` before any
  duplicate check.
- **Step 4 revalidation reuses step 3's admission** (decided by score). Step 4 re-reads, per
  confirmed issue, everything that can change while its loop writes, and the pull-request text is
  one of those things. The admitted plan blobs are read at the immutable merge commit, and the
  merged pull request's file list cannot change. Step 4 therefore re-applies step 3's rules to the
  fresh title, body and issue basis together with step 3's helper result, states why this input
  differs from the editable pull-request text, and keeps its pinned bounds unchanged.
- **The offer shows an ordinal, and the report shows the path** (decided by score). Step 4's offer
  listing must carry no text an attacker could steer, and an issue-sourced plan file name embeds a
  slug of the third-party issue title (`UNATTENDED_PLAN_NAME` in `src/scripts/plan-lint-core.mjs`).
  The offer locator for a plan source is therefore "archived plan" plus the ordinal of that plan in
  the helper's admitted list, matching the existing criterion-ordinal locator. The full path and
  section heading appear only in the Phase 6 observation report item.
- **A contradicting recorded result makes the criterion unmet** (decided by score). When an
  admitted test-results section records the criterion's check as failing, the criterion is
  observably unmet and the verdict is `incomplete`, with that criterion named. This holds whatever
  the title or body claims. A step that ends in a close offer must not let a body claim outweigh the
  workflow's own recorded failure.
- **External tracker issues get no plan evidence.** The `**Issue:** #<N>` header names a forge issue
  of this repository. For an issue that a receipt targets on an external tracker, plan evidence is
  never admitted, and its verdict is computed as today.

## Affected files

| File | Description |
|---|---|
| `src/scripts/remote-tracker-core.mjs` | Add the read-only forge operation `pr-merged-plan-evidence`: operation list, `CAPABILITY_BY_OPERATION` entry (`pullRequestRead`), input validation (`cwd` as the verified `RUNTIME_STATE_ROOT`, `number`, the observed forge `issues` as unique positive integers capped at a named bound like `ACCEPTANCE_SOURCE_BOUNDS.issues`, `planDir`, `hiddenMode`), the source-trust gate, the paginated file-listing read, merge-commit blob reads, structural admission, closed rejection reasons and named bounds in `truncated`. Reuse `pullRequestSourceTrust`, `isSafePlanPath`, the `PATH_UNSAFE_CHARACTERS` check, `acceptanceEnsureCommit`, and the `plan-lint-core.mjs` parsers instead of copying them. |
| `src/scripts/plan-lint-core.mjs` | Add the non-throwing `**Issue:**` header classifier so that `remote-tracker-core.mjs` can import it without a cycle. |
| `src/scripts/plan-publication-core.mjs` | Reimplement `parseIssueHeader` as a thin throwing wrapper over that classifier, with the same error code and messages, so its callers and tests stay unchanged. |
| `src/scripts/remote-tracker-github-core.mjs` | Command plan for the pull-request file listing (paginated, cap-aware) and for exposing the merge commit OID the operation needs. |
| `src/scripts/remote-tracker-forgejo-core.mjs` | Same command plans for Forgejo/Gitea through the existing `tea api` transport. |
| `src/scripts/claude-settings-core.mjs` | Add the new operation to the read-only `remote-tracker` allow-list set. |
| `src/shared/remote-tracker-operations.md` | One reference row (class, required and optional inputs, output keys, failure notes) for the new operation, kept in the format `test/remote-tracker-operations-reference.test.mjs` checks. |
| `src/shared/merge-gate-issue-observation.md` | Step 3: name the admitted archived-plan test-results section as an accepted evidence locator, add the one helper call to the fixed read bounds, and keep `undetermined` for every unmatched criterion. Step 3: an admitted contradicting result makes the criterion `incomplete`, and a helper truncation is not a hit bound. Step 4: the offer locator becomes title, body, or "archived plan" plus its admitted-list ordinal, and revalidation reuses step 3's helper result with its reason stated, keeping its pinned bounds. `### Observation report items`: the locator with the archived plan path plus section heading, and the per-run helper outcome. |
| `src/shared/issue-post-merge-observation.md` | Replace with pointers to merge-gate's observation steps 3 and 4: the duplicated covering-statement condition (verdict, ~line 93), the offer-locator wording (~lines 157-158), the pull-request read bound (~line 78) and the revalidation basis "the pull request's title and body" (~line 165). |
| `test/remote-tracker-operations-reference.test.mjs` | Add one `FIXTURES` entry for the new operation, in operation-list order. Its minimal input carries a non-empty `issues` and no `hiddenMode: true`, so that it reaches the runner. |
| `test/remote-tracker.test.mjs` | Fixture tests for the new operation with stubbed forge and git processes (see "Validation plan"). |
| `test/workflow-contracts.test.mjs` | Contract test that pins, in `merge-gate-issue-observation.md`, the new evidence rule, its four admission conditions, the ordinal locator in step 4 and the path locator in `### Observation report items`, the contradiction rule, the truncation-is-not-a-hit-bound rule, step 4's reuse of the helper result, the per-run helper-outcome report item, and the unchanged `undetermined` fallback. It also pins the pointers in `issue-post-merge-observation.md`. The existing step 4 bound assertion (~lines 13603-13615) and the revalidation assertion (~lines 13617-13646) stay green unchanged. |
| `docs/user-guide/tools-deliver.md` | Update the covering-evidence and locator descriptions (~lines 662 and 1422) with the archived-plan variant. |
| `docs/user-guide/remote-tracker.md` | Update the completion condition (~line 1132) and the locator description (~lines 1142-1143), and list the new operation where the operations are listed. |
| `docs/developer-guide/architecture.md`, `docs/developer-guide/configuration.md`, `docs/user-guide/tools-setup.md` | Update the read-only operation count from 49 to 50 and the list where one is given (~lines 1146, 135 and 282). |

## Implementation details

### Approach

1. **Helper operation.** Implement `pr-merged-plan-evidence` as one bounded composite forge read.
   Before any forge or git read, `hiddenMode: true` or an empty `issues` list returns at once with
   no plans, because hidden-mode plans never sit in a pull-request diff.
   1. Make one pull-request read and require it to state merged with a merge commit OID. A pull
      request that is not merged returns a closed `not-merged` result with no plans.
   2. Apply the source-trust gate: `sameRepository` and one author-permission read. An untrusted
      pull request returns `trust: untrusted` with no plans.
   3. List the pull request's changed files through the new adapter command plan. The helper counts
      pages itself with a fixed page and file bound, and does not rely on unbounded `--paginate`.
      It detects truncation in two ways: a hit bound, or a listed total below the pull-request
      payload's stated changed-file count (`changed_files` on GitHub, the equivalent field on
      Forgejo/Gitea). GitHub stops silently at 3000 files. A truncation returns the bound in
      `truncated` and admits nothing.
   4. Select as candidates only the listed paths under the `<plan.dir>/archive/` prefix; every
      other listed path is ignored and never echoed. Validate each candidate with the path-safety
      rules. More candidates than a fixed candidate bound admit nothing, and the bound is named in
      `truncated`.
   5. Validate the forge-supplied values first. Run `requireAcceptanceBranch(context, <base
      branch>, 'merge')`, and require the merge commit OID to match `GIT_OBJECT_NAME`, failing
      closed with `INVALID_PAYLOAD`. Then make the merge commit present with
      `acceptanceEnsureCommit(context, <merge commit OID>, <base branch>, 'merge')`, which fetches by
      object name first and falls back to the branch. A merge commit still absent after that call,
      when it returns `false`, is a closed error envelope. Do not use `acceptanceFetchBase`, whose tip
      check fails with `base-moved` when the base branch moves after the merge. Size all candidates
      in one `git cat-file --batch-check` call at that commit, following the existing batch-check
      pattern. A missing or non-blob entry becomes `blob-missing`, and the size feeds `oversized`.
      Only then read the remaining blobs.
   6. Apply the structural admission rules from "Architecture decisions".
   7. Return, per observed issue, the admitted plans in a stable order with `path`, `section` (the
      exact heading), `sectionLine` and the complete section text. That order defines the ordinal
      the step 4 offer uses. Rejected candidates are listed once per candidate, not per issue.
      `other-issue` is used only when the header names none of the observed issues. An `unsafe-path`
      entry never carries the path. Each rejection has a `reason` from a closed set:
      - `unsafe-path`, `outside-archive`, `removed`, `unsupported-status`, `not-archived-here`;
      - `oversized`, `section-oversized`, `blob-missing`;
      - `status-not-implemented`;
      - `issue-header-missing`, `issue-header-ambiguous`, `issue-header-invalid`, `other-issue`;
      - `no-test-results`, `test-results-ambiguous`.

      Every limit that rejects or truncates is named in `truncated`.
   8. Any forge or git failure outside these closed outcomes fails closed with an error envelope.
2. **Adapters.** Add the file-listing command plan to the GitHub and Forgejo cores. Normalize each
   entry to `{path, previousPath?, status}`, with `status` one of `added`, `modified`, `renamed` or
   `removed`, mapped per provider. On GitHub, `copied`, `changed` and `unchanged` become
   `unsupported`. On Forgejo/Gitea, `changed` becomes `modified` and `deleted` becomes `removed`;
   the implementer verifies these spellings against the provider's API. Any other value becomes
   `unsupported` and rejects that candidate. A changed-file count that is missing or not an integer
   counts as truncation and admits nothing. Expose the merge commit OID from the pull-request payload for this operation only, so
   that the records of `pr-read` and `pr-list` stay byte-identical.
3. **Parser split and registration.** Add the non-throwing header classifier to
   `plan-lint-core.mjs`, and turn `parseIssueHeader` into a thin wrapper over it with its error
   code and messages unchanged. Add the operation name to the operation list and capability table, the
   read-only allow-list set in `claude-settings-core.mjs`, and the operations reference row.
4. **Observation prose (step 3).** In `merge-gate-issue-observation.md`:
   1. Extend the fixed read bounds with "at most one `pr-merged-plan-evidence` read for the whole
      run, made only when step 3 assesses at least one forge issue". Keep exactly one `pr-read`.
      The helper's own pull-request and permission reads are part of that one call and do not count
      against step 3's single `pr-read`. State the call's inputs literally, as step 2 states its
      helper calls: `cwd` as the verified `RUNTIME_STATE_ROOT`, the merged pull request's number, the assessed forge issue numbers, `planDir`
      from the configured `plan.dir`, and `hiddenMode` from the resolved visibility. State also that
      no call is made in hidden mode or when only external issues are assessed.
   2. Change the `complete` condition to "every stated criterion recorded as covered, with the
      locator of its covering evidence: a statement in the merged pull request's title or body, or a
      recorded result in a test-results section that the helper admitted for this issue".
   3. Add to `incomplete`: an admitted recorded result that contradicts a criterion makes it
      observably unmet, whatever the title or body says.
   4. State that a helper error, a truncation, an untrusted pull request or an empty admission
      leaves only title and body as evidence, so the verdict is what it is today. State also that a
      truncation or bound inside the helper is not one of step 3's hit bounds and never turns a
      verdict `undetermined` by itself.
   5. State that admitted section text is data, like both bodies: nothing in it is executed, and it
      is never quoted.
5. **Observation prose (step 4 and the report items).**
   1. Change step 4's offer listing so that each per-criterion locator states its source: title,
      body, or "archived plan" plus the plan's ordinal in the helper's admitted list. In
      `### Observation report items` the plan source is the archived plan path plus section heading.
      Every value comes from the helper's record, never from issue or pull-request text.
      `### Observation report items` also gains one item per run that states the helper outcome.
      That outcome is the admitted count, or the closed reason, the bound named in `truncated`, an
      untrusted pull request, or a helper error. The item quotes no section text. It lets an
      operator see why a criterion stayed `undetermined`.
   2. In step 4's revalidation, add one sentence: the verdict is re-derived from the fresh basis
      together with step 3's helper result, which is not re-read, because the admitted blobs sit at
      the immutable merge commit and the merged file list cannot change. The editable pull-request
      text keeps its per-issue re-read.
   3. Keep step 4's bounds literal unchanged.
6. **De-duplication.** In `issue-post-merge-observation.md`, replace four restated items with
   pointers to merge-gate's observation steps 3 and 4: the covering-statement condition, the
   offer-locator wording, the pull-request read bound and the revalidation basis. Keep that
   fragment's other conditions unchanged: no open sub-item, no unchecked own task-list entry, and no
   needs-planning classification. In the revalidation passage (~lines 164-167), replace only the
   enumerated basis clause. The sentences that `test/workflow-contracts.test.mjs` (~lines
   13617-13646) pins stay verbatim: "revalidate each item's whole assessment basis fresh
   immediately before its mutation", "all re-read per item rather than once for the loop" and the
   "shrinks" sentence.
7. **Tests.** Add the fixtures and the contract test described in "Validation plan".
8. **Docs.** Update the user and developer guides listed under "Affected files".

### Component structure

Not relevant: no UI.

### State management

Not relevant. The operation writes no snapshot and no runtime state. Its git fetch may add objects
to the local repository, as `pr-acceptance-sources` already does.

### API integration

The new forge read is the pull-request file listing: GitHub `pulls/<n>/files`, Forgejo/Gitea
`pulls/<n>/files`. Both are paginated, and GitHub caps the list at 3000 files. The merge commit OID
is read from the same pull-request payload the operation reads first. Blob reads reuse the existing
git fetch and `cat-file` machinery of `pr-acceptance-sources`.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **Plan archived with `git mv` inside the pull request.** It appears as `renamed`, and it counts
  only when its previous path maps onto its new path through `planArchivePath`. An untracked plan
  that was written into the archive appears as `added`.
- **Archived plan only touched by this pull request**, for example by a formatting or link fix, or
  renamed from one archive path to another. It is rejected as `not-archived-here`, because its
  results belong to an earlier pull request. A follow-up pull request that re-records results in an
  already archived plan therefore stays `undetermined`, which is the safe outcome.
- **Archived plan for a different issue, or with two `**Issue:**` lines.** It is rejected as
  `other-issue` or `issue-header-ambiguous`, and the verdict is unchanged.
- **Plan in `<plan.dir>/archive/` that the pull request did not change.** It is not in the listing,
  so it is never a candidate. Evidence must come from the merged diff.
- **Several admitted plans for one issue.** Each is an admitted source. The offer locator names the
  covering plan by its ordinal, and the report names its path.
- **Squash, merge-commit and rebase merges.** The listing is the pull request's own file list, and
  blobs are read at the merge commit that landed on the base branch.
- **Merge commit not fetchable.** The operation returns a closed error envelope, and the verdict
  falls back to title and body only.
- **Blob missing at the merge commit.** That candidate is rejected as `blob-missing`.
- **More archive candidates than the candidate bound.** No plan is admitted, and the bound is named
  in `truncated`.
- **Fork pull request, or author without a trusted permission.** `trust: untrusted` admits no plans.
- **File listing over its bound.** It is named in `truncated` and admits nothing. A truncation never
  counts as a hit bound that turns the verdict to `undetermined` by itself: the verdict is then
  computed from title and body alone, exactly as today.
- **Test-results section present but empty.** It is rejected as `no-test-results`.
- **Test-results section over its bound.** It is rejected as `section-oversized` and never cut to a
  prefix.
- **Listed path with unsafe characters, or a provider file status outside the supported set.** That
  candidate is rejected (`unsafe-path`, `unsupported-status`) before any git read. An `unsafe-path`
  entry carries no path, so the path never reaches the report.
- **Malformed `**Issue:**` line**, such as a cross-repository reference. It is rejected as
  `issue-header-invalid`, and the operation itself still succeeds.
- **Base branch moving after the merge.** The merge commit is fetched by object name, so a moving
  tip neither fails nor changes the read.
- **Author permission changing during step 4's loop.** The admission is not re-read. The plan text
  already landed at the merge commit under the permission step 3 verified.
- **Recorded result that contradicts the criterion**, for example the check printed output. The
  criterion is observably unmet and the verdict is `incomplete`, even when the title or body claims
  coverage.
- **External tracker issue in the receipt.** No plan evidence is admitted for it.
- **Hidden visibility mode.** No plan evidence is admitted.

## Acceptance criteria

- [ ] `src/shared/merge-gate-issue-observation.md` step 3 names the archived plan's test-results
      section as an accepted evidence locator. It names all four conditions: the plan is in the
      merged diff, it lies under `<plan.dir>/archive/`, its `**Issue:**` names the observed issue,
      and the source-trust gate passes. An admitted contradicting result yields `incomplete`, and a
      helper truncation is not a hit bound. Step 4's offer uses the "archived plan" ordinal locator,
      `### Observation report items` uses the path plus section heading and states the per-run
      helper outcome, and step 4's revalidation states that it reuses step 3's helper
      result, with its bounds literal unchanged. Step 3 still yields `undetermined` for a criterion
      no admitted source covers. A new contract test in `test/workflow-contracts.test.mjs` asserts
      all of this, and the existing step 4 bound and revalidation assertions pass unchanged.
- [ ] `src/shared/issue-post-merge-observation.md` no longer restates any of four items: the
      title-or-body covering rule, the offer-locator wording, the pull-request read bound and the
      revalidation basis. It points to merge-gate's observation steps 3 and 4 instead. The contract
      test asserts both the absence and the pointers.
- [ ] The new fixtures for `pr-merged-plan-evidence` in `test/remote-tracker.test.mjs` pass:
  - a docs pull request whose archived plan, bound to the issue, records the mechanical result is
    admitted with path, section heading and the complete section text;
  - the plan is admitted both when it is `added` and when it is `renamed` from its top-level path;
  - there is one fixture per closed rejection reason, plus `not-merged`. Among them, each of these
    admits nothing:
    - no archived plan in the listing;
    - a plan for another issue;
    - an unchanged archived plan;
    - a `modified` archived plan or an archive-to-archive rename;
    - a missing, empty, duplicated or oversized test-results section;
    - a test-results heading only inside a code fence;
    - an unsafe path, or an unsupported file status;
    - a malformed `**Issue:**` line;
    - a blob missing at the merge commit;
    - an untrusted pull request;
    - a listing truncated by its bound, by a count mismatch, or by a missing changed-file count;
    - more archive candidates than the candidate bound;
    - hidden mode;
  - with two observed issues, a plan for one of them is admitted for that issue and is not listed
    as `other-issue` for the other;
  - an unsafe base branch, a malformed merge commit OID, a merge commit absent after the fetch, or
    a failing forge or git step returns an error envelope.

  These fixtures cover issue criterion (b) at the admission level. The coverage verdict itself
  stays the observation's model judgment, and the contract test pins its fallback (see
  "Assumptions and open points").
- [ ] With `parseIssueHeader` turned into a wrapper over the new classifier, the existing
      `plan-publication` tests pass with no change to their assertions. These include the asserted
      `ISSUE_HEADER_INVALID` envelopes in `test/plan-publication.test.mjs` and
      `test/plan-publication-git.test.mjs`. A unit test pins the classifier's results: issue
      number, `null`, `invalid` and `ambiguous`. It also pins today's precedence: a malformed line
      yields `invalid` even when a valid duplicate is also present.
- [ ] The operation is registered in the operation list, the capability table, the read-only
      allow-list set and `src/shared/remote-tracker-operations.md`. The registration and reference
      tests pass with the new `FIXTURES` entry in
      `test/remote-tracker-operations-reference.test.mjs`.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass, in this
      order.

## Validation plan

- Unit fixtures in `test/remote-tracker.test.mjs` use the existing stubbed-process pattern of the
  `pr-acceptance-sources` and `issue-acceptance-criteria` tests:
  - the admitted case (renamed into `archive/`, `**Issue:** #<N>` matching, `## Test results`
    present);
  - each rejection reason from the closed set;
  - the two "verdict unchanged" cases from the issue, with no archived plan and with another issue,
    asserting that no plan is admitted for the observed issue;
  - trust, truncation, `not-merged` and hidden mode;
  - a failing forge or git step, asserting an error envelope rather than partial output.
- A contract test in `test/workflow-contracts.test.mjs` names the invariant it protects. It pins the
  new evidence rule and its conditions in step 3, the contradiction rule, the
  truncation-is-not-a-hit-bound rule, the ordinal locator in step 4 and the path locator in
  `### Observation report items`, the unchanged `undetermined` fallback, and the pointers in
  `issue-post-merge-observation.md`.
- `test/remote-tracker-operations-reference.test.mjs`, the allow-list contract tests and
  `test/effective-flow-state-harness.test.mjs` confirm registration.
- `node build.mjs`: confirm through the `Always-loaded core` report that no eager budget changed.
  Both fragments are lazy, so `contextBudget` lines should stay as they are. If one did change,
  adjust only that tool's line.
- Run `pnpm eval merge-gate verify` (read-only) and report the merge-gate evidence debt that editing
  these sources creates, under the pragmatic test and release policy. No new eval scenario is part
  of this plan.
- CI order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.

## Assumptions and open points

- Assumption (verified context): the observation is prompt-driven and no script computes the verdict
  today. `pr-acceptance-sources` is the closest precedent for changed-path and blob reads, but it
  needs the head branch and is not used in Phase 5.5.
- Assumption: GitHub and Forgejo/Gitea both serve the pull-request file listing for merged pull
  requests, with rename status and new path. The implementer confirms the exact payload fields
  against the existing adapter conventions.
- Assumption: the exact numeric bounds (pages, files, candidates, section bytes) follow
  `ACCEPTANCE_SOURCE_BOUNDS` where an equivalent exists, and are otherwise fixed literals named in
  `truncated`. They carry no configuration key.
- Assumption: `pr-criteria-coverage.md` (plan #795) already maps criteria to covered pointers in
  derived pull-request bodies. It makes no result claim and is unchanged here, and this plan adds
  the result-bearing channel it deliberately lacks.
- Residual gap, deliberately accepted: issue criterion (b) asks for a fixture in which the
  criterion "yields covered". In this repository no unit test runs a model, so no deterministic
  test can prove the coverage judgment itself. This plan meets (b) at the admission level: the
  fixtures prove which evidence the observation receives, and the contract test proves that an
  unmatched criterion stays `undetermined`. The pull request's criteria mapping should say this
  instead of claiming end-to-end coverage. A merge-gate behavioural eval scenario was the scored
  alternative and is not part of this plan. A later run can add one if the residual gap matters.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->
```json
[
  {
    "site": "S-CLR",
    "question": "Which trust gate applies to an archived plan's test-results evidence from the merged pull request?",
    "options": ["Reuse the PR source-trust gate", "Treat merged content as trusted"],
    "scores": [
      { "label": "Reuse the PR source-trust gate", "score": 9, "reason": "Reuses the one shared trust function; observer-only mode sees pull requests merged outside merge-gate, so a merge alone does not prove the plan text was vetted, which outweighs one permission read." },
      { "label": "Treat merged content as trusted", "score": 3, "reason": "Saves one read but adds a second trust rule beside pullRequestSourceTrust and weakens the input-trust boundary for evidence that can feed a terminal-transition offer." }
    ]
  },
  {
    "site": "S-CLR",
    "question": "Where does the new helper take the merged pull request's changed paths from?",
    "options": ["Forge pull-request file listing", "Git diff of the merge commit", "Git diff from the PR head"],
    "scores": [
      { "label": "Forge pull-request file listing", "score": 9, "reason": "Works after head-branch deletion, for squash, merge-commit and rebase merges and in observer-only mode, and reads plan blobs at the merge commit that landed; it costs one paginated adapter read per forge and fails closed at the file-listing cap." },
      { "label": "Git diff of the merge commit", "score": 3, "reason": "Reuses existing git machinery, but a rebase merge's first-parent diff covers only the last rebased commit and would silently miss an earlier archived plan." },
      { "label": "Git diff from the PR head", "score": 5, "reason": "Mirrors pr-acceptance-sources but depends on the head ref surviving, derives the merge base differently per merge method and reads blobs at the head rather than the merged result." }
    ]
  },
  {
    "site": "S-CLR",
    "question": "How far does the plan take the fixture coverage for acceptance criterion (b)?",
    "options": ["Helper fixtures plus contract test", "Also add a merge-gate eval scenario"],
    "scores": [
      { "label": "Helper fixtures plus contract test", "score": 8, "reason": "Meets the fixture wording deterministically for the admitted case and every rejected case, pins the prose rule, and follows the pragmatic test and release policy, which only requires the existing eval debt to be reported." },
      { "label": "Also add a merge-gate eval scenario", "score": 5, "reason": "Gives end-to-end evidence for the model-mediated coverage judgment but exceeds the criterion and commits the plan to hand-recorded fresh-session runs plus scenario upkeep." }
    ]
  },
  {
    "site": "S-CLR",
    "question": "How does the plan keep the two copies of the covering-evidence rule consistent?",
    "options": ["Own it in merge-gate-issue-observation", "Amend both copies"],
    "scores": [
      { "label": "Own it in merge-gate-issue-observation", "score": 8, "reason": "Both fragments load together only at merge-gate Phase 5.5 and the issue names this file, so stating the rule once with a pointer follows the state-a-contract-once rule and cuts loaded length." },
      { "label": "Amend both copies", "score": 5, "reason": "Smallest consistent change, but grows a known duplicate in three places, raising drift risk and the length paid on every Phase 5.5 run." }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How does step 4's per-issue revalidation treat the archived-plan evidence?",
    "options": ["Reuse step 3's helper result", "Re-read per confirmed issue", "Re-read once for the confirmation loop"],
    "scores": [
      { "label": "Reuse step 3's helper result", "score": 9, "reason": "Step 4 re-reads what can change between writes, while the admitted plan blob at the immutable merge commit and the merged pull request's file list cannot, so reuse keeps the pinned bounds at no cost to safety, provided step 4 states why this input differs from the editable pull-request text." },
      { "label": "Re-read per confirmed issue", "score": 5, "reason": "Works and matches the whole-basis wording literally, but adds one helper call and one permission read per issue plus a test change mainly to re-read immutable content." },
      { "label": "Re-read once for the confirmation loop", "score": 3, "reason": "Refreshes nothing that could have changed and introduces a once-per-loop read pattern into a step whose prose explicitly rejects it for the pull-request text." }
    ]
  },
  {
    "site": "S-BAT",
    "question": "Which change statuses of an archived plan may supply evidence?",
    "options": ["Only archived in this pull request", "Also changed test results", "Keep current rule, show status"],
    "scores": [
      { "label": "Only archived in this pull request", "score": 9, "reason": "Matches the issue scenario and the planArchivePath archive contract and fails closed on stale archived plans touched for unrelated reasons; unlike the next option it needs no merge-base derivation or extra blob read, and a rare re-recording follow-up safely stays undetermined." },
      { "label": "Also changed test results", "score": 5, "reason": "Covers re-recording but adds a merge-base derivation that is fragile across merge methods plus an extra blob read, and changed section text still does not prove the results match this merge." },
      { "label": "Keep current rule, show status", "score": 2, "reason": "Keeps admitting stale evidence into the terminal-transition offer and leaves staleness to the operator, against the fail-closed evidence contract." }
    ]
  },
  {
    "site": "S-DEC",
    "question": "How does an admitted recorded result that contradicts a criterion affect the verdict?",
    "options": ["Contradiction makes it incomplete", "Plan evidence only adds coverage", "Contradiction makes it undetermined", "Decide later"],
    "escape": ["Decide later"],
    "scores": [
      { "label": "Contradiction makes it incomplete", "score": 8, "reason": "A recorded failing result from an admitted plan is the existing observably-unmet case and blocks the close offer whatever the title or body claims; its edge over undetermined is the correct label, since both are treated alike." },
      { "label": "Plan evidence only adds coverage", "score": 2, "reason": "Leaves the gap open: a body claim could still yield complete and a close offer while the admitted plan records the same check as failing." },
      { "label": "Contradiction makes it undetermined", "score": 7, "reason": "Equally safe and names the conflict, but files a recorded failure under could-not-be-matched when the evidence shows the criterion unmet." }
    ]
  },
  {
    "site": "S-DEC",
    "question": "What does step 4's offer locator show for an archived-plan source?",
    "options": ["Ordinal in the offer, path in the report", "Keep the validated path", "Decide later"],
    "escape": ["Decide later"],
    "scores": [
      { "label": "Ordinal in the offer, path in the report", "score": 8, "reason": "Keeps the offer free of steerable text and matches the existing criterion-ordinal locator, at the cost of a less direct pointer before confirming and a departure from the issue's literal path-plus-section wording." },
      { "label": "Keep the validated path", "score": 4, "reason": "Satisfies the issue wording, but the file name embeds a slug of the third-party issue title, so word-steerable text would reach the confirmation prompt step 4 keeps clean." }
    ]
  }
]
```
<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area | Critical | Important | Note |
|---|---:|---:|---:|
| Architecture | 0 | 0 | 2 |
| Security | 0 | 0 | 1 |
| Data protection | 0 | 0 | 0 |
| Error cases | 0 | 1 | 2 |
| Testability | 0 | 0 | 2 |
| Scope | 0 | 0 | 0 |
| Maintainability | 0 | 0 | 1 |

### Findings

Deep plan review (2026-11-27, plan-review). Every finding is incorporated, and nothing blocks
implementation.

- Error cases, Important: a recorded failing result in an admitted plan could not stop `complete`
  when the title or body claimed coverage. It now makes the criterion `incomplete`, decided by score.
- Security, Note: an issue-sourced plan file name embeds a slug of the issue title, so the path
  would have reached step 4's confirmation prompt. The offer now shows "archived plan" plus an
  ordinal, and the path appears only in the report, decided by score.
- Testability, Note: the operations reference test needs a fixture entry for the new operation, and
  that file is now listed.
- Architecture, Note: `cwd` and the validation and bound of `issues` were missing from the helper's
  inputs. Both are added.
- Error cases, Note: the candidate-bound overflow, a merge commit still absent after the fetch, and
  the echoing of non-plan paths were under-specified. They now admit nothing, return an error
  envelope, and are never echoed, respectively.
- Error cases, Note: a helper truncation could have been read as one of step 3's hit bounds. Step 3
  now states that it is not, and the contract test pins this.
- Maintainability, Note: the header classifier's precedence of `invalid` over `ambiguous` is now
  stated and unit-tested.
- Testability, Note: the acceptance criteria now require one fixture per closed rejection reason,
  plus `not-merged`, matching the validation plan.
- Architecture, Note: the shape of rejections is defined: once per candidate, with `other-issue`
  only when the header names none of the observed issues.

### Review history (2026-11-27, plan)

Result at that time: Approved

#### Summary

| Area | Critical | Important | Note |
|---|---:|---:|---:|
| Architecture | 0 | 0 | 2 |
| Security | 0 | 2 | 0 |
| Data protection | 0 | 0 | 0 |
| Error cases | 0 | 0 | 2 |
| Testability | 0 | 0 | 1 |
| Scope | 0 | 0 | 0 |
| Maintainability | 0 | 1 | 1 |

#### Findings

Internal review (2026-11-27, plan). Every finding is incorporated.

- Maintainability, Important: moving the `**Issue:**` header parser would have changed its error
  class and the asserted envelopes, and could not tell an invalid header from a repeated one. A
  non-throwing classifier now lives in `plan-lint-core.mjs`, with `parseIssueHeader` kept as an
  unchanged throwing wrapper.
- Security, Important: the forge-supplied base branch and merge commit OID would have reached git
  unvalidated. Approach 1.5 now runs `requireAcceptanceBranch` and the `GIT_OBJECT_NAME` check
  before any fetch, and fixtures cover both.
- Security, Important: a `modified` archived plan or an archive-to-archive rename would have
  admitted results from an earlier pull request. Admission is now limited to plans archived by this
  pull request, decided by score.
- Error cases, Note: `blob-missing` could not occur with the reused blob reader. Candidates are now
  sized with one `cat-file --batch-check` call first.
- Architecture, Note: the file-status mapping and the Forgejo/Gitea changed-file count were
  under-specified. Both are now mapped per provider, and a missing count counts as truncation.
- Maintainability, Note: the test-results headings were hard-coded and fence handling was
  unspecified. The headings now come from `PLAN_CONTRACT_MAPPING`, a fence-aware inventory is used,
  the section end is defined, and duplicate headings are rejected.
- Architecture, Note: the helper call's inputs were unstated and the hidden-mode check came after
  the reads. The inputs are now named in step 3, hidden mode and an empty issue list return before
  any read, and the State management wording is corrected.
- Testability, Note: the de-duplication would have touched sentences that an existing contract test
  pins. Those sentences now stay verbatim, and the test is named as staying green.
- Error cases, Note: the report did not say why no plan evidence was used. A per-run report item
  now states the helper outcome.

## Open points

- No open points.
