# Tool reference: Understand what needs doing

This group covers analysis and planning – **before** any code is written. All four tools are
pure read phases or write exclusively to their designated stores
(`.effective-flow/investigation/`, `<plan.dir>/`, or an issue comment); none changes
source code, tests, or configuration.

`<plan.dir>` is the plan directory from `.effective-flow/config.json` → `plan.dir` (default
`docs/plan`, see [Configuration](configuration.md)).

## `/effective-flow investigate`

**Purpose:** Encapsulates a pure diagnostic phase for defects and surprising behavior. Clarifies
_why_ something behaves the way it does or where the root cause lies, and produces a diagnostic report
– without changing a single line of code. Unlike `plan` and `fix`, `investigate` may legitimately end
with "no defect, intended behavior" or "product decision required".

**When to use:** When it's unclear whether there's even a defect, or when the cause of
a symptom must first be understood before deciding which implementation workflow
fits.

**Typical call:** `/effective-flow investigate <symptom description>`

**Input/output:** Input is the description of the observed behavior. Output is
`.effective-flow/investigation/investigation-YYYY-MM-DD-<slug>.md` with symptom, reproduction,
root-cause hypotheses including confidence, discarded hypotheses, and exactly one
follow-up recommendation. Investigation reports are always local: they are never committed and never
tracked as an issue, not even in remote tracker mode.

**Interplay:** The recommendation routes to `/effective-flow fix` (defect with a clear cause),
`/effective-flow refactor` (structural problem without behavior change), `/effective-flow build` (missing
functionality or intentional behavior change), or `/effective-flow docs` (pure
documentation gap) – including a copy-paste-ready follow-up call that references the report path.

## `/effective-flow plan`

**Purpose:** Creates an implementable, validated implementation plan in `<plan.dir>/`,
without generating code or changing existing implementation files. Clarifies open questions
interactively with the user until a solid basis exists, and recommends the appropriate
implementation workflow (feature, bugfix, refactoring, or documentation).

**When to use:** Before a larger change is implemented while the requirement, its
acceptance criteria, or architecture decisions are not yet settled.

**Typical call:** `/effective-flow plan <requirement>`

**Input/output:** Input is the requirement in natural language. Output is
`<plan.dir>/YYYY-MM-DD-<slug>.md` with a status line (`**Planungsstatus:** Nicht umgesetzt` or
`**Plan status:** Not implemented`), recommended workflow, architecture decisions,
affected files, acceptance criteria, validation plan, and its own
plan review section. For documentation plans, the header adds `**Doc category:**` and
`**Target path:**` per the doc category convention.

**Interplay:** The finished plan is implemented later with `/effective-flow build <plan file>`,
`/effective-flow fix <plan file>`, `/effective-flow refactor <plan file>`, or `/effective-flow docs <plan file>`;
each of these tools first checks the plan file against the clarification gate. Optionally,
`plan` offers a deeper interactive plan review directly afterwards; if it is
skipped, it can be caught up later via `/effective-flow review <plan file>`.

## `/effective-flow open-plans`

**Purpose:** Lists all not-yet-implemented plan files from `<plan.dir>/` with a short
summary and checks the canonical plan-status marker in the process. Changes no files
and runs no tests, builds, or validations.

**When to use:** When resuming after a break, to see which plans are still open,
or as an overview before prioritizing.

**Typical call:** `/effective-flow open-plans`

**Input/output:** No input needed. Output is a table (plan, title, workflow,
doc category, path, short version) of the open plans, supplemented by a list of the plans with
unclear status (missing, multiple, or invalid status line).

**Interplay:** Pure read access as a springboard to `/effective-flow build`, `/effective-flow fix`,
`/effective-flow refactor`, `/effective-flow docs` (depending on the recommended workflow of the listed plans), or
`/effective-flow review <plan file>`.

## `/effective-flow plan-issue`

**Purpose:** Collects issues that `/effective-flow apply` (more precisely: the internal
issue implementation workflow) skipped due to missing information and marked with the label
`effective-flow-needs-planning`. Completes the planning per issue interactively following
the same clarification methodology as `/effective-flow plan` and writes the result as a structured
comment back to the issue. Produces neither code nor a plan file – the issue remains the
single source.

**When to use:** In remote tracker mode, when there are issues that still contain too little
information for an autonomous implementation.

**Typical call:** `/effective-flow plan-issue [issue reference(s)]`

**Input/output:** Without an argument, all open `effective-flow-needs-planning` issues are listed for
selection; with an argument, the handed-over issue references (number, `#123`, URL)
are used. Output is a comment on the issue with the completed requirement,
acceptance criteria, affected areas, and assumptions; afterwards the label
`effective-flow-needs-planning` is removed.

**Interplay:** This tool is inherently remote and always works against the
issue tracker of the `origin` remote (see [Remote tracker](remote-tracker.md)); the
`tracker.mode` switch does not apply here. Once complete, `/effective-flow apply` can implement the now-planned
issue.

## Further reading

- [Configuration](configuration.md) – `plan.dir`, `plan.markerLanguage`, and other defaults
- [Remote tracker](remote-tracker.md) – issue mode, labels, local vs. remote mode
- [Skill discovery](skill-discovery.md) – how these tools draw on host skills for analysis
- [Tools: Implement](tools-implement.md) – how plans, reports, and issues are implemented
