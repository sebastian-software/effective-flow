// Raw GitHub REST responses enter here. No fixture or caller can inject a trusted verdict.
import { execFileSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import {
  WORKFLOW_PATH,
  RUNNER_PATH,
  VALIDATION_COMMANDS,
  REQUIRED_NATIVE_CASES,
  VALIDATION_ENVIRONMENT,
  CLOSURE_PATHS,
  REQUIRED_BACKEND_STEPS,
  canonicalJSON,
  validationDigest,
  validateBackendEvidence,
  validatePolicy,
  PUBLISHED_SOURCE_PROTOCOL,
  PUBLISHED_SOURCE_KIND,
  PUBLISHED_REPOSITORY,
  PUBLISHED_CLOSURE_PATHS,
  VALIDATION_HISTORY_DEPTH,
  publishedRef,
  assertExact,
  validateOid,
  validateRelative,
  validateFileEntry,
  validatePublishedPreparation,
  validatePublishedPolicy,
  validateWorkflowIsolation,
} from '../src/scripts/protected-validation-protocol.mjs';
import { classify } from '../src/scripts/protected-validation-core.mjs';
import { nativeOutcomes } from './protected-macos-validation.mjs';
export const REQUIRED_STEPS = REQUIRED_BACKEND_STEPS;
export { CLOSURE_PATHS };
const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};
const same = (a, b) => canonicalJSON(a) === canonicalJSON(b);
export function ghRead(endpoint) {
  ensure(
    typeof endpoint === 'string' && endpoint.startsWith('repos/') && !/[\r\n\0]/.test(endpoint),
    'bounded GitHub REST endpoint required',
  );
  return execFileSync('gh', ['api', '--method', 'GET', endpoint], {
    encoding: null,
    timeout: 120000,
    maxBuffer: 80 * 1024 * 1024,
  });
}
function jsonResponse(bytes) {
  ensure(Buffer.isBuffer(bytes) && bytes.length <= 16 * 1024 * 1024, 'backend JSON size exceeded');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
export function unzipLogs(bytes) {
  ensure(
    Buffer.isBuffer(bytes) && bytes.length >= 22 && bytes.length <= 80 * 1024 * 1024,
    'bounded complete raw log ZIP required',
  );
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--)
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      end = offset;
      break;
    }
  ensure(
    end >= 0 && end + 22 + bytes.readUInt16LE(end + 20) === bytes.length,
    'truncated or redirected log archive',
  );
  ensure(
    bytes.readUInt16LE(end + 4) === 0 && bytes.readUInt16LE(end + 6) === 0,
    'split log archive unsupported',
  );
  const count = bytes.readUInt16LE(end + 10),
    centralSize = bytes.readUInt32LE(end + 12),
    centralStart = bytes.readUInt32LE(end + 16);
  ensure(
    count > 0 &&
      count <= 100 &&
      centralStart + centralSize === end &&
      bytes.readUInt16LE(end + 8) === count,
    'incomplete log archive directory',
  );
  const result = new Map();
  let cursor = centralStart,
    total = 0;
  for (let index = 0; index < count; index++) {
    ensure(
      cursor + 46 <= end && bytes.readUInt32LE(cursor) === 0x02014b50,
      'invalid ZIP central header',
    );
    const flags = bytes.readUInt16LE(cursor + 8),
      compression = bytes.readUInt16LE(cursor + 10),
      compressed = bytes.readUInt32LE(cursor + 20),
      size = bytes.readUInt32LE(cursor + 24),
      nameLength = bytes.readUInt16LE(cursor + 28),
      extra = bytes.readUInt16LE(cursor + 30),
      comment = bytes.readUInt16LE(cursor + 32),
      attributes = bytes.readUInt32LE(cursor + 38),
      local = bytes.readUInt32LE(cursor + 42);
    ensure(
      !(flags & 1) &&
        [0, 8].includes(compression) &&
        size <= 64 * 1024 * 1024 &&
        ((attributes >>> 16) & 0o170000) !== 0o120000,
      'unsafe or oversized ZIP member',
    );
    ensure(cursor + 46 + nameLength + extra + comment <= end, 'truncated ZIP member');
    const name = new TextDecoder('utf-8', { fatal: true }).decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );
    ensure(
      name &&
        !name.startsWith('/') &&
        !name.includes('\\') &&
        !/[\0\r\n]/.test(name) &&
        name.split('/').every((p) => p && p !== '.' && p !== '..') &&
        !result.has(name),
      'unsafe or duplicate ZIP path',
    );
    ensure(
      local + 30 <= centralStart && bytes.readUInt32LE(local) === 0x04034b50,
      'invalid ZIP local header',
    );
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    ensure(
      start + compressed <= centralStart &&
        bytes
          .subarray(local + 30, local + 30 + bytes.readUInt16LE(local + 26))
          .equals(Buffer.from(name)),
      'ZIP local identity mismatch',
    );
    const body = bytes.subarray(start, start + compressed),
      expanded =
        compression === 0 ? body : inflateRawSync(body, { maxOutputLength: 64 * 1024 * 1024 });
    total += expanded.length;
    ensure(expanded.length === size && total <= 128 * 1024 * 1024, 'ZIP expansion size mismatch');
    result.set(name, new TextDecoder('utf-8', { fatal: true }).decode(expanded));
    cursor += 46 + nameLength + extra + comment;
  }
  ensure(cursor === end, 'extra ZIP central directory bytes');
  return result;
}
function strippedLog(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/^\d{4}-\d\d-\d\dT[0-9:.]+Z /, ''))
    .join('\n');
}
export function parseExecutionLogs(text, preparation, policy, runId, runAttempt, rawDigest) {
  const clean = strippedLog(text),
    lines = clean.split('\n');
  const events = lines
    .filter((line) => line.startsWith('EF_PROTECTED_VALIDATION '))
    .map((line) => JSON.parse(line.slice(24)));
  const expected = [
    'materialization',
    'environment',
    ...VALIDATION_COMMANDS.flatMap((command) =>
      command === 'pnpm test'
        ? ['command-start', 'command-end', 'native-cases']
        : ['command-start', 'command-end'],
    ),
    'completed',
  ];
  ensure(
    same(
      events.map((e) => e.type),
      expected,
    ),
    'missing, duplicate, reordered or forged runner events',
  );
  const materialization = events[0],
    environment = events[1];
  ensure(
    materialization.sourceCommit === preparation.snapshotCommit &&
      materialization.sourceHead === preparation.localSnapshot.head &&
      materialization.executionTree === preparation.executionTree &&
      materialization.materializationDigest === preparation.materializationManifestRef.digest &&
      /^[a-f0-9]{40}$/.test(materialization.executionCommit),
    'materialization does not match approved source',
  );
  ensure(
    same(environment.environment, VALIDATION_ENVIRONMENT) &&
      environment.platform === 'darwin' &&
      environment.arch === 'arm64' &&
      environment.machine === 'arm64' &&
      typeof environment.osVersion === 'string' &&
      environment.osVersion.startsWith('15.') &&
      environment.codex.path === '/opt/homebrew/bin/codex' &&
      environment.codex.version === VALIDATION_ENVIRONMENT.codexVersion &&
      /^sha256:[a-f0-9]{64}$/.test(environment.codex.digest) &&
      typeof environment.runnerImage === 'string' &&
      !environment.runnerImage.includes('undefined'),
    'actual runner environment identity missing',
  );
  ensure(
    same(environment.closure, policy.executionClosure),
    'executed closure differs from approved bytes',
  );
  const commands = [];
  let position = 2,
    testText = '';
  for (let index = 0; index < VALIDATION_COMMANDS.length; index++) {
    const command = VALIDATION_COMMANDS[index],
      start = events[position++],
      finish = events[position++];
    ensure(
      start.command === command &&
        finish.command === command &&
        start.index === index &&
        finish.index === index &&
        finish.exitCode === 0,
      'actual command failed or differs',
    );
    commands.push({ command, exitCode: finish.exitCode });
    if (command === 'pnpm test') {
      const begin = lines.indexOf('EF_PROTECTED_VALIDATION ' + JSON.stringify(start)),
        end = lines.indexOf('EF_PROTECTED_VALIDATION ' + JSON.stringify(finish));
      ensure(begin >= 0 && end > begin, 'native TAP command interval missing');
      testText = lines.slice(begin + 1, end).join('\n');
      const cases = nativeOutcomes(testText),
        observation = events[position++];
      ensure(
        same(cases, observation.nativeCases) && cases.every((c) => c.outcome === 'passed'),
        'skipped/forged native case outcomes',
      );
    }
  }
  ensure(events.at(-1).executionTree === preparation.executionTree, 'completion tree mismatch');
  return {
    runId,
    runAttempt,
    complete: true,
    rawDigest,
    environment: VALIDATION_ENVIRONMENT,
    executionTree: preparation.executionTree,
    executionClosureDigest: validationDigest(policy.executionClosure),
    commands,
    nativeCases: nativeOutcomes(testText),
    materialized: true,
    codexBinaryDigest: environment.codex.digest,
    runnerImage: environment.runnerImage,
  };
}
export function parseFailedExecutionLogs(text, preparation, policy, runId, runAttempt, rawDigest) {
  const clean = strippedLog(text),
    lines = clean.split('\n'),
    events = lines
      .filter((line) => line.startsWith('EF_PROTECTED_VALIDATION '))
      .map((line) => JSON.parse(line.slice(24)));
  const expected = [
    'materialization',
    'environment',
    ...VALIDATION_COMMANDS.flatMap((command) =>
      command === 'pnpm test'
        ? ['command-start', 'command-end', 'native-cases']
        : ['command-start', 'command-end'],
    ),
    'completed',
  ];
  ensure(
    same(
      events.map((e) => e.type),
      expected.slice(0, events.length),
    ),
    'contradictory failed-run event order',
  );
  const materialized = events[0]?.type === 'materialization',
    env = events.find((e) => e.type === 'environment');
  if (materialized)
    ensure(
      events[0].executionTree === preparation.executionTree &&
        events[0].sourceCommit === preparation.snapshotCommit &&
        events[0].sourceHead === preparation.localSnapshot.head,
      'failed materialization differs',
    );
  if (env)
    ensure(
      same(env.environment, policy.environment) && same(env.closure, policy.executionClosure),
      'failed environment differs',
    );
  const commands = [];
  let testText = '';
  for (const end of events.filter((e) => e.type === 'command-end')) {
    const index = commands.length,
      command = VALIDATION_COMMANDS[index],
      start = events.find((e) => e.type === 'command-start' && e.index === index);
    ensure(
      start?.command === command &&
        end.command === command &&
        end.index === index &&
        Number.isSafeInteger(end.exitCode),
      'failed actual command order invalid',
    );
    commands.push({ command, exitCode: end.exitCode });
    if (command === 'pnpm test') {
      const begin = lines.indexOf('EF_PROTECTED_VALIDATION ' + JSON.stringify(start)),
        finish = lines.indexOf('EF_PROTECTED_VALIDATION ' + JSON.stringify(end));
      ensure(begin >= 0 && finish > begin, 'failed native TAP interval missing');
      testText = lines.slice(begin + 1, finish).join('\n');
    }
  }
  const nativeCases = nativeOutcomes(testText, { complete: false });
  return {
    runId,
    runAttempt,
    complete: true,
    rawDigest,
    environment: env ? policy.environment : null,
    executionTree: materialized ? preparation.executionTree : null,
    executionClosureDigest: env ? validationDigest(policy.executionClosure) : null,
    commands,
    nativeCases,
    materialized,
    codexBinaryDigest: env?.codex?.digest ?? null,
    runnerImage: env?.runnerImage ?? null,
  };
}
export function readImmutableClosure({ read = ghRead, repository, commit, policy, preparation }) {
  validatePolicy(policy);
  const root = `repos/${repository}`;
  ensure(commit === preparation.snapshotCommit, 'immutable snapshot commit differs');
  const actualCommit = jsonResponse(read(`${root}/git/commits/${commit}`));
  ensure(
    actualCommit.sha === commit &&
      actualCommit.tree?.sha === preparation.snapshotTree &&
      Array.isArray(actualCommit.parents) &&
      actualCommit.parents.length === 1 &&
      actualCommit.parents[0]?.sha === preparation.localSnapshot.head,
    'immutable snapshot tree or source history parent differs',
  );
  const tree = jsonResponse(read(`${root}/git/trees/${commit}?recursive=1`));
  ensure(tree.truncated === false && Array.isArray(tree.tree), 'incomplete immutable Git tree');
  for (const [key, path] of Object.entries(CLOSURE_PATHS)) {
    const entry = tree.tree.find((e) => e.path === path);
    ensure(
      entry?.type === 'blob' && entry.mode === '100644',
      'immutable closure file missing or unsafe',
    );
    const blob = jsonResponse(read(`${root}/git/blobs/${entry.sha}`));
    ensure(
      blob.encoding === 'base64' && blob.size <= 1024 * 1024,
      'invalid immutable closure blob',
    );
    ensure(
      validationDigest(Buffer.from(blob.content, 'base64')) === policy.executionClosure[key],
      'immutable execution closure drift: ' + path,
    );
  }
  return tree;
}
export function observeBackend({ read = ghRead, request, preparation, policy, runId, runAttempt }) {
  ensure(
    Number.isSafeInteger(runId) && runId > 0 && runAttempt === 1,
    'explicit actual run/attempt required',
  );
  const base = `repos/${policy.repository}/actions/runs/${runId}/attempts/${runAttempt}`;
  const rawMetadata = read(base),
    m = jsonResponse(rawMetadata);
  const metadata = {
    repository: m.repository?.full_name,
    runId: m.id,
    runAttempt: m.run_attempt,
    event: m.event,
    headBranch: m.head_branch,
    headSha: m.head_sha,
    workflowPath: m.path?.split('@')[0],
    status: m.status,
    conclusion: m.conclusion,
    createdAt: m.created_at,
    runStartedAt: m.run_started_at,
    updatedAt: m.updated_at,
  };
  ensure(
    metadata.runId === runId &&
      metadata.runAttempt === runAttempt &&
      metadata.repository === policy.repository &&
      metadata.event === 'push' &&
      metadata.headBranch === preparation.snapshotBranch &&
      metadata.headSha === preparation.snapshotCommit &&
      metadata.workflowPath === policy.workflowPath,
    'foreign requested backend attempt',
  );
  const rawJobs = read(base + '/jobs?per_page=100'),
    j = jsonResponse(rawJobs);
  ensure(
    Number.isSafeInteger(j.total_count) && j.total_count === j.jobs?.length && j.total_count <= 100,
    'backend job pagination incomplete',
  );
  const jobs = j.jobs.map((job) => ({
    runId: job.run_id,
    runAttempt: job.run_attempt,
    id: job.id,
    name: job.name,
    status: job.status,
    conclusion: job.conclusion,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    runnerName: job.runner_name,
    runnerGroupName: job.runner_group_name,
    labels: job.labels,
    steps: job.steps.map((step) => ({
      name: step.name,
      number: step.number,
      status: step.status,
      conclusion: step.conclusion,
      startedAt: step.started_at,
      completedAt: step.completed_at,
    })),
  }));
  if (metadata.status !== 'completed') return { state: 'pending', metadata, rawMetadata, rawJobs };

  ensure(jobs.length === 1, 'one authoritative validation job required');
  if (metadata.conclusion === 'success')
    ensure(
      REQUIRED_STEPS.every(
        (name) => jobs[0].steps.filter((step) => step.name === name).length === 1,
      ),
      'required backend steps absent',
    );
  readImmutableClosure({
    read,
    repository: policy.repository,
    commit: preparation.snapshotCommit,
    policy,
    preparation,
  });
  const rawLogs = read(base + '/logs'),
    archive = unzipLogs(rawLogs),
    step = jobs[0].steps.find((s) => s.name === REQUIRED_STEPS.at(-1));
  const exactLogs = [...archive].filter(([name]) =>
    new RegExp('^[0-9]+_' + jobs[0].name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.txt$').test(
      name,
    ),
  );
  ensure(exactLogs.length === 1, 'full exact backend execution-step log missing');
  const jobText = exactLogs[0][1];
  if (metadata.conclusion !== 'success') {
    const logs = parseFailedExecutionLogs(
      jobText,
      preparation,
      policy,
      runId,
      runAttempt,
      validationDigest(rawLogs),
    );
    const evidence = { metadata, jobs, logs },
      verdict = validateBackendEvidence(evidence, request, preparation, policy);
    return { ...verdict, evidence, rawLogs, rawMetadata, rawJobs };
  }
  const startMs = Date.parse(step.startedAt),
    endMs = Date.parse(step.completedAt) + 999;
  ensure(
    Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs,
    'invalid execution step interval',
  );
  const boundedLines = jobText.split('\n').filter((line) => {
    const stamp = line.match(/^(?:\uFEFF)?(\d{4}-\d\d-\d\dT[0-9:.]+Z) /)?.[1];
    if (!stamp) return false;
    const at = Date.parse(stamp);
    return at >= startMs && at <= endMs;
  });
  const boundedText = boundedLines.join('\n');
  const allMarkers = jobText
    .split('\n')
    .filter((line) => line.includes('EF_PROTECTED_VALIDATION '));
  ensure(
    allMarkers.length ===
      boundedLines.filter((line) => line.includes('EF_PROTECTED_VALIDATION ')).length,
    'runner evidence outside backend execution step',
  );
  ensure(
    strippedLog(boundedText)
      .split('\n')
      .filter((line) => line === '##[group]Run node scripts/protected-macos-validation.mjs run')
      .length === 1,
    'backend runner command boundary missing',
  );
  for (const [name, pin] of Object.entries(policy.executionClosure.actions)) {
    const repo = {
      checkout: 'actions/checkout',
      pnpm: 'pnpm/action-setup',
      node: 'actions/setup-node',
    }[name];
    ensure(
      strippedLog(jobText)
        .split('\n')
        .filter((line) => line === `Download action repository '${repo}@${pin}' (SHA:${pin})`)
        .length === 1,
      'actual backend action closure missing',
    );
  }
  ensure(
    strippedLog(jobText)
      .split('\n')
      .some((line) => line === 'Image: macos-15-arm64' || line === 'Image: macos-15'),
    'actual backend runner image missing',
  );
  const logs = parseExecutionLogs(
    boundedText,
    preparation,
    policy,
    runId,
    runAttempt,
    validationDigest(rawLogs),
  );
  const evidence = { metadata, jobs, logs },
    verdict = validateBackendEvidence(evidence, request, preparation, policy);
  return { ...verdict, evidence, rawLogs, rawMetadata, rawJobs };
}

function publishedJSONResponse(bytes) {
  try {
    return jsonResponse(bytes);
  } catch {
    throw new Error('malformed published backend response');
  }
}
function publishedTree(read, root, commit, currentSource = true) {
  const tree = publishedJSONResponse(read(`${root}/git/trees/${commit}?recursive=1`));
  ensure(
    tree.truncated === false && Array.isArray(tree.tree) && tree.tree.length <= 20000,
    'incomplete published tree',
  );
  const seen = new Set();
  for (const entry of tree.tree) {
    ensure(typeof entry.path === 'string' && !seen.has(entry.path), 'duplicate published member');
    seen.add(entry.path);
    validateRelative(entry.path);
    validateOid(entry.sha);
    ensure(
      (entry.type === 'tree' && entry.mode === '040000') ||
        (entry.type === 'blob' && ['100644', '100755'].includes(entry.mode)),
      'unsafe published source member',
    );
    if (currentSource && entry.type === 'blob') {
      try {
        ensure(classify(entry.path, true) === null, 'unsafe current published source');
      } catch {
        throw new Error('unsafe current published source');
      }
    }
  }
  return tree;
}
// GitHub's authenticated exact-SHA source archive stays in bounded RAM only.
// Its complete bytes are checked against the independently read Git tree and blob OIDs.
export function unzipPublishedArchive({ bytes, sourceCommit, tree }) {
  publishedRef(sourceCommit);
  ensure(
    Buffer.isBuffer(bytes) && bytes.length >= 22 && bytes.length <= 80 * 1024 * 1024,
    'bounded published source ZIP required',
  );
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--)
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      end = offset;
      break;
    }
  ensure(
    end >= 0 &&
      end + 22 + bytes.readUInt16LE(end + 20) === bytes.length &&
      bytes.readUInt16LE(end + 4) === 0 &&
      bytes.readUInt16LE(end + 6) === 0,
    'incomplete published source ZIP',
  );
  const commentLength = bytes.readUInt16LE(end + 20);
  ensure(
    commentLength === 0 ||
      (commentLength === 40 && bytes.subarray(end + 22).toString('ascii') === sourceCommit),
    'published ZIP commit comment differs',
  );
  const count = bytes.readUInt16LE(end + 10),
    centralSize = bytes.readUInt32LE(end + 12),
    centralStart = bytes.readUInt32LE(end + 16);
  ensure(
    count > 0 &&
      count <= 40000 &&
      bytes.readUInt16LE(end + 8) === count &&
      centralStart + centralSize === end,
    'incomplete published ZIP membership',
  );
  const expected = new Map(
    tree.tree.filter((entry) => entry.type === 'blob').map((entry) => [entry.path, entry]),
  );
  ensure(expected.size > 0 && expected.size <= 20000, 'invalid published tree membership');
  const directories = new Set(
    tree.tree.filter((entry) => entry.type === 'tree').map((entry) => entry.path),
  );
  const crcTable = Array.from({ length: 256 }, (_, value) => {
    let current = value;
    for (let bit = 0; bit < 8; bit++) current = (current >>> 1) ^ (current & 1 ? 0xedb88320 : 0);
    return current >>> 0;
  });
  const crc32 = (body) => {
    let crc = 0xffffffff;
    for (const byte of body) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    return (crc ^ 0xffffffff) >>> 0;
  };
  const result = new Map(),
    seen = new Set(),
    intervals = [];
  let cursor = centralStart,
    total = 0,
    archiveRoot;
  for (let index = 0; index < count; index++) {
    ensure(
      cursor + 46 <= end && bytes.readUInt32LE(cursor) === 0x02014b50,
      'invalid published ZIP directory',
    );
    const flags = bytes.readUInt16LE(cursor + 8),
      compression = bytes.readUInt16LE(cursor + 10),
      crc = bytes.readUInt32LE(cursor + 16),
      compressed = bytes.readUInt32LE(cursor + 20),
      size = bytes.readUInt32LE(cursor + 24),
      nameLength = bytes.readUInt16LE(cursor + 28),
      extra = bytes.readUInt16LE(cursor + 30),
      comment = bytes.readUInt16LE(cursor + 32),
      attributes = bytes.readUInt32LE(cursor + 38),
      local = bytes.readUInt32LE(cursor + 42);
    ensure(
      !(flags & ~(0x800 | 8)) &&
        [0, 8].includes(compression) &&
        size <= 16 * 1024 * 1024 &&
        cursor + 46 + nameLength + extra + comment <= end,
      'unsafe published ZIP member',
    );
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength),
      name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes);
    ensure(!seen.has(name) && !/[\\\0\r\n]/.test(name), 'unsafe or duplicate published ZIP name');
    seen.add(name);
    const slash = name.indexOf('/'),
      root = name.slice(0, slash),
      suffix = root.slice('sebastian-software-effective-flow-'.length);
    ensure(
      slash > 0 &&
        root.startsWith('sebastian-software-effective-flow-') &&
        /^[a-f0-9]{7,40}$/.test(suffix) &&
        sourceCommit.startsWith(suffix) &&
        (archiveRoot === undefined || archiveRoot === root),
      'published ZIP source root differs',
    );
    archiveRoot = root;
    const relative = name.slice(slash + 1),
      directory = name.endsWith('/');
    if (relative) validateRelative(directory ? relative.slice(0, -1) : relative);
    const madeBy = bytes.readUInt16LE(cursor + 4),
      unixMode = attributes >>> 16,
      dosAttributes = attributes & 0xffff;
    // Git archive uses DOS creator/version 0 with no Unix bits for non-executable
    // files (attributes 0) and directories (DOS bit 0x10). Executables carry Unix
    // modes. The authenticated tree supplies the canonical Git mode in both forms.
    // Unix archives can retain the safe group-write bit from umask 002; no other
    // permission variation, special type, set-id or sticky bit is admitted.
    const dosPlain = madeBy === 0 && attributes === 0,
      dosDirectory = madeBy === 0 && attributes === 0x10,
      unixPlain =
        madeBy >>> 8 === 3 && dosAttributes === 0 && [0o100644, 0o100664].includes(unixMode),
      unixExecutable =
        madeBy >>> 8 === 3 && dosAttributes === 0 && [0o100755, 0o100775].includes(unixMode),
      unixDirectory =
        madeBy >>> 8 === 3 &&
        [0, 0x10].includes(dosAttributes) &&
        [0o040755, 0o040775].includes(unixMode);
    const archivedGitMode = dosPlain || unixPlain ? '100644' : unixExecutable ? '100755' : null;
    ensure(
      directory ? (dosDirectory || unixDirectory) && size === 0 : archivedGitMode !== null,
      'unsafe published ZIP mode',
    );
    ensure(
      local + 30 <= centralStart &&
        bytes.readUInt32LE(local) === 0x04034b50 &&
        bytes.readUInt16LE(local + 6) === flags &&
        bytes.readUInt16LE(local + 8) === compression,
      'invalid published ZIP local header',
    );
    const localNameLength = bytes.readUInt16LE(local + 26),
      start = local + 30 + localNameLength + bytes.readUInt16LE(local + 28);
    ensure(
      start + compressed <= centralStart &&
        localNameLength === nameBytes.length &&
        bytes.subarray(local + 30, local + 30 + localNameLength).equals(nameBytes),
      'published ZIP local identity differs',
    );
    let localEnd = start + compressed;
    if (flags & 8) {
      ensure(localEnd + 12 <= centralStart, 'incomplete published ZIP data descriptor');
      if (bytes.readUInt32LE(localEnd) === 0x08074b50) localEnd += 4;
      ensure(
        localEnd + 12 <= centralStart &&
          bytes.readUInt32LE(localEnd) === crc &&
          bytes.readUInt32LE(localEnd + 4) === compressed &&
          bytes.readUInt32LE(localEnd + 8) === size,
        'published ZIP descriptor differs',
      );
      localEnd += 12;
    } else
      ensure(
        bytes.readUInt32LE(local + 14) === crc &&
          bytes.readUInt32LE(local + 18) === compressed &&
          bytes.readUInt32LE(local + 22) === size,
        'published ZIP local sizes differ',
      );
    intervals.push([local, localEnd]);
    const body = bytes.subarray(start, start + compressed),
      expanded =
        compression === 0 ? body : inflateRawSync(body, { maxOutputLength: 16 * 1024 * 1024 });
    total += expanded.length;
    ensure(
      expanded.length === size && total <= 128 * 1024 * 1024 && crc32(expanded) === crc,
      'published ZIP integrity differs',
    );
    if (directory)
      ensure(!relative || directories.has(relative.slice(0, -1)), 'extra published ZIP directory');
    else {
      const entry = expected.get(relative);
      ensure(
        entry &&
          !result.has(relative) &&
          archivedGitMode === entry.mode &&
          createHash('sha1')
            .update(Buffer.from(`blob ${expanded.length}\0`))
            .update(expanded)
            .digest('hex') === entry.sha,
        'published archive differs from authenticated Git blob',
      );
      result.set(relative, expanded);
    }
    cursor += 46 + nameLength + extra + comment;
  }
  intervals.sort((a, b) => a[0] - b[0]);
  ensure(
    cursor === end &&
      result.size === expected.size &&
      intervals[0]?.[0] === 0 &&
      intervals.at(-1)?.[1] === centralStart &&
      intervals.every((interval, index) => index === 0 || interval[0] === intervals[index - 1][1]),
    'incomplete, extra or overlapping published archive',
  );
  return result;
}
export function readPublishedAncestry({ read = ghRead, sourceCommit }) {
  publishedRef(sourceCommit);
  const root = `repos/${PUBLISHED_REPOSITORY}`,
    seen = new Map();
  for (let page = 1; page <= Math.ceil(VALIDATION_HISTORY_DEPTH / 100); page++) {
    const values = publishedJSONResponse(
      read(`${root}/commits?sha=${sourceCommit}&per_page=100&page=${page}`),
    );
    ensure(Array.isArray(values) && values.length <= 100, 'incomplete published commit page');
    for (const value of values) {
      validateOid(value.sha);
      ensure(
        !seen.has(value.sha) &&
          seen.size < VALIDATION_HISTORY_DEPTH &&
          Array.isArray(value.parents) &&
          value.parents.length <= 16,
        'duplicate or excessive published ancestry',
      );
      validateOid(value.commit?.tree?.sha);
      const parents = value.parents.map((parent) => validateOid(parent.sha));
      ensure(new Set(parents).size === parents.length, 'ambiguous published parents');
      seen.set(value.sha, { commit: value.sha, tree: value.commit.tree.sha, parents });
    }
    if (values.length < 100) {
      const pending = [sourceCommit],
        reachable = new Set();
      while (pending.length) {
        const oid = pending.pop();
        if (reachable.has(oid)) continue;
        ensure(seen.has(oid), 'incomplete original published parent closure');
        reachable.add(oid);
        pending.push(...seen.get(oid).parents);
      }
      ensure(reachable.size === seen.size, 'foreign unreachable published commits');
      return [...seen.values()].sort((a, b) => a.commit.localeCompare(b.commit, 'en'));
    }
  }
  throw new Error('published ancestry exceeds fixed bound');
}
// These mutable pointers must still name the reviewed immutable source and workflow set.
function readPublishedMutableContext({
  read,
  repository,
  releasePullRequest,
  releaseHeadRef,
  sourceCommit,
}) {
  const root = `repos/${repository}`,
    repo = publishedJSONResponse(read(root));
  ensure(
    repo.full_name === repository && repo.private === false && repo.default_branch === 'main',
    'published repository identity differs',
  );
  const pr = publishedJSONResponse(read(`${root}/pulls/${releasePullRequest}`));
  ensure(
    pr.number === releasePullRequest &&
      pr.state === 'open' &&
      pr.merged === false &&
      pr.base?.ref === 'develop' &&
      pr.base?.repo?.full_name === repository &&
      pr.head?.repo?.full_name === repository &&
      pr.head?.sha === sourceCommit &&
      pr.head?.ref === releaseHeadRef,
    'live final release changed',
  );
  const defaultRef = publishedJSONResponse(read(`${root}/git/ref/heads/main`));
  ensure(
    defaultRef.ref === 'refs/heads/main' && defaultRef.object?.type === 'commit',
    'default branch identity missing',
  );
  validateOid(defaultRef.object.sha);
  return { pr, defaultRef };
}
// A cheap precondition, never qualification: immutable bytes, ancestry and the release stamp
// still require the full fresh proof after the actual hosted evidence and before success.
export function verifyPublishedLiveContext(preparation, { read = ghRead } = {}) {
  validatePublishedPreparation(preparation);
  const actual = readPublishedMutableContext({ ...preparation, read });
  ensure(
    actual.defaultRef.object.sha === preparation.isolation.defaultBranch.commit,
    'live default workflow binding changed',
  );
}
// Every source identity, byte digest and trigger observation comes from authenticated GitHub reads.
export function readPublishedSource({
  read = ghRead,
  repository,
  releasePullRequest,
  releaseHeadRef,
  releaseVersion,
  sourceCommit,
  sourceTree,
}) {
  ensure(repository === PUBLISHED_REPOSITORY, 'fixed published repository required');
  publishedRef(sourceCommit);
  validateOid(sourceTree);
  ensure(
    Number.isSafeInteger(releasePullRequest) &&
      releasePullRequest > 0 &&
      releasePullRequest !== 581 &&
      /^release-please--[A-Za-z0-9_-]+$/.test(releaseHeadRef) &&
      /^\d+\.\d+\.\d+$/.test(releaseVersion),
    'exact release binding required',
  );
  const root = `repos/${repository}`;
  const { pr, defaultRef } = readPublishedMutableContext({
    read,
    repository,
    releasePullRequest,
    releaseHeadRef,
    sourceCommit,
  });
  const ancestry = readPublishedAncestry({ read, sourceCommit });
  ensure(
    ancestry.find((entry) => entry.commit === sourceCommit)?.tree === sourceTree,
    'published release tree differs',
  );
  const tree = publishedTree(read, root, sourceCommit);
  ensure(tree.sha === sourceTree, 'published source tree identity differs');
  const bytes = unzipPublishedArchive({
    bytes: read(`${root}/zipball/${sourceCommit}`),
    sourceCommit,
    tree,
  });
  const files = tree.tree
    .filter((entry) => entry.type === 'blob')
    .map((entry) =>
      validateFileEntry({
        path: entry.path,
        mode: entry.mode,
        digest: validationDigest(bytes.get(entry.path)),
      }),
    )
    .sort((a, b) => a.path.localeCompare(b.path, 'en'));
  ensure(
    publishedJSONResponse(bytes.get('.release-please-manifest.json') ?? Buffer.from('{}'))['.'] ===
      releaseVersion,
    'published release stamp differs',
  );
  const closure = Object.fromEntries(
    Object.entries(PUBLISHED_CLOSURE_PATHS).map(([key, path]) => {
      ensure(
        tree.tree.some((entry) => entry.path === path && entry.mode === '100644') &&
          bytes.has(path),
        'published execution closure missing',
      );
      return [key, validationDigest(bytes.get(path))];
    }),
  );
  const policy = validatePublishedPolicy({
    protocol: PUBLISHED_SOURCE_PROTOCOL,
    kind: PUBLISHED_SOURCE_KIND,
    repository,
    workflowPath: WORKFLOW_PATH,
    executionClosure: {
      ...closure,
      acquisitionAlgorithm: 'published-git-v1',
      actions: {
        checkout: '3d3c42e5aac5ba805825da76410c181273ba90b1',
        pnpm: 'ea17c68df8912ef543352723c149a84f56e3d413',
        node: '820762786026740c76f36085b0efc47a31fe5020',
      },
    },
    commands: VALIDATION_COMMANDS,
    nativeCases: REQUIRED_NATIVE_CASES,
    environment: VALIDATION_ENVIRONMENT,
  });
  const candidateWorkflows = files
    .filter((entry) => entry.path.startsWith('.github/workflows/'))
    .map((entry) => ({ path: entry.path, bytes: bytes.get(entry.path) }));
  const defaultTree =
    defaultRef.object.sha === sourceCommit
      ? tree
      : publishedTree(read, root, defaultRef.object.sha, false);
  const defaultBytes =
    defaultRef.object.sha === sourceCommit
      ? bytes
      : unzipPublishedArchive({
          bytes: read(`${root}/zipball/${defaultRef.object.sha}`),
          sourceCommit: defaultRef.object.sha,
          tree: defaultTree,
        });
  const isolation = {
    candidate: { commit: sourceCommit, workflows: validateWorkflowIsolation(candidateWorkflows) },
    defaultBranch: {
      commit: defaultRef.object.sha,
      workflows: validateWorkflowIsolation(
        defaultTree.tree
          .filter((entry) => entry.type === 'blob' && entry.path.startsWith('.github/workflows/'))
          .map((entry) => ({ path: entry.path, bytes: defaultBytes.get(entry.path) })),
        { candidate: false },
      ),
    },
  };
  // Read the mutable PR and default ref again after all bounded immutable reads.
  ensure(
    same(pr, publishedJSONResponse(read(`${root}/pulls/${releasePullRequest}`))) &&
      same(defaultRef, publishedJSONResponse(read(`${root}/git/ref/heads/main`))),
    'release or workflow isolation changed during inspection',
  );
  return {
    policy,
    isolation,
    sourceFilesDigest: validationDigest(files),
    ancestryDigest: validationDigest(ancestry),
  };
}
export function verifyPublishedBinding(preparation, { read = ghRead } = {}) {
  validatePublishedPreparation(preparation);
  const actual = readPublishedSource({ ...preparation, read });
  for (const key of ['policy', 'isolation', 'sourceFilesDigest', 'ancestryDigest'])
    ensure(same(actual[key], preparation[key]), 'published qualification binding drift');
  return actual;
}
export function parsePublishedExecutionLogs(text, preparation, runId, runAttempt, rawDigest) {
  validatePublishedPreparation(preparation);
  const clean = strippedLog(text),
    lines = clean.split('\n');
  const events = lines
    .filter((line) => line.startsWith('EF_PROTECTED_VALIDATION '))
    .map((line) => JSON.parse(line.slice(24)));
  const types = [
    'source-acquisition',
    'environment',
    ...VALIDATION_COMMANDS.flatMap((command) =>
      command === 'pnpm test'
        ? ['command-start', 'command-end', 'native-cases']
        : ['command-start', 'command-end'],
    ),
    'completed',
  ];
  ensure(
    same(
      events.map((entry) => entry.type),
      types,
    ),
    'missing, duplicate, reordered or forged published runner events',
  );
  const acquisition = events[0],
    env = events[1],
    completion = events.at(-1);
  assertExact(env, [
    'type',
    'environment',
    'platform',
    'arch',
    'osVersion',
    'machine',
    'runnerImage',
    'closure',
    'codex',
  ]);
  assertExact(env.codex, ['path', 'version', 'digest']);
  assertExact(acquisition, [
    'type',
    'protocol',
    'kind',
    'sourceCommit',
    'sourceTree',
    'sourceFilesDigest',
    'ancestryDigest',
    'indexDigest',
    'candidateWorkflowsDigest',
  ]);
  assertExact(completion, [
    'type',
    'protocol',
    'kind',
    'sourceCommit',
    'sourceTree',
    'sourceFilesDigest',
    'ancestryDigest',
    'indexDigest',
    'candidateWorkflowsDigest',
  ]);
  for (const observation of [acquisition, completion]) {
    ensure(
      observation.protocol === PUBLISHED_SOURCE_PROTOCOL &&
        observation.kind === PUBLISHED_SOURCE_KIND &&
        observation.sourceCommit === preparation.sourceCommit &&
        observation.sourceTree === preparation.sourceTree &&
        observation.sourceFilesDigest === preparation.sourceFilesDigest &&
        observation.ancestryDigest === preparation.ancestryDigest &&
        observation.candidateWorkflowsDigest ===
          validationDigest(preparation.isolation.candidate.workflows) &&
        /^sha256:[a-f0-9]{64}$/.test(observation.indexDigest),
      'actual published source observations differ',
    );
  }
  ensure(acquisition.indexDigest === completion.indexDigest, 'execution index changed');
  ensure(
    same(env.environment, VALIDATION_ENVIRONMENT) &&
      env.platform === 'darwin' &&
      env.arch === 'arm64' &&
      env.machine === 'arm64' &&
      typeof env.osVersion === 'string' &&
      env.osVersion.startsWith('15.') &&
      env.codex?.path === '/opt/homebrew/bin/codex' &&
      env.codex.version === VALIDATION_ENVIRONMENT.codexVersion &&
      /^sha256:[a-f0-9]{64}$/.test(env.codex.digest) &&
      typeof env.runnerImage === 'string' &&
      !env.runnerImage.includes('undefined') &&
      same(env.closure, preparation.policy.executionClosure),
    'actual published runner environment differs',
  );
  const commands = [];
  let position = 2,
    testText = '';
  for (let index = 0; index < VALIDATION_COMMANDS.length; index++) {
    const command = VALIDATION_COMMANDS[index],
      start = events[position++],
      finish = events[position++];
    assertExact(start, ['type', 'command', 'index']);
    assertExact(finish, ['type', 'command', 'index', 'exitCode']);
    ensure(
      start.command === command &&
        finish.command === command &&
        start.index === index &&
        finish.index === index &&
        finish.exitCode === 0,
      'published command failed or differs',
    );
    const begin = lines.indexOf('EF_PROTECTED_VALIDATION ' + JSON.stringify(start)),
      end = lines.indexOf('EF_PROTECTED_VALIDATION ' + JSON.stringify(finish));
    ensure(begin >= 0 && end > begin, 'actual command interval missing');
    commands.push({ command, exitCode: 0 });
    if (command === 'pnpm test') {
      testText = lines.slice(begin + 1, end).join('\n');
      const cases = nativeOutcomes(testText),
        observed = events[position++];
      assertExact(observed, ['type', 'nativeCases']);
      ensure(
        same(cases, observed.nativeCases) && cases.every((entry) => entry.outcome === 'passed'),
        'published native TAP differs',
      );
    }
  }
  return {
    runId,
    runAttempt,
    complete: true,
    rawDigest,
    sourceCommit: preparation.sourceCommit,
    sourceTree: preparation.sourceTree,
    sourceFilesDigest: preparation.sourceFilesDigest,
    ancestryDigest: preparation.ancestryDigest,
    executionClosureDigest: validationDigest(preparation.policy.executionClosure),
    commands,
    nativeCases: nativeOutcomes(testText),
    environment: VALIDATION_ENVIRONMENT,
    codexBinaryDigest: env.codex.digest,
    runnerImage: env.runnerImage,
  };
}
export function observePublishedBackend({ read = ghRead, preparation, runId, runAttempt }) {
  validatePublishedPreparation(preparation);
  ensure(
    Number.isSafeInteger(runId) && runId > 0 && runAttempt === 1,
    'explicit original published attempt required',
  );
  verifyPublishedLiveContext(preparation, { read });
  const root = `repos/${PUBLISHED_REPOSITORY}`,
    base = `${root}/actions/runs/${runId}/attempts/1`;
  const rawMetadata = read(base),
    metadata = publishedJSONResponse(rawMetadata);
  ensure(
    metadata.id === runId &&
      metadata.run_attempt === 1 &&
      metadata.repository?.full_name === PUBLISHED_REPOSITORY &&
      metadata.head_repository?.full_name === PUBLISHED_REPOSITORY &&
      metadata.event === 'create' &&
      metadata.head_branch === preparation.qualificationRef &&
      metadata.head_sha === preparation.sourceCommit &&
      metadata.path === WORKFLOW_PATH &&
      Number.isSafeInteger(metadata.workflow_id) &&
      metadata.workflow_id > 0 &&
      metadata.actor?.type === 'User' &&
      metadata.actor.id === metadata.triggering_actor?.id,
    'foreign published backend attempt',
  );
  const workflow = publishedJSONResponse(read(`${root}/actions/workflows/${metadata.workflow_id}`));
  ensure(
    workflow.id === metadata.workflow_id &&
      workflow.path === WORKFLOW_PATH &&
      workflow.state === 'active',
    'actual published workflow differs',
  );
  const ref = publishedJSONResponse(read(`${root}/git/ref/heads/${preparation.qualificationRef}`));
  ensure(
    ref.ref === `refs/heads/${preparation.qualificationRef}` &&
      ref.object?.type === 'commit' &&
      ref.object.sha === preparation.sourceCommit,
    'created branch identity differs',
  );
  ensure(
    ['queued', 'in_progress', 'waiting', 'pending', 'requested', 'completed'].includes(
      metadata.status,
    ),
    'unknown published backend state',
  );
  const rawJobs = read(base + '/jobs?per_page=100'),
    response = publishedJSONResponse(rawJobs);
  ensure(
    response.total_count === response.jobs?.length && response.total_count <= 100,
    'incomplete published job pagination',
  );
  if (metadata.status !== 'completed') return { state: 'pending', rawMetadata, rawJobs };
  ensure(
    metadata.conclusion === 'success' && response.jobs.length === 1,
    'original published attempt failed',
  );
  const job = response.jobs[0];
  ensure(
    job.run_id === runId &&
      job.run_attempt === 1 &&
      Number.isSafeInteger(job.id) &&
      job.id > 0 &&
      job.name === 'protected-validation' &&
      job.status === 'completed' &&
      job.conclusion === 'success' &&
      typeof job.runner_name === 'string' &&
      job.runner_name.length > 0 &&
      job.labels?.includes('macos-15'),
    'actual published job identity differs',
  );
  const validTime = (start, end) =>
    Number.isFinite(Date.parse(start)) &&
    Number.isFinite(Date.parse(end)) &&
    Date.parse(start) <= Date.parse(end);
  ensure(
    validTime(metadata.created_at, metadata.run_started_at) &&
      validTime(metadata.run_started_at, metadata.updated_at) &&
      validTime(job.started_at, job.completed_at) &&
      Date.parse(job.started_at) >= Date.parse(metadata.run_started_at) &&
      Date.parse(job.completed_at) <= Date.parse(metadata.updated_at),
    'published job timing differs',
  );
  ensure(
    Array.isArray(job.steps) &&
      job.steps.length >= REQUIRED_STEPS.length &&
      new Set(job.steps.map((step) => step.number)).size === job.steps.length &&
      job.steps.every(
        (step, index) =>
          Number.isSafeInteger(step.number) &&
          step.number > 0 &&
          (index === 0 || step.number > job.steps[index - 1].number) &&
          step.status === 'completed' &&
          step.conclusion === 'success' &&
          validTime(step.started_at, step.completed_at) &&
          Date.parse(step.started_at) >= Date.parse(job.started_at) &&
          Date.parse(step.completed_at) <= Date.parse(job.completed_at),
      ),
    'incomplete published steps',
  );
  const stepNames = job.steps.map((step) => step.name),
    expectedNames = [
      'Set up job',
      ...REQUIRED_STEPS,
      'Post Set up pinned Node',
      'Post Set up pinned pnpm',
      'Post Checkout immutable validation transport',
      'Complete job',
    ];
  ensure(
    stepNames.every((name) => expectedNames.includes(name)) &&
      new Set(stepNames).size === stepNames.length &&
      same(
        stepNames.filter((name) => REQUIRED_STEPS.includes(name)),
        REQUIRED_STEPS,
      ),
    'unexpected published execution steps',
  );
  const rawLogs = read(base + '/logs'),
    archive = unzipLogs(rawLogs),
    exact = [...archive].filter(([name]) =>
      new RegExp('^[0-9]+_protected-validation\\.txt$').test(name),
    );
  ensure(exact.length === 1, 'complete exact published job log missing');
  const jobText = exact[0][1],
    step = job.steps.find((value) => value.name === REQUIRED_STEPS.at(-1));
  const boundedLines = jobText.split('\n').filter((line) => {
    const stamp = line.match(/^(?:\uFEFF)?(\d{4}-\d\d-\d\dT[0-9:.]+Z) /)?.[1],
      time = Date.parse(stamp);
    return time >= Date.parse(step.started_at) && time <= Date.parse(step.completed_at) + 999;
  });
  ensure(
    jobText.split('\n').filter((line) => line.includes('EF_PROTECTED_VALIDATION ')).length ===
      boundedLines.filter((line) => line.includes('EF_PROTECTED_VALIDATION ')).length,
    'published observations outside execution step',
  );
  const boundedText = boundedLines.join('\n');
  ensure(
    strippedLog(boundedText)
      .split('\n')
      .filter((line) => line === '##[group]Run node scripts/protected-macos-validation.mjs run')
      .length === 1,
    'published runner command boundary missing',
  );
  for (const [name, pin] of Object.entries(preparation.policy.executionClosure.actions)) {
    const repo = {
      checkout: 'actions/checkout',
      pnpm: 'pnpm/action-setup',
      node: 'actions/setup-node',
    }[name];
    ensure(
      strippedLog(jobText)
        .split('\n')
        .filter((line) => line === `Download action repository '${repo}@${pin}' (SHA:${pin})`)
        .length === 1,
      'published backend action pin differs',
    );
  }
  ensure(
    strippedLog(jobText)
      .split('\n')
      .some((line) => ['Image: macos-15-arm64', 'Image: macos-15'].includes(line)),
    'published runner image missing',
  );
  const logs = parsePublishedExecutionLogs(
    boundedText,
    preparation,
    runId,
    runAttempt,
    validationDigest(rawLogs),
  );
  const evidence = {
    protocol: PUBLISHED_SOURCE_PROTOCOL,
    kind: PUBLISHED_SOURCE_KIND,
    metadata,
    jobs: response.jobs,
    logs,
  };
  verifyPublishedBinding(preparation, { read });
  return { state: 'verified', evidence, rawLogs, rawMetadata, rawJobs };
}
