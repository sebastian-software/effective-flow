import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const SKILL_ROOT_PLACEHOLDER = '{{SKILL_ROOT}}';
export const PROJECT_ROOT_PLACEHOLDER = '{{PROJECT_ROOT}}';
// The project root appears twice: once as the execution and runtime-state root, and once as the
// literal `"cwd"` value every helper request must carry. Running a shell from that directory does
// not populate the JSON field, and a record without it is invalid evidence.
const REQUIRED_PLACEHOLDER_COUNTS = new Map([
  [SKILL_ROOT_PLACEHOLDER, 3],
  [PROJECT_ROOT_PLACEHOLDER, 2],
]);
const PLACEHOLDER_RE = /\{\{[A-Z][A-Z0-9_]*\}\}/g;
const PROMPT_START = '<!-- prompt:start -->';
const PROMPT_END = '<!-- prompt:end -->';

export function digestText(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

export function extractPrompt(source, label = 'scenario') {
  const starts = source.split(PROMPT_START).length - 1;
  const ends = source.split(PROMPT_END).length - 1;
  if (starts !== 1 || ends !== 1) {
    throw new Error(`${label} must contain exactly one ${PROMPT_START} … ${PROMPT_END} region`);
  }
  const start = source.indexOf(PROMPT_START);
  const end = source.indexOf(PROMPT_END);
  if (end < start) throw new Error(`${label} ends its prompt before it starts`);
  const region = source.slice(start + PROMPT_START.length, end).trim();
  const fence = region.match(/^```[^\n]*\n([\s\S]*?)\n```$/);
  if (!fence || fence[1].trim() === '') {
    throw new Error(`${label}: prompt region is not one non-empty fenced block`);
  }
  return fence[1].trim();
}

export function promptTemplate(path) {
  return extractPrompt(readFileSync(path, 'utf8'), path);
}

export function renderPrompt(template, { skillRoot, projectRoot }) {
  const occurrences = template.match(PLACEHOLDER_RE) ?? [];
  const found = [...new Set(occurrences)].sort();
  const expected = [PROJECT_ROOT_PLACEHOLDER, SKILL_ROOT_PLACEHOLDER].sort();
  if (JSON.stringify(found) !== JSON.stringify(expected)) {
    throw new Error(
      `prompt placeholders must be exactly ${expected.join(', ')}; found ${found.join(', ') || '(none)'}`,
    );
  }
  for (const [placeholder, expectedCount] of REQUIRED_PLACEHOLDER_COUNTS) {
    const actualCount = occurrences.filter((value) => value === placeholder).length;
    if (actualCount !== expectedCount) {
      throw new Error(
        `prompt must contain ${placeholder} exactly ${expectedCount} time(s); found ${actualCount}`,
      );
    }
  }
  const rendered = template
    .replaceAll(SKILL_ROOT_PLACEHOLDER, skillRoot)
    .replaceAll(PROJECT_ROOT_PLACEHOLDER, projectRoot);
  const leftovers = rendered.match(PLACEHOLDER_RE) ?? [];
  if (leftovers.length > 0) {
    throw new Error(`unrendered prompt placeholder(s): ${leftovers.join(', ')}`);
  }
  return rendered;
}
