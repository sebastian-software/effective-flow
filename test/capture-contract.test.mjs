import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const source = read('src/tools/capture.md');
test('capture refuses automation and non-remote or hidden targets before tracker access', () => {
  for (const token of [
    'Run state:',
    '--- end of control lines ---',
    'non-interactive',
    'tracker.mode: local',
    'external',
    'unset',
    'hidden mode',
    'before any tracker access',
    'Ask no tracker-mode question',
    'run no `sf-` migration',
  ])
    assert.ok(source.includes(token), token);
});
test('capture owns a fixed standalone body schema, forge language and attribution boundary', () => {
  for (const token of [
    'Problem',
    'Current state (verified references)',
    'Proposal',
    'Acceptance criteria',
    'Open questions',
    'Every tracker',
    'comments included',
    'language.forge',
    'no-attribution rule',
    'run, thread and pull-request numbers from the originating session',
    'Tracker references a reader needs remain allowed',
  ])
    assert.ok(source.toLowerCase().includes(token.toLowerCase()), token);
  assert.doesNotMatch(source, /```(?:include|lazy-include)\nissue-tracker(?:-forge)?\n/);
});
test('capture keeps the triage include boundary and loads publication contracts only on demand', () => {
  for (const name of ['chat-language', 'delegation-mandate', 'skill-discovery'])
    assert.ok(source.includes(`\x60\x60\x60include\n${name}\n`));
  for (const name of [
    'completion-protocol',
    'config-migration',
    'language-rules',
    'runtime-state-safety',
    'effective-flow-dir-migration',
    'remote-helper-contract',
    'next-steps',
    'security-disclosure-gate',
    'base-branch-resolution',
    'host-pr-watch',
  ])
    assert.ok(source.includes(`\x60\x60\x60lazy-include\n${name}\n`));
});
test('capture revision repeats drafting, classification and reference checks at the same base', () => {
  assert.match(
    source,
    /rerun the `capture\/draft` leaf[\s\S]*reclassify,[\s\S]*Rerun the reference-check worker[\s\S]*same base SHA/,
  );
  assert.match(source, /recomputing duplicates without another forge read/);
  assert.match(source, /old entries are superseded/);
});
test('capture binds separate disclosure and acknowledgement gates to the selected hash', () => {
  for (const token of [
    'visibility unknown — treated as public',
    'Skip (default)',
    'Confirm disclosure',
    'both create and comment',
    'never de-escalate',
    'no created issue or comment refers to a skipped flagged draft',
    'selected entry hash',
    'Immediately after each draft',
    'disclosure:"confirmed"',
  ])
    assert.ok(source.includes(token), token);
  const gate = read('src/shared/security-disclosure-gate.md');
  assert.match(
    gate,
    /### Capture drafts[\s\S]*Local dedup, Local-first persistence[\s\S]*Pre-commit use do not apply/,
  );
  assert.match(gate, /Silence in public artifacts/);
});
test('capture uses opaque helper files, per-run cleanup and once-only writes', () => {
  for (const token of [
    'never open, copy, edit or',
    'input-<runId>-build-<n>.json',
    'every ending',
    'run-remove',
    'pending in the apply ledger',
    'Never retry an unknown write',
    'two-minute clock-skew allowance',
  ])
    assert.ok(source.includes(token), token);
});
test('capture is the first catalog group and has registered runtime, tiers and next steps', () => {
  assert.match(read('build.mjs'), /const TOOL_GROUPS = \[\s*\{\s*title: 'Record work'/);
  for (const file of ['capture.mjs', 'capture-core.mjs'])
    assert.ok(read('build.mjs').includes(`'${file}'`));
  for (const site of ['capture/draft', 'capture/reference-check'])
    assert.ok(read('src/shared/model-tiers.md').includes(site));
  assert.match(
    read('src/shared/next-steps.md'),
    /capture\s*\| created issue\s*\| \{\{SKILL:triage\}\} #<N>/,
  );
  assert.match(read('src/shared/next-steps.md'), /`capture` run that created no issue/);
});
test('T3 issue links follow the host dispatch and have a single nonblocking attempt', () => {
  const host = read('src/shared/host-pr-watch.md');
  assert.ok(host.indexOf('### Issue linking') > host.indexOf('## T3 Code:'));
  assert.match(host, /`link_issue` once per created issue/);
  assert.match(host, /never retry it/);
});
test('autopilot consumes normalized repository visibility without a provider branch', () => {
  const autopilot = read('src/tools/autopilot.md');
  const at = autopilot.indexOf('repository-visibility-read');
  assert.ok(at >= 0);
  assert.doesNotMatch(
    autopilot.slice(Math.max(0, at - 500), at + 800),
    /provider\s*===|provider:\s*"(?:github|forgejo)"|GitHub only/,
  );
  for (const file of [
    'docs/user-guide/tools-automation.md',
    'docs/user-guide/remote-tracker.md',
    'docs/developer-guide/architecture.md',
  ])
    assert.match(read(file), /private Forgejo repository[\s\S]*neutral[\s\S]*draft pull request/);
});
