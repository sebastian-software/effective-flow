import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { digest } from './transcript.mjs';
import { requireThat } from './protocol.mjs';
export function fileMembership(root, exclude = []) {
  const entries = {};
  function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const path = resolve(dir, name),
        key = relative(root, path);
      if (exclude.some((prefix) => key === prefix || key.startsWith(prefix + '/'))) continue;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) entries[key] = ['symlink', digest(readlinkSync(path))];
      else if (stat.isDirectory()) walk(path);
      else {
        requireThat(stat.isFile(), 'special evidence entry');
        entries[key] = ['file', stat.mode & 0o111, digest(readFileSync(path))];
      }
    }
  }
  walk(resolve(root));
  return entries;
}
export function checkoutBasis(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root });
  const list = (...args) =>
    git(...args)
      .toString('utf8')
      .split('\0')
      .filter(Boolean);
  const contents = (names) =>
    digest(
      JSON.stringify(
        [...new Set(names)].sort().map((name) => {
          requireThat(
            !name.startsWith('/') && !name.split('/').includes('..'),
            'unsafe Git content',
          );
          const path = resolve(root, name);
          let stat;
          try {
            stat = lstatSync(path);
          } catch (error) {
            if (error.code === 'ENOENT') return [name, 'missing'];
            throw error;
          }
          if (stat.isSymbolicLink()) return [name, 'symlink', digest(readlinkSync(path))];
          requireThat(stat.isFile(), 'unsupported Git content');
          return [name, stat.mode & 0o111, digest(readFileSync(path))];
        }),
      ),
    );
  const head = git('rev-parse', 'HEAD').toString('utf8').trim();
  return {
    head,
    index: digest(git('ls-files', '--stage', '-z')),
    workingTree: contents(list('ls-files', '-z')),
    untracked: contents(list('ls-files', '--others', '--exclude-standard', '-z')),
  };
}
// Tracked and non-ignored source only: do not inspect ignored auth/local environment files.
export function sourceMembership(root, excluded = []) {
  const names = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: root },
    )
      .toString('utf8')
      .split('\0')
      .filter(Boolean),
    entries = {};
  for (const name of [...new Set(names)].sort()) {
    if (excluded.some((prefix) => name === prefix || name.startsWith(prefix + '/'))) continue;
    const path = resolve(root, name),
      stat = lstatSync(path);
    requireThat(!name.startsWith('/') && !name.split('/').includes('..'), 'unsafe source name');
    if (stat.isSymbolicLink()) entries[name] = ['symlink', digest(readlinkSync(path))];
    else {
      requireThat(stat.isFile(), 'unsupported source entry');
      entries[name] = ['file', stat.mode & 0o111, digest(readFileSync(path))];
    }
  }
  return entries;
}
