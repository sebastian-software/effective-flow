import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { executeOperation } from '../src/scripts/issue-buddy-core.mjs';
import { createProcessRunner } from '../src/scripts/process-runner.mjs';

const NOW = '2026-10-19T12:00:00.000Z';
async function repository(t) {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'issue-buddy-git-')));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'primary');
  const origin = path.join(directory, 'origin.git');
  await fs.mkdir(root);
  function git(...args) {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  git('init', '-b', 'develop');
  git('config', 'user.email', 'test@example.test');
  git('config', 'user.name', 'Test');
  await fs.writeFile(path.join(root, '.gitignore'), '.effective-flow/\n');
  await fs.mkdir(path.join(root, 'docs/plan/archive'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs/plan/ordinary.md'), '# Active\n**Issue:** #1\n');
  await fs.writeFile(
    path.join(root, 'docs/plan/archive/archived.md'),
    '# Archive\n**Issue:** #2\n',
  );
  await fs.writeFile(
    path.join(root, 'docs/plan/2026-10-19-issue-3-fallback.md'),
    '# Header absent\n',
  );
  await fs.mkdir(path.join(root, 'docs/plan/nested'));
  await fs.writeFile(path.join(root, 'docs/plan/nested/ignored.md'), '**Issue:** #4\n');
  await fs.symlink('ordinary.md', path.join(root, 'docs/plan/symlink.md'));
  git('add', '.');
  git('commit', '-m', 'fixture');
  const init = spawnSync('git', ['init', '--bare', origin], { encoding: 'utf8' });
  assert.equal(init.status, 0);
  git('remote', 'add', 'origin', origin);
  git('push', 'origin', 'develop');
  const actual = createProcessRunner();
  const calls = [];
  const runner = async (call) => {
    calls.push(call);
    if (call.executable === 'git' && call.args.join(' ') === 'remote get-url origin')
      return { status: 0, stdout: 'https://github.com/example/flow.git', stderr: '' };
    if (call.executable !== 'gh') return actual(call);
    const args = call.args;
    let value = [];
    if (args[0] === '--version') return { status: 0, stdout: 'gh version 2.90.0', stderr: '' };
    if (args[0] === 'auth') return { status: 0, stdout: '', stderr: '' };
    const endpoint = args.at(-1);
    if (endpoint.endsWith('/permission')) value = { permission: 'write' };
    else if (/\/issues\?/.test(endpoint))
      value = [1, 2, 3, 4].map((number) => ({
        number,
        title: 'Trusted',
        body: 'Body',
        state: 'open',
        user: { login: 'owner' },
        created_at: NOW,
        updated_at: NOW,
        labels: [],
      }));
    return { status: 0, stdout: JSON.stringify(value), stderr: '' };
  };
  const run = (operation, input = {}, options = {}) =>
    executeOperation(operation, { cwd: root, ...input }, { runner, clock: () => NOW, ...options });
  const acquire = () => run('pass-lock-acquire');
  const collect = (passId) =>
    run('pass-collect', {
      passId,
      mode: 'publish',
      baseBranch: 'develop',
      branchPrefix: 'effective-flow',
      planDir: 'docs/plan',
      visibility: 'standard',
    });
  return { root, origin, directory, git, calls, run, acquire, collect };
}
test('real fetched-OID scan finds active and archived headers plus exact filename fallback, excluding nested and symlink blobs', async (t) => {
  const f = await repository(t);
  await assert.rejects(fs.stat(path.join(f.root, '.effective-flow')), { code: 'ENOENT' });
  const acquired = await f.acquire();
  assert.equal(acquired.ok, true, JSON.stringify(acquired));
  const c = await f.collect(acquired.data.passId);
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.deepEqual(
    c.data.skipped,
    [1, 2, 3].map((issue) => ({ issue, reason: 'plan-on-base' })),
  );
  assert.deepEqual(
    c.data.eligible.map((entry) => entry.issue),
    [4],
  );
  assert.equal(c.data.baseOid, f.git('rev-parse', 'HEAD'));
  const scans = f.calls.filter((call) => call.executable === 'git' && call.args[0] === 'ls-tree');
  assert.equal(scans[0].args[2], c.data.baseOid);
  assert.deepEqual(f.calls.find((call) => call.args[0] === 'fetch').args, [
    'fetch',
    '--no-tags',
    'origin',
    'refs/heads/develop:refs/remotes/origin/develop',
  ]);
});
test('real missing source branch stops with FETCH_FAILED without classification', async (t) => {
  const f = await repository(t);
  f.git('remote', 'set-url', 'origin', path.join(f.directory, 'missing.git'));
  const acquired = await f.acquire();
  const c = await f.collect(acquired.data.passId);
  assert.equal(c.error.code, 'FETCH_FAILED');
  assert.equal(
    f.calls.some((call) => call.executable === 'gh'),
    false,
  );
});
test('a corrupt or foreign cache is reported but never overwritten; missing cache is healthy', async (t) => {
  const f = await repository(t);
  let acquired = await f.acquire();
  let c = await f.collect(acquired.data.passId);
  assert.equal(c.ok, true);
  assert.equal(c.data.cacheDegradation, null);
  const cache = path.join(f.root, '.effective-flow/issue-buddy/verdicts.json');
  await fs.writeFile(cache, '{broken');
  await f.run('pass-lock-release', { passId: acquired.data.passId });
  acquired = await f.acquire();
  c = await f.collect(acquired.data.passId);
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.equal(c.data.cacheDegradation.code, 'CACHE_CORRUPT');
  const verdict = await f.run('verdict-record', {
    passId: acquired.data.passId,
    mode: 'publish',
    issue: 4,
    fingerprint: c.data.eligible[0].fingerprint,
    verdict: 'not-ready',
    reason: '',
  });
  assert.equal(verdict.error.code, 'CACHE_CORRUPT');
  assert.equal(await fs.readFile(cache, 'utf8'), '{broken');
  await f.run('pass-lock-release', { passId: acquired.data.passId });
  const foreign = {
    schemaVersion: 1,
    repository: 'github.com/elsewhere/flow',
    records: {},
    attempts: {},
    closedPlanPrObservations: {},
  };
  await fs.writeFile(cache, JSON.stringify(foreign));
  acquired = await f.acquire();
  c = await f.collect(acquired.data.passId);
  assert.equal(c.data.cacheDegradation.code, 'CACHE_REPOSITORY_MISMATCH');
  assert.equal(await fs.readFile(cache, 'utf8'), JSON.stringify(foreign));
});
test('real runtime guard rejects nonignored, tracked or symlinked state and linked worktree aliases', async (t) => {
  for (const kind of ['nonignored', 'tracked', 'symlink', 'linked']) {
    const f = await repository(t);
    if (kind === 'nonignored') await fs.writeFile(path.join(f.root, '.gitignore'), '');
    if (kind === 'tracked') {
      await fs.mkdir(path.join(f.root, '.effective-flow'));
      await fs.writeFile(path.join(f.root, '.effective-flow/config.json'), '{}');
      f.git('add', '-f', '.effective-flow/config.json');
    }
    if (kind === 'symlink') {
      const outside = path.join(f.directory, 'outside');
      await fs.mkdir(outside);
      await fs.symlink(outside, path.join(f.root, '.effective-flow'));
    }
    let result;
    if (kind === 'linked') {
      const linked = path.join(f.directory, 'linked');
      f.git('worktree', 'add', '--detach', linked);
      result = await f.run('pass-lock-acquire', { cwd: linked });
    } else result = await f.acquire();
    assert.equal(result.error.code, 'UNSAFE_RUNTIME_STATE', `${kind}: ${JSON.stringify(result)}`);
  }
});

test('a guarded child cannot authorize creating its nonignored directory target', async (t) => {
  const f = await repository(t);
  await fs.mkdir(path.join(f.root, '.effective-flow'));
  await fs.writeFile(
    path.join(f.root, '.gitignore'),
    '.effective-flow/*\n!.effective-flow/issue-buddy/\n.effective-flow/issue-buddy/.guard\n.effective-flow/issue-buddy/pass.lock\n',
  );
  const ignored = (target) =>
    spawnSync('git', ['check-ignore', '--no-index', '-q', '--', target], { cwd: f.root }).status;
  assert.equal(ignored('.effective-flow/config.json'), 0);
  assert.equal(ignored('.effective-flow/issue-buddy/.guard'), 0);
  assert.equal(ignored('.effective-flow/issue-buddy/'), 1);
  const refused = await f.acquire();
  assert.equal(refused.ok, false);
  assert.equal(refused.error.code, 'UNSAFE_RUNTIME_STATE');
  await assert.rejects(fs.stat(path.join(f.root, '.effective-flow/issue-buddy')), {
    code: 'ENOENT',
  });
});

test('creating missing runtime parents checks each actual directory before a nonrecursive mkdir', async (t) => {
  const f = await repository(t);
  const events = [];
  const observed = {
    ...fs,
    mkdir: async (target, options) => {
      events.push({ target, options });
      const relative = path.relative(f.root, target).replaceAll(path.sep, '/');
      const guardRead = f.calls.at(-1);
      // The complete guard includes lstat after Git reads; the concrete directory read must be
      // present before this mkdir even when several parents were initially missing.
      assert.ok(
        f.calls.some(
          (call) =>
            call.executable === 'git' &&
            call.args[0] === 'check-ignore' &&
            call.args.at(-1) === `${relative}/`,
        ),
      );
      assert.equal(guardRead.cwd, f.root);
      assert.notEqual(options?.recursive, true);
      return fs.mkdir(target, options);
    },
  };
  const acquired = await f.run('pass-lock-acquire', {}, { fs: observed });
  assert.equal(acquired.ok, true, JSON.stringify(acquired));
  assert.equal(
    f.calls.some((call) => call.args.includes('--verbose') || call.args.includes('-v')),
    false,
  );
  assert.deepEqual(
    events.map((entry) => path.relative(f.root, entry.target)),
    ['.effective-flow', path.join('.effective-flow', 'issue-buddy')],
  );
});

test(
  'real worktree callers share the physical primary endpoint even after origin changes',
  { timeout: 30000 },
  async (t) => {
    const f = await repository(t);
    const worktrees = [path.join(f.directory, 'caller-one'), path.join(f.directory, 'caller-two')];
    for (const directory of worktrees) f.git('worktree', 'add', '--detach', directory);
    const source = `
    import * as fs from 'node:fs/promises';
    import { createServer } from 'node:net';
    import { executeOperation } from ${JSON.stringify(new URL('../src/scripts/issue-buddy-core.mjs', import.meta.url).href)};
    import { createProcessRunner } from ${JSON.stringify(new URL('../src/scripts/process-runner.mjs', import.meta.url).href)};
    let endpoint;
    const factory = (listener) => {
      const server = createServer(listener);
      const listen = server.listen.bind(server);
      server.listen = (options) => { endpoint = options; return listen(options); };
      return server;
    };
    const observed = { ...fs, link: async (...args) => {
      process.send({ endpoint });
      await new Promise(resolve => process.once('message', resolve));
      return fs.link(...args);
    } };
    const result = await executeOperation('pass-lock-acquire', { cwd: ${JSON.stringify(f.root)} }, {
      runner: createProcessRunner(), createServer: factory,
      fs: process.argv[1] === 'pause' ? observed : fs,
    });
    process.stdout.write(JSON.stringify({ endpoint, result }));
    process.disconnect();
  `;
    function actor(cwd, pause = false) {
      const child = spawn(
        process.execPath,
        ['--input-type=module', '-e', source, pause ? 'pause' : 'run'],
        { cwd, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (bytes) => {
        stdout += bytes;
      });
      child.stderr.on('data', (bytes) => {
        stderr += bytes;
      });
      const ready = new Promise((resolve) => child.once('message', resolve));
      const timer = setTimeout(() => child.kill('SIGKILL'), 20000);
      const done = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => {
          clearTimeout(timer);
          if (code !== 0) reject(new Error(`worktree child ${code}/${signal}: ${stderr}`));
          else resolve(JSON.parse(stdout));
        });
      });
      done.catch(() => {});
      t.after(async () => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        await done.catch(() => {});
      });
      return { child, ready, done };
    }
    const first = actor(worktrees[0], true);
    const { endpoint } = await first.ready;
    f.git('remote', 'set-url', 'origin', 'https://github.com/other/repository.git');
    const second = await actor(worktrees[1]).done;
    assert.deepEqual(second.endpoint, endpoint);
    assert.deepEqual(endpoint, { host: '127.0.0.1', port: endpoint.port, exclusive: true });
    assert.equal(second.result.error.code, 'LOCKED');
    assert.deepEqual(second.result.error.details, {});
    first.child.send({ continue: true });
    const acquired = (await first.done).result;
    assert.equal(acquired.ok, true, JSON.stringify(acquired));
    assert.equal((await f.run('pass-lock-release', { passId: acquired.data.passId })).ok, true);
  },
);

test('initial pass publication guards both hard-link endpoints and cannot replace a foreign holder', async (t) => {
  const f = await repository(t);
  let published = false;
  const foreign = {
    passId: 'foreign-holder',
    acquiredAt: NOW,
    pid: process.pid,
    hostname: 'fixture-host',
  };
  const observed = {
    ...fs,
    link: async (temp, target) => {
      const reads = f.calls.filter(
        (call) => call.executable === 'git' && call.args[0] === 'check-ignore',
      );
      assert.deepEqual(
        reads.slice(-4).map((call) => call.args.at(-1)),
        [
          '.effective-flow/config.json',
          path.relative(f.root, target),
          '.effective-flow/config.json',
          path.relative(f.root, temp),
        ],
      );
      assert.deepEqual(JSON.parse(await fs.readFile(temp, 'utf8')), {
        passId: JSON.parse(await fs.readFile(temp, 'utf8')).passId,
        acquiredAt: NOW,
        pid: process.pid,
        hostname: (await import('node:os')).hostname(),
      });
      // A create-only link must preserve even a holder that appears at the last boundary.
      await fs.writeFile(target, JSON.stringify(foreign), { flag: 'wx' });
      published = true;
      return fs.link(temp, target);
    },
  };
  const refused = await f.run('pass-lock-acquire', {}, { fs: observed });
  assert.equal(published, true);
  assert.equal(refused.error.code, 'LOCKED');
  assert.equal(refused.error.details.passId, foreign.passId);
  assert.deepEqual(
    JSON.parse(
      await fs.readFile(path.join(f.root, '.effective-flow/issue-buddy/pass.lock'), 'utf8'),
    ),
    foreign,
  );
  assert.deepEqual(await fs.readdir(path.join(f.root, '.effective-flow/issue-buddy')), [
    'pass.lock',
  ]);
});
