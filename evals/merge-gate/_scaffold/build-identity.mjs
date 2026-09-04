// The identity of the thing a run measured, computed the same way by the scaffold that provisions a
// run and by the assertions that later read its archived log.
//
// The gap this closes: an archived call log records what a run *did*, and nothing about the code it
// did it to. Left that way, `src/tools/merge-gate.md` can be restructured and the logs of runs
// against the previous text keep reporting green underneath — the suite would go on certifying a
// build nobody is running. That is the exact drift this whole layer exists to catch, reappearing in
// the evidence rather than in the subject.
//
// **What is hashed is the built portable skill, not the sources it came from.** An earlier version
// digested a derived set of source files instead, and that was wrong in a way worth recording: the
// gate a run loads is the *output* of `build.mjs`, so a change in the build itself — include
// resolution, the router's tool list, a lazy pointer's wording, the version stamp — changes what
// runs while every hand-picked source file still hashes the same. Hashing the output covers every
// input by construction, including the ones nobody thought to list, which is the only version of
// this guard that cannot be quietly outgrown.
//
// A run's identity therefore has three parts, and all three have to hold for an archived log to
// mean anything:
//
//   * **the built skill** — the portable tree the scaffold copies into the sandbox;
//   * **the instrument** — the stub that answers the run and the scaffold that configures it, which
//     are what turn that tree into a measurement;
//   * **the scenario** — the fixture and the prompt, which decide what was measured.
//
// Every caller builds before it hashes, so what gets hashed is a fresh build by construction rather
// than by assumption. Where that build lands differs on purpose: the scaffold builds into the
// checkout's own `dist/`, because it copies the tree from there, while the assertions build into a
// throwaway root of their own. `build.mjs` swaps through fixed `dist.tmp` and `dist.bak` paths, so
// two concurrent builds of one checkout collide and one dies mid-rename — and `pnpm test` runs its
// files concurrently, with more than one needing a build. Isolating the test's build is what keeps
// that from surfacing as an unreproducible failure in whichever file lost the race.
//
// Every eval build pins the cosmetic git hash that `build.mjs` otherwise stamps into the router's
// version line. Without that pin the identity is self-defeating rather than merely noisy: the hash
// changes with every commit, so the commit that records a round's evidence changes the build that
// evidence describes, and an archived run could never match a fresh build at the commit containing
// it. What is pinned is metadata the build itself calls cosmetic — the version number still moves
// with a release, which genuinely does change the shipped skill.
//
// One property is deliberate and not worked around: a content digest cannot tell a rule from a
// comment. Rewording a comment in the gate invalidates the archived rounds exactly as a changed
// fail-closed rule would. That is the safe direction of the two, and the cheap alternative — a
// digest that decides for itself which edits matter — is a much larger thing to be wrong about than
// an occasional round re-run.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import process from 'node:process';
import { relative, resolve } from 'node:path';

const SUITE_ROOT = resolve(import.meta.dirname, '..');
const REPOSITORY_ROOT = resolve(SUITE_ROOT, '..', '..');

// A marker rather than a plausible hash, so a tree built for an eval cannot be mistaken for one
// built for release if it ever escapes the sandbox.
const EVAL_GIT_HASH = 'eval';

// The stub replaces `scripts/remote-tracker.mjs` inside the copied tree, the scaffold writes the
// configuration ADR the gate reads, and `sandbox.mjs` decides where all of it lands — including the
// call log the stub writes and the literal paths the prompt hands the agent. Together with the built
// tree they determine the sandbox exactly, so they are hashed beside it rather than folded into it:
// a mismatch should be able to say whether the gate moved or the bench did.
//
// The membership rule is "would a change here change what the run did", which is why `prepare.mjs`
// and this file are absent. Neither is read during a run — one archives afterwards, the other only
// computes this digest, and changing what it hashes already shows up as a changed digest without
// hashing itself.
const INSTRUMENT_FILES = [
  resolve(import.meta.dirname, 'remote-tracker.mjs'),
  resolve(import.meta.dirname, 'sandbox.mjs'),
  resolve(import.meta.dirname, 'scaffold.mjs'),
];

function digestOf(content) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function walk(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else found.push(path);
  }
  return found;
}

// Paths are recorded relative to the tree's own root, so the digest describes the skill rather than
// where a particular checkout — or a particular throwaway build root — happens to keep it.
function hashFiles(paths, root) {
  const files = {};
  for (const path of paths) files[relative(root, path)] = digestOf(readFileSync(path));
  const canonical = Object.keys(files)
    .sort()
    .map((name) => `${name} ${files[name]}`)
    .join('\n');
  return { digest: digestOf(canonical), files };
}

export function portableSkillRoot(outputRoot) {
  return resolve(outputRoot, 'dist', 'portable', 'effective-flow');
}

// Runs `node build.mjs` into a root of the caller's choosing, so a caller hashes what the current
// sources produce rather than whatever an earlier build left in a gitignored directory. The root is
// required, not defaulted to the checkout's own `dist/`: every caller here builds a pinned-hash tree
// that must not be mistaken for the checkout's real build, and two builds sharing a destination
// collide on `build.mjs`'s fixed swap paths anyway.
export function buildPortableSkill(outputRoot) {
  execFileSync(process.execPath, ['build.mjs'], {
    cwd: REPOSITORY_ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: {
      ...process.env,
      EFFECTIVE_FLOW_BUILD_OUTPUT_ROOT: outputRoot,
      EFFECTIVE_FLOW_BUILD_GIT_HASH: EVAL_GIT_HASH,
    },
  });
  const root = portableSkillRoot(outputRoot);
  if (!existsSync(root)) throw new Error(`\`node build.mjs\` produced no skill root at ${root}`);
  return root;
}

// Takes the built tree to hash rather than finding one, so a caller cannot accidentally describe a
// run with a stale `dist/` it never built. Returns the three parts separately as well as combined,
// so a mismatch can name which one moved before naming the files.
export function scenarioBuildIdentity(scenario, skillRoot) {
  if (!existsSync(skillRoot)) throw new Error(`no built skill at ${skillRoot}`);
  const skill = hashFiles(walk(skillRoot), skillRoot);
  const instrument = hashFiles(INSTRUMENT_FILES, REPOSITORY_ROOT);
  const scenarioInputs = hashFiles(
    [
      resolve(SUITE_ROOT, 'fixtures', `${scenario}.json`),
      resolve(SUITE_ROOT, 'scenarios', `${scenario}.md`),
    ],
    REPOSITORY_ROOT,
  );
  return {
    scenario,
    digest: digestOf([skill.digest, instrument.digest, scenarioInputs.digest].join('\n')),
    skill,
    instrument,
    scenario_inputs: scenarioInputs,
  };
}
