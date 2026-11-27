# Replace the t3-project runner guidance in build-system.md with neutral wording

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Documentation (`effective-flow docs`)
**Doc category:** developer-guide
**Target path:** docs/developer-guide/build-system.md
**Issue:** #830

## Requirement

`docs/developer-guide/build-system.md` names one privately hosted execution environment in two
places. `AGENTS.md:35` links every session to its "Test environment prerequisites" section.

- Lines 40–41, in the `pnpm test:contracts` paragraph (lines 38–41), one sentence wrapped
  across the line break: "Use `t3-project` where required by the checkout."
- Line 114, one unwrapped paragraph at the end of "Test environment prerequisites", added by
  `8a85a034` (#801, Refs #794). It names the shared `t3-project` runner, its `--max-wait` flag
  and the absolute host path `/opt/t3-project-runtime/INSTRUCTIONS.md`, and it restates part of
  that runner's own contract.

Contributors on other hosts get instructions they cannot apply. The restated contract can drift
from the runner's own instructions, and the passage invites more host-specific guidance. The issue
states that the runner's instructions now carry the full contract and that agents on that host
read them through the host's global agent instructions, so the repository pointer is no longer
needed there.

Goal: replace both passages with neutral wording. The wording keeps the general lesson and names
no runner, flag or host path. The general lesson is that the harness timeout includes any admission
wait, and that an interrupted call is no validation result. The section heading and its anchor
`#test-environment-prerequisites` stay unchanged.

Workflow rationale: Documentation. The change touches one developer-guide file. It changes no
product source under `src/`, no test, no build file and no shipped behaviour.

## Outcome checkpoint

**Primary source:** github.com/sebastian-software/effective-flow issue #830
**Original outcome:** `grep -rn "t3-project\|/opt/t3-project-runtime\|--max-wait" docs/developer-guide/build-system.md AGENTS.md src/` finds nothing. "Test environment prerequisites" still states that the harness timeout includes the admission wait and that an interrupted call is no validation result. Its heading and anchor stay unchanged. `docs/developer-guide/focus-host-acceptance.md`, `docs/plan/archive/` and capacity-refusal handling stay out of scope.
**Last evaluated attempt:** none
**No-progress count:** 0
**Cumulative approach:** fresh baseline: wording-only edit of two passages in one developer-guide file
**Continuation decision:** none

## Architecture decisions

- **Neutral wording, no relocation.** The general rule stays in "Test environment prerequisites"
  because `AGENTS.md:35` sends every session there. It is not moved to another file, and the
  runner-specific text is not moved elsewhere in the repository. The execution environment's own
  documentation owns its flags, limits and recovery.
- **Heading and anchor are fixed.** `## Test environment prerequisites` (line 102) has no explicit
  HTML anchor; its slug is the anchor. Three places depend on it: `AGENTS.md:35`, the preflight
  pointer `GIT_PREREQUISITES_POINTER` in `scripts/test-capabilities.mjs:22-23`, and its assertion
  in `test/test-capabilities.test.mjs:108-112`. The heading text therefore stays byte-identical.
- **Line 40 uses the issue's sentence verbatim:** "Run these commands through the execution
  environment the checkout requires, if any." The plural has referents: the paragraph names
  `pnpm test:contracts`, "the full local suite" (line 39) and `pnpm test` (line 41). Like the old
  sentence, the new one covers all of them, not only the focused check.
- **The target is an existing file, edited in place.** The docs workflow asks about an existing
  target path ("clarify replacement or a new slug", `src/tools/docs.md:216`). Under an autopilot
  caller that question is scored with the options "replace the existing file" and "new slug"
  (`src/shared/scored-decisions.md`, row S-DSLG). For this plan the answer is "replace the existing
  file". The replacement content is the current `docs/developer-guide/build-system.md` with only
  the two named passages replaced. "New slug" is wrong, because `AGENTS.md:35` and
  `GIT_PREREQUISITES_POINTER` (`scripts/test-capabilities.mjs:22-23`) pin this path and anchor. In
  an attended run the user confirms the same answer at that gate. No
  `docs/developer-guide/README.md` change follows, because no document is added.
- **Line 114 uses the issue's suggested text verbatim (decided by score, see "Decided by
  score").** It keeps the four general facts:
  - the harness's command timeout counts from the start of the call and includes any admission
    wait;
  - use the environment's own wait limit and size the harness timeout to cover it plus the run
    time, also for a full suite run in the background;
  - an interrupted call is no validation result;
  - the environment's own documentation owns its flags, limits and recovery.
    It drops the product name, the flag, the host path and the Claude Code Bash tool example. The
    current paragraph also covers a documented overrun ("including the overrun the runtime
    instructions document"), which was the substance of #794. The new text does not restate it. The
    issue names that relation as copied runner contract that can drift. The paragraph's last
    sentence already defers limits and recovery, the overrun included, to the environment's own
    documentation, which owns that contract.
- **No new guard test.** The acceptance grep is a one-time check. A permanent test against
  host-specific strings in developer docs would be new policy that the issue does not ask for (see
  Assumptions).

## Affected files

| File                                   | Description                                                                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/developer-guide/build-system.md` | Replace the line-40 sentence and the line-114 paragraph with neutral wording; leave the heading, the Git paragraph and all other text unchanged |

## Implementation details

### Approach

1. In the `pnpm test:contracts` paragraph (lines 38–41), replace exactly the sentence
   "Use `t3-project` where required by the checkout.", which wraps from line 40 to line 41 and
   must be matched across that line break, with "Run these commands through the
   execution environment the checkout requires, if any." The sentences before and after it stay
   unchanged.
   Rewrap the paragraph at the file's usual width of about 100 columns.
2. In "Test environment prerequisites", replace the whole line-114 paragraph with the issue's
   suggested text, unchanged:

   > When validation runs through an execution environment that can queue or limit commands, the
   > harness's own command timeout counts from the start of the call and includes any wait for
   > admission, not only the run. Use the environment's own limit on that wait, and size the
   > harness timeout so it covers that limit plus the command's run time; a full suite runs in the
   > background with a timeout sized the same way. A call the harness interrupts is no validation
   > result. Before repeating it, follow the execution environment's own documentation, which owns
   > its flags, limits and recovery.

   Wrap it at about 100 columns like the Git paragraph above it (lines 104–112). Add no fenced
   code and no new heading.

3. Leave the heading on line 102 and the Git prerequisites paragraph (lines 104–112) unchanged.
4. Change no other file. `AGENTS.md` and `src/` already have no hits for the acceptance grep.

### Component structure

Not relevant: a prose-only documentation edit.

### State management

Not relevant: no runtime state is involved.

### API integration

Not relevant: no interface changes.

### Styling approach

Not relevant beyond Markdown formatting: `oxfmt` (`pnpm agent:check`) checks Markdown, and the
new prose follows the surrounding wrapping.

### Accessibility

Not relevant: no user interface.

### Edge cases

- The new text must not contain the strings `test/session-contracts.test.mjs:1075` forbids for
  this file: `hooks.Stop`, `codex app-server`, `session-title.json`, `session-title-hook.json`,
  the `t3_thread_update` tool spellings, and anything matching `/butler/i`. The proposed wording
  contains none of them.
- Other tests read other passages of this file: `test/workflow-contracts.test.mjs:16113` and
  `:19166`, `test/build-lib.test.mjs:6805-6814` and `test/focus-contracts.test.mjs:391`. None of
  those passages lies in the edited lines, so the edit must not touch them.
- `docs/developer-guide/focus-host-acceptance.md:169` and `:284` still mention `t3-project`. They
  are historical acceptance evidence and stay unchanged; the acceptance grep does not cover them.
- Developer-guide wording is not rewritten on release. `scripts/deliver-docs.mjs` only rewrites
  links from delivered user docs and the README, and no delivered document links to this anchor.
  The edit therefore needs no release follow-up.

## Acceptance criteria

- [ ] `grep -rn "t3-project\|/opt/t3-project-runtime\|--max-wait" docs/developer-guide/build-system.md AGENTS.md src/`,
      run from the checkout root, prints nothing and exits 1.
- [ ] The section text from
      `awk '/^## Test environment prerequisites$/{f=1;next} /^## /{f=0} f' docs/developer-guide/build-system.md | tr -s ' \n' ' '`
      contains both `includes any wait for admission` and
      `A call the harness interrupts is no validation result.` (each checked with `grep -F`).
- [ ] The heading line `## Test environment prerequisites` is byte-identical to the base, and
      `AGENTS.md:35` still links to `docs/developer-guide/build-system.md#test-environment-prerequisites`.
- [ ] The paragraph text from
      `awk '/^For changes to Claude Code setup allow rules/{f=1} f&&/^$/{exit} f' docs/developer-guide/build-system.md | tr -s ' \n' ' '`
      contains `Run these commands through the execution environment the checkout requires, if any.`
      and no longer contains ``Use `t3-project` where required by the checkout.``
- [ ] Neither `git diff --name-only $(git merge-base origin/develop HEAD)` nor
      `git status --porcelain --untracked-files=all` lists a path outside this set:
      `docs/developer-guide/build-system.md`,
      `docs/plan/2026-11-27-issue-830-replace-the-t3-project-runner-guidance-in-build-system-md-with-neutral-wording.md`
      and the same file name under `docs/plan/archive/`.
- [ ] `pnpm agent:check` passes, and
      `pnpm test test/session-contracts.test.mjs test/workflow-contracts.test.mjs test/focus-contracts.test.mjs test/build-lib.test.mjs test/test-capabilities.test.mjs`
      passes, with the test preflight running first.

## Validation plan

- Run the acceptance grep from the checkout root and confirm it prints nothing.
- Compare the heading line against the base with `git diff` and confirm it is unchanged.
- Run the two `awk … | tr -s ' \n' ' '` extractions from the acceptance criteria and check the
  required substrings with `grep -F`, so a correct rewrap cannot fail a literal check.
- Run the scope check: `git diff --name-only` against the merge base with `origin/develop`, plus
  `git status --porcelain --untracked-files=all` for untracked files.
- Run `pnpm agent:check`, then the focused `pnpm test` command from the acceptance criteria. Four
  of its files read this guide's prose: `test/session-contracts.test.mjs`,
  `test/workflow-contracts.test.mjs`, `test/focus-contracts.test.mjs` and
  `test/build-lib.test.mjs`. `test/test-capabilities.test.mjs` pins the anchor pointer string.
  `pnpm test` runs the test preflight before them. Run both commands through the execution
  environment the checkout requires, if any.
- Leave the full `pnpm test`, `node build.mjs` and `pnpm test:distribution` to pull-request CI.
  The change touches no distribution source, and AGENTS.md requires CI's local order only after
  distribution sources change.

## Assumptions and open points

- Verified: the acceptance grep currently hits only `build-system.md:40` and `:114`; `AGENTS.md`
  and `src/` have no hits.
- Verified: no test, build guard, workflow or eval instrument asserts on `t3-project`,
  `--max-wait` or `/opt/t3-project-runtime`. The anchor is used only as a string pointer, in
  `scripts/test-capabilities.mjs` and its test.
- Verified: `docs/developer-guide/` stays on `develop` and its prose is not rewritten at release.
- Assumption, taken from the issue: the runner's own instructions now cover the full contract,
  and agents on that host read them before their first runner call. This repository cannot verify
  it, and the plan does not depend on it.
- Assumption: no regression test pins the absence of host-specific strings. That would be new
  repository policy beyond this issue; a later issue can propose it.
- Assumption: oxfmt does not rewrap prose, so the implementer wraps the paragraphs by hand to
  match the surrounding text.

### Decided by score

<!-- effective-flow-scored-decisions:begin v1 -->

```json
[{"site":"S-BAT","question":"Should the replacement for the line-114 paragraph widen the issue's suggested clause \"covers that limit plus the command's run time\" to also cover a documented overrun?","options":["Keep the overrun widening","Issue text verbatim","Weaker documented-overrun phrase","Decide later"],"escape":["Decide later"],"stop":[],"scores":[{"label":"Keep the overrun widening","score":4,"reason":"Issue #830 calls the overrun relation copied runner contract that can drift, so adding it back and pinning it in an acceptance criterion keeps the part the issue removes."},{"label":"Issue text verbatim","score":8,"reason":"It meets the issue's goal and the state-once rule: the general lesson stays, and the last sentence already leaves limits and recovery, overrun included, to the environment's own documentation."},{"label":"Weaker documented-overrun phrase","score":5,"reason":"It is neutral and harmless, but it still keeps part of the runner contract and adds a departure the PR must explain, without making the text safer than the issue's wording."}]}]
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
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         0 |    4 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        0 |         0 |    2 |

### Findings

- Scope, Important: the line-40 replacement narrowed the issue's "Run these commands" to "Run
  the check" on the claim that the paragraph names only one command. It also names the full
  local suite and `pnpm test`. Incorporated: the issue's sentence is used verbatim, and Approach
  step 1 and the matching acceptance criterion follow it.
- Testability, Note: the focused tests omitted three files that read this guide's prose and
  described `test/test-capabilities.test.mjs` as reading the file, though it only pins the anchor
  pointer string. Incorporated: the acceptance criterion and the Validation plan run all five
  files and describe each one's role.
- Scope, Note: the plan widened the issue's suggested line-114 text with a documented-overrun
  clause that the issue names as copied runner contract. Decided by score ("Issue text
  verbatim"): the suggested text is used unchanged, and the acceptance criterion no longer pins
  the overrun substring.
- Maintainability, Note: the quoted replacement paragraph had one unwrapped line of about 150
  columns. Incorporated: the quote is rewrapped at about 100 columns.
- Testability, Note (deep review): the whitespace-collapsed checks named no command that cuts
  out the section or paragraph. Incorporated: acceptance criteria 2 and 4 name exact `awk` and
  `tr` extractions, checked with `grep -F`.
- Testability, Note (deep review): the scope check used `git diff` against the merge base, which
  lists no untracked file, and its allowed set was loose. Incorporated: the check adds
  `git status --porcelain --untracked-files=all` and names the three allowed paths exactly.
- Testability, Note (deep review): plain `node --test` skipped the repository's test preflight.
  Incorporated: the focused run uses `pnpm test <files>`, so the preflight runs first.
- Maintainability, Note (deep review): the line-40 sentence wraps across lines 40–41, so a
  literal one-line match would miss it. Incorporated: Requirement and Approach step 1 say so.

## Open points

- No open points.

## Test results

- Acceptance grep for `t3-project`, `/opt/t3-project-runtime` and `--max-wait` over
  `docs/developer-guide/build-system.md`, `AGENTS.md` and `src/`: no output, exit 1.
- Section and paragraph extractions (`awk … | tr -s ' \n' ' '` with `grep -F`): the required
  strings are present, and the old sentence is gone.
- The heading `## Test environment prerequisites` is byte-identical to the base, and `AGENTS.md:35`
  still links to its anchor.
- Scope check: only `docs/developer-guide/build-system.md` and this plan file changed.
- `pnpm test test/session-contracts.test.mjs test/workflow-contracts.test.mjs test/focus-contracts.test.mjs test/build-lib.test.mjs test/test-capabilities.test.mjs`
  (preflight first): 1079 tests, 1078 pass, 0 fail, 1 skipped.
- `pnpm agent:check`: the first run flagged only this plan file's formatting. The file was
  formatted with oxfmt, and the check was run again.

## Review findings

- The docs workflow has no review phase. The pull request review covers the change.
