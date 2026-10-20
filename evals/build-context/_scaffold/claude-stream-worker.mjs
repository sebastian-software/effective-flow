// Trusted host collector, OUTSIDE the model's OS boundary. Never accepts model-supplied frames.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const input = JSON.parse(readFileSync(0, 'utf8')),
  hash = (v) => 'sha256:' + createHash('sha256').update(v).digest('hex');
for (const ext of ['.stdout.jsonl', '.stderr.txt', '.capture.jsonl'])
  writeFileSync(input.base + ext, '', { flag: 'wx', mode: 0o600 });
let bytes = 0,
  error = null;
const startedAt = Date.now(),
  child = spawn(input.executable, input.args, {
    cwd: input.cwd,
    env: input.environment,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true,
  });
const terminate = (signal) => {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch (e) {
    if (e.code !== 'ESRCH') throw e;
  }
};
child.on('error', (e) => {
  error = e.code;
});
child.stdout.on('data', (data) => {
  bytes += data.length;
  if (bytes > 16 * 1024 * 1024) {
    error = 'STDOUT_LIMIT';
    terminate('SIGTERM');
    return;
  }
  const at = Date.now();
  appendFileSync(input.base + '.stdout.jsonl', data);
  appendFileSync(
    input.base + '.capture.jsonl',
    JSON.stringify({ at, bytes: data.toString('base64') }) + '\n',
  );
});
let stderrBytes = 0;
child.stderr.on('data', (data) => {
  stderrBytes += data.length;
  if (stderrBytes > 16 * 1024 * 1024) {
    error = 'STDERR_LIMIT';
    terminate('SIGTERM');
    return;
  }
  appendFileSync(input.base + '.stderr.txt', data);
});
const timer = setTimeout(() => {
  error = 'TIMEOUT';
  terminate('SIGTERM');
  setTimeout(() => terminate('SIGKILL'), 1000).unref();
}, input.timeoutMs);
child.stdin.on('error', () => {});
child.stdin.end(input.input);
child.on('close', (code, signal) => {
  clearTimeout(timer);
  const finishedAt = Date.now(),
    stdout = readFileSync(input.base + '.stdout.jsonl'),
    stderr = readFileSync(input.base + '.stderr.txt'),
    capture = readFileSync(input.base + '.capture.jsonl');
  const outcome = {
    startedAt,
    finishedAt,
    exitCode: code,
    signal,
    launchError: error,
    stdoutDigest: hash(stdout),
    stderrDigest: hash(stderr),
    captureDigest: hash(capture),
    inputDigest: hash(input.input),
    collectorDigest: hash(readFileSync(new URL(import.meta.url))),
  };
  writeFileSync(input.base + '.outcome.json', JSON.stringify(outcome) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  process.stdout.write(JSON.stringify(outcome));
});
