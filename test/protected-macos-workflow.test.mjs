import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const workflow = readFileSync(
  path.join(root, '.github/workflows/protected-macos-validation.yml'),
  'utf8',
);
const protocol = readFileSync(
  path.join(root, 'src/scripts/protected-validation-protocol.mjs'),
  'utf8',
);
const { nativeOutcomes } = await import('../scripts/protected-macos-validation.mjs');

test('protected workflow is bounded to the validation snapshot push and read-only hosted macOS ARM lane', () => {
  assert.match(workflow, /push:\s*\n\s+branches: \['effective-flow\/validation\/\*'\]/);
  assert.match(workflow, /runs-on: macos-15/);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.doesNotMatch(workflow, /contents:\s*write|actions:\s*write|secrets\.|GITHUB_TOKEN/);
  for (const action of ['actions/checkout', 'pnpm/action-setup', 'actions/setup-node'])
    assert.match(workflow, new RegExp(`uses:\\s+${action.replace('/', '\\/')}@`));
});

test('workflow runner preserves the approved command order and requires every native case by literal name', () => {
  const commands = [
    'pnpm test:preflight',
    'pnpm agent:check',
    'pnpm test',
    'node build.mjs',
    'pnpm test:distribution',
  ];
  let previous = -1;
  for (const command of commands) {
    const literal = protocol.indexOf(`'${command}'`);
    assert.ok(literal >= 0, `missing command literal: ${command}`);
    assert.ok(literal > previous, `command order changed: ${command}`);
    previous = literal;
  }
  const nativeCases = [
    'actual Codex native guard permits fixture Git push and missing stub ledger while denying host writes in descendants',
    'production coordinator initializes native trust before capture and preserves raw outcomes before postcheck failure',
    'E2 actual launch wrapper checks a realpath write denial inherited by its child process',
    'production probeHelper captures actual subprocess start/completion and oversized rejection without a model',
    'macOS sandbox probe observes an outer seatbelt denial',
  ];
  for (const name of nativeCases)
    assert.ok(protocol.includes(name), `missing native case: ${name}`);
  const tap = nativeCases.map((name, index) => `ok ${index + 1} - ${name}`).join('\n');
  assert.deepEqual(
    nativeOutcomes(tap).map(({ outcome }) => outcome),
    nativeCases.map(() => 'passed'),
  );
  assert.deepEqual(
    nativeOutcomes(tap.replace(`ok 1 - ${nativeCases[0]}`, `ok 1 - ${nativeCases[0]} # SKIP`))[0]
      .outcome,
    'skipped',
  );
  assert.throws(() => nativeOutcomes(tap.split('\n').slice(1).join('\n')), /absent or duplicated/);
  assert.throws(() => nativeOutcomes(`${tap}\n${tap.split('\n')[0]}`), /absent or duplicated/);
});
