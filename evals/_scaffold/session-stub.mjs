#!/usr/bin/env node

// The eval stand-in for a focus observer's session surfaces: the T3 Code thread reader and the
// Claude Code self-report request (`ListAgents`, `SendMessage`, the awaited reply). A suite's
// overlay copies this file and `session-shapes.mjs` into the slot's `<skill>/scripts/`, so a run
// under evaluation reads fixture sessions through one subprocess and no host, thread or peer
// session is involved.
//
// It follows the tracker stub's protocol (`remote-tracker.mjs`): exactly `<operation>` as argv, one
// JSON object on standard input, exactly one JSON envelope on standard output, a non-zero exit when
// `ok` is false, and every call appended to a lock-protected trace. Like the tracker stub it invents
// no host envelope: every host-shaped key comes from `session-shapes.mjs`, whose single source is
// the dated addendum `docs/developer-guide/focus-session-shape-observations.md`. A read path runs
// only while its behaviour entry there is `recorded: true`; a request that would need any other
// behaviour fails with an `unrecorded` error envelope naming the parameter. The envelope keys and
// error codes are the stub's own protocol (`STUB_PROTOCOL`), never presented as host shape.
//
// Fixture: the slot's `fixture.json`, two levels above `<skill>/scripts/` like the tracker stub's,
// overridable through `EVAL_SESSION_FIXTURE`. Only its top-level `session` key is read, so the
// tracker stub's `operations` map and the project writer's `repository` key stay untouched:
//
//   session.threads      { <threadId>: { thread, recentRuns, items } }; items hold full `text` and
//                        every recorded item key except the computed `textTruncated`/`nextTextOffset`
//   session.listAgents   { header, rows } or { sequence: [{ header, rows }, ...], repeatLast? }
//   session.send         { variant?, messageId, status, notice? } or { sequence: [...], repeatLast? }
//   session.replies      [ { variant, ...reply fields, polls? }, ... ], consumed by await-reply polls

import { appendFileSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

import {
  BEHAVIOURS,
  HOST_KEY_SETS,
  ITEM_TYPES_BY_VIEW,
  SELF_REPORT_PROJECTION,
  STUB_PROTOCOL,
} from './session-shapes.mjs';

export const SESSION_OPERATIONS = Object.freeze([
  'thread-read',
  'list-agents',
  'send-message',
  'await-reply',
]);
export const SEND_VARIANTS = Object.freeze(['accepted', 'restart-notice']);
// `none` also serves a held reply: a hold is target-side state the observer cannot see. `late` is a
// declared stub-protocol proxy, not host shape (the late reply is `recorded: false`): it serves
// "no reply yet" for its declared number of polls, then its reply.
export const REPLY_VARIANTS = Object.freeze([
  'delivered',
  'none',
  'refused',
  'narration-only',
  'wrong-nonce',
  'name-mismatch',
  'foreign',
  'malformed',
  'late',
]);
export const NONCE_TOKEN = '{{NONCE}}';
const NONCE_PATTERN = /(?<![0-9A-Za-z])focus-([0-9a-f]{32})(?![0-9A-Za-z])/g;

const CODES = STUB_PROTOCOL.errorCodes;
const USAGE = 'usage: session-stub.mjs <operation>';

// The `t3_thread_read` input schema, the stub's input contract rather than an observation, so it
// stays here and out of `session-shapes.mjs` and its addendum block. The schema enforces the keys,
// the view enum and each `minimum`: a call outside them is a stub-protocol input error, because the
// host's own client rejects it before it is sent. The upper bounds appear only in the schema's
// descriptions, so a value above one is not rejected client-side and its host behaviour is
// unrecorded (`limitOutOfRange`, `maxCharsPerItemOutOfRange`, and `runLimitAboveOne` for any
// runLimit above 1).
const THREAD_READ_SCHEMA = Object.freeze({
  keys: Object.freeze([
    'threadId',
    'environmentId',
    'view',
    'limit',
    'maxCharsPerItem',
    'runLimit',
    'afterPosition',
    'itemId',
    'textOffset',
  ]),
  views: Object.freeze(['messages', 'activity']),
  minimums: Object.freeze({
    limit: 1,
    maxCharsPerItem: 1,
    runLimit: 1,
    afterPosition: 0,
    textOffset: 0,
  }),
  describedMaximums: Object.freeze({
    limit: { maximum: 100, behaviour: 'limitOutOfRange' },
    maxCharsPerItem: { maximum: 50000, behaviour: 'maxCharsPerItemOutOfRange' },
  }),
});
// The item keys the stub computes per read; a fixture item carries every other recorded item key.
const COMPUTED_ITEM_KEYS = Object.freeze(['textTruncated', 'nextTextOffset']);
// Stub-side readings of recorded facts, kept here because the addendum block states them as
// behaviour entries, not as values: the one observed thread status (`completedTarget`), the one
// observed run count (`runLimitOne`), and the one item type that carried `senderThreadId`.
const RECORDED_THREAD_STATUS = 'completed';
const RECORDED_RUN_COUNT = 1;
const SENDER_THREAD_ID_ITEM_TYPE = 'user_message';

const SESSION_KEYS = Object.freeze(['threads', 'listAgents', 'send', 'replies']);
const SEQUENCE_FIELD = 'sequence';
const REPEAT_LAST_FIELD = 'repeatLast';

export class StubError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function okEnvelope(operation, result) {
  return { ok: true, operation, result };
}

export function errorEnvelope(operation, code, message, details = {}) {
  return { ok: false, operation, error: { code, message, details } };
}

function internalError(message) {
  return new StubError(CODES.internalError, message);
}

function invalidInput(message, details = {}) {
  return new StubError(CODES.invalidInput, message, details);
}

function fixtureInvalid(message, details = {}) {
  return new StubError(CODES.fixtureInvalid, message, details);
}

function unrecorded(parameter, behaviour, why) {
  return new StubError(
    CODES.unrecorded,
    `${parameter}: ${why}; the session-shape addendum records no host behaviour for it`,
    { parameter, behaviour },
  );
}

// Every read path passes through here with the entry that licenses it. An entry with
// `recorded: false` turns the request into an `unrecorded` envelope naming `parameter`, so the
// stub serves exactly what the behaviour list records and nothing it would have to guess.
function behaviour(name, parameter = null, why = 'not recorded') {
  const entry = BEHAVIOURS.find((candidate) => candidate.name === name);
  if (entry === undefined) throw internalError(`session-shapes.mjs has no behaviour named ${name}`);
  if (entry.recorded !== true) throw unrecorded(parameter ?? name, name, why);
  return entry;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sameKeySet(actual, expected) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function requireKeys(object, expected, label) {
  if (!isPlainObject(object)) throw fixtureInvalid(`${label} must be an object`);
  if (!sameKeySet(Object.keys(object), expected)) {
    throw fixtureInvalid(
      `${label} must carry exactly the recorded keys ${expected.join(', ')}; it carries ${Object.keys(object).join(', ')}`,
      { label, expected: [...expected], actual: Object.keys(object) },
    );
  }
}

function pick(object, keys) {
  const out = {};
  for (const key of keys) out[key] = object[key];
  return out;
}

export function noncesIn(text) {
  return [...new Set([...String(text).matchAll(NONCE_PATTERN)].map((match) => match[0]))];
}

// --- argv -----------------------------------------------------------------------------------

// Returns `{ operation }`, or `{ refusal }`. The stub performs no mutation, so `--apply` is refused
// like any other extra argument, before stdin is read and before anything is recorded.
export function parseSessionArgv(argv) {
  const [operation, ...rest] = argv;
  if (typeof operation !== 'string' || operation === '' || operation.startsWith('-')) {
    return { refusal: `the operation must be the first argument; ${USAGE}` };
  }
  if (rest.includes('--apply')) {
    return { refusal: `--apply is refused: the session stub performs no mutation; ${USAGE}` };
  }
  if (rest.length > 0) return { refusal: `only <operation> is accepted; ${USAGE}` };
  return { operation };
}

// --- thread-read ----------------------------------------------------------------------------

export function validateThreadReadInput(input) {
  if (!isPlainObject(input)) throw invalidInput('thread-read input must be a JSON object');
  for (const key of Object.keys(input)) {
    if (!THREAD_READ_SCHEMA.keys.includes(key)) {
      throw invalidInput(`thread-read input key ${key} is not in the t3_thread_read schema`, {
        parameter: key,
        allowed: [...THREAD_READ_SCHEMA.keys],
      });
    }
  }
  if (typeof input.threadId !== 'string' || input.threadId === '') {
    throw invalidInput('threadId is required and must be a non-empty string', {
      parameter: 'threadId',
    });
  }
  for (const key of ['environmentId', 'itemId']) {
    if (input[key] !== undefined && typeof input[key] !== 'string') {
      throw invalidInput(`${key} must be a string`, { parameter: key });
    }
  }
  if (input.itemId === '') throw invalidInput('itemId must be non-empty', { parameter: 'itemId' });
  if (input.view !== undefined && !THREAD_READ_SCHEMA.views.includes(input.view)) {
    throw invalidInput(`view must be one of ${THREAD_READ_SCHEMA.views.join(', ')}`, {
      parameter: 'view',
    });
  }
  for (const [key, min] of Object.entries(THREAD_READ_SCHEMA.minimums)) {
    const value = input[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < min) {
      throw invalidInput(
        `${key} must be an integer of at least ${min} per the t3_thread_read schema`,
        {
          parameter: key,
          min,
        },
      );
    }
  }
  for (const [key, bound] of Object.entries(THREAD_READ_SCHEMA.describedMaximums)) {
    if (input[key] > bound.maximum) {
      behaviour(bound.behaviour, key, `${key} ${input[key]} above the described ${bound.maximum}`);
    }
  }
  return input;
}

// Validates one fixture thread against the recorded key sets and the recorded thread state.
function checkThreadFixture(threadId, entry) {
  const label = `session.threads.${threadId}`;
  requireKeys(entry, ['thread', 'recentRuns', 'items'], label);
  requireKeys(entry.thread, HOST_KEY_SETS.thread, `${label}.thread`);
  if (entry.thread.status !== RECORDED_THREAD_STATUS) {
    behaviour('runningTarget', 'thread.status', `status ${JSON.stringify(entry.thread.status)}`);
  }
  // A completed thread has no active run (focus-host-evidence.md:73, Q3), so a fixture that keeps
  // one, or a running run, contradicts the one recorded thread state rather than extending it.
  if (entry.thread.activeRunId !== null) {
    throw fixtureInvalid(`${label}.thread.activeRunId must be null in a completed thread`);
  }
  if (!Array.isArray(entry.recentRuns))
    throw fixtureInvalid(`${label}.recentRuns must be an array`);
  entry.recentRuns.forEach((run, index) => {
    requireKeys(run, HOST_KEY_SETS.run, `${label}.recentRuns[${index}]`);
    if (run.status === 'running') {
      throw fixtureInvalid(`${label}.recentRuns[${index}] is running in a completed thread`);
    }
  });
  if (entry.thread.runCount !== RECORDED_RUN_COUNT) {
    behaviour('runCountOtherThanOne', 'thread.runCount', `runCount ${entry.thread.runCount}`);
  }
  if (entry.recentRuns.length !== RECORDED_RUN_COUNT) {
    behaviour('runCountOtherThanOne', 'recentRuns', `${entry.recentRuns.length} run(s)`);
  }
  if (!Array.isArray(entry.items)) throw fixtureInvalid(`${label}.items must be an array`);
  if (!Number.isInteger(entry.thread.itemCount) || entry.thread.itemCount < entry.items.length) {
    throw fixtureInvalid(
      `${label}.thread.itemCount must be an integer of at least the ${entry.items.length} fixture items`,
    );
  }
  const required = HOST_KEY_SETS.item.filter((key) => !COMPUTED_ITEM_KEYS.includes(key));
  const knownTypes = new Set(Object.values(ITEM_TYPES_BY_VIEW).flat());
  const positions = new Set();
  const itemIds = new Set();
  entry.items.forEach((item, index) => {
    const itemLabel = `${label}.items[${index}]`;
    if (!isPlainObject(item)) throw fixtureInvalid(`${itemLabel} must be an object`);
    const optional = Object.keys(item).filter((key) =>
      HOST_KEY_SETS.optionalItemKeys.includes(key),
    );
    requireKeys(item, [...required, ...optional], itemLabel);
    if (!Number.isInteger(item.position) || item.position < 0 || positions.has(item.position)) {
      throw fixtureInvalid(`${itemLabel}.position must be a unique non-negative integer`);
    }
    if (typeof item.itemId !== 'string' || item.itemId === '' || itemIds.has(item.itemId)) {
      throw fixtureInvalid(`${itemLabel}.itemId must be a unique non-empty string`);
    }
    if (typeof item.text !== 'string') throw fixtureInvalid(`${itemLabel}.text must be a string`);
    if (!knownTypes.has(item.type)) {
      behaviour('unobservedItemType', `items[${index}].type`, `type ${JSON.stringify(item.type)}`);
    }
    if (Object.hasOwn(item, 'senderThreadId') && item.type !== SENDER_THREAD_ID_ITEM_TYPE) {
      behaviour(
        'senderThreadIdOnOtherItemType',
        `items[${index}].senderThreadId`,
        `on a ${item.type} item`,
      );
    }
    positions.add(item.position);
    itemIds.add(item.itemId);
  });
}

// One item's served text window, following only the recorded truncation behaviours.
function serveText(text, offset, maxChars) {
  const length = text.length;
  if (offset > length) {
    behaviour('textOffsetPastEnd');
    return { text: '', textTruncated: false, nextTextOffset: null };
  }
  if (maxChars === undefined) behaviour('omittedMaxCharsPerItem', 'maxCharsPerItem');
  if (offset === 0) {
    if (length === maxChars) {
      behaviour('maxCharsPerItemEqualsTextLength', 'maxCharsPerItem', 'equals the text length');
    }
    behaviour('itemTextTruncation');
    return length > maxChars
      ? { text: text.slice(0, maxChars), textTruncated: true, nextTextOffset: maxChars }
      : { text, textTruncated: false, nextTextOffset: null };
  }
  if (offset === length) behaviour('textOffsetAtEnd', 'textOffset', 'equals the text length');
  if (length - offset <= maxChars) {
    behaviour('textOffsetFinalChunk', 'textOffset', 'the remaining text fits maxCharsPerItem');
  }
  behaviour('textOffsetContinuation');
  return {
    text: text.slice(offset, offset + maxChars),
    textTruncated: true,
    nextTextOffset: offset + maxChars,
  };
}

function serveItem(item, offset, maxChars) {
  const window = serveText(item.text, offset, maxChars);
  const served = {};
  for (const key of HOST_KEY_SETS.item) {
    served[key] = Object.hasOwn(window, key) ? window[key] : item[key];
  }
  for (const key of HOST_KEY_SETS.optionalItemKeys) {
    if (Object.hasOwn(item, key)) served[key] = item[key];
  }
  return served;
}

function threadResponse(entry, items, nextPosition, hasMore) {
  const parts = {
    thread: pick(entry.thread, HOST_KEY_SETS.thread),
    recentRuns: entry.recentRuns.map((run) => pick(run, HOST_KEY_SETS.run)),
    items,
    nextPosition,
    hasMore,
  };
  return pick(parts, HOST_KEY_SETS.response);
}

export function readThread(session, input) {
  validateThreadReadInput(input);
  if (typeof input.environmentId === 'string' && input.environmentId !== '') {
    behaviour('environmentId', 'environmentId', 'a cross-environment read');
  }
  const threads = session.threads;
  if (!isPlainObject(threads)) {
    throw new StubError(CODES.undefinedInFixture, 'the fixture session defines no threads', {
      definedSessionKeys: Object.keys(session),
    });
  }
  if (!Object.hasOwn(threads, input.threadId)) {
    throw new StubError(
      CODES.undefinedInFixture,
      `the fixture defines no thread "${input.threadId}"`,
      { threadId: input.threadId, definedThreads: Object.keys(threads).sort() },
    );
  }
  const entry = threads[input.threadId];
  checkThreadFixture(input.threadId, entry);
  if (input.runLimit === undefined) behaviour('omittedRunLimit', 'runLimit');
  if (input.runLimit > 1) behaviour('runLimitAboveOne', 'runLimit', `runLimit ${input.runLimit}`);
  behaviour('runLimitOne');
  behaviour('completedTarget');
  const items = [...entry.items].sort((left, right) => left.position - right.position);

  if (input.itemId !== undefined) {
    for (const parameter of ['view', 'limit', 'afterPosition']) {
      if (input[parameter] !== undefined) {
        behaviour('itemIdWithListParameters', parameter, 'combined with itemId');
      }
    }
    const item = items.find((candidate) => candidate.itemId === input.itemId);
    if (item === undefined) behaviour('unknownItemId', 'itemId', 'the thread holds no such item');
    // The first-chunk read (observation call 6) omitted textOffset; an explicit 0 is unrecorded.
    if (input.textOffset === 0) behaviour('textOffsetZero', 'textOffset', 'given as 0');
    behaviour('itemIdSingleItemRead');
    const served = serveItem(item, input.textOffset ?? 0, input.maxCharsPerItem);
    return threadResponse(entry, [served], item.position, false);
  }

  if (input.textOffset !== undefined) {
    behaviour('textOffsetWithoutItemId', 'textOffset', 'given without itemId');
  }
  if (input.view === undefined) behaviour('omittedView', 'view', 'omitted');
  if (input.limit === undefined) behaviour('omittedLimit', 'limit', 'omitted');
  behaviour(input.view === 'activity' ? 'activityViewServesAllTypes' : 'messagesViewFiltersTypes');
  const viewItems = items.filter((item) => ITEM_TYPES_BY_VIEW[input.view].includes(item.type));
  let candidates = viewItems;
  if (input.afterPosition !== undefined) {
    const after = input.afterPosition;
    candidates = viewItems.filter((item) => item.position > after);
    if (candidates.length > 0) {
      if (viewItems.some((item) => item.position === after)) behaviour('afterPositionExclusive');
      else if (viewItems.some((item) => item.position < after)) {
        behaviour('afterPositionBetweenPositions');
      } else {
        behaviour(
          'afterPositionBeforeFirstViewPosition',
          'afterPosition',
          'before the first view position',
        );
      }
    }
  }
  // The one recorded empty page (observation call 5) lay past the last position of a non-empty
  // view; a view with no items at all is unrecorded whether or not afterPosition is given.
  if (viewItems.length === 0)
    behaviour('emptyView', 'view', `the ${input.view} view holds no item`);
  behaviour('limitCapsPage');
  const page = candidates.slice(0, input.limit);
  if (page.length === 0) {
    behaviour('emptyPage');
    return threadResponse(entry, [], null, false);
  }
  behaviour('nextPositionIsLastServed');
  behaviour('hasMoreWhenViewContinues');
  const served = page.map((item) => serveItem(item, 0, input.maxCharsPerItem));
  return threadResponse(entry, served, page.at(-1).position, candidates.length > page.length);
}

// --- self-report surfaces -------------------------------------------------------------------

function isEmptyObject(input) {
  return isPlainObject(input) && Object.keys(input).length === 0;
}

function requireEmptyInput(operation, input) {
  if (!isEmptyObject(input)) {
    throw invalidInput(`${operation} takes an empty JSON object as input`);
  }
}

function sessionEntry(session, key) {
  if (!Object.hasOwn(session, key)) {
    throw new StubError(CODES.undefinedInFixture, `the fixture session defines no ${key}`, {
      definedSessionKeys: Object.keys(session),
    });
  }
  return session[key];
}

// A plain entry answers every call; a sequenced one answers the n-th call with its n-th element,
// and a call past the end fails loudly unless the entry declares `repeatLast: true`.
function sequenced(entry, position, label) {
  if (!isPlainObject(entry) || !Object.hasOwn(entry, SEQUENCE_FIELD)) {
    if (isPlainObject(entry) && Object.hasOwn(entry, REPEAT_LAST_FIELD)) {
      throw fixtureInvalid(`${label} declares ${REPEAT_LAST_FIELD} without a ${SEQUENCE_FIELD}`);
    }
    return entry;
  }
  const elements = entry[SEQUENCE_FIELD];
  if (!Array.isArray(elements) || elements.length === 0) {
    throw fixtureInvalid(`${label}.${SEQUENCE_FIELD} must be a non-empty array`);
  }
  const extra = Object.keys(entry).filter(
    (key) => ![SEQUENCE_FIELD, REPEAT_LAST_FIELD].includes(key),
  );
  if (extra.length > 0) {
    throw fixtureInvalid(`${label} carries ${extra.join(', ')} beside its ${SEQUENCE_FIELD}`);
  }
  const repeatLast = entry[REPEAT_LAST_FIELD];
  if (repeatLast !== undefined && typeof repeatLast !== 'boolean') {
    throw fixtureInvalid(`${label}.${REPEAT_LAST_FIELD} must be a boolean`);
  }
  if (position > elements.length && repeatLast !== true) {
    throw new StubError(
      CODES.undefinedInFixture,
      `${label} is exhausted: this is call ${position} and the sequence holds ${elements.length}`,
      { position, sequenceLength: elements.length },
    );
  }
  return elements[Math.min(position, elements.length) - 1];
}

function checkPattern(value, spec, label) {
  if (typeof value !== 'string' || value === '') {
    throw fixtureInvalid(`${label} must be a non-empty string`);
  }
  if (spec.pattern !== undefined && !new RegExp(spec.pattern).test(value)) {
    throw fixtureInvalid(`${label} does not match the recorded pattern ${spec.pattern}`);
  }
  if (spec.observedValues !== undefined && !spec.observedValues.includes(value)) {
    throw new StubError(
      CODES.unrecorded,
      `${label}: value ${JSON.stringify(value)} is not among the observed values ${spec.observedValues.join(', ')}`,
      { parameter: label, behaviour: null },
    );
  }
}

function projected(source, projection, label) {
  const out = {};
  for (const [field, spec] of Object.entries(projection)) {
    checkPattern(source[field], spec, `${label}.${field}`);
    out[field] = source[field];
  }
  return out;
}

export function listAgentsResult(session, input, position) {
  requireEmptyInput('list-agents', input);
  const element = sequenced(sessionEntry(session, 'listAgents'), position, 'session.listAgents');
  requireKeys(element, ['header', 'rows'], 'session.listAgents element');
  const headerFields = Object.keys(SELF_REPORT_PROJECTION.listAgentsHeader);
  requireKeys(element.header, headerFields, 'session.listAgents header');
  if (!Array.isArray(element.rows))
    throw fixtureInvalid('session.listAgents rows must be an array');
  const rowFields = Object.keys(SELF_REPORT_PROJECTION.listAgentsRow);
  const rows = element.rows.map((row, index) => {
    const label = `rows[${index}]`;
    if (!isPlainObject(row)) throw fixtureInvalid(`session.listAgents ${label} must be an object`);
    for (const key of Object.keys(row)) {
      if (!rowFields.includes(key)) {
        // The only row fact the evidence names beyond the projection is busy or idle state.
        throw unrecorded(`${label}.${key}`, 'agentRowBusyIdleState', 'outside the projected row');
      }
    }
    return projected(row, SELF_REPORT_PROJECTION.listAgentsRow, label);
  });
  return {
    header: projected(element.header, SELF_REPORT_PROJECTION.listAgentsHeader, 'header'),
    rows,
  };
}

// Returns the one nonce of a valid send-message input, or throws the input error.
export function validateSendInput(input) {
  if (!isPlainObject(input) || !sameKeySet(Object.keys(input), ['to', 'message'])) {
    throw invalidInput('send-message input must carry exactly to and message');
  }
  if (typeof input.to !== 'string' || input.to === '') {
    throw invalidInput('to must be a non-empty [ref] or name', { parameter: 'to' });
  }
  if (typeof input.message !== 'string') {
    throw invalidInput('message must be a string', { parameter: 'message' });
  }
  const nonces = noncesIn(input.message);
  if (nonces.length !== 1) {
    throw invalidInput(
      `message must carry exactly one nonce focus-<32 hex digits>; it carries ${nonces.length}`,
      { parameter: 'message', nonceCount: nonces.length },
    );
  }
  return nonces[0];
}

export function sendMessageResult(session, input, position) {
  validateSendInput(input);
  const element = sequenced(sessionEntry(session, 'send'), position, 'session.send');
  if (!isPlainObject(element)) throw fixtureInvalid('session.send element must be an object');
  const variant = element.variant ?? 'accepted';
  if (!SEND_VARIANTS.includes(variant)) {
    throw new StubError(CODES.undefinedInFixture, `send variant "${variant}" is not defined`, {
      variant,
      definedVariants: [...SEND_VARIANTS],
    });
  }
  const projection = SELF_REPORT_PROJECTION.sendResult;
  const fields = Object.keys(projection).filter(
    (field) => variant === 'restart-notice' || field !== 'notice',
  );
  const declared = Object.keys(element).filter((key) => key !== 'variant');
  if (!sameKeySet(declared, fields)) {
    throw fixtureInvalid(
      `session.send variant ${variant} must carry exactly ${fields.join(', ')}; it carries ${declared.join(', ')}`,
    );
  }
  const result = {};
  for (const field of fields) {
    checkPattern(element[field], projection[field], `session.send.${field}`);
    result[field] = element[field];
  }
  return result;
}

const REPLY_FIELDS = Object.keys(SELF_REPORT_PROJECTION.reply);
// A send's `to` of six lower-case hex digits is a [ref], as the evidence records refs
// (focus-host-evidence.md:107-108); any other `to` is a name.
const SENT_REF_PATTERN = /^[0-9a-f]{6}$/;

// The session name the last successful send addressed, or null when it cannot be resolved. A name
// is taken as sent. A ref resolves through the rows the observer last saw before that send: the
// element its last list-agents call served, or a plain listAgents entry, which answers every call.
// Without such rows, or without a row carrying the ref, the name stays unknown and the from-name
// checks are skipped rather than guessed.
function sentName(session, state) {
  if (!SENT_REF_PATTERN.test(state.lastTo)) return state.lastTo;
  if (!Object.hasOwn(session, 'listAgents')) return null;
  const entry = session.listAgents;
  const isSequence = isPlainObject(entry) && Object.hasOwn(entry, SEQUENCE_FIELD);
  if (isSequence && state.listPositionAtLastSend === 0) return null;
  let rows;
  try {
    ({ rows } = listAgentsResult(session, {}, Math.max(state.listPositionAtLastSend, 1)));
  } catch (error) {
    if (error instanceof StubError) return null; // no rows to resolve against
    throw error;
  }
  return rows.find((row) => row.ref === state.lastTo)?.name ?? null;
}

// Validates one reply entry: its key set, and the one signal its variant declares against the last
// successful send (`state.lastNonce`, and `name`, the session name its `to` addressed or null when
// unresolvable), so a fixture cannot mislabel its reply.
function checkReplyEntry(entry, index, state, name) {
  const label = `session.replies[${index}]`;
  if (!isPlainObject(entry)) throw fixtureInvalid(`${label} must be an object`);
  if (!REPLY_VARIANTS.includes(entry.variant)) {
    throw new StubError(
      CODES.undefinedInFixture,
      `${label} variant ${JSON.stringify(entry.variant)} is not defined`,
      { variant: entry.variant ?? null, definedVariants: [...REPLY_VARIANTS] },
    );
  }
  const expected =
    entry.variant === 'none'
      ? ['variant']
      : ['variant', ...REPLY_FIELDS, ...(entry.variant === 'late' ? ['polls'] : [])];
  requireKeys(entry, expected, label);
  if (entry.variant === 'late' && (!Number.isInteger(entry.polls) || entry.polls < 1)) {
    throw fixtureInvalid(`${label}.polls must be a positive integer`);
  }
  if (entry.variant === 'none') return;
  const text = entry.text;
  if (typeof text !== 'string') throw fixtureInvalid(`${label}.text must be a string`);
  const hasToken = text.includes(NONCE_TOKEN);
  const literal = noncesIn(text);
  const echoesLast = hasToken || literal.includes(`focus-${state.lastNonce}`);
  // With the sent name unresolvable, every name check below is skipped (see `sentName`).
  const sameNameAsSend = name !== null && entry['from-name'] === name;
  const otherNameThanSend = name !== null && entry['from-name'] !== name;
  switch (entry.variant) {
    case 'delivered':
    case 'late':
      if (!hasToken) throw fixtureInvalid(`${label}.text must contain ${NONCE_TOKEN}`);
      if (otherNameThanSend) {
        throw fixtureInvalid(
          `${label}.from-name must be ${JSON.stringify(name)}, the session the last send addressed`,
        );
      }
      break;
    case 'name-mismatch':
      if (!hasToken || sameNameAsSend) {
        throw fixtureInvalid(
          `${label} must contain ${NONCE_TOKEN} under a from-name other than the last send's to`,
        );
      }
      break;
    case 'refused':
    case 'narration-only':
      if (hasToken || literal.length > 0) {
        throw fixtureInvalid(`${label}.text must carry no nonce`);
      }
      break;
    case 'wrong-nonce':
      if (hasToken || literal.length === 0 || echoesLast) {
        throw fixtureInvalid(
          `${label}.text must carry a literal nonce other than the last sent one, and no ${NONCE_TOKEN}`,
        );
      }
      break;
    case 'foreign':
      if (echoesLast || sameNameAsSend) {
        throw fixtureInvalid(
          `${label} must not echo the last sent nonce and must use a from-name other than the last send's to`,
        );
      }
      break;
    case 'malformed':
      if (hasToken || literal.length > 0) {
        throw fixtureInvalid(`${label}.text must carry no parsable nonce`);
      }
      break;
    default:
      break;
  }
}

export function awaitReplyResult(session, input, state) {
  requireEmptyInput('await-reply', input);
  if (state.lastNonce === null) {
    throw invalidInput('await-reply before any valid send-message: there is no nonce to echo');
  }
  const replies = sessionEntry(session, 'replies');
  if (!Array.isArray(replies)) throw fixtureInvalid('session.replies must be an array');
  const timeline = [];
  const name = sentName(session, state);
  replies.forEach((entry, index) => {
    checkReplyEntry(entry, index, state, name);
    if (entry.variant === 'none') timeline.push(null);
    else {
      if (entry.variant === 'late')
        for (let poll = 0; poll < entry.polls; poll += 1) timeline.push(null);
      timeline.push({ entry, index });
    }
  });
  // Polls count from the first successful send, so a stale-reply fixture names `wrong-nonce`
  // explicitly rather than relying on a second send leaving an old reply behind.
  const slot = timeline[state.pollPosition - 1] ?? null;
  if (slot === null) return { ...STUB_PROTOCOL.noReplyYet };
  const label = `session.replies[${slot.index}]`;
  const text = slot.entry.text.replaceAll(NONCE_TOKEN, `focus-${state.lastNonce}`);
  return projected({ ...slot.entry, text }, SELF_REPORT_PROJECTION.reply, label);
}

// --- trace ----------------------------------------------------------------------------------

// The state the self-report operations need across processes, derived from the trace records that
// precede this call: the last successful send's nonce and `to`, the list-agents calls before it,
// and each operation's call position.
// A prior send counts only if it succeeded, so each one is replayed through the same input check
// and send-result logic against the same fixture session; a poll counts only after the first
// successful send and only with the valid empty input.
export function traceState(priorRecords, operation, session) {
  let lastNonce = null;
  let lastTo = null;
  let listPositionAtLastSend = 0;
  let sends = 0;
  let listCalls = 0;
  let polls = 0;
  for (const record of priorRecords) {
    if (record.operation === 'send-message') {
      let nonce;
      try {
        nonce = validateSendInput(record.input);
        sendMessageResult(session, record.input, sends + 1);
      } catch (error) {
        if (error instanceof StubError) continue; // a failed send served an error and set no nonce
        throw error;
      }
      lastNonce = nonce.slice('focus-'.length);
      lastTo = record.input.to;
      listPositionAtLastSend = listCalls;
      sends += 1;
    } else if (record.operation === 'list-agents' && isEmptyObject(record.input)) {
      listCalls += 1;
    } else if (record.operation === 'await-reply' && sends > 0 && isEmptyObject(record.input)) {
      polls += 1;
    }
  }
  const position = { 'list-agents': listCalls + 1, 'send-message': sends + 1 };
  return {
    lastNonce,
    lastTo,
    listPositionAtLastSend,
    pollPosition: polls + 1,
    position: position[operation] ?? null,
  };
}

// Lock and record helpers copied from `remote-tracker.mjs`, which does not export them. Unlike the
// tracker's lenient `recordEvent`, every call here is strict: the record is the only state shared
// across stub processes (nonce, sequence and poll positions), so an unobtainable lock or an
// unreadable trace fails the call instead of serving from a guessed position.
const LOCK_TIMEOUT_MS = 5000;
const LOCK_POLL_MS = 5;

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function traceUnavailable(message) {
  return new StubError(CODES.traceUnavailable, message);
}

// Only a held lock (EEXIST) is waited for; any other mkdir failure, such as a read-only trace
// directory, cannot clear by waiting and fails at once. Every retry, including one after breaking
// a stale lock or after the lock vanished, is bounded by the same deadline.
function acquireLock(lockPath, deadline) {
  for (;;) {
    try {
      mkdirSync(lockPath);
      return;
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw traceUnavailable(`the trace lock at ${lockPath} cannot be created: ${error.message}`);
      }
    }
    try {
      if (Date.now() - statSync(lockPath).mtimeMs > LOCK_TIMEOUT_MS) {
        rmSync(lockPath, { recursive: true, force: true });
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw traceUnavailable(
          `the trace lock at ${lockPath} cannot be inspected: ${error.message}`,
        );
      }
    }
    if (Date.now() >= deadline) {
      throw traceUnavailable(
        `the trace lock at ${lockPath} could not be obtained within ${LOCK_TIMEOUT_MS} ms`,
      );
    }
    sleepSync(LOCK_POLL_MS);
  }
}

// Appends `{ seq, operation, input, at }` under the lock and returns the records before it.
export function recordCall(logPath, operation, input) {
  const lockPath = `${logPath}.lock`;
  try {
    mkdirSync(dirname(logPath), { recursive: true });
  } catch (error) {
    throw traceUnavailable(
      `the trace directory for ${logPath} cannot be created: ${error.message}`,
    );
  }
  acquireLock(lockPath, Date.now() + LOCK_TIMEOUT_MS);
  try {
    let existing = '';
    try {
      existing = readFileSync(logPath, 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const prior = existing
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line));
    const record = { seq: prior.length + 1, operation, input, at: new Date().toISOString() };
    appendFileSync(logPath, `${JSON.stringify(record)}\n`);
    return prior;
  } catch (error) {
    if (error instanceof StubError) throw error;
    throw traceUnavailable(`the trace at ${logPath} failed: ${error.message}`);
  } finally {
    try {
      rmSync(lockPath, { recursive: true, force: true });
    } catch {
      // a lock left behind is broken by age like any other
    }
  }
}

// --- fixture and dispatch -------------------------------------------------------------------

export function sessionPaths(env = process.env, scriptDir = import.meta.dirname) {
  const sandboxRoot = resolve(scriptDir, '..', '..');
  return {
    fixture: env.EVAL_SESSION_FIXTURE ?? resolve(sandboxRoot, 'fixture.json'),
    log: env.EVAL_SESSION_LOG ?? resolve(sandboxRoot, 'trace', 'session-calls.jsonl'),
  };
}

export function loadSessionFixture(fixturePath) {
  let fixture;
  try {
    fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  } catch (error) {
    throw fixtureInvalid(`fixture ${fixturePath} cannot be read: ${error.message}`);
  }
  const session = fixture?.session;
  if (!isPlainObject(session)) {
    throw fixtureInvalid(`fixture ${fixturePath} has no top-level session object`);
  }
  const unknown = Object.keys(session).filter((key) => !SESSION_KEYS.includes(key));
  if (unknown.length > 0) {
    throw fixtureInvalid(
      `fixture session carries ${unknown.join(', ')}; it defines only ${SESSION_KEYS.join(', ')}`,
    );
  }
  return session;
}

export function runOperation(session, operation, input, priorRecords) {
  const state = traceState(priorRecords, operation, session);
  switch (operation) {
    case 'thread-read':
      return readThread(session, input);
    case 'list-agents':
      return listAgentsResult(session, input, state.position);
    case 'send-message':
      return sendMessageResult(session, input, state.position);
    case 'await-reply':
      return awaitReplyResult(session, input, state);
    default:
      throw undefinedOperation(operation);
  }
}

function undefinedOperation(operation) {
  return new StubError(CODES.undefinedInFixture, `operation "${operation}" is not defined`, {
    operation,
    definedOperations: [...SESSION_OPERATIONS],
  });
}

async function readStdin(stream) {
  let input = '';
  stream.setEncoding('utf8');
  for await (const chunk of stream) input += chunk;
  if (input.trim() === '') return {};
  const parsed = JSON.parse(input);
  if (!isPlainObject(parsed)) throw new TypeError('stdin JSON must be an object');
  return parsed;
}

function writeEnvelope(stdout, envelope) {
  return new Promise((resolveWrite, rejectWrite) => {
    stdout.write(`${JSON.stringify(envelope)}\n`, (error) =>
      error ? rejectWrite(error) : resolveWrite(),
    );
  });
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const paths = io.paths ?? sessionPaths(io.env ?? process.env);
  const parsed = parseSessionArgv(argv);
  const first = argv[0];
  const operation =
    parsed.operation ??
    (typeof first === 'string' && first !== '' && !first.startsWith('-') ? first : null);
  let envelope;
  try {
    if (parsed.refusal !== undefined) throw invalidInput(parsed.refusal);
    let input;
    try {
      input = io.input ?? (await readStdin(io.stdin ?? process.stdin));
    } catch (error) {
      throw invalidInput(`stdin must hold one JSON object: ${error.message}`);
    }
    const prior = recordCall(paths.log, operation, input);
    if (!SESSION_OPERATIONS.includes(operation)) throw undefinedOperation(operation);
    const session = loadSessionFixture(paths.fixture);
    envelope = okEnvelope(operation, runOperation(session, operation, input, prior));
  } catch (error) {
    envelope =
      error instanceof StubError
        ? errorEnvelope(operation, error.code, error.message, error.details)
        : errorEnvelope(operation, CODES.internalError, error?.message ?? 'unexpected failure');
  }
  await writeEnvelope(stdout, envelope);
  if (!envelope.ok) {
    if (io.setExitCode) io.setExitCode(1);
    else process.exitCode = 1;
  }
  return envelope;
}

// Guarded so tests can import the pure helpers without the module reading standard input.
if (process.env.EVAL_SESSION_NO_MAIN !== '1') await main();
