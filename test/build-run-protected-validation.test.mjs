import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CLOSURE_PATHS,
  PROTECTED_VALIDATION_PROTOCOL,
  REQUIRED_BACKEND_STEPS,
  REQUIRED_NATIVE_CASES,
  VALIDATION_COMMANDS,
  VALIDATION_ENVIRONMENT,
  canonicalJSON,
  validationDigest,
} from '../src/scripts/protected-validation-protocol.mjs';
import { prepareValidation, observeValidation } from '../scripts/protected-validation-operator.mjs';
import { sourceBasis, materializeTransport } from '../scripts/protected-validation-projection.mjs';
import {
  nativePolicy,
  nativeSandboxArgs,
} from '../evals/build-context/_scaffold/native-sandbox.mjs';
import {
  prepareProtectedValidation,
  probeProtectedValidationMailbox,
} from '../evals/build-context/_scaffold/protected-validation-host.mjs';

import { HostCoordinator } from '../evals/build-context/_scaffold/host-coordinator.mjs';
import suite from '../evals/build-context/suite.config.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const helper = path.join(repositoryRoot, 'src/scripts/build-run.mjs');
const codex = '/opt/homebrew/bin/codex';
const validatorHandle = '/root/build/validator';
const env = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Validation test',
  GIT_AUTHOR_EMAIL: 'validation@invalid.local',
  GIT_COMMITTER_NAME: 'Validation test',
  GIT_COMMITTER_EMAIL: 'validation@invalid.local',
};
const git = (root, ...args) =>
  execFileSync('git', args, { cwd: root, env, encoding: 'utf8' }).trim();
const ref = (root, name) => ({
  root,
  path: name,
  digest: validationDigest(readFileSync(path.join(root, name))),
});
function write(root, name, value, mode = 0o644) {
  const file = path.join(root, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    typeof value === 'string' || Buffer.isBuffer(value) ? value : canonicalJSON(value) + '\n',
    { flag: 'wx', mode },
  );
  return ref(root, name);
}
function cli(operation, input, cwd = input.runtimeStateRoot) {
  const result = spawnSync(process.execPath, [helper, operation], {
    cwd,
    env,
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 20000,
  });
  assert.equal(result.error, undefined);
  const rows = result.stdout.trim().split('\n');
  assert.equal(rows.length, 1, result.stderr);
  const envelope = JSON.parse(rows[0]);
  assert.equal(result.status === 0, envelope.ok, result.stderr);
  return envelope;
}
function ok(envelope) {
  assert.equal(envelope.ok, true, JSON.stringify(envelope));
  return envelope.result;
}
function refused(envelope, codes) {
  assert.equal(envelope.ok, false, JSON.stringify(envelope));
  assert.ok([].concat(codes).includes(envelope.error.code), JSON.stringify(envelope));
}
function fixture(t) {
  const namespace = realpathSync(mkdtempSync(path.join(tmpdir(), 'flow-protected-journey-')));
  t.after(() => {
    if (!process.env.EF_PROTECTED_VALIDATION_KEEP_FIXTURE)
      rmSync(namespace, { recursive: true, force: true });
    else console.log('retained model-free fixture: ' + namespace);
  });
  const root = path.join(namespace, 'source');
  mkdirSync(root);
  for (const name of Object.values(CLOSURE_PATHS))
    write(root, name, readFileSync(path.join(repositoryRoot, name)));
  write(root, '.gitignore', '.effective-flow/\n.build-context-fixture\n');
  write(root, 'docs/plan/approved.md', '# Feature\n\n**Plan status:** Not implemented\n');
  write(root, 'docs/plan/feature.md', '# Approved integration fixture feature\n');
  write(root, 'test/acceptance.test.mjs', '// Model-free integration fixture acceptance.\n');
  write(root, 'src/product.mjs', 'export const product = 1;\n');
  write(root, 'src/deleted.mjs', 'export const deleted = true;\n');
  write(root, '.github/workflows/ci.yml', 'name: inert original workflow\n');
  git(root, 'init', '--quiet', '--initial-branch=develop');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'fixture');
  mkdirSync(path.join(root, '.effective-flow'));
  write(root, '.effective-flow/memory.json', { runtimeMigration: { directory: { version: 1 } } });
  const closure = Object.fromEntries(
    Object.entries(CLOSURE_PATHS).map(([key, name]) => [
      key,
      validationDigest(readFileSync(path.join(root, name))),
    ]),
  );
  const yaml = readFileSync(path.join(root, CLOSURE_PATHS.workflowDigest), 'utf8');
  const pins = Object.fromEntries(
    [...yaml.matchAll(/uses: ([^@\s]+)@([a-f0-9]{40}) #/g)].map(([, name, sha]) => [name, sha]),
  );
  const policy = {
    protocol: PROTECTED_VALIDATION_PROTOCOL,
    repository: 'sebastian-software/effective-flow',
    workflowPath: CLOSURE_PATHS.workflowDigest,
    executionClosure: {
      ...closure,
      materializationAlgorithm: 'git-tree-v1',
      actions: {
        checkout: pins['actions/checkout'],
        pnpm: pins['pnpm/action-setup'],
        node: pins['actions/setup-node'],
      },
    },
    commands: [...VALIDATION_COMMANDS],
    nativeCases: [...REQUIRED_NATIVE_CASES],
    environment: VALIDATION_ENVIRONMENT,
  };
  const input = {
    runtimeStateRoot: root,
    repositoryIdentity: realpathSync(path.join(root, '.git')),
    runId: 'protected-journey',
    execution: {
      executionRoot: root,
      branch: 'develop',
      head: git(root, 'rev-parse', 'HEAD'),
      origin: 'current-checkout',
      owner: 'build',
    },
    plan: ref(root, 'docs/plan/approved.md'),
    source: {
      instruction: 'Implement the approved Feature plan and retain a delivery branch.',
      restrictions: [],
    },
    runMode: 'non-interactive',
    languages: Object.fromEntries(
      ['source', 'documentation.user', 'documentation.technical', 'workflow', 'forge', 'git'].map(
        (key) => [key, 'en'],
      ),
    ),
    completionCondition: 'All validation gates pass.',
    deliveryRestrictions: ['Do not publish.'],
    sourceAssociation: 'approved-feature-plan',
    allowedRoots: [root],
    remoteValidation: {
      protocol: PROTECTED_VALIDATION_PROTOCOL,
      requiredGates: ['validation', 'final-validation'],
      policyDigest: validationDigest(policy),
    },
  };
  return { namespace, root, policy, input };
}
function start(fx, remote = true) {
  const input = structuredClone(fx.input);
  if (!remote) delete input.remoteValidation;
  const created = ok(cli('create', input));
  const common = {
    runtimeStateRoot: fx.root,
    repositoryIdentity: input.repositoryIdentity,
    runId: input.runId,
    requestDigest: created.requestDigest,
  };
  ok(cli('bind-agent', { ...common, agentHandle: '/root/build' }));
  const authorization = ok(
    cli('authorize-execution', {
      ...common,
      agentHandle: '/root/build',
      mode: 'in-place-delivery',
      executionRoot: fx.root,
      branch: 'feature',
      baseHead: input.execution.head,
      authority: {
        kind: 'source',
        source: 'instruction',
        index: null,
        quote: input.source.instruction,
      },
    }),
  );
  git(fx.root, 'switch', '--quiet', '-c', 'feature');
  ok(
    cli('transition-execution', {
      ...common,
      agentHandle: '/root/build',
      authorization,
      execution: { ...input.execution, branch: 'feature', origin: 'in-place' },
      ownership: null,
    }),
  );
  const evidence = ok(
    cli('retain-evidence', {
      ...common,
      evidenceId: 'validator-judgment',
      content: 'Synthetic local API fixture evidence only; no hosted qualification.\n',
    }),
  );
  const receipt = {
    ...common,
    gate: 'validation',
    outcome: 'passed',
    reason: 'The original validator judged retained execution evidence.',
    evidence: [evidence],
    agentHandle: '/root/build',
  };
  return Object.assign(fx, { created, common, receipt });
}

test('original remote create blocks plain retained receipts before admission and legacy create remains local', (t) => {
  const fx = start(fixture(t));
  const before = readdirSync(
    path.join(fx.root, '.effective-flow/build-runs', fx.input.runId),
  ).sort();
  const pending = ok(
    cli('validation-await-admission', { ...fx.common, validatorHandle, gate: 'validation' }),
  );
  assert.equal(pending.state, 'pending');
  assert.equal(pending.bootstrapRef, null);
  assert.deepEqual(
    readdirSync(path.join(fx.root, '.effective-flow/build-runs', fx.input.runId)).sort(),
    before,
  );
  refused(cli('receipt', fx.receipt), 'REMOTE_VALIDATION_REQUIRED');
  refused(
    cli('validation-await-admission', {
      ...fx.common,
      validatorHandle: '/root/build',
      gate: 'validation',
    }),
    'AGENT_MISMATCH',
  );
  refused(
    cli('validation-await-admission', {
      ...fx.common,
      validatorHandle,
      gate: 'validation',
      remoteValidation: undefined,
      downgrade: true,
    }),
    'INVALID_PAYLOAD',
  );
  const legacy = start(fixture(t), false);
  assert.ok(ok(cli('receipt', legacy.receipt)).digest);
  refused(
    cli('validation-await-admission', { ...legacy.common, validatorHandle, gate: 'validation' }),
    'REMOTE_VALIDATION_REQUIRED',
  );
  assert.throws(
    () =>
      prepareProtectedValidation({
        descriptor: {
          runtimeStateRoot: legacy.root,
          policy: legacy.policy,
          requestRef: legacy.created.request,
        },
        fixtureRoot: legacy.root,
        journalRoot: legacy.namespace,
      }),
    /original create did not require/,
  );
});

// Only raw provider responses are synthetic. The production observer parses every response,
// ZIP log, immutable closure blob and ordered native-case record before publishing a result.
function backendFixture(fx, preparation, mutate = () => {}) {
  const at = '2026-10-22T10:00:00Z',
    end = '2026-10-22T10:01:00Z';
  const metadata = {
    repository: { full_name: fx.policy.repository },
    id: 42,
    run_attempt: 1,
    event: 'push',
    head_branch: preparation.snapshotBranch,
    head_sha: preparation.snapshotCommit,
    path: fx.policy.workflowPath,
    status: 'completed',
    conclusion: 'success',
    created_at: at,
    run_started_at: at,
    updated_at: end,
  };
  const jobs = {
    total_count: 1,
    jobs: [
      {
        run_id: 42,
        run_attempt: 1,
        id: 7,
        name: 'protected-validation',
        status: 'completed',
        conclusion: 'success',
        started_at: at,
        completed_at: end,
        runner_name: 'GitHub Actions synthetic fixture',
        runner_group_name: null,
        labels: ['macos-15'],
        steps: REQUIRED_BACKEND_STEPS.map((name, number) => ({
          name,
          number: number + 1,
          status: 'completed',
          conclusion: 'success',
          started_at: at,
          completed_at: end,
        })),
      },
    ],
  };
  const lines = [
    'Image: macos-15-arm64',
    ...Object.entries(fx.policy.executionClosure.actions).map(
      ([key, pin]) =>
        `Download action repository '${{ checkout: 'actions/checkout', pnpm: 'pnpm/action-setup', node: 'actions/setup-node' }[key]}@${pin}' (SHA:${pin})`,
    ),
    '##[group]Run node scripts/protected-macos-validation.mjs run',
  ];
  const event = (value) => lines.push('EF_PROTECTED_VALIDATION ' + JSON.stringify(value));
  event({
    type: 'materialization',
    sourceCommit: preparation.snapshotCommit,
    sourceHead: preparation.localSnapshot.head,
    executionTree: preparation.executionTree,
    materializationDigest: preparation.materializationManifestRef.digest,
    executionCommit: preparation.executionTree,
  });
  event({
    type: 'environment',
    environment: VALIDATION_ENVIRONMENT,
    platform: 'darwin',
    arch: 'arm64',
    machine: 'arm64',
    osVersion: '15.7',
    runnerImage: 'macos-15-arm64',
    closure: fx.policy.executionClosure,
    codex: {
      path: codex,
      version: '0.163.0',
      digest: validationDigest('synthetic hosted executable fixture'),
    },
  });
  for (const [index, command] of VALIDATION_COMMANDS.entries()) {
    event({ type: 'command-start', command, index });
    if (command === 'pnpm test')
      lines.push(
        ...REQUIRED_NATIVE_CASES.map((name, caseIndex) => `ok ${caseIndex + 1} - ${name}`),
      );
    event({ type: 'command-end', command, index, exitCode: 0 });
    if (command === 'pnpm test')
      event({
        type: 'native-cases',
        nativeCases: REQUIRED_NATIVE_CASES.map((name) => ({ name, outcome: 'passed' })),
      });
  }
  event({ type: 'completed', executionTree: preparation.executionTree });
  const closureFiles = Object.entries(CLOSURE_PATHS).map(([key, name], index) => ({
    path: name,
    mode: '100644',
    type: 'blob',
    sha: String(index + 1).repeat(40),
    bytes: readFileSync(path.join(fx.root, name)),
  }));
  const commitRecord = {
    sha: preparation.snapshotCommit,
    tree: { sha: preparation.snapshotTree },
    parents: [{ sha: preparation.localSnapshot.head }],
  };
  const fixture = { metadata, jobs, lines, closureFiles, commitRecord };
  mutate(fixture);
  const logDir = path.join(fx.namespace, 'logs-' + Math.random().toString(16).slice(2));
  mkdirSync(logDir);
  write(
    logDir,
    '1_protected-validation.txt',
    fixture.lines.map((line) => at.replace('Z', '.000Z') + ' ' + line).join('\n') + '\n',
  );
  execFileSync('/usr/bin/zip', ['-q', 'logs.zip', '1_protected-validation.txt'], { cwd: logDir });
  const base = `repos/${fx.policy.repository}/actions/runs/42/attempts/1`;
  const responses = new Map([
    [base, Buffer.from(JSON.stringify(metadata))],
    [base + '/jobs?per_page=100', Buffer.from(JSON.stringify(jobs))],
    [base + '/logs', fixture.rawLogs ?? readFileSync(path.join(logDir, 'logs.zip'))],
    [
      `repos/${fx.policy.repository}/git/commits/${preparation.snapshotCommit}`,
      Buffer.from(JSON.stringify(commitRecord)),
    ],
    [
      `repos/${fx.policy.repository}/git/trees/${preparation.snapshotCommit}?recursive=1`,
      Buffer.from(
        JSON.stringify({
          truncated: false,
          tree: closureFiles.map(({ bytes, ...entry }) => entry),
        }),
      ),
    ],
    ...closureFiles.map(({ sha, bytes }) => [
      `repos/${fx.policy.repository}/git/blobs/${sha}`,
      Buffer.from(
        JSON.stringify({
          encoding: 'base64',
          size: bytes.length,
          content: bytes.toString('base64'),
        }),
      ),
    ]),
  ]);
  return (endpoint) => {
    assert.ok(responses.has(endpoint), 'unexpected backend request: ' + endpoint);
    return responses.get(endpoint);
  };
}
function nativeWorker(t, fx, policy) {
  const script = `const cp=require('node:child_process'),rl=require('node:readline').createInterface({input:process.stdin});rl.on('line',line=>{const request=JSON.parse(line);const child=cp.spawnSync(process.execPath,[request.helper,request.operation],{cwd:request.input.runtimeStateRoot,input:JSON.stringify(request.input),encoding:'utf8',env:process.env});console.log(JSON.stringify({pid:process.pid,status:child.status,stderr:child.stderr,envelope:JSON.parse(child.stdout)}));});`;
  const child = spawn(codex, nativeSandboxArgs(policy, [process.execPath, '-e', script]), {
    cwd: fx.root,
    env: { ...env, HOME: fx.command.home, CODEX_HOME: fx.command.codexHome },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = [];
  let stderr = '';
  let workerPid;
  child.stderr.on('data', (bytes) => {
    stderr += bytes;
  });
  createInterface({ input: child.stdout }).on('line', (line) => {
    const next = pending.shift();
    if (next) next.resolve(JSON.parse(line));
  });
  child.on('exit', (code) => {
    for (const next of pending.splice(0))
      next.reject(new Error(`native validator exited ${code}: ${stderr}`));
  });
  t.after(() => {
    child.stdin.end();
    child.kill();
  });
  return async (operation, input) => {
    const response = new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
    });
    child.stdin.write(JSON.stringify({ helper, operation, input }) + '\n');
    const answer = await response;
    workerPid ??= answer.pid;
    assert.equal(answer.pid, workerPid, 'the original validator process must continue');
    return answer.envelope;
  };
}

test(
  'real native validator continues create/request/operator/raw-backend/result/gate with exact source identity',
  { timeout: 120000 },
  async (t) => {
    if (process.platform !== 'darwin' || !existsSync(codex))
      return t.skip(
        'requires actual macOS Codex native sandbox; raw API fixtures alone cannot prove admission',
      );
    const fx = start(fixture(t));
    const bare = path.join(fx.namespace, 'origin.git');
    git(fx.namespace, 'init', '--quiet', '--bare', bare);
    git(fx.root, 'remote', 'add', 'origin', bare);
    write(fx.root, '.build-context-fixture', 'model-free integration fixture\n');
    const journal = path.join(fx.namespace, 'journal');
    const coordinator = new HostCoordinator(journal, { suite });
    const build = coordinator.build({
      condition: 'candidate',
      sourceRoot: repositoryRoot,
      outputRoot: path.join(fx.namespace, 'built'),
    });
    const skill = path.join(fx.namespace, 'bundle/effective-flow');
    cpSync(path.join(fx.namespace, 'built/dist/portable/effective-flow'), skill, {
      recursive: true,
    });
    write(path.dirname(skill), 'fixture.json', {});
    const home = path.join(fx.namespace, 'native-home'),
      codexHome = path.join(fx.namespace, 'native-config');
    mkdirSync(home);
    mkdirSync(codexHome);
    const commandFile = path.join(fx.namespace, 'command.json'),
      promptFile = path.join(fx.namespace, 'prompt.txt');
    write(fx.namespace, 'command.json', {
      executable: codex,
      args: [
        'exec',
        '--json',
        '--ignore-user-config',
        '--ignore-rules',
        '-s',
        'workspace-write',
        '-m',
        'gpt-6.1-sol',
        '-c',
        'model_reasoning_effort="high"',
        '-C',
        fx.root,
        '-',
      ],
      home,
      codexHome,
      profile: {
        harness: 'codex-cli',
        model: 'gpt-6.1-sol',
        reasoningEffort: 'high',
        reportedVersion: '0.163.0',
        toolPolicy: 'isolated fixture',
      },
      timeoutMs: 30000,
    });
    write(fx.namespace, 'prompt.txt', 'Model-free protected bridge qualification only.\n');
    // Prepare builds the production policy and initializes native trust without dispatching
    // the configured exec/model command. Only sandbox diagnostics run below.
    const launch = coordinator.prepare({
      condition: 'candidate',
      harness: 'codex-cli',
      complexity: 'simple',
      slot: 1,
      target: 'portable',
      buildSeal: build.seal,
      fixtureRoot: fx.root,
      skillRoot: skill,
      transcriptDir: path.join(codexHome, 'sessions'),
      promptFile,
      commandFile,
      protectedValidation: {
        runtimeStateRoot: fx.root,
        policy: fx.policy,
        requestRef: fx.created.request,
      },
    });
    const state = coordinator.launches.get(launch.launch),
      host = state.protectedValidation,
      policy = state.nativePolicy;
    fx.command = state.command;
    const sessions = realpathSync(path.join(codexHome, 'sessions'));
    assert.ok(
      policy.privatePaths.includes(sessions),
      'production policy must deny the exact sessions subtree',
    );
    assert.equal(
      policy.definition.filesystem[sessions],
      'none',
      'a specific sessions read rule must never override private observer data',
    );
    const proof = probeProtectedValidationMailbox({
      mailboxRoot: host.mailboxRoot,
      privateRoots: policy.privatePaths,
      command: fx.command,
      policy,
      journalRoot: journal,
    });
    const worker = nativeWorker(t, fx, policy);
    const awaitInput = { ...fx.common, validatorHandle, gate: 'validation' };
    assert.equal(ok(await worker('validation-await-admission', awaitInput)).state, 'pending');
    const bootstrap = {
      protocol: PROTECTED_VALIDATION_PROTOCOL,
      bootstrapId: proof.bootstrapId,
      physicalMailboxRoot: host.mailboxRoot,
      policyDigest: validationDigest(fx.policy),
      initialInputDigest: validationDigest('model-free validator input'),
      nativePolicyDigest: policy.policyDigest,
      guardEvidence: proof.guardEvidence,
      admission: { ...fx.common, validatorHandle, gate: 'validation' },
      policy: fx.policy,
    };
    const bootstrapRef = write(
      host.mailboxRoot,
      `bootstraps/${proof.bootstrapId}.json`,
      bootstrap,
      0o600,
    );
    refused(cli('validation-await-admission', awaitInput), 'UNPROTECTED_VALIDATION');
    const admitted = ok(await worker('validation-await-admission', awaitInput));
    assert.equal(admitted.state, 'admitted');
    assert.deepEqual(admitted.bootstrapRef, bootstrapRef);
    refused(await worker('receipt', fx.receipt), 'REMOTE_VALIDATION_REQUIRED');
    git(fx.root, 'commit', '--quiet', '--allow-empty', '-m', 'advance current product HEAD');
    writeFileSync(path.join(fx.root, 'src/product.mjs'), 'export const product = 2;\n');
    git(fx.root, 'add', 'src/product.mjs');
    rmSync(path.join(fx.root, 'src/deleted.mjs'));
    write(fx.root, 'scripts/new-tool.sh', '#!/bin/sh\nexit 0\n', 0o755);
    write(fx.root, 'docs/plan/unrelated.md', 'excluded plan\n');
    const requestInput = { ...awaitInput, validationId: 'v004', bootstrapRef };
    const requestRef = ok(await worker('validation-request', requestInput));
    refused(await worker('validation-request', requestInput), 'COLLISION');
    refused(
      await worker('validation-request', {
        ...requestInput,
        validationId: 'wrong-validator',
        validatorHandle: '/root/build/another',
      }),
      'FOREIGN_VALIDATION',
    );
    refused(
      await worker('validation-request', {
        ...requestInput,
        validationId: 'wrong-gate',
        gate: 'final-validation',
      }),
      'FOREIGN_VALIDATION',
    );
    const request = JSON.parse(readFileSync(path.join(requestRef.root, requestRef.path)));
    assert.deepEqual(request.snapshot, sourceBasis(fx.root).snapshot);
    assert.notEqual(
      request.snapshot.head,
      request.execution.head,
      'current HEAD may advance beyond the original execution transition',
    );
    const exported = JSON.parse(
      readFileSync(path.join(request.exportManifestRef.root, request.exportManifestRef.path)),
    );
    assert.ok(exported.deletions.includes('src/deleted.mjs'));
    assert.ok(
      exported.files.some(
        (entry) => entry.path === 'scripts/new-tool.sh' && entry.mode === '100755',
      ),
    );
    assert.ok(exported.excluded.some((entry) => entry.path === 'docs/plan/unrelated.md'));
    const pollInput = { ...fx.common, requestRef, validatorHandle };
    const runDir = path.join(fx.root, '.effective-flow/build-runs', fx.input.runId);
    const beforePoll = readdirSync(runDir).sort();
    assert.equal(ok(await worker('validation-result', pollInput)).state, 'pending');
    assert.deepEqual(readdirSync(runDir).sort(), beforePoll);
    await t.test(
      'preparation rejects branch-only drift before any transport is built',
      async () => {
        git(fx.root, 'branch', '-m', 'foreign-branch');
        try {
          await assert.rejects(
            prepareValidation({ requestRef, sourceRoot: fx.root }),
            /branch|execution.*differs/,
          );
        } finally {
          git(fx.root, 'branch', '-m', 'feature');
        }
      },
    );
    await t.test('preparation refuses symlinks and special mode bits', async () => {
      const product = path.join(fx.root, 'src/product.mjs'),
        bytes = readFileSync(product);
      rmSync(product);
      symlinkSync('/etc/hosts', product);
      try {
        await assert.rejects(prepareValidation({ requestRef, sourceRoot: fx.root }), /symlink/);
      } finally {
        rmSync(product);
        writeFileSync(product, bytes);
      }
      chmodSync(product, 0o4644);
      try {
        await assert.rejects(
          prepareValidation({ requestRef, sourceRoot: fx.root }),
          /unsupported projected file identity/,
        );
      } finally {
        chmodSync(product, 0o644);
      }
    });
    const prepared = await prepareValidation({ requestRef, sourceRoot: fx.root });
    assert.equal(prepared.state, 'prepared');
    const execution = path.join(fx.namespace, 'execution');
    const transport = path.join(host.mailboxRoot, 'private/preparations/v004/transport');
    assert.equal(
      materializeTransport({
        checkout: transport,
        destination: execution,
        expectedCommit: prepared.preparation.snapshotCommit,
      }).executionTree,
      prepared.preparation.executionTree,
    );
    assert.equal(
      readFileSync(path.join(execution, '.github/workflows/ci.yml'), 'utf8'),
      'name: inert original workflow\n',
    );
    await t.test(
      'ordinary clone retains the exact source HEAD ancestry and baseline after materialization',
      () => {
        const expectedParent = request.snapshot.head;
        assert.equal(git(transport, 'show', '-s', '--format=%P', 'HEAD'), expectedParent);
        assert.equal(git(execution, 'show', '-s', '--format=%P', 'HEAD'), expectedParent);
        assert.equal(
          git(execution, 'merge-base', '--is-ancestor', fx.input.execution.head, 'HEAD'),
          '',
        );
        const clone = path.join(fx.namespace, 'ordinary-execution-clone');
        git(fx.namespace, 'clone', '--quiet', '--no-local', execution, clone);
        assert.equal(git(clone, 'cat-file', '-t', fx.input.execution.head), 'commit');
        assert.equal(
          git(clone, 'merge-base', '--is-ancestor', fx.input.execution.head, 'HEAD'),
          '',
        );
        assert.equal(git(clone, 'rev-parse', 'HEAD^{tree}'), prepared.preparation.executionTree);
        assert.deepEqual(
          sourceBasis(fx.root).snapshot,
          request.snapshot,
          'history transport must leave the source index and content unchanged',
        );
      },
    );
    // No GitHub side effect occurs in this local integration test. This durable synthetic
    // submission association lets the real observer consume fixture REST responses only.
    write(host.mailboxRoot, 'submissions/v004.json', {
      preparationRef: prepared.preparationRef,
      repository: fx.policy.repository,
      snapshotBranch: prepared.preparation.snapshotBranch,
      snapshotCommit: prepared.preparation.snapshotCommit,
      submittedAt: '2026-10-22T09:59:00Z',
    });
    const observeInput = { preparationRef: prepared.preparationRef, runId: 42, runAttempt: 1 };
    for (const [name, mutate, pattern] of [
      [
        'foreign attempt',
        (f) => {
          f.metadata.run_attempt = 2;
        },
        /foreign requested backend/,
      ],
      [
        'foreign immutable snapshot commit SHA',
        (f) => {
          f.commitRecord.sha = 'f'.repeat(40);
        },
        /source.*ancestry|commit|immutable/,
      ],
      [
        'foreign immutable snapshot parent',
        (f) => {
          f.commitRecord.parents = [{ sha: 'f'.repeat(40) }];
        },
        /source.*ancestry|commit|parent|immutable/,
      ],
      [
        'extra immutable snapshot parent',
        (f) => {
          f.commitRecord.parents.push({ sha: 'f'.repeat(40) });
        },
        /source.*ancestry|commit|parent|immutable/,
      ],
      [
        'missing immutable snapshot parent',
        (f) => {
          f.commitRecord.parents = [];
        },
        /source.*ancestry|commit|parent|immutable/,
      ],
      [
        'foreign immutable snapshot tree',
        (f) => {
          f.commitRecord.tree.sha = 'f'.repeat(40);
        },
        /source.*ancestry|commit|tree|immutable/,
      ],
      [
        'foreign materialized source HEAD',
        (f) => {
          f.lines = f.lines.map((line) =>
            line.startsWith('EF_PROTECTED_VALIDATION ') &&
            JSON.parse(line.slice(24)).type === 'materialization'
              ? line.replace(prepared.preparation.localSnapshot.head, 'f'.repeat(40))
              : line,
          );
        },
        /materialization|source.*ancestry|source HEAD/,
      ],
      [
        'missing job page',
        (f) => {
          f.jobs.total_count = 2;
        },
        /pagination incomplete/,
      ],
      [
        'missing execution step',
        (f) => {
          f.jobs.jobs[0].steps.pop();
        },
        /required backend steps absent/,
      ],
      [
        'truncated raw logs',
        (f) => {
          f.rawLogs = Buffer.from('https://redirect.example.invalid/incomplete');
        },
        /log.*ZIP|log archive/,
      ],
      [
        'skipped native case',
        (f) => {
          f.lines = f.lines.map((line) =>
            line.startsWith('ok 1 -') ? line + ' # SKIP unavailable' : line,
          );
        },
        /native/,
      ],
      [
        'missing native case',
        (f) => {
          f.lines = f.lines.filter((line) => !line.startsWith('ok 1 -'));
        },
        /native/,
      ],
      [
        'changed immutable closure',
        (f) => {
          f.closureFiles[0].bytes = Buffer.from('foreign workflow');
        },
        /closure drift/,
      ],
    ])
      await t.test(name, async () => {
        await assert.rejects(
          observeValidation(observeInput, {
            read: backendFixture(fx, prepared.preparation, mutate),
          }),
          pattern,
        );
        assert.equal(existsSync(path.join(host.mailboxRoot, 'results/v004.json')), false);
      });
    const result = await observeValidation(observeInput, {
      read: backendFixture(fx, prepared.preparation),
    });
    assert.equal(result.state, 'verified');
    assert.equal(ok(await worker('validation-result', pollInput)).state, 'verified');
    refused(
      await worker('validation-result', { ...pollInput, validatorHandle: '/root/build/another' }),
      'AGENT_MISMATCH',
    );
    for (const [name, mutate, restore] of [
      [
        'HEAD',
        () => git(fx.root, 'commit', '--quiet', '--allow-empty', '-m', 'drift'),
        () => git(fx.root, 'reset', '--soft', request.snapshot.head),
      ],
      [
        'index',
        () => git(fx.root, 'update-index', '--chmod=+x', 'src/product.mjs'),
        () => git(fx.root, 'update-index', '--chmod=-x', 'src/product.mjs'),
      ],
      [
        'tracked bytes',
        () => writeFileSync(path.join(fx.root, 'src/product.mjs'), 'changed\n'),
        () => writeFileSync(path.join(fx.root, 'src/product.mjs'), 'export const product = 2;\n'),
      ],
      [
        'untracked bytes',
        () => writeFileSync(path.join(fx.root, 'scripts/new-tool.sh'), 'changed\n'),
        () => writeFileSync(path.join(fx.root, 'scripts/new-tool.sh'), '#!/bin/sh\nexit 0\n'),
      ],
      [
        'executable mode',
        () => chmodSync(path.join(fx.root, 'scripts/new-tool.sh'), 0o644),
        () => chmodSync(path.join(fx.root, 'scripts/new-tool.sh'), 0o755),
      ],
      [
        'deleted source',
        () => writeFileSync(path.join(fx.root, 'src/deleted.mjs'), 'restored\n'),
        () => rmSync(path.join(fx.root, 'src/deleted.mjs')),
      ],
    ])
      await t.test('rejects stale ' + name, async () => {
        mutate();
        refused(await worker('validation-result', pollInput), [
          'CONTENT_DRIFT',
          'REPOSITORY_MISMATCH',
        ]);
        await assert.rejects(
          observeValidation(observeInput, {
            read: () => {
              throw new Error('must refuse before network');
            },
          }),
          /source drift/,
        );
        restore();
        assert.equal(ok(await worker('validation-result', pollInput)).state, 'verified');
      });
    const requestFile = path.join(requestRef.root, requestRef.path),
      requestBytes = readFileSync(requestFile);
    rmSync(requestFile);
    refused(await worker('receipt', fx.receipt), 'REMOTE_VALIDATION_REQUIRED');
    writeFileSync(requestFile, requestBytes);
    refused(
      await worker('receipt', {
        ...fx.receipt,
        validatorHandle,
        validationRequest: requestRef,
        validationResult: { ...result.resultRef, digest: validationDigest('foreign result') },
      }),
      'FOREIGN_RECORD',
    );
    const receipt = ok(
      await worker('receipt', {
        ...fx.receipt,
        validatorHandle,
        validationRequest: requestRef,
        validationResult: result.resultRef,
      }),
    );
    const gate = JSON.parse(readFileSync(path.join(receipt.root, receipt.path)));
    assert.equal(gate.remoteValidation.validatorHandle, validatorHandle);
    assert.deepEqual(gate.remoteValidation.resultRef, result.resultRef);
    refused(
      await worker('receipt', {
        ...fx.receipt,
        validatorHandle,
        validationRequest: requestRef,
        validationResult: result.resultRef,
      }),
      'COLLISION',
    );
    await assert.rejects(
      observeValidation(observeInput, { read: backendFixture(fx, prepared.preparation) }),
      /EEXIST/,
    );
    refused(
      await worker('receipt', {
        ...fx.receipt,
        gate: 'final-validation',
        validatorHandle,
        validationRequest: requestRef,
        validationResult: result.resultRef,
      }),
      'REMOTE_VALIDATION_REQUIRED',
    );
    await t.test(
      'failed backend result remains execution evidence and cannot discharge the final gate',
      async () => {
        const finalBootstrapId = proof.bootstrapId + '-final-validation';
        const finalCanaryRef = write(
          host.mailboxRoot,
          `canaries/${finalBootstrapId}.txt`,
          readFileSync(
            path.join(proof.guardEvidence.canaryRef.root, proof.guardEvidence.canaryRef.path),
          ),
          0o600,
        );
        const finalBootstrapRef = write(
          host.mailboxRoot,
          `bootstraps/${finalBootstrapId}.json`,
          {
            ...bootstrap,
            bootstrapId: finalBootstrapId,
            admission: { ...bootstrap.admission, gate: 'final-validation' },
            guardEvidence: { ...bootstrap.guardEvidence, canaryRef: finalCanaryRef },
          },
          0o600,
        );
        const finalRequestRef = ok(
          await worker('validation-request', {
            ...requestInput,
            validationId: 'v005',
            gate: 'final-validation',
            bootstrapRef: finalBootstrapRef,
          }),
        );
        const finalPrepared = await prepareValidation({
          requestRef: finalRequestRef,
          sourceRoot: fx.root,
        });
        write(host.mailboxRoot, 'submissions/v005.json', {
          preparationRef: finalPrepared.preparationRef,
          repository: fx.policy.repository,
          snapshotBranch: finalPrepared.preparation.snapshotBranch,
          snapshotCommit: finalPrepared.preparation.snapshotCommit,
          submittedAt: '2026-10-22T09:59:00Z',
        });
        const failed = await observeValidation(
          { preparationRef: finalPrepared.preparationRef, runId: 42, runAttempt: 1 },
          {
            read: backendFixture(fx, finalPrepared.preparation, (f) => {
              f.metadata.conclusion = 'failure';
              f.jobs.jobs[0].conclusion = 'failure';
              f.jobs.jobs[0].steps.at(-1).conclusion = 'failure';
              const firstEnd = f.lines.findIndex(
                (line) =>
                  line.startsWith('EF_PROTECTED_VALIDATION ') &&
                  JSON.parse(line.slice(24)).type === 'command-end',
              );
              f.lines = f.lines.slice(0, firstEnd + 1);
              f.lines[firstEnd] = f.lines[firstEnd].replace('"exitCode":0', '"exitCode":73');
            }),
          },
        );
        assert.equal(failed.state, 'failed');
        const failedPoll = ok(
          await worker('validation-result', {
            ...fx.common,
            requestRef: finalRequestRef,
            validatorHandle,
          }),
        );
        assert.equal(failedPoll.state, 'failed');
        refused(
          await worker('receipt', {
            ...fx.receipt,
            gate: 'final-validation',
            validatorHandle,
            validationRequest: finalRequestRef,
            validationResult: failed.resultRef,
          }),
          'REMOTE_VALIDATION_PENDING',
        );
        assert.equal(existsSync(path.join(runDir, 'validation-consumed-v005.json')), false);
      },
    );
  },
);
