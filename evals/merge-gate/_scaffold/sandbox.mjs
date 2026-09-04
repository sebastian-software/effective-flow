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
  const traceDir = resolve(sandbox, 'trace');
  return {
    sandbox,
    skillRoot: resolve(sandbox, 'skill'),
    projectRoot: resolve(sandbox, 'project'),
    fixture: resolve(sandbox, 'fixture.json'),
    traceDir,
    callLog: resolve(traceDir, 'tracker-calls.jsonl'),
    // Written by the scaffold, archived beside the call log. It sits in `trace/` rather than at the
    // sandbox root because it is part of the run's record, not part of its setup: the scaffold
    // produces it, the run never reads it, and it is only ever consumed together with the log it
    // describes.
    buildIdentity: resolve(traceDir, 'build-identity.json'),
  };
}
