// Model-free genuine Claude tool guard, under exactly the final outer official-runtime policy.
import fs from 'node:fs';
import { resolve } from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { claudeSandboxArgs } from './claude-process.mjs';
import { SCHEMA, requireThat } from './protocol.mjs';
const hash = (v) => 'sha256:' + createHash('sha256').update(v).digest('hex'),
  input = JSON.parse(fs.readFileSync(0, 'utf8')),
  { policy, environment, execArgs, journalRoot, executable, reportedVersion } = input;
const nonce = randomBytes(10).toString('hex'),
  startedAt = Date.now(),
  settingsPath = resolve(journalRoot, 'guard-' + nonce + '-policy.json'),
  hookPath = resolve(journalRoot, 'guard-' + nonce + '-hook.mjs'),
  observationPath = resolve(policy.stateRoots[2], 'guard-' + nonce + '.jsonl');
fs.writeFileSync(settingsPath, JSON.stringify(policy.definition), { flag: 'wx', mode: 0o600 });
const canaries = policy.protectedPaths.map((p) => resolve(p, '.claude-canary-' + nonce)),
  link = resolve(policy.fixture, '.claude-link-' + nonce),
  index = resolve(policy.gitRoot, 'index.guard-' + nonce),
  branch = 'refs/heads/eval-claude-guard-' + nonce;
for (const p of canaries) fs.writeFileSync(p, 'host-owned ' + nonce, { flag: 'wx', mode: 0o600 });
fs.symlinkSync(canaries[0], link);
const direct = resolve(policy.fixture, '.effective-flow/claude-guard-' + nonce);
fs.mkdirSync(direct, { recursive: true });
const ledgerBefore = fs.existsSync(policy.ledger) ? fs.readFileSync(policy.ledger) : null;
const shell = (v) => "'" + v.replaceAll("'", "'\\''") + "'",
  text = (r) =>
    (r.result?.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
const argsFor = (args) => [
  process.execPath,
  claudeSandboxArgs(policy, settingsPath, executable, args),
];
const source = resolve(import.meta.dirname, 'native-sandbox-probe.mjs'),
  guardInput = {
    fixture: policy.fixture,
    canaries,
    link,
    index,
    origin: policy.originRoot,
    branch,
    nonce,
    ledger: policy.ledger,
    stub: resolve(policy.skill, 'scripts/remote-tracker.mjs'),
  };
let server = null,
  serverClosed = null;
const pending = new Map();
let stdout = '',
  stderr = '';
const transcript = [];
try {
  const hookCode = `import fs from 'node:fs';import{spawnSync}from'node:child_process';const i=JSON.parse(fs.readFileSync(0,'utf8'));const p=${JSON.stringify([...canaries, link])};let denied=0;for(const f of p){try{fs.writeFileSync(f,'bad')}catch(e){if(['EPERM','EACCES'].includes(e.code))denied++;}}const c=spawnSync(process.execPath,['-e','const f=require("node:fs");let n=0;for(const p of process.argv.slice(1)){try{f.writeFileSync(p,"bad")}catch(e){if(["EPERM","EACCES"].includes(e.code))n++;}}console.log(n);',...p],{encoding:'utf8'});fs.appendFileSync(${JSON.stringify(observationPath)},JSON.stringify({event:i.hook_event_name,denied,inheritedDenied:c.status===0&&Number(c.stdout.trim())===p.length})+'\\n');`;
  fs.writeFileSync(hookPath, hookCode, { flag: 'wx', mode: 0o600 });
  const hookCommand = shell(process.execPath) + ' ' + shell(hookPath),
    probeSettings = {
      sandbox: { enabled: false },
      hooks: Object.fromEntries(
        ['Setup', 'SessionStart'].map((event) => [
          event,
          [
            {
              matcher: event === 'Setup' ? 'init' : 'startup',
              hooks: [{ type: 'command', command: hookCommand }],
            },
          ],
        ]),
      ),
    };
  const guardArgs = [];
  for (let i = 0; i < execArgs.length; i++) {
    const a = execArgs[i];
    if (['--input-format', '--output-format', '--permission-prompts', '--resume'].includes(a)) {
      i++;
      continue;
    }
    if (['--print', '--replay-user-messages', '--forward-subagent-text'].includes(a)) continue;
    guardArgs.push(a);
  }
  const probeArgs = [...guardArgs],
    setting = probeArgs.indexOf('--settings');
  probeArgs[setting + 1] = JSON.stringify(probeSettings);
  const [initExe, initArgs] = argsFor([...probeArgs, '--init-only']);
  const init = spawnSync(initExe, initArgs, {
    cwd: policy.fixture,
    env: environment,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });
  requireThat(
    !init.error && init.status === 0,
    'actual whole-CLI init-only failed: ' + init.stderr,
  );
  const hooks = fs.readFileSync(observationPath, 'utf8').trim().split('\n').map(JSON.parse);
  requireThat(
    hooks.length === 2 &&
      ['Setup', 'SessionStart'].every((e) =>
        hooks.some((h) => h.event === e && h.denied === canaries.length + 1 && h.inheritedDenied),
      ),
    'actual whole-CLI direct/inherited init-only denial missing',
  );
  const mcpArgs = [...guardArgs];
  const agentsAt = mcpArgs.indexOf('--agents');
  if (agentsAt >= 0) mcpArgs.splice(agentsAt, 2);
  const [serverExe, serverArgs] = argsFor([...mcpArgs, 'mcp', 'serve']);
  server = spawn(serverExe, serverArgs, {
    cwd: policy.fixture,
    env: environment,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  serverClosed = new Promise((done) =>
    server.once('close', (code) => {
      for (const value of pending.values())
        value.reject(Error('native MCP guard exited ' + code + ': ' + stderr));
      pending.clear();
      done();
    }),
  );
  let buffer = '',
    id = 0;
  server.on('error', (e) => {
    for (const value of pending.values()) value.reject(e);
  });
  server.stderr.on('data', (d) => (stderr += d));
  server.stdout.on('data', (d) => {
    stdout += d;
    buffer += d;
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      try {
        const row = JSON.parse(line);
        transcript.push(row);
        pending.get(row.id)?.resolve(row);
        pending.delete(row.id);
      } catch {}
    }
  });
  const request = (method, params = {}) =>
    new Promise((done, reject) => {
      const requestId = ++id,
        timer = setTimeout(() => {
          pending.delete(requestId);
          reject(Error('actual MCP guard timeout ' + method));
        }, 15000);
      pending.set(requestId, {
        resolve: (r) => {
          clearTimeout(timer);
          done(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) + '\n');
    });
  const initialized = await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'flow-private-model-free-guard', version: '1' },
  });
  requireThat(initialized.result, 'actual native tool server did not initialize');
  server.stdin.write(
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n',
  );
  const list = await request('tools/list');
  requireThat(
    ['Bash', 'Read', 'Edit', 'Write'].every((n) => list.result?.tools?.some((t) => t.name === n)),
    'actual native file/shell tools unavailable',
  );
  const tool = (name, args) => request('tools/call', { name, arguments: args });
  const positive = resolve(direct, 'positive.txt');
  const wrote = await tool('Write', { file_path: positive, content: 'actual fixture native file' }),
    read = await tool('Read', { file_path: positive });
  requireThat(
    !wrote.result?.isError && text(read).includes('actual fixture native file'),
    'actual native fixture Write/Read failed',
  );
  let fileEditDenied = true,
    fileWriteDenied = true;
  for (const p of canaries) {
    await tool('Read', { file_path: p });
    const edit = await tool('Edit', {
        file_path: p,
        old_string: 'host-owned ' + nonce,
        new_string: 'bad',
      }),
      write = await tool('Write', { file_path: p, content: 'bad' });
    fileEditDenied &&= edit.result?.isError === true && /EPERM|EACCES/.test(text(edit));
    fileWriteDenied &&= write.result?.isError === true && /EPERM|EACCES/.test(text(write));
  }
  requireThat(fileEditDenied && fileWriteDenied, 'actual native Edit/Write protection failed');
  const bash = await tool('Bash', {
    command:
      shell(process.execPath) +
      ' ' +
      shell(source) +
      " <<'FLOW_GUARD'\n" +
      JSON.stringify(guardInput) +
      '\nFLOW_GUARD',
    description: 'Check actual fixture and host boundary',
  });
  requireThat(!bash.result?.isError, 'actual native Bash failed: ' + text(bash));
  const bashResult = JSON.parse(text(bash)),
    observed = JSON.parse(bashResult.stdout);
  requireThat(
    observed.inheritedDenied &&
      observed.denied === canaries.length + 1 &&
      observed.fixtureRead &&
      observed.fixtureWrite &&
      observed.gitCommit &&
      observed.gitPush &&
      observed.stubLedger &&
      observed.wrapperDigest === hash(fs.readFileSync(source)),
    'actual native Bash fixture/Git/stub/descendant proof incomplete',
  );
  const denied = await tool('Bash', {
    command: 'curl --max-time 5 -sS -I https://example.com',
    description: 'Check excluded public domain denial',
  });
  const networkDenied = /403|blocked by|not allowed|denied/i.test(text(denied));
  requireThat(networkDenied, 'actual provider proxy did not deny excluded domain');
  requireThat(
    canaries.every((p) => fs.readFileSync(p, 'utf8') === 'host-owned ' + nonce),
    'protected external canary changed',
  );
  const result = {
    schema: SCHEMA + '/native-guard',
    kind: 'claude-process',
    writeDenied: true,
    inheritedDenied: true,
    denied: canaries.length + 1,
    fixtureRead: true,
    fixtureWrite: true,
    gitCommit: true,
    gitPush: true,
    stubLedger: true,
    fileEditDenied,
    fileWriteDenied,
    networkDenied,
    runtimeDigest: policy.runtime.membershipDigest,
    providerDomainsDigest: policy.providerDomainsDigest,
    wrapperDigest: hash(fs.readFileSync(new URL(import.meta.url))),
    binaryDigest: hash(fs.readFileSync(executable)),
    reportedVersion,
    policyDigest: policy.policyDigest,
    execArgumentsDigest: hash(JSON.stringify(execArgs)),
    sandboxArgumentsDigest: hash(
      JSON.stringify(claudeSandboxArgs(policy, settingsPath, executable, execArgs)),
    ),
    debugPromptDigest: hash(JSON.stringify({ hooks, definition: policy.definition })),
    stdoutDigest: hash(stdout),
    startedAt,
    finishedAt: Date.now(),
    protectedRootDigests: policy.protectedPaths.map((p) => hash(p)),
    writeRootDigests: policy.writes.map((p) => hash(p)),
  };
  fs.writeFileSync(
    resolve(journalRoot, 'guard-' + nonce + '-private-proof.json'),
    JSON.stringify({ result, hooks, transcript, stderr, settingsPath }, null, 2),
    { flag: 'wx', mode: 0o600 },
  );
  process.stdout.write(JSON.stringify(result));
} finally {
  if (server) {
    server.stdin.end();
    server.kill('SIGTERM');
    const timer = setTimeout(() => server.kill('SIGKILL'), 1000);
    await serverClosed;
    clearTimeout(timer);
  }
  if (ledgerBefore === null) fs.rmSync(policy.ledger, { force: true });
  else fs.writeFileSync(policy.ledger, ledgerBefore);
  for (const p of canaries) fs.rmSync(p, { force: true });
  fs.rmSync(link, { force: true });
  fs.rmSync(index, { force: true });
  fs.rmSync(index + '.lock', { force: true });
  fs.rmSync(direct, { recursive: true, force: true });
  execFileSync('git', ['--git-dir', policy.originRoot, 'update-ref', '-d', branch], {
    stdio: 'pipe',
  });
}
