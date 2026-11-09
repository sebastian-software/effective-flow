import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBody } from '../build-lib.mjs';
import {
  ALLOWLISTED_OPERATIONS,
  NEVER_ALLOWLISTED_OPERATIONS,
  RULE_ENTRIES,
} from '../src/scripts/claude-settings-core.mjs';
import { OUTCOME_CODES, STATE_OPERATIONS } from '../src/scripts/effective-flow-state-core.mjs';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_DIR = join(ROOT_DIR, 'src');
const readSource = (...segments) => readFileSync(join(SOURCE_DIR, ...segments), 'utf8');
const allowlist = readSource('shared', 'setup-allowlist.md');
const setup = readSource('tools', 'setup.md');
const flat = (text) => text.replace(/\s+/g, ' ');
// The text from `start` up to `stop`, so a token assertion cannot be met by a neighboring sentence.
function boundedSlice(text, start, stop) {
  const from = text.indexOf(start);
  assert.notEqual(from, -1, `missing opening marker: ${start}`);
  const to = text.indexOf(stop, from + start.length);
  assert.notEqual(to, -1, `missing stop marker: ${stop}`);
  return text.slice(from, to);
}
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

// Invariant: the prose names exactly the state helper's allowlisted operations, the three rule
// families and the rule count the helper writes, states the `commit create` risk and its bounds,
// and the destructive `lock break`, `worktree remove`, `cleanup apply` and the rule writer itself
// never get a rule.
test('the allowlist step names the rule families, the rule count and no rule for lock break', () => {
  const named = STATE_OPERATIONS.filter((operation) => allowlist.includes(`\`${operation}\``));
  assert.deepEqual(
    named.filter((operation) => ALLOWLISTED_OPERATIONS.includes(operation)),
    [...ALLOWLISTED_OPERATIONS],
  );
  const text = flat(allowlist);
  assert.ok(
    text.includes(`It writes ${RULE_ENTRIES.length} Claude Code allow rules`),
    'rule count',
  );
  assert.ok(text.includes(`the ${RULE_ENTRIES.length} \`result.rules\``), 'preview count');
  assert.match(text, /one for the `config-resolve` helper's `resolve` operation/);
  assert.match(
    text,
    /one per read-only `remote-tracker\.mjs` operation: the forge reads, the pure local computations and `thread-ledger-lookup`, never a mutation or the local write `thread-ledger-record`/,
  );
  assert.match(
    text,
    /`commit create` writes Git history and runs the repository's hooks without a prompt; it commits only the listed paths, refuses paths below `\.effective-flow\/` and an untrusted hook configuration, and never pushes, amends, resets or rebases/,
  );
  assert.match(
    text,
    /`lock break`, `harness allow-rules` and the destructive `worktree remove` and `cleanup apply` never get a rule/,
  );
  for (const operation of NEVER_ALLOWLISTED_OPERATIONS) {
    assert.ok(!ALLOWLISTED_OPERATIONS.includes(operation), operation);
  }
});

// Invariant: the allowlisted `worktree transition` changes more than lifecycle records in exactly
// two bounded cases (the partial-diff release restores proven residual paths, the resume adoption
// appends at most one proven tip to the delivery ledger), so the prose states both bounds; the
// allowlisted ledger writes touch only the private ledger of the caller's own `active` record, and
// `worktree resume-check` and `ledger reconcile` only read, and the prose states each bound.
test('the allowlist step bounds the release, resume and ledger writes and the read-only resume operations', () => {
  const text = flat(allowlist);
  const exceptions = boundedSlice(text, 'never remove a worktree or branch', 'That ledger is');
  for (const token of [
    'two bounded exceptions in `worktree transition`',
    '`release: "partial-diff"` restores exactly the residual paths',
    'proved equal to the delivery ledger and still in the source',
    '`partial-diff-resume` adoption appends at most one proven tip',
  ]) {
    assert.ok(exceptions.includes(token), `the bounded transition exceptions state: ${token}`);
  }
  assert.doesNotMatch(
    text,
    /never remove a worktree, branch or file/,
    'the retired claim that no allowlisted operation changes a file must not return',
  );
  const ledger = boundedSlice(text, 'That ledger is', '`worktree resume-check` and');
  for (const token of [
    '`.effective-flow/worktree-runs/ledgers/`',
    'at most 256 KiB',
    'once, no-clobber and under the record lock',
    "the calling session's own `active` `partial-diff` record",
    'descriptors the helper computes itself',
    'not at all when that worst case exceeds the bound',
    '`ledger append` adds one commit entry',
    "proved the next group's exact commit",
    'Neither touches a worktree, branch or record.',
  ]) {
    assert.ok(ledger.includes(token), `the ledger write bound states: ${token}`);
  }
  assert.match(
    text,
    /`worktree resume-check` and `ledger reconcile` only read: they take no lock and write nothing/,
    'the read-only resume operations must be stated as such',
  );
  assert.doesNotMatch(text, /each call prompts/, 'no allowlisted operation is said to prompt');
  for (const operation of [
    'ledger init',
    'ledger append',
    'ledger reconcile',
    'worktree resume-check',
  ]) {
    assert.ok(ALLOWLISTED_OPERATIONS.includes(operation), `${operation} is allowlisted`);
  }
});

// Invariant: `review write-report` writes model-supplied content without a prompt, so it is
// allowlisted and the prose states its bound: a new generated-name report below
// `.effective-flow/review/`, never an overwrite, input capped at 64 KiB, IDs consumed only by a
// successful reservation, and the legacy-directory migration it may run, root `.sf-memory.json`
// adoption and removal included.
test('the allowlist step allowlists review write-report and states its bound', () => {
  assert.ok(ALLOWLISTED_OPERATIONS.includes('review write-report'));
  assert.ok(STATE_OPERATIONS.includes('review write-report'));
  assert.match(
    flat(allowlist),
    /For its report, `review write-report` writes only a new, generated-name file below `\.effective-flow\/review\/` \(through a `\.write-report-\*\.tmp` sibling\) and the ID counter in `\.effective-flow\/memory\.json`, never overwrites a report, takes at most 64 KiB of input, and consumes IDs only with a successful reservation\. Separately, and only without the migration marker, it first runs the legacy-directory migration under that operation's own bound \(no-clobber copy into `\.effective-flow\/`, memory merge, marker, adopting and removing a root `\.sf-memory\.json` through its own guard class\)/,
  );
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
// mode, `info/exclude` in hidden mode and in a linked worktree — only after the user's yes, and
// hidden mode owns the second exclude line. In a linked worktree the standard remedy never creates
// or edits the main checkout's `.gitignore`, which a later pull of the tracked file would collide with.
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
    /When `setup-allowlist` returns `SETTINGS_NOT_IGNORED` in hidden mode or in a linked worktree and the user answered yes to its ignore remedy's question, apply items 1 and 3 to the line `\.claude\/settings\.local\.json`/,
  );
  // The keyword form needs no configuration: it reads only the roots and the visibility to pick
  // the remedy.
  assert.match(
    text,
    /It needs no existing configuration: make Step 2 item 2's read-only resolution call with `tool: "setup"` and take only `data\.runtimeStateRoot`, `data\.checkoutRoot` and `data\.visibility`/,
  );
  const standardRemedy = text.slice(standard, hidden);
  assert.match(
    standardRemedy,
    /In a linked worktree \(`data\.checkoutRoot` differs from `data\.runtimeStateRoot`\) use the hidden-mode remedy instead and never create or edit `<RUNTIME_STATE_ROOT>\/\.gitignore`/,
  );
  assert.match(
    allowlist,
    /```lazy-include\nsetup-hidden-mode\nwhen: the helper returned `SETTINGS_NOT_IGNORED` and either the visibility is `hidden` or `data\.checkoutRoot` differs from `data\.runtimeStateRoot`\n/,
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
// later call uses (owned by the `helper-call-shape` fragment), because a rule must name the path
// Claude Code sees; the helper's CLAUDECODE gate is the authoritative harness check.
test('the allowlist step passes the unresolved skill root and relies on the helper gate', () => {
  const text = flat(allowlist);
  assert.match(allowlist, /^```include\nhelper-call-shape\n```$/m);
  assert.match(
    flat(readSource('shared', 'helper-call-shape.md')),
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
