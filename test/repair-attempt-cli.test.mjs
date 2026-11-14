// Invariants protected: the repair-attempt CLI writes exactly one `{ ok, operation, data }` envelope
// line, takes its input only from stdin, refuses an unknown operation with exit code 2 before
// reading stdin, and runs its git reads through the injected process runner with replace refs off.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { main } from '../src/scripts/repair-attempt.mjs';

const CLI = fileURLToPath(new URL('../src/scripts/repair-attempt.mjs', import.meta.url));
const sha = (n) => n.toString(16).padStart(40, '0');
const SCOPE = { mergeBase: sha(1), head: sha(2), paths: ['src/a.mjs'] };

function sink() {
  let value = '';
  return {
    write: (chunk) => (value += chunk),
    get value() {
      return value;
    },
  };
}

test('the CLI answers scope-check with one envelope line on stdout', () => {
  const result = spawnSync(process.execPath, [CLI, 'scope-check'], {
    input: JSON.stringify({ scope: SCOPE, changes: [{ status: 'A', path: 'test/x.test.mjs' }] }),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    ok: true,
    operation: 'scope-check',
    data: { status: 'in-scope', outside: [], undetermined: [] },
  });
});

test('an unknown operation exits 2 without waiting on stdin', () => {
  const result = spawnSync(process.execPath, [CLI, '--help'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 2);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'INVALID_INPUT');
  assert.match(result.stderr, /^INVALID_INPUT: usage: repair-attempt\.mjs </);
});

test('main runs the ref-only git reads through the injected runner', async () => {
  const calls = [];
  const runner = async (call) => {
    calls.push(call);
    return { status: 0, stdout: `${sha(1)}\n`, stderr: '' };
  };
  const stdout = sink();
  let exitCode = null;
  const envelope = await main(['scope-read'], {
    input: { cwd: '/repo', base: 'develop', head: sha(2) },
    runner,
    stdout,
    stderr: sink(),
    setExitCode: (code) => (exitCode = code),
  });
  // The diff answers with a merge-base line, which is no name-status record: undetermined.
  assert.deepEqual(envelope.data, {
    status: 'undetermined',
    code: 'scope-diff-unreadable',
    delegation: 'blocked',
  });
  assert.equal(exitCode, null);
  assert.deepEqual(
    calls.map(({ executable, args, cwd }) => [executable, args[0], args[1], cwd]),
    [
      ['git', '--no-replace-objects', 'merge-base', '/repo'],
      ['git', '--no-replace-objects', 'diff', '/repo'],
    ],
  );
  assert.ok(!calls.some(({ args }) => args.includes('fetch')), 'the helper never fetches');
  assert.equal(stdout.value.split('\n').filter(Boolean).length, 1);
});
