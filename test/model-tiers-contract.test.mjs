import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

import {
  collectSpawnSiteMarkers,
  extractFrontmatter,
  parseSpawnSiteTable,
  resolveAgentTier,
} from '../build-lib.mjs';
import { MODEL_TIER_MAPPINGS } from './support/native-profile-config.mjs';
import { executeOperation } from '../src/scripts/model-selection-core.mjs';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC_DIR = join(ROOT_DIR, 'src');
const MODEL_TIERS_PATH = 'shared/model-tiers.md';
const readSource = (path) => readFileSync(join(SRC_DIR, path), 'utf8');

// --- Detection rule ----------------------------------------------------------------------------
//
// A spawn instruction must carry its spawn-site marker in its own paragraph, so the rendered tier
// line sits at the decision point. The rule below decides what a paragraph is and which paragraphs
// are candidates; every candidate either carries a marker or is on SPAWN_MENTION_ALLOWLIST with the
// reason it is not a spawn instruction.
//
// Paragraphs (blocks) of one source:
// - Fenced code blocks are excluded entirely. Their interiors are build directives (include and
//   lazy-include names, a lazy pointer's `when:` trigger, ask fences) or verbatim examples; a
//   marker cannot sit inside a fence, and the spawn a trigger refers to is marked at its own site.
// - Outside fences, a blank line ends a block, and a heading line is a block of its own.
// - A line that opens a list item (`-`, `*`, `+`, or `1.`/`1)` followed by a space) starts a new
//   block unless it is nested deeper than the list item that opened the current block: a list item
//   is one block together with its continuation lines and its nested sub-items.
// A block is a candidate when it contains `{{AGENT:` or `{{AGENT_PROFILE:` (case-sensitive),
// `sub-agent`/`subagent` or `fan-out` in any case, or `Explore` as a capitalized word (the
// Explore subagent type; the lowercase verb is ordinary prose).
// Scope: every Markdown source under src/tools and src/shared except src/shared/model-tiers.md,
// whose table describes the sites rather than instructing a spawn.
// Correction and respawn phrasing ("delegate the repair to the routed Quality implementer") names
// no role placeholder and is deliberately no candidate: such a spawn has no site line and resolves
// through model-tiers.md's role-default rule, so a deep role never moves down there either.
const LIST_ITEM_RE = /^( *)(?:[-*+]|\d+[.)]) /;
const FENCE_RE = /^ *(`{3,}|~{3,})/;
const MARKER_LINE_RE = /^[ \t]*<!-- spawn-site:/;

function spawnRuleBlocks(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let current = null;
  let fence = null;
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };
  for (const [index, line] of lines.entries()) {
    const fenceMatch = line.match(FENCE_RE);
    if (fence) {
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence[0] &&
        fenceMatch[1].length >= fence.length &&
        line.trim() === fenceMatch[1]
      ) {
        fence = null;
      }
      continue;
    }
    if (fenceMatch) {
      flush();
      fence = fenceMatch[1];
      continue;
    }
    if (line.trim() === '') {
      flush();
      continue;
    }
    if (/^#{1,6} /.test(line)) {
      flush();
      blocks.push({ start: index + 1, lines: [line] });
      continue;
    }
    const item = line.match(LIST_ITEM_RE);
    if (
      item &&
      (!current || current.listIndent === undefined || item[1].length <= current.listIndent)
    ) {
      flush();
      current = { start: index + 1, lines: [], listIndent: item[1].length };
    }
    if (!current) current = { start: index + 1, lines: [] };
    current.lines.push(line);
  }
  flush();
  return blocks.map((block) => ({ start: block.start, text: block.lines.join('\n') }));
}

function isSpawnCandidate(text) {
  return (
    /\{\{AGENT(?:_PROFILE)?:/.test(text) ||
    /sub-?agent/i.test(text) ||
    /fan-out/i.test(text) ||
    /\bExplore\b/.test(text)
  );
}

// Candidate paragraphs that are not spawn instructions, keyed by source and a substring unique to
// the block among that source's candidates. A stale entry fails as loudly as a missing one.
const SPAWN_MENTION_ALLOWLIST = [
  [
    'tools/issue-buddy.md',
    '10. **Subagent capability.** Require a built-in subagent mechanism.',
    'capability check, not a spawn site',
  ],
  // Handoff, return format or result handling of a spawn marked elsewhere in the same source.
  [
    'tools/apply-issues.md',
    'Each analysis sub-agent receives',
    'handoff of apply-issues/issue-analysis',
  ],
  ['tools/pr.md', '**Bounds:** it starts no sub-agent', 'handoff of pr/body-draft'],
  [
    'tools/apply-review.md',
    'Each pre-analysis sub-agent receives',
    'handoff of apply-review/finding-pre-analysis',
  ],
  [
    'tools/apply-review.md',
    'Each delegation sub-agent receives directly',
    'handoff of apply-review/component-delegation',
  ],
  [
    'tools/apply-review.md',
    'Check each sub-agent for `DONE`',
    'result check of apply-review/component-delegation',
  ],
  [
    'tools/apply-review.md',
    'Synchronization barrier before Phase 5',
    'barrier over apply-review/component-delegation results',
  ],
  [
    'tools/apply-review.md',
    'The Phase 4 delegation sub-agent per overlap component',
    'classifies the Phase 4 spawn marked at apply-review/component-delegation',
  ],
  [
    'tools/review.md',
    'Each sub-agent returns a list of design decisions',
    'return format of review/design-decision-sources',
  ],
  [
    'tools/review.md',
    'Directory-split heuristic',
    'splits the reviewers selected at review/quality-review',
  ],
  ['tools/review.md', 'Assignment to each reviewer sub-agent', 'handoff of review/quality-review'],
  [
    'tools/review.md',
    '4. All reviewer sub-agents run **in parallel**',
    'parallelism of review/quality-review',
  ],
  [
    'tools/docs.md',
    'Have the active `effective-delivery` owner verify',
    'names the validator that docs/validation starts in step 4',
  ],
  [
    'tools/iterate.md',
    'Give internal delegation sub-agents the completion protocol',
    'result handling of iterate/item-delegation',
  ],
  [
    'shared/merge-gate-conflict-resolution.md',
    'Hand `{{AGENT:merge-conflict-resolver}}`:',
    'handoff of merge-gate-conflict-resolution/resolver',
  ],
  [
    'shared/merge-gate-conflict-resolution.md',
    '**verify independently, second.**',
    'contract of merge-gate-conflict-resolution/verification',
  ],
  [
    'shared/merge-gate-conflict-resolution.md',
    '  Hand `{{AGENT:code-validator}}`:',
    'handoff of merge-gate-conflict-resolution/verification',
  ],
  [
    'shared/merge-gate-conflict-resolution.md',
    'own result declares the working-tree changes',
    'result handling of merge-gate-conflict-resolution/verification',
  ],
  [
    'shared/merge-gate-conflict-resolution.md',
    'fail closed on an unverified resolution',
    'verdict rule of merge-gate-conflict-resolution/verification',
  ],
  [
    'shared/diff-baseline.md',
    '**Validation:** hand',
    'handoff content for the validator sites of the hosts',
  ],
  [
    'shared/unattended-planning.md',
    'Every unattended worker handoff',
    'handoff constraints for existing planning workers; starts no new spawn',
  ],
  [
    'shared/unattended-planning.md',
    '| Site  | File',
    'question-site outcome inventory for existing planning decisions; starts no new spawn',
  ],
  // Completion protocol given to sub-agents, or how their keywords are read.
  ['tools/apply-review.md', 'Prescribe the completion protocol', 'completion-protocol rule'],
  ['tools/build.md', 'Give internal sub-agents the instruction', 'completion-protocol rule'],
  ['tools/fix.md', 'give internal sub-agents the done protocol', 'completion-protocol rule'],
  [
    'tools/iterate.md',
    'Every `ABORT` this workflow returns is whole-run',
    'completion-protocol scope',
  ],
  [
    'shared/completion-protocol.md',
    'When you use internal sub-agents',
    'completion-protocol definition',
  ],
  [
    'shared/completion-protocol.md',
    'When an internal sub-agent ends without',
    'keyword-less resume rule',
  ],
  [
    'shared/merge-gate-delegation-contract.md',
    'returns is whole-run',
    'completion-protocol scope across a workflow handoff',
  ],
  // Rules that bind what a running sub-agent does, not whether one starts.
  [
    'tools/apply-review-commit-mechanics.md',
    'a global commit mutex applies to all delegation sub-agents',
    'commit mutex for running sub-agents',
  ],
  [
    'tools/apply-review-commit-mechanics.md',
    'Goal: parallel sub-agents may edit files',
    'commit mutex rationale',
  ],
  [
    'tools/apply-review-commit-mechanics.md',
    'the sub-agent must unstage its own staged changes',
    'commit mutex failure rule',
  ],
  [
    'tools/apply-review-commit-mechanics.md',
    'if a sub-agent later fails due to missing dependencies',
    'setup reporting',
  ],
  [
    'tools/apply-review-commit-mechanics.md',
    'Pass the delegation sub-agent the component receipt',
    'handoff content of apply-review/component-delegation',
  ],
  [
    'tools/apply-review-commit-mechanics.md',
    'sub-agents commit after each finding individually',
    'commit rule for running sub-agents',
  ],
  [
    'tools/apply-review.md',
    '**Individually:** commit the changes after each completed finding',
    'commit rule',
  ],
  // Task tracking of sub-agent progress.
  ['tools/apply-review.md', 'Create **all** tasks', 'task tracking'],
  ['tools/review.md', 'per-source and per-sub-reviewer granularity', 'task tracking'],
  ['tools/review.md', 'Per-source / per-sub-reviewer tasks', 'task tracking'],
  ['tools/review.md', 'On early overall abort', 'task tracking'],
  ['tools/review.md', 'Create tasks according to Point A and B', 'task tracking'],
  ['tools/review.md', 'Update tasks promptly as soon as a sub-agent reports', 'task tracking'],
  [
    'tools/review.md',
    'Within Phase 2c, all reviewer sub-agents in parallel',
    'parallelism rule restating review/quality-review',
  ],
  // Routing references: which role owns which surface; the spawn is marked at the phase step.
  [
    'tools/docs.md',
    'Root `README.md` as the marketing entry point of the standard doc structure',
    'routing reference',
  ],
  ['tools/docs.md', 'User and project documentation (incl. user docs', 'routing reference'],
  [
    'tools/docs.md',
    'In-code API documentation, inline comments, and CLI help texts',
    'routing reference',
  ],
  ['tools/docs.md', 'Technical check for generated artifacts', 'routing reference'],
  [
    'tools/docs.md',
    'create the three roles of the standard structure',
    'scaffold scope; spawns run through docs/implementation',
  ],
  [
    'tools/docs.md',
    'clarify replacement or a new slug with the user before',
    'precondition of docs/implementation',
  ],
  ['tools/docs.md', 'Determine the Effective Flow route and doc category', 'routing decision'],
  [
    'tools/refactor.md',
    'Classify affected files and domains',
    'routing rule; spawns run through refactor/initial-implementation',
  ],
  ['tools/maintain.md', '**Not in scope:**', 'scope routing to other tools'],
  [
    'shared/project-routing.md',
    '| Priority | Route',
    'routing table, also included into worker bodies',
  ],
  // Scope boundaries: this tool starts no validation of its own.
  ['tools/commit.md', 'Do not run any standalone project validation', 'scope boundary'],
  ['tools/pr.md', 'Do not start project validation', 'scope boundary'],
  ['tools/setup.md', 'Do not start project validation', 'scope boundary'],
  // Points to the fragment whose spawn carries the marker.
  [
    'tools/fix.md',
    'Run the read-only investigation per "Investigation method"',
    'spawn marked at investigation-method/explore',
  ],
  [
    'tools/investigate.md',
    'Run the read-only investigation per "Investigation method"',
    'spawn marked at investigation-method/explore',
  ],
  [
    'shared/goal-completion.md',
    '**Verify independently.**',
    'principle; validator and reviewer spawns are marked at the hosts',
  ],
  [
    'shared/goal-completion.md',
    '**Visible progress.**',
    'overview and advisory report integration; starts no worker',
  ],
  [
    'shared/subagent-progress.md',
    '## Sparse ordinary subagent progress',
    'contract heading; starts no worker',
  ],
  // The tool itself running as a delegated sub-agent.
  ['tools/apply-issues.md', '**Dropping the gate:**', 'this run as a sub-agent of a caller'],
  [
    'shared/documentation-sync-contract.md',
    '**non-interactive delegation**',
    'run-state chain of a delegated run',
  ],
  [
    'shared/session-title.md',
    '**Only from work-subject tools:**',
    'sub-agents never rename the session',
  ],
  // merge-gate's delegated run: its worker-role delegations are marked in
  // merge-gate-conflict-resolution.
  [
    'shared/merge-gate-delegated-run.md',
    'This gate is a delegator twice over',
    'classifies the two delegations',
  ],
  [
    'shared/merge-gate-delegated-run.md',
    "does not reach this gate's own state",
    'in-run reasoning that is never delegated',
  ],
  [
    'shared/merge-gate-delegated-run.md',
    'Scope of that completion control here',
    'states the gate starts no validator of its own',
  ],
  [
    'shared/merge-gate-delegated-run.md',
    'This workflow performs no `git commit`',
    'Git write boundary',
  ],
  [
    'shared/merge-gate-delegated-run.md',
    'Which gate stands in for `pre-commit-gate`',
    'names the verification marked in the fragment',
  ],
  ['shared/merge-gate-delegated-run.md', 'The head branch is untrusted input', 'threat model'],
  [
    'shared/merge-gate-delegated-run.md',
    '`mergeGate.conflictResolution` decides what the gate does',
    'configuration semantics',
  ],
  [
    'shared/merge-gate-delegated-run.md',
    'per round, where the base-into-head merge conflicted',
    'report record',
  ],
  ['shared/merge-gate-delegated-run.md', 'Resolve a conflict only through', 'rules summary'],
  ['shared/pilot-measurement.md', '`conflictResolutionAttempts`', 'measurement counter'],
  [
    'shared/pr-review-integration.md',
    'Resolve the state from the caller',
    'review-capability declaration',
  ],
  // Delegation mandate prose and its read-only authorization restatements.
  [
    'shared/delegation-mandate.md',
    'Invoking an Effective Flow tool **is**',
    'mandate prose, included into worker bodies',
  ],
  [
    'shared/delegation-mandate.md',
    'For analysis, exploration, and research',
    'analysis default and lean principle, included into worker bodies',
  ],
  [
    'shared/delegation-mandate.md',
    'Only the workflow/tool orchestrator may start',
    'leaf rule, included into worker bodies',
  ],
  [
    'shared/delegation-mandate.md',
    'An orchestrator that itself runs as a sub-agent',
    'pending-child rule, included into worker bodies',
  ],
  [
    'shared/delegation-mandate.md',
    'This mandate covers worker roles',
    'carve-out, included into worker bodies',
  ],
  [
    'tools/review.md',
    'the delegable part is the',
    'reasoning delegation scope; reviewers are not part of it',
  ],
  // Host mechanics.
  [
    'shared/execution-location.md',
    'Every write-capable phase and delegated worker',
    'receipt rationale',
  ],
  ['shared/execution-location.md', '**Claude Code:** Subagents start', 'harness note'],
  [
    'shared/execution-profiles.md',
    'Portable is Quality-only and unmeasured',
    'Fast host detection; the Quality respawn resolves to the role default',
  ],
].map(([source, anchor, reason]) => ({ source, anchor, reason }));

function sourceFiles() {
  return ['tools', 'shared'].flatMap((dir) =>
    readdirSync(join(SRC_DIR, dir))
      .filter((file) => file.endsWith('.md'))
      .sort()
      .map((file) => `${dir}/${file}`)
      .filter((path) => path !== MODEL_TIERS_PATH),
  );
}

function agentTiers() {
  return new Map(
    readdirSync(join(SRC_DIR, 'agents'))
      .filter((file) => file.endsWith('.md'))
      .map((file) => {
        const name = file.slice(0, -3);
        const frontmatter = extractFrontmatter(readSource(`agents/${file}`));
        return [name, resolveAgentTier(frontmatter, { agentName: name, context: file })];
      }),
  );
}

function spawnSites() {
  return parseSpawnSiteTable(readSource(MODEL_TIERS_PATH), {
    agentTiers: agentTiers(),
    context: MODEL_TIERS_PATH,
  });
}

test('the block rule keeps nested sub-items with their item and skips fenced code', () => {
  const blocks = spawnRuleBlocks(
    [
      'Lead {{AGENT:a}}',
      '',
      '1. Start:',
      '   - nested sub-agent',
      '2. Sibling',
      '```text',
      'fenced sub-agent',
      '```',
      '## Heading fan-out',
    ].join('\n'),
  );
  assert.deepEqual(
    blocks.map(({ start, text }) => [start, isSpawnCandidate(text)]),
    [
      [1, true],
      [3, true],
      [5, false],
      [9, true],
    ],
  );
});

// Every spawn instruction renders its tier at the decision point, so a skipped lazy load of
// model-tiers can never leave a spawn silently inheriting the parent's model.
test('every spawn-instruction paragraph carries a marker or an allowlisted reason', () => {
  const unmarked = [];
  const consumed = new Set();
  for (const source of sourceFiles()) {
    for (const block of spawnRuleBlocks(readSource(source))) {
      if (!isSpawnCandidate(block.text)) continue;
      const marked = block.text.split('\n').some((line) => MARKER_LINE_RE.test(line));
      const entries = SPAWN_MENTION_ALLOWLIST.filter(
        (entry) => entry.source === source && block.text.includes(entry.anchor),
      );
      assert.ok(entries.length <= 1, `${source}:${block.start} matches several allowlist entries`);
      if (marked) {
        assert.equal(
          entries.length,
          0,
          `${source}:${block.start} carries a marker and an allowlist entry ("${entries[0]?.anchor}")`,
        );
        continue;
      }
      if (entries.length === 0) {
        unmarked.push(`${source}:${block.start}: ${block.text.split('\n')[0].slice(0, 100)}`);
        continue;
      }
      const key = `${entries[0].source}\0${entries[0].anchor}`;
      assert.ok(!consumed.has(key), `allowlist entry "${entries[0].anchor}" matches two blocks`);
      consumed.add(key);
    }
  }
  assert.deepEqual(
    unmarked,
    [],
    'spawn candidates without a spawn-site marker or allowlist reason: place a marker line in the ' +
      'paragraph and add its row to src/shared/model-tiers.md, or allowlist a mention that starts nothing',
  );
  const stale = SPAWN_MENTION_ALLOWLIST.filter(
    ({ source, anchor }) => !consumed.has(`${source}\0${anchor}`),
  ).map(({ source, anchor }) => `${source}: ${anchor}`);
  assert.deepEqual(stale, [], 'allowlist entries that match no unmarked spawn candidate');
  for (const { source, reason } of SPAWN_MENTION_ALLOWLIST) {
    assert.ok(reason.trim().length > 0, `${source}: allowlist entry needs a reason`);
  }
});

test('spawn-site markers and model-tiers table rows reconcile in both directions', () => {
  const markers = sourceFiles().flatMap((source) =>
    collectSpawnSiteMarkers(readSource(source), {
      owner: source.split('/')[1].slice(0, -3),
      context: source,
    }),
  );
  const markerIds = markers.map(({ id }) => id);
  assert.equal(new Set(markerIds).size, markerIds.length, 'every marker id is unique');
  const rowIds = spawnSites().map(({ id }) => id);
  assert.deepEqual(
    markerIds.filter((id) => !rowIds.includes(id)),
    [],
    'markers without a table row',
  );
  assert.deepEqual(
    rowIds.filter((id) => !markerIds.includes(id)),
    [],
    'table rows without a marker',
  );
});

// The plan's floor: the validator that verifies a merge-gate conflict resolution and every
// validation of a Fast-pilot packet may not be moved below its default, and `deep` never moves.
test('conflict-resolution verification, Fast-packet validation and deep sites never move down', () => {
  const sites = new Map(spawnSites().map((site) => [site.id, site]));
  for (const id of [
    'merge-gate-conflict-resolution/verification',
    'build/unit-tests',
    'build/e2e-tests',
    'build/validation',
    'build/final-validation',
    'refactor/post-validation-checks',
    'refactor/post-validation-tests',
  ]) {
    assert.ok(sites.has(id), `missing spawn site ${id}`);
    assert.equal(sites.get(id).downAllowed, false, `${id} must be Down: no`);
  }
  for (const site of sites.values()) {
    if (site.clauses.every(({ tier }) => tier === 'deep')) {
      assert.equal(site.downAllowed, false, `${site.id} resolves to deep and must be Down: no`);
    }
  }
});

// The delegated merge-gate run carries the irreversible merge and reads third-party-controlled PR
// text, so it runs at `deep` (user decision) and never moves down; its marker sits in the caller
// core, at the dispatch, so a skipped lazy load cannot leave the spawn inheriting the parent model.
test('the delegated merge-gate run is a deep, no-downward-move site marked at the caller dispatch', () => {
  const site = spawnSites().find(({ id }) => id === 'merge-gate/delegated-run');
  assert.ok(site, 'missing spawn site merge-gate/delegated-run');
  assert.deepEqual(
    site.clauses.map(({ tier }) => tier),
    ['deep'],
  );
  assert.equal(site.downAllowed, false);
  const markers = collectSpawnSiteMarkers(readSource('tools/merge-gate.md'), {
    owner: 'merge-gate',
    context: 'tools/merge-gate.md',
  }).map(({ id }) => id);
  assert.deepEqual(markers, ['merge-gate/delegated-run']);
});

// The delegated merge-gate run proves it can spawn by starting one no-op child before any write; a
// probe that only does nothing needs the cheapest tier. Its marker sits in Entry step 7 of the
// fragment, so the rendered tier line reaches the probe whenever the delegated run reads Entry.
test('the nested-spawn probe is a mechanical site marked in Entry step 7 of the delegated run', () => {
  const site = spawnSites().find(({ id }) => id === 'merge-gate-delegated-run/nested-spawn-probe');
  assert.ok(site, 'missing spawn site merge-gate-delegated-run/nested-spawn-probe');
  assert.deepEqual(
    site.clauses.map(({ tier }) => tier),
    ['mechanical'],
  );
  const fragment = readSource('shared/merge-gate-delegated-run.md');
  const markers = collectSpawnSiteMarkers(fragment, {
    owner: 'merge-gate-delegated-run',
    context: 'shared/merge-gate-delegated-run.md',
  }).map(({ id }) => id);
  assert.deepEqual(markers, ['merge-gate-delegated-run/nested-spawn-probe']);
  const step7 = fragment.slice(
    fragment.indexOf('7. **Nested-spawn probe.**'),
    fragment.indexOf('8. **Review verdicts.**'),
  );
  assert.ok(
    step7.includes('<!-- spawn-site:merge-gate-delegated-run/nested-spawn-probe -->'),
    'the marker sits inside Entry step 7',
  );
});

// Each iterate round the gate delegates is a whole workflow run that orchestrates its own workers,
// like the sibling delegated-workflow sites, so it runs at `deep` and never moves down. Without a
// site the nested spawn fell to `standard`; its marker sits in the dispatch step itself.
test('the iterate round dispatch is a deep, no-downward-move site marked in the dispatch step', () => {
  const site = spawnSites().find(
    ({ id }) => id === 'merge-gate-delegation-contract/iterate-delegation',
  );
  assert.ok(site, 'missing spawn site merge-gate-delegation-contract/iterate-delegation');
  assert.deepEqual(
    site.clauses.map(({ tier }) => tier),
    ['deep'],
  );
  assert.equal(site.downAllowed, false);
  const fragment = readSource('shared/merge-gate-delegation-contract.md');
  const markers = collectSpawnSiteMarkers(fragment, {
    owner: 'merge-gate-delegation-contract',
    context: 'shared/merge-gate-delegation-contract.md',
  }).map(({ id }) => id);
  assert.deepEqual(markers, ['merge-gate-delegation-contract/iterate-delegation']);
  const step = fragment.slice(
    fragment.indexOf('4. **Dispatch**'),
    fragment.indexOf('Delete the message file and its snapshot'),
  );
  assert.ok(
    step.includes('<!-- spawn-site:merge-gate-delegation-contract/iterate-delegation -->'),
    'the marker sits inside the dispatch step',
  );
});

// The PR body draft reads a branch diff and writes nothing, so it is mechanical and may move down.
// Its marker sits in the step 9 description paragraph, so the rendered tier line reaches the
// delegation instruction in every target.
test('the PR body draft is a mechanical site marked in the step 9 description paragraph', () => {
  const site = spawnSites().find(({ id }) => id === 'pr/body-draft');
  assert.ok(site, 'missing spawn site pr/body-draft');
  assert.deepEqual(
    site.clauses.map(({ tier }) => tier),
    ['mechanical'],
  );
  assert.equal(site.downAllowed, true);
  const pr = readSource('tools/pr.md');
  const markers = collectSpawnSiteMarkers(pr, { owner: 'pr', context: 'tools/pr.md' }).map(
    ({ id }) => id,
  );
  assert.ok(markers.includes('pr/body-draft'), 'the pr/body-draft marker is missing');
  const start = pr.indexOf('   **Description:** use a supplied description as is');
  const end = pr.indexOf('   **Body check,**');
  assert.ok(start >= 0 && end >= 0, 'both step 9 paragraph anchors exist');
  const description = pr.slice(start, end);
  assert.ok(
    description.includes('<!-- spawn-site:pr/body-draft -->'),
    'the marker sits inside the step 9 description paragraph',
  );
});

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

// The tier rules have one owner. A second copy would drift from model-tiers.md, the file the
// mandate's lazy pointer loads. The Fast pilot's own presence-only check of the force variable in
// execution-profiles.md predates the tiers and is the one other place that variable may appear.
test('margin, floor, retry and host-override rules live only in model-tiers.md', () => {
  const anchors = [
    [/one step up or down/i, 'the +-1 margin'],
    [/never moves down/i, 'the deep and Down: no floor'],
    [/past either end/i, 'the no-op past the scale ends'],
    [/at least on the role or site default/i, 'the retry floor'],
    [/Agent tool without a `model` parameter/i, 'the host-forced model rule'],
    [/rejected because of a tier parameter/i, 'the rejected-parameter rule'],
    [/CLAUDE_CODE_EFFORT_LEVEL/, 'the effort-level override'],
    [/refuses for its nesting depth/i, 'the depth-refusal rule'],
  ];
  const files = walk(SRC_DIR).map((path) => relative(SRC_DIR, path));
  for (const [pattern, rule] of anchors) {
    const holders = files.filter((path) => pattern.test(readSource(path)));
    assert.deepEqual(holders, [MODEL_TIERS_PATH], `${rule} must be stated only in model-tiers.md`);
  }
  const forceHolders = files.filter((path) =>
    readSource(path).includes('CLAUDE_CODE_SUBAGENT_MODEL_FORCE'),
  );
  assert.deepEqual(forceHolders.sort(), ['shared/execution-profiles.md', MODEL_TIERS_PATH].sort());
  assert.doesNotMatch(
    readSource('SKILL.md'),
    /\btiers?\b/i,
    'the router points at the delegation mandate and keeps no copy of the tier rule',
  );
});

// The Fast pilot keeps its contract: on Claude Code a per-invocation `model`/`effort` wins over the
// `-fast` sidecar's frontmatter, so a Fast spawn that took the site tier line would silently run on
// `deep`. The carve-out has one owner, "Initial implementation phase" of execution-profiles.md,
// which is loaded before every initial packet spawn; model-tiers.md only points there, and each
// adopting site binds its rendered line to the Quality selectors.
const FAST_CARVE_OUT =
  "A Fast spawn passes only its Fast reference's own values, never the spawn site's tier line: on " +
  'Claude Code the `-fast` sidecar without a per-invocation `model` or `effort`, on native Codex the ' +
  '`-fast` sidecar without per-spawn `model` or `reasoning_effort`. The Quality spawn and every correction pass the ' +
  "site's tier.";
const QUALITY_BINDING = 'The tier line below binds each Quality selector, never a Fast reference:';
const flatten = (text) => text.replace(/\s+/g, ' ');

test('a Fast spawn passes only its own reference values, stated once in execution-profiles', () => {
  const profiles = readSource('shared/execution-profiles.md');
  const phase = profiles.slice(profiles.indexOf('\n## Initial implementation phase\n'));
  assert.ok(flatten(phase).includes(FAST_CARVE_OUT), 'the carve-out sits in its owning section');
  const holders = walk(SRC_DIR)
    .map((path) => relative(SRC_DIR, path))
    .filter((path) => flatten(readSource(path)).includes('A Fast spawn passes only'));
  assert.deepEqual(holders, ['shared/execution-profiles.md'], 'the carve-out has one owner');
  const tiers = flatten(readSource(MODEL_TIERS_PATH));
  assert.ok(
    tiers.includes(
      `A Fast spawn's values, and their exception from the site line, belong to "Initial implementation phase" of \`execution-profiles\`.`,
    ),
    'model-tiers.md points at the owner instead of restating the Fast rule',
  );
  for (const tool of ['build', 'refactor']) {
    const lines = readSource(`tools/${tool}.md`).split('\n');
    const at = lines.findIndex(
      (line) => line.trim() === `<!-- spawn-site:${tool}/initial-implementation -->`,
    );
    assert.ok(at > 0, `${tool}: initial-implementation marker`);
    assert.ok(lines[at - 1].endsWith(QUALITY_BINDING), `${tool}: the marker follows its binding`);
  }
});

// --- Built output ------------------------------------------------------------------------------

let sandbox;
let distRoot;

before(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'effective-flow-model-tiers-'));
  const result = spawnSync(process.execPath, ['build.mjs'], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      EFFECTIVE_FLOW_BUILD_GIT_HASH: 'model-tiers-contract-test',
      EFFECTIVE_FLOW_BUILD_OUTPUT_ROOT: join(sandbox, 'output'),
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  distRoot = join(sandbox, 'output', 'dist');
});

after(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

const TARGETS = ['claude', 'codex', 'portable'];
const CLAUDE_MODELS = [
  ...new Set(Object.values(MODEL_TIER_MAPPINGS).map(({ claude }) => claude.model)),
];
const CODEX_MODELS = [
  ...new Set(Object.values(MODEL_TIER_MAPPINGS).map(({ codex }) => codex.model)),
];
const RENDERED_TIER_LINE_RE = /^[ \t]*Tier `(?:mechanical|standard|deep)`/;
const namesAny = (line, names) =>
  names.some((name) =>
    new RegExp(`(?<![A-Za-z0-9_-])${name.replace(/[.]/g, '\\.')}(?![A-Za-z0-9_-])`).test(line),
  );

function workerArtifacts(target) {
  if (target === 'claude') return walk(join(distRoot, 'claude/agents'));
  if (target === 'codex') return walk(join(distRoot, 'codex/agents'));
  return walk(join(distRoot, 'portable/effective-flow/workers'));
}

// Workers are leaf executors in every target: the tier sentence the mandate gained binds the
// orchestrator, and the leaf sentence ships byte-identical to its source, with no tier
// qualification, even though the tier sentence closes the same bullet.
test('built worker bodies keep the leaf rule unqualified and the tier sentence names the orchestrator', () => {
  const mandate = readSource('shared/delegation-mandate.md');
  const leafSentence = mandate.match(
    /Every named worker is a \*\*leaf executor\*\*: [^\n]*?instead of seeking it through child delegation\./,
  )?.[0];
  assert.ok(leafSentence, 'the mandate keeps its leaf sentence');
  assert.equal(
    leafSentence,
    'Every named worker is a **leaf executor**: it starts no sub-agent, never re-delegates its ' +
      'assignment or a write, and returns missing essential context to the orchestrator instead of ' +
      'seeking it through child delegation.',
    'the leaf sentence stays byte-identical',
  );
  assert.doesNotMatch(leafSentence, /\btier/i, 'the leaf rule carries no tier qualification');
  const tierSentences = mandate
    .split('\n')
    .filter((line) => !line.startsWith('when:'))
    .flatMap((line) => line.split(/(?<=\.) /))
    .filter((sentence) => /\btier\b/i.test(sentence));
  assert.deepEqual(
    tierSentences.map((sentence) => sentence.startsWith('The orchestrator ')),
    [true],
    'exactly one eager tier sentence, with the orchestrator as its subject',
  );
  const pointer =
    '**Load on demand:** Read `shared/model-tiers.md`, when a tier is moved, a tier parameter is rejected';
  for (const target of TARGETS) {
    const artifacts = workerArtifacts(target);
    assert.ok(artifacts.length >= 16, `${target}: expected every worker artifact`);
    for (const artifact of artifacts) {
      const body = readFileSync(artifact, 'utf8');
      const where = relative(distRoot, artifact);
      assert.ok(body.includes(leafSentence), `${where}: leaf rule changed`);
      assert.ok(body.includes(tierSentences[0]), `${where}: tier sentence missing`);
      assert.ok(body.includes(pointer), `${where}: model-tiers pointer missing`);
    }
  }
});

// The executable selector must receive precisely the same validated policy as the prompt renderer.
test('every shipped selector resolves every generated site from the canonical build policy', async () => {
  const expectedRoles = Object.fromEntries(agentTiers());
  const expectedSites = spawnSites().map(({ id, downAllowed, clauses }) => ({
    id,
    downAllowed,
    clauses: clauses.map(({ role, tier }) => ({ role: role ?? null, tier })),
  }));
  for (const target of TARGETS) {
    const scripts = join(distRoot, target, 'effective-flow/scripts');
    const contract = JSON.parse(
      readFileSync(join(scripts, 'model-selection-contract.json'), 'utf8'),
    );
    assert.deepEqual(contract, {
      schemaVersion: 1,
      target,
      mappings: MODEL_TIER_MAPPINGS,
      roles: expectedRoles,
      sites: expectedSites,
    });
    const harness = target === 'claude' ? 'claude' : 'codex';
    for (const site of contract.sites) {
      for (const { role, tier } of site.clauses) {
        const request = {
          harness,
          site: site.id,
          ...(role ? { role, native: target !== 'portable' } : {}),
        };
        const resolved = await executeOperation('select', request, { contract });
        assert.equal(
          resolved.ok,
          true,
          `${target} ${site.id} ${role}: ${JSON.stringify(resolved)}`,
        );
        assert.equal(resolved.data.tier, tier);
        const mapping = MODEL_TIER_MAPPINGS[tier][harness];
        assert.deepEqual(resolved.data.expected, {
          model: mapping.model,
          effort: mapping.reasoning_effort ?? mapping.effort,
        });
        if (target === 'codex' && role) {
          assert.equal(resolved.data.spawn.role, `effective-flow-${role}`);
          assert.deepEqual(resolved.data.spawn.parameters, {});
        }
      }
    }
    // Exercise the installed CLI, rather than importing a source-only helper absent from delivery.
    const run = spawnSync(process.execPath, [join(scripts, 'model-selection.mjs'), 'select'], {
      input: JSON.stringify({
        harness: target === 'claude' ? 'claude' : 'codex',
        site: 'apply-issues/issue-analysis',
      }),
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const selection = JSON.parse(run.stdout);
    assert.equal(selection.ok, true);
    assert.equal(selection.data.tier, 'standard');
    assert.equal(
      selection.data.expected.model,
      MODEL_TIER_MAPPINGS.standard[target === 'claude' ? 'claude' : 'codex'].model,
    );
    for (const relativePath of walk(join(distRoot, target, 'effective-flow'))) {
      if (!relativePath.endsWith('.md')) continue;
      const body = readFileSync(relativePath, 'utf8');
      const siteLines = [...body.matchAll(/^\s*Model selection site: `([^`]+)`/gm)];
      for (const [, id] of siteLines) assert.ok(expectedSites.some((site) => site.id === id));
    }
  }
});

// The lean-orchestrator sentence ships into every worker body with the mandate, so it binds the
// orchestrator by name and leaves the leaf rule beside it untouched in every target; the judgment
// handoff it motivates is a spawn site, so no worker body may carry that fragment's tier line.
test('built worker bodies carry the lean sentence for the orchestrator and keep the leaf rule unqualified', () => {
  const mandate = readSource('shared/delegation-mandate.md');
  const lean = mandate
    .split('\n')
    .flatMap((line) => line.split(/(?<=\.) /))
    .filter((sentence) => /substantive work/.test(sentence));
  assert.equal(lean.length, 1, 'exactly one lean sentence');
  assert.match(lean[0], /^The orchestrator .*unless a tool's explicit in-run rule binds that work/);
  for (const target of TARGETS) {
    for (const artifact of workerArtifacts(target)) {
      const body = readFileSync(artifact, 'utf8');
      const where = relative(distRoot, artifact);
      assert.ok(body.includes(lean[0]), `${where}: lean sentence missing`);
      const leaf = body.match(/Every named worker is a \*\*leaf executor\*\*: [^\n]*?\./)?.[0];
      assert.ok(leaf, `${where}: leaf rule missing`);
      assert.doesNotMatch(leaf, /substantive|unless/, `${where}: leaf rule qualified`);
      assert.doesNotMatch(body, /Judgment handoff/, `${where}: workers carry no judgment handoff`);
    }
  }
});

// In every target the initial-implementation tier line renders between its Quality-only binding
// and the selector list, so no Fast reference shares a sentence with the tier values.
test('the initial-implementation tier line renders right after its Quality-only binding', () => {
  for (const target of TARGETS) {
    for (const tool of ['build', 'refactor']) {
      const where = `${target} ${tool}`;
      const lines = readFileSync(
        join(distRoot, target, `effective-flow/tools/${tool}.md`),
        'utf8',
      ).split('\n');
      const at = lines.findIndex((line) => line.endsWith(QUALITY_BINDING));
      assert.ok(at >= 0, `${where}: the Quality-only binding renders`);
      assert.match(lines[at + 1], /^ {3}Tier `deep`: /, `${where}: ${lines[at + 1]}`);
      assert.equal(
        lines[at + 2],
        `   Model selection site: \`${tool}/initial-implementation\` (\`shared/model-selection.md\`).`,
      );
      assert.match(lines[at + 3], /^ {3}- Frontend: /, `${where}: ${lines[at + 3]}`);
    }
  }
});

// The PR body draft renders its mechanical tier line right after the delegation sentence in every
// target, with the values the tier mapping assigns to each provider.
test('the PR body draft renders the mechanical tier line below its delegation sentence', () => {
  const { claude, codex } = MODEL_TIER_MAPPINGS.mechanical;
  const expected = {
    claude: `Tier \`mechanical\`: pass \`model: ${claude.model}\` and \`effort: ${claude.effort}\` on the Agent tool`,
    codex: `Tier \`mechanical\`: pass \`model: ${codex.model}\` and \`reasoning_effort: ${codex.reasoning_effort}\` on the spawn`,
    portable: `Tier \`mechanical\`: Claude Code Agent tool \`model: ${claude.model}\`, \`effort: ${claude.effort}\`; Codex spawn \`model: ${codex.model}\`, \`reasoning_effort: ${codex.reasoning_effort}\``,
  };
  for (const target of TARGETS) {
    const lines = readFileSync(join(distRoot, target, 'effective-flow/tools/pr.md'), 'utf8').split(
      '\n',
    );
    const at = lines.findIndex((line) => line.includes('delegate the draft to the host'));
    assert.ok(at >= 0, `${target}: the body-draft delegation sentence renders`);
    assert.ok(lines[at + 1].trim().startsWith(expected[target]), `${target}: ${lines[at + 1]}`);
  }
});

test('rendered tier text carries only its own provider in native targets and both in portable', () => {
  const counts = {};
  for (const target of TARGETS) {
    const files = walk(join(distRoot, target));
    let rendered = 0;
    for (const file of files) {
      if (!/\.(?:md|toml|json)$/.test(file)) continue;
      const text = readFileSync(file, 'utf8');
      const where = relative(distRoot, file);
      assert.doesNotMatch(text, /<!-- spawn-site:/, `${where}: a spawn-site marker survived`);
      for (const line of text.split('\n')) {
        if (!RENDERED_TIER_LINE_RE.test(line)) continue;
        rendered += 1;
        if (target === 'claude') {
          assert.match(line, /on the Agent tool/, `${where}: ${line}`);
          assert.ok(
            !namesAny(line, CODEX_MODELS) && !/reasoning_effort/.test(line),
            `${where}: ${line}`,
          );
        } else if (target === 'codex') {
          assert.match(
            line,
            /on the spawn|select the named role’s configured sidecar/,
            `${where}: ${line}`,
          );
          assert.ok(!namesAny(line, CLAUDE_MODELS) && !/`effort:/.test(line), `${where}: ${line}`);
        } else {
          assert.match(
            line,
            /Claude Code Agent tool `model: [^`]+`, `effort: [^`]+`; Codex spawn/,
            `${where}: ${line}`,
          );
        }
      }
    }
    counts[target] = rendered;

    const tiers = readFileSync(join(distRoot, target, 'effective-flow', MODEL_TIERS_PATH), 'utf8');
    assert.equal(
      namesAny(tiers, CLAUDE_MODELS),
      target !== 'codex',
      `${target}: Claude values in model-tiers`,
    );
    assert.equal(
      namesAny(tiers, CODEX_MODELS),
      target !== 'claude',
      `${target}: Codex values in model-tiers`,
    );
  }
  assert.ok(counts.claude >= spawnSites().length, 'every spawn site renders at least once');
  assert.deepEqual(
    { codex: counts.codex, portable: counts.portable },
    { codex: counts.claude, portable: counts.claude },
    'every target renders the same spawn-site lines',
  );
});
