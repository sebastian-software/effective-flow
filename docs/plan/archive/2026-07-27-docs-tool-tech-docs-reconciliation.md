# Reconcile the docs tool with the central tech-docs skill

**Plan status:** Implemented
**Source:** /effective-flow plan
**Recommended workflow:** Feature (`/effective-flow build`)

## Requirement

`/effective-flow docs` already declares `tech-docs` as its domain owner, but the reconciliation is
incomplete. Three classes of problem remain:

1. **Residual duplicates.** `src/tools/docs.md` and `src/agents/code-documenter.md` still restate
   craft rules that `tech-docs` owns verbatim, which is exactly what the layered ownership
   contract in `AGENTS.md` forbids.
2. **An unresolved boundary conflict.** `tech-docs` requires preserving an established repository
   information architecture and explicitly forbids imposing a mandatory docs hierarchy. Effective
   Flow's `Doc categories` prescribes four fixed `docs/` categories plus mandatory entry-point
   READMEs. The precedence between the two was never stated, so the tool can silently contradict
   its declared owner.
3. **A missing routing boundary.** `tech-docs` routes repository-wide documentation audits and gap
   prioritization to `codebase-improvement`. `/effective-flow docs` carries no such note and would
   run a repo-wide audit itself.

Goal: remove the duplicated craft guidance, state the precedence explicitly in favour of
repository evidence, and add the missing routing boundary — without weakening the sanctioned
minimal fallback for when `tech-docs` is unavailable.

The recommendation is **Feature** rather than Refactoring because the change is not
behavior-preserving: it introduces a new precedence rule for the documentation target structure and
a new route-when-relevant skill relationship. `/effective-flow refactor` guards against intended
behavior change and would block both.

### User decisions taken during planning

- **Information architecture precedence:** repository evidence wins. When `tech-docs` discovers an
  established, working documentation structure, that structure is the target; the four categories
  remain the default only for repositories without one.
- **Root `README.md`:** `marketing-writer` stays unchanged. No `tech-docs` relationship is added
  for it, and the root README keeps its copywriting-owned marketing role.
- **Repo-wide docs audits:** add the routing note to `codebase-improvement`.

## Architecture decisions

- **Effective Flow keeps orchestration, `tech-docs` keeps craft.** Every removal below deletes
  guidance about _how to write documentation_. Nothing is removed that concerns the write
  boundary, target-path approval, language resolution, worker selection, plan/report state,
  worktrees, commits, or delivery.
- **The minimal fallback absorbs what the removed rules protected.** Deleting "do not invent
  substantive statements" and "keep examples runnable" from the tool's `## Rules` would otherwise
  lose the safety net when `tech-docs` is absent. One short clause is added to the existing
  `## Delegation contract` fallback instead of keeping a second rule list. The fallback stays
  minimal by design — it must not grow into a documentation handbook.
- **The precedence rule lives in `src/shared/doc-categories.md`, not in the tool.** That include is
  consumed by `docs`, `docs-writer`, `marketing-writer`, and (lazily) `plan`, so a single statement
  keeps all consumers consistent. Placing it only in `docs.md` would leave the agents contradicting
  the tool.
- **The precedence rule has two mandatory knock-on adjustments.** The conditional follow-up-link
  rule and the documentation plan-header contract both hard-code the four-category paths. If only
  the precedence sentence is added, a repository with a divergent established structure produces an
  unsatisfiable link invariant and an unwritable `**Doc category:**` value. Both are adjusted in
  the same change, reusing the existing root-`README.md` omission mechanism rather than inventing a
  second one.
- **The "established structure" judgment stays with `tech-docs`.** Effective Flow defines no local
  threshold for when a repository counts as having an established documentation structure — that is
  information-architecture judgment, and re-acquiring it would rebuild the duplication this change
  removes. Whatever the owner's repository discovery reports is authoritative. The safeguard against
  a false positive is procedural, not a heuristic: the divergent structure must be named in the doc
  plan and approved by the user before implementation, and the write boundary still applies.
- **`codebase-improvement` is declared as a recommended skill plus a manifest relationship.** This
  repository declares a `route-when-relevant` owner as a `## Recommended skills` entry in its
  consumer whenever the owner is not one of the five `relevanceGateOwners`: `codebase-improvement`
  is route-when-relevant for `review`, `refactor`, `plan`, `plan-issue`, `plan-review`, and
  `generic-product-reviewer` and is listed in all six, and `port-codebases` is listed in `refactor`.
  Only the five gate owners (`product-management`, `product-design`, `effective-web`,
  `software-architecture`, `web-legal-compliance`) are declared through the
  `<!-- skill-ownership:relevance-gate-owners … -->` marker in `central-reasoning-delegation.md`
  instead — an include the docs tool does not consume. What keeps the skill out of an ordinary
  scoped documentation change is therefore not its absence from the list but the scoping prose in
  the routing note plus the skill-discovery relevance gate, which loads only skills that clearly fit
  the concrete task.
- **Verification design and verification execution are separated explicitly.** `tech-docs` owns
  what evidence is required; `software-validation` (via `code-validator`) owns executing established
  repository checks. Today Phase 3 lets both run without stating the split, which risks either
  double execution or a silent gap.
- **`marketing-writer`, `docs-writer`, and the four category values stay untouched.** No renaming,
  no new configuration key, no new agent.

## Affected files

| File                                        | Description                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/tools/docs.md`                         | Remove the two duplicated craft rules from `## Rules`; extend the `## Delegation contract` minimal fallback by one clause; state the verification design/execution split in Phase 3; add `codebase-improvement` to `## Recommended skills` plus a scoped routing note; make the plan-gate doc-category requirement conditional |
| `src/shared/doc-categories.md`              | Add the IA precedence rule; adjust the conditional follow-up-link rule and the plan-header contract for a divergent established structure                                                                                                                                                                                      |
| `src/agents/code-documenter.md`             | Remove the duplicated in-code craft rule under `## Effective Flow constraints`                                                                                                                                                                                                                                                 |
| `src/tools/plan.md`                         | Make the `Doc target` scorecard criterion defer to `Doc categories` for its sanctioned category omissions                                                                                                                                                                                                                      |
| `docs/developer-guide/skill-ownership.json` | Add `docs` as a `codebase-improvement` consumer with classification `route-when-relevant`                                                                                                                                                                                                                                      |
| `docs/developer-guide/skill-ownership.md`   | Update the `codebase-improvement` row's consumer cell; extend the `tech-docs` row and the "Deliberate boundaries" bullet with the precedence rule                                                                                                                                                                              |
| `docs/user-guide/tools-implement.md`        | `/effective-flow docs` input/output section: the four categories are the default, an established repository structure takes precedence                                                                                                                                                                                         |
| `docs/developer-guide/plan-conventions.md`  | Note the sanctioned `**Doc category:**` omission for a divergent established structure                                                                                                                                                                                                                                         |
| `test/build-lib.test.mjs`                   | Extend the existing duplicate-handbook contract test with the docs tool, the code-documenter rule removal, and the `doc-categories` precedence assertion                                                                                                                                                                       |

## Implementation details

### Approach

1. **`src/tools/docs.md` — remove duplicates.** Delete from `## Rules`:
   - "Do not invent substantive statements. If something is not verifiable, mark it as an
     assumption or ask." — owned by the `tech-docs` operating rule on deriving facts from code and
     tests and treating uncertain behavior as a question.
   - "Keep examples runnable and in sync with the code." — owned by the `tech-docs` operating rule
     on examples plus its `examples-and-verification` reference.

   Keep the three Effective Flow rules: no product-logic change, the documentation-adjacent code
   exception, and the per-phase status update.

2. **`src/tools/docs.md` — strengthen the minimal fallback.** In the existing fallback paragraph of
   `## Delegation contract`, add one clause covering both removals: unverifiable behavior is asked
   about or marked as an assumption rather than documented, and examples stay consistent with the
   implementation. Keep it to a single sentence.
3. **`src/tools/docs.md` — verification split.** In Phase 3, state that the `tech-docs` owner
   designs the verification and reports the evidence, while `code-validator` executes established
   repository checks; neither re-runs the other's work, and a check that neither can run is reported
   as an evidence gap.
4. **`src/tools/docs.md` — audit routing.** Add `codebase-improvement` to `## Recommended skills`
   below `tech-docs`, and add a short prose note (Phase 1 or the delegation contract) that a
   repository-wide documentation audit, gap inventory, or prioritization request routes to
   `codebase-improvement` — or to `/effective-flow review` when the user wants the Effective Flow
   report artifact — and returns here for the selected documentation work. The note must state
   explicitly that a single scoped documentation change is not an audit and must not trigger this
   route; that scoping sentence, not the absence of a list entry, is what keeps the skill out of
   ordinary runs.
5. **`src/shared/doc-categories.md` — precedence.** Under "Prescribed standard doc structure", state
   that when the documentation owner's repository discovery finds an established, working
   documentation structure, that structure is the target and the prescribed standard structure does
   not override it. The four categories remain the default for repositories without an established
   structure. Effective Flow keeps the write boundary, the target-path approval, and the collision
   clarification in either case. State explicitly that Effective Flow defines no local test for
   "established" — the owner's discovery decides — and that a divergent structure is named in the
   doc plan and approved by the user before implementation.
6. **`src/shared/doc-categories.md` — follow-up-link rule.** Extend the conditional rule so its
   targets are the entry points of the _effective_ structure: the two category READMEs when the
   prescribed structure applies, otherwise the established structure's user-facing and technical
   entry points. The invariant itself is unchanged — only existing targets are linked, in
   user-facing then technical order, never a placeholder or broken link, and every missing target is
   reported individually as an open point.
7. **`src/shared/doc-categories.md` — plan headers.** Extend the existing "Special case marketing
   entry point" into a general sanctioned-omission rule: the `**Doku-Kategorie:**` /
   `**Doc category:**` line is omitted when the target lies outside the four categories — the root
   `README.md`, an explicitly named existing file, in-code documentation, or a divergent established
   structure. The target-path line is always present and names the concrete path. When a category
   line _is_ present, the existing consistency rules stay unchanged.

   In the same step, align the consumer side in `src/tools/docs.md`: its plan-gate bullet currently
   reads "if both lines are missing or inconsistent: ask the user for the category and target path".
   Reword it so the target-path line is always required, the category line is required only when the
   target lies inside the four categories, and the tool asks only when a genuinely required line is
   missing or a present category contradicts its target path. Without this, the tool would keep
   asking for a category the shared contract has just declared optional.

8. **`src/agents/code-documenter.md`.** Remove "Prefer self-documenting code and avoid redundant
   narration." from `## Effective Flow constraints`; it duplicates the `tech-docs`
   `code-documentation` reference. The existing `## Minimal fallback` already covers the absent-skill
   case and needs no addition.
9. **`src/tools/plan.md`.** Reword the `Doc target` scorecard row so it requires the target-path
   field plus a category field _unless `Doc categories` sanctions its omission_, keeping the
   category/path consistency requirement for the case where the category is present.
10. **Ownership manifest and guide.** Add `{ "consumer": "docs", "classification":
"route-when-relevant" }` to the `codebase-improvement` relationship in
    `skill-ownership.json`. Update the guide's `codebase-improvement` consumer cell to include
    `docs`, and record the IA precedence in the `tech-docs` row's coverage cell and in the
    "`tech-docs` and the documentation workers" bullet under "Deliberate boundaries". Do not touch
    the `<!-- skill-ownership-table:start -->` markers or the row set.
11. **User and developer documentation.** Update `docs/user-guide/tools-implement.md` so the
    `/effective-flow docs` output description presents the four categories as the default and names
    the established-structure precedence. Add the sanctioned category omission to
    `docs/developer-guide/plan-conventions.md`.
12. **Tests.** Extend the existing `central-skill adapters retain Effective Flow ownership without
duplicate handbooks` test in `test/build-lib.test.mjs`: assert that `tools/docs.md` still names
    `tech-docs` as declared domain owner and carries the minimal fallback, that neither removed
    sentence is present in `tools/docs.md`, that the removed sentence is absent from
    `agents/code-documenter.md`, and that `shared/doc-categories.md` contains the precedence
    statement. Anchor the negative assertions next to a positive assertion on the delegation
    sentence so a wholesale rewrite of the section cannot pass silently. Write the test edit
    **before** the source edits and record the failing run, so the new assertions are demonstrably
    not vacuous.
13. **Verify.** Run the CI sequence from `AGENTS.md`: `pnpm agent:check`, `pnpm test`,
    `node build.mjs`, `pnpm test:distribution`.

### Component structure

Not relevant — no code modules are added or restructured; the change is to Markdown instruction
sources, the ownership contract data, documentation, and one test file.

### State management

Not relevant.

### API integration

Not relevant.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **`tech-docs` unavailable** (not installed, `skills.enabled: false`, or excluded): the tool must
  still refuse to state unverifiable behavior and must still keep examples consistent with the
  implementation. Covered by the extended minimal-fallback clause, which is the only place that
  guidance survives.
- **`tech-docs` unavailable and the repository has a divergent structure:** without the owner's
  discovery there is no reliable established-structure signal. The prescribed standard structure
  applies as the default, and the divergence is surfaced to the user as an open point rather than
  guessed at.
- **Divergent established structure and the root README:** the marketing entry point stays the root
  `README.md` in every case. Only the follow-up-link _targets_ change, and only to entry points
  that actually exist.
- **Repository with no documentation at all** (scaffold mode): no established structure exists, so
  the prescribed standard structure applies unchanged. Scaffold mode is unaffected.
- **A plan file written before this change** carries a four-category `**Doc category:**` line. It
  stays valid; the omission is permitted, never required.
- **Repo-wide audit request that also names one concrete document:** the concrete change is done
  here; only the audit/prioritization portion routes out. The routing note must say this explicitly
  so a normal scoped change does not pull in `codebase-improvement`.
- **Build ownership guard:** adding `codebase-improvement` to the docs tool's `## Recommended
skills` without the manifest entry fails the build with "Unowned recommendation". The source edit
  and the manifest edit must land together. The guard validates recommendation tokens against the
  manifest and not the reverse, so the guide row set stays machine-reconciled and unchanged — only
  the consumer cell text is updated.
- **Established structure reported, but the target lies outside it:** the write boundary still
  applies. A file outside both the effective structure and the sanctioned exceptions must be named
  in the plan's `Affected files` table before it may be written.

## Acceptance criteria

- [ ] `src/tools/docs.md` contains neither "Do not invent substantive statements" nor "Keep examples
      runnable and in sync with the code", and still contains the three Effective Flow rules (no
      product-logic change, documentation-adjacent code exception, per-phase status update).
- [ ] The `## Delegation contract` fallback in `src/tools/docs.md` covers unverifiable statements
      and example consistency in at most one added sentence.
- [ ] `src/tools/docs.md` Phase 3 states that `tech-docs` designs the verification and
      `code-validator` executes established repository checks, and that an unrunnable check is
      reported as an evidence gap.
- [ ] `src/tools/docs.md` lists `codebase-improvement` under `## Recommended skills` below
      `tech-docs` and carries a routing note that scopes it to repository-wide documentation audits
      and prioritization, stating explicitly that a single scoped change is not an audit.
- [ ] The plan-gate bullet in `src/tools/docs.md` requires the target-path line unconditionally and
      the doc-category line only for targets inside the four categories, and asks only when a
      required line is missing or a present category contradicts its target path.
- [ ] `src/shared/doc-categories.md` states that an established repository documentation structure
      discovered by the documentation owner takes precedence over the prescribed standard structure,
      that the four categories are the default for repositories without one, and that Effective Flow
      defines no local test for "established" — the owner's discovery decides and the user approves
      the divergent structure through the doc plan.
- [ ] The conditional follow-up-link rule in `src/shared/doc-categories.md` resolves its targets
      from the effective structure, and its "only existing targets, no placeholder or broken link,
      missing targets reported individually" invariant is unchanged.
- [ ] The plan-header section in `src/shared/doc-categories.md` permits omitting the doc-category
      line for the root `README.md`, an explicitly named existing file, in-code documentation, and a
      divergent established structure, while always requiring the target-path line.
- [ ] `src/agents/code-documenter.md` no longer contains "Prefer self-documenting code and avoid
      redundant narration."
- [ ] The `Doc target` row in the `src/tools/plan.md` scorecard defers to `Doc categories` for
      sanctioned category omissions.
- [ ] `docs/developer-guide/skill-ownership.json` lists `docs` as a `route-when-relevant` consumer
      of `codebase-improvement`, and the guide's `codebase-improvement` row names `docs`.
- [ ] `docs/developer-guide/skill-ownership.md` records the IA precedence in the `tech-docs` row and
      in the "Deliberate boundaries" bullet.
- [ ] `docs/user-guide/tools-implement.md` and `docs/developer-guide/plan-conventions.md` describe
      the categories as the default plus the sanctioned omission.
- [ ] The extended test in `test/build-lib.test.mjs` asserts every removal and the precedence
      statement. It was written before the source edits, and the resulting failing run is recorded
      in the plan's test-results section at completion.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` all pass.

## Validation plan

- `pnpm agent:check` — formatting (oxfmt, no writes).
- `pnpm test` — the `node:test` suite including the extended duplicate-handbook contract test.
- `node build.mjs` — build guards: the central-skill ownership guard (manifest ↔ guide row set ↔
  recommendation tokens ↔ relevance-gate owners), include resolution, and the version-drift guard.
- `pnpm test:distribution` — isolated build/archive/delivery/install smoke suite.
- Targeted `grep` over `src/tools/docs.md`, `src/agents/code-documenter.md`, and
  `src/shared/doc-categories.md` to confirm each removal and each addition, as the acceptance
  criteria state them.
- Red-then-green ordering: apply the `test/build-lib.test.mjs` edit first and run `pnpm test` to
  capture the failing assertions, then apply the source edits and re-run. Record both runs in the
  plan's test-results section so the new assertions are provably not vacuous.

## Assumptions and open points

- Verified from the repository: the current wording of `src/tools/docs.md`, `src/shared/doc-categories.md`,
  the three documentation agents, `docs/developer-guide/skill-ownership.json` and its guide table,
  the ownership guard in `build.mjs` / `build-lib.mjs`, the existing duplicate-handbook test at
  `test/build-lib.test.mjs`, and the CI command sequence in `AGENTS.md`.
- Verified from the skills repository at `/Users/bs5/Developer/skills.sebastian-software.com`: the
  `tech-docs` `SKILL.md` workflow, operating rules, and routing boundaries, plus its
  `guides-and-readmes`, `code-documentation`, and `examples-and-verification` references.
- Assumption: `tech-docs` remains installed in target environments in the common case; the fallback
  path is the exception. This matches the existing delegation contract and is not newly introduced
  here.
- Assumption: no downstream consumer parses the removed sentences. They appear only in the two
  source files named above.
- Verified: `src/shared/plan-contract.md` only maps the bilingual `**Doc category:**` /
  `**Doku-Kategorie:**` labels and states no presence requirement, so the sanctioned omission needs
  no change there. `docs/user-guide/tools-implement.md` and
  `docs/developer-guide/plan-conventions.md` are the only documents outside `docs/plan/` that
  describe the four categories as absolute.
- Verified: `assertSkillOwnershipContract` in `build-lib.mjs` checks recommendation tokens against
  the manifest and reconciles the guide's row set, but never requires a manifest consumer to appear
  in a recommendation chain — `pr-review` is already a declared `docs` consumer with no
  recommendation entry. The direction that does fail is a recommendation token without a manifest
  relationship, so the `src/tools/docs.md` and `skill-ownership.json` edits must land together.
- Verified: every `route-when-relevant` owner outside the five `relevanceGateOwners` is declared as
  a `## Recommended skills` entry in its consumer (`codebase-improvement` in `review`, `refactor`,
  `plan`, `plan-issue`, `plan-review`, `generic-product-reviewer`; `port-codebases` in `refactor`).
  The docs tool follows that pattern rather than the marker form, which belongs to
  `central-reasoning-delegation.md` — an include the docs tool does not consume.
- Deliberately out of scope per the user's decision: `src/agents/marketing-writer.md` and any
  `tech-docs` relationship for the root `README.md`. If a root README later carries install or
  quick-start commands whose correctness matters, that is a separate change.
- Deliberately out of scope: `src/agents/docs-writer.md`, which was reviewed and found already free
  of duplicated craft guidance.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         2 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         2 |    0 |
| Testability     |        0 |         1 |    1 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    1 |

### Findings

- **Architecture, Important — incorporated.** A precedence sentence added to `doc-categories`
  alone would break two contracts that hard-code the four-category paths: the conditional
  follow-up-link invariant (whose targets would not exist) and the documentation plan header (whose
  `**Doc category:**` value has no valid form for a divergent structure). Both adjustments are now
  mandatory steps 6 and 7 and are covered by acceptance criteria, and the header case reuses the
  existing root-`README.md` omission mechanism instead of a second one.
- **Error cases, Important — incorporated.** Removing the two craft rules from `## Rules` without
  compensation would silently weaken behavior whenever `tech-docs` is unavailable. Step 2 adds a
  single-sentence clause to the sanctioned minimal fallback, and the edge-case list names the
  fallback path explicitly.
- **Architecture, Important — decided by the user (deep review).** The precedence rule did not say
  who decides that a repository structure is "established", so an agent could have treated any
  stray `docs/` file as one. Resolved in favour of deferring entirely to the `tech-docs` owner's
  repository discovery, with no local threshold in Effective Flow; the safeguard is the doc-plan
  approval gate, not a heuristic. Recorded as an architecture decision and an acceptance criterion.
  The rejected alternatives were a local objective threshold — which would rebuild the very
  information-architecture judgment this change delegates — and asking on every divergence, which
  would prompt on nearly every run in a real repository.
- **Architecture, Critical — resolved in the second review round.** The first deep-review round
  moved `codebase-improvement` out of `## Recommended skills` on the claim that this repository
  never declares a route-when-relevant owner as a recommendation entry. That claim is false, and the
  architecture decision plus one acceptance criterion rested on it. Verified against
  `docs/developer-guide/skill-ownership.json` and the sources: `codebase-improvement` is
  route-when-relevant for `review`, `refactor`, `plan`, `plan-issue`, `plan-review`, and
  `generic-product-reviewer` and is listed under `## Recommended skills` in all six;
  `port-codebases` is likewise listed in `refactor`. Only the five `relevanceGateOwners` use the
  marker form. The plan now follows the actual pattern: `codebase-improvement` is a recommendation
  entry plus a manifest relationship, and the scoping prose in the routing note — not a missing list
  entry — is what keeps it out of ordinary scoped documentation changes.
- **Error cases, Important — incorporated (deep review).** The sanctioned doc-category omission was
  specified only on the writer side. The docs tool's plan gate would still have demanded a category
  the shared contract had just made optional. Step 7 now also rewords that gate: the target-path
  line is unconditional, the category line is required only inside the four categories.
- **Testability, Important — incorporated (deep review).** "Fails when run against the unmodified
  sources" is not checkable after implementation. Replaced by an ordering requirement: the test edit
  lands first, its failing run is captured, and both runs are recorded in the plan's test-results
  section at completion.
- **Testability, Note.** The new assertions are partly negative greps, which pass trivially if the
  surrounding section is rewritten or renamed. Mitigated by anchoring them beside a positive
  assertion on the delegation sentence, plus the red-then-green ordering above.
- **Scope, Note.** The `src/tools/plan.md` scorecard edit is adjacent rather than central. It is
  kept because the sanctioned omission introduced in step 7 would otherwise be reported as a
  scorecard failure by `/effective-flow plan` for exactly the plans this change makes legal. It is
  limited to one table row.
- **Maintainability, Note.** The extended minimal fallback must stay one sentence. The whole point
  of the change is that Effective Flow carries no second documentation handbook; a fallback that
  grows re-creates the duplication being removed. The acceptance criterion bounds it explicitly.

## Open points

- No open points.

## Test results

Run in the delivery worktree on branch `effective-flow/build/docs-tool-tech-docs-reconciliation`.

| Check                    | Result                                                         |
| ------------------------ | -------------------------------------------------------------- |
| `pnpm agent:check`       | passed — all 251 files correctly formatted                     |
| `pnpm test`              | passed — 363 tests, 0 failures                                 |
| `node build.mjs`         | passed — all build guards, including the skill-ownership guard |
| `pnpm test:distribution` | passed — offline distribution checks                           |

Red-then-green evidence for the new contract assertions, as the validation plan required: the
extension of `central-skill adapters retain Effective Flow ownership without duplicate handbooks`
in `test/build-lib.test.mjs` was applied **before** the source edits and failed against the
unmodified sources (`AssertionError: The input was expected to not match the regular expression
/Do not invent substantive statements/`). After the source edits the same assertions pass. The new
assertions are therefore not vacuous.

One assertion was corrected during the run: a first draft matched the literal phrase
`established documentation structure`, which the final prose renders as "established, **working**
documentation structure". It was replaced by the two substantive rules the section must state —
`takes precedence over the prescribed standard structure` and `local test for what counts as` —
rather than bending the prose to fit a phrase guessed before it was written.

The `node build.mjs` guard confirms the `codebase-improvement` recommendation entry in
`src/tools/docs.md` is now covered by its manifest relationship; without the manifest edit it would
fail with "Unowned recommendation".

## Review findings

**Date:** 2026-07-27
**Reviewer:** Tooling bucket — technical validation plus an inline diff review against the
acceptance criteria; no product reviewer applies to a tooling-only change, and no subagents were
delegated in this session by standing instruction.

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     3 |
| Open / Not implemented |     1 |

The three fixed findings were all the same class: sites that still hard-coded the four-category
assumption and would have rejected exactly the writes the new precedence rule authorizes — the
Phase 3 write-path check and the Phase 1 route/target steps in `src/tools/docs.md`, and the
authoritative write boundary in `src/shared/doc-categories.md`. The plan had anticipated two such
knock-on sites; the review found three more, all inside files already in scope.

One reviewer note required no action: the single-row edit to the `Doc target` scorecard row in
`src/tools/plan.md` produces a ten-line diff because oxfmt realigns the table's column widths.

**External review report:** `.effective-flow/review/review-report-2026-07-27-plan-docs-tool-tech-docs-reconciliation.md`
