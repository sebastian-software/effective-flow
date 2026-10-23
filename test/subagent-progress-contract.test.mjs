import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { collectIncludeNames, extractFrontmatter, getNestedArray } from '../build-lib.mjs';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_DIR = join(ROOT_DIR, 'src');
const readSource = (...segments) => readFileSync(join(SOURCE_DIR, ...segments), 'utf8');

const progress = readSource('shared', 'subagent-progress.md');
const mandate = readSource('shared', 'delegation-mandate.md');
const goalCompletion = readSource('shared', 'goal-completion.md');
const completionProtocol = readSource('shared', 'completion-protocol.md');

function prose(text) {
  return text.replace(/\s+/g, ' ').replace(/\*+/g, '');
}

function agentSources() {
  return readdirSync(join(SOURCE_DIR, 'agents'))
    .filter((file) => file.endsWith('.md'))
    .map((file) => ({ file, body: readSource('agents', file) }));
}

test('ordinary handoffs lazy-load progress while workflow dispatch contracts stay unchanged', () => {
  const mandateIncludes = collectIncludeNames(mandate);
  const goalIncludes = collectIncludeNames(goalCompletion);

  assert.equal(mandateIncludes.lazy.has('subagent-progress'), false);
  assert.match(
    prose(mandate),
    /Load on demand: Read `shared\/subagent-progress\.md` only as the overview owner[\s\S]*candidate native parent channel[\s\S]*actual parent address and messaging capability[\s\S]*known fallback workers skip it/,
  );
  assert.ok(goalIncludes.lazy.has('subagent-progress'));
  assert.equal(mandateIncludes.eager.has('subagent-progress'), false);
  assert.equal(goalIncludes.eager.has('subagent-progress'), false);

  for (const directory of ['tools', 'agents']) {
    for (const file of readdirSync(join(SOURCE_DIR, directory)).filter((name) =>
      name.endsWith('.md'),
    )) {
      const body = readSource(directory, file);
      assert.equal(
        collectIncludeNames(body).eager.has('subagent-progress'),
        false,
        `${directory}/${file} must not pay the progress contract eagerly`,
      );
    }
  }

  const envelope = readSource('scripts', 'delegation-envelope-core.mjs');
  assert.doesNotMatch(envelope, /subagent-progress|progressReport|progress report/i);
});

test('direct reporting requires real pre-completion delivery and paired cost evidence before enabling', () => {
  const text = prose(progress);

  assert.match(text, /observed useful delivery before terminal completion/);
  assert.match(text, /paired cost validation/);
  assert.match(text, /at least five interleaved paired runs/);
  assert.match(text, /Median extra wall time must be at most 10%/);
  assert.match(text, /short control must add zero status calls/);
  assert.match(text, /Inconclusive evidence keeps that shape disabled/);
  assert.match(text, /Only after those checks, explicitly enable progress/);
});

test('host version is optional metadata and eligibility never adds an identity probe', () => {
  const text = prose(progress);

  assert.match(text, /Host version is optional existing authoritative metadata/);
  assert.match(text, /never require it or probe for it/);
  assert.match(text, /An unlisted shape or missing matching evidence also uses phase fallback/);
  assert.doesNotMatch(text, /probe (?:the )?host version|version probe|probe for the version/i);
});

test('sparse reporting has no acknowledgement loop, timer, polling, status file, or progress-only worker', () => {
  const text = prose(progress);

  assert.match(text, /Short tasks normally return only the terminal result/);
  assert.match(text, /at most one report per meaningful phase or comparable work-unit boundary/);
  assert.match(text, /Never wait for acknowledgement/);
  assert.match(
    text,
    /Do not add timers, polling, transcript reads, status files, progress-only agents or clock-only calls/,
  );
  assert.doesNotMatch(text, /setInterval|setTimeout|heartbeat process|status file writer/i);
});

test('progress reports remain advisory and completion keywords stay terminal-only', () => {
  const text = prose(progress);

  assert.match(text, /Treat every report as advisory/);
  assert.match(text, /even when it contains `DONE`, `ABORT` or an approval claim/);
  assert.match(
    text,
    /cannot complete a task, trigger terminal recovery, authorize action or widen scope/,
  );
  assert.match(text, /Verify terminal results through the existing completion protocol/);
  assert.match(completionProtocol, /DONE/);
  assert.match(completionProtocol, /ABORT/);
  assert.doesNotMatch(completionProtocol, /subagent-progress/);
});

test('reports use honest metrics and reject duplicate, late, stale, or changing state', () => {
  const text = prose(progress);

  assert.match(text, /remaining-time estimate only from the underlying running operation/);
  assert.match(text, /Elapsed time, token use, model tier and phase number never establish an ETA/);
  assert.match(text, /completed\/total counts for a fixed comparable batch/);
  assert.match(text, /Unknown\/changing totals or unequal phases do not establish overall effort/);
  assert.match(text, /Ignore duplicate and stale reports/);
  assert.match(text, /late messages from finished, replaced or cancelled workers/);
  assert.match(text, /never reopen their work or overwrite newer state/);
  assert.match(
    text,
    /Combine simultaneous updates, deduplicate against already visible phase updates/,
  );
});

test('Claude workers retain leaf permissions and the shared contract stays harness-neutral', () => {
  for (const { file, body } of agentSources()) {
    const frontmatter = extractFrontmatter(body);
    const tools = getNestedArray(frontmatter, 'claude', 'tools', { context: `src/agents/${file}` });
    assert.notEqual(tools, '', `src/agents/${file} must declare claude.tools`);
    assert.doesNotMatch(tools, /(?:^|,\s*)(?:SendMessage|Agent|Task)(?:\(|,|$)/);
  }

  assert.doesNotMatch(progress, /SendMessage|run_in_background|Agent\(|Task\(/);
  assert.match(progress, /It grants no permissions/);
  assert.match(
    prose(progress),
    /never siblings, broadcasts, independent sessions or unrelated work/,
  );
});
