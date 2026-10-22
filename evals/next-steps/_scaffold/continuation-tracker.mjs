// Offline transport for this one source-update exercise. Production owns validation, command
// construction, expected-body guards, idempotency and envelopes; this transport never executes gh.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const EXERCISE_REPOSITORY = Object.freeze({
  host: 'github.com',
  owner: 'example',
  repository: 'flow',
  provider: 'github',
});
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

export async function executeOfflineOperation(
  operation,
  input,
  { projectRoot, statePath, logPath, corePath, apply = false },
) {
  const append = (value) => appendFileSync(logPath, `${JSON.stringify(value)}\n`);
  append({ event: 'request', operation, input, apply });
  if (!['issue-read', 'issue-comments-read', 'issue-comment-update'].includes(operation)) {
    const response = {
      ok: false,
      operation,
      error: {
        code: 'UNSUPPORTED_OPERATION',
        message: 'offline exercise permits only its issue reads and existing-comment update',
      },
    };
    append({ event: 'response', operation, response });
    return response;
  }
  if (
    input.cwd !== projectRoot ||
    input.issue !== 37 ||
    (input.repository && JSON.stringify(input.repository) !== JSON.stringify(EXERCISE_REPOSITORY))
  ) {
    throw new Error('offline exercise request must retain its exact project and issue identity');
  }
  const { executeOperation } = await import(pathToFileURL(corePath));
  const submittedBody = input.payload?.body;
  const runner = async (call) => {
    const state = read(statePath);
    if (call.executable !== 'gh' || call.cwd !== projectRoot)
      throw new Error('no process or network access is supported');
    const endpoint = call.args.find((value) => value.startsWith('repos/'));
    let raw;
    if (endpoint === 'repos/example/flow/issues/37/comments' && !call.args.includes('PATCH')) {
      raw = [state.comments]; // gh --paginate --slurp page shape
    } else if (endpoint === 'repos/example/flow/issues/37' && !call.args.includes('PATCH')) {
      raw = state.issue;
    } else if (
      endpoint === `repos/example/flow/issues/comments/${state.comments[0].id}` &&
      call.args.includes('PATCH')
    ) {
      const payload = JSON.parse(call.stdin);
      if (payload.body !== submittedBody)
        throw new Error('production command changed the submitted body');
      const before = state.comments[0].body;
      state.comments[0].body = payload.body;
      save(statePath, state);
      append({
        event: 'applied',
        operation,
        before,
        submittedBody,
        persistedBody: read(statePath).comments[0].body,
      });
      raw = state.comments[0];
    } else throw new Error(`unsupported offline provider call: ${JSON.stringify(call.args)}`);
    return { status: 0, stdout: JSON.stringify(raw), stderr: '' };
  };
  const response = await executeOperation(
    operation,
    { ...input, repository: EXERCISE_REPOSITORY },
    {
      apply,
      skipProbe: true,
      runner,
    },
  );
  append({ event: 'response', operation, response });
  return response;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    const skillRoot = resolve(import.meta.dirname, '..');
    const attemptRoot = resolve(skillRoot, '..');
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    const result = await executeOfflineOperation(process.argv[2], JSON.parse(input), {
      projectRoot: resolve(attemptRoot, 'project'),
      statePath: resolve(attemptRoot, 'issue-state.json'),
      logPath: resolve(attemptRoot, 'tracker-calls.jsonl'),
      corePath: resolve(skillRoot, 'scripts/remote-tracker-core.mjs'),
      apply: process.argv.slice(3).includes('--apply'),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
