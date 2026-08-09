# Next-step recommendations after a tool run

**Plan status:** Implemented
**Source:** /effective-flow plan
**Recommended workflow:** Feature (`/effective-flow build`)

## Requirement

Every Effective Flow tool that ends in front of the user should close its report with **up to two
concrete ways to continue**, most likely first, each with a very short statement of what that tool
would do **from the state this run just left behind**.

Two problems motivate this:

1. **`plan` hands the user a guess.** `src/tools/plan.md:370` tells the user to invoke
   `build`/`fix`/`refactor`/`docs` with the plan path, derived from the plan's own classification.
   A wrong guess is not silent today — `src/shared/plan-reference-routing.md:41-43` makes a
   mismatched `build <plan-file>` emit a warning and demand explicit confirmation — but it costs the
   user a confirmation round and forces the routing decision to be made twice, once at plan time and
   once at invocation time. `apply <plan-file>` removes both: it re-reads the plan's
   `**Recommended workflow:**` field at invocation time and routes from there. For another planning
   pass, `plan <plan-file>` or `review <plan-file>` is the better answer than any implementation
   tool.
2. **Most tools recommend nothing at all.** A survey of `src/tools/*.md` found that `build`, `fix`,
   `refactor`, `docs`, `maintain`, `iterate`, `merge-gate`, `review`, `setup`, `pr`, `commit`, and
   `open-plans` end with no forward pointer, while the ones that do (`investigate`, `plan`,
   `plan-issue`, `plan-review`, `concept`, `concept-review`, `cleanup`) each hand-roll their own
   wording. `review` never names `apply <report>`; `open-plans` never names `apply`; the
   implementation tools never name `merge-gate <PR>` even right after opening a PR.

The result should be one canonical, machine-checked map of the workflow graph, consumed by the
tools at runtime and mirrored as user documentation.

Classified as **Feature**: it introduces new user-visible behavior (a new report block in 18 tools),
a new shared contract, a new build guard, a new documentation page, a delegation-suppression signal,
and one new capability in `plan` (revising an existing plan file in place).

## Architecture decisions

- **One canonical edge table in a shared fragment.** `src/shared/next-steps.md` carries both the
  emission contract and a machine-readable table of every edge, delimited by
  `<!-- next-steps-table:start -->` / `<!-- next-steps-table:end -->`. Rationale: a single source of
  truth that the build can parse, that the documentation mirrors, and that keeps each tool's diff to
  one fence plus one completion-phase line. The alternative — spelling the edges out per tool — was
  rejected because the overall map would then exist only in prose and drift silently.
- **Loaded lazily, not eagerly.** Each emitting tool carries a ` ```lazy-include ` fence, so the
  table is read only when a run actually reaches its completion report. This matters for the
  context-budget guard (`build.mjs:1104-1118`, 700 lines): `review` currently renders at **675**
  lines, leaving **25 lines** of headroom — an eager include of a ~40-row table would break it, a
  load pointer costs about two.
- **The fragment contains no lazy fence of its own.** The standalone shipping path
  (`build.mjs:858-875`) resolves eager includes only, so a nested lazy fence would survive verbatim
  into `dist/*/effective-flow/shared/next-steps.md`. Same constraint the `issue-tracker` and
  `pr-review-integration` fragments already live under.
- **The last user-invocable tool of a run emits.** `src/SKILL.md:21` makes `apply-plan`,
  `apply-review`, `apply-issues`, `plan-review`, and `concept-review` non-invocable: they only ever
  run as delegates, so they can never be the run the user is looking at. All five are exempt, and
  their terminal states become rows on the tool the user actually invoked — `apply` carries the
  `apply-review`/`apply-issues`/gate-failure states, `review` carries the `plan-review` and
  `concept-review` states. `apply` therefore leaves the exemption set.
- **A delegation that returns to its caller is marked, a handoff is not.** The distinction is
  mechanical, not inferred: a delegation whose result returns to the caller carries the literal line
  `Next steps: suppressed` in its payload, mirroring the existing `Summary comment: suppressed`
  convention at `src/tools/merge-gate.md:167-176` (parsed at `src/tools/iterate.md:236-238`). A
  handoff that gives the receiving tool the rest of the run — `apply-plan` →
  `build`/`fix`/`refactor`/`docs` (`src/tools/apply-plan.md:84-88`) — deliberately omits it, because
  the receiving tool is the one that finishes in front of the user. Absence of the line means the
  run is the outermost one. The failure mode is safe: a forgotten line yields one block too many,
  never a wrong one.
- **The block is chat-only.** It is never written into a pull-request comment, an issue comment, a
  commit message, or any persisted artifact. This keeps `merge-gate`'s no-PR-comment rule
  (`src/tools/merge-gate.md:21-24`) intact and closes the same class for `iterate`, `apply-review`,
  and `apply-issues`, which all post forge comments.
- **The plan artifact's `**Recommended workflow:**` header field keeps its meaning.** It is
  machine-consumed: `src/shared/plan-reference-routing.md:29-39` parses it and `apply-plan` uses it
  as the target workflow (`src/tools/apply-plan.md:65`), and `src/tools/open-plans.md:44-46`
  renders it as the `Workflow` column. Only the **spoken** recommendation at the end of the `plan`
  run changes. A revision run may change the field's _value_, but never silently — see below.
- **`plan <plan-file>` becomes a real revision path, with confirmation on header changes.** Today
  the gateway classifies a plan path as `plan` and returns it to the local workflow
  (`src/shared/plan-input-gateway.md:20-22`), but `src/tools/plan.md` never loads
  `plan-reference-routing`, so the run would write a _new_ file with a `-2` suffix
  (`src/tools/plan.md:144`) instead of iterating. Recommending an invocation that quietly does the
  wrong thing is the exact defect class this change exists to remove, so the capability is built
  rather than the edge dropped. The five undefined fields are decided in "Revision semantics" below.
- **Edges may be conditional.** A `Condition` column lets one tool carry different edges for
  different end states. An edge whose condition does not hold is simply not emitted, so the block
  never names an invocation the run has no argument for.
- **Every edge cell is a `{{SKILL:x}}` reference; the `Tool` column is a plain name.** `investigate`'s
  variable follow-up is expressed as four condition rows rather than a `<recommended workflow>`
  cell, so `validateRefs` and the contract assertion apply uniformly to every edge cell. The `Tool`
  column stays plain text because `{{SKILL:x}}` renders a non-exposed name as `` `tools/x.md` ``
  (`build-lib.mjs:1110-1112`), which would surface file paths as tool names in the mirrored
  documentation.
- **No argument-less invocation is recommended where it would resolve to the wrong scope, and no
  argument is invented.** Bare `review` scans the whole codebase when the tree is clean
  (`src/tools/review.md:110`) and bare `plan` starts from a requirement that does not exist after a
  merge or a setup, so neither appears. Conversely `open-plans` recommends **argument-less** `apply`,
  because `apply` already lists the open plans and asks (`src/tools/apply.md:82-91`) while picking
  one heuristically is forbidden (`src/shared/plan-numbering.md:69`). Where no valid second edge
  exists, the row carries one option.
- **Guard split follows the repository's dominant pattern:** pure parsers and checkers in
  `build-lib.mjs` (unit-testable), thin I/O wrappers in `build.mjs`, mirroring
  `parseProjectRoutingTable`/`assertProjectRoutingContract` (`build-lib.mjs:774-862`,
  `build.mjs:479-497`).
- **Consumer enforcement is derived, not hand-listed.** The emitting set is
  `count(src/tools/*.md) − |exemptions|`, never a hard-coded number. Every `src/tools/*.md` must
  either load the fragment exactly once or appear in a documented exemption set, and each exemption
  is asserted non-stale. A newly added tool therefore has to opt in or out deliberately, instead of
  silently inheriting "no recommendation" — the weakness of the hand-maintained
  `projectRoutingConsumers` allowlist (`build.mjs:499-516`).

## The edge map

Concrete content for the fragment table and the documentation page. `<...>` placeholders are filled
from the run's actual state. Edge cells are `{{SKILL:x}}` references in the source; the invocations
below show their rendered Claude form.

| Tool          | Condition                             | Then (1st)                   | Or (2nd)                     |
| ------------- | ------------------------------------- | ---------------------------- | ---------------------------- |
| `concept`     | deep review declined                  | `review <concept-file>`      | —                            |
| `concept`     | deep review done                      | `plan <work package>`        | `review <concept-file>`      |
| `investigate` | defect with a clear cause             | `fix <report>`               | `plan <report>`              |
| `investigate` | structural problem                    | `refactor <report>`          | `plan <report>`              |
| `investigate` | missing functionality                 | `build <report>`             | `plan <report>`              |
| `investigate` | documentation gap / no defect         | `docs <report>`              | —                            |
| `plan`        | deep review declined                  | `apply <plan-file>`          | `review <plan-file>`         |
| `plan`        | deep review done                      | `apply <plan-file>`          | `plan <plan-file>`           |
| `open-plans`  | at least one open plan                | `apply`                      | —                            |
| `plan-issue`  | released                              | `apply #<issue>`             | `plan-issue <issue>`         |
| `plan-issue`  | retained for planning                 | `plan-issue <issue>`         | —                            |
| `apply`       | plan clarity gate failed              | `plan <plan-file>`           | `review <plan-file>`         |
| `apply`       | findings applied, PR opened           | `merge-gate <PR>`            | `apply <remaining source>`   |
| `apply`       | findings applied, no PR               | `pr`                         | `apply <remaining source>`   |
| `apply`       | issues processed, PR opened           | `merge-gate <PR>`            | `plan-issue <skipped issue>` |
| `apply`       | issues skipped, no PR                 | `plan-issue <skipped issue>` | —                            |
| `build`       | PR opened                             | `merge-gate <PR>`            | `apply <findings report>`    |
| `build`       | no PR                                 | `pr`                         | `apply <findings report>`    |
| `fix`         | PR opened                             | `merge-gate <PR>`            | `apply <findings report>`    |
| `fix`         | no PR                                 | `pr`                         | `apply <findings report>`    |
| `refactor`    | PR opened                             | `merge-gate <PR>`            | `apply <findings report>`    |
| `refactor`    | no PR                                 | `pr`                         | `apply <findings report>`    |
| `docs`        | PR opened                             | `merge-gate <PR>`            | `review <PR>`                |
| `docs`        | no PR                                 | `pr`                         | —                            |
| `maintain`    | PR opened                             | `merge-gate <PR>`            | `apply <offloaded report>`   |
| `maintain`    | no PR                                 | `pr`                         | `apply <offloaded report>`   |
| `iterate`     | PR mode                               | `merge-gate <PR>`            | `review <PR>`                |
| `iterate`     | local mode                            | `pr`                         | —                            |
| `review`      | local report written                  | `apply <report>`             | —                            |
| `review`      | published to a tracker                | `apply #<epic>`              | —                            |
| `review`      | plan file mode, ready                 | `apply <plan-file>`          | —                            |
| `review`      | plan file mode, open points remain    | `review <plan-file>`         | `plan <plan-file>`           |
| `review`      | concept file mode, ready              | `plan <work package>`        | —                            |
| `review`      | concept file mode, open points remain | `review <concept-file>`      | —                            |
| `commit`      | always                                | `pr`                         | —                            |
| `pr`          | always                                | `merge-gate <PR>`            | `review <PR>`                |
| `merge-gate`  | blocked by review notes               | `iterate <PR>`               | `merge-gate <PR>`            |
| `merge-gate`  | merged                                | `open-plans`                 | —                            |
| `setup`       | staged changes exist                  | `commit`                     | —                            |
| `cleanup`     | staged removals exist                 | `commit`                     | `setup`                      |
| `cleanup`     | config values referred to setup       | `setup`                      | —                            |

41 rows over 18 emitting tools. Rows with a single option are deliberate: no invented second edge is
better than one that resolves to the wrong scope. Two end states carry no row at all and therefore
emit nothing — `setup` with nothing staged (`src/tools/setup.md:666`: setup does not commit and
stages only in the `git rm --cached` migration case, so `commit` would find nothing) and `cleanup`
with an empty report (`src/tools/cleanup.md:328` makes the report mandatory even then).

Rationale for the two most load-bearing rows: `plan → apply` is the requirement's core fix, and
`pr → merge-gate | review` is the example the requirement names verbatim.

## Revision semantics for `plan <plan-file>`

The five previously undefined fields, decided:

| Field                       | Decision                                                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `## Plan review`            | Appended as a dated subsection, never overwritten. The audit trail of earlier passes survives.                                                                             |
| Phase 6b deep review        | Offered again on every revision run.                                                                                                                                       |
| `**Recommended workflow:**` | A changed classification is reported and explicitly confirmed before the field is rewritten. Never a silent flip, because `apply-plan` and `open-plans` both route on it.  |
| Legacy `# NNNN:` H1         | Preserved verbatim, per `src/shared/plan-numbering.md:29-30`. The `# <title>` rule at `src/tools/plan.md:144` applies to newly created plans only.                         |
| Archived plan               | `git mv` back to `<plan.dir>/` with the status reset to open, stated in the confirmation question, so `open-plans` and the emitted `apply <plan-file>` edge stay coherent. |

Two interaction rules follow from loading `plan-reference-routing` into `plan`:

- Only its reference-resolution and status-check sections apply. The workflow-mismatch check at
  `src/shared/plan-reference-routing.md:29-44` is **skipped** in revision mode — otherwise a revision
  of a Feature plan would warn and ask, reintroducing the very confirmation round this change
  removes.
- The revision-mode question (revise in place / start a new plan / abort) replaces the fragment's
  status question at `:24-27`; only one question is asked.

The revision target is resolved **after** Phase 1 step 3's legacy bulk migration
(`src/tools/plan.md:110`), and resolution runs against the post-migration file name — the gateway
runs before that migration (`src/shared/plan-input-gateway.md:1-4`), so an early-resolved path would
be stale by the time Phase 3 writes.

## Affected files

| File                                   | Description                                                                                                                                                                                                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/next-steps.md`             | **New.** Emission contract (incl. the last-user-invocable-tool rule and the suppression signal) plus the marker-delimited edge table.                                                                                                                                            |
| `src/tools/plan.md`                    | Lazy fence; Phase 1 gains the revision path; Phase 7 step 3 replaces the direct `build`/`fix`/`refactor`/`docs` note with the block; Phase 6b `No` defers to it; the `plan-review` and `plan-issue` delegations gain `Next steps: suppressed`.                                   |
| `src/tools/concept.md`                 | Lazy fence; Phase 6 report ends with the block; the `concept-review` delegation gains the suppression line.                                                                                                                                                                      |
| `src/tools/investigate.md`             | Lazy fence; Phase 5 keeps its single recommended follow-up as the 1st edge and adds the 2nd; the persisted `## Recommendation` report block stays unchanged.                                                                                                                     |
| `src/tools/plan-issue.md`              | Lazy fence; Phase 5 summary emits the block; the `plan-review` delegation gains the suppression line.                                                                                                                                                                            |
| `src/tools/open-plans.md`              | Lazy fence; the `## Approach` output spec (no phases in this tool) gains the block after the table.                                                                                                                                                                              |
| `src/tools/apply.md`                   | Lazy fence; leaves the exemption set. Phase 2 gains a completion step that emits its delegate's end state, and the `apply-review`/`apply-issues`/`apply-plan` delegations gain the suppression line — except the `apply-plan` → implementation handoff, which must not carry it. |
| `src/tools/build.md`                   | Lazy fence; Phase 7 completion gains the block.                                                                                                                                                                                                                                  |
| `src/tools/fix.md`                     | Lazy fence; Phase 5 completion gains the block.                                                                                                                                                                                                                                  |
| `src/tools/refactor.md`                | Lazy fence; `### Phase 6: Before/after comparison and completion` gains the block.                                                                                                                                                                                               |
| `src/tools/docs.md`                    | Lazy fence; Phase 4 completion gains the block.                                                                                                                                                                                                                                  |
| `src/tools/maintain.md`                | Lazy fence; `### Phase 5: Report and completion` gains the block.                                                                                                                                                                                                                |
| `src/tools/iterate.md`                 | Lazy fence; Phase 6 summary gains the block, suppressed when `merge-gate` announced it.                                                                                                                                                                                          |
| `src/tools/review.md`                  | Lazy fence; Phase 4 gains the block for the local and publishing branches, and the plan-file and concept-file modes (`:305-308`, `:332`) gain theirs. Budget-critical file (675/700).                                                                                            |
| `src/tools/commit.md`                  | Lazy fence; a **new** step 6 after `git commit` (`:44`), since this tool has no report step today.                                                                                                                                                                               |
| `src/tools/pr.md`                      | Lazy fence; step 12 gains the block.                                                                                                                                                                                                                                             |
| `src/tools/merge-gate.md`              | Lazy fence; Phase 6 summary gains the block; the `iterate` delegation payload gains `Next steps: suppressed` beside its existing literals.                                                                                                                                       |
| `src/tools/setup.md`                   | Lazy fence; Step 7 summary gains the conditional block; the rule-level `commit` pointer at `:666` is reduced so the referral is not stated twice.                                                                                                                                |
| `src/tools/cleanup.md`                 | Lazy fence; Phase 6 report gains the conditional block; the existing `commit`/`setup` referrals become its edges and leave the bullet list.                                                                                                                                      |
| `src/tools/apply-plan.md`              | Exempt (internal). Its two terminal states move to `apply`'s rows; the implementation handoff explicitly does **not** carry the suppression line.                                                                                                                                |
| `src/tools/apply-review.md`            | Exempt (internal). Its end states move to `apply`'s rows.                                                                                                                                                                                                                        |
| `src/tools/apply-issues.md`            | Exempt (internal). Its end states move to `apply`'s rows.                                                                                                                                                                                                                        |
| `src/tools/plan-review.md`             | Exempt (internal). Its file-mode results move to `review`'s rows.                                                                                                                                                                                                                |
| `src/tools/concept-review.md`          | Exempt (internal). Its results move to `review`'s and `concept`'s rows.                                                                                                                                                                                                          |
| `build-lib.mjs`                        | New pure exports `parseNextStepsTable`, `assertNextStepsContract`, `findNextStepsDocViolations`, plus the marker constants.                                                                                                                                                      |
| `build.mjs`                            | Guard after the project-routing guard: read, parse, assert the contract incl. two-way consumer coverage, `validateRefs`, reconcile the documentation page; fence presence/absence enforced in `readSource`.                                                                      |
| `docs/user-guide/tool-flow.md`         | **New.** User-facing page: what each tool proposes next and why, with the compact table.                                                                                                                                                                                         |
| `docs/user-guide/README.md`            | Index entry under "In-depth guides" plus a row in "All documents in this category".                                                                                                                                                                                              |
| `docs/user-guide/getting-started.md`   | The "typical flow" section links to the new page; the `/effective-flow build docs/plan/` example required by the guard at `build.mjs:1136-1142` stays.                                                                                                                           |
| `docs/user-guide/tools-understand.md`  | The `plan` section documents the plan-file revision argument and its confirmation behavior.                                                                                                                                                                                      |
| `docs/developer-guide/build-system.md` | The `## Guards` list gains the next-steps guard.                                                                                                                                                                                                                                 |
| `AGENTS.md`                            | "Adding a tool or agent" notes that a new tool opts into or out of the next-steps contract, and that a returning delegation carries `Next steps: suppressed`.                                                                                                                    |
| `test/build-lib.test.mjs`              | Unit tests for the three new pure functions, beside the project-routing block.                                                                                                                                                                                                   |
| `test/workflow-contracts.test.mjs`     | Contract tests for consumers, exemptions, the suppression literal at every returning delegation site, the `plan` recommendation and revision changes, and the documentation mirror.                                                                                              |

## Implementation details

### Approach

1. Write `src/shared/next-steps.md`: the contract section, then the marker-delimited table with
   columns `Tool | Condition | Then | Or`. The `Tool` column is a plain name; edge cells are
   `{{SKILL:x}}` references so `validateRefs` catches a dead reference. Do not wrap an exposed-tool
   placeholder in extra backticks — `{{SKILL:build}}` already renders as a bare invocation.
2. Add the pure checkers to `build-lib.mjs`, modelled on `parseProjectRoutingTable`: exactly one
   start and end marker, fixed headers, valid separator row, at least one data row, per-cell trim
   and em-dash-to-empty normalization, non-empty `Tool` and `Then`, no duplicate `Tool`+`Condition`
   pair. `assertNextStepsContract(edges, { emittingTools })` additionally checks that at most two
   edges are given per row, that every edge cell is a resolvable `{{SKILL:x}}` reference, and that
   the `Tool` column and the emitting set cover each other **in both directions**.
   `findNextStepsDocViolations` compares the parsed edges against the table in
   `docs/user-guide/tool-flow.md` after the documented normalization: resolve `{{SKILL:x}}` to its
   **Claude** rendered form (`/effective-flow x`, consistent with the existing docs guard at
   `build.mjs:1136-1142`), strip surrounding backticks, map `—` to empty, trim.
3. Wire the guard into `build.mjs` directly after the project-routing guard (line 497), where
   `knownTools`/`knownAgents` are already in scope. Derive `emittingTools` there as the tool file
   list (`build.mjs:399`) minus the exemption set — the fence-based detection in `readSource` runs
   later and cannot feed this cross-check. Call `validateRefs` on the fragment source explicitly; a
   fragment is otherwise ref-validated only through its consumers.
4. Keep the per-file fence check in the `readSource` closure (`build.mjs:594-623`) as a separate
   assertion: a non-exempt `src/tools/*.md` lazily includes `next-steps` exactly once; an exempt tool
   includes it zero times. Exemption set with a one-line reason each: `version` (informational),
   `pr-review` (deprecated forwarder), `apply-plan`, `apply-review`, `apply-issues`, `plan-review`,
   `concept-review` (not user-invocable per `src/SKILL.md:21`; their states live on the invoking
   tool), `apply-review-remote` and `apply-review-commit-mechanics` (internal sub-files with no
   completion phase).
5. Add the fence and the completion-phase line to the 18 emitting tools. The completion phase gains
   one sentence: emit the next-step block per `next-steps` as the last element of the report. Delete
   the hand-rolled wording the block replaces, so no tool carries two competing recommendations.
6. Add `Next steps: suppressed` to every delegation payload whose result returns to the caller:
   `plan` → `plan-review` and → `plan-issue`, `review` → `plan-review` and → `concept-review`,
   `concept` → `concept-review`, `plan-issue` → `plan-review`, `apply` → `apply-plan`/`apply-review`/
   `apply-issues`, `merge-gate` → `iterate`. Explicitly **omit** it from `apply-plan`'s handoff to
   `build`/`fix`/`refactor`/`docs`, and state why at that call site.
7. Change `src/tools/plan.md` Phase 7 step 3: the final bullet no longer names
   `build`/`fix`/`refactor`/`docs`. The `**Recommended workflow:**` header field and its
   Feature/Bugfix/Refactoring/Documentation classification stay in the template.
8. Add the revision path to `src/tools/plan.md` Phase 1, after the legacy bulk migration in step 3:
   when the gateway returned type `plan`, lazily load `plan-reference-routing`, resolve the
   reference against the post-migration name, and apply the "Revision semantics" table above. Phase
   3's "write the plan file" then targets the resolved path — same path, no new dated file, no `-2`
   suffix.
9. Write `docs/user-guide/tool-flow.md` and add both index entries to `docs/user-guide/README.md`
   (en dash in the reading-order bullet, filename-as-link-text in the table, matching the existing
   style). Document the revision argument in `docs/user-guide/tools-understand.md`.
10. Run the `AGENTS.md:130-133` ownership check for the new shared include and record the outcome:
    `next-steps.md` is orchestration (routing and handoff), which `AGENTS.md:125-127` assigns to
    Effective Flow, so no `docs/developer-guide/skill-ownership.{json,md}` entry is expected. Add the
    entry only if the check says otherwise.
11. Add the tests, then run the full CI sequence.

### Emission contract (the fragment's prose half)

- **The last user-invocable tool of a run emits.** A delegation payload containing the literal line
  `Next steps: suppressed` means the receiving tool returns its result to its caller and emits
  nothing; the caller emits once, at the end. A handoff without that line means the receiving tool
  owns the rest of the run and emits itself.
- At most two options, most likely first, as the **last** element of the report, under a heading
  that follows the conversation language (interactive output, so no `language.*` surface applies).
- Each option is one line: the copy-paste-ready invocation with the run's real arguments (actual
  plan path, actual PR number, actual report path), followed by an em dash and at most about twelve
  words describing what that tool would do **from here** — not what the tool is in general.
- Never name an invocation whose argument the run does not have. If a condition's edge cannot be
  filled, drop that option; if neither can, emit nothing rather than a generic suggestion.
- When one run opened several pull requests, name the first one and state in that same line that the
  remaining ones follow the same way. Never exceed two options to cover them.
- Never start the follow-up tool. This is a recommendation, not a handoff; the existing automatic
  delegations are unaffected and remain outside this contract.
- **Chat only.** The block is never written into a pull-request comment, an issue comment, a commit
  message, or any persisted artifact.
- The block never replaces the run's own report; it is appended after it.
- No option is invented that is not in the table. A run whose state matches no row emits nothing.

### Edge cases

- **Run aborted or failed:** the block is emitted only for a completed run. A tool that aborts
  points at the blocking condition, as it does today.
- **`review` in publishing mode:** the 1st edge is `apply #<epic>`; the local report path is named
  only when findings were withheld locally.
- **`merge-gate` merged the PR:** `open-plans` is the useful next step; if the plan directory is
  empty, the block is omitted rather than falling back to a bare `plan`.
- **`plan <plan-file>` on an implemented or archived plan:** ask once — revise in place (which moves
  an archived file back and resets its status), start a new plan, or abort.
- **Deprecated alias `pr-review`:** stays a minimal forwarder; `merge-gate` emits the block, not the
  alias. Pinned by `test/workflow-contracts.test.mjs:2776`.
- **Budget on `review.md`:** at 675 of 700 rendered lines, the fence plus the branch sentences must
  stay terse; measure the printed budget line after the build.
- **`docs <report>` / `plan <report>` from `investigate`:** the investigation report path is not an
  apply source, so both consume it as scope text. That is today's behavior
  (`src/tools/investigate.md:132`) and is not made worse here.

## Acceptance criteria

- [ ] `src/shared/next-steps.md` exists, contains exactly one marker-delimited table, contains no
      ` ```lazy-include ` fence, and states both the last-user-invocable-tool rule and the
      `Next steps: suppressed` signal.
- [ ] Every `src/tools/*.md` outside the exemption set lazily includes `next-steps` exactly once and
      every exempt tool includes it zero times, checked as `count(src/tools/*.md) − |exemptions|`
      rather than a hard-coded number; `node build.mjs` fails on either violation.
- [ ] `node build.mjs` fails when the table's markers, headers, separator, per-row edge count, or
      edge-target validity is broken; when a non-exempt tool has no row or a row names a
      non-emitting tool; and when `docs/user-guide/tool-flow.md` disagrees with the fragment table.
- [ ] Every delegation site whose result returns to its caller carries the literal
      `Next steps: suppressed`, and `apply-plan`'s handoff to the implementation tools does not;
      covered by a contract test that enumerates the sites.
- [ ] `src/tools/plan.md` no longer recommends `build`/`fix`/`refactor`/`docs` to the user at
      completion, while `**Recommended workflow:**` and its four categories remain in the plan
      template and in `open-plans`' Workflow column.
- [ ] `plan <existing-plan-file>` revises that file in place — same path, appended dated plan-review
      subsection, preserved legacy H1, no second dated file — and asks before changing the
      `**Recommended workflow:**` value or moving an archived plan; covered by contract tests.
- [ ] `dist/{claude,codex,portable}/effective-flow/shared/next-steps.md` all exist after a build and
      contain no unresolved `{{...}}` placeholder.
- [ ] The `node build.mjs` context-budget line reports `review` at 685 lines or fewer, i.e. at least
      15 lines of remaining headroom.
- [ ] `docs/user-guide/tool-flow.md` is linked from `docs/user-guide/README.md` in both the reading
      order and the document table.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all pass.

## Validation plan

- `pnpm agent:check` — oxfmt over the new and changed Markdown. See the open point below.
- `pnpm test` — new unit tests in `test/build-lib.test.mjs` (parser accepts the live table; rejects a
  missing marker, a wrong header, three edges in one row, an unknown edge target, a duplicate
  `Tool`+`Condition` pair, a tool with a fence but no row, and a row for a tool without a fence;
  `findNextStepsDocViolations` flags one mismatching row per column) and new contract tests in
  `test/workflow-contracts.test.mjs` (consumer derivation with a non-vacuity assertion, non-stale
  exemptions, the suppression literal present at every returning delegation site and absent at the
  `apply-plan` handoff, `plan.md` recommendation and revision changes, documentation mirror).
- `node build.mjs` — guard exercised for real; read the printed context-budget report for `review`.
- `pnpm test:distribution` — the fragment and the new user-guide page survive archive, delivery
  staging, and install.
- Manual spot check of the rendered output: `dist/claude/effective-flow/tools/plan.md` shows the
  load pointer, and `dist/claude/effective-flow/shared/next-steps.md` shows resolved invocations.

## Assumptions and open points

- **Assumption:** the edge map above is the intended graph. It was derived from the tool sources,
  not from usage telemetry; individual rows are cheap to change later since they live in one table.
- **Assumption:** the emission heading follows the conversation language, consistent with the
  language-rules statement that interactive, non-persisted replies do. The block is not persisted to
  any artifact, so no `language.*` surface applies.
- **Known limit (deliberate):** the acceptance criteria check static structure and the presence of
  the suppression literal. That a run actually closes its report with two state-accurate options is
  a prompt-level contract and cannot be asserted mechanically — the same limit every other Effective
  Flow behavior contract carries. The suppression signal is what moves the double-emission risk from
  unverifiable to checked.
- **Open point (pre-existing, out of scope):** `npx oxfmt --check .` is currently red on
  `docs/plan/2026-08-09-session-self-rename.md`, an untracked file from another session. It will
  make the CI "Format check" step fail regardless of this change and should be formatted or removed
  before delivery.
- **Open point (deliberate):** `docs/user-guide/tool-flow.md` duplicates the fragment table. The
  duplication is accepted because the guard reconciles both sides mechanically; without the guard
  this would violate the repository's no-second-copy rule.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    2 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    1 |
| Testability     |        0 |         0 |    1 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    1 |

### Pass 1 — internal plan review (2026-08-09)

Obtained through `codebase-improvement`. Two critical and five important findings, all incorporated:
double emission under nested delegation; an unbacked `plan <plan-file>` iteration edge; a free-text
`<recommended workflow>` cell that the specified guard could not accept; a missing two-way coverage
cross-check; a false `apply-plan` exemption rationale; argument-less `review`/`plan` edges resolving
to the wrong scope; and a stale context-budget number (675, not 664).

### Pass 2 — deep interactive plan review (2026-08-09)

Thirteen directly incorporable findings were applied: the revision target now resolves after the
legacy bulk migration; only `plan-reference-routing`'s resolution and status sections apply in
revision mode; one question instead of two on an implemented or archived plan; the doc mirror pins
the Claude rendering form; the `Tool` column is plain text so internal names do not surface as file
paths; `open-plans` recommends argument-less `apply` instead of a heuristically picked file; `setup`
and `cleanup` became conditional so they never point at a tool that would find nothing; `commit`
collapsed to one unconditional edge it can actually determine; `plan <topic>` and the
`concept | declined → plan <work package>` edge were dropped as arguments the run does not hold; the
guard derives its emitting set at the point where the file list exists; the block is declared
chat-only for every forge-writing tool; and the emitting count is a formula, not the literal 22.

Three decision-requiring points were resolved with the user:

1. **Unreachable internal tools.** All five non-invocable tools are exempt; their terminal states
   move to the invoking tool (`apply`, `review`, `concept`). `apply` leaves the exemption set. This
   removed ten dead rows and four edges that led into terminals which recommended nothing.
2. **Delegate detection.** A literal `Next steps: suppressed` line in the delegation payload,
   following the existing `Summary comment: suppressed` convention, replaces prompt-level inference
   and makes the rule statically assertable.
3. **Revision semantics.** Full revision with confirmation on header changes, an appended dated
   plan-review subsection, a preserved legacy H1, and an archived plan moved back with its status
   reset.

### Findings

- **Scope, Important:** touching 18 tool sources, five exemption sites, nine delegation payloads,
  and a new `plan` capability in one change is broad. Mitigated by keeping each tool's diff to a
  fence plus one sentence and by deleting exactly the hand-rolled wording the block replaces; the
  guard turns an omission into a build failure rather than a silent gap. Accepted rather than split,
  because a partially adopted contract is worse than none: the guard cannot land until every
  non-exempt tool complies, and the `plan` revision path cannot be deferred because a shipped edge
  would otherwise name behavior that does not exist.
- **Architecture, Note:** the `Condition` column carries free text that the build validates only for
  non-emptiness. An enumerated vocabulary was considered and rejected as over-engineering at this
  table size.
- **Architecture, Note:** `apply <plan-file>` is better than a direct `build <plan-file>` because it
  removes a confirmation round and centralizes the routing read — not because it prevents a wrong
  route. `plan-reference-routing.md:41-43` already makes a mismatch visible and fail-safe.
- **Error cases, Note:** "emit nothing when no row matches" is the deliberate failure mode, and two
  end states rely on it. It is quiet, but a wrong recommendation is worse than none — precisely the
  defect this plan fixes.
- **Testability, Note:** the doc-mirror comparison depends on a normalization that must match the
  Claude render path exactly; it is specified in Approach step 2 and unit-tested per column.
- **Maintainability, Note:** the derived consumer rule means a newly added tool fails the build until
  it opts in or is exempted, and a new returning delegation fails until it carries the suppression
  line. That friction is intended and is documented in `AGENTS.md`.

## Deviations from the plan

Six things the implementation had to decide differently. Each is now the shipped behavior.

1. **`plan` → `plan-issue` is a handoff, not a returning delegation.** Approach step 6 listed it
   among the sites carrying `Next steps: suppressed`, but `plan-input-gateway` ends the `plan` run
   immediately at that handoff, so suppressing the delegate would have silenced both sides.
   `plan-issue` is exposed and now emits for itself.
2. **Four further returning-delegation sites were found in review.** The plan enumerated only
   tool → _internal_ tool sites. `src/shared/worktree-integration.md` (the `pr` completion action,
   included by six tools), `apply-review` (per-finding sub-agents), `apply-issues` (per-issue
   delegation plus its internal `pr` call) and `iterate` (per-item delegation) all hand work to an
   emitting tool and take the result back. Without the literal, a default
   `/effective-flow build <plan>` run emitted twice. The contract's headline rule was reworded:
   **every** delegation that returns control carries the line, not only one to a non-invocable tool.
3. **The table grew from 41 to 43 rows.** A `review | pull-request mode` row was added because three
   rows recommended `review <PR>`, a state that matched no row and therefore dead-ended; and
   `concept | deep review done` was split into `ready` / `open points remain` so a concept returning
   `Revision required` is not recommended for planning first.
4. **`no PR` became `delivery branch retained, no PR`, and the merged state carries no row.**
   `delivery.completion` defaults to `merge`, after which the checkout is back on the base branch —
   so the planned `pr` edge would have recommended an invocation that cannot succeed on the default
   configuration. `commit | always` likewise became a determinable condition.
5. **The revision path asks unless the reference was exact and the plan is open.** The gateway
   classifies a bare title slug as a plan reference, so `plan caching` could have silently rewritten
   an unrelated `2026-01-01-caching.md`. Only a full path or date-slug file name on an open plan
   enters revision mode without a question.
6. **The status reset on a revision run is unconditional**, not archive-only. A plan left at
   `Implemented` inside `<plan.dir>/` would have made the emitted `apply <plan-file>` reopen the
   implemented-plan question the revision had just answered.

## Test results

| Check                    | Result                                                                         |
| ------------------------ | ------------------------------------------------------------------------------ |
| `pnpm agent:check`       | passed — 273 files                                                             |
| `pnpm test`              | passed — 528/528, 0 failures                                                   |
| `node build.mjs`         | exit 0 — 19 tools (+8 internal), 15 agents per harness                         |
| `pnpm test:distribution` | passed — offline checks                                                        |
| Context budget           | `build 531, fix 427, docs 560, review 683, plan 549` (budget 700, target ≤685) |

New coverage: 11 unit tests in `test/build-lib.test.mjs` for the parser, the contract assertion and
the doc-mirror checker, plus 6 contract tests in `test/workflow-contracts.test.mjs` for the derived
consumer set, non-stale exemptions, the per-site suppression literal, and the `plan` recommendation
and revision changes. Every acceptance criterion was verified independently by
`effective-flow-code-validator`.

## Review findings

**Date:** 2026-08-09
**Reviewer:** `effective-flow-generic-product-reviewer`, `effective-flow-nodejs-reviewer`

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    26 |
| Open / Not implemented |     5 |

Fixed: 2 Critical (double emission through returning delegations into emitting tools; the fuzzy
title-slug revision overwrite), 8 Important, 16 Note.

**External review report:** `.effective-flow/review/review-report-2026-08-09-plan-next-step-recommendations.md`

## Open points

- No open points.
