## Open review-finding reports

When a workflow review produces findings that are not fixed directly before completion, write these open findings additionally into a review-report file under `.effective-flow/review/`.

Goal:

- Open or deliberately unimplemented findings do not get lost in long plan files.
- ``tools/apply-review.md`` can process the findings later in the familiar report format.
- The plan file stays completion documentation and only points to the external report.

Applies to findings with the matching status from either complete report language:

- English: `Open`, `Not implemented`, or `Not implemented (ADR: <slug>)`
- German: `Offen`, `Nicht umgesetzt`, or `Nicht umgesetzt (ADR: <slug>)`

Treat each English/German pair as the same semantic state when filtering or handing findings
between phases. Writers use only the values matching the complete report language; readers keep
both forms readable.

Do not carry over into the external report:

- Findings with status `Fixed` (English) or `Behoben` (German); legacy German `Umgesetzt` remains
  readable as the same completed state
- Findings that were fixed directly during the workflow
- purely informational reviewer comments without a concrete recommendation

### Report path

Resolve and revalidate the main-checkout `RUNTIME_STATE_ROOT` before any report lookup. All
directory existence checks, collision checks, report creation, and memory reads/writes use
absolute handles below that root; never inspect or fall back to a same-named path below
`EXECUTION_ROOT`.

If `<RUNTIME_STATE_ROOT>/.effective-flow/` is missing, apply the owning workflow's loaded
“Runtime-state write safety” contract from `RUNTIME_STATE_ROOT` to the exact directory
`.effective-flow/` immediately before its `mkdir`. If the review directory is missing,
separately apply it to that exact directory immediately before its `mkdir`. Apply the contract
again to the concrete absolute report handle immediately before writing the report and to the
absolute `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle as required by the loaded
“Shared memory-state mutation” contract. A blocked target remains unchanged.

1. Create `<RUNTIME_STATE_ROOT>/.effective-flow/review/` if needed.
2. If the workflow has a plan file as its basis, prefer:
   - `.effective-flow/review/review-report-YYYY-MM-DD-plan-<slug>.md`
   - on collision: `.effective-flow/review/review-report-YYYY-MM-DD-plan-<slug>-1.md`, `-2`, ...
3. If no plan file exists as a basis, use:
   - `.effective-flow/review/review-report-YYYY-MM-DD-WORKFLOW.md`
   - on collision: `.effective-flow/review/review-report-YYYY-MM-DD-WORKFLOW-1.md`, `-2`, ...
4. Always write the origin at the top of the report using the complete report language:
   - English: `**Origin plan:**`, `**Source workflow:**`, `**Source review:**`
   - German: `**Ursprungsplan:**`, `**Quell-Workflow:**`, `**Quell-Review:**`
   - Keep paths, skill references, and `None`/`Keiner` display semantics mapped internally.

### Finding IDs and memory

This report uses the same global finding IDs as `effective-flow review`.

1. Finish confidence and design-decision filtering plus any applicable deduplication, then fix the
   ordered list of findings that the report will actually publish.
2. If the list is empty, publish no finding report and reserve no IDs.
3. Otherwise use “Shared memory-state mutation” against the absolute
   `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle to reserve the exact range for that
   list. Format the returned consecutive numbers with seven digits, e.g. `R-0000021`.
4. Only after the reservation is atomically persisted and the lock is released, publish the
   report with that fixed mapping. If reservation fails, publish nothing. If report publication
   then fails or is interrupted, report the error and leave the reserved IDs as permanent gaps;
   never roll back or reuse them.

### Report format

Resolve `language.workflow` and use the matching complete canonical report format from
`effective-flow review` section "Report format". Do not duplicate the template here. When appending to
an existing report, preserve its clearly recognizable report language.

Additional header fields for workflow reports:

- Directly below the matching project-type field, set the three matching English or German
  origin/source lines defined above. The plan path uses `<plan.dir>` from configuration.
- All tables and finding blocks stay in the `effective-flow review` format, with one additional
  report-language status field in every workflow finding:
  - English: `- **Status**: Fixed | Open | Not implemented`
  - German: `- **Status**: Behoben | Offen | Nicht umgesetzt`
- The `## Skipped findings (design decisions)` section is only emitted when such findings are present.

Rules:

- Critical findings may only remain in this report if the user has explicitly decided to complete the workflow despite an open critical finding.
- Determine the action as in `effective-flow review`: defect → `effective-flow fix`, structural problem → `effective-flow refactor`, missing functionality or safeguard → `effective-flow build`, pure documentation gap → `effective-flow docs`.
- Never enter anything automatically in `Developer note`. This field is reserved exclusively for
  the developer's manual notes and stays empty in automatically generated reports. When a finding
  was deliberately not implemented and an ADR exists, note the ADR reference in the matching
  report-language `Status`: `Not implemented (ADR: <slug>)` or
  `Nicht umgesetzt (ADR: <slug>)`.
- After writing, output the report path to the user.
