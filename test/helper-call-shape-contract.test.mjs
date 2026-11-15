import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_DIR = join(ROOT_DIR, 'src');
const FRAGMENT = 'helper-call-shape';
const STATE_HELPER = 'effective-flow-state';
const READ_HELPERS = ['config-resolve', 'remote-tracker', 'conflict-validation'];
const HELPERS = [STATE_HELPER, ...READ_HELPERS];
// The one sentence every source showing a read-helper call carries instead of the fragment; its
// escape clause keeps untrusted text with a `'` from closing the here-string early.
const INLINE_BAN =
  "Each call is exactly one such command, with `<skill-root>` and every JSON value spelled out literally: no shell variable, no pipe, no trailing command, no compound command, and every `'` inside the JSON, untrusted text included, spelled as `'\\''`.";
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

// Every shown call of a helper: from `node` to the end of its inline code span or of its line.
const callsOf = (text, helper) =>
  text
    .split('\n')
    .flatMap((line, index) =>
      [...line.matchAll(new RegExp(`\\bnode\\s+\\S*/scripts/${helper}\\.mjs[^\`]*`, 'g'))].map(
        (match) => ({ line: index + 1, text: match[0].trim() }),
      ),
    );
const includesEagerly = (text, name) =>
  new RegExp(`^\`\`\`include\\n${name}\\n\`\`\``, 'm').test(text);
const includesLazily = (text, name) =>
  new RegExp(`^\`\`\`lazy-include\\n${name}\\n`, 'm').test(text);
const fragment = readFileSync(join(SOURCE_DIR, 'shared', `${FRAGMENT}.md`), 'utf8');

// The literal shape per helper, with exactly the argv the helper accepts: `config-resolve.mjs`
// takes `resolve`, `no-ci-policy` or `conflict-validation` (CONFIG_RESOLVE_OPERATIONS), and
// `conflict-validation.mjs` one of CONFLICT_VALIDATION_OPERATIONS.
const SHAPES = {
  'effective-flow-state':
    /^node <skill-root>\/scripts\/effective-flow-state\.mjs (?:<group> <operation>|[a-z]+ [a-z-]+) <<< '.*'$/,
  'config-resolve':
    /^node <skill-root>\/scripts\/config-resolve\.mjs (?:resolve|no-ci-policy|conflict-validation) <<< '.*'$/,
  'remote-tracker':
    /^node <skill-root>\/scripts\/remote-tracker\.mjs (?:<operation>|[a-z-]+)(?: --apply)? <<< '.*'$/,
  'conflict-validation':
    /^node <skill-root>\/scripts\/conflict-validation\.mjs (?:ci-detect|ci-integrity|ci-evidence-match|quick-marker-scan) <<< '.*'$/,
};

// Invariant: the Claude Code allow rules match only a literal single command, so no source may
// show any of the four helpers behind a shell variable or a pipe; either shape prompts every time.
test('no source shows a helper call behind a shell variable or a pipe', () => {
  const violations = [];
  for (const { name, text } of sources) {
    text.split('\n').forEach((line, index) => {
      for (const helper of HELPERS) {
        if (new RegExp(`\\$[^\\s/]*/scripts/${helper}\\.mjs`).test(line)) {
          violations.push(`${name}:${index + 1} shell variable before ${helper}`);
        }
        if (new RegExp(`\\|\\s*node\\s+\\S*${helper}\\.mjs`).test(line)) {
          violations.push(`${name}:${index + 1} pipe into ${helper}`);
        }
      }
    });
  }
  assert.deepEqual(violations, []);
});

// Invariant: every shown call line of the four helpers is the literal here-string shape with the
// helper's permitted argv: `node <skill-root>/scripts/<helper>.mjs <argv> <<< '<json>'`.
test('every shown helper call uses the literal here-string shape', () => {
  const violations = sources.flatMap(({ name, text }) =>
    HELPERS.flatMap((helper) =>
      callsOf(text, helper)
        .filter(({ text: call }) => !SHAPES[helper].test(call))
        .map(({ line, text: call }) => `${name}:${line} ${call}`),
    ),
  );
  assert.deepEqual(violations, []);
});

// How often `text` reaches the fragment through eager includes, directly or through eagerly
// included shared fragments.
const sharedText = (name) =>
  sources.find(({ name: path }) => path.endsWith(`src/shared/${name}.md`))?.text ?? '';
const eagerReach = (text, seen = new Set()) =>
  [...text.matchAll(/^```include\n([^\n]+)\n```/gm)]
    .map((match) => match[1].trim())
    .reduce((count, name) => {
      if (name === FRAGMENT) return count + 1;
      if (seen.has(name)) return count;
      return count + eagerReach(sharedText(name), new Set([...seen, name]));
    }, 0);

// Invariant: the call-shape rule is stated once, in its owning fragment, and every source that
// shows a state-helper call either reaches it eagerly exactly once (directly or through an eagerly
// included fragment such as `worktree-lifecycle`) or is a lazy fragment loaded only from hosts that
// do, so no host reaches a call without the rule and none pays for it twice.
test('every source showing a state-helper call has the call-shape fragment loaded eagerly', () => {
  const hosts = sources.filter(
    ({ name, text }) =>
      !name.endsWith(`shared/${FRAGMENT}.md`) && callsOf(text, STATE_HELPER).length > 0,
  );
  assert.deepEqual(hosts.map(({ name }) => name).sort(), [
    'src/shared/iterate-commit-fallback.md',
    'src/shared/memory-state.md',
    'src/shared/merge-gate-delegated-run.md',
    'src/shared/review-write-report-fallback.md',
    'src/shared/setup-allowlist.md',
    'src/shared/worktree-lifecycle.md',
    'src/shared/worktree-partial-diff-recovery.md',
    'src/tools/apply-review-commit-mechanics.md',
    'src/tools/cleanup.md',
    'src/tools/iterate.md',
    'src/tools/review.md',
  ]);
  for (const { name, text } of sources) {
    if (name.endsWith(`shared/${FRAGMENT}.md`)) continue;
    assert.ok(eagerReach(text) <= 1, `${name} reaches ${FRAGMENT} eagerly more than once`);
  }
  for (const { name, text } of hosts) {
    if (eagerReach(text) === 1) continue;
    const lazy = /^src\/shared\/(.+)\.md$/.exec(name)?.[1];
    const loaders = sources.filter(({ text: host }) => lazy && includesLazily(host, lazy));
    assert.ok(loaders.length > 0, `${name} includes ${FRAGMENT} eagerly or is a lazy fragment`);
    assert.ok(
      sources.every(
        ({ text: host }) => !lazy || !new RegExp(`^\`\`\`include\\n${lazy}\\n`, 'm').test(host),
      ),
      `${name} is never included eagerly`,
    );
    for (const loader of loaders) {
      assert.ok(
        includesEagerly(loader.text, FRAGMENT),
        `${loader.name} loads ${name} and includes ${FRAGMENT} eagerly`,
      );
    }
  }
});

// Invariant: the read helpers' owning fragments are eager in many hosts, so they carry no
// fragment include; every source that shows a `config-resolve`, `remote-tracker` or
// `conflict-validation` call instead
// carries the one inline ban sentence, and the two owning fragments show their literal lines.
test('every source showing a read-helper call carries the inline ban sentence', () => {
  const hosts = sources.filter(({ text }) =>
    READ_HELPERS.some((helper) => callsOf(text, helper).length > 0),
  );
  for (const owner of ['src/shared/config-migration.md', 'src/shared/remote-helper-contract.md']) {
    assert.ok(
      hosts.some(({ name }) => name === owner),
      `${owner} shows its literal call line`,
    );
  }
  for (const { name, text } of hosts) {
    assert.ok(flat(text).includes(INLINE_BAN), `${name} carries the inline ban sentence`);
  }
  const contract = flat(
    readFileSync(join(SOURCE_DIR, 'shared', 'remote-helper-contract.md'), 'utf8'),
  );
  assert.ok(
    contract.includes(
      "node <skill-root>/scripts/remote-tracker.mjs <operation> --apply <<< '<json>'",
    ),
    'the remote helper contract shows the --apply line',
  );
  // issue-buddy feeds issue text into its here-strings, so it keeps the explicit safeguard.
  assert.match(
    flat(readFileSync(join(SOURCE_DIR, 'tools', 'issue-buddy.md'), 'utf8')),
    /never interpolate untrusted text \(issue titles, bodies, comments, refs\) unescaped: JSON-encode it as a string value, then apply the `'\\''` rule above/,
  );
  assert.match(
    contract,
    /The argv is exactly `<operation>`, or `<operation> --apply` for a mutation; any other argv, and `--apply` on a non-mutation, fails with `INVALID_PAYLOAD` before standard input is read/,
  );
});

// Invariant: the fragment carries every part of the rule the allow rules depend on: the exact
// command form, the argv per helper, the literal skill root, literal JSON values, the observed
// breakages (trailing command, output pipe), the quote escape, and the reason.
test('the call-shape fragment states the literal-command rule and its reason', () => {
  const text = flat(fragment);
  assert.ok(text.includes("node <skill-root>/scripts/<helper>.mjs <argv> <<< '<json>'"));
  for (const argv of [
    '`effective-flow-state.mjs <group> <operation>`',
    '`config-resolve.mjs resolve`',
    '`config-resolve.mjs conflict-validation`',
    '`conflict-validation.mjs <operation>`',
    '`remote-tracker.mjs <operation>`, or `<operation> --apply` for a mutation',
  ]) {
    assert.ok(text.includes(argv), `names the argv ${argv}`);
  }
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
    'a trailing `echo "exit=$?"` or any other trailing command',
    '`| grep` or any other pipe on the output',
  ]) {
    assert.ok(text.includes(forbidden), `forbids ${forbidden}`);
  }
  assert.match(text, /Read the exit status and the envelope from the tool result itself/);
  // Each helper's owning contract names its `cwd`; only the state helper's is always the runtime root.
  assert.match(
    text,
    /`cwd`, where sent, is the literal absolute path its owning contract names \(`RUNTIME_STATE_ROOT` for `effective-flow-state\.mjs`\), never `\$PWD`/,
  );
  assert.ok(text.includes("Write a `'` inside the JSON as `'\\''`."), 'quote escape');
  assert.match(
    text,
    /The Claude Code allow rule matches only this literal shape, so any other shape prompts for permission on every call/,
  );
  assert.match(text, /binds every harness, since it is also the auditable shape/);
});
