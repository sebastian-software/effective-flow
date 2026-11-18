// Shared test support: a liveness-aware wait for a marker file that an operation under test writes
// at a pause point. The wait depends on whether the writer is still alive, not on a budget tuned
// for CI speed: it resolves as soon as the marker exists and fails as soon as the writer has
// settled without it, naming the marker and what the writer ended with. A generous backstop only
// catches a writer that neither writes the marker nor settles. This module declares no test.
import { existsSync } from 'node:fs';

const POLL_MS = 10;

// `path` is a string or a getter that may return `undefined` while the path is not yet known.
// `settled` is the writer's own promise (a child's result, a pending in-process call); `describe`
// renders the value it resolved with for the failure message.
export function waitForMarker(
  path,
  { settled, describe = (value) => JSON.stringify(value), timeoutMs = 60_000 } = {},
) {
  const current = typeof path === 'function' ? path : () => path;
  const present = () => {
    const known = current();
    return known !== undefined && existsSync(known);
  };
  const label = () => current() ?? 'a marker whose path was never known';
  return new Promise((resolveWait, rejectWait) => {
    let done = false;
    let poll;
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(poll);
      clearTimeout(backstop);
      if (error === undefined) resolveWait();
      else rejectWait(error);
    };
    // The writer may create the marker and settle at once, so one last check precedes the verdict.
    const settledFirst = (render, cause) => {
      if (done) return;
      if (present()) return finish();
      let detail;
      try {
        detail = render();
      } catch (error) {
        detail = `<undescribable: ${error?.message ?? error}>`;
      }
      finish(new Error(`${label()} never appeared: its writer ${detail}`, { cause }));
    };
    const backstop = setTimeout(
      () => finish(new Error(`timed out after ${timeoutMs} ms waiting for ${label()}`)),
      timeoutMs,
    );
    const check = () => {
      if (done) return;
      if (present()) return finish();
      poll = setTimeout(check, POLL_MS);
    };
    // Both handlers stay attached after success, so a late rejection is handled, not unhandled.
    if (settled !== undefined) {
      Promise.resolve(settled).then(
        (value) => settledFirst(() => `settled first with ${describe(value)}`),
        (reason) => settledFirst(() => `rejected first: ${reason?.stack ?? reason}`, reason),
      );
    }
    check();
  });
}
