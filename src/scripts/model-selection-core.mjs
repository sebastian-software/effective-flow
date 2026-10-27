// Read-only model selection and verification. The build owns the contract beside this module;
// verification recomputes its selection and reads only the explicitly supplied rollout file.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const MODEL_SELECTION_OPERATIONS = Object.freeze(['select', 'verify']);
export const MAX_STDIN_BYTES = 64 * 1024;
export const MAX_EVIDENCE_BYTES = 16 * 1024 * 1024;
const MAX_CONTRACT_BYTES = 1024 * 1024;
const TIERS = Object.freeze(['mechanical', 'standard', 'deep']);
const SELECT_KEYS = ['harness', 'site', 'role', 'fallback', 'tier', 'reason', 'retry', 'native'];
const CONTRACT_PATH = fileURLToPath(new URL('./model-selection-contract.json', import.meta.url));
const READ_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | (constants.O_NONBLOCK ?? 0);

export class ModelSelectionError extends Error {
  constructor(code, message, data, options) {
    super(message, options);
    this.name = 'ModelSelectionError';
    this.code = code;
    this.data = data;
  }
}

function fail(code, message, data) {
  throw new ModelSelectionError(code, message, data);
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function keys(value, allowed, code = 'INVALID_INPUT') {
  if (!object(value) || Object.keys(value).some((key) => !allowed.includes(key))) {
    fail(code, 'Input must be an object containing only supported fields');
  }
}

function text(value, maximum = 200) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    value.trim() === value
  );
}

function runtimeToken(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(value);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

// Read at most limit + 1 bytes, even if the file grows after fstat. O_NONBLOCK avoids waiting
// on a FIFO; O_NOFOLLOW and the handle's type check reject links and non-regular files.
async function readBoundedFile(filename, limit) {
  if (typeof constants.O_NOFOLLOW !== 'number') throw new Error('no safe file adapter');
  const handle = await open(filename, READ_FLAGS);
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size > BigInt(limit)) throw new Error('unsafe file');
    const chunks = [];
    let total = 0;
    while (total <= limit) {
      const buffer = Buffer.alloc(Math.min(64 * 1024, limit + 1 - total));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      chunks.push(buffer.subarray(0, bytesRead));
    }
    const after = await handle.stat({ bigint: true });
    const namedFile = await lstat(filename, { bigint: true });
    if (
      total > limit ||
      BigInt(total) !== before.size ||
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs ||
      after.ctimeNs !== before.ctimeNs ||
      !namedFile.isFile() ||
      namedFile.dev !== after.dev ||
      namedFile.ino !== after.ino
    ) {
      throw new Error('file changed or exceeded its bound');
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } finally {
    await handle.close();
  }
}

function validateContract(contract) {
  const invalid = () =>
    fail('INVALID_CONTRACT', 'The generated model-selection contract is invalid');
  if (
    !object(contract) ||
    contract.schemaVersion !== 1 ||
    !['codex', 'claude', 'portable'].includes(contract.target) ||
    !object(contract.mappings) ||
    !object(contract.roles) ||
    !Array.isArray(contract.sites)
  )
    invalid();
  for (const tier of TIERS) {
    const entry = contract.mappings[tier];
    if (!object(entry)) invalid();
    for (const harness of ['codex', 'claude']) {
      const mapping = entry[harness];
      if (
        !object(mapping) ||
        !text(mapping.model) ||
        !text(mapping[harness === 'codex' ? 'reasoning_effort' : 'effort'])
      )
        invalid();
    }
  }
  for (const [role, tier] of Object.entries(contract.roles)) {
    if (!/^[a-z][a-z0-9-]*$/.test(role) || !TIERS.includes(tier)) invalid();
  }
  const sites = new Set();
  for (const site of contract.sites) {
    if (
      !object(site) ||
      !text(site.id) ||
      sites.has(site.id) ||
      typeof site.downAllowed !== 'boolean' ||
      !Array.isArray(site.clauses) ||
      site.clauses.length === 0
    )
      invalid();
    sites.add(site.id);
    const roles = new Set();
    for (const clause of site.clauses) {
      if (
        !object(clause) ||
        !TIERS.includes(clause.tier) ||
        roles.has(clause.role) ||
        (clause.role !== null && !Object.hasOwn(contract.roles, clause.role))
      )
        invalid();
      roles.add(clause.role);
    }
  }
  return contract;
}

async function loadContract(deps) {
  try {
    return validateContract(
      deps.contract ?? JSON.parse(await readBoundedFile(CONTRACT_PATH, MAX_CONTRACT_BYTES)),
    );
  } catch (error) {
    if (error instanceof ModelSelectionError) throw error;
    throw new ModelSelectionError(
      'INVALID_CONTRACT',
      'Cannot read the generated model-selection contract',
      undefined,
      { cause: error },
    );
  }
}

function select(input, contract) {
  keys(input, SELECT_KEYS);
  if (!['codex', 'claude'].includes(input.harness))
    fail('INVALID_INPUT', 'harness must identify codex or claude');
  for (const key of ['site', 'role', 'tier', 'reason']) {
    if (Object.hasOwn(input, key) && !text(input[key], key === 'reason' ? 2000 : 200)) {
      fail('INVALID_INPUT', `${key} must be a bounded non-empty string`);
    }
  }
  for (const key of ['fallback', 'retry', 'native']) {
    if (Object.hasOwn(input, key) && typeof input[key] !== 'boolean')
      fail('INVALID_INPUT', `${key} must be boolean`);
  }
  if (input.fallback && (input.site || input.role || !input.reason)) {
    fail(
      'INVALID_INPUT',
      'Fallback requires a reason and must not specify a spawn site or worker role',
    );
  }
  if (input.native && contract.target !== input.harness) {
    fail('INVALID_INPUT', 'Native role selection requires the matching native target');
  }
  if (input.role && !Object.hasOwn(contract.roles, input.role))
    fail('INVALID_INPUT', 'Unknown worker role');
  let defaultTier;
  let downAllowed = true;
  const role = input.role ?? null;
  if (input.site) {
    const site = contract.sites.find((entry) => entry.id === input.site);
    const clause = site?.clauses.find((entry) => entry.role === role);
    if (!clause) fail('INVALID_INPUT', 'Unknown spawn site or incompatible worker role');
    defaultTier = clause.tier;
    downAllowed = site.downAllowed;
  } else if (role) {
    defaultTier = contract.roles[role];
  } else if (input.fallback) {
    defaultTier = 'standard';
  } else {
    fail('INVALID_INPUT', 'A spawn site, worker role, or reasoned explicit fallback is required');
  }
  const tier = input.tier ?? defaultTier;
  if (!TIERS.includes(tier)) fail('INVALID_INPUT', 'Unknown model tier');
  const move = TIERS.indexOf(tier) - TIERS.indexOf(defaultTier);
  if (
    (defaultTier === 'deep' && move < 0) ||
    (role !== null && contract.roles[role] === 'deep' && tier !== 'deep') ||
    (move < 0 && (!downAllowed || input.retry)) ||
    (defaultTier === 'mechanical' && move !== 0) ||
    (move !== 0 && !input.reason)
  ) {
    fail('TIER_POLICY', 'The requested tier move is not allowed by the tier policy');
  }
  const mapping = contract.mappings[tier][input.harness];
  const expected = {
    model: mapping.model,
    effort: mapping[input.harness === 'codex' ? 'reasoning_effort' : 'effort'],
  };
  let spawnRole = role;
  let parameters =
    input.harness === 'codex'
      ? { model: expected.model, reasoning_effort: expected.effort }
      : { model: expected.model, effort: expected.effort };
  if (input.native) {
    if (!role) fail('INVALID_INPUT', 'Native selection requires a worker role');
    spawnRole = `effective-flow-${role}`;
    if (input.harness === 'codex') {
      const roleTier = contract.roles[role];
      if (tier !== roleTier && roleTier !== 'standard')
        fail('TIER_POLICY', 'No native sidecar exists for this tier move');
      if (tier !== roleTier) spawnRole += `-tier-${tier}`;
      parameters = {};
    }
  }
  const request = Object.fromEntries(
    SELECT_KEYS.filter((key) => Object.hasOwn(input, key)).map((key) => [key, input[key]]),
  );
  return {
    request,
    contractDigest: createHash('sha256').update(canonical(contract)).digest('hex'),
    defaultTier,
    tier,
    expected,
    spawn: { role: spawnRole, parameters },
  };
}

function unverified(message) {
  fail('UNVERIFIED', message, { status: 'unverified' });
}

function parseRollout(contents, parentId, childId, expected) {
  if (!contents.endsWith('\n')) unverified('The rollout is incomplete or not newline-terminated');
  const turns = new Map();
  const taskTurns = new Set();
  let identitySeen = false;
  for (const line of contents.slice(0, -1).split('\n')) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      unverified('The rollout contains malformed JSON');
    }
    if (!object(event) || !text(event.type) || !object(event.payload))
      unverified('The rollout contains a malformed event');
    const payload = event.payload;
    if (['event_msg', 'response_item'].includes(event.type) && !text(payload.type)) {
      unverified('The rollout contains a malformed event payload');
    }
    if (event.type === 'session_meta') {
      if (
        identitySeen ||
        payload.id !== childId ||
        payload.source?.subagent?.thread_spawn?.parent_thread_id !== parentId ||
        (Object.hasOwn(payload, 'parent_thread_id') && payload.parent_thread_id !== parentId)
      ) {
        unverified('The rollout does not prove the requested parent and child identity');
      }
      identitySeen = true;
    }
    if (event.type === 'turn_context') {
      if (
        !identitySeen ||
        !runtimeToken(payload.turn_id) ||
        !runtimeToken(payload.model) ||
        !runtimeToken(payload.effort)
      ) {
        unverified('A turn context lacks verified identity, turn ID, model, or effort');
      }
      const actual = { model: payload.model, effort: payload.effort };
      if (turns.has(payload.turn_id) && !isDeepStrictEqual(turns.get(payload.turn_id), actual)) {
        unverified('The rollout contains conflicting contexts for the same turn');
      }
      turns.set(payload.turn_id, actual);
    }
    if (event.type === 'event_msg' && ['task_started', 'task_complete'].includes(payload.type)) {
      if (!identitySeen || !runtimeToken(payload.turn_id))
        unverified('A task event lacks a verified turn ID');
      taskTurns.add(payload.turn_id);
    }
  }
  if (!identitySeen || turns.size === 0 || [...taskTurns].some((turn) => !turns.has(turn))) {
    unverified('The rollout lacks model and effort context for every observed task turn');
  }
  // Structural and identity validation above takes precedence over a mismatch, so incomplete
  // or conflicting evidence never becomes a claim about an observed runtime configuration.
  for (const actual of turns.values()) {
    if (actual.model !== expected.model || actual.effort !== expected.effort) {
      fail('MODEL_MISMATCH', 'An observed child turn used a different model or effort', {
        status: 'mismatch',
        observed: { childId, parentId, ...actual },
        observedTurnIds: [...turns.keys()],
      });
    }
  }
  return {
    status: 'verified',
    observed: { childId, parentId, ...expected },
    observedTurnIds: [...turns.keys()],
    observedTurns: turns.size,
  };
}

async function verify(input, contract) {
  keys(input, ['selection', 'parentId', 'childId', 'evidence']);
  if (
    !runtimeToken(input.parentId) ||
    !runtimeToken(input.childId) ||
    input.parentId === input.childId
  ) {
    fail('INVALID_INPUT', 'Distinct bounded parentId and childId values are required');
  }
  let selection;
  try {
    selection = select(input.selection?.request, contract);
  } catch {
    fail('INVALID_SELECTION', 'The supplied selection cannot be recomputed');
  }
  if (!isDeepStrictEqual(input.selection, selection))
    fail('INVALID_SELECTION', 'The supplied selection does not match the current contract');
  if (!input.evidence) unverified('No supported runtime evidence was supplied');
  keys(input.evidence, ['kind', 'path']);
  if (selection.request.harness !== 'codex' || input.evidence.kind !== 'codex-rollout') {
    unverified('No supported runtime adapter is available for this evidence and harness');
  }
  if (!text(input.evidence.path, 4096) || !path.isAbsolute(input.evidence.path)) {
    unverified('Runtime evidence must name an absolute rollout file path');
  }
  let contents;
  try {
    contents = await readBoundedFile(input.evidence.path, MAX_EVIDENCE_BYTES);
  } catch {
    unverified('Cannot safely read the bounded regular rollout file');
  }
  return parseRollout(contents, input.parentId, input.childId, selection.expected);
}

export async function executeOperation(operation, input = {}, deps = {}) {
  try {
    if (!MODEL_SELECTION_OPERATIONS.includes(operation))
      fail('INVALID_INPUT', 'Unknown model-selection operation');
    const contract = await loadContract(deps);
    const data = operation === 'select' ? select(input, contract) : await verify(input, contract);
    return { ok: true, operation, data };
  } catch (error) {
    return errorEnvelope(operation, error);
  }
}

export function errorEnvelope(operation, error) {
  const normalized =
    error instanceof ModelSelectionError
      ? error
      : new ModelSelectionError('INTERNAL_ERROR', 'Unexpected model-selection failure', undefined, {
          cause: error,
        });
  return {
    ok: false,
    operation: operation ?? null,
    error: { code: normalized.code, message: normalized.message },
    ...(normalized.data ? { data: normalized.data } : {}),
  };
}

export function exitCodeFor(envelope) {
  return envelope.ok
    ? 0
    : ['INVALID_INPUT', 'INVALID_SELECTION', 'TIER_POLICY'].includes(envelope.error.code)
      ? 2
      : 1;
}
