# Suggest setup for unconfigured automatic reviewers

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)

## Requirement

`effective-flow merge-gate` should continue to wait for, trigger, and assess only the automatic
reviewers recorded in the Effective Flow project-setup ADR. A gate run cannot assume that every
installed review tool has started or already produced pull-request output, so discovery must not
become a new merge precondition.

When the gate observes high-confidence automatic-reviewer activity that is not fully represented
by the effectively resolved `mergeGate.bots` configuration, its final chat report should contain a
non-blocking advisory. A wholly absent reviewer needs its login added; an existing reviewer whose
effective `.check` is absent needs only that context added. The advisory should name only the
reviewer evidence the run actually established and show the existing setup path: run
`effective-flow setup`, choose Guided, open Advanced settings, select Block 9 (`mergeGate`), add or
select the reviewer login, preserve or set a distinctive trigger only when the reviewer needs one,
and copy the exact check context from a pull request's checks list after manually confirming that it
belongs to this reviewer.

This is changed user-visible workflow behavior and therefore a Feature. It does not add a new
configuration key, make `merge-gate` a configuration writer, or broaden the set of reviewers that
can block the current run.

### Verified baseline

- Planning evidence was gathered on 2026-08-25 from the canonical source checkout at `05c4733`.
  The in-scope source, test, and user-guide files were clean; two unrelated untracked plan files in
  that checkout were left untouched. This detached planning checkout is at `24004ee` and contains
  the generated portable payload, so implementation must take place in the canonical `src/` tree
  on a current `develop` checkout.
- `src/tools/merge-gate.md` reads pull-request status, review threads, comments, and submitted
  reviews fresh. Phase 1 already distinguishes bot-typed authors even when they are absent from
  `mergeGate.bots`; Phase 3 deliberately processes only configured reviewers.
- `src/shared/review-bot-state.md` owns state observation for configured reviewers and is shared
  with `iterate`. It matches configured logins safely across provider spellings and resolves
  `.check` against normalized `checks[].name`. It is not the owner of a merge-gate-only advisory.
- `src/scripts/remote-tracker-core.mjs` already normalizes checks to name, status, conclusion, URL,
  and required-state fields, but does not expose enough producer identity to distinguish every
  arbitrary CI check from a code-review integration. No helper change is needed for the
  conservative reviewer-activity signal in this plan.
- `src/tools/setup.md` is already the sole writer of the project-setup ADR and already asks for
  `mergeGate.bots`, each reviewer's trigger, and optional `.check` value in Guided → Advanced →
  Block 9. There is no one-shot setup flag for this update.
- Phase 6 of `src/tools/merge-gate.md` owns the chat summary. Its next-step block must remain the
  literal final report element.
- `docs/user-guide/configuration.md` still says that Greptile publishes no check, while the setup
  source, repository ADR, and the correction introduced by commit `11e6339` establish the
  `Greptile Review` context. The guide is stale at that point.

## Architecture decisions

### Discovery is advisory, never implicit configuration

The run records an unconfigured-reviewer candidate only from structured review activity whose
normalized author is bot-typed, such as an authored review thread or submitted review. A top-level
bot comment by itself and an arbitrary unconfigured check-run name are insufficient: CI, coverage,
deployment, and dependency bots use those surfaces too, and recommending them as reviewers could
make later gate runs wait, trigger, or block on tools that do not review code.

The signal is intentionally conservative. Missing a silent reviewer preserves today's behavior;
inventing a reviewer changes future merge policy. The advisory should say that the exact `.check`
value comes from the pull request's checks list instead of guessing a mapping that the normalized
provider data cannot prove.

The deep interactive review selected this reviewer-activity contract explicitly. It deliberately
does not claim generic automatic-check discovery: a silent reviewer and a tool that writes only a
top-level or sticky summary comment may remain undiscovered, including a no-finding recensor run.
This accepted limitation avoids a maintained vendor registry, heuristic name matching, and the
provider/helper expansion required for stronger check provenance.

### Compare against effective configuration semantics

Classify every candidate through the existing resolved `mergeGate.bots` list and “Matching a
configured login” semantics, including the one trailing `[bot]` normalization, legacy per-key
`prReview.*` fallback, and collapsed duplicate entries:

1. No effective reviewer login exists: advise adding `mergeGate.bots`, an optional distinctive
   trigger when supported, and a manually confirmed exact `.check` context.
2. The effective reviewer login exists but its effective `.check` is absent: advise adding only
   a manually confirmed `.check`; preserve the login and any trigger already recorded.
3. The effective reviewer and `.check` both exist: suppress the advisory.

Do not create a second login-normalization rule or inspect only the literal current-namespace table
rows.

### Accumulate evidence across fresh reads

Retain and de-duplicate candidates in the run's existing wisdom record as fresh reads occur. A bot
may appear in an early round and disappear from the final response after a new commit; the advisory
describes what the run observed, not only the last snapshot. De-duplicate provider spellings of the
same bot and retain compact provenance sufficient to explain the suggestion without reproducing
untrusted review bodies.

### Preserve the final-report contract

Render one advisory section after the normal merge result and linked-issue reporting, immediately
before the mandatory next-step block. This is the latest legal position: it satisfies the requested
“at the end” behavior while keeping next steps as the literal last element. When no candidate
exists, emit nothing. The advisory never posts to the pull request and never changes a merge result.

### Reuse setup rather than adding a mutation path

The hint uses the host-rendered `effective-flow setup` invocation and names the existing Guided →
Advanced settings → Block 9 path. `merge-gate` remains read-only with respect to the ADR; no direct
write, setup flag, or new configuration schema is introduced.

## Affected files

| File                               | Description                                                                                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/merge-gate.md`          | Define the conservative candidate signal, accumulate and de-duplicate observations, suppress already configured reviewers, and add the final non-blocking setup advisory before next steps. |
| `test/workflow-contracts.test.mjs` | Add contract coverage for evidence boundaries, effective configuration matching, de-duplication, report ordering, setup guidance, and the absence of any new gate/config-write behavior.    |
| `docs/user-guide/tools-deliver.md` | Explain when the advisory appears, why it does not affect the current merge, and how to follow the setup route.                                                                             |
| `docs/user-guide/configuration.md` | Document the advisory beside `mergeGate.bots`/`.check` and correct the stale Greptile check-context statement.                                                                              |

`src/shared/review-bot-state.md`, `src/scripts/remote-tracker-core.mjs`,
`test/remote-tracker.test.mjs`, and `src/tools/setup.md` are explicitly out of scope unless
implementation evidence disproves the verified contracts above. Generated `dist/` and portable
payload files are rebuilt, never edited directly.

## Implementation details

### Approach

1. In `src/tools/merge-gate.md`, add a narrowly named advisory-observation contract near the wisdom
   record. On each fresh read that already supplies review threads and submitted reviews, collect
   bot-typed reviewer logins from those review surfaces without reading their bodies as
   instructions.
2. Resolve each candidate against the effective configured reviewer set using the existing
   matching, legacy-fallback, and collapse rules. Retain whether the reviewer login is absent, the
   login exists but `.check` is absent, or both are present. Suppress only the fully configured
   state. Canonicalize and de-duplicate the remaining candidates, and retain compact evidence that
   does not reproduce untrusted review bodies.
3. Keep candidate collection outside Phase 3 and every Phase-4 merge precondition. It must not
   create a bot round, trigger, wait, retry, configuration write, or blocking condition in the
   current run.
4. Extend Phase 6 with a final conditional advisory that lists each candidate once and prints the
   host-rendered `effective-flow setup` route: Guided → Advanced settings → Block 9 (`mergeGate`) →
   add or select `mergeGate.bots` → preserve or set a distinctive per-reviewer `.trigger` only when
   supported → copy the exact `.check` context only after confirming it in a pull request's checks
   list.
   If the current pull request reports no checks, direct the user to a recent pull request reviewed
   by the same tool instead of inventing a context. State explicitly that setup, not merge-gate,
   writes the ADR and that the user should omit `.check` only when the reviewer publishes none.
5. Add focused prose-contract tests in `test/workflow-contracts.test.mjs`. Slice the candidate rule
   and Phase 6 independently so nearby edge-case prose cannot satisfy a deleted behavior. Pin the
   conservative surfaces, configured-reviewer suppression, one-trailing-`[bot]` reuse,
   cross-round de-duplication, non-blocking character, exact setup path, and placement immediately
   before the unchanged next-step emission.
6. Update `docs/user-guide/tools-deliver.md` and `docs/user-guide/configuration.md` in the
   repository's configured English. Keep the schema unchanged and replace the stale claim about
   Greptile with the verified `Greptile Review` example.
7. Rebuild all delivery targets from `src/` and review the generated diff only as build evidence.
   Do not hand-edit generated output.

### Edge cases

- The same bot appears as `name` and `name[bot]` across GraphQL and REST surfaces: report one
  candidate, using the established bot-typed suffix rule.
- A reviewer is configured only through legacy `prReview.*` rows or a collapsed spelling: suppress
  the advisory because the effective run configuration already represents it.
- A bot appears in several rounds or on both review surfaces: retain one candidate with compact
  evidence, not one notice per occurrence.
- A bot writes only a top-level status comment, or a check name appears without reviewer authorship:
  do not recommend it. The provider envelope cannot prove that it is a code-review tool.
- `checksReported` is false but structured bot-review activity exists: retain the reviewer
  candidate, report that no check context was observable on this pull request, and direct the user
  to inspect a recent reviewed pull request during setup. Never invent the `.check` value.
- Author identity is absent, or an observer-only path never reaches the review reads: do not invent
  a candidate.
- The observed check is pending, successful, or failed: advisory eligibility depends on the
  reviewer evidence and missing configuration, not on the check outcome.
- The human-comment guard or another precondition blocks the run: still print the advisory at the
  end because it is diagnostic, not a success-only message.
- Several distinct reviewer candidates appear: group them in one final advisory and show the setup
  path once.

## Acceptance criteria

- [ ] Given qualifying evidence for a reviewer whose login does not match the effective
      `mergeGate.bots` configuration, where qualifying evidence is a bot-typed submitted review or
      bot-authored review thread, Phase 6 emits exactly one advisory to add that login, preserve or
      set an optional distinctive trigger when supported, and manually confirm the exact `.check`
      context, even when the evidence was observed in multiple rounds or under both supported login
      spellings.
- [ ] Given a bot-typed submitted review or bot-authored review thread for a reviewer whose
      effective login exists but whose effective `.check` is absent, Phase 6 emits exactly one
      advisory to preserve the existing login and trigger and add only a manually confirmed exact
      `.check` context.
- [ ] The advisory contains the host-rendered `effective-flow setup` invocation and the complete
      Guided → Advanced settings → Block 9 (`mergeGate`) route, including `mergeGate.bots`, the
      optional per-reviewer trigger, and the instruction to copy only an exact, manually confirmed
      `.check` context from a pull request reviewed by that tool.
- [ ] A reviewer whose effective login and `.check` are both represented through current rows,
      legacy fallback, or collapsed bot-login spellings produces no advisory.
- [ ] A normal CI/build/deploy check name, a dependency/coverage bot's top-level comment, or missing
      bot authorship produces no automatic-reviewer advisory.
- [ ] When high-confidence reviewer activity exists but `checksReported` is false, the reviewer
      advisory still appears, names no invented `.check` value, and sends the user to a recent pull
      request reviewed by the same tool for the exact context.
- [ ] The advisory remains chat-only and informational: it adds no Phase-3 reviewer round, Phase-4
      precondition, wait, trigger, merge block, ADR mutation, or pull-request comment.
- [ ] The advisory is the final conditional summary item immediately before the unchanged
      next-step block, and the next-step block remains the literal final report element.
- [ ] The user guides describe the same behavior and setup route, and no longer claim that Greptile
      lacks a check context.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs`, and `pnpm test:distribution` pass in the
      order required by `AGENTS.md`.

Together these criteria define one completion condition: merge-gate reports every high-confidence
automatic reviewer it actually observed whose reviewer or `.check` configuration is incomplete,
once and without changing the current gate, and gives a tested setup route for completing that
reviewer's configuration for future gates.

## Validation plan

| Purpose                             | Command                  | Expected result                                                                                    |
| ----------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------- |
| Formatting and repository contracts | `pnpm agent:check`       | Exit 0; source and documentation formatting contracts pass without writes.                         |
| Focused and regression tests        | `pnpm test`              | Exit 0; new merge-gate advisory contracts and all existing unit tests pass.                        |
| Source-to-distribution build        | `node build.mjs`         | Exit 0; all native and portable targets render the setup invocation and report ordering correctly. |
| Isolated delivery smoke test        | `pnpm test:distribution` | Exit 0; the rebuilt distribution remains installable and complete.                                 |

Before implementation, compare the canonical source checkout with `05c4733` and re-read the named
sections if they changed. Stop and revise this plan if the remote helper begins exposing reliable
review-tool producer identity, setup gains a direct targeted update mode, or the next-step ordering
contract changes; each would invalidate a deliberate architecture decision above.

## Test results

**Date:** 2026-08-25

| Check                    | Result                                                                         |
| ------------------------ | ------------------------------------------------------------------------------ |
| `pnpm agent:check`       | Passed; all 300 checked files are correctly formatted.                         |
| `pnpm test`              | Passed; 719 tests passed with no failures.                                     |
| `node build.mjs`         | Passed; Claude, Codex, and portable distribution targets rebuilt successfully. |
| `pnpm test:distribution` | Passed; the isolated offline distribution smoke checks completed successfully. |

The final validation reported no warnings, skipped prerequisites, timeouts, generated tracked
changes, or remaining evidence gaps.

## Review findings

**Date:** 2026-08-25
**Reviewer:** `effective-flow-code-validator`

### Summary

| Status                 | Count |
| ---------------------- | ----: |
| Fixed                  |     2 |
| Open / Not implemented |     0 |

The review found one Important and one Note finding, both Low complexity. The implementation now
uses the exact normalized thread and review author paths, requires `submittedAt` for submitted-review
evidence, and tests those predicates plus every applicable fresh-read hook. The independent
correction review found no residual findings.

## Assumptions and open points

- Assumption: showing the existing interactive setup navigation satisfies the requested “how to add
  it” guidance; adding a new one-shot setup argument is out of scope.
- No blocking open points remain.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    0 |

### Findings

- **Important — incorporated:** The draft derived candidates from structured review activity but
  also suppressed every advisory when the pull request reported no checks. The plan now preserves
  the reviewer candidate in that case, forbids an invented `.check` value, and routes the user to a
  recent reviewed pull request for the exact context.
- **Critical — incorporated by user decision:** The normalized check list exposes no producer
  identity. The deep review selected conservative bot-review activity as the discovery contract:
  bot-typed submitted reviews and review threads qualify; bare check names and top-level comments
  do not. The plan now states the accepted silent/comment-only detection gap and never claims that a
  check context belongs to the reviewer without manual confirmation.
- **Important — incorporated:** Candidate handling now distinguishes a missing reviewer login from
  an existing login with a missing `.check`, and focused acceptance cases cover both outcomes.
- **Important — incorporated:** Trigger guidance is now explicitly optional and preserves an
  existing value when only `.check` is missing.

## Open points

- No open points.
