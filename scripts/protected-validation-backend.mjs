// Raw GitHub REST responses enter here. No fixture or caller can inject a trusted verdict.
import { execFileSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
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
} from '../src/scripts/protected-validation-protocol.mjs';
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
        events[0].sourceCommit === preparation.snapshotCommit,
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
export function readImmutableClosure({ read = ghRead, repository, commit, policy }) {
  validatePolicy(policy);
  const root = `repos/${repository}`;
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
