// Independently observe the current Git basis against a helper checkpoint; retain only digests.
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { digest, readRegular } from './transcript.mjs';
import { requireThat } from './protocol.mjs';
export function observeDrift(manifest) {
  const root = resolve(manifest.checkout),
    ref = manifest.checkpoint;
  requireThat(
    ref && typeof ref.path === 'string' && typeof ref.root === 'string',
    'actual pre-drift checkpoint required',
  );
  const file = resolve(ref.root, ref.path);
  requireThat(
    file.startsWith(resolve(ref.root) + '/') && !ref.path.split('/').includes('..'),
    'unsafe checkpoint reference',
  );
  const text = readRegular(file, 16 * 1024);
  requireThat(digest(text) === ref.digest, 'changed pre-drift checkpoint');
  const before = JSON.parse(text).snapshot;
  requireThat(
    before && before.head && before.index && before.workingTree && before.untracked,
    'checkpoint content basis missing',
  );
  const git = (...args) => execFileSync('git', args, { cwd: root });
  const list = (...args) =>
    git(...args)
      .toString('utf8')
      .split('\0')
      .filter(Boolean);
  const content = (names) =>
    digest(
      JSON.stringify(
        [...new Set(names)].sort().map((name) => {
          requireThat(!name.split('/').includes('..') && !name.startsWith('/'), 'unsafe Git file');
          const path = resolve(root, name);
          let stat;
          try {
            stat = lstatSync(path);
          } catch (error) {
            if (error.code === 'ENOENT') return [name, 'missing'];
            throw error;
          }
          if (stat.isSymbolicLink()) return [name, 'symlink', digest(readlinkSync(path))];
          requireThat(stat.isFile(), 'unsupported tracked entry');
          return [name, stat.mode & 0o111, digest(readFileSync(path))];
        }),
      ),
    );
  const after = {
    head: git('rev-parse', 'HEAD').toString('utf8').trim(),
    index: digest(git('ls-files', '--stage', '-z')),
    workingTree: content(list('ls-files', '-z')),
    untracked: content(list('ls-files', '--others', '--exclude-standard', '-z')),
  };
  return { checkpointDigest: ref.digest, before, after };
}
