## Plan references

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default `docs/plan`).

When the user references an existing plan file on invocation — for example `<plan.dir>/2024-06-01-feature.md`, `2024-06-01-feature.md`, `0030` (legacy number), or `feature` (title slug) — check the plan before the first substantive workflow phase.

### Resolve the reference

1. Resolve the reference to exactly one file under `<plan.dir>/` **or** `<plan.dir>/archive/`.
2. Permitted forms:
   - full path, e.g. `<plan.dir>/2024-06-01-feature.md` or `<plan.dir>/archive/2024-06-01-feature.md`
   - date-slug file name, e.g. `2024-06-01-feature.md`
   - legacy number, e.g. `0030` (resolved primarily via the H1 `# 0030: …`, see `Plan file convention`, not via the file name segment)
   - title slug, e.g. `feature`
3. If no file matches: report the error and note that `$effective-flow open-plans` can list open plans.
4. If multiple files match: ask the user for the specific file.

### Check the status

1. Read the plan file fresh from the file system.
2. Determine the implementation status according to the plan status convention: exactly one line with the prefix `**Planungsstatus:**` or `**Plan status:**` and a valid value; if the status line is missing, duplicated, or invalid, the status is unclear.
3. Status rules (both marker languages are equivalent):
   - exactly one status line `**Planungsstatus:** Nicht umgesetzt` or `**Plan status:** Not implemented` → the plan can be used as a basis.
   - exactly one status line `**Planungsstatus:** Umgesetzt` or `**Plan status:** Implemented` → ask the user whether the plan should be implemented again, only checked, or whether the workflow should be aborted.
   - missing or contradictory status → check whether `## Test results` or `## Review findings` are present. If so, treat the plan as probably implemented and ask. If not, ask whether the plan should be used as an unbuilt specification.

### Check the workflow recommendation

1. Check whether a line `**Empfohlener Workflow:** ...` is present in the header.
2. Determine the recommendation:
   - Feature or `$effective-flow build` → `$effective-flow build`
   - Bugfix or `$effective-flow fix` → `$effective-flow fix`
   - Refactoring or `$effective-flow refactor` → `$effective-flow refactor`
   - Documentation or `$effective-flow docs` → `$effective-flow docs`
3. If the current skill is ``tools/apply-plan.md``: use the recommendation as the target workflow and continue.
4. If the recommendation matches the current workflow: continue.
5. If the recommendation points to a different workflow:
   - emit a clearly visible message stating which workflow is recommended
   - only ask to continue if the user explicitly wants to use the plan with the current workflow anyway
6. If the recommendation is missing or unclear: continue after the status check, but point out the missing or unclear recommendation.

### Check open points

The check for open or unclarified points is handled by the "clarification gate"
(`apply-clarity-gate.md`), which the implementing workflows and the apply chain themselves
embed. This reference rule does not duplicate that check separately.

### After a successful check

- Use the contents of the plan file as the agreed basis for the current workflow.
- Record in the wisdom file which plan file is the source and which workflow recommendation it contains.
- The status update to completed happens only at the completion of the implementing workflow and preserves the marker language: a German marker becomes `**Planungsstatus:** Umgesetzt`, an English marker becomes `**Plan status:** Implemented`.
