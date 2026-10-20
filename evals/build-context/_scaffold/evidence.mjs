// Auxiliary evidence is sealed by the recording host, independently of scenario publication.
// Private manifests/transcripts stay outside results; only bounded redacted observations are copied.
import {
  completionProblems,
  launchOf,
  preparedOf,
  verifyEnvelope,
  BASELINE_COMMIT,
} from './host-receipt.mjs';
import { archiveReuseProblems } from './archive.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  freshnessVerdict,
  pristineScenarioBuildIdentity,
  builtSkillIdentity,
} from '../../_scaffold/build-identity.mjs';
import {
  actualModelMatches,
  captureHostEvidence,
  PRIVATE_CAPTURE,
  toolTexts,
  digest,
  readRegular,
  validateSpawnObservations,
} from './transcript.mjs';
import {
  CELL_NAMES,
  GATES,
  REQUIRED_ROLES,
  SCHEMA,
  digestValue,
  requireThat,
} from './protocol.mjs';
export const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024;
const positive = (n) => Number.isFinite(n) && n > 0;
export const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
export const nearestRank = (values, probability) =>
  [...values].sort((a, b) => a - b)[Math.ceil(probability * values.length) - 1];
export function validateRun(run, target = 'portable', baseline = false) {
  const problems = [
    ...completionProblems(run),
    ...validateSpawnObservations(run?.observations, {
      target,
      requiredRoles: REQUIRED_ROLES,
    }),
  ];
  for (const field of ['parentPeakInput', 'firstRequestInput', 'cumulativeInput', 'elapsedMs'])
    if (!positive(run?.metrics?.[field])) problems.push(`missing metric ${field}`);
  if (run?.acceptance?.exitCode !== 0 || !digestValue(run?.acceptance?.outputDigest))
    problems.push('independent acceptance check did not pass');
  if (
    !digestValue(run?.review?.sourceDigest) ||
    run?.review?.blinded !== true ||
    run?.review?.critical !== 0 ||
    run?.review?.important !== 0 ||
    run?.review?.missedSeededBlockers !== 0 ||
    run?.review?.unauthorizedActions !== 0 ||
    run?.review?.falseCompletion !== 0 ||
    run?.review?.skippedValidation !== 0
  )
    problems.push('blinded quality review absent or failed');
  const reviewer = run?.observations?.find(
    (o) => o.sessionIdentity === run?.review?.reviewerSessionIdentity,
  );
  if (
    reviewer?.role !== 'independent-review' ||
    reviewer?.sourceDigest !== run?.review?.sourceDigest ||
    !digestValue(run?.review?.reviewedContentDigest) ||
    !digestValue(run?.review?.criteriaDigest) ||
    !digestValue(run?.review?.assignmentDigest)
  )
    problems.push('review verdict lacks actual independent content/criteria/input binding');
  try {
    const reviewBasis = preparedOf(run).reviewBasis;
    if (
      reviewBasis?.criteriaDigest !== run?.review?.criteriaDigest ||
      reviewBasis?.assignmentDigest !== run?.review?.assignmentDigest
    )
      problems.push('reviewer differs from host-controlled blinded assignment');
  } catch {}
  if (
    !Number.isInteger(run?.reworkRounds) ||
    run.reworkRounds < 0 ||
    !Number.isInteger(run?.correctionRounds) ||
    run.correctionRounds < 0
  )
    problems.push('missing rework/correction observations');
  if (
    !baseline &&
    (!digestValue(run?.terminalVerification?.sourceDigest) ||
      run.terminalVerification.status !== 'DONE')
  )
    problems.push('independent candidate terminal verification missing');
  if (run?.spawnRefusals?.length && run.isolationRequired !== false)
    problems.push('unsupported-depth/fallback cannot enter performance-success cohorts');
  const passed = new Set(
    run?.helperEvents
      ?.filter(
        (e) =>
          e.family === 'build-run' &&
          e.ok &&
          e.operation === 'verify-terminal' &&
          e.status === 'DONE',
      )
      .flatMap((e) => e.gates),
  );
  if (baseline) {
    passed.clear();
    for (const gate of run?.baselineGates ?? [])
      if (gate.observed === true && digestValue(gate.sourceDigest)) passed.add(gate.gate);
  }
  for (const gate of GATES) if (!passed.has(gate)) problems.push(`missing verified gate ${gate}`);
  return problems;
}
export function summarizeMatrix(records) {
  const pairs = records.filter((r) => r.kind === 'pair');
  const attempts = records.filter((r) => r.kind === 'attempt');
  const cells = CELL_NAMES.map((cell) => {
    const selected = pairs.filter((r) => `${r.harness}:${r.complexity}` === cell);
    const problems = [];
    const allSessions = pairs
      .flatMap((pair) => [pair.baselineRun, pair.candidateRun])
      .flatMap((run) => run?.observations ?? []);
    if (
      new Set(allSessions.map((o) => o.sessionIdentity)).size !== allSessions.length ||
      new Set(allSessions.map((o) => o.sourceDigest)).size !== allSessions.length
    )
      problems.push('actual session/transcript reused across paired samples');
    if (
      attempts.some(
        (a) => `${a.harness}:${a.complexity}` === cell && [1, 2, 3, 4, 5].includes(a.slot),
      )
    )
      problems.push(
        'a predeclared workload slot has a failed/invalid/fallback/unsupported attempt; do not replace it with a success',
      );
    if (
      selected.length !== 5 ||
      new Set(selected.map((r) => r.slot)).size !== 5 ||
      selected.some((r) => ![1, 2, 3, 4, 5].includes(r.slot))
    )
      problems.push('all five predeclared paired slots required');
    for (const pair of selected) {
      if (
        [pair.baselineRun, pair.candidateRun].some(
          (run) => run?.harness !== pair.harness || run?.profile?.harness !== pair.harness,
        )
      )
        problems.push('declared cell differs from actual captured harness');
      problems.push(
        ...validateRun(pair.baselineRun, 'portable', true).map(
          (p) => `slot ${pair.slot} baseline: ${p}`,
        ),
        ...validateRun(pair.candidateRun).map((p) => `slot ${pair.slot} candidate: ${p}`),
      );
      try {
        const baseline = preparedOf(pair.baselineRun),
          candidate = preparedOf(pair.candidateRun),
          a = launchOf(pair.baselineRun),
          b = launchOf(pair.candidateRun);
        if (
          baseline.condition !== 'baseline' ||
          candidate.condition !== 'candidate' ||
          baseline.slot !== pair.slot ||
          candidate.slot !== pair.slot ||
          baseline.harness !== pair.harness ||
          candidate.harness !== pair.harness ||
          baseline.complexity !== pair.complexity ||
          candidate.complexity !== pair.complexity
        )
          problems.push('actual predeclared lane/slot differs from claimed pair');
        if (
          !isDeepStrictEqual(baseline.fixture, candidate.fixture) ||
          baseline.promptDigest !== candidate.promptDigest ||
          baseline.settingsDigest !== candidate.settingsDigest
        )
          problems.push('actual fixture/head/content/user bytes/settings differ between pair');
        const order = pair.slot % 2 ? 'baseline-first' : 'candidate-first';
        if (
          order === 'baseline-first'
            ? a.processes.at(-1).finishedAt > b.processes[0].startedAt
            : b.processes.at(-1).finishedAt > a.processes[0].startedAt
        )
          problems.push('observed paired execution order is wrong or overlaps');
      } catch (error) {
        problems.push(error.message);
      }
      if (!isDeepStrictEqual(pair.baselineRun?.profile, pair.candidateRun?.profile))
        problems.push('paired parent profiles differ');
      const roles = (run) =>
        [
          ...new Set(
            run.observations
              ?.filter((o) => REQUIRED_ROLES.includes(o.role))
              .map((o) => JSON.stringify([o.role, o.actualModel, o.actualEffort])),
          ),
        ].sort();
      if (!isDeepStrictEqual(roles(pair.baselineRun), roles(pair.candidateRun)))
        problems.push('required specialist models/efforts differ between pair');
    }
    let metrics = null;
    if (selected.length === 5 && problems.length === 0) {
      const ratios = (field) =>
        selected.map((p) => p.candidateRun.metrics[field] / p.baselineRun.metrics[field]);
      const absolute = selected
        .filter(
          (p) =>
            p.baselineRun.metrics.firstRequestInput <= 60000 &&
            p.candidateRun.metrics.firstRequestInput <= 60000 &&
            launchOf(p.baselineRun).freshRoot === true &&
            launchOf(p.candidateRun).freshRoot === true,
        )
        .map((p) => p.candidateRun.metrics.parentPeakInput);
      metrics = {
        parentPeakRatio: median(ratios('parentPeakInput')),
        cumulativeInputRatio: median(ratios('cumulativeInput')),
        elapsedRatio: median(ratios('elapsedMs')),
        absoluteSlots: absolute.length,
        parentP95: absolute.length === 5 ? nearestRank(absolute, 0.95) : null,
        p95Estimator: 'nearest-rank; n=5 is maximum',
        raw: selected.map((p) => ({
          slot: p.slot,
          baseline: p.baselineRun.metrics,
          candidate: p.candidateRun.metrics,
        })),
      };
      if (metrics.parentPeakRatio > 0.5)
        problems.push('median paired parent peak ratio exceeds 0.50');
      if (metrics.cumulativeInputRatio > 1.15)
        problems.push('median paired cumulative input ratio exceeds 1.15');
      if (metrics.elapsedRatio > 1.25) problems.push('median paired elapsed ratio exceeds 1.25');
      if (metrics.absoluteSlots !== 5)
        problems.push('five eligible fresh-root absolute slots required');
      else if (metrics.parentP95 > 120000) problems.push('nearest-rank parent p95 exceeds 120000');
    }
    return {
      cell,
      state: problems.length ? 'unproven' : 'current',
      pairs: selected.length,
      problems,
      metrics,
    };
  });
  return {
    cells,
    attempts: attempts.map((a) => ({
      harness: a.harness,
      outcome: a.outcome,
      reason: a.failure?.code,
      slot: a.slot ?? null,
      complexity: a.complexity ?? null,
    })),
    unsupported: attempts.filter((a) => a.outcome === 'unsupported-depth').length,
    failed: attempts.filter((a) => a.outcome === 'failed').length,
    invalid: attempts.filter((a) => a.outcome === 'invalid').length,
    failsStrict: cells.some((c) => c.state !== 'current'),
  };
}
export function captureReview(path, host, checkout, assignment) {
  const text = readRegular(path),
    rows = text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  const observation = host.observations.find((o) => o.sourceDigest === digest(text));
  requireThat(
    observation?.role === 'independent-review' &&
      observation.parent !== null &&
      observation.harness === host.harness &&
      ((host.harness === 'codex-cli' && observation.requestedInheritance === 'none') ||
        (host.harness === 'claude-code' && observation.requestedInheritance === 'fresh-task')),
    'verdict is not from an observed fresh independent reviewer',
  );
  const actual = [...host[PRIVATE_CAPTURE].sessions.values()].find(
    (item) => item.parsed.sourceDigest === observation.sourceDigest,
  )?.parsed;
  requireThat(
    assignment && assignment.text && assignment.criteriaDigest,
    'host-controlled blinded assignment missing',
  );
  const first = actual.users[0]?.text ?? '';
  requireThat(
    first.includes(assignment.text) ||
      (first.includes(assignment.path) &&
        actual.tools.some((t) => toolTexts(t.output).some((v) => v.includes(assignment.text)))),
    'actual reviewer did not receive/read the controlled assignment',
  );
  requireThat(
    !/(?:condition|cohort|arm)\s*[:=]\s*(?:baseline|candidate)|\/(?:baseline|candidate)(?:\/|-)/i.test(
      first + assignment.text,
    ),
    'review input reveals the measured condition',
  );
  const required = ['src/slug.mjs', 'test/acceptance.test.mjs', 'README.md'];
  if (existsSync(resolve(checkout, 'src/unique-labels.mjs')))
    required.push('src/unique-labels.mjs');
  const reads = [];
  for (const name of required) {
    const body = readRegular(resolve(checkout, name), 256 * 1024);
    requireThat(
      actual.tools.some((t) => toolTexts(t.output).some((output) => output.includes(body.trim()))),
      'reviewer did not read actual reviewed content: ' + name,
    );
    reads.push([name, digest(body)]);
  }
  // An actual independent review turn emits its bounded verdict as final JSON; a fixture's
  // expectations and the workflow's own conclusion are never substituted for that observation.
  const candidates = rows
    .flatMap((r) =>
      r.type === 'response_item' &&
      r.payload?.role === 'assistant' &&
      r.payload?.phase === 'final_answer'
        ? (r.payload.content ?? []).map((c) => c.text)
        : r.type === 'assistant'
          ? (r.message?.content ?? []).map((c) => c.text)
          : r.type === 'result' && !r.is_error
            ? [r.result]
            : [],
    )
    .filter((t) => typeof t === 'string');
  let verdict = null;
  const final = candidates.at(-1);
  for (const candidate of typeof final === 'string'
    ? [final, ...[...final.matchAll(/```json\s*([\s\S]*?)```/g)].map((match) => match[1])]
    : []) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed.reviewSchema === SCHEMA) verdict = parsed;
    } catch {}
  }
  requireThat(verdict, 'actual independent blinded review verdict not found');
  const keys = [
    'critical',
    'important',
    'missedSeededBlockers',
    'unauthorizedActions',
    'falseCompletion',
    'skippedValidation',
  ];
  requireThat(
    keys.every((key) => Object.hasOwn(verdict, key)),
    'incomplete blinded review verdict',
  );
  return {
    sourceDigest: digest(text),
    blinded: true,
    reviewerSessionIdentity: observation.sessionIdentity,
    criteriaDigest: assignment.criteriaDigest,
    assignmentDigest: digest(assignment.text),
    reviewedContentDigest: digest(JSON.stringify(reads)),
    ...Object.fromEntries(keys.map((key) => [key, verdict[key]])),
  };
}
export function captureRun(manifest, baseline = false, complexity = 'simple') {
  const host = captureHostEvidence(manifest.host);
  requireThat(
    manifest.protectedJournal && process.platform === 'darwin',
    'actual host journal sandbox required for artifact execution',
  );
  const policy =
    '(version 1)(allow default)(deny file-write* (subpath ' +
    JSON.stringify(manifest.protectedJournal) +
    '))';
  const protectedRun = (executable, args, options = {}) =>
    spawnSync('/usr/bin/sandbox-exec', ['-p', policy, executable, ...args], {
      ...options,
      encoding: options.encoding ?? 'utf8',
      timeout: 30000,
      maxBuffer: 4 * 1024 * 1024,
    });
  let terminalVerification = null,
    terminal = null,
    temp = null,
    checkout = resolve(manifest.checkout);
  try {
    if (!baseline) {
      requireThat(
        manifest.skillRoot && manifest.verifyTerminalInput,
        'candidate actual terminal verification input required',
      );
      const result = protectedRun(
        process.execPath,
        [resolve(manifest.skillRoot, 'scripts/build-run.mjs'), 'verify-terminal'],
        { input: JSON.stringify(manifest.verifyTerminalInput) },
      );
      requireThat(
        !result.error && result.status === 0,
        'independent real terminal verifier did not pass',
      );
      const envelope = JSON.parse(result.stdout);
      terminal = envelope.result;
      requireThat(
        envelope.ok && terminal?.status === 'DONE',
        'independent candidate terminal verification failed',
      );
      terminalVerification = {
        sourceDigest: digest(result.stdout),
        status: terminal.status,
        worktreeRemoved: terminal.finalCheckout?.worktreeRemoved,
      };
    }
    const commit = baseline ? manifest.finalCommit : terminal?.finalPlan?.commit;
    if (commit) {
      requireThat(
        manifest.sourceRepository && manifest.approvedBaseHead,
        'actual source repository/base binding required',
      );
      execFileSync(
        'git',
        [
          '--git-dir',
          manifest.sourceRepository,
          'merge-base',
          '--is-ancestor',
          manifest.approvedBaseHead,
          commit,
        ],
        { stdio: 'pipe' },
      );
      temp = mkdtempSync(resolve(tmpdir(), 'flow-build-accepted-tree-'));
      const tar = execFileSync(
        'git',
        ['--git-dir', manifest.sourceRepository, 'archive', '--format=tar', commit],
        { maxBuffer: 4 * 1024 * 1024 },
      );
      execFileSync('tar', ['-x', '-C', temp], { input: tar, stdio: 'pipe' });
      checkout = temp;
    }
    const fixtureName =
        complexity === 'review-correction' ? 'review-correction' : 'approved-single-module',
      fixture = JSON.parse(
        readRegular(resolve(import.meta.dirname, '../fixtures', fixtureName + '.json'), 256 * 1024),
      );
    requireThat(
      readRegular(resolve(checkout, 'test/acceptance.test.mjs')) ===
        fixture.artifacts['test/acceptance.test.mjs'],
      'independent acceptance test changed',
    );
    const check = protectedRun(process.execPath, ['--test', 'test/acceptance.test.mjs'], {
      cwd: checkout,
    });
    requireThat(!check.error, 'independent acceptance process unavailable');
    const review = captureReview(
      resolve(manifest.reviewTranscript),
      host,
      checkout,
      manifest.controlledReview,
    );
    const baselineGates = baseline ? captureBaselineGates(manifest, host, checkout) : null,
      nativePilot = manifest.pilotRecord ? capturePilot(manifest.pilotRecord, host) : null;
    return {
      ...host,
      isolationRequired: manifest.isolationRequired !== false,
      checkoutDigest: digest(resolve(terminal?.finalCheckout?.executionRoot ?? manifest.checkout)),
      terminalVerification,
      baselineGates,
      nativePilot,
      acceptance: {
        exitCode: check.status,
        outputDigest: digest(check.stdout + '\n' + check.stderr),
      },
      review,
      reworkRounds: manifest.reworkRounds,
      correctionRounds: manifest.correctionRounds,
    };
  } finally {
    if (temp) rmSync(temp, { recursive: true, force: true });
  }
}
export function captureBaselineGates(manifest, host, acceptedRoot = manifest.checkout) {
  const root = resolve(manifest.checkout);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const archived = readRegular(resolve(acceptedRoot, 'docs/plan/archive/feature.md'), 64 * 1024);
  requireThat(
    /\*\*Plan status:\*\* Implemented/.test(archived),
    'baseline plan not archived as implemented',
  );
  requireThat(git('status', '--porcelain') === '', 'baseline final checkout is dirty');
  const head = git('rev-parse', 'HEAD');
  const artifactDigest = digest(JSON.stringify({ head, plan: digest(archived), status: 'clean' }));
  const gates = [];
  for (const gate of [
    'implementation',
    'documentation',
    'tests',
    'validation',
    'final-validation',
    'delivery',
    'plan-archival',
  ]) {
    const candidates = host.phaseEvents.filter((e) => e.gate === gate);
    const ref = manifest.phaseRefs?.[gate];
    const event = candidates.find(
      (e) => e.session === ref?.session && e.callDigest === ref?.callDigest,
    );
    requireThat(event, `baseline actual ${gate} tool result missing`);
    gates.push({
      gate,
      observed: true,
      sourceDigest: event.sourceDigest,
      callDigest: event.callDigest,
    });
  }
  requireThat(
    manifest.phaseRefs.validation.callDigest !== manifest.phaseRefs['final-validation'].callDigest,
    'baseline final validation must be a separate actual invocation',
  );
  const reviewer = host.observations.find((o) => o.role === 'independent-review');
  requireThat(reviewer?.complete, 'baseline independent review did not complete');
  gates.push({ gate: 'independent-review', observed: true, sourceDigest: reviewer.sourceDigest });
  // This suite fixes worktree.enabled=false and portable Quality; no candidate helper is loaded
  // into the old baseline. Clean final Git state and archive identity prove its terminal duties.
  for (const gate of ['cleanup', 'completion', 'pilot-finalization'])
    gates.push({ gate, observed: true, sourceDigest: artifactDigest });
  return gates;
}
function capturePilot(path, host) {
  const text = readRegular(resolve(path), 256 * 1024),
    p = JSON.parse(text);
  requireThat(
    p.kind === 'workflow' || p.kind === 'workflow-record',
    'native finalized pilot record missing',
  );
  const alias = (v) => digest((host[PRIVATE_CAPTURE].aliasSalt ?? '') + '\0' + v);
  return {
    sourceDigest: digest(text),
    generation: alias(p.generationId),
    run: alias(p.runId),
    generationState: p.generationState,
    completionStatus: p.completionStatus,
    qualityCorrectionRounds: p.qualityCorrectionRounds,
    packets: p.packets?.map((v) => ({
      packet: alias(v.packetId),
      selectedProfile: v.selectedProfile,
      attempt: v.attempt,
      fallback: v.fallback,
      escalated: v.escalated,
    })),
  };
}
export function nativeTargetIdentity(skillRoot, target) {
  const root = resolve(skillRoot),
    inventoryText = readRegular(resolve(root, 'native-agent-inventory.json'), 64 * 1024),
    inventory = JSON.parse(inventoryText);
  requireThat(
    inventory.harness === target && inventory.schemaVersion === 1,
    'actual native inventory required; portable output is not native',
  );
  const walk = (dir, prefix = '') =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(resolve(dir, entry.name), prefix + entry.name + '/')
        : [prefix + entry.name],
    );
  const files = walk(root).filter((p) => !p.startsWith('scripts/remote-tracker'));
  const skill = builtSkillIdentity(root, files);
  const extension = target === 'codex' ? '.toml' : '.md';
  const sidecars = Object.fromEntries(
    [...inventory.baseWorkers, ...inventory.fastWorkers]
      .sort()
      .map((name) => [
        name,
        digest(readRegular(resolve(root, '../agents', name + extension), 256 * 1024)),
      ]),
  );
  requireThat(
    target !== 'claude' || inventory.fastWorkers.length === 5,
    'native Claude Fast sidecars missing',
  );
  return {
    skillDigest: skill.versionNeutralDigest,
    sidecarsDigest: digest(JSON.stringify(sidecars)),
    inventoryDigest: digest(inventoryText),
  };
}
export function sealAuxiliaryRecord(manifest, output, suite) {
  requireThat(
    manifest.schema === SCHEMA && ['pair', 'native', 'attempt'].includes(manifest.kind),
    'unsupported auxiliary manifest',
  );
  const readCompletion = (path) => {
    const run = JSON.parse(readRegular(resolve(path), MAX_ARCHIVE_BYTES));
    requireThat(completionProblems(run).length === 0, 'closed actual host completion required');
    return run;
  };
  let record;
  if (manifest.kind === 'attempt') {
    const failed = JSON.parse(readRegular(resolve(manifest.completion), MAX_ARCHIVE_BYTES)),
      p = verifyEnvelope(failed, 'failed-launch'),
      prepared = verifyEnvelope(p.prepared, 'prepared');
    requireThat(
      (p.processes.some((e) => e.exitCode !== 0) ||
        (p.outcome === 'unsupported-depth' && p.failure?.code === 'unsupported-depth')) &&
        p.failure?.sourceDigest &&
        p.failure?.code,
      'actual failed host process/error required',
    );
    record = {
      schema: SCHEMA,
      kind: 'attempt',
      harness: prepared.harness,
      complexity: prepared.scenario ? null : prepared.complexity,
      slot: prepared.scenario ? null : prepared.slot,
      outcome: p.outcome,
      failure: p.failure,
      metrics: null,
      sourceBuild: prepared.build,
      hostFailure: failed,
    };
  } else {
    const baselineRun =
        manifest.kind === 'pair' ? readCompletion(manifest.baselineCompletion) : null,
      candidateRun = readCompletion(
        manifest.kind === 'pair' ? manifest.candidateCompletion : manifest.completion,
      );
    const candidate = preparedOf(candidateRun),
      candidateBuild = verifyEnvelope(candidate.build, 'build');
    requireThat(
      candidate.condition === 'candidate',
      'candidate completion must use actual candidate source',
    );
    let baselineBuild = baselineRun
      ? verifyEnvelope(preparedOf(baselineRun).build, 'build')
      : verifyEnvelope(
          JSON.parse(readRegular(resolve(manifest.baselineBuildReceipt), MAX_ARCHIVE_BYTES)),
          'build',
        );
    requireThat(
      baselineBuild.source.commit === BASELINE_COMMIT && baselineBuild.source.clean === true,
      'actual approved full baseline source receipt required',
    );
    const common = {
      schema: SCHEMA,
      kind: manifest.kind,
      harness: candidate.harness,
      baselineRevision: BASELINE_COMMIT,
      baselineIdentity: baselineBuild.identity,
      candidateIdentity: candidateBuild.identity,
      instrumentDigest: candidateBuild.identity.instrument.digest,
      baselineBuildReceipt: baselineRun
        ? preparedOf(baselineRun).build
        : JSON.parse(readRegular(resolve(manifest.baselineBuildReceipt), MAX_ARCHIVE_BYTES)),
      candidateBuildReceipt: candidate.build,
    };
    if (manifest.kind === 'pair')
      record = {
        ...common,
        slot: candidate.slot,
        complexity: candidate.complexity,
        baselineRun,
        candidateRun,
      };
    else
      record = {
        ...common,
        target: candidate.target,
        run: candidateRun,
        nativeIdentity: candidateRun.nativeIdentity,
      };
    requireThat(
      common.baselineIdentity.instrument.digest === common.instrumentDigest,
      'same actual suite instrument required',
    );
    requireThat(suite, 'suite required for current identity check');
  }
  const body = JSON.stringify(record),
    sealed = JSON.stringify({ schema: SCHEMA, seal: digest(body), record }, null, 2) + '\n';
  requireThat(
    Buffer.byteLength(sealed) <= MAX_ARCHIVE_BYTES,
    'bounded auxiliary archive exceeds 2 MiB',
  );
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, sealed, { flag: 'wx', mode: 0o600 });
  return { outputDigest: digest(sealed), kind: record.kind };
}
export function readSealedRecord(path) {
  const envelope = JSON.parse(readRegular(path, MAX_ARCHIVE_BYTES));
  requireThat(
    envelope.schema === SCHEMA &&
      envelope.record?.schema === SCHEMA &&
      envelope.seal === digest(JSON.stringify(envelope.record)),
    'invalid auxiliary seal',
  );
  return envelope.record;
}
export function nativeProblems(record) {
  const problems = validateRun(record.run, record.target),
    run = record.run ?? {};
  if (
    !['codex', 'claude'].includes(record.target) ||
    record.harness !== (record.target === 'codex' ? 'codex-cli' : 'claude-code')
  )
    problems.push('native target/harness mismatch');
  const events = run.helperEvents ?? [],
    find = (family, op) => events.filter((e) => e.family === family && e.operation === op && e.ok);
  const one = (family, op) => {
    const list = find(family, op);
    if (list.length !== 1) problems.push(`native ${op} must occur exactly once`);
    return list[0];
  };
  const start = one('pilot', 'start'),
    packet = one('pilot', 'start-packet'),
    final = one('pilot', 'finalize'),
    q = one('build-run', 'question'),
    reply = one('build-run', 'reply'),
    resume = one('build-run', 'resume');
  const runner = run.observations?.filter((o) => o.role === 'build-runner') ?? [],
    fast = run.observations?.filter((o) => o.role === 'fast-implementer') ?? [],
    quality = run.observations?.filter((o) => o.role === 'implementer') ?? [];
  const r = runner[0],
    f = fast[0],
    c = quality[0],
    root = run.observations?.find((o) => o.parent === null);
  if (
    runner.length !== 1 ||
    fast.length !== 1 ||
    !quality.length ||
    f?.parent !== r?.session ||
    c?.parent !== r?.session ||
    f?.actualModel === c?.actualModel
  )
    problems.push(
      'one actual Fast worker and Quality continuation under the original runner required',
    );
  const pilot = run.nativePilot;
  if (
    !pilot ||
    pilot.generationState !== 'active' ||
    pilot.completionStatus !== 'completed' ||
    !(pilot.qualityCorrectionRounds >= 1) ||
    pilot.packets?.filter((p) => p.selectedProfile === 'fast' && p.attempt === 'started').length !==
      1
  )
    problems.push(
      'active finalized record with one consumed Fast attempt and Quality continuation required',
    );
  if (find('pilot', 'activate').length || start?.generationState !== 'active')
    problems.push('generation must already be active');
  if (
    !start?.generation ||
    !start?.run ||
    start.generation !== packet?.generation ||
    start.run !== packet?.run ||
    start.generation !== final?.generation ||
    start.run !== final?.run ||
    pilot?.generation !== start.generation ||
    pilot?.run !== start.run ||
    !start.packetAliases?.includes(packet?.packet) ||
    !pilot?.packets?.some((p) => p.packet === packet?.packet && p.selectedProfile === 'fast')
  )
    problems.push('actual generation/workflow/packet/final record identities do not correlate');
  if (
    start?.session !== r?.session ||
    final?.session !== r?.session ||
    q?.session !== r?.session ||
    q?.agentSession !== r?.session ||
    reply?.session !== root?.session ||
    reply?.trustedUserObserved !== true ||
    resume?.agentSession !== r?.session ||
    resume?.session !== root?.session ||
    !q?.run ||
    q.run !== reply?.run ||
    q.run !== resume?.run ||
    q.recordDigest !== reply?.questionDigest ||
    q.recordDigest !== resume?.questionDigest ||
    reply.recordDigest !== resume?.replyDigest
  )
    problems.push(
      'question/trusted answer/resume are not bound to original runner and actual user turn',
    );
  const continuations = run.agentContinuations?.filter((e) => e.session === r?.session) ?? [];
  if (continuations.length !== 1) problems.push('original runner must be continued exactly once');
  const order = [
    start?.at,
    packet?.at,
    f?.startedAt,
    f?.completedAt,
    c?.startedAt,
    c?.completedAt,
    q?.at,
    reply?.at,
    resume?.at,
    continuations[0]?.at,
    final?.at,
  ];
  if (order.some((at) => !Number.isFinite(at)) || order.some((at, i) => i > 0 && at < order[i - 1]))
    problems.push('native lifecycle chronology is missing or reversed');
  if (
    events.some((e) => !e.callDigest || !e.inputDigest || !e.sourceDigest || !Number.isFinite(e.at))
  )
    problems.push('native event lacks actual closed invocation evidence');
  return problems;
}
export function verifyAdditionalEvidence(suite, { skillRoot, resultsDir }) {
  const behaviouralProblems = archiveReuseProblems(suite, resultsDir);
  const integrity = {
    scenario: 'behavioural-archive-integrity',
    state: behaviouralProblems.length ? 'invalid' : 'current',
    runs: [],
    details: JSON.stringify(behaviouralProblems),
  };
  const directory = resolve(resultsDir, '_auxiliary');
  if (!existsSync(directory))
    return [
      integrity,
      {
        scenario: 'paired-matrix-and-native',
        state: 'absent',
        runs: [],
        details:
          '20 pairs and both native compatibility lanes are unrecorded; no context reduction established',
      },
    ];
  const pins = JSON.parse(readRegular(resolve(suite.root, 'profiles.json'), 64 * 1024));
  const records = readdirSync(directory)
    .filter((n) => n.endsWith('.json'))
    .sort()
    .map((n) => readSealedRecord(resolve(directory, n)));
  const current = pristineScenarioBuildIdentity(suite, 'approved-single-module', skillRoot);
  const identityProblems = [];

  const baselineIds = new Set(),
    candidateIds = new Set();
  for (const record of records) {
    if (record.kind === 'attempt') {
      try {
        const source = verifyEnvelope(record.sourceBuild, 'build');
        if (source.identity.instrument.digest !== current.instrument.digest)
          identityProblems.push('failed attempt instrument changed');
        if (source.condition === 'baseline' && source.source.commit !== BASELINE_COMMIT)
          identityProblems.push('failed attempt used unapproved baseline');
      } catch (error) {
        identityProblems.push(error.message);
      }
      continue;
    }
    const pin = pins.profiles[record.harness];
    if (!pin) identityProblems.push('undeclared expected host profile');
    for (const run of [record.baselineRun, record.candidateRun, record.run].filter(Boolean)) {
      if (
        run.profile?.reportedVersion !== pin?.reportedVersion ||
        run.profile?.model !== pin?.rootModel ||
        run.profile?.reasoningEffort !== pin?.rootEffort
      )
        identityProblems.push('run differs from predeclared parent profile');
      for (const o of run.observations ?? []) {
        if (
          !actualModelMatches(o.requestedModel, o.actualModel, record.harness) ||
          o.actualEffort !== o.requestedEffort
        )
          identityProblems.push('actual execution differs from pinned concrete model/effort');
        const tier =
          (record.kind === 'native' && o.role === 'fast-implementer') ||
          ['validator', 'test-writer', 'nesting-probe'].includes(o.role)
            ? 'standard'
            : 'deep';
        if (
          o.role !== 'parent' &&
          (o.requestedModel !== pin?.[tier + 'Model'] ||
            o.requestedEffort !== pin?.[tier + 'Effort'])
        )
          identityProblems.push('required worker tier differs from pinned profile');
      }
    }
    for (const buildReceipt of [record.baselineBuildReceipt, record.candidateBuildReceipt]) {
      try {
        const build = verifyEnvelope(buildReceipt, 'build');
        if (
          build.membershipDigest !== digest(JSON.stringify(build.membership)) ||
          !['portable', 'codex', 'claude'].every(
            (target) => build.membership['dist/' + target + '/effective-flow/SKILL.md'],
          )
        )
          identityProblems.push('incomplete or changed actual built file membership');
      } catch (error) {
        identityProblems.push(error.message);
      }
    }
    if (record.baselineRevision !== BASELINE_COMMIT)
      identityProblems.push('baseline full commit changed');
    baselineIds.add(record.baselineIdentity?.skill?.digest);
    candidateIds.add(record.candidateIdentity?.skill?.digest);
    if (
      !['current', 'waived'].includes(
        freshnessVerdict(suite, 'approved-single-module', record.candidateIdentity, current).state,
      )
    )
      identityProblems.push('candidate or instrument/scenario identity changed');
    if (
      record.instrumentDigest !== current.instrument.digest ||
      record.baselineIdentity?.instrument?.digest !== current.instrument.digest
    )
      identityProblems.push('instrument identity changed');
  }
  if (baselineIds.size !== 1 || candidateIds.size !== 1)
    identityProblems.push('matrix mixes baseline or candidate identities');
  const matrix = summarizeMatrix(records);
  const results = matrix.cells.map((cell) => ({
    scenario: `paired:${cell.cell}`,
    state: identityProblems.length ? 'stale' : cell.state,
    runs: [],
    details: JSON.stringify({ ...cell, identityProblems, attempts: matrix.attempts }),
  }));
  for (const target of ['codex', 'claude']) {
    const lanes = records.filter((r) => r.kind === 'native' && r.target === target);
    const expectedNative = nativeTargetIdentity(
      resolve(skillRoot, '../../' + target + '/effective-flow'),
      target,
    );
    const problems =
      lanes.length === 1
        ? nativeProblems(lanes[0])
        : ['exactly one native compatibility lane required'];
    if (lanes.length === 1 && !isDeepStrictEqual(lanes[0].nativeIdentity, expectedNative))
      problems.push('native target/sidecar identity changed');
    results.push({
      scenario: `native:${target}`,
      state: identityProblems.length ? 'stale' : problems.length ? 'unproven' : 'current',
      runs: [],
      details: JSON.stringify({ problems, identityProblems }),
    });
  }
  return [integrity, ...results];
}
