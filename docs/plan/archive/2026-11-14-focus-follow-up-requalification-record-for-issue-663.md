# Focus follow-up requalification record for issue 663

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Documentation (`effective-flow docs`)
**Doc category:** developer-guide
**Target path:** docs/developer-guide/focus-host-acceptance.md

## Requirement

Draft pull request #664 (branch `effective-flow/build/focus-source-fixes-for-issue-663`, head
`068835bd`, one commit on `develop` at `f03433a0`) is the source part of #663: a new focus
candidate that addresses the four limitations recorded for candidate `024bcb2a`:

- enumerated offer disclosures;
- the `pattern=` repetition rule;
- the root-observer ancestry skip;
- visible-path redaction.

It changes `src/shared/focus-follow-up.md` and `src/shared/focus-session-contract.md`, which are
digest-bound focus sources. The digest guard and the binding-drift rule therefore require a
passing host record for this candidate before #664 can merge, or both T3 observed rows return to
disabled.

**Revision (2026-11-14): candidate `e0966ac7`.** The recording on candidate `01082a06` failed
in its first install window: item 3 missed its Looping report on both attempts, and the failed
entry is on the page (`bc0748cd`). The Codex records showed two causes. The tick reporting the new
blocker wrote `pattern=none`, so the analysis leaf never received the repetition rule. The leaf also
counted the bare nudge "Continue stage2." as an explicitly requested retry. By owner decision
(2026-11-14), the fix `1944412b` makes a tick reporting a newly actionable failure or blocker write
its locator as the first `pattern=` locator, and exempts a retry only when a later request
explicitly asks to retry or rerun that step. A bare continuation does not count. D is now
`e0966ac7`, the merge of `origin/develop` (`10205806`) into the fix. The rest of this plan applies
to D unchanged, except where the revision notes below say otherwise.

This run records all 16 items of the "Follow-up qualification checklist" in
`docs/developer-guide/focus-host-acceptance.md` against the candidate on the T3/Codex host. It
adds the additional proofs #663 requires, writes the record and the record edits, and turns #664
into the ready pull request that closes #663.

The procedure of the archived plan `docs/plan/archive/2026-11-06-focus-follow-up-qualification-record.md`
applies unchanged except where this plan states otherwise. That covers its Approach steps 0–10, the
edge cases and the architecture decisions. Its owner decisions remain in force unless replaced
here, including the 2026-11-13 decisions in its "Recording on 2026-11-13" bullet:

- the window rules;
- restore against each window's own baseline;
- schedule state by host API;
- valid outputs only;
- window-qualified pseudonyms;
- the publication-scan patterns and both registers.

**Substitutions for the inherited procedure.** Wherever the archived plan names its own artifacts:

- #625 → #664;
- `Refs #613` → `Refs #663` and `Closes #613` → `Closes #663`;
- the step-10 comment on #613 is dropped;
- failed entries go on #664's branch;
- the pseudonym registers are every register file under `candidate-<hash>/` (root and
  `window-<n>/`) plus every register under `candidate-024bcb2a/`;
- "D" means this plan's merge head. The archived `024bcb2a` and `candidate-024bcb2a/` become
  `<hash>` only where they name the candidate being recorded, never in baseline citations;
  published text names the candidate only by hash, because the acceptance page also has a
  historical phase D;
- archived step 0's delta and CI bullets, archived step 3's `85728d95` calibration and the archived
  "PR review precondition" are replaced by this plan's step 0. No published PR review is awaited
  before recording: the internal build review of #664 (9 findings fixed, none open) and CI suffice,
  as on #625, and recensor runs at the merge gate;
- archived step 7's matrix text names this record's limitations, not those of `024bcb2a`.

This plan writes "archived step N" whenever it means a step of the archived plan.

The specification of the new rules is the canonical planning comment of #663. Owner decisions
2026-11-13 and 2026-11-14 recorded below take precedence.

**Why Documentation (`effective-flow docs`):** the deliverable is an operator acceptance record and
status text. The product change and its tests are on #664. An autonomous build delegate cannot
produce T3/Codex host evidence, so a supervised coordinator drives the scenarios and the `docs` run
writes them down.

## Outcome checkpoint

**Primary source:** sebastian-software/effective-flow#663 (planning comment); parent outcome sebastian-software/effective-flow#613
**Original outcome:** A developer can have Effective Flow supervise one explicitly selected session
over time:

- evidence-backed drift and loop detection;
- quiet unchanged ticks;
- honest capability limits;
- clean stop and resume;
- no repeated nudges.

**Last evaluated attempt:** Candidate `01082a06`, 2026-11-14: failed at item 3 (no Looping report on two attempts), recorded as a failed entry. Before it, candidate `024bcb2a` (2026-11-13) passed 14 of 16 items with owner-accepted limitations. The fix for the `01082a06` defect is `1944412b` on #664.
**No-progress count:** 1
**Cumulative approach:** done: #613 WP0–WP2b, candidate `024bcb2a` merged with limitations (#625), the #663 plan, the source part on #664. Open: this host record, then #664 ready with `Closes #663`.
**Remaining proof:** a host record of all 16 items on the candidate, meeting all of these:

- item 3 reports Looping once on an unrequested repetition, and the requested-retry control stays On track;
- items 1, 2, 4–11 and 13–16 pass;
- item 12 reaches the cap and deletes its schedule with the complete handle, or, after at most two contract-conformant compaction stops, is an owner-accepted limitation with measured growth;
- the ancestry-skip, offer-order and path scans pass.

**Continuation decision:** Continue within authority (owner decision, 2026-11-14, after the `01082a06` failure). Attempt allowance: 1 candidate, `e0966ac7`. An observed defect ends it through the #613 failure rule, and the owner decides on any further candidate.

## Architecture decisions

- **Candidate D** (owner decision, 2026-11-14). Before step 0, `origin/develop` is merged into
  #664's branch as a merge commit, with no rebase or force-push. For `e0966ac7` that is `10205806`
  (#667), which changes `build.mjs` in non-focus rows only. D is that merge head. Step 0 proves that
  the built `tools/focus.md` is byte-identical to `01082a06` and that the built
  `shared/focus-follow-up.md` differs from it only by the fix. Step 1 re-checks before the first install. A
  later `develop` change to a focus source or an included fragment makes a new candidate; a change
  to `build.mjs` alone is handled after the record, as in the archived plan.
  Headings write the hash: `### F record for candidate <hash>`, `#### <hash>: candidate binding`,
  `#### <hash>: F1` … `F16`, `#### <hash>: limitations`.
- **Eight-entry digest table**, as in the archived plan. The binding states that `src/tools/focus.md`
  and both `retro-native-sources.md` copies are byte-identical to `024bcb2a`. Five digests differ
  from `024bcb2a`. Four come from the fragment edits and were reported by the build run:
  - `src/shared/focus-session-contract.md` `f1230c83…`
  - `src/shared/focus-follow-up.md` `0681b6f2…` (with the fix)
  - built `tools/focus.md` `06a2049b…`
  - built `shared/focus-follow-up.md` `2ca417ad…` (with the fix)

  The fifth is `build.mjs`, changed in non-focus budget and runtime rows by `develop`. Step 2
  recomputes all of them at D.

- **Host precondition** (owner decision, 2026-11-13). No global Codex `AGENTS.md` exists at any
  install or at the end of any install window. This is the window-1 state of `024bcb2a`. The owner
  removes the file before each window and restores it after each window close. The coordinator
  records its SHA-256 before the removal, checks it after every restore, and records its absence at
  install, at every scan point and at window end. A file that appears during a window is a host
  fault. User-facing text (owner decision, 2026-11-14): the acceptance page and the user guide state
  as a limitation that a global Codex `AGENTS.md` is untested and can enlarge the observer
  context; the qualified prerequisite itself stays unchanged. The qualified configuration (`c19e3da3…`) and model (`gpt-6.1-sol`, medium) carry over.
- **Offer order.** Every offer renders the numbered disclosures of the "Offer" section in their
  fixed order. Item 5, the approval item, is omitted only when the observer's mode is known not to
  require approvals; the other items keep their numbers. The offer scan checks numbers and order,
  independent of the output language. A missing item, a reordered item, or an approval-mode offer
  without item 5 is an observed defect. The record states the sample size.
- **Repetition rule (item 3).**
  - **Valid provocation:** the same failure, with no new evidence, across at least two tick windows
    after the observer's blocker report. The target script prints byte-identical failure output on
    every run. The target's request must not ask for the retry; the coordinator only nudges with
    "Continue stage2.". If no retry without new evidence happens within two tick windows after the
    blocker report, the provocation is invalid and uses no attempt.
  - **Pass:** Looping is reported once, `pattern=` holds the first locator and the latest retry, and
    later ticks stay quiet. The Codex records show that the analysis leaf received the `pattern=`
    locators, the observer's earlier report and the rule.
  - **Time limit:** the first leaf-dispatching tick whose window contains a retry without new
    evidence must report Looping; otherwise the attempt is a miss.
  - **Blocker marker** (revision 2026-11-14): the tick of `O` or `O5` that reports the newly
    actionable blocker writes its locator as the first `pattern=` locator. A blocker tick ending
    `pattern=none` is an observed defect at once, with no retry.
  - **Nudge:** "Continue stage2." is a bare continuation under the fixed rule, never an explicit
    retry request. A leaf verdict that treats it as one is a miss.
  - **Leaf handoff:** every leaf-dispatching tick of `O` and `O5` while `pattern=` is not `none` must
    hand the leaf the `pattern=` locators, the earlier report and the rule. A missing input is an
    observed defect at once, with no retry.
  - **Attempts** (owner decision, 2026-11-14): at most two. A second miss is an observed defect under
    the #613 failure rule.
  - **Negative control** (owner decision, 2026-11-14): a separate pair `O5`/`T5` (default mode, root
    observer) runs in parallel with item 3. `T5` receives explicitly requested retries of the same
    failing step over at least two tick windows. It passes when it never reports Looping and has no
    verdict other than On track apart from its single blocker report. Its ticks count toward the
    scans and the threshold.
  - **No false Looping:** item 4 shows none from `pattern=`.
- **Ancestry skip.**
  - **Activity scan:** counts observer-ancestry `t3_thread_read` calls per tick of every root
    observer. It shows that ancestry reads are still present at snapshot and resume, and states the
    reads and charged characters per quiet tick.
  - **Threshold** (owner decision, 2026-11-14): at most one tick in ten may walk the chain, counted
    across all root-observer ticks of the record and reported per observer. Excluded and reported
    separately: stopped ticks, every fire after a compaction in that observer (detected from the
    Codex compaction record), snapshots and resumes. More is an observed defect.
  - **Item 10:** the approval-mode observer `O4` is expected to show no ancestry read approval in its
    ticks. An ancestry read approval that does appear counts against the threshold, is recorded, and
    is not a defect on its own. Its offer ruling still requires both approval elements.
- **Path scan.** Every visible observer message contains no absolute path, no home path and no
  link to a local file, as follows:
  - an absolute path is a match of ``(^|[\s(\[`'"])/(home|Users|tmp|var|opt|etc|root|mnt|srv|usr)/``;
  - a home path is a tilde-slash path or a `file` URL;
  - a local-file link is a Markdown link whose target is any path or `file` URL, relative ones
    included.

  Repository-relative and slot-relative paths in inline code and category names are allowed. The
  leaf handoff is out of scope. Any match is an observed defect. The step-0 calibration adds a
  synthetic absolute-path hit under the system temporary directory and a slash-free invocation, and the `T3`-style target's failure output
  contains an absolute path, so the redaction is actually exercised.

- **Cap loop (items 12 and 16).** Item 12 passes at tick 48 when the cap tick deletes its schedule
  with the complete handle. After at most two contract-conformant compaction stops, it is recorded
  as an owner-accepted limitation (owner decision, 2026-11-13). Item 16 records growth per quiet
  tick, split by item type (skill-file loads, ancestry, state, history page and checkpoint message).
  The per-type baseline is derived from the frozen `024bcb2a` records during step 0, against the
  totals of 8 activity items and 37,187 characters, and 2 messages and 1,822 characters. The record
  states that the `024bcb2a` baseline ran with the global `AGENTS.md` present. The window holding
  `O2`'s loop has a hold time of at least about 4.5 hours; a window that closes before tick 48 for
  any other reason leaves item 12 not provoked, neither a compaction stop nor a host fault.
- **Record and docs after the recording** (owner decision, 2026-11-14). The `docs` run writes the F
  record, the step-7 record edits, the user-guide follow-up paragraph and the ADR status notes after
  the last window. The fixture commit follows. Then #664 turns ready with `Closes #663`. The record,
  the status line and the acceptance-matrix row state which `024bcb2a` limitations are resolved; the
  `024bcb2a` entry itself stays unchanged.
- **Follow-up tracking** (owner decision, 2026-11-14). No follow-up issue is filed in advance. If
  limitations remain after the record, the coordinator files one issue after the last restore and
  its publication scan, before the `docs` run, and the record links it.
- **Windows** (owner decision, 2026-11-14). The owner sets the hold time per window. Short top-up
  windows for facts the retained records cannot give are allowed, as window 3 of `024bcb2a` was.

## Affected files

| File                                                                           | Description                                                                                     |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `docs/developer-guide/focus-host-acceptance.md`                                | New F record and the record edits (status line, bindings, matrix, checklist, host prerequisite) |
| `docs/user-guide/tools-quality.md`                                             | Follow-up paragraph updated to the recorded behavior                                            |
| `docs/adr/pragmatic-test-release-policy.md`                                    | Dated status note                                                                               |
| `docs/adr/focus-cross-session-messages.md`                                     | Dated status note                                                                               |
| `test/fixtures/focus-digests.sha256`                                           | Set to D's digests in a separate commit after the record                                        |
| `docs/plan/2026-11-14-focus-follow-up-requalification-record-for-issue-663.md` | This plan; archived by the run                                                                  |

The recording changes no file under `src/`, `evals/` or `build.mjs`. Under `test/` it changes only
the digest fixture.

## Implementation details

### Approach

The steps of the archived plan apply, with these changes:

0. **Integrate and validate D.**
   - Merge `origin/develop` into #664's branch and push. D is that head.
   - Source delta: `git diff 024bcb2a D` over the four focus sources and `build.mjs` touches only:
     - `src/shared/focus-follow-up.md` and `src/shared/focus-session-contract.md`;
     - `build.mjs`, in non-focus budget and runtime rows only.
   - The built `tools/focus.md` changes only from the fragment edits and is byte-identical to
     `01082a06`; the built `shared/focus-follow-up.md` differs from `01082a06` only by the fix
     `1944412b`.
   - Clean-checkout validation as before. Record CI on the exact head of #664; it must fail only in
     the digest guard, and a rerun pass of a flaky non-focus test counts.
   - Calibrate the extended scans against `candidate-024bcb2a/`:
     - the activity scan must count one ancestry read per tick there;
     - the offer content scan must find the `O2` (window 1) omission, with the German offers marked
       as checked by hand;
     - the path scan must find the known home-path link in `O2` (window 2).
   - Calibrate the numbered offer rule against synthetic fixtures: a complete offer, a missing item,
     a swapped order, approval mode without item 5, and unknown mode without item 5. For `e0966ac7`,
     add a complete offer whose list follows a blank line under its heading (the `01082a06` scan
     miss) and the recorded `01082a06` offers.
1. **Preconditions.** #664 is a draft at D, and `develop` is unchanged in focus sources and included
   fragments since `10205806`; this check repeats at every window's install. The owner has removed the global Codex `AGENTS.md`, and its absence is
   recorded.
2. **Build and bind** at D: eight digests and a version stamp from a clean-clone build, so the stamp
   names D.
3. **Install** per window, as in archived step 3. Evidence goes to the fresh subdirectory
   `candidate-<hash>/`, with one `window-<n>/` per window. At install, at every scan point and at
   window end, check:
   - the `AGENTS.md` absence (with `stat` times if present);
   - the slot manifest digest;
   - `dalo status --check`.

   A fault's invalid interval starts at the file time, or at the last good check when no file time
   exists.

4. **Trusted context** in each observer.
5. **Items 1–16** with the archived allocation, plus:
   - item 3 and the parallel negative-control pair `O5`/`T5`;
   - the scans above, after every scenario turn and hourly during loops;
   - item 16's per-type growth.
6. **Close each window** as in archived step 6, against that window's own baseline. The owner then
   restores the global Codex `AGENTS.md`, and its SHA-256 is checked.
7. **Evidence completion and freeze.**
   - Extract the per-item excerpts and report-completeness counts.
   - Run a top-up window only for facts the records cannot give.
   - File the follow-up issue only if limitations remain.
   - Freeze the evidence root.
8. **`docs` run** on #664's branch, completion action `branch`:
   - the F record for D, with window-qualified pseudonyms and German output glossed if it occurs;
   - the record edits of archived step 7, which replace the `024bcb2a` binding in the status line, the
     "Recorded bindings" note (marker and line count kept), the matrix rows and the item 1 suffix;
   - the user-guide follow-up paragraph;
   - the ADR status notes of archived step 8;
   - archive this plan as Implemented.
9. **Fixture commit** with D's digests. Validate in CI order; the guard passes and local
   environment failures follow the timeout rule. Check that `git diff --name-only D..HEAD` lists only
   the docs files, the archived plan and the fixture. Push.
10. **Pull request.** CI passes on the pushed head. The #664 body names the record and its result.
    #664 is ready with `Closes #663`.

### Edge cases

- The repeated failing step brings new evidence, such as a different error: not Looping, and not a
  valid item 3 provocation.
- The negative-control target's requested retry produces a Looping report: observed defect.
- A root-observer tick walks the chain: counted against the threshold, not a defect on its own.
- A compaction removes the checkpoint: the tick stops and reads nothing, per "Deletion safeguard and
  stopped ticks"; this is an item 12 compaction stop.
- A compaction keeps the checkpoint but removes the snapshot's ancestry result: every later tick
  walks the chain as the contract requires. These fires are excluded from the threshold and reported
  separately.
- The global Codex `AGENTS.md` appears during a window: host fault. Outputs from its file time, or from the
  last good check, are invalid, and the window closes.
- An external DALO change replaces the slot: host fault, as on 2026-11-13. The window closes against
  the new state, and the loop is retried as a host fault without consuming the allowance. It never
  counts as an item 12 compaction stop.
- A valid item 3 provocation gets no Looping report in time: a miss. The second miss is an observed
  defect.
- The head of #664 changes before the record: a new candidate, unless a documented nonbehavioral
  built-only change applies.

### Component structure

Not relevant: documentation and host evidence only.

### State management

Not relevant: schedules are throwaway host state removed in each window close.

### API integration

Not relevant.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

## Acceptance criteria

- [ ] D is the merge of `origin/develop` into #664. The source delta from `024bcb2a` covers only the two changed fragments and non-focus `build.mjs` rows. The built `tools/focus.md` equals `01082a06`, and the built `shared/focus-follow-up.md` differs from it only by the fix. CI on D failed only in the digest guard. All of this is logged in the evidence root.
- [ ] `### F record for candidate <hash>` records all 16 items, each with setup, trigger, expected and observed output, schedule state (UI or API, labelled), authorship and result. Item 12 may be an owner-accepted limitation only after two contract-conformant compaction stops. Every other item passes.
- [ ] Item 3 passes on a valid provocation within two attempts and within its time limit, with the leaf handoff evidenced. `T5` stays On track under requested retries. Item 4 shows no false Looping.
- [ ] The activity scan shows at most one chain walk per ten counted root-observer ticks, reported per observer, and ancestry reads still present at snapshot and resume. Reads and charged characters per quiet tick are stated.
- [ ] Every offer carries its numbered disclosures in the fixed order, with the sample size stated. `O4`'s offer carries item 5. The path scan finds no absolute path, home path or local file link in any visible observer message.
- [ ] Item 16 records per-quiet-tick growth split by item type against the `024bcb2a` baseline.
- [ ] The binding holds:
  - the eight-entry digest table and the version stamp naming D;
  - the qualified configuration with its digest;
  - the global Codex `AGENTS.md` absence at every install, scan point and window end, and its SHA-256 before removal and after each restore;
  - every window's install, integrity and restore checks;
  - the evidence-file digest table, or the cited subset plus the frozen manifest's digest.
- [ ] The record names no thread ID, schedule ID or absolute user path, and states that no qualification schedule remains active.
- [ ] The step-7 record edits are present, and lines 1–60 of the acceptance page keep their line count. The user guide and both ADR notes describe the recorded behavior. The `024bcb2a` entry is unchanged.
- [ ] The fixture equals the record's digests, and the final `git diff --name-only D..HEAD` lists only the docs files, the archived plan and the fixture, apart from files a permitted post-record branch update from `develop` brings in.
- [ ] CI passed on the final head. #664 is ready with `Closes #663`.

## Validation plan

- Step 0 source delta, clean-checkout validation, CI on D, and scan calibration against `024bcb2a`.
- Link, completeness, mention, delete-call, offer-order, path and activity scans after every scenario turn and hourly during loops.
- Install, `diff -r`, digest and `AGENTS.md` checks before and after each window, plus each window's restore checks.
- `pnpm agent:check`, `node build.mjs`, `pnpm test` (timeout rule), `pnpm test:distribution`, `git status` and `git diff --name-only D..HEAD` on the final head, and CI on #664.
- Publication scan before every push and tracker write. `gh pr view 664 --json isDraft,body` shows the PR ready, with `Closes #663`.

## Assumptions and open points

- The coordinator runs in a non-Codex session that survives app-server restarts; the `docs` run starts only after the last restore.
- The `focus` eval round is post-merge maintainer debt.
- The working tree of the main checkout is stale on `develop`; the recording uses a dedicated worktree on #664's branch. This plan moves into that worktree untracked, as the archived plan did.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         2 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         2 |    0 |
| Testability     |        0 |         2 |    1 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         1 |    0 |

### Findings

- **Important, Architecture.** The source-delta check missed `build.mjs`, so it failed as written.
  _Incorporated:_ `build.mjs` (non-focus rows only) is the fifth changed digest.
- **Important, Architecture.** `develop` moved (#665), so "no integration merge" no longer held.
  _Resolution by owner decision (2026-11-14):_ merge `origin/develop` before step 0; D is the merge
  head, with built focus files proven identical to `068835bd`.
- **Important, Testability.** The threshold exclusion covered only one post-compaction fire.
  _Incorporated:_ every fire after a compaction is excluded and reported, and the two compaction
  branches are split.
- **Important, Testability.** The offer-scan calibration could not pass against unnumbered
  `024bcb2a` offers. _Incorporated:_ content calibration against `024bcb2a`, numbered-rule
  calibration against synthetic fixtures.
- **Important, Error cases.** Item 3 lacked a miss outcome, a time limit and a control allocation.
  _Incorporated:_ time limit, immediate defect on a missing leaf handoff, the `O5`/`T5` pair.
  _Resolution by owner decision (2026-11-14):_ a second miss is an observed defect.
- **Important, Error cases.** Host faults could not be timed. _Incorporated:_ `AGENTS.md`, slot
  manifest and `dalo status --check` at every scan point; the invalid interval starts at the file
  time or the last good check; a DALO replacement is a host fault, never a compaction stop.
- **Important, Maintainability.** The inherited procedure carried #613/#625 literals.
  _Incorporated:_ a substitution list, the union of registers, and "archived step N" references.
- **Note, Testability.** The item 16 baseline was not comparable. _Incorporated:_ per-type baseline
  from the frozen records, with the environment difference stated.
- **Note, Data protection.** The `AGENTS.md` lifecycle was inconsistent. _Incorporated:_ removal
  and restore per window, with a SHA-256 check after each restore.

### Deep review (2026-11-14)

**Result:** Approved

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         1 |    0 |
| Error cases     |        0 |         0 |    1 |
| Testability     |        0 |         2 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         1 |    0 |

- **Important, Testability.** Item 3's criteria were not decidable (time limit, provocation validity,
  handoff scope, control verdict). _Incorporated:_ byte-identical failure output, invalid
  provocations use no attempt, first leaf-dispatching tick with a retry must report, handoff check
  on `O`/`O5` while `pattern=` is set, `T5` pass rule.
- **Important, Testability.** The path scan had no absolute-path pattern. _Incorporated:_ a named
  pattern, relative links counted, synthetic calibration hits, an absolute path in a target's output.
- **Important, Data protection.** The register substitution missed root-level registers.
  _Incorporated._
- **Important, Architecture.** The `AGENTS.md` precondition had no user-facing translation.
  _Resolution by owner decision (2026-11-14):_ stated as a limitation; the qualified prerequisite
  stays unchanged.
- **Important, Maintainability.** The substitution list missed "D", `024bcb2a` and stale archived
  passages. _Incorporated_, including that no published PR review is awaited before recording.
- **Note, Error cases.** `O4` ancestry approvals, item 12 hold time, resolved-limitation statements
  in status line and matrix, and the per-window `develop` re-check. _Incorporated._

### Revision review (2026-11-14, candidate `e0966ac7`)

**Result:** Approved, owner decisions recorded.

- **Defect on `01082a06`.** Item 3 missed twice: the blocker tick wrote `pattern=none`, and the
  leaf counted "Continue stage2." as an explicit retry request. _Resolution by owner decision
  (2026-11-14):_ the failed entry `bc0748cd`, the fix `1944412b` and a new candidate `e0966ac7`.
- **Item 3 criteria.** _Incorporated:_ the blocker-marker check and the nudge ruling. The item 3
  procedure, the control pair and the attempt limit stay unchanged, so the repaired case is exactly
  the one that failed.
- **Offer scan.** The `01082a06` scan missed one complete offer whose list followed a blank line.
  _Incorporated:_ a fixture for that layout and the recorded `01082a06` offers in the calibration.
- **Host fault.** One snapshot on `01082a06` failed with a transport error of the host's tool
  connection. No change: a host fault, handled by replacing the observer.

## Test results

- Step 0 on a clean, container-local checkout of D (`e0966ac7`): `pnpm agent:check`, focus
  contract tests (33/33), focus eval tests (88/88), `node build.mjs` (focus 414/414, stamp
  `1.73.0 (e0966ac)`), `pnpm test:distribution` and the five eval evidence reports passed. CI run
  `43600707976` failed only in the digest guard (5,451 tests, 5,405 passed, 45 skipped, 1 failed).
  The scan calibration passed.
- Recording window 1 on 2026-11-14 (13:56 to 17:08 UTC): install, integrity, `AGENTS.md` and restore
  checks as recorded in `#### e0966ac7: candidate binding`; 14 of 16 items passed, F2 and F12 are
  owner-accepted limitations, no observed defect, no host fault. Follow-up issue #670 was filed
  after the restore.
- `docs` run: `npx oxfmt` on the changed Markdown, `pnpm agent:check`, `node build.mjs` (focus
  414/414; the eight digests equal the record's table) and `node --test
test/focus-contracts.test.mjs` (33/33) passed through `t3-project`. Lines 1–60 of the acceptance
  page kept their count. The publication scan of the diff against the prefix patterns and all
  pseudonym registers of `candidate-e0966ac7/` and `candidate-024bcb2a/` found nothing. The digest
  guard stays red until the step 9 fixture commit.

## Open points

- No open points.
