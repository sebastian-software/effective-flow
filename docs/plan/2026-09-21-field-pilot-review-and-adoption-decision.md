# Field-pilot review and adoption decision

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

**Planned against:** `91afe89` on 2026-09-21.
**Working state:** Preserve the untracked `docs/concept/` tree and
`docs/plan/2026-09-21-iterate-behavioural-eval-coverage.md`.
**Depends on:** The completed field pilot from
`docs/plan/2026-09-21-build-field-pilot-integration.md` and
`docs/plan/2026-09-21-refactor-field-pilot-integration.md`, plus the measurement subsystem from
`docs/plan/2026-09-21-pilot-measurement-and-trace-lifecycle.md`.

## Requirement

Use real opt-in `build` and `refactor` runs to make exactly one reversible Keep, Change, or Stop
decision. Correctness remains a prerequisite, field confounders are disclosed, missing comparators
remain inconclusive, and no paired benchmark is manufactured. After the decision, delete the raw
reviewed generation and publish an aggregate only through a separate explicit approval.

This is not a recurring router tool in V1. It is a maintainer-run decision procedure using the
work-package-3 helper, followed by ordinary source/documentation changes through
`effective-flow build` where the selected branch requires them.

## Architecture decisions

- Treat the versioned data exported by `src/scripts/pilot-measurement-protocol.mjs` as the sole
  executable preregistration and digest source. Before collection, its shipped version fixes baseline
  and pilot windows, workload strata, harness/proxy compatibility, exclusions, host-load treatment,
  minimum sample, sustained-benefit definition, material-regression tolerances, fallback-cluster
  threshold, and the anonymous merge-gate observation schema/window. Its marked developer-guide
  section is only a build-validated explanatory mirror. Verify that the module version/digest
  confirmed by `begin-baseline` predates collection and matches generation state; this review never
  redefines that generation's protocol from Markdown.
- Use these initial fixed evidence rules: at least 30 eligible packet observations in each Quality
  baseline and active-pilot cohort, at least 10 distinct workflow runs and seven calendar days per
  cohort. Both `build` and `refactor` must each contribute at least one compatible
  workflow×harness stratum with at least ten observations per cohort; no represented workflow may
  be omitted from the decision for undersampling. “Sustained” means the latency, cost, and autonomy
  thresholds pass in every preregistered, sufficiently sampled workflow×harness stratum and both
  chronological halves; no overall weighting can override a failing stratum. Cost strata
  additionally match proxy kind and unit. A fallback cluster is at least three occurrences and at
  least 15% of Fast packets. Material regression means any Critical finding, more than a
  5-percentage-point drop in completion or required-check/validation success, more than a 10% rise
  in Important findings per completed run or Quality correction rounds, or more than a 10% rise in
  anonymous period-level merge-gate rounds normalized per completed observation. Keep
  non-regression must hold both across all measured workflows and separately across the comparable
  would-have-been-Fast/Fast-exposed population. When a baseline adverse-event count/rate is zero, the
  active cohort must also remain zero rather than using relative division. A zero baseline latency or
  cost value cannot demonstrate a percentage reduction and makes that benefit unavailable. The
  cohort-wide minima are exactly 30 eligible packets, ten distinct workflows, and seven calendar
  days once per cohort; they are not reapplied to each half. Each compared workflow×harness stratum
  needs ten available observations per metric and cohort. Split each such metric/stratum/cohort by
  atomic generation ordinal into an earlier `floor(n/2)` and later `ceil(n/2)` half, each with at
  least five available observations. Period-level gate/check and merge-gate comparison separately
  needs ten completed observations per cohort, mode, and harness, split by observation ordinal into
  halves of at least five. Records lacking a metric do not satisfy its minimum. Any unmet cohort,
  stratum, metric, or half minimum makes Keep unavailable.
- Preserve the concept's hypotheses: at least 25% lower median implementation duration, at least
  30% lower supported executor-cost proxy, at least 70% Fast completion without escalation, and no
  material workflow/validation/review regression. Missing compatible baseline or proxy data is
  inconclusive and cannot support Keep.
- Make aggregation produce two local digest-bound views plus a binding review digest: a private
  pre-suppression decision payload and a suppression-preserving publication candidate. Both contain
  only approved numeric/closed fields and no identifiers, paths, timestamps, or source-derived prose;
  the private payload never leaves the generation and is purged. This lets a three-occurrence/15%
  fallback cluster remain evaluable without exposing cells below five in publishable output.
- Add a read-only, digest-bound `evaluate` operation to the existing helper. It consumes the exact
  generation, private-decision, review, and protocol digests; revalidates through read-only inventory
  that review still binds the decision view and unchanged evidence/state/parameters/views; and rejects
  any drift. It performs integer/rational threshold math without binary floats and returns each
  preregistered gate as `pass|fail|unavailable` plus `keepEligible`; it writes no state and never
  chooses Change versus Stop. Cost compares the median compatible proxy per pilot-
  baseline would-have-been-Fast Quality packet with the median total initial-phase proxy per active
  attempted-Fast packet, including its retained-state Quality continuation. Normalize Quality
  correction rounds per completed workflow and merge-gate correction rounds per completed
  observation, separately by `merge|report` and harness.
- Treat the field evidence as observational and unpaired. The benefit comparator is pilot-baseline
  packets marked would-have-been-Fast and executed with Quality versus active packets that attempted
  Fast. Match workflow and harness; cost additionally matches proxy kind and unit. Selected profile
  is intentionally the cross-cohort difference, not a compatibility key. Disclose task mix, host
  load, repository-check time, model availability, missing/incomplete/abandoned records, and baseline
  provenance.
- Treat merge-gate correction rounds as a required preregistered period-level non-regression gate,
  using the anonymous work-package-3 baseline/active observations. They deliberately support no
  per-run linkage, and the review must make no such claim. Keep `merge|report` and harness strata
  separate and normalize correction rounds by completed observations.
- Pause is the immediate operational response to an attributable critical incident while evidence
  is contained and reviewed; it is not a fourth final outcome. Keep remains impossible afterward,
  and the review still ends in exactly Change or Stop.
- Apply this exact decision table:

  | Gate                 | Keep requirement                                                                                                                                 | Unavailable or failed      |
  | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
  | Critical correctness | No attributable critical safety, data-integrity, authorization, or scope-boundary incident                                                       | Change or Stop; never Keep |
  | Latency              | At least 25% lower comparable median implementation duration                                                                                     | Change or Stop             |
  | Cost proxy           | At least 30% lower comparable supported executor-cost proxy                                                                                      | Change or Stop             |
  | Fast autonomy        | At least 70% of Fast packets complete without escalation                                                                                         | Change or Stop             |
  | Workflow quality     | Preregistered non-regression for completion, workflow validation, anonymous period-level required-check success, and Important/Critical findings | Change or Stop             |
  | Merge gate           | Preregistered period-level correction-round non-regression                                                                                       | Change or Stop             |

  Change converts clustered causes into exclusions/routing changes or defines a new, separately
  preregistered pilot generation. Stop disables/removes Fast while preserving Quality.

- Define Keep as production adoption without recurring telemetry: retain Fast as an explicitly
  enabled project option while Quality remains the default, remove pilot-generation admission as a
  routing prerequisite, remove/hide Guided `begin-baseline` and `resume` controls, stop `build` and
  `refactor` measurement calls, and leave the measurement subsystem dormant after purge. Enabled
  production Fast with no generation performs no pilot runtime write. The deleted generation or an
  aggregate never acts as runtime authorization. Starting another measured generation requires a
  later Change decision; it is never an implicit Keep continuation.

- Update the existing fail-closed pilot/adoption ADR with rationale and limitations, not raw metric
  dumps. Concrete aliases and empirical thresholds remain replaceable operational values.
- Adoption approval, aggregate publication, and destructive purge are three independent decisions.
  Publication names the exact redacted digest and destination. Purge names the exact reviewed
  generation/digest and requires a dry run plus confirmation.
- Publication approval never waives small-cell suppression. Unsuppressed cells require a separate
  disclosure review, a newly generated digest, and destination-specific approval. Numerical metrics,
  counts, rates, or distributions in tracked ADRs or documentation are publication. If publication
  is declined, tracked artifacts contain only the categorical decision and limitations. A failed or
  unverifiable copy publishes nothing and cannot justify indefinite raw-evidence retention; verify
  destination bytes against the approved digest before purge.
- Add a separate destructive `discard-generation` operation before pilot collection begins. It is
  legal only with configuration disabled, terminal `generationState=review`, no live writer or other lock,
  verified namespace/generation ownership and containment, no symlink anywhere in the target, an
  exact full-inventory digest, and explicit confirmation of that generation/digest. Its read-only
  `dryRun:true` form returns only bounded opaque counts by safe file type, total bytes, and the
  canonical digest—never paths or values. The confirmed form acquires its own lifecycle lock, proves
  no other lock/writer, and revalidates the entire digest immediately before it atomically
  renames only the generation to a digest-bound tombstone and deletes only that tombstone; same-
  digest retry is idempotent. Unknown or malformed members may be included in the inventory digest
  but never parsed, relayed, or copied. Discard emits no adoption aggregate, makes Keep unavailable,
  and requires Change or Stop. Manual recursive deletion remains forbidden.

## Affected files

| File or area                                                                    | Planned change                                                                     |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `docs/adr/risk-aware-model-tiering-pilot-policy.md`                             | Record Keep/Change/Stop, evidence limits, rollback, and next review trigger.       |
| `docs/developer-guide/model-tiering-pilot-protocol.md`                          | Keep the marked explanatory mirror aligned; allow no retroactive threshold change. |
| `src/shared/execution-profiles.md`                                              | Apply changed exclusions/routing or final retained/removed policy.                 |
| `src/tools/build.md`, `src/tools/refactor.md`                                   | Change only if the decision alters or removes workflow routing.                    |
| `build.mjs`, native profile tests                                               | Change only if profile availability/mapping changes.                               |
| `docs/user-guide/model-tiering-pilot.md`                                        | Record review, retention, and resulting lifecycle.                                 |
| `docs/user-guide/configuration.md`                                              | Match the final activation policy.                                                 |
| `docs/user-guide/tools-implement.md`                                            | Match final `build`/`refactor` behavior.                                           |
| `docs/developer-guide/architecture.md`, `docs/developer-guide/configuration.md` | Match the final architecture and schema.                                           |
| Relevant focused tests/evaluations                                              | Prove exact aggregate/evaluate math, the selected branch, and any new exclusions.  |

Depending on the selected branch, also update `src/tools/setup.md`,
`src/shared/config-migration.md`, `src/shared/pilot-measurement.md`, the measurement helper modules
and tests, `docs/user-guide/tools-setup.md`, `docs/user-guide/tools-deliver.md`, the native-profile
ADR, and `AGENTS.md` wherever their lifecycle, configuration, or ownership contracts change.

Do not add a new exposed tool, tracked raw-results directory, or merge-gate writer. If recurring
self-service later becomes a product requirement, plan an internal `review pilot` route separately
with its context-budget, roster, and eval-freshness consequences.

## Implementation details

### Approach

1. Verify that the shipped protocol-module version/digest confirmed at `begin-baseline` predates
   collection and matches generation state. Treat the marked Markdown section only as its build-
   validated mirror. If executable preregistration cannot be proven, Keep is structurally
   unavailable.
2. Disable `executionProfiles.fast.enabled` through setup as immediate rollback, without rewriting
   persisted generation state. Then invoke guarded `begin-review` for the exact generation and
   explicitly confirm the expected generation/inventory digest as a compare-and-set guard. Require a
   successful response proving separate `configState=disabled` and
   `generationState=review`. The transition accepts baseline, active, or suspended state, preserves
   suspension and incomplete-evidence facts, rejects new reservations, and permits only captured
   reservations to drain or reconcile. Never call `resume` afterward.
3. Confirm no active workflow writer or pilot lock. Let captured reservations finalize; use digest-
   bound `reconcile-record` only for a provably owned incomplete record and mark it `abandoned`
   without inventing outcomes. Preserve suspension causes and include abandoned/unavailable counts
   in the aggregate; they make Keep unavailable. Unknown, malformed, symlinked, or ownership-
   uncertain material prevents normal aggregate/purge and makes Keep unavailable; route it only to
   the guarded discard path after selecting Change or Stop.
4. Capture transient byte digests for selected unrelated runtime files before purge, then inventory
   and validate complete, incomplete, abandoned, malformed, missing, and detailed records by
   workflow, harness, profile, reason, and proxy group. Aggregate only after the terminal review
   freeze and drained/reconciled reservations; stop if integrity cannot be established.
5. Generate the private pre-suppression decision payload, suppression-preserving publication
   candidate, and binding review digest with the shipped helper. Keep the private payload inside the
   generation and never export raw records or private summaries to a spreadsheet or tracked eval
   directory.
6. Invoke read-only `evaluate` for the exact generation/private-decision/review/protocol digests. It
   first rejects member, state, parameter, or view-digest drift, then deterministically reports
   `pass|fail|unavailable` for completion, validation/CI, Important/Critical findings, normalized
   correction rounds, escalation, fallbacks, critical incidents, latency, cost, autonomy, and the
   preregistered period-level merge-gate source before emitting `keepEligible`. It never persists or
   chooses Change versus Stop.
7. Verify that benefit uses only the exact pilot-baseline-Quality-would-have-been-Fast versus active-
   attempted-Fast populations and compatible workflow/harness/proxy strata. Cost uses the two
   protocol-defined per-packet medians; Quality corrections use completed workflows; merge-gate
   corrections use completed observations separated by mode/harness. Any missing required comparator
   makes Keep unavailable.
8. If unknown or malformed evidence prevents a trustworthy aggregate, make Keep unavailable and
   limit selection to Change or Stop. A symlink or unverified ownership still blocks discard until
   the guard can be restored without touching evidence. Then select exactly one branch:
   - **Keep:** every row of the exact decision table passes; productize the opt-in Fast route without
     ongoing measurement or generation-state admission, with Quality still the default.
   - **Change:** implement exclusions/routing changes for clustered causes, or define an extended
     pilot because evidence is insufficient; the reviewed generation still ends.
   - **Stop:** leave Quality as the only path and remove/deactivate Fast behavior without migration.
9. If publication is desired, present the exact suppression-preserving publication digest and
   destination for separate approval. Decline means publish nothing. Any unsuppressed version needs
   a new disclosure review, digest, and approval.
10. Copy only the explicitly approved publication candidate, if any, and verify destination bytes
    against its digest. Then dry-run the exact generation, obtain destructive confirmation, purge
    minimal records, detailed traces, anonymous gate observations,
    generation and suspension state, operational locks, and every unapproved local summary, run a
    canonical absent-generation/zero-matching-tombstone inventory, and compare the unrelated-runtime
    digests. Failure before the atomic rename leaves the live generation intact; failure after rename
    leaves no live generation and may leave only the exact digest-bound tombstone, for which repeating
    the same purge is idempotent. Completion requires both generation and tombstone absence.
    When normal aggregate/purge is impossible because owned evidence is malformed or unknown, copy
    and publish nothing. Obtain the exact full-inventory digest and explicit destructive confirmation,
    then invoke `discard-generation` only after Change or Stop; verify generation and matching-
    tombstone absence with unrelated runtime bytes unchanged.
11. Only after purge verification, update the canonical profile contract first, then the affected
    workflow/native code, ADR, and guidance. Implement from the recorded categorical decision and,
    only when separately approved and published, the exact publication aggregate—not from retained
    raw or private decision evidence.
12. Run focused and full validation, report the decision and limitations, and complete any owed
    manual merge-gate eval re-record before release rather than weakening freshness checks.

### Edge cases and stop conditions

- Undefined sample, regression, sustained-benefit, or cluster rules block the decision.
- Malformed, systematically missing, incompatible, or integrity-uncertain evidence blocks Keep.
- No comparable baseline, cost proxy, or preregistered merge-gate period source makes Keep
  unavailable; never invent a comparison, infer dollars, or waive a required row as inapplicable.
- A critical attributable safety/data/authorization/scope incident prevents Keep.
- Publication approval for a different digest/destination is no approval.
- Purge stops before rename on a live writer, symlink, unknown entry, ownership failure, or digest
  mismatch and leaves the live generation intact. A crash after its verified atomic rename may leave
  only the exact tombstone; same-digest retry must finish it without touching unrelated state.
- `discard-generation` is not a bypass for a live writer/other lock, symlink, containment failure, or
  unverified ownership. It accepts unknown/malformed owned members only as opaque inventory-bound
  bytes, publishes nothing, and can never support Keep.
- A branch that requires portable Fast, caller-model control, or expansion into `fix`, `iterate`,
  or `merge-gate` exceeds the concept and needs a new concept/plan.

## Acceptance criteria

- [ ] The shipped protocol-module version/digest confirmed by `begin-baseline` predates collection
      and matches the reviewed generation; the marked Markdown section is only its validated mirror.
- [ ] Configuration is disabled without rewriting generation state, then `begin-review` proves
      separate `configState=disabled + generationState=review`, rejects new reservations, preserves
      suspension/incomplete facts, drains or reconciles captured records, and has no resume path.
- [ ] The reviewed generation has an exact digest, valid/invalid/incomplete/abandoned counts, and
      compatible metric groups; abandoned or unavailable evidence makes Keep unavailable.
- [ ] Exactly one Keep, Change, or Stop decision covers latency, supported/unavailable cost,
      Fast-without-escalation, fallbacks, corrections, completion, validation, and important review
      findings.
- [ ] Aggregation emits a private pre-suppression decision payload, a suppression-preserving
      publication candidate, and one review digest binding both; the private payload stays local and
      makes the three-occurrence fallback threshold evaluable without leaking suppressed cells.
- [ ] Read-only `evaluate` is bound to exact generation/private-decision/review/protocol digests,
      revalidates unchanged membership, state, parameters, and both views, rejects each drift class,
      uses integer/rational math, returns every gate as `pass|fail|unavailable` plus `keepEligible`,
      persists nothing, and leaves Change-versus-Stop to the maintainer.
- [ ] Cost compares compatible per-packet medians for pilot-baseline would-have-been-Fast Quality and
      active attempted-Fast packets including their initial fallback continuation; Quality correction
      rounds are per completed workflow and merge-gate rounds per completed observation separated by
      mode and harness.
- [ ] Keep removes pilot-generation admission from production routing, retains Fast only behind the
      explicit project opt-in, keeps Quality as the default, removes Guided baseline/resume controls
      and all workflow measurement calls, leaves measurement dormant, and uses neither the deleted
      generation nor a published aggregate as authorization. Enabled production Fast without a
      generation writes no pilot state.
- [ ] Keep is selected only when every decision-table row, including period-level merge-gate
      non-regression, passes; any unavailable required comparator yields Change or Stop.
- [ ] Benefit compares pilot-baseline Quality packets marked would-have-been-Fast with active packets
      that attempted Fast, matched by workflow/harness and additionally proxy kind/unit for cost.
      Each cohort independently meets 30 packets, ten workflows, and seven days; each metric/stratum
      has ten observations per cohort and five in each ordinal half. Period observations meet the
      analogous ten-per-mode/harness cohort and five-per-half rule. Zero latency/cost baselines are
      unavailable, while zero baseline adverse-event rates require active zero.
- [ ] Workflow-quality non-regression holds for all measured workflows and separately for the
      comparable Fast-exposed population; merge-gate rates are normalized by completed observation
      and remain separate by `merge|report` mode and harness.
- [ ] Confounders and unpaired limitations are explicit and no unsupported causal or merge-gate
      linkage claim is made.
- [ ] Every clustered cause becomes an implemented exclusion/routing change, an extended-pilot
      rationale, or a reason for Stop.
- [ ] The ADR, canonical policy, configuration reference, workflow docs, and implementation agree.
- [ ] No aggregate or tracked numeric evidence is published without separate exact digest/destination
      approval; small-cell suppression remains mandatory, unsuppression requires a new disclosure
      review/digest/approval, and destination bytes are verified before purge.
- [ ] Declining publication does not block policy implementation: tracked artifacts use the
      categorical decision and limitations only; numeric evidence is used only when its exact
      publication candidate was separately approved and verified.
- [ ] Raw records, traces, gate observations, generation and suspension state, locks, and unapproved
      local summaries are gone before policy implementation; canonical generation absence, zero
      matching tombstones, and unrelated-runtime digests prove the boundary, including idempotent
      recovery after a post-rename crash.
- [ ] If malformed or unknown owned evidence prevents normal aggregate/purge, Keep is unavailable and
      no evidence is published. After Change or Stop, `discard-generation` requires disabled config,
      terminal review, safe ownership/containment, no writer/other-lock/symlink, a bounded value-free
      dry-run returning the exact full-inventory digest, and explicit confirmation. Its confirmed call
      holds its own lifecycle lock, revalidates the digest, atomically deletes only the matching
      generation/tombstone, and supports idempotent retry.
- [ ] Full repository checks pass and any required behavioural-eval refresh is complete before
      release.

## Validation plan

First, the helper tests must exercise `begin-baseline` refusal without valid configuration,
successful confirmed baseline creation, `activate` refusal below the preregistered sample/window,
and successful transition at the exact threshold. For the selected generation, run these lifecycle
operations and validate each JSON response, including generation state plus record, trace, and
gate-observation counts:

```sh
printf '%s\n' '{"generation":"<generation>"}' | node src/scripts/pilot-measurement.mjs inventory
printf '%s\n' '{"generation":"<generation>","expectedGenerationDigest":"<digest-returned-by-inventory>","confirm":true}' | node src/scripts/pilot-measurement.mjs begin-review
printf '%s\n' '{"generation":"<generation>"}' | node src/scripts/pilot-measurement.mjs inventory
printf '%s\n' '{"generation":"<generation>","protocolDigest":"<protocol-digest>"}' | node src/scripts/pilot-measurement.mjs aggregate
printf '%s\n' '{"generation":"<generation>","decisionDigest":"<decision-digest-returned-by-aggregate>","reviewDigest":"<review-digest-returned-by-aggregate>","protocolDigest":"<protocol-digest>"}' | node src/scripts/pilot-measurement.mjs evaluate
printf '%s\n' '{"generation":"<generation>","reviewDigest":"<review-digest-returned-by-aggregate>","dryRun":true}' | node src/scripts/pilot-measurement.mjs purge
printf '%s\n' '{"generation":"<generation>","reviewDigest":"<review-digest-returned-by-aggregate>","confirm":true}' | node src/scripts/pilot-measurement.mjs purge
printf '%s\n' '{"generation":"<generation>"}' | node src/scripts/pilot-measurement.mjs inventory
```

If normal aggregate/purge is impossible and Change or Stop has been selected, validate the separate
destructive path instead:

```sh
printf '%s\n' '{"generation":"<generation>","dryRun":true}' | node src/scripts/pilot-measurement.mjs discard-generation
printf '%s\n' '{"generation":"<generation>","inventoryDigest":"<full-inventory-digest>","decision":"change","confirm":true}' | node src/scripts/pilot-measurement.mjs discard-generation
printf '%s\n' '{"generation":"<generation>"}' | node src/scripts/pilot-measurement.mjs inventory
```

Each command uses the operation as its sole positional argument, exact-key JSON stdin, the stable
stdout envelope, value-free stderr, and nonzero failure. The final inventory must return the
canonical absent-generation result and zero matching tombstones; verify any approved summary at its
exact destination and compare the transient unrelated-runtime digests. Helper/decision tests pin
every exact threshold boundary, missing metric, zero denominator, cohort/half/stratum minimum, proxy
mismatch, separate merge/report mode, incomplete reconciliation, member/state/parameter/view-digest
drift before evaluate, publication suppression, purge response loss, tombstone retry, discard
refusal/confirmation/crash recovery, and every
Keep/Change/Stop consequence. Then run work-package-3 helper tests,
work-package-4/5 scenario verification, focused tests for the selected branch, and:

```sh
pnpm agent:check
pnpm test
node build.mjs
pnpm test:distribution
pnpm execution-profile-eval:verify
pnpm merge-gate-eval verify
```

Use strict merge-gate eval verification only at release after any owed evidence re-record.

## Assumptions and open points

- The Quality-only baseline and period-level merge-gate source must be preregistered and collected
  before Fast activation. If implementation cannot supply either, Keep is structurally unavailable.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------- | --------- | ---- |
| Architecture    | 0        | 0         | 0    |
| Security        | 0        | 0         | 0    |
| Data protection | 0        | 0         | 0    |
| Error cases     | 0        | 0         | 0    |
| Testability     | 0        | 0         | 0    |
| Scope           | 0        | 0         | 0    |
| Maintainability | 0        | 0         | 0    |

### Findings

- **Critical — resolved Keep semantics:** Keep productizes Fast behind the explicit project opt-in,
  keeps Quality as default, removes generation-state admission plus Guided baseline/resume controls
  and workflow measurement calls, leaves measurement dormant, and never uses deleted evidence as
  runtime authorization. A new generation requires a later Change decision.
- **Important — resolved evaluation owner:** The existing helper gains read-only, digest-bound
  `evaluate`, which owns exact rational gate math and emits per-gate results plus `keepEligible`
  without persistence or selecting Change versus Stop. Cost and correction denominators are fixed.
- **Important — resolved deletion recovery:** A separately confirmed, full-inventory-digest
  `discard-generation` operation deletes the exact terminal generation through an atomic tombstone
  when malformed/unknown owned evidence prevents normal aggregate/purge. It publishes nothing,
  makes Keep unavailable, and never bypasses writer, lock, symlink, containment, or ownership guards.
- **Incorporated during deep review:** The shipped runtime module is the sole preregistration
  authority; review is a terminal generation state distinct from configuration disablement;
  comparator populations and separate cohort/stratum/half minima are exact; a private decision view
  preserves low-count gate math without weakening publication suppression; begin-review and discard
  use confirmed compare-and-set/dry-run digests; positional CLI use, reconciliation, optional
  publication, and canonical post-tombstone inventory are explicit.

## Open points

- No open points. The empirical Keep/Change/Stop choice remains intentionally deferred until a
  complete reviewed generation exists.
