import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  assertThreadId,
  assertTitle,
  buildRenameFrames,
  buildRequestDocument,
  ERROR_CODES,
  errorEnvelope,
  executeOperation,
  finalizeHookReceipt,
  HOOK_OUTCOMES,
  HOOK_RECEIPT_MAX_AGE_MS,
  hookReceiptPath,
  INITIALIZE_REQUEST_ID,
  isFreshRequest,
  LIVENESS_REASONS,
  OPERATIONS,
  probeHookLiveness,
  readHookReceipt,
  REQUEST_MAX_AGE_MS,
  renameThread,
  requestFilePath,
  scanHookConfiguration,
  SessionTitleError,
  SET_NAME_REQUEST_ID,
  SKIP_REASONS,
  TITLE_MAX_LENGTH,
  writeHookReceipt,
  writeRequestFile,
} from '../src/scripts/session-title-core.mjs';

const repositoryRoot = new URL('..', import.meta.url);

function tempWorkspace(t) {
  const dir = mkdtempSync(join(tmpdir(), 'effective-flow-session-title-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// The two entry points that survive the build; a stray third would ship dead code and a missing
// one would silently drop a documented error code from every caller.
test('the module exposes exactly the documented operations and error codes', () => {
  assert.deepEqual(OPERATIONS, ['request', 'apply']);
  assert.deepEqual(ERROR_CODES, [
    'INVALID_PAYLOAD',
    'NO_THREAD_ID',
    'SANDBOX_DENIED',
    'CLI_MISSING',
    'COMMAND_FAILED',
  ]);
  assert.deepEqual(SKIP_REASONS, [
    'no-request',
    'thread-mismatch',
    'expired-request',
    'unusable-request',
  ]);
  assert.deepEqual(LIVENESS_REASONS, [
    'no-hook',
    'untrusted',
    'managed-hooks-only',
    'hook-failed',
    'hook-stale',
    'undeterminable',
  ]);
  assert.deepEqual(HOOK_OUTCOMES, ['started', 'applied', 'skipped', 'unapplied', 'failed']);
});

// ---------------------------------------------------------------------------------------------
// Title validation (rule 5): opaque text, rejected rather than reshaped.
// ---------------------------------------------------------------------------------------------

test('assertTitle rejects a newline, a control character, and an over-length title without reshaping it', () => {
  assert.throws(
    () => assertTitle('Line one\nLine two'),
    (error) => error instanceof SessionTitleError && error.code === 'INVALID_PAYLOAD',
  );
  assert.throws(
    () => assertTitle(`Bell${String.fromCharCode(7)}sound`),
    (error) => error.code === 'INVALID_PAYLOAD',
  );
  const tooLong = 'x'.repeat(TITLE_MAX_LENGTH + 1);
  assert.throws(
    () => assertTitle(tooLong),
    (error) => error.code === 'INVALID_PAYLOAD' && error.details.length === TITLE_MAX_LENGTH + 1,
  );
  // The wording rule's exact bound is accepted, so the test proves rejection is length-based and
  // not an off-by-one accident.
  assert.equal(assertTitle('x'.repeat(TITLE_MAX_LENGTH)).length, TITLE_MAX_LENGTH);
});

test('assertThreadId refuses whitespace and empty identifiers without guessing at Codex grammar', () => {
  assert.throws(
    () => assertThreadId('', 'CODEX_THREAD_ID', 'NO_THREAD_ID'),
    (error) => error.code === 'NO_THREAD_ID',
  );
  assert.throws(
    () => assertThreadId('has spaces', 'threadId'),
    (error) => error.code === 'INVALID_PAYLOAD',
  );
  assert.equal(assertThreadId('thread-abc123', 'threadId'), 'thread-abc123');
});

test('isFreshRequest accepts only a timestamp between now and the request-max-age bound', () => {
  const now = Date.now();
  assert.equal(isFreshRequest(now, now), true);
  assert.equal(isFreshRequest(now - REQUEST_MAX_AGE_MS, now), true);
  assert.equal(isFreshRequest(now - REQUEST_MAX_AGE_MS - 1, now), false);
  assert.equal(isFreshRequest(now + 1, now), false);
});

// ---------------------------------------------------------------------------------------------
// Request-file contract, rules 1-4, exercised through the `apply` operation end to end.
// ---------------------------------------------------------------------------------------------

test('rule 1: a request whose file threadId differs from the hook payload session_id is refused, and the RPC uses the payload id', async (t) => {
  const dir = tempWorkspace(t);
  const path = requestFilePath(dir);
  writeRequestFile(
    path,
    buildRequestDocument({ threadId: 'thread-from-file', title: 'Title', now: Date.now() }),
  );

  const mismatch = await executeOperation(
    'apply',
    { session_id: 'thread-from-hook', cwd: dir },
    {},
  );
  assert.equal(mismatch.ok, true);
  assert.equal(mismatch.data.applied, false);
  assert.equal(mismatch.data.reason, 'thread-mismatch');

  // A matching request is applied with the hook payload's id, not merely with the file's own
  // recorded value, which the RPC frame below makes observable.
  const path2 = requestFilePath(dir);
  writeRequestFile(
    path2,
    buildRequestDocument({ threadId: 'thread-1', title: 'Applied title', now: Date.now() }),
  );
  let capturedThreadId;
  const runner = async () => ({
    send(frame) {
      if (frame.method === 'thread/name/set') capturedThreadId = frame.params.threadId;
    },
    waitFor: async (id) =>
      id === INITIALIZE_REQUEST_ID
        ? { jsonrpc: '2.0', id, result: {} }
        : { jsonrpc: '2.0', id, result: { ok: true } },
    close: async () => ({ status: 0, signal: null, stderr: '', error: null }),
  });
  const applied = await executeOperation('apply', { session_id: 'thread-1', cwd: dir }, { runner });
  assert.equal(applied.ok, true);
  assert.equal(applied.data.applied, true);
  assert.equal(applied.data.threadId, 'thread-1');
  assert.equal(capturedThreadId, 'thread-1');
});

test('rule 2: a requestedAt older than the bound or in the future is refused', async (t) => {
  const dir = tempWorkspace(t);

  const old = Date.now() - REQUEST_MAX_AGE_MS - 60_000;
  writeRequestFile(requestFilePath(dir), {
    threadId: 'thread-1',
    title: 'Title',
    requestedAt: new Date(old).toISOString(),
  });
  const expired = await executeOperation('apply', { session_id: 'thread-1', cwd: dir }, {});
  assert.equal(expired.ok, true);
  assert.equal(expired.data.applied, false);
  assert.equal(expired.data.reason, 'expired-request');

  const future = Date.now() + 60_000;
  writeRequestFile(requestFilePath(dir), {
    threadId: 'thread-1',
    title: 'Title',
    requestedAt: new Date(future).toISOString(),
  });
  const fromTheFuture = await executeOperation('apply', { session_id: 'thread-1', cwd: dir }, {});
  assert.equal(fromTheFuture.ok, true);
  assert.equal(fromTheFuture.data.applied, false);
  assert.equal(fromTheFuture.data.reason, 'expired-request');
});

test('rule 3: a symlink at the request path is refused without being read', async (t) => {
  const dir = tempWorkspace(t);
  const path = requestFilePath(dir);
  mkdirSync(dirname(path), { recursive: true });
  const target = join(dir, 'elsewhere.json');
  writeFileSync(target, JSON.stringify({ threadId: 'thread-1', title: 'Planted', requestedAt: 1 }));
  symlinkSync(target, path);

  const envelope = await executeOperation('apply', { session_id: 'thread-1', cwd: dir }, {});
  // A refusal, not an error: nothing removes a planted symlink, so a hard failure here would be a
  // `Stop` hook that fails on every turn from now on.
  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.applied, false);
  assert.equal(envelope.data.reason, 'unusable-request');
  assert.equal(envelope.data.detail, 'symlink');
  assert.equal(existsSync(target), true, 'the symlink target must not be consumed');
});

test('rule 3: a non-regular file at the request path is refused', async (t) => {
  const dir = tempWorkspace(t);
  const path = requestFilePath(dir);
  // A directory in place of the request file is a non-regular target reachable without a
  // platform-specific FIFO, and it exercises the same fstat check as the symlink case above.
  mkdirSync(path, { recursive: true });

  const envelope = await executeOperation('apply', { session_id: 'thread-1', cwd: dir }, {});
  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.reason, 'unusable-request');
  assert.equal(envelope.data.detail, 'not-regular');
});

// The regression this pins: an `ok: false` here made a planted path a permanent hook failure,
// because no part of the system ever removes one.
test('a planted request path does not wedge the hook: repeated invocations all report a clean skip', async (t) => {
  const dir = tempWorkspace(t);
  const path = requestFilePath(dir);
  mkdirSync(path, { recursive: true });

  for (let invocation = 1; invocation <= 3; invocation += 1) {
    const envelope = await executeOperation('apply', { session_id: 'thread-1', cwd: dir }, {});
    assert.equal(envelope.ok, true, `invocation ${invocation} must not report a broken hook`);
    assert.equal(envelope.data.reason, 'unusable-request');
    assert.equal(envelope.data.path, path);
  }
  // The writing side keeps the hard error, because that is where a workflow can tell the user.
  const write = await executeOperation(
    'request',
    { cwd: dir, title: 'Title' },
    { env: { CODEX_THREAD_ID: 'thread-1', CODEX_HOME: join(dir, 'missing') } },
  );
  assert.equal(write.ok, false);
  assert.equal(write.error.code, 'INVALID_PAYLOAD');
});

test('a request document past the runtime size bound is refused rather than read', async (t) => {
  const dir = tempWorkspace(t);
  const path = requestFilePath(dir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({ threadId: 'thread-1', title: 'Title', padding: 'x'.repeat(64 * 1024) }),
  );

  const envelope = await executeOperation('apply', { session_id: 'thread-1', cwd: dir }, {});
  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.reason, 'unusable-request');
  assert.equal(envelope.data.detail, 'too-large');
});

test('a symlinked runtime directory is refused before anything below it is read or unlinked', async (t) => {
  const dir = tempWorkspace(t);
  const elsewhere = join(dir, 'elsewhere');
  mkdirSync(elsewhere, { recursive: true });
  const planted = join(elsewhere, 'session-title.json');
  writeFileSync(
    planted,
    JSON.stringify({
      threadId: 'thread-1',
      title: 'Planted',
      requestedAt: new Date().toISOString(),
    }),
  );
  // `O_NOFOLLOW` guards the final component only, so without a directory-level check this read and
  // the unlink that follows it would both land outside the runtime root.
  symlinkSync(elsewhere, join(dir, '.effective-flow'));

  const envelope = await executeOperation(
    'apply',
    { session_id: 'thread-1', cwd: dir },
    {
      runner: () => {
        throw new Error('the RPC must never be reached');
      },
    },
  );
  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.reason, 'unusable-request');
  assert.equal(envelope.data.detail, 'runtime-dir-escape');
  assert.equal(existsSync(planted), true, 'the redirected file must not be unlinked');
});

test('rule 4: the request file is unlinked before the RPC runs, so a crash cannot replay it', async (t) => {
  const dir = tempWorkspace(t);
  const path = requestFilePath(dir);
  writeRequestFile(
    path,
    buildRequestDocument({ threadId: 'thread-1', title: 'Title', now: Date.now() }),
  );
  const crashingRunner = async () => {
    throw new Error('simulated crash before the app-server could be reached');
  };

  const envelope = await executeOperation(
    'apply',
    { session_id: 'thread-1', cwd: dir },
    { runner: crashingRunner },
  );
  assert.equal(envelope.ok, false);
  assert.equal(
    existsSync(path),
    false,
    'the request must already be consumed even though the RPC crashed',
  );
});

test('rule 4: a second hook firing after the request was already applied is a no-op', async (t) => {
  const dir = tempWorkspace(t);
  writeRequestFile(
    requestFilePath(dir),
    buildRequestDocument({ threadId: 'thread-1', title: 'Title', now: Date.now() }),
  );
  const runner = async () => ({
    send() {},
    waitFor: async (id) => ({
      jsonrpc: '2.0',
      id,
      result: id === SET_NAME_REQUEST_ID ? { ok: true } : {},
    }),
    close: async () => ({ status: 0, signal: null, stderr: '', error: null }),
  });
  const first = await executeOperation('apply', { session_id: 'thread-1', cwd: dir }, { runner });
  assert.equal(first.data.applied, true);

  const second = await executeOperation('apply', { session_id: 'thread-1', cwd: dir }, { runner });
  assert.equal(second.ok, true);
  assert.equal(second.data.applied, false);
  assert.equal(second.data.reason, 'no-request');
});

test('rule 5: a title with a newline, a control character, or over 60 characters is rejected rather than sanitized', async (t) => {
  const dir = tempWorkspace(t);
  for (const [label, title] of [
    ['newline', 'Line one\nLine two'],
    ['control character', `Bell${String.fromCharCode(7)}sound`],
    ['over 60 characters', 'x'.repeat(TITLE_MAX_LENGTH + 1)],
  ]) {
    writeRequestFile(requestFilePath(dir), {
      threadId: 'thread-1',
      title,
      requestedAt: new Date().toISOString(),
    });
    const envelope = await executeOperation('apply', { session_id: 'thread-1', cwd: dir }, {});
    assert.equal(envelope.ok, false, `expected a ${label} title to be rejected`);
    assert.equal(envelope.error.code, 'INVALID_PAYLOAD');
    assert.equal(envelope.error.details.field, 'title');
  }
});

// ---------------------------------------------------------------------------------------------
// The three-frame RPC sequence: initialize -> initialized -> thread/name/set, stdin held open
// until the set-name reply arrives.
// ---------------------------------------------------------------------------------------------

test('buildRenameFrames constructs the fixed three-frame sequence with the pinned request ids', () => {
  const [initialize, initialized, setName] = buildRenameFrames({
    threadId: 'thread-1',
    title: 'My title',
  });
  assert.equal(initialize.method, 'initialize');
  assert.equal(initialize.id, INITIALIZE_REQUEST_ID);
  assert.equal(initialized.method, 'initialized');
  assert.equal('id' in initialized, false);
  assert.equal(setName.method, 'thread/name/set');
  assert.equal(setName.id, SET_NAME_REQUEST_ID);
  assert.deepEqual(setName.params, { threadId: 'thread-1', name: 'My title' });
});

test('renameThread sends initialize, then initialized only after its reply, then thread/name/set, and holds the session open until the set-name reply before closing', async () => {
  const order = [];
  let resolveInitialize;
  let resolveSetName;
  const initializeResponse = new Promise((resolve) => {
    resolveInitialize = resolve;
  });
  const setNameResponse = new Promise((resolve) => {
    resolveSetName = resolve;
  });

  const runner = async () => ({
    send(frame) {
      order.push(`sent:${frame.method}`);
      if (frame.method === 'initialize') {
        setTimeout(() => {
          order.push('resolved:initialize');
          resolveInitialize({ jsonrpc: '2.0', id: INITIALIZE_REQUEST_ID, result: {} });
        }, 5);
      }
      if (frame.method === 'thread/name/set') {
        setTimeout(() => {
          order.push('resolved:thread/name/set');
          resolveSetName({ jsonrpc: '2.0', id: SET_NAME_REQUEST_ID, result: { ok: true } });
        }, 5);
      }
    },
    waitFor(id) {
      return id === INITIALIZE_REQUEST_ID ? initializeResponse : setNameResponse;
    },
    async close() {
      order.push('closed');
      return { status: 0, signal: null, stderr: '', error: null };
    },
  });

  const result = await renameThread({
    threadId: 'thread-1',
    title: 'Title',
    cwd: '/workspace',
    runner,
  });
  assert.equal(result.result.ok, true);
  assert.deepEqual(order, [
    'sent:initialize',
    'resolved:initialize',
    'sent:initialized',
    'sent:thread/name/set',
    'resolved:thread/name/set',
    'closed',
  ]);
});

// ---------------------------------------------------------------------------------------------
// Every structured error code.
// ---------------------------------------------------------------------------------------------

test('NO_THREAD_ID: request without CODEX_THREAD_ID and apply without a hook session_id both fail closed', async (t) => {
  const dir = tempWorkspace(t);
  const requestEnvelope = await executeOperation(
    'request',
    { cwd: dir, title: 'Title' },
    { env: {} },
  );
  assert.equal(requestEnvelope.ok, false);
  assert.equal(requestEnvelope.error.code, 'NO_THREAD_ID');

  const applyEnvelope = await executeOperation('apply', { cwd: dir }, {});
  assert.equal(applyEnvelope.ok, false);
  assert.equal(applyEnvelope.error.code, 'NO_THREAD_ID');
});

test('SANDBOX_DENIED: the app-server sqlite failure signature is recognized', async () => {
  const runner = async () => ({
    send() {},
    waitFor: async () => null,
    close: async () => ({
      status: null,
      signal: null,
      stderr: 'failed to initialize sqlite state runtime under ~/.codex',
      error: null,
    }),
  });
  await assert.rejects(
    () => renameThread({ threadId: 'thread-1', title: 'Title', cwd: '/workspace', runner }),
    (error) => error.code === 'SANDBOX_DENIED',
  );
});

test('CLI_MISSING: a spawn failure with ENOENT is reported as codex not being installed', async () => {
  const runner = async () => ({
    send() {},
    waitFor: async () => null,
    close: async () => ({ status: null, signal: null, stderr: '', error: { code: 'ENOENT' } }),
  });
  await assert.rejects(
    () => renameThread({ threadId: 'thread-1', title: 'Title', cwd: '/workspace', runner }),
    (error) => error.code === 'CLI_MISSING',
  );
});

test('COMMAND_FAILED: a closed session with no reply and a rejected RPC frame are both reported', async () => {
  const closedEarlyRunner = async () => ({
    send() {},
    waitFor: async () => null,
    close: async () => ({ status: 1, signal: null, stderr: 'boom', error: null }),
  });
  await assert.rejects(
    () =>
      renameThread({
        threadId: 'thread-1',
        title: 'Title',
        cwd: '/workspace',
        runner: closedEarlyRunner,
      }),
    (error) => error.code === 'COMMAND_FAILED' && error.retryable === true,
  );

  const rejectingRunner = async () => ({
    send() {},
    waitFor: async (id) =>
      id === INITIALIZE_REQUEST_ID
        ? { jsonrpc: '2.0', id, error: { message: 'thread not found' } }
        : null,
    close: async () => ({ status: 0, signal: null, stderr: '', error: null }),
  });
  await assert.rejects(
    () =>
      renameThread({
        threadId: 'thread-1',
        title: 'Title',
        cwd: '/workspace',
        runner: rejectingRunner,
      }),
    (error) => error.code === 'COMMAND_FAILED' && /initialize/.test(error.message),
  );
});

test('INVALID_PAYLOAD: renameThread refuses to run without an injected process runner', async () => {
  await assert.rejects(
    () => renameThread({ threadId: 'thread-1', title: 'Title', cwd: '/workspace' }),
    (error) => error.code === 'INVALID_PAYLOAD',
  );
});

// ---------------------------------------------------------------------------------------------
// Envelope shape: success and failure.
// ---------------------------------------------------------------------------------------------

test('success and failure envelopes carry the stable ok/operation/data(/error) shape', async (t) => {
  const dir = tempWorkspace(t);
  const success = await executeOperation(
    'request',
    { cwd: dir, title: 'Title' },
    { env: { CODEX_THREAD_ID: 'thread-1', CODEX_HOME: join(dir, 'missing-codex-home') } },
  );
  assert.deepEqual(Object.keys(success), ['ok', 'operation', 'data']);
  assert.equal(success.ok, true);
  assert.equal(success.operation, 'request');

  const failure = await executeOperation('request', { cwd: dir, title: 'Title' }, { env: {} });
  assert.deepEqual(Object.keys(failure), ['ok', 'operation', 'data', 'error']);
  assert.equal(failure.ok, false);
  assert.equal(failure.operation, 'request');
  assert.equal(failure.data, null);
  assert.deepEqual(Object.keys(failure.error), ['code', 'message', 'details', 'retryable']);

  const wrapped = errorEnvelope('apply', new Error('unexpected failure'));
  assert.equal(wrapped.error.code, 'COMMAND_FAILED');
});

// ---------------------------------------------------------------------------------------------
// Hook-liveness probe: landed after the plan was written.
// ---------------------------------------------------------------------------------------------

function isolatedCodexHome(dir, name = 'codex-home') {
  return join(dir, name);
}

test('apply writes a hook receipt on every invocation, including one that refuses a foreign or stale request', async (t) => {
  const dir = tempWorkspace(t);
  writeRequestFile(
    requestFilePath(dir),
    buildRequestDocument({ threadId: 'thread-other', title: 'Title', now: Date.now() }),
  );
  const now = Date.now();

  const mismatch = await executeOperation(
    'apply',
    { session_id: 'thread-mine', cwd: dir },
    { now },
  );
  assert.equal(mismatch.data.reason, 'thread-mismatch');
  const receiptAfterMismatch = readHookReceipt(hookReceiptPath(dir));
  assert.notEqual(
    receiptAfterMismatch,
    null,
    'a refused foreign request must still leave a receipt',
  );
  assert.equal(receiptAfterMismatch.appliedAt, now);

  const old = now - REQUEST_MAX_AGE_MS - 60_000;
  writeRequestFile(requestFilePath(dir), {
    threadId: 'thread-mine',
    title: 'Title',
    requestedAt: new Date(old).toISOString(),
  });
  const laterNow = now + 1000;
  const expired = await executeOperation(
    'apply',
    { session_id: 'thread-mine', cwd: dir },
    { now: laterNow },
  );
  assert.equal(expired.data.reason, 'expired-request');
  const receiptAfterExpiry = readHookReceipt(hookReceiptPath(dir));
  assert.equal(receiptAfterExpiry.appliedAt, laterNow);
});

test('a fresh hook receipt reports the rename path as live with an observedAt; an expired one does not', (t) => {
  const dir = tempWorkspace(t);
  mkdirSync(join(dir, '.effective-flow'), { recursive: true });
  const now = Date.now();
  const env = { CODEX_HOME: isolatedCodexHome(dir, 'missing-codex-home') };

  writeHookReceipt(hookReceiptPath(dir), {
    appliedAt: new Date(now).toISOString(),
    threadId: 'thread-1',
    outcome: 'applied',
    code: null,
  });
  const fresh = probeHookLiveness({ cwd: dir, env, now });
  assert.equal(fresh.live, true);
  assert.equal(typeof fresh.observedAt, 'string');

  const expiredAt = now - HOOK_RECEIPT_MAX_AGE_MS - 60_000;
  writeHookReceipt(hookReceiptPath(dir), {
    appliedAt: new Date(expiredAt).toISOString(),
    threadId: 'thread-1',
    outcome: 'applied',
    code: null,
  });
  const expired = probeHookLiveness({ cwd: dir, env, now });
  assert.equal(expired.live, false);
});

test('allow_managed_hooks_only overrides a fresh receipt', (t) => {
  const dir = tempWorkspace(t);
  mkdirSync(join(dir, '.effective-flow'), { recursive: true });
  const now = Date.now();
  writeHookReceipt(hookReceiptPath(dir), {
    appliedAt: new Date(now).toISOString(),
    threadId: 'thread-1',
    outcome: 'applied',
    code: null,
  });
  const codexHome = isolatedCodexHome(dir);
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(join(codexHome, 'config.toml'), 'allow_managed_hooks_only = true\n');

  const result = probeHookLiveness({ cwd: dir, env: { CODEX_HOME: codexHome }, now });
  assert.deepEqual(result, {
    live: false,
    reason: 'managed-hooks-only',
    code: null,
    observedAt: null,
  });
});

test('a complete readable scan that finds no hook overrides a fresh receipt', (t) => {
  const dir = tempWorkspace(t);
  mkdirSync(join(dir, '.effective-flow'), { recursive: true });
  const now = Date.now();
  writeHookReceipt(hookReceiptPath(dir), {
    appliedAt: new Date(now).toISOString(),
    threadId: 'thread-1',
    outcome: 'applied',
    code: null,
  });
  const codexHome = isolatedCodexHome(dir);
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(join(codexHome, 'config.toml'), '# no hooks configured here\n');

  const result = probeHookLiveness({ cwd: dir, env: { CODEX_HOME: codexHome }, now });
  assert.deepEqual(result, { live: false, reason: 'no-hook', code: null, observedAt: null });
});

test('untrusted and undeterminable verdicts never override a fresh receipt', (t) => {
  const dir = tempWorkspace(t);
  mkdirSync(join(dir, '.effective-flow'), { recursive: true });
  const now = Date.now();
  writeHookReceipt(hookReceiptPath(dir), {
    appliedAt: new Date(now).toISOString(),
    threadId: 'thread-1',
    outcome: 'applied',
    code: null,
  });

  // untrusted: the hook command is declared, but no trust-state entry exists in the readable
  // user configuration.
  const untrustedHome = isolatedCodexHome(dir, 'codex-home-untrusted');
  mkdirSync(untrustedHome, { recursive: true });
  writeFileSync(join(untrustedHome, 'config.toml'), 'command = "node session-title.mjs apply"\n');
  const untrusted = probeHookLiveness({ cwd: dir, env: { CODEX_HOME: untrustedHome }, now });
  assert.deepEqual(untrusted, {
    live: true,
    reason: null,
    code: null,
    observedAt: new Date(now).toISOString(),
  });

  // undeterminable: every configuration source is absent, so the scan proves nothing either way.
  const missingHome = isolatedCodexHome(dir, 'codex-home-missing');
  const undeterminable = probeHookLiveness({ cwd: dir, env: { CODEX_HOME: missingHome }, now });
  assert.equal(undeterminable.live, true);
});

// The regression this pins: a receipt that recorded only "the hook process ran" reported `live`
// for an installation whose RPC failed on every single turn, and the fragment then told the run to
// stay silent. That is a run that renames nothing and says nothing.
test('a hook whose RPC fails records the failure, and the next request reports hook-failed with its code rather than live', async (t) => {
  const dir = tempWorkspace(t);
  const env = { CODEX_THREAD_ID: 'thread-1', CODEX_HOME: isolatedCodexHome(dir, 'missing') };
  writeRequestFile(
    requestFilePath(dir),
    buildRequestDocument({ threadId: 'thread-1', title: 'Title', now: Date.now() }),
  );
  const sandboxed = async () => ({
    send() {},
    waitFor: async () => null,
    close: async () => ({
      status: 1,
      signal: null,
      stderr: 'failed to initialize sqlite state runtime under ~/.codex',
      error: null,
    }),
  });

  const applied = await executeOperation(
    'apply',
    { session_id: 'thread-1', cwd: dir },
    { runner: sandboxed },
  );
  assert.equal(applied.ok, false);
  assert.equal(applied.error.code, 'SANDBOX_DENIED');

  const receipt = readHookReceipt(hookReceiptPath(dir));
  assert.equal(receipt.outcome, 'failed');
  assert.equal(receipt.code, 'SANDBOX_DENIED');

  // The hook's own envelope reaches nobody, so the receipt is the only channel by which the next
  // run can learn that the path it was about to trust is broken.
  const next = await executeOperation('request', { cwd: dir, title: 'Title' }, { env });
  assert.equal(next.data.live, false);
  assert.equal(next.data.reason, 'hook-failed');
  assert.equal(next.data.code, 'SANDBOX_DENIED');
  assert.equal(
    next.data.requested,
    true,
    'the request is still written for a hook that may recover',
  );
});

test('a successful apply records applied, and the next request reports the path as live', async (t) => {
  const dir = tempWorkspace(t);
  const env = { CODEX_THREAD_ID: 'thread-1', CODEX_HOME: isolatedCodexHome(dir, 'missing') };
  writeRequestFile(
    requestFilePath(dir),
    buildRequestDocument({ threadId: 'thread-1', title: 'Title', now: Date.now() }),
  );
  const runner = async () => ({
    send() {},
    waitFor: async (id) => ({ jsonrpc: '2.0', id, result: {} }),
    close: async () => ({ status: 0, signal: null, stderr: '', error: null }),
  });

  await executeOperation('apply', { session_id: 'thread-1', cwd: dir }, { runner });
  assert.equal(readHookReceipt(hookReceiptPath(dir)).outcome, 'applied');

  const next = await executeOperation('request', { cwd: dir, title: 'Title' }, { env });
  assert.deepEqual(
    { live: next.data.live, reason: next.data.reason, code: next.data.code },
    { live: true, reason: null, code: null },
  );
});

// The regression this pins, and the reason it must run through `executeApply`: the preservation
// branch used to read the receipt back inside the finalizer, where it found this same invocation's
// `started` marker instead of the historic verdict. Called twice in a row it looked correct; on
// the shipped path it never fired once. Only an intervening no-request invocation discriminates.
test('an intervening hook run that had nothing to do does not erase a recorded failure', async (t) => {
  const dir = tempWorkspace(t);
  const env = { CODEX_THREAD_ID: 'thread-1', CODEX_HOME: isolatedCodexHome(dir, 'missing') };
  writeRequestFile(
    requestFilePath(dir),
    buildRequestDocument({ threadId: 'thread-1', title: 'Title', now: Date.now() }),
  );
  const sandboxed = async () => ({
    send() {},
    waitFor: async () => null,
    close: async () => ({
      status: 1,
      signal: null,
      stderr: 'failed to initialize sqlite state runtime under ~/.codex',
      error: null,
    }),
  });

  const failing = await executeOperation(
    'apply',
    { session_id: 'thread-1', cwd: dir },
    { runner: sandboxed },
  );
  assert.equal(failing.error.code, 'SANDBOX_DENIED');
  assert.equal(readHookReceipt(hookReceiptPath(dir)).outcome, 'failed');

  // The next turn requests no title, so the hook fires with nothing pending. In a multi-turn
  // workflow this is the common case, not an edge one.
  const idle = await executeOperation('apply', { session_id: 'thread-1', cwd: dir }, {});
  assert.equal(idle.data.reason, 'no-request');
  const receipt = readHookReceipt(hookReceiptPath(dir));
  assert.equal(receipt.outcome, 'failed', 'an idle turn must not clear the failure');
  assert.equal(receipt.code, 'SANDBOX_DENIED');

  const next = await executeOperation('request', { cwd: dir, title: 'Title' }, { env });
  assert.equal(next.data.live, false, 'a broken installation must not read as live');
  assert.equal(next.data.reason, 'hook-failed');
  assert.equal(next.data.code, 'SANDBOX_DENIED');
});

test('a skip with no verdict to preserve is recorded as the skip it is', (t) => {
  const dir = tempWorkspace(t);
  mkdirSync(join(dir, '.effective-flow'), { recursive: true });
  const path = hookReceiptPath(dir);
  const stamp = new Date(2_000_000).toISOString();

  finalizeHookReceipt(path, { appliedAt: stamp, threadId: 'thread-1', outcome: 'skipped' }, null);
  assert.equal(readHookReceipt(path).outcome, 'skipped');

  // An entry marker is not a verdict and is never carried forward.
  finalizeHookReceipt(
    path,
    { appliedAt: stamp, threadId: 'thread-1', outcome: 'skipped' },
    { appliedAt: 1_000_000, threadId: 'thread-1', outcome: 'started', code: null },
  );
  assert.equal(readHookReceipt(path).outcome, 'skipped');
});

// The regression this pins: an expiry was recorded as a plain skip, so it both vouched for
// liveness and refreshed the timestamp. A run whose request expired would then find a `skipped`
// receipt, report live, stay silent, and let the next request expire too - never renamed, never a
// suggestion line, with the evidence in a table the run never reads.
test('an expired request is a verdict against the path, not proof that the hook works', async (t) => {
  const dir = tempWorkspace(t);
  const env = { CODEX_THREAD_ID: 'thread-1', CODEX_HOME: isolatedCodexHome(dir, 'missing') };
  const now = Date.now();
  writeRequestFile(requestFilePath(dir), {
    threadId: 'thread-1',
    title: 'Title',
    requestedAt: new Date(now - REQUEST_MAX_AGE_MS - 60_000).toISOString(),
  });

  const expired = await executeOperation('apply', { session_id: 'thread-1', cwd: dir }, { now });
  assert.equal(expired.data.reason, 'expired-request');
  const receipt = readHookReceipt(hookReceiptPath(dir));
  assert.equal(receipt.outcome, 'unapplied');
  assert.equal(receipt.code, 'expired-request');

  const next = await executeOperation('request', { cwd: dir, title: 'Title' }, { env, now });
  assert.equal(next.data.live, false, 'an expiry must never read as liveness');
  assert.equal(next.data.reason, 'hook-stale');
  assert.equal(next.data.code, 'expired-request');

  // And it does not decay into liveness through an idle turn either.
  await executeOperation('apply', { session_id: 'thread-1', cwd: dir }, { now: now + 1000 });
  const after = await executeOperation(
    'request',
    { cwd: dir, title: 'Title' },
    { env, now: now + 2000 },
  );
  assert.equal(after.data.live, false);
  assert.equal(after.data.reason, 'hook-stale');
});

test('an unusable request is a verdict against the path for the same reason an expiry is', async (t) => {
  const dir = tempWorkspace(t);
  const codexHome = isolatedCodexHome(dir, 'missing');
  mkdirSync(requestFilePath(dir), { recursive: true });

  const blocked = await executeOperation('apply', { session_id: 'thread-1', cwd: dir }, {});
  assert.equal(blocked.data.reason, 'unusable-request');
  assert.equal(readHookReceipt(hookReceiptPath(dir)).outcome, 'unapplied');

  // Probed directly, because the writing side refuses a planted path outright - that hard error is
  // pinned by its own test, and what matters here is the verdict the receipt now carries.
  const probed = probeHookLiveness({ cwd: dir, env: { CODEX_HOME: codexHome } });
  assert.equal(probed.live, false);
  assert.equal(probed.reason, 'hook-stale');
  assert.equal(probed.code, 'unusable-request');
});

// A planted request is workspace-writable input. It may report that nothing was renamed; it may
// not report that the user's Codex installation is broken.
test('a rejected title indicts the request rather than the installation, and a stray code is dropped', async (t) => {
  const dir = tempWorkspace(t);
  writeRequestFile(requestFilePath(dir), {
    threadId: 'thread-1',
    title: 'Planted\ntitle',
    requestedAt: new Date().toISOString(),
  });

  const envelope = await executeOperation('apply', { session_id: 'thread-1', cwd: dir }, {});
  assert.equal(envelope.error.code, 'INVALID_PAYLOAD');
  const receipt = readHookReceipt(hookReceiptPath(dir));
  assert.equal(receipt.outcome, 'unapplied', 'a bad title must not claim the installation failed');
  assert.equal(receipt.code, 'INVALID_PAYLOAD');

  // Only vocabulary the fragment can map reaches the run: an errno from anywhere else is dropped.
  const strayCode = { ...receipt, code: 'ENOTDIR' };
  finalizeHookReceipt(
    hookReceiptPath(dir),
    { appliedAt: new Date().toISOString(), threadId: 'thread-1', outcome: 'skipped' },
    strayCode,
  );
  const carried = readHookReceipt(hookReceiptPath(dir));
  assert.equal(carried.outcome, 'unapplied');
  // The clamp has to sit on the read, not only on the write: this file is workspace-writable and
  // the run names this code in its own output, so an unrecognized string reaching it would be text
  // injection into the run's context rather than a vocabulary slip.
  assert.equal(carried.code, null, 'a code outside the shared vocabulary must not reach the run');
  const probed = probeHookLiveness({
    cwd: dir,
    env: { CODEX_HOME: isolatedCodexHome(dir, 'missing') },
  });
  assert.equal(probed.reason, 'hook-stale');
  assert.equal(probed.code, null);
});

// The regression this pins: `thread-mismatch` reads like the benign shared-checkout case, but that
// reading rests on A1' - that the hook payload's `session_id` equals the recorded
// `CODEX_THREAD_ID` - which the plan records as never executed. If A1' is false every request
// mismatches, and a neutral verdict would have every run after the first read that as liveness and
// fall permanently silent.
test('a thread mismatch is a verdict against the path, because it is what a false A1 assumption looks like', async (t) => {
  const dir = tempWorkspace(t);
  const env = { CODEX_THREAD_ID: 'thread-mine', CODEX_HOME: isolatedCodexHome(dir, 'missing') };
  writeRequestFile(
    requestFilePath(dir),
    buildRequestDocument({ threadId: 'thread-mine', title: 'Title', now: Date.now() }),
  );

  // The hook reports an identity that never matches what the request recorded.
  const mismatched = await executeOperation(
    'apply',
    { session_id: 'hook-side-identity', cwd: dir },
    {},
  );
  assert.equal(mismatched.ok, true, 'the hook itself must still report a clean skip');
  assert.equal(mismatched.data.reason, 'thread-mismatch');

  const receipt = readHookReceipt(hookReceiptPath(dir));
  assert.equal(receipt.outcome, 'unapplied');
  assert.equal(receipt.code, 'thread-mismatch');

  const next = await executeOperation('request', { cwd: dir, title: 'Title' }, { env });
  assert.equal(next.data.live, false, 'a mismatch must never be read as proof the path works');
  assert.equal(next.data.reason, 'hook-stale');
  assert.equal(next.data.code, 'thread-mismatch');
});

// The regression this pins: the entry receipt was written after the checks rather than before, so
// a hook that fails the same way every turn left no trace. `NO_THREAD_ID` is the case that matters
// - it is the failure the plan's A1' predicts - and it is refused before the request is ever read.
// A `cwd` too broken to derive a path from is a different, still-open blind spot: both derivations
// reject the same inputs, so that case records nothing and this test does not claim otherwise.
test('a hook refused before it reads a request still records why', async (t) => {
  const dir = tempWorkspace(t);
  const env = { CODEX_THREAD_ID: 'thread-1', CODEX_HOME: isolatedCodexHome(dir, 'missing') };
  mkdirSync(join(dir, '.effective-flow'), { recursive: true });

  // A payload without `session_id` is the plan's own unverified A1'.
  const envelope = await executeOperation('apply', { cwd: dir }, {});
  assert.equal(envelope.error.code, 'NO_THREAD_ID');
  const receipt = readHookReceipt(hookReceiptPath(dir));
  assert.notEqual(receipt, null, 'the entry receipt must precede every check that can refuse');
  assert.equal(receipt.outcome, 'failed');
  assert.equal(receipt.code, 'NO_THREAD_ID');

  const next = await executeOperation('request', { cwd: dir, title: 'Title' }, { env });
  assert.equal(next.data.reason, 'hook-failed');
  assert.equal(next.data.code, 'NO_THREAD_ID');
});

test('a receipt still at started proves only that a hook died mid-flight and is not live', (t) => {
  const dir = tempWorkspace(t);
  mkdirSync(join(dir, '.effective-flow'), { recursive: true });
  const now = Date.now();
  writeHookReceipt(hookReceiptPath(dir), {
    appliedAt: new Date(now).toISOString(),
    threadId: 'thread-1',
    outcome: 'started',
    code: null,
  });

  const result = probeHookLiveness({
    cwd: dir,
    env: { CODEX_HOME: isolatedCodexHome(dir, 'missing') },
    now,
  });
  assert.equal(result.live, false);
  assert.equal(result.reason, 'undeterminable');
});

// The regression this pins: the scan tested for a status string the reader no longer emits, so an
// unreadable TOML layer threw inside a function documented never to throw. The probe's catch then
// returned `undeterminable` without ever reading the receipt, and an unreadable file unrelated to
// hooks downgraded every verdict; a JSON layer went the other way and could report `no-hook` -
// one of the two verdicts allowed to override a receipt - for a scan that was denied.
test('a configuration source that cannot be read is counted, never thrown on, and never becomes no-hook', (t) => {
  const dir = tempWorkspace(t);
  mkdirSync(join(dir, '.effective-flow'), { recursive: true });
  const now = Date.now();
  writeHookReceipt(hookReceiptPath(dir), {
    appliedAt: new Date(now).toISOString(),
    threadId: 'thread-1',
    outcome: 'applied',
    code: null,
  });
  const codexHome = isolatedCodexHome(dir);
  mkdirSync(codexHome, { recursive: true });
  // A directory in place of each configuration file is unreadable on every platform.
  mkdirSync(join(codexHome, 'config.toml'), { recursive: true });
  mkdirSync(join(codexHome, 'hooks.json'), { recursive: true });

  let scan;
  assert.doesNotThrow(() => {
    scan = scanHookConfiguration({ cwd: dir, env: { CODEX_HOME: codexHome } });
  });
  assert.equal(scan.unreadable, 2, 'an unusable source must be counted as unreadable');
  assert.equal(scan.verdict, 'undeterminable');

  // The receipt still decides, because the scan proved nothing either way.
  const result = probeHookLiveness({ cwd: dir, env: { CODEX_HOME: codexHome }, now });
  assert.equal(result.live, true, 'an unreadable config must not veto first-hand evidence');
});

test('the probe never throws on malformed configuration or a corrupt receipt', (t) => {
  const dir = tempWorkspace(t);
  mkdirSync(join(dir, '.effective-flow'), { recursive: true });
  writeFileSync(hookReceiptPath(dir), 'not valid json', { mode: 0o600 });
  const codexHome = isolatedCodexHome(dir);
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(join(codexHome, 'config.toml'), Buffer.from([0, 1, 2, 3, 0xff, 0xfe]));

  let result;
  assert.doesNotThrow(() => {
    result = probeHookLiveness({ cwd: dir, env: { CODEX_HOME: codexHome } });
  });
  assert.equal(result.live, false);
});

test('a malformed hook receipt never blocks the request write', async (t) => {
  const dir = tempWorkspace(t);
  mkdirSync(join(dir, '.effective-flow'), { recursive: true });
  writeFileSync(hookReceiptPath(dir), 'not valid json', { mode: 0o600 });

  const envelope = await executeOperation(
    'request',
    { cwd: dir, title: 'Title' },
    { env: { CODEX_THREAD_ID: 'thread-1', CODEX_HOME: isolatedCodexHome(dir, 'missing') } },
  );
  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.requested, true);
  assert.equal(existsSync(requestFilePath(dir)), true);
});

test('no runtime directory is created in a workspace that never requested one', async (t) => {
  const dir = tempWorkspace(t);
  const envelope = await executeOperation('apply', { session_id: 'thread-1', cwd: dir }, {});
  assert.equal(envelope.ok, true);
  assert.equal(envelope.data.applied, false);
  assert.equal(envelope.data.reason, 'no-request');
  assert.equal(
    existsSync(join(dir, '.effective-flow')),
    false,
    'apply must not create runtime state in a workspace that never wrote a request',
  );
});

// ---------------------------------------------------------------------------------------------
// CLI: real exit codes and single-line stdout envelopes, mirroring test/remote-tracker.test.mjs.
// ---------------------------------------------------------------------------------------------

test('CLI request writes the request file and prints exactly one success envelope line with exit code 0', (t) => {
  const dir = tempWorkspace(t);
  const result = spawnSync(process.execPath, ['src/scripts/session-title.mjs', 'request'], {
    cwd: repositoryRoot,
    input: JSON.stringify({ cwd: dir, title: 'A test session title' }),
    encoding: 'utf8',
    env: {
      ...process.env,
      CODEX_THREAD_ID: 'thread-cli-1',
      CODEX_HOME: isolatedCodexHome(dir, 'missing-codex-home'),
    },
  });
  assert.equal(result.status, 0);
  const lines = result.stdout.split('\n').filter((line) => line !== '');
  assert.equal(lines.length, 1, 'stdout must carry exactly one envelope line');
  const envelope = JSON.parse(lines[0]);
  assert.equal(envelope.ok, true);
  assert.equal(envelope.operation, 'request');
  assert.equal(envelope.data.requested, true);
  assert.equal(existsSync(requestFilePath(dir)), true);
});

// Covers the shape of the `'exit'` race: settling on exit alone nulls every waiter the moment the
// process is gone, even with its reply still in the pipe, which turns a successful rename into a
// COMMAND_FAILED - and, now that failures persist, into a verdict that suppresses the path for a
// day. Stated honestly, this is a smoke check and **not** a discriminating regression guard: the
// window is the sub-millisecond ordering of two libuv callbacks, and with the grace period removed
// this test still passes here because the data callback happens to win. Landing inside that window
// from a child process is not something a test can arrange; what it does prove is that the
// answer-and-exit-together path reports `applied` rather than a failure.
test('a server that answers and exits in the same tick is reported as applied', (t) => {
  const dir = tempWorkspace(t);
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, 'codex'),
    [
      '#!/usr/bin/env node',
      "let buffer = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', (chunk) => {",
      '  buffer += chunk;',
      '  let index;',
      "  while ((index = buffer.indexOf('\\n')) !== -1) {",
      '    const line = buffer.slice(0, index);',
      '    buffer = buffer.slice(index + 1);',
      '    if (!line.trim()) continue;',
      '    const message = JSON.parse(line);',
      '    if (message.id === undefined) continue;',
      "    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {} }) + '\\n');",
      // The reply and the exit leave in the same tick, which is the whole point.
      "    if (message.method === 'thread/name/set') process.exit(0);",
      '  }',
      '});',
    ].join('\n'),
    { mode: 0o755 },
  );

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    writeRequestFile(
      requestFilePath(dir),
      buildRequestDocument({ threadId: 'thread-1', title: 'Title', now: Date.now() }),
    );
    const result = spawnSync(process.execPath, ['src/scripts/session-title.mjs', 'apply'], {
      cwd: repositoryRoot,
      input: JSON.stringify({ session_id: 'thread-1', cwd: dir }),
      encoding: 'utf8',
      timeout: 30_000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
    const envelope = JSON.parse(result.stdout.split('\n').filter((line) => line !== '')[0]);
    assert.equal(envelope.ok, true, `attempt ${attempt}: ${result.stdout}${result.stderr}`);
    assert.equal(envelope.data.applied, true, `attempt ${attempt} lost the reply to the exit`);
    assert.equal(readHookReceipt(hookReceiptPath(dir)).outcome, 'applied');
  }
});

// The regression this pins: `close()` waited on `'close'`, which waits for the stdio pipes. A
// grandchild that inherited the app server's standard output holds those open after the server
// itself is gone, so the hook sat there until Codex's own 600 s budget expired.
test('a grandchild holding the app-server pipes open cannot stall the hook past its close deadline', (t) => {
  const dir = tempWorkspace(t);
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  // Answers both requests, leaves a detached child holding its standard output, and exits. `exit`
  // therefore fires while `close` never does.
  writeFileSync(
    join(bin, 'codex'),
    [
      '#!/usr/bin/env node',
      "const { spawn } = require('node:child_process');",
      "let buffer = '';",
      "process.stdin.setEncoding('utf8');",
      "process.stdin.on('data', (chunk) => {",
      '  buffer += chunk;',
      '  let index;',
      "  while ((index = buffer.indexOf('\\n')) !== -1) {",
      '    const line = buffer.slice(0, index);',
      '    buffer = buffer.slice(index + 1);',
      '    if (!line.trim()) continue;',
      '    const message = JSON.parse(line);',
      '    if (message.id === undefined) continue;',
      "    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {} }) + '\\n');",
      "    if (message.method === 'thread/name/set') {",
      "      spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], {",
      '        detached: true,',
      "        stdio: ['ignore', 1, 'ignore'],",
      '      }).unref();',
      '      setTimeout(() => process.exit(0), 20);',
      '    }',
      '  }',
      '});',
    ].join('\n'),
    { mode: 0o755 },
  );
  writeRequestFile(
    requestFilePath(dir),
    buildRequestDocument({ threadId: 'thread-1', title: 'Title', now: Date.now() }),
  );

  const started = Date.now();
  const result = spawnSync(process.execPath, ['src/scripts/session-title.mjs', 'apply'], {
    cwd: repositoryRoot,
    input: JSON.stringify({ session_id: 'thread-1', cwd: dir }),
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  const elapsed = Date.now() - started;

  assert.equal(result.status, 0, result.stdout + result.stderr);
  const envelope = JSON.parse(result.stdout.split('\n').filter((line) => line !== '')[0]);
  assert.equal(envelope.data.applied, true);
  // The bound sits between the close deadline this must honour and the grandchild's own ten-second
  // lifetime, so a version that waits for the inherited pipe fails here instead of passing slowly.
  assert.ok(elapsed < 6_000, `apply took ${elapsed} ms, so it waited on the inherited pipe`);
});

test('CLI apply without a hook session_id fails closed with NO_THREAD_ID and a nonzero exit code', (t) => {
  const dir = tempWorkspace(t);
  const result = spawnSync(process.execPath, ['src/scripts/session-title.mjs', 'apply'], {
    cwd: repositoryRoot,
    input: JSON.stringify({ cwd: dir }),
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  const lines = result.stdout.split('\n').filter((line) => line !== '');
  assert.equal(lines.length, 1, 'stdout must carry exactly one envelope line');
  const envelope = JSON.parse(lines[0]);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'NO_THREAD_ID');
});
