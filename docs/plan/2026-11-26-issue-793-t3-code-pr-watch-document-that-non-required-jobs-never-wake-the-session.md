# T3 Code PR watch: document that non-required jobs never wake the session

**Plan status:** Not implemented
**Source:** effective-flow plan
**Recommended workflow:** Feature (`effective-flow build`)
**Issue:** #793

## Requirement

On T3 Code, `src/shared/host-pr-watch.md` makes the host own every pull-request wait. A wait is one
`watch_pull_request` call followed by the end of the turn, and line 22 lists the wake triggers:
failed checks, passed required checks, new comments or reviews, and conflicts. The fragment says
nothing about a CI job that is not a required check and is still running after the required checks
have passed, for example a temporary measurement job on a throwaway pull request.

The issue reports three effects. When such a job finishes after the required checks, no wake
follows. Polling is forbidden, so a run that should continue stalls until the user asks for its
status. The obvious workaround in this repository, making the required gate job wait for the
optional job through `needs`, breaks the workflow-contract guard on the gate's `needs`. And while
two required checks are pending, a wake for the first one to pass usually has nothing to act on.

Goal:

- The shipped T3 Code wait rules say that a passing non-required job never wakes the session. They
  name the hand-back as the supported way to wait for such a job. They treat a wake that reports
  only part of the required checks as an ordinary wake, and they say that a comment a job posts when
  it finishes is no wake path the rules rely on. The hand-back applies where no tool rule governs
  the wait; `merge-gate` and `iterate` keep their own wait rules.
- The maintainer guide for T3 acceptance runs describes the throwaway-branch `needs` workaround for
  this repository and names the guard failure it causes.

Workflow rationale: Feature. The main change is shipped product prose under `src/shared/`, which
`AGENTS.md` routes as product source. It adds new contract content to the T3 wait rules: the
non-required-job wake fact, a general hand-back for a wait that no tool rule governs, and the
classification of partial wakes. No shipped tool's wait behaviour changes; the known stalls in
`merge-gate` and `iterate` are named follow-ups. It does not correct a defect in existing
behaviour. The guide edit under `docs/developer-guide/` is a secondary documentation
change in the same delivery.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow, issue #793.
**Original outcome:** The shipped T3 wait rules state that a passing non-required job never wakes
the session. They name the hand-back as the supported wait where no tool rule governs the wait, and
they classify partial required-check wakes as ordinary wakes under the tools' own rules. No shipped
tool's wait behaviour changes, and the known `merge-gate` and `iterate` stalls are named follow-ups.
Maintainers have one documented, guard-aware way to make the gate wait for a measurement job on a
throwaway branch. The no-polling rule and every existing wake rule stay unchanged.
**Last evaluated attempt:** None.
**No-progress count:** 0
**Cumulative approach:** One short paragraph in the T3 section of `src/shared/host-pr-watch.md`,
one short section in `docs/developer-guide/t3-acceptance-runs.md`, and one contract test.
**Continuation decision:** None.

## Architecture decisions

- **The generic wake rules go into `src/shared/host-pr-watch.md`. The repository-specific gate
  workaround goes into `docs/developer-guide/t3-acceptance-runs.md`.** Line 22 of the fragment is
  the single owner of the T3 wake semantics. All six tools that use it on T3 Code load it lazily:
  `merge-gate`, `iterate`, `pr`, `capture`, `apply-issues` and `apply-review-remote`. Only
  `merge-gate` and top-level `iterate` wait. The `needs`
  workaround depends on this repository's `.github/workflows/ci.yml` gate job and on
  `test/workflow-contracts.test.mjs`. It does not belong in prose that every user project loads.
  The guide points to the fragment and does not restate its rules ("state a contract once").
  Decided by score (S-CLR).
- **Only the observed case becomes a rule.** The issue observed a passing non-required job. The
  fragment states that such a job never wakes the session. A failing one may wake it under the
  existing "failed checks" trigger, but no rule relies on that. Line 22 keeps its wording, so no
  unverified claim enters shipped prose. Decided by score (S-CLR).
- **A comment that a finishing job posts is not a wake path the rules rely on.** Line 22 lists new
  comments as a wake trigger. Nothing verified shows that it fires for a workflow-authored bot
  comment, and the unattended implementing run cannot run a live host check. The fragment says that
  such a comment may wake the session like any new comment, but no rule depends on it. Decided by
  score (S-CLR).
- **Only `merge-gate` and top-level `iterate` watch, and their own rules stay authoritative.**
  `pr`, `capture`, `apply-issues` and `apply-review-remote` load the fragment only for linking
  (`src/tools/pr.md:254`, `capture.md:91`, `apply-issues.md:397`, `apply-review-remote.md:182`).
  Only `merge-gate` (fragment line 139) and top-level `iterate` (line 181) call
  `watch_pull_request`. The new paragraph states the wake facts and the general hand-back for a
  wait that no tool rule governs. `merge-gate`'s first-suspension warning, its progress and
  unchanged wakes and its resume-time report-and-stop (lines 98–126, 139–144) stay unchanged, as do
  `iterate`'s unchanged wakes (lines 189–192). The partial-wake sentence names those rules as the
  ones that count such a wake. Decided by score (S-BAT).
- **The merge-gate first-suspension stall is a follow-up.** Under
  `mergeGate.requireAllChecks: true`, a first suspension whose pending set has only `required: false`
  checks still watches, and it prints only a "may not wake the gate" warning (lines 71–76,
  139–144). Report-and-stop applies only on a resume (lines 123–126), and a bot wait whose has-run
  signal is a non-required `.check` behaves the same way. With the new rule this is a known stall.
  Fixing it changes `merge-gate` behaviour, needs its own test and adds `merge-gate` eval debt, all
  outside this documentation issue. The same holds for the top-level `iterate` wait: only a
  configured check context can establish a reviewer's **running** state
  (`src/shared/review-bot-state.md:92`), such a bot check is normally not required, so its pass
  produces no wake and the wait has no warning. Wakes from required checks also count as unchanged
  and spend `iterate`'s cap of three. The implementing run names both as follow-ups in its delivery
  report and changes neither here. Decided by score (S-BAT).
- **A session outside these tools is reached only by the guide.** An ad-hoc session that watches a
  throwaway measurement pull request, as in the issue, does not load the fragment. The maintainer
  guide carries the pointer and the repository-specific workaround for it.
- **No `contextBudget` change.** Every host includes `host-pr-watch` through a ` ```lazy-include `,
  which `test/workflow-contracts.test.mjs` asserts (`eager: []`). The new text therefore does not
  change the always-loaded core of any tool. The issue's budget check reduces to an unchanged
  budget report.

## Affected files

| File                                         | Description                                                                                                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/host-pr-watch.md`                | Add one short paragraph to the T3 section directly after the wait rule (line 22): a passing non-required job never wakes; hand back to wait for one; partial required-check wakes are ordinary; a job-posted comment is not relied on |
| `docs/developer-guide/t3-acceptance-runs.md` | Add a short section after "Waiting and timing": waiting for a measurement job that is not required, with a pointer to the fragment, the throwaway-branch `needs` workaround and its expected guard failure                            |
| `test/workflow-contracts.test.mjs`           | Add one contract test next to the existing `host-pr-watch` T3-section tests, pinning that the T3 section states the non-required-job rule and the hand-back                                                                           |

## Implementation details

### Approach

1. **Fragment paragraph.** In `src/shared/host-pr-watch.md`, insert one bold-led paragraph (for
   example `**Checks that are not required.**`) directly after the paragraph at line 22 and before
   `**The tools.**`. Keep it to at most about eight lines at the fragment's 100-column wrap. It
   states:
   - A non-required check that passes never wakes the session. One that fails may wake it as a
     failed check, and a check of unstated requiredness may behave like a non-required one. No rule
     relies on either wake.
   - Where no tool rule below governs the wait, a run that must wait for such a job hands back to
     the user. It names the job, and an expected completion time only as an estimate stated with
     its basis from host data, never invented. The shipped prose carries no worked example. The
     ordinary unwatch-before-final-report rule applies, and polling stays forbidden.
   - A wake that reports only part of the required checks as passed is an ordinary wake,
     classified by the `merge-gate` and `iterate` wake rules below like any other. Name no wake
     class here, and do not restate the re-read and turn-end rule that line 22 and lines 139–140
     already own.
   - A comment that a job posts when it finishes may wake the session like any new comment, but no
     rule relies on it.
2. **Keep the guards green.** The new prose must not name `sleep`, `--watch`, `pr-checks-wait`,
   `Monitor` or `ScheduleWakeup` outside a negation in its own clause, which
   `test/workflow-contracts.test.mjs` enforces with its 40-character negation check. The simplest
   course is not to name them at all. It must name host tools unqualified, without an `mcp__`
   prefix. `watch_pull_request` may appear only in this fragment, which the new text satisfies.
   The new paragraph names no `sub-agent`/`subagent`, `fan-out` or capitalized `Explore`, because
   `test/model-tiers-contract.test.mjs` treats such a paragraph as a spawn candidate. The delegated
   case stays covered by line 22. If one is unavoidable, add an anchored `SPAWN_MENTION_ALLOWLIST`
   entry with its reason next to the four existing `host-pr-watch` entries.
3. **Leave the rest unchanged.** Line 22, the merge-gate caller's optional-check warning (lines
   139–144), and the resume and bounds rules stay as they are. The warning's "may not wake the gate"
   is softer than the new "never wakes", but it is not false. Hardening it, or making the first
   suspension report and stop, is the follow-up named under Architecture decisions.
4. **Guide section.** In `docs/developer-guide/t3-acceptance-runs.md`, add a section after
   "Waiting and timing", for example `## Waiting for a job that is not required`. It contains:
   - one sentence pointing to the T3 section of `src/shared/host-pr-watch.md` for the wake rules
     and the hand-back, without restating them;
   - the workaround, on a throwaway branch only and never on a branch meant to merge: add the
     measurement job to the `needs` of the required `build` job ("Format, test and build") in
     `.github/workflows/ci.yml` so the gate waits for it. `needs` works only within one workflow
     file, so the measurement job must be a job in `ci.yml`, and its actions follow the
     repository's commit-pinning rule;
   - the expected failure, named in the run's evidence: at minimum, the test "ci.yml gates the
     required job on every unit-test shard and the build checks" in
     `test/workflow-contracts.test.mjs` fails on its `needs` assertion. A `unit-tests` shard then
     fails long before the measurement job ends and may trigger an early failed-check wake, which
     usually has nothing to act on. The wake that matters is the later failure of the required
     "Format, test and build". The gate does not read the measurement job's result, so the outcome
     is read from that job's own log. Any additional red guard, for example
     `test/conflict-validation.test.mjs`'s expectation about `ci.yml` jobs, is recorded in the
     evidence as a deviation;
   - a note that a wake for the first required check to pass (for example `Shellcheck`, which
     usually finishes first) is an ordinary no-op wake in such runs.
5. **Contract test.** In `test/workflow-contracts.test.mjs`, next to the sleep/`--watch`
   prohibition test that uses `hostPrWatchT3Section()`, add one test with a leading
   `// Invariant:` comment, per `AGENTS.md` point 5. It asserts four things about the
   whitespace-collapsed T3 section:
   - it states that a non-required check that passes never wakes the session;
   - it names the hand-back;
   - the partial-wake sentence defers to the `merge-gate` and `iterate` rules;
   - it states that a comment a job posts may wake the session but that no rule relies on it.

   Match on short stable phrase pairs from the new paragraph, not on the whole paragraph.
6. Run the validation plan below. If the budget report of `node build.mjs` changes for any of the
   six lazy hosts, the eager-core assumption is wrong. Stop and report; do not raise a budget.

### Component structure

Not relevant: no code component changes. The change is prose plus one test.

### State management

Not relevant: no runtime state, record or helper is touched.

### API integration

Not relevant: the host tools and their call shape stay unchanged.

### Styling approach

Not relevant: Markdown only, formatted by `pnpm format` (oxfmt).

### Accessibility

Not relevant: no user interface.

### Edge cases

- **Merge-gate under `requireAllChecks: true`:** on a resume where every pending check is not
  required, lines 123–126 already end with report-and-stop. A first suspension on such a set still
  watches with the softer warning (lines 139–144). The new hand-back sentence does not govern
  either case. The first-suspension stall is the named follow-up.
- **Check of unstated requiredness:** with `requireAllChecks: false`, the merge-gate pending set
  includes such checks (lines 72–73). The new paragraph says that such a check may behave like a
  non-required one and that no rule relies on its wake. The behaviour change belongs to the same
  follow-up.
- **Partial wake inside merge-gate or iterate:** their progress and unchanged rules decide. The
  generic sentence defers explicitly, so a progress wake still re-suspends without consuming a round.
- **Ad-hoc session outside the six tools:** it never loads the fragment. The guide's pointer and
  workaround are what reach it.
- **`iterate` reviewer whose running signal is a non-required check:** its pass produces no wake,
  and required-check wakes spend the cap of three unchanged wakes. This is unchanged here and named
  as a follow-up.
- **Failing non-required job:** it may wake the session under "failed checks". The woken run decides
  from its fresh reads as line 22 already requires; nothing relies on that wake.
- **No known completion time:** the hand-back names the job only and states that no completion
  time is known. It never invents one.
- **Delegated sub-agent:** it never watches (line 22), so the hand-back rule concerns only the
  session that watches.
- **Hosts other than T3 Code:** the dispatch table stops them at line 14, so their behaviour does
  not change.

## Acceptance criteria

- [ ] The T3 section of `src/shared/host-pr-watch.md` contains one new paragraph, after the wait
      rule and before `**The tools.**`, stating all four points of Approach step 1. Line 22 is
      byte-for-byte unchanged.
- [ ] `docs/developer-guide/t3-acceptance-runs.md` contains the new section with the pointer, the
      throwaway-branch-only `needs` workaround with its `ci.yml` and pinning preconditions, and the
      named minimum expected guard failure with its possible early shard wake. It restates no
      fragment rule beyond naming the hand-back.
- [ ] `test/workflow-contracts.test.mjs` contains the new invariant-commented test, and it passes.
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution` pass in that
      order. The `contextBudget` values in `src/tools/*.md` are unchanged.
- [ ] `pnpm eval <suite> verify` (default report mode) exits 0 for `merge-gate`, `iterate`,
      `next-steps`, `build-context` and `focus`, and any freshness debt is reported as accepted
      debt. The documentation review finds no contradiction with fragment line 22, lines 98–126 or
      lines 189–192.

## Validation plan

- Run `node --test test/workflow-contracts.test.mjs` first to confirm the new test and the existing
  `host-pr-watch` guards: negation clauses, unqualified tool names, `watch_pull_request` only in
  the fragment, the lazy-only includes and the Linking section.
- Run CI's order: `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`.
- In the `node build.mjs` output, confirm that the "Always-loaded core (lines/budget)" rows of
  `merge-gate`, `iterate`, `pr`, `capture`, `apply-issues` and `apply-review-remote` are unchanged.
- Run `pnpm eval <suite> verify` for `merge-gate`, `iterate`, `next-steps`, `build-context` and
  `focus` (read-only). Report any freshness debt that the fragment edit creates as accepted debt
  under the pragmatic test and release policy. An integrity error is a failure.
- Documentation review: read the new paragraph against line 22 and the merge-gate and iterate resume
  rules, and confirm that it contradicts none of them.

## Assumptions and open points

- Verified: `host-pr-watch` has six lazy hosts and no eager host
  (`test/workflow-contracts.test.mjs`, `includeHostsOf('host-pr-watch')`). No `src/agents/*.md`
  file loads it.
- Verified: the required gate is the `build` job ("Format, test and build") with
  `needs: [unit-tests, checks]`, which `test/workflow-contracts.test.mjs` asserts with
  `assert.deepEqual(needs, ['unit-tests', 'checks'])`. `Shellcheck` is the other required job.
- Verified: no local host documentation describes `watch_pull_request` wake triggers beyond line 22
  of the fragment.
- Assumption: no eval suite's instrument hashes `src/shared/host-pr-watch.md` in a way that turns
  the edit into an integrity failure rather than freshness debt. The validation plan checks this.
- Assumption: a live T3 check of a failing non-required job and of a workflow-posted comment wake
  is outside this plan. A later acceptance run under `t3-acceptance-runs.md` can tighten the rules.
- Verified: only `merge-gate` and top-level `iterate` call `watch_pull_request`. The four other
  hosts load the fragment for linking only.
- Follow-up, not part of this plan: the `merge-gate` first suspension on a pending set of only
  `required: false` checks, or of checks of unstated requiredness, or on a bot whose has-run signal
  is a non-required `.check`, still watches and can stall. The top-level `iterate` wait on a
  reviewer whose running signal is a non-required check can stall the same way, or end early at
  its cap of three unchanged wakes. The implementing run names both as follow-ups in its delivery
  report.
- Deliberately not incorporated: mentioning, in the guide, an edit of the guard's expected `needs`
  on the throwaway branch to get a green gate. Decided by score (S-BAT).

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->
```json
[
  {
    "site": "S-CLR",
    "question": "Where should the new guidance land?",
    "options": [
      "Split: generic wake rules in host-pr-watch.md, repository-specific gate workaround in t3-acceptance-runs.md",
      "All in src/shared/host-pr-watch.md",
      "All in docs/developer-guide/t3-acceptance-runs.md"
    ],
    "scores": [
      {
        "label": "Split: generic wake rules in host-pr-watch.md, repository-specific gate workaround in t3-acceptance-runs.md",
        "score": 9,
        "reason": "host-pr-watch.md line 22 owns T3 wake semantics, so the generic rules belong there; the gate needs workaround depends on this repository's ci.yml and guard and belongs in the maintainer guide, which beats option 2 by keeping repo-specific detail out of shipped prose."
      },
      {
        "label": "All in src/shared/host-pr-watch.md",
        "score": 4,
        "reason": "The generic rules fit, but the throwaway-branch needs workaround and its expected guard failure would put a detail that only holds in this repository into shipped prose every user project loads."
      },
      {
        "label": "All in docs/developer-guide/t3-acceptance-runs.md",
        "score": 3,
        "reason": "Agents in user projects would never see the runtime wake behaviour, and restating it in the guide would create a second copy of the contract host-pr-watch.md line 22 owns."
      }
    ]
  },
  {
    "site": "S-CLR",
    "question": "What should the new paragraph state about a CI job that writes a PR comment when it finishes, as a way to get a wake?",
    "options": [
      "Not a relied-on wake path: such a comment may wake the session like any new comment, but the rules never depend on it",
      "Supported wake path, based on the existing new-comments trigger",
      "Verify live on a throwaway PR during implementation, then document the observed result"
    ],
    "scores": [
      {
        "label": "Not a relied-on wake path: such a comment may wake the session like any new comment, but the rules never depend on it",
        "score": 8,
        "reason": "It claims nothing unverified: the fragment lists new comments as a wake trigger but nothing shows it fires for bot-authored workflow comments, merge-gate already treats unrelated comments as unchanged wakes, and the unattended implementer can write it."
      },
      {
        "label": "Supported wake path, based on the existing new-comments trigger",
        "score": 2,
        "reason": "It ships an unverified guarantee in single-owner skill prose; whether the host wakes on comments from a bot such as github-actions[bot] is untested, so runs relying on it could hang silently."
      },
      {
        "label": "Verify live on a throwaway PR during implementation, then document the observed result",
        "score": 4,
        "reason": "It would give a real answer, but the unattended implementing workflow cannot run a live T3 acceptance run, so the plan would block or invite a made-up result unless the check is split into a separate manual step."
      }
    ]
  },
  {
    "site": "S-CLR",
    "question": "What should the new rule say about a non-required job that fails?",
    "options": [
      "Observed rule only: a passing non-required job never wakes; a failing one may wake, but no rule relies on it",
      "Per the issue: never wakes, pass or fail; narrow line 22 to failed required checks",
      "Leave line 22 unchanged and say nothing about the fail case"
    ],
    "scores": [
      {
        "label": "Observed rule only: a passing non-required job never wakes; a failing one may wake, but no rule relies on it",
        "score": 9,
        "reason": "Fits the evidence: only the pass case was observed, and line 22 already says failed checks wake. It hedges the unverified fail case, so no rule depends on it. It beats option 2 because it does not assert host behaviour nobody verified."
      },
      {
        "label": "Per the issue: never wakes, pass or fail; narrow line 22 to failed required checks",
        "score": 3,
        "reason": "It turns an unobserved fail case into shipped prose that contradicts line 22. Only a live T3 run could verify that, and the unattended workflow cannot do one. If a failing optional job does wake, the rule misleads runs."
      },
      {
        "label": "Leave line 22 unchanged and say nothing about the fail case",
        "score": 5,
        "reason": "It is accurate to the evidence and invents nothing. But the literal reading of line 22 (a failing optional job wakes) stays unqualified, and the reader cannot see that the fail case is unverified. The ambiguity the issue raised stays open."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How should the plan handle merge-gate's first suspension on a pending set of only non-required checks, now known to stall?",
    "options": [
      "Scope the hand-back to non-tool waits; keep merge-gate and iterate rules; file the first-suspension stall as follow-up",
      "Extend merge-gate: a first suspension on only non-required checks takes report-and-stop at once",
      "Only harden the merge-gate warning from may not wake to does not wake"
    ],
    "scores": [
      {
        "label": "Scope the hand-back to non-tool waits; keep merge-gate and iterate rules; file the first-suspension stall as follow-up",
        "score": 8,
        "reason": "Stays within #793's documentation scope, corrects the plan's 'matches' claim (true only on resumes), adds no merge-gate test or eval debt, and records the known stall as follow-up instead of hiding it. The 'may not wake' warning stays softer than the new 'never wakes' text."
      },
      {
        "label": "Extend merge-gate: a first suspension on only non-required checks takes report-and-stop at once",
        "score": 5,
        "reason": "Fixes the stall, but it changes merge-gate behaviour the issue did not ask for, needs its own test, adds merge-gate eval freshness debt, and must also cover bot waits on a non-required check. It belongs in its own follow-up."
      },
      {
        "label": "Only harden the merge-gate warning from may not wake to does not wake",
        "score": 3,
        "reason": "Edits merge-gate source and so still creates eval debt, but the gate still watches and stalls. It also leaves the plan's inaccurate edge-case claim in place."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "Should the guide also mention editing the guard's expected needs on the throwaway branch?",
    "options": [
      "Name the expected guard failure only, as the issue asks",
      "Also mention editing the guard's expected needs on the throwaway branch for a green gate"
    ],
    "scores": [
      {
        "label": "Name the expected guard failure only, as the issue asks",
        "score": 9,
        "reason": "This is what the issue asks for, and it touches only ci.yml. The other option means editing a guard test and the gate's result-loop assertions. Its green gate on a throwaway branch could also be mistaken for a mergeable state. Reading the measurement job's log is enough."
      },
      {
        "label": "Also mention editing the guard's expected needs on the throwaway branch for a green gate",
        "score": 3,
        "reason": "The green gate adds little for a measurement. It means editing a guard test, plus more edits because the same test asserts the gate's env-based result loop. It also goes beyond what the issue asks, and a green throwaway branch could be mistaken for mergeable."
      }
    ]
  }
]
```
<!-- effective-flow-scored-decisions:end -->

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    2 |
| Testability     |        0 |         0 |    3 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    4 |

### Findings

The gap analysis came before this review. Its findings were incorporated or decided by score:
- the watching tools were corrected to `merge-gate` and `iterate`;
- the first-suspension stall became a follow-up;
- the check of unstated requiredness was added;
- the guide's preconditions and the estimate basis were added;
- the deferral assertion was added to the test.

The internal review then reported these findings, all incorporated:

- **Scope, Important:** the Outcome checkpoint and the workflow rationale promised a hand-back that
  no shipped tool reaches. Both now state that no shipped tool's wait behaviour changes and that
  the known stalls are follow-ups.
- **Error cases, Important:** the top-level `iterate` wait stalls in the same way when a reviewer's
  running signal is a non-required check, and required-check wakes spend its cap. It is now named
  in the architecture decisions, the edge cases and the follow-up. `iterate` itself is not changed.
- **Testability, Note:** `test/model-tiers-contract.test.mjs` treats a paragraph that names
  `sub-agent`, `fan-out` or `Explore` as a spawn candidate. Approach step 2 now keeps the new
  paragraph free of those words, or requires an anchored allowlist entry.
- **Maintainability, Note:** the guide's estimate-labelling note was a second copy of a fragment
  rule, and it misread "Waiting and timing". It was removed from Approach step 4 and from the
  acceptance criteria.
- **Error cases, Note:** the guide stated the early shard failure wake as a fact. It now says the
  failure "may trigger" one, in line with the scored fail-case decision.
- **Error cases, Note:** the failure of the `needs` assertion is only the minimum expected guard
  failure. The guide now names the pinning rule and records any additional red guard as a
  deviation.
- **Maintainability, Note:** naming the wake classes in the partial-wake sentence made a second
  copy of the `merge-gate` and `iterate` classification. The sentence now defers to those rules
  without naming the classes.

#### Deep review (2026-11-26)

The deep plan review reported no Critical and no Important finding, and four Notes, all
incorporated:

- **Maintainability, Note:** the first architecture decision said that all six tools wait. It now
  says that six tools use the fragment and that only `merge-gate` and top-level `iterate` wait.
- **Testability, Note:** the contract test pinned three of the four required points. It now also
  pins the comment-wake statement, and it names the one neighbouring test it sits next to.
- **Maintainability, Note:** a length limit of five lines could not hold the required content.
  The limit is now about eight lines, and the worked estimate example stays out of shipped prose.
- **Testability, Note:** the eval verification and the documentation review were in the
  validation plan but not in the acceptance criteria. A fifth criterion now covers both.

## Open points

- No open points.
