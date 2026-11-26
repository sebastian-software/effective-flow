import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';

import { createProcessRunner } from '../src/scripts/process-runner.mjs';
import { main } from '../src/scripts/remote-tracker.mjs';

const BODY = "Übersicht: l'équipe 👋\n".repeat(500);
const REPOSITORY = {
  host: 'code.example.test',
  owner: 'team',
  repository: 'flow',
  slug: 'team/flow',
  provider: 'forgejo',
  login: 'work',
};
const runGit = createProcessRunner();

function git(cwd, args) {
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], {
    cwd,
    stdio: 'ignore',
  });
}

function repository(context) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'remote-tracker-input-')));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-q']);
  writeFileSync(join(root, '.gitignore'), '.effective-flow/\n');
  return root;
}

function inputDirectory(root) {
  return join(root, '.effective-flow', 'remote-tracker', 'inputs');
}

function writeInput(root, input, index = 1, bytes = JSON.stringify(input)) {
  const directory = inputDirectory(root);
  mkdirSync(directory, { recursive: true });
  const digest = createHash('sha256').update(bytes).digest('hex');
  const inputFile = join(directory, `test-${index}-${digest}.json`);
  writeFileSync(inputFile, bytes);
  return { inputFile };
}

function comment(cwd) {
  return { cwd, repository: REPOSITORY, number: 17, payload: { body: BODY } };
}

async function call(argv, input, afterGit) {
  const stdout = [];
  const forge = [];
  let exitCode;
  const envelope = await main(argv, {
    input,
    stdout: { write: (line) => stdout.push(line) },
    setExitCode: (code) => (exitCode = code),
    skipProbe: true,
    runner: async (command) => {
      if (command.executable === 'git') {
        const result = await runGit(command);
        afterGit?.(command);
        return result;
      }
      forge.push(command);
      return {
        status: 0,
        stdout: '{"id":641}',
        stderr: 'HTTP/1.1 201 Created\r\nContent-Type: application/json\r\n\r\n',
      };
    },
  });
  assert.equal(stdout.length, 1);
  return { envelope, stdout: stdout[0], exitCode, forge };
}

function refused(result) {
  assert.equal(result.exitCode, 1);
  assert.equal(result.envelope.error?.code, 'INVALID_PAYLOAD');
  assert.match(result.envelope.error.message, /\.effective-flow\/remote-tracker\/inputs\//);
  assert.deepEqual(result.forge, []);
}

test('file and inline envelopes match, and only the named input is consumed', async (context) => {
  const root = repository(context);
  const sibling = writeInput(root, { cwd: root, body: 'untouched' }, 2);
  for (const [operation, input] of [
    ['body-hash', { cwd: root, body: BODY }],
    ['planning-comment-build', { cwd: root, body: BODY }],
    ['issue-comment', comment(root)],
  ]) {
    const reference = writeInput(root, input);
    const inline = await call([operation], input);
    const fromFile = await call([operation], reference);
    assert.equal(inline.envelope.ok, true, JSON.stringify(inline.envelope.error));
    assert.equal(fromFile.stdout, inline.stdout);
    assert.deepEqual(fromFile.forge, []);
    assert.equal(existsSync(reference.inputFile), operation === 'issue-comment');
    assert.equal(existsSync(sibling.inputFile), true);
    if (operation === 'issue-comment') {
      const applied = await call([operation, '--apply'], reference);
      assert.equal(applied.envelope.ok, true, JSON.stringify(applied.envelope.error));
      assert.equal(applied.forge.length, 1);
      assert.equal(existsSync(reference.inputFile), false);
    }
  }
});

test('the exact same apply reference refuses any changed bytes after preview', async (context) => {
  const root = repository(context);
  const reference = writeInput(root, comment(root));
  const preview = await call(['issue-comment'], reference);
  assert.equal(preview.envelope.ok, true);
  const changed = `${readFileSync(reference.inputFile, 'utf8')}\n`;
  writeFileSync(reference.inputFile, changed);
  refused(await call(['issue-comment', '--apply'], reference));
  assert.equal(readFileSync(reference.inputFile, 'utf8'), changed);
});

test('a removed or replaced target before consumption is not dispatched', async (context) => {
  const root = repository(context);
  for (const replacement of [false, true]) {
    const reference = writeInput(root, comment(root));
    let ignoreChecks = 0;
    refused(
      await call(['issue-comment', '--apply'], reference, ({ args }) => {
        if (!args.includes('check-ignore') || ++ignoreChecks !== 4) return;
        const bytes = readFileSync(reference.inputFile);
        renameSync(reference.inputFile, `${reference.inputFile}.old`);
        if (replacement) writeFileSync(reference.inputFile, bytes);
      }),
    );
    assert.equal(ignoreChecks, 4);
    assert.equal(existsSync(reference.inputFile), replacement);
  }
});

test('paths outside the exact directory, symlinks and over-limit files are refused', async (context) => {
  const root = repository(context);
  const input = comment(root);
  const reference = writeInput(root, input);
  const inputFile = reference.inputFile;
  const filename = basename(inputFile);
  const foreign = join(root, filename);
  writeFileSync(foreign, JSON.stringify(input));
  const symlink = join(dirname(inputFile), filename.replace('test-1-', 'test-2-'));
  symlinkSync(inputFile, symlink, 'file');
  const large = writeInput(root, input, 3);
  truncateSync(large.inputFile, 16 * 1024 * 1024 + 1);
  const unhashed = join(dirname(inputFile), 'unhashed.json');
  writeFileSync(unhashed, JSON.stringify(input));
  const other = repository(context);
  const otherInputs = inputDirectory(other);
  mkdirSync(dirname(otherInputs), { recursive: true });
  symlinkSync(dirname(inputFile), otherInputs, 'dir');
  for (const candidate of [
    filename,
    foreign,
    `${dirname(inputFile)}/../inputs/${filename}`,
    symlink,
    large.inputFile,
    unhashed,
    join(otherInputs, filename),
  ]) {
    refused(await call(['issue-comment'], { inputFile: candidate }));
  }
  for (const kept of [inputFile, foreign, symlink, large.inputFile, unhashed, otherInputs]) {
    assert.equal(existsSync(kept), true);
  }
});

test('dry run retains invalid JSON and rejects unignored or linked roots', async (context) => {
  const root = repository(context);
  const invalidJson = writeInput(root, null, 1, "don't expose this JSON parse error");
  const array = writeInput(root, [], 2);
  for (const reference of [invalidJson, array]) {
    const result = await call(['issue-comment'], reference);
    refused(result);
    assert.doesNotMatch(result.stdout, /expose this/);
    assert.equal(existsSync(reference.inputFile), true);
  }
  const unignored = writeInput(root, comment(root));
  writeFileSync(join(root, '.gitignore'), '');
  refused(await call(['issue-comment'], unignored));
  assert.equal(existsSync(unignored.inputFile), true);
  writeFileSync(join(root, '.gitignore'), '.effective-flow/\n');
  git(root, ['add', '.gitignore']);
  git(root, ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture']);
  const linked = join(root, 'linked');
  git(root, ['worktree', 'add', '--detach', linked]);
  const linkedInput = writeInput(linked, comment(root));
  refused(await call(['issue-comment'], linkedInput));
  assert.equal(existsSync(linkedInput.inputFile), true);
});

test('only the single-key wrapper resolves an input file', async (context) => {
  const root = repository(context);
  const reference = writeInput(root, comment(root));
  const result = await call(['issue-comment', '--apply'], {
    ...reference,
    cwd: root,
    repository: REPOSITORY,
  });
  assert.equal(result.envelope.error?.code, 'INVALID_REFERENCE');
  assert.match(result.envelope.error.message, /number/);
  assert.deepEqual(result.forge, []);
  assert.equal(existsSync(reference.inputFile), true);
});

test('a consuming call removes verified input before later validation fails', async (context) => {
  const root = repository(context);
  const reference = writeInput(root, { cwd: root, repository: REPOSITORY });
  const result = await call(['issue-comment', '--apply'], reference);
  assert.equal(result.envelope.error?.code, 'INVALID_REFERENCE');
  assert.deepEqual(result.forge, []);
  assert.equal(existsSync(reference.inputFile), false);
});
