// Closed, model-free config observation: initialize + config/read only, never a thread/model call.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const input = JSON.parse(readFileSync(0, 'utf8')),
  child = spawn(
    input.executable,
    [...input.args, 'app-server', '--strict-config', '--listen', 'stdio://'],
    { cwd: input.cwd, env: input.environment, stdio: ['pipe', 'pipe', 'pipe'] },
  );
let buffer = '',
  stderr = '',
  result = null,
  error = null;
const timeout = setTimeout(() => {
  error = 'model-free config observation timeout';
  child.kill('SIGTERM');
}, 15000);
child.stderr.on('data', (d) => (stderr += d));
child.on('error', (e) => {
  error = e.code;
});
child.stdout.on('data', (d) => {
  buffer += d;
  let k;
  while ((k = buffer.indexOf('\n')) >= 0) {
    let row;
    try {
      row = JSON.parse(buffer.slice(0, k));
    } catch {
      error = 'malformed config observation';
      child.kill('SIGTERM');
      return;
    }
    buffer = buffer.slice(k + 1);
    if (row.id === 1) {
      if (row.error) {
        error = JSON.stringify(row.error);
        child.kill('SIGTERM');
        return;
      }
      child.stdin.write(
        JSON.stringify({
          id: 2,
          method: 'config/read',
          params: { includeLayers: false, cwd: input.cwd },
        }) + '\n',
      );
    }
    if (row.id === 2) {
      result = row;
      child.stdin.end();
      child.kill('SIGTERM');
    }
  }
});
child.stdin.on('error', () => {});
child.stdin.write(
  JSON.stringify({
    id: 1,
    method: 'initialize',
    params: {
      clientInfo: { name: 'flow-private-model-free-registration', version: '1' },
      capabilities: { experimentalApi: true },
    },
  }) + '\n',
);
await new Promise((done) => child.once('close', done));
clearTimeout(timeout);
if (error || !result?.result?.config) {
  process.stderr.write(error || JSON.stringify(result?.error) || stderr);
  process.exitCode = 1;
} else {
  const agents = result.result.config.agents ?? {};
  for (const expected of input.registrations) {
    const actual = agents[expected.name];
    if (actual?.config_file !== expected.file || actual.description !== expected.description)
      throw Error('actual strict native registration differs: ' + expected.name);
  }
  process.stdout.write(
    JSON.stringify({
      count: input.registrations.length,
      configDigest: 'sha256:' + createHash('sha256').update(JSON.stringify(agents)).digest('hex'),
    }),
  );
}
