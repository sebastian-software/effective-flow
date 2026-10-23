#!/usr/bin/env node

import { cleanupProfile, recoverProfiles } from './_scaffold/host-profile-cleanup.mjs';
import { runCommand } from './_scaffold/host-profile-process.mjs';
import { createProfile, openRoot } from './_scaffold/host-profile-storage.mjs';

const USAGE = `usage: node evals/host-run.mjs --profiles-root DIR [--auth-file FILE] -- COMMAND [ARGS...]
       node evals/host-run.mjs --profiles-root DIR --recover

Runs one host command in an isolated HOME/CODEX_HOME and removes only its four Codex cache
locations after its process group is gone. Reuse a stable, dedicated profiles root across runs
for automatic recovery; profile metadata, state, evidence, and explicit auth links are retained.
POSIX only. No model is launched by evals/eval.mjs.
`;

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--') {
      options.command = args.slice(index + 1);
      break;
    }
    if (
      !['--profiles-root', '--auth-file', '--recover'].includes(token) ||
      Object.hasOwn(options, token)
    ) {
      throw new Error(`unknown or duplicate option ${token}`);
    }
    if (token === '--recover') options[token] = true;
    else {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--'))
        throw new Error(`${token} requires a value`);
      options[token] = value;
      index += 1;
    }
  }
  if (
    !options['--profiles-root'] ||
    (options['--recover']
      ? options.command !== undefined || options['--auth-file'] !== undefined
      : !options.command?.length)
  )
    throw new Error(USAGE);
  return options;
}

const warn = (message) => process.stderr.write(`host-run: ${message}\n`);
try {
  const options = parseArgs(process.argv.slice(2));
  if (process.platform === 'win32') throw new Error('host-run requires POSIX process groups');
  const root = openRoot(options['--profiles-root']);
  await recoverProfiles(root, warn);
  if (!options['--recover']) {
    const profile = createProfile(root, options['--auth-file']);
    try {
      process.exitCode = await runCommand(
        root,
        profile,
        options.command[0],
        options.command.slice(1),
        warn,
      );
    } finally {
      if (!(await cleanupProfile(root, profile.path, { own: true }))) {
        warn('profile caches retained because shutdown or path safety could not be proven');
      }
    }
  }
} catch (error) {
  warn(error.message);
  process.exitCode = 125;
}
