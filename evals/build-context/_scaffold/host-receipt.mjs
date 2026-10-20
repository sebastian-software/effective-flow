// Suite-owned trusted-host receipts. Hashes establish immutable pairing, not authorization.
// Only the closed coordinator creates these from actual filesystem/process observations.
import { digest, readRegular } from './transcript.mjs';
import { SCHEMA, requireThat, digestValue } from './protocol.mjs';
export const HOST_SCHEMA = SCHEMA + '/host';
export const BASELINE_COMMIT = 'de23f9b2ab7a93b747aa22a4d985824899d2c916';
export function envelope(kind, payload) {
  return { schema: HOST_SCHEMA, kind, payload, seal: digest(JSON.stringify({ kind, payload })) };
}
export function verifyEnvelope(record, kind) {
  requireThat(
    record?.schema === HOST_SCHEMA &&
      record.kind === kind &&
      record.seal === digest(JSON.stringify({ kind, payload: record.payload })),
    'missing or changed host ' + kind + ' receipt',
  );
  return record.payload;
}
export function completionProblems(run) {
  const problems = [];
  try {
    const p = verifyEnvelope(run?.provenance, 'completion');
    const { provenance, ...body } = run;
    requireThat(p.runDigest === digest(JSON.stringify(body)), 'run differs from host completion');
    const launch = verifyEnvelope(p.launch, 'launch'),
      prepared = verifyEnvelope(launch.prepared, 'prepared');
    requireThat(
      p.protection === 'os-enforced' && launch.processes?.length >= 1,
      'host journal protection or actual process receipt missing',
    );
    requireThat(
      launch.processes.every(
        (e) =>
          e.settingsObservationDigest === prepared.settingsDigest &&
          e.startedAt >= prepared.preparedAt &&
          e.finishedAt >= e.startedAt &&
          Number.isInteger(e.exitCode) &&
          e.guard?.writeDenied === true &&
          digestValue(e.guard.wrapperDigest) &&
          digestValue(e.policyDigest) &&
          digestValue(e.stdoutDigest),
      ),
      'invalid process chronology',
    );
    requireThat(
      launch.rootIdentity === run.observations?.find((o) => o.parent === null)?.sessionIdentity,
      'actual fresh root association changed',
    );
    requireThat(
      launch.freshRoot === true &&
        launch.preparedSeal === launch.prepared.seal &&
        launch.initialPromptObserved === true &&
        digestValue(launch.firstUserDigest) &&
        launch.rootSourceDigest ===
          run.observations?.find((o) => o.parent === null)?.sourceDigest &&
        launch.firstAt >= launch.processes[0].startedAt - 1000 &&
        launch.lastAt <= launch.processes.at(-1).finishedAt + 1000,
      'fresh root/process timestamps not observed',
    );
    requireThat(
      prepared.transcriptDestinationWasEmpty === true &&
        prepared.fixture &&
        digestValue(prepared.promptDigest) &&
        digestValue(prepared.settingsDigest) &&
        prepared.settingsDigest === digest(JSON.stringify(prepared.settings)),
      'prelaunch basis absent',
    );
    const build = verifyEnvelope(prepared.build, 'build');
    requireThat(
      build.source && build.membership && digestValue(build.membershipDigest),
      'source/reproducible build evidence absent',
    );
    if (prepared.condition === 'baseline')
      requireThat(
        build.source.commit === BASELINE_COMMIT && build.source.clean === true,
        'baseline is not approved immutable source',
      );
  } catch (error) {
    problems.push(error.message);
  }
  return problems;
}
export function launchOf(run) {
  return verifyEnvelope(verifyEnvelope(run.provenance, 'completion').launch, 'launch');
}
export function preparedOf(run) {
  return verifyEnvelope(launchOf(run).prepared, 'prepared');
}
export function readHostRecord(path, kind) {
  const value = JSON.parse(readRegular(path, 2 * 1024 * 1024));
  verifyEnvelope(value, kind);
  return value;
}
