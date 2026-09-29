import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  DIFF_BASELINE_ERROR_CODES,
  DIFF_BASELINE_OPERATIONS,
  DiffBaselineError,
  MAX_SCOPE_ENTRIES,
  errorDetail,
  errorEnvelope,
  executeOperation,
  explainSkipped,
  explainUnreadable,
  exitCodeFor,
  gitBaseEnv,
  normalizeScope,
  parseNameStatus,
} from '../src/scripts/diff-baseline-core.mjs';

const CLI = fileURLToPath(new URL('../src/scripts/diff-baseline.mjs', import.meta.url));
const OID = 'a'.repeat(40);

function tempDir(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-diff-baseline-unit-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function runCli(args, stdin) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    input: typeof stdin === 'string' ? stdin : JSON.stringify(stdin),
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0' },
  });
}

function singleEnvelope(result) {
  const lines = result.stdout.trimEnd().split('\n');
  assert.equal(lines.length, 1, `expected exactly one stdout line, got ${result.stdout}`);
  return JSON.parse(lines[0]);
}

// A runner that must never be reached: input validation fails before any git call.
function unreachableRunner() {
  return () => {
    throw new Error('git must not run for invalid input');
  };
}

async function expectError(operation, input, code, deps = { runner: unreachableRunner() }) {
  const envelope = await executeOperation(operation, input, deps);
  assert.equal(envelope.ok, false, JSON.stringify(envelope));
  assert.equal(envelope.operation, operation);
  assert.equal(envelope.error.code, code, envelope.error.message);
  assert.equal(typeof envelope.error.message, 'string');
  return envelope;
}

test('operations and error codes are frozen closed sets', () => {
  assert.deepEqual([...DIFF_BASELINE_OPERATIONS], ['capture', 'render', 'discard']);
  assert.ok(Object.isFrozen(DIFF_BASELINE_OPERATIONS));
  assert.ok(Object.isFrozen(DIFF_BASELINE_ERROR_CODES));
  assert.deepEqual(
    [...DIFF_BASELINE_ERROR_CODES],
    [
      'INVALID_INPUT',
      'UNSAFE_TARGET',
      'RUNTIME_STATE_UNSAFE',
      'GIT_FAILED',
      'MISSING_OBJECT',
      'WRITE_FAILED',
      'INTERNAL_ERROR',
    ],
  );
});

test('exit codes: 2 invalid input, 3 unsafe target or write failure, 1 otherwise', () => {
  const exitFor = (code) => exitCodeFor({ ok: false, error: { code, message: '' } });
  assert.equal(exitCodeFor({ ok: true }), 0);
  assert.equal(exitFor('INVALID_INPUT'), 2);
  assert.equal(exitFor('UNSAFE_TARGET'), 3);
  assert.equal(exitFor('RUNTIME_STATE_UNSAFE'), 3);
  assert.equal(exitFor('WRITE_FAILED'), 3);
  assert.equal(exitFor('GIT_FAILED'), 1);
  assert.equal(exitFor('MISSING_OBJECT'), 1);
  assert.equal(exitFor('INTERNAL_ERROR'), 1);
  assert.equal(new DiffBaselineError('UNSAFE_TARGET', 'x').exitCode, 3);
});

test('errorEnvelope normalizes foreign errors to INTERNAL_ERROR', () => {
  assert.deepEqual(errorEnvelope('render', new Error('boom')), {
    ok: false,
    operation: 'render',
    error: { code: 'INTERNAL_ERROR', message: 'boom' },
  });
  assert.deepEqual(errorEnvelope(undefined, new DiffBaselineError('INVALID_INPUT', 'bad')), {
    ok: false,
    operation: null,
    error: { code: 'INVALID_INPUT', message: 'bad' },
  });
});

test('unknown operation and non-object input are invalid', async () => {
  await expectError('snapshot', {}, 'INVALID_INPUT');
  await expectError('capture', null, 'INVALID_INPUT');
  await expectError('capture', [], 'INVALID_INPUT');
  await expectError('render', 'text', 'INVALID_INPUT');
});

test('capture validates its input before running git', async (t) => {
  const root = tempDir(t);
  const valid = {
    cwd: root,
    executionRoot: root,
    sessionId: '20260929-005956',
    repositoryIdentity: join(root, '.git'),
  };
  await expectError('capture', { ...valid, extra: true }, 'INVALID_INPUT');
  await expectError('capture', { ...valid, cwd: 'relative/path' }, 'INVALID_INPUT');
  await expectError('capture', { ...valid, cwd: '' }, 'INVALID_INPUT');
  await expectError('capture', { ...valid, cwd: `${root}\0x` }, 'INVALID_INPUT');
  await expectError('capture', { ...valid, repositoryIdentity: 'rel' }, 'INVALID_INPUT');
  for (const sessionId of ['', '-leading', '../escape', 'a/b', 'a b', 'x'.repeat(129), 7]) {
    await expectError('capture', { ...valid, sessionId }, 'INVALID_INPUT');
  }
  await expectError('capture', { ...valid, cwd: join(root, 'missing') }, 'INVALID_INPUT');
});

test('render validates baselineTree, scope and dir before running git', async (t) => {
  const root = tempDir(t);
  const dir = join(root, '.effective-flow/runs/s/diff-baseline');
  const valid = { cwd: root, executionRoot: root, dir, baselineTree: OID };
  for (const baselineTree of ['', 'A'.repeat(40), 'a'.repeat(39), 'HEAD', 'a'.repeat(41), 1]) {
    await expectError('render', { ...valid, baselineTree }, 'INVALID_INPUT');
  }
  for (const scope of ['src', [''], ['/abs'], ['..'], ['../x'], ['a/../../x'], ['a\0b'], [1]]) {
    await expectError('render', { ...valid, scope }, 'INVALID_INPUT');
  }
  await expectError('render', { ...valid, dir: 'relative' }, 'INVALID_INPUT');
  await expectError('render', { ...valid, unknown: 1 }, 'INVALID_INPUT');
  await expectError('discard', { cwd: root, dir, executionRoot: root }, 'INVALID_INPUT');
});

test('normalizeScope keeps literal repository-relative paths', () => {
  assert.equal(normalizeScope(undefined), null);
  assert.equal(normalizeScope(null), null);
  assert.equal(normalizeScope([]), null);
  assert.deepEqual(normalizeScope(['src/', './docs/a.md', 'src', 'g*.txt', '.']), [
    'src',
    'docs/a.md',
    'g*.txt',
    '.',
  ]);
  assert.deepEqual(normalizeScope(['a/./b/../c']), ['a/c']);
  assert.throws(
    () => normalizeScope(Array.from({ length: MAX_SCOPE_ENTRIES + 1 }, (_, i) => `f${i}`)),
    (error) => error.code === 'INVALID_INPUT',
  );
});

test('parseNameStatus reads -z records, drops scores and keeps rename sources', () => {
  const raw = Buffer.from('M\0a b.txt\0R087\0old.txt\0new.txt\0D\0gone\0A\0line\nbreak\0', 'utf8');
  assert.deepEqual(parseNameStatus(raw), [
    { status: 'M', path: 'a b.txt' },
    { status: 'R', path: 'new.txt', oldPath: 'old.txt' },
    { status: 'D', path: 'gone' },
    { status: 'A', path: 'line\nbreak' },
  ]);
  assert.deepEqual(parseNameStatus(Buffer.alloc(0)), []);
});

test('parseNameStatus carries non-UTF-8 path bytes as base64', () => {
  const bytes = Buffer.from([0x66, 0xff, 0x2e, 0x74]);
  const raw = Buffer.concat([
    Buffer.from('A\0'),
    bytes,
    Buffer.from('\0R100\0'),
    bytes,
    Buffer.from('\0ok\0'),
  ]);
  const [added, renamed] = parseNameStatus(raw);
  assert.equal(added.status, 'A');
  assert.equal(added.path, 'f�.t');
  assert.equal(Buffer.from(added.pathBase64, 'base64').compare(bytes), 0);
  assert.equal(renamed.path, 'ok');
  assert.equal(renamed.pathBase64, undefined);
  assert.equal(Buffer.from(renamed.oldPathBase64, 'base64').compare(bytes), 0);
});

test('parseNameStatus fails closed on malformed output', () => {
  for (const raw of ['M\0unterminated', 'R100\0only-source\0', '1\0x\0']) {
    assert.throws(
      () => parseNameStatus(Buffer.from(raw)),
      (error) => error.code === 'GIT_FAILED',
    );
  }
});

test('gitBaseEnv strips redirections and injected configuration, and pins the locale', () => {
  const env = gitBaseEnv({
    PATH: '/bin',
    LANG: 'de_DE.UTF-8',
    LC_ALL: 'de_DE.UTF-8',
    GIT_DIR: '/elsewhere',
    GIT_INDEX_FILE: '/elsewhere/index',
    GIT_OBJECT_DIRECTORY: '/elsewhere/objects',
    GIT_LITERAL_PATHSPECS: '1',
    GIT_OPTIONAL_LOCKS: '1',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_PARAMETERS: "'core.hookspath'='/elsewhere'",
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'core.splitIndex',
    GIT_CONFIG_VALUE_0: 'true',
    GIT_CONFIG_KEY_1: 'core.hooksPath',
    GIT_CONFIG_VALUE_1: '/elsewhere',
    GIT_ATTR_SOURCE: 'HEAD~1',
    GIT_REPLACE_REF_BASE: 'refs/elsewhere/',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_SHALLOW_FILE: '/elsewhere/shallow',
  });
  assert.deepEqual(env, {
    PATH: '/bin',
    LANG: 'de_DE.UTF-8',
    LC_ALL: 'C',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
  });
});

test('errorDetail prefers the first fatal: or error: line over a leading warning', () => {
  assert.equal(
    errorDetail(Buffer.from('warning: in the working copy of a.txt\nfatal: first\nerror: later\n')),
    'fatal: first',
  );
  assert.equal(
    errorDetail(Buffer.from('hint: x\nerror: open failed\nfatal: after\n')),
    'error: open failed',
  );
  assert.equal(errorDetail(Buffer.from('\n  plain message\nsecond\n')), 'plain message');
  assert.equal(errorDetail(Buffer.alloc(0)), '');
});

test('explainUnreadable names the unreadable path and the way out', () => {
  const message = explainUnreadable(
    'error: open("dir/secret.txt"): Permission denied\n' +
      "error: unable to index file 'dir/secret.txt'\nfatal: adding files failed\n",
  );
  assert.match(message, /^git add failed: cannot read dir\/secret\.txt \(Permission denied\)/);
  assert.match(
    message,
    /ignore the file \(\.gitignore or \.git\/info\/exclude\) or fix its permissions/,
  );
  assert.match(explainUnreadable("error: unable to index file 'x'\n"), /cannot read x while/);
  assert.equal(explainUnreadable('fatal: something else\n'), undefined);
});

test('explainSkipped fails on a skipped directory or path and ignores benign warnings', () => {
  const directory = explainSkipped(
    "warning: could not open directory 'locked/': Permission denied\n",
  );
  assert.match(directory, /^git add could not read locked\/ \(Permission denied\) while/);
  assert.match(directory, /never skips a path/);
  assert.match(
    directory,
    /ignore the path \(\.gitignore or \.git\/info\/exclude\) or fix its permissions/,
  );
  assert.match(
    explainSkipped('hint: advice\r\ndir/file.txt: Permission denied\r\n'),
    /could not read dir\/file\.txt \(Permission denied\)/,
  );
  assert.equal(
    explainSkipped(
      'warning: adding embedded git repository: emb\n' +
        "hint: You've added another git repository inside your current repository.\n" +
        'hint: \tgit submodule add <url> emb\n' +
        'hint:\n' +
        "warning: in the working copy of 'a.txt', LF will be replaced by CRLF the next time Git touches it\n" +
        'error: not reached: after a failed add\n' +
        'fatal: not reached: after a failed add\n',
    ),
    undefined,
  );
  assert.equal(explainSkipped(''), undefined);
  assert.equal(explainSkipped(undefined), undefined);
});

test('a git failure while resolving cwd is reported as an unsafe target', async (t) => {
  const root = tempDir(t);
  const calls = [];
  const runner = async (call) => {
    calls.push(call);
    return { status: 128, stdout: Buffer.alloc(0), stderr: Buffer.from('fatal: not a repo\n') };
  };
  const envelope = await expectError(
    'discard',
    { cwd: root, dir: join(root, '.effective-flow/runs/s/diff-baseline') },
    'UNSAFE_TARGET',
    { runner, env: { PATH: process.env.PATH } },
  );
  assert.match(envelope.error.message, /not inside a git working tree/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].executable, 'git');
  assert.deepEqual(calls[0].args.slice(0, 2), ['-C', root]);
  assert.equal(calls[0].env.GIT_OPTIONAL_LOCKS, '0');
});

test('CLI: usage errors write one envelope line, CODE: message on stderr, exit 2', () => {
  for (const args of [[], ['capture', 'extra'], ['unknown']]) {
    const result = runCli(args, '{}');
    assert.equal(result.status, 2, result.stderr);
    const envelope = singleEnvelope(result);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.error.code, 'INVALID_INPUT');
    assert.match(
      result.stderr,
      /^INVALID_INPUT: usage: diff-baseline\.mjs <capture\|render\|discard>/,
    );
  }
});

test('CLI: malformed stdin is invalid input', () => {
  for (const stdin of ['not json', '[]', 'null', '"text"']) {
    const result = runCli(['render'], stdin);
    assert.equal(result.status, 2);
    const envelope = singleEnvelope(result);
    assert.deepEqual(Object.keys(envelope), ['ok', 'operation', 'error']);
    assert.equal(envelope.operation, 'render');
    assert.equal(envelope.error.code, 'INVALID_INPUT');
    assert.match(result.stderr, /^INVALID_INPUT: /);
  }
});

test('CLI: a validation error maps to its exit code without touching the filesystem', (t) => {
  const root = tempDir(t);
  const result = runCli(['capture'], {
    cwd: root,
    executionRoot: root,
    sessionId: '../escape',
    repositoryIdentity: join(root, '.git'),
  });
  assert.equal(result.status, 2);
  assert.equal(singleEnvelope(result).error.code, 'INVALID_INPUT');
});

test('CLI: a directory outside any repository is an unsafe target (exit 3)', (t) => {
  const root = tempDir(t);
  const result = runCli(['discard'], {
    cwd: root,
    dir: join(root, '.effective-flow/runs/s/diff-baseline'),
  });
  assert.equal(result.status, 3, result.stderr);
  assert.equal(singleEnvelope(result).error.code, 'UNSAFE_TARGET');
});

// The shipped half of the lazy wiring: every target carries the rendered pointer in the three
// consuming tools and ships the fragment it names. The build runs into a private output root, so
// the test never reads or races the checkout's own `dist/`.
test('every target renders the diff-baseline pointer and ships the fragment', (t) => {
  const outputRoot = tempDir(t);
  const build = spawnSync(process.execPath, ['build.mjs'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    env: {
      ...process.env,
      EFFECTIVE_FLOW_BUILD_GIT_HASH: 'diff-baseline-test',
      EFFECTIVE_FLOW_BUILD_OUTPUT_ROOT: outputRoot,
    },
  });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
  const pointer = '**Load on demand:** Read `shared/diff-baseline.md`';
  for (const target of ['claude', 'codex', 'portable']) {
    const skill = join(outputRoot, 'dist', target, 'effective-flow');
    for (const tool of ['build', 'fix', 'refactor']) {
      const body = readFileSync(join(skill, 'tools', `${tool}.md`), 'utf8');
      assert.equal(body.split(pointer).length - 1, 1, `${target} tools/${tool}.md pointer`);
      assert.doesNotMatch(body, /```lazy-include/, `${target} tools/${tool}.md`);
    }
    const fragment = join(skill, 'shared', 'diff-baseline.md');
    assert.ok(existsSync(fragment), `${target} must ship shared/diff-baseline.md`);
    const shipped = readFileSync(fragment, 'utf8');
    assert.match(shipped, /^## Diff baseline$/m, target);
    assert.doesNotMatch(shipped, /```(?:lazy-)?include|\{\{(?:SKILL|AGENT):/, target);
    assert.match(shipped, /scripts\/diff-baseline\.mjs/, target);
  }
});
