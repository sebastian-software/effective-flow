# Deprecated pr-review alias for merge-gate, and a 1.x release

**Plan status:** Implemented
**Source:** /effective-flow plan
**Recommended workflow:** Feature (`/effective-flow build`)

## Requirement

Commit `88979a7` renamed the `pr-review` tool to `merge-gate` and shipped the rename as a breaking
change (`feat!` plus a `BREAKING CHANGE:` footer). The open release pull request `#319` therefore
proposes `2.0.0`. A major version is not wanted, and the rename does not have to be breaking: the
old invocation can keep working through a thin forwarding alias.

The change has three parts:

1. **Reintroduce `pr-review` as a deprecated alias.** A new, deliberately minimal tool source that
   emits a deprecation notice naming the new invocation and then forwards the run unchanged to
   `merge-gate`. It carries no gate logic of its own.
2. **Keep it out of the catalog.** Invoking the skill without a tool must list `merge-gate` only.
   The alias is reachable by name but is not advertised in the router catalog, in the router
   frontmatter description, or in the `argument-hint` autocomplete.
3. **Keep release-please on `1.x`.** The already-merged breaking commit cannot be rewritten, so the
   version is pinned once through a `Release-As: 1.56.0` footer in this change's commit body. The
   convention that a future tool rename ships an alias instead of a break is recorded in `AGENTS.md`
   and in the agent memory.

Classified as **Feature**: a new tool source, a new build-level alias mechanism, and a new router
dispatch clause — additive behavior, not a defect repair.

## Architecture decisions

- **The alias is an internal tool, not an exposed one.** `EXPOSED_TOOLS` is derived from
  `TOOL_GROUPS`, and `TOOL_GROUPS` drives the router catalog, the `catalogHint` guard, and
  `argument-hint`. Adding `pr-review` there would put it back in the overview. It instead becomes a
  built-but-unlisted tool source, like `apply-plan`, `apply-review`, and `apply-issues`.
- **A declared alias list, not an implicit convention.** `build.mjs` gains an explicit
  `DEPRECATED_TOOL_ALIASES` entry mapping `pr-review` to `merge-gate`. An unlisted-but-invocable
  name needs a declaration somewhere: the router's own dispatch rule sends an unknown tool to the
  catalog, so without a rendered clause the alias would be printed at rather than routed.
- **The dispatch clause is generated, not hand-written.** The three harnesses spell an invocation
  differently (`/effective-flow …`, `$effective-flow …`, `effective-flow …`). The clause is
  rendered from the alias list through the existing per-harness invocation helper via a new
  `{{DEPRECATED_ALIASES}}` router placeholder, so no target can drift.
- **Alias names count as invocable for `{{SKILL:…}}` rendering.** `{{SKILL:X}}` resolves to an
  invocation for an exposed tool and to `` `tools/X.md` `` otherwise. A deprecation notice addressed
  to a user must name the invocation, so reference rendering receives `EXPOSED_TOOLS` plus the alias
  names, while the catalog and `argument-hint` keep the pure exposed set.
- **The alias forwards; it never re-implements.** Every gate rule stays in `merge-gate.md`. The
  alias reads that file and follows it verbatim, which is the same workflow-to-workflow shape
  `apply` already uses for its internal sources.
- **The alias must not attract the central `pr-review` skill.** `merge-gate` forbids loading that
  skill in bold, and a tool source that now shares its name is exactly the accident that rule
  exists for. The alias states the exclusion explicitly.
- **`Release-As` in the commit body, not `release-as` in the configuration.** The commit footer is
  a one-shot override that cleans itself up; the configuration field stays in effect until somebody
  removes it and would silently freeze every later version. release-please's own documentation says
  to remove the configuration field after the release for exactly that reason.
- **The alias has a removal horizon.** It is removed in the next deliberate major release, with no
  fixed date and no separate cleanup ticket that could expire unnoticed. That removal is the change
  that legitimately carries a `!`, not this one.

## Affected files

| File                                        | Description                                                                                                                                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `build.mjs`                                 | Add `DEPRECATED_TOOL_ALIASES` (`pr-review` → `merge-gate`); render `{{DEPRECATED_ALIASES}}`; pass exposed-plus-alias names to reference rendering only; guards: every alias has a source, is absent from `TOOL_GROUPS`, and its replacement is exposed |
| `build-lib.mjs`                             | Pure renderer for the alias dispatch clause, taking the alias list and the harness invocation helper                                                                                                                                                   |
| `src/SKILL.md`                              | Dispatch rule gains the generated alias clause as an explicit exception to "unknown tool → print the catalog" and to "read no further tool file"; frontmatter description stays unchanged                                                              |
| `src/tools/pr-review.md`                    | New internal alias tool: quoted description, no `catalogHint`, no recommended-skills section, no `delegation-mandate` include; notice first, then forward                                                                                              |
| `AGENTS.md`                                 | New convention: renaming an exposed tool ships a deprecated alias instead of a breaking rename, with the `Release-As` note in the versioning section; fix the stale `pr-review` reference in "Delegation"                                              |
| `docs/user-guide/tools-deliver.md`          | Deprecation subsection under `merge-gate`: old name still works, prints a notice, forwards, is unlisted, removed in a future major                                                                                                                     |
| `docs/developer-guide/architecture.md`      | Document the alias mechanism alongside exposed/internal tools; fix the stale `pr-review` → `iterate` delegation reference                                                                                                                              |
| `test/workflow-contracts.test.mjs`          | Contract tests for the alias source, its absence from the catalog, the router clause, and the build declaration                                                                                                                                        |
| `test/build-lib.test.mjs`                   | Unit test for the alias clause renderer across the three harnesses                                                                                                                                                                                     |
| `test/delegation-mandate-contract.test.mjs` | Update the assertion message that still names `pr-review` as the workflow-to-workflow carve-out                                                                                                                                                        |
| commit body (no file)                       | `Release-As: 1.56.0` footer; Conventional type without `!` and without a `BREAKING CHANGE:` footer                                                                                                                                                     |
| agent memory (outside the repository)       | One memory entry recording the rename-ships-an-alias rule                                                                                                                                                                                              |

## Implementation details

### Approach

1. Add `DEPRECATED_TOOL_ALIASES` to `build.mjs` next to `TOOL_GROUPS`, with a comment stating why an
   alias is declared instead of listed. Derive the alias name set from it.
2. Add the build guards: each alias needs a matching `src/tools/<name>.md`; an alias name must not
   appear in `TOOL_GROUPS`; the replacement must be an exposed tool. Each failure exits with a
   message in the style of the neighboring guards.
3. Add the pure clause renderer to `build-lib.mjs` and call it from `build.mjs` where
   `catalogForHarness` and `argumentHint` are built. Leave both of those on `EXPOSED_TOOLS`.
4. Extend the reference config passed to `renderBody` so alias names render as invocations; leave
   `knownTools` as is (it already covers every tool source).
5. Write `src/tools/pr-review.md`: a quoted frontmatter description, then a body that (a) emits one
   deprecation notice naming the `merge-gate` invocation, in the conversation language, before
   anything else; (b) reads `tools/merge-gate.md` and follows it verbatim with the arguments
   unchanged; (c) states that it forwards unconditionally, holds no state, reads no configuration,
   and repeats the notice only once per run; (d) states that it is not the central `pr-review` skill
   and must not load it.
6. Add the `{{DEPRECATED_ALIASES}}` placeholder to `src/SKILL.md` directly below the `apply`
   exception in the dispatch section.
7. Update `AGENTS.md`, `docs/user-guide/tools-deliver.md`, and
   `docs/developer-guide/architecture.md`.
8. Add the tests, then run the CI sequence in order.
9. Commit with the `Release-As: 1.56.0` footer and open the pull request.
10. Write the memory entry for the rename convention.

### Router dispatch clause

Rendered per harness from the alias list, for example on Claude Code:

`- \`/effective-flow pr-review\` is the deprecated former name of \`/effective-flow merge-gate\`.`

followed by one sentence stating that it is intentionally absent from the catalog above and that
invoking it loads `tools/pr-review.md`, which reports the deprecation and forwards. The exact
wording is an implementation detail; the clause must make both facts explicit, because rule 1 of the
dispatch section otherwise routes an unlisted name to the catalog.

### Edge cases

- **Arguments after the alias** (`pr-review 42`, `#42`, a pull-request URL): forwarded verbatim.
  Argument parsing stays with `merge-gate`.
- **An argument the gate rejects:** the alias does not validate; the gate reports its own error, and
  the deprecation notice has already been shown.
- **A genuinely unknown tool name:** unchanged behavior — rule 1 prints the catalog. The alias clause
  is an enumeration, not a fuzzy fallback.
- **Codex and portable targets:** the clause is rendered with the target's own invocation syntax;
  the portable target has no `argument-hint`, so nothing is advertised there either.
- **The review-publication names stay put:** `src/shared/pr-review-comments.md`,
  `src/shared/pr-review-integration.md`, the `<!-- effective-flow-pr-review -->` marker,
  `delivery.prReview`, and the central `pr-review` skill are untouched. An existing contract test
  guards them; the new alias must not be mistaken for any of them.
- **`prReview.*` configuration keys:** already read for one generation with `mergeGate.*` taking
  precedence per key. No change, and no need for one.
- **`Release-As` and squash merge:** the footer sits in a branch commit body, which GitHub's squash
  default carries into the merge commit body (as `88979a7` shows). Verified after merge rather than
  assumed.

## Acceptance criteria

- [ ] `src/tools/pr-review.md` exists, is under 40 lines, contains no `## Phase` heading and no
      merge, check, or reviewer logic, and names both the deprecation notice and the forward to
      `merge-gate`.
- [ ] `node build.mjs` succeeds and writes `tools/pr-review.md` into all three targets
      (`dist/claude/effective-flow/`, `dist/codex/effective-flow/`,
      `dist/portable/effective-flow/`).
- [ ] No generated `SKILL.md` lists `pr-review` in its tool catalog or in its frontmatter
      description, and no `argument-hint` contains `pr-review`.
- [ ] Every generated `SKILL.md` contains an alias dispatch clause naming `pr-review`, `merge-gate`,
      and `tools/pr-review.md`, each in that target's invocation syntax.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all pass.
- [ ] The new contract tests fail against the current tree (checked once by reverting the source
      change locally) and pass with it.
- [ ] `AGENTS.md` states the rename convention, and no `AGENTS.md` reference to the old tool name
      remains except as the documented alias.
- [ ] `docs/user-guide/tools-deliver.md` documents the deprecated invocation, and
      `docs/developer-guide/architecture.md` documents the alias mechanism.
- [ ] The pull-request commit body contains `Release-As: 1.56.0`, its Conventional type carries no
      `!`, and it adds no `BREAKING CHANGE:` footer.
- [ ] After the merge, `git log -1 --format=%B` on `develop` contains `Release-As: 1.56.0` and the
      release pull request is titled `chore(develop): release effective-flow 1.56.0`.
- [ ] Before `#319` is merged, its `CHANGELOG.md` entry carries a note that the rename is
      non-breaking through the alias instead of the inherited breaking-change block.
- [ ] A memory entry records that a tool rename ships a deprecated alias for the old name.
- [ ] No user-facing document states that the old invocation no longer exists, and the deprecation
      note names the removal horizon as "the next deliberate major release".

## Validation plan

- The repository CI sequence in its documented order: `pnpm agent:check`, `pnpm test`,
  `node build.mjs`, `pnpm test:distribution`.
- Inspect the three generated `SKILL.md` files for the catalog, the description, the
  `argument-hint`, and the alias clause.
- Manual run: invoke the skill with no tool (catalog must not show `pr-review`), then invoke
  `pr-review` against an open pull request and confirm a single deprecation notice followed by the
  gate's own Phase 1 output.
- After the merge: check the merged commit body and the regenerated release pull-request title.

## Assumptions and open points

- `88979a7` is published on `develop` and is not rewritten. The version is corrected forward.
- **Verified, not assumed:** release-please's default versioning strategy resolves a `Release-As`
  note before it counts breaking commits — `determineReleaseType` returns a `CustomVersionUpdate`
  for the first commit carrying the note and never reaches the `breaking > 0` branch. The footer is
  case-insensitive and must stand on its own line in the commit body. Contingency if `#319` still
  shows `2.0.0` after the merge: set `"release-as": "1.56.0"` in `release-please-config.json` and
  remove the field in the commit that follows the release.
- `1.56.0` is the target version: `9cc99d3` and `88979a7` are features, so a minor bump is the
  honest non-major choice.
- The Conventional Commit type of this change is `feat` (a new tool source and a new build
  mechanism). With the version pinned by the footer, the type only selects the changelog section.
- Checked and deliberately unchanged: the legacy-`prReview.*` paragraph in
  `docs/user-guide/configuration.md` describes configuration keys, not the invocation, and stays
  correct. No document currently claims that the old invocation no longer exists, so nothing has to
  be walked back — only the new alias has to be introduced.
- The hand-edited `CHANGELOG.md` in `#319` is regenerated if further commits land on `develop`
  beforehand. Do the edit immediately before merging the release pull request.
- The alias is removed in the next deliberate major release; no date is fixed here.

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
| Maintainability |        0 |         1 |    1 |

A deep interactive review ran on this plan. It resolved two decisions — the alias lives until the
next deliberate major release, and the alias mechanism is a declared list rather than a one-off
constant — and replaced the plan's central release assumption with a verified statement.

### Findings

- **Scope, important — the release fix depends on a footer surviving a squash merge.** The one step
  that actually keeps the version on `1.x` happens outside the code, in a commit body. It is
  therefore an acceptance criterion checked against the merged commit rather than the branch, and
  the fallback to the configuration field is written down in advance.
- **Maintainability, important — an alias tends to grow into a second gate.** The next person with a
  gate-shaped concern will find a file named after the old tool and be tempted to put logic in it.
  Pinned by the size and shape criterion (under 40 lines, no phase headings, no merge or check
  logic) plus the explicit statement that it is not the central `pr-review` skill.
- **Architecture, note — the old name has no autocomplete.** Excluding aliases from `argument-hint`
  is what "not in the overview" means at the harness level: a user who types the old name still gets
  routed, but nothing suggests it. Deliberate.
- **Error cases, note — the alias validates nothing.** It forwards any argument, including a
  malformed one, and lets the gate produce the error. That keeps a single source of argument
  handling and is preferable to a second, drifting parser in the alias.
- **Testability, note — no test proves a harness routes an unlisted name.** The guarantee is the
  rendered dispatch clause. Tests can pin that the clause exists in each generated router and names
  all three tokens; the actual routing is verified once, manually.
- **Architecture, note — a declared alias list for a single entry is deliberate.** Confirmed in
  review: the same change writes down the convention that the next tool rename ships an alias, so
  the next rename should be a list entry rather than a second mechanism. The cost is one array plus
  three guards.
- **Maintainability, note — the removal horizon carries no date.** Confirmed in review: the alias
  is removed with the next deliberate major release rather than on a fixed deadline, which avoids a
  cleanup ticket nobody owns. The tradeoff accepted is that two names coexist until that release.

## Implementation record

**Date:** 2026-08-05
**Workflow:** `/effective-flow build`
**Delivery branch:** `effective-flow/build/pr-review-deprecated-alias` (from `824a746`)

Implemented as planned. Deviations and additions worth recording:

- `build.mjs`'s rendered-output guard (the unresolved-placeholder regex) now also lists
  `DEPRECATED_ALIASES`. Two of the four router-only placeholders were already guarded, so this
  follows the existing majority; without it, a typo'd placeholder would ship as literal text and
  silently stop the alias from routing. `TOOL_CATALOG` remains the one pre-existing gap and was
  deliberately left alone.
- `renderDeprecatedAliasClause(aliases, skillInvocation)` returns `''` for an empty list, so the
  day the last alias is removed the placeholder renders to nothing rather than to a dangling
  heading. It throws on a malformed entry.
- One documentation surface beyond the planned set was updated: `docs/developer-guide/build-system.md`
  carries the repository's guard catalog, which would have been incomplete without the three new
  alias guards.
- The alias list is an array of `{ alias, replacement }` objects: it keeps a deterministic order
  for the rendered clause and reads the same way in the guards and in the renderer.

## Test results

**Date:** 2026-08-05

| Check                    | Result                         |
| ------------------------ | ------------------------------ |
| `pnpm agent:check`       | passed                         |
| `pnpm test`              | passed (501 tests)             |
| `node build.mjs`         | passed (19 tools + 8 internal) |
| `pnpm test:distribution` | passed                         |

New coverage: five contract tests in `test/workflow-contracts.test.mjs` (alias source stays
minimal and notifies before forwarding; it disclaims the central `pr-review` skill; `build.mjs`
declares the alias and keeps it out of `TOOL_GROUPS`; `argument-hint` derives from the pure
exposed set; `src/SKILL.md` carries the placeholder) plus unit tests for
`renderDeprecatedAliasClause` in `test/build-lib.test.mjs` covering all three harness spellings,
the empty list, and each malformed input. Four of these were proved to fail against the
pre-change tree by temporarily reverting the corresponding source line.

Generated output verified directly: `tools/pr-review.md` exists in all three targets; each
`SKILL.md` mentions `pr-review` exactly once — the dispatch clause, in that target's own
invocation syntax — and no catalog entry, frontmatter description or `argument-hint` names it.

## Review findings

**Date:** 2026-08-05
**Reviewer:** technical validation only

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     1 |
| Open / Not implemented |     0 |

Every changed source file falls into the `tooling` routing bucket (build and release tooling,
skill sources, repository metadata), whose reviewer under the canonical routing contract is the
technical validation that ran in the validation phase; the degraded product-reviewer fallback is
explicitly not used for tooling. The one finding — an invented issue reference in a test section
comment — was fixed in this run. No external review report was needed.

## Open points

- No open points.
