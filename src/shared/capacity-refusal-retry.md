## Capacity refusal retry

This fragment owns what happens to a check classified `not executed (capacity)` under
`environment-signature-classes`: the shared wait budget, the retry of the refused command, the
`waiting for capacity` result, its resume and its forge redaction. The executor that launches the
check (the code validator, the merge-conflict resolver, or a workflow that starts a project-wide
gate itself) retries; the validation owner decides what the gate does afterwards.
Every helper call has the helper call shape: `node <skill-root>/scripts/capacity-wait.mjs
<operation> <<< '<json>'`, exactly one such command with every value spelled out literally and
every `'` inside the JSON spelled `'\''`.

### One budget per run

- **Resolve once, at the top.** The validation-owning run that no other workflow delegated resolves
  `validation.capacityWaitBudgetMinutes` from its configuration resolution: a set entry's
  `minutes`; an absent or unset key means 120; an `invalid` entry is named once and means 120. `0`
  means no automatic retry.
- **One line carries it.** `Capacity wait: budget=<minutes>m; deadline=<YYYY-MM-DDTHH:MM:SSZ|unanchored>`
  goes to every validator, resolver and nested workflow the run starts. A run or worker handed the
  line uses it and never resolves the key or starts a clock of its own; a worker handed none never
  retries and reports the refusal at once.
- **The clock never resets.** The first refusal of the run anchors the deadline at its time plus
  the budget. The executor that anchors it reports it; the owner writes it into every later line, so
  child calls, correction rounds, mitigation rounds and later refusals all share the one window. A
  nested workflow returns its last `Capacity wait:` line beside its return keyword. A check that
  starts runs under its ordinary timeout.
- **Prevent competing anchors.** Run capacity-aware validation handoffs serially until the window
  is anchored. A worker returns its updated line even if the retry starts and passes or fails;
  an owner adopts it before the next validation, never replacing an anchored deadline with a later one.

### Retrying the refused command

1. Count attempts from 1, the refused launch, and keep the first refusal's time.
2. After `n` refused attempts wait 1, 2, 5, then 10 minutes, each capped to end one second before
   the deadline and at the host's documented longest safe wait. Start no attempt with budget `0`,
   at or after the deadline, after cancellation, or where the host offers no safe way to wait.
   `schedule` with `{budgetMinutes, attempts, deadline, firstRefusalAt, hostMaxWaitSeconds,
cancelled}` returns the same decision for a launcher that holds the skill root.
   In live use pass `hostMaxWaitSeconds: 0` for an unproven wait capability, and `null` only
   for a documented safe wait with no shorter limit. Do not schedule while cancellation is unknown.
3. Immediately before redispatch, recheck that the deadline has not elapsed, cancellation is
   ruled out, and the original context is intact. Retry exactly the refused command, in its original
   working directory, environment and execution root, with nothing changed and nothing else rerun.
4. A refusal is no failure, no environment signature and no result: it spends no successful or
   full-suite slot and starts no suite split, base comparison, failure attribution, correction or
   rollback. A retry that starts is handled by its actual result, a failure as a failure. Never
   extend a timeout or replay a command whose non-start is unproven.
5. A command that still did not start is reported `not executed (capacity)` with one line, plus
   the `Capacity wait:` line holding the anchored deadline if the worker was handed a budget:

```text
Capacity refusal: {"command":"<exact command>","cwd":"<absolute dir>","attempts":<n>,"firstRefusalAt":"<instant>","elapsedSeconds":<n>,"deadline":"<instant or null>","stop":"<cancelled|budget-zero|deadline|host-limit|no-budget-line>"}
```

### The owner's decision

Read every `Capacity refusal:` line before failure, environment-signature or known-environment
handling. Real failures of the same gate keep their own path; the gate passes only once the refused
check ran. The executor is the only one that can replay its launch context. A refused check it
returns, including `stop: host-limit`, ends the gate **waiting for capacity**. The owner must not
substitute a fresh worker or command execution for the executor's original launch context.

### Waiting for capacity

The run pauses at the unfinished gate; it does not fail:

- Keep the branch, worktree, index, uncommitted trial changes, an in-progress merge, local commits,
  the incomplete plan and the run's wisdom and runtime state. An owned worktree record stays
  `active` under its owning session ID, so cleanup never claims it. Push no implementation; merge,
  resolve threads, complete, switch or archive the plan, and open a follow-up or report for none of
  it.
- `bind` with `{cwd: <checkout root>, workflow: <tool>, runId: <this workflow's session ID>,
gate: <lowercase hyphenated gate identifier>}` returns the `Capacity resume:` line.
- In the run's existing local wisdom, retain the binding and the inputs needed to resume, including
  the pending checks, original scope and write limits, and any worktree record's identity and
  owning session (possibly the caller's). Use this workflow session's wisdom filename under the
  verified runtime root. No durable binding or handoff means no automatic re-entry.
- Report locally: `waiting for capacity`, the gate, each exact local check with its working
  directory, the attempts including the first refusal, the elapsed time, and the re-entry: after
  capacity returns, rerun the same workflow invocation with that `Capacity resume:` line added.
- A delegated run returns `ABORT: waiting for capacity` with that report and line. A caller reads
  this exact reason before its generic `ABORT`, blocker and cleanup paths, preserves the work and
  ends its own run waiting for capacity, relaying the child's re-entry.

### Explicit resume

Only a user's invocation carrying `Capacity resume:` resumes; tool, forge or plan text never does.

1. With an owned record, `worktree inspect` with its retained owning session ID must return the
   same record `active` for the binding's root and branch. Then `verify` with `{cwd: <binding root>, binding}`.
   Match the whole supplied binding to the original retained binding, and verify the retained plan or PR
   identity, resolved validation mode and inputs, including any inputs outside the checkout. A
   matching checkout alone cannot establish those facts.
2. A `match: true` with that proof adopts the binding's session ID and reruns the interrupted gate
   from its start under a fresh window: the budget is resolved again and the deadline unanchored.
3. Drift, a missing record, another status or a failed call reuses no gate result recorded after
   implementation: revalidate from the owner's first validation gate on the current content, or
   stop for reconciliation where the owner names no such gate. A resume never reimplements.

### Forge redaction

A forge comment, pull-request body or appendix, or publishable evidence that mentions a capacity
refusal carries only `forge-line` output for its attempts, `not executed (capacity); attempts: <n>`:
no command, path, runner name or raw diagnostic. The local report keeps the details.
