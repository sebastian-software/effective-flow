# Fast pilot opt-in with a short baseline and broader workflow coverage

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)
**Implementation progress:** Package A is implemented on this branch (protocol `1.3.0`, portable
Fast, harness qualification, overlap and admission, `correction-pass`, skill-Markdown routing).
Still open: package B (`fix` integration, the `fix` reviewer site, the `cleanup` orphan action);
the plan stays open until it lands.

## Requirement

The owner wants to use the opt-in Fast execution profile in this repository as soon as possible, to
lower token use, and later decide whether Fast can become the default. The owner installs all skills
through DALO, which installs the **portable** build. Today the pilot cannot help at all:

- The portable build is Quality-only and unmeasured
  (`docs/adr/native-execution-profile-representation.md`, "Portable output is Quality-only in V1";
  `src/shared/pilot-measurement-workflow.md`, step 2; `src/shared/execution-profiles.md`,
  "Portable is Quality-only and unmeasured in V1"). Fast exists only as native `-fast` sidecar
  roles, which only `install-skill.sh local` installs. DALO 1.11.1 cannot install native roles for
  Codex and has no verified path for Claude role metadata.
- Since #563, portable spawns already carry build-generated per-spawn model tiers, and
  `docs/adr/per-spawn-model-tiers.md` records that the rendered tiers take effect in portable
  Claude Code 2.1.292 runs. The Fast mapping (`AGENT_PROFILE_MAPPINGS.fast` in `build.mjs`:
  Claude `sonnet`/`medium`, Codex `gpt-5.6-luna`/`medium`) equals the `standard` tier and can be
  expressed as a per-spawn tier in portable output.
- A Quality-only baseline must run 7 days and collect 20 eligible packets before activation
  (`src/scripts/pilot-measurement-protocol.mjs` `aggregation`; `activate()` in
  `src/scripts/pilot-measurement-core.mjs`).
- Only `build` and `refactor` record runs and may select Fast; `fix` is not wired.
- Only one measured record or `merge-gate` observation may be open at a time, and `merge-gate`
  under T3 Code (`Host: t3-code`) reserves no observation at all
  (`src/shared/pilot-measurement.md`, step 2).
- Most changes in this repository touch skill Markdown (`src/tools/*.md`, `src/shared/*.md`);
  `src/shared/project-routing.md` does not say whether that is documentation (Quality-only
  route) or product source, so Fast might rarely apply here.
- Native Fast is unproven on Codex: a probe loaded the base Node.js implementer with a Fast override
  and the child ran the Quality model
  (`docs/plan/2026-10-20-small-parent-context-orchestration.md`, 2026-10-20). A portable spawn has
  no role file that could win over the parameter, so that result does not decide the portable case.

Decisions taken with the owner (2026-11-21):

- **Portable Fast through DALO.** Revise the native-representation decision so that the portable
  build may select Fast through the per-spawn Fast tier on a qualified harness. The owner stays on
  DALO. The native sidecar rendering stays as it is.
- **Short prospective baseline**, not imported history: activation needs 10 eligible completed
  packets from at least 5 completed baseline records, no calendar window; evaluation needs at least
  5 records per cohort.
- **Workflows:** `build`, `refactor` and `fix`; no workflow is required. Runs that `iterate`
  delegates for review notes or CI repair are measured but always Quality. `docs` stays out: its
  writers already run on the Fast mapping.
- **Skill Markdown routes as product source** through an existing Fast-capable route, documented
  in the source branch's `AGENTS.md`.
- **Fast in `fix` gets the routed deep reviewer**, only for Fast packets.
- **Overlapping records are allowed**, flagged as a confounder; a race before a Fast spawn falls
  back with `admission-changed` and consumes no Fast attempt.
- **Orphaned reservations** are closed by `effective-flow cleanup` with a liveness proof or a confirmed
  24-hour stale path.
- **Harness** is the agent runtime under any client surface (T3 Code included), taken from the spawn
  tool's parameter shape only. The surface is not recorded.
- **Per-packet verification** through a Claude subagent-transcript adapter, which also checks the
  host version; no pre-spawn version gate.
- **`merge-gate` under T3 Code is observed too.**
- **Probe first**; Fast only on a qualified harness.
- **Acceptance by ADR amendment:** for this opt-in, a qualified probe plus contract tests; the pilot
  is the behavioural measurement; Fast stays default-off everywhere else.
- **Two packages, one protocol change.** Package A carries the complete protocol `1.3.0` and
  everything needed to start the baseline and later Fast for `build` and `refactor`; package B adds
  `fix`, its reviewer and the `cleanup` action while the baseline runs.

Feature, because it changes the portable execution contract, protocol parameters, admission, the
measured workflow set and when Fast is selected.

## Outcome checkpoint

**Primary source:** Owner request in this session, 2026-11-21; related deferred plan
`docs/plan/2026-09-21-field-pilot-review-and-adoption-decision.md`.
**Original outcome:** Fast used in real DALO-installed runs of this repository as early as
possible, measured well enough to support a later Keep/Change/Stop and a default decision.
**Last evaluated attempt:** None.
**No-progress count:** 0
**Cumulative approach:** Pilot lifecycle helper (#512) and per-spawn model tiers (#563) exist; no
generation was ever started in this repository.
**Continuation decision:** None.

## Architecture decisions

### Protocol `1.3.0` (package A, the only protocol change)

The protocol digest covers only `pilot-measurement-protocol.mjs`, so every field, enum and
parameter below lands in package A; helper operations, workflow prose and docs may follow later.

- Remove `aggregation.baselineWindowMinimumDays` and the `window` check and unmet value;
  `baselineEligiblePacketMinimum: 10`; new `baselineRecordMinimum: 5` (completed baseline records).
  `activate()` checks both counts under `sample`; `busy` stays.
- `aggregation.cohortMinimum: 5`. The chronological-halves comparison becomes informational:
  reported, but an unavailable split no longer makes Keep unavailable. Other minima stay `5`. The
  `baseline-sample` adoption gate follows the new minima.
- Records whose only `firstReason` is `correction-pass` count toward neither
  `baselineRecordMinimum` nor `cohortMinimum`.
- `enums.workflows: build, refactor, fix`.
- New closed record fields: `overlapped` (boolean) and `installKind` (`native`, `portable`); the
  `merge-gate` observation gains `installKind` too.
- New closed packet field `modelCompliance` (`verified`, `mismatch`, `unverified`,
  `not-applicable`) with a `finish-packet` input; packets with `mismatch` are excluded from Fast
  metrics and counted separately; `unverified` is disclosed.
- New excluded `firstReason` `correction-pass` at gate priority 0; new fallback reason
  `admission-changed` (pre-spawn, consumes no Fast attempt, not an escalation).
- Critical and Important finding rates use records whose review ran as denominator.
- Revise the policy projection's Fast intent (`distinct-native-lower-cost-lower-latency-capability`)
  so that it also covers the portable per-spawn tier.
- **Prior protocols.** Replace the single `PREVIOUS_PROTOCOL` with a digest → reason map:
  `1.1.0` → `quality-mapping-changed` (existing migration kept), `1.2.0` (the one digest shipped
  from v1.68.0 to v1.76.0) → new `protocol-parameters-changed`, added to `SUSPENSION_REASONS`.
  State validation depends on the protocol version, so `1.2.0` states without the new fields stay
  valid for `inventory`, `begin-review` and `discard-generation`.

### Portable Fast

- The first implementation spawn of an eligible packet renders a Fast tier line from
  `AGENT_PROFILE_MAPPINGS.fast` next to its Quality (`deep`) line; the orchestrator uses exactly one
  of them per the packet's selected profile. Every other spawn keeps its site tier with no downward
  move. The Fast tier line is exempted by name in the provider-alias guard, not by its coincidental
  equality with the `standard` tier.
- **Harness family** is the agent runtime beneath any client surface, including T3 Code. It is taken
  only from the parameter shape of the spawn tool the orchestrator actually holds: Claude Code's
  Agent tool (`model`, `effort`) → `claude`; Codex spawn (`reasoning_effort`) → `codex`. Host prose
  and provider names in the context are not signals. Without that signal the run is unmeasured and
  Quality, as portable runs are today. A delegation to another provider (for example T3
  `delegate_task`) is never a Fast spawn. The `start` payload carries `installKind` from
  `{{BUILD_TARGET}}` and this `harnessFamily`; the `merge-gate` observation uses the same rule.
- **Selection and enforcement.** `model-selection` gains a Fast lookup that returns only the Fast
  values from the portable `model-selection-contract.json` (which gains
  `AGENT_PROFILE_MAPPINGS.fast`); it authorizes nothing. Enforcement stays with the eligibility gate
  and the pilot helper: `start` and `start-packet` reject `selectedProfile: fast` for a portable
  harness that is not `qualified` in the generation snapshot.
- **Per-packet verification.** `model-selection` gains a `claude-subagent-transcript` adapter next
  to `codex-rollout`:
  - The orchestrator passes the `agentId` from the Agent tool result; the helper builds the exact
    path `~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl` from
    `CLAUDE_CODE_SESSION_ID` and checks each entry's `sessionId` and `agentId`. This one
    environment read is an explicit, narrow exception, amended in `src/shared/model-selection.md`
    and `docs/adr/per-spawn-model-tiers.md`.
  - It reads only `type: assistant` entries and extracts only `message.model`, effort and the host
    `version`; it returns no content, `cwd`, branch or task text. It rejects path traversal and
    symlinks and stays inside the session's `subagents/` directory.
  - Codex uses the existing `codex-rollout` adapter, including the session's `cli_version`.
  - `verified` when the model resolves to the Fast alias, differs from the `deep` model, and the
    host version matches the installed qualification record's major.minor; `mismatch` when any of
    these fails; `unverified` when no observation exists. A Fast `mismatch` keeps the produced work
    (it still passes the run's validation and review) and only leaves the Fast metrics. This
    departs from the general `MODEL_MISMATCH` rule for this case, and the ADR amendment says so.
- Row 1's "no host override that erases the distinction" applies to portable: a missing `model`
  parameter on the Agent tool (as with `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`) makes the packet
  `profile-unavailable`.
- Native builds keep their `-fast` sidecar rendering and today's row-1 rule; `fix` uses the same
  profile seam in both renders.
- Revise `docs/adr/native-execution-profile-representation.md` (its review trigger is a changed
  per-spawn contract) and amend `docs/adr/per-spawn-model-tiers.md`.

### Portable measurement

- Remove the portable exclusion in `pilot-measurement-workflow.md` step 2, `execution-profiles.md`
  and `setup-execution-profiles.md`; portable setup block 10 offers `begin-baseline`.
- `merge-gate` under `Host: t3-code` reserves an observation like other runs and keeps it across
  `SUSPENDED host-pr-watch` re-dispatches through its wisdom file, finalizing it once at the gate
  run's end.

### Harness qualification

- A build-validated record per install kind and harness family states the probe outcome
  (`qualified`, `unqualified`, `unproven`), the host version (major.minor) it ran on, the date and
  the Fast-mapping identity (SHA-256 of the canonical `AGENT_PROFILE_MAPPINGS.fast` values for that
  harness). The build fails when the identity differs from the current mapping. It is read only
  from the installed skill root; absent, malformed or unreadable → `profile-unavailable`.
- `begin-baseline` snapshots the qualification and Fast-mapping identity into the generation
  state; `inventory` returns both the installed record and the snapshot, so the orchestrator never
  parses the file. A harness that qualifies later needs a new generation.
- For `installKind: portable`, gate row 1 requires the harness `qualified` in the snapshot and the
  snapshot identity equal to the installed record's identity. The host version is checked per
  packet in verification, not before the spawn, so a host update never forces a new generation; a
  new release with a new probe restores `verified` packets.

### Overlap and admission

- `start` no longer fails because another record or observation is open; `start-gate-observation`
  no longer returns `busy` for an open record.
- Overlap is marked without linkage: under the lifecycle lock, each new `start` or observation
  start sets a transient flag on every open reservation, and a new reservation flags itself when
  any other reservation or observation is open; the record ORs it into `overlapped` at
  `finalize`. Observations are not flagged. Nothing stores a reference, ordinal or counter of
  another record or observation.
- Classification in `active` stays `eligible + fast` while another record is open. `start-packet`
  of a `fast` packet fails closed when admission is closed (suspension, incident, or a **foreign**
  incomplete record; the run's own reservation and an open `merge-gate` observation do not count).
  The workflow then runs that packet Quality with `admission-changed`.
- Activation still requires an idle generation; `finalize` gets a longer lock-retry budget.
  `inventory` and setup block 10 report a `busy` cause and point to `effective-flow cleanup`.

### Orphaned reservations (package B)

- A reservation records the owning session process (a packet-salted hash of the host name, PID and
  `pidStartTime`, bound like the planning claims) and its reservation time. These fields live only
  in the open reservation and are stripped on every terminal write (`finalize`,
  `reconcile-record`, abandonment). The fields themselves are part of the `1.3.0` state shape
  (package A); the `cleanup` action comes in package B.
- `effective-flow cleanup` offers, each after confirmation and through a new helper operation that
  re-verifies its basis: abandonment of a reservation whose process is proven gone, and of one older
  than 24 hours whose process may still live. The record is finalized as `abandoned`.

### `fix` integration (package B)

- Phase 3 step 2 gets the per-route profile seam (five selector lines, the profile-seam paragraph
  and lazy includes, as in `src/shared/build-delegated-run.md`). The Phase 3 failing-test paths are
  write exclusions of a Fast packet. A Fast packet adds the routed deep reviewer, which needs a new
  spawn-site row in `src/shared/model-tiers.md`; `fix/regression-test` and `fix/verification`
  become `Down: no`. `build.mjs` `profilePhaseAuthorizations` gains `tools/fix.md` (heading pair
  "Phase 3: Fix" / "Phase 3.5: Documentation sync") and its guard message names it. The `fix.md`
  context budget is raised with a stated reason.
- Until package B ships, `fix` stays unmeasured; the protocol already admits it.

### `correction-pass` (package A)

- `iterate`'s item-delegation handoff carries a trusted caller line `Caller: iterate`, also under
  `merge-gate` → `iterate`. The delegated `build`/`refactor`/`fix` run records `correction-pass`
  and selects Quality. A forged line can only force Quality.

### Routing of skill Markdown (package A)

- `src/shared/project-routing.md` and the source branch's `AGENTS.md` state that skill sources
  (`src/**/*.md`) route as product source through an existing Fast-capable route, not the
  `documentation` route; user and developer guides under `docs/` stay `documentation`.

### Unchanged rules and disclosures

- "Historical activity is context only" stays.
- `evaluate` stays pooled; the aligned field-pilot plan says the comparison is pooled and
  confounded by task mix, overlap, harness, install kind and the review-ran denominator, and
  requires no `build` or `refactor` stratum.
- Amend `docs/adr/pragmatic-test-release-policy.md` for this opt-in only; no other capability
  boundary changes, including planned-build delegation.
- Setup block 10 states that one host's probe qualifies the harness for every installation of this
  release, and that a provider gateway may map model aliases differently. The privacy page states
  the transient reservation fields and what the transcript adapter extracts.

## Affected files

| File                                                                                                                                                                                                                                                                                       | Package | Description                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/pilot-measurement-protocol.mjs`                                                                                                                                                                                                                                               | A       | `1.3.0` parameters, fields, enums, reasons, policy intent                                                                                                                                   |
| `src/scripts/pilot-measurement-core.mjs`                                                                                                                                                                                                                                                   | A, B    | activate counts; overlap; fail-closed `start-packet`; snapshot; harness check; prior-protocol map; transient reservation fields; `modelCompliance`; abandon operation (B)                   |
| `src/scripts/model-selection-core.mjs`, `src/shared/model-selection.md`                                                                                                                                                                                                                    | A       | Fast lookup; `claude-subagent-transcript` adapter; narrow env exception                                                                                                                     |
| `src/shared/execution-profiles.md`                                                                                                                                                                                                                                                         | A       | Portable Fast; row 1; `correction-pass`; `admission-changed`; workflows                                                                                                                     |
| `src/shared/pilot-measurement-workflow.md`, `src/shared/pilot-measurement.md`                                                                                                                                                                                                              | A       | Portable measured; `installKind`; overlap; observation under T3; `modelCompliance`                                                                                                          |
| `src/tools/merge-gate.md`, `src/shared/merge-gate-delegated-run.md`, `src/shared/host-pr-watch.md`                                                                                                                                                                                         | A       | Observation across T3 suspensions                                                                                                                                                           |
| `src/shared/setup-execution-profiles.md`, `src/tools/setup.md`, `src/shared/setup-advanced-settings.md`                                                                                                                                                                                    | A       | Portable `begin-baseline`; minima; qualification; busy cause; disclosure                                                                                                                    |
| `src/tools/iterate.md`                                                                                                                                                                                                                                                                     | A       | `Caller: iterate` line                                                                                                                                                                      |
| `src/tools/refactor.md`, `src/shared/build-delegated-run.md`                                                                                                                                                                                                                               | A       | Portable Fast tier line; verification call; wording                                                                                                                                         |
| `src/shared/project-routing.md`                                                                                                                                                                                                                                                            | A       | Skill Markdown routing                                                                                                                                                                      |
| new qualification record (path fixed in build)                                                                                                                                                                                                                                             | A       | Probe results and Fast-mapping identity                                                                                                                                                     |
| `build.mjs`, `build-lib.mjs`                                                                                                                                                                                                                                                               | A, B    | Portable Fast rendering and alias-guard exemption; `portableProfileNotice`; closed `portable: quality-only` rule; row-1 text; record validation; `profilePhaseAuthorizations` for `fix` (B) |
| `src/tools/fix.md`, `src/shared/model-tiers.md`                                                                                                                                                                                                                                            | B       | `fix` integration and site tiers                                                                                                                                                            |
| `src/tools/cleanup.md` and its helper                                                                                                                                                                                                                                                      | B       | Orphaned reservation action                                                                                                                                                                 |
| `docs/adr/native-execution-profile-representation.md`, `docs/adr/per-spawn-model-tiers.md`, `docs/adr/risk-aware-model-tiering-pilot-policy.md`, `docs/adr/pragmatic-test-release-policy.md`                                                                                               | A       | Revision and amendments                                                                                                                                                                     |
| `docs/developer-guide/model-tiering-pilot-protocol.md`, `docs/developer-guide/configuration.md`, `docs/developer-guide/build-system.md`, `docs/developer-guide/release-and-installation.md`                                                                                                | A       | Mirror, prose, portable rendering                                                                                                                                                           |
| `docs/user-guide/model-tiering-pilot.md`, `docs/user-guide/configuration.md`, `docs/user-guide/getting-started.md`, `docs/user-guide/tools-implement.md`, `docs/user-guide/tools-deliver.md`, `docs/user-guide/tools-setup.md`                                                             | A, B    | Portable Fast, minima, overlap, privacy, `fix` and cleanup (B)                                                                                                                              |
| `docs/plan/2026-09-21-field-pilot-review-and-adoption-decision.md`                                                                                                                                                                                                                         | A       | Align minima, pooled evaluation, no mandatory stratum                                                                                                                                       |
| `AGENTS.md` (source branch)                                                                                                                                                                                                                                                                | A       | Adopting workflows; portable Fast; skill Markdown routing                                                                                                                                   |
| `test/pilot-measurement*.test.mjs`, `test/execution-profile-*.test.mjs`, `test/workflow-contracts.test.mjs`, `test/codex-native-profiles.test.mjs`, `test/model-tiers-contract.test.mjs`, `test/build-lib.test.mjs`, `test/model-selection*.test.mjs`, `test/fixtures/execution-profiles/` | A, B    | All changed contracts                                                                                                                                                                       |

## Implementation details

### Approach

1. **Per-spawn Fast probes first**, from the installed portable (DALO) skill on the owner's host,
   one per harness: spawn the built-in general-purpose subagent with the Fast tier values (Claude
   Code Agent tool `model: sonnet`, `effort: medium`; Codex spawn `model: gpt-5.6-luna`,
   `reasoning_effort: medium`) on a trivial read-only task, so the child runs one model turn.
   Observe the actual model and host version through the same transcript or rollout reading the
   adapter will perform. `qualified`, `unqualified` or `unproven` as defined above. Approving this
   plan authorizes one model turn per harness; do not repeat a probe against an unchanged limit.
   Raw observations stay private.
2. **Package A**, in this order of dependency: protocol `1.3.0` and core changes; overlap and
   admission; qualification record, snapshot and row 1; `model-selection` Fast lookup and
   transcript adapter; portable Fast rendering and portable measurement; `correction-pass`;
   `merge-gate` observation under T3; skill Markdown routing; ADRs, setup, docs, `AGENTS.md`,
   field-pilot plan; tests. Portable Fast and `correction-pass` must ship with portable
   measurement, because activation is automatic and irreversible.
3. Release package A. The owner runs `dalo sync`, `effective-flow setup guided`, enables
   `executionProfiles.fast.enabled` and confirms `begin-baseline`.
4. **Package B** while the baseline runs: `fix` integration and reviewer site, orphan action in
   `cleanup`, remaining docs and tests. Release it; no new generation is needed.

### Edge cases

- Claude probe not `qualified`: no Fast for Claude; package A still ships, the blocker is recorded,
  and the owner is told not to start a baseline for Fast.
- Codex probe not `qualified`: Codex runs stay Quality and measured.
- Host update to a new major.minor: Fast packets verify as `mismatch` until a new release with a new
  probe; the generation continues.
- No spawn-tool signal: the run is unmeasured and Quality.
- Overlap while `active`: Fast packets fall back with `admission-changed`; records flagged.
- A crashed session or a run aborted inside a live session: blocks activation until `cleanup`
  (package B) resolves it; `inventory` reports the cause.
- A `1.2.0` generation elsewhere: suspended with `protocol-parameters-changed`, reviewable and
  discardable; a `1.1.0` one keeps its migration.
- `iterate`-delegated runs: `correction-pass`, Quality, measured, not counted toward minima.
- Coupled or mixed-scope packets: share Quality.

## Acceptance criteria

Package A:

- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass.
- [ ] The protocol module reports `1.3.0` with the parameters, fields, enums and reasons above and
      without `baselineWindowMinimumDays`; the mirror matches and the build fails on divergence.
- [ ] Tests: `activate` → `activated` for 10 eligible packets in 5 completed records with no
      elapsed time; `not-ready`/`sample` for 9 packets or 4 records; `correction-pass` records do
      not count.
- [ ] Tests: `evaluate` with 5 records per cohort reports halves without making Keep unavailable
      for that reason alone; finding rates use review-ran records; `mismatch` packets leave the Fast
      metrics.
- [ ] Tests: records and observations can be open together; overlapping records finalize with
      `overlapped: true`; no record or observation references another; `start-packet` of a `fast`
      packet yields `admission-changed` under a foreign incomplete record without consuming a Fast
      attempt; reservation identity fields never reach a terminal record.
- [ ] Tests: a `1.2.0` state is suspended with `protocol-parameters-changed` and can be inspected,
      reviewed and discarded; `1.1.0` keeps its migration.
- [ ] Tests: row 1 resolves `profile-unavailable` for an absent, malformed, `unqualified` or
      `unproven` record, an identity mismatch, a harness not qualified in the snapshot and a missing
      `model` parameter; the helper rejects `fast` for such a harness; the build fails when the
      record identity differs from `AGENT_PROFILE_MAPPINGS.fast`.
- [ ] Tests: the transcript adapter returns `verified`, `mismatch` (model or version) and
      `unverified` as specified, extracts no content, and rejects traversal, symlinks and foreign
      session or agent IDs.
- [ ] The portable build renders a Fast tier line only at authorized first implementation spawns of
      `build` and `refactor`, is measured, and offers `begin-baseline`; native Fast rendering is
      unchanged.
- [ ] `merge-gate` under `Host: t3-code` records exactly one observation per gate run across
      suspensions, covered by a contract test.
- [ ] `iterate`-delegated runs record `correction-pass` and stay Quality.
- [ ] Both probes are recorded and the qualification record reflects them.
- [ ] ADRs, field-pilot plan, user guide, privacy page and `AGENTS.md` state the package-A
      contracts; no document requires a `build` or `refactor` stratum.

Package B:

- [ ] The four repository checks pass.
- [ ] `fix` reserves, starts and finalizes a record on every exit, selects Fast only for the first
      implementer attempt of an eligible packet, excludes failing-test paths from Fast writes, and
      adds the routed deep reviewer for Fast packets; Fast references elsewhere still fail the
      build.
- [ ] Tests: `cleanup` abandons, after confirmation, only a reservation whose process is proven gone
      or that is older than 24 hours.

Completion condition: both packages' criteria hold and the Claude Code probe is `qualified`. If the
Claude probe is not `qualified`, both packages are still delivered, the blocker is recorded in the
qualification record and the completion report, and the owner is told not to start a baseline for
Fast. The Codex probe outcome does not affect completion.

## Validation plan

- The four repository checks per package.
- Targeted runs of the affected test files.
- Probes per Approach step 1.
- Post-completion owner verification (outside this plan's delivery): after release of package A
  and `dalo sync`, `pilot-measurement` `inventory` from the portable install shows a `baseline`
  generation bound to `1.3.0` with the qualification snapshot after `begin-baseline`, and the first
  Fast packet after activation records `modelCompliance: verified`.

## Assumptions and open points

- Assumption: no generation exists in this repository (`.effective-flow/model-tiering-pilot/` is
  absent).
- Assumption: a portable Codex spawn honours its per-spawn model parameter; the probe decides.
- Assumption: Claude Code keeps writing subagent transcripts under
  `~/.claude/projects/<project>/<session>/subagents/` with `message.model` and `version`, also
  under T3 Code; if not, packets are `unverified`.
- Risk: 5 records and 10 packets per cohort give a weak, pooled comparison; the later review treats
  small effects as inconclusive and discloses overlap, task mix, harness and install kind.
- Out of scope: Fast as default, native DALO delivery of agent roles, repairing native Codex Fast,
  Fast in `docs` or `iterate` item runs, and the Small-Parent delegation activation.

## Plan review

**Result:** Approved

### Summary

Latest pass: deep interactive review, 2026-11-21.

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         5 |    0 |
| Security        |        0 |         0 |    1 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         2 |    1 |
| Testability     |        0 |         1 |    2 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    1 |

### Findings

Three internal review rounds before the deep review found, among others, that `iterate` and
`docs` cannot carry Fast meaningfully, that the pragmatic test and release policy needs an
acceptance definition, that activation counted packets while evaluation counts records, that one
open record at a time starves the baseline, that the owner's DALO install is portable and could
never use Fast, that native Fast would have been switched off by portable qualification, and that
orphan-proof fields would have entered pilot records. Each was resolved by an owner decision in the
Requirement section or incorporated directly.

#### Deep interactive review, 2026-11-21

All findings resolved:

- Scope, Important: one build run was too large for the goal; split into packages A and B with one
  protocol change (owner decision).
- Architecture, Important: Claude verification cited `meta.json`, which holds requested values;
  replaced by a `claude-subagent-transcript` adapter on the `.jsonl` with a narrow environment
  exception (owner decision).
- Architecture, Important: the verification outcome had no protocol field; `modelCompliance` added
  to `1.3.0`.
- Architecture, Important: the pre-spawn version check was ambiguous and would force new
  generations; the version is checked per packet in verification (owner decision).
- Architecture, Important: "packets select Quality" in `active` had no legal envelope; Fast packets
  fall back through `admission-changed` (owner decision).
- Architecture, Important: Fast selection had no authority source; the lookup authorizes nothing,
  enforcement stays with the gate and the pilot helper (owner decision).
- Error cases, Important: an unresolved harness could not be measured; harness comes only from the
  spawn tool's parameter shape, otherwise unmeasured; T3 Code is a surface, not a harness (owner
  decision).
- Error cases, Important: wrong override variable; now the missing `model` parameter
  (`CLAUDE_CODE_SUBAGENT_MODEL_FORCE`).
- Testability, Important: eligible-packet yield was unknown because skill Markdown routing was
  undefined; skill sources route as product source (owner decision).
- Error cases, Note: `busy` cause reported with a pointer to `cleanup`.
- Data protection, Note: host name stored as a packet-salted hash; adapter extraction limits stated.
- Testability, Note: observations gain `installKind`; `merge-gate` under T3 Code is observed
  (owner decision).
- Testability, Note: `correction-pass` records do not count toward minima.
- Maintainability, Note: policy intent revised, dead window field removed, native criterion
  reworded.
- Security, Note: adapter path confinement and binding checks.

## Open points

- No open points.

## Build completion

**Date:** 2026-11-21
**Scope:** Package A only, by the owner's decision at run start; package B follows in a later run.

- **Harness qualification:** Claude Code `qualified` at host `2.1` from an observed probe; Codex
  stays `unproven` because its probe could not observe a child (no repeat against the unchanged
  limit).
- **Deviations:** an orphaned reservation or gate observation clears only by `begin-review` and
  `discard-generation` with the pilot disabled until package B's cleanup action ships; `busyCause`
  distinguishes `open-observations`; `finalize` gets five extra lock re-sends; the Claude transcript
  adapter honours `CLAUDE_CONFIG_DIR`.
- **Tests:** the full suite ran once before the review corrections (6221 passed, 2 stale
  expectations fixed afterwards); all later changes were verified targeted (1508 affected tests,
  `agent:check`, build and the distribution smoke test passed).

## Review findings

**Date:** 2026-11-21
**Reviewer:** effective-flow-nodejs-reviewer (two disjoint halves)

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    22 |
| Open / Not implemented |     0 |

One Note (splitting `pilot-measurement-core.mjs` into smaller modules) was closed as outside this
plan's scope.
