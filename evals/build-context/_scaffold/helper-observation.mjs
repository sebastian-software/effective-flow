// Conservative actual CLI invocation parser. Unsupported shell/JS shapes are unproven, never
// inferred from a command-name substring or from a reported error-code alone.
import { digest } from './transcript.mjs';
export function helperInvocation(argumentsValue) {
  const command = argumentsValue?.cmd ?? argumentsValue?.command;
  if (typeof command !== 'string') return null;
  const match = command.match(
    /^node\s+([^\s'";|&]+\/(build-run|pilot-measurement)\.mjs)\s+([a-z-]+)\s+<<'([A-Z][A-Z0-9_]*)'\n([\s\S]*?)\n\4\s*$/,
  );
  if (!match) return null;
  try {
    return {
      script: match[1],
      family: match[2] === 'build-run' ? 'build-run' : 'pilot',
      operation: match[3],
      input: JSON.parse(match[5]),
      inputBytes: Buffer.byteLength(match[5]),
      inputDigest: digest(match[5]),
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
  const call = helperInvocation(tool.arguments);
  if (!call || call.operation !== envelope.operation || call.script !== roots[call.family])
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
