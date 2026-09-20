# Delegate the investigation method and correct the M-item assessment

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

Section §6.2 of
[`docs/review/2026-08-31-architecture-and-consistency-review.md`](../review/2026-08-31-architecture-and-consistency-review.md)
proposed moving six Effective Flow shared fragments into the central skills repository (M-1 … M-6), and P4
(L606) repeats it: "move the six reusable fragments to the skills repository".

A per-item comparison against the current skills checkout found that recommendation largely wrong:

| Item | Fragment                                          | Verdict                     | Evidence                                                                                                                                                                                                                                                                               |
| ---- | ------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M-1  | `worktree-lifecycle.md` + `execution-location.md` | stays in Effective Flow     | `effective-delivery/references/worktree-safety.md:22–23` forbids "a private ledger, hidden state directory, or mandatory receipt file"; the lifecycle persists records under `.effective-flow/worktree-runs/`                                                                          |
| M-2  | `security-disclosure-gate.md`                     | stays in Effective Flow     | no upstream reference owns withholding security findings from trackers; the gate controls Effective Flow's tracker publication and finding IDs                                                                                                                                         |
| M-3  | `commit-message-rules.md`                         | upstream contribution first | `evidence-and-delivery.md:65–91` covers Conventional Commits as a fallback, specific subjects, no AI attribution and part of type-by-effect; the gap is the runtime-effect rule and squash-title release signalling, and most of the fragment is Effective Flow policy that would stay |
| M-4  | `investigation-method.md`                         | **delegate now**            | `effective-delivery/references/investigation.md` (179 lines) already covers the diagnostic method far beyond the 21-line fragment                                                                                                                                                      |
| M-5  | `adr-convention.md` + `project-adr-convention.md` | upstream contribution first | `adr-format.md` asks a repository to declare its identity scheme but has no precedence, width allocation or collision rules; thinning only after an upstream contribution lands                                                                                                        |
| M-6  | `doc-categories.md`                               | stays in Effective Flow     | `effective-delivery/references/route-docs.md:95–97` rejects "a mandatory docs hierarchy when the repository does not already use one" — exactly the case the four-category default serves                                                                                              |

This plan implements the user's decision of 2026-09-12: **delegate M-4 now and correct the review
document**. M-3 and M-5 are recorded as upstream follow-ups only; nothing is written to the skills repository.

### Why this is a Feature

Declaring `effective-delivery` authoritative for investigation depth changes what a `fix` or `investigate` run
does whenever the skill is installed: competing hypotheses, a discriminating reproduction, epistemic labels,
outcome classes and intervention level become part of the run. Effective Flow's plan contract defines
Refactoring as having no intended behavior change, and `investigate`'s own routing sends a deliberate behavior
change to `build`. The #393 precedent (`refactor:` for the implementer delegations) is noted and not followed,
because this plan states the behavior change as its purpose.

### Planning baseline

- Effective Flow: `origin/develop` at `4321151`, 2026-09-12. Of the two commits the local checkout lacked, only
  `4321151` touches a file named here (`build.mjs`, the merge-gate budget entry and comment) — harmless for this
  plan.
- Skills: DALO checkout `/Users/bs5/.dalo/sources/sebastian/checkout` at `f79397b` (2026-08-25).
- `investigate` always-loaded core **516** against an entry of **521**; `fix` **463** against **700**, one of the
  deliberate judgement entries in `build.mjs` (L1413–1414, comment at L1453–1455).

### Verified current state

- `src/shared/investigation-method.md` (21 lines) is eagerly included by `src/tools/fix.md:97` and
  `src/tools/investigate.md:90`. Both tools run its "Investigate symptom and code" section unconditionally
  (`fix.md:155`, `investigate.md:125`).
- It carries a read-only framing that distinguishes `fix` (may write a reproduction test) from `investigate`
  (fully read-only); intake steps 1–4 (expected vs. actual; delegated read-only code investigation; asking the
  user when, what error message and since when; suspected root cause and files); and a three-criterion
  scorecard (Clarity, Verification, Context with a ≤ 10 % guessing target).
- `test/delegation-mandate-contract.test.mjs:270–289` pins two patterns in this fragment: the
  delegate-to-an-internal-sub-agent sentence and the triviality-exception sentence.
- `effective-delivery` covers the investigation depth through its audit route (`route-audit.md` step 3 →
  `references/investigation.md`).
- `fix` already recommends `effective-delivery` (`fix.md:75` heading) and is a `delegate` consumer
  (`docs/developer-guide/skill-ownership.json:36`). `investigate` has **no** `## Recommended skills` section and
  **no** manifest relationship.
- **A three-sided conflict exists.** `references/investigation.md:15–18` says to return the report in the
  conversation by default and forbids "a hidden runtime directory, private hypothesis ledger, mandatory report
  path". `investigate` writes its report under `.effective-flow/investigation/`, tracks hypotheses in its
  transient wisdom file (`investigate.md:126`, `:213`), and hands the report path to the follow-up workflow's
  invocation suggestion. Once the skill is authoritative, a run that follows it could skip all three.
- Build guards (`build-lib.mjs`): the forward check (L713–727) rejects a recommendation without a manifest
  relationship; the delegate reverse check (L730–802, throw at L789–792) requires a `delegate` consumer to name
  its owner as the first member of a recommendation bullet; the guide table reconciles row membership only, not
  consumer cells (L528–531, `assertSkillOwnershipContract` L638–652). Known consumers come from `src/tools`,
  `src/agents` and `src/shared`.

## Architecture decisions

- **Delegate without moving.** The skill already owns the method; nothing is contributed upstream. Effective
  Flow keeps a minimal fallback, as `src/shared/skill-discovery.md` requires for an absent, disabled or excluded
  skill.
- **Only the diagnostic depth is delegated; user interaction and delegation stay orchestration.** Intake step 2
  (delegating the read-only code investigation) and step 3 (asking the user when, what error, since when) remain
  always active in both tools: the skill has no counterpart for asking the user, and user interaction is
  orchestration under `skill-discovery.md` point 5. Steps 1 and 4 (framing expected vs. actual; the suspected
  root cause and files) become the baseline the skill deepens and the minimal fallback when it is absent.
- **The override lives in the text a run reads.** The fragment's authority sentence states, for both embedding
  workflows, that the skill's rules on returning the report in conversation, on runtime directories, on
  hypothesis ledgers, on mandatory report paths and on read-only stopping do **not** apply: the embedding
  workflow's report path, its transient wisdom file, its routing and its own scope (a `fix` run writes a failing
  test and then fixes) stay binding. The ownership guide records the same choice as documentation, not as the
  place a run learns it.
- **The scorecard stays Effective Flow's,** including the ≤ 10 % target — scorecard thresholds are artifact
  contracts under `skill-ownership.md`. `fix`'s Phase 2 extension of that scorecard stays coherent.
- **`investigate`'s Phase 3/4 and its report template are the report schema, not the method.** They are left
  untouched and recorded as the output contract, so a later audit does not read them as a second copy of the
  skill's hypothesis method.
- **Both the tool and the fragment become `delegate` consumers.** `investigate` gains `## Recommended skills`
  naming `effective-delivery` first, placed directly before `## Project conventions` as in `fix.md:75`.
  `investigation-method` is added as a consumer too, following the precedent of fragments that carry ownership
  prose (`documentation-sync-contract`, `worktree-integration`, `language-rules`, `chat-language`); shared
  fragments are exempt by kind from the reverse check.
- **`fix`'s budget entry stays at 700.** It is a deliberate judgement entry, and the fragment's small growth is
  absorbed. Only `investigate`'s measured entry is raised.
- **The review document is corrected in its status section.** Its section says to update the table when a
  finding closes and to leave finding text alone (L13–15); corrections to the document itself are recorded as
  bullets under it (L25–37). This plan follows that practice.
- **Prerequisite: the status-table catch-up lands first.** The table currently lists P0 and P2 as implemented
  and "Everything else | open", although P1, F-16 and the §5 eval layer are implemented. Adding M rows beside a
  stale "Everything else" row would leave the table wrong in a new way.

## Affected files

| File                                                            | Description                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/investigation-method.md`                            | Authority sentence with the override; steps 1 and 4 marked as the baseline and minimal fallback; steps 2 and 3, the pinned sentences and the scorecard kept verbatim                                                                                                   |
| `src/tools/investigate.md`                                      | New `## Recommended skills` section directly before `## Project conventions`                                                                                                                                                                                           |
| `docs/developer-guide/skill-ownership.json`                     | `investigate` and `investigation-method` added as `delegate` consumers of `effective-delivery`                                                                                                                                                                         |
| `docs/developer-guide/skill-ownership.md`                       | `effective-delivery` row (L84): both consumers before the semicolon, "diagnosis" added to the classification wording; audit/planning bullet (L101): `investigation-method.md` among the fallbacks, the override choice, and `investigate`'s Phase 3/4 as report schema |
| `docs/developer-guide/build-system.md`                          | Shared-fragment consumer enumerations, where they name ownership consumers, gain `investigation-method`                                                                                                                                                                |
| `docs/review/2026-08-31-architecture-and-consistency-review.md` | "Two corrections" lead-in updated to three; third correction bullet on §6.2 and P4; status-table rows for M-1 … M-6                                                                                                                                                    |
| `test/delegation-mandate-contract.test.mjs`                     | Contract assertions for the authority sentence, the override and the retained scorecard                                                                                                                                                                                |
| `build.mjs`                                                     | `CONTEXT_BUDGET_LINES` entry for `investigate` set to its measured size plus headroom; `fix` unchanged                                                                                                                                                                 |

## Implementation details

### Approach

0. **Prerequisite.** Confirm the review document's status table was brought up to date for P1, F-16 and §5. If
   not, stop and do that catch-up first as its own change.
1. **Recommend the owner in `investigate`.** Add `## Recommended skills` with the single bullet
   `effective-delivery` directly before `## Project conventions`. The existing `skill-discovery` include in
   Phase 1 honours it.
2. **Declare the relationships.** Add `investigate` and `investigation-method` as `delegate` consumers of
   `effective-delivery` in `skill-ownership.json`. In `skill-ownership.md`, put both before the semicolon of the
   `effective-delivery` row's consumer cell, add "diagnosis" to its classification wording, and extend the
   audit/planning bullet (L101) with `investigation-method.md` as a fallback source, the override choice, and the
   report-schema role of `investigate`'s Phase 3/4. Update `build-system.md`'s shared-fragment enumerations where
   they list ownership consumers by name.
3. **Rewrite the fragment by authority, not deletion.** In `investigation-method.md`:
   - after the framing paragraph, add the authority sentence: diagnostic depth — competing hypotheses, a
     discriminating reproduction, epistemic labels, outcome classes, intervention level — follows
     `effective-delivery` where it is available; its rules on returning the report in conversation, runtime
     directories, hypothesis ledgers, mandatory report paths and read-only stopping do not apply, because the
     embedding workflow's report path, wisdom file, routing and scope stay binding;
   - mark steps 1 and 4 as the baseline the skill deepens and the minimal fallback;
   - keep steps 2 and 3 and the "Diagnosis validation" scorecard unchanged, and do not move or reword the two
     pinned sentences.
4. **Contract tests.** In `test/delegation-mandate-contract.test.mjs`, next to the existing fragment assertions,
   assert that the fragment (a) names `effective-delivery` as the authority for diagnostic depth, (b) states that
   the embedding workflow's report path and wisdom file stay binding against the skill's rules, and (c) still
   carries Clarity, Verification and Context with the ≤ 10 % target. Prove each by mutation: delete the clause from
   a `cp` snapshot, confirm the test fails, restore from the snapshot — never with `git checkout --`.
5. **Measure and set the budget.** Run `node build.mjs`. `investigate` is expected at about 522–526, over its entry
   of 521, so the build fails until the entry is set to the measured core plus at most ten lines. Leave `fix` at 700.
6. **Correct the review document** in its status section:
   - change the "Two corrections" lead-in to three;
   - add a correction bullet: the §6.2 recommendation, repeated in P4, to move all six fragments did not survive
     comparison with the skills checkout at `f79397b`, with the one-line verdict per item from the table above and
     the two upstream rules that reject M-1 and M-6, each quoted with its qualifier;
   - add status-table rows: M-4 "implemented" citing the pull-request number; M-1, M-2, M-6 "withdrawn — stays in
     Effective Flow per the correction above"; M-3, M-5 "open — upstream contribution first". Keep the "Everything
     else | open" row last.

### Component structure

Not relevant.

### State management

Not relevant.

### API integration

Not relevant.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

### Edge cases

- **`effective-delivery` not installed, `skills.enabled: false`, or excluded:** steps 1 and 4 as the fallback, the
  always-active steps 2 and 3, and the unchanged scorecard keep both tools functional.
- **The skill says "return the report in the conversation":** `investigate` still writes
  `.effective-flow/investigation/…` and routes onward with that path, per the override.
- **The skill says investigation stops before implementation:** a `fix` run still writes its failing test and fixes,
  because the embedding workflow's scope is binding.
- **Skill outcome class "insufficient evidence":** maps onto `investigate`'s existing "further investigation needed"
  recommendation; no template change is required.

### Stop conditions

- **Drift:** before step 1, run `git diff 4321151 -- src/shared/investigation-method.md src/tools/investigate.md src/tools/fix.md build.mjs docs/developer-guide/skill-ownership.json docs/developer-guide/skill-ownership.md docs/developer-guide/build-system.md docs/review/2026-08-31-architecture-and-consistency-review.md`,
  and confirm the skills checkout still contains `skills/effective-delivery/references/investigation.md` reachable
  from `references/route-audit.md`. If that reference is gone or no longer covers the method, stop: the delegation
  premise is false.
- **Prerequisite missing:** if the status table still reads "Everything else | open" with P1, F-16 and §5 unrecorded,
  stop before step 6.
- **Pinned sentences:** if `test/delegation-mandate-contract.test.mjs`'s existing assertions fail after step 3,
  restore the pinned sentences verbatim rather than editing those assertions.
- **Growth bound:** the fragment may gain at most four lines, and the new `investigate` section is exactly a heading
  plus one bullet. Anything larger means the fragment is being rewritten rather than annotated; stop and cut back.

## Acceptance criteria

The completion condition is that all of the following hold together:

- [ ] `src/tools/investigate.md` contains `## Recommended skills` directly before `## Project conventions`, whose only
      bullet is `effective-delivery`.
- [ ] `skill-ownership.json` declares `investigate` and `investigation-method` as `delegate` consumers of
      `effective-delivery`; `skill-ownership.md`'s row names both; `node build.mjs` passes its ownership guards.
- [ ] `investigation-method.md` names `effective-delivery` as the authority for diagnostic depth, states that the
      embedding workflow's report path, wisdom file, routing and scope stay binding, keeps steps 2 and 3 active, and
      still carries the three scorecard criteria; the new contract assertions pass and each was proven by mutation.
- [ ] The existing assertions of `test/delegation-mandate-contract.test.mjs` still pass.
- [ ] The review document's lead-in reads three corrections, the new bullet references §6.2 and P4, and the status
      table carries one entry covering each of M-1 … M-6 with "Everything else" last.
- [ ] `investigate`'s entry equals its measured core plus at most ten lines; `fix` stays at 700.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` all exit 0.

## Validation plan

| Purpose                  | Command                                                 | Expected result                                      |
| ------------------------ | ------------------------------------------------------- | ---------------------------------------------------- |
| Formatting               | `pnpm agent:check`                                      | exit 0                                               |
| Contract tests           | `node --test test/delegation-mandate-contract.test.mjs` | exit 0, including the three new assertions           |
| Full suite               | `pnpm test`                                             | exit 0, including the ownership reconciliation tests |
| Ownership guards, budget | `node build.mjs`                                        | exit 0                                               |
| Distribution layout      | `pnpm test:distribution`                                | exit 0                                               |

Manual check: run `/effective-flow investigate "<a known surprising behavior>"` with `effective-delivery` installed
and confirm the run still writes its report under `.effective-flow/investigation/` and ends with exactly one
follow-up recommendation.

## Assumptions and open points

- Assumption: the skills checkout at `f79397b` is current enough for this decision; a newer upstream revision that
  removes `references/investigation.md` would reverse it.
- Out of scope, deliberately: any contribution to the skills repository, including the M-3 runtime-effect and
  squash-title rules and the M-5 naming-resolution rules; any change to M-1, M-2 or M-6; any change to `fix`'s
  phases.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         1 |    2 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    1 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         2 |    1 |

### Findings

Plan review of 2026-09-12, by an independent read-only reviewer against `origin/develop` at `4321151` and the skills
checkout at `f79397b`, applying the `effective-delivery` implementation-plan review checklist. Every finding was
incorporated.

- **Critical — Architecture — override not in runtime text.** The report-path resolution was recorded only in the
  developer guide, which no run reads; the skill's conflicting rule is three-sided (report in conversation, runtime
  directory, hypothesis ledger). Incorporated: the authority sentence in the fragment states the override for both
  embedding workflows, including `fix`'s scope; an acceptance criterion and a contract test cover it.
- **Important — Architecture — fallback labelling contradicted both tools.** Steps 2 and 3 are unconditional
  orchestration and user interaction. Incorporated: only steps 1 and 4 become baseline and fallback.
- **Important — Maintainability — review-document rows.** A landing commit is unknowable inside a squash-merged PR,
  the "Two corrections" lead-in would go stale, "withdrawn" was undefined, and P4 repeats §6.2. Incorporated: PR
  number, updated lead-in, defined wording, P4 referenced, "Everything else" kept last, and the status-table catch-up
  made a prerequisite.
- **Important — Maintainability — `fix` judgement entry.** Resetting `fix` from 700 was out of scope. Incorporated:
  `fix` stays at 700; only `investigate` is raised.
- **Important — Testability — no durable proof.** Incorporated: three contract assertions, each proven by mutation.
- **Important — Scope — Refactoring misstated a deliberate behavior change.** Incorporated: reclassified as Feature,
  with the #393 precedent noted.
- **Note — Architecture — fragment as consumer.** Incorporated: `investigation-method` added as a `delegate` consumer.
- **Note — Architecture — Phase 3/4 overlap.** Incorporated: recorded as the report schema in the plan and the guide.
- **Note — Maintainability — guide wording not machine-checked.** Incorporated: consumer placement, "diagnosis"
  wording, fallback list.
- **Note — Error cases — incomplete drift check.** Incorporated: `build.mjs`, `fix.md` and `build-system.md` added;
  section placement made exact.
- **Corrections to claims:** `worktree-safety.md:22–23`; the `route-docs.md` qualifier; M-3's coverage restated;
  `fix.md:75` for the heading; `build-lib.mjs` L730–802 for the reverse check; the review document's correction list
  is established practice rather than a stated rule; `build.mjs` did change in `4321151`. All corrected above.

## Open points

- No open points.
