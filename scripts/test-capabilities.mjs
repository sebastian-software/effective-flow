#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const TIMEOUT_MS = 5_000;
const CANARY_CONTENT = 'effective-flow sandbox capability canary\n';
const DENIED_SENTINEL = 'effective-flow-write-denied';
const checks = [
  { id: 'temporary-directory', status: 'not-run' },
  { id: 'loopback-tcp', status: 'not-run' },
  { id: 'macos-sandbox', status: 'not-run' },
];

function diagnostic(error) {
  return error instanceof Error ? error.message : String(error);
}

function failed(check, message) {
  Object.assign(check, { status: 'failed', message });
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

await main();
