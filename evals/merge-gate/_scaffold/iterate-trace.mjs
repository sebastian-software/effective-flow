#!/usr/bin/env node

// Deterministic receiver for the configured-reviewer merge-gate eval. It validates the caller's
// real handoff at the protocol boundary, records one bounded JSONL entry, and emits one controlled
// `deferred` outcome per caller-minted identifier. Reviewer text is hashed, never executed or
// copied into the trace or response.

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import process from 'node:process';

const SCHEMA = 'effective-flow/merge-gate-iterate-echo/v1';
const DELIMITER = '--- caller-supplied item text follows ---';
const MAX_INPUT_BYTES = 64 * 1024;
const MAX_TRACE_BYTES = 64 * 1024;
const MAX_RECORD_BYTES = 16 * 1024;
const MAX_RECORDS = 4;
const MAX_ITEMS = 8;
const LOCK_WAIT_MS = 2000;
const LOCK_STALE_MS = 5000;
const LOCK_POLL_MS = 5;

const skillRoot = resolve(import.meta.dirname, '..');
const sandboxRoot = resolve(skillRoot, '..');
const expectedProjectRoot = resolve(sandboxRoot, 'project');
const tracePath = resolve(sandboxRoot, 'trace', 'iterate-calls.jsonl');
const lockPath = `${tracePath}.lock`;

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function digest(content) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function canonical(path) {
  return existsSync(path) ? realpathSync(path) : resolve(path);
}

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function acquireLock() {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      mkdirSync(lockPath);
      return;
    } catch {
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) {
          rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() >= deadline) fail(`iterate trace lock unavailable at ${lockPath}`);
      sleepSync(LOCK_POLL_MS);
    }
  }
}

async function readInput() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > MAX_INPUT_BYTES) {
      fail(`iterate handoff exceeds ${MAX_INPUT_BYTES} bytes`);
    }
  }
  if (input.trim() === '') fail('iterate handoff is empty');
  return input.replace(/\r\n/g, '\n').replace(/\n$/, '');
}

function oneLine(lines, prefix) {
  const matches = lines.filter((line) => line.startsWith(prefix));
  if (matches.length !== 1) fail(`iterate handoff must contain exactly one ${prefix} line`);
  return matches[0];
}

function parseHandoff(message) {
  const lines = message.split('\n');
  const delimiterPositions = lines
    .map((line, index) => (line.trim() === DELIMITER ? index : -1))
    .filter((index) => index >= 0);
  if (delimiterPositions.length !== 1) {
    fail(`iterate handoff must contain exactly one ${DELIMITER} delimiter`);
  }
  const delimiterAt = delimiterPositions[0];
  const header = lines.slice(0, delimiterAt).map((line) => line.trim());
  const body = lines.slice(delimiterAt + 1).join('\n');

  const itemFilterLine = oneLine(header, 'Item filter: ');
  const summaryLine = oneLine(header, 'Summary comment: ');
  const nextStepsLine = oneLine(header, 'Next steps: ');
  const reviewGuardLine = oneLine(header, 'Review guard: ');
  const boundaryLine = oneLine(header, 'Boundary token: ');

  if (summaryLine !== 'Summary comment: suppressed') fail('summary comment is not suppressed');
  if (nextStepsLine !== 'Next steps: suppressed') fail('next steps are not suppressed');
  if (reviewGuardLine !== 'Review guard: established') fail('review guard is not established');

  const boundaryToken = boundaryLine.slice('Boundary token: '.length);
  if (!/^[A-Z0-9]{32,}$/.test(boundaryToken)) fail('boundary token is not a minted channel token');

  const filter = itemFilterLine.slice('Item filter: '.length);
  const filterMatch = filter.match(/^threads=([^,\s]+)$/);
  if (!filterMatch) fail('configured-reviewer echo requires exactly one filtered thread');
  const filteredThread = filterMatch[1];

  const items = [];
  for (const line of header) {
    let match = line.match(/^Thread item: ([A-Z0-9]{32,}) \| thread=([^|\s]+)$/);
    if (match) {
      items.push({ identifier: match[1], kind: 'thread', threadId: match[2] });
      continue;
    }
    match = line.match(/^Item: ([A-Z0-9]{32,}) \| review=([^|]+) \| author=([^|]+) \| url=(\S+)$/);
    if (match) {
      items.push({
        identifier: match[1],
        kind: 'review-body',
        reviewId: match[2].trim(),
        author: match[3].trim(),
        url: match[4],
      });
    }
  }
  if (items.length !== 2 || items.length > MAX_ITEMS) {
    fail(`configured-reviewer echo requires exactly two manifest items, received ${items.length}`);
  }
  const identifiers = items.map((item) => item.identifier);
  if (new Set(identifiers).size !== identifiers.length) fail('manifest identifiers are duplicated');

  const threadItems = items.filter((item) => item.kind === 'thread');
  const reviewItems = items.filter((item) => item.kind === 'review-body');
  if (threadItems.length !== 1 || reviewItems.length !== 1) {
    fail('configured-reviewer echo requires one thread item and one review-body item');
  }
  if (threadItems[0].threadId !== filteredThread) {
    fail('thread manifest attribution does not match the item filter');
  }
  if (!/^recensor(?:\[bot\])?$/.test(reviewItems[0].author)) {
    fail('review-body item is not attributed to recensor');
  }

  const spans = body === '' ? [] : body.split(`\n${boundaryToken}\n`);
  if (spans.length !== reviewItems.length || spans.some((span) => span.trim() === '')) {
    fail('manifest and body span counts do not match');
  }

  return {
    itemFilter: filter,
    controls: { summaryComment: 'suppressed', nextSteps: 'suppressed', reviewGuard: 'established' },
    items,
    body: {
      spans: spans.length,
      bytes: Buffer.byteLength(body),
      digest: digest(body),
    },
  };
}

function readTrace() {
  if (!existsSync(tracePath)) return [];
  const raw = readFileSync(tracePath, 'utf8');
  if (Buffer.byteLength(raw) > MAX_TRACE_BYTES) {
    throw new Error('iterate trace already exceeds its byte bound');
  }
  const lines = raw.split('\n').filter((line) => line.trim() !== '');
  if (lines.length > MAX_RECORDS) throw new Error('iterate trace already exceeds its record bound');
  return lines.map((line, index) => {
    try {
      const record = JSON.parse(line);
      if (record.schema !== SCHEMA || record.seq !== index + 1)
        throw new Error('schema or sequence');
      return record;
    } catch (error) {
      throw new Error(`iterate trace line ${index + 1} is invalid: ${error.message}`);
    }
  });
}

function appendTrace(record) {
  mkdirSync(dirname(tracePath), { recursive: true });
  acquireLock();
  let temporary = null;
  try {
    const existing = readTrace();
    if (existing.length >= MAX_RECORDS) {
      throw new Error(`iterate trace permits at most ${MAX_RECORDS} records`);
    }
    const next = { ...record, seq: existing.length + 1 };
    const line = JSON.stringify(next);
    if (Buffer.byteLength(line) > MAX_RECORD_BYTES) {
      throw new Error('iterate trace record exceeds its byte bound');
    }
    const content = `${existing.map((entry) => JSON.stringify(entry)).join('\n')}${
      existing.length === 0 ? '' : '\n'
    }${line}\n`;
    if (Buffer.byteLength(content) > MAX_TRACE_BYTES) {
      throw new Error('iterate trace exceeds its byte bound');
    }
    temporary = resolve(dirname(tracePath), `.${basename(tracePath)}.${process.pid}.tmp`);
    writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    renameSync(temporary, tracePath);
    temporary = null;
  } finally {
    if (temporary !== null) rmSync(temporary, { force: true });
    rmSync(lockPath, { recursive: true, force: true });
  }
}

const pullRequest = process.argv[2];
if (!/^\d+$/.test(pullRequest ?? '')) fail('usage: iterate-trace.mjs <pull-request-number>');
if (canonical(process.cwd()) !== canonical(expectedProjectRoot)) {
  fail(`iterate echo must run from ${expectedProjectRoot}; received ${process.cwd()}`);
}

const handoff = parseHandoff(await readInput());
const outcomes = handoff.items.map(({ identifier }) => ({ identifier, outcome: 'deferred' }));
try {
  appendTrace({
    schema: SCHEMA,
    cwd: canonical(process.cwd()),
    pullRequest: Number(pullRequest),
    itemFilter: handoff.itemFilter,
    controls: handoff.controls,
    items: handoff.items,
    body: handoff.body,
    outcomes,
  });
} catch (error) {
  fail(error?.message ?? 'iterate trace write failed');
}

process.stdout.write(
  [
    'Returned outcome record:',
    ...outcomes.map(({ identifier, outcome }) => `- ${identifier}: ${outcome}`),
    '',
    'Suppressed summary:',
    `${outcomes.length} configured-reviewer items were deferred for the caller-owned decision.`,
    '',
  ].join('\n'),
);
