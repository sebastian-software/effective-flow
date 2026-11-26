import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { extractFrontmatter } from '../build-lib.mjs';
import { ENTRY_ACTIONS, TRIAGE_OPERATIONS } from '../src/scripts/triage-core.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const flat = (text) => text.replace(/\s+/g, ' ');
const tool = read('src/tools/triage.md');
const prose = flat(tool);
const phase = (name, next) =>
  tool.slice(tool.indexOf(`## ${name}`), next ? tool.indexOf(`## ${next}`) : undefined);

const position = (text, fragment) => {
  const index = text.indexOf(fragment);
  assert.notEqual(index, -1, `missing contract fragment: ${fragment}`);
  return index;
};

// Invariant: `triage` is an exposed tool in "Understand what to do" between `plan-issue` and
// `issue-buddy`, with a strictly quoted description and catalogHint and a final contextBudget.
test('triage is exposed in the analysis group with quoted frontmatter and a final budget', () => {
  const build = read('build.mjs');
  assert.match(build, /'plan-issue',\s*'triage',\s*'issue-buddy',/);
  const frontmatter = tool.slice(0, tool.indexOf('\n---', 3));
  assert.match(frontmatter, /^description: ".+"$/m);
  assert.match(frontmatter, /^catalogHint: ".+"$/m);
  assert.match(frontmatter.trimEnd(), /\ncontextBudget: \d+$/);
  assert.ok(extractFrontmatter(tool));
});

// Invariant: every spawn the tool writes has its own marker and a model-tier row with the tier the
// plan assigns, and the per-issue assessment is the only deep site.
test('triage spawn sites carry their markers and model-tier rows', () => {
  const tiers = read('src/shared/model-tiers.md');
  for (const [site, tier, down] of [
    ['triage/architecture-context', 'standard', 'yes'],
    ['triage/assessment', 'deep', 'no'],
    ['triage/comment-draft', 'standard', 'yes'],
  ]) {
    assert.match(tool, new RegExp(`^<!-- spawn-site:${site} -->$`, 'm'));
    assert.match(
      tiers,
      new RegExp(
        `^\\| \`${site}\` +\\| [^|]+\\| \`${tier}\` +\\| \`${down}\` +\\| \`no\` +\\|$`,
        'm',
      ),
    );
  }
  assert.match(phase('Phase 3:', 'Phase 4:'), /^```include\narchitecture-context\n```$/m);
});

// Invariant: the rubric reaches only the assessment leaf: the three fragments are lazy at Phase 4,
// never eager in the tool, and the leaf is handed their shipped paths instead of pasted text.
// The leaf runs elsewhere than the orchestrator's working directory, so every file it reads is
// handed over as an absolute path.
test('the rubric fragments are lazy at Phase 4 and handed to the leaf as absolute shipped paths', () => {
  const assessment = phase('Phase 4:', 'Phase 5:');
  for (const name of ['issue-assessment-criteria', 'issue-assessment', 'planning-readiness']) {
    assert.match(assessment, new RegExp(`^\`\`\`lazy-include\\n${name}\\nwhen: Phase 4 `, 'm'));
    assert.doesNotMatch(tool, new RegExp(`^\`\`\`include\\n${name}\\n`, 'm'));
    assert.match(assessment, new RegExp(`\`<skill-root>/shared/${name}\\.md\``));
  }
  assert.match(flat(assessment), /Start one read-only `deep` leaf per item/);
  assert.match(flat(assessment), /snapshot `<snapshotDir>\/<snapshotFile>`/);
});

// Invariant: third-party text never enters the orchestrator: it never opens a snapshot or the
// overlap index, and works only from helper output and validated JSON.
test('the orchestrator never reads snapshots or issue text', () => {
  assert.match(
    prose,
    /Never open `snapshotDir`, a snapshot file or the overlap index, and never read issue or comment prose yourself\./,
  );
  assert.match(prose, /Retain `data` as `validated`; it carries no issue text\./);
  assert.match(
    flat(phase('Phase 6:', 'Phase 7:')),
    /Show a chat summary from `validated` and `inventory` only/,
  );
});

// Invariant: the draft leaf gets no snapshot and no A1, and its brief bans quotes, permission
// status, HTML comments and AI attribution; the helper re-checks the same rules.
test('the comment-draft brief excludes the snapshot, A1, quotes and attribution', () => {
  const drafts = flat(phase('Phase 7:', 'Phase 8:'));
  assert.match(
    drafts,
    /validated record without `summary`, `flagged` and every question with `to: "maintainer"`/,
  );
  assert.match(drafts, /never a snapshot, the report or another item's data/);
  assert.match(
    drafts,
    /quotes no issue or comment text, names no author's permission status, contains no `<!--` \(the helper adds the marker\) and no AI attribution or generation footer/,
  );
  assert.match(drafts, /For each item that is not `security: true`/);
});

// Invariant: the tool never closes, deletes or reassigns, never sets needs-planning, and writes
// only the helper's closed vocabulary, which holds no such action either.
test('triage never closes, deletes or reassigns anything', () => {
  assert.match(
    prose,
    /\*\*Nothing is closed, deleted or reassigned,\*\* and `effective-flow-needs-planning` is never set\./,
  );
  assert.deepEqual(ENTRY_ACTIONS, [
    'issue-comment-upsert',
    'issue-label-swap',
    'issue-label-remove',
  ]);
  assert.doesNotMatch(prose, /issue-close|issue-delete|assignee/);
});

// Invariant: every tracker write waits for an exact per-issue preview confirmed separately, and
// write-set-apply is called only after that gate; report-only runs never reach it.
test('the per-issue gate precedes every write', () => {
  const gate = position(prose, '**Per-issue gate, before any write.**');
  assert.ok(gate < position(prose, 'Call `write-set-apply`'));
  assert.ok(position(prose, 'Call `write-set-build`') < gate);
  assert.match(prose, /Ask separately for each issue, never batched/);
  assert.match(prose, /A report-only run skips to Phase 10\./);
  assert.match(tool, /^header: Triage write$/m);
  // The gate shows what the helper could not offer, and never offers an unavailable entry.
  const gateText = flat(phase('Phase 8:', 'Phase 9:'));
  assert.match(gateText, /Show every `writeSet\.notices` entry\./);
  assert.match(gateText, /each `unavailable` entry with its `reason`/);
  assert.match(gateText, /offering only the options whose entries are `available`/);
});

// Invariant: a VERDICTS_INVALID retry covers missing items too and resubmits the whole set, since
// verdicts-validate needs one assessment per inventory item.
test('validation retries invalid and missing items and resubmits the complete set', () => {
  assert.match(
    flat(phase('Phase 5:', 'Phase 6:')),
    /only the leaves of `details\.invalidItems` \(missing items included\), each with its own `details\.problems` entries, then resubmit the complete assessment set/,
  );
});

// Invariant: an issue URL becomes `#N` only after it is compared with the proven repository.
test('an issue URL is converted only after the repository comparison', () => {
  assert.match(
    prose,
    /Keep an issue URL until `permission-prove` returns, then pass it as `#<N>` when its host and `owner\/repo` match `permission\.repository`; ask once whether to drop a URL of another repository or end the run\./,
  );
});

// Invariant: the tool is interactive only and every helper call uses the literal one-command
// shape over the helper's real operations.
test('triage refuses envelopes and calls the helper in the literal shape', () => {
  assert.match(prose, /Refuse a run whose argument carries any `Run state:` line/);
  assert.match(prose, /`node <skill-root>\/scripts\/triage\.mjs <operation> <<< '<json>'`/);
  for (const operation of [
    'permission-prove',
    'inventory-build',
    'verdicts-validate',
    'report-write',
    'write-set-build',
    'write-set-apply',
    'snapshot-remove',
  ]) {
    assert.ok(TRIAGE_OPERATIONS.includes(operation));
    assert.match(prose, new RegExp(`\`${operation}\``));
  }
});

// Invariant: a security notice names open issue-buddy plan pull requests before it is written,
// and changes nothing on them.
test('security items name open issue-buddy plan pull requests and change nothing on them', () => {
  assert.match(
    flat(phase('Phase 6:', 'Phase 7:')),
    /For a `security: true` item, state that the tracker can get only the fixed notice and no verdict label, and name every open `issue-buddy` plan pull request in `planPullRequests`/,
  );
  assert.match(prose, /this run closes or changes nothing on them/);
  assert.match(flat(phase('Phase 8:', 'Phase 9:')), /for a security item its `planPullRequests`/);
});

// Invariant: the next-steps contract has triage rows and the tool points to them; reject has none.
test('triage emits next steps from its own edge rows', () => {
  const nextSteps = read('src/shared/next-steps.md');
  assert.match(
    nextSteps,
    /^\| triage +\| implement verdict +\| \{\{SKILL:plan-issue\}\} #<issue> +\| \{\{SKILL:apply\}\} #<issue> +\|$/m,
  );
  assert.match(
    nextSteps,
    /^\| triage +\| needs-work verdict[^|]*\| \{\{SKILL:triage\}\} #<issue> +\|/m,
  );
  assert.match(tool, /^```lazy-include\nnext-steps\nwhen: /m);
  assert.match(prose, /a `reject` decision has none/);
});

// Invariant: finished triage reports are a cleanup class removed only through `report-prune`,
// owned by the lazy fragment `cleanup-triage-reports`; snapshots are never part of it.
test('cleanup lists finished triage reports through the helper only', () => {
  const cleanup = flat(read('src/tools/cleanup.md'));
  const fragment = flat(read('src/shared/cleanup-triage-reports.md'));
  assert.match(cleanup, /```lazy-include cleanup-triage-reports when: \S.*? ```/);
  assert.match(cleanup, /a confirmed finished triage report removed by `report-prune`/);
  assert.match(
    fragment,
    /node <skill-root>\/scripts\/triage\.mjs report-list <<< '\{"runtimeStateRoot":"<RUNTIME_STATE_ROOT>"\}'/,
  );
  assert.match(
    fragment,
    /Snapshots, overlap indexes and triage input files are not part of this class/,
  );
  assert.match(fragment, /Remove a triage report only through `report-prune`\./);
  assert.ok(
    TRIAGE_OPERATIONS.includes('report-list') && TRIAGE_OPERATIONS.includes('report-prune'),
  );
});

// Invariant: the agent never re-serialises a hash-bearing object: it passes each result's path as
// its `<name>File` field, the helper keeps those files until the exit rule, and only `assessments`
// and `drafts` (which carry reference fields too) travel as an agent-written whole-input file.
test('hash-bearing results travel as reference fields and only assessments and drafts as an input file', () => {
  assert.match(
    prose,
    /Each hash-bearing result \(`permission`, `inventory`, `validated`, `writeSet`\) holds its absolute path as `inputFile`: pass that path as the matching `<name>File` field and never re-serialise the object/,
  );
  assert.match(prose, /The helper keeps these files until the exit rule\./);
  assert.match(
    prose,
    /A call carrying `assessments` or `drafts` sends its JSON, reference fields included, as a file: .*send `\{"inputFile": "<absolute path>"\}`, which the helper reads and removes\./,
  );
  assert.doesNotMatch(prose, /Pass every hash-bearing object/);
  assert.match(
    prose,
    /Once `permission-prove` has returned a `runId`, every exit .* first calls `snapshot-remove` with `\{runtimeStateRoot, runId: permission\.runId\}`/,
  );
});
