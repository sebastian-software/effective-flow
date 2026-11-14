#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statfsSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const TIMEOUT_MS = 5_000;
const CANARY_CONTENT = 'effective-flow sandbox capability canary\n';
const DENIED_SENTINEL = 'effective-flow-write-denied';
const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..');

// Free space os.tmpdir() must offer before the suite starts.
// Measured 2026-11-14 with Node 24.22.2 on Linux, availableParallelism() 2: a full `node --test`
// (preflight bypassed) with a dedicated, initially empty TMPDIR, sampling `du -sk "$TMPDIR"` every
// 2 s. Peak 74,198 KiB. That measurement is a lower bound only: the environment masked Git, so the
// Git-dependent cases, which build temporary repositories, ended early, and a 2 s sample can miss
// a short peak. The threshold is therefore twice the measured peak, rounded up to 150 MiB, until a
// run with Git visible is measured the same way; remeasure also when the suite's temporary use
// changes.
export const MEASURED_TEMPORARY_PEAK_BYTES = 74_198 * 1024;
export const MIN_TEMPORARY_FREE_BYTES = 150 * 1024 * 1024;

const checks = [
  { id: 'temporary-directory', status: 'not-run' },
  { id: 'loopback-tcp', status: 'not-run' },
  { id: 'macos-sandbox', status: 'not-run' },
  { id: 'git-checkout', status: 'not-run' },
  { id: 'temporary-directory-space', status: 'not-run' },
];

function diagnostic(error) {
  return error instanceof Error ? error.message : String(error);
}

function failed(check, message) {
  Object.assign(check, { status: 'failed', message });
}

function mebibytes(bytes) {
  return `${Math.floor(bytes / (1024 * 1024))} MiB`;
}

// Pure decision of the free-space check, exported so a test can exercise the failing branch
// without a nearly full filesystem.
export function evaluateTemporarySpace(
  check,
  { directory, availableBytes, requiredBytes = MIN_TEMPORARY_FREE_BYTES },
) {
  if (availableBytes >= requiredBytes) {
    check.status = 'passed';
    return;
  }
  failed(
    check,
    `os.tmpdir() (${directory}) offers ${mebibytes(availableBytes)} free, below the ${mebibytes(requiredBytes)} the suite needs. Point TMPDIR at a directory with more free space before running tests.`,
  );
}

function checkTemporarySpace(check) {
  const directory = os.tmpdir();
  let availableBytes;
  try {
    const stats = statfsSync(directory);
    availableBytes = stats.bavail * stats.bsize;
  } catch (error) {
    failed(
      check,
      `Cannot read the free space of os.tmpdir() (${directory}): ${diagnostic(error)}. Provide a readable temporary directory before running tests.`,
    );
    return;
  }
  evaluateTemporarySpace(check, { directory, availableBytes });
}

function checkGitCheckout(check) {
  // The suite runs Git against this checkout; a missing binary or a hidden .git must stop here.
  const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
    maxBuffer: 64 * 1024,
    killSignal: 'SIGKILL',
  });
  if (!result.error && result.status === 0 && result.stdout.trim() === 'true') {
    check.status = 'passed';
    return;
  }
  const detail = result.error
    ? diagnostic(result.error)
    : result.stderr.replace(/\s+/g, ' ').trim().replace(/\.$/, '') ||
      `git exit ${result.status}, signal ${result.signal}`;
  failed(
    check,
    `Git cannot read the checkout at ${REPOSITORY_ROOT}: ${detail}. Run tests where Git is installed and the checkout's Git metadata is visible.`,
  );
}

async function checkLoopback(check) {
  // Bind only an ephemeral loopback port; no connection or network egress is needed.
  const server = net.createServer();
  await new Promise((resolve) => {
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) {
        failed(
          check,
          `Cannot bind and close 127.0.0.1 TCP: ${diagnostic(error)}. Run tests in an environment permitting local TCP listeners.`,
        );
      } else {
        check.status = 'passed';
      }
      resolve();
    };
    const timer = setTimeout(() => {
      server.close();
      finish(new Error('loopback listener probe timed out'));
    }, TIMEOUT_MS);
    server.once('error', finish);
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      server.close(finish);
    });
  });
}

function checkMacosSandbox(check, canary) {
  if (process.platform !== 'darwin') {
    check.status = 'not-applicable';
    return;
  }

  // A different inner policy must apply and deny a real write to our own fixture.
  const profile = `(version 1)(allow default)(deny file-write* (literal ${JSON.stringify(canary)}))`;
  const child = `
    const fs = require('node:fs');
    try {
      fs.writeFileSync(process.argv[1], 'unexpected write');
      process.exitCode = 1;
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EACCES') {
        process.stdout.write(${JSON.stringify(DENIED_SENTINEL)});
      } else {
        process.stderr.write(error.message);
        process.exitCode = 1;
      }
    }
  `;
  const result = spawnSync(
    '/usr/bin/sandbox-exec',
    ['-p', profile, process.execPath, '-e', child, canary],
    { encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 64 * 1024, killSignal: 'SIGKILL' },
  );
  const unchanged = readFileSync(canary, 'utf8') === CANARY_CONTENT;
  if (
    !result.error &&
    result.status === 0 &&
    result.signal === null &&
    result.stdout === DENIED_SENTINEL &&
    unchanged
  ) {
    check.status = 'passed';
    return;
  }

  const detail = result.error
    ? diagnostic(result.error)
    : result.stderr.trim() ||
      `child exit ${result.status}, signal ${result.signal}; denied-write proof ${result.stdout === DENIED_SENTINEL}, canary unchanged ${unchanged}`;
  failed(
    check,
    `Cannot apply a different macOS sandbox policy and prove write denial: ${detail}. Run tests in an environment that permits the native sandbox-exec integration; an outer Seatbelt policy can block this prerequisite.`,
  );
}

async function main() {
  if (process.argv.length !== 2) {
    process.stdout.write(
      `${JSON.stringify({
        ok: false,
        operation: 'test-capabilities',
        checks,
        error: {
          code: 'INVALID_ARGUMENTS',
          message: 'This prerequisite probe accepts no arguments.',
        },
      })}\n`,
    );
    process.exitCode = 2;
    return;
  }

  let fixture;
  try {
    fixture = mkdtempSync(path.join(os.tmpdir(), 'effective-flow-test-capabilities-'));
    const canary = path.join(realpathSync(fixture), 'protected-canary');
    writeFileSync(canary, CANARY_CONTENT);
    if (readFileSync(canary, 'utf8') !== CANARY_CONTENT) {
      throw new Error('temporary fixture contents could not be verified');
    }
    checks[0].status = 'passed';
    await checkLoopback(checks[1]);
    try {
      checkMacosSandbox(checks[2], canary);
    } catch (error) {
      failed(checks[2], `Cannot verify the macOS sandbox fixture: ${diagnostic(error)}`);
    }
  } catch (error) {
    failed(
      checks[0],
      `Cannot create and use a temporary directory under os.tmpdir(): ${diagnostic(error)}. Provide a writable temporary directory before running tests.`,
    );
  } finally {
    if (fixture) {
      try {
        rmSync(fixture, { recursive: true, force: true });
      } catch (error) {
        failed(checks[0], `Cannot clean the owned temporary fixture: ${diagnostic(error)}`);
      }
    }
  }
  checkGitCheckout(checks[3]);
  checkTemporarySpace(checks[4]);

  const ok = checks.every(
    (check) => check.status === 'passed' || check.status === 'not-applicable',
  );
  const report = { ok, operation: 'test-capabilities', checks };
  if (!ok) {
    report.error = {
      code: 'TEST_ENVIRONMENT_UNSUPPORTED',
      message:
        'Required test capabilities are unavailable. Resolve the failed prerequisites before running the suite; this probe does not establish full-suite correctness.',
    };
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = ok ? 0 : 1;
}

// Run only as the CLI entry; an import (the probe's own test) loads the exported decision helpers.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
