// Synthetic trusted-host observations test the boundary logic; these are not model evidence.
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  realpathSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseTranscript, digest } from '../evals/build-context/_scaffold/transcript.mjs';
import {
  nativePolicy,
  nativeExecArgs,
  nativeContextProblems,
} from '../evals/build-context/_scaffold/native-sandbox.mjs';
import { observedHelperEvent } from '../evals/build-context/_scaffold/helper-observation.mjs';
import {
  observedValidatorAdmissions,
  verifyProtectedValidationCompletion,
  startProtectedValidationObserver,
  stopProtectedValidationObserver,
} from '../evals/build-context/_scaffold/protected-validation-host.mjs';
import {
  PROTECTED_VALIDATION_PROTOCOL,
  CLOSURE_PATHS,
  VALIDATION_COMMANDS,
  REQUIRED_NATIVE_CASES,
  VALIDATION_ENVIRONMENT,
  validationDigest,
  canonicalJSON,
} from '../src/scripts/protected-validation-protocol.mjs';

const write = (root, path, value) => {
  const file = resolve(root, path);
  mkdirSync(resolve(file, '..'), { recursive: true });
  const bytes = typeof value === 'string' ? value : canonicalJSON(value) + '\n';
  writeFileSync(file, bytes);
  return { root, path, digest: digest(bytes) };
};
function fixture(t, mutate = () => {}) {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), 'flow-protected-host-unit-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const mailbox = resolve(root, '.effective-flow/protected-validation'),
    journal = resolve(root, 'journal'),
    skill = resolve(root, 'skill');
  mkdirSync(journal);
  mkdirSync(resolve(skill, 'scripts'), { recursive: true });
  const epoch = Date.now() - 1000,
    stamp = (offset) => new Date(epoch + offset).toISOString();
  const policy = {
    protocol: PROTECTED_VALIDATION_PROTOCOL,
    repository: 'owner/repository',
    workflowPath: '.github/workflows/protected-macos-validation.yml',
    commands: VALIDATION_COMMANDS,
    nativeCases: REQUIRED_NATIVE_CASES,
    environment: VALIDATION_ENVIRONMENT,
    executionClosure: {
      ...Object.fromEntries(Object.keys(CLOSURE_PATHS).map((key) => [key, digest(key)])),
      materializationAlgorithm: 'git-tree-v1',
      actions: { checkout: 'a'.repeat(40), pnpm: 'b'.repeat(40), node: 'c'.repeat(40) },
    },
  };
  const common = {
      runtimeStateRoot: root,
      repositoryIdentity: resolve(root, '.git'),
      runId: 'host-unit',
      requestDigest: digest('original request'),
    },
    handle = '/root/build/validator';
  const original = {
    ...common,
    execution: { executionRoot: root },
    remoteValidation: { requiredGates: ['validation'], policyDigest: validationDigest(policy) },
  };
  delete original.requestDigest;
  const originalRef = write(root, '.effective-flow/build-runs/host-unit/request.json', original);
  common.requestDigest = originalRef.digest;
  write(root, '.effective-flow/build-runs/host-unit/agent.json', {
    ...common,
    agentHandle: '/root/build',
  });
  const content = [{ type: 'input_text', text: 'sealed root instruction' }],
    childContent = [{ type: 'input_text', text: 'synthetic validator instruction' }];
  const user = (blocks) => ({
    type: 'response_item',
    timestamp: stamp(10),
    payload: { type: 'message', role: 'user', content: blocks },
  });
  const inputDigest = digest(canonicalJSON(user(childContent).payload));
  const bootstrap = {
    protocol: PROTECTED_VALIDATION_PROTOCOL,
    bootstrapId: 'unit-bootstrap',
    physicalMailboxRoot: mailbox,
    policyDigest: validationDigest(policy),
    initialInputDigest: inputDigest,
    nativePolicyDigest: digest('native policy'),
    guardEvidence: {
      kind: 'native-macos-seatbelt',
      workerDenied: true,
      descendantDenied: true,
      privateReadDenied: true,
      anchorDigest: digest('anchor'),
      canaryRef: { root: mailbox, path: 'canaries/unit-bootstrap.txt', digest: digest('anchor') },
    },
    admission: { ...common, validatorHandle: handle, gate: 'validation' },
    policy,
  };
  const bootstrapRef = write(mailbox, 'bootstraps/unit-bootstrap.json', bootstrap);
  const snapshot = {
    head: 'a'.repeat(40),
    index: digest('index'),
    workingTree: digest('current source bytes'),
    untracked: digest('untracked'),
  };
  const requestRef = write(
    root,
    '.effective-flow/build-runs/host-unit/validation-request-unit.json',
    { ...common, gate: 'validation', validatorHandle: handle, snapshot },
  );
  const resultRef = write(mailbox, 'results/unit.json', {
    outcome: 'verified',
    requestRef,
    bootstrapRef,
  });
  const calls = [
    {
      session: 'parent',
      operation: 'bind-agent',
      input: { ...common, agentHandle: '/root/build' },
      output: { digest: digest('bind') },
      start: 20,
      end: 40,
    },
    {
      session: 'validator',
      operation: 'validation-await-admission',
      input: { ...common, validatorHandle: handle, gate: 'validation' },
      output: { state: 'pending', bootstrapRef: null },
      start: 100,
      end: 120,
    },
    {
      session: 'validator',
      operation: 'validation-request',
      input: {
        ...common,
        validatorHandle: handle,
        gate: 'validation',
        validationId: 'unit',
        bootstrapRef,
      },
      output: requestRef,
      start: 200,
      end: 220,
    },
    {
      session: 'validator',
      operation: 'validation-result',
      input: { ...common, validatorHandle: handle, requestRef },
      output: { state: 'pending', resultRef: null },
      start: 300,
      end: 320,
    },
    {
      session: 'validator',
      operation: 'validation-result',
      input: { ...common, validatorHandle: handle, requestRef },
      output: { state: 'verified', resultRef },
      start: 400,
      end: 420,
    },
    {
      session: 'validator',
      operation: 'receipt',
      input: {
        ...common,
        validatorHandle: handle,
        gate: 'validation',
        outcome: 'passed',
        validationRequest: requestRef,
        validationResult: resultRef,
      },
      output: { digest: digest('receipt') },
      start: 500,
      end: 520,
    },
  ];
  mutate(calls, { root, common, handle, bootstrapRef, requestRef, snapshot });
  const metas = {
    parent: { id: 'native-root', agent_path: '/root', cwd: root },
    runner: {
      id: 'native-runner',
      parent_thread_id: 'native-root',
      agent_path: '/root/build',
      cwd: root,
    },
    validator: {
      id: 'native-validator',
      parent_thread_id: 'native-runner',
      agent_path: handle,
      cwd: root,
      source: { subagent: { thread_spawn: { agent_role: 'effective-flow-code-validator' } } },
    },
  };
  const sessions = new Map();
  for (const [name, meta] of Object.entries(metas)) {
    const rows = [
      { type: 'session_meta', timestamp: stamp(0), payload: meta },
      user(name === 'parent' ? content : childContent),
    ];
    for (const [index, call] of calls.entries())
      if (call.session === name) {
        const command =
          'node ' +
          resolve(skill, 'scripts/build-run.mjs') +
          ' ' +
          call.operation +
          " <<'JSON'\n" +
          JSON.stringify(call.input) +
          '\nJSON';
        rows.push({
          type: 'event_msg',
          timestamp: stamp(call.end + 1),
          payload: {
            type: 'item_completed',
            thread_id: meta.id,
            turn_id: 'unit-turn',
            started_at_ms: epoch + call.start,
            completed_at_ms: epoch + call.end,
            item: {
              type: 'CommandExecution',
              id: 'native-call-' + index,
              process_id: 'unit-process',
              command: ['/bin/zsh', '-lc', command],
              cwd: pathToFileURL(root).href,
              status: 'completed',
              exit_code: 0,
              aggregated_output: JSON.stringify({
                ok: call.ok !== false,
                operation: call.operation,
                ...(call.error ? { error: call.error } : { result: call.output }),
              }),
            },
          },
        });
      }
    rows.push({ type: 'event_msg', timestamp: stamp(1000), payload: { type: 'task_complete' } });
    const text = rows.map(JSON.stringify).join('\n') + '\n',
      path = resolve(root, name + '.jsonl');
    writeFileSync(path, text);
    sessions.set(name, {
      entry: {
        alias: name,
        path,
        parent: name === 'parent' ? null : name === 'runner' ? 'parent' : 'runner',
      },
      parsed: parseTranscript(text, 'codex-cli'),
      bytes: Buffer.from(text),
    });
  }
  const salt = 'unit-private-salt',
    alias = (value) => digest(salt + '\0' + value),
    events = [];
  const agentSession = (value) =>
    [...sessions].find(([, item]) =>
      [item.parsed.meta.id, item.parsed.meta.agent_path].includes(value),
    )?.[0] ?? null;
  for (const [name, item] of sessions)
    for (const tool of item.parsed.tools)
      for (const envelope of tool.envelopes) {
        const event = observedHelperEvent(tool, envelope, {
          session: name,
          sourceDigest: item.parsed.sourceDigest,
          alias,
          agentSession,
          roots: { 'build-run': resolve(skill, 'scripts/build-run.mjs') },
        });
        if (event) events.push(event);
      }
  const descriptor = {
    runtimeStateRoot: root,
    repositoryIdentity: common.repositoryIdentity,
    mailboxRoot: mailbox,
    policy,
    request: original,
    requestRef: originalRef,
    fixtureRoot: root,
    initialInputDigest: digest('sealed root instruction'),
    nativeValidatorRoles: ['effective-flow-code-validator'],
  };
  const admissions = observedValidatorAdmissions({
    sessions: [...sessions.values()],
    descriptor,
    skillRoot: skill,
    startedAt: epoch,
  });
  assert.equal(admissions.length, 1);
  write(journal, 'unit-validation-native-unit-bootstrap.json', admissions[0]);
  const state = {
    protectedValidation: descriptor,
    input: { fixtureRoot: root, skillRoot: skill },
    prompt: 'sealed root instruction',
    processes: [{ startedAt: epoch }],
    nativePolicy: {
      policyDigest: bootstrap.nativePolicyDigest,
      nativeRegistrations: [{ name: 'effective-flow-code-validator' }],
    },
  };
  const actual = { sessions, root: sessions.get('parent'), aliasSalt: salt };
  return {
    root,
    journal,
    state,
    actual,
    events,
    descriptor,
    admissions,
    run: () =>
      verifyProtectedValidationCompletion({
        state,
        actual,
        helperEvents: events,
        journalRoot: journal,
      }),
  };
}

test('structured native user content matches the exact sealed text without equating its structured digest', (t) => {
  const fx = fixture(t),
    user = fx.actual.root.parsed.initialUser;
  assert.notEqual(user.digest, digest(fx.state.prompt));
  assert.equal(digest(user.text), fx.descriptor.initialInputDigest);
  assert.equal(fx.admissions[0].rootInputContentDigest, user.digest);
  const wrong = { ...fx.descriptor, initialInputDigest: digest('changed root instruction') };
  assert.throws(
    () =>
      observedValidatorAdmissions({
        sessions: [...fx.actual.sessions.values()],
        descriptor: wrong,
        skillRoot: fx.state.input.skillRoot,
        startedAt: fx.state.processes[0].startedAt,
      }),
    /sealed host input/,
  );
});
test('protected completion consumes the exact same native validator request verified result and receipt', (t) => {
  const fx = fixture(t),
    proof = fx.run();
  assert.equal(proof.gates.length, 1);
  assert.equal(proof.gates[0].session, 'validator');
  assert.equal(proof.gates[0].gate, 'validation');
});
test('protected completion rejects runner substitution, reordered calls, absent verification and foreign result references', async (t) => {
  for (const [name, mutate] of [
    [
      'runner substitution',
      (calls) => {
        calls.find((c) => c.operation === 'validation-request').session = 'runner';
      },
    ],
    [
      'reordered verification',
      (calls) => {
        const poll = calls.find((c) => c.output.state === 'verified');
        poll.start = 150;
        poll.end = 160;
      },
    ],
    [
      'missing verified result',
      (calls) => {
        calls.find((c) => c.output.state === 'verified').output.state = 'pending';
      },
    ],
    [
      'foreign receipt result',
      (calls) => {
        calls.find((c) => c.operation === 'receipt').input.validationResult = {
          root: '/foreign',
          path: 'result.json',
          digest: digest('foreign'),
        };
      },
    ],
    [
      'foreign poll request',
      (calls) => {
        calls.find((c) => c.operation === 'validation-result').input.requestRef = {
          root: '/foreign',
          path: 'request.json',
          digest: digest('foreign'),
        };
      },
    ],
  ])
    await t.test(name, (t) => {
      const fx = fixture(t, mutate);
      assert.throws(
        fx.run,
        /admitted validator|reordered|verified result|digests differ|references differ|foreign session/,
      );
    });
});
test('coordinator checks the protected native chain before either launch or completion seal', () => {
  const source = readFileSync(
      new URL('../evals/build-context/_scaffold/host-coordinator.mjs', import.meta.url),
      'utf8',
    ),
    complete = source.slice(source.indexOf('  complete(id, manifest)'));
  assert.ok(complete.indexOf('verifyProtectedValidationCompletion(') > 0);
  assert.ok(
    complete.indexOf('verifyProtectedValidationCompletion(') <
      complete.indexOf("envelope('launch'"),
  );
  assert.ok(
    complete.indexOf('verifyProtectedValidationCompletion(') <
      complete.indexOf("envelope('completion'"),
  );
});

test(
  'actual native observer starts and admits synthetic trusted rollout metadata before any model launch',
  { timeout: 30000 },
  async (t) => {
    if (process.platform !== 'darwin' || !existsSync('/opt/homebrew/bin/codex'))
      return t.skip('actual macOS Codex native sandbox is unavailable');
    const fx = fixture(t),
      outer = realpathSync(mkdtempSync(resolve(tmpdir(), 'flow-observer-native-unit-')));
    t.after(() => rmSync(outer, { recursive: true, force: true }));
    const git = (...args) => execFileSync('git', args, { cwd: fx.root, encoding: 'utf8' }).trim();
    git('init', '--quiet');
    const origin = resolve(outer, 'origin.git');
    execFileSync('git', ['init', '--quiet', '--bare', origin]);
    git('remote', 'add', 'origin', origin);
    writeFileSync(
      resolve(fx.root, '.build-context-fixture'),
      'synthetic trusted observer fixture\n',
    );
    const journal = resolve(outer, 'journal'),
      home = resolve(outer, 'home'),
      codexHome = resolve(outer, 'codex-home'),
      sessionsRoot = resolve(codexHome, 'sessions'),
      skill = resolve(outer, 'bundle/effective-flow');
    for (const path of [journal, home, sessionsRoot, skill]) mkdirSync(path, { recursive: true });
    write(resolve(skill, '..'), 'fixture.json', {});
    const mailbox = fx.descriptor.mailboxRoot,
      privateRoot = resolve(mailbox, 'private');
    mkdirSync(privateRoot, { recursive: true });
    rmSync(resolve(mailbox, 'bootstraps'), { recursive: true });
    const policy = nativePolicy({
      fixtureRoot: fx.root,
      skillRoot: skill,
      protectedRoots: [journal, home, codexHome, sessionsRoot, mailbox],
      privateRoots: [journal, home, codexHome, sessionsRoot, privateRoot],
      protectedMailbox: mailbox,
    });
    // Only the trusted metadata fixture supplies this role. No model or native role spawn is claimed.
    policy.nativeRegistrations = [{ name: 'effective-flow-code-validator' }];
    const command = {
      executable: '/opt/homebrew/bin/codex',
      home,
      codexHome,
      args: nativeExecArgs(
        [
          'exec',
          '--json',
          '--ignore-user-config',
          '--ignore-rules',
          '-m',
          'gpt-6.1-sol',
          '-c',
          'model_reasoning_effort="high"',
          '-C',
          fx.root,
          '-',
        ],
        policy,
      ),
    };
    const state = {
      ...fx.state,
      command,
      nativePolicy: policy,
      input: { fixtureRoot: fx.root, skillRoot: skill, transcriptDir: sessionsRoot },
    };
    // Fixture commands must name the exact measured helper path watched by production grammar.
    for (const [name, item] of fx.actual.sessions) {
      const original = readFileSync(item.entry.path, 'utf8'),
        rewritten = original.split(fx.state.input.skillRoot).join(skill);
      writeFileSync(resolve(sessionsRoot, 'rollout-' + name + '.jsonl'), rewritten);
    }
    const observer = startProtectedValidationObserver({
      state,
      journalRoot: journal,
      launchId: 'synthetic-native',
      startedAt: state.processes[0].startedAt,
    });
    let observerError = '';
    observer.child.stderr.on('data', (bytes) => (observerError += bytes.toString('utf8')));
    const exit = new Promise((resolve) => observer.child.once('exit', (code) => resolve(code)));
    let published = [];
    const deadline = Date.now() + 20000;
    try {
      while (Date.now() < deadline && observer.child.exitCode === null) {
        if (existsSync(resolve(mailbox, 'bootstraps')))
          published = readdirSync(resolve(mailbox, 'bootstraps')).filter((name) =>
            name.endsWith('.json'),
          );
        if (published.length) break;
        await new Promise((done) => setTimeout(done, 25));
      }
      assert.equal(
        published.length,
        1,
        'trusted sidecar must admit the synthetic native validator: ' + observerError,
      );
      const bootstrap = JSON.parse(
        readFileSync(resolve(mailbox, 'bootstraps', published[0]), 'utf8'),
      );
      assert.equal(bootstrap.admission.validatorHandle, '/root/build/validator');
      assert.equal(bootstrap.nativePolicyDigest, policy.policyDigest);
      assert.equal(bootstrap.guardEvidence.privateReadDenied, true);
      const summary = stopProtectedValidationObserver(observer, journal, 'synthetic-native');
      assert.deepEqual(summary.rootIds, ['native-root']);
      assert.equal(await exit, 0);
    } finally {
      if (observer.child.exitCode === null) {
        observer.child.kill();
        await exit;
      }
    }
  },
);

test('same admitted validator may correct failed or stale source before the final current request', async (t) => {
  for (const stale of [false, true])
    await t.test(stale ? 'stale source correction' : 'failed execution correction', (t) => {
      const fx = fixture(t, (calls, context) => {
        const { root, common, handle, bootstrapRef, snapshot } = context;
        const oldSnapshot = { ...snapshot, workingTree: digest('previous source bytes') };
        write(root, 'src/product.mjs', 'previous source bytes');
        const oldRef = write(
          root,
          '.effective-flow/build-runs/host-unit/validation-request-old.json',
          { ...common, gate: 'validation', validatorHandle: handle, snapshot: oldSnapshot },
        );
        const failedRef = write(bootstrapRef.root, 'results/old.json', {
          outcome: 'failed',
          requestRef: oldRef,
          bootstrapRef,
        });
        calls.splice(
          2,
          0,
          {
            session: 'validator',
            operation: 'validation-request',
            input: {
              ...common,
              validatorHandle: handle,
              gate: 'validation',
              validationId: 'old',
              bootstrapRef,
            },
            output: oldRef,
            start: 130,
            end: 140,
          },
          {
            session: 'validator',
            operation: 'validation-result',
            input: { ...common, validatorHandle: handle, requestRef: oldRef },
            output: { state: 'failed', resultRef: failedRef },
            ok: !stale,
            error: stale ? { code: 'CONTENT_DRIFT' } : null,
            start: 150,
            end: 160,
          },
        );
        write(root, 'src/product.mjs', 'current source bytes');
      });
      const proof = fx.run();
      assert.equal(proof.gates[0].earlierAttempts.length, 1);
      assert.equal(proof.gates[0].verifiedCalls.length, 1);
    });
});
test('same-snapshot request replay is rejected despite a later current receipt', (t) => {
  const fx = fixture(t, (calls, { root, common, handle, bootstrapRef, snapshot }) => {
    const oldRef = write(root, '.effective-flow/build-runs/host-unit/validation-request-old.json', {
      ...common,
      gate: 'validation',
      validatorHandle: handle,
      snapshot,
    });
    calls.splice(
      2,
      0,
      {
        session: 'validator',
        operation: 'validation-request',
        input: {
          ...common,
          validatorHandle: handle,
          gate: 'validation',
          validationId: 'old',
          bootstrapRef,
        },
        output: oldRef,
        start: 130,
        end: 140,
      },
      {
        session: 'validator',
        operation: 'validation-result',
        input: { ...common, validatorHandle: handle, requestRef: oldRef },
        output: { state: 'failed' },
        start: 150,
        end: 160,
      },
    );
  });
  assert.throws(fx.run, /replays the same snapshot/);
});

test('native context comparison requires exact sessions DENY alongside the parent private root', (t) => {
  const fx = fixture(t),
    config = fx.root + '-native-config',
    sessions = resolve(config, 'sessions');
  const policy = {
    fixture: fx.root,
    definition: { filesystem: { [config]: 'none', [sessions]: 'none' } },
  };
  const entries = [
    ...['root', 'slash_tmp', 'tmpdir'].map((kind) => ({
      path: { type: 'special', value: { kind } },
      access: 'read',
    })),
    { path: { type: 'path', path: fx.root }, access: 'write' },
    ...['.git', '.agents', '.codex', '.aws'].map((name) => ({
      path: { type: 'path', path: resolve(fx.root, name) },
      access: 'read',
    })),
    ...[config, sessions].map((path) => ({
      path: { type: 'path', path },
      access: 'deny',
      escalatable: false,
    })),
  ];
  const context = {
    cwd: fx.root,
    approvalPolicy: 'never',
    permissionProfile: {
      type: 'managed',
      file_system: { type: 'restricted', entries },
      network: 'restricted',
    },
    fileSystemSandboxPolicy: { kind: 'restricted', entries },
  };
  assert.deepEqual(nativeContextProblems([context], policy), []);
  const weakened = structuredClone(context);
  weakened.permissionProfile.file_system.entries.find(
    (entry) => entry.path.path === sessions,
  ).access = 'read';
  delete weakened.permissionProfile.file_system.entries.find(
    (entry) => entry.path.path === sessions,
  ).escalatable;
  weakened.fileSystemSandboxPolicy.entries = weakened.permissionProfile.file_system.entries;
  assert.ok(nativeContextProblems([weakened], policy).length > 0);
});
