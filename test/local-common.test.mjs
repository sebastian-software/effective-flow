import {
  appendFile,
  lstat,
  mkdtemp,
  mkdir,
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

function runShell(script, env) {
  return spawnSync('/bin/sh', ['-c', script], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function isolatedEnvironment(root, mode, distRoot) {
  return {
    HOME: join(root, 'home'),
    CLAUDE_HOME: join(root, 'claude'),
    CODEX_HOME: join(root, 'codex'),
    DIST_ROOT: distRoot,
    INSTALL_MODE: mode,
    ROOT_DIR,
  };
}

async function createNativeDistribution(root, workers = ['alpha', 'beta']) {
  const distRoot = join(root, 'dist');
  const claudeSkill = join(distRoot, 'claude/effective-flow');
  const codexSkill = join(distRoot, 'codex/effective-flow');
  const claudeAgents = join(distRoot, 'claude/agents');
  const codexAgents = join(distRoot, 'codex/agents');
  await Promise.all([
    mkdir(join(claudeSkill, 'tools'), { recursive: true }),
    mkdir(join(codexSkill, 'tools'), { recursive: true }),
    mkdir(claudeAgents, { recursive: true }),
    mkdir(codexAgents, { recursive: true }),
  ]);
  const router = '# Effective Flow\n\nEffective Flow (version 9.8.7 (abc1234)).\n';
  const references = workers.map((worker) => `\`effective-flow-${worker}\``).join('\n');
  await Promise.all([
    writeFile(join(claudeSkill, 'SKILL.md'), router),
    writeFile(join(codexSkill, 'SKILL.md'), router),
    writeFile(join(claudeSkill, 'tools/run.md'), references),
    writeFile(join(codexSkill, 'tools/run.md'), references),
  ]);
  for (const worker of workers) {
    const name = `effective-flow-${worker}`;
    await Promise.all([
      writeFile(join(claudeAgents, `${name}.md`), `---\nname: ${name}\n---\nClaude ${worker}\n`),
      writeFile(
        join(codexAgents, `${name}.toml`),
        `name = "${name}"\ndescription = "Codex ${worker}"\n`,
      ),
    ]);
  }
  return distRoot;
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

async function assertNativeReferencesResolve(distRoot, installRoot) {
  for (const [harness, extension, installedDir] of [
    ['claude', 'md', join(installRoot, 'claude/agents')],
    ['codex', 'toml', join(installRoot, 'codex/agents')],
  ]) {
    const tool = await readFile(join(distRoot, `${harness}/effective-flow/tools/run.md`), 'utf8');
    const references = [...tool.matchAll(/`(effective-flow-[a-z0-9-]+)`/g)].map(
      (match) => match[1],
    );
    assert.ok(references.length > 0, `${harness} fixture should contain worker references`);
    for (const reference of references) {
      assert.equal(
        await pathExists(join(installedDir, `${reference}.${extension}`)),
        true,
        `${harness} should resolve ${reference} by its exact installed name`,
      );
    }
  }
}

test('copy and link install both native agent sets and report their discovery locations', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-native-install-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const distRoot = await createNativeDistribution(sandbox);

  for (const [mode, heading] of [
    ['copy', 'Deployed effective-flow skill to:'],
    ['link', 'Linked effective-flow skill to:'],
  ]) {
    await t.test(mode, async () => {
      const installRoot = join(sandbox, mode);
      const env = isolatedEnvironment(installRoot, mode, distRoot);
      await Promise.all([
        mkdir(join(env.CLAUDE_HOME, 'agents'), { recursive: true }),
        mkdir(join(env.CODEX_HOME, 'agents'), { recursive: true }),
        mkdir(join(env.CLAUDE_HOME, 'skills/firmo'), { recursive: true }),
        mkdir(join(env.CLAUDE_HOME, 'skills/sf-build'), { recursive: true }),
        mkdir(join(env.CLAUDE_HOME, 'skills/firmo-foreign'), { recursive: true }),
        mkdir(join(env.CLAUDE_HOME, 'skills/sf-foreign'), { recursive: true }),
        mkdir(join(env.HOME, '.agents/skills/sf-plan'), { recursive: true }),
        mkdir(join(env.HOME, '.agents/skills/sf-foreign'), { recursive: true }),
        mkdir(join(env.CODEX_HOME, 'skills/sf-review'), { recursive: true }),
        mkdir(join(env.CODEX_HOME, 'skills/sf-foreign'), { recursive: true }),
      ]);
      await Promise.all([
        writeFile(join(env.CLAUDE_HOME, 'agents/foreign.md'), 'keep'),
        writeFile(join(env.CLAUDE_HOME, 'agents/firmographics.md'), 'keep'),
        writeFile(join(env.CLAUDE_HOME, 'agents/firmo-foreign.md'), 'keep'),
        writeFile(join(env.CLAUDE_HOME, 'agents/sf-foreign.md'), 'keep'),
        writeFile(join(env.CLAUDE_HOME, 'agents/firmo-code-validator.md'), 'retired'),
        writeFile(join(env.CLAUDE_HOME, 'agents/sf-code-validator.md'), 'retired'),
        writeFile(
          join(env.CLAUDE_HOME, 'agents/effective-flow-marketing-writer.md'),
          'stale pre-manifest install',
        ),
        writeFile(join(env.CODEX_HOME, 'agents/foreign.toml'), 'keep'),
        writeFile(join(env.CODEX_HOME, 'agents/firmographics.toml'), 'keep'),
        writeFile(join(env.CODEX_HOME, 'agents/firmo-foreign.toml'), 'keep'),
        writeFile(join(env.CODEX_HOME, 'agents/sf-foreign.toml'), 'keep'),
        writeFile(join(env.CODEX_HOME, 'agents/firmo-code-validator.toml'), 'retired'),
        writeFile(join(env.CODEX_HOME, 'agents/sf-code-validator.toml'), 'retired'),
        writeFile(
          join(env.CODEX_HOME, 'agents/effective-flow-marketing-writer.toml'),
          'stale pre-manifest install',
        ),
      ]);

      const result = runShell(
        `. "$ROOT_DIR/local-common.sh"; effective_flow_deploy_from_dist`,
        env,
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trimEnd().split('\n')[0], 'effective-flow 9.8.7 (abc1234)');
      assert.equal(result.stdout.trimEnd().split('\n')[1], heading);
      assert.match(result.stdout, /Claude Code: .*\/agents\/effective-flow-\*\.md/);
      assert.match(result.stdout, /Codex: .*\/agents\/effective-flow-\*\.toml/);

      await assertNativeReferencesResolve(distRoot, installRoot);
      for (const path of [
        join(env.CLAUDE_HOME, 'agents/foreign.md'),
        join(env.CLAUDE_HOME, 'agents/firmographics.md'),
        join(env.CLAUDE_HOME, 'agents/firmo-foreign.md'),
        join(env.CLAUDE_HOME, 'agents/sf-foreign.md'),
        join(env.CODEX_HOME, 'agents/foreign.toml'),
        join(env.CODEX_HOME, 'agents/firmographics.toml'),
        join(env.CODEX_HOME, 'agents/firmo-foreign.toml'),
        join(env.CODEX_HOME, 'agents/sf-foreign.toml'),
        join(env.CLAUDE_HOME, 'skills/firmo-foreign'),
        join(env.CLAUDE_HOME, 'skills/sf-foreign'),
        join(env.HOME, '.agents/skills/sf-foreign'),
        join(env.CODEX_HOME, 'skills/sf-foreign'),
      ]) {
        assert.equal(await pathExists(path), true, `foreign neighbor should survive: ${path}`);
      }
      for (const retired of [
        join(env.CLAUDE_HOME, 'skills/firmo'),
        join(env.CLAUDE_HOME, 'skills/sf-build'),
        join(env.HOME, '.agents/skills/sf-plan'),
        join(env.CODEX_HOME, 'skills/sf-review'),
        join(env.CLAUDE_HOME, 'agents/firmo-code-validator.md'),
        join(env.CLAUDE_HOME, 'agents/sf-code-validator.md'),
        join(env.CLAUDE_HOME, 'agents/effective-flow-marketing-writer.md'),
        join(env.CODEX_HOME, 'agents/firmo-code-validator.toml'),
        join(env.CODEX_HOME, 'agents/sf-code-validator.toml'),
        join(env.CODEX_HOME, 'agents/effective-flow-marketing-writer.toml'),
      ]) {
        assert.equal(
          await pathExists(retired),
          false,
          `known retired entry should be removed: ${retired}`,
        );
      }

      for (const [path, expectedLink] of [
        [join(env.CLAUDE_HOME, 'skills/effective-flow'), mode === 'link'],
        [join(env.CLAUDE_HOME, 'agents/effective-flow-alpha.md'), mode === 'link'],
        [join(env.CODEX_HOME, 'agents/effective-flow-alpha.toml'), mode === 'link'],
      ]) {
        assert.equal((await lstat(path)).isSymbolicLink(), expectedLink, path);
      }
      assert.equal(
        await readFile(join(env.CLAUDE_HOME, 'agents/.effective-flow-agents.manifest'), 'utf8'),
        'effective-flow-alpha.md\neffective-flow-beta.md\n',
      );
      assert.equal(
        await readFile(join(env.CODEX_HOME, 'agents/.effective-flow-agents.manifest'), 'utf8'),
        'effective-flow-alpha.toml\neffective-flow-beta.toml\n',
      );
    });
  }
});

test('repeated installs remove only manifest-owned stale agents, including broken links', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-native-reinstall-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  for (const mode of ['copy', 'link']) {
    await t.test(mode, async () => {
      const firstDist = await createNativeDistribution(join(sandbox, mode, 'first'), [
        'alpha',
        'beta',
      ]);
      const secondDist = await createNativeDistribution(join(sandbox, mode, 'second'), [
        'alpha',
        'gamma',
      ]);
      const installRoot = join(sandbox, mode, 'install');
      const firstEnv = isolatedEnvironment(installRoot, mode, firstDist);
      const first = runShell(
        `. "$ROOT_DIR/local-common.sh"; effective_flow_deploy_from_dist`,
        firstEnv,
      );
      assert.equal(first.status, 0, first.stderr);

      const claudeManifest = join(firstEnv.CLAUDE_HOME, 'agents/.effective-flow-agents.manifest');
      const codexManifest = join(firstEnv.CODEX_HOME, 'agents/.effective-flow-agents.manifest');
      await Promise.all([
        writeFile(join(firstEnv.CLAUDE_HOME, 'agents/effective-flow-neighbor.md'), 'foreign'),
        writeFile(join(firstEnv.CODEX_HOME, 'agents/effective-flow-neighbor.toml'), 'foreign'),
        appendFile(claudeManifest, '../outside.md\nforeign.md\n'),
        appendFile(codexManifest, '../outside.toml\nforeign.toml\n'),
        writeFile(join(firstEnv.CLAUDE_HOME, 'agents/foreign.md'), 'keep'),
        writeFile(join(firstEnv.CODEX_HOME, 'agents/foreign.toml'), 'keep'),
      ]);
      if (mode === 'link') {
        await Promise.all([
          rm(join(firstDist, 'claude/agents/effective-flow-beta.md')),
          rm(join(firstDist, 'codex/agents/effective-flow-beta.toml')),
        ]);
        assert.equal(
          await pathExists(join(firstEnv.CLAUDE_HOME, 'agents/effective-flow-beta.md')),
          true,
          'lstat-based helper should observe the broken owned link',
        );
      }

      const secondEnv = isolatedEnvironment(installRoot, mode, secondDist);
      const second = runShell(
        `. "$ROOT_DIR/local-common.sh"; effective_flow_deploy_from_dist`,
        secondEnv,
      );
      assert.equal(second.status, 0, second.stderr);
      const third = runShell(
        `. "$ROOT_DIR/local-common.sh"; effective_flow_deploy_from_dist`,
        secondEnv,
      );
      assert.equal(third.status, 0, third.stderr);

      for (const stale of [
        join(firstEnv.CLAUDE_HOME, 'agents/effective-flow-beta.md'),
        join(firstEnv.CODEX_HOME, 'agents/effective-flow-beta.toml'),
      ]) {
        assert.equal(
          await pathExists(stale),
          false,
          `owned stale entry should be removed: ${stale}`,
        );
      }
      for (const preserved of [
        join(firstEnv.CLAUDE_HOME, 'agents/effective-flow-neighbor.md'),
        join(firstEnv.CODEX_HOME, 'agents/effective-flow-neighbor.toml'),
        join(firstEnv.CLAUDE_HOME, 'agents/foreign.md'),
        join(firstEnv.CODEX_HOME, 'agents/foreign.toml'),
      ]) {
        assert.equal(
          await pathExists(preserved),
          true,
          `unowned entry should survive: ${preserved}`,
        );
      }
      await assertNativeReferencesResolve(secondDist, installRoot);
      assert.equal(
        await readFile(claudeManifest, 'utf8'),
        'effective-flow-alpha.md\neffective-flow-gamma.md\n',
      );
      assert.equal(
        await readFile(codexManifest, 'utf8'),
        'effective-flow-alpha.toml\neffective-flow-gamma.toml\n',
      );
    });
  }
});

test('copy and link preserve parent skill-directory symlinks', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-parent-links-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const distRoot = await createNativeDistribution(sandbox, ['alpha']);

  for (const mode of ['copy', 'link']) {
    await t.test(mode, async () => {
      const installRoot = join(sandbox, mode);
      const env = isolatedEnvironment(installRoot, mode, distRoot);
      const externalClaude = join(sandbox, `${mode}-external-claude-skills`);
      const externalCodex = join(sandbox, `${mode}-external-codex-skills`);
      await Promise.all([
        mkdir(externalClaude, { recursive: true }),
        mkdir(externalCodex, { recursive: true }),
        mkdir(env.CLAUDE_HOME, { recursive: true }),
        mkdir(join(env.HOME, '.agents'), { recursive: true }),
      ]);
      await Promise.all([
        symlink(externalClaude, join(env.CLAUDE_HOME, 'skills')),
        symlink(externalCodex, join(env.HOME, '.agents/skills')),
      ]);

      const result = runShell(
        `. "$ROOT_DIR/local-common.sh"; effective_flow_deploy_from_dist`,
        env,
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal((await lstat(join(env.CLAUDE_HOME, 'skills'))).isSymbolicLink(), true);
      assert.equal((await lstat(join(env.HOME, '.agents/skills'))).isSymbolicLink(), true);
      assert.equal(await readlink(join(env.CLAUDE_HOME, 'skills')), externalClaude);
      assert.equal(await readlink(join(env.HOME, '.agents/skills')), externalCodex);
      assert.equal(await pathExists(join(externalClaude, 'effective-flow/SKILL.md')), true);
      assert.equal(await pathExists(join(externalCodex, 'effective-flow/SKILL.md')), true);
    });
  }
});

test('missing or malformed native agent artifacts fail before changing installed skills', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-invalid-native-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const cases = [
    {
      name: 'missing Codex sidecar directory',
      mutate: (distRoot) => rm(join(distRoot, 'codex/agents'), { recursive: true }),
      error:
        /Native claude agent has no matching sidecar|Native codex agent distribution not found/,
    },
    {
      name: 'mismatched native sets',
      mutate: (distRoot) => rm(join(distRoot, 'codex/agents/effective-flow-beta.toml')),
      error: /has no matching sidecar/,
    },
    {
      name: 'malformed Codex metadata',
      mutate: (distRoot) =>
        writeFile(
          join(distRoot, 'codex/agents/effective-flow-alpha.toml'),
          'name = "effective-flow-wrong"\n',
        ),
      error: /name does not match its filename/,
    },
    {
      name: 'unexpected artifact name',
      mutate: (distRoot) => writeFile(join(distRoot, 'claude/agents/README.md'), 'unexpected'),
      error: /Unexpected native claude agent artifact/,
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const caseRoot = join(sandbox, entry.name.replaceAll(' ', '-'));
      const distRoot = await createNativeDistribution(caseRoot);
      await entry.mutate(distRoot);
      const installRoot = join(caseRoot, 'install');
      const env = isolatedEnvironment(installRoot, 'copy', distRoot);
      const sentinel = join(env.CLAUDE_HOME, 'skills/effective-flow/sentinel');
      await mkdir(dirname(sentinel), { recursive: true });
      await writeFile(sentinel, 'untouched');

      const result = runShell(
        `. "$ROOT_DIR/local-common.sh"; effective_flow_deploy_from_dist`,
        env,
      );
      assert.notEqual(result.status, 0, result.stdout);
      assert.match(result.stderr, entry.error);
      assert.equal(await readFile(sentinel, 'utf8'), 'untouched');
      assert.equal(
        await pathExists(join(env.CODEX_HOME, 'agents/effective-flow-alpha.toml')),
        false,
      );
    });
  }
});

test('missing and malformed routers remain non-fatal for standalone reports', async (t) => {
  const sandbox = await mkdtemp(join(tmpdir(), 'effective-flow-report-invalid-'));
  t.after(() => rm(sandbox, { recursive: true, force: true }));

  const malformedDist = join(sandbox, 'malformed-dist');
  await mkdir(join(malformedDist, 'claude/effective-flow'), { recursive: true });
  await writeFile(
    join(malformedDist, 'claude/effective-flow/SKILL.md'),
    '# Effective Flow\n\nNo canonical version marker.\n',
  );

  for (const [name, distRoot] of [
    ['missing', join(sandbox, 'missing-dist')],
    ['malformed', malformedDist],
  ]) {
    await t.test(name, () => {
      const result = runShell(`. "$ROOT_DIR/local-common.sh"; effective_flow_report`, {
        ...isolatedEnvironment(join(sandbox, name), 'copy', distRoot),
      });

      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.split('\n')[0], 'Deployed effective-flow skill to:');
      assert.doesNotMatch(result.stdout, /^effective-flow /m);
    });
  }
});
