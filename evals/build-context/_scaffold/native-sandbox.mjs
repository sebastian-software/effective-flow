// Suite-private Codex policy. The trusted CLI stays outside Seatbelt so it can sandbox each tool.
// Model commands and local file tools share the observed native permission profile; no escalation.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  realpathSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  renameSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { digest, readRegular, toolTexts } from './transcript.mjs';
import { requireThat, SCHEMA } from './protocol.mjs';
const NAME = 'flow-build-context';
const below = (root, path) => path === root || path.startsWith(root + '/');
const toml = (value) =>
  typeof value === 'object' && !Array.isArray(value)
    ? '{' +
      Object.entries(value)
        .map(([k, v]) => JSON.stringify(k) + '=' + toml(v))
        .join(',') +
      '}'
    : JSON.stringify(value);
const DISABLED = [
  'apps',
  'plugins',
  'browser_use',
  'browser_use_external',
  'computer_use',
  'hooks',
  'enable_mcp_apps',
];
export function nativePolicy({ fixtureRoot, skillRoot, protectedRoots, target = 'portable' }) {
  const fixture = realpathSync(fixtureRoot),
    skill = realpathSync(skillRoot);
  requireThat(
    existsSync(resolve(fixture, '.build-context-fixture')),
    'native guard refuses non-fixture root',
  );
  const git = (...args) => execFileSync('git', args, { cwd: fixture, encoding: 'utf8' }).trim();
  const gitRoot = realpathSync(resolve(fixture, git('rev-parse', '--git-common-dir'))),
    origin = git('remote', 'get-url', 'origin');
  requireThat(
    origin.startsWith('/') && !origin.includes('://'),
    'only actual local fixture origin is writable',
  );
  const originRoot = realpathSync(origin);
  requireThat(
    execFileSync('git', ['--git-dir', originRoot, 'rev-parse', '--is-bare-repository'], {
      encoding: 'utf8',
    }).trim() === 'true' && below(dirname(fixture), originRoot),
    'local bare fixture origin outside fixture namespace',
  );
  const stubRoot = dirname(skill),
    fixtureFile = resolve(stubRoot, 'fixture.json'),
    archiveLedger = resolve(stubRoot, 'trace/tracker-calls.jsonl'),
    ledger = resolve(fixture, '.effective-flow/eval-ledger/tracker-calls.jsonl'),
    lock = ledger + '.lock';
  requireThat(
    existsSync(resolve(stubRoot, 'fixture.json')),
    'actual local forge fixture missing beside measured skill',
  );
  requireThat(!below(fixture, skill), 'measured skill must be outside model writable fixture');
  mkdirSync(dirname(archiveLedger), { recursive: true });
  mkdirSync(dirname(ledger), { recursive: true });
  protectedRoots = [...protectedRoots, dirname(archiveLedger)];
  const protectedPaths = [...new Set(protectedRoots.map((p) => realpathSync(p)))].sort();
  const writes = [...new Set([fixture, gitRoot, originRoot])].sort();
  for (const p of protectedPaths)
    for (const w of writes)
      requireThat(
        !below(w, p) && !below(p, w),
        'protected host namespace overlaps a model writable root',
      );
  const filesystem = {
    ':slash_tmp': 'read',
    ':tmpdir': 'read',
    ...Object.fromEntries(protectedPaths.map((p) => [p, 'read'])),
    ...Object.fromEntries(writes.filter((p) => p !== fixture).map((p) => [p, 'write'])),
  };
  const definition = { extends: ':workspace', filesystem, network: { enabled: false } };
  const nativeRegistrations = [];
  if (target === 'codex') {
    const inventory = JSON.parse(readRegular(resolve(skill, 'native-agent-inventory.json')));
    requireThat(
      inventory.schemaVersion === 1 &&
        inventory.harness === 'codex' &&
        Array.isArray(inventory.baseWorkers) &&
        inventory.baseWorkers.length > 0 &&
        new Set(inventory.baseWorkers).size === inventory.baseWorkers.length &&
        inventory.fastWorkers?.length === 0,
      'actual canonical Codex native inventory required',
    );
    for (const name of inventory.baseWorkers) {
      requireThat(/^effective-flow-[a-z0-9-]+$/.test(name), 'unknown native worker name');
      const file = resolve(skill, '../agents', name + '.toml'),
        body = readRegular(file, 256 * 1024),
        description = body.match(/^description = ("[^\n]+")$/m)?.[1];
      requireThat(
        body.startsWith('name = ' + JSON.stringify(name) + '\n') && description,
        'canonical native worker sidecar missing',
      );
      nativeRegistrations.push({
        name,
        file,
        description: JSON.parse(description),
        digest: digest(body),
        config:
          'agents.' +
          name +
          '=' +
          toml({ description: JSON.parse(description), config_file: file }),
      });
    }
  }
  const configs = [
    'default_permissions=' + JSON.stringify(NAME),
    'approval_policy="never"',
    'permissions.' + NAME + '=' + toml(definition),
    'mcp_servers={}',
    'shell_environment_policy.set=' +
      toml({ EVAL_TRACKER_LOG: ledger, EVAL_TRACKER_FIXTURE: fixtureFile }),
    ...DISABLED.map((k) => 'features.' + k + '=false'),
    ...nativeRegistrations.map((r) => r.config),
  ];
  return {
    schema: SCHEMA + '/native-policy',
    nativeRegistrations,
    name: NAME,
    fixture,
    skill,
    gitRoot,
    originRoot,
    ledger,
    lock,
    fixtureFile,
    archiveLedger,
    protectedPaths,
    writes,
    definition,
    configs,
    policyDigest: digest(JSON.stringify({ fixture, definition, configs })),
  };
}
export function nativeExecArgs(args, policy, { resume = false } = {}) {
  requireThat(Array.isArray(args) && args[0] === 'exec', 'actual Codex exec invocation required');
  const seen = new Set(),
    flags = new Set(),
    configs = [],
    positionals = [];
  let model = null;
  const once = (key) => {
    requireThat(!seen.has(key), 'duplicate native option ' + key);
    seen.add(key);
  };
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    requireThat(typeof arg === 'string' && !/[\r\n\0]/.test(arg), 'invalid native argument');
    if (
      ['--ignore-user-config', '--ignore-rules', '--json', '--skip-git-repo-check'].includes(arg)
    ) {
      once(arg);
      flags.add(arg);
      continue;
    }
    if (['-s', '--sandbox'].includes(arg)) {
      once('sandbox');
      requireThat(args[++i] === 'workspace-write', 'native recording requires workspace-write');
      continue;
    }
    if (['-C', '--cd'].includes(arg)) {
      once('cwd');
      requireThat(
        typeof args[i + 1] === 'string' && realpathSync(args[++i]) === policy.fixture,
        'native CLI cwd differs from fixture',
      );
      continue;
    }
    if (['-m', '--model'].includes(arg)) {
      once('model');
      model = args[++i];
      requireThat(
        typeof model === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(model),
        'closed native model identifier required',
      );
      continue;
    }
    if (['-c', '--config'].includes(arg)) {
      const value = args[++i];
      requireThat(
        typeof value === 'string' &&
          /^(?:model_reasoning_effort="(?:low|medium|high|xhigh|max|ultra)"|agents\.enabled=(?:true|false)|features\.multi_agent_v2\.max_concurrent_threads_per_session=(?:[1-9]|[1-9][0-9]|100))$/.test(
            value,
          ),
        'native config key/value is outside the closed typed launch surface',
      );
      once(value.slice(0, value.indexOf('=')));
      configs.push(value);
      continue;
    }
    if (
      arg === '-' ||
      arg === 'resume' ||
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(arg)
    ) {
      positionals.push(arg);
      continue;
    }
    requireThat(false, 'unrecognized native option or positional argument');
  }
  requireThat(
    flags.has('--ignore-user-config') &&
      flags.has('--ignore-rules') &&
      flags.has('--json') &&
      model &&
      seen.has('model_reasoning_effort'),
    'native exec requires explicit isolated config/rules, JSON, model and effort',
  );
  requireThat(
    resume
      ? positionals.length === 3 && positionals[0] === 'resume' && positionals[2] === '-'
      : positionals.length === 1 && positionals[0] === '-',
    'fresh/resume stdin grammar mismatch',
  );
  return [
    '-C',
    policy.fixture,
    '-m',
    model,
    ...[...configs, ...policy.configs].flatMap((v) => ['-c', v]),
    'exec',
    ...flags,
    ...positionals,
  ];
}
// Seed only the native writer's observed fixture trust entry before settings are sealed.
export function initializeNativeSettings({ command, policy, journalRoot }) {
  const configFile = resolve(command.codexHome, 'config.toml');
  const canonical = '[projects.' + JSON.stringify(policy.fixture) + ']\ntrust_level = "trusted"\n';
  const before = existsSync(configFile) ? readRegular(configFile, 256 * 1024) : null;
  requireThat(
    before === null || before === '' || before === canonical,
    'isolated native config must be absent, empty, or exact fixture trust only',
  );
  const script = resolve(import.meta.dirname, 'native-initialization.mjs');
  const args = command.args.slice(0, command.args.indexOf('exec'));
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify({
      executable: command.executable,
      args,
      fixture: policy.fixture,
      configFile,
      environment: { PATH: process.env.PATH, HOME: command.home, CODEX_HOME: command.codexHome },
    }),
    encoding: 'utf8',
    timeout: 20000,
    maxBuffer: 2 * 1024 * 1024,
  });
  const finishedAt = Date.now();
  requireThat(
    result.status === 0 && !result.error,
    'model-free native fixture initialization failed: ' + result.stderr,
  );
  requireThat(
    readRegular(configFile) === canonical,
    'native writer made an unexpected settings transition',
  );
  const observation = {
    startedAt,
    finishedAt,
    beforeDigest: before === null ? null : digest(before),
    afterDigest: digest(canonical),
    binaryDigest: digest(readFileSync(realpathSync(command.executable))),
    argumentsDigest: digest(JSON.stringify(args)),
    sourceDigest: digest(readRegular(script)),
    stdoutDigest: digest(result.stdout),
    stderrDigest: digest(result.stderr),
  };
  writeFileSync(
    resolve(journalRoot, 'native-initialization-' + randomBytes(16).toString('hex') + '.json'),
    JSON.stringify(observation) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  return observation;
}
export function nativeSandboxArgs(policy, command, execArgs) {
  const prefix = execArgs
    ? execArgs.slice(0, execArgs.indexOf('exec'))
    : ['-C', policy.fixture, ...policy.configs.flatMap((v) => ['-c', v])];
  return [
    ...prefix,
    'sandbox',
    '--permission-profile',
    policy.name,
    '--include-managed-config',
    '-C',
    policy.fixture,
    '--',
    ...command,
  ];
}
const pathKey = (entry) =>
  entry.path?.type === 'special'
    ? ':' + entry.path.value?.kind
    : entry.path?.type === 'path'
      ? resolve(entry.path.path)
      : null;
export function nativeContextProblems(contexts, policy) {
  const problems = [];
  if (!Array.isArray(contexts) || !contexts.length)
    return ['actual native turn policy observations missing'];
  const expected = new Map([
    [':root', 'read'],
    [':slash_tmp', 'read'],
    [':tmpdir', 'read'],
    [policy.fixture, 'write'],
    ...['.git', '.agents', '.codex', '.aws'].map((n) => [resolve(policy.fixture, n), 'read']),
    ...Object.entries(policy.definition.filesystem),
  ]);
  for (const c of contexts) {
    const p = c.permissionProfile,
      f = p?.file_system,
      entries = f?.entries;
    if (
      Object.keys(p ?? {}).some((k) => !['type', 'file_system', 'network'].includes(k)) ||
      Object.keys(f ?? {}).some((k) => !['type', 'entries'].includes(k)) ||
      c.approvalPolicy !== 'never' ||
      !below(policy.fixture, resolve(c.cwd ?? '/')) ||
      p?.type !== 'managed' ||
      f?.type !== 'restricted' ||
      p?.network !== 'restricted' ||
      !Array.isArray(entries)
    ) {
      problems.push('actual native approval/cwd/restricted policy differs');
      continue;
    }
    const actual = new Map();
    for (const entry of entries) {
      const key = pathKey(entry),
        keys = Object.keys(entry);
      if (
        !key ||
        actual.has(key) ||
        Object.keys(entry.path ?? {}).some((k) => !['type', 'value', 'path'].includes(k)) ||
        (entry.path?.type === 'special' &&
          Object.keys(entry.path.value ?? {}).some((k) => k !== 'kind')) ||
        keys.some((k) => !['path', 'access', 'missing_path_behavior'].includes(k)) ||
        !['read', 'write'].includes(entry.access) ||
        (entry.missing_path_behavior && entry.missing_path_behavior !== 'skip')
      )
        problems.push('unknown or duplicate native filesystem policy entry');
      actual.set(key, entry.access);
    }
    if (!isDeepStrictEqual([...actual].sort(), [...expected].sort()))
      problems.push('actual native filesystem policy differs from closed write/read roots');
    if (
      c.fileSystemSandboxPolicy?.kind !== 'restricted' ||
      !isDeepStrictEqual(c.fileSystemSandboxPolicy.entries, entries)
    )
      problems.push('actual native tool filesystem policy differs from permission profile');
  }
  return problems;
}
export function probeNativeSandbox({ executable, reportedVersion, policy, environment, execArgs }) {
  requireThat(
    Array.isArray(execArgs) && execArgs.includes('exec'),
    'exact generated native exec arguments required for guard',
  );
  requireThat(process.platform === 'darwin', 'native Codex guard is established only on macOS');
  environment = {
    ...environment,
    EVAL_TRACKER_LOG: policy.ledger,
    EVAL_TRACKER_FIXTURE: policy.fixtureFile,
  };
  const binary = realpathSync(executable),
    binaryDigest = digest(readFileSync(binary)),
    version = execFileSync(binary, ['--version'], { env: environment, encoding: 'utf8' }).trim();
  requireThat(version === 'codex-cli ' + reportedVersion, 'actual native CLI version differs');
  const nonce = randomBytes(12).toString('hex'),
    canaries = [];
  mkdirSync(dirname(policy.ledger), { recursive: true });
  for (const root of policy.protectedPaths) {
    const file = resolve(root, '.host-denial-' + nonce);
    writeFileSync(file, 'host-owned ' + nonce, { flag: 'wx', mode: 0o600 });
    canaries.push(file);
  }
  const link = resolve(policy.fixture, '.host-guard-link-' + nonce);
  symlinkSync(canaries[0], link);
  const ledgerBefore = existsSync(policy.ledger) ? readFileSync(policy.ledger) : null;
  const index = resolve(policy.gitRoot, 'index.guard-' + nonce),
    branch = 'refs/heads/evidence-guard-' + nonce;
  const script = resolve(import.meta.dirname, 'native-sandbox-probe.mjs'),
    input = {
      fixture: policy.fixture,
      gitRoot: policy.gitRoot,
      origin: policy.originRoot,
      ledger: policy.ledger,
      stub: resolve(policy.skill, 'scripts/remote-tracker.mjs'),
      canaries,
      link,
      index,
      branch,
      nonce,
    };
  let result, debug;
  try {
    result = spawnSync(binary, nativeSandboxArgs(policy, [process.execPath, script], execArgs), {
      cwd: policy.fixture,
      env: environment,
      input: JSON.stringify(input),
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    requireThat(
      !result.error && result.status === 0,
      'actual native CLI guard failed: ' + (result.stderr || result.stdout || result.error?.code),
    );
    const observed = JSON.parse(result.stdout.trim());
    requireThat(
      observed.schema === SCHEMA + '/native-guard' &&
        observed.denied === canaries.length + 1 &&
        observed.inheritedDenied &&
        observed.fixtureRead &&
        observed.fixtureWrite &&
        observed.gitCommit &&
        observed.gitPush &&
        observed.stubLedger &&
        observed.wrapperDigest === digest(readRegular(script)),
      'actual native guard output is incomplete or foreign',
    );
    requireThat(
      canaries.every((p) => readRegular(p) === 'host-owned ' + nonce),
      'native protected canary changed',
    );
    const ordinaryArgs = [
      ...execArgs.slice(0, execArgs.indexOf('exec')),
      'debug',
      'prompt-input',
      'Render permissions only; do not run a model.',
    ];
    debug = spawnSync(binary, ordinaryArgs, {
      cwd: policy.fixture,
      env: environment,
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 4 * 1024 * 1024,
    });
    requireThat(
      debug.status === 0 && !debug.error,
      'model-free effective native policy rendering failed',
    );
    const messages = JSON.parse(debug.stdout),
      text = toolTexts(messages).find((v) => v.includes('<permissions instructions>')) ?? '',
      line = text.match(/The writable roots are ([^\n]+)\./)?.[1] ?? '',
      actualRoots = [...line.matchAll(/`([^`]+)`/g)].map((m) => resolve(m[1])).sort();
    requireThat(
      text.includes('workspace-write') &&
        text.includes('never') &&
        isDeepStrictEqual(actualRoots, policy.writes),
      'effective native debug policy/write roots differ from exact guard policy',
    );
    requireThat(
      (policy.nativeRegistrations ?? []).every(
        (r) => digest(readRegular(r.file, 256 * 1024)) === r.digest,
      ),
      'actual native Codex sidecar changed',
    );
    let registrationProof = '';
    if (policy.nativeRegistrations.length) {
      const registration = spawnSync(
        process.execPath,
        [resolve(import.meta.dirname, 'native-registration-probe.mjs')],
        {
          input: JSON.stringify({
            executable: binary,
            args: execArgs.slice(0, execArgs.indexOf('exec')),
            cwd: policy.fixture,
            environment,
            registrations: policy.nativeRegistrations,
          }),
          encoding: 'utf8',
          timeout: 20000,
          maxBuffer: 4 * 1024 * 1024,
        },
      );
      requireThat(
        registration.status === 0 && !registration.error,
        'actual strict native registration observation failed: ' + registration.stderr,
      );
      registrationProof = registration.stdout;
    }
    return {
      schema: SCHEMA + '/native-guard',
      kind: 'codex-native',
      writeDenied: true,
      inheritedDenied: true,
      denied: observed.denied,
      fixtureRead: true,
      fixtureWrite: true,
      gitCommit: true,
      gitPush: true,
      stubLedger: true,
      wrapperDigest: observed.wrapperDigest,
      binaryDigest,
      reportedVersion,
      policyDigest: policy.policyDigest,
      execArgumentsDigest: digest(JSON.stringify(execArgs)),
      sandboxArgumentsDigest: digest(
        JSON.stringify(nativeSandboxArgs(policy, [process.execPath, script], execArgs)),
      ),
      debugPromptDigest: digest(debug.stdout + registrationProof),
      stdoutDigest: digest(result.stdout),
      startedAt: observed.startedAt,
      finishedAt: Date.now(),
      protectedRootDigests: policy.protectedPaths.map(digest),
      writeRootDigests: policy.writes.map(digest),
    };
  } finally {
    // Probe records are separate host evidence; restore the real fixture ledger before any model.
    if (ledgerBefore === null) rmSync(policy.ledger, { force: true });
    else writeFileSync(policy.ledger, ledgerBefore);
    rmSync(index, { force: true });
    rmSync(index + '.lock', { force: true });
    rmSync(link, { force: true });
    for (const file of canaries) rmSync(file, { force: true });
    execFileSync('git', ['--git-dir', policy.originRoot, 'update-ref', '-d', branch], {
      stdio: 'pipe',
    });
  }
}

// Only the host mirrors the actual model-writable stub ledger into protected scaffold evidence.
export function mirrorTrackerLedger(policy, priorDigest) {
  const source = existsSync(policy.ledger) ? readRegular(policy.ledger, 2 * 1024 * 1024) : '',
    prior = existsSync(policy.archiveLedger)
      ? readRegular(policy.archiveLedger, 2 * 1024 * 1024)
      : '';
  requireThat(
    digest(prior) === priorDigest && source.startsWith(prior),
    'actual tracker ledger lost/changed prior mirrored evidence',
  );
  const appended = source.slice(prior.length),
    records = appended.split('\n').filter(Boolean).map(JSON.parse);
  requireThat(
    records.every(
      (r) => r && typeof r === 'object' && Number.isInteger(r.seq) && typeof r.at === 'string',
    ),
    'actual tracker ledger is malformed',
  );
  const temp = policy.archiveLedger + '.host-' + randomBytes(8).toString('hex');
  writeFileSync(temp, source, { flag: 'wx', mode: 0o600 });
  renameSync(temp, policy.archiveLedger);
  return {
    sourceDigest: digest(source),
    archiveDigest: digest(readRegular(policy.archiveLedger, 2 * 1024 * 1024)),
    priorDigest,
    prefixBytes: Buffer.byteLength(prior),
    sourceBytes: Buffer.byteLength(source),
    addedEntries: records.filter((r) => r.event !== 'complete').length,
  };
}
export function trackerLedgerProblems(run, policy, initialText) {
  const source = existsSync(policy.ledger) ? readRegular(policy.ledger, 2 * 1024 * 1024) : '';
  if (!source.startsWith(initialText))
    return ['actual tracker ledger no longer contains prelaunch prefix'];
  const records = source
    .slice(initialText.length)
    .split('\n')
    .filter(Boolean)
    .map(JSON.parse)
    .filter((r) => r.event !== 'complete');
  const observed = (run.helperEvents ?? []).filter((e) => e.family === 'tracker');
  const row = (v) =>
    JSON.stringify({
      operation: v.operation,
      apply: v.apply === true,
      cwdDigest: v.cwdDigest ?? (typeof v.cwd === 'string' ? digest(v.cwd) : null),
    });
  const actual = records.map(row).sort(),
    calls = observed.map(row).sort();
  if (
    !isDeepStrictEqual(actual, calls) ||
    new Set(observed.map((e) => e.session + '\0' + e.callDigest)).size !== observed.length
  )
    return ['actual tracker ledger is not correlated with unique raw tool call/results'];
  return [];
}
