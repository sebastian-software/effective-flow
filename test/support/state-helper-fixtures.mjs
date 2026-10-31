// Fixtures shared by the unit tests of the runtime-state helper's `memory` and `harness`
// operations: a directory that looks like a main checkout to a fake git runner, the runner itself,
// a deterministic clock, and envelope assertions.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { executeOperation } from '../../src/scripts/effective-flow-state-core.mjs';

// A directory that looks like the main checkout to `fakeGit` below.
export function fakeRoot(t, prefix = 'effective-flow-state-unit-') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.git'));
  return root;
}

// Answers the git calls of the root check, the guards and `git worktree list`. `overrides` replaces
// one answer by command key (`toplevel`, `common`, `gitdir`, or the git subcommand) and receives
// the git arguments and the call's stdin; returning undefined falls back to the default answer.
export function fakeGit(root, overrides = {}) {
  const calls = [];
  const runner = async (call) => {
    calls.push(call);
    const args = call.args.slice(2);
    const key = args.includes('--show-toplevel')
      ? 'toplevel'
      : args.includes('--git-common-dir')
        ? 'common'
        : args.includes('--git-dir')
          ? 'gitdir'
          : args[0];
    const overridden = overrides[key]?.(args, call.stdin);
    if (overridden) return overridden;
    switch (key) {
      case 'toplevel':
        return { status: 0, stdout: `${root}\n`, stderr: '' };
      case 'common':
      case 'gitdir':
        return { status: 0, stdout: `${join(root, '.git')}\n`, stderr: '' };
      case 'ls-files':
        return { status: 0, stdout: '', stderr: '' };
      case 'check-ignore':
        // A batched `--stdin` probe reports every input path as ignored by echoing it back.
        return {
          status: 0,
          stdout: args.includes('--stdin') ? String(call.stdin ?? '') : '',
          stderr: '',
        };
      case 'worktree':
        return { status: 0, stdout: `worktree ${root}\0HEAD 0000\0branch refs/heads/main\0\0` };
      default:
        throw new Error(`unexpected git call: ${args.join(' ')}`);
    }
  };
  return { runner, calls };
}

// A runner that must never be reached: these inputs fail before any git call.
export function unreachableRunner() {
  return () => {
    throw new Error('git must not run for this input');
  };
}

// A deterministic clock for the bounded wait: `sleep` advances it instead of waiting.
export function fakeClock() {
  const clock = { time: 0, sleeps: [] };
  clock.monotonicNow = () => clock.time;
  clock.sleep = async (ms) => {
    clock.sleeps.push(ms);
    clock.time += ms;
    await clock.onSleep?.();
  };
  return clock;
}

export function run(operation, input, deps) {
  return executeOperation(operation, input, deps);
}

export function expectOk(envelope) {
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  return envelope.result;
}

export function expectOutcome(envelope, code) {
  assert.equal(envelope.ok, false, JSON.stringify(envelope));
  assert.equal(envelope.outcome?.code, code, JSON.stringify(envelope));
  return envelope.outcome;
}

export function expectError(envelope, code) {
  assert.equal(envelope.ok, false, JSON.stringify(envelope));
  assert.equal(envelope.error?.code, code, JSON.stringify(envelope));
  assert.equal(typeof envelope.error.message, 'string');
  return envelope.error;
}
