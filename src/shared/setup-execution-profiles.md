## Guided field-pilot block

This fragment is loaded only when Guided Step 5 opens advanced block 10 (`executionProfiles`). It
owns the Guided opt-in for `executionProfiles.fast.enabled` and the two confirmed generation
actions `begin-baseline` and `resume`. The loaded configuration contract stays the
reader and encoding of the key, and the shipped pilot helper stays the sole owner of generation
state. Nothing here selects an execution profile, writes a workflow record, or adds a setup
invocation: Profile, Express, and `{{SKILL:setup}} hidden` never load it.

### The opt-in

Explain first. `executionProfiles.fast.enabled` admits this project to the Quality/Fast field pilot
of `{{SKILL:build}}`. Literal `true` permits the pilot lifecycle, but starts no baseline, activates
no generation, proves no native capability, and never selects Fast by itself; while a baseline or
active generation exists, it also lets `{{SKILL:merge-gate}}` add anonymous period observations.
Missing or `false` is disabled; a malformed, ambiguous, or unreadable value is invalid; both run
every workflow as Quality. The key is a strict Boolean. Quality and Fast are provider-neutral
intents whose native mapping ships with the build, so no model or provider name is ever configured.
This installation is the `{{BUILD_TARGET}}` build. A `portable` build never records or uses Fast,
whatever the key says; there the key only prepares native Claude Code or Codex installations of the
same project, and the explanation says so.

Show the recorded value as the configuration contract classifies it: `enabled`, `disabled`, or
`invalid`. Preview an invalid value as `invalid – runs as Quality` and never repair it silently.
Pre-select `Keep`.

```ask
when: the user chose the advanced settings and block 10 is being asked
header: Fast pilot
question: Should this project take part in the Quality/Fast field pilot of build?
options:
  - label: Keep
    description: Leave executionProfiles.fast.enabled exactly as recorded, including a missing row or an invalid value
  - label: Enable
    description: executionProfiles.fast.enabled = true — admits the pilot lifecycle; no baseline starts and nothing activates
  - label: Disable
    description: executionProfiles.fast.enabled = false — every workflow runs Quality; stored pilot evidence stays untouched
```

- `Enable` writes the literal `true`, `Disable` the literal `false`, and `Keep` writes nothing.
  Accept no other value, no free text, and no model or provider name; ask again on anything else.
- The change goes through the Step 6 before/after list and confirmation like every other key. In
  hidden mode it is written to the local `<RUNTIME_STATE_ROOT>/.effective-flow/project-setup.md`
  like every other key and never to a tracked file.
- Whatever the answer, every stored generation, its suspension, and its evidence are preserved:
  disabling or keeping an invalid value needs no migration, deletes nothing, and starts no
  generation action.
- Profile and Express never ask this block and never add, change, or repair the row: an existing
  value, valid or invalid, is carried over byte-for-byte, exactly as Guided does when the user
  declines the advanced settings.

### Generation actions

Offer these actions only in this Guided run, after Step 6 has finished without stopping and before
Step 7. A declined Step 6 confirmation or a stopped run offers none. No action writes, rewrites, or
removes `executionProfiles.fast.enabled`, and none changes the configuration. A `portable` build
offers none and calls no pilot operation: report that generation actions need a native Claude Code
or Codex installation.

Invoke `node <skill-root>/scripts/pilot-measurement.mjs <operation>` with the operation as the sole
positional argument and exactly one JSON object with exactly the listed keys on standard input.
`runtimeStateRoot` is the verified `RUNTIME_STATE_ROOT` and `repositoryIdentity` the canonical
absolute physical Git common directory. Accept only the single JSON envelope on standard output
(`ok`, `operation`, and either `protocolDigest` plus `result` or `error`); never scrape standard
error or interpolate prose into a payload. Report every failure value-free: the operation and its
stable error code, never a payload value or rejected input. A sent action whose response failed,
was lost, or was malformed may still have completed its write, so the earlier proven state no
longer holds; nothing is claimed that the helper did not return.

1. Re-read `executionProfiles.fast.enabled` freshly through the configuration contract, then read
   the generation with `inventory` and exactly `runtimeStateRoot` and `repositoryIdentity`.
   `generationStatus=absent` is `none`; a present generation yields `generationId`,
   `generationState`, `inventoryDigest`, `suspensionDigest`, `incompleteCounts`, and
   `orphanTemporaries`. An ambiguous or failed inventory offers no action.
2. Offer at most the one action the proven state allows, and only with `configState=enabled`:

   | Proven generation state                                  | Offered action   |
   | -------------------------------------------------------- | ---------------- |
   | `none`                                                   | `begin-baseline` |
   | `suspended` with healthy evidence                        | `resume`         |
   | `baseline`, `active`, `review`, or unhealthy `suspended` | none             |

   Evidence is healthy only when every `incompleteCounts` value is zero and no orphan temporary is
   listed. Setup never activates: a `baseline` generation is activated automatically by the next
   measured native `{{SKILL:build}}` run once the preregistered window and sample are met, so
   report it as collecting its baseline. `review` is terminal under every configuration state,
   including disabled or invalid: report that the generation is under review and can never resume.
   An unhealthy `suspended` generation is reported as not resumable until its incomplete evidence
   is reconciled. A disabled or invalid configuration offers no action and reports the stored state
   unchanged.

3. Each action has its own `ask` below. Send `confirmation: true` only after the user's explicit
   confirmation of that action in this same run. A refused, skipped, unanswered, or non-interactive
   ask sends nothing.

**`begin-baseline`.** Call `protocol` with `{}` and take `protocolVersion` from `result.version`
and `protocolDigest` from the envelope, which must equal `result.digest`; on a mismatch send
nothing. Before asking, display the exact digest and version and disclose: a Quality-only baseline
starts; later native `build` runs store minimal local records below
`<RUNTIME_STATE_ROOT>/.effective-flow/model-tiering-pilot/`, holding bounded structured
measurements and no prompts, diffs, source, paths, commands or output, environment values, model
aliases, URLs, or personal, repository, branch, task, PR, or session identifiers; nothing leaves
this machine; a detailed trace needs separate current-run consent; no second confirmation follows,
because a later native `{{SKILL:build}}` run activates the generation automatically once the
protocol's `aggregation.baselineWindowMinimumDays` and `aggregation.baselineEligiblePacketMinimum`,
shown with their values, are met.

```ask
when: block 10 proved configState=enabled and generationState=none and showed the digest and disclosure
header: Baseline
question: Start the Quality-only pilot baseline under the protocol digest shown?
options:
  - label: Start
    description: Start the baseline; build keeps running Quality and records the local minimal data disclosed above
  - label: Not now
    description: Start nothing; the opt-in stays as written
```

On `Start`, send exactly `runtimeStateRoot`, `repositoryIdentity`, `configState: "enabled"`,
`fastEnabled: true`, `protocolVersion`, `protocolDigest`, and `confirmation: true`. After any
failure, including a lost or malformed response, re-read the guarded, read-only `inventory` with
exactly `runtimeStateRoot` and `repositoryIdentity` before reporting the outcome, and report the
generation state it proves; never report the state as unchanged without that re-read, and an
ambiguous or failed re-read reports the state as unknown. Never re-send `begin-baseline` in the
same run.

**`resume`.** Offer it only while the guarded `inventory` proves `generationState=suspended` with
healthy evidence and `configState=enabled`. Show the generation state and the exact
`inventoryDigest` and `suspensionDigest` it is bound to. Show no cause summary, because the
inventory exposes none, and offer no target: the helper restores only its stored `resumeTo`.

```ask
when: block 10 proved configState=enabled and a suspended generation with healthy evidence and showed both digests
header: Resume
question: Clear the suspension bound to the digests shown and restore the stored prior state?
options:
  - label: Resume
    description: Clear this suspension; the helper restores the state it stored when suspending
  - label: Not now
    description: Keep the generation suspended; later runs stay on Quality
```

On `Resume`, send exactly `runtimeStateRoot`, `repositoryIdentity`, `generationId`,
`configState: "enabled"`, `expectedSuspensionDigest`, `expectedInventoryDigest`, and
`confirmation: true`. After any failure, read a fresh `inventory` before reporting any state, and
never retry with new digests without showing them and asking again.

Step 8 reports the classified opt-in value and whether it changed, the proven generation state,
and each offered action with its outcome (confirmed and done, declined, or the failed operation's
error code).
