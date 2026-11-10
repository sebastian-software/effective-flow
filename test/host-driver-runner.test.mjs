import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { pythonCaseBudgets, runPythonCase } from '../scripts/host-driver-tests.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const execute = promisify(execFile);
const posix = { skip: process.platform === 'win32' ? 'requires POSIX process groups' : false };

function fixture(context, modules) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'effective-flow-host-driver-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(path.join(directory, 'test'));
  const testsDirectory = path.join(directory, 'evals/host-driver/tests');
  mkdirSync(testsDirectory, { recursive: true });
  symlinkSync(path.join(root, 'scripts'), path.join(directory, 'scripts'), 'dir');
  copyFileSync(
    path.join(root, 'test/host-driver.test.mjs'),
    path.join(directory, 'test/host-driver.test.mjs'),
  );
  for (const [filename, source] of Object.entries(modules)) {
    writeFileSync(path.join(testsDirectory, filename), source);
  }
  return directory;
}

async function runDriver(directory) {
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  try {
    return {
      ...(await execute(
        process.execPath,
        ['--test', '--test-reporter=tap', 'test/host-driver.test.mjs'],
        {
          cwd: directory,
          env: environment,
          timeout: 15_000,
        },
      )),
      code: 0,
    };
  } catch (error) {
    return error;
  }
}

function blockedCase(context) {
  return fixture(context, {
    'test_blocked.py': `import os, signal, unittest
from pathlib import Path
class Cases(unittest.TestCase):
    def test_blocked(self):
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        Path(__file__).with_name('blocked.pid').write_text(str(os.getpid()))
        print('OWNER_READY', flush=True)
        signal.pause()
`,
  });
}

function assertChildGone(directory) {
  const pid = Number(
    readFileSync(path.join(directory, 'evals/host-driver/tests/blocked.pid'), 'utf8'),
  );
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
}

const recoveryIdentity =
  'test_remaining_stage_composed.ComposedRemainingStageContracts.test_real_six_worker_recovery_preserves_original_closures_and_next_batch_gate';

test('only the exact composed Recovery identity receives longer owner budgets', () => {
  assert.deepEqual(pythonCaseBudgets(recoveryIdentity), {
    pythonTimeout: 210_000,
    nodeTimeout: 240_000,
  });
  for (const identity of [
    undefined,
    '',
    'discovery',
    'test_remaining_stage_composed',
    'test_remaining_stage_composed.ComposedRemainingStageContracts',
    'test_remaining_stage_composed.ComposedRemainingStageContracts.test_composed_runtime_pins_copy_shared_executable_inputs',
    'test_remaining_stage_composed.ComposedRemainingStageContracts.test_real_unknown_start_blocks_next_batch_without_refunding_admission',
    recoveryIdentity + '_extra',
    'prefix.' + recoveryIdentity,
    recoveryIdentity.replace('ComposedRemainingStageContracts', 'OtherContracts'),
    recoveryIdentity.replace('test_remaining_stage_composed.', 'test_other.'),
    recoveryIdentity.toUpperCase(),
    recoveryIdentity + '\n',
  ]) {
    assert.deepEqual(
      pythonCaseBudgets(identity),
      { pythonTimeout: 150_000, nodeTimeout: 180_000 },
      String(identity),
    );
  }
});

test(
  'composed interpreter budgets nest inside the selected Python and Node owners',
  posix,
  async () => {
    const result = await execute(
      'python3',
      [
        '-B',
        '-c',
        `import ast, json, sys
from pathlib import Path
tree = ast.parse(Path(sys.argv[1]).read_text())
method = next(node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef) and node.name == 'run_composed_batch')
call, = [node for node in ast.walk(method) if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'LOCAL_RUN']
timeout = next(keyword.value for keyword in call.keywords if keyword.arg == 'timeout')
assert isinstance(timeout, ast.IfExp) and isinstance(timeout.test, ast.Name) and timeout.test.id == 'unknown'
print(json.dumps([ast.literal_eval(timeout.orelse), ast.literal_eval(timeout.body)]))
`,
        path.join(root, 'evals/host-driver/tests/test_remaining_stage_composed.py'),
      ],
      { timeout: 5_000 },
    );
    const [recovery, unknown] = JSON.parse(result.stdout);
    assert.equal(recovery, 180);
    assert.equal(unknown, 120);
    for (const [identity, interpreter] of [
      [recoveryIdentity, recovery],
      [
        'test_remaining_stage_composed.ComposedRemainingStageContracts.test_real_unknown_start_blocks_next_batch_without_refunding_admission',
        unknown,
      ],
    ]) {
      const { pythonTimeout, nodeTimeout } = pythonCaseBudgets(identity);
      assert.equal(pythonTimeout - interpreter * 1_000, 30_000);
      assert.equal(nodeTimeout - pythonTimeout, 30_000);
    }
  },
);

for (const owner of ['Python', 'Node']) {
  test(
    `the selected ${owner} owner timeout propagates through the Node driver`,
    posix,
    async (context) => {
      const directory = fixture(context, {
        'test_remaining_stage_composed.py': `import os, signal, unittest
from pathlib import Path
class ComposedRemainingStageContracts(unittest.TestCase):
    def test_real_six_worker_recovery_preserves_original_closures_and_next_batch_gate(self):
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        Path(__file__).with_name('blocked.pid').write_text(str(os.getpid()))
        signal.pause()
`,
      });
      rmSync(path.join(directory, 'scripts'));
      mkdirSync(path.join(directory, 'scripts'));
      const runner = readFileSync(path.join(root, 'scripts/host-driver-tests.mjs'), 'utf8');
      const selected = '{ pythonTimeout: 210_000, nodeTimeout: 240_000 }';
      assert.equal(runner.split(selected).length, 2);
      writeFileSync(
        path.join(directory, 'scripts/host-driver-tests.mjs'),
        runner.replace(
          selected,
          owner === 'Python'
            ? '{ pythonTimeout: 1_000, nodeTimeout: 5_000 }'
            : '{ pythonTimeout: 5_000, nodeTimeout: 1_000 }',
        ),
      );
      const result = await runDriver(directory);
      assert.equal(result.code, 1, result.stdout + result.stderr);
      if (owner === 'Python') {
        assert.match(result.stdout, /Python unittest timed out after 1000 ms/);
        assert.match(result.stdout, /ETIMEDOUT/);
        assert.match(result.stdout, /# fail 1\b/);
        assert.match(result.stdout, /# cancelled 0\b/);
      } else {
        assert.match(result.stdout, /test timed out after 1000ms/);
        assert.match(result.stdout, /# cancelled 1\b/);
      }
      assertChildGone(directory);
    },
  );
}

test(
  'discovered cases get distinct Node tests and fresh Python processes, not a module budget',
  posix,
  async (context) => {
    const source = `import json, os, unittest
from pathlib import Path
calls = 0
class Cases(unittest.TestCase):
    def record(self):
        global calls
        calls += 1
        self.assertEqual(calls, 1, 'cases must not share a Python process')
        with Path(__file__).with_name('runs.jsonl').open('a') as output:
            output.write(json.dumps({'id': self.id(), 'pid': os.getpid()}) + '\\n')
    def test_first(self): self.record()
    def test_second(self): self.record()
`;
    const directory = fixture(context, { 'test_alpha.py': source, 'test_beta.py': source });
    const result = await runDriver(directory);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /# tests 4\b/);
    const records = readFileSync(path.join(directory, 'evals/host-driver/tests/runs.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(new Set(records.map((record) => record.id)).size, 4);
    assert.equal(new Set(records.map((record) => record.pid)).size, 4);
  },
);

for (const [label, modules, diagnostic] of [
  [
    'import failure',
    { 'test_broken.py': "raise RuntimeError('discovery import sentinel')" },
    /discovery import sentinel/,
  ],
  [
    'load_tests failure',
    { 'test_broken.py': "def load_tests(*args): raise RuntimeError('discovery loader sentinel')" },
    /discovery loader sentinel/,
  ],
  [
    'empty discovery',
    { 'test_empty.py': 'import unittest' },
    /no Python unittest cases discovered/i,
  ],
  ['no modules', {}, /no Python unittest cases discovered/i],
]) {
  test(`Python discovery fails closed on ${label}`, posix, async (context) => {
    const result = await runDriver(fixture(context, modules));
    assert.equal(result.code, 1, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, diagnostic);
  });
}

test('a nonzero Python case fails the Node driver with its diagnostic', posix, async (context) => {
  const directory = fixture(context, {
    'test_failure.py':
      "import unittest\nclass Cases(unittest.TestCase):\n    def test_failure(self): self.fail('case failure sentinel')\n",
  });
  const result = await runDriver(directory);
  assert.equal(result.code, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /case failure sentinel/);
});

for (const failed of [false, true]) {
  test(
    `Python ${failed ? 'failure' : 'success'} cleans up surviving descendants`,
    posix,
    async (context) => {
      const directory = fixture(context, {
        'test_descendant.py': `import os, signal, time, unittest
from pathlib import Path
class Cases(unittest.TestCase):
    def test_descendant(self):
        ready = Path(__file__).with_name('descendant.pid')
        child = os.fork()
        if child == 0:
            signal.signal(signal.SIGTERM, signal.SIG_IGN)
            ready.write_text(str(os.getpid()))
            while True: signal.pause()
        deadline = time.monotonic() + 5
        while not ready.exists():
            if time.monotonic() >= deadline: self.fail('descendant did not become ready')
            time.sleep(.01)
        ${failed ? "self.fail('parent failure sentinel')" : 'self.assertTrue(ready.exists())'}
`,
      });
      let descendant;
      try {
        const run = runPythonCase(directory, 'test_descendant.Cases.test_descendant', {
          timeout: 5_000,
          killGrace: 100,
        });
        if (failed) await assert.rejects(run, { status: 1, signal: null });
        else await run;
        descendant = Number(
          readFileSync(path.join(directory, 'evals/host-driver/tests/descendant.pid'), 'utf8'),
        );
        try {
          process.kill(descendant, 0);
          if (process.platform === 'linux') {
            assert.match(
              readFileSync(`/proc/${descendant}/stat`, 'utf8'),
              /\) Z /,
              'descendant must not remain running',
            );
          } else {
            const result = await execute('ps', ['-o', 'stat=', '-p', String(descendant)]);
            assert.match(result.stdout.trim(), /^Z/, 'descendant must not remain running');
          }
        } catch (error) {
          if (!['ENOENT', 'ESRCH', 1].includes(error.code)) throw error;
        }
      } finally {
        try {
          descendant ??= Number(
            readFileSync(path.join(directory, 'evals/host-driver/tests/descendant.pid'), 'utf8'),
          );
          process.kill(descendant, 'SIGKILL');
        } catch (error) {
          if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error;
        }
      }
    },
  );
}

test(
  'isolated cases can import sibling driver modules without a preceding case',
  posix,
  async (context) => {
    const directory = fixture(context, {
      'test_runtime_import.py': `import unittest
class Cases(unittest.TestCase):
    def test_runtime_import(self):
        from eval_driver_runtime import FIXTURE_SENTINEL
        self.assertEqual(FIXTURE_SENTINEL, 'driver import sentinel')
`,
    });
    writeFileSync(
      path.join(directory, 'evals/host-driver/eval_driver_runtime.py'),
      "FIXTURE_SENTINEL = 'driver import sentinel'\n",
    );
    const result = await runDriver(directory);
    assert.equal(result.code, 0, result.stdout + result.stderr);
  },
);

test(
  'the child deadline escalates SIGTERM to SIGKILL and reaps a blocked case',
  posix,
  async (context) => {
    const directory = blockedCase(context);
    await assert.rejects(
      runPythonCase(directory, 'test_blocked.Cases.test_blocked', {
        timeout: 1_000,
        killGrace: 100,
      }),
      { code: 'ETIMEDOUT', signal: 'SIGKILL' },
    );
    assertChildGone(directory);
  },
);

test(
  'the Node test deadline remains effective and aborts its Python child',
  posix,
  async (context) => {
    const directory = blockedCase(context);
    writeFileSync(
      path.join(directory, 'deadline.mjs'),
      `
import { test } from 'node:test';
import { runPythonCase } from './scripts/host-driver-tests.mjs';
test('outer deadline', { timeout: 1_000 }, (context) =>
  runPythonCase(process.cwd(), 'test_blocked.Cases.test_blocked', { signal: context.signal, killGrace: 100 }));
`,
    );
    const environment = { ...process.env };
    delete environment.NODE_TEST_CONTEXT;
    await assert.rejects(
      execute(process.execPath, ['--test', '--test-reporter=tap', 'deadline.mjs'], {
        cwd: directory,
        env: environment,
        timeout: 15_000,
      }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stdout, /test timed out after 1000ms/);
        return true;
      },
    );
    assertChildGone(directory);
  },
);

test('Windows skips without invoking Python discovery', posix, async (context) => {
  const directory = fixture(context, {});
  const environment = { ...process.env, PATH: '' };
  delete environment.NODE_TEST_CONTEXT;
  const result = await execute(
    process.execPath,
    [
      '--input-type=module',
      '--test-reporter=tap',
      '-e',
      `
Object.defineProperty(process, 'platform', { value: 'win32' });
await import('./test/host-driver.test.mjs');
`,
    ],
    { cwd: directory, env: environment, timeout: 15_000 },
  );
  assert.match(result.stdout, /# SKIP requires POSIX process groups/);
  assert.match(result.stdout, /# skipped 1\b/);
});

for (const phase of ['case', 'discovery']) {
  for (const ownerSignal of ['SIGINT', 'SIGTERM']) {
    test(`owner ${ownerSignal} cleans up active Python ${phase}`, posix, async (context) => {
      const directory = blockedCase(context);
      if (phase === 'discovery') {
        writeFileSync(
          path.join(directory, 'evals/host-driver/tests/test_blocked.py'),
          `import os, signal, sys
from pathlib import Path
signal.signal(signal.SIGTERM, signal.SIG_IGN)
Path(__file__).with_name('blocked.pid').write_text(str(os.getpid()))
print('OWNER_READY', file=sys.stderr, flush=True)
signal.pause()
`,
        );
      }
      writeFileSync(
        path.join(directory, 'owner.mjs'),
        `import { discoverPythonCases, runPythonCase } from './scripts/host-driver-tests.mjs';
await ${phase === 'case' ? "runPythonCase(process.cwd(), 'test_blocked.Cases.test_blocked')" : 'discoverPythonCases(process.cwd())'};
`,
      );
      const owner = spawn(process.execPath, ['owner.mjs'], {
        cwd: directory,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const exited = once(owner, 'exit');
      let output = '';
      const ready = new Promise((resolveReady) => {
        for (const stream of [owner.stdout, owner.stderr]) {
          stream.setEncoding('utf8').on('data', (chunk) => {
            output += chunk;
            if (output.includes('OWNER_READY')) resolveReady();
          });
        }
      });
      try {
        await Promise.race([
          ready,
          once(AbortSignal.timeout(10_000), 'abort').then(() => {
            throw new Error('Python owner fixture did not become ready');
          }),
        ]);
        owner.kill(ownerSignal);
        const [code, signal] = await exited;
        assert.equal(signal, null);
        assert.equal(code, ownerSignal === 'SIGINT' ? 130 : 143);
        assertChildGone(directory);
      } finally {
        if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL');
        const pidPath = path.join(directory, 'evals/host-driver/tests/blocked.pid');
        try {
          process.kill(Number(readFileSync(pidPath, 'utf8')), 'SIGKILL');
        } catch (error) {
          if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error;
        }
        await exited;
      }
    });
  }
}
