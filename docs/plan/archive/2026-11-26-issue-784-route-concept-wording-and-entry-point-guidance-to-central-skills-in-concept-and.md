# Route concept wording and entry-point guidance to central skills in concept and concept-review

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)
**Issue:** #784

## Requirement

Two open changes in Effective Agent add guidance that `concept` and `concept-review` should reach:

- sebastian-software/effective-agent#337 adds a precision pass to `effective-writing`. It checks
  whether concept text makes clear who acts, through which interface, who decides, and which data
  is kept where and for how long, and it keeps observed, proposed and open points at their
  evidence level.
- sebastian-software/effective-agent#336 adds "Make a New Entry Point Explicit" to
  `effective-engineering`. When a concept gives the same business rules or data a second entry
  point (for example a browser product plus an MCP channel), it records runtime, call path, owning
  component and what each first-increment check proves, each as decided or open.

Today neither tool reliably reaches that guidance. `effective-writing` is not an owner of either
concept tool: the relevance gate in `src/shared/central-reasoning-delegation.md` names only
`effective-product`, `effective-web` and `effective-engineering`, and
`docs/developer-guide/skill-ownership.json` lists no concept consumer for `effective-writing`.
`concept` Phase 3 asks `## Technical direction` only for "coarse architecture", and
`concept-review` Phase 2 brings in `effective-engineering` for "system and data-model
architecture" in general. Neither names a second entry point or a new runtime component as the
trigger, so a concept can say "MCP as a second logical frontend" and pass Phase 4 while readers
picture different systems.

Goal: Effective Flow adds **pointers only**. `concept` and `concept-review` route the wording of
concept text to `effective-writing` through a declared, tool-local relationship. Both tools name
the second-entry-point / new-runtime-component condition as the trigger to bring in
`effective-engineering`. The precision questions, the entry-point list and the evidence rungs stay
in the two skills. A concept with one component gets no extra step, question or section.

Workflow rationale: Feature. The change alters what the two shipped tools do: which owners their
judgment reaches, and one new conditional rule in the concept authoring phase. In this repository
`src/**/*.md` is the shipped product (`AGENTS.md`, "Skill Markdown routes as product source"), so
this is not a Documentation plan, even though the edits are prose.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #784
**Original outcome:** `concept` and `concept-review` reach `effective-writing` for concept wording through a declared route-when-relevant relationship that the ownership manifest and guide match. `concept` Phase 3 and `concept-review` Phase 2 name the second-entry-point / new-runtime-component trigger and point to `effective-engineering` without restating its list. A single-component concept gets no extra step, question or section. Nothing beyond one-line fallbacks is copied into `src/`. `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** fresh baseline: tool-local pointers in two tool sources, one contract test, plus the matching ownership manifest and guide rows
**Continuation decision:** none

## Architecture decisions

- **Tool-local declaration, not the shared marker (decided by score).** `effective-writing` is
  added as a `route-when-relevant` owner in the `## Recommended skills` sections of
  `src/tools/concept.md` and `src/tools/concept-review.md`, with a manifest consumer entry for each.
  The shared marker `<!-- skill-ownership:relevance-gate-owners [...] -->` in
  `src/shared/central-reasoning-delegation.md:29` and the manifest's `relevanceGateOwners` stay
  unchanged. Rationale: that include is also consumed by `plan`, `plan-review` and `plan-issue`,
  and the build requires the marker set to equal `relevanceGateOwners` exactly, so a marker edit
  would widen the gate for all five consumers. The `capture` tool uses the same pattern:
  a Recommended-skills bullet, a one-line fallback and a manifest `route-when-relevant` entry.
- **The concept judgment handoff names the wording owner explicitly.** Both tools run their
  judgment in a read-only sub-agent that receives "the owners, relevance gate and fallback" from
  the include. A tool-local owner reaches that sub-agent only if the tool says so. So each tool's
  introductory paragraph before the `central-reasoning-delegation` include gains one clause that
  the judgment handoff also names `effective-writing` for the wording of the concept text, beside
  the relevance gate. It is not described as a gate owner, so the include's statement that the
  gate owners "are exactly these" stays true.
- **Entry-point trigger is conditional and accepts "open".** The new rule applies only when the
  concept gives the same business rules or data a second entry point, or adds a runtime component
  beside existing ones that shares them. Its demand is to state runtime, call path and owning
  component, each as decided or open, and to bring in `effective-engineering`. "Open" is an
  allowed answer, so the rule stays inside the "direction, not design" boundary of
  `## Technical direction`.
- **Implement now, without waiting for the upstream PRs (decided by score).** Both upstream PRs
  are still open (verified 2026-11-26). The pointers route to skills that already own wording
  (`effective-writing`) and system and data design (`effective-engineering`). Until the new
  sections ship, those skills apply their current guidance and the one-line statements in the
  tools act as the minimal fallback. Effective Flow's build and tests do not read upstream skill
  content. This deliberately overrides the issue's first two dependency bullets (item 1 and the
  wording part of item 3 "need #337", the entry-point parts "need #336"): the pointers are valid
  before the releases because they degrade to the fallback. The third bullet, waiting before
  relying on the shared sentence in `effective-product`'s `route-application-concept.md`, does not
  apply, because this plan does not use that route.
- **Extend the existing Evidence criterion (decided by score).** The `concept` Phase 4 scorecard
  keeps its six criteria. Only the target text of the existing `Evidence` row widens from
  "verified repository context and assumptions are distinguishable" to cover proposals and open
  points as well. No new criterion is added.
- **"Open" stays allowed in review (decided by score).** When the trigger holds, `concept-review`
  turns only a runtime, call path or owning component that the concept leaves **unstated** into a
  decision point. An item the concept marks "open" stays as stated; the review adds an entry for
  it under `## Risks and open questions` when one is missing (directly incorporable). The
  `Elaborated` status rule is unchanged, so an honest "open" never keeps a concept in `Draft` and
  never pulls design into the concept stage. An item counts as "decided" only when the user or
  verified repository context fixes it; a candidate the concept itself proposes counts as open, and
  `concept-review` treats an item marked decided without such a source like an unstated one.
- **Older concepts can still record "open" (decided by score).** The Phase 3 decision point for an
  unstated entry-point item always includes a "Record as open" option. Choosing it writes "open"
  into `## Technical direction` and adds the `## Risks and open questions` entry, with no
  `## Open points` entry and no block, so an older concept is treated like a new one. The option
  counts toward Phase 3's three-option limit.
- **Style-only Notes in `concept` (decided by score).** The `concept` handoff asks
  `effective-writing` for findings in the auto-apply scope first. Style-only Notes that still come
  back go into one combined `## Risks and open questions` entry, written only when such Notes
  exist; a concept with none gains nothing.
- **Wording route with a narrow auto-apply scope (decided by score).** The route stays "the
  wording of the concept text". Only findings about who acts, who decides or where data lives may
  be directly incorporable, and only when the concept or verified context already supplies the
  answer; otherwise such a finding needs a decision, because applying it would mean picking a
  decision owner, storage location or retention period without asking. Style-only findings (line
  edits, voice) are recorded as Notes and never applied automatically. This closes the gap while the installed `effective-writing` has no
  precision pass, and still sends precision findings to the issue's "directly incorporable"
  group. The three words name a scope, not the precision questions, so no playbook is copied.
- **The Phase 4 handoff also carries the entry-point trigger (decided by score).** The `concept`
  clause before the include names `effective-writing` for wording and also the
  second-entry-point / new-runtime-component trigger for `effective-engineering`. The Phase 4
  judgment therefore checks the new Phase 3 rule, which closes the issue's "MCP as a second
  logical frontend" case without a new criterion or step.
- **One contract test guards the prose (decided by score).** A test in
  `test/workflow-contracts.test.mjs` pins the conditional "decided or open" rule in `concept`
  Phase 3, the entry-point trigger in `concept-review` Phase 2 and in the `concept` handoff
  paragraph, and the handoff clauses naming `effective-writing`, following the existing concept
  prose contracts there.

## Affected files

| File                                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/concept.md`                      | Add an `effective-writing` route-when-relevant bullet plus a one-line fallback under `## Recommended skills`. Add one handoff clause before the `central-reasoning-delegation` include that names `effective-writing` with its fallback and the entry-point trigger for `effective-engineering`. Add the conditional entry-point rule in Phase 3. Widen the Phase 4 `Evidence` target and add at most one sentence for the combined style-Note entry. Raise `contextBudget` to the measured count (a raise is expected).                             |
| `src/tools/concept-review.md`               | Add an `effective-writing` route-when-relevant bullet plus a one-line fallback under `## Recommended skills`. Add one handoff clause before the include that names `effective-writing` with its fallback. Add the entry-point trigger to the Phase 2 relevance-gate sentence and a separate sentence routing wording to `effective-writing`. Add one or two sentences sorting wording findings and entry-point items, including the "Record as open" option. Raise `contextBudget` to the measured count (a raise is expected: zero headroom today). |
| `test/workflow-contracts.test.mjs`          | Add one contract test beside the existing concept prose contracts. It names its invariant (concept entry-point and wording routes stay pointers to `effective-engineering` and `effective-writing`) and pins the conditional rule and both handoff clauses.                                                                                                                                                                                                                                                                                          |
| `docs/developer-guide/skill-ownership.json` | Add `{ "consumer": "concept", "classification": "route-when-relevant" }` and the same for `concept-review` to the `effective-writing` relationship. `relevanceGateOwners` is unchanged.                                                                                                                                                                                                                                                                                                                                                              |
| `docs/developer-guide/skill-ownership.md`   | Add `concept`, `concept-review` and the already-manifested but missing `capture` to the `effective-writing` inventory row and extend its classification cell with concept wording. Add a short per-consumer note next to the existing `capture` note.                                                                                                                                                                                                                                                                                                |

Deliberately unchanged: `src/shared/central-reasoning-delegation.md` (marker and prose),
`src/shared/concept-contract.md` (no new section), `build.mjs` and `build-lib.mjs` (no new guard),
and all `plan*` tools.

## Implementation details

### Approach

1. **`concept` Recommended skills.** Under `## Recommended skills` in `src/tools/concept.md`, after
   `effective-product`, add one bullet: `effective-writing` – route-when-relevant for the wording
   of the concept text; only findings about who acts, who decides or where data lives are applied
   directly, and only when the concept or verified context supplies the answer; style-only
   findings stay Notes. This bullet is the one place per tool that states this auto-apply scope;
   other sentences point to it. Below the list, add one fallback line. Example wording: "If
   `effective-writing` is unavailable, name who acts and who decides wherever the concept states an
   action or a decision."
2. **`concept` wording owner in the judgment.** In the paragraph before the
   `central-reasoning-delegation` include (today `src/tools/concept.md:110-114`), add one clause:
   the wording of the concept text routes to `effective-writing`, and the judgment handoff names it,
   together with its one-line fallback from step 1, beside the relevance-gate owners. Without the
   fallback in the handoff, an unavailable skill would leave the judgment sub-agent with only the
   include's generic fallback. The same clause names the second-entry-point /
   new-runtime-component condition of step 3 as the trigger for `effective-engineering`, so the
   Phase 4 judgment checks that rule, using a phrase such as "second entry point" that the
   contract test can anchor on. It also asks `effective-writing` for findings in the auto-apply
   scope first. Product judgment stays with `effective-product`, and
   architecture with `effective-engineering`/`effective-web` as today.
3. **`concept` Phase 3 entry-point rule.** Directly after the `## Technical direction` bullet
   (today `src/tools/concept.md:170-171`), add one conditional bullet or sentence. When the concept
   gives the same business rules or data a second entry point, or adds a runtime component beside
   existing ones that shares them, state that component's runtime, call path and owning
   component, each as decided or open, in `## Technical direction`, and bring in
   `effective-engineering`. An item is decided only when the user or verified repository context
   fixes it; a candidate the concept proposes counts as open. Use "owning component", never bare
   "owner", because both tools already use "owner" for skill owners. Do not list check types, evidence rungs or interface details.
4. **`concept` Phase 4 Evidence target.** Change the `Evidence` row's target text so that verified
   context, proposals, assumptions and open points are distinguishable. Keep all other rows. Run
   `pnpm format` to re-pad the oxfmt-aligned table. A precision finding in the auto-apply scope of
   step 1 fits none of the six scorecard rows; the step-1 bullet's apply-directly rule covers it,
   so Phase 4 revises the concept for it outside the scorecard. An in-scope finding whose answer
   the concept and verified context do not supply goes under `## Risks and open questions` as an
   open question instead. Style-only Notes that come back go into one combined
   `## Risks and open questions` entry, written only when such Notes exist. This follows the
   include's existing rule for findings not incorporated, so Phase 4 needs at most one short
   sentence for the combined entry.
5. **`concept-review` Recommended skills.** Under `## Recommended skills` in
   `src/tools/concept-review.md`, add the same `effective-writing` route-when-relevant bullet after
   the existing two, with the same auto-apply scope, plus the same one-line fallback.
6. **`concept-review` wording owner in the judgment.** In the paragraph before the include (today
   `src/tools/concept-review.md:98-101`), add one clause: the wording of the concept text comes from
   `effective-writing`, and the judgment handoff names it, together with its one-line fallback from
   step 5, beside the relevance-gate owners.
7. **`concept-review` Phase 2 triggers.** In the relevance-gate sentence of Phase 2 (today
   `src/tools/concept-review.md:129-132`), keep the existing two routes and add one more. A second
   entry point to the same business rules or data, or a new runtime component that shares them, is
   a reason to bring in `effective-engineering`. Do not add `effective-writing` to that gate
   sentence: a separate sentence after it says that the wording of the concept text routes to
   `effective-writing` per `## Recommended skills`, worded as in steps 1, 2, 5 and 6. This keeps the
   include's statement that the gate owners "are exactly these" true. After the two groups (today
   lines 136-141), add one or two sentences:
   - directly incorporable: a wording finding in the auto-apply scope of the step-5 bullet (pointed
     to, not repeated) whose answer the concept or verified context supplies, and a missing
     `## Risks and open questions` entry for an entry-point item the concept marks "open";
   - decision-requiring: an in-scope wording finding without such an answer, and a runtime, call
     path or owning component the concept leaves unstated, or marks decided without a user or
     verified source, while the trigger holds. An entry-point decision point always offers
     "Record as open" (writes "open" into `## Technical direction` plus a Risks entry, no block).
     The review never invents a mechanism;
   - outside both groups: a style-only wording finding is recorded in the findings of
     `## Concept review` with severity Note and is not applied. In the review summary table it
     counts under the area of the statement it touches, or under Risks when none fits.
8. **Ownership manifest.** In `docs/developer-guide/skill-ownership.json`, add two consumer entries
   under `effective-writing`, `concept` and `concept-review`, both `route-when-relevant`. Leave
   `relevanceGateOwners` and `provenance` unchanged: provenance records a human review of the
   upstream inventory, and no upstream relationship changes here.
9. **Ownership guide.** In `docs/developer-guide/skill-ownership.md`, add `concept` and
   `concept-review` to the `effective-writing` row inside the `skill-ownership-table` markers, and
   extend its classification cell to "route-when-relevant for forge prose and concept wording".
   Add the missing `capture` consumer to the same cell while editing it: the manifest already
   lists it (`skill-ownership.json:97`), only the explanatory cell lags. Amend the row's coverage
   cell as well, which today names only the two delegated areas: add concept wording as a
   route-when-relevant branch, with Effective Flow keeping the concept contract, scorecard and
   review loop, or point the cell to the new paragraph.
   Next to the `capture` note, add a short paragraph. It says that `concept` and `concept-review`
   are route-when-relevant consumers of `effective-writing` for the wording of concept text, that
   Effective Flow keeps the concept contract, scorecard and review loop, and that the skill supplies
   no second review workflow.
10. **Contract test.** In `test/workflow-contracts.test.mjs`, next to the existing concept prose
    contracts, add one test whose title names the invariant: the concept tools route entry-point
    detail to `effective-engineering` and concept wording to `effective-writing` as pointers. It
    asserts:
    - `src/tools/concept.md` Phase 3 contains the conditional rule, anchored on "decided or open"
      together with the new trigger phrase (for example "second entry point");
    - `src/tools/concept-review.md` Phase 2 contains the new trigger phrase, not "decided or open",
      which step 7 does not write there;
    - `concept`'s paragraph before the include contains the trigger phrase as well;
    - each tool's paragraph before the include names `effective-writing` in its handoff clause;
    - each tool's `## Recommended skills` section holds a bullet starting with
      `` `effective-writing` ``.
      Never anchor on a bare `effective-engineering`: it already appears in both places
      (`src/tools/concept.md:112`, `src/tools/concept-review.md:132`) and would pass after removal.
      Assert on bounded slices, never the whole file, because `effective-writing` and the trigger
      phrase each appear in more than one place: the file's existing helpers
      (`boundedSlice`, `section`) cut Phase 3 to Phase 4 of `concept`, Phase 2 to Phase 3 of
      `concept-review`, the paragraph before the `central-reasoning-delegation` include, and the
      `## Recommended skills` section. Match short stable phrases, not whole sentences.
11. **Context budget.** Run `node build.mjs`, read the `Always-loaded core (lines/budget)` report
    for `concept` and `concept-review`, and set each `contextBudget` line to the reported count plus
    up to ten lines of headroom. A raise is expected for both: the delivered v1.80.0 build has
    `concept` at 404 of 408 lines and `concept-review` at 409 of 409, and neither source has changed
    since.
12. **Validate** in CI order (see "Validation plan").

### Component structure

Not relevant: no new tool, agent, include or script.

### State management

Not relevant: no runtime state, configuration key or persisted artifact changes.

### API integration

Not relevant: no helper, CLI or forge interface changes.

### Styling approach

Not relevant: prose and JSON only. Markdown tables are re-padded by `pnpm format`.

### Accessibility

Not relevant: no user interface.

### Edge cases

- **Single-component concept:** the entry-point rule does not apply, and the concept gets no new
  section, question or step. The wording route runs inside the existing Phase 4 judgment handoff
  and adds no step. A combined style-Note entry appears only when style-only Notes come back.
- **`effective-writing` unavailable or excluded** (`skills.enabled: false`, `exclude`): the
  one-line fallback applies in the orchestrator and, because the handoff carries it, in the
  judgment sub-agent; the include's generic fallback covers everything else.
- **Upstream sections not yet released** (#337, #336 open): `effective-writing` and
  `effective-engineering` apply their current guidance. As route-when-relevant owners they inform
  their branch while Effective Flow's concept contract stays leading; the one-line fallback applies
  only when the skill is unavailable. Only findings about who acts, who decides or where data
  lives, with an answer the concept or verified context supplies, are applied without asking; the
  installed skill's line-edit and voice findings stay Notes. Once a release adds the precision pass or the entry-point section, the pointers should reach them
  without an Effective Flow change; the follow-up check under Assumptions confirms that.
- **Concept with a second entry point and undecided mechanics** (for example "MCP as a second
  logical frontend"): the concept states runtime, call path and owning component as open.
  `concept-review` keeps each "open" item as stated, adds a `## Risks and open questions` entry
  when one is missing, and does not block `Elaborated` on it. In no case does it invent a
  mechanism.
- **Existing concept that predates the rule:** the trigger matters only when its condition holds.
  Then a runtime, call path or owning component the concept does not state becomes a decision
  point whose options include "Record as open"; choosing it does not block `Elaborated`, while
  "Decide later" follows the existing open-point rule.
- **Concept marks a proposed item "decided":** a runtime or call path that only the drafting run
  proposed is open, not decided. `concept-review` treats it like an unstated item.
- **In-scope wording finding without a known answer** (for example "who decides retention" when
  the concept does not say): it is never applied automatically. `concept` records it as an open
  question under `## Risks and open questions`; `concept-review` makes it a decision point.
- **German-language concept:** the route applies unchanged. Which parts of `effective-writing`
  apply to German text is the skill's decision. Effective Flow does not restrict it.
- **`plan`, `plan-review`, `plan-issue`:** unaffected, because the shared include and its marker
  are unchanged.

## Acceptance criteria

- [ ] `docs/developer-guide/skill-ownership.json` lists `concept` and `concept-review` as `route-when-relevant` consumers of `effective-writing`. Both tools name `effective-writing` under `## Recommended skills` (checked by a grep inside each section, since the build passes without the bullets once any consumer recommends the skill), and `node build.mjs` passes its skill-ownership guard. The `effective-writing` row between the `skill-ownership-table` markers of the guide names `concept`, `concept-review` and `capture` (checked by a grep on that row, since the build does not read consumer cells).
- [ ] `src/shared/central-reasoning-delegation.md` and the manifest's `relevanceGateOwners` are byte-identical to the base (`git diff --exit-code` on the include; the JSON array unchanged).
- [ ] Each tool's paragraph before the `central-reasoning-delegation` include names `effective-writing` and its one-line fallback for the wording of the concept text in the judgment handoff.
- [ ] `src/tools/concept.md` Phase 3 contains one conditional rule for a second entry point or a shared runtime component that names runtime, call path and owning component as "decided or open" and points to `effective-engineering`. The Phase 2 relevance-gate sentence of `src/tools/concept-review.md` names the same condition for `effective-engineering` and does not name `effective-writing`; a separate sentence routes the wording check to `effective-writing`, and one or two sentences sort findings: in-scope wording findings with a supplied answer (by pointer to the Recommended-skills bullet) and missing Risks entries for "open" items are directly incorporable; in-scope findings without an answer and unstated or unsourced "decided" items are decision points that always offer "Record as open"; style-only findings are recorded as Notes in `## Concept review` without being applied. The `concept` handoff clause also names the entry-point trigger for `effective-engineering`.
- [ ] `test/workflow-contracts.test.mjs` contains one new test that names its invariant and fails when the conditional entry-point rule or a handoff clause is removed from either tool.
- [ ] Single-component concepts gain nothing: the number of `ask` fences and `### Phase` headings in both tools is unchanged, `src/shared/concept-contract.md` is unchanged, and the Phase 4 scorecard still has exactly six criteria, with only the `Evidence` target text changed.
- [ ] No copied playbook: the diff under `src/` touches only the two tool files. It adds no list of precision questions, entry-point check types or evidence rungs. Allowed are the one-line fallback per tool, the auto-apply scope stated once per tool in its Recommended-skills bullet, and the single conditional rule with its trigger phrase.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass in that order.

## Validation plan

- Run CI's order after the edits: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
  `pnpm test:distribution`. `node build.mjs` covers the skill-ownership contract
  (`assertSkillOwnershipContract`: marker equals `relevanceGateOwners`, known consumers, unowned
  recommendations) and the `contextBudget` guard. This build-enforced ownership check is the
  binding meaning of the issue's "including the skill-ownership audit".
- Grep the `effective-writing` row between the `skill-ownership-table` markers for `concept`,
  `concept-review` and `capture`.
- Grep each tool's `## Recommended skills` section for a bullet starting with `` `effective-writing` ``.
  The build cannot prove these bullets: its route-when-relevant check runs per relationship, and
  `capture`, `iterate` and `pr` already satisfy it.
- `git diff --stat` against the base: only the five affected files and this plan file (whose
  status the delivery sets) change, and
  `src/shared/central-reasoning-delegation.md` and `src/shared/concept-contract.md` do not.
- Read the new contract test once and confirm that each assertion targets a phrase only the new
  text contains, so removing the rule or a clause makes it fail.
- Count the ask fences and `### Phase` headings in `src/tools/concept.md` and
  `src/tools/concept-review.md` before and after the change, and the `concept` scorecard rows.
- Read the built `dist/portable/effective-flow/tools/concept.md` and `concept-review.md` once. The
  new bullets, clauses and the conditional rule appear in the expanded text, and the include's
  owner list still names exactly three gate owners.
- Optional, advisory maintainer check (not the binding criterion):
  `pnpm audit:skill-ownership -- <local-skills-directory>` (read-only), to confirm the manifest
  still parses and `effective-writing` is listed.

## Assumptions and open points

- Assumption: route-when-relevant needs no build marker beyond the Recommended-skills bullet and
  the manifest entry. This follows the `capture`, `iterate` and `pr` precedent and the guards in
  `build-lib.mjs`. The build proves only that each bullet has a manifest entry, not that the
  bullets exist; the validation grep covers that.
- Verified: the `contextBudget` headroom does not cover the additions. The delivered v1.80.0
  build counts `concept` at 404 of 408 lines and `concept-review` at 409 of 409, and neither source
  nor its eager includes changed since. Step 11 raises both from the measured count.
- Assumption: editing `src/tools/concept.md` and `src/tools/concept-review.md` creates freshness
  debt in the `build-context` eval suite, whose seeds include every `tools/*` file. CI reports that
  debt without failing on it, and re-recording evidence is not part of this issue.
- Verified: no user-guide page lists the owners of `concept` or `concept-review`. The concept
  sections of `docs/user-guide/tools-understand.md` name no central skill, and
  `docs/user-guide/skill-discovery.md` names skills only generically. No user-guide change is
  needed.
- Out of scope: any change to `effective-product`'s `route-application-concept.md`, or to the
  upstream skills.
- Follow-up (non-blocking): once effective-agent #336 and #337 are released, confirm with one
  `concept` run on a two-entry-point example that the routed skills reach the precision pass and
  the entry-point section from the wording this plan adds. A miss is a new issue, not a reason to
  hold this plan.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[
  {
    "site": "S-CLR",
    "question": "Where should concept and concept-review declare effective-writing as the owner for concept wording?",
    "options": [
      "Tool-local route-when-relevant declaration in concept and concept-review",
      "Add effective-writing to the shared relevance-gate marker and relevanceGateOwners",
      "A second, concept-only marker in central-reasoning-delegation read by the build guard",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Tool-local route-when-relevant declaration in concept and concept-review",
        "score": 8,
        "reason": "Follows the capture/iterate/pr precedent, keeps plan consumers unaffected and needs no build-guard change; the cost is a handoff sentence telling the judgment sub-agent to use effective-writing, repeated in two tools."
      },
      {
        "label": "Add effective-writing to the shared relevance-gate marker and relevanceGateOwners",
        "score": 2,
        "reason": "The shared include also feeds plan, plan-review and plan-issue, so this widens ownership past concept wording and blurs the gate's judgment-owner meaning, which is the exact risk the issue flags."
      },
      {
        "label": "A second, concept-only marker in central-reasoning-delegation read by the build guard",
        "score": 4,
        "reason": "It keeps the handoff wording in one place, but it puts concept-only text into a shared fragment and needs new parser and guard logic, since parse expects exactly one marker. The existing route-when-relevant mechanism already covers this."
      }
    ]
  },
  {
    "site": "S-CLR",
    "question": "Upstream effective-agent PRs #336 and #337 are still open. When may this plan be implemented?",
    "options": [
      "Implement now: pointers name trigger and owner and degrade to the one-line fallback until upstream ships",
      "Gate implementation until both upstream PRs are merged and released",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "stop": [
      "Gate implementation until both upstream PRs are merged and released"
    ],
    "scores": [
      {
        "label": "Implement now: pointers name trigger and owner and degrade to the one-line fallback until upstream ships",
        "score": 9,
        "reason": "Both target skills already own wording and system design, and the plan skips the contested route sentence. Fallback covers the gap and Effective Flow's tests ignore upstream, so it beats gating by delivering now at no added risk."
      },
      {
        "label": "Gate implementation until both upstream PRs are merged and released",
        "score": 3,
        "reason": "Follows the issue's literal wait note, but that note covers relying on route-application-concept wording, which this plan avoids, so gating just blocks pointer-only work on open PRs with no merge date."
      }
    ]
  },
  {
    "site": "S-CLR",
    "question": "Should concept's Phase 4 Evidence criterion be extended so observed, proposed and open details stay distinguishable?",
    "options": [
      "Extend the existing Evidence row's target text; add no new criterion",
      "Leave the scorecard unchanged; rely on the routed skills",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Extend the existing Evidence row's target text; add no new criterion",
        "score": 8,
        "reason": "Follows issue item 4 exactly: the existing Evidence row already holds the verified-vs-assumption split. Adding proposed and open points sets a target, not a copied heuristic. No new step or criterion; the only cost is re-padding the table."
      },
      {
        "label": "Leave the scorecard unchanged; rely on the routed skills",
        "score": 5,
        "reason": "Workable because item 4 is optional, and the routed skills handle the wording. But concept's own self-check would then not test whether proposed and open points stay apart from observed ones."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How does concept-review treat an entry-point item (runtime, call path, owning component) when the trigger holds?",
    "options": [
      "Only unstated items become decision points; items marked open stay, with a Risks entry; status rule unchanged",
      "Every undecided item, open included, becomes a decision point; Decide later blocks Elaborated",
      "An open item names the work package that decides it in Roadmap; no open-point entry",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Only unstated items become decision points; items marked open stay, with a Risks entry; status rule unchanged",
        "score": 9,
        "reason": "Matches the issue: 'open' is an allowed answer, and only what the source leaves undecided becomes a decision point. Beats the roadmap option because unstated items still get handled and nothing new is added to the status rules."
      },
      {
        "label": "Every undecided item, open included, becomes a decision point; Decide later blocks Elaborated",
        "score": 2,
        "reason": "Contradicts the 'open is allowed' boundary. Every multi-entry-point concept would stay Draft until its call path is designed, which pulls design into the concept stage."
      },
      {
        "label": "An open item names the work package that decides it in Roadmap; no open-point entry",
        "score": 5,
        "reason": "Keeps open items traceable through Phase 4 roadmap packages without blocking. But it says nothing about unstated items and adds a new rule for roadmap packages. The open risk also stays out of Risks and open questions."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "What is the scope of the effective-writing route in concept and concept-review, and which of its findings are directly incorporable?",
    "options": [
      "Name the route as precision of concept statements (who acts, who decides, where data lives), not style",
      "Keep a wording route; only who-acts/who-decides/where-data findings are directly incorporable",
      "Accept generic line edits until #337 ships and record it as an edge case",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Name the route as precision of concept statements (who acts, who decides, where data lives), not style",
        "score": 6,
        "reason": "Fits #337's eventual scope, but the installed skill has no precision route, so line-edit or voice findings can still come back. Nothing stops them being applied without asking, and listing the questions leans toward copying them."
      },
      {
        "label": "Keep a wording route; only who-acts/who-decides/where-data findings are directly incorporable",
        "score": 8,
        "reason": "Answers both halves: style-only findings become Notes and are never applied automatically, which closes the gap until #337 ships. Precision findings still go into the issue's 'directly incorporable' group."
      },
      {
        "label": "Accept generic line edits until #337 ships and record it as an edge case",
        "score": 3,
        "reason": "Concept-review would apply voice and line edits without asking under 'directly incorporable'. That goes against the issue's precision-only intent and Phase 2's no-domain-decision bar."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "Does this change get a regression guard?",
    "options": [
      "Add one contract test in test/workflow-contracts.test.mjs pinning the rule and handoff clause",
      "Keep manual checks as for capture and record the choice under Assumptions",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Add one contract test in test/workflow-contracts.test.mjs pinning the rule and handoff clause",
        "score": 8,
        "reason": "Concept prose already has contract tests near lines 6434-6620, so one more test fits that pattern, and AGENTS.md rule 5 covers it if the test names its invariant. Without it, pnpm test passes even if both rules are dropped."
      },
      {
        "label": "Keep manual checks as for capture and record the choice under Assumptions",
        "score": 4,
        "reason": "Avoids a brittle prose test, but the capture precedent is a weak model: concept already pins comparable prose. Leaving these rules unguarded lets them drift away silently in later edits."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How does concept Phase 4 check the new Phase 3 entry-point rule?",
    "options": [
      "Extend step 2's handoff clause to name the entry-point trigger for effective-engineering",
      "Rely on the sub-agent's relevance judgment and record that Phase 4 does not check the rule",
      "Widen the Completeness target text, reopening the Evidence-only decision",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Extend step 2's handoff clause to name the entry-point trigger for effective-engineering",
        "score": 9,
        "reason": "It closes the issue's motivating defect, since the Phase 4 sub-agent then knows the trigger. It adds no criterion and no step, keeps the scored Evidence-only decision, and single-component concepts are unaffected. Option 2 leaves the defect unchecked."
      },
      {
        "label": "Rely on the sub-agent's relevance judgment and record that Phase 4 does not check the rule",
        "score": 3,
        "reason": "It is honest and costs nothing, but the 'MCP as a second logical frontend' concept would still pass Phase 4, because neither the scorecard nor the generic owner list names the trigger."
      },
      {
        "label": "Widen the Completeness target text, reopening the Evidence-only decision",
        "score": 2,
        "reason": "It reopens a decision that was already scored. Completeness is about filled mandatory sections, so an entry-point condition placed there blurs the criterion and risks extra checks on single-component concepts."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "Where does a style-only Note from the concept Phase 4 self-check go?",
    "options": [
      "One combined Risks entry, written only when style-only Notes come back; handoff asks for in-scope findings first",
      "Let concept apply style-only findings to its own new draft; keep never-auto-apply for concept-review",
      "Have the concept handoff ask effective-writing only for in-scope findings; no further routing rule",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "One combined Risks entry, written only when style-only Notes come back; handoff asks for in-scope findings first",
        "score": 9,
        "reason": "Keeps the scored rule that style findings are never auto-applied and follows the include's no-silent-drop rule. One conditional entry adds no section. Unlike option 3 it settles style findings that still come back."
      },
      {
        "label": "Let concept apply style-only findings to its own new draft; keep never-auto-apply for concept-review",
        "score": 3,
        "reason": "Reopens the scored rule that style-only findings are never applied automatically, for both tools, and splits behavior between concept and concept-review without new evidence."
      },
      {
        "label": "Have the concept handoff ask effective-writing only for in-scope findings; no further routing rule",
        "score": 4,
        "reason": "Cuts returned Notes, but effective-writing has no precision pass yet, so style findings can still come back. The include then sends them to Risks with no limit, leaving the blocking question open."
      }
    ]
  },
  {
    "site": "S-DEC",
    "question": "How should concept-review let a user leave an unstated entry-point item open in an older concept?",
    "options": [
      "Always offer a Record-as-open option: writes open in Technical direction plus a Risks entry, no block",
      "Keep the asymmetry on purpose and state it in the edge case with its rationale",
      "Let a free-text answer of open count as a domain decision, stated in step 7",
      "Decide later"
    ],
    "escape": [
      "Decide later"
    ],
    "scores": [
      {
        "label": "Always offer a Record-as-open option: writes open in Technical direction plus a Risks entry, no block",
        "score": 8,
        "reason": "Treats an older concept the same as a new one that writes \"open\", in line with the scored rule that an honest open never keeps a concept in Draft. The user can see the choice. Cost: Phase 3 gets one fixed option, which has to fit the three-option rule."
      },
      {
        "label": "Keep the asymmetry on purpose and state it in the edge case with its rationale",
        "score": 3,
        "reason": "An older concept could only reach Elaborated by deciding something a new concept may leave open, which contradicts the scored rule. Stating the asymmetry in the edge case documents it but does not fix it."
      },
      {
        "label": "Let a free-text answer of open count as a domain decision, stated in step 7",
        "score": 5,
        "reason": "It removes the block without a new fixed option, but users only find it if they know to type \"open\". Phase 3 lists free-text answers for \"Decide later\", not for this case, so whether users take it up depends on the harness."
      }
    ]
  }
]
```

<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    2 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         1 |    0 |
| Error cases     |        0 |         3 |    0 |
| Testability     |        0 |         4 |    2 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         1 |    3 |

### Findings

Gap analysis (Phase 4), incorporated before the review: the contradiction between "open is
allowed" and "undecided becomes a decision point", the scope of the wording route, the missing
regression guard (all three decided by score), the misstated dependency rationale, the expected
`contextBudget` raises, the unprovable guide-row check, "owner" ambiguity, the missing `capture`
consumer cell, a wrong line reference and the audit command spelling.

Internal review (Phase 6):

- Architecture, Important: step 7 put `effective-writing` into the Phase 2 relevance-gate
  sentence, which would contradict the include's "exactly these" three gate owners. Adjusted: the
  gate sentence gains only the `effective-engineering` trigger; a separate sentence routes wording.
- Testability, Important: `concept` Phase 4 would not check the new Phase 3 rule, so the issue's
  "MCP as a second logical frontend" case could still pass. Adjusted by score: the Phase 4 handoff
  clause also names the entry-point trigger for `effective-engineering`.
- Error cases, Important: the one-line `effective-writing` fallback would not reach the judgment
  sub-agent. Adjusted: both handoff clauses carry the fallback.
- Testability, Important: the build cannot prove the new Recommended-skills bullets, because the
  route-when-relevant check runs per relationship. Adjusted: a grep check per section is added and
  the assumption corrected.
- Maintainability, Note: the guide row's coverage cell would go stale. Adjusted: step 9 amends it.
- Architecture, Note: "authoritative" contradicted the route-when-relevant class. Adjusted: the
  routed skills inform their branch and the concept contract stays leading.

Scoped re-review of the batch answers (planning ladder, trigger: changed architecture decisions
and acceptance criteria):

- Testability, Important: the contract test anchored on text step 7 never writes and on a skill
  name that already appears. Adjusted: anchors are the new trigger phrase and, for `concept`
  Phase 3 only, "decided or open".
- Scope, Important: the auto-apply triple appeared several times and broke the no-copy criterion.
  Adjusted: it is stated once per tool in the Recommended-skills bullet, and the criterion allows
  exactly that.
- Testability, Important: the test did not cover the entry-point trigger in the `concept` handoff.
  Adjusted: one more assertion.
- Maintainability, Important: style-only Notes from the `concept` self-check would land in every
  concept's risks section. Open: decision point under `## Open points`.
- Architecture, Note: "Note" is a severity, not a group. Adjusted: style-only findings are recorded
  as Notes in `## Concept review`, outside both groups.
- Testability, Note: no scorecard row carries a precision finding. Adjusted: the Recommended-skills
  apply-directly rule covers it outside the scorecard.
- Maintainability, Note: a wrong step range, the diff check ignoring the plan file, and an open
  user-guide assumption. Adjusted: all three corrected; the user-guide assumption is verified.

#### Deep plan review (2026-11-26)

- Data protection, Important: "applied directly" for who-acts / who-decides / where-data findings
  would let the review pick a decision owner, storage location or retention period without asking.
  Adjusted: such a finding is applied only when the concept or verified context supplies the
  answer; otherwise it is an open question (`concept`) or a decision point (`concept-review`).
- Error cases, Important: "decided" was undefined, so a proposed runtime could pass as decided.
  Adjusted: decided means fixed by the user or verified context; a proposal counts as open, and an
  unsourced "decided" item is treated like an unstated one.
- Error cases, Important: an older concept could not record an entry-point item as "open" without
  a blocking "Decide later". Decided by score: the decision point always offers "Record as open".
- Maintainability, Important (open point from the scoped re-review): style-only Notes from the
  `concept` self-check. Decided by score: the handoff asks for in-scope findings first, and
  returned style Notes go into one combined Risks entry only when they exist.
- Testability, Note: whole-file assertions would pass after the guarded text is removed. Adjusted:
  the test asserts on bounded slices and also covers the Recommended-skills bullets.
- Maintainability, Note: style-only Notes had no row in the review summary table. Adjusted: they
  count under the area of the statement they touch, or under Risks.

## Open points

- No open points.

## Build completion

- **Requirement:** `concept` and `concept-review` route concept wording to `effective-writing`
  (route-when-relevant) and name the second-entry-point or new-runtime-component trigger for
  `effective-engineering`, as pointers only, per issue #784.
- **Architecture decisions:** implemented as planned and as decided by score: tool-local
  route-when-relevant declarations with one-line fallbacks, no change to the shared relevance-gate
  marker or `relevanceGateOwners`, no new build guard, no change to `plan*` tools. The decided/open
  marker is written in the artifact language (German: `entschieden`/`offen`).
- **Affected files:** `src/tools/concept.md`, `src/tools/concept-review.md`,
  `test/workflow-contracts.test.mjs`, `docs/developer-guide/skill-ownership.json`,
  `docs/developer-guide/skill-ownership.md`, plus `docs/user-guide/tools-understand.md`, which the
  mandatory documentation sync gate found stale and updated (a short "Second entry points"
  paragraph).
- **Implementation details:** `contextBudget` is 430 for `concept` (428 measured) and 433 for
  `concept-review` (431 measured). The `concept-review` Phase 2 sorting rule is split into separate
  sentences with explicit subjects. The new contract test asserts on bounded slices and also pins
  the style-only-Notes rule and the combined Risks entry.
- **Test results:** the Phase 5 full run passed `node build.mjs` and `pnpm test:distribution`. 33
  process, signal and timeout tests in ten unrelated files failed under heavy parallel host load;
  the same ten files passed on the base (735/735) and again on the candidate (735/735), so they are
  load-induced and were re-verified by identity. `pnpm agent:check` flagged only this plan file
  (pre-existing on the base, fixed by the completion formatting). The final targeted check passed
  1134/1134 affected tests, `node build.mjs` and `pnpm test:distribution`.
- **Review result:** one Node.js review with one incorporation pass and one re-check; all findings
  fixed, none offloaded.

## Review findings

**Date:** 2026-11-26
**Reviewer:** effective-flow-nodejs-reviewer

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     7 |
| Open / Not implemented |     0 |
