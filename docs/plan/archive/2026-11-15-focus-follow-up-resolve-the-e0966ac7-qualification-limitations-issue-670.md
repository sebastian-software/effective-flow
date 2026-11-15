# Focus follow-up: resolve the e0966ac7 qualification limitations (issue 670)

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Bugfix (`effective-flow fix`)

## Requirement

Issue #670 follows up #663. The follow-up requalification on candidate `e0966ac7` (#664) passed 14
of the 16 checklist items. It recorded two owner-accepted limitations (F2 and F12), one host-rendering
finding (the offer numbering in the T3 UI) and one untested host context (a global Codex
`AGENTS.md`). Each one needs a decision. The owner made all four decisions on 2026-11-15:

1. **Idle report after a snapshot (F2): option A.** The snapshot whose offer starts the loop is not
   part of the loop. The first tick reports an idle target every time. Today
   `src/shared/focus-follow-up.md` (lines 177–180, "Judging and reporting") treats the idle target as
   reported when "an assistant message of this loop reported it after the target's last change".
   It leaves open whether the opt-in snapshot counts. The two observers read it differently: `O`
   counted the snapshot three times, `O2` did not. Earlier records and the checklist expect the
   report on the first tick.
2. **Cap not reached (F12): option B.** The cap is a flat 24 ticks for every offered interval, and
   the 24-hour clock rule goes away. The cap tick was never reached on `e0966ac7`: the 5-minute loop
   compacted after 33 ticks, and `024bcb2a` compacted after 21 and 23 ticks. At 5, 15, 30 and 60
   minutes, 24 ticks last 2, 6, 12 and 24 hours, so a 24-hour limit is never the binding one and can
   be deleted.
3. **Offer numbering in the T3 UI: option E.** The optional approval disclosure moves to the end. It
   becomes item 6, and "ticks are report-only" becomes item 5. An omission then only drops the last
   item, so the raw text and the Markdown rendering in the T3 UI never disagree. The offer scan still
   sees the omission by number, because item 6 is missing.
4. **Global Codex `AGENTS.md`: option B.** The requalification of the new candidate runs with the
   owner's global `~/.codex/AGENTS.md` present. The file stays unchanged for the whole window, and its
   SHA-256 is recorded at the start and at the end. This replaces the 2026-11-13 owner decision that
   no such file exists during a window. The `e0966ac7` record serves as the comparison without the file.

Two follow-on decisions from the plan review (owner, 2026-11-15):

- **Leaf dispatch: inline fallback.** The file forbids native Codex subagents and asks for
  `delegate_task` instead. A T3 `delegate_task` child is a new, persistent T3 thread holding
  evidence, so starting it is a host write. The session contract excludes that: one persisted
  artifact and only its writes (`focus-session-contract.md:7-18`), plus the tick allow-list
  (`:44-46`). An instruction rule that forbids native subagents therefore counts as declined
  delegation. The leaf then runs as the visible inline fallback under identical limits, as
  `src/tools/focus.md:86-88` already requires, for snapshots and ticks alike. `delegate_task` or any
  other thread-creating tool is never a leaf path. This replaces an earlier answer in the same
  review round that would have allowed `delegate_task`.
- **Attempt allowance.** One candidate. An observed defect ends the attempt under the #613 failure
  rule, and the owner decides on any further candidate.

Classification as Bugfix: items 1 and 3 remove nondeterministic or misleading runtime output, and
item 2 makes an end event that never fired in practice reachable. No gate row is opened or closed, no
new capability is added, and sends stay disabled. Under the ADR-strict rule of the capability policy
(`docs/adr/pragmatic-test-release-policy.md`), any change to `focus-follow-up.md` needs a passing
record for a candidate that matches the merge head, plus the updated digest file. Otherwise both T3
observed gate rows are disabled again. The requalification is therefore part of delivering this fix.

## Outcome checkpoint

**Primary source:** sebastian-software/effective-flow issue #670 (follow-up of #663, candidate
`e0966ac7` from #664).
**Original outcome:** The four #670 points are resolved as decided above. The T3 observed follow-up
row stays qualified on a new candidate whose record passes F1–F16 with no limitation from #670 left
open. The report-only row also stays qualified. All sends stay disabled.
**Last evaluated attempt:** None. This is a fresh baseline for #670.
**No-progress count:** 0
**Cumulative approach:**

- Contract wording fixes in `src/shared/focus-follow-up.md`, with their contract tests and the
  user guide.
- A new built candidate, recorded once against the full follow-up checklist with the global Codex
  `AGENTS.md` present.
- The record, the gate row and the digest file are updated in the same PR.
  **Continuation decision:** Continue within authority (owner decision, 2026-11-15). Attempt
  allowance: 1 candidate. An observed defect ends it through the #613 failure rule, and the owner
  decides on any further candidate.

## Architecture decisions

- **Idle rule (decision 1).** The rule gets one fixed clause: only a tick's message counts as the
  report of this loop; the snapshot, its offer and the opt-in turn that creates the schedule do not.
  The opt-in turn has to be named: it writes the `ticks=0` checkpoint, and every valid checkpoint is
  traceable to it (`focus-follow-up.md:60-62`, `:94-95`). The idle report therefore always comes
  from a tick. A resume after `follow-up stop` starts a new loop under the same rule, so its
  first tick reports a still idle target once again. Nothing else in the "Judging and reporting"
  wording changes. Decision 1 does not touch `src/tools/focus.md`, and the snapshot rules are
  unaffected.
- **Inline-fallback clause.** The existing fallback sentence in `src/tools/focus.md` (lines 86–88:
  "Unavailable or declined delegation uses the mandate's visible inline fallback under identical
  limits, never an additional analysis spawn") gets one clause. An instruction that forbids the
  host's native subagent mechanism counts as declined delegation, and the leaf is never dispatched
  through `delegate_task` or another thread-creating tool. The session contract stays unchanged: its
  authority statements already exclude the child thread. The clause sits in `src/tools/focus.md`,
  so the always-loaded `focus` core grows against a 414-line budget that is full today. Fit the
  clause into the existing lines by rewrapping or tightening the same paragraph. If that cannot be
  done without losing meaning, raise `CONTEXT_BUDGET_LINES.focus` in `build.mjs` by exactly the
  measured delta from the `Always-loaded core` report.
- **Flat cap (decision 2).** Use one sentence in "End events": the loop cap is reached when this
  tick's incremented `ticks` is 24 or more. The cap tick is the 24th tick and writes `ticks=24` and
  `state=stopped`, the same convention as the earlier `ticks=48` pass
  (`focus-host-acceptance.md:701`). The wording "or more" ends a running loop that already has more
  than 24 ticks. Its one final notice still relies on the existing notice-suppression rule.
  Drop "24 hours", "whichever comes first", the trusted-clock clause and the formula
  `ticks = min(48, 1440 / interval)`. The invalid-path stopped-line rule (line 87) uses the same
  wording and changes its `interval=-` cap from 48 to 24, which makes it the same cap for every
  stopped line. The sentence
  "A compacted observer before the cap falls under the invalid-checkpoint path" stays: compaction
  remains possible with a large observer context, and the deletion safeguard is unchanged. The cap is
  part of the #613 decision in `docs/adr/focus-cross-session-messages.md` (line 166, under "The
  decision:"). That bullet changes in place to 24 ticks, with the compaction evidence as its rationale.
  The November 14 status note (lines 13–19) stays as it is. A new dated status note records the cap
  change (owner decision 2026-11-15, #670) and the new record, without the sentence "The decision
  below is unchanged".
- **Offer order (decision 3).** The fixed order becomes:
  1. visible message per tick;
  2. persistent schedule;
  3. the loop cap and the stop command;
  4. the dedicated observer thread;
  5. report-only ticks;
  6. the approval disclosure.

  The omission rule reads "only item 6 is omitted, and only when the observer's mode is known not to
  require approvals". The clause "the remaining items keep their numbers" goes away, because nothing
  follows item 6. The item texts stay word for word; only their positions, numbers and list-ending
  punctuation change: item 5 ends with ";" and item 6 with ".".

- **Offer scan (decision 3).** Without the numbering gap, a truncated list and a correct omission in
  default mode look alike by number. The scan keeps the whole-text v2 parser and its layout fixtures
  from `e0966ac7` (`calibration/offer-fixtures-v2.json`, including the list after a blank line under
  its heading). Before the recording it is recalibrated against those fixtures plus these:
  - default mode with items 1–5 (pass);
  - approval mode with items 1–6 (pass);
  - unknown mode without item 6 (fail);
  - the old order with approvals as item 5 (fail);
  - a missing middle item (fail);
  - a swapped order (fail);
  - a German offer (pass).
- **Requalification scope (decision 4).** The contract changes make a new candidate, so it is recorded
  against the full follow-up qualification checklist, F1–F16, as `e0966ac7` was. A partial record
  cannot satisfy "a passing record for a candidate matching the merge head". F12 now needs a 5-minute
  loop that reaches 24 ticks, about 2 hours. The host precondition is reversed from the 2026-11-13
  decision:
  - the global `~/.codex/AGENTS.md` is present at every install and scan point;
  - it is byte-identical to the owner's file, with its SHA-256 recorded at window start and end;
  - any change during a window is a host fault. A host fault voids that window, and the window is
    repeated once on the same candidate. That repeat uses no new attempt.

  The qualified Codex configuration (`c19e3da3…`) and model (`gpt-6.1-sol`, medium) carry over.
  The file last captured on 2026-11-13 (`70fc0d66…`) carried three rules:
  - a German chat-language rule;
  - Europe/Berlin times;
  - native Codex subagents forbidden, `delegate_task` only.

  The record therefore sets these expectations:
  - `started=` stays ISO-8601 UTC;
  - German offers and reports are checked by number and order and glossed by hand. The checkpoint
    grammar stays literal. The final notice and the offer items are judged by meaning;
  - every leaf runs as the visible inline fallback, with its disclosure recorded. No
    `delegate_task` or other thread-creating call appears in any snapshot or tick. Quiet,
    end-event and stopped ticks start no leaf.

  Only the SHA-256 and the behaviour-relevant content categories are published. A copy of the file
  goes only into the private evidence root and passes the publication scan.

  The record qualifies this one file. The limitation is therefore narrowed rather than removed:
  recorded with one global `AGENTS.md` (SHA …) present; other contents are not qualified.

- **Record structure.** Reuse the `e0966ac7` layout in `docs/developer-guide/focus-host-acceptance.md`:
  `### F record for candidate <hash>`, `#### <hash>: candidate binding`, `#### <hash>: F1` … `F16`,
  and `#### <hash>: limitations`. Use the eight-entry digest table and the candidate-merge rule of the
  archived plan `docs/plan/archive/2026-11-14-focus-follow-up-requalification-record-for-issue-663.md`.
  The detailed record procedure (windows, pseudonyms, scans, evidence root) follows that archived plan.
  It is not restated here.
- **One PR.** The fix commit is the candidate. The record, the gate-row text and the updated
  `test/fixtures/focus-digests.sha256` follow on the same branch. The candidate is the branch head
  after `origin/develop` has been merged in, as a merge commit with no rebase. Among the four focus
  sources and `build.mjs`, only these differ from `e0966ac7`:
  - `src/shared/focus-follow-up.md`;
  - `src/tools/focus.md`, only by the inline-fallback clause;
  - `build.mjs`, in non-focus rows and at most the measured `focus` budget delta.

  The built `tools/focus.md` differs from `e0966ac7` only by that clause.
  `src/shared/focus-session-contract.md` and both `retro-native-sources.md` copies are byte-identical
  to `e0966ac7`. The report-only row is bound by the built `tools/focus.md` too, so this record
  re-qualifies it as well, with F1. If `develop` changes a focus source or an included fragment before
  the merge, that makes a new candidate. After the record, the branch may be brought up to date from
  `develop` by merge only, if the update touches no focus source, no included fragment and no
  `focus` row of `build.mjs`. The delta rule is then re-proven on the merge head. Before handoff,
  `git diff --name-only <candidate>..HEAD` shows only record, documentation and digest files, plus the
  files such a permitted update brought in. The PR carries `Closes #670`, and this plan is archived.

## Affected files

| File                                            | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/focus-follow-up.md`                 | Idle clause (lines 177–180); flat cap in "End events" (lines 211–213) and in the stopped-line rule (line 87); offer order and omission rule (lines 27–39).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/tools/focus.md`                            | Inline-fallback clause in the fallback sentence (lines 86–88).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `build.mjs`                                     | Only if the clause cannot fit: `CONTEXT_BUDGET_LINES.focus` raised by the measured delta.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `test/focus-contracts.test.mjs`                 | Update the offer assertions (lines 438–461): swap items 5 and 6 with their new endings, use the new omission string, keep exactly `1.`–`6.` in the contract, and rewrite the invariant comment at lines 439–442. Update the idle assertion (line 643) and add the phrase for the new tick-only clause. Update the cap assertions (lines 551, 752) to the incremented-`ticks` wording. Assert the inline-fallback clause in `src/tools/focus.md`, and assert that `delegate_task` is not named as a leaf path. The session-contract authority assertions (lines 495–496, 572) stay unchanged. Add negative assertions that `1440`, `24 hours`, `48 ticks`, `whichever comes first`, `trusted clock`, `min(48` and `the remaining items keep their numbers` no longer appear in the fragment. |
| `docs/user-guide/tools-quality.md`              | Line 61: F-record link to the new candidate. Lines 63–70: drop the item 5 / T3 renumbering note, the cap-not-observed sentence and the idle-skip sentence once the record supports them. Narrow the `AGENTS.md` sentence to the recorded file. Say the cap is 24 ticks (2 hours at 5 minutes), so longer observation means a longer interval.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `docs/adr/focus-cross-session-messages.md`      | Line 166: decision bullet changed in place to 24 ticks with the compaction evidence. A new dated status note above the November 14 note, which stays unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `docs/adr/pragmatic-test-release-policy.md`     | Lines 13–16: a dated status note naming the new applicable record.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `docs/developer-guide/focus-host-acceptance.md` | New F record for the new candidate. Also update the page status line (line 3), the "Recorded bindings" note (line 56), both T3 observed matrix rows (around lines 3195 and 3201), the checklist item 1 suffix (line 3219) and the host prerequisite status (around line 3184). Mark the `e0966ac7` limitations resolved by the new record.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Offer-scan evidence tooling (outside `src/`)    | Expected sequence "1–5, plus 6 only in approval mode", recalibrated against the fixtures under the architecture decisions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `test/fixtures/focus-digests.sha256`            | Digests of the recorded candidate (source and built `focus-follow-up.md` at minimum).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Implementation details

### Approach

1. **Contract edits** as the architecture decisions specify:
   - in `src/shared/focus-follow-up.md`, the tick-only clause in the idle rule, the flat 24-tick
     cap in both places, and the reordered offer items with the item-6 omission rule;
   - in `src/tools/focus.md`, the inline-fallback clause, within the `focus` budget.
2. **Contract tests.** Update the existing assertions, the idle snapshot clause and the negative cap
   assertion, in the style of the existing `assertPhrases` and `ordered` checks.
3. **User guide and ADR** wording as listed. The user-guide limitation sentences are removed only in
   step 7, after the record confirms each point.
4. **Checks:** run `pnpm agent:check`, `pnpm test`, `node build.mjs` and `pnpm test:distribution`
   through `t3-project`. The digest guard fails as expected until step 7. Commit the fix. If
   `origin/develop` moved, merge it in. The resulting head is the candidate.
5. **Candidate binding:** record the eight digests and prove the delta rule from the "One PR"
   decision. Then recalibrate the offer scan against its fixtures.
6. **Recording** of F1–F16 on the candidate with the global `AGENTS.md` present, following the
   archived 2026-11-14 procedure, with these targeted expectations:
   - **F1:** every offer carries items 1–5 in order, and item 6 only when approvals may be needed.
     The T3 UI shows the same numbers as the raw text.
   - **F2:** the first tick after an opt-in snapshot of an idle target reports it, for every
     observer, also after a resume and on a second target. The second tick is quiet.
   - **F12:** a 5-minute loop reaches `ticks=24`. The cap tick deletes its own schedule with the full
     handle, posts the final notice and writes `state=stopped`. The schedule is gone in the T3 UI.
   - **F16:** quiet-tick growth is measured with the `AGENTS.md` present and compared with
     `e0966ac7` (about 21,400 characters per quiet tick).
7. **Record and gate:**
   - write the F record and the limitations;
   - update the gate row and the host prerequisite status, and drop the #670 limitations the record
     resolved;
   - finish the user guide;
   - write the new digest file;
   - rerun the CI order.

### Edge cases

- **Resume after stop:** the first tick of the resumed loop reports a still idle target once.
- **The target changes between the snapshot and the first tick:** the normal judging applies, and the
  idle clause does not.
- **Approval-mode observer:** the offer has all six items, with approvals as item 6.
- **Compaction before tick 24 despite the lower cap:** the deletion-safeguard stop is still correct
  behaviour, but F12 is not passed. The record reports it, and the PR does not merge with F12 open
  without a new owner decision.
- **60-minute interval:** 24 ticks equal 24 hours, the same as the old cap, so its behaviour does not
  change.
- **Existing active loops with `ticks` > 24:** after the update, the next tick reaches the cap at
  once through "24 or more" and ends the loop through the normal cap path. This is acceptable and
  needs no migration.

## Acceptance criteria

- [ ] `src/shared/focus-follow-up.md` states the snapshot clause, a flat 24-tick cap with no clock
      rule or `1440` formula, and the offer order with approvals as the only omissible item 6.
- [ ] `src/tools/focus.md` treats an instruction that forbids native subagents as declined delegation,
      with the visible inline fallback and never `delegate_task` or another thread-creating tool.
      `node build.mjs` passes the `focus` context budget.
- [ ] `test/focus-contracts.test.mjs` asserts all four changes, including the absence of the old
      cap and numbering texts.
- [ ] A record for the new candidate in `focus-host-acceptance.md` passes F1–F16, with:
  - F2 passing for every observer;
  - F12 reaching `ticks=24` with the cap tick's own deletion verified in the T3 UI;
  - F1 showing identical numbering in raw text and in the T3 UI;
  - the global Codex `AGENTS.md` present with matching start and end SHA-256;
  - at most one analysis leaf per run, always the disclosed inline fallback, and no `delegate_task`
    or other thread-creating call in any snapshot or tick;
  - `started=` in ISO-8601 UTC;
  - all sends disabled.
- [ ] Before the recording, the offer scan passes every v2 layout fixture and the seven new fixtures.
      At the candidate, the delta rule of the "One PR" decision is proven.
- [ ] All current-binding text names the new candidate. That covers:
  - both T3 observed gate rows;
  - the page status line and the "Recorded bindings" note;
  - the host prerequisite status and the checklist item 1 suffix;
  - the user guide;
  - the new ADR status note and the ADR decision bullet;
  - the status note in `pragmatic-test-release-policy.md`.

  Limitations 1–3 of #670 appear in none of these. The `AGENTS.md` limitation is narrowed to
  "recorded with one global `AGENTS.md` (SHA …) present; other contents are not qualified". Dated
  status notes and the historic `e0966ac7` record stay unchanged, except that the record's
  limitations are marked as resolved.

- [ ] Handoff: `git diff --name-only <candidate>..HEAD` matches the "One PR" rule, the PR carries
      `Closes #670`, and this plan is archived.
- [ ] `test/fixtures/focus-digests.sha256` matches the recorded candidate, and the CI order
      (`pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution`) passes on the
      merge head.

## Validation plan

- Contract tests in `test/focus-contracts.test.mjs` for each of the four wording changes, plus the
  digest guard in `pnpm test` against the recorded candidate.
- The full CI order through `t3-project`.
- Manual host recording F1–F16 on T3/Codex, with the evidence root and scans as in the archived
  2026-11-14 plan.

## Assumptions and open points

- Assumption: the T3 UI renders an ordered Markdown list `1.`–`5.` with the same numbers, which holds
  for any contiguous list starting at 1. F1 confirms it.
- Assumption: the offer scan currently lives only in the recorded evidence tooling, not in
  `src/scripts/`. It checks numbers and order, so its expected sequence changes to "1–5, plus 6 only in
  approval mode".
- Assumption: 24 ticks fit before compaction with the global `AGENTS.md` present. `024bcb2a`
  compacted at 21–23 ticks with the file present, but at about 37,000 characters per quiet tick against
  about 21,400 now. F12 and F16 confirm it. If they fail, the owner decides between a lower cap,
  further tick-cost work or a scoped self-delete after compaction (option D of decision 2, a separate
  issue).
- Out of scope: deleting a schedule after compaction (option D of decision 2), further tick-cost
  reductions, and the `focus` and `build-context` eval rounds, which remain post-merge debt.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        1 |         0 |    1 |
| Security        |        0 |         1 |    0 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         4 |    2 |
| Testability     |        0 |         3 |    2 |
| Scope           |        0 |         1 |    1 |
| Maintainability |        0 |         3 |    2 |

The counts cover both rounds: the internal review and the deep review below. The critical finding
is resolved by owner decision. All other findings are incorporated.

### Findings

The judgment came from `effective-delivery`, checked against `origin/develop` `ac901d08`. Every
finding is incorporated.

- **Important, Error cases: the opt-in turn was not excluded.** The idle clause excluded only the
  snapshot. The opt-in turn writes the `ticks=0` checkpoint and could still count as a report of the
  loop. The clause is now tick-only and names the snapshot, its offer and the opt-in turn.
- **Important, Security/Testability: effects of `AGENTS.md` not anticipated.** Recording with the
  `AGENTS.md` raises three questions:
  - Is a leaf dispatched through `delegate_task` allowed?
  - Is `started=` affected by the Berlin-time rule?
  - Can German output be scanned?

  The record expectations now cover UTC `started=` and German output glossed by hand. The leaf
  question was first answered with a session-contract clause allowing `delegate_task`. The deep
  review replaced that answer (see below).

- **Important, Scope: one recorded file cannot close the `AGENTS.md` limitation in general.** The
  limitation is now narrowed to the recorded file instead of removed, and the acceptance criterion is
  adjusted to match.
- **Important, Maintainability: the ADR cap is decision text.** The plan treated it as a
  documentation update. The bullet now changes in place, a new dated status note is added, and the
  November 14 note stays unchanged.
- **Important, Maintainability/Scope: missing `e0966ac7` binding references.** Added: the page
  status line, the "Recorded bindings" note, both matrix rows, the checklist suffix, the status note
  in `pragmatic-test-release-policy.md` and the user-guide link.
- **Important, Error cases: no attempt allowance.** Owner decision 2026-11-15: 1 candidate, with the
  #613 failure rule.
- **Important, Testability: offer-scan calibration not specified.** Seven fixtures are now named,
  because without the numbering gap the fixtures carry the signal.
- **Note, Error cases: `ticks` > 24 was not covered by "cap of 24 ticks".** The wording is now "24 or
  more" in both places.
- **Note, Testability: incomplete negative assertions and a stale invariant comment.** Both are
  extended.
- **Note, Maintainability: "word for word" conflicted with list punctuation.** Swapping the
  end-of-item punctuation is now allowed.
- **Note, Scope: imprecise candidate and handoff steps.** The step-4 order is fixed, the delta rule
  allows the known `build.mjs` drift, and three handoff steps are added: the closing diff check,
  archiving the plan, and `Closes #670`.
- **Note, Data protection: capture of the owner's file.** Only the SHA-256 and the content
  categories are published. A copy goes only into the private evidence root and passes the
  publication scan.

### Deep review (2026-11-15)

The judgment came from `effective-delivery`, against `origin/develop` `ac901d08`. No focus source
has drifted since #664.

- **Critical, Architecture/Security/Data protection: `delegate_task` as a leaf path contradicts
  the session contract.** A `delegate_task` child is a persistent T3 thread holding evidence, so
  starting it is a host write. That contradicts the single-artifact rule and the host-write list
  (`focus-session-contract.md:7-18`) and the ADR, it leaves snapshots uncovered, and "read-only" is
  only a prompt rule. Owner decision 2026-11-15: inline fallback. A ban on native subagents counts as
  declined delegation, and the leaf runs inline under identical limits. The clause goes into
  `src/tools/focus.md`, and the session contract stays unchanged.
- **Important, Error cases: `delegate_task` call mechanics (async, timeout, notification runs,
  undisclosed approval).** Not applicable after the inline-fallback decision. The record checks
  that no thread-creating call happens.
- **Important, Testability: "one leaf per reporting tick" contradicted leafless end-event ticks.**
  The criterion is now "at most one leaf per run". Quiet, end-event and stopped ticks start none.
- **Important, Maintainability/Testability: the ADR criterion contradicted the kept November 14
  note.** The criterion is limited to current-binding text. Dated notes and the historic record are
  exempt.
- **Important, Error cases/Scope: no allowance for a post-record update from `develop`.** The
  archived exception is carried over: merge only, no focus source, no included fragment, no `focus`
  budget row, and the delta rule re-proven.
- **Important, Testability: acceptance criteria did not add up to one completion condition.** Added
  criteria for scan calibration, the delta rule, the handoff and sends disabled. The Validation plan
  now says four changes.
- **Note, Architecture: which `ticks` value reaches the cap.** It is the incremented value, so the
  cap tick writes `ticks=24`.
- **Note, Testability: missing layout fixture.** The v2 parser and its layout fixtures are carried
  over.
- **Note, Error cases: consequence of a host fault, and German fixed strings.** A host fault voids
  the window, and the window is repeated once with no new attempt. The checkpoint stays literal, and
  the notice and offer items are judged by meaning.
- **Note, Maintainability: imprecise test location.** The test row names the assertions that
  change and the ones that stay unchanged.

## Test results

- Candidate `87851907` (fix commit on this branch): step 0 on a clean, container-local checkout
  passed `pnpm agent:check`, the focus contract tests (34/34), the focus eval tests (88/88),
  `node build.mjs` (focus 416/416, stamp `1.73.0 (8785190)`), `pnpm test:distribution` and the five
  eval evidence reports. CI run `43725974088` failed only in the digest guard (5,556 tests,
  5,504 passed, 1 failed), red by design until the fixture followed the record.
- Recording on 2026-11-15 in two install windows, window 1 from 18:46 to 20:51 UTC and window 2 for
  F10 from about 21:27 to 22:16 UTC, with the owner's global Codex `AGENTS.md` present and unchanged
  (SHA-256 `70fc0d66…` at the start and end of both windows): all 16 items passed, no observed defect,
  no host fault. The 5-minute loop reached `ticks=24` without compaction. Every observer analysed
  inline; no snapshot or tick created a thread. The offer scan passed 13 synthetic fixtures; the
  layout and German fixtures were added after window 2 and replayed against the unchanged rule.
- Record, user guide and ADR notes: `pnpm agent:check` and `node --test test/focus-contracts.test.mjs`
  (34/34) passed; the publication scan of the diff against all pseudonym registers found nothing.
- `origin/develop` (`aabe18ff`, #669) was merged after the record. It changes no focus source, no
  included fragment and no `focus` budget row; the built focus files keep the recorded digests, and
  `test/fixtures/focus-digests.sha256` now holds them.

## Open points

- No open points.
