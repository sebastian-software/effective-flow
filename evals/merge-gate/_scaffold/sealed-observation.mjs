// What the sealing step observes for the two scenarios whose subject the call log cannot show, and
// how the evaluator reads that observation back.
//
// **Why these two scenarios need it.** The tracker stub sees every forge call and nothing else.
// `presence-notice-names-other-run` is about one line of the run's report, and
// `quick-conflict-commit-without-ci-evidence-blocks` about a stop report and about a push that must
// not happen; neither a report nor a `git push` passes through the stub. So the seal of those two
// scenarios records two things after the session has ended, in `<attempt>/trace/
// sealed-observation.json`, which the seal digests and publication archives beside the run:
//
//   * `lastMessage` — the session's last message, copied verbatim from the file the host wrote
//     outside the attempt root (`--output-last-message` in every pinned merge-gate launch), whose
//     path the host receipt names as `lastMessagePath`. A stopped attempt has no receipt and records
//     `null`;
//   * `remoteRefs` — every ref of `<attempt>/remote.git`, the only place a push from the sandbox can
//     land, or `null` where provisioning made no such `origin` (the presence scenario).
//
// **Who writes it, and what follows from that.** The seal writes the file and replaces whatever a
// run left at its path, and the last message lies outside everything the run may write, so a run
// cannot author either. A record that is missing or unreadable therefore says the bench failed and
// is a validity problem; what a readable record says the run did is a finding. A ref probe that
// failed inside a well-formed record is a finding too: the likeliest cause is a run that damaged
// its own `origin`, and such a run is judged, never retried away.
//
// This module is not an instrument file, for the reason the evaluator is not one: it runs after the
// session has ended and decides nothing a run sees. The suite configuration that binds it is hashed.

import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { REMOTE_DIRECTORY, sandboxGitEnv } from './run-state-seed.mjs';

export const SEALED_OBSERVATION_FILE = 'sealed-observation.json';
export const SEALED_OBSERVATION_SUFFIX = 'sealed.json';
export const SEALED_OBSERVATION_SCHEMA = 'effective-flow.merge-gate-eval.sealed-observation/1';
const KEYS = Object.freeze(['errors', 'lastMessage', 'remoteRefs', 'schema']);
const OBJECT_NAME_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const REF_RE = /^refs\/\S+$/;

function remoteRefsOf(remote) {
  const result = spawnSync(
    'git',
    [
      '--no-optional-locks',
      `--git-dir=${remote}`,
      'for-each-ref',
      '--format=%(refname) %(objectname)',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: sandboxGitEnv() },
  );
  if (result.error || result.status !== 0) {
    return { refs: null, error: `remoteRefs: git exited ${result.error?.code ?? result.status}` };
  }
  const refs = Object.fromEntries(
    result.stdout
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => line.split(' ')),
  );
  return { refs, error: null };
}

// The seal's `capture`. A last message that is not this attempt's regular UTF-8 file refuses the
// seal: the report a scenario judges has to be the message this session wrote.
export function captureSealedObservation({ scenario, paths, lastMessagePath }) {
  let lastMessage = null;
  if (lastMessagePath !== null && lastMessagePath !== undefined) {
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
      lastMessage = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(lastMessagePath));
    } catch (error) {
      throw new Error(`${scenario}: the last message at ${lastMessagePath} is not UTF-8`, {
        cause: error,
      });
    }
  }
  const errors = [];
  let remoteRefs = null;
  const remote = resolve(paths.attemptRoot, REMOTE_DIRECTORY);
  if (existsSync(remote)) {
    const observed = remoteRefsOf(remote);
    remoteRefs = observed.refs;
    if (observed.error) errors.push(observed.error);
  }
  const record = { schema: SEALED_OBSERVATION_SCHEMA, lastMessage, remoteRefs, errors };
  return `${JSON.stringify(record, null, 2)}\n`;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// The evaluator's `parseSealedEvidence`: the record exactly as `captureSealedObservation` writes
// it, or validity problems. A `null` last message is readable — it is what a stopped attempt seals —
// and only the findings of a completed run treat it as missing.
export function parseSealedObservation(text) {
  let record;
  try {
    record = JSON.parse(text);
  } catch (error) {
    return { state: null, problems: [`the sealed observation is not JSON: ${error.message}`] };
  }
  const problems = [];
  if (!isPlainObject(record) || !isDeepStrictEqual(Object.keys(record).sort(), KEYS)) {
    return { state: null, problems: ['the sealed observation does not carry exactly its keys'] };
  }
  if (record.schema !== SEALED_OBSERVATION_SCHEMA) {
    problems.push('the sealed observation has an unknown schema');
  }
  if (record.lastMessage !== null && typeof record.lastMessage !== 'string') {
    problems.push('the sealed last message is neither text nor null');
  }
  if (record.remoteRefs !== null) {
    if (
      !isPlainObject(record.remoteRefs) ||
      !Object.entries(record.remoteRefs).every(
        ([ref, sha]) => REF_RE.test(ref) && typeof sha === 'string' && OBJECT_NAME_RE.test(sha),
      )
    ) {
      problems.push('the sealed remote refs are not a map of refs to object names');
    }
  }
  if (!Array.isArray(record.errors) || !record.errors.every((entry) => typeof entry === 'string')) {
    problems.push('the sealed observation errors are not a list of strings');
  }
  return problems.length > 0 ? { state: null, problems } : { state: record, problems };
}
