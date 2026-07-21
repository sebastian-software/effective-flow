#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CATALOG_ID = 'effective-flow';
const BASE_BRANCH = 'main';

function defaultRunner(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function checked(run, command, args, options = {}, { trim = true } = {}) {
  const result = run(command, args, options);
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout]
      .map((value) => value.trim())
      .filter(Boolean)
      .join('\n');
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${result.status}${detail ? `:\n${detail}` : ''}`,
    );
  }
  return trim ? result.stdout.trim() : result.stdout;
}

function parseJson(value, context) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${context} returned invalid JSON: ${error.message}`);
  }
}

function credentialEnv(token, baseEnv = process.env) {
  const encoded = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64');
  return {
    ...baseEnv,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${encoded}`,
  };
}

function parseRepository(remote) {
  const https = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/.exec(remote);
  const ssh = /^git@github\.com:([^/]+)\/([^/]+)$/.exec(remote);
  const match = https ?? ssh;
  if (!match) {
    throw new Error('origin must be an uncredentialed github.com repository URL');
  }
  return `${match[1]}/${match[2].replace(/\.git$/, '')}`;
}

function releaseBranch(releaseTag) {
  const slug = releaseTag
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) throw new Error('release tag does not contain a branch-safe character');
  return `automation/effective-flow-${slug}`;
}

function validateReport(report, { deliveryCommit, dryRun }) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('Dalo report must be a JSON object');
  }
  if (report.catalog_id !== CATALOG_ID) {
    throw new Error(`Dalo reported unexpected catalog ${JSON.stringify(report.catalog_id)}`);
  }
  if (report.from_ref !== BASE_BRANCH) {
    throw new Error(`Dalo reported unexpected source ref ${JSON.stringify(report.from_ref)}`);
  }
  if (report.dry_run !== dryRun) {
    throw new Error(`Dalo report has unexpected dry_run=${JSON.stringify(report.dry_run)}`);
  }
  if (report.candidate_commit !== deliveryCommit) {
    throw new Error(
      `Dalo candidate ${JSON.stringify(report.candidate_commit)} does not match verified delivery commit ${deliveryCommit}`,
    );
  }
  if (!Array.isArray(report.blocking_reasons)) {
    throw new Error('Dalo report is missing blocking_reasons');
  }
  if (report.blocking_reasons.length > 0) {
    throw new Error(
      `Dalo blocked the catalog update: ${report.blocking_reasons.join('; ')}\nFull Dalo report: ${JSON.stringify(report)}`,
    );
  }
  if (typeof report.old_commit !== 'string') {
    throw new Error('Dalo report is missing old_commit');
  }
  if (typeof report.old_version !== 'string') {
    throw new Error('Dalo report is missing old_version');
  }
}

function changedPaths(run, repo, targetEnv) {
  return checked(
    run,
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    {
      cwd: repo,
      env: targetEnv,
    },
    { trim: false },
  )
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3));
}

function queryOpenPullRequests(run, repository, branch, targetEnv) {
  const output = checked(
    run,
    'gh',
    [
      'pr',
      'list',
      '--repo',
      repository,
      '--base',
      BASE_BRANCH,
      '--head',
      branch,
      '--state',
      'open',
      '--json',
      'number,url,headRefName,headRefOid,baseRefName',
    ],
    { env: targetEnv },
  );
  const pulls = parseJson(output, 'gh pr list');
  if (!Array.isArray(pulls)) throw new Error('gh pr list did not return an array');
  if (pulls.length > 1) throw new Error(`multiple open pull requests exist for ${branch}`);
  return pulls;
}

function remoteBranchOid(run, repo, branch, targetEnv) {
  const output = checked(run, 'git', ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`], {
    cwd: repo,
    env: targetEnv,
  });
  if (!output) return null;
  const lines = output.split('\n').filter(Boolean);
  if (lines.length !== 1) throw new Error(`origin returned ambiguous state for ${branch}`);
  const [oid, ref, ...extra] = lines[0].split(/\s+/);
  if (extra.length > 0 || ref !== `refs/heads/${branch}` || !/^[0-9a-f]{40}$/.test(oid)) {
    throw new Error(`origin returned invalid state for ${branch}`);
  }
  return oid;
}

function reconcileExistingPullRequest({
  run,
  repo,
  branch,
  pull,
  remoteOid,
  expectedManifest,
  targetEnv,
}) {
  if (
    pull.headRefName !== branch ||
    pull.baseRefName !== BASE_BRANCH ||
    pull.headRefOid !== remoteOid
  ) {
    throw new Error(`open pull request for ${branch} does not match the remote branch state`);
  }
  checked(run, 'git', ['fetch', '--no-tags', 'origin', `refs/heads/${branch}`], {
    cwd: repo,
    env: targetEnv,
  });
  const manifest = checked(run, 'git', ['show', 'FETCH_HEAD:dalo.toml'], {
    cwd: repo,
    env: targetEnv,
  });
  const diff = checked(run, 'git', ['diff', '--name-only', 'origin/main...FETCH_HEAD'], {
    cwd: repo,
    env: targetEnv,
  });
  if (manifest !== expectedManifest.trim() || diff !== 'dalo.toml') {
    throw new Error(
      `open pull request for ${branch} does not contain exactly the expected dalo.toml update`,
    );
  }
  return { status: 'existing-pull-request', branch, pullRequestUrl: pull.url };
}

export function updateTeamCatalog({
  repo,
  deliveryCommit,
  releaseTag,
  ghToken,
  daloSourceToken,
  run = defaultRunner,
  env = process.env,
}) {
  if (!repo) throw new Error('--repo is required');
  if (!/^[0-9a-f]{40}$/.test(deliveryCommit ?? '')) {
    throw new Error('--delivery-commit must be a lowercase 40-character Git object ID');
  }
  if (!releaseTag) throw new Error('--release-tag is required');
  if (!ghToken) throw new Error('GH_TOKEN is required');
  if (!daloSourceToken) throw new Error('DALO_SOURCE_TOKEN is required');

  const { GH_TOKEN: _existingGhToken, DALO_SOURCE_TOKEN: _existingSourceToken, ...baseEnv } = env;
  const targetEnv = { ...credentialEnv(ghToken, baseEnv), GH_TOKEN: ghToken };
  const sourceEnv = credentialEnv(daloSourceToken, baseEnv);
  const branch = releaseBranch(releaseTag);

  const remote = checked(run, 'git', ['remote', 'get-url', 'origin'], {
    cwd: repo,
    env: targetEnv,
  });
  const repository = parseRepository(remote);
  const currentBranch = checked(run, 'git', ['branch', '--show-current'], {
    cwd: repo,
    env: targetEnv,
  });
  if (currentBranch !== BASE_BRANCH) {
    throw new Error(
      `catalog checkout must be on ${BASE_BRANCH}, found ${currentBranch || 'detached HEAD'}`,
    );
  }
  if (changedPaths(run, repo, targetEnv).length > 0) {
    throw new Error('catalog checkout must be clean before the update');
  }
  checked(run, 'git', ['fetch', '--no-tags', 'origin', BASE_BRANCH], {
    cwd: repo,
    env: targetEnv,
  });
  const head = checked(run, 'git', ['rev-parse', 'HEAD'], { cwd: repo, env: targetEnv });
  const remoteMain = checked(run, 'git', ['rev-parse', 'origin/main'], {
    cwd: repo,
    env: targetEnv,
  });
  if (head !== remoteMain) throw new Error('catalog checkout is not at the current origin/main');

  const dryRunReport = parseJson(
    checked(
      run,
      'dalo',
      ['--dry-run', '--json', 'team', 'catalog', 'update', CATALOG_ID, '--from', BASE_BRANCH],
      { cwd: repo, env: sourceEnv },
    ),
    'Dalo dry run',
  );
  validateReport(dryRunReport, { deliveryCommit, dryRun: true });
  if (dryRunReport.old_version === deliveryCommit) {
    return { status: 'already-current', branch: null, pullRequestUrl: null };
  }

  const updateReport = parseJson(
    checked(
      run,
      'dalo',
      ['--json', 'team', 'catalog', 'update', CATALOG_ID, '--from', BASE_BRANCH],
      { cwd: repo, env: sourceEnv },
    ),
    'Dalo update',
  );
  validateReport(updateReport, { deliveryCommit, dryRun: false });
  if (updateReport.updated !== true) {
    throw new Error('Dalo did not apply the reviewed catalog update');
  }

  const paths = changedPaths(run, repo, targetEnv);
  if (paths.length !== 1 || paths[0] !== 'dalo.toml') {
    throw new Error(`catalog update changed unexpected paths: ${paths.join(', ') || '<none>'}`);
  }
  const expectedManifest = readFileSync(join(repo, 'dalo.toml'), 'utf8');

  const remoteOid = remoteBranchOid(run, repo, branch, targetEnv);
  const pulls = queryOpenPullRequests(run, repository, branch, targetEnv);
  if (remoteOid && pulls.length === 1) {
    return reconcileExistingPullRequest({
      run,
      repo,
      branch,
      pull: pulls[0],
      remoteOid,
      expectedManifest,
      targetEnv,
    });
  }
  if (remoteOid || pulls.length > 0) {
    throw new Error(`contradictory branch or pull-request state for ${branch}`);
  }

  checked(run, 'git', ['switch', '--create', branch], { cwd: repo, env: targetEnv });
  checked(run, 'git', ['config', 'user.name', 'github-actions[bot]'], {
    cwd: repo,
    env: targetEnv,
  });
  checked(
    run,
    'git',
    ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'],
    { cwd: repo, env: targetEnv },
  );
  checked(run, 'git', ['add', '--', 'dalo.toml'], { cwd: repo, env: targetEnv });
  checked(run, 'git', ['commit', '-m', `chore(catalog): update effective-flow to ${releaseTag}`], {
    cwd: repo,
    env: targetEnv,
  });
  checked(run, 'git', ['push', 'origin', `HEAD:refs/heads/${branch}`], {
    cwd: repo,
    env: targetEnv,
  });
  const pullRequestUrl = checked(
    run,
    'gh',
    [
      'pr',
      'create',
      '--repo',
      repository,
      '--base',
      BASE_BRANCH,
      '--head',
      branch,
      '--title',
      `chore(catalog): update effective-flow to ${releaseTag}`,
      '--body',
      `Aktualisiert den Dalo-Katalogeintrag \`${CATALOG_ID}\` auf den mit ${releaseTag} ausgelieferten Commit \`${deliveryCommit}\`.`,
    ],
    { env: targetEnv },
  );
  return { status: 'created-pull-request', branch, pullRequestUrl };
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new Error(`invalid argument near ${key ?? '<end>'}`);
    }
    if (values.has(key)) throw new Error(`duplicate argument ${key}`);
    values.set(key, value);
  }
  const allowed = new Set(['--repo', '--delivery-commit', '--release-tag']);
  for (const key of values.keys()) {
    if (!allowed.has(key)) throw new Error(`unknown argument ${key}`);
  }
  return {
    repo: values.get('--repo'),
    deliveryCommit: values.get('--delivery-commit'),
    releaseTag: values.get('--release-tag'),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = updateTeamCatalog({
      ...parseArguments(process.argv.slice(2)),
      ghToken: process.env.GH_TOKEN,
      daloSourceToken: process.env.DALO_SOURCE_TOKEN,
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
