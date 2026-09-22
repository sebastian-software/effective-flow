# Native profile rendering

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

**Planned against:** merged work-package-1 commit `7d1dcd5` from PR #456 on 2026-09-22.
**Working state:** The current checkout predates the merge. Preserve the untracked `docs/concept/`
tree and the four untracked sibling work-package plans under `docs/plan/`.
**Depends on:** implemented and merged
`docs/plan/archive/2026-09-21-execution-profile-and-activation-contract.md` (PR #456).

## Requirement

Make Fast intent enforceable in native Codex and Claude Code output while preserving every existing
registered worker as the Quality default. Codex must use a per-spawn model and reasoning override;
Claude Code must use generated Fast implementer sidecars. Portable output remains correct and
Quality-only. Concrete mappings stay centralized and never enter project configuration or workflow
prose.

## Architecture decisions

- Reuse the repository's economical native tier as the pilot mapping: Claude `sonnet`/`medium` and
  Codex `gpt-5.6-luna`/`medium`. Existing implementers remain Claude `opus`/`xhigh` and Codex
  `gpt-5.6-sol`/`high` for Quality. These values match the current role metadata but remain
  replaceable build-owned mappings rather than project configuration or durable ADR content.
- Consume the merged work-package-1 contract through its existing
  `parseExecutionProfileContract`/`assertExecutionProfileContract` seam and closed vocabularies.
  Do not duplicate the Quality/Fast policy, gate reasons, or `profile-unavailable` semantics in a
  renderer-specific parser. The work-package-1 assertion must still run before rendering and the
  atomic output swap.
- Keep one centralized, total route classification in `build.mjs`, validated against the already
  parsed `projectRoutes`: every canonical row is exactly
  `fast-capable`, `quality-only-implementation`, or `non-implementation`. The Fast-capable IDs are
  exactly `tooling`, `frontend-js-ts`, `node-backend-cli`, `rust`, and `generic-product`;
  `documentation` is Quality-only; `excluded-generated-vendored` and `ambiguous` are
  non-implementation. Resolve worker names from the validated routing table rather than duplicating
  a worker-name list. Reject missing, extra, or duplicate classifications, a Fast-capable route
  that no longer resolves to exactly one implementation worker, and every routing-table change
  until its new row is explicitly classified. Route identity remains owned by
  `PROJECT_ROUTING_REQUIRED_ROUTES`, `parseProjectRoutingTable`, and
  `assertProjectRoutingContract`; the new table classifies those verified routes rather than
  redefining them.
- Add a provider-neutral source token `{{AGENT_PROFILE:<agent>:fast}}`. Source validation rejects an
  unknown agent or every profile other than `fast`; existing Quality references continue to use
  `{{AGENT:<agent>}}`. Extend the existing `validateRefs`, `transformRefs`, `renderBody`, and
  `refConfig` seams. Render the token byte-exactly as follows: Claude renders
  `` `effective-flow-<agent>-fast` ``; Codex renders
  `` `effective-flow-<agent>` with `model: "<fast-model>"` and `reasoning_effort: "<fast-effort>"` ``;
  portable renders
  `` `effective-flow-<agent>` (Fast unavailable: select Quality with `profile-unavailable`) ``.
  A portable body containing only an `AGENT_PROFILE` token must still receive the existing portable
  worker-delegation bootstrap before the token is transformed.
- Authorize the token by source context as well as syntax: only `src/tools/build.md` and
  `src/tools/refactor.md` may contain a Fast profile token, and contract tests pin it to the initial
  implementation phase. Any agent, shared fragment, or other tool using it fails the build. This
  work package leaves both authorized workflow sources token-free; synthetic renderer fixtures
  exercise all targets, and a repository build proves that no rendered workflow references Fast
  before work packages 4 and 5 adopt it.
- Generate exactly five Claude Fast sidecars from the base contracts. Copy body, tools, color, and
  leaf boundary; change name, description, model, and effort only. Do not create handwritten Fast
  agent sources or Codex Fast TOML files. Derive each Fast description by appending the exact suffix
  ` Fast-profile variant; use only for the first eligible implementation attempt.` to the cleaned
  base description, and test that derivation.
- Require nonempty native model and effort metadata for all registered base workers while this
  surface is being strengthened. Missing/malformed mapping, unsupported effort, incomplete eligible
  set, collision, or portable mapping fails before the atomic swap.
- Generate `dist/<harness>/effective-flow/native-agent-inventory.json` from the same centralized
  mapping for `claude` and `codex`. Schema version is the integer `1`; reject every other version.
  The exact JSON keys are `schemaVersion`, `harness`, sorted unique `baseWorkers`, and sorted unique
  `fastWorkers`. Entries are rendered filename stems including the `effective-flow-` prefix and
  excluding extensions. Claude lists the exact five Fast stems, Codex has an empty Fast array, and
  both base arrays are identical. Canonical JSON uses the fixed key order, no unknown keys, and
  exactly one trailing newline; each inventory reconciles exactly with its target's
  `dist/<harness>/agents/` artifacts. Portable has no native inventory and only base worker
  contracts.
- Installer and distribution checks validate and consume that exact generated inventory. A `-fast`
  suffix plus a base peer is not authorization; arbitrary Claude-only, Codex-only, reviewer-Fast,
  malformed, duplicate, unlisted, cross-target-inconsistent, missing-inventory, or orphan artifacts
  remain errors.
- Treat `build.mjs` and its validated route-ID policy as the semantic authorization source. The JSON
  inventory is a build/install consistency manifest, not proof against an adversarially modified
  archive. Export exactly `parseNativeAgentInventory` and `reconcileNativeAgentInventories` from
  `build-lib.mjs`. Expose one dependency-free CLI operation:
  `scripts/native-agent-inventory.mjs validate <claude-inventory> <claude-agents-dir> <codex-inventory> <codex-agents-dir>`.
  It validates both inventories and artifact directories before mutation, writes nothing on stdout
  or stderr on success, and exits `0`; usage, read, schema, canonical-byte, or reconciliation errors
  write one stable non-payload diagnostic to stderr, write nothing to stdout, and exit `1`. Never
  parse JSON with shell text tools or duplicate the five-name set in shell. Signed release
  provenance is explicitly outside this work package and requires a separate plan if later
  demanded.
- `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` is runtime loss of enforceability, not a build error. The
  work-package-1 gate chooses Quality and reports `profile-unavailable`.
- Treat the inventory only as build/install consistency evidence. It cannot prove that a sidecar is
  installed, discoverable, or accepted by the running host. Work packages 4 and 5 still execute the
  work-package-1 runtime capability/override gate immediately before selection; an attempted spawn
  rejected by the host remains fallback `spawn-rejected`.
- Replace work package 1's artifact-absence assertions with a capability-versus-activation boundary:
  build-owned mappings, inventories, and the five sanctioned Claude sidecars may exist, while
  `src/tools/build.md` and `src/tools/refactor.md` remain profile-token-free, no workflow requests
  Fast, portable contains no native metadata, and the reserved configuration key remains absent
  from setup UI.

## Affected files

| File                                                  | Planned change                                                                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `build-lib.mjs`                                       | Validate profile mappings/tokens; render target-specific references; reject unresolved profile tokens.                |
| `build.mjs`                                           | Centralize mappings, derive eligible roles, generate Claude sidecars, use target-specific guards, and report counts.  |
| `scripts/native-agent-inventory.mjs`                  | Add a dependency-free CLI over the shared strict parser/reconciler for installer use.                                 |
| `scripts/compare-native-agent-baseline.mjs`           | Build a requested Git baseline and the working tree into temporary roots and compare base native artifacts.           |
| `local-common.sh`                                     | Accept only sanctioned Claude Fast asymmetry and include it in the ownership manifest.                                |
| `scripts/distribution-smoke.mjs`                      | Verify asymmetric native sets and unchanged portable membership.                                                      |
| `test/build-lib.test.mjs`                             | Add profile token, mapping, portable, and error cases.                                                                |
| `test/execution-profile-contract.test.mjs`            | Preserve WP1 policy validation while replacing artifact-absence assertions with capability-without-activation guards. |
| `test/native-agent-inventory.test.mjs`                | Cover CLI schema, reconciliation, non-echoing failure, and atomic preflight behavior.                                 |
| `test/execution-profile-rendering.test.mjs`           | Build into an isolated output root and assert exact artifacts and metadata.                                           |
| `test/local-common.test.mjs`                          | Cover valid Fast sidecars plus orphan, malformed, and unsupported asymmetry.                                          |
| `AGENTS.md`                                           | Document generated sidecars and per-spawn Codex rendering.                                                            |
| `docs/developer-guide/architecture.md`                | Describe the hybrid native representation and target inventories.                                                     |
| `docs/developer-guide/build-system.md`                | Document the new token, mapping validation, generation, and guards.                                                   |
| `docs/developer-guide/configuration.md`               | Replace the WP1 no-artifact statement with rendered-but-not-adopted semantics.                                        |
| `docs/developer-guide/release-and-installation.md`    | Document inventory-validated native installation and ownership.                                                       |
| `docs/user-guide/getting-started.md`                  | Explain native enforcement and host override limitations.                                                             |
| `docs/user-guide/configuration.md`                    | Explain that the reserved key still activates nothing although native capability artifacts now exist.                 |
| `docs/adr/native-execution-profile-representation.md` | Update future-tense representation statements to the implemented native rendering while preserving the decision.      |
| `docs/adr/risk-aware-model-tiering-pilot-policy.md`   | Update the WP1-only no-artifact statement; workflow adoption and measurement remain later work packages.              |

No `src/agents/*-fast.md` or `dist/**` source file is created. Required-field validation fails closed
without modifying `src/agents/*.md`; if it exposes a real inconsistency, stop and revise the plan's
exact affected paths before changing an agent contract. Base native artifacts must otherwise remain
byte-equivalent to the pre-work-package-2 build.

## Implementation details

### Approach

1. Before implementation, require `git merge-base --is-ancestor 7d1dcd5 HEAD`, the archived WP1
   plan, the ten-table execution-profile source, and the eight-route project-routing contract. Stop
   before edits when any precondition fails.
2. Add pure mapping and `AGENT_PROFILE` token parsing/validation to `build-lib.mjs`, including exact
   target expansions, portable bootstrap detection, and spawn-parameter naming for Codex
   (`reasoning_effort`, not TOML's `model_reasoning_effort`).
3. Define the total route classification and model mapping, validate exact coverage of the routing
   table already parsed into `projectRoutes`, then derive eligible base worker names from its five
   Fast-capable IDs. Fail on missing, extra, duplicate, newly unclassified, or misclassified routes,
   incomplete or surplus mappings, and generated-name collisions.
4. Extend reference rendering: generated sidecar name for Claude, explicit per-spawn override for
   Codex, and Quality/unavailable behavior for portable.
5. Generate the five Claude sidecars while leaving every base artifact byte-for-byte equivalent.
   Compare each Fast sidecar to its base and permit differences only in `name`, `description`,
   `model`, and `effort`; body, tools, color, and leaf instructions remain byte-equivalent after
   normal rendering. Validate Codex `reasoning_effort` against the supported vocabulary and chosen
   model combination rather than only checking non-emptiness.
6. Generate and validate the exact native inventory from the same mapping, then split
   `collectRenderedWorkerRefs` and the rendered worker-reference completeness guards across
   separate Claude, Codex, and portable worker sets. Assert that portable contains no exact Fast
   identifier, alias, unresolved profile token, or anchored native metadata assignment.
7. Add the dependency-free inventory CLI over the shared `build-lib.mjs` validator. Update
   `local-common.sh` to call it before mutation and accept only Claude-only names in the verified
   inventory whose base has the normal native pair. Keep all ownership and orphan checks. Test copy
   and link lifecycle behavior: record all five Fast artifacts, remove an owned stale file/link
   after a later inventory removes it, preserve foreign similarly named files, and fail every
   invalid inventory case before changing either the installed skill or agent set.
8. Update distribution smoke logic and build summaries for asymmetric membership.
9. Reuse and extend work package 1's isolated-build mechanism through
   `EFFECTIVE_FLOW_BUILD_OUTPUT_ROOT`; do not add a second output-root mechanism. Rewrite the WP1
   no-activation tests so native rendering capability is allowed but workflow adoption still fails.
10. Add `scripts/compare-native-agent-baseline.mjs --base <commit>` as the executable two-build
    proof. It creates isolated temporary checkouts and output roots, builds the requested baseline
    and the working tree, compares every base Claude and Codex artifact byte-for-byte while ignoring
    only the sanctioned Fast sidecars and inventories, exits nonzero on drift, and cleans up its
    temporary state. Do not introduce long-lived golden hashes that would make later legitimate
    base-worker changes churn unrelated fixtures.
11. Update both affected ADRs plus architecture, build-system, configuration, installer, and user
    documentation from “no Fast artifact exists” to “native rendering exists but no workflow adopts
    it.” Revalidate the current official Codex and Claude agent contracts immediately before
    implementation; stop on an incompatible host change.
12. Run the full suite and inspect generated artifacts rather than editing `dist/`.

### Edge cases and stop conditions

- Stop if either selected alias is unavailable on the supported host; update the central mapping,
  tests, and operational documentation rather than adding project-configured model names. Update a
  living ADR only when the cross-harness representation or capability constraint changes.
- Stop if the implementation base does not contain merged work package 1, its ten-table policy
  contract, or the expected eight-route project-routing contract; revise this plan rather than
  recreating either contract in WP2.
- Stop if Claude rejects or rewrites the generated suffix or if installer asymmetry cannot be
  constrained through the exact generated inventory without accepting arbitrary orphan artifacts.
- A runtime spawn rejection consumes the Fast opportunity and falls once to Quality; it is not a
  build error and never authorizes a second Fast attempt.
- Portable leakage of a model alias, Fast sidecar name, or enforcement claim is a release blocker.
- If build-identity verification changes, record the resulting merge-gate evaluation debt; never
  weaken its verifier.

## Acceptance criteria

- [x] All existing base native workers retain their Quality contracts and complete model metadata.
- [x] A two-build comparison against merged WP1 commit `7d1dcd5` proves every base native artifact
      byte-equivalent; metadata inconsistencies stop for an explicit plan revision rather than
      silently changing sources.
- [x] The existing WP1 policy parser/assertion remains the only execution-profile policy validator,
      runs before rendering and swap, and the renderer adds no duplicate gate or fallback vocabulary.
- [x] Exactly five Claude Fast sidecars are emitted and no Codex Fast TOML sidecar exists.
- [x] Each Claude Fast sidecar differs from its base only in name, description, model, and effort;
      description uses the exact suffix defined above, while body, tools, color, and leaf
      instructions are equivalent.
- [x] Codex rendering supplies explicit Fast `model` and `reasoning_effort` spawn parameters.
- [x] Portable membership equals the source-agent set and contains no native profile metadata.
- [x] The three target expansions of `{{AGENT_PROFILE:<agent>:fast}}` match the byte-exact forms in
      this plan, and portable profile-only consumers still receive the worker-delegation bootstrap.
- [x] Invalid mappings, profiles, agents, collisions, or incomplete eligible sets fail before swap.
- [x] Inventory schema version is integer `1`; both exported helpers and the exact `validate` CLI
      reject unsupported versions, noncanonical bytes, wrong keys/types, cross-target disagreement,
      and artifact mismatch with the specified streams and exit codes.
- [x] Every routing row has exactly one validated classification; the five named Fast-capable IDs
      resolve to five unique implementation workers, no worker name is duplicated in policy, and
      any routing-table addition or removal fails until the classification is updated.
- [x] Installer and distribution checks accept only the sanctioned Claude asymmetry and reject all
      missing, duplicate, unknown, malformed, inconsistent, unlisted, or orphaned variants.
- [x] `build.mjs` remains the semantic route authorization source; the inventory is labeled and used
      only as a consistency manifest, and no adversarial-tamper claim is made.
- [x] `local-common.sh` uses the shared dependency-free Node validator before mutation and contains
      neither ad hoc JSON parsing nor a duplicate Fast-worker allowlist.
- [x] Fast-profile tokens outside the initial `build`/`refactor` implementation seams fail the
      build.
- [x] Work package 2 leaves `build` and `refactor` token-free and proves through synthetic fixtures
      plus a repository build that no workflow adopts Fast yet.
- [x] `test/execution-profile-contract.test.mjs` permits only the new build-owned capability
      artifacts and continues to reject workflow activation, setup exposure, portable metadata,
      unregistered Fast names, and policy emission.
- [x] The registered Quality worker remains independently discoverable on both native targets.
- [x] Claude force override is documented and handled by the runtime capability gate.
- [x] Inventory success is never treated as runtime capability proof; missing discovery and actual
      spawn rejection retain their distinct work-package-1 outcomes.
- [x] Copy/link installation records, updates, and removes only owned Fast artifacts; foreign names
      survive, and invalid input changes no installed skill or agent set.
- [x] Installer validation remains anchored in `validate_native_distribution` before
      `effective_flow_deploy_from_dist` reaches `install_skill` or any agent mutation.
- [x] Both execution-profile ADRs and every WP1 no-artifact documentation statement describe the
      rendered-but-not-adopted state without claiming that Fast can be selected yet.

## Validation plan

```sh
git merge-base --is-ancestor 7d1dcd5 HEAD
test -f docs/plan/archive/2026-09-21-execution-profile-and-activation-contract.md
node --test test/build-lib.test.mjs test/execution-profile-contract.test.mjs test/execution-profile-rendering.test.mjs test/native-agent-inventory.test.mjs test/local-common.test.mjs
node --check build.mjs
node --check scripts/native-agent-inventory.mjs
node --check scripts/compare-native-agent-baseline.mjs
node --check scripts/distribution-smoke.mjs
sh -n local-common.sh
node scripts/compare-native-agent-baseline.mjs --base 7d1dcd5
pnpm agent:check
pnpm test
node build.mjs
pnpm test:distribution
pnpm eval merge-gate verify
git diff --check
```

After the build, inspect Claude Fast frontmatter, Codex base TOML, both native inventories, and
portable output. Portable checks use anchored metadata assignments, exact Fast aliases, unresolved
profile tokens, and exact `effective-flow-<agent>-fast` identifiers; broad prose searches such as
`model` or `effort` are invalid because benign documentation contains those words.

## Test results

- Focused implementation and correction suites passed, including 33 regression tests for phase
  authorization, duplicate route IDs, and interrupted copy/link recovery.
- The full repository suite passed with 1,191 tests and one intentional skip.
- Syntax checks, shell parsing, formatting, `git diff --check`, the isolated build, the WP1
  byte-equivalence comparator, and the distribution smoke suite passed.
- Generated-artifact inspection confirmed five Claude Fast sidecars, no Codex Fast sidecars,
  canonical native inventories, Quality-only portable output, and no Fast adoption in rendered
  `build` or `refactor` workflows.
- `pnpm eval merge-gate verify` passed. Its archive reports release debt of six stale scenarios
  with five runs each (30 stale runs); those behavioral evaluations must be re-recorded before the
  next release, not before this source merge.

## Review findings

**Date:** 2026-09-22
**Reviewer:** `effective-flow-generic-product-reviewer`, `effective-flow-code-validator`

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     3 |
| Open / Not implemented |     0 |

The cold review initially found 0 Critical, 2 Important, and 1 Note findings. All three were fixed
and independently rechecked with high confidence:

- Fast-profile tokens are now accepted only inside Build Phase 2 and Refactor Phase 3.
- Native install ownership is persisted before mutation, so interrupted copy/link attempts remain
  recoverable without claiming similarly named foreign files.
- Route classifications remain ordered entries until duplicate IDs have been rejected.

The correction review found no new Critical or Important issues. Final open findings: 0.

## Assumptions and open points

- The initial mappings deliberately match the existing economical worker tier.
- PR #456 is merged as commit `7d1dcd5`; implementation starts from `develop` containing that
  commit even though this planning checkout still predates it.
- Current official host contracts support Codex per-spawn overrides and Claude model/effort agent
  metadata; implementation must recheck them because aliases and fields are temporally unstable.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------- | --------- | ---- |
| Architecture    | 0        | 0         | 0    |
| Security        | 0        | 0         | 0    |
| Data protection | 0        | 0         | 0    |
| Error cases     | 0        | 0         | 0    |
| Testability     | 0        | 0         | 0    |
| Scope           | 0        | 0         | 0    |
| Maintainability | 0        | 0         | 0    |

### Findings

- **Critical — resolved architecture decision:** A centralized set of five Fast-capable route IDs
  is now the explicit policy. Worker names are derived from validated routing rows, while missing,
  duplicate, renamed, or newly unclassified implementation routes fail closed.
- **Important — resolved trust-boundary decision:** `build.mjs` retains semantic authorization; the
  inventory is only a consistency manifest, parsed and reconciled by one dependency-free Node
  validator shared with the shell installer. Signed provenance is outside this work package.
- **Incorporated during deep review:** Work package 2 remains non-adopting; inventory identifiers and
  bytes are canonical; runtime capability stays a later gate; base/Fast metadata equivalence and
  Codex effort compatibility are tested; base source drift fails closed; installer lifecycle and
  atomic failure behavior are covered; changed scripts receive direct syntax checks; and every
  canonical routing row now receives a total, build-validated Fast/Quality/non-implementation
  classification.

### 2026-09-22 — Post-WP1 reconciliation

**Result:** Approved

| Area            | Critical | Important | Note |
| --------------- | -------- | --------- | ---- |
| Architecture    | 0        | 0         | 0    |
| Security        | 0        | 0         | 0    |
| Data protection | 0        | 0         | 0    |
| Error cases     | 0        | 0         | 0    |
| Testability     | 0        | 0         | 0    |
| Scope           | 0        | 0         | 0    |
| Maintainability | 0        | 0         | 0    |

#### Findings

- **Critical — resolved dependency drift:** PR #456 is merged, the dependency now points to its
  archived plan, and the planning baseline records merge commit `7d1dcd5` instead of the pre-WP1
  snapshot.
- **Important — resolved contract seam:** WP2 now explicitly consumes the WP1 policy parser and the
  validated project-routing result, updates the existing no-activation guard, and defines exact
  target expansions without creating a second policy source.
- **Important — resolved current-state documentation:** Both living ADRs, both configuration guides,
  the build/architecture/install guides, `AGENTS.md`, and the getting-started guide now belong to the
  planned transition from artifact absence to rendered-but-not-adopted capability.
- **Important — resolved verification drift:** The plan reuses the existing isolated build root,
  adds the WP1 contract test to focused validation, pins a two-build base-artifact comparison, and
  uses the current `pnpm eval merge-gate verify` command.
- **Important — resolved executable baseline proof:** A dedicated comparison command now verifies
  the pinned merge ancestry and byte-equivalence of every base native artifact without permanent
  golden hashes.
- **Important — resolved inventory protocol:** Schema version `1`, exported parser/reconciler names,
  CLI arguments, stream behavior, exit codes, and pairwise artifact reconciliation are explicit.
- **Important — resolved ADR ownership:** A volatile alias change updates mapping, tests, and
  operational documentation; it touches a living ADR only when the durable representation or
  capability constraint changes.
- **Notes incorporated:** Implementation now has a merge-ancestry preflight and deterministic Fast
  sidecar description derivation.

## Open points

- No open points.
