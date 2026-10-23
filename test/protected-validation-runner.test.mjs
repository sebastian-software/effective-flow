import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

const runner = new URL('../scripts/protected-validation-runner.mjs', import.meta.url).href;
function probe(command, args, options = {}) {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { boundedSpawnSync } from ${JSON.stringify(runner)};
    const result = boundedSpawnSync(${JSON.stringify(command)}, ${JSON.stringify(args)}, ${JSON.stringify({ timeoutMs: 2000, encoding: 'utf8', operation: 'fixture-command', ...options })});
    process.stdout.write(JSON.stringify({status: result.status, signal: result.signal, errorCode: result.error?.code ?? null, stdout: result.stdout, stderr: result.stderr}));
  `,
    ],
    { encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL' },
  );
  assert.equal(result.error, undefined, `outer watchdog fired: ${result.error?.code}`);
  assert.equal(result.status, 0, result.stderr);
  const diagnostics = result.stderr
    .trim()
    .split('\n')
    .map((line) => {
      assert.match(line, /^EF_PROTECTED_VALIDATION_PROCESS /);
      return JSON.parse(line.slice('EF_PROTECTED_VALIDATION_PROCESS '.length));
    });
  assert.deepEqual(
    diagnostics.map(({ phase }) => phase),
    ['start', 'end'],
  );
  assert.equal(diagnostics[0].operationId, diagnostics[1].operationId);
  assert.equal(diagnostics[1].timedOut, false);
  assert.doesNotMatch(result.stderr, /^EF_PROTECTED_VALIDATION \{/m);
  return { result: JSON.parse(result.stdout), diagnostics, stderr: result.stderr };
}

test('bounded runner supplies EOF by default and preserves explicit input and separated diagnostic streams', () => {
  for (const [options, expected] of [
    [{}, ''],
    [{ input: 'fixture input\n' }, 'fixture input\n'],
  ]) {
    const { result, diagnostics, stderr } = probe(
      process.execPath,
      [
        '-e',
        `
      const input = require('node:fs').readFileSync(0, 'utf8');
      process.stdout.write(input);
      process.stderr.write('child diagnostic');
    `,
      ],
      options,
    );
    assert.equal(result.status, 0);
    assert.equal(result.errorCode, null);
    assert.equal(result.stdout, expected);
    assert.equal(result.stderr, 'child diagnostic');
    assert.equal(diagnostics[1].exitCode, 0);
    assert.doesNotMatch(stderr, /child diagnostic|fixture input/);
  }
});

test('bounded runner returns missing-command failure without emitting accepted proof or command arguments', () => {
  const { result, diagnostics, stderr } = probe('/nonexistent/protected-validation-command', [
    'sensitive-fixture-argument',
  ]);
  assert.equal(result.status, null);
  assert.equal(result.errorCode, 'ENOENT');
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.equal(diagnostics[1].errorCode, 'ENOENT');
  assert.doesNotMatch(stderr, /nonexistent|sensitive-fixture-argument/);
});

test('bounded runner rejects completed output above the accepted read limit', () => {
  const { result, diagnostics } = probe(
    process.execPath,
    ['-e', "process.stdout.write('x'.repeat(65)); process.stderr.write('kept');"],
    { maxBuffer: 64 },
  );
  assert.equal(result.status, 0);
  assert.equal(result.errorCode, 'ENOBUFS');
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'kept');
  assert.equal(diagnostics[1].errorCode, 'ENOBUFS');
});

test('bounded runner kills a SIGTERM-ignoring orphan after its successful parent exits', (t) => {
  const root = mkdtempSync(resolve(tmpdir(), 'protected-validation-orphan-'));
  const pidPath = resolve(root, 'child.pid');
  t.after(() => {
    if (existsSync(pidPath)) {
      try {
        process.kill(Number(readFileSync(pidPath, 'utf8')), 'SIGKILL');
      } catch {}
    }
    rmSync(root, { recursive: true, force: true });
  });
  const child = `const fs = require('node:fs'); process.on('SIGTERM', () => {}); fs.writeFileSync(${JSON.stringify(pidPath)}, String(process.pid)); setInterval(() => {}, 1000);`;
  const parent = `
    const fs = require('node:fs');
    require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(child)}], {stdio: 'inherit'}).unref();
    const deadline = Date.now() + 1000;
    while (!fs.existsSync(${JSON.stringify(pidPath)})) {
      if (Date.now() > deadline) throw Error('child startup failed');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
    process.stdout.write('parent complete');
  `;
  const { result, diagnostics } = probe(process.execPath, ['-e', parent]);
  assert.equal(result.status, 0);
  assert.equal(result.errorCode, null);
  assert.equal(result.stdout, 'parent complete');
  assert.equal(diagnostics[1].exitCode, 0);
  assert.equal(existsSync(pidPath), true);
  const childPid = Number(readFileSync(pidPath, 'utf8'));
  assert.throws(() => process.kill(childPid, 0), { code: 'ESRCH' });
});
