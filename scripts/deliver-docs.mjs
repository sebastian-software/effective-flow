// Rewrite developer-guide links, append the delivery footer, and write the
// AGENTS.md/CLAUDE.md guidance pair in the tree the release workflow copies onto
// the delivery branch `main`. The pure transforms and the generated guidance
// bodies live in build-lib.mjs (unit-tested); this thin wrapper does the file I/O.
//
// Usage: node scripts/deliver-docs.mjs <work-dir> <repo> <source-branch>
//   <work-dir>      main worktree that already holds README.md + docs/user-guide/
//                   (copied from the develop checkout by the release workflow)
//   <repo>          owner/name, e.g. from $GITHUB_REPOSITORY
//   <source-branch> branch the developer-guide links point at, e.g. develop

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  rewriteDeveloperGuideLinks,
  appendDeliveryFooter,
  deliveryGuidance,
} from '../build-lib.mjs';

function fail(message) {
  console.error(`deliver-docs: ${message}`);
  process.exit(1);
}

export function deliverDocs(work, repo, sourceBranch) {
  if (!work || !repo || !sourceBranch) {
    throw new Error('work, repo and sourceBranch are required');
  }

  // Refuse to run against a source checkout. This writes AGENTS.md and CLAUDE.md whole,
  // so pointing the documented standalone CLI at the repository root would replace a
  // full source-tree AGENTS.md with the nine-line delivery one and report success. A
  // delivery work tree never carries build.mjs or src/; a source checkout always does.
  if (existsSync(join(work, 'build.mjs')) || existsSync(join(work, 'src'))) {
    throw new Error(
      `refusing to deliver into a source checkout at ${work}: it carries build.mjs or src/`,
    );
  }

  // Root README: developer-guide links use the `docs/developer-guide/` prefix,
  // and only the delivered README carries the delivery footer.
  const readmePath = join(work, 'README.md');
  if (!existsSync(readmePath)) throw new Error(`expected README.md at ${readmePath}`);
  let readme = readFileSync(readmePath, 'utf8');
  readme = rewriteDeveloperGuideLinks(readme, { repo, sourceBranch, fromRoot: true });
  readme = appendDeliveryFooter(readme, { repo, sourceBranch });
  writeFileSync(readmePath, readme);

  // AGENTS.md + CLAUDE.md: the only carrier an agent loads unconditionally, so a
  // worktree cut from the delivery branch learns the branch model without being
  // asked. Both are written whole, which makes a re-delivery byte-identical.
  const guidance = deliveryGuidance(repo, sourceBranch);
  writeFileSync(join(work, 'AGENTS.md'), guidance.agents);
  writeFileSync(join(work, 'CLAUDE.md'), guidance.claude);

  // docs/user-guide/**/*.md: developer-guide links use the
  // `../developer-guide/` prefix. Sibling user-guide links stay relative.
  function rewriteUserGuide(dir) {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        rewriteUserGuide(path);
      } else if (entry.endsWith('.md')) {
        const rewritten = rewriteDeveloperGuideLinks(readFileSync(path, 'utf8'), {
          repo,
          sourceBranch,
          fromRoot: false,
        });
        writeFileSync(path, rewritten);
      }
    }
  }
  const userGuideDir = join(work, 'docs', 'user-guide');
  if (!existsSync(userGuideDir)) {
    throw new Error(`expected docs/user-guide/ at ${userGuideDir}`);
  }
  rewriteUserGuide(userGuideDir);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [work, repo, sourceBranch] = process.argv.slice(2);
  if (!work || !repo || !sourceBranch) {
    fail('usage: node scripts/deliver-docs.mjs <work-dir> <repo> <source-branch>');
  }
  try {
    deliverDocs(work, repo, sourceBranch);
    console.log(
      `deliver-docs: rewrote developer-guide links, appended footer and wrote AGENTS.md + CLAUDE.md under ${work}`,
    );
  } catch (error) {
    fail(error.message);
  }
}
