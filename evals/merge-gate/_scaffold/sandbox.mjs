// The sandbox layout, in the one place both the scaffold that creates it and the preparation step
// that archives out of it can read. It is a module of its own rather than an export of
// `scaffold.mjs` because that file is a script: importing it would run a provisioning pass as a
// side effect of asking where the sandbox is.
//
// The base is a fixed absolute path, not something derived from a working directory, because a
// scenario prompt has to name the skill root and the project checkout literally and cannot know
// where the agent it is handed to was rooted.

import { resolve } from 'node:path';

export const SANDBOX_BASE = '/tmp/effective-flow-merge-gate-eval';

export function sandboxPaths(scenario) {
  const sandbox = resolve(SANDBOX_BASE, scenario);
  return {
    sandbox,
    skillRoot: resolve(sandbox, 'skill'),
    projectRoot: resolve(sandbox, 'project'),
    fixture: resolve(sandbox, 'fixture.json'),
    traceDir: resolve(sandbox, 'trace'),
    callLog: resolve(sandbox, 'trace', 'tracker-calls.jsonl'),
  };
}
