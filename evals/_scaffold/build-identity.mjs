// The identity of the thing a run measured, computed the same way by the scaffold that provisions a
// run and by the assertions that later read its archived log.
//
// It is shared by every behavioural eval suite and knows none of them. What a suite loads, which
// files are its instrument, which scenario carries a skill overlay and which archived instrument
// digest its one legacy waiver accepts are all read from the suite configuration handed in as
// `suite`; nothing here names a tool. The commentary below is written from `merge-gate`, the first
// suite, because that is where every one of these rules was decided.
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
// The set is therefore derived from the built tree rather than listed: the router, the gate tool,
// the artifacts the gate delegates into and the runtime helper it executes as seeds, plus every
// `shared/` fragment reachable from any of those seeds' own load pointers, transitively. The delegation targets are seeds because a gate
// run reaches them — `tools/iterate.md` for a review round, and the merge-conflict-resolver and
// code-validator worker contracts — and a set that stopped at the gate tool would leave a run bound
// to a build whose delegated artifact had since changed. Membership is "can the gate reach it", not
// "did this scenario open it": a scenario that never hits a conflict still binds to the resolver,
// which is the conservative direction of the two. The delegation seeds are the gate's own
// delegation surface and go one hop; `iterate`'s further delegations are deliberately not seeded, because seeding them
// would pull most of the built tree back in and undo the narrowing. The three cost little, since
// `iterate` shares most of the gate's fragments: the delegation seeds add only themselves and the
// further fragments unique to their reachable closures. The exact count is deliberately derived
// below because a scenario overlay can replace one seed and change that closure. Eagerly included
// fragments need no entry — the build inlines them into the tool body, so the tool's own hash already
// covers them. A runtime script the gate *executes* is the opposite case and does need one: nothing
// inlines it and no pointer names it, so `scripts/delegation-envelope.mjs` and its `-core.mjs` half
// are seeded explicitly beside the delegation targets.
// Neither `scripts/remote-tracker.mjs` nor its `-core.mjs` half is a member: `scaffold.mjs`
// overwrites that exact path in the copied tree with the stub before any run, and the stub is
// already hashed separately as the `instrument` part, so no sandbox run ever loads the shipped
// helper's content and none ever reaches the core module it imports. That exclusion turns on the
// stub, not on the file extension — the envelope helper carries no stub and is hashed as shipped.
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
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..', '..');

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
// `merge-gate`'s `configured-reviewer-scenario.mjs` is a member for every scenario, not only the one
// it configures: the scaffold asks it which project-setup rows and which `iterate` overlay each slot
// receives, so a change there can change what any run sees. The echo it selects — `iterate-echo.md`
// and `iterate-trace.mjs` — is deliberately not an instrument file: it is copied into the slot's
// skill tree and hashed there, at the paths the run executes, as part of `skill`.
//
// The list itself is `suite.instrumentFiles`, declared by each suite beside the modules it names,
// and a suite's own configuration file is a member of it. The set it declares is already visible in
// the digest that set produces, but the *selection* is not: `scenarioSetup`, `projectDocuments`, the
// tracker stub and the overlay are bound there, and re-pointing one of them changes what every slot
// sees while every file the digest covers stays byte-identical.
//
// What stays out is the scenario registry, which each suite therefore keeps in a module of its own
// (`scenario-registry.mjs`) rather than in its configuration. A list of names is the one declaration
// no run reads, and hashing it costs every archived round of every other scenario a re-record per
// name added. `validateSuite` holds both halves — the configuration hashed, the registry not — since
// either half alone is defeated by moving a binding into the unhashed module.

export function digestOf(content) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

export function digestFile(path) {
  return digestOf(readFileSync(path));
}

// The seeds of the load set are `suite.loadSetSeeds`, and why a given suite seeds what it seeds is
// that suite's own rationale — `evals/merge-gate/suite.config.mjs` carries it for the gate. Two
// rules are this module's, because no suite can state them for itself:
//
// A seed added, removed or re-pointed changes the derived set, so it changes `skill.files` and the
// skill digest with it, quite apart from the declaring file now being hashed. That makes the seed
// list doubly self-enforcing — which is exactly why the one shape that escapes it needs its own
// guard.
//
// **A collapse to nothing escapes it, which is why `deriveLoadSet` refuses an empty seed list.**
// Self-enforcement rests on a shorter set producing a *different* digest, and a set of zero files
// still produces a perfectly well-formed one. A suite whose seeds resolved empty would bind every
// archived run to no files at all, and `verify` would report it current forever while the sources
// moved underneath. The same holds for `instrumentIdentity` and an empty `suite.instrumentFiles`.

// Apply the exact overlay a scenario executes to a copied skill tree. For `merge-gate`'s one
// overlaid scenario the echo replaces the production `tools/iterate.md` seed rather than being
// hashed beside it, and its trace helper is an additional seed because the replacement explicitly
// executes it. Both files therefore appear once in `skill.files`, at their sandbox paths, and never
// again under `instrument.files`.
//
// It mutates the tree it is given, so it is applied only to a slot's own skill copy (by
// `scaffold.mjs`) or to a throwaway copy (by `pristineScenarioBuildIdentity`) — never to a round's
// shared build, which every other scenario's slots are copied from.
export function applyScenarioSkillOverlay(suite, scenario, skillRoot) {
  if (!suite.overlay.applies(scenario)) return false;
  suite.overlay.apply(scenario, skillRoot);
  return true;
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
// relative paths a `merge-gate` run reads. Every seed is scanned rather than the gate tool alone,
// because a delegation target carries load pointers of its own. The `.mjs` seeds are scanned with
// the rest and contribute nothing — JavaScript carries no load pointer — which is cheaper than a
// per-seed exemption that would have to be kept in step with which seeds are markdown.
//
// An absent seed or an unresolvable pointer throws rather than yielding a shorter set. That is the
// whole safety property: a set one fragment short produces a perfectly plausible digest, and once
// the affected rounds have been re-stamped against it, nothing downstream can tell it from a
// legitimately narrower one — the dropped fragment is then free to drift uncovered. Failing here is
// the only place the difference is still visible.
function deriveLoadSet(skillRoot, seeds) {
  // Zero seeds is the one shape the checks below cannot catch: there is no missing seed and no
  // unresolvable pointer, only an empty set that hashes to a plausible digest of nothing. It is the
  // loudest possible failure here and an undetectable one two steps later.
  if (seeds.length === 0) {
    throw new Error(`the suite declares no load-set seeds, so no skill identity can be computed`);
  }
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

// The one generated line `build.mjs` stamps `{{VERSION}}` into, matched as a whole rather than by
// the version token alone. `src/SKILL.md` writes it as ``… invoked via `{{FLOW}} <tool>` (version
// {{VERSION}}).``, and the build substitutes the harness-specific invocation for `{{FLOW}}` and the
// manifest semver plus the parenthesised build hash for `{{VERSION}}`. The pattern therefore anchors
// on the surrounding generated text — the closing `` `<tool>` `` of the invocation, the ` (version `
// that introduces the stamp, and the `).` that closes the sentence — and only the FLOW value inside
// the backticks is left open, because it is the one part of the line that legitimately differs
// between the three built targets. The whole version token is normalised rather than the digits
// alone: an eval build pins the hash to a marker, but a stamp is read back against whatever a later
// build wrote there, and a neutral digest that still carried a hash would be neutral in name only.
//
// **Matching the exact line, exactly once, is what keeps the neutralisation from laundering an
// edit.** A looser pattern anchored merely on the introducing word matches any prose shaped like
// `version <semver> (<token>)`, everywhere in the router. Today the router carries one such phrase,
// so the loose form and this one agree byte for byte; but the moment a second one appears — a new
// instruction that happens to name a version this way — a loose global replacement erases *that*
// phrase from the neutral body too, and an edit confined to it leaves the neutral digest untouched.
// `isVersionStampOnlyPredecessor` would then waive the archived round as a release-only bump
// although the instruction the gate executes had changed: exactly the drift this whole file exists
// to make impossible. Requiring one match closes that by refusing to guess which occurrence is the
// stamp.
//
// Both failure directions therefore abort rather than produce a digest. Zero matches means the
// router no longer carries the generated line this pattern describes — the version may have moved
// somewhere else, or the sentence may have been restructured — and a neutral digest that
// neutralised nothing is indistinguishable from a working one until the next release bump
// invalidates every round at once. Two or more means the line is no longer unique, so there is no
// unambiguous stamp to replace. Failing loudly in both cases is the same safe direction the
// unresolvable-load-pointer guard takes: a wrong neutral digest is silent and durable, a throw is
// neither.
//
// Prose elsewhere in the router that names a version is now simply hashed, in the neutral body as
// in the exact one. That is the conservative outcome: such an edit invalidates the archived rounds
// — loudly, and exactly as any other router edit does — instead of being waived.
const RENDERED_VERSION_RE =
  /(`[^`\n]+ <tool>` \(version )\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)? \([^()\s]+\)(\)\.)$/gm;
const VERSION_REPLACEMENT = '$1<version>$2';

export function builtSkillIdentity(skillRoot, seeds) {
  if (!existsSync(skillRoot)) throw new Error(`no built skill at ${skillRoot}`);
  const { digest, files } = hashFiles(deriveLoadSet(skillRoot, seeds), skillRoot);
  // The neutral body below replaces this file's entry in a copy of the exact set, so the file has
  // to be in that set. If it is not, `neutralFiles` gains a member the exact digest never covered,
  // and the two digests then describe different file sets — with `isVersionStampOnlyPredecessor`
  // waiving an archived round on the strength of the wider one. A suite that does not load the
  // router has no version stamp to neutralise and must say so by failing here rather than by
  // silently acquiring one.
  if (!Object.hasOwn(files, VERSION_STAMPED_FILE)) {
    throw new Error(
      `${VERSION_STAMPED_FILE} is not in the derived load set at ${skillRoot}, so the ` +
        'version-neutral skill digest would cover a file the exact digest does not',
    );
  }
  const routerPath = resolve(skillRoot, VERSION_STAMPED_FILE);
  const body = readFileSync(routerPath, 'utf8');
  // Counted before replacing, because a global replacement cannot report how many occurrences it
  // consumed and both off-by-one directions have to abort. Same reasoning as an unresolvable load
  // pointer: a neutral digest that neutralised nothing — or neutralised the wrong occurrence along
  // with the stamp — is indistinguishable from a working one until a release bump invalidates every
  // round, and by then the stamps carrying it are already committed. Failing here is where the
  // difference is still visible.
  const stamps = [...body.matchAll(RENDERED_VERSION_RE)];
  if (stamps.length === 0) {
    throw new Error(
      `the built router at ${routerPath} carries no rendered version token, so no ` +
        'version-neutral skill digest can be computed',
    );
  }
  if (stamps.length > 1) {
    throw new Error(
      `the built router at ${routerPath} carries ${stamps.length} rendered version tokens, so ` +
        'no unambiguous version-neutral skill digest can be computed',
    );
  }
  const neutralBody = body.replace(RENDERED_VERSION_RE, VERSION_REPLACEMENT);
  const neutralFiles = { ...files, [VERSION_STAMPED_FILE]: digestOf(neutralBody) };
  return { digest, versionNeutralDigest: canonicalDigest(neutralFiles), files };
}

// The files that differ between one part of an archived stamp and the same part of a fresh
// identity, named rather than counted. Both sides are defaulted, so a part that is absent on one
// side reads as "every file moved" instead of throwing — an archived stamp written before a part
// existed is a legitimate input here, and the caller decides what to do about it.
function changedFiles(archivedPart, currentPart) {
  const before = archivedPart?.files ?? {};
  const after = currentPart?.files ?? {};
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
  const moved = changedFiles(archived, current);
  return moved.length === 1 && moved[0] === VERSION_STAMPED_FILE;
}

// Which files moved, named rather than counted, across all three parts of the stamp. A digest
// mismatch says only that the run observed something else; this says what, which is the difference
// between an operator re-running a round on purpose and one re-running it because a number changed
// and they could not see why. Naming the part first matters too: "the built skill moved" and "the
// stub moved" call for different reactions, and only one of them is a change to the gate.
const IDENTITY_PARTS = ['skill', 'instrument', 'scenario_inputs'];

// A change to `build.mjs` can move every file in the built tree at once, and a stamp written before
// a part existed reads as though the whole part appeared. Either way the list runs to dozens of lines
// per run and dozens more per further run, which buries the one line a reader needs. Past a handful
// the count is the information, so the rest is summarised rather than printed.
const DRIFT_LIST_LIMIT = 8;

function describeDrift(archived, current) {
  const lines = [];
  for (const part of IDENTITY_PARTS) {
    const before = archived[part]?.files ?? {};
    const after = current[part].files;
    const names = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    const moved = names.filter((name) => before[name] !== after[name]);
    if (moved.length === 0) continue;
    lines.push(`  ${part}: ${moved.length} file(s)`);
    for (const name of moved.slice(0, DRIFT_LIST_LIMIT)) {
      if (before[name] === undefined) lines.push(`    + ${name} (not part of the run)`);
      else if (after[name] === undefined) lines.push(`    - ${name} (gone from the build)`);
      else lines.push(`    ~ ${name}`);
    }
    if (moved.length > DRIFT_LIST_LIMIT) {
      lines.push(`    … and ${moved.length - DRIFT_LIST_LIMIT} more`);
    }
  }
  return lines;
}

// One generation of compatibility, scoped to the four fixtures whose call-log schema stayed
// byte-for-byte legacy. The sequenced Phase-4 fixture needs completion evidence and can never use
// this exception. Every other identity part and instrument file remains exact, so this cannot turn
// into a general "instrument changed" waiver.
//
// **Living in shipped scaffold code does not make it permanent.** This waiver was written in
// `test/merge-gate-eval.test.mjs` and moved here when a second and third caller appeared, and a
// relocation is exactly the kind of change that quietly promotes a deliberately temporary exception
// into a standing rule: nothing about a file under `_scaffold/` says "one generation" the way a
// test case did. It still means one generation. A suite's `legacyInstrumentWaiver` carries a
// hardcoded digest of one superseded stub, so the waiver stops applying on its own the moment the
// rounds carrying that digest are re-recorded — and the correct response to it firing on a corpus
// nobody recognises is to delete this function and that declaration, not to add a second digest
// beside them.
//
// **As of this commit the waiver has no subject.** Every one of the thirty archived stamps under
// `evals/merge-gate/results/` carries the current instrument digest; the predecessor digest the
// suite declares appears in none of them, so this function cannot fire on the corpus that ships. The deletion the
// paragraph above calls for is therefore already available and deliberately not taken here: this
// change moved the waiver, it did not decide its end of life, and removing it belongs to the change
// that says so in its own right. Re-check the corpus before deleting — a round re-recorded from an
// older checkout could reintroduce the digest — and delete the function, the constant and their
// unit tests together when it is still absent.
export function isCompatibleLegacyInstrumentPredecessor(suite, scenario, stamp, identity) {
  const waiver = suite.legacyInstrumentWaiver;
  if (!waiver) return false;
  return (
    !waiver.excludedScenarios.includes(scenario) &&
    isDeepStrictEqual(stamp.skill, identity.skill) &&
    isDeepStrictEqual(stamp.scenario_inputs, identity.scenario_inputs) &&
    stamp.instrument?.digest === waiver.predecessorInstrumentDigest &&
    changedFiles(stamp.instrument, identity.instrument).length === 1 &&
    changedFiles(stamp.instrument, identity.instrument)[0] === waiver.trackerStubPath
  );
}

// The single answer to "does this archived stamp still describe the working tree" **for the callers
// that report on a corpus**: `verifyFreshness` in `round-core.mjs` and, through it,
// `pnpm eval <tool> verify`, which owns the question for CI. It was written as three helpers in
// `test/merge-gate-eval.test.mjs`, beside the per-scenario assertion that used to ask it on every
// pull request; when that assertion moved out, the rule moved here, beside the identity code it is
// about, rather than into the one caller that was left.
//
// **Publication deliberately does not read it.** `ensureCanonicalGeneration` hands
// `expectedBuildIdentity` to `evaluateEvidence`, which compares the two identities part by part and
// waives only the version stamp: no legacy-instrument waiver, and no shortcut through the combined
// `digest`. That rule is strictly stricter than this one, so the honest count is two
// implementations rather than one — a real cost, kept on purpose. A report describes a corpus that
// already exists and may legitimately carry one generation of accepted difference; a publication
// decides what the corpus *becomes*, and every run it writes has to bind to the round manifest
// exactly, or a later reader cannot tell which build the archived evidence observed. Unifying the
// two would not remove a copy, it would loosen publication.
//
// The two therefore disagree in exactly one case, and it is a known one: a predecessor accepted
// here under the `legacy-instrument` waiver is `waived` by `verify` and passes `--mode strict`,
// while `publishRound` refuses the same unit. Any further divergence is a bug in one of them; that
// one is the designed difference.
//
// It **reports** rather than asserting, because its callers disagree about what a stale verdict
// means: a release gate fails on it and a report prints it and exits 0. Returning a state keeps
// that decision with the caller and the rule here.
//
// The four states are deliberately distinct **as per-run verdicts**, which is the only thing this
// function produces. `missing-stamp` is not a flavour of `stale`: a stale stamp is a real
// observation of a build that has since moved, while a missing one is a log sitting in `results/`
// that looks like evidence and cannot be read as any, and a run must not report the second as the
// first. What a caller does when it rolls thirty run verdicts into one scenario line is its own
// decision — `scenarioFreshness` folds both into `stale` there, and says why — and no claim here
// binds it. `waived` names which waiver fired, so a reader is never left to guess why a differing
// digest was accepted.
export function freshnessVerdict(suite, scenario, stamp, identity) {
  if (!stamp) return { state: 'missing-stamp' };
  if (stamp.digest === identity.digest) return { state: 'current' };
  if (isCompatibleLegacyInstrumentPredecessor(suite, scenario, stamp, identity)) {
    return { state: 'waived', waiver: 'legacy-instrument' };
  }
  // The release bump, and nothing else. A release-please pull request rewrites
  // `.release-please-manifest.json`, `build.mjs` stamps the new number into the router, and the
  // skill digest of every archived round moves although the gate is the same text it was. Without
  // this the one pull request that must stay mergeable is the one that can never be green, and the
  // owed work would be thirty re-runs that could produce no new information — the same "re-run that
  // buys nothing" the derived load set exists to avoid, arriving through the version line instead
  // of through an unreachable fragment.
  //
  // It is narrow by construction, not by promise: `isVersionStampOnlyPredecessor` accepts only a
  // stamp whose instrument and scenario parts are exactly equal, whose sole moved skill file is
  // `SKILL.md`, and whose version-neutral digest — present on both sides — matches. Anything the
  // version token does not explain still moves that digest, so a reworded rule inside `SKILL.md`
  // fails here exactly as it did before, and so does a stamp written before the field existed.
  if (isVersionStampOnlyPredecessor(stamp, identity)) {
    return { state: 'waived', waiver: 'version-stamp' };
  }
  return {
    state: 'stale',
    archived: stamp.digest,
    current: identity.digest,
    drift: describeDrift(stamp, identity),
  };
}

export function instrumentIdentity(suite) {
  // Empty for the same reason and with the same consequence as an empty seed list: a digest of no
  // files is well-formed, so nothing downstream can tell it from a suite whose bench genuinely did
  // not move.
  if (suite.instrumentFiles.length === 0) {
    throw new Error(
      `the suite declares no instrument files, so no instrument identity can be computed`,
    );
  }
  return hashFiles(suite.instrumentFiles, REPOSITORY_ROOT);
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
export function scenarioBuildIdentity(suite, scenario, skillRoot) {
  if (!existsSync(skillRoot)) throw new Error(`no built skill at ${skillRoot}`);
  const skill = builtSkillIdentity(skillRoot, [
    ...suite.loadSetSeeds,
    ...suite.overlay.extraSeeds(scenario),
  ]);
  const instrument = instrumentIdentity(suite);
  const scenarioInputs = hashFiles(
    [
      resolve(suite.root, 'fixtures', `${scenario}.json`),
      resolve(suite.root, 'scenarios', `${scenario}.md`),
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
export function pristineScenarioBuildIdentity(suite, scenario, builtSkillRoot) {
  if (!existsSync(builtSkillRoot)) throw new Error(`no built skill at ${builtSkillRoot}`);
  if (!suite.overlay.applies(scenario)) {
    return scenarioBuildIdentity(suite, scenario, builtSkillRoot);
  }
  const scratch = mkdtempSync(resolve(tmpdir(), 'effective-flow-eval-identity-'));
  try {
    const skillRoot = resolve(scratch, 'skill');
    cpSync(builtSkillRoot, skillRoot, { recursive: true });
    applyScenarioSkillOverlay(suite, scenario, skillRoot);
    return scenarioBuildIdentity(suite, scenario, skillRoot);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
