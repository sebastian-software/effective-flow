// The shared process runner of the shipped CLI entries.
//
// A CLI entry (`remote-tracker.mjs`, `plan-publication.mjs`) imports `createProcessRunner` and
// injects the runner it returns into its core; no `-core.mjs` module imports this file, so every
// core stays testable with a fake runner and never spawns a process on its own.
//
// A call is `{ executable, args, stdin, cwd, env, timeoutMs, stdoutBuffer, processGroup }`.
// `stdin` is a string or a `Buffer`. The result is `{ status, signal, stdout, stderr }`, plus
// `forcedKill: true` when a bounded child had to be killed with SIGKILL, or
// `{ status: null, stdout, stderr, error }` when the child could not be started. `stdout` and `stderr` are UTF-8 strings, except that a call with
// `stdoutBuffer: true` receives `stdout` as the raw `Buffer`, so a caller reading Git blob bytes
// sees invalid UTF-8 or a NUL byte exactly as stored instead of a decoded replacement character.
//
// A bounded call may add `processGroup: true`. The child then starts as the leader of its own
// process group, and its bound stops the whole group: SIGTERM at `timeoutMs`, SIGKILL after the
// grace period. Such a result also carries `timedOut: true` when the bound fired while the leader
// was still running, and it settles once the group was killed even if a descendant that left the
// group still holds a pipe open. A leader that exited on its own before the bound keeps its real
// status and no `timedOut`: when the bound finds only a descendant holding the pipes, the members
// left in the group are killed and the result settles after a short drain. Without the option a
// bound stops only the direct child, and the result settles when its pipes close, exactly as before.
//
// Windows has no POSIX process groups: there `processGroup` is ignored and the call falls back to
// the direct mode, so the bound stops only the direct child, and a descendant that inherited its
// pipes is not reached.
//
// `terminateActiveProcessGroups(signal)` signals every group-mode call still in flight; a CLI entry
// calls it on SIGINT, SIGTERM and exit, because a detached group does not receive the terminal's
// signals with the CLI.

import process from 'node:process';
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';

// A spawn against a missing working directory and a spawn of a missing executable both surface as
// ENOENT with the executable in `error.path`, so the core could not tell them apart. Detect the
// unusable directory here, at the single I/O boundary, and report it under its own code.
function isUsableDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// A bounded spawn is stopped with SIGTERM so the child can still flush and exit cleanly. SIGTERM is
// catchable and ignorable, though, so a child that swallows it would keep the run open — exactly the
// hang the bound exists to prevent. After this grace period the stop is forced with SIGKILL, which
// no process can refuse. One second is ample for a CLI that holds no state worth flushing.
const FORCED_KILL_GRACE_MS = 1000;

// After the leader exited on its own, the pipes get this long to deliver what is left before the
// result settles without them.
const DRAIN_MS = 100;

// Signals every process left in the group the child leads. False when the group is already empty.
function signalGroup(child, signal) {
  try {
    process.kill(-child.pid, signal);
    return true;
  } catch {
    return false;
  }
}

// Whether the group still has a member, probed with signal 0. While the leader runs, its PID and
// so the group ID are reserved. After the leader was reaped, the group ID stays reserved only while
// some member lives; once the group empties, the ID can be reused by an unrelated group, and a probe
// cannot tell the two apart. The runner therefore probes once, right when the leader exits, and
// treats a group found empty then as gone for good: it is never probed or signalled again. A group
// that still had members then is probed again before each later signal. The residual risk is a
// race the probe cannot close: if every member exits after that answer and the ID is reused before
// the signal lands, the signal reaches the unrelated group. That needs a PID wrap-around within the
// interval, which is unlikely, but not impossible.
function groupHasMembers(child) {
  return signalGroup(child, 0);
}

// Whether the group of an exited leader may still be signalled: only if it had members when the
// leader exited, and still has one now.
function exitedGroupReachable(group) {
  return group.membersAfterExit === true && groupHasMembers(group.child);
}

// The group-mode children still in flight, so a CLI entry can stop them when it is itself stopped.
// Each entry is `{ child, membersAfterExit }`; `membersAfterExit` is null until the leader exits.
const activeGroups = new Set();

export function terminateActiveProcessGroups(signal = 'SIGKILL') {
  for (const group of activeGroups) {
    if (group.membersAfterExit === null) signalGroup(group.child, signal);
    else if (exitedGroupReachable(group)) signalGroup(group.child, signal);
  }
}

// The bounded group spawn. A Git hook or transport helper inherits Git's pipes, so stopping Git
// alone leaves a hook that sleeps holding them open and the call waiting for the hook instead of
// the bound. Stopping the group the child leads reaches every such descendant at once.
function runInProcessGroup({ executable, args = [], stdin, cwd, env, timeoutMs, stdoutBuffer }) {
  return new Promise((resolve) => {
    const emptyStdout = stdoutBuffer ? Buffer.alloc(0) : '';
    if (cwd !== undefined && !isUsableDirectory(cwd)) {
      resolve({
        status: null,
        stdout: emptyStdout,
        stderr: '',
        error: { code: 'INVALID_CWD', path: cwd },
      });
      return;
    }
    const child = spawn(executable, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    });
    let stdout = '';
    const stdoutChunks = [];
    let stderr = '';
    let timedOut = false;
    let forcedKill = false;
    let groupKilled = false;
    let exited = null;
    let settled = false;
    const group = { child, membersAfterExit: null };
    const timers = [];
    const collectedStdout = () => (stdoutBuffer ? Buffer.concat(stdoutChunks) : stdout);
    const settle = (result) => {
      if (settled) return;
      settled = true;
      activeGroups.delete(group);
      for (const timer of timers) clearTimeout(timer);
      resolve({
        ...result,
        ...(timedOut ? { timedOut: true } : {}),
        ...(forcedKill ? { forcedKill: true } : {}),
      });
    };
    // After the group was killed, a pipe can still be held by a descendant that left the group
    // (`setsid`). The child's own exit is then the last event worth waiting for.
    const settleAfterKill = () => {
      child.stdout.destroy();
      child.stderr.destroy();
      settle({ ...exited, stdout: collectedStdout(), stderr });
    };
    // The bound fired after the leader had already exited on its own: only a descendant still holds
    // the pipes. The leader's status is the real outcome, so the bound is not reported; members
    // left in the group are stopped, and the pipes get a short drain before the result settles.
    const settleExitedLeader = () => {
      if (exitedGroupReachable(group)) signalGroup(child, 'SIGKILL');
      timers.push(setTimeout(settleAfterKill, DRAIN_MS));
    };
    if (child.pid !== undefined) {
      activeGroups.add(group);
      timers.push(
        setTimeout(() => {
          if (exited !== null) {
            settleExitedLeader();
            return;
          }
          timedOut = true;
          signalGroup(child, 'SIGTERM');
          timers.push(
            setTimeout(() => {
              const reachable = exited === null || exitedGroupReachable(group);
              if (reachable && signalGroup(child, 'SIGKILL')) forcedKill = true;
              groupKilled = true;
              if (exited !== null) settleAfterKill();
            }, FORCED_KILL_GRACE_MS),
          );
        }, timeoutMs),
      );
    }
    if (stdoutBuffer) {
      child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    } else {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => (stdout += chunk));
    }
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) =>
      settle({ status: null, stdout: collectedStdout(), stderr, error }),
    );
    child.on('exit', (status, signal) => {
      exited = { status, signal };
      // Probed once, right after the leader was reaped, before its group ID can plausibly be reused.
      if (child.pid !== undefined) group.membersAfterExit = groupHasMembers(child);
      if (groupKilled) settleAfterKill();
    });
    child.on('close', (status, signal) =>
      settle({ status, signal, stdout: collectedStdout(), stderr }),
    );
    // See the EPIPE note in `runDirect`.
    child.stdin.on('error', () => {});
    child.stdin.end(stdin);
  });
}

export function createProcessRunner() {
  return (call) =>
    call?.processGroup === true && call.timeoutMs !== undefined && process.platform !== 'win32'
      ? runInProcessGroup({ ...call, stdoutBuffer: call.stdoutBuffer === true })
      : runDirect(call);
}

function runDirect({ executable, args = [], stdin, cwd, env, timeoutMs, stdoutBuffer = false }) {
  return new Promise((resolve) => {
    const emptyStdout = stdoutBuffer ? Buffer.alloc(0) : '';
    if (cwd !== undefined && !isUsableDirectory(cwd)) {
      resolve({
        status: null,
        stdout: emptyStdout,
        stderr: '',
        error: { code: 'INVALID_CWD', path: cwd },
      });
      return;
    }
    const child = spawn(executable, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Only a plan that carries its own bound is bounded. A blocking provider watch has no
      // timeout flag of its own, so the limit travels with the plan and is enforced here, at the
      // single process boundary; every other spawn stays unbounded exactly as before.
      ...(timeoutMs === undefined ? {} : { timeout: timeoutMs, killSignal: 'SIGTERM' }),
    });
    let stdout = '';
    const stdoutChunks = [];
    let stderr = '';
    let forcedKill = false;
    // Armed only for a bounded spawn, so an unbounded one creates no timer at all. It fires once,
    // after the bound plus the grace period, and is cleared as soon as the child is gone — a
    // child that stops on its own never sees it.
    const escalation =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) {
              forcedKill = true;
              child.kill('SIGKILL');
            }
          }, timeoutMs + FORCED_KILL_GRACE_MS);
    const collectedStdout = () => (stdoutBuffer ? Buffer.concat(stdoutChunks) : stdout);
    const settle = (result) => {
      if (escalation !== undefined) clearTimeout(escalation);
      resolve(forcedKill ? { ...result, forcedKill: true } : result);
    };
    if (stdoutBuffer) {
      child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    } else {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => (stdout += chunk));
    }
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) =>
      settle({ status: null, stdout: collectedStdout(), stderr, error }),
    );
    // The terminating signal travels with the result: a child killed on its bound exits with a
    // null status, and only the signal distinguishes that bounded stop from a crash.
    child.on('close', (status, signal) =>
      settle({ status, signal, stdout: collectedStdout(), stderr }),
    );
    // A child that fails at once — an unauthenticated or instantly exiting gh — closes its end of
    // the pipe while this write is still outstanding, and the EPIPE that follows is emitted on the
    // stdin stream rather than on the child. A stream with no `error` listener turns that into an
    // uncaught exception, so the process would die before `main` printed anything and a caller
    // waiting for a structured envelope would receive none at all. The listener stays empty on
    // purpose: the child's own `error` and `close` handlers above already carry the real outcome
    // and report it as a COMMAND_FAILED, and a second reading of the same failure here could only
    // contradict them.
    child.stdin.on('error', () => {});
    child.stdin.end(stdin);
  });
}
