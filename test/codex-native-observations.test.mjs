// Synthetic unit fixtures of observed native shapes; these are not behavioural recordings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  parseTranscript,
  captureHostEvidence,
  digest,
} from '../evals/build-context/_scaffold/transcript.mjs';
import {
  helperInvocation,
  observedExecRequest,
} from '../evals/build-context/_scaffold/helper-observation.mjs';

const epoch = Date.parse('2026-10-20T10:00:00Z');
const iso = (offset) => new Date(epoch + offset).toISOString();
const profile = {
  harness: 'codex-cli',
  model: 'gpt-6.1-sol',
  reasoningEffort: 'high',
  reportedVersion: '0.163.0',
  toolPolicy: 'isolated unit fixture',
};
const router = 'Canonical unit fixture router';
const worker = 'Canonical unit fixture independent review worker';
const envelope = JSON.stringify({ ok: true, operation: 'pr-view', result: {} });

function transcript(id, extra = [], meta = {}) {
  return (
    [
      {
        type: 'session_meta',
        timestamp: iso(0),
        payload: { id, cli_version: '0.163.0', ...meta },
      },
      {
        type: 'turn_context',
        timestamp: iso(100),
        payload: { model: profile.model, effort: profile.reasoningEffort },
      },
      ...extra,
      {
        type: 'event_msg',
        timestamp: iso(5000),
        payload: {
          type: 'token_count',
          info: {
            last_token_usage: { input_tokens: 5, total_tokens: 8 },
            total_token_usage: { input_tokens: 5, cached_input_tokens: 0 },
          },
        },
      },
      { type: 'event_msg', timestamp: iso(6000), payload: { type: 'task_complete' } },
    ]
      .map(JSON.stringify)
      .join('\n') + '\n'
  );
}

function call(id, name, args, offset = 1000) {
  return {
    type: 'response_item',
    timestamp: iso(offset),
    payload: { type: 'function_call', call_id: id, name, arguments: JSON.stringify(args) },
  };
}

function result(id, output, offset = 4000) {
  return {
    type: 'response_item',
    timestamp: iso(offset),
    payload: { type: 'function_call_output', call_id: id, output: JSON.stringify(output) },
  };
}

function nativeCommand(command, cwd, options = {}) {
  return {
    type: 'event_msg',
    timestamp: iso(3100),
    payload: {
      type: 'item_completed',
      thread_id: 'unit-root',
      turn_id: 'unit-turn',
      item: {
        type: 'CommandExecution',
        id: 'unit-native-command',
        process_id: 'unit-process',
        command: ['/bin/zsh', '-lc', command],
        cwd: pathToFileURL(cwd).href,
        parsed_cmd: [],
        source: 'agent',
        status: 'completed',
        aggregated_output: envelope,
        exit_code: 0,
        duration: { secs: 1, nanos: 0 },
        ...options.item,
      },
      started_at_ms: epoch + 2000,
      completed_at_ms: epoch + 3000,
      ...options.payload,
    },
  };
}

function fixture(t) {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), 'flow-native-unit-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const skill = resolve(root, 'skill');
  mkdirSync(resolve(skill, 'scripts'), { recursive: true });
  mkdirSync(resolve(root, 'agents'));
  writeFileSync(resolve(skill, 'SKILL.md'), router);
  writeFileSync(
    resolve(root, 'agents/effective-flow-nodejs-reviewer.toml'),
    "developer_instructions = '''\n" + worker + "\n'''\n",
  );
  const command =
    'node ' +
    resolve(skill, 'scripts/remote-tracker.mjs') +
    ' pr-view <<\'JSON\'\n{"cwd":"/unit-project"}\nJSON';
  const routerRows = [
    call('unit-router', 'exec_command', { cmd: 'cat ' + resolve(skill, 'SKILL.md') }, 200),
    result('unit-router', { exit_code: 0, output: router }, 300),
  ];
  const observe = (extra = []) => {
    const path = resolve(root, 'root.jsonl');
    writeFileSync(path, transcript('unit-root', [...routerRows, ...extra]));
    return captureHostEvidence({
      harness: 'codex-cli',
      profile,
      skillRoot: skill,
      sessions: [{ alias: 'root', path, parent: null, target: 'codex' }],
    });
  };
  return { root, skill, command, routerRows, observe };
}

function wrapper(command, { dynamic = false, output = envelope } = {}) {
  return [
    {
      type: 'response_item',
      timestamp: iso(1000),
      payload: {
        type: 'custom_tool_call',
        name: 'exec',
        call_id: 'unit-wrapper',
        input: dynamic
          ? 'const request = {cmd:' +
            JSON.stringify(command) +
            '}; text(await tools.exec_command(request));'
          : 'text(await tools.exec_command({cmd:' + JSON.stringify(command) + '}));',
      },
    },
    {
      type: 'response_item',
      timestamp: iso(4000),
      payload: {
        type: 'custom_tool_call_output',
        call_id: 'unit-wrapper',
        output: [{ type: 'input_text', text: JSON.stringify({ exit_code: 0, output }) }],
      },
    },
  ];
}

test('native completed shell command supplies literal helper request and actual timing', (t) => {
  const f = fixture(t);
  const parsed = parseTranscript(
    transcript('unit-root', [nativeCommand(f.command, f.root)]),
    'codex-cli',
  );
  assert.equal(parsed.tools.length, 1);
  const tool = parsed.tools[0];
  assert.equal(helperInvocation(observedExecRequest(tool) ?? tool.arguments)?.operation, 'pr-view');
  assert.equal((observedExecRequest(tool) ?? tool.arguments).workdir, f.root);
  assert.equal(tool.callAt, epoch + 2000);
  assert.equal(tool.at, epoch + 3000);
  const events = f.observe([nativeCommand(f.command, f.root)]).helperEvents;
  assert.equal(events.length, 1);
  assert.equal(events[0].operation, 'pr-view');
  assert.equal(events[0].inputDigest, digest('{"cwd":"/unit-project"}'));
});

test('actual native helper observation survives an unsupported dynamic JavaScript wrapper', (t) => {
  const f = fixture(t);
  const [start, finish] = wrapper(f.command, { dynamic: true });
  const events = f.observe([start, nativeCommand(f.command, f.root), finish]).helperEvents;
  assert.equal(events.length, 1);
  assert.equal(events[0].operation, 'pr-view');
});

test('native and parseable outer wrapper provide one helper observation', (t) => {
  const f = fixture(t);
  const [start, finish] = wrapper(f.command);
  const events = f.observe([start, nativeCommand(f.command, f.root), finish]).helperEvents;
  assert.equal(events.length, 1);
  assert.equal(events[0].callDigest, digest('unit-native-command'));
});

test('helper-shaped stdout without an actual literal helper command provides no proof', (t) => {
  const f = fixture(t);
  assert.equal(f.observe([nativeCommand('printf fake-envelope', f.root)]).helperEvents.length, 0);
  assert.equal(f.observe(wrapper(f.command, { dynamic: true })).helperEvents.length, 0);
  const [start, finish] = wrapper(f.command);
  assert.equal(
    f.observe([start, nativeCommand('printf fake-envelope', f.root), finish]).helperEvents.length,
    0,
  );
});

test('native helper observation requires its own session thread and unique item identity', (t) => {
  const f = fixture(t);
  assert.equal(
    f.observe([
      nativeCommand(f.command, f.root, {
        payload: { thread_id: 'unit-other-thread' },
      }),
    ]).helperEvents.length,
    0,
  );
  const event = nativeCommand(f.command, f.root);
  assert.equal(f.observe([event, structuredClone(event)]).helperEvents.length, 0);
});

test('native helper observation rejects malformed timing and unfinished or malformed results', (t) => {
  const f = fixture(t);
  const malformed = [
    { payload: { started_at_ms: epoch + 4000 } },
    { payload: { started_at_ms: null } },
    { payload: { completed_at_ms: String(epoch + 3000) } },
    { payload: { started_at_ms: -1 } },
    { item: { status: 'in_progress' } },
    { item: { exit_code: null } },
    { item: { exit_code: 0.5 } },
    { item: { aggregated_output: { output: envelope } } },
    { item: { cwd: '/unit-project' } },
    { item: { cwd: 'https://example.invalid/unit-project' } },
  ];
  for (const options of malformed) {
    assert.equal(
      f.observe([nativeCommand(f.command, f.root, options)]).helperEvents.length,
      0,
      JSON.stringify(options),
    );
  }
});

test('native helper observation admits only recognized shell argv and one strict helper command', (t) => {
  const f = fixture(t);
  for (const argv of [
    ['/unit/unknown-shell', '-lc', f.command],
    ['/bin/zsh', '-ic', f.command],
    ['/bin/zsh', '-lc', f.command, 'extra'],
    ['node', '-e', f.command],
    f.command,
    ['/bin/zsh', '-lc', f.command + '\n' + f.command],
  ]) {
    assert.equal(
      f.observe([
        nativeCommand(f.command, f.root, {
          item: { command: argv },
        }),
      ]).helperEvents.length,
      0,
      JSON.stringify(argv),
    );
  }
  assert.equal(
    f.observe([
      nativeCommand(f.command, f.root, {
        item: { command: ['/bin/bash', '-c', f.command] },
      }),
    ]).helperEvents.length,
    1,
  );
});

function encryptedTask({ author = '/root', recipient = '/root/unit-reviewer', offset = 400 } = {}) {
  return {
    type: 'response_item',
    timestamp: iso(offset),
    payload: {
      type: 'agent_message',
      id: 'unit-incoming-task',
      author,
      recipient,
      content: [
        {
          type: 'input_text',
          text: 'Message Type: NEW_TASK\nTask name: /root/unit-reviewer\nSender: /root\nPayload:\n',
        },
        { type: 'encrypted_content', encrypted_content: 'unit-ciphertext-not-decryptable' },
      ],
      internal_chat_message_metadata_passthrough: {
        turn_id: 'unit-child-turn',
        create_time: epoch / 1000,
      },
    },
  };
}
const childMeta = {
  parent_thread_id: 'unit-root',
  agent_path: '/root/unit-reviewer',
  source: { subagent: { thread_spawn: { agent_role: 'effective-flow-nodejs-reviewer' } } },
};

test('bound encrypted first native assignment is explicitly unsupported and later plaintext cannot replace it', () => {
  const later = {
    type: 'response_item',
    timestamp: iso(2000),
    payload: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'Read workers/effective-flow-nodejs-reviewer.md' }],
    },
  };
  const parsed = parseTranscript(
    transcript(
      'unit-child',
      [encryptedTask(), call('unit-work', 'exec_command', { cmd: 'true' }), later],
      childMeta,
    ),
    'codex-cli',
  );
  assert.equal(parsed.assignmentProblem, 'encrypted-original-assignment');
  assert.equal(parsed.initialUser, null);
});

test('native encrypted assignment detection requires typed source, parent association and addressed first incoming task', () => {
  for (const [meta, task] of [
    [{}, encryptedTask()],
    [{ ...childMeta, parent_thread_id: undefined }, encryptedTask()],
    [childMeta, encryptedTask({ recipient: '/root/unrelated' })],
    [childMeta, encryptedTask({ author: '/root/unrelated' })],
  ]) {
    assert.notEqual(
      parseTranscript(transcript('unit-child', [task], meta), 'codex-cli').assignmentProblem,
      'encrypted-original-assignment',
    );
  }
  const plaintextFirst = {
    type: 'response_item',
    timestamp: iso(300),
    payload: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'Original plaintext task' }],
    },
  };
  const parsed = parseTranscript(
    transcript(
      'unit-child',
      [
        plaintextFirst,
        call('unit-work', 'exec_command', { cmd: 'true' }),
        encryptedTask({ offset: 2000 }),
      ],
      childMeta,
    ),
    'codex-cli',
  );
  assert.equal(parsed.initialUser.text, 'Original plaintext task');
  assert.notEqual(parsed.assignmentProblem, 'encrypted-original-assignment');
});

test('capture reports unsupported original assignment despite role profile, labels, instructions and follow-up', (t) => {
  const f = fixture(t);
  const parentPath = resolve(f.root, 'parent.jsonl');
  const childPath = resolve(f.root, 'child.jsonl');
  writeFileSync(
    parentPath,
    transcript('unit-root', [
      ...f.routerRows,
      call('unit-spawn', 'spawn_agent', {
        task_name: 'unit-reviewer',
        model: profile.model,
        reasoning_effort: profile.reasoningEffort,
        fork_turns: 'none',
        message: 'Review independently.',
      }),
      result('unit-spawn', { task_name: '/root/unit-reviewer' }),
    ]),
  );
  writeFileSync(
    childPath,
    transcript(
      'unit-child',
      [
        encryptedTask(),
        {
          type: 'response_item',
          timestamp: iso(500),
          payload: {
            type: 'message',
            role: 'developer',
            content: [{ type: 'input_text', text: worker }],
          },
        },
        call('unit-work', 'exec_command', { cmd: 'true' }),
        {
          type: 'response_item',
          timestamp: iso(2000),
          payload: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Review independently. Read workers/effective-flow-nodejs-reviewer.md',
              },
            ],
          },
        },
      ],
      childMeta,
    ),
  );
  assert.throws(
    () =>
      captureHostEvidence({
        harness: 'codex-cli',
        profile,
        skillRoot: f.skill,
        sessions: [
          { alias: 'root', path: parentPath, parent: null, target: 'codex' },
          {
            alias: 'reviewer',
            path: childPath,
            parent: 'root',
            spawnCallId: 'unit-spawn',
            target: 'codex',
            roleMarker: 'independent-review',
            nativeId: '/root/unit-reviewer',
          },
        ],
      }),
    /UNSUPPORTED_ORIGINAL_ASSIGNMENT/,
  );
});
