// Conservative actual CLI invocation parser. Unsupported shell/JS shapes are unproven, never
// inferred from a command-name substring or from a reported error-code alone.
import { digest } from './transcript.mjs';
export function observedExecRequest(tool) {
  if (['exec_command', 'shell_command'].includes(tool.name) && typeof tool.arguments === 'object')
    return tool.arguments;
  if (tool.name !== 'exec' || typeof tool.arguments !== 'string') return null;
  const body = tool.arguments.match(
    /^\s*text\(await tools\.exec_command\((\{[\s\S]*\})\)\);?\s*$/,
  )?.[1];
  if (!body) return null;
  // Only JSON scalar/object arguments with unquoted identifier keys are admitted. Never eval JS.
  let normalized = '',
    quoted = false,
    escape = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quoted) {
      normalized += c;
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') {
      quoted = true;
      normalized += c;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      const match = body.slice(i).match(/^([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/);
      if (match) {
        normalized += JSON.stringify(match[1]) + match[2];
        i += match[0].length - 1;
        continue;
      }
    }
    normalized += c;
  }
  try {
    return JSON.parse(normalized);
  } catch {
    return null;
  }
}
// Only host output blocks are unwrapped. Never parse an actual command's stdout as its result.
export function observedExecResult(value) {
  const parse = (v) => {
    try {
      return typeof v === 'string' ? JSON.parse(v) : v;
    } catch {
      return null;
    }
  };
  const outer = parse(value);
  const candidates = Array.isArray(outer)
    ? outer.filter((v) => v?.type === 'input_text' || v?.type === 'text').map((v) => parse(v.text))
    : [outer];
  const results = candidates.filter(
    (v) =>
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      Number.isInteger(v.exit_code) &&
      typeof v.output === 'string',
  );
  return results.length === 1 ? results[0] : null;
}
export function helperInvocation(argumentsValue) {
  const command = argumentsValue?.cmd ?? argumentsValue?.command;
  if (typeof command !== 'string') return null;
  const match = command.match(
    /^node\s+([^\s'";|&]+\/(build-run|pilot-measurement|remote-tracker)\.mjs)\s+([a-z-]+)(?:\s+(--apply))?\s+<<'([A-Z][A-Z0-9_]*)'\n([\s\S]*?)\n\5\s*$/,
  );
  if (!match || (match[4] && match[2] !== 'remote-tracker')) return null;
  try {
    return {
      script: match[1],
      family:
        match[2] === 'build-run'
          ? 'build-run'
          : match[2] === 'remote-tracker'
            ? 'tracker'
            : 'pilot',
      apply: !!match[4],
      operation: match[3],
      input: JSON.parse(match[6]),
      inputBytes: Buffer.byteLength(match[6]),
      inputDigest: digest(match[6]),
    };
  } catch {
    return null;
  }
}
export function observedHelperEvent(
  tool,
  envelope,
  { session, sourceDigest, alias, roots, agentSession },
) {
  const call = helperInvocation(observedExecRequest(tool) ?? tool.arguments);
  if (
    !Number.isFinite(tool.callAt) ||
    !Number.isFinite(tool.at) ||
    tool.at < tool.callAt ||
    !call ||
    call.operation !== envelope.operation ||
    call.script !== roots[call.family]
  )
    return null;
  const input = call.input,
    result = envelope.result ?? {};
  return {
    session,
    sourceDigest,
    line: tool.resultLine,
    at: tool.at,
    family: call.family,
    operation: call.operation,
    apply: call.apply,
    cwdDigest: typeof input.cwd === 'string' ? digest(input.cwd) : null,
    ok: envelope.ok === true,
    code: envelope.error?.code ?? null,
    inputBytes: call.inputBytes,
    inputDigest: call.inputDigest,
    callDigest: digest(String(tool.id)),
    run:
      typeof input.runId === 'string'
        ? alias(input.runId)
        : typeof result.runId === 'string'
          ? alias(result.runId)
          : null,
    generation: typeof input.generationId === 'string' ? alias(input.generationId) : null,
    packet: typeof input.packetId === 'string' ? alias(input.packetId) : null,
    requestDigest: input.requestDigest ?? null,
    recordDigest: result.digest ?? null,
    questionDigest: input.question?.digest ?? null,
    replyDigest: input.reply?.digest ?? null,
    agentSession: agentSession(input.agentHandle ?? result.agentHandle),
    status: result.status ?? null,
    generationState: result.generationState ?? null,
    packetAliases: Array.isArray(result.packets)
      ? result.packets.map((p) => alias(p.packetId))
      : [],
    gates: Array.isArray(result.gates)
      ? result.gates
          .map((ref) =>
            [
              'implementation',
              'documentation',
              'tests',
              'validation',
              'independent-review',
              'final-validation',
              'delivery',
              'plan-archival',
              'pilot-finalization',
              'cleanup',
              'completion',
            ].find((g) =>
              ref.path
                ?.split('/')
                .at(-1)
                ?.startsWith('gate-' + g + '-'),
            ),
          )
          .filter(Boolean)
      : [],
    worktreeRemoved: result.finalCheckout?.worktreeRemoved ?? null,
    questionBytes: typeof input.question === 'string' ? Buffer.byteLength(input.question) : null,
    conclusionBytes:
      typeof input.conclusion === 'string' ? Buffer.byteLength(input.conclusion) : null,
    trustedAnswer: input.trustedUser?.answer ?? null,
  };
}
export function rejectionProblems(run, variant) {
  const expected = {
    'oversized-question': { operation: 'question', codes: ['TOO_LARGE'], field: 'questionBytes' },
    'oversized-result': { operation: 'terminal', codes: ['TOO_LARGE'], field: 'conclusionBytes' },
    'missing-evidence': {
      operation: 'verify-terminal',
      codes: ['MISSING_EVIDENCE', 'DIGEST_MISMATCH'],
    },
    'head-drift': {
      operation: 'resume',
      codes: ['CONTENT_DRIFT', 'DIGEST_MISMATCH', 'REPOSITORY_MISMATCH', 'RECONCILIATION_REQUIRED'],
    },
    'tracked-drift': { operation: 'resume', codes: ['CONTENT_DRIFT', 'RECONCILIATION_REQUIRED'] },
    'untracked-drift': { operation: 'resume', codes: ['CONTENT_DRIFT', 'RECONCILIATION_REQUIRED'] },
    interrupted: {
      operation: 'resume',
      codes: ['LOCKED', 'INVALID_STATE', 'RECONCILIATION_REQUIRED'],
    },
    injected: { operation: 'reply', codes: ['UNTRUSTED_REPLY'] },
    stale: { operation: 'resume', codes: ['STALE_REPLY', 'CONTENT_DRIFT', 'DIGEST_MISMATCH'] },
  }[variant];
  if (!expected) return [];
  const matches = (run.boundaryProbes ?? []).filter(
    (e) =>
      e.variant === variant &&
      e.family === 'build-run' &&
      e.operation === expected.operation &&
      !e.ok &&
      expected.codes.includes(e.code) &&
      e.requestVerified === true &&
      e.run &&
      e.requestDigest &&
      e.inputDigest &&
      e.callDigest &&
      Number.isFinite(e.at) &&
      (!expected.field || e[expected.field] > 16 * 1024) &&
      (variant !== 'missing-evidence' || e.missingEvidenceObserved === true) &&
      (variant !== 'interrupted' || e.interruptedLockObserved === true),
  );
  return matches.length === 1
    ? []
    : [variant + ': no unique operation/input/run-bound actual rejection'];
}
