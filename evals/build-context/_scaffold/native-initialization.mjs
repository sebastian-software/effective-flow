// Closed model-free native config writer. No thread, turn, model, auth or user-supplied edits.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
const input = JSON.parse(readFileSync(0, 'utf8'));
const child = spawn(
  input.executable,
  [...input.args, 'app-server', '--strict-config', '--listen', 'stdio://'],
  { cwd: input.fixture, env: input.environment, stdio: ['pipe', 'pipe', 'pipe'] },
);
let buffer = '',
  error = null,
  result = null;
const stop = () => {
  child.kill('SIGTERM');
  setTimeout(() => child.kill('SIGKILL'), 1000).unref();
};
const timer = setTimeout(() => {
  error = 'native initialization timeout';
  stop();
}, 15000);
child.on('error', (e) => {
  error = e.code;
});
child.stderr.pipe(process.stderr);
child.stdout.on('data', (data) => {
  buffer += data;
  if (buffer.length > 1024 * 1024) {
    error = 'native initialization output limit';
    stop();
    return;
  }
  let k;
  while ((k = buffer.indexOf('\n')) >= 0) {
    let row;
    try {
      row = JSON.parse(buffer.slice(0, k));
    } catch {
      error = 'malformed native initialization';
      stop();
      return;
    }
    buffer = buffer.slice(k + 1);
    if (row.error) {
      error = JSON.stringify(row.error);
      stop();
      return;
    }
    if (row.id === 1)
      child.stdin.write(
        JSON.stringify({
          id: 2,
          method: 'config/batchWrite',
          params: {
            edits: [
              {
                keyPath: 'projects.' + JSON.stringify(input.fixture) + '.trust_level',
                value: 'trusted',
                mergeStrategy: 'replace',
              },
            ],
            filePath: input.configFile,
            reloadUserConfig: false,
          },
        }) + '\n',
      );
    if (row.id === 2) {
      result = row.result;
      child.stdin.end();
      stop();
    }
  }
});
child.stdin.on('error', () => {});
child.stdin.write(
  JSON.stringify({
    id: 1,
    method: 'initialize',
    params: {
      clientInfo: { name: 'flow-model-free-fixture-initialization', version: '1' },
      capabilities: { experimentalApi: true },
    },
  }) + '\n',
);
await new Promise((done) => child.once('close', done));
clearTimeout(timer);
if (error || result?.status !== 'ok' || result.filePath !== input.configFile) {
  process.stderr.write(error ?? 'native fixture trust write failed');
  process.exitCode = 1;
} else process.stdout.write(JSON.stringify(result));
