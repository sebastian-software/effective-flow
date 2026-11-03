# focus session shape observations (2026-11-03)

Dated addendum to the work package 1 record [focus host evidence](focus-host-evidence.md), which
stays unchanged. It records the T3 Code `t3_thread_read` shapes and paging behaviour that work
package 5 of `docs/concept/2026-11-02-focus-session-check.md` needs for the eval session stub, plus
a cited projection of the Claude Code self-report surfaces. The plan is
`docs/plan/2026-11-03-focus-session-stub-and-labelling-rubric.md`.

The machine-readable block at the end is the single source of `evals/_scaffold/session-shapes.mjs`.
The observations cover one host build; a later host change needs a new dated addendum, not an edit
to this one.

## Setup

| Item            | Recorded value                                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run date        | 2026-11-03                                                                                                                                                     |
| T3 Code server  | `0.1.6` (environment label `t3`), linux x64                                                                                                                    |
| Provider        | `claudeAgent`, model `claude-opus-5-5`                                                                                                                         |
| Target class    | Throwaway top-level thread launched by the build orchestrator (`creationSource` `mcp`, `createdBy` `agent`, `parentThreadId` null)                             |
| Target prompt   | Three assistant paragraphs of at least 400 characters each plus two `echo` shell commands; no repository files touched                                         |
| Target state    | Ran to completion before any read: thread `status` `completed`, `itemCount` 9, `runCount` 1                                                                    |
| Launch and wait | `t3_thread_launch` in this project with the target prompt; `t3_thread_wait` until the target finished. No further arguments were recorded                      |
| Read calls      | 8 `t3_thread_read` calls, arguments in "Observation calls" below; every call passed `runLimit` 1 and no `environmentId`                                        |
| Redaction       | **Ids redacted.** No thread, item, run or project id appears here; `<target>` stands for the target thread id, `<item 7>` for the id of the item at position 7 |
| Content         | **Content discarded.** Only key names, enum values, positions and behaviour outcomes are kept                                                                  |
| Cleanup         | No T3 tool deletes threads; the developer archives or deletes the throwaway thread afterwards                                                                  |

## Observations

Every response carried the same five top-level keys, and every served object carried the key sets
in the block. `senderThreadId` is the one optional item key: it was present only on the agent-sent
`user_message` at position 0.

The target's timeline, by position: 0 `user_message`, 1 `command_execution` (workspace
preparation), 2 `assistant_message`, 3 `command_execution`, 4 `reasoning`, 5 `assistant_message`,
7 `assistant_message`. Positions 6 and 8 were not served by any read.

### Observation calls

| Call | Arguments (besides `threadId` `<target>` and `runLimit` 1)            | Result                                                                                                                                                                                        |
| ---- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `view` `activity`, `limit` 3, `maxCharsPerItem` 60                    | Positions 0, 1, 2; `nextPosition` 2 (the last served); `hasMore` true. Truncated items: `textTruncated` true, `nextTextOffset` 60. A short item: `textTruncated` false, `nextTextOffset` null |
| 2    | `view` `messages`, `limit` 3, `maxCharsPerItem` 60                    | Positions 0, 2, 5 (command and reasoning items skipped); `nextPosition` 5; `hasMore` true                                                                                                     |
| 3    | `view` `activity`, `limit` 3, `maxCharsPerItem` 20, `afterPosition` 2 | Positions 3, 4, 5 (exclusive of 2); `nextPosition` 5; `hasMore` true                                                                                                                          |
| 4    | `view` `messages`, `limit` 2, `maxCharsPerItem` 20, `afterPosition` 3 | `afterPosition` between the message positions 2 and 5: positions 5, 7; `nextPosition` 7; `hasMore` false                                                                                      |
| 5    | `view` `activity`, `limit` 3, `afterPosition` 20                      | Past the end: `items` [], `nextPosition` null, `hasMore` false; no error                                                                                                                      |
| 6    | `itemId` `<item 7>`, `maxCharsPerItem` 100 (no `view`)                | That one item; its first 100 characters, `textTruncated` true, `nextTextOffset` 100; `nextPosition` 7; `hasMore` false                                                                        |
| 7    | `itemId` `<item 7>`, `textOffset` 100, `maxCharsPerItem` 100          | The same item; characters 100 to 199, `textTruncated` true, `nextTextOffset` 200; `nextPosition` 7; `hasMore` false                                                                           |
| 8    | `itemId` `<item 7>`, `textOffset` 100000                              | The same item; `text` "", `textTruncated` false, `nextTextOffset` null; no error                                                                                                              |

**Plan correction.** The plan expected an error for a `textOffset` past the end of the text. The
host instead returns the item with empty text, `textTruncated` false and `nextTextOffset` null.

### Not observed

These stay `recorded: false` in the behaviour list. The stub answers a read that needs one of them
as `unrecorded`. A value below a `minimum` of the tool schema, outside its `view` enum or outside
its keys gets the stub's own input error instead, because the host's client rejects it before
sending. The held and late reply reach a fixture only through declared stand-ins: `none` serves a
held reply, and the `late` variant is a stub-protocol proxy.

- a `limit` above 100 or a `maxCharsPerItem` above 50000: not sent. The schema declares only the
  minimum 1 and names the upper bound in its description, so no client-side rejection is assured;
- `maxCharsPerItem` exactly equal to the remaining text length, and a continuation whose remaining
  text fits into `maxCharsPerItem` or whose `textOffset` equals the text length;
- a read that omits `view`, `limit`, `runLimit`, or (where text is served) `maxCharsPerItem`;
- `textOffset` without `itemId`, an explicit `textOffset` 0 (call 6 omitted it), and `itemId`
  combined with `view`, `limit` or `afterPosition`;
- an `afterPosition` below the first position the view serves, and a view with no items at all,
  with or without `afterPosition` (call 5 found its empty page past a non-empty view);
- an `itemId` that the thread does not hold, item types other than the observed ones, and
  `senderThreadId` on any item other than a `user_message`;
- an `environmentId` (cross-environment read) and a thread with other than one run. The
  `recentRuns` shape at `runLimit` above 1 is not recorded: the acceptance paging reads used
  `runLimit` 2 (`focus-host-acceptance.md:75,105-114`) but recorded no run key set;
- a running target: every read above targeted a completed thread. The acceptance runs read running
  targets (`focus-host-acceptance.md:74-80,105-121`), but recorded no key sets or item fields for
  them;
- a held reply, a late reply, and the busy or idle state of a `ListAgents` row.

**Values a fixture author keeps.** Content was discarded, so this addendum records no item
`status`, `visibility` or `creationSource` value and no run `status` value. The stub checks
none of them. It rejects only a fixture that contradicts the recorded thread state: a completed
thread with a non-null `activeRunId` or a `running` run (`focus-host-evidence.md:73`), or an
`itemCount` below the number of fixture items. Every other value is the fixture author's
responsibility, and a fixture that depends on one of them is not evidence of host behaviour.

### Committed evidence cited

- `focus-host-acceptance.md:75`: a `messages` read with `limit` 10 served the non-contiguous
  positions 0, 1, 3, 4, 6, 8 with `nextPosition` 8, equal to the last served position, and
  `hasMore` false.
- `focus-host-acceptance.md:105-114`: the D ledger. Call 5 served positions up to 15 with
  `nextPosition` 15 and `hasMore` true; call 7, with `afterPosition` 15, served positions 17 to 26
  with `nextPosition` 26 and `hasMore` false.

A read made on 2026-11-03 by the session that wrote the plan targeted the developer's working thread
and is not evidence here.

## Claude Code self-report projection

Claude Code has no thread reader; its self-report surfaces are prose host output (Claude Code
`2.1.292`, `focus-host-evidence.md:30,99-100`). The block's `selfReportProjection` names one field
per observed fact and cites one source per field. The field names are the stub's labels for those
facts, not host keys, except the reply attributes `from`, `from-name` and `from-mode`, which the
host prints under those names.

| Surface              | Field       | Observed fact                                                                    | Source                           |
| -------------------- | ----------- | -------------------------------------------------------------------------------- | -------------------------------- |
| `ListAgents` header  | `name`      | The header names the observer's own session                                      | `focus-host-evidence.md:108`     |
| `ListAgents` header  | `ref`       | ... with its `[ref]`, stable across three calls                                  | `focus-host-evidence.md:108`     |
| `ListAgents` row     | `name`      | Each row carries the session name, which survives a restart                      | `focus-host-evidence.md:107`     |
| `ListAgents` row     | `ref`       | A six-hex-digit `[ref]`, unchanged by a rename and new after a restart           | `focus-host-evidence.md:107`     |
| `ListAgents` row     | `mode`      | The observed value `interactive`                                                 | `focus-host-evidence.md:53-54`   |
| `SendMessage` result | `messageId` | Every send returned a message identifier                                         | `focus-host-evidence.md:104`     |
| `SendMessage` result | `status`    | The message sat in the target inbox, not yet read                                | `focus-host-evidence.md:104`     |
| `SendMessage` result | `notice`    | On a reused name: messaging a new session for the first time under that name     | `focus-host-evidence.md:104`     |
| Reply                | `from`      | A per-process socket address `uds:/tmp/cc-socks/<pid>.sock`, new after a restart | `focus-host-evidence.md:112-113` |
| Reply                | `from-name` | The session name, unchanged across a restart                                     | `focus-host-evidence.md:114`     |
| Reply                | `from-mode` | The observed value `prompting`, also for a plan-mode target                      | `focus-host-evidence.md:115-116` |
| Reply                | `text`      | The reply body, received as a cross-session message                              | `focus-host-evidence.md:104`     |

No reply attribute carries the `[ref]` (`focus-host-evidence.md:117`). Busy and idle row state is
not part of the projection; it is added only from a new dated observation.

## Machine-readable block

`hostKeySets` lists the keys in the order the host served them. `optionalItemKeys` may accompany an
item. `itemTypesByView` lists the item types each view served. Each behaviour entry applies only
when `recorded` is true; an entry with `recorded` false has `observedResult` null.

```json
{
  "hostKeySets": {
    "response": ["thread", "recentRuns", "items", "nextPosition", "hasMore"],
    "thread": [
      "threadId",
      "projectId",
      "title",
      "link",
      "createdBy",
      "creationSource",
      "status",
      "latestRunId",
      "activeRunId",
      "providerInstanceId",
      "model",
      "runtimeMode",
      "interactionMode",
      "linkedPullRequest",
      "pullRequests",
      "titleRegeneration",
      "branch",
      "worktreePath",
      "parentThreadId",
      "relationshipToParent",
      "runCount",
      "itemCount",
      "pendingRequestCount",
      "archived",
      "settled",
      "settledAt",
      "snoozed",
      "snoozedUntil",
      "createdAt",
      "updatedAt"
    ],
    "run": [
      "runId",
      "ordinal",
      "status",
      "providerInstanceId",
      "model",
      "requestedAt",
      "startedAt",
      "completedAt"
    ],
    "item": [
      "position",
      "visibility",
      "sourceThreadId",
      "itemId",
      "runId",
      "messageId",
      "createdBy",
      "creationSource",
      "type",
      "status",
      "title",
      "text",
      "textTruncated",
      "nextTextOffset",
      "updatedAt"
    ],
    "optionalItemKeys": ["senderThreadId"]
  },
  "itemTypesByView": {
    "activity": ["user_message", "command_execution", "assistant_message", "reasoning"],
    "messages": ["user_message", "assistant_message"]
  },
  "behaviours": [
    {
      "name": "activityViewServesAllTypes",
      "recorded": true,
      "observedResult": "the activity view serves items of every observed type in ascending position",
      "source": "observation calls 1 and 3"
    },
    {
      "name": "messagesViewFiltersTypes",
      "recorded": true,
      "observedResult": "the messages view serves only user_message and assistant_message items, so its positions are non-contiguous",
      "source": "observation calls 2 and 4; focus-host-acceptance.md:75"
    },
    {
      "name": "limitCapsPage",
      "recorded": true,
      "observedResult": "a list read serves at most limit items of the view, fewer when the view holds fewer",
      "source": "observation calls 1-4; focus-host-acceptance.md:75"
    },
    {
      "name": "nextPositionIsLastServed",
      "recorded": true,
      "observedResult": "nextPosition equals the position of the last served item",
      "source": "observation calls 1-4, 6 and 7; focus-host-acceptance.md:75,105-114"
    },
    {
      "name": "hasMoreWhenViewContinues",
      "recorded": true,
      "observedResult": "hasMore is true when the view holds an item after the last served position, else false",
      "source": "observation calls 1-4; focus-host-acceptance.md:75,105-114"
    },
    {
      "name": "afterPositionExclusive",
      "recorded": true,
      "observedResult": "afterPosition equal to a served position serves only later positions",
      "source": "observation call 3; focus-host-acceptance.md:105-114"
    },
    {
      "name": "afterPositionBetweenPositions",
      "recorded": true,
      "observedResult": "afterPosition between two view positions serves from the next view position",
      "source": "observation call 4"
    },
    {
      "name": "emptyPage",
      "recorded": true,
      "observedResult": "an afterPosition at or after the last position of a non-empty view serves items [], nextPosition null, hasMore false and no error",
      "source": "observation call 5"
    },
    {
      "name": "itemTextTruncation",
      "recorded": true,
      "observedResult": "text longer than maxCharsPerItem is cut to maxCharsPerItem characters with textTruncated true and nextTextOffset maxCharsPerItem; shorter text is served whole with textTruncated false and nextTextOffset null",
      "source": "observation calls 1 and 6"
    },
    {
      "name": "itemIdSingleItemRead",
      "recorded": true,
      "observedResult": "itemId without view, limit or afterPosition serves that one item with nextPosition its position and hasMore false",
      "source": "observation calls 6-8"
    },
    {
      "name": "textOffsetContinuation",
      "recorded": true,
      "observedResult": "itemId with textOffset serves maxCharsPerItem characters from textOffset with textTruncated true and nextTextOffset textOffset plus maxCharsPerItem while more text remains beyond them",
      "source": "observation call 7"
    },
    {
      "name": "textOffsetPastEnd",
      "recorded": true,
      "observedResult": "itemId with textOffset beyond the text length serves the item with text \"\", textTruncated false, nextTextOffset null and no error",
      "source": "observation call 8"
    },
    {
      "name": "runLimitOne",
      "recorded": true,
      "observedResult": "runLimit 1 on a thread with one run serves that run in recentRuns",
      "source": "observation calls 1-8"
    },
    {
      "name": "completedTarget",
      "recorded": true,
      "observedResult": "every read targeted a thread with status completed",
      "source": "setup row"
    },
    {
      "name": "limitOutOfRange",
      "recorded": false,
      "observedResult": null,
      "source": "not sent: the t3_thread_read schema declares limit minimum 1 and names 1 to 100 only in its description, so a limit above 100 has no recorded host behaviour"
    },
    {
      "name": "maxCharsPerItemOutOfRange",
      "recorded": false,
      "observedResult": null,
      "source": "not sent: the t3_thread_read schema declares maxCharsPerItem minimum 1 and names 1 to 50000 only in its description, so a value above 50000 has no recorded host behaviour"
    },
    {
      "name": "maxCharsPerItemEqualsTextLength",
      "recorded": false,
      "observedResult": null,
      "source": "not observed"
    },
    {
      "name": "textOffsetFinalChunk",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: a textOffset above 0 whose remaining text fits into maxCharsPerItem"
    },
    {
      "name": "textOffsetAtEnd",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: a textOffset above 0 equal to the text length"
    },
    {
      "name": "textOffsetWithoutItemId",
      "recorded": false,
      "observedResult": null,
      "source": "not observed"
    },
    {
      "name": "textOffsetZero",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: the first-chunk read (call 6) omitted textOffset, and no read passed textOffset 0"
    },
    {
      "name": "itemIdWithListParameters",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: itemId with view, limit or afterPosition"
    },
    {
      "name": "afterPositionBeforeFirstViewPosition",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: an afterPosition below the first position the view serves"
    },
    {
      "name": "emptyView",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: the one empty page (call 5) lay past the last position of a non-empty view; no read found a view without items, with or without afterPosition"
    },
    {
      "name": "unknownItemId",
      "recorded": false,
      "observedResult": null,
      "source": "not observed"
    },
    {
      "name": "omittedView",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: every list read named its view"
    },
    {
      "name": "omittedLimit",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: every list read named its limit"
    },
    {
      "name": "omittedMaxCharsPerItem",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: the calls without maxCharsPerItem (5 and 8) served no text"
    },
    {
      "name": "omittedRunLimit",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: every call passed runLimit 1"
    },
    {
      "name": "runLimitAboveOne",
      "recorded": false,
      "observedResult": null,
      "source": "not recorded: the recentRuns shape at runLimit above 1; the acceptance paging reads used runLimit 2 (focus-host-acceptance.md:75,105-114) but recorded no run key set"
    },
    {
      "name": "runCountOtherThanOne",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: the target had one run"
    },
    {
      "name": "environmentId",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: no cross-environment read"
    },
    {
      "name": "unobservedItemType",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: item types beyond itemTypesByView"
    },
    {
      "name": "senderThreadIdOnOtherItemType",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: senderThreadId was present only on the agent-sent user_message at position 0"
    },
    {
      "name": "runningTarget",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: no key set was recorded for a running target"
    },
    {
      "name": "heldReply",
      "recorded": false,
      "observedResult": null,
      "source": "not observed: no hold occurred, focus-host-evidence.md:104"
    },
    {
      "name": "lateReply",
      "recorded": false,
      "observedResult": null,
      "source": "not observed by decision, focus-host-evidence.md:106"
    },
    {
      "name": "agentRowBusyIdleState",
      "recorded": false,
      "observedResult": null,
      "source": "not observed"
    }
  ],
  "selfReportProjection": {
    "kind": "projection of prose host output, Claude Code 2.1.292",
    "listAgentsHeader": {
      "name": { "source": "focus-host-evidence.md:108" },
      "ref": { "pattern": "^[0-9a-fA-F]{6}$", "source": "focus-host-evidence.md:108" }
    },
    "listAgentsRow": {
      "name": { "source": "focus-host-evidence.md:107" },
      "ref": { "pattern": "^[0-9a-fA-F]{6}$", "source": "focus-host-evidence.md:107" },
      "mode": { "observedValues": ["interactive"], "source": "focus-host-evidence.md:53-54" }
    },
    "sendResult": {
      "messageId": { "source": "focus-host-evidence.md:104" },
      "status": { "source": "focus-host-evidence.md:104" },
      "notice": { "presence": "restart notice only", "source": "focus-host-evidence.md:104" }
    },
    "reply": {
      "from": {
        "pattern": "^uds:/tmp/cc-socks/[0-9]+\\.sock$",
        "source": "focus-host-evidence.md:112-113"
      },
      "from-name": { "source": "focus-host-evidence.md:114" },
      "from-mode": { "observedValues": ["prompting"], "source": "focus-host-evidence.md:115-116" },
      "text": { "source": "focus-host-evidence.md:104" }
    }
  }
}
```
