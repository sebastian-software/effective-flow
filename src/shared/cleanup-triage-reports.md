## Triage reports in cleanup

Finished triage reports (`.effective-flow/triage/reports/<runId>.md`) are a sixth class. They are
private runtime data holding third-party logins and permission flags. A report is finished once
its run has removed its snapshot directory (`.effective-flow/triage/snapshots/<runId>/`); a present
snapshot means a run in progress and keeps its report. Age never decides. Snapshots, overlap
indexes and triage input files are not part of this class: each `triage` run removes its own, and
leftovers go through that tool's stale cleanup.

- **Inventory (Phase 1 step 4):** call
  `node <skill-root>/scripts/triage.mjs report-list <<< '{"runtimeStateRoot":"<RUNTIME_STATE_ROOT>"}'`.
  A report with `finished: true` is a candidate; `finished: false` is kept as `run-in-progress`. A
  call that is not `ok` (an unexpected entry in the report directory) offers none and reports the
  error.
- **Dry run (Phase 4 step 7):** list candidates by run ID and path; kept reports with their reason,
  not offered.
- **Confirmation (Phase 5):** ask once for all listed candidates.

```ask
when: there is at least one finished triage report listed as a removal candidate
header: Reports
question: Remove the finished triage reports listed in the dry run? They hold third-party logins and permission flags, and removal is irreversible.
options:
  - label: Remove all listed
    description: Remove every listed report whose run is still finished when it is checked again
  - label: Keep all
    description: Remove no report; each stays for a later cleanup run
```

- **Execution (Phase 5):** send the confirmed run IDs (at most 64) in one call
  `node <skill-root>/scripts/triage.mjs report-prune <<< '{"runtimeStateRoot":"<RUNTIME_STATE_ROOT>","runIds":["<runId>"]}'`.
  The helper re-checks each report and removes only `<runId>.md` while its snapshot is still absent
  (`removed`); `run-in-progress` and `absent` reports stay (`kept` with `reason`). Remove a triage
  report only through `report-prune`.
