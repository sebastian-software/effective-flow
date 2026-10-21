// Normalize only host-written native execution records. Outer tool wrappers cannot supply
// missing identity, timing, arguments, or results, and duplicate native IDs stay unproven.
import { fileURLToPath } from 'node:url';

const nonempty = (value) => typeof value === 'string' && value.length > 0;
const milliseconds = (value) => Number.isSafeInteger(value) && value >= 0;

export function codexNativeExecutions(rows, meta, { firstAt, lastAt }) {
  const records = rows.flatMap((row, index) =>
    row.type === 'event_msg' &&
    row.payload?.type === 'item_completed' &&
    row.payload?.item?.type === 'CommandExecution'
      ? [{ row, line: index + 1 }]
      : [],
  );
  const counts = new Map();
  for (const { row } of records) {
    const id = row.payload.item.id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const tools = [];
  for (const { row, line } of records) {
    const p = row.payload,
      item = p.item,
      observedAt = Date.parse(row.timestamp ?? '');
    if (
      !nonempty(meta?.id) ||
      p.thread_id !== meta.id ||
      !nonempty(p.turn_id) ||
      !nonempty(item.id) ||
      counts.get(item.id) !== 1 ||
      !nonempty(item.process_id) ||
      !milliseconds(p.started_at_ms) ||
      !milliseconds(p.completed_at_ms) ||
      p.completed_at_ms < p.started_at_ms ||
      !Number.isFinite(observedAt) ||
      !Number.isFinite(firstAt) ||
      !Number.isFinite(lastAt) ||
      p.started_at_ms < firstAt ||
      p.completed_at_ms > observedAt ||
      observedAt > lastAt ||
      item.status !== 'completed' ||
      !Number.isInteger(item.exit_code) ||
      typeof item.aggregated_output !== 'string' ||
      !Array.isArray(item.command) ||
      item.command.length !== 3 ||
      !['/bin/zsh', '/bin/bash', '/bin/sh'].includes(item.command[0]) ||
      !['-lc', '-c'].includes(item.command[1]) ||
      typeof item.command[2] !== 'string' ||
      item.command[2].includes('\0') ||
      typeof item.cwd !== 'string'
    )
      continue;
    let cwd;
    try {
      const url = new URL(item.cwd);
      if (url.protocol !== 'file:' || url.hostname || url.search || url.hash) continue;
      cwd = fileURLToPath(url);
    } catch {
      continue;
    }
    tools.push({
      id: item.id,
      name: 'exec_command',
      arguments: { cmd: item.command[2], workdir: cwd },
      line,
      resultLine: line,
      callAt: p.started_at_ms,
      at: p.completed_at_ms,
      output: JSON.stringify({ exit_code: item.exit_code, output: item.aggregated_output }),
      nativeExecution: true,
    });
  }
  return { present: records.length > 0, tools };
}

// The original routed child assignment is the first addressed NEW_TASK before any assistant
// turn. An encrypted payload cannot be replaced with environment text or a later follow-up.
export function codexAssignmentProblem(rows, meta, firstAssistant) {
  const path = meta?.agent_path;
  if (
    !nonempty(meta?.parent_thread_id) ||
    !meta?.source?.subagent?.thread_spawn ||
    typeof meta.source.subagent.thread_spawn !== 'object' ||
    Array.isArray(meta.source.subagent.thread_spawn) ||
    typeof path !== 'string' ||
    !/^\/root\/(?:[^/\s]+\/)*[^/\s]+$/.test(path)
  )
    return null;
  const parent = path.slice(0, path.lastIndexOf('/'));
  const incoming = rows.slice(0, firstAssistant < 0 ? rows.length : firstAssistant).find((row) => {
    const p = row.payload;
    if (
      row.type !== 'response_item' ||
      p?.type !== 'agent_message' ||
      p.author !== parent ||
      p.recipient !== path ||
      !Array.isArray(p.content)
    )
      return false;
    return p.content.some(
      (block) =>
        block.type === 'input_text' &&
        typeof block.text === 'string' &&
        block.text.startsWith(
          'Message Type: NEW_TASK\nTask name: ' + path + '\nSender: ' + parent + '\nPayload:\n',
        ),
    );
  });
  return incoming?.payload.content.some((block) => block.type === 'encrypted_content')
    ? 'encrypted-original-assignment'
    : null;
}
