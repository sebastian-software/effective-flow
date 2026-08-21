# Central skill consolidation

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Refactoring (`effective-flow refactor`)

## Requirement

Effective Flow references fifteen central skills that no longer exist. Upstream consolidated them
into five successors, so every declared owner except `effective-web` resolves to nothing. The
consequence is not a build failure — it is silent degradation: `src/shared/skill-discovery.md`
point 6 makes an unavailable authoritative skill fall back to the minimal generic checklist left in
each source. Every delegation site in the repository is running on that fallback today, which is
exactly the "reduced depth" path the layered ownership contract designed as an exception.

The goal is to point every reference at its live successor, and to collapse the ownership records
that a many-to-one consolidation would otherwise leave duplicated or contradictory. The rename is
the visible part; the structural part is that sixteen relationships become five, that seven consumers inherit a merged classification, and that one relationship disappears because its
successor is this repository itself.

Rationale for the `Refactoring` recommendation: the change alters no workflow logic, no artifact
contract, and no user-facing behavior of any tool. It renames declared collaborators and rewrites
the ownership records that describe them. The one observable effect — delegations resolving instead
of falling back — is the restoration the sweep exists for, not a new capability.

## Architecture decisions

### The mapping, and one correction to it

Fourteen of the fifteen successors were confirmed against the `references/route-*.md` files of the
installed skills. One entry was corrected during Phase 1 analysis:

| Retired skill              | Successor               | Evidence in the successor                                                                         |
| -------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| `codebase-improvement`     | `effective-delivery`    | `route-audit.md`, `audit-and-prioritization.md`, `complexity-lens.md`                             |
| `pr-review`                | `effective-delivery`    | `route-review.md`, `mode-c-contract.md`, `route-review-access.md`                                 |
| `smart-dependency-updater` | `effective-delivery`    | `route-dependencies.md`, `dependency-workflow.md`                                                 |
| `tech-docs`                | `effective-delivery`    | `route-docs.md`, `guides-and-readmes.md`, `code-documentation.md`, `interfaces-and-migrations.md` |
| `port-codebases`           | `effective-delivery`    | `route-porting.md`, `migration-contract.md`                                                       |
| `software-validation`      | `effective-delivery`    | `route-validation.md`, `command-discovery.md`, `execution-and-reporting.md`                       |
| `software-testing`         | `effective-engineering` | `route-testing.md`, `select-test-evidence.md`, `benchmark-methodology.md`                         |
| `software-architecture`    | `effective-engineering` | `route-architecture.md`, `architecture-foundations.md`                                            |
| `product-management`       | `effective-product`     | `route-strategy.md`, `route-scope-and-shipping.md`, `scope-and-prioritization.md`                 |
| `product-design`           | `effective-product`     | `route-design-research.md`, `route-design-modeling.md`, `structure-and-prototyping.md`            |
| `decision-records`         | `effective-product`     | `route-decisions.md`, `adr-format.md`, `product-decision-contract.md`                             |
| `metro-english`            | `effective-writing`     | `metro-english.md`, `route-metro-english.md`                                                      |
| `locale-typography`        | `effective-writing`     | `locale-matrix.md`, `locale-luxembourgish.md`                                                     |
| `web-legal-compliance`     | `effective-web`         | `route-compliance.md`, `legal-*.md` (EU, UK, US, CA)                                              |
| `effective-workflow`       | `effective-flow`        | this repository; see the orchestrator decision below                                              |

**The correction:** `software-validation` maps to `effective-delivery`, not to `effective-engineering`.
`effective-delivery/references/route-validation.md` carries that skill's contract verbatim —
discover commands from repository evidence, never substitute ecosystem habit, give every category an
explicit terminal state, report validation-generated files. `effective-engineering/SKILL.md:14`
names "running existing checks" in its _do not use for_ clause. Getting this wrong would point
`code-validator`, the repository's thinnest adapter, at a skill that declines the job.

### The manifest is merged, not renamed

`build-lib.mjs` rejects duplicate relationships, so six entries all named `effective-delivery`
would fail the build. The sixteen relationships collapse into five, each carrying the union of its
predecessors' consumers:

| Successor               | Consumers | of which `delegate` | of which `route-when-relevant` |
| ----------------------- | --------: | ------------------: | -----------------------------: |
| `effective-delivery`    |        22 |                  14 |                              8 |
| `effective-web`         |         8 |                   2 |                              6 |
| `effective-engineering` |         8 |                   1 |                              7 |
| `effective-writing`     |         6 |                   4 |                              2 |
| `effective-product`     |         5 |                   3 |                              2 |

### Strongest classification wins on merge

Seven consumers appear under two or more predecessors of the same successor with conflicting
classifications. Each conflict resolves to `delegate`; `concept-review` occupies two rows because
it collides under two separate predecessor pairs:

| Successor / consumer                    | Conflict                                                                |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `effective-delivery` / `docs`           | `tech-docs`=delegate vs `codebase-improvement`=route-when-relevant      |
| `effective-delivery` / `review`         | `pr-review`=delegate vs `codebase-improvement`=route-when-relevant      |
| `effective-delivery` / `refactor`       | `pr-review`=delegate vs `codebase-improvement`=route-when-relevant      |
| `effective-product` / `concept`         | `product-management`=delegate vs `product-design`=route-when-relevant   |
| `effective-product` / `concept-review`  | `product-management`=delegate vs `product-design`=route-when-relevant   |
| `effective-product` / `concept-review`  | `product-management`=delegate vs `decision-records`=route-when-relevant |
| `effective-writing` / `docs-writer`     | `locale-typography`=delegate vs `metro-english`=route-when-relevant     |
| `effective-writing` / `code-documenter` | `locale-typography`=delegate vs `metro-english`=route-when-relevant     |

The consequence is deliberate and worth stating plainly: `review` and `refactor` gain an
unconditional `effective-delivery` delegation where their audit-reasoning half was previously gated
on relevance. Nothing in the relevance gate suppressed it before — the gate governs specialist
owners, not the default audit owner — so this codifies what those tools already did.

### `effective-workflow` becomes a self-recursion guard

The successor is this repository, so the entry cannot remain a foreign-skill relationship. The
manifest entry and the table row are removed; `skill-discovery` stops being a declared consumer,
which no guard requires it to be. The rule itself survives, reworded from "never load the
alternative orchestrator" to "never load the `effective-flow` router recursively inside a running
tool". Recursion protection is still worth having; only its subject changed.

### `merge-gate` keeps its exclusion, on behavioral grounds

`merge-gate` forbids loading the central `pr-review` skill because that skill brings its own approve
and request-changes submissions, its own CI recovery, and its own summary conventions. After
consolidation the forbidden skill is `effective-delivery`, which thirteen sibling tools will recommend after the merge. The
exclusion stands, but its justification is rewritten to name the three behaviors rather than the
skill's old name. The cost is stated in the source: the gate forgoes the whole delivery skill, not
just its review half, and that is the accepted trade.

The name collision this whole section explains — the central skill `pr-review` versus the
deprecated local tool `/effective-flow pr-review` — dissolves with the rename. The passages in
`src/tools/pr-review.md`, `src/tools/merge-gate.md`, and `docs/developer-guide/skill-ownership.md`
that exist to warn about it become historically wrong, not merely stale, and are rewritten rather
than string-swapped.

### Ownership prose is rewritten, not swapped

The successors are broader than their predecessors. A cell reading "the skill owns
technical-documentation discovery, audience and task analysis, …" is accurate for `tech-docs` and
incomplete for `effective-delivery`, which also owns audits, PR judgment, dependency work, porting,
and validation. Every "Domain coverage" cell, every "declared domain owner" sentence, and every
frontmatter `description:` that names a retired skill is re-authored against the successor's actual
scope. Five merged coverage descriptions replace sixteen narrow ones.

### The three non-skill `pr-review` families stay untouched

Roughly two thirds of the raw `pr-review` matches are not the central skill: the deprecated tool
alias and its `DEPRECATED_TOOL_ALIASES` entry, the shared fragments `pr-review-integration` and
`pr-review-comments`, the handoff schema id `pr-review-handoff/v1`, the helper operations
`pr-reviews-read` and `pr-review-comment-build`, the HTML marker `<!-- effective-flow-pr-review -->`,
and the comment-kind enum value in `remote-tracker-core.mjs`. `docs/developer-guide/skill-ownership.md`
already warns that a blind sweep across these crosses a concept boundary. That warning is kept and
updated, not removed.

The schema id in particular must not move: `effective-delivery/references/mode-c-contract.md` emits
`"schema_version": "pr-review-handoff/v1"` unchanged, so `src/shared/pr-review-integration.md` and
`src/tools/iterate.md` keep consuming exactly what they consume today.

What stays fixed is the **name of the fragment and of the schema**, not the fragment's contents.
`src/shared/pr-review-integration.md` carries six references to the central skill itself — at lines
6, 86, 98 (a heading), 100, 115, and 128 — and every one of those is retargeted like any other
ownership prose. The file is in scope; only its filename, its include token, and the schema id are
out of it.

### `context7` is unified on `context7-mcp`

Three illustrative mentions write `context7`; the allowlist and the single real recommendation write
`context7-mcp`. All three sites say "skill", and the installed skill is `context7-mcp` — `context7`
is the name of an MCP server. Stellara exposes no Context7 tools, so there is no reason to prefer
the bare form. The three mentions move to `context7-mcp`.

## Affected files

| File                                                                                                                                                                   | Description                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/developer-guide/skill-ownership.json`                                                                                                                            | Collapse 16 relationships to 5 with merged consumer lists and merged classifications; drop the `effective-workflow` relationship; reduce `relevanceGateOwners` to `["effective-product","effective-web","effective-engineering"]`; refresh `provenance.lastReviewedAt` and `observedRevision`                                     |
| `src/shared/central-reasoning-delegation.md`                                                                                                                           | Rewrite the `skill-ownership:relevance-gate-owners` marker to the same three owners; rewrite the four owner bullets; retarget the `codebase-improvement` ownership sentences to `effective-delivery`                                                                                                                              |
| `docs/developer-guide/skill-ownership.md`                                                                                                                              | Rebuild the guarded table as 5 rows with merged coverage prose; add a `## Retired names` section carrying the fifteen-row mapping; rewrite "Deliberate boundaries"; remove the `effective-workflow` bullet; rewrite both `pr-review`/`merge-gate` bullets and the surviving-literals warning; update the fallback-chain paragraph |
| `build-lib.mjs`                                                                                                                                                        | Retarget the three `/\bdecision-records\b/i` regexes in `findStaleAdrContractClaims` to `effective-product`; update the adjacent comment                                                                                                                                                                                          |
| `build.mjs`                                                                                                                                                            | Update the #167 guard comment and its `ERROR: ADR ownership-contract guard` message string                                                                                                                                                                                                                                        |
| `test/build-lib.test.mjs`                                                                                                                                              | Adapter fixture map; the `software-validation`, `smart-dependency-updater`, and three `tech-docs` "declared domain owner" assertions; the `effective-workflow` orchestrator assertion; ~18 `decision-records` ADR fixtures; the `›`-chain fixtures                                                                                |
| `test/workflow-contracts.test.mjs`                                                                                                                                     | Three assertions: the `relationships.find(… === 'pr-review')` lookup (`:4278`), the merge-gate exclusion assertion, and the `src/tools/pr-review.md` wording test (`:4999-5015`), whose asserted phrases step 7 rewrites                                                                                                          |
| `src/tools/{plan,plan-review,plan-issue,review,refactor,docs,maintain,build,fix,concept,concept-review,apply-review,apply-issues,apply-review-remote,iterate,pr}.md`   | `## Recommended skills` entries; five of these collapse to fewer bullets                                                                                                                                                                                                                                                          |
| `src/agents/{code-validator,test-writer,e2e-tester,nodejs-reviewer,rust-reviewer,generic-product-reviewer,docs-writer,code-documenter,marketing-writer}.md`            | `## Recommended skills` entries; two collapse                                                                                                                                                                                                                                                                                     |
| `src/tools/{apply-review,maintain,docs,refactor,plan,plan-review,plan-issue,review,concept,concept-review,iterate,merge-gate,pr-review,apply-review-remote,setup}.md`  | Body prose: ownership sentences, delegation contracts, minimal-fallback sections, phase instructions                                                                                                                                                                                                                              |
| `src/shared/{audit-reasoning-delegation,adr-convention,dependency-version-policy,documentation-sync-contract,language-rules,skill-discovery,pr-review-integration}.md` | Ownership and fallback prose; `skill-discovery.md` additionally the recursion rule and the `context7-mcp` mention; `adr-convention.md` additionally loses lines 59-63 entirely; `audit-reasoning-delegation.md` needs a structural rewrite, not a substitution                                                                    |
| `src/agents/{code-validator,test-writer,e2e-tester,docs-writer,code-documenter,generic-product-reviewer}.md` and `src/tools/{apply-review,maintain}.md`                | Frontmatter `description:` strings that name a retired skill (rendered into `dist/`, user-visible)                                                                                                                                                                                                                                |
| `AGENTS.md`                                                                                                                                                            | The `locale-typography` typography paragraph, the `decision-records` ADR paragraph, both deep links, and the migration-glossary pointer, which is narrowed to name `skill-ownership.md` alone                                                                                                                                     |
| `docs/developer-guide/{build-system,configuration}.md`                                                                                                                 | The ADR-guard description (`build-system.md:186`) and the `decision-records` deep link (`configuration.md:243`). `architecture.md` is deliberately excluded: its only hit is the deprecated tool alias at line 149                                                                                                                |
| `docs/user-guide/{skill-discovery,tools-implement,tools-deliver,glossary}.md`                                                                                          | Skill examples (`skill-discovery.md:5`); the orchestrator paragraph (`:20`); the two `**Interplay:**` paragraphs (`tools-implement.md:169`, `:194`); the group-intro paragraph naming `software-validation` and `software-testing` (`tools-deliver.md:8`); the `context7` mentions                                                |
| `docs/adr/language-policy.md`                                                                                                                                          | Lines 61-62 delegate typography to `locale-typography`; a living ADR, so this is a decision update with its own rationale line, not a text swap                                                                                                                                                                                   |

Out of scope and deliberately untouched: `CHANGELOG.md` (historical release notes), `docs/plan/**`
(historical plans), `dist/` (generated), `.claude/worktrees/**` (stale copies), and every non-skill
`pr-review` literal listed above.

## Implementation details

### Approach

0. **Verify the planning baseline.** This plan was written against `9c87034` on 2026-08-21, with
   every in-scope path clean — no uncommitted changes under `src/`, `docs/developer-guide/`,
   `docs/adr/`, `AGENTS.md`, `build.mjs`, `build-lib.mjs`, or `test/`. Before starting, diff the
   in-scope files against that revision. The line numbers and counts throughout this plan are
   derived from it; if the ownership manifest, the relevance-gate marker, or any
   `## Recommended skills` section has moved since, re-derive the merge table before editing.
1. **Rewrite the manifest first.** Produce the five merged relationships with union consumer lists
   and strongest-wins classifications, drop `effective-workflow`, reduce `relevanceGateOwners`, and
   refresh `provenance`. The manifest is the contract every later step is checked against, so it
   leads rather than follows.
2. **Move the marker in the same commit.** `src/shared/central-reasoning-delegation.md` line 30 and
   `relevanceGateOwners` are reconciled bidirectionally by `build-lib.mjs`; splitting them across
   commits leaves the tree unbuildable in between. Update the four prose owner bullets directly
   below the marker at the same time — they are unguarded and would otherwise go stale silently.
3. **Rebuild the ownership table.** Sixteen rows become five between the `skill-ownership-table`
   markers, with re-authored coverage cells. Row membership is machine-reconciled exactly.
4. **Sweep the `## Recommended skills` sections.** Twenty-five files — sixteen tools and nine agents. Seven need real merging rather
   than substitution — see Edge cases. Every remaining bullet must resolve to a relationship whose consumer list names that file, or to an
   allowlist entry; nothing else passes the guard.

   **Steps 1 to 4 form one commit.** `assertSkillOwnershipContract` runs the recommendation-ownership
   loop (`build-lib.mjs:669-687`) after the manifest and table checks, so as soon as the manifest
   holds only the five successors, every bullet still naming a retired skill throws
   `Unowned recommended skill "…" for consumer "…"`. The same assertion runs inside `pnpm test` via
   `test/build-lib.test.mjs:511-524`. There is no intermediate state across these four steps in which
   the tree builds; splitting them produces a red commit, not a smaller one.

   Two test edits belong to that same commit, because step 1 breaks them the moment it lands:
   `test/workflow-contracts.test.mjs:4278`, whose `assert.ok(entry, …)` requires a `pr-review`
   relationship, and the checked-in fixtures at `test/build-lib.test.mjs:479-524`, which replay the
   full ownership guard against the real files at module scope.

5. **Retarget the ADR guard.** Change the three regexes in `findStaleAdrContractClaims`, the
   comment, and the `build.mjs` error string together, then the ~18 test fixtures. This step is
   ordered before the prose rewrite in step 6 on purpose, so the guard is watching the right name
   while `adr-convention.md` is edited.
6. **Rewrite the ownership prose.** Tools, shared fragments, and agent frontmatter. Re-author against
   the successors' actual scope; do not substitute names inside sentences that describe a narrower
   domain than the successor has.
7. **Rewrite the three dissolved-collision passages.** `src/tools/pr-review.md`, `src/tools/merge-gate.md`,
   and the `skill-ownership.md` boundary bullets. State the exclusion behaviorally and record that the name collision is historical. This step also
   invalidates `test/workflow-contracts.test.mjs:4999-5015`, which asserts the exact phrases
   "not the central `pr-review` skill" and "must not load it" against `src/tools/pr-review.md`;
   update that assertion together with the prose it guards.
8. **Delete the outdated-premise paragraph** at `src/shared/adr-convention.md:59-63`. It corrects a
   premise about a skill that no longer exists under that name, and nobody holds the premise any
   more. Deleting it is safer than rewriting it: the ADR guard's history and correction exemptions
   (`build-lib.mjs:2557-2559`) exist to clear exactly this paragraph, and with the paragraph gone
   there is nothing left to exempt. Confirm `node build.mjs` stays green afterwards.
9. **Update the documentation surfaces**, then `docs/adr/language-policy.md` last, as its own
   decision update.
10. **Run the full CI sequence** in the order CI runs it: `pnpm agent:check`, `pnpm test`,
    `node build.mjs`, `pnpm test:distribution`.

### Stop conditions

Stop and ask rather than improvising when any of these holds:

- A successor skill turns out not to cover a domain this plan assigns to it — the mapping is
  evidence-based but not authoritative, and a wrong owner silently degrades a delegation.
- The merge would give a consumer a classification that contradicts its own source. Strongest-wins
  is a rule for the manifest, not a licence to overrule a tool that documents itself as
  relevance-gated.
- A retired name is found in a file this plan does not list. The inventory claims completeness for
  `src/`, `docs/`, `AGENTS.md`, the two build files, and `test/`; a hit anywhere else means the
  audit boundary was wrong.
- Removing the `effective-workflow` relationship breaks a guard this plan did not anticipate.
- A non-skill `pr-review` literal appears to need renaming. It does not; the collision is
  documented and deliberate.

### Edge cases

- **`docs-writer` and `code-documenter` lose a distinct bullet.** Their three-line block is
  `tech-docs`, `metro-english › humanizer`, `locale-typography`. After the rename the flat third
  entry and the chain head are both `effective-writing`. Merge to two bullets —
  `effective-delivery` and `effective-writing › humanizer` — and state in the trailing prose that
  the `humanizer` fallback covers English prose rewriting only, never locale typography. Without
  that sentence the merge silently widens what the fallback claims to do.
- **`src/shared/audit-reasoning-delegation.md` loses its default-versus-specialist structure.** Line
  3 names the default audit owner; lines 32-36 list the "special branches" that route to _narrower_
  owners: `effective-web`, `software-architecture`, `port-codebases`, `smart-dependency-updater`,
  `decision-records`. After consolidation the default owner and two of those five branches are all
  `effective-delivery`, so the sentence would name one skill three times and the fragment's whole
  organizing idea dissolves. This needs a structural rewrite — the surviving distinct branches are
  `effective-web`, `effective-engineering`, and `effective-product` — not a substitution.
- **Five tools collapse to a single bullet.** `docs` (3→1), `refactor` (3→1), `review` (2→1),
  `maintain` (2→1); `concept-review` goes 3→2. A duplicated primary skill is not a build error, so
  nothing catches it — it has to be merged by hand.
- **`test-writer` and `e2e-tester` do not collapse**, but only because of the `software-validation`
  correction. Under the uncorrected mapping both would have listed `effective-engineering` twice.
- **The ADR guard fails silently if only prose moves.** `findStaleAdrContractClaims` gates every
  paragraph on `/\bdecision-records\b/i`. Rename the prose without the regexes and the guard inspects
  nothing, stays green, and stops protecting anything. Its own unit tests pass either way, because
  they feed it synthetic strings.
- **`test/workflow-contracts.test.mjs` fails loudly instead.** Its `assert.ok(entry, 'skill-ownership.json
must list a "pr-review" skill entry')` breaks the moment the manifest is rewritten. That is the
  desired signal; the test is updated to assert the same property about `effective-delivery`.
- **Table formatting.** Column one shrinks and the coverage cells are re-authored, so every row is
  re-padded. `pnpm agent:check` runs `oxfmt --check`, and the relevance-gate marker must stay on one
  line for its parser.
- **`skill-discovery` stops being a declared consumer** once `effective-workflow` is dropped. No
  guard requires a shared fragment to appear in the manifest, so this is expected, not a regression.
- **`AGENTS.md` points at `terminology.md` as the migration glossary**, which contains none of these
  names and is a German-to-English glossary. `terminology.md` is deliberately left alone: a skill
  rename is not a DE-to-EN terminology question, and giving that file two unrelated purposes is worse
  than fixing the pointer. The pointer is narrowed to `skill-ownership.md`, where the new
  `## Retired names` section makes the claim true.

## Acceptance criteria

- [ ] `node build.mjs` exits zero, with both the central-skill ownership guard (#168) and the ADR
      ownership-contract guard (#167) passing.
- [ ] `pnpm test` exits zero.
- [ ] `pnpm agent:check` exits zero.
- [ ] `pnpm test:distribution` exits zero.
- [ ] `docs/developer-guide/skill-ownership.json` contains exactly five relationships, named
      `effective-delivery`, `effective-engineering`, `effective-product`, `effective-web`,
      `effective-writing`, with consumer counts 22 / 8 / 5 / 8 / 6.
- [ ] `relevanceGateOwners` equals `["effective-product","effective-web","effective-engineering"]`
      and the marker in `src/shared/central-reasoning-delegation.md` carries the identical array.
- [ ] A case-insensitive search for the fifteen retired names across `src/`, `docs/user-guide/`,
      `docs/developer-guide/`, `docs/adr/`, `AGENTS.md`, `build.mjs`, `build-lib.mjs`, and `test/`
      returns only three documented exceptions: the non-skill `pr-review` literals, the
      `## Retired names` section of `docs/developer-guide/skill-ownership.md`, and the single
      historical mention in `docs/adr/language-policy.md` recording which retired skill the new
      delegation target replaced. Every other hit is zero.
- [ ] `src/shared/adr-convention.md` no longer contains the outdated-premise paragraph, and
      `node build.mjs` passes the ADR guard without it.
- [ ] `provenance.lastReviewedAt` carries the implementation date and `provenance.observedRevision`
      names the upstream revision the successors were verified against. This criterion was amended
      during implementation — see the implementation note in the plan review below.
- [ ] Each of the three upstream links either resolves as a deep link or points at the repository
      root; none still names a retired skill in its path.
- [ ] No `## Recommended skills` section lists the same primary skill in two bullets.
- [ ] `pnpm audit:skill-ownership -- ~/.claude/skills` reports an empty `declaredMissingFromInput`.
- [ ] `src/tools/merge-gate.md` still forbids loading `effective-delivery`, and its justification
      names the three excluded behaviors rather than a skill name.
- [ ] `pr-review-handoff/v1`, `pr-reviews-read`, `pr-review-comment-build`, `pr-review-integration`,
      `pr-review-comments`, `<!-- effective-flow-pr-review -->`, and `src/tools/pr-review.md` are
      unchanged in name.

## Validation plan

- The four repository commands above, in CI order, from the worktree root with absolute paths.
- `pnpm audit:skill-ownership -- ~/.claude/skills` as the external cross-check that the manifest now
  describes skills that actually exist. It is advisory and not in CI, so it is run manually once.
- A deliberate negative check on the ADR guard: temporarily reintroduce a stale divergence claim
  naming `effective-product` into one of the four scanned files and confirm `node build.mjs` fails.
  This is the only way to prove the guard is alive rather than merely quiet, given that its unit
  tests pass regardless. Revert immediately.
- A rendered-output spot check on `dist/` for one adapter per successor — `code-validator`
  (`effective-delivery`), `nodejs-reviewer` (`effective-engineering`), `docs-writer`
  (`effective-writing`) — confirming the frontmatter descriptions and ownership sentences read
  correctly after the transform.

## Assumptions and open points

- **Upstream deep-link paths are verified during implementation.** Three links point at
  `github.com/sebastian-software/skills.sebastian-software.com/tree/main/skills/<name>`. The
  installed skills carry no provenance metadata, so whether `.../skills/effective-writing` and
  `.../skills/effective-product` exist under those paths is unknown until checked. Decision: request
  each of the three successor paths once; keep the deep link where it resolves, and fall back to the
  repository-root link that `skill-ownership.md:3` already uses where it does not. Do not guess the
  layout either way.
- **`provenance` records what was actually verified.** Decision: refresh `lastReviewedAt` to the
  implementation date and **omit** `observedRevision`. The successors were verified against the
  local skill directory, not against an upstream revision, and claiming a revision nobody checked is
  worse than recording none. Omission is legal — `build-lib.mjs:325-341` guards both fields with
  `!== undefined`, so each is optional, while an empty or whitespace-only `observedRevision` is
  rejected. Blanking the field is therefore not an option; the key is removed.
- **`metro-english` versus `effective-delivery`'s own review voice — resolved.**
  `effective-delivery` ships `controlled-technical-german.md`, `simplified-technical-english.md`, and
  `review-voice.md`, which raised the question of whether the forge-prose consumers `iterate` and
  `pr` belong to it rather than to `effective-writing`. They do not: `effective-writing` ships
  `references/metro-english.md` and `references/route-metro-english.md` under those exact names, which
  is direct succession rather than an inference from the skill description. `effective-delivery`'s
  voice references govern its own delivery artifacts, not the forge prose these two tools produce.
- **The merged coverage prose is a judgment call**, written from the successors' `SKILL.md`
  descriptions and `references/route-*.md` inventories rather than from an upstream ownership
  statement. If upstream later publishes its own boundary documentation, these five cells are the
  first thing to reconcile against it.
- No behavioral claim is made about how `effective-delivery` performs the audit or review judgment
  compared to its predecessors. The plan restores resolution, not equivalence.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         4 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         2 |    0 |
| Testability     |        1 |         3 |    2 |
| Scope           |        0 |         3 |    2 |
| Maintainability |        0 |         2 |    3 |

### Findings

The first block records the internal review from `effective-flow plan`; the block headed
**Deep review** records the interactive pass that followed. `Approved` reflects that no critical
finding and no blocking open point remains after incorporation, not that none was raised.

- **Architecture, important — the merge is irreversible information loss.** Sixteen relationships
  carried sixteen distinct coverage statements; five will carry five. If upstream later splits a
  successor apart again, the per-domain consumer detail cannot be recovered from the manifest.
  Incorporated: the retired-to-successor mapping table with its evidence column is kept in this plan
  and mirrored into a `## Retired names` section in `docs/developer-guide/skill-ownership.md`, beside
  the table that shrinks from sixteen rows to five. Acceptance criterion 7 names that section as an
  explicit exception, alongside the `pr-review` literals.
- **Error cases, important — the silent ADR guard.** Renaming prose without the three regexes leaves
  a guard that inspects nothing and reports success. Incorporated as an ordered step (5 before 6)
  and as an explicit negative check in the validation plan.
- **Error cases, important — lockstep artifacts.** The relevance-gate marker and `relevanceGateOwners`
  are reconciled bidirectionally; touching one without the other makes the tree unbuildable.
  Incorporated as step 2 with an explicit no-split instruction.
- **Testability, important — one test fails by design.** `workflow-contracts.test.mjs:4278` asserts
  a `pr-review` relationship exists. This is the intended tripwire and is listed as an affected file,
  not worked around.
- **Scope, important — the living ADR.** `docs/adr/language-policy.md` is a decision record, not
  documentation. Incorporated: it is sequenced last, as its own decision update with a rationale
  line, rather than swept with the doc pass.
- **Maintainability, important — the plan was not drift-aware.** The `effective-delivery` plan
  contract requires recording the code state a plan was built on and how to detect invalidated
  assumptions. Incorporated as step 0: revision `9c87034`, planning date 2026-08-21, in-scope tree
  clean, with an instruction to re-derive the merge table if the manifest or the marker has moved.
- **Scope, important — no stop conditions were bounded.** A rename sweep invites improvisation at
  exactly the points where improvising is most expensive. Incorporated as a dedicated
  "Stop conditions" section naming five.
- **Architecture, note — `review` and `refactor` gain an unconditional delegation.** A direct
  consequence of strongest-wins. Documented in the architecture decision rather than hidden in the
  manifest diff.
- **Testability, note — `oxfmt` on the wide table.** Re-padding sixteen rows down to five will
  reflow the widest table in the repository; `pnpm agent:check` is in the acceptance criteria.
- **Scope, note — `context7-mcp`.** Adjacent to the fifteen renames rather than part of them, and
  included deliberately at the user's direction.
- **Maintainability, note — the `terminology.md` pointer.** `AGENTS.md` calls that file a migration
  glossary although it holds no skill mapping. The plan resolves this by making the claim true.

#### Deep review (2026-08-21)

- **Testability, critical — steps 1 to 4 are not incrementally committable.** The plan claimed step 3
  restored buildability. It does not: `assertSkillOwnershipContract` runs the recommendation-ownership
  loop (`build-lib.mjs:669-687`) after the manifest and table checks, so every bullet still naming a
  retired skill throws once the manifest holds only the successors. Incorporated: steps 1 to 4 are
  declared one commit, with the two manifest-dependent test edits inside it.
- **Architecture, important — `pr-review-integration.md` was both untouched and edited.** The
  architecture section listed the fragment among the untouched `pr-review` families while the
  affected-files table listed the file. Incorporated: the fragment _name_, its include token, and the
  schema id stay fixed; its six central-skill references at lines 6, 86, 98, 100, 115, and 128 are
  retargeted like any other ownership prose.
- **Architecture, important — the outdated-premise paragraph in `adr-convention.md`.** Renaming it
  makes it false; keeping the old name violates criterion 7. Decided: delete lines 59-63 outright, as
  step 8. The ADR guard's history and correction exemptions exist to clear that paragraph, so its
  removal leaves nothing to exempt.
- **Architecture, important — `audit-reasoning-delegation.md` loses its organizing structure.** Its
  default-owner-versus-special-branch split collapses when the default owner and two of the five
  branches become the same skill. Incorporated as an edge case demanding a structural rewrite.
- **Testability, important — the manifest-breaking test was unscheduled.**
  `workflow-contracts.test.mjs:4278` fails the moment step 1 lands, but no numbered step edited it.
  Incorporated into the one-commit block.
- **Testability, important — a third `pr-review` assertion was unaccounted for.**
  `workflow-contracts.test.mjs:4999-5015` asserts the exact wording that step 7 rewrites. Incorporated
  into step 7 and into the affected-files row.
- **Maintainability, important — the mapping table had no lawful home.** Mirroring it into
  `terminology.md` would have violated criterion 7 and fired stop condition 3. Decided: a
  `## Retired names` section in `skill-ownership.md`, named as an explicit exception in criterion 7.
- **Scope, important — `architecture.md` was listed but is out of scope.** Its only hit is the
  deprecated tool alias at line 149, which stop condition 5 forbids renaming. Incorporated: the file
  is removed from the affected-files row with the reason stated.
- **Scope, note — the `effective-delivery` consumer count.** "Seven sibling tools" was wrong;
  thirteen tool files will list it after the merge. Corrected.
- **Testability, note — `tools-deliver.md` had no described change.** Its real hit is the group-intro
  paragraph at line 8. Corrected in the affected-files row.
- **Maintainability, note — five counting and reference errors.** Seven conflicted consumers rather
  than eight (`concept-review` occupies two rows), six merging entries rather than five, twenty-five
  swept files rather than twenty-four, three `tech-docs` assertions rather than four, and
  `workflow-contracts.test.mjs:4278` rather than `:4126`. All corrected.
- **Maintainability, note — the `metro-english` open point is closed.** `effective-writing` ships
  `references/metro-english.md` and `references/route-metro-english.md`, which is direct succession
  rather than an inference from the skill description.
- **Maintainability, note — `provenance` mechanics.** Blanking `observedRevision` fails the parser;
  omitting it is legal because both fields are guarded with an undefined check at
  `build-lib.mjs:325-341`. Decided: refresh `lastReviewedAt`, omit `observedRevision`.

#### Implementation (2026-08-21)

Recorded at completion, so the archived plan documents where the run diverged from the artifact it
started from.

- **Two acceptance criteria were amended, not merely met.** Criterion 8 originally required
  `provenance.observedRevision` to be _absent_, on the stated premise that the successors could only
  be verified against the local skill directory. That premise turned out to be false: the upstream
  repository was reachable, its `skills/` directory holds exactly the five successors plus
  `effective-marketing`, and its HEAD is `591621a308319c393e224bab44403e64f6e8b091` (2026-08-17).
  The field now records that revision, because it is a verified fact rather than the claim the
  original decision was trying to avoid. Criterion 7 gained a third named exception: the historical
  mention in `docs/adr/language-policy.md`, which records which retired skill the new delegation
  target replaced — the same class of deliberate record as the `## Retired names` section.
- **The same upstream check resolved the deep-link open point.** Both
  `.../skills/effective-writing` and `.../skills/effective-product` exist, so all three links kept
  their deep form and the root-link fallback was not used.
- **One classification was tightened beyond the rename.** `src/shared/audit-reasoning-delegation.md`
  declared `route-when-relevant`; the merged manifest makes `review` and `refactor` `delegate` under
  strongest-wins, so the fragment now says `delegate`. This repairs a pre-existing inconsistency —
  the next sentence already called the guidance "authoritative, not optional advice" — but it is a
  behavior tightening the consolidation did not strictly require, and it is recorded here rather
  than left implicit in a manifest diff.
- **The review found one critical defect that a pure rename would have shipped.** The reworded
  self-recursion rule in `src/shared/skill-discovery.md` read "Never load the `effective-flow`
  router recursively inside a running tool" — but `{{SKILL:<tool>}}` renders to exactly that
  invocation, so the rule banned the product's own declared tool-to-tool delegation. It now binds
  the discovery act and exempts declared delegation. Four further findings of importance were fixed
  in the same pass: a fallback gate that excluded the primary skill from German output, an audit
  deflection that stopped binding once it pointed at the tool's own recommended skill, a second
  authoritative prose owner on `marketing-writer`, and a wrong locator for the successor's
  convention-discovery rule.
- **The line budget moved the wrong way.** The always-loaded core grew by twelve lines overall and
  `review` sits at 688 against a budget of 700. No tool breaks the budget, so this did not block
  completion; it is carried forward as finding `R-0000114`.
- **Four findings remain open**, all severity Note, in
  `.effective-flow/review/review-report-2026-08-21-plan-central-skill-consolidation.md`.

## Open points

- No open points.
