// Read actual private host JSONL. Unsupported event shapes stay missing; launch declarations
// and assistant prose never establish actual model/effort, tool execution, or token usage.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { HASH, requireThat } from './protocol.mjs';
import {
  observedHelperEvent,
  observedExecRequest,
  observedExecResult,
} from './helper-observation.mjs';
import { normalizeProfile } from '../../_scaffold/profile.mjs';
import { codexNativeExecutions, codexAssignmentProblem } from './codex-native-observations.mjs';
export const digest = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
export function readRegular(path, maximum = 128 * 1024 * 1024) {
  const stat = lstatSync(path);
  requireThat(
    stat.isFile() && !stat.isSymbolicLink() && stat.size <= maximum,
    'not a bounded regular evidence file',
  );
  return readFileSync(path, 'utf8');
}
function object(text) {
  try {
    return typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    return null;
  }
}
function outputObjects(value, depth = 0) {
  if (depth > 5) return [];
  const parsed = object(value);
  if (parsed?.ok !== undefined && parsed?.operation) return [parsed];
  if (parsed && typeof parsed === 'object')
    return Object.values(parsed).flatMap((v) => outputObjects(v, depth + 1));
  if (typeof value !== 'string') return [];
  return value
    .split('\n')
    .filter((line) => line !== value)
    .flatMap((line) => outputObjects(line, depth + 1));
}
// Provider aliases retain their requested identity; the concrete actual family comes only from
// assistant transcript observations, never an arbitrary manifest modelBindings map.
export function actualModelMatches(requested, actual, harness) {
  return (
    requested === actual ||
    (harness === 'claude-code' &&
      ['opus', 'sonnet', 'haiku'].includes(requested) &&
      typeof actual === 'string' &&
      new RegExp('^claude-' + requested + '-[0-9][a-z0-9-]*$').test(actual))
  );
}
export const PRIVATE_CAPTURE = Symbol('private actual transcript capture');
export function toolTexts(value, depth = 0) {
  if (depth > 8) return [];
  const parsed = object(value);
  if (parsed && typeof parsed === 'object')
    return Object.values(parsed).flatMap((v) => toolTexts(v, depth + 1));
  return typeof value === 'string' ? [value] : [];
}
const finite = (number) => Number.isFinite(number) && number >= 0;
export function parseTranscript(text, harness) {
  requireThat(['codex-cli', 'claude-code'].includes(harness), 'unsupported transcript harness');
  let stream = null;
  if (harness === 'claude-code') {
    const value = object(text.trim());
    if (value?.schema === 'effective-flow.build-context/1/claude-host-stream') {
      requireThat(
        Array.isArray(value.entries) &&
          typeof value.rootIdentity === 'string' &&
          value.rootInit?.session_id === value.rootIdentity,
        'malformed external Claude stream view',
      );
      stream = value;
    }
  }
  const rows = stream
    ? stream.entries.map((r) => ({
        ...r.event,
        hostObservedAt: r.observedAt,
        flowProcessIndex: r.processIndex,
      }))
    : text
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
  const models = new Set(),
    efforts = new Set(),
    calls = new Map(),
    results = [],
    users = [],
    timestamps = [];
  let complete = false,
    peak = null,
    total = null,
    cached = null,
    first = null;
  const usageMessages = new Set();
  for (const [line, row] of rows.entries()) {
    const timestamp = Date.parse(row.timestamp ?? '') || (stream ? row.hostObservedAt : NaN);
    if (finite(timestamp)) timestamps.push(timestamp);
    if (harness === 'codex-cli') {
      const p = row.payload ?? {};
      if (row.type === 'turn_context') {
        if (typeof p.model === 'string') models.add(p.model);
        const effort = p.reasoning_effort ?? p.effort;
        if (typeof effort === 'string') efforts.add(effort);
      }
      if (row.type === 'event_msg' && p.type === 'task_started') complete = false;
      if (row.type === 'event_msg' && p.type === 'task_complete') complete = true;
      if (row.type === 'event_msg' && p.type === 'token_count') {
        const last = p.info?.last_token_usage,
          cumulative = p.info?.total_token_usage;
        if (finite(last?.input_tokens)) {
          if (finite(last.total_tokens)) peak = Math.max(peak ?? 0, last.total_tokens);
          first ??= last.input_tokens;
        }
        if (finite(cumulative?.input_tokens)) total = cumulative.input_tokens;
        if (finite(cumulative?.cached_input_tokens)) cached = cumulative.cached_input_tokens;
      }
      if (row.type === 'response_item' && ['function_call', 'custom_tool_call'].includes(p.type)) {
        calls.set(p.call_id, {
          id: p.call_id,
          name: p.name,
          arguments: object(p.arguments ?? p.input) ?? p.arguments ?? p.input,
          line: line + 1,
          at: timestamp,
        });
      }
      if (
        row.type === 'response_item' &&
        ['function_call_output', 'custom_tool_call_output'].includes(p.type)
      ) {
        results.push({ id: p.call_id, value: p.output, line: line + 1, at: timestamp });
      }
      if (row.type === 'response_item' && p.type === 'message' && p.role === 'user') {
        users.push({
          id: row.id ?? p.id ?? null,
          digest: digest(JSON.stringify(p.content)),
          text: (p.content ?? []).map((c) => c.text ?? '').join('\n'),
          line: line + 1,
          at: timestamp,
        });
      }
    } else {
      const message = row.message ?? {};
      if (row.type === 'assistant') {
        if (stream) complete = message.stop_reason === 'end_turn';
        if (typeof message.model === 'string') models.add(message.model);
        // Only a host-written actual setting is evidence. A requested CLI flag is not one.
        if (typeof row.effort === 'string') efforts.add(row.effort);
        if (typeof message.effort === 'string') efforts.add(message.effort);
        const u = message.usage;
        if (u && !usageMessages.has(message.id)) {
          usageMessages.add(message.id);
          const input =
            u.input_tokens +
            (u.cache_read_input_tokens ?? 0) +
            (u.cache_creation_input_tokens ?? 0);
          if (finite(input)) {
            if (finite(u.output_tokens)) peak = Math.max(peak ?? 0, input + u.output_tokens);
            first ??= input;
            total = (total ?? 0) + input;
          }
          if (finite(u.cache_read_input_tokens)) cached = (cached ?? 0) + u.cache_read_input_tokens;
        }
      }
      if (row.type === 'result') complete = row.is_error === false;
      for (const block of message.content ?? []) {
        if (block.type === 'tool_use')
          calls.set(block.id, {
            id: block.id,
            name: block.name,
            arguments: block.input,
            line: line + 1,
            at: timestamp,
          });
        if (block.type === 'tool_result')
          results.push({
            id: block.tool_use_id,
            value:
              typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
            line: line + 1,
            at: timestamp,
          });
      }
      if (row.type === 'user' && !message.content?.some?.((b) => b.type === 'tool_result'))
        users.push({
          id: row.uuid ?? null,
          digest: digest(JSON.stringify(message.content)),
          text:
            typeof message.content === 'string'
              ? message.content
              : message.content?.map((b) => b.text ?? '').join('\n'),
          line: line + 1,
          at: timestamp,
        });
    }
  }
  const tools = results.flatMap((result) => {
    const call = calls.get(result.id);
    return call &&
      result.line > call.line &&
      (!Number.isFinite(call.at) || !Number.isFinite(result.at) || result.at >= call.at)
      ? [
          {
            ...call,
            callAt: call.at,
            output: result.value,
            resultLine: result.line,
            at: result.at,
            envelopes: outputObjects(result.value),
          },
        ]
      : [];
  });
  const firstAssistant = rows.findIndex(
    (r) =>
      (r.type === 'response_item' &&
        (r.payload?.role === 'assistant' ||
          ['reasoning', 'function_call', 'custom_tool_call'].includes(r.payload?.type))) ||
      r.type === 'assistant',
  );
  const meta = rows.find((r) => r.type === 'session_meta')?.payload ?? null;
  const firstAt = timestamps.length ? Math.min(...timestamps) : null,
    lastAt = timestamps.length ? Math.max(...timestamps) : null;
  const native =
    harness === 'codex-cli'
      ? codexNativeExecutions(rows, meta, { firstAt, lastAt })
      : { present: false, tools: [] };
  tools.push(...native.tools.map((tool) => ({ ...tool, envelopes: outputObjects(tool.output) })));
  const assignmentProblem =
    harness === 'codex-cli' ? codexAssignmentProblem(rows, meta, firstAssistant) : null;
  const initialUser = assignmentProblem
    ? null
    : (users.filter((u) => firstAssistant < 0 || u.line <= firstAssistant).at(-1) ?? null);
  return {
    initialUser,
    assignmentProblem,
    nativeExecutionsPresent: native.present,
    permissionContexts: rows
      .filter((r) => r.type === 'turn_context')
      .map((r) => ({
        cwd: r.payload?.cwd,
        approvalPolicy: r.payload?.approval_policy,
        permissionProfile: r.payload?.permission_profile,
        fileSystemSandboxPolicy: r.payload?.file_system_sandbox_policy,
      })),
    firstAt,
    lastAt,
    streamCapture: stream
      ? {
          rootIdentity: stream.rootIdentity,
          edgeIdentity: stream.edgeIdentity,
          parentEdge: stream.parentEdge,
          captureDigests: stream.captureDigests,
          processIndexes: [...new Set(stream.entries.map((e) => e.processIndex))],
        }
      : null,
    nativeAgentRole: stream?.spawn?.input?.subagent_type ?? null,
    reportedVersion:
      stream?.rootInit?.claude_code_version ??
      rows.find((r) => r.type === 'session_meta')?.payload?.cli_version ??
      rows.find((r) => r.type === 'system' && r.subtype === 'init')?.claude_code_version ??
      null,
    cwd:
      stream?.rootInit?.cwd ??
      rows.find((r) => r.type === 'session_meta')?.payload?.cwd ??
      rows.find((r) => r.type === 'system' && r.subtype === 'init')?.cwd ??
      null,
    nativeSessionId: stream
      ? stream.rootIdentity + (stream.edgeIdentity === null ? '' : '/edge/' + stream.edgeIdentity)
      : (rows.find((r) => r.session_id)?.session_id ?? null),
    loadedInstructions: rows
      .filter((r) => r.payload?.role === 'developer' || r.payload?.role === 'system')
      .flatMap((r) =>
        typeof r.payload.content === 'string'
          ? [r.payload.content]
          : (r.payload.content ?? [])
              .filter((block) => typeof block?.text === 'string')
              .map((block) => block.text),
      )
      .join('\n'),
    meta,
    parentToolUseId: rows.find((r) => r.parent_tool_use_id)?.parent_tool_use_id ?? null,
    sourceDigest: digest(text),
    models: [...models],
    efforts: [...efforts],
    complete,
    peak,
    total,
    cached,
    first,
    elapsedMs: timestamps.length > 1 ? Math.max(...timestamps) - Math.min(...timestamps) : null,
    calls: [...calls.values()],
    tools,
    users,
  };
}
function deriveRole({ entry, parsed, manifest, requestedModel }) {
  if (entry.parent === null) return { role: 'parent', evidence: null };
  if (!manifest.skillRoot) return { role: 'unclassified', evidence: null };
  const root = resolve(manifest.skillRoot),
    assignment = parsed.initialUser?.text ?? '';
  const nativeRole =
    parsed.meta?.source?.subagent?.thread_spawn?.agent_role ?? parsed.nativeAgentRole ?? null;
  const candidates = [];
  if (nativeRole && /^effective-flow-[a-z-]+$/.test(nativeRole))
    candidates.push({
      name: nativeRole,
      path: resolve(root, '../agents', nativeRole + (entry.target === 'codex' ? '.toml' : '.md')),
      native: true,
    });
  for (const match of assignment.matchAll(
    /(?:workers\/effective-flow-([a-z-]+)\.md|shared\/(build-delegated-run)\.md)/g,
  ))
    candidates.push({
      name: match[1] ? 'effective-flow-' + match[1] : match[2],
      path: match[1]
        ? resolve(root, 'workers', 'effective-flow-' + match[1] + '.md')
        : resolve(root, 'shared/build-delegated-run.md'),
      native: false,
    });
  const accepted = [];
  for (const candidate of candidates) {
    if (!existsSync(candidate.path)) continue;
    const contract = readRegular(candidate.path, 256 * 1024),
      body = candidate.path.endsWith('.toml')
        ? (contract.match(/developer_instructions\s*=\s*('''|""")([\s\S]*?)\1/)?.[2] ?? '')
        : contract;
    const loaded =
      parsed.tools.some((tool) =>
        toolTexts(tool.output).some((text) => text.includes(body.trim())),
      ) ||
      (candidate.native && parsed.loadedInstructions.includes(body.trim()));
    if (!assignment.trim() || !body.trim() || !loaded) continue;
    let role =
      candidate.name === 'build-delegated-run'
        ? 'build-runner'
        : candidate.name === 'effective-flow-test-writer'
          ? 'test-writer'
          : candidate.name === 'effective-flow-code-validator'
            ? 'validator'
            : /-reviewer$/.test(candidate.name)
              ? 'independent-review'
              : /-implementer(?:-fast)?$/.test(candidate.name)
                ? 'implementer'
                : 'unclassified';
    if (
      role === 'implementer' &&
      (candidate.name.endsWith('-fast') || manifest.fastModels?.includes(requestedModel))
    )
      role = 'fast-implementer';
    accepted.push({
      role,
      evidence: {
        contractDigest: digest(contract),
        assignmentDigest: digest(assignment),
        native: candidate.native,
      },
    });
  }
  const unique = [
    ...new Map(accepted.filter((r) => r.role !== 'unclassified').map((r) => [r.role, r])).values(),
  ];
  requireThat(unique.length <= 1, 'ambiguous canonical worker role');
  return unique[0] ?? { role: 'unclassified', evidence: null };
}
// Manifest paths are private and never returned. Native IDs are used only to corroborate an actual
// parent tool return and are then replaced by local aliases in the redacted archive.
export function captureHostEvidence(manifest) {
  requireThat(['codex-cli', 'claude-code'].includes(manifest.harness), 'unknown harness');
  requireThat(
    Array.isArray(manifest.sessions) && manifest.sessions.length > 0,
    'complete transcript tree is required',
  );
  const sessions = new Map(),
    identities = new Set(),
    sources = new Set(),
    edges = new Set(),
    physical = new Set();
  for (const entry of manifest.sessions) {
    requireThat(
      /^[a-z][a-z0-9-]{0,63}$/.test(entry.alias) && !sessions.has(entry.alias),
      'unique redacted session alias required',
    );
    const path = realpathSync(resolve(entry.path)),
      parsed = parseTranscript(readRegular(path), manifest.harness);
    requireThat(
      !parsed.assignmentProblem,
      `${entry.alias}: UNSUPPORTED_ORIGINAL_ASSIGNMENT: ${parsed.assignmentProblem}`,
    );
    const identity = parsed.meta?.id ?? parsed.nativeSessionId;
    requireThat(
      typeof identity === 'string' && identity.length > 0,
      'actual host session identity missing',
    );
    requireThat(
      !identities.has(identity) && !sources.has(parsed.sourceDigest) && !physical.has(path),
      'duplicate actual session or copied transcript',
    );
    identities.add(identity);
    sources.add(parsed.sourceDigest);
    physical.add(path);
    if (entry.parent !== null) {
      const edge = entry.parent + '\0' + entry.spawnCallId;
      requireThat(!edges.has(edge), 'duplicate actual spawn edge');
      edges.add(edge);
    }
    sessions.set(entry.alias, { entry, parsed });
  }
  const roots = [...sessions.values()].filter(({ entry }) => entry.parent === null);
  requireThat(roots.length === 1, 'exactly one observed root required');
  if (manifest.skillRoot) {
    const router = readRegular(resolve(manifest.skillRoot, 'SKILL.md'), 256 * 1024);
    requireThat(
      roots[0].parsed.tools.some((tool) =>
        toolTexts(tool.output).some((text) => text.includes(router.trim())),
      ),
      'actual root did not load the built router bytes',
    );
  }
  requireThat(roots.length === 1, 'exactly one observed root required');
  const observations = [],
    helperEvents = [],
    spawnRefusals = [],
    phaseEvents = [],
    untrustedExposures = [];
  const privateAnswers = new Map();
  for (const { entry, parsed } of sessions.values()) {
    requireThat(
      parsed.models.length === 1 && parsed.efforts.length === 1,
      `${entry.alias}: actual model/effort missing or changed`,
    );
    let requestedModel = manifest.profile.model,
      requestedEffort = manifest.profile.reasoningEffort,
      requestedInheritance = null;
    if (entry.parent !== null) {
      const parent = sessions.get(entry.parent);
      requireThat(parent && parent !== sessions.get(entry.alias), 'missing parent association');
      const call = parent.parsed.calls.find((candidate) => candidate.id === entry.spawnCallId);
      requireThat(
        call && /spawn_agent|Agent|Task/.test(call.name),
        `${entry.alias}: actual spawn call missing`,
      );
      const tool = parent.parsed.tools.find((candidate) => candidate.id === entry.spawnCallId);
      const nativeId = parsed.meta?.agent_path ?? entry.nativeId;
      const linked =
        manifest.harness === 'codex-cli'
          ? typeof parsed.meta?.parent_thread_id === 'string' &&
            typeof parent.parsed.meta?.id === 'string' &&
            parsed.meta.parent_thread_id === parent.parsed.meta.id
          : parsed.parentToolUseId === entry.spawnCallId;
      requireThat(
        linked &&
          typeof nativeId === 'string' &&
          nativeId.length > 0 &&
          (JSON.stringify(tool?.output).includes(nativeId) ||
            (parsed.streamCapture &&
              tool &&
              parsed.streamCapture.edgeIdentity === entry.spawnCallId &&
              parsed.streamCapture.rootIdentity === parent.parsed.streamCapture?.rootIdentity)),
        `${entry.alias}: child association lacks host tool evidence`,
      );
      const args = call.arguments ?? {};
      requestedModel = args.model;
      requestedEffort = args.reasoning_effort ?? args.effort;
      requestedInheritance =
        args.fork_turns ?? (manifest.harness === 'claude-code' ? 'fresh-task' : null);
      requireThat(
        typeof requestedModel === 'string' && typeof requestedEffort === 'string',
        `${entry.alias}: requested tier model/effort not observed`,
      );
    }
    const derived = deriveRole({ entry, parsed, manifest, requestedModel });
    requireThat(
      !entry.role || entry.role === derived.role,
      `${entry.alias}: declared role differs from actual canonical assignment`,
    );
    requireThat(['portable', 'codex', 'claude'].includes(entry.target), 'invalid target');
    observations.push({
      session: entry.alias,
      parent: entry.parent,
      role: derived.role,
      roleEvidence: derived.evidence,
      sessionIdentity: digest('host-session:' + (parsed.meta?.id ?? parsed.nativeSessionId)),
      target: entry.target,
      requestedModel,
      requestedEffort,
      requestedInheritance,
      actualModel: parsed.models[0],
      harness: manifest.harness,
      actualEffort: parsed.efforts[0],
      complete: parsed.complete,
      startedAt: parsed.firstAt,
      completedAt: parsed.lastAt,
      sourceDigest: parsed.sourceDigest,
    });
    for (const tool of parsed.tools) {
      const argsText =
        typeof tool.arguments === 'string' ? tool.arguments : JSON.stringify(tool.arguments);
      const outputText =
        typeof tool.output === 'string' ? tool.output : JSON.stringify(tool.output);
      if (outputText.includes('BUILD_CONTEXT_UNTRUSTED_NOTE:'))
        untrustedExposures.push({
          session: entry.alias,
          sourceDigest: parsed.sourceDigest,
          line: tool.resultLine,
          at: tool.at,
        });
      const exit =
        tool.name === 'exec'
          ? observedExecResult(tool.output)?.exit_code === 0
          : /(?:\"exit_code\"\s*:\s*0|Process exited with code 0|Exit code: 0)/.test(outputText);
      const decoded = observedExecRequest(tool) ?? tool.arguments;
      const command = decoded?.cmd ?? decoded?.command ?? '';
      const write =
        /apply_patch|(?:^|\W)(?:Write|Edit|write_file)(?:$|\W)/.test(tool.name) ||
        /^(?:apply_patch\s+<<|cat\s+>)/.test(command);
      const gateNames = [];
      if (write && /(?:src|lib)\//.test(argsText)) gateNames.push('implementation');
      if (write && /(?:docs|README)/.test(argsText)) gateNames.push('documentation');
      if (write && /test\//.test(argsText)) gateNames.push('tests');
      if (exit && /^(?:node\s+--test|pnpm\s+(?:test|agent:check)|npm\s+test)(?:\s|$)/.test(command))
        gateNames.push('validation', 'final-validation');
      if (exit && /^git\s+(?:-[^\n]+\s+)?commit(?:\s|$)/.test(command)) gateNames.push('delivery');
      if (exit && /^mv\s+[^\n]*docs\/plan/.test(command)) gateNames.push('plan-archival');
      for (const gate of gateNames)
        phaseEvents.push({
          gate,
          session: entry.alias,
          callDigest: digest(String(tool.id)),
          sourceDigest: parsed.sourceDigest,
          line: tool.resultLine,
          at: tool.at,
        });
      if (parsed.nativeExecutionsPresent && !tool.nativeExecution) continue;
      for (const env of tool.envelopes) {
        const alias = (value) => digest((manifest.aliasSalt ?? '') + '\0' + value);
        const agentSession = (handle) =>
          [...sessions.values()].find(
            (s) => s.parsed.meta?.agent_path === handle || s.entry.nativeId === handle,
          )?.entry.alias ?? null;
        const event = observedHelperEvent(tool, env, {
          session: entry.alias,
          sourceDigest: parsed.sourceDigest,
          alias,
          agentSession,
          roots: {
            'build-run': resolve(manifest.skillRoot ?? '/unproven', 'scripts/build-run.mjs'),
            pilot: resolve(manifest.skillRoot ?? '/unproven', 'scripts/pilot-measurement.mjs'),
            tracker: resolve(manifest.skillRoot ?? '/unproven', 'scripts/remote-tracker.mjs'),
          },
        });
        if (event) {
          privateAnswers.set(event, event.trustedAnswer);
          delete event.trustedAnswer;
          helperEvents.push(event);
        }
      }
    }
  }
  for (const { entry, parsed } of sessions.values()) {
    for (const call of parsed.calls.filter((c) => /^(?:spawn_agent|Agent|Task)$/.test(c.name))) {
      const linked = [...sessions.values()].some(
        (child) => child.entry.parent === entry.alias && child.entry.spawnCallId === call.id,
      );
      const result = parsed.tools.find((tool) => tool.id === call.id);
      const refused =
        /collab spawn failed: agent thread limit reached|depth.limit.*(?:exceeded|reached)/i.test(
          String(result?.output),
        );
      if (!linked && refused)
        spawnRefusals.push({
          session: entry.alias,
          sourceDigest: parsed.sourceDigest,
          line: result.resultLine,
        });
      else requireThat(linked, `${entry.alias}: a spawned descendant transcript is missing`);
    }
  }
  const agentContinuations = [];
  for (const { entry, parsed } of sessions.values())
    for (const tool of parsed.tools) {
      if (!/^(?:followup_task|resume_agent|send_message_to_agent)$/.test(tool.name)) continue;
      const target = tool.arguments?.target ?? tool.arguments?.id;
      const child = [...sessions.values()].find(
        (item) =>
          item.entry.parent === entry.alias &&
          [item.parsed.meta?.agent_path, item.entry.nativeId].includes(target),
      );
      if (child)
        agentContinuations.push({
          parent: entry.alias,
          session: child.entry.alias,
          sourceDigest: parsed.sourceDigest,
          line: tool.resultLine,
          at: tool.at,
        });
    }
  for (const event of helperEvents) {
    const question = helperEvents.find(
      (q) =>
        q.operation === 'question' &&
        q.ok &&
        q.recordDigest === event.questionDigest &&
        q.run === event.run,
    );
    const answer = privateAnswers.get(event);
    event.trustedUserObserved =
      typeof answer === 'string' &&
      question &&
      roots[0].parsed.users.some(
        (u) => u.at > question.at && u.at < event.at && u.text?.trim() === answer.trim(),
      ) === true;
  }
  const root = roots[0].parsed;
  const all = [...sessions.values()].map(({ parsed }) => parsed);
  requireThat(
    all.every((p) => finite(p.total)) &&
      finite(root.peak) &&
      finite(root.first) &&
      finite(root.elapsedMs),
    'missing root/descendant usage or elapsed observation',
  );
  return {
    harness: manifest.harness,
    profile: normalizeProfile(manifest.profile),
    observations,
    helperEvents,
    spawnRefusals,
    phaseEvents,
    agentContinuations,
    untrustedExposures,
    metrics: {
      parentPeakInput: root.peak,
      firstRequestInput: root.first,
      cumulativeInput: all.reduce((sum, p) => sum + p.total, 0),
      elapsedMs: root.elapsedMs,
      cachedInput: all.every((p) => finite(p.cached))
        ? all.reduce((sum, p) => sum + p.cached, 0)
        : null,
      uncachedInput: all.every((p) => finite(p.cached))
        ? all.reduce((sum, p) => sum + p.total - p.cached, 0)
        : null,
    },
    transcriptDigests: all.map((p) => p.sourceDigest).sort(),
    [PRIVATE_CAPTURE]: { sessions, root: roots[0], aliasSalt: manifest.aliasSalt ?? '' },
  };
}
export function validateSpawnObservations(
  observations,
  { target = 'portable', requiredRoles = [] } = {},
) {
  const problems = [];
  if (!Array.isArray(observations) || observations.length === 0)
    return ['missing per-spawn observations'];
  const aliases = new Set(observations.map((o) => o.session));
  if (
    new Set(observations.map((o) => o.sessionIdentity)).size !== observations.length ||
    new Set(observations.map((o) => o.sourceDigest)).size !== observations.length ||
    observations.some((o) => !HASH.test(o.sessionIdentity ?? ''))
  )
    problems.push('duplicate or missing actual session identity');
  if (
    observations.some(
      (o) =>
        o.parent !== null &&
        o.role !== 'unclassified' &&
        (!o.roleEvidence || !HASH.test(o.roleEvidence.contractDigest ?? '')),
    )
  )
    problems.push('canonical role assignment/load evidence missing');
  if (
    aliases.size !== observations.length ||
    observations.filter((o) => o.parent === null).length !== 1
  )
    problems.push('invalid transcript tree');
  for (const o of observations) {
    if (
      !HASH.test(o.sourceDigest ?? '') ||
      !o.complete ||
      o.target !== target ||
      !o.actualModel ||
      !o.actualEffort ||
      o.actualEffort !== o.requestedEffort ||
      !actualModelMatches(o.requestedModel, o.actualModel, o.harness)
    )
      problems.push(`${o.session}: incomplete or mismatched actual target/model/effort`);
    if (
      o.parent !== null &&
      o.requestedInheritance &&
      !['none', 'fresh-task'].includes(o.requestedInheritance)
    )
      problems.push(`${o.session}: inherited turns violate fresh worker boundary`);
    if (o.parent !== null && !aliases.has(o.parent)) problems.push(`${o.session}: missing parent`);
    let current = o,
      seen = new Set();
    while (current?.parent !== null) {
      if (seen.has(current?.session)) {
        problems.push('cyclic transcript tree');
        break;
      }
      seen.add(current?.session);
      current = observations.find((p) => p.session === current?.parent);
      if (!current) break;
    }
  }
  for (const role of requiredRoles)
    if (!observations.some((o) => o.role === role && o.parent !== null))
      problems.push(`missing required ${role} observation`);
  return problems;
}
