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
  cleanDescription,
  tomlString,
  normalizeCodexSandboxMode,
  validateRefs,
  assertQuotedDescription,
  renderBody,
  missingCategoryReadmes,
  README_MANDATORY_CATEGORIES,
  findSelfReferentialContractPhrases,
  resolveLazyIncludes,
  collectIncludeNames,
  assertNoEagerLazyOverlap,
} from './build-lib.mjs';

const ROOT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = join(ROOT_DIR, 'src');
const SHARED_DIR = join(SOURCE_DIR, 'shared');
const TOOLS_DIR = join(SOURCE_DIR, 'tools');
const AGENTS_DIR = join(SOURCE_DIR, 'agents');
const ROUTER_SRC = join(SOURCE_DIR, 'SKILL.md');

// Hand-maintained user guide (not generated from src/). A content guard below
// protects the canonical Plan->Build handoff examples against regression (#107).
const DOCS_USER_GUIDE = join(ROOT_DIR, 'docs', 'user-guide');

// The build writes into a temporary tree and swaps it onto dist/ only after a
// fully successful build (see the atomic swap below), so dist/ is always either
// entirely the previous build or entirely the new one — never a half-written
// mix left behind by a mid-build throw.
const DIST_ROOT = join(ROOT_DIR, 'dist');
const DIST_TMP = join(ROOT_DIR, 'dist.tmp');
const DIST_BAK = join(ROOT_DIR, 'dist.bak');

const FIRMO_SKILL_NAME = 'effective-flow';
const DIST_CODEX = join(DIST_TMP, 'codex');
const DIST_CLAUDE = join(DIST_TMP, 'claude');
const CODEX_SKILL_DIR = join(DIST_CODEX, FIRMO_SKILL_NAME);
const CLAUDE_SKILL_DIR = join(DIST_CLAUDE, FIRMO_SKILL_NAME);
// Claude Code does not auto-discover skill-nested agents, so Claude agents ship
// separately as registered subagents (installed into ~/.claude/agents),
// namespaced with a `firmo-` prefix to avoid collisions with other agents.
const CLAUDE_AGENTS_DIR = join(DIST_CLAUDE, 'agents');
const CLAUDE_AGENT_PREFIX = 'effective-flow-';

// The tools exposed via `/effective-flow <tool>`, grouped by user intent. The router
// catalog renders these groups (title + optional "when" line + tools); the flat
// `EXPOSED_TOOLS` order equals the concatenation of the groups in order.
// Orchestrator/utility skills whose mapped name is not listed here are treated
// as internal (built as tool files, but not shown in the router catalog).
// A tool's usage-oriented one-line `catalogHint` (frontmatter) is what the
// catalog shows per line; see the catalogHint guard below.
const TOOL_GROUPS = [
  {
    title: 'Verstehen, was zu tun ist',
    when: 'Analyse & Planung, bevor Code entsteht',
    tools: ['investigate', 'plan', 'open-plans', 'plan-issue'],
  },
  {
    title: 'Eine Änderung umsetzen',
    when: 'vom geklärten Plan/Issue zum Code',
    tools: ['apply', 'build', 'fix', 'refactor', 'docs', 'maintain', 'iterate'],
  },
  {
    title: 'Qualität sichern',
    tools: ['review'],
  },
  {
    title: 'Änderungen einbringen',
    tools: ['commit', 'pr'],
  },
  {
    title: 'Einrichten & Infos',
    tools: ['setup', 'cleanup', 'version'],
  },
];

// Guard: each exposed tool is assigned to exactly one group (no duplicates).
// The "unknown name" case is caught by the "every exposed tool must exist" check.
{
  const seenInGroups = new Set();
  for (const group of TOOL_GROUPS) {
    for (const name of group.tools) {
      if (seenInGroups.has(name)) {
        process.stderr.write(`ERROR: tool "${name}" appears in more than one TOOL_GROUPS entry\n`);
        process.exit(1);
      }
      seenInGroups.add(name);
    }
  }
}

const EXPOSED_TOOLS = TOOL_GROUPS.flatMap((group) => group.tools);

const releasePleaseManifestPath = join(ROOT_DIR, '.release-please-manifest.json');
if (!existsSync(releasePleaseManifestPath)) {
  process.stderr.write('ERROR: .release-please-manifest.json not found in project root\n');
  process.exit(1);
}
let VERSION;
try {
  const manifest = JSON.parse(readFileSync(releasePleaseManifestPath, 'utf8'));
  VERSION = manifest['.'];
} catch (err) {
  process.stderr.write(`ERROR: Could not read .release-please-manifest.json: ${err.message}\n`);
  process.exit(1);
}
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(VERSION ?? '')) {
  process.stderr.write(
    'ERROR: .release-please-manifest.json must contain a semver string at key "."\n',
  );
  process.exit(1);
}
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

// --- Guard: mandatory curated README per documentation category ---
// doc-categories.md requires a README.md landing page in user-guide and
// developer-guide once the category holds any document. Enforce it here so the
// required entry point cannot silently disappear (CI runs `node build.mjs`).
{
  const docsDir = join(ROOT_DIR, 'docs');
  const entriesByCategory = {};
  for (const category of README_MANDATORY_CATEGORIES) {
    const categoryDir = join(docsDir, category);
    entriesByCategory[category] = existsSync(categoryDir) ? readdirSync(categoryDir) : [];
  }
  const missingReadmes = missingCategoryReadmes(entriesByCategory);
  if (missingReadmes.length > 0) {
    for (const category of missingReadmes) {
      process.stderr.write(
        `ERROR: docs/${category}/ holds documents but is missing the mandatory docs/${category}/README.md landing page\n`,
      );
    }
    process.exit(1);
  }
}

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
let budgetReport = []; // [{ name, lines }] — always-loaded size of the largest tools (#99)

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
    skillName: FIRMO_SKILL_NAME,
    knownTools,
    knownAgents,
  };

  // Shared fragments deferred via ```lazy-include across all sources; each is
  // shipped once per harness as shared/<name>.md (see the per-harness loop).
  const lazyFragments = new Set();

  const readSource = (dir, file, context) => {
    const content = normalizeLineEndings(readFileSync(join(dir, file), 'utf8'));
    const fm = extractFrontmatter(content);
    const rawBody = extractBody(content);
    // Guard: no fragment is both eager- and lazy-included in the same file.
    const { eager, lazy } = collectIncludeNames(rawBody);
    assertNoEagerLazyOverlap(eager, lazy, { context });
    // Eager includes inline now; each lazy include becomes a load pointer and is
    // recorded for shipping as a standalone shared/<name>.md fragment.
    const { body: withPointers, names } = resolveLazyIncludes(resolveIncludes(rawBody), {
      context,
    });
    for (const name of names) lazyFragments.add(name);
    const body = withPointers.replace(/\{\{VERSION\}\}/g, VERSION_STRING);
    // Guard: description is strictly double-quoted, and every SKILL/AGENT
    // reference (in frontmatter and body) points at an existing source.
    assertQuotedDescription(fm, { context });
    validateRefs(`${fm}\n${body}`, { knownTools, knownAgents, context });
    return { fm, body };
  };

  for (const file of toolFiles) {
    const context = `tools/${file}`;
    const { fm, body } = readSource(TOOLS_DIR, file, context);
    const name = basename(file, '.md');
    // Guard: every exposed tool carries a non-empty, strictly double-quoted
    // catalogHint — the usage-oriented one-liner shown in the router catalog.
    if (EXPOSED_TOOLS.includes(name)) {
      const hintLine = fm.split('\n').find((l) => /^catalogHint:/.test(l));
      if (!hintLine) {
        throw new Error(`Exposed tool "${name}" is missing a catalogHint field (${context})`);
      }
      if (!/^catalogHint:\s*".+"\s*$/.test(hintLine)) {
        throw new Error(
          `catalogHint for "${name}" must be a non-empty, strictly double-quoted string (${context})`,
        );
      }
    }
    tools.push({
      name,
      description: getField(fm, 'description'),
      catalogHint: getField(fm, 'catalogHint'),
      body,
    });
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

  // --- Content guard: versioned frontend standards live only in the central
  // `effective-web` skill, never copied back into agent/tool sources (#104). A
  // versioned WCAG claim (e.g. "WCAG 2.1 AA") pins an evolving standard that the
  // delegate/route frontend agents must source from effective-web, so it must
  // not reappear here — otherwise Firmo carries a second, drifting standards copy.
  // Bare, unversioned mentions (e.g. "wende WCAG an") are allowed. Descriptions
  // flow into both harness outputs, so scan frontmatter together with the body.
  const VERSIONED_STANDARD = /\bWCAG\s*\d/i;
  const assertNoVersionedStandard = (text, context) => {
    if (VERSIONED_STANDARD.test(text)) {
      throw new Error(
        `content guard (#104): "${context}" pins a versioned frontend standard ` +
          '(matched /WCAG\\s*\\d/); evolving standards like WCAG live only in the central ' +
          'effective-web skill — delegate to it and drop the versioned claim',
      );
    }
  };
  for (const a of agents) assertNoVersionedStandard(`${a.fm}\n${a.body}`, `agents/${a.name}.md`);
  for (const t of tools) {
    assertNoVersionedStandard(
      `${t.description}\n${t.catalogHint ?? ''}\n${t.body}`,
      `tools/${t.name}.md`,
    );
  }

  // --- Content guard: self-contained agent contracts (#100). Every agent
  // description/body is the complete runtime contract handed to its subagent, so
  // it must not defer meaning to a historical "original" agent, to a sibling by
  // relative comparison, or to another agent via a "Wie bei {{AGENT:…}}"
  // shorthand. A legitimate {{AGENT:X}} delegation reference stays allowed. Scan
  // frontmatter together with the body, since descriptions flow into both
  // harness outputs. The pure checker lives in build-lib.mjs and is unit-tested.
  const contractViolations = [];
  for (const a of agents) {
    for (const v of findSelfReferentialContractPhrases(`${a.fm}\n${a.body}`)) {
      contractViolations.push(`agents/${a.name}.md — ${v.label}: "${v.match}"`);
    }
  }
  if (contractViolations.length > 0) {
    throw new Error(
      'content guard (#100): agent descriptions/contracts must be self-contained ' +
        '(no historical "original"/sibling comparison, no "Wie bei {{AGENT:…}}" contract ' +
        'substitute; a bare {{AGENT:X}} delegation reference stays allowed):\n  ' +
        contractViolations.join('\n  '),
    );
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

  const skillInvocation = (harness, name) =>
    harness === 'codex' ? `$${FIRMO_SKILL_NAME} ${name}` : `/${FIRMO_SKILL_NAME} ${name}`;
  const routerDescForHarness = (harness) =>
    harness === 'codex'
      ? routerDesc.replaceAll(`/${FIRMO_SKILL_NAME}`, `$${FIRMO_SKILL_NAME}`)
      : routerDesc;
  const catalogForHarness = (harness) =>
    TOOL_GROUPS.map((group) => {
      const lines = [`### ${group.title}`];
      if (group.when) lines.push(`_${group.when}_`);
      lines.push('');
      for (const name of group.tools) {
        const t = tools.find((x) => x.name === name);
        lines.push(`- \`${skillInvocation(harness, name)}\` — ${t.catalogHint}`);
      }
      return lines.join('\n');
    }).join('\n\n');

  // Static autocomplete hint for the `<tool>` argument, kept in sync with EXPOSED_TOOLS.
  const argumentHint = `[${EXPOSED_TOOLS.join('|')}]`;

  // --- Per-harness output ---

  for (const harness of ['claude', 'codex']) {
    const skillDir = harness === 'claude' ? CLAUDE_SKILL_DIR : CODEX_SKILL_DIR;

    // Router SKILL.md
    const routerBody = renderBody(
      routerBodyRaw.replace(/\{\{TOOL_CATALOG\}\}/g, catalogForHarness(harness)),
      harness,
      {
        ...refConfig,
        context: 'SKILL.md',
      },
    );
    const routerContent = [
      '---',
      `name: ${routerName}`,
      `description: "${routerDescForHarness(harness)}"`,
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

    // Lazy-loaded shared fragments (#99): each deferred fragment is shipped once
    // per harness as shared/<name>.md so a tool's load pointer resolves. Rendered
    // through the same pipeline as a tool body (nested eager includes, version,
    // refs/ask).
    if (lazyFragments.size > 0) {
      mkdirSync(join(skillDir, 'shared'), { recursive: true });
      for (const name of lazyFragments) {
        const fragPath = join(SHARED_DIR, `${name}.md`);
        if (!existsSync(fragPath)) {
          throw new Error(`lazy-include fragment source not found: ${fragPath}`);
        }
        const rawFrag = resolveIncludes(
          normalizeLineEndings(readFileSync(fragPath, 'utf8')),
        ).replace(/\{\{VERSION\}\}/g, VERSION_STRING);
        writeFileSync(
          join(skillDir, 'shared', `${name}.md`),
          renderBody(rawFrag, harness, { ...refConfig, context: `shared/${name}.md` }),
        );
      }
    }

    // Agents (nested subagents)
    for (const a of agents) {
      const context = `agents/${a.name}.md`;
      if (harness === 'claude') {
        const claudeModel = getNested(a.fm, 'claude', 'model', { context });
        const claudeColor = getNested(a.fm, 'claude', 'color', { context });
        const claudeTools = getNestedArray(a.fm, 'claude', 'tools', { context });
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

  // --- Guard: every lazy-loaded fragment is shipped for BOTH harnesses (#99) ---
  // A tool's load pointer ("Lies `shared/<name>.md` …") must resolve on Claude
  // Code and Codex alike, so the fragment file has to exist in both skill dirs.
  for (const name of lazyFragments) {
    for (const [harness, skillDir] of [
      ['claude', CLAUDE_SKILL_DIR],
      ['codex', CODEX_SKILL_DIR],
    ]) {
      const shipped = join(skillDir, 'shared', `${name}.md`);
      if (!existsSync(shipped)) {
        throw new Error(
          `lazy-include guard (#99): fragment "${name}" is referenced but not shipped for ${harness} (${shipped})`,
        );
      }
    }
  }

  // --- Context budget report + guard (#99) ---
  // The largest tools keep their always-loaded core — the built tool file, which
  // no longer inlines the mode-gated fragments — under a documented line budget.
  // A routine invocation that never reaches a deferred mode loads only this core.
  // See docs/developer-guide/build-system.md ("Progressive Disclosure").
  const CONTEXT_BUDGET_MAX_LINES = 700;
  const BUDGET_TOOLS = ['build', 'fix', 'docs', 'review', 'plan'];
  budgetReport = BUDGET_TOOLS.map((name) => {
    const built = readFileSync(join(CLAUDE_SKILL_DIR, 'tools', `${name}.md`), 'utf8');
    return { name, lines: built.split('\n').length };
  });
  const overBudget = budgetReport.filter((r) => r.lines > CONTEXT_BUDGET_MAX_LINES);
  if (overBudget.length > 0) {
    throw new Error(
      `context budget (#99): always-loaded tool core exceeds the ${CONTEXT_BUDGET_MAX_LINES}-line budget: ` +
        overBudget.map((r) => `${r.name} (${r.lines})`).join(', '),
    );
  }

  // --- Version-drift guard: Claude and Codex router carry the same version ---

  const claudeRouter = readFileSync(join(CLAUDE_SKILL_DIR, 'SKILL.md'), 'utf8');
  const codexRouter = readFileSync(join(CODEX_SKILL_DIR, 'SKILL.md'), 'utf8');
  if (!claudeRouter.includes(VERSION_STRING) || !codexRouter.includes(VERSION_STRING)) {
    throw new Error(`version drift — expected "${VERSION_STRING}" in both router outputs`);
  }

  // --- Docs handoff guard: the user guide must document an executable Plan->Build
  // handoff and keep maintain out of the shared plan-reference contract (#107). ---

  const gettingStarted = readFileSync(join(DOCS_USER_GUIDE, 'getting-started.md'), 'utf8');
  if (!/\/effective-flow build docs\/plan\//.test(gettingStarted)) {
    throw new Error(
      'docs guard (#107): getting-started.md must show the Plan->Build handoff passing an ' +
        'explicit plan path (e.g. `/effective-flow build docs/plan/<datei>`), not a bare build call',
    );
  }

  const umsetzen = readFileSync(join(DOCS_USER_GUIDE, 'tools-implement.md'), 'utf8');
  const sharedGroup = umsetzen.match(/Tools\s*\(([^)]*?)\)\s*share the same base pattern/);
  if (!sharedGroup) {
    throw new Error(
      'docs guard (#107): tools-implement.md is missing the shared plan-reference intro sentence ' +
        '("… Tools (…) share the same base pattern")',
    );
  }
  for (const tool of ['build', 'fix', 'refactor', 'docs']) {
    if (!sharedGroup[1].includes(tool)) {
      throw new Error(
        `docs guard (#107): "${tool}" must be listed in the shared plan-reference group in tools-implement.md`,
      );
    }
  }
  for (const tool of ['maintain', 'apply', 'iterate']) {
    if (sharedGroup[1].includes(tool)) {
      throw new Error(
        `docs guard (#107): "${tool}" must not be in the shared plan-reference group in ` +
          'tools-implement.md (it has no plan-file input / is a router or continuation tool)',
      );
    }
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

process.stdout.write(`Built ${FIRMO_SKILL_NAME} skill:\n`);
process.stdout.write(
  `  Claude Code: ${exposedCount} tools (+${internalCount} internal) -> dist/claude/${FIRMO_SKILL_NAME}/, ${agents.length} agents -> dist/claude/agents/${CLAUDE_AGENT_PREFIX}*.md\n`,
);
process.stdout.write(
  `  Codex:       ${exposedCount} tools (+${internalCount} internal), ${agents.length} agents -> dist/codex/${FIRMO_SKILL_NAME}/\n`,
);
if (budgetReport.length > 0) {
  const sizes = budgetReport.map((r) => `${r.name} ${r.lines}`).join(', ');
  process.stdout.write(`  Always-loaded core (lines, budget 700): ${sizes}\n`);
}
