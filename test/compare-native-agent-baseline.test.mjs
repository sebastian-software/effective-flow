import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collectAgentSourceInputs,
  formatBaselineReport,
  sourceChangedWorkers,
  sourceInputsChanged,
} from '../scripts/compare-native-agent-baseline.mjs';

function reader(files) {
  return (relativePath) =>
    Object.hasOwn(files, relativePath) ? Buffer.from(files[relativePath], 'utf8') : null;
}

const BASE = Object.freeze({
  'src/agents/alpha.md': '# Alpha\n\n```include\nouter\n```\n',
  'src/agents/beta.md':
    '# Beta\n\n```lazy-include\nlazy-target\nwhen: invoked directly\n```\n\nBody.\n',
  'src/shared/outer.md': 'Outer.\n\n```include\ninner\n```\n',
  'src/shared/inner.md': 'Inner.\n',
  'src/shared/lazy-target.md': 'Lazy.\n',
});

function changedWorkers(working) {
  return sourceChangedWorkers(
    ['effective-flow-alpha', 'effective-flow-beta'],
    reader(BASE),
    reader(working),
  );
}

test('collects the agent file plus every transitively eager-included fragment', () => {
  const inputs = collectAgentSourceInputs('alpha', reader(BASE));
  assert.deepEqual(
    [...inputs.keys()],
    ['src/agents/alpha.md', 'src/shared/inner.md', 'src/shared/outer.md'],
  );
});

test('a lazy-include pointer target is not a source input', () => {
  const inputs = collectAgentSourceInputs('beta', reader(BASE));
  assert.deepEqual([...inputs.keys()], ['src/agents/beta.md']);
});

test('unchanged inputs keep every worker in the byte comparison', () => {
  assert.deepEqual(changedWorkers({ ...BASE }), []);
});

test('a changed agent file exempts only that worker', () => {
  assert.deepEqual(changedWorkers({ ...BASE, 'src/agents/beta.md': '# Beta, edited\n' }), [
    'effective-flow-beta',
  ]);
});

test('a changed transitively included fragment exempts its consumer', () => {
  assert.deepEqual(changedWorkers({ ...BASE, 'src/shared/inner.md': 'Inner, edited.\n' }), [
    'effective-flow-alpha',
  ]);
});

test('a newly added eager include is a membership change', () => {
  const working = {
    ...BASE,
    'src/agents/beta.md': `${BASE['src/agents/beta.md']}\n\`\`\`include\ninner\n\`\`\`\n`,
  };
  assert.deepEqual(changedWorkers(working), ['effective-flow-beta']);
});

test('a changed lazy-include pointer target keeps its consumer compared', () => {
  assert.deepEqual(changedWorkers({ ...BASE, 'src/shared/lazy-target.md': 'Lazy, edited.\n' }), []);
});

test('a missing input on one side counts as changed', () => {
  const base = new Map([['src/agents/alpha.md', Buffer.from('a')]]);
  assert.equal(sourceInputsChanged(base, new Map([['src/agents/alpha.md', null]])), true);
  assert.equal(
    sourceInputsChanged(base, new Map([['src/agents/alpha.md', Buffer.from('a')]])),
    false,
  );
});

test('a worker without the Effective Flow prefix is rejected', () => {
  assert.throws(
    () => sourceChangedWorkers(['alpha'], reader(BASE), reader(BASE)),
    /lacks the effective-flow- prefix/,
  );
});

test('the report names exempt workers on a second line only when there are any', () => {
  assert.equal(formatBaselineReport('abc1234', []), 'Native base agents match abc1234\n');
  assert.equal(
    formatBaselineReport('abc1234', ['effective-flow-a', 'effective-flow-b']),
    'Native base agents match abc1234\n' +
      'Source-changed since abc1234 (not compared): effective-flow-a, effective-flow-b\n',
  );
});
