// Adversarial unit fixtures are intentionally synthetic; none are behavioural recordings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
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
} from '../evals/build-context/_scaffold/host-coordinator.mjs';
import {
  envelope,
  completionProblems,
  BASELINE_COMMIT,
} from '../evals/build-context/_scaffold/host-receipt.mjs';
import {
  helperInvocation,
  rejectionProblems,
} from '../evals/build-context/_scaffold/helper-observation.mjs';
import {
  captureReview,
  nativeProblems,
  summarizeMatrix,
  median,
  nearestRank,
} from '../evals/build-context/_scaffold/evidence.mjs';
import {
  verifyArchivedScenario,
  archiveReuseProblems,
} from '../evals/build-context/_scaffold/archive.mjs';
import { parseState } from '../evals/build-context/_scaffold/capture.mjs';
import { SCHEMA } from '../evals/build-context/_scaffold/protocol.mjs';
import suite from '../evals/build-context/suite.config.mjs';
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
