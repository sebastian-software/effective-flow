// Independently observe the current Git basis against a helper checkpoint; retain only digests.
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { resolve, parse, sep } from 'node:path';
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
  const index = git('ls-files', '--stage', '-z');
  const indexedModes = new Map();
  for (const entry of index.toString('utf8').split('\0').filter(Boolean)) {
    const match = /^([0-7]{6}) [a-f0-9]{40}(?:[a-f0-9]{24})? ([0-3])\t([\s\S]+)$/.exec(entry);
    requireThat(match, 'invalid drift index');
    indexedModes.set(match[3], indexedModes.has(match[3]) || match[2] !== '0' ? null : match[1]);
  }
  const existingParents = (target) => {
    let current = parse(target).root;
    for (const part of target.slice(current.length).split(sep).filter(Boolean)) {
      current = resolve(current, part);
      let stat;
      try {
        stat = lstatSync(current);
      } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
      }
      requireThat(!stat.isSymbolicLink(), 'unsafe drift ancestor');
      if (stat.isFile()) return false;
      requireThat(stat.isDirectory(), 'unsafe drift ancestor');
    }
    return true;
  };
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
            if (!existingParents(resolve(path, '..'))) return [name, 'missing'];
            stat = lstatSync(path);
          } catch (error) {
            if (error.code === 'ENOENT') return [name, 'missing'];
            throw error;
          }
          requireThat(indexedModes.get(name) !== '160000', 'unsupported drift submodule');
          if (stat.isDirectory() && ['100644', '100755', '120000'].includes(indexedModes.get(name)))
            return [name, 'missing'];
          if (stat.isSymbolicLink()) return [name, 'symlink', digest(readlinkSync(path))];
          requireThat(stat.isFile(), 'unsupported tracked entry');
          return [name, stat.mode & 0o111 ? '100755' : '100644', digest(readFileSync(path))];
        }),
      ),
    );
  const after = {
    head: git('rev-parse', 'HEAD').toString('utf8').trim(),
    index: digest(index),
    workingTree: content(list('ls-files', '-z')),
    untracked: content(list('ls-files', '--others', '--exclude-standard', '-z')),
  };
  return { checkpointDigest: ref.digest, before, after };
}
