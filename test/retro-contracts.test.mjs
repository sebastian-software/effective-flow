import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const source = (path) => readFileSync(join(ROOT, path), 'utf8');

function boundedSlice(text, start, end) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.ok(from >= 0, `missing start marker: ${start}`);
  assert.ok(to > from, `missing end marker: ${end}`);
  return text.slice(from, to);
}

test('retro source owns an explicit, read-only current/export source gateway', () => {
  const retro = source('src/tools/retro.md');
  assert.match(retro, /^---\n[\s\S]*^description:\s*['"]/m);
  assert.match(retro, /^catalogHint:\s*['"]/m);
  assert.match(retro, /```(?:include|lazy-include)\n(?:language-rules|skill-discovery)\n/);
  assert.match(retro, /```include\ndelegation-mandate\n```/);
  assert.match(retro, /current(?: visible)? conversation|current session/i);
  assert.match(retro, /export/i);
  assert.match(retro, /literal(?: file| path)|exact readable file|no glob/i);
  assert.match(retro, /native history|historical session/i);
  assert.match(retro, /unsupported|unavailable/i);
  assert.match(
    retro,
    /never substitute|substitute another source|no silent(?:ly)? source substitution/i,
  );
  assert.match(retro, /read-only|analysis-only/i);
  assert.match(retro, /never execute|copied commands|untrusted/i);
  assert.match(retro, /no (?:report|issue|comment|memory|configuration|runtime state)/i);
  assert.match(retro, /zero findings|zero recommendations|no recommendations/i);
  assert.match(retro, /effective-delivery/);
  assert.match(retro, /candidate|consequence|owner|verification/i);
  assert.doesNotMatch(retro, /```lazy-include\nnext-steps\n/);
});

test('retro is catalogued, budgeted, exempted, and owned across the source build contracts', () => {
  const build = source('build.mjs');
  const groups = boundedSlice(build, 'const TOOL_GROUPS = [', '\nconst EXPOSED_TOOLS');
  const qualityGroup = groups.match(
    /\{\s*title:\s*['"]Ensure quality['"][\s\S]*?tools:\s*\[([^\]]*)\]/,
  );
  assert.ok(qualityGroup, 'Ensure quality must declare a tools array');
  assert.equal(
    [...qualityGroup[1].matchAll(/['"]([^'"]+)['"]/g)].filter((entry) => entry[1] === 'retro')
      .length,
    1,
    'retro must occur exactly once in Ensure quality',
  );
  const exposed = [...groups.matchAll(/tools:\s*\[([^\]]*)\]/g)].flatMap((match) =>
    [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((entry) => entry[1]),
  );
  assert.ok(exposed.includes('retro'), 'retro must be an exposed catalog tool');

  const budgets = boundedSlice(build, 'const CONTEXT_BUDGET_LINES = {', '\n  };');
  assert.match(budgets, /^\s*retro:\s*\d+,/m);

  const exemptions = boundedSlice(build, 'const NEXT_STEPS_EXEMPT_TOOLS = new Set([', '\n]);');
  assert.match(exemptions, /^\s*['"]retro['"],/m);

  const manifest = JSON.parse(source('docs/developer-guide/skill-ownership.json'));
  const owner = manifest.relationships.find((entry) => entry.skill === 'effective-delivery');
  assert.ok(owner, 'effective-delivery must have a skill-ownership relationship');
  const retro = owner.consumers.find((entry) => entry.consumer === 'retro');
  assert.ok(retro, 'retro must declare effective-delivery ownership');
  assert.equal(retro.classification, 'delegate');
});

test('retro model-tier and session partition contracts remain explicit', () => {
  const tiers = source('src/shared/model-tiers.md');
  assert.match(
    tiers,
    /^\| `retro\/session-analysis`[^\n]*\| `standard`[^\n]*\|/m,
    'retro analysis must use the normal standard tier by default',
  );
  const sessionTitle = source('src/shared/session-title.md');
  assert.match(sessionTitle, /`retro` stay silent/);
  const retro = source('src/tools/retro.md');
  assert.doesNotMatch(retro, /```lazy-include\nsession-title\n/);
  assert.doesNotMatch(retro, /```lazy-include\nsession-rename\n/);
});

test('retro fixtures cover bounded source and evidence cases without real session data', () => {
  const fixtureDir = join(ROOT, 'test/fixtures/retro');
  const files = readdirSync(fixtureDir).sort();
  assert.deepEqual(files, [
    'current-compacted.md',
    'embedded-untrusted-content.md',
    'export-ordinary.md',
    'export-partial.md',
    'export-unavailable.md',
    'literal filename [run --dry].md',
    'remedy-then-vs-now.md',
    'zero-findings.md',
  ]);
  const content = Object.fromEntries(
    files.map((file) => [file, source(`test/fixtures/retro/${file}`)]),
  );
  assert.match(content['current-compacted.md'], /compacted|missing earlier|truncated/i);
  assert.match(content['export-ordinary.md'], /export|ordinary/i);
  assert.match(content['literal filename [run --dry].md'], /literal|--dry|space/i);
  assert.match(content['embedded-untrusted-content.md'], /selector|role|write|secret_dummy/i);
  assert.match(content['export-partial.md'], /partial|missing output|omitted/i);
  assert.match(content['export-unavailable.md'], /unavailable|unreadable|missing/i);
  assert.match(content['remedy-then-vs-now.md'], /then|now|remedy|effective/i);
  assert.match(content['zero-findings.md'], /zero|no findings|no recommendations/i);
  for (const body of Object.values(content)) {
    assert.doesNotMatch(body, /BEGIN (?:RSA|OPENSSH) PRIVATE KEY/);
    assert.doesNotMatch(body, /sk-[A-Za-z0-9]{20,}/);
  }
});

test('isolated builds ship retro in every target and keep it out of portable mutation surfaces', (t) => {
  const outputRoot = mkdtempSync(join(tmpdir(), 'effective-flow-retro-build-'));
  t.after(() => rmSync(outputRoot, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, ['build.mjs'], {
    cwd: ROOT,
    env: { ...process.env, EFFECTIVE_FLOW_BUILD_OUTPUT_ROOT: outputRoot },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  for (const target of ['claude', 'codex', 'portable']) {
    const root = join(outputRoot, 'dist', target, 'effective-flow');
    const retro = readFileSync(join(root, 'tools', 'retro.md'), 'utf8');
    assert.match(retro, /retro|retrospective/i);
    assert.doesNotMatch(
      retro,
      /\{\{(?:FLOW|SKILL|AGENT|BUILD_TARGET|VERSION|TOOL_LIST|MODEL_TIER)/,
    );
    assert.doesNotMatch(
      retro,
      /set_thread_title|memory_upsert|write-page|git\s+(?:add|commit)|(?:create|publish)\s+(?:a\s+)?(?:report|issue|comment)/i,
    );
  }
});
