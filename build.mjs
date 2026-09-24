#!/usr/bin/env node

import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  rmSync,
  renameSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import { join, basename, dirname, relative, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import process from 'node:process';
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
  normalizeClaudeEffort,
  normalizeCodexReasoningEffort,
  validateAgentProfileMappings,
  validateRefs,
  assertQuotedDescription,
  renderBody,
  renderDeprecatedAliasClause,
  missingCategoryReadmes,
  README_MANDATORY_CATEGORIES,
  findSelfReferentialContractPhrases,
  resolveLazyIncludes,
  resolveEagerIncludes,
  assertNoUnresolvedEagerIncludes,
  assertNoUnresolvedLazyIncludes,
  assertNoUnresolvedPlaceholders,
  collectIncludeNames,
  assertNoEagerLazyOverlap,
  assertDocumentationSyncConsumers,
  findRuntimeStateSafetyViolations,
  findRuntimeDirMigrationViolations,
  findMemoryStateContractViolations,
  collectRenderedWorkerRefs,
  findProhibitedConsumerScriptCommands,
  findRetiredConfigDocViolations,
  findStaleAdrContractClaims,
  findStaleBrandReferences,
  findForeignHarnessToolParameters,
  findRemoteTrackerRecipeViolations,
  parseProjectRoutingTable,
  assertProjectRoutingContract,
  parseExecutionProfileContract,
  assertExecutionProfileContract,
  assertPilotMeasurementPolicyProjection,
  parsePilotMeasurementDocumentationProjection,
  assertPilotMeasurementDocumentationProjection,
  parseNextStepsTable,
  assertNextStepsContract,
  findNextStepsDocViolations,
  parseSkillOwnershipManifest,
  parseSkillOwnershipTable,
  assertDisjointConsumerNames,
  collectRecommendedSkillChains,
  collectRecommendedSkillSections,
  parseSkillOwnershipRelevanceGateOwners,
  assertSkillOwnershipContract,
  assertAgentSkillRecommendationRoster,
  parseNativeAgentInventory,
  reconcileNativeAgentInventories,
} from './build-lib.mjs';

const ROOT_DIR = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = join(ROOT_DIR, 'src');
const SHARED_DIR = join(SOURCE_DIR, 'shared');
const TOOLS_DIR = join(SOURCE_DIR, 'tools');
const AGENTS_DIR = join(SOURCE_DIR, 'agents');
const RUNTIME_SCRIPTS_DIR = join(SOURCE_DIR, 'scripts');
const ROUTER_SRC = join(SOURCE_DIR, 'SKILL.md');
const LICENSE_SRC = join(ROOT_DIR, 'LICENSE');
// Allowlist of the dependency-free runtime scripts shipped into every target.
// A script absent from this list is never copied, whichever subsystem owns it.
const RUNTIME_SCRIPT_FILES = [
  'delegation-envelope.mjs',
  'delegation-envelope-core.mjs',
  'delivery-selection.mjs',
  'delivery-selection-core.mjs',
  'remote-tracker.mjs',
  'remote-tracker-core.mjs',
  'remote-tracker-shared-core.mjs',
  'remote-tracker-decomposition-core.mjs',
  'remote-tracker-forgejo-core.mjs',
  'remote-tracker-github-core.mjs',
  'remote-tracker-ledger-core.mjs',
  'pilot-measurement.mjs',
  'pilot-measurement-core.mjs',
  'pilot-measurement-protocol.mjs',
];

// Hand-maintained user guide (not generated from src/). A content guard below
// protects the canonical Plan->Build handoff examples against regression (#107).
const DOCS_USER_GUIDE = join(ROOT_DIR, 'docs', 'user-guide');
const SKILL_OWNERSHIP_MANIFEST = join(ROOT_DIR, 'docs', 'developer-guide', 'skill-ownership.json');
const SKILL_OWNERSHIP_GUIDE = join(ROOT_DIR, 'docs', 'developer-guide', 'skill-ownership.md');
const RELEVANCE_GATE_SOURCE = join(SHARED_DIR, 'central-reasoning-delegation.md');

// The build writes into a temporary tree and swaps it onto dist/ only after a
// fully successful build (see the atomic swap below), so dist/ is always either
// entirely the previous build or entirely the new one — never a half-written
// mix left behind by a mid-build throw.
//
// Where that tree lands is overridable, because the swap goes through fixed
// `dist.tmp` and `dist.bak` paths: two builds of the same checkout running at
// once collide on them and one of them dies mid-rename. That is not
// hypothetical — `pnpm test` runs its files concurrently, and more than one of
// them needs a build of its own. A caller that cannot afford to contend for
// `dist/` sets EFFECTIVE_FLOW_BUILD_OUTPUT_ROOT and gets the same three
// directories under a root of its choosing. Unset, which is every ordinary
// build, nothing about the layout changes.
const OUTPUT_ROOT = process.env.EFFECTIVE_FLOW_BUILD_OUTPUT_ROOT
  ? resolve(process.env.EFFECTIVE_FLOW_BUILD_OUTPUT_ROOT)
  : ROOT_DIR;
const DIST_ROOT = join(OUTPUT_ROOT, 'dist');
const DIST_TMP = join(OUTPUT_ROOT, 'dist.tmp');
const DIST_BAK = join(OUTPUT_ROOT, 'dist.bak');

const SKILL_NAME = 'effective-flow';
const DIST_CODEX = join(DIST_TMP, 'codex');
const DIST_CLAUDE = join(DIST_TMP, 'claude');
const DIST_PORTABLE = join(DIST_TMP, 'portable');
const CODEX_SKILL_DIR = join(DIST_CODEX, SKILL_NAME);
const CLAUDE_SKILL_DIR = join(DIST_CLAUDE, SKILL_NAME);
const PORTABLE_SKILL_DIR = join(DIST_PORTABLE, SKILL_NAME);
// Native agents ship separately from the skill and are registered into each
// harness's discovery directory by the direct installer. The shared namespace
// avoids collisions and is also used by portable worker-contract identifiers.
const CLAUDE_AGENTS_DIR = join(DIST_CLAUDE, 'agents');
const CODEX_AGENTS_DIR = join(DIST_CODEX, 'agents');
const PORTABLE_WORKERS_DIR = join(PORTABLE_SKILL_DIR, 'workers');
const AGENT_PREFIX = 'effective-flow-';
const FAST_PROFILE_DESCRIPTION_SUFFIX =
  ' Fast-profile variant; use only for the first eligible implementation attempt.';
const AGENT_PROFILE_MAPPINGS = Object.freeze({
  fast: Object.freeze({
    claude: Object.freeze({ model: 'sonnet', effort: 'medium' }),
    codex: Object.freeze({ model: 'gpt-5.6-luna', reasoning_effort: 'medium' }),
  }),
});
const ROUTE_PROFILE_CLASSIFICATION_ENTRIES = Object.freeze([
  Object.freeze(['excluded-generated-vendored', 'non-implementation']),
  Object.freeze(['documentation', 'quality-only-implementation']),
  Object.freeze(['tooling', 'fast-capable']),
  Object.freeze(['frontend-js-ts', 'fast-capable']),
  Object.freeze(['node-backend-cli', 'fast-capable']),
  Object.freeze(['rust', 'fast-capable']),
  Object.freeze(['generic-product', 'fast-capable']),
  Object.freeze(['ambiguous', 'non-implementation']),
]);
const FAST_CAPABLE_ROUTE_IDS = Object.freeze([
  'tooling',
  'frontend-js-ts',
  'node-backend-cli',
  'rust',
  'generic-product',
]);

// The tools exposed via `/effective-flow <tool>`, grouped by user intent. The router
// catalog renders these groups (title + optional "when" line + tools); the flat
// `EXPOSED_TOOLS` order equals the concatenation of the groups in order.
// Orchestrator/utility skills whose mapped name is not listed here are treated
// as internal (built as tool files, but not shown in the router catalog).
// A tool's usage-oriented one-line `catalogHint` (frontmatter) is what the
// catalog shows per line; see the catalogHint guard below.
const TOOL_GROUPS = [
  {
    title: 'Understand what to do',
    when: 'Analysis & planning before code',
    tools: ['concept', 'investigate', 'plan', 'open-plans', 'plan-issue'],
  },
  {
    title: 'Implement a change',
    when: 'from a clarified plan/issue to code',
    tools: ['apply', 'build', 'fix', 'refactor', 'docs', 'maintain', 'iterate'],
  },
  {
    title: 'Ensure quality',
    tools: ['review'],
  },
  {
    title: 'Deliver changes',
    tools: ['deliver', 'commit', 'pr', 'merge-gate'],
  },
  {
    title: 'Set up & info',
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

// Retired tool names that stay invocable for one generation, each forwarding to
// the tool that replaced it. An alias is declared here instead of being listed
// in TOOL_GROUPS on purpose: TOOL_GROUPS drives the router catalog, the
// catalogHint guard, and the `argument-hint`, so listing an alias there would
// advertise the retired name again. Declared rather than implicit, because the
// router routes an unlisted name to the catalog — the rendered dispatch clause
// derived from this list is what makes the old name route at all. An entry is
// removed with the next deliberate major release.
const DEPRECATED_TOOL_ALIASES = [{ alias: 'pr-review', replacement: 'merge-gate' }];

// Guard: an alias is reachable by name only. It must never be an exposed tool
// (that would put the retired name back into the catalog and the autocomplete),
// and it must forward to a tool that is actually invocable.
{
  const exposed = new Set(EXPOSED_TOOLS);
  for (const { alias, replacement } of DEPRECATED_TOOL_ALIASES) {
    if (exposed.has(alias)) {
      process.stderr.write(
        `ERROR: deprecated alias "${alias}" must not be listed in TOOL_GROUPS/EXPOSED_TOOLS\n`,
      );
      process.exit(1);
    }
    if (!exposed.has(replacement)) {
      process.stderr.write(
        `ERROR: deprecated alias "${alias}" forwards to "${replacement}", which is not an exposed tool\n`,
      );
      process.exit(1);
    }
  }
}

// Tools outside the next-steps emission contract. Every other `src/tools/*.md`
// must lazily load the fragment and carry at least one row in its table, so the
// emitting set is `count(src/tools/*.md) - |exemptions|` and a newly added tool
// has to opt in or out deliberately instead of silently shipping without a
// recommendation. Each entry names the reason it can never be the run the user
// is looking at when it ends.
const NEXT_STEPS_EXEMPT_TOOLS = new Set([
  'version', // informational output; there is no run state to continue from
  'pr-review', // deprecated forwarder; the tool it forwards to emits
  'apply-plan', // not user-invocable (src/SKILL.md); its end states live on `apply`
  'apply-review', // not user-invocable; its end states live on `apply`
  'apply-issues', // not user-invocable; its end states live on `apply`
  'plan-review', // not user-invocable; its end states live on `review` and `plan`
  'concept-review', // not user-invocable; its end states live on `review` and `concept`
  'apply-review-remote', // internal sub-file of apply-review with no completion phase
  'apply-review-commit-mechanics', // internal sub-file of apply-review with no completion phase
]);

// Agents outside the central-skill recommendation contract. Every other
// `src/agents/*.md` must carry a `## Recommended skills` section, so the
// obligated set is `count(src/agents/*.md) - |exemptions|` and a newly added
// agent has to name its domain owner or opt out deliberately instead of
// silently shipping a second copy of a centrally owned playbook. The set covers
// agents only: `src/shared/skill-discovery.md` states that a missing section is
// legitimate for a tool, and tools such as `version` or `cleanup` have no domain
// owner to name. Each entry names the reason no central skill owns its work.
const SKILL_RECOMMENDATION_EXEMPT_AGENTS = new Set([
  // resolving a merge conflict has no declared central domain owner; the role
  // carries that rationale in its own source prose
  'merge-conflict-resolver',
]);

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
//
// It is also overridable, and for a reason that is not cosmetic at all. Because
// the hash changes with every commit, so does every built artifact — which makes
// the output unusable as an identity for anything that outlives one commit. The
// behavioural eval suite hashes the built skill to bind its recorded runs to the
// gate they exercised; with a moving hash in the tree, committing that evidence
// changes the very thing it claims to describe, and it can never validate. A
// caller that needs a commit-independent build sets
// EFFECTIVE_FLOW_BUILD_GIT_HASH to a fixed marker. Ordinary builds set nothing
// and keep stamping the real hash.
let GIT_SHORT_HASH = process.env.EFFECTIVE_FLOW_BUILD_GIT_HASH;
if (!GIT_SHORT_HASH) {
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

// --- Guard: developer-only scripts never become consumer install commands ---
// README.md and all user-guide Markdown files are delivered to the default
// branch. Plain filename mentions remain valid; executable local commands do
// not, because manager installation consumes the built default-branch payload.
{
  const markdownFiles = [join(ROOT_DIR, 'README.md')];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith('.md')) markdownFiles.push(path);
    }
  };
  visit(DOCS_USER_GUIDE);

  const violations = markdownFiles.flatMap((file) =>
    findProhibitedConsumerScriptCommands(readFileSync(file, 'utf8')).map((hit) => ({
      file: relative(ROOT_DIR, file),
      ...hit,
    })),
  );
  if (violations.length > 0) {
    process.stderr.write(
      'ERROR: consumer docs guard (#160): developer-only scripts must not be executable install commands:\n' +
        violations.map(({ file, line, command }) => `  ${file}:${line}: ${command}`).join('\n') +
        '\n',
    );
    process.exit(1);
  }
}

// --- Guard: retired config paths stay confined to migration documentation ---
// The living project-setup ADR is the only current configuration interface.
// Scan the hand-maintained consumer sources recursively so stale operational
// `.effective-flow/config.json` instructions cannot reach the delivery branch.
{
  const markdownFiles = [join(ROOT_DIR, 'README.md')];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith('.md')) markdownFiles.push(path);
    }
  };
  visit(DOCS_USER_GUIDE);

  const violations = markdownFiles.flatMap((file) =>
    findRetiredConfigDocViolations(relative(ROOT_DIR, file), readFileSync(file, 'utf8')),
  );
  if (violations.length > 0) {
    process.stderr.write(
      'ERROR: delivery docs config guard (#166): retired config references are allowed only in explicit migration sections:\n' +
        violations
          .map(({ file, line, kind, reference }) => `  ${file}:${line}: ${kind}: ${reference}`)
          .join('\n') +
        '\n',
    );
    process.exit(1);
  }
}

// --- Guard: current ADR guidance follows the effective-product ownership contract ---
// The central skill discovers and follows this repository's living ADR
// convention. Scan only current normative/contributor guidance: archived plans
// remain historical records and are intentionally outside this guard's scope.
{
  const guidanceFiles = [
    join(ROOT_DIR, 'AGENTS.md'),
    join(ROOT_DIR, 'docs', 'developer-guide', 'configuration.md'),
    join(ROOT_DIR, 'docs', 'developer-guide', 'skill-ownership.md'),
    join(ROOT_DIR, 'src', 'shared', 'adr-convention.md'),
    // Added when the fragment below gained its relationship paragraph. A word-ban in
    // `test/workflow-contracts.test.mjs` previously kept `effective-product` out of it precisely
    // because the guard could not see it; scanning it is the restoration of that property, not its
    // removal.
    join(ROOT_DIR, 'src', 'shared', 'project-adr-convention.md'),
  ];
  const violations = guidanceFiles.flatMap((file) =>
    findStaleAdrContractClaims(readFileSync(file, 'utf8')).map((hit) => ({
      file: relative(ROOT_DIR, file),
      ...hit,
    })),
  );
  if (violations.length > 0) {
    process.stderr.write(
      'ERROR: ADR ownership-contract guard (#167): current guidance must describe the living ADR model as a declared repository convention followed by effective-product:\n' +
        violations
          .map(({ file, line, kind, claim }) => `  ${file}:${line}: ${kind}: ${claim}`)
          .join('\n') +
        '\n',
    );
    process.exit(1);
  }
}

// --- Guard: the retired brand never returns to the sources ---
// The `firmo` -> `effective-flow` rename left the capitalized brand behind in
// prose, where nothing marked it as stale. Scan every hand-written source so a
// capitalized leftover, in prose or in an all-caps build token, fails the build
// instead of shipping; the lowercase `firmo-` label prefix and `.firmo/` legacy
// paths are live read compatibility and stay untouched. The two build scripts
// are in scope alongside `src/`: a guard blind to its own host file is how the
// first leftover survived here, in a comment naming the product. They stay
// clean on the marker exemption, not on being skipped. Like the neighbouring
// literal scans this reports every offender and exits, rather than throwing on
// the first one, so one build names the full list.
{
  const sourceFiles = [join(ROOT_DIR, 'build.mjs'), join(ROOT_DIR, 'build-lib.mjs')];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && /\.(?:md|mjs|json)$/.test(entry.name)) sourceFiles.push(path);
    }
  };
  visit(SOURCE_DIR);

  // Normative documentation is in scope alongside the sources, enumerated like
  // the ADR ownership-contract guard above rather than walked from `docs/`, so
  // the excluded neighbours stay excluded on purpose and nobody "completes" the
  // list later:
  //   - `docs/plan/` including its archive: plans are historical records and
  //     legitimately quote the retired brand, down to their file names;
  //   - `docs/review/`: the architecture review carries the retired brand as
  //     the subject of its finding F-02;
  //   - shell scripts such as `local-common.sh`: they read the frozen legacy
  //     repository environment alias, whose name carries the brand in capitals.
  // Normative documents that sit outside those directories are enumerated
  // individually here.
  sourceFiles.push(
    join(ROOT_DIR, 'AGENTS.md'),
    join(ROOT_DIR, 'README.md.src'),
    join(ROOT_DIR, 'README.md'),
    join(ROOT_DIR, 'docs', 'readme-theme.md'),
  );
  for (const directory of [
    join(ROOT_DIR, 'docs', 'adr'),
    join(ROOT_DIR, 'docs', 'developer-guide'),
    DOCS_USER_GUIDE,
  ]) {
    visit(directory);
  }

  // A file name carries the brand just as publicly as the prose inside it, so
  // scan it too -- separately, because the scanner reports 1-based line numbers
  // and prepending the name to the content would shift every content hit by one
  // line. A name hit is reported as its own kind instead of a line number.
  const violations = sourceFiles.flatMap((file) => {
    const path = relative(ROOT_DIR, file);
    return [
      ...findStaleBrandReferences(basename(file)).map(({ reference }) => ({
        file: path,
        kind: 'file name',
        reference,
      })),
      ...findStaleBrandReferences(readFileSync(file, 'utf8')).map(({ line, reference }) => ({
        file: path,
        line,
        reference,
      })),
    ];
  });
  if (violations.length > 0) {
    process.stderr.write(
      'ERROR: stale brand guard: src/, the build scripts and the normative documentation name the product "Effective Flow"; the frozen backcompat marker "**Firmo project setup:**" is the only permitted occurrence:\n' +
        violations
          .map(({ file, line, kind, reference }) =>
            kind ? `  ${file}: ${kind}: ${reference}` : `  ${file}:${line}: ${reference}`,
          )
          .join('\n') +
        '\n',
    );
    process.exit(1);
  }
}

// --- Clean and (re)create the temporary output tree ---

rmSync(DIST_TMP, { recursive: true, force: true });
rmSync(DIST_BAK, { recursive: true, force: true });
// Native skill payloads are separate from their registered agent sidecars.
mkdirSync(join(CODEX_SKILL_DIR, 'tools'), { recursive: true });
mkdirSync(CODEX_AGENTS_DIR, { recursive: true });
mkdirSync(join(CLAUDE_SKILL_DIR, 'tools'), { recursive: true });
mkdirSync(CLAUDE_AGENTS_DIR, { recursive: true });
// Managers receive one harness-neutral skill with bundled worker contracts.
mkdirSync(join(PORTABLE_SKILL_DIR, 'tools'), { recursive: true });
mkdirSync(PORTABLE_WORKERS_DIR, { recursive: true });

// Runtime prompts delegate provider mechanics to the shipped helper. Keep raw
// CLI/API recipes and runtime flag discovery out of tool/shared Markdown.
{
  const violations = [];
  for (const directory of [TOOLS_DIR, SHARED_DIR, AGENTS_DIR]) {
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.md'))) {
      const path = join(directory, file);
      for (const hit of findRemoteTrackerRecipeViolations(readFileSync(path, 'utf8'))) {
        violations.push(`${relative(ROOT_DIR, path)}:${hit.line}: ${hit.kind}: ${hit.text}`);
      }
    }
  }
  for (const hit of findRemoteTrackerRecipeViolations(readFileSync(ROUTER_SRC, 'utf8'))) {
    violations.push(`${relative(ROOT_DIR, ROUTER_SRC)}:${hit.line}: ${hit.kind}: ${hit.text}`);
  }
  if (violations.length > 0) {
    process.stderr.write(
      `ERROR: remote-tracker recipe guard (#169): runtime prompts must delegate deterministic transport mechanics to scripts/remote-tracker.mjs:\n${violations.join('\n')}\n`,
    );
    process.exit(1);
  }
}

// --- Dependency-free runtime guard ---
// The patterns below are a text scan, not a parser, so their limits are worth
// stating. They see a static `import`/`export … from '<specifier>'` including a
// multi-line clause, a side-effect `import '<specifier>'`, and a dynamic
// `import('<specifier>')`. A static form has to open a statement — file start,
// newline, `;` or `}` — and the span before the specifier may cross neither a
// quote nor a parenthesis; that is what keeps prose out of the results, because
// a comment quoting a phrase after the word "from" never opens a statement.
// (An unanchored `from\s+['"]…['"]` scan did match such comments, since `\s`
// crosses newlines.) What the scan does not see: a specifier assembled at
// runtime (`import(name)`, a template literal) or reached through
// `createRequire`. A script needing either has to be checked by hand.
const STATIC_IMPORT_SPECIFIER =
  /(?:^|[\n;}])\s*(?:import|export)\b[^'";()]*\bfrom\s*['"]([^'"\n]+)['"]/g;
const SIDE_EFFECT_IMPORT_SPECIFIER = /(?:^|[\n;}])\s*import\s*['"]([^'"\n]+)['"]/g;
const DYNAMIC_IMPORT_SPECIFIER = /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;

for (const file of RUNTIME_SCRIPT_FILES) {
  const path = join(RUNTIME_SCRIPTS_DIR, file);
  if (!existsSync(path)) {
    process.stderr.write(`ERROR: runtime script source missing: ${path}\n`);
    process.exit(1);
  }
  const source = readFileSync(path, 'utf8');
  const imports = [
    ...source.matchAll(STATIC_IMPORT_SPECIFIER),
    ...source.matchAll(SIDE_EFFECT_IMPORT_SPECIFIER),
    ...source.matchAll(DYNAMIC_IMPORT_SPECIFIER),
  ].map((match) => match[1]);
  const thirdParty = imports.filter(
    (specifier) => !specifier.startsWith('node:') && !specifier.startsWith('./'),
  );
  if (thirdParty.length > 0) {
    process.stderr.write(
      `ERROR: runtime scripts must be dependency-free; ${file} imports ${thirdParty.join(', ')}\n`,
    );
    process.exit(1);
  }
}

// --- Include transforms (I/O; the pure transforms live in build-lib.mjs) ---

function resolveIncludes(body, context) {
  return resolveEagerIncludes(body, {
    context,
    readFragment(name) {
      const filePath = join(SHARED_DIR, `${name}.md`);
      if (!existsSync(filePath)) throw new Error(`include target not found: ${filePath}`);
      return readFileSync(filePath, 'utf8');
    },
  });
}

// --- Collect sources ---

const tools = []; // { name, description, body }
const agents = []; // { name, fm, body }
let budgetReport = []; // [{ name, lines, limit }] — always-loaded size of every tool (#99)
let fastProfileAgents = new Set();

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

  // Guard: no dead next-steps exemption. The emitting set is derived as
  // `tool sources - exemptions`, so an entry for a renamed or deleted tool would
  // not fail anywhere — it would silently keep the set one tool too small.
  for (const name of NEXT_STEPS_EXEMPT_TOOLS) {
    if (!knownTools.has(name)) {
      throw new Error(
        `stale next-steps exemption: NEXT_STEPS_EXEMPT_TOOLS lists "${name}", but src/tools/${name}.md does not exist`,
      );
    }
  }
  const refConfig = {
    // Reference rendering counts an alias as invocable: a deprecation notice
    // addressed to a user has to name the invocation, so `{{SKILL:<alias>}}`
    // must render as `/effective-flow <alias>` rather than as the internal
    // `tools/<alias>.md`. The catalog and the `argument-hint` below stay on the
    // pure EXPOSED_TOOLS, which is what keeps the retired name unadvertised.
    exposedTools: [...EXPOSED_TOOLS, ...DEPRECATED_TOOL_ALIASES.map((entry) => entry.alias)],
    agentPrefix: AGENT_PREFIX,
    skillName: SKILL_NAME,
    knownTools,
    knownAgents,
  };
  const renderGeneratedBody = (body, harness, config) => {
    const rendered = renderBody(body, harness, config);
    assertNoUnresolvedEagerIncludes(rendered, { context: `${config.context} (${harness})` });
    // A lazy fence is just as unshippable as an eager one: the delivered skill
    // never explains the directive, so a raw fence reads as inert prose and the
    // deferred fragment is silently skipped.
    assertNoUnresolvedLazyIncludes(rendered, { context: `${config.context} (${harness})` });
    return rendered;
  };

  // --- Central-skill ownership guard (#168) ---
  // Validate only Effective Flow's declared relationships. This guard reads no
  // upstream checkout, performs no network access, and treats provenance in the
  // manifest as informational rather than as a compatibility pin.
  for (const path of [SKILL_OWNERSHIP_MANIFEST, SKILL_OWNERSHIP_GUIDE, RELEVANCE_GATE_SOURCE]) {
    if (!existsSync(path)) {
      throw new Error(`Skill-ownership contract file not found: ${path}`);
    }
  }
  const ownershipManifest = parseSkillOwnershipManifest(
    readFileSync(SKILL_OWNERSHIP_MANIFEST, 'utf8'),
    { context: relative(ROOT_DIR, SKILL_OWNERSHIP_MANIFEST) },
  );
  const ownershipRows = parseSkillOwnershipTable(readFileSync(SKILL_OWNERSHIP_GUIDE, 'utf8'), {
    context: relative(ROOT_DIR, SKILL_OWNERSHIP_GUIDE),
  });
  const toolRecommendationSources = toolFiles.map((file) => ({
    consumer: basename(file, '.md'),
    context: `tools/${file}`,
    text: readFileSync(join(TOOLS_DIR, file), 'utf8'),
  }));
  const agentRecommendationSources = agentFiles.map((file) => ({
    consumer: basename(file, '.md'),
    context: `agents/${file}`,
    text: readFileSync(join(AGENTS_DIR, file), 'utf8'),
  }));
  const recommendationSources = [...toolRecommendationSources, ...agentRecommendationSources];
  // The ownership manifest and the pair keys inside assertSkillOwnershipContract
  // identify a consumer by bare name, so the two kinds must stay distinguishable
  // by name alone.
  assertDisjointConsumerNames(
    {
      toolNames: toolRecommendationSources.map((source) => source.consumer),
      agentNames: agentRecommendationSources.map((source) => source.consumer),
    },
    { context: 'central-skill ownership guard' },
  );
  const recommendationChains = collectRecommendedSkillChains(recommendationSources);
  // Roster guard: every agent either names its domain owner or is exempt. The
  // chains are collected from the agent sources alone so a same-named tool can
  // never satisfy an agent's obligation.
  assertAgentSkillRecommendationRoster(
    {
      agents: agentFiles.map((file) => basename(file, '.md')),
      sectionAgents: collectRecommendedSkillSections(agentRecommendationSources),
      recommendationChains: collectRecommendedSkillChains(agentRecommendationSources),
      exemptAgents: SKILL_RECOMMENDATION_EXEMPT_AGENTS,
      // What satisfies the roster is the manifest, not any parsed bullet: an
      // allowlisted external skill is a legitimate fallback but owns no domain,
      // so it must not stand in for the central owner.
      ownedSkills: new Set(
        ownershipManifest.relationships.map((relationship) => relationship.skill),
      ),
    },
    { context: 'agent skill-recommendation roster' },
  );
  const knownOwnershipConsumers = new Set([
    ...toolFiles.map((file) => basename(file, '.md')),
    ...agentFiles.map((file) => basename(file, '.md')),
    ...readdirSync(SHARED_DIR)
      .filter((file) => file.endsWith('.md'))
      .map((file) => basename(file, '.md')),
  ]);
  const relevanceGateOwners = parseSkillOwnershipRelevanceGateOwners(
    readFileSync(RELEVANCE_GATE_SOURCE, 'utf8'),
    { context: relative(ROOT_DIR, RELEVANCE_GATE_SOURCE) },
  );
  assertSkillOwnershipContract(
    {
      manifest: ownershipManifest,
      inventoryRows: ownershipRows,
      recommendationChains,
      relevanceGateOwners,
      knownConsumers: knownOwnershipConsumers,
      // Only tools and agents can carry a `## Recommended skills` section, so
      // the reverse check is limited to them; shared fragments are exempt by
      // kind. `knownOwnershipConsumers` above deliberately stays wider.
      recommendationCapableConsumers: new Set(
        recommendationSources.map((source) => source.consumer),
      ),
    },
    { context: 'central-skill ownership guard' },
  );

  // --- Shared project-routing contract guard (#164) ---
  // All project-aware workflows load this runtime contract. Parse and validate
  // its ordered table before rendering so missing fallback routes, reordered
  // priorities, or dead agent references fail every distribution build.
  const projectRoutingContext = 'shared/project-routing.md';
  const projectRoutingPath = join(SHARED_DIR, 'project-routing.md');
  if (!existsSync(projectRoutingPath)) {
    throw new Error(`Project-routing contract not found: ${projectRoutingPath}`);
  }
  const projectRoutingSource = normalizeLineEndings(readFileSync(projectRoutingPath, 'utf8'));
  const projectRoutes = parseProjectRoutingTable(projectRoutingSource, {
    context: projectRoutingContext,
  });
  assertProjectRoutingContract(projectRoutes, { context: projectRoutingContext });
  validateRefs(projectRoutingSource, {
    knownTools,
    knownAgents,
    context: projectRoutingContext,
  });

  const routeClassificationIds = new Set();
  for (const [routeId] of ROUTE_PROFILE_CLASSIFICATION_ENTRIES) {
    if (routeClassificationIds.has(routeId)) {
      throw new Error(`Duplicate execution-profile route classification for "${routeId}"`);
    }
    routeClassificationIds.add(routeId);
  }
  const routeProfileClassification = Object.freeze(
    Object.fromEntries(ROUTE_PROFILE_CLASSIFICATION_ENTRIES),
  );
  const classifiedRoutes = Object.keys(routeProfileClassification).sort();
  const actualRoutes = projectRoutes.map(({ route }) => route).sort();
  if (JSON.stringify(classifiedRoutes) !== JSON.stringify(actualRoutes)) {
    throw new Error(
      `Execution-profile route classification must cover every project route exactly once; classified=${classifiedRoutes.join(', ')} actual=${actualRoutes.join(', ')}`,
    );
  }
  const classifiedFastRoutes = Object.entries(routeProfileClassification)
    .filter(([, classification]) => classification === 'fast-capable')
    .map(([route]) => route)
    .sort();
  if (JSON.stringify(classifiedFastRoutes) !== JSON.stringify([...FAST_CAPABLE_ROUTE_IDS].sort())) {
    throw new Error(
      `Execution-profile Fast-capable routes must be exactly ${FAST_CAPABLE_ROUTE_IDS.join(', ')}`,
    );
  }
  const allowedRouteClassifications = new Set([
    'fast-capable',
    'quality-only-implementation',
    'non-implementation',
  ]);
  for (const route of projectRoutes) {
    const classification = routeProfileClassification[route.route];
    if (!allowedRouteClassifications.has(classification)) {
      throw new Error(`Unsupported execution-profile classification for route "${route.route}"`);
    }
    if (classification === 'non-implementation' && route.implementer !== '') {
      throw new Error(`Non-implementation route "${route.route}" must not name an implementer`);
    }
    if (classification === 'quality-only-implementation' && route.implementer === '') {
      throw new Error(`Quality-only route "${route.route}" must name an implementer`);
    }
  }
  fastProfileAgents = new Set(
    FAST_CAPABLE_ROUTE_IDS.map((routeId) => {
      const route = projectRoutes.find(({ route }) => route === routeId);
      const match = route?.implementer.match(/^\{\{AGENT:([a-z0-9]+(?:-[a-z0-9]+)*)\}\}$/);
      if (!match) {
        throw new Error(
          `Fast-capable route "${routeId}" must resolve to exactly one implementation worker`,
        );
      }
      return match[1];
    }),
  );
  if (fastProfileAgents.size !== FAST_CAPABLE_ROUTE_IDS.length) {
    throw new Error('Fast-capable routes must resolve to unique implementation workers');
  }
  for (const agent of fastProfileAgents) {
    if (!knownAgents.has(agent)) {
      throw new Error(`Fast-capable route resolves to unknown worker "${agent}"`);
    }
    if (knownAgents.has(`${agent}-fast`)) {
      throw new Error(`Generated Fast worker name collides with src/agents/${agent}-fast.md`);
    }
  }
  validateAgentProfileMappings(AGENT_PROFILE_MAPPINGS, {
    context: 'native execution-profile mappings',
  });
  refConfig.profileMappings = AGENT_PROFILE_MAPPINGS;
  refConfig.fastProfileAgents = fastProfileAgents;

  const profilePhaseAuthorizations = new Map([
    [
      'tools/build.md',
      {
        phase: 'Build Phase 2',
        startHeading: '### Phase 2: Implementation',
        endHeading: '### Phase 3: Documentation',
      },
    ],
    [
      'tools/refactor.md',
      {
        phase: 'Refactor Phase 3',
        startHeading: '### Phase 3: Refactoring',
        endHeading: '### Phase 3.5: Documentation sync',
      },
    ],
  ]);
  const profileSources = [
    { context: 'SKILL.md', text: readFileSync(ROUTER_SRC, 'utf8') },
    ...toolFiles.map((file) => ({
      context: `tools/${file}`,
      text: readFileSync(join(TOOLS_DIR, file), 'utf8'),
    })),
    ...agentFiles.map((file) => ({
      context: `agents/${file}`,
      text: readFileSync(join(AGENTS_DIR, file), 'utf8'),
    })),
    ...readdirSync(SHARED_DIR)
      .filter((file) => file.endsWith('.md'))
      .map((file) => ({
        context: `shared/${file}`,
        text: readFileSync(join(SHARED_DIR, file), 'utf8'),
      })),
  ];
  for (const source of profileSources) {
    const profileSourceText = normalizeLineEndings(source.text);
    const profileRefs = [...profileSourceText.matchAll(/\{\{AGENT_PROFILE:[^}]+\}\}/g)];
    if (profileRefs.length === 0) continue;
    const authorization = profilePhaseAuthorizations.get(source.context);
    if (!authorization) {
      throw new Error(
        `Fast-profile references are allowed only in tools/build.md and tools/refactor.md; found one in ${source.context}`,
      );
    }

    const headingOffsets = (heading) => {
      const offsets = [];
      let offset = 0;
      for (const line of profileSourceText.split('\n')) {
        if (line === heading) offsets.push({ start: offset, end: offset + line.length });
        offset += line.length + 1;
      }
      if (offsets.length !== 1) {
        throw new Error(
          `${authorization.phase} authorization requires exactly one "${heading}" heading in ${source.context}`,
        );
      }
      return offsets[0];
    };
    const phaseStart = headingOffsets(authorization.startHeading);
    const phaseEnd = headingOffsets(authorization.endHeading);
    if (phaseStart.end >= phaseEnd.start) {
      throw new Error(
        `${authorization.phase} authorization headings are out of order in ${source.context}`,
      );
    }
    for (const profileRef of profileRefs) {
      if (profileRef.index <= phaseStart.end || profileRef.index >= phaseEnd.start) {
        throw new Error(
          `Fast-profile references in ${source.context} are allowed only inside ${authorization.phase}`,
        );
      }
    }
    validateRefs(profileSourceText, { knownTools, knownAgents, context: source.context });
  }

  // --- Shared execution-profile contract guard ---
  // This Markdown policy remains canonical and workflow adoption stays absent.
  // Validate its closed tables and the shipped pilot runtime projection before
  // rendering so neither consumer can inherit a malformed or drifted contract.
  const executionProfileContext = 'shared/execution-profiles.md';
  const executionProfilePath = join(SHARED_DIR, 'execution-profiles.md');
  if (!existsSync(executionProfilePath)) {
    throw new Error(`Execution-profile contract not found: ${executionProfilePath}`);
  }
  const executionProfileSource = normalizeLineEndings(readFileSync(executionProfilePath, 'utf8'));
  const executionProfileContract = parseExecutionProfileContract(executionProfileSource, {
    context: executionProfileContext,
  });
  assertExecutionProfileContract(executionProfileContract, {
    context: executionProfileContext,
  });
  assertPilotMeasurementPolicyProjection(executionProfileContract, {
    context: `${executionProfileContext} ↔ scripts/pilot-measurement-protocol.mjs`,
  });

  const pilotProtocolGuideContext = 'docs/developer-guide/model-tiering-pilot-protocol.md';
  const pilotProtocolGuidePath = join(ROOT_DIR, pilotProtocolGuideContext);
  if (!existsSync(pilotProtocolGuidePath)) {
    throw new Error(`Pilot-measurement protocol guide not found: ${pilotProtocolGuidePath}`);
  }
  const pilotProtocolGuide = normalizeLineEndings(readFileSync(pilotProtocolGuidePath, 'utf8'));
  const pilotDocumentationProjection = parsePilotMeasurementDocumentationProjection(
    pilotProtocolGuide,
    { context: pilotProtocolGuideContext },
  );
  assertPilotMeasurementDocumentationProjection(pilotDocumentationProjection, {
    context: `${pilotProtocolGuideContext} ↔ scripts/pilot-measurement-protocol.mjs`,
  });

  // --- Shared next-steps contract guard ---
  // Every completed run closes with up to two concrete follow-up invocations,
  // taken from one canonical edge table. Validate the table, cross-check it in
  // both directions against the emitting tool set, and reconcile the mirrored
  // user-guide page before rendering, so a dead edge, a tool without a row, or a
  // drifted documentation table fails every distribution build. The emitting set
  // is derived here rather than in the per-file fence check below, because that
  // check runs later and cannot feed this cross-check.
  const nextStepsContext = 'shared/next-steps.md';
  const nextStepsPath = join(SHARED_DIR, 'next-steps.md');
  if (!existsSync(nextStepsPath)) {
    throw new Error(`Next-steps contract not found: ${nextStepsPath}`);
  }
  const nextStepsSource = normalizeLineEndings(readFileSync(nextStepsPath, 'utf8'));
  const nextStepsEdges = parseNextStepsTable(nextStepsSource, { context: nextStepsContext });
  const nextStepsEmittingTools = new Set(
    toolFiles
      .map((file) => basename(file, '.md'))
      .filter((name) => !NEXT_STEPS_EXEMPT_TOOLS.has(name)),
  );
  // The invocable set is EXPOSED_TOOLS, not the emitting set and not the alias-
  // widened `refConfig.exposedTools`: an edge is rendered as `/effective-flow
  // <name>` only for an exposed tool, and a retired alias must never be
  // recommended as the next step. Passing it explicitly stops the two sets from
  // agreeing merely by accident of the exemption list.
  assertNextStepsContract(nextStepsEdges, {
    emittingTools: nextStepsEmittingTools,
    invocableTools: new Set(EXPOSED_TOOLS),
    context: nextStepsContext,
  });
  // A fragment is otherwise ref-validated only through its consumers; this one
  // is validated directly so a dead edge target fails even before a tool loads it.
  validateRefs(nextStepsSource, {
    knownTools,
    knownAgents,
    context: nextStepsContext,
  });

  const toolFlowPath = join(DOCS_USER_GUIDE, 'tool-flow.md');
  if (!existsSync(toolFlowPath)) {
    throw new Error(
      `next-steps documentation mirror not found: ${relative(ROOT_DIR, toolFlowPath)} must mirror the ${nextStepsContext} table`,
    );
  }
  const toolFlowViolations = findNextStepsDocViolations(
    readFileSync(toolFlowPath, 'utf8'),
    nextStepsEdges,
    { context: relative(ROOT_DIR, toolFlowPath) },
  );
  if (toolFlowViolations.length > 0) {
    throw new Error(
      `next-steps documentation guard: ${relative(ROOT_DIR, toolFlowPath)} must mirror the ` +
        `${nextStepsContext} table, with every edge cell in its rendered invocation form:\n  ` +
        toolFlowViolations
          .map(
            ({ row, column, expected, actual }) =>
              `row ${row}, ${column}: expected "${expected}", found "${actual}"`,
          )
          .join('\n  '),
    );
  }

  // Shared fragments deferred via ```lazy-include across all sources; each is
  // shipped once per harness as shared/<name>.md (see the per-harness loop).
  const lazyFragments = new Set();
  const projectRoutingConsumers = new Set([
    'tools/build.md',
    'tools/fix.md',
    'tools/refactor.md',
    'tools/review.md',
    'tools/maintain.md',
    'tools/docs.md',
    'agents/generic-implementer.md',
    'agents/generic-product-implementer.md',
    'agents/generic-product-reviewer.md',
    'agents/merge-conflict-resolver.md',
    'agents/test-writer.md',
    'agents/code-validator.md',
    'agents/code-documenter.md',
    'agents/docs-writer.md',
  ]);

  // Runtime writers are derived from their ordered source instructions rather
  // than maintained in a second allowlist. Shared fragments are traversed at
  // their owning include position, so a parent or the fragment itself may load
  // the canonical guard before the first mutation.
  const runtimeStateSources = new Map();
  for (const file of toolFiles) {
    runtimeStateSources.set(
      `tools/${file}`,
      extractBody(normalizeLineEndings(readFileSync(join(TOOLS_DIR, file), 'utf8'))),
    );
  }
  for (const file of agentFiles) {
    runtimeStateSources.set(
      `agents/${file}`,
      extractBody(normalizeLineEndings(readFileSync(join(AGENTS_DIR, file), 'utf8'))),
    );
  }
  for (const file of readdirSync(SHARED_DIR)
    .filter((entry) => entry.endsWith('.md'))
    .sort()) {
    runtimeStateSources.set(
      `shared/${file}`,
      normalizeLineEndings(readFileSync(join(SHARED_DIR, file), 'utf8')),
    );
  }
  const runtimeStateViolations = findRuntimeStateSafetyViolations(runtimeStateSources);
  if (runtimeStateViolations.length > 0) {
    throw new Error(
      'runtime-state writer guard (#165): every operational mutation below `.effective-flow/` ' +
        'must follow the canonical runtime-state-safety contract:\n  ' +
        runtimeStateViolations
          .map(
            ({ context, line, reason, target, includeChain }) =>
              `${context}:${line}: ${reason} (${target}; via ${includeChain.join(' -> ')})`,
          )
          .join('\n  '),
    );
  }
  const runtimeDirMigrationViolations = findRuntimeDirMigrationViolations(runtimeStateSources);
  if (runtimeDirMigrationViolations.length > 0) {
    throw new Error(
      'runtime-directory migration guard (#174): every operational mutation below ' +
        '`.effective-flow/` must follow the canonical migration prerequisite:\n  ' +
        runtimeDirMigrationViolations
          .map(
            ({ context, line, reason, target, includeChain }) =>
              `${context}:${line}: ${reason} (${target}; via ${includeChain.join(' -> ')})`,
          )
          .join('\n  '),
    );
  }
  const deliveredRuntimeStateSources = new Map(
    [...runtimeStateSources].map(([context, body]) => [
      context,
      resolveIncludes(body, `${context} (delivered memory-state guard)`),
    ]),
  );
  const memoryStateViolations = findMemoryStateContractViolations(deliveredRuntimeStateSources, {
    delivered: true,
  });
  if (memoryStateViolations.length > 0) {
    throw new Error(
      'memory-state writer guard (#176): every `.effective-flow/memory.json` mutation must ' +
        'follow the shared lock/merge/atomic-replacement contract:\n  ' +
        memoryStateViolations
          .map(
            ({ context, line, reason, target, includeChain }) =>
              `${context}:${line}: ${reason} (${target}; via ${includeChain.join(' -> ')})`,
          )
          .join('\n  '),
    );
  }

  // Include names per read source; consumed by the documentation-sync guard
  // once every tool has been read.
  const sourceIncludes = new Map();
  const readSource = (dir, file, context) => {
    const content = normalizeLineEndings(readFileSync(join(dir, file), 'utf8'));
    const fm = extractFrontmatter(content);
    const rawBody = extractBody(content);
    // Guard: no fragment is both eager- and lazy-included in the same file.
    const { eager, lazy } = collectIncludeNames(rawBody);
    assertNoEagerLazyOverlap(eager, lazy, { context });
    sourceIncludes.set(context, { eager, lazy });
    if (
      projectRoutingConsumers.has(context) &&
      !eager.has('project-routing') &&
      !lazy.has('project-routing')
    ) {
      throw new Error(
        `project-routing consumer guard (#164): ${context} must include project-routing`,
      );
    }
    // Next-steps consumers are derived from the tool file list, not allowlisted:
    // an emitting tool defers the fragment (an eager include would spend the
    // whole table on every run), an exempt tool carries no pointer at all.
    if (dir === TOOLS_DIR) {
      const toolName = basename(file, '.md');
      if (NEXT_STEPS_EXEMPT_TOOLS.has(toolName)) {
        if (eager.has('next-steps') || lazy.has('next-steps')) {
          throw new Error(
            `next-steps exemption guard: ${context} is exempt and must not include next-steps`,
          );
        }
      } else if (!lazy.has('next-steps')) {
        throw new Error(
          `next-steps consumer guard: ${context} must lazily include next-steps or be listed in NEXT_STEPS_EXEMPT_TOOLS`,
        );
      }
    }
    // Eager includes inline now; each lazy include becomes a load pointer and is
    // recorded for shipping as a standalone shared/<name>.md fragment.
    const { body: withPointers, names } = resolveLazyIncludes(resolveIncludes(rawBody, context), {
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

  // --- Documentation-sync consumer guard ---
  // Keeping documentation in sync is a fixed phase of every implementation
  // tool. Removing the eager include from any consumer fails the build.
  assertDocumentationSyncConsumers(sourceIncludes);

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

  // Same for every deprecated alias: the router clause sends the retired name at
  // `tools/<alias>.md`, so that forwarding source has to be built.
  for (const { alias } of DEPRECATED_TOOL_ALIASES) {
    if (!builtToolNames.has(alias)) {
      throw new Error(`Deprecated tool alias "${alias}" has no matching skill source`);
    }
  }

  // --- Content guard: versioned frontend standards live only in the central
  // `effective-web` skill, never copied back into agent/tool sources (#104). A
  // versioned WCAG claim (e.g. "WCAG 2.1 AA") pins an evolving standard that the
  // delegate/route frontend agents must source from effective-web, so it must
  // not reappear here — otherwise Effective Flow carries a second, drifting
  // standards copy. Bare, unversioned mentions (e.g. "wende WCAG an") are
  // allowed. Descriptions flow into both harness outputs, so scan frontmatter
  // together with the body.
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
  const routerName = getField(routerFm, 'name') || SKILL_NAME;
  const routerDescRaw = getField(routerFm, 'description');

  // Guard: the description's tool list is generated, never hand-written. The
  // frontmatter description is the only catalog a harness sees before it loads
  // anything, so a tool missing from it is a tool nobody discovers by name --
  // and a hand-maintained list drifts silently from EXPOSED_TOOLS. Without this
  // guard someone can delete the placeholder, write the names out again, and
  // reintroduce exactly that drift.
  {
    const placeholders = routerDescRaw.match(/\{\{TOOL_LIST\}\}/g) ?? [];
    if (placeholders.length !== 1) {
      process.stderr.write(
        `ERROR: src/SKILL.md description must contain exactly one {{TOOL_LIST}} placeholder ` +
          `(found ${placeholders.length}); the tool list is generated from EXPOSED_TOOLS\n`,
      );
      process.exit(1);
    }
  }

  // The catalog a harness reads before loading anything, in EXPOSED_TOOLS order.
  // Deprecated aliases are excluded structurally: they are deliberately not part
  // of TOOL_GROUPS, so a retired name can never be advertised here.
  const routerDesc = routerDescRaw.replace(/\{\{TOOL_LIST\}\}/g, EXPOSED_TOOLS.join(', '));
  const routerBodyRaw = resolveIncludes(extractBody(routerRaw), 'SKILL.md').replace(
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
    harness === 'codex'
      ? `$${SKILL_NAME} ${name}`
      : harness === 'portable'
        ? `${SKILL_NAME} ${name}`
        : `/${SKILL_NAME} ${name}`;
  const routerDescForHarness = (harness) =>
    harness === 'codex'
      ? routerDesc.replaceAll(`/${SKILL_NAME}`, `$${SKILL_NAME}`)
      : harness === 'portable'
        ? routerDesc.replaceAll(`/${SKILL_NAME}`, SKILL_NAME)
        : routerDesc;
  const workerResolutionForHarness = (harness) => {
    if (harness === 'claude') {
      return `registered native Claude Code agents named \`${AGENT_PREFIX}<worker>\``;
    }
    if (harness === 'codex') {
      return `registered native Codex agents named \`${AGENT_PREFIX}<worker>\``;
    }
    return "bundled `workers/effective-flow-<worker>.md` contracts delegated through the host harness's built-in general-purpose subagent mechanism";
  };
  const invocationGuidanceForHarness = (harness) => {
    if (harness === 'claude') return '`/effective-flow <tool> [arguments]`';
    if (harness === 'codex') return '`$effective-flow <tool> [arguments]`';
    return [
      '- Claude Code: `/effective-flow <tool> [arguments]`',
      '- Codex: `$effective-flow <tool> [arguments]`',
      '',
      'The portable instructions below use `effective-flow <tool>` as harness-neutral notation; invoke the skill with the syntax of the active harness.',
    ].join('\n');
  };
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

  // Router dispatch clause for the retired names. Rendered from the declared
  // alias list through the same per-harness invocation helper as the catalog.
  const deprecatedAliasesForHarness = (harness) =>
    renderDeprecatedAliasClause(DEPRECATED_TOOL_ALIASES, (name) => skillInvocation(harness, name));

  // Static autocomplete hint for the `<tool>` argument, kept in sync with
  // EXPOSED_TOOLS. Deprecated aliases stay out: a user who types the old name is
  // still routed, but nothing suggests it.
  const argumentHint = `[${EXPOSED_TOOLS.join('|')}]`;

  // --- Lazy-fragment closure (#99) ---
  //
  // A shipped fragment goes through the same two-stage include resolution as a
  // tool body: eager includes inline, then every remaining ```lazy-include fence
  // — its own or one pulled in by an eager include — becomes a load pointer.
  // Skipping the second stage shipped the raw fence into shared/<name>.md, where
  // the directive means nothing to a worker.
  //
  // Resolving a fragment can name fragments no tool references directly, so the
  // walk is a worklist rather than one pass: a newly discovered name is queued
  // and shipped too, which is what makes its own pointer resolve. `seen` doubles
  // as the cycle guard the lazy path otherwise lacks (the eager resolver tracks
  // its own chain).
  //
  // The result is harness-neutral, so it is computed once here and only rendered
  // per target below — the same split as tool bodies, which readSource resolves
  // ahead of the per-consumer loop.
  const lazyFragmentBodies = new Map();
  const pendingFragments = [...lazyFragments];
  const seenFragments = new Set(pendingFragments);
  while (pendingFragments.length > 0) {
    const name = pendingFragments.shift();
    const fragPath = join(SHARED_DIR, `${name}.md`);
    if (!existsSync(fragPath)) {
      throw new Error(`lazy-include fragment source not found: ${fragPath}`);
    }
    const context = `shared/${name}.md`;
    const eager = resolveIncludes(normalizeLineEndings(readFileSync(fragPath, 'utf8')), context);
    const { body, names } = resolveLazyIncludes(eager, { context });
    for (const nested of names) {
      lazyFragments.add(nested);
      if (seenFragments.has(nested)) continue;
      seenFragments.add(nested);
      pendingFragments.push(nested);
    }
    lazyFragmentBodies.set(name, body.replace(/\{\{VERSION\}\}/g, VERSION_STRING));
  }

  // --- Per-consumer output ---

  for (const harness of ['claude', 'codex', 'portable']) {
    const skillDir =
      harness === 'claude'
        ? CLAUDE_SKILL_DIR
        : harness === 'codex'
          ? CODEX_SKILL_DIR
          : PORTABLE_SKILL_DIR;

    // Every independently installable skill carries the canonical repository license.
    copyFileSync(LICENSE_SRC, join(skillDir, 'LICENSE'));

    // Router SKILL.md
    const routerBody = renderGeneratedBody(
      routerBodyRaw
        .replace(/\{\{TOOL_CATALOG\}\}/g, catalogForHarness(harness))
        .replace(/\{\{DEPRECATED_ALIASES\}\}/g, deprecatedAliasesForHarness(harness))
        .replace(/\{\{WORKER_RESOLUTION\}\}/g, workerResolutionForHarness(harness))
        .replace(/\{\{INVOCATION_GUIDANCE\}\}/g, invocationGuidanceForHarness(harness)),
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

    // Dependency-free runtime helper, byte-identical in every consumer target.
    mkdirSync(join(skillDir, 'scripts'), { recursive: true });
    for (const file of RUNTIME_SCRIPT_FILES) {
      copyFileSync(join(RUNTIME_SCRIPTS_DIR, file), join(skillDir, 'scripts', file));
    }

    // Tools (exposed + internal), no frontmatter — loaded on demand by the router.
    for (const t of tools) {
      writeFileSync(
        join(skillDir, 'tools', `${t.name}.md`),
        renderGeneratedBody(t.body, harness, {
          ...refConfig,
          context: `tools/${t.name}.md`,
        }),
      );
    }

    // Lazy-loaded shared fragments (#99): each deferred fragment is shipped once
    // per harness as shared/<name>.md so a tool's load pointer resolves. Bodies
    // come from the closure above (nested eager includes, nested load pointers,
    // version); only the harness-specific rendering (refs/ask) happens here.
    if (lazyFragmentBodies.size > 0) {
      mkdirSync(join(skillDir, 'shared'), { recursive: true });
      for (const [name, fragBody] of lazyFragmentBodies) {
        writeFileSync(
          join(skillDir, 'shared', `${name}.md`),
          renderGeneratedBody(fragBody, harness, {
            ...refConfig,
            context: `shared/${name}.md`,
          }),
        );
      }
    }

    // Native sidecars or portable worker-contract resources.
    for (const a of agents) {
      const context = `agents/${a.name}.md`;
      if (harness === 'claude') {
        const claudeModel = getNested(a.fm, 'claude', 'model', { context });
        if (!claudeModel) {
          throw new Error(`Missing required claude model for ${a.name} (${context})`);
        }
        const claudeEffort = normalizeClaudeEffort(
          getNested(a.fm, 'claude', 'effort', { context }),
          a.name,
          context,
        );
        const claudeColor = getNested(a.fm, 'claude', 'color', { context });
        const claudeTools = getNestedArray(a.fm, 'claude', 'tools', { context });
        const agentDesc = cleanDescription(getField(a.fm, 'description')).replace(/"/g, '\\"');

        const claudeAgentName = `${AGENT_PREFIX}${a.name}`;
        let agentFm = '---\n';
        agentFm += `name: ${claudeAgentName}\n`;
        agentFm += `description: "${agentDesc}"\n`;
        if (claudeModel) agentFm += `model: ${claudeModel}\n`;
        agentFm += `effort: ${claudeEffort}\n`;
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
        const renderedBody = renderGeneratedBody(a.body, 'claude', { ...refConfig, context });
        const baseArtifact = agentFm + renderedBody;
        writeFileSync(join(CLAUDE_AGENTS_DIR, `${claudeAgentName}.md`), baseArtifact);

        if (fastProfileAgents.has(a.name)) {
          const fastName = `${claudeAgentName}-fast`;
          const fastDescription =
            `${cleanDescription(getField(a.fm, 'description'))}${FAST_PROFILE_DESCRIPTION_SUFFIX}`.replace(
              /"/g,
              '\\"',
            );
          const fastMapping = AGENT_PROFILE_MAPPINGS.fast.claude;
          let fastFm = '---\n';
          fastFm += `name: ${fastName}\n`;
          fastFm += `description: "${fastDescription}"\n`;
          fastFm += `model: ${fastMapping.model}\n`;
          fastFm += `effort: ${fastMapping.effort}\n`;
          if (claudeColor) fastFm += `color: ${claudeColor}\n`;
          if (claudeTools) {
            const toolList = claudeTools
              .split(',')
              .map((tool) => tool.trim())
              .filter(Boolean)
              .join(', ');
            fastFm += `tools: ${toolList}\n`;
          }
          fastFm += '---\n';
          const fastArtifact = fastFm + renderedBody;
          if (extractBody(fastArtifact) !== extractBody(baseArtifact)) {
            throw new Error(`Claude Fast worker body differs from its base worker: ${fastName}`);
          }
          writeFileSync(join(CLAUDE_AGENTS_DIR, `${fastName}.md`), fastArtifact);
        }
      } else if (harness === 'codex') {
        const codexModel = getNested(a.fm, 'codex', 'model', { context });
        const codexEffort = getNested(a.fm, 'codex', 'model_reasoning_effort', { context });
        if (!codexModel || !codexEffort) {
          throw new Error(`Missing required Codex model metadata for ${a.name} (${context})`);
        }
        normalizeCodexReasoningEffort(codexModel, codexEffort, a.name, context);
        const codexSandbox = normalizeCodexSandboxMode(
          getNested(a.fm, 'codex', 'sandbox_mode', { context }),
          a.name,
        );
        const tomlDesc = cleanDescription(getField(a.fm, 'description'));

        const codexAgentName = `${AGENT_PREFIX}${a.name}`;
        let toml = `name = ${tomlString(codexAgentName)}\n`;
        toml += `description = ${tomlString(tomlDesc)}\n`;
        toml += `model = ${tomlString(codexModel)}\n`;
        toml += `model_reasoning_effort = ${tomlString(codexEffort)}\n`;
        if (codexSandbox) toml += `sandbox_mode = ${tomlString(codexSandbox)}\n`;
        toml += `developer_instructions = '''\n${renderGeneratedBody(a.body, 'codex', { ...refConfig, context }).replace(/\n+$/, '')}\n'''\n`;
        writeFileSync(join(CODEX_AGENTS_DIR, `${codexAgentName}.toml`), toml);
      } else {
        const workerName = `${AGENT_PREFIX}${a.name}`;
        const description = cleanDescription(getField(a.fm, 'description'));
        const contract = [
          `# ${workerName}`,
          '',
          description,
          '',
          renderGeneratedBody(a.body, 'portable', { ...refConfig, context }).replace(/\n+$/, ''),
          '',
        ].join('\n');
        writeFileSync(join(PORTABLE_WORKERS_DIR, `${workerName}.md`), contract);
      }
    }
  }

  const baseWorkerStems = agents.map(({ name }) => `${AGENT_PREFIX}${name}`).sort();
  const claudeFastWorkerStems = [...fastProfileAgents]
    .map((name) => `${AGENT_PREFIX}${name}-fast`)
    .sort();
  const nativeInventories = {
    claude: {
      schemaVersion: 1,
      harness: 'claude',
      baseWorkers: baseWorkerStems,
      fastWorkers: claudeFastWorkerStems,
    },
    codex: {
      schemaVersion: 1,
      harness: 'codex',
      baseWorkers: baseWorkerStems,
      fastWorkers: [],
    },
  };
  const nativeInventoryPaths = {
    claude: join(CLAUDE_SKILL_DIR, 'native-agent-inventory.json'),
    codex: join(CODEX_SKILL_DIR, 'native-agent-inventory.json'),
  };
  for (const harness of ['claude', 'codex']) {
    writeFileSync(
      nativeInventoryPaths[harness],
      `${JSON.stringify(nativeInventories[harness], null, 2)}\n`,
    );
  }
  const parsedClaudeInventory = parseNativeAgentInventory(
    readFileSync(nativeInventoryPaths.claude, 'utf8'),
    { context: 'generated Claude native-agent-inventory.json' },
  );
  const parsedCodexInventory = parseNativeAgentInventory(
    readFileSync(nativeInventoryPaths.codex, 'utf8'),
    { context: 'generated Codex native-agent-inventory.json' },
  );
  reconcileNativeAgentInventories(parsedClaudeInventory, parsedCodexInventory, {
    claudeArtifacts: readdirSync(CLAUDE_AGENTS_DIR),
    codexArtifacts: readdirSync(CODEX_AGENTS_DIR),
    context: 'generated native agent distribution',
  });

  // --- License shipping guard ---
  const canonicalLicense = readFileSync(LICENSE_SRC);
  for (const [target, skillDir] of [
    ['claude', CLAUDE_SKILL_DIR],
    ['codex', CODEX_SKILL_DIR],
    ['portable', PORTABLE_SKILL_DIR],
  ]) {
    const shipped = join(skillDir, 'LICENSE');
    if (!existsSync(shipped)) {
      throw new Error(`license shipping guard: ${target} is missing ${shipped}`);
    }
    if (!canonicalLicense.equals(readFileSync(shipped))) {
      throw new Error(`license shipping guard: ${target} copy differs from LICENSE`);
    }
  }

  // --- Runtime helper shipping guard (#169) ---
  for (const [target, skillDir] of [
    ['claude', CLAUDE_SKILL_DIR],
    ['codex', CODEX_SKILL_DIR],
    ['portable', PORTABLE_SKILL_DIR],
  ]) {
    for (const file of RUNTIME_SCRIPT_FILES) {
      const source = readFileSync(join(RUNTIME_SCRIPTS_DIR, file));
      const shipped = join(skillDir, 'scripts', file);
      if (!existsSync(shipped)) {
        throw new Error(`runtime helper shipping guard: ${target} is missing ${shipped}`);
      }
      if (!source.equals(readFileSync(shipped))) {
        throw new Error(
          `runtime helper shipping guard: ${target} copy differs from src/scripts/${file}`,
        );
      }
    }
  }

  // --- Guard: every lazy-loaded fragment is shipped for every target (#99) ---
  // A tool's load pointer ("Lies `shared/<name>.md` …") must resolve on Claude
  // Code and Codex alike, so the fragment file has to exist in both skill dirs.
  for (const name of lazyFragments) {
    for (const [harness, skillDir] of [
      ['claude', CLAUDE_SKILL_DIR],
      ['codex', CODEX_SKILL_DIR],
      ['portable', PORTABLE_SKILL_DIR],
    ]) {
      const shipped = join(skillDir, 'shared', `${name}.md`);
      if (!existsSync(shipped)) {
        throw new Error(
          `lazy-include guard (#99): fragment "${name}" is referenced but not shipped for ${harness} (${shipped})`,
        );
      }
    }
  }

  // --- Rendered worker-reference completeness guard (#159) ---
  // Source validation proves only that a worker source exists. This second
  // layer walks every rendered instruction and verifies the actual consumer
  // artifact: native registered sidecar or portable bundled contract.
  const renderedFiles = (root) => {
    const files = [];
    const visit = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) visit(path);
        else if (entry.name.endsWith('.md') || entry.name.endsWith('.toml')) files.push(path);
      }
    };
    visit(root);
    return files.sort();
  };

  const targetConfigs = [
    {
      name: 'claude',
      root: DIST_CLAUDE,
      workerPath: (ref) => join(CLAUDE_AGENTS_DIR, `${ref}.md`),
      metadata: (ref) => `name: ${ref}`,
      workerNames: new Set([...baseWorkerStems, ...claudeFastWorkerStems]),
    },
    {
      name: 'codex',
      root: DIST_CODEX,
      workerPath: (ref) => join(CODEX_AGENTS_DIR, `${ref}.toml`),
      metadata: (ref) => `name = ${tomlString(ref)}`,
      workerNames: new Set(baseWorkerStems),
    },
    {
      name: 'portable',
      root: DIST_PORTABLE,
      workerPath: (ref) => join(PORTABLE_WORKERS_DIR, `${ref}.md`),
      metadata: (ref) => `# ${ref}`,
      workerNames: new Set(baseWorkerStems),
    },
  ];
  const foreignParameterDiagnostics = [];

  for (const target of targetConfigs) {
    const files = renderedFiles(target.root);
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const foreignParameters = findForeignHarnessToolParameters(content, target.name);
      for (const finding of foreignParameters) {
        foreignParameterDiagnostics.push(
          `target=${target.name} ` +
            `file=${relative(target.root, file)} line=${finding.line} ` +
            `parameter=${finding.parameter}`,
        );
      }
      // Shape-matched, not allowlisted: see assertNoUnresolvedPlaceholders.
      assertNoUnresolvedPlaceholders(content, {
        context: `rendered ${target.name} file ${relative(target.root, file)}`,
      });
      for (const ref of collectRenderedWorkerRefs(content, AGENT_PREFIX, target.workerNames)) {
        const workerPath = target.workerPath(ref);
        if (!existsSync(workerPath)) {
          throw new Error(
            `worker-reference guard (#159): ${target.name} reference ${ref} in ${file} has no artifact ${workerPath}`,
          );
        }
      }
    }

    for (const ref of target.workerNames) {
      const workerPath = target.workerPath(ref);
      if (!existsSync(workerPath)) {
        throw new Error(
          `worker-reference guard (#159): ${target.name} is missing worker artifact ${workerPath}`,
        );
      }
      if (!readFileSync(workerPath, 'utf8').includes(target.metadata(ref))) {
        throw new Error(
          `worker-reference guard (#159): ${target.name} worker ${workerPath} has mismatched metadata`,
        );
      }
    }
  }

  if (foreignParameterDiagnostics.length > 0) {
    throw new Error(
      `foreign harness tool-parameter guard (#163):\n${foreignParameterDiagnostics.join('\n')}`,
    );
  }

  for (const file of renderedFiles(PORTABLE_SKILL_DIR)) {
    const content = readFileSync(file, 'utf8');
    const refs = collectRenderedWorkerRefs(content, AGENT_PREFIX, new Set(baseWorkerStems));
    if (refs.length > 0 && !content.includes('built-in general-purpose subagent mechanism')) {
      throw new Error(
        `portable worker-reference guard (#159): ${file} names workers without the built-in delegation contract`,
      );
    }
    if (/^(?:model|effort|model_reasoning_effort|reasoning_effort)\s*[:=]/m.test(content)) {
      throw new Error(`portable native-profile metadata guard: ${file}`);
    }
    for (const alias of [
      AGENT_PROFILE_MAPPINGS.fast.claude.model,
      AGENT_PROFILE_MAPPINGS.fast.codex.model,
    ]) {
      if (content.includes(alias)) {
        throw new Error(`portable native-profile alias guard: ${file} contains ${alias}`);
      }
    }
    for (const fastWorker of claudeFastWorkerStems) {
      if (content.includes(fastWorker)) {
        throw new Error(`portable Fast-worker guard: ${file} contains ${fastWorker}`);
      }
    }
  }
  if (existsSync(join(PORTABLE_SKILL_DIR, 'native-agent-inventory.json'))) {
    throw new Error('portable output must not contain a native agent inventory');
  }

  // --- Context budget report + guard (#99) ---
  // Every tool keeps its always-loaded core — the built tool file, which no longer
  // inlines the mode-gated fragments — under a documented line budget.
  // A routine invocation that never reaches a deferred mode loads only this core.
  // See docs/developer-guide/build-system.md ("Progressive Disclosure").
  //
  // Every file in src/tools is measured, and the reconciliation below keeps this
  // map and the built tool set in exact correspondence, so a newly added tool
  // cannot ship unmeasured. Each tool gets its own ratchet rather than a share
  // of one allowance: its measured always-loaded size plus at most ten lines of
  // headroom. `merge-gate` currently measures 2286 lines against its 2290 limit.
  //
  // Every number here is a **measured backlog, not a target**. It records what a
  // tool's always-loaded core costs today; it is not a size anyone argued for.
  // Each later conversion of an eager include to a `lazy-include` lowers the
  // entries it touches, so a large number reads as work outstanding and never as
  // room to fill.
  //
  // The allowance above the measured size is a flat line count rather than a
  // percentage, deliberately: a percentage hands the largest tools the most room,
  // which is exactly where unwatched growth is most expensive. Ten lines absorb
  // the next justified rule, or the short pointer a deferral leaves behind,
  // without hiding a regression. Ten is the **ceiling**, not a fixed offset —
  // most entries carry less, because a deferral that shrank a tool was recorded
  // by lowering its entry to the new measurement rather than by re-adding the
  // full ten. Read an entry's actual headroom off the report below, never as
  // "ten".
  //
  // Measure with `node build.mjs` and read the `Always-loaded core (lines/budget)`
  // line it prints — that is the exact number this guard compares. It counts
  // `split('\n').length`, one more than `wc -l` reports for a newline-terminated
  // file, so a limit derived from `wc -l` is a line short of what it looks like.
  //
  // Entries generally run largest first by **measured** size, not by the limit
  // written down. Later growth or a successful deferral can temporarily disturb
  // that order; it is a reading aid and deliberately not asserted. Enforcing it
  // would turn a successful deferral — a tool shrinking, which is the whole point
  // of this map — into a build failure until someone re-sorts. Re-sort when
  // convenient instead.
  //
  // Six entries below once carried a `+6 (goal-completion)` marker. That raise was the one case
  // where this line metric and the real context cost point in opposite directions:
  // `src/shared/goal-completion.md` stated its whole progress contract as a single
  // 2 893-character Markdown line, which cost one line of budget and roughly 700 tokens in each of
  // its ten eager consumers. Rewriting it as the invariants it guarantees dropped the fragment
  // from 4 413 to 3 036 characters while adding six lines, so every eager consumer grew by exactly
  // six lines and shrank in tokens. Each marker was that measured delta and nothing more, applied
  // so the entry kept the headroom it had; the four other eager consumers (`merge-gate`, `docs`,
  // `build`, `fix`) already had enough individual headroom and were left alone. A later
  // re-measurement folded those six deltas into the fresh measurements below, so the markers are
  // gone and every entry is again a measurement plus its headroom. Raise an entry this way only
  // when a measurement points the same way.
  const CONTEXT_BUDGET_LINES = {
    'merge-gate': 2328,
    iterate: 1805,
    setup: 1913,
    'apply-review': 1406,
    'apply-issues': 1210,
    cleanup: 1041,
    refactor: 899,
    deliver: 795,
    'plan-issue': 752,
    review: 770,
    plan: 665,
    'apply-review-commit-mechanics': 656,
    maintain: 699,
    docs: 617,
    build: 595,
    apply: 592,
    'apply-plan': 587,
    investigate: 553,
    fix: 488,
    'plan-review': 446,
    pr: 450,
    'concept-review': 344,
    'apply-review-remote': 382,
    concept: 332,
    commit: 257,
    'open-plans': 147,
    'pr-review': 38,
    version: 38,
  };

  // Guard: the budget map and the built tool set cover each other exactly. A tool
  // with no entry would ship unmeasured, and an entry naming no tool would make
  // the report read as coverage it no longer has — the same two-sided
  // reconciliation the next-steps exemptions and the deprecated aliases use.
  {
    const budgeted = new Set(Object.keys(CONTEXT_BUDGET_LINES));
    const unbudgeted = [...builtToolNames].filter((name) => !budgeted.has(name)).sort();
    const stale = [...budgeted].filter((name) => !builtToolNames.has(name)).sort();
    if (unbudgeted.length > 0) {
      throw new Error(
        `context budget (#99): CONTEXT_BUDGET_LINES has no entry for ${unbudgeted.join(', ')} — ` +
          'every src/tools/*.md is measured; take the built size from the "Always-loaded core ' +
          '(lines/budget)" line this build prints (it counts one more line than wc -l) and add ' +
          'up to ten lines of headroom',
      );
    }
    if (stale.length > 0) {
      throw new Error(
        `context budget (#99): CONTEXT_BUDGET_LINES names ${stale.join(', ')}, but there is no ` +
          'matching src/tools/<name>.md',
      );
    }
  }

  budgetReport = Object.entries(CONTEXT_BUDGET_LINES).map(([name, limit]) => {
    const lines = [CLAUDE_SKILL_DIR, CODEX_SKILL_DIR, PORTABLE_SKILL_DIR].map(
      (skillDir) => readFileSync(join(skillDir, 'tools', `${name}.md`), 'utf8').split('\n').length,
    );
    return { name, lines: Math.max(...lines), limit };
  });
  const overBudget = budgetReport.filter((r) => r.lines > r.limit);
  if (overBudget.length > 0) {
    throw new Error(
      'context budget (#99): always-loaded tool core exceeds its line budget: ' +
        overBudget.map((r) => `${r.name} (${r.lines} lines, budget ${r.limit})`).join(', '),
    );
  }

  // --- Version-drift guard: all three routers carry the same version ---

  const claudeRouter = readFileSync(join(CLAUDE_SKILL_DIR, 'SKILL.md'), 'utf8');
  const codexRouter = readFileSync(join(CODEX_SKILL_DIR, 'SKILL.md'), 'utf8');
  const portableRouter = readFileSync(join(PORTABLE_SKILL_DIR, 'SKILL.md'), 'utf8');
  if (
    !claudeRouter.includes(VERSION_STRING) ||
    !codexRouter.includes(VERSION_STRING) ||
    !portableRouter.includes(VERSION_STRING)
  ) {
    throw new Error(`version drift — expected "${VERSION_STRING}" in all router outputs`);
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

process.stdout.write(`Built ${SKILL_NAME} skill:\n`);
process.stdout.write(
  `  Claude Code (native): ${exposedCount} tools (+${internalCount} internal) -> dist/claude/${SKILL_NAME}/, ${agents.length} base + ${fastProfileAgents.size} Fast agents -> dist/claude/agents/${AGENT_PREFIX}*.md\n`,
);
process.stdout.write(
  `  Codex (native):      ${exposedCount} tools (+${internalCount} internal) -> dist/codex/${SKILL_NAME}/, ${agents.length} base agents -> dist/codex/agents/${AGENT_PREFIX}*.toml\n`,
);
process.stdout.write(
  `  Managers (portable): ${exposedCount} tools (+${internalCount} internal), ${agents.length} worker contracts -> dist/portable/${SKILL_NAME}/\n`,
);
if (budgetReport.length > 0) {
  const sizes = budgetReport.map((r) => `${r.name} ${r.lines}/${r.limit}`).join(', ');
  process.stdout.write(`  Always-loaded core (lines/budget): ${sizes}\n`);
}
