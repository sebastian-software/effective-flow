#!/usr/bin/env node

// Materialize exactly what the default delivery branch publishes: one portable
// effective-flow skill plus consumer documentation. Native harness artifacts
// remain release-archive-only and are deliberately removed from the staged tree.

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deliverDocs } from './deliver-docs.mjs';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

function fail(message) {
  console.error(`stage-delivery: ${message}`);
  process.exit(1);
}

export function stageDelivery(work, repo, sourceBranch, { root = ROOT_DIR } = {}) {
  const portableSkill = join(root, 'dist', 'portable', 'effective-flow');
  if (!existsSync(join(portableSkill, 'SKILL.md'))) {
    throw new Error(`portable build not found at ${portableSkill}; run node build.mjs first`);
  }
  mkdirSync(work, { recursive: true });

  for (const entry of [
    'claude',
    'codex',
    'portable',
    'effective-flow',
    'README.md',
    join('docs', 'user-guide'),
    join('docs', 'developer-guide'),
    'renovate.json',
  ]) {
    rmSync(join(work, entry), { recursive: true, force: true });
  }

  cpSync(portableSkill, join(work, 'effective-flow'), { recursive: true });
  cpSync(join(root, 'README.md'), join(work, 'README.md'));
  mkdirSync(join(work, 'docs'), { recursive: true });
  cpSync(join(root, 'docs', 'user-guide'), join(work, 'docs', 'user-guide'), {
    recursive: true,
  });
  cpSync(join(root, 'scripts', 'delivery-renovate.json'), join(work, 'renovate.json'));
  deliverDocs(work, repo, sourceBranch);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [work, repo, sourceBranch] = process.argv.slice(2);
  if (!work || !repo || !sourceBranch) {
    fail('usage: node scripts/stage-delivery.mjs <work-dir> <repo> <source-branch>');
  }
  try {
    stageDelivery(work, repo, sourceBranch);
    console.log(`stage-delivery: published one portable effective-flow skill under ${work}`);
  } catch (error) {
    fail(error.message);
  }
}
