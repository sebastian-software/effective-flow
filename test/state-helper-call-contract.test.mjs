import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_DIR = join(ROOT_DIR, 'src');
const FRAGMENT = 'state-helper-call';
const HELPER = 'effective-flow-state.mjs';
const flat = (text) => text.replace(/\s+/g, ' ');

const markdownSources = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownSources(path);
    return entry.name.endsWith('.md') ? [path] : [];
  });

const sources = markdownSources(SOURCE_DIR).map((path) => ({
  name: relative(ROOT_DIR, path),
  text: readFileSync(path, 'utf8'),
}));
const callLines = (text) =>
  text
    .split('\n')
    .map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter(({ text }) => new RegExp(`\\bnode\\s+\\S*${HELPER.replace('.', '\\.')}`).test(text));
const includesEagerly = (text, name) =>
  new RegExp(`^\`\`\`include\\n${name}\\n\`\`\``, 'm').test(text);
const fragment = readFileSync(join(SOURCE_DIR, 'shared', `${FRAGMENT}.md`), 'utf8');

// Invariant: the Claude Code allow rule `Bash(node <absolute skill root>/scripts/
// effective-flow-state.mjs <group> <operation> *)` matches only a literal single command, so no
// source may show the helper behind a shell variable or a pipe; either shape prompts every time.
test('no source shows an effective-flow-state.mjs call in a non-literal shape', () => {
  const violations = [];
  for (const { name, text } of sources) {
    text.split('\n').forEach((line, index) => {
      if (/\$[^\s/]*\/scripts\/effective-flow-state\.mjs/.test(line)) {
        violations.push(`${name}:${index + 1} shell variable before the helper path`);
      }
      if (/\|\s*node\s+\S*effective-flow-state\.mjs/.test(line)) {
        violations.push(`${name}:${index + 1} pipe into the helper`);
      }
    });
  }
  assert.deepEqual(violations, []);
});

// Invariant: every shown call uses the one literal shape the call-shape rule prescribes:
// `node <skill-root>/scripts/effective-flow-state.mjs <group> <operation> <<< '<json>'`.
test('every shown effective-flow-state.mjs call uses the literal here-string shape', () => {
  const shape =
    /^node <skill-root>\/scripts\/effective-flow-state\.mjs (?:<group> <operation>|[a-z]+ [a-z-]+) <<< '.*'$/;
  const violations = sources.flatMap(({ name, text }) =>
    callLines(text)
      .filter(({ text: line }) => !shape.test(line))
      .map(({ line, text: shown }) => `${name}:${line} ${shown}`),
  );
  assert.deepEqual(violations, []);
});

// Invariant: the call-shape rule is stated once, in its owning fragment, and every source that
// shows a helper call loads it eagerly, so no host reaches a call without the rule.
test('every source showing a helper call includes the call-shape fragment eagerly', () => {
  const hosts = sources.filter(
    ({ name, text }) => !name.endsWith(`shared/${FRAGMENT}.md`) && callLines(text).length > 0,
  );
  assert.deepEqual(hosts.map(({ name }) => name).sort(), [
    'src/shared/memory-state.md',
    'src/shared/setup-allowlist.md',
    'src/tools/apply-review-commit-mechanics.md',
    'src/tools/iterate.md',
  ]);
  for (const { name, text } of hosts) {
    assert.ok(includesEagerly(text, FRAGMENT), `${name} includes ${FRAGMENT} eagerly`);
  }
});

// Invariant: the fragment carries every part of the rule the allow rule depends on: the exact
// command form, the literal skill root, literal JSON values, the quote escape, and the reason.
test('the call-shape fragment states the literal-command rule and its reason', () => {
  const text = flat(fragment);
  assert.match(
    text,
    /node <skill-root>\/scripts\/effective-flow-state\.mjs <group> <operation> <<< '<json>'/,
  );
  assert.match(text, /Resolve `<skill-root>` from the currently loaded Effective Flow skill/);
  assert.match(text, /never resolved through `realpath`/);
  for (const forbidden of [
    'a shell variable',
    '`$PWD`',
    '`~`',
    'command substitution',
    '`cd … &&`',
    '`echo … |`',
    '`printf … |`',
    'a heredoc',
    'a loop or function',
    '`;`, `&&` or `||`',
  ]) {
    assert.ok(text.includes(forbidden), `forbids ${forbidden}`);
  }
  assert.match(text, /`cwd` is the literal absolute `RUNTIME_STATE_ROOT`, never `\$PWD`/);
  assert.ok(text.includes("Write a `'` inside the JSON as `'\\''`."), 'quote escape');
  assert.match(
    text,
    /The Claude Code allow rule matches only this literal shape, so any other shape prompts for permission on every call/,
  );
  assert.match(text, /binds every harness, since it is also the auditable shape/);
});
