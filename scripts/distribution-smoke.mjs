#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collectRenderedWorkerRefs, extractFrontmatter, getField } from '../build-lib.mjs';
import { stageDelivery } from './stage-delivery.mjs';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const AGENT_PREFIX = 'effective-flow-';
const TRUSTED_AUTOMATION = [
  join('.github', 'workflows', 'close-develop-issues.yml'),
  join('.github', 'scripts', 'close-develop-issues.mjs'),
];
const EXPECTED_LICENSE = `MIT License

Copyright 2016 Sebastian Software GmbH

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT_DIR,
    encoding: 'utf8',
    env: { ...process.env, CI: '1', NO_COLOR: '1', ...options.env },
    input: options.input,
  });
  if (result.status !== 0) {
    fail(
      `${command} ${args.join(' ')} failed (${result.status})\n${result.stdout}${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

function walkFiles(root, predicate = () => true) {
  const files = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (predicate(path)) files.push(path);
    }
  };
  visit(root);
  return files.sort();
}

function sourceWorkers() {
  return readdirSync(join(ROOT_DIR, 'src', 'agents'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => `${AGENT_PREFIX}${basename(name, '.md')}`)
    .sort();
}

function assertSameMembers(actual, expected, label) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    fail(`${label} mismatch\nactual: ${left.join(', ')}\nexpected: ${right.join(', ')}`);
  }
}

function assertSameFile(actual, expected, label) {
  if (!readFileSync(actual).equals(readFileSync(expected))) {
    fail(`${label} differs from ${expected}`);
  }
}

function assertCanonicalLicense() {
  const license = join(ROOT_DIR, 'LICENSE');
  if (readFileSync(license, 'utf8') !== EXPECTED_LICENSE) {
    fail(`${license} is not the canonical MIT license for Sebastian Software GmbH`);
  }
}

function assertWorkerResolution(root, workerDir, extension, metadataPrefix, workers) {
  const knownWorkers = new Set(workers);
  for (const file of walkFiles(root, (path) => /\.(?:md|toml)$/.test(path))) {
    const content = readFileSync(file, 'utf8');
    if (content.includes('{{AGENT:')) fail(`unresolved worker placeholder in ${file}`);
    for (const ref of collectRenderedWorkerRefs(content, AGENT_PREFIX, knownWorkers)) {
      const artifact = join(workerDir, `${ref}.${extension}`);
      if (!lstatSync(artifact).isFile()) fail(`${file} references missing worker ${artifact}`);
    }
  }

  for (const worker of workers) {
    const file = join(workerDir, `${worker}.${extension}`);
    const content = readFileSync(file, 'utf8');
    if (!content.includes(`${metadataPrefix}${worker}`)) {
      fail(`${file} does not declare ${worker}`);
    }
  }
}

export function assertBuiltLayout(distRoot = join(ROOT_DIR, 'dist')) {
  assertCanonicalLicense();

  const workers = sourceWorkers();
  const claudeAgents = join(distRoot, 'claude', 'agents');
  const codexAgents = join(distRoot, 'codex', 'agents');
  const portableWorkers = join(distRoot, 'portable', 'effective-flow', 'workers');

  assertSameMembers(
    readdirSync(claudeAgents).filter((name) => name.endsWith('.md')),
    workers.map((name) => `${name}.md`),
    'Claude native workers',
  );
  assertSameMembers(
    readdirSync(codexAgents).filter((name) => name.endsWith('.toml')),
    workers.map((name) => `${name}.toml`),
    'Codex native workers',
  );
  assertSameMembers(
    readdirSync(portableWorkers).filter((name) => name.endsWith('.md')),
    workers.map((name) => `${name}.md`),
    'portable worker contracts',
  );

  const codexNestedAgents = join(distRoot, 'codex', 'effective-flow', 'agents');
  try {
    lstatSync(codexNestedAgents);
    fail(`Codex native agents must not be nested in the skill: ${codexNestedAgents}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  assertWorkerResolution(join(distRoot, 'claude'), claudeAgents, 'md', 'name: ', workers);
  assertWorkerResolution(join(distRoot, 'codex'), codexAgents, 'toml', 'name = "', workers);
  assertWorkerResolution(join(distRoot, 'portable'), portableWorkers, 'md', '# ', workers);

  for (const target of ['claude', 'codex', 'portable']) {
    assertSameFile(
      join(distRoot, target, 'effective-flow', 'LICENSE'),
      join(ROOT_DIR, 'LICENSE'),
      `${target} license`,
    );
    const scripts = join(distRoot, target, 'effective-flow', 'scripts');
    for (const file of ['remote-tracker.mjs', 'remote-tracker-core.mjs']) {
      if (!lstatSync(join(scripts, file)).isFile()) fail(`${target} is missing scripts/${file}`);
    }
    const helper = join(scripts, 'remote-tracker.mjs');
    const result = spawnSync(process.execPath, [helper, 'body-hash'], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      env: { ...process.env, CI: '1', NO_COLOR: '1' },
      input: JSON.stringify({ body: 'distribution-smoke' }),
    });
    if (result.status !== 0) {
      fail(`${target} remote tracker failed (${result.status})\n${result.stdout}${result.stderr}`);
    }
    const envelope = parseJson(result.stdout.trim(), `${target} remote tracker`);
    if (!envelope.ok || envelope.operation !== 'body-hash' || envelope.dryRun !== false) {
      fail(`${target} remote tracker returned an invalid envelope`);
    }
  }

  for (const file of walkFiles(join(distRoot, 'portable', 'effective-flow'), (path) =>
    path.endsWith('.md'),
  )) {
    const content = readFileSync(file, 'utf8');
    const refs = collectRenderedWorkerRefs(content, AGENT_PREFIX, new Set(workers));
    if (refs.length > 0) {
      if (!content.includes('built-in general-purpose subagent mechanism')) {
        fail(`portable file lacks built-in delegation instructions: ${file}`);
      }
      if (/custom role named|agent_type\s*=/.test(content)) {
        fail(`portable file depends on native custom-agent discovery: ${file}`);
      }
    }
  }

  const routers = ['claude', 'codex', 'portable'].map((target) =>
    readFileSync(join(distRoot, target, 'effective-flow', 'SKILL.md'), 'utf8'),
  );
  const versions = routers.map((router) => router.match(/\(version ([^)]+\([^)]+\))\)\./)?.[1]);
  if (!versions[0] || new Set(versions).size !== 1) {
    fail(`router version stamps differ: ${versions.join(', ')}`);
  }
}

function snapshotTree(root) {
  const snapshot = [];
  for (const file of walkFiles(root)) {
    const stat = lstatSync(file);
    const path = relative(root, file);
    if (stat.isSymbolicLink()) snapshot.push([path, 'link', readlinkSync(file)]);
    else {
      const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
      snapshot.push([path, 'file', digest]);
    }
  }
  return snapshot;
}

export function assertDeliveryLayout(directory, portableSkill) {
  assertCanonicalLicense();

  for (const wrapper of ['claude', 'codex', 'portable']) {
    try {
      lstatSync(join(directory, wrapper));
      fail(`delivery contains forbidden native/wrapper directory: ${wrapper}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  const candidates = [];
  for (const file of walkFiles(directory, (path) => basename(path) === 'SKILL.md')) {
    const frontmatter = extractFrontmatter(readFileSync(file, 'utf8'));
    if (getField(frontmatter, 'name') === 'effective-flow')
      candidates.push(relative(directory, file));
  }
  assertSameMembers(candidates, [join('effective-flow', 'SKILL.md')], 'delivery skill candidates');

  assertSameFile(
    join(directory, 'LICENSE'),
    join(ROOT_DIR, 'LICENSE'),
    'delivered repository license',
  );
  assertSameFile(
    join(directory, 'effective-flow', 'LICENSE'),
    join(ROOT_DIR, 'LICENSE'),
    'delivered portable license',
  );
  assertSameFile(
    join(directory, 'renovate.json'),
    join(ROOT_DIR, 'renovate.json'),
    'delivered Renovate config',
  );

  if (portableSkill) {
    const actual = snapshotTree(join(directory, 'effective-flow'));
    const expected = snapshotTree(portableSkill);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      fail('delivered effective-flow tree differs from the portable build');
    }
  }

  for (const path of TRUSTED_AUTOMATION) {
    const actual = readFileSync(join(directory, path));
    const expected = readFileSync(join(ROOT_DIR, path));
    if (!actual.equals(expected)) fail(`delivered trusted automation differs from source: ${path}`);
  }
  for (const path of [
    join('.github', 'workflows', 'ci.yml'),
    join('.github', 'workflows', 'release.yml'),
  ]) {
    try {
      lstatSync(join(directory, path));
      fail(`delivery contains source-only workflow: ${path}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

export function assertArchiveLayout(archive) {
  const entries = run('tar', ['-tzf', archive]).split('\n').filter(Boolean);
  for (const entry of entries) {
    const normalized = entry.replace(/^\.\//, '');
    if (normalized.startsWith('/') || normalized.split('/').includes('..')) {
      fail(`unsafe archive entry: ${entry}`);
    }
  }
  const temp = mkdtempSync(join(tmpdir(), 'effective-flow-archive-smoke-'));
  try {
    run('tar', ['-xzf', resolve(archive), '-C', temp]);
    assertBuiltLayout(temp);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function runReleaseInstallerSmoke(archive) {
  const temp = mkdtempSync(join(tmpdir(), 'effective-flow-release-install-smoke-'));
  try {
    const bin = join(temp, 'bin');
    mkdirSync(bin, { recursive: true });
    const gh = join(bin, 'gh');
    writeFileSync(
      gh,
      [
        '#!/bin/sh',
        'set -eu',
        'destination=',
        'while [ "$#" -gt 0 ]; do',
        '  if [ "$1" = "--dir" ]; then',
        '    shift',
        '    destination="$1"',
        '  fi',
        '  shift',
        'done',
        'cp "$EFFECTIVE_FLOW_TEST_ARCHIVE" "$destination/"',
        '',
      ].join('\n'),
    );
    chmodSync(gh, 0o755);

    const home = join(temp, 'home');
    const claudeHome = join(temp, 'claude');
    const codexHome = join(temp, 'codex');
    mkdirSync(home, { recursive: true });
    run('/bin/sh', [join(ROOT_DIR, 'install-skill.sh')], {
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        HOME: home,
        CLAUDE_HOME: claudeHome,
        CODEX_HOME: codexHome,
        EFFECTIVE_FLOW_TEST_ARCHIVE: resolve(archive),
        EFFECTIVE_FLOW_REPO: 'example/effective-flow',
      },
    });

    const workers = sourceWorkers();
    assertSameMembers(
      readdirSync(join(claudeHome, 'agents')).filter((name) => name.endsWith('.md')),
      workers.map((name) => `${name}.md`),
      'release-installed Claude workers',
    );
    assertSameMembers(
      readdirSync(join(codexHome, 'agents')).filter((name) => name.endsWith('.toml')),
      workers.map((name) => `${name}.toml`),
      'release-installed Codex workers',
    );
    for (const [target, actual, expected] of [
      [
        'Claude',
        join(claudeHome, 'skills', 'effective-flow'),
        join(ROOT_DIR, 'dist', 'claude', 'effective-flow'),
      ],
      [
        'Codex',
        join(home, '.agents', 'skills', 'effective-flow'),
        join(ROOT_DIR, 'dist', 'codex', 'effective-flow'),
      ],
    ]) {
      if (JSON.stringify(snapshotTree(actual)) !== JSON.stringify(snapshotTree(expected))) {
        fail(`release-installed ${target} skill differs from the built distribution`);
      }
    }
    if (readdirSync(join(home, '.agents', 'skills', 'effective-flow')).includes('workers')) {
      fail('direct installer selected the portable manager artifact for Codex');
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function parseJson(output, label) {
  try {
    return JSON.parse(output);
  } catch {
    fail(`${label} did not emit JSON:\n${output}`);
  }
}

function runDaloSmoke(delivery) {
  if (run('dalo', ['--version']) !== 'dalo 0.8.2') {
    fail('manager smoke requires exactly dalo 0.8.2');
  }
  const temp = mkdtempSync(join(tmpdir(), 'effective-flow-dalo-smoke-'));
  try {
    const repo = join(temp, 'delivery');
    cpSync(delivery, repo, { recursive: true });
    run('git', ['init', '-q'], { cwd: repo });
    run('git', ['config', 'user.name', 'Effective Flow smoke'], { cwd: repo });
    run('git', ['config', 'user.email', 'smoke@example.invalid'], { cwd: repo });
    run('git', ['add', '-A'], { cwd: repo });
    run('git', ['commit', '-qm', 'test fixture'], { cwd: repo });

    const store = join(temp, 'store');
    const home = join(temp, 'home');
    const claudeConfig = join(home, '.claude');
    mkdirSync(join(claudeConfig, 'skills'), { recursive: true });
    mkdirSync(join(home, '.agents', 'skills'), { recursive: true });
    const env = {
      HOME: home,
      CLAUDE_CONFIG_DIR: claudeConfig,
      CODEX_HOME: join(home, '.codex'),
    };

    // Mirror every command in the documented DALO quick start. The catalog URL
    // is replaced with a local Git fixture so the smoke remains deterministic;
    // command names, source/slot IDs, target IDs, and ordering stay identical.
    run('dalo', ['--store', store, '--json', 'init'], { env });
    run('dalo', ['--store', store, '--json', 'target', 'link', 'claude'], { env });
    run('dalo', ['--store', store, '--json', 'target', 'link', 'codex'], { env });
    run(
      'dalo',
      ['--store', store, '--json', 'source', 'add-catalog', 'effective-flow', `file://${repo}`],
      { env },
    );
    const inspected = parseJson(
      run('dalo', ['--store', store, '--json', 'source', 'inspect', 'effective-flow'], { env }),
      'dalo source inspect',
    );
    const candidates = inspected.candidates ?? inspected.skills ?? [];
    if (candidates.length !== 1) fail(`DALO discovered ${candidates.length} skill candidates`);
    const candidate = candidates[0];
    const slot = candidate.slot_name ?? candidate.slot ?? candidate.name;
    if (slot !== 'effective-flow' || candidate.path !== 'effective-flow') {
      fail(`unexpected DALO candidate: ${JSON.stringify(candidate)}`);
    }
    run(
      'dalo',
      ['--store', store, '--json', 'source', 'select', 'effective-flow', 'effective-flow'],
      { env },
    );
    run(
      'dalo',
      [
        '--store',
        store,
        '--json',
        'approve',
        'skill',
        'effective-flow:effective-flow',
        '--accept-risk',
        'Effective Flow intentionally manages project configuration and automation.',
      ],
      { env },
    );
    run('dalo', ['--store', store, '--json', 'sync'], { env });

    const expected = snapshotTree(join(delivery, 'effective-flow'));
    for (const [target, installed] of [
      ['claude', join(claudeConfig, 'skills', 'effective-flow')],
      ['codex', join(home, '.agents', 'skills', 'effective-flow')],
    ]) {
      const actual = snapshotTree(realpathSync(installed));
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        fail(`DALO ${target} install differs from portable source`);
      }
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function runSkillsCliSmoke(delivery) {
  const version = run('pnpm', ['dlx', 'skills@1.5.19', '--version']);
  if (!version.includes('1.5.19')) fail(`unexpected Skills CLI version: ${version}`);

  const expected = snapshotTree(join(delivery, 'effective-flow'));
  const fixture = mkdtempSync(join(tmpdir(), 'effective-flow-skills-sources-'));
  try {
    const repository = join(fixture, 'repository');
    cpSync(delivery, repository, { recursive: true });
    run('git', ['init', '-q'], { cwd: repository });
    run('git', ['config', 'user.name', 'Effective Flow smoke'], { cwd: repository });
    run('git', ['config', 'user.email', 'smoke@example.invalid'], { cwd: repository });
    run('git', ['add', '-A'], { cwd: repository });
    run('git', ['commit', '-qm', 'test fixture'], { cwd: repository });

    for (const [sourceKind, source] of [
      ['directory', resolve(delivery)],
      ['repository', `file://${repository}`],
    ]) {
      for (const agent of ['claude-code', 'codex']) {
        const temp = mkdtempSync(join(tmpdir(), `effective-flow-skills-${sourceKind}-${agent}-`));
        const home = join(temp, 'home');
        const claudeConfig = join(temp, 'claude');
        mkdirSync(home, { recursive: true });
        mkdirSync(claudeConfig, { recursive: true });
        mkdirSync(join(temp, 'codex'), { recursive: true });
        run(
          'pnpm',
          [
            'dlx',
            'skills@1.5.19',
            'add',
            source,
            '--agent',
            agent,
            '--skill',
            'effective-flow',
            '--global',
            '--yes',
            '--copy',
          ],
          {
            env: {
              HOME: home,
              CLAUDE_CONFIG_DIR: claudeConfig,
              CODEX_HOME: join(temp, 'codex'),
              npm_config_cache: join(temp, 'npm-cache'),
            },
          },
        );
        const installed =
          agent === 'claude-code'
            ? join(claudeConfig, 'skills', 'effective-flow')
            : join(home, '.agents', 'skills', 'effective-flow');
        const actual = snapshotTree(installed);
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          fail(`${sourceKind} ${agent} manager install differs from portable source`);
        }
        rmSync(temp, { recursive: true, force: true });
      }
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

function assertStageDeliveryChecksTransformedDocs(dist, temp) {
  const fixtureRoot = join(temp, 'delivery-doc-guard-source');
  mkdirSync(join(fixtureRoot, 'dist', 'portable'), { recursive: true });
  cpSync(
    join(dist, 'portable', 'effective-flow'),
    join(fixtureRoot, 'dist', 'portable', 'effective-flow'),
    { recursive: true },
  );
  cpSync(join(ROOT_DIR, 'LICENSE'), join(fixtureRoot, 'LICENSE'));
  writeFileSync(
    join(fixtureRoot, 'README.md'),
    '# Guard fixture\n\nEdit `.effective-flow/config.json` to configure the skill.\n',
  );
  mkdirSync(join(fixtureRoot, 'docs'), { recursive: true });
  cpSync(join(ROOT_DIR, 'docs', 'user-guide'), join(fixtureRoot, 'docs', 'user-guide'), {
    recursive: true,
  });
  cpSync(join(ROOT_DIR, 'renovate.json'), join(fixtureRoot, 'renovate.json'));
  for (const path of TRUSTED_AUTOMATION) {
    const target = join(fixtureRoot, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(ROOT_DIR, path), target);
  }

  const staged = join(temp, 'delivery-doc-guard-staged');
  let rejection;
  try {
    stageDelivery(staged, 'sebastian-software/effective-flow', 'develop', {
      root: fixtureRoot,
    });
  } catch (error) {
    rejection = error;
  }
  if (!rejection) fail('stageDelivery accepted a retired operational config reference');
  if (!rejection.message.includes('README.md:3: retired-config-outside-migration')) {
    fail(`stageDelivery config-guard diagnostic was not actionable:\n${rejection.message}`);
  }
  if (!readFileSync(join(staged, 'README.md'), 'utf8').includes('effective-flow:delivery-footer')) {
    fail('stageDelivery config guard did not evaluate the transformed documentation payload');
  }
}

function offlineSmoke() {
  run(process.execPath, ['build.mjs']);
  const dist = join(ROOT_DIR, 'dist');
  assertBuiltLayout(dist);

  const temp = mkdtempSync(join(tmpdir(), 'effective-flow-distribution-smoke-'));
  try {
    const delivery = join(temp, 'delivery');
    cpSync(join(ROOT_DIR, 'docs'), join(delivery, 'old-docs'), { recursive: true });
    writeFileSync(join(delivery, 'LICENSE'), 'stale managed license\n');
    for (const path of TRUSTED_AUTOMATION) {
      const stale = join(delivery, path);
      mkdirSync(dirname(stale), { recursive: true });
      writeFileSync(stale, 'stale managed automation\n');
    }
    stageDelivery(delivery, 'sebastian-software/effective-flow', 'develop');
    assertDeliveryLayout(delivery, join(dist, 'portable', 'effective-flow'));
    assertStageDeliveryChecksTransformedDocs(dist, temp);

    const archive = join(temp, 'effective-flow-test.tar.gz');
    run('tar', ['-czf', archive, '-C', dist, '.']);
    assertArchiveLayout(archive);
    runReleaseInstallerSmoke(archive);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function managersSmoke(target) {
  let fixture;
  let delivery;
  let portableSkill;

  if (target) {
    delivery = resolve(target);
  } else {
    run(process.execPath, ['build.mjs']);
    fixture = mkdtempSync(join(tmpdir(), 'effective-flow-manager-delivery-'));
    delivery = join(fixture, 'delivery');
    portableSkill = join(ROOT_DIR, 'dist', 'portable', 'effective-flow');
    stageDelivery(delivery, 'sebastian-software/effective-flow', 'develop');
  }

  try {
    assertDeliveryLayout(delivery, portableSkill);
    runDaloSmoke(delivery);
    runSkillsCliSmoke(delivery);
  } finally {
    if (fixture) rmSync(fixture, { recursive: true, force: true });
  }
}

const [mode = 'offline', target] = process.argv.slice(2);
try {
  if (mode === 'offline') offlineSmoke();
  else if (mode === 'archive' && target) assertArchiveLayout(target);
  else if (mode === 'delivery' && target) assertDeliveryLayout(target);
  else if (mode === 'managers') managersSmoke(target);
  else
    fail(
      'usage: distribution-smoke.mjs [offline|archive <tar.gz>|delivery <dir>|managers [<dir>]]',
    );
  console.log(`distribution-smoke: ${mode} checks passed`);
} catch (error) {
  console.error(`distribution-smoke: ${error.message}`);
  process.exit(1);
}
