#!/usr/bin/env node

// Deterministic receiver for the merge-gate evals that replace `iterate`. It validates the caller's
// real handoff at the protocol boundary, records one bounded JSONL entry, and emits one controlled
// outcome per caller-minted identifier. Reviewer text is hashed, never executed or copied into the
// trace or response.
//
// It has two modes, chosen by the slot's fixture and nothing else:
//
//   * **Configured-reviewer mode** — the fixture states no `originHeads`. Exactly one thread item and
//     one review-body item, both returned `deferred`, under schema
//     `effective-flow/merge-gate-iterate-echo/v1`. This is the mode the configured-reviewer scenario
//     has always run, unchanged.
//   * **Repair mode** — the fixture states `originHeads` (see "Origin-head mode" in the shared
//     stub), and the slot has the real-commit `origin` of `repair-origin.mjs` beside it. The n-th
//     delegation lands the n-th seeded repair: it moves `refs/heads/<head>` and `refs/pull/<N>/head`
//     in that `origin` to the seeded commit — or, where the gate's own base merge moved the head
//     after seeding, to a commit with the same change, message, author, committer and dates on top
//     of the current head — labels the new head, moves `develop` where the plan says the base moves
//     during this delegation, and returns the commit under the first thread item's identifier with
//     `implemented`, in the return format of `shared/delegated-scope-return.md`. A delegation the
//     plan does not hold lands nothing and returns `deferred`. Records use schema
//     `effective-flow/merge-gate-repair-trace/v1` with `kind: dispatch`.
//
// In repair mode the same file is also the bare `origin`'s `post-receive` hook (`--receive`): every
// push the gate makes is recorded with `kind: push`, `refs/pull/<N>/head` follows the head branch as
// a forge keeps it, and a base merge onto the latest head is labelled as the gate-merge head the
// fixture declares next. The call log cannot show a push; this record is how the evaluator sees it.

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
import { execFileSync } from 'node:child_process';
import { devNull } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import process from 'node:process';

const SCHEMA = 'effective-flow/merge-gate-iterate-echo/v1';
const REPAIR_SCHEMA = 'effective-flow/merge-gate-repair-trace/v1';
const MAX_REPAIR_RECORDS = 8;
const ZERO_SHA = '0'.repeat(40);
const HEAD_REF_PREFIX = 'refs/eval/head/';
const BASE_BRANCH = 'develop';
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
const fixturePath = resolve(sandboxRoot, 'fixture.json');
const remotePath = resolve(sandboxRoot, 'remote.git');

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

function readTrace(schema, maxRecords) {
  if (!existsSync(tracePath)) return [];
  const raw = readFileSync(tracePath, 'utf8');
  if (Buffer.byteLength(raw) > MAX_TRACE_BYTES) {
    throw new Error('iterate trace already exceeds its byte bound');
  }
  const lines = raw.split('\n').filter((line) => line.trim() !== '');
  if (lines.length > maxRecords) throw new Error('iterate trace already exceeds its record bound');
  return lines.map((line, index) => {
    try {
      const record = JSON.parse(line);
      if (record.schema !== schema || record.seq !== index + 1)
        throw new Error('schema or sequence');
      return record;
    } catch (error) {
      throw new Error(`iterate trace line ${index + 1} is invalid: ${error.message}`);
    }
  });
}

// Runs `produce(existing)` under the trace lock and appends the records it returns. The repair modes
// make their git moves inside `produce`, so a delegation and a push are recorded in the order they
// happened and never interleave.
function appendTraceRecords(schema, maxRecords, produce) {
  mkdirSync(dirname(tracePath), { recursive: true });
  acquireLock();
  let temporary = null;
  try {
    const existing = readTrace(schema, maxRecords);
    const produced = produce(existing);
    if (existing.length + produced.length > maxRecords) {
      throw new Error(`iterate trace permits at most ${maxRecords} records`);
    }
    const next = produced.map((record, index) => ({
      ...record,
      seq: existing.length + index + 1,
    }));
    for (const record of next) {
      if (Buffer.byteLength(JSON.stringify(record)) > MAX_RECORD_BYTES) {
        throw new Error('iterate trace record exceeds its byte bound');
      }
    }
    const content = [...existing, ...next].map((entry) => `${JSON.stringify(entry)}\n`).join('');
    if (Buffer.byteLength(content) > MAX_TRACE_BYTES) {
      throw new Error('iterate trace exceeds its byte bound');
    }
    temporary = resolve(dirname(tracePath), `.${basename(tracePath)}.${process.pid}.tmp`);
    writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    renameSync(temporary, tracePath);
    temporary = null;
    return next;
  } finally {
    if (temporary !== null) rmSync(temporary, { force: true });
    rmSync(lockPath, { recursive: true, force: true });
  }
}

function appendTrace(record) {
  appendTraceRecords(SCHEMA, MAX_RECORDS, (existing) => {
    if (existing.length >= MAX_RECORDS) {
      throw new Error(`iterate trace permits at most ${MAX_RECORDS} records`);
    }
    return [record];
  });
}

// ---------------------------------------------------------------------------------------------
// Repair mode

function readFixture() {
  if (!existsSync(fixturePath)) return null;
  try {
    return JSON.parse(readFileSync(fixturePath, 'utf8'));
  } catch (error) {
    fail(`the slot fixture is unreadable: ${error.message}`);
  }
  return null;
}

// Every git command of the repair modes runs against the bare `origin` only, without the operator's
// configuration and without any `GIT_*` variable the caller or `receive-pack` set.
function originEnv(extra = {}) {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    ...extra,
  };
}

function originGit(args, extra = {}) {
  return execFileSync('git', ['--git-dir', remotePath, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: originEnv(extra),
  }).trim();
}

function optionalRef(ref) {
  try {
    return originGit(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  } catch {
    return null;
  }
}

function parents(sha) {
  return originGit(['rev-list', '--parents', '-n', '1', sha]).split(' ').slice(1);
}

function labelledHeads() {
  const labelled = new Map();
  const listing = originGit(['for-each-ref', '--format=%(refname) %(objectname)', HEAD_REF_PREFIX]);
  for (const line of listing.split('\n').filter(Boolean)) {
    const [ref, sha] = line.split(' ');
    labelled.set(ref.slice(HEAD_REF_PREFIX.length), sha);
  }
  return labelled;
}

function labelOf(heads, labelled, sha) {
  return heads.find((head) => labelled.get(head.label) === sha)?.label ?? null;
}

// The declared head that comes next, and the labelled one right before it.
function nextHead(heads, labelled) {
  const index = heads.findIndex((head) => !labelled.has(head.label));
  if (index < 0) return { next: null, previous: null };
  return { next: heads[index], previous: index > 0 ? heads[index - 1] : null };
}

// The seeded repair's change, made again on `onto`: the same paths with the seeded blobs, the same
// message, and the seeded author, committer and dates.
function replayRepair(seeded, onto) {
  const [
    authorName,
    authorEmail,
    authorDate,
    committerName,
    committerEmail,
    committerDate,
    message,
  ] = originGit([
    'log',
    '-1',
    '--format=%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI%x00%B',
    seeded,
  ]).split('\0');
  const index = resolve(sandboxRoot, `.repair-${process.pid}.index`);
  const indexEnv = { GIT_INDEX_FILE: index };
  try {
    originGit(['read-tree', onto], indexEnv);
    const changes = originGit(['diff-tree', '--no-commit-id', '-r', '--no-renames', '-z', seeded])
      .split('\0')
      .filter(Boolean);
    for (let at = 0; at < changes.length; at += 2) {
      const [, , , blob, status] = changes[at].replace(/^:/, '').split(' ');
      const path = changes[at + 1];
      if (status === 'D') originGit(['update-index', '--force-remove', '--', path], indexEnv);
      else originGit(['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`], indexEnv);
    }
    const tree = originGit(['write-tree'], indexEnv);
    return originGit(['commit-tree', tree, '-p', onto, '-m', message.trimEnd()], {
      GIT_AUTHOR_NAME: authorName,
      GIT_AUTHOR_EMAIL: authorEmail,
      GIT_AUTHOR_DATE: authorDate,
      GIT_COMMITTER_NAME: committerName,
      GIT_COMMITTER_EMAIL: committerEmail,
      GIT_COMMITTER_DATE: committerDate,
    });
  } finally {
    rmSync(index, { force: true });
  }
}

function parseItems(header) {
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
  return items;
}

// The scope line as the trace keeps it: whether it parsed, its paths, and which seeded or labelled
// state its two SHAs name. The SHAs themselves are run-specific and stay out of the record.
function parseScope(header, heads, labelled, seedBase) {
  const lines = header.filter((line) => line.startsWith('Authorized scope: '));
  if (lines.length === 0) return null;
  try {
    if (lines.length !== 1) throw new Error('repeated');
    const value = JSON.parse(lines[0].slice('Authorized scope: '.length));
    const { mergeBase, head, paths } = value.scope;
    if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string')) {
      throw new Error('paths');
    }
    return {
      valid: true,
      paths,
      head: labelOf(heads, labelled, head),
      mergeBase: mergeBase === seedBase ? 'seed-base' : null,
    };
  } catch {
    return { valid: false, paths: [], head: null, mergeBase: null };
  }
}

function parseRepairHandoff(message) {
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

  const filter = oneLine(header, 'Item filter: ').slice('Item filter: '.length);
  const summaryLine = oneLine(header, 'Summary comment: ');
  const nextStepsLine = oneLine(header, 'Next steps: ');
  const reviewGuardLine = oneLine(header, 'Review guard: ');
  const boundaryToken = oneLine(header, 'Boundary token: ').slice('Boundary token: '.length);
  if (summaryLine !== 'Summary comment: suppressed') fail('summary comment is not suppressed');
  if (nextStepsLine !== 'Next steps: suppressed') fail('next steps are not suppressed');
  if (reviewGuardLine !== 'Review guard: established') fail('review guard is not established');
  if (!/^[A-Z0-9]{32,}$/.test(boundaryToken)) fail('boundary token is not a minted channel token');
  const filterMatch = filter.match(/^threads=([^\s]+)$/);
  if (!filterMatch) fail('the repair echo requires a thread item filter');
  const filtered = filterMatch[1].split(',');

  const items = parseItems(header);
  if (items.length === 0 || items.length > MAX_ITEMS) {
    fail(`the repair echo requires one to ${MAX_ITEMS} manifest items, received ${items.length}`);
  }
  const identifiers = items.map((item) => item.identifier);
  if (new Set(identifiers).size !== identifiers.length) fail('manifest identifiers are duplicated');
  const threadItems = items.filter((item) => item.kind === 'thread');
  if (threadItems.length === 0) fail('the repair echo requires at least one thread item');
  if (threadItems.some((item) => !filtered.includes(item.threadId))) {
    fail('thread manifest attribution does not match the item filter');
  }
  const reviewItems = items.filter((item) => item.kind === 'review-body');
  const spans = body === '' ? [] : body.split(`\n${boundaryToken}\n`);
  if (spans.length !== reviewItems.length || spans.some((span) => span.trim() === '')) {
    fail('manifest and body span counts do not match');
  }
  return {
    header,
    itemFilter: filter,
    controls: { summaryComment: 'suppressed', nextSteps: 'suppressed', reviewGuard: 'established' },
    items,
    body: { spans: spans.length, bytes: Buffer.byteLength(body), digest: digest(body) },
  };
}

function repairDispatch(fixture, pullRequest, message) {
  const { branch, heads } = fixture.originHeads;
  const handoff = parseRepairHandoff(message);
  let outcome;
  try {
    appendTraceRecords(REPAIR_SCHEMA, MAX_REPAIR_RECORDS, (existing) => {
      const dispatch = existing.filter((record) => record.kind === 'dispatch').length + 1;
      const labelled = labelledHeads();
      const current = originGit(['rev-parse', '--verify', `refs/heads/${branch}^{commit}`]);
      const seedBase = parents(labelled.get(heads[0].label))[0];
      const scope = parseScope(handoff.header, heads, labelled, seedBase);
      const headBefore = labelOf(heads, labelled, current);
      const seeded = optionalRef(`refs/eval/dispatch/${dispatch}`);
      const { next } = nextHead(heads, labelled);
      const planned = seeded !== null && next?.source === 'dispatch';
      let headAfter = headBefore;
      let baseAdvanced = false;
      let target = null;
      if (planned) {
        const base = optionalRef(`refs/eval/base/${dispatch}`);
        if (base !== null) {
          originGit(['update-ref', `refs/heads/${BASE_BRANCH}`, base, parents(base)[0]]);
          baseAdvanced = true;
        }
        target = parents(seeded)[0] === current ? seeded : replayRepair(seeded, current);
        originGit(['update-ref', `refs/heads/${branch}`, target, current]);
        originGit(['update-ref', `refs/pull/${pullRequest}/head`, target]);
        originGit(['update-ref', `${HEAD_REF_PREFIX}${next.label}`, target]);
        headAfter = next.label;
      }
      const repaired = planned
        ? handoff.items.find((item) => item.kind === 'thread').identifier
        : null;
      const outcomes = handoff.items.map(({ identifier }) => ({
        identifier,
        outcome: identifier === repaired ? 'implemented' : 'deferred',
      }));
      outcome = {
        outcomes,
        returned: repaired === null ? [] : [{ identifier: repaired, shas: [target] }],
      };
      return [
        {
          schema: REPAIR_SCHEMA,
          kind: 'dispatch',
          at: new Date().toISOString(),
          cwd: canonical(process.cwd()),
          pullRequest: Number(pullRequest),
          itemFilter: handoff.itemFilter,
          controls: handoff.controls,
          items: handoff.items,
          scope,
          body: handoff.body,
          planned,
          headBefore,
          headAfter,
          baseAdvanced,
          outcomes,
        },
      ];
    });
  } catch (error) {
    fail(error?.message ?? 'iterate trace write failed');
  }
  const implemented = outcome.outcomes.filter((entry) => entry.outcome === 'implemented').length;
  process.stdout.write(
    [
      `Returned commits: ${JSON.stringify(outcome.returned)}`,
      'Scope expansion: []',
      '',
      'Returned outcome record:',
      ...outcome.outcomes.map(({ identifier, outcome: value }) => `- ${identifier}: ${value}`),
      '',
      'Suppressed summary:',
      `${implemented} configured-reviewer item(s) were implemented as one commit each on the pull-request head; ${
        outcome.outcomes.length - implemented
      } were deferred for the caller-owned decision.`,
      '',
      'DONE',
      '',
    ].join('\n'),
  );
}

// The `post-receive` hook: one record per pushed ref, the pull ref moved with the head branch, and a
// base merge onto the latest head labelled as the next declared gate-merge head.
async function receive(fixture) {
  if (canonical(process.cwd()) !== canonical(remotePath)) {
    fail(`the receive hook must run in ${remotePath}; received ${process.cwd()}`);
  }
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  const updates = input
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => line.trim().split(/\s+/));
  if (!fixture?.originHeads) fail('the receive hook runs only in a repair slot');
  const { branch, heads } = fixture.originHeads;
  try {
    appendTraceRecords(REPAIR_SCHEMA, MAX_REPAIR_RECORDS, () =>
      updates.map(([, after, ref]) => {
        const record = {
          schema: REPAIR_SCHEMA,
          kind: 'push',
          at: new Date().toISOString(),
          cwd: canonical(process.cwd()),
          ref,
          merge: false,
          firstParent: null,
          secondParentIsBase: false,
          label: null,
        };
        if (after === ZERO_SHA) return record;
        const labelled = labelledHeads();
        const commitParents = parents(after);
        record.merge = commitParents.length === 2;
        record.firstParent = labelOf(heads, labelled, commitParents[0]);
        record.secondParentIsBase =
          commitParents.length === 2 &&
          commitParents[1] === optionalRef(`refs/heads/${BASE_BRANCH}`);
        if (ref !== `refs/heads/${branch}`) return record;
        originGit(['update-ref', `refs/pull/${fixture.pullRequest}/head`, after]);
        const { next, previous } = nextHead(heads, labelled);
        if (
          next?.source === 'gate-merge' &&
          record.secondParentIsBase &&
          previous !== null &&
          labelled.get(previous.label) === commitParents[0]
        ) {
          originGit(['update-ref', `${HEAD_REF_PREFIX}${next.label}`, after]);
          record.label = next.label;
        }
        return record;
      }),
    );
  } catch (error) {
    fail(error?.message ?? 'iterate trace write failed');
  }
}

// ---------------------------------------------------------------------------------------------
// Entry

function configuredReviewerDispatch(pullRequest, message) {
  const handoff = parseHandoff(message);
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
      // A delegated `iterate` return ends with its completion keyword; the gate resumes a
      // keyword-less return once and then treats it as a whole-run `ABORT`.
      'DONE',
      '',
    ].join('\n'),
  );
}

const fixture = readFixture();
if (process.argv[2] === '--receive' && process.argv.length === 3) {
  await receive(fixture);
} else {
  const pullRequest = process.argv[2];
  if (!/^\d+$/.test(pullRequest ?? '')) fail('usage: iterate-trace.mjs <pull-request-number>');
  if (canonical(process.cwd()) !== canonical(expectedProjectRoot)) {
    fail(`iterate echo must run from ${expectedProjectRoot}; received ${process.cwd()}`);
  }
  const message = await readInput();
  if (fixture?.originHeads) repairDispatch(fixture, pullRequest, message);
  else configuredReviewerDispatch(pullRequest, message);
}
