import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectIncludeNames,
  extractBody,
  findRuntimeStateSafetyViolations,
  renderBody,
  resolveLazyIncludes,
} from '../build-lib.mjs';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_DIR = join(ROOT_DIR, 'src');
const TOOLS_DIR = join(SOURCE_DIR, 'tools');
const AGENTS_DIR = join(SOURCE_DIR, 'agents');

const readSource = (...segments) => readFileSync(join(SOURCE_DIR, ...segments), 'utf8');
const readShared = (name) => readSource('shared', `${name}.md`);

const toolNames = new Set(
  readdirSync(TOOLS_DIR)
    .filter((name) => name.endsWith('.md'))
    .map((name) => name.slice(0, -3)),
);
const agentNames = new Set(
  readdirSync(AGENTS_DIR)
    .filter((name) => name.endsWith('.md'))
    .map((name) => name.slice(0, -3)),
);
const renderConfig = {
  exposedTools: [...toolNames],
  agentPrefix: 'effective-flow-',
  skillName: 'effective-flow',
  knownTools: toolNames,
  knownAgents: agentNames,
};

const runtimeStateContract = readShared('runtime-state-safety').trim();

function collectRuntimeStateSources() {
  const sources = new Map();
  for (const tool of [...toolNames].sort()) {
    sources.set(`tools/${tool}.md`, extractBody(readSource('tools', `${tool}.md`)));
  }
  for (const agent of [...agentNames].sort()) {
    sources.set(`agents/${agent}.md`, extractBody(readSource('agents', `${agent}.md`)));
  }
  for (const file of readdirSync(join(SOURCE_DIR, 'shared'))
    .filter((name) => name.endsWith('.md'))
    .sort()) {
    sources.set(`shared/${file}`, readSource('shared', file));
  }
  return sources;
}

test('the canonical guard specifies fail-closed Git predicates and non-mutation', () => {
  const requiredClauses = [
    [
      /git check-ignore --no-index -- \.effective-flow\/config\.json/,
      'compatibility sentinel predicate',
    ],
    [/git check-ignore --no-index -- <target>/, 'concrete target predicate'],
    [/`0` means ignored and passes; `1` means not ignored and\s+blocks/, 'exact exit handling'],
    [/any other exit code or command-launch error blocks/, 'error handling'],
    [/Do not use `-v` for the decision/, 'non-verbose decision semantics'],
    [/git check-ignore -v --no-index -- <path>/, 'post-block diagnostics'],
    [/git ls-files -- \.effective-flow\//, 'tracked-path check'],
    [/Nonempty output\s+blocks/, 'tracked-path failure'],
    [/Missing Git, a non-repository directory/, 'missing Git and non-repository failure'],
    [/Preserve all existing state, perform none of\s+the pending mutations/, 'non-mutation'],
    [/direct the user to `\{\{SKILL:setup\}\}`/, 'setup remediation'],
    [/exact absolute runtime-state handle/, 'absolute runtime handle'],
    [/below `<RUNTIME_STATE_ROOT>\/\.effective-flow\/`/, 'runtime-root containment'],
    [/symlink escape/, 'symlink-escape rejection'],
    [/from `RUNTIME_STATE_ROOT`/, 'main-checkout guard root'],
    [/safety pass from\s+`EXECUTION_ROOT` never authorizes/, 'no execution-root fallback'],
    [/root\/common-directory mismatch/, 'repository mismatch rejection'],
  ];

  for (const [pattern, clause] of requiredClauses) {
    assert.match(runtimeStateContract, pattern, `missing ${clause}`);
  }
});

test('report producers and mutators route safety through the retained runtime root', () => {
  const sourceDetection = readShared('apply-source-detection');
  const backlinks = readShared('review-report-backlinks');
  const unresolved = readShared('unresolved-review-report');
  const review = readSource('tools', 'review.md');

  assert.match(sourceDetection, /RUNTIME_STATE_ROOT/);
  assert.match(sourceDetection, /absolute report handle/);
  assert.match(backlinks, /Runtime-state write safety[\s\S]*main checkout/);
  assert.match(unresolved, /collision checks[\s\S]*memory reads\/writes/);
  assert.match(
    unresolved,
    /absolute `<RUNTIME_STATE_ROOT>\/\.effective-flow\/memory\.json` handle/,
  );
  assert.match(review, /collision checks/);
  assert.match(review, /retained absolute\s+memory handle/);
});

test('automatic source coverage includes plan and finds no unguarded runtime writer', () => {
  const sources = collectRuntimeStateSources();
  assert.equal(sources.has('tools/plan.md'), true);
  assert.deepEqual(findRuntimeStateSafetyViolations(sources), []);

  const { eager, lazy } = collectIncludeNames(sources.get('tools/plan.md'));
  assert.equal(eager.has('runtime-state-safety') || lazy.has('runtime-state-safety'), true);
});

test('the canonical guard and lazy-load pointer survive every harness render', () => {
  const fixBody = extractBody(readSource('tools', 'fix.md'));
  const { body: resolvedFix } = resolveLazyIncludes(fixBody, { context: 'tools/fix.md' });

  for (const harness of ['claude', 'codex', 'portable']) {
    const renderedContract = renderBody(`${runtimeStateContract}\n`, harness, {
      ...renderConfig,
      context: `shared/runtime-state-safety.md (${harness})`,
    });
    const renderedFix = renderBody(resolvedFix, harness, {
      ...renderConfig,
      context: `tools/fix.md (${harness})`,
    });

    assert.match(
      renderedContract,
      /git check-ignore --no-index -- \.effective-flow\/config\.json/,
      `sentinel predicate in ${harness}`,
    );
    assert.match(
      renderedContract,
      /git ls-files -- \.effective-flow\//,
      `tracked-path predicate in ${harness}`,
    );
    assert.match(renderedContract, /from `RUNTIME_STATE_ROOT`/, `runtime root in ${harness}`);
    assert.match(
      renderedContract,
      /exact absolute runtime-state handle/,
      `absolute runtime handle in ${harness}`,
    );
    assert.doesNotMatch(renderedContract, /\{\{(?:SKILL|AGENT):/);
    assert.match(renderedFix, /shared\/runtime-state-safety\.md/, `lazy pointer in ${harness}`);
  }
});

test('review requires ignored untracked runtime state and keeps read-only lookup non-mutating', () => {
  const review = readSource('tools', 'review.md');
  assert.match(review, /The entire `\.effective-flow\/` directory must be ignored and untracked/);
  assert.match(
    review,
    /Read the absolute[\s\S]*<RUNTIME_STATE_ROOT>\/\.effective-flow\/memory\.json[\s\S]*non-mutating and may precede the guard/,
  );
  assert.doesNotMatch(
    review,
    /Whether `\.effective-flow\/` is checked in or ignored is up to each project/,
  );
  assert.doesNotMatch(review, /Create `\.effective-flow\/` if needed/);
});

test('configuration fallback lookup remains read-only and is not a runtime writer', () => {
  const configMigration = readShared('config-migration');
  const { eager, lazy } = collectIncludeNames(configMigration);

  assert.match(
    configMigration,
    /Transitional compatibility[\s\S]*`<RUNTIME_STATE_ROOT>\/\.effective-flow\/config\.json`/,
  );
  assert.match(
    configMigration,
    /Never inspect a\s+same-named fallback below a linked `EXECUTION_ROOT`/,
  );
  assert.match(
    configMigration,
    /This read path creates \*\*nothing\*\*\s+and touches \*\*no\*\* Git/,
  );
  assert.match(
    configMigration,
    /The deterministic read path[\s\S]*itself creates no file and mutates no Git/,
  );
  assert.equal(eager.has('runtime-state-safety'), false);
  assert.equal(lazy.has('runtime-state-safety'), false);
});

test('setup repairs first, validates the target state, then guards and writes its marker', () => {
  const setup = readSource('tools', 'setup.md');
  const orderedClauses = [
    'git rm --cached <source-path>',
    'Before writing the migration marker, freshly validate the repaired target state',
    'git check-ignore --no-index -- .effective-flow/memory.json',
    'git ls-files -- .effective-flow/',
    'Only after target-state validation passes',
    'apply “Runtime-state write safety” immediately',
    'Mark completion idempotently in',
  ];
  let previousIndex = -1;
  for (const clause of orderedClauses) {
    const index = setup.indexOf(clause, previousIndex + 1);
    assert.ok(
      index > previousIndex,
      `setup clause must be ordered after its predecessor: ${clause}`,
    );
    previousIndex = index;
  }

  assert.match(
    setup,
    /If the project is not a Git repository[\s\S]*no `\.effective-flow\/` runtime marker may be written/,
  );
});

test('setup carries the locator-selected transitional source through migration', () => {
  const setup = readSource('tools', 'setup.md');

  assert.match(
    setup,
    /capture the locator's exact verified absolute transitional JSON handle[\s\S]*under `RUNTIME_STATE_ROOT` as `<source-handle>`/,
  );
  assert.match(
    setup,
    /never replace it with or inspect a same-named[\s\S]*fallback under `EXECUTION_ROOT`/,
  );
  assert.match(
    setup,
    /For Git commands only, derive `<source-path>`[\s\S]*identifies the same file/,
  );
  assert.match(
    setup,
    /If an ADR resolves[\s\S]*authoritative[\s\S]*neither transitional JSON file is a migration source/,
  );
  assert.match(
    setup,
    /When both JSON files exist[\s\S]*`<RUNTIME_STATE_ROOT>\/\.effective-flow\/config\.json` wins[\s\S]*`<RUNTIME_STATE_ROOT>\/\.firmo\/config\.json` untouched/,
  );
  assert.match(
    setup,
    /If Step 2 selected a transitional JSON source[\s\S]*require the freshly[\s\S]*resolved transitional handle to equal the retained `<source-handle>`[\s\S]*revalidate and re-read that exact absolute handle[\s\S]*do not resolve a[\s\S]*fallback under `EXECUTION_ROOT`/,
  );
  assert.match(
    setup,
    /If the fresh locator selects a different transitional handle[\s\S]*restart from Step 2[\s\S]*`<RUNTIME_STATE_ROOT>\/\.firmo\/config\.json` was retained[\s\S]*`<RUNTIME_STATE_ROOT>\/\.effective-flow\/config\.json` appeared[\s\S]*higher-precedence Effective[\s\S]*Flow source must be read and presented before any write/,
  );
  assert.match(
    setup,
    /If Step 2 found no source and the fresh locator still finds none[\s\S]*normal fresh[\s\S]*no `<source-handle>` or `<source-path>` exists/,
  );
  assert.match(
    setup,
    /If Step 2 found no source but the fresh locator now finds a transitional JSON source[\s\S]*return to Step 2[\s\S]*instead of writing defaults over it/,
  );
  assert.match(setup, /git ls-files -- <source-path>/);
  assert.match(
    setup,
    /If that required untracking command fails[\s\S]*do not write `configMigration\.adr`[\s\S]*restore the ADR and convention-marker file/,
  );
  assert.match(
    setup,
    /If any check blocks[\s\S]*apply the same safe ADR\/marker rollback[\s\S]*do[\s\S]*not write the marker/,
  );
  assert.match(
    setup,
    /deep-merge\s+only `configMigration\.adr`[\s\S]*sibling\s+`configMigration` state/,
  );
  assert.match(
    setup,
    /identify the exact `<source-handle>` selected by the locator[\s\S]*For an incomplete[\s\S]*do not call the source migrated[\s\S]*Never name the unselected fallback as processed/,
  );

  const completionCheck = setup.indexOf(
    'Before Step 4 in a migration case, perform a read-only idempotency check',
  );
  const adrWrite = setup.indexOf('4. **Write the project setup ADR.**');
  const untracking = setup.indexOf('git rm --cached <source-path>');
  assert.ok(completionCheck !== -1, 'setup must check completed migration state');
  assert.ok(completionCheck < adrWrite, 'completion check must precede the ADR write');
  assert.ok(completionCheck < untracking, 'completion check must precede untracking');
  assert.match(
    setup,
    /If the completion marker is already set[\s\S]*stop before Step 4 and before[\s\S]*any Git action[\s\S]*do not migrate again/,
  );
});

test('cleanup inventories .gitignore remnants but leaves repair exclusively to setup', () => {
  const cleanup = readSource('tools', 'cleanup.md');

  assert.match(cleanup, /inventory outdated `\.gitignore` entries but leave them untouched/);
  assert.match(cleanup, /Do not edit `\.gitignore`/);
  assert.match(cleanup, /`\.gitignore`:\*\* leave every line untouched/);
  assert.match(cleanup, /route (?:their )?repair to `\{\{SKILL:setup\}\}`/);
  assert.match(cleanup, /`\{\{SKILL:setup\}\}`, the sole (?:owner|repair owner)/);
  assert.doesNotMatch(cleanup, /`\.gitignore`: remove only clearly outdated lines/);
  assert.doesNotMatch(cleanup, /which `\.gitignore` lines were removed/);
});

test('cleanup loads runtime safety for migrations, memory, and tracker markers', () => {
  const cleanup = readSource('tools', 'cleanup.md');
  assert.match(
    cleanup,
    /```lazy-include\s+runtime-state-safety\s+when: [^\n]*worktree lifecycle state[^\n]*any confirmed legacy copy or removal, runtime migration, memory, or tracker-marker mutation is imminent\s+```/,
  );
});

test('worktree lifecycle state is contained in the verified runtime root', () => {
  const lifecycle = readShared('worktree-lifecycle');
  const { eager, lazy } = collectIncludeNames(lifecycle);

  assert.match(lifecycle, /execution-location receipt/i);
  assert.match(lifecycle, /Runtime-state write safety/i);
  assert.equal(eager.has('execution-location') && lazy.has('execution-location'), false);
  assert.equal(eager.has('runtime-state-safety') && lazy.has('runtime-state-safety'), false);
  assert.match(lifecycle, /<RUNTIME_STATE_ROOT>\/\.effective-flow\/worktree-runs\//);
  assert.match(lifecycle, /absolute handle below the verified\s+`RUNTIME_STATE_ROOT`/i);
  assert.match(lifecycle, /canonical repository identity/i);
  assert.match(lifecycle, /common Git directory matches the recorded repository identity/i);
  assert.match(
    lifecycle,
    /(?:create|write|update|transition|remove|delete)[\s\S]{0,320}(?:Runtime-state write safety|runtime-state safety)/i,
  );
  assert.match(
    lifecycle,
    /Runtime-state write safety” immediately before every parent[\s\S]{0,180}record deletion/i,
  );
  assert.match(lifecycle, /fail(?:-| )closed/i);
});

test('cleanup guards lifecycle claims, updates, and record removal at the main runtime root', () => {
  const cleanup = readSource('tools', 'cleanup.md');
  const { eager, lazy } = collectIncludeNames(cleanup);

  assert.equal(
    eager.has('worktree-lifecycle') || lazy.has('worktree-lifecycle'),
    true,
    'cleanup must consume the lifecycle contract',
  );
  assert.match(cleanup, /RUNTIME_STATE_ROOT/);
  assert.match(cleanup, /worktree-runs/);
  assert.match(cleanup, /apply runtime-state safety\s+to the exact lock and record handles/i);
  assert.match(cleanup, /atomically write `cleanup-in-progress`/i);
  assert.match(
    cleanup,
    /Delete only this run's lifecycle record after every required postcondition is proven/i,
  );
  assert.match(
    cleanup,
    /`RUNTIME_STATE_ROOT` and the worktree\s+from which cleanup is running are never removal candidates/i,
  );
});
