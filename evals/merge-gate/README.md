# Behavioural evals for `merge-gate`

A behavioural safety net for `src/tools/merge-gate.md`, run deliberately rather than in CI. It exists
because every other assertion guarding that file checks its **text**: a restructure can move a
fail-closed rule out of reach of the run and the whole suite still passes, because the wording is
present somewhere. This layer asserts the opposite kind of thing — that a merge which should be
blocked is observed to be blocked.

The plan behind it is `docs/plan/2026-09-02-merge-gate-behavioural-evals.md`. It is named rather than
linked because it is not tracked yet: #398 recorded two other untracked plans and not this one, so
the path resolves in no branch and a link from here would dangle. Make it a link once the plan is
committed.

## The design in one paragraph

**The stub's call log is the evidence.** A gate run's whole forge input surface passes through one
subprocess, so a fake `remote-tracker.mjs` on a scaffolded skill root sees everything the gate asks
for and writes one JSON line per call. What that run _did_ is therefore already on disk, and the
assertions are ordinary `node:test` cases over that file. There is no harness, no grader, no scoring
and no trace parsing — three of those exist only because a trace is the evidence, and here it is not.
**A run is started by handing a scenario's prompt to a fresh agent**, not by a script: the isolation
requirement is epistemic rather than technical, since a run started from a session that already knows
the expected outcome tests that session's memory instead of the instruction.

## What is here

| Path                           | What it is                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| `scenarios/<name>.md`          | One scenario: the prompt handed to a fresh agent, plus its expected outcome as prose        |
| `prepare.mjs`                  | Archives the previous run's log, re-scaffolds, prints the prompt. Starts nothing            |
| `_scaffold/scaffold.mjs`       | Provisions the sandbox: skill root, stub helper, project-setup ADR, temp Git repository     |
| `_scaffold/remote-tracker.mjs` | The canned-envelope stub standing in for the shipped helper, and the writer of the call log |
| `_scaffold/sandbox.mjs`        | The sandbox layout, shared by the scaffold and the preparation step                         |
| `fixtures/<name>.json`         | The scenario's envelope set, the provider payload each came from, and its merge opt-in      |
| `results/<name>/run-<n>.jsonl` | Archived call logs — the evidence the assertions read. Created by `prepare.mjs`             |

Two test files in the ordinary `pnpm test` suite belong to this layer:

- [`test/eval-fixture-fidelity.test.mjs`](../../test/eval-fixture-fidelity.test.mjs) proves every
  canned envelope is one the real `executeOperation` normalizer emits for the same provider payload,
  and pins the call log's record schema.
- [`test/merge-gate-eval.test.mjs`](../../test/merge-gate-eval.test.mjs) holds the scenario
  assertions over the archived logs.

Neither runs a model, and neither starts a gate run. `pnpm test` stays a pure file-and-transform
suite.

## Running a scenario

```sh
pnpm prepare:merge-gate-eval guard-blocks-merge   # build, archive, re-scaffold, print the prompt
pnpm prepare:merge-gate-eval merge-proceeds       # the merging counterpart, sandboxed separately
```

There is no separate build step: the scaffold runs `node build.mjs` itself, so the skill root it
copies is always the one the current sources produce.

Then hand the printed prompt — verbatim — to a **fresh agent**: a new session, with no knowledge of
this repository's expectations and no sight of the scenario file's expected outcome. Repeat
`prepare` and the run for as many runs as the scenario needs. Each `prepare` archives the log the
previous run left behind, so **run `prepare` once more after the last run** before asserting; that
final call also re-scaffolds and reprints the prompt, which costs nothing.

```sh
node --test test/merge-gate-eval.test.mjs         # or just pnpm test
```

The archived logs are the layer's evidence and are committed with it. They are what makes a claim
about the gate's behaviour checkable by someone who did not perform the runs.

### Cost is quota and wall-clock time

There is no per-run charge: this project runs on flat subscriptions. What a run consumes is
subscription quota and elapsed time, and the one measured run took roughly **five minutes**. Five
runs of one scenario is therefore about half an hour of wall clock, and the two scenarios that exist
today are about an hour between them — a scheduling question rather than a budget one. Where the
suite has to be shortened, the scenario count gives way — never the five-of-five requirement,
because for a fail-closed rule a single deviating run is a finding. The one scenario that never
gives way is the merging counterpart: without it the refusals prove less than they appear to.

### Four failure modes the assertions handle by name

- **A missing or empty log fails loudly and never counts as a refusal.** A run that never started
  produces no `pr-merge` record, which is indistinguishable from a correct refusal unless the
  emptiness is itself an error. It is.
- **With no archived runs at all, the assertions skip with a loud reason rather than passing.** They
  never report success for a scenario nobody ran. Skipping rather than failing is deliberate: a
  permanently red `pnpm test` in every checkout that has not spent quota on a run — CI included,
  which this layer deliberately stays out of — is ignored within a week, and would cost more evidence
  than it gathers. `node --test` prints the skip reason beside the test, and the pass count does not
  include it.
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
  judgement for that reason.
- **A call to an operation the shipped helper does not support at all passes.** The real helper
  refuses an unknown name with `INVALID_PAYLOAD: unknown operation: <name>`, so a run that guesses
  at an invented capability probe gets an error in the sandbox and would get an error in
  production too. Its behaviour is not distorted, and the rest of its log stays sound evidence.
  Failing those as well would discard complete rounds over a stray guess, and defining a fixture
  envelope for such a name would only make the sandbox diverge in the other direction. The
  supported set is derived from `src/scripts/remote-tracker-core.mjs` at assertion time rather than
  listed in the test, because a transcribed list is wrong the day an operation is added and that
  drift is the failure this layer exists to catch.

## What this deliberately does not cover

- **Two scenarios exist, and they are one pair.** A green suite proves that one refusal path holds
  and that the harness can reach a merge, and nothing about the breadth of the gate. WP3 to WP6 of
  the plan — the guard's three ordered rules across its three counting surfaces, merge preconditions
  1/2/3/8/9, the fail-closed input enumeration, the round bound, and Phase 5.5 entry reachability —
  are all still to come. Read a green result as a proven mechanism, not as a net.
- **No single log can prove a refusal was a decision.** A refusal is defined by absence, and a call
  log records calls rather than verdicts, so a run that died after the Phase-4 reads leaves the same
  log as a run that refused. `guard-blocks-merge` therefore proves only that no merge was requested
  and that those reads happened. What closes the gap is the positive control, not a stronger
  assertion: `merge-proceeds` is the same fixture with the blocking thread removed and asserts that
  `pr-merge` **is** present, so a blanket refusal — from a broken gate or a broken harness — fails
  the suite. Neither scenario carries the claim on its own.
- **Phase 5.5 entry is not exercised by the merging scenario.** The canned reads describe an open
  pull request and go on describing one after the merge, because the fixture is a fixed document
  rather than a model of forge state, so the fresh read that would confirm the merge does not. That
  is downstream of everything asserted — the `pr-merge` records are already written — and closing it
  needs a stateful stub, which is WP6's subject.
- **Conditions 6, 7 and 10 are out of scope end to end**, per the plan: they are evaluated against
  identifiers the gate mints at run time, which a fixture cannot carry. Their fail-closed halves
  belong to WP5.
- **Codex execution is unexercised.** Both targets are built from one source and carry identical
  rules, so what stays untested is the Codex **execution**, not the rule. With the log as the
  evidence, a later Codex driver would reuse the stub, the fixtures and every assertion unchanged.
  This is a named residual, not a gap to be closed by weakening anything here.
- **The suite is not in CI**, which has neither the credentials nor the quota for it. What makes it
  binding is evidence instead: every pull request of the deferral round carries the suite's output —
  date, commit, per-scenario run count and result — in its body.

## The sandbox

`prepare.mjs` calls `_scaffold/scaffold.mjs`, which wipes and re-provisions
`/tmp/effective-flow-merge-gate-eval/<scenario>/`:

| Under the sandbox | What it holds                                                                           |
| ----------------- | --------------------------------------------------------------------------------------- |
| `skill/`          | A copy of `dist/portable/effective-flow/`, with `scripts/remote-tracker.mjs` replaced   |
| `project/`        | A temp Git repository with the AGENTS.md marker, the project-setup ADR and a .gitignore |
| `fixture.json`    | The scenario's envelope set, where the stub looks for it                                |
| `trace/`          | Where the stub appends `tracker-calls.jsonl`                                            |

The path is a fixed absolute location because a scenario prompt has to name the skill root and the
project checkout literally and cannot know where the agent it is handed to was rooted. The scaffold
runs `node build.mjs` before it copies anything, and fails outright if the build does: a stale build
would scaffold a skill root that does not match the source under test, which is the one way this
suite could report a green result about code nobody is running. Building rather than checking is
deliberate — `dist/` is gitignored, so its presence proves only that somebody built at some point on
some revision, and a staleness check would have to model every input `build.mjs` reads and would be
wrong the moment one moved.

## How the stub works

The whole forge input surface of a gate run passes through one subprocess with a JSON-in/JSON-out
envelope, and the gate's prompt contract forbids it from assembling provider requests itself. So a
fake `scripts/remote-tracker.mjs` on the scaffolded skill root is a **complete** input stub: no
network, no `gh`, no `tea`, no recorded cassettes.

It dispatches on the operation name in `argv` and returns that operation's canned envelope from the
fixture. Three behaviours are load-bearing:

- **Every call is recorded**, as one JSON object per line: `seq`, `operation`, `apply`, `at`, `cwd`.
  `seq` starts at 1 and rises by one per call, derived from the lines already in the file because the
  stub is a fresh process per call; `at` is a millisecond timestamp and can collide, so it cannot
  carry ordering on its own. That record shape is a contract, pinned by
  `test/eval-fixture-fidelity.test.mjs`, because it is what every scenario assertion reads.
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

The stub finds its fixture and its call log relative to its own location, so it needs no environment
of its own; `EVAL_TRACKER_FIXTURE` and `EVAL_TRACKER_LOG` override both and exist for the unit tests.

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
   `envelope`, because the real helper answers the two modes differently.
3. Write `scenarios/<name>.md`: the prompt between the `<!-- prompt:start -->` and
   `<!-- prompt:end -->` markers as a single fenced block, and the expected outcome below it, marked
   plainly as **not part of the prompt**. The prompt must not state what the gate should conclude —
   that is what makes the run a test rather than a recitation.
4. Add the scenario's name to `SCENARIOS` in `test/merge-gate-eval.test.mjs`, which is what applies
   the shared assertions — the pinned log schema, the undefined-operation check and the five-of-five
   bar — to it. Then add its own outcome assertion. A refusal scenario asserts both that no
   `pr-merge` record exists **and** that the run reached Phase 4, so a crashed run cannot pass; a
   scenario in which the gate should merge asserts that a `pr-merge` record exists and that exactly
   one of them carries `apply: true`, since Phase 5 previews the merge before applying it.

   The Phase-4 half is a **proxy** and has to be read as one: the gate reads each guard-deciding
   surface once in Phase 1 and again in Phase 4, so a second read proves those reads happened —
   never that the evaluation concluded, and never which condition decided it. The log holds helper
   calls, not verdicts, and no assertion over one log can do better. What makes a refusal readable
   as a decision is the merging scenario beside it.
