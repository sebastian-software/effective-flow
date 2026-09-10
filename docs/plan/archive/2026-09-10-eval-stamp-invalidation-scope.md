# Narrow what invalidates a merge-gate eval round

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Refactoring (`effective-flow refactor`)

## Requirement

A merge-gate eval round is bound to a content digest over the files a run loads, and any change to
one of them invalidates every archived round of every scenario. Re-recording costs three scenarios ×
five rounds at roughly five minutes each, serialized because the sandbox path is machine-global —
about an hour and a half, each time.

On one branch that price was paid three times in two days: #408 added an eager fragment to what a
merge-gate run loads, #410 re-recorded the ten rounds it invalidated, the post-merge open-points
change invalidated them again, and a one-paragraph fix to a **report** line invalidated the fifteen
that replaced them.

The last of those is the one worth examining, because it cannot have changed what the rounds
observe. The assertions read exactly one artifact — the stub's call log, whose record schema is
pinned to `{seq, operation, apply, at, cwd}` (`test/merge-gate-eval.test.mjs:58`, `:255-266`) — and
the suite states its own principle in the same file: "Every assertion is therefore about what the
gate **did**, not about what it said" (`:19-23`). A change that only alters what the gate _says_ is
provably outside what any assertion can read, yet it invalidates all fifteen rounds.

**This plan does not propose widening or weakening the stamp.** The narrowing already happened and it
was correct: #406 replaced a digest over the whole built tree with one derived by following the
seeds' own load pointers, and the set is now 23 of the 87 paths the built portable skill holds. Both
directions of that membership are asserted, because both failures are silent — a set that lost a seed
keeps certifying a gate rewritten underneath it, and a set grown back to the whole tree forces
re-rounds that can produce no new information. The question here sits **inside** that narrowing: of
the files a run genuinely loads, does every byte of them belong in the identity?

## Architecture decisions

Deliberately deferred to the analysis this plan schedules. Two candidate directions are recorded
below as starting points, not as decisions, because choosing between them needs evidence this plan
does not yet have.

- **The conditional-pointer question is already open in the source and is the smaller half.**
  `shared/typography-rules.md` sits in the set only because `chat-language` reaches it through a
  `lazy-include` guarded by `when: the resolved chat language is de` — a branch neither scenario
  takes. The comment at `test/merge-gate-eval.test.mjs:166-178` records this as an open call in so
  many words. Excluding a pointer no round can follow is a narrowing of the same kind #406 performed,
  and it needs no new concept.
- **The prose-versus-rule question is the larger half and the riskier one.** It asks the digest to
  distinguish text that can change observed behaviour from text that cannot. That distinction is real
  for the report — the call log cannot record a sentence — but it is treacherous in general: an
  instruction's prose _is_ its behaviour in a skill whose runtime is a model reading Markdown, and a
  rule that guessed wrong in the permissive direction would leave rounds certifying a gate that had
  changed. Any mechanism here has to fail toward invalidating.

The relationship between the two matters for scoping: the first is a bounded correction with a
precedent, the second is a design question that may end in "no safe mechanism exists". They should
not be bundled into one change.

## Affected files

| File                                            | Description                                                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evals/merge-gate/_scaffold/build-identity.mjs` | Derives the hashed set by following load pointers; owns whatever narrowing this plan concludes.                                                               |
| `test/merge-gate-eval.test.mjs`                 | The two-directional membership assertion (`:191`-) and the `LOADED_BY_A_RUN` list; any narrowing changes what it pins and must keep both directions asserted. |
| `evals/merge-gate/README.md`                    | The invalidation-trigger paragraph and the cost paragraph state the current rule to the operator.                                                             |
| `docs/developer-guide/`                         | Only if the conclusion is a rule a contributor has to know before editing a fragment.                                                                         |

## Implementation details

### Approach

1. **Establish the actual cost distribution before changing anything.** Walk the branch history of
   the files in the current set and count how many past invalidations were behavioural and how many
   were prose-only. Three incidents are known from one branch; the question is whether that rate
   holds or whether those two days were unusual. If the honest answer is that behavioural changes
   dominate, this plan should end here with that recorded — the price would then be the layer working
   as designed, and no mechanism is worth building.
2. **Settle the conditional-pointer question first, on its own.** Decide whether a `lazy-include`
   whose `when:` condition no scenario satisfies belongs in the identity. Either outcome is
   defensible and both are cheap; what matters is that the answer is stated where the derivation
   lives rather than left as a comment.
3. **Only then take the prose-versus-rule question,** and take it as a question rather than as a task.
   State plainly what would have to be true for a mechanism to be safe: it must fail toward
   invalidating, it must be checkable by someone who did not write it, and it must not require the
   author of a fragment to classify their own edit — a self-declared "prose only" marker fails the
   third and is not a candidate.
4. **Re-record whatever the change invalidates,** by the procedure the README states, and treat that
   round as the change's own cost rather than as an afterthought.

### Edge cases

- **A narrowing that silently drops a seed** is the failure the two-directional assertion exists to
  catch; any change here keeps both directions or it is not shippable.
- **A conditional pointer whose condition a future scenario does take.** Excluding it today binds
  that scenario to an identity missing a file it loads. Whatever rule is chosen has to be derived
  from the scenario set rather than fixed once.
- **The change itself invalidates the rounds it is measured against,** so the re-record cannot be
  used as evidence that the new rule works. Any claim about the new rule needs an argument from the
  derivation, not from a green suite.

## Acceptance criteria

- [ ] The cost distribution from step 1 is recorded with counts, and it is stated explicitly whether
      it justifies any change at all.
- [ ] The conditional-pointer question has a stated answer in `build-identity.mjs`, replacing the
      open call in `test/merge-gate-eval.test.mjs:166-178`.
- [ ] The membership assertion still asserts both directions.
- [ ] If a prose-versus-rule mechanism is adopted, it fails toward invalidating and needs no
      self-classification by the editing author; if none is adopted, the reason is recorded.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution` pass, with any
      invalidated rounds re-recorded rather than re-stamped.

## Validation plan

- The CI sequence above.
- For any narrowing: show, from the derivation and not from a passing suite, which files leave the
  set and that no file a scenario loads leaves with them.
- Re-record the affected scenarios per `evals/merge-gate/README.md`, five rounds each, serialized.

## Assumptions and open points

- **Assumption:** the three incidents on the post-merge open-points branch are representative enough
  to justify the analysis in step 1. They may not be — that branch touched the gate's own sources
  repeatedly, which is unusual. Step 1 exists precisely to test this assumption rather than build on
  it.
- **Assumption:** the sandbox's serialization requirement stays. If rounds could run concurrently
  across scenarios the wall-clock cost would fall by roughly two thirds and the motivation for this
  plan would weaken considerably. That is a different change and may be the cheaper one.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    1 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    1 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    1 |

### Findings

- **Scope, important — the plan's original premise was wrong and is corrected here.** It was first
  framed as "the stamp hashes the whole built tree", which #406 had already fixed. Writing to that
  premise would have proposed a narrowing that exists. The corrected subject is narrower and the plan
  says so explicitly, including that the observed invalidations were correct.
- **Architecture, important — the two halves must not be bundled.** The conditional-pointer question
  has a precedent and a bounded answer; the prose-versus-rule question may have no safe answer. A
  single change carrying both would make the cheap correction hostage to the hard one.
- **Testability, important — the change cannot validate itself.** Re-recording after the change
  produces a green suite whatever the new rule does, because the rounds are re-recorded against it.
  Stated in the edge cases and in the validation plan.
- **Architecture, note — "prose cannot change behaviour" is true of the report and false in general.**
  In a skill whose runtime is a model reading Markdown, an instruction's wording is its behaviour.
  The plan carries that caveat rather than generalizing from the report case.
- **Error cases, note — a dropped seed is silent.** The existing two-directional assertion is the
  only thing that catches it, and the acceptance criteria keep it.
- **Maintainability, note — step 1 may end the plan.** That is a legitimate outcome and is stated as
  one, so the analysis is not pre-committed to shipping a mechanism.

## Open points

- No open points.
