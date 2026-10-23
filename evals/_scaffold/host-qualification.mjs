// Prospective local host readiness only. This instrument-bound policy never launches or repairs a host.
import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, parse, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PINS = Object.freeze({
  binary: 'sha256:4d210f7c5a18fd0386434df23b5bdbb8c0e7257d3e8a2b30b0769c8bbe99a878',
  companion: 'sha256:9a4f2a846c9f509ca2a9f68ace6f0df2f73c7ed21835e8b186ee52bfccdfa8f3',
  binaryArchive: 'sha256:51de50a39ea592b5b0a64ae0474548c282181cb6b96d9bd08965a682ae12774c',
  companionArchive: 'sha256:d1a3254374b733fff1fa31cbeb20f65e3ef871e3431c196353dea189df15d4c5',
});
const RELEASE = 'https://github.com/openai/codex/releases/tag/rust-v0.159.3';
const DAY = 24 * 60 * 60 * 1000;
const POLICY =
  'workspace-write;approval-never;network-disabled;isolated-home;attempt-root-writable;ignore-user-config;ignore-rules';
const MODES = Object.freeze({
  'merge-gate-normal': {
    model: 'gpt-6-sol',
    effort: 'medium',
    cap: 100,
    suffix: ';nesting-by-scenario',
  },
  'merge-gate-negative-nesting': {
    model: 'gpt-6-sol',
    effort: 'medium',
    cap: 2,
    suffix: ';nesting-by-scenario',
  },
  iterate: { model: 'gpt-6-sol', effort: 'medium', cap: 100, suffix: '' },
  'next-steps': { model: 'gpt-6.1-sol', effort: 'high', cap: 100, suffix: ';ephemeral' },
});
const ARTIFACTS = [
  'launch',
  'outcome',
  'stdin',
  'stdout',
  'stderr',
  'lastMessage',
  'input',
  'output',
];
const LAUNCH_KEYS = [
  'profile',
  'argv',
  'cwd',
  'attemptRoot',
  'home',
  'codexHome',
  'lastMessagePath',
  'stdinPath',
];
const SCRIPT =
  "const fs=require('node:fs');const input=fs.readFileSync('input.txt','utf8');fs.writeFileSync('actual-tool-output.txt',input.toUpperCase(),{flag:'wx'});console.log(input.trim());";
const COMMAND = `node -e ${JSON.stringify(SCRIPT)}`;
const COMMANDS = new Set([COMMAND, `/bin/zsh -lc ${JSON.stringify(COMMAND)}`]);
const EVENTS = new Set([
  'thread.started',
  'turn.started',
  'item.started',
  'item.completed',
  'turn.completed',
]);
const FAILURE =
  /(?:code[-_ ]mode|bootstrap|native|codex-code-mode-host)[^\r\n]*(?:error|fail|unavailable|not found|missing|unable)|(?:error|fail(?:ed|ure)?|unable)[^\r\n]*(?:code[-_ ]mode|bootstrap|native|codex-code-mode-host)/i;

function requireCondition(ok, label) {
  if (!ok) throw new Error(`host qualification refused: ${label}`);
}
function object(value, keys, label) {
  requireCondition(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `${label} must be an object`,
  );
  requireCondition(
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()),
    `${label} fields`,
  );
}
function text(value, label) {
  requireCondition(
    typeof value === 'string' &&
      value.length > 0 &&
      value === value.trim() &&
      !value.includes('\0'),
    `${label} must be canonical text`,
  );
}
function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
function json(bytes, label) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error(`host qualification refused: malformed ${label}`);
  }
}
function physical(path, kind) {
  text(path, 'path');
  requireCondition(
    isAbsolute(path) && normalize(path) === path,
    'path must be absolute and normalized',
  );
  let current = parse(path).root;
  const parts = path.slice(current.length).split(sep).filter(Boolean);
  for (const part of parts) {
    current = join(current, part);
    requireCondition(!lstatSync(current).isSymbolicLink(), 'symlink path component');
  }
  const stat = lstatSync(path);
  requireCondition(
    kind === 'directory' ? stat.isDirectory() : stat.isFile(),
    `expected regular ${kind}`,
  );
  return stat;
}
function absent(path) {
  text(path, 'output path');
  requireCondition(isAbsolute(path) && normalize(path) === path, 'noncanonical output path');
  physical(dirname(path), 'directory');
  try {
    lstatSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  throw new Error('host qualification refused: measured last-message path already exists');
}
function inside(path, root) {
  const rel = relative(root, path);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
function artifact(ref, label) {
  object(ref, ['path', 'sha256'], `${label} reference`);
  requireCondition(
    typeof ref.sha256 === 'string' && /^sha256:[0-9a-f]{64}$/.test(ref.sha256),
    `${label} digest format`,
  );
  physical(ref.path, 'file');
  const bytes = readFileSync(ref.path);
  requireCondition(digest(bytes) === ref.sha256, `${label} digest mismatch`);
  return bytes;
}
function profile(mode) {
  const policy = MODES[mode];
  return {
    harness: 'codex-cli',
    model: policy.model,
    reasoningEffort: policy.effort,
    reportedVersion: '0.159.3',
    toolPolicy: POLICY + policy.suffix,
  };
}
function argv(mode, launch, binary) {
  const policy = MODES[mode];
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
    `model_reasoning_effort=${JSON.stringify(policy.effort)}`,
    '-c',
    `features.multi_agent_v2.max_concurrent_threads_per_session=${policy.cap}`,
    'exec',
    '--ignore-user-config',
    '--ignore-rules',
    '--json',
    '-m',
    policy.model,
    '--output-last-message',
    launch.lastMessagePath,
    ...(mode === 'next-steps' ? ['--ephemeral'] : []),
    '-',
  ];
}
// Inspect names and link metadata only. Authentication contents are never read or traversed.
function freshHomes(launch) {
  const forbidden =
    /^(?:config(?:\..*)?|rules|skills|AGENTS\.md|CLAUDE\.md|instructions(?:\..*)?)$/i;
  function scan(dir) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const stat = lstatSync(path);
      requireCondition(
        !forbidden.test(name),
        'user configuration, rules or skills staged in measured home',
      );
      if (path === join(launch.codexHome, 'auth.json')) {
        requireCondition(stat.isSymbolicLink(), 'authentication must remain a launch-only symlink');
        continue;
      }
      requireCondition(!stat.isSymbolicLink(), 'unexpected measured-home symlink');
      if (stat.isDirectory()) scan(path);
    }
  }
  scan(launch.home);
  scan(launch.codexHome);
}
function validateLaunch(launch, mode, binary, measured) {
  const expected = profile(mode);
  object(launch.profile, Object.keys(expected), 'profile');
  requireCondition(
    JSON.stringify(canonical(launch.profile)) === JSON.stringify(canonical(expected)),
    'profile mismatch',
  );
  for (const key of ['cwd', 'attemptRoot', 'home', 'codexHome']) physical(launch[key], 'directory');
  requireCondition(
    launch.cwd === join(launch.attemptRoot, 'project'),
    'cwd must be attemptRoot/project',
  );
  requireCondition(
    launch.home !== launch.codexHome &&
      launch.home !== launch.attemptRoot &&
      launch.codexHome !== launch.attemptRoot &&
      !inside(launch.home, launch.attemptRoot) &&
      !inside(launch.codexHome, launch.attemptRoot),
    'home isolation',
  );
  requireCondition(
    launch.lastMessagePath !== launch.attemptRoot &&
      !inside(launch.lastMessagePath, launch.attemptRoot),
    'last message must be outside writable root',
  );
  physical(launch.stdinPath, 'file');
  if (measured) {
    absent(launch.lastMessagePath);
    freshHomes(launch);
  } else physical(launch.lastMessagePath, 'file');
  requireCondition(
    Array.isArray(launch.argv) &&
      JSON.stringify(launch.argv) === JSON.stringify(argv(mode, launch, binary)),
    'exact ordered launch argv mismatch',
  );
}
function timestamp(value, label) {
  requireCondition(
    typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value),
    `${label} must be canonical UTC ISO`,
  );
  const number = Date.parse(value);
  requireCondition(
    Number.isFinite(number) && new Date(number).toISOString() === value,
    `invalid ${label}`,
  );
  return number;
}
function commandEvidence(stdout, stderr, input, output, lastMessage) {
  const nonce = input.toString('utf8');
  requireCondition(
    /^host-command-probe-[0-9a-f]{48}\n$/.test(nonce),
    'invalid command input nonce',
  );
  requireCondition(
    output.equals(Buffer.from(nonce.toUpperCase())),
    'actual command output mismatch',
  );
  requireCondition(lastMessage.length > 0, 'missing original last message');
  const raw = new TextDecoder('utf-8', { fatal: true }).decode(stdout);
  const diagnostics = new TextDecoder('utf-8', { fatal: true }).decode(stderr);
  requireCondition(
    !FAILURE.test(raw) &&
      !FAILURE.test(diagnostics) &&
      !/\b(?:ERROR|FATAL|PANIC)\b/i.test(diagnostics),
    'native or bootstrap error diagnostics',
  );
  const lines = raw.split('\n');
  if (lines.at(-1) === '') lines.pop();
  let started = false,
    finished = false,
    commands = 0,
    starts = 0;
  for (const line of lines) {
    const event = json(Buffer.from(line), 'stdout JSONL event');
    requireCondition(
      event !== null && typeof event === 'object' && !Array.isArray(event),
      'nonobject JSONL event',
    );
    requireCondition(
      EVENTS.has(event.type) && !Object.hasOwn(event, 'error'),
      'error or unknown event type',
    );
    if (event.type === 'thread.started')
      requireCondition(!started && !finished, 'late thread event');
    else if (event.type === 'turn.started') {
      requireCondition(!started && !finished, 'duplicate turn start');
      started = true;
    } else if (event.type === 'turn.completed') {
      requireCondition(started && !finished && commands === 1, 'turn completion without command');
      finished = true;
    } else {
      requireCondition(
        started &&
          !finished &&
          event.item !== null &&
          typeof event.item === 'object' &&
          !Array.isArray(event.item),
        'item outside turn',
      );
      const item = event.item;
      requireCondition(item.type !== 'error' && !Object.hasOwn(item, 'error'), 'error item');
      if (item.type === 'command_execution') {
        requireCondition(COMMANDS.has(item.command), 'unexpected actual command');
        if (event.type === 'item.started') {
          starts++;
          requireCondition(
            starts === 1 &&
              commands === 0 &&
              item.status === 'in_progress' &&
              item.exit_code === null,
            'invalid command start',
          );
        } else {
          commands++;
          requireCondition(
            commands === 1 &&
              item.status === 'completed' &&
              item.exit_code === 0 &&
              item.aggregated_output === nonce,
            'failed or extra actual command',
          );
        }
      }
    }
  }
  requireCondition(started && finished && commands === 1, 'incomplete command turn');
  return nonce;
}

/** Verify retained actual command evidence and the identical launch the coordinator will spawn next. */
export function verifyHostQualification({ bundlePath, launch, now }) {
  requireCondition(
    Number.isFinite(now) && Number.isInteger(now),
    'now must be finite integer epoch milliseconds',
  );
  const verifiedAt = new Date(now).toISOString();
  physical(bundlePath, 'file');
  const bytes = readFileSync(bundlePath);
  const bundle = json(bytes, 'bundle');
  object(bundle, ['schemaVersion', 'toolchain', 'probes'], 'bundle');
  requireCondition(bundle.schemaVersion === 1, 'bundle schema version');
  object(
    bundle.toolchain,
    [...Object.keys(PINS), 'binaryReceipt', 'companionReceipt'],
    'toolchain',
  );
  const toolchain = bundle.toolchain;
  const toolBytes = {};
  for (const key of Object.keys(toolchain)) {
    toolBytes[key] = artifact(toolchain[key], key);
    if (PINS[key]) requireCondition(toolchain[key].sha256 === PINS[key], `${key} policy pin`);
  }
  requireCondition(
    (physical(toolchain.binary.path, 'file').mode & 0o111) !== 0 &&
      (physical(toolchain.companion.path, 'file').mode & 0o111) !== 0,
    'toolchain must be executable',
  );
  requireCondition(
    toolchain.companion.path === join(dirname(toolchain.binary.path), 'codex-code-mode-host'),
    'actual sibling companion path',
  );
  const binaryReceipt = json(toolBytes.binaryReceipt, 'binary provenance receipt');
  const companionReceipt = json(toolBytes.companionReceipt, 'companion provenance receipt');
  requireCondition(
    binaryReceipt?.release === RELEASE &&
      binaryReceipt.binary === toolchain.binary.path &&
      binaryReceipt.binarySha256 === PINS.binary.slice(7) &&
      binaryReceipt.archiveSha256 === PINS.binaryArchive.slice(7) &&
      binaryReceipt.version === 'codex-cli 0.159.3',
    'binary provenance receipt mismatch',
  );
  requireCondition(
    companionReceipt?.source === RELEASE &&
      companionReceipt.executable === toolchain.companion.path &&
      companionReceipt.executableSha256 === PINS.companion.slice(7) &&
      companionReceipt.archive === toolchain.companionArchive.path &&
      companionReceipt.archiveSha256 === PINS.companionArchive.slice(7),
    'companion provenance receipt mismatch',
  );
  requireCondition(
    Array.isArray(bundle.probes) && bundle.probes.length === 4,
    'exactly four probes required',
  );
  const seen = new Map(),
    nonces = new Set();
  let expires = Infinity;
  for (const probe of bundle.probes) {
    object(probe, ['mode', ...ARTIFACTS], 'probe');
    requireCondition(
      Object.hasOwn(MODES, probe.mode) && !seen.has(probe.mode),
      'unknown or duplicate probe mode',
    );
    const data = {};
    for (const key of ARTIFACTS) data[key] = artifact(probe[key], `probe ${key}`);
    const root = dirname(probe.launch.path);
    requireCondition(
      ARTIFACTS.every((key) => inside(probe[key].path, root)),
      'probe artifact escapes private directory',
    );
    const record = json(data.launch, 'probe launch');
    object(
      record,
      ['mode', ...LAUNCH_KEYS, 'startedAt', 'binarySha256', 'companionSha256'],
      'probe launch',
    );
    requireCondition(
      record.mode === probe.mode &&
        record.binarySha256 === PINS.binary &&
        record.companionSha256 === PINS.companion,
      'probe launch identity',
    );
    validateLaunch(record, probe.mode, toolchain.binary.path, false);
    requireCondition(
      record.attemptRoot === join(root, 'attempt-1') &&
        record.home === join(root, 'home') &&
        record.codexHome === join(root, 'codex-home') &&
        record.lastMessagePath === join(root, 'last-message.txt'),
      'probe topology',
    );
    requireCondition(
      probe.stdin.path === record.stdinPath &&
        probe.lastMessage.path === record.lastMessagePath &&
        probe.input.path === join(record.cwd, 'input.txt') &&
        probe.output.path === join(record.cwd, 'actual-tool-output.txt'),
      'probe path substitution mismatch',
    );
    requireCondition(data.stdin.length > 0, 'empty retained stdin');
    const outcome = json(data.outcome, 'probe outcome');
    object(
      outcome,
      ['mode', 'startedAt', 'finishedAt', 'exitCode', 'timedOut', 'nonForked', 'taskInput'],
      'probe outcome',
    );
    requireCondition(
      outcome.mode === probe.mode &&
        outcome.startedAt === record.startedAt &&
        outcome.exitCode === 0 &&
        outcome.timedOut === false &&
        outcome.nonForked === true &&
        outcome.taskInput === 'host-preflight-only',
      'probe outcome mismatch',
    );
    const start = timestamp(record.startedAt, 'probe start');
    const finish = timestamp(outcome.finishedAt, 'probe finish');
    requireCondition(
      start <= finish && finish <= now && now < finish + DAY,
      'stale, future or unordered probe times',
    );
    expires = Math.min(expires, finish + DAY);
    const nonce = commandEvidence(
      data.stdout,
      data.stderr,
      data.input,
      data.output,
      data.lastMessage,
    );
    requireCondition(!nonces.has(nonce), 'duplicate probe nonce');
    nonces.add(nonce);
    seen.set(probe.mode, probe);
  }
  object(launch, ['suite', 'scenario', ...LAUNCH_KEYS], 'measured launch');
  text(launch.scenario, 'scenario');
  requireCondition(['merge-gate', 'iterate', 'next-steps'].includes(launch.suite), 'unknown suite');
  const mode =
    launch.suite === 'merge-gate'
      ? launch.scenario === 'nested-spawn-abort-runs-inline'
        ? 'merge-gate-negative-nesting'
        : 'merge-gate-normal'
      : launch.suite;
  validateLaunch(launch, mode, toolchain.binary.path, true);
  return {
    qualificationDigest: digest(bytes),
    verifierPolicyDigest: digest(readFileSync(fileURLToPath(import.meta.url))),
    mode,
    profile: profile(mode),
    probeDigest: digest(JSON.stringify(canonical(seen.get(mode)))),
    verifiedAt,
    expiresAt: new Date(expires).toISOString(),
  };
}
