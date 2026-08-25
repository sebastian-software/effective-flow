import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  DeliverySelectionError,
  errorEnvelope,
  executeOperation,
  parsePorcelainV2Z,
  validateLiteralPath,
  validateSelectionManifest,
} from '../src/scripts/delivery-selection-core.mjs';

const OID = '1'.repeat(40);
const OTHER_OID = '2'.repeat(40);

function ordinaryRecord({ xy = 'M.', path = 'file.txt' } = {}) {
  return `1 ${xy} N... 100644 100644 100644 ${OID} ${OTHER_OID} ${path}`;
}

function validManifest() {
  return {
    version: 1,
    source: {
      root: '/tmp/source',
      repositoryIdentity: '/tmp/source/.git',
      headOid: OID,
    },
    entries: [
      {
        path: 'src/file.txt',
        renameFrom: null,
        selectionOrigin: 'staged',
        inventory: {
          kind: 'ordinary',
          indexStatus: 'M',
          worktreeStatus: '.',
          partiallyStaged: false,
        },
        sourceHead: {
          from: null,
          to: { path: 'src/file.txt', oid: OID, mode: '100644' },
        },
        selected: {
          kind: 'blob',
          mode: '100644',
          digest: 'a'.repeat(64),
          oid: OTHER_OID,
        },
      },
    ],
  };
}

test('porcelain v2 parsing preserves NUL-delimited paths and distinct file states', () => {
  const value = Buffer.from(
    [
      '# branch.oid ignored',
      ordinaryRecord({ xy: 'MM', path: 'partial file.txt' }),
      `2 R. N... 100644 100644 100644 ${OID} ${OTHER_OID} R100 renamed.txt`,
      'old name.txt',
      '? untracked (literal).txt',
      '! ignored.txt',
      '',
    ].join('\0'),
  );

  const result = parsePorcelainV2Z(value);

  assert.deepEqual(
    result.entries.map(({ path, kind, staged, unstaged, partiallyStaged, renameFrom }) => ({
      path,
      kind,
      staged,
      unstaged,
      partiallyStaged,
      renameFrom,
    })),
    [
      {
        path: 'partial file.txt',
        kind: 'ordinary',
        staged: true,
        unstaged: true,
        partiallyStaged: true,
        renameFrom: undefined,
      },
      {
        path: 'renamed.txt',
        kind: 'rename',
        staged: true,
        unstaged: false,
        partiallyStaged: false,
        renameFrom: 'old name.txt',
      },
      {
        path: 'untracked (literal).txt',
        kind: 'untracked',
        staged: false,
        unstaged: true,
        partiallyStaged: false,
        renameFrom: undefined,
      },
    ],
  );
  assert.deepEqual(result.ignored, ['ignored.txt']);
});

test('porcelain v2 parsing rejects unmerged and unknown records', () => {
  assert.throws(
    () =>
      parsePorcelainV2Z(
        Buffer.from(`u UU N... 100644 100644 100644 100644 ${OID} ${OID} ${OID} file.txt\0`),
      ),
    (error) => error.code === 'UNSUPPORTED_PATH',
  );
  assert.throws(
    () => parsePorcelainV2Z(Buffer.from('x unsupported\0')),
    (error) => error.code === 'COMMAND_FAILED',
  );
});

test('literal path validation accepts special characters but rejects path interpretation', () => {
  assert.equal(validateLiteralPath('docs/(literal) name.txt'), 'docs/(literal) name.txt');

  for (const candidate of [
    '/absolute',
    '../escape',
    'nested/../escape',
    'nested//file',
    'trailing/',
    'wild*card',
    'question?.txt',
    ':pathspec',
    'C:/drive.txt',
    'back\\slash',
  ]) {
    assert.throws(
      () => validateLiteralPath(candidate),
      (error) => error.code === 'INVALID_PATH',
      candidate,
    );
  }
});

test('manifest validation binds a strict, non-overlapping schema', () => {
  const manifest = validManifest();
  assert.equal(validateSelectionManifest(manifest), manifest);

  const extraField = structuredClone(manifest);
  extraField.unconfirmed = true;
  assert.throws(
    () => validateSelectionManifest(extraField),
    (error) => error.code === 'INVALID_PAYLOAD',
  );

  const overlapping = structuredClone(manifest);
  overlapping.entries.push(structuredClone(overlapping.entries[0]));
  assert.throws(
    () => validateSelectionManifest(overlapping),
    (error) => error.code === 'INVALID_PAYLOAD',
  );

  const invalidDigest = structuredClone(manifest);
  invalidDigest.entries[0].selected.digest = 'not-a-digest';
  assert.throws(
    () => validateSelectionManifest(invalidDigest),
    (error) => error.code === 'INVALID_PAYLOAD',
  );
});

test('error envelopes redact content-bearing details and retain stable diagnostics', () => {
  const error = new DeliverySelectionError('SOURCE_DRIFT', 'selection changed', {
    path: 'src/file.txt',
    content: 'private source',
    nested: { bytes: Buffer.from('private bytes'), token: 'private token' },
  });

  assert.deepEqual(errorEnvelope('verify-source', error), {
    ok: false,
    operation: 'verify-source',
    data: null,
    dryRun: false,
    error: {
      code: 'SOURCE_DRIFT',
      message: 'selection changed',
      details: {
        path: 'src/file.txt',
        content: '[redacted]',
        nested: { bytes: '[redacted]', token: '[redacted]' },
      },
      exitCode: 3,
    },
  });
});

test('operation dispatch returns normalized success and failure envelopes', async () => {
  const unknown = await executeOperation('unknown', {});
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error.code, 'INVALID_PAYLOAD');
  assert.equal(unknown.operation, 'unknown');

  const invalidTransfer = await executeOperation('transfer', {});
  assert.equal(invalidTransfer.ok, false);
  assert.equal(invalidTransfer.dryRun, true);
  assert.equal(invalidTransfer.error.code, 'INVALID_PAYLOAD');
});

test('the CLI emits one machine envelope, one diagnostic, and the stable exit status', () => {
  const script = fileURLToPath(new URL('../src/scripts/delivery-selection.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, 'unknown'], {
    input: '{}',
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  assert.equal(result.status, 2);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.operation, 'unknown');
  assert.equal(envelope.error.code, 'INVALID_PAYLOAD');
  assert.equal(envelope.error.exitCode, 2);
  assert.equal(result.stderr, 'INVALID_PAYLOAD: unknown operation: unknown\n');
});
