# Complete fixed eval cohort

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Complete the existing behavioural-eval execution path for release PR #595 without bypassing its acceptance or safety boundaries.

The current fixed first-stage adapter authenticates the complete 155-task corpus but executes only `iterate/duplicated-control-line-aborts`, slots 1–5. It explicitly supplies no execution path for the remaining 150 tasks. The legacy coordinator accepts only a new full 155 round and cannot serve as a continuation fallback.

Add one maintenance-only remaining 150 mode to the existing adapter. It must preserve the original five outcomes, complete corpus, namespace, launch gate, qualification policy and nonrefundable D2 accounting. Its fixed remainder is 45 merge-gate, 30 iterate and 75 next-steps tasks, executed in 25 batches of at most six.

This is a new bounded capability, so the recommended workflow is Feature. Independent plan review and explicit human implementation approval were obtained on 2026-11-03. Paid execution, external actions, publication and release retain their separate authority requirements.

## Outcome checkpoint

**Primary source:** `sebastian-software/effective-flow`, release PR #595; this plan is a bounded child of that existing release outcome. Source PR #607 and the separate #78 chat and its work remain separate.

**Original outcome:** Deliver the accepted release with current required behavioural evidence and a successful original Hosted qualification of its exact final stamped source. Preserve all required reviews, checks, isolation, authority and evidence boundaries.

**Last evaluated attempt:** Source PR #607 merged as `3cbe56610c9ae71319a12caa84b73eed250cf411`. The fixed-cohort implementation was published on PR #610 as `9c95f77b66205741aab59acf741bd2409a65354a`, after local QA passed 4,364 tests with zero failures and three formal skips. Recensor approved that exact head, but mandatory CI failed when the 26-case remaining-stage module reached the unchanged 150-second Python watchdog. CI recorded 4,315 passes, one failure and 27 skips. No merge occurred; local success does not replace this failure. Two original fixed-cohort corrections are consumed. The owner explicitly approved one additional cumulative round 3 on 2026-11-03, limited to the reviewed test layout and this plan, followed by normal gated source delivery. That frozen layout passed independent reviews and ordered local QA: 4,366 tests passed, zero failed and three formal skips; build and distribution passed. New-head CI and source integration remain pending. Earlier original ten and native-source three rounds remain exhausted. Eight earlier native roots remain consumed; no fresh Hosted qualification or paid 155-corpus roots have started.

**No-progress count:** Unknown for the parent outcome. This child implementation preserves that unknown history; its two consumed correction rounds do not reset any earlier allowance.

**Cumulative approach:** Existing D1 shutdown, D2 durable launch consumption and D3 first-five admission are retained. The additional maintained component proposed here is only the fixed remaining 150 path in the existing driver. Actual cumulative time, provider cost and descendant workload are unknown. Source delivery and green local fixtures do not establish the parent’s operational acceptance.

**Continuation decision:** Finish normal source delivery of the independently reviewed and locally validated additional owner-approved cumulative round 3: divide the existing 26 test methods into ordinary 4/14/8 modules, move their seven unchanged fixture methods into a non-TestCase mixin, and retain all assertions, genuine seal/evaluator work, fresh negative checks and 150-/180-second watchdogs. The four test-layout paths and this archived plan are the complete new write scope. Perform static continuity/discovery checks, independent review and one ordered full QA; the wrapper runs inside `pnpm test`, without a duplicate full wrapper pass. Stop on a failed required check; no further automatic correction or replay is granted. Normal source publication and merge require fresh passing current-head CI and actual bot approval. Real execution, the historical paid hold and unknown exact original rejection reason remain separate; no earlier budget or parent history is reset.

## Architecture decisions

- Extend `eval_first_stage.py` with one explicit remaining 150 mode. Without that mode, existing D3 behaviour remains five tasks, sequential execution and partial evidence only.
- Keep the original full 155 corpus and its independently trusted digest. First reproduce the existing `run_all` full 155 `zip_longest` order across merge-gate, iterate and next-steps; then remove exactly the five D3 tuples; only then slice into six-task batches. Use this identical fixed ordering for implementation, the independent test oracle and the exact grant. Never prepare truncated manifests.
- Use 25 deterministic batches of six tasks. Complete qualification, execution, cleanup, sealing and accounting for the entire current batch before admitting another. Six is a proposed fixed limit requiring independent review and explicit human approval; it is not inherited authority from the legacy driver.
- Keep D3’s original grant unchanged. A separate exact remaining 150 grant authorizes the new entry only after the five original completions exist. It cannot authorize their replay, repair or resealing.
- Attach only to the original authenticated cohort and launch gate. Existing legacy and D3 cohort creation remains exclusive. Do not introduce a general existing-directory fallback.
- After pure prechecks, exclusively create the persistent one-shot admission for the remaining 150 operation and fully synchronize and close it before any Stage 2 Driver or cancellation FIFO startup. A failed or interrupted admission is never removed, repaired, refunded or reused. A later FIFO setup failure consumes that admission and allows no retry.
- Reuse `Driver.run_slot`, the original operator protocol and D2 accounting. Reconstruct the original five consumption projections from their pinned original jobs and externally bound job digests through the existing D2 primitives; never infer them from the new Driver’s initially empty `admissions` map or trust summary counters. Preserve `Driver.block` source and AST and keep `eval_driver_runtime.py` byte-identical.
- Give Stage 2 its own cancellation lifecycle through the existing Driver primitives. Successful D3 normally closes and unlinks its coordinator cancellation FIFO while leaving the original launch gate active. Do not require that old FIFO to remain present or recreate it; preserve the five old jobs and receipts as historical evidence.
- Preserve the original qualification bundle, verifier and expiry. Every launch, including the final post-reservation check, must remain within the original TTL. No bundle replacement or automatic refresh occurs during either stage.
- Report complete 155 coverage separately from suite acceptance and publication. A new summary cannot convert fixture evidence, uncertain accounting or incomplete seals into acceptance.
- Start implementation from refreshed `develop` containing source PR #607 and the upstream `stable_ast_dump` test normalization. Preserve that adapter and both D1 source/AST pins. Routine base refresh requires no additional owner decision; semantic scope or guarantee drift does.
- Deliver the implementation through `develop` before preparing a fresh real corpus. Publish fresh 155 evidence through the normal source process before freezing the final stamped Hosted candidate.

## Affected files

The plan artifact is separate from the implementation and test inventory below. The original three driver files and README remain the production/documentation scope. During the first implementation, one additional ordinary module separated the 36 existing and 26 new cases. Subsequent CI showed that the 26-case module itself exceeded its unchanged watchdog. The explicitly approved cumulative round 3 further divides only those 26 methods into three ordinary modules and an unchanged fixture mixin; the original 36-case module remains byte-identical in this round. Every assertion, fixture boundary and timeout remains preserved. The originally approved plan is retained by its original SHA-256.

| File                                                        | Description                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evals/host-driver/eval_first_stage.py`                     | Add the fixed remaining 150 mode, exact grant authentication, original-five closure checks, batch admission, persistent one-shot admission and combined accounting. Preserve the D3 entry contract.                                                                                                   |
| `evals/host-driver/run-cohorts.py`                          | Add a narrowly authenticated attach path, bind existing directory identities, establish the separately bound Stage 2 cancellation lifecycle through existing primitives and carry the remaining-stage context into original worker jobs. Preserve ordinary exclusive cohort creation and D1 shutdown. |
| `evals/host-driver/eval_host_worker.py`                     | Authenticate the remaining-stage context and cancellation binding at the existing safety boundaries and enforce the original expiry immediately before launch.                                                                                                                                        |
| `evals/host-driver/tests/test_first_stage.py`               | Extend the contained synthetic fixtures and add genuine existing seal/evaluator computations for the new acceptance boundary. Preserve upstream `stable_ast_dump` normalization and both D1 source/AST pins.                                                                                          |
| `evals/host-driver/tests/test_remaining_stage.py`           | Hold the four cohort/batch result cases with unchanged method bodies and existing watchdogs.                                                                                                                                                                                                          |
| `evals/host-driver/tests/test_remaining_stage_admission.py` | Hold the 14 grant/admission cases with unchanged method bodies and uncached verification.                                                                                                                                                                                                             |
| `evals/host-driver/tests/test_remaining_stage_worker.py`    | Hold the eight worker/FIFO lifecycle cases with unchanged method bodies and fresh fixtures.                                                                                                                                                                                                           |
| `evals/host-driver/tests/remaining_stage_support.py`        | Share the seven unchanged fixture methods through a non-TestCase mixin; no duplicate test discovery.                                                                                                                                                                                                  |
| `evals/host-driver/README.md`                               | Document the two fixed stages, authority separation, exact remainder, immutable namespace, cancellation lifecycle, accounting, failure behaviour and unproven hard limits.                                                                                                                            |

No changes to runtime accounting, hostrunner, suite registries, suite configuration, evaluator rules, build identities, workflow definitions, release configuration or versions are included.

## Implementation details

### Approach

1. Independently review this private plan and obtain explicit human approval before implementation. The parent may place the exact reviewed plan in `docs/plan/2026-11-03-complete-fixed-eval-cohort.md` after the R3 freeze ends. Start implementation only from refreshed `develop` containing PR #607 and the upstream normalization. Qualify the selected implementation executor under the existing repository contract. A failed required preflight blocks that lane; this plan grants no alternate external execution.

2. Introduce an explicit remaining 150 selector on the existing adapter. Its default remains read-only validation; execution still requires an explicit execute request and separately authenticated inputs. Do not expose a configurable stage list, concurrency setting or arbitrary task subset.

3. Separate reusable immutable corpus checks from D3-specific lifecycle checks without weakening either. The current authenticator hard-codes the five selected slots, their closed prefix and pending state of the other 150. Reusing it unchanged during the remainder would reject legitimate remainder evidence. Preserve its public D3 behaviour and add a distinct fixed remainder lifecycle check.

4. Reproduce the exact existing `run_all` order by applying `zip_longest` to the three complete prepared task arrays in merge-gate, iterate, next-steps order and flattening while discarding only its absent entries. Remove the five known D3 tuples from that full 155 sequence, then slice the resulting 150 identities into 25 consecutive six-task batches. Do not filter the iterate array before interleaving. The grant and an independently implemented test oracle must use this same full-order → remove-five → slice-six definition.

5. Authenticate the new remaining 150 grant and the original-five closure inventory before creating admission state or a Driver. The grant must bind:

   - The original full 155 corpus and original D3 grant by canonical path and independently trusted digest.
   - The genuine first-stage summary and a bounded, pinned inventory of its five original closures.
   - Exact source HEAD/tree, configuration, operator, driver files, executables, provenance, profiles and qualification references.
   - Original output, profiles, cohort and launch-gate identities.
   - The exact ordered 150-task selection and fixed stage identity.
   - Maximum 150 additional charged roots, maximum 155 roots across the two stages, concurrency six, and no retry, resume or further continuation.
   - The exact prospective Stage 2 cancellation FIFO path under the original profiles root, its required exclusive creation and its normal close/unlink lifecycle through the existing Driver primitives. This is new explicit authority for a fresh coordinator FIFO, not authority to reuse or recreate D3’s old FIFO. Any generated identity that cannot exist before creation must be captured and authenticated before dispatch under the reviewed binding rule, never accepted as an unexplained override.
   - The absence of automatic full-corpus acceptance or publication authority.

   Use strict bounded decoding and reject unknown fields, duplicate keys, bool-as-integer values, unsafe paths and untrusted self-derived pins. Measure the concrete grant and inventory before setting their separate source-owned size bounds; do not silently reuse or enlarge D3’s 16 KiB limit.

6. Verify the five original closures. Existing `closed_proof` is first-stage-specific; it is not an already available generic seal verifier. Reuse its existing checks through narrowly scoped internal factoring where appropriate, then add explicit remainder prerequisite checks.

   The pinned closure inventory must cover the original jobs, their externally bound job digests, consumption/start evidence, operator outcomes, original host receipts and seals, sealed input digests, runner profile/cleanup evidence and relevant termination evidence. Read each original job against that bound digest and reconstruct its consumption with the existing D2 `inspect_consumption` primitive and original identity inputs. Require five genuine clean completions, five `reserved` projections with one charged root and a genuine start each, and no uncertain accounting. The new Driver’s `admissions` map starts empty; it cannot account for these earlier jobs. Never project their absence from that map as zero, seed arbitrary counters or trust the first-stage summary’s totals. Reobserve cleanup through existing read-only primitives; never signal a process using retained PID metadata. The normal absence of D3’s old coordinator cancellation FIFO after `Driver.close` is not a missing closure artifact and must not be repaired or treated as authority to resume D3.

7. Add the authenticated attach path. Require the original cohort and gate identities from the five bound jobs to agree. Refuse a missing or replaced cohort, changed gate, revoked gate, blocker, unexplained child directory, prior remaining-stage admission or inconsistent ancestry.

   These are pure prechecks: do not construct the Stage 2 Driver or start its FIFO lifecycle yet. Existing constructors must retain their exclusive new-cohort behaviour. The remaining path adopts only the authenticated existing parents; absent remainder parents and slot directories still require exclusive creation. Do not reopen the old D3 FIFO, alter old job paths or use old process IDs for signalling.

8. Implement the persistent one-shot admission as a new, narrowly scoped primitive in the existing adapter. No such attach/admission primitive currently exists.

   After the pure prechecks, exclusively create an owned, single-link admission record in the original cohort, binding the grant, corpus, prior closure inventory and cohort/gate identities. Fully complete file and directory synchronization and closure before constructing the Stage 2 Driver or creating/opening its FIFO. Any uncertainty refuses startup; an already created record remains consumed. Two coordinators or relocated grant copies must contend on the same original admission. Only then establish Stage 2’s separately granted fresh cancellation FIFO using the existing Driver exclusive creation, open, cancellation and close primitives. A failure during Driver/FIFO setup consumes this admission rather than authorizing another coordinator attempt.

9. Carry one authenticated remaining-stage context in each worker job. Reject simultaneous D3 and remaining contexts, present-null values, malformed contexts and any tuple outside the fixed remainder.

   Reauthenticate before qualification, under the existing launch gate before D2 reservation, and after reservation before heartbeat/Popen. Bind the helper’s actual bytes, the admission record and the new cancellation lifecycle through the original authenticated job. Validate Stage 2’s cancellation path against its grant and reviewed creation binding; the five old jobs keep their original paths unchanged. Preserve D2’s durable reservation and conservative unknown projection.

10. Execute only the current six-task batch through `Driver.run_slot`. Authenticate all original inputs, the five original closures, earlier closed batches, current-batch membership and pending future batches.

    Any finding, native error, seal refusal, qualification refusal, signal, future exception, unknown accounting or incomplete cleanup invokes unchanged D1 blocking. No next batch is submitted.

11. Preserve original output files. Use separate exclusive remainder journal and summary files within the same cohort. Do not rewrite the first-stage summary, old jobs, five seals or original consumption receipts. Stage 2’s normal close handles only its own newly created cancellation FIFO through the existing lifecycle.

    Reconcile all 155 identities in the final summary. Count the original five once using the projections reconstructed from their pinned original jobs and externally bound job digests through existing D2 primitives; the new Driver’s empty original-job admissions and summary counters are not their accounting authority. Add remainder consumption without refunds. Missing start evidence after possible admission stays charged and unknown. A clean summary requires all 155 genuine closures and complete accounting; it supplies no substitute for ordinary suite acceptance.

12. Document the operator boundary. Source implementation and fixture checks do not issue real grants. Fresh corpus preparation begins only after this implementation is delivered through `develop`.

### State management

There are exactly two fixed stages:

- Original D3: five sequential original roots and its unchanged partial summary.
- Remaining 150: one separately authorized admission, 25 bounded batches, its own cancellation lifecycle and one remainder summary.

The second stage derives batch progress from authenticated original artifacts. It introduces no editable progress ledger, grant migration, recovery loop or arbitrary stage configuration.

A process loss, expired qualification or failed batch leaves retained partial evidence and closes this attempt. The new mode must not resume it or manufacture a new namespace. Closing a successful coordinator’s own cancellation FIFO does not remove or reset the original launch gate, admission or consumption evidence.

### Edge cases

- First-stage completion without final cleanup is insufficient for attach.
- Successful D3 normally leaves its original launch gate active but removes its coordinator cancellation FIFO. Accept that documented lifecycle; neither require nor recreate the old FIFO.
- An apparently clean summary with a changed original seal or receipt refuses attach.
- An existing gate in its revoked state is never restored.
- Evidence for a future batch, a replayed D3 tuple or unexplained task state refuses admission.
- Replacing a parent directory after validation refuses the affected launch.
- A changed, pre-existing or foreign Stage 2 cancellation path refuses admission; it never falls back to the old path or an ungranted path.
- Mutation during qualification or durable reservation cannot admit a model.
- Qualification expiry during synchronization refuses launch without refunding a created reservation.
- Grant or namespace copies cannot obtain a second admission.
- Any unknown closure or charge prevents a clean 155 result.

## Acceptance criteria

The checked items record code and contained-fixture validation. They do not attest to live model execution, native qualification or release acceptance. Source delivery remains pending below.

- [x] Only the driver, README and test/support files listed above participate in the complete feature; cumulative round 3 changes only its four declared test-layout files and this plan. D1 source/AST and D2 runtime bytes remain unchanged. Upstream `stable_ast_dump` normalization and both D1 source/AST pins remain intact.
- [x] Implementation starts from refreshed `develop` containing PR #607 and the upstream normalization; routine refresh introduces no extra owner gate unless semantic scope or guarantees drift.
- [x] Existing D3 behaviour remains five sequential tasks with no retry, resume, continuation or full-corpus acceptance.
- [x] The new mode derives exactly 45 merge-gate, 30 iterate and 75 next-steps tasks by first reproducing existing `run_all` full 155 `zip_longest` order, then removing the five D3 tuples, then slicing six-task batches. Implementation, independent test oracle and grant agree exactly.
- [x] Default validation creates no Driver, process, profile, FIFO, admission or output and claims no live qualification.
- [x] Execution requires the separately pinned exact remaining-stage grant and five valid original prerequisite closures.
- [x] The attach path preserves the original cohort, gate and directory ownership; duplicate admission is refused.
- [x] Successful D3 with its old cancellation FIFO removed remains a valid prerequisite when its original gate and closure evidence are valid; the old FIFO is never recreated.
- [x] Stage 2 exclusively creates and normally closes only its own explicitly grant-bound cancellation FIFO through existing Driver primitives. No old job, receipt, cancellation path or process identity is rewritten or used for signalling.
- [x] After pure prechecks, one-shot admission is exclusively created, fully synchronized and closed before Stage 2 Driver/FIFO startup. It persists across success, setup failure and interruption; no copied grant or replacement root creates another budget or retry.
- [x] At most six tasks are active and only 25 fixed batches are possible; another batch requires clean closure of the preceding batch.
- [x] Worker checks reject foreign/replayed tasks and changed source, instrument, operator, toolchain, namespace, profile, grant, admission or Stage 2 cancellation bindings.
- [x] Every real launch retains original qualification and the final original-expiry check.
- [x] A first failure stops future admission through unchanged D1 behaviour and preserves D2 consumption, including unknown charged roots.
- [x] The original five seals, receipts, jobs and summary remain byte-identical throughout the remainder.
- [x] Original-five consumption is reconstructed from pinned original jobs and externally bound job digests through existing D2 primitives, even when the new Driver’s `admissions` map is empty; neither zero defaults nor summary counters can substitute. Final accounting covers exactly 155 original identities and reports no clean completion when any required closure or consumption state is unknown.
- [x] Acceptance fixtures invoke genuine existing `sealAttempt` and suite evaluator computations on synthetic original artifacts; synthetic success fields alone cannot establish seal acceptance.
- [x] Fixtures remain explicitly fixture-only and cannot be presented as native qualification, live behavioural evidence or a real execution grant.
- [x] Required repository checks pass in the qualified executor without weakened checks or rewritten evidence.
- [x] README accurately documents paid-execution separation, failure retention, original TTL, cancellation lifecycle and unproven hard descendant/request/token/cost limits.

Completion means these criteria are met and the approved implementation is delivered through `develop`. It does not mean release #595 or operational 155 acceptance is complete.

## Validation plan

Perform no validation during this planning handoff or the active R3 freeze.

For an approved implementation, retain the existing contained fixture boundary. Prevent in-process provider, model, authentication and unrelated process effects before exercising test paths. Any actual local fixture process must use the repository’s existing bounded ownership and cleanup approach.

The existing `synthetic_seal` helper supplies manually constructed scheduler fixtures. Preserve that distinction: it is not evidence that the original seal API accepted a run. Add genuine original `sealAttempt` and evaluator computations inside the same test file, using synthetic inputs and temporary artifacts. Do not modify evaluators to make fixtures pass.

| Case                                                                                 | Required observable result                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentic five prerequisite closures plus valid fixed grant                          | Exactly 150 new task identities; 45/30/75 distribution; maximum six active; 25 batch boundaries; no D3 replay. An independent oracle and the grant match full 155 `run_all` `zip_longest` order → remove five D3 tuples → slice six, including a case that distinguishes filtering before interleaving. |
| Complete fixture union                                                               | Exactly 155 original identities, known accounting and genuine original seal/evaluator acceptance; original five artifact digests unchanged.                                                                                                                                                             |
| Missing, invalid, fixture-mislabelled or uncertain prerequisite closure              | Zero remainder dispatch.                                                                                                                                                                                                                                                                                |
| D3 succeeded and its coordinator FIFO was normally removed                           | Attach can validate the intact original gate and genuine closures without requiring or recreating that FIFO.                                                                                                                                                                                            |
| Fresh Stage 2 cancellation lifecycle                                                 | Only the explicitly granted fresh FIFO is created, used and normally closed through existing primitives; old jobs/receipts remain unchanged; old PIDs supply no signalling authority.                                                                                                                   |
| Pre-existing, replaced, foreign or ungranted Stage 2 cancellation path               | Refusal without an alternate path, old-FIFO fallback or admission reset.                                                                                                                                                                                                                                |
| Same-count foreign member, omission, duplicate or altered order                      | Refusal before admission or dispatch.                                                                                                                                                                                                                                                                   |
| Wrong external pin, changed immutable input or broadened grant                       | Refusal without fallback.                                                                                                                                                                                                                                                                               |
| Competing coordinators or copied grant                                               | At most one exclusive admission; original namespace retained.                                                                                                                                                                                                                                           |
| Replaced cohort/parent/gate, revoked gate or existing blocker                        | No attach and no repair.                                                                                                                                                                                                                                                                                |
| Admission write, sync or close failure; cancellation setup failure; coordinator loss | Pure prechecks precede admission. Assert no Stage 2 Driver construction or FIFO startup before exclusive admission and complete file/directory sync and close. Every admission failure prevents startup; later Driver/FIFO setup failure retains consumed admission and refuses retry.                  |
| Original-five accounting with a fresh Driver and empty `admissions`                  | Reconstruct all five charges from externally digest-bound original jobs using existing D2 primitives. Tampered job bytes/digests, forged summary totals and missing start observations cannot become zero or clean; all five original charges remain represented in the full union.                     |
| Foreign tuple, D3 tuple, wrong ordinal/batch or simultaneous stage contexts          | Coordinator and worker refuse.                                                                                                                                                                                                                                                                          |
| Mutation before qualification, under gate or during reservation                      | No model heartbeat/Popen; any existing reservation remains charged.                                                                                                                                                                                                                                     |
| Original expiry crossed after slow checks                                            | No Popen, refresh or retry.                                                                                                                                                                                                                                                                             |
| Error, finding, interruption, native failure or incomplete cleanup in a batch        | D1 stops owned work; no subsequent batch; complete conservative accounting retained.                                                                                                                                                                                                                    |
| Modified earlier seal or premature future-batch evidence                             | Refusal before further admission.                                                                                                                                                                                                                                                                       |
| Final summary/publication boundary                                                   | Summary cannot publish, waive validity, convert fixture evidence or bypass ordinary complete-generation checks.                                                                                                                                                                                         |
| Existing D3/D1/D2 regression suite                                                   | Existing refusal behaviour, upstream `stable_ast_dump` normalization and both immutable D1 source/AST pins remain effective; D2 runtime bytes remain unchanged.                                                                                                                                         |

Use genuine original seal/evaluator computation for the acceptance-bearing synthetic closures, including the five prerequisites and complete 155 union. Scheduler-only doubles may count calls and concurrency, but cannot prove seal acceptance. If this cannot be demonstrated within the existing contained test boundary, report the blocker instead of substituting fabricated clean outcomes.

After focused tests, run the repository’s required order in the qualified environment: `pnpm agent:check`, `pnpm test`, `node build.mjs`, then `pnpm test:distribution`. Reuse adequate results; repeat only for changed bytes, failures or unresolved concerns.

Once the parent writes this plan after the freeze, format and mechanically lint that exact plan file. Neither formatting nor plan lint has run in this private handoff.

## Assumptions and open points

- The original full 155 corpus and exact source-owned profiles remain the target. A changed scenario population or execution profile is outside this plan.
- Six concurrent remainder roots is recommended to avoid choosing a sequential design whose possible model time alone exceeds the unchanged 24-hour qualification window. Actual completion time remains unknown.
- Independent review must explicitly accept the fixed 150/six-root execution shape before implementation approval. Code approval cannot establish that a later automatic execution review will permit it.
- The independently reviewed specification fixes admission-before-startup, the explicit Stage 2 cancellation binding and original-job accounting. Implementation must demonstrate those behaviours against the real filesystem and measured bounded data shapes; no existing generic attach or durable stage-admission API is assumed.
- The parent reports upstream `develop` at `44d7dff` with the stable cross-Python `stable_ast_dump` adapter. Refresh the implementation base to include this change and PR #607 instead of treating the older local source as authoritative. Preserve both D1 pins; stop only for semantic scope or guarantee drift, not routine base refresh.
- Human implementation approval, paid/model execution grants, external Hosted actions, archive publication and release authority are distinct. The historical paid-execution hold remains in force; the exact original rejection reason is unknown and is neither reconstructed nor waived by this specification review.
- If a hard global descendant, request, token or monetary cap is required, stop this approach. No such cap is established by this executor or proposed here.
- No new platform, service, framework, global grant, source export exception, manual version edit or release-branch source commit is authorized.

## Plan review

**Result:** Approved

The independent plan review of private v1 (`sha256:3f58a1fcf7883c163ce2ba82e56adc66cd1cffb60db3c9bdaf4e743e6556ce43`) concluded Approved with zero Critical findings, zero Important findings and three Notes. This v2 incorporates all three notes below. This is specification-only approval, not human implementation approval, execution clearance, a new grant or removal of the historical paid-execution hold.

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    1 |
| Security        |        0 |         0 |    1 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    1 |
| Testability     |        0 |         0 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    0 |

### Findings

- **N1 — Architecture — Note — Incorporated:** Use existing `run_all` full 155 `zip_longest` order across merge-gate, iterate and next-steps, then remove the five D3 tuples, then slice six. Implementation, independent test oracle and grant must agree. Add a regression that distinguishes filtering before interleaving.
- **N2 — Security — Note — Incorporated:** After pure prechecks, exclusive one-shot admission must be fully synchronized and closed before Stage 2 Driver/FIFO startup. A later setup failure consumes it without retry. Regressions assert this order and the failure boundary.
- **N3 — Error cases — Note — Incorporated:** Reconstruct the original five consumption projections from pinned original jobs and externally bound job digests through existing D2 primitives. The new Driver has no original admissions; neither zero defaults nor summary counters are authority. Regressions cover empty new admissions, altered bindings and uncertain original starts.

There are no remaining technical plan findings. The future approvals and execution proofs below remain mandatory owner gates.

## Remaining owner and execution gates

No technical plan questions remain after incorporating N1–N3. The following are mandatory future owner and execution gates, not unresolved technical review findings:

- Obtain explicit human approval for implementation and, if accepted, at most two bounded correction rounds. Until then, no implementation starts. This specification approval does not reset any earlier allowance.
- Place the exact reviewed plan in the repository only after the R3 freeze ends. Preserve the completed composed R3 source-maintenance QA honestly; its final correction is published as `37e9c352` and its success qualifies neither the native worker nor the Hosted executor. Never relabel a failed native-worker preflight as a pass or fallback qualification.
- After delivered source exists, prepare and separately review fresh exact execution packages. Do not reuse obsolete source-bound grants or expired qualification. Preserve the historical paid-execution hold and unknown exact original rejection reason; any actual execution needs its applicable explicit human grant and permitted automatic execution review.
- Before spending on the first five, confirm that the implemented remaining 150 path and its reviewed grant shape make the complete evidence path executable. A later exact 150 execution grant still waits for genuine first-five closures.
- After fresh 155 archive publication and source integration, let release-please establish the final stamp and freeze that final release SHA/tree for Hosted inspection, independent binding review and its separate execution grant. Under the existing contract, one final Hosted proof can suffice; a preliminary Hosted round is not mandatory.
- Preserve the original exhausted allowance, consumed native-source R1/R2/R3 and unknown parent no-progress history. At the additional candidate’s bound, or on a required hard cap or broader platform need, stop and return the unfinished release acceptance to the parent owner. This specification claims no hard global descendant, request, token or cost limit and does not establish native acceptance.

## Open points

- No open points.

## Implementation checkpoint — test module layout

The first correction closed the FIFO identity/cleanup finding and strict Boolean decoding; independent source and test review have no residual findings. The combined 62-case module reached its existing 150-second watchdog after 58 passes without assertion failures. A bounded diagnostic ran all 26 remaining-stage cases separately: 26 passed in 89.12 seconds, with no skips. The 36 original cases had already completed within the combined run. These results support a normal module split, not a larger timeout or omitted coverage.

Correction 2 was the final round under the initial two-round approval. It moves the existing remaining-stage class into `test_remaining_stage.py` and shares the existing bounded fixture support through ordinary imports. The existing wrapper already discovers such modules; it remains byte-identical, including its 150-second child and 180-second Node limits. Production driver bytes, all test bodies, genuine 155 seal/evaluator computations, security negatives and D1/D2 pins remain unchanged. No new runner, shard mechanism, retry or execution grant is introduced. A failure of the final checks stops this candidate; earlier allowances are not reset.

### Module split validation

The unchanged automatic wrapper passed once after the move: four modules, 79 Python cases, no failures, skips or timeouts. Module runtimes were 53.314, 34.356, 1.673 and 108.824 seconds; the existing 150-second child and 180-second Node watchdogs remain unchanged. Static comparison confirms the same 62 class/method ASTs, the entire moved class and its 145 assertions. Discovery is exactly 36 original plus 26 remaining-stage cases, without duplicate imports. These are contained fixture results, not live model evidence or an execution grant.

## Test results — initial source candidate

Initial final checks ran against the frozen implementation on source base `3cbe56610c9ae71319a12caa84b73eed250cf411`:

| Check                                       | Result                                                             |
| ------------------------------------------- | ------------------------------------------------------------------ |
| Format and explicit maintainer README check | Passed                                                             |
| Full unit suite                             | 4,364 passed, zero failed, three formal skips                      |
| Host-driver tests within that suite         | All 79 Python cases passed across four normally discovered modules |
| Build                                       | Passed                                                             |
| Offline distribution                        | Passed                                                             |

The two split modules completed in 108.54 and 100.84 seconds under the unchanged 150-second Python and 180-second Node limits. All source, modes, index, checkout identities and 264 earlier evidence files stayed unchanged during validation; all owned processes completed without timeout or cleanup signals.

The formal skips retain the archive-freshness boundary and two missing `bot-login-excluded` archive assertions. The filesystem-dependent EILSEQ filename branch was separately unavailable. No skip supplies acceptance. The positive synthetic fixture invokes the genuine original seal and evaluator computations, while scheduler observation doubles provide composed component coverage rather than a fully unpatched live execution. All genuine model, native and Hosted evidence remains outstanding.

Correction 1 fixed FIFO descriptor/path binding, ownership-safe failed setup cleanup and strict Boolean decoding. Its combined 62-case module reached the existing watchdog after 58 passes without assertion failures; that failed run remains retained. Correction 2 moved the existing 26-case class into an ordinary discovered module. Independent AST comparison preserved all 62 methods, the moved class and its 145 assertions. Both original correction rounds remain consumed. The later explicit owner approval below grants only cumulative round 3; it does not relabel or refund either original round.

## Review findings

**Date:** 2026-11-03
**Reviewer:** Independent source security review and test incorporation review

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     2 |
| Open / Not implemented |     0 |

The initial Important FIFO identity/cleanup finding and Note on strict Boolean decoding are fixed. Final incorporation review reports zero Critical, Important or Note findings. Original D1 shutdown source/AST and D2 runtime bytes remain unchanged. Actual worker model and effort metadata are unverified; expected launch settings are not execution evidence.

## Delivery boundary

This archived implemented status covers the approved code milestone and its contained tests. The parent release outcome remains open. Source publication and integration retain their normal gates; no real Hosted qualification, paid eval, trusted-pin update or release is authorized or established by this plan. Eight earlier native roots remain consumed. The original approved plan digest remains `e90bb4a37c68330b43496035748f97d9f2670f8fdc60212c83597456b3b6a3fb`; the additional ordinary test module is the documented test-layout refinement, not a reset of scope or correction history.

## Cumulative correction round 3 — CI module layout

The owner approved the independently reviewed follow-up specification on 2026-11-03, digest `939a38f02f793363a832ba804e83b49419e857effa9764c986b6ed4cec120d5b`. Proposal review closed its one efficiency note by using the existing wrapper exactly once inside the required full unit suite. No technical proposal findings remain.

The CI log proves a whole-module timeout, not the active case or its underlying runtime cause. Its partial progress does not prove the 155-positive case ran. Existing isolated local per-case measurements suggest the 4/14/8 groups at 31.499/25.407/32.208 seconds. They justify more per-module margin, without a CI performance guarantee. The failed CI run and earlier local success remain retained separately.

The approved layout is implemented. Its static check confirms the same canonical 62 targeted identities and 79 total Python cases in six ordinary discovered modules (36/14/3/4/14/8), with all 26 existing test ASTs, seven fixture ASTs and 145 assertions preserved. Independent static verification and implementation review passed without findings; the ordered full QA also passed. `test_first_stage.py`, all product files, D1/D2 and the wrapper remain byte-identical in this round. Ordered local QA passed for the frozen new layout; new-head CI and source integration remain pending. No native or live acceptance is claimed.

### Round 3 validation and review result

The required ordered checks passed once against the frozen round-3 layout: format, full unit suite (4,366 passed, zero failed, three formal skips), build and offline distribution. The unchanged wrapper ran only inside `pnpm test`. All 79 Python cases passed in six ordinary modules with 36/14/3/4/14/8 cases; their durations were 106.78/39.36/1.72/36.54/27.81/37.30 seconds. The existing Python 150-second and Node 180-second watchdogs remained unchanged.

Independent test verification reproduced all 26 test ASTs, seven helper ASTs, 145 assertions and canonical 62 target identities, with no duplicate TestCase discovery or unbound globals. Independent implementation review found zero Critical, Important or Note findings. All other tracked files, D1/D2, the original first-stage module and bridge, product files and wrapper remained unchanged. During full QA, all frozen files, modes, index and own checkout identities stayed stable; all owned processes completed without timeout or cleanup signals, and 320 earlier evidence files remained unchanged.

The existing three formal archive-related skips and separate unavailable EILSEQ filename branch remain unproven. Neither local success nor a prospective CI pass is native qualification or behavioural acceptance. The earlier CI failure remains retained and must not be relabelled. Three cumulative fixed-cohort correction rounds are now consumed; no additional repair or replay is implied. Source PR #610 may advance only after new-head CI and actual current-head bot review pass. Release #595, fresh execution grants and final Hosted qualification remain separate gates.
