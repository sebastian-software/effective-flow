# merge-gate: spell out the probe and plan-reference-resolve calls literally

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)
**Issue:** #815

## Requirement

`src/tools/merge-gate.md` names two helper calls only in prose, so an orchestrator has to search
the shipped `scripts/` to find the command and may guess a name:

- Phase 0 step 2 (`src/tools/merge-gate.md:180-184`) says "Run the forge preflight: detect the
  host and CLI, probe availability and authentication, and read the capabilities …". The helper
  operation is `remote-tracker.mjs probe`. No file under `src/` spells out this call line; the
  operation appears only as a row in the lazy `src/shared/remote-tracker-operations.md:35`.
- The `Associated plan:` handoff line (`src/tools/merge-gate.md:286-291`) says "resolve it through
  `plan-reference-resolve`" without its script. The operation lives in
  `effective-flow-mechanics.mjs`; `src/shared/plan-reference-routing.md:9`, the nearest call, is a
  fragment merge-gate never loads.

Goal: both sites give one literal command line with script and operation, and a contract test
keeps the literals present and bound to operations the helpers accept.

Workflow rationale: Bugfix. In this repository `src/**/*.md` is the shipped product (AGENTS.md,
"Skill Markdown routes as product source"). An instruction that omits the command a step must run
is a defect in that product: each run pays a search and risks a guessed name. The new contract
test fails before the change and passes after it. That is the reproduction `effective-flow fix`
expects. No helper behaviour changes.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #815; target
`src/tools/merge-gate.md` on `develop`.
**Original outcome:** both helper calls given as literal command lines in `src/tools/merge-gate.md`,
plus a contract test asserting both literals and that each names an operation its helper accepts.
**Last evaluated attempt:** none (fresh baseline).
**No-progress count:** 0
**Cumulative approach:** prose-to-literal edit of two sites in one tool source, one new contract
test, and lockstep update of existing prose pins.
**Continuation decision:** none.

## Architecture decisions

- **Shape of the probe literal:** exactly
  `node <skill-root>/scripts/remote-tracker.mjs probe <<< '{"cwd":"<RUNTIME_STATE_ROOT>"}'`.
  `probe` is a member of `REMOTE_OPERATIONS` (`src/scripts/remote-tracker-core.mjs:169`), takes no
  required key and is not a mutation, so it carries no `--apply` (`src/scripts/remote-tracker.mjs`
  rejects `--apply` on a non-mutation). `cwd` is `RUNTIME_STATE_ROOT` per the Phase 0 rule at
  `src/tools/merge-gate.md:152-153` and `src/shared/remote-helper-contract.md`.
- **Shape of the plan-reference literal:** exactly one line in the form
  `node <skill-root>/scripts/effective-flow-mechanics.mjs plan-reference-resolve <<< '{"cwd":"<root>","planDir":"<plan.dir>","reference":"<repo-relative path>"}'`.
  The helper's schema is closed to exactly `cwd`, `planDir` and `reference`
  (`requireInput(input, ['cwd', 'planDir', 'reference'])`,
  `src/scripts/effective-flow-mechanics-core.mjs:856`). An extra or renamed key fails with
  `INVALID_INPUT`, so the literal carries no other key. `reference` reuses the line's own
  placeholder `<repo-relative path>` instead of the issue's `<path>`, so the reader sees that the
  `Associated plan:` value is passed. `<root>` keeps the existing definition: the root `plan.dir`
  resolves against, which is the checkout root, or `RUNTIME_STATE_ROOT` in hidden mode. It is not
  `<RUNTIME_STATE_ROOT>`, which would be wrong outside hidden mode.
- **Keep the surrounding sentence and its semantics:** the literal replaces only the bare
  operation name and the prose description of its `cwd`/`planDir` keys. The pass rule (`resolved`
  with `data.exact` true inside `<plan.dir>/` or `<plan.dir>/archive/`), the drop-on-failure rule
  and the "Entry repeats it" link stay word for word. `src/shared/merge-gate-delegated-run.md:29`
  references this check and stays unchanged.
- **Carry the inline-ban sentence in merge-gate.md:**
  `test/helper-call-shape-contract.test.mjs:157-165` requires every source that shows a
  `remote-tracker` call to contain the exact `INLINE_BAN` sentence (`:15-16`) in its own text.
  merge-gate.md has the sentence today only through fragments it includes:
  `src/shared/config-migration.md:14`, `src/shared/remote-helper-contract.md` inside
  `pr-review-comments`, and the lazy `src/shared/merge-gate-delegated-run.md:424`. The built core
  therefore repeats the sentence. Other hosts already carry this forced copy for the same test
  (`src/tools/setup.md:437`, `src/tools/issue-buddy.md:91`, `src/shared/verification-evidence.md:8`),
  so it does not break "state a contract once" as the repository applies it. Put the sentence
  directly after the `probe` literal, so "such command" refers to that literal. Its `'` → `'\''`
  escape also applies to the `reference` value; the plan-reference item points back to it.
- **Keep the `cwd` rules apart:** the Phase 0 preamble (`src/tools/merge-gate.md:152-153`) binds
  `RUNTIME_STATE_ROOT` as `cwd` for remote-helper calls only. Nothing new may extend it to the
  mechanics call, whose `<root>` is defined next to its own literal.
- **New focused contract test file:** add `test/merge-gate-helper-calls-contract.test.mjs`. It
  follows the `*-contract.test.mjs` pattern of
  `test/merge-gate-conflict-validation-contract.test.mjs` and imports the exported operation lists
  `REMOTE_TRACKER_OPERATIONS` (`src/scripts/remote-tracker-core.mjs:251`) and
  `MECHANICS_OPERATIONS` (`src/scripts/effective-flow-mechanics-core.mjs:63`). The existing pins in
  the large `test/workflow-contracts.test.mjs` are changed only where its wording changes.
- **Out of scope:** the `AMBIGUOUS_HOST` retry with a `provider` key, other prose-only helper
  mentions in other tools, and widening the `helper-call-shape` fragment to
  `effective-flow-mechanics.mjs`.

## Affected files

| File                                             | Description                                                                                                                                                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/merge-gate.md`                        | Phase 0 step 2 gains the literal `probe` call followed by the inline-ban sentence; the `Associated plan:` item gains the literal `plan-reference-resolve` call; raise `contextBudget` if the build report demands it |
| `test/merge-gate-helper-calls-contract.test.mjs` | New contract test: both literals present in the merge-gate source, each operation accepted by its helper, both payloads accepted by their helper's `executeOperation`                                                |
| `test/workflow-contracts.test.mjs`               | Update the verbatim pin of the `Associated plan:` sentence (`:5390-5393`) to the new wording; adjust any other pin the rewrap breaks                                                                                 |

## Implementation details

### Approach

1. **Phase 0 step 2.** Keep the capability list and the `CLI_MISSING`/`AUTH_FAILED`/
   `AMBIGUOUS_HOST` handling unchanged, and order the step like this:
   1. "Run the forge preflight:" followed by the literal `probe` line from "Architecture
      decisions", written as an inline code span on its own source line, as in
      `src/tools/setup.md:436`, never as a fenced block.
   2. The exact `INLINE_BAN` sentence from `test/helper-call-shape-contract.test.mjs:15-16` ("Each
      call is exactly one such command, …"), copied character for character.
      `src/tools/setup.md:436-437` already uses this placement after a single literal.
   3. "From its `data.capabilities`, read" the unchanged capability list, kept as one contiguous
      run, because `test/workflow-contracts.test.mjs:13986-13988` pins it that way.
   4. The existing `CLI_MISSING`/`AUTH_FAILED`/`AMBIGUOUS_HOST` sentences.

   Add no other framing sentence about the general call form, which
   `src/shared/remote-helper-contract.md:5-8` already owns. Leave the Phase 0 preamble (`:152-153`)
   unchanged.

2. **`Associated plan:` item.** Replace "resolve it through `plan-reference-resolve` with `cwd`
   the root `plan.dir` resolves against (the checkout root, or `RUNTIME_STATE_ROOT` in hidden mode)
   and `planDir` the configured `plan.dir`" with the literal `plan-reference-resolve` line. Define
   `<root>` as that same root and `<plan.dir>` as the configured `plan.dir`. For the quote escape,
   add a short back-reference such as "spelled per the call rule of Phase 0 step 2", not a second
   copy of the escape clause. Keep "Before every dispatch, re-dispatches included, or an inline
   run" in front and the pass/drop rules after it, unchanged.
3. **New contract test.** In `test/merge-gate-helper-calls-contract.test.mjs`, read
   `src/tools/merge-gate.md` and, with a comment naming the invariant each protects, add:
   - an assertion that each of the two exact literals sits whole on one source line
     (`source.split('\n').some((line) => line.includes(LITERAL))`), not only in flattened text;
   - an extraction of every inline code span of the merge-gate source that starts with
     `node <skill-root>/scripts/<helper>.mjs`, whatever argv follows. The first argv token is
     the operation, checked against a small map from helper to
     operation list: `remote-tracker` → `REMOTE_TRACKER_OPERATIONS`, `effective-flow-mechanics` →
     `MECHANICS_OPERATIONS`. A span naming a helper the map lacks fails the test, so the map grows
     with the source. Both mapped helpers must occur, so the test cannot pass vacuously;
   - the issue's payload check against each helper's own validation. Each payload is parsed from
     the span extracted from the source, never from a constant in the test; the placeholders sit
     inside strings, so the payload is valid JSON:
     - `plan-reference-resolve`: bind by key. `cwd` becomes a temporary root made with
       `mkdtemp` under `os.tmpdir()`, as `test/effective-flow-mechanics.test.mjs:57-61` does.
       `planDir` becomes `docs/plan`, and `reference` becomes `docs/plan/<file>.md`, a file the
       test creates. Never create a directory literally named after a placeholder. Call
       `executeOperation('plan-reference-resolve', …)` from
       `src/scripts/effective-flow-mechanics-core.mjs`, as `test/effective-flow-mechanics.test.mjs:996`
       does. Assert `ok: true`, `data.outcome === 'resolved'` and `data.exact === true`. The call
       touches only the filesystem (`:855-870`, `planRoots` `:446-455`).
     - `probe`: a smoke check, because remote operations have no closed key set and check `cwd`
       only as a string (`src/scripts/remote-tracker-core.mjs:7232`). First assert that the
       parsed payload's keys are exactly `['cwd']`. Then call `executeOperation('probe', …)` from
       `src/scripts/remote-tracker-core.mjs` with the parsed payload, merged with the offline
       harness of `test/remote-tracker-operations-reference.test.mjs:400-419`: a `repository`
       override key, `skipProbe: true`, and a runner that throws. Assert `ok: true` and zero
       runner calls, as that file does for its `ZERO_RUNNER_READS` (`:57-59`, `:449-452`). No
       forge CLI runs.

     Each payload check fails when its span is missing, as the map check does, so every new
     assertion is red before the change.
4. **Lockstep pins.** Update the `Associated plan:` regex in
   `test/workflow-contracts.test.mjs:5390-5393` to the new sentence and keep its invariant comment.
   The rewritten pin must still assert all of these:
   - "Before every dispatch, re-dispatches included, or an inline run";
   - the full `plan-reference-resolve` literal;
   - "it passes only on `resolved` with `data.exact` true inside `<plan.dir>/` or
     `<plan.dir>/archive/`";
   - "Drop a line that fails, also on a nonzero exit or `ok: false`, so it never aborts the gate";
   - `"Entry" repeats it`.

   Re-run the other merge-gate pins in that file, such as the Phase 0 capability pin at
   `:13982-13990`, and adjust only those whose matched wording actually changed.

5. **Budget and format.** Run `node build.mjs`. If the `Always-loaded core (lines/budget)` report
   for `merge-gate` exceeds `contextBudget: 981`, raise it to the built count plus at most ten
   lines (AGENTS.md, "Adding a tool or agent"). Then run `pnpm format`.

### Edge cases

- **Quote in a plan path:** a `reference` that contains `'` must be written as `'\''` per the
  inline-ban sentence. The escape is mandatory: an unescaped quote closes the here-string early,
  and the rest is parsed as further shell words, which can change the command instead of just
  failing it. The value comes from the user or a retained session link, not from forge text, so
  the exposure is small. A `"` or `\` in the path breaks only the JSON. That fails closed with
  `INVALID_INPUT`, and the existing rule turns it into a dropped `Associated plan:` line, never
  an aborted gate.
- **Hidden mode:** `<root>` stays `RUNTIME_STATE_ROOT` in hidden mode and the checkout root
  otherwise. The literal must not hard-code `<RUNTIME_STATE_ROOT>` for this call.
- **`AMBIGUOUS_HOST`:** the existing "ask for the provider once and retry" text is unchanged; how
  the retry passes the provider is out of scope (see "Assumptions and open points").
- **Delegated-run Entry:** `src/shared/merge-gate-delegated-run.md:29` applies "the caller's
  `Associated plan:` check" by reference, so it inherits the literal without its own copy. The
  `workflow-contracts` invariant that the lazy fragment keeps no second copy (`:5398-5400`) must
  still pass.
- **Line wrapping:** `.oxfmtrc.json` sets no `proseWrap`, so `pnpm format` keeps prose as it is
  and does not change inline code spans. The risk is a hand-wrapped literal. A wrapped `probe` call
  would also fail `SHAPES` in `test/helper-call-shape-contract.test.mjs`, but nothing there
  catches a wrapped mechanics call: `effective-flow-mechanics` is outside `HELPERS`. The new test's
  one-line assertion covers both calls.

## Acceptance criteria

- [ ] `src/tools/merge-gate.md` Phase 0 step 2 contains the exact literal
      `node <skill-root>/scripts/remote-tracker.mjs probe <<< '{"cwd":"<RUNTIME_STATE_ROOT>"}'`.
- [ ] The `Associated plan:` item of `src/tools/merge-gate.md` contains the exact literal
      `node <skill-root>/scripts/effective-flow-mechanics.mjs plan-reference-resolve <<< '{"cwd":"<root>","planDir":"<plan.dir>","reference":"<repo-relative path>"}'`,
      with `<root>` defined as the root `plan.dir` resolves against, which is the checkout root, or
      `RUNTIME_STATE_ROOT` in hidden mode.
- [ ] `src/tools/merge-gate.md` contains the exact `INLINE_BAN` sentence of
      `test/helper-call-shape-contract.test.mjs`.
- [ ] `test/merge-gate-helper-calls-contract.test.mjs` exists and asserts four things: - each literal sits whole on one source line; - every extracted helper span maps to an exported operation list that contains its
      operation, and both helpers occur; - the `plan-reference-resolve` payload parsed from the source resolves `ok: true`,
      `resolved`, `exact`; - the `probe` payload parsed from the source has exactly the key `cwd` and returns `ok: true`
      with zero runner calls under the offline harness.

      It fails against the pre-change `src/tools/merge-gate.md` and passes after the change.

- [ ] The updated `Associated plan:` pin in `test/workflow-contracts.test.mjs` still asserts the
      dispatch-timing clause, the full literal, the `resolved`/`data.exact` pass rule, the
      drop-on-failure rule and `"Entry" repeats it`.
- [ ] CI order passes: `pnpm agent:check`, `pnpm test` (including
      `test/helper-call-shape-contract.test.mjs` and the updated `test/workflow-contracts.test.mjs`),
      `node build.mjs` (contextBudget guard green), `pnpm test:distribution`.

## Validation plan

- Run the new contract test alone against the unmodified source first. It must fail on the
  missing literals, which shows it is the reproduction. It must pass after the edit.
- `node --test test/helper-call-shape-contract.test.mjs test/workflow-contracts.test.mjs` after
  the edit, to confirm the inline-ban host check and the updated pins.
- The full CI order from AGENTS.md: `pnpm agent:check`, `pnpm test`, `node build.mjs`,
  `pnpm test:distribution`.
- `pnpm eval merge-gate verify` (read-only). It is expected to report freshness debt, because
  `evals/merge-gate/suite.config.mjs:97` hashes `tools/merge-gate.md`. The debt is reported, not
  repaired in this change. Recording a round is manual and follows
  `docs/adr/pragmatic-test-release-policy.md`.

## Assumptions and open points

- Verified: neither literal exists anywhere under `src/`. `probe` has no required input key.
  `plan-reference-resolve` accepts exactly `cwd`, `planDir` and `reference` and rejects any other
  key. Both operation lists are exported. The existing `Associated plan:` pin in
  `test/workflow-contracts.test.mjs:5390-5393` matches the current sentence word for word.
- Assumption: the two literals plus the inline-ban sentence add roughly four to six built lines.
  They fit within the merge-gate `contextBudget` headroom or need only a small raise. The build report is authoritative (Approach step 5).
- Deliberately out of scope: spelling out the `AMBIGUOUS_HOST` retry. The helper reads `provider`
  or `remoteToolOverride` (`src/scripts/remote-tracker-core.mjs:1361`). A follow-up issue can add
  that literal, if wanted.
- Deliberately out of scope: other prose-only mentions of `plan-reference-resolve`
  (`src/shared/plan-numbering.md:73`, `src/tools/plan-review.md:101`) and prose call descriptions
  without a here-string (`src/shared/plan-reference-routing.md:9`). The issue covers merge-gate
  only.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    1 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    1 |
| Testability     |        0 |         1 |    8 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    4 |

### Findings

Gap analysis and internal review, 2026-11-27. Every finding is incorporated.

- Testability, Important: the `probe` payload check was skipped on the wrong premise that it
  would run a forge CLI. Incorporated: Approach step 3 now runs `probe` through the offline harness
  of `test/remote-tracker-operations-reference.test.mjs`.
- Testability, Note: the `plan-reference-resolve` check accepted any result other than
  `INVALID_INPUT`, and it could read a constant instead of the source. Incorporated: the payload
  is parsed from the source and must resolve `ok`, `resolved`, `exact`.
- Testability, Note: the extraction rule left unmapped helpers unspecified. Incorporated: the
  test fails on a helper the map lacks.
- Testability, Note: the rewrap concern assumed a formatter behaviour that `.oxfmtrc.json` does
  not set. Incorporated: the edge case is reworded and the test asserts one-line literals.
- Testability, Note: the key-set assertion repeated the exact-literal assertion, and a manual
  payload step repeated the test. Incorporated: both were folded into Approach step 3.
- Scope, Note: rewriting the only `Associated plan:` pin could weaken it unnoticed. Incorporated:
  a new acceptance criterion lists what the pin must keep.
- Error cases, Note: shared Phase 0 wording could stretch the `RUNTIME_STATE_ROOT` `cwd` rule to
  the mechanics call. Incorporated: the preamble stays remote-helper-only, and `<root>` is defined
  at its own literal.
- Maintainability, Note: a general call-form framing sentence would repeat
  `remote-helper-contract`. Incorporated: it is dropped, and the inline-ban sentence follows the
  `probe` literal.
- Maintainability, Note: the plan did not explain why the inline-ban sentence must be repeated.
  Incorporated: the reasoning now names every included copy and the per-source test rule.
- Maintainability, Note: the placement order inside step 2 was contradictory. Incorporated:
  Approach step 1 gives the explicit order.
- Maintainability, Note: restating the quote escape at the `Associated plan:` item would be a
  second copy. Incorporated: a back-reference to Phase 0 step 2 replaces it.

Deep plan review, 2026-11-27. Every finding is incorporated.

- Testability, Note: the `probe` payload check proved less than claimed, because remote
  operations accept any keys. Incorporated: it is now a smoke check, with an exact-keys
  assertion and the merged `repository` override named.
- Testability, Note: the literal's form and the extraction's argv shape were left open.
  Incorporated: the literal must be an inline span on its own line, and extraction accepts any
  argv.
- Testability, Note: the placeholder binding for `plan-reference-resolve` was underspecified, and
  the payload checks could pass vacuously. Incorporated: binding is by key, and each check fails
  when its span is missing.
- Security, Note: the quote edge case understated an unescaped `'`. Incorporated: the edge case
  states that the escape is mandatory and why.

## Open points

- No open points.
