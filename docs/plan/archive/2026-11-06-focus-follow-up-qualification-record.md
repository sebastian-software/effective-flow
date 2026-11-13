# Focus follow-up qualification record

**Plan status:** Implemented
**Source:** effective-flow plan
**Recommended workflow:** Documentation (`effective-flow docs`)
**Doc category:** developer-guide
**Target path:** docs/developer-guide/focus-host-acceptance.md

## Requirement

This plan is WP2b-2 of #613, the second of the two WP2b runs on one branch. WP2b-1 built the
enabling candidate: commit `a11beb70` on `effective-flow/build/focus-follow-up-and-snapshot-enabling-candidate`,
draft pull request #625, with both T3 observed gate rows enabled, all send rows disabled, and a
seven-entry digest guard in `pnpm test`. On `develop` both rows stay disabled until this record
passes and #625 merges.

This run records all 16 items of the "Follow-up qualification checklist" in
`docs/developer-guide/focus-host-acceptance.md` against the integration candidate defined below on
the T3/Codex host, makes the record edits that #613 lists under "Record edits (WP2b-2)", adds dated
status notes to the two focus ADRs, and turns #625 into the closing, ready pull request. The
recording run changes no digest-bound file; a failed scenario goes through the #613 failure rule
instead.

**Revision (2026-11-10): a new binding.** Attempts on `a11beb70` and `21f2a368` failed and stay on
the acceptance page as dated history. Head `974fe72e` adds the failed-deletion rule of the end-event
contract, and its failed-deletion scenario passed on those focus bytes. Merging `origin/develop`
(`8efe467b`) conflicts in `build.mjs`, `src/tools/focus.md`, `src/shared/focus-session-contract.md`
and `docs/user-guide/tools-quality.md`. The recording therefore binds to **candidate C**, the head that passes Approach step 0
and contains the merge of `develop`, so that the recorded bytes are the bytes that merge. Resolved
as step 0 prescribes, the four focus sources stay byte-identical to `974fe72e` and `build.mjs`
changes; step 0 verifies this. All 16 items are recorded on C even though the failure rule would
allow the failed-deletion item to carry over on identical bytes: every other item last passed on
different bytes, and one binding keeps the record simple for a scenario that takes minutes. Below,
"C" is this plan's shorthand; the page already has a phase C, so its headings, matrix and notes
always write C's short commit hash instead. (The published C failed entry used `#### C:` headings;
D's record does not copy that precedent.)

**Revision (2026-11-12): candidate D (`887ba1fd`; superseded by the `85728d95` revision below).** The recording on C (`a2e97ad8`) failed at its first
scenario: the cap-loop observer's snapshot ended after its verdict headline with the fragment
`< t3 >`, and the failed entry is on the page (`5d4fb583`). A read-only diagnosis tied that fragment,
and the 2026-11-09 `< t3-thread>` output, to the host's rule to mention threads by their link: about
1% of assistant messages that carried a T3 thread link ended at a malformed link, focus or not. The
cause is not proven. By owner decision (2026-11-12, option A) the fix `887ba1fd` makes focus name
every session by its exact reference in inline code (on T3 the bare thread ID) and never as a host
thread link, and exempts the checkpoint line, whose `target=` stays raw. The recording now binds to
**candidate D**, head `887ba1fd`: C plus the failed entry and the fix, with no further merge of
`develop`. The fix changes `src/tools/focus.md` and `src/shared/focus-follow-up.md`, so no item
carries over and all 16 are recorded on D. The page has a phase D too, so its headings, matrix and
notes write D's short commit hash (then `### F record for candidate 887ba1fd`, `#### 887ba1fd:
candidate binding`, `#### 887ba1fd: F1` …), never `D:`; "D" is this plan's shorthand only.

**Revision (2026-11-12, second attempt on D, then `887ba1fd`; superseded below).** D's first recording window failed at its first
scenario: `O2`'s opening snapshot was complete but cited the target as a well-formed Markdown host
thread link, although the observer had read the naming rule; the T3 host instruction prevailed. The
failed entry is on the page (`57fc72ab`). By owner decision (2026-11-12) the link rule is relaxed and
the host prerequisite extended: a well-formed host thread link to the right session in an otherwise
complete message is a limitation, counted and reported, while a malformed link fragment, a link or
ID naming the wrong session and an incomplete report stay defects. The qualified
`developer_instructions` entry gains a sentence that applies the naming rule to every focus turn
(SHA-256 `c19e3da3…`), as a cheap containment whose effect against the host instruction is
unproven. D's sources are unchanged, so the binding and its digests stay; the owner grants one
further allowance on D, and all 16 items are recorded in new install windows from window 2 on.

**Revision (2026-11-12, candidate `85728d95`; superseded by the `024bcb2a` revision below).** Window 2 on `887ba1fd` failed. In the main
observer, a complete second snapshot of a target ended without the owed follow-up offer, because the
operator had answered "no follow-up" to that observer's earlier offer for the same target. The
failed entry is on the page (`486aa2fc`). By owner decision (2026-11-12, option 1) the fix
`85728d95` adds one sentence to the eager core of `src/tools/focus.md` "Follow-up mode": a declined
or withdrawn offer never suppresses the offer of a later snapshot that meets the eager offer
condition. A contract test guards the sentence and its position before the lazy include. From this
revision on, **D names `85728d95`**; `887ba1fd` and its two windows are history. Headings always write
the hash (`85728d95`), so the shorthand stays D. The new D changes
`src/tools/focus.md`, so its digests are new, steps 0 and 2 rerun, and all 16 items are recorded.
The relaxed link rule and the extended host configuration (`c19e3da3…`) carry over unchanged.

**Revision (2026-11-13, candidate `024bcb2a`).** Window 1 on `85728d95` observed all 16 items, but
two end events (F6, then the F12 cap) passed the schedule ID to `delete_scheduled_task` without its
`scheduled-task:` prefix, received `task_not_found`, and the schedules kept firing until the owner
deleted them. The owner first accepted the F6 occurrence as a limitation and, when it recurred at
F12, reclassified it as a defect (2026-11-12). The failed entry is on the page (`60e817d4`). The fix
`855b0616` defines the handle once in `src/shared/focus-follow-up.md` "Scheduling" as the complete
ID returned by `schedule_task`, prefix included, passed unchanged as `scheduledTaskId`; a contract
test guards it. Merge `024bcb2a` then brought in `origin/develop` (`fe0624d4`); its only conflict
was two neighbouring `CONTEXT_BUDGET_LINES` rows in `build.mjs`, and the built focus files stay
byte-identical to `855b0616`. From this revision on, **D names `024bcb2a`**; `85728d95` and its
window are history, and headings write the hash (`024bcb2a`). D changes `src/shared/focus-follow-up.md`,
its built copy and `build.mjs`, so its digests are new, steps 0 and 2 rerun, and all 16 items are
recorded. The relaxed link rule, the extended host configuration (`c19e3da3…`) and the re-offer rule
of `85728d95` carry over unchanged. The second deviation of that window, a later snapshot whose
offer lacked its disclosures, stays an accepted limitation (owner decision, 2026-11-12) and is not
fixed by D.

**Revision (2026-11-13, recording on D).** D was recorded in two install windows on 2026-11-13,
with no observed defect. Window 1 (installed 09:04:49 UTC) is valid until 12:47:50 UTC, when an
external DALO reorganization replaced the skill slot with the released 1.72.0 and removed the
original DALO source; the window was closed against the new DALO state and its later outputs are
invalid. Window 2 (installed 13:31:54 UTC, hold extended to about 19:45 UTC) used the new DALO slot
as its baseline; at 13:40:00 UTC `~/.codex/AGENTS.md` was rewritten with a German chat rule and a
no-native-subagents rule, which the owner accepted as host environment, so observer output is
German from then on. Before the fault, window 1 observed F1, F2, F4–F7, F9–F11, F13 and F14;
window 2 observed F8, F15 and F16. By owner decisions (2026-11-13) two items are recorded as
limitations instead of passes: F3, because three attempts never produced a Looping report (the
observer reported the blocker once and then stayed quiet), and F12, because the cap loop ended
three times without reaching the cap (window 1 at tick 43 by the DALO fault; window 2 by context
compaction at tick 24 and at the 22nd fire, both stopped as `src/shared/focus-follow-up.md`
"Deletion safeguard and stopped ticks" requires). The record therefore holds 14 passes and two
owner-accepted limitations, and the remaining steps 7–10 proceed on that basis.

**Why Documentation (`effective-flow docs`):** the deliverable is an operator acceptance record and
status text. The product change and its guard already exist on the candidate; the recording adds no
behaviour. An autonomous build delegate cannot produce T3/Codex host evidence, so a supervised
coordinator drives the scenarios and the `docs` run writes them down. Step 0 is a prerequisite
integration outside the `docs` run.

## Outcome checkpoint

**Primary source:** sebastian-software/effective-flow#613, canonical planning comment (WP2b section)
**Original outcome:** A developer can have Effective Flow supervise one explicitly selected session
over time. This means:

- evidence-backed drift and loop detection;
- quiet unchanged ticks and no repeated nudges;
- honest capability limits;
- clean stop, pause and resume;
- reuse of focus's existing progress and authority rules.

**Last evaluated attempt:** Recording on D (`024bcb2a`), windows 1 and 2, 2026-11-13: no observed
defect; 14 items passed, including F6's end-event deletion with the complete handle (the
regression of `85728d95`), and F3 and F12 were accepted by the owner as limitations. Window 1 closed without a link restore (its original DALO source was gone);
window 2 was restored to its own pre-install baseline; no schedule remains.
**No-progress count:** 0
**Cumulative approach:**

- done: WP0 spike (go), WP1 gate-disabled follow-up mode (`2b1e0f4`), WP2a snapshot
  requalification (`a3e6c40`, history since `23ea36e3`);
- done: WP2b-1 enabling candidate `a11beb70` with the digest guard;
- done: recorded failures and contract fixes `21f2a368` (exact checkpoint endings) and `974fe72e`
  (failed end-event deletion);
- done: integration candidate C (`a2e97ad8`), its failed recording (`5d4fb583`), the link
  diagnosis and the naming fix `887ba1fd`;
- done: `887ba1fd`'s first window and its failed entry (`57fc72ab`); link rule relaxed and host
  prerequisite extended (owner decision, 2026-11-12);
- done: `887ba1fd`'s window 2 and its failed entry (`486aa2fc`), and the re-offer fix `85728d95`;
- done: `85728d95`'s window 1 and its failed entry (`60e817d4`); offer disclosures accepted as a
  limitation, the stripped schedule ID reclassified as a defect (owner decisions, 2026-11-12); the
  handle fix `855b0616` and the merge of `develop` `024bcb2a`;
- done: the recording on D (`024bcb2a`), windows 1 and 2 (2026-11-13): 14 passes, F3 and F12 as
  owner-accepted limitations, no defect;
- open: the follow-up issue on offer disclosures, the `docs` record of steps 7–8, the digest
  fixture and #625 with `Closes #613` (steps 9–10).

No new tool, worker, script or focus-owned runtime state. New operating duty, accepted by the owner
on 2026-11-10: the conditional Codex tick instruction is a documented host prerequisite of the
qualified path.

**Remaining proof:** a record of all 16 items for D, each passed or accepted by the owner as a
limitation (F3, F12; 2026-11-13), including no missing checkpoint across the first scheduled tick
and every recorded loop, every report complete (an offer on every
snapshot that meets the eager offer condition, also after an earlier decline), every end-event
deletion passing the complete handle and, except for F8's provoked failure, confirmed, and no malformed
link fragment and no wrong-session link or ID in any visible focus output; the cause of the
malformed-link output is unproven, so only the record can show how far the naming rule and the
host prerequisite contain it.
**Continuation decision:** Continue within authority. Owner decisions named in this plan (2026-11-05,
2026-11-06, 2026-11-10, 2026-11-12, 2026-11-13) take precedence; the #613 planning comment governs otherwise. Next observable proof: the
record above. Attempt allowance: 1 for C, used up on 2026-11-11; 2 for `887ba1fd`, used up on
2026-11-12 in windows 1 and 2; 1 for `85728d95` (owner decision, 2026-11-12, option 1), used up on
2026-11-12; by owner decision (2026-11-12, "defect, fix first") for the full recording on D (`024bcb2a`):
allowance: 1; remaining: 0 (used by the recording on 2026-11-13, which found no defect; the
reset of the no-progress count to 0 retires the special allowance). For steps 7–10: allowance: 1;
remaining: 1, with the same stop condition (a defect from review or CI goes through the failure
rule). Stop condition: an
observed defect ends this allowance through the #613 failure rule, and the owner decides on any
further candidate.

## Architecture decisions

- **Integrate before recording** (2026-11-10). `origin/develop` is merged into #625's branch first
  (step 0) and the recording binds to that integrated head, so the record proves the merge head rather
  than a predicted byte identity. The conflict resolution follows the rule `develop` added to
  the acceptance page: the first activation of a route removes the contract's pending-qualification
  sentence, the selection rule's deferral to it and their tests, and replaces the pending wording
  of the `catalogHint`, the frontmatter `description` and the user guide.
- **Qualified host configuration** (owner decisions, 2026-11-10 and 2026-11-12). The conditional
  `developer_instructions` entry documented verbatim on the acceptance page (SHA-256 `38c613f6…`),
  extended by one final sentence applying focus's naming rule to every focus turn (SHA-256
  `c19e3da3…`), is active throughout the recording; `#### 024bcb2a: candidate binding` shows the
  extended text verbatim. The tick part applies to tick turns only; the naming sentence also covers
  snapshot turns, so it is a prerequisite of the qualified naming on both rows, not of report-only
  correctness. A pass enables the T3 observed rows. The entry
  applies to follow-up tick turns only, so it is a documented host prerequisite of the follow-up
  row; the report-only row records that the entry was active and that non-tick turns are outside
  its text. The
  gate cannot detect the entry at run time, so the requirement lives on the acceptance page and in
  the user guide, not in a focus source. What is qualified is a Codex `developer_instructions`
  value with exactly this text, on the model and effort recorded in the binding, in a configuration
  file holding only that entry. Combining it with other configuration keys or another
  `developer_instructions` value is untested, and the page says so. A default Codex configuration
  is not qualified; the observed consequence is extra visible commentary on quiet ticks, with no
  change to reads or authority.
- **The F section continues additively.** `## F follow-up qualification (#613)` already holds the
  failed attempts of 2026-11-06, -08 and -09 and every published failed entry through `60e817d4`,
  which stay unchanged. The passing record is one new
  dated `### F record for candidate 024bcb2a` subsection at the end of that section, before "Acceptance
  matrix", with `#### 024bcb2a: candidate binding`, one `#### 024bcb2a: F1` … `#### 024bcb2a: F16` subsection per
  checklist item, and `#### 024bcb2a: limitations`, so no heading collides with the attempts above
  (the `85728d95` failed entry already uses `#### 85728d95:` headings). It
  reuses the established read-ledger table
  (`| Call | Native selection | Charged upper bound | Result |`). No note on the private
  2026-11-09 retests is written (owner decision, 2026-11-13): F8 on `85728d95` and D's F8 supersede
  them, and their evidence lies outside `candidate-024bcb2a/`.
- **Eight-entry digest table.** `#### 024bcb2a: candidate binding` lists SHA-256 for `src/tools/focus.md`,
  `src/shared/focus-session-contract.md`, `src/shared/focus-follow-up.md`,
  `src/shared/retro-native-sources.md`, `build.mjs`, and the built portable `tools/focus.md`,
  `shared/focus-follow-up.md` and `shared/retro-native-sources.md` under
  `dist/portable/effective-flow/`, in the E `| Path | SHA-256 |` layout. Only after all 16 items
  passed or were accepted by the owner as limitations (F3, F12; 2026-11-13) are the seven guard entries of `test/fixtures/focus-digests.sha256` set to the
  corresponding record rows. Until then the digest guard stays red on #625 by design; updating the
  fixture earlier would claim acceptance that does not exist.
- **No host thread links in focus output** (owner decisions, 2026-11-12; relaxed after D's first
  window). Every visible observer message in every scenario, commentary included, should name
  sessions by the bare reference in inline code. A well-formed host thread link to the session the
  sentence names, in an otherwise complete message, is a limitation: counted per observer and
  reported. A malformed link fragment (any match outside a well-formed link, such as `< t3 >` or
  `< t3-thread>`), a link or ID naming the wrong session and an incomplete report are observed
  defects under the failure rule. The checkpoint line keeps a raw `target=`: the bare thread ID,
  without backticks or scheme; a link there is a malformed checkpoint.
  - **Complete reports** (C's actual harm was a lost report, not only a link): every visible
    snapshot, tick or end-event report in every scenario carries the fields `src/tools/focus.md`
    "Snapshot verdict" requires, and the offer wherever the eager offer condition holds. This
    covers each loop's opening snapshot, F1's second snapshot after the decline, F14's resume offer
    and the F5, F6 and F8 end-event reports.
    An incomplete or truncated report is an observed defect, with or without a link fragment.
  - **Scan scope:** every assistant message of each observer, top-level or delegated (the child of
    `P`), final and commentary, including notification-run turns. User and tick prompts, tool
    results, reasoning, the analysis leaf's own records and `P`'s own messages are out of scope.
  - **Patterns** (case-insensitive): a well-formed link is `[text](<t3-thread://v2/<env>/<id>>)`,
    with or without the angle brackets, whose ID is a known session; it is recorded separately and
    removed before the defect patterns run. The defect patterns are `t3-thread:`, `<\s*t3`,
    `<[a-z][a-z0-9+.-]*:` and a Markdown link to any scheme. A match inside backticks counts too.
  - **Session mentions:** a message names a session when it contains a known session ID or a link
    to one. For each such mention outside the checkpoint line, the scan records whether it is the
    exact full ID inside one inline-code span. A non-conforming mention without a link (no
    backticks, an abbreviated ID, a title) is counted and reported in the limitations; an ID that
    does not match the session it names is an observed defect (owner decision, 2026-11-12).
  - **Per observer** the scan records the number of messages scanned, the number naming a session,
    the conforming and non-conforming mentions, the well-formed links, incomplete reports, offers
    without their disclosures, the `delete_scheduled_task` calls and how many carried the complete
    handle (see "Complete schedule handle"), that the T3 message text equals the Codex session
    record's output byte for byte, and every match.
  - **Text mismatch** (owner decision, 2026-11-12): when the T3 text and the Codex record differ, the
    difference is evidence of a host or transport fault. That scenario is invalid and is retried on
    D without consuming the allowance, as under "A host or transport fault ends a loop"; after two
    such retries of the same item the owner decides.
  - **Timing:** the coordinator scans each observer's new messages after every scenario turn,
    during loops at least once per hour, and always before starting the next item or `O2`, so that a
    defect stops the scenarios at once.
  - **Storage:** only these counts, matches and digests go into the published record. Copied raw
    session records, which hold the host system prompt, stay only in the private evidence root.
  - **Limitations:** `#### 024bcb2a: limitations` states the link diagnosis, that the cause is
    unproven, and that the naming rule and the extended host prerequisite are the containment under
    test and not a proven fix. It gives the number of well-formed links per observer, that
    `887ba1fd`'s window 1 showed the host link instruction overriding the focus rule, and that the remaining
    risk is a truncated report, which the completeness check catches. It gives N, the number of
    session-naming messages scanned, and the approximate 95% upper bound of about 3/N on the
    per-message rate of malformed fragments, and notes that the earlier ~1% rate counted messages
    carrying a link, a different population. It gives the number of `delete_scheduled_task` calls
    per observer and states that on `85728d95` the stripped ID occurred only in the long-context
    observers (`O4` at F6, `O2` at the cap), so the fix's effect there rests on those few calls.
  - **Withdrawn offers:** the record exercises a declined offer only; the limitations state that
    a withdrawn offer (an unrelated turn after the offer) followed by a later snapshot is not
    recorded.
  - **Offer disclosures** (owner decisions, 2026-11-12 and, for D, 2026-11-13): an offer that names
    the intervals but omits some or all of the offer's disclosures, in an otherwise complete report
    whose opt-in works, is a limitation, counted per observer and reported in
    `#### 024bcb2a: limitations` with a link to the follow-up issue. In an approval-required
    observer (`O4`), the approval disclosure of `src/shared/focus-follow-up.md` has two required
    elements: each tick asks for approval of its reads and its deletion, and a pending approval
    holds the next tick in the host queue. An `O4` offer missing either element is an observed
    defect, since that warning is part of honest capability limits; the coordinator rules on the
    verbatim offer before `O4`'s opt-in turn and stores it in the evidence root. A missing offer
    stays a defect. The coordinator files the follow-up issue on the tracker after the step 6
    restore and its publication scan, and before the `docs` run starts; it is filed even when D
    shows no omission, since D does not fix the known limitation. By owner decision (2026-11-13)
    the same issue also tracks the F3 and F12 limitations (Looping not reported; cap and cap-tick
    deletion not observed on D).
  - **Host rendering** (owner decision, 2026-11-12): if the T3 UI itself renders the inline-code ID
    as a clickable link, that is a host-rendering limitation, not a focus defect. The run then
    corrects the plain-text sentence in `docs/user-guide/tools-quality.md` (not digest-bound) and
    states the limitation. The same correction applies when the scan records any well-formed link:
    the sentence then says that focus asks for the bare ID and a host that asks for thread links
    can still produce one.
  - **Synthetic targets** never mention threads or links, so that no cited evidence carries a link.
- **Complete schedule handle** (owner decision, 2026-11-12). Every `delete_scheduled_task` call in
  every scenario (end events, F14's stop, a stopped-tick retry and a deletion after a failed opt-in
  update) passes the complete handle, `scheduled-task:` prefix included, exactly as the checkpoint
  records it. The scan tooling extracts every such call from the Codex session records, compares
  its `scheduledTaskId` with the ID the loop's `schedule_task` call returned, the tick prompt's
  `handle:` and the checkpoint's `handle=`, and runs on the link scan's timing; the
  coordinator also checks the T3 UI state after each call. A shortened or prefix-stripped ID, or a
  `task_not_found` outside F8's provoked UI deletion, is an observed defect; this is the regression
  check of `85728d95`'s failure. In approval-required mode the owner sees the argument in the
  approval prompt: a stripped ID seen there is the observed defect, the owner answers the prompt
  unchanged (a decline would count as an explicit stop and add a second deletion), the coordinator
  records it, and the failure rule applies.
- **Recording on 2026-11-13 (owner decisions).** These bind the `docs` run:
  - **Two windows, one record.** `### F record for candidate 024bcb2a` cites each item from the
    window that observed it; the binding lists both windows with install, integrity and restore
    checks. Window 1 is valid until 12:47:50 UTC; outputs after it (released 1.72.0 in the slot)
    are listed as invalid and not cited as evidence. Its close could not restore the original DALO
    link because DALO had removed that source; this is stated, not hidden.
  - **Restore baseline per window.** From window 2 on, a window's restore target is the DALO state
    captured before its own install (`window-<n>/baseline.json`), and `dalo status --check` is
    compared with that window's pre-install capture.
  - **F3 limitation:** in three attempts (window 1 twice, window 2 once) the target repeated the
    same failing step across tick windows; attempt 1's repetitions were coordinator-requested, so
    under step 5's rule it was no valid provocation and the limitation rests on attempts 2 and 3,
    while `85728d95` produced Looping once under a similar arrangement; and the observer reported the blocker once (window 2 also
    a changed blocker), then stayed quiet on On track or Cannot judge, never Looping. The quiet
    ticks and once-only reports were correct; Looping was not reproducibly reported.
  - **F12 limitation:** the cap was not reached on D. The record gives the three loop ends, the 43,
    23 and 21 completed ticks without a missing checkpoint (the first compaction fire posted two
    checkpoints, tick 23 active and tick 24 stopped), and both compaction stops: no target read,
    the deletion safeguard applied (once with a deletion, once with the delete-in-T3 notice and a
    dash-field stopped line), and later fires posted as exact stopped ticks. F16 records the tick
    counts at compaction and the quiet-tick growth (8 `activity` items, about 37,200 characters; 2
    `messages`, about 1,800 characters). The limitations state that the cap-tick deletion, where
    `85728d95` stripped the handle, was not exercised on D; D's long-context deletion evidence is
    `O4`'s F6 deletion and `O2`'s deletion at the first compaction stop.
  - **F15:** passed with the owner's UI Steer into an operator turn without a focus prohibition;
    earlier attempts that were not clicked, and one Steer into a turn that forbade focus actions
    (no tick ran), are listed as not provoked.
  - **Host-environment limitation:** from 13:40 UTC in window 2 the qualified configuration ran
    together with the rewritten `~/.codex/AGENTS.md` (German chat rule; no native Codex subagents,
    `delegate_task` only); observer output is German, the offer-disclosure scan's English patterns
    were complemented by a manual check of German offers, and the larger context is a plausible
    contributor to the compactions. The record states, from the Codex records, whether window 2's
    reporting ticks dispatched the analysis leaf, or that this was not checked. German observer
    output is quoted verbatim, sanitized, with an English gloss.
  - **Valid outputs only.** Window 1 outputs after 12:47:50 UTC (including `O` ticks 24 and 25 and
    `O2` ticks 44 and 45) are invalid and listed as such; the scan, delete-call and checkpoint
    criteria cover valid outputs only.
  - **Window-qualified pseudonyms and the rescan.** Window 2 reused `O` and `O2`, which overwrote
    window 1's final `O` message scan. Before the `docs` run the coordinator reruns the message and
    schedule scans for window 1's `O` from the retained T3 messages and Codex records, limited to
    messages before 12:47:50 UTC, stores them under `window-1/`, and adds them to the evidence digest
    table (owner decision, 2026-11-13). The record names every observer with its window, for example
    "`O` (window 1)".
  - **Evidence completion before the `docs` run** (owner decision, 2026-11-13). The coordinator, read-only on
    the retained T3 messages and Codex records, extracts into sanitizable files under `window-<n>/`
    the per-item evidence the record needs but the root lacks (F1's second-snapshot read ledger,
    identity, scope, redaction and analysis-leaf verdict; F2's idle report and quiet tick; F4's
    quiet ticks during the long wait; F13's tick prompts; per-observer incomplete-report counts;
    the WP0 re-observations), rescans window 1's `O` and `O2` limited to output before 12:47:50 UTC,
    copies the F8 screenshots into the root and stores the follow-up issue reference there. What
    the records cannot give (the authenticated T3 UI rendering of the target ID, and the trusted
    host context of step 4: `orchestrator_capabilities`, host and T3 versions, model and effort) is
    re-observed in a short install window 3 on D: one snapshot, the owner checks the UI rendering,
    the coordinator captures the trusted context, with the usual install, integrity and restore
    checks of steps 3 and 6. Then the root is frozen; the `docs` run writes "not captured" for any
    field without a file and never fills one from memory.
  - **Schedule state by host API** (owner decision, 2026-11-13). The host's `list_scheduled_tasks`
    listing is accepted as schedule-state evidence and labelled as API in the record; the UI
    evidence of F8 and F15 is cited where it exists.
  - **Home path in observer output** (owner decision, 2026-11-13): `O2`'s window-2 compaction-stop
    message carried a Markdown link to the absolute slot path of `shared/focus-follow-up.md`. It is a
    counted limitation under the redaction rule of `src/shared/focus-session-contract.md`, quoted as
    a tilde slot path, and tracked in the follow-up issue.
- **Portable artifact only.** The candidate is loaded as the portable build. Native maintainer
  builds are not qualified; the page states this as an accepted residual risk.
- **Separate sessions and supervised turns.** Every observer thread (`O`, `O2`, …) is a fresh T3
  thread on provider instance `codex` used only for scenarios. The session that runs
  `effective-flow docs` and writes the record is a different thread, so `bindToCurrentThread` ticks
  never interleave with the docs workflow. The owner authorizes a coordinator to perform steps 0–6
  and send scenario turns under human supervision (owner decision, 2026-11-06, superseding the
  earlier human-typed-turn requirement in this plan). "Operator" in step 5 therefore means the
  coordinator, except for the owner-only actions below. Record actual turn authorship and whether host
  actions used an API or the UI; never present an API action as UI evidence. A UI observation comes
  from the authenticated T3 UI. A real host approval prompt is answered by the owner, never by the
  coordinator; a scenario needing an unavailable UI action stays unrecorded until the owner performs
  it. One documented exception (owner decision, 2026-11-06): for the F1 ancestor refusal the
  observer is a delegated child of `P`, which can only be created through `P`'s delegated task, so
  that task is the deciding turn, as in E.
- **Coordinator first, `docs` after the restore** (owner decision, 2026-11-06). Steps 1–6 run
  without any Effective Flow run: the candidate swap requires that no other Codex work runs, and
  every app-server restart would interrupt one, so the coordinator session must survive a restart
  (a non-Codex session qualifies). `effective-flow docs` starts only after the step 6 restore, on
  the released skill, and writes the record from the evidence root.
- **Pseudonyms and evidence root.** Threads use role letters as in WP0 and E: `O`, `O2`, …
  (observers), `T`, `T2`, `TL`, `T4` (throwaway targets), `P` (parent for the ancestor refusal); schedule
  handles are `H1`, `H2`, … Pseudonyms replace real values also inside quoted checkpoint lines and
  tick prompts. Raw evidence (pseudonym register, unsanitized observer excerpts, T3 UI captures,
  `orchestrator_capabilities` results) stays in an evidence root under the main checkout's ignored
  `.effective-flow/` directory, so it is never staged and outlives the recording worktree; the page carries a SHA-256 table of those evidence files, as WP0
  "Raw evidence" does. Each candidate's evidence goes to one fresh subdirectory (D: `candidate-024bcb2a/`; `85728d95`'s stays in `candidate-85728d95/`, `887ba1fd`'s in `candidate-d/`), created before step 0; the digest table and the `docs` input are limited to it, so earlier attempts cannot mix in. D's limitations cite the published failed entries (`5d4fb583`, `57fc72ab`, `486aa2fc`, `60e817d4`) rather than private files in earlier candidate directories. Published paths are tilde-relative skill-slot paths only; absolute user
  paths, thread IDs, schedule IDs and screenshots stay in the evidence root.
- **Line stability above "Observed run and corrections".** Several files cite acceptance-page line
  numbers in its first ~115 lines (`docs/developer-guide/focus-labelling-rubric.md`,
  `docs/developer-guide/focus-session-shape-observations.md`, `evals/_scaffold/session-shapes.mjs`)
  and lie outside this run's allowed diff. Edits to lines 1–60 (status line and "Recorded bindings"
  note) keep that region's line count unchanged. The "Recorded bindings" rewrite keeps the bold
  marker `**Recorded bindings.**` verbatim and the E limitations sentence containing "supersedes
  that blanket release obligation" untouched: `test/focus-contracts.test.mjs` slices the page at
  that marker and asserts that sentence. All other new text goes after the E section.
- **ADR notes, not ADR rewrites.** Each ADR gets one dated status note under `## Status`; the
  decision bodies stay unchanged. The note states the current state and names the F record.
- **Failure handling stays on #625's branch** (owner decision, 2026-11-06). A failed F entry is
  committed there as failed, and its fix lands on the same branch through `effective-flow fix`.
- **Not-yet-provoked is not failed** (owner decision, 2026-11-06). An item the host does not
  produce in a run (no notification run, a compaction before the cap) without a product defect stays "not yet
  recorded" and is retried on the same candidate; the failure rule applies only to an observed
  defect. #625 stays a draft until all 16 items passed or were accepted by the owner as limitations (F3, F12; 2026-11-13).
- **PR review precondition** (owner decision, 2026-11-06). The internal build review of WP2b-1
  (5 findings fixed, 0 open) and passed CI satisfy "review and CI are settled"; no published PR
  review is awaited before recording. The automatic review that follows marking #625 ready is
  handled after the record; a fix from it follows the failure rule.

## Affected files

| File                                                           | Description                                                            |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `docs/developer-guide/focus-host-acceptance.md`                | Passing F record; record edits of Approach step 7                      |
| `docs/user-guide/tools-quality.md`                             | Host prerequisite sentence for the follow-up mode                      |
| `docs/adr/pragmatic-test-release-policy.md`                    | Dated status note under `## Status`                                    |
| `docs/adr/focus-cross-session-messages.md`                     | Dated status note under `## Status`                                    |
| `docs/plan/2026-11-06-focus-follow-up-qualification-record.md` | This plan; lies in the worktree and is archived by the run             |
| `test/fixtures/focus-digests.sha256`                           | Set to D's digests in a separate commit after all 16 items are settled |

C's integration merge (2026-11-10) additionally resolved `build.mjs`, `src/tools/focus.md`,
`src/shared/focus-session-contract.md`, `docs/user-guide/tools-quality.md`, the pending tests in
`test/focus-contracts.test.mjs` and, where it asserts the pending refusal, `test/focus-eval.test.mjs`.
`887ba1fd`'s fix commit additionally changed `src/tools/focus.md`, `src/shared/focus-follow-up.md`,
`test/focus-contracts.test.mjs` and `docs/user-guide/tools-quality.md`; the re-offer fix
`85728d95` changed `src/tools/focus.md` and `test/focus-contracts.test.mjs`; the handle fix
`855b0616` changed `src/shared/focus-follow-up.md` and `test/focus-contracts.test.mjs`; the merge
`024bcb2a` changed `build.mjs` (the `iterate`, `setup`, `refactor` and `fix` budget rows from
`develop`, two of them in conflict) and files outside focus. After D, the recording leaves every file under `src/`, `evals/` and
`build.mjs` unchanged, and under `test/` changes only the digest fixture. A later change to any of
them follows the edge case "Head changes before merge".

## Implementation details

### Approach

0. **Validate candidate D** (coordinator, outside the `docs` run). D is `024bcb2a`, the merge of
   `origin/develop` (`fe0624d4`) into the handle fix `855b0616`; no further merge is made.
   - Prove the source delta: `git diff 85728d95 855b0616` over the four focus sources and
     `build.mjs` touches only the "Scheduling" paragraph of `src/shared/focus-follow-up.md`;
     `git diff 855b0616 024bcb2a` over the same files touches only `build.mjs`, in
     `CONTEXT_BUDGET_LINES` rows other than `focus`; the built `tools/focus.md`,
     `shared/focus-follow-up.md` and `shared/retro-native-sources.md` of `855b0616` and `024bcb2a`
     are byte-identical. Earlier deltas are on the page.
   - Validation of D, through `t3-project`, on a clean checkout of `024bcb2a`. Each log goes to the
     evidence root `candidate-024bcb2a/` and records the head and a clean `git status`:
     - `pnpm agent:check`;
     - `test/focus-contracts.test.mjs` and `test/focus-eval.test.mjs`;
     - `node build.mjs`, with focus within budget;
     - `pnpm test:distribution`, in a container-local checkout when the worktree's Git projection
       blocks fixture repositories;
     - `pnpm eval <suite> verify --mode report` for the suites CI reports, since CI skips that step
       here.
       All must pass, except that the eval report only records stale evidence. Earlier candidates'
       logs stay in their own directories as history.
   - **Timeout rule** (owner decision, 2026-11-10): a local `pnpm test` that fails only in the known
     150-second host-driver module timeouts does not block; those timeouts are logged as failed and
     CI's unit-test step decides. Apart from those, the only permitted failure is the real-build
     digest guard reporting a digest mismatch.
   - **Flaky non-focus test** (owner decision, 2026-11-13): a CI failure in a test outside focus
     that passes on a rerun of the unchanged head counts as passed, with both attempts logged. This
     applies to step 0 and to the final head in steps 9 and 10.
   - **CI instead of a local full suite (deviation, 2026-11-12):** for D the local full
     `pnpm test` is replaced by CI's unit-test step on the exact head `024bcb2a`, which must fail
     only in the digest guard. Run `43320346579`, attempt 2, did (5,223 tests, 5,177 passed,
     45 skipped, 1 failed); its attempt 1 also failed in a host-driver recovery test unrelated to
     focus, which passed unchanged on rerun and is logged as a flake. `85728d95`'s run
     `43249974317` is history.
   - The head that passes this step is D. A further fix makes a new candidate.

   History: C's integration of 2026-11-10 merged `origin/develop` into #625's branch as a merge
   commit with the first-activation rule, proved the four focus sources and the user guide equal to
   `974fe72e`, and passed validation with the digest guard as the only failure. It is not repeated.

1. **Preconditions (before any host action).**
   - Reuse the existing recording worktree on #625's branch, which already holds this plan
     (untracked). Plan-PR continuation does not apply.
   - Confirm #625 is still a draft at head D. Also confirm that, since D's merged `develop` commit
     `fe0624d4`, `origin/develop` has changed no focus source, no fragment the built focus files
     include and not `build.mjs`. A changed focus source or included fragment, or a changed head,
     is a new candidate: stop and re-plan the binding. A `develop` change to `build.mjs` alone does
     not stop the recording; it is handled after the record under "`develop` advances before
     merge".
   - Do not update the branch from `develop` during recording.
2. **Build and bind** (tooling through `t3-project`, as for E). In the worktree run
   `pnpm agent:check`, `node build.mjs` and `test/focus-contracts.test.mjs`. Compute the eight
   SHA-256 digests into the evidence root; check that the built `retro-native-sources.md` equals its
   source digest. `test/focus-digest-guard.test.mjs` is expected to fail on the digest mismatch and
   nothing else. Record the version stamp of the built `SKILL.md`.
3. **Load the candidate** as in the 2026-11-09 retest: confirm no other Codex work is running and
   that `~/.codex/config.toml` is absent (if it exists, stop); record a `dalo status --check`
   baseline, the slot's symlink target and a full-tree manifest; move the DALO link
   `~/.agents/skills/effective-flow` aside and **copy** (never link)
   `dist/portable/effective-flow/` into the slot; write the qualified configuration and verify its
   SHA-256; use C's model and effort (`gpt-6.1-sol`, medium) for all observers, or record the
   difference in the limitations; restart the Codex app-server through the
   guarded restart (PID, executable and start time
   verified before the signal). Check that the installed `tools/focus.md`,
   `shared/focus-follow-up.md` and `shared/retro-native-sources.md` match the digest table and that
   `diff -r` against the build is empty, before the first scenario. No reinstall while a loop is
   active. The owner sets the maximum hold time of an install window beforehand and holds back
   other Codex work for it; otherwise the limitations state that other runs may have used the
   candidate and its configuration. Retrying a not-provoked item may use an interim restore and
   reinstall of the same D while no loop is active; each window repeats these checks and step 6,
   and the binding lists every window.
   - **Tooling for D:**
     - a copy of `85728d95`'s operations and scan scripts in `candidate-024bcb2a/`, the scan
       extended by the delete-call and offer-disclosure counts of "Per observer";
     - a calibration of the extended scan, before the first install, against
       `candidate-85728d95/window-1/`, logged in `candidate-024bcb2a/`: it must find the known
       prefix-stripped calls (`O4` at F6, `O2` at the cap tick and its stopped-tick retry), `O`'s
       four complete calls and `O`'s one offer without its disclosures; a miss stops step 3 until
       the scan is fixed;
     - one subdirectory `candidate-024bcb2a/window-<n>/` per window for the staged slot, manifests
       and state files, so no window overwrites another;
     - a fresh stage per window from a build whose manifest equals window 1's, built at head D;
     - the extended qualified configuration copied into `candidate-024bcb2a/`, with its SHA-256
       checked against `c19e3da3…` in every window.
   - **Active-work check:** before every guarded restart and every restore, in step 3, step 6 and
     any interim window, repeat the check that no other Codex work is running. If work is running,
     wait for it or ask the owner; never signal the app-server over it.
4. **Record trusted host context.** In each observer, capture the `orchestrator_capabilities`
   result naming the observer thread and provider instance `codex` into the evidence root, and
   record its sanitized form in `#### 024bcb2a: candidate binding`, together with host and T3 versions,
   harness, model, observer effort, runtime mode and the qualified configuration's digest.
5. **Record the 16 items** in checklist numbering, run per the allocation table below. Targets are throwaway top-level threads in a
   throwaway T3 project running a scripted synthetic task (described once in the binding, as E
   described its target). For each item record setup, trigger, expected observer output (cited by
   heading to `src/shared/focus-follow-up.md` or the contract), observed output (sanitized), the
   schedule state verified in the T3 UI or by the host API (labelled as such), turn authorship, and pass, fail or not yet recorded. Where
   reads occur, add a read ledger with totals against the 16-read and 64,000-character limits.
   Interval: 5 minutes unless an item needs otherwise. Every tick in every scenario, including each
   loop's first scheduled tick, must carry its required checkpoint with the exact ending; a missing
   or malformed checkpoint is an observed defect under the failure rule, and so are a malformed link
   fragment, a wrong-session link or ID and an incomplete report in any visible observer message; a
   well-formed link and an offer without its disclosures are counted ("No host thread links in focus
   output"). Every end-event deletion is checked under "Complete schedule handle". Setup per item:
   - **F1, snapshot requalification:** a positive snapshot of `T` recording identity, scope, redaction, cited evidence, one snapshot verdict and the analysis-leaf verdict; the output
     includes the follow-up offer, the operator answers "no follow-up", and the T3 UI shows no
     schedule. The identity appears as the bare thread ID in inline code; record how the
     authenticated T3 UI renders it (plain text expected; a clickable rendering is the host-rendering
     case of the link rule). Then self refusal and ancestor refusal via `P`, as R2/R3 in E (ancestor exception
     above). Send state "Not attempted". Last, with `T` idle, `O` takes a second snapshot of `T`,
     which must carry a new offer (regression of `887ba1fd`'s window 2); its read ledger is
     recorded, and if it served no history page the check is not provoked and is retried. The
     operator's very next turn opts in at 5 minutes, which starts `O`'s loop for F13 and F2.
   - **F2 quiet tick:** opt in on a target that has gone idle; the first tick owes the one-time
     idle-target report (follow-up "Idle target"); the next tick on unchanged evidence is the
     recorded quiet tick.
   - **F3 repetition:** the target script repeats the same failing step across two tick windows,
     and the target's request does not ask for that retry (a requested retry stays On track);
     the tick reports Looping once, and the following tick on unchanged evidence does not repeat it.
   - **F4 long wait:** the target runs a long silent test command across a tick; a quiet tick
     passes, Looping or Stalled fails. (An approval wait is a pending request and yields a
     once-only decision-needed report; if used instead, record that variant.)
   - **F5 completion:** the target finishes its task; the tick reports completion and deletes the
     schedule with the complete handle; the schedule list no longer shows it.
   - **F6 lost access:** delete the target thread before a tick (record which action was used); the
     tick reports lost access and deletes the schedule with the complete handle; the schedule list no longer
     lists it.
   - **F7 invalid checkpoint:** run this directly before F8, on `O`'s `T2` loop. The operator sends
     that loop's tick prompt into a fresh observer `O3` that holds no valid checkpoint. Expected: the tick stops before any host access, deletes
     nothing (no checkpoint names the handle), posts the one-time notice to delete the schedule in
     T3, and writes a stopped line with `-` fields and `ticks=1`; the T3 UI still shows the
     original handle active, and F8's UI deletion then removes it. Before that deletion, send the
     same tick prompt into `O3` a second time. Expected: a later stopped tick with `ticks=2`, the
     exact checkpoint ending, no repeated notice and no deletion.
   - **F8 failed deletion** (owner decision, 2026-11-06): let `T2` complete, delete the task in the
     T3 UI before the next grid fire, then the operator sends the tick prompt into `O` (a directly
     sent tick is a tick). Expected per "End events": completion is reported, the actual delete
     error is surfaced, the final notice states that deletion is unconfirmed, and the checkpoint
     ends `state=stopped`. A scheduled tick that ends the loop first leaves F8 not provoked; retry
     with a new loop. The owner may delete the schedule before `T2` completes, as on `85728d95`, to
     remove the timing pressure; the record states the order used.
   - **F9 overlap:** start an operator turn in the observer shortly before a due time and let it run
     past it, ending less than a minute before the next grid fire; record the queued run, that it
     answers no developer turn, and the next fire within a minute.
     - **F10 approval-required mode:** an observer in approval-required mode. The owner holds at least
       one tick's real approval past the next grid fire at the 5-minute interval, told the hold time in
       advance. Expected: one queued run, no overlap, and the exact checkpoint after approval.
     - **Approval-mode ticks** (owner decision, 2026-11-10): `O4` delivers at least three and up to
       five scheduled ticks in approval-required mode, including its first scheduled tick after a real
       approval. The raw native output of each goes to the evidence root.
   - **F11 host notification run:** a finished background command or similar host notification in
     the observer thread that is not treated as a tick.
   - **F12 and F16, cap loop:** a fresh observer `O2` at 5 minutes (48 ticks, about 4 hours), its
     first loop. F12 passes only when the loop reaches the cap and the cap tick deletes the schedule with the complete handle, confirmed in the T3 UI. If it compacts first (owner decision, 2026-11-10), F12 stays not yet recorded and F16 records the tick count at compaction; retry on a fresh observer, at most twice, then the owner decides (on 2026-11-13 the owner recorded F12 as a limitation after two compactions; see "Recording on 2026-11-13"). After a
     compaction stop, observe at least two later fires, record whether they post as stopped ticks
     with the exact ending and the T3 UI state, then delete the schedule rather than waiting for
     step 6. F16 records
     a real quiet tick's growth in the `activity` and `messages` views. Expected cost: on the order
     of hundreds of thousands of observer characters over a full loop.
   - **F13 skill load:** the scheduled turn loads the skill through the `$effective-flow` prefix, and
     the schedule's tick prompt carries the bare thread ID, not a link.
   - **F14 stop and resume:** `follow-up stop` (its deletion passes the complete handle), then an explicit resume that rechecks access, shows
     a new offer, and after the operator's opt-in creates a schedule under a new handle.
   - **F15 early send:** the operator sends a queued tick early through the T3 UI control, which T3
     labels "Steer" on the queued scheduled run (a queued tick exists only behind a busy turn or a
     pending approval, so run it with F9 or F10).
   - **WP0 limits re-observed:** for each WP0 single observation (busy-thread queueing, scheduled-turn
     skill load, `nextPosition` across runs, delete-then-continue) note whether this run confirms it.

   Allocation (parallel loops allowed in separate observers; one target per loop):

   | Observer     | Mode              | Target                     | Items, in order                                                                                         |
   | ------------ | ----------------- | -------------------------- | ------------------------------------------------------------------------------------------------------- |
   | `O`          | default           | `T` (then `T2`)            | F1 (no schedule until the re-offer's opt-in), F13, F2, F3, F4, F9, F15, F11, F14, F5 on `T`; F8 on `T2` |
   | child of `P` | default           | `T`                        | F1 ancestor refusal                                                                                     |
   | `O2`         | default           | `TL` (long-running script) | F12, F16 (start early, runs about 4 hours)                                                              |
   | `O3`         | default           | none (`T2` loop's prompt)  | F7, directly before F8                                                                                  |
   | `O4`         | approval-required | `T4`                       | F10, approval-mode ticks, then F6 (deletes `T4`)                                                        |

6. **Close the host side.** Re-check the installed-file digests and `diff -r` after the last
   scenario. Delete or stop every qualification schedule and confirm in the T3 UI that none remains
   active, and that schedules outside this project are untouched. Archive the throwaway threads.
   Restore the DALO link captured before this window's install, check its target and the full-tree manifest; remove the qualified
   configuration only after matching its SHA-256; restart the Codex app-server through the guarded
   restart; confirm the old process is gone and a new one has started once Codex is used again; and
   compare `dalo status --check` with the baseline in the same environment (`CLAUDE_CONFIG_DIR`
   unset in both, since it changes one hook target). Record all of it.
7. **Record edits in `focus-host-acceptance.md`** (only when all 16 items passed or were accepted
   by the owner as limitations, as on 2026-11-13; D is its short commit hash):
   - status line: snapshot-host execution and the follow-up mode are enabled on the T3 observed path,
     the follow-up mode under the documented host prerequisite, bound by the F record for D; sends
     stay disabled (same line count);
   - "Recorded bindings" note: F is the current binding for both rows; E and the page's phase D are
     history (same line count, marker kept);
   - "Acceptance matrix": the follow-up row states "Passed F on the bound candidate D, with the
     documented host prerequisite and the limitations in `#### 024bcb2a: limitations` (F3, F12 and window 2's host environment)"; the report-only row states "Passed F on the bound candidate D",
     notes that the entry was active and addresses tick turns only, and keeps E and the page's phase D
     as history;
   - host prerequisite: one dated statement after the record that the entry shown under
     "Experimental host prerequisite", extended by the naming sentence shown in the binding, is now
     the qualified configuration and that a default Codex
     configuration or a combination with other keys is not qualified, superseding that section's
     "future qualification attempt only", "not a production recommendation" and "remove it again"
     for this path without editing the dated section, and naming the recorded model and effort; in
     the follow-up paragraph of
     `docs/user-guide/tools-quality.md`, the same point with a link to that section, the file
     location, the recorded model and effort, and the required Codex restart, plus one sentence that
     qualification observed neither the loop's cap end nor a tick-level Looping report; the guide's
     snapshot paragraph stays free of the prerequisite;
   - checklist intro and closing paragraph: "merged candidate" becomes "the recorded candidate";
   - item 1: the suffix becomes "— recorded: F1 for D", replacing the "current activation
     still needs its applicable acceptance" clause;
   - closing paragraph: the actual order (enabling edits first on the unmerged candidate, then this
     record); the `catalogHint` keeps the candidate's wording in place of the pending wording; the `focus` and `build-context` eval rounds as
     post-merge debt; the ADR-strict rule (a later focus-source change, or a built focus change not
     documented as demonstrably nonbehavioral, brings a passing record for a candidate matching the
     merge head plus the updated digest file, or both rows disabled); the digest guard in
     `pnpm test` that enforces it; portable-only scope with native builds as residual risk;
   - "Evidence relationship": its closing sentence says a completed candidate-bound row is what can
     integrate an enabled host path into `develop`;
   - F binding: the evidence-file digest table, and a statement that no digest-bound file changed
     between D and the record commit.
8. **ADR status notes**, dated with the recording date:
   - `pragmatic-test-release-policy`: for focus, the applicable acceptance is the host acceptance
     record alone; the eval rounds are post-merge debt; names the F record.
   - `focus-cross-session-messages`: the report-only snapshot and opt-in report-only follow-up paths
     are enabled on the T3 observed path, the follow-up path under the documented host prerequisite
     and the F record's limitations (F3, F12); all sends stay disabled.
9. **Validate and deliver.** Run `test/focus-contracts.test.mjs` through `t3-project`. Archive the plan as Implemented and commit
   (`docs(focus): …` with `Refs #613`, no AI attribution). The `docs` run uses completion action
   `branch`, not `pr`: #625 carries the WP2b-1 plan marker, and a `pr` handback would rewrite its
   body and mark it ready before step 10. The coordinator then sets the seven guard entries of
   `test/fixtures/focus-digests.sha256` to the record's digests in a separate commit
   (`test(focus): …`, `Refs #613`), runs `pnpm agent:check`, `node build.mjs`, `pnpm test`,
   `test/focus-digest-guard.test.mjs` and `pnpm test:distribution` through `t3-project` (the guard
   must pass; step 0's timeout rule and container-local fallback apply), checks that `git status` is clean and that `git diff --name-only D..HEAD`
   lists only the four docs files, the archived plan and the fixture, and pushes both commits to
   #625.
10. **Pull request and issue, after the push.** Confirm CI passed on the pushed head (a rerun pass
    of a flaky non-focus test counts, per step 0). Edit #625's
    body: replace the "Recording (WP2b-2) pending: do not merge" notice with a record summary naming
    the F record, the host prerequisite and the limitations (F3, F12, window 2's host environment,
    with the follow-up issue) and stating that no digest-bound file changed since D;
    bring the rest of the body up to date (the not-yet-included WP2b-2 list, budget figures, the
    `catalogHint` statement, the validation text, and the naming rule with its user-guide sentence
    that `887ba1fd` added, the re-offer rule that `85728d95` added and the complete-handle rule that
    `855b0616` added); and use `Closes #613`. Post one comment on #613 naming the deferred steering items (issue
    user-flow step 6 and the criterion "Authorized steering reaches only the selected session…") and
    the deviations from its planning comment listed under Assumptions.
    Then mark #625 ready; an automatic review may follow and is handled under the failure rule.

### Edge cases

- **A scenario fails with a defect.** Stop further scenarios, end every loop, and run step 6. Commit
  the F entry as failed on #625's branch and push it by hand, without a `docs` handback and without
  archiving this plan; do not edit status texts, ADRs or #625's state. Both rows stay disabled on
  `develop`. The allowance is then used up and the owner decides whether a further candidate
  follows. If so, fix on the same branch through `effective-flow fix` with `Refs #613` and
  re-record on the new candidate, with fresh digests, the failed scenarios and every scenario whose governing rule lies in a source section the
  fix changed. Other items carry over only when the four focus sources and three built focus files
  are byte-identical between both candidates, and the record lists those digests on both; otherwise
  every item is re-recorded. F1 is always re-recorded.
- **A visible host thread link appears** in focus output: a malformed one, or one naming the wrong
  session, is an observed defect under the rule above; a well-formed link to the right session in a
  complete message is counted as a limitation and the scenarios continue.
- **An item is not provoked** (no notification run, an owner action not available):
  "not yet recorded"; retry on the same candidate; no failure rule, no new candidate.
- **Publishing text from the record.** Before every push, including a failed F entry, and before
  editing #625, filing the follow-up issue or commenting on #613, scan the diff and the text against
  the union of both pseudonym registers (`register.json` and `window-1/register-window-1.json`)
  and the prefix-anchored patterns `mcp:launch:`, `thread:delegated-task:`, `scheduled-task:`,
  UUIDs and absolute home paths (rewritten as tilde slot paths when quoted), and keep the result in the evidence
  root. Quoted checkpoint lines carry real `target=` and `handle=` values until pseudonymized. This
  plan stays unpublished until the step 9 archive commit and passes the same scan.
- **A host or transport fault ends a loop** with logged evidence of the fault and no product defect
  (earlier long loops ended at ticks 19 and 11 on MCP send failures): treat it as not provoked,
  invalidate that loop, and retry on D without consuming the allowance. After two such retries of
  the same item the owner decides. A missing checkpoint without such evidence is a defect.
- **The qualified configuration is absent or differs during a scenario** (for example a restart that
  lost it): that scenario is invalid; verify the digest again and re-run it. It is not a pass.
- **Digest mismatch at step 2, 3 or 6.** Stop before (or invalidate) the scenarios and resolve;
  never record against unverified bytes.
- **Head changes before merge** (review fix, CI fix, branch update): if any of the eight digests
  changes it is a new candidate under the failure rule, unless the maintainer documents a built-only
  or `build.mjs` change as demonstrably nonbehavioral on the page, in which case it is drift and the
  digest file is updated in the same push; a focus-source change is never exempt.
- **`develop` advances before merge.** A branch update is allowed after the record only if a
  rebuild shows the seven guard digests unchanged; a `build.mjs` difference goes through the
  documented nonbehavioral path above.
- **Leftover schedules:** step 6; a schedule that cannot be deleted is recorded with its state.

### Component structure

Not relevant: documentation only.

### State management

Not relevant: no product state; schedules are throwaway host state removed in step 6.

### API integration

Not relevant.

### Styling approach

Not relevant.

### Accessibility

Not relevant.

## Acceptance criteria

- [ ] Candidate D is `024bcb2a` on #625's branch, contains the merges of `origin/develop` without
      rebase or force-push, differs from `85728d95` in the focus sources only by the "Scheduling"
      paragraph of `src/shared/focus-follow-up.md` and in `build.mjs` only by non-focus budget rows,
      and CI's unit-test step on D failed only in the digest guard; the step 0 checks for D passed,
      with their logs naming the head in the evidence root.
- [ ] F1's second snapshot of `T` after "no follow-up" served a history page and carries a new
      offer, and the record's F1 lists it with its read ledger.
- [ ] The scan of "No host thread links in focus output" lists, per observer (the child of `P`
      included), the messages scanned, the session mentions with their conformity, byte equality
      between T3 and Codex texts, the well-formed links, zero defect matches, zero incomplete reports
      and no mismatched ID; every
      recorded checkpoint keeps a raw `target=`; F1 records how the T3 UI renders the ID, and the
      user guide sentence matches that observation.
- [ ] Every `delete_scheduled_task` call of the record passes the complete handle with its
      `scheduled-task:` prefix, as the per-observer delete-call counts show; F5, F6 and F14's stop
      each show their schedule deleted and absent from the schedule list (host API, labelled), the
      F12 loops show `O2`'s compaction-stop deletion by focus and `O2b`'s deletion by the coordinator
      API, and the only
      `task_not_found` is F8's provoked one.
- [ ] Every offer without some of its disclosures is counted in the limitations, none of them is an
      approval-mode offer lacking an element of the approval disclosure, and the limitations link
      the follow-up issue filed between step 6 and the `docs` run.
- [ ] `### F record for candidate 024bcb2a` records all 16 checklist items for D, each with setup, trigger,
      expected and observed observer output, T3 UI schedule state, actual turn authorship with
      API/UI provenance and a pass result, or for F3 and F12 the owner-accepted limitation with its
      attempts; F1 includes identity, scope, redaction, cited evidence,
      the snapshot verdict, the analysis-leaf verdict and both refusals; every recorded tick carries
      its required checkpoint.
- [ ] `#### 024bcb2a: candidate binding` holds the eight-entry digest table, build target `portable`, host,
      harness, model, versions, the extended qualified configuration verbatim with its digest, the sanitized trusted context
      naming provider instance `codex`, every install window with its install, `diff -r` and digest
      checks before the first and after the last scenario (window 1: the external DALO fault and its
      validity end instead of an end check), each window's DALO restore with its `dalo status --check`
      result against its own pre-install capture, removal
      of the configuration, and the evidence-file digest table; the seven guard entries in
      `test/fixtures/focus-digests.sha256` equal the record's digests or those of a later
      documented nonbehavioral note.
- [ ] The record names no thread ID, schedule ID or absolute user path, and states that no
      qualification schedule remains active.
- [ ] The record edits of Approach step 7 are present; lines 1–60 of the acceptance page keep their
      line count; the snapshot-binding references name F1; for the follow-up mode, the acceptance
      page and the user guide state the host prerequisite and that a default Codex configuration
      is not qualified, and neither attaches the prerequisite to report-only snapshots.
- [ ] Both ADRs carry one dated status note each, with the content of Approach step 8.
- [ ] On the final head `git status` is clean and `git diff --name-only D..HEAD` lists only
      `docs/developer-guide/focus-host-acceptance.md`, `docs/user-guide/tools-quality.md`, the two
      ADRs, the archived plan and `test/fixtures/focus-digests.sha256`, apart from files a permitted
      post-record branch update from `develop` brings in.
- [ ] `pnpm agent:check`, `node build.mjs`, `test/focus-digest-guard.test.mjs` and
      `pnpm test:distribution` pass on the final head, `pnpm test` passes there apart from logged
      host-driver module timeouts, and CI passed on it (a logged rerun pass of a flaky non-focus
      test counts).
- [ ] #625 carries `Closes #613`, no "do not merge" notice, and is ready; the comment naming the
      deferred steering items is on #613.

## Validation plan

- Step 0 source-delta check, logged validation of D and CI's unit-test step on D, with the digest
  guard's mismatch as the only failure.
- The link, completeness and mention scan of every observer's messages after each scenario turn and
  hourly during loops (step 5).
- Digest computation before recording (step 2); install, `diff -r` and digest checks before and
  after the scenarios (steps 3 and 6); DALO restore and configuration removal checks (step 6).
- `pnpm agent:check`, `node build.mjs`, `pnpm test`, `pnpm test:distribution`, `git status` and
  `git diff --name-only D..HEAD` on the final head; CI on #625 after the push.
- `gh pr view 625 --json isDraft,body,closingIssuesReferences` shows ready, `Closes #613` and one
  closing reference.
- The publication scan of the edge cases before every push and tracker write, and a manual read of
  the record for pseudonymization before commit.

## Assumptions and open points

- The `docs` run writes the record from evidence the coordinator collected and starts only after the
  step 6 restore; it never runs in an observer thread.
- `origin/develop` receives no digest-bound focus change between D and the merge of #625. The
  recording includes a roughly four-hour loop, so the owner holds such changes back during that
  window; otherwise the edge case "`develop` advances before merge" applies.
- Verified on 2026-11-10: `974fe72e` conflicts with `8efe467b` in the four files named in the
  requirement, and `src/shared/focus-follow-up.md` is unchanged on `develop`.
- Accepted residual risk (owner decision, 2026-11-10): a user on a default Codex configuration can
  see extra commentary on quiet ticks, and the gate cannot detect the prerequisite.
- The failed-deletion pass of 2026-11-09 stays history and is not carried over; D's focus bytes
  differ from that retest's.
- The ADR bodies stay unchanged; the dated status notes are the agreed way to record the new state
  (#613 owner decision).
- The concept, `release-and-installation.md` and `evals/focus/README.md` were updated by WP2b-1
  without a SHA and need no edit here.
- The `focus` and `build-context` eval rounds are post-merge maintainer debt, not part of this run.
- Deviation from the #613 comment (owner decisions, 2026-11-06): no published PR review is awaited
  before recording; an item that is not provoked is retried on the same candidate instead of
  entering the failure rule; the `docs` run follows the operator's host work instead of hosting it.
- Deviation from the #613 comment (owner decisions, 2026-11-12): a further candidate `887ba1fd`
  after C's failure, a focus naming rule that overrides the T3 host's link instruction, a visible host
  thread link counted as a defect, and CI's unit-test step on D in place of a local full `pnpm test`.
  After D's first window: a second allowance on D, well-formed host thread links counted as a
  limitation instead of a defect, and the naming sentence added to the qualified host
  configuration. After `887ba1fd`'s window 2: a further candidate `85728d95` with the re-offer
  rule and a fresh allowance of 1; the CI substitution for a local full `pnpm test` carries over.
  After `85728d95`'s window 1: offers without their disclosures accepted as a limitation, the
  stripped schedule ID reclassified from limitation to defect, and a further candidate `024bcb2a`
  with the handle fix, a second merge of `develop` and a fresh allowance of 1. For D (2026-11-13):
  an approval-mode offer without its approval disclosure is a defect, and a rerun pass of a flaky
  non-focus CI test counts. During the recording on 2026-11-13: window 1 closed after an external
  DALO fault and window 2 restored against its own DALO baseline; the rewritten `~/.codex/AGENTS.md`
  accepted as host environment; the hold of window 2 extended; F3 and F12 recorded as owner-accepted
  limitations instead of passes.
- Deviation from the #613 comment (owner decisions, 2026-11-10): the candidate is C instead of the
  WP2b-1 head, so the diff scope includes the merge, the user guide and the fixture; the follow-up
  row carries a Codex host prerequisite; local host-driver timeouts do not block.

## Plan review

**Result:** Approved

### Summary

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         4 |    1 |
| Testability     |        0 |         4 |    1 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    2 |

### Findings

- **Important, Error cases.** Recording required a settled published PR review, but #625 has none.
  _Resolution by owner decision:_ the internal WP2b-1 build review and passed CI suffice; the review
  after marking #625 ready follows the failure rule.
- **Important, Testability.** F1 lacked the report-only row's proof (identity, scope, redaction,
  cited evidence, verdict, analysis-leaf verdict). _Incorporated_ in step 5 and the criteria.
- **Important, Testability.** Trusted `codex` context was not recorded as evidence. _Incorporated:_
  step 4 and the binding criterion.
- **Important, Error cases.** An item the host does not produce had no exit except the defect-fix
  rule. _Resolution by owner decision:_ "not yet recorded", retried on the same candidate.
- **Important, Testability.** F12/F16 did not fix observer or interval, skewing the first-loop
  measurement. _Incorporated:_ fresh observer `O2`, 5-minute interval, stated cost.
- **Important, Testability.** No raw evidence or evidence digests were kept. _Incorporated:_
  untracked evidence root and digest table.
- **Important, Error cases.** Copy install, app-server restart, DALO restore and the no-other-work
  check of E were missing. _Incorporated_ in steps 3 and 6.
- **Important, Architecture.** Same-session recording and turn authorship were open.
  _Incorporated:_ separate docs session; _owner decision:_ only operator-typed deciding turns pass.
- **Note, Maintainability.** Per-item provocation methods were missing. _Incorporated_ in step 5.
- **Note, Data protection.** "No home path" conflicted with E's tilde path. _Incorporated:_
  tilde-relative slot paths allowed, absolute user paths only in the evidence root.
- **Note, Error cases.** The failure-rule summary was lossy and the head-moves case inverted.
  _Incorporated_; _owner decision:_ failed entry and fix stay on #625's branch.
- **Note, Testability.** The digest-equality criterion lacked the nonbehavioral-note alternative and
  the no-change statement. _Incorporated._
- **Note, Maintainability.** The `**Recorded bindings.**` marker and the E limitations sentence are
  test-guarded. _Incorporated_ under "Line stability".
- **Note, Scope.** Diff command and plan copy were inconsistent; the docs handback and manual PR
  steps were unsequenced; tooling should run through `t3-project`. _Incorporated_ in steps 1, 9 and 10.

### Deep review (2026-11-06)

**Result:** Approved

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         1 |    0 |
| Error cases     |        0 |         2 |    0 |
| Testability     |        0 |         2 |    3 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    1 |

- **Important, Testability.** F2 on an idle target first owes the idle-target report, so its first
  tick is not quiet. _Incorporated:_ the recorded quiet tick is the one after that report.
- **Important, Testability.** F8 as written produced no tick and had no expected output.
  _Resolution by owner decision:_ the operator types the tick prompt after the UI deletion; the
  expected output is stated, and an undefined failed-delete output is a source gap.
- **Important, Architecture.** The F1 ancestor refusal needs an agent-authored delegated task,
  contradicting the human-turn rule. _Resolution by owner decision:_ a documented exception for
  that case, as in E.
- **Important, Error cases.** A `docs` session on Codex conflicted with the candidate swap and
  app-server restarts. _Resolution by owner decision:_ operator host work first, `docs` only after
  the restore.
- **Important, Error cases.** A `pr` handback would finalize #625 early because of the WP2b-1 plan
  marker. _Incorporated:_ completion action `branch` and a manual push; a failed entry is pushed
  without a handback.
- **Important, Data protection.** An untracked evidence root in the worktree would break the clean
  `git status`, risk staging and be withdrawn with the worktree. _Incorporated:_ evidence root under
  the main checkout's ignored `.effective-flow/`; the operator creates the worktree by hand.
- **Note, Testability.** F7's expected output omitted the deletion-safeguard outcome.
  _Incorporated._
- **Note, Testability.** A compaction stop in F12 leaves the schedule live. _Incorporated:_ record
  the tail and delete at once.
- **Note, Maintainability.** No run sheet for observers, targets and loops. _Incorporated:_
  allocation table, F9 timing, F15 dependency.
- **Note, Testability.** F3, F4, F6 and F14 expected outputs were under-specified.
  _Incorporated._
- **Note, Scope.** "Unchanged" files contradicted the documented nonbehavioral drift path.
  _Incorporated:_ scoped to the recording commit.

### Revision review (2026-11-10)

**Result:** Approved

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         1 |    3 |
| Scope           |        0 |         1 |    2 |
| Maintainability |        0 |         0 |    1 |

Findings of the prior gap analysis were incorporated before this review: corrected byte-identity
premise with a check in step 0, CI's real proof on C, the failure path ending at an owner decision
with a full host restore, host-fault classification, the seven-digest drift comparison, the
prerequisite's definition, F7/F8 ordering, and candidate-qualified headings.

- **Important, Error cases.** Unresolved local host-driver timeouts would stall step 0. _Resolution
  by owner decision:_ such timeouts are logged as failed and CI's unit-test step decides.
- **Important, Testability.** A later stopped tick might never be observed. _Incorporated:_ a second
  tick prompt in F7, and at least two later fires after a compaction stop.
- **Important, Scope.** The prerequisite contradicted the user guide's snapshot paragraph.
  _Incorporated:_ it binds the follow-up row; the report-only row notes that the entry was active.
- **Note, Testability.** The eval-evidence step is skipped by CI on C. _Incorporated_ in step 0.
- **Note, Testability.** The long-loop proof ignored the compaction alternative. _Incorporated._
- **Note, Testability.** F3 did not require an unrequested repetition. _Incorporated._
- **Note, Scope.** Model and effort were not bound across observers. _Incorporated._
- **Note, Scope.** The final diff criterion excluded a permitted later branch update. _Incorporated._
- **Note, Maintainability.** "C" collides with the page's phase C. _Incorporated:_ the page uses
  the commit hash.

### Deep review (2026-11-10)

**Result:** Approved

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         1 |    0 |
| Error cases     |        0 |         2 |    1 |
| Testability     |        0 |         3 |    1 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         0 |    1 |

- **Important, Testability.** The unexplained output defect occurred in approval mode, which the
  plan barely covered. _Resolution by owner decision:_ three to five scheduled approval-mode ticks
  with raw output, and the limitations state that the cause is unproven.
- **Important, Testability.** A compaction stop passed F12 without the cap being observed.
  _Resolution by owner decision:_ F12 needs the cap, with at most two retries on a fresh observer.
- **Important, Testability.** F10's late approval had no criterion. _Incorporated._
- **Important, Error cases.** The criteria contradicted the timeout decision. _Incorporated._
- **Important, Error cases.** Retries had no install-window rule. _Incorporated:_ interim restore
  and reinstall of the same C, each window checked and listed, with an owner-set hold time.
- **Important, Architecture.** The #613 precedence clause invalidated the new binding.
  _Incorporated:_ named owner decisions take precedence, and the deviations are listed and reported
  on #613.
- **Important, Data protection.** Manual checks missed several publication paths. _Incorporated:_ a
  scan before every push and tracker write.
- **Note, Scope.** A fix after the push cannot be a merge commit. _Incorporated:_ C is the passing
  head that contains the merge.
- **Note, Error cases.** The pending-wording search had no exact end check. _Incorporated._
- **Note, Testability.** Step 9 did not validate the final head. _Incorporated._
- **Note, Maintainability.** The evidence root mixed attempts. _Incorporated:_ one fresh
  subdirectory for C.

### Revision review (2026-11-12)

**Result:** Approved

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         0 |    2 |
| Testability     |        0 |         1 |    3 |
| Scope           |        0 |         0 |    1 |
| Maintainability |        0 |         1 |    3 |

The revision rebinds the recording to candidate D (`887ba1fd`) after C's failure and adds the
owner's link rule.

- **Important, Maintainability.** In step 7, "E and D are history" pointed at the new binding
  instead of the page's phase D. _Incorporated._
- **Important, Testability.** The link scan had no patterns, scope or completeness check.
  _Incorporated:_ the scan rule now names the patterns, limits the scope to assistant messages,
  records per-observer counts and T3/Codex byte equality, and defines a raw `target=`.
- **Note, Testability.** Links in cited target text and in the tick prompt were unsettled.
  _Incorporated:_ synthetic targets mention no threads, and F13 checks the bare ID in the prompt.
- **Note, Error cases.** Step 0 for D relied on undated fix-run logs and on CI without naming the
  deviation. _Incorporated:_ the checks rerun on a clean D, and the CI substitution is listed as a
  deviation.
- **Note, Maintainability.** C's integration block still read as instructions, and two lines were
  stale. _Incorporated:_ it is one history sentence; the timeout rule moved into D's step 0; the
  stale lines were removed or reworded.
- **Note, Error cases.** Step 1 compared `develop` "since D". _Incorporated:_ it compares since
  the merge base and includes `build.mjs`.
- **Note, Testability.** The user guide's plain-text claim was not observed. _Incorporated_ in F1.
- **Note, Maintainability.** The C failed entry's `#### C:` headings could be copied.
  _Incorporated:_ D's headings use the hash. Retitling the published C entry is _deliberately not
  incorporated_: the F section is additive, and its text stays as pushed.
- **Note, Maintainability.** The limitations sentence sat under approval mode. _Incorporated:_
  moved to the link rule.
- **Note, Data protection.** The needed inputs lay outside `candidate-d/`, and raw records hold the
  host prompt. _Incorporated:_ the limitations cite the published C entry, and the scan keeps only
  counts, matches and digests.
- **Note, Testability.** The model choice and the sample size limit what a pass shows.
  _Incorporated:_ C's model and effort are bound, and the limitations state the weak-evidence
  bound.
- **Note, Scope.** The PR body and the ADR notes omitted the naming rule. _Incorporated_ in the PR
  body. The ADR note is _deliberately not incorporated_: the override is product behaviour recorded
  in `src/tools/focus.md`, the user guide and the record; step 8's notes describe enablement only.

### Deep review (2026-11-12)

**Result:** Approved

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    1 |
| Error cases     |        0 |         4 |    1 |
| Testability     |        0 |         2 |    2 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    0 |

- **Important, Error cases.** A truncated report without a link fragment was not a defect outside
  F1 and the checkpoints, although C's harm was the lost report. _Incorporated:_ every snapshot,
  tick and end-event report must be complete; an incomplete report is a defect.
- **Important, Error cases.** A mismatch between the T3 text and the Codex record had no outcome.
  _Resolution by owner decision:_ it is a host or transport fault, and the scenario is retried on D.
- **Important, Testability.** Inline-code naming was never checked positively. _Incorporated:_ the
  scan records every session mention and its conformity. _Owner decision:_ a non-conforming mention
  without a link is a limitation, and a mismatched ID is a defect.
- **Important, Testability.** The scan left out F1's delegated child observer. _Incorporated._
- **Important, Error cases.** C's install tooling supports only one window, and its configuration
  copy lies outside `candidate-d/`. _Incorporated:_ per-window subdirectories and the configuration
  copied into `candidate-d/`.
- **Important, Error cases.** Other Codex work during a multi-hour window was uncontrolled.
  _Incorporated:_ the active-work check runs before every restart and restore, and the hold time
  includes holding back other work.
- **Note, Error cases.** The scan timing was unspecified. _Incorporated:_ the scan runs after every
  turn, hourly during loops and before the next item.
- **Note, Data protection.** The storage rule contradicted itself. _Incorporated._
- **Note, Testability.** The evidence-strength statement was qualitative. _Incorporated:_ N, the
  ~3/N bound and the difference in the denominator.
- **Note, Testability.** F1's UI check had no outcome for host-made links. _Resolution by owner
  decision:_ that is a host-rendering limitation, and the guide sentence is corrected in the run.

### Revision review (2026-11-12, second attempt on D)

Coordinator self-review of the owner decision after D's first window; no delegate review.

- The relaxed rule keeps every harm C showed as a defect: a truncated report, a malformed fragment
  and a missing checkpoint. Only a well-formed link to the right session in a complete message
  moves to the limitations.
- The scan was adapted and checked against window 1: `O2`'s three messages give one well-formed
  link, no defect match and byte equality with the Codex record.
- The extended host entry keeps the 2026-11-10 text unchanged and appends one sentence; it is
  documented verbatim in the binding, and window 1 stays recorded under the old digest.
- D's sources and the eight digests are unchanged, so no step 0 or step 2 rerun is owed beyond the
  step 2 rebuild check of each new window.

### Revision review (2026-11-12, candidate `85728d95`)

Delegated plan-level review of the rebinding to `85728d95`: 0 critical, 4 important and 7 note
findings, all incorporated.

- **Important.** The superseded D paragraphs read as binding `887ba1fd` with `85728d95` headings and
  as "no rerun owed". _Incorporated:_ both are marked superseded, and the old heading examples are
  restored. Under this revision step 0, step 2 and all 16 items are owed, and windows start at 1
  in `candidate-85728d95/`; the previous review section's last bullet applies to `887ba1fd` only.
- **Important.** A version-stamp exception in the tooling conflicted with step 1's "a changed head
  is a new candidate". _Incorporated:_ the exception is dropped; every window builds at head D.
- **Important.** The allocation table's "F1 (no schedule)" and an unstated opt-in turn could
  withdraw the re-offer. _Incorporated:_ the opt-in is the operator's very next turn, and the cell
  names it.
- **Notes.** _Incorporated:_ a not-provoked outcome when the second snapshot serves no history page;
  that snapshot in "Complete reports" and the criteria; withdrawn offers stated as a limitation;
  `887ba1fd`'s fix and deviation wording; the published failed entries as limitation sources; the
  shorthand rationale.

### Revision review (2026-11-13, candidate `024bcb2a`)

**Result:** Approved

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    3 |
| Testability     |        0 |         1 |    2 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    2 |

Delegated plan-level review of the rebinding to `024bcb2a`. It confirmed the source deltas, the
merge conflict scope, #625's draft state at D and the CI run; all findings were incorporated.

- **Important, Testability.** The handle and offer-disclosure checks produced no published count.
  _Incorporated:_ the scan extracts every `delete_scheduled_task` call and compares it with
  `handle=`, and the per-observer record and the criteria carry both counts.
- **Important, Scope.** The offer-disclosure limitation had no bound, no rule for partial omission
  and no owner for the follow-up issue. _Resolution by owner decision (2026-11-13):_ a limitation,
  except a missing approval disclosure in approval mode, which is a defect; the coordinator files the
  follow-up issue before step 9.
- **Note, Testability.** The deletion sample is small where the defect occurred. _Incorporated_ in
  the limitations.
- **Note, Error cases.** A stripped ID in an approval prompt had no handling. _Incorporated:_ the
  owner answers unchanged and the failure rule applies.
- **Note, Maintainability.** Affected files miscounted the merge's budget rows and named the wrong
  merge. _Incorporated._
- **Note, Maintainability.** The no-progress count exceeded the contract's range. _Incorporated:_
  `2`, with the allowance form.
- **Note, Error cases.** Step 1 had no outcome for a `build.mjs`-only change on `develop`.
  _Incorporated:_ it follows the post-record edge case.
- **Note, Error cases.** No rule for a flaky non-focus CI test on the final head. _Resolution by
  owner decision (2026-11-13):_ a rerun pass counts, both attempts logged.
- **Note, Testability.** The handle rule covered fewer calls than its criterion. _Incorporated:_
  every call, F14's stop included.

### Deep review (2026-11-13)

**Result:** Approved

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         1 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         1 |    0 |
| Error cases     |        0 |         0 |    2 |
| Testability     |        0 |         1 |    0 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    1 |

Delegated deep review of the whole plan with weight on the binding to D; it re-checked the step 0
facts read-only.

- **Important, Testability.** The extended scan was never checked against a known failure, and it
  compared the delete argument only with `handle=`. _Incorporated:_ a calibration run on
  `85728d95`'s window 1 before the first install, and a comparison with the `schedule_task` result
  and the prompt's `handle:` too.
- **Important, Architecture.** The precedence clause omitted the 2026-11-13 owner decisions.
  _Incorporated._
- **Important, Data protection.** The 2026-11-09 retest note needed evidence outside the `docs`
  input limit. _Resolution by owner decision (2026-11-13):_ the note is dropped.
- **Note, Error cases.** The follow-up issue was filed after the record that links it.
  _Incorporated:_ filed between step 6 and the `docs` run, also when D shows no omission.
- **Note, Error cases.** The approval-disclosure defect boundary was loose. _Incorporated:_ two
  required elements, ruled on before `O4`'s opt-in.
- **Note, Maintainability.** The list of unchanged failed attempts was stale. _Incorporated._

### Revision review (2026-11-13, recording outcome on D)

**Result:** Approved

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         0 |    0 |
| Error cases     |        0 |         0 |    0 |
| Testability     |        0 |         2 |    1 |
| Scope           |        0 |         1 |    0 |
| Maintainability |        0 |         0 |    2 |

Delegated plan-level review of the revision that records the recording on D and adjusts steps
7–10. Enabling the rows with two owner-accepted limitations reads as a coherent owner decision;
all findings were incorporated.

- **Important, Testability.** Three passages still required all 16 items to pass, which would
  block the fixture commit and the ready state. _Incorporated:_ passed or owner-accepted
  limitations, and step 5 F12 points to the outcome.
- **Important, Testability.** Window 2 reused `O` and `O2`, overwriting window 1's final `O` message
  scan. _Resolution by owner decision (2026-11-13):_ a rescan of window 1's `O` before the `docs`
  run, limited to valid messages, and window-qualified pseudonyms.
- **Important, Scope.** The limitations reached only the record and one matrix cell.
  _Incorporated:_ the PR body, the ADR note and the user guide name them, the cap-tick deletion is
  stated as not exercised. _Resolution by owner decision (2026-11-13):_ the planned follow-up issue
  also tracks F3 and F12.
- **Note, Maintainability.** "Both windows were restored" and the unconsumed allowance were
  inaccurate. _Incorporated._
- **Note, Testability.** Tick counts, the window-1 cut-off and valid-output scope were imprecise.
  _Incorporated._
- **Note, Maintainability.** The subagent rule of the rewritten `AGENTS.md` and quoting of German
  output were unaddressed. _Incorporated._

### Deep review (2026-11-13, recording outcome on D)

**Result:** Approved

| Area            | Critical | Important | Note |
| --------------- | -------: | --------: | ---: |
| Architecture    |        0 |         0 |    0 |
| Security        |        0 |         0 |    0 |
| Data protection |        0 |         1 |    0 |
| Error cases     |        0 |         1 |    0 |
| Testability     |        0 |         1 |    1 |
| Scope           |        0 |         0 |    0 |
| Maintainability |        0 |         0 |    0 |

Delegated deep review of the remaining steps (evidence before `docs`, record, fixture, PR).

- **Important, Testability.** The `docs` run could not write several required parts from the
  evidence root (F1, F2, F4, F13 details, trusted context, incomplete-report counts, WP0
  re-observations, F8 screenshots; window 1's `O2` scan included invalid ticks). _Incorporated:_
  an evidence-completion step before `docs` with rescans of window 1's `O` and `O2`.
  _Resolution by owner decision (2026-11-13):_ fields the records cannot give (the T3 UI rendering
  of the ID, the trusted context) are re-observed in a short window 3 on D.
- **Important, Error cases.** Schedule absence was verified by host API, not the T3 UI.
  _Resolution by owner decision (2026-11-13):_ the API listing counts, labelled as API; F12 left
  the deletion criterion in favour of the two loop ends.
- **Important, Data protection.** The publication scan patterns missed this host's thread-ID
  formats and the second register. _Incorporated:_ the union of both registers and prefix-anchored
  patterns, also for the follow-up issue. _Resolution by owner decision (2026-11-13):_ the
  home-path link in `O2`'s observer output is a counted limitation.
- **Note, Testability.** F3's first attempt was no valid provocation by the plan's own rule.
  _Incorporated_ in the F3 limitation.

## Test results

- Step 0 on a clean checkout of D: `pnpm agent:check`, focus contract tests (28/28), focus eval
  tests (88/88), `node build.mjs` (focus 414/414), `pnpm test:distribution` and the five eval
  evidence reports passed; CI run `43320346579` (attempt 2) failed only in the digest guard.
- Recording windows 1–3 on 2026-11-13: install, integrity and restore checks as recorded in
  `#### 024bcb2a: candidate binding`; no observed defect.
- `docs` run: `pnpm agent:check` and `test/focus-contracts.test.mjs` (28/28) passed through
  `t3-project`; lines 1–60 of the acceptance page kept their count; the publication scan of the diff
  against both registers and the prefix patterns found nothing. The digest guard stays red until the
  step 9 fixture commit.

## Review findings

- An independent verification of the record against the frozen evidence found 13 corrections and
  3 optional fixes (unavailable-marked fields that were available, a setup description, a matrix
  qualification, the evidence-table scope, timestamps, attribution); all were applied, and two
  evidence files were added or re-extracted with the manifest refrozen.

## Open points

- No open points.
