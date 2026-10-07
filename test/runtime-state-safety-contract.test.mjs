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

// Invariant: report and memory writers resolve their handles from RUNTIME_STATE_ROOT, never the worktree.
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

// Invariant: no source writes runtime state without the runtime-state-safety guard.
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

// Invariant: review writes only ignored, untracked runtime state; its memory lookup stays read-only.
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

// Invariant: the configuration resolver never writes. Every filesystem binding it imports, and every
// member it uses on one (or on the injected `context.fs` and an opened handle), is a read; the only
// open flags are read-only no-follow; and git runs only through `runGit` with the three pinned
// read-only argument vectors, so a mutating call or git subcommand fails here. That it never reads
// below a linked EXECUTION_ROOT is behaviour, covered by the "step 0: a linked worktree …" and
// "containment: …" cases in `test/config-resolve.test.mjs`.
test('configuration resolver is read-only: filesystem reads only and git limited to the pinned read-only argument vectors', () => {
  const resolver = readFileSync(join(SOURCE_DIR, 'scripts', 'config-resolve-core.mjs'), 'utf8');
  const READ_ONLY_FS = ['lstat', 'open', 'readFile', 'readdir', 'realpath', 'stat'];
  const HANDLE_READS = ['close', 'readFile', 'stat'];
  const FS_CONSTANTS = ['O_NOFOLLOW', 'O_NONBLOCK', 'O_RDONLY'];
  const FS_MODULES = new Set(['fs', 'fs/promises', 'node:fs', 'node:fs/promises']);
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const membersOf = (binding) =>
    new Set(
      [...resolver.matchAll(new RegExp(`\\b${escape(binding)}\\.([A-Za-z_$][\\w$]*)`, 'g'))].map(
        (match) => match[1],
      ),
    );
  const subset = (actual, allowed, label) => {
    const extra = [...actual].filter((name) => !allowed.includes(name)).sort();
    assert.deepEqual(extra, [], `${label} may use read-only members only`);
  };

  // Static imports only, from a pinned module set.
  const statements = resolver.match(/^import\b.*$/gm) ?? [];
  const imports = [...resolver.matchAll(/^import\s+([\s\S]*?)\s+from\s+'([^']+)';/gm)].map(
    (match) => ({ clause: match[1], specifier: match[2] }),
  );
  assert.equal(imports.length, statements.length, 'every import names its bindings');
  assert.deepEqual(imports.map((entry) => entry.specifier).sort(), [
    'node:child_process',
    'node:fs/promises',
    'node:path',
    'node:process',
  ]);
  assert.doesNotMatch(resolver, /\bimport\s*\(|\brequire\s*\(/, 'no dynamic module loading');
  // Git runs only through the spawn-based runner: no other child_process entry point is imported.
  assert.deepEqual(
    imports
      .filter((entry) => entry.specifier === 'node:child_process')
      .map((entry) => entry.clause),
    ['{ spawn }'],
  );

  // Every filesystem binding: named imports are read-only functions; a default or namespace binding
  // is used only through read-only members and is otherwise only the injectable default.
  const fsBindings = [];
  for (const { clause, specifier } of imports) {
    if (!FS_MODULES.has(specifier)) continue;
    const named = clause.match(/\{([^}]*)\}/);
    for (const part of named ? named[1].split(',') : []) {
      const [imported] = part.trim().split(/\s+as\s+/);
      if (imported) subset([imported], READ_ONLY_FS, `the named ${specifier} import`);
    }
    const rest = clause
      .replace(/\{[^}]*\}/, '')
      .replace(/,/g, ' ')
      .trim();
    const local = rest.match(/^(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)$/)?.[1];
    if (local) fsBindings.push(local);
  }
  assert.ok(fsBindings.length > 0, 'the filesystem binding is recognised');
  for (const binding of fsBindings) {
    subset(membersOf(binding), [...READ_ONLY_FS, 'constants'], `the ${binding} binding`);
    subset(membersOf(`${binding}.constants`), FS_CONSTANTS, `${binding}.constants`);
    const bare = [...resolver.matchAll(new RegExp(`\\b${escape(binding)}\\b(?!\\s*\\.)`, 'g'))];
    assert.equal(
      bare.length,
      2,
      `${binding} is referenced bare only by its import and the default`,
    );
    assert.match(resolver, new RegExp(`fs: deps\\.fs \\?\\? ${escape(binding)}\\b`));
  }
  subset(membersOf('fs'), READ_ONLY_FS, 'the injected context.fs');
  assert.doesNotMatch(resolver, /\bO_(?:WRONLY|RDWR|CREAT|TRUNC|APPEND|EXCL)\b/);
  const opens = [...resolver.matchAll(/(\w+)\s*=\s*await\s+[\w.]*\.open\(([^)]*)\)/g)];
  assert.ok(opens.length > 0, 'the no-follow open is recognised');
  for (const [, handle, args] of opens) {
    assert.match(args, /,\s*READ_NO_FOLLOW$/, 'every open uses the read-only no-follow flags');
    subset(membersOf(handle), HANDLE_READS, `the opened ${handle}`);
  }
  assert.equal(
    [...resolver.matchAll(/\.open\(/g)].length,
    opens.length,
    'every open assigns its handle',
  );

  // Git: one spawn, one runner call (inside runGit, for git), and every runGit call passes one of
  // the pinned read-only argument vectors.
  const PINNED_GIT_ARGS = {
    toplevelArgs: ['rev-parse', '--show-toplevel'],
    commonArgs: ['rev-parse', '--path-format=absolute', '--git-common-dir'],
    listArgs: ['worktree', 'list', '--porcelain'],
  };
  assert.equal([...resolver.matchAll(/\bspawn\(/g)].length, 1, 'one process spawn site');
  assert.equal([...resolver.matchAll(/\.runner\(/g)].length, 1, 'one runner call site');
  assert.match(
    resolver,
    /async function runGit\(context, cwd, args\) \{\n\s*const result = await context\.runner\(\{\n\s*executable: 'git',\n\s*args: \['-C', cwd, \.\.\.args\],/,
  );
  const vectors = Object.fromEntries(
    [...resolver.matchAll(/const (\w+Args) = (\[[^\]]*\]);/g)].map(([, name, literal]) => [
      name,
      JSON.parse(literal.replace(/'/g, '"')),
    ]),
  );
  assert.deepEqual(vectors, PINNED_GIT_ARGS, 'the git argument vectors are pinned');
  const calls = [...resolver.matchAll(/(?<!function )\brunGit\(([^)]*)\)/g)].map((match) =>
    match[1].split(',').at(-1).trim(),
  );
  assert.ok(calls.length > 0, 'the runGit calls are recognised');
  for (const argument of calls) {
    assert.ok(Object.hasOwn(PINNED_GIT_ARGS, argument), `runGit called with ${argument}`);
  }
  assert.deepEqual([...new Set(calls)].sort(), Object.keys(PINNED_GIT_ARGS).sort());
});

// Invariant: the shared fragment that sends every tool to the resolver states that reading creates
// nothing and does not make the lookup a runtime writer.
test('configuration fallback lookup is documented as read-only and is not a runtime writer', () => {
  const configMigration = readShared('config-migration');
  const configEdgeCases = readShared('config-migration-edge-cases');
  const { eager, lazy } = collectIncludeNames(configMigration);
  const edgeIncludes = collectIncludeNames(configEdgeCases);

  assert.match(configMigration, /Reading creates no file and mutates no Git/);
  assert.match(configMigration, /`data\.runtimeStateRoot` is the verified `RUNTIME_STATE_ROOT`/);
  assert.equal(eager.has('runtime-state-safety'), false);
  assert.equal(lazy.has('runtime-state-safety'), false);
  assert.equal(edgeIncludes.eager.has('runtime-state-safety'), false);
  assert.equal(edgeIncludes.lazy.has('runtime-state-safety'), false);
});

test('setup repairs first, validates the target state, then guards and writes its marker', () => {
  const setup = readSource('tools', 'setup.md');
  const orderedClauses = [
    'git rm --cached <source-path>',
    'Before writing the migration marker, freshly validate the repaired target state',
    'git check-ignore --no-index -- .effective-flow/memory.json',
    'git ls-files -- .effective-flow/',
    'Only after target-state validation passes',
    'Apply “Runtime-state write',
    'mark completion idempotently in',
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

// Invariant: setup migrates only the locator-selected source handle and rolls back or stops before any unsafe write.
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

test('setup orders runtime migration between repair and config completion', () => {
  const setup = readSource('tools', 'setup.md');
  const orderedClauses = [
    'git rm --cached <source-path>',
    'Before writing the migration marker, freshly validate the repaired target state',
    'Only after target-state validation passes',
    'invoke the loaded shared runtime-directory',
    'before writing `configMigration.adr`',
    'mark completion idempotently in',
  ];

  let previousIndex = -1;
  for (const clause of orderedClauses) {
    const index = setup.indexOf(clause, previousIndex + 1);
    assert.ok(index > previousIndex, `setup clause must follow its predecessor: ${clause}`);
    previousIndex = index;
  }

  assert.match(
    setup,
    /runtime-directory migration fails or remains incomplete[\s\S]*same conditional ADR and[\s\S]*convention-marker rollback/,
  );
  assert.match(
    setup,
    /Preserve the locator-selected config source and every safely copied[\s\S]*partial runtime target/,
  );
});

// Invariant: cleanup never edits .gitignore; setup is the sole repair owner.
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

// Invariant: cleanup lazily loads runtime-state safety before any runtime mutation.
test('cleanup loads runtime safety for migrations, memory, and tracker markers', () => {
  const cleanup = readSource('tools', 'cleanup.md');
  assert.match(
    cleanup,
    /```lazy-include\s+runtime-state-safety\s+when: [^\n]*worktree lifecycle state[^\n]*any confirmed legacy copy or removal, runtime migration, memory, or tracker-marker mutation is imminent\s+```/,
  );
});

test('cleanup verifies location and safety before migration-dependent deletion decisions', () => {
  const cleanup = readSource('tools', 'cleanup.md');
  const orderedClauses = [
    'issue and verify an execution-location receipt',
    'retain the verified main checkout as `RUNTIME_STATE_ROOT`',
    'Capture the existing legacy remnants in the project root',
    'freshly revalidate the execution-location receipt and `RUNTIME_STATE_ROOT`',
    '“Runtime-state write safety” from that root',
    'invoke the loaded shared runtime-directory migration prerequisite',
    'repeat the legacy-runtime, counterpart, legacy-config, and nested-worktree',
    '### Phase 4: Dry-run preview',
  ];

  let previousIndex = -1;
  for (const clause of orderedClauses) {
    const index = cleanup.indexOf(clause, previousIndex + 1);
    assert.ok(index > previousIndex, `cleanup clause must follow its predecessor: ${clause}`);
    previousIndex = index;
  }
});

// Invariant: a legacy directory that still roots a linked worktree is never deleted.
test('cleanup blocks containing legacy directory while a linked worktree remains', () => {
  const cleanup = readSource('tools', 'cleanup.md');

  assert.match(
    cleanup,
    /compare[\s\S]*`<legacy-directory>\/\.worktrees\/` tree with the fresh complete Git worktree[\s\S]*inventory/,
  );
  assert.match(
    cleanup,
    /If any registered linked worktree is current, active, retained, not reliably[\s\S]*checkable, or otherwise still rooted below that tree, keep the containing legacy runtime[\s\S]*directory/,
  );
  assert.match(
    cleanup,
    /Worktree removal remains exclusively governed by the lifecycle[\s\S]*claim\/remove\/reconcile protocol/,
  );
  assert.match(
    cleanup,
    /immediately before removal, refresh the migration\/carry-over evidence and Git[\s\S]*worktree inventory/,
  );
});

// Invariant: lifecycle records live below the verified runtime root and every mutation is guarded fail-closed.
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

// Invariant: cleanup guards every lifecycle lock, claim, and record removal and never removes its own roots.
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
