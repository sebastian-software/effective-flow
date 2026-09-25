// Resolves a tool name to that tool's suite configuration, and checks that what came back is a
// suite the shared scaffold can actually run.
//
// It is the one place the CLI turns the `<tool>` argument of `pnpm eval <tool> <command>` into a
// suite, and it refuses anything that is not a plain directory name under `evals/`: the argument
// reaches this from a shell, and a suite name that could contain a path separator would let it load
// a module from anywhere.
//
// **The contract is validated here rather than discovered at first use.** Most of these fields fail
// loudly the moment something reads them, but not all of them do, and the ones that do not are the
// dangerous ones: a missing `auxiliaryEvidence` reads exactly like a suite that deliberately records
// no second evidence file, so a suite that ships an exit-channel helper and forgets the block
// publishes runs whose only positive observable was never examined. Absence and an intentional
// choice have to be different things, so a suite with no auxiliary evidence says
// `auxiliaryEvidence: null` and a suite that says nothing is rejected.

import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isValidProfilePin } from './profile.mjs';

const EVALS_ROOT = resolve(import.meta.dirname, '..');
const SUITE_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

// Every field the shared scaffold reads, with the check that it is the right kind of thing. `null`
// is spelled out only where it is a legitimate value.
const REQUIRED_FIELDS = {
  name: (value) => typeof value === 'string' && value !== '',
  root: (value) => typeof value === 'string' && value !== '',
  sandboxBase: (value) => typeof value === 'string' && value !== '',
  runtimeStateDir: (value) => typeof value === 'string' && value !== '',
  scenarios: (value) => Array.isArray(value) && value.length > 0,
  scenarioRegistry: (value) => typeof value === 'string' && value !== '',
  loadSetSeeds: (value) => Array.isArray(value) && value.length > 0,
  instrumentFiles: (value) => Array.isArray(value) && value.length > 0,
  alwaysAllowedOperations: (value) => Array.isArray(value),
  trackerStub: (value) => typeof value?.source === 'string' && value.source !== '',
  legacyInstrumentWaiver: (value) =>
    value === null ||
    (typeof value?.predecessorInstrumentDigest === 'string' &&
      typeof value?.trackerStubPath === 'string' &&
      Array.isArray(value?.excludedScenarios)),
  overlay: (value) =>
    typeof value?.applies === 'function' &&
    typeof value?.apply === 'function' &&
    typeof value?.extraSeeds === 'function',
  auxiliaryEvidence: (value) =>
    value === null ||
    (typeof value?.fileName === 'string' &&
      typeof value?.archiveSuffix === 'string' &&
      typeof value?.sealDigestKey === 'string' &&
      typeof value?.required === 'function' &&
      typeof value?.missingMessage === 'string' &&
      typeof value?.orphanMessage === 'string'),
  scenarioSetup: (value) => typeof value === 'function',
  projectDocuments: (value) => typeof value === 'function',
  evaluator: (value) =>
    Array.isArray(value?.BRANCHED_SCENARIOS) &&
    ['usesLifecycleSchema', 'validityProblems', 'parseAuxiliary', 'findings'].every(
      (name) => typeof value?.[name] === 'function',
    ),
  retryDiscardLimit: (value) => typeof value === 'function',
  // The execution profile `prepare` and `publish` hold every round to. Required for the same reason
  // as `auxiliaryEvidence`: a suite that forgot its pin would otherwise read exactly like one that
  // deliberately pins nothing, so "no pin" is spelled `expectedProfile: null`.
  expectedProfile: isValidProfilePin,
};

// Path comparison that survives a checkout reached through a symlink: the suite declares its
// instrument entries from `import.meta.dirname`, which is already resolved, but a suite could
// legitimately declare one any other way. A path that does not exist yet compares as itself, so a
// mis-declared entry fails on its own terms rather than here.
function realPath(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export function suiteConfigPath(name) {
  if (!SUITE_NAME_RE.test(name ?? '')) {
    throw new Error(`invalid suite name ${JSON.stringify(name)}`);
  }
  return resolve(EVALS_ROOT, name, 'suite.config.mjs');
}

// The shape check, exported so a suite can be validated without going through the CLI's name
// resolution — `loadSuite` is the only caller that has a name to check first.
export function validateSuite(suite, label) {
  if (!suite || typeof suite !== 'object') {
    throw new Error(`${label} does not export a suite configuration`);
  }
  const problems = Object.entries(REQUIRED_FIELDS)
    .filter(([field, accepts]) => !(field in suite) || !accepts(suite[field]))
    .map(([field]) => field);
  if (problems.length > 0) {
    throw new Error(
      `${label} is not a usable suite configuration: ${problems.join(', ')} missing or malformed`,
    );
  }
  // The stub that answers a run must be the stub the instrument hashes. Declared twice, the two
  // could name different files, and the one hashed would then not be the one that ran.
  if (!suite.instrumentFiles.includes(suite.trackerStub.source)) {
    throw new Error(
      `${label} hashes no instrument entry for its tracker stub at ${suite.trackerStub.source}`,
    );
  }
  // The two halves of the registry split, which every suite follows and neither half of which is
  // safe alone.
  //
  // A suite configuration selects what a slot sees — the setup rows, the project documents, the
  // tracker stub, the overlay — so a rebinding there changes the run while every file the digest
  // covers stays byte-identical. It has to be hashed. A scenario registry is a list of names no run
  // reads, so hashing it would stale every archived round of every other scenario for a change none
  // of them could observe. It must not be hashed. Splitting the two into separate modules is what
  // lets both hold; checking only one half lets the other be defeated by moving a binding into the
  // unhashed module or the names back into the hashed one.
  const hashed = new Set(suite.instrumentFiles.map(realPath));
  const configPath = resolve(suite.root, 'suite.config.mjs');
  if (!hashed.has(realPath(configPath))) {
    throw new Error(
      `${label} is not one of its own instrumentFiles: it binds the setup, the project documents, the tracker stub and the overlay, so leaving it unhashed lets any of them be re-pointed while every archived stamp still reports current`,
    );
  }
  if (hashed.has(realPath(suite.scenarioRegistry))) {
    throw new Error(
      `${label} hashes its scenario registry at ${suite.scenarioRegistry}: a registry is a list of names no run reads, and hashing it stales every archived round of every other scenario for each name added`,
    );
  }
  // `projectDocuments` is the one contract function whose return shape nothing downstream checks:
  // `scaffold.mjs` writes what it gets, so a wrong shape lands as `undefined` in the sandbox
  // checkout's `AGENTS.md` and is only visible as a gate run that read no configuration.
  const documents = suite.projectDocuments({ scenario: suite.scenarios[0], rows: [] });
  if (typeof documents?.agents !== 'string' || typeof documents?.setupAdr !== 'string') {
    throw new Error(`${label}: projectDocuments must return { agents, setupAdr } as strings`);
  }
  return suite;
}

export async function loadSuite(name) {
  const path = suiteConfigPath(name);
  if (!existsSync(path)) {
    throw new Error(`no eval suite ${name}: expected a configuration at ${path}`);
  }
  const module = await import(pathToFileURL(path).href);
  const suite = module.default;
  if (!suite || suite.name !== name) {
    throw new Error(`${path} does not export a suite configuration named ${name}`);
  }
  return validateSuite(suite, path);
}
