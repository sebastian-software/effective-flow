# Qualified cohort host driver

`evals/host-driver/run-cohorts.py` runs prepared behavioural-eval cohorts through the repository
host runner. It is a model-hosting driver, not a suite evaluator: the suite operator prepares
tasks and owns qualification and sealing; the driver starts each already-qualified slot, records
local process evidence, and stops the cohort on the first unsafe or invalid result.

The fixed local round contains 155 slots: 9 merge-gate, 7 iterate, and 15 next-steps scenarios,
each with five independent runs (45/35/75). It does not establish native-executor acceptance.
A successful fixture run is local process evidence only.

## Pinned toolchain and fresh qualification

The [host verifier](../_scaffold/host-qualification.mjs) pins Codex CLI `0.163.0` from the official
[`rust-v0.163.0` release](https://github.com/openai/codex/releases/tag/rust-v0.163.0), including
both archives and their executable members:

| Release asset                                      | Executable member                           | Verifier SHA-256 keys           |
| -------------------------------------------------- | ------------------------------------------- | ------------------------------- |
| `codex-aarch64-apple-darwin.tar.gz`                | `codex-aarch64-apple-darwin`                | `binaryArchive`, `binary`       |
| `codex-code-mode-host-aarch64-apple-darwin.tar.gz` | `codex-code-mode-host-aarch64-apple-darwin` | `companionArchive`, `companion` |

The four source-owned hashes bind static release provenance only. They do not supply a reviewed
operator pin, current model evidence, or a qualified native host. Before every launch, follow the
[coordinator contract](../merge-gate/README.md#2-launch-fresh-sessions-at-the-host-boundary):
all four actual probe modes (normal merge-gate, negative nesting, iterate, and next-steps) must
remain younger than 24 hours, with the exact argv, environment, source/root isolation, permissions,
write denials, and operator integrity preserved. Fixtures and archive hashes cannot replace them.
Actual `0.163.0` native command-display compatibility remains unproven until fresh runtime evidence
satisfies the retained strict matcher; an unknown display is refused.

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
`prepared-iterate.json`, and `prepared-next-steps.json`, with exactly 45, 35, and 75 tasks. Each
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


## Private D2 accounting candidate

Before the model heartbeat or Popen, the bridge exclusively creates an immutable
`launch-consumption.json` under the existing launch gate. Its exact job digest comes
from the coordinator's authenticated `--digest` argument. Task, job, launch and
audit prerequisites, the receipt file, and every canonical directory ancestor
through `/` must successfully synchronize before admission. Any write, sync,
identity, or close failure refuses launch; a created receipt is never removed,
replaced, refunded, or reused. This is an OS fsync boundary, not physical-media or
sudden-power-loss qualification.

The coordinator reports `chargedRoots`, `reservedRoots`,
`reservationUnknownRoots`, and `accountingComplete` separately from observed
`started` and proven zero-charge `notLaunched`. A missing start marker after
possible admission means `reservation-unknown`, charge one, and
`actualModelStarted: null`. Readable receipt bytes alone cannot prove the
file/directory sync and close boundary completed. Only a valid receipt-bound
start observation permits the `reserved` projection; this conservatively keeps
successfully persisted but unobserved attempts unknown. Arbitrary worker output
cannot turn it into false or refund consumption. Unknown accounting or closure
blocks acceptance. Existing completion, cleanup, watchdog and sealing checks
remain mandatory. This local candidate supplies no stages, cross-root budget,
resume, retry, grant, provider execution, or B approval.

## Private first-stage adapter

`eval_first_stage.py` is a separate fixed first-stage entry. Its default is read-only
static validation: it authenticates an externally pinned full155 corpus certificate
and a separately externally pinned grant, then reports only the selected five
`iterate/duplicated-control-line-aborts` slots in order. It creates no Driver,
process, profile, FIFO or output. Static source and qualification references do
not attest a current clean Git revision, launch qualification or the original
24-hour TTL; those remain execute-time checks of the original coordinator and
operator. No real corpus, grant or execution command is supplied here.

Corpus v1 (`effective-flow-host-first-stage-corpus`) has exactly `schemaVersion`,
`kind`, `source`, `namespace`, `config`, `operator`, `toolchain`, `qualification`,
`driverFiles`, and `suites`. The source is `{root, head, tree}`; the namespace is
`{outputRoot, outputIdentity, profilesRoot, profilesIdentity, cohortsRoot}`, with
owned directory identities `{dev, ino}` and the original `outputRoot/cohorts`.
Every file reference is exactly `{path, sha256}`. The toolchain is `{node, python,
artifacts}`, with the original six config artifact references; qualification is
`{bundle, policy}`. The nine driver files include this adapter. The three suites
are ordered `merge-gate`, `iterate`, `next-steps`; each contains `name`, `registry`,
`suiteConfig`, `prepared`, `roundManifest`, `profile`, `tasks`, `immutableInputs`.
Every task record is `{task, prompt, runMetadata, state, buildIdentity}` and retains
the complete original task, original identity maps and all immutable input bytes.
Registry names come from the pinned names-only SCENARIOS source, never JS import
or evaluation. All registry members × slots 1–5 must match, including the original
pending state of the unselected 150. Corpus bytes are limited to 4 MiB, grants to
16 KiB and corpus reference occurrences to 16,384. Worker jobs remain at 1 MiB.

The closed grant v1 (`effective-flow-host-first-stage-grant`) binds `corpus`,
`config`, `namespace`, fixed `stageId`, fixed `orderedTasks`,
`maximumChargedRoots: 5`, `concurrency: 1`, `allowRetry: false`, `allowResume: false`,
`allowContinuation: false`, and `fullCorpusAcceptance: false`, plus schema/kind.
It authorizes only `iterate-duplicated-control-line-aborts-slots-1-5-v1` and its
five canonical original artifact paths. A relocated identical grant before the
first admission remains bound to that same namespace; it cannot create a second
cohort admission or budget. Changed corpus paths, roots, inode identities, config,
stage ID, ordering or membership refuse. The original exclusive cohort creation
is never repaired, removed or reused, including after failure or interruption.

The optional coordinator `first_stage` context is absent for legacy callers;
present-null or malformed data refuses. Its authenticated worker `firstStage`
object contains only `schemaVersion`, `corpus`, `grant`, `ordinal`. The worker
checks actual pinned helper bytes before loading it and reauthenticates context
before qualification, under the final gate before D2 reservation, and after its
fsync before heartbeat/Popen. No receipt refund or retry follows a refusal.
Original D1 shutdown and D2 durability/accounting remain in force.

Execution submits one future at a time to a single-worker executor. Main-thread
interrupt polling preserves D1 blocking. Any failed seal, finding, native error,
uncertain accounting or incomplete cleanup stops further admission. Earlier
selected slots must retain their genuine original seal and D2 closure; future
selected and unselected slots must remain pending. Original manifest, state,
build identity, prompt and metadata stay immutable throughout legitimate sealing.
The only result is `first-stage-summary.json`: five reconciled outcomes,
`fullCorpusAccepted: false`, `remainingTasks: 150`,
`continuationAuthorized: false`. It never executes the remaining 150.

This is an approved-entry/namespace limit, not an OS-wide or malicious-same-UID
limit, and supplies no hard descendant/request/token/cost cap. Local fixture
results are not native qualification. The exact historical automatic-review
rejection wording remains unknown; a later real execution needs a separately
reviewed concrete request and execution authority.
