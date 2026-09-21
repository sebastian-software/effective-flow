import { resolve, sep } from 'node:path';

export const SCENARIO_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

function contained(root, candidate, label) {
  const normalizedRoot = resolve(root);
  const normalized = resolve(candidate);
  if (normalized !== normalizedRoot && !normalized.startsWith(`${normalizedRoot}${sep}`)) {
    throw new Error(`${label} escapes ${normalizedRoot}: ${candidate}`);
  }
  return normalized;
}

export function validateScenarioName(scenario) {
  if (!SCENARIO_NAME_RE.test(scenario ?? '')) {
    throw new Error(`invalid scenario name ${JSON.stringify(scenario)}`);
  }
  return scenario;
}

export function validatePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

export function sandboxPaths(roundRoot, scenario, slot, attempt = 1) {
  const root = resolve(roundRoot);
  validateScenarioName(scenario);
  validatePositiveInteger(slot, 'slot');
  validatePositiveInteger(attempt, 'attempt');
  const slotRoot = contained(root, resolve(root, 'slots', scenario, `slot-${slot}`), 'slot root');
  const attemptRoot = contained(slotRoot, resolve(slotRoot, `attempt-${attempt}`), 'attempt root');
  const traceDir = resolve(attemptRoot, 'trace');
  return {
    roundRoot: root,
    slotRoot,
    state: resolve(slotRoot, 'state.json'),
    slotLock: resolve(slotRoot, '.mutation.lock'),
    quarantineRoot: resolve(slotRoot, 'quarantine'),
    attemptRoot,
    skillRoot: resolve(attemptRoot, 'skill'),
    projectRoot: resolve(attemptRoot, 'project'),
    fixture: resolve(attemptRoot, 'fixture.json'),
    traceDir,
    callLog: resolve(traceDir, 'tracker-calls.jsonl'),
    callLogLock: resolve(traceDir, 'tracker-calls.jsonl.lock'),
    buildIdentity: resolve(traceDir, 'build-identity.json'),
    prompt: resolve(attemptRoot, 'prompt.txt'),
    runMetadata: resolve(attemptRoot, 'run-metadata.json'),
    hostReceipt: resolve(attemptRoot, 'host-receipt.json'),
    sealReceipt: resolve(attemptRoot, 'seal.json'),
  };
}

// The second evidence file a suite may pair with the call log, named by that suite rather than by
// this module: only the suite knows whether it has one and what the helper that writes it calls it.
// `merge-gate` has one — the `iterate` echo's trace — and a suite without an overlay of that kind
// has none, which is what `null` says.
export function auxiliaryLogPath(suite, paths) {
  const auxiliary = suite.auxiliaryEvidence;
  if (!auxiliary) return null;
  return resolve(paths.traceDir, auxiliary.fileName);
}
