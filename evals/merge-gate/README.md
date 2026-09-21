# Behavioural evals for `merge-gate`

A behavioural safety net for `src/tools/merge-gate.md`, recorded deliberately rather than in CI: no
runner here ever starts a model. What CI does read is the archived result, and the release pull
request is where it has to still describe the build — see
[Freshness and the release gate](#freshness-and-the-release-gate). It exists because every other
assertion guarding that file checks its **text**: a restructure can move a fail-closed rule out of
reach of the run and the whole suite still passes, because the wording is present somewhere. This
layer asserts the opposite kind of thing — that a merge which should be blocked is observed to be
blocked.

The plan behind it is
[`docs/plan/archive/2026-09-02-merge-gate-behavioural-evals.md`](../../docs/plan/archive/2026-09-02-merge-gate-behavioural-evals.md).

## The design in one paragraph

**The stub's call log is the forge-facing evidence.** A gate run's whole forge input surface passes
through one subprocess, so a fake `remote-tracker.mjs` on a scaffolded skill root sees everything the
gate asks for and writes a correlated call log. What that run _did_ at that boundary is therefore
already on disk, and the assertions are ordinary `node:test` cases over that file. There is no
grader, scoring, or model-trace parser. The configured-reviewer scenario adds one narrower
instrument: its slots replace `iterate` with a deterministic echo that validates the real Phase-3
handoff and records a bounded second trace. That trace is not a model trace, grader, or score; it
proves only the delegation boundary the tracker log cannot see. A round builds the portable skill once, provisions five isolated slots for every selected
scenario, and renders one prompt per slot. The repository does not launch a model: the host hands
each rendered prompt to a fresh, non-forked session rooted in that slot's project, then supplies a
safe receipt so the finished attempt can be sealed. Slots and rounds may run concurrently; only the
final publication of canonical results is serialized.

## What is here

| Path                                   | What it is                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| `scenarios/<name>.md`                  | One scenario: a prompt template plus its expected outcome as prose                      |
| `round.mjs`                            | The round lifecycle CLI; it prepares and validates evidence but never launches a model  |
| `prepare.mjs`                          | Deprecated compatibility wrapper for preparing one scenario as a five-slot round        |
| `_scaffold/round-core.mjs`             | Importable round, slot, sealing, retry, publication, and recovery logic                 |
| `_scaffold/scaffold.mjs`               | Provisions an isolated slot from the round's shared build                               |
| `_scaffold/remote-tracker.mjs`         | The canned-envelope stub standing in for the shipped helper, and writer of the call log |
| `_scaffold/sandbox.mjs`                | The round, scenario, slot, and attempt sandbox layout                                   |
| `_scaffold/configured-reviewer-scenario.mjs` | Which scenario receives the configured-reviewer rows, the `iterate` echo, and its trace |
| `_scaffold/iterate-echo.md`            | The configured-reviewer scenario's replacement for the slot's `tools/iterate.md`        |
| `_scaffold/iterate-trace.mjs`          | The echo's receiver and the writer of its bounded handoff trace                         |
| `_scaffold/run-evidence.mjs`           | The call-log/build-stamp/echo-trace pairing rule publication checks                     |
| `fixtures/<name>.json`                 | The scenario's envelope set, the provider payload each came from, and its merge opt-in  |
| `results/<name>/run-<n>.jsonl`         | Published call logs — the evidence the assertions read                                  |
| `results/<name>/run-<n>.build.json`    | Per-file hashes of what that scenario loads, binding the log to a build                 |
| `results/<name>/run-<n>.prompt.txt`    | The exact rendered prompt supplied to the fresh session                                 |
| `results/<name>/run-<n>.metadata.json` | Safe slot, build, prompt, fixture, execution-profile, and host-attestation metadata     |
| `results/<name>/run-<n>.iterate.jsonl` | Configured-reviewer handoff trace; required for that scenario, forbidden for any other  |

Three test files in the ordinary `pnpm test` suite belong to this layer:

- [`test/eval-fixture-fidelity.test.mjs`](../../test/eval-fixture-fidelity.test.mjs) proves every
  canned envelope is one the real `executeOperation` normalizer emits for the same provider payload,
  and pins the call log's record schema.
- [`test/merge-gate-eval.test.mjs`](../../test/merge-gate-eval.test.mjs) holds the scenario
  assertions over the archived logs.
- [`test/merge-gate-eval-round.test.mjs`](../../test/merge-gate-eval-round.test.mjs) exercises the
  round lifecycle, isolation, receipt validation, retries, publication locking, and crash recovery.

None runs a model, and none starts a gate run. `pnpm test` stays a pure file-and-transform
suite. None of them answers whether the archived logs still describe the working tree either; that
question belongs to `pnpm merge-gate-eval verify`.

## Running a round

### 1. Prepare every slot from one build

Replace the uppercase values below with the non-sensitive execution profile the host will use for
every slot in this round:

```sh
pnpm merge-gate-eval prepare \
  --harness HARNESS_NAME \
  --model MODEL_NAME \
  --reasoning-effort REASONING_EFFORT \
  --reported-version MODEL_VERSION \
  --tool-policy HOST_TOOL_POLICY
```

With no `--scenario`, `prepare` discovers the complete scenario corpus. To prepare a subset, repeat
the option; each selected scenario still receives all five canonical slots:

```sh
pnpm merge-gate-eval prepare \
  --scenario guard-blocks-merge \
  --scenario merge-proceeds \
  --harness HARNESS_NAME \
  --model MODEL_NAME \
  --reasoning-effort REASONING_EFFORT \
  --reported-version MODEL_VERSION \
  --tool-policy HOST_TOOL_POLICY
```

The command builds once for the whole round, records one execution profile in an immutable manifest,
and prints the manifest path followed by one tab-separated row per slot. The last column is the
rendered prompt path. Omitted profile values are recorded explicitly as `"unknown"`; they are not
inferred later. Preserve the manifest path: every later command accepts either it or the printed
round identifier through `--round`.

Every scenario prompt states the slot project twice: as the execution root and as the literal
`cwd` field required in every helper request. The second form is deliberate. Merely running a shell
from that directory does not populate the JSON contract, and a missing field makes the resulting
record invalid even when the inherited process directory happened to be correct. `prompt.mjs`
therefore requires `{{PROJECT_ROOT}}` exactly twice in every template.

The configured-reviewer scenario modifies only its own slots. Provisioning appends the current
`mergeGate.bots`, `mergeGate.bots.<login>.trigger`, and `mergeGate.bots.<login>.check` rows to that
slot's project-setup ADR, replaces the slot's copy of `tools/iterate.md` with the echo, adds the
echo's `scripts/iterate-trace.mjs`, and creates an empty `trace/iterate-calls.jsonl`. The round's
shared build is never overlaid; the other scenarios retain the base configuration and production
`iterate`. The echo accepts only the expected delimiter, minted boundary token, two-item attribution
manifest, item filter, and suppression and review-guard controls. It retains reviewer text only as
byte count and SHA-256 digest, then returns one controlled `deferred` outcome for each
caller-minted identifier. Its build identity hashes the echo and the trace helper at the paths the
run executes, in place of production `iterate`.

Preparation may run concurrently in different checkouts or for different rounds. Every round has
its own collision-resistant directory under `/tmp/effective-flow-merge-gate-eval/rounds/`, and every
`(scenario, slot, attempt)` owns its own skill copy, project checkout, fixture, trace, and locks.

### 2. Launch fresh sessions at the host boundary

For every row, the calling host must start a **new, non-forked session** with:

- the slot's `project/` directory as its initial working root;
- the contents of that slot's `prompt.txt` as its only task input; and
- the same harness, model, reasoning effort, reported version, and tool policy recorded for the
  round; and
- no user-level skills or instructions. A delegating scenario dispatches `effective-flow iterate`
  by name, and a worker with no inherited turns resolves that name through the harness's skill
  registry: an installed Effective Flow release there shadows the slot's own skill and its
  overlaid `tools/iterate.md`. For the Codex CLI, give each session a throwaway `HOME` and
  `CODEX_HOME` that hold only the authentication file, and record that as `isolated-home` in the
  tool policy.

Do not launch these as repository-root sub-agents or give them the scenario file: either can expose
the expected outcome and turn the eval into a memory test. The repository CLI deliberately has no
model launcher and cannot independently prove what the host supplied. It validates and archives the
host's attestation of that boundary instead.

Run any number of slots concurrently. Hosts with less capacity can process the same fixed slots in
waves; no preparation or slot identity changes. Use `status` at any time to inspect the current
attempt and prompt path:

```sh
pnpm merge-gate-eval status --round ROUND_ID_OR_MANIFEST
```

The status values are `prepared`, `unsealed`, `sealed`, `invalid`, `changed-after-seal`, and
`retry-pending`. `unsealed` means a non-empty log exists; it does not mean the host task is still
running. `retry-pending` means an interrupted retry left a journaled transition to its already
prepared replacement attempt.

### 3. Seal each finished attempt

After a session finishes, create a host receipt with exactly these fields:

```json
{
  "schemaVersion": 1,
  "nonForked": true,
  "initialWorkingRoot": "/tmp/effective-flow-merge-gate-eval/rounds/ROUND_ID/slots/SCENARIO/slot-1/attempt-1/project",
  "taskInput": "rendered-prompt-only",
  "completed": true,
  "profile": {
    "harness": "HARNESS_NAME",
    "model": "MODEL_NAME",
    "reasoningEffort": "REASONING_EFFORT",
    "reportedVersion": "MODEL_VERSION",
    "toolPolicy": "HOST_TOOL_POLICY"
  }
}
```

The working root and profile must exactly match that attempt and its round. Do not add task, thread,
or session IDs, account or email values, or links. Seal only after the host task has ended:

```sh
pnpm merge-gate-eval seal \
  --round ROUND_ID_OR_MANIFEST \
  --scenario guard-blocks-merge \
  --slot 1 \
  --receipt HOST_RECEIPT_JSON
```

Sealing refuses an empty log or a live call-log lock — and, for the configured-reviewer scenario, a
missing echo trace or a live trace lock — then recomputes the actual slot's fixture,
project configuration, prompt, metadata, stub, and loaded-build identity before writing an atomic
receipt. The configured-reviewer seal also covers the echo trace. Publication recomputes the sealed
digests, so a later write to either becomes `changed-after-seal` and cannot be published.

### 4. Retry only non-evidence or invalid evidence

If a stopped host task produced no non-empty log, attest that fact in a separate stop receipt:

```json
{ "schemaVersion": 1, "stopped": true, "reason": "host cancelled the task" }
```

Then reprovision the same slot:

```sh
pnpm merge-gate-eval retry-aborted \
  --round ROUND_ID_OR_MANIFEST \
  --scenario guard-blocks-merge \
  --slot 1 \
  --receipt STOP_RECEIPT_JSON
```

`retry-aborted` refuses a sealed attempt and any non-empty log. A log that exists must be sealed and
evaluated even if the host calls the task aborted.

Use `retry-invalid` only for a sealed attempt that `status` classifies as invalid, or one that
changed after sealing:

```sh
pnpm merge-gate-eval retry-invalid \
  --round ROUND_ID_OR_MANIFEST \
  --scenario guard-blocks-merge \
  --slot 1 \
  --reason "wrong runtime root"
```

Both commands retain the old attempt and its reason under the slot's quarantine directory before
creating `attempt-<n+1>`. They never replace a structurally valid run. In particular, a valid
behavioural deviation is a finding and cannot be retried away. The sequenced Phase-4 scenario stops
after five discarded attempts for one slot and requires investigation; the other scenarios have no
invented global retry ceiling.

If `status` reports `retry-pending`, repeat the corresponding `retry-aborted` or `retry-invalid`
command for the same round, scenario, and slot, including the same stop receipt for
`retry-aborted`. The command completes the journaled transition and returns the replacement prompt;
it does not discard another attempt. Do not move quarantine or attempt directories by hand.

### 5. Publish one complete generation

When every selected slot is sealed and valid, publish the round:

```sh
pnpm merge-gate-eval publish --round ROUND_ID_OR_MANIFEST
```

Publication builds the current source once more to reject drift, carries forward unselected
scenarios, stages the complete candidate, and validates exact five-slot coverage and every archived
artifact before replacing `results/`. The candidate contains logs, build stamps, rendered prompts,
and safe metadata, plus the echo trace for every configured-reviewer slot. A valid behavioural finding is still published, is printed to stderr, and makes
the command exit nonzero; the ordinary eval test then reports the same red outcome. Structurally
invalid or incomplete evidence replaces nothing.

A single checkout-scoped publication lock covers recovery of an earlier journal, candidate staging
and revalidation, generation marking, promotion, and cleanup. Competing publishers and an explicit
recovery therefore cannot inspect or change the candidate, current results, or backup concurrently.
Promotion uses same-filesystem renames, a generation marker with a content digest, and a journal for
the three rename phases. After an abruptly interrupted publish, run:

```sh
pnpm merge-gate-eval recover
```

Recovery compares the observed candidate, current, and backup generation identifiers and content
digests, then deterministically finishes or rolls back the interrupted promotion. Contradictory or
tampered generations fail closed. `publish` performs the same recovery after acquiring the lock and
before staging its candidate; `recover` is the explicit operator entry point and acquires that same
lock.

Then read the new evidence with the ordinary assertions. They judge whether it is sound; whether it
still describes the working tree is a separate question with its own command:

```sh
node --test test/merge-gate-eval.test.mjs         # or just pnpm test
pnpm merge-gate-eval verify                       # does the archive still describe this tree?
```

### Freshness and the release gate

`pnpm test` asks whether the archived files are evidence at all — a stamp exists, parses, and is the
one its own metadata names, and five runs of five are there. It no longer asks whether they still
describe the working tree. That second question is a property of the _pair_ rather than of the
files, and it has its own read-only command:

```sh
pnpm merge-gate-eval verify [--mode report|strict]
```

`verify` builds the portable skill once into a throwaway root, recomputes each scenario's build
identity from it, and compares that against every archived stamp. It writes nothing, takes no
publication lock, and launches no model, so it is safe beside a round, beside a publication, and
inside a CI step. Report mode — the default — names the corpus it read, then prints one line per
scenario, with its runs counted by state and any waiver named, then the slots that went stale and
the files that moved behind the first of them; it exits 0 even when a scenario is stale.
`--mode strict` additionally exits 1 for any scenario that is not `current`.

A scenario is one of five states, and they are kept apart because each one sends an operator
somewhere different:

| State     | Meaning                                                    | Remedy                                             |
| --------- | ---------------------------------------------------------- | -------------------------------------------------- |
| `current` | every archived stamp still describes this tree             | nothing to do                                      |
| `stale`   | a stamp describes another build, or a run carries none     | re-record the round                                |
| `short`   | fewer runs than the five-of-five bar                       | finish the round                                   |
| `surplus` | more runs than that bar — the shape publication rejects     | reconcile the directory before publishing again    |
| `absent`  | no archived runs at all                                    | record a round; nothing is proven about this gate  |

The count is read before the content, so a round that is both short and stale reports `short`; the
remedies chain correctly, because a run recorded against the current tree leaves the rest of that
round visibly stale on the next verdict.

`surplus` exists because the count is wrong in two directions and the remedies are opposites:
telling an operator to finish a round that is already over-complete costs more than the extra word
in the vocabulary. Every state other than `current` fails `--mode strict`: at a release point
"nothing was observed" is not an acceptable state, although it stays a legitimate skip in a fresh
checkout.

Only a failure to reach a verdict at all — a build that fails, an archived stamp that will not
parse — exits nonzero in report mode: an unwelcome verdict is not an operational error, and
conflating the two would turn every pull request red through the step that exists to keep it green.

CI runs exactly that command as the last step of the required `Format, test and build` job, and that
is the whole of CI's involvement with this layer: no model, no quota, no round. On an ordinary
pull request the step reports — the verdict goes to the job summary and the check stays green even
when the corpus is stale — because paying a round per pull request for a claim about the build that
ships is the cost this arrangement removes. On the release pull request, recognised by its
`release-please--` head-ref prefix, the same step runs strict and a stale, short, or absent corpus
fails the required check. There is no waiver: without a current round there is no release.

That moves the deadline, not the bar. Five of five still holds, the load set is still the derived
one, and the evidence is still recorded by hand. What changed is when the invalidated round comes
due — once per release rather than once per pull request that touches the load set — and that
staleness is now visible, with its list of moved files, from the pull request that caused it. Record
the round as an ordinary pull request into `develop`; never commit evidence onto the release branch,
which release-please owns and force-pushes.

### Evidence units and invalid runs

An ordinary published run is `run-<n>.jsonl` and `run-<n>.build.json` bound by `run-<n>.prompt.txt`
and `run-<n>.metadata.json`. A configured-reviewer run additionally carries `run-<n>.iterate.jsonl`,
and its call log, build stamp, and trace form one indivisible unit. Publication rejects a candidate
with a missing companion, an echo trace orphaned under another scenario, or a configured-reviewer
call log without its trace, before it evaluates anything; `test/eval-fixture-fidelity.test.mjs`
pins that pairing rule, and the scenario assertions require each call log's build stamp and, on the
configured-reviewer route, its trace.

Pairing is necessary, not sufficient. A run must also match the current scenario build identity,
carry a readable and correctly rooted tracker log, request no operation the production helper
supports but the fixture leaves undefined, and satisfy any scenario-specific validity rule. For the
configured-reviewer route, a trace whose records are unreadable, carry another schema or sequence, or
ran outside the slot project is invalid. An empty trace is not: it records a run that never
delegated, which is a finding about the gate, as is any trace that is not exactly one echo record
whose identifiers, attribution, controls, and controlled outcomes match the handoff. The sequenced
Phase-4 scenario must have received its deciding status element before its fresh evaluation. An
invalid run is retried as its whole unit; left in `results/`, the suite fails it rather than
omitting it from the five-valid-run bar. A run that merged after a deciding fail-closed input is
always a valid failure and is never discarded as variance.

The published logs and their binding artifacts are committed evidence. They make a behavioural
claim checkable by someone who did not perform the runs.

### Compatibility command

`pnpm prepare:merge-gate-eval <scenario>` remains temporarily available. It prints a deprecation
notice and forwards to `pnpm merge-gate-eval prepare --scenario <scenario>`, producing a complete
five-slot round. It no longer archives a previous log or owns any lifecycle logic.

### Cost is quota and wall-clock time

There is no per-run charge: this project runs on flat subscriptions. What a run consumes is
subscription quota and elapsed time, and the one measured run took roughly **five minutes**. Five
serial runs of one scenario are therefore about half an hour, and thirty serial runs for the six
scenarios that exist today are about three hours. The round layout makes those runs
independent, so elapsed time now depends primarily on how many fresh sessions the host can run at
once; it does not promise a particular speedup. Where the suite has to be shortened, the scenario
count gives way — never the five-of-five requirement, because for a fail-closed rule a single
deviating run is a finding. The one scenario that never gives way is the merging counterpart:
without it the refusals prove less than they appear to.

That hour comes due less often than the wall-clock figure suggests. A round is invalidated only by a
change to what the gate loads — the router, `tools/merge-gate.md`, the artifacts the gate delegates
into (`tools/iterate.md` and the `merge-conflict-resolver` and `code-validator` worker contracts),
and the fragments any of those reach through their own load pointers — rather than by any change
anywhere in the built skill, so an edit to an unrelated tool, an unreached worker contract or a
fragment no run reads leaves the standing evidence intact. The shipped `scripts/remote-tracker.mjs`
is not among them: the scaffold overwrites it with the stub, which is hashed separately as the
instrument.

A release does not invalidate a round, although it does change the router. `build.mjs` stamps the
manifest version into `SKILL.md`, so a release-please pull request moves the skill digest of every
archived round without a line of the gate having been edited — thirty re-runs owed to a number
nobody wrote, on the one pull request that has to stay mergeable. Each stamp therefore also carries
`skill.versionNeutralDigest`: the same load set, hashed with the router's rendered
`<semver> (<hash>)` token replaced by a placeholder. A round survives a release only when that
digest matches, `SKILL.md` is the single moved skill file, and the instrument and scenario parts are
still exactly equal; anything else fails as before, including a stamp too old to carry the field.
The version still binds every run whose build differs in anything the version does not explain.

That is a narrower trigger, not an absent one — but an invalidated round is no longer owed at the
next merge. Two pull requests that both touch those files leave the corpus stale in the same way,
and one round re-recorded before the next release answers for both; `verify` reports that staleness
on every pull request in between and enforces it on the release pull request. A load pointer also
counts whether or not a run can take its branch: `shared/typography-rules.md` is hashed today only
because `chat-language` points at it under `when: the resolved chat language is de`, a branch
neither scenario reaches. That widening is a recorded decision rather than an accident, and its
reasoning sits beside `LOAD_POINTER_RE` in `_scaffold/build-identity.mjs`.

### Parallelism and evidence isolation

Round and slot identities remove the old machine-global collision. Two slots of the same scenario,
different scenarios, and separately prepared rounds — including rounds from different worktrees —
do not share a project, skill copy, log, call-log lock, or sequence allocation. `prepare` never
archives or deletes a running slot. Parallelism is therefore a host-capacity choice rather than an
evidence-format exception.

This does not make timing evidence. Calls tens of milliseconds apart are ordinary because an agent
may issue a read batch together and the stub is a fresh process per call. Independence comes from
the round/slot path and host receipt, not from elapsed time. Within one slot, repetitions remain a
useful contamination signal: a second Phase-1 read batch or an operation that the scenario performs
once appearing twice can invalidate the evidence. In a lifecycle log, count `start` events; their
correlated `complete` events are not additional calls.

### Seven failure modes the assertions handle by name

- **A missing or empty log fails loudly and never counts as a refusal.** A run that never started
  produces no `pr-merge` record, which is indistinguishable from a correct refusal unless the
  emptiness is itself an error. It is.
- **A record without a runtime root disqualifies the whole run.** Every record of every archived run
  must carry a non-null `cwd` resolving into that scenario's sandbox project root. A null means the
  gate stated no working directory, and the helper then falls back to whatever directory the process
  happened to inherit — so the log is equally consistent with a run that never entered the sandbox,
  and it proves nothing about the scenario. A `cwd` pointing somewhere outside the sandbox fails for
  the same reason. One such run, twenty-one records and every one of them null, had already been
  counted toward the five-of-five bar; the `recensor` review bot found it by reading the logs, which
  is precisely the work an assertion should have been doing.
- **With no archived runs at all, the assertions skip with a loud reason rather than passing.** They
  never report success for a scenario nobody ran. Skipping rather than failing is deliberate: a
  permanently red `pnpm test` in every checkout that has not spent quota on a run — CI included,
  which runs these assertions and never a model — is ignored within a week, and would cost more
  evidence than it gathers. `node --test` prints the skip reason beside the test, and the pass count
  does not include it. `verify --mode strict` does fail on that same empty corpus, because at a
  release point "nothing was observed" is not an acceptable state; in `pnpm test`, in any checkout,
  it stays a skip.
- **Between one and four archived runs is a failure, not a skip.** The five-of-five bar is asserted
  rather than printed. Zero runs and a short round are different facts: zero describes a checkout
  nobody has spent quota in, which is the ordinary state of a fresh clone, while one to four
  describes a round somebody started and did not finish. The evidence exists there and falls short
  of the documented bar, and a skip would let a three-run round be published as a green suite —
  which is the exact claim the bar exists to prevent.
- **A run that asked for an operation the shipped helper supports and its fixture does not define
  fails.** The stub answers such a call `UNSUPPORTED_CAPABILITY` where the real
  `scripts/remote-tracker.mjs` would have answered it, and the run improvises from there onto a
  fallback path it would never have taken against a forge, so whatever it did afterwards is no
  longer a measurement of the scenario as composed. Two rounds were discarded for this —
  `pr-checks-wait` and `repository-resolve` — both found by reading logs by hand and once nearly
  waved through because the stray operation looked harmless. It is an assertion rather than a
  judgement for that reason. `body-hash` is defined in every fixture with an input that exactly
  matches that fixture's `pr-read` body and an envelope emitted by the real local operation. The
  merge and post-merge paths call it routinely, and the refusal scenarios may now call the same
  contract-faithful operation without being diverted onto the stub's unsupported-capability path.
  This does not weaken contamination detection: every other operation supported by the shipped
  helper still disqualifies a run when the active fixture leaves it undefined.
- **A call to an operation the shipped helper does not support at all passes.** The real helper
  refuses an unknown name with `INVALID_PAYLOAD: unknown operation: <name>`, so a run that guesses
  at an invented capability probe gets an error in the sandbox and would get an error in
  production too. Its behaviour is not distorted, and the rest of its log stays sound evidence.
  Failing those as well would discard complete rounds over a stray guess, and defining a fixture
  envelope for such a name would only make the sandbox diverge in the other direction. The
  supported set is derived from `src/scripts/remote-tracker-core.mjs` at assertion time rather than
  listed in the test, because a transcribed list is wrong the day an operation is added and that
  drift is the failure this layer exists to catch.
- **A run that never received a sequenced read's deciding element in time is invalid, and fails
  until it is redone.** `unreported-checks-at-phase-four` serves a green check list on its first two
  status reads and `checksReported: false` from the third on. Phase 4 now requires that third,
  independent status read to complete before it starts the three guard-surface reads, and it may
  evaluate nothing until all four results are complete. So **a run is valid only if the correlated
  completion of the `pr-status-read` served the `checksReported: false` element precedes the earliest
  second guard-surface `start` event** (review threads, pull-request comments, submitted reviews).
  Reusing Phase 2's status or issuing all four reads as one unordered batch is a contract violation
  and no evidence about the Phase-4 precondition. The rule is derived from the globally ordered event
  sequence, and the flipped element's position is read from the fixture rather than transcribed. An
  invalid run is discarded and redone, exactly as a run with a `cwd: null` record is; left in
  `results/`, it fails the suite rather than counting as a pass or a failure, and the five-of-five bar
  is counted over valid runs. It separates cleanly from the dangerous failure: **a run that requested
  `pr-merge` after the flipped read started is valid regardless of later read omissions**, so it
  always fails the outcome assertion and is never discarded as variance. If one round needs more than five
  discarded runs to reach five valid ones, stop and decide rather than keep re-running — the rule is
  then hiding a pattern rather than absorbing variance.

## What this deliberately does not cover

- **Six scenarios exist: one pair, one observer, two unreported-check-list refusals, and one
  configured-reviewer refusal.** `guard-blocks-merge` and `merge-proceeds` are the pair, and a green
  result from them proves that one refusal path holds and that the harness can reach a merge, and
  nothing about the breadth of the gate. `linked-issue-open-points` stands beside them rather than inside them: it makes no merge
  decision at all, and what it observes is the post-merge phase. `unreported-checks-block-merge`
  stands beside them too, and makes no merge decision either: its status read carries no check
  rollup, which Phase 2 refuses to leave its loop on and merge precondition 2 refuses to pass unless
  the Phase-4 no-check-list waiver clears it — and that waiver is posed only in a gated run, which
  no scenario here is. `unreported-checks-at-phase-four` is the refusal that reaches that decision
  point: its status read is sequenced to report a green list through Phase 2 and none at Phase 4, so
  a valid run blocks at Phase 4 on condition 2. Its log cannot tell whether the waiver's own text was
  loaded, because condition 2 blocks either way. `configured-reviewer-set-aside-blocks` reaches the
  configured-reviewer route, delegates one thread and one review-body finding through the
  slot-local echo, and reaches the Phase-4 set-aside decision without an interactive operator. Its two
  traces prove those boundaries and the absence of a merge request, not the text of the gate's final
  report. WP3 to WP6 of the plan — the guard's three ordered rules across its three
  counting surfaces, merge preconditions 1/2/3/8/9, the fail-closed input enumeration, and the round
  bound — are still to come. Read a green result as a proven mechanism, not as a net.
- **No single log can prove a refusal was a decision.** A refusal is defined by absence, and a call
  log records calls rather than verdicts, so a run that died after the Phase-4 reads leaves the same
  log as a run that refused. `guard-blocks-merge` therefore proves only that no merge was requested
  and that those reads happened. What closes the gap is the positive control, not a stronger
  assertion: `merge-proceeds` is the same fixture with the blocking thread removed and asserts that
  `pr-merge` **is** present, so a blanket refusal — from a broken gate or a broken harness — fails
  the suite. Neither scenario carries the claim on its own.
- **Phase 5.5 is reached only through the observer-only branch, and that is a property of the
  harness rather than a preference.** The merging scenario cannot reach it: its canned reads
  describe an open pull request and go on describing one after the merge, because the stub resolves
  an envelope by operation name — one fixed document per operation, or for a sequenced entry one per
  call position, and no model of forge state — so the fresh read that Phase 5.5 entry requires never
  confirms the merge. That limit is downstream of
  everything `merge-proceeds` asserts, since its `pr-merge` records are already written by then, and
  removing it needs a stateful stub, which is WP6's subject.

  `linked-issue-open-points` reaches the phase without one. Its pull request is **already merged in
  the canned document**, which no state is needed to observe, so Phase 0's second entry — an
  already-merged pull request carrying one valid lifecycle receipt — jumps straight to Phase 5.5
  with no check wait, no delegation, no branch write and no merge. Every read that path makes is
  answered truthfully by a fixed document.

  **Do not "fix" that scenario into a merging one.** It would fail nothing and would silently remove
  the suite's only Phase 5.5 coverage, leaving a green suite that observes the post-merge phase not
  at all. What it asserts is also narrower than it may look: its non-sequenced fixture keeps the
  legacy record schema
  `{seq, operation, apply, at, cwd}` and the chat report is captured nowhere, so the log can carry
  that the canonical planning comment was read — once for the one open linked issue, not twice — and
  never that its open points reached the report. That half is asserted as source text in
  `test/workflow-contracts.test.mjs`, and no assertion here should claim otherwise.

- **Conditions 6, 7 and 10 are out of scope end to end**, per the plan: they are evaluated against
  identifiers the gate mints at run time, which a fixture cannot carry. Their fail-closed halves
  belong to WP5.
- **Codex execution is unexercised.** Both targets are built from one source and carry identical
  rules, so what stays untested is the Codex **execution**, not the rule. With the log as the
  evidence, a later Codex driver would reuse the stub, the fixtures and every assertion unchanged.
  This is a named residual, not a gap to be closed by weakening anything here.
- **No round is ever run in CI**, which has neither the credentials nor the quota for it: the
  evidence is recorded by hand or not at all. What CI does is read the result. `verify` reports on
  every pull request whether the archive still describes the tree and fails the required check on
  the release pull request, so what makes the suite binding is now that check rather than a
  convention. The body convention survives for one pull request only — the one that re-records a
  round, which carries the suite's output in its body: date, commit, per-scenario run count and
  result. It produces the evidence, and it is the only place in the history where the recording
  profile is stated. Every other pull request carries nothing.

## The sandbox

`round prepare` creates this hierarchy under the system temporary directory:

```text
/tmp/effective-flow-merge-gate-eval/rounds/ROUND_ID/
├── manifest.json
├── build/dist/portable/effective-flow/
└── slots/<scenario>/slot-<n>/
    ├── state.json
    ├── attempt-1/
    │   ├── skill/
    │   ├── project/
    │   ├── fixture.json
    │   ├── prompt.txt
    │   ├── run-metadata.json
    │   └── trace/
    └── quarantine/
```

The round build is made once and copied into each attempt's `skill/`, where the shipped tracker is
replaced by the eval stub. `project/` is a temporary Git repository with the AGENTS.md marker,
project-setup ADR, and `.gitignore`; `trace/` receives the call log, build identity, host receipt, and
seal receipt — and, for the configured-reviewer scenario, its `iterate-calls.jsonl` handoff trace. A retry moves the complete prior attempt into `quarantine/` and provisions the next
attempt from the same round build.

The manifest is read-only and binds the source revision, selected scenarios, execution profile,
build identities, prompt digests, and canonical slot paths. Mutating commands accept only a round
created by the same physical checkout; another checkout may inspect its status but cannot seal,
retry, or publish it. Path resolution rejects traversal and symlink escapes below the physical
round base.

There is no separate build step. `prepare` runs `build.mjs` once into the round tree and fails
outright if the build fails; each slot is therefore provisioned from the source under test rather
than a possibly stale, gitignored `dist/`. Publication rebuilds independently to prove that source
and instrument identity have not drifted since preparation.

## How the stub works

The whole forge input surface of a gate run passes through one subprocess with a JSON-in/JSON-out
envelope, and the gate's prompt contract forbids it from assembling provider requests itself. So a
fake `scripts/remote-tracker.mjs` on the scaffolded skill root is a **complete** input stub: no
network, no `gh`, no `tea`, no recorded cassettes.

It dispatches on the operation name in `argv` and returns that operation's canned envelope from the
fixture. Four behaviours are load-bearing:

- **Every call is recorded.** A fixture without a supported, well-formed sequenced operation keeps
  the legacy one-record-per-call schema: `{seq, operation, apply, at, cwd}`. A fixture containing one
  switches every call in that fixture to correlated lifecycle records: a `start` record with
  `{seq, event, callId, operation, apply, at, cwd}`, then a `complete` record with
  `{seq, event, callId, at}` only after the envelope has been delivered to stdout. `callId` links the
  two records, and assertions count calls from `start` events rather than counting both lifecycle
  records. `seq` starts at 1 and rises once per recorded event; allocation and append happen under the
  global call-log lock, so concurrent helper processes share one total order. `at` is a millisecond
  timestamp and can collide, so it cannot carry ordering on its own. `cwd` is the working directory
  the caller stated for the call — the runtime root the gate was operating in when it asked. The
  **stub** does not require one: a caller that states no directory is answered normally and recorded
  with `cwd: null`, and that tolerance is correct live behaviour which the shipped
  `issue-tracker-forge` contract relies on. An **archived run** is held to the stricter rule instead,
  and a null there fails the scenario assertions, because a run that never passed the runtime root
  leaves the helper on whatever directory it inherited and so evidences nothing about the sandbox.
  Both record shapes are contracts pinned by `test/eval-fixture-fidelity.test.mjs` — the stub's null
  tolerance included — because they are what every scenario assertion reads.
- **An undefined operation fails loudly**, naming the operation and the set the fixture does define.
  A silent default would let a scenario pass for the wrong reason — a gate that never merged because
  a read came back empty is not the same fact as a gate that refused on its guard. The first probe
  run demonstrated the cost of an incomplete fixture directly: `reference-parse`, `probe` and
  `pr-read` were undefined, the stub refused all three, and the gate improvised its way onward. A
  scenario has to exercise the normal path, so the fixture now defines them. The first archived round
  repeated the lesson one level down: `pr-checks-wait` and `repository-resolve` were still undefined,
  three of its five runs took a fallback path because of it, and the round was discarded rather than
  counted. Both operations are now in the fixture and in the required list
  `test/eval-fixture-fidelity.test.mjs` enforces.
- **`pr-merge` is always recorded, and refused unless the fixture opts in.** It is the one operation
  the stub decides for itself rather than looking up. A fixture stating `servesMerge: true` at its
  top level gets its canned success envelope for the dry run and for `--apply`; every other fixture
  gets a refusal, whether or not it defines a `pr-merge` entry, which is what keeps a refusal
  scenario from losing its protection through a stray fixture edit. The refusal carries the marker
  string `EFFECTIVE_FLOW_EVAL_STUB_MERGE_REFUSED` so the gate's own report names why the merge did
  not happen; no assertion reads that string.

  The opt-in exists for the positive control and for nothing else. A scenario in which every
  precondition holds cannot end in a stub refusal, because the gate would then have to report a
  failed merge and the run would stop somewhere the scenario was not composed to reach. Nothing is
  merged either way — there is no forge — and what the flag changes is the envelope the gate reads
  back, never a side effect. Both envelopes are proven against the real normalizer like every other
  one; deriving the applied one takes an ordered pair of provider responses, because `pr-merge`
  re-reads the pull-request status to check the head has not moved before it merges.

- **A sequenced entry answers the n-th call of its operation with its n-th element.** An entry may
  state an ordered list under `sequence` instead of a single envelope; that is what lets a status
  read answer differently in Phase 2 and in Phase 4. Each element is a complete single-envelope
  shape — its own `provider` (or `providers`) and its own `envelope` (or `dryRunEnvelope` and
  `applyEnvelope`) — under the entry's shared `input`, and a sequenced entry states none of those
  fields beside the list, so which one a call receives is never ambiguous. The field is deliberately
  not `providers`, which means one response per command **within** a call; `sequence` orders
  **across** calls.
  - **Position.** n is the number of earlier call starts for that operation in the run's log, dry runs
    and applies alike, plus one. It is computed inside the same `mkdir` lock that allocates the
    globally ordered `seq`, from the log content read immediately before the start-event append, and
    envelope selection uses that value without counting again — so calls issued concurrently, each
    its own process, receive distinct elements.
  - **Fail closed.** For a sequenced entry, a lock that cannot be obtained, a log that exists and
    cannot be read or counted, or a failed append answers with an error envelope — never element 1,
    and never the unlocked append a plain entry falls back to. That fallback is tolerable for `seq`
    only because a duplicate `seq` fails the schema assertion loudly; a duplicated position would fail
    nothing. `pr-merge` cannot be sequenced, because failing closed withholds the record and a merge
    record must never be dropped.
  - **Exhaustion is declared per entry.** A call past the last element fails loudly with an error
    envelope unless the entry states `repeatLast: true`, which serves the last element again. There is
    no silent default. A malformed entry — an empty list, a single-envelope field beside the list, an
    element stating no envelope, `repeatLast` without a list — is refused with the reason.

  The fixture-wide lifecycle schema makes both the served position and response availability
  observable: positions count `start` events, and a correlated `complete` event means stdout has
  accepted the envelope. Fidelity is still proven **per envelope** — every element passes the same
  check against `executeOperation` a single envelope does — and nothing proves that a sequence as a
  whole is one a real forge produces; a scenario that composes one says so.

The stub finds its fixture and its call log relative to its own location, so it needs no environment
of its own; `EVAL_TRACKER_FIXTURE` and `EVAL_TRACKER_LOG` override both and exist for the unit tests.
`EVAL_TRACKER_LOCK_WAIT_MS` shortens how long a call waits for the lock, without changing when a lock
counts as abandoned, and exists only for the test that proves a sequenced entry fails closed on a
held lock.

## Adding a scenario

1. Write `fixtures/<name>.json`: `repository`, `probe`, and an `operations` map whose entries carry
   the `input`, the raw `provider` payload, and the `envelope`. A scenario in which the gate is meant
   to merge additionally states `servesMerge: true` and a `pr-merge` entry; without the flag the stub
   refuses the merge, and with the flag but without the entry it answers `UNSUPPORTED_CAPABILITY`,
   so `pnpm test` requires the two together. Prefer deriving the whole file from an existing fixture
   and changing the minimum: two scenarios that differ in one fact are what makes a difference in
   outcome attributable to that fact.
2. Derive the envelope from the real normalizer rather than writing it by hand — pipe the provider
   payload through `executeOperation` with a fake runner, exactly as the fidelity test does, and paste
   what comes out. `pnpm test` then proves it stayed real. A local operation the normalizer resolves
   without touching the provider states a null `provider`; the fake runner is never reached for it.
   An operation that issues **several** commands states `providers` — an ordered list, one response
   per command, a string delivered as raw stdout and anything else JSON-encoded — instead of a single
   `provider`, and a **mutation** states `dryRunEnvelope` and `applyEnvelope` instead of one
   `envelope`, because the real helper answers the two modes differently. An operation that has to
   answer **successive calls** differently states a `sequence` of such shapes and declares whether
   `repeatLast` applies; see "How the stub works". A sequence needs a validity rule in its scenario's
   assertions for a run that never reaches the deciding position in time, as
   `unreported-checks-at-phase-four` has.

   One entry costs real time to derive and to re-verify. `issue-state-wait` is a **blocking**
   operation: where the first read finds the issue open it sleeps out the helper's fixed 30-second
   grace period before its second read, and the fidelity assertion replays it with the helper's own
   sleeper. So each fixture defining it adds about **30 seconds to `pnpm test`** — and there is no
   shortcut, because the alternative first read is a closed issue, which is a different observation
   and reaches no later step. Only `linked-issue-open-points` defines it today; a second fixture
   that needs the post-merge path pays the same 30 seconds again. The stub itself never waits:
   it hands the canned envelope back immediately, so a gate run pays nothing.

3. Write `scenarios/<name>.md`: the prompt between the `<!-- prompt:start -->` and
   `<!-- prompt:end -->` markers as a single fenced block, and the expected outcome below it, marked
   plainly as **not part of the prompt**. The prompt must not state what the gate should conclude —
   that is what makes the run a test rather than a recitation.
4. Register the scenario's name in `OUTCOME_EVALUATORS` in `_scaffold/suite.mjs`, then implement its
   outcome evaluation in `_scaffold/evaluate.mjs`. Discovery requires the scenario template,
   fixture, and evaluator registration to match in both directions; `test/merge-gate-eval.test.mjs`
   applies the shared assertions — the pinned log schema, the runtime-root check over every record,
   the undefined-operation check, and the five-of-five bar — to the discovered corpus. Add the
   scenario-specific test assertion as well. A
   refusal scenario asserts both that no `pr-merge` record exists **and** that the run reached
   Phase 4, so a crashed run cannot pass; a scenario in which the gate should merge asserts that a
   `pr-merge` record exists and that exactly one of them carries `apply: true`, since Phase 5
   previews the merge before applying it.

   The Phase-4 half is a **proxy** and has to be read as one: the gate reads each guard-deciding
   surface once in Phase 1 and again in Phase 4, so a second read proves those reads happened —
   never that the evaluation concluded, and never which condition decided it. The log holds helper
   calls, not verdicts, and no assertion over one log can do better. What makes a refusal readable
   as a decision is the merging scenario beside it.

   An **observer-only** scenario is the third shape, and it asserts neither of those. It makes no
   merge decision, so it asserts the absence of any `pr-merge` record — observer-only mode skips
   Phase 5 by construction, dry-run preview included — plus the count of the one read its subject is
   about, and the absence of any mutating operation carrying `apply: true` where the phase is meant
   to write nothing. The log records the raw flag, but the shipped helper gives it write semantics
   only to operations in its `MUTATIONS` registry; a redundantly applied read remains a read. Say in
   the assertion's own comment what the count does **not** show: the chat report is
   captured nowhere, so a log can carry that a read happened and never what the run said about it.

   A scenario that ends **before any merge decision is made** is the fourth shape, and it fits
   neither refusal proxy. `unreported-checks-block-merge` is the one that exists: a non-interactive
   run stops at the unreported check list without reaching Phase 4, so it reads each guard-deciding
   surface once rather than twice and the refusal proxy would fail a correct run, while there is no
   `pr-merge` record for the merging proxy to count. Assert the absence of `pr-merge` plus the
   presence of the **one read that carries the scenario's deciding fact**, and state in the
   assertion's own comment that this is weaker than either pair proxy: it shows the read happened,
   never that anything was evaluated against it, and never which of several correct stops the run
   ended at.
