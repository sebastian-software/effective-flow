// Runs only inside the disposable GitHub-hosted arm64 macOS job; never invokes a model.
import { spawnSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  realpathSync,
  readdirSync,
  lstatSync,
  chmodSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import {
  PROTECTED_VALIDATION_PROTOCOL,
  VALIDATION_COMMANDS,
  REQUIRED_NATIVE_CASES,
  VALIDATION_ENVIRONMENT,
  CLOSURE_PATHS,
  validationDigest,
} from '../src/scripts/protected-validation-protocol.mjs';
import {
  materializeTransport,
  MATERIALIZATION_PATH,
  verifyExecutionFile,
} from './protected-validation-projection.mjs';
const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};
const emit = (value) =>
  process.stdout.write('EF_PROTECTED_VALIDATION ' + JSON.stringify(value) + '\n');
export function productEnvironment(environment = process.env, home) {
  const allowed = [
    'PATH',
    'TMPDIR',
    'TMP',
    'TEMP',
    'LANG',
    'LC_ALL',
    'TERM',
    'SHELL',
    'USER',
    'LOGNAME',
    'PNPM_HOME',
  ];
  const clean = Object.fromEntries(
    allowed.filter((k) => typeof environment[k] === 'string').map((k) => [k, environment[k]]),
  );
  return {
    ...clean,
    HOME: home,
    CODEX_HOME: resolve(home, '.codex'),
    CI: 'true',
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    NODE_OPTIONS: '--test-reporter=tap',
  };
}
function checked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  ensure(
    !result.error && result.status === 0,
    'host bootstrap command failed: ' + command + ' ' + (result.stderr || result.error?.code),
  );
  return result.stdout.trim();
}
function findBinary(root) {
  const found = [];
  function visit(path) {
    for (const name of readdirSync(path)) {
      const file = resolve(path, name),
        stat = lstatSync(file);
      ensure(
        !stat.isSymbolicLink() && (stat.isDirectory() || stat.isFile()),
        'unsafe Codex package member',
      );
      if (stat.isDirectory()) visit(file);
      else if (name === 'codex' || name === 'codex-aarch64-apple-darwin') found.push(file);
    }
  }
  visit(root);
  ensure(found.length === 1, 'official package must contain one Codex executable');
  return found[0];
}
function bootstrapCodex(temp, environment) {
  const archive = resolve(temp, VALIDATION_ENVIRONMENT.codexArchive),
    checksums = resolve(temp, 'codex-package_SHA256SUMS');
  const base =
    'https://github.com/openai/codex/releases/download/rust-v' +
    VALIDATION_ENVIRONMENT.codexVersion +
    '/';
  for (const [name, target] of [
    [VALIDATION_ENVIRONMENT.codexArchive, archive],
    ['codex-package_SHA256SUMS', checksums],
  ])
    checked(
      '/usr/bin/curl',
      [
        '--fail',
        '--location',
        '--proto',
        '=https',
        '--tlsv1.2',
        '--max-filesize',
        '134217728',
        '--max-time',
        '180',
        '--output',
        target,
        base + name,
      ],
      { env: environment, timeout: 200000 },
    );
  ensure(
    validationDigest(readFileSync(archive)) === VALIDATION_ENVIRONMENT.codexArchiveDigest,
    'official Codex package digest mismatch',
  );
  const published = readFileSync(checksums, 'utf8')
    .split('\n')
    .filter(
      (line) =>
        line.endsWith(' ' + VALIDATION_ENVIRONMENT.codexArchive) ||
        line.endsWith('*' + VALIDATION_ENVIRONMENT.codexArchive),
    );
  ensure(
    published.length === 1 &&
      published[0].split(/\s+/)[0] === VALIDATION_ENVIRONMENT.codexArchiveDigest.slice(7),
    'official checksum sidecar mismatch',
  );
  const entries = checked('/usr/bin/tar', ['-tzf', archive], { env: environment }).split('\n');
  ensure(
    entries.length < 1000 &&
      entries.every(
        (path) =>
          !path.startsWith('/') && !path.includes('\\') && path.split('/').every((p) => p !== '..'),
      ),
    'unsafe Codex package archive',
  );
  const unpacked = resolve(temp, 'codex-package');
  mkdirSync(unpacked);
  checked('/usr/bin/tar', ['-xzf', archive, '-C', unpacked], { env: environment });
  const binary = findBinary(unpacked),
    target = '/opt/homebrew/bin/codex';
  ensure(
    !existsSync(target),
    'disposable runner unexpectedly already has Codex; refusing overwrite',
  );
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(binary), { flag: 'wx', mode: 0o755 });
  chmodSync(target, 0o755);
  ensure(
    checked(target, ['--version'], { env: environment }) ===
      'codex-cli ' + VALIDATION_ENVIRONMENT.codexVersion,
    'Codex version mismatch',
  );
  ensure(
    checked('/usr/bin/file', ['-b', target], { env: environment }).includes('arm64'),
    'Codex binary is not arm64',
  );
  return {
    path: target,
    version: VALIDATION_ENVIRONMENT.codexVersion,
    digest: validationDigest(readFileSync(realpathSync(target))),
  };
}
export function nativeOutcomes(testOutput, { complete = true } = {}) {
  return REQUIRED_NATIVE_CASES.flatMap((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = [
      ...testOutput.matchAll(
        new RegExp('^(ok|not ok) [0-9]+ - ' + escaped + '(?: # ([^\\r\\n]*))?$', 'gm'),
      ),
    ];
    ensure(
      matches.length <= 1 && (!complete || matches.length === 1),
      'required native case absent or duplicated: ' + name,
    );
    if (!matches.length) return [];
    return [
      {
        name,
        outcome: matches[0][2]?.match(/SKIP|TODO/i)
          ? 'skipped'
          : matches[0][1] === 'ok'
            ? 'passed'
            : 'failed',
      },
    ];
  });
}
function observedClosure(checkout) {
  const paths = CLOSURE_PATHS;
  return {
    ...Object.fromEntries(
      Object.entries(paths).map(([key, path]) => [
        key,
        validationDigest(readFileSync(resolve(checkout, path))),
      ]),
    ),
    materializationAlgorithm: 'git-tree-v1',
    actions: {
      checkout: '3d3c42e5aac5ba805825da76410c181273ba90b1',
      pnpm: 'ea17c68df8912ef543352723c149a84f56e3d413',
      node: '820762786026740c76f36085b0efc47a31fe5020',
    },
  };
}
export function runHostedValidation() {
  ensure(
    process.env.GITHUB_ACTIONS === 'true' && process.env.RUNNER_ENVIRONMENT === 'github-hosted',
    'disposable GitHub-hosted runner required',
  );
  ensure(
    process.platform === 'darwin' &&
      process.arch === 'arm64' &&
      process.env.RUNNER_OS === 'macOS' &&
      process.env.RUNNER_ARCH === 'ARM64',
    'actual arm64 macOS runner required',
  );
  ensure(
    Number(process.versions.node.split('.')[0]) === VALIDATION_ENVIRONMENT.nodeMajor,
    'pinned Node major required',
  );
  ensure(
    /^effective-flow\/validation\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(
      process.env.GITHUB_REF_NAME ?? '',
    ),
    'bounded snapshot branch required',
  );
  const checkout = realpathSync(process.cwd()),
    temp = resolve(
      process.env.RUNNER_TEMP,
      'protected-validation-' + process.env.GITHUB_RUN_ID + '-' + process.env.GITHUB_RUN_ATTEMPT,
    );
  ensure(!existsSync(temp), 'exclusive validation runner state required');
  mkdirSync(temp);
  const home = resolve(temp, 'home');
  mkdirSync(home);
  mkdirSync(resolve(home, '.codex'));
  const environment = productEnvironment(process.env, home);
  const materialized = materializeTransport({
    checkout,
    destination: resolve(temp, 'execution'),
    expectedCommit: process.env.GITHUB_SHA,
  });
  emit({ type: 'materialization', ...materialized });
  const codex = bootstrapCodex(temp, environment);
  emit({
    type: 'environment',
    environment: VALIDATION_ENVIRONMENT,
    platform: process.platform,
    arch: process.arch,
    osVersion: checked('/usr/bin/sw_vers', ['-productVersion'], { env: environment }),
    machine: checked('/usr/bin/uname', ['-m'], { env: environment }),
    runnerImage: process.env.ImageOS + ':' + process.env.ImageVersion,
    closure: observedClosure(checkout),
    codex,
  });
  const cwd = resolve(temp, 'execution');
  const install = spawnSync('pnpm', ['install', '--frozen-lockfile'], {
    cwd,
    env: environment,
    stdio: 'inherit',
    timeout: 300000,
  });
  ensure(
    !install.error && install.status === 0,
    'lockfile development dependency installation failed',
  );
  for (let index = 0; index < VALIDATION_COMMANDS.length; index++) {
    const command = VALIDATION_COMMANDS[index],
      [executable, ...args] = command.split(' ');
    emit({ type: 'command-start', command, index });
    const result = spawnSync(executable, args, {
      cwd,
      env: environment,
      encoding: 'utf8',
      timeout: 900000,
      maxBuffer: 64 * 1024 * 1024,
    });
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    const exitCode = Number.isSafeInteger(result.status) ? result.status : 125;
    emit({ type: 'command-end', command, index, exitCode });
    ensure(!result.error && exitCode === 0, 'required validation command failed: ' + command);
    if (command === 'pnpm test') {
      const nativeCases = nativeOutcomes(result.stdout);
      emit({ type: 'native-cases', nativeCases });
      ensure(
        nativeCases.every((c) => c.outcome === 'passed'),
        'required native case failed or skipped',
      );
    }
  }
  const executionManifest = JSON.parse(
    readFileSync(resolve(checkout, MATERIALIZATION_PATH), 'utf8'),
  );
  for (const entry of executionManifest.executionFiles) verifyExecutionFile(cwd, entry);
  ensure(
    checked('git', ['write-tree'], { cwd, env: environment }) === materialized.executionTree,
    'execution index/source changed during validation',
  );
  emit({
    type: 'completed',
    protocol: PROTECTED_VALIDATION_PROTOCOL,
    executionTree: materialized.executionTree,
  });
}
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  try {
    ensure(
      process.argv.length === 3 && process.argv[2] === 'run',
      'usage: protected-macos-validation.mjs run',
    );
    runHostedValidation();
  } catch (error) {
    process.stderr.write('Protected macOS validation refused: ' + error.message + '\n');
    process.exitCode = 1;
  }
}
