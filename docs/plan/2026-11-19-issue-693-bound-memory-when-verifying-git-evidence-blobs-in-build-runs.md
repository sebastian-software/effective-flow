# Bound memory when verifying Git evidence blobs in build runs

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #693

## Requirement

The build-run helper verifies committed evidence references
(`{repositoryIdentity,commit,blob,path,digest}`) in `gitArtifact`
(`src/scripts/build-run-core.mjs`). After the identity checks it reads the whole blob with
`git cat-file blob` through the injected process runner, and the shared `git()` helper copies the
returned buffer once more with `Buffer.from`. Only then does it compare the sha256 of those bytes
with the recorded digest. A large binary passed as evidence by mistake therefore costs memory of
about twice its size before the verifier can reject it. The conflict validator already reads the
object size with `git cat-file -s` before it reads a blob (`blobText` in
`src/scripts/conflict-validation-core.mjs`).

Goal: committed Git evidence gets a documented byte budget. `gitArtifact` reads the blob size
first and rejects an oversized blob with `TOO_LARGE` without reading it. Accepted blobs keep the
full read and the exact-byte digest comparison. Tests cover a blob on either side of the boundary.

Workflow rationale: this is a **Bugfix**. Unbounded memory use on unexpected input is a defect of
the existing verifier, and the change adds no new capability. The one intended behavior change is
the new rejection of committed evidence above the budget.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow, issue #693
**Original outcome:** Git evidence verification in build runs uses bounded memory before it can
reject an oversized blob. The budget is documented and tested on both sides of the boundary, and
accepted evidence keeps its exact-byte digest handling.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** size pre-check in `gitArtifact` against the existing 1 MiB evidence
budget, without changes to the shared process runner
**Continuation decision:** none

## Architecture decisions

- **Size pre-check instead of a streamed digest.** `gitArtifact` reads
  `git cat-file -s <blob>` and compares the result with the budget before it calls
  `git cat-file blob`. This follows the conflict validator's pattern and leaves the shared process
  runner (`src/scripts/process-runner.mjs`) untouched. That runner serves many CLIs and offers no
  streaming hook. Git blobs are content-addressed, so a size read and a blob read of the same
  object ID see the same object, barring a `refs/replace` change between the two calls. A cheap
  length check after the read enforces the limit in that case, as `safeRead` does for bounded
  reads such as `retain-evidence`. It does not bound memory in that local, concurrent case, which is accepted. (Decided
  by score, see "Decided by score".)
- **Reuse the existing retained-evidence budget.** The budget is the existing exported
  `MAX_RETAINED_EVIDENCE_BYTES` (1 MiB, `src/scripts/build-run-core.mjs`), the same limit that
  `retain-evidence` enforces on its input and that the contract already documents. File
  references read through `evidence()` are not bounded at read time (`artifact()` defaults to no
  maximum); see "Assumptions and open points". No new constant is introduced. A blob of exactly 1 MiB is accepted, and
  1 MiB + 1 byte is rejected (`size > MAX_RETAINED_EVIDENCE_BYTES`), the same inclusive boundary
  as `retain-evidence`. The exported name stays unchanged; a one-line comment at its definition
  names all of its uses (the `retain-evidence` input, the retained-directory inventory and
  obstruction bytes, and committed Git evidence), so a later change for one use does not move the
  others unnoticed. (Decided by score.)
- **Scope: `gitArtifact` only.** The plan-copy exact-byte read in the private
  `executionPlanCopyRemoval` check and `treeContents` in `seal-delivery` are not evidence
  verification and stay unchanged. `treeContents` digests product deliverables, which can
  legitimately be of any size. (Decided by score.)
- **Oversize uses the module's existing `TOO_LARGE` code.** The message names Git evidence, for
  example "Git evidence exceeds byte limit". An unreadable size output (not a plain decimal
  integer) fails with `MISSING_EVIDENCE`, like the other identity checks in `gitArtifact`.
- **Drop the redundant copy in `git()`.** For binary reads, `git()` returns `result.stdout`
  unchanged when it already is a `Buffer`, and falls back to `Buffer.from(result.stdout)` only for
  other shapes, such as a `Uint8Array` from a custom injected runner. This removes the second
  full-size allocation the issue names for every binary read, without changing returned bytes or
  types. After the size check, the copy in `gitArtifact` is already capped at 1 MiB, so the saving
  mainly applies to the binary reads that stay unbounded (plan-copy read, `treeContents`, index and
  tree listings). Those callers only read the buffer (`.equals`, `.toString`, digest).

## Affected files

| File                                   | Description                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/scripts/build-run-core.mjs`       | Size pre-check in `gitArtifact` before the blob read; return the runner's buffer without a copy in `git()`               |
| `test/build-run.test.mjs`              | Boundary tests for committed Git evidence at 1 MiB and at 1 MiB + 1 byte; assertion that an oversized blob is never read |
| `src/shared/build-run-contract.md`     | State the 1 MiB budget for committed refs next to the committed-ref sentence                                             |
| `docs/developer-guide/build-system.md` | Mention the same budget for committed evidence where the build-run evidence limits are described                         |

## Implementation details

### Approach

1. In `gitArtifact`, keep the order of the existing checks: reference shape, repository identity,
   `cat-file -t <commit>`, `rev-parse <commit>:<path>` equal to the blob, `cat-file -t <blob>`.
2. After these checks and before the blob read, run `git cat-file -s <blob>` through the existing
   `git()` helper (text mode). Require a plain decimal integer, otherwise fail with
   `MISSING_EVIDENCE`. If the number exceeds `MAX_RETAINED_EVIDENCE_BYTES`, fail with `TOO_LARGE`
   and do not run `cat-file blob`.
3. Keep the accepted path: read the full blob, fail with `TOO_LARGE` if `bytes.length` exceeds
   the budget (the replace-ref guard), and compare `contentDigest(bytes)` with `ref.digest`
   (`DIGEST_MISMATCH` on a difference).
4. Add the one-line comment at `MAX_RETAINED_EVIDENCE_BYTES` that names all of its uses.
5. In `git()`, return the runner's `stdout` directly for binary reads when `Buffer.isBuffer` is
   true. Otherwise keep the `Buffer.from` conversion.
6. Add the tests listed under "Validation plan".
7. Add one sentence to `src/shared/build-run-contract.md` after "committed refs are
   `{repositoryIdentity,commit,blob,path,digest}` and are verified through the surviving common
   repository". It states that a committed blob is limited to 1 MiB of actual bytes, that its size
   is checked before it is read, and that a larger blob is refused with `TOO_LARGE`. For gate
   evidence the caller then references a bounded excerpt or summary instead (committed, or
   retained through `retain-evidence`). A committed plan reference (published plan head, final
   plan) has no substitute, because it must match the recorded plan digest: a `TOO_LARGE` there
   stops the run under the existing failed-helper handling. Add the matching statement in
   `docs/developer-guide/build-system.md` near the existing 1 MiB evidence limit for
   `retain-evidence`.
8. Run the CI order from `AGENTS.md`.

### Component structure

Not relevant: no new module, export or CLI operation. Everything stays inside existing functions of
`build-run-core.mjs`.

### State management

Not relevant: no runtime state or record format changes.

### API integration

Not relevant: the JSON operations keep their shapes. Only the existing error code `TOO_LARGE`
becomes reachable from committed-evidence verification.

### Styling approach

Not relevant: no user interface.

### Accessibility

Not relevant: no user interface.

### Edge cases

- Blob of exactly 1 MiB: accepted, and the digest comparison runs as before.
- Blob of 1 MiB + 1 byte with a correct recorded digest: `TOO_LARGE`, with no `cat-file blob`
  call.
- Oversized blob whose recorded digest is also wrong: `TOO_LARGE`, because the size check comes
  first. The verifier cannot learn the digest without reading the blob.
- Empty blob (size `0`): accepted, and its digest is compared as before.
- A foreign repository identity or a wrong commit, path or blob still fails with
  `REPOSITORY_MISMATCH` or `MISSING_EVIDENCE` before any size read.
- A failing or non-numeric `cat-file -s` output: a nonzero exit fails in `git()` with
  `REPOSITORY_MISMATCH` as today, and non-numeric output fails with `MISSING_EVIDENCE`. Neither
  case reads the blob.
- Every caller of `gitArtifact` gets the bound: gate receipts, completion checks, plan-continuation
  discovery, formatting checks, judgments, the published plan head and the final plan in handoff
  and terminal.

## Acceptance criteria

- [ ] `gitArtifact` runs `git cat-file -s <blob>` and refuses a committed blob larger than
      `MAX_RETAINED_EVIDENCE_BYTES` with `TOO_LARGE` before any `git cat-file blob` call. A new
      test in `test/build-run.test.mjs` shows this for a blob of 1 MiB + 1 byte with a correct
      recorded digest, and a wrapped runner shows that no `cat-file blob` call for that object ID
      happened.
- [ ] A committed blob of exactly 1 MiB with a correct digest is accepted by the same operation in
      a second new test. The blob holds NUL bytes and invalid UTF-8 sequences (for example
      `0x00`, `0xff`, `0xc3 0x28`), its digest is computed from the bytes the test wrote, and the
      wrapped runner shows one `cat-file blob <blob>` call. In the same test, the same committed
      reference with only its digest changed fails with `DIGEST_MISMATCH`.
- [ ] A wrapped runner that reports a size within the budget but returns 1 MiB + 1 byte for the
      blob read makes the operation fail with `TOO_LARGE`.
- [ ] All existing `test/build-run.test.mjs` and `test/build-run-protected-validation.test.mjs`
      tests pass. The copy-free `git()` return is checked by code review, because `git()` is
      private: the diff returns `result.stdout` when `Buffer.isBuffer` is true and keeps
      `Buffer.from` otherwise.
- [ ] `src/shared/build-run-contract.md` and `docs/developer-guide/build-system.md` state the
      1 MiB budget for committed evidence.
- [ ] The call sites of the plan-copy read and of `treeContents` are unchanged; only the
      copy-free `git()` return reaches them.
- [ ] CI order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
      `pnpm test:distribution`.

## Validation plan

- Boundary blobs: create them only inside the two new tests, as a detached commit in the
  fixture's common repository (`git hash-object -w`, `git mktree`, `git commit-tree`).
  `gitArtifact` needs only the commit object, `rev-parse <commit>:<path>` and the blob type, not
  reachability from HEAD. The shared `fixture()` and the execution branch stay unchanged, so no
  other test carries 2 MiB of extra objects and no execution HEAD or snapshot moves.
- New test (rejected side): a 1 MiB + 1 byte binary blob. Build the committed reference with its
  digest computed from the bytes the test wrote, not through the fixture's `gitRef` helper: that
  helper reads with `spawnSync` at Node's default `maxBuffer` of 1 MiB. Pass the reference as
  evidence to an operation that verifies Git evidence, for example a gate `receipt`. Wrap `live.deps.runner` to record `git` argument lists, as the existing
  wrappers in `test/build-run.test.mjs` already do. Assert `TOO_LARGE`, one `cat-file -s <blob>`
  call and no `cat-file blob <blob>` call.
- New test (accepted side): the same setup with a blob of exactly 1 MiB that contains NUL bytes
  and invalid UTF-8 sequences, which the operation accepts with one `cat-file blob <blob>` call.
  Then the same reference with only its digest changed fails with `DIGEST_MISMATCH`. No existing
  test changes the digest of a committed Git reference; the existing `DIGEST_MISMATCH` cases use
  file references. The fixture runner calls `spawnSync` without `maxBuffer`, so the two new tests
  set it in their own runner wrapper, which they already install to record calls: the wrapper
  delegates to `spawnSync` with an explicit `maxBuffer` (for example 4 MiB). `fixture()` stays
  untouched, and the accepted side does not depend on Node's default.
- New test case (post-read guard): a wrapped runner answers `cat-file -s <blob>` with a size at or
  under 1 MiB and returns a `Buffer` of `MAX_RETAINED_EVIDENCE_BYTES + 1` bytes for
  `cat-file blob <blob>`. Assert `TOO_LARGE`, so the guard after the read does not ship untested.
- Full `test/build-run.test.mjs` and `test/build-run-protected-validation.test.mjs`. Tests that
  count or script runner calls must tolerate the additional `cat-file -s` call. Adapt such a test
  only when it pins the exact call sequence.
- CI order from `AGENTS.md`: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
  `pnpm test:distribution`.
- Expected behavioural-eval freshness debt: suites whose load set includes `src/scripts/` (for
  example `evals/build-context/suite.config.mjs`) report stale evidence after this edit. Under
  `docs/adr/pragmatic-test-release-policy.md` this is reported debt, not a CI failure, and needs no
  re-recording before merge.

## Assumptions and open points

- Verified context: the line references above come from the current `develop`
  (`build-run-core.mjs` `git()`, `gitArtifact`, `evidence()`, `MAX_RETAINED_EVIDENCE_BYTES`;
  `conflict-validation-core.mjs` `blobText`; `process-runner.mjs` without an output cap).
- Assumption: no legitimate committed evidence above 1 MiB is in use today. Plans, judgments and
  discovery records are small text files. Arbitrary gate evidence above 1 MiB is newly refused,
  and that is intended.
- Consequence for plans: `create` reads the request plan as a file reference without a maximum,
  while the published plan head and the final plan in handoff and terminal are verified through
  `gitArtifact`. A committed plan above 1 MiB would therefore be refused only at plan continuation
  or handoff. Plans are small text files, so this stays accepted; bounding the request plan at
  `create` is outside #693.
- Deliberately out of scope: file-reference evidence in `evidence()` reads through `artifact()`
  without a maximum. Durable file evidence is created through `retain-evidence` and is therefore
  at most 1 MiB, but non-durable file references are not bounded at read time. The plan-copy read
  and `treeContents` also read full blobs. Each of these can become its own issue. None is part of
  #693.
- Non-incorporated alternative: a streamed digest through a new runner mode would avoid any size
  limit, but it changes the shared runner and leaves no boundary to test.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[
  {
    "site": "S-CLR",
    "question": "How should build-run Git blob evidence verification bound its memory?",
    "options": ["Size pre-check", "Streamed digest", "Size pre-check and streamed digest", "Decide later"],
    "escape": ["Decide later"],
    "scores": [
      { "label": "Size pre-check", "score": 9, "reason": "Its edge over streaming: it copies the conflict-validator pattern locally, leaves the shared runner alone and gives a testable boundary. Reusing the 1 MiB MAX_RETAINED_EVIDENCE_BYTES matches the file-ref limit. OIDs cannot race, and accepted blobs keep exact-byte digest checks." },
      { "label": "Streamed digest", "score": 5, "reason": "It works because gitArtifact only needs the digest, not the bytes. But it adds a streaming mode to the runner that many CLIs and injected test runners share, leaves committed evidence unbounded, and has no boundary to test on either side." },
      { "label": "Size pre-check and streamed digest", "score": 4, "reason": "Once the size check caps reads at the budget, streaming saves little memory. It still costs the full runner change and two code paths to test and maintain, so this adds scope without matching value." }
    ]
  },
  {
    "site": "S-CLR",
    "question": "Which full-blob reads in build-run-core.mjs fall under the new memory bound in this change?",
    "options": ["gitArtifact only", "gitArtifact and plan-copy read", "All full-blob reads", "Decide later"],
    "escape": ["Decide later"],
    "scores": [
      { "label": "gitArtifact only", "score": 8, "reason": "This matches the issue exactly. gitArtifact (:404-417) is the evidence verifier it names, and a documented budget tested on both sides of the boundary keeps the change small. The plan-copy and seal-delivery reads are not evidence verification, so they stay out of scope." },
      { "label": "gitArtifact and plan-copy read", "score": 7, "reason": "The extra length check is cheap and safe. Blobs of a different length can never equal the approved plan bytes, so returning null is right and nothing legitimate is rejected. It adds a test and goes beyond the evidence verifier the issue names." },
      { "label": "All full-blob reads", "score": 2, "reason": "treeContents digests sealed product deliverables, which can legitimately be any size. An evidence budget there would wrongly block seal-delivery for large outputs. This is scope creep with real regression risk and needs a different mechanism, such as a streamed digest, not the same bound." }
    ]
  },
  {
    "site": "S-CLR",
    "question": "Which byte budget applies to committed Git evidence blobs?",
    "options": ["Reuse MAX_RETAINED_EVIDENCE_BYTES (1 MiB)", "New MAX_GIT_EVIDENCE_BYTES (16 MiB)", "Decide later"],
    "escape": ["Decide later"],
    "scores": [
      { "label": "Reuse MAX_RETAINED_EVIDENCE_BYTES (1 MiB)", "score": 8, "reason": "Gives file refs and Git refs one budget, with existing constant, tests and contract wording (build-run-contract.md:62) and the tightest memory bound. Small risk: arbitrary committed gate evidence above 1 MiB that passes today would now get TOO_LARGE." },
      { "label": "New MAX_GIT_EVIDENCE_BYTES (16 MiB)", "score": 4, "reason": "Rejects fewer committed blobs that pass today, but the 16 MiB figure has no justification. It breaks symmetry with file evidence and lets 16x more memory through. It adds a constant and docs and needs heavy 16 MiB boundary-blob tests, with no known evidence that large." }
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
| Architecture    |        0 |         0 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    2 |
| Testability     |        0 |         0 |    3 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    3 |

### Findings

- Error cases, Note: the post-read length check was described as covering a `refs/replace`
  change between the size read and the blob read, but in that case the runner has already
  buffered the object. Incorporated: the architecture decision now says the check enforces the
  limit there but does not bound memory, which is accepted.
- Testability, Note: the post-read `TOO_LARGE` guard was reached by no planned test.
  Incorporated: a wrapped-runner case that reports an in-budget size and returns 1 MiB + 1 byte,
  plus a matching acceptance criterion.
- Maintainability, Note: reusing `MAX_RETAINED_EVIDENCE_BYTES` for never-retained Git evidence
  could let a later `retain-evidence` change move the Git limit unnoticed. Incorporated: the name
  stays, and a one-line comment at its definition names both uses.
- Error cases, Note: the planned contract sentence gave no next step after `TOO_LARGE`.
  Incorporated: it now points to a bounded excerpt or summary, committed or retained through
  `retain-evidence`.

Deep plan review (2026-11-19), all findings incorporated:

- Error cases, Important: the excerpt-or-summary advice in the planned contract sentence cannot
  work for committed plan references, which must match the recorded plan digest. Incorporated:
  the advice is limited to gate evidence, and the sentence states that a `TOO_LARGE` on a
  committed plan reference stops the run under the existing failed-helper handling.
- Architecture, Note: the plan claimed the reused constant bounds every durable non-Git evidence
  file, but `evidence()` reads file references without a maximum. Incorporated: the decision now
  names only the limit `retain-evidence` enforces on its input.
- Maintainability, Note: the planned comment on `MAX_RETAINED_EVIDENCE_BYTES` named two uses,
  while the constant also bounds the retained-directory inventory and obstruction bytes.
  Incorporated: the comment names all uses.
- Maintainability, Note: the comparison with `safeRead` was too broad. Incorporated: it now
  refers to bounded reads such as `retain-evidence`.
- Testability, Note: the copy-free `git()` return cannot be observed by a test, because `git()` is
  private. Incorporated: the acceptance criterion checks it by code review and keeps the existing
  tests as regression evidence.
- Testability, Note: the validation plan left the `maxBuffer` handling open and contradicted the
  unchanged `fixture()`. Incorporated: the two new tests set an explicit `maxBuffer` in their own
  runner wrapper, and `fixture()` stays untouched.

## Open points

- No open points.
