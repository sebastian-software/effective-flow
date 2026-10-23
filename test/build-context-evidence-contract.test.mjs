// Adversarial unit fixtures are intentionally synthetic; none are behavioural recordings.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  realpathSync,
  existsSync,
  readdirSync,
  cpSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import {
  captureHostEvidence,
  parseTranscript,
  PRIVATE_CAPTURE,
  digest,
  actualModelMatches,
} from '../evals/build-context/_scaffold/transcript.mjs';
import {
  HostCoordinator,
  observedSettings,
  recordingSettings,
} from '../evals/build-context/_scaffold/host-coordinator.mjs';
import {
  envelope,
  completionProblems,
  BASELINE_COMMIT,
} from '../evals/build-context/_scaffold/host-receipt.mjs';
import {
  helperInvocation,
  observedExecRequest,
  observedExecResult,
  observedHelperEvent,
  rejectionProblems,
} from '../evals/build-context/_scaffold/helper-observation.mjs';
import {
  captureReview,
  nativeProblems,
  summarizeMatrix,
  median,
  nearestRank,
  sealAuxiliaryRecord,
} from '../evals/build-context/_scaffold/evidence.mjs';
import {
  verifyArchivedScenario,
  archiveReuseProblems,
} from '../evals/build-context/_scaffold/archive.mjs';
import { parseState } from '../evals/build-context/_scaffold/capture.mjs';
import { SCHEMA } from '../evals/build-context/_scaffold/protocol.mjs';
import suite from '../evals/build-context/suite.config.mjs';
import {
  nativePolicy,
  nativeExecArgs,
  nativeContextProblems,
  probeNativeSandbox,
  nativeSandboxArgs,
  mirrorTrackerLedger,
  trackerLedgerProblems,
  initializeNativeSettings,
} from '../evals/build-context/_scaffold/native-sandbox.mjs';
import { checkoutBasis, fileMembership } from '../evals/build-context/_scaffold/basis.mjs';
import { observeToolFailure } from '../evals/build-context/_scaffold/tool-failure.mjs';
const profile = {
  harness: 'codex-cli',
  model: 'gpt-6.1-sol',
  reasoningEffort: 'high',
  reportedVersion: '0.163.0',
  toolPolicy: 'isolated fixture',
};
const temporary = (t) => {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), 'flow-build-contract-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};
function transcript(id, extra = []) {
  return (
    [
      {
        type: 'session_meta',
        timestamp: '2026-10-20T10:00:00Z',
        payload: { id, cli_version: '0.163.0' },
      },
      {
        type: 'turn_context',
        timestamp: '2026-10-20T10:00:01Z',
        payload: { model: 'gpt-6.1-sol', effort: 'high' },
      },
      ...extra,
      {
        type: 'event_msg',
        timestamp: '2026-10-20T10:00:02Z',
        payload: {
          type: 'token_count',
          info: {
            last_token_usage: { input_tokens: 5, total_tokens: 8 },
            total_token_usage: { input_tokens: 5, cached_input_tokens: 0 },
          },
        },
      },
      { type: 'event_msg', timestamp: '2026-10-20T10:00:03Z', payload: { type: 'task_complete' } },
    ]
      .map(JSON.stringify)
      .join('\n') + '\n'
  );
}
test('E1 actual session identities and copied transcripts cannot be relabeled as new observations', (t) => {
  const root = temporary(t),
    a = resolve(root, 'a.jsonl'),
    b = resolve(root, 'b.jsonl');
  writeFileSync(a, transcript('real-one'));
  writeFileSync(b, readFileSync(a));
  const entries = [
    { alias: 'root', path: a, parent: null, target: 'portable' },
    {
      alias: 'reviewer',
      path: b,
      parent: 'root',
      spawnCallId: 'x',
      target: 'portable',
      roleMarker: 'independent-review',
    },
  ];
  assert.throws(
    () => captureHostEvidence({ harness: 'codex-cli', profile, sessions: entries }),
    /duplicate actual session or copied transcript/,
  );
  writeFileSync(b, transcript('real-one', [{ type: 'other', payload: 'different bytes' }]));
  assert.throws(
    () => captureHostEvidence({ harness: 'codex-cli', profile, sessions: entries }),
    /duplicate actual session/,
  );
});
test('E1 roleMarker and caller role do not turn a real root into an independent reviewer', (t) => {
  const root = temporary(t),
    path = resolve(root, 'root.jsonl');
  writeFileSync(path, transcript('actual-root'));
  assert.throws(
    () =>
      captureHostEvidence({
        harness: 'codex-cli',
        profile,
        sessions: [
          {
            alias: 'review',
            path,
            parent: null,
            target: 'portable',
            role: 'independent-review',
            roleMarker: 'independent-review',
          },
        ],
      }),
    /canonical assignment/,
  );
  const result = captureHostEvidence({
    harness: 'codex-cli',
    profile,
    sessions: [{ alias: 'root', path, parent: null, target: 'portable' }],
  });
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0].role, 'parent');
  assert.equal(result.metrics.cumulativeInput, 5);
});
test('E2 completion cannot be retroactively declared from old real-session timestamps', () => {
  const old = Date.parse('2026-10-20T10:00:00Z'),
    now = old + 60000;
  const prepared = envelope('prepared', { preparedAt: now, settingsDigest: digest('settings') });
  const launch = envelope('launch', {
    prepared,
    preparedSeal: prepared.seal,
    freshRoot: true,
    initialPromptObserved: true,
    firstUserDigest: digest('user'),
    rootSourceDigest: digest('raw'),
    rootIdentity: digest('root'),
    firstAt: old,
    lastAt: old + 3000,
    processes: [
      {
        settingsObservationDigest: digest('settings'),
        startedAt: now,
        finishedAt: now + 4000,
        exitCode: 0,
        guard: { writeDenied: true, wrapperDigest: digest('wrapper') },
        policyDigest: digest('policy'),
        stdoutDigest: digest('out'),
      },
    ],
  });
  const body = {
    observations: [{ parent: null, sessionIdentity: digest('root'), sourceDigest: digest('raw') }],
  };
  const run = {
    ...body,
    provenance: envelope('completion', {
      launch,
      protection: 'os-enforced',
      runDigest: digest(JSON.stringify(body)),
    }),
  };
  assert.match(completionProblems(run).join('\n'), /fresh root\/process timestamps/);
});
test('E2 observed settings normalize neutral host paths and catch real config drift and shadow skills', (t) => {
  const root = temporary(t),
    one = resolve(root, 'one'),
    two = resolve(root, 'two');
  mkdirSync(one);
  mkdirSync(two);
  const command = (home) => ({
    executable: '/opt/homebrew/bin/codex',
    home,
    codexHome: home,
    args: ['exec', '--ignore-user-config', '--ignore-rules', '-C', home],
    profile,
  });
  const observe = (home) => observedSettings(command(home), { home, codexHome: home });
  assert.deepEqual(observe(one), observe(two));
  writeFileSync(resolve(one, 'config.toml'), 'model="different"\n');
  assert.notDeepEqual(observe(one), observe(two));
  mkdirSync(resolve(two, 'skills'));
  writeFileSync(resolve(two, 'skills', 'shadow.md'), 'shadow');
  assert.throws(() => observe(two), /shadow/);
});
test('E2 no completion, failed closure or historical adoption exists before an actual launch', (t) => {
  const coordinator = new HostCoordinator(resolve(temporary(t), 'journal'), { suite });
  assert.throws(
    () => coordinator.complete('invented', { host: { sessions: [] } }),
    /actual coordinator launch/,
  );
  assert.throws(() => coordinator.fail('invented'), /actual launched process/);
  assert.equal(typeof coordinator.adopt, 'undefined');
});
test('E2 and E7 naked repeated metric declarations never fill the twenty-pair matrix', () => {
  const records = ['codex-cli', 'claude-code'].flatMap((harness) =>
    ['simple', 'review-correction'].flatMap((complexity) =>
      [1, 2, 3, 4, 5].map((slot) => ({
        kind: 'pair',
        harness,
        complexity,
        slot,
        baselineRun: { metrics: { parentPeakInput: 10, cumulativeInput: 10, elapsedMs: 10 } },
        candidateRun: { metrics: { parentPeakInput: 1, cumulativeInput: 1, elapsedMs: 1 } },
      })),
    ),
  );
  const result = summarizeMatrix(records);
  assert.equal(result.cells.length, 4);
  assert.equal(result.failsStrict, true);
  assert.ok(result.cells.every((c) => c.state === 'unproven'));
  assert.equal(median([0.1, 0.8, 0.3, 0.4, 0.2]), 0.3);
  assert.equal(nearestRank([1, 2, 3, 4, 99], 0.95), 99);
});
test('E3 malformed or missing state/logs never become fresh via current metadata', (t) => {
  const directory = temporary(t),
    scenario = 'approved-single-module';
  for (let slot = 1; slot <= 5; slot++) {
    const stem = resolve(directory, 'run-' + slot),
      prompt = 'actual archived task bytes',
      fixture = JSON.parse(
        readFileSync(resolve(suite.root, 'fixtures', scenario + '.json'), 'utf8'),
      );
    writeFileSync(
      stem + '.metadata.json',
      JSON.stringify({
        scenario,
        slot,
        projectRoot: directory,
        promptDigest: digest(prompt),
        fixtureDigest: digest(JSON.stringify(fixture, null, 2) + '\n'),
        profile,
      }),
    );
    writeFileSync(stem + '.prompt.txt', prompt);
    writeFileSync(stem + '.build.json', '{}');
    writeFileSync(resolve(directory, 'run-' + slot + '.jsonl'), 'not-json\n');
    writeFileSync(
      resolve(directory, 'run-' + slot + '.build-context-state.json'),
      JSON.stringify({ schema: SCHEMA, scenario, variants: [] }),
    );
    const malformed = verifyArchivedScenario(suite, { scenario, slot, directory, identity: {} });
    assert.ok(
      malformed.some((p) => /JSON|json|malformed/.test(p)),
      malformed.join('\n'),
    );
    writeFileSync(stem + '.jsonl', '');
    writeFileSync(
      stem + '.build-context-state.json',
      JSON.stringify({ schema: SCHEMA, scenario, variants: [], errors: [] }),
    );
    assert.match(
      verifyArchivedScenario(suite, { scenario, slot, directory, identity: {} }).join('\n'),
      /missing unique complete actual execution/,
    );
    rmSync(stem + '.build-context-state.json');
    assert.match(
      verifyArchivedScenario(suite, { scenario, slot, directory, identity: {} }).join('\n'),
      /ENOENT/,
    );
  }
  assert.ok(parseState(JSON.stringify({ schema: SCHEMA, scenario, variants: [] })).problems.length);
  assert.ok(
    parseState(JSON.stringify({ schema: SCHEMA, scenario, variants: [], errors: [] })).problems
      .length === 0,
  );
});
test('E3 archive corpus requires exactly five slots and actual evidence files', (t) => {
  const root = temporary(t),
    scenario = 'approved-single-module';
  mkdirSync(resolve(root, scenario));
  writeFileSync(resolve(root, scenario, 'run-1.jsonl'), '{}');
  assert.match(archiveReuseProblems(suite, root).join('\n'), /exactly five|ENOENT/);
});
test('E4 helper boundaries require the exact operation, real input bytes and distinct variant call', () => {
  assert.equal(
    helperInvocation({ cmd: 'printf "node /x/scripts/build-run.mjs question TOO_LARGE"' }),
    null,
  );
  const value = helperInvocation({
    cmd: 'node /x/scripts/build-run.mjs question <<\'JSON\'\n{"question":"ä"}\nJSON',
  });
  assert.equal(value.operation, 'question');
  assert.equal(value.inputBytes, Buffer.byteLength('{"question":"ä"}'));
  const event = {
    variant: 'oversized-question',
    family: 'build-run',
    operation: 'unrelated-operation',
    ok: false,
    code: 'TOO_LARGE',
    requestVerified: true,
    run: digest('run'),
    requestDigest: digest('request'),
    inputDigest: digest('input'),
    callDigest: digest('call'),
    at: 1,
    questionBytes: 20000,
  };
  assert.ok(rejectionProblems({ boundaryProbes: [event] }, 'oversized-question').length);
  event.operation = 'question';
  assert.deepEqual(rejectionProblems({ boundaryProbes: [event] }, 'oversized-question'), []);
  assert.ok(rejectionProblems({ boundaryProbes: [event] }, 'oversized-result').length);
  assert.ok(
    rejectionProblems(
      {
        boundaryProbes: [
          {
            ...event,
            variant: 'missing-evidence',
            operation: 'verify-terminal',
            code: 'MISSING_EVIDENCE',
          },
        ],
      },
      'missing-evidence',
    ).length,
  );
});
test('E5 native declarations cannot hide reversed lifecycle or unrelated private record', () => {
  const e = (family, operation, at) => ({
    family,
    operation,
    ok: true,
    at,
    session: 'root',
    generation: 'a',
    run: 'b',
    inputDigest: digest('i'),
    callDigest: digest(operation),
    sourceDigest: digest('s'),
  });
  const run = {
    observations: [],
    helperEvents: [
      e('pilot', 'start', 10),
      e('pilot', 'start-packet', 11),
      e('pilot', 'finalize', 1),
      e('build-run', 'question', 12),
      e('build-run', 'reply', 13),
      e('build-run', 'resume', 14),
    ],
    nativePilot: { generation: 'other', run: 'other' },
  };
  const problems = nativeProblems({ target: 'codex', harness: 'codex-cli', run });
  assert.match(problems.join('\n'), /chronology/);
  assert.match(problems.join('\n'), /identities do not correlate/);
  assert.match(problems.join('\n'), /original runner and actual user/);
});
test('E6 a valid-looking verdict from the root is rejected before any count is trusted', (t) => {
  const path = resolve(temporary(t), 'review.jsonl'),
    text =
      JSON.stringify({ type: 'result', result: '{"reviewSchema":"' + SCHEMA + '","critical":0}' }) +
      '\n';
  writeFileSync(path, text);
  assert.throws(
    () =>
      captureReview(
        path,
        { observations: [{ role: 'parent', parent: null, sourceDigest: digest(text) }] },
        '/unused',
        { text: 'blinded' },
      ),
    /observed fresh independent reviewer/,
  );
});
test('E7 approved baseline identity is the exact full commit and a non-Git artifact cannot be built', (t) => {
  assert.equal(BASELINE_COMMIT, 'de23f9b2ab7a93b747aa22a4d985824899d2c916');
  const root = temporary(t),
    source = resolve(root, 'artifact');
  mkdirSync(source);
  writeFileSync(resolve(source, 'build.mjs'), '');
  const coordinator = new HostCoordinator(resolve(root, 'journal'), { suite });
  assert.throws(() =>
    coordinator.build({
      sourceRoot: source,
      outputRoot: resolve(root, 'out'),
      condition: 'baseline',
    }),
  );
});
test(
  'E2 actual launch wrapper checks a realpath write denial inherited by its child process',
  { skip: process.platform !== 'darwin' },
  (t) => {
    const root = temporary(t),
      canary = resolve(root, 'canary');
    writeFileSync(canary, 'original');
    const policy =
      '(version 1)(allow default)(deny file-write* (subpath ' + JSON.stringify(root) + '))';
    const wrapper = resolve(
      import.meta.dirname,
      '../evals/build-context/_scaffold/host-guard-launch.mjs',
    );
    const result = spawnSync(
      '/usr/bin/sandbox-exec',
      [
        '-p',
        policy,
        process.execPath,
        wrapper,
        canary,
        process.execPath,
        '-e',
        'try{require("node:fs").writeFileSync(process.argv[1],"changed");process.exit(42)}catch(e){process.exit(e.code==="EPERM"?0:43)}',
        canary,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout.split('\n')[0]).writeDenied, true);
    assert.equal(readFileSync(canary, 'utf8'), 'original');
  },
);

test('E1 provider alias resolution cannot relabel an unrelated actual model', () => {
  assert.equal(actualModelMatches('opus', 'claude-opus-5-5', 'claude-code'), true);
  assert.equal(actualModelMatches('opus', 'claude-sonnet-5-5', 'claude-code'), false);
  assert.equal(actualModelMatches('gpt-5.6-luna', 'gpt-6.1-sol', 'codex-cli'), false);
});

test('E2 system bootstrap pin rejects arbitrary .system contents as well as user skills', (t) => {
  const root = temporary(t),
    home = resolve(root, 'home'),
    config = resolve(root, 'config');
  mkdirSync(home);
  mkdirSync(config);
  const command = {
    executable: '/opt/homebrew/bin/codex',
    home,
    codexHome: config,
    args: ['exec', '--ignore-user-config', '--ignore-rules'],
    profile,
  };
  const before = observedSettings(command, { home, codexHome: config });
  assert.match(before.managedSystemInventory, /^sha256:/);
  const system = resolve(config, 'skills/.system');
  mkdirSync(system, { recursive: true });
  writeFileSync(resolve(system, '.codex-system-skills.marker'), 'pretend canonical');
  assert.throws(
    () => observedSettings(command, { home, codexHome: config }),
    /noncanonical managed system skill inventory/,
  );
  rmSync(system, { recursive: true });
  mkdirSync(resolve(config, 'skills/arbitrary'));
  assert.throws(() => observedSettings(command, { home, codexHome: config }), /shadow/);
});

test('C2 Claude preserves each actual call/result timestamp and never invents a missing timestamp', () => {
  const rows = [
    {
      type: 'assistant',
      timestamp: '2026-10-20T10:00:01Z',
      message: {
        content: [
          { type: 'tool_use', id: 'read-1', name: 'Read', input: { file_path: 'actual-file' } },
        ],
      },
    },
    {
      type: 'user',
      timestamp: '2026-10-20T10:00:04Z',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'read-1',
            content: [{ type: 'text', text: 'actual\nmultiline output' }],
          },
        ],
      },
    },
  ];
  const parse = () => parseTranscript(rows.map(JSON.stringify).join('\n'), 'claude-code');
  const observed = parse();
  assert.equal(observed.calls[0].at, Date.parse(rows[0].timestamp));
  assert.equal(observed.tools[0].at, Date.parse(rows[1].timestamp));
  delete rows[0].timestamp;
  delete rows[1].timestamp;
  const missing = parse();
  assert.ok(Number.isNaN(missing.calls[0].at));
  assert.ok(Number.isNaN(missing.tools[0].at));
});

test('C1 actual Claude fresh-task reviewer accepts bound criteria/content while inherited or unknown boundaries fail', (t) => {
  const root = temporary(t),
    skill = resolve(root, 'skill'),
    contract = '# Canonical reviewer\n\nRead actual content and independently judge it.\n',
    assignment = {
      path: resolve(root, 'host-review.txt'),
      text: 'Review these neutral acceptance criteria and seeded blocker checks.',
      criteriaDigest: digest('actual criteria'),
    };
  mkdirSync(resolve(skill, 'workers'), { recursive: true });
  writeFileSync(resolve(skill, 'SKILL.md'), '# Actual router\n');
  writeFileSync(resolve(skill, 'workers/effective-flow-nodejs-reviewer.md'), contract);
  const files = {
    'src/slug.mjs': 'export const slug = value => value;\n',
    'test/acceptance.test.mjs': '// actual independent acceptance\n',
    'README.md': '# Actual fixture documentation\n',
  };
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(resolve(root, name, '..'), { recursive: true });
    writeFileSync(resolve(root, name), body);
  }
  const verdict = {
    reviewSchema: SCHEMA,
    critical: 0,
    important: 0,
    missedSeededBlockers: 0,
    unauthorizedActions: 0,
    falseCompletion: 0,
    skippedValidation: 0,
  };
  const row = (type, second, content, extra = {}) => ({
    type,
    timestamp: `2026-10-20T10:00:0${second}Z`,
    ...extra,
    message: {
      content,
      ...(type === 'assistant'
        ? {
            id: 'msg-' + second,
            model: 'claude-opus-5-5',
            effort: 'high',
            usage: { input_tokens: 5, output_tokens: 1 },
          }
        : {}),
    },
  });
  const parent = [
    row('user', 0, 'Run the actual workflow.', { session_id: 'actual-parent' }),
    row('assistant', 1, [
      {
        type: 'tool_use',
        id: 'router',
        name: 'Read',
        input: { file_path: resolve(skill, 'SKILL.md') },
      },
    ]),
    row('user', 2, [{ type: 'tool_result', tool_use_id: 'router', content: '# Actual router\n' }]),
    row('assistant', 3, [
      {
        type: 'tool_use',
        id: 'review-spawn',
        name: 'Agent',
        input: { model: 'opus', effort: 'high', prompt: 'Fresh independent review' },
      },
    ]),
    row('user', 8, [
      { type: 'tool_result', tool_use_id: 'review-spawn', content: 'actual-reviewer-handle' },
    ]),
    { type: 'result', timestamp: '2026-10-20T10:00:09Z', is_error: false, result: 'completed' },
  ];
  const child = [
    row('user', 3, 'Read workers/effective-flow-nodejs-reviewer.md. ' + assignment.text, {
      session_id: 'actual-child',
      parent_tool_use_id: 'review-spawn',
    }),
    row('assistant', 4, [
      {
        type: 'tool_use',
        id: 'review-read',
        name: 'Read',
        input: { file_path: 'actual contract and checkout' },
      },
    ]),
    row('user', 5, [
      {
        type: 'tool_result',
        tool_use_id: 'review-read',
        content: [{ type: 'text', text: contract + '\n' + Object.values(files).join('\n') }],
      },
    ]),
    {
      type: 'result',
      timestamp: '2026-10-20T10:00:07Z',
      is_error: false,
      result: JSON.stringify(verdict),
    },
  ];
  const parentPath = resolve(root, 'parent.jsonl'),
    childPath = resolve(root, 'child.jsonl');
  writeFileSync(parentPath, parent.map(JSON.stringify).join('\n'));
  writeFileSync(childPath, child.map(JSON.stringify).join('\n'));
  const host = captureHostEvidence({
    harness: 'claude-code',
    skillRoot: skill,
    profile: {
      harness: 'claude-code',
      model: 'opus',
      reasoningEffort: 'high',
      reportedVersion: '2.1.292',
      toolPolicy: 'unit fixture',
    },
    sessions: [
      { alias: 'parent', path: parentPath, parent: null, target: 'portable' },
      {
        alias: 'reviewer',
        path: childPath,
        parent: 'parent',
        spawnCallId: 'review-spawn',
        nativeId: 'actual-reviewer-handle',
        target: 'portable',
      },
    ],
  });
  const observation = host.observations.find((o) => o.session === 'reviewer');
  assert.equal(observation.requestedInheritance, 'fresh-task');
  assert.equal(observation.role, 'independent-review');
  const accepted = captureReview(childPath, host, root, assignment);
  assert.equal(accepted.reviewerSessionIdentity, observation.sessionIdentity);
  assert.equal(accepted.assignmentDigest, digest(assignment.text));
  for (const inheritance of [null, 'unknown', 'all', 'none']) {
    observation.requestedInheritance = inheritance;
    assert.throws(
      () => captureReview(childPath, host, root, assignment),
      /observed fresh independent reviewer/,
    );
  }
  observation.requestedInheritance = 'fresh-task';
  assert.throws(
    () => captureReview(childPath, host, root, { ...assignment, text: 'different criteria' }),
    /controlled assignment/,
  );
  const actual = [...host[PRIVATE_CAPTURE].sessions.values()].find(
    (v) => v.parsed.sourceDigest === observation.sourceDigest,
  ).parsed;
  actual.tools = [];
  assert.throws(
    () => captureReview(childPath, host, root, assignment),
    /did not read actual reviewed content/,
  );
});

test('C3 generated native TOML and actual multiline messages establish roles, labels or escaped substitutes do not', (t) => {
  const root = temporary(t),
    output = resolve(root, 'built');
  const build = spawnSync(process.execPath, ['build.mjs'], {
    cwd: resolve(import.meta.dirname, '..'),
    env: {
      ...process.env,
      EFFECTIVE_FLOW_BUILD_OUTPUT_ROOT: output,
      EFFECTIVE_FLOW_BUILD_GIT_HASH: 'eval',
    },
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(build.status, 0, build.stderr);
  const nativeSkill = resolve(output, 'dist/codex/effective-flow'),
    portableSkill = resolve(output, 'dist/portable/effective-flow'),
    nativePath = resolve(nativeSkill, '../agents/effective-flow-nodejs-reviewer.toml'),
    nativeContract = readFileSync(nativePath, 'utf8');
  const body = nativeContract.match(/developer_instructions = '''\n([\s\S]*?)\n'''/)?.[1];
  assert.ok(body?.includes('\n'));
  assert.ok(body.length > 100);
  const parentPath = resolve(root, 'root.jsonl'),
    childPath = resolve(root, 'child.jsonl'),
    handle = '/root/canonical-reviewer';
  const user = (text) => ({
    type: 'response_item',
    timestamp: '2026-10-20T10:00:01Z',
    payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
  });
  const developer = (text) => ({
    type: 'response_item',
    timestamp: '2026-10-20T10:00:01Z',
    payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text }] },
  });
  const call = (id, name, args) => ({
    type: 'response_item',
    timestamp: '2026-10-20T10:00:01Z',
    payload: { type: 'function_call', call_id: id, name, arguments: JSON.stringify(args) },
  });
  const result = (id, value) => ({
    type: 'response_item',
    timestamp: '2026-10-20T10:00:02Z',
    payload: { type: 'function_call_output', call_id: id, output: JSON.stringify(value) },
  });
  function observe({
    skill = nativeSkill,
    target = 'codex',
    instructions = body,
    assignment = 'Review the actual source independently.',
    read = null,
    native = true,
  } = {}) {
    const parentExtra = [
      user('Run the actual workflow.'),
      call('router', 'exec_command', { cmd: 'cat ' + resolve(skill, 'SKILL.md') }),
      result('router', { output: readFileSync(resolve(skill, 'SKILL.md'), 'utf8') }),
      call('spawn', 'spawn_agent', {
        task_name: 'canonical-reviewer',
        model: 'gpt-6.1-sol',
        reasoning_effort: 'high',
        fork_turns: 'none',
        message: assignment,
      }),
      result('spawn', { task_name: handle }),
    ];
    writeFileSync(parentPath, transcript('canonical-root', parentExtra));
    const childRows = transcript('canonical-child', [
      ...(assignment ? [user(assignment)] : []),
      ...(instructions ? [developer(instructions)] : []),
      ...(read
        ? [
            call('read', 'exec_command', { cmd: 'cat canonical-worker' }),
            result('read', { content: [{ type: 'text', text: read }] }),
          ]
        : []),
    ])
      .trim()
      .split('\n')
      .map(JSON.parse);
    Object.assign(childRows[0].payload, {
      parent_thread_id: 'canonical-root',
      agent_path: handle,
      ...(native
        ? {
            source: {
              subagent: { thread_spawn: { agent_role: 'effective-flow-nodejs-reviewer' } },
            },
          }
        : {}),
    });
    writeFileSync(childPath, childRows.map(JSON.stringify).join('\n'));
    return captureHostEvidence({
      harness: 'codex-cli',
      profile,
      skillRoot: skill,
      sessions: [
        { alias: 'parent', path: parentPath, parent: null, target },
        { alias: 'reviewer', path: childPath, parent: 'parent', spawnCallId: 'spawn', target },
      ],
    }).observations.find((o) => o.session === 'reviewer');
  }
  assert.equal(observe().role, 'independent-review');
  assert.equal(observe().roleEvidence.contractDigest, digest(nativeContract));
  assert.equal(observe({ instructions: JSON.stringify(body) }).role, 'unclassified');
  assert.equal(observe({ instructions: body.trim().slice(1) }).role, 'unclassified');
  assert.equal(observe({ assignment: '' }).role, 'unclassified');
  assert.equal(observe({ instructions: 'effective-flow-nodejs-reviewer' }).role, 'unclassified');
  writeFileSync(
    nativePath,
    nativeContract
      .replace("developer_instructions = '''", 'developer_instructions = """')
      .replace(/'''\s*$/, '"""\n'),
  );
  assert.equal(observe().role, 'independent-review');
  const portable = readFileSync(
      resolve(portableSkill, 'workers/effective-flow-nodejs-reviewer.md'),
      'utf8',
    ),
    portableArgs = {
      skill: portableSkill,
      target: 'portable',
      assignment:
        'Read workers/effective-flow-nodejs-reviewer.md and independently review the source.',
      instructions: null,
      native: false,
    };
  assert.equal(observe({ ...portableArgs, read: portable }).role, 'independent-review');
  assert.equal(observe(portableArgs).role, 'unclassified');
  assert.equal(
    observe({ ...portableArgs, read: 'workers/effective-flow-nodejs-reviewer.md' }).role,
    'unclassified',
  );
});

test('native launch grammar rejects attached/equal policy bypasses, output controls and untyped TOML', (t) => {
  const root = temporary(t),
    policy = { fixture: root, configs: ['approval_policy="never"'] },
    valid = [
      'exec',
      '--ignore-user-config',
      '--ignore-rules',
      '--json',
      '-m',
      'gpt-6.1-sol',
      '-c',
      'model_reasoning_effort="high"',
      '-s',
      'workspace-write',
      '-C',
      root,
      '-',
    ];
  assert.ok(nativeExecArgs(valid, policy).includes('exec'));
  for (const extra of [
    ['-capproval_policy="untrusted"'],
    ['-P:workspace'],
    ['--enable=plugins'],
    ['-cpermissions.flow-build-context.filesystem={":root"="write"}'],
    ['--dangerously-bypass-approvals-and-sandbox'],
    ['--sandbox=danger-full-access'],
    ['--output-last-message', resolve(root, 'protected')],
    ['--config', 'approval_policy="never"'],
    ['-c', 'agents.enabled=true\napproval_policy="never"'],
    ['-c', 'model_reasoning_effort="high"\ndefault_permissions=":danger-full-access"'],
    ['-c', 'features.multi_agent_v2.max_concurrent_threads_per_session=101'],
    ['-c', 'agents.enabled="true"'],
    ['unexpected prompt'],
    ['--search'],
    ['-p', 'other'],
  ]) {
    assert.throws(
      () => nativeExecArgs([...valid.slice(0, -1), ...extra, '-'], policy),
      /native|closed|unrecognized/,
    );
  }
  const resumed = nativeExecArgs(
    [...valid.slice(0, -1), 'resume', '12345678-1234-1234-1234-123456789abc', '-'],
    policy,
    { resume: true },
  );
  assert.ok(resumed.includes('resume'));
  assert.throws(
    () =>
      nativeExecArgs([...valid.slice(0, -1), 'resume', 'not-an-observed-root', '-'], policy, {
        resume: true,
      }),
    /unrecognized/,
  );
});

test('native policy verification compares every actual permission entry and tool policy, never just its name', () => {
  const root = '/private/fixture',
    policy = {
      fixture: root,
      definition: {
        filesystem: {
          ':slash_tmp': 'read',
          ':tmpdir': 'read',
          [root + '/.git']: 'write',
          '/private/host': 'read',
          '/private/origin.git': 'write',
        },
      },
    };
  const values = new Map([
    [':root', 'read'],
    [':slash_tmp', 'read'],
    [':tmpdir', 'read'],
    [root, 'write'],
    ...['.git', '.agents', '.codex', '.aws'].map((n) => [root + '/' + n, 'read']),
    ...Object.entries(policy.definition.filesystem),
  ]);
  const entries = [...values].map(([path, access]) => ({
    path: path.startsWith(':')
      ? { type: 'special', value: { kind: path.slice(1) } }
      : { type: 'path', path },
    access,
  }));
  const actual = {
    cwd: root,
    approvalPolicy: 'never',
    permissionProfile: {
      type: 'managed',
      file_system: { type: 'restricted', entries },
      network: 'restricted',
    },
    fileSystemSandboxPolicy: { kind: 'restricted', entries },
  };
  assert.deepEqual(nativeContextProblems([actual], policy), []);
  for (const mutate of [
    (v) => {
      v.approvalPolicy = 'on-request';
    },
    (v) => {
      v.permissionProfile.file_system.entries.push({
        path: { type: 'path', path: '/private/host' },
        access: 'write',
      });
    },
    (v) => {
      v.permissionProfile.file_system.entries.find(
        (e) => e.path.value?.kind === 'slash_tmp',
      ).access = 'write';
    },
    (v) => {
      v.fileSystemSandboxPolicy = { kind: 'external' };
    },
    (v) => {
      v.permissionProfile.unrecognizedAuthority = true;
    },
  ]) {
    const bad = structuredClone(actual);
    mutate(bad);
    assert.ok(nativeContextProblems([bad], policy).length);
  }
  assert.ok(nativeContextProblems([], policy).length);
});

function failureFixture(t) {
  const root = temporary(t),
    prompt = 'Read the supplied fixture router.',
    startedAt = Date.parse('2026-10-20T10:00:00Z'),
    call = {
      type: 'response_item',
      timestamp: '2026-10-20T10:00:01Z',
      payload: {
        type: 'custom_tool_call',
        call_id: 'actual-exec-call',
        name: 'exec',
        input:
          'text(await tools.exec_command({cmd:"cat supplied-router.md",max_output_tokens:12000}));',
      },
    },
    output = {
      type: 'response_item',
      timestamp: '2026-10-20T10:00:02Z',
      payload: {
        type: 'custom_tool_call_output',
        call_id: 'actual-exec-call',
        output: [
          {
            type: 'input_text',
            text: JSON.stringify({
              exit_code: 71,
              output: 'sandbox-exec: sandbox_apply: Operation not permitted\n',
            }),
          },
        ],
      },
    };
  const rows = transcript('actual-root', [
    {
      type: 'response_item',
      timestamp: '2026-10-20T10:00:00Z',
      payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: prompt }] },
    },
    call,
    output,
  ])
    .trim()
    .split('\n')
    .map(JSON.parse);
  rows[0].payload.cwd = root;
  const stdoutText = JSON.stringify({ type: 'thread.started', thread_id: 'actual-root' }) + '\n',
    process = {
      startedAt,
      finishedAt: startedAt + 5000,
      exitCode: 0,
      stdoutDigest: digest(stdoutText),
    };
  return {
    root,
    rows,
    stdoutText,
    process,
    prompt,
    fixtureRoot: root,
    reportedVersion: '0.163.0',
    observe(modify = () => {}) {
      const copy = structuredClone(rows);
      modify(copy);
      return observeToolFailure({ ...this, rootText: copy.map(JSON.stringify).join('\n') });
    },
  };
}

test('zero-exit native tool failure is bound to actual call/result, immutable stdout, root, prompt and process', (t) => {
  const fixture = failureFixture(t),
    observed = fixture.observe();
  assert.equal(observed.kind, 'tool-capability');
  assert.equal(observed.cliExitCode, 0);
  assert.equal(observed.toolExitCode, 71);
  assert.equal(observed.stdoutDigest, fixture.process.stdoutDigest);
  assert.throws(
    () =>
      fixture.observe((rows) => {
        rows.find((r) => r.payload?.type === 'custom_tool_call_output').payload.call_id =
          'unassociated';
      }),
    /tool sandbox error missing/,
  );
  assert.throws(
    () =>
      fixture.observe((rows) => {
        rows.find((r) => r.payload?.type === 'custom_tool_call_output').payload.output = [
          { type: 'input_text', text: 'sandbox-exec: sandbox_apply: Operation not permitted' },
        ];
      }),
    /tool sandbox error missing/,
  );
  assert.throws(
    () =>
      fixture.observe((rows) => {
        rows.find((r) => r.payload?.type === 'custom_tool_call').payload.input =
          'text({exit_code:71,output:"sandbox-exec: sandbox_apply: Operation not permitted"});';
      }),
    /tool sandbox error missing/,
  );
  assert.throws(
    () =>
      fixture.observe((rows) => {
        rows[0].payload.id = 'another-real-root';
      }),
    /metadata differs/,
  );
  assert.throws(
    () =>
      observeToolFailure({
        ...fixture,
        rootText: fixture.rows.map(JSON.stringify).join('\n'),
        stdoutText: fixture.stdoutText + '{}\n',
      }),
    /stdout changed/,
  );
  assert.throws(
    () =>
      observeToolFailure({
        ...fixture,
        rootText: fixture.rows.map(JSON.stringify).join('\n'),
        process: {
          ...fixture.process,
          startedAt: fixture.process.startedAt + 60000,
          finishedAt: fixture.process.finishedAt + 60000,
        },
      }),
    /predeclared process/,
  );
});

test('closed fail retains CLI exit zero and null metrics for an actual associated tool capability failure', (t) => {
  const fixture = failureFixture(t),
    home = resolve(fixture.root, 'config'),
    sessions = resolve(home, 'sessions');
  mkdirSync(sessions, { recursive: true });
  const raw = resolve(sessions, 'root.jsonl'),
    stdout = resolve(fixture.root, 'host-process.jsonl');
  writeFileSync(raw, fixture.rows.map(JSON.stringify).join('\n'));
  writeFileSync(stdout, fixture.stdoutText);
  const coordinator = new HostCoordinator(resolve(fixture.root, 'journal'), { suite }),
    receipt = envelope('prepared', { profile: { reportedVersion: '0.163.0' } });
  coordinator.launches.set('observed', {
    closed: false,
    receipt,
    command: { codexHome: home },
    input: { fixtureRoot: fixture.root },
    prompt: fixture.prompt,
    processes: [fixture.process],
    outputPaths: [stdout],
  });
  const result = coordinator.fail('observed', { rootTranscript: raw });
  assert.equal(result.payload.processes[0].exitCode, 0);
  assert.equal(result.payload.metrics, null);
  assert.equal(result.payload.failure.toolExitCode, 71);
  assert.equal(coordinator.launches.get('observed').closed, true);
});

test(
  'actual Codex native guard permits fixture Git push and missing stub ledger while denying host writes in descendants',
  { skip: process.platform !== 'darwin' || !existsSync('/opt/homebrew/bin/codex') },
  (t) => {
    const root = temporary(t),
      fixture = resolve(root, 'project'),
      skill = resolve(root, 'skill'),
      host = resolve(root, 'journal'),
      home = resolve(root, 'home'),
      config = resolve(root, 'config'),
      sessions = resolve(config, 'sessions');
    for (const dir of [fixture, resolve(skill, 'scripts'), host, home, config, sessions])
      mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(fixture, '.build-context-fixture'), SCHEMA + '\n');
    writeFileSync(resolve(fixture, 'README.md'), 'Actual local fixture.\n');
    writeFileSync(resolve(fixture, '.gitignore'), '.effective-flow/\n');
    const git = (...args) => execFileSync('git', args, { cwd: fixture, stdio: 'pipe' });
    git('init', '-q', '-b', 'develop');
    git('add', '.');
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@invalid',
      'commit',
      '-qm',
      'test: fixture',
    );
    const origin = resolve(root, 'fixture-origin.git');
    execFileSync('git', ['init', '--bare', '-q', origin]);
    git('remote', 'add', 'origin', origin);
    git('push', '-q', 'origin', 'develop');
    writeFileSync(
      resolve(skill, 'scripts/remote-tracker.mjs'),
      readFileSync(resolve(suite.root, '../_scaffold/remote-tracker.mjs')),
    );
    writeFileSync(resolve(root, 'fixture.json'), JSON.stringify({ operations: {} }));
    const policy = nativePolicy({
        fixtureRoot: fixture,
        skillRoot: skill,
        protectedRoots: [host, home, config, sessions],
      }),
      args = nativeExecArgs(
        [
          'exec',
          '--ignore-user-config',
          '--ignore-rules',
          '--json',
          '-m',
          'gpt-6.1-sol',
          '-c',
          'model_reasoning_effort="high"',
          '-',
        ],
        policy,
      ),
      before = checkoutBasis(fixture);
    assert.equal(existsSync(policy.ledger), false);
    assert.equal(existsSync(policy.lock), false);
    const observed = probeNativeSandbox({
      executable: '/opt/homebrew/bin/codex',
      reportedVersion: '0.163.0',
      policy,
      environment: { PATH: process.env.PATH, HOME: home, CODEX_HOME: config },
      execArgs: args,
    });
    assert.equal(observed.inheritedDenied, true);
    assert.equal(observed.gitPush, true);
    assert.equal(observed.stubLedger, true);
    assert.equal(observed.execArgumentsDigest, digest(JSON.stringify(args)));
    assert.deepEqual(checkoutBasis(fixture), before);
    assert.equal(existsSync(policy.ledger), false);
    assert.equal(existsSync(policy.lock), false);
    const command = {
      executable: '/opt/homebrew/bin/codex',
      args,
      home,
      codexHome: config,
      profile,
    };
    const settingsInput = { fixtureRoot: fixture, skillRoot: skill, transcriptDir: sessions };
    assert.equal(existsSync(resolve(config, 'config.toml')), false);
    const initialization = initializeNativeSettings({ command, policy, journalRoot: host });
    assert.equal(initialization.beforeDigest, null);
    const canonicalConfig = '[projects.' + JSON.stringify(fixture) + ']\ntrust_level = "trusted"\n';
    assert.equal(readFileSync(resolve(config, 'config.toml'), 'utf8'), canonicalConfig);
    const owned = resolve(fixture, '.effective-flow/owned-worktree');
    git('worktree', 'add', '--detach', owned, 'HEAD');
    t.after(() => {
      try {
        git('worktree', 'remove', '--force', owned);
      } catch {}
    });
    const childPrefix = args.slice(0, args.indexOf('exec'));
    childPrefix[1] = owned;
    const configRead = spawnSync(
      process.execPath,
      [
        resolve(
          import.meta.dirname,
          '../evals/build-context/_scaffold/native-registration-probe.mjs',
        ),
      ],
      {
        input: JSON.stringify({
          executable: command.executable,
          args: childPrefix,
          cwd: owned,
          environment: { PATH: process.env.PATH, HOME: home, CODEX_HOME: config },
          registrations: [],
        }),
        encoding: 'utf8',
        timeout: 20000,
      },
    );
    assert.equal(configRead.status, 0, configRead.stderr);
    const debugChild = spawnSync(
      command.executable,
      [
        ...childPrefix,
        'debug',
        'prompt-input',
        'Render the exact inherited policy without a model.',
      ],
      {
        cwd: owned,
        env: { PATH: process.env.PATH, HOME: home, CODEX_HOME: config },
        encoding: 'utf8',
        timeout: 20000,
      },
    );
    assert.equal(debugChild.status, 0, debugChild.stderr);
    assert.ok(debugChild.stdout.includes('workspace-write'));
    assert.equal(
      readFileSync(resolve(config, 'config.toml'), 'utf8'),
      canonicalConfig,
      'owned-worktree config/read/debug must not grow extra trust entries',
    );
    const preparedSettings = recordingSettings(command, settingsInput);
    writeFileSync(
      resolve(config, 'config.toml'),
      canonicalConfig + '\n[projects."/unrelated"]\ntrust_level = "trusted"\n',
    );
    assert.throws(
      () => initializeNativeSettings({ command, policy, journalRoot: host }),
      /exact fixture trust only/,
    );
    assert.notDeepEqual(recordingSettings(command, settingsInput), preparedSettings);
    writeFileSync(resolve(config, 'config.toml'), canonicalConfig);
    assert.deepEqual(recordingSettings(command, settingsInput), preparedSettings);
    assert.equal(
      preparedSettings.stubFixtureDigest,
      digest(readFileSync(resolve(root, 'fixture.json'), 'utf8')),
    );
    assert.ok(!JSON.stringify(preparedSettings.arguments).includes(root));
    const actualStub = spawnSync(
      '/opt/homebrew/bin/codex',
      nativeSandboxArgs(
        policy,
        [process.execPath, resolve(skill, 'scripts/remote-tracker.mjs'), 'host-guard-probe'],
        args,
      ),
      {
        cwd: fixture,
        env: {
          PATH: process.env.PATH,
          HOME: home,
          CODEX_HOME: config,
          EVAL_TRACKER_LOG: policy.ledger,
          EVAL_TRACKER_FIXTURE: policy.fixtureFile,
        },
        input: JSON.stringify({ cwd: fixture }),
        encoding: 'utf8',
      },
    );
    assert.equal(actualStub.status, 1, actualStub.stderr);
    assert.equal(existsSync(policy.ledger), true);
    assert.equal(existsSync(policy.lock), false, 'actual stub must remove its directory lock');
    const mirror = mirrorTrackerLedger(policy, digest(''));
    assert.equal(mirror.addedEntries, 1);
    assert.equal(mirror.sourceDigest, mirror.archiveDigest);
    assert.deepEqual(checkoutBasis(fixture), before);
    assert.equal(
      recordingSettings(command, settingsInput).stubFixtureDigest,
      preparedSettings.stubFixtureDigest,
    );
    const help = spawnSync('/opt/homebrew/bin/codex', [...args.slice(0, -1), '--help'], {
      cwd: fixture,
      env: { PATH: process.env.PATH, HOME: home, CODEX_HOME: config },
      encoding: 'utf8',
    });
    assert.equal(help.status, 0, help.stderr);
    const resumeArgs = nativeExecArgs(
      [
        'exec',
        '--ignore-user-config',
        '--ignore-rules',
        '--json',
        '-m',
        'gpt-6.1-sol',
        '-c',
        'model_reasoning_effort="high"',
        'resume',
        '12345678-1234-1234-1234-123456789abc',
        '-',
      ],
      policy,
      { resume: true },
    );
    const resumeHelp = spawnSync(
      '/opt/homebrew/bin/codex',
      [...resumeArgs.slice(0, -1), '--help'],
      {
        cwd: fixture,
        env: { PATH: process.env.PATH, HOME: home, CODEX_HOME: config },
        encoding: 'utf8',
      },
    );
    assert.equal(resumeHelp.status, 0, resumeHelp.stderr);
  },
);

test('actual literal exec wrapper observes helper calls and rejects dynamic/mixed/ambiguous wrappers', () => {
  const cmd =
    'node /fixture/skill/scripts/remote-tracker.mjs pr-view <<\'JSON\'\n{"cwd":"/fixture/project"}\nJSON';
  const input =
    'text(await tools.exec_command({cmd:' + JSON.stringify(cmd) + ',max_output_tokens:1000}));';
  const tool = {
    id: 'actual-call',
    name: 'exec',
    arguments: input,
    callAt: 100,
    resultLine: 5,
    at: 100,
  };
  assert.equal(observedExecRequest(tool).cmd, cmd);
  const event = observedHelperEvent(
    tool,
    { operation: 'pr-view', ok: true },
    {
      session: 'root',
      sourceDigest: digest('raw'),
      alias: digest,
      agentSession: () => null,
      roots: { tracker: '/fixture/skill/scripts/remote-tracker.mjs' },
    },
  );
  assert.equal(event.family, 'tracker');
  assert.equal(event.cwdDigest, digest('/fixture/project'));
  for (const argumentsValue of [
    input + 'text({ok:true});',
    input.replace(JSON.stringify(cmd), 'command'),
    input.replace('text(await', 'text(await transform('),
    "await tools.exec_command({cmd:'true'}); text({exit_code:71,output:'sandbox_apply'});",
    input.replace('max_output_tokens:1000', 'max_output_tokens:1+999'),
  ])
    assert.equal(observedExecRequest({ ...tool, arguments: argumentsValue }), null);
  assert.equal(
    observedExecResult([
      {
        type: 'input_text',
        text: JSON.stringify({
          exit_code: 0,
          output: JSON.stringify({
            exit_code: 71,
            output: 'sandbox-exec: sandbox_apply: Operation not permitted\n',
          }),
        }),
      },
    ]).exit_code,
    0,
  );
  assert.equal(
    observedExecResult([
      { type: 'input_text', text: JSON.stringify({ exit_code: 0, output: '' }) },
      { type: 'input_text', text: JSON.stringify({ exit_code: 71, output: 'ambiguous' }) },
    ]),
    null,
  );
});

test('initial task is the last actual user before first assistant/tool, never a later reply', () => {
  const user = (text) => ({
    type: 'response_item',
    timestamp: '2026-10-20T10:00:00Z',
    payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
  });
  const assistant = {
    type: 'response_item',
    timestamp: '2026-10-20T10:00:01Z',
    payload: {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'working' }],
    },
  };
  assert.equal(
    parseTranscript(
      transcript('root', [
        user('injected AGENTS.md'),
        user('sealed exact task'),
        assistant,
        user('later reply'),
      ]),
      'codex-cli',
    ).initialUser.text,
    'sealed exact task',
  );
  assert.equal(
    parseTranscript(
      transcript('root', [user('injected AGENTS.md'), assistant, user('sealed exact task')]),
      'codex-cli',
    ).initialUser.text,
    'injected AGENTS.md',
  );
});

test('exit zero stdout containing a fabricated native failure is never a tool capability failure', (t) => {
  const fixture = failureFixture(t);
  assert.throws(
    () =>
      fixture.observe((rows) => {
        rows.find((r) => r.payload?.type === 'custom_tool_call_output').payload.output = [
          {
            type: 'input_text',
            text: JSON.stringify({
              exit_code: 0,
              output: JSON.stringify({
                exit_code: 71,
                output: 'sandbox-exec: sandbox_apply: Operation not permitted\n',
              }),
            }),
          },
        ];
      }),
    /tool sandbox error missing/,
  );
});

test('host tracker mirrors preserve bytes and require unique correlated raw calls', (t) => {
  const root = temporary(t),
    policy = {
      ledger: resolve(root, 'actual.jsonl'),
      archiveLedger: resolve(root, 'protected.jsonl'),
    };
  const row = {
    seq: 1,
    operation: 'pr-view',
    apply: false,
    cwd: '/fixture',
    at: '2026-10-20T10:00:00Z',
  };
  writeFileSync(policy.ledger, JSON.stringify(row) + '\n');
  const mirror = mirrorTrackerLedger(policy, digest(''));
  assert.equal(mirror.addedEntries, 1);
  assert.equal(mirror.sourceDigest, mirror.archiveDigest);
  assert.equal(readFileSync(policy.ledger, 'utf8'), readFileSync(policy.archiveLedger, 'utf8'));
  const call = {
    session: 'root',
    callDigest: digest('call'),
    family: 'tracker',
    operation: 'pr-view',
    apply: false,
    cwdDigest: digest('/fixture'),
  };
  assert.deepEqual(trackerLedgerProblems({ helperEvents: [call] }, policy, ''), []);
  for (const calls of [
    [],
    [call, call],
    [{ ...call, operation: 'pr-merge' }],
    [{ ...call, cwdDigest: digest('/other') }],
  ])
    assert.ok(trackerLedgerProblems({ helperEvents: calls }, policy, '').length);
  writeFileSync(policy.ledger, '');
  assert.throws(() => mirrorTrackerLedger(policy, mirror.archiveDigest), /lost\/changed/);
});

test('ordinary actual Codex exec-wrapper capture binds helper and validation to matching chronological native output', (t) => {
  const root = temporary(t),
    skill = resolve(root, 'skill');
  mkdirSync(resolve(skill, 'scripts'), { recursive: true });
  writeFileSync(resolve(skill, 'SKILL.md'), 'Canonical router bytes');
  const command =
    'node ' + skill + '/scripts/remote-tracker.mjs pr-view <<\'JSON\'\n{"cwd":"/fixture"}\nJSON';
  const call = (id, cmd) => ({
    type: 'response_item',
    timestamp: '2026-10-20T10:00:01Z',
    payload: {
      type: 'custom_tool_call',
      name: 'exec',
      call_id: id,
      input: 'text(await tools.exec_command({cmd:' + JSON.stringify(cmd) + '}));',
    },
  });
  const output = (id, text) => ({
    type: 'response_item',
    timestamp: '2026-10-20T10:00:02Z',
    payload: {
      type: 'custom_tool_call_output',
      call_id: id,
      output: [{ type: 'input_text', text: JSON.stringify({ exit_code: 0, output: text }) }],
    },
  });
  const rows = [
    call('read-router', 'cat ' + skill + '/SKILL.md'),
    output('read-router', 'Canonical router bytes'),
    call('tracker', command),
    output('tracker', JSON.stringify({ ok: true, operation: 'pr-view', data: {} })),
    call('validate', 'node --test'),
    output('validate', 'tests passed'),
  ];
  const observe = (values) => {
    const path = resolve(root, 'root.jsonl');
    writeFileSync(path, transcript('actual-root', values));
    return captureHostEvidence({
      harness: 'codex-cli',
      profile,
      skillRoot: skill,
      sessions: [{ alias: 'root', path, parent: null, target: 'portable' }],
    });
  };
  const actual = observe(rows);
  assert.equal(actual.helperEvents.length, 1);
  assert.equal(actual.helperEvents[0].operation, 'pr-view');
  assert.ok(actual.phaseEvents.some((e) => e.gate === 'validation'));
  const mixed = structuredClone(rows);
  mixed[2].payload.input += 'text({ok:true});';
  assert.equal(observe(mixed).helperEvents.length, 0);
  const wrong = structuredClone(rows);
  wrong[3].payload.call_id = 'unrelated';
  assert.equal(observe(wrong).helperEvents.length, 0);
  const reversed = [rows[0], rows[1], rows[3], rows[2], ...rows.slice(4)];
  assert.equal(observe(reversed).helperEvents.length, 0);
  const dynamic = structuredClone(rows);
  dynamic[4].payload.input = 'text(await tools.exec_command({cmd:command}));';
  assert.equal(observe(dynamic).phaseEvents.length, 0);
});

test(
  'production probeHelper captures actual subprocess start/completion and oversized rejection without a model',
  { skip: process.platform !== 'darwin' },
  async (t) => {
    const root = temporary(t),
      fixture = resolve(root, 'project'),
      skill = resolve(root, 'skill'),
      scripts = resolve(skill, 'scripts');
    mkdirSync(fixture);
    mkdirSync(scripts, { recursive: true });
    const git = (...args) =>
      execFileSync('git', args, { cwd: fixture, encoding: 'utf8', stdio: 'pipe' }).trim();
    git('init', '-q', '-b', 'develop');
    writeFileSync(resolve(fixture, '.gitignore'), '.effective-flow/\n');
    writeFileSync(
      resolve(fixture, 'plan.md'),
      '# Approved Feature plan\n\n**Plan status:** Not implemented\n',
    );
    git('add', '.');
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@invalid',
      'commit',
      '-qm',
      'test: boundary fixture',
    );
    mkdirSync(resolve(fixture, '.effective-flow'));
    writeFileSync(
      resolve(fixture, '.effective-flow/memory.json'),
      JSON.stringify({ runtimeMigration: { directory: { version: 1 } } }),
    );
    const sourceScripts = resolve(import.meta.dirname, '../src/scripts');
    for (const file of readdirSync(sourceScripts).filter((f) => f.endsWith('.mjs')))
      writeFileSync(resolve(scripts, file), readFileSync(resolve(sourceScripts, file)));
    const { executeOperation, contentDigest, REQUIRED_GATES } =
      await import('../src/scripts/build-run-core.mjs');
    const { createProcessRunner } = await import('../src/scripts/process-runner.mjs');
    const call = async (operation, input) =>
      (await executeOperation(operation, input, { runner: createProcessRunner() })).result;
    const created = await call('create', {
      runtimeStateRoot: fixture,
      repositoryIdentity: resolve(fixture, '.git'),
      runId: 'actual-boundary',
      execution: {
        executionRoot: fixture,
        branch: 'develop',
        head: git('rev-parse', 'HEAD'),
        origin: 'current-checkout',
        owner: 'build',
      },
      plan: {
        root: fixture,
        path: 'plan.md',
        digest: contentDigest(readFileSync(resolve(fixture, 'plan.md'))),
      },
      source: {
        instruction: 'Implement the approved Feature plan.',
        restrictions: ['No remote publication.'],
      },
      runMode: 'interactive',
      languages: Object.fromEntries(
        ['source', 'documentation.user', 'documentation.technical', 'workflow', 'forge', 'git'].map(
          (key) => [key, 'en'],
        ),
      ),
      completionCondition: 'All required gates pass.',
      deliveryRestrictions: ['Do not merge.'],
      sourceAssociation: 'approved-feature-plan',
      allowedRoots: [fixture],
    });
    const common = {
      runtimeStateRoot: fixture,
      repositoryIdentity: resolve(fixture, '.git'),
      runId: 'actual-boundary',
      requestDigest: created.requestDigest,
    };
    await call('bind-agent', { ...common, agentHandle: 'actual-fixture-runner' });
    const checkpoint = await call('checkpoint', {
      ...common,
      checkpointId: 'actual-pause',
      agentHandle: 'actual-fixture-runner',
      completed: [],
      pending: REQUIRED_GATES,
      evidence: [],
    });
    const input = {
      ...common,
      checkpoint,
      questionId: 'oversized',
      revision: 1,
      origin: 'design-scope',
      agentHandle: 'actual-fixture-runner',
      question: '€'.repeat(6000),
      options: [],
      responseType: 'free-text',
    };
    const inputFile = resolve(fixture, '.effective-flow/boundary-input.json');
    writeFileSync(inputFile, JSON.stringify(input));
    const coordinator = new HostCoordinator(resolve(root, 'host-journal'), { suite });
    // Synthetic launch state only establishes the unit seam; the request/checkpoint/helper execution
    // and returned rejection below are actual isolated filesystem/subprocess observations.
    coordinator.launches.set('unit-launch', {
      closed: false,
      processes: [{}],
      probes: [],
      input: { fixtureRoot: fixture, skillRoot: skill, aliasSalt: 'unit' },
      receipt: envelope('prepared', {
        targetDigest: digest(JSON.stringify(fileMembership(skill))),
      }),
    });
    const before = Date.now(),
      event = coordinator.probeHelper('unit-launch', {
        variant: 'oversized-question',
        operation: 'question',
        inputFile,
      }),
      after = Date.now();
    assert.equal(event.ok, false);
    assert.equal(event.code, 'TOO_LARGE');
    assert.equal(event.processExitCode, 2);
    assert.equal(event.questionBytes, 18000);
    assert.ok(event.callAt >= before);
    assert.ok(event.at > event.callAt);
    assert.ok(event.at <= after);
    assert.deepEqual(rejectionProblems({ boundaryProbes: [event] }, 'oversized-question'), []);
    assert.equal(coordinator.launches.get('unit-launch').probes[0], event);
    assert.throws(
      () =>
        coordinator.probeHelper('unit-launch', {
          variant: 'oversized-question',
          operation: 'question',
          inputFile,
        }),
      /one actual boundary stimulus/,
    );
  },
);

// These stream fixtures test decoders, never model/workflow success.
import {
  claudeExecArgs,
  claudeEnvironment,
  claudeUserInput,
  bindClaudeAgents,
} from '../evals/build-context/_scaffold/claude-process.mjs';
import { claudeRuntimeIdentity } from '../evals/build-context/_scaffold/claude-runtime.mjs';
import {
  decodeClaudeCapture,
  materializeClaudeStreams,
} from '../evals/build-context/_scaffold/claude-stream.mjs';

test('Claude closed argv cannot replace whole-process permissions, settings, output or native agents', () => {
  const valid = ['--model', 'opus', '--effort', 'high'];
  const compiled = claudeExecArgs(valid);
  assert.equal(compiled[compiled.indexOf('--setting-sources') + 1], '');
  assert.equal(compiled[compiled.indexOf('--permission-mode') + 1], 'dontAsk');
  assert.ok(compiled.indexOf('--no-chrome') > compiled.indexOf('--allowedTools'));
  for (const args of [
    ['--settings', '{}'],
    ['--settings={}'],
    ['--permission-mode', 'bypassPermissions'],
    ['--dangerously-skip-permissions'],
    ['--allowedTools', 'Write'],
    ['--agents', '{}'],
    ['--mcp-config', '{}'],
    ['--output-format', 'json'],
    ['--output-file', '/private/host'],
    ['--model=opus'],
    ['--effort', 'high\npermissions=true'],
    ['--resume', 'bad'],
    ['--fork-session'],
    ['--continue'],
    ['unexpected prompt'],
    ['--max-turns', '0'],
    ['--effort', 'low'],
  ])
    assert.throws(() => claudeExecArgs([...valid, ...args]), /Claude|closed|duplicate/);
  const id = '12345678-1234-1234-1234-123456789abc';
  assert.ok(claudeExecArgs([...valid, '--resume', id], { resume: true }).includes(id));
  assert.throws(() => claudeExecArgs([...valid, '--resume', id]), /fresh\/same-root/);
  assert.throws(() => claudeExecArgs(valid, { resume: true }), /fresh\/same-root/);
});

test('Claude mutable state is bound to exact physical guard roots and official runtime membership', (t) => {
  const root = temporary(t);
  const command = { home: root, claudeHome: root, claudeTmp: root };
  assert.equal(claudeEnvironment(command, { stateRoots: [root, root, root] }).HOME, root);
  assert.throws(
    () => claudeEnvironment(command, { stateRoots: [root, root, '/other'] }),
    /roots changed/,
  );
  mkdirSync(resolve(root, 'node_modules/@anthropic-ai/sandbox-runtime'), { recursive: true });
  writeFileSync(
    resolve(root, 'node_modules/@anthropic-ai/sandbox-runtime/package.json'),
    JSON.stringify({ name: '@anthropic-ai/sandbox-runtime', version: '0.0.81' }),
  );
  assert.throws(() => claudeRuntimeIdentity(root), /membership|runtime|ENOENT/);
  assert.equal(
    JSON.parse(claudeUserInput('exact\nuser task')).message.content[0].text,
    'exact\nuser task',
  );
  assert.throws(() => claudeUserInput(''), /user message/);
});

function streamFixture(root, events, index = 0) {
  const stdout = events.map(JSON.stringify).join('\n') + '\n';
  const capture =
    JSON.stringify({ at: 110 + index * 100, bytes: Buffer.from(stdout).toString('base64') }) + '\n';
  const output = resolve(root, 'stdout-' + index),
    path = resolve(root, 'capture-' + index);
  writeFileSync(output, stdout);
  writeFileSync(path, capture);
  return {
    stdout,
    capture,
    output,
    path,
    process: {
      startedAt: 100 + index * 100,
      finishedAt: 120 + index * 100,
      captureDigest: digest(capture),
      stdoutDigest: digest(stdout),
    },
  };
}
const streamRoot = '12345678-1234-1234-1234-123456789abc';
const streamInit = {
  type: 'system',
  subtype: 'init',
  session_id: streamRoot,
  cwd: '/fixture',
  model: 'claude-opus-4',
  claude_code_version: '2.1.292',
};
const streamUser = (text, extra = {}) => ({
  type: 'user',
  session_id: streamRoot,
  parent_tool_use_id: null,
  message: { role: 'user', content: [{ type: 'text', text }] },
  ...extra,
});
const streamAssistant = (content, extra = {}) => ({
  type: 'assistant',
  session_id: streamRoot,
  parent_tool_use_id: null,
  message: { role: 'assistant', model: 'claude-opus-4', content },
  ...extra,
});

test('Claude host frames require byte identity and actual monotonic receive times, never source timestamps', (t) => {
  const root = temporary(t),
    f = streamFixture(root, [streamInit, streamUser('task')]);
  assert.equal(decodeClaudeCapture(f.capture, f.stdout, f.process)[0].observedAt, 110);
  assert.throws(() => decodeClaudeCapture(f.capture, f.stdout + '\n', f.process), /changed/);
  for (const frame of [
    { at: 99, bytes: Buffer.from(f.stdout).toString('base64') },
    { at: 121, bytes: Buffer.from(f.stdout).toString('base64') },
    { at: 110, bytes: '!!' },
    { at: 110, bytes: '', declared: true },
  ]) {
    const capture = JSON.stringify(frame) + '\n';
    assert.throws(
      () =>
        decodeClaudeCapture(capture, f.stdout, { ...f.process, captureDigest: digest(capture) }),
      /chronology|bytes|foreign/,
    );
  }
  const truncated = f.stdout.slice(0, -1),
    capture = JSON.stringify({ at: 110, bytes: Buffer.from(truncated).toString('base64') }) + '\n';
  assert.throws(
    () =>
      decodeClaudeCapture(capture, truncated, {
        ...f.process,
        captureDigest: digest(capture),
        stdoutDigest: digest(truncated),
      }),
    /truncated/,
  );
});

test('Claude stream root task is the last initial user before actual assistant action and cannot rebind later', (t) => {
  const root = temporary(t);
  const materialize = (events, prompt = 'sealed task') => {
    const f = streamFixture(root, events);
    return materializeClaudeStreams({
      processes: [f.process],
      capturePaths: [f.path],
      outputPaths: [f.output],
      destination: root,
      target: 'portable',
      prompts: [prompt],
    });
  };
  assert.equal(
    materialize([
      streamInit,
      streamUser('prior instruction'),
      streamUser('sealed task'),
      streamAssistant([]),
    ]).rootId,
    streamRoot,
  );
  assert.throws(
    () =>
      materialize([
        streamInit,
        streamUser('sealed task'),
        streamUser('different final task'),
        streamAssistant([]),
      ]),
    /sealed stdin/,
  );
  assert.throws(
    () =>
      materialize([
        streamInit,
        streamUser('wrong'),
        streamAssistant([]),
        streamUser('sealed task'),
      ]),
    /sealed stdin/,
  );
  assert.throws(() => materialize([streamInit, streamInit, streamUser('sealed task')]), /init/);
  assert.throws(
    () =>
      materialize([
        streamInit,
        streamUser('sealed task'),
        streamAssistant([], { session_id: 'foreign' }),
      ]),
    /foreign root/,
  );
});

test('Claude forwarded children require unique actual Agent spawn edges and same root across resumes', (t) => {
  const root = temporary(t),
    call = {
      type: 'tool_use',
      id: 'actual-edge',
      name: 'Agent',
      input: { prompt: 'fresh assignment', subagent_type: 'general-purpose' },
    };
  const events = [
    streamInit,
    streamUser('sealed task'),
    streamAssistant([call]),
    streamUser('fresh assignment', { parent_tool_use_id: 'actual-edge' }),
    streamAssistant([], { parent_tool_use_id: 'actual-edge' }),
  ];
  const f = streamFixture(root, events);
  const args = {
    processes: [f.process],
    capturePaths: [f.path],
    outputPaths: [f.output],
    destination: root,
    target: 'portable',
    prompts: ['sealed task'],
  };
  const result = materializeClaudeStreams(args);
  assert.equal(result.sessions.length, 2);
  assert.equal(result.sessions[1].spawnCallId, 'actual-edge');
  const child = parseTranscript(readFileSync(result.sessions[1].path, 'utf8'), 'claude-code');
  assert.equal(child.initialUser.text, 'fresh assignment');
  // Root init model and CLI --effort are not observations of actual assistant effort.
  assert.equal(child.efforts.length, 0);
  for (const altered of [
    [...events, streamAssistant([call])],
    events.filter((e) => e !== events[2]),
  ]) {
    const bad = streamFixture(root, altered, 2);
    assert.throws(
      () =>
        materializeClaudeStreams({
          ...args,
          processes: [bad.process],
          capturePaths: [bad.path],
          outputPaths: [bad.output],
        }),
      /spawn edge|parent Agent/,
    );
  }
  const next = streamFixture(
    root,
    [{ ...streamInit, session_id: 'new-root' }, streamUser('reply', { session_id: 'new-root' })],
    1,
  );
  assert.throws(
    () =>
      materializeClaudeStreams({
        ...args,
        processes: [f.process, next.process],
        capturePaths: [f.path, next.path],
        outputPaths: [f.output, next.output],
        prompts: ['sealed task', 'reply'],
      }),
    /resume changed/,
  );
});

test('Claude trusted collector captures actual child stdout and sealed stdin without a model', (t) => {
  const root = temporary(t),
    base = resolve(root, 'capture');
  const worker = resolve(
    import.meta.dirname,
    '../evals/build-context/_scaffold/claude-stream-worker.mjs',
  );
  const run = spawnSync(process.execPath, [worker], {
    input: JSON.stringify({
      executable: process.execPath,
      args: [
        '-e',
        "process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(JSON.stringify({type:'system',subtype:'init'})+'\\n'))",
      ],
      cwd: root,
      environment: { PATH: process.env.PATH },
      input: claudeUserInput('task'),
      base,
      timeoutMs: 2000,
    }),
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(run.status, 0, run.stderr);
  const actual = JSON.parse(run.stdout);
  assert.equal(actual.exitCode, 0);
  assert.equal(actual.inputDigest, digest(claudeUserInput('task')));
  assert.deepEqual(JSON.parse(readFileSync(base + '.outcome.json')), actual);
  assert.equal(actual.collectorDigest, digest(readFileSync(worker)));
  assert.equal(
    decodeClaudeCapture(
      readFileSync(base + '.capture.jsonl', 'utf8'),
      readFileSync(base + '.stdout.jsonl', 'utf8'),
      actual,
    ).length,
    1,
  );
});

test('Claude native registration preserves exact generated models/efforts and rejects extra inventory', (t) => {
  const root = temporary(t),
    skill = resolve(root, 'skill'),
    agents = resolve(root, 'agents'),
    journal = resolve(root, 'journal');
  for (const p of [skill, agents, journal]) mkdirSync(p);
  const name = 'effective-flow-nodejs-implementer-fast';
  writeFileSync(
    resolve(skill, 'native-agent-inventory.json'),
    JSON.stringify(
      {
        schemaVersion: 2,
        harness: 'claude',
        baseWorkers: ['effective-flow-nodejs-implementer'],
        fastWorkers: [name],
        tierWorkers: [],
        standardWorkers: [],
      },
      null,
      2,
    ) + '\n',
  );
  writeFileSync(
    resolve(agents, name + '.md'),
    '---\nname: ' +
      name +
      '\ndescription: "Actual source description"\nmodel: sonnet\neffort: medium\ntools: Read, Edit\ncolor: blue\n---\nactual\ncanonical body\n',
  );
  writeFileSync(
    resolve(agents, 'effective-flow-nodejs-implementer.md'),
    readFileSync(resolve(agents, name + '.md'), 'utf8')
      .replaceAll(name, 'effective-flow-nodejs-implementer')
      .replace('model: sonnet', 'model: opus')
      .replace('effort: medium', 'effort: high'),
  );
  const file = bindClaudeAgents({ skillRoot: skill, target: 'claude', journalRoot: journal });
  const actual = JSON.parse(readFileSync(file, 'utf8'))[name];
  assert.deepEqual(actual, {
    description: 'Actual source description',
    prompt: 'actual\ncanonical body\n',
    model: 'sonnet',
    effort: 'medium',
    tools: ['Read', 'Edit'],
  });
  writeFileSync(resolve(agents, 'effective-flow-unmeasured.md'), 'unmeasured');
  assert.throws(
    () => bindClaudeAgents({ skillRoot: skill, target: 'claude', journalRoot: journal }),
    /membership differs/,
  );
  assert.equal(
    bindClaudeAgents({ skillRoot: skill, target: 'portable', journalRoot: journal }),
    null,
  );
});

test('Codex registration observer uses only model-free config RPCs and rejects a foreign sidecar', (t) => {
  const root = temporary(t),
    script = resolve(root, 'server.mjs'),
    ledger = resolve(root, 'methods.jsonl');
  writeFileSync(
    script,
    `import {createInterface} from 'node:readline';import{appendFileSync}from'node:fs';for await(const line of createInterface({input:process.stdin})){const r=JSON.parse(line);appendFileSync(process.env.LEDGER,JSON.stringify(r)+'\\n');process.stdout.write(JSON.stringify({id:r.id,result:r.method==='initialize'?{}:{config:{agents:{'effective-flow-nodejs-implementer':{description:'canonical',config_file:process.env.SIDECAR}}}}})+'\\n');}`,
  );
  const observer = resolve(
    import.meta.dirname,
    '../evals/build-context/_scaffold/native-registration-probe.mjs',
  );
  const run = (file) =>
    spawnSync(process.execPath, [observer], {
      input: JSON.stringify({
        executable: process.execPath,
        args: [script],
        cwd: root,
        environment: { PATH: process.env.PATH, LEDGER: ledger, SIDECAR: file },
        registrations: [
          {
            name: 'effective-flow-nodejs-implementer',
            description: 'canonical',
            file: '/bound/canonical.toml',
          },
        ],
      }),
      encoding: 'utf8',
      timeout: 5000,
    });
  const good = run('/bound/canonical.toml');
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).count, 1);
  assert.deepEqual(
    readFileSync(ledger, 'utf8')
      .trim()
      .split('\n')
      .map(JSON.parse)
      .map((r) => r.method),
    ['initialize', 'config/read'],
  );
  const bad = run('/different/unbound.toml');
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /registration differs/);
});

async function phaseSevenControlFixture(fixture, skill) {
  // Synthetic gate judgments are unit inputs, never behavioural quality evidence.
  const { executeOperation, contentDigest, REQUIRED_GATES } =
    await import('../src/scripts/build-run-core.mjs');
  const { createProcessRunner } = await import('../src/scripts/process-runner.mjs');
  const call = async (operation, input) =>
    (await executeOperation(operation, input, { runner: createProcessRunner() })).result;
  const runtime = resolve(fixture, '.effective-flow');
  mkdirSync(runtime, { recursive: true });
  writeFileSync(
    resolve(runtime, 'memory.json'),
    JSON.stringify({ runtimeMigration: { directory: { version: 1 } } }),
  );
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: fixture,
    encoding: 'utf8',
  }).trim();
  const instruction = 'Implement the approved Feature plan in place without a delivery branch.';
  const created = await call('create', {
    runtimeStateRoot: fixture,
    repositoryIdentity: resolve(fixture, '.git'),
    runId: 'phase-seven-control',
    execution: {
      executionRoot: fixture,
      branch: 'develop',
      head,
      origin: 'current-checkout',
      owner: 'build',
    },
    plan: {
      root: fixture,
      path: 'docs/plan/feature.md',
      digest: contentDigest(readFileSync(resolve(fixture, 'docs/plan/feature.md'))),
    },
    source: { instruction, restrictions: ['No publication.'] },
    runMode: 'interactive',
    languages: Object.fromEntries(
      ['source', 'documentation.user', 'documentation.technical', 'workflow', 'forge', 'git'].map(
        (k) => [k, 'en'],
      ),
    ),
    completionCondition: 'Control fixture only.',
    deliveryRestrictions: ['No publication.'],
    sourceAssociation: 'approved-feature-plan',
    allowedRoots: [fixture],
  });
  const common = {
      runtimeStateRoot: fixture,
      repositoryIdentity: resolve(fixture, '.git'),
      runId: 'phase-seven-control',
      requestDigest: created.requestDigest,
    },
    agentHandle = '/root/original-fixture-runner';
  await call('bind-agent', { ...common, agentHandle });
  const authorization = await call('authorize-execution', {
    ...common,
    agentHandle,
    mode: 'in-place-no-delivery',
    executionRoot: fixture,
    branch: 'develop',
    baseHead: head,
    authority: { kind: 'source', source: 'instruction', index: null, quote: instruction },
  });
  await call('transition-execution', {
    ...common,
    agentHandle,
    authorization,
    execution: {
      executionRoot: fixture,
      branch: 'develop',
      head,
      origin: 'in-place',
      owner: 'build',
    },
    ownership: null,
  });
  const evidencePath = '.effective-flow/build-runs/phase-seven-control/unit-gate-input.txt';
  writeFileSync(
    resolve(fixture, evidencePath),
    'Unit control inputs; no model/workflow-quality claim.',
  );
  const evidence = [
    {
      root: fixture,
      path: evidencePath,
      digest: contentDigest(readFileSync(resolve(fixture, evidencePath))),
    },
  ];
  const completed = REQUIRED_GATES.filter(
      (g) =>
        !['delivery', 'plan-archival', 'pilot-finalization', 'cleanup', 'completion'].includes(g),
    ),
    gates = [];
  for (const gate of completed)
    gates.push(
      await call('receipt', {
        ...common,
        gate,
        outcome: 'passed',
        reason: 'Synthetic control input only.',
        evidence,
        agentHandle,
      }),
    );
  const checkpoint = await call('checkpoint', {
    ...common,
    checkpointId: 'phase-seven-delivery-choice',
    agentHandle,
    completed,
    pending: REQUIRED_GATES.filter((g) => !completed.includes(g)),
    evidence: gates,
  });
  const data = {
    common,
    agentHandle,
    helper: resolve(skill, 'scripts/build-run.mjs'),
    questionInput: {
      ...common,
      checkpoint,
      questionId: 'phase-seven-delivery-choice',
      revision: 1,
      origin: 'delivery-choice',
      agentHandle,
      question: 'Retain the fixture locally?',
      options: ['Retain locally', 'Publish'],
      responseType: 'option',
    },
  };
  const file = resolve(runtime, 'unit-phase-seven.json');
  writeFileSync(file, JSON.stringify(data));
  return file;
}

test(
  'production coordinator initializes native trust before capture and preserves raw outcomes before postcheck failure',
  { skip: process.platform !== 'darwin' || !existsSync('/opt/homebrew/bin/codex') },
  async (t) => {
    const root = temporary(t),
      host = resolve(root, 'journal');
    // Successful helper subprocesses need a bounded budget for full-suite contention.
    // Keep the true hang deadline separate and emit its diagnostic before that deadline.
    const startupDelayMs = 750,
      successfulProcessBudgetMs = 30000,
      hangingProcessBudgetMs = 5000;
    const coordinator = new HostCoordinator(host, { suite });
    const build = coordinator.build({
      condition: 'candidate',
      sourceRoot: resolve(import.meta.dirname, '..'),
      outputRoot: resolve(root, 'built'),
    });
    const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
    for (const mode of ['unchanged', 'settings-drift', 'invalid-bytes', 'timeout']) {
      const base = resolve(root, mode),
        fixture = resolve(base, 'project'),
        skill = resolve(base, 'skill'),
        home = resolve(base, 'home'),
        config = resolve(base, 'config'),
        wrapper = resolve(base, 'bin/codex');
      for (const d of [
        fixture,
        home,
        config,
        resolve(base, 'bin'),
        resolve(fixture, 'docs/plan'),
        resolve(fixture, 'test'),
      ])
        mkdirSync(d, { recursive: true });
      cpSync(resolve(root, 'built/dist/portable/effective-flow'), skill, { recursive: true });
      writeFileSync(
        resolve(skill, 'scripts/remote-tracker.mjs'),
        readFileSync(resolve(suite.root, '../_scaffold/remote-tracker.mjs')),
      );
      writeFileSync(resolve(base, 'fixture.json'), JSON.stringify({ operations: {} }));
      writeFileSync(resolve(fixture, '.build-context-fixture'), SCHEMA + '\n');
      writeFileSync(resolve(fixture, '.gitignore'), '.effective-flow/\n');
      writeFileSync(resolve(fixture, 'docs/plan/feature.md'), '# Approved plan\n');
      writeFileSync(
        resolve(fixture, 'test/acceptance.test.mjs'),
        'actual fixture acceptance criteria\n',
      );
      git(fixture, 'init', '-q', '-b', 'develop');
      git(fixture, 'add', '.');
      git(
        fixture,
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@invalid',
        'commit',
        '-qm',
        'test: fixture',
      );
      const origin = resolve(base, 'origin.git');
      git(base, 'init', '--bare', '-q', origin);
      git(fixture, 'remote', 'add', 'origin', origin);
      git(fixture, 'push', '-q', 'origin', 'develop');
      // Only the exec branch is a local diagnostic program; every guard/config operation
      // delegates to the actual installed CLI. No model or behavioural success is emitted.
      writeFileSync(
        wrapper,
        '#!' +
          process.execPath +
          '\n' +
          `import {spawnSync} from 'node:child_process';
import {readFileSync,appendFileSync,writeFileSync} from 'node:fs';
const args=process.argv.slice(2);
if(!args.includes('exec')) { const r=spawnSync('/opt/homebrew/bin/codex',args,{stdio:'inherit'}); process.exit(r.status??1); }
${mode === 'timeout' ? `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,${startupDelayMs});` : ''}
const input=readFileSync(0), rootId='12345678-1234-1234-1234-123456789abc', runnerId='22345678-1234-1234-1234-123456789abc';
const resumed=args.includes('resume'), rootFile=process.env.CODEX_HOME+'/sessions/rollout-unit-root.jsonl', childFile=process.env.CODEX_HOME+'/sessions/rollout-unit-child.jsonl';
const row=payload=>JSON.stringify({timestamp:new Date().toISOString(),...payload})+'\\n';
const user=text=>row({type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text}]}});
if(!resumed) writeFileSync(rootFile,row({type:'session_meta',payload:{id:rootId}})+user(input.toString('utf8')));
else appendFileSync(rootFile,user(input.toString('utf8')));
${
  mode === 'unchanged'
    ? `
const path=${JSON.stringify(resolve(fixture, '.effective-flow/unit-phase-seven.json'))};
const data=JSON.parse(readFileSync(path));
const invoke=(operation,payload,file)=>{
 const callAt=new Date().toISOString(), text=JSON.stringify(payload), r=spawnSync(process.execPath,[data.helper,operation],{input:text,cwd:${JSON.stringify(fixture)},encoding:'utf8'});
 if(r.status!==0) throw Error(r.stderr); const result=JSON.parse(r.stdout);
 const id=operation+'-actual-call'; appendFileSync(file,JSON.stringify({timestamp:callAt,type:'response_item',payload:{type:'function_call',call_id:id,name:'exec_command',arguments:JSON.stringify({cmd:'node '+data.helper+' '+operation+" <<'JSON'\\n"+text+'\\nJSON'})}})+'\\n'+row({type:'response_item',payload:{type:'function_call_output',call_id:id,output:JSON.stringify({exit_code:r.status,output:r.stdout})}}));
 return result.result;
};
if(!resumed){
 writeFileSync(childFile,row({type:'session_meta',payload:{id:runnerId,parent_thread_id:rootId,agent_path:data.agentHandle}})+user('Unit fixture: reach Phase 7 delivery-choice control boundary.'));
 data.question=invoke('question',data.questionInput,childFile); writeFileSync(path,JSON.stringify(data));
}else{
 const reply=invoke('reply',{...data.common,question:data.question,trustedUser:{channel:'current-user',messageId:'fixed-fixture-answer',questionDigest:data.question.digest,answer:input.toString('utf8')}},rootFile);
 appendFileSync(rootFile,row({type:'response_item',payload:{type:'function_call',call_id:'same-runner-followup',name:'followup_task',arguments:JSON.stringify({target:data.agentHandle,message:'Resume the same runner with the actual reply reference.'})}})+row({type:'response_item',payload:{type:'function_call_output',call_id:'same-runner-followup',output:JSON.stringify({task_name:data.agentHandle})}}));
 data.resumed=invoke('resume',{...data.common,question:data.question,reply,agentHandle:data.agentHandle},childFile); writeFileSync(path,JSON.stringify(data));
}
`
    : ''
}
appendFileSync(rootFile,row({type:'response_item',payload:{type:'message',role:'assistant',content:[{type:'output_text',text:'Diagnostic control only; no model or workflow-quality claim.'}]}}));
process.stdout.write(JSON.stringify({type:'thread.started',thread_id:rootId})+'\\n');
${mode === 'settings-drift' ? "appendFileSync(process.env.CODEX_HOME+'/config.toml','# unexpected change\\n');" : ''}
process.stdout.write(${mode === 'invalid-bytes' ? 'Buffer.from([0x7b,0xff,0x7d,0x0a])' : "JSON.stringify({type:'model-free-diagnostic',arguments:args,input:input.toString('utf8')})+'\\n'"});
process.stderr.write(Buffer.from('stderr\\n'));
${mode === 'timeout' ? 'setInterval(()=>{},1000);' : ''}`,
      );
      chmodSync(wrapper, 0o755);
      const callerArgs = [
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
        fixture,
        '-',
      ];
      const commandFile = resolve(base, 'command.json'),
        promptFile = resolve(base, 'prompt.txt'),
        prompt = 'Exact initial user task.\nSecond line.\n';
      writeFileSync(promptFile, prompt);
      writeFileSync(
        commandFile,
        JSON.stringify({
          executable: wrapper,
          args: callerArgs,
          home,
          codexHome: config,
          profile,
          timeoutMs: mode === 'timeout' ? hangingProcessBudgetMs : successfulProcessBudgetMs,
        }),
      );
      if (mode === 'unchanged') await phaseSevenControlFixture(fixture, skill);
      const prepared = coordinator.prepare({
        condition: 'candidate',
        harness: 'codex-cli',
        complexity: 'simple',
        slot: 1,
        target: 'portable',
        buildSeal: build.seal,
        fixtureRoot: fixture,
        skillRoot: skill,
        transcriptDir: resolve(config, 'sessions'),
        promptFile,
        commandFile,
      });
      const state = coordinator.launches.get(prepared.launch),
        settings = prepared.receipt.payload.settings;
      assert.notDeepEqual(
        state.command.args,
        callerArgs,
        'native argument compiler must actually reorder this caller shape',
      );
      assert.deepEqual(recordingSettings(state.command, state.input), settings);
      assert.equal(prepared.receipt.payload.promptDigest, digest(prompt));
      assert.equal(existsSync(resolve(config, 'config.toml')), true);
      if (mode === 'unchanged') {
        const actual = coordinator.launch(prepared.launch);
        assert.equal(actual.exitCode, 0);
        assert.equal(actual.settingsObservationDigest, prepared.receipt.payload.settingsDigest);
        const originalSnapshot = structuredClone(state.nativeTranscriptSnapshot),
          rootId = originalSnapshot.rootId;
        const sealedState = JSON.stringify(state),
          sealedJournal = fileMembership(host);
        for (const invalid of [
          undefined,
          null,
          {},
          [],
          1,
          false,
          '',
          '  ',
          Buffer.from('answer'),
          new String('answer'),
        ]) {
          assert.throws(
            () =>
              coordinator.launch(prepared.launch, {
                resume: true,
                args: [...callerArgs.slice(0, -1), 'resume', rootId, '-'],
                prompt: invalid,
              }),
            /nonempty string current-turn input/,
          );
          assert.equal(JSON.stringify(state), sealedState);
          assert.deepEqual(
            fileMembership(host),
            sealedJournal,
            'invalid input must run no guard or subprocess and change no journal state',
          );
        }
        const wrongArgs = [
          ...callerArgs.slice(0, -1),
          'resume',
          '32345678-1234-1234-1234-123456789abc',
          '-',
        ];
        assert.throws(
          () =>
            coordinator.launch(prepared.launch, {
              resume: true,
              args: wrongArgs,
              prompt: 'Retain locally',
            }),
          /exact observed root/,
        );
        assert.equal(
          state.observedProcesses.length,
          1,
          'foreign-root resume must not launch a process',
        );
        const resumed = coordinator.launch(prepared.launch, {
          resume: true,
          args: [...callerArgs.slice(0, -1), 'resume', rootId, '-'],
          prompt: 'Retain locally',
        });
        assert.equal(state.processes.length, 2);
        assert.equal(resumed.rootIdentity, actual.rootIdentity);
        assert.equal(resumed.inputDigest, digest('Retain locally'));
        assert.ok(resumed.startedAt >= actual.finishedAt);
        const control = JSON.parse(
          readFileSync(resolve(fixture, '.effective-flow/unit-phase-seven.json')),
        );
        assert.ok(
          control.resumed.resume.digest,
          'actual helper reply and original-runner resume must succeed',
        );
        assert.equal(control.resumed.agentHandle, control.agentHandle);
        assert.equal(control.resumed.answer, 'Retain locally');
        assert.equal(control.resumed.completed.length, 6);
        assert.equal(control.resumed.pending.length, 5);
        assert.equal(
          Object.keys(state.nativeTranscriptSnapshot.files).length,
          2,
          'the same two unit sessions remain two across both process segments',
        );
        for (const [name, prefix] of Object.entries(originalSnapshot.files)) {
          const old = readFileSync(prefix.path),
            full = readFileSync(resolve(config, 'sessions', name));
          assert.deepEqual(full.subarray(0, old.length), old);
        }
        const rootText = readFileSync(resolve(config, 'sessions/rollout-unit-root.jsonl'), 'utf8');
        const rootParsed = parseTranscript(rootText, 'codex-cli');
        const replyCall = rootParsed.tools.find(
          (t) => helperInvocation(t.arguments)?.operation === 'reply',
        );
        assert.equal(
          helperInvocation(replyCall.arguments).input.trustedUser.answer,
          'Retain locally',
        );
        assert.equal(
          rootParsed.calls.filter((c) => c.name === 'followup_task')[0].arguments.target,
          control.agentHandle,
        );
        const child = parseTranscript(
          readFileSync(resolve(config, 'sessions/rollout-unit-child.jsonl'), 'utf8'),
          'codex-cli',
        );
        assert.equal(child.meta.agent_path, control.agentHandle);
        assert.equal(
          child.tools.filter((t) => helperInvocation(t.arguments)?.operation === 'resume').length,
          1,
        );
        const protectedPrefix = state.nativeTranscriptSnapshot.files['rollout-unit-child.jsonl'];
        const childPath = resolve(config, 'sessions/rollout-unit-child.jsonl');
        writeFileSync(
          childPath,
          readFileSync(childPath).toString('utf8').replace('Phase 7', 'Phase 8'),
        );
        assert.throws(
          () =>
            coordinator.launch(prepared.launch, {
              resume: true,
              args: [...callerArgs.slice(0, -1), 'resume', rootId, '-'],
              prompt: 'Retain locally',
            }),
          /prefix was rewritten/,
        );
        assert.equal(
          state.observedProcesses.length,
          2,
          'prefix rewrite must reject before another subprocess',
        );
        writeFileSync(childPath, readFileSync(protectedPrefix.path));
      } else {
        assert.throws(
          () => coordinator.launch(prepared.launch),
          mode === 'settings-drift'
            ? /settings\/inventory changed/
            : mode === 'timeout'
              ? /capture incomplete/
              : /invalid UTF-8/,
        );
        assert.equal(
          state.processes.length,
          0,
          'invalid diagnostic must create zero accepted process records',
        );
        assert.equal(state.closed, true);
        assert.throws(() => coordinator.complete(prepared.launch, {}), /actual coordinator launch/);
      }
      const observedBase = resolve(host, prepared.launch + '-observed-1');
      const observedReceipt = JSON.parse(readFileSync(observedBase + '-outcome.json'));
      const observed = observedReceipt.payload,
        raw = readFileSync(observedBase + '.stdout'),
        stderr = readFileSync(observedBase + '.stderr');
      assert.equal(observed.exitCode, mode === 'timeout' ? null : 0);
      assert.equal(observed.captureComplete, mode !== 'timeout');
      if (mode === 'timeout') assert.equal(observed.launchError, 'ETIMEDOUT');
      assert.ok(raw.length > 0, 'the diagnostic must start before the process deadline');
      assert.equal(observed.stdoutDigest, digest(raw));
      assert.equal(observed.stderrDigest, digest(stderr));
      assert.equal(observed.capturedStdoutBytes, raw.length);
      assert.equal(observed.stdinDigest, digest(prompt));
      assert.equal(observed.argumentsDigest, digest(JSON.stringify(state.command.args)));
      assert.ok(
        observed.finishedAt >= observed.startedAt &&
          observed.startedAt >= prepared.receipt.payload.preparedAt,
      );
      assert.deepEqual(
        JSON.parse(readFileSync(observedBase + '-command.json')).arguments,
        state.command.args,
      );
      if (mode === 'invalid-bytes')
        assert.deepEqual(raw.subarray(raw.indexOf(10) + 1), Buffer.from([0x7b, 0xff, 0x7d, 0x0a]));
      else {
        const emitted = JSON.parse(raw.toString('utf8').trim().split('\n').at(-1));
        assert.deepEqual(emitted.arguments, state.command.args);
        assert.equal(emitted.input, prompt);
      }
      assert.deepEqual(stderr, Buffer.from('stderr\n'));
      if (mode !== 'unchanged') {
        const failedPath = resolve(host, prepared.launch + '-failed.json'),
          failed = JSON.parse(readFileSync(failedPath));
        assert.equal(failed.payload.metrics, null);
        assert.equal(failed.payload.failure.processOutcome.seal, observedReceipt.seal);
        const output = resolve(base, 'invalid-attempt.json');
        sealAuxiliaryRecord(
          { schema: SCHEMA, kind: 'attempt', completion: failedPath },
          output,
          suite,
        );
        assert.equal(JSON.parse(readFileSync(output)).record.metrics, null);
        const forged = structuredClone(failed);
        forged.payload.failure.processOutcome.payload.stdoutDigest = digest('forged');
        forged.seal = envelope('failed-launch', forged.payload).seal;
        writeFileSync(resolve(base, 'forged.json'), JSON.stringify(forged));
        assert.throws(
          () =>
            sealAuxiliaryRecord(
              { schema: SCHEMA, kind: 'attempt', completion: resolve(base, 'forged.json') },
              resolve(base, 'bad-attempt.json'),
              suite,
            ),
          /process-outcome/,
        );
      }
    }
  },
);

import {
  captureNativeTurn,
  verifyNativeTranscriptPrefix,
} from '../evals/build-context/_scaffold/native-transcripts.mjs';
test('native protected turn prefixes permit same-session appends but reject source rewrites and copied-proof corruption', (t) => {
  const base = temporary(t),
    root = resolve(base, 'sessions'),
    journal = resolve(base, 'journal');
  mkdirSync(root);
  mkdirSync(journal);
  const id = '12345678-1234-1234-1234-123456789abc',
    file = resolve(root, 'rollout-root.jsonl');
  const row = (payload) => JSON.stringify({ timestamp: '2026-10-20T10:00:00Z', ...payload }) + '\n';
  const user = (text) =>
    row({
      type: 'response_item',
      payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
    });
  const action = row({
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'Unit codec fixture only.' }],
    },
  });
  const first = row({ type: 'session_meta', payload: { id } }) + user('original task') + action;
  writeFileSync(file, first);
  const args = {
    root,
    journalRoot: journal,
    launch: 'unit',
    stdout: Buffer.from(JSON.stringify({ type: 'thread.started', thread_id: id }) + '\n'),
  };
  const one = captureNativeTurn({ ...args, turn: 1, prompt: 'original task' });
  writeFileSync(file, first + user('fixed answer') + action);
  const two = captureNativeTurn({ ...args, turn: 2, prompt: 'fixed answer', prior: one.snapshot });
  assert.equal(two.rootIdentity, one.rootIdentity);
  assert.equal(two.inputDigest, digest('fixed answer'));
  assert.equal(readFileSync(one.snapshot.files['rollout-root.jsonl'].path, 'utf8'), first);
  assert.equal(Object.keys(two.snapshot.files).length, 1);
  const good = readFileSync(file);
  writeFileSync(file, good.toString('utf8').replace('original task', 'rewritten task'));
  assert.throws(
    () => verifyNativeTranscriptPrefix(root, two.snapshot, { append: true }),
    /prefix was rewritten/,
  );
  writeFileSync(file, good);
  writeFileSync(two.snapshot.files['rollout-root.jsonl'].path, 'replaced protected prefix');
  assert.throws(
    () => verifyNativeTranscriptPrefix(root, two.snapshot),
    /protected native transcript prefix changed/,
  );
  assert.throws(
    () =>
      captureNativeTurn({
        ...args,
        turn: 3,
        prompt: 'fixed answer',
        prior: one.snapshot,
        stdout: Buffer.from(
          JSON.stringify({
            type: 'thread.started',
            thread_id: '22345678-1234-1234-1234-123456789abc',
          }) + '\n',
        ),
      }),
    /changed the observed root/,
  );
});

test('both harnesses reject unsealed initial/resume input before filesystem, guard, subprocess or state mutation', (t) => {
  const root = temporary(t);
  for (const harness of ['codex-cli', 'claude-code']) {
    const coordinator = new HostCoordinator(resolve(root, harness), { suite });
    const state = {
      closed: false,
      processes: [{}],
      prompt: 'initial',
      nativePolicy: { kind: harness === 'codex-cli' ? 'codex-native' : 'claude-process' },
      input: { fixtureRoot: '/deliberately-missing-fixture' },
    };
    coordinator.launches.set('unit', state);
    const before = JSON.stringify(state),
      files = fileMembership(coordinator.root);
    for (const prompt of [
      undefined,
      null,
      {},
      [],
      123,
      false,
      '',
      ' \n ',
      Buffer.from('answer'),
      new String('answer'),
    ]) {
      assert.throws(
        () => coordinator.launch('unit', { resume: true, args: ['resume'], prompt }),
        /nonempty string current-turn input/,
      );
      assert.equal(JSON.stringify(state), before);
      assert.deepEqual(fileMembership(coordinator.root), files);
    }
    state.processes = [];
    state.prompt = null;
    const invalidInitial = JSON.stringify(state);
    assert.throws(() => coordinator.launch('unit'), /nonempty string current-turn input/);
    assert.equal(JSON.stringify(state), invalidInitial);
    assert.deepEqual(fileMembership(coordinator.root), files);
  }
});

test('observed immutable const exec alias emits only its literal actual result, without JS execution', () => {
  // Exact wrapper form observed in the retained 0.163 rollout; request literals sanitized.
  const request = {
    cmd: 'node --test test/acceptance.test.mjs',
    workdir: '/fixture',
    max_output_tokens: 10000,
  };
  const actual =
    'const r = await tools.exec_command({cmd:' +
    JSON.stringify(request.cmd) +
    ',workdir:"/fixture",max_output_tokens:10000});text(r);\n';
  assert.deepEqual(observedExecRequest({ name: 'exec', arguments: actual }), request);
  for (const code of [
    actual.replace('text(r)', 'text(other)'),
    actual.replace('text(r)', 'text({...r})'),
    actual.replace('const r', 'let r'),
    actual.replace('text(r)', 'r.output="invented";text(r)'),
    actual + 'text({exit_code:71,output:"sandbox_apply failure"});',
    actual.replace('text(r)', 'text({exit_code:0,output:r.output})'),
    actual.replace('max_output_tokens:10000', 'max_output_tokens:limit'),
    actual.replace('const r', 'const text').replace('text(r)', 'text(text)'),
    actual.replace('const r', 'const tools').replace('text(r)', 'text(tools)'),
    actual.replace('const r', 'const for').replace('text(r)', 'text(for)'),
    actual.replace('const r', 'const eval').replace('text(r)', 'text(eval)'),
    actual.replace('text(r)', 'text(JSON.parse(r.output))'),
  ])
    assert.equal(observedExecRequest({ name: 'exec', arguments: code }), null);
  const result = {
    exit_code: 0,
    output: JSON.stringify({ exit_code: 71, output: 'sandbox_apply failure' }),
  };
  assert.equal(
    observedExecResult(JSON.stringify(result)).exit_code,
    0,
    'stdout JSON never becomes the outer native result',
  );
});

// Native evidence must bind all schema-2 role variants without admitting unmeasured sidecars.
import { nativeWorkerNames } from '../evals/build-context/_scaffold/native-workers.mjs';
test('native evidence registers schema-2 base, Fast and tier roles and rejects stale or extra inventories', (t) => {
  const root = temporary(t),
    skill = resolve(root, 'skill'),
    agents = resolve(root, 'agents');
  mkdirSync(skill);
  mkdirSync(agents);
  const inventory = {
    schemaVersion: 2,
    harness: 'codex',
    baseWorkers: ['effective-flow-alpha', 'effective-flow-beta'],
    fastWorkers: ['effective-flow-alpha-fast'],
    tierWorkers: ['effective-flow-beta-tier-deep', 'effective-flow-beta-tier-mechanical'],
    standardWorkers: ['effective-flow-beta'],
  };
  const save = (value) =>
    writeFileSync(
      resolve(skill, 'native-agent-inventory.json'),
      JSON.stringify(value, null, 2) + '\n',
    );
  const names = [...inventory.baseWorkers, ...inventory.fastWorkers, ...inventory.tierWorkers];
  for (const name of names)
    writeFileSync(resolve(agents, name + '.toml'), 'name = ' + JSON.stringify(name) + '\n');
  save(inventory);
  assert.deepEqual(nativeWorkerNames(skill, 'codex'), names);
  assert.throws(() => nativeWorkerNames(skill, 'claude'), /harness differs/);
  save({ ...inventory, schemaVersion: 1 });
  assert.throws(() => nativeWorkerNames(skill, 'codex'), /schemaVersion/);
  save(inventory);
  writeFileSync(resolve(agents, 'effective-flow-extra.toml'), 'unmeasured');
  assert.throws(() => nativeWorkerNames(skill, 'codex'), /membership differs/);
  rmSync(resolve(agents, 'effective-flow-extra.toml'));
  rmSync(resolve(agents, inventory.tierWorkers[0] + '.toml'));
  assert.throws(() => nativeWorkerNames(skill, 'codex'), /membership differs/);
});

// Every runtime import of the canonical native inventory parser must invalidate the instrument.
import { instrumentIdentity } from '../evals/_scaffold/build-identity.mjs';
test('native inventory admission dependencies participate in the sealed instrument identity', (t) => {
  const dependencies = [
    'build-lib.mjs',
    'src/scripts/pilot-measurement-protocol.mjs',
    'src/scripts/plan-lint-core.mjs',
  ];
  const fixture = temporary(t);
  const files = dependencies.map((name, index) => {
    const source = resolve(import.meta.dirname, '..', name);
    assert.ok(suite.instrumentFiles.includes(source), name + ' is pinned');
    const copy = resolve(fixture, index + '.mjs');
    writeFileSync(copy, readFileSync(source));
    return copy;
  });
  const bound = { ...suite, instrumentFiles: files };
  const before = instrumentIdentity(bound);
  for (const file of files) {
    const original = readFileSync(file);
    writeFileSync(
      file,
      Buffer.concat([original, Buffer.from('\n// changed admission dependency\n')]),
    );
    assert.notDeepEqual(instrumentIdentity(bound), before);
    writeFileSync(file, original);
  }
});
