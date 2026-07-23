#!/usr/bin/env node

// Materialize exactly what the default delivery branch publishes: one portable
// effective-flow skill, consumer documentation, and narrowly scoped trusted
// automation. Native harness artifacts remain release-archive-only and are
// deliberately removed from the staged tree.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRetiredConfigDocViolations } from '../build-lib.mjs';
import { deliverDocs } from './deliver-docs.mjs';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const TRUSTED_AUTOMATION = [
  join('.github', 'workflows', 'close-develop-issues.yml'),
  join('.github', 'scripts', 'close-develop-issues.mjs'),
];

function fail(message) {
  console.error(`stage-delivery: ${message}`);
  process.exit(1);
}

function assertStagedDocumentationUsesProjectSetupAdr(work) {
  const markdownFiles = [join(work, 'README.md')];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith('.md')) markdownFiles.push(path);
    }
  };
  visit(join(work, 'docs', 'user-guide'));

  const violations = markdownFiles.flatMap((file) =>
    findRetiredConfigDocViolations(relative(work, file), readFileSync(file, 'utf8')),
  );
  if (violations.length > 0) {
    throw new Error(
      'delivery docs config guard (#166) rejected the staged payload:\n' +
        violations
          .map(({ file, line, kind, reference }) => `  ${file}:${line}: ${kind}: ${reference}`)
          .join('\n'),
    );
  }
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
    'LICENSE',
    'README.md',
    join('docs', 'user-guide'),
    join('docs', 'developer-guide'),
    'renovate.json',
  ]) {
    rmSync(join(work, entry), { recursive: true, force: true });
  }

  cpSync(join(root, 'LICENSE'), join(work, 'LICENSE'));
  cpSync(portableSkill, join(work, 'effective-flow'), { recursive: true });
  cpSync(join(root, 'README.md'), join(work, 'README.md'));
  mkdirSync(join(work, 'docs'), { recursive: true });
  cpSync(join(root, 'docs', 'user-guide'), join(work, 'docs', 'user-guide'), {
    recursive: true,
  });
  cpSync(join(root, 'scripts', 'delivery-renovate.json'), join(work, 'renovate.json'));
  for (const path of TRUSTED_AUTOMATION) {
    const target = join(work, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(root, path), target);
  }
  deliverDocs(work, repo, sourceBranch);
  assertStagedDocumentationUsesProjectSetupAdr(work);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [work, repo, sourceBranch] = process.argv.slice(2);
  if (!work || !repo || !sourceBranch) {
    fail('usage: node scripts/stage-delivery.mjs <work-dir> <repo> <source-branch>');
  }
  try {
    stageDelivery(work, repo, sourceBranch);
    console.log(
      `stage-delivery: published one portable effective-flow skill and trusted automation under ${work}`,
    );
  } catch (error) {
    fail(error.message);
  }
}
