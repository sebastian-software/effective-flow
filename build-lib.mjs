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
export const ASK_ALLOWED_LANGUAGES = ['en', 'de'];
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

const CLAUDE_EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

export function normalizeClaudeEffort(effort, agentName, context) {
  if (!effort) {
    throw new Error(`Missing required claude effort for ${agentName}${contextSuffix(context)}`);
  }

  if (!CLAUDE_EFFORT_LEVELS.has(effort)) {
    throw new Error(
      `Unsupported claude effort "${effort}" for ${agentName}${contextSuffix(context)}; expected one of: low, medium, high, xhigh, max`,
    );
  }

  return effort;
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

// --- Central-skill ownership contract (#168) ---
//
// Effective Flow validates only relationships it declares itself. The central
// skills repository remains an independently released project: normal builds
// never enumerate it or compare its revision. Build-time I/O stays in
// build.mjs; these parsers and reconciliation checks are pure for focused tests.

export const SKILL_OWNERSHIP_TABLE_START = '<!-- skill-ownership-table:start -->';
export const SKILL_OWNERSHIP_TABLE_END = '<!-- skill-ownership-table:end -->';
export const SKILL_OWNERSHIP_RELEVANCE_MARKER = 'skill-ownership:relevance-gate-owners';
export const SKILL_OWNERSHIP_CLASSIFICATIONS = Object.freeze([
  'delegate',
  'route-when-relevant',
  'no-overlap',
]);

const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertPlainObject(value, label, context) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object${contextSuffix(context)}`);
  }
}

function assertOnlyKeys(value, allowedKeys, label, context) {
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unknownKeys.length > 0) {
    throw new Error(
      `${label} has unsupported field(s): ${unknownKeys.sort().join(', ')}${contextSuffix(context)}`,
    );
  }
}

function assertSkillName(value, label, context) {
  if (typeof value !== 'string' || !SKILL_NAME_RE.test(value)) {
    throw new Error(`${label} must be a kebab-case skill name${contextSuffix(context)}`);
  }
}

function parseUniqueSkillNames(value, label, context) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array${contextSuffix(context)}`);
  }
  const seen = new Set();
  return value.map((skill) => {
    assertSkillName(skill, `${label} entry`, context);
    if (seen.has(skill)) {
      throw new Error(`Duplicate skill "${skill}" in ${label}${contextSuffix(context)}`);
    }
    seen.add(skill);
    return skill;
  });
}

export function parseSkillOwnershipManifest(json, { context } = {}) {
  let manifest;
  try {
    manifest = JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid skill-ownership JSON: ${error.message}${contextSuffix(context)}`);
  }
  assertPlainObject(manifest, 'Skill-ownership manifest', context);
  assertOnlyKeys(
    manifest,
    [
      'schemaVersion',
      'provenance',
      'relationships',
      'relevanceGateOwners',
      'externalRecommendationAllowlist',
    ],
    'Skill-ownership manifest',
    context,
  );

  if (manifest.schemaVersion !== 1) {
    throw new Error(`Skill-ownership manifest schemaVersion must be 1${contextSuffix(context)}`);
  }
  if (!Array.isArray(manifest.relationships) || manifest.relationships.length === 0) {
    throw new Error(
      `Skill-ownership manifest relationships must be a non-empty array${contextSuffix(context)}`,
    );
  }

  if (manifest.provenance !== undefined) {
    assertPlainObject(manifest.provenance, 'Skill-ownership provenance', context);
    assertOnlyKeys(
      manifest.provenance,
      ['lastReviewedAt', 'observedRevision'],
      'Skill-ownership provenance',
      context,
    );
    if (
      manifest.provenance.lastReviewedAt !== undefined &&
      !/^\d{4}-\d{2}-\d{2}$/.test(manifest.provenance.lastReviewedAt)
    ) {
      throw new Error(
        `Skill-ownership provenance lastReviewedAt must use YYYY-MM-DD${contextSuffix(context)}`,
      );
    }
    if (
      manifest.provenance.observedRevision !== undefined &&
      (typeof manifest.provenance.observedRevision !== 'string' ||
        manifest.provenance.observedRevision.trim() === '')
    ) {
      throw new Error(
        `Skill-ownership provenance observedRevision must be a non-empty string${contextSuffix(context)}`,
      );
    }
  }

  const relationshipSkills = new Set();
  const relationships = manifest.relationships.map((relationship, relationshipIndex) => {
    assertPlainObject(
      relationship,
      `Skill-ownership relationship ${relationshipIndex + 1}`,
      context,
    );
    assertOnlyKeys(
      relationship,
      ['skill', 'consumers'],
      `Skill-ownership relationship ${relationshipIndex + 1}`,
      context,
    );
    assertSkillName(
      relationship.skill,
      `Skill-ownership relationship ${relationshipIndex + 1}.skill`,
      context,
    );
    if (relationshipSkills.has(relationship.skill)) {
      throw new Error(
        `Duplicate skill-ownership relationship for "${relationship.skill}"${contextSuffix(context)}`,
      );
    }
    relationshipSkills.add(relationship.skill);

    if (!Array.isArray(relationship.consumers) || relationship.consumers.length === 0) {
      throw new Error(
        `Skill-ownership relationship "${relationship.skill}" must declare consumers${contextSuffix(context)}`,
      );
    }
    const consumers = new Set();
    const normalizedConsumers = relationship.consumers.map((consumer, consumerIndex) => {
      assertPlainObject(
        consumer,
        `Consumer ${consumerIndex + 1} for skill "${relationship.skill}"`,
        context,
      );
      assertOnlyKeys(
        consumer,
        ['consumer', 'classification'],
        `Consumer ${consumerIndex + 1} for skill "${relationship.skill}"`,
        context,
      );
      assertSkillName(
        consumer.consumer,
        `Consumer ${consumerIndex + 1} for skill "${relationship.skill}"`,
        context,
      );
      if (consumers.has(consumer.consumer)) {
        throw new Error(
          `Duplicate consumer "${consumer.consumer}" for skill "${relationship.skill}"${contextSuffix(context)}`,
        );
      }
      consumers.add(consumer.consumer);
      if (!SKILL_OWNERSHIP_CLASSIFICATIONS.includes(consumer.classification)) {
        throw new Error(
          `Skill-ownership relationship "${relationship.skill}" / "${consumer.consumer}" has invalid or missing classification "${consumer.classification ?? ''}"; expected one of ${SKILL_OWNERSHIP_CLASSIFICATIONS.join(', ')}${contextSuffix(context)}`,
        );
      }
      return {
        consumer: consumer.consumer,
        classification: consumer.classification,
      };
    });

    return { skill: relationship.skill, consumers: normalizedConsumers };
  });

  const relevanceGateOwners = parseUniqueSkillNames(
    manifest.relevanceGateOwners,
    'Skill-ownership relevanceGateOwners',
    context,
  );
  const externalRecommendationAllowlist = parseUniqueSkillNames(
    manifest.externalRecommendationAllowlist,
    'Skill-ownership externalRecommendationAllowlist',
    context,
  );
  for (const skill of externalRecommendationAllowlist) {
    if (relationshipSkills.has(skill)) {
      throw new Error(
        `Skill "${skill}" cannot be both a declared relationship and an external recommendation${contextSuffix(context)}`,
      );
    }
  }

  return {
    schemaVersion: manifest.schemaVersion,
    provenance: manifest.provenance,
    relationships,
    relevanceGateOwners,
    externalRecommendationAllowlist,
  };
}

function countOccurrences(text, value) {
  return text.split(value).length - 1;
}

function ownershipTableCells(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

export function parseSkillOwnershipTable(markdown, { context } = {}) {
  const normalized = normalizeLineEndings(markdown);
  if (
    countOccurrences(normalized, SKILL_OWNERSHIP_TABLE_START) !== 1 ||
    countOccurrences(normalized, SKILL_OWNERSHIP_TABLE_END) !== 1
  ) {
    throw new Error(
      `Skill-ownership guide requires exactly one dedicated table marker pair${contextSuffix(context)}`,
    );
  }
  const start =
    normalized.indexOf(SKILL_OWNERSHIP_TABLE_START) + SKILL_OWNERSHIP_TABLE_START.length;
  const end = normalized.indexOf(SKILL_OWNERSHIP_TABLE_END);
  if (end <= start) {
    throw new Error(`Skill-ownership table markers are out of order${contextSuffix(context)}`);
  }

  const lines = normalized
    .slice(start, end)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 3) {
    throw new Error(`Skill-ownership table has no relationship rows${contextSuffix(context)}`);
  }
  const headers = ownershipTableCells(lines[0]);
  const expectedHeaders = [
    'Central skill',
    'Effective-Flow consumer(s)',
    'Classification',
    'Domain coverage',
  ];
  if (
    headers.length !== expectedHeaders.length ||
    headers.some((header, index) => header !== expectedHeaders[index])
  ) {
    throw new Error(
      `Skill-ownership table headers must be: ${expectedHeaders.join(', ')}${contextSuffix(context)}`,
    );
  }
  const separator = ownershipTableCells(lines[1]);
  if (
    separator.length !== expectedHeaders.length ||
    separator.some((cell) => !/^:?-{3,}:?$/.test(cell))
  ) {
    throw new Error(`Skill-ownership table has an invalid separator row${contextSuffix(context)}`);
  }

  const seen = new Set();
  return lines.slice(2).map((line) => {
    const cells = ownershipTableCells(line);
    if (cells.length !== expectedHeaders.length) {
      throw new Error(
        `Skill-ownership table row has ${cells.length} cells; expected ${expectedHeaders.length}${contextSuffix(context)}`,
      );
    }
    const match = cells[0].match(/^`([a-z0-9]+(?:-[a-z0-9]+)*)`$/);
    if (!match) {
      throw new Error(
        `Skill-ownership table has an invalid central skill cell "${cells[0]}"${contextSuffix(context)}`,
      );
    }
    const skill = match[1];
    if (seen.has(skill)) {
      throw new Error(
        `Duplicate skill "${skill}" in Markdown ownership table${contextSuffix(context)}`,
      );
    }
    seen.add(skill);
    return {
      skill,
      consumers: cells[1],
      classification: cells[2],
      coverage: cells[3],
    };
  });
}

export function collectRecommendedSkillChains(sources, { context } = {}) {
  if (!Array.isArray(sources)) {
    throw new Error(`Recommended-skill sources must be an array${contextSuffix(context)}`);
  }
  const chains = [];
  for (const source of sources) {
    assertPlainObject(source, 'Recommended-skill source', context);
    if (typeof source.consumer !== 'string' || source.consumer.trim() === '') {
      throw new Error(`Recommended-skill source requires a consumer${contextSuffix(context)}`);
    }
    if (typeof source.text !== 'string') {
      throw new Error(
        `Recommended-skill source "${source.consumer}" requires text${contextSuffix(context)}`,
      );
    }
    const normalized = normalizeLineEndings(source.text);
    const headingRe = /^## (?:Recommended skills|Empfohlene Skills)\s*$/gm;
    for (const heading of normalized.matchAll(headingRe)) {
      const sectionStart = heading.index + heading[0].length;
      const followingHeading = normalized.slice(sectionStart).search(/^##\s+/m);
      const section = normalized.slice(
        sectionStart,
        followingHeading === -1 ? normalized.length : sectionStart + followingHeading,
      );
      for (const bullet of section.matchAll(/^\s*-\s+(.+)$/gm)) {
        const chain = bullet[1].match(/^`([^`]+)`(.*)$/);
        if (!chain || chain[2].includes('`') || chain[2].includes('›')) {
          throw new Error(
            `Recommended-skill bullet for "${source.consumer}" must start with exactly one backticked skill or fallback chain${contextSuffix(source.context ?? context)}`,
          );
        }
        const tokens = chain[1].split('›').map((part) => part.trim());
        for (const token of tokens) {
          assertSkillName(
            token,
            `Recommended skill for "${source.consumer}"`,
            source.context ?? context,
          );
        }
        chains.push({
          consumer: source.consumer,
          skills: tokens,
          context: source.context,
        });
      }
    }
  }
  return chains;
}

export function parseSkillOwnershipRelevanceGateOwners(markdown, { context } = {}) {
  const normalized = normalizeLineEndings(markdown);
  const markerRe = new RegExp(
    `<!--\\s*${escapeRegex(SKILL_OWNERSHIP_RELEVANCE_MARKER)}\\s+(\\[[^\\n]*\\])\\s*-->`,
    'g',
  );
  const matches = [...normalized.matchAll(markerRe)];
  if (matches.length !== 1) {
    throw new Error(
      `Relevance-gate source requires exactly one structured ${SKILL_OWNERSHIP_RELEVANCE_MARKER} marker${contextSuffix(context)}`,
    );
  }
  let owners;
  try {
    owners = JSON.parse(matches[0][1]);
  } catch (error) {
    throw new Error(
      `Invalid relevance-gate owner marker: ${error.message}${contextSuffix(context)}`,
    );
  }
  return parseUniqueSkillNames(owners, 'Relevance-gate owner marker', context);
}

function setDifference(left, right) {
  return [...left].filter((value) => !right.has(value)).sort();
}

export function assertSkillOwnershipContract(
  { manifest, inventoryRows, recommendationChains, relevanceGateOwners, knownConsumers },
  { context } = {},
) {
  const relationshipBySkill = new Map(
    manifest.relationships.map((relationship) => [relationship.skill, relationship]),
  );
  const relationshipSkills = new Set(relationshipBySkill.keys());
  if (knownConsumers !== undefined) {
    if (!(knownConsumers instanceof Set)) {
      throw new Error(`Skill-ownership knownConsumers must be a Set${contextSuffix(context)}`);
    }
    for (const relationship of manifest.relationships) {
      for (const { consumer } of relationship.consumers) {
        if (!knownConsumers.has(consumer)) {
          throw new Error(
            `Unknown Effective Flow consumer "${consumer}" for skill "${relationship.skill}"${contextSuffix(context)}`,
          );
        }
      }
    }
  }
  const inventorySkills = new Set(inventoryRows.map((row) => row.skill));
  const missingRows = setDifference(relationshipSkills, inventorySkills);
  const extraRows = setDifference(inventorySkills, relationshipSkills);
  if (missingRows.length > 0 || extraRows.length > 0) {
    const details = [];
    if (missingRows.length > 0) {
      details.push(`missing Markdown row(s): ${missingRows.join(', ')}`);
    }
    if (extraRows.length > 0) {
      details.push(`stale or extra Markdown row(s): ${extraRows.join(', ')}`);
    }
    throw new Error(
      `Skill-ownership inventory mismatch: ${details.join('; ')}${contextSuffix(context)}`,
    );
  }

  const manifestOwners = new Set(manifest.relevanceGateOwners);
  const sourceOwners = new Set(relevanceGateOwners);
  const staleManifestOwners = setDifference(manifestOwners, sourceOwners);
  const undeclaredSourceOwners = setDifference(sourceOwners, manifestOwners);
  if (staleManifestOwners.length > 0 || undeclaredSourceOwners.length > 0) {
    const details = [];
    if (staleManifestOwners.length > 0) {
      details.push(`stale manifest owner(s): ${staleManifestOwners.join(', ')}`);
    }
    if (undeclaredSourceOwners.length > 0) {
      details.push(`undeclared source owner(s): ${undeclaredSourceOwners.join(', ')}`);
    }
    throw new Error(
      `Skill-ownership relevance-gate mismatch: ${details.join('; ')}${contextSuffix(context)}`,
    );
  }
  for (const owner of manifestOwners) {
    if (!relationshipSkills.has(owner)) {
      throw new Error(
        `Relevance-gate owner "${owner}" has no declared relationship${contextSuffix(context)}`,
      );
    }
  }

  const externalRecommendations = new Set(manifest.externalRecommendationAllowlist);
  for (const chain of recommendationChains) {
    for (const [index, skill] of chain.skills.entries()) {
      if (relationshipSkills.has(skill)) {
        const consumers = new Set(
          relationshipBySkill.get(skill).consumers.map((entry) => entry.consumer),
        );
        if (!consumers.has(chain.consumer)) {
          throw new Error(
            `Unowned recommendation "${skill}" for consumer "${chain.consumer}"${contextSuffix(chain.context ?? context)}`,
          );
        }
      } else if (!externalRecommendations.has(skill)) {
        const label = index === 0 ? 'Unowned recommended skill' : 'Unknown external fallback skill';
        throw new Error(
          `${label} "${skill}" for consumer "${chain.consumer}"${contextSuffix(chain.context ?? context)}`,
        );
      }
    }
  }
}

// --- Shared project-routing contract (#164) ---
//
// The runtime instructions and the fixture regression tests intentionally read
// the same ordered Markdown table. These helpers stay pure: build.mjs owns file
// I/O, while tests can supply synthetic contracts and project scopes directly.

export const PROJECT_ROUTING_TABLE_START = '<!-- project-routing-table:start -->';
export const PROJECT_ROUTING_TABLE_END = '<!-- project-routing-table:end -->';

const PROJECT_ROUTING_HEADERS = [
  'Priority',
  'Route',
  'Matcher',
  'Implementer',
  'Reviewer',
  'Decision',
];

export const PROJECT_ROUTING_REQUIRED_ROUTES = Object.freeze([
  Object.freeze({
    route: 'excluded-generated-vendored',
    matcher: 'excluded',
    decision: 'exclude',
  }),
  Object.freeze({ route: 'documentation', matcher: 'documentation', decision: 'route' }),
  Object.freeze({
    route: 'tooling',
    matcher: 'tooling',
    implementer: '{{AGENT:generic-implementer}}',
    decision: 'route',
  }),
  Object.freeze({
    route: 'frontend-js-ts',
    matcher: 'frontend-js-ts',
    implementer: '{{AGENT:ui-implementer}}',
    reviewer: '{{AGENT:frontend-reviewer}}',
    decision: 'route',
  }),
  Object.freeze({
    route: 'node-backend-cli',
    matcher: 'node-backend-cli',
    implementer: '{{AGENT:nodejs-implementer}}',
    reviewer: '{{AGENT:nodejs-reviewer}}',
    decision: 'route',
  }),
  Object.freeze({
    route: 'rust',
    matcher: 'rust-product',
    implementer: '{{AGENT:rust-implementer}}',
    reviewer: '{{AGENT:rust-reviewer}}',
    decision: 'route',
  }),
  Object.freeze({
    route: 'generic-product',
    matcher: 'generic-product',
    implementer: '{{AGENT:generic-product-implementer}}',
    reviewer: '{{AGENT:generic-product-reviewer}}',
    decision: 'route-degraded',
  }),
  Object.freeze({ route: 'ambiguous', matcher: 'otherwise', decision: 'clarify' }),
]);

function projectRoutingCell(value) {
  const trimmed = value.trim();
  if (trimmed === '—' || trimmed === '-') return '';
  return trimmed.replace(/^`([^`]*)`$/, '$1');
}

function parseProjectRoutingRow(line, expectedCells, context) {
  const cells = line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(projectRoutingCell);
  if (cells.length !== expectedCells) {
    throw new Error(
      `Project-routing row has ${cells.length} cells; expected ${expectedCells}${contextSuffix(context)}`,
    );
  }
  return cells;
}

export function parseProjectRoutingTable(markdown, { context } = {}) {
  const normalized = normalizeLineEndings(markdown);
  const starts = normalized.split(PROJECT_ROUTING_TABLE_START).length - 1;
  const ends = normalized.split(PROJECT_ROUTING_TABLE_END).length - 1;
  if (starts !== 1 || ends !== 1) {
    throw new Error(
      `Project-routing contract requires exactly one start and end marker${contextSuffix(context)}`,
    );
  }

  const start =
    normalized.indexOf(PROJECT_ROUTING_TABLE_START) + PROJECT_ROUTING_TABLE_START.length;
  const end = normalized.indexOf(PROJECT_ROUTING_TABLE_END);
  if (end <= start) {
    throw new Error(`Project-routing table markers are out of order${contextSuffix(context)}`);
  }

  const lines = normalized
    .slice(start, end)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 3) {
    throw new Error(`Project-routing table has no data rows${contextSuffix(context)}`);
  }

  const headers = parseProjectRoutingRow(lines[0], PROJECT_ROUTING_HEADERS.length, context);
  if (headers.some((header, index) => header !== PROJECT_ROUTING_HEADERS[index])) {
    throw new Error(
      `Project-routing table headers must be: ${PROJECT_ROUTING_HEADERS.join(', ')}${contextSuffix(context)}`,
    );
  }
  const separator = parseProjectRoutingRow(lines[1], PROJECT_ROUTING_HEADERS.length, context);
  if (separator.some((cell) => !/^:?-{3,}:?$/.test(cell))) {
    throw new Error(`Project-routing table has an invalid separator row${contextSuffix(context)}`);
  }

  const routes = lines.slice(2).map((line) => {
    const [rawPriority, route, matcher, implementer, reviewer, decision] = parseProjectRoutingRow(
      line,
      PROJECT_ROUTING_HEADERS.length,
      context,
    );
    const priority = Number(rawPriority);
    if (!Number.isSafeInteger(priority) || priority < 0) {
      throw new Error(
        `Project-routing priority "${rawPriority}" must be a non-negative integer${contextSuffix(context)}`,
      );
    }
    if (!route || !matcher || !decision) {
      throw new Error(
        `Project-routing rows require route, matcher, and decision${contextSuffix(context)}`,
      );
    }
    return { priority, route, matcher, implementer, reviewer, decision };
  });

  const routeNames = new Set();
  for (const [index, route] of routes.entries()) {
    if (routeNames.has(route.route)) {
      throw new Error(`Duplicate project route "${route.route}"${contextSuffix(context)}`);
    }
    routeNames.add(route.route);
    if (index > 0 && route.priority <= routes[index - 1].priority) {
      throw new Error(
        `Project-routing priorities must be strictly ascending${contextSuffix(context)}`,
      );
    }
  }
  return routes;
}

export function assertProjectRoutingContract(routes, { context } = {}) {
  if (routes.length !== PROJECT_ROUTING_REQUIRED_ROUTES.length) {
    throw new Error(
      `Project-routing contract must contain exactly ${PROJECT_ROUTING_REQUIRED_ROUTES.length} required routes${contextSuffix(context)}`,
    );
  }
  for (const [index, required] of PROJECT_ROUTING_REQUIRED_ROUTES.entries()) {
    const actual = routes[index];
    for (const field of ['route', 'matcher', 'implementer', 'reviewer', 'decision']) {
      if (required[field] !== undefined && actual[field] !== required[field]) {
        throw new Error(
          `Project-routing row ${index + 1} must use ${field} "${required[field]}"${contextSuffix(context)}`,
        );
      }
    }
  }
}

const FRONTEND_EXTENSIONS = new Set(['.jsx', '.tsx', '.vue', '.svelte']);
const JAVASCRIPT_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
]);
const GENERIC_PRODUCT_EXTENSIONS = new Set([
  '.py',
  '.pyx',
  '.go',
  '.java',
  '.kt',
  '.kts',
  '.scala',
  '.cs',
  '.fs',
  '.fsx',
  '.rb',
  '.php',
  '.swift',
  '.ex',
  '.exs',
  '.erl',
  '.hrl',
  '.c',
  '.h',
  '.cc',
  '.cpp',
  '.cxx',
  '.hpp',
]);
const DOCUMENTATION_EXTENSIONS = new Set(['.md', '.mdx', '.rst', '.adoc']);
const TOOLING_BASENAMES = new Set([
  '.editorconfig',
  '.gitattributes',
  '.gitignore',
  'cargo.lock',
  'compose.yml',
  'compose.yaml',
  'dockerfile',
  'go.mod',
  'go.sum',
  'makefile',
  'package.json',
  'pnpm-lock.yaml',
  'poetry.lock',
  'pyproject.toml',
  'requirements.txt',
  'tsconfig.json',
  'yarn.lock',
]);

function projectFileFacts(file) {
  if (!file || typeof file.path !== 'string' || file.path.trim() === '') {
    throw new Error('Project-routing scope entries require a non-empty path');
  }
  const path = file.path.replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
  const basename = path.slice(path.lastIndexOf('/') + 1);
  const dot = basename.lastIndexOf('.');
  const extension = dot > 0 ? basename.slice(dot) : '';
  const role = typeof file.role === 'string' ? file.role.trim().toLowerCase() : '';
  return { path, basename, extension, role };
}

function hasPathDomain(path, domains) {
  const segments = path.split('/');
  return segments.some((segment) => domains.includes(segment));
}

function isGenericProductRole(role) {
  return ['product', 'application', 'library'].includes(role);
}

function matchesProjectRoute(matcher, facts) {
  const { path, basename, extension, role } = facts;
  const explicit = role !== '';

  switch (matcher) {
    case 'excluded':
      return (
        ['generated', 'vendored', 'vendor', 'excluded'].includes(role) ||
        hasPathDomain(path, [
          'node_modules',
          'vendor',
          'vendored',
          'third_party',
          'dist',
          'coverage',
          '.cache',
          'target',
          'generated',
        ]) ||
        /(?:^|[._-])generated(?:[._-]|$)/.test(basename)
      );
    case 'documentation':
      if (explicit) return ['documentation', 'docs'].includes(role);
      return DOCUMENTATION_EXTENSIONS.has(extension) || hasPathDomain(path, ['docs', 'doc']);
    case 'tooling':
      if (explicit) return ['tooling', 'configuration', 'config', 'metadata'].includes(role);
      return (
        path.startsWith('.github/') ||
        path.startsWith('.gitlab/') ||
        hasPathDomain(path, ['ci', 'scripts']) ||
        TOOLING_BASENAMES.has(basename) ||
        /(?:^|\.)(?:config|conf)\.(?:js|mjs|cjs|ts|json|ya?ml|toml)$/.test(basename) ||
        /^(?:dockerfile|compose)(?:\.|$)/.test(basename)
      );
    case 'frontend-js-ts':
      if (explicit && ['frontend', 'ui', 'browser'].includes(role)) return true;
      if (explicit && !isGenericProductRole(role)) return false;
      return (
        FRONTEND_EXTENSIONS.has(extension) ||
        (JAVASCRIPT_EXTENSIONS.has(extension) &&
          hasPathDomain(path, ['frontend', 'client', 'components', 'pages', 'views', 'ui']))
      );
    case 'node-backend-cli':
      if (explicit && ['node', 'nodejs', 'backend', 'server', 'api', 'cli'].includes(role)) {
        return true;
      }
      if (explicit && !isGenericProductRole(role)) return false;
      return (
        JAVASCRIPT_EXTENSIONS.has(extension) &&
        (hasPathDomain(path, [
          'backend',
          'server',
          'api',
          'routes',
          'controllers',
          'services',
          'workers',
          'cli',
          'bin',
        ]) ||
          /^(?:server|cli)(?:\.|$)/.test(basename))
      );
    case 'rust-product':
      if (explicit && role === 'rust') return true;
      if (explicit && !isGenericProductRole(role)) return false;
      return extension === '.rs';
    case 'generic-product':
      if (explicit) return isGenericProductRole(role);
      return GENERIC_PRODUCT_EXTENSIONS.has(extension);
    case 'otherwise':
      return true;
    default:
      throw new Error(`Unknown project-routing matcher "${matcher}"`);
  }
}

export function classifyProjectRoutingScope(routes, scope, { context } = {}) {
  if (!Array.isArray(routes) || routes.length === 0) {
    throw new Error(`Project-routing classification requires routes${contextSuffix(context)}`);
  }
  if (!Array.isArray(scope)) {
    throw new Error(
      `Project-routing classification requires a scope array${contextSuffix(context)}`,
    );
  }

  const files = scope.map((file) => {
    const facts = projectFileFacts(file);
    const route = routes.find((candidate) => matchesProjectRoute(candidate.matcher, facts));
    if (!route) {
      throw new Error(`No project route matched "${file.path}"${contextSuffix(context)}`);
    }
    return {
      path: file.path,
      route: route.route,
      matcher: route.matcher,
      implementer: route.implementer,
      reviewer: route.reviewer,
      decision: route.decision,
    };
  });

  const buckets = routes
    .map((route) => ({
      route: route.route,
      files: files.filter((file) => file.route === route.route).map((file) => file.path),
    }))
    .filter((bucket) => bucket.files.length > 0);

  return {
    files,
    buckets,
    clarificationRequired: files.some((file) => file.decision === 'clarify'),
  };
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
  const languageMatches = [...block.matchAll(/^language:[ \t]*(.*)$/gm)];

  if (languageMatches.length > 1) {
    throw new Error(`ASK block has duplicate language fields${contextSuffix(context)}`);
  }

  const header = headerMatch ? headerMatch[1].trim() : null;
  const question = questionMatch ? questionMatch[1].trim() : null;
  const type = typeMatch ? typeMatch[1].trim() : null;
  const when = whenMatch ? whenMatch[1].trim() : null;
  const language = languageMatches.length === 1 ? languageMatches[0][1].trim() : 'en';

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
  if (!ASK_ALLOWED_LANGUAGES.includes(language)) {
    throw new Error(
      `ASK block has unknown language "${language}" (allowed: ${ASK_ALLOWED_LANGUAGES.join(', ')})${contextSuffix(context)}`,
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

  return { header, question, type, when, language, options };
}

const ASK_SCAFFOLDING = Object.freeze({
  en: Object.freeze({
    condition: 'If',
    claudeIntro: 'Use the `AskUserQuestion` tool with the following parameters:',
    approvalLabel: 'Yes',
    approvalDescription: 'Approval granted',
    adjustLabel: 'Adjust',
    adjustDescription: 'Enter feedback as free text',
    codexQuestion: 'Ask the user',
    codexApproval: 'Answer with "Yes" or enter feedback as free text.',
  }),
  de: Object.freeze({
    condition: 'Wenn',
    claudeIntro: 'Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:',
    approvalLabel: 'Ja',
    approvalDescription: 'Freigabe erteilt',
    adjustLabel: 'Anpassen',
    adjustDescription: 'Feedback als Freitext eingeben',
    codexQuestion: 'Frage den User',
    codexApproval: 'Antworte mit "Ja" oder gib Feedback als Freitext.',
  }),
});

export function transformAskClaude(body, { context } = {}) {
  return body.replace(/```ask\n([\s\S]*?)```/g, (_, block) => {
    const { header, question, type, when, language, options } = parseAskBlock(block, {
      context,
    });
    const copy = ASK_SCAFFOLDING[language];
    let out = `${copy.claudeIntro}\n`;
    out += `- header: "${header}"\n`;
    out += `- question: "${question}"\n`;
    out += '- multiSelect: false\n';
    out += '- options:\n';
    if (type === 'approval') {
      out += `  - label: "${copy.approvalLabel}", description: "${copy.approvalDescription}"\n`;
      out += `  - label: "${copy.adjustLabel}", description: "${copy.adjustDescription}"`;
    } else {
      out += options
        .map((o) => `  - label: "${o.label}", description: "${o.description}"`)
        .join('\n');
    }
    return when ? `${copy.condition} ${when}:\n\n${out}` : out;
  });
}

export function transformAskCodex(body, { context } = {}) {
  return body.replace(/```ask\n([\s\S]*?)```/g, (_, block) => {
    const { question, type, when, language, options } = parseAskBlock(block, { context });
    const copy = ASK_SCAFFOLDING[language];
    const prefix = when ? `${copy.condition} ${when}: ` : '';
    if (type === 'approval') {
      return `${prefix}${copy.codexQuestion}: **${question}** ${copy.codexApproval}`;
    }
    let out = `${copy.codexQuestion}: **${question}**\n`;
    out += options.map((o) => `- ${o.label} -- ${o.description}`).join('\n');
    return prefix ? `${prefix}${out}` : out;
  });
}

const GOAL_START_CODEX = `After the user explicitly chooses the autonomous \`/goal\` option, attempt to start the goal directly through the available \`create_goal\` capability:

- Set the required \`objective\` to exactly the text after \`/goal \` in the completed single-line prompt for this workflow. Do not paraphrase, shorten or extend it.
- Set \`token_budget\` only if the user explicitly supplied a token budget for this goal; otherwise omit it.
- Make exactly one start attempt. If it succeeds, do not output the \`/goal\` prompt and do not ask the user to paste anything; continue the named remaining phases under the active goal.
- If the capability is unavailable or the call fails for a technical reason, briefly report the cause, then output the full copy-pasteable \`/goal\` prompt and ask the user to paste it as a new input. Do not claim that the goal started and do not silently switch to gated execution.
- If the call explicitly reports that another unfinished goal is already active, report that conflict and wait for the user's decision. Do not output a new \`/goal\` prompt, do not replace, edit, complete or otherwise change the active goal, and do not continue gated.`;

const GOAL_START_PROMPT_HANDOFF = `After the user explicitly chooses the autonomous \`/goal\` option, output the full copy-pasteable \`/goal\` prompt prominently and ask the user to paste it as a new input. Use only this prompt handoff; without a pasted prompt, the workflow continues gated.`;

// Replace the central goal-start action after ASK rendering but before references.
// Codex can attempt a direct start; Claude and portable retain prompt handoff.
export function transformGoalStart(body, harness) {
  const replacement = harness === 'codex' ? GOAL_START_CODEX : GOAL_START_PROMPT_HANDOFF;
  return body.replace(/\{\{GOAL_START\}\}/g, replacement);
}

// Full body pipeline per harness: ask blocks, goal-start action, then references.
export function renderBody(resolvedBody, harness, config = {}) {
  const withAsk =
    harness === 'codex' || harness === 'portable'
      ? transformAskCodex(resolvedBody, { context: config.context })
      : transformAskClaude(resolvedBody, { context: config.context });
  const withGoalStart = transformGoalStart(withAsk, harness);
  const withWorkerResolution =
    harness === 'portable' && /\{\{AGENT:[^}]+\}\}/.test(withGoalStart)
      ? `${PORTABLE_WORKER_DELEGATION}\n\n${withGoalStart.replace(/^\n/, '')}`
      : withGoalStart;
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
// Eager shared fragments are expanded recursively before any harness-specific
// rendering. Keep this transform pure so nested includes, missing targets, and
// cycles have deterministic regression coverage independent of filesystem I/O.
export const EAGER_INCLUDE_RE = /^```include[ \t]*\n([^\n]*)\n```[ \t]*$/gm;

export function findUnresolvedEagerIncludes(body) {
  const findings = [];
  const lines = normalizeLineEndings(body).split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== '```include') continue;
    findings.push({ line: index + 1, name: (lines[index + 1] ?? '').trim() });
  }
  return findings;
}

export function assertNoUnresolvedEagerIncludes(body, { context } = {}) {
  const findings = findUnresolvedEagerIncludes(body);
  if (findings.length === 0) return;
  const details = findings
    .map(({ line, name }) => `line ${line}${name ? ` (${name})` : ' (missing fragment name)'}`)
    .join(', ');
  throw new Error(`unresolved eager include fence${contextSuffix(context)}: ${details}`);
}

export function resolveEagerIncludes(body, { context, readFragment } = {}) {
  if (typeof readFragment !== 'function') {
    throw new Error(`resolveEagerIncludes requires readFragment${contextSuffix(context)}`);
  }

  const expand = (input, chain) =>
    normalizeLineEndings(input).replace(EAGER_INCLUDE_RE, (_, rawName) => {
      const name = rawName.trim();
      if (!name) {
        throw new Error(`eager include fence is missing a fragment name${contextSuffix(context)}`);
      }
      const sharedContext = `shared/${name}.md`;
      if (chain.includes(sharedContext)) {
        throw new Error(
          `eager include cycle${contextSuffix(context)}: ${[...chain, sharedContext].join(' -> ')}`,
        );
      }

      let fragment;
      try {
        fragment = readFragment(name);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
          `cannot resolve eager include "${name}"${contextSuffix(context)} via ${[
            ...chain,
            sharedContext,
          ].join(' -> ')}: ${detail}`,
        );
      }
      if (typeof fragment !== 'string') {
        throw new Error(
          `cannot resolve eager include "${name}"${contextSuffix(context)} via ${[
            ...chain,
            sharedContext,
          ].join(' -> ')}: fragment reader returned no text`,
        );
      }
      return expand(fragment.replace(/\n+$/, ''), [...chain, sharedContext]);
    });

  const resolved = expand(body, context ? [context] : []);
  assertNoUnresolvedEagerIncludes(resolved, { context });
  return resolved;
}

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

// --- Documentation-sync consumer guard ---
//
// Keeping documentation in sync is a fixed part of every implementation tool,
// not an optional phase. These consumers must embed the gate's eager core: a
// lazy pointer carries a `when:` condition a model may judge inapplicable,
// which is exactly the skip this gate removes. The detail contract behind the
// core stays lazy and is deliberately not required here.
export const DOCUMENTATION_SYNC_CONSUMERS = Object.freeze([
  'tools/build.md',
  'tools/fix.md',
  'tools/refactor.md',
  'tools/maintain.md',
]);

const DOCUMENTATION_SYNC_FRAGMENT = 'documentation-sync';

// Takes a Map of context -> collectIncludeNames() result and returns one
// violation per consumer that does not embed the fragment eagerly. A consumer
// missing from the map has not been read at all and violates just the same.
export function findDocumentationSyncViolations(includesByContext) {
  const violations = [];
  for (const context of DOCUMENTATION_SYNC_CONSUMERS) {
    const includes = includesByContext.get(context);
    if (!includes) {
      violations.push({ context, reason: `${context} was not read for the eager gate include` });
      continue;
    }
    if (includes.eager.has(DOCUMENTATION_SYNC_FRAGMENT)) continue;
    const lazily = includes.lazy.has(DOCUMENTATION_SYNC_FRAGMENT);
    violations.push({
      context,
      reason: lazily
        ? `${context} defers \`${DOCUMENTATION_SYNC_FRAGMENT}\` lazily; the gate must be eager`
        : `${context} must include \`${DOCUMENTATION_SYNC_FRAGMENT}\` eagerly`,
    });
  }
  return violations;
}

export function assertDocumentationSyncConsumers(includesByContext, { context } = {}) {
  const violations = findDocumentationSyncViolations(includesByContext);
  if (violations.length > 0) {
    throw new Error(
      `documentation-sync consumer guard${contextSuffix(context)}: the documentation phase is ` +
        'mandatory in every implementation tool:\n  ' +
        violations.map((violation) => violation.reason).join('\n  '),
    );
  }
}

// --- Runtime-state write-safety coverage guard (#165) ---
//
// Runtime workflow sources are executable natural-language contracts. This
// checker walks each root source in order, follows eager and lazy shared
// includes, and verifies that an operational `.effective-flow/` mutation is
// preceded by the canonical safety fragment. It deliberately derives writers
// from their source instructions instead of maintaining a second writer
// allowlist. Read-only runtime lookup is not a mutation.

const RUNTIME_STATE_PATH_RE = /\.effective-flow\/(?:[A-Za-z0-9._<>/{-]+)?/g;
const RUNTIME_MUTATION_RE =
  /\b(?:mkdir|write|writes|wrote|written|writing|create|creates|created|creating|update|updates|updated|updating|delete|deletes|deleted|deleting|remove|removes|removed|removing|copy|copies|copied|copying|rename|renames|renamed|renaming|migrate|migrates|migrated|migrating|mark|marks|marked|marking|acquire|acquires|acquired|acquiring|persist|persists|persisted|persisting|save|saves|saved|saving|append|appends|appended|appending|edit|edits|edited|editing|touch|touches|touched|touching|move|moves|moved|moving|unlink|unlinks|unlinked|unlinking|symlink|symlinks|symlinked|symlinking|store|stores|stored|storing|record|records|recorded|recording|emit|emits|emitted|emitting|replace|replaces|replaced|replacing|lock acquisition)\b|\bgit\s+worktree\s+add\b/i;
const RUNTIME_PASSIVE_MUTATION_RE =
  /\b(?:is|are|was|were)\s+(?:(?:not|never|only)\s+)?(?:written|created|updated|deleted|removed|copied|renamed|migrated|marked|acquired|persisted|saved|appended|edited|touched|moved|unlinked|symlinked|stored|recorded|emitted|replaced)\b/gi;
const RUNTIME_NEGATED_MUTATION_RE =
  /\b(?:(?:do|does|did|must|should|may|can)\s+not|never)\s+(?:write|create|update|delete|remove|copy|rename|migrate|mark|acquire|persist|save|append|edit|touch|move|unlink|symlink|store|record|emit|replace)|\bwithout\s+(?:writing|creating|updating|deleting|removing|copying|renaming|migrating|marking|acquiring|persisting|saving|appending|editing|touching|moving|unlinking|symlinking|storing|recording|emitting|replacing)\b/gi;
const RUNTIME_DESCRIPTIVE_NON_MUTATION_RE =
  /\b(?:read-only|non-mutating|creates? nothing|touches? no git)\b/gi;
const RUNTIME_READ_ONLY_GIT_COMMAND_RE = /\bgit\s+(?:check-ignore|ls-files)\b/i;
const INCLUDE_FENCE_START_RE = /^```(lazy-)?include\s*$/;
const SETUP_REPAIR_SCOPE_START = '<!-- runtime-state-safety: setup-repair-only:start -->';
const SETUP_REPAIR_SCOPE_END = '<!-- runtime-state-safety: setup-repair-only:end -->';
const SETUP_CONTEXT = 'tools/setup.md';
const SETUP_RUNTIME_MARKER = '.effective-flow/memory.json';

function sourceEntries(sources) {
  if (sources instanceof Map) return [...sources.entries()];
  return Object.entries(sources ?? {});
}

function runtimeMutationOnLine(line) {
  RUNTIME_STATE_PATH_RE.lastIndex = 0;
  const paths = [...line.matchAll(RUNTIME_STATE_PATH_RE)].map((match) => match[0]);
  const withoutNonOperationalCode = line.replace(/`([^`]+)`/g, (match, code) =>
    /\.effective-flow\/|\bgit\s+worktree\s+add\b|\bmkdir\b|\b(?:cp|mv|rm|touch|unlink)\b/i.test(
      code,
    )
      ? match
      : '',
  );
  const operationalText = withoutNonOperationalCode
    .replace(RUNTIME_PASSIVE_MUTATION_RE, '')
    .replace(RUNTIME_NEGATED_MUTATION_RE, '')
    .replace(RUNTIME_DESCRIPTIVE_NON_MUTATION_RE, '');
  if (paths.length === 0 || !RUNTIME_MUTATION_RE.test(operationalText)) return null;
  return paths[0];
}

function walkRuntimeStateMutations(
  sources,
  { rootContexts, initialState, onLine, onInclude, onMutation } = {},
) {
  const entries = sourceEntries(sources).sort(([a], [b]) => a.localeCompare(b));
  const sourceMap = new Map(entries);
  const roots = (
    rootContexts ??
    entries.map(([context]) => context).filter((context) => !context.startsWith('shared/'))
  )
    .filter((context) => sourceMap.has(context))
    .sort();

  const visit = (context, state, includeChain, includePath = []) => {
    const body = normalizeLineEndings(sourceMap.get(context) ?? '');
    const lines = body.split('\n');
    const active = { ...state };

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      onLine?.({ context, line, lineNumber: index + 1, active, includeChain });

      const includeStart = INCLUDE_FENCE_START_RE.exec(line);
      if (includeStart) {
        const lazy = Boolean(includeStart[1]);
        const name = (lines[index + 1] ?? '').trim();
        let fenceEnd = index + 2;
        while (fenceEnd < lines.length && lines[fenceEnd].trim() !== '```') fenceEnd += 1;
        const when = lazy
          ? (lines
              .slice(index + 2, fenceEnd)
              .find((candidate) => candidate.trim().startsWith('when:'))
              ?.replace(/^\s*when:\s*/, '') ?? '')
          : '';
        const traverseInclude =
          onInclude?.({
            context,
            name,
            lineNumber: index + 1,
            active,
            includeChain,
            includePath,
            lazy,
            when,
          }) !== false;
        const sharedContext = `shared/${name}.md`;
        if (
          traverseInclude &&
          name &&
          sourceMap.has(sharedContext) &&
          !includeChain.includes(sharedContext)
        ) {
          Object.assign(
            active,
            visit(
              sharedContext,
              active,
              [...includeChain, sharedContext],
              [...includePath, { name, lazy, when }],
            ),
          );
        }
        index = Math.min(fenceEnd, lines.length - 1);
        continue;
      }

      // Markdown commonly wraps an operation immediately before its target.
      // Join only the preceding physical line, preserving source order without
      // turning an entire paragraph into a broad prose heuristic.
      const target =
        runtimeMutationOnLine(line) ??
        (line.includes('.effective-flow/') && !RUNTIME_READ_ONLY_GIT_COMMAND_RE.test(line)
          ? runtimeMutationOnLine(`${lines[index - 1] ?? ''} ${line}`)
          : null);
      if (!target) continue;
      onMutation?.({
        context,
        line,
        lineNumber: index + 1,
        target,
        active,
        includeChain,
        includePath,
      });
    }

    return active;
  };

  for (const context of roots) {
    visit(context, initialState?.(context) ?? {}, [context]);
  }
}

function runtimeSafetyTriggerCoversMutation(when, { context, line, target, includeChain }) {
  const trigger = when.toLowerCase();
  if (/\b(?:any|other|every) runtime-state mutation\b/.test(trigger)) return true;

  const inDirectoryMigration =
    context === 'shared/effective-flow-dir-migration.md' ||
    includeChain.includes('shared/effective-flow-dir-migration.md');
  if (inDirectoryMigration) {
    return /runtime (?:directory )?migration|\bmemory\b|runtime marker/.test(trigger);
  }

  const inIssueTracker =
    context === 'shared/issue-tracker.md' || includeChain.includes('shared/issue-tracker.md');
  if (inIssueTracker) {
    return /tracker-marker|tracker marker|migration marker|\bmemory\b/.test(trigger);
  }

  if (target.startsWith('.effective-flow/memory.json')) {
    return /\bmemory\b|runtime marker|migration marker|tracker-marker|tracker marker/.test(trigger);
  }
  if (target.includes('.worktrees/')) return /worktree/.test(trigger);
  if (target.includes('wisdom')) return /wisdom/.test(trigger);
  if (target.includes('cache.json')) return /cache/.test(trigger);
  if (target.includes('/review/') || /\breport\b/i.test(line)) return /report/.test(trigger);
  if (target.includes('/investigation/')) return /investigation/.test(trigger);
  if (target.includes('lock')) return /\block\b/.test(trigger);
  if (/\b(?:copy|copied|remove|removed|delete|deleted)\b/i.test(line)) {
    return /copied|copy|removed|remove|delet/.test(trigger);
  }
  return trigger.includes(target.toLowerCase());
}

// Return deterministic { context, line, reason, target, includeChain } records.
// `sources` is a Map/object from source context (`tools/x.md`, `shared/y.md`, …)
// to raw source body. By default tools and agents are execution roots; shared
// fragments are reached through their owning include position.
export function findRuntimeStateSafetyViolations(
  sources,
  { rootContexts, guardFragment = 'runtime-state-safety', setupContext = SETUP_CONTEXT } = {},
) {
  const violations = [];
  walkRuntimeStateMutations(sources, {
    rootContexts,
    initialState: () => ({
      guardSeen: false,
      guardLazy: false,
      guardWhen: '',
      setupSentinelValidated: false,
      setupTargetValidated: false,
      setupTrackedStateValidated: false,
      setupRepairOnly: false,
    }),
    onLine: ({ context, line, active }) => {
      if (line.trim() === SETUP_REPAIR_SCOPE_START) active.setupRepairOnly = true;
      if (line.trim() === SETUP_REPAIR_SCOPE_END) active.setupRepairOnly = false;
      if (context !== setupContext) return;
      if (line.includes('git check-ignore --no-index -- .effective-flow/config.json')) {
        active.setupSentinelValidated = true;
      }
      if (line.includes(`git check-ignore --no-index -- ${SETUP_RUNTIME_MARKER}`)) {
        active.setupTargetValidated = true;
      }
      if (line.includes('git ls-files -- .effective-flow/')) {
        active.setupTrackedStateValidated = true;
      }
    },
    onInclude: ({ name, active, lazy, when }) => {
      if (name !== guardFragment) return true;
      active.guardSeen = true;
      active.guardLazy = lazy;
      active.guardWhen = when;
      return false;
    },
    onMutation: ({ context, line, lineNumber, target, active, includeChain, includePath }) => {
      if (active.setupRepairOnly && includeChain[0] !== setupContext) return;
      if (!active.guardSeen) {
        violations.push({
          context,
          line: lineNumber,
          reason: 'runtime mutation is not preceded by the canonical safety guard',
          target,
          includeChain: [...includeChain],
        });
        return;
      }
      const mutationHasOwnLazyTrigger = includePath.some(
        ({ name, lazy }) => lazy && name !== guardFragment,
      );
      const eagerApplicabilityOwner = includePath.find(
        ({ name, lazy }) =>
          !lazy && (name === 'effective-flow-dir-migration' || name === 'issue-tracker'),
      );
      if (
        active.guardLazy &&
        active.guardWhen &&
        eagerApplicabilityOwner &&
        !mutationHasOwnLazyTrigger &&
        !runtimeSafetyTriggerCoversMutation(active.guardWhen, {
          context,
          line,
          target,
          includeChain,
        })
      ) {
        violations.push({
          context,
          line: lineNumber,
          reason: `runtime-state-safety trigger does not cover this mutation: "${active.guardWhen}"`,
          target,
          includeChain: [...includeChain],
        });
        return;
      }
      if (
        context === setupContext &&
        target.startsWith(SETUP_RUNTIME_MARKER) &&
        !(
          active.setupSentinelValidated &&
          active.setupTargetValidated &&
          active.setupTrackedStateValidated
        )
      ) {
        violations.push({
          context,
          line: lineNumber,
          reason: 'setup runtime marker write is not preceded by complete target-state validation',
          target,
          includeChain: [...includeChain],
        });
      }
    },
  });

  return violations.sort(
    (a, b) =>
      a.context.localeCompare(b.context) ||
      a.line - b.line ||
      a.reason.localeCompare(b.reason) ||
      a.target.localeCompare(b.target),
  );
}

// --- Runtime-directory migration prerequisite coverage guard (#174) ---
//
// Uses the same ordered mutation traversal as the write-safety guard. Every
// operational runtime-state mutation must encounter the canonical migration
// fragment first, including mutations reached through nested shared writers.

export function findRuntimeDirMigrationViolations(
  sources,
  { rootContexts, migrationFragment = 'effective-flow-dir-migration' } = {},
) {
  const migrationContext = `shared/${migrationFragment}.md`;
  const violations = [];

  walkRuntimeStateMutations(sources, {
    rootContexts,
    initialState: () => ({ migrationSeen: false, setupRepairOnly: false }),
    onLine: ({ line, active }) => {
      if (line.trim() === SETUP_REPAIR_SCOPE_START) active.setupRepairOnly = true;
      if (line.trim() === SETUP_REPAIR_SCOPE_END) active.setupRepairOnly = false;
    },
    onInclude: ({ name, active }) => {
      if (name === migrationFragment) active.migrationSeen = true;
      return name !== 'runtime-state-safety';
    },
    onMutation: ({ context, lineNumber, target, active, includeChain }) => {
      if (active.setupRepairOnly && includeChain[0] !== SETUP_CONTEXT) return;
      if (context === migrationContext || active.migrationSeen) return;
      violations.push({
        context,
        line: lineNumber,
        reason: 'runtime mutation is not preceded by the runtime-directory migration prerequisite',
        target,
        includeChain: [...includeChain],
      });
    },
  });

  return violations.sort(
    (a, b) =>
      a.context.localeCompare(b.context) ||
      a.line - b.line ||
      a.reason.localeCompare(b.reason) ||
      a.target.localeCompare(b.target),
  );
}

// --- Shared memory-state mutation coverage guard (#176) ---
//
// Every operational write to the repository-global memory object must pass
// through the single lock/merge/atomic-replacement contract. Ordered traversal
// catches a writer that includes the contract only after its first mutation.

export function findMemoryStateContractViolations(
  sources,
  { rootContexts, contractFragment = 'memory-state', delivered = false } = {},
) {
  const contractContext = `shared/${contractFragment}.md`;
  const violations = [];

  walkRuntimeStateMutations(sources, {
    rootContexts,
    initialState: () => ({ memoryContractSeen: false }),
    onLine: ({ line, active }) => {
      if (delivered && line.trim() === '## Shared memory-state mutation') {
        active.memoryContractSeen = true;
      }
    },
    onInclude: ({ name, active, lazy }) => {
      if (delivered) return lazy;
      if (name === contractFragment) active.memoryContractSeen = true;
      return name !== contractFragment;
    },
    onMutation: ({ context, lineNumber, target, active, includeChain }) => {
      if (context === contractContext || !target.startsWith('.effective-flow/memory.json')) return;
      if (active.memoryContractSeen) return;
      violations.push({
        context,
        line: lineNumber,
        reason: 'memory mutation is not preceded by the shared memory-state contract',
        target,
        includeChain: [...includeChain],
      });
    },
  });

  return violations.sort(
    (a, b) =>
      a.context.localeCompare(b.context) ||
      a.line - b.line ||
      a.reason.localeCompare(b.reason) ||
      a.target.localeCompare(b.target),
  );
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

// Runtime prompts must delegate provider transport mechanics to the shipped
// remote-tracker helper. Return line-oriented diagnostics for raw CLI/API recipes
// that would make the model rediscover flags, parse remotes, or assemble GraphQL.
export function findRemoteTrackerRecipeViolations(markdown) {
  const patterns = [
    ['direct-gh-command', /\bgh\s+(?:api|auth|issue|pr|label)\b/i],
    ['direct-tea-command', /\btea\s+(?:issue|issues|pr|pulls|comment|labels|logins)\b/i],
    ['manual-origin-parse', /git\s+remote\s+get-url\s+origin/i],
    ['manual-graphql', /(?:query|mutation)\s*\([^\n]*\)\s*\{|resolveReviewThread\s*\(/i],
    ['runtime-flag-discovery', /(?:check|determine)\s+(?:the\s+)?exact\s+flag(?:s| names)?/i],
  ];
  const hits = [];
  for (const [index, line] of normalizeLineEndings(markdown).split('\n').entries()) {
    for (const [kind, pattern] of patterns) {
      if (pattern.test(line)) hits.push({ line: index + 1, kind, text: line.trim() });
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

// --- ADR ownership-contract guard (#167) ---
//
// Effective Flow's living, mutable, numberless ADR model is a repository
// convention that the central `decision-records` skill discovers and follows.
// Older guidance described that relationship as a deliberate divergence from
// an immutable/numbered skill contract. Current contributor guidance must not
// restore that obsolete premise, while an explicitly corrected historical
// explanation may retain it. Keep this detector pure so the build-time file
// scan can be covered with focused unit tests.

const STALE_ADR_DIVERGENCE_RE =
  /\b(?:(?:deliberate|intentional)\s+(?:conflict|divergence|deviation)|(?:deliberately|intentionally)\s+(?:conflicts?|diverges?|deviates?)|(?:conflicts?|diverges?|deviates?)\s+(?:deliberately|intentionally))\b/gi;
const STALE_ADR_DESCRIPTOR_RE = /\b(?:immutable|numbered)\b/gi;

const ADR_CONTRACT_HISTORY_RE = /\b(?:earlier|previous|former|historical|old|pre-#85)\b/i;
const ADR_CONTRACT_CORRECTION_RE =
  /\b(?:outdated|no longer (?:a )?(?:conflict|divergence)|conflict is gone|now supports)\b/i;

function markdownParagraphs(markdown) {
  const paragraphs = [];
  let startLine = 1;
  let lines = [];

  const flush = () => {
    if (lines.length > 0) paragraphs.push({ line: startLine, text: lines.join('\n') });
    lines = [];
  };

  for (const [index, line] of normalizeLineEndings(markdown).split('\n').entries()) {
    if (line.trim() === '') {
      flush();
      startLine = index + 2;
    } else {
      if (lines.length === 0) startLine = index + 1;
      lines.push(line);
    }
  }
  flush();
  return paragraphs;
}

function markdownSentences(text) {
  const sentences = [];
  let start = 0;

  for (const boundary of text.matchAll(/[.!?](?=\s|$)/g)) {
    const end = boundary.index + 1;
    if (text.slice(start, end).trim()) sentences.push({ start, text: text.slice(start, end) });
    start = end;
  }
  if (text.slice(start).trim()) sentences.push({ start, text: text.slice(start) });
  return sentences;
}

function continuesPreviousSkillClaim(sentence) {
  const prose = sentence.trimStart().replace(/^(?:[#>*+-]+\s*)+/, '');
  return /^(?:It|The skill|This skill|That skill)\b/i.test(prose);
}

function isLocallyNegated(sentence, claimIndex) {
  const prefix = sentence.slice(0, claimIndex);
  const negations = [
    ...prefix.matchAll(
      /\b(?:no longer|not|does not|do not|did not|is not|are not|was not|were not)\b/gi,
    ),
  ];
  const negation = negations.at(-1);
  if (!negation) return false;
  const scope = prefix.slice(negation.index + negation[0].length);
  return scope.length <= 80 && !/(?:[;:.!?]|\b(?:but|however|yet)\b)/i.test(scope);
}

function isAssociatedCorrectionSentence(sentence) {
  const prose = sentence.trimStart().replace(/^(?:[#>*+-]+\s*)+/, '');
  return /^(?:(?:That|This)\s+(?:assumption|claim|conflict|contract|description|divergence|model|premise)|It)\b/i.test(
    prose,
  );
}

function isCorrectedHistoricalClaim(sentences, sentenceIndex, claimIndex) {
  const sentence = sentences[sentenceIndex].text;
  const history = ADR_CONTRACT_HISTORY_RE.exec(sentence);
  if (!history || history.index > claimIndex) return false;

  const correction = ADR_CONTRACT_CORRECTION_RE.exec(sentence);
  if (correction && correction.index > claimIndex) return true;

  const nextSentence = sentences[sentenceIndex + 1]?.text;
  return Boolean(
    nextSentence &&
    isAssociatedCorrectionSentence(nextSentence) &&
    ADR_CONTRACT_CORRECTION_RE.test(nextSentence),
  );
}

// Return stale ADR ownership claims as { line, kind, claim } records. Historical
// wording is allowed only when the same paragraph both identifies the old
// context and explicitly corrects it as outdated or no longer a conflict.
export function findStaleAdrContractClaims(markdown) {
  const hits = [];

  for (const paragraph of markdownParagraphs(markdown)) {
    if (!/\bdecision-records\b/i.test(paragraph.text)) continue;
    const sentences = markdownSentences(paragraph.text);
    const candidates = [];

    for (const [sentenceIndex, sentence] of sentences.entries()) {
      const namesDecisionRecords = /\bdecision-records\b/i.test(sentence.text);
      if (namesDecisionRecords) {
        for (const match of sentence.text.matchAll(STALE_ADR_DIVERGENCE_RE)) {
          candidates.push({
            kind: 'stale-divergence',
            index: sentence.start + match.index,
            sentenceIndex,
            sentenceClaimIndex: match.index,
            claim: match[0],
          });
        }
      }

      const previousNamesDecisionRecords =
        sentenceIndex > 0 && /\bdecision-records\b/i.test(sentences[sentenceIndex - 1].text);
      const inheritsDecisionRecords =
        previousNamesDecisionRecords && continuesPreviousSkillClaim(sentence.text);
      const isLegacyCompatibility =
        /\blegacy\b/i.test(sentence.text) &&
        /\b(?:compatib\w*|readable|resolvable)\b/i.test(sentence.text);
      if ((namesDecisionRecords || inheritsDecisionRecords) && !isLegacyCompatibility) {
        for (const match of sentence.text.matchAll(STALE_ADR_DESCRIPTOR_RE)) {
          candidates.push({
            kind: 'immutable-numbered-skill-contract',
            index: sentence.start + match.index,
            sentenceIndex,
            sentenceClaimIndex: match.index,
            claim: match[0],
          });
        }
      }
    }

    candidates.sort((a, b) => a.index - b.index || a.kind.localeCompare(b.kind));

    for (const { kind, index, sentenceIndex, sentenceClaimIndex, claim } of candidates) {
      if (isLocallyNegated(sentences[sentenceIndex].text, sentenceClaimIndex)) continue;
      if (isCorrectedHistoricalClaim(sentences, sentenceIndex, sentenceClaimIndex)) continue;
      const precedingLines = paragraph.text.slice(0, index).split('\n').length - 1;
      hits.push({
        line: paragraph.line + precedingLines,
        kind,
        claim: claim.replace(/\s+/g, ' ').trim(),
      });
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
