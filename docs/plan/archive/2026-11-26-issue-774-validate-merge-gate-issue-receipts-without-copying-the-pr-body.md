# Validate Merge Gate issue receipts without copying the PR body

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)
**Issue:** #774

## Requirement

Merge Gate validates the versioned issue-lifecycle receipt from the fresh pull-request body. Today
it gets that body from the helper's `pr-read`, which returns it as JSON into the model context. The
model then re-sends the same Markdown inline as `body` to `issue-lifecycle-receipt-parse` and to
`body-hash`. Every merge-gate eval fixture stubs both calls with an inline `body`, e.g.
`evals/merge-gate/fixtures/merge-proceeds.json:665`, and `evals/merge-gate/README.md:753-764`
calls them routine on the merge paths. On T3 Code the host's own `pull_request_read` tool ("use
instead of gh") is a second possible source. Its output reaches only the model context, so it can
only be transcribed. Hand transcription can corrupt escapes, truncate the body or reuse a stale
copy. That can make a valid receipt unobservable or hide a duplicate marker.

Goal: the body never passes through the model on its way to the parser. The helper parses the
receipt and hashes the body from the same provider response its `pr-read` normalizes. It binds both
to the PR number and to the repository that read came from. Merge Gate requires that repository to
equal its canonical repository. A host PR read is never a receipt source. When the provider payload
does not state the body, receipt observation is unavailable. The existing parser and validation
rules stay unchanged.

One deliberate behaviour change: Phase 5.5 now re-checks the receipt against its merge-proving
fresh read. A receipt edited or removed after Phase 0 therefore ends issue observation (the merge
stands) instead of acting on the stale Phase 0 copy.

Workflow rationale: **Feature**. It adds an opt-in helper output contract and changes Merge Gate's
observable input path. It is not a defect fix in one existing behaviour, and it is more than a
refactoring because the helper interface grows.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow, issue #774 (autopilot run `ap-20261126T151902Z-3f884b6e`).
**Original outcome:** Merge Gate validates the issue-lifecycle receipt with no manual PR-body transcription, on the supported T3 path and every other host. The multiline/quote/backslash fixture is detected unchanged. A duplicate receipt, a repository mismatch or an unstated body never authorizes tracker access. A missing or invalid receipt leaves merge eligibility unchanged and triggers no heuristic lookup.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** Opt-in helper-side receipt parsing and body hashing in `pr-read`, consumed by Merge Gate Phase 0 and the Phase 5.5 entry read.
**Continuation decision:** none

## Architecture decisions

- **`pr-read` grows an opt-in receipt result (scored decision S-CLR, see "Decided by score").**
  When the input carries `receiptContext`, the `pr-read` operation adds two fields to its
  normalized record. `bodySha256` is computed with the existing `bodyHash`. `issueLifecycleReceipt`
  is a state object with one of four states:
  - `valid`, with `version` and the normalized `receipt`;
  - `absent`;
  - `invalid`, with the parser's error `code`;
  - `unavailable`, with a `reason`.

  Both fields come from the same provider response that produced `body`, `number` and `state`.
  This follows two existing precedents in `src/scripts/remote-tracker-core.mjs`:
  - the helper-side `planPrMarker` / `planPrMarkerError` in `normalizePullRequestRecord`
    (`:3216-3228`);
  - `pr-acceptance-sources` (`:6990-7010`), which calls `parseIssueLifecycleReceipt` helper-side
    and records a parse failure as `invalid` without failing the read.

  Without `receiptContext` the output is unchanged.

- **The fields are attached in the `pr-read` operation path, not in the shared normalizer.**
  `normalizeRemoteData('pr-read', …)` is also called by the `pr-update-body` precondition
  (`:4668`), `pr-draft-classify` (`:8045`), the acceptance read (`:5971`) and a readback (`:7746`).
  Attaching after `receiptContext` validation, in the operation path only, means those internal
  reads can never emit or drop receipt fields by accident.
- **Repository binding.** The helper-side parse always passes the executed repository object
  (slug and host) as `expectedRepository`, as `pr-acceptance-sources` does (`:7002`).
  `normalizeIssueLifecycleReceipt` (`:503-517`) would otherwise silently default the binding to the
  receipt's own repository. A bare slug would also drop the host that URL item references need
  (`src/scripts/remote-tracker-shared-core.mjs:110-124`, `:150-169`).
  - The slug can come from a caller-supplied `repository`/`remote` input (`:1303-1333`), which the
    eval fidelity replay uses (`test/eval-fixture-fidelity.test.mjs:885-887`). Rejecting that input
    is therefore out of scope.
  - The guarantee is that a receipt is bound to the repository its body was read from. Merge Gate
    Phase 0 already requires that repository to be its canonical one: a PR of another repository
    ends without mutation (`src/tools/merge-gate.md:160-161`). The record's `repository` must
    equal the Phase 0 `repository-resolve` slug.
  - `pr-read` has no closed input schema, so a stray top-level key (e.g. `expectedRepository`) is
    ignored, never used. A unit test pins that it cannot change the binding.
- **`receiptContext` is closed, its checks are optional, and it is validated before the provider
  call (scored decision S-BAT, "Optional target checks").**
  - `receiptContext: {}` is valid. The read repository is always bound.
  - Its only keys are `expectedTarget` (`forge` or `external`) and `expectedExternalTool`. Each is
    checked only when given. `expectedExternalTool` is validated with `lifecycleExternalTool` and
    is not allowed with `expectedTarget: forge`.
  - A non-object, an unknown key or a malformed value is `INVALID_PAYLOAD` before the provider
    call.
  - Merge Gate passes `{}`. As today, the receipt names its own target, and observation step 1
    keeps checking target, repository and tool (`merge-gate-issue-observation.md:20-26`,
    `merge-gate-delegated-run.md:185-186`).
  - Merge Gate therefore never reads `tracker.mode` for this, never triggers the first-run tracker
    question, and a tracker setup error can never block PR resolution or merge eligibility.
- **Empty versus unstated body.** The check is on the raw provider object, before
  `normalizeIssue`, which maps `null`/missing to `''` (`:2932`).
  - A stated `body` of `null` or `""` is `absent`, with `bodySha256 = sha256("")`. GitHub states
    `null` for an empty description and Forgejo states `""`, so both providers behave the same.
    This matches the existing write-path hash (`:4668-4670`) and the acceptance precedent (`:6997`).
  - A payload without a `body` key, or with a non-string, non-null `body`, is `unavailable` with
    reason `body-not-stated`, and carries no `bodySha256`.
  - A body the helper read is otherwise complete by construction: it is the provider's stored
    field, not displayed text. No length heuristic is added.
- **The consumer rule is scoped to observation (scored decision S-DEC, "Receipt fragment,
  capped").** The rule lives once, in its owning fragment
  `src/shared/issue-lifecycle-receipt.md`, capped at two to three lines, and applies only to validating an existing pull
  request's receipt for issue observation:
  - take the receipt and body hash only from a `pr-read` with `receiptContext`;
  - never pass a body copied from a read to `issue-lifecycle-receipt-parse` or `body-hash`;
  - a host PR read such as T3 Code's `pull_request_read` is never a receipt or hash source.

  Producer write paths keep their fresh-read-and-hash rule untouched: `issue-lifecycle.md:42-46`,
  `apply-review-remote.md:111`, `pr.md:291` and `pr-automation-lines.md:26`. The inline-body
  operations stay for them.

- **`bodySha256` is kept.** It replaces the "body hash" Merge Gate already retains
  (`merge-gate.md:159`, `merge-gate-delegated-run.md:584`) with a helper-computed value. It is the
  record that binds the observed body to the read. No new guard consumes it.
- **No new runtime state and no new transport.** There is no raw-body file and `{inputFile}` is
  not used. That transport carries model-serialized JSON, so it would not remove the transcription.
- **Eval evidence (scored decision S-BAT, "Remove stubs and assert no call").**
  - The merge-gate fixtures drop their `issue-lifecycle-receipt-parse` and `body-hash` stubs.
  - Both operations join merge-gate's `alwaysAllowedOperations` (`evals/merge-gate/suite.config.mjs:182`).
    Otherwise a call would become a shared validity problem (`evals/_scaffold/evaluate.mjs:358-370`),
    the run would be marked invalid and retried (`evals/_scaffold/round-core.mjs:893`), and the
    regression would be discarded instead of recorded.
  - The merge-gate evaluator (`evals/merge-gate/_scaffold/evaluate.mjs`, `findings` /
    `fixtureIndependentFindings` / `decisiveFindings`, `:1152-1240`) emits a decisive finding for
    any call to either operation. An aborted run that made the call counts too.
  - The tool-neutral `evals/_scaffold/` stays unchanged.
  - Archive compatibility (scored decision S-DEC, "Digest-scoped finding"). `pnpm test` re-checks
    the 45 archived runs, 37 of which call these operations, against the current fixture and
    evaluator (`test/merge-gate-eval.test.mjs:201`, `:1220-1227`, `:1423-1500`). The new finding
    therefore applies only to runs whose stamped fixture digest matches the current fixture. Both
    operations join `STUB_ANSWERED_OPERATIONS`, so archived calls stay readable. The archived
    evidence becomes freshness debt and is not deleted.
- **Eval limit accepted (scored decision S-BAT, "Accept the limit").** The stub picks envelopes by
  operation name and the call log records no input (`evals/_scaffold/remote-tracker.mjs:489-521`,
  `:739-744`). So no eval can show that Merge Gate actually sends `receiptContext`. The contract
  assertions cover that wiring, and the merge-gate README records the limit.
- **Phase 0 override is local.** Phase 0 step 1 resolves the PR through the shared
  `pr-review-comments` fragment, which `iterate` also uses (`:79-82`, `pr-list` when no argument is
  given). `merge-gate.md` states locally that Phase 0 always ends in a `pr-read` with
  `receiptContext`, also after `pr-list`. The shared fragment is unchanged, and the delegated run's
  Entry re-run of Phase 0 step 1 (`merge-gate-delegated-run.md:44-47`) inherits the override.

## Affected files

| File                                         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/scripts/remote-tracker-core.mjs`        | `pr-read` operation path (near `:4144` and its executor). Validate the closed `receiptContext` before the provider call. With it, attach `bodySha256` and `issueLifecycleReceipt` via `parseIssueLifecycleReceipt` and `bodyHash`, using the raw payload's `body` statement and binding `expectedRepository` to the executed repository object (slug and host). Validate `receiptContext` beside the `pr-list` `planPath` check (`:7242`), before repository resolution (`:7254`), so an invalid context invokes no runner. An `output`-flattened shape (`:4145`) with `receiptContext` gets `unavailable` / `body-not-stated`. Catch only `RemoteTrackerError` into `invalid` with its `code`. Shared `normalizeRemoteData` stays unchanged.                                                                                                                                                                                              |
| `src/shared/issue-lifecycle-receipt.md`      | After the paragraph "For deterministic forge-side construction and parsing", add the observation-scoped consumer rule, two to three lines. Reword the existing "use the helper operations … `issue-lifecycle-receipt-parse`" sentence so it no longer reads as the observation path. It maps `absent` / `invalid` / `unavailable` to "issue observation unavailable", with merge eligibility unchanged and no heuristic tracker access. This fragment is eager in three tools via `issue-lifecycle`.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/tools/merge-gate.md`                    | Phase 0 step 1 (`:157-170`): always end PR resolution in a `pr-read` with `receiptContext: {}`, also after `pr-list` (local override of `pr-review-comments`). Retain the helper's `bodySha256` and `issueLifecycleReceipt`. Require the record's `repository` to equal the canonical slug. Route the three existing outcomes on the state, treating `unavailable` like `invalid`. Update `contextBudget` from the build report.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/shared/merge-gate-delegated-run.md`     | Phase 5.5 entry (`:1445-1453`): the merge-proving fresh read is a `pr-read` with `receiptContext`. A non-`valid` state there ends the phase before the observation fragment loads. `:584`: the retained hash and parse result are the helper fields. `:1597-1598`: the receipt result lists `absent`, `invalid`, `unavailable` (with reason), `changed` (the entry read's receipt differs from the Phase 0 one, or its state is no longer `valid` after a `valid` Phase 0) or `valid`.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/shared/merge-gate-issue-observation.md` | Step 1 (`:20-24`): additionally require the entry read's `valid` receipt to equal the retained receipt. Otherwise end observation with the Phase 6 result `changed` (merge stands). The "must be `valid`" rule stays in the core entry text, because this fragment loads only after it (`:3-11`). This adds no extra `pr-read`. Step 3's "exactly one `pr-read` for the whole run" for title and body (`:92-95`) and step 4's per-issue bound are unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `docs/user-guide/remote-tracker.md`          | `:904-925` `pr-read` field list: document `receiptContext`, `bodySha256`, `issueLifecycleReceipt` and their states.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `test/remote-tracker.test.mjs`               | New `pr-read` tests near `:13403` (cases under "Validation plan"). Existing parse tests (`:11960-12200`) are unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `test/workflow-contracts.test.mjs`           | Near `:12729-12755`: assert four invariants, each naming the invariant it protects. (1) The observation-scoped consumer rule is present, including "a host PR read … is never a source". (2) Merge Gate Phase 0 and the Phase 5.5 entry name `receiptContext`. (3) The Phase 5.5 entry in `merge-gate-delegated-run.md` ends the phase on a non-`valid` entry-read state, and observation step 1 requires equality with the retained receipt, reporting `changed` otherwise. (4) No body handoff to `issue-lifecycle-receipt-parse` or `body-hash` in `src/tools/merge-gate.md`, `src/shared/merge-gate-delegated-run.md` and `src/shared/merge-gate-issue-observation.md`. Scope it to those three sources: the producer write paths in `issue-lifecycle-receipt.md` and `issue-lifecycle.md` legitimately name the operations. Also update the assertion at `:13848-13856` that pins "absent, invalid, or valid" to the new result list. |
| `test/eval-fixture-fidelity.test.mjs`        | `:930-961`: drop both `body-hash` (`:948`) and `issue-lifecycle-receipt-parse` from the required list, and rewrite the comment above it, which names `body-hash` as a required local operation. Replace the two body-hash tests (`:972-1022`) with one: every fixture's `pr-read` stub input carries `receiptContext`. The existing replay of every stub through `executeOperation` (`:875-905`) already proves that the receipt fields match the real helper, so no second check is added.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `evals/merge-gate/fixtures/*.json`           | All 30 fixtures: add `receiptContext` and the two fields to the `pr-read` stub, and remove the `issue-lifecycle-receipt-parse` and `body-hash` stubs. A receipt-carrying fixture gets the multiline, quote and backslash body.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `evals/merge-gate/suite.config.mjs`          | `:182`: add `issue-lifecycle-receipt-parse` and `body-hash` to `alwaysAllowedOperations`. This is a hashed instrument file, so every archived merge-gate round goes stale (evidence debt).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `evals/merge-gate/_scaffold/evaluate.mjs`    | `:1152-1240`: emit a decisive finding for any call to either operation, also from aborted runs. Emit it only in `findings` for runs whose stamped fixture digest matches the current fixture, never in `fixtureIndependentFindings`, so archived runs keep being judged by their stamped fixture.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `test/merge-gate-eval.test.mjs`              | `:201`: add both operations to `STUB_ANSWERED_OPERATIONS`, or derive that set from the suite's `alwaysAllowedOperations`, so `assertArchivedRunsReadable` (`:1220-1227`, `:1423-1500`) reads the 37 archived runs that call them as clean. Add a unit test for the new finding using the synthetic call-log helpers (`:2702ff`), covering a fixture-compatible run (finding) and an archived, digest-mismatched run (no finding).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `evals/merge-gate/README.md`                 | `:753-764`: replace the `body-hash` paragraph with the new contract and the no-call finding. Record the evidence debt and the accepted limit that no eval shows `receiptContext` was sent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## Implementation details

### Approach

1. **Helper input:** in `remote-tracker-core.mjs`, validate an optional `receiptContext` for
   `pr-read` beside the `pr-list` `planPath` check (`:7242`). This happens before repository
   resolution (`:7254`) and before any provider call. The keys are closed, and the optional checks
   apply only when given.
2. **Helper output:** in the `pr-read` operation path, after normalization and only with
   `receiptContext`, use the raw payload's `body`:
   - a missing key or non-string non-null value gives `unavailable` / `body-not-stated`, no hash;
   - otherwise take `text = body ?? ''` and set `bodySha256: bodyHash(text)`, then call
     `parseIssueLifecycleReceipt(text, {expectedRepository: repository, ...givenChecks})`:
     - `found: false` gives `absent`;
     - `found: true` gives `valid` with `version` and `receipt`;
     - a `RemoteTrackerError` gives `invalid` with `code`;
     - any other error propagates.

   The read stays successful in every state.

3. Cover both providers. GitHub reads the REST pulls object
   (`remote-tracker-github-core.mjs:437`). Forgejo reads the raw `structs.PullRequest`
   (`remote-tracker-forgejo-core.mjs:318`), with `merged` mapped to `state: merged`
   (`:4144-4150`). Both reach the operation path as `parsed.raw` (`:7871-7887`). `pr-read` never
   dry-runs. An `output`-flattened shape (`:4145`) with `receiptContext` gets `unavailable` /
   `body-not-stated`, so no fifth "missing field" state exists.
4. **Contract text:** add the consumer rule to `issue-lifecycle-receipt.md`. Then update
   `merge-gate.md` Phase 0 step 1, the Phase 5.5 entry, `:584` and `:1598` of
   `merge-gate-delegated-run.md`, and step 1 of `merge-gate-issue-observation.md`. The outcomes
   stay the existing ones:
   - `valid` gives the normal gate or observer-only mode;
   - `absent`, `invalid` and `unavailable` give "issue observation unavailable", with merge
     eligibility unchanged and no heuristic lookup;
   - at the Phase 5.5 entry, a Phase 0 `valid` receipt that is no longer `valid`, or differs,
     ends observation with the Phase 6 result `changed` (scored decision S-DEC).
5. **Docs, tests, fixtures, evaluator:** update the user guide, add the helper tests, update the
   contract and fidelity tests, rewrite the 30 fixtures, add the digest-scoped evaluator finding
   and the archive-readability allowance, and confirm `pnpm test` accepts the 45 archived runs. Run
   `node build.mjs` and copy the new `contextBudget` values from its "Always-loaded core" report for
   `merge-gate`, `apply-issues` and `apply-review-remote`, the tools that include `issue-lifecycle`.
6. Run CI's order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
   Then run `pnpm eval <suite> verify` for all five suites and record their state.

### Edge cases

- CRLF bodies, a receipt line with trailing spaces, or a receipt in a fence or quote: the existing
  parser rules decide (exactly one complete line).
- Two receipt prefixes, even identical ones: `invalid` / `INVALID_PAYLOAD`. No tracker access.
- A forge receipt naming another repository than the read's: `invalid` /
  `REFERENCE_REPOSITORY_MISMATCH`. The same applies to a URL item with the same slug on another
  host. A stray top-level `expectedRepository` key changes nothing.
- A `pr-read` record whose `repository` differs from the canonical slug: Merge Gate's existing
  other-repository ending, without mutation.
- An external receipt whose tool differs from a given `expectedExternalTool`: `invalid`. Merge Gate
  passes none, so the tool is checked in observation step 1, as today. `expectedExternalTool` with
  `expectedTarget: forge`, or a malformed value, gives `INVALID_PAYLOAD` before the provider call.
- GitHub `body: null` and Forgejo `body: ""`: both `absent`, with the hash of `""`.
- Payload without a `body` key: `unavailable` / `body-not-stated`.
- Body edited between Phase 0 and the Phase 5.5 entry read: the fresh read decides, and the merge
  stands either way. A non-`valid` fresh state ends the phase at the entry. A differing `valid`
  receipt ends it at observation step 1. Phase 6 reports `changed` in both cases when Phase 0 was
  `valid`.
- Callers without `receiptContext` (iterate, `pr`, acceptance sources, internal reads): output is
  unchanged.

## Acceptance criteria

- [ ] `pr-read` with `receiptContext` returns `bodySha256` and `issueLifecycleReceipt` from the same provider response as `body`. Without it, the result is deep-equal to today's for the same payload (tests in `test/remote-tracker.test.mjs`).
- [ ] A fake-runner provider body with multiline Markdown, double and single quotes, backslashes (including `\\` and `\"`) and one valid receipt line yields `state: "valid"` with the expected receipt, and a `bodySha256` equal to the sha256 of the exact payload body (test).
- [ ] Duplicate receipt lines give `invalid` / `INVALID_PAYLOAD`, a receipt for another repository gives `invalid` / `REFERENCE_REPOSITORY_MISMATCH`, and a payload without `body` gives `unavailable`. None of these fails the read or yields `valid`. A stray top-level `expectedRepository` key does not change the binding (tests).
- [ ] `receiptContext: {}` is accepted. An invalid `receiptContext` fails with `INVALID_PAYLOAD` before any runner call, including repository resolution: a non-object, an unknown key, a malformed target or tool, or a tool with `forge`. Tests run without a caller-supplied `repository` and assert that the runner was not invoked.
- [ ] A receipt whose URL item names the same slug on another host gives `invalid` / `REFERENCE_REPOSITORY_MISMATCH`, and an `output`-flattened `pr-read` with `receiptContext` gives `unavailable` (tests).
- [ ] `src/shared/issue-lifecycle-receipt.md` states the observation-scoped consumer rule once, including the host-read exclusion. Merge Gate Phase 0, the Phase 5.5 entry and observation step 1 consume only the helper fields, and no merge-gate source passes a read body to `issue-lifecycle-receipt-parse` or `body-hash` (assertions in `test/workflow-contracts.test.mjs`).
- [ ] Merge-gate text maps `absent`, `invalid` and `unavailable` to "issue observation unavailable", with merge eligibility unchanged and no heuristic tracker lookup. The Phase 6 receipt result lists `unavailable` (contract assertion).
- [ ] The Phase 5.5 entry ends the phase on a non-`valid` entry-read state. Observation step 1 requires the `valid` receipt to equal the retained one. A Phase 0 `valid` receipt that is non-`valid` or different at the entry read is reported as `changed`. Step 3's assessment `pr-read` stays a separate read (contract assertions).
- [ ] All merge-gate fixtures satisfy the rewritten `test/eval-fixture-fidelity.test.mjs`. The merge-gate evaluator emits a decisive finding for a fixture-compatible run whose call log contains `issue-lifecycle-receipt-parse` or `body-hash`, and does not mark it invalid. Archived digest-mismatched runs get no such finding, and `assertArchivedRunsReadable` accepts all 45 archived runs (unit tests in `test/merge-gate-eval.test.mjs`).
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass. `pnpm eval <suite> verify` reports no integrity error for all five suites; freshness debt is expected and reported.

## Validation plan

- Unit: `pr-read` receipt tests for GitHub and Forgejo in the fake-runner style of `test/remote-tracker.test.mjs:13403`. Cases:
  - valid, with the special-character fixture;
  - absent, GitHub `null` body, Forgejo `""` body;
  - unstated body;
  - duplicate;
  - repository mismatch, the same slug on another host, and the stray top-level key;
  - the `output`-flattened shape;
  - external tool mismatch with a given tool, and an empty `receiptContext`;
  - forge with a tool, a malformed value, and an unknown `receiptContext` key;
  - unchanged output without `receiptContext`.
- Contract: `test/workflow-contracts.test.mjs` assertions for the consumer rule and the Merge Gate wiring.
- Fixture fidelity and evaluator: `test/eval-fixture-fidelity.test.mjs` over all merge-gate fixtures, plus the `test/merge-gate-eval.test.mjs` unit test for the new decisive finding.
- Build guards: `node build.mjs` (context budgets, include closure), then `pnpm test:distribution`.
- Behavioural evidence: `pnpm eval <suite> verify` for all five suites. `issue-lifecycle-receipt` is also lazily reachable from other tools through `scored-decisions.md:186`, so other suites may carry freshness debt. Re-recording the merge-gate suite is a manual follow-up per `docs/adr/pragmatic-test-release-policy.md` and is not part of this change.

## Assumptions and open points

- Verified: Merge Gate reads the PR through the helper's `pr-read` (`src/shared/pr-review-comments.md:79`). No source uses T3 Code's `pull_request_read`, and `src/shared/host-pr-watch.md` uses only watch, link and unwatch tools. So the supported T3 path is the same helper path, and excluding a host read as a receipt source closes the T3-specific risk.
- Verified: `parseIssueLifecycleReceipt` enforces a single line and a single marker, version `v1`, closed keys, repository and tool binding, and rejection of conflicting duplicates (`src/scripts/remote-tracker-core.mjs:485-596`). It is reused unchanged.
- Verified: `pr-read` already has a Claude allow rule (`src/scripts/claude-settings-core.mjs:162`). No operation is added, so the allowlist is unchanged.
- Gap-analysis decisions incorporated without a score, because the existing code decides them:
  - a `null` body is `absent`, as on the write path and in the acceptance precedent;
  - a caller-supplied repository stays allowed, the binding is to the read repository, and Merge Gate checks the canonical slug, because the fidelity replay depends on it;
  - `bodySha256` replaces the hash Merge Gate already retains.
- Assumption: a provider-stated body string is complete. GitHub and Forgejo return the stored body in their API objects, with no display truncation.
- Out of scope: the receipt _write_ path for an existing PR (`src/shared/issue-lifecycle.md` "Receipt write paths", `pr-update-body`). It is a producer path with its own `STALE_WRITE` hash guard.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[{"site":"S-CLR","question":"Which machine-to-machine handoff should carry the fresh pull-request body to the existing lifecycle-receipt parser in Merge Gate?","options":["Extend pr-read","Dedicated read-and-parse operation","Raw-body input file from the T3 read"],"escape":[],"stop":null,"scores":[{"label":"Extend pr-read","score":8,"reason":"Follows the existing planPrMarker pattern in normalizePullRequestRecord and takes receipt result, body sha256, number and repository from the same provider response Merge Gate already reads, so nothing is transcribed and no second read needs reconciling."},{"label":"Dedicated read-and-parse operation","score":6,"reason":"Removes transcription too, but adds a second provider read beside the retained pr-read, so head SHA and body hash must be reconciled across two responses, plus a new operation to dispatch, classify and stub."},{"label":"Raw-body input file from the T3 read","score":2,"reason":"The T3 read returns content only into the model context, so the model would still write the body itself, keeping the escaping, truncation and stale-copy risk, with nothing binding the file to a fresh provider read."}]},{"site":"S-BAT","question":"How should the merge-gate eval fixtures and tests evidence that Merge Gate no longer transcribes the PR body into issue-lifecycle-receipt-parse or body-hash?","options":["Remove stubs and assert no call","Keep stubs and assert no call","Stub enforces receiptContext"],"escape":[],"stop":null,"scores":[{"label":"Remove stubs and assert no call","score":8,"reason":"Matches the plan fidelity rewrite; the merge-gate evaluator already fails runs calling an operation the fixture leaves undefined, so a stray parse or body-hash call fails visibly, and the explicit call-log assertion evidences the no-transcription criterion."},{"label":"Keep stubs and assert no call","score":5,"reason":"Catches a regression too, but the kept stubs and fidelity checks still describe the inline-body transcription path the change removes."},{"label":"Stub enforces receiptContext","score":3,"reason":"Checks receiptContext only, lets a transcribing run pass silently, and changes the shared scaffold instrument for every suite."}]},{"site":"S-BAT","question":"What receiptContext contract should pr-read enforce for the receipt target and external tool?","options":["Optional target checks","Map tracker.mode","Strict context, soft failure"],"escape":[],"stop":null,"scores":[{"label":"Optional target checks","score":8,"reason":"Keeps the current split where the receipt names its target and observation step 1 checks target and tool, so Merge Gate never reads tracker.mode, never triggers the first-run tracker question and cannot block PR resolution."},{"label":"Map tracker.mode","score":5,"reason":"Binds the target earlier and keeps the read non-fatal, but adds new tracker.mode reading to Phase 0, must guard the unset-mode question, and duplicates the step 1 check."},{"label":"Strict context, soft failure","score":3,"reason":"Still forces deriving the target from configuration and turns real caller mistakes into silent receipt unavailability instead of INVALID_PAYLOAD."}]},{"site":"S-BAT","question":"Should the eval layer additionally evidence that Merge Gate actually sends receiptContext on its pr-read?","options":["Accept the limit","Stub gates receipt fields","Log input key names"],"escape":[],"stop":null,"scores":[{"label":"Accept the limit","score":7,"reason":"Fits the plan: the contract test asserts that Phase 0 and the Phase 5.5 entry name receiptContext and the README records the limit, leaving the shared tool-neutral scaffold untouched."},{"label":"Stub gates receipt fields","score":6,"reason":"Only option that shows the behaviour at run time, but makes the shared operation-name-only stub read its input, adding evidence debt to all five suites."},{"label":"Log input key names","score":4,"reason":"Changes the pinned call-log schema every suite reads, yet proves only key presence, not validity."}]},{"site":"S-DEC","question":"How should the change keep pnpm test green against the archived merge-gate evidence?","options":["Remove archived rounds","Digest-scoped finding","Keep stubs, scoped no-call finding","Decide later"],"escape":["Decide later"],"stop":null,"scores":[{"label":"Remove archived rounds","score":3,"reason":"Deletes costly evidence to pass tests and turns accepted freshness debt into a coverage gap."},{"label":"Digest-scoped finding","score":8,"reason":"Removing the stubs changes the fixture digest so archived runs are judged fixture-independently without the new finding, and adding both operations to STUB_ANSWERED_OPERATIONS keeps archived calls readable, preserving earlier decisions and the expected freshness debt."},{"label":"Keep stubs, scoped no-call finding","score":4,"reason":"Unchanged digests keep archived runs fixture-compatible so the finding still hits them, and it reverses the scored stub-removal decision."}]},{"site":"S-DEC","question":"What should Phase 6 report when the receipt state at the Phase 5.5 entry read differs from the Phase 0 state?","options":["Fresh state with changed note","Distinct changed result","Decide later"],"escape":["Decide later"],"stop":null,"scores":[{"label":"Fresh state with changed note","score":5,"reason":"Keeps the fresh diagnostic detail but needs an extra rule and lets a differing fresh valid receipt read as valid although observation ended."},{"label":"Distinct changed result","score":7,"reason":"One added word in the existing single result list states exactly why observation ended and avoids the misleading valid-but-not-observed case."}]},{"site":"S-DEC","question":"Where should the observation-scoped consumer rule live?","options":["Receipt fragment, capped","Merge Gate Phase 0","Decide later"],"escape":["Decide later"],"stop":null,"scores":[{"label":"Receipt fragment, capped","score":8,"reason":"The owning receipt-contract fragment already holds consumer rules and its parse instruction would otherwise contradict the new rule; two to three lines on three eager hosts is worth the state-once guarantee."},{"label":"Merge Gate Phase 0","score":5,"reason":"Saves tokens on producer hosts but splits the contract from its owner, leaves the fragment parse instruction misleading, and misses the Phase 5.5 entry and observation step 1."}]}]
```

<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    0 |
| Security        |        0 |         0 |    1 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         1 |    1 |
| Testability     |        1 |         2 |    4 |
| Scope           |        0 |         0 |    2 |
| Maintainability |        0 |         0 |    2 |

### Findings

Internal review (Phase 6):

- Architecture, Important: a required `receiptContext.expectedTarget` taken from configuration would make Merge Gate depend on `tracker.mode`, and a tracker setup error could block PR resolution. Incorporated: the checks are optional, Merge Gate passes `{}`, and observation step 1 keeps the target and tool checks (scored decision).
- Testability, Important: with the stubs removed, a call would become a shared validity problem, and the run would be retried away instead of recorded. Incorporated: both operations are always allowed in the merge-gate suite, and the merge-gate evaluator emits a decisive finding (unit test in `test/merge-gate-eval.test.mjs`).
- Testability, Note: no eval can show that `receiptContext` is actually sent. Accepted as a documented limit (scored decision). Contract assertions cover the wiring.
- Testability, Note: the Phase 5.5 equality rule had no acceptance criterion. Incorporated as its own criterion with a contract assertion. Step 3's read stays separate.
- Testability, Note: the assertion pinning "absent, invalid, or valid" was missing, and the no-body-handoff invariant needed a narrow scope. Both incorporated.
- Maintainability, Note: PR resolution is shared with `iterate`. Incorporated as a local Merge Gate override.
- Maintainability, Note: the proposed fidelity check duplicated the existing stub replay. Simplified.
- Scope, Note: other suites may carry freshness debt through `scored-decisions`. The last criterion now covers all five suites.

Deep plan review (Phase 6b):

- Testability, Critical: `pnpm test` re-checks the 45 archived merge-gate runs against the current fixture and evaluator, and 37 of them call the removed operations. Incorporated: the new finding is scoped to fixture-compatible runs, both operations join `STUB_ANSWERED_OPERATIONS`, and the archived evidence becomes freshness debt (scored decision). `test/merge-gate-eval.test.mjs:201` is named.
- Testability, Important: `body-hash` stayed in the fidelity required list. Incorporated: both entries and the comment above the list are updated.
- Architecture, Important: the "must be `valid`" rule was placed in a fragment that loads only after that decision. Incorporated: the rule moves to the core Phase 5.5 entry, and step 1 keeps only the equality check.
- Error cases, Important: the Phase 6 report had no value for a receipt that changed between Phase 0 and Phase 5.5. Incorporated as a distinct result `changed` (scored decision).
- Security, Note: binding only the slug dropped the host that URL item references need. Incorporated: the executed repository object is bound, as in `pr-acceptance-sources`, with a cross-host test.
- Error cases, Note: `pr-read` never dry-runs, and the `output`-flattened shape would have produced a fifth "missing field" state. Incorporated: that shape yields `unavailable`.
- Testability, Note: an invalid `receiptContext` could still invoke the runner during repository resolution. Incorporated: validation runs before resolution, and the test omits `repository`.
- Data protection, Note: an eager rule would cost context in producer-only tools. Incorporated: it stays in the owning fragment, capped at two to three lines (scored decision).
- Scope, Note: the conditional `test/iterate-eval.test.mjs` row is removed, because the helper's local operation set does not change.

## Open points

- No open points.

## Build completion

**Date:** 2026-11-26
**Workflow:** `effective-flow build` (autopilot run `ap-20261126T151902Z-3f884b6e`, inline Quality, isolation unavailable)

### Requirement

Merge Gate validates the issue-lifecycle receipt from the helper's own provider read, so the
pull-request body never passes through the model on its way to the parser (issue #774).

### Architecture decisions

- Implemented as planned: `pr-read` takes an opt-in, closed `receiptContext`, validated before
  repository resolution, and then adds `bodySha256` and `issueLifecycleReceipt` (`valid`, `absent`,
  `invalid`, `unavailable`) from the raw provider object, bound to the executed repository (slug
  and host). The attachment lives in the `pr-read` operation path; `normalizeRemoteData` is
  unchanged.
- Phase 5.5 names its outcome: after a `valid` Phase 0 receipt, a non-`valid` entry read reports
  `changed`; without a `valid` Phase 0 receipt the phase ends at the entry and Phase 6 keeps the
  Phase 0 result (review finding F1).
- Deviation: archived-run compatibility needed two test-side adjustments the plan did not name.
  `assertArchivedRunsReadable` in `test/merge-gate-eval.test.mjs` drops the body-transcription
  finding for runs whose stamped fixture digest differs from the current fixture, and
  `copyRestampedResults` in `test/support/merge-gate-round-fixtures.mjs` strips the two
  now-unstubbed operations from archived logs it restamps, so a restamped archive copy is not
  judged as a fresh transcribing run. Real fixture-compatible runs keep the finding.
- `STUB_ANSWERED_OPERATIONS` was replaced by the suite's `alwaysAllowedOperations` (the plan's
  offered alternative).

### Affected files

`src/scripts/remote-tracker-core.mjs`; `src/shared/issue-lifecycle-receipt.md`,
`src/shared/merge-gate-delegated-run.md`, `src/shared/merge-gate-issue-observation.md`,
`src/tools/merge-gate.md`, `src/tools/apply-issues.md`, `src/tools/apply-review-remote.md`
(`contextBudget` 985, 1009, 394); `docs/user-guide/remote-tracker.md`,
`docs/user-guide/tools-deliver.md`, `docs/user-guide/troubleshooting.md`; all 30
`evals/merge-gate/fixtures/*.json`, `evals/merge-gate/suite.config.mjs`,
`evals/merge-gate/_scaffold/evaluate.mjs`, `evals/merge-gate/README.md`;
`test/remote-tracker.test.mjs`, `test/workflow-contracts.test.mjs`,
`test/eval-fixture-fidelity.test.mjs`, `test/merge-gate-eval.test.mjs`,
`test/support/merge-gate-round-fixtures.mjs`.

### Implementation details

- Fixtures: every `pr-read` stub carries `receiptContext: {}` and the helper's two fields; the
  `issue-lifecycle-receipt-parse` and `body-hash` stubs are gone; `linked-issue-open-points`
  carries a multiline body with quotes, `\\` and `\"`. The fidelity replay confirms each stub
  equals the real helper's output.
- Evaluator: `bodyTranscriptionFinding` is decisive and emitted only for fixture-compatible runs,
  never in `fixtureIndependentFindings`.
- The observation-scoped consumer rule is stated once, in three lines, in
  `issue-lifecycle-receipt.md`; producer write paths are unchanged.

### Test results

- Full `pnpm test` (Phase 5, before the corrections, on a host with load average in the hundreds):
  6974 tests, 6878 pass, 8 fail, 3 cancelled. A base run at `89587115` proved three failures
  pre-existing (two host-driver composed-stage tests and the protected-validation-operator history
  deadline test). One was a regression of this change (round-lifecycle `55 !== 1`) and was fixed in
  the test helper; with only its timeout raised it passed in 499 s. The remaining failures were
  timeouts that passed alone at the base and are unrelated to this change.
- Re-verification after the corrections ran targeted (the affected test files, `pnpm agent:check`,
  `node build.mjs`, `pnpm test:distribution`): 1321 pass, 0 fail. Two round tests hit only their
  own timeouts under load (`wall-clock`). `node build.mjs` and `pnpm test:distribution` pass.
- No local full-suite evidence (environment: wall-clock); the full suite is left to CI.
- `pnpm eval <suite> verify` for all five suites: no integrity errors; freshness debt as expected,
  including every archived merge-gate round.

### Review result

One routed reviewer (Node.js) reviewed all severities. One Important and five Notes were fixed in
one incorporation pass; the floor-hit contract fragments got a full re-pass with no new defect.
No findings remain open, and no external review report was written.

## Review findings

**Date:** 2026-11-26
**Reviewer:** effective-flow-nodejs-reviewer

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     6 |
| Open / Not implemented |     0 |
