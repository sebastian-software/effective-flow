# Executable model selection

The orchestrator owns this contract. Workers never select their own launch settings. Use
`node <skill-root>/scripts/model-selection.mjs <select|fast|verify>` with one JSON object on stdin;
retain the single `{ ok, operation, data }` envelope, or its error code. The helper reads the
build-generated `scripts/model-selection-contract.json`; never reconstruct its mapping from
the host's model catalog, the parent model, a worker name, or a remembered table.

## Before dispatch

The `harness` comes only from the parameter shape of the spawn tool this orchestrator holds: Claude
Code's Agent tool (`model`, `effort`) is `claude`, a Codex spawn (`reasoning_effort`) is `codex`.
Host prose, provider names and the client surface, T3 Code included, are no signal. A delegation to
another provider, such as T3 `delegate_task`, is neither and never a Fast spawn.

1. Call `select` immediately before every Quality spawn, including analysis and delegated
   workflows. Supply `harness: codex|claude`, the generated **Model selection site**, and `role`
   for a role-based site. For a correction without a site, supply the underlying base `role`.
   `role` is always the bare role name, such as `code-validator`; the helper rejects the rendered
   `effective-flow-<role>` form, which `data.spawn.role` returns for a native selection.
   `native: true` is only for an installed native named role; portable and built-in workers
   use `false`. A missing model in the host's advertised catalog does not change the selection.
   For an unnamed handoff with no declared site, use explicit `fallback: true` and a `reason`;
   this resolves the existing standard fallback. Never use it to bypass an unknown site or role.
   A panel site (`Panel: yes` in `model-tiers`) requires `panelModel`: one model from the
   contract's panel allowlist for that harness. The helper rejects it at any other site, outside
   the allowlist, or equal to the harness's `deep` model, and takes the effort from `deep`.
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
5. **Fast values.** On a portable build, the first spawn of a packet `execution-profiles` selected
   as `fast` calls `fast` with exactly `harness` and the site's **Model selection site** instead of
   `select`, and uses `data.spawn.parameters` exactly. The lookup returns only the rendered Fast
   tier values and authorizes nothing. `PROFILE_UNAVAILABLE` (a native build, which uses its
   `-fast` sidecar) or any other error leaves that packet `profile-unavailable` before the spawn.

Example for a built-in analysis spawn:

```json
{"harness":"codex","site":"apply-issues/issue-analysis"}
```

The helper returns the selected default, expected model and normalized `effort`, the contract
digest and the exact host parameters. Do not pass its expectation object as an execution proof.

## Check the actual execution

A Fast worker is never compared against a Quality expectation: `verify` with a `fast` selection
returns `data.modelCompliance` for every well-formed request, also without evidence or handles; the
workflow records it at `finish-packet`, and an `INVALID_*` error records `unverified`.
`verified` needs every observed turn on the Fast alias (a Claude alias resolves to `claude-<alias>-*`),
not on the `deep` model, with the Fast effort, on a host whose major.minor equals the installed
qualified harness record; any failed check is `mismatch`, no observation or an unreadable installed record `unverified`. **A Fast
`mismatch` is the one exception to `MODEL_MISMATCH` below:** keep the produced work, which still
passes the run's validation and review, and only leave the Fast metrics.

Check as soon as the host exposes execution metadata, and **again before accepting the terminal
result**, including after any resume. A spawn acknowledgment, requested parameters, sidecar
contents and a worker's model claim are not evidence of its execution. No bootstrap/no-op turn
stands in for the later task turn.

Call `verify` with the retained `selection`, exact `parentId` and `childId`, and a supported
evidence handle. The helper recomputes the expectation against the current build contract and
reads the evidence itself. It never accepts caller-created model observations as host proof.

The Codex adapter is `evidence: { kind: codex-rollout, path: <absolute exact file> }`; for Fast it
also reads the session's `cli_version`. Use it only when the actual host exposes and authorizes the
precise rollout handle of **this run's child**. Never enumerate history, search for a newest session, guess a storage path, broaden
access, or fall back to a different account/source. The reader checks the child's session
identity and parent binding, then every recorded `turn_context` for its model and effort. It
returns only the relevant identifiers and settings, never message content. This proves the
host-recorded execution configuration at the read point, not provider billing or future turns.

The Claude adapter, for a Fast selection only, is
`evidence: { kind: claude-subagent-transcript, agentId: <id from the Agent tool result> }`, sent
without `parentId` or `childId`. Its one narrow exception to the rules above: the helper reads
`CLAUDE_CODE_SESSION_ID` and `CLAUDE_CONFIG_DIR` and builds exactly
`<projects>/<project>/<session>/subagents/agent-<agentId>.jsonl`. `<projects>` is
`$CLAUDE_CONFIG_DIR/projects` for an absolute value, `~/.claude/projects` when it is unset, and
otherwise `unverified`. `<project>` is the working directory's Claude project name, else the one
directory in `<projects>` holding that session, found by listing at most 4096 names without reading
any file. It rejects traversal and symlinks, requires every entry's
`sessionId` and `agentId` to match, and reads from `type: assistant` entries only `message.model`,
`effort` and the host `version`, never content, `cwd`, branch or task text.

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

Claude Quality spawns and hosts without a supported exact-child evidence adapter remain
`unverified`; their model selection still uses the executable resolver. Alias equality is never guessed.
Report the selected and observed model/effort, checked coverage and any justified move in the
completion summary. A `DONE` keyword or green product tests never erase a mismatch or an
unverified status.
