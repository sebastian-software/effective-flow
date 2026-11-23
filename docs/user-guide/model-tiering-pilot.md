# Model-tiering pilot data and privacy

Effective Flow includes a local measurement subsystem for the opt-in Quality/Fast field pilot of
`/effective-flow build`, `/effective-flow refactor` and `/effective-flow fix`. The subsystem can create a preregistered Quality-only baseline, retain
pilot evidence, evaluate the protocol gates, and remove one reviewed generation safely. Nothing
starts by itself: you opt in and start the baseline through a confirmed action in
`/effective-flow setup` (a Targeted request or Guided), and a later `build`, `refactor` or `fix` run
activates the generation automatically once the preregistered baseline conditions pass. These three
are the only workflows that record runs and may select Fast. The pilot works in native installations and in the portable build that DALO
installs, where Fast needs a qualified harness (see "Portable Fast and harness qualification").

## Where evidence lives

Pilot evidence stays below
`<RUNTIME_STATE_ROOT>/.effective-flow/model-tiering-pilot/`. The whole `.effective-flow/`
directory must be ignored by Git and contain no tracked path. Evidence is local to one project and
one generation; Effective Flow does not send raw records or detailed traces to a service or reuse
the merge-gate behavioral-evaluation archive.

When a workflow looks for the current generation, the helper accepts only three outcomes: none,
exactly one, or an ambiguous error. It never picks one of several generation directories. Starting
a baseline is serialized separately, so two current generations cannot be created concurrently.

A minimal workflow record contains bounded, structured measurements such as the baseline or pilot
cohort, install kind (native or portable), harness family, selected profile, eligibility and first gate reason, duration availability, fallback,
an `overlapped` flag, a per-packet model-compliance outcome,
validation and review summaries, completion status, and correction counts. It excludes prompts,
diffs, source, paths, command text or output, environment values, model aliases, URLs, and personal,
repository, branch, task, PR, or session identifiers. Opaque internal record identifiers carry no
such meaning.

While a baseline or active generation exists, non-observer `merge-gate` runs may add a separate
anonymous period observation. It records only the mode and terminal outcome, harness family,
required-check summary, install kind, and counts of actual CI repair, configured-reviewer implementation, and
conflict-resolution work. It contains no PR, repository, branch, workflow-record, check-name,
comment, finding, or path identifier and cannot be linked to a `build`, `refactor` or `fix` run. An
observer-only re-entry records nothing. An observation is also skipped, without affecting the
pilot, when admission closes as it starts (for example because the baseline is activating at that
moment). An observation under T3 Code is kept across the gate's wait suspensions and recorded once
at the end of the gate run. Records and observations may be open at the same time.

Observation setup sends the verified runtime root and repository identity together with the
generation, configuration and generation states, `merge|report` mode, harness family, and install kind.
The returned observation identifier and raw capability remain transient. Finalization authenticates
that capability and records one closed outcome, the three counters, and either final required-check
evidence or explicit unavailable values. Every normal or early exit after reservation finalizes
exactly once; an early report-mode stop is `reported-blocked` with unavailable check evidence.

## Activation and detailed consent are different decisions

`executionProfiles.fast.enabled: true` is project-level admission to the pilot lifecycle. It is not
activation, does not start measurement, and does not authorize a detailed trace. Setup block 10,
from Guided or a Targeted request, offers the lifecycle steps you confirm as separate actions, at
most one per run and only for the state the stored generation proves:

1. **Start the baseline.** Setup displays the exact shipped protocol digest and version, discloses
   the local minimal-data collection, names the preregistered minimum (at least 10 eligible packets
   in at least 5 completed baseline records, no calendar window), snapshots the harness
   qualification, and starts a Quality-only baseline only after your confirmation. From then on,
   `build`, `refactor` and `fix` runs record minimal measurements while every packet still runs Quality.
2. **Resume.** A suspended generation with healthy evidence can be resumed after setup shows the
   inventory and suspension digests the resume is bound to. The helper restores the state stored
   at suspension. A generation in `review` never resumes.

The baseline confirmation is the only one for activation: activation follows automatically. Every
measured `build`, `refactor` or `fix` run in a baseline generation asks the helper to activate it before
reserving its record. The helper activates once the preregistered baseline sample conditions pass:
at least 10 eligible packets in at least 5 completed baseline records. Records of runs that
`iterate` delegated (correction passes, always Quality) are measured but count toward neither
minimum. Until then the generation stays in its baseline and the run continues as a baseline run.
Activation also needs an idle generation: while another record or observation is open, the
generation stays in its baseline, but runs keep recording. A `merge-gate` run that waits for a PR
under T3 Code keeps its observation open until the gate run ends; setup reports that as open
observations. An orphaned reservation (a crashed or aborted run that never finalized) keeps the
generation from activating, and setup reports it as open reservations. Only the run that
made a reservation can reconcile it; `/effective-flow cleanup` abandons an orphan after your
confirmation (see below), and otherwise it clears only by reviewing and then discarding the
generation with the pilot disabled, which loses the generation's evidence. In an active generation, an eligible packet uses
Fast for its first implementation attempt only. In `refactor`, that attempt comes only after the
before-change baseline checks, and a packet whose baseline shows a pre-existing failure or lacks
optional evidence stays Quality; missing required evidence stops the run before any change.

Runs may overlap. Overlapping records are flagged `overlapped`, without recording which run
overlapped which, and the later evaluation discloses overlap as a confounder. If another run's
unfinished record closes admission before a Fast packet spawns, that packet runs Quality and records
`admission-changed`; it uses no Fast attempt.

## Portable Fast and harness qualification

The portable build selects Fast through a per-spawn model setting for the first implementation
attempt of an eligible packet, only on a harness that the shipped qualification record marks
`qualified`. The record states, per install kind and harness family, the probe outcome, the host
version (major.minor) and the identity of the Fast mapping it was probed against. Today Claude Code
is `qualified` and Codex is `unproven`, so Codex runs stay Quality and are still measured. Setup
snapshots the record when you start the baseline; a harness that qualifies later needs a new
generation.

- The harness family is read only from the spawn tool the run holds (Claude Code's Agent tool or a
  Codex spawn). The client surface, T3 Code included, is not recorded and not a signal. Without the
  signal the run is unmeasured Quality.
- One host's probe qualifies the harness for every install of this release. A provider gateway may
  map model aliases differently from the probe, so each Fast packet is checked afterwards.
- For a Fast packet on Claude Code, the helper reads the child's own transcript and extracts only the
  model name, the effort and the Claude Code version from assistant entries. It reads no
  prompts, replies, transcript `cwd` field, branch or task text, and keeps none of it: it stores one of
  `verified`, `mismatch` or `unverified` per packet. A Fast packet with no child to check, because
  its spawn was rejected or it ran Quality after an incident that could not be saved, is stored as
  `unverified`; only a Quality packet, or a Fast packet that fell back to Quality because admission
  changed before its spawn, is stored as `not-applicable`. Codex
  uses the child's rollout file the same way, plus the session's CLI version. To find the Claude
  Code transcript, the helper reads two environment values, the session identifier
  (`CLAUDE_CODE_SESSION_ID`) and the configuration directory (`CLAUDE_CONFIG_DIR`, defaulting to
  `~/.claude`). When the working directory's project folder does not hold that session, it lists up
  to 4096 project folder names below `projects/` to find the one that does, without opening any of
  them; it reads no other file.
- A `mismatch` packet keeps its work, which still passes validation and review, and leaves the Fast
  metrics; it is counted separately. `unverified` packets stay in the metrics and are disclosed.

Disabling the key or keeping an invalid value needs no migration, deletes nothing, and starts no
action. A project that never opts in stays Quality-only and records nothing.

A detailed trace has a separate, current-run consent boundary. The workflow may attest
`detailOptIn: true` only after an explicit request in that run. Consent is not stored as text or
identity and does not carry into another run. An allowed trace may contain bounded requirement
statuses, normalized repository-relative paths, stable check outcomes, and closed finding or
escalation fields. It still rejects raw handoffs, prose findings, commands, environment, output,
source excerpts, absolute paths, URLs, and unknown fields.

## Review, retention, and deletion

Configuration and generation state remain independent. Disabling the project key stops new
measurement and Fast selection without deleting evidence or clearing a suspension. A suspension
blocks later Fast until it is resumed, and another run's incomplete record blocks Fast admission
until that run finalizes or reconciles it. A critical safety,
data-integrity, authorization, or scope incident that the helper stores suspends the generation, so
Fast stops until an explicit resume; an incident it cannot store suspends nothing, as described
below. Only a still-suspended generation can resume; a generation in `review` is terminal
and cannot return to admission.

A `build`, `refactor` or `fix` run reports such an incident to the helper by its category, and the helper
records the suspension; your product changes are kept either way. From that point the same run
starts no further Fast attempt: every packet it has not yet started runs Quality. If the helper
cannot store the suspension, the run shows an alert and offers once to retry. Without a stored
suspension nothing stops a later run from selecting Fast, so the run says so; disable the pilot in
setup (Guided or a Targeted request) to keep later runs on Quality until you enable it again. If a
run cannot finalize its own pilot record, a genuine storage fault makes the helper suspend the
generation itself, while lock contention, a rejected request, or a location fault leaves the pilot
state unchanged. Either way the run asks once, in the same run, whether to mark that record
abandoned; an abandoned record counts none of its packets as a success. Only that run can do so. If
you decline, or the run cannot ask, the incomplete record stays: it blocks activation, aggregation,
and later Fast spawns until it is closed. Purge is no way out, because it needs a completed
aggregation, which an open record prevents.

An open record that a crashed or aborted run left behind is cleared by `/effective-flow cleanup`. It
lists open pilot records with the workflow, age and whether the owning session is still running,
and abandons one only after a dry run and your confirmation for that item, under one of two
proofs: the session that reserved it and its recorded parent processes are provably gone on this
host (which needs Linux `/proc`), or
the record is older than 24 hours and you confirm that. A crashed session usually leaves a parent
process running, such as its terminal, so its record usually shows unknown liveness and the 24-hour
path applies. The 24-hour path cannot see a session on
another host, and a very long run may still be alive; such a run then records nothing more, and its
own completion report shows the record as `abandoned`. Records written before the host binding
below existed can only be cleared by the 24-hour path. If an abandonment is interrupted after it
closed the record but before it removed the run's timing receipts, the next cleanup lists that
record again and finishes the removal after your confirmation. Cleanup changes no product file and
no other record. An open `merge-gate` observation has no owner proof and is not offered; it, and
leftover timing receipts behind a record its own run finished, still clear only by reviewing and
discarding the generation with the pilot disabled.

A packet that a run never started, because the run stopped earlier, is recorded as not
started and left out of every packet metric, so it cannot count as a Fast attempt.

Review freezes new reservations but lets already captured work finish or reconcile. Aggregation
then produces two local views:

- a private, pre-suppression decision view used by the read-only evaluation; and
- a publication candidate that suppresses every small cell required by the shipped protocol.

Neither view is published automatically. Publishing even the suppressed aggregate requires a
separate review and approval. Detailed traces never feed the metrics and remain private inventory
bound into the review digest.

The publication candidate suppresses an entire fixed or dynamic distribution when any member is
undersized, so a visible sibling and linked total cannot disclose the hidden count by subtraction.
A packet subset count is visible only when both that subset and the remainder of `packetCount` meet
the suppression minimum. Duplicate child counts and ratios are suppressed with the distribution;
only enclosing totals may remain visible when the distribution has no visible child counts. Neither
aggregate view carries a generation identifier; the local review wrapper owns that binding.
Evaluation enforces the required cohort (5 records), metric-stratum, and period-observation sizes;
the chronological halves are reported for information and never make Keep unavailable alone. The
comparison is pooled and observational, so task mix, overlap, harness, install kind and whether a
review ran confound it, and no per-workflow split is required. Gate observations compare
like `merge|report` and harness groups, while cost compares the
baseline's would-be-Fast Quality work with the pilot's attempted-Fast work only when kind and unit
are identical. Insufficient or incompatible evidence is unavailable.

Normal purge requires a reviewed generation, a dry-run inventory, the exact generation and review
digest, explicit confirmation, and no live or unknown writer. It atomically moves only that
generation to a digest-bound tombstone and removes only that tombstone. If malformed or unknown
owned evidence prevents normal aggregation, the separately confirmed `discard-generation` path is
available only after configuration is disabled and the generation is in review. Its value-free dry
run binds the full opaque inventory; the confirmed action requires a `change` or `stop` decision,
emits no aggregate, and makes Keep unavailable. Manual recursive deletion is not a supported
recovery path.

Suspension and resume use durable transition state. A crash during either operation keeps every
admission path frozen until recovery completes. The next suspension, incident, or resume operation
completes an interrupted suspension, and the inventory reports the pending transition meanwhile.
Generation-wide operations exclude packet writers;
independent packet timers may still run in parallel when no exclusive lifecycle operation owns the
generation. Stale-lock and temporary-file recovery validates the generation, operation, lock nonce,
owner liveness, file identity, and digest before removing anything. Purge and discard use
digest-bound tombstones, rescan retries, and reject unknown or mismatched tombstone names.

Baseline initialization follows the same fail-closed rule. Ownership and initial state are built in
staging and become current only when complete. Retrying `begin-baseline` removes validated partial
initialization state or completes a staged generation; if a complete baseline was published before
its stale initialization lock could be released, the retry returns that same baseline instead of
creating another one. A live or unproved lock still blocks the retry. A final pilot directory that
lacks the exact ownership record is treated as foreign and is never adopted automatically.

While a record is open, its reservation also holds four transient fields: a reservation-salted hash of
the host name, process id and process start time that identifies the owning session, the random
salt itself, the reservation time, and the overlap flag. The salt also carries a short hash of the
salt's random part with the owner's host identity (host name, kernel boot id and process-namespace
id), and short salted hashes of up to two parent processes of the owner (process id and start
time), which let a later cleanup on the same host and in the same process namespace prove that a
session is gone: only when the owner and every recorded parent are gone. A recorded parent that
still runs, such as the session above a wrapper like `timeout` or the terminal a crashed session ran
in, keeps the owner's liveness unknown, never dead; only the owner itself counts as alive. The
run's workflow still calls the helper directly from its own shell. That proof needs Linux `/proc`; elsewhere, or for a record from another host, a
container with its own process namespace, or an earlier boot, liveness stays unknown and only the
24-hour stale confirmation applies. The fields exist only until the record is finalized,
reconciled or abandoned; every terminal record drops them, so nothing in a finished record
identifies a session or a host. The salt is per reservation, so the hashes are not comparable
across records. They are not secret from someone who can read an open reservation, though: the
salt sits beside the hashes, so such a reader can test a guessed host name, process id or host
identity against them. That exposure ends with the terminal write.

Packet timing is capability-bound and may cross processes. The helper accepts a duration only when
monotonic time, wall time, system uptime, and a packet-salted host proof remain continuous. A reboot,
clock discontinuity, or host mismatch makes duration unavailable. Authenticated finalization or
reconciliation removes the raw timing receipt; a residual receipt blocks aggregation as incomplete
evidence.

## Failure behavior

The subsystem fails toward Quality. A missing baseline, protocol drift, invalid configuration,
suspension, incomplete evidence, a live or unknown lock, capacity exhaustion, or an unsafe runtime
path prevents new Fast admission. A measurement or observation failure never discards successful
product changes and never changes the current merge result. Only a genuine fault partway through
recording (finalizing a workflow record, or a gate observation, including damaged evidence it
meets), capacity exhaustion, or a recorded incident suspends the pilot; an invalid request, a lock
held by another run, an unsafe location or version, or a missing generation or record does not.
Measurement and observation failures expose only the stable `pilotControlOutcome`,
`controlStatePersisted`, and value-free `alert` metadata. A caller reports durable suspension or
incomplete evidence only when those fields explicitly confirm it; otherwise it states that
cross-run control could not be proven without echoing the rejected value.

After an update that changes the model that Quality runs use (protocol `1.2.0`, which lowers the
Claude effort of the strongest tier from `xhigh` to `high` and moves its Codex model to
`gpt-6.1-sol`), or the pilot parameters (protocol `1.3.0`: shorter baseline, new record fields), a
pilot generation recorded before it is not continued. It is suspended once with the reason
`quality-mapping-changed` (`1.1.0`) or `protocol-parameters-changed` (`1.2.0`), stays out of every
later run, and cannot be resumed; setup reports it and offers no action. Its only exit is the
helper's `begin-review`, then `discard-generation` with the pilot disabled, which no workflow offers
yet: run both through `scripts/pilot-measurement.mjs` directly, then start a new baseline from
setup. See the [developer protocol guide](../developer-guide/model-tiering-pilot-protocol.md#local-lifecycle-and-operation-boundary)
for the exact behavior.

## See also

- [Configuration](configuration.md#block-executionprofiles) – project admission versus per-run
  trace consent
- [Deliver changes](tools-deliver.md#anonymous-pilot-period-observation) – what `merge-gate`
  observes
- [Developer protocol guide](../developer-guide/model-tiering-pilot-protocol.md) – shipped
  registry, algorithms, and operational contract
- [Risk-aware pilot decision](../adr/risk-aware-model-tiering-pilot-policy.md) – durable policy
  rationale
