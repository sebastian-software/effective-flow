# Name the harness timeout beside the t3-project capacity wait

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Documentation (`effective-flow docs`)
**Doc category:** developer-guide
**Target path:** docs/developer-guide/build-system.md
**Issue:** #794

## Requirement

Maintainers and agents run this repository's installs, checks and test suites through the shared
`t3-project exec` runner on T3 hosts. When the runner is at capacity, `exec` waits for admission
before the command starts. The agent harness's own command timeout (in Claude Code, the Bash
tool's foreground or background timeout) starts with the call, so it also covers that wait. When
it fires while `exec` is still waiting, the runner is interrupted. The result looks like a failed
validation, and the attempt has to be diagnosed from a log of admission-wait lines and then
repeated.

The runner's own guidance lives in `/opt/t3-project-runtime/INSTRUCTIONS.md`. That file is a
root-owned host file outside this repository, with no Git checkout of its own. It documents
`--max-wait` and its expiry (`INSTRUCTIONS.md:179-194`), and it says that wait plus run time can
exceed an agent's foreground timeout (`INSTRUCTIONS.md:196-201`). It does not say that the harness
timeout counts the capacity wait, or that `--max-wait` belongs below that timeout.

Goal of this plan: the repository-side change the issue names. Add one short paragraph to the
"Test environment prerequisites" section of `docs/developer-guide/build-system.md`. `AGENTS.md:35`
links every session to that section. The paragraph names `--max-wait` next to the harness timeout
and says that an interrupted call is no validation result. It defers the runner's flags, limits
and interrupted-call recovery to the runtime instructions and adds no second copy of the runner's
contract. The upstream change to `INSTRUCTIONS.md` is outside this repository and outside this
plan; it is handed off as described under "Architecture decisions".

Workflow rationale: Documentation. The change touches one developer guide under `docs/` and no
shipped prompt source (`src/**`), script, test or configuration. It changes no product behaviour.
`docs/` guides route as `documentation` (`AGENTS.md`, "Skill Markdown routes as product source").

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #794
**Original outcome:** `docs/developer-guide/build-system.md`, section `## Test environment prerequisites`, carries one added paragraph of exactly three sentences. It says that the harness command timeout counts from the start of the call and includes the runner's capacity wait. It sizes `--max-wait` so the harness timeout comfortably covers the longest allowed wait plus the run time, with full suites in the background. It says that an interrupted call is no validation result, and it defers flags, limits and recovery to `/opt/t3-project-runtime/INSTRUCTIONS.md`. The change adds lines only (zero deletions); the heading, its anchor and every other file stay unchanged. The upstream `INSTRUCTIONS.md` change is handed to the runtime owner in the commit message, which carries `Refs #794` and no closing keyword.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** fresh baseline: one in-place three-sentence paragraph in one existing developer guide
**Continuation decision:** none

## Architecture decisions

- **The paragraph goes into `## Test environment prerequisites` in
  `docs/developer-guide/build-system.md` (heading at line 102, section lines 102-112).** This is
  the location the issue names. It is also the section that `AGENTS.md:35` links to as
  `build-system.md#test-environment-prerequisites`. No `AGENTS.md` change follows. An `AGENTS.md`
  line is paid in every session (`AGENTS.md`, "Writing prompt text", point 1), and the runner
  timing applies only on T3 hosts.
- **Scope relative to the issue's verification: repository pointer only, upstream handed off
  (decided by score, see "Decided by score").** The place agents read before their first
  `t3-project` call is the host-owned `INSTRUCTIONS.md`. The managed block that
  `/opt/t3-project-runtime/merge-project-instructions.py:12-25` merges into the global
  `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` says "Read /opt/t3-project-runtime/INSTRUCTIONS.md
  before project tool commands". The repository paragraph meets the issue's placement
  verification only for readers who follow the `AGENTS.md:35` link; the plan states this
  openly. The handoff travels in the commit message, because the docs workflow supplies no
  pull-request body of its own and the `pr` tool derives a single commit's body from its message
  (installed `tools/pr.md`, body drafting). A multi-commit branch gets a drafted body that need
  not keep the sentence, so an acceptance criterion also requires it in the pull-request body.
  The commit message body therefore carries one
  sentence naming the remaining `INSTRUCTIONS.md` change for the runtime owner: its wait guidance
  (`INSTRUCTIONS.md:178-201`) should say that the caller's timeout includes the capacity wait and
  that `--max-wait` goes below it. The footer is `Refs #794`. No closing keyword appears anywhere
  in the message or the pull-request body, not even negated ("does not close #794"), because this
  repository's issue-closing automation matches the keyword regardless of negation.
- **The paragraph is a new paragraph after the existing one.** The current paragraph covers the
  readable-Git-checkout prerequisite and the preflight. The runner timing guidance is a separate
  prerequisite of the same validation run. The heading text stays exactly
  `## Test environment prerequisites`. Its slug is pinned in three places: `AGENTS.md:35`,
  `scripts/test-capabilities.mjs:23` and the assertion at `test/test-capabilities.test.mjs:110-113`.
- **No second copy of the runner's contract.** The paragraph names only what an agent in this
  repository must decide before its first `t3-project` call: its own harness timeout and
  `--max-wait` relative to each other. It also says how to treat an interrupted call in
  validation evidence. It restates no exit code, no `--max-wait` overrun allowance
  (`INSTRUCTIONS.md:184-188`), no weights, no direct-argv rule and no recovery step. In
  particular it does not say whether an interrupted call ran or may simply be repeated:
  `INSTRUCTIONS.md:171-176` requires `t3-project inspect` after the caller ends, and
  `INSTRUCTIONS.md:179-181` forbids aborting or repeating a waiting call. The
  validation-evidence wording ("no validation result") belongs to this repository, because the
  same section already owns the limited-evidence rule.
- **The existing `t3-project` mention at `docs/developer-guide/build-system.md:40`
  (`pnpm test:contracts` paragraph) stays unchanged.** It only says to use `t3-project` where the
  checkout requires it. The timing guidance has one home, the linked prerequisites section.
- **The target is an existing file, extended in place (decided by score, see "Decided by
  score").** The docs workflow asks about an existing target path (`tools/docs.md`, "clarify
  replacement or a new slug"). Under an autopilot caller that question is scored with only the
  options "replace the existing file" and "new slug" (`shared/scored-decisions.md`, row S-DSLG).
  For this plan the answer is "replace the existing file", and the replacement content is defined
  as the current `docs/developer-guide/build-system.md` unchanged plus the one new paragraph.
  "New slug" is wrong for this plan, because the paragraph must sit in the section that
  `AGENTS.md:35` links to. The zero-deletion acceptance check (`git diff --numstat`) proves that
  no existing line was rewritten. In an attended run the user confirms the same in-place
  extension at that gate. The plan `docs/plan/archive/2026-09-28-prompt-writing-rule.md` set the
  same target path for an in-place addition. No `docs/developer-guide/README.md` change follows,
  because no document is added.
- **No host file is written.** The implementing run writes nothing under `/opt` and adds no T3
  configuration or runner wrapper to the repository.

## Affected files

| File                                   | Description                                                                                                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/developer-guide/build-system.md` | In `## Test environment prerequisites`, add one new three-sentence paragraph after the existing paragraph, with the content fixed under "Approach" step 2. Heading and all other text stay unchanged. |

## Implementation details

### Approach

1. Read `docs/developer-guide/build-system.md` lines 100-114. On a T3 host, also read
   `/opt/t3-project-runtime/INSTRUCTIONS.md` lines 171-201, so the paragraph matches the runner's
   current flag name and does not contradict its recovery rule. If the host file is absent (a
   non-T3 host), rely on the facts recorded in this plan. Do not search for another copy.
2. After the existing paragraph (ending "…instead of bypassing the preflight with another full-suite
   run.") and before `## Placeholder and directive syntax`, insert one blank line and one
   paragraph of exactly three sentences, with this content in this order:
   1. When validation runs through the shared `t3-project` runner, the harness's own command
      timeout (for example the Claude Code Bash tool's foreground or background timeout) counts
      from the start of the call and includes the runner's capacity wait, not only the run.
   2. Set `--max-wait` so that the harness timeout still comfortably covers the longest wait it
      allows, including the overrun the runtime instructions document, plus the command's run
      time, and run a full suite in the background with a timeout sized the same way.
   3. A call the harness interrupts is no validation result; before repeating it, follow the
      runner's instructions in `/opt/t3-project-runtime/INSTRUCTIONS.md`, which own its flags,
      limits and recovery.

   The wording above is the content contract. The docs writer may polish its phrasing, but must
   keep three sentences, keep every named element, and add nothing. Use the guide's existing
   English prose style, mark only literal tokens as inline code (`t3-project`, `--max-wait`, the
   path), and add no list, table or sub-heading. Name no T3 Code tool or MCP tool spelling, because
   `test/session-contracts.test.mjs:1066-1100` bans retired T3 tool and butler strings across this
   guide.

3. Run `pnpm format` on the changed file only if `pnpm agent:check` reports it. The file is under
   oxfmt's scope (`.oxfmtrc.json` ignores only `dist`, `node_modules`, `.sf-plugin`).
4. Deliver the change as one implementation commit. Its message body carries the one-sentence
   upstream handoff for the runtime owner (the wait guidance of
   `/opt/t3-project-runtime/INSTRUCTIONS.md`, see "Architecture decisions") and the footer
   `Refs #794`, with no closing keyword anywhere, negated or not. If the `pr` tool drafts the
   pull-request body from more than one commit (for example after a draft plan pull request), the
   body must still contain that handoff sentence; the caller supplies it as part of the
   description when needed.

### Edge cases

- **Admitted late in the wait.** A call admitted near the end of its `--max-wait` can still be
  killed during its run if the harness timeout covers only the wait. Sentence 2 therefore sizes
  the harness timeout against wait plus run time. The runner can overrun `--max-wait` by the
  remainder of a started cleanup plus up to 150 seconds per storage refresh, with at most one
  refresh per 300 seconds of capacity wait (`INSTRUCTIONS.md:184-189`), so a 600-second
  `--max-wait` can run to roughly 900 seconds or more. Sentence 2 therefore names "the overrun the
  runtime instructions document" without restating the figures, and the implementer sizes its own
  validation timeouts with that overrun in mind.
- **Exit-code wording.** The runner can also return 75 from the project command itself, and 125
  has several other meanings (`INSTRUCTIONS.md:69`, `:93-94`, `:192-194`). The paragraph names no
  exit code, so it cannot narrow or contradict those rules.
- **Interrupted call.** After a harness kill the agent cannot tell from its own output whether
  admission happened just before the interrupt, and the request may still hold its reservation
  (`INSTRUCTIONS.md:171-176`). The paragraph therefore claims neither that the call never ran nor
  that it may simply be retried; it routes recovery to the runtime instructions.
- **Non-T3 hosts.** A contributor without `t3-project` is not affected. The paragraph opens with
  its condition ("when validation runs through the shared `t3-project` runner").
- **Other harnesses.** The paragraph says "the harness's own command timeout" and names the
  Claude Code Bash tool only as an example, so Codex and other harnesses are covered.
- **Heading anchor.** Any edit to the heading line breaks three pinned references; the heading is
  not touched.

## Acceptance criteria

- [ ] `## Test environment prerequisites` in `docs/developer-guide/build-system.md` holds its
      original paragraph unchanged plus exactly one new paragraph of exactly three sentences. That
      paragraph contains `--max-wait`, the phrase "capacity wait", a statement that the harness
      timeout counts from the start of the call, a background-timeout statement for full suites
      covering wait plus run time, a statement that an interrupted call is no validation result,
      and the path `/opt/t3-project-runtime/INSTRUCTIONS.md`. Check by reading the section.
- [ ] The section names no exit code: `sed -n '/^## Test environment prerequisites/,/^## Placeholder/p' docs/developer-guide/build-system.md | grep -cE '\b(75|125)\b'` prints `0`.
- [ ] `git diff --numstat <resolved base ref>...HEAD -- . ':(exclude)docs/plan'` prints exactly
      one line, for `docs/developer-guide/build-system.md`, with an added-lines count above 0 and a
      deleted-lines count of `0`. Zero deletions prove that the heading line and every existing
      line are unchanged, and the single line proves that no `AGENTS.md`,
      `scripts/test-capabilities.mjs`, `test/`, `src/` or configuration file changed.
      `git diff --name-only <resolved base ref>...HEAD -- docs/plan` lists only this plan's own
      path under `docs/plan/` or `docs/plan/archive/` (the plan archival in the handback commit).
- [ ] `pnpm agent:check` passes, and `pnpm test test/session-contracts.test.mjs test/workflow-contracts.test.mjs test/focus-contracts.test.mjs test/build-lib.test.mjs test/test-capabilities.test.mjs` passes (preflight included), run directly or through `t3-project` where the host requires it.
- [ ] The commit message body contains the one-sentence upstream handoff for
      `/opt/t3-project-runtime/INSTRUCTIONS.md` and the footer `Refs #794`. The pull-request body
      contains the same handoff sentence. `parseClosingIssueNumbers` from
      `.github/scripts/close-develop-issues.mjs` (the repository's issue-closing automation, which
      also matches forms such as `Closes: #794` and `fixes#794`) returns no `794` for the commit
      message or the pull-request body.

## Validation plan

- Read the edited section and check every element of the first acceptance criterion.
- Run the exit-code `grep` from the acceptance criteria.
- Run the two `git diff` checks from the acceptance criteria against the resolved base ref.
- Run `pnpm agent:check` and `pnpm test` with the five test files that read this guide or pin its
  anchor (listed in the acceptance criteria). Through `t3-project`, pass the command as direct
  argv (`-- pnpm test <files>`); the `pnpm test` prefix may draw the full-suite weight, so use a
  background call. Size the harness timeout per the new paragraph. An interrupted call is no
  validation result; follow the runtime instructions before repeating it. For this docs-only
  change, `pnpm agent:check` plus this targeted set satisfies the docs workflow's pre-commit gate;
  the full suite stays with pull-request CI.
- Check the commit message with `parseClosingIssueNumbers` and for the handoff sentence before
  pushing, and the pull-request body after it is drafted, per the last acceptance criterion.
- The issue's runner-side verification (on a saturated runner, a call with `--max-wait` below the
  harness timeout ends with the runner's capacity-wait expiry) tests the external runner, not this
  repository. It is not part of this plan's completion condition. An implementer may record it as
  an observation if a saturated runner happens to occur, but must not provoke saturation.

## Assumptions and open points

- `/opt/t3-project-runtime/INSTRUCTIONS.md` is host-owned and outside this repository (verified:
  root-owned, no `.git` in `/opt/t3-project-runtime`). `merge-project-instructions.py` in the same
  directory only merges a managed pointer block into each user's global `CLAUDE.md` or
  `AGENTS.md` (`merge-project-instructions.py:2`, `:12-25`); it does not produce
  `INSTRUCTIONS.md`. Who maintains `INSTRUCTIONS.md` is not verified here. The upstream sentence
  reaches its owner through the commit message, the pull-request body, this plan once archived,
  and issue #794, which `Refs` keeps open.
- Whether #794 is closed after merge, moved, or kept open for the upstream change is the
  maintainer's tracker decision. Delivery uses `Refs #794`, so merging does not close it by
  keyword. This does not block implementation.
- Assumption: adding a paragraph inside the section breaks no test. Verified readers of
  `build-system.md` pin unrelated passages (`test/workflow-contracts.test.mjs:15866`, `:18919`,
  `test/focus-contracts.test.mjs:391`, `test/build-lib.test.mjs:6805`) or the section anchor
  (`test/test-capabilities.test.mjs:110-113`). `test/session-contracts.test.mjs:1066-1100` bans
  retired T3 tool and butler strings across the whole guide; the paragraph names none. The
  validation plan runs all five files. `test/plan-publication.test.mjs:2762` and
  `test/plan-publication-git.test.mjs:3350` also name `docs/developer-guide/build-system.md`, but
  as fixture paths, not as readers of its content; they are not affected.
- The README is not affected: `README.md.src` has no T3 mention, and the release's developer-guide
  link rewrite only touches links.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[
  {
    "site": "S-BAT",
    "question": "The repository-side pointer reaches agents only via the AGENTS.md:35 link, while the place agents actually read before their first t3-project call is the host-owned INSTRUCTIONS.md. How should the plan scope its completion relative to the issue's verification and the upstream half?",
    "options": [
      "Repository pointer only, upstream handed off",
      "Repository pointer plus AGENTS.md link wording",
      "Completion depends on upstream change"
    ],
    "escape": [],
    "stop": null,
    "scores": [
      {
        "label": "Repository pointer only, upstream handed off",
        "score": 8,
        "reason": "Matches the plan's single build-system.md paragraph with no every-session cost, states the partial placement coverage honestly, and hands the INSTRUCTIONS.md sentence to the runtime owner."
      },
      {
        "label": "Repository pointer plus AGENTS.md link wording",
        "score": 5,
        "reason": "Workable, but adds an every-session cost for T3-only runner timing and still does not reach the place agents read before their first t3-project call."
      },
      {
        "label": "Completion depends on upstream change",
        "score": 2,
        "reason": "Ties completion to a root-owned host file outside the repository that no run here can write."
      }
    ]
  },
  {
    "site": "S-BAT",
    "question": "How should the plan make the docs workflow's existing-target question resolve safely for an in-place one-paragraph addition?",
    "options": [
      "Map to replace with zero-deletion guard",
      "Attended-only implementation",
      "Extend the docs tool first"
    ],
    "escape": [],
    "stop": null,
    "scores": [
      {
        "label": "Map to replace with zero-deletion guard",
        "score": 9,
        "reason": "It works with the shipped S-DSLG options and a git diff --numstat zero-deletion check on the one file catches any real overwrite; its edge is that it neither blocks autopilot nor waits on an unrelated tool change."
      },
      {
        "label": "Attended-only implementation",
        "score": 4,
        "reason": "Safe, but it adds a user gate and blocks autopilot for a three-sentence paragraph when a checkable mapping already settles the question."
      },
      {
        "label": "Extend the docs tool first",
        "score": 3,
        "reason": "Making this small docs fix wait on a separate src/tools/docs.md and scored-decisions.md change is scope creep."
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
| Error cases     |        0 |         3 |    1 |
| Testability     |        0 |         3 |    3 |
| Scope           |        0 |         2 |    1 |
| Maintainability |        0 |         0 |    3 |

### Findings

Gap analysis (Phase 4):

- Error cases, Important: the planned third sentence said an interrupted queued call "never ran"
  and "is retried". That contradicts the runner's recovery rule (`inspect` after the caller ends,
  no repeat of a waiting call). Incorporated: the sentence now says only that an interrupted call
  is no validation result and routes recovery to the runtime instructions.
- Testability, Important: the planned content held six sentences against a three-sentence cap.
  Incorporated: the plan fixes the three-sentence content contract.
- Scope, Important: the issue's placement verification points at the host-owned runtime
  instructions, which this repository cannot write. Decided by score: repository pointer only,
  with the upstream sentence handed off and `Refs #794`.
- Maintainability, Note: the docs workflow's existing-target question could stop the
  implementing run. Incorporated together with the review finding below.
- Testability, Note: the guard in `test/session-contracts.test.mjs` was missing, and the
  focused anchor test does not read the prose. Incorporated: the validation set covers all five
  test files that read the guide or pin its anchor.
- Maintainability, Note: `merge-project-instructions.py` was wrongly described as producing
  `INSTRUCTIONS.md`. Incorporated: corrected to the verified managed pointer block.

Internal review (Phase 6):

- Error cases, Important: the scored existing-target question in the docs workflow offers only
  "replace the existing file" and "new slug", so an unattended run could overwrite the guide or
  pick the wrong target. Decided by score: map it to "replace" defined as the current file plus
  the paragraph, guarded by a zero-deletion `git diff --numstat` check.
- Scope, Important: nothing carried the plan's upstream handoff into the pull-request body.
  Incorporated: the commit message body carries the handoff sentence and `Refs #794`, with an
  acceptance check against any closing keyword, including negated forms.
- Error cases, Note: setting `--max-wait` below the timeout alone does not protect a call that is
  admitted late in its wait. Incorporated: sentence 2 sizes the timeout against wait plus run
  time.
- Testability, Note: bare `node --test` skipped the preflight, and the pre-commit gate was
  ambiguous. Incorporated: `pnpm test <files>` as direct argv, and the gate is stated as satisfied
  by `pnpm agent:check` plus the targeted set.
- Testability, Note: `git diff --stat` did not prove the existing lines unchanged.
  Incorporated: a zero-deletion `git diff --numstat` criterion.
- Maintainability, Note: two further tests name the guide. Incorporated: recorded as fixture
  paths, not content readers.

Deep plan review (Phase 6b):

- Testability, Important: the zero-deletion `git diff --numstat` check required exactly one
  changed path, but the handback commit also archives this plan. Incorporated: the check
  excludes `docs/plan`, and a second check allows only this plan's own path there.
- Testability, Important: the closing-keyword patterns missed forms the repository's
  issue-closing automation closes on (`Closes: #794`, `fixes#794`). Incorporated: the check uses
  `parseClosingIssueNumbers` from `.github/scripts/close-develop-issues.mjs`.
- Error cases, Important: the plan understated how far the runner can overrun `--max-wait`.
  Incorporated: the edge case states the documented overrun, and sentence 2 sizes the harness
  timeout including that overrun without restating figures.
- Scope, Note: the handoff relied on a single-commit pull-request body. Incorporated: the
  pull-request body must also carry the handoff sentence, and the carriers are named
  consistently.

## Open points

- No open points.

## Test results

- Section check: `## Test environment prerequisites` keeps its original paragraph and gains one
  three-sentence paragraph with `--max-wait`, "capacity wait", the call-start timeout statement,
  the background full-suite timeout statement, the "no validation result" statement and
  `/opt/t3-project-runtime/INSTRUCTIONS.md`.
- Exit-code check: the section `grep -cE '\b(75|125)\b'` prints `0`.
- `git diff --numstat origin/develop -- . ':(exclude)docs/plan'`: one line,
  `docs/developer-guide/build-system.md`, 2 added, 0 deleted.
- `pnpm agent:check` through `t3-project` (environment `effective-flow-node24`): passed. A first
  run flagged this plan file's formatting, fixed with `pnpm exec oxfmt` on this file only.
- `pnpm test test/session-contracts.test.mjs test/workflow-contracts.test.mjs test/focus-contracts.test.mjs test/build-lib.test.mjs test/test-capabilities.test.mjs`
  through `t3-project`, preflight included: 1076 tests, 1075 passed, 0 failed, 1 skipped.
- The full suite stays with pull-request CI, as the validation plan states.

## Review findings

- The docs workflow has no review phase; no findings were raised during implementation.
