# Record a diff baseline and hand the run's diff to validators and reviewers

**Plan status:** Implemented
**Source:** effective-flow plan-issue (#469)
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

`build`, `fix` and `refactor` validated and reviewed a change whose extent they never pinned down.
Documentation sync, reviewer routing, the validator and the formatter all acted on "the files this
run changed", but no step computed that set, and reviewers received whole files plus the
implementer's report instead of the delta. Issue #469 asks for a **diff baseline**: capture the
working tree before the first implementation write, render the run's delta whenever a step needs
"changed by this run", and let one path list drive every consumer.

The authoritative specification is the approved planning comment on
[#469](https://github.com/sebastian-software/effective-flow/issues/469#issuecomment-5880024997),
including its three planning decisions: fix writes its reproduction test after the capture, render
accepts a path scope for parallel delegated runs, and cleanup lists stale diff baselines and deletes
them only after confirmation.

## Architecture decisions

- The helper is a dependency-free JSON CLI over a core module (`capture`, `render`, `discard`), like
  the other runtime scripts. Deterministic Git plumbing stays out of prose.
- Snapshots use a private index and a private object directory below
  `.effective-flow/runs/<runId>/diff-baseline/`, with the real object store as a read-only
  alternate, so the real index, stash, refs and object store stay untouched.
- The workflow contract lives once, in the lazily loaded `src/shared/diff-baseline.md`; tool files
  carry only short call sites. Reviewer behaviour lives in the eager
  `src/shared/reviewer-assigned-change.md`, conditional on a supplied diff path.
- No merge-gate eval load-set member is edited, so the recorded eval evidence is unaffected.
- The native-agent baseline proof (#456) now exempts, and names, agents whose own sources changed
  since its base; renderer drift on every other agent still fails.

## Affected files

| File                                                                                                                                               | Description                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/scripts/diff-baseline.mjs`, `src/scripts/diff-baseline-core.mjs`                                                                              | New helper: capture, render, discard                                                      |
| `src/shared/diff-baseline.md`, `src/shared/reviewer-assigned-change.md`                                                                            | New workflow and reviewer fragments                                                       |
| `src/tools/build.md`, `fix.md`, `refactor.md`, `cleanup.md`                                                                                        | Capture, render, discard wiring; fix reproduction-test move; cleanup stale-baseline class |
| `src/agents/{nodejs,rust,frontend,generic-product}-reviewer.md`                                                                                    | Eager include of `reviewer-assigned-change`                                               |
| `build.mjs`, `scripts/distribution-smoke.mjs`, `test/execution-profile-contract.test.mjs`                                                          | Script registration and context budgets                                                   |
| `scripts/compare-native-agent-baseline.mjs`, `test/execution-profile-rendering.test.mjs`                                                           | Re-scoped native baseline proof                                                           |
| `test/diff-baseline*.test.mjs`, `test/compare-native-agent-baseline.test.mjs`, `test/workflow-contracts.test.mjs`, `test/merge-gate-eval.test.mjs` | New and extended tests                                                                    |
| `AGENTS.md`, `docs/developer-guide/*`, `docs/user-guide/tools-{implement,setup}.md`                                                                | Documentation sync                                                                        |

## Implementation details

### Approach

1. Implement and test the helper; register it in all three script lists.
2. Wire capture, render and discard into the three implementing tools and cleanup through the
   lazily loaded fragment; add the conditional reviewer fragment.
3. Re-scope the pinned native baseline proof, raise context budgets by the measured delta, sync the
   documentation, and add contract tests.

### Edge cases

- Unreadable files or directories and a mismatching `baseline.json` fail closed and name the cause;
  nothing is skipped silently.
- Snapshots pin `core.splitIndex=false`, a private empty `core.hooksPath`, `core.safecrlf=false` and
  `core.sharedRepository=0600`, and run every Git call with `GIT_OPTIONAL_LOCKS=0` and `LC_ALL=C`.

## Acceptance criteria

- [x] All acceptance criteria of the planning comment on #469 hold.
- [x] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass.
- [x] No merge-gate load-set member changed; the eval identities equal those of `origin/develop`.

## Validation plan

- Helper fixture tests assert unchanged status, index bytes, stash, refs, `HEAD` and `.git/` tree
  around every operation.
- Contract tests pin the capture, render and discard placement and the load-set boundary.
- The full CI sequence and `pnpm eval merge-gate verify` run on the delivery branch.

## Test results

- `pnpm agent:check`: pass (506 files).
- `pnpm test`: 1511 tests, 1510 pass, 0 fail, 1 intentional skip (merge-gate freshness is `pnpm eval merge-gate verify`).
- `node build.mjs`: pass; always-loaded core build 623/625, fix 519/520, refactor 930/932, cleanup 1070/1070.
- `pnpm test:distribution`: pass.
- `scripts/compare-native-agent-baseline.mjs --base 7d1dcd5`: pass; the four reviewer agents are named as source-changed.
- `pnpm eval merge-gate verify`: every scenario identity equals `origin/develop`; the archive is stale there already.

## Assumptions and open points

- The merge-gate eval archive is stale on `origin/develop` independently of this change; this change
  moves no load-set hash, but the next release pull request still owes a re-recorded round.

## Plan review

**Result:** Approved

See the plan review in the planning comment on #469.

## Review findings

**Date:** 2026-09-29
**Reviewer:** effective-flow-nodejs-reviewer, effective-flow-generic-product-reviewer

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |    26 |
| Open / Not implemented |     0 |

One further note (three Git processes per guarded mutation) was closed as an accepted cost.

## Open points

- No open points.
