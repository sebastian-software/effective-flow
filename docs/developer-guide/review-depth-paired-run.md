# Review depth paired run (2026-11-24)

Point-in-time record of the manual before/after paired run that the last acceptance criterion of
#650 requires. It compares the skill before package B (#656) with the skill after package A (#660)
on the same scoped examples, host and model. It counts phases, ask rounds and reviewer starts; it
infers no savings from finding counts. It is one run per arm, not a five-run eval round, and supports
no claim beyond the examples below.

## Setup

| Item            | Recorded value                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Run date        | 2026-11-24                                                                                                                                       |
| Host            | T3 Code, one fresh top-level Claude session per arm                                                                                              |
| Model           | `claude-opus-5-5` for the orchestrator and every worker (inherited; per-spawn tiers not applied, identical in both arms)                         |
| Before          | `61fbb376`, the parent of #656, portable build                                                                                                   |
| After           | `406413d4`, the merge of #660, portable build; the two commits in between (#658, #659) touch only `merge-gate` and `cleanup`                     |
| Targets         | Throwaway local Git repositories (a word-count CLI, a bearer-token HTTP API), no remote, `.effective-flow/` git-ignored                          |
| Scripted user   | One fixed answer script for every arm: the recommended or first option, decline optional deep review, approve local commits, decline push and PR |
| Recording rules | Every arm logged each ask round, each worker start with its scope, every incorporation pass, floor record and re-check report verbatim           |

The first attempts at examples 1 and 2 ran on targets that did not ignore `.effective-flow/`; the
build stopped at the runtime-state guard, or ran without worktree and diff baseline. Those attempts
are excluded, and every arm below ran on a corrected target.

## Example 1: small reversible change (`plan`, then `build`)

Request: add a `--lines` option to the word-count CLI. Each arm planned with its own skill version
and then built its own plan.

| Metric                                        | Before | After |
| --------------------------------------------- | -----: | ----: |
| Ask rounds (plan)                             |      3 |     2 |
| Questions asked (plan)                        |      5 |     2 |
| Reviewer starts (plan)                        |      2 |     3 |
| Reviewer starts after an incorporation (plan) |      1 |     2 |
| Full re-review passes after incorporation     |      0 |     1 |
| Ask rounds (build)                            |      0 |     0 |
| Reviewer starts (build)                       |      1 |     1 |
| Build findings, incorporation passes          |   0, 0 |  0, 0 |
| Outcome                                       |   DONE |  DONE |

After: the gap analysis worked its notes in without asking, and its one decision went to the single
batch round; the deep-review offer came after that round. The batch answer added a CLI test criterion.
The ladder classified the Acceptance criteria section as a floor hit (public API and cross-module
contracts: the criterion pins stdout, usage text and exit codes) together with triggers (a) and (d),
so it ran one full Phase 6 judgment. That judgment found 2 Important and 2 Note findings, all worked
in without a second round.

Result: fewer ask rounds and questions, as intended. Reviewer starts after the incorporation did not
fall; they rose by one, because the batch answer itself triggered the floor.

## Example 2: security-sensitive correction (`build` with a seeded finding)

Request: accept either `API_TOKEN` or the optional `API_TOKEN_NEXT` in `src/auth.mjs`. Both arms
built the same plan, produced once and copied byte-for-byte. After the first implementation review,
the same finding was seeded in both arms as a Node.js reviewer finding: the bearer token is hashed
without a length bound (Important, Security). Its correction touches the authentication guard.

| Metric                                        |                   Before |                                           After |
| --------------------------------------------- | -----------------------: | ----------------------------------------------: |
| Ask rounds                                    |                        1 |                                               0 |
| Reviewer starts                               |                        2 |                                               3 |
| Reviewer starts after the incorporation pass  |                        1 |                                               2 |
| Scoped re-checks                              |                        0 |                                               1 |
| Full passes after incorporation               | 1, whole cumulative diff | 1, `src/auth.mjs` and `test/auth.test.mjs` only |
| Floor fired                                   |           not in version |                                             yes |
| Reviewer of the full pass                     |        `nodejs-reviewer` |                               `nodejs-reviewer` |
| Later correction (documentation of the limit) |        no further review |     floor record `none` for both paths, no pass |
| Outcome                                       |                     DONE |                                            DONE |

The before arm's one ask round confirmed worktree delivery for an untracked plan; it is unrelated to
review depth.

After, floor classification record of the incorporation pass, as logged:

| Path                 | Classification | Boundary                                                                    |
| -------------------- | -------------- | --------------------------------------------------------------------------- |
| `src/auth.mjs`       | hit            | security, authentication and authorization (edits the `isAuthorized` guard) |
| `test/auth.test.mjs` | none           | —                                                                           |

The scoped re-check reported the three parts: changed areas (both paths), the seeded finding verified
as resolved with evidence, and no open evidence. It also raised one new Note, an undocumented limit for
configured tokens. The full pass confirmed the fix and added one Note, closed below the admission threshold. Both
arms fixed the seeded finding and the documentation Note.

Result: the security-sensitive correction kept independent scrutiny: the floor fired, the routed
Node.js reviewer ran a full pass, and the later comment-only correction was classified and needed no
pass. The full pass covered two paths instead of the whole cumulative diff, but the scoped re-check
ran on the same two paths as well.

## `fix` on an authentication path

A first form of example 2 used `fix` for a case-sensitivity bug in `src/auth.mjs`. Neither version
started a qualitative reviewer: for a Node.js-only change, `fix` Phase 4 starts only the validator.
With no findings there is no incorporation pass, so the after version's floor had nothing to classify.
This matches `src/tools/fix.md` as shipped. Both arms recorded the latent fail-open bypass as a
residual finding without fixing it.

## Observations for follow-up

1. **Ladder floor on CLI features.** In a feature that adds a CLI option, an acceptance-criteria
   answer almost always names public behaviour, so the planning ladder's (b) escalates to a full
   judgment even for a small reversible change. Example 1 shows the effect.
2. **Re-check and full pass on the same paths.** When the triggering paths cover every changed area,
   the scoped re-check and the triggered full pass review the same files. Example 2 ran both.
3. **No independent review for a `fix` on a floor path without findings.** The floor applies only to
   corrections after an incorporation pass; a `fix` whose own change touches authentication gets no
   qualitative reviewer when its bucket has none.

## Limits

- One run per arm. Model variance can change finding counts and therefore which triggers fire.
- The scripted user answers questions mechanically; a human answer can change what the batch round
  reopens.
- Workers inherited the orchestrator's model instead of the per-spawn tier, in both arms.
- Example 2 depends on a seeded finding, as the acceptance criterion allows.
