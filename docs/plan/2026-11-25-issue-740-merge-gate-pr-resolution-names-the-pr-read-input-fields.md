# merge-gate PR resolution names the pr-read input fields

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #740

## Requirement

The "PR resolution" section of `src/shared/pr-review-comments.md` tells the orchestrator only to
"Use helper reference parsing followed by the normalized PR read/list operations." It does not
name the input fields of the helper's `pr-read` operation. An orchestrator following it passed the
resolved reference as `{"reference":"736"}` and received
`INVALID_REFERENCE: pull-request number must be a positive integer`, because `pr-read` reads only
`number` (alias `pullRequest`) plus the top-level `cwd`. Recovering cost a wasted helper call and
reading `src/scripts/remote-tracker-core.mjs` at the start of a gate run.

The same section leaves the neighbouring calls equally underspecified. `reference-parse` rejects a
bare `736` or `#736` without `expectedKind` (`INVALID_REFERENCE: a bare reference requires
expectedKind`), and `pr-list` returns every open PR, forks included, when its `head` filter is
missing or matches a fork's same-named branch. Naming only `{cwd, number}` would also drop the
repository a PR URL carries, so a URL to another repository's PR would be read as `origin`'s PR with
the same number and the existing "another repository" stop could not trigger.

Goal: "PR resolution" names the input fields of each helper call it prescribes, in the house style
of the autopilot fragments, so `merge-gate` and `iterate` resolve the PR correctly on the first
call, a foreign PR URL or fork PR still fails closed, no remote call is added for a bare reference,
and the always-loaded core grows by as few lines as the wording needs. `review`, which resolves
PRs through the same section, states the same another-repository outcome.

Workflow rationale: Bugfix. The shipped prompt text produces wrong runtime behaviour (invalid helper
calls); the fix corrects that behaviour in product source (`src/**/*.md` is shipped product, not
documentation), with no new capability.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #740
**Original outcome:** "PR resolution" in `src/shared/pr-review-comments.md` names the `pr-read` input fields `cwd` and `number`; `node build.mjs` passes and every affected `contextBudget` stays within its limit or is updated to the newly measured count.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** one rewritten paragraph in one shared fragment naming the inputs of `reference-parse`, `repository-resolve` (PR URL only), `pr-read` and `pr-list`; one aligned sentence in `src/tools/review.md`; one contract test; no helper change.
**Continuation decision:** none

## Architecture decisions

- Fix the instruction where it is read, not the helper. `pr-read` rejecting a missing `number` is
  correct fail-closed behaviour (`prNumber` → `requireNumber` in
  `src/scripts/remote-tracker-shared-core.mjs:629-631` and `:65-70`); accepting `reference` there
  would widen the helper's contract for a prompt gap.
- Keep the wording in `src/shared/pr-review-comments.md` "PR resolution" rather than adding a
  per-operation input table to `src/shared/remote-helper-contract.md`. A table would be a new,
  eagerly loaded contract paid on every including run (AGENTS.md "Writing prompt text", points 1–2).
- Name all call shapes of the resolution path, not only `pr-read` (decided by score):
  `reference-parse` without `expectedKind` fails on the incident's own bare input, and `pr-list`
  without `head` silently widens to every open PR.
- Let the helper own the foreign-repository check for a PR URL (decided by score): pass `origin`'s
  repository from `repository-resolve` into `reference-parse`, whose `sameRepository` comparison
  (`src/scripts/remote-tracker-shared-core.mjs:228-234`, `:276-278`) fails closed with
  `REFERENCE_REPOSITORY_MISMATCH`. The orchestrator maps that error to the existing "another
  repository" outcome (`src/tools/merge-gate.md:160-161`, `src/shared/pr-review-integration.md:58`)
  instead of comparing repositories in prose.
- Call `repository-resolve` only for a PR URL (decided by score). For a bare or `#n` reference
  `parseReference` compares nothing and only echoes the option
  (`src/scripts/remote-tracker-shared-core.mjs:246-249`), and `pr-list` resolves the repository
  itself (`src/scripts/remote-tracker-core.mjs:1284-1290`). This adds no remote call to any
  `merge-gate` → `iterate 42` round and keeps `iterate` Phase 0 within the evaluator's pure-local
  helper set (`evals/iterate/_scaffold/evaluate.mjs:18-27`, `:218-235`) for every recorded scenario.
- Current-branch resolution accepts only a same-repository PR: exactly one `pr-list` match that is
  `sameRepository: true`, as `src/shared/autopilot-blockers.md:65-67` and
  `src/shared/deliver-committed-range.md:56-61` already require, so a fork's same-named branch can
  never become the gated PR.
- Align `review` with the shared outcome (decided by score): a PR of another repository is reported
  read-only and not reviewed, matching `src/shared/pr-review-integration.md:58`. After
  `REFERENCE_REPOSITORY_MISMATCH` the helper returns no PR number, and `review`'s changed-file scope
  assumes `origin`, so "reviewed read-only" is not executable.
- Leave the `provider` override to the eagerly loaded helper contract
  (`src/shared/remote-helper-contract.md:33-34`, decided by score); a dropped override fails closed
  with `AMBIGUOUS_HOST` (`src/scripts/remote-tracker-core.mjs:1308-1316`).
- Reuse the house phrasing: `` `pr-read` … with `{cwd, number}` `` from
  `src/shared/autopilot-issue-source.md:93`, `` `repository-resolve` … with `{cwd}` `` from
  `src/shared/autopilot-issue-source.md:21`, and the `pr-list` `head` field as in
  `src/shared/autopilot-blockers.md:65-66`, shortened to `{cwd, head}` because both providers
  default `state` to open (`src/scripts/remote-tracker-github-core.mjs:479`,
  `src/scripts/remote-tracker-shared-core.mjs:715`). `cwd` is the verified `RUNTIME_STATE_ROOT`,
  which `src/shared/remote-helper-contract.md:18-26` already requires on every operation; the
  paragraph names the field and does not restate that rule.

## Affected files

| File | Description |
|---|---|
| `src/shared/pr-review-comments.md` | In "PR resolution", replace the paragraph "Use helper reference parsing followed by the normalized PR read/list operations. For current-branch resolution, …" with wording that names `reference-parse` with `{cwd, reference, expectedKind: "pull-request"}`, adding `repository` (the whole `data` of `repository-resolve` with `{cwd}`) only for a PR URL; maps `REFERENCE_REPOSITORY_MISMATCH` to a pull request of another repository; reads the PR with `pr-read` and `{cwd, number}`; and for current-branch resolution lists open PRs with `pr-list` and `{cwd, head}`, requiring exactly one match that is `sameRepository: true`. |
| `src/tools/review.md` | Lines 418-419: split the sentence so a merged or closed pull request is still reviewed read-only and reported as such, while one belonging to another repository is reported read-only and not reviewed. |
| `src/tools/merge-gate.md` | Update the last frontmatter line `contextBudget:` only if the measured always-loaded core exceeds the current value 949. |
| `src/tools/iterate.md` | Update the last frontmatter line `contextBudget:` only if the measured always-loaded core exceeds the current value 1869. |
| `test/workflow-contracts.test.mjs` | Add one small test next to "both forge adapters load the shared remote-helper invocation contract" (around line 4708), named for its own invariant (for example "PR resolution names the helper input fields"), pinning the call shapes, the URL-only repository check, the `sameRepository` requirement and the mismatch mapping. |

`src/tools/review.md` keeps `contextBudget: 899` unless the build reports a higher measured count.

## Implementation details

### Approach

1. In `src/shared/pr-review-comments.md`, "PR resolution" (paragraph currently at lines 76-77),
   replace the two-sentence paragraph with wording that states:
   - parse an argument with `reference-parse` and `{cwd, reference, expectedKind: "pull-request"}`;
     for a PR URL only, first call `repository-resolve` with `{cwd}` and add its whole `data` object
     as `repository` (not its `data.repository` name string, which makes every PR URL fail with
     `INVALID_PAYLOAD`); `REFERENCE_REPOSITORY_MISMATCH` identifies a pull request of another
     repository;
   - read the PR with `pr-read` and `{cwd, number}`, taking `number` from the parsed item, never
     the raw reference;
   - without an argument, list open PRs with `pr-list` and `{cwd, head}` for the exact head branch
     and require exactly one match that is `sameRepository: true`; an item without it is no match.

   Prefer two or three compact sentences over a list; no history, no rationale. Rewrap to the
   file's existing line width. The following merged/closed sentence and each host's own
   another-repository rule stay where they are.
2. In `src/tools/review.md:418-419`, rewrite the sentence so merged or closed pull requests keep
   "reviewed read-only and reported as such", and a pull request belonging to another repository is
   "reported read-only and not reviewed".
3. Run `node build.mjs` and read the `Always-loaded core (lines/budget)` report for `merge-gate`,
   `iterate` and `review`. `merge-gate` and `iterate` are the only tools that eagerly include
   `pr-review-comments` (`src/tools/merge-gate.md:87-89`, `src/tools/iterate.md:136-138`); `review`
   changes only through its own sentence. If a count exceeds its budget, raise that tool's
   `contextBudget:` to the measured count (AGENTS.md permits up to ten lines of headroom; add none
   beyond what the guard needs). Leave a budget unchanged when the count still fits.
4. In `test/workflow-contracts.test.mjs`, add a separate test beside the existing include-edge test
   (which protects a different invariant and stays unchanged). It pins the wording with the file's
   existing helpers, `prose(section(source('src/shared/pr-review-comments.md'), '### PR resolution'))`
   (`section` at line 85, `prose` at lines 266-272: whitespace collapsed and emphasis dropped, so a
   rewrap cannot break the match), and asserts the section contains the literal spans
   `` `{cwd, reference, expectedKind: "pull-request"}` ``, `` `repository-resolve` ``,
   `` `{cwd, number}` ``, `` `{cwd, head}` ``, `` `sameRepository: true` `` and
   `` `REFERENCE_REPOSITORY_MISMATCH` ``. A bare `head` is not pinned on its own, since "head
   branch" already occurs in the section. The test name and assertion messages state the invariant
   ("PR resolution must name the input fields of every helper call it prescribes").
5. Run the CI order from AGENTS.md (see Validation plan).

### Edge cases

- Bare `736` or `#736`: `reference-parse` with `{cwd, reference, expectedKind: "pull-request"}`
  returns `{kind: "pull-request", number: 736, repository: undefined}` without a remote call;
  `pr-read` then reads `origin`'s PR 736.
- Issue URL (`/issues/`): `reference-parse` fails with `INVALID_REFERENCE` (`expected pull-request
  reference but received issue`); the run reports it and writes nothing.
- PR URL of another repository: `reference-parse` fails with `REFERENCE_REPOSITORY_MISMATCH`;
  `merge-gate` reports a pull request belonging to another repository without mutation and ends;
  `review` reports it read-only and does not review it.
- `origin`'s own PR URL when `origin`'s remote host or path differs from the web URL (an SSH config
  alias such as `github-work`, `ssh.github.com:443`, a separate SSH host on a self-hosted forge, or
  Forgejo under a sub-path): `sameRepository` fails and the URL is refused as another repository's.
  This is fail-closed and accepted (decided by score); the user passes the bare number instead.
- PR URL with a trailing path such as `/pull/5/files` or `/pull/5/commits`: `reference-parse`
  fails closed with `INVALID_REFERENCE` ("URL is not an issue or pull-request reference",
  `src/scripts/remote-tracker-shared-core.mjs:263-265`); the run reports it and writes nothing. No
  helper change.
- A PR URL handed to `iterate` still calls `repository-resolve` during reference parsing; no
  recorded `iterate` scenario uses a URL (all invoke `effective-flow iterate 42`).
- `reference-parse` returns an array (`src/scripts/remote-tracker-core.mjs:686-693`); the wording
  takes `number` from the single parsed item.
- No argument and a fork PR from a same-named branch: the item is not `sameRepository: true`, so it
  is no match; zero or several remaining matches keep today's outcome (exactly one is required).
- `AMBIGUOUS_HOST` on any call: the eagerly loaded helper contract's override retry applies
  unchanged; a dropped override fails closed with `AMBIGUOUS_HOST` again.
- A tool that includes `pr-review-comments` only through the lazy `pr-review-integration` include
  (the tools `review`, `apply-review-remote` and `apply-issues`, and the shared fragment
  `worktree-integration`) has no always-loaded change from the fragment; the build's budget guard
  confirms this.
- The rewrite must not move or duplicate the `### PR resolution` heading or the eager
  `remote-helper-contract` include fence above it; the existing test asserts the fence precedes the
  heading.
- The `{{SKILL:iterate}}` placeholder later in the section stays unchanged; no new placeholder is
  introduced.
- Each inline code span stays on one line, so neither the rendered prompt nor a reader of the
  source sees a split span; `pnpm format` must not reflow it apart.

## Acceptance criteria

- [ ] The "PR resolution" section of `src/shared/pr-review-comments.md` contains the spans `` `{cwd, reference, expectedKind: "pull-request"}` ``, `` `repository-resolve` `` (stated for a PR URL only), `` `{cwd, number}` ``, `` `{cwd, head}` ``, `` `sameRepository: true` `` and `` `REFERENCE_REPOSITORY_MISMATCH` ``, and the phrase "normalized PR read/list operations" no longer appears in the section.
- [ ] `src/tools/review.md` states that a pull request belonging to another repository is reported read-only and not reviewed, while merged or closed pull requests are still reviewed read-only.
- [ ] `node build.mjs` exits 0, and its `Always-loaded core (lines/budget)` report shows `merge-gate`, `iterate` and `review` within their `contextBudget` values.
- [ ] `pnpm test` passes, including the new PR-resolution test in `test/workflow-contracts.test.mjs`.
- [ ] `pnpm agent:check` and `pnpm test:distribution` pass.

## Validation plan

- `pnpm agent:check` (oxfmt check on the edited Markdown and test file).
- `pnpm test` (unit and contract suite, including the new PR-resolution test).
- `node build.mjs` (budget guard; read the `merge-gate`, `iterate` and `review` rows).
- `pnpm test:distribution`.
- `pnpm eval merge-gate verify` and `pnpm eval iterate verify` (read-only): expected to report freshness debt for the edited fragment only, which is acceptable under the pragmatic test and release policy and is not repaired in this run. No recorded scenario reaches the PR-URL path, and merge-gate scenarios do not constrain pre-refusal helper calls.

## Assumptions and open points

- Assumption (verified): `pr-read` reads the PR number from `number` or `pullRequest` and accepts a positive integer or a digit-only string (`src/scripts/remote-tracker-shared-core.mjs:65-70`, `:629-631`); the wording names only `number`, the documented form.
- Assumption (verified): `reference-parse` passes its whole input as options (`src/scripts/remote-tracker-core.mjs:4367-4368`), so `expectedKind` and `repository` are read from the same object; `repository-resolve` returns `host`, `owner` and `repository` in `data` (`src/scripts/remote-tracker-core.mjs:7186-7194`), the fields `sameRepository` compares.
- Assumption (verified): `pr-list` items carry `sameRepository` (`src/scripts/remote-tracker-core.mjs:7982`), and both providers default `state` to open.
- Assumption (verified): only `merge-gate` and `iterate` eagerly include `pr-review-comments`; no `src/agents/*.md` references it. `evals/iterate/README.md:66-71` and the header of `evals/iterate/_scaffold/evaluate.mjs` describe the built `iterate` Phase 0 parsing the reference through `reference-parse`.
- Assumption: the current always-loaded counts of `merge-gate`, `iterate` and `review` are unknown at planning time (no `dist/` in the planning checkout); Approach step 3 measures them.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->
```json
[{"site":"S-BAT","question":"How should the plan handle reference-parse required input (expectedKind) in the rewritten PR resolution sentence?","options":["Name both shapes","Keep pr-read only","Bare number direct"],"escape":[],"stop":[],"scores":[{"label":"Name both shapes","score":8,"reason":"Only option fixing both helper calls: without expectedKind pull-request, reference-parse rejects a bare 736 or #736 before pr-read and the field also rejects an issue URL; one helper path, at the cost of likely more than one extra line."},{"label":"Keep pr-read only","score":3,"reason":"Follows the issue wording but not its goal: a bare reference copied into reference-parse still fails on the first helper call and needs a follow-up issue."},{"label":"Bare number direct","score":4,"reason":"Avoids the reference-parse failure but needs a prompt branch stripping # itself, contradicts helper reference parsing, adds more prose and still needs expectedKind for URLs."}]},{"site":"S-BAT","question":"How should the rewritten clause keep a PR URL from another repository from being silently read as the origin PR with the same number?","options":["Stop on foreign URL","Pass origin to parse","Pass parsed repository"],"escape":[],"stop":[],"scores":[{"label":"Stop on foreign URL","score":6,"reason":"Keeps the existing stop working, but the model compares repositories in prose (host and case rules) and still needs origin from repository-resolve; about the same prompt text as option 2 without the helper fail-closed check."},{"label":"Pass origin to parse","score":8,"reason":"Beats option 1: the helper owns parsing and already compares host, owner and repo case-insensitively, failing closed with REFERENCE_REPOSITORY_MISMATCH; costs one repository-resolve call plus a repository field in the clause."},{"label":"Pass parsed repository","score":3,"reason":"Reads another repository PR before refusing it, can fail with AMBIGUOUS_HOST on Forgejo hosts and still leaves a prose comparison against origin; most calls and wording for the weakest guarantee."}]},{"site":"S-BAT","question":"Should the current-branch sentence in PR resolution also name the pr-list input fields?","options":["Leave pr-list unchanged","Name pr-list fields"],"escape":[],"stop":[],"scores":[{"label":"Leave pr-list unchanged","score":4,"reason":"Saves a few words, but once the paragraph names fields for three operations, leaving pr-list out invites a guess; a misnamed head field makes pr-list return every open PR."},{"label":"Name pr-list fields","score":8,"reason":"pr-list keeps every PR when head is absent (remote-tracker-core.mjs:4100), so a guessed field can silently match a single PR on another branch; costs a few words and follows house phrasing."}]},{"site":"S-DEC","question":"How should the plan keep the new repository-resolve call from breaking iterate Phase-0 refusal behaviour?","options":["URL-only repository check","Tie calls to resolve step","Keep wording, rerun evals"],"escape":[],"stop":[],"scores":[{"label":"URL-only repository check","score":8,"reason":"Fits best: pr-read needs only {cwd, number}, and the repository match only matters for a URL, so bare refs (every scenario, every merge-gate dispatch) skip the remote call. A URL in iterate Phase 0 still calls it."},{"label":"Tie calls to resolve step","score":7,"reason":"Cleanest structure, since iterate Phase 0 makes no remote call for any reference shape. The cost is an iterate.md edit, a contextBudget check, a test pin and a fresh Phase-0 recording, all for a URL case no scenario covers."},{"label":"Keep wording, rerun evals","score":2,"reason":"An unconditional repository-resolve before Phase-0 refusal breaks the evaluator pure-local helper set. A rerun would only record the failure of the seven refusal scenarios, not prevent it."}]},{"site":"S-DEC","question":"How should the plan reconcile the new another-repository mapping with the review rule that such a PR is reviewed read-only?","options":["Neutral mapping","Align review rule","Follow-up issue"],"escape":[],"stop":[],"scores":[{"label":"Neutral mapping","score":6,"reason":"Keeps the shared fragment narrow and accurate for merge-gate, but hands review an unworkable rule: no PR number after the mismatch and an origin-bound scope, so the model must improvise extra calls."},{"label":"Align review rule","score":8,"reason":"Ahead of the neutral mapping: it settles the conflict, matching review with pr-review-integration.md:58, which already reports read-only with no comment. Costs one rewritten line in one more file and a contextBudget check."},{"label":"Follow-up issue","score":3,"reason":"Ships known conflicting instructions: the shared fragment says report with no write while review says review read-only. The model has to arbitrate, and the fix is too small to justify deferring."}]},{"site":"S-DEC","question":"Should the literal call shapes in PR resolution also mention the chosen provider override?","options":["Rely on helper contract","Mention provider override"],"escape":[],"stop":[],"scores":[{"label":"Rely on helper contract","score":8,"reason":"The eager helper contract sits right above PR resolution and states the override rule once (AGENTS.md point 2). A dropped override fails closed with AMBIGUOUS_HOST, so the worst case is one retry."},{"label":"Mention provider override","score":5,"reason":"Copying the shapes would keep the override, but it restates a contract that is owned and loaded right next to it, and the length is paid on every run. It only saves a retry that already fails closed."}]},{"site":"S-DEC","question":"How should the plan handle a false another-repository refusal of the origin own PR URL when the origin remote host differs from the web host?","options":["Accept and document","Compare slugs on mismatch"],"escape":[],"stop":[],"scores":[{"label":"Accept and document","score":8,"reason":"Fails closed, affects a minority of setups and has a bare-number workaround. It adds only a plan edge case, with no eager text in merge-gate and iterate, which AGENTS.md says every run pays for."},{"label":"Compare slugs on mismatch","score":5,"reason":"Gives a clearer message for alias hosts, but adds an eager clause paid on every merge-gate and iterate run. It repeats part of the helper comparison in prose and lets the model judge error details, for a rare case."}]}]
```
<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area | Critical | Important | Note |
|---|---:|---:|---:|
| Architecture | 0 | 0 | 0 |
| Security | 0 | 1 | 0 |
| Data protection | 0 | 0 | 0 |
| Error cases | 0 | 3 | 2 |
| Testability | 0 | 1 | 4 |
| Scope | 0 | 1 | 0 |
| Maintainability | 0 | 0 | 3 |

### Findings

- Security, Important: current-branch resolution took the single `pr-list` match without requiring it to come from `origin`, so a fork PR from a same-named branch could be gated and merged. Incorporated: exactly one match that is `sameRepository: true`.
- Error cases, Important: naming only `{cwd, number}` would drop a PR URL's repository, so a foreign URL would read `origin`'s PR with the same number and bypass the another-repository stop. Incorporated by score: `origin`'s repository is passed into `reference-parse`, which fails closed with `REFERENCE_REPOSITORY_MISMATCH`.
- Error cases, Important: `repository` could be mistaken for `repository-resolve`'s `data.repository` name string, which makes every PR URL fail with `INVALID_PAYLOAD`. Incorporated: Approach step 1 names the whole `data` object.
- Error cases, Important: `origin`'s own PR URL is refused as foreign when the remote host or path differs from the web URL. Decided by score: accepted as fail-closed and documented as an edge case with the bare-number workaround.
- Testability, Important: an unconditional `repository-resolve` would reach `iterate` Phase 0, whose refusal eval scenarios fail on any remote helper call. Incorporated by score: `repository-resolve` runs only for a PR URL.
- Scope, Important: the another-repository mapping contradicted `review`'s rule that such a PR is reviewed read-only. Incorporated by score: `src/tools/review.md` is aligned to "reported read-only and not reviewed".
- Error cases, Note: the literal shapes omit a chosen `provider` override after `AMBIGUOUS_HOST`. Deliberately not incorporated by score: the eagerly loaded helper contract owns the rule, and a dropped override fails closed.
- Error cases, Note: PR URLs with a trailing path (`/pull/5/files`) fail closed. Incorporated as an edge case.
- Testability, Note: the new test uses the file's existing `section` and `prose` helpers. Incorporated.
- Testability, Note: acceptance criterion 1 no longer qualifies the removed phrase with "without field names". Incorporated.
- Testability, Note: the test pins the literal shapes, not a bare `head` that the section already contains. Incorporated.
- Testability, Note: the evidence for `iterate` Phase 0 parsing through `reference-parse` now cites the eval README and evaluator header, not `src/tools/iterate.md:268-270`. Incorporated.
- Maintainability, Note: an unconditional `repository-resolve` was a wasted call on every bare-reference and current-branch path. Incorporated through the URL-only decision.
- Maintainability, Note: the `pr-list` shape claim now states the shortening to `{cwd, head}` and its reason. Incorporated.
- Maintainability, Note: two line citations and the `worktree-integration` fragment label were corrected. Incorporated.

## Open points

- No open points.
