import { spawn } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { delimiter, resolve } from 'node:path';

const DEFAULT_PYTHON_TIMEOUT = 150_000;

export function pythonCaseBudgets(identity) {
  return identity ===
    'test_remaining_stage_composed.ComposedRemainingStageContracts.test_real_six_worker_recovery_preserves_original_closures_and_next_batch_gate'
    ? { pythonTimeout: 210_000, nodeTimeout: 240_000 }
    : { pythonTimeout: DEFAULT_PYTHON_TIMEOUT, nodeTimeout: 180_000 };
}

const activeRuns = new Set();
let ownerExitCode;
const ownerSignalHandlers = new Map(
  [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ].map(([signal, exitCode]) => [
    signal,
    () => {
      ownerExitCode ??= exitCode;
      process.exitCode = ownerExitCode;
      for (const cancel of activeRuns) cancel(signal);
    },
  ]),
);

function trackRun(cancel) {
  activeRuns.add(cancel);
  if (activeRuns.size === 1) {
    for (const [signal, handler] of ownerSignalHandlers) process.on(signal, handler);
  }
}

function releaseRun(cancel) {
  activeRuns.delete(cancel);
  if (activeRuns.size) return;
  for (const [signal, handler] of ownerSignalHandlers) process.off(signal, handler);
  if (ownerExitCode !== undefined) process.exit(ownerExitCode);
}

const discovery = `import json, sys, unittest
loader = unittest.TestLoader()
suite = loader.discover(sys.argv[1], pattern='test_*.py')
if loader.errors:
    raise RuntimeError('Python unittest discovery failed:\\n' + '\\n'.join(loader.errors))
def cases(suite):
    for item in suite:
        if isinstance(item, unittest.TestSuite):
            yield from cases(item)
        else:
            yield item.id()
identities = list(cases(suite))
if not identities:
    raise RuntimeError('No Python unittest cases discovered')
print(json.dumps(identities))
`;

function runPython(
  root,
  args,
  { timeout = DEFAULT_PYTHON_TIMEOUT, killGrace = 1_000, signal, capture = false } = {},
) {
  return new Promise((resolveRun, rejectRun) => {
    if (ownerExitCode !== undefined) {
      rejectRun(new Error('Python unittest owner is shutting down'));
      return;
    }
    if (signal?.aborted) {
      rejectRun(signal.reason);
      return;
    }
    const driverDirectory = resolve(root, 'evals/host-driver');
    const testsDirectory = resolve(driverDirectory, 'tests');
    const child = spawn('python3', ['-B', ...args], {
      cwd: root,
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONPATH: [testsDirectory, driverDirectory, process.env.PYTHONPATH]
          .filter(Boolean)
          .join(delimiter),
      },
      detached: true,
      stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit'],
    });
    let output = '';
    let failure;
    let closed = false;
    let cleanupStarted = false;
    let cleanupComplete = false;
    let settled = false;
    let exitCode;
    let exitSignal;
    child.stdout?.setEncoding('utf8').on('data', (chunk) => {
      output += chunk;
    });
    const finish = () => {
      if (settled || !closed || !cleanupComplete) return;
      settled = true;
      clearTimeout(deadline);
      signal?.removeEventListener('abort', abort);
      if (failure) {
        failure.status = exitCode;
        failure.signal = exitSignal;
        rejectRun(failure);
      } else if (exitCode !== 0) {
        rejectRun(
          Object.assign(new Error(`Python unittest exited with ${exitSignal ?? exitCode}`), {
            status: exitCode,
            signal: exitSignal,
          }),
        );
      } else {
        resolveRun(output);
      }
      releaseRun(abortOwner);
    };
    const killGroup = (requestedSignal) => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, requestedSignal);
      } catch (error) {
        if (error.code !== 'ESRCH') failure ??= error;
      }
    };
    const cleanup = () => {
      if (cleanupStarted) return;
      cleanupStarted = true;
      if (!child.pid) {
        cleanupComplete = true;
        finish();
        return;
      }
      try {
        process.kill(-child.pid, 0);
      } catch (error) {
        if (error.code !== 'ESRCH') failure ??= error;
        cleanupComplete = true;
        finish();
        return;
      }
      killGroup('SIGTERM');
      setTimeout(() => {
        killGroup('SIGKILL');
        const stopDeadline = Date.now() + killGrace;
        const checkStopped = () => {
          let running = false;
          try {
            process.kill(-child.pid, 0);
            running = true;
            if (process.platform === 'linux') {
              running = readdirSync('/proc').some((entry) => {
                if (!/^\d+$/.test(entry)) return false;
                try {
                  const stat = readFileSync(`/proc/${entry}/stat`, 'utf8');
                  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
                  return Number(fields[2]) === child.pid && !['Z', 'X'].includes(fields[0]);
                } catch (error) {
                  if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error;
                  return false;
                }
              });
            }
          } catch (error) {
            if (error.code !== 'ESRCH') failure ??= error;
          }
          if (running && Date.now() < stopDeadline) {
            setTimeout(checkStopped, 10);
            return;
          }
          if (running) failure ??= new Error('Python unittest process group did not stop');
          cleanupComplete = true;
          finish();
        };
        checkStopped();
      }, killGrace);
    };
    const terminate = (error) => {
      failure ??= error;
      cleanup();
    };
    const abort = () =>
      terminate(
        Object.assign(new Error('Python unittest aborted', { cause: signal.reason }), {
          code: 'ABORT_ERR',
        }),
      );
    const abortOwner = (ownerSignal) =>
      terminate(
        Object.assign(new Error(`Python unittest owner received ${ownerSignal}`), {
          code: 'ABORT_ERR',
        }),
      );
    const deadline = setTimeout(
      () =>
        terminate(
          Object.assign(new Error(`Python unittest timed out after ${timeout} ms`), {
            code: 'ETIMEDOUT',
          }),
        ),
      timeout,
    );
    signal?.addEventListener('abort', abort, { once: true });
    trackRun(abortOwner);
    child.on('error', (error) => {
      failure ??= error;
    });
    child.on('exit', cleanup);
    child.on('close', (code, childSignal) => {
      closed = true;
      exitCode = code;
      exitSignal = childSignal;
      cleanup();
      finish();
    });
  });
}

export async function discoverPythonCases(root) {
  const output = await runPython(
    root,
    ['-c', discovery, resolve(root, 'evals/host-driver/tests')],
    { capture: true },
  );
  const identities = JSON.parse(output);
  if (
    !Array.isArray(identities) ||
    !identities.length ||
    identities.some((identity) => typeof identity !== 'string' || !identity)
  ) {
    throw new Error('Invalid Python unittest discovery result');
  }
  return identities;
}

export function runPythonCase(root, identity, options) {
  return runPython(root, ['-m', 'unittest', '-v', identity], options);
}
