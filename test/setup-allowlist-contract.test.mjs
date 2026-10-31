import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBody } from '../build-lib.mjs';
import { ALLOWLISTED_OPERATIONS } from '../src/scripts/claude-settings-core.mjs';
import { OUTCOME_CODES, STATE_OPERATIONS } from '../src/scripts/effective-flow-state-core.mjs';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_DIR = join(ROOT_DIR, 'src');
const readSource = (...segments) => readFileSync(join(SOURCE_DIR, ...segments), 'utf8');
const allowlist = readSource('shared', 'setup-allowlist.md');
const setup = readSource('tools', 'setup.md');
const flat = (text) => text.replace(/\s+/g, ' ');
const toolNames = readdirSync(join(SOURCE_DIR, 'tools'))
  .filter((name) => name.endsWith('.md'))
  .map((name) => name.slice(0, -3));
const agentNames = readdirSync(join(SOURCE_DIR, 'agents'))
  .filter((name) => name.endsWith('.md'))
  .map((name) => name.slice(0, -3));
const renderConfig = {
  exposedTools: toolNames,
  agentPrefix: 'effective-flow-',
  skillName: 'effective-flow',
  knownTools: new Set(toolNames),
  knownAgents: new Set(agentNames),
};
const allowlistStep = setup.slice(
  setup.indexOf('### Allowlist step (Claude Code only)'),
  setup.indexOf('### Step 7:'),
);

// Invariant: the rules are written only after a preview and an explicit answer in the
// conversation; a harness approval of the `apply` command (auto mode included) never replaces it,
// and a run that cannot ask writes nothing.
test('the allowlist step confirms in the conversation between preview and apply', () => {
  const text = flat(allowlist);
  const preview = text.indexOf('"mode":"preview"');
  const ask = text.indexOf('Ask in the conversation whether to write exactly this change', preview);
  const apply = text.indexOf('Apply with `"mode":"apply"`', ask);
  assert.ok(preview >= 0 && preview < ask && ask < apply, 'preview, ask, apply in this order');
  assert.match(
    text,
    /in every mode and in auto mode too: a harness approval of the `apply` command does not replace this answer/,
  );
  assert.match(text, /a run that cannot ask writes nothing/);
  assert.match(text, /`"digest":"<result\.digest of the preview>"`/);
  assert.match(text, /Only the helper writes the settings file; never edit it in prose/);
});

// Invariant: the prose names exactly the helper's allowlisted operations, and the destructive
// `lock break` and the rule writer itself never get a rule.
test('the allowlist step names the six allowlisted operations and no rule for lock break', () => {
  const named = STATE_OPERATIONS.filter((operation) => allowlist.includes(`\`${operation}\``));
  assert.deepEqual(
    named.filter((operation) => ALLOWLISTED_OPERATIONS.includes(operation)),
    [...ALLOWLISTED_OPERATIONS],
  );
  assert.match(flat(allowlist), /`lock break` and `harness allow-rules` never get a rule/);
  assert.ok(!ALLOWLISTED_OPERATIONS.includes('lock break'));
});

// Invariant: every helper outcome `harness allow-rules` can return is handled in the fragment.
test('the allowlist step handles every harness outcome', () => {
  const harnessOutcomes = OUTCOME_CODES.filter(
    (code) => code.startsWith('SETTINGS_') || /^(?:UNSUPPORTED_|PREVIEW_)/.test(code),
  );
  assert.deepEqual(harnessOutcomes, [
    'UNSUPPORTED_HARNESS',
    'UNSUPPORTED_PATH',
    'SETTINGS_NOT_IGNORED',
    'SETTINGS_TRACKED',
    'SETTINGS_INVALID',
    'PREVIEW_MISMATCH',
  ]);
  for (const code of harnessOutcomes) assert.match(allowlist, new RegExp(`^- \`${code}\`:`, 'm'));
  assert.match(
    flat(allowlist),
    /`UNSUPPORTED_PATH`: state `outcome\.reason`, with `outcome\.path` and `outcome\.detail` when present, and show `outcome\.rules`, when non-empty/,
  );
  // A security refusal must say that hand-entered rules reopen the risk it guards against.
  assert.match(
    flat(allowlist),
    /`inside-repository-worktree`, `inside-runtime-root`, `foreign-writable` and `helper-mismatch`, add that entering the rules by hand reopens the risk/,
  );
  assert.match(flat(allowlist), /Any other nonzero exit or `error`: report its code and message/);
});

// Invariant: an unignored settings file is repaired by this step itself — `.gitignore` in standard
// mode, `info/exclude` in hidden mode — only after the user's yes in both modes, and hidden mode
// owns the second exclude line.
test('the allowlist step owns its ignore remedy per visibility', () => {
  const text = flat(allowlist);
  const ask = text.indexOf('Ask whether to add the line `.claude/settings.local.json`');
  const standard = text.indexOf(
    '**Standard mode:** on yes append it once to `<RUNTIME_STATE_ROOT>/.gitignore`',
  );
  const hidden = text.indexOf(
    "**Hidden mode:** on yes add it to the Git common directory's `info/exclude`",
  );
  assert.ok(ask >= 0 && ask < standard && ask < hidden, 'the ask precedes both remedies');
  assert.match(text, /on no, write nothing and report the outcome/);
  assert.match(text, /`info\/exclude`[^.]*never touch `\.gitignore`/);
  assert.match(
    flat(readSource('shared', 'setup-hidden-mode.md')),
    /When `setup-allowlist` returns `SETTINGS_NOT_IGNORED` in hidden mode and the user answered yes to its ignore remedy's question, apply items 1 and 3 to the line `\.claude\/settings\.local\.json`/,
  );
  // The keyword form needs no configuration: it reads only the visibility to pick the remedy.
  assert.match(
    text,
    /It needs no existing configuration: make Step 2 item 2's read-only resolution call with `tool: "setup"` and take only `data\.runtimeStateRoot` and `data\.visibility`/,
  );
});

// Invariant: the summary warns against "don't ask again" and states the linked-worktree limit.
test('the allowlist summary carries the widening warning and the linked-worktree limit', () => {
  const text = flat(allowlist);
  assert.match(
    text,
    /Never accept Claude Code's "don't ask again" suggestion for a helper call: it widens the rule to `node <helper> \*` or `node \*`/,
  );
  assert.match(
    text,
    /whether Claude Code applies them in a session started inside a linked worktree is unverified/,
  );
});

// Invariant: the skill root is passed in its symlinked install form, the same literal form every
// later call uses (owned by the `state-helper-call` fragment), because a rule must name the path
// Claude Code sees; the helper's CLAUDECODE gate is the authoritative harness check.
test('the allowlist step passes the unresolved skill root and relies on the helper gate', () => {
  const text = flat(allowlist);
  assert.match(allowlist, /^```include\nstate-helper-call\n```$/m);
  assert.match(
    flat(readSource('shared', 'state-helper-call.md')),
    /never resolved through `realpath`/,
  );
  assert.match(text, /The `skillRoot` value is that same literal `<skill-root>`/);
  assert.match(text, /The helper's `CLAUDECODE` gate is the authoritative harness check/);
});

// Invariant: Codex never writes a rule, the native Claude build always offers the step, and the
// portable build offers it only when it runs in Claude Code; where it is not offered, setup says so
// in one sentence and writes nothing.
test('the rendered setup offers the allowlist step per build target and Codex writes nothing', () => {
  for (const harness of ['claude', 'codex', 'portable']) {
    const rendered = flat(
      renderBody(allowlistStep, harness, { ...renderConfig, context: `setup (${harness})` }),
    );
    assert.match(rendered, new RegExp(`This installation is the \`${harness}\` build`));
    assert.match(
      rendered,
      /`claude` always offers the step, `codex` never, and `portable` only when you judge from the running environment that this session runs in Claude Code/,
    );
    assert.match(
      rendered,
      /Otherwise say in one sentence that the step is specific to Claude Code and write nothing/,
    );
  }
  assert.match(
    allowlistStep,
    /when: the allowlist step is offered: the build is `claude`, or `portable` running in Claude Code/,
  );
});
