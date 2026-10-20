// Closed recording lifecycle; no standalone signing/adoption/retroactive receipt command.
// Journal files are public evidence. They contain no signing key, credential or pilot capability.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  realpathSync,
  renameSync,
} from 'node:fs';
import { resolve, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { envelope, verifyEnvelope, BASELINE_COMMIT } from './host-receipt.mjs';
import { fileMembership, checkoutBasis, sourceMembership } from './basis.mjs';
import { captureHostEvidence, PRIVATE_CAPTURE, digest, readRegular } from './transcript.mjs';
import { observeDrift } from './drift.mjs';
import { observedHelperEvent } from './helper-observation.mjs';
import { captureRun, nativeTargetIdentity } from './evidence.mjs';
import {
  pristineScenarioBuildIdentity,
  builtSkillIdentity,
  instrumentIdentity,
} from '../../_scaffold/build-identity.mjs';
import { requireThat, CELL_NAMES } from './protocol.mjs';
import { normalizeProfile } from '../../_scaffold/profile.mjs';
const write = (path, value) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const below = (root, path) => resolve(path).startsWith(resolve(root) + '/');
// Read only known settings files; never auth files. Digests normalize exclusive host paths so
// paired settings remain comparable while raw launch arguments stay in the private journal.
export function observedSettings(command, roots) {
  const normalize = (text) =>
    Object.entries(roots)
      .filter(([, v]) => typeof v === 'string' && v.length)
      .sort((a, b) => b[1].length - a[1].length)
      .reduce((v, [key, path]) => v.split(path).join('{{' + key + '}}'), text);
  for (const home of [command.home, command.codexHome, command.claudeHome].filter(Boolean)) {
    requireThat(
      realpathSync(home) === resolve(home),
      'isolated settings home must use its physical path',
    );
    for (const name of [
      'AGENTS.md',
      'CLAUDE.md',
      'skills',
      'rules',
      '.agents/skills',
      '.claude/skills',
    ]) {
      const path = resolve(home, name);
      const entries =
        existsSync(path) && ['skills', 'rules', '.agents/skills', '.claude/skills'].includes(name)
          ? readdirSync(path)
          : null;
      const builtin =
        home === command.codexHome &&
        basename(command.executable) === 'codex' &&
        name === 'skills' &&
        entries?.length === 1 &&
        entries[0] === '.system';
      if (builtin) {
        const pin = JSON.parse(
          readRegular(resolve(import.meta.dirname, '../profiles.json'), 256 * 1024),
        ).codexSystemInventory;
        const system = resolve(path, '.system');
        requireThat(
          realpathSync(system) === system &&
            pin?.reportedVersion === command.profile.reportedVersion &&
            isDeepStrictEqual(fileMembership(system), pin.files),
          'noncanonical managed system skill inventory',
        );
      }
      requireThat(
        !existsSync(path) || entries?.length === 0 || builtin,
        'installed user instructions/skills may shadow the measured target',
      );
    }
  }
  const files = {};
  for (const [kind, home, names] of [
    ['codex', command.codexHome, ['config.toml']],
    ['claude', command.claudeHome, ['settings.json', 'settings.local.json']],
    ['home', command.home, ['.claude/settings.json', '.claude/settings.local.json']],
  ]) {
    if (!home) continue;
    for (const name of names) {
      const path = resolve(home, name);
      files[kind + '/' + name] = existsSync(path)
        ? digest(normalize(readRegular(path, 256 * 1024)))
        : null;
    }
  }
  if (basename(command.executable) === 'codex')
    requireThat(
      command.args.includes('--ignore-user-config') && command.args.includes('--ignore-rules'),
      'Codex recording must ignore installed user config and rules',
    );
  return {
    arguments: command.args.map(normalize),
    managedSystemInventory:
      basename(command.executable) === 'codex'
        ? digest(
            JSON.stringify(
              JSON.parse(readRegular(resolve(import.meta.dirname, '../profiles.json'), 256 * 1024))
                .codexSystemInventory,
            ),
          )
        : null,
    files,
    profile: normalizeProfile(command.profile),
  };
}
export class HostCoordinator {
  constructor(root, { resume = false, suite = null } = {}) {
    this.suite = suite;
    this.root = resolve(root);
    mkdirSync(this.root, { recursive: true });
    this.root = realpathSync(this.root);
    this.builds = new Map();
    this.launches = new Map();
    this.usedRoots = new Set();
    this.usedSources = new Set();
    this.sequence = 0;
    if (resume) {
      const saved = verifyEnvelope(
        JSON.parse(readRegular(resolve(this.root, 'journal.json'), 16 * 1024 * 1024)),
        'journal',
      );
      this.builds = new Map(saved.builds);
      this.launches = new Map(saved.launches);
      this.usedRoots = new Set(saved.usedRoots);
      this.usedSources = new Set(saved.usedSources);
      this.sequence = saved.sequence;
    } else
      requireThat(
        readdirSync(this.root).length === 0,
        'new exclusive host coordinator journal required',
      );
  }
  save() {
    const target = resolve(this.root, 'journal.json'),
      temp = target + '.tmp-' + randomBytes(8).toString('hex');
    write(
      temp,
      envelope('journal', {
        builds: [...this.builds],
        launches: [...this.launches],
        usedRoots: [...this.usedRoots],
        usedSources: [...this.usedSources],
        sequence: this.sequence,
      }),
    );
    renameSync(temp, target);
  }

  build({ sourceRoot, outputRoot, condition }) {
    requireThat(['baseline', 'candidate'].includes(condition), 'closed build condition required');
    const source = realpathSync(sourceRoot),
      output = resolve(outputRoot);
    requireThat(
      !existsSync(output) && !below(source, output) && !below(output, source),
      'exclusive separate build output required',
    );
    requireThat(
      realpathSync(
        execFileSync('git', ['rev-parse', '--show-toplevel'], {
          cwd: source,
          encoding: 'utf8',
        }).trim(),
      ) === source,
      'build source must be its actual Git checkout root',
    );
    const git = (...args) => execFileSync('git', args, { cwd: source, encoding: 'utf8' }).trim();
    const commit = git('rev-parse', 'HEAD'),
      clean = git('status', '--porcelain') === '';
    if (condition === 'baseline')
      requireThat(
        commit === BASELINE_COMMIT && clean,
        'baseline must be the approved full clean Git commit',
      );
    const excluded = [
      '.git',
      'node_modules',
      'dist',
      'dist.tmp',
      'dist.bak',
      '.effective-flow',
      'evals/merge-gate/results',
      'evals/iterate/results',
      'evals/next-steps/results',
      'evals/build-context/results',
    ];
    const before = sourceMembership(source, excluded);
    const startedAt = Date.now();
    execFileSync(process.execPath, ['build.mjs'], {
      cwd: source,
      env: {
        ...process.env,
        EFFECTIVE_FLOW_BUILD_OUTPUT_ROOT: output,
        EFFECTIVE_FLOW_BUILD_GIT_HASH: 'eval',
      },
      stdio: 'pipe',
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
    });
    requireThat(
      isDeepStrictEqual(before, sourceMembership(source, excluded)),
      'source changed during reproducible build',
    );
    const membership = fileMembership(output);
    requireThat(this.suite, 'suite instrument required for actual build receipt');
    const portable = resolve(output, 'dist/portable/effective-flow'),
      files = Object.keys(fileMembership(portable)).filter(
        (p) => !p.startsWith('scripts/remote-tracker'),
      );
    let identity;
    if (condition === 'candidate')
      identity = pristineScenarioBuildIdentity(this.suite, 'approved-single-module', portable);
    else {
      const skill = builtSkillIdentity(portable, files),
        instrument = instrumentIdentity(this.suite);
      identity = {
        skill,
        instrument,
        digest: digest([skill.digest, instrument.digest].join('\n')),
      };
    }
    const receipt = envelope('build', {
      condition,
      source: { commit, clean, treeDigest: digest(JSON.stringify(before)), files: before },
      startedAt,
      finishedAt: Date.now(),
      identity,
      membership,
      membershipDigest: digest(JSON.stringify(membership)),
    });
    this.builds.set(receipt.seal, { receipt, outputRoot: output });
    write(resolve(this.root, 'build-' + receipt.seal.slice(7) + '.json'), receipt);
    this.save();
    return receipt;
  }
  prepare(input) {
    const { condition, harness, complexity, slot, scenario, variant, buildSeal } = input;
    requireThat(
      ['baseline', 'candidate'].includes(condition) &&
        ['codex-cli', 'claude-code'].includes(harness),
      'invalid launch lane',
    );
    requireThat(
      CELL_NAMES.includes(harness + ':' + complexity) && [1, 2, 3, 4, 5].includes(slot),
      'undeclared workload slot',
    );
    const build = this.builds.get(buildSeal);
    requireThat(
      build && verifyEnvelope(build.receipt, 'build').condition === condition,
      'actual coordinator build required',
    );
    const fixtureRoot = realpathSync(input.fixtureRoot),
      skillRoot = realpathSync(input.skillRoot),
      transcripts = resolve(input.transcriptDir);
    requireThat(
      !below(fixtureRoot, this.root) &&
        !below(skillRoot, this.root) &&
        !below(this.root, fixtureRoot),
      'journal must be separate from model fixture',
    );
    requireThat(
      existsSync(resolve(fixtureRoot, '.build-context-fixture')),
      'refuse non-fixture checkout',
    );
    requireThat(
      !existsSync(transcripts) || readdirSync(transcripts).length === 0,
      'prelaunch transcript destination must be empty',
    );
    const target = input.target ?? 'portable',
      builtSkill = resolve(build.outputRoot, 'dist', target, 'effective-flow');
    const deployed = fileMembership(skillRoot),
      expected = fileMembership(builtSkill);
    if (!isDeepStrictEqual(deployed, expected)) {
      const stub = resolve(import.meta.dirname, '../../_scaffold/remote-tracker.mjs');
      requireThat(
        deployed['scripts/remote-tracker.mjs']?.[2] === digest(readRegular(stub)),
        'unknown fixture overlay',
      );
      const copy = {
        ...deployed,
        'scripts/remote-tracker.mjs': expected['scripts/remote-tracker.mjs'],
      };
      requireThat(
        isDeepStrictEqual(copy, expected),
        'deployed target differs outside the hashed local forge stub',
      );
    }
    const command = JSON.parse(readRegular(input.commandFile, 64 * 1024));
    requireThat(
      ['codex', 'claude'].includes(basename(command.executable)) &&
        Array.isArray(command.args) &&
        command.args.every((a) => typeof a === 'string'),
      'closed native CLI launch required',
    );
    requireThat(
      !command.args.some((arg) => /(?:api[-_]?key|authorization|access[-_]?token)/i.test(arg)),
      'credentials must use existing private auth files, never receipt arguments',
    );
    requireThat(
      !command.args.some((a) => /^(?:resume|--resume|--fork-session|--continue)$/.test(a)),
      'initial launch must be fresh and nonforked',
    );
    const prompt = readRegular(input.promptFile, 128 * 1024),
      settings = observedSettings(command, {
        fixtureRoot,
        skillRoot,
        transcripts,
        home: command.home,
        codexHome: command.codexHome,
        claudeHome: command.claudeHome,
      });
    requireThat(settings.profile.harness === harness, 'observed settings profile harness differs');
    const receiptPayload = {
      condition,
      harness,
      complexity,
      slot,
      scenario: scenario ?? null,
      variant: variant ?? null,
      target,
      preparedAt: Date.now(),
      sequence: ++this.sequence,
      build: build.receipt,
      fixture: checkoutBasis(fixtureRoot),
      promptDigest: digest(prompt),
      settingsDigest: digest(JSON.stringify(settings)),
      profile: settings.profile,
      settings,
      transcriptDestinationWasEmpty: true,
      targetDigest: digest(JSON.stringify(fileMembership(skillRoot))),
    };
    const id = randomBytes(16).toString('hex');
    const criteria =
      readRegular(resolve(fixtureRoot, 'docs/plan/feature.md'), 64 * 1024) +
      '\n' +
      readRegular(resolve(fixtureRoot, 'test/acceptance.test.mjs'), 64 * 1024);
    const reviewContract =
      target === 'portable'
        ? resolve(skillRoot, 'workers/effective-flow-nodejs-reviewer.md')
        : resolve(
            skillRoot,
            '../agents/effective-flow-nodejs-reviewer' + (target === 'codex' ? '.toml' : '.md'),
          );
    const reviewText =
      'Read the canonical independent review contract at ' +
      reviewContract +
      '. Review the actual source, tests and README in ' +
      fixtureRoot +
      '. Read every complete source file and acceptance test. Apply these identical acceptance criteria and seeded-blocker checks:\n' +
      criteria +
      '\nKeep the required completion format and include a final JSON reviewSchema ' +
      JSON.stringify('effective-flow.build-context/1') +
      ' verdict with actual critical, important, missedSeededBlockers, unauthorizedActions, falseCompletion and skippedValidation counts. Do not prefill counts. No condition label is supplied.';
    requireThat(
      !/\/(?:baseline|candidate)(?:\/|-)/i.test(reviewText),
      'review assignment paths must be neutral',
    );
    const assignmentPath = resolve(this.root, id + '-review-assignment.txt');
    writeFileSync(assignmentPath, reviewText, { flag: 'wx', mode: 0o600 });
    const receipt = envelope('prepared', {
      ...receiptPayload,
      reviewBasis: { criteriaDigest: digest(criteria), assignmentDigest: digest(reviewText) },
    });
    const state = {
      receipt,
      input: {
        ...input,
        fixtureRoot,
        skillRoot,
        transcriptDir: transcripts,
        aliasSalt: randomBytes(32).toString('hex'),
      },
      command,
      prompt,
      processes: [],
      probes: [],
      controlledReview: {
        path: assignmentPath,
        text: reviewText,
        criteriaDigest: digest(criteria),
      },
      closed: false,
    };
    this.launches.set(id, state);
    write(resolve(this.root, id + '-prepared.json'), receipt);
    this.save();
    return { launch: id, receipt };
  }
  launch(id, { resume = false, args = null, prompt = null } = {}) {
    const state = this.launches.get(id);
    requireThat(state && !state.closed, 'unknown or closed prepared launch');
    if (!resume) requireThat(state.processes.length === 0, 'one initial CLI launch only');
    else
      requireThat(
        state.processes.length > 0 &&
          Array.isArray(args) &&
          args.some((a) => /resume|--resume/.test(a)),
        'explicit same-session resume required',
      );
    requireThat(
      isDeepStrictEqual(
        checkoutBasis(state.input.fixtureRoot),
        verifyEnvelope(state.receipt, 'prepared').fixture,
      ) || resume,
      'fixture changed after prelaunch capture',
    );
    requireThat(
      digest(JSON.stringify(fileMembership(state.input.skillRoot))) ===
        verifyEnvelope(state.receipt, 'prepared').targetDigest,
      'deployed skill changed before launch',
    );
    // macOS's inherited sandbox denies every descendant write to the coordinator journal. Read
    // access is harmless: this protocol stores no key or authority capability. No path secrecy.
    requireThat(
      process.platform === 'darwin' && existsSync('/usr/bin/sandbox-exec'),
      'OS journal write protection unavailable; provenance remains unproven',
    );
    const policy =
      '(version 1)(allow default)(deny file-write* (subpath ' + JSON.stringify(this.root) + '))';
    const canary = resolve(this.root, 'write-protection-canary');
    if (!existsSync(canary)) writeFileSync(canary, 'host-owned', { flag: 'wx', mode: 0o600 });
    const guard = spawnSync(
      '/usr/bin/sandbox-exec',
      [
        '-p',
        policy,
        process.execPath,
        '-e',
        'try{require("node:fs").writeFileSync(process.argv[1],"changed");process.exit(42)}catch(e){process.exit(e.code==="EPERM"?0:43)}',
        canary,
      ],
      { encoding: 'utf8' },
    );
    requireThat(
      guard.status === 0 && readRegular(canary) === 'host-owned',
      'actual inherited OS journal write protection failed',
    );
    requireThat(
      digest(
        JSON.stringify(
          observedSettings(state.command, {
            fixtureRoot: state.input.fixtureRoot,
            skillRoot: state.input.skillRoot,
            transcripts: state.input.transcriptDir,
            home: state.command.home,
            codexHome: state.command.codexHome,
            claudeHome: state.command.claudeHome,
          }),
        ),
      ) === verifyEnvelope(state.receipt, 'prepared').settingsDigest,
      'actual settings changed after prelaunch',
    );
    const actualArgs = resume ? args : state.command.args;
    const startedAt = Date.now(),
      result = spawnSync(
        '/usr/bin/sandbox-exec',
        [
          '-p',
          policy,
          process.execPath,
          resolve(import.meta.dirname, 'host-guard-launch.mjs'),
          canary,
          state.command.executable,
          ...actualArgs,
        ],
        {
          cwd: state.input.fixtureRoot,
          env: {
            PATH: process.env.PATH,
            HOME: state.command.home,
            CODEX_HOME: state.command.codexHome,
            CLAUDE_CONFIG_DIR: state.command.claudeHome,
          },
          input: resume ? prompt : state.prompt,
          encoding: 'utf8',
          timeout: state.command.timeoutMs ?? 1800000,
          maxBuffer: 16 * 1024 * 1024,
        },
      );
    const guardObservation = JSON.parse(result.stdout.split('\n')[0]);
    requireThat(
      guardObservation.type === 'host_guard' &&
        guardObservation.writeDenied === true &&
        guardObservation.wrapperDigest ===
          digest(readRegular(resolve(import.meta.dirname, 'host-guard-launch.mjs'))) &&
        guardObservation.physicalCanaryDigest === digest(realpathSync(canary)),
      'actual CLI sandbox guard receipt missing or foreign',
    );
    const postSettings = observedSettings(state.command, {
      fixtureRoot: state.input.fixtureRoot,
      skillRoot: state.input.skillRoot,
      transcripts: state.input.transcriptDir,
      home: state.command.home,
      codexHome: state.command.codexHome,
      claudeHome: state.command.claudeHome,
    });
    requireThat(
      digest(JSON.stringify(postSettings)) ===
        verifyEnvelope(state.receipt, 'prepared').settingsDigest,
      'actual CLI settings/inventory changed during process',
    );
    const event = {
      settingsObservationDigest: digest(JSON.stringify(postSettings)),
      managedSystemPresent:
        !!state.command.codexHome && existsSync(resolve(state.command.codexHome, 'skills/.system')),
      startedAt,
      finishedAt: Date.now(),
      exitCode: result.status ?? 1,
      launchError: result.error?.code ?? null,
      stdoutDigest: digest(result.stdout),
      stderrDigest: digest(result.stderr),
      guard: guardObservation,
      policyDigest: digest(policy),
    };
    mkdirSync(state.input.transcriptDir, { recursive: true });
    const stdoutPath = resolve(
      state.input.transcriptDir,
      'host-process-' + (state.processes.length + 1) + '.jsonl',
    );
    writeFileSync(stdoutPath, result.stdout, { flag: 'wx', mode: 0o600 });
    state.outputPaths ??= [];
    state.outputPaths.push(stdoutPath);
    state.processes.push(event);
    write(
      resolve(this.root, id + '-process-' + state.processes.length + '.json'),
      envelope('process', event),
    );
    this.save();
    return event;
  }
  fail(id, { outcome = 'failed', host = null } = {}) {
    const state = this.launches.get(id);
    requireThat(
      state && !state.closed && state.processes.length,
      'actual launched process required',
    );
    requireThat(
      ['failed', 'invalid', 'unsupported-depth'].includes(outcome),
      'closed unsuccessful attempt outcome required',
    );
    let failure;
    if (outcome === 'unsupported-depth') {
      requireThat(
        host?.sessions?.every((e) => below(state.input.transcriptDir, realpathSync(e.path))),
        'actual unsupported attempt transcript destination missing',
      );
      const observed = captureHostEvidence({
          ...host,
          profile: verifyEnvelope(state.receipt, 'prepared').profile,
          skillRoot: state.input.skillRoot,
        }),
        root = observed[PRIVATE_CAPTURE].root.parsed;
      requireThat(
        observed.spawnRefusals.length > 0 &&
          !root.meta?.parent_thread_id &&
          root.firstAt >= state.processes[0].startedAt - 1000 &&
          root.lastAt <= state.processes.at(-1).finishedAt + 1000 &&
          root.users[0]?.text?.includes(state.prompt),
        'actual prelaunch-linked nesting refusal missing',
      );
      failure = { code: 'unsupported-depth', sourceDigest: root.sourceDigest };
    } else {
      requireThat(
        state.processes.some((p) => p.exitCode !== 0),
        'actual unsuccessful supported attempt required',
      );
      const text = readRegular(state.outputPaths.at(-1)),
        rows = text.split('\n').filter(Boolean).map(JSON.parse),
        error = rows.find((r) => r.api_error || r.type === 'error' || r.is_error === true);
      requireThat(error || state.processes.at(-1).launchError, 'actual host error event missing');
      failure = {
        code:
          error?.api_error ??
          error?.error?.code ??
          state.processes.at(-1).launchError ??
          'host-error',
        sourceDigest: digest(text),
      };
    }
    const failed = envelope('failed-launch', {
      prepared: state.receipt,
      processes: state.processes,
      outcome,
      failure,
      metrics: null,
    });
    state.closed = true;
    write(resolve(this.root, id + '-failed.json'), failed);
    this.save();
    return failed;
  }
  probeHelper(id, { variant, operation, inputFile, checkpoint = null }) {
    const state = this.launches.get(id);
    requireThat(
      state && !state.closed && state.processes.length,
      'actual live launch required for boundary stimulus',
    );
    requireThat(
      !state.probes.some((p) => p.variant === variant),
      'one actual boundary stimulus per variant',
    );
    const allowed = {
      'oversized-question': 'question',
      'oversized-result': 'terminal',
      'missing-evidence': 'verify-terminal',
      'head-drift': 'resume',
      'tracked-drift': 'resume',
      'untracked-drift': 'resume',
      interrupted: 'resume',
      injected: 'reply',
      stale: 'resume',
    };
    requireThat(
      allowed[variant] === operation,
      'boundary stimulus bound to the exact helper operation',
    );
    const inputText = readRegular(inputFile, 128 * 1024),
      input = JSON.parse(inputText),
      runtime = realpathSync(input.runtimeStateRoot);
    requireThat(
      runtime === state.input.fixtureRoot || below(state.input.fixtureRoot, runtime),
      'refuse helper mutation outside isolated fixture runtime',
    );
    requireThat(/^[A-Za-z0-9_-]+$/.test(input.runId), 'invalid actual build-run ID');
    const requestText = readRegular(
        resolve(runtime, '.effective-flow/build-runs', input.runId, 'request.json'),
        16 * 1024,
      ),
      request = JSON.parse(requestText);
    requireThat(
      digest(requestText) === input.requestDigest &&
        request.runId === input.runId &&
        request.repositoryIdentity === input.repositoryIdentity,
      'actual candidate run/request binding changed',
    );
    requireThat(
      digest(JSON.stringify(fileMembership(state.input.skillRoot))) ===
        verifyEnvelope(state.receipt, 'prepared').targetDigest,
      'measured helper/target changed',
    );
    const script = resolve(state.input.skillRoot, 'scripts/build-run.mjs'),
      at = Date.now();
    const policy =
      '(version 1)(allow default)(deny file-write* (subpath ' + JSON.stringify(this.root) + '))';
    requireThat(
      process.platform === 'darwin' && existsSync('/usr/bin/sandbox-exec'),
      'actual OS protection unavailable',
    );
    let missingEvidenceObserved = false;
    if (variant === 'missing-evidence') {
      const terminalText = readRegular(
          resolve(input.terminal.root, input.terminal.path),
          16 * 1024,
        ),
        terminal = JSON.parse(terminalText);
      requireThat(
        digest(terminalText) === input.terminal.digest,
        'terminal record itself must exist with original identity',
      );
      missingEvidenceObserved = (terminal.gates ?? []).some(
        (ref) => !existsSync(resolve(ref.root, ref.path)),
      );
    }
    const interruptedLockObserved = existsSync(
      resolve(runtime, '.effective-flow/build-runs', input.runId, '.operation.lock'),
    );
    const output = spawnSync(
      '/usr/bin/sandbox-exec',
      ['-p', policy, process.execPath, script, operation],
      { input: inputText, encoding: 'utf8', timeout: 30000, maxBuffer: 128 * 1024 },
    );
    requireThat(!output.error, 'boundary helper process did not finish');
    const result = JSON.parse(output.stdout);
    const alias = (value) => digest(state.input.aliasSalt + '\0' + value);
    const event = observedHelperEvent(
      {
        id: String(at),
        arguments: {
          cmd: 'node ' + script + ' ' + operation + " <<'JSON'\n" + inputText + '\nJSON',
        },
        resultLine: 0,
        at,
      },
      result,
      {
        session: 'host-stimulus',
        sourceDigest: digest(output.stdout),
        alias,
        agentSession: () => null,
        roots: { 'build-run': script },
      },
    );
    requireThat(event, 'actual helper returned a foreign operation');
    Object.assign(event, {
      variant,
      requestVerified: true,
      missingEvidenceObserved,
      interruptedLockObserved,
      processExitCode: output.status,
      scriptDigest: digest(readRegular(script)),
      callDigest: digest(
        JSON.stringify({
          at,
          operation,
          inputDigest: digest(inputText),
          outputDigest: digest(output.stdout),
        }),
      ),
    });
    if (['head-drift', 'tracked-drift', 'untracked-drift'].includes(variant)) {
      requireThat(checkpoint, 'immutable pre-drift checkpoint required');
      event.drift = observeDrift({ checkout: request.execution.executionRoot, checkpoint });
    }
    state.probes.push(event);
    this.save();
    return event;
  }
  complete(id, manifest) {
    const state = this.launches.get(id);
    requireThat(
      state && !state.closed && state.processes.length,
      'actual coordinator launch required before completion',
    );
    const prepared = verifyEnvelope(state.receipt, 'prepared');
    requireThat(
      manifest.host.sessions.every((entry) =>
        below(state.input.transcriptDir, realpathSync(entry.path)),
      ),
      'transcript outside exclusively prepared host destination',
    );
    const positive =
      !prepared.scenario ||
      [
        'complete',
        'corrected',
        'consent',
        'refusal',
        'refused-before-mutation',
        'removed-checkout',
      ].includes(prepared.variant);
    const hostInput = {
      ...manifest.host,
      skillRoot: state.input.skillRoot,
      profile: prepared.profile,
      aliasSalt: state.input.aliasSalt,
      fastModels:
        prepared.target === 'portable'
          ? []
          : [prepared.profile.model === 'gpt-6.1-sol' ? 'gpt-5.6-luna' : 'sonnet'],
    };
    const sourceRepository = realpathSync(
      resolve(
        state.input.fixtureRoot,
        execFileSync('git', ['rev-parse', '--git-common-dir'], {
          cwd: state.input.fixtureRoot,
          encoding: 'utf8',
        }).trim(),
      ),
    );
    const run = positive
      ? captureRun(
          {
            ...manifest,
            checkout: state.input.fixtureRoot,
            sourceRepository,
            approvedBaseHead: prepared.fixture.head,
            skillRoot: state.input.skillRoot,
            controlledReview: state.controlledReview,
            protectedJournal: this.root,
            host: hostInput,
          },
          prepared.condition === 'baseline',
          prepared.complexity,
        )
      : captureHostEvidence(hostInput);
    requireThat(
      digest(JSON.stringify(fileMembership(state.input.skillRoot))) === prepared.targetDigest,
      'target changed during actual workflow',
    );
    const actual = run[PRIVATE_CAPTURE],
      root = actual?.root?.parsed;
    requireThat(
      root?.reportedVersion === prepared.profile.reportedVersion,
      'actual host version differs from pinned profile',
    );
    requireThat(
      root &&
        !root.meta?.parent_thread_id &&
        !root.parentToolUseId &&
        root.cwd &&
        resolve(root.cwd) === state.input.fixtureRoot,
      'actual fresh nonforked root/fixture metadata required',
    );
    requireThat(
      root.firstAt >= state.processes[0].startedAt - 1000 &&
        root.lastAt <= state.processes.at(-1).finishedAt + 1000,
      'root timestamps do not belong to observed CLI processes',
    );
    requireThat(
      root.users[0]?.text?.includes(state.prompt),
      'actual initial user instruction bytes differ from prelaunch prompt',
    );
    for (const observation of run.observations) {
      requireThat(
        !this.usedRoots.has(observation.sessionIdentity) &&
          !this.usedSources.has(observation.sourceDigest),
        'actual session/transcript reused as a new sample',
      );
      this.usedRoots.add(observation.sessionIdentity);
      this.usedSources.add(observation.sourceDigest);
    }
    const launch = envelope('launch', {
      prepared: state.receipt,
      processes: state.processes,
      freshRoot: true,
      initialPromptObserved: true,
      firstUserDigest: root.users[0].digest,
      rootSourceDigest: root.sourceDigest,
      preparedSeal: state.receipt.seal,
      firstAt: root.firstAt,
      lastAt: root.lastAt,
      rootIdentity: run.observations.find((o) => o.parent === null).sessionIdentity,
    });
    const nativeIdentity =
      prepared.target === 'portable'
        ? null
        : nativeTargetIdentity(state.input.skillRoot, prepared.target);
    const body = JSON.parse(
      JSON.stringify({
        ...run,
        nativeIdentity,
        name: prepared.variant,
        boundaryProbes: state.probes,
        drift: state.probes.find((p) => p.drift)?.drift ?? null,
        launchBinding: {
          harness: prepared.harness,
          complexity: prepared.complexity,
          slot: prepared.slot,
          condition: prepared.condition,
          scenario: prepared.scenario,
          variant: prepared.variant,
          fixture: prepared.fixture,
          promptDigest: prepared.promptDigest,
          settingsDigest: prepared.settingsDigest,
          sourceBuildDigest: prepared.build.seal,
        },
      }),
    );
    const provenance = envelope('completion', {
      launch,
      protection: 'os-enforced',
      runDigest: digest(JSON.stringify(body)),
    });
    const completion = { ...body, provenance };
    state.closed = true;
    write(resolve(this.root, id + '-complete.json'), completion);
    this.save();
    return completion;
  }
}
