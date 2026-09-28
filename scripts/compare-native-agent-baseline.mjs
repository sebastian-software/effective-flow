#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseNativeAgentInventory, reconcileNativeAgentInventories } from '../build-lib.mjs';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

function run(command, args, { cwd = ROOT_DIR, env, encoding = 'utf8' } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    const stdout = result.stdout?.toString?.() ?? '';
    const stderr = result.stderr?.toString?.() ?? '';
    throw new Error(`${command} ${args.join(' ')} failed\n${stdout}${stderr}`);
  }
  return result.stdout;
}

function copyWorkingTree(destination) {
  mkdirSync(destination, { recursive: true });
  const tracked = run('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    encoding: 'buffer',
  });
  for (const relativePath of tracked.toString('utf8').split('\0').filter(Boolean)) {
    const target = join(destination, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(ROOT_DIR, relativePath), target, { dereference: false });
  }
}

function build(checkout, outputRoot) {
  run(process.execPath, ['build.mjs'], {
    cwd: checkout,
    env: {
      EFFECTIVE_FLOW_BUILD_GIT_HASH: 'baseline-proof',
      EFFECTIVE_FLOW_BUILD_OUTPUT_ROOT: outputRoot,
    },
  });
}

function inventory(outputRoot, harness) {
  return parseNativeAgentInventory(
    readFileSync(
      join(outputRoot, 'dist', harness, 'effective-flow', 'native-agent-inventory.json'),
      'utf8',
    ),
    { context: `${harness} baseline comparison inventory` },
  );
}

// The proof compares native CONFIGURATION only, never the rendered prompt body. It exists to
// show that execution-profile rendering leaves every Quality base worker's harness configuration
// unchanged. Body prose comes largely from shared include fragments, and a golden byte-for-byte
// comparison would make every legitimate shared-fragment edit churn this unrelated proof — the
// native-profile-rendering plan warns against exactly such fixtures. Both parsers below fail
// closed: a sidecar shape they do not recognize is an error, never a silently skipped key.

function configError(file, message) {
  return new Error(`Unparseable native sidecar ${file}: ${message}`);
}

function setConfigKey(config, key, value, file) {
  if (Object.hasOwn(config, key)) throw configError(file, `duplicate key "${key}"`);
  config[key] = value;
}

// Claude sidecar: `---` frontmatter of `key: value` lines; the body after the closing `---`
// is excluded from the comparison.
function parseClaudeSidecarConfig(content, file) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
  if (!match) throw configError(file, 'missing or unterminated frontmatter');
  const config = Object.create(null);
  for (const line of match[1].split('\n')) {
    const entry = /^([A-Za-z_][\w-]*):(?: (.*))?$/.exec(line);
    if (!entry) throw configError(file, `unrecognized frontmatter line ${JSON.stringify(line)}`);
    let value = entry[2] ?? '';
    if (value.startsWith('"')) {
      if (value.length < 2 || !value.endsWith('"')) {
        throw configError(file, `unterminated quoted value for "${entry[1]}"`);
      }
      value = value.slice(1, -1).replace(/\\"/g, '"');
    }
    setConfigKey(config, entry[1], value, file);
  }
  if (Object.keys(config).length === 0) throw configError(file, 'empty frontmatter');
  return config;
}

const PROMPT_BODY_KEY = 'developer_instructions';

// Codex sidecar: the minimal TOML subset build.mjs emits — top-level `key = value` lines with a
// basic string (JSON-compatible, as `tomlString` writes it), a literal string, a boolean, or a
// number, plus the `developer_instructions = '''…'''` multiline literal prompt body. Only the
// presence of that body is compared, never its text.
function parseCodexSidecarConfig(content, file) {
  const config = Object.create(null);
  const lines = content.split('\n');
  if (lines.at(-1) === '') lines.pop();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') continue;
    const entry = /^([A-Za-z_][\w-]*) = (.*)$/.exec(line);
    if (!entry) throw configError(file, `unrecognized line ${JSON.stringify(line)}`);
    const [, key, raw] = entry;
    let value;
    if (raw.startsWith("'''")) {
      const rest = [raw.slice(3), ...lines.slice(index + 1)].join('\n');
      const end = rest.indexOf("'''");
      if (end === -1) throw configError(file, `unterminated multiline string for "${key}"`);
      const consumed = rest.slice(0, end + 3).split('\n').length - 1;
      const trailing = rest.slice(end + 3).split('\n')[0];
      if (trailing.trim() !== '') {
        throw configError(file, `unexpected text after multiline string for "${key}"`);
      }
      value = rest.slice(0, end).replace(/^\n/, '');
      index += consumed;
    } else if (raw.startsWith('"')) {
      try {
        value = JSON.parse(raw);
      } catch {
        throw configError(file, `invalid basic string for "${key}"`);
      }
    } else if (/^'[^'\n]*'$/.test(raw)) {
      value = raw.slice(1, -1);
    } else if (/^(?:true|false|[+-]?\d+(?:\.\d+)?)$/.test(raw)) {
      value = raw;
    } else {
      throw configError(file, `unrecognized value for "${key}"`);
    }
    setConfigKey(config, key, value, file);
  }
  if (!Object.hasOwn(config, PROMPT_BODY_KEY)) {
    throw configError(file, `missing "${PROMPT_BODY_KEY}"`);
  }
  config[PROMPT_BODY_KEY] = '<prompt body excluded>';
  return config;
}

const CONFIG_PARSERS = {
  claude: parseClaudeSidecarConfig,
  codex: parseCodexSidecarConfig,
};

function assertSameConfiguration(harness, file, baselinePath, workingPath) {
  const parse = CONFIG_PARSERS[harness];
  const baseline = parse(readFileSync(baselinePath, 'utf8'), baselinePath);
  const working = parse(readFileSync(workingPath, 'utf8'), workingPath);
  const keys = [...new Set([...Object.keys(baseline), ...Object.keys(working)])].sort();
  for (const key of keys) {
    const before = Object.hasOwn(baseline, key) ? JSON.stringify(baseline[key]) : '<absent>';
    const after = Object.hasOwn(working, key) ? JSON.stringify(working[key]) : '<absent>';
    if (before !== after) {
      throw new Error(
        `Base native configuration drift: ${harness} ${file} key "${key}": ${before} -> ${after}`,
      );
    }
  }
}

function compareBaseline(baseOutput, workingOutput) {
  const claude = inventory(workingOutput, 'claude');
  const codex = inventory(workingOutput, 'codex');
  const claudeDir = join(workingOutput, 'dist', 'claude', 'agents');
  const codexDir = join(workingOutput, 'dist', 'codex', 'agents');
  reconcileNativeAgentInventories(claude, codex, {
    claudeArtifacts: readdirSync(claudeDir),
    codexArtifacts: readdirSync(codexDir),
    context: 'working-tree native distribution',
  });

  for (const [harness, extension] of [
    ['claude', 'md'],
    ['codex', 'toml'],
  ]) {
    const baselineDir = join(baseOutput, 'dist', harness, 'agents');
    const workingDir = join(workingOutput, 'dist', harness, 'agents');
    const baselineFiles = readdirSync(baselineDir).sort();
    const expectedBaseFiles = claude.baseWorkers.map((worker) => `${worker}.${extension}`).sort();
    if (JSON.stringify(baselineFiles) !== JSON.stringify(expectedBaseFiles)) {
      throw new Error(`${harness} baseline worker membership differs from the working inventory`);
    }
    for (const file of baselineFiles) {
      assertSameConfiguration(harness, file, join(baselineDir, file), join(workingDir, file));
    }
  }

  if (
    existsSync(
      join(workingOutput, 'dist', 'portable', 'effective-flow', 'native-agent-inventory.json'),
    )
  ) {
    throw new Error('Portable output unexpectedly contains a native agent inventory');
  }
}

function main(args) {
  if (args.length !== 2 || args[0] !== '--base' || !args[1]) {
    throw new Error('usage: compare-native-agent-baseline.mjs --base <commit>');
  }
  const base = args[1];
  run('git', ['rev-parse', '--verify', `${base}^{commit}`]);
  run('git', ['merge-base', '--is-ancestor', base, 'HEAD']);

  const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-native-baseline-'));
  try {
    const baselineCheckout = join(temporary, 'baseline');
    const workingCheckout = join(temporary, 'working');
    const baselineOutput = join(temporary, 'baseline-output');
    const workingOutput = join(temporary, 'working-output');
    run('git', ['clone', '--quiet', '--no-hardlinks', '--no-checkout', ROOT_DIR, baselineCheckout]);
    run('git', ['checkout', '--quiet', '--detach', base], { cwd: baselineCheckout });
    copyWorkingTree(workingCheckout);
    build(baselineCheckout, baselineOutput);
    build(workingCheckout, workingOutput);
    compareBaseline(baselineOutput, workingOutput);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  process.stdout.write(`Native base agents match ${base}\n`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
