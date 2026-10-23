#!/usr/bin/env node

// Proves that a change leaves the native agent sidecars byte-identical except for
// its declared deltas:
//   node scripts/compare-native-agent-baseline.mjs --base <commit>
// builds <commit>, which must be an ancestor of HEAD, and a copy of the working
// tree (tracked plus untracked, non-ignored files) into temporary output roots.
// Every worker in the baseline inventories (base, Fast and tier variants) must retain
// the same Claude and Codex sidecar bytes in the working build, apart from the deltas in
// EXPECTED_NATIVE_DELTAS; the report names each delta and the workers showing it.
// Importing the module runs nothing; main runs only when the file is executed
// directly.

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
  NATIVE_SIDECAR_CONFIG_PARSERS,
  assertBaselineWorkerMembership,
  parseNativeAgentInventory,
  reconcileNativeAgentInventories,
} from '../build-lib.mjs';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const WORKER_PREFIX = 'effective-flow-';

// Rendered delegation-mandate bullets the body deltas anchor on, verbatim in every worker.
const MANDATE_ANALYSIS_BULLET =
  '- For analysis, exploration, and research, orchestration-level delegation is the **default**. Work inline only under this **triviality exception**: a single known file, one lookup, or a step whose whole cost is smaller than briefing a worker. Sites that name this exception mean exactly this definition.';
const MANDATE_WORKER_BULLET =
  '- Only the workflow/tool orchestrator may start worker roles or analysis fan-out. Every named worker is a **leaf executor**: it starts no sub-agent, never re-delegates its assignment or a write, and returns missing essential context to the orchestrator instead of seeking it through child delegation. Start each worker with **zero inherited turns** when supported, otherwise the smallest host-supported history, and supply a compact, self-contained handoff with the objective; relevant artifact paths; scoped paths and ownership; execution and runtime-state roots when writes are allowed; resolved language; authority and write limits; and the completion protocol.';
const MANDATE_LAST_BULLET =
  "- This mandate covers worker roles and analysis fan-out only. Delegation from one workflow to another keeps that tool's own mechanics, including its interactive/gated path.";

// The only deltas a native worker sidecar may show against the base build; any other byte
// difference fails the proof. A delta is permitted, never required: a worker that builds
// byte-identically always passes. A configuration delta changes exactly one key line; body deltas
// compose, each applied at most once and in declared order.
const DEEP_TIER_WORKERS = Object.freeze(
  [
    'frontend-reviewer',
    'generic-implementer',
    'generic-product-implementer',
    'generic-product-reviewer',
    'merge-conflict-resolver',
    'nodejs-implementer',
    'nodejs-reviewer',
    'rust-implementer',
    'rust-reviewer',
    'ui-implementer',
  ].map((name) => `${WORKER_PREFIX}${name}`),
);
export const EXPECTED_NATIVE_DELTAS = Object.freeze({
  // Per-spawn model tiers move the ten `deep` workers to the `deep` tier: Claude effort xhigh to
  // high, and the Codex model gpt-5.6-sol to gpt-6.1-sol (reasoning effort stays high).
  configuration: Object.freeze([
    Object.freeze({
      id: 'claude-deep-tier-effort',
      harness: 'claude',
      key: 'effort',
      from: 'xhigh',
      to: 'high',
      workers: DEEP_TIER_WORKERS,
    }),
    Object.freeze({
      id: 'codex-deep-tier-model',
      harness: 'codex',
      key: 'model',
      from: 'gpt-5.6-sol',
      to: 'gpt-6.1-sol',
      workers: DEEP_TIER_WORKERS,
    }),
  ]),
  // The delegation mandate's worker-start bullet gains the tier sentence and the mandate gains the
  // `model-tiers` load pointer; every edit of one body delta applies together, each to exactly one
  // occurrence.
  body: Object.freeze([
    Object.freeze({
      id: 'delegation-mandate-model-tiers',
      edits: Object.freeze([
        Object.freeze({
          from: `${MANDATE_WORKER_BULLET}\n`,
          to: `${MANDATE_WORKER_BULLET} The orchestrator gives every spawn it starts the tier rendered at its spawn site.\n`,
        }),
        Object.freeze({
          from: `${MANDATE_LAST_BULLET}\n`,
          to:
            `${MANDATE_LAST_BULLET}\n\n` +
            '**Load on demand:** Read `shared/model-tiers.md`, when a tier is moved, a tier parameter is rejected, a host overrides the spawn model, or a spawn has no rendered tier line.\n',
        }),
      ]),
    }),
    // The lean-orchestrator sentence closes the analysis-default bullet.
    Object.freeze({
      id: 'delegation-mandate-lean-orchestrator',
      edits: Object.freeze([
        Object.freeze({
          from: `${MANDATE_ANALYSIS_BULLET}\n`,
          to: `${MANDATE_ANALYSIS_BULLET} The orchestrator sends all other substantive work to a sub-agent as well, unless a tool's explicit in-run rule binds that work to the run (such as the \`merge-gate\` state reading and guard evaluation) or the triviality exception applies.\n`,
        }),
      ]),
    }),
    // The conditional progress pointer extends only the worker-start bullet; its native
    // canonical prefix also keeps worker-only eval load-set discovery complete.
    Object.freeze({
      id: 'delegation-mandate-subagent-progress',
      edits: Object.freeze([
        Object.freeze({
          from: `${MANDATE_WORKER_BULLET} The orchestrator gives every spawn it starts the tier rendered at its spawn site.\n`,
          to: `${MANDATE_WORKER_BULLET} The orchestrator gives every spawn it starts the tier rendered at its spawn site. **Load on demand:** Read \`shared/subagent-progress.md\` only as the overview owner considering genuinely long or multi-phase work with a candidate native parent channel, or as a worker explicitly enabled by its handoff with the actual parent address and messaging capability; known fallback workers skip it.\n`,
        }),
      ]),
    }),
  ]),
});

const CODEX_BODY_START = "developer_instructions = '''";

// Splits a sidecar into its native configuration text and its prompt body. Claude: the `---`
// frontmatter block and the rest. Codex: the file with the `developer_instructions` literal body
// cut out, and that body.
export function splitNativeSidecar(harness, content, file) {
  if (harness === 'claude') {
    const match = /^---\n[\s\S]*?\n---\n/.exec(content);
    if (!match) throw new Error(`Unparseable native sidecar ${file}: missing frontmatter`);
    return { configuration: match[0], body: content.slice(match[0].length) };
  }
  if (harness === 'codex') {
    const start = content.indexOf(CODEX_BODY_START);
    const bodyStart = start + CODEX_BODY_START.length;
    const end = start === -1 ? -1 : content.indexOf("'''", bodyStart);
    if (end === -1) throw new Error(`Unparseable native sidecar ${file}: missing prompt body`);
    return {
      configuration: `${content.slice(0, bodyStart)}\0${content.slice(end)}`,
      body: content.slice(bodyStart, end),
    };
  }
  throw new Error(`Unsupported native sidecar harness "${harness}"`);
}

// One native configuration key line, newline-delimited: Claude YAML frontmatter or Codex TOML.
function configurationLine(harness, key, value) {
  return harness === 'codex' ? `\n${key} = "${value}"\n` : `\n${key}: ${value}\n`;
}

function applyEdits(text, edits) {
  let result = text;
  for (const { from, to } of edits) {
    if (result.split(from).length !== 2) return null;
    result = result.replace(from, () => to);
  }
  return result;
}

// The ids of the one combination of body deltas that turns the base body into the working body,
// trying combinations in declared order; null when none does.
function matchBodyDeltas(baselineBody, workingBody, bodyDeltas) {
  for (let mask = 1; mask < 2 ** bodyDeltas.length; mask += 1) {
    const chosen = bodyDeltas.filter((_, index) => mask & (1 << index));
    let text = baselineBody;
    for (const { edits } of chosen) {
      text = applyEdits(text, edits);
      if (text === null) break;
    }
    if (text === workingBody) return chosen.map(({ id }) => id);
  }
  return null;
}

function configurationDrift(harness, file, baseline, working) {
  const parse = NATIVE_SIDECAR_CONFIG_PARSERS[harness];
  const before = parse(baseline, file);
  const after = parse(working, file);
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort()
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map(
      (key) =>
        `key "${key}": ${JSON.stringify(before[key]) ?? '<absent>'} -> ${JSON.stringify(after[key]) ?? '<absent>'}`,
    );
}

// Compares one worker's native sidecar against its base build and returns the ids of the expected
// deltas it shows; throws on any other difference. `deltas` defaults to EXPECTED_NATIVE_DELTAS.
export function compareNativeSidecar(
  harness,
  worker,
  baselineContent,
  workingContent,
  deltas = EXPECTED_NATIVE_DELTAS,
) {
  if (baselineContent === workingContent) return [];
  const file = `${worker} (${harness})`;
  const baseline = splitNativeSidecar(harness, baselineContent, file);
  const working = splitNativeSidecar(harness, workingContent, file);
  const used = [];

  if (baseline.configuration !== working.configuration) {
    const delta = deltas.configuration.find(
      (candidate) =>
        candidate.harness === harness &&
        candidate.workers.includes(worker) &&
        applyEdits(baseline.configuration, [
          {
            from: configurationLine(harness, candidate.key, candidate.from),
            to: configurationLine(harness, candidate.key, candidate.to),
          },
        ]) === working.configuration,
    );
    if (delta === undefined) {
      const drift = configurationDrift(harness, file, baselineContent, workingContent);
      throw new Error(
        `Base native configuration drift outside the expected deltas: ${file}` +
          (drift.length > 0 ? `: ${drift.join('; ')}` : ' (formatting)'),
      );
    }
    used.push(delta.id);
  }

  if (baseline.body !== working.body) {
    const ids = matchBodyDeltas(baseline.body, working.body, deltas.body);
    if (ids === null) {
      throw new Error(`Base native body drift outside the expected deltas: ${file}`);
    }
    used.push(...ids);
  }
  return used;
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

function inventory(outputRoot, harness, allowLegacy = false) {
  return parseNativeAgentInventory(
    readFileSync(
      join(outputRoot, 'dist', harness, 'effective-flow', 'native-agent-inventory.json'),
      'utf8',
    ),
    { context: `${harness} baseline comparison inventory`, allowLegacy },
  );
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

  const usage = new Map();
  for (const [harness, extension, native] of [
    ['claude', 'md', claude],
    ['codex', 'toml', codex],
  ]) {
    const baselineDir = join(baseOutput, 'dist', harness, 'agents');
    const workingDir = join(workingOutput, 'dist', harness, 'agents');
    const baseline = inventory(baseOutput, harness, true);
    if (JSON.stringify(baseline.baseWorkers) !== JSON.stringify(native.baseWorkers)) {
      throw new Error(`${harness} base worker membership changed`);
    }
    const workers = [
      ...baseline.baseWorkers,
      ...baseline.fastWorkers,
      ...(baseline.tierWorkers ?? []),
    ];
    assertBaselineWorkerMembership(harness, readdirSync(baselineDir), workers, extension);
    for (const worker of workers) {
      const file = `${worker}.${extension}`;
      for (const id of compareNativeSidecar(
        harness,
        worker,
        readFileSync(join(baselineDir, file), 'utf8'),
        readFileSync(join(workingDir, file), 'utf8'),
      )) {
        if (!usage.has(id)) usage.set(id, new Set());
        usage.get(id).add(worker);
      }
    }
  }

  if (
    existsSync(
      join(workingOutput, 'dist', 'portable', 'effective-flow', 'native-agent-inventory.json'),
    )
  ) {
    throw new Error('Portable output unexpectedly contains a native agent inventory');
  }
  return usage;
}

// `usage` maps an expected-delta id to the workers showing it; ids are reported in the order of
// EXPECTED_NATIVE_DELTAS, workers sorted.
export function formatBaselineReport(base, usage) {
  let report = `Native agents match ${base}\n`;
  for (const { id } of [...EXPECTED_NATIVE_DELTAS.configuration, ...EXPECTED_NATIVE_DELTAS.body]) {
    const workers = usage.get(id);
    if (workers === undefined || workers.size === 0) continue;
    report += `Expected delta ${id}: ${[...workers].sort().join(', ')}\n`;
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

  let usage;
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
    usage = compareBaseline(baselineOutput, workingOutput);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
  process.stdout.write(formatBaselineReport(base, usage));
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
