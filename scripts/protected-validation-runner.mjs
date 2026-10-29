// Maintenance-only bounded subprocess adapter; never writes accepted proof records.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  mkdtempSync,
  openSync,
  closeSync,
  writeFileSync,
  readFileSync,
  statSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { stopValidationProcessGroup } from './protected-validation-watchdog.mjs';
const diagnostic = (event) =>
  process.stderr.write('EF_PROTECTED_VALIDATION_PROCESS ' + JSON.stringify(event) + '\n');
export function boundedSpawnSync(command, args, options = {}) {
  const {
    timeout = 120000,
    timeoutMs = timeout,
    maxBuffer = 64 * 1024 * 1024,
    encoding = null,
    input = Buffer.alloc(0),
    operation = 'command',
    diagnosticKind = 'PROCESS',
    cwd,
    env = process.env,
  } = options;
  if (process.platform === 'win32') throw new Error('POSIX validation process groups required');
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 900000 ||
    !Number.isSafeInteger(maxBuffer) ||
    maxBuffer < 1 ||
    maxBuffer > 80 * 1024 * 1024 ||
    !/^[a-z][a-z0-9-]{0,63}$/.test(operation) ||
    !['PROCESS', 'MATERIALIZATION'].includes(diagnosticKind)
  )
    throw new Error('invalid bounded validation subprocess options');
  const operationId = randomUUID(),
    started = performance.now();
  diagnostic({ operationId, operation, phase: 'start', timeoutMs });
  const spool = mkdtempSync(resolve(tmpdir(), 'protected-validation-process-'));
  const descriptors = [];
  let result;
  try {
    const stdin = resolve(spool, 'stdin');
    writeFileSync(stdin, input, { flag: 'wx', mode: 0o600 });
    descriptors.push(openSync(stdin, 'r'));
    for (const name of ['stdout', 'stderr'])
      descriptors.push(openSync(resolve(spool, name), 'wx', 0o600));
    // SIGKILL bounds the leader. File-backed descriptors prevent descendant pipe
    // ownership from extending spawnSync's wait; the group watchdog runs next.
    result = spawnSync(command, args, {
      cwd,
      env,
      detached: true,
      stdio: descriptors,
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
      windowsHide: true,
    });
    stopValidationProcessGroup(result.pid);
    [result.stdout, result.stderr] = ['stdout', 'stderr'].map((name) => {
      const path = resolve(spool, name);
      let bytes;
      if (statSync(path).size > maxBuffer) {
        result.error ??= Object.assign(new Error('validation subprocess output exceeds limit'), {
          code: 'ENOBUFS',
        });
        bytes = Buffer.alloc(0);
      } else bytes = readFileSync(path);
      return encoding ? bytes.toString(encoding) : bytes;
    });
    const elapsedMs = Math.ceil(performance.now() - started),
      timedOut = result.error?.code === 'ETIMEDOUT';
    diagnostic({
      operationId,
      operation,
      phase: 'end',
      elapsedMs,
      timeoutMs,
      timedOut,
      exitCode: result.status,
      signal: result.signal,
      errorCode: result.error?.code ?? null,
    });
    if (timedOut)
      process.stderr.write(
        `EF_PROTECTED_VALIDATION_${diagnosticKind}_TIMEOUT operation=${operation} operationId=${operationId} timeoutMs=${timeoutMs} elapsedMs=${elapsedMs}\n`,
      );
    return result;
  } catch (error) {
    diagnostic({
      operationId,
      operation,
      phase: 'end',
      elapsedMs: Math.ceil(performance.now() - started),
      timeoutMs,
      timedOut: result?.error?.code === 'ETIMEDOUT',
      exitCode: result?.status ?? null,
      errorCode: 'TERMINATION_OR_RUNNER_FAILURE',
    });
    throw error;
  } finally {
    for (const descriptor of descriptors) closeSync(descriptor);
    rmSync(spool, { recursive: true, force: true });
  }
}
export function boundedExecFileSync(command, args, options = {}) {
  const result = boundedSpawnSync(command, args, options);
  if (result.error || result.status !== 0) {
    const error = new Error(
      'validation operation failed: ' +
        (options.operation ?? 'command') +
        (result.stderr?.length ? '\n' + result.stderr.toString('utf8') : ''),
      { cause: result.error },
    );
    Object.assign(error, {
      code: result.error?.code,
      status: result.status,
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr,
    });
    throw error;
  }
  return result.stdout;
}
