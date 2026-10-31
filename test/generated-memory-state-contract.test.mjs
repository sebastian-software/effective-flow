import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));

function generatedRoot(target) {
  return target === 'portable'
    ? join(ROOT_DIR, 'dist', 'portable', 'effective-flow')
    : join(ROOT_DIR, 'dist', target, 'effective-flow');
}

function collectTextFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectTextFiles(path));
    else if (/\.(?:md|toml)$/.test(entry.name)) files.push(path);
  }
  return files;
}

let built = false;
function buildOnce() {
  if (built) return;
  const build = spawnSync(process.execPath, ['build.mjs'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);
  built = true;
}

test('actual eager and lazy consumers ship the nested memory contract in every target', () => {
  buildOnce();

  for (const target of ['claude', 'codex', 'portable']) {
    const root = generatedRoot(target);
    for (const eagerConsumer of ['investigate']) {
      const generated = readFileSync(join(root, 'tools', `${eagerConsumer}.md`), 'utf8');
      assert.match(generated, /## Memory operations/);
      assert.doesNotMatch(generated, /^```include\s*$/m);
    }

    const lazyOwner = readFileSync(join(root, 'shared', 'effective-flow-dir-migration.md'), 'utf8');
    assert.match(lazyOwner, /## Memory operations/);
    assert.doesNotMatch(lazyOwner, /^```include\s*$/m);

    // cleanup reaches the memory contract through its deferred migration owner, at the Phase 1
    // step 6 marker check and before the forge `labelMigration.sf` marker write, so the generated
    // tool must still point at the shipped owner that carries it.
    for (const lazyConsumerName of ['fix', 'cleanup']) {
      const lazyConsumer = readFileSync(join(root, 'tools', `${lazyConsumerName}.md`), 'utf8');
      assert.match(lazyConsumer, /shared\/effective-flow-dir-migration\.md/);
    }
    for (const file of collectTextFiles(root)) {
      assert.doesNotMatch(
        readFileSync(file, 'utf8'),
        /^```include\s*$/m,
        `${target} output retained an eager include in ${file}`,
      );
    }
  }
});

// The lock and memory steps call the runtime-state helper in the here-string shape an allowlist rule
// can match; a multi-line heredoc cannot be allowlisted. A heredoc opener is `<<EOF` or `<<-'EOF'`,
// never `<<<`.
const HEREDOC = /(?<!<)<<(?!<)-?\s*['"]?[A-Za-z_]\w*/;
const helperAcquire = (lock) =>
  new RegExp(
    `node <skill-root>/scripts/effective-flow-state\\.mjs lock acquire <<< '\\{[^\\n]*"lock":"${lock}"`,
  );

const helperMemory = (operation) =>
  new RegExp(
    `node <skill-root>/scripts/effective-flow-state\\.mjs memory ${operation} <<< '\\{"cwd":"<RUNTIME_STATE_ROOT>"`,
  );

// Invariant: the shipped memory contract calls the three typed memory operations in the
// here-string shape and never acquires the memory lock in prose; the two commit locks are helper
// calls in the same shape. None replays `mkdir` or uses a heredoc.
test('built lock and memory prose calls the helper in the here-string shape in every target', () => {
  buildOnce();
  for (const target of ['claude', 'codex', 'portable']) {
    const root = generatedRoot(target);
    const investigate = readFileSync(join(root, 'tools', 'investigate.md'), 'utf8');
    for (const operation of ['reserve', 'set-marker', 'migrate-directory']) {
      assert.match(investigate, helperMemory(operation), `${target} lacks memory ${operation}`);
    }
    assert.doesNotMatch(investigate, helperAcquire('memory'), `${target} acquires memory in prose`);
    assert.doesNotMatch(investigate, HEREDOC, `${target} investigate carries a heredoc`);
    assert.doesNotMatch(investigate, /mkdir [^`\n]*memory\.lock/);
    const sources = [
      ['iterate', 'iterate-commit'],
      ['apply-review-commit-mechanics', 'apply-review-commit'],
    ];
    for (const [tool, lock] of sources) {
      const generated = readFileSync(join(root, 'tools', `${tool}.md`), 'utf8');
      assert.match(generated, helperAcquire(lock), `${target} ${tool} lacks the ${lock} call`);
      assert.doesNotMatch(generated, HEREDOC, `${target} ${tool} carries a heredoc`);
      assert.doesNotMatch(
        generated,
        new RegExp(`mkdir [^\`\\n]*${lock}\\.lock`),
        `${target} ${tool} still replays the ${lock} mkdir`,
      );
    }
  }
});

// Invariant: both commit mutexes bound the worker's wait to three unchanged LOCK_HELD results and
// hand the decision to the orchestrator, which alone knows whether the sibling delegation of the
// same run is still active and re-dispatches while it is; a foreign owner is only reported; a broken
// unit's critical section is re-dispatched exactly once; and both owning workflows mint the runId
// those rules key on. A worker that waited without limit would deadlock on a returned sibling.
// Both also re-check ownership before `git commit`, bound sibling re-dispatches by delegation
// returns, re-read once after a BREAK_MISMATCH, and surface a tombstone path to the user.
test('built commit mutexes state the bounded wait, sibling, report-only and re-dispatch rules', () => {
  buildOnce();
  for (const target of ['claude', 'codex', 'portable']) {
    const root = generatedRoot(target);
    for (const tool of ['iterate', 'apply-review-commit-mechanics']) {
      const generated = readFileSync(join(root, 'tools', `${tool}.md`), 'utf8');
      assert.match(
        generated,
        /\*\*Bounded worker wait:\*\*[\s\S]{0,120}three consecutive `LOCK_HELD` results with an unchanged owner and identity[\s\S]{0,120}returns the diagnostics[\s\S]{0,60}to the\s+orchestrator/,
        `${target} ${tool}: bounded worker wait`,
      );
      assert.doesNotMatch(generated, /without limit/, `${target} ${tool}: no unbounded wait`);
      assert.match(
        generated,
        /\*\*Sibling rule:\*\* only the orchestrator knows which delegations are active[\s\S]{0,120}`runId` equals this run's `runId` and the owning delegation is still active, it re-dispatches/,
        `${target} ${tool}: sibling rule`,
      );
      assert.match(
        generated,
        /Once the orchestrator holds that delegation's result and its lock remains, the lock\s+counts as foreign/,
        `${target} ${tool}: a returned sibling makes the lock foreign`,
      );
      assert.match(
        generated,
        /\*\*Foreign owner:\*\* the orchestrator only reports the owner to the user, with no break\s+suggestion/,
        `${target} ${tool}: report-only rule`,
      );
      assert.match(
        generated,
        /\*\*After a confirmed break,\*\* the orchestrator re-dispatches that unit's commit critical section\s+once/,
        `${target} ${tool}: single re-dispatch`,
      );
      const flat = generated.replace(/\s+/g, ' ');
      for (const [clause, label] of [
        [
          '**Ownership check:** immediately before `git commit`, run `lock inspect` and require a `valid` owner whose token equals the retained token. Otherwise ownership is lost: do not commit',
          'ownership check before the commit',
        ],
        [
          "re-dispatches the waiting unit's commit critical section only after that owning delegation has returned, once per returned owner",
          'bounded sibling re-dispatch',
        ],
        [
          "A re-dispatched section keeps the unit's original `delegation` value `<runId>/<n>`",
          'stable delegation value',
        ],
        [
          '**`BREAK_MISMATCH`** (`changed-before-removal` included) removed nothing. The orchestrator re-reads the lock once with `lock inspect`',
          'single re-read after a break mismatch',
        ],
        ['No second break runs without a fresh confirmation', 'no unconfirmed second break'],
        [
          'a `WRITE_FAILED` naming a tombstone path, is reported to the user with that path',
          'tombstone path surfaced',
        ],
      ]) {
        assert.ok(flat.includes(clause), `${target} ${tool}: ${label}`);
      }
    }
    // Invariant: lost ownership at release fails an apply-review finding closed, as in iterate.
    assert.match(
      readFileSync(join(root, 'tools', 'apply-review-commit-mechanics.md'), 'utf8'),
      /`NOT_HELD` or `NOT_OWNER` is reported as lost ownership, changes\s+nothing, and fails the finding closed/,
      `${target}: apply-review release fails closed`,
    );
    const iterate = readFileSync(join(root, 'tools', 'iterate.md'), 'utf8');
    const applyReview = readFileSync(join(root, 'tools', 'apply-review.md'), 'utf8');
    assert.match(
      iterate,
      /Mint `runId` once per run as `iterate-<at least 16 random hex characters>`/,
    );
    assert.match(
      applyReview,
      /Mint `runId` once per\s+run as `apply-review-<at least 16 random hex characters>`/,
    );
    // An owner `item` outside the helper's owner-string pattern would fail `lock acquire` with
    // INVALID_INPUT, so each fallback applies only when the candidate matches the pattern.
    assert.ok(
      iterate
        .replace(/\s+/g, ' ')
        .includes(
          '`item` is the caller-supplied identifier when it matches `^[A-Za-z0-9._:/@=+-]{1,128}$`, else the thread ID when that matches, else `item-<n>`',
        ),
      `${target} iterate: item identifier falls back by pattern`,
    );
    // A worker never resolves `<skill-root>` itself: the handoff carries path, root and runId.
    assert.match(
      iterate,
      /the absolute helper path\s+`<skill-root>\/scripts\/effective-flow-state\.mjs`, `RUNTIME_STATE_ROOT`, `runId`, its own\s+`delegation` `<runId>\/<n>`[\s\S]*?and\s+the runtime-state helper call shape verbatim/,
    );
    assert.match(
      applyReview,
      /the absolute helper path `<skill-root>\/scripts\/effective-flow-state\.mjs`, which it receives together with `RUNTIME_STATE_ROOT`, `runId` and that file's runtime-state helper call shape/,
    );
  }
});
