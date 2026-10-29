// Task-owned pinned official dependency, never a project/global install or model capability.
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { fileMembership } from './basis.mjs';
import { digest, readRegular } from './transcript.mjs';
import { requireThat } from './protocol.mjs';
export const runtimePin = () =>
  JSON.parse(readRegular(resolve(import.meta.dirname, '../profiles.json'), 256 * 1024))
    .claudeSandboxRuntime;
export function claudeRuntimeIdentity(root) {
  const pin = runtimePin(),
    physical = realpathSync(root),
    modules = resolve(physical, 'node_modules');
  requireThat(physical === resolve(root), 'sandbox runtime must use a physical path');
  const pkg = JSON.parse(
    readRegular(resolve(modules, '@anthropic-ai/sandbox-runtime/package.json')),
  );
  requireThat(
    pkg.name === pin.name && pkg.version === pin.version,
    'unknown official sandbox runtime',
  );
  const membershipDigest = digest(JSON.stringify(fileMembership(modules, ['.package-lock.json'])));
  requireThat(
    membershipDigest === pin.membershipDigest,
    'sandbox runtime/dependency bytes differ from pinned membership',
  );
  return {
    root: physical,
    cli: resolve(modules, '@anthropic-ai/sandbox-runtime/dist/cli.js'),
    membershipDigest,
    version: pin.version,
    integrity: pin.integrity,
  };
}
export async function prepareClaudeRuntime(root) {
  requireThat(!existsSync(root), 'task-owned sandbox runtime destination must be absent');
  mkdirSync(root, { recursive: true });
  root = realpathSync(root);
  const pin = runtimePin();
  const metadata = await (
    await fetch('https://registry.npmjs.org/@anthropic-ai%2fsandbox-runtime/' + pin.version)
  ).json();
  requireThat(
    metadata.name === pin.name &&
      metadata.version === pin.version &&
      metadata.dist?.integrity === pin.integrity &&
      metadata.dist.tarball === pin.tarball &&
      metadata._npmUser?.trustedPublisher?.id === 'github' &&
      metadata.repository?.url === 'git+' + pin.repository + '.git',
    'official registry publisher/version/integrity changed',
  );
  const archive = Buffer.from(await (await fetch(pin.tarball)).arrayBuffer());
  requireThat(
    'sha512-' + createHash('sha512').update(archive).digest('base64') === pin.integrity,
    'official runtime archive integrity mismatch',
  );
  writeFileSync(resolve(root, 'official-metadata.json'), JSON.stringify(metadata));
  writeFileSync(resolve(root, 'official.tgz'), archive);
  writeFileSync(
    resolve(root, 'package.json'),
    JSON.stringify({
      name: pin.lock.name,
      private: true,
      dependencies: { [pin.name]: pin.version },
    }),
  );
  writeFileSync(resolve(root, 'package-lock.json'), JSON.stringify(pin.lock));
  const home = resolve(root, 'install-home');
  mkdirSync(home);
  for (const p of ['user.npmrc', 'global.npmrc']) writeFileSync(resolve(root, p), '');
  const run = spawnSync(
    'npm',
    [
      'ci',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--userconfig',
      resolve(root, 'user.npmrc'),
      '--globalconfig',
      resolve(root, 'global.npmrc'),
      '--cache',
      resolve(root, 'cache'),
      '--prefix',
      root,
    ],
    {
      env: { PATH: process.env.PATH, HOME: home },
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 1024 * 1024,
    },
  );
  requireThat(
    !run.error && run.status === 0,
    'isolated pinned runtime preparation failed: ' + run.stderr,
  );
  return claudeRuntimeIdentity(root);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  requireThat(
    process.argv.length === 3,
    'usage: node claude-runtime.mjs ABSENT_PRIVATE_RUNTIME_DIRECTORY',
  );
  const result = await prepareClaudeRuntime(resolve(process.argv[2]));
  process.stdout.write(JSON.stringify(result) + '\n');
}
