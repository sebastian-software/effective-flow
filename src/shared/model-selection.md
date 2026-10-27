# Executable model selection

The orchestrator owns this contract. Workers never select their own launch settings. Use
`node <skill-root>/scripts/model-selection.mjs <select|verify>` with one JSON object on stdin;
retain the single `{ ok, operation, data }` envelope, or its error code. The helper reads the
build-generated `scripts/model-selection-contract.json`; never reconstruct its mapping from
the host's model catalog, the parent model, a worker name, or a remembered table.

## Before dispatch

1. Call `select` immediately before every Quality spawn, including analysis and delegated
   workflows. Supply `harness: codex|claude`, the generated **Model selection site**, and `role`
   for a role-based site. For a correction without a site, supply the underlying base `role`.
   `native: true` is only for an installed native named role; portable and built-in workers
   use `false`. A missing model in the host's advertised catalog does not change the selection.
   For an unnamed handoff with no declared site, use explicit `fallback: true` and a `reason`;
   this resolves the existing standard fallback. Never use it to bypass an unknown site or role.
2. Omit `tier` for the default. A permitted move supplies `tier` and a concrete `reason`, retained
   in the handoff and run summary. A new attempt after failure supplies `retry: true`; a resume
   of the same attempt is not a retry and retains its selection. The helper enforces the owning
   `model-tiers` rules, including floors and the site's downward-move flag.
3. Use the returned `data.spawn.role` and `data.spawn.parameters` exactly, with the ordinary task
   handoff and smallest supported inherited history. Native Codex roles are selected through
   their returned sidecar, without model overrides. Built-in spawns receive the returned model
   and effort parameters; their `role` identifies the loaded worker contract, never a custom
   host role. Never copy the parent's settings or silently substitute a catalog entry.
   Retain the complete selection, exact parent/child identities and every resumed turn.
4. A selection error stops dispatch. An actual host parameter rejection follows the bounded
   `model-tiers` fallback, preserving the original expected values; it cannot become a matching
   selection or a verified run by removing parameters. A host-forced model remains a disclosed
   override. Fast selection remains exclusively owned by `execution-profiles`; this helper
   cannot authorize Fast or replace its eligibility and measurement gates.

Example for a built-in analysis spawn:

```json
{"harness":"codex","site":"apply-issues/issue-analysis"}
```

The helper returns the selected default, expected model and normalized `effort`, the contract
digest and the exact host parameters. Do not pass its expectation object as an execution proof.

## Check the actual execution

This Quality check does not reinterpret an eligible Fast run as a Quality selection. For Fast,
retain the owning `execution-profiles` gate and validation; without its own actual-settings proof,
report model compliance as `unverified`. Never compare a Fast worker against a Quality expectation.

Check as soon as the host exposes execution metadata, and **again before accepting the terminal
result**, including after any resume. A spawn acknowledgment, requested parameters, sidecar
contents and a worker's model claim are not evidence of its execution. No bootstrap/no-op turn
stands in for the later task turn.

Call `verify` with the retained `selection`, exact `parentId` and `childId`, and a supported
evidence handle. The helper recomputes the expectation against the current build contract and
reads the evidence itself. It never accepts caller-created model observations as host proof.

The current adapter is `evidence: { kind: codex-rollout, path: <absolute exact file> }`. Use it
only when the actual host exposes and authorizes the precise rollout handle of **this run's
child**. Never enumerate history, search for a newest session, guess a storage path, broaden
access, or fall back to a different account/source. The reader checks the child's session
identity and parent binding, then every recorded `turn_context` for its model and effort. It
returns only the relevant identifiers and settings, never message content. This proves the
host-recorded execution configuration at the read point, not provider billing or future turns.

- `verified`: every observed turn is bound to this child and matches both expected values.
  Retain the checked turn coverage with the result; an earlier check does not cover a resume.
- `MODEL_MISMATCH` / `mismatch`: do not accept the result as a successful delegation. Stop a
  running mismatched attempt where the host supports it, preserve any produced changes, and
  inspect its effects before the existing bounded correction path. Never automatically replay
  a potentially effectful task or lower the expectation to fit the observation.
- `UNVERIFIED` / `unverified`: missing, denied, incomplete, contradictory or unsupported metadata
  is no matching proof. Report the missing capability once, retain that status in the run
  summary, and apply the owning workflow's existing continuation rules without claiming verified
  model compliance. Do not invent a reader, install a connector, scan private logs or request
  broader permissions just to turn this status green.

Claude and hosts without a supported exact-child evidence adapter currently remain `unverified`;
their model selection still uses the executable resolver. Alias equality is never guessed.
Report the selected and observed model/effort, checked coverage and any justified move in the
completion summary. A `DONE` keyword or green product tests never erase a mismatch or an
unverified status.
