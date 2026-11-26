# Show the exact post-merge issue-state-wait invocation

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #773

## Requirement

Merge Gate's post-merge observation tells the orchestrator to give auto-close automation "the fixed
30-second grace period" and to "use the bounded `issue-state-wait` helper operation", but it never
shows the call. A caller can read the duration as an argument it has to send. The helper rejects
`timeoutSeconds: 30` (and every other timing field) with `INVALID_PAYLOAD`, so the run pays one
rejected call and a retry before the linked issue can be reconciled.

Goal: at the post-merge observation step, the shipped guidance shows one copyable
`remote-tracker.mjs issue-state-wait` call with the absolute runtime-state root as `cwd` and the
issue number as `issue`, says explicitly that no timeout or polling field is passed, and makes clear
that the helper owns the fixed 30-second maximum. The grace-period policy stays in its current owner,
the helper's behaviour does not change, and every observation, closure and label rule stays as it is.

Workflow rationale: Bugfix. The shipped prompt (`src/**/*.md` is product source in this repository)
leads a correct caller into a rejected call. That is unexpected behaviour with a known trigger, and
the fix is a corrective clarification of existing guidance, not a new capability or a documentation
guide under `docs/`.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #773
**Original outcome:** Step 2 of `### Observation steps` in `src/shared/merge-gate-issue-observation.md` carries one literal `issue-state-wait` call with only `cwd` (`<RUNTIME_STATE_ROOT>`) and `issue`, an explicit "no timeout, wait or polling field" instruction and the helper-owned 30-second maximum. One new contract test pins that call and wording and proves the documented payload is accepted on the first invocation. The helper, the grace-period policy and all closure and label rules are unchanged.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** fresh baseline: one prose clarification in one shared fragment, plus one test
**Continuation decision:** none

## Architecture decisions

- **The call goes into step 2 of `### Observation steps` in `src/shared/merge-gate-issue-observation.md`.**
  That step is where Merge Gate actually invokes the operation
  (`src/shared/merge-gate-issue-observation.md:27-31`). The other files keep their roles.
  `src/shared/issue-post-merge-observation.md:19-25` owns the grace-period policy and stays
  untouched. This follows the repository rule "state a contract once, in its owning fragment": the
  step states the call, not the policy.
- **The fragment carries the inline ban sentence for read-helper calls.** Every source that shows
  a `remote-tracker`, `config-resolve` or `conflict-validation` call must contain the inline ban
  sentence (`INLINE_BAN`) verbatim, compared after collapsing whitespace. An upstream include does
  not count (`test/helper-call-shape-contract.test.mjs:13-16`, `:158-170`).
  `src/shared/merge-gate-issue-observation.md` shows no helper call today and does not carry the
  sentence. The `helper-call-shape` include at `src/shared/merge-gate-delegated-run.md:122` and the
  sentence at `:424` sit in another file, so they do not satisfy the guard. Step 2 therefore adds
  the sentence verbatim next to the call.
- **The call uses the established inline form for Merge Gate helper calls**, as in
  `src/shared/merge-gate-delegated-run.md:1058` (`merge-proof-local`) and `:1379`
  (`pr-draft-classify`): `node <skill-root>/scripts/remote-tracker.mjs issue-state-wait <<< '{"cwd":"<RUNTIME_STATE_ROOT>","issue":<issue number>}'`.
  It is a read-only operation, so there is no `--apply`.
- **The issue key is `issue`, as the issue proposes.** `issueNumber()` in
  `src/scripts/remote-tracker-shared-core.mjs:585-587` accepts `number` or `issue`
  (`input.number ?? input.issue`), so both keys work. `issue` names the subject unambiguously in a
  step that also talks about pull requests. The eval fixture's descriptive `input: {"number":17}`
  (`evals/merge-gate/fixtures/linked-issue-open-points.json:560-563`) is not matched against the
  real call: the eval tracker stub serves envelopes by operation (`evals/_scaffold/remote-tracker.mjs:736-800`).
  The fixture therefore needs no change.
- **No `repository`, `host` or `provider` field is shown.** Without them the helper resolves the
  repository from the `cwd` checkout's `origin` (`resolveRepositoryInput`,
  `src/scripts/remote-tracker-core.mjs:1332-1357`). The other Merge Gate helper calls rely on the
  same resolution (`merge-gate-delegated-run.md:1379`). Step 1 has already checked the receipt's
  repository against the fresh canonical PR repository. An `AMBIGUOUS_HOST` result stays governed
  by `src/shared/remote-helper-contract.md`.
- **The helper stays unchanged.** `assertFixedIssueStateWait`
  (`src/scripts/remote-tracker-core.mjs:4538-4556`) is a denylist. It rejects `timeoutMs`,
  `timeoutSeconds`, `timeoutMinutes`, `waitMs`, `waitSeconds`, `waitMinutes` and `intervalSeconds`
  with `INVALID_PAYLOAD`, and `ISSUE_STATE_WAIT_MS = 30_000` (`:410`) is the fixed bound. The
  guidance describes this behaviour and does not alter it.

## Affected files

| File                                         | Description                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/merge-gate-issue-observation.md` | Step 2 of `### Observation steps`: add the literal forge call and the verbatim inline ban sentence. Add one sentence: send no timeout, wait or polling field, because the helper's 30-second maximum is fixed.                                                                                                                                              |
| `test/workflow-contracts.test.mjs`           | One new top-level `async` test, which names its invariant: the guidance shows a call the helper accepts on the first invocation. It pins the literal call in step 2 to exactly the keys `cwd` and `issue`. It then runs the extracted payload through `executeOperation` from `src/scripts/remote-tracker-core.mjs` with an inline fake runner and sleeper. |

## Implementation details

### Approach

1. In `src/shared/merge-gate-issue-observation.md`, step 2 of `### Observation steps`, keep the
   existing first sentence, which points to the grace period in `issue-post-merge-observation`.
   Replace "Use the bounded `issue-state-wait` helper operation for forge issues." with guidance in
   this order:
   - For a forge issue, make exactly one call of the shape above. Write the inline code span on a
     single source line: `callsOf` in `test/helper-call-shape-contract.test.mjs:31-39` reads one
     line at a time, and oxfmt does not reflow it, because `.oxfmtrc.json` sets no `proseWrap`.
     `cwd` is the verified absolute `RUNTIME_STATE_ROOT`. `issue` is the number of
     the receipt item's canonical `#<n>` reference, without the `#`, as a JSON number. The receipt
     item's own `issue` value is the canonical reference string (`"#17"`, produced by
     `normalizeForgeLifecycleReference`, `src/scripts/remote-tracker-shared-core.mjs:126-129`,
     `:173`), which the helper rejects
     (`requireNumber`, `src/scripts/remote-tracker-shared-core.mjs:65-71`), so the wording must
     not invite copying it.
   - One sentence containing the two exact phrases the test pins: "send no timeout, wait or
     polling field" and "30-second maximum is fixed". For example: "Send no timeout, wait or
     polling field; the helper's 30-second maximum is fixed." Do not phrase it as an exclusive
     key list ("no field besides `cwd` and `issue`"). The `AMBIGUOUS_HOST` retry of
     `src/shared/remote-helper-contract.md:37-38` adds a `provider` override
     (`src/scripts/remote-tracker-core.mjs:1360-1363`), and an exclusive list would forbid it.
     Do not restate the helper's read-wait-read behaviour
     or its rejection list. The policy stays in `issue-post-merge-observation`, and the behaviour
     is described in `docs/user-guide/remote-tracker.md:435`. The helper's rejection is a
     denylist of seven named fields (`src/scripts/remote-tracker-core.mjs:4538-4556`), so the
     guidance makes no "any timing field is rejected" claim.
   - The inline ban sentence, verbatim, exactly as `INLINE_BAN` in
     `test/helper-call-shape-contract.test.mjs:15-16` and as in
     `src/shared/merge-gate-delegated-run.md:424`: "Each call is exactly one such command, with
     `<skill-root>` and every JSON value spelled out literally: no shell variable, no pipe, no
     trailing command, no compound command, and every `'` inside the JSON, untrusted text included,
     spelled as `'\''`."

   Add no rule for mapping the helper's result or error envelope to an outcome. The fragment states
   no forge-error mapping today (verified: `unobservable` appears in step 1 only for external
   connections, `src/shared/merge-gate-issue-observation.md:25`), and this plan changes no outcome
   rule. Keep the external-issue sentence, "Never model-poll." and "Record each issue as terminal,
   open, timed out, or unobservable." verbatim.
2. Keep the wording compact: about five to eight added lines. The fragment is lazy-loaded behind
   `src/shared/merge-gate-delegated-run.md:1451`, so it does not count toward an always-loaded core
   budget. Confirm with the `Always-loaded core (lines/budget)` report of `node build.mjs` that no
   `contextBudget` changes; `src/tools/merge-gate.md:4` is `contextBudget: 979`.
3. In `test/workflow-contracts.test.mjs`, add one new top-level `async` test placed directly after
   the synchronous test "merge-gate supports already-merged observer re-entry with terminal-only
   reconciliation" (`:12998-13034`). It must be a new test, because `executeOperation` is async
   and no existing test is edited. The file already has async top-level tests, for example at
   `:12147`. A preceding comment names the invariant it protects.
   - It reads step 2 alone, not the whole `### Observation steps` section, which spans steps 1 to 7
     (`src/shared/merge-gate-issue-observation.md:18-385`). It uses the file's existing
     `boundedSlice` helper (`test/workflow-contracts.test.mjs:100`) from `2. Give auto-close
     automation` to `3. **Assess completion`.
   - It checks that this slice contains exactly one `remote-tracker.mjs issue-state-wait <<< '…'`
     call.
   - It replaces only `<issue number>` with `17`; the bare placeholder is not valid JSON, while
     `"<RUNTIME_STATE_ROOT>"` already is a JSON string. It then parses the result and checks that
     the object has exactly the keys `cwd` and `issue`, with `cwd === '<RUNTIME_STATE_ROOT>'` and
     `issue === 17`. The exact-key check rules out every timing or polling field in the shown call.
   - It pins the wording with one `assert.match(prose(<step-2 slice>), near(...))`
     (`near(first, second, span = 300)`, case-insensitive, `test/workflow-contracts.test.mjs:275-280`).
     The tokens are exactly `no timeout, wait or polling field` and `30-second maximum is fixed`.
     The second token must not be `30-second` alone: step 2's existing first sentence already
     contains "fixed 30-second grace period" (`src/shared/merge-gate-issue-observation.md:27`)
     inside the window, and a token matching it would leave the pin vacuous.
4. In the same new test, check that the helper accepts the documented call. This was decided by score: there is one test, the step-2 slice is parsed once,
   and no source-reading helpers are copied into another suite. The file already imports from
   `src/scripts/remote-tracker-core.mjs` (`:25`); extend that import with `executeOperation`. The
   test does four things:
   - It builds the execution payload from the parsed object of step 3, with `cwd` set to a literal
     absolute path, for example `/main/checkout`. No temporary directory is needed: remote operations do not check that `cwd` exists
     (`src/scripts/remote-tracker-core.mjs:7216-7240`). The existing `cwd: '/main/checkout'`
     pattern is at `test/remote-tracker.test.mjs:11370-11383`.
   - It runs `executeOperation('issue-state-wait', <that payload>, { runner, skipProbe: true, sleeper })`.
     An inline fake runner, modelled on `fakeRunner` at `test/remote-tracker.test.mjs:146`,
     answers `git rev-parse --is-inside-work-tree` and
     `git remote get-url origin` (a GitHub origin), which `resolveRepositoryInput` performs. It
     then serves one closed-issue read in the `gh api --include` form: HTTP headers before the JSON
     body, an `html_url`, and no `pull_request` field (`src/scripts/remote-tracker-github-core.mjs:274-279`,
     `src/scripts/remote-tracker-core.mjs:4558-4573`). That response is written inline, modelled on
     the unexported `githubIssueResult` (`test/remote-tracker.test.mjs:12373-12388`).
   - It asserts four things: `ok: true`; `data.result.outcome === 'terminal'`; exactly three
     runner calls, each with the substituted `cwd`; and that the sleeper was never called.
   - It names the invariant: the documented call is accepted without a second invocation.

   Do not add a `repository` key to the payload: the test proves exactly the documented shape.
5. Leave `src/shared/issue-post-merge-observation.md`, `src/scripts/remote-tracker-core.mjs`,
   `src/scripts/remote-tracker-shared-core.mjs`, `docs/user-guide/remote-tracker.md` (whose
   `issue-state-wait` row at `:435` already states the fixed grace period) and the eval fixtures
   unchanged.

### Component structure

Not relevant: no new module or fragment.

### State management

Not relevant: no runtime state changes.

### API integration

Not relevant: the helper interface is unchanged. Only its documented use is added.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **Issue already terminal before the wait:** the helper returns at once (`waitMs: 0`,
  `src/scripts/remote-tracker-core.mjs:4575-4618`). The guidance says the "30-second maximum is
  fixed", so a caller reads 30 seconds as an upper bound, not a fixed delay.
- **Issue number from the receipt:** the receipt item stores `"issue":"#17"`. Copied verbatim,
  that string fails `requireNumber` with `INVALID_REFERENCE`, which is the same
  rejected-call-and-retry failure the issue reports. The guidance therefore says to strip the `#`
  and send a JSON number. A numeric string such as `"17"` would also be accepted
  (`src/scripts/remote-tracker-shared-core.mjs:66`), but the documented form is the JSON number.
- **Several linked issues:** one call per forge issue, unchanged from today's "Record each issue"
  rule. The example shows one issue and adds no batching.
- **External issues:** unaffected. They keep the connection-native monitor or the single 30-second
  wait plus one fresh read.
- **`AMBIGUOUS_HOST`:** the documented call carries no `provider`, which keeps it the same shape as
  `merge-proof-local` and `pr-draft-classify` (`src/shared/merge-gate-delegated-run.md:1058`,
  `:1379`). This was decided by score. On a host the helper cannot classify, including after its
  `tea logins` fallback (`src/scripts/remote-tracker-core.mjs:1357-1374`), the retry with an
  override is governed by `src/shared/remote-helper-contract.md:37-38`, which already reaches the
  Merge Gate run, eagerly through `src/tools/merge-gate.md:88` and
  `src/shared/pr-review-comments.md:52-53`. The fragment gains no prose about it, and the
  no-timing-field sentence deliberately does not forbid that override.
- **A literal `'` in a value:** not reachable, because both values are a path and a number. The
  `'\''` rule of `helper-call-shape` still applies unchanged.

## Acceptance criteria

- [ ] Step 2 of `### Observation steps` in `src/shared/merge-gate-issue-observation.md` contains
      exactly one literal call `node <skill-root>/scripts/remote-tracker.mjs issue-state-wait <<< '{"cwd":"<RUNTIME_STATE_ROOT>","issue":<issue number>}'`.
      The new `test/workflow-contracts.test.mjs` test verifies it.
- [ ] That call's JSON has exactly the keys `cwd` and `issue`, so it carries no timeout, wait or
      polling field. Step 2 contains the phrases "no timeout, wait or polling field" and
      "30-second maximum is fixed" within the `near` window. The same new test verifies both.
- [ ] The same new test runs the payload extracted from the shipped fragment through
      `issue-state-wait`. On its first invocation it gets `ok: true`, `data.result.outcome` is
      `terminal`, and the runner records exactly three calls.
- [ ] `src/shared/issue-post-merge-observation.md`, `src/scripts/remote-tracker-core.mjs` and
      `src/scripts/remote-tracker-shared-core.mjs` are unchanged on the branch
      (`git diff --exit-code origin/develop...HEAD -- <paths>`).
- [ ] `test/helper-call-shape-contract.test.mjs` passes unchanged, including "every source
      showing a read-helper call carries the inline ban sentence".
- [ ] All existing `test/workflow-contracts.test.mjs` Phase 5.5 and observation assertions pass
      unchanged: grace period, "Never model-poll", terminal split, and closure and label rules. No
      existing assertion is edited or removed.
- [ ] CI's order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs` (no `contextBudget`
      change) and `pnpm test:distribution`.

## Validation plan

- First run the focused test files through the project runner:
  `node --test test/workflow-contracts.test.mjs test/helper-call-shape-contract.test.mjs`.
- Then run CI's order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- Run `git diff --exit-code origin/develop...HEAD -- src/shared/issue-post-merge-observation.md src/scripts/remote-tracker-core.mjs src/scripts/remote-tracker-shared-core.mjs`.
- Inspect the built output manually: the call appears in the built
  `effective-flow/shared/merge-gate-issue-observation.md` of each `dist/` target with
  `<skill-root>` left as written, because it is not a build placeholder.
- Run `pnpm eval merge-gate verify` (read-only) and record the resulting freshness debt in the PR
  body. Editing a fragment the `merge-gate` suite loads creates visible evidence debt. Under
  `docs/adr/pragmatic-test-release-policy.md` that debt is reported, not blocking, and a routine
  PR needs no new model run.

## Assumptions and open points

- Assumption: the verified `RUNTIME_STATE_ROOT`'s `origin` resolves to the same repository as the
  PR. Merge Gate's other cwd-only helper calls (`pr-draft-classify`, `merge-proof-local`) already
  rely on this, and step 1 checks the receipt's repository against the fresh canonical PR
  repository before step 2 runs.
- Assumption: the merge-gate eval tracker stub does not match request payloads, so switching the
  documented key from an implicit choice to `issue` needs no fixture change. Verified at
  `evals/_scaffold/remote-tracker.mjs:736-800`, which resolves envelopes by operation.
- Assumption: the merge-gate suite's evidence debt is accepted per the pragmatic test and release
  policy. No eval re-recording is part of this plan.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->
```json
[
  {
    "site": "S-BAT",
    "question": "Where should the executable acceptance test for the documented issue-state-wait call live?",
    "options": ["Single test in workflow-contracts", "Two tests across suites"],
    "escape": [],
    "stop": null,
    "scores": [
      { "label": "Single test in workflow-contracts", "score": 8, "reason": "Parses the step-2 slice once with the existing boundedSlice and runs it through executeOperation, so the prose pin and the executable proof cannot drift; the file already imports from remote-tracker-core.mjs." },
      { "label": "Two tests across suites", "score": 4, "reason": "Copies source-reading helpers into remote-tracker.test.mjs by hand and parses the documented call in two suites that can drift, too heavy for a small bugfix." }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How should the documented Merge Gate issue-state-wait call handle a host where the helper cannot infer the forge provider (AMBIGUOUS_HOST)?",
    "options": ["Add resolved provider override", "Keep minimal call, document edge case"],
    "escape": [],
    "stop": null,
    "scores": [
      { "label": "Add resolved provider override", "score": 3, "reason": "Goes beyond the minimal call the issue asks for, diverges from the sibling merge-proof-local and pr-draft-classify calls, and restates the AMBIGUOUS_HOST retry rule remote-helper-contract.md already owns." },
      { "label": "Keep minimal call, document edge case", "score": 9, "reason": "Matches the issue and the sibling Merge Gate calls and leaves the AMBIGUOUS_HOST retry to remote-helper-contract.md, which already reaches the run, so the contract is stated once." }
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
| Error cases     |        0 |         2 |    2 |
| Testability     |        0 |         0 |    9 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    4 |

### Findings

Gap analysis (Phase 4):

- **Error cases, Important:** the receipt item's `issue` value is the reference string `"#17"`. Copied verbatim it fails `requireNumber`, which is the same retry the issue reports. Adjusted: the guidance says to strip the `#` and send a JSON number, and Edge cases names the case.
- **Error cases, Note:** the claim "a string would fail" was wrong, because a numeric string is accepted. Adjusted: Edge cases now states the actual behaviour.
- **Maintainability, Note:** "rejects any timing field" overstated the seven-field denylist. Adjusted: the guidance makes no such claim.
- **Maintainability, Note:** restating the helper's read-wait-read behaviour would be a third copy of that contract. Adjusted: the step gets only one sentence about the fixed 30-second maximum.
- **Testability, Note:** the planned assertion read all of `### Observation steps` (steps 1 to 7). Adjusted: it reads a `boundedSlice` of step 2.
- **Testability, Note:** the planned tests were split across two suites, used an unnecessary temporary directory and set loose assertions. Adjusted by score: a single test in `test/workflow-contracts.test.mjs` with a literal path, `data.result.outcome`, exactly three runner calls and no sleep.
- **Error cases, Note:** an `AMBIGUOUS_HOST` host is not covered by the minimal call. Adjusted by score: the call stays minimal and `remote-helper-contract` governs the retry, recorded under Edge cases.
- **Testability, Note:** a two-dot `git diff` against `origin/develop` fails once `develop` moves. Adjusted: the check uses the three-dot merge-base form.
- **Testability, Note:** the separate timing-field absence check was redundant with the exact-key check. Adjusted: it was removed.

Internal review (Phase 6):

- **Architecture, Important:** a new `remote-tracker.mjs` call in this fragment would fail `test/helper-call-shape-contract.test.mjs` ("every source showing a read-helper call carries the inline ban sentence"), because the fragment does not carry the sentence. Adjusted: step 2 adds the sentence verbatim, the line estimate is raised, and an acceptance criterion pins that test passing unchanged.
- **Testability, Note:** acceptance criterion 2 claimed the test verifies the no-timeout wording, but only the keys were checked. Adjusted: a `near(...)` pin pairs the instruction with the fixed 30-second maximum.
- **Testability, Note:** three test details were unstated: the `gh api --include` response form, parsing only after substitution, and keeping the call on one source line for `callsOf`. Adjusted: each is stated in Approach steps 1, 3 and 4.
- **Maintainability, Note:** two line references were off (`boundedSlice` and `assertFixedIssueStateWait`). Adjusted.

Deep review (plan-review):

- **Error cases, Important:** "send no field besides `cwd` and `issue`" would forbid the `provider` override that the `AMBIGUOUS_HOST` retry of `remote-helper-contract` adds, which the scored edge-case decision relies on. Adjusted: the sentence names the forbidden timing fields instead of an exclusive key list. The exact-key check stays on the shown call only.
- **Testability, Note:** the planned key check expected `cwd` to be `"<RUNTIME_STATE_ROOT>"` after that placeholder had already been substituted. Adjusted: only `<issue number>` is replaced before parsing, and the execution payload sets `cwd` afterwards.
- **Testability, Note:** the `near(...)` tokens were unnamed, and a bare `30-second` token would match the existing "fixed 30-second grace period" sentence. Adjusted: the exact tokens are named, and the edge-case wording is aligned with them.
- **Testability, Note:** the test's placement was ambiguous, because the neighbouring test is synchronous, and the outcome checkpoint still said "two tests". Adjusted: the change is one new top-level `async` test after `:13034`, and the checkpoint says one test.
- **Maintainability, Note:** two evidence citations were wrong (`githubIssueResult`, and the receipt's `#<n>` form). Adjusted.

## Open points

- No open points.
