import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const CATALOG_URL = 'https://github.com/sebastian-software/effective-flow.git';

// `dalo --json status` reports the per-skill resolution state. These fixtures
// mirror the real DALO 0.9.2 shape, including the `unmanaged_skills` entry for
// the native install the migration is about to clear: the driver must tell that
// apart from a skill DALO cannot install at all.
const statusJson = ({ active = false, pending = false, blocked = false } = {}) =>
  `${JSON.stringify({
    resolution: {
      active_skills: active ? [{ source_ref: 'effective-flow:effective-flow' }] : [],
      pending_approval_skills: pending ? [{ source_ref: 'effective-flow:effective-flow' }] : [],
      unlinked_skills: [],
      blocked_skills: blocked ? [{ source_ref: 'effective-flow:effective-flow' }] : [],
      diagnostics: pending || blocked ? [{ code: 'pending_approval' }] : [],
    },
    unmanaged_skills: [{ slot_name: 'effective-flow' }],
  })}\n`;
const STATUS_RESOLVABLE = { match: '--json status', exit: 0, stdout: statusJson({ active: true }) };

// A stub `dalo` executable, placed first on PATH. It records every invocation
// (one JSON-encoded argv array per line) to DALO_STUB_LOG, and replays a
// scripted stdout/stderr/exit code for the first plan entry whose `match`
// prefix matches the joined argv. DALO_STUB_PLAN points at a JSON file
// holding the plan array. An unmatched invocation exits 0 with no output.
const DALO_STUB_SOURCE = `#!/usr/bin/env node
const fs = require('node:fs');

const logPath = process.env.DALO_STUB_LOG;
const planPath = process.env.DALO_STUB_PLAN;
const args = process.argv.slice(2);

if (logPath) {
  fs.appendFileSync(logPath, JSON.stringify(args) + '\\n');
}

let plan = [];
if (planPath && fs.existsSync(planPath)) {
  plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
}

const joined = args.join(' ');
const rule = plan.find((entry) => joined === entry.match || joined.startsWith(entry.match + ' '));

if (rule) {
  if (rule.stdout) process.stdout.write(rule.stdout);
  if (rule.stderr) process.stderr.write(rule.stderr);
  process.exit(rule.exit ?? 0);
}
process.exit(0);
`;

// The signature a native install carries and the migration requires before it
// removes a real directory: a SKILL.md whose frontmatter declares the skill name.
// A native install never bundles worker contracts under workers/.
const NATIVE_SKILL_MD = `---
name: effective-flow
description: "Effective Flow — software engineering workflows as tools."
---

# Effective Flow
`;

function foreignSkillMd(name) {
  return `---\nname: ${name}\ndescription: "Another skill."\n---\n\n# Other\n`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function installDaloStub(sandbox) {
  const binDir = join(sandbox, 'bin');
  await mkdir(binDir, { recursive: true });
  const daloPath = join(binDir, 'dalo');
  await writeFile(daloPath, DALO_STUB_SOURCE);
  await chmod(daloPath, 0o755);
  return binDir;
}

function isolatedEnvironment(root) {
  return {
    HOME: join(root, 'home'),
    CLAUDE_HOME: join(root, 'claude'),
    CODEX_HOME: join(root, 'codex'),
    DIST_ROOT: join(root, 'dist'),
    INSTALL_MODE: 'copy',
    ROOT_DIR,
  };
}

async function readLog(logPath) {
  try {
    const raw = await readFile(logPath, 'utf8');
    return raw
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function runDriver(sandbox, plan) {
  const binDir = await installDaloStub(sandbox);
  const logPath = join(sandbox, 'dalo.log');
  const planPath = join(sandbox, 'dalo-plan.json');
  await writeFile(planPath, JSON.stringify(plan));

  const env = isolatedEnvironment(sandbox);
  const result = spawnSync(
    '/bin/sh',
    ['-c', '. "$ROOT_DIR/local-common.sh"; effective_flow_install_through_dalo'],
    {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...env,
        PATH: `${binDir}:${process.env.PATH}`,
        DALO_STUB_LOG: logPath,
        DALO_STUB_PLAN: planPath,
      },
    },
  );

  return { ...result, log: await readLog(logPath) };
}

test('DALO driver: first install with no registered source', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-first-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const plan = [
    { match: 'init', exit: 0 },
    { match: 'target link claude', exit: 0 },
    { match: 'target link codex', exit: 0 },
    { match: '--json source list', exit: 0, stdout: '{"sources":[]}\n' },
    { match: 'source add-catalog effective-flow', exit: 0 },
    { match: 'source select effective-flow effective-flow', exit: 0 },
    STATUS_RESOLVABLE,
    { match: 'sync --check', exit: 0 },
  ];

  const result = await runDriver(sandbox, plan);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.log, [
    ['init'],
    ['target', 'link', 'claude'],
    ['target', 'link', 'codex'],
    ['--json', 'source', 'list'],
    ['source', 'add-catalog', 'effective-flow', CATALOG_URL],
    ['source', 'select', 'effective-flow', 'effective-flow'],
    ['--json', 'status'],
    ['sync', '--check'],
  ]);
  assert.equal(
    result.log.some((call) => call[0] === 'source' && call[1] === 'refresh'),
    false,
    'a first install must not call source refresh',
  );
});

test('DALO driver: rerun with an already-registered matching source', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-rerun-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const plan = [
    { match: 'init', exit: 0 },
    { match: 'target link claude', exit: 0 },
    { match: 'target link codex', exit: 0 },
    {
      match: '--json source list',
      exit: 0,
      stdout: `{"sources":[{"id":"effective-flow","kind":"catalog","url":"${CATALOG_URL}","update_policy":"pinned","selection":["effective-flow"]}]}\n`,
    },
    { match: 'source select effective-flow effective-flow', exit: 0 },
    { match: 'source refresh effective-flow --advance', exit: 0 },
    STATUS_RESOLVABLE,
    { match: 'sync --check', exit: 0 },
  ];

  const result = await runDriver(sandbox, plan);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.log.some((call) => call[0] === 'source' && call[1] === 'add-catalog'),
    false,
    'a registered source must not be re-added',
  );
  assert.deepEqual(
    result.log.find((call) => call[0] === 'source' && call[1] === 'refresh'),
    ['source', 'refresh', 'effective-flow', '--advance'],
  );
});

test('DALO driver: refuses to silently re-point a source registered at a different URL', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-mismatch-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const registeredUrl = 'https://example.com/other/repo.git';
  const plan = [
    { match: 'init', exit: 0 },
    { match: 'target link claude', exit: 0 },
    { match: 'target link codex', exit: 0 },
    {
      match: '--json source list',
      exit: 0,
      stdout: `{"sources":[{"id":"effective-flow","kind":"catalog","url":"${registeredUrl}","update_policy":"pinned","selection":["effective-flow"]}]}\n`,
    },
  ];

  const result = await runDriver(sandbox, plan);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, new RegExp(registeredUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(result.stderr, new RegExp(CATALOG_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const mutating of ['add-catalog', 'select', 'refresh', 'sync']) {
    assert.equal(
      result.log.some((call) => call.includes(mutating)),
      false,
      `no mutating dalo subcommand should run on a URL mismatch: ${mutating}`,
    );
  }
});

test('DALO driver: stops when both target link calls fail', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-nolinks-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const plan = [
    { match: 'init', exit: 0 },
    { match: 'target link claude', exit: 1, stderr: 'error: could not link claude\n' },
    { match: 'target link codex', exit: 1, stderr: 'error: could not link codex\n' },
  ];

  const result = await runDriver(sandbox, plan);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no harness target|linked no harness target/i);
  for (const mutating of ['sync', 'add-catalog']) {
    assert.equal(
      result.log.some((call) => call.includes(mutating)),
      false,
      `no ${mutating} invocation should run when both targets fail to link`,
    );
  }
});

test('DALO driver: continues and syncs when only one target link call fails', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-onelink-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const plan = [
    { match: 'init', exit: 0 },
    { match: 'target link claude', exit: 0 },
    { match: 'target link codex', exit: 1, stderr: 'error: could not link codex\n' },
    { match: '--json source list', exit: 0, stdout: '{"sources":[]}\n' },
    { match: 'source add-catalog effective-flow', exit: 0 },
    { match: 'source select effective-flow effective-flow', exit: 0 },
    STATUS_RESOLVABLE,
    { match: 'sync --check', exit: 0 },
  ];

  const result = await runDriver(sandbox, plan);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    result.log.find((call) => call[0] === 'sync'),
    ['sync', '--check'],
    'sync --check should still run when one of two targets links successfully',
  );
});

test('DALO driver: a harness whose target did not link keeps its native install', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-unlinked-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const claudeAgents = join(sandbox, 'claude', 'agents');
  const codexAgents = join(sandbox, 'codex', 'agents');
  const claudeManifest = join(claudeAgents, '.effective-flow-agents.manifest');
  const codexManifest = join(codexAgents, '.effective-flow-agents.manifest');
  const claudeSlot = join(sandbox, 'claude', 'skills', 'effective-flow');
  const codexSlot = join(sandbox, 'home', '.agents/skills', 'effective-flow');

  await Promise.all([
    mkdir(claudeAgents, { recursive: true }),
    mkdir(codexAgents, { recursive: true }),
    mkdir(claudeSlot, { recursive: true }),
    mkdir(codexSlot, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(claudeManifest, 'effective-flow-alpha.md\n'),
    writeFile(codexManifest, 'effective-flow-beta.toml\n'),
    writeFile(join(claudeAgents, 'effective-flow-alpha.md'), 'owned'),
    writeFile(join(codexAgents, 'effective-flow-beta.toml'), 'owned'),
    writeFile(join(claudeSlot, 'SKILL.md'), NATIVE_SKILL_MD),
    writeFile(join(codexSlot, 'SKILL.md'), NATIVE_SKILL_MD),
  ]);

  const plan = [
    { match: 'init', exit: 0 },
    { match: 'target link claude', exit: 0 },
    { match: 'target link codex', exit: 1, stderr: 'error: could not link codex\n' },
    { match: '--json source list', exit: 0, stdout: '{"sources":[]}\n' },
    { match: 'source add-catalog effective-flow', exit: 0 },
    { match: 'source select effective-flow effective-flow', exit: 0 },
    STATUS_RESOLVABLE,
    { match: 'sync --check', exit: 0 },
  ];

  const result = await runDriver(sandbox, plan);
  assert.equal(result.status, 0, result.stderr);

  for (const removed of [
    join(claudeAgents, 'effective-flow-alpha.md'),
    claudeManifest,
    claudeSlot,
  ]) {
    assert.equal(await pathExists(removed), false, `should be removed: ${removed}`);
  }
  // DALO materializes into linked targets only, so the Codex native install is
  // the only thing that harness still has.
  for (const survivor of [
    join(codexAgents, 'effective-flow-beta.toml'),
    codexManifest,
    codexSlot,
  ]) {
    assert.equal(await pathExists(survivor), true, `should survive: ${survivor}`);
  }
  assert.match(result.stdout, /Left the native Codex install in place/);
});

test('DALO driver: a failing source list stops the installer and never masks the failure as unregistered', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-listfail-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const plan = [
    { match: 'init', exit: 0 },
    { match: 'target link claude', exit: 0 },
    { match: 'target link codex', exit: 0 },
    {
      match: '--json source list',
      exit: 1,
      stderr: 'error: store is locked\n',
    },
  ];

  const result = await runDriver(sandbox, plan);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DALO could not list its sources/);
  for (const mutating of ['add-catalog', 'select', 'refresh', 'sync']) {
    assert.equal(
      result.log.some((call) => call.includes(mutating)),
      false,
      `no mutating dalo subcommand should run when source list fails: ${mutating}`,
    );
  }
});

test('DALO driver: a blocked catalog advance stops the installer without accepting risk', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-blocked-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  // The advance is the one audit-gated command that really does fail: DALO 0.9.2
  // exits non-zero from `source refresh --advance` while the staged candidate is
  // blocked, and names the staged path in its own error.
  const stagedPath = '/tmp/staging/effective-flow-abc123/effective-flow';
  const plan = [
    { match: 'init', exit: 0 },
    { match: 'target link claude', exit: 0 },
    { match: 'target link codex', exit: 0 },
    {
      match: '--json source list',
      exit: 0,
      stdout: `{"sources":[{"id":"effective-flow","kind":"catalog","url":"${CATALOG_URL}","update_policy":"pinned","selection":["effective-flow"]}]}\n`,
    },
    { match: 'source select effective-flow effective-flow', exit: 0 },
    {
      match: 'source refresh effective-flow --advance',
      exit: 1,
      stderr: `error: catalog pin was not advanced: security audit blocks candidate skill\nreview with \`dalo audit '${stagedPath}' --accept-risk <reason>\`\n`,
    },
  ];

  const result = await runDriver(sandbox, plan);
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    new RegExp(`dalo audit '${stagedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}' --accept-risk`),
  );
  assert.equal(
    result.log.some((call) => call.includes('audit')),
    false,
    'the installer must never invoke dalo audit itself',
  );
  assert.equal(
    result.log.some((call) => call.includes('approve')),
    false,
    'the installer must never invoke dalo approve itself',
  );
});

test('DALO driver: a blocked advance with no approval record names both acceptance steps', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-blocked-both-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  // The two acceptances are independent: the staged audit releases the advance,
  // the approval record lets `dalo sync` materialize the skill. DALO 0.9.2
  // reports `pending_approval_skills` from `--json status` at exactly the moment
  // the advance fails, so both remedies are knowable in the same run.
  const stagedPath = '/tmp/staging/effective-flow-def456/effective-flow';
  const plan = [
    { match: 'init', exit: 0 },
    { match: 'target link claude', exit: 0 },
    { match: 'target link codex', exit: 0 },
    {
      match: '--json source list',
      exit: 0,
      stdout: `{"sources":[{"id":"effective-flow","kind":"catalog","url":"${CATALOG_URL}","update_policy":"pinned","selection":["effective-flow"]}]}\n`,
    },
    { match: 'source select effective-flow effective-flow', exit: 0 },
    {
      match: 'source refresh effective-flow --advance',
      exit: 1,
      stderr: `error: catalog pin was not advanced: security audit blocks candidate skill\nreview with \`dalo audit '${stagedPath}' --accept-risk <reason>\`\n`,
    },
    { match: '--json status', exit: 0, stdout: statusJson({ pending: true }) },
  ];

  const result = await runDriver(sandbox, plan);
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    new RegExp(`dalo audit '${escapeRegExp(stagedPath)}' --accept-risk`),
    'the staged-audit remedy must stay the primary message',
  );
  assert.match(
    result.stderr,
    /dalo approve skill effective-flow:effective-flow --accept-risk/,
    'the still-open approval step must be named in the same run',
  );
  for (const forbidden of ['audit', 'approve']) {
    assert.equal(
      result.log.some((call) => call.includes(forbidden)),
      false,
      `the installer must never invoke dalo ${forbidden} itself`,
    );
  }
});

test('DALO driver: a blocked advance with the approval already recorded names only the audit', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-blocked-approved-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  // The common update case. `--json status` resolves against the still-pinned
  // content, so an operator who approved the skill once is reported as active
  // and must not be told to approve it again.
  const stagedPath = '/tmp/staging/effective-flow-789abc/effective-flow';
  const plan = [
    { match: 'init', exit: 0 },
    { match: 'target link claude', exit: 0 },
    { match: 'target link codex', exit: 0 },
    {
      match: '--json source list',
      exit: 0,
      stdout: `{"sources":[{"id":"effective-flow","kind":"catalog","url":"${CATALOG_URL}","update_policy":"pinned","selection":["effective-flow"]}]}\n`,
    },
    { match: 'source select effective-flow effective-flow', exit: 0 },
    {
      match: 'source refresh effective-flow --advance',
      exit: 1,
      stderr: `error: catalog pin was not advanced: security audit blocks candidate skill\nreview with \`dalo audit '${stagedPath}' --accept-risk <reason>\`\n`,
    },
    STATUS_RESOLVABLE,
  ];

  const result = await runDriver(sandbox, plan);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, new RegExp(`dalo audit '${escapeRegExp(stagedPath)}' --accept-risk`));
  assert.equal(
    /dalo approve skill/.test(result.stderr),
    false,
    'an already-approved skill must not gain a second remedy',
  );
});

test('DALO driver: a blocked advance with an unreadable status keeps the audit remedy', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-blocked-unknown-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  // The secondary probe must never weaken the message it is enriching: losing
  // the staged-audit remedy to an unreadable status would be a worse failure
  // than the one this aggregation fixes.
  const stagedPath = '/tmp/staging/effective-flow-fed321/effective-flow';
  const plan = [
    { match: 'init', exit: 0 },
    { match: 'target link claude', exit: 0 },
    { match: 'target link codex', exit: 0 },
    {
      match: '--json source list',
      exit: 0,
      stdout: `{"sources":[{"id":"effective-flow","kind":"catalog","url":"${CATALOG_URL}","update_policy":"pinned","selection":["effective-flow"]}]}\n`,
    },
    { match: 'source select effective-flow effective-flow', exit: 0 },
    {
      match: 'source refresh effective-flow --advance',
      exit: 1,
      stderr: `error: catalog pin was not advanced: security audit blocks candidate skill\nreview with \`dalo audit '${stagedPath}' --accept-risk <reason>\`\n`,
    },
    { match: '--json status', exit: 1, stderr: 'error: store is corrupt\n' },
  ];

  const result = await runDriver(sandbox, plan);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, new RegExp(`dalo audit '${escapeRegExp(stagedPath)}' --accept-risk`));
  assert.match(result.stderr, /could not be determined; run "dalo status"/);
  assert.equal(
    /dalo approve skill/.test(result.stderr),
    false,
    'an unknown approval state must not be reported as a missing approval record',
  );
});

test('DALO driver: a blocked advance with a blocked skill does not claim a missing approval', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-blockedstate-report-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  // Only `pending_approval_skills` proves a missing approval record. A skill in
  // `blocked_skills` is blocked for a different reason, and telling an operator
  // who has already approved it to approve again would name the wrong remedy and
  // leave the real cause unexplained.
  const stagedPath = '/tmp/staging/effective-flow-blocked/effective-flow';
  const plan = [
    { match: 'init', exit: 0 },
    { match: 'target link claude', exit: 0 },
    { match: 'target link codex', exit: 0 },
    {
      match: '--json source list',
      exit: 0,
      stdout: `{"sources":[{"id":"effective-flow","kind":"catalog","url":"${CATALOG_URL}","update_policy":"pinned","selection":["effective-flow"]}]}\n`,
    },
    { match: 'source select effective-flow effective-flow', exit: 0 },
    {
      match: 'source refresh effective-flow --advance',
      exit: 1,
      stderr: `error: catalog pin was not advanced\nreview with \`dalo audit '${stagedPath}' --accept-risk <reason>\`\n`,
    },
    { match: '--json status', exit: 0, stdout: statusJson({ blocked: true }) },
  ];

  const result = await runDriver(sandbox, plan);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--accept-risk/);
  assert.doesNotMatch(
    result.stderr,
    /carries no approval record/,
    'a blocked skill must not be reported as a missing approval record',
  );
  assert.doesNotMatch(result.stderr, /dalo approve skill/, 'the wrong remedy must not be offered');
  assert.match(result.stderr, /not installable for another reason/);
});

test('DALO driver: a pending approval stops the run before anything is removed', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-pending-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  // The regression this guards. DALO 0.9.2 prints "installation policy: blocked
  // until risk is explicitly accepted" from `source select` and still exits 0,
  // so an exit-code gate walks past it, migrates the native install away, and
  // only then fails at `sync --check` — leaving the harness with nothing.
  const claudeAgents = join(sandbox, 'claude', 'agents');
  const claudeSlot = join(sandbox, 'claude', 'skills', 'effective-flow');
  await mkdir(claudeAgents, { recursive: true });
  await mkdir(claudeSlot, { recursive: true });
  await writeFile(join(claudeSlot, 'SKILL.md'), NATIVE_SKILL_MD);
  await writeFile(join(claudeAgents, 'effective-flow-test-writer.md'), 'agent');
  await writeFile(
    join(claudeAgents, '.effective-flow-agents.manifest'),
    'effective-flow-test-writer.md\n',
  );

  const plan = [
    { match: 'init', exit: 0 },
    { match: 'target link claude', exit: 0 },
    { match: 'target link codex', exit: 0 },
    { match: '--json source list', exit: 0, stdout: '{"sources":[]}\n' },
    { match: 'source add-catalog effective-flow', exit: 0 },
    // Exits 0 while reporting the block, exactly as the real command does.
    {
      match: 'source select effective-flow effective-flow',
      exit: 0,
      stdout: 'installation policy: blocked until risk is explicitly accepted\n',
    },
    { match: '--json status', exit: 0, stdout: statusJson({ pending: true }) },
  ];

  const result = await runDriver(sandbox, plan);
  assert.notEqual(result.status, 0, 'an unapproved skill must not produce a successful run');

  assert.equal(await pathExists(claudeSlot), true, 'the native skill slot must survive');
  assert.equal(await pathExists(join(claudeSlot, 'SKILL.md')), true);
  assert.equal(await pathExists(join(claudeAgents, 'effective-flow-test-writer.md')), true);
  assert.equal(
    await pathExists(join(claudeAgents, '.effective-flow-agents.manifest')),
    true,
    'the ownership manifest must survive too',
  );

  assert.equal(
    result.log.some((call) => call.includes('sync')),
    false,
    'the run must stop before sync, not after a destructive migration',
  );
  assert.match(result.stderr, /nothing was removed/);
  assert.match(result.stderr, /dalo approve skill effective-flow:effective-flow --accept-risk/);
  for (const forbidden of ['audit', 'approve']) {
    assert.equal(
      result.log.some((call) => call.includes(forbidden)),
      false,
      `the installer must never invoke dalo ${forbidden} itself`,
    );
  }
});

test('DALO driver: a blocked resolution state stops the run before anything is removed', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-blockedstate-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const claudeSlot = join(sandbox, 'claude', 'skills', 'effective-flow');
  await mkdir(claudeSlot, { recursive: true });
  await writeFile(join(claudeSlot, 'SKILL.md'), NATIVE_SKILL_MD);

  const plan = [
    { match: 'init', exit: 0 },
    { match: 'target link claude', exit: 0 },
    { match: 'target link codex', exit: 0 },
    { match: '--json source list', exit: 0, stdout: '{"sources":[]}\n' },
    { match: 'source add-catalog effective-flow', exit: 0 },
    { match: 'source select effective-flow effective-flow', exit: 0 },
    { match: '--json status', exit: 0, stdout: statusJson({ blocked: true }) },
  ];

  const result = await runDriver(sandbox, plan);
  assert.notEqual(result.status, 0);
  assert.equal(await pathExists(claudeSlot), true, 'the native skill slot must survive');
  assert.equal(
    result.log.some((call) => call.includes('sync')),
    false,
  );
});

test('DALO driver: an unreadable status stops the run before anything is removed', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-statusfail-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const claudeSlot = join(sandbox, 'claude', 'skills', 'effective-flow');
  await mkdir(claudeSlot, { recursive: true });
  await writeFile(join(claudeSlot, 'SKILL.md'), NATIVE_SKILL_MD);

  const plan = [
    { match: 'init', exit: 0 },
    { match: 'target link claude', exit: 0 },
    { match: 'target link codex', exit: 0 },
    { match: '--json source list', exit: 0, stdout: '{"sources":[]}\n' },
    { match: 'source add-catalog effective-flow', exit: 0 },
    { match: 'source select effective-flow effective-flow', exit: 0 },
    { match: '--json status', exit: 1, stderr: 'error: store is corrupt\n' },
  ];

  const result = await runDriver(sandbox, plan);
  assert.notEqual(result.status, 0);
  assert.equal(
    await pathExists(claudeSlot),
    true,
    'an unprovable state must not authorize removal',
  );
  assert.equal(
    result.log.some((call) => call.includes('sync')),
    false,
  );
});

test('DALO driver: a failing sync --check is reported and stops the installer', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-syncfail-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const plan = [
    { match: 'init', exit: 0 },
    { match: 'target link claude', exit: 0 },
    { match: 'target link codex', exit: 0 },
    { match: '--json source list', exit: 0, stdout: '{"sources":[]}\n' },
    { match: 'source add-catalog effective-flow', exit: 0 },
    { match: 'source select effective-flow effective-flow', exit: 0 },
    STATUS_RESOLVABLE,
    { match: 'sync --check', exit: 1, stderr: 'blocked: conflict at slot effective-flow\n' },
  ];

  const result = await runDriver(sandbox, plan);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /[Rr]esolve it and run this installer again/);
});

test('effective_flow_catalog_url resolves the catalog source', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-catalogurl-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  function catalogUrl(env) {
    return spawnSync(
      '/bin/sh',
      ['-c', '. "$ROOT_DIR/local-common.sh"; effective_flow_catalog_url'],
      {
        cwd: ROOT_DIR,
        encoding: 'utf8',
        env: { ...process.env, ROOT_DIR, ...env },
      },
    );
  }

  await t.test('defaults to the Effective Flow GitHub repository', () => {
    const result = catalogUrl({ EFFECTIVE_FLOW_REPO: '', FIRMO_REPO: '' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), CATALOG_URL);
  });

  await t.test('passes a full clone URL through unchanged', () => {
    const result = catalogUrl({ EFFECTIVE_FLOW_REPO: 'https://example.com/foo/bar.git' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'https://example.com/foo/bar.git');
  });

  await t.test('expands an owner/name slug to the GitHub HTTPS form', () => {
    const result = catalogUrl({ EFFECTIVE_FLOW_REPO: 'foo/bar' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'https://github.com/foo/bar.git');
  });

  await t.test('honours the legacy FIRMO_REPO alias', () => {
    const result = catalogUrl({ EFFECTIVE_FLOW_REPO: '', FIRMO_REPO: 'baz/qux' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'https://github.com/baz/qux.git');
  });

  await t.test('prefers EFFECTIVE_FLOW_REPO over FIRMO_REPO', () => {
    const result = catalogUrl({ EFFECTIVE_FLOW_REPO: 'alpha/beta', FIRMO_REPO: 'other/other' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'https://github.com/alpha/beta.git');
  });
});

// The migration takes the DALO targets that linked successfully; the default
// covers the runs where both harnesses are available.
async function runMigration(sandbox, targets = 'claude codex') {
  const env = isolatedEnvironment(sandbox);
  return spawnSync(
    '/bin/sh',
    [
      '-c',
      '. "$ROOT_DIR/local-common.sh"; effective_flow_migrate_native_install "$1"',
      'sh',
      targets,
    ],
    {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    },
  );
}

test('effective_flow_migrate_native_install removes only provably owned artifacts', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-migrate-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const claudeHome = join(sandbox, 'claude');
  const codexHome = join(sandbox, 'codex');
  const home = join(sandbox, 'home');
  const distRoot = join(sandbox, 'dist');
  const claudeAgents = join(claudeHome, 'agents');
  const codexAgents = join(codexHome, 'agents');
  const claudeSkills = join(claudeHome, 'skills');
  const codexSkills = join(home, '.agents/skills');

  await Promise.all([
    mkdir(claudeAgents, { recursive: true }),
    mkdir(codexAgents, { recursive: true }),
    mkdir(claudeSkills, { recursive: true }),
    mkdir(codexSkills, { recursive: true }),
    mkdir(join(distRoot, 'codex/effective-flow'), { recursive: true }),
  ]);

  // Manifest-recorded agents: one owned name, one path-traversal entry, and
  // one non-owned name, mirroring the local-common.test.mjs manifest fixture.
  await writeFile(
    join(claudeAgents, '.effective-flow-agents.manifest'),
    'effective-flow-alpha.md\n../outside.md\nforeign.md\n',
  );
  await writeFile(
    join(codexAgents, '.effective-flow-agents.manifest'),
    'effective-flow-beta.toml\n../outside.toml\nforeign.toml\n',
  );

  await Promise.all([
    writeFile(join(claudeAgents, 'effective-flow-alpha.md'), 'owned'),
    writeFile(join(claudeAgents, 'effective-flow-neighbor.md'), 'unrecorded'),
    writeFile(join(claudeHome, 'outside.md'), 'must survive path-traversal defence'),
    writeFile(join(codexAgents, 'effective-flow-beta.toml'), 'owned'),
    writeFile(join(codexAgents, 'effective-flow-neighbor.toml'), 'unrecorded'),
    writeFile(join(codexHome, 'outside.toml'), 'must survive path-traversal defence'),
  ]);

  // Claude's slot is a real directory carrying the native install signature
  // (copy-mode leftover).
  await mkdir(join(claudeSkills, 'effective-flow'), { recursive: true });
  await writeFile(join(claudeSkills, 'effective-flow/SKILL.md'), NATIVE_SKILL_MD);
  // Codex's slot is a symlink into this checkout's dist/ (link-mode leftover).
  await symlink(join(distRoot, 'codex/effective-flow'), join(codexSkills, 'effective-flow'));
  // An unrelated neighboring skill must survive untouched.
  await mkdir(join(claudeSkills, 'other-skill'), { recursive: true });
  await writeFile(join(claudeSkills, 'other-skill/SKILL.md'), 'unrelated');

  const result = await runMigration(sandbox);
  assert.equal(result.status, 0, result.stderr);

  for (const removed of [
    join(claudeAgents, 'effective-flow-alpha.md'),
    join(claudeAgents, '.effective-flow-agents.manifest'),
    join(codexAgents, 'effective-flow-beta.toml'),
    join(codexAgents, '.effective-flow-agents.manifest'),
    join(claudeSkills, 'effective-flow'),
    join(codexSkills, 'effective-flow'),
  ]) {
    assert.equal(await pathExists(removed), false, `should be removed: ${removed}`);
  }
  for (const survivor of [
    join(claudeAgents, 'effective-flow-neighbor.md'),
    join(claudeHome, 'outside.md'),
    join(codexAgents, 'effective-flow-neighbor.toml'),
    join(codexHome, 'outside.toml'),
    join(claudeSkills, 'other-skill'),
  ]) {
    assert.equal(await pathExists(survivor), true, `should survive: ${survivor}`);
  }
});

test('effective_flow_migrate_native_install leaves a non-dist symlink untouched', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-migrate-symlink-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const claudeHome = join(sandbox, 'claude');
  const claudeSkills = join(claudeHome, 'skills');
  const externalStore = join(sandbox, 'external-store', 'effective-flow');
  await mkdir(claudeSkills, { recursive: true });
  await mkdir(externalStore, { recursive: true });
  await writeFile(join(externalStore, 'SKILL.md'), 'DALO-managed');
  await symlink(externalStore, join(claudeSkills, 'effective-flow'));

  const result = await runMigration(sandbox);
  assert.equal(result.status, 0, result.stderr);

  const slot = join(claudeSkills, 'effective-flow');
  assert.equal((await lstat(slot)).isSymbolicLink(), true);
  assert.equal(await readlink(slot), externalStore);
});

test('effective_flow_migrate_native_install keeps a manager-owned skill directory', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-migrate-workers-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const nativeSlot = join(sandbox, 'claude', 'skills', 'effective-flow');
  const managedSlot = join(sandbox, 'home', '.agents/skills', 'effective-flow');

  // A native copy-mode leftover: the declared name, no bundled workers, and the
  // agent manifest that proves this project's installer wrote the slot.
  await mkdir(nativeSlot, { recursive: true });
  await writeFile(join(nativeSlot, 'SKILL.md'), NATIVE_SKILL_MD);
  await mkdir(join(sandbox, 'claude', 'agents'), { recursive: true });
  await writeFile(
    join(sandbox, 'claude', 'agents', '.effective-flow-agents.manifest'),
    'effective-flow-test-writer.md\n',
  );

  // The portable build a skill manager materializes: same declared name, but
  // bundled worker contracts the native installer never writes. `npx skills add
  // --copy` produces exactly this shape as a real directory.
  await mkdir(join(managedSlot, 'workers'), { recursive: true });
  await writeFile(join(managedSlot, 'SKILL.md'), NATIVE_SKILL_MD);
  await writeFile(join(managedSlot, 'workers/effective-flow-test-writer.md'), 'worker contract');

  const result = await runMigration(sandbox);
  assert.equal(result.status, 0, result.stderr);

  assert.equal(await pathExists(nativeSlot), false, `should be removed: ${nativeSlot}`);
  assert.equal(await pathExists(managedSlot), true, `should survive: ${managedSlot}`);
  assert.equal(
    await pathExists(join(managedSlot, 'workers/effective-flow-test-writer.md')),
    true,
    'a manager-owned directory must not be emptied either',
  );
  assert.match(result.stdout, new RegExp(`Left ${escapeRegExp(managedSlot)} untouched`));
});

test('effective_flow_migrate_native_install keeps a directory without the native name declaration', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-migrate-foreign-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const foreignSlot = join(sandbox, 'claude', 'skills', 'effective-flow');
  const bareSlot = join(sandbox, 'home', '.agents/skills', 'effective-flow');

  // A hand-placed skill that occupies the slot under a different identity.
  await mkdir(foreignSlot, { recursive: true });
  await writeFile(join(foreignSlot, 'SKILL.md'), foreignSkillMd('other-flow'));

  // A directory without any SKILL.md proves nothing about its origin.
  await mkdir(bareSlot, { recursive: true });
  await writeFile(join(bareSlot, 'notes.md'), 'hand-placed content');

  const result = await runMigration(sandbox);
  assert.equal(result.status, 0, result.stderr);

  for (const survivor of [foreignSlot, bareSlot]) {
    assert.equal(await pathExists(survivor), true, `should survive: ${survivor}`);
    assert.match(result.stdout, new RegExp(`Left ${escapeRegExp(survivor)} untouched`));
  }
});

test('effective_flow_migrate_native_install keeps a native-looking directory this installer never recorded', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-migrate-unrecorded-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  // A fork carries the same content signature as a native install: the declared
  // name and no bundled workers. Without this harness's agent manifest nothing
  // proves this project's installer wrote it, so content alone must not
  // authorize a recursive delete.
  const forkSlot = join(sandbox, 'claude', 'skills', 'effective-flow');
  await mkdir(forkSlot, { recursive: true });
  await writeFile(join(forkSlot, 'SKILL.md'), NATIVE_SKILL_MD);
  await writeFile(join(forkSlot, 'local-change.md'), 'work that must not be destroyed');

  const result = await runMigration(sandbox);
  assert.equal(result.status, 0, result.stderr);

  assert.equal(await pathExists(forkSlot), true, `should survive: ${forkSlot}`);
  assert.equal(await pathExists(join(forkSlot, 'local-change.md')), true);
  assert.match(result.stdout, new RegExp(`Left ${escapeRegExp(forkSlot)} untouched`));
  assert.match(result.stdout, /no Claude agent manifest proves this installer created it/);
});

test('effective_flow_migrate_native_install does not accept a symlinked manifest as ownership evidence', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-migrate-linked-manifest-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const slot = join(sandbox, 'claude', 'skills', 'effective-flow');
  const agents = join(sandbox, 'claude', 'agents');
  await mkdir(slot, { recursive: true });
  await writeFile(join(slot, 'SKILL.md'), NATIVE_SKILL_MD);
  await mkdir(agents, { recursive: true });

  // A manifest-named symlink is something else pointing somewhere else; letting
  // it authorize the delete would hand that decision to whoever placed the link.
  const elsewhere = join(sandbox, 'elsewhere.manifest');
  await writeFile(elsewhere, 'effective-flow-test-writer.md\n');
  await symlink(elsewhere, join(agents, '.effective-flow-agents.manifest'));

  const result = await runMigration(sandbox);
  assert.equal(result.status, 0, result.stderr);

  assert.equal(await pathExists(slot), true, `should survive: ${slot}`);
  assert.match(result.stdout, /no Claude agent manifest proves this installer created it/);
});

test('effective_flow_migrate_native_install reports nothing and exits 0 when there is nothing to migrate', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-dalo-migrate-empty-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const result = await runMigration(sandbox);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
