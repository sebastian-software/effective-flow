# Behavioural evals for `merge-gate`

A behavioural safety net for `src/tools/merge-gate.md`, run deliberately rather than in CI. It exists
because every other assertion guarding that file checks its **text**: a restructure can move a
fail-closed rule out of reach of the run and the whole suite still passes, because the wording is
present somewhere. This layer asserts the opposite kind of thing — that a merge which should be
blocked is observed to be blocked.

The plan behind it is
[`docs/plan/2026-09-02-merge-gate-behavioural-evals.md`](../../docs/plan/2026-09-02-merge-gate-behavioural-evals.md).

## What is here today

Work packages 1 and 2 of that plan: the mechanism, proven on one scenario, plus the fidelity test
that keeps the fixtures honest.

| Path                               | What it is                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| `guard-blocks-merge/case.yaml`     | The one scenario: an active human-comment guard must produce no merge                   |
| `guard-blocks-merge/graders/*.md`  | Four deterministic graders — `tool_used` and `regex` only                               |
| `guard-blocks-merge/scaffold.sh`   | What `context.scaffold_script` names; hands off to `_scaffold/scaffold.mjs`             |
| `_scaffold/scaffold.mjs`           | Provisions the sandbox: skill root, stub helper, project-setup ADR, temp Git repository |
| `_scaffold/remote-tracker.mjs`     | The canned-envelope stub standing in for the shipped helper                             |
| `fixtures/guard-blocks-merge.json` | The scenario's envelope set, with the provider payload each envelope came from          |

The fidelity test that proves those envelopes real lives in the ordinary unit suite, at
[`test/eval-fixture-fidelity.test.mjs`](../../test/eval-fixture-fidelity.test.mjs), and runs under
`pnpm test`. The default `test` script does not invoke the eval harness and must not start to.

## The scenario

One unresolved review thread was written by `casey-reviewer`, a plain user account that is neither a
configured bot nor the account the gate runs as. Under the gate's own guard rules that item counts
as human, so the human-comment guard is active, Phase 4 fails on condition 4, and the run ends with a
report.

Everything else is composed to be satisfied, so the assertion isolates the guard rather than making a
statement about the gate as a whole: checks green and reported, mergeable, not a draft, a
Conventional-Commit pull-request title, `mergeGate.completion: merge`, and an empty `mergeGate.bots`
list — which satisfies merge preconditions 5 and 7 by construction. The top-level comment in the
fixture is authored by the viewer login, so guard rule 2 excludes it and the thread is the only thing
holding the guard.

The observable is the **absence** of a `pr-merge` invocation in the run trace. Because that alone
would pass on a run that crashed or never started the gate, two further graders assert positive
evidence that the gate ran and reached its decision: the status read happened, and the gate's own
source was loaded out of the scaffolded skill root.

## What this deliberately does not cover

- **WP3 to WP6 of the plan are not built.** The guard's three ordered rules across its three counting
  surfaces, merge preconditions 1/2/3/8/9, the fail-closed input enumeration, the round bound, and
  Phase 5.5 entry reachability are all still to come. One scenario is a proven mechanism, not a net.
- **There is no scenario yet in which the gate merges.** The plan requires one, so a blanket-refusal
  regression cannot show as a green suite. Until it exists, a green result here is weaker than it
  looks.
- **Conditions 6, 7 and 10 are out of scope end to end**, per the plan: they are evaluated against
  identifiers the gate mints at run time, which a fixture cannot carry. Their fail-closed halves
  belong to WP5.
- **Codex execution is unexercised.** Codex has no `eval` subcommand and no comparable harness. Both
  targets are built from one source and carry identical rules, so what stays untested is the Codex
  **execution**, not the rule. This is a named residual, not a gap to be closed by weakening anything
  here.
- **The suite is not in CI**, which has neither the credentials nor a cost budget for it. What makes
  it binding is evidence instead: every pull request of the deferral round carries the suite's
  output — date, commit, per-case pass rate — in its body.

## Running it

`claude plugin eval` is in **early access**. On an installation where it is not enabled, every
subcommand answers `` `plugin eval` is currently in early access `` and writes nothing, so the suite
cannot run at all until that is turned on for the account.

The suite needs a current build, because the scaffold copies `dist/portable/effective-flow/` into the
sandbox and refuses rather than building silently:

```sh
node build.mjs
pnpm eval:merge-gate
```

`pnpm eval:merge-gate` expands to the invocation below. Run it by hand when you want to change the
budget or the case filter.

```sh
claude plugin eval . \
  --case guard-blocks-merge \
  --runs 5 \
  --threshold 1.0 \
  --scaffold \
  --allow-tools Bash Write Edit \
  --max-cost-usd 20 \
  --report ./evals/results/guard-blocks-merge.html
```

The target is the repository root, not `./evals`: the harness walks the topmost `evals/` directory
**under** the path it is given. `--allow-tools` names only the gated tools — `Bash`, `Write`, `Edit`
— while the case's own `execution.allowed_tools` carries the full list. Ablation defaults to `none`
for a path target, which is what this suite wants: there is no baseline arm to pay for, and no
`baseline` grader to feed.

`--threshold 1.0` is the harness default and is stated anyway, because it is a decision rather than
an inherited value: for a fail-closed rule anything below a 5-of-5 pass rate is a finding, not
variance. A rate below 1.0 is investigated; it is never accommodated by lowering the threshold, and
where the suite's cost has to come down the **scenario count** gives way instead of the runs per
case.

### Measure the cost before you commit to five runs

A gate run loads a 3125-line tool — about 250 KB, roughly 62k tokens — before it does anything, and
then carries that context across every turn. **Nothing here has been executed yet**, so the numbers
below are an estimate from that payload and not a measurement:

|                    | Sonnet-class model | Opus-class model |
| ------------------ | ------------------ | ---------------- |
| one run            | ~$1 to $3          | ~$5 to $15       |
| the case at 5 runs | ~$5 to $15         | ~$25 to $75      |

The spread is wide because it turns on how much of the loaded gate is served from the prompt cache
and on how many turns the run takes, and neither is known until a run happens. So make the **first**
paid execution a single run with a tight ceiling, read the reported cost, and only then decide about
five:

```sh
node build.mjs
claude plugin eval . --case guard-blocks-merge --runs 1 --scaffold \
  --allow-tools Bash Write Edit --max-cost-usd 5 --verbose \
  --json ./evals/results/probe.json
```

That probe is also WP1's evidence: `--verbose` streams the trace, so it answers the questions the
plan could not settle by reading — whether the scaffolded skill root resolves, whether the run
reaches the stub instead of the shipped helper, and whether the trace distinguishes a merge call
from its absence. If the stub is not reached, or the trace cannot make that distinction, the plan
says to stop and report rather than continue.

### `--scaffold` runs author-supplied bash as you

The flag is off by default, and the harness's own help says it "runs author-supplied bash as you" —
outside the sandbox, with your environment and your credentials. The suite cannot provision its
sandbox without it, so it is in the invocation above deliberately. Do not enable it casually on eval
case files you did not write and have not read: for any suite, `context.scaffold_script` is arbitrary
code executed with your privileges. The script it runs here is
[`_scaffold/scaffold.mjs`](_scaffold/scaffold.mjs), and it writes only under
`/tmp/effective-flow-merge-gate-eval/`.

## How the stub works

The whole forge input surface of a gate run passes through one subprocess with a JSON-in/JSON-out
envelope, and the gate's prompt contract forbids it from assembling provider requests itself. So a
fake `scripts/remote-tracker.mjs` on the scaffolded skill root is a **complete** input stub: no
network, no `gh`, no `tea`, no recorded cassettes.

It dispatches on the operation name in `argv` and returns that operation's canned envelope from the
fixture. Two behaviours are load-bearing:

- **An undefined operation fails loudly**, naming the operation and the set the fixture does define.
  A silent default would let a scenario pass for the wrong reason — a gate that never merged because
  a read came back empty is not the same fact as a gate that refused on its guard.
- **`pr-merge` is recorded and refused**, ahead of the fixture lookup and for the dry run as well as
  `--apply`. The eval asserts the absence of that call, and a stub that silently succeeded a merge
  would mask exactly the regression this layer exists to catch. The refusal carries the marker string
  `EFFECTIVE_FLOW_EVAL_STUB_MERGE_REFUSED`, which `graders/no-merge-refused-marker.md` matches over
  the trace.

The sandbox lives at `/tmp/effective-flow-merge-gate-eval/<case>/` — a fixed absolute path, because
the case prompt has to name the skill root and the project checkout literally and cannot know where
the harness rooted the run. The stub finds its fixture and its call log relative to its own location,
so it needs no environment of its own; `EVAL_TRACKER_FIXTURE` and `EVAL_TRACKER_LOG` override both
and exist for the unit test.

## Adding a scenario

1. Write `fixtures/<case>.json`: `repository`, `probe`, and an `operations` map whose entries carry
   the `input`, the raw `provider` payload, and the `envelope`.
2. Derive the envelope from the real normalizer rather than writing it by hand — pipe the provider
   payload through `executeOperation` with a fake runner, exactly as the fidelity test does, and paste
   what comes out. `pnpm test` then proves it stayed real.
3. Add `<case>/case.yaml`, `<case>/scaffold.sh` (one line, naming the case), and `<case>/graders/*.md`.
4. Keep every grader deterministic. `llm` and `baseline` graders decide nothing about whether a merge
   was correctly refused — a safety gate's verdict must not itself be decided by a model judging
   prose.
