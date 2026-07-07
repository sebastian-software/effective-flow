#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = join(ROOT_DIR, 'src');
const SHARED_DIR = join(SOURCE_DIR, 'shared');
const TOOLS_DIR = join(SOURCE_DIR, 'tools');
const AGENTS_DIR = join(SOURCE_DIR, 'agents');
const ROUTER_SRC = join(SOURCE_DIR, 'SKILL.md');
const DIST_CODEX = join(ROOT_DIR, 'dist', 'codex');
const DIST_CLAUDE = join(ROOT_DIR, 'dist', 'claude');

const FIRMO_SKILL_NAME = 'firmo';
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
const GIT_SHORT_HASH = execSync('git rev-parse --short HEAD', {
  cwd: ROOT_DIR,
  encoding: 'utf8',
}).trim();
const VERSION_STRING = `${VERSION} (${GIT_SHORT_HASH})`;

// --- Clean and create output directories ---

rmSync(DIST_CODEX, { recursive: true, force: true });
rmSync(DIST_CLAUDE, { recursive: true, force: true });
// Codex: one nested skill dir with tools/ and (nested) agents/.
mkdirSync(join(CODEX_SKILL_DIR, 'tools'), { recursive: true });
mkdirSync(join(CODEX_SKILL_DIR, 'agents'), { recursive: true });
// Claude: skill dir with tools/ only; agents are emitted separately.
mkdirSync(join(CLAUDE_SKILL_DIR, 'tools'), { recursive: true });
mkdirSync(CLAUDE_AGENTS_DIR, { recursive: true });

// --- Helper functions ---

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLineEndings(content) {
  return content.replace(/\r\n/g, '\n');
}

function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  return match ? match[1] : '';
}

function extractBody(content) {
  const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return match ? match[1].replace(/\n+$/, '\n') : '';
}

function getField(frontmatter, key) {
  const re = new RegExp(`^${escapeRegex(key)}:\\s*"?(.+?)"?$`, 'm');
  const match = frontmatter.match(re);
  return match ? match[1] : '';
}

function getNested(frontmatter, section, key) {
  const sectionRe = new RegExp(`^${escapeRegex(section)}:\\s*$`, 'm');
  const sectionMatch = sectionRe.exec(frontmatter);
  if (!sectionMatch) return '';

  const afterSection = frontmatter.slice(sectionMatch.index + sectionMatch[0].length);
  const sectionEnd = afterSection.search(/^\S/m);
  const sectionBlock = sectionEnd === -1 ? afterSection : afterSection.slice(0, sectionEnd);

  const keyRe = new RegExp(`^\\s+${escapeRegex(key)}:\\s*"?(.+?)"?$`, 'm');
  const keyMatch = sectionBlock.match(keyRe);
  return keyMatch ? keyMatch[1] : '';
}

function getNestedArray(frontmatter, section, key) {
  const sectionRe = new RegExp(`^${escapeRegex(section)}:\\s*$`, 'm');
  const sectionMatch = sectionRe.exec(frontmatter);
  if (!sectionMatch) return '';

  const afterSection = frontmatter.slice(sectionMatch.index + sectionMatch[0].length);
  const sectionEnd = afterSection.search(/^\S/m);
  const sectionBlock = sectionEnd === -1 ? afterSection : afterSection.slice(0, sectionEnd);

  const keyRe = new RegExp(`^\\s+${escapeRegex(key)}:\\s*\\[(.+?)\\]`, 'm');
  const keyMatch = sectionBlock.match(keyRe);
  if (!keyMatch) return '';

  return keyMatch[1].replace(/\s/g, '');
}

function getNestedList(frontmatter, section, key) {
  const sectionRe = new RegExp(`^${escapeRegex(section)}:\\s*$`, 'm');
  const sectionMatch = sectionRe.exec(frontmatter);
  if (!sectionMatch) return '';

  const afterSection = frontmatter.slice(sectionMatch.index + sectionMatch[0].length);
  const sectionEnd = afterSection.search(/^\S/m);
  const sectionBlock = sectionEnd === -1 ? afterSection : afterSection.slice(0, sectionEnd);

  const keyRe = new RegExp(`^\\s+${escapeRegex(key)}:\\s*(.*)$`, 'm');
  const keyMatch = sectionBlock.match(keyRe);
  if (!keyMatch) return '';

  const rest = keyMatch[1].trim();

  // Inline array [a, b, c]
  if (rest.startsWith('[')) {
    const items = rest
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return items.map((item) => `  - ${item}`).join('\n');
  }

  // Multi-line list (- items after key line)
  const afterKey = sectionBlock.slice(keyMatch.index + keyMatch[0].length);
  const lines = afterKey.split('\n');
  const items = [];
  for (const line of lines) {
    const itemMatch = line.match(/^\s+-\s+(.+)/);
    if (itemMatch) {
      items.push(`  - ${itemMatch[1]}`);
    } else if (line.trim() && !line.match(/^\s+-/)) {
      break;
    }
  }
  return items.join('\n');
}

function cleanDescription(desc) {
  return desc
    .replace(/\{\{SKILL:sf-([^}]+)\}\}/g, '$1')
    .replace(/\{\{SKILL:([^}]+)\}\}/g, '$1')
    .replace(/\{\{AGENT:sf-([^}]+)\}\}/g, '$1')
    .replace(/\{\{AGENT:([^}]+)\}\}/g, '$1');
}

function firstSentence(text) {
  const cleaned = cleanDescription(text).trim();
  const match = cleaned.match(/^(.*?[.!?])(\s|$)/s);
  return (match ? match[1] : cleaned).trim();
}

function tomlString(value) {
  return JSON.stringify(value);
}

function normalizeCodexSandboxMode(mode, skillName) {
  const normalized = {
    full: 'danger-full-access',
    read_only: 'read-only',
    'read-only': 'read-only',
    'workspace-write': 'workspace-write',
    'danger-full-access': 'danger-full-access',
  }[mode];

  if (!mode) return '';

  if (!normalized) {
    throw new Error(`Unsupported codex sandbox_mode "${mode}" for ${skillName}`);
  }

  return normalized;
}

// --- Include transforms ---

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

// --- Reference transforms ---
//
// {{SKILL:sf-X}} -> `/firmo <name>` for exposed tools, or `` `tools/<name>.md` ``
//                  for internal tools (loaded on demand by `apply`).
// {{AGENT:sf-X}} -> the subagent reference. Codex auto-discovers nested skill
// agents by their bare name; Claude Code only sees agents registered under
// ~/.claude/agents, so they are referenced namespaced as `firmo-X`.
function transformRefs(body, harness) {
  const agentName = (raw) => (harness === 'claude' ? `${CLAUDE_AGENT_PREFIX}${raw}` : raw);
  return body
    .replace(/\{\{SKILL:([^}]+)\}\}/g, (_, raw) =>
      EXPOSED_TOOLS.includes(raw) ? `/firmo ${raw}` : `\`tools/${raw}.md\``,
    )
    .replace(/\{\{AGENT:([^}]+)\}\}/g, (_, raw) => `\`${agentName(raw)}\``);
}

// --- ASK block transforms ---

function parseAskBlock(block) {
  block = block.replace(/\r/g, '');
  const headerMatch = block.match(/header:\s*(.+)/);
  const questionMatch = block.match(/question:\s*(.+)/);
  const typeMatch = block.match(/type:\s*(\S+)/);
  const whenMatch = block.match(/when:\s*(.+)/);

  const header = headerMatch ? headerMatch[1].trim() : null;
  const question = questionMatch ? questionMatch[1].trim() : null;
  const type = typeMatch ? typeMatch[1].trim() : null;
  const when = whenMatch ? whenMatch[1].trim() : null;

  if (!header) throw new Error('ASK block missing header field');
  if (!question) throw new Error('ASK block missing question field');

  let options = [];
  if (type !== 'approval') {
    const optsMatch = block.match(/options:\s*\n((?:\s+-\s+label:.*\n\s+description:.*\n?)*)/);
    if (!optsMatch) throw new Error('ASK block missing options');
    const optsBlock = optsMatch[1];
    const optRe = /-\s+label:\s*(.+?)\n\s*description:\s*(.+)/g;
    let m;
    while ((m = optRe.exec(optsBlock)) !== null) {
      options.push({ label: m[1].trim(), description: m[2].trim() });
    }
  }

  return { header, question, type, when, options };
}

function transformAskClaude(body) {
  return body.replace(/```ask\n([\s\S]*?)```/g, (_, block) => {
    const { header, question, type, when, options } = parseAskBlock(block);
    let out = 'Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:\n';
    out += `- header: "${header}"\n`;
    out += `- question: "${question}"\n`;
    out += '- multiSelect: false\n';
    out += '- options:\n';
    if (type === 'approval') {
      out += '  - label: "Ja", description: "Freigabe erteilt"\n';
      out += '  - label: "Anpassen", description: "Feedback als Freitext eingeben"';
    } else {
      out += options
        .map((o) => `  - label: "${o.label}", description: "${o.description}"`)
        .join('\n');
    }
    return when ? `Wenn ${when}:\n\n${out}` : out;
  });
}

function transformAskCodex(body) {
  return body.replace(/```ask\n([\s\S]*?)```/g, (_, block) => {
    const { question, type, when, options } = parseAskBlock(block);
    const prefix = when ? `Wenn ${when}: ` : '';
    if (type === 'approval') {
      return `${prefix}Frage den User: **${question}** Antworte mit "Ja" oder gib Feedback als Freitext.`;
    }
    let out = `Frage den User: **${question}**\n`;
    out += options.map((o) => `- ${o.label} -- ${o.description}`).join('\n');
    return prefix ? `${prefix}${out}` : out;
  });
}

// Full body pipeline per harness: resolve version, ask blocks, then references.
function renderBody(resolvedBody, harness) {
  const withAsk =
    harness === 'codex' ? transformAskCodex(resolvedBody) : transformAskClaude(resolvedBody);
  return transformRefs(withAsk, harness);
}

// --- Collect sources ---

const tools = []; // { name, description, body }
const agents = []; // { name, fm, body }

try {
  const readSource = (dir, file) => {
    const content = normalizeLineEndings(readFileSync(join(dir, file), 'utf8'));
    const fm = extractFrontmatter(content);
    const body = resolveIncludes(extractBody(content)).replace(/\{\{VERSION\}\}/g, VERSION_STRING);
    return { fm, body };
  };

  for (const file of readdirSync(TOOLS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()) {
    const { fm, body } = readSource(TOOLS_DIR, file);
    tools.push({ name: basename(file, '.md'), description: getField(fm, 'description'), body });
  }

  for (const file of readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()) {
    const { fm, body } = readSource(AGENTS_DIR, file);
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
    const routerBody = renderBody(routerBodyRaw.replace(/\{\{TOOL_CATALOG\}\}/g, catalog), harness);
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
      writeFileSync(join(skillDir, 'tools', `${t.name}.md`), renderBody(t.body, harness));
    }

    // Agents (nested subagents)
    for (const a of agents) {
      if (harness === 'claude') {
        const claudeModel = getNested(a.fm, 'claude', 'model');
        const claudeColor = getNested(a.fm, 'claude', 'color');
        const claudeTools = getNestedArray(a.fm, 'claude', 'tools');
        const claudeSkills = getNestedList(a.fm, 'claude', 'skills');
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
          agentFm + renderBody(a.body, 'claude'),
        );
      } else {
        const codexModel = getNested(a.fm, 'codex', 'model');
        const codexEffort = getNested(a.fm, 'codex', 'model_reasoning_effort');
        const codexSandbox = normalizeCodexSandboxMode(
          getNested(a.fm, 'codex', 'sandbox_mode'),
          a.name,
        );
        const tomlDesc = cleanDescription(getField(a.fm, 'description'));

        let toml = `name = ${tomlString(a.name)}\n`;
        toml += `description = ${tomlString(tomlDesc)}\n`;
        if (codexModel) toml += `model = ${tomlString(codexModel)}\n`;
        if (codexEffort) toml += `model_reasoning_effort = ${tomlString(codexEffort)}\n`;
        if (codexSandbox) toml += `sandbox_mode = ${tomlString(codexSandbox)}\n`;
        toml += `developer_instructions = '''\n${renderBody(a.body, 'codex').replace(/\n+$/, '')}\n'''\n`;
        writeFileSync(join(skillDir, 'agents', `${a.name}.toml`), toml);
      }
    }
  }
} catch (err) {
  process.stderr.write(`ERROR: Build failed: ${err.message}\n`);
  process.exit(1);
}

// --- Version-drift guard: Claude and Codex router carry the same version ---

const claudeRouter = readFileSync(join(CLAUDE_SKILL_DIR, 'SKILL.md'), 'utf8');
const codexRouter = readFileSync(join(CODEX_SKILL_DIR, 'SKILL.md'), 'utf8');
if (!claudeRouter.includes(VERSION_STRING) || !codexRouter.includes(VERSION_STRING)) {
  process.stderr.write(
    `ERROR: version drift — expected "${VERSION_STRING}" in both router outputs\n`,
  );
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
