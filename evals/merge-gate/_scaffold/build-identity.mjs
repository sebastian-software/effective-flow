// The identity of the thing a run measured, computed the same way by the scaffold that provisions a
// run and by the assertions that later read its archived log.
//
// The gap this closes: an archived call log records what a run *did*, and nothing about the code it
// did it to. Left that way, `src/tools/merge-gate.md` can be restructured and the logs of runs
// against the previous text keep reporting green underneath — the suite would go on certifying a
// build nobody is running. That is the exact drift this whole layer exists to catch, reappearing in
// the evidence rather than in the subject.
//
// **What is hashed is the part of the built portable skill a run actually loads.** Two earlier
// versions were both wrong, in opposite directions. Digesting a hand-picked set of *source* files
// missed that the gate a run loads is the *output* of `build.mjs`: include resolution, the router's
// tool list, a lazy pointer's wording and the version stamp all change what runs while every listed
// source still hashes the same. Digesting the whole output fixed that but bound each run to 86
// files when a `merge-gate` run reads roughly 17, so an edit to an unrelated tool, a worker contract
// or a fragment the gate never reaches invalidated every archived round and forced a re-run that
// could produce no new information.
//
// The set is therefore derived from the built tree rather than listed: the router, the gate tool and
// the stubbed helper as seeds, plus every `shared/` fragment reachable from the gate tool's own load
// pointers, transitively. Eagerly included fragments need no entry — the build inlines them into the
// tool body, so the tool's own hash already covers them. `scripts/remote-tracker-core.mjs` is
// deliberately absent: the shipped helper imports it, but the scaffold replaces that importer with
// the stub, so no sandbox run reaches it.
//
// Deriving rather than listing keeps the set from drifting as fragments are added, and it keeps the
// property the binding exists for: any change to the text the gate itself executes still invalidates
// the evidence. What it drops is invalidation by files no run reads.
//
// **A pointer that does not resolve is fatal.** Nothing records which files a sandbox run truly
// opens, so the set is inferred; a missed route would weaken the guard with no test noticing. The
// residual is bounded by aborting the stamp when a seed or a pointed-at fragment is absent from the
// built tree, so this guard can fail loudly but never shrink quietly.
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
import { existsSync, readFileSync } from 'node:fs';
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

// The seeds of the load set: the router that dispatches the invocation, the tool body that is the
// gate itself, and the forge helper the gate calls out to — which the scaffold swaps for the stub,
// so what the run reads is the stub while what the shipped tree offers is this file. Its
// `-core.mjs` half is deliberately absent, because the swap means no run ever imports it.
const LOAD_SET_SEEDS = ['SKILL.md', 'tools/merge-gate.md', 'scripts/remote-tracker.mjs'];

// The built form of a ```lazy-include fence, as `renderLazyPointer` in build-lib.mjs emits it. The
// prefix is matched rather than the bare path so ordinary prose naming a fragment cannot enlarge
// the set by accident.
const LOAD_POINTER_RE = /\*\*Load on demand:\*\* Read `shared\/([^`\n]+)\.md`/g;

// Follows the gate tool's own load pointers through the built tree, transitively, and returns the
// relative paths a `merge-gate` run reads. Only the gate tool and the fragments it reaches are
// scanned: the router carries no pointer, and the helper is not markdown.
//
// An absent seed or an unresolvable pointer throws rather than yielding a shorter set. That is the
// whole safety property: a set one fragment short produces a perfectly plausible digest, and once
// the affected rounds have been re-stamped against it, nothing downstream can tell it from a
// legitimately narrower one — the dropped fragment is then free to drift uncovered. Failing here is
// the only place the difference is still visible.
function deriveLoadSet(skillRoot) {
  const set = new Set(LOAD_SET_SEEDS);
  for (const seed of LOAD_SET_SEEDS) {
    if (existsSync(resolve(skillRoot, seed))) continue;
    throw new Error(`load-set seed missing from the built skill at ${skillRoot}: ${seed}`);
  }
  const pending = ['tools/merge-gate.md'];
  while (pending.length > 0) {
    const current = pending.shift();
    const body = readFileSync(resolve(skillRoot, current), 'utf8');
    for (const [, name] of body.matchAll(LOAD_POINTER_RE)) {
      const fragment = `shared/${name}.md`;
      if (set.has(fragment)) continue;
      if (!existsSync(resolve(skillRoot, fragment))) {
        throw new Error(
          `load pointer in ${current} names a fragment absent from the built skill at ` +
            `${skillRoot}: ${fragment}`,
        );
      }
      set.add(fragment);
      pending.push(fragment);
    }
  }
  return [...set].sort().map((relativePath) => resolve(skillRoot, relativePath));
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
  const skill = hashFiles(deriveLoadSet(skillRoot), skillRoot);
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
