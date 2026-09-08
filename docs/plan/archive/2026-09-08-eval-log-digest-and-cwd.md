# Decouple the eval logs: narrow the digest binding and assert the runtime root

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`/effective-flow fix`)
**Planned against:** `0e48411`, 2026-09-08
**Working state:** clean

## Requirement

The merge-gate behavioural eval layer measures the wrong two things. It is very strict about
**whether the build is identical** and silent about **whether the run was sound** — which is the
wrong way round: the first produces recurring work with no information, the second decides whether
the evidence is worth anything at all.

**Over-coupled: the digest covers the whole built skill.** Every archived run carries a
`run-N.build.json` whose `skill` part hashes the entire built portable tree — 86 files, produced by
an unfiltered recursive walk in `evals/merge-gate/_scaffold/build-identity.mjs:80-88`. A
`merge-gate` run in the sandbox loads roughly 18 of them. `assertBoundToCurrentBuild`
(`test/merge-gate-eval.test.mjs:206-226`) compares only the combined digest, so a change to any of
the other ~68 files — another tool, a worker contract, an unrelated fragment — invalidates all ten
archived runs and forces a full re-round of two scenarios × five runs at roughly five minutes each.

Observed three times in one session on 2026-09-08: retiring the rename butler invalidated the
standing round; merging `develop` (#404, which touched `src/shared/goal-completion.md`) invalidated
the fresh one; and because both sides had regenerated their logs, the two branches conflicted on all
twenty evidence files at once. Log files cannot be merged line-by-line without fabricating
observations no run produced, so the only sound resolution is to take one side and re-run
everything.

**Under-checked: nothing asserts the runtime root.** Each log record carries `cwd`, the value the
caller passed to the helper. `assertSchema` (`:255-266`) reads the key _set_, `seq`, `operation` and
`apply`; the values of `cwd` and `at` are never examined. A run whose every record carried
`cwd: null` — the stub's value when the caller states none
(`evals/merge-gate/_scaffold/remote-tracker.mjs:239-244`) — therefore passed the whole suite and
counted toward the documented five-of-five bar, although it never proved it targeted the sandbox:
the helper falls back to its inherited process directory. That happened on
`merge-proceeds/run-3.jsonl`, 21 records, all null. It was caught by the `recensor` review bot, not
by the assertions.

The two halves are one change because they are the same misplaced strictness, and because the first
one's fix would otherwise force exactly the re-round it exists to prevent.

## Architecture decisions

- **The digest binds to the files a scenario actually loads.** The narrow set is the router, the
  gate tool, the stubbed helper and the fragments `merge-gate` reaches through its own include
  graph — about 18 built paths against the 86 hashed today. That keeps the property the binding
  exists for: any change to what the gate itself executes still invalidates the evidence. What it
  drops is invalidation by files no run reads.
- **`scripts/remote-tracker-core.mjs` stays out of the set.** The shipped helper imports it, but the
  scaffold replaces that importer with the stub (`_scaffold/scaffold.mjs:96-99`), so no sandbox run
  reaches it. Hashing it would reintroduce exactly the kind of coupling this change removes, on a
  file the measured runs demonstrably do not load.
- **The set is derived, not hand-listed.** Resolve it from the built layout by following
  `tools/merge-gate.md`'s own `lazy-include` pointers transitively, plus the router and the helper.
  A literal list in `build-identity.mjs` would drift the first time a fragment is added, and drift
  in the direction that silently narrows the guard.
- **The set is the include graph, and an unresolvable pointer is fatal.** Nothing records which
  files a sandbox run actually opens, so the set is inferred rather than observed, and a missed route
  would weaken the guard without any test noticing. Two alternatives were weighed and rejected:
  hashing all of `shared/` alongside the router, tool and helper is immune to graph drift but covers
  39 files and would not have prevented a single invalidation seen today — both #404 and the butler
  change touched `shared/`; and instrumenting the scaffold to record real reads retires the
  assumption but is a larger harness change needing its own round to establish the set. The residual
  is accepted and bounded by making a pointer that does not resolve abort the stamp, so the set can
  fail loudly but never shrink quietly.
- **The existing stamps are re-derived, not re-run.** Each archived `run-N.build.json` already
  carries `skill.files`, a per-file hash map of the tree that run observed. The narrowed digest is
  therefore computable **from the stamp itself**, restricted to the narrow path set — no rebuild,
  no re-run, and provably the same bytes the run saw. This is the whole reason the change is
  affordable, and it is why the migration must read the archived stamp rather than the current tree.
- **A null `cwd` in an archived run is a hard failure, per record.** It joins the harness's existing
  fail-closed posture, which already treats an empty log as an error rather than a refusal. The
  check belongs to the _archived evidence_, not to the stub: the stub's own contract legitimately
  permits a null `cwd` for a caller that states none, and
  `test/eval-fixture-fidelity.test.mjs:420-422` pins exactly that. Do not "fix" the stub to reject
  it — a live helper tolerating an omitted `cwd` is correct behaviour that the shipped
  `issue-tracker-forge` contract relies on.
- **The path comparison normalizes realpaths.** macOS resolves `/tmp` to `/private/tmp`, and the
  archived evidence proves both spellings occur — `guard-blocks-merge/run-5` and
  `merge-proceeds/run-2` and `run-5` each mix the two **within one run**. A strict equality against
  the sandbox project root would fail three currently valid runs. Compare through `realpathSync`, or
  match the trailing `<scenario>/project` segment.
- **The comparison target is the project root, not the skill root.** The recorded value is
  `<sandbox>/<scenario>/project`; the skill tree lives beside it and is never the caller's `cwd`.

## Affected files

| File                                            | Description                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evals/merge-gate/_scaffold/build-identity.mjs` | Replace the unfiltered `walk` for the `skill` part with the derived load set; keep `instrument` and `scenario_inputs` unchanged. Rewrite the rationale paragraph at `:10-16`, which currently argues for hashing the whole output                                                                               |
| `test/merge-gate-eval.test.mjs`                 | Rewrite `the build stamp covers the built tree a run actually loads` (`:128-148`) — its name already states the target property while its `hashed.length > 50` assertion enforces the opposite; add the per-record `cwd` assertion to `assertSchema` (`:255-266`) or beside it                                  |
| `evals/merge-gate/results/*/run-*.build.json`   | One-off migration: re-derive each stamp's digest under the narrow rule from its own `skill.files` map. Ten files, no re-run                                                                                                                                                                                     |
| `evals/merge-gate/README.md`                    | `:112` heading says "Four failure modes" over five bullets and gains a sixth; `:208-212` is the only mention of `cwd` and says nothing about the runtime root; the file table at `:27-35` has no `run-<n>.build.json` row; the cost claim at `:71-79` and the concurrency notes at `:90-98` both change meaning |

Out of scope, deliberately: the stub's own null-`cwd` tolerance; `test/eval-fixture-fidelity.test.mjs`
beyond leaving `:420-422` untouched; adding scenarios; whether the archived logs should be committed
at all; and the unconditional `buildPortableSkill` that `currentIdentity` runs on every `pnpm test`
even in a checkout with no archived runs — a separate cost with a separate fix.

## Implementation details

### Approach

1. **Derive the load set** in `build-identity.mjs`: start from `SKILL.md`, `tools/merge-gate.md` and
   `scripts/remote-tracker.mjs`, then close over the `lazy-include` pointers reachable from the gate
   tool, transitively, resolving each to `shared/<name>.md` in the built tree. Eagerly included
   fragments need no entry — the build inlines them into the tool body, so they are already covered
   by the tool's own hash.
2. **Fail loudly on an unresolvable pointer.** A fragment named by a pointer but absent from the
   built tree means the set is wrong; that must abort the stamp rather than silently hash a smaller
   set. A guard that quietly shrinks is worse than the coupling being removed.
3. **Keep the stamp's shape.** `scenario`, `skill`, `instrument`, `scenario_inputs` and the combined
   `digest` stay as they are, so `describeDrift` (`:177-204`) and the failure message keep working
   and the migration is a value change rather than a format change.
4. **Rewrite the coverage test** at `:128`. Replace the `> 50` count floor with membership: the
   hashed set must contain the router, the gate tool, the helper and a named sample of the fragments
   the gate reaches, and must **not** contain a worker contract, an unrelated tool, or `LICENSE`.
   That turns a proxy for "is this the built tree" into a direct check of the documented property.
5. **Add the `cwd` assertion** over every record of every archived run: present, a string, non-null,
   and resolving into that scenario's sandbox project root after realpath normalization. Name the
   defect in the failure message — a run that did not pass the runtime root proves nothing about the
   sandbox — so a future reader does not mistake it for a formatting rule.
6. **Migrate the twenty stamps** with a one-off script: for each `run-N.build.json`, take its own
   `skill.files` map, restrict it to the narrow set, recompute the part digest and the combined
   digest by the same canonical form `hashFiles` uses, and write the file back. Verify afterwards
   that `pnpm test` passes without any re-scaffolding. If a stamp's `skill.files` lacks a path the
   narrow set names, stop and report rather than substituting the current tree's hash for it: that
   would assert something about bytes the run never observed. The recomputation itself needs no
   fallback — it is verified reproducible from the stored map (see "Assumptions").
7. **Update the README** at the four sites named above, and add the new assertion to the list of
   shared assertions a new scenario inherits (`:263-268`).

### Edge cases

- **A stamp missing `skill.files` entirely.** No schema validation exists for these files today
  (`assertBoundToCurrentBuild` does a bare `JSON.parse`), so the migration must treat a malformed
  stamp as a stop, not as an empty map that silently produces a digest over nothing.
- **An orphan `run-N.build.json` with no `run-N.jsonl`.** `archivedRuns` enumerates `.jsonl` only
  (`:150-166`), so such a file is invisible to the suite and would also be invisible to a migration
  that iterates runs. Iterate the directory, not the run list.
- **A run mixing `/tmp` and `/private/tmp`.** Already present in three archived runs; the
  normalization must accept it rather than treat it as two different roots.
- **A record whose `cwd` points outside the sandbox.** Fails, and should: it means the caller passed
  some other root, which is a different defect from passing none but equally disqualifies the run as
  evidence about the sandbox.
- **The narrow set legitimately shrinking.** If a future change removes a fragment from the gate's
  include graph, the set shrinks and every stamp is invalidated — correctly, because what the gate
  loads changed. That is the guard working, not the coupling returning.

## Acceptance criteria

- [ ] `scenarioBuildIdentity` hashes only the derived load set for its `skill` part; the hashed count
      is in the high teens rather than 86, and the set is derived from the include graph rather than
      literal.
- [ ] `node --test test/merge-gate-eval.test.mjs` passes against the **existing** twenty archived
      stamps after the migration, with no scenario re-run and no re-scaffolding.
- [ ] The rewritten coverage test asserts membership and non-membership rather than a count, and
      fails when the router, the gate tool or the helper is dropped from the set — verified by
      mutation.
- [ ] Every archived record is asserted to carry a non-null `cwd` resolving into its scenario's
      sandbox project root; a synthetic run with `cwd: null` fails the suite — verified by mutation
      against a copy, never against the committed evidence.
- [ ] `test/eval-fixture-fidelity.test.mjs:420-422` is unchanged, and the stub still answers a call
      that states no `cwd`.
- [ ] A change to a file outside the load set — a worker contract, say — leaves the suite green,
      demonstrated by touching one and running the suite.
- [ ] `evals/merge-gate/README.md` states the runtime-root requirement, counts its failure modes
      correctly, and lists the new assertion among those a new scenario inherits.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` all exit 0.

## Validation plan

| Purpose                            | Command                                                                        | Expected result                                   |
| ---------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------- |
| Formatting                         | `pnpm agent:check`                                                             | exit 0                                            |
| Full suite against migrated stamps | `pnpm test`                                                                    | exit 0, no re-run performed                       |
| Eval assertions alone              | `node --test test/merge-gate-eval.test.mjs`                                    | exit 0                                            |
| Build guards                       | `node build.mjs`                                                               | exit 0                                            |
| Delivery layouts                   | `pnpm test:distribution`                                                       | exit 0                                            |
| Decoupling, demonstrated           | touch a `workers/*.md`, run `pnpm test`                                        | exit 0 — previously this invalidated all ten runs |
| Coupling retained, demonstrated    | touch `src/tools/merge-gate.md`, run `pnpm test`                               | the digest assertion fails, naming the moved file |
| `cwd` guard, demonstrated          | set one record's `cwd` to `null` in a **copy** of a run, point the suite at it | that run fails with the runtime-root message      |

The last three are the ones that matter: they test the change's actual claims rather than its
absence of syntax errors. None of them requires a scenario re-run.

## Assumptions and open points

- **Verified on 2026-09-08 against `origin/develop`:** all ten archived runs carry a non-null `cwd`
  on every record, so adding the assertion invalidates none of the current evidence; the stamps
  record 86 skill files, 3 instrument files and 2 scenario inputs; and three runs mix the `/tmp` and
  `/private/tmp` spellings within a single run.
- **Assumed, and deliberately not verifiable:** every file a sandbox run loads is reachable from
  `tools/merge-gate.md`'s include graph plus the router and the helper. If a run can load a fragment
  by some other route, the derived set is short and the guard weaker than intended. Nothing records
  which files a run actually opens — the call log carries helper invocations, not file reads — so
  this cannot be confirmed by observation, which is precisely why the architecture decision accepts
  the residual and bounds it with the fail-loud pointer guard instead. Do not go looking for a read
  log to check it against; changing that would mean instrumenting the scaffold, which this plan puts
  out of scope.
- **Verified on 2026-09-08, not assumed:** the migration is derivable from a stamp alone. Recomputing
  each part digest from that stamp's own `files` map — sorted `name digest` lines joined by newlines,
  the canonical form `hashFiles` uses at `build-identity.mjs:92-100` — reproduces the stored value
  exactly for all three parts, and the stored combined digest reproduces from the three part digests.
  No rebuild is needed and no fallback is required.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------- | --------: | ---: |
| Architecture    | 0        |         2 |    1 |
| Security        | 0        |         0 |    0 |
| Data protection | 0        |         0 |    0 |
| Error cases     | 0        |         1 |    0 |
| Testability     | 0        |         1 |    2 |
| Scope           | 0        |         0 |    1 |
| Maintainability | 0        |         0 |    1 |

### Findings

- **Architecture, Important — a derived set can silently shrink.** The whole value of the guard is
  that it fails when the gate's own text changes; a set derived from pointers fails open if a
  pointer stops resolving. Incorporated as approach step 2: an unresolvable pointer aborts the stamp
  rather than producing a smaller one.
- **Architecture, Important — the load set is inferred, and nothing can observe it.** Raised in the
  deep review and decided: keep the include-graph derivation, reject the coarser all-of-`shared/`
  set (39 files, and no help against either invalidation observed today) and the instrumented
  alternative (a larger harness change). The residual is bounded by the fail-loud guard rather than
  closed, and it is named here so a later reader does not rediscover it as a defect.
- **Testability, Note — one assumption was retired by measurement rather than argument.** The deep
  review recomputed all three part digests and the combined digest from an archived stamp's own file
  map; every one reproduced. The migration therefore rests on a verified property, and the plan's
  conditional rebuild fallback was removed as dead.
- **Architecture, Note — the migration must read the stamp, not the tree.** Re-deriving from the
  current tree would assert something about bytes the archived run never observed, which is the
  same class of error as re-stamping without re-running. Incorporated as an explicit decision and
  as a stop condition in step 6.
- **Error cases, Important — the realpath split is not cosmetic.** Three of the ten committed runs
  would fail a naive equality check, so the change would land red against its own evidence.
  Incorporated as a decision and an edge case, with the measured runs named.
- **Testability, Important — the coverage test currently contradicts its own name.** Replacing a
  count floor with membership is what makes it test the documented property; leaving it as a count
  would either block the change or, if simply lowered, assert nothing at all.
- **Testability, Note — the demonstrations are the real acceptance.** Two of the validation rows
  (touch an unrelated worker; touch the gate tool) are the only checks that distinguish this change
  from one that merely deletes a guard. They are named as commands rather than as intentions.
- **Scope, Note — the unconditional build on every `pnpm test` is left alone.** `currentIdentity`
  builds the portable skill even in a checkout with zero archived runs, because the coverage test is
  never skipped. Real cost, unrelated cause; folding it in would hide this fix inside a performance
  change.
- **Maintainability, Note — the README's failure-mode list is already miscounted** ("Four" over five
  bullets) before this change adds one. Corrected as part of the documentation step rather than left
  to accumulate.

## Open points

- No open points.

## Implementation notes

Implemented on 2026-09-08 by `effective-flow fix`, from base `0e48411`.

- **The plan said twenty stamps; there are ten.** `results/{guard-blocks-merge,merge-proceeds}/run-{1..5}.build.json`
  is 2 x 5. The Requirement section's "twenty evidence files" counts stamps _plus_ their `.jsonl`
  logs, which is the number that conflicts in a merge; the affected-files row wrongly carried that
  figure over to the migration. Corrected above.
- **The derived load set is 17 files**, not the estimated 18: the router carries no load pointer, so
  only `tools/merge-gate.md` and the fragments are scanned. `scripts/remote-tracker-core.mjs` stays
  out as decided.
- **The migration needed no re-run and no rebuild.** Every stamp's three part digests were verified
  to recompute from its own `files` map before anything was written, and the script writes nothing
  unless all ten pass. Each `skill.files` went 86 -> 17 entries; no hash was read from the current
  tree, only the narrow set's names. The migrated stamps bind green against a freshly built tree.
- **No `.jsonl` was modified.** The observations are unchanged; only their binding is.

## Test results

| Check                        | Result                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `pnpm agent:check`           | exit 0, 355 files                                                            |
| `pnpm test`                  | exit 0 - 865 tests, 865 pass, 0 fail                                         |
| `node build.mjs`             | exit 0                                                                       |
| `pnpm test:distribution`     | exit 0                                                                       |
| Decoupling demonstrated      | touched `src/agents/code-documenter.md`; eval suite 9/9 green                |
| Guard retained, demonstrated | touched `src/tools/merge-gate.md`; both digest assertions failed as intended |

Both mutation checks the plan required were performed by the test worker and independently repeated
by the orchestrator: removing a seed from the load set fails the coverage test, and a null `cwd` in a
copied run fails the runtime-root assertion with its own message.

## Review findings

**Date:** 2026-09-08
**Reviewer:** none routed - the change touches only eval tooling, tests and documentation; no product
bucket was implemented, so `Project routing` selected no reviewer. Technical validation covered it.

No findings found.
