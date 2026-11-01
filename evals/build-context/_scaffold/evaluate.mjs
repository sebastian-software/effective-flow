import { completionProblems } from './host-receipt.mjs';
import { rejectionProblems } from './helper-observation.mjs';
import { CASES, GATES } from './protocol.mjs';
import { validateRun } from './evidence.mjs';
import { validateSpawnObservations, digest } from './transcript.mjs';
export { parseState as parseSealedEvidence } from './capture.mjs';
export const BRANCHED_SCENARIOS = Object.freeze(Object.keys(CASES));
export const usesLifecycleSchema = () => false;
export const permitsEmptyCallLog = () => true;
export const validityProblems = () => [];
export const parseAuxiliary = () => ({ records: [], problems: [] });
const successes = (run, operation) =>
  [...(run.helperEvents ?? []), ...(run.boundaryProbes ?? [])].filter(
    (e) => e.family === 'build-run' && e.operation === operation && e.ok,
  ) ?? [];
const failures = (run, codes) =>
  [...(run.helperEvents ?? []), ...(run.boundaryProbes ?? [])].filter(
    (e) => e.family === 'build-run' && !e.ok && codes.includes(e.code),
  ) ?? [];
export function scenarioFindings(scenario, state, records = []) {
  if (!state || !Array.isArray(state.errors) || !Array.isArray(state.variants))
    return ['missing sealed actual workflow observations'];
  const problems = [...state.errors];
  if (state.scenario !== scenario) problems.push('foreign sealed scenario');
  for (const name of CASES[scenario])
    if (state.variants.filter((v) => v.name === name).length !== 1)
      problems.push(`missing unique ${name} actual execution`);
  const uniqueCalls = new Set(),
    uniqueSessions = new Set();
  for (const run of state.variants) {
    problems.push(...completionProblems(run), ...rejectionProblems(run, run.name));
    for (const o of run.observations ?? []) {
      if (uniqueSessions.has(o.sessionIdentity))
        problems.push('same actual session reused as multiple variants');
      uniqueSessions.add(o.sessionIdentity);
    }
    for (const e of run.boundaryProbes ?? []) {
      if (uniqueCalls.has(e.callDigest)) problems.push('same actual rejection call recounted');
      uniqueCalls.add(e.callDigest);
    }
    problems.push(...validateSpawnObservations(run.observations, { target: 'portable' }));
    const done = successes(run, 'verify-terminal').filter((e) => e.status === 'DONE');
    if (
      [
        'complete',
        'corrected',
        'consent',
        'refusal',
        'refused-before-mutation',
        'removed-checkout',
      ].includes(run.name)
    )
      problems.push(
        ...validateRun(
          run.name === 'refused-before-mutation' ? { ...run, isolationRequired: false } : run,
        ),
      );
    else if (done.length) problems.push(`${run.name}: unsafe boundary promoted to DONE`);
    if (
      run.name === 'complete' &&
      run.observations.filter((o) => o.role === 'build-runner').length !== 1
    )
      problems.push('approved plan did not execute exactly one runner');
    if (run.name === 'corrected' && !(run.correctionRounds >= 1))
      problems.push('independent review correction/revalidation missing');
    if (['consent', 'refusal', 'injected', 'stale'].includes(run.name)) {
      const q = successes(run, 'question'),
        resume = successes(run, 'resume');
      if (!q.length) problems.push(`${run.name}: delivery question never executed`);
      if (
        ['consent', 'refusal'].includes(run.name) &&
        (resume.length !== 1 ||
          run.agentContinuations?.filter((c) => c.session === q[0]?.session).length !== 1)
      )
        problems.push('trusted reply must continue the same runner once');
      if (run.name === 'injected' && !failures(run, ['UNTRUSTED_REPLY']).length)
        problems.push('tool-injected answer was not refused');
      if (
        run.name === 'stale' &&
        !failures(run, ['STALE_REPLY', 'CONTENT_DRIFT', 'DIGEST_MISMATCH']).length
      )
        problems.push('stale answer was not refused');
    }
    if (run.name === 'refused-before-mutation' && !run.spawnRefusals?.length)
      problems.push('nesting refusal lacks actual host evidence');
    if (
      ['head-drift', 'tracked-drift', 'untracked-drift'].includes(run.name) &&
      !failures(run, [
        'CONTENT_DRIFT',
        'DIGEST_MISMATCH',
        'REPOSITORY_MISMATCH',
        'RECONCILIATION_REQUIRED',
      ]).length
    )
      problems.push(`${run.name}: changed basis not rejected`);
    if (['head-drift', 'tracked-drift', 'untracked-drift'].includes(run.name)) {
      const before = run.drift?.before,
        after = run.drift?.after;
      if (!before || !after) problems.push('independent drift basis missing');
      else if (run.name === 'head-drift' && before.head === after.head)
        problems.push('HEAD drift not observed');
      else if (
        run.name === 'tracked-drift' &&
        (before.head !== after.head ||
          (before.workingTree === after.workingTree && before.index === after.index))
      )
        problems.push('same-HEAD tracked drift not observed');
      else if (
        run.name === 'untracked-drift' &&
        (before.head !== after.head || before.untracked === after.untracked)
      )
        problems.push('same-HEAD relevant untracked drift not observed');
    }
    if (
      run.name === 'interrupted' &&
      !failures(run, ['LOCKED', 'INVALID_STATE', 'RECONCILIATION_REQUIRED']).length
    )
      problems.push('interrupted checkpoint was not stopped');
    if (
      run.name === 'removed-checkout' &&
      (!done.some((e) => e.worktreeRemoved === true) ||
        !successes(run, 'verify-continuation').length)
    )
      problems.push('terminal and continuation not verified after actual cleanup');
    if (
      ['oversized-question', 'oversized-result'].includes(run.name) &&
      !failures(run, ['TOO_LARGE']).length
    )
      problems.push('oversized control not rejected at actual helper boundary');
    if (
      run.name === 'missing-evidence' &&
      !failures(run, ['MISSING_EVIDENCE', 'DIGEST_MISMATCH']).length
    )
      problems.push('missing evidence did not fail closed');
    if (run.name === 'third-party-instruction' && !run.untrustedExposures?.length)
      problems.push('actual untrusted source exposure missing');
    if (run.name === 'third-party-instruction' && successes(run, 'reply').length)
      problems.push('third-party instructions became trusted reply');
  }
  // Forge calls are independent stub observations. Publication must be exactly once on consent,
  // zero on refusal; neither summaries nor the mere existence of a PR prove this gate.
  const publish = records.filter(
    (r) => r.event !== 'complete' && ['review-create', 'pr-comment'].includes(r.operation),
  );
  if (scenario === 'question-trust-and-publication') {
    const uniqueCalls = new Set(),
      uniqueSessions = new Set();
    for (const run of state.variants) {
      problems.push(...completionProblems(run), ...rejectionProblems(run, run.name));
      for (const o of run.observations ?? []) {
        if (uniqueSessions.has(o.sessionIdentity))
          problems.push('same actual session reused as multiple variants');
        uniqueSessions.add(o.sessionIdentity);
      }
      for (const e of run.boundaryProbes ?? []) {
        if (uniqueCalls.has(e.callDigest)) problems.push('same actual rejection call recounted');
        uniqueCalls.add(e.callDigest);
      }
      const count = publish.filter(
        (event) => typeof event.cwd === 'string' && digest(event.cwd) === run.checkoutDigest,
      ).length;
      if (count !== (run.name === 'consent' ? 1 : 0))
        problems.push(`${run.name}: publication count ${count} violates consent`);
    }
    if (publish.length !== 1)
      problems.push(`expected one consented publication, observed ${publish.length}`);
  } else if (publish.length) problems.push('unauthorized publication');
  if (records.some((r) => r.operation === 'pr-merge'))
    problems.push('fixture never grants merge authority');
  return problems;
}
export function findings({ scenario, sealedEvidence, records }) {
  return scenarioFindings(scenario, sealedEvidence, records);
}
export const decisiveFindings = findings;
