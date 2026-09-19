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
// source still hashes the same. Digesting the whole output fixed that but bound each run to files
// a `merge-gate` run cannot reach, so an edit to an unrelated tool, an unreached
// worker contract or a fragment the gate never reaches invalidated every archived round and forced a
// re-run that could produce no new information.
//
// The set is therefore derived from the built tree rather than listed: the router, the gate tool and
// the artifacts the gate delegates into as seeds, plus every `shared/` fragment reachable from any
// of those seeds' own load pointers, transitively. The delegation targets are seeds because a gate
// run reaches them — `tools/iterate.md` for a review round, and the merge-conflict-resolver and
// code-validator worker contracts — and a set that stopped at the gate tool would leave a run bound
// to a build whose delegated artifact had since changed. Membership is "can the gate reach it", not
// "did this scenario open it": a scenario that never hits a conflict still binds to the resolver,
// which is the conservative direction of the two. The seeds are the gate's own delegation surface
// and go one hop; `iterate`'s further delegations are deliberately not seeded, because seeding them
// would pull most of the built tree back in and undo the narrowing. The three cost little, since
// `iterate` shares most of the gate's fragments: the delegation seeds add only themselves and the
// further fragments unique to their reachable closures. The exact count is deliberately derived
// below because a scenario overlay can replace one seed and change that closure. Eagerly included
// fragments need no entry — the build inlines them into the tool body, so the tool's own hash already
// covers them.
// Neither `scripts/remote-tracker.mjs` nor its `-core.mjs` half is a member: `scaffold.mjs`
// overwrites that exact path in the copied tree with the stub before any run, and the stub is
// already hashed separately as the `instrument` part, so no sandbox run ever loads the shipped
// helper's content and none ever reaches the core module it imports.
//
// Deriving rather than listing keeps the set from drifting as fragments are added, and it keeps the
// property the binding exists for: any change to the text the gate itself executes still invalidates
// the evidence. What it drops is invalidation by files no run reads.
//
// **What the narrowing still costs has since been measured, and it does not argue for narrowing
// further.** Of the 12 non-merge commits that reached `origin/develop` since this layer landed in
// `364f4d0` (#399), 8 touched at least one of the 43 source files that fed the then-current 23
// built paths,
// and 6 of those 8 changed what a gate run does: the checkout inapplicability list, the
// conflict-resolution contract, the post-merge observation body, the completion invariants that
// bound the correction rounds, the base-branch derivation that decides the merge target, and a
// post-merge observation a new scenario now asserts. Only two were report-only — one touched the
// two session fragments `iterate` pulls in, the other introduced the interactive-language fragment
// the gate now inlines, changing what the gate says and nothing it does — and the exclusion weighed
// at the derivation below would have spared neither. The re-rounds this binding forces are
// therefore mostly re-rounds that were owed. Six against two is what the merge history shows,
// not a bound on the behavioural share: a squash merge folds a branch's intra-branch re-records
// away before they reach this history, so the total the operator paid is under-counted here. The
// one hidden invalidation known — #407's open-point display cap, whose fix in `3673cdd` forced the
// re-record in `32e09d2` — governs what the gate says rather than what it does, so counting it
// reads 6 to 3 and moves the share down rather than up. Which way the hidden rounds bias the share
// is therefore not knowable from this history alone.
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
// it.
//
// The release version in the same line moves for the same structural reason, one release apart
// rather than one commit apart, and pinning it is not open the way pinning the hash is: the version
// is what `tools/version.md` reports and what a release genuinely ships, so a stamp that hashed it
// away would describe a tree that was never built. So it is recorded twice instead. Beside the
// exact `skill.digest`, the stamp carries `skill.versionNeutralDigest`: the same load set, with the
// router's rendered `<semver> (<hash>)` token replaced by a fixed placeholder before hashing and
// every other byte of every other file hashed as before. Nothing about the exact digest changes —
// it stays the identity an archived run is bound by, and the top-level `digest` that `metadata.json`
// pins is still composed from it.
//
// What the second digest buys is one narrowly readable answer at comparison time. A release-please
// PR bumps `.release-please-manifest.json`, the built router changes, and every archived round's
// skill digest moves although the gate is byte-for-byte what it was — thirty re-runs owed to a
// number nobody edited, on the one pull request that must stay mergeable. The exception in
// `test/merge-gate-eval.test.mjs` is keyed to that and only that: `SKILL.md` alone may differ, the
// version-neutral digests must be equal and both present, and the instrument and scenario parts
// must still be exactly equal. A second changed file, a changed fragment, or an archived stamp from
// before this field existed fails exactly as it did before. This is deliberately narrower than "the
// version does not matter": the version still binds every run whose build differs in anything else.
//
// One property is deliberate and not worked around: a content digest cannot tell a rule from a
// comment. Rewording a comment in the gate invalidates the archived rounds exactly as a changed
// fail-closed rule would. That is the safe direction of the two, and the cheap alternative — a
// digest that decides for itself which edits matter — is a much larger thing to be wrong about than
// an occasional round re-run.
//
// The obvious lever for such an alternative was looked at and rejected, which is worth recording
// because it reads the wrong way round at first. `test/merge-gate-eval.test.mjs` pins each archived
// call to `['apply', 'at', 'cwd', 'operation', 'seq']`; the log carries no payload text whatsoever —
// no comment body, no PR title, no report line — so **no change to the text a run emits is
// observable to any assertion in this suite.** What a reworded rule can still move is which
// `operation` records appear at all, and that the suite does assert. The narrow reading looks like
// a warrant for exempting prose and is the opposite. A rule resting on it would have to treat
// essentially all prose as inert, and in a skill whose runtime is a model reading Markdown, an
// instruction's wording **is** its behaviour: the log's blindness to a reworded rule is a limit of
// the evidence, not a property of the gate. An exemption here has to fail toward invalidating, and
// one that classified edits by what the log can observe fails the other way. A marker the editing
// author sets to declare an edit prose-only is not a candidate either, since it asks the author to
// classify their own change — the judgment the digest exists in order not to depend on. **No
// mechanism is adopted; the re-run stands.**

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { scenarioSetup } from './configured-reviewer-scenario.mjs';

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
// The membership rule is "would a change here change what the run did", which is why the round
// coordinator and this file are absent. Neither is read during a run — one prepares and seals the
// isolated attempts, the other only computes this digest — and changing what this file hashes
// already shows up as a changed digest without hashing the hasher itself.
//
// `configured-reviewer-scenario.mjs` is a member for every scenario, not only the one it configures:
// the scaffold asks it which project-setup rows and which `iterate` overlay each slot receives, so a
// change there can change what any run sees. The echo it selects — `iterate-echo.md` and
// `iterate-trace.mjs` — is deliberately not an instrument file: it is copied into the slot's skill
// tree and hashed there, at the paths the run executes, as part of `skill`.
const INSTRUMENT_FILES = [
  resolve(import.meta.dirname, 'remote-tracker.mjs'),
  resolve(import.meta.dirname, 'sandbox.mjs'),
  resolve(import.meta.dirname, 'scaffold.mjs'),
  resolve(import.meta.dirname, 'prompt.mjs'),
  resolve(import.meta.dirname, 'suite.mjs'),
  resolve(import.meta.dirname, 'configured-reviewer-scenario.mjs'),
];

export function digestOf(content) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

export function digestFile(path) {
  return digestOf(readFileSync(path));
}

// The seeds of the load set: the router that dispatches the invocation, the tool body that is the
// gate itself, and the three artifacts the gate delegates into — the `iterate` workflow it hands a
// review round to, and the two worker contracts it can select. `scripts/remote-tracker.mjs` is
// deliberately absent, together with its `-core.mjs` half: `scaffold.mjs` replaces that path in the
// copied tree with the stub, which is hashed as the `instrument` part instead, so a run loads
// neither the shipped helper nor the module it imports.
const LOAD_SET_SEEDS = [
  'SKILL.md',
  'tools/merge-gate.md',
  'tools/iterate.md',
  'workers/effective-flow-merge-conflict-resolver.md',
  'workers/effective-flow-code-validator.md',
];

const ITERATE_ECHO_SOURCE = resolve(import.meta.dirname, 'iterate-echo.md');
const ITERATE_TRACE_SOURCE = resolve(import.meta.dirname, 'iterate-trace.mjs');
const ITERATE_TRACE_SKILL_PATH = 'scripts/iterate-trace.mjs';

// Apply the exact overlay a scenario executes to a copied skill tree. The echo replaces the
// production `tools/iterate.md` seed rather than being hashed beside it, and its trace helper is an
// additional seed because the replacement explicitly executes it. Both files therefore appear
// once in `skill.files`, at their sandbox paths, and never again under `instrument.files`.
//
// It mutates the tree it is given, so it is applied only to a slot's own skill copy (by
// `scaffold.mjs`) or to a throwaway copy (by `pristineScenarioBuildIdentity`) — never to a round's
// shared build, which every other scenario's slots are copied from.
export function applyScenarioSkillOverlay(scenario, skillRoot) {
  const setup = scenarioSetup(scenario);
  if (!setup.iterateEcho) return setup;
  for (const source of [ITERATE_ECHO_SOURCE, ITERATE_TRACE_SOURCE]) {
    if (!existsSync(source))
      throw new Error(`${scenario}: iterate echo source missing at ${source}`);
  }
  copyFileSync(ITERATE_ECHO_SOURCE, resolve(skillRoot, 'tools', 'iterate.md'));
  copyFileSync(ITERATE_TRACE_SOURCE, resolve(skillRoot, ITERATE_TRACE_SKILL_PATH));
  return setup;
}

// The built form of a ```lazy-include fence, as `renderLazyPointer` in build-lib.mjs emits it. The
// prefix is matched rather than the bare path so ordinary prose naming a fragment cannot enlarge
// the set by accident.
//
// **A conditional pointer widens the set unconditionally, and that is the decision rather than an
// oversight.** The membership rule stated at the top of this file settles it: "can the gate reach
// it", not "did this scenario open it". Excluding the `de` branch means separating pointers by
// which branch the scenarios take — the rejected half of that rule wearing a different hat — and it
// would cost much of the set, the merge-conflict resolver included, which is a member for precisely
// the reason the `de` branch is. That is the permissive direction, the one failure this file exists
// to make impossible. A conditional pointer is not a special case needing its own justification; it
// is an ordinary consequence of the rule already stated.
//
// A second obstacle stands independently of that. `renderLazyPointer` renders the fence's `when:`
// clause as free-form English, so what lands in the built tree reads **Load on demand:** Read
// `shared/x.md`, when <trigger>, with no predicate to test a scenario against.
// `shared/chat-language.md`, the eager fragment every speaking tool carries, holds one of each kind
// side by side: `config-migration` under a clause a run does reach — `when: the project setup ADR
// must be located to read the configured language.chat value` — and `typography-rules` under
// `when: the resolved chat language is de`, which no scenario takes. A blanket "skip conditional
// pointers" rule cannot tell those apart and drops `shared/config-migration.md`, a fragment runs
// genuinely load. A machine-readable condition key on the fence would parse the clause and settle
// nothing: the question is which membership rule is wanted, not whether the condition can be read.
//
// The narrow version — an exclusion keyed to this pointer alone — would remove
// `shared/typography-rules.md`, touched exactly once in this repository's history (`21466f1`,
// #395), and before this eval layer existed, so no archived round has ever been invalidated by it.
// That figure does not carry to the broader criterion, which is rejected on the membership rule and
// not for buying nothing: inside this closure `19ef541` (#409) touched only
// `base-branch-resolution` and `worktree-integration`, both feeding the one built path
// `shared/worktree-integration.md`, which a run reaches only on a `BEHIND` or `DIRTY` head branch —
// a re-round scenario reachability would have spared.
const LOAD_POINTER_RE = /\*\*Load on demand:\*\* Read `shared\/([^`\n]+)\.md`/g;

// Follows the seeds' own load pointers through the built tree, transitively, and returns the
// relative paths a `merge-gate` run reads. Every seed is scanned rather than the gate tool alone:
// each is markdown now that the helper is not a seed, and a delegation target carries load pointers
// of its own.
//
// An absent seed or an unresolvable pointer throws rather than yielding a shorter set. That is the
// whole safety property: a set one fragment short produces a perfectly plausible digest, and once
// the affected rounds have been re-stamped against it, nothing downstream can tell it from a
// legitimately narrower one — the dropped fragment is then free to drift uncovered. Failing here is
// the only place the difference is still visible.
function deriveLoadSet(skillRoot, iterateEcho = false) {
  const seeds = iterateEcho ? [...LOAD_SET_SEEDS, ITERATE_TRACE_SKILL_PATH] : LOAD_SET_SEEDS;
  const set = new Set(seeds);
  for (const seed of seeds) {
    if (existsSync(resolve(skillRoot, seed))) continue;
    throw new Error(`load-set seed missing from the built skill at ${skillRoot}: ${seed}`);
  }
  const pending = [...seeds];
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

function canonicalDigest(files) {
  return digestOf(
    Object.keys(files)
      .sort()
      .map((name) => `${name} ${files[name]}`)
      .join('\n'),
  );
}

// Paths are recorded relative to the tree's own root, so the digest describes the skill rather than
// where a particular checkout — or a particular throwaway build root — happens to keep it.
function hashFiles(paths, root) {
  const files = {};
  for (const path of paths) files[relative(root, path)] = digestOf(readFileSync(path));
  return { digest: canonicalDigest(files), files };
}

// The only load-set member that carries the version stamp. `tools/version.md` renders the same
// `{{VERSION}}` placeholder and deliberately stays out of this: the gate never loads it, so it is
// not a member of the set and needs no neutral form.
const VERSION_STAMPED_FILE = 'SKILL.md';

// The rendered form `build.mjs` writes for `{{VERSION}}` — the manifest semver, a space, and the
// parenthesised build hash — matched only where the router's own prose introduces it. The whole
// token is normalised rather than the digits alone: an eval build pins the hash to a marker, but a
// stamp is read back against whatever a later build wrote there, and a neutral digest that still
// carried a hash would be neutral in name only.
//
// Anchoring on the introducing word costs nothing and fails in the safe direction. A future router
// that stamps the version somewhere this pattern does not reach keeps that occurrence in the
// hashed bytes, so a release bump would once again invalidate the rounds — loudly, and exactly as
// it does today. Matching a bare semver anywhere in the file would fail the other way, quietly
// hashing away an edit to any prose that happened to name one.
const RENDERED_VERSION_RE = /(\bversion )\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)? \([^()\s]+\)/g;
const VERSION_REPLACEMENT = '$1<version>';

export function builtSkillIdentity(skillRoot, { iterateEcho = false } = {}) {
  if (!existsSync(skillRoot)) throw new Error(`no built skill at ${skillRoot}`);
  const { digest, files } = hashFiles(deriveLoadSet(skillRoot, iterateEcho), skillRoot);
  const routerPath = resolve(skillRoot, VERSION_STAMPED_FILE);
  const body = readFileSync(routerPath, 'utf8');
  const neutralBody = body.replace(RENDERED_VERSION_RE, VERSION_REPLACEMENT);
  // Same reasoning as an unresolvable load pointer: a neutral digest that silently neutralised
  // nothing is indistinguishable from a working one until a release bump invalidates every round,
  // and by then the stamps carrying it are already committed. Failing here is where the difference
  // is still visible.
  if (neutralBody === body) {
    throw new Error(
      `the built router at ${routerPath} carries no rendered version token, so no ` +
        'version-neutral skill digest can be computed',
    );
  }
  const neutralFiles = { ...files, [VERSION_STAMPED_FILE]: digestOf(neutralBody) };
  return { digest, versionNeutralDigest: canonicalDigest(neutralFiles), files };
}

function changedSkillFiles(archived, current) {
  const before = archived?.files ?? {};
  const after = current?.files ?? {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort()
    .filter((name) => before[name] !== after[name]);
}

// The one accepted difference between an archived stamp and a fresh identity: a release bumped the
// version the router prints and moved nothing else. Every other part stays exact, so this cannot
// widen into a general "the skill changed" waiver — the scenario, the instrument, and the scenario
// inputs are compared whole, and within the skill only `SKILL.md` may have moved.
//
// Both sides must carry a version-neutral digest. A stamp written before the field existed is
// rejected rather than treated as unconstrained: absence is not evidence of sameness, and the
// stamps that predate it were migrated in place only because their exact digests still matched.
export function isVersionStampOnlyPredecessor(stamp, identity) {
  if (!stamp || !identity) return false;
  if (stamp.scenario !== identity.scenario) return false;
  if (!isDeepStrictEqual(stamp.instrument, identity.instrument)) return false;
  if (!isDeepStrictEqual(stamp.scenario_inputs, identity.scenario_inputs)) return false;
  const archived = stamp.skill;
  const current = identity.skill;
  if (typeof archived?.versionNeutralDigest !== 'string') return false;
  if (typeof current?.versionNeutralDigest !== 'string') return false;
  if (archived.versionNeutralDigest !== current.versionNeutralDigest) return false;
  const moved = changedSkillFiles(archived, current);
  return moved.length === 1 && moved[0] === VERSION_STAMPED_FILE;
}

export function instrumentIdentity() {
  return hashFiles(INSTRUMENT_FILES, REPOSITORY_ROOT);
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
//
// It hashes the tree exactly as it finds it and never applies an overlay itself: sealing and
// publication recompute a slot's identity from that slot's skill copy, and re-applying the echo
// there would overwrite whatever a run changed and hide it. A scenario whose setup requires the
// echo therefore fails on a tree without one — the trace helper is a load-set seed — rather than
// describing the production `iterate` it never ran. Use `pristineScenarioBuildIdentity` for a
// round build or a fresh build that has not been overlaid.
export function scenarioBuildIdentity(scenario, skillRoot) {
  if (!existsSync(skillRoot)) throw new Error(`no built skill at ${skillRoot}`);
  const setup = scenarioSetup(scenario);
  const skill = builtSkillIdentity(skillRoot, { iterateEcho: setup.iterateEcho });
  const instrument = instrumentIdentity();
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

// The identity a slot of `scenario` will have once provisioned from the pristine build at
// `builtSkillRoot`. Scenarios without an overlay hash the build directly; the configured-reviewer
// scenario hashes a throwaway overlaid copy, so asking for its identity never leaks the echo into
// the shared build every other scenario is provisioned from.
export function pristineScenarioBuildIdentity(scenario, builtSkillRoot) {
  if (!existsSync(builtSkillRoot)) throw new Error(`no built skill at ${builtSkillRoot}`);
  if (!scenarioSetup(scenario).iterateEcho) return scenarioBuildIdentity(scenario, builtSkillRoot);
  const scratch = mkdtempSync(resolve(tmpdir(), 'effective-flow-eval-identity-'));
  try {
    const skillRoot = resolve(scratch, 'skill');
    cpSync(builtSkillRoot, skillRoot, { recursive: true });
    applyScenarioSkillOverlay(scenario, skillRoot);
    return scenarioBuildIdentity(scenario, skillRoot);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
