#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSkillOwnershipManifest } from '../build-lib.mjs';

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const MANIFEST_PATH = join(ROOT_DIR, 'docs', 'developer-guide', 'skill-ownership.json');
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function discoverFromDirectory(inputPath) {
  const nestedSkills = join(inputPath, 'skills');
  const skillsDirectory =
    existsSync(nestedSkills) && statSync(nestedSkills).isDirectory() ? nestedSkills : inputPath;
  return readdirSync(skillsDirectory, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && existsSync(join(skillsDirectory, entry.name, 'SKILL.md')),
    )
    .map((entry) => entry.name)
    .sort();
}

function discoverFromListing(inputPath) {
  return readFileSync(inputPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => basename(line.replace(/\/$/, '')))
    .sort();
}

export function auditSkillOwnership(inputPath) {
  const resolvedInput = resolve(inputPath);
  if (!existsSync(resolvedInput)) {
    throw new Error(`Skills directory or listing not found: ${resolvedInput}`);
  }
  const discovered = statSync(resolvedInput).isDirectory()
    ? discoverFromDirectory(resolvedInput)
    : discoverFromListing(resolvedInput);
  const invalid = discovered.filter((skill) => !SKILL_NAME_RE.test(skill));
  if (invalid.length > 0) {
    throw new Error(`Invalid skill name(s) in supplied input: ${invalid.join(', ')}`);
  }

  const manifest = parseSkillOwnershipManifest(readFileSync(MANIFEST_PATH, 'utf8'), {
    context: 'docs/developer-guide/skill-ownership.json',
  });
  const declared = new Set(manifest.relationships.map((relationship) => relationship.skill));
  const upstream = new Set(discovered);
  return {
    skillsDirectory: resolvedInput,
    discovered,
    candidates: discovered.filter((skill) => !declared.has(skill)),
    declaredMissingFromInput: [...declared].filter((skill) => !upstream.has(skill)).sort(),
  };
}

function main() {
  const [inputPath] = process.argv.slice(2);
  if (!inputPath) {
    throw new Error(
      'Usage: pnpm audit:skill-ownership -- <local-skills-checkout|skills-directory|listing-file>',
    );
  }
  const result = auditSkillOwnership(inputPath);
  process.stdout.write(
    `Inspected ${result.discovered.length} local skill(s) from ${result.skillsDirectory}.\n`,
  );
  if (result.candidates.length === 0) {
    process.stdout.write('No undeclared upstream review candidates found.\n');
  } else {
    process.stdout.write(
      `Review candidate(s) without a declared Effective Flow relationship:\n${result.candidates.map((skill) => `  - ${skill}`).join('\n')}\n`,
    );
  }
  if (result.declaredMissingFromInput.length > 0) {
    process.stdout.write(
      `Declared relationship skill(s) absent from the supplied input:\n${result.declaredMissingFromInput.map((skill) => `  - ${skill}`).join('\n')}\n`,
    );
  }
  process.stdout.write(
    'Audit output is advisory. Review candidates manually; the manifest was not changed.\n',
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  }
}
