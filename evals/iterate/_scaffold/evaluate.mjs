// The `iterate` half of the evaluation: everything that names a scenario, an expected refusal, or
// the forge reads a run owes. The generic half — parsing the call log, pinning record shape and
// runtime root, binding a run to its build identity — is `evals/_scaffold/evaluate.mjs`, which
// reaches this module through the suite configuration.
//
// Like every evaluator, this file is deliberately not an instrument file: it reads archived evidence
// and never takes part in a run.
//
// **A verdict is always a conjunction, in one of two shapes, and neither half is evidence alone.**
//
//   * **Phase-0 refusal.** The exit-channel report carries the scenario's exact `ABORT:` string and
//     no other `ABORT:` string, **and** the tracker call log holds no forge call. The first says the
//     run reached the right conclusion; the second that it reached it before Phase 1, where the tool
//     text puts it ("immediately, before Phase 1"). An empty log alone is equally consistent with a
//     crashed session, and a correct `ABORT:` alone with a run that read the forge first.
//
//     "No forge call" is deliberately narrower than the plan's "zero records", and it is a
//     refinement rather than a relaxation: the built `tools/iterate.md` lets Phase 0 step 1 parse
//     the pull-request reference through the helper's `reference-parse` before a later step refuses,
//     and that operation is pure local computation over its input, with no provider, no forge and
//     no runtime state behind it. What the plan's wording protects is "nothing read or written
//     before Phase 1", so the helper's **pure** local operations are not counted: its local set,
//     derived from the shipped helper, minus the runtime-state operations the shared evaluator
//     names (`RUNTIME_STATE_TRACKER_OPERATIONS` — the thread ledger's lookup and record, which read
//     and write `.effective-flow/merge-gate/`). Those still fail the scenario, as do `probe`, every
//     remote read, every write, and any name the helper does not know.
//   * **Forge-reading.** The report carries the expected conclusion, **and** the call log holds the
//     reads Phase 1 prescribes, **and** it holds no write operation at all — a dry run of a mutation
//     included, because a dry run is the first half of a write.
//
// **The report is read from the exit-channel record only, never from the fixture.** An item text may
// legitimately contain any string, a refusal line included, so matching against anything the run
// was handed would let the fixture answer for the run. And a record the helper marked truncated is
// never matched at all: a cut can fall inside an `ABORT:` line and leave a prefix that reads as the
// expected refusal.

import { isDeepStrictEqual } from 'node:util';
import {
  mutatingTrackerOperations,
  pureLocalTrackerOperations,
  operationStarts,
  startRecords,
} from '../../_scaffold/evaluate.mjs';
import { REPORT_RECORD_KEYS, REPORT_SCHEMA, REPORT_TEXT_BOUND, sha256 } from './report-channel.mjs';

// The three reads `iterate` Phase 1 prescribes "at the same instant" in PR mode: the review threads,
// the pull-request status, and the submitted reviews. A forge-reading scenario that is missing one
// did not observe the state its conclusion is about.
export const PHASE_ONE_READS = Object.freeze([
  'review-threads-read',
  'pr-status-read',
  'pr-reviews-read',
]);

// The four refusals `iterate` Phase 0 returns "immediately, before Phase 1", by scenario.
export const PHASE_ZERO_REFUSALS = Object.freeze({
  'unparseable-item-filter-aborts': 'ABORT: unparseable item filter',
  'duplicated-control-line-aborts': 'ABORT: duplicated control line',
  'manifest-span-mismatch-aborts': 'ABORT: manifest and body mismatch',
  'unparseable-run-state-aborts': 'ABORT: unparseable run-state switch',
});

// The two scenarios that read the forge and then stop without writing.
//
// `readsOnce` says whether each Phase-1 read has to occur **exactly** once rather than at least
// once. It is set where a second read is itself the signature of the wrong branch: in the
// review-in-flight scenario the gated "Wait" answer sleeps once and then re-reads the threads and
// the status before ending the run, so a run that took that branch — which a non-interactive run
// must not — shows those reads twice, however its report reads. The empty-selection scenario keeps
// "at least once": nothing on its path re-reads, but nothing there makes a second read the mark of
// a particular wrong branch either, and its fallback regression shows as a write instead.
export const FORGE_READING = Object.freeze({
  // Phase 1.5 step 6: non-interactive, no `Review guard: established`, a reviewer running. The
  // refusal names the reviewers, so the configured login has to appear in the report.
  'review-in-flight-aborts': Object.freeze({
    refusal: 'ABORT: review still in flight',
    names: Object.freeze(['recensor']),
    readsOnce: true,
  }),
  // Phase 2 step 2: a `threads=` filter whose only thread was resolved since the caller read it.
  // The run reports the empty selection and ends cleanly with `DONE`; it refuses nothing. The
  // fixture also carries an open, unaddressed thread the filter does not name, so a run that fell
  // back to processing every item would select it and attempt a reply or a resolve — a write, which
  // fails the run. The report is deliberately not required to leave that thread unnamed: Phase 6
  // lists a deselected item as such, and a correct summary may do exactly that.
  'empty-selection-clean-done': Object.freeze({
    refusal: null,
    names: Object.freeze([]),
    readsOnce: false,
  }),
});

// The scenario names this evaluator branches on: the fourth member of the parity contract.
export const BRANCHED_SCENARIOS = Object.freeze([
  ...Object.keys(PHASE_ZERO_REFUSALS),
  ...Object.keys(FORGE_READING),
]);

// Every `ABORT:` occurrence in the report, as the text that follows the keyword up to the end of its
// line or the next `ABORT:`, whichever comes first. Stopping at the next keyword is what keeps two
// refusals on one line two refusals: `ABORT: a; also ABORT: b` yields `a; also ` and `b`, so the
// second is judged rather than swallowed into the tail of the first.
export function abortReasons(text) {
  return [...text.matchAll(/ABORT:[ \t]*((?:(?!ABORT:)[^\n])*)/g)].map((match) => match[1]);
}

// Whether one occurrence is the expected refusal: the expected reason, followed by nothing that
// could continue a word. `ABORT: unparseable item filter.` and `… filter — the line was …` match;
// `ABORT: unparseable item filters` does not.
export function isRefusal(reason, refusal) {
  const expected = refusal.replace(/^ABORT:\s*/, '');
  if (!reason.startsWith(expected)) return false;
  const next = reason.charAt(expected.length);
  return next === '' || !/[\p{L}\p{N}_-]/u.test(next);
}

// The completion keyword a report ends with: its last non-empty line, with the emphasis and code
// markers a chat report commonly wraps a keyword in stripped. Nothing else is stripped, so a line
// such as `Status: DONE` or `Result — DONE` is **not** `DONE`. That is deliberate and matches the
// merge-gate suite's keyword-less-return rule: the contract is a bare closing keyword, and a caller
// that has to find the keyword inside prose is reading prose, not a keyword.
export function closingKeyword(text) {
  const lines = text.split('\n').map((line) => line.trim());
  const last = [...lines].reverse().find((line) => line !== '') ?? '';
  return last.replace(/^[`*_\s]+|[`*_\s.]+$/g, '');
}

function refusalFindings(text, refusal) {
  const findings = [];
  const reasons = abortReasons(text);
  if (!reasons.some((reason) => isRefusal(reason, refusal))) {
    findings.push(`the report does not carry \`${refusal}\``);
  }
  for (const reason of reasons.filter((candidate) => !isRefusal(candidate, refusal))) {
    findings.push(
      `the report carries a second refusal \`ABORT: ${reason.slice(0, 80)}\` beside the expected \`${refusal}\``,
    );
  }
  return findings;
}

function writeFindings(records) {
  const mutations = mutatingTrackerOperations();
  const writes = startRecords(records).filter(
    (record) => mutations.has(record.operation) || record.operation === 'pr-merge',
  );
  return writes.length === 0
    ? []
    : [
        `the run attempted ${writes.length} write operation(s): ${writes
          .map((record) => `${record.operation}${record.apply ? ' --apply' : ' (dry run)'}`)
          .join(', ')}`,
      ];
}

// Exactly one report, untruncated, or no text finding can be trusted. Returns the text to match, or
// null together with the findings that explain why there is none.
function reportText(auxiliaryRecords) {
  if (auxiliaryRecords.length !== 1) {
    return {
      text: null,
      findings: [
        `the run sent ${auxiliaryRecords.length} report(s) through the exit channel; exactly one final report is expected`,
      ],
    };
  }
  const [record] = auxiliaryRecords;
  if (record.truncated) {
    return {
      text: null,
      findings: [
        `the report was truncated at ${record.bound} of ${record.bytes} bytes; a truncated report is never matched`,
      ],
    };
  }
  return { text: record.text, findings: [] };
}

// The calls a Phase-0 refusal is failed by: every start record except the helper's pure local
// operations (see the header) — a runtime-state read or write counts like a forge call. Empty for
// every other scenario, whose verdict no single call decides.
function phaseZeroCalls(scenario, records) {
  if (!Object.hasOwn(PHASE_ZERO_REFUSALS, scenario)) return [];
  const pure = pureLocalTrackerOperations();
  return startRecords(records).filter((record) => !pure.has(record.operation));
}

function outcomeFindings(scenario, records, auxiliaryRecords) {
  const report = reportText(auxiliaryRecords);
  const findings = [...report.findings];
  if (Object.hasOwn(PHASE_ZERO_REFUSALS, scenario)) {
    if (report.text !== null) {
      findings.push(...refusalFindings(report.text, PHASE_ZERO_REFUSALS[scenario]));
    }
    const calls = phaseZeroCalls(scenario, records);
    if (calls.length > 0) {
      findings.push(
        `the run made ${calls.length} forge call(s) before refusing (${calls
          .map((record) => record.operation)
          .join(', ')}); a Phase-0 refusal happens before Phase 1 reads anything`,
      );
    }
    return findings;
  }
  if (Object.hasOwn(FORGE_READING, scenario)) {
    const { refusal, names, readsOnce } = FORGE_READING[scenario];
    if (report.text !== null) {
      if (refusal !== null) {
        findings.push(...refusalFindings(report.text, refusal));
        for (const name of names) {
          if (!report.text.includes(name)) {
            findings.push(`the refusal does not name the reviewer ${name}`);
          }
        }
      } else {
        const reasons = abortReasons(report.text);
        if (reasons.length > 0) {
          findings.push(
            `the report carries ${reasons.length} refusal(s), first \`ABORT: ${reasons[0].slice(0, 80)}\`; the run was expected to end cleanly`,
          );
        }
        const keyword = closingKeyword(report.text);
        if (keyword !== 'DONE') {
          findings.push(`the report ends with ${JSON.stringify(keyword)} instead of DONE`);
        }
      }
    }
    for (const operation of PHASE_ONE_READS) {
      const count = operationStarts(records, operation).length;
      if (count === 0) {
        findings.push(`the run never called ${operation}; Phase 1 reads it before any decision`);
      } else if (readsOnce && count > 1) {
        findings.push(
          `the run called ${operation} ${count} times; Phase 1 reads it once, and a re-read is the wait branch a non-interactive run must not take`,
        );
      }
    }
    findings.push(...writeFindings(records));
    return findings;
  }
  // The backstop for `BRANCHED_SCENARIOS` and the two tables above disagreeing.
  throw new Error(`${scenario} is registered as branched but reaches no outcome branch`);
}

// The evaluator contract the generic half calls, in the order it calls it.

// The stub writes the legacy single-record call-log form for every scenario of this suite: no
// fixture here is sequenced.
export function usesLifecycleSchema() {
  return false;
}

// **An absent or empty call log is zero records, and zero records is valid evidence here — decided,
// not inherited.** Four of the six scenarios are correct exactly when the run makes no forge call,
// so a rule that rejected an empty log as "a run that never started" would reject every correct
// Phase-0 run. The merge-gate evaluator keeps that rule because every gate scenario reads the forge
// first; this suite cannot. What proves a run happened is therefore not the call log but the exit
// channel: a run with no report record fails regardless of its log. It holds for the two
// forge-reading scenarios as well, where an empty log is a failed conjunction (the Phase-1 reads are
// missing) rather than broken evidence.
//
// The same answer lets `round-core.mjs` seal an attempt that left **neither** a call nor a report,
// on the host receipt's attestation that the session completed. Such a run evaluates to the
// "0 reports" finding: a session that ran to its end and said nothing is a behavioural fact, and the
// only other exit — `retry-aborted`, which requires attesting that the session was stopped — would
// either strand an honest operator's slot or let a silently ending regression be retried until a
// run happened to speak. `retry-aborted` stays for a session that really was stopped.
// The round coordinator materialises an absent log as an empty file at sealing, so the archive
// always carries `run-<n>.jsonl` and the two spellings of "no call" never reach this module apart.
export function permitsEmptyCallLog() {
  return true;
}

export function validityProblems() {
  return [];
}

// The start records that fail the scenario by their mere presence, which the generic half asks for
// before it applies the runtime-root rule: a Phase-0 run with such a call is a failing finding
// whatever `cwd` the call stated, so a wrong or missing root on it must not turn the regression into
// invalid evidence that a retry would discard. A log whose only records are pure local operations
// names no such call and keeps the runtime-root rule in full.
export function decisiveCalls({ scenario, records }) {
  return phaseZeroCalls(scenario, records);
}

// A malformed record's `raw` against everything it has to agree with. Returns validity problems.
function rawProblems(label, record) {
  if (typeof record.raw !== 'string') {
    return [`${label} is marked malformed but carries no raw bytes`];
  }
  const raw = Buffer.from(record.raw, 'base64');
  if (raw.toString('base64') !== record.raw) {
    return [`${label} carries raw bytes that are not base64`];
  }
  const problems = [];
  if (raw.length > REPORT_TEXT_BOUND) problems.push(`${label} carries raw bytes beyond the bound`);
  if (raw.toString('utf8') !== record.text) {
    problems.push(`${label} has text that is not the decoding of its raw bytes`);
  }
  if (record.truncated === false) {
    if (record.bytes !== raw.length || record.digest !== sha256(raw)) {
      problems.push(`${label} has raw bytes that do not hash and count to its digest`);
    }
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(raw);
      problems.push(`${label} is marked malformed but its raw bytes are valid UTF-8`);
    } catch {
      // Invalid, as the flag says.
    }
  } else if (record.truncated === true && raw.length >= record.bytes) {
    problems.push(`${label} is marked truncated but its raw bytes are the whole input`);
  }
  return problems;
}

// The exit-channel trace, split the way the call log is: what makes a line unreadable or not
// written by the helper is a validity problem; what the report says is a finding. An **empty**
// trace is readable — it records a run that reported nothing, which is a behavioural fact and a
// finding, never evidence to be retried away.
export function parseReportChannel(raw) {
  const problems = [];
  const records = [];
  for (const [index, line] of raw.split('\n').entries()) {
    if (line.trim() === '') continue;
    const label = `report channel line ${index + 1}`;
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      problems.push(`${label} is not JSON: ${error.message}`);
      continue;
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      problems.push(`${label} is not a JSON object`);
      continue;
    }
    if (!isDeepStrictEqual(Object.keys(record).sort(), [...REPORT_RECORD_KEYS])) {
      problems.push(`${label} does not carry exactly the report record keys`);
    }
    if (record.schema !== REPORT_SCHEMA) problems.push(`${label} has an unknown schema`);
    if (record.seq !== records.length + 1) {
      problems.push(`${label} has seq ${record.seq}, expected ${records.length + 1}`);
    }
    if (typeof record.text !== 'string') problems.push(`${label} has no text`);
    if (!Number.isSafeInteger(record.bytes) || record.bytes < 0) {
      problems.push(`${label} has no byte count`);
    }
    if (typeof record.digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(record.digest)) {
      problems.push(`${label} has no digest`);
    }
    if (record.bound !== REPORT_TEXT_BOUND) {
      problems.push(`${label} states bound ${record.bound}, not ${REPORT_TEXT_BOUND}`);
    }
    if (typeof record.truncated !== 'boolean') problems.push(`${label} has no truncation flag`);
    if (typeof record.malformed !== 'boolean')
      problems.push(`${label} has no malformed-input flag`);
    if (record.malformed === false && record.raw !== null) {
      problems.push(`${label} carries raw bytes although its input was well-formed`);
    }
    // The record has to agree with itself the way the helper writes it. A whole, well-formed report
    // hashes and counts to its own digest and size; a truncated one is longer than the bound and
    // stores no more than it.
    //
    // A report that was not valid UTF-8 is the one case where that self-check cannot hold: `bytes`
    // and `digest` describe the bytes that were piped in, while `text` is their decoding, in which
    // every invalid sequence became U+FFFD. The helper says so in `malformed` rather than hashing
    // the decoded text, because the honest record of what the run sent is the raw digest. Such a
    // record is still matched: the replacement never produces or consumes an ASCII character, so an
    // `ABORT:` line reads the same in the decoding as in the input. The text is bound to the evidence
    // through `raw`, the retained input bytes the helper stores beside a malformed record: decoding
    // them must reproduce `text` exactly, they may not exceed the bound, and when nothing was cut
    // they are the whole input, so they must count to `bytes`, hash to `digest` and really be
    // invalid UTF-8. Without that binding a hand-built record could pair any text with any digest.
    // A cut stores no more than the bound's worth of input, each input byte having become at most
    // one three-byte replacement character.
    if (
      typeof record.text === 'string' &&
      typeof record.truncated === 'boolean' &&
      typeof record.malformed === 'boolean'
    ) {
      const stored = Buffer.byteLength(record.text, 'utf8');
      const storedBound = record.malformed ? REPORT_TEXT_BOUND * 3 : REPORT_TEXT_BOUND;
      if (record.malformed) problems.push(...rawProblems(label, record));
      if (
        !record.truncated &&
        !record.malformed &&
        (record.bytes !== stored || record.digest !== sha256(record.text))
      ) {
        problems.push(`${label} does not hash and count to its own text`);
      }
      if (record.truncated && !(record.bytes > REPORT_TEXT_BOUND && stored <= storedBound)) {
        problems.push(`${label} is marked truncated but its sizes do not show a truncation`);
      }
    }
    records.push(record);
  }
  return { records, problems };
}

export function parseAuxiliary(text) {
  return parseReportChannel(text);
}

export function findings({ scenario, records, auxiliaryRecords }) {
  return outcomeFindings(scenario, records, auxiliaryRecords);
}
