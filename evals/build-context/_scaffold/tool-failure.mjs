// Failure-only observation. A successful CLI exit is not a successful workflow, and assistant
// conclusions are never substituted for a tool result. No usage becomes eligible evidence here.
import { realpathSync } from 'node:fs';
import { parseTranscript, digest } from './transcript.mjs';
import { observedExecRequest, observedExecResult } from './helper-observation.mjs';
import { requireThat } from './protocol.mjs';
export function observeToolFailure({
  stdoutText,
  rootText,
  process,
  prompt,
  fixtureRoot,
  reportedVersion,
}) {
  requireThat(digest(stdoutText) === process.stdoutDigest, 'immutable host stdout changed');
  const rows = stdoutText.split('\n').filter(Boolean).map(JSON.parse),
    starts = rows.filter((r) => r.type === 'thread.started');
  requireThat(
    starts.length === 1 && typeof starts[0].thread_id === 'string',
    'actual host root association missing',
  );
  const root = parseTranscript(rootText, 'codex-cli');
  requireThat(
    root.meta?.id === starts[0].thread_id &&
      !root.meta?.parent_thread_id &&
      root.reportedVersion === reportedVersion &&
      root.cwd &&
      realpathSync(root.cwd) === fixtureRoot,
    'actual failed root metadata differs from launched fixture',
  );
  requireThat(
    root.firstAt >= process.startedAt - 1000 &&
      root.lastAt <= process.finishedAt + 1000 &&
      root.initialUser?.text?.includes(prompt),
    'failed tool transcript is not associated with the predeclared process/prompt',
  );
  for (const tool of root.tools) {
    const input = observedExecRequest(tool);
    if (
      !input ||
      typeof input.cmd !== 'string' ||
      Object.keys(input).some(
        (k) =>
          ![
            'cmd',
            'workdir',
            'shell',
            'login',
            'max_output_tokens',
            'yield_time_ms',
            'sandbox_permissions',
          ].includes(k),
      )
    )
      continue;
    const observed = observedExecResult(tool.output);
    const error =
      observed &&
      observed.exit_code !== 0 &&
      /^sandbox-exec: sandbox_apply: Operation not permitted\s*$/.test(observed.output)
        ? observed
        : null;
    if (
      !error ||
      !Number.isFinite(tool.at) ||
      tool.at < process.startedAt - 1000 ||
      tool.at > process.finishedAt + 1000
    )
      continue;
    // An echo of a desired error is not a native tool failure.
    if (/sandbox_apply|^\s*(?:echo|printf)\b/.test(input.cmd)) continue;
    return {
      kind: 'tool-capability',
      code: 'native-tool-sandbox-unavailable',
      sourceDigest: root.sourceDigest,
      stdoutDigest: process.stdoutDigest,
      rootIdentity: digest('host-session:' + root.meta.id),
      callDigest: digest(tool.id),
      inputDigest: digest(JSON.stringify(input)),
      resultDigest: digest(JSON.stringify(error)),
      toolExitCode: error.exit_code,
      cliExitCode: process.exitCode,
      at: tool.at,
    };
  }
  throw Error('actual associated native tool sandbox error missing');
}
