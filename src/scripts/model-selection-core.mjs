// Read-only model selection and verification. The build owns the contract beside this module;
// verification recomputes its selection and reads only the explicitly supplied rollout file or
// the one Claude Code subagent transcript of the named child.
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, opendir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const MODEL_SELECTION_OPERATIONS = Object.freeze(['select', 'fast', 'verify']);
export const FAST_HARNESS_QUALIFICATION_FILE = 'fast-harness-qualification.json';
export const QUALIFICATION_OUTCOMES = Object.freeze(['qualified', 'unqualified', 'unproven']);
export const MODEL_COMPLIANCE_VALUES = Object.freeze(['verified', 'mismatch', 'unverified']);
export const MAX_STDIN_BYTES = 64 * 1024;
export const MAX_EVIDENCE_BYTES = 16 * 1024 * 1024;
const MAX_CONTRACT_BYTES = 1024 * 1024;
const TIERS = Object.freeze(['mechanical', 'standard', 'deep']);
const SELECT_KEYS = [
  'harness',
  'site',
  'role',
  'fallback',
  'tier',
  'reason',
  'retry',
  'native',
  'panelModel',
];
const HARNESSES = Object.freeze(['codex', 'claude']);
const CONTRACT_PATH = fileURLToPath(new URL('./model-selection-contract.json', import.meta.url));
const QUALIFICATION_PATH = fileURLToPath(
  new URL(`./${FAST_HARNESS_QUALIFICATION_FILE}`, import.meta.url),
);
const MAX_QUALIFICATION_BYTES = 64 * 1024;
const QUALIFICATION_RECORD_KEYS = Object.freeze([
  'installKind',
  'harnessFamily',
  'outcome',
  'hostVersion',
  'probedOn',
  'fastMappingIdentity',
]);
const EFFORT_KEY = Object.freeze({ claude: 'effort', codex: 'reasoning_effort' });
// A Claude Code session or subagent identifier: one path segment, never `.` or `..`.
const CLAUDE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
// A Claude Code project directory name: the working directory with every non-alphanumeric
// character replaced by `-`, so it starts with `-`. One segment, never `.` or `..`.
const CLAUDE_PROJECT_RE = /^[A-Za-z0-9-]{1,255}$/;
// The names-only fallback stops listing the projects root after this many entries.
const MAX_PROJECT_ENTRIES = 4096;
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

function hostId(value) {
  return text(value) && /^[A-Za-z0-9](?:[A-Za-z0-9._:/-]|%[0-9A-Fa-f]{2})*$/.test(value);
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
    !object(contract.panelModels) ||
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
  // A panel model is never the harness's deep model: the panel member would only repeat the
  // primary assessor.
  if (Object.keys(contract.panelModels).some((key) => !HARNESSES.includes(key))) invalid();
  for (const harness of HARNESSES) {
    const models = contract.panelModels[harness];
    if (
      !Array.isArray(models) ||
      new Set(models).size !== models.length ||
      models.some((model) => !text(model) || model === contract.mappings.deep[harness].model)
    )
      invalid();
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
      typeof site.panel !== 'boolean' ||
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
    if (
      site.panel &&
      (site.downAllowed ||
        site.clauses.length !== 1 ||
        site.clauses[0].role !== null ||
        site.clauses[0].tier !== 'deep')
    )
      invalid();
  }
  // Only the portable build renders a per-spawn Fast tier, and only at its listed Quality sites.
  if ((contract.target === 'portable') !== Object.hasOwn(contract, 'fast')) invalid();
  if (contract.fast !== undefined) {
    const { fast } = contract;
    if (!object(fast) || !object(fast.mappings) || !Array.isArray(fast.sites)) invalid();
    if (Object.keys(fast).some((key) => !['mappings', 'sites'].includes(key))) invalid();
    if (Object.keys(fast.mappings).some((key) => !HARNESSES.includes(key))) invalid();
    for (const harness of HARNESSES) {
      const mapping = fast.mappings[harness];
      if (
        !object(mapping) ||
        Object.keys(mapping).length !== 2 ||
        !text(mapping.model) ||
        !text(mapping[EFFORT_KEY[harness]]) ||
        mapping.model === contract.mappings.deep[harness].model
      )
        invalid();
    }
    if (
      fast.sites.length === 0 ||
      new Set(fast.sites).size !== fast.sites.length ||
      fast.sites.some((id) => {
        const site = contract.sites.find((entry) => entry.id === id);
        return !site || site.clauses.some(({ tier }) => tier !== 'deep');
      })
    )
      invalid();
  }
  return contract;
}

// The Fast-mapping identity of one harness: lowercase hex SHA-256 of the canonical JSON of its
// Fast values. The build fails when a qualification record carries another identity.
export function fastMappingIdentity(mapping) {
  return createHash('sha256').update(canonical(mapping), 'utf8').digest('hex');
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Validates the shipped harness-qualification record: exactly one portable record per harness
// family. With `fastMappings`, every identity must equal the identity of that harness's mapping.
export function validateFastHarnessQualification(record, { fastMappings } = {}) {
  const invalid = (message) =>
    fail('INVALID_QUALIFICATION', `Fast harness qualification: ${message}`);
  if (!object(record) || Object.keys(record).sort().join(',') !== 'records,schemaVersion')
    invalid('must hold exactly schemaVersion and records');
  if (record.schemaVersion !== 1) invalid('schemaVersion must be 1');
  if (!Array.isArray(record.records)) invalid('records must be an array');
  const seen = new Set();
  for (const entry of record.records) {
    if (
      !object(entry) ||
      Object.keys(entry).sort().join(',') !== [...QUALIFICATION_RECORD_KEYS].sort().join(',')
    )
      invalid(`each record holds exactly ${QUALIFICATION_RECORD_KEYS.join(', ')}`);
    if (entry.installKind !== 'portable') invalid('only portable records are allowed');
    if (!HARNESSES.includes(entry.harnessFamily)) invalid('harnessFamily must be claude or codex');
    if (!QUALIFICATION_OUTCOMES.includes(entry.outcome))
      invalid(`outcome must be one of ${QUALIFICATION_OUTCOMES.join(', ')}`);
    if (
      !(entry.hostVersion === null && entry.outcome !== 'qualified') &&
      !(typeof entry.hostVersion === 'string' && /^\d{1,6}\.\d{1,6}$/.test(entry.hostVersion))
    )
      invalid(
        'hostVersion must be <major>.<minor>, or null only for an outcome other than qualified',
      );
    if (!validDate(entry.probedOn)) invalid('probedOn must be a YYYY-MM-DD date');
    if (
      typeof entry.fastMappingIdentity !== 'string' ||
      !/^[0-9a-f]{64}$/.test(entry.fastMappingIdentity)
    )
      invalid('fastMappingIdentity must be 64 lowercase hex characters');
    const key = `${entry.installKind}:${entry.harnessFamily}`;
    if (seen.has(key)) invalid(`duplicate record for ${key}`);
    seen.add(key);
    if (
      fastMappings &&
      entry.fastMappingIdentity !== fastMappingIdentity(fastMappings[entry.harnessFamily] ?? null)
    )
      invalid(
        `${entry.harnessFamily} fastMappingIdentity differs from the current Fast mapping; a changed mapping needs a new probe`,
      );
  }
  for (const harness of HARNESSES) {
    if (!seen.has(`portable:${harness}`)) invalid(`missing the portable ${harness} record`);
  }
  return record;
}

async function loadQualification(deps) {
  try {
    return validateFastHarnessQualification(
      deps.qualification ??
        JSON.parse(await readBoundedFile(QUALIFICATION_PATH, MAX_QUALIFICATION_BYTES)),
    );
  } catch {
    return null;
  }
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
  if (!HARNESSES.includes(input.harness))
    fail('INVALID_INPUT', 'harness must identify codex or claude');
  for (const key of ['site', 'role', 'tier', 'reason', 'panelModel']) {
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
  let panelSite = false;
  const role = input.role ?? null;
  if (input.site) {
    const site = contract.sites.find((entry) => entry.id === input.site);
    const clause = site?.clauses.find((entry) => entry.role === role);
    if (!clause) fail('INVALID_INPUT', 'Unknown spawn site or incompatible worker role');
    defaultTier = clause.tier;
    downAllowed = site.downAllowed;
    panelSite = site.panel;
  } else if (role) {
    defaultTier = contract.roles[role];
  } else if (input.fallback) {
    defaultTier = 'standard';
  } else {
    fail('INVALID_INPUT', 'A spawn site, worker role, or reasoned explicit fallback is required');
  }
  // A panel site always names its model, and only a panel site may name one. The model must be on
  // the harness's build-generated panel allowlist and differ from the primary deep model.
  if (panelSite !== Object.hasOwn(input, 'panelModel')) {
    fail(
      'INVALID_INPUT',
      panelSite
        ? 'A panel spawn site requires panelModel'
        : 'panelModel is accepted only for a panel spawn site',
    );
  }
  if (panelSite) {
    if (input.native || input.fallback || Object.hasOwn(input, 'tier'))
      fail('INVALID_INPUT', 'A panel selection takes no native role, fallback, or tier move');
    if (input.panelModel === contract.mappings.deep[input.harness].model)
      fail('TIER_POLICY', 'A panel model must differ from the primary deep model');
    if (!contract.panelModels[input.harness].includes(input.panelModel))
      fail('TIER_POLICY', 'The panel model is not on the harness panel allowlist');
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
    model: panelSite ? input.panelModel : mapping.model,
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

// The Fast lookup returns only the portable build's per-spawn Fast values for a site that renders
// a Fast tier line. It authorizes nothing: the eligibility gate and the pilot helper decide Fast.
function fastLookup(input, contract) {
  keys(input, ['harness', 'site']);
  if (!HARNESSES.includes(input.harness))
    fail('INVALID_INPUT', 'harness must identify codex or claude');
  if (!text(input.site)) fail('INVALID_INPUT', 'site must be a bounded non-empty string');
  if (!contract.fast) {
    fail(
      'PROFILE_UNAVAILABLE',
      'This build renders no per-spawn Fast tier; a native build uses its Fast sidecar',
    );
  }
  if (!contract.fast.sites.includes(input.site))
    fail('INVALID_INPUT', 'The spawn site renders no Fast tier');
  const mapping = contract.fast.mappings[input.harness];
  const effort = mapping[EFFORT_KEY[input.harness]];
  return {
    request: { harness: input.harness, site: input.site },
    profile: 'fast',
    contractDigest: createHash('sha256').update(canonical(contract)).digest('hex'),
    expected: { model: mapping.model, effort },
    spawn: { parameters: { model: mapping.model, [EFFORT_KEY[input.harness]]: effort } },
  };
}

function unverified(message) {
  fail('UNVERIFIED', message, { status: 'unverified' });
}

// Structural reading of one Codex rollout: the child identity, its session `cli_version`, and the
// model and effort of every turn context. Any gap is `UNVERIFIED`, never a claim.
function readRollout(contents, parentId, childId) {
  if (!contents.endsWith('\n')) unverified('The rollout is incomplete or not newline-terminated');
  const turns = new Map();
  const taskTurns = new Set();
  let identitySeen = false;
  let cliVersion = null;
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
      if (runtimeToken(payload.cli_version)) cliVersion = payload.cli_version;
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
  return { turns, cliVersion };
}

function parseRollout(contents, parentId, childId, expected) {
  const { turns } = readRollout(contents, parentId, childId);
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

async function plainDirectory(target) {
  try {
    const stat = await lstat(target);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

// The Claude Code projects root: `$CLAUDE_CONFIG_DIR/projects` when that variable holds an
// absolute path, `~/.claude/projects` when it is unset or empty. Any other value is no evidence
// location, so the result stays unverified instead of guessing a storage path.
function claudeProjectsRoot(env, deps) {
  if (deps.claudeProjectsRoot) return deps.claudeProjectsRoot;
  const configDir = env.CLAUDE_CONFIG_DIR;
  if (configDir === undefined || configDir === '')
    return path.join(deps.homedir ?? os.homedir(), '.claude', 'projects');
  if (!text(configDir, 4096) || !path.isAbsolute(configDir))
    unverified('CLAUDE_CONFIG_DIR is not an absolute path');
  return path.join(configDir, 'projects');
}

// The project directory that holds the session: first the working directory's Claude project
// name, an exact path. The helper's working directory may differ from the session's, so it then
// lists the names in the projects root, at most MAX_PROJECT_ENTRIES of them, and accepts the one
// directory holding that session subdirectory. The fallback reads no file and no other session's
// contents, and follows no symlink.
async function claudeProjectDirectory(root, session, deps) {
  const candidate = (deps.cwd ?? process.cwd()).replace(/[^A-Za-z0-9]/g, '-');
  if (
    CLAUDE_PROJECT_RE.test(candidate) &&
    (await plainDirectory(path.join(root, candidate, session)))
  )
    return candidate;
  const matches = [];
  let directory;
  try {
    directory = await opendir(root);
  } catch {
    unverified('The Claude Code project directory is unavailable');
  }
  try {
    let listed = 0;
    for await (const entry of directory) {
      if (++listed > MAX_PROJECT_ENTRIES)
        unverified('The Claude Code project directory holds too many entries to resolve');
      if (
        entry.isDirectory() &&
        CLAUDE_PROJECT_RE.test(entry.name) &&
        (await plainDirectory(path.join(root, entry.name, session)))
      )
        matches.push(entry.name);
    }
  } finally {
    // Async iteration closes the handle itself when it completes.
    try {
      await directory.close();
    } catch {}
  }
  if (matches.length !== 1) unverified('The session directory cannot be resolved uniquely');
  return matches[0];
}

// Resolves exactly `<projects>/<project>/<session>/subagents/agent-<agentId>.jsonl`. The helper
// reads two environment values: the session from `CLAUDE_CODE_SESSION_ID` and the projects root
// from `CLAUDE_CONFIG_DIR`. No other history is read, and no symlinked directory is followed.
async function claudeTranscriptPath(agentId, deps) {
  const env = deps.env ?? process.env;
  const session = env.CLAUDE_CODE_SESSION_ID;
  if (typeof session !== 'string' || !CLAUDE_ID_RE.test(session))
    unverified('No Claude Code session identity is available');
  const root = claudeProjectsRoot(env, deps);
  const project = await claudeProjectDirectory(root, session, deps);
  const projectDir = path.join(root, project);
  const subagents = path.join(projectDir, session, 'subagents');
  if (!(await plainDirectory(projectDir)) || !(await plainDirectory(subagents)))
    unverified('The session subagent directory is unavailable or not a plain directory');
  const file = path.join(subagents, `agent-${agentId}.jsonl`);
  if (path.dirname(file) !== subagents || path.relative(subagents, file).includes(path.sep))
    unverified('The transcript path leaves the session subagent directory');
  return { file, session };
}

// Reads only `type: assistant` entries, and from them only `message.model`, `effort` and the host
// `version`. Every entry must name this session and this agent. Content, cwd, branch and task
// text are never returned.
function readClaudeTranscript(contents, session, agentId) {
  if (!contents.endsWith('\n'))
    unverified('The transcript is incomplete or not newline-terminated');
  const turns = [];
  for (const line of contents.slice(0, -1).split('\n')) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      unverified('The transcript contains malformed JSON');
    }
    if (!object(entry) || !text(entry.type))
      unverified('The transcript contains a malformed entry');
    if (entry.sessionId !== session || entry.agentId !== agentId)
      unverified('A transcript entry does not belong to this session and agent');
    if (entry.type !== 'assistant') continue;
    const model = object(entry.message) ? entry.message.model : undefined;
    // Claude Code records host-generated notices as `<synthetic>`; they are no model turn.
    if (model === '<synthetic>') continue;
    if (!text(model) || !runtimeToken(entry.effort) || !runtimeToken(entry.version))
      unverified('An assistant entry lacks its model, effort, or host version');
    turns.push({ model, effort: entry.effort, hostVersion: entry.version });
  }
  if (turns.length === 0) unverified('The transcript holds no assistant turn');
  return turns;
}

function aliasResolves(harness, observed, alias) {
  if (observed === alias) return true;
  if (harness !== 'claude') return false;
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^claude-${escaped}-[A-Za-z0-9][A-Za-z0-9._\\[\\]-]*$`).test(observed);
}

function majorMinor(version) {
  const match =
    typeof version === 'string' ? version.match(/^(\d{1,6})\.(\d{1,6})(?:[.+-]|$)/) : null;
  return match ? `${match[1]}.${match[2]}` : null;
}

// Fast compliance: `verified` only when every observed turn resolves to the Fast alias, not to the
// `deep` model, with the Fast effort, on a host whose major.minor equals the installed qualified
// record of a matching Fast-mapping identity; otherwise `mismatch`.
function judgeFast(harness, turns, contract, qualification) {
  const fast = contract.fast.mappings[harness];
  const deep = contract.mappings.deep[harness].model;
  const record = qualification?.records.find(
    (entry) => entry.installKind === 'portable' && entry.harnessFamily === harness,
  );
  if (!record) unverified('No installed harness qualification record is readable');
  const reasons = new Set();
  if (
    record.outcome !== 'qualified' ||
    record.hostVersion === null ||
    record.fastMappingIdentity !== fastMappingIdentity(fast)
  )
    reasons.add('qualification');
  for (const turn of turns) {
    if (
      !aliasResolves(harness, turn.model, fast.model) ||
      turn.model === deep ||
      aliasResolves(harness, turn.model, deep)
    )
      reasons.add('model');
    if (turn.effort !== fast[EFFORT_KEY[harness]]) reasons.add('effort');
    const version = majorMinor(turn.hostVersion);
    if (version === null) unverified('The host version is not a major.minor version');
    if (version !== record.hostVersion) reasons.add('host-version');
  }
  const modelCompliance = reasons.size === 0 ? 'verified' : 'mismatch';
  return {
    profile: 'fast',
    status: modelCompliance,
    modelCompliance,
    reasons: [...reasons].sort(),
    observedTurns: turns.length,
    observed: [...new Map(turns.map((turn) => [canonical(turn), turn])).values()],
  };
}

async function verifyFast(input, selection, contract, deps) {
  try {
    if (!input.evidence) unverified('No supported runtime evidence was supplied');
    const harness = selection.request.harness;
    let turns;
    if (harness === 'claude' && input.evidence.kind === 'claude-subagent-transcript') {
      const { file, session } = await claudeTranscriptPath(input.evidence.agentId, deps);
      let contents;
      try {
        contents = await readBoundedFile(file, MAX_EVIDENCE_BYTES);
      } catch {
        unverified('Cannot safely read the bounded regular transcript file');
      }
      turns = readClaudeTranscript(contents, session, input.evidence.agentId);
    } else if (harness === 'codex' && input.evidence.kind === 'codex-rollout') {
      if (!Object.hasOwn(input, 'parentId'))
        unverified('No parent and child handle names the Codex rollout identity');
      const contents = await readRolloutFile(input.evidence.path);
      const rollout = readRollout(contents, input.parentId, input.childId);
      if (rollout.cliVersion === null) unverified('The rollout session names no host version');
      turns = [...rollout.turns.values()].map((turn) => ({
        ...turn,
        hostVersion: rollout.cliVersion,
      }));
    } else {
      unverified('No supported runtime adapter is available for this evidence and harness');
    }
    return judgeFast(harness, turns, contract, await loadQualification(deps));
  } catch (error) {
    if (!(error instanceof ModelSelectionError) || error.code !== 'UNVERIFIED') throw error;
    return {
      profile: 'fast',
      status: 'unverified',
      modelCompliance: 'unverified',
      reason: error.message,
    };
  }
}

async function readRolloutFile(filename) {
  if (!text(filename, 4096) || !path.isAbsolute(filename)) {
    unverified('Runtime evidence must name an absolute rollout file path');
  }
  try {
    return await readBoundedFile(filename, MAX_EVIDENCE_BYTES);
  } catch {
    unverified('Cannot safely read the bounded regular rollout file');
  }
}

// A Fast verification is well-formed without evidence or handles and then reports `unverified`;
// handles that are present must still be distinct and bounded.
function verifyInput(input) {
  keys(input, ['selection', 'parentId', 'childId', 'evidence']);
  const fast = object(input.selection) && input.selection.profile === 'fast';
  if (input.evidence) {
    if (!object(input.evidence) || !text(input.evidence.kind))
      fail('INVALID_INPUT', 'evidence must name a supported adapter kind');
    if (input.evidence.kind === 'claude-subagent-transcript') {
      keys(input.evidence, ['kind', 'agentId']);
      // The agent ID becomes one file-name segment; anything else could leave `subagents/`.
      if (typeof input.evidence.agentId !== 'string' || !CLAUDE_ID_RE.test(input.evidence.agentId))
        fail('INVALID_INPUT', 'agentId must be the bare agent ID from the Agent tool result');
      if (Object.hasOwn(input, 'parentId') || Object.hasOwn(input, 'childId'))
        fail(
          'INVALID_INPUT',
          'The transcript adapter binds the session and agent, not parentId or childId',
        );
      return;
    }
    keys(input.evidence, ['kind', 'path']);
  }
  if (fast && !Object.hasOwn(input, 'parentId') && !Object.hasOwn(input, 'childId')) return;
  if (!hostId(input.parentId) || !hostId(input.childId) || input.parentId === input.childId) {
    fail('INVALID_INPUT', 'Distinct bounded parentId and childId values are required');
  }
}

async function verify(input, contract, deps = {}) {
  verifyInput(input);
  const fast = input.selection?.profile === 'fast';
  let selection;
  try {
    selection = fast
      ? fastLookup(input.selection?.request, contract)
      : select(input.selection?.request, contract);
  } catch {
    fail('INVALID_SELECTION', 'The supplied selection cannot be recomputed');
  }
  if (!isDeepStrictEqual(input.selection, selection))
    fail('INVALID_SELECTION', 'The supplied selection does not match the current contract');
  if (fast) return verifyFast(input, selection, contract, deps);
  if (!input.evidence) unverified('No supported runtime evidence was supplied');
  if (selection.request.harness !== 'codex' || input.evidence.kind !== 'codex-rollout') {
    unverified('No supported runtime adapter is available for this evidence and harness');
  }
  const contents = await readRolloutFile(input.evidence.path);
  return parseRollout(contents, input.parentId, input.childId, selection.expected);
}

export async function executeOperation(operation, input = {}, deps = {}) {
  try {
    if (!MODEL_SELECTION_OPERATIONS.includes(operation))
      fail('INVALID_INPUT', 'Unknown model-selection operation');
    const contract = await loadContract(deps);
    const data =
      operation === 'select'
        ? select(input, contract)
        : operation === 'fast'
          ? fastLookup(input, contract)
          : await verify(input, contract, deps);
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
