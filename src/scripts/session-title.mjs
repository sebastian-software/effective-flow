#!/usr/bin/env node

// Session-title runtime helper - I/O boundary.
//
// Usage:
//
//   node <skill-root>/scripts/session-title.mjs request [--debug]   # inside the Codex sandbox
//   node <skill-root>/scripts/session-title.mjs apply   [--debug]   # from a Codex `Stop` hook
//
// Exactly one JSON object on standard input, exactly one JSON envelope line on standard output.
// `request` receives `{ cwd, title }` from the running workflow; `apply` receives the hook payload
// Codex writes to its hook command. Everything that decides anything lives in the core module -
// this file owns only the process, standard input and the exit code.

import { spawn } from 'node:child_process';
import process from 'node:process';
import { errorEnvelope, executeOperation, SessionTitleError } from './session-title-core.mjs';

// After standard input is closed the app-server has nothing left to answer, so this is the window
// it gets to exit on its own before it is asked to, and then made to.
const CLOSE_GRACE_MS = 250;
// SIGTERM is catchable and ignorable, so a child that swallows it would keep the hook open past
// its own timeout. After this grace period the stop is forced with SIGKILL, which nothing refuses.
const FORCED_KILL_GRACE_MS = 1000;
// Even SIGKILL is not the end of it: `'close'` waits for the stdio pipes, and a grandchild that
// inherited the app server's standard output holds them open after the app server itself is gone.
// Waiting on that has no bound of its own, so `close()` stops waiting here, keeps the outcome it
// already has, and tears the pipes down rather than letting a hook sit until Codex's own budget
// expires. It must exceed both grace periods so the ordinary stop sequence still gets its chance.
const CLOSE_DEADLINE_MS = 3000;
// How long an exit waits for its own pipes before it counts as the end of the exchange. Long
// enough for a reply written in the same tick as the exit to be delivered first, short enough that
// it disappears next to every other bound here.
const EXIT_SETTLE_GRACE_MS = 50;

// A JSON-RPC dialogue, not a single command: the rename response only arrives while the server's
// standard input is still open, so the runner hands the core a session it drives frame by frame
// rather than a finished result. `session-title-core.mjs` documents the contract implemented here.
function createProcessRunner() {
  return ({ executable, args = [], cwd, env, timeoutMs }) => {
    const child = spawn(executable, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const waiters = new Map();
    const inbox = [];
    let buffer = '';
    let stderr = '';
    let spawnError = null;
    let settled = false;
    let outcome = null;
    let bound;
    let closing;

    // One settlement for every way the exchange can end - process exit, spawn failure, or the bound
    // elapsing. Outstanding waiters resolve with `null` rather than hanging, which is what lets the
    // core ask `close()` for the stderr that explains why no answer came. `stderr` is deliberately
    // not captured here: settling on `'exit'` beats the pipe flush, so the text is read at the
    // moment `close()` returns instead.
    const settle = (result) => {
      if (settled) return;
      settled = true;
      outcome = result;
      clearTimeout(bound);
      for (const resolve of waiters.values()) resolve(null);
      waiters.clear();
    };

    const deliver = (line) => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        // The app-server is an experimental surface and may write non-protocol chatter to standard
        // output. An unparsable line is not this helper's business; the awaited response decides.
        return;
      }
      if (!message || typeof message !== 'object' || message.id === undefined) return;
      const waiter = waiters.get(message.id);
      if (waiter) {
        waiters.delete(message.id);
        waiter(message);
        return;
      }
      // A response that arrives before anyone waits for it is kept, not dropped.
      inbox.push(message);
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line !== '') deliver(line);
        index = buffer.indexOf('\n');
      }
    });
    child.stderr.on('data', (chunk) => (stderr += chunk));

    // Two different questions, and conflating them is what makes a session hang. `'exit'` answers
    // "is the process gone", which is what keeps a grandchild holding the pipes from stranding the
    // exchange; `'close'` answers "are the pipes drained", which is when the last response and the
    // last of stderr have actually arrived.
    //
    // `'exit'` alone must therefore not settle immediately. A server that writes its reply and
    // exits in the same tick would otherwise have that reply delivered *after* the waiters were
    // nulled, turning a successful rename into a COMMAND_FAILED - and, now that failures persist,
    // into a verdict that suppresses the whole path for a day. So the exit-driven settle waits out
    // a short grace period and `'close'` cancels it, which costs nothing in the ordinary case and
    // gives up nothing in the grandchild case.
    let flushed;
    let exitSettle;
    const drained = new Promise((resolve) => (flushed = resolve));
    const cancelExitSettle = () => {
      if (exitSettle !== undefined) clearTimeout(exitSettle);
    };
    child.on('error', (error) => {
      spawnError = error;
      cancelExitSettle();
      settle({ status: null, signal: null, error });
      flushed();
    });
    child.on('exit', (status, signal) => {
      exitSettle = setTimeout(
        () => settle({ status, signal, error: spawnError }),
        EXIT_SETTLE_GRACE_MS,
      );
    });
    child.on('close', (status, signal) => {
      cancelExitSettle();
      settle({ status, signal, error: spawnError });
      flushed();
    });

    // The `Stop` hook that invokes this has a 600 s budget, so the bound is about not hanging a
    // turn on an unresponsive server, not about racing it.
    bound =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) {
              child.kill('SIGKILL');
              child.unref();
            }
            settle({ status: null, signal: 'SIGKILL', error: spawnError, timedOut: true });
          }, timeoutMs);

    // A server that exits at once closes its end of the pipe while a write is still outstanding,
    // and the EPIPE that follows is emitted on the stdin stream rather than on the child. Without
    // a listener that becomes an uncaught exception and the envelope below is never printed; the
    // child's own `error` and `close` handlers already carry the real outcome.
    child.stdin.on('error', () => {});

    return {
      send(frame) {
        if (child.stdin.writable) child.stdin.write(`${JSON.stringify(frame)}\n`);
      },
      waitFor(id) {
        const buffered = inbox.findIndex((message) => message.id === id);
        if (buffered !== -1) return Promise.resolve(inbox.splice(buffered, 1)[0]);
        if (settled) return Promise.resolve(null);
        return new Promise((resolve) => waiters.set(id, resolve));
      },
      close() {
        if (closing) return closing;
        closing = (async () => {
          if (child.stdin.writable) child.stdin.end();
          const grace = setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
          }, CLOSE_GRACE_MS);
          const forced = setTimeout(() => {
            if (child.exitCode === null && child.signalCode === null) {
              child.kill('SIGKILL');
              child.unref();
            }
          }, CLOSE_GRACE_MS + FORCED_KILL_GRACE_MS);
          let deadline;
          const abandoned = new Promise(
            (resolve) => (deadline = setTimeout(resolve, CLOSE_DEADLINE_MS)),
          );
          // Prefer a drained close, because the last of stderr is what names a sandbox refusal -
          // but never wait for it beyond the deadline.
          await Promise.race([drained, abandoned]);
          clearTimeout(grace);
          clearTimeout(forced);
          clearTimeout(deadline);
          clearTimeout(bound);
          cancelExitSettle();
          settle({ status: child.exitCode, signal: child.signalCode, error: spawnError });
          // Whatever still holds the pipes open is no longer this process's problem, and neither is
          // the child: both are released so the hook can exit on schedule.
          child.stdout.destroy();
          child.stderr.destroy();
          child.unref();
          return { ...outcome, stderr };
        })();
        return closing;
      },
    };
  };
}

async function readStdin(stream = process.stdin) {
  let input = '';
  stream.setEncoding('utf8');
  for await (const chunk of stream) input += chunk;
  if (input.trim() === '') return {};
  try {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new TypeError('stdin JSON must be an object');
    }
    return parsed;
  } catch (error) {
    const failure = new Error(`invalid JSON input: ${error.message}`);
    failure.code = 'INVALID_PAYLOAD';
    throw failure;
  }
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const operation = argv.find((argument) => !argument.startsWith('-'));
  // A hook prints nowhere a user reads by default, so the failure reason is opt-in rather than
  // noise on every turn.
  const debug = argv.includes('--debug') || io.debug === true;
  let envelope;
  try {
    if (!operation) {
      const error = new Error('usage: session-title.mjs <request|apply> [--debug]');
      error.code = 'INVALID_PAYLOAD';
      throw error;
    }
    const input = io.input ?? (await readStdin(io.stdin ?? process.stdin));
    envelope = await executeOperation(operation, input, {
      runner: io.runner ?? createProcessRunner(),
      env: io.env ?? process.env,
      now: io.now,
      timeoutMs: io.timeoutMs,
    });
  } catch (error) {
    envelope = errorEnvelope(
      operation ?? null,
      new SessionTitleError(error.code ?? 'INVALID_PAYLOAD', error.message),
    );
  }
  stdout.write(`${JSON.stringify(envelope)}\n`);
  if (!envelope.ok) {
    if (io.setExitCode) io.setExitCode(1);
    else process.exitCode = 1;
    if (debug) stderr.write(`${envelope.error.message}\n`);
  }
  return envelope;
}

await main();
