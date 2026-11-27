# Keep the merge-gate associated plan when it exists only on the PR head

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #814

## Requirement

merge-gate drops a verified `Associated plan:` line whenever the plan file is missing from the
local checkout. The common case is an autopilot or build pull request that `git mv`s its own plan
into `<plan.dir>/archive/` on the delivery branch. Before the merge, that archived path exists
only on the pull-request head. After a forge merge the local checkout is still not updated.
Today the caller in `src/tools/merge-gate.md` (lines 285–291) resolves the line through
`plan-reference-resolve` against the checkout only, gets `not-found` and drops the line. The
delegated run therefore never sees the plan. After the merge, the next-step selection in
`src/shared/next-steps.md` (lines 120–133) cannot offer the plan's external review report as a
candidate.

Goal: when the checkout lookup returns `not-found`, the caller makes one more read-only attempt
against the pull-request head commit. That attempt applies the same `<plan.dir>/` or
`<plan.dir>/archive/` containment and exactness rules, and changes no checkout. A line that passes
it stays on and records the head it was verified against. The delegated run's backstop and the
post-merge report read then use that same commit. Every other failure still drops the line, as
it does today.

Workflow rationale: this is a **Bugfix**. A verified association is lost through a resolution gap
in existing behaviour. No new user-facing capability is introduced, and the change is a bounded
fallback in an existing helper plus its prose consumers.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #814
**Original outcome:** When a verified merge-gate plan association exists only on the PR head, the `Associated plan:` line is kept and validated against that head. A path present on neither the checkout nor the head, or outside `<plan.dir>/` and `<plan.dir>/archive/`, is still dropped. The fallback reads only the head commit and changes no checkout. A fixture test covers the head-only plan.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** fresh baseline: an optional head-commit fallback in `plan-reference-resolve`, plus the merge-gate caller, Entry and next-steps prose that pass and consume the verified head
**Continuation decision:** none

## Architecture decisions

- **The head check lives in `plan-reference-resolve` as an optional `headSha` input.** This was
  decided by score (S-CLR, see "Decided by score"). The helper already owns path-form
  normalisation, the `<plan.dir>/` and archive containment rule, the exactness flag and status
  classification. `src/scripts/effective-flow-mechanics-core.mjs` already injects a Git runner
  (`git(runner, cwd, args)` near line 236). A second operation would duplicate the path-form
  validation, and prose-only Git calls would restate the contract at two sites.
- **The fallback applies to the path form only, and only after the checkout returns
  `not-found`.** The `Associated plan:` line always carries a repository-relative path, and the
  path form is the one form that is exact by construction. Number, slug and file-name references
  keep their checkout-only behaviour. A `headSha` given together with one of them is
  `INVALID_INPUT`. An `outside-plan-dir` result never reaches the head read.
- **The helper reads local objects only and never fetches.** This was decided by score (S-CLR).
  Before its second call, the caller runs the same ref-free fetch that the delegated run's
  ancestry check already uses: `git fetch --no-write-fetch-head --refmap= origin
  refs/pull/<N>/head`, rooted in `RUNTIME_STATE_ROOT`. That keeps the mechanics core's "every
  operation is a computation or a read" contract, mirroring `base-branch-resolve` and
  `base-branch-fetch`. It also covers forks and heads pushed from another machine. Every
  head-read Git call runs with `GIT_NO_LAZY_FETCH=1`, so a partial clone never fetches a missing
  tree or blob on demand. This is the guard `config-resolve-core.mjs` (line 313),
  `verification-evidence-core.mjs` (line 610) and `pr-delivery-git-core.mjs` (line 117) already
  use.
- **The verified head travels with the line as `Associated plan: <path>; head=<sha>`.** This was
  decided by score (S-CLR). Entry step 2 runs before Entry step 4 re-reads the pull-request state,
  so a backstop that derived its own head would need an extra read or a reorder. A push in
  between could also make the two checks disagree. Carrying the pair lets the caller, the Entry
  backstop and the post-merge report read check the same commit. A line without `; head=` keeps
  its exact current meaning, a checkout-resolved plan.
- **No working tree is read or changed for the head path.** The helper reads the tree entry and
  blob with `git ls-tree` and `git cat-file` against the commit. It uses a `:(literal)` pathspec
  and a byte-exact name comparison, the repository's literal-pathspec convention
  (`src/shared/plan-archival.md`). It does not copy the component-by-component tree walk of
  `src/scripts/conflict-validation-core.mjs` (lines 1348–1358) and imports no other core.
- **A head-validated plan is reading basis only, never an invocation argument.** This was
  decided by score (S-BAT). Its path does not exist in the local checkout before the merge, nor
  after a forge merge until the user pulls. One rule in `next-steps` step 2 therefore covers both
  step-3 reconciliation (`plan <known-plan-path>`) and the delegated-run draft row's
  `<plan-file>`. The motivating `apply <report>` candidate is unaffected, because its argument
  is the report path.
- **The contract is stated once.** The criteria stay in the eager core of `merge-gate.md`. The
  delegated-run fragment keeps its by-reference backstop, as `test/workflow-contracts.test.mjs`
  (lines 5380–5400) enforces. The developer guide documents the new input and fields beside the
  existing outcome list.

## Affected files

| File | Description |
|---|---|
| `src/scripts/effective-flow-mechanics-core.mjs` | `planReferenceResolve`: accept an optional `headSha` key. After a path-form checkout `not-found`, verify the commit (reusing `resolveCommit`) and the exact literal tree entry at that head, check the blob size bound (`MAX_PLAN_BYTES`, imported from `plan-lint-core.mjs`), then classify the blob's status. Give `git()` and `resolveCommit()` an optional trailing `env` parameter, which is unchanged when omitted, so the head reads carry `GIT_NO_LAZY_FETCH=1`. Return `resolved` with `exact: true`, `location` `top` or `archive` (the existing values), and the added fields `source: "head"` and `headSha`. Leave every other outcome and every call without `headSha` unchanged. |
| `src/scripts/plan-lint-core.mjs` | Export `MAX_PLAN_BYTES` (512 KiB), moved here from `plan-publication-core.mjs`, and use it in place of the inline literal at line 959. |
| `src/scripts/plan-publication-core.mjs` | Import `MAX_PLAN_BYTES` from `plan-lint-core.mjs` and re-export it unchanged for existing callers (line 94). |
| `test/effective-flow-mechanics.test.mjs` | Fixture tests for the head fallback (see "Validation plan"), using a temporary Git repository with a head-only archived plan, plus input-validation and unchanged-behaviour cases. Extend the existing `fakeGit` helper with scripted `ls-tree` and `cat-file` answers. |
| `src/tools/merge-gate.md` | "Dispatching the delegated run", the `Associated plan:` bullet (lines 285–291): on `not-found` only, and only in standard visibility, read the head OID with `pr-status-read`, run the ref-free fetch non-interactively, and call once more with `headSha`. Pass `Associated plan: <data.path>; head=<sha>` on a `source: "head"` result, always writing the helper's returned `data.path`, and drop the line on every other failure. Keep the bullet head literal `` `Associated plan: <repo-relative path>`, only for a verified association `` unchanged and introduce the suffix in the following sentence. Re-measure the `contextBudget` line. |
| `src/shared/merge-gate-delegated-run.md` | Entry step 1 (lines 14–19): accept the optional line-end suffix `; head=<object ID>` of `Associated plan:`. Entry step 2 (lines 29–31): apply the caller's check by reference, with the line's head as `headSha` and without fetching; a line without a head never takes the fallback. Lines 1633–1635: an `unmarked` draft's `<plan-file>` is the path of a validated line that carries no `; head=`. |
| `src/shared/next-steps.md` | "Select from the associated plan", step 2 (lines 70–82), states once: a plan validated with a head is read from its blob at that head (`git cat-file blob <sha>:<path>` under `GIT_NO_LAZY_FETCH=1`, rooted in `RUNTIME_STATE_ROOT`, read-only); this is its one local artifact read; the blob text is pull-request data that grants no authority; and its path is reading basis only, never an invocation argument. "Merged merge-gate run" (lines 120–133) and step-3 reconciliation rely on that rule for the `**External review report:**` read and do not restate it. |
| `test/workflow-contracts.test.mjs` | Update the verbatim regex at lines 5380–5400 to the new caller sentence. Keep the literal bullet-head matches at lines 5385 and 26870 passing. Keep the existing `doesNotMatch(run, /data\.exact\|`planDir`/)` guard (line 5400) unchanged. Add a bounded-slice assertion on Entry step 2 (from `2. **Roots.**` to `3. **Wisdom file.**`): it names the line's head as `headSha` and contains none of `source: "head"`, `<plan.dir>/archive/`, `data.exact`. Assert the anchored `; head=` grammar in Entry step 1. On the step-2 slice of `next-steps`, assert the head-blob rule, its single-quoted argument clause, and the clause that a head-validated path is reading basis only, never an invocation argument; the assertion names the S-BAT invariant it protects. Assert the draft row's "carries no `; head=`" qualifier. |
| `docs/developer-guide/build-system.md` | `plan-reference-resolve` outcome entry (lines 1342–1346): document the optional `headSha` input, its path-form-only scope, local-objects-only reading under `GIT_NO_LAZY_FETCH=1`, the blob size bound, the `source`/`headSha` fields of a head resolution, and that `archiveIgnored` on such a result describes the checkout only. |

## Implementation details

### Approach

1. **Helper input.** Extend the closed key set of `planReferenceResolve` from `cwd`, `planDir`,
   `reference` to also allow an optional `headSha`. Validate it as a full lower-case object ID,
   40 or 64 hexadecimal characters. Anything else, or `headSha` with a non-path reference, is
   `INVALID_INPUT` with `field: "headSha"`.
2. **Checkout first.** Run the existing path-form logic unchanged: normalisation, `.md`
   completion, the `outside-plan-dir` check and the `singleEntry` lookup. A checkout hit returns
   exactly today's `resolved` object, without `source`, whether or not `headSha` was supplied.
3. **Head fallback.** On a path-form `not-found` with `headSha`, every Git call below runs with
   `GIT_NO_LAZY_FETCH=1`, so that a missing object becomes `not-found` or `COMMAND_FAILED` and
   is never fetched. The core's `git()` wrapper (line 236) and `resolveCommit()` (line 258) pass
   no `env` today, so both gain an optional trailing `env` parameter. When it is omitted, the
   runner call is byte-for-byte the same as today. The head fallback passes
   `{ GIT_NO_LAZY_FETCH: '1' }`; the runner spreads it over `process.env`
   (`src/scripts/process-runner.mjs`):
   - check that the commit exists locally by reusing `resolveCommit(runner, cwd, headSha)` and
     requiring the returned OID to equal `headSha`. A null result is `not-found`;
   - read the tree entry with `git ls-tree -z <sha> -- ':(literal)<path>'`, the path relative to
     `cwd`, so a `cwd` below the top level stays correct. Pattern characters in `plan.dir` or the
     file name are never globbed, and `core.quotePath` never quotes the name. Require exactly one
     entry whose name equals the requested path byte for byte, of type `blob` with mode `100644`
     or `100755`. A missing entry is `not-found`; a symlink (`120000`), tree or gitlink is
     `not-found` as well, never followed;
   - check the blob size with `git cat-file -s <blob OID>` against 512 KiB, the plan-file limit
     `MAX_PLAN_BYTES`. The mechanics core may not import its current owner
     `src/scripts/plan-publication-core.mjs` (line 94), because that module is not a leaf
     (`test/effective-flow-mechanics.test.mjs` line 621). Per
     `docs/adr/mechanics-helpers-import-owning-cores.md`, the symbol therefore moves to a named
     export of the leaf `src/scripts/plan-lint-core.mjs`, which already uses the same literal
     inline at line 959 and switches to the export. `plan-publication-core.mjs` imports it back
     and re-exports it for its existing callers, and the mechanics core imports it from
     `plan-lint-core.mjs`. No local copy is added. The separate copy in `autopilot-core.mjs`
     (line 168) stays out of scope. A larger blob is `not-found`. Only then read it with
     `git cat-file blob <blob OID>` and classify it with `classifyPlanText`;
   - return `resolved` with `path` (the same repository-relative path), `location` (`top` or
     `archive`, the values a checkout resolution uses), `status`, `statusReason`, `exact: true`,
     `archiveIgnored` (which describes the checkout only), `source: "head"` and `headSha`.
4. **Runner failures.** A Git failure outside the allowed exits of `resolveCommit` and the
   missing-entry case is `COMMAND_FAILED` through the existing `git(...)` wrapper. The caller
   already drops the line on `ok: false`.
5. **Caller prose (`merge-gate.md`).** Rewrite the bullet's resolution sentence so that it still
   says: before every dispatch, re-dispatches included, or an inline run, resolve through
   `plan-reference-resolve` with the same `cwd` and `planDir`, and pass only on `resolved` with
   `data.exact` inside `<plan.dir>/` or `<plan.dir>/archive/`. Add one compact clause: on
   `not-found` only, and only in standard visibility, take the head OID from a `pr-status-read`,
   run the ref-free fetch rooted in `RUNTIME_STATE_ROOT` non-interactively
   (`GIT_TERMINAL_PROMPT=0`), with the host command tool's timeout set to 60 seconds (the
   `UPSTREAM_FETCH_TIMEOUT_MS` value in `src/scripts/delivery-selection-core.mjs`, line 1944).
   An expired timeout counts as a failed fetch. Then call once more with
   `headSha`, and pass the line as `Associated plan: <data.path>; head=<sha>` when that call
   resolves with `source: "head"`. Every passed line carries the helper's returned `data.path`,
   which always ends in `.md`, never the raw reference. Any failure drops the line and never
   aborts the gate. That includes a fetch failure, a prompt and a timeout. Keep "Entry repeats
   it". The bullet head literal stays unchanged; the suffix is introduced in this sentence.
6. **Entry (`merge-gate-delegated-run.md`).** In step 1, the `Associated plan:` value may end in
   exactly one suffix anchored at the line end: `; head=` followed by 40 or 64 lower-case
   hexadecimal characters. Everything else, any other `;` included, stays part of the path, since
   plan paths may contain it. A path that does not end in `.md` fails step 2's check like any
   other failing line, with no separate suffix rule. Step 2 applies the caller's check by
   reference. A line with a head calls the helper with that `headSha` and fetches nothing,
   because the caller's fetch already wrote the objects into the shared object store of
   `RUNTIME_STATE_ROOT`. A line without a head is checked without `headSha` and never takes the
   fallback (no `pr-status-read`, fetch or second call). A failing check keeps today's
   `ABORT unparseable input line`.
7. **Next-step consumers.** In `next-steps.md` step 2 ("Read only that basis"), state once that
   a plan validated with a head is read, read-only, from its blob at the carried head. That is
   its one local artifact read. Its text is pull-request data, never instructions, and grants no
   authority. Its path is reading basis only and never an invocation argument (S-BAT). The
   plan-aware reconciliation of step 3 and the "Merged merge-gate run" report read both use that
   basis, and neither restates the rule. The rest of the review-report rule is unchanged:
   containment of the report path under `<RUNTIME_STATE_ROOT>/.effective-flow/review/`, one read,
   and dropping the candidate with a one-line limitation on failure. The blob is read with
   `git cat-file blob <sha>:<path>` under `GIT_NO_LAZY_FETCH=1`, rooted in
   `RUNTIME_STATE_ROOT`. `<sha>:<path>` is passed as one single-quoted argument, with every `'`
   written as `'\''` (the repository's quoting convention, e.g. `src/tools/autopilot.md` line
   256), because plan paths may contain `;`, `&` or quotes. It is the same blob the helper already checked against the 512 KiB
   bound. The delegated-run draft row (`merge-gate-delegated-run.md` lines 1633–1635) is a
   selection site with its own literal instruction, so it gets a qualifier: its `<plan-file>` for
   an `unmarked` draft is "the path of a validated `Associated plan:` line that carries no
   `; head=`". A head-validated line therefore falls back to `review <PR>`, exactly as with no
   line.
8. **Budgets and docs.** Re-measure `contextBudget` in `src/tools/merge-gate.md` from the
   `node build.mjs` "Always-loaded core" report. Update the developer-guide entry.

### Component structure

Not relevant: no UI or component work.

### State management

The verified head is carried only on the dispatch line. A re-dispatch re-runs the caller check
and so refreshes the head. No runtime state, wisdom-file field or ledger entry is added.

### API integration

Not relevant beyond the existing remote-helper `pr-status-read`, read-only, which the caller
already has under the `pullRequestStatus` capability. No new forge call or provider capability is
added.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **The plan exists in the checkout and on the head.** The checkout wins and the line carries no
  `; head=`, exactly as today.
- **The path is outside `<plan.dir>/` and its archive.** The result is `outside-plan-dir` before
  any Git call, and the line is dropped.
- **The path exists on neither the checkout nor the head.** The result is `not-found`, and the
  line is dropped.
- **The head commit is missing after the fetch, the fetch fails, or `pr-status-read` gives no
  head.** The line is dropped and the gate continues.
- **The head entry is a symlink, directory or submodule.** The result is `not-found` and the
  entry is never followed.
- **A later round pushes a new head.** The next dispatch re-validates and carries the new head.
  After the merge, the report read uses the objects of the last dispatch's verified head. Those
  stay in the local object store after the merge, whatever the merge method, squash and rebase
  included. The read never goes to the base.
- **An explicit association in file-name or slug form, or `plan.dir` set to `.`.** The head
  check covers the path form only. A name-form reference, or a top-level `data.path` with no
  slash under `plan.dir` `.`, is read as name form, and `headSha` with it is `INVALID_INPUT`.
  When the checkout lacks the plan, the line is dropped. Both are accepted fail-closed
  limitations, outside the issue's exact-path scope. A fake-runner test pins the `plan.dir` `.`
  case.
- **The checkout archive is unusable (`archiveIgnored: true`).** The head fallback still reads
  only the commit. The checkout result for an archive path stays `not-found` with
  `archiveIgnored: true`, and the head result keeps that flag.
- **Hidden mode.** Plans there are untracked runtime files below `.effective-flow/`, so a head
  lookup cannot match. The caller skips the whole head fallback (no `pr-status-read`, fetch or
  second call) and drops the line on `not-found`, as today.
- **The head blob exceeds 512 KiB.** The result is `not-found` and the line is dropped.
- **The plan path contains `;`, `&`, quotes or glob characters.** The literal pathspec and the
  byte-exact name comparison keep the lookup exact. Only a line-end `; head=<ID>` is read as the
  suffix.
- **The head content comes from a fork or another author.** It feeds only read-only next-step
  advice. Its report path is honoured only under the existing containment rule.
- **The head-validated plan is `Implemented` (archived).** That is the expected status. The
  status is reported as is and does not gate the association.

## Acceptance criteria

- [ ] `plan-reference-resolve` with a path reference and `headSha` returns `resolved` with
      `exact: true`, `location: "archive"`, `source: "head"`, `headSha` and the blob's status
      for a plan present only at that commit inside `<plan.dir>/archive/`. The fixture
      repository's `.git/index` hash, `HEAD`, `git for-each-ref` output, working-tree status
      (taken with `git --no-optional-locks status --porcelain`) and `FETCH_HEAD` are unchanged
      after the helper call (a fixture test in `test/effective-flow-mechanics.test.mjs`).
- [ ] The same helper returns `not-found` for a path absent from both the checkout and the head,
      for a head symlink entry and for a head blob over 512 KiB. It resolves a head path holding a
      glob character exactly, and a glob reference that matches only a differently named head
      file is `not-found`. Every head-read Git call carries `GIT_NO_LAZY_FETCH=1`. It returns `outside-plan-dir` for a path outside `<plan.dir>/` and
      its archive, with no Git call made. It returns `INVALID_INPUT` for a malformed `headSha` or
      a `headSha` with a non-path reference. Calls without `headSha` return exactly their current
      results (all fixture or fake-runner tests).
- [ ] `src/tools/merge-gate.md` states the checkout-first check, the `not-found`-only,
      standard-visibility head fallback (`pr-status-read`, non-interactive ref-free fetch, second
      call), and the `Associated plan: <path>; head=<sha>` line. It also states that every failure
      drops the line. `merge-gate-delegated-run.md` Entry admits only the anchored line-end suffix
      and re-checks with it. Its draft row takes `<plan-file>` only from a line without
      `; head=`. `next-steps.md` step 2 reads a head-validated plan from its blob as data
      without authority, and its path is reading basis only, never an invocation argument. All
      of this is asserted in `test/workflow-contracts.test.mjs`, which also keeps its existing
      single-source guard.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass in
      CI's order.

## Validation plan

- Unit tests in `test/effective-flow-mechanics.test.mjs`:
  - a real temporary Git repository whose head commit holds `docs/plan/archive/<name>.md` while
    the working tree on another commit lacks it. This is the head-only fixture the issue
    requires. It hashes `.git/index` and snapshots `git --no-optional-locks status --porcelain`,
    `git rev-parse HEAD`, `git for-each-ref` and the presence of `FETCH_HEAD` before and after
    the call alone. A second fixture's plan name contains a glob character. A negative fixture
    holds `docs/plan/archive/ab.md` and no `a*.md` at the head, and a reference to
    `docs/plan/archive/a*.md` must return `not-found`;
  - a fake-runner case for a missing commit, a missing entry, a symlink entry, an oversized blob
    and a nonzero Git exit (`COMMAND_FAILED`). It also asserts that every head-read call carries
    `GIT_NO_LAZY_FETCH=1`;
  - a check that `plan-publication-core.mjs` still exports `MAX_PLAN_BYTES` (re-exported from
    `plan-lint-core.mjs`), and that the existing import guard
    (`test/effective-flow-mechanics.test.mjs` lines 604–625) still passes with the mechanics
    core importing it from the leaf;
  - a fake-runner case for `plan.dir` `.` with `headSha`, which returns `INVALID_INPUT`;
  - input validation for `headSha`;
  - a regression case showing an unchanged result without `headSha` and a checkout hit that wins
    over the head.
- Contract assertions in `test/workflow-contracts.test.mjs` for the three prose sites, plus the
  existing single-source and ordering invariants.
- CI order after editing distribution sources: `pnpm agent:check`, `pnpm test`,
  `node build.mjs` (the `contextBudget` report for `merge-gate.md`), `pnpm test:distribution`.
- `pnpm eval <suite> verify` (read-only) for all five suites: `merge-gate`, `iterate`,
  `next-steps`, `build-context` and `focus`. CI's "Behavioural eval evidence" step reports the
  same five. `merge-gate`, `next-steps`, `iterate` and `build-context` seed the edited prose or
  `effective-flow-mechanics-core.mjs`/`plan-lint-core.mjs`, so they are expected to report
  freshness debt. Under `docs/adr/pragmatic-test-release-policy.md` that debt is reported, not
  re-recorded, in this change.
- Behavioural proof of the caller's prose sequence (`pr-status-read` → fetch → second call →
  `; head=` line) is deferred, decided by score (S-DEC). The helper fixture tests and the prose
  contract assertions are the accepted proof for this Bugfix. The implementing pull request
  states the deferral as a note against the issue's first acceptance criterion.

## Assumptions and open points

- Assumption (verified): the mechanics core already injects a Git runner and its tests use fake
  runners (`src/scripts/effective-flow-mechanics-core.mjs` lines 222–258 and the
  `base-branch-resolve` tests). No new process dependency is needed.
- Assumption (verified): `pr-status-read` returns `headSha`
  (`src/shared/pr-review-comments.md` line 181), and both GitHub and Forgejo expose
  `refs/pull/<N>/head`, which the delegated run already fetches without refs
  (`src/shared/merge-gate-delegated-run.md` lines 855–861).
- Assumption: the caller's single extra `pr-status-read` on the `not-found` path is an
  acceptable cost. It runs only when the checkout lookup fails, never on the common checkout-hit
  path.
- Assumption (verified): editing `merge-gate.md` and `next-steps.md` creates eval freshness debt
  only. Routine PRs need no new model runs (`docs/adr/pragmatic-test-release-policy.md`).

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[
  {
    "site": "S-CLR",
    "question": "Which helper surface performs the head-commit existence check for a head-only Associated plan path in merge-gate?",
    "options": [
      "Optional headSha input on plan-reference-resolve (path form, after checkout not-found)",
      "New mechanics operation plan-reference-head-resolve",
      "Caller-run git cat-file in merge-gate prose, no helper change"
    ],
    "scores": [
      {
        "label": "Optional headSha input on plan-reference-resolve (path form, after checkout not-found)",
        "score": 9,
        "reason": "One operation keeps the plan.dir/archive path checks and the exact flag, and it can classify the head blob text; the core already has an injected Git runner; its edge over a new operation is one call per site and a one-field addition."
      },
      {
        "label": "New mechanics operation plan-reference-head-resolve",
        "score": 6,
        "reason": "Testable and read-only, but it would copy or have to share the path-form validation and needs a two-call sequence in prose at both sites, adding eager length and a second statement of the contract."
      },
      {
        "label": "Caller-run git cat-file in merge-gate prose, no helper change",
        "score": 3,
        "reason": "The containment and status logic would be restated in prose at two sites against the state-once rule, and it gives no clean core fixture test for the head-only plan the issue requires."
      }
    ]
  },
  {
    "site": "S-CLR",
    "question": "How do the delegated-run Entry backstop and the post-merge next-steps report read learn which head commit holds a head-only associated plan?",
    "options": [
      "Caller appends the verified head OID to the line: Associated plan: <path>; head=<sha>",
      "Each reader re-derives the head from its own fresh pr-status-read headSha",
      "Caller copies the plan blob to a runtime-state file and passes that path"
    ],
    "scores": [
      {
        "label": "Caller appends the verified head OID to the line: Associated plan: <path>; head=<sha>",
        "score": 8,
        "reason": "Path and head are checked as one pair and passed on, so the Entry backstop, which runs before the fresh read, and the post-merge read check the same commit; cost: Entry grammar and the caller passage both change."
      },
      {
        "label": "Each reader re-derives the head from its own fresh pr-status-read headSha",
        "score": 6,
        "reason": "Adds no input grammar and reads the newest head, but the Entry backstop runs before the fresh read and needs an extra read or a reorder, and a push between caller and Entry can make the checks disagree and abort."
      },
      {
        "label": "Caller copies the plan blob to a runtime-state file and passes that path",
        "score": 2,
        "reason": "Adds caller writes under .effective-flow/ needing the runtime-state guard and replaces a repo-relative path with a copy, breaking the closed check and the plan-file next-step invocation."
      }
    ]
  },
  {
    "site": "S-CLR",
    "question": "How is the pull request head commit made available locally before the head-only Associated plan check?",
    "options": [
      "Caller runs the existing no-ref fetch of refs/pull/<N>/head first; helper reads local objects only",
      "Helper fetches refs/pull/<N>/head itself",
      "No fetch: fallback applies only when the head commit is already local"
    ],
    "scores": [
      {
        "label": "Caller runs the existing no-ref fetch of refs/pull/<N>/head first; helper reads local objects only",
        "score": 9,
        "reason": "Reuses the ref-free fetch the delegated run already uses, works for fork, remote-only and other-machine heads, and keeps the helper read-only like base-branch-resolve, which is its edge over a fetching helper."
      },
      {
        "label": "Helper fetches refs/pull/<N>/head itself",
        "score": 5,
        "reason": "Covers the same cases but puts network I/O into a core whose operations are computations or reads, breaking the existing split between resolve and fetch operations."
      },
      {
        "label": "No fetch: fallback applies only when the head commit is already local",
        "score": 3,
        "reason": "Simple and safe, but silently drops the line for fork, remote-only and other-machine pushes, missing the acceptance case and undercutting the post-merge review-report motivation."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "May next-step recommendations name a head-validated associated plan path (present only on the PR head) as an invocation argument?",
    "options": [
      "Reading basis only: never an invocation argument (one rule in next-steps step 2)",
      "Argument allowed only after a verified merge, when the path exists on the base",
      "Keep the plan as written: exclude it only from the unmarked-draft plan-file row"
    ],
    "scores": [
      {
        "label": "Reading basis only: never an invocation argument (one rule in next-steps step 2)",
        "score": 9,
        "reason": "One rule in its owning fragment covers the draft row and step-3 plan reconciliation alike and keeps the never-name-a-missing-argument rule; it beats option 3 by also closing the reconciliation route."
      },
      {
        "label": "Argument allowed only after a verified merge, when the path exists on the base",
        "score": 4,
        "reason": "A forge merge does not update the local checkout, so the path still does not exist locally and the argument stays unusable; it adds a conditional the motivating report case never needs."
      },
      {
        "label": "Keep the plan as written: exclude it only from the unmarked-draft plan-file row",
        "score": 4,
        "reason": "Fixes only the draft row; step-3 reconciliation can still recommend plan with a path missing from the checkout, so the gap stays open and the exclusion is scattered rather than stated once."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "How is the issue first acceptance criterion (merge-gate keeps the Associated plan line for a head-only plan) proven beyond helper fixture tests and prose-contract assertions?",
    "options": [
      "Accept helper and contract proof; state the deferred behavioural proof in the PR",
      "Add and record a head-only associated-plan merge-gate eval scenario",
      "One manual T3 acceptance run on a real PR that archives its own plan",
      "Decide later"
    ],
    "escape": ["Decide later"],
    "scores": [
      {
        "label": "Accept helper and contract proof; state the deferred behavioural proof in the PR",
        "score": 8,
        "reason": "Fits the pragmatic test policy for a bounded Bugfix: helper fixtures cover the risky head read and stating the debt in the PR keeps the prose-sequence gap visible; its edge over a scenario is not blocking the draft PR on manual runs."
      },
      {
        "label": "Add and record a head-only associated-plan merge-gate eval scenario",
        "score": 6,
        "reason": "Strongest repeatable proof and the scaffold has a local origin with refs/pull/42/head, but it costs a new fixture plus manual fresh-session recordings that autopilot cannot perform, disproportionate for this bugfix."
      },
      {
        "label": "One manual T3 acceptance run on a real PR that archives its own plan",
        "score": 4,
        "reason": "Realistic end-to-end evidence but a single, unrepeatable run the eval verifier does not track, needing a manually set-up PR-watching T3 thread outside the autopilot pipeline."
      }
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
| Architecture | 0 | 3 | 1 |
| Security | 0 | 0 | 2 |
| Data protection | 0 | 0 | 0 |
| Error cases | 0 | 5 | 6 |
| Testability | 0 | 2 | 6 |
| Scope | 0 | 0 | 2 |
| Maintainability | 0 | 1 | 3 |

### Findings

Internal review on 2026-11-27, covering the gap analysis (Phase 4) and the plan review (Phase 6).
Every finding is incorporated.

- Testability, Important: the planned "no second copy" guard could not forbid `headSha` in the
  delegated fragment, which already uses it for the ancestry check. The existing guard is now kept
  unchanged, and a bounded-slice assertion on Entry step 2 is added.
- Architecture, Important: a head result named its top-level location `plan-dir`. It now uses
  the helper's existing `top`/`archive` values.
- Error cases, Important: the head blob read had no bound. It is now limited to 512 KiB, checked
  with `git cat-file -s` before the read.
- Error cases, Important: the `ls-tree` lookup could glob or quote. It now uses
  `-z ':(literal)<path>'` and a byte-exact name comparison, and a negative glob fixture is added.
- Error cases, Important: only the report read in `next-steps` was adapted. The head-blob rule is
  now stated once in step 2, which step 3 and the merged-run read rely on.
- Architecture/Security, Important: a partial clone could fetch missing objects on demand. Every
  head-read call now runs with `GIT_NO_LAZY_FETCH=1`, and a test asserts it.
- Error cases, Important: step-3 reconciliation could name a head-only plan path as an
  invocation argument. Decided by score (S-BAT): that path is reading basis only, never an
  argument, stated once in `next-steps` step 2.
- Testability, Note: the literal bullet-head matches at `test/workflow-contracts.test.mjs` lines
  5385 and 26870 are kept by leaving the bullet head unchanged.
- Error cases, Note: the suffix grammar is anchored at the line end, the caller always writes the
  helper's `.md`-terminated `data.path`, and no separate malformed-suffix rule exists.
- Maintainability, Note: the commit check reuses `resolveCommit`.
- Testability, Note: the "unchanged repository" criterion is now measured with an index hash,
  `--no-optional-locks` status, refs, `HEAD` and `FETCH_HEAD`.
- Architecture, Note: the developer guide states that `archiveIgnored` on a head result describes
  the checkout only.
- Scope, Note: hidden mode skips the whole head fallback.
- Security, Note: head blob text is pull-request data that grants no authority, and its report
  path is honoured only under the existing containment rule.
- Error cases, Note: the caller's fetch is non-interactive and bounded at 60 seconds.
- Error cases, Note: in Entry, a line without a head never takes the fallback.
- Maintainability, Note: the 512 KiB bound comes from `MAX_PLAN_BYTES` (superseded in the deep
  review below: the symbol moves to a leaf instead of being copied locally).
- Testability, Note: the misattributed `conflict-validation-core.mjs` pattern citation is
  corrected to the literal-pathspec convention.

Scoped re-check on 2026-11-27 (planning-ladder trigger (d): the S-BAT answer changed an
architecture decision). It confirmed that the earlier corrections are resolved and raised three
more findings, all incorporated:

- Architecture/Error cases, Important: the delegated-run draft row would still have taken a
  head-validated line, suffix included, as `<plan-file>`. It now gets a "carries no `; head=`"
  qualifier, which is asserted.
- Testability, Important: the S-BAT rule had no acceptance criterion or assertion. Both are
  added.
- Error cases/Maintainability, Note: the `next-steps` blob read now uses `git cat-file blob`
  under `GIT_NO_LAZY_FETCH=1`.

Deep plan review (`plan-review`, file mode) on 2026-11-27 raised eight findings. Seven were
incorporated directly and one was decided by score:

- Maintainability/Architecture, Important: a local 512 KiB constant would restate a rule owned by
  a sibling core, against `docs/adr/mechanics-helpers-import-owning-cores.md`. `MAX_PLAN_BYTES`
  now moves to a named export of the leaf `plan-lint-core.mjs`, which `plan-publication-core.mjs`
  re-exports and the mechanics core imports.
- Error cases/Testability, Important: the core's `git()` wrapper and `resolveCommit()` pass no
  `env`, so `GIT_NO_LAZY_FETCH=1` could not reach the reused commit check. Both now gain an
  optional trailing `env` parameter, unchanged when omitted.
- Testability/Scope, Note: all five eval suites' `verify` runs now report the debt, not only two.
- Security/Error cases, Note: the `next-steps` blob read passes `<sha>:<path>` as one
  single-quoted argument under the repository's quoting convention.
- Error cases, Note: the 60-second fetch bound is now the host command tool's timeout, and an
  expired timeout counts as a failed fetch.
- Scope, Note: name-form associations and `plan.dir` `.` are now listed as accepted fail-closed
  limitations, and the `.` case is pinned by a test.
- Maintainability, Note: the post-merge read is justified by the retained head objects, which
  hold under squash and rebase merges too, not by the merged content.
- Testability, Note: there is no behavioural proof of the caller's prose sequence. Decided by
  score (S-DEC): the helper and contract proof is accepted, and the implementing PR states the
  deferral.

## Open points

- No open points.
