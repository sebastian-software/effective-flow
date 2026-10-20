# Planned-build context evidence

This manual suite measures the actual Feature build workflow. There are currently **no valid
behavioural recordings, paired workloads or native compatibility recordings**. Context reduction,
quality preservation and release readiness remain unproven. Unit tests use synthetic fixtures;
CI never launches a model. Report mode reports missing evidence; strict mode fails it.

## Required populations

| Population | Required observations |
| --- | --- |
| `approved-single-module` | Five independent complete deliveries; one actual deep runner each |
| `review-correction` | Five independent two-module deliveries; seeded duplicate-label blocker, actual independent correction and revalidation |
| `question-trust-and-publication` | Five recordings, each with separate consent, refusal, injected-answer and stale-answer launches; local forge observes exactly one consented publication |
| `unsupported-nesting` | Five actual pre-mutation nesting refusals, each followed by complete inline delivery with all mandatory specialists and gates |
| `checkpoint-drift-and-cleanup` | Five recordings, each with separate HEAD, tracked, untracked and interruption launches plus successful terminal/continuation verification after real owned-worktree removal |
| `control-boundary-abuse` | Five recordings, each with separate oversized-question, oversized-result, missing-evidence and third-party-instruction launches |
| Portable Quality matrix | Twenty baseline/candidate pairs: Codex and Claude × simple and review-correction × five fixed slots |
| Native compatibility | One separate complete lane for each native target; neither portable evidence nor a capability probe substitutes for it |

Each variant has its own actual fresh root and descendants. A transcript or helper rejection cannot
be counted twice under different aliases, branches, slots or conditions. Every supported failed or
invalid attempt and unsupported-depth attempt remains reported. A later success cannot replace a
failed workload slot. The four matrix cells each require all five valid pairs.

The fixture contains real source, immutable acceptance tests and an approved plan. Its origin is an
attempt-local bare Git repository. The only skill overlay is the instrument-hashed local forge stub;
no live forge, merge, network mutation or installed user skill is authorized. Host stimuli alter
only disposable fixture state. They never fabricate tool outputs.

## Trust and immutable identities

`profiles.json` pins expectations, not an activation state. Actual host capability is proved by each
closed run. Missing Claude evidence does not prevent Codex recording and does not require a later
source/instrument edit after a quota reset. The complete strict gate stays unproven until every
population passes. Any source or instrument change invalidates its affected recordings; finish
independent review and freeze the candidate before recording.

The approved baseline is exactly `de23f9b2ab7a93b747aa22a4d985824899d2c916`. It is built from its own
clean Git checkout. A directory of copied Markdown, a revision prefix, a path mention or a fabricated
build declaration is insufficient. `HostCoordinator.build` observes Git identity and source file
membership, executes the real dependency-free all-target build and records complete built-file
membership. The candidate uses the scaffold's authoritative identity normalization. Baseline and
candidate receipts bind the same instrument. `identity.mjs` is a read-only diagnostic and is never
accepted instead of a coordinator build receipt.

The coordinator is an operator-owned local process, with an explicit trusted-host boundary. Its
hashes bind content; **hashes are not signatures or independent proof of a dishonest recording
host**. There is no signing key, account setup, service or capability registry. No command adopts
historical transcripts or creates retroactive launch receipts. The coordinator itself captures
prelaunch Git HEAD/index/tracked/untracked contents, prompt bytes, normalized actual CLI arguments,
known non-auth settings files, expected profile and target/build identity. Before launching, it
rechecks the fixture, settings and target. It records actual process times and matches actual fresh
root metadata, first user instruction bytes and timestamps to that process and exclusively prepared
transcript destination. Old genuine transcripts fail these associations.

The coordinator journal must use a physical path outside every model-writable fixture. The launched
CLI and all descendants inherit macOS `sandbox-exec` denial of journal writes. The exact launch
wrapper tests an actual write to a physical canary inside that same process sandbox before starting
the CLI; the child inherits the tested policy. Path secrecy and a standalone abstract path test are
not protection. Read access is harmless because the journal has no key or live workflow capability.
A missing/failed guard, unsupported OS, missing process observation or missing metric fails closed.
Do not run unprotected model processes alongside the coordinator or edit the journal by hand.

Journal and raw transcript directories remain private, with normal host access controls. Public
records retain only bounded observations, stable hashes and redacted aliases. Raw session IDs,
user text, paths, credentials, pilot IDs and live capabilities never belong in `results/`.

## Closed host sequence

The JSONL operator CLI is:

```sh
node evals/build-context/coordinator.mjs /private/tmp/flow-evidence-host-journal new
```

It reads one `{ "operation": "...", "input": {...} }` object per line and returns one result.
`launch` executes a real CLI and blocks until that turn exits. Keep this operator channel separate
from model stdin. Later invocations use the **same** journal with `resume`, never `new`:

```sh
node evals/build-context/coordinator.mjs /private/tmp/flow-evidence-host-journal resume
```

The journal contains pending launches, build receipts, sequence and already-used actual session
identities. Preserve it across the Claude reset; no ephemeral key is lost and no instrument rotation
is needed. A resumed coordinator does not create or resume a model until explicitly requested.

First submit two real builds (output roots must not exist). Use neutral opaque paths for the
candidate checkout/build, skill copies and fixtures so the reviewer cannot infer the condition:

```json
{"operation":"build","input":{"condition":"baseline","sourceRoot":"/private/tmp/flow-build-measurements/baseline-checkout","outputRoot":"/private/tmp/flow-evidence-build-01"}}
{"operation":"build","input":{"condition":"candidate","sourceRoot":"/ABSOLUTE/FROZEN/SOURCE/CHECKOUT","outputRoot":"/private/tmp/flow-evidence-build-02"}}
```

Preserve each returned build `seal`. The coordinator also writes `build-<hash>.json`. A new
coordinator cannot import or sign a caller-declared build. Both builds can be retained while a host
is unavailable. Existing authentication may use the normal private auth-file symlink arrangement;
never read/copy credential values into a manifest or output. No account or paid setup is required.

For behavioural scenarios, provision the shared scaffold first:

```sh
pnpm eval build-context prepare --scenario approved-single-module \
  --harness codex-cli --model gpt-6.1-sol --reasoning-effort high \
  --reported-version 0.163.0 --tool-policy 'isolated fixture; no network; explicit target; portable Quality'
pnpm eval build-context status --round ROUND
```

Use its actual project, skill-copy and prompt paths. For every required variant, prepare a separate
disposable fixture copy before the coordinator prelaunch capture. The clone must retain the fixture
marker and identical committed inputs; its origin remains local. Do not use a real project as the
measurement fixture. Never reuse a previously started root for a new slot.

Create a private native command file. Example Codex command-file shape (all paths are physical):

```json
{
  "executable":"/opt/homebrew/bin/codex",
  "args":["exec","--ignore-user-config","--ignore-rules","--json","-s","workspace-write","-m","gpt-6.1-sol","-c","model_reasoning_effort=\"high\"","-C","/PRIVATE/NEUTRAL/PROJECT","-"],
  "home":"/PRIVATE/ISOLATED/HOME",
  "codexHome":"/PRIVATE/ISOLATED/CODEX_HOME",
  "profile":{"harness":"codex-cli","model":"gpt-6.1-sol","reasoningEffort":"high","reportedVersion":"0.163.0","toolPolicy":"isolated fixture; no network; explicit target; portable Quality"},
  "timeoutMs":1800000
}
```

Use an isolated native Claude command file with its real executable/args, `home`, `claudeHome` and
pinned Claude profile. The coordinator supports these two CLI basenames only. It rejects resume,
fork or continue flags on an initial launch and credentials in argument names. Known config files
are observed by digest; auth files are never read. Isolated homes must not contain installed user
instructions, skills or rules. Codex may bootstrap its bundled `skills/.system` inventory: only the
complete canonical 0.163.0 file membership pinned in `profiles.json` is accepted, before and after
each actual CLI process and on resume. An empty initial inventory and that exact bootstrap share
one expected settings digest; arbitrary `.system` contents, symlinks, extra user skills or changed
builtins fail. The harness-managed plugin cache is not copied into user skill paths or treated as
a source of workflow authority. Codex requires `--ignore-user-config` and `--ignore-rules`. Host-native
worker registration must come from the exact measured target, and is included in the native target
identity. Do not silently edit native model mappings when a CLI ignores an override.

Choose an absent or empty transcript directory **before** launch. Configure the native CLI to put
all actual root/child rollouts beneath it (for Codex, choose its isolated session destination within
CODEX_HOME). Settings/auth may live beside that exclusive session directory. Stdout alone omits
necessary child details on Codex 0.163.0. Submit:

```json
{"operation":"prepare","input":{"condition":"candidate","harness":"codex-cli","complexity":"simple","slot":1,"scenario":"approved-single-module","variant":"complete","target":"portable","buildSeal":"ACTUAL_BUILD_SEAL","fixtureRoot":"/PRIVATE/NEUTRAL/PROJECT","skillRoot":"/PRIVATE/NEUTRAL/SKILL","transcriptDir":"/PRIVATE/ISOLATED/CODEX_HOME/sessions","promptFile":"/PRIVATE/ACTUAL/PROMPT.txt","commandFile":"/PRIVATE/ACTUAL/command.json"}}
{"operation":"launch","input":{"launch":"RETURNED_LAUNCH_ID"}}
```

`prepare` records actual inputs and writes a host-controlled neutral reviewer assignment at
`<journal>/<launch>-review-assignment.txt`. The independent reviewer must receive/read that file in
its fresh assignment, read complete delivered source, README and unchanged acceptance tests and
return its actual JSON verdict. The host supplies identical criteria and seeded-blocker checks;
no zero counts are prefilled. A root/implementer verdict, inherited review context or mere
`blinded:true` declaration is rejected. Use the real workflow's independent reviewer, without an
extra unrelated observer pretending to be that role.

When an actual question returns BLOCKED-USER, provide a genuine user answer and continue the exact
root/runner handles. Use `resume` with the native CLI's actual same-root arguments and the trusted
user text; the coordinator does not invent a handle or spawn a replacement:

```json
{"operation":"resume","input":{"launch":"SAME_LAUNCH_ID","args":["exec","resume","ACTUAL_PRIVATE_ROOT_HANDLE","--json","-"],"prompt":"ACTUAL TRUSTED USER ANSWER"}}
```

The argument vector is host-specific; supply the full actual CLI resume vector, including required
settings. It is preserved privately. Resuming a coordinator journal is separate from this operation.

Then `complete` captures the actual tree. Every successful spawn needs one entry, including
formatting/validation specialists. Aliases are local, not caller-assigned role proof:

```json
{"operation":"complete","input":{"launch":"SAME_LAUNCH_ID","manifest":{"host":{"harness":"codex-cli","sessions":[{"alias":"parent","path":"/PRIVATE/SESSION/ROOT.jsonl","parent":null,"target":"portable"},{"alias":"runner","path":"/PRIVATE/SESSION/CHILD.jsonl","parent":"parent","target":"portable","spawnCallId":"ACTUAL_PARENT_CALL_ID"}]},"reviewTranscript":"/PRIVATE/SESSION/ACTUAL_REVIEWER.jsonl","verifyTerminalInput":{"runtimeStateRoot":"ACTUAL_FIXTURE_RUNTIME","repositoryIdentity":"ACTUAL_COMMON_GIT","runId":"ACTUAL_RUN","requestDigest":"ACTUAL_DIGEST","terminal":{"root":"ACTUAL_ROOT","path":"ACTUAL_TERMINAL_PATH","digest":"ACTUAL_DIGEST"}},"reworkRounds":0,"correctionRounds":0}}}
```

The example omits additional children for readability; capture rejects an incomplete tree. Counts
must describe actual turns. Roles derive from the actual child's canonical assignment/native
`agent_role` and loaded contract bytes. Encrypted parent messages are not replaced by arbitrary
`roleMarker` strings. Duplicate physical files, copied transcript bytes, real session IDs and spawn
edges are rejected. Requested and actual model/effort, completion and parent relationships are
observed separately. Role assignment alone never proves review/validation quality.

The coordinator runs the real candidate `verify-terminal`, and separately executes the unchanged
acceptance tests against actual delivered content. For committed delivery it exports the proven
final Git commit without changing the worktree registry, so cleanup or branch restoration does not
substitute an unrelated live checkout. Hidden/in-place deliveries use their actual helper-bound
content. New runtime operations (`authorize-execution`, `transition-execution`, `prepare-completion`,
`seal-delivery`, `handoff`, `record-return`) are ordinary observed operations; no Git-only final-plan
assumption is added to the helper contract.

## Baseline pairs and actual stimuli

The baseline run uses its separately built portable router and **its existing workflow only**. It
must never load the candidate build-run helper or inherit a candidate session. Paired user task
bytes must be identical and neutral: request the approved feature through the supplied router,
without prescribing the candidate's runner, terminal helper or phase implementation. Use one stable
neutral skill path (host swaps its target between sequential runs) and neutral fixture path, restored
to exactly the same Git/index/tracked/untracked basis before each condition. The coordinator compares
actual prompt/settings/fixture digests. Do not insert condition labels or per-run nonces into the
task. Odd slots launch baseline first; even slots launch candidate first; launches do not overlap.

For baseline `complete`, omit `verifyTerminalInput`; supply actual `finalCommit` and `phaseRefs`:

```json
{
  "finalCommit":"ACTUAL_DELIVERED_COMMIT",
  "phaseRefs":{
    "implementation":{"session":"ACTUAL_LEAF_ALIAS","callDigest":"ACTUAL_TOOL_CALL_HASH"},
    "documentation":{"session":"ACTUAL_LEAF_ALIAS","callDigest":"ACTUAL_TOOL_CALL_HASH"},
    "tests":{"session":"ACTUAL_LEAF_ALIAS","callDigest":"ACTUAL_TOOL_CALL_HASH"},
    "validation":{"session":"ACTUAL_VALIDATOR_ALIAS","callDigest":"ACTUAL_TOOL_CALL_HASH"},
    "final-validation":{"session":"ACTUAL_VALIDATOR_ALIAS","callDigest":"DIFFERENT_ACTUAL_TOOL_CALL_HASH"},
    "delivery":{"session":"ACTUAL_OWNER_ALIAS","callDigest":"ACTUAL_TOOL_CALL_HASH"},
    "plan-archival":{"session":"ACTUAL_OWNER_ALIAS","callDigest":"ACTUAL_TOOL_CALL_HASH"}
  }
}
```

These select actual tool events; they do not declare passes. Acceptance/review, final clean Git
state and archived implemented plan are checked independently. Baseline performance fixtures fix
`worktree.enabled=false` and portable Quality, making cleanup and pilot finalization their existing
no-op duties. This instrumentation does not retrofit candidate state into the old baseline.

For negative variants, start a real scenario first. At the actual boundary use `probe-helper` with
an actual candidate input file. It executes the exact measured helper and binds operation, request,
run, UTF-8 bytes, output/error, call/time and variant; error-code enums alone cannot pass:

```json
{"operation":"probe-helper","input":{"launch":"ACTUAL_LAUNCH","variant":"oversized-question","operation":"question","inputFile":"/PRIVATE/FIXTURE/ACTUAL-INPUT.json"}}
```

Closed mappings are oversized-question→question, oversized-result→terminal,
missing-evidence→verify-terminal, drift/interrupted/stale→resume and injected→reply. Oversized
fields must exceed 16 KiB in actual UTF-8 bytes. Missing-evidence requires an existing original
terminal reference whose actual gate evidence is absent. Interruption requires the actual lock.
Drift supplies `checkpoint:{root,path,digest}` and independently compares its actual snapshot with
Git HEAD/index/tracked/untracked contents. Each variant has its own actual call/session; reusing one
unrelated `TOO_LARGE` result for multiple cases fails. Never delete live runtime data to make a probe.

For unsuccessful supported launches submit `fail` after the actual nonzero CLI result:

```json
{"operation":"fail","input":{"launch":"ACTUAL_LAUNCH","outcome":"failed"}}
```

`invalid` likewise needs an actual unsuccessful process/error. `unsupported-depth` instead supplies
`host` with its complete actual transcript tree and requires an observed nesting refusal bound to
the prepared process; it retains null metrics and cannot enter a performance-success cell. A complete
inline fallback still owes every required leaf and gate for the behavioural unsupported-nesting case.

## Seal and verify

`record.mjs` accepts existing coordinator output files only. It cannot synthesize a completion:

```json
{"schema":"effective-flow.build-context/1","kind":"pair","baselineCompletion":"/PRIVATE/JOURNAL/BASELINE-complete.json","candidateCompletion":"/PRIVATE/JOURNAL/CANDIDATE-complete.json"}
```

```sh
node evals/build-context/record.mjs /PRIVATE/pair-manifest.json \
  evals/build-context/results/_auxiliary/pair-codex-simple-1.json
```

Native manifests use `{schema,kind:"native",completion,baselineBuildReceipt}`. Attempt manifests use
`{schema,kind:"attempt",completion}` pointing at the actual `*-failed.json`. Auxiliary records are
bounded to 2 MiB and bind immutable source/build/instrument identities. Their path directory is
`results/_auxiliary/`; changing filenames does not create new samples.

For scenario publication write the shared attempt's `trace/build-context.private.json` as:

```json
{"schema":"effective-flow.build-context/1","variants":[{"name":"complete","completion":"/PRIVATE/JOURNAL/ACTUAL-complete.json"}]}
```

Include every required variant, then use the shared [seal/publish lifecycle](../merge-gate/README.md).
The shared root receipt schema is unchanged. This suite's archive hook re-evaluates actual archived
logs and state, provenance, profile, paired seals and exact five scenario slots. Current stamps with
empty variants, malformed logs or missing observations never count as current evidence.

```sh
pnpm eval build-context verify --mode report
pnpm eval build-context verify --mode strict
node --test test/build-context-evidence-contract.test.mjs
```

Each cell uses the median of **individual pair ratios** for parent peak ≤0.50, cumulative input
≤1.15 and elapsed ≤1.25. Absolute fresh-root parent p95 uses nearest rank across all five candidate
slots and must be ≤120000. Required metrics cannot be null. `parentPeakInput` retains its compatibility
name but measures full observed parent context (Codex last total tokens; Claude input/cache/output).
All actual descendants contribute cumulative input; cached/uncached values remain null if absent.

## Native lanes and currently unproven host details

Native completion additionally reads the actual finalized private pilot record through `pilotRecord`.
Capture privately correlates generation/workflow/packet identities and publishes only salted stable
aliases. The lane requires chronological start, one actually consumed Fast packet/spawn, actual
Quality continuation, question by the original runner, exact genuine user answer, parent reply/resume,
one continuation of that same runner and exactly one finalization of the same workflow. No
activation during the measured run, unrelated finalized record or count-only summary can pass.

Codex 0.163.0 capability probes observed deep `gpt-6.1-sol/high`, standard
`gpt-5.6-luna/medium`, retained root/child/grandchild handles and a capacity refusal followed by a
possible direct leaf. These are not completed workload scenarios. A separate actual native Fast
probe requested `gpt-5.6-luna/medium` on the base TOML role but observed `gpt-6.1-sol/high`.
That override is unsupported in that observed launch; do not change mappings or record a pass.

Claude Code 2.1.292 returned actual API 429 `usage_limit_reached` on 2026-10-20, zero spawns and zero
input, with reported reset 2026-10-22 16:00 Europe/Berlin. Its successful nesting, actual effort,
continuation, paired/native runs remain unproven. The probe predates the coordinator and cannot be
retroactively adopted as cohort evidence. Retain it privately as a diagnostic; capture later actual
attempts through the unchanged coordinator. Missing actual descendant effort or concrete model
resolution cannot be inferred from CLI flags or a root init response. Claude family aliases are
checked against actual assistant model IDs (for example opus → claude-opus-*); unrelated families
are refused, and each pair must retain identical concrete role/model/effort observations.

The transcript adapter recognizes Codex private rollout `session_meta`, actual tool call/results,
`turn_context` model/effort, task completion and token-count events, and Claude actual assistant
model/usage/effort and tool-use associations. Conservative helper capture currently requires direct
`node /absolute/scripts/build-run.mjs OP <<'JSON'` (or pilot-measurement) tool commands with a JSON
input body. Opaque nested JavaScript command wrappers or absent actual settings/usage are unproven;
no string-search success inference is used. Host `probe-helper` provides exact boundary observations,
but cannot substitute for missing genuine workflow/native lifecycle calls.
