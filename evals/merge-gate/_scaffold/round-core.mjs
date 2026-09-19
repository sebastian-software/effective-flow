import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import {
  buildPortableSkill,
  digestFile,
  digestOf,
  pristineScenarioBuildIdentity,
  scenarioBuildIdentity,
} from './build-identity.mjs';
import { requiresIterateTrace } from './configured-reviewer-scenario.mjs';
import { evaluateEvidence } from './evaluate.mjs';
import { validateArchivedPairing } from './run-evidence.mjs';
import { provisionSlot } from './scaffold.mjs';
import { SANDBOX_BASE, sandboxPaths, validatePositiveInteger } from './sandbox.mjs';
import { discoverSuite, REQUIRED_RUNS, selectScenarios, SUITE_ROOT } from './suite.mjs';

const REPOSITORY_ROOT = resolve(SUITE_ROOT, '..', '..');
const PHYSICAL_REPOSITORY_ROOT = realpathSync(REPOSITORY_ROOT);
const RESULTS_DIR = resolve(SUITE_ROOT, 'results');
const PROFILE_KEYS = ['harness', 'model', 'reasoningEffort', 'reportedVersion', 'toolPolicy'];
const PREPARED_DIGEST_KEYS = [
  'buildIdentity',
  'fixture',
  'projectAgents',
  'projectConfig',
  'prompt',
  'runMetadata',
  'trackerStub',
];
const RECEIPT_KEYS = [
  'completed',
  'initialWorkingRoot',
  'nonForked',
  'profile',
  'schemaVersion',
  'taskInput',
];

function json(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function atomicJson(path, value, { exclusive = false } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(temporary, stableJson(value), { flag: 'wx' });
  if (exclusive && existsSync(path)) {
    rmSync(temporary, { force: true });
    throw new Error(`refusing to replace immutable file ${path}`);
  }
  renameSync(temporary, path);
}

function sameKeys(value, keys) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function sameProfile(left, right) {
  return (
    sameKeys(left, PROFILE_KEYS) &&
    sameKeys(right, PROFILE_KEYS) &&
    PROFILE_KEYS.every((key) => left[key] === right[key])
  );
}

function sameHostReceipt(left, right) {
  return (
    sameKeys(left, RECEIPT_KEYS) &&
    sameKeys(right, RECEIPT_KEYS) &&
    RECEIPT_KEYS.filter((key) => key !== 'profile').every((key) => left[key] === right[key]) &&
    sameProfile(left.profile, right.profile)
  );
}

function contained(root, candidate, label) {
  const normalizedRoot = resolve(root);
  const normalized = resolve(candidate);
  if (normalized !== normalizedRoot && !normalized.startsWith(`${normalizedRoot}${sep}`)) {
    throw new Error(`${label} escapes ${normalizedRoot}: ${candidate}`);
  }
  return normalized;
}

function blockingWait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function lockWaitMilliseconds(kind) {
  const name =
    kind === 'publication'
      ? 'EFFECTIVE_FLOW_EVAL_PUBLICATION_LOCK_WAIT_MS'
      : 'EFFECTIVE_FLOW_EVAL_SLOT_LOCK_WAIT_MS';
  const fallback = kind === 'publication' ? 10_000 : 2_000;
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value < 0 || value > 30_000) {
    throw new Error(`${name} must be an integer from 0 through 30000`);
  }
  return value;
}

function lockOwner(lockPath) {
  const names = readdirSync(lockPath).filter((name) => name.endsWith('.owner.json'));
  if (names.length !== 1) throw new Error(`lock at ${lockPath} has no unique readable owner`);
  const ownerPath = resolve(lockPath, names[0]);
  const owner = json(ownerPath);
  const token = names[0].slice(0, -'.owner.json'.length);
  if (
    !/^[0-9a-f-]{36}$/.test(token) ||
    owner.token !== token ||
    !Number.isSafeInteger(owner.pid) ||
    owner.pid < 1
  ) {
    throw new Error(`lock at ${lockPath} has no readable owner`);
  }
  return { ...owner, ownerPath, token };
}

function reapLockIfStale(lockPath) {
  if (!existsSync(lockPath)) return true;
  let owner;
  try {
    owner = lockOwner(lockPath);
  } catch {
    return false;
  }
  if (owner.pid === process.pid) return false;
  try {
    process.kill(owner.pid, 0);
    return false;
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
  const reapedPath = `${lockPath}.reaped-${owner.token}`;
  try {
    renameSync(lockPath, reapedPath);
    return true;
  } catch (error) {
    if (['EEXIST', 'ENOTEMPTY', 'ENOENT'].includes(error?.code)) return true;
    throw error;
  }
}

function releaseLock(lockPath, token) {
  let owner;
  try {
    owner = lockOwner(lockPath);
  } catch {
    return;
  }
  if (owner.token !== token) return;
  try {
    rmSync(resolve(lockPath, `${token}.owner.json`), { force: true });
    rmdirSync(lockPath);
  } catch (error) {
    if (!['ENOENT', 'ENOTEMPTY'].includes(error?.code)) throw error;
  }
}

function withLock(lockPath, action, { kind = 'slot', waitMilliseconds } = {}) {
  const wait = waitMilliseconds ?? lockWaitMilliseconds(kind);
  const deadline = Date.now() + wait;
  const token = randomUUID();
  const candidate = `${lockPath}.candidate-${token}`;
  mkdirSync(dirname(lockPath), { recursive: true });
  mkdirSync(candidate);
  atomicJson(
    resolve(candidate, `${token}.owner.json`),
    { pid: process.pid, token },
    { exclusive: true },
  );
  let reportedWait = false;
  try {
    for (;;) {
      try {
        renameSync(candidate, lockPath);
        break;
      } catch (error) {
        if (!['EEXIST', 'ENOTEMPTY'].includes(error?.code)) throw error;
        const waitMarker = process.env.EFFECTIVE_FLOW_EVAL_LOCK_WAIT_MARKER;
        if (waitMarker && !reportedWait) {
          writeFileSync(waitMarker, kind);
          reportedWait = true;
        }
        if (reapLockIfStale(lockPath)) continue;
        if (Date.now() >= deadline) {
          throw new Error(`timed out waiting for live ${kind} lock: ${lockPath}`);
        }
        blockingWait(20);
      }
    }
    try {
      return action();
    } finally {
      pauseAtBoundary('before-lock-release');
      releaseLock(lockPath, token);
    }
  } finally {
    rmSync(candidate, { recursive: true, force: true });
  }
}

function pauseAtBoundary(name) {
  if (process.env.EFFECTIVE_FLOW_EVAL_PAUSE_AT !== name) return;
  const marker = process.env.EFFECTIVE_FLOW_EVAL_PAUSE_MARKER;
  if (!marker) throw new Error(`${name} pause requires a marker path`);
  writeFileSync(marker, name);
  const release = process.env.EFFECTIVE_FLOW_EVAL_PAUSE_RELEASE;
  if (release) {
    while (!existsSync(release)) blockingWait(20);
    return;
  }
  for (;;) blockingWait(1_000);
}

function holdPublicationLockForTest() {
  if (process.env.EFFECTIVE_FLOW_EVAL_PUBLICATION_HOLD_MS === undefined) return;
  const milliseconds = Number(process.env.EFFECTIVE_FLOW_EVAL_PUBLICATION_HOLD_MS);
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0 || milliseconds > 5_000) {
    throw new Error('EFFECTIVE_FLOW_EVAL_PUBLICATION_HOLD_MS must be from 0 through 5000');
  }
  const marker = process.env.EFFECTIVE_FLOW_EVAL_PUBLICATION_HOLD_MARKER;
  if (marker) writeFileSync(marker, 'locked');
  blockingWait(milliseconds);
}

export function normalizeProfile(profile = {}) {
  const unknown = Object.keys(profile).filter((key) => !PROFILE_KEYS.includes(key));
  if (unknown.length > 0)
    throw new Error(`execution profile has unknown fields: ${unknown.join(', ')}`);
  const normalized = {};
  for (const key of PROFILE_KEYS) {
    const value = profile[key] ?? 'unknown';
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`execution profile ${key} must be a non-empty string`);
    }
    if (
      /(?:session|thread|task)[_-]?id|https?:\/\/|account|e-?mail|@/i.test(value) ||
      /(?:^|[\s=])(?:\/Users\/|\/home\/|~[\\/])/.test(value)
    ) {
      throw new Error(`execution profile ${key} contains a sensitive or link-like value`);
    }
    normalized[key] = value.trim();
  }
  if (!sameKeys(normalized, PROFILE_KEYS)) throw new Error('execution profile has unknown fields');
  return normalized;
}

function sourceRevision() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
  }).trim();
}

export function createRound({
  scenarios = [],
  profile = {},
  base = SANDBOX_BASE,
  roundId = `${Date.now().toString(36)}-${randomUUID()}`,
} = {}) {
  const selected = selectScenarios(scenarios);
  const normalizedProfile = normalizeProfile(profile);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(roundId)) throw new Error(`invalid round id ${roundId}`);
  const roundRoot = contained(base, resolve(base, roundId), 'round root');
  mkdirSync(resolve(base), { recursive: true });
  mkdirSync(roundRoot, { recursive: false });
  const outputRoot = resolve(roundRoot, 'build');
  let builtSkillRoot;
  try {
    builtSkillRoot = buildPortableSkill(outputRoot);
    const identities = Object.fromEntries(
      selected.map((scenario) => [
        scenario,
        pristineScenarioBuildIdentity(scenario, builtSkillRoot),
      ]),
    );
    const slots = [];
    for (const scenario of selected) {
      for (let slot = 1; slot <= REQUIRED_RUNS; slot += 1) {
        const provisioned = provisionSlot({
          roundRoot,
          scenario,
          slot,
          attempt: 1,
          builtSkillRoot,
          profile: normalizedProfile,
          identity: identities[scenario],
        });
        const state = {
          schemaVersion: 1,
          currentAttempt: 1,
          discardedAttempts: 0,
          expectedDigests: provisioned.preparedDigests,
        };
        atomicJson(provisioned.paths.state, state, { exclusive: true });
        slots.push({
          scenario,
          slot,
          slotRoot: provisioned.paths.slotRoot,
          promptDigest: provisioned.metadata.promptDigest,
          expectedDigests: provisioned.preparedDigests,
        });
      }
    }
    const manifest = {
      schemaVersion: 1,
      roundId,
      createdAt: new Date().toISOString(),
      creatorCheckout: PHYSICAL_REPOSITORY_ROOT,
      sourceRevision: sourceRevision(),
      requiredRuns: REQUIRED_RUNS,
      scenarios: selected,
      profile: normalizedProfile,
      builtSkillRoot,
      identities,
      slots,
    };
    const manifestPath = resolve(roundRoot, 'manifest.json');
    atomicJson(manifestPath, manifest, { exclusive: true });
    chmodSync(manifestPath, 0o444);
    return { manifest, manifestPath, roundRoot };
  } catch (error) {
    rmSync(roundRoot, { recursive: true, force: true });
    throw error;
  }
}

export function loadRound(handle, { base = SANDBOX_BASE, mutating = true } = {}) {
  if (!handle) throw new Error('a round id or manifest path is required');
  const candidate = handle.includes(sep) ? resolve(handle) : resolve(base, handle, 'manifest.json');
  const manifestPath = contained(base, candidate, 'round manifest');
  const roundRoot = dirname(manifestPath);
  if (!existsSync(manifestPath)) throw new Error(`no round manifest at ${manifestPath}`);
  if (lstatSync(roundRoot).isSymbolicLink() || lstatSync(manifestPath).isSymbolicLink()) {
    throw new Error('round roots and manifests may not be symlinks');
  }
  contained(realpathSync(base), realpathSync(roundRoot), 'physical round root');
  const manifest = json(manifestPath);
  if (manifest.schemaVersion !== 1 || manifest.requiredRuns !== REQUIRED_RUNS) {
    throw new Error(`unsupported or malformed round manifest at ${manifestPath}`);
  }
  const suite = discoverSuite();
  const uniqueScenarios = [...new Set(manifest.scenarios ?? [])];
  if (
    !Array.isArray(manifest.scenarios) ||
    uniqueScenarios.length !== manifest.scenarios.length ||
    uniqueScenarios.some((scenario) => !suite.scenarios.includes(scenario))
  ) {
    throw new Error(`round manifest has unknown or duplicate scenarios at ${manifestPath}`);
  }
  if (!sameProfile(normalizeProfile(manifest.profile), manifest.profile)) {
    throw new Error('round manifest execution profile is incomplete or non-canonical');
  }
  const expectedSlots = uniqueScenarios.length * REQUIRED_RUNS;
  if (!Array.isArray(manifest.slots) || manifest.slots.length !== expectedSlots) {
    throw new Error(`round manifest must state exactly ${expectedSlots} slots`);
  }
  const slotKeys = new Set();
  for (const slot of manifest.slots) {
    if (!uniqueScenarios.includes(slot.scenario))
      throw new Error('round manifest slot has an unknown scenario');
    validatePositiveInteger(slot.slot, 'manifest slot');
    if (slot.slot > REQUIRED_RUNS)
      throw new Error(`manifest slot ${slot.slot} exceeds ${REQUIRED_RUNS}`);
    const key = `${slot.scenario}:${slot.slot}`;
    if (slotKeys.has(key)) throw new Error(`round manifest duplicates slot ${key}`);
    slotKeys.add(key);
    const expected = sandboxPaths(roundRoot, slot.scenario, slot.slot, 1).slotRoot;
    if (slot.slotRoot !== expected)
      throw new Error(`round manifest slot root is not canonical for ${key}`);
    if (!/^sha256:[0-9a-f]{64}$/.test(slot.promptDigest ?? '')) {
      throw new Error(`round manifest has no prompt digest for ${key}`);
    }
    if (
      !slot.expectedDigests ||
      !sameKeys(slot.expectedDigests, PREPARED_DIGEST_KEYS) ||
      Object.values(slot.expectedDigests).some((digest) => !/^sha256:[0-9a-f]{64}$/.test(digest))
    ) {
      throw new Error(`round manifest has malformed prepared digests for ${key}`);
    }
  }
  if (
    typeof manifest.builtSkillRoot !== 'string' ||
    contained(roundRoot, manifest.builtSkillRoot, 'built skill root') !== manifest.builtSkillRoot
  ) {
    throw new Error('round manifest has a non-canonical built skill root');
  }
  if (
    !existsSync(manifest.builtSkillRoot) ||
    lstatSync(manifest.builtSkillRoot).isSymbolicLink() ||
    !lstatSync(manifest.builtSkillRoot).isDirectory()
  ) {
    throw new Error('round manifest built skill root is missing, symlinked, or not a directory');
  }
  contained(
    realpathSync(roundRoot),
    realpathSync(manifest.builtSkillRoot),
    'physical built skill root',
  );
  for (const scenario of uniqueScenarios) {
    if (manifest.identities?.[scenario]?.scenario !== scenario) {
      throw new Error(`round manifest has no build identity for ${scenario}`);
    }
  }
  if (mutating && manifest.creatorCheckout !== PHYSICAL_REPOSITORY_ROOT) {
    throw new Error(
      `round belongs to ${manifest.creatorCheckout}; this checkout may inspect but not mutate it`,
    );
  }
  return { manifest, manifestPath, roundRoot };
}

function currentAttempt(manifest, roundRoot, scenario, slot) {
  if (!manifest.scenarios.includes(scenario)) throw new Error(`round does not contain ${scenario}`);
  validatePositiveInteger(slot, 'slot');
  if (slot > manifest.requiredRuns)
    throw new Error(`slot ${slot} exceeds ${manifest.requiredRuns}`);
  const statePath = sandboxPaths(roundRoot, scenario, slot, 1).state;
  const slotRoot = dirname(statePath);
  if (
    !existsSync(slotRoot) ||
    lstatSync(slotRoot).isSymbolicLink() ||
    !lstatSync(slotRoot).isDirectory() ||
    !existsSync(statePath) ||
    lstatSync(statePath).isSymbolicLink() ||
    !lstatSync(statePath).isFile()
  ) {
    throw new Error(`${scenario}/${slot} has a missing, symlinked, or irregular slot state`);
  }
  contained(realpathSync(roundRoot), realpathSync(slotRoot), 'physical slot root');
  contained(realpathSync(roundRoot), realpathSync(statePath), 'physical slot state');
  const state = json(statePath);
  validatePositiveInteger(state.currentAttempt, 'current attempt');
  if (!state.expectedDigests || typeof state.discardedAttempts !== 'number') {
    throw new Error(`${scenario}/${slot} has malformed slot state`);
  }
  if (!sameKeys(state.expectedDigests, PREPARED_DIGEST_KEYS)) {
    throw new Error(`${scenario}/${slot} state has incomplete prepared digests`);
  }
  if (state.currentAttempt === 1) {
    const declared = manifest.slots.find(
      (entry) => entry.scenario === scenario && entry.slot === slot,
    );
    if (JSON.stringify(state.expectedDigests) !== JSON.stringify(declared.expectedDigests)) {
      throw new Error(`${scenario}/${slot} state disagrees with the immutable manifest`);
    }
  }
  const paths = sandboxPaths(roundRoot, scenario, slot, state.currentAttempt);
  if (
    !existsSync(paths.attemptRoot) ||
    lstatSync(paths.slotRoot).isSymbolicLink() ||
    lstatSync(paths.attemptRoot).isSymbolicLink()
  ) {
    throw new Error(`${scenario}/${slot} contains a symlinked slot or attempt root`);
  }
  contained(realpathSync(roundRoot), realpathSync(paths.attemptRoot), 'physical attempt root');
  return { state, paths };
}

function safeHostReceipt(receipt, manifest, paths) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new Error('host receipt must be an object');
  }
  if (!sameKeys(receipt, RECEIPT_KEYS)) {
    throw new Error(`host receipt fields must be exactly ${RECEIPT_KEYS.join(', ')}`);
  }
  if (
    receipt.schemaVersion !== 1 ||
    receipt.nonForked !== true ||
    receipt.completed !== true ||
    receipt.taskInput !== 'rendered-prompt-only' ||
    receipt.initialWorkingRoot !== paths.projectRoot
  ) {
    throw new Error('host receipt does not attest the required non-forked slot-project session');
  }
  if (
    !receipt.profile ||
    typeof receipt.profile !== 'object' ||
    Array.isArray(receipt.profile) ||
    !sameKeys(receipt.profile, PROFILE_KEYS)
  ) {
    throw new Error(`host receipt profile fields must be exactly ${PROFILE_KEYS.join(', ')}`);
  }
  const normalizedReceiptProfile = normalizeProfile(receipt.profile);
  if (
    !sameProfile(receipt.profile, normalizedReceiptProfile) ||
    !sameProfile(receipt.profile, manifest.profile)
  ) {
    throw new Error('host receipt execution profile does not match the round profile');
  }
  const serialized = JSON.stringify(receipt);
  if (/(?:session|thread|task)[_-]?id|https?:\/\/|account|e-?mail/i.test(serialized)) {
    throw new Error('host receipt contains a sensitive or link-like field/value');
  }
  return receipt;
}

function preparedDigests(paths) {
  const config = resolve(paths.projectRoot, 'docs', 'adr', 'effective-flow-project-setup.md');
  return {
    log: digestFile(paths.callLog),
    prompt: digestFile(paths.prompt),
    buildIdentity: digestFile(paths.buildIdentity),
    fixture: digestFile(paths.fixture),
    projectAgents: digestFile(resolve(paths.projectRoot, 'AGENTS.md')),
    projectConfig: digestFile(config),
    runMetadata: digestFile(paths.runMetadata),
    trackerStub: digestFile(resolve(paths.skillRoot, 'scripts', 'remote-tracker.mjs')),
  };
}

// The configured-reviewer scenario's echo trace is part of its sealed evidence unit, so a write to
// it after sealing is `changed-after-seal` exactly as a write to the call log is.
function sealDigests(paths, scenario) {
  return {
    ...preparedDigests(paths),
    hostReceipt: digestFile(paths.hostReceipt),
    ...(requiresIterateTrace(scenario) ? { iterateLog: digestFile(paths.iterateLog) } : {}),
  };
}

export function sealAttempt({ handle, scenario, slot, hostReceipt, base = SANDBOX_BASE }) {
  const { manifest, roundRoot } = loadRound(handle, { base });
  const slotLock = sandboxPaths(roundRoot, scenario, slot, 1).slotLock;
  return withLock(slotLock, () => {
    const { state, paths } = currentAttempt(manifest, roundRoot, scenario, slot);
    safeHostReceipt(hostReceipt, manifest, paths);
    if (existsSync(paths.sealReceipt)) {
      if (existsSync(paths.hostReceipt) && sameHostReceipt(json(paths.hostReceipt), hostReceipt)) {
        return json(paths.sealReceipt);
      }
      throw new Error(`${scenario}/${slot} is already sealed with a different host receipt`);
    }
    if (existsSync(paths.callLogLock))
      throw new Error(`call-log lock is still live at ${paths.callLogLock}`);
    if (!existsSync(paths.callLog) || statSync(paths.callLog).size === 0) {
      throw new Error(`${scenario}/${slot} has no non-empty call log`);
    }
    if (requiresIterateTrace(scenario)) {
      if (existsSync(`${paths.iterateLog}.lock`))
        throw new Error(`iterate-trace lock is still live at ${paths.iterateLog}.lock`);
      if (!existsSync(paths.iterateLog))
        throw new Error(`${scenario}/${slot} has no paired iterate trace at ${paths.iterateLog}`);
    }
    const metadata = json(paths.runMetadata);
    const currentPreparedDigests = preparedDigests(paths);
    const preparedSubset = Object.fromEntries(
      Object.keys(state.expectedDigests).map((key) => [key, currentPreparedDigests[key]]),
    );
    if (JSON.stringify(preparedSubset) !== JSON.stringify(state.expectedDigests)) {
      throw new Error(
        'slot fixture, prompt, metadata, stub, or project inputs changed before sealing',
      );
    }
    if (
      metadata.scenario !== scenario ||
      metadata.slot !== slot ||
      metadata.attempt !== state.currentAttempt ||
      metadata.projectRoot !== paths.projectRoot ||
      metadata.skillRoot !== paths.skillRoot ||
      JSON.stringify(metadata.profile) !== JSON.stringify(manifest.profile) ||
      metadata.promptDigest !== digestFile(paths.prompt)
    ) {
      throw new Error('slot metadata no longer matches the prepared attempt');
    }
    const actualIdentity = scenarioBuildIdentity(scenario, paths.skillRoot);
    if (JSON.stringify(actualIdentity) !== JSON.stringify(manifest.identities[scenario])) {
      throw new Error('slot build or immutable scenario inputs changed before sealing');
    }
    if (JSON.stringify(json(paths.buildIdentity)) !== JSON.stringify(actualIdentity)) {
      throw new Error('slot build-identity file changed before sealing');
    }
    if (existsSync(paths.hostReceipt)) {
      if (!sameHostReceipt(json(paths.hostReceipt), hostReceipt)) {
        throw new Error('attempt already carries a different host receipt');
      }
    } else {
      atomicJson(paths.hostReceipt, hostReceipt, { exclusive: true });
    }
    pauseAtBoundary('host-receipt-written');
    const receipt = {
      schemaVersion: 1,
      scenario,
      slot,
      attempt: metadata.attempt,
      sealedAt: new Date().toISOString(),
      buildDigest: actualIdentity.digest,
      digests: sealDigests(paths, scenario),
    };
    atomicJson(paths.sealReceipt, receipt, { exclusive: true });
    return receipt;
  });
}

function changedAfterSeal(paths, scenario) {
  if (!existsSync(paths.sealReceipt)) return false;
  const sealed = json(paths.sealReceipt);
  if (requiresIterateTrace(scenario) && !existsSync(paths.iterateLog)) return true;
  const current = sealDigests(paths, scenario);
  return JSON.stringify(sealed.digests) !== JSON.stringify(current);
}

export function roundStatus(handle, { base = SANDBOX_BASE } = {}) {
  const { manifest, roundRoot } = loadRound(handle, { base, mutating: false });
  return manifest.slots.map(({ scenario, slot }) => {
    const transitionPath = retryTransitionPath(roundRoot, scenario, slot);
    if (existsSync(transitionPath)) {
      const transition = validateRetryTransition(scenario, slot, json(transitionPath));
      const paths = sandboxPaths(roundRoot, scenario, slot, transition.toAttempt);
      return {
        scenario,
        slot,
        attempt: transition.toAttempt,
        status: 'retry-pending',
        prompt: paths.prompt,
        projectRoot: paths.projectRoot,
      };
    }
    const { state, paths } = currentAttempt(manifest, roundRoot, scenario, slot);
    let status = 'prepared';
    if (existsSync(paths.callLog) && statSync(paths.callLog).size > 0) status = 'unsealed';
    if (existsSync(paths.sealReceipt)) {
      if (changedAfterSeal(paths, scenario)) status = 'changed-after-seal';
      else {
        const evaluation = evaluateAttempt(manifest, scenario, paths);
        status = evaluation.validityProblems.length > 0 ? 'invalid' : 'sealed';
      }
    }
    return {
      scenario,
      slot,
      attempt: state.currentAttempt,
      status,
      prompt: paths.prompt,
      projectRoot: paths.projectRoot,
    };
  });
}

function evaluateAttempt(manifest, scenario, paths) {
  const fixture = json(paths.fixture);
  return evaluateEvidence({
    scenario,
    logText: readFileSync(paths.callLog, 'utf8'),
    fixture,
    projectRoot: paths.projectRoot,
    buildIdentity: json(paths.buildIdentity),
    expectedBuildIdentity: manifest.identities[scenario],
    answerableOperations: new Set(Object.keys(fixture.operations ?? {})),
    iterateTraceText: existsSync(paths.iterateLog) ? readFileSync(paths.iterateLog, 'utf8') : null,
  });
}

function retryTransitionPath(roundRoot, scenario, slot) {
  return resolve(sandboxPaths(roundRoot, scenario, slot, 1).slotRoot, 'retry-transition.json');
}

function validateRetryTransition(scenario, slot, transition) {
  if (
    !transition ||
    !sameKeys(transition, [
      'discardedAttempts',
      'expectedDigests',
      'fromAttempt',
      'reason',
      'schemaVersion',
      'toAttempt',
    ]) ||
    transition.schemaVersion !== 1 ||
    transition.toAttempt !== transition.fromAttempt + 1 ||
    !sameKeys(transition.expectedDigests, PREPARED_DIGEST_KEYS)
  ) {
    throw new Error(`${scenario}/${slot} has a malformed retry transition`);
  }
  return transition;
}

function finishRetryTransition({ roundRoot, scenario, slot, transition, pause = false }) {
  validateRetryTransition(scenario, slot, transition);
  const previous = sandboxPaths(roundRoot, scenario, slot, transition.fromAttempt);
  const next = sandboxPaths(roundRoot, scenario, slot, transition.toAttempt);
  const quarantined = resolve(previous.quarantineRoot, `attempt-${transition.fromAttempt}`);
  if (!existsSync(next.attemptRoot)) {
    throw new Error(`${scenario}/${slot} retry transition has no prepared replacement attempt`);
  }
  mkdirSync(previous.quarantineRoot, { recursive: true });
  if (existsSync(previous.attemptRoot)) {
    if (existsSync(quarantined)) {
      throw new Error(`${scenario}/${slot} retry transition has two copies of its prior attempt`);
    }
    renameSync(previous.attemptRoot, quarantined);
  } else if (!existsSync(quarantined)) {
    throw new Error(`${scenario}/${slot} retry transition lost its prior attempt`);
  }
  if (pause) pauseAtBoundary('retry-quarantined');
  atomicJson(next.state, {
    schemaVersion: 1,
    currentAttempt: transition.toAttempt,
    discardedAttempts: transition.discardedAttempts,
    expectedDigests: transition.expectedDigests,
  });
  rmSync(retryTransitionPath(roundRoot, scenario, slot), { force: true });
  return { attempt: transition.toAttempt, prompt: next.prompt };
}

function recoverRetryTransition({ roundRoot, scenario, slot }) {
  const path = retryTransitionPath(roundRoot, scenario, slot);
  if (!existsSync(path)) return null;
  const transition = json(path);
  const statePath = sandboxPaths(roundRoot, scenario, slot, 1).state;
  const state = json(statePath);
  if (state.currentAttempt === transition.toAttempt) {
    rmSync(path, { force: true });
    return {
      attempt: transition.toAttempt,
      prompt: sandboxPaths(roundRoot, scenario, slot, transition.toAttempt).prompt,
    };
  }
  if (state.currentAttempt !== transition.fromAttempt) {
    throw new Error(`${scenario}/${slot} retry transition disagrees with slot state`);
  }
  return finishRetryTransition({ roundRoot, scenario, slot, transition });
}

function reprovision({ manifest, roundRoot, scenario, slot, state, paths, reason }) {
  if (scenario === 'unreported-checks-at-phase-four' && state.discardedAttempts >= 5) {
    throw new Error(`${scenario}/${slot} already discarded five attempts; stop for investigation`);
  }
  const next = state.currentAttempt + 1;
  const provisioned = provisionSlot({
    roundRoot,
    scenario,
    slot,
    attempt: next,
    builtSkillRoot: manifest.builtSkillRoot,
    profile: manifest.profile,
    identity: manifest.identities[scenario],
  });
  atomicJson(resolve(paths.attemptRoot, 'retry.json'), {
    reason,
    retainedAt: new Date().toISOString(),
  });
  const transition = {
    schemaVersion: 1,
    fromAttempt: state.currentAttempt,
    toAttempt: next,
    discardedAttempts: state.discardedAttempts + 1,
    reason,
    expectedDigests: provisioned.preparedDigests,
  };
  atomicJson(retryTransitionPath(roundRoot, scenario, slot), transition, { exclusive: true });
  return finishRetryTransition({ roundRoot, scenario, slot, transition, pause: true });
}

export function retryInvalid({ handle, scenario, slot, reason, base = SANDBOX_BASE }) {
  const { manifest, roundRoot } = loadRound(handle, { base });
  const slotLock = sandboxPaths(roundRoot, scenario, slot, 1).slotLock;
  return withLock(slotLock, () => {
    const recovered = recoverRetryTransition({ roundRoot, scenario, slot });
    if (recovered) return recovered;
    const { state, paths } = currentAttempt(manifest, roundRoot, scenario, slot);
    if (!existsSync(paths.sealReceipt)) throw new Error('retry-invalid requires a sealed attempt');
    if (changedAfterSeal(paths, scenario)) {
      return reprovision({
        manifest,
        roundRoot,
        scenario,
        slot,
        state,
        paths,
        reason: reason || 'attempt changed after sealing',
      });
    }
    const result = evaluateAttempt(manifest, scenario, paths);
    if (result.validityProblems.length === 0) {
      throw new Error(
        result.findings.length > 0
          ? 'valid behavioural findings are retained and may not be retried'
          : 'valid evidence may not be retried',
      );
    }
    return reprovision({
      manifest,
      roundRoot,
      scenario,
      slot,
      state,
      paths,
      reason: reason || result.validityProblems.join('; '),
    });
  });
}

export function retryAborted({ handle, scenario, slot, assertion, base = SANDBOX_BASE }) {
  const { manifest, roundRoot } = loadRound(handle, { base });
  const slotLock = sandboxPaths(roundRoot, scenario, slot, 1).slotLock;
  return withLock(slotLock, () => {
    const recovered = recoverRetryTransition({ roundRoot, scenario, slot });
    if (recovered) return recovered;
    const { state, paths } = currentAttempt(manifest, roundRoot, scenario, slot);
    if (
      !assertion ||
      !sameKeys(assertion, ['reason', 'schemaVersion', 'stopped']) ||
      assertion.schemaVersion !== 1 ||
      assertion.stopped !== true ||
      typeof assertion.reason !== 'string' ||
      assertion.reason.trim() === ''
    ) {
      throw new Error('retry-aborted requires {schemaVersion:1, stopped:true, reason}');
    }
    if (existsSync(paths.sealReceipt)) throw new Error('sealed attempts use retry-invalid');
    if (existsSync(paths.callLog) && statSync(paths.callLog).size > 0) {
      throw new Error('a non-empty log must be sealed and evaluated before any retry');
    }
    return reprovision({
      manifest,
      roundRoot,
      scenario,
      slot,
      state,
      paths,
      reason: assertion.reason,
    });
  });
}

function filesUnder(root, directory = root) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`generation contains a symlink: ${path}`);
    if (entry.isDirectory()) files.push(...filesUnder(root, path));
    else if (entry.isFile() && relative(root, path) !== '.generation.json') files.push(path);
    else if (!entry.isFile()) throw new Error(`generation contains a non-regular file: ${path}`);
  }
  return files;
}

function generationContentDigest(directory) {
  const lines = filesUnder(directory)
    .map((path) => `${relative(directory, path)} ${digestFile(path)}`)
    .sort();
  return digestOf(lines.join('\n'));
}

function generationInfo(directory) {
  if (!existsSync(directory)) return null;
  const markerPath = resolve(directory, '.generation.json');
  if (!existsSync(markerPath)) {
    return { generation: 'legacy', contentDigest: generationContentDigest(directory) };
  }
  const marker = json(markerPath);
  if (
    !sameKeys(marker, ['contentDigest', 'generation', 'schemaVersion']) ||
    marker.schemaVersion !== 1 ||
    !/^[0-9a-f-]{36}$/.test(marker.generation ?? '') ||
    marker.contentDigest !== generationContentDigest(directory)
  ) {
    throw new Error(`generation marker or content is invalid at ${markerPath}`);
  }
  return marker;
}

function sameGeneration(actual, expected) {
  return (
    actual !== null &&
    expected !== null &&
    actual.generation === expected.generation &&
    actual.contentDigest === expected.contentDigest
  );
}

function ensureCanonicalGeneration(candidate, scenarios, identities) {
  const findings = [];
  const allowedTopLevel = new Set([...scenarios, '.generation.json']);
  const unknownTopLevel = readdirSync(candidate, { withFileTypes: true })
    .filter((entry) => !allowedTopLevel.has(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (unknownTopLevel.length > 0) {
    throw new Error(
      `candidate has unknown top-level result entries: ${unknownTopLevel.join(', ')}`,
    );
  }
  for (const scenario of scenarios) {
    const directory = resolve(candidate, scenario);
    if (!existsSync(directory)) {
      throw new Error(`candidate is missing discovered scenario directory: ${scenario}`);
    }
    if (lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory()) {
      throw new Error(`${scenario} candidate entry is not a regular directory`);
    }
    const withTrace = requiresIterateTrace(scenario);
    validateArchivedPairing(directory, withTrace);
    const suffixes = ['jsonl', 'build.json', 'prompt.txt', 'metadata.json'];
    if (withTrace) suffixes.push('iterate.jsonl');
    const names = readdirSync(directory).sort();
    for (let slot = 1; slot <= REQUIRED_RUNS; slot += 1) {
      for (const suffix of suffixes) {
        const name = `run-${slot}.${suffix}`;
        if (!names.includes(name)) throw new Error(`${scenario} candidate is missing ${name}`);
      }
    }
    const allowed = new Set(
      Array.from({ length: REQUIRED_RUNS }, (_, index) => index + 1).flatMap((slot) =>
        suffixes.map((suffix) => `run-${slot}.${suffix}`),
      ),
    );
    const extra = names.filter((name) => !allowed.has(name));
    if (extra.length > 0)
      throw new Error(`${scenario} candidate has unexpected files: ${extra.join(', ')}`);
    const fixture = json(resolve(SUITE_ROOT, 'fixtures', `${scenario}.json`));
    for (let slot = 1; slot <= REQUIRED_RUNS; slot += 1) {
      const target = resolve(directory, `run-${slot}`);
      const metadata = json(`${target}.metadata.json`);
      const stamp = json(`${target}.build.json`);
      if (
        metadata.scenario !== scenario ||
        metadata.slot !== slot ||
        metadata.promptDigest !== digestFile(`${target}.prompt.txt`) ||
        metadata.buildDigest !== stamp.digest
      ) {
        throw new Error(`${scenario}/run-${slot} metadata does not bind its archived files`);
      }
      const evaluation = evaluateEvidence({
        scenario,
        logText: readFileSync(`${target}.jsonl`, 'utf8'),
        fixture,
        projectRoot: metadata.projectRoot,
        buildIdentity: stamp,
        expectedBuildIdentity: identities[scenario],
        answerableOperations: new Set(Object.keys(fixture.operations ?? {})),
        iterateTraceText: withTrace ? readFileSync(`${target}.iterate.jsonl`, 'utf8') : null,
      });
      if (evaluation.validityProblems.length > 0) {
        throw new Error(
          `${scenario}/run-${slot} is invalid evidence: ${evaluation.validityProblems.join('; ')}`,
        );
      }
      findings.push(...evaluation.findings.map((finding) => ({ scenario, slot, finding })));
    }
  }
  return findings;
}

function rollbackHandledPublication({ journalPath, results, publicationRoot }) {
  const journal = json(journalPath);
  const candidate = contained(publicationRoot, journal.candidate, 'publication candidate');
  const backup = contained(publicationRoot, journal.backup, 'publication backup');
  const observedResults = generationInfo(results);
  const observedBackup = generationInfo(backup);

  if (sameGeneration(observedResults, journal.candidateGeneration)) {
    rmSync(results, { recursive: true, force: true });
  } else if (
    observedResults !== null &&
    !sameGeneration(observedResults, journal.previousGeneration)
  ) {
    throw new Error('handled publication rollback found a contradictory canonical generation');
  }

  if (journal.previousGeneration !== null && !existsSync(results)) {
    if (!sameGeneration(observedBackup, journal.previousGeneration)) {
      throw new Error('handled publication rollback cannot identify the previous generation');
    }
    renameSync(backup, results);
  }

  rmSync(candidate, { recursive: true, force: true });
  rmSync(backup, { recursive: true, force: true });
  rmSync(journalPath, { force: true });
  const restored = generationInfo(results);
  if (
    (journal.previousGeneration === null && restored !== null) ||
    (journal.previousGeneration !== null && !sameGeneration(restored, journal.previousGeneration))
  ) {
    throw new Error('handled publication rollback did not restore the previous generation');
  }
}

function writeJournal(path, journal) {
  atomicJson(path, journal);
  if (process.env.EFFECTIVE_FLOW_EVAL_PROMOTION_PAUSE_AT === journal.phase) {
    const marker = process.env.EFFECTIVE_FLOW_EVAL_PROMOTION_PAUSE_MARKER;
    if (!marker) throw new Error('promotion pause requires a marker path');
    writeFileSync(marker, journal.phase);
    for (;;) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
  }
  if (process.env.EFFECTIVE_FLOW_EVAL_PROMOTION_FAIL_AT === journal.phase) {
    throw new Error(`injected publication failure at ${journal.phase}`);
  }
}

function recoverPublicationLocked({ resultsDir, publicationRoot }) {
  const journalPath = resolve(publicationRoot, '.results-publication.json');
  if (!existsSync(journalPath)) {
    return { recovered: false };
  }
  const journal = json(journalPath);
  const results = resolve(resultsDir);
  const candidate = contained(publicationRoot, journal.candidate, 'publication candidate');
  const backup = contained(publicationRoot, journal.backup, 'publication backup');
  const observed = {
    results: generationInfo(results),
    candidate: generationInfo(candidate),
    backup: generationInfo(backup),
  };
  for (const [place, info] of Object.entries(observed)) {
    const allowed =
      info === null ||
      sameGeneration(info, journal.candidateGeneration) ||
      sameGeneration(info, journal.previousGeneration);
    if (!allowed) throw new Error(`publication recovery found a contradictory ${place} generation`);
  }
  if (sameGeneration(observed.results, journal.candidateGeneration)) {
    // The new generation is installed; only cleanup remained.
  } else if (sameGeneration(observed.results, journal.previousGeneration)) {
    // Nothing was renamed yet, so roll back the unused candidate.
  } else if (
    observed.results === null &&
    sameGeneration(observed.candidate, journal.candidateGeneration)
  ) {
    if (
      journal.previousGeneration !== null &&
      !sameGeneration(observed.backup, journal.previousGeneration)
    ) {
      throw new Error('publication recovery cannot identify the previous generation backup');
    }
    renameSync(candidate, results);
  } else if (
    observed.results === null &&
    observed.candidate === null &&
    sameGeneration(observed.backup, journal.previousGeneration)
  ) {
    renameSync(backup, results);
  } else {
    throw new Error('publication journal has no deterministic recovery path');
  }
  rmSync(candidate, { recursive: true, force: true });
  rmSync(backup, { recursive: true, force: true });
  rmSync(journalPath, { force: true });
  return { recovered: true };
}

export function publicationLockPath(publicationRoot = SUITE_ROOT) {
  const key = digestOf(resolve(publicationRoot)).slice('sha256:'.length);
  return resolve(
    REPOSITORY_ROOT,
    '.effective-flow',
    'merge-gate-eval',
    'publication-locks',
    `${key}.lock`,
  );
}

export function recoverPublication({
  resultsDir = RESULTS_DIR,
  publicationRoot = SUITE_ROOT,
} = {}) {
  const lockPath = publicationLockPath(publicationRoot);
  mkdirSync(publicationRoot, { recursive: true });
  return withLock(
    lockPath,
    () => {
      holdPublicationLockForTest();
      return recoverPublicationLocked({ resultsDir: resolve(resultsDir), publicationRoot });
    },
    { kind: 'publication', waitMilliseconds: 0 },
  );
}

function validateSealedSlot(manifest, roundRoot, scenario, slot) {
  const { paths } = currentAttempt(manifest, roundRoot, scenario, slot);
  if (!existsSync(paths.sealReceipt)) throw new Error(`${scenario}/${slot} is not sealed`);
  if (changedAfterSeal(paths, scenario))
    throw new Error(`${scenario}/${slot} changed after sealing`);
  const sealed = json(paths.sealReceipt);
  const metadata = json(paths.runMetadata);
  const host = json(paths.hostReceipt);
  safeHostReceipt(host, manifest, paths);
  const actualIdentity = scenarioBuildIdentity(scenario, paths.skillRoot);
  if (
    sealed.scenario !== scenario ||
    sealed.slot !== slot ||
    sealed.attempt !== metadata.attempt ||
    sealed.buildDigest !== actualIdentity.digest ||
    JSON.stringify(actualIdentity) !== JSON.stringify(manifest.identities[scenario]) ||
    JSON.stringify(json(paths.buildIdentity)) !== JSON.stringify(actualIdentity)
  ) {
    throw new Error(`${scenario}/${slot} seal or source identity no longer matches the round`);
  }
  const evaluation = evaluateAttempt(manifest, scenario, paths);
  if (evaluation.validityProblems.length > 0) {
    throw new Error(
      `${scenario}/${slot} is invalid evidence: ${evaluation.validityProblems.join('; ')}`,
    );
  }
  return { scenario, slot, paths, sealed, metadata, host, findings: evaluation.findings };
}

function validateAllSealed(manifest, roundRoot) {
  return manifest.slots.map(({ scenario, slot }) =>
    validateSealedSlot(manifest, roundRoot, scenario, slot),
  );
}

function assertCopiedArtifacts(entry, target) {
  const copied = {
    log: digestFile(`${target}.jsonl`),
    buildIdentity: digestFile(`${target}.build.json`),
    prompt: digestFile(`${target}.prompt.txt`),
    ...(requiresIterateTrace(entry.scenario)
      ? { iterateLog: digestFile(`${target}.iterate.jsonl`) }
      : {}),
  };
  for (const [name, digest] of Object.entries(copied)) {
    if (digest !== entry.sealed.digests[name]) {
      throw new Error(`${entry.scenario}/${entry.slot} copied ${name} does not match its seal`);
    }
  }
}

export function publishRound({
  handle,
  base = SANDBOX_BASE,
  resultsDir = RESULTS_DIR,
  publicationRoot = SUITE_ROOT,
}) {
  const { manifest, roundRoot } = loadRound(handle, { base });
  validateAllSealed(manifest, roundRoot);

  const suite = discoverSuite();
  const currentIdentities = {};
  const currentBuild = mkdtempSync(resolve(tmpdir(), 'effective-flow-eval-publish-'));
  let currentSkillRoot;
  try {
    currentSkillRoot = buildPortableSkill(currentBuild);
    for (const scenario of suite.scenarios) {
      const current = pristineScenarioBuildIdentity(scenario, currentSkillRoot);
      currentIdentities[scenario] = current;
      if (
        manifest.scenarios.includes(scenario) &&
        JSON.stringify(current) !== JSON.stringify(manifest.identities[scenario])
      ) {
        throw new Error(`source or eval instrument drifted since round preparation: ${scenario}`);
      }
    }
  } catch (error) {
    rmSync(currentBuild, { recursive: true, force: true });
    throw error;
  }

  const publicationLock = publicationLockPath(publicationRoot);
  const publicationJournal = resolve(publicationRoot, '.results-publication.json');
  const canonicalResults = resolve(resultsDir);
  mkdirSync(publicationRoot, { recursive: true });
  if (dirname(canonicalResults) !== resolve(publicationRoot)) {
    throw new Error(
      'results, candidate, journal, and backup must share one parent filesystem path',
    );
  }
  try {
    return withLock(
      publicationLock,
      () => {
        holdPublicationLockForTest();
        recoverPublicationLocked({ resultsDir: canonicalResults, publicationRoot });
        const evaluations = validateAllSealed(manifest, roundRoot);
        const generation = randomUUID();
        const candidate = resolve(publicationRoot, `.results-candidate-${generation}`);
        const backup = resolve(publicationRoot, `.results-backup-${generation}`);
        try {
          if (existsSync(canonicalResults))
            cpSync(canonicalResults, candidate, { recursive: true });
          else mkdirSync(candidate);
          rmSync(resolve(candidate, '.generation.json'), { force: true });
          for (const scenario of manifest.scenarios) {
            rmSync(resolve(candidate, scenario), { recursive: true, force: true });
            mkdirSync(resolve(candidate, scenario), { recursive: true });
          }
          for (const { scenario, slot, paths } of evaluations) {
            const target = resolve(candidate, scenario, `run-${slot}`);
            copyFileSync(paths.callLog, `${target}.jsonl`);
            copyFileSync(paths.buildIdentity, `${target}.build.json`);
            copyFileSync(paths.prompt, `${target}.prompt.txt`);
            if (requiresIterateTrace(scenario)) {
              copyFileSync(paths.iterateLog, `${target}.iterate.jsonl`);
            }
            const entry = evaluations.find(
              (evaluation) => evaluation.scenario === scenario && evaluation.slot === slot,
            );
            assertCopiedArtifacts(entry, target);
            const { metadata, sealed, host } = entry;
            atomicJson(`${target}.metadata.json`, {
              schemaVersion: 1,
              roundId: manifest.roundId,
              scenario,
              slot,
              attempt: metadata.attempt,
              sourceRevision: manifest.sourceRevision,
              projectRoot: metadata.projectRoot,
              profile: manifest.profile,
              promptDigest: metadata.promptDigest,
              fixtureDigest: metadata.fixtureDigest,
              buildDigest: sealed.buildDigest,
              hostAttestation: host,
            });
          }
          const findings = ensureCanonicalGeneration(candidate, suite.scenarios, currentIdentities);
          const candidateGeneration = {
            schemaVersion: 1,
            generation,
            contentDigest: generationContentDigest(candidate),
          };
          atomicJson(resolve(candidate, '.generation.json'), candidateGeneration, {
            exclusive: true,
          });
          const previousGeneration = generationInfo(canonicalResults);
          const journal = {
            schemaVersion: 1,
            generation,
            candidate,
            backup,
            candidateGeneration,
            previousGeneration,
            phase: 'candidate-ready',
          };
          writeJournal(publicationJournal, journal);
          validateAllSealed(manifest, roundRoot);
          const finalBuild = mkdtempSync(resolve(tmpdir(), 'effective-flow-eval-final-publish-'));
          try {
            const finalSkillRoot = buildPortableSkill(finalBuild);
            for (const scenario of suite.scenarios) {
              const current = pristineScenarioBuildIdentity(scenario, finalSkillRoot);
              if (JSON.stringify(current) !== JSON.stringify(currentIdentities[scenario])) {
                throw new Error(
                  `source or eval instrument drifted during publication: ${scenario}`,
                );
              }
            }
          } finally {
            rmSync(finalBuild, { recursive: true, force: true });
          }
          pauseAtBoundary('after-final-build');
          validateAllSealed(manifest, roundRoot);
          if (!sameGeneration(generationInfo(candidate), candidateGeneration)) {
            throw new Error('publication candidate changed before installation');
          }
          if (existsSync(canonicalResults)) renameSync(canonicalResults, backup);
          journal.phase = 'old-renamed';
          writeJournal(publicationJournal, journal);
          renameSync(candidate, canonicalResults);
          journal.phase = 'new-installed';
          writeJournal(publicationJournal, journal);
          rmSync(backup, { recursive: true, force: true });
          rmSync(publicationJournal, { force: true });
          return { generation, findings };
        } catch (error) {
          if (existsSync(publicationJournal)) {
            try {
              rollbackHandledPublication({
                journalPath: publicationJournal,
                results: canonicalResults,
                publicationRoot,
              });
            } catch (rollbackError) {
              throw new AggregateError(
                [error, rollbackError],
                `publication failed and rollback could not restore the previous generation: ${error.message}`,
              );
            }
          } else {
            rmSync(candidate, { recursive: true, force: true });
            rmSync(backup, { recursive: true, force: true });
          }
          throw error;
        }
      },
      { kind: 'publication' },
    );
  } finally {
    rmSync(currentBuild, { recursive: true, force: true });
  }
}
