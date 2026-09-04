// The identity of the thing a run measured, computed the same way by the scaffold that provisions a
// run and by the assertions that later read its archived log.
//
// The gap this closes: an archived call log records what a run *did*, and nothing about the code it
// did it to. Left that way, `src/tools/merge-gate.md` can be restructured and the logs of runs
// against the previous text keep reporting green underneath — the suite would go on certifying a
// build nobody is running. That is the exact drift this whole layer exists to catch, reappearing in
// the evidence rather than in the subject.
//
// So every run is stamped with a digest of its behavioural inputs, and an archived run whose stamp
// does not match the working tree is not read. Two properties follow, and both are deliberate:
//
//   * **The set is derived, not listed.** The gate's shared fragments are found by walking its own
//     include fences transitively, so a fragment added to `merge-gate.md` tomorrow is inside the
//     digest without anyone remembering to add it here. A hand-kept list is wrong the day it is
//     edited, which is the failure mode being guarded against one level up.
//
//   * **A content digest cannot tell a rule from a comment.** Rewording a comment in any digested
//     file invalidates the archived rounds exactly as a changed fail-closed rule would. That is the
//     safe direction of the two, and it is stated here rather than engineered around: the cheap
//     alternative is a semantic digest that decides for itself which edits matter, which is a much
//     larger thing to be wrong about than an occasional round re-run.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { collectIncludeNames } from '../../../build-lib.mjs';

const SUITE_ROOT = resolve(import.meta.dirname, '..');
const REPOSITORY_ROOT = resolve(SUITE_ROOT, '..', '..');

// The instrument as well as the subject. A run is a measurement of the gate *through* this stub and
// under the configuration this scaffold writes, so a change to either leaves the earlier logs
// describing a measurement nobody can reproduce — real observations, of a setup that no longer
// exists. They are inputs to the digest for the same reason the gate's own text is.
const INSTRUMENT_FILES = [
  resolve(import.meta.dirname, 'remote-tracker.mjs'),
  resolve(import.meta.dirname, 'scaffold.mjs'),
];

// The router decides whether the tool is reachable and what a bare invocation resolves to, so a run
// depends on it even though it names no fragment of its own.
const ROUTER_FILE = resolve(REPOSITORY_ROOT, 'src', 'SKILL.md');
const GATE_FILE = resolve(REPOSITORY_ROOT, 'src', 'tools', 'merge-gate.md');
const SHARED_DIR = resolve(REPOSITORY_ROOT, 'src', 'shared');

// The transitive include closure of the gate, eager and lazy alike. Lazy fragments are as much part
// of the run as eager ones — the build ships them and the gate loads them when its trigger fires,
// which under these scenarios it does.
function gateFragmentClosure() {
  const seen = new Set();
  const pending = [GATE_FILE];
  const files = [];
  while (pending.length > 0) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    files.push(file);
    const { eager, lazy } = collectIncludeNames(readFileSync(file, 'utf8'));
    for (const name of [...eager, ...lazy]) {
      pending.push(resolve(SHARED_DIR, `${name}.md`));
    }
  }
  return files;
}

function scenarioFiles(scenario) {
  return [
    resolve(SUITE_ROOT, 'fixtures', `${scenario}.json`),
    resolve(SUITE_ROOT, 'scenarios', `${scenario}.md`),
  ];
}

function digestOf(content) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

// The per-file map is carried alongside the single digest so a mismatch can name the file that
// moved. A bare digest reports only that something changed, which leaves the operator diffing a
// build by hand to find out whether a fail-closed rule or a typo cost them a round.
export function scenarioBuildIdentity(scenario) {
  const paths = [
    ROUTER_FILE,
    ...gateFragmentClosure(),
    ...INSTRUMENT_FILES,
    ...scenarioFiles(scenario),
  ];
  const files = {};
  for (const path of paths) {
    files[relative(REPOSITORY_ROOT, path)] = digestOf(readFileSync(path));
  }
  const canonical = Object.keys(files)
    .sort()
    .map((name) => `${name} ${files[name]}`)
    .join('\n');
  return { scenario, digest: digestOf(canonical), files };
}
