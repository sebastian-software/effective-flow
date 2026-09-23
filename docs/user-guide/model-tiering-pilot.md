# Model-tiering pilot data and privacy

Effective Flow includes a local measurement subsystem for a future opt-in Quality/Fast field
pilot. The subsystem can create a preregistered Quality-only baseline, retain pilot evidence,
evaluate the protocol gates, and remove one reviewed generation safely. It does **not** currently
activate the pilot: `build` and `refactor` do not select Fast, and `/effective-flow setup` exposes
neither baseline start nor activation.

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
cohort, selected profile, eligibility and first gate reason, duration availability, fallback,
validation and review summaries, completion status, and correction counts. It excludes prompts,
diffs, source, paths, command text or output, environment values, model aliases, URLs, and personal,
repository, branch, task, PR, or session identifiers. Opaque internal record identifiers carry no
such meaning.

While a baseline or active generation exists, non-observer `merge-gate` runs may add a separate
anonymous period observation. It records only the mode and terminal outcome, harness family,
required-check summary, and counts of actual CI repair, configured-reviewer implementation, and
conflict-resolution work. It contains no PR, repository, branch, workflow-record, check-name,
comment, finding, or path identifier and cannot be linked to a `build` or `refactor` run. An
observer-only re-entry records nothing.

Observation setup sends the verified runtime root and repository identity together with the
generation, configuration and generation states, `merge|report` mode, and native harness family.
The returned observation identifier and raw capability remain transient. Finalization authenticates
that capability and records one closed outcome, the three counters, and either final required-check
evidence or explicit unavailable values. Every normal or early exit after reservation finalizes
exactly once; an early report-mode stop is `reported-blocked` with unavailable check evidence.

## Activation and detailed consent are different decisions

`executionProfiles.fast.enabled: true` is project-level admission to the pilot lifecycle. It is not
activation, does not start measurement, and does not authorize a detailed trace. A future guided
setup action must separately display the exact shipped protocol digest, disclose local minimal-data
collection, and obtain explicit confirmation before starting a Quality-only baseline. Activation
then requires the preregistered baseline conditions to pass.

A detailed trace has a separate, current-run consent boundary. The workflow may attest
`detailOptIn: true` only after an explicit request in that run. Consent is not stored as text or
identity and does not carry into another run. An allowed trace may contain bounded requirement
statuses, normalized repository-relative paths, stable check outcomes, and closed finding or
escalation fields. It still rejects raw handoffs, prose findings, commands, environment, output,
source excerpts, absolute paths, URLs, and unknown fields.

## Review, retention, and deletion

Configuration and generation state remain independent. Disabling the project key stops new
measurement and Fast selection without deleting evidence or clearing a suspension. Suspension and
incomplete records block later Fast until the owned evidence is reconciled. Only a still-suspended
generation can resume; a generation in `review` is terminal and cannot return to admission.

Review freezes new reservations but lets already captured work finish or reconcile. Aggregation
then produces two local views:

- a private, pre-suppression decision view used by the read-only evaluation; and
- a publication candidate that suppresses every small cell required by the shipped protocol.

Neither view is published automatically. Publishing even the suppressed aggregate requires a
separate review and approval. Detailed traces never feed the metrics and remain private inventory
bound into the review digest.

The publication candidate suppresses each undersized cell rather than exposing a larger object
merely because one sibling metric has enough evidence. Neither aggregate view carries a generation
identifier; the local review wrapper owns that binding. Evaluation enforces the required cohort,
metric-stratum, ordinal-half, and period-observation sizes. Gate observations compare like
`merge|report` and native harness groups, while cost compares the baseline's would-be-Fast Quality
work with the pilot's attempted-Fast work only when kind and unit are identical. Insufficient or
incompatible evidence is unavailable.

Normal purge requires a reviewed generation, a dry-run inventory, the exact generation and review
digest, explicit confirmation, and no live or unknown writer. It atomically moves only that
generation to a digest-bound tombstone and removes only that tombstone. If malformed or unknown
owned evidence prevents normal aggregation, the separately confirmed `discard-generation` path is
available only after configuration is disabled and the generation is in review. Its value-free dry
run binds the full opaque inventory; the confirmed action requires a `change` or `stop` decision,
emits no aggregate, and makes Keep unavailable. Manual recursive deletion is not a supported
recovery path.

Suspension and resume use durable transition state. A crash during either operation keeps every
admission path frozen until recovery completes. Generation-wide operations exclude packet writers;
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

Packet timing is capability-bound and may cross processes. The helper accepts a duration only when
monotonic time, wall time, system uptime, and a packet-salted host proof remain continuous. A reboot,
clock discontinuity, or host mismatch makes duration unavailable. Authenticated finalization or
reconciliation removes the raw timing receipt; a residual receipt blocks aggregation as incomplete
evidence.

## Failure behavior

The subsystem fails toward Quality. A missing baseline, protocol drift, invalid configuration,
suspension, incomplete evidence, a live or unknown lock, capacity exhaustion, or an unsafe runtime
path prevents new Fast admission. A measurement or observation failure never discards successful
product changes and never changes the current merge result. Observation failures expose only the
stable `pilotControlOutcome`, `controlStatePersisted`, and value-free `alert` metadata. A caller
reports durable suspension or incomplete evidence only when those fields explicitly confirm it;
otherwise it states that cross-run control could not be proven without echoing the rejected value.

## See also

- [Configuration](configuration.md#block-executionprofiles) – project admission versus per-run
  trace consent
- [Deliver changes](tools-deliver.md#anonymous-pilot-period-observation) – what `merge-gate`
  observes
- [Developer protocol guide](../developer-guide/model-tiering-pilot-protocol.md) – shipped
  registry, algorithms, and operational contract
- [Risk-aware pilot decision](../adr/risk-aware-model-tiering-pilot-policy.md) – durable policy
  rationale
