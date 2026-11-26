# config-resolve: recognize focus as a read-only caller

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #789

## Requirement

`effective-flow focus` reads language and skill settings through the shared configuration resolver,
read-only and without migration (`src/shared/focus-session-contract.md:12-13`). It reaches
`config-migration` through the lazy include in `src/shared/chat-language.md`, and the config locator
passes the calling tool's own name as `tool` (`src/shared/config-migration.md:11-13`), so a `focus`
run resolves with `tool: "focus"`. `focus` is an exposed tool in the "Ensure quality" group
(`build.mjs:340-341`).

`SUCCESSOR_SETS` in `src/scripts/config-resolve-core.mjs:173-205` has no `focus` entry.
`successorSetFor` therefore returns `null` for `focus`, and `classifyRetiredRows` adds an
`unknown-tool` diagnostic to every `focus` resolve, although `focus` is a supported tool.

Goal:

- Resolving with `tool: "focus"` returns the configured values and no `unknown-tool` diagnostic.
- Every retired row resolves to action `none` for `focus`, with and without its successor present,
  so the read-only session check never stops or points to a migration because of a retired row.
- Genuinely unknown tools (`no-such-tool`) and supported tools without a set (`plan`) still emit
  `unknown-tool`.

The observable change is limited to that diagnostic: with no successor set every retired row's
action already stays `none` (`src/scripts/config-resolve-core.mjs:1337-1340`), and
`src/shared/config-migration.md` says `unknown-tool` needs nothing. The new retired-row case is a
regression pin, not a behaviour fix.

Workflow rationale: Bugfix. A supported tool receives a diagnostic meant for unknown tools; the
fix corrects that classification with one data entry, its two pinned test oracles and one value
test. It adds no capability and changes no other tool's behaviour.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow, issue #789.
**Original outcome:** `focus` resolves configuration without an `unknown-tool` diagnostic and acts
on no retired row; unknown and unmapped tools keep their diagnostic; CI's order passes.
**Last evaluated attempt:** none.
**No-progress count:** 0
**Cumulative approach:** One explicit empty successor set for `focus` in `SUCCESSOR_SETS`, pinned
by the existing retired-row oracle and the workflow-contract snapshot; mirrors the open `retro`
change (#783 / PR #785).
**Continuation decision:** none.

## Architecture decisions

- `focus` gets an explicit empty successor set, `{ tool: 'focus', mode: null, successors: [] }`.
  An empty set is the existing way to mark a tool that acts on no retired row; the only precedent
  in this checkout is `apply-review` local mode (`src/scripts/config-resolve-core.mjs:192`). With
  an empty set every retired row keeps the default action `none`, whether or not its successor is
  present (`src/scripts/config-resolve-core.mjs:1337-1340`).
- `focus` is **not** added to `RETIRED_EXEMPT_TOOLS` (`src/scripts/config-resolve-core.mjs:209`).
  That list is the setup repair path, which receives retired rows' raw values and original lines;
  a read-only session check must not receive them.
- `mode: null`: `focus` has no modes, so `MODE_TOOLS` is unchanged and `SUCCESSOR_SET_TOOLS`
  picks up `focus` automatically (`src/scripts/config-resolve-core.mjs:212-222`).
- The entry carries a one-line comment that marks it as a read-only caller that acts on no
  retired row; it explains why the set is empty. The wording is PR #785's, exactly:
  `// A read-only caller: it acts on no retired row.` When both rows exist, they share one comment
  with this exact plural text: `// Read-only callers: they act on no retired row.`
- Position, ordered by landing (decided by score): the change that lands second appends its row
  last, in the source and in both test oracles, so each plan's own criterion holds when it lands
  (PR #785 pins "`SUCCESSOR_SETS` ends with `['retro', null, []]`"). Implemented before PR #785
  merges, `focus` is appended after the current last entry, `merge-gate`; implemented after it,
  `focus` goes after `retro`. There is no fixed `retro`-before-`focus` rule.
- Scope: only `focus` is in scope. Like `retro`, it reaches `config-migration` only through the
  lazy include in `src/shared/chat-language.md`. Tools that include `config-migration` directly and
  have no successor set keep `unknown-tool` on purpose; `plan` stays the pinned example. There is no
  generic fallback for unknown tools.

## Affected files

| File | Description |
|---|---|
| `src/scripts/config-resolve-core.mjs` | Append the `focus` entry with an empty successor set and a one-line read-only-caller comment to `SUCCESSOR_SETS`, as its last element: after `merge-gate`, or directly under `retro` if PR #785 has landed, sharing one plural comment. |
| `test/config-resolve.test.mjs` | Add `{ tool: 'focus', stops: [] }` to `RETIRED_CASES` directly before the `plan` row, so the parametrized retired-row test pins action `none` and no `unknown-tool` for `focus`; add one value test that `focus` resolves its configured `language.chat` and `skills.include` (or extend #785's `retro` value test to cover both tools, if present). |
| `test/workflow-contracts.test.mjs` | Add `['focus', null, []]` to the pinned `SUCCESSOR_SETS` snapshot, at the same position as in the source. |

## Implementation details

### Approach

1. In `src/scripts/config-resolve-core.mjs`, append `{ tool: 'focus', mode: null, successors: [] }`
   as the last element of `SUCCESSOR_SETS`. Two cases:
   - No `retro` entry (PR #785 not merged): append after `merge-gate`, preceded by
     `// A read-only caller: it acts on no retired row.`
   - `retro` entry present: append directly after `retro` and replace its comment with the one
     shared comment `// Read-only callers: they act on no retired row.` above both rows.

   Leave `RETIRED_EXEMPT_TOOLS`, `successorSetFor` and `classifyRetiredRows` unchanged.
2. In `test/config-resolve.test.mjs`, insert `{ tool: 'focus', stops: [] }` into `RETIRED_CASES`
   (`test/config-resolve.test.mjs:1539-1559`) immediately before `{ tool: 'plan', stops: [], unknown: true }`
   (after the `retro` row, if present). The oracle-coverage test
   (`test/config-resolve.test.mjs:1561-1567`) requires this row once the source entry exists; the
   parametrized test (`test/config-resolve.test.mjs:1569-1606`) then checks, for successor absent
   and present, that every retired row has action `none` and that no `unknown-tool` diagnostic is
   emitted.
3. In the same file, add one test after the parametrized retired-row loop whose title names the
   invariant it protects, for example "focus is a known read-only caller: it resolves configured
   values, acts on no retired row, and carries no unknown-tool". It writes a setup ADR with
   `language.chat` = `de` and `skills.include` = `humanizer, distill` (the language and skill keys
   `focus` reads, `src/shared/focus-session-contract.md:12-13`) plus the retired rows
   `worktree.baseBranch` and `prReview.bots`, resolves `{ cwd, tool: 'focus' }`, and asserts:
   `values['language.chat'].value` is `de`, `values['skills.include'].items` is
   `['humanizer', 'distill']`, both retired rows have action `none`, and no diagnostic has code
   `unknown-tool`. If PR #785's `retro` value test is present, turn it into one loop over
   `['retro', 'focus']` instead of adding a second copy.
4. In `test/workflow-contracts.test.mjs`, append `['focus', null, []]` to the expected array of the
   `SUCCESSOR_SETS` snapshot (`test/workflow-contracts.test.mjs:2936-2955`), after
   `['merge-gate', null, ['mergeGate.*']]` (or after the `retro` row, if present).
5. Commit with a Conventional Commit such as `fix(config-resolve): recognize focus as a read-only caller`;
   the pull request body references the issue with `Refs #789` (no closing keyword, no AI
   attribution).

### Component structure

Not relevant: a single data-table entry; no new component.

### State management

Not relevant: the resolver stays read-only and writes no runtime state.

### API integration

Not relevant: the resolver's output envelope is unchanged; only the diagnostic list for
`tool: "focus"` loses its `unknown-tool` entry.

### Styling approach

Not relevant: no UI.

### Accessibility

Not relevant: no UI.

### Edge cases

- Retired row present, successor absent: action `none`, no stop.
- Retired row and its successor both present: action `none`, no report.
- `setup status` (`src/scripts/setup-status-core.mjs:889-894`) iterates `SUCCESSOR_SETS` and
  gains one `focus` evaluation per retired row, each with action `none`. Only `stop` and `report`
  evaluations reach its findings and `unmappedTools` (`src/scripts/setup-status-core.mjs:920-941`),
  so its report is unchanged; no test asserts the length of `evaluations` (only `.find`).
- The build guard that every successor-set tool reaches an exposed tool
  (`build-lib.mjs:2151`) passes, because `focus` is itself exposed.
- `tool: "plan"` and `tool: "no-such-tool"` still produce `unknown-tool`
  (`test/config-resolve.test.mjs:1558`, `test/config-resolve.test.mjs:2641-2648`).
- Merge order with PR #785: both changes append at the same line in three files. Whichever lands
  second resolves the textual conflict by keeping both rows with its own row last, merges the two
  read-only-caller comments into the one plural comment above both rows, and merges the two value
  tests into one loop over both tools, so no near-identical comment or test is left behind in
  either order. If this change lands first, that merge belongs to PR #785's rebase; the textual
  conflict in all three files surfaces it there.

## Acceptance criteria

- [ ] `resolve({ cwd, tool: 'focus' })` succeeds, and no `data.diagnostics` entry has code
      `unknown-tool` (checked by the `RETIRED_CASES`-driven test for `focus` in
      `test/config-resolve.test.mjs`).
- [ ] For `focus`, `values['language.chat'].value` and `values['skills.include'].items` equal the
      configured `de` and `['humanizer', 'distill']` in the new value test (or the shared
      `retro`/`focus` loop), which also asserts action `none` and no `unknown-tool`.
- [ ] The `RETIRED_CASES` row `{ tool: 'focus', stops: [] }` exists and its test passes, pinning
      action `none` for every retired row with and without its successor present.
- [ ] `focus` is not in `RETIRED_EXEMPT_TOOLS`; the pin `RETIRED_EXEMPT_TOOLS` equals `['setup']`
      in `test/workflow-contracts.test.mjs` stays unchanged and green.
- [ ] `no-such-tool` and `plan` still emit `unknown-tool`: their existing tests are unchanged and
      green.
- [ ] The pinned `SUCCESSOR_SETS` array in `test/workflow-contracts.test.mjs` contains
      `['focus', null, []]` at the same position as the source entry.
- [ ] CI's order passes: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.

## Validation plan

- Targeted, through `t3-project`: `node --test test/config-resolve.test.mjs`,
  `node --test test/workflow-contracts.test.mjs`, and `node --test test/setup-status-core.test.mjs`
  (confirms the extra `none` evaluations change no setup-status result).
- Full CI order, through `t3-project`: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
  `pnpm test:distribution`.
- Read-only check of behavioural eval evidence, all five suites as CI reports them:
  `pnpm eval <suite> verify` for `merge-gate`, `iterate`, `next-steps`, `build-context` and
  `focus`. Expected: freshness debt for the edited `src/scripts/config-resolve-core.mjs` only in
  `merge-gate`, `iterate` and `build-context` (accepted, see assumptions); no integrity error in
  any suite. Debt reported by `next-steps` or `focus` contradicts the seed analysis below and is
  reported, not re-recorded.

## Assumptions and open points

- Verified: `focus` resolves through the shared config locator with its own tool name
  (`src/shared/focus-session-contract.md:12-13`, `src/shared/chat-language.md:28-31`,
  `src/shared/config-migration.md:11-13`).
- Verified: `src/scripts/config-resolve-core.mjs` is shipped (`build.mjs:196-197`, in
  `RUNTIME_SCRIPT_FILES`).
- Verified: no developer guide lists per-tool successor sets
  (`docs/developer-guide/configuration.md:533`, `docs/developer-guide/build-system.md:885`), so no
  documentation change is needed.
- Verified: the `merge-gate` and `iterate` eval suites seed `scripts/config-resolve-core.mjs`
  (`evals/merge-gate/suite.config.mjs:109-110`, `evals/iterate/suite.config.mjs:60-61`), and
  `build-context` hashes all `scripts/*` except the remote tracker
  (`evals/build-context/suite.config.mjs:21-22`). By their `suite.config.mjs` seeds, the `focus`
  (`SKILL.md`, `tools/focus.md`) and `next-steps` suites do not include it; the validation plan
  confirms this with `verify` on all five suites.
  Editing the file creates visible freshness debt there; CI reports it without failing.
  Re-recording evidence is out of scope for this issue.
- Assumption: PR #785 (`retro`) may land before or after this change; the plan orders the rows by
  landing and covers both orders (decided by score below; see Architecture decisions and Edge
  cases).
- Assumption: the value test exercises tool-independent value resolution; it is kept because the
  issue's expected outcome says `focus` "returns the configured values" (decided by score below).

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->
```json
[{"site":"S-BAT","question":"How should the plan handle the focus value test, given that value resolution is tool-independent and open PR #785 adds the same-shaped retro test and comment?","options":["Keep and merge on second landing","Drop the value test","Keep as written"],"escape":[],"stop":null,"scores":[{"label":"Keep and merge on second landing","score":9,"reason":"Covers the issue outcome that focus returns its configured values and removes the duplicate risk whichever change lands first; its edge over dropping the test is that the stated outcome stays tested."},{"label":"Drop the value test","score":5,"reason":"The RETIRED_CASES row already pins the focus-specific behaviour, but the explicit returns-the-configured-values outcome would stay unchecked."},{"label":"Keep as written","score":3,"reason":"Knowingly allows duplicate comments and value tests if focus merges before #785, against the state-a-contract-once rule."}]},{"site":"S-DEC","question":"How should the plan order the focus and retro (PR #785) entries and handle the merge when either change lands first?","options":["Order by landing","Require #785 first","Fixed order with PR note","Decide later"],"escape":["Decide later"],"stop":null,"scores":[{"label":"Order by landing","score":9,"reason":"Each plan keeps its own acceptance criterion at its landing and nothing blocks the draft PR; its edge is that it neither waits on an uncontrolled merge nor overrides an archived criterion."},{"label":"Require #785 first","score":4,"reason":"Avoids every ordering question but blocks this implementation indefinitely on an open PR whose merge timing nobody here controls."},{"label":"Fixed order with PR note","score":3,"reason":"Knowingly breaks PR #785 archived ends-with-retro criterion if focus lands first and needs an action on a PR this run cannot edit."}]}]
```
<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area | Critical | Important | Note |
|---|---:|---:|---:|
| Architecture | 0 | 0 | 0 |
| Security | 0 | 0 | 0 |
| Data protection | 0 | 0 | 0 |
| Error cases | 0 | 0 | 0 |
| Testability | 0 | 0 | 1 |
| Scope | 0 | 0 | 1 |
| Maintainability | 0 | 0 | 4 |

### Findings

- Maintainability, Note: Approach step 1 proposed a tool-specific comment text that differed from
  the PR #785 wording named under Architecture decisions. Adjusted: step 1 uses the #785 wording,
  singular without `retro` and one shared plural comment with it.
- Maintainability, Note: two cited line ranges in `src/scripts/config-resolve-core.mjs` were off
  (the `apply-review` local precedent and the default-action block). Adjusted to the verified lines.
- Scope, Note: the value test checks tool-independent value resolution, and the comment/test merge
  rule covered only the order in which PR #785 lands first. Decided by score: keep the value test,
  and whichever change lands second merges the comments and value tests (see Edge cases).
- Gap analysis (incorporated before this review): the plan now covers the issue's "returns the
  configured values" outcome with a value test, states that the observable change is limited to
  the `unknown-tool` diagnostic, and explains why only `focus` is in scope.

#### Deep review (2026-11-26)

- Maintainability, Note: the fixed `retro`-before-`focus` order contradicted PR #785's own
  criterion "`SUCCESSOR_SETS` ends with `['retro', null, []]`" if this change lands first.
  Decided by score: order by landing; the change that lands second appends its row last and does
  the comment and value-test merge (Architecture decisions, Edge cases).
- Testability, Note: the validation plan checked eval evidence for only three suites, while CI
  reports all five. Adjusted: `verify` runs on all five suites, with freshness debt expected only
  in `merge-gate`, `iterate` and `build-context`.
- Maintainability, Note: a wrong `setup-status-core.mjs` line range, a garbled Approach step 1 and
  a plural comment given only as an example. Adjusted: the range is `920-941`, step 1 names two
  plain cases, and the plural comment text is fixed.

## Open points

- No open points.
