#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = join(ROOT_DIR, 'skills');
const SHARED_DIR = join(SOURCE_DIR, '_shared');
const DIST_CODEX = join(ROOT_DIR, 'dist', 'codex');
const DIST_CLAUDE = join(ROOT_DIR, 'dist', 'claude');

const CLAUDE_PLUGIN_NAME = 'sf-frontend-workflows';
const CLAUDE_MARKETPLACE_NAME = 'sf-claude-plugin';
const CLAUDE_MARKETPLACE_DIR = join(DIST_CLAUDE, CLAUDE_MARKETPLACE_NAME);
const CLAUDE_PLUGIN_DIR = join(CLAUDE_MARKETPLACE_DIR, 'plugins', CLAUDE_PLUGIN_NAME);

const versionPath = join(ROOT_DIR, 'version.txt');
if (!existsSync(versionPath)) {
  process.stderr.write('ERROR: version.txt not found in project root\n');
  process.exit(1);
}
const VERSION = readFileSync(versionPath, 'utf8').trim();
const GIT_SHORT_HASH = execSync('git rev-parse --short HEAD', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();
const VERSION_STRING = `${VERSION} (${GIT_SHORT_HASH})`;

// --- Clean and create output directories ---

rmSync(DIST_CODEX, { recursive: true, force: true });
rmSync(DIST_CLAUDE, { recursive: true, force: true });
mkdirSync(join(DIST_CODEX, 'skills'), { recursive: true });
mkdirSync(join(DIST_CODEX, 'agents'), { recursive: true });
mkdirSync(join(CLAUDE_MARKETPLACE_DIR, '.claude-plugin'), { recursive: true });
mkdirSync(join(CLAUDE_PLUGIN_DIR, 'commands'), { recursive: true });
mkdirSync(join(CLAUDE_PLUGIN_DIR, 'agents'), { recursive: true });

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
    const items = rest.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
    return items.map(item => `  - ${item}`).join('\n');
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

function stripPrefix(name) {
  return name.replace(/^sf-/, '');
}

function cleanDescription(desc) {
  return desc
    .replace(/\{\{SKILL:([^}]+)\}\}/g, '$1')
    .replace(/\{\{AGENT:([^}]+)\}\}/g, '$1');
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
  return body.replace(/\{\{INCLUDE:([^}]+)\}\}/g, (match, name) => {
    const filePath = join(SHARED_DIR, `${name}.md`);
    if (!existsSync(filePath)) {
      process.stderr.write(`ERROR: Include file not found: ${filePath}\n`);
      process.exit(1);
    }
    return readFileSync(filePath, 'utf8').replace(/\n+$/, '');
  });
}

// --- Placeholder transforms ---

function transformClaude(body) {
  return body
    .replace(/\{\{SKILL:sf-([^}]+)\}\}/g, '/$1')
    .replace(/\{\{AGENT:sf-([^}]+)\}\}/g, '/$1');
}

function transformCodexSkill(body) {
  return body
    .replace(/\{\{SKILL:([^}]+)\}\}/g, '$$$1')
    .replace(/\{\{AGENT:([^}]+)\}\}/g, '$1');
}

function transformCodexAgent(body) {
  return body
    .replace(/\{\{SKILL:([^}]+)\}\}/g, '$1')
    .replace(/\{\{AGENT:([^}]+)\}\}/g, '$1');
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
  return body.replace(/\{\{ASK\}\}\s*\n([\s\S]*?)\{\{\/ASK\}\}/g, (_, block) => {
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
      out += options.map(o => `  - label: "${o.label}", description: "${o.description}"`).join('\n');
    }
    return when ? `Wenn ${when}:\n\n${out}` : out;
  });
}

function transformAskCodex(body) {
  return body.replace(/\{\{ASK\}\}\s*\n([\s\S]*?)\{\{\/ASK\}\}/g, (_, block) => {
    const { question, type, when, options } = parseAskBlock(block);
    const prefix = when ? `Wenn ${when}: ` : '';
    if (type === 'approval') {
      return `${prefix}Frage den User: **${question}** Antworte mit "Ja" oder gib Feedback als Freitext.`;
    }
    let out = `Frage den User: **${question}**\n`;
    out += options.map(o => `- ${o.label} -- ${o.description}`).join('\n');
    return prefix ? `${prefix}${out}` : out;
  });
}

// --- Build loop ---

const skillDirs = readdirSync(SOURCE_DIR)
  .filter(name => name.startsWith('sf-'))
  .map(name => join(SOURCE_DIR, name))
  .filter(path => statSync(path).isDirectory());

if (skillDirs.length === 0) {
  process.stderr.write(`ERROR: No sf-* skill directories found in ${SOURCE_DIR}\n`);
  process.exit(1);
}

try {
  for (const skillDir of skillDirs) {
    const skillName = basename(skillDir);
    const shortName = stripPrefix(skillName);
    const src = join(skillDir, 'SKILL.md');

    if (!existsSync(src)) {
      throw new Error(`${src} not found for ${skillName}`);
    }

    const content = normalizeLineEndings(readFileSync(src, 'utf8'));
    const fm = extractFrontmatter(content);
    const body = resolveIncludes(extractBody(content)).replace(/\{\{VERSION\}\}/g, VERSION_STRING);

    const skillType = getField(fm, 'type');
    const description = getField(fm, 'description');

    if (skillType === 'orchestrator' || skillType === 'utility') {
      // --- Codex: Skill (SKILL.md) ---
      const codexDir = join(DIST_CODEX, 'skills', skillName);
      mkdirSync(codexDir, { recursive: true });
      const codexBody = transformCodexSkill(transformAskCodex(body));
      const codexContent = [
        '---',
        `name: ${skillName}`,
        `description: "${cleanDescription(description)}"`,
        '---',
        codexBody,
      ].join('\n');
      writeFileSync(join(codexDir, 'SKILL.md'), codexContent);

      // --- Claude Code: Command ---
      const claudeDesc = cleanDescription(description).replace(/"/g, '\\"');
      const claudeBody = transformClaude(transformAskClaude(body));
      const claudeContent = [
        '---',
        `description: "${claudeDesc}"`,
        '---',
        claudeBody,
      ].join('\n');
      writeFileSync(join(CLAUDE_PLUGIN_DIR, 'commands', `${shortName}.md`), claudeContent);

    } else if (skillType === 'agent') {
      // --- Codex: Custom Agent (TOML) ---
      const codexModel = getNested(fm, 'codex', 'model');
      const codexEffort = getNested(fm, 'codex', 'model_reasoning_effort');
      const codexSandbox = normalizeCodexSandboxMode(getNested(fm, 'codex', 'sandbox_mode'), skillName);
      const tomlDesc = cleanDescription(description);
      const tomlBody = transformCodexAgent(transformAskCodex(body));

      let toml = `name = "${skillName}"\n`;
      toml += `description = "${tomlDesc}"\n`;
      if (codexModel) toml += `model = "${codexModel}"\n`;
      if (codexEffort) toml += `model_reasoning_effort = "${codexEffort}"\n`;
      if (codexSandbox) toml += `sandbox_mode = "${codexSandbox}"\n`;
      toml += `developer_instructions = '''\n${tomlBody.replace(/\n+$/, '')}\n'''\n`;
      writeFileSync(join(DIST_CODEX, 'agents', `${skillName}.toml`), toml);

      // --- Claude Code: Agent ---
      const claudeModel = getNested(fm, 'claude', 'model');
      const claudeColor = getNested(fm, 'claude', 'color');
      const claudeTools = getNestedArray(fm, 'claude', 'tools');
      const claudeSkills = getNestedList(fm, 'claude', 'skills');

      const agentDesc = cleanDescription(description).replace(/"/g, '\\"');
      let agentFm = '---\n';
      agentFm += `name: ${shortName}\n`;
      agentFm += `description: "${agentDesc}"\n`;
      if (claudeModel) agentFm += `model: ${claudeModel}\n`;
      if (claudeColor) agentFm += `color: ${claudeColor}\n`;
      if (claudeTools) {
        const toolList = claudeTools.split(',').map(t => t.trim()).filter(Boolean).join(', ');
        agentFm += `tools: ${toolList}\n`;
      }
      if (claudeSkills) agentFm += `skills:\n${claudeSkills}\n`;
      agentFm += '---\n';

      const agentBody = transformClaude(transformAskClaude(body));
      writeFileSync(join(CLAUDE_PLUGIN_DIR, 'agents', `${shortName}.md`), agentFm + agentBody);

    } else {
      throw new Error(`Unknown type "${skillType}" for ${skillName}`);
    }
  }
} catch (err) {
  process.stderr.write(`ERROR: Build failed: ${err.message}\n`);
  process.exit(1);
}

// --- marketplace.json for Claude Code ---

const marketplace = {
  $schema: 'https://anthropic.com/claude-code/marketplace.schema.json',
  name: CLAUDE_MARKETPLACE_NAME,
  description: 'Orchestrierte Frontend- und Backend-Workflows für Claude Code',
  owner: { name: 'Sebastian Fastner' },
  plugins: [
    {
      name: CLAUDE_PLUGIN_NAME,
      version: VERSION,
      source: `./plugins/${CLAUDE_PLUGIN_NAME}`,
      description: 'Orchestrierte Workflows (build, plan, fix, refactor, review) mit spezialisierten Agents für Frontend, Backend, CLI und Node.js',
      category: 'development',
      tags: ['frontend', 'backend', 'nodejs', 'cli', 'workflow', 'orchestration', 'review', 'testing'],
      author: { name: 'Sebastian Fastner' },
    },
  ],
};
// Format with compact arrays to match original output
let marketplaceJson = JSON.stringify(marketplace, null, 2);
marketplaceJson = marketplaceJson.replace(
  /\[\n\s+("(?:[^"]*)",?\n\s*)+\]/g,
  (match) => {
    const items = [...match.matchAll(/"([^"]*)"/g)].map(m => `"${m[1]}"`);
    return `[${items.join(', ')}]`;
  },
);
writeFileSync(
  join(CLAUDE_MARKETPLACE_DIR, '.claude-plugin', 'marketplace.json'),
  marketplaceJson + '\n',
);

// --- Summary ---

const codexSkills = readdirSync(join(DIST_CODEX, 'skills')).length;
const codexAgents = readdirSync(join(DIST_CODEX, 'agents')).filter(f => f.endsWith('.toml')).length;
const claudeCommands = readdirSync(join(CLAUDE_PLUGIN_DIR, 'commands')).filter(f => f.endsWith('.md')).length;
const claudeAgents = readdirSync(join(CLAUDE_PLUGIN_DIR, 'agents')).filter(f => f.endsWith('.md')).length;

process.stdout.write('Built:\n');
process.stdout.write(`  Codex:      ${codexSkills} skills, ${codexAgents} agents  -> dist/codex/\n`);
process.stdout.write(`  Claude Code: ${claudeCommands} commands, ${claudeAgents} agents -> dist/claude/${CLAUDE_MARKETPLACE_NAME}/\n`);
