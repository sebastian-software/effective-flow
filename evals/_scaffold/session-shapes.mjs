// Host shapes and behaviours for the eval session stub (`session-stub.mjs`).
//
// Single source: the fenced `json` block of
// `docs/developer-guide/focus-session-shape-observations.md`, the dated addendum that records what
// T3 Code `0.1.6` actually served and which Claude Code self-report facts the committed evidence
// cites. This module restates that block and nothing beyond it; a change belongs in a new dated
// addendum first, and the stub test asserts that this data deep-equals the block.
//
// `STUB_PROTOCOL` is the one deliberate exception, kept apart from the block: it lists the stub's
// own envelope keys, which make no claim to be host shape.

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const HOST_KEY_SETS = deepFreeze({
  response: ['thread', 'recentRuns', 'items', 'nextPosition', 'hasMore'],
  thread: [
    'threadId',
    'projectId',
    'title',
    'link',
    'createdBy',
    'creationSource',
    'status',
    'latestRunId',
    'activeRunId',
    'providerInstanceId',
    'model',
    'runtimeMode',
    'interactionMode',
    'linkedPullRequest',
    'pullRequests',
    'titleRegeneration',
    'branch',
    'worktreePath',
    'parentThreadId',
    'relationshipToParent',
    'runCount',
    'itemCount',
    'pendingRequestCount',
    'archived',
    'settled',
    'settledAt',
    'snoozed',
    'snoozedUntil',
    'createdAt',
    'updatedAt',
  ],
  run: [
    'runId',
    'ordinal',
    'status',
    'providerInstanceId',
    'model',
    'requestedAt',
    'startedAt',
    'completedAt',
  ],
  item: [
    'position',
    'visibility',
    'sourceThreadId',
    'itemId',
    'runId',
    'messageId',
    'createdBy',
    'creationSource',
    'type',
    'status',
    'title',
    'text',
    'textTruncated',
    'nextTextOffset',
    'updatedAt',
  ],
  optionalItemKeys: ['senderThreadId'],
});

export const ITEM_TYPES_BY_VIEW = deepFreeze({
  activity: ['user_message', 'command_execution', 'assistant_message', 'reasoning'],
  messages: ['user_message', 'assistant_message'],
});

export const BEHAVIOURS = deepFreeze([
  {
    name: 'activityViewServesAllTypes',
    recorded: true,
    observedResult: 'the activity view serves items of every observed type in ascending position',
    source: 'observation calls 1 and 3',
  },
  {
    name: 'messagesViewFiltersTypes',
    recorded: true,
    observedResult:
      'the messages view serves only user_message and assistant_message items, so its positions are non-contiguous',
    source: 'observation calls 2 and 4; focus-host-acceptance.md:75',
  },
  {
    name: 'limitCapsPage',
    recorded: true,
    observedResult:
      'a list read serves at most limit items of the view, fewer when the view holds fewer',
    source: 'observation calls 1-4; focus-host-acceptance.md:75',
  },
  {
    name: 'nextPositionIsLastServed',
    recorded: true,
    observedResult: 'nextPosition equals the position of the last served item',
    source: 'observation calls 1-4, 6 and 7; focus-host-acceptance.md:75,105-114',
  },
  {
    name: 'hasMoreWhenViewContinues',
    recorded: true,
    observedResult:
      'hasMore is true when the view holds an item after the last served position, else false',
    source: 'observation calls 1-4; focus-host-acceptance.md:75,105-114',
  },
  {
    name: 'afterPositionExclusive',
    recorded: true,
    observedResult: 'afterPosition equal to a served position serves only later positions',
    source: 'observation call 3; focus-host-acceptance.md:105-114',
  },
  {
    name: 'afterPositionBetweenPositions',
    recorded: true,
    observedResult: 'afterPosition between two view positions serves from the next view position',
    source: 'observation call 4',
  },
  {
    name: 'emptyPage',
    recorded: true,
    observedResult:
      'an afterPosition at or after the last position of a non-empty view serves items [], nextPosition null, hasMore false and no error',
    source: 'observation call 5',
  },
  {
    name: 'itemTextTruncation',
    recorded: true,
    observedResult:
      'text longer than maxCharsPerItem is cut to maxCharsPerItem characters with textTruncated true and nextTextOffset maxCharsPerItem; shorter text is served whole with textTruncated false and nextTextOffset null',
    source: 'observation calls 1 and 6',
  },
  {
    name: 'itemIdSingleItemRead',
    recorded: true,
    observedResult:
      'itemId without view, limit or afterPosition serves that one item with nextPosition its position and hasMore false',
    source: 'observation calls 6-8',
  },
  {
    name: 'textOffsetContinuation',
    recorded: true,
    observedResult:
      'itemId with textOffset serves maxCharsPerItem characters from textOffset with textTruncated true and nextTextOffset textOffset plus maxCharsPerItem while more text remains beyond them',
    source: 'observation call 7',
  },
  {
    name: 'textOffsetPastEnd',
    recorded: true,
    observedResult:
      'itemId with textOffset beyond the text length serves the item with text "", textTruncated false, nextTextOffset null and no error',
    source: 'observation call 8',
  },
  {
    name: 'runLimitOne',
    recorded: true,
    observedResult: 'runLimit 1 on a thread with one run serves that run in recentRuns',
    source: 'observation calls 1-8',
  },
  {
    name: 'completedTarget',
    recorded: true,
    observedResult: 'every read targeted a thread with status completed',
    source: 'setup row',
  },
  {
    name: 'limitOutOfRange',
    recorded: false,
    observedResult: null,
    source:
      'not sent: the t3_thread_read schema declares limit minimum 1 and names 1 to 100 only in its description, so a limit above 100 has no recorded host behaviour',
  },
  {
    name: 'maxCharsPerItemOutOfRange',
    recorded: false,
    observedResult: null,
    source:
      'not sent: the t3_thread_read schema declares maxCharsPerItem minimum 1 and names 1 to 50000 only in its description, so a value above 50000 has no recorded host behaviour',
  },
  {
    name: 'maxCharsPerItemEqualsTextLength',
    recorded: false,
    observedResult: null,
    source: 'not observed',
  },
  {
    name: 'textOffsetFinalChunk',
    recorded: false,
    observedResult: null,
    source: 'not observed: a textOffset above 0 whose remaining text fits into maxCharsPerItem',
  },
  {
    name: 'textOffsetAtEnd',
    recorded: false,
    observedResult: null,
    source: 'not observed: a textOffset above 0 equal to the text length',
  },
  {
    name: 'textOffsetWithoutItemId',
    recorded: false,
    observedResult: null,
    source: 'not observed',
  },
  {
    name: 'textOffsetZero',
    recorded: false,
    observedResult: null,
    source:
      'not observed: the first-chunk read (call 6) omitted textOffset, and no read passed textOffset 0',
  },
  {
    name: 'itemIdWithListParameters',
    recorded: false,
    observedResult: null,
    source: 'not observed: itemId with view, limit or afterPosition',
  },
  {
    name: 'afterPositionBeforeFirstViewPosition',
    recorded: false,
    observedResult: null,
    source: 'not observed: an afterPosition below the first position the view serves',
  },
  {
    name: 'emptyView',
    recorded: false,
    observedResult: null,
    source:
      'not observed: the one empty page (call 5) lay past the last position of a non-empty view; no read found a view without items, with or without afterPosition',
  },
  {
    name: 'unknownItemId',
    recorded: false,
    observedResult: null,
    source: 'not observed',
  },
  {
    name: 'omittedView',
    recorded: false,
    observedResult: null,
    source: 'not observed: every list read named its view',
  },
  {
    name: 'omittedLimit',
    recorded: false,
    observedResult: null,
    source: 'not observed: every list read named its limit',
  },
  {
    name: 'omittedMaxCharsPerItem',
    recorded: false,
    observedResult: null,
    source: 'not observed: the calls without maxCharsPerItem (5 and 8) served no text',
  },
  {
    name: 'omittedRunLimit',
    recorded: false,
    observedResult: null,
    source: 'not observed: every call passed runLimit 1',
  },
  {
    name: 'runLimitAboveOne',
    recorded: false,
    observedResult: null,
    source:
      'not recorded: the recentRuns shape at runLimit above 1; the acceptance paging reads used runLimit 2 (focus-host-acceptance.md:75,105-114) but recorded no run key set',
  },
  {
    name: 'runCountOtherThanOne',
    recorded: false,
    observedResult: null,
    source: 'not observed: the target had one run',
  },
  {
    name: 'environmentId',
    recorded: false,
    observedResult: null,
    source: 'not observed: no cross-environment read',
  },
  {
    name: 'unobservedItemType',
    recorded: false,
    observedResult: null,
    source: 'not observed: item types beyond itemTypesByView',
  },
  {
    name: 'senderThreadIdOnOtherItemType',
    recorded: false,
    observedResult: null,
    source:
      'not observed: senderThreadId was present only on the agent-sent user_message at position 0',
  },
  {
    name: 'runningTarget',
    recorded: false,
    observedResult: null,
    source: 'not observed: no key set was recorded for a running target',
  },
  {
    name: 'heldReply',
    recorded: false,
    observedResult: null,
    source: 'not observed: no hold occurred, focus-host-evidence.md:104',
  },
  {
    name: 'lateReply',
    recorded: false,
    observedResult: null,
    source: 'not observed by decision, focus-host-evidence.md:106',
  },
  {
    name: 'agentRowBusyIdleState',
    recorded: false,
    observedResult: null,
    source: 'not observed',
  },
]);

export const SELF_REPORT_PROJECTION = deepFreeze({
  kind: 'projection of prose host output, Claude Code 2.1.292',
  listAgentsHeader: {
    name: {
      source: 'focus-host-evidence.md:108',
    },
    ref: {
      pattern: '^[0-9a-fA-F]{6}$',
      source: 'focus-host-evidence.md:108',
    },
  },
  listAgentsRow: {
    name: {
      source: 'focus-host-evidence.md:107',
    },
    ref: {
      pattern: '^[0-9a-fA-F]{6}$',
      source: 'focus-host-evidence.md:107',
    },
    mode: {
      observedValues: ['interactive'],
      source: 'focus-host-evidence.md:53-54',
    },
  },
  sendResult: {
    messageId: {
      source: 'focus-host-evidence.md:104',
    },
    status: {
      source: 'focus-host-evidence.md:104',
    },
    notice: {
      presence: 'restart notice only',
      source: 'focus-host-evidence.md:104',
    },
  },
  reply: {
    from: {
      pattern: '^uds:/tmp/cc-socks/[0-9]+\\.sock$',
      source: 'focus-host-evidence.md:112-113',
    },
    'from-name': {
      source: 'focus-host-evidence.md:114',
    },
    'from-mode': {
      observedValues: ['prompting'],
      source: 'focus-host-evidence.md:115-116',
    },
    text: {
      source: 'focus-host-evidence.md:104',
    },
  },
});

// The stub protocol, not host shape. Every envelope carries `ok` and `operation`; a success adds
// `result` (the host-shaped object or the self-report projection), a failure adds `error`. The
// `unrecorded` code answers any request that would need behaviour the addendum does not record. A
// poll that finds no reply serves the `noReplyYet` result instead of a projected reply.
export const STUB_PROTOCOL = deepFreeze({
  okKey: 'ok',
  successEnvelopeKeys: ['ok', 'operation', 'result'],
  errorEnvelopeKeys: ['ok', 'operation', 'error'],
  errorKeys: ['code', 'message', 'details'],
  errorCodes: {
    unrecorded: 'unrecorded',
    invalidInput: 'invalid-input',
    undefinedInFixture: 'undefined',
    fixtureInvalid: 'fixture-invalid',
    traceUnavailable: 'trace-unavailable',
    internalError: 'internal-error',
  },
  noReplyYet: { noReplyYet: true },
});
