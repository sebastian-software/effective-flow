# focus session shape observations, second addendum (2026-11-03)

Second dated addendum to the work package 1 record [focus host evidence](focus-host-evidence.md).
It extends the first addendum, [focus session shape observations](focus-session-shape-observations.md),
which stays unchanged. It records the `t3_thread_read` behaviours that work package 6 of
`docs/concept/2026-11-02-focus-session-check.md` needs beyond the first record: reads of a thread
with two runs at `runLimit` 1 and 2, and the smallest read of the observer's own running thread.
The plan is `docs/plan/archive/2026-11-03-focus-observed-eval-suite-and-calibration.md`.

The machine-readable block at the end holds only the behaviour entries this observation adds or
overrides. `evals/_scaffold/session-shapes.mjs` equals the first addendum's block merged with this
one by entry `name`: an entry here with the same `name` replaces the first block's entry, and every
other entry is added. There is no other merge rule. Host key sets, item types by view and the
self-report projection come from the first block alone. A later host change needs a new dated
addendum, not an edit to this one.

## Setup

| Item            | Recorded value                                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run date        | 2026-11-03                                                                                                                                                                                                    |
| T3 Code server  | `0.1.6` (environment label `t3`), linux x64                                                                                                                                                                   |
| Provider        | `claudeAgent_claude_eg`, model `claude-opus-5-5`                                                                                                                                                              |
| Provider note   | **Differs from the first addendum**, whose provider was `claudeAgent`. The stub therefore serves the behaviours recorded here only under their own entries; no first-addendum entry is widened by this record |
| Target class    | Throwaway top-level thread launched by the build orchestrator (`creationSource` `mcp`, `createdBy` `agent`, `parentThreadId` null)                                                                            |
| Target runs     | Run 1: three assistant paragraphs of at least 400 characters each plus two `echo` commands. Run 2, a follow-up turn: two paragraphs plus one `echo` command. No repository files touched                      |
| Launch and wait | `t3_thread_launch`, then `t3_thread_wait` until completed; then one `t3_thread_send` with mode `queue`, then `t3_thread_wait` until completed again                                                           |
| Target state    | At every read: thread `status` `completed`, `activeRunId` null, `runCount` 2, `itemCount` 15, `pendingRequestCount` 0                                                                                         |
| Observer        | The orchestrating thread itself, its id taken from `orchestrator_capabilities.parentThreadId`; top-level, so the plan's stop rule for a parented observer did not fire                                        |
| Read calls      | 7 `t3_thread_read` calls, arguments in "Observation calls" below; no call passed `environmentId`                                                                                                              |
| Redaction       | **Ids redacted.** No thread, item, run or project id appears here; `<target>` stands for the target thread id, `<observer>` for the observer's thread id, `<item 0>` for the id of the target's position 0    |
| Content         | **Content discarded.** Ids, `title`, `branch`, `worktreePath`, `link` and all text are discarded; only key names, enum values, positions and behaviour outcomes are kept                                      |
| Cleanup         | No T3 tool deletes threads; the developer archives or deletes the throwaway thread afterwards                                                                                                                 |

## Observations

Every response, including the read of the running observer, carried the first addendum's response,
thread, run and item key sets in the same order. `senderThreadId` again accompanied only
`user_message` items.

The target's timeline, by position, all 15 positions served:

- run 1: 0 `user_message`, 1 `command_execution` (workspace preparation), 2 `reasoning`,
  3 `assistant_message`, 4 `command_execution`, 5 `reasoning`, 6 `command_execution`, 7 `reasoning`,
  8 `assistant_message`, 9 `checkpoint`;
- run 2: 10 `user_message`, 11 `assistant_message`, 12 `command_execution`, 13 `assistant_message`,
  14 `checkpoint`.

Positions are contiguous across the two runs: run 2 continues at 10. Every item's `runId` names its
own run. Run 2 had no workspace-preparation item. Both `user_message` items carried
`senderThreadId`.

**The `checkpoint` item type.** The activity view served one `checkpoint` item at the end of each run
(positions 9 and 14); the messages view served none. Its text was `[]`, its `title`, `messageId`,
`createdBy` and `creationSource` null, its `status` `completed`. The type is outside the first
addendum's `itemTypesByView`, and this addendum does not add it there: the shapes keep the first
block's four types, fixtures of the focus suite use only those four, and the stub keeps refusing any
other type in a fixture (`unobservedItemType`, whose source the block below restates).

### Observation calls

| Call | `threadId`   | Arguments                                                                                    | Result                                                                                                                                                                                                                                                                                                                                                                                        |
| ---- | ------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `<target>`   | `view` `messages`, `limit` 10, `maxCharsPerItem` 1500, `runLimit` 2                          | Positions 0, 3, 8, 10, 11, 13, from both runs; `nextPosition` 13; `hasMore` false; no text truncated. `recentRuns`: 2 entries in the recorded run key set, ordinal 2 first, then ordinal 1, both `status` `completed`                                                                                                                                                                         |
| 2    | `<target>`   | `view` `activity`, `limit` 10, `maxCharsPerItem` 1500, `runLimit` 2                          | Positions 0 to 9; `nextPosition` 9; `hasMore` true; `recentRuns` as in call 1                                                                                                                                                                                                                                                                                                                 |
| 3    | `<target>`   | `view` `activity`, `limit` 10, `maxCharsPerItem` 1500, `runLimit` 2, `afterPosition` 9       | Positions 10 to 14; `nextPosition` 14; `hasMore` false; `recentRuns` as in call 1                                                                                                                                                                                                                                                                                                             |
| 4    | `<target>`   | `view` `messages`, `limit` 2, `maxCharsPerItem` 60, `runLimit` 2, `afterPosition` 8          | Positions 10, 11, crossing the run boundary; `nextPosition` 11; `hasMore` true; both items `textTruncated` true, `nextTextOffset` 60                                                                                                                                                                                                                                                          |
| 5    | `<target>`   | (b) state read: `view` `activity`, `limit` 1, `maxCharsPerItem` 256, `runLimit` 1            | Position 0, an item of run 1, so `runLimit` does not restrict items; `textTruncated` true, `nextTextOffset` 256; `nextPosition` 0; `hasMore` true. `recentRuns`: exactly one entry, the latest run (ordinal 2). `thread.runCount` 2                                                                                                                                                           |
| 6    | `<target>`   | (b) continuation: `itemId` `<item 0>`, `textOffset` 256, `maxCharsPerItem` 256, `runLimit` 1 | Item 0 only; its remaining text fit into 256 characters: `textTruncated` false, `nextTextOffset` null; `nextPosition` 0; `hasMore` false. `recentRuns`: one entry, the latest run                                                                                                                                                                                                             |
| 7    | `<observer>` | (c) `view` `activity`, `limit` 1, `maxCharsPerItem` 256, `runLimit` 1                        | Thread `status` `running`; `activeRunId` non-null and equal to `latestRunId`; `parentThreadId` and `relationshipToParent` null; `pendingRequestCount` 0. `recentRuns`: one entry, `status` `running`, `completedAt` null, `startedAt` non-null. Items: position 0, a completed `user_message` of an earlier run, `textTruncated` true, `nextTextOffset` 256; `nextPosition` 0; `hasMore` true |

Call 6 is the first addendum's unrecorded `textOffsetFinalChunk`, now observed; the block below
overrides that entry. Call 7 reports a `runCount` below the latest run's ordinal: `runCount` is no
run ordinal, so a fixture never relies on `runCount` equalling the latest ordinal of the observer.

### Not observed

These stay, or become, `recorded: false`, and the stub answers a read that needs one of them as
`unrecorded`:

- a `runLimit` other than 1 and 2 (`runLimitAboveOne` now names every such value), and `runLimit` 2
  on a thread with one run;
- a thread with a run count other than 1 and 2 (`runCountOtherThanOne` now names every such value);
- a continuation whose remaining text length equals `maxCharsPerItem`;
- any read of the running observer other than call 7's form, including history pages, activity
  pages beyond that one item, `afterPosition` and `itemId` continuations;
- a running target, a parented observer, and a running observer with pending requests;
- an `environmentId`, a held or late reply, and every other entry the first addendum lists as not
  observed.

**Values a fixture author keeps.** The stub rejects only a fixture that contradicts the recorded
state. For a completed two-run target that means `recentRuns` holding exactly the thread's runs with
ordinals 1 and 2, an item whose `runId` names no such run, or an item of the earlier run placed after
an item of the later one. For the running observer it means anything but one running run in
`recentRuns`, with `completedAt` null and its `runId` equal to `activeRunId` and `latestRunId`. The
observer's `runCount` and every value the first addendum leaves to the fixture author stay the
author's responsibility.

## Machine-readable block

Only new or overriding behaviour entries. Each entry applies only when `recorded` is true; an entry
with `recorded` false has `observedResult` null.

```json
{
  "behaviours": [
    {
      "name": "textOffsetFinalChunk",
      "recorded": true,
      "observedResult": "itemId with textOffset above 0 whose remaining text is shorter than maxCharsPerItem serves the remaining text with textTruncated false and nextTextOffset null",
      "source": "second addendum, observation call 6"
    },
    {
      "name": "runLimitAboveOne",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: a runLimit other than 1 and 2; since the second addendum this entry names every such value, and runLimit 2 is recorded as runLimitTwo"
    },
    {
      "name": "runCountOtherThanOne",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: a thread whose run count is other than 1 and 2; since the second addendum this entry names every such value, and two runs are recorded as runCountTwo"
    },
    {
      "name": "unobservedItemType",
      "recorded": false,
      "observedResult": null,
      "source": "not admitted: item types beyond itemTypesByView, which keeps the first addendum's four types; the checkpoint type the second addendum's activity view served stays outside fixtures"
    },
    {
      "name": "runCountTwo",
      "recorded": true,
      "observedResult": "a completed thread with two runs reports runCount 2, and its runs carry the ordinals 1 and 2",
      "source": "second addendum, setup row and observation calls 1-6"
    },
    {
      "name": "runLimitTwo",
      "recorded": true,
      "observedResult": "runLimit 2 on a thread with two runs serves both runs in recentRuns, ordinal descending",
      "source": "second addendum, observation calls 1-4"
    },
    {
      "name": "runLimitOneLatestRun",
      "recorded": true,
      "observedResult": "runLimit 1 on a thread with two runs serves only the latest run, the one with the highest ordinal, in recentRuns while thread.runCount stays 2",
      "source": "second addendum, observation calls 5 and 6"
    },
    {
      "name": "itemsNotRestrictedByRunLimit",
      "recorded": true,
      "observedResult": "runLimit restricts only recentRuns: items of every run are served, so a runLimit 1 read serves an item of the earlier run",
      "source": "second addendum, observation call 5; calls 1-3"
    },
    {
      "name": "positionsContinueAcrossRuns",
      "recorded": true,
      "observedResult": "the later run's items follow the earlier run's last position, every item's runId names its own run, and a page may cross the run boundary",
      "source": "second addendum, observation calls 1-4"
    },
    {
      "name": "runningObserverStateRead",
      "recorded": true,
      "observedResult": "view activity, limit 1, maxCharsPerItem 256 and runLimit 1, without afterPosition, itemId or textOffset, on the observer's own running top-level thread serves status running, activeRunId equal to latestRunId, parentThreadId and relationshipToParent null, pendingRequestCount 0, one running run with completedAt null in recentRuns, and the thread's first activity item; runCount need not equal the latest run's ordinal",
      "source": "second addendum, observation call 7"
    },
    {
      "name": "runLimitAboveRunCount",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: runLimit 2 on a thread with one run"
    },
    {
      "name": "textOffsetRemainingEqualsMaxCharsPerItem",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: a continuation whose remaining text length equals maxCharsPerItem"
    },
    {
      "name": "runningObserverOtherReadForm",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: any read of the running observer other than the observation call 7 form"
    },
    {
      "name": "parentedObserver",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: the observer was top-level; a running observer with a parentThreadId or relationshipToParent"
    },
    {
      "name": "runningObserverPendingRequest",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: a running observer with pendingRequestCount above 0"
    }
  ]
}
```
