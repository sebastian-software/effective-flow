import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createIssueIntake,
  forgeLogin,
  resolveAuthor,
  trustedAuthor,
} from '../src/scripts/issue-intake-core.mjs';

class IntakeTestError extends Error {
  constructor(trackerCode, trackerStatus) {
    super(`tracker failed: ${trackerCode}`);
    this.trackerCode = trackerCode;
    this.trackerStatus = trackerStatus;
  }
}

const hashed = (value, key) => ({ ...value, [key]: 'hash' });

function intake() {
  return createIssueIntake({
    ErrorClass: IntakeTestError,
    writeActions: ['issue-comment', 'issue-label-add'],
    capabilitiesFromProbe: (probe) => ({ fromProbe: probe.executable }),
    capabilitiesFromAttestation: () => ({ extra: true }),
    withHash: hashed,
  });
}

// A session whose `call` answers per operation from `answers`; a function answer is invoked with
// the input, an Error answer is thrown. Every call is recorded.
function session(answers) {
  const calls = [];
  return {
    calls,
    repository: { host: 'github.com', owner: 'o', repository: 'r', provider: 'github' },
    probe: { executable: 'gh' },
    call: async (operation, input = {}) => {
      calls.push({ operation, input });
      const answer = answers[operation];
      const value = typeof answer === 'function' ? answer(input) : answer;
      if (value instanceof Error) throw value;
      return { result: value };
    },
  };
}

const FORGE_TARGET = { kind: 'forge', visibility: 'standard' };

test('trustedAuthor trusts a stated write permission or the runner login only', () => {
  assert.equal(trustedAuthor({ login: 'someone', write: true }, 'runner'), true);
  assert.equal(trustedAuthor({ login: 'Runner', write: null }, 'runner'), true);
  assert.equal(trustedAuthor({ login: 'someone', write: false }, 'runner'), false);
  assert.equal(trustedAuthor({ login: 'runner', write: null }, null), false);
  assert.equal(trustedAuthor(undefined, 'runner'), false);
});

test('forgeLogin lowercases a valid login and rejects anything else', () => {
  assert.equal(forgeLogin('Octo-Cat'), 'octo-cat');
  assert.equal(forgeLogin('a'), 'a');
  assert.equal(forgeLogin('-leading'), null);
  assert.equal(forgeLogin('has space'), null);
  assert.equal(forgeLogin('x'.repeat(41)), null);
  assert.equal(forgeLogin(42), null);
});

test('resolveAuthor fills only an unknown write flag', async () => {
  const author = await resolveAuthor({ login: 'a' }, async () => true);
  assert.equal(author.write, true);
  const stated = await resolveAuthor({ login: 'a', write: false }, async () => true);
  assert.equal(stated.write, false);
});

test('permissionCache maps permissions, tracker failures and caches per login', async () => {
  const forge = session({
    'collaborator-permission-read': ({ login }) => {
      if (login === 'writer') return { permission: 'write' };
      if (login === 'reader') return { permission: 'read' };
      if (login === 'gone') return new IntakeTestError('TARGET_NOT_FOUND');
      if (login === 'hidden') return new IntakeTestError('FORBIDDEN', 403);
      return new Error('foreign');
    },
  });
  const permissionOf = intake().permissionCache(forge);
  assert.equal(await permissionOf('Writer'), true);
  assert.equal(await permissionOf('writer'), true);
  assert.equal(await permissionOf('reader'), false);
  assert.equal(await permissionOf('gone'), false);
  assert.equal(await permissionOf('hidden'), null);
  assert.deepEqual([...permissionOf.unreadable], ['hidden']);
  assert.equal(await permissionOf('not a login'), null);
  await assert.rejects(permissionOf('other'), { message: 'foreign' });
  const reads = forge.calls.filter((call) => call.input.login === 'writer');
  assert.equal(reads.length, 1, 'one permission read per login');
});

test('proveRunnerPermission returns plans-only for insufficient permission', async () => {
  const forge = session({
    'viewer-read': { login: 'Runner' },
    'collaborator-permission-read': { permission: 'read' },
  });
  const proof = await intake().proveRunnerPermission({
    target: FORGE_TARGET,
    plansOnlyReason: null,
    openSession: async () => forge,
  });
  assert.equal(proof.mode, 'plans-only');
  assert.equal(proof.reason, 'permission-insufficient');
  assert.equal(proof.login, 'runner');
  assert.equal(proof.permission, 'read');
  assert.equal(proof.capabilities, null);
  assert.equal(proof.proofHash, 'hash');
});

test('proveRunnerPermission returns plans-only when the viewer is unreadable', async () => {
  const forge = session({ 'viewer-read': new IntakeTestError('FORBIDDEN', 403) });
  const proof = await intake().proveRunnerPermission({
    target: FORGE_TARGET,
    plansOnlyReason: null,
    openSession: async () => forge,
  });
  assert.equal(proof.reason, 'viewer-unreadable');
  assert.equal(proof.login, null);
  assert.equal(proof.provider, 'github');
  assert.equal(proof.repository.slug, 'o/r');
});

test('proveRunnerPermission proves a write-capable runner with injected capabilities', async () => {
  const forge = session({
    'viewer-read': { login: 'Runner' },
    'collaborator-permission-read': { permission: 'admin' },
  });
  const proof = await intake().proveRunnerPermission({
    target: FORGE_TARGET,
    plansOnlyReason: null,
    openSession: async () => forge,
  });
  assert.deepEqual(proof, {
    target: FORGE_TARGET,
    login: 'runner',
    permission: 'admin',
    provider: 'github',
    repository: {
      host: 'github.com',
      owner: 'o',
      repository: 'r',
      slug: 'o/r',
      provider: 'github',
    },
    mode: 'tracker',
    proven: true,
    reason: null,
    capabilities: { fromProbe: 'gh' },
    proofHash: 'hash',
  });
});

test('proveRunnerPermission honours a forced reason and the external attestation', async () => {
  const subject = intake();
  const openSession = async () => assert.fail('no session for a forced or external target');
  const unset = await subject.proveRunnerPermission({
    target: { kind: 'unset', visibility: 'standard' },
    plansOnlyReason: 'unset-mode',
    openSession,
  });
  assert.equal(unset.reason, 'unset-mode');
  assert.equal(unset.hint, 'setup');
  const external = { kind: 'external', visibility: 'standard', externalTool: 'linear' };
  const proof = await subject.proveRunnerPermission({
    target: external,
    plansOnlyReason: null,
    external: {
      connection: ' linear ',
      readProven: true,
      writeProven: true,
      login: ' Bot ',
      actions: { 'issue-comment': true },
    },
    openSession,
  });
  assert.equal(proof.mode, 'tracker');
  assert.equal(proof.login, 'bot');
  assert.equal(proof.connection, 'linear');
  assert.deepEqual(proof.capabilities, {
    'issue-comment': true,
    'issue-label-add': false,
    extra: true,
  });
});

test('proveRunnerPermission propagates a foreign viewer-read error unchanged', async () => {
  const foreign = new Error('viewer foreign');
  const forge = session({ 'viewer-read': foreign });
  await assert.rejects(
    intake().proveRunnerPermission({
      target: FORGE_TARGET,
      plansOnlyReason: null,
      openSession: async () => forge,
    }),
    (error) => error === foreign,
  );
});

test('proveRunnerPermission propagates a foreign permission-read error unchanged', async () => {
  const foreign = new Error('permission foreign');
  const forge = session({
    'viewer-read': { login: 'Runner' },
    'collaborator-permission-read': foreign,
  });
  await assert.rejects(
    intake().proveRunnerPermission({
      target: FORGE_TARGET,
      plansOnlyReason: null,
      openSession: async () => forge,
    }),
    (error) => error === foreign,
  );
});

test('proveRunnerPermission returns plans-only when the permission is unreadable', async () => {
  const forge = session({
    'viewer-read': { login: 'Runner' },
    'collaborator-permission-read': new IntakeTestError('FORBIDDEN', 403),
  });
  const proof = await intake().proveRunnerPermission({
    target: FORGE_TARGET,
    plansOnlyReason: null,
    openSession: async () => forge,
  });
  assert.equal(proof.mode, 'plans-only');
  assert.equal(proof.reason, 'permission-unreadable');
  assert.equal(proof.login, 'runner');
  assert.equal(proof.permission, null);
  assert.equal(proof.capabilities, null);
});

test('proveRunnerPermission returns plans-only for an unknown or unproven external capability', async () => {
  const subject = intake();
  const openSession = async () => assert.fail('no session for an external target');
  const target = { kind: 'external', visibility: 'standard', externalTool: 'linear' };
  const unknown = await subject.proveRunnerPermission({
    target,
    plansOnlyReason: null,
    openSession,
  });
  assert.equal(unknown.mode, 'plans-only');
  assert.equal(unknown.reason, 'external-capability-unknown');
  assert.equal(unknown.provider, null);
  const unproven = await subject.proveRunnerPermission({
    target,
    plansOnlyReason: null,
    external: { connection: 'linear', readProven: true, writeProven: false },
    openSession,
  });
  assert.equal(unproven.mode, 'plans-only');
  assert.equal(unproven.reason, 'external-capability-unproven');
  assert.equal(unproven.provider, 'external');
  assert.equal(unproven.capabilities, null);
});
