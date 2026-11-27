// Invariant: no worker that can run Git may rewrite or move back the history of a delivery branch.
// A rewrite (rebase, amend, squash, reset, branch move, force-push) can drop the worktree record's
// `creationOid` from the branch, which makes `worktree remove` refuse at handback and erases the
// pull request's history. Every write-capable worker therefore carries the ban in its own built
// contract through an eager `worker-git-history` include; orchestrator-side fragments do not reach
// a leaf worker.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  collectIncludeNames,
  extractFrontmatter,
  getNested,
  getNestedArray,
} from '../build-lib.mjs';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_DIR = join(ROOT_DIR, 'src');
const AGENTS_DIR = join(SOURCE_DIR, 'agents');
const FRAGMENT_NAME = 'worker-git-history';

// The one worker that is allowed to omit the include. Its own, stricter ban (no commit, no push, no
// reset of the checkout, no history rewrite in any other way) is pinned by the test "the conflict
// resolver aborts on uncertainty and writes nothing the gate owns" in
// test/workflow-contracts.test.mjs, which owns those clauses; this file deliberately keeps no
// second copy of them. Moving the resolver onto the fragment would be a separate, deliberate change.
const EXCEPTION_AGENTS = Object.freeze(['merge-conflict-resolver']);

// Exact size of the write-capable roster: ten Bash workers, code-documenter (Codex workspace-write)
// and the excepted resolver. Update it deliberately when a write-capable agent is added or removed.
const WRITE_CAPABLE_COUNT = 12;

function readAgents() {
  const files = readdirSync(AGENTS_DIR).filter((name) => name.endsWith('.md'));
  assert.ok(files.length > 0, 'expected at least one agent source under src/agents/');

  return files.map((file) => {
    const name = file.replace(/\.md$/, '');
    const body = readFileSync(join(AGENTS_DIR, file), 'utf8');
    const frontmatter = extractFrontmatter(body);
    assert.notEqual(frontmatter, '', `src/agents/${file} must have a YAML frontmatter block`);
    const context = `src/agents/${file}`;
    const rawTools = getNestedArray(frontmatter, 'claude', 'tools', { context });
    assert.notEqual(rawTools, '', `${context} must declare a claude.tools array`);
    // `Bash(git:*)` still counts as `Bash`.
    const tools = rawTools.split(',').map((tool) => tool.replace(/\(.*$/, ''));
    // Scalar, so getNested, not getNestedArray. Fail closed on a missing value.
    const sandboxMode = getNested(frontmatter, 'codex', 'sandbox_mode', { context });
    assert.notEqual(sandboxMode, '', `${context} must declare codex.sandbox_mode`);
    const writeCapable = tools.includes('Bash') || sandboxMode !== 'read-only';
    const { eager } = collectIncludeNames(body);
    return { name, writeCapable, eager };
  });
}

const agents = readAgents();
const writeCapable = agents.filter((agent) => agent.writeCapable);

test('the write-capable worker roster has the exact expected size', () => {
  assert.equal(
    writeCapable.length,
    WRITE_CAPABLE_COUNT,
    `write-capable agents (claude.tools has Bash, or codex.sandbox_mode is not read-only) are ` +
      `${writeCapable.map((agent) => agent.name).join(', ')}; if this change is intended, update ` +
      `WRITE_CAPABLE_COUNT in this test deliberately`,
  );
});

test('every write-capable worker eagerly includes worker-git-history or is the frozen exception', () => {
  const missing = writeCapable
    .filter((agent) => !EXCEPTION_AGENTS.includes(agent.name))
    .filter((agent) => !agent.eager.has(FRAGMENT_NAME))
    .map((agent) => agent.name);
  assert.deepEqual(
    missing,
    [],
    `write-capable workers without an eager \`${FRAGMENT_NAME}\` include (a lazy include does not count)`,
  );
});

test('the exception set is exactly the merge-conflict-resolver and names a write-capable agent', () => {
  assert.deepEqual([...EXCEPTION_AGENTS], ['merge-conflict-resolver']);
  for (const name of EXCEPTION_AGENTS) {
    assert.ok(
      writeCapable.some((agent) => agent.name === name),
      `exception ${name} must be an existing write-capable agent`,
    );
  }
});

test('the worker-git-history fragment bans each history rewrite and keeps its scope clauses', () => {
  const fragment = readFileSync(join(SOURCE_DIR, 'shared', `${FRAGMENT_NAME}.md`), 'utf8');
  const clauses = [
    ['rebase of any kind', /no `rebase` of any kind/],
    ['pull --rebase', /`pull --rebase`/],
    ['pull under pull.rebase', /`pull` under `pull\.rebase`/],
    ['commit --amend', /no `commit --amend`/],
    ['squash', /no squash/],
    ['reset --hard in every form', /no `reset --hard` at all/],
    [
      'reset of any other mode to an earlier commit',
      /no `reset` of any other mode to an earlier commit/,
    ],
    ['branch -f', /`branch -f`/],
    ['checkout -B', /`checkout -B`/],
    ['update-ref', /`update-ref`/],
    ['force-push', /no force-push in any form/],
    ['--force-with-lease', /`--force-with-lease` included/],
    [
      'rejected push is reported to the orchestrator',
      /Report a rejected push, or a branch that is behind or conflicts with its base, to the orchestrator instead of updating it\./,
    ],
    [
      'fixture repositories are out of scope',
      /Git commands inside a temporary or fixture repository you create yourself are not covered\./,
    ],
  ];
  for (const [label, pattern] of clauses) {
    assert.match(fragment, pattern, `fragment must keep the clause: ${label}`);
  }
});
