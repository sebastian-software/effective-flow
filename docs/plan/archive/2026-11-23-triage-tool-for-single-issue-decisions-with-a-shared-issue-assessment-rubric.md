# Triage tool for single-issue decisions with a shared issue-assessment rubric

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

The owner wants a tool that assesses an issue from **any** author (maintainers, contributors,
external reporters) in the context of this project. It returns exactly one decision:

- **reject**: the issue should be declined;
- **implement**: the change should be made;
- **needs-work**: the decision cannot be taken yet, and the missing information is listed.

The criteria the owner asked for in the session "Issue auf Architektur und Machbarkeit bewerten"
are part of the assessment:

1. fit with the current architecture;
2. danger (risk) to the project;
3. feasibility;
4. a general summary of what should change and why.

The owner chose three more criteria in this run: duplicate or overlap with existing work, value
versus cost, and evidence and compatibility. They decided against a separate scope/ownership
criterion (see Assumptions).

No tool does this today. Parts of the judgment exist in more than one place, so the owner also
asked to recut the adjacent tools and keep each judgment in exactly one owner:

- `backlog-audit` alone builds a cited architecture summary (Phase 2 leaf
  `backlog-audit/architecture-context`). It also alone defines `obsolete-architecture`,
  `oversized` and `overlap`, each mixed with goal relevance (`src/tools/backlog-audit.md`, Phase 3).
- `issue-buddy` alone applies planning readiness R1–R4. Its source is
  `src/shared/planning-readiness.md`, which is bound to trusted text and to a three-line output.
- `apply-issues` has its own sufficiency judgment (`src/tools/apply-issues.md`, Phase 3). It
  answers a different question, "implementable without a plan?", and stays separate (see
  Architecture decisions).
- No tool rates risk to the project.
- Permission proof exists twice: in `backlog-audit-core.mjs` (`permissionProve`, `trustedAuthor`)
  and in `issue-buddy-core.mjs` (`trusted()`, write/admin only).

The workflow is **Feature**. It adds a new exposed tool with new user-visible behaviour, and the
recut of the existing tools preserves their behaviour.

## Outcome checkpoint

**Primary source:** Owner request in this session, 2026-11-23, building on the reference session
"Issue auf Architektur und Machbarkeit bewerten" from the same day.
**Original outcome:** `effective-flow triage <issue…>` returns a cited reject / implement /
needs-work decision for issues from any author. Every item-intrinsic judgment it uses has exactly
one owning fragment, shared with `backlog-audit` and `issue-buddy`.
**Last evaluated attempt:** None.
**No-progress count:** 0
**Cumulative approach:** None yet. Reusable parts exist: the `backlog-audit` architecture leaf,
snapshot and permission proof; `planning-readiness`; the scoped exception in the input-trust
boundary.
**Continuation decision:** None.

## Architecture decisions

### Tool shape

- **New exposed tool `triage`**, in the "Understand what to do" group of `TOOL_GROUPS`
  (`build.mjs`), placed between `plan-issue` and `issue-buddy`.
- It is interactive only and refuses `Run state:` envelopes, as `backlog-audit` does. It is not an
  automation tool.
- Rationale: a decision on an external issue needs a human gate before anything is posted.
- The tool answers "should this be done at all?". It is not a planner. The reference session
  described `plan-issue` as aiming at an executable plan rather than an assessment, and that
  boundary stays.

### Rubric: two fragments, one owner per judgment

`src/shared/issue-assessment-criteria.md` is small and eager, and both `backlog-audit` and
`triage` include it. It defines three **item-intrinsic** scales that apply to an issue or a local
plan alike:

- `A2 architecture-fit`: `fits` / `needs-adaptation` / `contradicts`. `contradicts` cites at least
  one repository file as `path[:line]`, never the summary alone.
- `A4 size`: `S` / `M` / `L` / `oversized`, meaning too large for one plan. This is the only
  definition of "fits one plan". Readiness R3 refers to it (owner decision).
- `A5 overlap`: `none` / `overlap` / `duplicate` / `already-implemented`. Each of the last three
  carries a target: an issue, a plan or a `path[:line]`. It also carries `blocking: true|false`,
  meaning whether the target makes this item redundant.

`src/shared/issue-assessment.md` is included only by `triage`. It owns:

- `A1 summary`: a neutral restatement of what should change and why, at most 600 characters,
  quoting no issue text;
- `A3 risk`: `low` / `medium` / `high`. Its dimensions are security and trust surface, shipped
  contracts and compatibility, data or state loss, release, and supply chain. Each named risk
  carries a mitigation or `mitigable: false`. Maintainer burden is **not** part of A3; it belongs
  to A6 only;
- `A6 value-vs-cost`: `value-exceeds` / `balanced` / `cost-exceeds`, with beneficiaries and costs
  (maintenance, complexity, always-loaded prompt length);
- `A7 evidence-and-compatibility`: `sufficient` / `gap`. It covers reproducibility on the current
  base for bugs, breaking-change and migration impact, and the existence of a smaller alternative;
- the readiness projection, in the form of a JSON field `readiness: {passed: [..], failed: [..]}`
  over the generalized R1–R4 (next decision);
- the verdict mapping;
- the question form: each question is addressed to `author` or `maintainer`;
- the leaf JSON schema, one object per issue.

Rationale (owner decision): `backlog-audit` pays only for the three definitions it uses, as
`AGENTS.md` "Writing prompt text" rule 1 requires. Each judgment keeps one owner.

**Loading in `triage`.** Only the assessment leaf applies the rubric, and the helper enforces the
mapping. `triage.md` therefore loads none of the three fragments eagerly:

- a ` ```lazy-include ` at the Phase 4 decision point points to `issue-assessment-criteria`,
  `issue-assessment` and `planning-readiness`;
- the orchestrator hands the leaf their shipped paths (`shared/<name>.md`), never pasted text;
- this matches how `issue-buddy` loads `planning-readiness` lazily at its leaf brief
  (`src/tools/issue-buddy.md`).

### Planning readiness generalized (owner decision)

`src/shared/planning-readiness.md` separates three things:

- the criteria R1–R4. R3 is redefined as "A4 is not `oversized`" and refers to
  `issue-assessment-criteria` instead of carrying its own size definition (owner decision).
  `issue-buddy` already loads `planning-readiness` lazily at its leaf brief. It hands the readiness
  leaf the criteria fragment's path as well, which adds nothing to its eager core;
- the input scope, stated by the caller: `issue-buddy` passes trusted, already filtered text;
  `triage` passes quoted text from any author, and its R4 counts direction questions from **any**
  commenter as unresolved;
- the output projection: the existing three-line form stays `issue-buddy`'s projection, with no
  change to the strings the `issue-buddy` orchestrator validates (`src/tools/issue-buddy.md`,
  pinned by `test/issue-buddy-contract.test.mjs`), and the JSON field above is `triage`'s
  projection. `planning-readiness` stays the readiness owner.

An untrusted direction question under R4 can only block `implement`, so the issue lands in
`needs-work`. It never grounds a `reject`. The cost of re-entry that such a question triggers is
bounded by `--max`.

The contract test `test/unattended-planning-contract.test.mjs` is updated so that it pins the
three-line projection and names the single-owner invariant.

### Verdict mapping (fail-safe)

The mapping is defined once in `issue-assessment.md` and enforced by `triage-core.mjs`
`verdicts-validate`.

`reject` requires at least one cited ground:

- A2 `contradicts`;
- A5 `duplicate` or `already-implemented` with `blocking: true`;
- A3 `high` with a risk carrying `mitigable: false`;
- A6 `cost-exceeds`, with a rationale.

`implement` requires every one of these:

- `readiness.failed` is empty; this includes R3, so A4 is not `oversized`;
- A2 is not `contradicts`;
- A3 has no `mitigable: false` risk;
- A5 has `blocking: false`;
- A6 is not `cost-exceeds`;
- A7 is `sufficient`.

Every other combination, and any doubt, is `needs-work`. A `needs-work` verdict carries at least
one question.

When a reject ground holds, both `reject` and `needs-work` are valid. The leaf chooses
`needs-work` only when a named question could remove the ground. The mapping is total: every
rating combination yields exactly one permitted verdict set, and the helper rejects any verdict
outside it.

Rationale: an external issue is never marked `implement` on a guess.

### Recut of `backlog-audit`

- `backlog-audit` keeps its verdict names, JSON shape, its goal-relative verdicts (`core`,
  `supporting`, `drift`, `unclear`) and its single-verdict precedence.
  `backlog-audit-core.mjs` validation stays unchanged.
- `overlap` applies only when the A5 target is an item in the audit inventory, because the
  validator accepts only inventory ids as `overlapTarget`. Other targets (a `path[:line]`, an issue
  outside the scope) and `already-implemented` become rationale and evidence under the
  goal-relative verdict (owner decision).
- Phase 3 defines `oversized` as "goal-relevant **and** A4 `oversized`", `overlap` as "A5 `overlap`
  or `duplicate` with an in-inventory target", and `obsolete-architecture` as "A2 `contradicts`". It refers to
  `issue-assessment-criteria` for the item-intrinsic part instead of restating it.
- The Phase 2 architecture-context brief **text** moves to `src/shared/architecture-context.md`.
  The spawn instruction and the `<!-- spawn-site:… -->` marker stay in each tool. As a result,
  `backlog-audit/architecture-context` keeps its row in `src/shared/model-tiers.md`, and
  `triage/architecture-context` gets a new one. The naming rule for markers inside shared
  fragments (`docs/developer-guide/build-system.md`) is therefore not triggered.

### Recut of `issue-buddy` (owner decision on the follow-up path)

- An issue carrying `effective-flow-triage-reject` or `effective-flow-triage-needs-work` is skipped
  under the existing `lifecycle-label` skip reason in `src/scripts/issue-buddy-core.mjs`. A
  rejected issue, or one with open triage questions, is never auto-planned.
- Recognized comments carrying a `<!-- effective-flow-triage` marker are dropped from trusted text before any
  model step. Unlike the `BACKLOG_AUDIT_SPLIT_MARKER`, which skips the whole issue as
  `plan-issue-comment`, only the comment is dropped. The triage comment carries text derived from
  untrusted authors under the runner's identity, and `docs/adr/input-trust-boundary.md` requires
  that such text be excluded deterministically.
- An issue with a recognized `<!-- effective-flow-triage security -->` comment is skipped as
  `lifecycle-label`. This check runs **before** triage-marker comments are dropped from trusted
  text. A security-relevant issue therefore cannot be auto-planned publicly, even though it carries
  no label.
- `issue-buddy` keeps its own permission filter (owner decision): write/admin only, fail-closed,
  unattended. It is documented as a deliberate, separate filter and not merged into the intake
  module.

### Guards in `plan-issue` and `apply-issues` (owner decision)

Both tools get the same guard for `effective-flow-triage-reject` that they already apply to
`effective-flow-goal-obsolete` (`src/tools/plan-issue.md`, `src/tools/apply-issues.md`):

- the mark is reported;
- an interactive run continues only after an explicit override in that run;
- a non-interactive delegation skips the issue;
- recognized triage-marker comments, including the security notice, are dropped from the issue
  context those tools pass to their analysis.

`docs/adr/input-trust-boundary.md` lists both tools as deterministic consumers. This change ships
in the `issue-buddy` pull request (see "Delivery staging").

### Separate on purpose

`apply-issues` sufficiency and the `plan-issue` open-point gate stay separate. They answer "can
this be implemented or planned now?" for an issue already accepted. `implement` hands over to them
and does not replace their gates.

### Intake module shared by `backlog-audit` and `triage`

- Extract into a new `src/scripts/issue-intake-core.mjs`:
  - the permission proof (`permissionProve`);
  - the per-author permission resolution and its cache;
  - the marker-trust rule (`trustedAuthor`).
- The extraction is **parametrized**. Today `permissionProve` carries `backlog-audit` specifics:
  its plans-only fallbacks, `BacklogAuditError` `instanceof` checks, and `forgeCapabilities` over
  `backlog-audit`'s `WRITE_ACTIONS` (`src/scripts/backlog-audit-core.mjs`). The shared module
  therefore takes the caller's error class and required write vocabulary as inputs. For `triage`,
  that vocabulary adds `issue-comment-update` and `issue-label-remove`.
- **Mode and permission matrix for `triage`** (owner decision):
  - in hidden mode (`visibility: hidden`), or when the runner's write permission is not proven,
    the run is **report-only**. It assesses and reports, offers no tracker write, and in hidden
    mode leaves no Effective Flow trace on the tracker;
  - a local or unset tracker mode stops, with a hint to `effective-flow setup`;
  - an external tracker stops in v1 (see Assumptions);
  - a matrix test covers every row.
- `backlog-audit-core.mjs` imports them with unchanged behaviour, and `triage-core.mjs` uses them
  too.
- These stay where they are:
  - `backlog-audit`'s backlog-wide snapshot, its bounds and its per-entry write precondition
    (`readTarget`, `preconditionSkip`);
  - `triage`'s single-issue snapshot and its fingerprint re-read, which live in `triage-core.mjs`.
- The fingerprint covers title, body, state and every comment except the runner's managed triage
  comment. It also covers labels other than the triage labels.

### Overlap index (owner decision)

The assessment leaf has no tracker access. A5 duplicate candidates therefore come from a bounded
**overlap index** that `inventory-build` writes next to the snapshot. It contains:

- number, title and state of the open issues and the issues closed in the last 180 days;
- the titles and paths of the plans under `plan.dir`, including `archive/`.

Titles are quoted third-party data, like the snapshot. The index has a size bound in the helper's
bounds check: if it is exceeded, the index is cut to the newest entries and the report says so.
Every assessment leaf receives the index path. An A5 issue target must be a number from the index,
and `verdicts-validate` rejects any other number.

### Trust

- Amend `docs/adr/input-trust-boundary.md` to extend the scoped exception of `backlog-audit` to
  `triage`, with the same mitigations:
  - the orchestrator never reads the snapshot;
  - the leaves receive issue text as quoted third-party data;
  - every write comes from a helper-built write set with a closed vocabulary;
  - the report flags authors without proven write permission;
  - a managed comment is **recognized** only when its author passes `trustedAuthor`; this covers
    selection, re-entry and the `issue-buddy` exclusion;
  - the **upsert** edits only the runner's own managed comment. If another trusted managed comment
    exists, for example from a second maintainer, the run writes the runner's own comment and
    reports the other one as superseded.
- Name the residual channels, with their deterministic exclusion:
  - the overlap index titles, which only the assessment leaf reads, as quoted data;
  - the A1 summary, which is length-bounded by the helper, is rendered only into the report and
    chat, and never enters drafts or decisions;
  - the triage comment, which `issue-buddy` drops as described above;
  - the triage labels.

### Writes

Default output is the report under `<RUNTIME_STATE_ROOT>/.effective-flow/triage/` plus a summary in
chat. After a preview of the exact comment and label, the user can confirm, separately for each
issue:

- one managed comment, updated in place on a re-run. Its marker
  `<!-- effective-flow-triage fp=<fingerprint> -->` records the fingerprint of the assessed
  state:
  - for `needs-work` it contains the questions addressed to the author;
  - for `reject` and `implement` it gives the cited rationale;
  - it never quotes the issue text, never names any author's permission status, and carries no
    AI-attribution or generation footer (`AGENTS.md` "No AI attribution");
- exactly one verdict label: `effective-flow-triage-reject`, `effective-flow-triage-implement` or
  `effective-flow-triage-needs-work`. A re-run swaps the previous triage label.

Writes are checked against the current state:

- A `needs-work` label is written only together with its managed comment, because the comment is
  the anchor for re-entry. For `reject` and `implement`, the comment stays optional.
- The helper re-reads the issue **once per issue**, before that issue's group of writes. If the
  fingerprint differs from the assessed snapshot, or the issue is closed, the group is skipped and
  reported as `stale`.
- If a write fails within a group, for example a label swap after the comment was written, the
  issue is reported as `partial`. A re-run converges to one managed comment and one triage label.
- Labels are created only after the gate, before the first issue write, and only those a
  confirmed entry needs (as in `backlog-audit`). A run that writes only comments creates no
  label. A failed creation stops all remaining writes in that run.

**Comment drafting.** One draft leaf runs per selected issue, as with `backlog-audit`'s split and
obsolete drafts.

- Its input is the validated rubric fields **without** A1, plus that issue's questions. It never
  receives the snapshot or another issue's data.
- `write-set-build` then checks every draft deterministically and rejects it if it contains:
  - a `<!--` sequence;
  - an attribution pattern;
  - a permission term;
  - a verbatim substring of 40 or more characters from that issue's snapshot.

The tool never closes, deletes or reassigns anything, and never sets
`effective-flow-needs-planning`. `implement` is handed over by the maintainer, through the next
steps `plan-issue <N>` or `apply <N>`.

### Re-entry for needs-work (owner decision)

`--untriaged` selects, in this order:

1. open issues with no triage label and no recognized managed triage comment (new issues);
2. **repair cases**: a recognized managed comment without its triage label, left by a `partial`
   run;
3. **re-entries**: `effective-flow-triage-needs-work` issues, and issues whose managed comment is
   the security notice, whose current fingerprint differs from the `fp=` value in their marker.

Within each group, the oldest issue comes first. The run stops at `--max` and reports the
remainder as `cutOff`. The fingerprint already excludes the managed comment and the triage labels,
so the run's own writes never cause a re-entry, and no timestamps are needed. The existing
comment helpers only expose `createdAt` (`src/scripts/remote-tracker-core.mjs`, `normalizeComment`).
Listing reads are bounded by a helper bounds check, as in `backlog-audit`'s `bounds-check`.

### Security-relevant issues (owner decision)

The rule is owned by `issue-assessment.md`. `security-disclosure-gate` is not reused, because it
classifies review findings before they are published.

When the assessment leaf flags `security: true`:

- the write set contains **no** verdict label;
- the only possible comment is a fixed, neutral notice with its own marker
  `<!-- effective-flow-triage security fp=<fingerprint> -->`, for example "Maintainers are handling
  this separately." (owner decision). The helper names a private reporting channel only when one
  resolves from `SECURITY.md` or `.github/SECURITY.md`. Otherwise the notice names none, as in this
  repository today. The notice is the deterministic anchor for the `issue-buddy`, `plan-issue` and
  `apply-issues` exclusions and for re-entry;
- the verdict is kept in the local report and in the chat summary, never on the tracker.

The notice signals publicly that the issue is sensitive. The owner accepted this as the price of a
deterministic anchor.

### Relation to `backlog-audit` labels

`effective-flow-goal-obsolete` marks an issue that contradicts the architecture relative to a
goal, and it keeps the issue open. `effective-flow-triage-reject` is the final project decision on
the issue itself. Both can coexist. The relation is documented in `issue-tracker-forge.md` and the
glossary.

### Model tiers

There are three spawn sites, each with a row in `src/shared/model-tiers.md`:

- `triage/architecture-context`: `standard`;
- `triage/assessment`: `deep`, one leaf per issue, with `--max` bounding the number of issues in a
  run (default 10, hard maximum 25);
- `triage/comment-draft`: `standard`.

### Skill ownership

Register `triage` in `docs/developer-guide/skill-ownership.json` as a route-when-relevant consumer
of three skills:

- `effective-delivery`, for feasibility and delivery risk;
- `effective-engineering`, for the A2 and A3 architecture and contract risk;
- `effective-product`, for A6 value.

The rubric keeps only the scales and a minimal fallback, never a domain playbook.

### Terminology

"triage" already names the "high-risk triage" in `iterate`, `review` and `model-tiers`. A glossary
entry distinguishes the two. The owner chose the tool name.

## Affected files

| File                                                                                                 | Description                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/issue-assessment-criteria.md`                                                            | New, eager: A2, A4 and A5 item-intrinsic scales                                                                                                                      |
| `src/shared/issue-assessment.md`                                                                     | New, triage-only: A1, A3, A6, A7, readiness projection, verdict mapping, security rule, question form, leaf JSON schema                                              |
| `src/shared/architecture-context.md`                                                                 | New: architecture-summary leaf brief text, moved from `backlog-audit` Phase 2                                                                                        |
| `src/shared/planning-readiness.md`                                                                   | Separate criteria, caller-stated input scope and output projections; three-line strings unchanged                                                                    |
| `src/tools/triage.md`                                                                                | New exposed tool: arguments, phases, gates, spawn sites, next steps, `contextBudget`                                                                                 |
| `src/scripts/issue-intake-core.mjs`                                                                  | New: parametrized permission proof, per-author permission resolution and cache, marker-trust rule, extracted from `backlog-audit-core.mjs`                           |
| `src/scripts/triage-core.mjs`, `src/scripts/triage.mjs`                                              | New helper pair: inventory, verdict validation, report write, label precondition, write-set build and apply                                                          |
| `src/scripts/backlog-audit-core.mjs`                                                                 | Import the extracted intake functions; behaviour unchanged                                                                                                           |
| `src/tools/backlog-audit.md`                                                                         | Include `issue-assessment-criteria` and the `architecture-context` text; Phase 3 refers to A2, A4 and A5; budget re-measured                                         |
| `src/scripts/issue-buddy-core.mjs`                                                                   | Skip `triage-reject` and `triage-needs-work` as `lifecycle-label`; drop triage-marker comments from trusted text                                                     |
| `src/tools/issue-buddy.md`                                                                           | Name the new skips and the separate permission filter; budget re-measured                                                                                            |
| `src/tools/plan-issue.md`, `src/tools/apply-issues.md`                                               | `triage-reject` guard like `goal-obsolete`; drop recognized triage-marker comments from issue context; budgets re-measured                                           |
| `src/tools/cleanup.md`                                                                               | New removable class for finished triage reports                                                                                                                      |
| `src/shared/issue-tracker-forge.md`                                                                  | Three triage labels, their meaning and the relation to `goal-obsolete`                                                                                               |
| `src/shared/model-tiers.md`                                                                          | Rows `triage/architecture-context`, `triage/assessment`, `triage/comment-draft`, each with tier and the `Down` and `Panel` columns                                   |
| `test/delegation-mandate-contract.test.mjs`                                                          | Add `triage` to `EXPECTED_EAGER_INCLUDE_TOOLS`                                                                                                                       |
| `src/shared/next-steps.md`                                                                           | Edge rows for `triage` outcomes                                                                                                                                      |
| `build.mjs`                                                                                          | `TOOL_GROUPS` and `RUNTIME_SCRIPT_FILES` (three scripts). No `WORKFLOW_EDGES` entry: `triage` only suggests the exposed `plan-issue` and `apply` and never runs them |
| `docs/adr/input-trust-boundary.md`                                                                   | Extend the scoped exception to `triage`; residual channels and their exclusions                                                                                      |
| `docs/adr/issue-assessment-rubric.md`                                                                | New ADR: two-fragment rubric ownership, generalized readiness, fail-safe verdict mapping                                                                             |
| `docs/developer-guide/skill-ownership.json`, `docs/developer-guide/skill-ownership.md`               | Consumer entries for `triage`                                                                                                                                        |
| `docs/user-guide/remote-tracker.md`                                                                  | The three triage labels next to the existing lifecycle labels                                                                                                        |
| `docs/user-guide/tools-understand.md`, `docs/user-guide/tool-flow.md`, `docs/user-guide/glossary.md` | User docs; relation to `backlog-audit`, `plan-issue` and `issue-buddy`; the two meanings of "triage"                                                                 |
| `README.md.src`, `README.md`                                                                         | Catalog entry; regenerate with `mise run readme:write`                                                                                                               |
| `test/issue-intake-core.test.mjs`                                                                    | New: extracted functions, fail-closed permission cases, fingerprint                                                                                                  |
| `test/triage-core.test.mjs`, `test/triage-contract.test.mjs`                                         | New: mapping, write set, stale skip, label precondition, security rule, untrusted handling, source invariants                                                        |
| `test/backlog-audit-core.test.mjs`, `test/backlog-audit-contract.test.mjs`                           | Unchanged in step 1; afterwards adjusted only for the moved brief text and the rubric reference, with no weakened assertion                                          |
| `test/issue-buddy*.test.mjs`                                                                         | Triage-label skips and the dropped triage-marker comment                                                                                                             |
| `test/plan-issue*.test.mjs`, `test/apply-issues*.test.mjs` (or their contract tests)                 | The `triage-reject` guard and the dropped triage-marker comment                                                                                                      |
| cleanup tests (`test/cleanup*.test.mjs`)                                                             | The triage-report class                                                                                                                                              |
| `test/unattended-planning-contract.test.mjs`                                                         | Pin the three-line projection of the generalized readiness fragment                                                                                                  |
| `test/execution-profile-contract.test.mjs`                                                           | `EXPECTED_TOOLS` and the script list                                                                                                                                 |

## Implementation details

### Approach

1. **Extract the intake module, in its own refactor commit.** Move the permission proof, the
   per-author permission resolution and the marker-trust rule from `backlog-audit-core.mjs` into
   `issue-intake-core.mjs`, with no behaviour change. The extraction takes the caller's error
   class and write vocabulary as parameters. The existing `backlog-audit` tests must pass
   unchanged before step 2.
2. **Write the shared fragments.**
   - Write `issue-assessment-criteria.md`, `issue-assessment.md` and `architecture-context.md`.
   - Generalize `planning-readiness.md`.
   - Point `backlog-audit` Phases 2 and 3 at the criteria and the brief text.
   - Run the ownership check from `AGENTS.md`, and record each fragment's minimal fallback.
3. **Write the `triage` helper.** It implements:
   - `inventory-build`: explicit references, or `--untriaged [--max n]` with the re-entry rule.
     A pull-request reference, which `issue-read` rejects with `INVALID_PAYLOAD`
     (`src/scripts/remote-tracker-core.mjs`), is mapped to a per-reference `pull-request` skip and
     does not stop the run. Closed issues are reported but not assessed.
   - `verdicts-validate`: the mapping rules, the citations required for `reject` and
     `contradicts`, a question for `needs-work`, the length of A1, and the security rule. It
     returns no issue text.
   - `report-write`.
   - `labels-ensure`: creates only the labels that a confirmed entry needs, after the gate.
   - `write-set-build`: the deterministic draft checks under "Comment drafting".
   - `write-set-build` and `write-set-apply`: a closed vocabulary of `issue-comment-upsert`
     (runner-authored marker only) and `issue-label-swap`, with a fingerprint re-read and a
     `stale` skip.
4. **Write `src/tools/triage.md`.** It needs `description` and `catalogHint` frontmatter (strictly
   quoted), the eager `delegation-mandate` and `skill-discovery` includes, and a
   `## Recommended skills` section naming `effective-delivery`, `effective-engineering` and
   `effective-product`. Every leaf handoff carries the repository root and `plan.dir`. Phases, in
   order:
   1. Entry: refuse envelopes, resolve the tracker target, migrate the runtime directory.
   2. Inventory: helper plus permission proof.
   3. Architecture context: one leaf.
   4. Assessment: one `deep` leaf per issue, returning the rubric JSON. The lazy-include of the
      rubric fragments sits here.
   5. Validation: helper, with one retry on invalid output and escalation per the completion
      protocol after that.
   6. Report and chat summary.
   7. Drafts: one comment-draft leaf per selected issue, in `language.forge`, with the input
      stated under "Comment drafting".
   8. Gate: an exact preview for each issue, each confirmed separately.
   9. Apply.
   10. Completion with next steps.
5. **Recut `issue-buddy`.** Add the two label skips and the dropped triage-marker comment, each with
   a test.
6. **Wire build, docs and ADRs.**
   - Add the `TOOL_GROUPS` entry and `RUNTIME_SCRIPT_FILES`.
   - Add the model-tier rows and the next-step rows.
   - Write the ADR amendment and the new ADR.
   - Update the user guide, the glossary, the README and skill ownership.
   - Re-measure `contextBudget` from the `node build.mjs` report for `triage`, `backlog-audit` and
     `issue-buddy`.
7. **Handle eval evidence.** The router catalog changes, which all five suites seed, and
   `build-context` additionally hashes `tools/` and `scripts/`.
   - Run `pnpm eval <suite> verify` for `merge-gate`, `iterate`, `next-steps`, `build-context` and
     `focus`.
   - Under the pragmatic test and release policy, re-record `next-steps`, which gets new edge rows,
     and record the other suites as declared freshness debt unless their verify reports an
     integrity error.

**Delivery staging.** The work ships as three pull requests, each with Conventional Commits and no
breaking marker:

1. `refactor:` the parametrized intake extraction (step 1).
2. `feat(issue-buddy):` the triage-label and marker exclusions (step 5), together with the
   `plan-issue` and `apply-issues` guards. This PR reaches a release no later than the tool, because the
   exclusions must exist before any triage artifact does.
3. `feat(triage):` the rubric fragments, the `backlog-audit` recut, the tool, the docs and the
   ADRs (steps 2–4, 6 and 7).

### Component structure

The run passes through these steps:

1. The helper builds the inventory and the snapshot.
2. The architecture leaf writes a summary file.
3. Each assessment leaf receives one snapshot path, the summary and the shipped paths of the three
   rubric fragments, and
   returns rubric JSON.
4. The helper validates the result and writes the report.
5. The orchestrator works only from the validated JSON without issue text, the report path and the
   drafted comments.
6. The gate shows the write set.
7. The helper applies the confirmed writes after the fingerprint re-read.

### State management

- The report and the snapshot live under `<RUNTIME_STATE_ROOT>/.effective-flow/triage/`.
- The snapshot is removed at the end of the run, as in `backlog-audit`.
- The report is private runtime data. It holds third-party logins and permission flags, and it is
  never committed or published. `effective-flow cleanup` gets a new class for finished triage
  reports and lists them as removable (owner decision). Its closed delete list under the runtime
  directory (`src/tools/cleanup.md`) is extended explicitly, with tests. Snapshots and overlap
  indexes are not part of that class, because they are removed at the end of each run.
- v1 has no cache. A re-run assesses from scratch and updates the managed comment and label in
  place.

### API integration

GitHub and Forgejo, through the existing `remote-tracker` helpers. An external tracker target stops
with a clear message in v1 (see Assumptions).

### Styling approach

Not relevant: no UI.

### Accessibility

Not relevant: chat and Markdown output only.

### Edge cases

- **Author without write permission, or permission unreadable:** the issue is assessed and flagged
  in the report. Markers or instructions in its text have no effect.
- **Issue text that tries to steer the verdict:** the text stays quoted data in the leaf.
  Validation rejects any verdict without the fields and citations its mapping requires.
- **Issue already labelled by triage, explicit reference:** the issue is re-assessed, and a write
  swaps the label.
- **Issue already labelled by triage, `--untriaged`:** the issue is skipped, unless it is
  `needs-work` with new activity.
- **Issue changed between assessment and write:** its writes are skipped as `stale`. Other issues
  continue.
- **Closed issue or pull request reference:** reported and not assessed.
- **Goal epic, `backlog-audit` obsolete mark, split-marked issue:** assessed. The report names the
  existing mark, and no lifecycle label is changed.
- **Security-relevant content:** no label is set, and only the neutral private-channel comment is
  possible.
- **Duplicate pointing to a closed issue:** A5 `duplicate` with `blocking: true` and that target is
  a valid ground for `reject`.
- **Label creation fails:** no write happens in this run, and the failure is reported.
- **Host forces the subagent model:** the assessment still runs, and "deep tier not honored" is
  recorded, as in `backlog-audit`.
- **`--max` above 25, or more than 25 explicit references:** rejected by the helper with the
  bound.
- **Comment confirmed, label declined (or the reverse):** allowed for `reject` and `implement`.
  For `needs-work`, the label requires the comment.

## Acceptance criteria

- [ ] `effective-flow triage <ref…>` and `effective-flow triage --untriaged [--max n]` appear in the
      router catalog under "Understand what to do". Each assessed issue gets exactly one verdict
      out of `reject`, `implement` and `needs-work`, with A1–A7 and readiness, in chat and in the
      report.
- [ ] `test/triage-core.test.mjs` contains these invalid cases:
  - one for each `implement` condition (failed readiness, including R3 with A4 `oversized`; A2
    `contradicts`; unmitigable A3; blocking A5; A6 `cost-exceeds`; A7 `gap`);
  - one A5 issue target that is not in the overlap index;
  - one `reject` without any of its grounds;
  - one `needs-work` without a question;
  - one A1 above the length bound;
  - one security-flagged write set containing a label, or a comment that is not the fixed notice,
    or any comment when no private channel resolves;
  - one positive case each for `reject` and for `needs-work` under a reject ground;
  - explicit references or `--max` above 25.
- [ ] `--untriaged` selection test, with three cases:
  - it picks new issues, then repair cases, then re-entries, oldest first within each group;
  - it re-enters `needs-work` and security-notice issues only when the fingerprint differs from
    the marker's `fp=` value, and never because of the run's own writes;
  - it reports the remainder beyond `--max` as `cutOff`.
- [ ] Against a tracker stub:
  - no tracker write happens without user confirmation;
  - after confirmation and one re-run, the issue has exactly one runner-authored
    managed triage comment and exactly one triage label;
  - a comment and a label on the same issue are both written, with no self-induced `stale`;
  - a fingerprint change between assessment and write yields `stale` and no write;
  - a failed `labels-ensure` yields no further write;
  - a confirmation of comments only creates no label;
  - when a second trusted maintainer's managed comment exists, the run writes its own comment
    and reports the other one as superseded, and recognition still finds both;
  - a failure between comment and label yields `partial`, and a re-run converges.
- [ ] `write-set-build` rejects a draft that contains `<!--`, an attribution pattern, a permission
      term, or a verbatim snapshot substring of 40 or more characters (unit test). Separately, the
      contract test pins the instruction in the draft-leaf brief.
- [ ] A test proves that the orchestrator-facing helper output contains no issue body or comment
      text, and that untrusted-author issues are assessed and flagged.
- [ ] `issue-intake-core.mjs` is the only permission-proof, permission-resolution and
      marker-trust implementation used by `backlog-audit` and `triage`, and
      `backlog-audit-core.mjs` imports it. The existing
      `backlog-audit` tests pass without weakened assertions. `issue-buddy`'s filter remains
      separate, as documented.
- [ ] A contract test, named after the single-owner invariant, proves three things:
  - the scale anchors `` `fits` / `needs-adaptation` / `contradicts` ``,
    `` `S` / `M` / `L` / `oversized` `` and `` `none` / `overlap` / `duplicate` / `already-implemented` ``
    and the citation sentence of A2 appear in no `src/` file except
    `issue-assessment-criteria.md`;
  - `backlog-audit` Phase 3 contains the rubric reference and none of the removed definition
    phrases ("contradicts the current architecture", "duplicates or partly covers");
  - R1–R4 are defined only in `planning-readiness.md`.
- [ ] `issue-buddy` skips, as `lifecycle-label`, issues labelled `effective-flow-triage-reject` or
      `effective-flow-triage-needs-work` and issues with a recognized security notice. The
      security check runs before triage-marker comments are dropped from trusted text (unit
      tests).
- [ ] `plan-issue` and `apply-issues` report a `triage-reject` mark, require an explicit override
      in an interactive run, skip the issue in a non-interactive delegation, and drop recognized
      triage-marker comments from the issue context (contract tests).
- [ ] The mode matrix test shows: hidden mode and unproven write permission give a report-only run
      with no write offer; local or unset mode stops with the `setup` hint.
- [ ] The overlap index contains open issues, issues closed in the last 180 days and plans. It
      respects its size bound, and the report states when the index was cut (unit test).
- [ ] `effective-flow cleanup` lists finished triage reports as removable and leaves every other
      runtime file untouched (cleanup test).
- [ ] CI order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
      `pnpm test:distribution`, and `mise run readme:check`. `pnpm eval <suite> verify` reports no
      integrity error for any of the five suites.

## Validation plan

- Unit tests: `test/issue-intake-core.test.mjs`, `test/triage-core.test.mjs`, and the added
  `issue-buddy` cases.
- Contract tests:
  - `test/triage-contract.test.mjs`: single owner, spawn sites, no-close rule, gate before writes,
    and no-attribution rule in the draft contract;
  - updates to `test/backlog-audit-contract.test.mjs` and
    `test/unattended-planning-contract.test.mjs`.
- Build guards: `node build.mjs` checks the context budgets, spawn-site rows, workflow edges, the
  next-steps consumer and skill ownership.
- Distribution: `pnpm test:distribution` for the three new runtime scripts.
- Manual: one dry run (no confirmation) on a real issue from an external author in this
  repository, to check the report and the chat summary.
- Evals: `pnpm eval <suite> verify` for all five suites, and a re-record of `next-steps` per
  Approach step 7.

## Assumptions and open points

- The owner did not choose a separate scope/ownership criterion ("belongs in the sister skills
  repository or in project configuration?"). A6 can still argue that a change is cheaper
  elsewhere.
- v1 supports GitHub and Forgejo only. External trackers (`backlog-audit-external.md`) are a later
  extension through the same intake module.
- v1 has no caching or fingerprint cache across runs. The run bound `--max` (default 10, at most 25) limits the number of deep leaves.
- `apply-issues` sufficiency, the `plan-issue` open-point gate and `issue-buddy`'s permission
  filter stay separate by owner decision (see Architecture decisions).

- Delivery progress: Stage 1 merged as #710; Stage 2 opened as #713. Stage 2 recognizes the
  markers by the prefixes `<!-- effective-flow-triage ` and `<!-- effective-flow-triage security `
  (with the trailing space) at the start of a comment, so Stage 3 writes them as the comment's
  first characters.
- Owner decision (Stage 3): before a security notice is written, `triage` looks up open
  `issue-buddy` plan pull requests for that issue and names them in the local report, the chat
  summary and the gate preview, because `issue-buddy` skips the issue afterwards as
  `lifecycle-label`. It closes or changes nothing on them.

## Plan review

**Result:** Approved

The review ran in two rounds, judged by `effective-delivery` with `effective-engineering`.

- **Round 1** had 19 findings: 2 Critical, 10 Important and 7 Notes.
  - The two Critical findings were the triage comment as an untrusted channel into `issue-buddy`,
    and the trust and output mismatch of `planning-readiness`. Both are incorporated.
  - Five points were decided by the owner in the batch round: the readiness generalization, the
    separate `issue-buddy` filter, the two-fragment rubric, the security rule and the re-entry
    path.
  - All other round-1 findings are incorporated.
- **Round 2** was a full re-review after those owner answers changed trust and security sections.
  It is summarized below.

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         3 |    0 |
| Security        |        0 |         1 |    2 |
| Data protection |        0 |         1 |    0 |
| Error cases     |        0 |         2 |    2 |
| Testability     |        0 |         0 |    1 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         1 |    2 |

### Findings

- **Error cases, Important:** a fingerprint re-read before each write would have cancelled the
  label after the comment. Incorporated: one re-read per issue, and the fingerprint excludes the
  runner's own comment and the triage labels.
- **Architecture, Important:** the "unchanged behaviour" claim for the intake extraction did not
  hold for `backlog-audit`'s per-entry precondition. Incorporated: only the permission proof, the
  permission resolution and the marker trust are shared.
- **Data protection, Important:** `cleanup` does not cover the triage reports. The false claim is
  removed, and the retention decision is open point 1.
- **Architecture, Important:** R3 and A4 `oversized` judge the same thing. The decision is open
  point 2.
- **Security, Important:** `plan-issue` and `apply-issues` do not guard `triage-reject`. The
  decision is open point 3.
- **Error cases, Important:** `--untriaged` re-entry lacked an anchor. Incorporated: the anchor is
  the managed comment's last update, a `needs-work` label requires its comment, and the rule
  includes security-notice issues.
- **Maintainability, Important:** `WORKFLOW_EDGES` entries were wrong for suggested exposed
  tools. Incorporated: removed.
- **Architecture, Important:** A5 targets outside the inventory, and `already-implemented`, do not
  fit `backlog-audit`'s `overlapTarget`. The decision is open point 4.
- **Notes, all incorporated:**
  - corrected the `BACKLOG_AUDIT_SPLIT_MARKER` and readiness-parser descriptions;
  - made the verdict mapping total;
  - defined the `partial` outcome;
  - resolved the private security channel, with no comment when none exists, and added the
    `issue-buddy` skip for security notices;
  - bounded untrusted R4 questions;
  - added the missing acceptance-criteria tests;
  - added `docs/user-guide/remote-tracker.md`.

### Deep review 2026-11-23

Third judgment round (`effective-delivery` with `effective-engineering`), run as the deep
interactive review. It found 13 findings: 0 Critical, 8 Important, 5 Notes. The owner then
decided the four earlier open points.

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    0 |
| Security        |        0 |         2 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         3 |    1 |
| Testability     |        0 |         0 |    1 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        0 |         0 |    2 |

Findings:

- **Scope, Important:** A5 had no source of other issues. Decided: a bounded overlap index.
- **Error cases, Important:** the re-entry anchor relied on a comment update time that the
  helpers do not expose, and the run's own writes would have triggered it. Incorporated: a
  fingerprint in the comment marker.
- **Security, Important:** without `SECURITY.md`, a security issue had no anchor. Decided: a
  neutral notice with its own marker, checked before marker comments are dropped.
- **Architecture, Important:** `permissionProve` is coupled to `backlog-audit`, and the mode and
  permission matrix was undefined. Incorporated: a parametrized extraction. Decided: report-only in
  hidden mode or without proven write permission; local or unset mode stops.
- **Architecture, Important:** the Affected files row contradicted the module boundary.
  Incorporated.
- **Error cases, Important:** label creation was an unconfirmed write. Incorporated: only after the
  gate, and only labels that a confirmed entry needs.
- **Error cases, Important:** a second maintainer's managed comment had no handling.
  Incorporated: recognition uses `trustedAuthor`, the upsert edits only the runner's own comment,
  and a superseded comment is reported.
- **Security, Important:** the draft-leaf input was unspecified, and the draft test could not
  prove its claim. Incorporated: one leaf per issue with no snapshot and no A1, plus deterministic
  draft checks in `write-set-build`.
- **Error cases, Note:** `partial` repair, the selection order and the listing bounds were missing.
  Incorporated.
- **Maintainability, Note:** eager rubric loading in `triage`. Incorporated: a lazy-include at
  Phase 4, with fragment paths handed to the leaf.
- **Maintainability, Note:** build wiring was missing: the delegation-mandate test, the
  skill-discovery include, frontmatter, the model-tier columns, the pull-request reference
  handling and the test wording. Incorporated.
- **Scope, Note:** one pull request was too large. Incorporated: three staged pull requests, with
  the exclusions released no later than the tool.
- **Testability, Note:** the single-owner test had no detectable form. Incorporated: pinned scale
  anchors.

Owner decisions on the earlier open points:

1. Triage reports get a new `cleanup` class.
2. R3 refers to A4 `oversized`.
3. `plan-issue` and `apply-issues` get the `goal-obsolete`-style guard.
4. `backlog-audit` uses `overlap` for in-inventory targets only.

No critical findings and no implementation-blocking open points remain.

## Open points

- No open points.

## Build completion

**Date:** 2026-11-23

**Delivery:** three pull requests, as staged: Stage 1 `refactor(scripts)` (#710, merged), Stage 2
`feat(issue-buddy)` (#713, merged), Stage 3 `feat(triage)` (this pull request).

**Requirement:** delivered as planned. `effective-flow triage <ref…>` and
`effective-flow triage --untriaged [--max n]` assess issues from any author and return `reject`,
`implement` or `needs-work` with A1–A7 and readiness, backed by one owner per judgment.

**Architecture decisions taken during the build:**

- The triage helper is `src/scripts/triage-core.mjs` with the CLI `src/scripts/triage.mjs`; its
  operations are `permission-prove`, `inventory-build`, `verdicts-validate`, `report-write`,
  `write-set-build`, `write-set-apply`, `snapshot-remove`, `report-list` and `report-prune`.
- Managed comments carry `<!-- effective-flow-triage fp=<fingerprint> v=<verdict> -->`; a
  deliberate comment-only `reject` or `implement` is no repair case, a `needs-work` comment without
  its label and an issue with more than one triage label are.
- The security write set always carries the fixed notice, names a private channel only when
  `SECURITY.md` or `.github/SECURITY.md` resolves, sets no verdict label, offers removal of an
  earlier triage label only together with the notice, and names open `issue-buddy` plan pull
  requests.
- The closed-issue listing for the overlap index is bounded to 180 days through a validated
  `since` on `issue-list` (GitHub and Forgejo) and is cut, never stopping the run.
- `write-set-apply` re-derives every entry from the inventory before writing; drafts reject HTML
  comments and tags, attribution, permission terms, mentions, links, URLs and verbatim snapshot
  text.
- The cleanup class lives in `src/shared/cleanup-triage-reports.md`; `triage` is a silent tool in
  `session-title`.

**Affected files:** the rows of "Affected files" plus `src/shared/cleanup-triage-reports.md`,
`src/shared/session-title.md`, `src/scripts/remote-tracker-shared-core.mjs`,
`src/scripts/remote-tracker-github-core.mjs`, `docs/developer-guide/subagent-progress-coverage.md`
and the tests `test/remote-tracker.test.mjs`, `test/session-contracts.test.mjs`,
`test/delegation-mandate-contract.test.mjs` and `test/runtime-state-safety-contract.test.mjs`.

**Deviations from the plan:** the acceptance-criterion sub-bullet "any comment when no private
channel resolves" was superseded by the owner decision in "Security-relevant issues" (the notice
names no channel); the helper follows the owner decision. Eval evidence for `next-steps` was not
re-recorded in this run and stays declared freshness debt.

## Test results

- Phase 5 full suite: 6459 tests, 6378 passed, 79 skipped, 2 failed. The session-title partition
  failure was caused by this change and fixed; the `merge-gate-eval-round` lock-wait timeout is a
  known load flake outside the change and passed when re-run by identity.
- Phase 7 final validation after the review corrections: `pnpm agent:check`, `node build.mjs`,
  `pnpm test:distribution` and `mise run readme:check` passed; 3050 affected tests ran with 0
  failures; `pnpm eval <suite> verify` reported no integrity error for the five suites.

## Review findings

**Date:** 2026-11-23
**Reviewer:** Node.js reviewer and generic product reviewer, with scoped re-checks

### Summary

| Severity  | Count | Fixed | Open / Not implemented |
| --------- | ----: | ----: | ---------------------: |
| Critical  |     0 |     0 |                      0 |
| Important |    13 |    12 |                      1 |
| Note      |    17 |     9 |                      8 |

Open follow-ups, not implemented in this run:

- `backlog-audit` hands `issue-assessment-criteria` to its leaf as a path instead of including it
  eagerly (about 19 always-loaded lines).
- Suppress or caveat the `plan-issue` next step for a security-flagged `implement`.
- Keep the sixth cleanup class defined only in `cleanup-triage-reports.md`.
- Check unlabelled issues before `needs-work` ones within the `--untriaged` scan bound.
- Replace the quadratic verbatim check with a sliding-window set.
- Extract the input, hashing and forge-session primitives shared with `backlog-audit-core.mjs`.
- Report only a count of stray leaf keys; exempt code spans from the mention check; give a clear
  stale error when a snapshot or `SECURITY.md` changed during the gate; bind `write-set-apply` to
  the validated verdicts so a security item's write set cannot carry a verdict label.
