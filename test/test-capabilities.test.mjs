import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLI = path.join(ROOT, 'scripts', 'test-capabilities.mjs');
const PACKAGE_JSON = path.join(ROOT, 'package.json');

function runCli(args = [], env = {}) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

function parseSingleJson(stdout) {
  const text = stdout.trim();
  assert.notEqual(text, '', 'the capability probe must emit JSON on stdout');
  const report = JSON.parse(text);
  assert.equal(typeof report, 'object');
  assert.equal(report.operation, 'test-capabilities');
  assert.equal(typeof report.ok, 'boolean');
  assert.ok(Array.isArray(report.checks));
  return report;
}

function check(report, id) {
  const result = report.checks.find((entry) => entry.id === id);
  assert.ok(result, `missing ${id} check`);
  return result;
}

test('host probe reports a successful, cleaned temporary-directory capability', (t) => {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'effective-flow-capabilities-'));
  t.after(() => rmSync(tmpRoot, { recursive: true, force: true }));

  const result = runCli([], { TMPDIR: tmpRoot });
  assert.equal(result.status, 0, result.stderr);
  const report = parseSingleJson(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(check(report, 'temporary-directory').status, 'passed');
  assert.equal(check(report, 'loopback-tcp').status, 'passed');
  if (process.platform === 'darwin') {
    assert.equal(check(report, 'macos-sandbox').status, 'passed');
  } else {
    assert.equal(check(report, 'macos-sandbox').status, 'not-applicable');
  }
  assert.equal(statSync(tmpRoot).isDirectory(), true);
  assert.deepEqual(
    requireDirectoryEntries(tmpRoot),
    [],
    'the probe must clean its temporary fixture before returning',
  );
});

test('a file-valued TMPDIR is an observable blocked environment', (t) => {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'effective-flow-capabilities-blocked-'));
  const filePath = path.join(parent, 'tmp-file');
  writeFileSync(filePath, 'fixture');
  t.after(() => rmSync(parent, { recursive: true, force: true }));

  const result = runCli([], { TMPDIR: filePath });
  assert.equal(result.status, 1, result.stderr);
  const report = parseSingleJson(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(check(report, 'temporary-directory').status, 'failed');
  assert.equal(report.error?.code, 'TEST_ENVIRONMENT_UNSUPPORTED');
  assert.equal(readFileSync(filePath, 'utf8'), 'fixture');
});

test('invalid arguments fail with the CLI validation exit code', () => {
  const result = runCli(['--skip']);
  assert.equal(result.status, 2);
  const report = parseSingleJson(result.stdout);
  assert.equal(report.ok, false);
});

test('package test runs the capability guard before the existing node test suite', () => {
  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
  assert.equal(packageJson.scripts['test:preflight'], 'node scripts/test-capabilities.mjs');
  assert.match(packageJson.scripts.test, /^node scripts\/test-capabilities\.mjs && node --test$/);
  assert.doesNotMatch(packageJson.scripts.test, /--test-name-pattern|skip/);
});

test(
  'macOS sandbox probe observes an outer seatbelt denial',
  { skip: process.platform !== 'darwin' },
  (t) => {
    const root = realpathSync(
      mkdtempSync(path.join(os.tmpdir(), 'effective-flow-capabilities-seatbelt-')),
    );
    const canary = path.join(root, 'protected-canary');
    writeFileSync(canary, 'protected');
    t.after(() => rmSync(root, { recursive: true, force: true }));

    const profile = [
      '(version 1)',
      '(deny default)',
      '(allow process-exec)',
      '(allow process-fork)',
      '(allow sysctl-read)',
      '(allow file-read*)',
      `(allow file-write* (subpath "${root}"))`,
      `(deny file-write* (literal "${canary}"))`,
    ].join('');
    const result = spawnSync('/usr/bin/sandbox-exec', ['-p', profile, process.execPath, CLI], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, TMPDIR: root },
    });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 1, result.stderr);
    const report = parseSingleJson(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(check(report, 'temporary-directory').status, 'passed');
    assert.equal(check(report, 'macos-sandbox').status, 'failed');
    assert.match(check(report, 'macos-sandbox').message, /sandbox_apply: Operation not permitted/);
    assert.equal(report.error?.code, 'TEST_ENVIRONMENT_UNSUPPORTED');
    assert.equal(readFileSync(canary, 'utf8'), 'protected');
  },
);

function requireDirectoryEntries(directory) {
  return readdirSync(directory);
}
