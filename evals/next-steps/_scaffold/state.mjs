// Host-sealed before/after state, including ignored runtime files and Git metadata.
// This observes retained differences, not transient writes later rolled back.
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
export const STATE_FILE = 'recommendation-state.jsonl';
export const STATE_SCHEMA = 'effective-flow.next-steps-state/1';
export function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
// Include directories (including empty ones), symlinks without following them, modes, and every
// regular file: .git/config, index, refs and logs as well as ignored .effective-flow state.
// The config ADR carries the anchor; the generic scaffold independently seals that entire file.
export function treeState(root) {
  const entries = {};
  function visit(directory, prefix = '') {
    for (const name of readdirSync(directory).sort()) {
      const path = resolve(directory, name);
      const key = prefix ? `${prefix}/${name}` : name;
      if (key === 'docs/adr/effective-flow-project-setup.md') continue;
      const stat = lstatSync(path);
      const mode = stat.mode & 0o777;
      if (stat.isSymbolicLink()) entries[key] = ['symlink', mode, readlinkSync(path)];
      else if (stat.isDirectory()) {
        entries[key] = ['directory', mode];
        visit(path, key);
      } else if (stat.isFile()) entries[key] = ['file', mode, digest(readFileSync(path))];
      else entries[key] = ['special', mode];
    }
  }
  visit(root);
  return entries;
}
export function captureState({ paths }) {
  const errors = [];
  let before = null,
    after = null;
  try {
    const raw = readFileSync(resolve(paths.traceDir, 'state-before.json'), 'utf8');
    const config = readFileSync(
      resolve(paths.projectRoot, 'docs/adr/effective-flow-project-setup.md'),
      'utf8',
    );
    if (!config.includes(`<!-- recommendation-baseline:${digest(raw)} -->`)) {
      throw new Error('the prepared configuration no longer anchors the baseline');
    }
    before = JSON.parse(raw);
  } catch (error) {
    errors.push(`baseline: ${error.message}`);
  }
  try {
    after = treeState(paths.projectRoot);
  } catch (error) {
    errors.push(`project: ${error.message}`);
  }
  return `${JSON.stringify({ schema: STATE_SCHEMA, before, after, errors })}\n`;
}
function validTree(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([key, entry]) =>
        !key.startsWith('/') &&
        !key.split('/').includes('..') &&
        Array.isArray(entry) &&
        ['file', 'directory', 'symlink', 'special'].includes(entry[0]) &&
        Number.isInteger(entry[1]) &&
        entry[1] >= 0 &&
        entry[1] <= 0o777 &&
        (entry[0] === 'file'
          ? entry.length === 3 && /^sha256:[0-9a-f]{64}$/.test(entry[2])
          : entry[0] === 'symlink'
            ? entry.length === 3 && typeof entry[2] === 'string'
            : entry.length === 2),
    )
  );
}
export function parseState(text) {
  try {
    const state = JSON.parse(text);
    if (
      !isDeepStrictEqual(Object.keys(state).sort(), ['after', 'before', 'errors', 'schema']) ||
      state.schema !== STATE_SCHEMA ||
      !Array.isArray(state.errors) ||
      !state.errors.every((error) => typeof error === 'string') ||
      ![state.before, state.after].every((value) => value === null || validTree(value)) ||
      (state.errors.length === 0 && (state.before === null || state.after === null))
    ) {
      throw new Error('unknown or inconsistent state shape');
    }
    return { state, problems: [] };
  } catch (error) {
    return { state: null, problems: [`invalid sealed recommendation state: ${error.message}`] };
  }
}
export function stateFindings(state) {
  if (!state) throw new Error('recommendation evidence requires sealed before/after state');
  const findings = state.errors.map((error) => `state capture failed: ${error}`);
  if (state.before && state.after) {
    const changed = [
      ...new Set([...Object.keys(state.before), ...Object.keys(state.after)]),
    ].filter((path) => !isDeepStrictEqual(state.before[path], state.after[path]));
    if (changed.length)
      findings.push(`recommendation changed project/Git artifacts: ${changed.join(', ')}`);
  }
  return findings;
}
