# Tool reference: Understand what needs doing

This group covers analysis and planning – **before** any code is written. The five tools either
read only or keep their writes within the designated planning surfaces
(`.effective-flow/investigation/`, `<concept.dir>/`, `<plan.dir>/`, issue comments and labels, or
approved native sub-issues); none changes source code, tests, or configuration.

`<plan.dir>` is the `plan.dir` value and `<concept.dir>` the `concept.dir` value from the
Effective Flow project-setup ADR (defaults `docs/plan` and `docs/concept`; see
[block `plan`](configuration.md#block-plan) and [block `concept`](configuration.md#block-concept)).

## `/effective-flow concept`

**Purpose:** Creates the concept for a **new application or program** – one step before an
implementation plan. The result is complete but deliberately shallow: problem, target users, the
central use cases, what the first version contains, what is explicitly excluded, and a coarse
technical direction. No work breakdown, no code, no plan file.

**When to use:** When it is not yet settled _what_ should be built at all. For a change to an
existing application, start with `/effective-flow plan` instead. The tool works in an empty
repository; existing code is read as context when it is there.

**Typical call:** `/effective-flow concept A scheduling app for volunteer fire brigades`

**Input/output:** Input is the product idea in free text. Output is
`<concept.dir>/YYYY-MM-DD-<slug>.md` with the status line `**Concept status:** Draft` (German:
`**Konzeptstatus:** Entwurf`), the sections problem, target users and use cases, solution sketch,
scope with non-goals, technical direction, risks, plus the still-empty roadmap, concept review and
open-points sections. A concept uses `language.workflow` throughout; an existing concept keeps its
recognizable language.

**Deep concept review:** Once you are satisfied with the concept, the deep review elaborates it:
it clarifies decision-requiring points one by one, deepens the sections, marks durable decisions as
ADR candidates, and records the first planning steps as ordered work packages – each with a
ready-to-paste `/effective-flow plan` call. Only then does the status become
`**Concept status:** Elaborated`. `concept` offers this review right at the end of its run; you can
also catch it up later with `/effective-flow review <concept file>`.

**Interplay:** concept → deep concept review → `/effective-flow plan` per work package →
`/effective-flow build`. The concept workflows never write a plan file themselves; the handoff is
the ready-to-paste call in the roadmap.

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
tracked as an issue, on no tracker target. Their prose follows `language.workflow`;
the internal runtime/wisdom schema remains language-stable.

**Interplay:** The recommendation routes to `/effective-flow fix` (defect with a clear cause),
`/effective-flow refactor` (structural problem without behavior change), `/effective-flow build` (missing
functionality or intentional behavior change), or `/effective-flow docs` (pure
documentation gap) – including a copy-paste-ready follow-up call that references the report path.

## `/effective-flow plan`

**Purpose:** Acts as the planning gateway. Explicit issue references are handed to
`/effective-flow plan-issue` unchanged; every other input creates an implementable, validated
implementation plan in `<plan.dir>/`, without generating code or changing existing implementation
files. The local path clarifies open questions interactively with the user until a solid basis
exists, and recommends the appropriate implementation workflow (feature, bugfix, refactoring, or
documentation).

**When to use:** Before a larger change is implemented while the requirement, its
acceptance criteria, or architecture decisions are not yet settled.

**Typical calls:**

```text
/effective-flow plan Add an export function to the dashboard
/effective-flow plan #123
/effective-flow plan https://github.com/acme/product/issues/123
```

The first call starts local planning. The other two calls hand the original reference to
`plan-issue`; `plan` does not inspect or change tracker state itself. Natural-language requirements
remain local planning input. A bare four-digit value such as `1234` retains precedence as a legacy
plan reference; use `#1234` or an issue URL for a four-digit issue.

**Input/output:** Natural-language input produces
`<plan.dir>/YYYY-MM-DD-<slug>.md` with a status line (`**Planungsstatus:** Nicht umgesetzt` or
`**Plan status:** Not implemented`), recommended workflow, architecture decisions,
affected files, acceptance criteria, validation plan, and its own
plan review section. For documentation plans, the header adds `**Doc category:**` and
`**Target path:**` per the doc category convention. A new plan uses `language.workflow`
throughout—header fields, sections, plan review, open points, and status marker are all German or
all English. An existing plan retains its recognizable language when edited or completed. Explicit
issue input instead produces the canonical issue-planning comment described under `plan-issue`.

**Interplay:** A finished local plan is implemented later with `/effective-flow apply <plan file>`,
which reads the plan's own `**Recommended workflow:**` field and routes to the matching
implementation tool, so the routing decision is made once, at invocation time. Optionally,
`plan` offers a deeper interactive plan review directly afterwards; if it is
skipped, it can be caught up later via `/effective-flow review <plan file>`.

**Revising an existing plan:** `/effective-flow plan <plan-file>` on a plan file it already
wrote does not start a new dated file — it revises that file in place. The earlier plan review
stays intact as a dated subsection; a new one is appended, not overwritten. On an implemented or
archived plan, `plan` asks once whether to revise it in place (which moves an archived file back
to `<plan.dir>/` and resets its status), start a new plan instead, or abort. If the revision
would change the `**Recommended workflow:**` value, `plan` reports the new classification and asks
for explicit confirmation before rewriting the field — never a silent flip, since `apply` and
`open-plans` both route on it.

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
comment back to the issue. It then runs the full automatic baseline—gap analysis, validation, and
internal plan review—before offering the same optional deep interactive review as local planning.
When one issue contains several independently implementable outcomes, it can also propose a split
into native sub-issues. It produces neither code nor a plan file – the parent issue and its planning
comment remain the source for the overall scope.

**When to use:** When your issues live in a tracker – the Git forge or an external tool – and
some of them still contain too little information for an autonomous implementation.

**Typical calls:**

```text
/effective-flow plan-issue #123
/effective-flow plan-issue #123 #456
/effective-flow plan-issue https://github.com/acme/product/issues/123
```

**Input/output:** Without an argument, all open `effective-flow-needs-planning` issues are listed for
selection; with an argument, the handed-over issue references (number, `#123`, URL)
are used. Output is one canonical comment per issue with the completed requirement, acceptance
criteria, affected areas, assumptions, baseline review result, and open points. The comment follows
`language.forge`; its marker, label, and other machine-facing tokens remain stable. Multiple issues
are processed separately and completely, so one blocked issue does not prevent the others from
being planned.

**Splitting a broad issue:** `plan-issue` proposes a decomposition only when the planning analysis
finds that the parent is too broad for one coherent implementation or combines independently
implementable outcomes. The canonical planning comment shows the exact title, workflow, and
self-contained body for every proposed child before anything is created. The tracker helper builds
this as one canonical v2 section bound to the exact target and parent; the workflow inserts
that complete section without assembling its markers or visible entries itself. Each proposal also
gets a stable parent-scoped key and a draft hash that binds that key to its exact title, workflow,
and body. Keys must be unique within the parent, as must the issue identities of created children.
A record has exactly one valid status—`proposed`, `approved`, `created`, `missing`, or `declined`—and
only `created` may carry a child issue reference. Any change to the bound records or their visible
rendering fails validation instead of being accepted as a partial manual edit.

Creation requires your explicit approval of that exact child set for that parent. Approval for a
different parent or an earlier draft does not carry over. The tool creates each approved item only
as a native child of the active parent; it never substitutes a standalone issue, a create-then-link
sequence, a sibling issue, or a checklist. GitHub must support native child listing and
create-under-parent; an external tracker must additionally support native sub-item completion so
the downstream container can converge. If the applicable guarantees are unavailable, ordinary
single-issue planning remains available but the split is not.

Before the proposal can be persisted, every child body must already contain exactly one
language-appropriate workflow field matching its canonical record. That field must be top-level;
examples inside block quotes or fenced code blocks do not count. Every Markdown fence in the child
body must also be closed, because an unclosed fence would hide the final machine-readable child
marker. Proposed titles and bodies pass through the tracker helper's publication safety boundary.
Recognizable assigned values such as AWS access keys, refresh tokens, Authorization credentials,
private keys, client or session credentials, and prefixed environment variables such as `GH_TOKEN`
or `DATABASE_PASSWORD` are redacted. Sentence-like, punctuated security guidance such as
`Token: support refresh-token rotation.` remains unchanged. An empty, unterminated, residual, or
otherwise ambiguous credential form that cannot be transformed safely blocks persistence or
creation. This is a fail-closed safety boundary, not a promise to detect every possible secret.
Labels containing secret material are rejected rather than rewritten.

For a GitHub decomposition, the complete canonical planning comment—not only its child section—must
fit within 65,536 UTF-8 bytes. The helper validates the section while building it and validates the
assembled comment again before persistence; it reports size contributions instead of truncating a
child. This decomposition-specific guard does not change ordinary planning comments that contain no
decomposition.

The stable keys make interrupted runs resumable. For every approved child, `plan-issue` reads the
parent's native children immediately before it previews creation and reads them again immediately
before it applies that unchanged preview. A unique child that appears between those reads is
recovered instead of duplicated. If a create outcome is unknown, another fresh read replaces the
local state before any decision; it is never retried blindly. A missing or ambiguous match, or a
later child failure, keeps already created children, records the unresolved proposals in the
planning comment, retains `effective-flow-needs-planning`, and points back to `plan-issue` for a
fresh run. After a reported success or recovery, a third child read must show exactly one valid
same-parent match before the planning comment records it as created.

These checks reduce duplicate creation during sequential and resumed runs, but they are not a
cross-process lock. A provider may not offer an atomic conditional write for this mutation, so two
simultaneous runs can still race after the last read. A duplicate that becomes visible is detected
and fails closed for reconciliation; Effective Flow does not claim globally unique creation under
concurrent writers.

After the automatic baseline, answer **Yes** to continue with the shared plan-review method as a
deep interactive review or **No** to release the ready baseline. A skipped review can be resumed later with
`/effective-flow plan-issue #123`. The label `effective-flow-needs-planning` is removed only when
the issue plan is ready and every approved child is accounted for. Unresolved
implementation-blocking points or an incomplete decomposition keep the label, and the canonical
comment records the re-entry state.

**Interplay:** This tool is inherently tracker-bound: it always works against the resolved tracker
target – the issue tracker of the `origin` remote, or the external tool named in the project setup
(see [Native sub-issues](remote-tracker.md#native-sub-issues-created-during-planning)). The
local/remote distinction does not apply here. Once complete, `/effective-flow apply` implements a
normal planned issue directly; for an approved decomposition, it treats the parent as a container
and expands its open native children without implementing the parent a second time. The workflow
stored in each canonical parent record is authoritative and must match exactly one
language-appropriate workflow field in the child body. `apply` does not reclassify it: `Feature`
routes to `build`, `Bugfix` to `fix`, `Refactoring` to `refactor`, and `Documentation` to `docs`.

## Further reading

- [Configuration](configuration.md) – `language.workflow`, `language.forge`, `plan.dir`, and
  other defaults
- [Remote tracker](remote-tracker.md) – issue mode, labels, and the three tracker targets
- [Skill discovery](skill-discovery.md) – how these tools draw on host skills for analysis
- [Tools: Implement](tools-implement.md) – how plans, reports, and issues are implemented
