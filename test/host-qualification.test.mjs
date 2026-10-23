// Deterministic filesystem fixtures, never behavioral-eval evidence or host qualification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as production from '../evals/_scaffold/host-qualification.mjs';

const SOURCE_PATH = fileURLToPath(
  new URL('../evals/_scaffold/host-qualification.mjs', import.meta.url),
);
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');
const DAY = 86_400_000;
const NOW = Date.parse('2026-10-23T10:00:00.000Z');
const RELEASE = 'https://github.com/openai/codex/releases/tag/rust-v0.159.3';
const PINS = {
  binary: 'sha256:4d210f7c5a18fd0386434df23b5bdbb8c0e7257d3e8a2b30b0769c8bbe99a878',
  companion: 'sha256:9a4f2a846c9f509ca2a9f68ace6f0df2f73c7ed21835e8b186ee52bfccdfa8f3',
  binaryArchive: 'sha256:51de50a39ea592b5b0a64ae0474548c282181cb6b96d9bd08965a682ae12774c',
  companionArchive: 'sha256:d1a3254374b733fff1fa31cbeb20f65e3ef871e3431c196353dea189df15d4c5',
};
const MODES = ['merge-gate-normal', 'merge-gate-negative-nesting', 'iterate', 'next-steps'];
const POLICY =
  'workspace-write;approval-never;network-disabled;isolated-home;attempt-root-writable;ignore-user-config;ignore-rules';
const SCRIPT =
  "const fs=require('node:fs');const input=fs.readFileSync('input.txt','utf8');fs.writeFileSync('actual-tool-output.txt',input.toUpperCase(),{flag:'wx'});console.log(input.trim());";
const COMMAND = `node -e ${JSON.stringify(SCRIPT)}`;
const hash = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const iso = (time) => new Date(time).toISOString();
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const jsonl = (events) => events.map(JSON.stringify).join('\n') + '\n';
function profile(mode) {
  return {
    harness: 'codex-cli',
    model: mode === 'next-steps' ? 'gpt-6.1-sol' : 'gpt-6-sol',
    reasoningEffort: mode === 'next-steps' ? 'high' : 'medium',
    reportedVersion: '0.159.3',
    toolPolicy:
      POLICY +
      (mode.startsWith('merge-gate')
        ? ';nesting-by-scenario'
        : mode === 'next-steps'
          ? ';ephemeral'
          : ''),
  };
}
function args(mode, launch, binary) {
  return [
    binary,
    '--strict-config',
    '-a',
    'never',
    '-s',
    'workspace-write',
    '-C',
    launch.cwd,
    '-c',
    'sandbox_workspace_write.network_access=false',
    '-c',
    `sandbox_workspace_write.writable_roots=${JSON.stringify([launch.attemptRoot])}`,
    '-c',
    'sandbox_workspace_write.exclude_tmpdir_env_var=true',
    '-c',
    'sandbox_workspace_write.exclude_slash_tmp=true',
    '-c',
    `model_reasoning_effort=${JSON.stringify(profile(mode).reasoningEffort)}`,
    '-c',
    `features.multi_agent_v2.max_concurrent_threads_per_session=${mode === 'merge-gate-negative-nesting' ? 2 : 100}`,
    'exec',
    '--ignore-user-config',
    '--ignore-rules',
    '--json',
    '-m',
    profile(mode).model,
    '--output-last-message',
    launch.lastMessagePath,
    ...(mode === 'next-steps' ? ['--ephemeral'] : []),
    '-',
  ];
}
function write(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
  return { path, sha256: hash(bytes) };
}
const writeJson = (path, value) => write(path, JSON.stringify(value));
function launchAt(root, mode, binary, measured = false) {
  const launch = {
    profile: profile(mode),
    cwd: join(root, 'attempt-1/project'),
    attemptRoot: join(root, 'attempt-1'),
    home: join(root, 'home'),
    codexHome: join(root, 'codex-home'),
    lastMessagePath: join(root, 'last-message.txt'),
    stdinPath: join(root, 'attempt-1/prompt.txt'),
  };
  for (const key of ['cwd', 'home', 'codexHome']) mkdirSync(launch[key], { recursive: true });
  write(launch.stdinPath, 'deterministic retained prompt\n');
  launch.argv = args(mode, launch, binary);
  if (!measured) write(launch.lastMessagePath, 'original host final message\n');
  return launch;
}
function events(nonce) {
  return [
    { type: 'thread.started' },
    { type: 'turn.started' },
    {
      type: 'item.started',
      item: { type: 'command_execution', command: COMMAND, status: 'in_progress', exit_code: null },
    },
    {
      type: 'item.completed',
      item: {
        type: 'command_execution',
        command: COMMAND,
        status: 'completed',
        exit_code: 0,
        aggregated_output: nonce,
      },
    },
    { type: 'turn.completed' },
  ];
}
async function fixture(t, mode = 'iterate') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'flow-host-qualification-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const toolchain = {};
  for (const key of Object.keys(PINS)) {
    const name = key === 'companion' ? 'codex-code-mode-host' : key;
    toolchain[key] = write(
      join(root, 'toolchain', name),
      `deterministic ${key} fixture; not an executable program\n`,
    );
    if (key === 'binary' || key === 'companion') chmodSync(toolchain[key].path, 0o755);
  }
  toolchain.binaryReceipt = writeJson(join(root, 'binary-receipt.json'), {
    release: RELEASE,
    binary: toolchain.binary.path,
    binarySha256: toolchain.binary.sha256.slice(7),
    archiveSha256: toolchain.binaryArchive.sha256.slice(7),
    version: 'codex-cli 0.159.3',
  });
  toolchain.companionReceipt = writeJson(join(root, 'companion-receipt.json'), {
    source: RELEASE,
    executable: toolchain.companion.path,
    executableSha256: toolchain.companion.sha256.slice(7),
    archive: toolchain.companionArchive.path,
    archiveSha256: toolchain.companionArchive.sha256.slice(7),
  });
  // The root-approved seam substitutes exactly four immutable pin literals in a private copy.
  // No validator logic, exports, API or provenance validation is changed.
  let copiedSource = SOURCE;
  let replacements = 0;
  for (const [key, pin] of Object.entries(PINS)) {
    assert.equal(copiedSource.split(pin).length - 1, 1, `${key} source pin occurs once`);
    copiedSource = copiedSource.replace(pin, toolchain[key].sha256);
    replacements++;
  }
  assert.equal(replacements, 4);
  let restoredSource = copiedSource;
  for (const [key, pin] of Object.entries(PINS))
    restoredSource = restoredSource.replace(toolchain[key].sha256, pin);
  assert.equal(restoredSource, SOURCE, 'only the four source pin literals changed');
  assert.equal(
    readFileSync(SOURCE_PATH, 'utf8'),
    SOURCE,
    'production source and pins remain unchanged',
  );
  const modulePath = join(root, 'fixture-verifier.mjs');
  write(modulePath, copiedSource);
  const imported = await import(pathToFileURL(modulePath).href);
  assert.deepEqual(Object.keys(imported), ['verifyHostQualification']);
  const bundle = { schemaVersion: 1, toolchain, probes: [] };
  for (const [i, probeMode] of MODES.entries()) {
    const d = join(root, probeMode);
    const launch = launchAt(d, probeMode, toolchain.binary.path);
    const nonce = `host-command-probe-${(i + 1).toString(16).padStart(48, '0')}\n`;
    const startedAt = iso(NOW - 2000 + i);
    const probe = {
      mode: probeMode,
      launch: writeJson(join(d, 'launch.json'), {
        mode: probeMode,
        ...launch,
        startedAt,
        binarySha256: toolchain.binary.sha256,
        companionSha256: toolchain.companion.sha256,
      }),
      outcome: writeJson(join(d, 'outcome.json'), {
        mode: probeMode,
        startedAt,
        finishedAt: iso(NOW - 1000 + i),
        exitCode: 0,
        timedOut: false,
        nonForked: true,
        taskInput: 'host-preflight-only',
      }),
      stdin: { path: launch.stdinPath, sha256: hash(readFileSync(launch.stdinPath)) },
      stdout: write(join(d, 'stdout.jsonl'), jsonl(events(nonce))),
      stderr: write(join(d, 'stderr.log'), ''),
      lastMessage: {
        path: launch.lastMessagePath,
        sha256: hash(readFileSync(launch.lastMessagePath)),
      },
      input: write(join(launch.cwd, 'input.txt'), nonce),
      output: write(join(launch.cwd, 'actual-tool-output.txt'), nonce.toUpperCase()),
    };
    bundle.probes.push(probe);
  }
  const launch = {
    suite: mode.startsWith('merge-gate') ? 'merge-gate' : mode,
    scenario:
      mode === 'merge-gate-negative-nesting'
        ? 'nested-spawn-abort-runs-inline'
        : 'deterministic-scenario',
    ...launchAt(join(root, 'measured'), mode, toolchain.binary.path, true),
  };
  const f = {
    root,
    modulePath,
    copiedSource,
    bundle,
    launch,
    now: NOW,
    bundlePath: join(root, 'bundle.json'),
    verifier: imported.verifyHostQualification,
  };
  f.set = (key, bytes, index = 0) => {
    const probe = bundle.probes[index];
    probe[key] = write(probe[key].path, bytes);
  };
  f.record = (key, edit, index = 0) => {
    const data = JSON.parse(readFileSync(bundle.probes[index][key].path, 'utf8'));
    edit(data);
    f.set(key, JSON.stringify(data), index);
  };
  f.events = (edit, index = 0) => {
    const data = readFileSync(bundle.probes[index].stdout.path, 'utf8')
      .trimEnd()
      .split('\n')
      .map(JSON.parse);
    edit(data);
    f.set('stdout', jsonl(data), index);
  };
  f.flush = () => writeJson(f.bundlePath, bundle);
  f.call = () => f.verifier({ bundlePath: f.bundlePath, launch, now: f.now });
  f.verify = () => {
    f.flush();
    return f.call();
  };
  f.flush();
  return f;
}
function refusal(name, mutate, expected = /host qualification refused|ENOENT|ENOTDIR/) {
  test(`deterministic fixture refuses ${name}`, async (t) => {
    const f = await fixture(t);
    await mutate(f);
    assert.throws(() => f.verify(), expected);
  });
}

for (const mode of MODES)
  test(`deterministic four-mode bundle qualifies ${mode} with exact digests and inside-root measured stdin`, async (t) => {
    const f = await fixture(t, mode);
    const result = f.verify();
    assert.deepEqual(result, {
      qualificationDigest: hash(readFileSync(f.bundlePath)),
      verifierPolicyDigest: hash(f.copiedSource),
      mode,
      profile: profile(mode),
      probeDigest: hash(JSON.stringify(canonical(f.bundle.probes.find((p) => p.mode === mode)))),
      verifiedAt: iso(NOW),
      expiresAt: iso(NOW - 1000 + DAY),
    });
    assert.equal(existsSync(f.launch.lastMessagePath), false);
    assert.deepEqual(
      Object.keys(result.profile).sort(),
      ['harness', 'model', 'reasoningEffort', 'reportedVersion', 'toolPolicy'].sort(),
    );
  });

test('production exposes only the approved API and refuses the fictional runtime without substituted production pins', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(Object.keys(production), ['verifyHostQualification']);
  assert.throws(
    () =>
      production.verifyHostQualification({ bundlePath: f.bundlePath, launch: f.launch, now: NOW }),
    /binary policy pin/,
  );
  for (const pin of Object.values(PINS)) assert.equal(SOURCE.split(pin).length - 1, 1);
  assert.equal(readFileSync(SOURCE_PATH, 'utf8'), SOURCE);
});

test('deterministic fixture accepts the observed shell wrapper and benign diagnostics', async (t) => {
  const f = await fixture(t);
  f.events((stream) => {
    for (const e of stream)
      if (e.item?.type === 'command_execution')
        e.item.command = `/bin/zsh -lc ${JSON.stringify(COMMAND)}`;
  });
  f.set('stderr', 'warning: benign diagnostic\n');
  assert.equal(f.verify().mode, 'iterate');
});

for (const [name, edit] of [
  [
    'top-level error event despite completed turn',
    (s) => s.unshift({ type: 'error', message: 'failure' }),
  ],
  [
    'top-level error property',
    (s) => {
      s[0].error = 'failure';
    },
  ],
  ['turn.failed event', (s) => s.splice(4, 0, { type: 'turn.failed' })],
  [
    'error item',
    (s) => s.splice(4, 0, { type: 'item.completed', item: { type: 'error', message: 'failure' } }),
  ],
  [
    'item error property',
    (s) => {
      s[3].item.error = 'failure';
    },
  ],
  [
    'failed command with zero exit',
    (s) => {
      s[3].item.status = 'failed';
    },
  ],
  [
    'nonzero command',
    (s) => {
      s[3].item.exit_code = 1;
    },
  ],
  ['extra command completion', (s) => s.splice(4, 0, structuredClone(s[3]))],
  ['missing command', (s) => s.splice(2, 2)],
  [
    'wrong command',
    (s) => {
      s[3].item.command = 'node -e "console.log(1)"';
    },
  ],
  [
    'wrong command start',
    (s) => {
      s[2].item.command = 'pwd';
    },
  ],
  [
    'wrong aggregated output',
    (s) => {
      s[3].item.aggregated_output = 'fabricated\n';
    },
  ],
  ['duplicate command start', (s) => s.splice(2, 0, structuredClone(s[2]))],
  [
    'invalid command start status',
    (s) => {
      s[2].item.status = 'completed';
    },
  ],
  [
    'invalid command start exit',
    (s) => {
      s[2].item.exit_code = 0;
    },
  ],
  ['unknown event', (s) => s.splice(1, 0, { type: 'unrecognized.event' })],
  ['missing turn start', (s) => s.splice(1, 1)],
  ['missing turn completion', (s) => s.pop()],
  ['duplicate turn start', (s) => s.splice(2, 0, { type: 'turn.started' })],
  ['duplicate turn completion', (s) => s.push({ type: 'turn.completed' })],
  ['command after turn completion', (s) => s.push(structuredClone(s[3]))],
  ['late thread event', (s) => s.push({ type: 'thread.started' })],
  ['completion before command', (s) => s.splice(2, 0, { type: 'turn.completed' })],
  [
    'nonobject item',
    (s) => {
      s[3].item = null;
    },
  ],
])
  refusal(name, (f) => f.events(edit));
for (const [name, bytes] of [
  ['malformed JSONL', '{broken}\n'],
  ['null JSONL event', 'null\n'],
  ['array JSONL event', '[]\n'],
  ['string JSONL event', '"event"\n'],
  ['blank JSONL record', '\n'],
  ['invalid UTF-8 stdout', Buffer.from([255])],
])
  refusal(name, (f) => f.set('stdout', bytes), /host qualification refused|encoded data/);
for (const diagnostic of [
  'code-mode bootstrap failed',
  'native startup error: unknown reason',
  'ERROR unknown native failure',
  'FATAL unexpected diagnostic',
  'PANIC unexpected diagnostic',
  'codex-code-mode-host missing',
])
  refusal(`exit-zero diagnostic ${diagnostic}`, (f) => f.set('stderr', diagnostic));
refusal('bootstrap diagnostics in stdout', (f) =>
  f.events((s) =>
    s.splice(4, 0, {
      type: 'item.completed',
      item: { type: 'agent_message', text: 'bootstrap unavailable' },
    }),
  ),
);
refusal('invalid UTF-8 stderr', (f) => f.set('stderr', Buffer.from([255])), /encoded data/);
refusal('wrong actual file output', (f) => f.set('output', 'wrong\n'));
refusal('missing actual file output', (f) => rmSync(f.bundle.probes[0].output.path));
refusal('empty original last message', (f) => f.set('lastMessage', ''));
refusal('empty retained stdin', (f) => f.set('stdin', ''));
refusal('invalid command nonce', (f) => f.set('input', 'host-command-probe-not-a-nonce\n'));
refusal('duplicate command nonce across modes', (f) => {
  for (const key of ['input', 'output']) f.set(key, readFileSync(f.bundle.probes[0][key].path), 1);
  const nonce = readFileSync(f.bundle.probes[0].input.path, 'utf8');
  f.events((s) => {
    s[3].item.aggregated_output = nonce;
  }, 1);
});

for (const [key, value] of [
  ['exitCode', 1],
  ['timedOut', true],
  ['nonForked', false],
  ['taskInput', 'behavioral-eval'],
  ['mode', 'iterate'],
  ['startedAt', iso(NOW - 9999)],
])
  refusal(`outcome ${key} mismatch`, (f) =>
    f.record('outcome', (r) => {
      r[key] = value;
    }),
  );
refusal('future finish', (f) =>
  f.record('outcome', (r) => {
    r.finishedAt = iso(NOW + 1);
  }),
);
refusal('finish before start', (f) =>
  f.record('outcome', (r) => {
    r.finishedAt = iso(NOW - 3000);
  }),
);
refusal('noncanonical timestamp', (f) =>
  f.record('outcome', (r) => {
    r.finishedAt = '2026-10-23T09:59:59Z';
  }),
);
refusal('invalid calendar timestamp', (f) =>
  f.record('outcome', (r) => {
    r.finishedAt = '2026-02-30T00:00:00.000Z';
  }),
);
refusal('exact 24-hour expiry even when selected probe is newer', (f) => {
  f.now = NOW - 1000 + DAY;
});
refusal('stale unselected probe', (f) => {
  f.now = NOW - 1000 + DAY + 1;
});
test('deterministic fixture accepts one millisecond before earliest 24-hour expiry', async (t) => {
  const f = await fixture(t);
  f.now = NOW - 1000 + DAY - 1;
  assert.equal(f.verify().expiresAt, iso(NOW - 1000 + DAY));
});
for (const now of [NaN, Infinity, NOW + 0.5, '2026-10-23', undefined])
  refusal(`invalid supplied now ${String(now)}`, (f) => {
    f.now = now;
  });

refusal('duplicate mode', (f) => {
  f.bundle.probes[1] = f.bundle.probes[0];
});
refusal('missing mode', (f) => f.bundle.probes.pop());
refusal('extra mode', (f) => f.bundle.probes.push(f.bundle.probes[0]));
refusal('unknown mode', (f) => {
  f.bundle.probes[0].mode = 'other';
});
refusal('launch mode mismatch', (f) =>
  f.record('launch', (r) => {
    r.mode = 'iterate';
  }),
);
refusal('launch binary identity mismatch', (f) =>
  f.record('launch', (r) => {
    r.binarySha256 = `sha256:${'0'.repeat(64)}`;
  }),
);
for (const [name, mutate] of [
  [
    'bundle',
    (f) => {
      f.bundle.completed = true;
    },
  ],
  [
    'toolchain',
    (f) => {
      f.bundle.toolchain.extra = {};
    },
  ],
  [
    'probe',
    (f) => {
      f.bundle.probes[0].completed = true;
    },
  ],
  [
    'artifact reference',
    (f) => {
      f.bundle.probes[0].stdout.cached = true;
    },
  ],
  [
    'record',
    (f) =>
      f.record('launch', (r) => {
        r.extra = true;
      }),
  ],
  [
    'outcome',
    (f) =>
      f.record('outcome', (r) => {
        r.completed = true;
      }),
  ],
  [
    'measured launch',
    (f) => {
      f.launch.env = {};
    },
  ],
  [
    'profile',
    (f) => {
      f.launch.profile.extra = true;
    },
  ],
])
  refusal(`unknown ${name} fields`, mutate);
refusal('wrong schema version', (f) => {
  f.bundle.schemaVersion = 2;
});
refusal('malformed retained launch JSON', (f) => f.set('launch', '{'));
refusal('nonobject retained outcome', (f) => f.set('outcome', 'null'));
refusal('uppercase artifact digest', (f) => {
  f.bundle.probes[0].stdout.sha256 = f.bundle.probes[0].stdout.sha256.toUpperCase();
});

for (const key of [
  'binary',
  'companion',
  'binaryArchive',
  'companionArchive',
  'binaryReceipt',
  'companionReceipt',
])
  refusal(`changed ${key} bytes after reference was recorded`, (f) =>
    writeFileSync(f.bundle.toolchain[key].path, 'changed'),
  );
for (const key of [
  'launch',
  'outcome',
  'stdin',
  'stdout',
  'stderr',
  'lastMessage',
  'input',
  'output',
])
  refusal(`changed probe ${key} bytes after reference was recorded`, (f) =>
    writeFileSync(f.bundle.probes[0][key].path, 'changed'),
  );
refusal('rehashed but unpinned binary', (f) => {
  f.bundle.toolchain.binary = write(f.bundle.toolchain.binary.path, 'changed');
});
for (const [which, key, value] of [
  ['binaryReceipt', 'release', 'https://example.org/release'],
  ['binaryReceipt', 'binary', '/other'],
  ['binaryReceipt', 'version', 'codex-cli 0.159.4'],
  ['binaryReceipt', 'archiveSha256', '0'.repeat(64)],
  ['companionReceipt', 'source', 'https://example.org/release'],
  ['companionReceipt', 'executable', '/other'],
  ['companionReceipt', 'archive', '/other'],
  ['companionReceipt', 'executableSha256', '0'.repeat(64)],
])
  refusal(`rehashed provenance ${which}.${key}`, (f) => {
    const ref = f.bundle.toolchain[which];
    const receipt = JSON.parse(readFileSync(ref.path, 'utf8'));
    receipt[key] = value;
    f.bundle.toolchain[which] = writeJson(ref.path, receipt);
  });
refusal('nonexecutable binary', (f) => chmodSync(f.bundle.toolchain.binary.path, 0o644));
refusal('nonexecutable companion', (f) => chmodSync(f.bundle.toolchain.companion.path, 0o644));
refusal('nonsibling companion even with matching bytes and receipt', (f) => {
  const ref = f.bundle.toolchain.companion;
  f.bundle.toolchain.companion = write(
    join(f.root, 'elsewhere/codex-code-mode-host'),
    readFileSync(ref.path),
  );
  chmodSync(f.bundle.toolchain.companion.path, 0o755);
  const receipt = JSON.parse(readFileSync(f.bundle.toolchain.companionReceipt.path, 'utf8'));
  receipt.executable = f.bundle.toolchain.companion.path;
  f.bundle.toolchain.companionReceipt = writeJson(
    f.bundle.toolchain.companionReceipt.path,
    receipt,
  );
});

for (const [key, value] of [
  ['harness', 'shell'],
  ['model', 'gpt-6.1-sol'],
  ['reasoningEffort', 'high'],
  ['reportedVersion', '0.159.4'],
  ['toolPolicy', POLICY + ';extra'],
])
  refusal(`measured profile ${key} drift`, (f) => {
    f.launch.profile[key] = value;
  });
refusal('probe profile drift', (f) =>
  f.record('launch', (r) => {
    r.profile.model = 'gpt-6.1-sol';
  }),
);
refusal('unknown suite', (f) => {
  f.launch.suite = 'other';
});
for (const scenario of ['', ' spaced ', null])
  refusal(`noncanonical scenario ${String(scenario)}`, (f) => {
    f.launch.scenario = scenario;
  });
for (const [name, mutate] of [
  ['shell-string argv', (a) => a.join(' ')],
  ['missing strict config', (a) => a.filter((x) => x !== '--strict-config')],
  ['alternate approval spelling', (a) => a.map((x) => (x === '-a' ? '--ask-for-approval' : x))],
  ['extra override', (a) => [...a.slice(0, -1), '-c', 'model="other"', '-']],
  ['duplicate override', (a) => [...a.slice(0, -1), '-c', a[9], '-']],
  [
    'cap drift',
    (a) =>
      a.map((x) =>
        x.endsWith('max_concurrent_threads_per_session=100') ? x.replace('=100', '=2') : x,
      ),
  ],
  ['extra ephemeral', (a) => [...a.slice(0, -1), '--ephemeral', '-']],
  ['wrong cwd argument', (a) => a.map((x, i) => (i === 7 ? '/other' : x))],
  ['wrong output argument', (a) => a.map((x, i) => (i === a.length - 2 ? '/other' : x))],
  [
    'root override',
    (a) =>
      a.map((x) =>
        x.startsWith('sandbox_workspace_write.writable_roots=')
          ? 'sandbox_workspace_write.writable_roots=["/"]'
          : x,
      ),
  ],
  [
    'reordered flags',
    (a) => {
      [a[1], a[2]] = [a[2], a[1]];
      return a;
    },
  ],
])
  refusal(`measured argv ${name}`, (f) => {
    f.launch.argv = mutate(f.launch.argv);
  });
refusal('probe argv drift', (f) =>
  f.record('launch', (r) => {
    r.argv.splice(1, 1);
  }),
);
test('deterministic fixture refuses missing next-steps ephemeral and negative-nesting cap drift', async (t) => {
  const next = await fixture(t, 'next-steps');
  next.launch.argv = next.launch.argv.filter((x) => x !== '--ephemeral');
  assert.throws(() => next.verify(), /argv mismatch/);
  const negative = await fixture(t, 'merge-gate-negative-nesting');
  negative.launch.argv = negative.launch.argv.map((x) =>
    x.endsWith('max_concurrent_threads_per_session=2') ? x.replace('=2', '=100') : x,
  );
  assert.throws(() => negative.verify(), /argv mismatch/);
});

refusal('cwd equal to attempt root', (f) => {
  f.launch.cwd = f.launch.attemptRoot;
  f.launch.argv = args('iterate', f.launch, f.bundle.toolchain.binary.path);
});
refusal('home inside writable root', (f) => {
  f.launch.home = join(f.launch.attemptRoot, 'home');
  mkdirSync(f.launch.home);
});
refusal('codex home inside writable root', (f) => {
  f.launch.codexHome = join(f.launch.attemptRoot, 'codex-home');
  mkdirSync(f.launch.codexHome);
});
refusal('identical homes', (f) => {
  f.launch.home = f.launch.codexHome;
});
refusal('last message inside writable root', (f) => {
  f.launch.lastMessagePath = join(f.launch.attemptRoot, 'last-message.txt');
});
refusal('preexisting measured last message', (f) => write(f.launch.lastMessagePath, 'old'));
refusal('missing measured stdin', (f) => rmSync(f.launch.stdinPath));
refusal('nonregular measured stdin', (f) => {
  rmSync(f.launch.stdinPath);
  mkdirSync(f.launch.stdinPath);
});
refusal('relative stdin', (f) => {
  f.launch.stdinPath = 'prompt.txt';
});
refusal('nonnormalized stdin', (f) => {
  f.launch.stdinPath = `${f.launch.attemptRoot}/../attempt-1/prompt.txt`;
});
refusal('symlinked measured stdin', (f) => {
  renameSync(f.launch.stdinPath, f.launch.stdinPath + '.original');
  symlinkSync(f.launch.stdinPath + '.original', f.launch.stdinPath);
});
refusal('symlinked directory component', (f) => {
  const alias = join(f.root, 'linked-attempt');
  symlinkSync(f.launch.attemptRoot, alias);
  f.launch.stdinPath = join(alias, 'prompt.txt');
});
refusal('symlinked bundle file', (f) => {
  renameSync(f.bundlePath, f.bundlePath + '.original');
  symlinkSync(f.bundlePath + '.original', f.bundlePath);
});
refusal('symlinked tool binary', (f) => {
  const path = f.bundle.toolchain.binary.path;
  renameSync(path, path + '.original');
  symlinkSync(path + '.original', path);
});
refusal('symlinked probe artifact', (f) => {
  const path = f.bundle.probes[0].stdout.path;
  renameSync(path, path + '.original');
  symlinkSync(path + '.original', path);
});
refusal('probe artifact outside private directory', (f) => {
  f.bundle.probes[0].stderr = write(join(f.root, 'escaped-stderr'), '');
});
refusal('probe stdin reference mismatch', (f) => {
  f.bundle.probes[0].stdin = write(
    join(dirname(f.bundle.probes[0].launch.path), 'other-stdin'),
    'prompt',
  );
});
refusal('probe output path substitution mismatch', (f) => {
  f.bundle.probes[0].output = write(
    join(dirname(f.bundle.probes[0].launch.path), 'other-output'),
    readFileSync(f.bundle.probes[0].output.path),
  );
});
refusal('probe topology drift', (f) =>
  f.record('launch', (r) => {
    r.home = f.launch.home;
  }),
);
for (const name of ['config.toml', 'rules', 'skills', 'AGENTS.md', 'CLAUDE.md', 'instructions.txt'])
  refusal(`staged measured home ${name}`, (f) =>
    write(join(f.launch.home, 'nested', name), 'forbidden'),
  );
refusal('staged codex home configuration', (f) =>
  write(join(f.launch.codexHome, 'config.toml'), 'forbidden'),
);
refusal('unexpected measured home symlink', (f) =>
  symlinkSync('/missing-target', join(f.launch.home, 'unexpected')),
);
refusal('ordinary authentication file', (f) =>
  write(join(f.launch.codexHome, 'auth.json'), 'must never be read'),
);
test('deterministic fixture accepts launch-only authentication symlink without following or reading it', async (t) => {
  const f = await fixture(t);
  symlinkSync(join(f.root, 'nonexistent-private-auth'), join(f.launch.codexHome, 'auth.json'));
  assert.equal(f.verify().mode, 'iterate');
});

test('verification is read-only, retains exact fixture bytes and has no process or model surface', async (t) => {
  const f = await fixture(t);
  function snapshot(path) {
    const stat = lstatSync(path);
    return stat.isDirectory()
      ? {
          mode: stat.mode,
          children: Object.fromEntries(
            readdirSync(path)
              .sort()
              .map((name) => [name, snapshot(join(path, name))]),
          ),
        }
      : { mode: stat.mode, bytes: hash(readFileSync(path)) };
  }
  const before = snapshot(f.root),
    cwd = process.cwd(),
    env = { ...process.env };
  const launch = structuredClone(f.launch);
  const beforeImports = [...SOURCE.matchAll(/from '(node:[^']+)'/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(beforeImports, ['node:crypto', 'node:fs', 'node:path', 'node:url']);
  assert.match(SOURCE, /import \{ lstatSync, readdirSync, readFileSync \} from 'node:fs'/);
  f.call();
  assert.deepEqual(snapshot(f.root), before);
  assert.deepEqual(f.launch, launch);
  assert.equal(process.cwd(), cwd);
  assert.deepEqual({ ...process.env }, env);
});

test('returned profile mutation cannot change source-owned policy on subsequent calls', async (t) => {
  const f = await fixture(t);
  const first = f.verify();
  first.profile.model = 'caller-selected-model';
  first.profile.toolPolicy = 'caller-selected-policy';
  assert.deepEqual(f.verify().profile, profile('iterate'));
  f.launch.profile.model = 'caller-selected-model';
  assert.throws(() => f.verify(), /profile mismatch/);
});
