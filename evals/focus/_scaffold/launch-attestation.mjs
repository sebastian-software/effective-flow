#!/usr/bin/env node

// The focus suite's launch attestation: the shared host verifier's checks applied to a focus launch,
// without a focus mode in `evals/_scaffold/host-qualification.mjs`. That file is hashed into three
// suites' instruments, so a new mode there would stale their evidence; this module is hashed only
// into the focus instrument.
//
// **The focus mode is the next-steps mode.** The suite pins the next-steps profile, so a focus launch
// has exactly that mode's ordered argv (`gpt-6.1-sol`, high effort, the 100-thread cap,
// `--ephemeral`). The shared verifier's one export, `verifyHostQualification`, therefore checks a
// focus launch under that mode: the pinned binary and companion with their provenance receipts, all
// four probes younger than 24 hours, the exact ordered flags, isolated fresh homes, physical paths,
// private empty temporary roots, the absent last-message path and the single writable attempt root.
// What it cannot check for focus, because its unexported checks know only the three other suites,
// is reimplemented below: the focus suite and scenario, the pinned profile, the attempt's place in a
// focus round, this attempt's own last-message file and the rendered prompt as the only input.
//
// Disclosed difference from the other suites: no probe ran under a focus label; the probe the shared
// verifier binds is the next-steps one, whose launch shape is identical. Nothing in the round
// lifecycle consumes the attestation, so publication cannot prove one was made.
//
//   node evals/focus/_scaffold/launch-attestation.mjs exec \
//     --bundle FILE --round ID|MANIFEST --scenario NAME --slot N [--auth-file FILE]
//
// runs inside `evals/host-run.mjs` (which supplies the fresh HOME and CODEX_HOME), attests the
// slot's current attempt and then spawns exactly the attested launch. Without `exec` nothing is
// launched; `verifyFocusLaunch` is the importable check.

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import { constants } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { verifyHostQualification } from '../../_scaffold/host-qualification.mjs';
import { auxiliaryLogPath, sandboxPaths } from '../../_scaffold/sandbox.mjs';
import suite from '../suite.config.mjs';
import { lastMessagePathFor } from './setup.mjs';

export const FOCUS_MODE = 'focus';
export const SHARED_MODE = 'next-steps';
const LAUNCH_KEYS = Object.freeze([
  'profile',
  'argv',
  'cwd',
  'attemptRoot',
  'home',
  'codexHome',
  'lastMessagePath',
  'stdinPath',
  'tmpdir',
  'cliTmpdir',
  'env',
]);
// The shared next-steps mode's concurrency cap; model and effort come from the suite's pin.
const THREAD_CAP = 100;

function refuse(label) {
  throw new Error(`focus launch attestation refused: ${label}`);
}

function sameJson(left, right) {
  const canonical = (value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function inside(path, root) {
  const rel = relative(root, path);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function logical(path) {
  return path.startsWith('/private/tmp/') ? path.slice('/private'.length) : path;
}

const ATTEMPT_ROOT_PATTERN =
  /^([a-z0-9][a-z0-9-]*)\/slots\/([a-z0-9][a-z0-9-]*)\/slot-[1-9]\d*\/attempt-[1-9]\d*$/;

// The ordered argv of the shared next-steps mode for this launch, rebuilt because the shared
// builder is not exported; the shared verifier compares the launch against its own copy.
export function focusArgv({ binary, cwd, attemptRoot, tmpdir, lastMessagePath }) {
  const { model, reasoningEffort } = suite.expectedProfile;
  return [
    binary,
    '--strict-config',
    '-a',
    'never',
    '-s',
    'workspace-write',
    '-C',
    cwd,
    '-c',
    'sandbox_workspace_write.network_access=false',
    '-c',
    `sandbox_workspace_write.writable_roots=${JSON.stringify([attemptRoot])}`,
    '-c',
    'sandbox_workspace_write.exclude_tmpdir_env_var=true',
    '-c',
    'sandbox_workspace_write.exclude_slash_tmp=true',
    '-c',
    `shell_environment_policy.set.TMPDIR=${JSON.stringify(tmpdir)}`,
    '-c',
    `shell_environment_policy.set.TMPPREFIX=${JSON.stringify(join(tmpdir, 'zsh'))}`,
    '-c',
    `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`,
    '-c',
    `features.multi_agent_v2.max_concurrent_threads_per_session=${THREAD_CAP}`,
    'exec',
    '--ignore-user-config',
    '--ignore-rules',
    '--json',
    '-m',
    model,
    '--output-last-message',
    lastMessagePath,
    '--ephemeral',
    '-',
  ];
}

// The launch object for one physical attempt root, in the shape both verifiers read.
export function buildFocusLaunch({ scenario, attemptRoot, home, codexHome, binary }) {
  const cwd = join(attemptRoot, 'project');
  const tmpdir = join(attemptRoot, 'tmp');
  const cliTmpdir = join(dirname(attemptRoot), `${basename(attemptRoot)}-cli-tmp`);
  const lastMessagePath = lastMessagePathFor(attemptRoot);
  return {
    suite: FOCUS_MODE,
    scenario,
    profile: { ...suite.expectedProfile },
    argv: focusArgv({ binary, cwd, attemptRoot, tmpdir, lastMessagePath }),
    cwd,
    attemptRoot,
    home,
    codexHome,
    lastMessagePath,
    stdinPath: join(attemptRoot, 'prompt.txt'),
    tmpdir,
    cliTmpdir,
    env: { HOME: home, CODEX_HOME: codexHome, PWD: cwd, TMPDIR: cliTmpdir },
  };
}

// Verify the exact next focus launch. The focus-only checks run first and need no file system; the
// shared verifier then checks the bundle, the probes and the launch itself. `verifier` is injectable
// for tests only.
export function verifyFocusLaunch(
  { bundlePath, launch, now },
  { verifier = verifyHostQualification } = {},
) {
  if (launch === null || typeof launch !== 'object' || Array.isArray(launch)) {
    refuse('the measured launch must be an object');
  }
  if (!sameJson(Object.keys(launch).sort(), ['scenario', 'suite', ...LAUNCH_KEYS].sort())) {
    refuse(`the measured launch fields must be exactly suite, scenario, ${LAUNCH_KEYS.join(', ')}`);
  }
  if (launch.suite !== FOCUS_MODE) refuse(`the launch names suite ${launch.suite}, not focus`);
  if (!suite.scenarios.includes(launch.scenario)) {
    refuse(`the launch names no focus scenario: ${launch.scenario}`);
  }
  if (!sameJson(launch.profile, suite.expectedProfile)) {
    refuse('the launch profile is not the focus suite pin');
  }
  for (const key of ['attemptRoot', 'lastMessagePath', 'stdinPath', 'home', 'codexHome']) {
    if (typeof launch[key] !== 'string' || !isAbsolute(launch[key])) {
      refuse(`${key} must be an absolute path`);
    }
  }
  const placement = relative(suite.sandboxBase, logical(launch.attemptRoot)).split(sep).join('/');
  const match = placement.match(ATTEMPT_ROOT_PATTERN);
  if (!match || match[2] !== launch.scenario) {
    refuse(`the attempt root is not a ${launch.scenario} attempt of a focus round`);
  }
  if (launch.lastMessagePath !== lastMessagePathFor(launch.attemptRoot)) {
    refuse("the last message must go to the attempt's own sibling last-message file");
  }
  if (/^(?:\/Users\/|\/home\/|~)/.test(launch.lastMessagePath)) {
    refuse('the last-message path must not name a home directory');
  }
  if (
    [launch.home, launch.codexHome].some(
      (home) => launch.lastMessagePath === home || inside(launch.lastMessagePath, home),
    )
  ) {
    refuse('the last-message path must lie outside the measured homes');
  }
  if (launch.stdinPath !== join(launch.attemptRoot, 'prompt.txt')) {
    refuse("the launch input must be the attempt's rendered prompt.txt");
  }
  const shared = verifier({ bundlePath, launch: { ...launch, suite: SHARED_MODE }, now });
  if (shared?.mode !== SHARED_MODE || !sameJson(shared.profile, suite.expectedProfile)) {
    refuse('the shared verifier did not attest the next-steps mode with the focus pin');
  }
  return {
    ...shared,
    mode: FOCUS_MODE,
    sharedMode: shared.mode,
    attestationPolicyDigest: `sha256:${createHash('sha256')
      .update(readFileSync(fileURLToPath(import.meta.url)))
      .digest('hex')}`,
  };
}

// --- the host-run launcher ----------------------------------------------------------------------

const USAGE =
  'usage: node evals/focus/_scaffold/launch-attestation.mjs exec --bundle FILE --round ID|MANIFEST --scenario NAME --slot N [--auth-file FILE]';

function parseArgs(args) {
  const [command, ...rest] = args;
  if (command !== 'exec') throw new Error(USAGE);
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index]?.replace(/^--/, '');
    const value = rest[index + 1];
    if (
      !['bundle', 'round', 'scenario', 'slot', 'auth-file'].includes(key) ||
      Object.hasOwn(options, key) ||
      value === undefined ||
      value.startsWith('--')
    ) {
      throw new Error(USAGE);
    }
    options[key] = value;
  }
  for (const key of ['bundle', 'round', 'scenario', 'slot']) {
    if (options[key] === undefined) throw new Error(USAGE);
  }
  return options;
}

// The slot's current attempt, refused unless it is prepared and untouched.
function currentAttemptRoot(handle, scenario, slot) {
  const manifestPath = handle.includes(sep)
    ? resolve(handle)
    : resolve(suite.sandboxBase, handle, 'manifest.json');
  const roundRoot = dirname(manifestPath);
  if (!inside(logical(realpathSync(roundRoot)), logical(realpathSync(suite.sandboxBase)))) {
    refuse(`${manifestPath} is not a focus round manifest`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!manifest.slots?.some((entry) => entry.scenario === scenario && entry.slot === slot)) {
    refuse(`the round has no slot ${scenario}/${slot}`);
  }
  const first = sandboxPaths(roundRoot, scenario, slot, 1);
  if (existsSync(resolve(first.slotRoot, 'retry-transition.json'))) {
    refuse(`${scenario}/${slot} has an unfinished retry transition`);
  }
  const state = JSON.parse(readFileSync(first.state, 'utf8'));
  const paths = sandboxPaths(roundRoot, scenario, slot, state.currentAttempt);
  if (existsSync(paths.hostReceipt) || existsSync(paths.sealReceipt)) {
    refuse(`${scenario}/${slot} attempt-${state.currentAttempt} already ran`);
  }
  for (const log of [paths.callLog, auxiliaryLogPath(suite, paths)]) {
    if (existsSync(log) && statSync(log).size > 0) {
      refuse(`${scenario}/${slot} attempt-${state.currentAttempt} already left evidence`);
    }
  }
  return realpathSync(paths.attemptRoot);
}

// host-run's fresh profile: `<profile>/home` and `<profile>/codex-home`. The strict verifier allows
// one authentication link only, at CODEX_HOME/auth.json, so this launcher creates exactly that one
// and host-run is started without its own `--auth-file`.
function profileHomes(authFile) {
  const { HOME: home, CODEX_HOME: codexHome } = process.env;
  if (
    !home ||
    !codexHome ||
    dirname(home) !== dirname(codexHome) ||
    basename(home) !== 'home' ||
    basename(codexHome) !== 'codex-home'
  ) {
    refuse('run this launcher inside evals/host-run.mjs, which supplies the fresh profile homes');
  }
  if (authFile !== undefined) {
    const link = join(codexHome, 'auth.json');
    if (!existsSync(link)) symlinkSync(resolve(authFile), link);
    if (!lstatSync(link).isSymbolicLink()) refuse('CODEX_HOME/auth.json must be the launch link');
  }
  return { home, codexHome };
}

function privateDirectory(path) {
  if (!existsSync(path)) mkdirSync(path, { mode: 0o700 });
  chmodSync(path, 0o700);
}

async function main(args) {
  const options = parseArgs(args);
  const slot = Number(options.slot);
  if (!Number.isSafeInteger(slot) || slot < 1) throw new Error('--slot must be a positive integer');
  const attemptRoot = currentAttemptRoot(options.round, options.scenario, slot);
  const { home, codexHome } = profileHomes(options['auth-file']);
  const bundle = JSON.parse(readFileSync(options.bundle, 'utf8'));
  const launch = buildFocusLaunch({
    scenario: options.scenario,
    attemptRoot,
    home,
    codexHome,
    binary: bundle?.toolchain?.binary?.path,
  });
  privateDirectory(launch.tmpdir);
  privateDirectory(launch.cliTmpdir);
  const attestation = verifyFocusLaunch({ bundlePath: options.bundle, launch, now: Date.now() });
  process.stderr.write(`focus-launch-attestation: ${JSON.stringify(attestation)}\n`);
  const child = spawn(launch.argv[0], launch.argv.slice(1), {
    cwd: launch.cwd,
    env: { ...process.env, ...launch.env },
    stdio: [openSync(launch.stdinPath, 'r'), 'inherit', 'inherit'],
  });
  return new Promise((resolveExit, rejectExit) => {
    child.on('error', rejectExit);
    child.on('exit', (code, signal) => resolveExit(code ?? 128 + (constants.signals[signal] ?? 0)));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    },
  );
}
