// Shared test support: the exact stdin keys of the shipped pilot helper's operations, read from the
// helper source itself. A contract test that compares a fragment's documented payload against these
// keys fails when either side drifts, instead of at run time. This module declares no test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CORE = readFileSync(
  new URL('../../src/scripts/pilot-measurement-core.mjs', import.meta.url),
  'utf8',
);

// The helper function that validates each operation's payload.
export const PILOT_OPERATION_FUNCTIONS = Object.freeze({
  inventory: 'inventoryOperation',
  'begin-baseline': 'beginBaseline',
  activate: 'activate',
  start: 'startWorkflow',
  'start-packet': 'startPacket',
  'finish-packet': 'finishPacket',
  finalize: 'finalizeWorkflow',
  suspend: 'suspendGeneration',
  resume: 'resumeGeneration',
  'reconcile-record': 'reconcileRecord',
});

function functionBody(functionName) {
  const start = CORE.indexOf(`async function ${functionName}(input, deps) {`);
  assert.notEqual(start, -1, `the helper must define ${functionName}`);
  const end = CORE.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `${functionName} must end with a top-level closing brace`);
  return CORE.slice(start, end);
}

const quoted = (list) => [...list.matchAll(/'([^']+)'/g)].map(([, key]) => key);

function validatedKeys(functionName) {
  const body = functionBody(functionName);
  const exact = body.match(/exactObject\(input, \[([^\]]*)\](?:, \[([^\]]*)\])?\)/);
  if (exact) return { required: quoted(exact[1]), optional: quoted(exact[2] ?? '') };
  const common = body.match(/commonInput\(input, \[([^\]]*)\](?:, \[([^\]]*)\])?\)/);
  assert.ok(common, `${functionName} must validate its payload with exactObject or commonInput`);
  return {
    required: ['runtimeStateRoot', 'repositoryIdentity', 'generationId', ...quoted(common[1])],
    optional: quoted(common[2] ?? ''),
  };
}

// The required stdin keys of one helper operation, by helper function name (for example
// `beginBaseline`) or by operation name (for example `start-packet`).
export function pilotOperationKeys(nameOrOperation) {
  return validatedKeys(PILOT_OPERATION_FUNCTIONS[nameOrOperation] ?? nameOrOperation).required;
}

// The optional stdin keys the same operation accepts in addition.
export function pilotOperationOptionalKeys(nameOrOperation) {
  return validatedKeys(PILOT_OPERATION_FUNCTIONS[nameOrOperation] ?? nameOrOperation).optional;
}
