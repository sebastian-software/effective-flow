#!/usr/bin/env node

// Prepares one `merge-gate` eval scenario for a run and prints the prompt to hand to a fresh agent.
// It starts nothing. That separation is the point: an isolated run has to come from a session that
// does not already know the expected outcome, and a script that both prepared and launched would
// have to be that session. So the operator is the launcher — this file only makes the launch
// deterministic and archives the evidence of the previous one.
//
// Four steps, in this order:
//
//   1. archive the call log the previous run left in the sandbox, into
//      `results/<scenario>/run-<n>.jsonl` with the next free `n`;
//   2. re-run `_scaffold/scaffold.mjs`, which wipes and re-provisions the sandbox;
//   3. confirm the call log is gone, so the next run starts from an empty one;
//   4. print the scenario's prompt verbatim.
//
// Step 1 runs before step 2 because the scaffold deletes the sandbox: an unarchived log is lost
// there, not merged. The consequence is that the **last** run of a session is archived by the next
// `prepare`, so run `prepare` once more after the final run before reading the assertions. That
// extra call also re-scaffolds and prints the prompt again, which costs nothing and changes nothing.

import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { sandboxPaths } from './_scaffold/sandbox.mjs';

const SUITE_ROOT = import.meta.dirname;
const SCENARIO_DIR = resolve(SUITE_ROOT, 'scenarios');
const RESULTS_DIR = resolve(SUITE_ROOT, 'results');
const SCAFFOLD = resolve(SUITE_ROOT, '_scaffold', 'scaffold.mjs');

// The markers the scenario file wraps its prompt in. Extracting between them rather than taking the
// file's first code fence keeps the scenario free to show a command or a snippet above the prompt
// without silently changing what a run receives.
const PROMPT_START = '<!-- prompt:start -->';
const PROMPT_END = '<!-- prompt:end -->';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function availableScenarios() {
  if (!existsSync(SCENARIO_DIR)) return [];
  return readdirSync(SCENARIO_DIR)
    .filter((name) => name.endsWith('.md'))
    .map((name) => name.slice(0, -'.md'.length))
    .sort();
}

// The prompt is the one thing a run must receive byte for byte, so a scenario file that does not
// state exactly one fenced prompt between the markers is a hard stop rather than a best guess.
function extractPrompt(scenarioPath) {
  const source = readFileSync(scenarioPath, 'utf8');
  const start = source.indexOf(PROMPT_START);
  const end = source.indexOf(PROMPT_END);
  if (start === -1 || end === -1 || end < start) {
    fail(`${scenarioPath} states no ${PROMPT_START} … ${PROMPT_END} region`);
  }
  const region = source.slice(start + PROMPT_START.length, end).trim();
  const fence = region.match(/^```[^\n]*\n([\s\S]*?)\n```$/);
  if (!fence) fail(`${scenarioPath}: the prompt region is not a single fenced block`);
  const prompt = fence[1].trim();
  if (prompt === '') fail(`${scenarioPath}: the prompt region is empty`);
  return prompt;
}

// The next free `n`, read from what is already on disk rather than counted, so an archive directory
// a human reordered or partly deleted cannot make this overwrite an existing run.
function nextRunNumber(scenarioResults) {
  if (!existsSync(scenarioResults)) return 1;
  const used = readdirSync(scenarioResults)
    .map((name) => name.match(/^run-(\d+)\.jsonl$/)?.[1])
    .filter((value) => value !== undefined)
    .map(Number);
  return used.length === 0 ? 1 : Math.max(...used) + 1;
}

const scenario = process.argv[2];
const scenarios = availableScenarios();
if (!scenario || !/^[a-z0-9][a-z0-9-]*$/.test(scenario)) {
  fail(
    [
      'usage: node evals/merge-gate/prepare.mjs <scenario>',
      `available scenarios: ${scenarios.length === 0 ? '(none)' : scenarios.join(', ')}`,
    ].join('\n'),
  );
}

const scenarioPath = resolve(SCENARIO_DIR, `${scenario}.md`);
if (!existsSync(scenarioPath)) {
  fail(
    [
      `no scenario file at ${scenarioPath}`,
      `available scenarios: ${scenarios.length === 0 ? '(none)' : scenarios.join(', ')}`,
    ].join('\n'),
  );
}

const prompt = extractPrompt(scenarioPath);
const { callLog } = sandboxPaths(scenario);
const scenarioResults = resolve(RESULTS_DIR, scenario);

// An empty log is archived too. "The gate called nothing" and "the run never started" are different
// facts, and only the archived file can tell them apart afterwards; discarding the empty one here
// would erase the difference the assertions are written to catch.
let archived = null;
if (existsSync(callLog) && statSync(callLog).isFile()) {
  mkdirSync(scenarioResults, { recursive: true });
  archived = resolve(scenarioResults, `run-${nextRunNumber(scenarioResults)}.jsonl`);
  copyFileSync(callLog, archived);
}

execFileSync(process.execPath, [SCAFFOLD, scenario], { stdio: ['ignore', 'inherit', 'inherit'] });

// The scaffold wipes the sandbox, so the log is gone by construction. Stating it as a check rather
// than assuming it keeps a future scaffold change that stopped wiping from handing the next run a
// log that already holds another run's calls.
if (existsSync(callLog)) {
  fail(`the call log at ${callLog} survived the scaffold; the next run would append to it`);
}

const archivedRuns = existsSync(scenarioResults)
  ? readdirSync(scenarioResults).filter((name) => /^run-\d+\.jsonl$/.test(name)).length
  : 0;

process.stdout.write(
  [
    '',
    `prepared ${scenario}`,
    `  archived previous run: ${archived ?? '(no call log in the sandbox — nothing to archive)'}`,
    `  archived runs so far:  ${archivedRuns}`,
    `  call log for this run: ${callLog}`,
    '',
    'Hand the prompt below to a fresh agent — one that has not read the scenario file, whose',
    "expected outcome would turn the run into a test of that agent's memory. Then run this script",
    'again to archive the result, and assert with `node --test test/merge-gate-eval.test.mjs`.',
    '',
    '--- prompt ---',
    prompt,
    '--- end prompt ---',
    '',
  ].join('\n'),
);
