# Preserve native cleanup receipts

**Plan status:** Implemented
**Source:** effective-flow build
**Recommended workflow:** Bugfix (`effective-flow fix`)

## Requirement

Automatic host recovery revisits completed profiles when subsequent wrappers use the same
profiles root. Replacing a successful cleanup receipt changes a retained closure input and
invalidates its pinned digest before later workers can qualify. Preserve the original receipt
bytes and timestamp when that exact completed profile remains clean.

## Outcome checkpoint

**Primary source:** `sebastian-software/effective-flow`, `develop`; release #595 acceptance repair.
**Original outcome:** Complete the release while preserving its native evidence and authorization rules.
**Last evaluated attempt:** The remaining-stage launch refused rewritten retained cleanup receipts; its consumed admission is preserved.
**No-progress count:** Unknown in this source-repair record; earlier blocked release attempts were not reset.
**Cumulative approach:** Existing source work and historical attempts remain recorded; this correction adds local mechanics and regression proof.
**Continuation decision:** The owner approved two additional source-correction rounds and gated source delivery; paid and Hosted execution remain excluded.

## Affected files

| Path                                                     | Change                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `evals/_scaffold/host-profile-cleanup.mjs`               | Preserve a validated completed receipt under existing cleanup ownership and safety checks. |
| `test/eval-host-profile.test.mjs`                        | Exercise receipt immutability and conservative recovery with real local wrappers.          |
| `evals/host-driver/tests/composed_remaining_support.py`  | Supply harmless native-command fixtures for composed worker coverage.                      |
| `evals/host-driver/tests/test_remaining_stage_worker.py` | Exercise real six-worker startup, retained closures and the next-batch gate.               |

## Implementation details

Under the existing cleanup claim, validate the receipt schema, exact profile identity,
canonical timestamp and all four successful cache entries. Require all cache paths to remain
absent and the existing owner/process-group rules to pass. Repeat identity and process checks
at the return boundary, then return without replacing the receipt.

Missing, malformed, incomplete or unsafe receipts and recreated caches follow normal cleanup.
Live or unknown processes and replaced identities retain the existing conservative refusal.
Keep the receipt format, CLI, digest checks, admission, accounting, cancellation and TTL rules.

## Acceptance criteria

- A real completed local wrapper retains its receipt bytes, digest and file metadata across
  later sequential wrappers, concurrent wrappers and overlapping recovery on the same root.
- Invalid receipts, recreated or unsafe caches, live or unknown processes and identity drift
  cannot obtain an unvalidated completed shortcut.
- A composed six-worker fixture uses real wrapper recovery and worker admission, preserving
  all five original closure inventories and cleanup receipts while six harmless jobs close.
- No next batch starts before all first-batch closures; a foreign or future child is rejected.
  Unknown start accounting blocks further admission without refund or replay.
- Directed regressions fail on the previous helper and pass on the correction. Fixture results
  establish local mechanics only.

## Validation plan

Record directed RED-to-GREEN evidence, obtain independent review, and run the existing
preflight plus repository QA in its prescribed order: `pnpm agent:check`, `pnpm test`,
`node build.mjs`, then `pnpm test:distribution`.

**QA evidence:** Directed JavaScript regressions pass (12 tests). The composed worker module passes (10 tests); both regressions fail against the unchanged previous helper. `pnpm agent:check`, `pnpm test` (4,370 passed, zero failed, three formal archive skips), `node build.mjs` and `pnpm test:distribution` pass. All 81 Python cases pass; the separate EILSEQ filename branch remains unavailable in this environment.
**Independent review:** JavaScript source review and composed-regression review report no Critical, Important or Note findings. Final source validation passes, with unchanged source inputs and historical evidence.

## Delivery and open points

Deliver the source correction through one pull request against `develop`, with required checks
and review complete before merge. This plan grants no paid model run or Hosted execution.
Keep historical evidence and consumed admission unchanged; do not restore receipts, refresh old
digests or rebind old closures to changed driver bytes.

Fresh paid evidence and release readiness remain UNPROVEN. A later real execution needs a new
reviewed, source-compatible corpus, fresh first-five closures and a separately granted remaining
stage. Qualification, paid execution, Hosted acceptance and release publication retain their
separate evidence and authorization gates.
