import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  applyScenarioSkillOverlay,
  buildPortableSkill,
  digestFile,
  freshnessVerdict,
  instrumentIdentity,
  pristineScenarioBuildIdentity,
  scenarioBuildIdentity,
} from '../evals/_scaffold/build-identity.mjs';
import {
  evaluateEvidence,
  localTrackerOperations,
  pureLocalTrackerOperations,
  RUNTIME_STATE_TRACKER_OPERATIONS,
} from '../evals/_scaffold/evaluate.mjs';
import {
  createRound,
  retryAborted,
  roundStatus,
  sealAttempt,
} from '../evals/_scaffold/round-core.mjs';
import { auxiliaryLogPath, sandboxPaths } from '../evals/_scaffold/sandbox.mjs';
import { writeProject } from '../evals/_scaffold/scaffold.mjs';
import { discoverSuite } from '../evals/_scaffold/suite.mjs';
import { loadSuite } from '../evals/_scaffold/suite-loader.mjs';
import {
  BRANCHED_SCENARIOS,
  findings as evaluatorFindings,
  FORGE_READING,
  PHASE_ONE_READS,
  PHASE_ZERO_REFUSALS,
} from '../evals/iterate/_scaffold/evaluate.mjs';
import {
  main as reportChannelMain,
  MAX_REPORT_RECORDS,
  readReport,
  REPORT_SCHEMA,
  REPORT_TEXT_BOUND,
  reportRecord,
  sha256,
} from '../evals/iterate/_scaffold/report-channel.mjs';
import {
  applyOverlay,
  REPORT_CHANNEL_SKILL_PATH,
  REVIEWER_ROWS,
} from '../evals/iterate/_scaffold/scenario-setup.mjs';
import suite from '../evals/iterate/suite.config.mjs';

// The `iterate` behavioural eval suite, as ordinary tests over ordinary files. Nothing here runs a
// model or an `iterate` run: the exit channel is driven directly, the evaluator is handed built
// evidence, and the round lifecycle is exercised with the report a run would write.

const ITERATE_ROOT = resolve(import.meta.dirname, '..', 'evals', 'iterate');
const REPORT_CHANNEL = resolve(ITERATE_ROOT, '_scaffold', 'report-channel.mjs');
const PROFILE = {
  ...suite.expectedProfile,
  reportedVersion: 'test-version',
  toolPolicy: 'test-policy',
};

// --- The exit channel ------------------------------------------------------------------------------

// A slot's layout in miniature: the helper at `<attempt>/skill/scripts/`, the record under
// `<attempt>/trace/`. The attempt root is left unresolved on purpose — on macOS the temporary
// directory sits behind a symlink, which is exactly the case the helper's entry-point check has to
// survive.
function channelSandbox() {
  const attempt = mkdtempSync(join(tmpdir(), 'effective-flow-report-channel-'));
  const scripts = join(attempt, 'skill', 'scripts');
  mkdirSync(scripts, { recursive: true });
  mkdirSync(join(attempt, 'project'));
  copyFileSync(REPORT_CHANNEL, join(scripts, 'report-channel.mjs'));
  return {
    attempt,
    helper: join(scripts, 'report-channel.mjs'),
    project: join(attempt, 'project'),
    trace: join(attempt, 'trace', 'report-channel.jsonl'),
  };
}

function report(sandbox, input) {
  return spawnSync(process.execPath, [sandbox.helper], {
    cwd: sandbox.project,
    input,
    encoding: 'utf8',
  });
}

function traceRecords(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

test('the exit channel stores a shell-metacharacter report as data and never executes or echoes it', () => {
  const sandbox = channelSandbox();
  try {
    const hostile = [
      'ABORT: unparseable item filter',
      '$(touch "$PWD/command-substitution-ran") `touch backtick-ran`; touch semicolon-ran',
      "&& rm -rf ./project || echo 'quoted' | tee piped-ran > redirected-ran",
      '"double" \\backslash \u0000nul ‮RLO ${HOME} %s %n',
    ].join('\n');
    const result = report(sandbox, hostile);
    assert.equal(result.status, 0, result.stderr);
    const [record] = traceRecords(sandbox.trace);
    assert.equal(record.text, hostile, 'the stored text is not the report byte for byte');
    assert.equal(record.bytes, Buffer.byteLength(hostile));
    assert.equal(record.digest, sha256(hostile));
    assert.equal(record.truncated, false);
    // Nothing the text asked for happened: no file appeared beside the project or the attempt, and
    // the project the text asked to delete is still there.
    for (const directory of [sandbox.project, sandbox.attempt]) {
      for (const name of readdirSync(directory)) {
        assert.ok(!/ran$/.test(name), `the report was executed: ${name} exists in ${directory}`);
      }
    }
    assert.ok(existsSync(sandbox.project));
    // The receipt names the record, never its content.
    assert.match(
      result.stdout,
      /^report channel: recorded report 1 \(\d+ bytes, sha256:[0-9a-f]{64}\)\n$/,
    );
    assert.ok(!result.stdout.includes('ABORT'), 'the receipt echoes the report');
  } finally {
    rmSync(sandbox.attempt, { recursive: true, force: true });
  }
});

test('the exit channel truncates visibly at its stated bound and never splits a character', () => {
  // A three-byte character straddles the bound, so a byte-exact cut would store half of it.
  const text = `${'a'.repeat(REPORT_TEXT_BOUND - 1)}€ tail beyond the bound`;
  const record = reportRecord(text);
  assert.equal(record.truncated, true);
  assert.equal(record.bound, REPORT_TEXT_BOUND);
  assert.equal(record.bytes, Buffer.byteLength(text), 'bytes must count the whole report');
  assert.equal(record.digest, sha256(text), 'the digest must cover the whole report');
  assert.equal(record.text, 'a'.repeat(REPORT_TEXT_BOUND - 1), 'the cut split a character');
  assert.ok(Buffer.byteLength(record.text) <= REPORT_TEXT_BOUND);
  assert.ok(text.startsWith(record.text));

  // Exactly at the bound nothing is cut, and the record says so.
  const exact = reportRecord('b'.repeat(REPORT_TEXT_BOUND));
  assert.equal(exact.truncated, false);
  assert.equal(exact.text.length, REPORT_TEXT_BOUND);

  // Through the CLI, the over-bound record is stored, and the evaluator reads it as truncated.
  const sandbox = channelSandbox();
  try {
    assert.equal(report(sandbox, text).status, 0);
    const [stored] = traceRecords(sandbox.trace);
    assert.equal(stored.truncated, true);
    assert.deepEqual(
      evaluatorFindings({
        scenario: 'unparseable-item-filter-aborts',
        records: [],
        auxiliaryRecords: [stored],
      }),
      [
        `the report was truncated at ${REPORT_TEXT_BOUND} of ${stored.bytes} bytes; a truncated report is never matched`,
      ],
    );
  } finally {
    rmSync(sandbox.attempt, { recursive: true, force: true });
  }
});

test('the exit channel appends one sequenced record per invocation and refuses past its cap', () => {
  const sandbox = channelSandbox();
  try {
    for (let index = 1; index <= MAX_REPORT_RECORDS; index += 1) {
      assert.equal(report(sandbox, `report ${index}`).status, 0);
    }
    const before = readFileSync(sandbox.trace, 'utf8');
    const refused = report(sandbox, 'one too many');
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /at most 4 records/);
    assert.equal(readFileSync(sandbox.trace, 'utf8'), before, 'a refused append changed the trace');
    const records = traceRecords(sandbox.trace);
    assert.deepEqual(
      records.map((record) => [record.seq, record.schema, record.text]),
      Array.from({ length: MAX_REPORT_RECORDS }, (_, index) => [
        index + 1,
        REPORT_SCHEMA,
        `report ${index + 1}`,
      ]),
    );

    // An empty report is stored as what it is, so the evaluator can say the run reported nothing.
    const empty = channelSandbox();
    try {
      assert.equal(report(empty, '').status, 0);
      const [record] = traceRecords(empty.trace);
      assert.equal(record.text, '');
      assert.equal(record.bytes, 0);
    } finally {
      rmSync(empty.attempt, { recursive: true, force: true });
    }
  } finally {
    rmSync(sandbox.attempt, { recursive: true, force: true });
  }
});

// The helper streams its input: it must describe an input far larger than anything it keeps, and
// build from many chunks exactly the record it builds from their concatenation — including a
// character split across two chunks, which a per-chunk validity check would misread as malformed.
test('the exit channel streams its input and describes the whole of it while keeping only the bound', async () => {
  const large = Buffer.alloc(5 * 1024 * 1024, 'x');
  const sandbox = channelSandbox();
  try {
    const result = spawnSync(process.execPath, [sandbox.helper], {
      cwd: sandbox.project,
      input: large,
    });
    assert.equal(result.status, 0, String(result.stderr));
    const [record] = traceRecords(sandbox.trace);
    assert.equal(record.bytes, large.length, 'bytes must count the whole streamed input');
    assert.equal(record.digest, sha256(large), 'the digest must cover the whole streamed input');
    assert.equal(record.truncated, true);
    assert.equal(record.malformed, false);
    assert.equal(Buffer.byteLength(record.text), REPORT_TEXT_BOUND);
  } finally {
    rmSync(sandbox.attempt, { recursive: true, force: true });
  }

  const whole = Buffer.from(`ABORT: unparseable item filter — ${'€'.repeat(20_000)} end`, 'utf8');
  // Cut every chunk at an odd offset so a three-byte character straddles most boundaries.
  const chunks = [];
  for (let offset = 0; offset < whole.length; offset += 7) {
    chunks.push(whole.subarray(offset, offset + 7));
  }
  const streamed = await readReport(Readable.from(chunks));
  assert.deepEqual(streamed, reportRecord(whole));
  assert.equal(streamed.malformed, false, 'a character split across chunks read as malformed');
});

// A terminal on standard input never ends, so a helper that waited for end-of-file there would hang
// the run that was told to call it. It is refused before anything is read, and nothing is recorded.
test('the exit channel refuses a terminal on standard input instead of waiting on it', async () => {
  const sandbox = channelSandbox();
  try {
    const tty = Readable.from([Buffer.from('ABORT: never read\n')]);
    tty.isTTY = true;
    let stderr = '';
    const status = await reportChannelMain({
      stdin: tty,
      stdout: { write: () => assert.fail('a refused read printed a receipt') },
      stderr: { write: (text) => (stderr += text) },
      tracePath: sandbox.trace,
    });
    assert.equal(status, 1);
    assert.match(stderr, /standard input is a terminal; pipe the report into this helper instead/);
    assert.equal(existsSync(sandbox.trace), false, 'a refused read wrote a record');
  } finally {
    rmSync(sandbox.attempt, { recursive: true, force: true });
  }
});

// Input that is not valid UTF-8 keeps its raw digest and byte count — the honest record of what was
// sent — while the text is the replacement-decoded form, and the record says so. The evaluator then
// reads such a report as a report rather than discarding it as evidence that fails its own hash.
test('a report that is not valid UTF-8 is recorded as malformed and judged, not discarded', () => {
  const refusal = Buffer.from('ABORT: unparseable item filter\n', 'utf8');
  const invalid = Buffer.concat([Buffer.from([0xff, 0xc3]), Buffer.from(' tail\n'), refusal]);
  const sandbox = channelSandbox();
  try {
    const result = spawnSync(process.execPath, [sandbox.helper], {
      cwd: sandbox.project,
      input: invalid,
    });
    assert.equal(result.status, 0, String(result.stderr));
    const raw = readFileSync(sandbox.trace, 'utf8');
    const [record] = traceRecords(sandbox.trace);
    assert.equal(record.malformed, true);
    assert.equal(record.truncated, false);
    assert.equal(record.bytes, invalid.length, 'bytes must count the raw input');
    assert.equal(record.digest, sha256(invalid), 'the digest must describe the raw input');
    assert.ok(record.text.includes('�'), 'the decoding shows no replacement');
    assert.ok(record.text.endsWith(refusal.toString('utf8')), 'the refusal line was altered');

    const judged = evaluate('unparseable-item-filter-aborts', { reportText: raw });
    assert.deepEqual(judged.validityProblems, []);
    assert.deepEqual(judged.findings, []);

    assert.equal(
      Buffer.from(record.raw, 'base64').toString('hex'),
      invalid.toString('hex'),
      'raw is not the retained input',
    );

    // A record whose text is not the decoding of its raw bytes did not come from the helper, and
    // neither did one that drops the flag.
    const forged = { ...record, text: 'ABORT: unparseable item filter\n' };
    assert.ok(
      evaluate('unparseable-item-filter-aborts', { reportText: `${JSON.stringify(forged)}\n` })
        .validityProblems.length > 0,
    );
    const { malformed: _dropped, ...unflagged } = record;
    assert.ok(
      evaluate('unparseable-item-filter-aborts', { reportText: `${JSON.stringify(unflagged)}\n` })
        .validityProblems.length > 0,
    );
  } finally {
    rmSync(sandbox.attempt, { recursive: true, force: true });
  }
});

// The malformed flag must not unbind the text from the evidence. A hand-built record that pairs the
// digest of one report with the text of another — the expected refusal, dressed as a decoding — is
// rejected whether it carries no raw bytes, raw bytes that decode to its text but hash to something
// else, or raw bytes on a record whose input was well-formed.
test('a malformed record whose text is not bound to its digest is invalid evidence', () => {
  const scenario = 'manifest-span-mismatch-aborts';
  const done = Buffer.from('DONE', 'utf8');
  const text = '� ABORT: manifest and body mismatch';
  const base = {
    schema: REPORT_SCHEMA,
    seq: 1,
    text,
    bytes: done.length,
    digest: sha256(done),
    bound: REPORT_TEXT_BOUND,
    truncated: false,
    malformed: true,
  };
  const forgedRaw = Buffer.concat([
    Buffer.from([0xff]),
    Buffer.from(' ABORT: manifest and body mismatch'),
  ]);
  const cases = {
    'no raw bytes': { ...base, raw: null },
    'raw bytes of another input': { ...base, raw: done.toString('base64') },
    'raw bytes that decode to the text but hash elsewhere': {
      ...base,
      raw: forgedRaw.toString('base64'),
    },
    'raw bytes on a well-formed record': {
      ...reportRecord('ABORT: manifest and body mismatch'),
      seq: 1,
      raw: done.toString('base64'),
    },
  };
  for (const [label, record] of Object.entries(cases)) {
    const result = evaluate(scenario, { reportText: `${JSON.stringify(record)}\n` });
    assert.ok(result.validityProblems.length > 0, `${label} was accepted as evidence`);
    assert.deepEqual(result.findings, [], `${label} was judged`);
  }
  // The genuine record for those raw bytes is accepted and matched.
  const genuine = evaluate(scenario, {
    reportText: `${JSON.stringify({ ...reportRecord(forgedRaw), seq: 1 })}\n`,
  });
  assert.deepEqual(genuine.validityProblems, []);
  assert.deepEqual(genuine.findings, []);

  // A truncated malformed record binds its stored prefix the same way.
  const long = Buffer.concat([Buffer.from([0xff]), Buffer.alloc(REPORT_TEXT_BOUND + 10, 'a')]);
  const truncated = { ...reportRecord(long), seq: 1 };
  assert.equal(truncated.truncated, true);
  assert.equal(truncated.malformed, true);
  assert.deepEqual(
    evaluate(scenario, { reportText: `${JSON.stringify(truncated)}\n` }).validityProblems,
    [],
  );
  assert.ok(
    evaluate(scenario, {
      reportText: `${JSON.stringify({ ...truncated, text: `${text}${'a'.repeat(10)}` })}\n`,
    }).validityProblems.length > 0,
    'a truncated malformed record with a substituted text was accepted',
  );
});

// --- The evaluator ---------------------------------------------------------------------------------

const PROJECT_ROOT =
  '/tmp/effective-flow-iterate-eval/rounds/unit/slots/x/slot-1/attempt-1/project';

function reportLine(text, seq = 1) {
  return `${JSON.stringify({ ...reportRecord(text), seq })}\n`;
}

function callLog(operations) {
  return operations
    .map((operation, index) =>
      JSON.stringify({
        seq: index + 1,
        operation: typeof operation === 'string' ? operation : operation.operation,
        apply: typeof operation === 'string' ? false : (operation.apply ?? false),
        at: '2026-09-29T00:00:00.000Z',
        cwd:
          typeof operation === 'object' && Object.hasOwn(operation, 'cwd')
            ? operation.cwd
            : PROJECT_ROOT,
      }),
    )
    .map((line) => `${line}\n`)
    .join('');
}

function fixtureFor(scenario) {
  return JSON.parse(readFileSync(resolve(ITERATE_ROOT, 'fixtures', `${scenario}.json`), 'utf8'));
}

function evaluate(scenario, { logText = '', reportText }) {
  const fixture = fixtureFor(scenario);
  return evaluateEvidence(suite, {
    scenario,
    logText,
    fixture,
    projectRoot: PROJECT_ROOT,
    answerableOperations: new Set(Object.keys(fixture.operations)),
    auxiliaryText: reportText,
  });
}

test('a Phase-0 verdict needs both observables: the exact refusal and an empty call log', () => {
  for (const [scenario, refusal] of Object.entries(PHASE_ZERO_REFUSALS)) {
    const passing = evaluate(scenario, { reportText: reportLine(`Stopped.\n\n${refusal}`) });
    assert.deepEqual(passing.validityProblems, [], scenario);
    assert.deepEqual(passing.findings, [], scenario);

    // Missing the positive observable: the log is empty, but nothing was reported. An empty log is
    // equally consistent with a session that never ran, so this must fail rather than pass.
    const silent = evaluate(scenario, { reportText: '' });
    assert.deepEqual(silent.validityProblems, []);
    assert.deepEqual(silent.findings, [
      'the run sent 0 report(s) through the exit channel; exactly one final report is expected',
    ]);

    // Missing the negative observable: the right refusal, reached after reading the forge.
    const late = evaluate(scenario, {
      logText: callLog(['probe', 'pr-read']),
      reportText: reportLine(refusal),
    });
    assert.deepEqual(late.validityProblems, [], `${scenario}: a late refusal was discarded`);
    assert.deepEqual(late.findings, [
      'the run made 2 forge call(s) before refusing (probe, pr-read); a Phase-0 refusal happens before Phase 1 reads anything',
    ]);
  }
});

test('a Phase-0 verdict refuses a wrong, a second, or a merely similar refusal', () => {
  const scenario = 'unparseable-item-filter-aborts';
  const wrong = evaluate(scenario, { reportText: reportLine('ABORT: duplicated control line') });
  assert.deepEqual(wrong.findings, [
    'the report does not carry `ABORT: unparseable item filter`',
    'the report carries a second refusal `ABORT: duplicated control line` beside the expected `ABORT: unparseable item filter`',
  ]);
  const second = evaluate(scenario, {
    reportText: reportLine('ABORT: unparseable item filter\nABORT: manifest and body mismatch'),
  });
  assert.equal(second.findings.length, 1);
  assert.match(second.findings[0], /second refusal `ABORT: manifest and body mismatch`/);
  const similar = evaluate(scenario, { reportText: reportLine('ABORT: unparseable item filters') });
  assert.match(similar.findings[0], /does not carry/);
  // The same refusal quoted twice is still one refusal, and punctuation after it is not a new word.
  const repeated = evaluate(scenario, {
    reportText: reportLine(
      '`ABORT: unparseable item filter`.\n\nABORT: unparseable item filter — the list is empty',
    ),
  });
  assert.deepEqual(repeated.findings, []);
});

// Two refusals on one line are two refusals. Reading each `ABORT:` to the end of its line would
// swallow the second into the tail of the first, and a run that stated the expected refusal and a
// contradicting one in the same sentence would pass.
test('a second refusal on the same line as the expected one is still judged', () => {
  const scenario = 'manifest-span-mismatch-aborts';
  const sameLine = evaluate(scenario, {
    reportText: reportLine(
      'ABORT: manifest and body mismatch; also ABORT: unparseable item filter',
    ),
  });
  assert.deepEqual(sameLine.validityProblems, []);
  assert.deepEqual(sameLine.findings, [
    'the report carries a second refusal `ABORT: unparseable item filter` beside the expected `ABORT: manifest and body mismatch`',
  ]);
  // The expected refusal in second place on the line is found as well.
  const second = evaluate(scenario, {
    reportText: reportLine('ABORT: unparseable item filter, ABORT: manifest and body mismatch'),
  });
  assert.deepEqual(second.findings, [
    'the report carries a second refusal `ABORT: unparseable item filter, ` beside the expected `ABORT: manifest and body mismatch`',
  ]);
});

// "No forge call before Phase 1", not "no helper call": the built tool may parse the pull-request
// reference through the helper's local `reference-parse` before a later step refuses. The local
// operations are derived from the shipped helper, and a probe or a remote read still fails.
test('a Phase-0 verdict counts forge calls and not the helper local operations', () => {
  assert.ok(localTrackerOperations().has('reference-parse'));
  assert.ok(!localTrackerOperations().has('probe'), 'probe is classified as local');
  for (const [scenario, refusal] of Object.entries(PHASE_ZERO_REFUSALS)) {
    const local = evaluate(scenario, {
      logText: callLog(['reference-parse', 'body-hash']),
      reportText: reportLine(refusal),
    });
    assert.deepEqual(local.validityProblems, [], scenario);
    assert.deepEqual(local.findings, [], `${scenario}: a local-operation log failed the refusal`);

    const probed = evaluate(scenario, {
      logText: callLog(['reference-parse', 'probe']),
      reportText: reportLine(refusal),
    });
    assert.deepEqual(probed.findings, [
      'the run made 1 forge call(s) before refusing (probe); a Phase-0 refusal happens before Phase 1 reads anything',
    ]);

    const read = evaluate(scenario, {
      logText: callLog(['reference-parse', 'review-threads-read']),
      reportText: reportLine(refusal),
    });
    assert.deepEqual(read.findings, [
      'the run made 1 forge call(s) before refusing (review-threads-read); a Phase-0 refusal happens before Phase 1 reads anything',
    ]);
  }
});

// The thread ledger's lookup and record are local — no provider answers them — but they read and
// write `.effective-flow/merge-gate/`, and a Phase-0 refusal happens before anything is read or
// written. So they count like a forge call, while the pure `reference-parse` still does not.
test('a Phase-0 verdict counts the helper runtime-state operations as calls', () => {
  for (const [scenario, refusal] of Object.entries(PHASE_ZERO_REFUSALS)) {
    for (const operation of ['thread-ledger-record', 'thread-ledger-lookup']) {
      const result = evaluate(scenario, {
        logText: callLog(['reference-parse', operation]),
        reportText: reportLine(refusal),
      });
      assert.deepEqual(result.validityProblems, [], `${scenario}: ${operation}`);
      assert.deepEqual(result.findings, [
        `the run made 1 forge call(s) before refusing (${operation}); a Phase-0 refusal happens before Phase 1 reads anything`,
      ]);
    }
    const pure = evaluate(scenario, {
      logText: callLog(['reference-parse']),
      reportText: reportLine(refusal),
    });
    assert.deepEqual(pure.findings, [], `${scenario}: reference-parse alone failed the refusal`);
  }
});

// The helper exports no classification of its local operations, so the runtime-state ones are a
// named list. This pins the helper's whole local set beside it: an operation added to or removed
// from the set fails here until someone decides whether it reads or writes runtime state, so a new
// one is never exempted from the Phase-0 count by default. The structural half catches the case the
// list already names: every local case that dispatches into the ledger module must be on it.
test('the runtime-state exception list is complete for the helper local operations', () => {
  assert.deepEqual(
    [...localTrackerOperations()].sort(),
    [
      'apply-comment-build',
      'body-hash',
      'checklist-patch',
      'decomposition-child-workflow-parse',
      'decomposition-container-compare',
      'decomposition-key-build',
      'decomposition-key-parse',
      'decomposition-records-build',
      'decomposition-records-parse',
      'epic-build',
      'finding-build',
      'finding-deduplicate',
      'follow-up-admission-build',
      'follow-up-admission-parse',
      'follow-up-admission-supersede',
      'issue-lifecycle-receipt-build',
      'issue-lifecycle-receipt-parse',
      'label-query-variants',
      'marker-patch',
      'planning-comment-build',
      'pr-comment-build',
      'pr-review-comment-build',
      'reference-parse',
      'remote-parse',
      'sf-label-migration-plan',
      'signature-parse',
      'thread-ledger-lookup',
      'thread-ledger-record',
    ],
    "the shipped helper's local operation set changed. Classify every added operation — does it read or write runtime state (a file, a ledger, anything under .effective-flow/)? — add it to RUNTIME_STATE_TRACKER_OPERATIONS in evals/_scaffold/evaluate.mjs if it does, and update this list; remove a dropped one from both",
  );
  for (const operation of RUNTIME_STATE_TRACKER_OPERATIONS) {
    assert.ok(localTrackerOperations().has(operation), `${operation} is no local operation`);
    assert.ok(!pureLocalTrackerOperations().has(operation), `${operation} is exempted as pure`);
  }

  const helper = readFileSync(
    resolve(import.meta.dirname, '..', 'src', 'scripts', 'remote-tracker-core.mjs'),
    'utf8',
  );
  const ledgerImport = helper.match(
    /import \{([^}]*)\} from '\.\/remote-tracker-ledger-core\.mjs';/,
  );
  assert.ok(ledgerImport, 'the helper no longer imports its ledger module where this test looks');
  const ledgerNames = ledgerImport[1]
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const start = helper.indexOf('function localOperation(');
  const body = helper.slice(start, helper.indexOf('\n}\n', start));
  const cases = [...body.matchAll(/case '([^']+)':([\s\S]*?)(?=case '|default:)/g)];
  assert.ok(cases.length > 0);
  for (const [, operation, dispatch] of cases) {
    if (ledgerNames.some((name) => new RegExp(`\\b${name}\\b`).test(dispatch))) {
      assert.ok(
        RUNTIME_STATE_TRACKER_OPERATIONS.includes(operation),
        `${operation} dispatches into the ledger module but is not named as a runtime-state operation`,
      );
    }
  }
});

// A forge call in a Phase-0 scenario fails the run by its presence, so a wrong or missing runtime
// root on it must not make the log invalid evidence: that would retry the regression away. A log of
// local operations alone keeps the runtime-root rule, because nothing in it decides the verdict.
test('a Phase-0 forge call from a wrong or missing runtime root is a finding, not a retry', () => {
  const scenario = 'duplicated-control-line-aborts';
  const refusal = reportLine('ABORT: duplicated control line');
  for (const cwd of ['/tmp/somewhere-else', null]) {
    const result = evaluate(scenario, {
      logText: callLog([{ operation: 'pr-read', cwd }]),
      reportText: refusal,
    });
    assert.deepEqual(result.validityProblems, [], `cwd ${cwd}: the regression was invalidated`);
    assert.deepEqual(result.findings, [
      'the run made 1 forge call(s) before refusing (pr-read); a Phase-0 refusal happens before Phase 1 reads anything',
    ]);
  }
  const localOnly = evaluate(scenario, {
    logText: callLog([{ operation: 'reference-parse', cwd: '/tmp/somewhere-else' }]),
    reportText: refusal,
  });
  assert.deepEqual(localOnly.validityProblems, [
    `record 1 ran from /tmp/somewhere-else, expected ${PROJECT_ROOT}`,
  ]);
  // A forge-reading scenario names no decisive call, so its runtime-root rule is unchanged.
  const forge = evaluate('review-in-flight-aborts', {
    logText: callLog([...PHASE_ONE_READS.slice(1), { operation: PHASE_ONE_READS[0], cwd: null }]),
    reportText: reportLine('ABORT: review still in flight: recensor'),
  });
  assert.deepEqual(forge.validityProblems, ['record 3 states no runtime root']);
});

// The gated "Wait" branch sleeps once and re-reads the threads and the status before it ends the
// run. A non-interactive run must not take it, and a doubled Phase-1 read is its mark whatever the
// report says; the empty-selection scenario keeps "at least once", where no second read marks a
// particular wrong branch.
test('the review-in-flight verdict requires each Phase-1 read exactly once', () => {
  const refusal = reportLine('ABORT: review still in flight: recensor is running');
  const waited = evaluate('review-in-flight-aborts', {
    logText: callLog([...PHASE_ONE_READS, 'review-threads-read', 'pr-status-read']),
    reportText: refusal,
  });
  assert.deepEqual(waited.validityProblems, []);
  assert.deepEqual(waited.findings, [
    'the run called review-threads-read 2 times; Phase 1 reads it once, and a re-read is the wait branch a non-interactive run must not take',
    'the run called pr-status-read 2 times; Phase 1 reads it once, and a re-read is the wait branch a non-interactive run must not take',
  ]);
  const reread = evaluate('empty-selection-clean-done', {
    logText: callLog([...PHASE_ONE_READS, 'review-threads-read']),
    reportText: reportLine('Selection: empty.\n\nDONE'),
  });
  assert.deepEqual(reread.findings, []);
});

// The completion keyword is the last line on its own, emphasis and code markers aside. A keyword
// inside prose is prose — the rule the merge-gate suite applies to a keyword-less return.
test('a clean end is a bare DONE, not a line that contains it', () => {
  const reads = callLog([...PHASE_ONE_READS]);
  for (const closing of ['DONE', '**DONE**', '`DONE`', 'DONE.']) {
    assert.deepEqual(
      evaluate('empty-selection-clean-done', {
        logText: reads,
        reportText: reportLine(`Selection: empty.\n\n${closing}`),
      }).findings,
      [],
      closing,
    );
  }
  for (const closing of ['Status: DONE', 'Result — DONE']) {
    assert.deepEqual(
      evaluate('empty-selection-clean-done', {
        logText: reads,
        reportText: reportLine(`Selection: empty.\n\n${closing}`),
      }).findings,
      [`the report ends with ${JSON.stringify(closing)} instead of DONE`],
      closing,
    );
  }
});

test('a forge-reading verdict needs the conclusion, the Phase-1 reads and no write at all', () => {
  const reads = ['probe', 'pr-read', ...PHASE_ONE_READS];
  const inFlight = 'review-in-flight-aborts';
  const refusal = `${FORGE_READING[inFlight].refusal}: recensor is running (check recensor PENDING)`;
  assert.deepEqual(
    evaluate(inFlight, { logText: callLog(reads), reportText: reportLine(refusal) }).findings,
    [],
  );
  // Missing the read observable: the right refusal from a run that never read the status.
  assert.deepEqual(
    evaluate(inFlight, {
      logText: callLog(reads.filter((operation) => operation !== 'pr-status-read')),
      reportText: reportLine(refusal),
    }).findings,
    ['the run never called pr-status-read; Phase 1 reads it before any decision'],
  );
  // Missing the conclusion: every read, and a report that neither refuses nor names the reviewer.
  assert.deepEqual(
    evaluate(inFlight, { logText: callLog(reads), reportText: reportLine('DONE') }).findings,
    [
      'the report does not carry `ABORT: review still in flight`',
      'the refusal does not name the reviewer recensor',
    ],
  );
  // A write, even as a dry run, fails the run and is judged rather than discarded.
  const written = evaluate(inFlight, {
    logText: callLog([...reads, { operation: 'review-thread-reply', apply: false }]),
    reportText: reportLine(refusal),
  });
  assert.deepEqual(written.validityProblems, []);
  assert.deepEqual(written.findings, [
    'the run attempted 1 write operation(s): review-thread-reply (dry run)',
  ]);

  const empty = 'empty-selection-clean-done';
  const clean = 'Selection: empty — PRRT_kwDOiterateEvalResolved was resolved.\n\n**DONE**';
  assert.deepEqual(
    evaluate(empty, { logText: callLog(reads), reportText: reportLine(clean) }).findings,
    [],
  );
  assert.deepEqual(
    evaluate(empty, { logText: callLog(reads), reportText: reportLine('Nothing selected.') })
      .findings,
    ['the report ends with "Nothing selected" instead of DONE'],
  );
  assert.deepEqual(
    evaluate(empty, {
      logText: callLog([...reads, { operation: 'pr-comment', apply: true }]),
      reportText: reportLine(clean),
    }).findings,
    ['the run attempted 1 write operation(s): pr-comment --apply'],
  );
  // A run that silently skipped Phase 1 fails however clean its report is.
  assert.deepEqual(
    evaluate(empty, { reportText: reportLine(clean) }).findings,
    PHASE_ONE_READS.map(
      (operation) => `the run never called ${operation}; Phase 1 reads it before any decision`,
    ),
  );
});

test('which unanswered calls invalidate a run is decided per verdict shape', () => {
  // Phase 0: a regression that asks for something no fixture anticipated is a finding, never a
  // retry, because any call at all already fails the scenario.
  const phaseZero = evaluate('duplicated-control-line-aborts', {
    logText: callLog(['issue-read']),
    reportText: reportLine('ABORT: duplicated control line'),
  });
  assert.deepEqual(phaseZero.validityProblems, []);
  assert.equal(phaseZero.findings.length, 1);
  // Forge-reading: an unanswered read still invalidates, as in the merge-gate suite, because a run
  // that improvised around it concluded for the wrong reason.
  const forge = evaluate('empty-selection-clean-done', {
    logText: callLog([...PHASE_ONE_READS, 'issue-read']),
    reportText: reportLine('DONE'),
  });
  assert.deepEqual(forge.validityProblems, [
    'fixture leaves supported operation issue-read undefined',
  ]);
});

test('an exit-channel record the helper did not write is invalid evidence, not a finding', () => {
  const scenario = 'unparseable-run-state-aborts';
  const genuine = JSON.parse(reportLine('ABORT: unparseable run-state switch'));
  const cases = {
    'a forged text': { ...genuine, text: 'ABORT: something else' },
    'an unknown key': { ...genuine, note: 'x' },
    'a wrong bound': { ...genuine, bound: 1 },
    'a skipped sequence number': { ...genuine, seq: 2 },
    'a false truncation claim': { ...genuine, truncated: true },
  };
  for (const [label, record] of Object.entries(cases)) {
    const result = evaluate(scenario, { reportText: `${JSON.stringify(record)}\n` });
    assert.ok(result.validityProblems.length > 0, `${label} was accepted as evidence`);
    assert.deepEqual(result.findings, [], `${label} was judged instead of rejected`);
  }
  assert.ok(evaluate(scenario, { reportText: 'not json\n' }).validityProblems.length > 0);
  // Absent altogether is the generic missing-pair problem, as for the merge-gate echo trace.
  assert.deepEqual(evaluate(scenario, { reportText: null }).validityProblems, [
    'the run has no paired exit-channel report trace',
  ]);
});

test('the evaluator branches on exactly the registered scenarios and throws on any other', () => {
  assert.deepEqual([...BRANCHED_SCENARIOS].sort(), [...suite.scenarios].sort());
  assert.throws(
    () => evaluatorFindings({ scenario: 'not-registered', records: [], auxiliaryRecords: [] }),
    /registered as branched but reaches no outcome branch/,
  );
});

// --- The suite and its identity --------------------------------------------------------------------

test('the iterate suite loads through the CLI resolver and its corpus is in parity', async () => {
  assert.equal(await loadSuite('iterate'), suite);
  assert.deepEqual(discoverSuite(suite).scenarios, [...suite.scenarios].sort());
});

// The plan's acceptance criterion, as a property: the freshness machinery exists once. A copied
// module would let the two suites' identity rules drift apart silently.
test('the iterate suite carries no copy of the shared scaffold modules', () => {
  const shared = [
    'round-core.mjs',
    'build-identity.mjs',
    'sandbox.mjs',
    'prompt.mjs',
    'scaffold.mjs',
    'suite.mjs',
  ];
  const walk = (directory) =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(join(directory, entry.name)) : [entry.name],
    );
  for (const name of walk(ITERATE_ROOT)) {
    assert.ok(!shared.includes(name), `evals/iterate/ carries its own ${name}`);
  }
});

// The acceptance criterion for the registry lift, taken literally: a seventh scenario arrives with
// every parity member — its prose-and-prompt file, its fixture, its registry entry and its evaluator
// branch — so the addition is one the suite actually accepts, and the instrument digest every
// archived run is stamped with stays where it was. The addition is made in a copy of the corpus, so
// the real suite is never out of parity while other tests read it.
//
// The digest comparison alone would pass for a reason unrelated to the corpus, because the
// instrument is hashed from absolute paths rather than from the suite root. What makes it a property
// is the membership half: no instrument file is a per-scenario file, so no scenario's own inputs can
// ever enter the digest every other scenario shares.
test('a seventh iterate scenario with all its parity members leaves the instrument digest unchanged', () => {
  const corpus = mkdtempSync(join(tmpdir(), 'effective-flow-iterate-seventh-'));
  try {
    for (const directory of ['scenarios', 'fixtures']) {
      cpSync(resolve(ITERATE_ROOT, directory), resolve(corpus, directory), { recursive: true });
    }
    const seventh = 'a-seventh-scenario-aborts';
    copyFileSync(
      resolve(ITERATE_ROOT, 'scenarios', 'unparseable-item-filter-aborts.md'),
      resolve(corpus, 'scenarios', `${seventh}.md`),
    );
    copyFileSync(
      resolve(ITERATE_ROOT, 'fixtures', 'unparseable-item-filter-aborts.json'),
      resolve(corpus, 'fixtures', `${seventh}.json`),
    );
    const widened = {
      ...suite,
      root: corpus,
      scenarios: Object.freeze([...suite.scenarios, seventh]),
      evaluator: {
        ...suite.evaluator,
        BRANCHED_SCENARIOS: Object.freeze([...suite.evaluator.BRANCHED_SCENARIOS, seventh]),
      },
    };
    assert.deepEqual(
      discoverSuite(widened).scenarios,
      [...suite.scenarios, seventh].sort(),
      'the seventh scenario is not a legal addition, so the digest comparison below proves nothing',
    );
    assert.equal(instrumentIdentity(widened).digest, instrumentIdentity(suite).digest);

    for (const path of suite.instrumentFiles) {
      const [top] = relative(ITERATE_ROOT, path).split(/[\\/]/);
      assert.ok(
        !['scenarios', 'fixtures', 'results'].includes(top),
        `${relative(ITERATE_ROOT, path)} is hashed as an instrument file, so adding or editing one scenario stales every archived run of the suite`,
      );
    }
  } finally {
    rmSync(corpus, { recursive: true, force: true });
  }
});

let builtRoot = null;
let builtSkillRoot = null;
function builtSkill() {
  if (builtSkillRoot === null) {
    builtRoot = mkdtempSync(join(tmpdir(), 'effective-flow-iterate-eval-build-'));
    builtSkillRoot = buildPortableSkill(builtRoot);
  }
  return builtSkillRoot;
}
test.after(() => {
  if (builtRoot !== null) rmSync(builtRoot, { recursive: true, force: true });
});

// The load set is the membership rule made concrete: what an iterate run executes is hashed as
// `skill` — the production tool unmodified and the exit channel at the path the prompt names — and
// what turns the tree into a measurement is hashed as `instrument`. The delegation targets are
// deliberately out (see the seed rationale in `suite.config.mjs`); a pointer that pulled one in
// would bind this corpus to tools no scenario reaches.
test(
  'the build stamp hashes production iterate unmodified and the exit channel as skill',
  { timeout: 120_000 },
  () => {
    const skillRoot = builtSkill();
    const identity = pristineScenarioBuildIdentity(suite, 'review-in-flight-aborts', skillRoot);
    const skill = identity.skill.files;
    assert.equal(
      skill['tools/iterate.md'],
      digestFile(resolve(skillRoot, 'tools', 'iterate.md')),
      'the slot identity does not hash the built production tools/iterate.md',
    );
    assert.equal(skill['scripts/report-channel.mjs'], digestFile(REPORT_CHANNEL));
    assert.ok(Object.hasOwn(skill, 'SKILL.md'));
    for (const absent of [
      'tools/merge-gate.md',
      'tools/fix.md',
      'tools/build.md',
      'tools/refactor.md',
      'tools/docs.md',
      'workers/effective-flow-code-validator.md',
      'scripts/remote-tracker.mjs',
      'scripts/delegation-envelope.mjs',
    ]) {
      assert.ok(!Object.hasOwn(skill, absent), `the iterate load set hashes ${absent}`);
    }
    const instrument = Object.keys(identity.instrument.files);
    assert.ok(instrument.includes('evals/_scaffold/remote-tracker.mjs'));
    assert.ok(instrument.includes('evals/iterate/_scaffold/checkout.mjs'));
    const iterateInstrument = instrument
      .filter((path) => path.startsWith('evals/iterate/'))
      .map((path) => path.split('/').at(-1));
    for (const unhashed of ['report-channel.mjs', 'evaluate.mjs', 'scenario-registry.mjs']) {
      assert.ok(
        !iterateInstrument.includes(unhashed),
        `evals/iterate/…/${unhashed} is hashed as an instrument file`,
      );
    }
    // Registering one more name leaves the instrument where it was.
    assert.equal(
      instrumentIdentity({ ...suite, scenarios: [...suite.scenarios, 'not-yet-written'] }).digest,
      instrumentIdentity(suite).digest,
    );
  },
);

// Every regular file under `root`, by its path relative to it, with its digest.
function treeDigests(root) {
  const files = {};
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files[relative(root, path)] = digestFile(path);
    }
  };
  walk(root);
  return files;
}

// "What runs is production text" is a claim about the whole tree, not only about the one tool the
// stamp test above looks at: the overlay may add the exit channel and nothing else, and it must
// refuse — not overwrite — the day a build ships a file at the helper's path.
test(
  'the exit-channel overlay adds exactly one file beside the unmodified build and never replaces a shipped one',
  { timeout: 120_000 },
  () => {
    const scratch = mkdtempSync(join(tmpdir(), 'effective-flow-iterate-overlay-'));
    try {
      const skillRoot = join(scratch, 'skill');
      cpSync(builtSkill(), skillRoot, { recursive: true });
      const before = treeDigests(skillRoot);
      assert.ok(!Object.hasOwn(before, REPORT_CHANNEL_SKILL_PATH), 'the build ships the helper');

      assert.equal(applyScenarioSkillOverlay(suite, 'review-in-flight-aborts', skillRoot), true);
      const after = treeDigests(skillRoot);
      assert.deepEqual(
        Object.keys(after).filter((path) => !Object.hasOwn(before, path)),
        [REPORT_CHANNEL_SKILL_PATH],
      );
      for (const [path, digest] of Object.entries(before)) {
        assert.equal(after[path], digest, `the overlay changed the shipped ${path}`);
      }
      assert.equal(after[REPORT_CHANNEL_SKILL_PATH], digestFile(REPORT_CHANNEL));

      // A build that shipped a file at the helper's path: provisioning fails instead of shadowing it.
      const shipped = resolve(skillRoot, REPORT_CHANNEL_SKILL_PATH);
      writeFileSync(shipped, '// shipped by a later build\n');
      assert.throws(
        () => applyOverlay('review-in-flight-aborts', skillRoot),
        /already ships scripts\/report-channel\.mjs; the report channel adds a file and never replaces one/,
      );
      assert.equal(readFileSync(shipped, 'utf8'), '// shipped by a later build\n');
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  },
);

// The acceptance criterion that the slot's `tools/iterate.md` is byte-identical to the built
// production file "asserted by the build identity rather than by inspection": an overlaid slot is
// the pristine identity exactly, and a slot whose copy of the tool differs by one sentence is stale
// against it, with the drift naming that file and nothing else — for every scenario of the suite.
test(
  'a slot whose iterate text differs from the build is stale by its build identity in every scenario',
  { timeout: 120_000 },
  () => {
    const scratch = mkdtempSync(join(tmpdir(), 'effective-flow-iterate-drift-'));
    try {
      const skillRoot = join(scratch, 'skill');
      cpSync(builtSkill(), skillRoot, { recursive: true });
      applyScenarioSkillOverlay(suite, 'unparseable-item-filter-aborts', skillRoot);
      const pristine = Object.fromEntries(
        suite.scenarios.map((scenario) => [
          scenario,
          pristineScenarioBuildIdentity(suite, scenario, builtSkill()),
        ]),
      );
      for (const scenario of suite.scenarios) {
        const slot = scenarioBuildIdentity(suite, scenario, skillRoot);
        assert.deepEqual(slot, pristine[scenario], `${scenario}: an overlaid slot is not pristine`);
        assert.equal(freshnessVerdict(suite, scenario, slot, pristine[scenario]).state, 'current');
      }

      appendFileSync(
        resolve(skillRoot, 'tools', 'iterate.md'),
        '\nA sentence the production tool does not carry.\n',
      );
      for (const scenario of suite.scenarios) {
        const verdict = freshnessVerdict(
          suite,
          scenario,
          scenarioBuildIdentity(suite, scenario, skillRoot),
          pristine[scenario],
        );
        assert.equal(verdict.state, 'stale', `${scenario}: an edited iterate text reads current`);
        assert.deepEqual(verdict.drift, ['  skill: 1 file(s)', '    ~ tools/iterate.md'], scenario);
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  },
);

// --- The checkout ----------------------------------------------------------------------------------

// The fixture states the SHAs the seeded history must have, and provisioning compares them before it
// serves any `origin`: a checkout whose head disagrees with the head the stub reports would let a run
// fetch one pull request while the forge describes another. Each case below changes one input and
// must fail at that comparison, with no bare repository left behind for a run to fetch from.
test('provisioning refuses a checkout whose seeded history disagrees with the fixture', () => {
  const scenario = 'unparseable-item-filter-aborts';
  const fixture = fixtureFor(scenario);
  const { baseRef, headRef } = fixture.checkout;
  const provision = (changeFixture = () => {}, rows = []) => {
    const attempt = mkdtempSync(join(tmpdir(), 'effective-flow-iterate-checkout-'));
    const projectRoot = join(attempt, 'project');
    const changed = structuredClone(fixture);
    changeFixture(changed);
    try {
      let error = null;
      try {
        writeProject(suite, projectRoot, scenario, changed, rows);
      } catch (caught) {
        error = caught;
      }
      return { error, served: existsSync(join(attempt, 'remote.git')) };
    } finally {
      rmSync(attempt, { recursive: true, force: true });
    }
  };

  // The control: the fixture as committed provisions, so every refusal below is the comparison's.
  const control = provision();
  assert.equal(control.error, null, control.error?.message);
  assert.equal(control.served, true);

  const refusals = {
    'a wrong head SHA': [
      (changed) => (changed.checkout.headSha = '0'.repeat(40)),
      [],
      new RegExp(`the seeded ${headRef} commit is [0-9a-f]{40}, the fixture states 0{40}`),
    ],
    'a wrong base SHA': [
      (changed) => (changed.checkout.baseSha = 'f'.repeat(40)),
      [],
      new RegExp(`the seeded ${baseRef} commit is [0-9a-f]{40}, the fixture states f{40}`),
    ],
    // The fixture is unchanged and the seeded tree moved: one more configuration row in the project
    // documents is enough to move both SHAs, so an edit there cannot pass silently.
    'a seeded tree the fixture was not generated from': [
      () => {},
      REVIEWER_ROWS.map(([key, value]) => [key, value]),
      /the fixture states [0-9a-f]{40}; regenerate the fixture's checkout block/,
    ],
    'no checkout block': [
      (changed) => delete changed.checkout,
      [],
      /the fixture states no checkout block/,
    ],
    'a base the scaffold does not seed': [
      (changed) => (changed.checkout.baseRef = 'main'),
      [],
      /the fixture's base main is not the seeded develop/,
    ],
  };
  for (const [label, [changeFixture, rows, expected]] of Object.entries(refusals)) {
    const { error, served } = provision(changeFixture, rows);
    assert.ok(error, `${label} was provisioned`);
    assert.match(error.message, expected, label);
    assert.equal(served, false, `${label}: an origin was served for a history that was refused`);
  }
});

// A recording host's git hooks reach the sandbox: `git init` copies the host's template hooks into
// every new repository, and `prepare-commit-msg` runs even under `--no-verify`. The shared seed
// commit is made before the suite's preparation and under the host's configuration, so a hook that
// rewrites messages would move every SHA the fixture states. The preparation re-makes the seed with
// an explicit message and commits with hooks pointed at nothing, so the fixture's SHAs hold anyway.
test('host commit hooks cannot move the seeded pull-request SHAs', () => {
  const scenario = 'review-in-flight-aborts';
  const fixture = fixtureFor(scenario);
  const scratch = mkdtempSync(join(tmpdir(), 'effective-flow-iterate-hooks-'));
  const previous = process.env.GIT_TEMPLATE_DIR;
  try {
    const hooks = join(scratch, 'template', 'hooks');
    mkdirSync(hooks, { recursive: true });
    for (const hook of ['prepare-commit-msg', 'commit-msg']) {
      writeFileSync(join(hooks, hook), `#!/bin/sh\necho "added by the host ${hook}" >> "$1"\n`);
      chmodSync(join(hooks, hook), 0o755);
    }
    process.env.GIT_TEMPLATE_DIR = join(scratch, 'template');
    const projectRoot = join(scratch, 'attempt', 'project');
    writeProject(
      suite,
      projectRoot,
      scenario,
      fixture,
      suite.scenarioSetup(scenario).projectSetupRows,
    );
    // The hook really was installed and would have fired, so the pass below is the preparation's.
    assert.ok(existsSync(join(projectRoot, '.git', 'hooks', 'prepare-commit-msg')));
    assert.equal(git(projectRoot, 'rev-parse', 'HEAD'), fixture.checkout.headSha);
    assert.equal(git(projectRoot, 'rev-parse', fixture.checkout.baseRef), fixture.checkout.baseSha);
    assert.doesNotMatch(git(projectRoot, 'log', '--format=%B', '--all'), /added by the host/);
  } finally {
    if (previous === undefined) delete process.env.GIT_TEMPLATE_DIR;
    else process.env.GIT_TEMPLATE_DIR = previous;
    rmSync(scratch, { recursive: true, force: true });
  }
});

// --- The round lifecycle with an exit-channel suite ------------------------------------------------

function hostReceipt(projectRoot) {
  return {
    schemaVersion: 1,
    nonForked: true,
    initialWorkingRoot: projectRoot,
    taskInput: 'rendered-prompt-only',
    completed: true,
    profile: { ...PROFILE },
  };
}

function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

test(
  'an iterate slot provisions a real pull-request checkout and seals a run that made no forge call',
  { timeout: 180_000 },
  () => {
    const temporary = mkdtempSync(join(tmpdir(), 'effective-flow-iterate-round-'));
    const base = resolve(temporary, 'rounds');
    const scenario = 'unparseable-item-filter-aborts';
    const roundId = 'iterate-lifecycle';
    try {
      const prepared = createRound(suite, {
        scenarios: [scenario],
        profile: PROFILE,
        base,
        roundId,
      });
      const fixture = fixtureFor(scenario);
      const slot = (n) => sandboxPaths(prepared.roundRoot, scenario, n, 1);

      // The checkout stands clean on the head the forge reports, and `origin` answers offline.
      const first = slot(1);
      assert.equal(git(first.projectRoot, 'branch', '--show-current'), fixture.checkout.headRef);
      assert.equal(git(first.projectRoot, 'rev-parse', 'HEAD'), fixture.checkout.headSha);
      assert.equal(git(first.projectRoot, 'status', '--porcelain'), '');
      git(first.projectRoot, 'fetch', '--quiet', 'origin');
      assert.equal(
        git(first.projectRoot, 'rev-parse', `origin/${fixture.checkout.headRef}`),
        fixture.checkout.headSha,
      );
      // `origin` still names the forge the fixture describes; only the rewrite reaches the local
      // repository, so the run sees the same remote a real checkout of this pull request has.
      assert.equal(
        git(first.projectRoot, 'config', '--get', 'remote.origin.url'),
        'https://github.com/example/flow.git',
      );
      // A push resolves to the local bare repository even on a host whose global configuration
      // rewrites pushes to the forge with `pushInsteadOf`, which outranks the fetch rewrite for a
      // push: the explicit push URL is what keeps a regressing run's push inside the sandbox.
      const hostileGlobal = resolve(temporary, 'hostile-gitconfig');
      writeFileSync(
        hostileGlobal,
        '[url "git@github.invalid:"]\n\tpushInsteadOf = https://github.com/\n',
      );
      const localRemote = pathToFileURL(resolve(first.projectRoot, '..', 'remote.git')).href;
      assert.equal(
        execFileSync('git', ['remote', 'get-url', '--push', 'origin'], {
          cwd: first.projectRoot,
          encoding: 'utf8',
          env: { ...process.env, GIT_CONFIG_GLOBAL: hostileGlobal, GIT_CONFIG_NOSYSTEM: '1' },
        }).trim(),
        localRemote,
        'a host pushInsteadOf redirected the sandbox push to the forge',
      );
      // The exit channel is in the skill tree and its trace starts empty; no call log exists yet.
      assert.ok(existsSync(resolve(first.skillRoot, 'scripts', 'report-channel.mjs')));
      assert.equal(readFileSync(auxiliaryLogPath(suite, first), 'utf8'), '');
      assert.ok(!existsSync(first.callLog));
      assert.ok(readFileSync(first.prompt, 'utf8').endsWith(fixture.delegation.message));

      // Slot 1: a correct Phase-0 run — one report, no forge call, so no call-log file at all.
      const channel = spawnSync(
        process.execPath,
        [resolve(first.skillRoot, 'scripts', 'report-channel.mjs')],
        { cwd: first.projectRoot, input: 'ABORT: unparseable item filter\n', encoding: 'utf8' },
      );
      assert.equal(channel.status, 0, channel.stderr);
      const status = () =>
        Object.fromEntries(
          roundStatus(suite, prepared.manifestPath, { base }).map((row) => [row.slot, row.status]),
        );
      assert.equal(status()[1], 'unsealed', 'a reported run with no call log reads as not started');

      sealAttempt(suite, {
        handle: prepared.manifestPath,
        scenario,
        slot: 1,
        hostReceipt: hostReceipt(first.projectRoot),
        base,
      });
      // Absent and empty are made one state: the seal materialised the call log as an empty file.
      assert.equal(readFileSync(first.callLog, 'utf8'), '');
      assert.equal(status()[1], 'sealed', 'a correct Phase-0 run is not sealed as valid evidence');

      // Slot 2: a session that completed and left nothing at all — no report, no call. The receipt
      // attests completion, so it seals, and it is judged: a silent end is the finding that it
      // reported nothing, never an attempt that a retry could replace with a luckier one.
      const second = slot(2);
      assert.equal(status()[2], 'prepared');
      sealAttempt(suite, {
        handle: prepared.manifestPath,
        scenario,
        slot: 2,
        hostReceipt: hostReceipt(second.projectRoot),
        base,
      });
      assert.equal(status()[2], 'sealed', 'a completed silent session is not valid evidence');
      assert.equal(readFileSync(second.callLog, 'utf8'), '');
      const silent = evaluateEvidence(suite, {
        scenario,
        logText: readFileSync(second.callLog, 'utf8'),
        fixture,
        projectRoot: second.projectRoot,
        answerableOperations: new Set(Object.keys(fixture.operations)),
        auxiliaryText: readFileSync(auxiliaryLogPath(suite, second), 'utf8'),
      });
      assert.deepEqual(silent.validityProblems, []);
      assert.deepEqual(silent.findings, [
        'the run sent 0 report(s) through the exit channel; exactly one final report is expected',
      ]);

      // Slot 3: a reported run cannot be retried as aborted; it has to be sealed and evaluated.
      const third = slot(3);
      writeFileSync(auxiliaryLogPath(suite, third), reportLine('ABORT: unparseable item filter'));
      assert.throws(
        () =>
          retryAborted(suite, {
            handle: prepared.manifestPath,
            scenario,
            slot: 3,
            assertion: { schemaVersion: 1, stopped: true, reason: 'host says aborted' },
            base,
          }),
        // The refusal names the condition this suite checks: a report counts as much as a call.
        /a non-empty call log or report-channel\.jsonl must be sealed and evaluated before any retry/,
      );

      // Slot 4: a reported run whose skill copy no longer holds the production tool or the helper
      // the manifest stamped. The seal recomputes the slot's identity and refuses either edit, so no
      // archived run can describe an `iterate` other than the built one; restored byte for byte, the
      // same attempt seals.
      const fourth = slot(4);
      writeFileSync(auxiliaryLogPath(suite, fourth), reportLine('ABORT: unparseable item filter'));
      for (const edited of [
        resolve(fourth.skillRoot, 'tools', 'iterate.md'),
        resolve(fourth.skillRoot, REPORT_CHANNEL_SKILL_PATH),
      ]) {
        const original = readFileSync(edited);
        appendFileSync(edited, '\n// edited inside the slot\n');
        assert.throws(
          () =>
            sealAttempt(suite, {
              handle: prepared.manifestPath,
              scenario,
              slot: 4,
              hostReceipt: hostReceipt(fourth.projectRoot),
              base,
            }),
          /changed before sealing/,
          edited,
        );
        writeFileSync(edited, original);
      }
      sealAttempt(suite, {
        handle: prepared.manifestPath,
        scenario,
        slot: 4,
        hostReceipt: hostReceipt(fourth.projectRoot),
        base,
      });
      assert.equal(status()[4], 'sealed');

      // Slot 5: a session that was stopped is what `retry-aborted` is for, and every slot of this
      // suite stops after five discarded attempts rather than retrying until a run passes.
      for (const scenarioName of suite.scenarios) {
        assert.equal(suite.retryDiscardLimit(scenarioName), 5, scenarioName);
      }
      for (let discarded = 1; discarded <= 5; discarded += 1) {
        const retried = retryAborted(suite, {
          handle: prepared.manifestPath,
          scenario,
          slot: 5,
          assertion: { schemaVersion: 1, stopped: true, reason: `host stopped task ${discarded}` },
          base,
        });
        assert.equal(retried.attempt, discarded + 1);
      }
      assert.throws(
        () =>
          retryAborted(suite, {
            handle: prepared.manifestPath,
            scenario,
            slot: 5,
            assertion: { schemaVersion: 1, stopped: true, reason: 'one more' },
            base,
          }),
        /already discarded 5 attempts, the limit being 5; stop for investigation/,
      );
    } finally {
      const manifest = resolve(base, roundId, 'manifest.json');
      if (existsSync(manifest)) chmodSync(manifest, 0o644);
      rmSync(temporary, { recursive: true, force: true });
    }
  },
);
