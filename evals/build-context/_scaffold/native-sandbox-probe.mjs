// Run by the actual Codex CLI sandbox, never around the parent CLI. No model, auth or API call.
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const hash = (v) => 'sha256:' + createHash('sha256').update(v).digest('hex');
const input = JSON.parse(readFileSync(0, 'utf8')),
  startedAt = Date.now();
const git = (args, options = {}) => {
  const r = spawnSync('git', args, {
    cwd: input.fixture,
    env: {
      ...process.env,
      GIT_INDEX_FILE: input.index,
      GIT_AUTHOR_NAME: 'Fixture guard',
      GIT_AUTHOR_EMAIL: 'fixture@invalid',
      GIT_COMMITTER_NAME: 'Fixture guard',
      GIT_COMMITTER_EMAIL: 'fixture@invalid',
    },
    encoding: 'utf8',
    ...options,
  });
  if (r.status !== 0) throw Error('native fixture Git operation failed: ' + r.stderr);
  return r.stdout.trim();
};
let denied = 0;
for (const file of [...input.canaries, input.link]) {
  try {
    writeFileSync(file, 'invalid guard write');
  } catch (e) {
    if (['EPERM', 'EACCES'].includes(e.code)) denied++;
    else throw e;
  }
}
const descendant = spawnSync(
  process.execPath,
  [
    '-e',
    'const f=require("node:fs");let n=0;for(const p of process.argv.slice(1)){try{f.writeFileSync(p,"invalid descendant write")}catch(e){if(["EPERM","EACCES"].includes(e.code))n++;}}console.log(n);process.exit(n===process.argv.length-1?0:73);',
    ...input.canaries,
    input.link,
  ],
  { encoding: 'utf8' },
);
const inheritedDenied =
  descendant.status === 0 && Number(descendant.stdout.trim()) === input.canaries.length + 1;
const fixtureRead =
  readFileSync(resolve(input.fixture, '.build-context-fixture'), 'utf8').trim() ===
  'effective-flow.build-context/1';
const temporary = resolve(input.fixture, '.native-guard-write-' + input.nonce);
writeFileSync(temporary, 'native fixture write');
const fixtureWrite = readFileSync(temporary, 'utf8') === 'native fixture write';
rmSync(temporary);
git(['read-tree', 'HEAD']);
const tree = git(['write-tree']),
  parent = git(['rev-parse', 'HEAD']),
  commit = git(['-c', 'commit.gpgsign=false', 'commit-tree', tree, '-p', parent], {
    input: 'test: native sandbox guard\n',
  });
git([
  '-c',
  'core.hooksPath=/dev/null',
  'push',
  '--quiet',
  input.origin,
  commit + ':' + input.branch,
]);
const gitPush = git(['--git-dir', input.origin, 'rev-parse', input.branch]) === commit;
const before = existsSync(input.ledger) ? readFileSync(input.ledger, 'utf8') : '';
spawnSync(process.execPath, [input.stub, 'host-guard-probe'], {
  cwd: input.fixture,
  input: JSON.stringify({ cwd: input.fixture }),
  encoding: 'utf8',
});
const after = readFileSync(input.ledger, 'utf8'),
  stubLedger =
    after.length > before.length &&
    after.slice(before.length).includes('"operation":"host-guard-probe"') &&
    !existsSync(input.ledger + '.lock');
const result = {
  schema: 'effective-flow.build-context/1/native-guard',
  startedAt,
  denied,
  inheritedDenied,
  fixtureRead,
  fixtureWrite,
  gitCommit: /^[a-f0-9]{40}$/.test(commit),
  gitPush,
  stubLedger,
  wrapperDigest: hash(readFileSync(import.meta.filename)),
};
process.stdout.write(JSON.stringify(result) + '\n');
process.exit(
  denied === input.canaries.length + 1 &&
    inheritedDenied &&
    fixtureRead &&
    fixtureWrite &&
    result.gitCommit &&
    gitPush &&
    stubLedger
    ? 0
    : 72,
);
