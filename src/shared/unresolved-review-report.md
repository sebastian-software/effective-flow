## Open review-finding reports

When a workflow review produces findings that are not fixed directly before completion, write these open findings additionally into a review-report file under `.effective-flow/review/`.

Goal:

- Open or deliberately unimplemented findings do not get lost in long plan files.
- `{{SKILL:apply-review}}` can process the findings later in the familiar report format.
- The plan file stays completion documentation and only points to the external report.

Applies to findings with status (canonical report tokens stay in the report's language; the
current `{{SKILL:review}}` format is German):

- `Offen`
- `Nicht umgesetzt`
- `Nicht umgesetzt (ADR: <slug>)` or comparable ADR statuses

Do not carry over into the external report:

- Findings with status `Behoben`
- Findings that were fixed directly during the workflow
- purely informational reviewer comments without a concrete recommendation

### Report path

1. Create `.effective-flow/review/` if needed.
2. If the workflow has a plan file as its basis, prefer:
   - `.effective-flow/review/review-report-YYYY-MM-DD-plan-<slug>.md`
   - on collision: `.effective-flow/review/review-report-YYYY-MM-DD-plan-<slug>-1.md`, `-2`, ...
3. If no plan file exists as a basis, use:
   - `.effective-flow/review/review-report-YYYY-MM-DD-WORKFLOW.md`
   - on collision: `.effective-flow/review/review-report-YYYY-MM-DD-WORKFLOW-1.md`, `-2`, ...
4. Always write the origin at the top of the report (canonical German header tokens, matched by
   the still-German `{{SKILL:review}}` format):
   - `**Ursprungsplan:** [path or "Keiner"]`
   - `**Quell-Workflow:** {{SKILL:build}} / {{SKILL:fix}} / {{SKILL:refactor}} / {{SKILL:maintain}}`
   - `**Quell-Review:** [reviewer skill or phase]`

### Finding IDs and memory

This report uses the same global finding IDs as `{{SKILL:review}}`.

1. Read `.effective-flow/memory.json`, if present.
2. If the file is missing, start with `lastFindingNumber: 0`.
3. Number new findings consecutively from `lastFindingNumber + 1` with seven digits, e.g. `R-0000021`.
4. After the report, write the highest assigned number back to `.effective-flow/memory.json`.
5. Preserve existing fields such as `configMigration` unchanged.
6. If memory cannot be written, inform the user and name the report path anyway.

### Report format

Use the canonical report format from `{{SKILL:review}}` section "Report format". Do not duplicate the template here and do not deviate from it.

Additional header fields for workflow reports:

- Directly below `**Projekt-Typ:** ...` set these three lines:
  - `**Ursprungsplan:** [<plan.dir>/YYYY-MM-DD-<slug>.md or Keiner]` (`<plan.dir>` is the plan directory from `plan.dir` of the Effective Flow configuration/project-setup ADR, default `docs/plan`)
  - `**Quell-Workflow:** [{{SKILL:build}} / {{SKILL:fix}} / {{SKILL:refactor}} / {{SKILL:maintain}}]`
  - `**Quell-Review:** [reviewer or phase]`
- All tables and finding blocks stay in the `{{SKILL:review}}` format.
- The `## Übersprungene Findings (Designentscheidungen)` section is only emitted when such findings are present.

Rules:

- Critical findings may only remain in this report if the user has explicitly decided to complete the workflow despite an open critical finding.
- Determine the action as in `{{SKILL:review}}`: defect → `{{SKILL:fix}}`, structural problem → `{{SKILL:refactor}}`, missing functionality or safeguard → `{{SKILL:build}}`, pure documentation gap → `{{SKILL:docs}}`.
- Never enter anything automatically in `Entwickler-Anmerkung`. This field is reserved exclusively for the developer's manual notes and stays empty in automatically generated reports. When a finding was deliberately not implemented and an ADR exists, note the ADR reference in the `Status` via slug, e.g. `Nicht umgesetzt (ADR: <slug>)`.
- After writing, output the report path to the user.
