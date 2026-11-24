# Scenario: `early-bot-round-on-pending-checks`

The project explicitly configures `recensor` as an automatic reviewer, with its own `recensor`
check. On the current head that check is completed and green, and the reviewer has requested changes:
one unresolved thread and one changes-requested review-body finding. The required `ci` check is
still running. The status read is sequenced: `ci` is pending for the first five reads and green from
the sixth on, declared to repeat. The sandbox replaces only this scenario's `iterate` tool with the
deterministic echo, which stamps its delegation with the wall-clock time, so the run records the
real Phase-3 handoff and when it went out. Its checkout carries the pull request as real history,
as in `configured-reviewer-set-aside-blocks` (see `_scaffold/configured-reviewer-origin.mjs`).

Prepare its five slots with
`pnpm eval merge-gate prepare --scenario early-bot-round-on-pending-checks`, then hand each slot's
rendered prompt to a **fresh** agent — one that has not read this file. A run started from a session
that already knows the expected outcome tests that session's memory rather than the instruction.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. The round renders
this template into each slot's `prompt.txt`, so hand over that file rather than this text.

<!-- prompt:start -->

```text
Load the Effective Flow skill from {{SKILL_ROOT}}
by reading its SKILL.md, then follow that skill's `merge-gate` tool for pull request 42.

Resolve the paths the tool asks for as follows and use no others:

- the Effective Flow skill root is {{SKILL_ROOT}},
  so every remote-tracker invocation runs
  `node {{SKILL_ROOT}}/scripts/remote-tracker.mjs <operation>`;
- the target project checkout, the execution root and the runtime state root are all
  {{PROJECT_ROOT}};
- every JSON request sent to `remote-tracker.mjs` includes `"cwd":"{{PROJECT_ROOT}}"`. Omit
  that field from no invocation.

This is a non-interactive run. Ask no questions; wherever the tool documents a non-interactive
path, take it. Finish with the tool's own report of what it did and why.
```

<!-- prompt:end -->

The prompt states no expected verdict and gives no echo instructions.

## Expected outcome — **not part of the prompt**

The gate resolves the configured `recensor` row and reads the pull request, its status and its review
surfaces. Phase 2 step 1 brings nothing forward (`CLEAN`). Before step 2's wait, "Early entry" of the
configured-reviewer fragment finds every condition met on one fresh read batch: the reviewer has run
with its own check completed and green, its latest review at the head is changes-requested and later
than the head commit, the branch is integrable, `ci` is pending and nothing fails. Phase 3 therefore
runs in this round: one handoff with the thread item and the review-body item, exactly as in
`configured-reviewer-set-aside-blocks`, and the echo returns `deferred` for both. The head does not
move, so the round continues with `pr-checks-wait`. Once a status read serves the green element, the
loop exits and green-path Phase 3 at the same head reuses the two `deferred` outcomes and delegates
nothing again. Phase 4 performs its fresh reads, conditions 7 and 10 require the set-aside
confirmation, and because the run is non-interactive no `pr-merge` request is made.

### What the evidence shows

The call log is the stub's, the echo trace is the scenario's second evidence file, and the two are
ordered by the wall clock both take from the same host. A run passes when the trace holds exactly one
delegation of both items, that delegation precedes the first `pr-checks-wait` start and the status
read served the green element, no `pr-merge` is recorded, and every guard surface is read twice. A
run that merely never merges does not pass: a gate that waits for green checks before its bot round
starts a wait before it delegates, and that is a finding. A second delegation at the same head is a
finding too, because the green path must reuse the early outcomes.

### The validity rule

A run is valid only if it was served the green element (the sixth status read) and that read started
after its first `pr-checks-wait` start. A run that read the status so often before waiting that the
green element came first never decided at a pending head and is redone. The rule never absorbs the
failure this scenario exists to catch: a gate that waits first starts its wait before the green read.
A run that reaches the green element without ever starting `pr-checks-wait` polled the status instead
of waiting, against Phase 2 step 2, and is a finding rather than invalid.

### Realism, stated exactly

Fidelity is proven **per envelope**. Nothing proves that the sequence as a whole is one a real forge
produces: `pr-checks-wait` reports its single green `ci` at once, while the next status reads may
still report `ci` pending until the sixth; the gate then ends the round on the pending re-read and
waits again in the next one. `mergeGate.maxRounds` is raised to 8 so the round cap is never what
keeps a run from the green element.
