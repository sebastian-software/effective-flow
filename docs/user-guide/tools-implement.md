# Tool reference: Implement a change

This group leads from the clarified plan or issue to finished code. Four of the seven Tools
(build, fix, refactor, docs) share the same base pattern; `apply` is the pure
router, `maintain` runs recurring maintenance without plan input (see below), and
`iterate` continues an already-delivered change:

- They can be started directly with a requirement **or** reference a plan file already
  produced by `/effective-flow plan`. A referenced plan file must first
  pass the **clarification gate** (sufficiently concrete acceptance criteria, affected
  files, no open core questions); if it doesn't, the tool points to
  `/effective-flow plan` or `/effective-flow review <plan file>`.
- With delivery/worktree mode active, the actual implementation runs in a separate
  delivery branch or worktree; at the end there is a completion action (`pr`, `merge`, or
  `branch`). For details see [Worktree and delivery](worktree-and-delivery.md).
  `/effective-flow apply` itself implements nothing, it only delegates.
- After the approval of an internal plan, they offer an explicit goal prompt
  ("Autonomous via `/goal`"), so that the remaining phases can run autonomously instead of
  step-by-step gated.
- Before analysis, they review the available host skills (see
  [Skill discovery](skill-discovery.md)) and respect their respective
  write boundary.
- They classify affected files or domains independently. Specialized JavaScript/TypeScript,
  Node.js, and Rust routes remain preferred; other clearly identified product code uses a
  disclosed reduced-depth product route; tooling and configuration use a separate tooling-only
  route. See [Language support](language-support.md).

`<plan.dir>` is the `plan.dir` value from the Effective Flow project-setup ADR (default
`docs/plan`; see [Configuration](configuration.md#block-plan)).

## `/effective-flow apply`

**Purpose:** Pure entry router. Takes any apply source – plan file,
local review report, remote review epic/finding, or GitHub/Forgejo issue –, classifies
it via the shared apply-source detection, and delegates to the responsible internal tool
(internally `apply-plan`, `apply-review`, or `apply-issues`; these are not directly callable via
`/effective-flow`). `apply` implements nothing itself.

**When to use:** As the standard entry point to implement a finished source, without having to
decide yourself which tool is responsible.

**Typical call:** `/effective-flow apply [<plan file>|<report path>|<issue reference>]`

**Input/output:** Without an argument, `apply` lists local candidates (open plans from
`<plan.dir>/`, report files under `.effective-flow/review/`) and, in remote tracker mode, additionally
open review epics, and then asks for the concrete source. The output consists of the
detected source type, the resolved handle, and the started target tool.

**Interplay:** Pure classification and routing layer; implementation, validation,
review, and commit preparation lie entirely with the respective target tool. With an
ambiguous or mixed source type, `apply` asks instead of guessing heuristically.

## `/effective-flow build`

**Purpose:** Orchestrates the complete feature workflow: intent gate, optional planning via
`/effective-flow plan`, implementation, documentation, tests, validation, review, and completion.

**When to use:** New functionality, a new UI element, a new page, a new integration, or
changed user behavior. If the intent is instead detected as a bugfix, refactoring, or pure
documentation, `build` refers to `/effective-flow fix`, `/effective-flow refactor`, or `/effective-flow docs`
and terminates.

**Typical call:** `/effective-flow build <requirement>` or `/effective-flow build <plan file>`

**Input/output:** Input is the feature requirement or a referenced plan file.
Output is the code changes including tests and docs, an updated plan file (status
`Umgesetzt`/`Implemented`, review-findings summary, archive move to
`<plan.dir>/archive/`) as well as – with delivery/worktree mode active – a delivery branch with
PR, merge, or left-standing branch.

**Interplay:** Delegates internally per affected file/domain to specialized or reduced-depth
implementer and reviewer workers, plus repository-native test, validation, and documentation
workers. Mixed repositories keep each route separate. Open, not-implemented review findings land as an external report under
`.effective-flow/review/`, which can later be worked off via `/effective-flow apply` or the appropriate implementation workflow.

## `/effective-flow fix`

**Purpose:** Orchestrates the bugfix workflow: investigation, reproduction, gap analysis,
diagnosis validation, minimal fix, regression test, validation, and completion – leaner
than `build`, since by default no dedicated planning phase is prepended.

**When to use:** A concrete defect is to be fixed: something doesn't work as
expected or there is a regression.

**Typical call:** `/effective-flow fix <defect description>` or `/effective-flow fix <plan file>`

**Input/output:** Input is the defect description, a plan file, or the call suggestion
from a `/effective-flow investigate` report. Output is the minimal fix including regression test, the
updated plan file (if referenced), and – with delivery/worktree mode active – the
usual delivery branch with a completion action.

**Interplay:** Often builds directly on a `/effective-flow investigate` report. Unlike
`investigate`, `fix` deliberately writes a reproduction test in phase 2, instead of only
observing.

## `/effective-flow refactor`

**Purpose:** Orchestrates structural or readability improvements without an intended
behavior change. Before the restructuring it takes a baseline from the repository-native tests,
lint, type, build, and documentation checks that can be discovered safely and compares it again after the refactoring, as a safety net against
regressions.

**When to use:** Code is to be restructured, technical debt reduced, or performance
improved, without the external behavior changing.

**Typical call:** `/effective-flow refactor <description>` or `/effective-flow refactor <plan file>`

**Input/output:** Input is the refactoring requirement or a plan file. Output is
the restructured code including confirmation that the discovered repository-native checks are still green and
unchanged relative to the baseline, plus – with delivery/worktree mode active – a delivery branch
and a completion action.

**Interplay:** Introduces no documentation phase when no public behavior is
affected, and deliberately leaves new features or unplanned bugfixes out of scope during the run
– `/effective-flow build` or `/effective-flow fix` are responsible for those.

## `/effective-flow docs`

**Purpose:** Orchestrates documentation changes: README files, developer guides,
API/CLI documentation, skill documentation, migration notes, changelogs, and
in-code documentation. Changes product or code behavior only when the change itself is
documentation-adjacent (e.g. CLI help text or JSDoc/TSDoc).

**When to use:** Documentation is missing, outdated, or is to be restructured, without
product behavior changing. This reference document itself was created via `/effective-flow docs`.

**Typical call:** `/effective-flow docs <description>` or `/effective-flow docs <doc plan file>`

**Input/output:** Input is the documentation requirement or a plan file with the
header lines `**Doku-Kategorie:**` and `**Ziel-Pfad:**`. Output is the new or updated
document within one of the four categories (`docs/user-guide/`, `docs/developer-guide/`,
`docs/operations/`, `docs/runbooks/`); if the category or target path is missing from the plan, `docs`
asks for it.

**Interplay:** Uses the `docs-writer` agent for user docs and the
`code-documenter` agent for in-code documentation. Both work cross-language and follow the
repository’s established format. JSDoc/TSDoc for JS/TS and rustdoc plus crate/module docs for
Rust remain specialized branches; other languages use repository-native conventions without
adding documentation tooling. For details on language routing, see
[Language support](language-support.md); for details on the category and
naming convention, see [Plan conventions](../developer-guide/plan-conventions.md).

## `/effective-flow maintain`

**Purpose:** Orchestrates lean, recurring maintenance of a Node project:
dependency updates, security/audit fixes, and breaking-change adaptation on major bumps.
Deliberately not a scheduler – automatic, time-triggered bumping is handled by tools like
Renovate or Dependabot; `maintain` is the interactive "clean up now" run.

**When to use:** Outdated dependencies or security findings are to be cleaned up.
Not suited for general refactoring (→ `/effective-flow refactor`), bugfixes without
dependency relation (→ `/effective-flow fix`), or new functionality (→ `/effective-flow build`).

**Typical call:** `/effective-flow maintain`

**Input/output:** No input needed; the tool detects the package manager from the lockfile. Output
is a group overview (safe batch, major individually, security) for selection, then a
dedicated commit per implemented group and a summary of the deferred
"manual" updates.

**Interplay:** `maintain` is a **thin adapter** around the central skill
`smart-dependency-updater` – it provides the actual update mechanics (ecosystem detection,
risk grouping, changelog research, compatibility adaptation, validation strategy,
update reporting), while `maintain` owns only the orchestration and delivery (scope gate, green
baseline, one commit per group, worktree/PR handback) and tells the skill "Effective Flow owns
delivery", so that two delivery loops don't run. If the skill is missing, a deliberately
minimal fallback kicks in. `maintain` refuses to update as long as the before baseline is already
red, and instead points to `/effective-flow fix`. For code adaptations to breaking
changes, a reviewer pass runs as with `build`/`refactor`.
Compatibility adaptations use the same per-file routing as other implementation workflows, so
unsupported product code goes to the reduced-depth product workers rather than the tooling-only
generic implementer.

## `/effective-flow iterate`

**Purpose:** Feeds review remarks from an existing pull request – review bots like
Greptile **and** human reviewers – as well as additional free-text instructions as new
commits back into the same PR. A "mini build" on an already-delivered change:
classifies each point, delegates to `/effective-flow fix`, `/effective-flow refactor`, `/effective-flow build`, or
`/effective-flow docs`, replies to the addressed review threads, and resolves them.

**When to use:** A workflow like `/effective-flow build` has already created a PR, and afterwards
remarks have come in (Greptile/reviewer comments) that should be incorporated – or an
existing change is to be specifically improved via free-text instruction. For a new
change from scratch, `/effective-flow build`, `/effective-flow fix`, `/effective-flow refactor`, or
`/effective-flow docs` are responsible instead.

**Typical call:** `/effective-flow iterate [<PR reference>] [<free-text instructions>]` – the
PR reference is optional (`#42`, bare number, or PR URL); without it, `iterate` tries to resolve
the open PR of the current branch.

**Input/output:** In **PR mode**, `iterate` reads the review threads of all reviewers fresh,
classifies each point (actionable, already addressed, or pure question), and obtains an
approval. Output is **one commit per implemented point** on the PR head branch (only new
commits – no force-push, amend, or rebase), a short reply plus resolution per addressed
thread, and a summary comment. Pure reviewer questions are deferred and listed in the summary,
not automatically answered on the merits. Without a PR (**local mode**), `iterate` iterates
based on the free-text instructions on the diff of the current branch against the base branch
and commits locally, without pushing or commenting.

**Interplay:** Extends the apply chain by the previously missing source
"PR review comments": `/effective-flow apply` reads Effective Flow's own reports or issues, `iterate` reads
the threads left directly on the PR. The actual implementation is handled by the existing
implementation tools; existing PRs are updated exclusively via new commits. GitHub
(`gh`) and Forgejo (`tea`) are supported – resolving threads uses the GraphQL mutation on GitHub,
best-effort on Forgejo (otherwise only a reply, noted in the summary).

## Further reading

- [Worktree and delivery](worktree-and-delivery.md) – delivery branch, worktree,
  PR/merge/branch completion
- [Configuration](configuration.md) – `delivery.*`, `worktree.*`, `plan.*`
- [Skill discovery](skill-discovery.md) – how these tools use host skills
- [Tools: Ensure quality](tools-quality.md) – how the review reports that get incorporated here
  are created
