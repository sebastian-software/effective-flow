# Qualified cohort host driver

`evals/host-driver/run-cohorts.py` runs prepared behavioural-eval cohorts through the repository
host runner. It is a model-hosting driver, not a suite evaluator: the suite operator prepares
tasks and owns qualification and sealing; the driver starts each already-qualified slot, records
local process evidence, and stops the cohort on the first unsafe or invalid result.

The current implementation supports the future external qualified-round protocol. It does not
ship the full host qualification, and it does not depend on an unmerged verifier. A successful
fixture run is local process evidence only.

## Inputs and layout

The driver reads one round config and three prepared manifests from a new output root. The
portable config has these keys:

```json
{
  "frozenRoot": "/absolute/path/to/clean/frozen-source",
  "expectedFrozenHead": "40-lowercase-hex-commit-id",
  "frozenBranch": "release-branch",
  "outputRoot": "/absolute/path/to/new-round-output",
  "qualificationDigest": "qualification-identity",
  "profiles": {
    "merge-gate": {"model": "MODEL", "reasoningEffort": "EFFORT"},
    "iterate": {"model": "MODEL", "reasoningEffort": "EFFORT"},
    "next-steps": {"model": "MODEL", "reasoningEffort": "EFFORT"}
  }
}
```

`frozenBranch` is optional. The frozen source must be a clean Git worktree at
`expectedFrozenHead` with its own canonical `.git` directory; linked sources are rejected. Before
each round and slot, the driver resolves the frozen worktree's Git common directory and rejects
output, profile, and task roots that overlap the source or that common directory. The driver
source, output root, and task attempt roots must remain disjoint. The caller must create a new
output root before copying the config and receiving prepared manifests; the driver creates only
the `outputRoot/cohorts` directory and never reuses an old output root. Prepared manifests belong
under it as `prepared-merge-gate.json`,
`prepared-iterate.json`, and `prepared-next-steps.json`, with exactly 40, 35, and 75 tasks. Each
task must carry the approved suite profile, a fresh attempt root, a rendered prompt and matching
metadata digest, and the same frozen source identity.

The profiles root is persistent runtime state outside the repository and output root. Use one
dedicated root across rounds. It contains fresh per-slot profiles and retained evidence so a
later recovery can distinguish a live group from a stale or unknown profile. Do not place it in
the frozen source, repository Git common directory, or output root.

## CLI

Prepare and run a round on POSIX with explicit external inputs. First create a new output root,
copy the round config there with its new `outputRoot`, and let the already reviewed and pinned
operator prepare each suite:

```sh
mkdir /path/to/new-round-output
CONFIG=/path/to/new-round-output/config.json
OPERATOR=/path/to/reviewed/operator.mjs
node "$OPERATOR" "$CONFIG" prepare merge-gate
node "$OPERATOR" "$CONFIG" prepare iterate
node "$OPERATOR" "$CONFIG" prepare next-steps
```

The operator must be the separately reviewed input named by the trusted pin below. Do not create
a new digest and treat an unreviewed operator as qualified. Then run the prepared round:

```sh
python3 evals/host-driver/run-cohorts.py \
  /path/to/new-round/config.json \
  --profiles-root /path/to/dedicated/host-profiles \
  --operator /path/to/reviewed/operator.mjs \
  --operator-sha256 sha256:PIN_FROM_REVIEWED_RELEASE_REFERENCE \
  --binary /path/to/pinned-host-binary \
  --auth-file /path/to/auth-reference \
  --timeout-seconds 1800
```

The operator pin is a trusted input supplied by the separately reviewed release or reference.
The driver requires the exact lowercase `sha256:<64 hex digits>` pin and checks it before every
slot; do not generate a new pin for an arbitrary operator and treat that as qualification.
`--timeout-seconds` is bounded to `(0, 1800]` and defaults to `1800`.

Recovery is a separate operation and accepts only the profiles root:

```sh
python3 evals/host-driver/run-cohorts.py \
  --profiles-root /path/to/dedicated/host-profiles \
  --recover
```

The auth path is an explicit reference. The driver checks that the file exists and passes the
path to the worker; it never reads, copies, prints, or logs secret contents. The worker creates
the only permitted auth link at `CODEX_HOME/auth.json` inside each fresh profile.

## Launch protocol

The driver validates the frozen source, every prepared task, all pinned inputs, and the prompt
digest before launch. It then invokes the native [`host-run`](../host-run.md) runner for each slot,
with six concurrent slots. The worker performs the existing operator protocol in this order:

1. `qualify` the exact rendered launch and compare the returned qualification digest and profile.
2. Launch the prescribed host command with the task's model, sandbox, project root, and temporary
   directory settings.
3. Record the JSONL stream, last message, process start and termination evidence, and the runner
   cleanup receipt.
4. Require a successful completed turn with no malformed rows, watchdog stop, live group, or
   incomplete cache cleanup.
5. Ask the same operator to `seal` the completed slot. A seal refusal, validity problem, or finding
   stops future launches. Native errors are recorded during host completion; the driver can still
   seal that completed slot, then blocks future launches after sealing when native errors exist.

A qualification refusal writes `qualification-refused-before-launch` with
`actualModelStarted: false`; a slot blocked after an earlier failure writes
`not-launched-after-blocker`. Signals stop new launches and request bounded wrapper shutdown.
The worker publishes the detached supervisor process-group identity as `childPgid`; the wrapper
PID is not that identity.

The round summary is written to `cohorts/summary.json`; the event journal is
`cohorts/host-events.jsonl`. Per-slot evidence includes `task.json`, `worker-job.json`,
`launch.json`, qualification output, `launch-audit.json`, `process-start.json`,
`worker-result.json`, `process-termination.json`, `host-outcome.json`, and seal output where the
slot reached sealing. These files are evidence for the operator's protocol, not a replacement for
the suite's own evaluator.

## Fixture boundary

The hermetic tests import `Driver(..., fixture_tools=True)` and use local Node processes. Fixture
evidence is marked `fixtureOnly: true` and `qualifiedHost: false`. It validates process groups,
watchdogs, cleanup, digest checks, blockers, and source boundaries; it does not qualify a real
host, start a real model, or establish a seal. `fixture_tools` is an import-only constructor
option and is not a CLI switch.

Run the local contract tests from the repository root:

```sh
python3 -B -m unittest discover -s evals/host-driver/tests -p 'test_*.py'
pnpm test
```

The JavaScript test wrapper skips these POSIX process tests on Windows. No model, network call, or
credential read is part of this documentation or test check.
