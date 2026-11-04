// What a focus slot sees beyond the built skill: the session stub and its shapes module as skill
// files, the two project documents, and the sealed copy of the host's last message.
//
// This file is one of the suite's instrument files: every function here decides what a run sees or
// what the seal records.

import { copyFileSync, existsSync, lstatSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const SHARED_SCAFFOLD = resolve(import.meta.dirname, '..', '..', '_scaffold');
export const STUB_PATH = 'scripts/session-stub.mjs';
export const SHAPES_PATH = 'scripts/session-shapes.mjs';
// The stub imports `./session-shapes.mjs`, so both land side by side in the slot's `scripts/`.
const OVERLAY = Object.freeze([
  [resolve(SHARED_SCAFFOLD, 'session-stub.mjs'), STUB_PATH],
  [resolve(SHARED_SCAFFOLD, 'session-shapes.mjs'), SHAPES_PATH],
]);
export const LAST_MESSAGE_FILE = 'last-message.txt';

// Both files are checked before either is copied, so a refusal leaves the slot's tree unchanged.
export function applyOverlay(scenario, skillRoot) {
  for (const [, relative] of OVERLAY) {
    if (existsSync(resolve(skillRoot, relative))) {
      throw new Error(`${scenario}: the focus overlay must never replace production ${relative}`);
    }
  }
  for (const [source, relative] of OVERLAY) copyFileSync(source, resolve(skillRoot, relative));
}

// The overlay's files are seeds of the load set, hashed as skill files at the paths the run
// executes; they are therefore never also instrument files.
export function overlayExtraSeeds() {
  return OVERLAY.map(([, relative]) => relative);
}

export function projectDocuments({ scenario }) {
  return {
    agents: `# AGENTS.md

**Effective Flow project setup:** docs/adr/effective-flow-project-setup.md

This checkout exists only as the observer's repository in a focus behavioural eval run.
`,
    setupAdr: `# Effective Flow project setup

## Status

Active

## Context

Scenario configuration for the \`${scenario}\` focus behavioural eval scenario.

## Configuration

| Key                              | Value          |
| -------------------------------- | -------------- |
| language.chat                    | en             |
| language.project                 | en             |
| language.source                  | en             |
| language.documentation.technical | en             |
| language.workflow                | en             |
| language.forge                   | en             |
| language.git                     | en             |
| tracker.mode                     | local          |
| worktree.enabled                 | false          |
| delivery.baseBranch              | origin/develop |
`,
  };
}

// The labels assume the observer's repository is the shared seed commit and nothing else, so a
// fixture that asks for checkout history or tracker answers is refused instead of silently changing
// the ground truth. Nothing is written.
export function prepareCheckout({ scenario, fixture }) {
  const keys = Object.keys(fixture).sort();
  if (JSON.stringify(keys) !== JSON.stringify(['operations', 'repository', 'session'])) {
    throw new Error(`${scenario}: a focus fixture carries only repository, operations and session`);
  }
  if (Object.keys(fixture.operations).length > 0) {
    throw new Error(`${scenario}: a focus fixture answers no tracker operation`);
  }
}

// The one place the host may write this attempt's last message: the attempt root's sibling, outside
// the writable root and therefore outside anything the run could author.
export function lastMessagePathFor(attemptRoot) {
  return join(dirname(attemptRoot), `${basename(attemptRoot)}-last-message.txt`);
}

// macOS reaches `/tmp` through `/private/tmp`; the launch names the physical path, the slot the
// logical one, and both name the same file.
function logical(path) {
  return path.startsWith('/private/tmp/') ? path.slice('/private'.length) : path;
}

// The seal's `capture`: the host's last message, copied verbatim. A stopped attempt has no host
// receipt and therefore no last message; it seals the empty text, so only its trace is judged. Any
// other path than this attempt's own last-message file, or a file that is missing, linked or not
// UTF-8, refuses the seal: the scored verdict has to be the message this session wrote.
export function captureLastMessage({ scenario, paths, lastMessagePath }) {
  if (lastMessagePath === null || lastMessagePath === undefined) return '';
  const expected = lastMessagePathFor(paths.attemptRoot);
  if (logical(lastMessagePath) !== logical(expected)) {
    throw new Error(`${scenario}: the host receipt names ${lastMessagePath}, not ${expected}`);
  }
  let stat;
  try {
    stat = lstatSync(lastMessagePath);
  } catch (error) {
    throw new Error(`${scenario}: the host wrote no last message at ${lastMessagePath}`, {
      cause: error,
    });
  }
  if (!stat.isFile()) {
    throw new Error(`${scenario}: the last message at ${lastMessagePath} is not a regular file`);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(lastMessagePath));
  } catch (error) {
    throw new Error(`${scenario}: the last message at ${lastMessagePath} is not UTF-8`, {
      cause: error,
    });
  }
}
