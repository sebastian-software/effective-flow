#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import {
  createRound,
  publishRound,
  recoverPublication,
  retryAborted,
  retryInvalid,
  roundStatus,
  sealAttempt,
} from './_scaffold/round-core.mjs';

const COMMAND_OPTIONS = Object.freeze({
  prepare: new Set([
    'scenario',
    'harness',
    'model',
    'reasoning-effort',
    'reported-version',
    'tool-policy',
  ]),
  status: new Set(['round']),
  seal: new Set(['round', 'scenario', 'slot', 'receipt']),
  'retry-aborted': new Set(['round', 'scenario', 'slot', 'receipt']),
  'retry-invalid': new Set(['round', 'scenario', 'slot', 'reason']),
  publish: new Set(['round']),
  recover: new Set(),
});
const ALL_OPTIONS = new Set(Object.values(COMMAND_OPTIONS).flatMap((flags) => [...flags]));

function usage() {
  return `usage: node evals/merge-gate/round.mjs <command> [options]

commands:
  prepare [--scenario NAME ...] [profile flags]
  status --round ID|MANIFEST
  seal --round ID|MANIFEST --scenario NAME --slot N --receipt FILE
  retry-aborted --round ... --scenario ... --slot N --receipt FILE
  retry-invalid --round ... --scenario ... --slot N [--reason TEXT]
  publish --round ID|MANIFEST
  recover

profile flags: --harness, --model, --reasoning-effort, --reported-version, --tool-policy
Omitted profile values are recorded explicitly as "unknown". No command launches a model.
`;
}

function options(args) {
  const parsed = { scenario: [] };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--')) throw new Error(`unexpected argument ${token}`);
    const key = token.slice(2);
    if (!ALL_OPTIONS.has(key)) throw new Error(`unknown option --${key}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${token} requires a value`);
    index += 1;
    if (key === 'scenario') parsed.scenario.push(value);
    else if (Object.hasOwn(parsed, key)) throw new Error(`${token} was provided more than once`);
    else parsed[key] = value;
  }
  return parsed;
}

function required(value, flag) {
  if (value === undefined) throw new Error(`${flag} is required`);
  return value;
}

function validateOptions(command, parsed) {
  const allowed = COMMAND_OPTIONS[command];
  if (!allowed) throw new Error(`unknown command ${command}\n${usage()}`);
  const provided = Object.entries(parsed)
    .filter(([key, value]) => (key === 'scenario' ? value.length > 0 : value !== undefined))
    .map(([key]) => key);
  const rejected = provided.filter((key) => !allowed.has(key));
  if (rejected.length > 0) {
    throw new Error(`${command} does not accept ${rejected.map((key) => `--${key}`).join(', ')}`);
  }
  if (command !== 'prepare' && parsed.scenario.length > 1) {
    throw new Error(`${command} accepts --scenario only once`);
  }
}

function readReceipt(path) {
  if (!existsSync(path)) throw new Error(`no receipt at ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function profileFrom(parsed) {
  return {
    harness: parsed.harness,
    model: parsed.model,
    reasoningEffort: parsed['reasoning-effort'],
    reportedVersion: parsed['reported-version'],
    toolPolicy: parsed['tool-policy'],
  };
}

function printStatus(rows) {
  for (const row of rows) {
    process.stdout.write(
      `${row.scenario}\t${row.slot}\tattempt-${row.attempt}\t${row.status}\t${row.prompt}\n`,
    );
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === 'help') {
    process.stdout.write(usage());
    return;
  }
  const parsed = options(args);
  validateOptions(command, parsed);
  if (command === 'prepare') {
    const prepared = createRound({ scenarios: parsed.scenario, profile: profileFrom(parsed) });
    process.stdout.write(
      `prepared round ${prepared.manifest.roundId}\nmanifest: ${prepared.manifestPath}\n`,
    );
    printStatus(roundStatus(prepared.manifestPath));
    return;
  }
  if (command === 'status') {
    printStatus(roundStatus(required(parsed.round, '--round')));
    return;
  }
  if (command === 'seal') {
    const receipt = sealAttempt({
      handle: required(parsed.round, '--round'),
      scenario: required(parsed.scenario[0], '--scenario'),
      slot: Number(required(parsed.slot, '--slot')),
      hostReceipt: readReceipt(required(parsed.receipt, '--receipt')),
    });
    process.stdout.write(`sealed ${receipt.scenario}/${receipt.slot} attempt-${receipt.attempt}\n`);
    return;
  }
  if (command === 'retry-aborted') {
    const result = retryAborted({
      handle: required(parsed.round, '--round'),
      scenario: required(parsed.scenario[0], '--scenario'),
      slot: Number(required(parsed.slot, '--slot')),
      assertion: readReceipt(required(parsed.receipt, '--receipt')),
    });
    process.stdout.write(`prepared replacement attempt-${result.attempt}: ${result.prompt}\n`);
    return;
  }
  if (command === 'retry-invalid') {
    const result = retryInvalid({
      handle: required(parsed.round, '--round'),
      scenario: required(parsed.scenario[0], '--scenario'),
      slot: Number(required(parsed.slot, '--slot')),
      reason: parsed.reason,
    });
    process.stdout.write(`prepared replacement attempt-${result.attempt}: ${result.prompt}\n`);
    return;
  }
  if (command === 'publish') {
    const result = publishRound({ handle: required(parsed.round, '--round') });
    process.stdout.write(`published generation ${result.generation}\n`);
    if (result.findings.length > 0) {
      for (const finding of result.findings) {
        process.stderr.write(`${finding.scenario}/${finding.slot}: ${finding.finding}\n`);
      }
      process.exitCode = 1;
    }
    return;
  }
  if (command === 'recover') {
    const result = recoverPublication();
    process.stdout.write(
      result.recovered ? 'recovered interrupted publication\n' : 'nothing to recover\n',
    );
    return;
  }
  throw new Error(`unknown command ${command}\n${usage()}`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
