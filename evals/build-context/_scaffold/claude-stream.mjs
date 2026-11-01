// Only immutable bytes received live by the trusted host collector become Claude observations.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { digest, readRegular } from './transcript.mjs';
import { requireThat, SCHEMA } from './protocol.mjs';
export const CLAUDE_STREAM_SCHEMA = SCHEMA + '/claude-host-stream';
export function decodeClaudeCapture(captureText, stdoutText, process) {
  requireThat(
    digest(captureText) === process.captureDigest && digest(stdoutText) === process.stdoutDigest,
    'actual Claude external capture/stdout changed',
  );
  const frames = captureText.split('\n').filter(Boolean).map(JSON.parse);
  let prior = process.startedAt,
    buffer = Buffer.alloc(0);
  const observed = [];
  for (const frame of frames) {
    requireThat(
      JSON.stringify(Object.keys(frame).sort()) === JSON.stringify(['at', 'bytes']) &&
        Number.isFinite(frame.at) &&
        frame.at >= prior &&
        frame.at <= process.finishedAt &&
        typeof frame.bytes === 'string',
      'invalid live host stream chronology',
    );
    prior = frame.at;
    const chunk = Buffer.from(frame.bytes, 'base64');
    requireThat(chunk.toString('base64') === frame.bytes, 'noncanonical host stream bytes');
    buffer = Buffer.concat([buffer, chunk]);
    let end;
    while ((end = buffer.indexOf(10)) >= 0) {
      const bytes = buffer.subarray(0, end),
        row = JSON.parse(bytes.toString('utf8'));
      requireThat(
        row && typeof row === 'object' && !Array.isArray(row),
        'actual Claude stream event malformed',
      );
      observed.push({ observedAt: frame.at, event: row });
      buffer = buffer.subarray(end + 1);
    }
  }
  requireThat(
    buffer.length === 0 &&
      Buffer.concat(frames.map((f) => Buffer.from(f.bytes, 'base64'))).toString('utf8') ===
        stdoutText,
    'truncated/foreign actual Claude stream',
  );
  return observed;
}
export function materializeClaudeStreams({
  processes,
  capturePaths,
  outputPaths,
  destination,
  target,
  prompts,
}) {
  requireThat(
    processes.length === capturePaths.length && processes.length === outputPaths.length,
    'actual Claude process/capture correspondence missing',
  );
  let rootId = null,
    rootInit = null;
  const rows = [],
    captures = [];
  for (let i = 0; i < processes.length; i++) {
    const actual = decodeClaudeCapture(
      readRegular(capturePaths[i], 24 * 1024 * 1024),
      readRegular(outputPaths[i], 16 * 1024 * 1024),
      processes[i],
    );
    const init = actual.filter((r) => r.event.type === 'system' && r.event.subtype === 'init');
    requireThat(
      init.length === 1 && typeof init[0].event.session_id === 'string',
      'actual root init missing/ambiguous',
    );
    const id = init[0].event.session_id;
    requireThat(rootId === null || rootId === id, 'Claude resume changed actual root identity');
    rootId = id;
    rootInit ??= init[0].event;
    const firstAction = actual.findIndex(
      (r) => r.event.type === 'assistant' || r.event.type === 'result',
    );
    const replay = actual
      .slice(0, firstAction < 0 ? actual.length : firstAction)
      .filter(
        (r) =>
          r.event.type === 'user' &&
          !r.event.parent_tool_use_id &&
          !(
            Array.isArray(r.event.message?.content) &&
            r.event.message.content.some((b) => b.type === 'tool_result')
          ),
      );
    const texts = replay.map((r) =>
      typeof r.event.message?.content === 'string'
        ? r.event.message.content
        : r.event.message?.content
            ?.filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('\n'),
    );
    requireThat(
      texts.length > 0 && texts.at(-1) === prompts[i],
      'actual replayed initial/reply task differs from sealed stdin',
    );
    for (const r of actual) {
      requireThat(
        !r.event.session_id || r.event.session_id === rootId,
        'foreign root stream record',
      );
      rows.push({ ...r, processIndex: i });
    }
    captures.push(processes[i].captureDigest);
  }
  const calls = new Map(),
    groups = new Map([[null, []]]);
  for (const row of rows) {
    const edge = row.event.parent_tool_use_id ?? null;
    if (!groups.has(edge)) groups.set(edge, []);
    groups.get(edge).push(row);
    if (row.event.type === 'assistant')
      for (const block of row.event.message?.content ?? [])
        if (block.type === 'tool_use' && ['Agent', 'Task'].includes(block.name)) {
          requireThat(
            typeof block.id === 'string' && !calls.has(block.id),
            'duplicate actual native spawn edge',
          );
          calls.set(block.id, { parent: edge, block });
        }
  }
  for (const edge of groups.keys())
    if (edge !== null)
      requireThat(calls.has(edge), 'forwarded messages lack actual parent Agent call');
  const aliases = new Map(
    [...groups.keys()].map((edge) => [
      edge,
      edge === null ? 'parent' : 'agent-' + digest(edge).slice(7, 23),
    ]),
  );
  const sessions = [];
  for (const [edge, entries] of groups) {
    const parent = edge === null ? null : calls.get(edge).parent;
    requireThat(aliases.has(parent), 'native child missing actual parent');
    let current = edge;
    const seen = new Set();
    while (current !== null) {
      requireThat(!seen.has(current), 'cyclic native stream spawn graph');
      seen.add(current);
      current = calls.get(current)?.parent ?? null;
    }
    const alias = aliases.get(edge),
      path = resolve(destination, 'claude-observed-' + alias + '.jsonl');
    const body = {
      schema: CLAUDE_STREAM_SCHEMA,
      rootIdentity: rootId,
      rootInit,
      edgeIdentity: edge,
      parentEdge: parent,
      spawn: edge === null ? null : calls.get(edge).block,
      captureDigests: captures,
      entries,
    };
    writeFileSync(path, JSON.stringify(body) + '\n', { flag: 'w', mode: 0o600 });
    sessions.push({
      alias,
      path,
      parent: edge === null ? null : aliases.get(parent),
      target,
      ...(edge === null ? {} : { spawnCallId: edge, nativeId: rootId + '/edge/' + edge }),
    });
  }
  return { rootId, sessions, captureDigests: captures };
}
