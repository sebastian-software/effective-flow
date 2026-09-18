import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  computeOverlap,
  DELIVERY_SELECTION_DRY_RUN_OPERATIONS,
  DELIVERY_SELECTION_OPERATIONS,
  DeliverySelectionError,
  errorEnvelope,
  executeOperation,
  DIAGNOSTIC_MAX_LENGTH,
  diagnosticText,
  isDryRun,
  NON_INTERACTIVE_FETCH_ENV,
  nonInteractiveFetchEnv,
  parsePorcelainV2Z,
  snapshotScope,
  UPSTREAM_FETCH_TIMEOUT_MS,
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

test('upstream operations are dispatched and only fast-forward previews by default', () => {
  assert.ok(DELIVERY_SELECTION_OPERATIONS.includes('upstream-status'));
  assert.ok(DELIVERY_SELECTION_OPERATIONS.includes('fast-forward'));
  assert.deepEqual([...DELIVERY_SELECTION_DRY_RUN_OPERATIONS], ['transfer', 'fast-forward']);

  assert.equal(isDryRun('fast-forward', undefined), true);
  assert.equal(isDryRun('fast-forward', false), true);
  assert.equal(isDryRun('fast-forward', true), false);
  assert.equal(isDryRun('transfer', undefined), true);
  assert.equal(isDryRun('transfer', true), false);
  for (const operation of ['upstream-status', 'inventory', 'reconcile', 'unknown']) {
    assert.equal(isDryRun(operation, undefined), false, operation);
    assert.equal(isDryRun(operation, true), false, operation);
  }
});

test('the upstream fetch environment cannot prompt for credentials or host keys', () => {
  assert.deepEqual(NON_INTERACTIVE_FETCH_ENV, {
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never',
  });
  assert.ok(Object.isFrozen(NON_INTERACTIVE_FETCH_ENV));
  assert.equal(UPSTREAM_FETCH_TIMEOUT_MS, 60000);
});

test('the fetch SSH command extends the user setup in Git precedence order', () => {
  const base = { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };
  assert.deepEqual(nonInteractiveFetchEnv(), {
    ...base,
    GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',
  });
  assert.deepEqual(
    nonInteractiveFetchEnv({
      environment: { GIT_SSH_COMMAND: 'ssh -i ~/.ssh/deploy', GIT_SSH: '/usr/bin/plink' },
      configuredSshCommand: 'ssh -i ~/.ssh/config-key',
    }),
    { ...base, GIT_SSH_COMMAND: 'ssh -i ~/.ssh/deploy -o BatchMode=yes' },
  );
  // core.sshCommand outranks GIT_SSH, exactly as in Git.
  assert.deepEqual(
    nonInteractiveFetchEnv({
      environment: { GIT_SSH: '/usr/bin/plink' },
      configuredSshCommand: 'ssh -i ~/.ssh/config-key',
    }),
    { ...base, GIT_SSH_COMMAND: 'ssh -i ~/.ssh/config-key -o BatchMode=yes' },
  );
  // A bare GIT_SSH program takes no options, so no GIT_SSH_COMMAND overrides it.
  assert.deepEqual(nonInteractiveFetchEnv({ environment: { GIT_SSH: '/usr/bin/plink' } }), base);
  // Empty values count as unset.
  assert.deepEqual(
    nonInteractiveFetchEnv({ environment: { GIT_SSH_COMMAND: ' ' }, configuredSshCommand: '' }),
    { ...base, GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' },
  );
});

test('diagnostics are trimmed, capped, and never carry URL credentials', () => {
  assert.equal(diagnosticText(Buffer.from('  fatal: refused \n')), 'fatal: refused');
  assert.equal(diagnosticText(undefined), '');
  assert.equal(
    diagnosticText("fatal: unable to access 'https://user:tok3n@example.invalid/repo.git/'"),
    "fatal: unable to access 'https://***@example.invalid/repo.git/'",
  );
  const long = diagnosticText('x'.repeat(DIAGNOSTIC_MAX_LENGTH + 500));
  assert.equal(long.length, DIAGNOSTIC_MAX_LENGTH);
});

test('the fast-forward snapshot covers only entries in directories the merge can write', () => {
  const local = {
    dirty: ['README.md', 'src/app/edit.js', 'src/other/edit.js', 'web/app.js'],
    ignored: ['build.log', 'src/app/cache/', 'src/node_modules/', 'web/node_modules/', 'dist/'],
  };
  assert.deepEqual(snapshotScope(local, ['src/app/incoming.js']), {
    // The root and `src/` are ancestors of the incoming path, `src/app/` is its parent.
    dirty: ['README.md', 'src/app/edit.js'],
    ignored: ['build.log', 'dist', 'src/app/cache', 'src/node_modules'],
  });
  assert.deepEqual(snapshotScope(local, []), { dirty: [], ignored: [] });
  assert.deepEqual(snapshotScope({ dirty: ['SRC/App/Edit.js'], ignored: [] }, ['src/app/x.js']), {
    dirty: [],
    ignored: [],
  });
  assert.deepEqual(
    snapshotScope({ dirty: ['SRC/App/Edit.js'], ignored: [] }, ['src/app/x.js'], {
      ignoreCase: true,
    }),
    { dirty: ['SRC/App/Edit.js'], ignored: [] },
  );
});

test('upstream-status rejects a non-boolean fetch before touching the repository', async () => {
  for (const fetch of ['true', 1, null, {}]) {
    const envelope = await executeOperation('upstream-status', { root: '/nonexistent', fetch });
    assert.equal(envelope.ok, false, String(fetch));
    assert.equal(envelope.operation, 'upstream-status');
    assert.equal(envelope.dryRun, false);
    assert.equal(envelope.error.code, 'INVALID_PAYLOAD');
    assert.deepEqual(envelope.error.details, { field: 'fetch' });
  }
  const notObject = await executeOperation('upstream-status', []);
  assert.equal(notObject.error.code, 'INVALID_PAYLOAD');
});

test('fast-forward validates its pinned expectations and reports no mutation', async () => {
  const valid = {
    root: '/nonexistent',
    expectedBranch: 'main',
    expectedHeadOid: OID,
    expectedUpstreamOid: OTHER_OID,
  };
  const cases = [
    [{ ...valid, expectedBranch: undefined }, 'expectedBranch'],
    [{ ...valid, expectedBranch: '  ' }, 'expectedBranch'],
    [{ ...valid, expectedHeadOid: undefined }, 'expectedHeadOid'],
    [{ ...valid, expectedHeadOid: 'A'.repeat(40) }, 'expectedHeadOid'],
    [{ ...valid, expectedHeadOid: '1'.repeat(39) }, 'expectedHeadOid'],
    [{ ...valid, expectedHeadOid: '1'.repeat(50) }, 'expectedHeadOid'],
    [{ ...valid, expectedHeadOid: '1'.repeat(65) }, 'expectedHeadOid'],
    [{ ...valid, expectedUpstreamOid: undefined }, 'expectedUpstreamOid'],
    [{ ...valid, expectedUpstreamOid: 'HEAD' }, 'expectedUpstreamOid'],
    [{ ...valid, expectedUpstreamOid: `-${'1'.repeat(40)}` }, 'expectedUpstreamOid'],
  ];
  for (const [input, field] of cases) {
    for (const apply of [false, true]) {
      const envelope = await executeOperation('fast-forward', input, { apply });
      assert.equal(envelope.ok, false, field);
      assert.equal(envelope.operation, 'fast-forward');
      assert.equal(envelope.dryRun, !apply, field);
      assert.equal(envelope.error.code, 'INVALID_PAYLOAD', field);
      assert.equal(envelope.error.details.field, field);
      assert.equal(envelope.error.details.mutationMayHaveSucceeded, false, field);
    }
  }
});

test('overlap covers equal, parent, child, and gitlink paths only', () => {
  const incoming = { paths: ['docs/guide.md', 'src/lib', 'vendor/sub'], gitlinks: ['vendor/sub'] };

  assert.deepEqual(computeOverlap([], { paths: [], gitlinks: [] }), []);
  assert.deepEqual(computeOverlap(['docs/guide.md'], incoming), ['docs/guide.md', 'vendor/sub']);
  // A local file where the upstream adds a directory, and a local directory entry above it.
  assert.deepEqual(computeOverlap(['docs'], incoming), ['docs', 'vendor/sub']);
  assert.deepEqual(computeOverlap(['docs/'], incoming), ['docs/', 'vendor/sub']);
  // A local path below an incoming file that becomes a directory locally.
  assert.deepEqual(computeOverlap(['src/lib/index.js'], incoming), [
    'src/lib/index.js',
    'vendor/sub',
  ]);
  // Shared prefixes that are not path ancestors never overlap.
  assert.deepEqual(
    computeOverlap(['docs/guide.md.bak', 'src/library', 'doc'], {
      paths: incoming.paths,
      gitlinks: [],
    }),
    [],
  );
  // An incoming gitlink always overlaps, even with no local path at all.
  assert.deepEqual(computeOverlap([], incoming), ['vendor/sub']);
});

test('overlap folds case only when the repository ignores case', () => {
  const incoming = { paths: ['Docs/Guide.md'], gitlinks: [] };

  assert.deepEqual(computeOverlap(['docs/guide.md'], incoming), []);
  assert.deepEqual(computeOverlap(['docs/guide.md'], incoming, { ignoreCase: false }), []);
  assert.deepEqual(computeOverlap(['docs/guide.md'], incoming, { ignoreCase: true }), [
    'docs/guide.md',
  ]);
  assert.deepEqual(computeOverlap(['DOCS'], incoming, { ignoreCase: true }), ['DOCS']);
});

test('an unexpected runner exception before the merge is a COMMAND_FAILED without mutation', async () => {
  const runner = () => {
    throw Object.assign(new Error('runner exploded'), { code: 'EBOOM' });
  };
  const envelope = await executeOperation(
    'fast-forward',
    {
      root: process.cwd(),
      expectedBranch: 'main',
      expectedHeadOid: OID,
      expectedUpstreamOid: OTHER_OID,
    },
    { runner, apply: true },
  );
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'COMMAND_FAILED');
  assert.deepEqual(envelope.error.details, { mutationMayHaveSucceeded: false, cause: 'EBOOM' });
});
