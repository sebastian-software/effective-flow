// The sandbox's git state as sealed evidence: what the sealing step observes in a slot's checkout
// and in the bare `origin` beside it, and how the evaluator reads that observation back.
//
// **Why this suite needs it.** The tracker stub's call log sees every forge read and write, and the
// exit channel sees what the run concluded. Neither sees git. A run that commits, pushes to the
// sandbox's local `origin`, or leaves an edit in the checkout writes nothing either observable
// records — yet "implements and pushes nothing" is part of what a forge-reading scenario asserts,
// and a Phase-0 refusal that touched the checkout did not refuse "before Phase 1" either. So the
// round's sealing step reads three things after the session has ended and writes them to
// `<attempt>/trace/git-state.json`, which the seal digests and publication archives beside the run:
//
//   * every ref of `<attempt>/remote.git`, the only place a push from the sandbox can land;
//   * the checkout's symbolic `HEAD` and the commit it resolves to;
//   * `git status --porcelain` of the checkout, untracked files included.
//
// A correct run of any scenario leaves all three exactly as provisioning made them: `origin` holds
// the base and head branches at the fixture's SHAs, the checkout stands on the head branch at the
// head SHA, and the status is empty. Fetching or fast-forward pulling the head branch — which
// `iterate` Phase 1 does — moves none of them, and the runtime state a run may write under
// `.effective-flow/` is ignored by the checkout's tracked `.gitignore`.
//
// **What it deliberately does not record.** No reflog and no object count: a no-op `checkout` of the
// current branch, which a correct run may issue, appends a reflog entry, so neither is the same for
// every correct run. A run that commits and then resets the commit away before it ends therefore
// leaves no trace here; one that leaves the commit, the push or the edit does.
//
// **Who writes it, and what follows from that.** The sealing step writes the file and replaces
// whatever a run may have left at its path, so a run cannot author it. A record that is missing,
// unreadable or contradicts itself therefore says the bench failed, and is a **validity problem**
// that publication refuses. A probe that failed inside a well-formed record is different: the
// likeliest cause is a run that damaged the sandbox repository, so it is a **finding** — a run that
// broke its own `origin` is judged, never discarded and retried until one happens not to.
//
// This module is not an instrument file, for the reason the evaluator is not one: it runs after the
// session has ended and decides nothing a run sees. A change to what it records reaches every
// archived run through the parser below, which pins the record's exact shape.

import { spawnSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { resolve } from 'node:path';
import { REMOTE_DIRECTORY, sandboxGitEnv } from './checkout.mjs';

export const GIT_STATE_FILE = 'git-state.json';
export const GIT_STATE_SCHEMA = 'effective-flow.iterate-eval.git-state/1';
// The probes in the order they run, which is the order an `errors` entry names them by.
const PROBES = Object.freeze(['remoteRefs', 'branch', 'head', 'status']);
const GIT_STATE_KEYS = Object.freeze([...PROBES, 'errors', 'schema'].sort());
// A full object name in either object format git supports.
const OBJECT_NAME_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const REF_RE = /^refs\/\S+$/;
// How many porcelain lines a finding quotes before it elides the rest.
const QUOTED_STATUS_LINES = 3;

// One git command against an explicit repository, never one git discovers from a working directory:
// a run that deleted the checkout's `.git` must read as a failed probe, not as whatever repository
// encloses the sandbox. `--no-optional-locks` keeps `status` from refreshing the index, so observing
// the checkout does not write to it.
function probe(args) {
  const result = spawnSync('git', ['--no-optional-locks', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: sandboxGitEnv(),
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) return { ok: false, status: result.error.code ?? 'error', stdout: '' };
  return { ok: result.status === 0, status: result.status, stdout: result.stdout };
}

function lines(text) {
  return text.split('\n').filter((line) => line !== '');
}

// Observe the attempt's git state and return the record as the text the seal digests. It never
// throws for a state a run can cause: a failed probe is recorded as `null` with an `errors` entry
// naming it, so sealing a run that damaged its sandbox still succeeds and the run is judged.
export function captureGitState({ paths }) {
  const remote = resolve(paths.attemptRoot, REMOTE_DIRECTORY);
  const gitDir = resolve(paths.projectRoot, '.git');
  const errors = [];
  const failed = (name, result) => {
    errors.push(`${name}: git exited ${result.status}`);
    return null;
  };

  const refs = probe([`--git-dir=${remote}`, 'for-each-ref', '--format=%(refname) %(objectname)']);
  const remoteRefs = refs.ok
    ? Object.fromEntries(lines(refs.stdout).map((line) => line.split(' ')))
    : failed('remoteRefs', refs);

  // Exit status 1 with `--quiet` is git's answer for a detached HEAD, which is a state, not a
  // failure; anything else is a probe that could not read the repository.
  const symbolic = probe([`--git-dir=${gitDir}`, 'symbolic-ref', '--quiet', 'HEAD']);
  let branch = null;
  if (symbolic.ok) branch = symbolic.stdout.trim();
  else if (symbolic.status !== 1) failed('branch', symbolic);

  const commit = probe([
    `--git-dir=${gitDir}`,
    'rev-parse',
    '--verify',
    '--quiet',
    'HEAD^{commit}',
  ]);
  const head = commit.ok ? commit.stdout.trim() : failed('head', commit);

  const porcelain = probe([
    `--git-dir=${gitDir}`,
    `--work-tree=${paths.projectRoot}`,
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--ignore-submodules=none',
  ]);
  const status = porcelain.ok ? lines(porcelain.stdout) : failed('status', porcelain);

  const record = { schema: GIT_STATE_SCHEMA, remoteRefs, branch, head, status, errors };
  return `${JSON.stringify(record, null, 2)}\n`;
}

// The record a correct run leaves: the state `prepareCheckout` provisioned for this fixture.
export function untouchedGitState(fixture) {
  const checkout = fixture?.checkout;
  if (!checkout || typeof checkout !== 'object') {
    throw new Error('the fixture states no checkout block to compare the sealed git state with');
  }
  const { baseRef, headRef, baseSha, headSha } = checkout;
  return {
    schema: GIT_STATE_SCHEMA,
    remoteRefs: { [`refs/heads/${baseRef}`]: baseSha, [`refs/heads/${headRef}`]: headSha },
    branch: `refs/heads/${headRef}`,
    head: headSha,
    status: [],
    errors: [],
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Whether the record is one `captureGitState` could have written. Returns validity problems.
function recordProblems(record) {
  if (!isPlainObject(record)) return ['the sealed git state is not a JSON object'];
  if (!isDeepStrictEqual(Object.keys(record).sort(), [...GIT_STATE_KEYS])) {
    return ['the sealed git state does not carry exactly its record keys'];
  }
  const problems = [];
  if (record.schema !== GIT_STATE_SCHEMA)
    problems.push('the sealed git state has an unknown schema');
  const { remoteRefs, branch, head, status, errors } = record;
  if (
    remoteRefs !== null &&
    !(
      isPlainObject(remoteRefs) &&
      Object.entries(remoteRefs).every(
        ([ref, name]) => REF_RE.test(ref) && typeof name === 'string' && OBJECT_NAME_RE.test(name),
      )
    )
  ) {
    problems.push(
      'the sealed git state carries remote refs that are not ref names and object names',
    );
  }
  if (branch !== null && !(typeof branch === 'string' && REF_RE.test(branch))) {
    problems.push('the sealed git state carries a symbolic HEAD that is not a ref name');
  }
  if (head !== null && !(typeof head === 'string' && OBJECT_NAME_RE.test(head))) {
    problems.push('the sealed git state carries a HEAD that is not an object name');
  }
  if (
    status !== null &&
    !(Array.isArray(status) && status.every((line) => typeof line === 'string' && line !== ''))
  ) {
    problems.push('the sealed git state carries a status that is not a list of lines');
  }
  if (!Array.isArray(errors) || !errors.every((entry) => typeof entry === 'string')) {
    problems.push('the sealed git state carries no list of probe errors');
    return problems;
  }
  // A probe is `null` exactly when an error names it — except the symbolic HEAD, whose `null` is
  // also a detached HEAD. Anything else is a record the capture cannot produce.
  for (const entry of errors) {
    if (!PROBES.some((name) => entry.startsWith(`${name}: `))) {
      problems.push(
        `the sealed git state names an error for no known probe: ${entry.slice(0, 80)}`,
      );
    }
  }
  for (const name of PROBES) {
    const failed = errors.some((entry) => entry.startsWith(`${name}: `));
    if (failed && record[name] !== null) {
      problems.push(`the sealed git state reports ${name} as failed but carries a value for it`);
    }
    if (!failed && record[name] === null && name !== 'branch') {
      problems.push(`the sealed git state carries no ${name} and names no error for it`);
    }
  }
  return problems;
}

export function parseGitState(text) {
  let record;
  try {
    record = JSON.parse(text);
  } catch (error) {
    return { state: null, problems: [`the sealed git state is not JSON: ${error.message}`] };
  }
  const problems = recordProblems(record);
  return problems.length === 0 ? { state: record, problems } : { state: null, problems };
}

// What the run did to the sandbox, measured against the untouched state. Every difference is a
// finding: each is something a correct run of any scenario of this suite never does.
export function gitStateFindings(state, fixture) {
  const expected = untouchedGitState(fixture);
  const findings = [];
  if (state.errors.length > 0) {
    findings.push(
      `the sealing step could not read the sandbox repository (${state.errors.join(', ')}); a correct run leaves it intact`,
    );
  }
  if (state.remoteRefs !== null) {
    const changes = [];
    for (const [ref, name] of Object.entries(expected.remoteRefs)) {
      if (!Object.hasOwn(state.remoteRefs, ref)) changes.push(`${ref} is gone`);
      else if (state.remoteRefs[ref] !== name) {
        changes.push(`${ref} moved from ${name} to ${state.remoteRefs[ref]}`);
      }
    }
    for (const [ref, name] of Object.entries(state.remoteRefs)) {
      if (!Object.hasOwn(expected.remoteRefs, ref)) changes.push(`${ref} appeared at ${name}`);
    }
    if (changes.length > 0) {
      findings.push(
        `the run changed the sandbox origin: ${changes.join(', ')}; a correct run pushes nothing`,
      );
    }
  }
  const branchFailed = state.errors.some((entry) => entry.startsWith('branch: '));
  if (!branchFailed && state.branch !== expected.branch) {
    findings.push(
      `the checkout is ${state.branch === null ? 'on a detached HEAD' : `on ${state.branch}`}, not on ${expected.branch}`,
    );
  }
  if (state.head !== null && state.head !== expected.head) {
    findings.push(
      `the checkout's HEAD is ${state.head}, not the seeded head ${expected.head}; a correct run commits nothing`,
    );
  }
  if (state.status !== null && state.status.length > 0) {
    const quoted = state.status.slice(0, QUOTED_STATUS_LINES);
    if (state.status.length > QUOTED_STATUS_LINES) quoted.push('…');
    findings.push(
      `the checkout has ${state.status.length} uncommitted change(s) (${quoted.join(', ')}); a correct run edits nothing`,
    );
  }
  return findings;
}
