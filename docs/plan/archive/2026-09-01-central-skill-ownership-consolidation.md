# Central-skill ownership consolidation

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Refactoring (`effective-flow refactor`)

## Planning baseline and drift

Planned at `3b44300` (`develop`), 2026-09-01. The in-scope files were clean in the main checkout at
planning time.

**This plan must not start before pull requests #386, #387 and #388 have merged.** That stack was
open while this plan was written, and six of the files below are in both sets:

| File                                   | Why it drifts                                               |
| -------------------------------------- | ----------------------------------------------------------- |
| `build.mjs`                            | #386 and #387 both add guards and edit the leak-guard regex |
| `build-lib.mjs`                        | #387 adds the stale-brand detector                          |
| `test/build-lib.test.mjs`              | #387 adds detector and scope tests                          |
| `test/workflow-contracts.test.mjs`     | #386 rewrites the router-description test; #388 adds three  |
| `AGENTS.md`                            | #386 and #387 extend the placeholder table                  |
| `docs/developer-guide/build-system.md` | #386, #387 and #388 extend the placeholder and guard lists  |

Before executing, re-read the guard-hook line anchors named under "Implementation details": #387
already inserted a guard block above the `#168` section, so every line number recorded here will
have moved. The anchors identify **which** construct to attach to, not where it sits. Stop and
revise this plan if the merged `#168` block no longer matches the structure described below.

## Requirement

The layered ownership contract says an Effective Flow source carries **no second copy** of a
playbook a central skill owns. Three consumers violate it, and the build cannot see any of them.

`rust-implementer` (131 lines) and `nodejs-implementer` (120 lines) carry full domain playbooks and
declare **no** `## Recommended skills` section at all. Their reviewer counterparts —
`rust-reviewer` (75) and `nodejs-reviewer` (73) — were migrated to the layered contract and do
recommend `effective-engineering`. The review half of each language moved; the implementation half
did not. `generic-implementer` likewise declares nothing.

`effective-marketing` has **no** declared relationship anywhere in
`docs/developer-guide/skill-ownership.json`, while `marketing-writer` produces the repository's only
marketing surface and routes to three allowlisted third-party skills instead.

Neither gap is an oversight that review would catch reliably, because the ownership guard is
**entirely recommendation-driven**: `collectRecommendedSkillChains` iterates
`matchAll(/^## Recommended skills$/gm)` over each source, and a source with no such heading yields
an empty iterator, pushes no chain, and creates no obligation. There is no `else` and no post-loop
check that a source produced at least one chain. Absence of a recommendation is absence of an
obligation.

The goal is to close both content gaps where the evidence supports it, and to convert the ownership
check from a manual convention into two build guards, so this class of drift fails the build
instead of waiting for a review.

## Architecture decisions

- **Rust and Node are treated asymmetrically, on evidence rather than symmetry.** A coverage audit
  against the current `effective-engineering` checkout establishes that the two languages are not
  in the same position, so identical treatment would be wrong in one of them.
- **Rust delegates its domain depth, under the same route-reachability rule as Node.** Six of ten
  audited topics are fully covered and materially deeper than the agent — ownership and borrowing
  (including a five-question `clone` diagnosis), `unsafe` (a seven-point safety-proof checklist
  plus FFI-as-protocol), visibility and crate-DAG structure, trait and conversion design,
  public-API semver surface, and Cargo/workspace/MSRV discovery. Logging, security and database
  access reach the route through `rust-architecture-and-boundaries.md` and the Data route, and
  toolchain commands through `rust-quality-and-review.md`, so those are delegated too. **CLI
  contracts are the one exception and stay in the agent:** `cli-contracts.md` is reachable only
  from `route-testing.md`, which `route-rust.md` cross-links solely for test placement, public-API
  coverage, doctests and smoke evidence — grepping the Rust route family for `exit code`, `stderr`
  and `--help` returns nothing. Cutting it would break the very rule the Node decision below
  rests on.
- **Node retention is decided by route reachability, not by topic or section.** The rule: material
  stays in the agent when a reader of `route-typescript.md` cannot reach it — even when the skill
  covers it somewhere else. `route-typescript.md` declares its own scope as "server-side,
  shared-library, and general TypeScript", a language-contract route. HTTP routing, status codes and
  middleware, worker threads, child processes, `EventEmitter`, rate limiting, security headers, and
  TypeScript-side database access have zero or near-zero presence in the skill at all. Config,
  request logging and `SIGTERM`/`SIGINT` shutdown do exist, but only in
  `operability-and-twelve-factor.md` behind the _architecture_ route, and `cli-contracts.md` sits
  behind the _testing_ route framed as test seams — a TypeScript-route reader reaches none of them,
  so all of it is retained.

  Reachability was chosen over the two alternatives because it is the only one that yields a
  **re-testable** rule. "Delegate whole sections" would leave covered material (promise ownership,
  module and export design) duplicated; "split by topic" would be most faithful to today's evidence
  but would produce half-sections whose boundary nobody can reconstruct later. Reachability reduces
  the future re-test to one question — is this reachable from `route-typescript.md` now? — which is
  exactly the cheap re-check the retention rationale is supposed to enable.

  Under this rule `## Error handling` is delegated (typed failure, `cause`, boundary translation are
  on the route), and the remaining Node sections are retained.

- **Named crate defaults survive only as minimal fallback.** `effective-engineering` names no
  crates on purpose — `anyhow`, `tokio`, `async-std`, `clap`, and `diesel` appear nowhere in it,
  because `route-rust.md` routes crate selection to `effective-delivery` and the skill instructs
  discovery of the repository's established choice. Keeping the names in the fallback preserves an
  answer for a greenfield module while letting the skill's discovery-first policy win whenever it
  is present. This is exactly the layered contract, not an exception to it.
- **`effective-marketing` is declared as `delegate` for positioning copy, and the README split is
  made explicit.** Its copy craft is strong and would upgrade the agent — per-artifact guidance for
  homepage, product, pricing and campaign surfaces, plus revision and proof references. But it
  treats **no README as an artifact** and its Routing Boundaries are silent on READMEs; the split
  is declared unilaterally by `effective-delivery`, twice and identically: "A root README may
  contain technical onboarding owned here and product positioning owned there." The agent records
  that split rather than pretending a single owner exists.
- **The three allowlisted copy skills stay as an ordered fallback.** `effective-marketing` becomes
  the preferred owner; `copywriting`, `copy-editing` and `marketing-psychology` remain reachable
  behind it, so a project without the central skill does not lose the craft.
- **Guard (a) covers `src/agents/*.md` only, not tools.** `src/shared/skill-discovery.md` states
  today that "If no such section exists (e.g. for tools), this point does not apply" — the runtime
  contract deliberately contemplates a tool without a recommendation. Extending the guard to tools
  would make that sentence false and would need an exemption for every tool with no domain owner
  (`version`, `cleanup`, and others). Agents are also where the defect actually is: every consumer
  that carries a domain playbook is an agent. The guard is scoped to the roster that needs it, and
  the existing runtime sentence stays correct.
- **`generic-implementer` recommends `effective-delivery`.** Its tooling-only scope leans on
  repository-native command discovery, validation, and repository conventions, all of which that
  skill owns. The skill's "Do not use for designing or writing system code or browser experiences"
  boundary aims at product code and browser work, not at CI, build, and repository metadata, so this
  is not a case of recommending a skill against its own disclaimer. The alternative — exempting the
  role from guard (a) as `merge-conflict-resolver` is — would take the disclaimer literally at the
  cost of leaving a write-capable role with no domain owner at all.
- **Guard (a) is roster-driven with an explicit exemption set**, mirroring
  `NEXT_STEPS_EXEMPT_TOOLS`: derivation stated in a block comment, one reason comment per entry,
  and a stale-exemption check. `merge-conflict-resolver` is the only expected member — it already
  carries the exemption rationale in prose ("This role declares **no** recommended central skill:
  resolving a merge conflict has no declared central domain owner").
- **Guard (b) covers tool and agent consumers only.** The manifest also lists shared-fragment
  consumers (`language-rules`, `dependency-version-policy`, `documentation-sync-contract`,
  `worktree-integration`), but `recommendationSources` enumerates only `tools` and `agents` while
  `knownOwnershipConsumers` also includes `shared`. Those fragments express ownership as prose and
  can never produce a recommendation chain, so the reverse check exempts them **by kind**, with the
  asymmetry named in a comment rather than left as a silent hole.
- **`test-writer.md` is the structural template.** It is the closest match — a write-capable worker
  with a multi-owner routing paragraph, a minimal fallback, a constraints block, and the explicit
  "Do not keep a second testing handbook here" sentence. `ui-implementer.md` is the precedent for
  what a write-capable adapter legitimately retains: file-length rules and the package-manager rule
  stay Effective Flow content.
- **The `pnpm exec` over `npx` rule is retained, not delegated.** `typescript-tooling-and-config.md`
  says "stay package-manager agnostic; detect the package manager from the lockfile", which
  contradicts the house rule. Cutting it would be a behavior change disguised as delegation.

## Affected files

| File                                        | Description                                                                                                                                                                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/agents/rust-implementer.md`            | Add `## Recommended skills` (`effective-engineering`); replace the ten domain sections with a delegation paragraph and a minimal fallback that retains the crate defaults; keep file-length, comments, approach, dependency policy, pre-commit and commit includes |
| `src/agents/nodejs-implementer.md`          | Add `## Recommended skills` (`effective-engineering`); delegate the language layer (types, modules/exports, async and promise ownership, typed errors); retain the Node-runtime sections with a recorded reason; keep the package-manager rule                     |
| `src/agents/generic-implementer.md`         | Add `## Recommended skills` (`effective-delivery`) — it owns repository-native command discovery, which this tooling-only role depends on                                                                                                                          |
| `src/agents/generic-product-implementer.md` | Extend `## Recommended skills` with `effective-delivery` beside the existing `context7-mcp`                                                                                                                                                                        |
| `src/agents/marketing-writer.md`            | Prefer `effective-marketing`, keep the three copy skills as an ordered fallback, and state the README split explicitly                                                                                                                                             |
| `docs/developer-guide/skill-ownership.json` | Add the `effective-marketing` relationship; add `rust-implementer`, `nodejs-implementer`, `generic-implementer`, `generic-product-implementer` as consumers of their owners                                                                                        |
| `docs/developer-guide/skill-ownership.md`   | Add the `effective-marketing` row; update the affected rows and the "Deliberate boundaries" prose, including the README split and the Node partial-delegation rationale                                                                                            |
| `build-lib.mjs`                             | Extend `assertSkillOwnershipContract` with the reverse check; add the roster check as a pure function beside it                                                                                                                                                    |
| `build.mjs`                                 | Wire both guards into the `#168` block; add the exemption set with its stale-exemption check                                                                                                                                                                       |
| `test/build-lib.test.mjs`                   | Synthetic and checked-in tests for both guards; add both implementers to the adapter-shape map at the existing `central-skill adapters retain Effective Flow ownership` test                                                                                       |
| `AGENTS.md`                                 | Record that the ownership check is now build-enforced rather than a manual convention                                                                                                                                                                              |
| `docs/developer-guide/build-system.md`      | Document both new guards in the guards list                                                                                                                                                                                                                        |
| `docs/user-guide/language-support.md`       | Verify it does not read stale once the implementer sections change                                                                                                                                                                                                 |

## Implementation details

### Approach

1. **Guards first, red.** Implement guard (a) and guard (b) and confirm they fail on the real
   defect before any content is fixed. Guard (a) is red immediately, on the three agents without a
   section. Guard (b) **cannot** be red on the unmodified pre-change tree: it is a reverse check
   over declared relationships, every pre-change relationship already had a recommender, and
   `effective-marketing` has no relationship to check yet. It goes red one step later, in the
   intermediate state that step 3 produces — the relationship declared, `marketing-writer` not yet
   preferring it — which is the same real defect. Landing the guards before the content proves
   they detect it rather than only a synthetic case; record both failures verbatim.
2. **Add the missing `## Recommended skills` sections** to the four agents, placed _before_ the
   `skill-discovery` include, since the fragment's point 1 reads "listed further above". Guard (a)
   goes green.
3. **Declare `effective-marketing`** in the manifest and the Markdown table, and add the new
   consumers for the implementers. Guard (b) goes green.
4. **Thin `rust-implementer`**, following the `test-writer` shape: delegation paragraph, minimal
   fallback carrying the crate defaults in a few lines, retained Effective Flow sections, and a
   "Do not keep a second Rust handbook here" sentence.
5. **Partially thin `nodejs-implementer`**: delegate the language layer, retain the Node-runtime
   sections under a heading that states why they are here — because the audited route does not
   cover them — so a future reader can re-test that reason instead of guessing.
6. **Update `marketing-writer`** with the ordered fallback and the README split.
7. **Extend the adapter-shape test** with both implementers, and add negative greps pinning that
   the cut material stays cut.
8. **Reconcile the documentation** — ownership guide, `AGENTS.md`, build-system guards list — and
   check `language-support.md` for staleness.

### Guard hook points

Line numbers are the planning-time positions at `3b44300` and will have moved after the in-flight
stack merges; the named construct is the anchor, not the number.

| Construct                                             | Planning-time location              | Role in this change                             |
| ----------------------------------------------------- | ----------------------------------- | ----------------------------------------------- |
| `// --- Central-skill ownership guard (#168) ---`     | `build.mjs:493`                     | the block both guards join                      |
| `recommendationSources` (enumerates `tools`+`agents`) | `build.mjs:509-520`                 | source of the agent roster for guard (a)        |
| `knownOwnershipConsumers` (adds `shared`)             | `build.mjs:522-528`                 | the asymmetry guard (b) must exempt by kind     |
| `assertSkillOwnershipContract` call site              | `build.mjs:533-541`                 | where both new checks are invoked               |
| `collectRecommendedSkillChains`                       | `build-lib.mjs:530-578`             | the `matchAll` loop that makes absence silent   |
| `assertSkillOwnershipContract` (4 checks)             | `build-lib.mjs:607-687`             | guard (b) is a fifth block after the last check |
| `NEXT_STEPS_EXEMPT_TOOLS`                             | `build.mjs:189-204`                 | the exemption-set idiom to mirror               |
| stale-exemption check                                 | `build.mjs:461-469`                 | the stale-check idiom to mirror                 |
| `central-skill adapters retain Effective Flow…` test  | `test/build-lib.test.mjs:1840-1856` | the adapter map both implementers join          |
| `assertSyntheticSkillOwnershipContract` helper        | `test/build-lib.test.mjs:305-322`   | synthetic-test helper for both guards           |

### Stop conditions

- **Stop if the coverage claim no longer holds.** This plan rests on an audit of
  `effective-engineering` at `f79397b`. If the installed skill differs materially — in particular if
  `route-typescript.md` has gained Node-runtime coverage, or if the Rust route has lost any of the
  six fully-covered topics — re-run the audit before cutting anything.
- **Stop before cutting a section that has no owner.** If a section marked for deletion turns out to
  have no coverage in the skill and no retention rationale, it is a third case this plan did not
  anticipate: report it rather than deleting or silently keeping it.
- **Stop if guard (b) cannot exempt shared fragments cleanly.** If the exemption cannot be expressed
  by consumer kind, the reverse guard is not implementable as designed; report instead of widening
  `recommendationSources` to `shared`, which is a larger change with its own consequences.
- **Stop if the guards cannot be shown red.** Step 1 requires both guards to fail on the real
  defect before the content fix — guard (a) on the unmodified tree, guard (b) in the intermediate
  state described there. A guard that is never red before the fix is not detecting the real defect,
  and the rest of the plan rests on it.
- **Stop on a failing baseline.** If the CI sequence is already failing before any edit, results
  cannot be attributed to this work.

### Edge cases

- **A retained section must not look like an oversight.** The Node-runtime sections need an
  explicit in-source reason, or the next ownership audit will flag them as the very duplication
  this plan claims to remove.
- **Guard (b) must not fire on shared-fragment consumers**, which cannot produce a chain by
  construction. Exempting them by kind is required for the guard to be implementable at all.
- **Guard (a) needs a vacuity guard.** A roster check that silently iterates an empty agent list
  passes for the wrong reason; the neighbouring tests already use `assert.ok(sources.length > 0)`
  for this.
- **The exemption set must be two-sided**, as `NEXT_STEPS_EXEMPT_TOOLS` is: an exempt agent must
  _not_ carry a section, and a non-exempt one must. A one-sided check lets an exemption go stale.
- **`effective-marketing` must not end up in both** `relationships` and
  `externalRecommendationAllowlist`; the parser already rejects that, and the three copy skills stay
  allowlisted.
- **A fallback chain `A › B` is ordered**, so `effective-marketing › copywriting` takes the first
  available member, never both. The existing chain-token validation covers the syntax.
- **Cutting a section that a caller depends on.** Verified not to occur: every caller references
  these agents by name and supplies scope, not method. The one genuine dependency is the
  package-manager rule, which is retained.

## Acceptance criteria

- [ ] `node build.mjs` fails on an agent that carries no `## Recommended skills` section and is not
      in the exemption set, naming the file and the exemption mechanism
- [ ] `node build.mjs` fails on a stale exemption entry naming an agent that does not exist
- [ ] `node build.mjs` fails on a manifest relationship whose tool or agent consumers never
      recommend it, and does **not** fire on a shared-fragment-only consumer
- [ ] Every `src/agents/*.md` either carries `## Recommended skills` or appears in the exemption set
      with a one-line reason; `merge-conflict-resolver` is the only exemption
- [ ] `effective-marketing` has a relationship in `skill-ownership.json` and a row in the
      `skill-ownership.md` table; `marketing-writer` prefers it with the three copy skills as an
      ordered fallback
- [ ] `rust-implementer` carries no Cargo, ownership, trait, concurrency, `unsafe`, database,
      logging, security or toolchain playbook section; the crate defaults appear only inside its
      minimal fallback. `### CLI tools` is **retained**, with its route-reachability reason in the
      source: `cli-contracts.md` hangs off the skill's testing route, which `route-rust.md`
      cross-links only for test placement, public-API coverage, doctests and smoke evidence, so
      exit codes, stream separation and `--help` are unreachable from the Rust route — the same
      rule that retains `### CLI tools` in `nodejs-implementer`
- [ ] `nodejs-implementer` delegates `## Error handling`, retains every section not reachable from
      `route-typescript.md`, and states the route-reachability rule in-source as the retention
      reason — so the next reviewer re-tests the rule rather than re-deriving the boundary
- [ ] Guard (a) enumerates `src/agents/*.md` only; `src/shared/skill-discovery.md`'s sentence that
      a missing section does not apply to tools is still accurate after the change
- [ ] `test/build-lib.test.mjs` lists both implementers in the adapter-shape map and asserts, per
      agent, the owner skill, a `## Minimal fallback`, an Effective-Flow-retains block, and a
      negative grep for the removed material
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution` all pass
- [ ] Both new guards are documented in the `build-system.md` guards list, and `AGENTS.md` records
      that the ownership check is build-enforced

## Validation plan

Every command runs from the repository root of the execution checkout, with absolute paths.

| Purpose               | Command                                                                                                                                     | Expected result                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Formatting            | `pnpm agent:check`                                                                                                                          | exit 0, "All matched files use the correct format."                                          |
| Unit and contract     | `pnpm test`                                                                                                                                 | exit 0, no failures; count rises by the new guard tests                                      |
| Build and guards      | `node build.mjs`                                                                                                                            | exit 0, 20 tools + 16 agents in all three targets                                            |
| Distribution          | `pnpm test:distribution`                                                                                                                    | exit 0, "distribution-smoke: offline checks passed"                                          |
| Guard (a) fires       | remove a `## Recommended skills` section, then `node build.mjs`                                                                             | exit 1, names the file and the exemption set                                                 |
| Guard (a) stale check | add a nonexistent agent to the exemption set, then `node build.mjs`                                                                         | exit 1, names the missing source                                                             |
| Guard (a) two-sided   | add an exempt agent's section back, then `node build.mjs`                                                                                   | exit 1, an exempt agent must carry none                                                      |
| Guard (a) bulletless  | strip the bullet from a section, keeping the heading, then `node build.mjs`                                                                 | exit 1, a section that names no skill, reported as its own state                             |
| Guard (b) fires       | keep the manifest relationship, remove `effective-marketing` from the `marketing-writer` chain, then `node build.mjs`                       | exit 1, `Unrecommended delegate consumer "marketing-writer" for skill "effective-marketing"` |
| Guard (b) exemption   | unchanged tree with shared-fragment consumers present                                                                                       | exit 0 — no false positive on `language-rules` and its three siblings                        |
| Guard (b) sibling     | replace `effective-engineering` in the `rust-implementer` chain while `test-writer` and `nodejs-implementer` keep it, then `node build.mjs` | exit 1, the delegate consumer is named even though the relationship still has a recommender  |

Per-step verification: steps 1–3 of the approach end with `node build.mjs` (red for step 1, green
after steps 2 and 3); steps 4–7 end with `pnpm test`; step 8 ends with the full sequence.

Beyond the table:

- **Prove the guards were red before the content fix.** Record step 1's failure output in the
  completion report. A guard first seen green proves nothing.
- Use `cp` snapshots for every adversarial edit and restore from the copy — never `git checkout --`,
  which discards uncommitted work.
- Confirm the thinned agents render into all three targets and that the `#168` guard still
  reconciles the full checked-in manifest.
- Diff the rendered agent sidecars against a build of the parent commit; the only deltas should be
  the intended sections.

## Assumptions and open points

- Assumption: the coverage audit reflects the pinned checkout at
  `/Users/bs5/.dalo/sources/sebastian/checkout` (`f79397b`). Upstream may add a Node-runtime route
  later, at which point the retained sections become re-delegatable — which is why the retention
  reason is recorded in-source rather than left implicit.
- Assumption: `evals/evals.json` in each skill is producer-side metadata, not a consumer contract.
  It is usable as an acceptance oracle for spot-checking coverage but creates no obligation here.
- Deliberately out of scope: the Node-runtime coverage gap as an upstream request to the skills
  repository; the `M-1`…`M-6` fragment migrations from the architecture review; and the two guard
  scope boundaries recorded as `R-0000120` and `R-0000121`.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    1 |
| Testability     |        0 |         1 |    1 |
| Scope           |        1 |         3 |    0 |
| Maintainability |        0 |         0 |    2 |

Every finding below marked "(incorporated)" or "(decided)" — including the Critical one — was
resolved in this plan before it was reported complete. None is outstanding, and no open point
blocks implementation.

### Findings

The first four were raised by applying `effective-delivery`'s implementation-plan contract to the
first draft. The next three were raised by the deep interactive review and resolved by explicit
decision. All seven are incorporated; the remainder are accepted trade-offs.

- **Scope, Important (decided) — the Node retention boundary was under-specified.** "Retain the
  Node-runtime sections" did not survive contact with the agent's actual section list:
  `## Error handling` is covered by the skill, `## CLI tools` only through a reference behind the
  _testing_ route, and config, logging and shutdown only behind the _architecture_ route. Resolved
  by adopting **route reachability** as the rule, chosen over whole-section and per-topic
  alternatives because it is the only one that leaves a re-testable question behind.
- **Scope, Important (decided) — guard (a) roster.** Extending the guard to tools would have
  contradicted `skill-discovery.md`'s existing sentence about tools without a section, and would
  have required exemptions for tools that legitimately have no domain owner. Scoped to agents,
  which is also where every offending consumer actually is.
- **Architecture, Note (decided) — `generic-implementer`'s owner.** Recommending `effective-delivery`
  to a write-capable role sits near that skill's "do not use for writing system code" boundary.
  Resolved: the boundary targets product code and browser work, not CI, build and repository
  metadata. The alternative of exempting the role was rejected because it would leave a
  write-capable role with no domain owner.

- **Scope, Critical (incorporated) — the plan collided with work in flight.** The draft recorded no
  planning baseline, while pull requests #386, #387 and #388 were open against six of its affected
  files, two of which they restructure. Executing against the pre-merge tree would have produced
  conflicts in `build.mjs` and both test files. A "Planning baseline and drift" section now records
  the HEAD, the overlap table, and a hard precondition that the stack merges first.
- **Testability, Important (incorporated) — steps had no paired verification.** The draft listed the
  CI sequence but not what each step proves. The validation plan is now a command/expected-result
  table, with the per-step mapping stated and both guards' red and green states named explicitly.
- **Error cases, Important (incorporated) — no stop conditions.** The draft described edge cases but
  never said when to abandon the plan. Five stop conditions now cover a changed coverage claim, an
  unowned section, an unimplementable exemption, a guard that will not go red, and a failing
  baseline.
- **Maintainability, Note (incorporated) — hook points were named without anchors.** The draft named
  files but not constructs, leaving the executor to rediscover the guard's internals. A hook-point
  table now records both, with the explicit caveat that the line numbers move once the stack merges
  and that the construct is the anchor.
- **Architecture, Important — the asymmetry is the plan's main risk and its main claim.** Treating
  Rust and Node differently is correct on the evidence, but it leaves the repository with one fully
  delegated and one partially delegated implementer, which reads as inconsistency to anyone who has
  not seen the audit. Mitigated by recording the reason in the source and in the ownership guide,
  so the asymmetry is a documented decision rather than an apparent oversight. Accepted.
- **Scope, Important — guards and content in one change.** The plan deliberately lands the guards
  first and red, which is what proves they detect the real defect. The alternative, content first,
  would leave the guards unable to demonstrate they ever caught anything. Accepted, with the
  red-state evidence required in the completion report.
- **Error cases, Note** — the reverse guard's exemption-by-kind for shared fragments is a real
  asymmetry in the existing code (`recommendationSources` covers two directories,
  `knownOwnershipConsumers` three). The plan names it rather than resolving it; widening
  `recommendationSources` to `shared` would be a larger change with its own consequences.
- **Testability, Note** — the adapter-shape test uses a hard-coded map, so adding the two
  implementers is a deliberate edit. That matches the existing idiom and is preferable to a
  roster-derived version that would silently accept a new fat agent.
- **Maintainability, Note** — the retained Node sections create a standing obligation to re-test
  the coverage claim when the central skill changes. The in-source reason is what makes that
  re-test cheap.

## Open points

- No open points.
