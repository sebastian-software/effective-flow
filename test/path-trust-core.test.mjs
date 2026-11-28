import assert from 'node:assert/strict';
import test from 'node:test';

import * as harness from '../src/scripts/effective-flow-state-harness-core.mjs';
import {
  foreignWriter,
  isPrivateGroupIn,
  resolutionChain,
  systemAccounts,
  untrustedNode,
} from '../src/scripts/path-trust-core.mjs';

const directory = (mode, uid = 1000, gid = 1000) => ({ mode, uid, gid, isDirectory: () => true });
const file = (mode, uid = 1000, gid = 1000) => ({ mode, uid, gid, isDirectory: () => false });
const accounts = (privateGroups) => ({
  isPrivateGroup: async (gid, uid) => privateGroups.some(([g, u]) => g === gid && u === uid),
});

// Invariant: the move into the leaf module changed no behaviour; the harness core still exposes
// the same functions its tests and the allow-rule writer use.
test('the harness core re-exports the moved trust helpers unchanged', () => {
  assert.equal(harness.resolutionChain, resolutionChain);
  assert.equal(harness.isPrivateGroupIn, isPrivateGroupIn);
  assert.equal(harness.systemAccounts, systemAccounts);
});

// Invariant: only the owner and root may write a trusted node; world-writable passes only as a
// root-owned sticky directory, group-writable only for the owner's private group.
test('foreignWriter accepts the sticky root directory and the private group only', async () => {
  const none = accounts([]);
  const own = accounts([[1000, 1000]]);
  assert.equal(await foreignWriter(directory(0o40755), none), null);
  assert.equal(await foreignWriter(directory(0o40777), none), 'world-writable');
  assert.equal(await foreignWriter(directory(0o41777, 0, 0), none), null, 'sticky /tmp');
  assert.equal(await foreignWriter(directory(0o41777), none), 'world-writable', 'not root-owned');
  assert.equal(
    await foreignWriter(file(0o101777, 0, 0), none),
    'world-writable',
    'not a directory',
  );
  assert.equal(await foreignWriter(directory(0o40775), none), 'group-writable');
  assert.equal(await foreignWriter(directory(0o40775), own), null, 'umask 002, private group');
});

// Invariant: a node owned by another user is writable by that user, so it is refused; root-owned
// nodes and a platform without a uid fall through to `foreignWriter`.
test('untrustedNode adds the owner check to foreignWriter', async () => {
  const none = accounts([]);
  assert.equal(await untrustedNode(directory(0o40755, 1001), none, 1000), 'foreign-owner');
  assert.equal(await untrustedNode(directory(0o40755, 0, 0), none, 1000), null);
  assert.equal(await untrustedNode(directory(0o40755), none, 1000), null);
  assert.equal(await untrustedNode(directory(0o40755, 1001), none, null), null);
  assert.equal(await untrustedNode(directory(0o40777), none, 1000), 'world-writable');
});
