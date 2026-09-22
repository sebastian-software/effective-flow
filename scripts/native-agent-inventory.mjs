#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import {
  extractFrontmatter,
  getField,
  parseNativeAgentInventory,
  reconcileNativeAgentInventories,
} from '../build-lib.mjs';

const FAILURE = 'Native agent inventory validation failed\n';

function artifactNames(directory, harness) {
  return readdirSync(directory, { withFileTypes: true }).map((entry) => {
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('invalid artifact entry');
    const content = readFileSync(join(directory, entry.name), 'utf8');
    const declaredName =
      harness === 'claude'
        ? getField(extractFrontmatter(content), 'name')
        : (content.match(/^name\s*=\s*"([^"]+)"\s*$/m)?.[1] ?? '');
    return { name: entry.name, declaredName };
  });
}

function validate([operation, claudePath, claudeDir, codexPath, codexDir]) {
  if (
    operation !== 'validate' ||
    !claudePath ||
    !claudeDir ||
    !codexPath ||
    !codexDir ||
    process.argv.length !== 7
  ) {
    throw new Error('invalid invocation');
  }
  const claudeInventory = parseNativeAgentInventory(readFileSync(claudePath, 'utf8'), {
    context: 'Claude native inventory',
  });
  const codexInventory = parseNativeAgentInventory(readFileSync(codexPath, 'utf8'), {
    context: 'Codex native inventory',
  });
  reconcileNativeAgentInventories(claudeInventory, codexInventory, {
    claudeArtifacts: artifactNames(claudeDir, 'claude'),
    codexArtifacts: artifactNames(codexDir, 'codex'),
    context: 'native distribution',
  });
}

try {
  validate(process.argv.slice(2));
} catch {
  process.stderr.write(FAILURE);
  process.exitCode = 1;
}
