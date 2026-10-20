// Suite-owned trusted-host receipts. Hashes establish immutable pairing, not authorization.
// Only the closed coordinator creates these from actual filesystem/process observations.
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
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
    const isClaude = prepared.harness === 'claude-code';
    requireThat(
      (prepared.harness === 'codex-cli' && prepared.nativeSandbox?.kind === 'codex-native') ||
        (isClaude && prepared.nativeSandbox?.kind === 'claude-process'),
      'actual harness-specific host protection is unproven',
    );
    const native = prepared.nativeSandbox,
      proof = run.nativePolicyProof;
    if (!isClaude)
      requireThat(
        launch.processes.every(
          (e, i) =>
            e.rootIdentity === launch.rootIdentity &&
            digestValue(e.inputDigest) &&
            digestValue(e.transcriptBasisDigest) &&
            (i !== 0 || e.inputDigest === prepared.promptDigest),
        ),
        'actual native turn root/input/prefix binding missing',
      );
    if (isClaude) {
      const pin = JSON.parse(
        readRegular(resolve(import.meta.dirname, '../profiles.json'), 256 * 1024),
      ).claudeSandboxRuntime;
      requireThat(
        native.runtimeDigest === pin.membershipDigest &&
          native.providerDomainsDigest === digest(JSON.stringify(['api.anthropic.com'])),
        'Claude official runtime/provider policy differs',
      );
      const collectorDigest = digest(
        readRegular(resolve(import.meta.dirname, 'claude-stream-worker.mjs')),
      );
      requireThat(
        digestValue(prepared.inputDigest) &&
          launch.processes.every(
            (e, i) =>
              digestValue(e.captureDigest) &&
              e.collectorDigest === collectorDigest &&
              digestValue(e.inputDigest) &&
              (i !== 0 || e.inputDigest === prepared.inputDigest),
          ),
        'actual external Claude stream/input collection missing or foreign',
      );
    }

    requireThat(
      proof?.kind === native.kind &&
        proof.policyDigest === native.policyDigest &&
        Array.isArray(proof.sessions) &&
        proof.sessions.length === run.observations.length &&
        new Set(proof.sessions.map((s) => s.sessionIdentity)).size === proof.sessions.length &&
        proof.sessions.every(
          (s) =>
            (isClaude
              ? Array.isArray(s.captures) &&
                s.captures.length > 0 &&
                new Set(s.captures.map((c) => c.processIndex)).size === s.captures.length &&
                s.captures.every(
                  (c) =>
                    Number.isInteger(c.processIndex) &&
                    c.processIndex >= 0 &&
                    c.processIndex < launch.processes.length &&
                    digestValue(c.captureDigest) &&
                    c.captureDigest === launch.processes[c.processIndex].captureDigest,
                )
              : Number.isInteger(s.contexts) &&
                s.contexts > 0 &&
                digestValue(s.observedPolicyDigest)) &&
            run.observations.some(
              (o) => o.sessionIdentity === s.sessionIdentity && o.sourceDigest === s.sourceDigest,
            ),
        ),
      'actual root/child native policy proof missing or foreign',
    );
    let trackerDigest = prepared.trackerInitialDigest;
    requireThat(digestValue(trackerDigest), 'prelaunch tracker prefix absent');
    for (const process of launch.processes) {
      const mirror = process.trackerMirror;
      requireThat(
        mirror &&
          isDeepStrictEqual(
            Object.keys(mirror).sort(),
            [
              'sourceDigest',
              'archiveDigest',
              'priorDigest',
              'prefixBytes',
              'sourceBytes',
              'addedEntries',
            ].sort(),
          ) &&
          mirror.priorDigest === trackerDigest &&
          digestValue(mirror.sourceDigest) &&
          mirror.sourceDigest === mirror.archiveDigest &&
          Number.isInteger(mirror.prefixBytes) &&
          mirror.prefixBytes >= 0 &&
          Number.isInteger(mirror.sourceBytes) &&
          mirror.sourceBytes >= mirror.prefixBytes &&
          Number.isInteger(mirror.addedEntries) &&
          mirror.addedEntries >= 0,
        'actual host tracker mirror chain absent or changed',
      );
      trackerDigest = mirror.archiveDigest;
    }
    const tracker = run.trackerLedgerProof;
    requireThat(
      tracker &&
        tracker.initialDigest === prepared.trackerInitialDigest &&
        tracker.finalDigest === trackerDigest &&
        Number.isInteger(tracker.actualCalls) &&
        tracker.actualCalls ===
          (run.helperEvents ?? []).filter((e) => e.family === 'tracker').length &&
        tracker.actualCalls ===
          launch.processes.reduce((n, p) => n + p.trackerMirror.addedEntries, 0),
      'actual tracker calls differ from protected host mirrors',
    );
    const keys = [
      'schema',
      'kind',
      'writeDenied',
      'inheritedDenied',
      'denied',
      'fixtureRead',
      'fixtureWrite',
      'gitCommit',
      'gitPush',
      'stubLedger',
      'wrapperDigest',
      'binaryDigest',
      'reportedVersion',
      'policyDigest',
      'execArgumentsDigest',
      'sandboxArgumentsDigest',
      'debugPromptDigest',
      'stdoutDigest',
      'startedAt',
      'finishedAt',
      'protectedRootDigests',
      'writeRootDigests',
      ...(isClaude
        ? [
            'fileEditDenied',
            'fileWriteDenied',
            'networkDenied',
            'runtimeDigest',
            'providerDomainsDigest',
          ]
        : []),
    ].sort();
    const wrapperDigest = digest(
      readRegular(
        resolve(
          import.meta.dirname,
          isClaude ? 'claude-process-probe.mjs' : 'native-sandbox-probe.mjs',
        ),
      ),
    );
    requireThat(
      launch.processes.every((e, i) => {
        const g = e.guard;
        return (
          isDeepStrictEqual(Object.keys(g ?? {}).sort(), keys) &&
          g.schema === SCHEMA + '/native-guard' &&
          g.kind === native.kind &&
          (!isClaude ||
            (g.fileEditDenied === true &&
              g.fileWriteDenied === true &&
              g.networkDenied === true &&
              g.runtimeDigest === native.runtimeDigest &&
              g.providerDomainsDigest === native.providerDomainsDigest)) &&
          g.inheritedDenied === true &&
          g.fixtureRead === true &&
          g.fixtureWrite === true &&
          g.gitCommit === true &&
          g.gitPush === true &&
          g.stubLedger === true &&
          g.wrapperDigest === wrapperDigest &&
          g.binaryDigest === native.binaryDigest &&
          g.reportedVersion === prepared.profile.reportedVersion &&
          g.policyDigest === native.policyDigest &&
          e.policyDigest === native.policyDigest &&
          g.execArgumentsDigest === e.launchArgumentsDigest &&
          (i !== 0 || e.launchArgumentsDigest === native.execArgumentsDigest) &&
          g.startedAt >= prepared.preparedAt &&
          g.finishedAt <= e.startedAt &&
          g.finishedAt >= g.startedAt &&
          [g.binaryDigest, g.sandboxArgumentsDigest, g.debugPromptDigest, g.stdoutDigest].every(
            digestValue,
          ) &&
          Array.isArray(g.protectedRootDigests) &&
          g.protectedRootDigests.length >= 3 &&
          g.denied === g.protectedRootDigests.length + 1 &&
          isDeepStrictEqual(g.protectedRootDigests, native.protectedRootDigests) &&
          isDeepStrictEqual(g.writeRootDigests, native.writeRootDigests)
        );
      }),
      'actual native guard/binary/arguments/policy chronology differs',
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
