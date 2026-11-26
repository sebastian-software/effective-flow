# Recognize retro as a read-only config-resolve caller

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #783

## Requirement

`effective-flow retro` reads language and skill settings through the shared configuration resolver
(`src/tools/retro.md:27-28`, "Use the existing configuration resolver read-only for language and
skill discovery only"). The resolver call with `tool: "retro"` returns `ok: true` and the resolved
values, but also emits the `unknown-tool` diagnostic, because `retro` has no entry in
`SUCCESSOR_SETS` (`src/scripts/config-resolve-core.mjs:173-206`). `classifyRetiredRows` emits
`unknown-tool` whenever `successorSetFor` finds no entry (`src/scripts/config-resolve-core.mjs:1285`, `:1328-1330`).

Goal: the resolver recognizes `retro` as a known caller with an empty successor set. Then:

- a `retro` resolve carries no `unknown-tool` diagnostic;
- every retired row resolves to action `none` for `retro`, so a retired row never makes the
  read-only retrospective stop or point to a migration;
- value resolution and the diagnostic for genuinely unknown tools stay unchanged.

Workflow rationale: Bugfix. A supported, exposed tool (`build.mjs:341`, group "Ensure quality") is
classified as unknown. The fix is a one-entry data correction in the resolver table plus the tests
that pin that table. It adds no capability and changes no other tool's behavior.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #783
**Original outcome:** Resolving configuration with `tool: "retro"` returns the configured language and skill values without an `unknown-tool` diagnostic; every retired row carries action `none` for `retro`; an unrecognized tool name still emits `unknown-tool`.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** fresh baseline: one empty `SUCCESSOR_SETS` entry for `retro` plus the pinned tests
**Continuation decision:** none

## Architecture decisions

- **An explicit empty set, not a new mechanism.** `retro` gets the entry `tool: 'retro'`,
  `mode: null`, `successors: []`. The resolver already treats an empty set as "known, acts on no
  retired row": `inSuccessorSet` is false for every successor, so the action stays `none`
  (`src/scripts/config-resolve-core.mjs:1337-1340`). The precedent is
  `{ tool: 'apply-review', mode: 'local', successors: [] }` (`src/scripts/config-resolve-core.mjs:192`).
  `retro` is the first empty entry with `mode: null`; `MODE_TOOLS` only collects non-null modes
  (`src/scripts/config-resolve-core.mjs:211-217`), so `retro` gains no mode.
- **Not an exemption.** `RETIRED_EXEMPT_TOOLS` (`['setup']`, `src/scripts/config-resolve-core.mjs:209`)
  is the repair path that receives retired raw values and lines. `retro` must not receive them, so it
  goes into `SUCCESSOR_SETS`, not into the exemption.
- **Placement.** Append the entry after the `merge-gate` entry, as the last row. The table is grouped
  by successor shape, and `retro` belongs to none of the delivery or reviewer groups. The row
  carries a one-line comment: a read-only caller that acts on no retired row. The pinned array in
  `test/workflow-contracts.test.mjs` is positional, so it gets the same row in the same last place.
- **Only `retro` is in scope.** Twelve tools include `config-migration` directly and have no
  successor set (apply, apply-plan, backlog-audit, capture, cleanup, commit, concept, open-plans,
  plan, plan-issue, review, triage). For them `unknown-tool` is an accepted state: the contract
  says `unknown-tool` "needs nothing" (`src/shared/config-migration.md:40`), and the oracle pins
  the representative `{ tool: 'plan', stops: [], unknown: true }` (`test/config-resolve.test.mjs:1558`).
  `retro` reaches `config-migration` only through the lazy include in `chat-language`
  (`src/tools/retro.md:12-13`, `src/shared/chat-language.md:28-31`), so that rule reaches it too.
  What sets `retro` apart is its read-only authority (`src/tools/retro.md:20-28`), which forbids
  migration and any acted-on retired row, and the issue's explicit request. An explicit empty set
  records that boundary in the only source of the successor sets.
  `retro` is not unique: `focus` is in the identical position. It uses the resolver read-only for
  language and skills (`src/shared/focus-session-contract.md:12-13`), reaches `config-migration`
  only through `chat-language`, is exposed in the same group (`build.mjs:341`) and has no successor
  set. Decided by score: this change stays with `retro`, as the issue asks, and `focus` gets a
  concrete follow-up issue (see "Assumptions and open points").
- **`src/tools/retro.md` stays unchanged.** Decided by score: the generic call in
  `src/shared/config-migration.md:11`, which reaches `retro` through the `chat-language` lazy
  include, already has each tool pass its own name, so the table entry fixes the diagnostic on its
  own. Naming the value in `retro.md` would copy that contract into the always-loaded `retro` core
  without a behavior gain.

## Affected files

| File                                  | Description                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/config-resolve-core.mjs` | Append `{ tool: 'retro', mode: null, successors: [] }` as the last `SUCCESSOR_SETS` entry, with a one-line comment that it is a read-only caller acting on no retired row.                                                                                                                                                                                                                                  |
| `test/config-resolve.test.mjs`        | Add `{ tool: 'retro', stops: [] }` to `RETIRED_CASES`, before the `plan` row, so the coverage test (`:1561-1567`) passes and the per-case loop pins `none` for every sample row with and without successors and no `unknown-tool`. Add one test that resolves `retro` against a setup ADR with language, skills and retired rows and asserts the values, the `none` actions and the missing `unknown-tool`. |
| `test/workflow-contracts.test.mjs`    | Add the row `['retro', null, []]` as the last element of the pinned `SUCCESSOR_SETS` array (`:2936-2955`).                                                                                                                                                                                                                                                                                                  |

No other file changes. `src/tools/retro.md` stays as it is. The developer guides
(`docs/developer-guide/configuration.md:533-545`, `docs/developer-guide/build-system.md:561`,
`:885-892`) describe the mechanism with examples and list no complete tool set, so they need no
update.

## Implementation details

### Approach

1. In `src/scripts/config-resolve-core.mjs`, append the `retro` entry after the `merge-gate` entry
   of `SUCCESSOR_SETS`, with its one-line comment. Change nothing else in the file.
2. In `test/config-resolve.test.mjs`, add `{ tool: 'retro', stops: [] }` to `RETIRED_CASES`
   directly before `{ tool: 'plan', stops: [], unknown: true }`. The existing loop then checks, for
   all six sample retired rows, absent and present successors: action `none`, no `raw`, no `line`,
   no value, and `unknown-tool` absent.
3. In the same file, add one test. It names the invariant it protects: "retro is a known read-only
   caller: it resolves configured values, acts on no retired row, and carries no unknown-tool". Its
   purpose is the issue's end-to-end criterion for one `retro` configuration, not new
   value behavior: value resolution takes no tool (`src/scripts/config-resolve-core.mjs:1433-1436`),
   and the `RETIRED_CASES` row already carries the `retro`-specific checks. The test writes a setup
   ADR with the rows `language.chat` = `de` (the language key `retro` reads, `src/shared/chat-language.md:3`), `skills.include` = `humanizer, distill` and the
   retired rows `worktree.baseBranch` and `prReview.bots`, resolves with `tool: 'retro'`, and
   asserts:
   - `values['language.chat'].value` is `de` and `values['skills.include'].items` is
     `['humanizer', 'distill']`;
   - both retired rows carry action `none`;
   - no diagnostic has code `unknown-tool`.
4. In `test/workflow-contracts.test.mjs`, add `['retro', null, []]` as the last row of the pinned
   array, matching step 1.
5. Run the validation plan below.

### Component structure

Not relevant: no component changes; one data row in an existing table.

### State management

Not relevant: the resolver is read-only and the change adds no state.

### API integration

The resolver's envelope shape is unchanged. For `retro`, `data.diagnostics` no longer contains
`unknown-tool`, and `data.retired` entries keep their shape with action `none`.

`setup status` iterates `SUCCESSOR_SETS` (`src/scripts/setup-status-core.mjs:887-893`). When a
retired row exists, it makes one more resolve call, for `retro`, and adds one `retro` evaluation
with action `none` to each retired row's `evaluations` (`src/scripts/setup-status-core.mjs:904-911`). A `none` evaluation never becomes a stop or report finding, and it never reaches
the tool mapping (`src/scripts/setup-status-core.mjs:909-918`), so `retro` can never appear in
`unmappedTools`. That keeps the pinned `unmappedTools` test with `workflowEdges: []`
(`test/setup-status-core.test.mjs:718-726`) green.

### Styling approach

Not relevant: no UI.

### Accessibility

Not relevant: no UI.

### Edge cases

- **Retired row whose successor is present.** For `retro` the action is still `none`, not
  `report`: the set is empty. This matches the read-only authority of `src/tools/retro.md`.
- **Caller passes a `mode` for `retro`.** `retro` is not in `MODE_TOOLS`, so a mode is handled like
  for every other null-mode tool. `successorSetFor` matches a `mode: null` entry for any mode. No new
  validation is added.
- **Genuinely unknown tool.** `no-such-tool` still emits `unknown-tool`, pinned by
  `test/config-resolve.test.mjs:2641-2651`. Supported tools without a set (for example `plan`) still
  emit it as well, pinned by the `plan` row of `RETIRED_CASES`.
- **Build guards.** `build.mjs:926` requires `src/tools/retro.md`, which exists.
  `assertSuccessorSetsReachExposedTools` (`build-lib.mjs:2151`, called from `build.mjs:1109`) requires an exposed tool to reach
  the entry; `retro` is exposed itself.
- **Hidden mode.** The change does not touch the hidden-mode path. `retro` still resolves through
  the same locator steps.

## Acceptance criteria

- [ ] The core `resolve({ cwd, tool: 'retro' })` succeeds, and no `data.diagnostics` entry has
      code `unknown-tool`. The new test in `test/config-resolve.test.mjs` pins this; the CLI path
      is covered by the manual check in the validation plan.
- [ ] For `retro`, every retired row carries action `none`, with and without its successor present.
      The `RETIRED_CASES` row `{ tool: 'retro', stops: [] }` pins this.
- [ ] For `retro`, `values['language.chat'].value` and `values['skills.include'].items` equal
      the configured rows. The new test pins this.
- [ ] `no-such-tool` and `plan` still emit `unknown-tool` (existing tests unchanged and green).
- [ ] `SUCCESSOR_SETS` ends with `['retro', null, []]`, pinned by `test/workflow-contracts.test.mjs`.
- [ ] CI's order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.

## Validation plan

- `pnpm test:preflight` in the worker sandbox before the suite.
- Focused: `node --test test/config-resolve.test.mjs` and
  `node --test test/workflow-contracts.test.mjs`, then `node --test test/setup-status-core.test.mjs`
  to confirm setup status is unaffected.
- Manual check from the checkout:
  `node src/scripts/config-resolve.mjs resolve <<< '{"cwd":"<absolute checkout>","tool":"retro"}'`
  returns no `data.diagnostics[].code` equal to `unknown-tool`; the same call with
  `"tool":"no-such-tool"` still returns it.
- CI's order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- `pnpm eval <suite> verify` (read-only) for all five suites (`merge-gate`, `iterate`,
  `next-steps`, `build-context`, `focus`), as CI reports them, to confirm the expected freshness
  debt and no integrity error.

## Assumptions and open points

- Assumption: `src/scripts/config-resolve-core.mjs` is in the `merge-gate`, `iterate` and
  `build-context` eval instruments (`evals/merge-gate/suite.config.mjs:109-110`,
  `evals/iterate/suite.config.mjs:60-61`, and the `scripts/` seeds of
  `evals/build-context/suite.config.mjs:15-23`). Editing the core creates visible freshness debt in
  these suites. Under the pragmatic test and release policy (`docs/adr/pragmatic-test-release-policy.md`)
  CI reports this debt without failing, and re-recording evidence is not part of this issue.
- Assumption: no test asserts the number of `setup status` resolver calls or evaluations. The
  examination found only `find`-based and `unmappedTools` assertions in
  `test/setup-status-core.test.mjs` (`:505-550`, `:715`, `:726`). The focused run in the validation
  plan confirms it.
- Out of scope, with a follow-up issue for the maintainer to open: `focus` has the same spurious
  `unknown-tool` (see "Architecture decisions"). Proposed follow-up: "config-resolve: recognize
  focus as a read-only caller", adding `{ tool: 'focus', mode: null, successors: [] }` to
  `SUCCESSOR_SETS` with its `RETIRED_CASES` row in `test/config-resolve.test.mjs` and its row in
  the pinned array of `test/workflow-contracts.test.mjs`, mirroring this plan.
- Out of scope: the twelve supported tools that load `config-migration` and still emit
  `unknown-tool` (see "Architecture decisions"). Whether they should get explicit empty sets is a
  separate question; their state is accepted, and pinned through the representative `plan` row.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[
  {
    "site": "S-BAT",
    "question": "Should src/tools/retro.md name the resolver tool: \"retro\" value as part of this change?",
    "options": ["Resolver-only fix", "Name the value in retro.md", "Resolver fix plus follow-up issue"],
    "scores": [
      {
        "label": "Resolver-only fix",
        "score": 9,
        "reason": "The generic call in config-migration.md:11 already has each tool pass its own name, so the successor-table entry fixes the diagnostic alone; its edge over option 3 is that it files no follow-up for an unneeded change."
      },
      {
        "label": "Name the value in retro.md",
        "score": 3,
        "reason": "It copies the config-migration contract into the always-loaded retro core, against the AGENTS.md rules to state a contract once and that length is paid on every run, with no behaviour gain."
      },
      {
        "label": "Resolver fix plus follow-up issue",
        "score": 4,
        "reason": "The fix is right, but the follow-up would only track the redundant clause of option 2, which is backlog noise rather than a real gap."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How should the plan handle focus, which has the same spurious unknown-tool diagnostic as retro?",
    "options": ["Retro only, name focus out of scope", "Add focus in the same change", "Retro only plus follow-up issue for focus"],
    "scores": [
      {
        "label": "Retro only, name focus out of scope",
        "score": 7,
        "reason": "focus lacks a successor set, loads no config-migration and may use the resolver only read-only, so naming it out of scope corrects the claim that retro is unique and keeps the issue scope, but a bare note is easy to lose."
      },
      {
        "label": "Add focus in the same change",
        "score": 5,
        "reason": "It is small and sound, but it goes beyond the issue acceptance criteria in an unattended run and widens the outcome checkpoint without a maintainer decision."
      },
      {
        "label": "Retro only plus follow-up issue for focus",
        "score": 8,
        "reason": "It keeps everything of option 1 plus a concrete follow-up the maintainer can open, so the focus gap stays traceable; that traceability is its edge over option 1."
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
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         0 |    5 |
| Scope           |        0 |         2 |    4 |
| Maintainability |        0 |         0 |    4 |

### Findings

Gap analysis (Phase 4):

- Scope, Note: the scope rationale's count of tools loading `config-migration` was imprecise. Adjusted, then corrected by the planning-ladder judgment: twelve tools include it directly, and `retro` reaches it through `chat-language`.
- Scope, Note: the fix relies on the caller passing `tool: "retro"`, which `src/tools/retro.md` does not name. Decided by score: resolver-only fix, `retro.md` unchanged, because `config-migration` already has each tool pass its own name.
- Testability, Note: the first acceptance criterion named the CLI, but the planned test calls the core. Adjusted: the criterion names the core `resolve`, and the CLI path stays a manual check.
- Maintainability, Note: four line references were off. Adjusted.

Internal review (Phase 6):

- Scope, Important: `retro` was presented as unique, but `focus` is in the identical position. Decided by score: this change stays with `retro`, and `focus` gets a concrete follow-up issue recorded under "Assumptions and open points".
- Testability, Note: the value test pinned nothing `retro`-specific, and "resolved as written" was ambiguous. Adjusted: the test names its purpose and the exact fields (`value`, `items`) and values it asserts.
- Maintainability, Note: the reason given for `retro` never being unmapped in `setup status` was wrong. Adjusted: a `none` evaluation never reaches the tool mapping.

Planning ladder (scoped judgment of the sections the decisions changed):

- Scope, Important: the scope rationale claimed that `retro` and `focus` do not load `config-migration`; both reach it through the `chat-language` lazy include. Adjusted: the rationale rests on the read-only authority and the issue's explicit request, and the `retro.md` bullet names the include path. The scored decisions stand.
- Testability, Note: the value test used `language.workflow`, which `retro` does not read. Adjusted: it uses `language.chat`.
- Maintainability, Note: `setup status` adds one `retro` evaluation per retired row, not one in total. Adjusted.
- Scope, Note: only the representative `plan` row pins the twelve tools' `unknown-tool` state. Adjusted.
- Scope, Note: the `focus` follow-up referred back to the false premise. Resolved with the first ladder finding.

Deep plan review (Phase 6b):

- Testability, Note: the eval-debt assumption missed the `build-context` suite, whose seeds include every `scripts/` file. Adjusted: the assumption names it, and the validation plan runs `verify` for all five suites as CI reports them.
- Maintainability, Note: the empty-set precedent's line reference was off. Adjusted.
- Testability, Note: the manual CLI check named no command. Adjusted: the validation plan spells out the call and the expected diagnostic for `retro` and `no-such-tool`.

## Open points

- No open points.
