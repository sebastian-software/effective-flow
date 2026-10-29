## Plan references

`<plan.dir>` is the plan directory from the Effective Flow configuration (project-setup ADR) `plan.dir` (default `docs/plan`).

When the user references an existing plan file on invocation, check the plan before the first substantive workflow phase.

### Resolve the reference

Run `node <skill-root>/scripts/effective-flow-mechanics.mjs plan-reference-resolve` with one JSON
object on stdin (`cwd` the root `plan.dir` resolves against: the checkout root, or
`RUNTIME_STATE_ROOT` in hidden mode; `planDir` the configured `plan.dir`; `reference` the argument).
**Fail closed:** a nonzero exit, an unparsable envelope or `ok: false` stops the run, naming the
error code. Report a true `data.archiveIgnored` (unsafe archive, unsearched). Outcomes:

- `resolved`: the plan is `data.path`; `data.exact` is true for a path or file-name reference.
- `ambiguous`: ask the user which of `data.candidates` is meant; never pick one heuristically.
- `not-found`, or `outside-plan-dir` (a path outside `<plan.dir>/` and its archive): report the
  error and note that `{{SKILL:open-plans}}` can list open plans.

### Check the status

1. Read the plan file fresh from the file system.
2. Determine the implementation status according to the plan status convention: exactly one line outside fenced code blocks that begins with the prefix `**Planungsstatus:**` or `**Plan status:**` and has a valid value; if the status line is missing, duplicated, or invalid, the status is unclear.
3. Status rules (both marker languages are equivalent):
   - exactly one status line `**Planungsstatus:** Nicht umgesetzt` or `**Plan status:** Not implemented` → the plan can be used as a basis.
   - exactly one status line `**Planungsstatus:** Umgesetzt` or `**Plan status:** Implemented` → ask the user whether the plan should be implemented again, only checked, or whether the workflow should be aborted.
   - missing or contradictory status → check whether `## Testergebnisse` / `## Test results` or
     `## Review-Befunde` / `## Review findings` are present. If so, treat the plan as probably
     implemented and ask. If not, ask whether the plan should be used as an unbuilt specification.

### Check the workflow recommendation

1. Check whether exactly one canonical line `**Empfohlener Workflow:** ...` or
   `**Recommended workflow:** ...` is present in the header. It must match the language of the
   complete plan; a mixed header makes the language unclear.
2. Determine the recommendation:
   - Feature or `{{SKILL:build}}` → `{{SKILL:build}}`
   - Bugfix or `{{SKILL:fix}}` → `{{SKILL:fix}}`
   - Refactoring or `{{SKILL:refactor}}` → `{{SKILL:refactor}}`
   - Documentation or `{{SKILL:docs}}` → `{{SKILL:docs}}`
3. If the current skill is `{{SKILL:apply-plan}}`: use the recommendation as the target workflow and continue.
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
- The status update to completed happens only at the completion of the implementing workflow and
  preserves the complete plan language: a German plan becomes
  `**Planungsstatus:** Umgesetzt`, an English plan becomes `**Plan status:** Implemented`.
