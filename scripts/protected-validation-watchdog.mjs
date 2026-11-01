// File-backed subprocess I/O lets the native SIGKILL deadline return even
// when descendants hold inherited descriptors. Reap the remaining group next.
export function stopValidationProcessGroup(pid, { cleanupMs = 1000 } = {}) {
  if (!Number.isSafeInteger(pid) || pid < 2) return;
  const deadline = performance.now() + cleanupMs;
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (;;) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch (error) {
      if (error.code === 'ESRCH') return;
      throw new Error('validation process group termination unconfirmed', { cause: error });
    }
    if (performance.now() >= deadline)
      throw new Error('validation process group termination unconfirmed');
    Atomics.wait(pause, 0, 0, 10);
  }
}
