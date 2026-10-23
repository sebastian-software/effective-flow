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
// The exact source-owned command is a fixture contract, never executed by these tests.
const PROBE_SCRIPT =
  'const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");const expected=process.argv[1],shell=process.argv[2],prefix=process.argv[3],cliTmpdir=process.argv[4],input=fs.readFileSync("input.txt"),stream=fs.readFileSync(0);if(!stream.equals(input)||process.env.TMPDIR!==expected||shell!==expected||prefix!==path.join(expected,"zsh")||process.env.TMPPREFIX!==prefix||process.cwd()!==path.join(path.dirname(expected),"project"))throw Error("host probe stream or environment mismatch");const hash=crypto.createHash("sha256").update(input).digest("hex"),temp=path.join(expected,"host-command-"+hash+".tmp");const fd=fs.openSync(temp,"wx",0o600);try{if(fs.realpathSync(temp)!==temp)throw Error("host probe temporary physical path mismatch");fs.writeFileSync(fd,input);}finally{fs.closeSync(fd);}if(!fs.readFileSync(temp).equals(input))throw Error("host probe temporary bytes mismatch");fs.unlinkSync(temp);if(fs.existsSync(temp))throw Error("host probe temporary removal failed");const denied=path.join(cliTmpdir,"host-denied-"+hash+".tmp");let deniedFd,deniedCode;try{deniedFd=fs.openSync(denied,"wx",0o600);}catch(error){if(error.code!=="EPERM"&&error.code!=="EACCES")throw error;deniedCode=error.code;}if(deniedFd!==undefined){try{fs.closeSync(deniedFd);}finally{fs.unlinkSync(denied);}throw Error("host probe CLI temporary directory unexpectedly writable");}if(fs.existsSync(denied))throw Error("host probe CLI temporary denial left a file");fs.writeFileSync("actual-tool-output.txt",input.toString("utf8").toUpperCase(),{flag:"wx"});fs.writeFileSync("actual-environment.json",JSON.stringify({schemaVersion:1,tmpdir:expected,shellTMPDIR:shell,nodeTMPDIR:process.env.TMPDIR,shellTMPPREFIX:prefix,nodeTMPPREFIX:process.env.TMPPREFIX,cliTmpdir,cliTmpdirWriteDenied:true,cliTmpdirWriteErrorCode:deniedCode,cwd:process.cwd(),stdinDigest:"sha256:"+hash,stdinBytes:input.length,tempPath:temp,tempCreatedExclusive:true,tempRemoved:true})+"\\n",{flag:"wx",mode:0o600});process.stdout.write(input);';
const shellQuote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
function command(launch, input) {
  const inner =
    "cat <<'EF_HOST_QUALIFICATION_INPUT' | node -e " +
    shellQuote(PROBE_SCRIPT) +
    ' ' +
    shellQuote(launch.tmpdir) +
    ' "$TMPDIR" "$TMPPREFIX" ' +
    shellQuote(launch.cliTmpdir) +
    '\n' +
    input +
    'EF_HOST_QUALIFICATION_INPUT';
  return '/bin/zsh -lc ' + shellQuote(inner);
}
function environmentReceipt(launch, input, errorCode = 'EPERM') {
  return {
    schemaVersion: 1,
    tmpdir: launch.tmpdir,
    shellTMPDIR: launch.tmpdir,
    nodeTMPDIR: launch.tmpdir,
    shellTMPPREFIX: join(launch.tmpdir, 'zsh'),
    nodeTMPPREFIX: join(launch.tmpdir, 'zsh'),
    cliTmpdir: launch.cliTmpdir,
    cliTmpdirWriteDenied: true,
    cliTmpdirWriteErrorCode: errorCode,
    cwd: launch.cwd,
    stdinDigest: hash(input),
    stdinBytes: Buffer.byteLength(input),
    tempPath: join(launch.tmpdir, `host-command-${hash(input).slice(7)}.tmp`),
    tempCreatedExclusive: true,
    tempRemoved: true,
  };
}
const receiptBytes = (launch, input, errorCode) =>
  JSON.stringify(environmentReceipt(launch, input, errorCode)) + '\n';
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
    `shell_environment_policy.set.TMPDIR=${JSON.stringify(launch.tmpdir)}`,
    '-c',
    `shell_environment_policy.set.TMPPREFIX=${JSON.stringify(join(launch.tmpdir, 'zsh'))}`,
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
    tmpdir: join(root, 'attempt-1/tmp'),
    cliTmpdir: join(root, 'attempt-1-cli-tmp'),
  };
  for (const key of ['cwd', 'home', 'codexHome']) mkdirSync(launch[key], { recursive: true });
  // Exclusive mkdir models coordinator creation; verifier metadata cannot prove historical freshness.
  for (const key of ['tmpdir', 'cliTmpdir']) mkdirSync(launch[key], { mode: 0o700 });
  launch.env = {
    HOME: launch.home,
    CODEX_HOME: launch.codexHome,
    PWD: launch.cwd,
    TMPDIR: launch.cliTmpdir,
  };
  write(launch.stdinPath, 'deterministic retained prompt\n');
  launch.argv = args(mode, launch, binary);
  if (!measured) write(launch.lastMessagePath, 'original host final message\n');
  return launch;
}
function events(nonce, launch) {
  const actualCommand = command(launch, nonce);
  return [
    { type: 'thread.started' },
    { type: 'turn.started' },
    {
      type: 'item.started',
      item: {
        type: 'command_execution',
        command: actualCommand,
        status: 'in_progress',
        exit_code: null,
      },
    },
    {
      type: 'item.completed',
      item: {
        type: 'command_execution',
        command: actualCommand,
        status: 'completed',
        exit_code: 0,
        aggregated_output: nonce,
      },
    },
    { type: 'turn.completed' },
  ];
}
async function fixture(
  t,
  mode = 'iterate',
  { errorCode = 'EPERM', prefix = 'flow-host-qualification-', component } = {},
) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = component === undefined ? base : join(base, component);
  if (component !== undefined) mkdirSync(root);
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
  // Keep Node's module URL neutral; native filesystem evidence may use backslash paths.
  const modulePath = join(base, 'fixture-verifier.mjs');
  write(modulePath, copiedSource);
  const imported = await import(pathToFileURL(modulePath).href);
  assert.deepEqual(Object.keys(imported), ['verifyHostQualification']);
  const bundle = { schemaVersion: 1, toolchain, probes: [] };
  for (const [i, probeMode] of MODES.entries()) {
    const d = join(root, probeMode);
    const launch = launchAt(d, probeMode, toolchain.binary.path);
    const token = (i + 1).toString(16).padStart(48, '0');
    const nonce = `host-command-probe-${token}\nheredoc-payload-${token}\n`;
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
      stdout: write(join(d, 'stdout.jsonl'), jsonl(events(nonce, launch))),
      stderr: write(join(d, 'stderr.log'), ''),
      lastMessage: {
        path: launch.lastMessagePath,
        sha256: hash(readFileSync(launch.lastMessagePath)),
      },
      input: write(join(launch.cwd, 'input.txt'), nonce),
      output: write(join(launch.cwd, 'actual-tool-output.txt'), nonce.toUpperCase()),
      environment: write(
        join(launch.cwd, 'actual-environment.json'),
        receiptBytes(launch, nonce, errorCode),
      ),
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
        e.item.command = `/bin/zsh -lc ${JSON.stringify(command(JSON.parse(readFileSync(f.bundle.probes[0].launch.path, 'utf8')), readFileSync(f.bundle.probes[0].input.path, 'utf8')))}`;
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
refusal(
  'duplicate command nonce across modes',
  (f) => {
    for (const key of ['input', 'output'])
      f.set(key, readFileSync(f.bundle.probes[0][key].path), 1);
    const nonce = readFileSync(f.bundle.probes[0].input.path, 'utf8');
    const launch = JSON.parse(readFileSync(f.bundle.probes[1].launch.path, 'utf8'));
    f.events((s) => {
      for (const event of s)
        if (event.item?.type === 'command_execution') event.item.command = command(launch, nonce);
      s[3].item.aggregated_output = nonce;
    }, 1);
    f.set('environment', receiptBytes(launch, nonce), 1);
  },
  /duplicate probe nonce/,
);

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
      f.launch.extra = true;
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
  'environment',
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
  f.launch.env.HOME = f.launch.home;
});
refusal('codex home inside writable root', (f) => {
  f.launch.codexHome = join(f.launch.attemptRoot, 'codex-home');
  mkdirSync(f.launch.codexHome);
  f.launch.env.CODEX_HOME = f.launch.codexHome;
});
refusal('identical homes', (f) => {
  f.launch.home = f.launch.codexHome;
  f.launch.env.HOME = f.launch.home;
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
    r.env.HOME = r.home;
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

// These are deterministic verifier contracts. They establish neither real sandbox denial
// nor a historically fresh coordinator launch; retained native probes must establish those.
for (const mode of MODES)
  test(`deterministic split environment accepts EACCES proof for ${mode}`, async (t) => {
    const f = await fixture(t, mode, { errorCode: 'EACCES' });
    assert.equal(f.verify().mode, mode);
  });
test('deterministic exact shell command accepts apostrophes in physical launch paths', async (t) => {
  const f = await fixture(t, 'iterate', { prefix: "flow-host-qualification-quoted'-" });
  assert.equal(f.verify().mode, 'iterate');
});

for (const [name, edit] of [
  [
    'missing outer environment',
    (r) => {
      delete r.env;
    },
  ],
  [
    'missing outer TMPDIR',
    (r) => {
      delete r.env.TMPDIR;
    },
  ],
  [
    'outer TMPDIR using writable tool temporary directory',
    (r) => {
      r.env.TMPDIR = r.tmpdir;
    },
  ],
  [
    'wrong outer HOME',
    (r) => {
      r.env.HOME = r.codexHome;
    },
  ],
  [
    'wrong outer CODEX_HOME',
    (r) => {
      r.env.CODEX_HOME = r.home;
    },
  ],
  [
    'wrong outer PWD',
    (r) => {
      r.env.PWD = r.attemptRoot;
    },
  ],
  [
    'extra outer PATH override',
    (r) => {
      r.env.PATH = '/invented-path';
    },
  ],
  [
    'extra outer TMPPREFIX override',
    (r) => {
      r.env.TMPPREFIX = join(r.tmpdir, 'zsh');
    },
  ],
])
  refusal(name, (f) => edit(f.launch), /launch environment|measured launch fields/);
refusal(
  'retained probe outer TMPDIR split mismatch',
  (f) =>
    f.record('launch', (r) => {
      r.env.TMPDIR = r.tmpdir;
    }),
  /launch environment mismatch/,
);

for (const key of ['TMPDIR', 'TMPPREFIX']) {
  const prefix = `shell_environment_policy.set.${key}=`;
  refusal(
    `missing tool ${key} override`,
    (f) => {
      const index = f.launch.argv.findIndex((a) => a.startsWith(prefix));
      assert.ok(index > 0);
      f.launch.argv.splice(index - 1, 2);
    },
    /ordered launch argv mismatch/,
  );
  refusal(
    `wrong tool ${key} override`,
    (f) => {
      f.launch.argv = f.launch.argv.map((a) =>
        a.startsWith(prefix) ? prefix + JSON.stringify(f.launch.cliTmpdir) : a,
      );
    },
    /ordered launch argv mismatch/,
  );
}
refusal(
  'reversed tool temporary override order',
  (f) => {
    const a = f.launch.argv;
    const first = a.findIndex((x) => x.startsWith('shell_environment_policy.set.TMPDIR='));
    [a[first], a[first + 2]] = [a[first + 2], a[first]];
  },
  /ordered launch argv mismatch/,
);
refusal(
  'tool temporary overrides after reasoning effort',
  (f) => {
    const a = f.launch.argv;
    const first = a.findIndex((x) => x.startsWith('shell_environment_policy.set.TMPDIR='));
    const overrides = a.splice(first - 1, 4);
    const effort = a.findIndex((x) => x.startsWith('model_reasoning_effort='));
    a.splice(effort + 1, 0, ...overrides);
  },
  /ordered launch argv mismatch/,
);
refusal(
  'retained probe missing TMPPREFIX override',
  (f) =>
    f.record('launch', (r) => {
      const index = r.argv.findIndex((a) =>
        a.startsWith('shell_environment_policy.set.TMPPREFIX='),
      );
      r.argv.splice(index - 1, 2);
    }),
  /ordered launch argv mismatch/,
);

for (const key of ['tmpdir', 'cliTmpdir']) {
  refusal(
    `missing ${key} launch field`,
    (f) => {
      delete f.launch[key];
    },
    /measured launch fields/,
  );
  refusal(
    `noncanonical ${key} path`,
    (f) => {
      f.launch[key] += '/.';
    },
    /tmpdir must be|cliTmpdir must be/,
  );
  refusal(`missing physical ${key}`, (f) => rmSync(f.launch[key], { recursive: true }), /ENOENT/);
  refusal(
    `regular file in place of ${key}`,
    (f) => {
      rmSync(f.launch[key], { recursive: true });
      writeFileSync(f.launch[key], 'not a directory');
    },
    /expected regular directory/,
  );
  refusal(
    `nonempty ${key}`,
    (f) => write(join(f.launch[key], 'leftover'), 'old bytes'),
    /private, owned and empty/,
  );
  refusal(
    `symlinked ${key}`,
    (f) => {
      const path = f.launch[key];
      renameSync(path, path + '-physical');
      symlinkSync(path + '-physical', path);
    },
    /symlink path component/,
  );
  for (const mode of [0o755, 0o1700, 0o2700, 0o4700])
    refusal(
      `${key} mode ${mode.toString(8)} including special bits`,
      (f) => {
        chmodSync(f.launch[key], mode);
        assert.equal(
          lstatSync(f.launch[key]).mode & 0o7777,
          mode,
          'requested fixture mode is present',
        );
      },
      /private, owned and empty/,
    );
}
refusal(
  'tool temporary directory outside attempt root',
  (f) => {
    f.launch.tmpdir = f.launch.cliTmpdir;
  },
  /tmpdir must be attemptRoot\/tmp/,
);
refusal(
  'CLI temporary directory inside attempt root',
  (f) => {
    f.launch.cliTmpdir = f.launch.tmpdir;
  },
  /cliTmpdir must be the attempt-local sibling/,
);
refusal(
  'retained probe missing cliTmpdir field',
  (f) =>
    f.record('launch', (r) => {
      delete r.cliTmpdir;
    }),
  /probe launch fields/,
);
refusal(
  'retained probe nonempty CLI temporary directory',
  (f) => {
    const launch = JSON.parse(readFileSync(f.bundle.probes[0].launch.path, 'utf8'));
    write(join(launch.cliTmpdir, 'leftover'), 'old');
  },
  /private, owned and empty/,
);
// Equality, descendants and ancestors all defeat isolation even before file-type validation.
for (const [name, edit] of [
  [
    'home equals CLI tmp',
    (r) => {
      r.home = r.cliTmpdir;
    },
  ],
  [
    'home below CLI tmp',
    (r) => {
      r.home = join(r.cliTmpdir, 'nested-home');
      mkdirSync(r.home);
    },
  ],
  [
    'home contains CLI tmp',
    (r) => {
      r.home = dirname(r.cliTmpdir);
    },
  ],
  [
    'Codex home equals CLI tmp',
    (r) => {
      r.codexHome = r.cliTmpdir;
    },
  ],
  [
    'stdin below CLI tmp',
    (r) => {
      r.stdinPath = join(r.cliTmpdir, 'prompt.txt');
    },
  ],
  [
    'last message below CLI tmp',
    (r) => {
      r.lastMessagePath = join(r.cliTmpdir, 'last.txt');
    },
  ],
])
  refusal(`CLI overlay overlap: ${name}`, (f) => edit(f.launch), /cliTmpdir must be disjoint/);

refusal(
  'missing environment artifact reference',
  (f) => {
    delete f.bundle.probes[0].environment;
  },
  /probe fields/,
);
refusal(
  'missing physical environment artifact',
  (f) => rmSync(f.bundle.probes[0].environment.path),
  /ENOENT/,
);
refusal(
  'nonregular environment artifact',
  (f) => {
    rmSync(f.bundle.probes[0].environment.path);
    mkdirSync(f.bundle.probes[0].environment.path);
  },
  /expected regular file/,
);
refusal(
  'symlinked environment artifact',
  (f) => {
    const path = f.bundle.probes[0].environment.path;
    renameSync(path, path + '.original');
    symlinkSync(path + '.original', path);
  },
  /symlink path component/,
);
refusal(
  'environment artifact path substitution with identical bytes',
  (f) => {
    const ref = f.bundle.probes[0].environment;
    f.bundle.probes[0].environment = write(
      join(dirname(ref.path), 'other-environment.json'),
      readFileSync(ref.path),
    );
  },
  /probe path substitution mismatch/,
);
refusal(
  'environment artifact outside private probe root',
  (f) => {
    const ref = f.bundle.probes[0].environment;
    f.bundle.probes[0].environment = write(
      join(f.root, 'escaped-environment.json'),
      readFileSync(ref.path),
    );
  },
  /probe artifact escapes private directory/,
);
refusal(
  'environment reference metadata extension',
  (f) => {
    f.bundle.probes[0].environment.trusted = true;
  },
  /environment reference fields/,
);
for (const [key, value] of [
  ['schemaVersion', 2],
  ['tmpdir', '/tmp'],
  ['shellTMPDIR', '/tmp'],
  ['nodeTMPDIR', '/tmp'],
  ['shellTMPPREFIX', '/tmp/zsh'],
  ['nodeTMPPREFIX', '/tmp/zsh'],
  ['cliTmpdir', '/tmp'],
  ['cliTmpdirWriteDenied', false],
  ['cliTmpdirWriteErrorCode', 'ENOENT'],
  ['cliTmpdirWriteErrorCode', 'EEXIST'],
  ['cliTmpdirWriteErrorCode', 'ENOSPC'],
  ['cliTmpdirWriteErrorCode', null],
  ['cwd', '/other'],
  ['stdinDigest', `sha256:${'0'.repeat(64)}`],
  ['stdinBytes', 0],
  ['tempPath', '/tmp/forged.tmp'],
  ['tempCreatedExclusive', false],
  ['tempRemoved', false],
])
  refusal(
    `rehashed environment receipt ${key}=${JSON.stringify(value)}`,
    (f) => {
      const receipt = JSON.parse(readFileSync(f.bundle.probes[0].environment.path, 'utf8'));
      receipt[key] = value;
      f.set('environment', JSON.stringify(receipt) + '\n');
    },
    /actual environment receipt mismatch/,
  );
for (const key of [
  'nodeTMPPREFIX',
  'cliTmpdirWriteDenied',
  'cliTmpdirWriteErrorCode',
  'tempCreatedExclusive',
  'tempRemoved',
])
  refusal(
    `environment receipt missing proof ${key}`,
    (f) => {
      const receipt = JSON.parse(readFileSync(f.bundle.probes[0].environment.path, 'utf8'));
      delete receipt[key];
      f.set('environment', JSON.stringify(receipt) + '\n');
    },
    /actual environment receipt mismatch/,
  );
for (const [name, change] of [
  ['pretty JSON', (r) => JSON.stringify(JSON.parse(r), null, 2) + '\n'],
  [
    'reordered keys',
    (r) => JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(r)).reverse())) + '\n',
  ],
  ['missing final LF', (r) => r.trimEnd()],
  ['additional receipt field', (r) => JSON.stringify({ ...JSON.parse(r), trusted: true }) + '\n'],
  ['empty bytes', () => ''],
  ['invalid UTF-8', () => Buffer.from([255])],
])
  refusal(
    `environment receipt ${name}`,
    (f) => f.set('environment', change(readFileSync(f.bundle.probes[0].environment.path, 'utf8'))),
    /actual environment receipt mismatch/,
  );

for (const [name, edit] of [
  [
    'legacy bare node command without shell readiness',
    () =>
      `node -e ${JSON.stringify("const fs=require('node:fs');const input=fs.readFileSync('input.txt','utf8');fs.writeFileSync('actual-tool-output.txt',input.toUpperCase(),{flag:'wx'});console.log(input.trim());")}`,
  ],
  ['missing quoted heredoc', (c) => c.replace('cat <<', 'cat <')],
  ['wrong explicit shell', (c) => c.replace('/bin/zsh', '/bin/sh')],
  ['missing TMPPREFIX argument', (c) => c.replace(' "$TMPPREFIX"', '')],
  [
    'omitted denied target absence proof',
    (c) =>
      c.replace(
        'if(fs.existsSync(denied))throw Error("host probe CLI temporary denial left a file");',
        '',
      ),
  ],
])
  refusal(
    name,
    (f) =>
      f.events((stream) => {
        for (const event of stream)
          if (event.item?.type === 'command_execution') {
            const before = event.item.command;
            event.item.command = edit(before);
            assert.notEqual(
              event.item.command,
              before,
              'fixture actually changes the required command',
            );
          }
      }),
    /unexpected actual command/,
  );
for (const [name, edit] of [
  ['legacy single input line', (input) => input.split('\n')[0] + '\n'],
  ['mismatched heredoc nonce', (input) => input.replace('heredoc-payload-0', 'heredoc-payload-f')],
  ['missing terminal LF', (input) => input.trimEnd()],
  ['extra heredoc line', (input) => input + 'extra\n'],
])
  refusal(
    name,
    (f) => f.set('input', edit(readFileSync(f.bundle.probes[0].input.path, 'utf8'))),
    /invalid command input nonce/,
  );
for (const [name, output] of [
  ['zero-byte stream despite zero pipeline exit', ''],
  ['first line only despite zero pipeline exit', `host-command-probe-${'0'.repeat(47)}1\n`],
  [
    'different heredoc stream despite valid input and receipt',
    `host-command-probe-${'f'.repeat(48)}\nheredoc-payload-${'f'.repeat(48)}\n`,
  ],
])
  refusal(
    name,
    (f) =>
      f.events((stream) => {
        stream[3].item.aggregated_output = output;
      }),
    /failed or extra actual command/,
  );
for (const message of [
  "zsh:1: can't create temp file for here document: operation not permitted\n",
  'zsh: here-document: permission denied\n',
])
  refusal(
    `heredoc temporary denial despite zero pipeline exit: ${message.trim()}`,
    (f) => f.set('stderr', message),
    /here-document temporary-file denial/,
  );
refusal(
  'heredoc temporary denial embedded in stdout despite a successful command',
  (f) =>
    f.events((stream) => {
      stream.splice(4, 0, {
        type: 'item.completed',
        item: {
          type: 'agent_message',
          text: "can't create temp file for here document: operation not permitted",
        },
      });
    }),
  /here-document temporary-file denial/,
);

// Independent fixture oracle: select the longest viable prefix among three regexes,
// rather than reproducing the production renderer's byte masks and scan state.
function nativeDisplayFixture(value) {
  assert.equal(/[\0^]/.test(value), false, 'unsupported native fixture word');
  if (value === '') return "''";
  const prefixes = [/^[+\-./:@\]_0-9A-Za-z]+/, /^[^'^\\]+/, /^[^`$!^]+/];
  let rendered = '';
  for (let offset = 0; offset < value.length;) {
    const rest = value.slice(offset);
    const lengths = prefixes.map((pattern) => pattern.exec(rest)?.[0].length ?? 0);
    const length = Math.max(...lengths);
    assert.ok(length > 0, 'fixture renderer makes progress');
    const strategy = lengths.indexOf(length);
    const chunk = rest.slice(0, length);
    rendered +=
      strategy === 0
        ? chunk
        : strategy === 1
          ? "'" + chunk + "'"
          : '"' + chunk.replace(/[\\"$`]/g, '\\$&') + '"';
    offset += length;
  }
  return rendered;
}
function nativeEvents(f, index = 0) {
  const probe = f.bundle.probes[index];
  const launch = JSON.parse(readFileSync(probe.launch.path, 'utf8'));
  const expected = command(launch, readFileSync(probe.input.path, 'utf8'));
  const rendered = '/bin/zsh -lc ' + nativeDisplayFixture(expected);
  assert.notEqual(rendered, expected);
  assert.notEqual(rendered, '/bin/zsh -lc ' + JSON.stringify(expected));
  f.events((stream) => {
    for (const event of stream)
      if (event.item?.type === 'command_execution') event.item.command = rendered;
  }, index);
  return rendered;
}

test('native display fixture preserves literal quoting vectors and real LF bytes', () => {
  for (const [word, expected] of [
    ['', "''"],
    ['safe-._/@:AZ09]', 'safe-._/@:AZ09]'],
    ['hello world', "'hello world'"],
    ["a'b", '"a\'b"'],
    ['a"b', "'a\"b'"],
    ['a\\b', '"a\\\\b"'],
    ["a$'b", "'a$'\"'b\""],
    ["a`'b", "'a`'\"'b\""],
    ["a!'b", "'a!'\"'b\""],
    ['a\nb', "'a\nb'"],
    ['a\\nb', '"a\\\\nb"'],
    ['grüße', "'grüße'"],
  ])
    assert.equal(nativeDisplayFixture(word), expected, JSON.stringify(word));
});
for (const mode of MODES)
  test(`deterministic native command display qualifies ${mode} in both command events`, async (t) => {
    const f = await fixture(t, mode);
    for (const [index] of f.bundle.probes.entries()) {
      const rendered = nativeEvents(f, index);
      assert.ok(rendered.includes('\n'), 'native display retains real LF');
      assert.ok(rendered.includes('$TMPDIR'), 'native display retains dollar literally');
      assert.ok(rendered.includes("'"), 'native display switches quoting strategies');
    }
    assert.equal(f.verify().mode, mode);
  });
test('native display accepts physical paths with quotes backslash dollar backtick bang Unicode and embedded LF', async (t) => {
  const f = await fixture(t, 'iterate', { component: 'flow-render-\'"\\$`!ü\n-' });
  for (const [index] of f.bundle.probes.entries()) nativeEvents(f, index);
  assert.equal(f.verify().mode, 'iterate');
});

for (const [name, edit] of [
  ['one script byte', (c) => c.replace('fs.readFileSync', 'fs.readFileSynC')],
  ['one path byte', (c) => c.replace('/attempt-1/tmp', '/attempt-2/tmp')],
  ['one nonce byte', (c) => c.replace('host-command-probe-0', 'host-command-probe-f')],
  ['wrapper executable', (c) => c.replace('/bin/zsh -lc', '/bin/sh -lc')],
  ['wrapper flags', (c) => c.replace('/bin/zsh -lc', '/bin/zsh -c')],
  ['extra argument', (c) => c + ' ignored'],
  ['leading whitespace', (c) => ' ' + c],
  ['trailing whitespace', (c) => c + ' '],
  ['semicolon suffix', (c) => c + '; true'],
  ['and suffix', (c) => c + ' && true'],
  ['pipe suffix', (c) => c + ' | cat'],
  ['redirection suffix', (c) => c + ' > ignored'],
  ['comment suffix', (c) => c + ' # ignored'],
  ['substitution suffix', (c) => c + ' $(printf ignored)'],
  ['variable suffix', (c) => c + ' $IGNORED'],
  ['equivalent flag quoting', (c) => c.replace('/bin/zsh -lc', '/bin/zsh "-lc"')],
  ['equivalent executable quoting', (c) => c.replace('/bin/zsh -lc', "/bin/'zsh' -lc")],
  ['escaped LF instead of real LF', (c) => c.replaceAll('\n', '\\n')],
  ['normalized CRLF instead of real LF', (c) => c.replaceAll('\n', '\r\n')],
  ['NUL command byte', (c) => c + '\0'],
])
  refusal(
    `native display ${name}`,
    (f) => {
      const rendered = nativeEvents(f);
      const changed = edit(rendered);
      assert.notEqual(changed, rendered, 'mutation reaches the native display');
      f.events((stream) => {
        for (const event of stream)
          if (event.item?.type === 'command_execution') event.item.command = changed;
      });
    },
    /unexpected actual command/,
  );
for (const eventIndex of [2, 3])
  refusal(
    `native command identity in event ${eventIndex}`,
    (f) => {
      nativeEvents(f);
      f.events((stream) => {
        stream[eventIndex].item.command += ' ';
      });
    },
    /unexpected actual command/,
  );
refusal(
  'NUL in measured physical path',
  (f) => {
    f.launch.cwd += '\0';
  },
  /path must be canonical text/,
);

import { Worker } from 'node:worker_threads';
test('unsupported caret in trusted command path fails closed without a no-progress hang', async (t) => {
  const f = await fixture(t, 'iterate', { prefix: 'flow-render-caret^-' });
  const worker = new Worker(
    `
    const { parentPort, workerData } = require('node:worker_threads');
    import(workerData.module).then(({ verifyHostQualification }) => {
      parentPort.once('message', () => {
        try { verifyHostQualification(workerData.options); parentPort.postMessage({ accepted: true }); }
        catch (error) { parentPort.postMessage({ accepted: false, message: error.message }); }
      });
      parentPort.postMessage({ ready: true });
    }).catch((error) => { throw error; });
  `,
    {
      eval: true,
      workerData: {
        module: pathToFileURL(f.modulePath).href,
        options: { bundlePath: f.bundlePath, launch: f.launch, now: f.now },
      },
    },
  );
  let timer;
  function response(timeout, label) {
    return new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(label)), timeout);
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.once('exit', (code) =>
        reject(new Error(`verifier worker exited before response: ${code}`)),
      );
    }).finally(() => clearTimeout(timer));
  }
  try {
    // Separate import/startup allowance from the actual synchronous verifier deadline.
    assert.deepEqual(await response(30_000, 'native verifier worker startup exceeded allowance'), {
      ready: true,
    });
    const invocation = response(1500, 'native display verifier exceeded bounded completion');
    worker.postMessage('verify');
    const result = await invocation;
    assert.equal(result.accepted, false);
    assert.match(result.message, /unhandled literal character/);
  } finally {
    clearTimeout(timer);
    await worker.terminate();
  }
});
