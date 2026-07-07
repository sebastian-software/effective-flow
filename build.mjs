#!/usr/bin/env node

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  renameSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  normalizeLineEndings,
  extractFrontmatter,
  extractBody,
  getField,
  getNested,
  getNestedArray,
  getNestedList,
  cleanDescription,
  firstSentence,
  tomlString,
  normalizeCodexSandboxMode,
  validateRefs,
  assertQuotedDescription,
  renderBody,
} from './build-lib.mjs';

const ROOT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = join(ROOT_DIR, 'src');
const SHARED_DIR = join(SOURCE_DIR, 'shared');
const TOOLS_DIR = join(SOURCE_DIR, 'tools');
const AGENTS_DIR = join(SOURCE_DIR, 'agents');
const ROUTER_SRC = join(SOURCE_DIR, 'SKILL.md');

// The build writes into a temporary tree and swaps it onto dist/ only after a
// fully successful build (see the atomic swap below), so dist/ is always either
// entirely the previous build or entirely the new one — never a half-written
// mix left behind by a mid-build throw.
const DIST_ROOT = join(ROOT_DIR, 'dist');
const DIST_TMP = join(ROOT_DIR, 'dist.tmp');
const DIST_BAK = join(ROOT_DIR, 'dist.bak');

const FIRMO_SKILL_NAME = 'firmo';
const DIST_CODEX = join(DIST_TMP, 'codex');
const DIST_CLAUDE = join(DIST_TMP, 'claude');
const CODEX_SKILL_DIR = join(DIST_CODEX, FIRMO_SKILL_NAME);
const CLAUDE_SKILL_DIR = join(DIST_CLAUDE, FIRMO_SKILL_NAME);
// Claude Code does not auto-discover skill-nested agents, so Claude agents ship
// separately as registered subagents (installed into ~/.claude/agents),
// namespaced with a `firmo-` prefix to avoid collisions with other agents.
const CLAUDE_AGENTS_DIR = join(DIST_CLAUDE, 'agents');
const CLAUDE_AGENT_PREFIX = 'firmo-';

// The tools exposed via `/firmo <tool>` (order = catalog order in the router).
// Orchestrator/utility skills whose mapped name is not in this list are treated
// as internal (built as tool files, but not listed in the router catalog).
const EXPOSED_TOOLS = [
  'build',
  'fix',
  'plan',
  'refactor',
  'docs',
  'review',
  'apply',
  'plan-issue',
  'maintain',
  'commit',
  'pr',
  'setup',
  'open-plans',
  'investigate',
  'version',
];

const versionPath = join(ROOT_DIR, 'version.txt');
if (!existsSync(versionPath)) {
  process.stderr.write('ERROR: version.txt not found in project root\n');
  process.exit(1);
}
const VERSION = readFileSync(versionPath, 'utf8').trim();
// The git hash is purely cosmetic version metadata; outside a git repo
// (e.g. a source export) fall back to a placeholder instead of failing.
let GIT_SHORT_HASH;
try {
  GIT_SHORT_HASH = execSync('git rev-parse --short HEAD', {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch {
  GIT_SHORT_HASH = 'nogit';
  process.stderr.write('WARN: git hash unavailable, using "nogit"\n');
}
const VERSION_STRING = `${VERSION} (${GIT_SHORT_HASH})`;

// --- Clean and (re)create the temporary output tree ---

rmSync(DIST_TMP, { recursive: true, force: true });
rmSync(DIST_BAK, { recursive: true, force: true });
// Codex: one nested skill dir with tools/ and (nested) agents/.
mkdirSync(join(CODEX_SKILL_DIR, 'tools'), { recursive: true });
mkdirSync(join(CODEX_SKILL_DIR, 'agents'), { recursive: true });
// Claude: skill dir with tools/ only; agents are emitted separately.
mkdirSync(join(CLAUDE_SKILL_DIR, 'tools'), { recursive: true });
mkdirSync(CLAUDE_AGENTS_DIR, { recursive: true });

// --- Include transforms (I/O; the pure transforms live in build-lib.mjs) ---

function resolveIncludes(body) {
  return body.replace(/```include\n([^\n]+)\n```/g, (match, name) => {
    const filePath = join(SHARED_DIR, `${name.trim()}.md`);
    if (!existsSync(filePath)) {
      process.stderr.write(`ERROR: Include file not found: ${filePath}\n`);
      process.exit(1);
    }
    return readFileSync(filePath, 'utf8').replace(/\n+$/, '');
  });
}

// --- Collect sources ---

const tools = []; // { name, description, body }
const agents = []; // { name, fm, body }

try {
  const toolFiles = readdirSync(TOOLS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();
  const agentFiles = readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();

  // Known-name sets for the dead-reference guard: every {{SKILL:X}} must be a
  // tool source and every {{AGENT:X}} an agent source.
  const knownTools = new Set(toolFiles.map((f) => basename(f, '.md')));
  const knownAgents = new Set(agentFiles.map((f) => basename(f, '.md')));
  const refConfig = {
    exposedTools: EXPOSED_TOOLS,
    agentPrefix: CLAUDE_AGENT_PREFIX,
    knownTools,
    knownAgents,
  };

  const readSource = (dir, file, context) => {
    const content = normalizeLineEndings(readFileSync(join(dir, file), 'utf8'));
    const fm = extractFrontmatter(content);
    const body = resolveIncludes(extractBody(content)).replace(/\{\{VERSION\}\}/g, VERSION_STRING);
    // Guard: description is strictly double-quoted, and every SKILL/AGENT
    // reference (in frontmatter and body) points at an existing source.
    assertQuotedDescription(fm, { context });
    validateRefs(`${fm}\n${body}`, { knownTools, knownAgents, context });
    return { fm, body };
  };

  for (const file of toolFiles) {
    const context = `tools/${file}`;
    const { fm, body } = readSource(TOOLS_DIR, file, context);
    tools.push({ name: basename(file, '.md'), description: getField(fm, 'description'), body });
  }

  for (const file of agentFiles) {
    const context = `agents/${file}`;
    const { fm, body } = readSource(AGENTS_DIR, file, context);
    agents.push({ name: basename(file, '.md'), fm, body });
  }

  if (tools.length === 0 || agents.length === 0) {
    throw new Error(`No tool or agent sources found under ${SOURCE_DIR}`);
  }

  // Sanity check: every exposed tool must exist.
  const builtToolNames = new Set(tools.map((t) => t.name));
  for (const name of EXPOSED_TOOLS) {
    if (!builtToolNames.has(name)) {
      throw new Error(`Exposed tool "${name}" has no matching skill source`);
    }
  }

  // --- Router template ---

  if (!existsSync(ROUTER_SRC)) {
    throw new Error(`Router template not found: ${ROUTER_SRC}`);
  }
  const routerRaw = normalizeLineEndings(readFileSync(ROUTER_SRC, 'utf8'));
  const routerFm = extractFrontmatter(routerRaw);
  const routerName = getField(routerFm, 'name') || FIRMO_SKILL_NAME;
  const routerDesc = getField(routerFm, 'description');
  const routerBodyRaw = resolveIncludes(extractBody(routerRaw)).replace(
    /\{\{VERSION\}\}/g,
    VERSION_STRING,
  );
  assertQuotedDescription(routerFm, { context: 'SKILL.md' });
  validateRefs(`${routerFm}\n${routerBodyRaw}`, {
    knownTools,
    knownAgents,
    context: 'SKILL.md',
  });

  const catalog = EXPOSED_TOOLS.map((name) => {
    const t = tools.find((x) => x.name === name);
    return `- \`/firmo ${name}\` — ${firstSentence(t.description)}`;
  }).join('\n');

  // Static autocomplete hint for the `<tool>` argument, kept in sync with EXPOSED_TOOLS.
  const argumentHint = `[${EXPOSED_TOOLS.join('|')}]`;

  // --- Per-harness output ---

  for (const harness of ['claude', 'codex']) {
    const skillDir = harness === 'claude' ? CLAUDE_SKILL_DIR : CODEX_SKILL_DIR;

    // Router SKILL.md
    const routerBody = renderBody(
      routerBodyRaw.replace(/\{\{TOOL_CATALOG\}\}/g, catalog),
      harness,
      {
        ...refConfig,
        context: 'SKILL.md',
      },
    );
    const routerContent = [
      '---',
      `name: ${routerName}`,
      `description: "${routerDesc}"`,
      `argument-hint: "${argumentHint}"`,
      '---',
      routerBody,
    ].join('\n');
    writeFileSync(join(skillDir, 'SKILL.md'), routerContent);

    // Tools (exposed + internal), no frontmatter — loaded on demand by the router.
    for (const t of tools) {
      writeFileSync(
        join(skillDir, 'tools', `${t.name}.md`),
        renderBody(t.body, harness, { ...refConfig, context: `tools/${t.name}.md` }),
      );
    }

    // Agents (nested subagents)
    for (const a of agents) {
      const context = `agents/${a.name}.md`;
      if (harness === 'claude') {
        const claudeModel = getNested(a.fm, 'claude', 'model', { context });
        const claudeColor = getNested(a.fm, 'claude', 'color', { context });
        const claudeTools = getNestedArray(a.fm, 'claude', 'tools', { context });
        const claudeSkills = getNestedList(a.fm, 'claude', 'skills', { context });
        const agentDesc = cleanDescription(getField(a.fm, 'description')).replace(/"/g, '\\"');

        const claudeAgentName = `${CLAUDE_AGENT_PREFIX}${a.name}`;
        let agentFm = '---\n';
        agentFm += `name: ${claudeAgentName}\n`;
        agentFm += `description: "${agentDesc}"\n`;
        if (claudeModel) agentFm += `model: ${claudeModel}\n`;
        if (claudeColor) agentFm += `color: ${claudeColor}\n`;
        if (claudeTools) {
          const toolList = claudeTools
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
            .join(', ');
          agentFm += `tools: ${toolList}\n`;
        }
        if (claudeSkills) agentFm += `skills:\n${claudeSkills}\n`;
        agentFm += '---\n';
        writeFileSync(
          join(CLAUDE_AGENTS_DIR, `${claudeAgentName}.md`),
          agentFm + renderBody(a.body, 'claude', { ...refConfig, context }),
        );
      } else {
        const codexModel = getNested(a.fm, 'codex', 'model', { context });
        const codexEffort = getNested(a.fm, 'codex', 'model_reasoning_effort', { context });
        const codexSandbox = normalizeCodexSandboxMode(
          getNested(a.fm, 'codex', 'sandbox_mode', { context }),
          a.name,
        );
        const tomlDesc = cleanDescription(getField(a.fm, 'description'));

        let toml = `name = ${tomlString(a.name)}\n`;
        toml += `description = ${tomlString(tomlDesc)}\n`;
        if (codexModel) toml += `model = ${tomlString(codexModel)}\n`;
        if (codexEffort) toml += `model_reasoning_effort = ${tomlString(codexEffort)}\n`;
        if (codexSandbox) toml += `sandbox_mode = ${tomlString(codexSandbox)}\n`;
        toml += `developer_instructions = '''\n${renderBody(a.body, 'codex', { ...refConfig, context }).replace(/\n+$/, '')}\n'''\n`;
        writeFileSync(join(skillDir, 'agents', `${a.name}.toml`), toml);
      }
    }
  }

  // --- Version-drift guard: Claude and Codex router carry the same version ---

  const claudeRouter = readFileSync(join(CLAUDE_SKILL_DIR, 'SKILL.md'), 'utf8');
  const codexRouter = readFileSync(join(CODEX_SKILL_DIR, 'SKILL.md'), 'utf8');
  if (!claudeRouter.includes(VERSION_STRING) || !codexRouter.includes(VERSION_STRING)) {
    throw new Error(`version drift — expected "${VERSION_STRING}" in both router outputs`);
  }

  // --- Atomic swap: only now, after a fully successful build, replace dist/ ---

  if (existsSync(DIST_ROOT)) renameSync(DIST_ROOT, DIST_BAK);
  try {
    renameSync(DIST_TMP, DIST_ROOT);
  } catch (swapErr) {
    // Restore the previous dist/ so a failed swap never leaves it missing.
    if (!existsSync(DIST_ROOT) && existsSync(DIST_BAK)) renameSync(DIST_BAK, DIST_ROOT);
    throw swapErr;
  }
  rmSync(DIST_BAK, { recursive: true, force: true });
} catch (err) {
  // Leave the previous dist/ untouched; drop only the temporary tree.
  rmSync(DIST_TMP, { recursive: true, force: true });
  process.stderr.write(`ERROR: Build failed: ${err.message}\n`);
  process.exit(1);
}

// --- Summary ---

const exposedCount = tools.filter((t) => EXPOSED_TOOLS.includes(t.name)).length;
const internalCount = tools.length - exposedCount;

process.stdout.write('Built firmo skill:\n');
process.stdout.write(
  `  Claude Code: ${exposedCount} tools (+${internalCount} internal) -> dist/claude/${FIRMO_SKILL_NAME}/, ${agents.length} agents -> dist/claude/agents/${CLAUDE_AGENT_PREFIX}*.md\n`,
);
process.stdout.write(
  `  Codex:       ${exposedCount} tools (+${internalCount} internal), ${agents.length} agents -> dist/codex/${FIRMO_SKILL_NAME}/\n`,
);
