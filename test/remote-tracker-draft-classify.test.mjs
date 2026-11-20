// `pr-draft-classify` through the core with an injected runner: the five draft classes, the
// decision-record appendix with its trust level, the Forgejo ready title and the fail-closed
// behaviour. The runner is one fake for the forge (`gh`/`tea`) and for Git, so no process is spawned.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  APPENDIX_BEGIN,
  APPENDIX_BLOCKER_HEADINGS,
  APPENDIX_END,
  MAX_APPENDIX_BYTES,
} from '../src/scripts/autopilot-appendix-core.mjs';
import {
  PR_DRAFT_CLASSES,
  classifyPlanDraft,
  executeOperation,
  isPlanPublicationTitle,
  readyTitleFor,
  stripWorkInProgressPrefix,
} from '../src/scripts/remote-tracker-core.mjs';

const githubRepository = {
  host: 'github.com',
  owner: 'example',
  repository: 'flow',
  provider: 'github',
};
const forgejoRepository = {
  host: 'code.example.test',
  owner: 'team',
  repository: 'flow',
  slug: 'team/flow',
  provider: 'forgejo',
  login: 'work',
};

const TEA_OK = 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n';
const PLAN_PATH = 'docs/plan/2026-08-20-plan-publication-before-implementation.md';
const ARCHIVE_PATH = 'docs/plan/archive/2026-08-20-plan-publication-before-implementation.md';
const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const MERGE_BASE = 'c'.repeat(40);

function planMarker(plan = PLAN_PATH) {
  return `<!-- effective-flow-plan-pr:v1 ${JSON.stringify({ plan })} -->`;
}

function appendix(lines = [], heading = APPENDIX_BLOCKER_HEADINGS.en) {
  return [
    APPENDIX_BEGIN,
    '### Decisions',
    '',
    '- Chose the narrow option.',
    '',
    heading,
    '',
    ...lines,
    APPENDIX_END,
  ].join('\n');
}

function bodyOf(...parts) {
  return ['Summary of the change.', ...parts].join('\n\n');
}

// A fake runner answering the forge reads by route and every Git call by its subcommand. `paths` is
// the merge-base diff; `permission` is the author's permission response (a status-0 body, or a
// failing result).
function pullRunner({
  provider = 'github',
  pull,
  paths = [],
  permission = { permission: 'write' },
  gitFailure,
}) {
  const calls = [];
  const runner = async (call) => {
    calls.push(call);
    if (call.executable === 'git') {
      const args = call.args.slice(2).filter((argument) => argument !== '--no-replace-objects');
      const [subcommand] = args;
      if (gitFailure === subcommand) return { status: 128, stdout: '', stderr: 'fatal: broken' };
      if (args.includes('--is-shallow-repository')) return { status: 0, stdout: 'false\n' };
      if (subcommand === 'rev-parse') {
        const rev = args.at(-1);
        return { status: 0, stdout: `${rev.startsWith('refs/remotes/origin/') ? BASE : HEAD}\n` };
      }
      if (subcommand === 'merge-base') return { status: 0, stdout: `${MERGE_BASE}\n` };
      if (subcommand === 'diff') return { status: 0, stdout: paths.map((p) => `${p}\0`).join('') };
      throw new Error(`unexpected git call: ${args.join(' ')}`);
    }
    const joined = call.args.join(' ');
    const stderr = provider === 'forgejo' ? TEA_OK : '';
    if (joined.includes('/collaborators/')) {
      if (permission.status !== undefined) return permission;
      return { status: 0, stdout: JSON.stringify(permission), stderr };
    }
    if (joined.includes('/pulls/')) {
      if (pull instanceof Error) throw pull;
      if (pull?.failure) return pull.failure;
      return { status: 0, stdout: JSON.stringify(pull), stderr };
    }
    throw new Error(`unexpected forge call: ${joined}`);
  };
  runner.calls = calls;
  return runner;
}

function githubPull(overrides = {}) {
  return {
    number: 7,
    title: 'feat: ship the feature',
    body: bodyOf(planMarker()),
    state: 'open',
    draft: true,
    user: { login: 'Dev', type: 'User' },
    html_url: 'https://github.com/example/flow/pull/7',
    labels: [],
    head: { ref: 'effective-flow/build/x', sha: HEAD, repo: { full_name: 'example/flow' } },
    base: { ref: 'develop', repo: { full_name: 'example/flow' } },
    ...overrides,
  };
}

function forgejoPull(overrides = {}) {
  return {
    number: 7,
    title: 'WIP: feat: ship the feature',
    body: bodyOf(planMarker()),
    state: 'open',
    draft: true,
    user: { login: 'dev' },
    html_url: 'https://code.example.test/team/flow/pulls/7',
    labels: [],
    head: {
      label: 'x',
      ref: 'effective-flow/build/x',
      sha: HEAD,
      repo: { full_name: 'team/flow', name: 'flow', owner: { login: 'team' } },
    },
    base: { label: 'develop', ref: 'develop', repo: { full_name: 'team/flow' } },
    ...overrides,
  };
}

async function classify({ repository = githubRepository, input = {}, ...runnerOptions }) {
  const runner = pullRunner({ provider: repository.provider, ...runnerOptions });
  const envelope = await executeOperation(
    'pr-draft-classify',
    { repository, number: 7, cwd: '/work/repo', headSha: HEAD, baseRef: 'develop', ...input },
    { runner, skipProbe: true },
  );
  return { envelope, runner, result: envelope.data?.result };
}

const DELIVERY_PATHS = [PLAN_PATH, 'src/feature.mjs'];

// Invariant: the class is a pure function of the marker, the plan-only evidence and the title, with
// a closed set of five values.
test('classifyPlanDraft maps marker, evidence and title to the five classes', () => {
  assert.deepEqual(PR_DRAFT_CLASSES, [
    'unmarked',
    'marker-invalid',
    'plan-only',
    'finish-incomplete',
    'delivered',
  ]);
  const valid = { status: 'valid', plan: PLAN_PATH };
  assert.equal(classifyPlanDraft({ marker: { status: 'absent' }, title: 'x' }), 'unmarked');
  assert.equal(classifyPlanDraft({ marker: undefined, title: 'x' }), 'unmarked');
  assert.equal(
    classifyPlanDraft({ marker: { status: 'invalid', error: 'duplicate' }, title: 'x' }),
    'marker-invalid',
  );
  assert.equal(classifyPlanDraft({ marker: valid, planOnly: true, title: 'feat: x' }), 'plan-only');
  assert.equal(classifyPlanDraft({ marker: valid, title: 'feat: x' }), 'plan-only');
  assert.equal(
    classifyPlanDraft({ marker: valid, planOnly: false, title: 'docs: plan x' }),
    'finish-incomplete',
  );
  assert.equal(
    classifyPlanDraft({ marker: valid, planOnly: false, title: 'feat: x' }),
    'delivered',
  );
});

test('plan publication titles and the work-in-progress prefix are recognized in both languages', () => {
  assert.equal(isPlanPublicationTitle('docs: plan publication'), true);
  assert.equal(isPlanPublicationTitle('docs: Plan Veröffentlichung'), true);
  assert.equal(isPlanPublicationTitle('WIP: docs: plan publication'), true);
  assert.equal(isPlanPublicationTitle('[WIP] docs: Plan x'), true);
  assert.equal(isPlanPublicationTitle('docs: planning notes'), false);
  assert.equal(isPlanPublicationTitle('feat: x'), false);
  assert.equal(isPlanPublicationTitle(undefined), false);
  assert.equal(stripWorkInProgressPrefix('WIP: feat: x'), 'feat: x');
  assert.equal(stripWorkInProgressPrefix('wip:   feat: x'), 'feat: x');
  assert.equal(stripWorkInProgressPrefix('[WIP] feat: x'), 'feat: x');
  assert.equal(stripWorkInProgressPrefix('feat: x'), 'feat: x');
  assert.equal(readyTitleFor('WIP: feat: x', 'forgejo'), 'feat: x');
  assert.equal(readyTitleFor('WIP: feat: x', 'github'), 'WIP: feat: x');
  // Stacked prefixes are all removed, so the title is one `pr-mark-ready` accepts.
  assert.equal(stripWorkInProgressPrefix('WIP: [WIP] wip:feat: x'), 'feat: x');
  assert.equal(readyTitleFor('[WIP]WIP: WIP: feat: x', 'forgejo'), 'feat: x');
  assert.equal(isPlanPublicationTitle('WIP: [WIP] docs: plan x'), true);
  // Nothing left after the prefixes: no ready title to offer.
  for (const title of ['WIP:', 'WIP: [WIP]', '  [wip]   ', 'WIP:WIP:']) {
    assert.equal(stripWorkInProgressPrefix(title), '', title);
    assert.equal(readyTitleFor(title, 'forgejo'), null, title);
  }
  assert.equal(readyTitleFor('   ', 'github'), null);
  assert.equal(readyTitleFor(undefined, 'github'), null);
});

test('pr-draft-classify reports an unmarked draft without touching Git', async () => {
  const { envelope, runner, result } = await classify({
    pull: githubPull({ body: 'A manual draft with no marker.' }),
  });
  assert.equal(envelope.ok, true);
  assert.equal(result.class, 'unmarked');
  assert.equal(result.draft, true);
  assert.equal(result.appendixPresent, false);
  assert.equal(result.appendixDigest, null);
  assert.equal(result.appendix, null);
  assert.equal(result.blockers, 0);
  assert.equal(
    runner.calls.some((call) => call.executable === 'git'),
    false,
    'no marker, so no plan-only evidence is read',
  );
});

test('pr-draft-classify reports a rejected marker as marker-invalid with its error', async () => {
  const { result, runner } = await classify({
    pull: githubPull({ body: `Plan: ${planMarker()}` }),
  });
  assert.equal(result.class, 'marker-invalid');
  assert.equal(result.markerError, 'not-own-line');
  assert.equal(
    runner.calls.some((call) => call.executable === 'git'),
    false,
  );
});

test('pr-draft-classify reports plan-only for a diff that touches only the plan and its archive, an empty diff included', async () => {
  for (const paths of [[PLAN_PATH], [ARCHIVE_PATH], [PLAN_PATH, ARCHIVE_PATH], []]) {
    const { result } = await classify({ pull: githubPull(), paths });
    assert.equal(result.class, 'plan-only', JSON.stringify(paths));
    assert.equal(result.planPath, PLAN_PATH);
    assert.equal(result.archivePath, ARCHIVE_PATH);
  }
});

test('pr-draft-classify reports finish-incomplete while the title is still the plan publication title', async () => {
  for (const title of ['docs: plan publication', 'docs: Plan Veröffentlichung']) {
    const { result } = await classify({ pull: githubPull({ title }), paths: DELIVERY_PATHS });
    assert.equal(result.class, 'finish-incomplete', title);
  }
  const wip = await classify({
    repository: forgejoRepository,
    pull: forgejoPull({ title: 'WIP: docs: plan publication' }),
    paths: DELIVERY_PATHS,
  });
  assert.equal(wip.result.class, 'finish-incomplete');
});

test('pr-draft-classify reports delivered, with and without the plan archived', async () => {
  const archived = await classify({ pull: githubPull(), paths: [ARCHIVE_PATH, 'src/feature.mjs'] });
  assert.equal(archived.result.class, 'delivered');
  // An unarchived delivery: the plan path is still present beside other paths.
  const unarchived = await classify({ pull: githubPull(), paths: DELIVERY_PATHS });
  assert.equal(unarchived.result.class, 'delivered');
  assert.equal(unarchived.result.draft, true);
  assert.equal(unarchived.result.readyTitle, 'feat: ship the feature');
  // The evidence is read for the verified head against the fetched base branch.
  const refs = unarchived.runner.calls
    .filter((call) => call.executable === 'git')
    .flatMap((call) => call.args);
  assert.ok(refs.some((argument) => argument === 'refs/remotes/origin/develop^{commit}'));
  assert.ok(refs.some((argument) => argument === `${HEAD}^{commit}`));
});

test('the appendix is shown verbatim in both languages and its blockers are counted by heading', async () => {
  const cases = [
    ['en', appendix([], APPENDIX_BLOCKER_HEADINGS.en), 0],
    ['en', appendix(['- First blocker', '- Second blocker'], APPENDIX_BLOCKER_HEADINGS.en), 2],
    ['de', appendix([], APPENDIX_BLOCKER_HEADINGS.de), 0],
    [
      'de',
      appendix(
        ['- Erster Blocker', '* Zweiter Blocker', '+ Dritter'],
        APPENDIX_BLOCKER_HEADINGS.de,
      ),
      3,
    ],
  ];
  for (const [language, block, blockers] of cases) {
    const { result } = await classify({
      pull: githubPull({ body: bodyOf(planMarker(), block) }),
      paths: DELIVERY_PATHS,
    });
    assert.equal(result.class, 'delivered', language);
    assert.equal(result.blockers, blockers, `${language} ${blockers}`);
    assert.equal(result.appendixPresent, true);
    assert.equal(result.appendixTrust, 'verified');
    assert.equal(result.appendixTrustReason, null);
    assert.match(result.appendix, /Chose the narrow option\./);
    assert.ok(!result.appendix.includes(APPENDIX_BEGIN), 'marker lines are not shown');
    assert.ok(!result.appendix.includes(APPENDIX_END));
  }
});

test('the appendix digest is the SHA-256 of the raw block, before neutralization', async () => {
  const block = appendix(['- Blocker with <!-- a comment -->']);
  const { result } = await classify({
    pull: githubPull({ body: bodyOf(planMarker(), block) }),
    paths: DELIVERY_PATHS,
  });
  assert.equal(result.appendixDigest, createHash('sha256').update(block, 'utf8').digest('hex'));
  assert.match(result.appendix, /&lt;!-- a comment -->/);
  // A changed body changes the digest.
  const edited = await classify({
    pull: githubPull({ body: bodyOf(planMarker(), block.replace('narrow', 'wide')) }),
    paths: DELIVERY_PATHS,
  });
  assert.notEqual(edited.result.appendixDigest, result.appendixDigest);
});

test('a verified appendix is neutralized: comment openers, control and bidirectional characters, size', async () => {
  const hostile = appendix([
    '- <!-- hidden --> text',
    '- bell \u0007 escape \u001b[31m reorder ‮ done ⁦ zero​ width',
  ]);
  const { result } = await classify({
    pull: githubPull({ body: bodyOf(planMarker(), hostile) }),
    paths: DELIVERY_PATHS,
  });
  assert.ok(!result.appendix.includes('<!--'));
  assert.ok(result.appendix.includes('&lt;!--'));
  assert.ok(!/[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/.test(result.appendix));
  for (const escaped of ['\\u0007', '\\u001b', '\\u202e', '\\u2066', '\\u200b']) {
    assert.ok(result.appendix.includes(escaped), escaped);
  }
  assert.equal(result.appendixTruncated, false);

  const large = appendix([`- ${'x'.repeat(MAX_APPENDIX_BYTES + 100)}`]);
  const capped = await classify({
    pull: githubPull({ body: bodyOf(planMarker(), large) }),
    paths: DELIVERY_PATHS,
  });
  assert.equal(capped.result.appendixTruncated, true);
  assert.ok(Buffer.byteLength(capped.result.appendix, 'utf8') <= MAX_APPENDIX_BYTES);
  assert.match(capped.result.appendix, /\[truncated\]$/);
  assert.equal(capped.result.blockers, 1);
});

test('trust is verified only for a same-repository author with write access', async () => {
  const block = appendix(['- A blocker']);
  const body = bodyOf(planMarker(), block);
  for (const permission of ['write', 'admin', 'maintain']) {
    const { result } = await classify({
      pull: githubPull({ body }),
      paths: DELIVERY_PATHS,
      permission: { permission },
    });
    assert.equal(result.appendixTrust, 'verified', permission);
    assert.equal(result.blockers, 1);
    assert.ok(result.appendix.includes('A blocker'));
  }
  const owner = await classify({
    repository: forgejoRepository,
    pull: forgejoPull({ body, title: 'feat: ship' }),
    paths: DELIVERY_PATHS,
    permission: { permission: 'owner' },
  });
  assert.equal(owner.result.appendixTrust, 'verified');
});

test('an unverifiable appendix shows no text, yet its blockers and digest still count', async () => {
  const block = appendix(['- Blocker one', '- Blocker two']);
  const body = bodyOf(planMarker(), block);
  const digest = createHash('sha256').update(block, 'utf8').digest('hex');
  const expectUnverifiable = (result, reason) => {
    assert.equal(result.appendixTrust, 'unverifiable');
    assert.equal(result.appendixTrustReason, reason);
    assert.equal(result.appendix, null, reason);
    assert.equal(result.appendixTruncated, false);
    assert.equal(result.appendixPresent, true);
    assert.equal(result.appendixDigest, digest);
    assert.equal(result.blockers, 2, reason);
    assert.ok(!JSON.stringify(result).includes('Blocker one'), `${reason}: no appendix text`);
  };

  const fork = await classify({
    pull: githubPull({
      body,
      head: { ref: 'topic', sha: HEAD, repo: { full_name: 'someone/flow' } },
    }),
    paths: DELIVERY_PATHS,
  });
  expectUnverifiable(fork.result, 'fork');
  assert.equal(
    fork.runner.calls.some((call) => call.args.join(' ').includes('/collaborators/')),
    false,
    'a fork needs no permission read',
  );

  // A deleted fork (`head.repo: null`) is stated as foreign; a read that says nothing about the
  // head repository is no fork verdict.
  const deletedFork = await classify({
    pull: githubPull({ body, head: { ref: 'topic', sha: HEAD, repo: null } }),
    paths: DELIVERY_PATHS,
  });
  expectUnverifiable(deletedFork.result, 'fork');
  const unstated = await classify({
    pull: githubPull({ body, head: { ref: 'topic', sha: HEAD } }),
    paths: DELIVERY_PATHS,
  });
  expectUnverifiable(unstated.result, 'repository-unstated');
  assert.equal(
    unstated.runner.calls.some((call) => call.args.join(' ').includes('/collaborators/')),
    false,
    'an unstated head repository needs no permission read',
  );

  const unreadable = await classify({
    pull: githubPull({ body }),
    paths: DELIVERY_PATHS,
    permission: { status: 1, stdout: '', stderr: 'gh: Server Error (HTTP 500)' },
  });
  assert.equal(
    unreadable.envelope.ok,
    true,
    'a failed permission read does not fail the operation',
  );
  expectUnverifiable(unreadable.result, 'permission-unreadable');

  for (const permission of ['read', 'triage', 'none']) {
    const insufficient = await classify({
      pull: githubPull({ body }),
      paths: DELIVERY_PATHS,
      permission: { permission },
    });
    expectUnverifiable(insufficient.result, 'permission-insufficient');
  }

  const noCollaborator = await classify({
    pull: githubPull({ body }),
    paths: DELIVERY_PATHS,
    permission: { status: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)' },
  });
  expectUnverifiable(noCollaborator.result, 'permission-insufficient');
});

test('Forgejo states the ready title without its work-in-progress prefix, GitHub leaves the title', async () => {
  for (const [title, ready] of [
    ['WIP: feat: ship the feature', 'feat: ship the feature'],
    ['[WIP] feat: ship the feature', 'feat: ship the feature'],
    ['wip: feat: ship the feature', 'feat: ship the feature'],
    ['feat: ship the feature', 'feat: ship the feature'],
  ]) {
    const { result } = await classify({
      repository: forgejoRepository,
      pull: forgejoPull({ title }),
      paths: DELIVERY_PATHS,
    });
    assert.equal(result.readyTitle, ready, title);
    assert.equal(result.class, 'delivered', title);
  }
  const github = await classify({
    pull: githubPull({ title: 'WIP: feat: ship the feature' }),
    paths: DELIVERY_PATHS,
  });
  assert.equal(github.result.readyTitle, 'WIP: feat: ship the feature');
  const stacked = await classify({
    repository: forgejoRepository,
    pull: forgejoPull({ title: 'WIP: [WIP] feat: ship the feature' }),
    paths: DELIVERY_PATHS,
  });
  assert.equal(stacked.result.readyTitle, 'feat: ship the feature');
  const onlyPrefix = await classify({
    repository: forgejoRepository,
    pull: forgejoPull({ title: 'WIP: [WIP]' }),
    paths: DELIVERY_PATHS,
  });
  assert.equal(onlyPrefix.envelope.ok, true);
  assert.equal(onlyPrefix.result.readyTitle, null);
});

test('the classification of a Forgejo plan draft strips the prefix before it judges the title', async () => {
  const plan = await classify({
    repository: forgejoRepository,
    pull: forgejoPull({ title: 'WIP: docs: Plan Titel' }),
    paths: DELIVERY_PATHS,
  });
  assert.equal(plan.result.class, 'finish-incomplete');
  assert.equal(plan.result.readyTitle, 'docs: Plan Titel');
});

test('pr-draft-classify fails closed on a forge error or a Git error, and offers no class', async () => {
  const forge = await classify({
    pull: { failure: { status: 1, stdout: '', stderr: 'gh: Server Error (HTTP 500)' } },
  });
  assert.equal(forge.envelope.ok, false);
  assert.equal(forge.result, undefined);

  for (const gitFailure of ['rev-parse', 'merge-base', 'diff']) {
    const { envelope, result } = await classify({
      pull: githubPull(),
      paths: DELIVERY_PATHS,
      gitFailure,
    });
    assert.equal(envelope.ok, false, gitFailure);
    assert.equal(envelope.error.code, 'COMMAND_FAILED', gitFailure);
    assert.equal(result, undefined);
  }

  const bad = await classify({ pull: githubPull(), input: { headSha: 'main' } });
  assert.equal(bad.envelope.ok, false);
  assert.equal(bad.envelope.error.code, 'INVALID_PAYLOAD');
  const badBase = await classify({ pull: githubPull(), input: { baseRef: '--upload-pack=x' } });
  assert.equal(badBase.envelope.error.code, 'INVALID_PAYLOAD');
});

test('a failed pr-draft-classify read leaks no pull-request text', async () => {
  const secret = 'SECRET-BODY-FRAGMENT';
  const { envelope } = await classify({
    pull: { failure: { status: 0, stdout: `{"body":"${secret}"`, stderr: secret } },
  });
  assert.equal(envelope.ok, false);
  assert.ok(!JSON.stringify(envelope).includes(secret));
});

test('pr-draft-classify never returns the body, only the neutralized appendix of a verified record', async () => {
  const prose = 'PRIVATE-PROSE-OF-THE-BODY';
  const { result } = await classify({
    pull: githubPull({ body: `${prose}\n\n${planMarker()}\n\n${appendix(['- B'])}` }),
    paths: DELIVERY_PATHS,
  });
  assert.ok(!JSON.stringify(result).includes(prose));
  assert.equal(Object.hasOwn(result, 'body'), false);
});

// The classification describes one head against one base, so a read that states another head or
// base, or none, fails closed before any Git evidence is read.
test('pr-draft-classify fails closed when the read head or base is not the verified one', async () => {
  const other = 'd'.repeat(40);
  const cases = [
    ['github', githubPull, (pull) => ({ head: { ...pull.head, sha: other } }), 'head-mismatch'],
    ['github', githubPull, (pull) => ({ head: { ...pull.head, sha: undefined } }), 'head-mismatch'],
    ['github', githubPull, (pull) => ({ base: { ...pull.base, ref: 'main' } }), 'base-mismatch'],
    ['github', githubPull, (pull) => ({ base: { ...pull.base, ref: undefined } }), 'base-mismatch'],
    ['github', githubPull, () => ({ base: undefined }), 'base-mismatch'],
    ['forgejo', forgejoPull, (pull) => ({ head: { ...pull.head, sha: other } }), 'head-mismatch'],
    [
      'forgejo',
      forgejoPull,
      (pull) => ({ head: { ...pull.head, sha: undefined } }),
      'head-mismatch',
    ],
    ['forgejo', forgejoPull, (pull) => ({ base: { ...pull.base, ref: 'main' } }), 'base-mismatch'],
    ['forgejo', forgejoPull, (pull) => ({ base: { ...pull.base, ref: null } }), 'base-mismatch'],
  ];
  for (const [provider, make, change, step] of cases) {
    const pull = make();
    const { envelope, result, runner } = await classify({
      repository: provider === 'forgejo' ? forgejoRepository : githubRepository,
      pull: { ...pull, ...change(pull) },
      paths: DELIVERY_PATHS,
    });
    const label = `${provider} ${step} ${JSON.stringify(change(pull))}`;
    assert.equal(envelope.ok, false, label);
    assert.equal(envelope.error.code, 'COMMAND_FAILED', label);
    assert.equal(envelope.error.details.step, step, label);
    assert.equal(result, undefined, label);
    assert.equal(
      runner.calls.some((call) => call.executable === 'git'),
      false,
      `${label}: no Git evidence is read`,
    );
  }
  // An upper-case head SHA in the read is the same commit.
  const upper = await classify({
    pull: githubPull({ head: { ...githubPull().head, sha: HEAD.toUpperCase() } }),
    paths: DELIVERY_PATHS,
  });
  assert.equal(upper.envelope.ok, true);
});
