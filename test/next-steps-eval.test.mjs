import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import {
  buildPortableSkill,
  pristineScenarioBuildIdentity,
} from '../evals/_scaffold/build-identity.mjs';
import { renderPrompt, promptTemplate } from '../evals/_scaffold/prompt.mjs';
import { provisionSlot } from '../evals/_scaffold/scaffold.mjs';
import { discoverSuite, REQUIRED_RUNS } from '../evals/_scaffold/suite.mjs';
import { loadSuite } from '../evals/_scaffold/suite-loader.mjs';
import { evaluateEvidence } from '../evals/_scaffold/evaluate.mjs';
import { reportRecord } from '../evals/iterate/_scaffold/report-channel.mjs';
import {
  EXPECTATIONS,
  parseAuxiliary,
  findings,
  reportFindings,
  recommendationBlock,
} from '../evals/next-steps/_scaffold/evaluate.mjs';
import {
  captureState,
  STATE_FILE,
  parseState,
  stateFindings,
  treeState,
} from '../evals/next-steps/_scaffold/state.mjs';
import { parseReference } from '../src/scripts/remote-tracker-shared-core.mjs';
import suite from '../evals/next-steps/suite.config.mjs';
const ROOT = resolve(import.meta.dirname, '../evals/next-steps');
const fixtureFor = (name) =>
  JSON.parse(readFileSync(resolve(ROOT, 'fixtures', `${name}.json`), 'utf8'));
function correctReport(name) {
  const expected = EXPECTATIONS[name];
  if (expected.first === null)
    return 'Lauf abgeschlossen. Die Quelle other/renovate-config liegt in einem anderen Repository; der bekannte Kontext erlaubt keinen Zielwechsel.';
  const reasons = {
    'q2a-canonical-record-lags-merged': 'Q2a erfassen und Q2b vorbereiten, ohne Aktivierung.',
    'active-local-next-ready-slice': 'Paket B nach geliefertem A dokumentieren.',
    'implemented-archive-needs-reconciliation': 'Widerspruch im archivierten Plan abgleichen.',
    'missing-association-valid-fallback': 'Die Lieferung von PR 42 prüfen.',
    'unreadable-associated-plan-fallback': 'Die Lieferung von PR 42 prüfen.',
    'ambiguous-associated-plans-fallback': 'Die Lieferung von PR 42 prüfen.',
    'approval-and-dependency-block-execution': 'Fehlende Freigabe und Abhängigkeit Q0 klären.',
    'current-pr-delivery-leads-next-slice': 'Die Lieferung von PR 42 abschließen.',
    'actual-postmerge-reconciliation-reentry': 'Den offenen Issue-Status nur beobachten.',
    'external-issue-identity-retained': 'Das Linear-Paket OPS-17 vor Umsetzung klären.',
  };
  const limitation = name.startsWith('missing-')
    ? 'Kein Quellplan wurde zugeordnet.\n'
    : name.startsWith('unreadable-')
      ? 'Der zugeordnete Plan ist nicht mehr verfügbar.\n'
      : name.startsWith('ambiguous-')
        ? 'Die Zuordnung der zwei Pläne ist mehrdeutig.\n'
        : '';
  let report = `Lauf abgeschlossen.\n${limitation}\n## Nächste Schritte\n\n- \`effective-flow ${expected.first}\` — ${reasons[name]}`;
  if (expected.exactCount === 2)
    report += `\n- \`effective-flow ${expected.second[0]}\` — Das unabhängige Linear-Paket vor Umsetzung klären.`;
  return report;
}
const untouched = {
  schema: 'effective-flow.next-steps-state/1',
  before: {},
  after: {},
  errors: [],
};

test('the bounded semantic suite registers eleven complete scenarios and keeps five real runs per scenario', async () => {
  assert.equal((await loadSuite('next-steps')).name, 'next-steps');
  assert.equal(discoverSuite(suite).scenarios.length, 11);
  assert.equal(REQUIRED_RUNS, 5);
  assert.deepEqual(suite.expectedProfile, {
    harness: 'codex-cli',
    model: 'gpt-6.1-sol',
    reasoningEffort: 'high',
    reportedVersion: '0.159.3',
    toolPolicy:
      'workspace-write;approval-never;network-disabled;isolated-home;attempt-root-writable;ignore-user-config;ignore-rules;ephemeral',
  });
});

test('completed-run prompts expose only observed facts and load the unmodified production contract', () => {
  for (const name of suite.scenarios) {
    const template = promptTemplate(resolve(ROOT, 'scenarios', `${name}.md`));
    const prompt = renderPrompt(template, {
      skillRoot: '/tmp/test/skill',
      projectRoot: '/tmp/test/project',
    });
    assert.match(
      prompt,
      /unmodified built recommendation contract at \/tmp\/test\/skill\/shared\/next-steps\.md/,
    );
    assert.doesNotMatch(prompt, /Expected outcome|First option:|expectedProfile|EXPECTATIONS/);
    assert.equal(fixtureFor(name).snapshot.languageChat, 'de');
    assert.match(prompt, /Resolved chat language is de;/);
    assert.match(
      suite.projectDocuments({ scenario: name, rows: [] }).setupAdr,
      /language\.chat \| de \|/,
    );
  }
  assert.ok(suite.loadSetSeeds.includes('shared/next-steps.md'));
  assert.ok(suite.loadSetSeeds.includes('shared/plan-reference-routing.md'));
  assert.equal(
    suite.loadSetSeeds.some((path) => path.startsWith('tools/')),
    false,
  );
});

test('every semantic oracle accepts its concrete invocation and rejects a wrong first option', () => {
  for (const name of suite.scenarios) {
    const text = correctReport(name);
    assert.deepEqual(reportFindings(name, [reportRecord(text)]), [], name);
    const wrong =
      EXPECTATIONS[name].first === null
        ? text + '\n## Nächste Schritte\n\n- `effective-flow plan-issue #37` — Den Plan klären.'
        : text.replace(`effective-flow ${EXPECTATIONS[name].first}`, 'effective-flow open-plans');
    assert.ok(
      reportFindings(name, [reportRecord(wrong)]).some((finding) =>
        /first option|no valid invocation/.test(finding),
      ),
      name,
    );
  }
});

test('the oracle judges final invocation options instead of narrative mentions and allows negative authority wording', () => {
  const name = 'q2a-canonical-record-lags-merged';
  const correct = correctReport(name);
  assert.deepEqual(
    reportFindings(name, [
      reportRecord(
        `Kein wiederholtes effective-flow merge-gate 42; keine Aktivierung E.\n${correct}`,
      ),
    ]),
    [],
  );
  const incorrect = correct.replace(
    'effective-flow plan-issue #37',
    'effective-flow merge-gate 42',
  );
  assert.ok(
    reportFindings(name, [
      reportRecord(`effective-flow plan-issue #37 steht im alten Bericht.\n${incorrect}`),
    ]).length > 0,
  );
  const reasonless = correct.replace(
    'Q2a erfassen und Q2b vorbereiten, ohne Aktivierung.',
    'Den nächsten Schritt vorbereiten.',
  );
  assert.equal(
    reportFindings(name, [reportRecord(reasonless)]).filter((message) =>
      message.includes('omit package token'),
    ).length,
    2,
  );
  assert.ok(
    reportFindings(name, [
      reportRecord(correct + '\nNach dem Block kommt weiterer Berichtstext.'),
    ]).some((message) => message.includes('non-option')),
  );
});

test('recommendation shape rejects duplicates, extra options, invalid command identity and activation', () => {
  const name = 'q2a-canonical-record-lags-merged',
    text = correctReport(name);
  for (const bad of [
    text + '\n- `effective-flow plan-issue #37` — Den Plan klären.',
    text +
      '\n- `effective-flow review 42` — Den PR prüfen.\n- `effective-flow iterate 42` — Den PR ändern.',
    text.replace('effective-flow plan-issue', 'effective-flow plane-issue'),
    text.replace('ohne Aktivierung.', 'Aktiviere E jetzt.'),
  ])
    assert.ok(reportFindings(name, [reportRecord(bad)]).length > 0, bad);
  assert.deepEqual(
    recommendationBlock(text).options.map((option) => option.invocation),
    ['plan-issue #37'],
  );
});

test('the final structural block accepts varied short German headings without a heading catalogue', () => {
  const name = 'q2a-canonical-record-lags-merged';
  for (const heading of [
    '## Weiteres Vorgehen',
    '**Weiteres Vorgehen:**',
    'Weiteres Vorgehen',
    '## Empfohlene nächste Schritte',
    '## Nächste Optionen',
  ]) {
    const text = correctReport(name).replace('## Nächste Schritte', heading);
    assert.deepEqual(reportFindings(name, [reportRecord(text)]), [], heading);
  }
  const narrative =
    'Lauf abgeschlossen. Weiteres Vorgehen wäre effective-flow plan-issue #37, um Q2a zu erfassen und Q2b vorzubereiten.';
  assert.ok(reportFindings(name, [reportRecord(narrative)]).length > 0);
});

test('the selector oracle accepts valid German outside former word lists and leaves output language to qualitative review', () => {
  const name = 'ambiguous-associated-plans-fallback';
  const german =
    'Die Planbasis ist mehrdeutig.\n\n## Fortfahren\n\n`effective-flow merge-gate #42` — PR #42 integrieren.';
  assert.deepEqual(reportFindings(name, [reportRecord(german)], fixtureFor(name)), []);
  const q2a = 'q2a-canonical-record-lags-merged';
  const english = correctReport(q2a)
    .replace('Nächste Schritte', 'Next steps')
    .replace('Q2a erfassen und Q2b vorbereiten, ohne Aktivierung.', 'Record Q2a and prepare Q2b.');
  // This establishes the automated boundary, not compliance with the German chat-language contract.
  assert.deepEqual(reportFindings(q2a, [reportRecord(english)], fixtureFor(q2a)), []);
});

test('narrative and quoted commands cannot replace a final structured block and extra blocks or footers fail', () => {
  const name = 'q2a-canonical-record-lags-merged';
  const correct = correctReport(name);
  const option = correct.split('\n').at(-1);
  for (const invalid of [
    `## Ergebnis\nDer Bericht nennt effective-flow plan-issue #37 für Q2a und Q2b.`,
    `Weiteres Vorgehen wäre effective-flow plan-issue #37\n${option}`,
    `\`\`\`markdown\n${correct}\n\`\`\``,
    `\`\`\`markdown\n${correct}`,
    `${correct}\nWeiterer Berichtstext.`,
    `${correct}\n\n## Empfohlene nächste Schritte\n${option}`,
  ])
    assert.ok(reportFindings(name, [reportRecord(invalid)]).length > 0, invalid);
});

test('absolute plan arguments preserve exact slot artifact identity including the macOS tmp alias after deletion', () => {
  const root = '/tmp/removed-next-steps-slot/project';
  function judged(name, argument, projectRoot = root) {
    const invocation = EXPECTATIONS[name].first;
    const tool = invocation.split(' ', 1)[0];
    const text = correctReport(name).replace(
      `effective-flow ${invocation}`,
      `effective-flow ${tool} ${argument}`,
    );
    const parsed = parseAuxiliary(
      JSON.stringify({ ...reportRecord(text), seq: 1 }) + '\n',
      projectRoot,
    );
    assert.deepEqual(parsed.problems, []);
    return reportFindings(name, parsed.records);
  }
  for (const name of [
    'active-local-next-ready-slice',
    'implemented-archive-needs-reconciliation',
    'approval-and-dependency-block-execution',
  ]) {
    const path = EXPECTATIONS[name].first.split(' ').slice(1).join(' ');
    assert.deepEqual(judged(name, `${root}/${path}`), []);
    assert.deepEqual(judged(name, `/private${root}/${path}`), []);
    assert.deepEqual(judged(name, `${root}/${path}`, `/private${root}`), []);
    for (const foreign of [
      `/tmp/another-slot/project/${path}`,
      `${root}-foreign/${path}`,
      `/home/other/${path}`,
      `${root}/unrelated/${path.split('/').at(-1)}`,
      `${root}/docs/plan/../plan/${path.split('/').at(-1)}`,
      path.split('/').at(-1),
    ])
      assert.ok(judged(name, foreign).length > 0, foreign);
    const absolute = correctReport(name).replace(path, `${root}/${path}`);
    assert.ok(reportFindings(name, [reportRecord(absolute)]).length > 0, 'no trusted root');
    const forged = { ...reportRecord(absolute), seq: 1, projectRoot: root };
    assert.ok(parseAuxiliary(JSON.stringify(forged) + '\n', root).problems.length > 0);
  }
  assert.ok(judged('current-pr-delivery-leads-next-slice', `${root}/42`).length > 0);
});

test('operational instructions anywhere in the report fail while local refusal and quotations remain valid', () => {
  const name = 'q2a-canonical-record-lags-merged';
  const correct = correctReport(name);
  for (const instruction of [
    'Aktiviere E jetzt.',
    'Nicht erneut mergen. Aktiviere E jetzt.',
    'Die Dokumentation nicht ändern, aber starte Q2b jetzt.',
    'Activate E now.',
    'Q2c jetzt starten.',
    'Aktiviere `E` jetzt.',
  ]) {
    assert.ok(
      reportFindings(name, [reportRecord(`${instruction}\n${correct}`)]).some((message) =>
        message.includes('operational activation'),
      ),
      instruction,
    );
  }
  for (const refusal of [
    'Die Freigabe fehlt; aktiviere E nicht.',
    'Approval missing, do not activate E.',
    'Nicht E aktivieren.',
    'E aktivieren ist nicht freigegeben.',
    '„Aktiviere E jetzt.“ ist nur zitierter Quelltext.',
    'Die Quelle sagt "Activate E now."; das ist keine Freigabe.',
    '> Aktiviere E jetzt.',
    '`Aktiviere E jetzt.` ist ein Beispiel.',
    '```text\nAktiviere E jetzt.\n```',
  ])
    assert.deepEqual(reportFindings(name, [reportRecord(`${refusal}\n${correct}`)]), [], refusal);
});

test('owning repository and external identities follow the real reference parser without target switching', () => {
  const scenario = 'cross-repository-context-cannot-switch';
  const fixture = fixtureFor(scenario);
  const reference = fixture.snapshot.sourceAssociation.reference;
  assert.throws(
    () => parseReference(reference, { expectedKind: 'issue', repository: fixture.repository }),
    (error) => error.code === 'REFERENCE_REPOSITORY_MISMATCH',
  );
  assert.equal(
    parseReference(reference, {
      expectedKind: 'issue',
      repository: { host: 'github.com', owner: 'other', repository: 'renovate-config' },
    }).number,
    37,
  );
  assert.deepEqual(reportFindings(scenario, [reportRecord(correctReport(scenario))]), []);
  for (const argument of ['#37', reference]) {
    assert.ok(
      reportFindings(scenario, [
        reportRecord(
          correctReport(scenario) +
            `\n## Nächste Schritte\n\n- \`effective-flow plan-issue ${argument}\` — Den Plan klären.`,
        ),
      ]).length > 0,
    );
  }
  const name = 'external-issue-identity-retained',
    text = correctReport(name);
  for (const bad of [
    text.replace('plan-issue OPS-17', 'plan-issue #17'),
    text.replace('plan-issue OPS-17', 'plan-issue 17'),
  ])
    assert.ok(reportFindings(name, [reportRecord(bad)]).length > 0);
});

test('forge recommendation references use the production parser for the exact owning entity and bind its leaf', () => {
  assert.ok(
    suite.instrumentFiles.includes(
      resolve(ROOT, '../../src/scripts/remote-tracker-shared-core.mjs'),
    ),
  );
  for (const [name, tool, number, segment] of [
    ['ambiguous-associated-plans-fallback', 'merge-gate', 42, 'pull'],
    ['q2a-canonical-record-lags-merged', 'plan-issue', 37, 'issues'],
  ]) {
    const fixture = fixtureFor(name);
    const invocation = EXPECTATIONS[name].first;
    const judged = (reference) =>
      reportFindings(
        name,
        [reportRecord(correctReport(name).replace(invocation, `${tool} ${reference}`))],
        fixture,
      );
    for (const reference of [
      String(number),
      `#${number}`,
      `https://github.com/example/flow/${segment}/${number}`,
    ])
      assert.deepEqual(judged(reference), [], reference);
    for (const reference of [
      `#${number + 1}`,
      `https://github.com/other/flow/${segment}/${number}`,
      `https://other.example/example/flow/${segment}/${number}`,
      `https://github.com/example/flow/${segment === 'pull' ? 'issues' : 'pull'}/${number}`,
      `https://github.com/example/flow/blob/main/${number}`,
    ])
      assert.ok(judged(reference).length > 0, reference);
  }
  const name = 'ambiguous-associated-plans-fallback';
  const text = correctReport(name) + '\n- `effective-flow iterate #42` — PR #42 weiter bearbeiten.';
  assert.deepEqual(reportFindings(name, [reportRecord(text)], fixtureFor(name)), []);
  const external = 'external-issue-identity-retained';
  assert.ok(
    reportFindings(
      external,
      [
        reportRecord(
          correctReport(external).replace('OPS-17', 'https://github.com/example/flow/issues/17'),
        ),
      ],
      fixtureFor(external),
    ).length > 0,
  );
});

test('captured standalone backticked options are valid while narrative, quoted, footer and duplicate forms remain invalid', () => {
  const name = 'actual-postmerge-reconciliation-reentry';
  const standalone =
    'Paket A wurde erfolgreich abgeschlossen und mit PR #42 zusammengeführt.\n\nDer Abschlussstatus des verknüpften Issues konnte nicht beobachtet werden.\n\n## Nächste Schritte\n\n`effective-flow merge-gate 42` — Verknüpften Issue-Status nach dem Merge ausschließlich lesend erneut prüfen.';
  assert.deepEqual(reportFindings(name, [reportRecord(standalone)], fixtureFor(name)), []);
  const option = standalone.split('\n').at(-1);
  for (const bad of [
    standalone.replace(option, `Im alten Bericht stand ${option}`),
    standalone.replace(option, `> ${option}`),
    standalone + '\nWeiterer Berichtstext.',
    standalone + `\n${option}`,
  ])
    assert.ok(reportFindings(name, [reportRecord(bad)], fixtureFor(name)).length > 0, bad);
  const cross = 'cross-repository-context-cannot-switch';
  assert.ok(
    reportFindings(
      cross,
      [
        reportRecord(
          correctReport(cross) +
            '\n## Weiteres Vorgehen\n`effective-flow plan-issue #37` — Den Plan klären.',
        ),
      ],
      fixtureFor(cross),
    ).length > 0,
  );
});

test('the concrete Q0 prerequisite is checked in the complete report while approval prose stays qualitative', () => {
  const name = 'approval-and-dependency-block-execution';
  const option =
    '## Nächster Schritt\n\n`effective-flow plan docs/plan/2026-10-08-packages.md` — Abschluss von A abgleichen und Voraussetzungen für B klären.';
  const approval = 'Die ausdrückliche Operatorfreigabe fehlt.';
  const dependency = 'Die erforderliche Q0-Qualifikation ist nicht abgeschlossen.';
  assert.deepEqual(
    reportFindings(
      name,
      [reportRecord(`${approval} ${dependency}\n\n${option}`)],
      fixtureFor(name),
    ),
    [],
  );
  // Free approval wording is assessed by the independent complete-report review.
  assert.deepEqual(
    reportFindings(name, [reportRecord(`${dependency}\n\n${option}`)], fixtureFor(name)),
    [],
  );
  for (const prefix of ['', approval])
    assert.ok(
      reportFindings(name, [reportRecord(`${prefix}\n\n${option}`)], fixtureFor(name)).some(
        (message) => message.includes('complete report omits prerequisite token Q0'),
      ),
    );
  const q2a = 'q2a-canonical-record-lags-merged';
  const misplaced =
    'Q2a ist abgeschlossen; Q2b benötigt Vorbereitung.\n' +
    correctReport(q2a).replace(
      'Q2a erfassen und Q2b vorbereiten, ohne Aktivierung.',
      'Den Plan abgleichen und das nächste Paket vorbereiten.',
    );
  assert.ok(
    reportFindings(q2a, [reportRecord(misplaced)], fixtureFor(q2a)).some((message) =>
      message.includes('option descriptions omit package token'),
    ),
  );
});

test('free limitation and purpose prose is qualitative while actual fallback identity remains decisive', () => {
  const name = 'missing-association-valid-fallback';
  const option =
    '### Nächste Schritte\n\n- `effective-flow merge-gate 42` — Review- und Merge-Voraussetzungen für den offenen Pull Request prüfen.';
  for (const explanation of [
    'Ein zugehöriger Quellplan oder Issue-Verweis fehlt. Weitere Planpakete lassen sich daher nicht zuverlässig ableiten; der unzugehörige neuere Plan wurde nicht herangezogen.',
    'Die Unterlagen binden diesen Lauf an keine Planung. Deshalb führt der offene Pull Request den weiteren Ablauf.',
  ]) {
    const report = `${explanation}\n\n${option}`;
    assert.deepEqual(reportFindings(name, [reportRecord(report)], fixtureFor(name)), []);
    for (const wrong of ['merge-gate 43', 'open-plans'])
      assert.ok(
        reportFindings(
          name,
          [reportRecord(report.replace('merge-gate 42', wrong))],
          fixtureFor(name),
        ).length > 0,
      );
  }
  const postmerge = 'actual-postmerge-reconciliation-reentry';
  const paraphrase =
    'Die Nachprüfung konnte nicht beendet werden.\n\n## Fortfahren\n`effective-flow merge-gate 42` — Die verknüpfte Prüfung wiederholen.';
  assert.deepEqual(
    reportFindings(postmerge, [reportRecord(paraphrase)], fixtureFor(postmerge)),
    [],
  );
});

test('missing, truncated, malformed or duplicated reports cannot prove semantic selection', () => {
  const name = 'q2a-canonical-record-lags-merged';
  const record = reportRecord(correctReport(name));
  for (const records of [
    [],
    [record, record],
    [{ ...record, truncated: true }],
    [{ ...record, malformed: true }],
  ]) {
    assert.ok(reportFindings(name, records).length > 0);
  }
  const forged = { ...record, text: record.text + ' altered' };
  const parsed = suite.evaluator.parseAuxiliary(JSON.stringify(forged) + '\n');
  assert.ok(parsed.problems.some((message) => message.includes('hash and count')));
});

test('tracker writes and repeated retained planning reads fail without being discarded as unavailable fixtures', () => {
  const scenario = 'q2a-canonical-record-lags-merged';
  for (const operation of [
    'issue-comment',
    'probe',
    'viewer-read',
    'repository-resolve',
    'pr-merge',
    'thread-ledger-record',
    'issue-comments-read',
    'issue-read',
  ]) {
    const messages = findings({
      scenario,
      records: [{ operation, apply: false }],
      auxiliaryRecords: [reportRecord(correctReport(scenario))],
      sealedEvidence: untouched,
    });
    assert.ok(messages.length > 0, operation);
  }
  // Empty tracker logs are expected because the source planning reads were already retained.
  assert.deepEqual(
    findings({
      scenario,
      records: [],
      auxiliaryRecords: [reportRecord(correctReport(scenario))],
      sealedEvidence: untouched,
    }),
    [],
  );
});

test('the generic evidence boundary rejects missing or forged report channels and sealed state', () => {
  const scenario = 'q2a-canonical-record-lags-merged';
  const fixture = fixtureFor(scenario);
  const common = {
    scenario,
    logText: '',
    fixture,
    projectRoot: '/tmp/eval/project',
    answerableOperations: new Set(),
    sealedEvidenceText: JSON.stringify(untouched),
    auxiliaryText: JSON.stringify({ ...reportRecord(correctReport(scenario)), seq: 1 }) + '\n',
  };
  assert.deepEqual(evaluateEvidence(suite, common).validityProblems, []);
  assert.deepEqual(evaluateEvidence(suite, common).findings, []);
  assert.ok(
    evaluateEvidence(suite, { ...common, auxiliaryText: null }).validityProblems.length > 0,
  );
  assert.ok(evaluateEvidence(suite, { ...common, auxiliaryText: '' }).findings.length > 0);
  assert.ok(
    evaluateEvidence(suite, { ...common, sealedEvidenceText: null }).validityProblems.length > 0,
  );
  assert.ok(
    evaluateEvidence(suite, { ...common, sealedEvidenceText: '{}' }).validityProblems.length > 0,
  );
});

test('sealed recommendation state uses a verbatim JSONL archive suffix', () => {
  assert.equal(STATE_FILE, 'recommendation-state.jsonl');
  assert.equal(suite.sealedEvidence.fileName, STATE_FILE);
  assert.equal(suite.sealedEvidence.archiveSuffix, STATE_FILE);
});

test('sealed before/after state covers ignored artifacts, Git config, empty directories, symlinks and modes', () => {
  const root = mkdtempSync(join(tmpdir(), 'next-steps-state-'));
  try {
    mkdirSync(join(root, '.git'));
    writeFileSync(join(root, '.git/config'), 'original');
    writeFileSync(join(root, 'plan.md'), 'original');
    const before = treeState(root);
    mkdirSync(join(root, '.effective-flow'));
    writeFileSync(join(root, '.effective-flow/wisdom.md'), 'forbidden');
    mkdirSync(join(root, 'empty'));
    symlinkSync('plan.md', join(root, 'link'));
    chmodSync(join(root, 'plan.md'), 0o755);
    appendFileSync(join(root, '.git/config'), 'changed');
    const after = treeState(root);
    const record = { ...untouched, before, after };
    assert.deepEqual(parseState(JSON.stringify(record)).problems, []);
    const messages = stateFindings(record).join(' ');
    for (const path of ['.effective-flow/wisdom.md', '.git/config', 'empty', 'link', 'plan.md'])
      assert.ok(messages.includes(path), path);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the shared seed commit disables inherited automatic Git maintenance before baseline capture', () => {
  const root = mkdtempSync(join(tmpdir(), 'next-steps-maintenance-'));
  try {
    const projectRoot = join(root, 'project');
    const hooks = join(root, 'hooks');
    const globalConfig = join(root, 'hostile.gitconfig');
    const probe = join(root, 'commit-config.txt');
    mkdirSync(hooks);
    const hook = join(hooks, 'pre-commit');
    writeFileSync(
      hook,
      '#!/bin/sh\ngit config --get --bool maintenance.auto > "$EFFECTIVE_FLOW_EVAL_CONFIG_PROBE"\ngit config --get --int gc.auto >> "$EFFECTIVE_FLOW_EVAL_CONFIG_PROBE"\n',
    );
    chmodSync(hook, 0o755);
    for (const [key, value] of [
      ['maintenance.auto', 'true'],
      ['gc.auto', '1'],
      ['core.hooksPath', hooks],
    ])
      execFileSync('git', ['config', '--file', globalConfig, key, value]);
    const scenario = 'ambiguous-associated-plans-fallback';
    const code = `
      import { writeProject } from ${JSON.stringify(new URL('../evals/_scaffold/scaffold.mjs', import.meta.url).href)};
      import suite from ${JSON.stringify(new URL('../evals/next-steps/suite.config.mjs', import.meta.url).href)};
      writeProject(suite, ${JSON.stringify(projectRoot)}, ${JSON.stringify(scenario)}, ${JSON.stringify(fixtureFor(scenario))}, []);
    `;
    execFileSync(process.execPath, ['--input-type=module', '-e', code], {
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: globalConfig,
        GIT_CONFIG_NOSYSTEM: '1',
        EFFECTIVE_FLOW_EVAL_CONFIG_PROBE: probe,
      },
      stdio: 'pipe',
    });
    assert.equal(readFileSync(probe, 'utf8'), 'false\n0\n');
    assert.equal(
      execFileSync('git', ['config', '--file', globalConfig, '--get', 'maintenance.auto'], {
        encoding: 'utf8',
      }).trim(),
      'true',
    );
    assert.equal(
      execFileSync('git', ['config', '--file', globalConfig, '--get', 'gc.auto'], {
        encoding: 'utf8',
      }).trim(),
      '1',
    );
    assert.doesNotMatch(
      readFileSync(join(projectRoot, '.git/config'), 'utf8'),
      /\[(?:maintenance|gc)\]/,
    );
    const captured = parseState(
      captureState({ paths: { projectRoot, traceDir: join(root, 'trace') } }),
    );
    assert.deepEqual(captured.problems, []);
    assert.deepEqual(stateFindings(captured.state), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('slot provisioning stages real plans beside an unchanged production fragment and anchors the full initial state', () => {
  const root = mkdtempSync(join(tmpdir(), 'next-steps-provision-'));
  try {
    const built = buildPortableSkill(root);
    for (const scenario of suite.scenarios) {
      const { paths } = provisionSlot(suite, {
        roundRoot: join(root, 'round'),
        scenario,
        slot: 1,
        attempt: 1,
        builtSkillRoot: built,
        profile: suite.expectedProfile,
        identity: pristineScenarioBuildIdentity(suite, scenario, built),
      });
      assert.equal(
        readFileSync(join(paths.skillRoot, 'shared/next-steps.md'), 'utf8'),
        readFileSync(join(built, 'shared/next-steps.md'), 'utf8'),
      );
      assert.deepEqual(
        JSON.parse(readFileSync(join(paths.projectRoot, 'completed-run.json'), 'utf8')),
        fixtureFor(scenario).snapshot,
      );
      for (const [path, text] of Object.entries(fixtureFor(scenario).artifacts))
        assert.equal(readFileSync(join(paths.projectRoot, path), 'utf8'), text);
      const rawState = captureState({ paths });
      assert.equal(rawState, `${JSON.stringify(JSON.parse(rawState))}\n`);
      assert.equal(rawState.trimEnd().split('\n').length, 1);
      const initial = parseState(rawState);
      assert.deepEqual(initial.problems, []);
      assert.deepEqual(stateFindings(initial.state), []);
      if (scenario === 'active-local-next-ready-slice') {
        mkdirSync(join(paths.projectRoot, '.effective-flow'), { recursive: true });
        writeFileSync(join(paths.projectRoot, '.effective-flow/plan-status.json'), 'forbidden');
        assert.match(
          stateFindings(parseState(captureState({ paths })).state).join(' '),
          /\.effective-flow\/plan-status/,
        );
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('scenario fixtures establish executable local scope and configured external identity before judging output', () => {
  const ready = fixtureFor('active-local-next-ready-slice');
  const source = ready.snapshot.sourceAssociation;
  assert.match(ready.artifacts[source.path], /- \[x\] A:/);
  assert.match(
    ready.artifacts[source.verifiedNextPackagePlan],
    /\*\*Plan status:\*\* Not implemented/,
  );
  assert.match(
    ready.artifacts[source.verifiedNextPackagePlan],
    /\*\*Recommended workflow:\*\* Documentation/,
  );
  assert.match(
    ready.artifacts[source.verifiedNextPackagePlan],
    /Package A is complete and outside this plan/,
  );
  const archived = fixtureFor('implemented-archive-needs-reconciliation');
  assert.match(archived.snapshot.sourceAssociation.path, /\/archive\//);
  assert.match(
    archived.artifacts[archived.snapshot.sourceAssociation.path],
    /\*\*Plan status:\*\* Implemented/,
  );
  const { setupAdr } = suite.projectDocuments({
    scenario: 'external-issue-identity-retained',
    rows: [],
  });
  assert.match(setupAdr, /tracker.mode \| external/);
  assert.match(setupAdr, /tracker.externalTool \| linear/);
});
