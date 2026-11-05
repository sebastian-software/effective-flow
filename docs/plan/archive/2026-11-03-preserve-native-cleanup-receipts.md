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

| Path                                                       | Change                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `evals/_scaffold/host-profile-cleanup.mjs`                 | Preserve a validated completed receipt under existing cleanup ownership and safety checks. |
| `test/eval-host-profile.test.mjs`                          | Exercise receipt immutability and conservative recovery with real local wrappers.          |
| `evals/host-driver/tests/composed_remaining_support.py`    | Supply harmless native-command fixtures for composed worker coverage.                      |
| `evals/host-driver/tests/test_remaining_stage_worker.py`   | Exercise the existing per-worker admission and accounting contracts.                       |
| `evals/host-driver/tests/test_remaining_stage_composed.py` | Exercise real six-worker startup, retained closures and the next-batch gate.               |

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

## CI fixture portability follow-up

The initial source CI rejected direct pins to installed interpreters because they were not
fixture-owned single-link files. The composed fixture now copies the actual executable bytes
and modes into its own directory, and runs its cases in the copied Python so the real
`sys.executable` binding remains consistent. Product readers and input guards are unchanged.

The ownership/link regression fails with the previous fixture and passes with the correction.
All 11 worker-module tests pass locally. Follow-up verification passes `pnpm agent:check`, `pnpm test` (4,370 passed, zero failed, three formal archive skips), `node build.mjs` and `pnpm test:distribution`; all 82 Python cases pass. Independent review reports no Critical, Important or Note findings. Linux CI remains required before merge.

An earlier full local follow-up run remains failed: an unchanged Git interrupt test returned
`INTERRUPTED` but exceeded its existing ten-second assertion at 20.7 seconds. Its cause remains
undetermined. The original focused case and one complete verification of the unchanged
candidate passed afterward; no source, assertion, deadline or concurrency setting was changed.
The failed run and diagnosis remain recorded rather than reclassified as passing.

## CI test-layout follow-up

The release check twice reached the existing 150-second child-process limit while running
the combined worker module. Both failures remain recorded. The logs establish a module
timeout, but do not establish a particular slow test or a resource-contention cause.

Cumulative source-correction round 6 moves the three composed tests and their helpers to
the ordinary `test_remaining_stage_composed.py` discovery module. The eight existing worker
tests remain in their original module. All methods retain their AST after normalizing only
the copied-interpreter bootstrap import target; the shared fixture helper remains unchanged.
Discovery confirms the same 82 unique Python tests across seven modules, with the affected
11 cases split as eight and three. Each module retains the existing 150-second child and
180-second outer limits; the 120-second copied-interpreter limit and 35-second barriers
also remain unchanged.

Directed checks passed once for each affected module: three composed cases in 40.212 seconds
and eight worker cases in 32.700 seconds. Complete repository QA, independent review and
new-head Linux CI remain required before this source follow-up is merged. At most cumulative
rounds 6 and 7 are authorized for this three-file layout change; earlier rounds stay counted.

This layout change does not alter product, Driver, instrument, profile or qualification
inputs. Existing native evidence, including failed outcomes and consumed admissions, remains
unchanged. This source follow-up grants no model execution, evidence publication, Hosted
acceptance or release approval.
