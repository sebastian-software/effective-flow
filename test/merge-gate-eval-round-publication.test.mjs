import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { canonicalDigest, digestOf } from '../evals/_scaffold/build-identity.mjs';
import {
  createRound,
  publishRound,
  sealAttempt,
  verifyFreshness,
} from '../evals/_scaffold/round-core.mjs';
import { sandboxPaths } from '../evals/_scaffold/sandbox.mjs';
import { REQUIRED_RUNS } from '../evals/_scaffold/suite.mjs';
import suite from '../evals/merge-gate/suite.config.mjs';
import {
  copyRestampedResults,
  hostReceipt,
  legacyLog,
  PROFILE,
} from './support/merge-gate-round-fixtures.mjs';
import { treeDigests } from './support/merge-gate-round-helpers.mjs';

// Stale history may be retained without claiming that it is current. Selected evidence still has
// to match its sealed round, and release verification must continue to reject the stale corpus.
test(
  'selective publication preserves valid stale history while selected seals and release freshness stay strict',
  { timeout: 120_000 },
  () => {
    const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-selective-stale-'));
    const base = resolve(temporary, 'rounds');
    const publicationRoot = resolve(temporary, 'publication');
    const resultsDir = resolve(publicationRoot, 'results');
    let prepared;
    try {
      prepared = createRound(suite, {
        scenarios: ['guard-blocks-merge'],
        profile: PROFILE,
        base,
        roundId: 'selective-stale-history',
      });
      for (let slot = 1; slot <= REQUIRED_RUNS; slot += 1) {
        const paths = sandboxPaths(prepared.roundRoot, 'guard-blocks-merge', slot, 1);
        writeFileSync(paths.callLog, legacyLog(paths.projectRoot));
        sealAttempt(suite, {
          handle: prepared.manifestPath,
          scenario: 'guard-blocks-merge',
          slot,
          hostReceipt: hostReceipt(paths.projectRoot),
          base,
        });
      }
      mkdirSync(publicationRoot, { recursive: true });
      copyRestampedResults(resultsDir);
      const historical = resolve(resultsDir, 'merge-proceeds', 'run-1');
      const stamp = JSON.parse(readFileSync(`${historical}.build.json`, 'utf8'));
      stamp.skill.files['tools/merge-gate.md'] = digestOf('unit-only earlier recorded tool');
      stamp.skill.digest = canonicalDigest(stamp.skill.files);
      stamp.skill.versionNeutralDigest = digestOf('unit-only earlier version-neutral tool');
      stamp.digest = digestOf(
        [stamp.skill.digest, stamp.instrument.digest, stamp.scenario_inputs.digest].join('\n'),
      );
      const metadata = JSON.parse(readFileSync(`${historical}.metadata.json`, 'utf8'));
      metadata.buildDigest = stamp.digest;
      writeFileSync(`${historical}.build.json`, `${JSON.stringify(stamp, null, 2)}\n`);
      writeFileSync(`${historical}.metadata.json`, `${JSON.stringify(metadata, null, 2)}\n`);
      const before = treeDigests(resolve(resultsDir, 'merge-proceeds'));
      const published = publishRound(suite, {
        handle: prepared.manifestPath,
        base,
        resultsDir,
        publicationRoot,
      });
      assert.ok(published.generation);
      assert.deepEqual(
        treeDigests(resolve(resultsDir, 'merge-proceeds')),
        before,
        'historical logs, stamps, metadata and prompts must retain their exact provenance',
      );
      const manifest = JSON.parse(readFileSync(prepared.manifestPath, 'utf8'));
      assert.deepEqual(
        JSON.parse(
          readFileSync(resolve(resultsDir, 'guard-blocks-merge/run-1.build.json'), 'utf8'),
        ),
        manifest.identities['guard-blocks-merge'],
      );
      const freshness = verifyFreshness(suite, { resultsDir });
      assert.equal(
        freshness.scenarios.find(({ scenario }) => scenario === 'merge-proceeds').state,
        'stale',
      );
      assert.equal(
        freshness.scenarios.find(({ scenario }) => scenario === 'guard-blocks-merge').state,
        'current',
      );
      assert.equal(
        freshness.failsStrict,
        true,
        'preservation cannot make historical evidence release-current',
      );

      const selected = sandboxPaths(prepared.roundRoot, 'guard-blocks-merge', 1, 1);
      const selectedStamp = JSON.parse(readFileSync(selected.buildIdentity, 'utf8'));
      selectedStamp.skill.files['tools/merge-gate.md'] = digestOf('unit-only stale selected tool');
      selectedStamp.skill.digest = canonicalDigest(selectedStamp.skill.files);
      selectedStamp.digest = digestOf(
        [
          selectedStamp.skill.digest,
          selectedStamp.instrument.digest,
          selectedStamp.scenario_inputs.digest,
        ].join('\n'),
      );
      writeFileSync(selected.buildIdentity, `${JSON.stringify(selectedStamp, null, 2)}\n`);
      const canonicalBefore = treeDigests(resultsDir);
      assert.throws(
        () =>
          publishRound(suite, {
            handle: prepared.manifestPath,
            base,
            resultsDir,
            publicationRoot,
          }),
        /guard-blocks-merge\/1 changed after sealing/,
      );
      assert.deepEqual(treeDigests(resultsDir), canonicalBefore);
    } finally {
      if (prepared && existsSync(prepared.manifestPath)) chmodSync(prepared.manifestPath, 0o644);
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);

// Even metadata bound to the edited top-level digest cannot legitimize internally inconsistent
// archived file-map digests. This is provenance corruption, rather than ordinary source drift.
test(
  'publishRound refuses inconsistent carried-forward build provenance',
  { timeout: 120_000 },
  () => {
    const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-round-drift-'));
    const base = resolve(temporary, 'rounds');
    const publicationRoot = resolve(temporary, 'publication');
    const resultsDir = resolve(publicationRoot, 'results');
    try {
      const prepared = createRound(suite, {
        scenarios: ['guard-blocks-merge'],
        profile: PROFILE,
        base,
        roundId: 'drifted-carry-forward',
      });
      for (let slot = 1; slot <= REQUIRED_RUNS; slot += 1) {
        const paths = sandboxPaths(prepared.roundRoot, 'guard-blocks-merge', slot, 1);
        writeFileSync(paths.callLog, legacyLog(paths.projectRoot));
        sealAttempt(suite, {
          handle: prepared.manifestPath,
          scenario: 'guard-blocks-merge',
          slot,
          hostReceipt: hostReceipt(paths.projectRoot),
          base,
        });
      }

      mkdirSync(publicationRoot, { recursive: true });
      copyRestampedResults(resultsDir);
      const drifted = resolve(resultsDir, 'merge-proceeds', 'run-1');
      const stamp = JSON.parse(readFileSync(`${drifted}.build.json`, 'utf8'));
      // Keep metadata bound to the edited top-level digest while corrupting the internal file-map
      // digest; the archived-provenance guard must reject this independently of freshness.
      stamp.skill.files['tools/merge-gate.md'] = `sha256:${'a'.repeat(64)}`;
      stamp.skill.digest = `sha256:${'b'.repeat(64)}`;
      stamp.skill.versionNeutralDigest = `sha256:${'c'.repeat(64)}`;
      stamp.digest = `sha256:${'d'.repeat(64)}`;
      writeFileSync(`${drifted}.build.json`, `${JSON.stringify(stamp, null, 2)}\n`);
      const metadata = JSON.parse(readFileSync(`${drifted}.metadata.json`, 'utf8'));
      metadata.buildDigest = stamp.digest;
      writeFileSync(`${drifted}.metadata.json`, `${JSON.stringify(metadata, null, 2)}\n`);

      assert.throws(
        () =>
          publishRound(suite, { handle: prepared.manifestPath, base, resultsDir, publicationRoot }),
        /merge-proceeds\/run-1 has inconsistent archived build provenance/,
      );
      // A refused publication leaves the standing corpus exactly as it found it: no generation
      // marker, and no candidate or backup tree left behind to be recovered into place later.
      assert.equal(existsSync(resolve(resultsDir, '.generation.json')), false);
      assert.deepEqual(
        readdirSync(publicationRoot).filter((name) =>
          /^\.results-(?:candidate|backup)-/.test(name),
        ),
        [],
      );
    } finally {
      const manifest = resolve(base, 'drifted-carry-forward', 'manifest.json');
      if (existsSync(manifest)) chmodSync(manifest, 0o644);
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);

// Carried-forward history preserves its recorded identity but must still satisfy the suite's
// execution-profile pin. Editing both profile copies must not bypass that independent guard.
test(
  'publishRound refuses a carried-forward run whose archived profile deviates from the pin',
  { timeout: 120_000 },
  () => {
    const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-round-pin-publish-'));
    const base = resolve(temporary, 'rounds');
    const publicationRoot = resolve(temporary, 'publication');
    const resultsDir = resolve(publicationRoot, 'results');
    try {
      const prepared = createRound(suite, {
        scenarios: ['guard-blocks-merge'],
        profile: PROFILE,
        base,
        roundId: 'deviating-carry-forward',
      });
      for (let slot = 1; slot <= REQUIRED_RUNS; slot += 1) {
        const paths = sandboxPaths(prepared.roundRoot, 'guard-blocks-merge', slot, 1);
        writeFileSync(paths.callLog, legacyLog(paths.projectRoot));
        sealAttempt(suite, {
          handle: prepared.manifestPath,
          scenario: 'guard-blocks-merge',
          slot,
          hostReceipt: hostReceipt(paths.projectRoot),
          base,
        });
      }

      mkdirSync(publicationRoot, { recursive: true });
      copyRestampedResults(resultsDir);
      const deviating = resolve(resultsDir, 'merge-proceeds', 'run-1.metadata.json');
      const metadata = JSON.parse(readFileSync(deviating, 'utf8'));
      metadata.profile = { ...metadata.profile, model: 'gpt-5.6-sol' };
      metadata.hostAttestation.profile = {
        ...metadata.hostAttestation.profile,
        model: 'gpt-5.6-sol',
      };
      writeFileSync(deviating, `${JSON.stringify(metadata, null, 2)}\n`);
      const before = treeDigests(resultsDir);

      assert.throws(
        () =>
          publishRound(suite, { handle: prepared.manifestPath, base, resultsDir, publicationRoot }),
        (error) => {
          assert.ok(
            error.message.endsWith(
              `merge-proceeds/run-1 archived profile does not match the suite's pinned execution profile: model expected ${JSON.stringify(suite.expectedProfile.model)}, got "gpt-5.6-sol"`,
            ),
            error.message,
          );
          return true;
        },
      );
      // Refused before promotion: the standing corpus is byte-identical, and no candidate, backup
      // or publication journal is left behind to be recovered into place later.
      assert.deepEqual(treeDigests(resultsDir), before);
      assert.deepEqual(
        readdirSync(publicationRoot).filter((name) => name !== 'results'),
        [],
      );

      // A host receipt that agrees with the wrong version cannot bypass the archived-profile pin.
      metadata.profile = {
        ...metadata.profile,
        model: suite.expectedProfile.model,
        reportedVersion: '0.164.0',
      };
      metadata.hostAttestation.profile = {
        ...metadata.hostAttestation.profile,
        model: suite.expectedProfile.model,
        reportedVersion: '0.164.0',
      };
      writeFileSync(deviating, `${JSON.stringify(metadata, null, 2)}\n`);
      const beforeVersion = treeDigests(resultsDir);
      assert.throws(
        () =>
          publishRound(suite, { handle: prepared.manifestPath, base, resultsDir, publicationRoot }),
        (error) => {
          assert.ok(
            error.message.endsWith(
              `merge-proceeds/run-1 archived profile does not match the suite's pinned execution profile: reportedVersion expected ${JSON.stringify(suite.expectedProfile.reportedVersion)}, got "0.164.0"`,
            ),
            error.message,
          );
          return true;
        },
      );
      assert.deepEqual(treeDigests(resultsDir), beforeVersion);
      assert.deepEqual(
        readdirSync(publicationRoot).filter((name) => name !== 'results'),
        [],
      );
    } finally {
      const manifest = resolve(base, 'deviating-carry-forward', 'manifest.json');
      if (existsSync(manifest)) chmodSync(manifest, 0o644);
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);

// Invariant: publication re-validates every archived host receipt (`validateSealedSlot`, then
// `ensureCanonicalGeneration` on the candidate) with the receipt keys the scenario's sealed
// evidence declares, so a declaring scenario's `lastMessagePath` is archived, accepted there and
// its sealed last message published beside the run, while the scenarios without the declaration
// keep the fixed key set.
test(
  'publication archives and re-validates a declaring scenario receipt that carries lastMessagePath',
  { timeout: 120_000 },
  () => {
    const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'effective-flow-last-message-pub-')));
    const base = resolve(temporary, 'rounds');
    const hostRoot = resolve(temporary, 'host');
    const publicationRoot = resolve(temporary, 'publication');
    const resultsDir = resolve(publicationRoot, 'results');
    mkdirSync(hostRoot);
    const scenario = 'guard-blocks-merge';
    // The suite's own sealed observation, extended to the published scenario: the run-state
    // scenarios in the copied corpus keep the declaration their archived runs were sealed under, so
    // the corpus beside the published scenario stays valid.
    const declaring = {
      ...suite,
      sealedEvidence: {
        ...suite.sealedEvidence,
        required: (name) => name === scenario || suite.sealedEvidence.required(name),
      },
    };
    try {
      const prepared = createRound(declaring, {
        scenarios: [scenario],
        profile: PROFILE,
        base,
        roundId: 'last-message-publication',
      });
      const lastMessages = [];
      for (let slot = 1; slot <= REQUIRED_RUNS; slot += 1) {
        const paths = sandboxPaths(prepared.roundRoot, scenario, slot, 1);
        writeFileSync(paths.callLog, legacyLog(paths.projectRoot));
        const lastMessage = resolve(hostRoot, `slot-${slot}-last-message.txt`);
        writeFileSync(lastMessage, `last message of slot ${slot}\n`);
        lastMessages.push(lastMessage);
        sealAttempt(declaring, {
          handle: prepared.manifestPath,
          scenario,
          slot,
          hostReceipt: { ...hostReceipt(paths.projectRoot), lastMessagePath: lastMessage },
          base,
        });
      }
      mkdirSync(publicationRoot, { recursive: true });
      copyRestampedResults(resultsDir);
      const published = publishRound(declaring, {
        handle: prepared.manifestPath,
        base,
        resultsDir,
        publicationRoot,
      });
      assert.ok(published.generation);
      for (let slot = 1; slot <= REQUIRED_RUNS; slot += 1) {
        const archived = resolve(resultsDir, scenario, `run-${slot}`);
        const metadata = JSON.parse(readFileSync(`${archived}.metadata.json`, 'utf8'));
        assert.equal(metadata.hostAttestation.lastMessagePath, lastMessages[slot - 1]);
        const observation = JSON.parse(
          readFileSync(`${archived}.${declaring.sealedEvidence.archiveSuffix}`, 'utf8'),
        );
        assert.equal(observation.lastMessage, `last message of slot ${slot}\n`);
      }
      const neighbour = JSON.parse(
        readFileSync(resolve(resultsDir, 'merge-proceeds', 'run-1.metadata.json'), 'utf8'),
      );
      assert.equal(Object.hasOwn(neighbour.hostAttestation, 'lastMessagePath'), false);
    } finally {
      const manifest = resolve(base, 'last-message-publication', 'manifest.json');
      if (existsSync(manifest)) chmodSync(manifest, 0o644);
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);
