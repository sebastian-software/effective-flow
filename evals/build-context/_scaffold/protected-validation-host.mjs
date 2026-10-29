// Trusted host-side native observer. The worker has no write/read access to this observer state.
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  linkSync,
  rmSync,
  readdirSync,
  lstatSync,
  realpathSync,
  existsSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  PROTECTED_VALIDATION_PROTOCOL,
  validatePolicy,
  validateBootstrap,
  validationDigest,
  canonicalJSON,
  assertExact,
} from '../../../src/scripts/protected-validation-protocol.mjs';
import { nativeSandboxArgs } from './native-sandbox.mjs';
import { parseTranscript, digest, readRegular } from './transcript.mjs';
import {
  observedExecRequest,
  helperInvocation,
  observedHelperEvent,
} from './helper-observation.mjs';
const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};
const write = (file, value) => {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = mkdtempSync(resolve(dirname(file), '.protected-validation-'));
  try {
    const complete = resolve(temporary, 'record');
    writeFileSync(complete, canonicalJSON(value) + '\n', { flag: 'wx', mode: 0o600 });
    // A same-filesystem hard link publishes complete bytes without replacing an existing name.
    linkSync(complete, file);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
};
function physicalDirectoryFrom(root, parts) {
  let path = realpathSync(root);
  for (const part of parts) {
    path = resolve(path, part);
    if (!existsSync(path)) mkdirSync(path, { mode: 0o700 });
    const stat = lstatSync(path);
    ensure(
      stat.isDirectory() && !stat.isSymbolicLink() && realpathSync(path) === path,
      'unsafe physical host directory',
    );
  }
  return path;
}
export function prepareProtectedValidation({ descriptor, fixtureRoot, journalRoot }) {
  assertExact(descriptor, ['runtimeStateRoot', 'policy'], ['requestRef']);
  const runtimeStateRoot = realpathSync(descriptor.runtimeStateRoot),
    requestRef = descriptor.requestRef ?? null;
  validatePolicy(descriptor.policy);
  let request = null;
  if (requestRef) {
    ensure(
      requestRef.root === runtimeStateRoot &&
        /^\.effective-flow\/build-runs\/[A-Za-z0-9_-]+\/request\.json$/.test(requestRef.path),
      'sealed original build-run request required',
    );
    const originalBytes = readFileSync(resolve(requestRef.root, requestRef.path));
    ensure(validationDigest(originalBytes) === requestRef.digest, 'original request bytes changed');
    request = JSON.parse(originalBytes);
    ensure(
      request.remoteValidation?.policyDigest === validationDigest(descriptor.policy) &&
        request.runtimeStateRoot === runtimeStateRoot,
      'original create did not require exact host policy',
    );
  }
  const common = (root) =>
    realpathSync(
      resolve(
        root,
        execFileSync('git', ['rev-parse', '--git-common-dir'], {
          cwd: root,
          encoding: 'utf8',
        }).trim(),
      ),
    );
  const repositoryIdentity = common(runtimeStateRoot);
  ensure(
    repositoryIdentity === common(realpathSync(fixtureRoot)),
    'host runtime and fixture must share the verified Git repository',
  );
  const mailboxRoot = physicalDirectoryFrom(runtimeStateRoot, [
    '.effective-flow',
    'protected-validation',
  ]);
  const privateRoot = physicalDirectoryFrom(mailboxRoot, ['private']);
  const sealed = {
    runtimeStateRoot,
    repositoryIdentity,
    mailboxRoot,
    privateRoot,
    requestRef,
    request,
    policy: descriptor.policy,
    policyDigest: validationDigest(descriptor.policy),
  };
  write(
    resolve(
      journalRoot,
      'protected-validation-descriptor-' + randomBytes(12).toString('hex') + '.json',
    ),
    sealed,
  );
  return sealed;
}
function nativeGuardOperations(input) {
  const fs = require('node:fs');
  const denied = (operation) => {
    try {
      operation();
      return false;
    } catch (error) {
      return ['EPERM', 'EACCES', 'EROFS'].includes(error.code);
    }
  };
  fs.writeFileSync(input.replaceSource, 'disposable replacement', { flag: 'wx' });
  const observed = [
    denied(() => fs.chmodSync(input.canary, 0o600)),
    denied(() => fs.writeFileSync(input.canary, 'invalid protected write')),
    denied(() => fs.unlinkSync(input.canary)),
    denied(() => fs.renameSync(input.replaceSource, input.canary)),
    denied(() => fs.writeFileSync(input.newFile, 'invalid record', { flag: 'wx' })),
  ];
  if (fs.existsSync(input.replaceSource)) fs.unlinkSync(input.replaceSource);
  return {
    workerDenied: observed.every(Boolean),
    privateReadDenied: input.privateCanaries.every((path) => denied(() => fs.readFileSync(path))),
  };
}
export function probeProtectedValidationMailbox({
  mailboxRoot,
  privateRoots,
  command,
  policy,
  journalRoot,
}) {
  ensure(
    process.platform === 'darwin' && realpathSync(mailboxRoot) === mailboxRoot,
    'actual physical macOS mailbox required',
  );
  ensure(
    policy.protectedPaths.includes(mailboxRoot) &&
      privateRoots.every((p) => policy.privatePaths.includes(realpathSync(p))),
    'mailbox/private roots absent from actual native policy',
  );
  const bootstrapId = randomBytes(16).toString('hex'),
    canary = resolve(mailboxRoot, 'canaries', bootstrapId + '.txt');
  mkdirSync(dirname(canary), { recursive: true });
  writeFileSync(canary, 'protected validation ' + bootstrapId, { flag: 'wx', mode: 0o600 });
  const privateCanaries = privateRoots.map((root, index) => {
    const file = resolve(root, '.validation-private-' + bootstrapId + '-' + index);
    writeFileSync(file, 'private ' + bootstrapId, { flag: 'wx', mode: 0o600 });
    return file;
  });
  const child =
    'const input=JSON.parse(require("node:fs").readFileSync(0,"utf8"));const operations=' +
    nativeGuardOperations.toString() +
    ';console.log(JSON.stringify(operations(input)));';
  const script =
    'const fs=require("node:fs"),cp=require("node:child_process"),input=JSON.parse(fs.readFileSync(0,"utf8"));const operations=' +
    nativeGuardOperations.toString() +
    ';const actual=operations(input);const result=cp.spawnSync(process.execPath,["-e",input.child],{input:JSON.stringify({...input,replaceSource:input.replaceSource+"-child",newFile:input.newFile+"-child"}),encoding:"utf8"});const descendant=result.status===0?JSON.parse(result.stdout):{};const observed={workerDenied:actual.workerDenied,privateReadDenied:actual.privateReadDenied,descendantDenied:descendant.workerDenied===true&&descendant.privateReadDenied===true};console.log(JSON.stringify(observed));process.exit(Object.values(observed).every(value=>value===true)?0:73);';
  const input = {
    canary,
    privateCanaries,
    newFile: resolve(mailboxRoot, '.denied-' + bootstrapId),
    child,
    replaceSource: resolve(policy.fixture, '.protected-validation-replace-' + bootstrapId),
  };
  const startedAt = Date.now(),
    result = spawnSync(
      command.executable,
      nativeSandboxArgs(policy, [process.execPath, '-e', script], command.args),
      {
        cwd: policy.fixture,
        env: { PATH: process.env.PATH, HOME: command.home, CODEX_HOME: command.codexHome },
        input: JSON.stringify(input),
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      },
    );
  const raw = {
    startedAt,
    finishedAt: Date.now(),
    status: result.status,
    error: result.error?.code ?? null,
    stdout: result.stdout,
    stderr: result.stderr,
    policyDigest: policy.policyDigest,
    scriptDigest: digest(script),
    binaryDigest: digest(readFileSync(realpathSync(command.executable))),
  };
  write(resolve(journalRoot, 'protected-validation-guard-' + bootstrapId + '.json'), raw);
  ensure(!result.error && result.status === 0, 'actual native mailbox/private guard failed');
  const observed = JSON.parse(result.stdout.trim());
  ensure(
    observed.workerDenied === true &&
      observed.descendantDenied === true &&
      observed.privateReadDenied === true &&
      readRegular(canary) === 'protected validation ' + bootstrapId,
    'actual native guard evidence incomplete',
  );
  return {
    bootstrapId,
    guardEvidence: {
      kind: 'native-macos-seatbelt',
      ...observed,
      anchorDigest: digest(readRegular(canary)),
      canaryRef: {
        root: mailboxRoot,
        path: 'canaries/' + bootstrapId + '.txt',
        digest: digest(readRegular(canary)),
      },
    },
  };
}
function nativeSessions(root) {
  const sessions = [];
  function visit(directory) {
    for (const name of readdirSync(directory)) {
      const file = resolve(directory, name),
        stat = lstatSync(file);
      ensure(!stat.isSymbolicLink(), 'native observer refuses symlink');
      if (stat.isDirectory()) visit(file);
      else if (/^rollout-.*\.jsonl$/.test(name)) {
        ensure(
          stat.isFile() && stat.size <= 64 * 1024 * 1024,
          'native observer source bound exceeded',
        );
        const bytes = readFileSync(file),
          last = bytes.lastIndexOf(0x0a);
        ensure(
          bytes.length <= 64 * 1024 * 1024,
          'native observer source bound exceeded during read',
        );
        if (last < 0) continue;
        const complete = new TextDecoder('utf-8', { fatal: true }).decode(
          bytes.subarray(0, last + 1),
        );
        sessions.push({
          file,
          bytes: Buffer.from(complete),
          parsed: parseTranscript(complete, 'codex-cli'),
        });
      }
    }
  }
  visit(root);
  return sessions;
}
function originalNativeInputDigest(bytes) {
  const rows = bytes.toString('utf8').split('\n').filter(Boolean).map(JSON.parse);
  const firstAssistant = rows.findIndex(
    (row) =>
      row.type === 'response_item' &&
      row.payload?.type === 'message' &&
      row.payload?.role === 'assistant',
  );
  const input = rows
    .slice(0, firstAssistant < 0 ? rows.length : firstAssistant)
    .find(
      (row) =>
        row.type === 'response_item' &&
        (row.payload?.type === 'agent_message' ||
          (row.payload?.type === 'message' && row.payload?.role === 'user')),
    );
  ensure(input, 'original native child input missing');
  return digest(canonicalJSON(input.payload));
}
function freezeObservedCreate({ sessions, descriptor, skillRoot, startedAt }) {
  const roots = sessions.filter((s) => s.parsed.meta?.id && !s.parsed.meta.parent_thread_id);
  ensure(roots.length <= 1, 'ambiguous native root');
  if (!roots.length) return descriptor;
  const root = roots[0];
  if (!root.parsed.initialUser) return descriptor;
  ensure(
    root.parsed.meta.cwd === descriptor.fixtureRoot &&
      root.parsed.firstAt >= startedAt - 1000 &&
      digest(root.parsed.initialUser.text) === descriptor.initialInputDigest,
    'observed root differs from sealed input',
  );
  const creates = [];
  for (const tool of root.parsed.tools) {
    if (root.parsed.nativeExecutionsPresent && !tool.nativeExecution) continue;
    const call = helperInvocation(observedExecRequest(tool) ?? tool.arguments);
    if (
      !call ||
      call.operation !== 'create' ||
      call.family !== 'build-run' ||
      call.input.runtimeStateRoot !== descriptor.runtimeStateRoot
    )
      continue;
    for (const envelope of tool.envelopes) {
      const event = observedHelperEvent(tool, envelope, {
        session: 'root',
        sourceDigest: root.parsed.sourceDigest,
        alias: (v) => v,
        agentSession: (v) => v,
        roots: { 'build-run': resolve(skillRoot, 'scripts/build-run.mjs') },
      });
      if (event?.ok === true)
        creates.push({ call, envelope, sourceDigest: root.parsed.sourceDigest });
    }
  }
  ensure(creates.length <= 1, 'ambiguous successful original create');
  if (!creates.length) return descriptor;
  const { call, envelope, sourceDigest } = creates[0],
    requestRef = envelope.result?.request;
  ensure(
    requestRef?.root === descriptor.runtimeStateRoot &&
      requestRef.path === `.effective-flow/build-runs/${call.input.runId}/request.json` &&
      requestRef.digest === envelope.result.requestDigest,
    'actual create result binding missing',
  );
  const bytes = readFileSync(resolve(requestRef.root, requestRef.path));
  ensure(digest(bytes) === requestRef.digest, 'actual original create bytes changed');
  const request = JSON.parse(bytes);
  ensure(
    request.runtimeStateRoot === descriptor.runtimeStateRoot &&
      request.repositoryIdentity === descriptor.repositoryIdentity &&
      request.runId === call.input.runId &&
      request.remoteValidation?.policyDigest === validationDigest(descriptor.policy) &&
      canonicalJSON(request.remoteValidation) === canonicalJSON(call.input.remoteValidation),
    'original create policy differs from sealed host policy',
  );
  if (descriptor.requestRef)
    ensure(
      canonicalJSON(requestRef) === canonicalJSON(descriptor.requestRef),
      'original create contradicts presealed request',
    );
  return { ...descriptor, requestRef, request, createSourceDigest: sourceDigest };
}
export function observedValidatorAdmissions({ sessions, descriptor, skillRoot, startedAt }) {
  const roots = sessions.filter((s) => s.parsed.meta?.id && !s.parsed.meta.parent_thread_id);
  ensure(roots.length <= 1, 'ambiguous native root before admission');
  if (!roots.length) return [];
  const root = roots[0];
  ensure(
    root.parsed.meta.cwd === descriptor.fixtureRoot && root.parsed.firstAt >= startedAt - 1000,
    'native root differs from sealed execution',
  );
  if (!root.parsed.initialUser) return [];
  ensure(
    digest(root.parsed.initialUser.text) === descriptor.initialInputDigest,
    'native root initial input differs from sealed host input',
  );
  if (!descriptor.request) return [];
  const agentFile = resolve(
    descriptor.runtimeStateRoot,
    '.effective-flow/build-runs',
    descriptor.request.runId,
    'agent.json',
  );
  if (!existsSync(agentFile)) return [];
  const bound = JSON.parse(readRegular(agentFile, 16 * 1024));
  ensure(
    bound.runId === descriptor.request.runId &&
      bound.requestDigest === descriptor.requestRef.digest,
    'runner bind belongs to another immutable request',
  );
  const runners = sessions.filter(
    (s) =>
      s.parsed.meta?.parent_thread_id === root.parsed.meta.id &&
      [s.parsed.meta.id, s.parsed.meta.agent_path].includes(bound.agentHandle),
  );
  ensure(runners.length <= 1, 'ambiguous bound native runner');
  if (!runners.length) return [];
  const runner = runners[0];
  const bindProof = root.parsed.tools.some((tool) => {
    if (root.parsed.nativeExecutionsPresent && !tool.nativeExecution) return false;
    const call = helperInvocation(observedExecRequest(tool) ?? tool.arguments);
    if (
      !call ||
      call.operation !== 'bind-agent' ||
      call.input.agentHandle !== bound.agentHandle ||
      call.input.runId !== descriptor.request.runId ||
      call.input.requestDigest !== descriptor.requestRef.digest
    )
      return false;
    return tool.envelopes.some(
      (envelope) =>
        observedHelperEvent(tool, envelope, {
          session: 'root',
          sourceDigest: root.parsed.sourceDigest,
          alias: (value) => value,
          agentSession: (value) => value,
          roots: { 'build-run': resolve(skillRoot, 'scripts/build-run.mjs') },
        })?.ok === true,
    );
  });
  if (!bindProof) return [];
  const validators = sessions.filter(
    (s) =>
      s.parsed.meta?.parent_thread_id === runner.parsed.meta.id &&
      descriptor.nativeValidatorRoles.includes(
        s.parsed.meta.source?.subagent?.thread_spawn?.agent_role,
      ),
  );
  // Distinct validators may judge distinct gates. Each must announce the exact existing gate
  // through its real native helper call, not through role prose or a purported success marker.
  const candidates = [];
  for (const validator of validators) {
    const handle = validator.parsed.meta.agent_path;
    ensure(
      typeof handle === 'string' && handle.startsWith(runner.parsed.meta.agent_path + '/'),
      'validator native path differs from parent chain',
    );
    for (const gate of descriptor.request.remoteValidation.requiredGates) {
      const calls = validator.parsed.tools.filter((tool) => {
        if (validator.parsed.nativeExecutionsPresent && !tool.nativeExecution) return false;
        const call = helperInvocation(observedExecRequest(tool) ?? tool.arguments);
        return (
          call?.family === 'build-run' &&
          call.operation === 'validation-await-admission' &&
          call.input.runId === descriptor.request.runId &&
          call.input.requestDigest === descriptor.requestRef.digest &&
          call.input.validatorHandle === handle &&
          call.input.gate === gate
        );
      });
      if (calls.length)
        candidates.push({
          handle,
          gate,
          initialInputDigest: originalNativeInputDigest(validator.bytes),
          rootId: root.parsed.meta.id,
          rootInputContentDigest: root.parsed.initialUser.digest,
          validatorId: validator.parsed.meta.id,
          sourceDigest: digest(validator.bytes),
        });
    }
  }
  return candidates;
}
// This runs only on the coordinator's private capture, before it creates a completion seal.
// Public helper JSON and a claimed handle cannot replace the actual observed calling session.
export function verifyProtectedValidationCompletion({ state, actual, helperEvents, journalRoot }) {
  const salt = actual.aliasSalt ?? '',
    alias = (value) => digest(salt + '\0' + value);
  const sessions = [...actual.sessions.values()];
  let descriptor = {
    ...state.protectedValidation,
    fixtureRoot: state.input.fixtureRoot,
    initialInputDigest: digest(state.prompt),
  };
  descriptor = freezeObservedCreate({
    sessions,
    descriptor,
    skillRoot: state.input.skillRoot,
    startedAt: state.processes[0].startedAt,
  });
  ensure(
    descriptor.request && descriptor.requestRef,
    'remote-required original create was not observed',
  );
  const request = descriptor.request,
    required = request.remoteValidation?.requiredGates;
  ensure(
    Array.isArray(required) &&
      required.length > 0 &&
      request.remoteValidation.policyDigest === validationDigest(descriptor.policy),
    'immutable original remote requirement missing',
  );
  const root = actual.root,
    rootAlias = root.entry.alias;
  ensure(root.parsed.meta.id && !root.parsed.meta.parent_thread_id, 'actual parent root required');
  const roles = (state.nativePolicy.nativeRegistrations ?? [])
    .map((role) => role.name)
    .filter((name) => /^effective-flow-code-validator(?:-(?:mechanical|deep))?$/.test(name));
  const nativeCalls = new Map();
  for (const [session, item] of actual.sessions) {
    for (const tool of item.parsed.tools) {
      if (!tool.nativeExecution) continue;
      const call = helperInvocation(observedExecRequest(tool) ?? tool.arguments);
      if (
        !call ||
        call.family !== 'build-run' ||
        call.script !== resolve(state.input.skillRoot, 'scripts/build-run.mjs')
      )
        continue;
      const key = session + '\0' + digest(String(tool.id));
      ensure(!nativeCalls.has(key), 'duplicate canonical native helper call');
      const envelopes = tool.envelopes.filter((envelope) => envelope.operation === call.operation);
      ensure(envelopes.length === 1, 'ambiguous native helper result');
      nativeCalls.set(key, { call, tool, envelope: envelopes[0] });
    }
  }
  const events = helperEvents.filter(
    (event) =>
      event.family === 'build-run' &&
      (['validation-await-admission', 'validation-request', 'validation-result'].includes(
        event.operation,
      ) ||
        (event.operation === 'receipt' && required.includes(event.gate))),
  );
  ensure(
    new Set(events.map((event) => event.session + '\0' + event.callDigest)).size === events.length,
    'duplicate remote helper observation',
  );
  const folder = resolve(descriptor.mailboxRoot, 'bootstraps');
  const admissions = readdirSync(folder)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const text = readRegular(resolve(folder, name), 32 * 1024),
        bootstrap = validateBootstrap(JSON.parse(text));
      return {
        bootstrap,
        ref: { root: descriptor.mailboxRoot, path: 'bootstraps/' + name, digest: digest(text) },
      };
    })
    .filter(
      ({ bootstrap }) =>
        bootstrap.admission.runId === request.runId &&
        bootstrap.admission.requestDigest === descriptor.requestRef.digest,
    );
  const proofs = [],
    consumedEvents = new Set();
  for (const gate of required) {
    const matches = admissions.filter(({ bootstrap }) => bootstrap.admission.gate === gate);
    ensure(matches.length === 1, 'missing or ambiguous protected gate admission');
    const { bootstrap, ref } = matches[0],
      admission = bootstrap.admission,
      handle = admission.validatorHandle;
    ensure(
      bootstrap.physicalMailboxRoot === descriptor.mailboxRoot &&
        bootstrap.policyDigest === request.remoteValidation.policyDigest &&
        bootstrap.nativePolicyDigest === state.nativePolicy.policyDigest &&
        admission.runtimeStateRoot === descriptor.runtimeStateRoot &&
        admission.repositoryIdentity === descriptor.repositoryIdentity,
      'protected admission differs from sealed host input',
    );
    const validators = [...actual.sessions].filter(
      ([, item]) => item.parsed.meta?.agent_path === handle,
    );
    ensure(validators.length === 1, 'admitted validator lacks one actual session');
    const [validatorAlias, validator] = validators[0];
    ensure(
      roles.includes(validator.parsed.meta.source?.subagent?.thread_spawn?.agent_role),
      'admitted session lacks canonical native validator role',
    );
    const runners = [...actual.sessions].filter(
      ([, item]) => item.parsed.meta?.id === validator.parsed.meta.parent_thread_id,
    );
    ensure(runners.length === 1, 'validator native parent is missing or ambiguous');
    const [runnerAlias, runner] = runners[0];
    ensure(
      runner.parsed.meta.parent_thread_id === root.parsed.meta.id &&
        handle.startsWith(runner.parsed.meta.agent_path + '/'),
      'validator is outside original runner/root chain',
    );
    const binds = helperEvents.filter(
      (event) =>
        event.family === 'build-run' &&
        event.operation === 'bind-agent' &&
        event.ok &&
        event.session === rootAlias &&
        event.agentSession === runnerAlias &&
        event.run === alias(request.runId) &&
        event.requestDigest === descriptor.requestRef.digest &&
        event.nativeExecution &&
        event.helperPathDigest === digest(resolve(state.input.skillRoot, 'scripts/build-run.mjs')),
    );
    ensure(binds.length === 1, 'actual original runner bind is missing or ambiguous');
    const candidateFiles = readdirSync(journalRoot).filter((name) =>
      name.endsWith('-validation-native-' + bootstrap.bootstrapId + '.json'),
    );
    ensure(candidateFiles.length === 1, 'protected native admission observation missing');
    const candidate = JSON.parse(readRegular(resolve(journalRoot, candidateFiles[0]), 32 * 1024));
    ensure(
      candidate.rootId === root.parsed.meta.id &&
        candidate.validatorId === validator.parsed.meta.id &&
        candidate.handle === handle &&
        candidate.gate === gate &&
        candidate.initialInputDigest === bootstrap.initialInputDigest,
      'protected admission is not this actual validator',
    );
    const validatorBytes = readFileSync(validator.entry.path);
    ensure(
      digest(validatorBytes) === validator.parsed.sourceDigest &&
        originalNativeInputDigest(validatorBytes) === bootstrap.initialInputDigest,
      'actual admitted native input changed',
    );
    const gateRequests = events
      .filter(
        (event) => event.operation === 'validation-request' && event.gate === gate && event.ok,
      )
      .map((event) => ({
        event,
        observed: nativeCalls.get(event.session + '\0' + event.callDigest),
      }));
    ensure(
      gateRequests.length > 0 && gateRequests.every((item) => item.observed),
      'remote gate lacks successful actual request history',
    );
    const gateRequestRefs = gateRequests.map((item) => item.observed.envelope.result);
    const selected = [];
    for (const event of events) {
      const observed = nativeCalls.get(event.session + '\0' + event.callDigest);
      ensure(observed, 'remote observation lacks canonical actual native execution');
      const { call, tool, envelope } = observed,
        input = call.input;
      const inputGate = input.gate;
      const pertains =
        inputGate !== undefined
          ? inputGate === gate
          : call.operation === 'validation-result' &&
            gateRequestRefs.some((ref) => canonicalJSON(input.requestRef) === canonicalJSON(ref));
      if (!pertains) continue;
      ensure(
        event.session === validatorAlias &&
          event.agentSession === validatorAlias &&
          event.validatorHandleDigest === alias(handle),
        'remote helper executed outside the admitted validator session',
      );
      ensure(
        input.validatorHandle === handle &&
          input.runId === request.runId &&
          input.requestDigest === descriptor.requestRef.digest &&
          input.runtimeStateRoot === descriptor.runtimeStateRoot &&
          input.repositoryIdentity === descriptor.repositoryIdentity,
        'remote native helper common identity differs',
      );
      ensure(
        event.nativeExecution &&
          event.helperPathDigest === digest(call.script) &&
          event.sourceDigest === validator.parsed.sourceDigest &&
          event.callAt === tool.callAt &&
          event.at === tool.at &&
          Number.isFinite(event.callAt) &&
          event.at >= event.callAt,
        'remote helper lacks actual native source/timing',
      );
      ensure(
        event.operation === call.operation && event.ok === (envelope.ok === true),
        'remote observation contradicts actual native result',
      );
      if (inputGate !== undefined)
        ensure(inputGate === gate, 'validator reused across a foreign gate');
      consumedEvents.add(event);
      selected.push({ ...observed, event });
    }
    const requests = selected.filter(
      (item) => item.call.operation === 'validation-request' && item.event.ok,
    );
    const receipts = selected.filter((item) => item.call.operation === 'receipt' && item.event.ok);
    ensure(receipts.length === 1, 'remote gate lacks one successful actual receipt');
    const receipt = receipts[0],
      receiptInput = receipt.call.input;
    const currentRequests = requests.filter(
      (item) =>
        canonicalJSON(item.envelope.result) === canonicalJSON(receiptInput.validationRequest),
    );
    ensure(currentRequests.length === 1, 'receipt lacks one exact current native request');
    const first = currentRequests[0],
      requestRef = first.envelope.result;
    const history = requests.slice().sort((a, b) => a.event.callAt - b.event.callAt);
    ensure(history.at(-1) === first, 'stale request cannot discharge the current gate');
    const snapshots = new Set(),
      requestDigests = new Set(),
      earlierAttempts = [];
    for (const [index, attempt] of history.entries()) {
      const ref = attempt.envelope.result;
      ensure(
        ref?.root === descriptor.runtimeStateRoot &&
          ref.path.startsWith(`.effective-flow/build-runs/${request.runId}/validation-request-`) &&
          /^validation-request-[A-Za-z0-9_-]+\.json$/.test(ref.path.split('/').at(-1)),
        'request history reference is outside original run',
      );
      const bytes = readRegular(resolve(ref.root, ref.path), 32 * 1024),
        record = JSON.parse(bytes);
      ensure(
        digest(bytes) === ref.digest &&
          record.runId === request.runId &&
          record.requestDigest === descriptor.requestRef.digest &&
          record.gate === gate &&
          record.validatorHandle === handle,
        'request history identity differs',
      );
      const snapshot = canonicalJSON(record.snapshot);
      ensure(
        record.snapshot && !snapshots.has(snapshot) && !requestDigests.has(ref.digest),
        'request history replays the same snapshot or record',
      );
      snapshots.add(snapshot);
      requestDigests.add(ref.digest);
      ensure(
        canonicalJSON(attempt.call.input.bootstrapRef) ===
          canonicalJSON({
            root: descriptor.mailboxRoot,
            path: 'bootstraps/' + bootstrap.bootstrapId + '.json',
            digest: matches[0].ref.digest,
          }),
        'historical request used another admission',
      );
      if (attempt === first) continue;
      const next = history[index + 1],
        polls = selected
          .filter(
            (item) =>
              item.call.operation === 'validation-result' &&
              canonicalJSON(item.call.input.requestRef) === canonicalJSON(ref),
          )
          .sort((a, b) => a.event.callAt - b.event.callAt);
      ensure(polls.length > 0, 'historical request lacks failed or stale evidence');
      let previous = attempt.event.at,
        failedOrStale = false;
      for (const pollof of polls) {
        ensure(
          pollof.event.callAt >= previous && pollof.event.at <= next.event.callAt,
          'historical result is reordered or stale output follows current request',
        );
        previous = pollof.event.at;
        if (pollof.event.ok && pollof.event.validationState === 'failed') failedOrStale = true;
        if (
          !pollof.event.ok &&
          ['CONTENT_DRIFT', 'STALE_REPLY', 'RECONCILIATION_REQUIRED'].includes(pollof.event.code)
        )
          failedOrStale = true;
      }
      ensure(failedOrStale, 'earlier request was not an observed failed or stale attempt');
      earlierAttempts.push({
        requestDigest: ref.digest,
        snapshotDigest: digest(snapshot),
        calls: polls.map((item) => item.event.callDigest),
      });
    }
    ensure(
      first.event.validationRequestDigest === requestRef.digest,
      'actual request observation digest differs',
    );
    ensure(
      first.call.input.bootstrapRef?.digest === ref.digest &&
        canonicalJSON(first.call.input.bootstrapRef) === canonicalJSON(ref),
      'actual request used another protected bootstrap',
    );
    ensure(
      receiptInput.outcome === 'passed' &&
        canonicalJSON(receiptInput.validationRequest) === canonicalJSON(requestRef),
      'actual receipt references another request',
    );
    const polls = selected.filter(
      (item) =>
        item.call.operation === 'validation-result' &&
        canonicalJSON(item.call.input.requestRef) === canonicalJSON(requestRef),
    );
    ensure(polls.length > 0, 'remote gate lacks actual result polling');
    let previousAt = first.event.at;
    const verified = [];
    for (const poll of polls.sort((a, b) => a.event.callAt - b.event.callAt)) {
      ensure(
        canonicalJSON(poll.call.input.requestRef) === canonicalJSON(requestRef) &&
          poll.event.callAt >= previousAt &&
          poll.event.at <= receipt.event.callAt,
        'actual result polling is reordered or references another request',
      );
      previousAt = poll.event.at;
      if (poll.event.ok && poll.event.validationState === 'verified') verified.push(poll);
    }
    ensure(
      verified.length > 0 && receipt.event.callAt >= previousAt,
      'actual verified result did not precede receipt',
    );
    const resultRef = verified[0].envelope.result.resultRef;
    ensure(
      verified.every(
        (item) =>
          item.event.validationRequestDigest === requestRef.digest &&
          item.event.validationResultDigest === resultRef.digest,
      ) &&
        receipt.event.validationRequestDigest === requestRef.digest &&
        receipt.event.validationResultDigest === resultRef.digest,
      'observed request/result references differ',
    );
    ensure(
      verified.every(
        (item) => canonicalJSON(item.envelope.result.resultRef) === canonicalJSON(resultRef),
      ) && canonicalJSON(receiptInput.validationResult) === canonicalJSON(resultRef),
      'actual receipt/result digests differ',
    );
    ensure(
      resultRef?.root === descriptor.mailboxRoot &&
        /^results\/[A-Za-z0-9_-]+\.json$/.test(resultRef.path),
      'verified result is outside protected result namespace',
    );
    const resultText = readRegular(resolve(resultRef.root, resultRef.path), 32 * 1024),
      result = JSON.parse(resultText);
    ensure(
      digest(resultText) === resultRef.digest &&
        result.outcome === 'verified' &&
        canonicalJSON(result.requestRef) === canonicalJSON(requestRef) &&
        canonicalJSON(result.bootstrapRef) === canonicalJSON(ref),
      'protected result does not bind the actual request/admission',
    );
    for (const item of selected)
      if (item.call.operation === 'validation-await-admission')
        ensure(
          item.event.at <= first.event.callAt,
          'admission wait occurred after the actual request',
        );
    proofs.push({
      gate,
      session: validatorAlias,
      bootstrapDigest: ref.digest,
      requestDigest: requestRef.digest,
      resultDigest: resultRef.digest,
      requestCall: first.event.callDigest,
      verifiedCalls: verified.map((item) => item.event.callDigest),
      receiptCall: receipt.event.callDigest,
      earlierAttempts,
    });
  }
  ensure(
    events.every((event) => consumedEvents.has(event)),
    'foreign session, handle, request or gate contains remote helper calls',
  );
  return { gates: proofs };
}
export function startProtectedValidationObserver({ state, journalRoot, launchId, startedAt }) {
  const input = {
    descriptor: {
      ...state.protectedValidation,
      fixtureRoot: state.input.fixtureRoot,
      initialInputDigest: digest(state.prompt),
      nativeValidatorRoles: (state.nativePolicy.nativeRegistrations ?? [])
        .filter((role) =>
          /^effective-flow-code-validator(?:-(?:mechanical|deep))?$/.test(role.name),
        )
        .map((role) => role.name),
    },
    command: state.command,
    policy: state.nativePolicy,
    journalRoot,
    launchId,
    startedAt: state.processes[0]?.startedAt ?? startedAt,
    skillRoot: state.input.skillRoot,
    sessionRoot: state.input.transcriptDir,
    stopFile: resolve(journalRoot, launchId + '-validation-stop.json'),
  };
  const child = spawn(process.execPath, [import.meta.filename, 'watch'], {
    stdio: ['pipe', 'ignore', 'pipe'],
    env: { PATH: process.env.PATH, HOME: state.command.home, CODEX_HOME: state.command.codexHome },
  });
  child.stdin.end(JSON.stringify(input));
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    if (stderr.length < 64 * 1024) stderr += chunk;
  });
  child.on('exit', (code, signal) => {
    write(resolve(journalRoot, launchId + '-validation-observer-exit.json'), {
      code,
      signal,
      stderrDigest: digest(stderr),
    });
  });
  return { child, stopFile: input.stopFile };
}
export function stopProtectedValidationObserver(observer, journalRoot, launchId) {
  write(observer.stopFile, { stoppedAt: Date.now() });
  const summary = resolve(journalRoot, launchId + '-validation-observer-summary.json');
  const waiting = spawnSync(
    process.execPath,
    [
      '-e',
      'const fs=require("node:fs"),path=process.argv[1],limit=Date.now()+10000;while(Date.now()<limit){if(fs.existsSync(path))process.exit(0);Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);}process.exit(73);',
      summary,
    ],
    { encoding: 'utf8', timeout: 12000 },
  );
  ensure(waiting.status === 0, 'native validation observer did not stop successfully');
  return JSON.parse(readRegular(summary, 64 * 1024));
}
async function watch(input) {
  const { policy, command, journalRoot } = input;
  let descriptor = input.descriptor;
  const proof = probeProtectedValidationMailbox({
    mailboxRoot: descriptor.mailboxRoot,
    privateRoots: policy.privatePaths,
    command,
    policy,
    journalRoot,
  });
  write(resolve(journalRoot, input.launchId + '-validation-observer-ready.json'), {
    startedAt: Date.now(),
    policyDigest: policy.policyDigest,
  });
  const published = new Set(),
    deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline && !existsSync(input.stopFile)) {
    const sessions = nativeSessions(input.sessionRoot);
    descriptor = freezeObservedCreate({
      sessions,
      descriptor,
      skillRoot: input.skillRoot,
      startedAt: input.startedAt,
    });
    if (descriptor.requestRef)
      ensure(
        digest(readFileSync(resolve(descriptor.requestRef.root, descriptor.requestRef.path))) ===
          descriptor.requestRef.digest,
        'sealed original create request changed',
      );
    const admissions = observedValidatorAdmissions({
      sessions,
      descriptor,
      skillRoot: input.skillRoot,
      startedAt: input.startedAt,
    });
    for (const candidate of admissions) {
      const key = candidate.handle + '\0' + candidate.gate;
      if (published.has(key)) continue;
      const bootstrapFolder = resolve(descriptor.mailboxRoot, 'bootstraps');
      const prior = existsSync(bootstrapFolder)
        ? readdirSync(bootstrapFolder)
            .filter((name) => name.endsWith('.json'))
            .map((name) =>
              validateBootstrap(JSON.parse(readRegular(resolve(bootstrapFolder, name), 32 * 1024))),
            )
            .filter(
              (value) =>
                value.admission.runId === descriptor.request.runId &&
                value.admission.requestDigest === descriptor.requestRef.digest &&
                value.admission.gate === candidate.gate,
            )
        : [];
      ensure(prior.length <= 1, 'duplicate protected gate admission');
      if (prior.length) {
        ensure(
          prior[0].admission.validatorHandle === candidate.handle &&
            prior[0].policyDigest === validationDigest(descriptor.policy) &&
            prior[0].initialInputDigest === candidate.initialInputDigest,
          'existing admission differs from actual native validator',
        );
        published.add(key);
        continue;
      }
      ensure(
        admissions.filter((c) => c.gate === candidate.gate).length === 1,
        'ambiguous validators for gate',
      );
      const bootstrapId = proof.bootstrapId + '-' + candidate.gate;
      const canaryPath = resolve(descriptor.mailboxRoot, 'canaries', bootstrapId + '.txt');
      writeFileSync(
        canaryPath,
        readFileSync(
          resolve(proof.guardEvidence.canaryRef.root, proof.guardEvidence.canaryRef.path),
        ),
        { flag: 'wx', mode: 0o600 },
      );
      const bootstrap = validateBootstrap({
        protocol: PROTECTED_VALIDATION_PROTOCOL,
        bootstrapId,
        physicalMailboxRoot: descriptor.mailboxRoot,
        policyDigest: validationDigest(descriptor.policy),
        initialInputDigest: candidate.initialInputDigest,
        nativePolicyDigest: policy.policyDigest,
        guardEvidence: {
          ...proof.guardEvidence,
          canaryRef: {
            root: descriptor.mailboxRoot,
            path: 'canaries/' + bootstrapId + '.txt',
            digest: digest(readFileSync(canaryPath)),
          },
        },
        admission: {
          runtimeStateRoot: descriptor.runtimeStateRoot,
          repositoryIdentity: descriptor.request.repositoryIdentity,
          runId: descriptor.request.runId,
          requestDigest: descriptor.requestRef.digest,
          validatorHandle: candidate.handle,
          gate: candidate.gate,
        },
        policy: descriptor.policy,
      });
      write(
        resolve(journalRoot, input.launchId + '-validation-native-' + bootstrapId + '.json'),
        candidate,
      );
      write(resolve(descriptor.mailboxRoot, 'bootstraps', bootstrapId + '.json'), bootstrap);
      published.add(key);
    }
    await new Promise((done) => setTimeout(done, 100));
  }
  write(resolve(journalRoot, input.launchId + '-validation-observer-summary.json'), {
    published: [...published],
    finishedAt: Date.now(),
    rootIds: [
      ...new Set(
        nativeSessions(input.sessionRoot)
          .filter((s) => !s.parsed.meta?.parent_thread_id)
          .map((s) => s.parsed.meta?.id),
      ),
    ],
  });
}
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  try {
    ensure(process.argv.length === 3 && process.argv[2] === 'watch', 'host observer watch only');
    const bytes = readFileSync(0);
    ensure(bytes.length <= 256 * 1024, 'observer input too large');
    await watch(JSON.parse(bytes));
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  }
}
