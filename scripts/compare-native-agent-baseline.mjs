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
    Object.freeze({
      id: 'claude-parent-messaging-1',
      harness: 'claude',
      key: 'tools',
      from: 'Read, Bash, Glob, Grep, Skill',
      to: 'SendMessage, Read, Bash, Glob, Grep, Skill',
      workers: Object.freeze(['effective-flow-code-validator']),
    }),
    Object.freeze({
      id: 'claude-parent-messaging-2',
      harness: 'claude',
      key: 'tools',
      from: 'Read, Glob, Grep, Skill',
      to: 'SendMessage, Read, Glob, Grep, Skill',
      workers: Object.freeze([
        'effective-flow-frontend-reviewer',
        'effective-flow-nodejs-reviewer',
        'effective-flow-rust-reviewer',
        'effective-flow-generic-product-reviewer',
      ]),
    }),
    Object.freeze({
      id: 'claude-parent-messaging-3',
      harness: 'claude',
      key: 'tools',
      from: 'Read, Write, Edit, Glob, Grep, Skill',
      to: 'SendMessage, Read, Write, Edit, Glob, Grep, Skill',
      workers: Object.freeze(['effective-flow-code-documenter']),
    }),
    Object.freeze({
      id: 'claude-parent-messaging-4',
      harness: 'claude',
      key: 'tools',
      from: 'Read, Write, Edit, Bash, Glob, Grep, Skill',
      to: 'SendMessage, Read, Write, Edit, Bash, Glob, Grep, Skill',
      workers: Object.freeze([
        'effective-flow-rust-implementer',
        'effective-flow-merge-conflict-resolver',
        'effective-flow-generic-implementer',
        'effective-flow-ui-implementer',
        'effective-flow-e2e-tester',
        'effective-flow-test-writer',
        'effective-flow-docs-writer',
        'effective-flow-marketing-writer',
        'effective-flow-nodejs-implementer',
        'effective-flow-generic-product-implementer',
        'effective-flow-rust-implementer-fast',
        'effective-flow-generic-implementer-fast',
        'effective-flow-ui-implementer-fast',
        'effective-flow-nodejs-implementer-fast',
        'effective-flow-generic-product-implementer-fast',
      ]),
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
    // Compact checkpoints replace the historical worker load pointer without changing any
    // native configuration, tool allowlist, or other worker text.
    Object.freeze({
      id: 'delegation-mandate-compact-checkpoint',
      edits: Object.freeze([
        Object.freeze({
          from: '**Load on demand:** Read `shared/subagent-progress.md` only as the overview owner considering genuinely long or multi-phase work with a candidate native parent channel, or as a worker explicitly enabled by its handoff with the actual parent address and messaging capability; known fallback workers skip it.',
          to: '**Load on demand:** Read `shared/subagent-progress.md` only as the active overview owner considering longer ordinary worker/analysis work with a candidate native channel and ordinary parent event wait; workers never load it. If an ordinary handoff enables progress and supplies the parent address and messaging tool, check your own actual tool and supplied parent address, then send at most one meaningful checkpoint (current phase, observed result, next action; at most 20 words); none for short tasks, no acknowledgement, and continue work if unavailable or denied.',
        }),
      ]),
    }),
    Object.freeze({
      id: 'delegation-mandate-model-selection',
      edits: Object.freeze([
        Object.freeze({
          from: `${MANDATE_LAST_BULLET}\n`,
          to: `${MANDATE_LAST_BULLET} Before dispatch, resume, or terminal result acceptance, the orchestrator reads \`shared/model-selection.md\` and applies its executable selection and result checks.\n`,
        }),
      ]),
    }),
    Object.freeze({
      id: 'delegation-mandate-parent-chain-progress',
      edits: Object.freeze([
        Object.freeze({
          from: '**Load on demand:** Read `shared/subagent-progress.md` only as the active overview owner considering longer ordinary worker/analysis work with a candidate native channel and ordinary parent event wait; workers never load it. If an ordinary handoff enables progress and supplies the parent address and messaging tool, check your own actual tool and supplied parent address, then send at most one meaningful checkpoint (current phase, observed result, next action; at most 20 words); none for short tasks, no acknowledgement, and continue work if unavailable or denied.',
          to: '**Load on demand:** Read `shared/subagent-progress.md` only as an orchestrator considering longer delegated work or receiving trusted progress context; leaves never load it. An eligible compact handoff supplies the actual immediate-parent tool/channel, parent address and dispatch. A leaf verifies its own tool and that parent, then sends at most one `PROGRESS/1 <dispatch>: <checkpoint>` (phase, observed result, next action; checkpoint at most 20 words), none for short work; continue without acknowledgement if unavailable/denied. Send only to that parent; no sibling/cross-session/ancestor messages, starts/resumes, permission forwarding or message-based approvals. Recovery resumes keep the same allowance.',
        }),
        Object.freeze({
          from: '- when the task is done in fewer than three simple steps\n',
          to: '- when the task is done in fewer than three simple steps\n\nOnly the active overview owner emits user-facing progress; a delegated leaf returns to its parent.\nAn orchestrator considering longer delegated work or receiving trusted progress context reads\n`shared/subagent-progress.md` on demand, including when this tool has no goal-completion include.\nReturning orchestrators relay material changes through their own immediate-parent context;\nsame-session calls integrate into the existing overview without inventing a recipient.\n',
        }),
      ]),
    }),
    // The conditional duty replaces exactly the whole voluntary progress pointer in the
    // worker-start bullet; historical progress deltas remain unchanged and compose before it.
    Object.freeze({
      id: 'delegation-mandate-conditional-checkpoint',
      edits: Object.freeze([
        Object.freeze({
          from:
            `${MANDATE_WORKER_BULLET} The orchestrator gives every spawn it starts the tier rendered at its spawn site. ` +
            '**Load on demand:** Read `shared/subagent-progress.md` only as an orchestrator considering longer delegated work or receiving trusted progress context; leaves never load it. An eligible compact handoff supplies the actual immediate-parent tool/channel, parent address and dispatch. A leaf verifies its own tool and that parent, then sends at most one `PROGRESS/1 <dispatch>: <checkpoint>` (phase, observed result, next action; checkpoint at most 20 words), none for short work; continue without acknowledgement if unavailable/denied. Send only to that parent; no sibling/cross-session/ancestor messages, starts/resumes, permission forwarding or message-based approvals. Recovery resumes keep the same allowance.\n',
          to:
            `${MANDATE_WORKER_BULLET} The orchestrator gives every spawn it starts the tier rendered at its spawn site. ` +
            '**Load on demand:** Read `shared/subagent-progress.md` only as an orchestrator considering longer delegated work or receiving trusted progress context; leaves never load it. An eligible compact handoff supplies the actual immediate-parent tool/channel, parent address and dispatch. A leaf verifies its own tool and that parent; when it has confirmed a materially useful intermediate result for that parent and necessary domain work remains, it sends one `PROGRESS/1 <dispatch>: <checkpoint>` (phase, observed result, next action; checkpoint at most 20 words). Keep at most one per logical handoff. Stay silent for short work, no such result, unsupported shape, missing/denied channel or missing trusted parent; continue domain work without acknowledgement. Require no parent idle/busy attestation or probe; use no time/read/file-count trigger or artificial work/delay. Send only to that parent; no sibling/cross-session/ancestor messages, starts/resumes, permission forwarding or message-based approvals. Recovery resumes keep the same allowance.\n',
        }),
      ]),
    }),
    // The triviality exception states that it waives delegation only, between its definition and
    // the lean-orchestrator sentence.
    Object.freeze({
      id: 'delegation-mandate-triviality-scope',
      edits: Object.freeze([
        Object.freeze({
          from: `${MANDATE_ANALYSIS_BULLET} The orchestrator sends all other substantive work`,
          to: `${MANDATE_ANALYSIS_BULLET} It waives delegation only, never a workflow step such as a reservation, a report, a lock or a commit. The orchestrator sends all other substantive work`,
        }),
      ]),
    }),
    // The generic-product reviewer accepts the `tooling` paths a pre-commit review assigns, and
    // its reduced-depth notice no longer calls them product code.
    Object.freeze({
      id: 'generic-product-reviewer-tooling-assignment',
      edits: Object.freeze([
        Object.freeze({
          from: 'framework reviewer applies. Ground every judgment',
          to: 'framework reviewer applies, and for the `tooling` paths a pre-commit review assigns. Ground every judgment',
        }),
        Object.freeze({
          from: 'specialist matches this product code; findings are limited',
          to: 'specialist matches this review scope; findings are limited',
        }),
        Object.freeze({
          from: 'review only the generic product bucket assigned through `Project routing`; specialist and tooling buckets stay with their corresponding reviewers',
          to: 'review only the generic product bucket assigned through `Project routing`, and `tooling` paths when the assignment states it is a pre-commit review and gives their route; every specialist bucket, and `tooling` from any other assignment, stays with its corresponding reviewer',
        }),
      ]),
    }),
    // Explicit implementation full-pass assignments widen only this reviewer's assigned paths;
    // ordinary routing and the disclosed lack of specialist depth remain intact.
    Object.freeze({
      id: 'generic-product-reviewer-implementation-full-pass',
      edits: Object.freeze([
        Object.freeze({
          from: 'framework reviewer applies, and for the `tooling` paths a pre-commit review assigns. Ground every judgment',
          to: 'framework reviewer applies, for the `tooling` paths a pre-commit review assigns, and for explicit bounded implementation full-pass assignments as defined below. Ground every judgment',
        }),
        Object.freeze({
          from: 'no dedicated Effective Flow specialist matches this review scope; findings are limited',
          to: 'this generic pass provides no dedicated Effective Flow language or framework specialist depth; findings are limited',
        }),
        Object.freeze({
          from: '- review only the generic product bucket assigned through `Project routing`, and `tooling` paths when the assignment states it is a pre-commit review and gives their route; every specialist bucket, and `tooling` from any other assignment, stays with its corresponding reviewer',
          to: "- outside an explicit implementation full-pass assignment, review only the generic product bucket assigned through `Project routing`, and `tooling` paths when the assignment states it is a pre-commit review and gives their route; every specialist bucket, and `tooling` from any other assignment, stays with its corresponding reviewer\n- for an explicit bounded implementation full-pass assignment from `effective-flow fix`, `effective-flow build`, or `effective-flow refactor`, accept only the supplied paths and their confirmed routes, including specialist and tooling/CI paths; this exception covers `review-depth` floor hits or triggers and fix's missing-`reviewTree` fallback; it does not change ordinary specialist routing",
        }),
      ]),
    }),
    // An item workflow's targeted scope replaces the validator's mode mapping, the merge gate's
    // conflict-commit scope and iterate's review-fix scope form one CI-backed quick scope that
    // replaces the `quick` mapping, and an environment signature is reported without a suite split,
    // base comparison or rerun; the paragraphs close the validation-mode section before the minimal
    // fallback. The id predates the targeted and review-fix scopes, which it now covers as well; it
    // stays unchanged because the comparison's pinned stdout names it.
    Object.freeze({
      id: 'code-validator-conflict-commit-scope',
      edits: Object.freeze([
        Object.freeze({
          from: 'subcommands merely to fill a report.\n\n## Minimal fallback\n',
          to:
            'subcommands merely to fill a report.\n\n' +
            'A **targeted scope** from an item workflow under `Validation: targeted` replaces the mode mapping:\n' +
            'run the established non-test checks for the assigned paths and only the tests affected by them,\n' +
            'never a whole-suite command or a combined gate that contains one. With no identifiable affected\n' +
            'test, report the test surface as `SKIPPED (coverage from the round validator)`.\n\n' +
            'A **conflict-commit scope** from the merge gate and a **review-fix scope** from `iterate` Phase 4\n' +
            'are one CI-backed quick scope, which replaces the `quick` mapping: skip only the named excluded test\n' +
            'command, by normalized script identity, as `SKIPPED (covered by CI)`; run every other established\n' +
            'check for the assigned buckets, plus the affected tests the caller names; replace a mandated\n' +
            'combined gate that contains the excluded command by its remaining established subcommands. Where\n' +
            'those cannot run separately, run `full` and report why. Where the scope names several excluded test\n' +
            "commands, as the caller's detection `data.testCommands` does, this holds for each.\n\n" +
            '**On an environment signature, report the check and its diagnostic; no suite split, no base\n' +
            'comparison, no rerun.** An environment signature is one of the signature classes the handoff names;\n' +
            "report it in the owner's result states. A timeout of your own host tool, or one you cannot\n" +
            'attribute, is none of these.\n\n' +
            '## Minimal fallback\n',
        }),
      ]),
    }),
    // The resolver is handed the validation mode and the environment-signature rule, runs only
    // targeted checks under `quick` until it classifies a conflicted path high-risk, reports an
    // environment signature without a suite split, base comparison or rerun, and reports the mode
    // it applied.
    Object.freeze({
      id: 'merge-conflict-resolver-validation-mode',
      edits: Object.freeze([
        Object.freeze({
          from:
            'conflicted paths, the resolved language values, and whether this run is gated or a non-interactive\n' +
            'delegation. Work only inside that checkout, and use its absolute root for every command and every\n' +
            'path — never a relative path resolved against some other working directory.\n',
          to:
            'conflicted paths, the resolved language values, whether this run is gated or a non-interactive\n' +
            'delegation, the validation mode (`full` or `quick`), and the environment-signature rule with its\n' +
            'signature classes. Work only\n' +
            'inside that checkout, and use its absolute root for every command and every path — never a\n' +
            'relative path resolved against some other working directory.\n',
        }),
        Object.freeze({
          from: '  check rests on, and a role-scoped subset that declines to run it leaves the commit ungated.\n',
          to:
            '  check rests on, and a role-scoped subset that declines to run it leaves the commit ungated.\n' +
            '- **Under the validation mode `quick`, run targeted checks only:** the established checks for the\n' +
            '  conflicted and adjacent paths, never the combined or top-level gate, which the independent\n' +
            '  validator runs once. As soon as you classify a conflicted path high-risk, validate as under\n' +
            '  `full`. Under `full`, or with no mode handed, the rules above apply unchanged.\n' +
            '- **On an environment signature, report the check and its diagnostic; no suite split, no base\n' +
            '  comparison, no rerun.** An environment signature is one of the signature classes the gate hands\n' +
            '  you. A timeout of your own host tool, or one you cannot attribute, is none of these.\n',
        }),
        Object.freeze({
          from:
            '- the exact validation commands with their terminal results, including every check skipped with its\n' +
            '  reason;\n',
          to:
            '- the validation mode you applied and the exact validation commands with their terminal results,\n' +
            '  including every check skipped with its reason and every environment signature with its\n' +
            '  diagnostic;\n',
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
    const candidates = deltas.configuration.filter(
      (candidate) => candidate.harness === harness && candidate.workers.includes(worker),
    );
    const ids = matchBodyDeltas(
      baseline.configuration,
      working.configuration,
      candidates.map((candidate) => ({
        id: candidate.id,
        edits: [
          {
            from: configurationLine(harness, candidate.key, candidate.from),
            to: configurationLine(harness, candidate.key, candidate.to),
          },
        ],
      })),
    );
    if (ids === null) {
      const drift = configurationDrift(harness, file, baselineContent, workingContent);
      throw new Error(
        `Base native configuration drift outside the expected deltas: ${file}` +
          (drift.length > 0 ? `: ${drift.join('; ')}` : ' (formatting)'),
      );
    }
    used.push(...ids);
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
    const source = join(ROOT_DIR, relativePath);
    // A tracked path deleted in the working tree (an unstaged removal or rename) is not part of it.
    if (!existsSync(source)) continue;
    const target = join(destination, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { dereference: false });
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
