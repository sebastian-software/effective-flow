#!/usr/bin/env node

// Proves that a change leaves the native agent sidecars it did not mean to touch
// byte-identical:
//   node scripts/compare-native-agent-baseline.mjs --base <commit>
// builds <commit>, which must be an ancestor of HEAD, and a copy of the working
// tree (tracked plus untracked, non-ignored files) into temporary output roots.
// Every base worker in the working native inventory must then build the same
// Claude and Codex sidecar bytes as at <commit>, except a worker whose source
// inputs (its agent file plus transitive eager includes) differ between the two
// checkouts: that one is exempt and named in the report instead. Importing the
// module runs nothing; main runs only when the file is executed directly.

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  EAGER_INCLUDE_RE,
  normalizeLineEndings,
  parseNativeAgentInventory,
  reconcileNativeAgentInventories,
} from '../build-lib.mjs';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const WORKER_PREFIX = 'effective-flow-';

// The source inputs of one native agent: its `src/agents/<name>.md` plus every
// `src/shared/<fragment>.md` it reaches through eager ```include fences,
// transitively. Only eager includes inline content into an agent; a
// ```lazy-include fence renders as a fixed load pointer, so its target is not
// an input. `readSourceFile(relativePath)` returns the file's bytes, or null
// when it does not exist; a missing file stays in the set as a null entry so a
// membership difference is still visible. Returns a Map sorted by path.
export function collectAgentSourceInputs(agentName, readSourceFile) {
  const inputs = new Map();
  const pending = [`src/agents/${agentName}.md`];
  while (pending.length > 0) {
    const relativePath = pending.shift();
    if (inputs.has(relativePath)) continue;
    const bytes = readSourceFile(relativePath);
    inputs.set(relativePath, bytes);
    if (bytes === null) continue;
    for (const match of normalizeLineEndings(bytes.toString('utf8')).matchAll(EAGER_INCLUDE_RE)) {
      const name = match[1].trim();
      if (name) pending.push(`src/shared/${name}.md`);
    }
  }
  return new Map([...inputs].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)));
}

// True when two source-input sets differ in membership or in any file's bytes.
export function sourceInputsChanged(baseInputs, workingInputs) {
  const paths = new Set([...baseInputs.keys(), ...workingInputs.keys()]);
  for (const path of paths) {
    if (!baseInputs.has(path) || !workingInputs.has(path)) return true;
    const base = baseInputs.get(path);
    const working = workingInputs.get(path);
    if (base === null || working === null) {
      if (base !== working) return true;
    } else if (!base.equals(working)) {
      return true;
    }
  }
  return false;
}

// The base workers whose source inputs changed between the two checkouts,
// sorted. These are exempt from the byte comparison; every other base worker
// must still build byte-identically.
export function sourceChangedWorkers(workers, readBaseFile, readWorkingFile) {
  return workers
    .filter((worker) => {
      if (!worker.startsWith(WORKER_PREFIX)) {
        throw new Error(`Native base worker "${worker}" lacks the ${WORKER_PREFIX} prefix`);
      }
      const agentName = worker.slice(WORKER_PREFIX.length);
      return sourceInputsChanged(
        collectAgentSourceInputs(agentName, readBaseFile),
        collectAgentSourceInputs(agentName, readWorkingFile),
      );
    })
    .sort();
}

function checkoutReader(checkout) {
  return (relativePath) => {
    const path = join(checkout, relativePath);
    return existsSync(path) ? readFileSync(path) : null;
  };
}

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

function assertSameFile(left, right) {
  if (!readFileSync(left).equals(readFileSync(right))) {
    throw new Error(`Base native artifact drift: ${right}`);
  }
}

function compareBaseline(baseOutput, workingOutput, { baselineCheckout, workingCheckout }) {
  const claude = inventory(workingOutput, 'claude');
  const codex = inventory(workingOutput, 'codex');
  const claudeDir = join(workingOutput, 'dist', 'claude', 'agents');
  const codexDir = join(workingOutput, 'dist', 'codex', 'agents');
  reconcileNativeAgentInventories(claude, codex, {
    claudeArtifacts: readdirSync(claudeDir),
    codexArtifacts: readdirSync(codexDir),
    context: 'working-tree native distribution',
  });
  const exempt = sourceChangedWorkers(
    claude.baseWorkers,
    checkoutReader(baselineCheckout),
    checkoutReader(workingCheckout),
  );
  const exemptSet = new Set(exempt);

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
    for (const worker of claude.baseWorkers) {
      // A source-changed worker is deliberately not byte-compared; the report names every
      // exemption, and the baseline-proof test pins that line so an unexpected one fails it.
      if (exemptSet.has(worker)) continue;
      const file = `${worker}.${extension}`;
      assertSameFile(join(baselineDir, file), join(workingDir, file));
    }
  }

  if (
    existsSync(
      join(workingOutput, 'dist', 'portable', 'effective-flow', 'native-agent-inventory.json'),
    )
  ) {
    throw new Error('Portable output unexpectedly contains a native agent inventory');
  }
  return exempt;
}

export function formatBaselineReport(base, exempt) {
  let report = `Native base agents match ${base}\n`;
  if (exempt.length > 0) {
    report += `Source-changed since ${base} (not compared): ${exempt.join(', ')}\n`;
  }
  return report;
}

function main(args) {
  if (args.length !== 2 || args[0] !== '--base' || !args[1]) {
    throw new Error('usage: compare-native-agent-baseline.mjs --base <commit>');
  }
  const base = args[1];
  run('git', ['rev-parse', '--verify', `${base}^{commit}`]);
  run('git', ['merge-base', '--is-ancestor', base, 'HEAD']);

  let exempt;
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
    exempt = compareBaseline(baselineOutput, workingOutput, { baselineCheckout, workingCheckout });
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  process.stdout.write(formatBaselineReport(base, exempt));
}

function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
