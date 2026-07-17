// Pure, importable transformation helpers for build.mjs.
//
// These functions are extracted from build.mjs so the Markdown -> skill
// transforms can be unit-tested (node:test) without running the full I/O
// build. Nothing here touches the filesystem; all inputs and outputs are
// strings or plain data. build.mjs owns the I/O, the source config
// (EXPOSED_TOOLS, agent prefix) and the known-name sets, and passes them in.

// Allowed `type` values for an ```ask``` block. `approval` renders a yes/no
// gate; the default (no `type`) renders an options question. Any other value
// is a typo and must fail the build.
export const ASK_ALLOWED_TYPES = ['approval', 'options'];
// AskUserQuestion header chips are capped at 12 characters (see R-0000001).
export const ASK_MAX_HEADER_LENGTH = 12;

function contextSuffix(context) {
  return context ? ` (in ${context})` : '';
}

// Placeholder names carried over from the pre-rename era (`{{SKILL:sf-fix}}`,
// `{{AGENT:sf-test-writer}}`). Effective Flow does not alias these to their new
// names — they are rejected at validation time so the rendering step can never
// turn an accepted placeholder into a dead `tools/sf-*.md` / `sf-*` reference.
// See docs/developer-guide/build-system.md ("Legacy-Aliase").
const LEGACY_REF_PREFIX = 'sf-';

function assertNotLegacyRef(marker, name, context) {
  if (name.startsWith(LEGACY_REF_PREFIX)) {
    throw new Error(
      `Legacy placeholder {{${marker}:${name}}} is no longer supported; drop the "${LEGACY_REF_PREFIX}" prefix and use the current name${contextSuffix(context)}`,
    );
  }
}

export function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeLineEndings(content) {
  return content.replace(/\r\n/g, '\n');
}

export function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  return match ? match[1] : '';
}

export function extractBody(content) {
  const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return match ? match[1].replace(/\n+$/, '\n') : '';
}

// Parse a single scalar value from the text following `key:`. Handles bare and
// double-quoted values and rejects the frontmatter shapes this simple parser
// does not support (block/multi-line scalars, unterminated quotes) instead of
// silently returning a truncated string.
function parseScalar(rawValue, key, context) {
  const value = rawValue.trim();
  if (value === '') return '';
  if (value.startsWith('|') || value.startsWith('>')) {
    throw new Error(`Multi-line scalar for "${key}" is not supported${contextSuffix(context)}`);
  }
  if (value.startsWith('"')) {
    if (value.length < 2 || !value.endsWith('"')) {
      throw new Error(`Unterminated quoted value for "${key}"${contextSuffix(context)}`);
    }
    return value.slice(1, -1);
  }
  return value;
}

// Extract the indented block of a nested `section:` header, or null if absent.
function sectionBlock(frontmatter, section) {
  const sectionRe = new RegExp(`^${escapeRegex(section)}:\\s*$`, 'm');
  const sectionMatch = sectionRe.exec(frontmatter);
  if (!sectionMatch) return null;
  const afterSection = frontmatter.slice(sectionMatch.index + sectionMatch[0].length);
  const sectionEnd = afterSection.search(/^\S/m);
  return sectionEnd === -1 ? afterSection : afterSection.slice(0, sectionEnd);
}

export function getField(frontmatter, key, { required = false, context } = {}) {
  const re = new RegExp(`^${escapeRegex(key)}:(.*)$`, 'm');
  const match = frontmatter.match(re);
  if (!match) {
    if (required) throw new Error(`Missing required field "${key}"${contextSuffix(context)}`);
    return '';
  }
  const value = parseScalar(match[1], key, context);
  if (required && value === '') {
    throw new Error(`Empty required field "${key}"${contextSuffix(context)}`);
  }
  return value;
}

export function getNested(frontmatter, section, key, { context } = {}) {
  const block = sectionBlock(frontmatter, section);
  if (block === null) return '';
  const keyRe = new RegExp(`^\\s+${escapeRegex(key)}:(.*)$`, 'm');
  const match = block.match(keyRe);
  if (!match) return '';
  return parseScalar(match[1], `${section}.${key}`, context);
}

export function getNestedArray(frontmatter, section, key, { context } = {}) {
  const block = sectionBlock(frontmatter, section);
  if (block === null) return '';
  const keyRe = new RegExp(`^\\s+${escapeRegex(key)}:(.*)$`, 'm');
  const keyMatch = block.match(keyRe);
  if (!keyMatch) return '';
  const rest = keyMatch[1].trim();
  if (!rest.startsWith('[')) {
    throw new Error(`Expected inline array for "${section}.${key}"${contextSuffix(context)}`);
  }
  if (!rest.endsWith(']')) {
    throw new Error(`Unterminated inline array for "${section}.${key}"${contextSuffix(context)}`);
  }
  return rest.slice(1, -1).replace(/\s/g, '');
}

export function getNestedList(frontmatter, section, key, { context } = {}) {
  const block = sectionBlock(frontmatter, section);
  if (block === null) return '';
  // `[ \t]*` (not `\s*`) so the same-line-value match cannot cross the newline
  // and swallow the first item of a multi-line list.
  const keyRe = new RegExp(`^(\\s+)${escapeRegex(key)}:[ \\t]*(.*)$`, 'm');
  const keyMatch = block.match(keyRe);
  if (!keyMatch) return '';
  const keyIndent = keyMatch[1].length;
  const rest = keyMatch[2].trim();

  // Inline array [a, b, c]
  if (rest.startsWith('[')) {
    if (!rest.endsWith(']')) {
      throw new Error(`Unterminated inline list for "${section}.${key}"${contextSuffix(context)}`);
    }
    const items = rest
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return items.map((item) => `  - ${item}`).join('\n');
  }

  // Multi-line list: contiguous `- item` lines indented deeper than the key.
  // Stops at the first blank line or dedent so it cannot absorb items from a
  // following key or block.
  const afterKey = block.slice(keyMatch.index + keyMatch[0].length);
  const items = [];
  let started = false;
  for (const line of afterKey.split('\n')) {
    const itemMatch = line.match(/^(\s+)-\s+(.+)/);
    if (itemMatch && itemMatch[1].length > keyIndent) {
      items.push(`  - ${itemMatch[2].trim()}`);
      started = true;
    } else if (line.trim() === '') {
      // The newline right after the key line is not a separator; only a blank
      // line *after* the first item ends the list.
      if (started) break;
    } else {
      break; // dedent or a different key ends the list
    }
  }
  return items.join('\n');
}

export function cleanDescription(desc) {
  return desc.replace(/\{\{SKILL:([^}]+)\}\}/g, '$1').replace(/\{\{AGENT:([^}]+)\}\}/g, '$1');
}

export function firstSentence(text) {
  const cleaned = cleanDescription(text).trim();
  const match = cleaned.match(/^(.*?[.!?])(\s|$)/s);
  return (match ? match[1] : cleaned).trim();
}

export function tomlString(value) {
  return JSON.stringify(value);
}

export function normalizeCodexSandboxMode(mode, skillName) {
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

// Fail the build if any {{SKILL:X}} / {{AGENT:X}} reference points at a name
// that has no matching tool/agent source.
export function validateRefs(text, { knownTools, knownAgents, context } = {}) {
  for (const m of text.matchAll(/\{\{SKILL:([^}]+)\}\}/g)) {
    assertNotLegacyRef('SKILL', m[1], context);
    if (!knownTools.has(m[1])) {
      throw new Error(`Unknown tool reference {{SKILL:${m[1]}}}${contextSuffix(context)}`);
    }
  }
  for (const m of text.matchAll(/\{\{AGENT:([^}]+)\}\}/g)) {
    assertNotLegacyRef('AGENT', m[1], context);
    if (!knownAgents.has(m[1])) {
      throw new Error(`Unknown agent reference {{AGENT:${m[1]}}}${contextSuffix(context)}`);
    }
  }
}

// Enforce the invariant AGENTS.md documents: every source description is a
// single strictly double-quoted line.
export function assertQuotedDescription(frontmatter, { context } = {}) {
  const line = frontmatter.split('\n').find((l) => /^description:/.test(l));
  if (line === undefined) {
    throw new Error(`Missing description field${contextSuffix(context)}`);
  }
  if (!/^description:\s*".*"\s*$/.test(line)) {
    throw new Error(`Description must be strictly double-quoted${contextSuffix(context)}`);
  }
}

// --- Reference transforms ---
//
// {{SKILL:X}} -> harness-specific exposed tool invocation, or
//                `` `tools/<name>.md` `` for internal tools (loaded on demand
//                by `apply`).
// {{AGENT:X}} -> the subagent reference. Codex auto-discovers nested skill
// agents by their bare name; Claude Code only sees agents registered under
// ~/.claude/agents, so they are referenced namespaced as `<agentPrefix>X`.
//
// The command name (`/<skillName>` on Claude, `$<skillName>` on Codex) and the
// agent prefix are passed in from the single source of truth in build.mjs, so a
// rebrand only touches those constants.
export function transformRefs(
  body,
  harness,
  {
    exposedTools,
    agentPrefix,
    skillName = 'effective-flow',
    knownTools,
    knownAgents,
    context,
  } = {},
) {
  // Rendering always runs the same guard as validation: a placeholder that
  // validateRefs would reject (legacy `sf-` name or a dead reference) must never
  // be rendered into the output. The known-name sets are therefore required.
  if (!knownTools || !knownAgents) {
    throw new Error(
      `transformRefs requires knownTools and knownAgents to guard references${contextSuffix(context)}`,
    );
  }
  validateRefs(body, { knownTools, knownAgents, context });
  const agentName = (raw) => (harness === 'claude' ? `${agentPrefix}${raw}` : raw);
  const command = harness === 'codex' ? `$${skillName}` : `/${skillName}`;
  const skillInvocation = (raw) => `${command} ${raw}`;
  return body
    .replace(/\{\{FIRMO\}\}/g, command)
    .replace(/\{\{SKILL:([^}]+)\}\}/g, (_, raw) =>
      exposedTools.includes(raw) ? skillInvocation(raw) : `\`tools/${raw}.md\``,
    )
    .replace(/\{\{AGENT:([^}]+)\}\}/g, (_, raw) => `\`${agentName(raw)}\``);
}

// --- ASK block transforms ---

export function parseAskBlock(block, { context } = {}) {
  block = block.replace(/\r/g, '');
  const headerMatch = block.match(/header:\s*(.+)/);
  const questionMatch = block.match(/question:\s*(.+)/);
  const typeMatch = block.match(/type:\s*(\S+)/);
  const whenMatch = block.match(/when:\s*(.+)/);

  const header = headerMatch ? headerMatch[1].trim() : null;
  const question = questionMatch ? questionMatch[1].trim() : null;
  const type = typeMatch ? typeMatch[1].trim() : null;
  const when = whenMatch ? whenMatch[1].trim() : null;

  if (!header) throw new Error(`ASK block missing header field${contextSuffix(context)}`);
  if (!question) throw new Error(`ASK block missing question field${contextSuffix(context)}`);
  if (header.length > ASK_MAX_HEADER_LENGTH) {
    throw new Error(
      `ASK block header "${header}" exceeds ${ASK_MAX_HEADER_LENGTH} characters${contextSuffix(context)}`,
    );
  }
  if (type !== null && !ASK_ALLOWED_TYPES.includes(type)) {
    throw new Error(
      `ASK block has unknown type "${type}" (allowed: ${ASK_ALLOWED_TYPES.join(', ')})${contextSuffix(context)}`,
    );
  }

  let options = [];
  if (type !== 'approval') {
    const optsMatch = block.match(/options:\s*\n((?:\s+-\s+label:.*\n\s+description:.*\n?)*)/);
    if (!optsMatch) throw new Error(`ASK block missing options${contextSuffix(context)}`);
    const optsBlock = optsMatch[1];
    const optRe = /-\s+label:\s*(.+?)\n\s*description:\s*(.+)/g;
    let m;
    while ((m = optRe.exec(optsBlock)) !== null) {
      options.push({ label: m[1].trim(), description: m[2].trim() });
    }
  }

  return { header, question, type, when, options };
}

export function transformAskClaude(body, { context } = {}) {
  return body.replace(/```ask\n([\s\S]*?)```/g, (_, block) => {
    const { header, question, type, when, options } = parseAskBlock(block, { context });
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

export function transformAskCodex(body, { context } = {}) {
  return body.replace(/```ask\n([\s\S]*?)```/g, (_, block) => {
    const { question, type, when, options } = parseAskBlock(block, { context });
    const prefix = when ? `Wenn ${when}: ` : '';
    if (type === 'approval') {
      return `${prefix}Frage den User: **${question}** Antworte mit "Ja" oder gib Feedback als Freitext.`;
    }
    let out = `Frage den User: **${question}**\n`;
    out += options.map((o) => `- ${o.label} -- ${o.description}`).join('\n');
    return prefix ? `${prefix}${out}` : out;
  });
}

// Full body pipeline per harness: ask blocks, then references.
export function renderBody(resolvedBody, harness, config = {}) {
  const withAsk =
    harness === 'codex'
      ? transformAskCodex(resolvedBody, { context: config.context })
      : transformAskClaude(resolvedBody, { context: config.context });
  return transformRefs(withAsk, harness, config);
}

// Documentation categories whose curated README.md landing page is mandatory
// once the category holds at least one document (see src/shared/doc-categories.md).
export const README_MANDATORY_CATEGORIES = ['user-guide', 'developer-guide'];

// Given a map of category -> file names present in docs/<category>/, return the
// mandatory categories that hold at least one .md document but lack README.md.
// The build guard uses this so a required landing page cannot silently disappear.
export function missingCategoryReadmes(entriesByCategory) {
  return README_MANDATORY_CATEGORIES.filter((category) => {
    const entries = entriesByCategory[category] ?? [];
    const hasDoc = entries.some((f) => f.endsWith('.md') && f !== 'README.md');
    return hasDoc && !entries.includes('README.md');
  });
}

// --- Self-contained agent-contract guard (#100) ---
//
// An agent (description + body) is routing metadata plus the only instructions
// its subagent ever receives at runtime. It must therefore stand on its own: it
// may not defer its meaning to a *historical* "original" agent that is not part
// of the delivered context, to a *sibling* agent by relative comparison, or to
// another agent's instructions via a "Wie bei {{AGENT:…}}" shorthand that names
// the rule without loading it. These phrases make the contract untestable or
// runtime-incomplete, so the build rejects them.
//
// Each pattern's `label` explains why it is blocked; matching is case-insensitive
// and global so every occurrence is reported.
export const SELF_CONTAINED_CONTRACT_PATTERNS = [
  {
    label: 'historical comparison to an "ursprüngliche(r) Agent"',
    re: /urspr(?:ü|ue)nglich(?:e|er|en|es|em)\s+Agent/gi,
  },
  {
    label: 'historical comparison to an "original agent"',
    re: /\boriginal\s+agent\b/gi,
  },
  {
    label: 'historical "same depth as the …" comparison',
    re: /\bsame\s+depth\s+as\s+the\b/gi,
  },
  {
    label: 'relative-to-sibling scope ("wie der/beim/vom <X>-Reviewer/-Implementer/…")',
    re: /\bwie\s+(?:der|dem|des|beim|vom|im|zum)\s+[A-Za-zÄÖÜäöüß0-9.]+-(?:Reviewer|Implementer|Documenter|Validator|Writer|Tester|Agent)(?:s|en|n)?\b/gi,
  },
  {
    label: 'cross-agent shorthand as a contract substitute ("Wie bei {{AGENT:…}}")',
    re: /\bWie\s+bei\s+`?\{\{AGENT:[^}]+\}\}/gi,
  },
];

// Return every self-referential contract phrase in `text` (an agent's
// frontmatter + body), as { label, match } records. A legitimate delegation
// reference such as "an {{AGENT:code-validator}} delegieren" is deliberately not
// matched — only the "Wie bei {{AGENT:…}}" contract-substitute shape is. Returns
// an empty array when the text is self-contained; build.mjs fails on any hit.
export function findSelfReferentialContractPhrases(text) {
  const hits = [];
  for (const { label, re } of SELF_CONTAINED_CONTRACT_PATTERNS) {
    for (const m of text.matchAll(re)) {
      hits.push({ label, match: m[0].trim() });
    }
  }
  return hits;
}
