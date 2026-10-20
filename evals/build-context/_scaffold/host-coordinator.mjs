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
import { resolve, basename, dirname } from 'node:path';
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
import {
  nativePolicy,
  nativeExecArgs,
  probeNativeSandbox,
  nativeContextProblems,
  mirrorTrackerLedger,
  trackerLedgerProblems,
} from './native-sandbox.mjs';
import { observeToolFailure } from './tool-failure.mjs';
import {
  claudePolicy,
  bindClaudeAgents,
  claudeExecArgs,
  claudeEnvironment,
  probeClaudeProcess,
  launchClaudeProcess,
  claudeUserInput,
} from './claude-process.mjs';
import { materializeClaudeStreams, decodeClaudeCapture } from './claude-stream.mjs';
import { claudeRuntimeIdentity } from './claude-runtime.mjs';
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
    nativeAgentDefinitionsDigest: command.nativeAgentsFile
      ? digest(readRegular(command.nativeAgentsFile, 2 * 1024 * 1024))
      : null,
    stubFixtureDigest: roots.stubRoot
      ? digest(readRegular(resolve(roots.stubRoot, 'fixture.json'), 256 * 1024))
      : null,
    profile: normalizeProfile(command.profile),
  };
}
export function recordingSettings(command, input) {
  return observedSettings(command, {
    fixtureRoot: input.fixtureRoot,
    skillRoot: input.skillRoot,
    stubRoot: dirname(input.skillRoot),
    transcripts: input.transcriptDir,
    home: command.home,
    codexHome: command.codexHome,
    claudeHome: command.claudeHome,
    claudeTmp: command.claudeTmp,
    sandboxRuntime: command.sandboxRuntime,
    hostJournalRoot: command.hostJournalRoot,
  });
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
    requireThat(
      (harness === 'codex-cli' && basename(command.executable) === 'codex') ||
        (harness === 'claude-code' && basename(command.executable) === 'claude'),
      'CLI executable differs from declared harness',
    );
    let nativeSandbox = null;
    if (harness === 'codex-cli') {
      requireThat(command.codexHome && command.home, 'isolated native HOME/CODEX_HOME required');
      requireThat(
        resolve(transcripts) === resolve(command.codexHome, 'sessions'),
        'native transcripts must use the exclusive actual CODEX_HOME/sessions destination',
      );
      mkdirSync(transcripts, { recursive: true });
      nativeSandbox = nativePolicy({
        target,
        fixtureRoot,
        skillRoot,
        protectedRoots: [
          this.root,
          realpathSync(command.home),
          realpathSync(command.codexHome),
          realpathSync(transcripts),
        ],
      });
      command.args = nativeExecArgs(command.args, nativeSandbox);
    } else {
      mkdirSync(transcripts, { recursive: true });
      nativeSandbox = claudePolicy({
        fixtureRoot,
        skillRoot,
        protectedRoots: [this.root, realpathSync(transcripts)],
        command,
      });
      command.nativeAgentsFile = bindClaudeAgents({ skillRoot, target, journalRoot: this.root });
      command.hostJournalRoot = this.root;
      command.args = claudeExecArgs(command.args, { nativeAgentsFile: command.nativeAgentsFile });
    }
    requireThat(
      !existsSync(nativeSandbox.ledger) && !existsSync(nativeSandbox.lock),
      'fresh fixture tracker ledger required',
    );
    const initial = existsSync(nativeSandbox.archiveLedger)
      ? readRegular(nativeSandbox.archiveLedger, 2 * 1024 * 1024)
      : '';
    if (initial) writeFileSync(nativeSandbox.ledger, initial, { flag: 'wx', mode: 0o600 });
    const prompt = readRegular(input.promptFile, 128 * 1024),
      settings = recordingSettings(command, { fixtureRoot, skillRoot, transcriptDir: transcripts });
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
      ...(harness === 'claude-code' ? { inputDigest: digest(claudeUserInput(prompt)) } : {}),
      settingsDigest: digest(JSON.stringify(settings)),
      profile: settings.profile,
      settings,
      transcriptDestinationWasEmpty: true,
      targetDigest: digest(JSON.stringify(fileMembership(skillRoot))),
      trackerInitialDigest: digest(
        nativeSandbox && existsSync(nativeSandbox.archiveLedger)
          ? readRegular(nativeSandbox.archiveLedger, 2 * 1024 * 1024)
          : '',
      ),
      nativeSandbox: nativeSandbox
        ? {
            kind: nativeSandbox.kind ?? 'codex-native',
            ...(nativeSandbox.kind === 'claude-process'
              ? {
                  runtimeDigest: nativeSandbox.runtime.membershipDigest,
                  providerDomainsDigest: nativeSandbox.providerDomainsDigest,
                }
              : {}),
            policyDigest: nativeSandbox.policyDigest,
            execArgumentsDigest: digest(JSON.stringify(command.args)),
            binaryDigest: digest(readFileSync(realpathSync(command.executable))),
            writeRootDigests: nativeSandbox.writes.map(digest),
            protectedRootDigests: nativeSandbox.protectedPaths.map(digest),
          }
        : null,
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
      nativePolicy: nativeSandbox,
      trackerInitialText:
        nativeSandbox && existsSync(nativeSandbox.archiveLedger)
          ? readRegular(nativeSandbox.archiveLedger, 2 * 1024 * 1024)
          : '',
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
    requireThat(
      state.nativePolicy &&
        ['codex-cli', 'claude-code'].includes(verifyEnvelope(state.receipt, 'prepared').harness),
      'native host journal protection is unproven for this harness; no model launched',
    );
    requireThat(
      digest(JSON.stringify(recordingSettings(state.command, state.input))) ===
        verifyEnvelope(state.receipt, 'prepared').settingsDigest,
      'actual settings changed after prelaunch',
    );
    const isClaude = state.nativePolicy.kind === 'claude-process';
    const environment = isClaude
      ? claudeEnvironment(state.command, state.nativePolicy)
      : {
          PATH: process.env.PATH,
          HOME: state.command.home,
          CODEX_HOME: state.command.codexHome,
          CLAUDE_CONFIG_DIR: state.command.claudeHome,
          EVAL_TRACKER_LOG: state.nativePolicy.ledger,
          EVAL_TRACKER_FIXTURE: state.nativePolicy.fixtureFile,
        };
    const actualArgs = resume
      ? isClaude
        ? claudeExecArgs(args, { resume: true, nativeAgentsFile: state.command.nativeAgentsFile })
        : nativeExecArgs(args, state.nativePolicy, { resume: true })
      : state.command.args;
    const beforeGuard = checkoutBasis(state.input.fixtureRoot);
    const guardObservation = (isClaude ? probeClaudeProcess : probeNativeSandbox)({
      journalRoot: this.root,
      executable: state.command.executable,
      reportedVersion: verifyEnvelope(state.receipt, 'prepared').profile.reportedVersion,
      policy: state.nativePolicy,
      environment,
      execArgs: actualArgs,
    });
    requireThat(
      isDeepStrictEqual(beforeGuard, checkoutBasis(state.input.fixtureRoot)),
      'native probe changed fixture Git/content basis',
    );
    requireThat(
      guardObservation.binaryDigest ===
        verifyEnvelope(state.receipt, 'prepared').nativeSandbox.binaryDigest,
      'native CLI binary changed since preparation',
    );
    write(
      resolve(this.root, id + '-native-guard-' + (state.processes.length + 1) + '.json'),
      envelope('native-guard', guardObservation),
    );
    const startedAt = Date.now(),
      result = isClaude
        ? launchClaudeProcess({
            executable: state.command.executable,
            policy: state.nativePolicy,
            environment,
            execArgs: actualArgs,
            prompt: resume ? prompt : state.prompt,
            journalRoot: this.root,
            turn: id + '-' + (state.processes.length + 1),
            timeoutMs: state.command.timeoutMs ?? 1800000,
          })
        : spawnSync(state.command.executable, actualArgs, {
            cwd: state.input.fixtureRoot,
            env: environment,
            input: resume ? prompt : state.prompt,
            encoding: 'utf8',
            timeout: state.command.timeoutMs ?? 1800000,
            maxBuffer: 16 * 1024 * 1024,
          });
    requireThat(
      digest(readFileSync(realpathSync(state.command.executable))) ===
        guardObservation.binaryDigest,
      'native CLI binary changed during process',
    );
    if (isClaude)
      requireThat(
        claudeRuntimeIdentity(state.nativePolicy.runtime.root).membershipDigest ===
          state.nativePolicy.runtime.membershipDigest,
        'actual official runtime changed during process',
      );
    const postSettings = recordingSettings(state.command, state.input);
    requireThat(
      digest(JSON.stringify(postSettings)) ===
        verifyEnvelope(state.receipt, 'prepared').settingsDigest,
      'actual CLI settings/inventory changed during process',
    );
    const priorLedger =
      state.processes.at(-1)?.trackerMirror?.archiveDigest ??
      verifyEnvelope(state.receipt, 'prepared').trackerInitialDigest;
    const trackerMirror = mirrorTrackerLedger(state.nativePolicy, priorLedger);
    const event = {
      trackerMirror,
      settingsObservationDigest: digest(JSON.stringify(postSettings)),
      managedSystemPresent:
        !!state.command.codexHome && existsSync(resolve(state.command.codexHome, 'skills/.system')),
      startedAt: isClaude ? result.startedAt : startedAt,
      finishedAt: isClaude ? result.finishedAt : Date.now(),
      exitCode: isClaude ? result.exitCode : (result.status ?? 1),
      ...(isClaude
        ? {
            captureDigest: result.captureDigest,
            collectorDigest: result.collectorDigest,
            inputDigest: result.inputDigest,
            signal: result.signal,
          }
        : {}),
      launchError: isClaude ? result.launchError : (result.error?.code ?? null),
      stdoutDigest: digest(result.stdout),
      stderrDigest: digest(result.stderr),
      guard: guardObservation,
      policyDigest: state.nativePolicy.policyDigest,
      launchArgumentsDigest: digest(JSON.stringify(actualArgs)),
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
    if (isClaude) {
      state.capturePaths ??= [];
      state.turnPrompts ??= [];
      state.capturePaths.push(result.capturePath);
      state.turnPrompts.push(resume ? prompt : state.prompt);
      try {
        state.streamProjection = materializeClaudeStreams({
          processes: state.processes,
          capturePaths: state.capturePaths,
          outputPaths: state.outputPaths,
          destination: state.input.transcriptDir,
          target: verifyEnvelope(state.receipt, 'prepared').target,
          prompts: state.turnPrompts,
        });
      } catch (error) {
        state.streamProjection = { error: error.message };
      }
      write(
        resolve(this.root, id + '-streams-' + state.processes.length + '.json'),
        state.streamProjection,
      );
    }
    this.save();
    return event;
  }
  fail(id, { outcome = 'failed', host = null, rootTranscript = null } = {}) {
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
          root.initialUser?.text?.includes(state.prompt),
        'actual prelaunch-linked nesting refusal missing',
      );
      failure = { code: 'unsupported-depth', sourceDigest: root.sourceDigest };
    } else {
      if (state.processes.every((p) => p.exitCode === 0)) {
        if (state.nativePolicy?.kind === 'claude-process') {
          const rows = decodeClaudeCapture(
            readRegular(state.capturePaths.at(-1), 24 * 1024 * 1024),
            readRegular(state.outputPaths.at(-1), 16 * 1024 * 1024),
            state.processes.at(-1),
          );
          const error = rows.find((r) => r.event.type === 'result' && r.event.is_error === true);
          requireThat(error, 'actual external Claude terminal error missing');
          failure = {
            code: error.event.api_error ?? error.event.subtype ?? 'host-error',
            sourceDigest: digest(readRegular(state.outputPaths.at(-1))),
            captureDigest: state.processes.at(-1).captureDigest,
            cliExitCode: 0,
          };
        } else {
          requireThat(
            rootTranscript &&
              state.command.codexHome &&
              below(resolve(state.command.codexHome, 'sessions'), realpathSync(rootTranscript)),
            'actual CLI session transcript required for zero-exit tool failure',
          );
          failure = observeToolFailure({
            stdoutText: readRegular(state.outputPaths.at(-1)),
            rootText: readRegular(rootTranscript),
            process: state.processes.at(-1),
            prompt: state.prompt,
            fixtureRoot: state.input.fixtureRoot,
            reportedVersion: verifyEnvelope(state.receipt, 'prepared').profile.reportedVersion,
          });
        }
      } else {
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
    const script = resolve(state.input.skillRoot, 'scripts/build-run.mjs');
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
    const callAt = Date.now();
    const output = spawnSync(
      '/usr/bin/sandbox-exec',
      ['-p', policy, process.execPath, script, operation],
      { input: inputText, encoding: 'utf8', timeout: 30000, maxBuffer: 128 * 1024 },
    );
    const at = Date.now();
    requireThat(!output.error, 'boundary helper process did not finish');
    const result = JSON.parse(output.stdout);
    const alias = (value) => digest(state.input.aliasSalt + '\0' + value);
    const event = observedHelperEvent(
      {
        id: String(callAt),
        callAt,
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
      callAt,
      processExitCode: output.status,
      scriptDigest: digest(readRegular(script)),
      callDigest: digest(
        JSON.stringify({
          callAt,
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
    const isClaude = state.nativePolicy?.kind === 'claude-process';
    if (isClaude) {
      const projection = materializeClaudeStreams({
        processes: state.processes,
        capturePaths: state.capturePaths,
        outputPaths: state.outputPaths,
        destination: state.input.transcriptDir,
        target: prepared.target,
        prompts: state.turnPrompts,
      });
      requireThat(
        isDeepStrictEqual(manifest.host.sessions, projection.sessions),
        'Claude sessions must equal complete protected external stream projection',
      );
    }
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
            protectedRoots: state.nativePolicy?.protectedPaths,
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
      root.initialUser?.text?.includes(state.prompt),
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
    requireThat(
      state.nativePolicy && prepared.nativeSandbox,
      'actual native protection was not established for this launch',
    );
    const policySessions = [];
    for (const [alias, item] of actual.sessions) {
      const observation = run.observations.find((o) => o.session === alias);
      if (isClaude) {
        const stream = item.parsed.streamCapture;
        requireThat(
          stream && stream.processIndexes.length > 0,
          'actual external Claude process ancestry missing',
        );
        policySessions.push({
          sessionIdentity: observation.sessionIdentity,
          sourceDigest: observation.sourceDigest,
          captures: stream.processIndexes.map((processIndex) => ({
            processIndex,
            captureDigest: state.processes[processIndex]?.captureDigest,
          })),
        });
      } else {
        const problems = nativeContextProblems(item.parsed.permissionContexts, state.nativePolicy);
        requireThat(problems.length === 0, alias + ': ' + problems.join('; '));
        policySessions.push({
          sessionIdentity: observation.sessionIdentity,
          sourceDigest: observation.sourceDigest,
          contexts: item.parsed.permissionContexts.length,
          observedPolicyDigest: digest(JSON.stringify(item.parsed.permissionContexts)),
        });
      }
    }
    const trackerProblems = trackerLedgerProblems(
      run,
      state.nativePolicy,
      state.trackerInitialText,
    );
    requireThat(trackerProblems.length === 0, trackerProblems.join('; '));
    const lastMirror = state.processes.at(-1).trackerMirror;
    requireThat(
      lastMirror &&
        lastMirror.sourceDigest ===
          digest(
            existsSync(state.nativePolicy.ledger)
              ? readRegular(state.nativePolicy.ledger, 2 * 1024 * 1024)
              : '',
          ),
      'actual tracker ledger changed after host mirror',
    );
    run.trackerLedgerProof = {
      initialDigest: digest(state.trackerInitialText),
      finalDigest: lastMirror.archiveDigest,
      actualCalls: (run.helperEvents ?? []).filter((e) => e.family === 'tracker').length,
    };
    run.nativePolicyProof = {
      kind: isClaude ? 'claude-process' : 'codex-native',
      policyDigest: state.nativePolicy.policyDigest,
      sessions: policySessions,
    };
    const launch = envelope('launch', {
      prepared: state.receipt,
      processes: state.processes,
      freshRoot: true,
      initialPromptObserved: true,
      firstUserDigest: root.initialUser.digest,
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
