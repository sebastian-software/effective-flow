// Closed Claude whole-process boundary. Native internal logs are mutable and never provenance.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { nativePolicy } from './native-sandbox.mjs';
import { claudeRuntimeIdentity } from './claude-runtime.mjs';
import { digest, readRegular } from './transcript.mjs';
import { requireThat, SCHEMA } from './protocol.mjs';
import { nativeWorkerNames } from './native-workers.mjs';
const below = (root, p) => p === root || p.startsWith(root + '/');
export const CLAUDE_PROVIDER_DOMAINS = Object.freeze(['api.anthropic.com']);
export const CLAUDE_SETTINGS = Object.freeze({
  sandbox: { enabled: false },
  permissions: { defaultMode: 'dontAsk', disableBypassPermissionsMode: 'disable' },
  disableAllHooks: true,
});
export function claudePolicy({ fixtureRoot, skillRoot, protectedRoots, command }) {
  const runtime = claudeRuntimeIdentity(command.sandboxRuntime),
    base = nativePolicy({
      fixtureRoot,
      skillRoot,
      protectedRoots: [...protectedRoots, realpathSync(skillRoot), runtime.root],
    });
  const stateRoots = [command.home, command.claudeHome, command.claudeTmp].map((p) => {
    requireThat(typeof p === 'string', 'isolated Claude HOME/config/temp required');
    const root = realpathSync(p);
    requireThat(root === resolve(p), 'Claude state paths must be physical');
    return root;
  });
  const writes = [...new Set([...base.writes, ...stateRoots])].sort();
  for (const p of base.protectedPaths)
    for (const w of writes)
      requireThat(
        !below(w, p) && !below(p, w),
        'protected Claude provenance overlaps writable state',
      );
  const definition = {
    network: {
      allowedDomains: [...CLAUDE_PROVIDER_DOMAINS],
      deniedDomains: [],
      allowLocalBinding: false,
    },
    filesystem: {
      allowWrite: writes,
      denyWrite: [...base.protectedPaths, '/tmp/claude', '/private/tmp/claude'],
      denyRead: [],
    },
  };
  return {
    ...base,
    kind: 'claude-process',
    runtime,
    writes,
    stateRoots,
    definition,
    policyDigest: digest(
      JSON.stringify({
        definition,
        runtimeDigest: runtime.membershipDigest,
        settings: CLAUDE_SETTINGS,
      }),
    ),
    providerDomainsDigest: digest(JSON.stringify(CLAUDE_PROVIDER_DOMAINS)),
  };
}
export function bindClaudeAgents({ skillRoot, target, journalRoot }) {
  if (target !== 'claude') return null;
  const root = resolve(skillRoot, '../agents'),
    definitions = {};
  nativeWorkerNames(skillRoot, 'claude');
  for (const file of readdirSync(root)
    .filter((f) => /^effective-flow-[a-z0-9-]+\.md$/.test(f))
    .sort()) {
    const source = readRegular(resolve(root, file), 256 * 1024),
      match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    requireThat(match, 'canonical native Claude frontmatter required');
    const fields = Object.fromEntries(
      match[1].split('\n').map((line) => {
        const at = line.indexOf(':');
        requireThat(at > 0, 'closed native agent metadata');
        return [line.slice(0, at), line.slice(at + 1).trim()];
      }),
    );
    requireThat(
      Object.keys(fields).every((k) =>
        ['name', 'description', 'model', 'effort', 'tools', 'color'].includes(k),
      ) &&
        fields.name === file.slice(0, -3) &&
        ['opus', 'sonnet', 'haiku', 'inherit'].includes(fields.model) &&
        ['low', 'medium', 'high', 'xhigh', 'max'].includes(fields.effort),
      'unknown canonical native agent metadata',
    );
    definitions[fields.name] = {
      description: JSON.parse(fields.description),
      prompt: match[2],
      model: fields.model,
      effort: fields.effort,
      tools: fields.tools.split(',').map((v) => v.trim()),
    };
  }
  requireThat(Object.keys(definitions).length > 0, 'measured native agent inventory absent');
  const bytes = JSON.stringify(definitions),
    path = resolve(journalRoot, 'claude-agents-' + digest(bytes).slice(7) + '.json');
  if (!existsSync(path)) writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
  requireThat(readRegular(path, 2 * 1024 * 1024) === bytes, 'bound native agents changed');
  return path;
}
export function claudeExecArgs(args, { resume = false, nativeAgentsFile = null } = {}) {
  requireThat(Array.isArray(args), 'closed Claude argument vector required');
  let model = null,
    effort = null,
    resumeId = null;
  const seen = new Set(),
    extra = [];
  const once = (k) => {
    requireThat(!seen.has(k), 'duplicate Claude option');
    seen.add(k);
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    requireThat(typeof a === 'string' && !/[\n\r\0]/.test(a), 'invalid Claude option');
    if (
      ['--print', '-p', '--verbose', '--replay-user-messages', '--forward-subagent-text'].includes(
        a,
      )
    ) {
      once(a === '-p' ? '--print' : a);
      continue;
    }
    if (['--input-format', '--output-format'].includes(a)) {
      once(a);
      requireThat(args[++i] === 'stream-json', 'Claude provenance requires actual stream-json');
      continue;
    }
    if (a === '--model') {
      once(a);
      model = args[++i];
      requireThat(
        typeof model === 'string' && /^[a-z0-9][a-z0-9._-]{0,79}$/.test(model),
        'closed Claude model required',
      );
      continue;
    }
    if (a === '--effort') {
      once(a);
      effort = args[++i];
      requireThat(
        ['low', 'medium', 'high', 'xhigh', 'max'].includes(effort),
        'closed Claude effort required',
      );
      continue;
    }
    if (a === '--resume') {
      once(a);
      resumeId = args[++i];
      requireThat(
        typeof resumeId === 'string' &&
          /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(resumeId),
        'actual same-root Claude UUID required',
      );
      continue;
    }
    if (a === '--max-turns') {
      once(a);
      const n = args[++i];
      requireThat(/^[1-9][0-9]{0,3}$/.test(n), 'bounded Claude turns required');
      extra.push(a, n);
      continue;
    }
    requireThat(false, 'Claude option/positional outside closed recording grammar');
  }
  requireThat(
    model && effort && Boolean(resumeId) === resume,
    'explicit Claude model/effort and fresh/same-root mode required',
  );
  return [
    '--print',
    '--verbose',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--replay-user-messages',
    '--forward-subagent-text',
    '--model',
    model,
    '--effort',
    effort,
    '--setting-sources',
    '',
    '--settings',
    JSON.stringify(CLAUDE_SETTINGS),
    '--permission-mode',
    'dontAsk',
    '--permission-prompts',
    'none',
    '--strict-mcp-config',
    '--mcp-config',
    '{"mcpServers":{}}',
    '--tools',
    'Agent,Bash,Read,Edit,Write,Glob,Grep,Skill,TaskStop,SendMessage,ListAgents,ToolSearch',
    '--allowedTools',
    'Agent,Bash,Read,Edit,Write,Glob,Grep,Skill,TaskStop,SendMessage,ListAgents,ToolSearch',
    '--no-chrome',
    ...extra,
    ...(resume ? ['--resume', resumeId] : []),
    ...(nativeAgentsFile ? ['--agents', nativeAgentsFile] : []),
  ];
}
export function claudeEnvironment(command, policy) {
  requireThat(
    JSON.stringify(
      [command.home, command.claudeHome, command.claudeTmp].map((p) => realpathSync(p)),
    ) === JSON.stringify(policy.stateRoots),
    'actual Claude mutable state roots changed',
  );
  return {
    PATH: process.env.PATH,
    HOME: command.home,
    CLAUDE_CONFIG_DIR: command.claudeHome,
    TMPDIR: command.claudeTmp,
    CLAUDE_CODE_TMPDIR: command.claudeTmp,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    DISABLE_AUTOUPDATER: '1',
    EVAL_TRACKER_LOG: policy.ledger,
    EVAL_TRACKER_FIXTURE: policy.fixtureFile,
    SHELL: '/bin/bash',
  };
}
export function claudeSandboxArgs(policy, settingsPath, executable, args) {
  return [policy.runtime.cli, '--settings', settingsPath, '--', executable, ...args];
}
export function probeClaudeProcess({
  executable,
  reportedVersion,
  policy,
  environment,
  execArgs,
  journalRoot,
}) {
  requireThat(
    process.platform === 'darwin',
    'Claude whole-process OS guard is supported only on macOS',
  );
  requireThat(
    claudeRuntimeIdentity(policy.runtime.root).membershipDigest === policy.runtime.membershipDigest,
    'official runtime changed',
  );
  const binary = realpathSync(executable),
    version = spawnSync(binary, ['--version'], { env: environment, encoding: 'utf8' });
  requireThat(
    version.status === 0 && version.stdout.trim() === reportedVersion + ' (Claude Code)',
    'actual Claude binary/version differs',
  );
  const script = resolve(import.meta.dirname, 'claude-process-probe.mjs');
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify({
      executable: binary,
      reportedVersion,
      policy,
      environment,
      execArgs,
      journalRoot,
    }),
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 4 * 1024 * 1024,
  });
  requireThat(
    !result.error && result.status === 0,
    'actual Claude whole-process guard failed: ' +
      (result.stderr || result.stdout || result.error?.code),
  );
  const guard = JSON.parse(result.stdout);
  requireThat(
    guard.kind === 'claude-process' &&
      guard.policyDigest === policy.policyDigest &&
      guard.writeDenied &&
      guard.inheritedDenied &&
      guard.fileEditDenied &&
      guard.fileWriteDenied &&
      guard.networkDenied &&
      guard.gitPush &&
      guard.stubLedger,
    'actual Claude whole-process guard incomplete',
  );
  return guard;
}
export function claudeUserInput(prompt) {
  requireThat(
    typeof prompt === 'string' && prompt.length > 0,
    'actual Claude user message required',
  );
  return (
    JSON.stringify({
      type: 'user',
      session_id: '',
      message: { role: 'user', content: [{ type: 'text', text: prompt }] },
      parent_tool_use_id: null,
    }) + '\n'
  );
}
export function launchClaudeProcess({
  executable,
  policy,
  environment,
  execArgs,
  prompt,
  journalRoot,
  turn,
  timeoutMs,
}) {
  const settingsPath = resolve(
    journalRoot,
    'claude-policy-' + policy.policyDigest.slice(7) + '.json',
  );
  if (!existsSync(settingsPath))
    writeFileSync(settingsPath, JSON.stringify(policy.definition), { flag: 'wx', mode: 0o600 });
  requireThat(
    readRegular(settingsPath) === JSON.stringify(policy.definition),
    'actual outer Claude policy changed',
  );
  const base = resolve(journalRoot, 'claude-turn-' + turn),
    worker = resolve(import.meta.dirname, 'claude-stream-worker.mjs');
  const input = claudeUserInput(prompt);
  const run = spawnSync(process.execPath, [worker], {
    input: JSON.stringify({
      executable: process.execPath,
      args: claudeSandboxArgs(policy, settingsPath, executable, execArgs),
      cwd: policy.fixture,
      environment,
      input,
      base,
      timeoutMs,
    }),
    encoding: 'utf8',
    timeout: timeoutMs + 10000,
    maxBuffer: 1024 * 1024,
  });
  requireThat(
    !run.error && run.status === 0,
    'host stream collector failed; no success evidence: ' + run.stderr,
  );
  const result = JSON.parse(run.stdout);
  return {
    ...result,
    stdout: readFileSync(base + '.stdout.jsonl'),
    stderr: readFileSync(base + '.stderr.txt'),
    capturePath: base + '.capture.jsonl',
    stdoutPath: base + '.stdout.jsonl',
  };
}
