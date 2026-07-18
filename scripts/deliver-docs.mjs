// Rewrite developer-guide links and append the delivery footer in the docs the
// release workflow copies onto the delivery branch `main`. The pure transforms
// live in build-lib.mjs (unit-tested); this thin wrapper does the file I/O.
//
// Usage: node scripts/deliver-docs.mjs <work-dir> <repo> <source-branch>
//   <work-dir>      main worktree that already holds README.md + docs/user-guide/
//                   (copied from the develop checkout by the release workflow)
//   <repo>          owner/name, e.g. from $GITHUB_REPOSITORY
//   <source-branch> branch the developer-guide links point at, e.g. develop

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { rewriteDeveloperGuideLinks, appendDeliveryFooter } from '../build-lib.mjs';

function fail(message) {
  console.error(`deliver-docs: ${message}`);
  process.exit(1);
}

const [work, repo, sourceBranch] = process.argv.slice(2);
if (!work || !repo || !sourceBranch) {
  fail('usage: node scripts/deliver-docs.mjs <work-dir> <repo> <source-branch>');
}

// Root README: developer-guide links use the `docs/developer-guide/` prefix, and
// only the delivered README carries the delivery footer.
const readmePath = join(work, 'README.md');
if (!existsSync(readmePath)) fail(`expected README.md at ${readmePath}`);
let readme = readFileSync(readmePath, 'utf8');
readme = rewriteDeveloperGuideLinks(readme, { repo, sourceBranch, fromRoot: true });
readme = appendDeliveryFooter(readme, { repo, sourceBranch });
writeFileSync(readmePath, readme);

// docs/user-guide/**/*.md: developer-guide links use the `../developer-guide/`
// prefix. Sibling user-guide links stay relative and resolve on `main`.
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
if (!existsSync(userGuideDir)) fail(`expected docs/user-guide/ at ${userGuideDir}`);
rewriteUserGuide(userGuideDir);

console.log(`deliver-docs: rewrote developer-guide links and appended footer under ${work}`);
