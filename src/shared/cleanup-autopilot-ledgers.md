## Autopilot run ledgers in cleanup

Autopilot run ledgers (`.effective-flow/autopilot/<run-id>/`, the run's `run.json` and its
`appendix.md`) are a fourth class. A ledger is removable only when its run is closed and either
produced no pull request or its pull request is merged or closed; an open run, an open pull
request and a pull request whose state cannot be read keep it. Age never decides. A run that
left a plan pull request unchanged (`plan-pull-request-unchanged`) records that pull
request, so it is kept while that pull request is open.

- **Inventory (Phase 1 step 4):** call
  `node <skill-root>/scripts/autopilot.mjs ledger-list <<< '{"cwd":"<RUNTIME_STATE_ROOT>"}'`.
  `removal: "removable"` (a closed run without a pull request) is a candidate. For
  `needs-pull-request-state`, read the pull request with the remote helper's `pr-read`
  (`{cwd: <RUNTIME_STATE_ROOT>, number}`) and keep its `data.result.state`: `merged` or `closed`
  makes a candidate, `open` keeps it. A missing CLI, failed authentication, an unreachable forge
  or any failed read records `unavailable` and keeps the ledger with the reason
  `forge-unavailable`. Every other run (`run-open`, `state: "invalid"`) is kept with its reason.
- **Dry run (Phase 4 step 7):** list candidates by run ID, outcome, pull request and reason; kept
  ledgers are listed with their reason and not offered.
- **Confirmation (Phase 5):** ask once for all listed candidates.

```ask
when: there is at least one autopilot-ledger removal candidate
header: Ledgers
question: Remove the autopilot run ledgers listed in the dry run, whose runs are closed and left no open pull request?
options:
  - label: Remove all listed
    description: Remove every listed ledger that still qualifies when it is checked again
  - label: Keep all
    description: Remove no ledger; each stays for a later cleanup run
```

- **Execution (Phase 5):** send the confirmed runs (at most 64) in one call
  `node <skill-root>/scripts/autopilot.mjs ledger-prune <<< '{"cwd":"<RUNTIME_STATE_ROOT>","runs":[{"runId":"<run-id>","pullRequestState":"<state>","pullRequest":<number>}]}'`,
  with the `pr-read` state from the dry run and the pull-request number `ledger-list` reported
  (both omitted for a run without a pull request). The helper re-reads each ledger and removes its
  directory only while the rule still holds (`removed`); a `retained` item names its reason
  (`run-open`, `pull-request-open`, `pull-request-mismatch`, `forge-unavailable`,
  `unexpected-entry`, `ledger-invalid`) and stays.
