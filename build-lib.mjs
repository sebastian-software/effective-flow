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
// {{AGENT:X}} -> a namespaced worker reference. Native Claude/Codex installs
// register that exact custom-agent name; the portable manager build maps the
// same identifier to a bundled worker contract and the built-in/general
// subagent mechanism.
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
  const agentName = (raw) => `${agentPrefix}${raw}`;
  const command =
    harness === 'codex' ? `$${skillName}` : harness === 'portable' ? skillName : `/${skillName}`;
  const skillInvocation = (raw) => `${command} ${raw}`;
  return body
    .replace(/\{\{FIRMO\}\}/g, command)
    .replace(/\{\{SKILL:([^}]+)\}\}/g, (_, raw) =>
      exposedTools.includes(raw) ? skillInvocation(raw) : `\`tools/${raw}.md\``,
    )
    .replace(/\{\{AGENT:([^}]+)\}\}/g, (_, raw) => `\`${agentName(raw)}\``);
}

export const PORTABLE_WORKER_DELEGATION = [
  '## Portable worker delegation',
  '',
  "Names matching `effective-flow-<worker>` in this instruction identify bundled worker contracts, not installed custom-agent roles. When a worker is selected, read only its matching `workers/effective-flow-<worker>.md` file, then delegate through the host harness's built-in general-purpose subagent mechanism with that contract as the worker instructions. Do not request a custom role by the contract name. If built-in subagent delegation is unavailable, stop with a clear explanation; never claim that an undiscoverable worker ran.",
].join('\n');

// Enumerate exact rendered worker identifiers. Build-time completeness guards
// use this on every rendered router/tool/shared/worker file, so a missing native
// sidecar or portable contract cannot hide behind source-level validation.
export function collectRenderedWorkerRefs(text, agentPrefix = 'effective-flow-', knownWorkers) {
  const refs = new Set();
  const re = new RegExp(`\\\`(${escapeRegex(agentPrefix)}[a-z0-9]+(?:-[a-z0-9]+)*)\\\``, 'g');
  for (const match of text.matchAll(re)) {
    if (!knownWorkers || knownWorkers.has(match[1])) refs.add(match[1]);
  }
  return [...refs].sort();
}

// Native command tools expose different invocation parameters. Shared and
// portable instructions must not leak one harness's parameter contract into
// another target. Keep this registry explicit so adding a parameter or target
// is a data change rather than another ad-hoc guard.
export const HARNESS_TOOL_PARAMETER_OWNERSHIP = Object.freeze({
  run_in_background: Object.freeze(['claude']),
  'yield-time_ms': Object.freeze(['codex']),
  sandbox_permissions: Object.freeze(['codex']),
});

const TOOL_PARAMETER_TARGETS = Object.freeze(['claude', 'codex', 'portable']);

export function findForeignHarnessToolParameters(text, target) {
  if (!TOOL_PARAMETER_TARGETS.includes(target)) {
    throw new Error(`Unknown rendered target "${target}"`);
  }

  const findings = [];
  const identifierCharacter = /[A-Za-z0-9_-]/;
  const lines = normalizeLineEndings(text).split('\n');

  for (const [parameter, owners] of Object.entries(HARNESS_TOOL_PARAMETER_OWNERSHIP)) {
    if (owners.includes(target)) continue;

    for (const [lineIndex, line] of lines.entries()) {
      let searchFrom = 0;
      while (searchFrom < line.length) {
        const column = line.indexOf(parameter, searchFrom);
        if (column === -1) break;

        const before = column === 0 ? '' : line[column - 1];
        const afterIndex = column + parameter.length;
        const after = afterIndex >= line.length ? '' : line[afterIndex];
        if (!identifierCharacter.test(before) && !identifierCharacter.test(after)) {
          findings.push({ line: lineIndex + 1, parameter, owners: [...owners] });
        }
        searchFrom = column + parameter.length;
      }
    }
  }

  return findings.sort((a, b) => a.line - b.line || a.parameter.localeCompare(b.parameter));
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
    harness === 'codex' || harness === 'portable'
      ? transformAskCodex(resolvedBody, { context: config.context })
      : transformAskClaude(resolvedBody, { context: config.context });
  const withWorkerResolution =
    harness === 'portable' && /\{\{AGENT:[^}]+\}\}/.test(withAsk)
      ? `${PORTABLE_WORKER_DELEGATION}\n\n${withAsk.replace(/^\n/, '')}`
      : withAsk;
  return transformRefs(withWorkerResolution, harness, config);
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

// --- Lazy-include directive (#99) — progressive disclosure inside a tool ---
//
// A ```lazy-include fence defers a mode-gated shared fragment. Instead of
// inlining `src/shared/<name>.md` eagerly (```include), the build ships the
// fragment once per harness as a loadable `shared/<name>.md` and replaces the
// directive with a conditional load pointer at the decision point, so a routine
// invocation that never reaches the mode never loads the fragment. See
// docs/developer-guide/build-system.md ("Progressive disclosure beyond the
// router").
//
// Fence shape (the interior is kept verbatim by oxfmt):
//   ```lazy-include
//   <name>
//   when: <trigger clause>
//   ```
// `name` is the shared fragment; `when` is the trigger clause rendered after
// "when " in the pointer (optional but expected — it is the load trigger).
export const LAZY_INCLUDE_RE = /```lazy-include\n([^\n]+)\n(?:when:[ \t]*([^\n]*)\n)?```/g;

// The harness-neutral load pointer emitted in place of one lazy fence. It names
// the shipped `shared/<name>.md` and, when a trigger is given, the exact
// condition under which the agent should read it.
export function renderLazyPointer(name, when) {
  const trigger = when && when.trim() ? `, when ${when.trim()}` : '';
  return `**Load on demand:** Read \`shared/${name}.md\`${trigger}.`;
}

// Replace every ```lazy-include fence in `body` with its load pointer. Returns
// { body, names } where `names` is the ordered, de-duplicated list of referenced
// fragments (so build.mjs knows which fragment files to ship). A fence without a
// name throws with context.
export function resolveLazyIncludes(body, { context } = {}) {
  const names = [];
  const out = body.replace(LAZY_INCLUDE_RE, (_, rawName, when) => {
    const name = rawName.trim();
    if (!name) {
      throw new Error(`lazy-include fence is missing a fragment name${contextSuffix(context)}`);
    }
    if (!names.includes(name)) names.push(name);
    return renderLazyPointer(name, when);
  });
  return { body: out, names };
}

// Collect the shared-fragment names a raw body references eagerly (```include)
// and lazily (```lazy-include). Run this on the raw source body, before either
// resolver rewrites it.
export function collectIncludeNames(body) {
  const eager = new Set();
  for (const m of body.matchAll(/```include\n([^\n]+)\n```/g)) eager.add(m[1].trim());
  const lazy = new Set();
  for (const m of body.matchAll(LAZY_INCLUDE_RE)) lazy.add(m[1].trim());
  return { eager, lazy };
}

// Guard: a fragment must not be both eager- and lazy-included in the same file.
// Doing both would defer the block in prose yet still inline its full content,
// doubling it and defeating the budget. Throws listing every overlapping name.
export function assertNoEagerLazyOverlap(eager, lazy, { context } = {}) {
  const overlap = [...lazy].filter((name) => eager.has(name));
  if (overlap.length > 0) {
    throw new Error(
      `fragment(s) both eager- and lazy-included${contextSuffix(context)}: ${overlap.join(', ')}`,
    );
  }
}

// --- Consumer-document command guard (#160) ---
//
// These scripts operate on a source checkout or release-maintenance payload;
// they are not supported end-user installation interfaces. Consumer docs may
// still name the files in explanatory prose, but must not present an executable
// local command. Keep this detector pure so the build-time filesystem scan can
// be covered with focused unit tests.

const DEVELOPER_ONLY_SCRIPTS = '(?:install-skill|local-link|local-common)\\.sh';
const LOCAL_SCRIPT_COMMAND_RE = new RegExp(
  `(?:\\.\\/${DEVELOPER_ONLY_SCRIPTS}\\b|\\b(?:bash|sh|zsh|source)[ \\t]+(?:\\.\\/)?${DEVELOPER_ONLY_SCRIPTS}\\b)`,
  'g',
);

export function findProhibitedConsumerScriptCommands(markdown) {
  const hits = [];
  for (const [index, line] of normalizeLineEndings(markdown).split('\n').entries()) {
    LOCAL_SCRIPT_COMMAND_RE.lastIndex = 0;
    for (const match of line.matchAll(LOCAL_SCRIPT_COMMAND_RE)) {
      hits.push({ line: index + 1, command: match[0] });
    }
  }
  return hits;
}

// --- Retired consumer-configuration reference guard (#166) ---
//
// `.effective-flow/config.json` is migration input, not the current
// configuration interface. Consumer documentation may name it only inside the
// deliberately narrow migration section below. The former `.gitignore`
// negation is invalid even there because `.effective-flow/` is now wholly
// ignored. Keep the detector pure so both the source build and the mechanically
// transformed delivery payload can use exactly the same policy.

const RETIRED_CONFIG_PATH = '.effective-flow/config.json';
const RETIRED_CONFIG_MIGRATION_SECTIONS = new Map([
  ['docs/user-guide/configuration.md', new Set(['Migrating a legacy JSON configuration'])],
]);

function normalizeDocumentationPath(file) {
  return file.replaceAll('\\', '/').replace(/^\.\//, '');
}

// Return every prohibited retired-config reference as
// { file, line, kind, reference }. `kind` is `retired-negation` for the former
// `!.effective-flow/config.json` ignore exception and
// `retired-config-outside-migration` for a path mention outside an explicitly
// allowlisted migration section. Lines are reported 1-based.
export function findRetiredConfigDocViolations(file, markdown) {
  const normalizedFile = normalizeDocumentationPath(file);
  const allowedHeadings = RETIRED_CONFIG_MIGRATION_SECTIONS.get(normalizedFile) ?? new Set();
  const headingStack = [];
  const hits = [];

  for (const [index, line] of normalizeLineEndings(markdown).split('\n').entries()) {
    const heading = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      headingStack.length = level - 1;
      headingStack[level - 1] = heading[2].trim();
    }
    const inAllowedMigrationSection = headingStack.some((title) => allowedHeadings.has(title));

    for (const match of line.matchAll(/!?\.effective-flow\/config\.json/g)) {
      const reference = match[0];
      if (reference.startsWith('!')) {
        hits.push({
          file: normalizedFile,
          line: index + 1,
          kind: 'retired-negation',
          reference,
        });
      } else if (!inAllowedMigrationSection) {
        hits.push({
          file: normalizedFile,
          line: index + 1,
          kind: 'retired-config-outside-migration',
          reference: RETIRED_CONFIG_PATH,
        });
      }
    }
  }

  return hits;
}

// --- Delivery-branch documentation transforms ---
//
// The delivery branch `main` carries the consumer-facing docs (root README.md +
// docs/user-guide/) beside the built skill payload, but NOT docs/developer-guide/
// (develop-only). Relative links into the developer guide would therefore dangle
// on `main`, so the deliver step rewrites them to absolute URLs on the source
// branch. Two entry shapes exist: the root README uses the `docs/developer-guide/`
// prefix, every docs/user-guide/*.md uses `../developer-guide/`. Both map to
// `https://github.com/<repo>/blob/<sourceBranch>/docs/developer-guide/<subpath>`.
//
// The pure transforms live here (unit-tested); scripts/deliver-docs.mjs does the
// file I/O in CI. See docs/developer-guide/release-and-installation.md.

const GITHUB_BASE = 'https://github.com';

// Absolute base URL for a file inside docs/developer-guide/ on the source branch.
export function developerGuideBaseUrl(repo, sourceBranch) {
  return `${GITHUB_BASE}/${repo}/blob/${sourceBranch}/docs/developer-guide`;
}

// Rewrite every Markdown link whose target points into docs/developer-guide/ to
// its absolute source-branch URL. `fromRoot` selects the relative prefix: the
// root README uses `docs/developer-guide/`, user-guide files use
// `../developer-guide/`. Only real link targets `](…)` match, so plain-text
// mentions of the path are left alone. Idempotent: an already-absolute
// `](https://…)` target does not start with the relative prefix and is skipped.
export function rewriteDeveloperGuideLinks(markdown, { repo, sourceBranch, fromRoot } = {}) {
  if (!repo || !sourceBranch) {
    throw new Error('rewriteDeveloperGuideLinks requires repo and sourceBranch');
  }
  const base = developerGuideBaseUrl(repo, sourceBranch);
  // The root README reaches the guide as `docs/developer-guide/`; a user-guide
  // file reaches it by walking up one level per directory of nesting
  // (`../developer-guide/`, `../../developer-guide/`, …). Both resolve to the same
  // developer-guide directory, so any depth maps to the same absolute base. Only
  // real link targets `](…)` match; the subpath capture stops at the first `)`, so
  // a literal `)` inside a target (none exist under docs/developer-guide/) is out
  // of scope by design.
  const prefix = fromRoot ? 'docs/developer-guide/' : '(?:\\.\\./)+developer-guide/';
  const re = new RegExp(`\\]\\(${prefix}([^)]*)\\)`, 'g');
  return markdown.replace(re, (_, subpath) => `](${base}/${subpath})`);
}

// Marker comment that makes appendDeliveryFooter idempotent across re-deliveries.
export const DELIVERY_FOOTER_MARKER = '<!-- effective-flow:delivery-footer -->';

// The discreet footer appended only to the delivered `main` README: it names the
// source branch as the place for the developer guide and contributions, so a
// visitor of the machine-owned default branch does not edit the overwritten copy.
export function deliveryFooter(repo, sourceBranch) {
  const url = `${GITHUB_BASE}/${repo}/tree/${sourceBranch}`;
  return [
    DELIVERY_FOOTER_MARKER,
    '',
    '---',
    '',
    `_This is the machine-managed delivery branch. Source, developer documentation, and contributions live on [\`${sourceBranch}\`](${url})._`,
  ].join('\n');
}

// Append the delivery footer once. Returns the input unchanged if the marker is
// already present (idempotent), otherwise trims trailing whitespace and appends
// the footer with a blank-line gap.
export function appendDeliveryFooter(markdown, { repo, sourceBranch } = {}) {
  if (!repo || !sourceBranch) {
    throw new Error('appendDeliveryFooter requires repo and sourceBranch');
  }
  if (markdown.includes(DELIVERY_FOOTER_MARKER)) return markdown;
  return `${markdown.replace(/\s+$/, '')}\n\n${deliveryFooter(repo, sourceBranch)}\n`;
}
