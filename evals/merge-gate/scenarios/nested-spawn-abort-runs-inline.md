# Scenario: `nested-spawn-abort-runs-inline`

The delegated gate run **cannot spawn** – it has no spawn tool, or the host refuses its spawn call –
returns `ABORT nested-spawn-unavailable`, and the caller runs the gate inline.

The delegated run is a sub-agent that starts sub-agents of its own: the `iterate` round, the
conflict resolver and the code validator. A host that withholds a spawn tool from a spawned agent,
or keeps the tool and refuses the call at its depth limit, would leave it unable to delegate
anything, so "Entry" step 7 of the delegated run starts one no-op child before Phase 1 and before any
write, and returns `ABORT nested-spawn-unavailable` when there is no spawn tool or the probe is
refused or fails.
The caller then says once that the gate runs inline in this session and runs it there, skipping
"Entry", with its own run state and Phase-0 results. This scenario observes that fallback.

**Its distinguishing fact is a host condition, not a fixture fact.** The fixture is
[`merge-proceeds`](merge-proceeds.md) with only its name and description changed, the configuration
is the shared one, and the prompt is the `merge-proceeds` prompt. What differs is how the host
launches this scenario's slots: no agent the session spawns can spawn – the host offers it no spawn
tool or refuses its spawn call (for the Codex CLI, `-c agents.max_depth=1`) – while the session
itself keeps one. Every other slot of the round runs on a host whose
spawned agents can spawn, and the round attests that per-scenario depth with the
`nesting-by-scenario` tool-policy token. Prepare its slots with
`pnpm eval merge-gate prepare --scenario nested-spawn-abort-runs-inline` (or as part of the full
round) and the pinned profile flags (README, "Delegation scenarios and the host's nesting depth"),
then hand each slot's rendered prompt to a **fresh** agent — one that has not read this file.

## The prompt

Everything between the markers, and nothing else, is what the agent receives. The round renders
this template into each slot's `prompt.txt`, so hand over that file rather than this text. It is the
`merge-proceeds` prompt unchanged.

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

The prompt states no expectation and names neither the delegated run nor the host condition, so a
run that falls back correctly did so from the tool's own rules.

## Expected outcome — **not part of the prompt**

Written for a human reading a failed assertion. Nothing here is handed to the agent, and no
assertion reads it.

The caller resolves the reference, reads the pull request and probes the provider (Phase 0), then
dispatches the delegated run with `Run state: non-interactive`. The delegated run validates its
input lines, verifies its roots, re-reads the pull request and probes the provider again (Entry step
4), resolves `merge` from configuration (Entry step 5), finds it cannot start the probe child
(Entry step 7) and returns `ABORT nested-spawn-unavailable` having written nothing. The caller says once that the gate
runs inline, runs Phases 1 to 6 itself without repeating "Entry", finds every merge precondition
holding exactly as in `merge-proceeds`, and requests `pr-merge` twice: the dry-run preview, then
`--apply`.

The evaluator in `_scaffold/evaluate.mjs` reads the call log, and the assertions in
[`test/merge-gate-eval.test.mjs`](../../../test/merge-gate-eval.test.mjs) also read each run's
archived metadata:

- **a `pr-merge` record, exactly one of them applied** — the fallback completed the gate once. A
  caller that treats the abort as "Any other `ABORT`: report it" ends without a merge;
- **exactly two `probe` starts, both ahead of the first guard-surface read** — the caller's Phase 0
  and the delegated run's Entry re-read. One means nothing was dispatched, so the abort path was
  never reached; three or more mean the caller dispatched again after the abort or re-ran "Entry"
  inline;
- **the archived tool policy carries `nesting-by-scenario`** — the host condition the scenario is
  composed around, attested rather than observed.

That last point is the scenario's limit, and it has to be read as one. The call log records helper
calls, not which agent made them, so a delegated run that ignored its probe and completed the gate
itself leaves exactly the log this scenario expects, and so does a host that, despite the token,
still let the spawned agent spawn. What separates them is the host condition alone. Its
attestation is checked; whether the host really stopped the spawn is the recorder's responsibility,
and the README says how to establish it before the round. The inline line the caller says reaches
no file either.
