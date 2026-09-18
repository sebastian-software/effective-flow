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

test('the default ssh of the upstream fetch runs in batch mode', () => {
  const base = { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };
  assert.deepEqual(nonInteractiveFetchEnv(), { ...base, GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' });
  assert.deepEqual(nonInteractiveFetchEnv({ environment: { PATH: '/usr/bin' } }), {
    ...base,
    GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',
  });
  // Empty and whitespace-only values count as unset.
  assert.deepEqual(
    nonInteractiveFetchEnv({
      environment: { GIT_SSH_COMMAND: ' ', GIT_SSH: '', GIT_SSH_VARIANT: '\t' },
      configuredSshCommand: '',
      configuredSshVariant: '  ',
    }),
    { ...base, GIT_SSH_COMMAND: 'ssh -o BatchMode=yes' },
  );
});

test('a user-configured SSH command, program, or variant is left untouched by the fetch', () => {
  const base = { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };
  const setups = [
    { environment: { GIT_SSH_COMMAND: 'ssh -o BatchMode=no -i ~/.ssh/deploy' } },
    { configuredSshCommand: 'ssh -i ~/.ssh/config-key' },
    { environment: { GIT_SSH: '/usr/bin/plink' } },
    { environment: { GIT_SSH_VARIANT: 'simple' } },
    { configuredSshVariant: 'putty' },
  ];
  for (const setup of setups) {
    const env = nonInteractiveFetchEnv(setup);
    assert.deepEqual(env, base, JSON.stringify(setup));
    assert.equal('GIT_SSH_COMMAND' in env, false, JSON.stringify(setup));
  }
});

test('the upstream fetch removes every inherited Git trace in both SSH branches', () => {
  const traced = {
    GIT_TRACE: '1',
    GIT_TRACE_PACKET: '1',
    GIT_TRACE_PACKFILE: '2',
    GIT_TRACE_REFS: '1',
    GIT_TRACE_CURL: '1',
    GIT_TRACE_CURL_NO_DATA: '1',
    GIT_TRACE2: '1',
    GIT_TRACE2_EVENT: '/tmp/x',
    GIT_TRACE2_PERF: '2',
    GIT_TRACE_SETUP: 'true',
    GIT_TRACE_PERFORMANCE: '1',
    GIT_TRACE_SOME_FUTURE_TARGET: '1',
    GIT_CURL_VERBOSE: '0',
  };
  const unrelated = { PATH: '/usr/bin', GIT_DIR: '/repo/.git', GIT_CURL_VERBOSE_X: '1' };
  const expectRemoved = (env, keys, label) => {
    for (const key of keys) {
      assert.ok(Object.hasOwn(env, key), `${label}: ${key}`);
      assert.equal(env[key], undefined, `${label}: ${key}`);
    }
    for (const key of Object.keys(unrelated)) {
      assert.equal(Object.hasOwn(env, key), false, `${label}: ${key}`);
    }
    assert.equal(env.GIT_TERMINAL_PROMPT, '0', label);
    assert.equal(env.GCM_INTERACTIVE, 'never', label);
  };
  for (const sshCommand of [undefined, 'sshpass -p SECRET ssh']) {
    const ssh = sshCommand === undefined ? {} : { GIT_SSH_COMMAND: sshCommand };
    // From the environment the SSH decision reads.
    expectRemoved(
      nonInteractiveFetchEnv({ environment: { ...traced, ...unrelated, ...ssh } }),
      Object.keys(traced),
      `environment ${sshCommand}`,
    );
    // From the environment the runner spreads the fetch env over, when it differs.
    expectRemoved(
      nonInteractiveFetchEnv({
        environment: ssh,
        inheritedEnvironment: { ...traced, ...unrelated },
      }),
      Object.keys(traced),
      `inherited ${sshCommand}`,
    );
  }
  // The trace variables are no SSH setup: the default ssh keeps its batch mode.
  assert.equal(
    nonInteractiveFetchEnv({ environment: traced, inheritedEnvironment: traced }).GIT_SSH_COMMAND,
    'ssh -o BatchMode=yes',
  );
  assert.equal(
    'GIT_SSH_COMMAND' in
      nonInteractiveFetchEnv({
        environment: { ...traced, GIT_SSH_COMMAND: 'sshpass -p SECRET ssh' },
      }),
    false,
  );
});

test('diagnostics are trimmed, capped, and never carry URL or token credentials', () => {
  assert.equal(diagnosticText(Buffer.from('  fatal: refused \n')), 'fatal: refused');
  assert.equal(diagnosticText(undefined), '');
  assert.equal(
    diagnosticText("fatal: unable to access 'https://user:tok3n@example.invalid/repo.git/'"),
    "fatal: unable to access 'https://***@example.invalid/repo.git/'",
  );
  // A password containing @ is redacted up to the last @ of the authority.
  assert.equal(
    diagnosticText('fatal: https://user:p@ss@example.invalid/repo.git'),
    'fatal: https://***@example.invalid/repo.git',
  );
  // Query strings and fragments carry tokens as often as userinfo does.
  assert.equal(
    diagnosticText(
      "fatal: unable to access 'https://example.invalid/repo.git/?access_token=s3cr3t&x=1': 403",
    ),
    "fatal: unable to access 'https://example.invalid/repo.git/?***': 403",
  );
  assert.equal(
    diagnosticText('fatal: repository https://example.invalid/repo.git#token=s3cr3t not found'),
    'fatal: repository https://example.invalid/repo.git#*** not found',
  );
  assert.equal(
    diagnosticText('fatal: https://u:pw@example.invalid:8443/r.git?sig=abc#frag'),
    'fatal: https://***@example.invalid:8443/r.git?***',
  );
  // Obvious token forms outside a URL are scrubbed too.
  assert.equal(diagnosticText('error: password=hunter2 rejected'), 'error: password=*** rejected');
  assert.equal(diagnosticText('> Authorization: Basic dXNlcjpzM2NyM3Q='), '> Authorization: ***');
  assert.equal(diagnosticText('header Bearer abc.def-ghi'), 'header Bearer ***');
  const pat = `ghp_${'A'.repeat(36)}`;
  assert.equal(diagnosticText(`fatal: token ${pat} expired`), 'fatal: token *** expired');
  // Ordinary diagnostics stay readable.
  assert.equal(
    diagnosticText("fatal: 'origin' does not appear to be a git repository"),
    "fatal: 'origin' does not appear to be a git repository",
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
