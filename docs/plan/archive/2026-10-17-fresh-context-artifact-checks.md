# Run the plan, concept and diagnosis checks in a fresh-context reviewer

**Plan status:** Implemented
**Source:** sebastian-software/effective-flow#475 (planning comment)
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

The planning, concept and investigation workflows judge their artifact checks in a fresh context,
not in the one that wrote the artifact, so that gaps are not read as filled. #564 already sent the
judgment of every written plan, plan-issue comment, plan-review, concept and concept-review artifact
to one read-only `deep` sub-agent. This plan closes what was still missing: the delegation mandate's
handoff rule for that spawn, the handoff contents, the return contract, a rule against silently
dropped findings, a durable record of an inline fallback or skipped judgment, and a refutation step
in `investigate`.

## Architecture decisions

- **Eager extension, lazy edge cases.** The "Judgment handoff" section of
  `src/shared/central-reasoning-delegation.md` grows by exactly 20 built lines (the cap), lazy
  pointer included. The rare fallback, skip and reduced-scope rules live in the new lazy fragment
  `src/shared/judgment-inline-fallback.md`.
- **No per-site edits.** The five judgment hosts keep their wording and reach the rules through the
  fragment's generic trigger.
- **Skip gate through open points.** A skipped judgment writes one implementation-blocking open
  point naming the re-entry invocation, so every existing host gate blocks release without a status
  rule change. The open point counts as deliberately deferred; only its replacement clears it.
- **Record lifetime.** A record stays until a later full judgment of the same step kind replaces it.
  A full judgment in a later run of the re-entry tool on that artifact replaces the records of every
  step kind; a different step kind in the same run never does. The fallback pointer also loads when
  an artifact already holds a `Record (` / `Vermerk (` line or a skip open point, so the re-entry run
  sees these rules.
- **Neutral record prefix.** Records start with `Record (<step>):` / `Vermerk (<Schritt>):`, not a
  severity word, and carry no contract label, review-result value, harness, model or session ID.
- **`ABORT` is terminal** for a judgment or skeptic spawn; the completion protocol stays unchanged
  and the `DONE` override is stated at the two spawn sites.
- **Investigate skeptic.** "Phase 3b: Independent challenge" starts one read-only `deep` skeptic at
  the new spawn site `investigate/skeptic` on every run with a hypothesis or conclusion. `refuted`
  or a skip folds the diagnosis to `unclear` / "further investigation needed" / `uncertain`, never
  `admitted` in this run.

## Affected files

- `src/shared/central-reasoning-delegation.md`: mandate reference, included and withheld handoff
  contents, untrusted-input rule, review-section labels, evidence and checked scope in the output
  contract, `DONE` override, terminal `ABORT`, no silent drop, fallback pointer.
- `src/shared/judgment-inline-fallback.md` (new): inline, skip and reduced-scope records (EN/DE),
  location, lifetime, no attribution.
- `src/shared/judgment-draft-snapshot.md`: quoted issue section without the canonical planning
  comment; the snapshot lives until the step's last attempt ends.
- `src/tools/investigate.md`: Phase 3b, Phase 4 folding, "Independent challenge" template section
  and its German label.
- `src/shared/model-tiers.md`: `investigate/skeptic` row (`deep`, never moves down).
- `build.mjs`: `CONTEXT_BUDGET_LINES` for plan (733), plan-issue (760), plan-review (490), concept
  (382), concept-review (386) and investigate (590).
- `test/delegation-mandate-contract.test.mjs`: four named tests for the central section, the
  fallback fragment, the snapshot and the investigate skeptic.
- `docs/developer-guide/architecture.md`, `docs/developer-guide/build-system.md`,
  `docs/adr/per-spawn-model-tiers.md`, `docs/user-guide/tools-understand.md`,
  `docs/user-guide/getting-started.md`.

## Implementation details

- The included and withheld lists sit in a paragraph after the three numbered handoff steps, so
  the #564 `step(n)` capture keeps working.
- The re-entry invocation is `effective-flow plan-issue <issue>` for a planning comment and
  `effective-flow review <artifact file>` otherwise; an investigation writes no open point because
  its admission rule replaces it.
- `src/shared/delegation-mandate.md`, `src/shared/completion-protocol.md`, the five host tools,
  `src/shared/plan-contract.md`, `src/shared/concept-contract.md` and
  `docs/developer-guide/skill-ownership.json` are unchanged.

## Acceptance criteria

The complete list is in the planning comment of #475; all of it is met.

- [x] The "Judgment handoff" section carries the mandate reference, the included and withheld
      contents, the untrusted-input rule, evidence and checked scope, the `DONE` override and the
      no-silent-drop rule, within +20 built lines, with steps 1–3 still contiguous.
- [x] The lazy fallback fragment defines the inline, skip and reduced-scope records per language,
      their location and lifetime, the blocking skip open point, and no attribution.
- [x] The issue-mode snapshot quotes the issue section without the canonical comment and lives
      until the step's last attempt ends.
- [x] `investigate` runs the `investigate/skeptic` step, folds its verdict in Phase 4 and reports it
      in "Independent challenge" / "Unabhängige Gegenprüfung".
- [x] Protected files are unchanged, the docs name the rules, the fragment and the spawn site, the
      named tests pass, and the CI order passes apart from one pre-existing environmental failure.

## Test results

- `pnpm agent:check`: passed.
- `pnpm test`: 2385 tests, 2383 passed, 1 skipped (deliberate), 1 failed. The failure,
  `test/next-steps-eval.test.mjs` "the shared seed commit disables inherited automatic Git
  maintenance before baseline capture", is environmental (Git cannot read the global ignore file in
  the sandbox) and fails identically on an `origin/develop` export.
- `node build.mjs`: passed; the built "Judgment handoff" section grows from 19 to 39 lines.
- `pnpm test:distribution`: passed.
- Mutation checks confirmed that the new tests fail when their invariant is removed.
- Eval evidence: the new `model-tiers.md` row makes the merge-gate and iterate suites stale; both
  owe a re-recorded round before the next release. next-steps stays current.

## Review findings

**Date:** 2026-10-17
**Reviewer:** Node.js reviewer (prompt sources, build, tests and docs), code validator

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    14 |
| Open / Not implemented |     0 |

## Open points

- No open points.
