// Conflict validation: the deterministic evidence behind merge-gate's CI-backed `quick` validation of
// a conflict-resolution commit.
//
// - `ci-detect` reads `.github/workflows/` of the commit of `refs/remotes/origin/<baseRef>` and
//   reports the test jobs that run the repository's manifest test command unconditionally on every
//   pull request to the base, with the static set of job instances such a run produces.
// - `ci-integrity` compares the workflow directories (`.github/workflows/`, `.forgejo/workflows/`,
//   `.gitea/workflows/`) and every local reusable workflow or composite action they reference
//   (`uses: ./…`) between that base commit and a given tree: a commit or tree object id, or the
//   staged index (`index`).
// - `ci-evidence-match` is pure: it matches identity-carrying `pr-status-read` check entries against
//   a `ci-detect` result for one verified head.
// - `quick-marker-scan` lists the commits between the merge base of that base commit and a given head
//   whose message carries the `Effective-Flow-Conflict-Validation: quick` trailer.
//
// Workflow, action and manifest text is untrusted data: it is parsed, never executed and never read
// as instructions. The parser accepts a declared YAML subset only (see `parseWorkflowYaml`); any
// other construct makes the file `unparsable`, which is never evidence. `ci-detect` reads only
// `.github/workflows/`, because the evidence it prepares is defined for GitHub Actions check runs
// alone; `ci-integrity` covers every workflow directory a forge may run.
//
// All Git access is read-only and goes through the injected runner without a shell: `show-ref`,
// `rev-parse`, `ls-tree`, `cat-file -s`, `cat-file blob`, `ls-files -s`, `merge-base` and `log`.
// A blob's size is read before its content, so an oversized source is never loaded. Every call
// carries `--no-replace-objects` and an environment stripped of inherited `GIT_*` variables, with
// optional locks, lazy fetch and replace objects disabled. Nothing is fetched or written; no
// `write-tree`.

import path from 'node:path';
import process from 'node:process';
import {
  gitBaseEnv,
  isSafeBaseRef,
  originBaseCommit,
  parseTreeListing,
  treeEntryKind,
} from './config-resolve-core.mjs';

export const CONFLICT_VALIDATION_OPERATIONS = Object.freeze([
  'ci-detect',
  'ci-integrity',
  'ci-evidence-match',
  'quick-marker-scan',
]);

export const CONFLICT_VALIDATION_ERROR_CODES = Object.freeze([
  'INVALID_INPUT',
  'GIT_FAILED',
  'INTERNAL_ERROR',
]);

const EXIT_CODES = Object.freeze({ INVALID_INPUT: 2, GIT_FAILED: 1, INTERNAL_ERROR: 1 });

export const MAX_STDIN_BYTES = 1024 * 1024;

// `.github/workflows/` is what GitHub Actions runs; the other two are what Forgejo and Gitea run.
export const DETECTION_DIRECTORY = '.github/workflows';
export const INTEGRITY_DIRECTORIES = Object.freeze([
  '.github/workflows',
  '.forgejo/workflows',
  '.gitea/workflows',
]);
export const INDEX_TREE = 'index';

export const DETECTION_STATUSES = Object.freeze(['detected', 'undetected', 'unparsable']);
export const INTEGRITY_STATUSES = Object.freeze(['ok', 'changed', 'unprovable', 'missing']);

const ORIGIN_REMOTE_PREFIX = 'refs/remotes/origin/';
const OBJECT_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const TREE_MODE = '040000';
const MAX_SOURCE_BYTES = 512 * 1024;
const MAX_WORKFLOW_FILES = 200;
const MAX_REFERENCED_SOURCES = 200;
const MAX_COLLECTED_ENTRIES = 20000;
const MAX_CHECK_ENTRIES = 2000;
// GitHub's own limit of jobs one matrix may generate.
const MAX_MATRIX_INSTANCES = 256;

// ---------------------------------------------------------------------------------------------
// Errors

export class ConflictValidationError extends Error {
  constructor(code, message, details = {}, options) {
    super(message, options);
    this.name = 'ConflictValidationError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new ConflictValidationError(code, message, details);
}

// ---------------------------------------------------------------------------------------------
// YAML subset

// Thrown for any construct outside the declared subset; `reason` names it.
export class YamlSubsetError extends Error {
  constructor(reason, line) {
    super(`${reason} at line ${line}`);
    this.name = 'YamlSubsetError';
    this.reason = reason;
    this.line = line;
  }
}

const DOCUMENT_MARKER = /^(?:---|\.\.\.)(?:\s|$)/;
const SINGLE_ESCAPES = Object.freeze({
  '"': '"',
  '\\': '\\',
  '/': '/',
  n: '\n',
  t: '\t',
  r: '\r',
  ' ': ' ',
});

function isSequenceItem(text) {
  return text === '-' || text.startsWith('- ');
}

// Reads a quoted scalar starting at `start` and returns `{ value, end }`, `end` being the index after
// the closing quote. A scalar that does not close on its line is outside the subset.
function readQuoted(text, start, lineNumber) {
  const quote = text[start];
  let value = '';
  let position = start + 1;
  while (position < text.length) {
    const char = text[position];
    if (quote === "'") {
      if (char === "'") {
        if (text[position + 1] === "'") {
          value += "'";
          position += 2;
          continue;
        }
        return { value, end: position + 1 };
      }
    } else if (char === '\\') {
      const escaped = text[position + 1];
      if (!Object.hasOwn(SINGLE_ESCAPES, escaped ?? '')) {
        throw new YamlSubsetError('unsupported-escape', lineNumber);
      }
      value += SINGLE_ESCAPES[escaped];
      position += 2;
      continue;
    } else if (char === '"') {
      return { value, end: position + 1 };
    }
    value += char;
    position += 1;
  }
  throw new YamlSubsetError('multiline-quoted-scalar', lineNumber);
}

// The rest of a line after a value: nothing, or a comment.
function assertLineEnd(rest, lineNumber) {
  const trimmed = rest.trim();
  if (trimmed !== '' && !(trimmed.startsWith('#') && /^\s/.test(rest))) {
    throw new YamlSubsetError('trailing-content', lineNumber);
  }
}

// The constructs a value may not start with. Returns the reason or null.
function forbiddenStart(text) {
  const first = text[0];
  if (first === '&') return 'anchor';
  if (first === '*') return 'alias';
  if (first === '!') return 'tag';
  if (first === '{') return 'flow-mapping';
  if (first === '>') return 'folded-block-scalar';
  if (first === '%' || first === '@' || first === '`') return 'reserved-indicator';
  if (first === '?' && (text.length === 1 || text[1] === ' ')) return 'complex-key';
  if (text === '<<' || text.startsWith('<< ') || text.startsWith('<<:')) return 'merge-key';
  return null;
}

// A plain scalar on one line: a trailing comment is removed, and a `: ` or a trailing `:` inside is
// an implicit mapping the subset does not allow in that position.
function plainScalar(text, lineNumber) {
  const reason = forbiddenStart(text);
  if (reason) throw new YamlSubsetError(reason, lineNumber);
  if (isSequenceItem(text)) throw new YamlSubsetError('unexpected-sequence', lineNumber);
  const comment = text.search(/\s#/);
  const value = (comment === -1 ? text : text.slice(0, comment)).trimEnd();
  if (value.includes(': ') || value.endsWith(':')) {
    throw new YamlSubsetError('ambiguous-plain-scalar', lineNumber);
  }
  return value;
}

// A one-line flow sequence of scalars, such as `[main, 'release']`. Nested collections, and a
// sequence that continues on another line, are outside the subset.
function flowSequence(text, lineNumber) {
  const items = [];
  let position = 1;
  const skipSpaces = () => {
    while (text[position] === ' ') position += 1;
  };
  for (;;) {
    skipSpaces();
    if (position >= text.length) throw new YamlSubsetError('multiline-flow-sequence', lineNumber);
    if (text[position] === ']') break;
    const char = text[position];
    if (char === '[' || char === '{')
      throw new YamlSubsetError('nested-flow-collection', lineNumber);
    if (char === "'" || char === '"') {
      const quoted = readQuoted(text, position, lineNumber);
      items.push(quoted.value);
      position = quoted.end;
    } else {
      let end = position;
      while (end < text.length && !',]'.includes(text[end])) end += 1;
      const raw = text.slice(position, end).trim();
      if (raw === '') throw new YamlSubsetError('empty-flow-item', lineNumber);
      if (/[[\]{}#]/.test(raw)) throw new YamlSubsetError('nested-flow-collection', lineNumber);
      const reason = forbiddenStart(raw);
      if (reason) throw new YamlSubsetError(reason, lineNumber);
      if (raw.includes(': ') || raw.endsWith(':')) {
        throw new YamlSubsetError('flow-mapping', lineNumber);
      }
      items.push(raw);
      position = end;
    }
    skipSpaces();
    if (text[position] === ',') {
      position += 1;
      continue;
    }
    if (text[position] === ']') break;
    throw new YamlSubsetError('malformed-flow-sequence', lineNumber);
  }
  assertLineEnd(text.slice(position + 1), lineNumber);
  return items;
}

// The index of the `:` that ends a mapping key at the start of `text`, or -1 when the text is no
// `key: value` line.
function keySeparator(text) {
  if (text.startsWith("'") || text.startsWith('"')) {
    let end;
    try {
      end = readQuoted(text, 0, 0).end;
    } catch {
      return -1;
    }
    let position = end;
    while (text[position] === ' ') position += 1;
    return text[position] === ':' && (position + 1 === text.length || text[position + 1] === ' ')
      ? position
      : -1;
  }
  if ('[{'.includes(text[0])) return -1;
  for (let position = 0; position < text.length; position += 1) {
    if (text[position] === '#' && position > 0 && text[position - 1] === ' ') return -1;
    if (text[position] === ':' && (position + 1 === text.length || text[position + 1] === ' ')) {
      return position;
    }
  }
  return -1;
}

class SubsetParser {
  constructor(lines) {
    this.lines = lines;
    // Lines rewritten in place: the inline content after a sequence dash, at its own column.
    this.virtual = new Map();
  }

  info(index) {
    if (this.virtual.has(index)) return this.virtual.get(index);
    const raw = this.lines[index];
    const indent = /^ */.exec(raw)[0].length;
    return { indent, text: raw.slice(indent).trimEnd() };
  }

  // The next line that carries content, skipping blank and comment-only lines.
  nextContent(index) {
    let position = index;
    while (position < this.lines.length) {
      if (this.virtual.has(position)) return position;
      const raw = this.lines[position];
      const trimmed = raw.trim();
      if (trimmed !== '' && /^ *\t/.test(raw)) {
        throw new YamlSubsetError('tab-indentation', position + 1);
      }
      if (DOCUMENT_MARKER.test(raw)) throw new YamlSubsetError('multiple-documents', position + 1);
      if (raw.startsWith('%')) throw new YamlSubsetError('directive', position + 1);
      if (trimmed !== '' && !trimmed.startsWith('#')) return position;
      position += 1;
    }
    return position;
  }

  parseDocument() {
    let start = 0;
    // One leading document start marker is allowed; any further marker is a second document.
    for (; start < this.lines.length; start += 1) {
      const trimmed = this.lines[start].trim();
      if (trimmed === '' || trimmed.startsWith('#')) continue;
      if (/^---(?:\s+#.*)?\s*$/.test(this.lines[start])) start += 1;
      break;
    }
    const first = this.nextContent(start);
    if (first >= this.lines.length) throw new YamlSubsetError('empty-document', first + 1);
    const { indent, text } = this.info(first);
    if (indent !== 0 || isSequenceItem(text)) {
      throw new YamlSubsetError('top-level-not-a-mapping', first + 1);
    }
    const [value, next] = this.parseMapping(first, 0);
    const rest = this.nextContent(next);
    if (rest < this.lines.length) throw new YamlSubsetError('unexpected-indentation', rest + 1);
    return value;
  }

  parseBlock(index, indent) {
    return isSequenceItem(this.info(index).text)
      ? this.parseSequence(index, indent)
      : this.parseMapping(index, indent);
  }

  parseMapping(index, indent) {
    const map = new Map();
    let position = index;
    for (;;) {
      position = this.nextContent(position);
      if (position >= this.lines.length) break;
      const { indent: lineIndent, text } = this.info(position);
      if (lineIndent < indent) break;
      if (lineIndent > indent) throw new YamlSubsetError('unexpected-indentation', position + 1);
      if (isSequenceItem(text)) break;
      if (/^\?(?: |$)/.test(text)) throw new YamlSubsetError('complex-key', position + 1);
      const separator = keySeparator(text);
      if (separator === -1) throw new YamlSubsetError('expected-mapping-key', position + 1);
      const rawKey = text.slice(0, separator).trim();
      let key = rawKey;
      if (rawKey.startsWith("'") || rawKey.startsWith('"')) {
        key = readQuoted(rawKey, 0, position + 1).value;
      } else {
        const reason = forbiddenStart(rawKey);
        if (reason) throw new YamlSubsetError(reason, position + 1);
        if (rawKey === '' || isSequenceItem(rawKey)) {
          throw new YamlSubsetError('expected-mapping-key', position + 1);
        }
      }
      if (map.has(key)) throw new YamlSubsetError('duplicate-key', position + 1);
      const [value, next] = this.parseValue(text.slice(separator + 1), position, indent, true);
      map.set(key, value);
      position = next;
    }
    return [map, position];
  }

  parseSequence(index, indent) {
    const items = [];
    let position = index;
    for (;;) {
      position = this.nextContent(position);
      if (position >= this.lines.length) break;
      const { indent: lineIndent, text } = this.info(position);
      if (lineIndent < indent) break;
      if (lineIndent > indent) throw new YamlSubsetError('unexpected-indentation', position + 1);
      if (!isSequenceItem(text)) break;
      const after = text.slice(1);
      const spaces = /^ */.exec(after)[0].length;
      const content = after.slice(spaces);
      let value;
      if (content === '' || content.startsWith('#')) {
        const next = this.nextContent(position + 1);
        if (next < this.lines.length && this.info(next).indent > indent) {
          [value, position] = this.parseBlock(next, this.info(next).indent);
        } else {
          value = null;
          position += 1;
        }
      } else if (isSequenceItem(content) || keySeparator(content) !== -1) {
        const childIndent = indent + 1 + spaces;
        this.virtual.set(position, { indent: childIndent, text: content });
        [value, position] = this.parseBlock(position, childIndent);
      } else {
        [value, position] = this.parseValue(content, position, indent, false);
      }
      items.push(value);
    }
    return [items, position];
  }

  // The value after `key:` or a sequence dash on line `index`, whose key or dash sits at `indent`.
  parseValue(rest, index, indent, mappingValue) {
    const lineNumber = index + 1;
    const value = rest.replace(/^ +/, '');
    if (value === '' || value.startsWith('#')) {
      const next = this.nextContent(index + 1);
      if (next < this.lines.length) {
        const child = this.info(next);
        if (child.indent > indent) return this.parseBlock(next, child.indent);
        if (mappingValue && child.indent === indent && isSequenceItem(child.text)) {
          return this.parseSequence(next, indent);
        }
      }
      return [null, index + 1];
    }
    if (value.startsWith('|')) return this.blockScalar(value, index, indent);
    let scalar;
    if (value.startsWith('[')) scalar = flowSequence(value, lineNumber);
    else if (value.startsWith("'") || value.startsWith('"')) {
      const quoted = readQuoted(value, 0, lineNumber);
      assertLineEnd(value.slice(quoted.end), lineNumber);
      scalar = quoted.value;
    } else {
      scalar = plainScalar(value, lineNumber);
    }
    // A more indented line after a one-line value would continue it as a multi-line scalar.
    const next = this.nextContent(index + 1);
    if (next < this.lines.length && this.info(next).indent > indent) {
      throw new YamlSubsetError('multiline-scalar', next + 1);
    }
    return [scalar, index + 1];
  }

  // A literal block scalar (`|`, `|-`, `|+`). Folded scalars and indentation indicators are outside
  // the subset.
  blockScalar(header, index, indent) {
    const lineNumber = index + 1;
    if (/^\|[+-]?[0-9]/.test(header)) {
      throw new YamlSubsetError('block-indentation-indicator', lineNumber);
    }
    const match = /^\|([+-]?)(?:\s+#.*)?$/.exec(header);
    if (!match) throw new YamlSubsetError('malformed-block-scalar', lineNumber);
    const chomping = match[1];
    let position = index + 1;
    let blockIndent = null;
    const body = [];
    while (position < this.lines.length) {
      const raw = this.lines[position];
      if (raw.trim() === '') {
        body.push(blockIndent === null ? '' : raw.slice(blockIndent));
        position += 1;
        continue;
      }
      const lineIndent = /^ */.exec(raw)[0].length;
      if (blockIndent === null) {
        if (lineIndent <= indent) break;
        blockIndent = lineIndent;
      }
      if (lineIndent < blockIndent) break;
      body.push(raw.slice(blockIndent));
      position += 1;
    }
    let trailing = 0;
    while (body.length > 0 && body[body.length - 1].trim() === '') {
      body.pop();
      trailing += 1;
    }
    let text = body.join('\n');
    if (chomping === '+') text += '\n'.repeat(body.length > 0 ? trailing + 1 : trailing);
    else if (chomping === '' && body.length > 0) text += '\n';
    return [text, position];
  }
}

// Parses workflow or action text in the declared subset: block mappings and sequences, plain and
// quoted one-line scalars, one-line flow sequences of scalars, and literal block scalars (`|`,
// `|-`, `|+`). Anchors, aliases, tags, flow mappings, nested or multi-line flow collections,
// folded or indentation-indicator block scalars, multi-line plain or quoted scalars, merge and
// complex keys, duplicate keys, tab indentation and more than one document throw YamlSubsetError.
// Mappings are `Map`s, sequences arrays, scalars strings, and an empty value null.
export function parseWorkflowYaml(text) {
  if (typeof text !== 'string') throw new YamlSubsetError('not-text', 0);
  let source = text.startsWith('﻿') ? text.slice(1) : text;
  source = source.replace(/\r\n/g, '\n');
  if (source.includes('\r')) throw new YamlSubsetError('carriage-return', 0);
  if (source.includes('\u0000')) throw new YamlSubsetError('nul-byte', 0);
  return new SubsetParser(source.split('\n')).parseDocument();
}

// ---------------------------------------------------------------------------------------------
// Manifest test commands

// The bare invocations of a `package.json` `test` script, each with its normalized identity:
// `pnpm test` and `pnpm run test` are one script. `bun test` runs Bun's own runner, not the script.
const PACKAGE_SCRIPT_FORMS = Object.freeze([
  ['npm test', 'npm test'],
  ['npm run test', 'npm test'],
  ['npm run-script test', 'npm test'],
  ['pnpm test', 'pnpm test'],
  ['pnpm run test', 'pnpm test'],
  ['yarn test', 'yarn test'],
  ['yarn run test', 'yarn test'],
  ['bun run test', 'bun run test'],
]);
const PYTEST_MANIFESTS = Object.freeze([
  'pyproject.toml',
  'pytest.ini',
  'setup.cfg',
  'setup.py',
  'tox.ini',
]);
const MAKEFILES = Object.freeze(['GNUmakefile', 'makefile', 'Makefile']);

// The test commands the repository root's manifests declare, from `{ name: text | null }` of the
// regular root files. Each entry is `{ normalized, forms, source }`, `forms` being the exact bare
// invocations that run it.
export function manifestTestCommands(files) {
  const commands = [];
  const text = (name) => (typeof files?.[name] === 'string' ? files[name] : null);
  const packageJson = text('package.json');
  if (packageJson !== null) {
    let parsed = null;
    try {
      parsed = JSON.parse(packageJson);
    } catch {
      parsed = null;
    }
    const script = parsed && typeof parsed === 'object' ? parsed.scripts?.test : undefined;
    if (typeof script === 'string' && script.trim() !== '') {
      const grouped = new Map();
      for (const [form, normalized] of PACKAGE_SCRIPT_FORMS) {
        if (!grouped.has(normalized)) grouped.set(normalized, []);
        grouped.get(normalized).push(form);
      }
      for (const [normalized, forms] of grouped) {
        commands.push({ normalized, forms, source: 'package.json' });
      }
    }
  }
  if (text('Cargo.toml') !== null) {
    commands.push({ normalized: 'cargo test', forms: ['cargo test'], source: 'Cargo.toml' });
  }
  if (text('go.mod') !== null) {
    commands.push({ normalized: 'go test', forms: ['go test'], source: 'go.mod' });
  }
  const pytest = PYTEST_MANIFESTS.find((name) => text(name) !== null);
  if (pytest) commands.push({ normalized: 'pytest', forms: ['pytest'], source: pytest });
  const makefile = MAKEFILES.find((name) => text(name) !== null);
  if (makefile && /^test[ \t]*::?(?!=)/m.test(text(makefile))) {
    commands.push({ normalized: 'make test', forms: ['make test'], source: makefile });
  }
  return commands;
}

export const MANIFEST_FILES = Object.freeze([
  'package.json',
  'Cargo.toml',
  'go.mod',
  ...PYTEST_MANIFESTS,
  ...MAKEFILES,
]);

// ---------------------------------------------------------------------------------------------
// Workflow evaluation

// `ci-detect` reason codes. Workflow level: trigger, filters and defaults. Job level: everything that
// makes the job's test result conditional, indirect or not statically enumerable.
export const DETECTION_REASONS = Object.freeze([
  'base-ref-missing',
  'no-manifest-test-command',
  'not-a-directory',
  'not-a-regular-file',
  'too-large',
  'too-many-workflows',
  'unparsable',
  'no-pull-request-trigger',
  'invalid-trigger',
  'paths-filter',
  'branches-filter',
  'base-not-in-branches',
  'base-in-branches-ignore',
  'types-without-synchronize',
  'unknown-trigger-filter',
  'no-jobs',
  'invalid-defaults',
  'shell-override',
  'working-directory-mismatch',
  'invalid-job',
  'reusable-workflow',
  'job-condition',
  'step-condition',
  'continue-on-error',
  'templated-name',
  'invalid-name',
  'dynamic-matrix',
  'matrix-include-exclude',
  'empty-matrix',
  'matrix-too-large',
  'no-steps',
  'no-test-step',
  'test-command-not-bare',
  'test-in-local-action',
]);

const EXPRESSION = /\$\{\{/;
// A branch filter entry without any character GitHub's filter patterns give a meaning.
const LITERAL_BRANCH = /^[^*?+![\]\\]+$/;

function mapGet(value, key) {
  return value instanceof Map && value.has(key) ? value.get(key) : undefined;
}

function listOfStrings(value) {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
  return null;
}

// Whether the workflow runs on every `pull_request` push to `base`.
export function evaluateTrigger(on, base) {
  const reasons = [];
  let filters;
  if (typeof on === 'string') {
    if (on !== 'pull_request') reasons.push('no-pull-request-trigger');
  } else if (Array.isArray(on)) {
    if (!on.every((item) => typeof item === 'string')) reasons.push('invalid-trigger');
    else if (!on.includes('pull_request')) reasons.push('no-pull-request-trigger');
  } else if (on instanceof Map) {
    if (!on.has('pull_request')) reasons.push('no-pull-request-trigger');
    else {
      filters = on.get('pull_request');
      if (filters !== null && !(filters instanceof Map)) reasons.push('invalid-trigger');
    }
  } else {
    reasons.push(on === undefined ? 'no-pull-request-trigger' : 'invalid-trigger');
  }
  if (filters instanceof Map) {
    for (const key of filters.keys()) {
      if (key === 'paths' || key === 'paths-ignore') reasons.push('paths-filter');
      else if (!['branches', 'branches-ignore', 'types'].includes(key)) {
        reasons.push('unknown-trigger-filter');
      }
    }
    const branches = filters.get('branches');
    const ignored = filters.get('branches-ignore');
    if (filters.has('branches') && filters.has('branches-ignore')) reasons.push('branches-filter');
    if (filters.has('branches')) {
      const list = listOfStrings(branches);
      if (!list || !list.every((entry) => LITERAL_BRANCH.test(entry))) {
        reasons.push('branches-filter');
      } else if (!list.includes(base)) reasons.push('base-not-in-branches');
    }
    if (filters.has('branches-ignore')) {
      const list = listOfStrings(ignored);
      if (!list || !list.every((entry) => LITERAL_BRANCH.test(entry))) {
        reasons.push('branches-filter');
      } else if (list.includes(base)) reasons.push('base-in-branches-ignore');
    }
    if (filters.has('types')) {
      const list = listOfStrings(filters.get('types'));
      if (!list || !list.includes('synchronize')) reasons.push('types-without-synchronize');
    }
  }
  return { event: 'pull_request', base, triggers: reasons.length === 0, reasons: unique(reasons) };
}

function unique(values) {
  return [...new Set(values)];
}

// `defaults.run.<field>` of a workflow or job: `{ value, invalid }`.
function runDefault(owner, field) {
  if (!(owner instanceof Map) || !owner.has('defaults')) return { value: undefined };
  const defaults = owner.get('defaults');
  if (!(defaults instanceof Map)) return { invalid: true };
  if (!defaults.has('run')) return { value: undefined };
  const run = defaults.get('run');
  if (!(run instanceof Map)) return { invalid: true };
  return { value: run.get(field) };
}

function normalizeDirectory(value) {
  if (typeof value !== 'string' || EXPRESSION.test(value)) return null;
  let normalized = value.trim();
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  normalized = normalized.replace(/\/+$/, '');
  return normalized === '.' ? '' : normalized;
}

function tokens(line) {
  return line
    .trim()
    .split(/[\s|&;()<>]+/)
    .filter((token) => token !== '');
}

// Whether `run` is exactly one bare form: one line, single spaces, nothing else.
function bareCommand(run, commands) {
  if (typeof run !== 'string') return null;
  const trimmed = run.trim();
  if (trimmed.includes('\n') || /[^\S ]/.test(trimmed)) return null;
  const words = trimmed.split(/ +/).join(' ');
  for (const command of commands) {
    if (command.forms.includes(words)) return command;
  }
  return null;
}

// Whether `run` mentions a test form anywhere, with arguments, pipes, chains or other commands.
function mentionsCommand(run, commands) {
  if (typeof run !== 'string') return false;
  return run.split('\n').some((line) => {
    const words = tokens(line);
    return commands.some((command) =>
      command.forms.some((form) => {
        const formWords = form.split(' ');
        for (let start = 0; start + formWords.length <= words.length; start += 1) {
          if (formWords.every((word, offset) => words[start + offset] === word)) return true;
        }
        return false;
      }),
    );
  });
}

function shellReason(value) {
  return value === undefined || value === 'bash' ? null : 'shell-override';
}

// The statically derivable job instances: one name without a matrix, else the cartesian product of a
// literal matrix in key order, named `<name> (<v1>, <v2>)` as GitHub names matrix jobs.
function expectedInstances(job, displayName, reasons) {
  if (!job.has('strategy')) return [displayName];
  const strategy = job.get('strategy');
  if (!(strategy instanceof Map)) {
    reasons.push('dynamic-matrix');
    return [];
  }
  if (!strategy.has('matrix')) return [displayName];
  const matrix = strategy.get('matrix');
  if (!(matrix instanceof Map)) {
    reasons.push('dynamic-matrix');
    return [];
  }
  if (matrix.has('include') || matrix.has('exclude')) {
    reasons.push('matrix-include-exclude');
    return [];
  }
  let combinations = [[]];
  for (const values of matrix.values()) {
    if (
      !Array.isArray(values) ||
      !values.every((value) => typeof value === 'string' && !EXPRESSION.test(value))
    ) {
      reasons.push('dynamic-matrix');
      return [];
    }
    combinations = combinations.flatMap((combination) =>
      values.map((value) => [...combination, value]),
    );
    if (combinations.length > MAX_MATRIX_INSTANCES) {
      reasons.push('matrix-too-large');
      return [];
    }
  }
  if (matrix.size === 0 || combinations.length === 0) {
    reasons.push('empty-matrix');
    return [];
  }
  return combinations.map((combination) => `${displayName} (${combination.join(', ')})`);
}

function evaluateStep(step, index, command, context) {
  const reasons = [];
  if (step.has('if')) reasons.push('step-condition');
  if (step.has('continue-on-error')) reasons.push('continue-on-error');
  const stepShell = shellReason(step.get('shell'));
  if (stepShell) reasons.push(stepShell);
  const directory = step.has('working-directory')
    ? step.get('working-directory')
    : context.workingDirectory;
  if (directory !== undefined && normalizeDirectory(directory) !== '') {
    reasons.push('working-directory-mismatch');
  }
  const name = step.get('name');
  return {
    reasons,
    step: {
      index,
      name: typeof name === 'string' ? name : null,
      run: step.get('run'),
      normalizedCommand: command.normalized,
    },
  };
}

function evaluateJob(jobId, job, commands, workflowDefaults) {
  const result = {
    jobId,
    jobName: null,
    status: 'undetected',
    reasons: [],
    step: null,
    expectedInstances: [],
  };
  const { reasons } = result;
  if (!(job instanceof Map)) {
    reasons.push('invalid-job');
    return result;
  }
  const name = job.has('name') ? job.get('name') : undefined;
  let displayName = jobId;
  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim() === '') reasons.push('invalid-name');
    else if (EXPRESSION.test(name)) reasons.push('templated-name');
    else displayName = name;
  }
  result.jobName = displayName;
  if (job.has('uses')) reasons.push('reusable-workflow');
  if (job.has('if')) reasons.push('job-condition');
  if (job.has('continue-on-error')) reasons.push('continue-on-error');
  const jobShell = runDefault(job, 'shell');
  const jobDirectory = runDefault(job, 'working-directory');
  if (jobShell.invalid || jobDirectory.invalid) reasons.push('invalid-defaults');
  const jobShellReason = shellReason(jobShell.value);
  if (jobShellReason) reasons.push(jobShellReason);
  const instances = expectedInstances(job, displayName, reasons);

  const steps = job.get('steps');
  if (!job.has('uses')) {
    if (!Array.isArray(steps) || steps.length === 0) reasons.push('no-steps');
    else {
      const context = {
        workingDirectory:
          jobDirectory.value !== undefined ? jobDirectory.value : workflowDefaults.workingDirectory,
      };
      let chosen = null;
      steps.forEach((step, index) => {
        if (!(step instanceof Map)) return;
        const command = bareCommand(step.get('run'), commands);
        if (!command) return;
        const evaluated = evaluateStep(step, index, command, context);
        if (!chosen || (chosen.reasons.length > 0 && evaluated.reasons.length === 0)) {
          chosen = evaluated;
        }
      });
      if (chosen) {
        reasons.push(...chosen.reasons);
        result.step = chosen.step;
      } else if (steps.some((step) => mentionsCommand(mapGet(step, 'run'), commands))) {
        reasons.push('test-command-not-bare');
      } else if (
        steps.some((step) => {
          const uses = mapGet(step, 'uses');
          return typeof uses === 'string' && uses.startsWith('./');
        })
      ) {
        reasons.push('test-in-local-action');
      } else reasons.push('no-test-step');
    }
  }
  result.reasons = unique(reasons);
  if (result.reasons.length === 0) {
    result.status = 'detected';
    result.expectedInstances = instances;
  }
  return result;
}

// Evaluates one parsed or unparsable workflow file. `text` is the blob text of `workflowPath`;
// `commands` comes from `manifestTestCommands`; `base` is the pull request's base branch.
export function evaluateWorkflow(workflowPath, text, { commands, base }) {
  const workflow = {
    path: workflowPath,
    status: 'undetected',
    reasons: [],
    trigger: null,
    jobs: [],
  };
  let document;
  try {
    document = parseWorkflowYaml(text);
  } catch (error) {
    if (!(error instanceof YamlSubsetError)) throw error;
    workflow.status = 'unparsable';
    workflow.reasons.push('unparsable');
    workflow.unparsable = { reason: error.reason, line: error.line };
    return workflow;
  }
  workflow.trigger = evaluateTrigger(document.get('on'), base);
  workflow.reasons.push(...workflow.trigger.reasons);
  const shell = runDefault(document, 'shell');
  const directory = runDefault(document, 'working-directory');
  if (shell.invalid || directory.invalid) workflow.reasons.push('invalid-defaults');
  const shellProblem = shellReason(shell.value);
  if (shellProblem) workflow.reasons.push(shellProblem);
  const jobs = document.get('jobs');
  if (!(jobs instanceof Map) || jobs.size === 0) workflow.reasons.push('no-jobs');
  else {
    for (const [jobId, job] of jobs) {
      workflow.jobs.push(evaluateJob(jobId, job, commands, { workingDirectory: directory.value }));
    }
  }
  workflow.reasons = unique(workflow.reasons);
  if (workflow.reasons.length > 0) {
    for (const job of workflow.jobs) {
      if (job.status === 'detected') {
        job.status = 'undetected';
        job.expectedInstances = [];
      }
    }
  } else if (workflow.jobs.some((job) => job.status === 'detected')) {
    workflow.status = 'detected';
  }
  return workflow;
}

// ---------------------------------------------------------------------------------------------
// Git access

function asText(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return Buffer.from(value).toString('utf8');
  }
  return String(value ?? '');
}

function errorDetail(stderr) {
  const lines = asText(stderr)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return lines.find((line) => /^(?:fatal|error):/.test(line)) ?? lines[0] ?? '';
}

function makeContext(deps) {
  if (typeof deps.runner !== 'function') {
    fail('INTERNAL_ERROR', 'conflict-validation needs an injected process runner');
  }
  const env = gitBaseEnv(deps.env ?? process.env);
  env.GIT_NO_REPLACE_OBJECTS = '1';
  return { runner: deps.runner, env };
}

async function runGit(context, cwd, args) {
  const result = await context.runner({
    executable: 'git',
    args: ['-C', cwd, '--no-replace-objects', ...args],
    cwd,
    env: context.env,
  });
  return {
    status: result?.status ?? null,
    stdout: asText(result?.stdout),
    stderr: asText(result?.stderr),
    error: result?.error,
  };
}

// Exit 0 returns stdout, `absentStatus` returns null ("does not exist"), anything else fails.
async function gitOutput(context, cwd, args, absentStatus = null) {
  const result = await runGit(context, cwd, args);
  if (!result.error && result.status === 0) return result.stdout;
  if (!result.error && absentStatus !== null && result.status === absentStatus) return null;
  const detail = result.error?.message ?? result.error?.code ?? errorDetail(result.stderr);
  fail('GIT_FAILED', `git ${args[0]} failed${detail ? `: ${detail}` : ''}`, {
    command: `git ${args.join(' ')}`,
  });
}

function gitFailed(message) {
  fail('GIT_FAILED', message);
}

// The commit of `refs/remotes/origin/<baseRef>`, or null when that exact ref does not exist;
// config-resolve's lookup, run through this helper's own Git environment.
async function baseCommit(context, cwd, baseRef) {
  const read = (args, absentStatus) => gitOutput(context, cwd, args, absentStatus);
  return originBaseCommit(baseRef, read, gitFailed);
}

function describeEntry(entry) {
  return `${entry.mode} ${entry.type} ${entry.oid}`;
}

// Reads one tree object by path, component by component through non-recursive `ls-tree`
// listings, so no pathspec is ever matched.
function treeReader(context, cwd, rootOid) {
  const listings = new Map();
  let collected = 0;
  const listing = async (oid) => {
    if (listings.has(oid)) return listings.get(oid);
    const output = await gitOutput(context, cwd, ['ls-tree', '-z', '--full-tree', oid]);
    const entries = parseTreeListing(output, oid, gitFailed);
    listings.set(oid, entries);
    return entries;
  };
  const root = { mode: TREE_MODE, type: 'tree', oid: rootOid };
  // The entry at `relative`: `{ entry, path }`, or `{ blocker, path }` when a non-tree entry sits
  // on the way, or null when it is absent.
  const locate = async (relative) => {
    let current = root;
    let walked = '';
    for (const name of relative === '' ? [] : relative.split('/')) {
      if (current.type !== 'tree') return { blocker: current, path: walked };
      const found = (await listing(current.oid)).get(name);
      if (!found) return null;
      walked = walked === '' ? name : `${walked}/${name}`;
      current = found;
    }
    return { entry: current, path: walked };
  };
  const walk = async (oid, prefix, out) => {
    for (const [name, entry] of await listing(oid)) {
      const child = prefix === '' ? name : `${prefix}/${name}`;
      if (entry.type === 'tree') await walk(entry.oid, child, out);
      else {
        collected += 1;
        if (collected > MAX_COLLECTED_ENTRIES) {
          fail('GIT_FAILED', 'the compared tree holds too many entries');
        }
        out.set(child, describeEntry(entry));
      }
    }
  };
  return {
    locate,
    listing,
    async entry(relative) {
      const found = await locate(relative);
      return found?.entry ?? null;
    },
    // The blob's text, or null when it exceeds MAX_SOURCE_BYTES: its size is read first, so an
    // oversized blob is never loaded.
    async blobText(oid) {
      const size = (await gitOutput(context, cwd, ['cat-file', '-s', oid])).trim();
      if (!/^\d+$/.test(size)) fail('GIT_FAILED', `git cat-file printed no size for ${oid}`);
      if (Number(size) > MAX_SOURCE_BYTES) return null;
      return gitOutput(context, cwd, ['cat-file', 'blob', oid]);
    },
    // Every leaf at or below `relative`, or the non-tree entry that blocks the way to it.
    async collect(relative) {
      const out = new Map();
      const found = await locate(relative);
      if (!found) return out;
      if (found.blocker) out.set(found.path, describeEntry(found.blocker));
      else if (found.entry.type !== 'tree') out.set(found.path, describeEntry(found.entry));
      else await walk(found.entry.oid, found.path, out);
      return out;
    },
  };
}

// The staged index as `git ls-files -s` prints it, read once. Collecting a path gives the same
// shape as `treeReader.collect`, so a staged merge tree is compared without `git write-tree`.
function indexReader(context, cwd) {
  let entries = null;
  const load = async () => {
    if (entries) return entries;
    const prefix = await gitOutput(context, cwd, ['rev-parse', '--show-prefix']);
    if (prefix.trim() !== '') {
      fail('INVALID_INPUT', 'cwd must be the checkout root to read its index', { field: 'cwd' });
    }
    const output = await gitOutput(context, cwd, ['ls-files', '-s', '-z', '--full-name']);
    entries = [];
    for (const record of output.split('\0')) {
      if (record === '') continue;
      const tab = record.indexOf('\t');
      const [mode, oid, stage] = tab === -1 ? [] : record.slice(0, tab).split(' ');
      if (!mode || !OBJECT_ID.test(oid ?? '') || !/^[0-3]$/.test(stage ?? '')) {
        fail('GIT_FAILED', 'git ls-files printed an unparseable index entry');
      }
      if (entries.length >= MAX_COLLECTED_ENTRIES * 10) {
        fail('GIT_FAILED', 'the index holds too many entries');
      }
      const type = mode === '160000' ? 'commit' : 'blob';
      entries.push({ path: record.slice(tab + 1), mode, type, oid, stage });
    }
    return entries;
  };
  return {
    async collect(relative) {
      const out = new Map();
      let unmerged = false;
      for (const entry of await load()) {
        const related =
          relative === '' ||
          entry.path === relative ||
          entry.path.startsWith(`${relative}/`) ||
          relative.startsWith(`${entry.path}/`);
        if (!related) continue;
        if (entry.stage !== '0') {
          unmerged = true;
          continue;
        }
        out.set(entry.path, describeEntry(entry));
      }
      if (unmerged) out.unmerged = true;
      return out;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Input validation

const INPUT_KEYS = Object.freeze({
  'ci-detect': Object.freeze(['cwd', 'baseRef', 'base']),
  'ci-integrity': Object.freeze(['cwd', 'baseRef', 'tree']),
  'ci-evidence-match': Object.freeze(['detection', 'checks', 'headSha']),
  'quick-marker-scan': Object.freeze(['cwd', 'baseRef', 'headSha']),
});

function validateKeys(operation, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('INVALID_INPUT', 'input must be a JSON object');
  }
  for (const key of Object.keys(input)) {
    if (!INPUT_KEYS[operation].includes(key)) {
      fail('INVALID_INPUT', `unknown input field: ${key}`, { key });
    }
  }
}

function validateCwd(cwd) {
  if (typeof cwd !== 'string' || cwd === '' || !path.isAbsolute(cwd) || cwd.includes('\0')) {
    fail('INVALID_INPUT', 'cwd must be an absolute path', { field: 'cwd' });
  }
}

function validateBranch(value, field) {
  if (!isSafeBaseRef(value)) {
    fail('INVALID_INPUT', `${field} must be a safe branch name without a remote prefix`, {
      field,
    });
  }
}

// ---------------------------------------------------------------------------------------------
// ci-detect

async function readRootManifests(reader) {
  const files = {};
  for (const name of MANIFEST_FILES) {
    const entry = await reader.entry(name);
    if (!entry || treeEntryKind(entry) !== 'file') continue;
    const text = await reader.blobText(entry.oid);
    if (text !== null) files[name] = text;
  }
  return files;
}

export async function detectCi(input, deps = {}) {
  validateKeys('ci-detect', input);
  validateCwd(input.cwd);
  validateBranch(input.baseRef, 'baseRef');
  if (input.base !== undefined) validateBranch(input.base, 'base');
  const base = input.base ?? input.baseRef;
  const context = makeContext(deps);
  const result = {
    status: 'undetected',
    reasons: [],
    baseRef: input.baseRef,
    base,
    baseCommit: null,
    directory: DETECTION_DIRECTORY,
    manifest: { directory: '.', commands: [] },
    testCommands: [],
    detectedJobs: [],
    workflows: [],
  };
  const commit = await baseCommit(context, input.cwd, input.baseRef);
  if (commit === null) {
    result.reasons.push('base-ref-missing');
    return result;
  }
  result.baseCommit = commit;
  const reader = treeReader(context, input.cwd, commit);
  const commands = manifestTestCommands(await readRootManifests(reader));
  result.manifest.commands = commands.map(({ normalized, forms, source }) => ({
    normalized,
    forms,
    source,
  }));
  if (commands.length === 0) result.reasons.push('no-manifest-test-command');

  const located = await reader.locate(DETECTION_DIRECTORY);
  if (located?.blocker || (located?.entry && treeEntryKind(located.entry) !== 'tree')) {
    result.workflows.push({
      path: DETECTION_DIRECTORY,
      status: 'unparsable',
      reasons: ['not-a-directory'],
      trigger: null,
      jobs: [],
    });
  } else if (located?.entry) {
    const names = [...(await reader.listing(located.entry.oid)).entries()]
      .filter(([name]) => /\.ya?ml$/.test(name))
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    if (names.length > MAX_WORKFLOW_FILES) {
      result.reasons.push('too-many-workflows');
      names.length = 0;
    }
    for (const [name, entry] of names) {
      const workflowPath = `${DETECTION_DIRECTORY}/${name}`;
      const kind = treeEntryKind(entry);
      if (kind === 'tree') continue;
      if (kind !== 'file') {
        result.workflows.push({
          path: workflowPath,
          status: 'unparsable',
          reasons: ['not-a-regular-file'],
          trigger: null,
          jobs: [],
        });
        continue;
      }
      const text = await reader.blobText(entry.oid);
      if (text === null) {
        result.workflows.push({
          path: workflowPath,
          status: 'unparsable',
          reasons: ['too-large'],
          trigger: null,
          jobs: [],
        });
        continue;
      }
      result.workflows.push(evaluateWorkflow(workflowPath, text, { commands, base }));
    }
  }

  for (const workflow of result.workflows) {
    for (const job of workflow.jobs) {
      if (job.status !== 'detected') continue;
      result.detectedJobs.push({
        workflowPath: workflow.path,
        jobId: job.jobId,
        jobName: job.jobName,
        normalizedCommand: job.step.normalizedCommand,
        expectedInstances: [...job.expectedInstances],
      });
    }
  }
  result.testCommands = unique(result.detectedJobs.map((job) => job.normalizedCommand));
  if (result.detectedJobs.length > 0) result.status = 'detected';
  else if (result.workflows.some((workflow) => workflow.status === 'unparsable')) {
    result.status = 'unparsable';
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// ci-integrity

export const INTEGRITY_REASONS = Object.freeze([
  'identical',
  'base-ref-missing',
  'tree-missing',
  'changed',
  'unmerged-index-entry',
  'unparsable-source',
  'unsafe-reference',
  'too-many-references',
]);

// A local `uses: ./…` reference as a repository path without the `./`, or null when it is no local
// reference. `{ unsafe: true }` for a path that leaves the repository or carries a ref.
function localReference(uses) {
  if (typeof uses !== 'string' || !uses.startsWith('./')) return null;
  let relative = uses.slice(2).replace(/\/+$/, '');
  while (relative.startsWith('./')) relative = relative.slice(2);
  if (relative === '') return { path: relative };
  const unsafe =
    relative.includes('@') ||
    relative.includes('\\') ||
    relative.startsWith('/') ||
    relative.split('/').some((part) => part === '..' || part === '.' || part === '');
  return unsafe ? { unsafe: true } : { path: relative };
}

// The local references of a parsed workflow (job-level reusable workflows, step-level actions) or
// of a composite action (`runs.steps`).
function referencesOf(document) {
  const references = [];
  const steps = (list) => {
    if (!Array.isArray(list)) return;
    for (const step of list) {
      const reference = localReference(mapGet(step, 'uses'));
      if (reference) references.push({ ...reference, kind: 'action' });
    }
  };
  const jobs = mapGet(document, 'jobs');
  if (jobs instanceof Map) {
    for (const job of jobs.values()) {
      const reference = localReference(mapGet(job, 'uses'));
      if (reference) references.push({ ...reference, kind: 'workflow' });
      steps(mapGet(job, 'steps'));
    }
  }
  steps(mapGet(mapGet(document, 'runs'), 'steps'));
  return references;
}

function sameEntries(left, right) {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) if (right.get(key) !== value) return false;
  return true;
}

function differencesOf(left, right) {
  const differences = [];
  for (const key of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    const base = left.get(key) ?? null;
    const tree = right.get(key) ?? null;
    if (base !== tree) differences.push({ path: key, base, tree });
  }
  return differences;
}

// The collected path that makes `compared` unsafe to read, or null. Both readers report a non-tree
// entry that blocks the way at its own path above `compared`, and a workflow directory or a
// referenced file that is no directory or regular file at `compared` itself. A referenced file
// (an action's `action.yml`, a reusable workflow) must be exactly one regular file; anything below
// it means it is a directory.
function unsafeEntry(kind, compared, entries) {
  for (const [entryPath, description] of entries) {
    if (compared.startsWith(`${entryPath}/`)) return entryPath;
    if (kind === 'directory') {
      if (entryPath === compared) return entryPath;
      continue;
    }
    const [mode, type] = description.split(' ');
    if (entryPath !== compared || treeEntryKind({ mode, type }) !== 'file') return entryPath;
  }
  return null;
}

export async function checkIntegrity(input, deps = {}) {
  validateKeys('ci-integrity', input);
  validateCwd(input.cwd);
  validateBranch(input.baseRef, 'baseRef');
  const { tree } = input;
  if (tree !== INDEX_TREE && !(typeof tree === 'string' && OBJECT_ID.test(tree))) {
    fail('INVALID_INPUT', `tree must be a full object id or ${INDEX_TREE}`, { field: 'tree' });
  }
  const context = makeContext(deps);
  const result = {
    status: 'missing',
    reason: null,
    baseRef: input.baseRef,
    baseCommit: null,
    tree,
    treeOid: null,
    compared: [],
    differences: [],
    problems: [],
  };
  const commit = await baseCommit(context, input.cwd, input.baseRef);
  if (commit === null) {
    result.reason = 'base-ref-missing';
    return result;
  }
  result.baseCommit = commit;
  const baseReader = treeReader(context, input.cwd, commit);
  let target;
  if (tree === INDEX_TREE) target = indexReader(context, input.cwd);
  else {
    const peeled = await gitOutput(
      context,
      input.cwd,
      ['rev-parse', '--verify', '--quiet', `${tree}^{tree}`],
      1,
    );
    if (peeled === null || !OBJECT_ID.test(peeled.trim())) {
      result.reason = 'tree-missing';
      return result;
    }
    result.treeOid = peeled.trim();
    target = treeReader(context, input.cwd, result.treeOid);
  }

  const queue = INTEGRITY_DIRECTORIES.map((directory) => ({ path: directory, kind: 'directory' }));
  const seen = new Set();
  while (queue.length > 0) {
    const item = queue.shift();
    const key = `${item.kind}:${item.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size > MAX_REFERENCED_SOURCES) {
      result.problems.push({ path: item.path, reason: 'too-many-references' });
      break;
    }
    // A composite action is its `action.yml` or `action.yaml`; both names are compared, absence
    // included, because the runner picks whichever exists.
    const paths =
      item.kind === 'action'
        ? ['action.yml', 'action.yaml'].map((name) =>
            item.path === '' ? name : `${item.path}/${name}`,
          )
        : [item.path];
    for (const compared of paths) {
      result.compared.push(compared);
      const baseEntries = await baseReader.collect(compared);
      const targetEntries = await target.collect(compared);
      if (targetEntries.unmerged) {
        result.problems.push({ path: compared, reason: 'unmerged-index-entry' });
      }
      if (!sameEntries(baseEntries, targetEntries)) {
        result.differences.push(...differencesOf(baseEntries, targetEntries));
        continue;
      }
      // Identical on both sides, but a symlink, submodule or file on the way, or a referenced source
      // that is no regular file, leaves unprovable what the runner reads there.
      const unsafe = unsafeEntry(item.kind, compared, baseEntries);
      if (unsafe !== null) {
        result.problems.push({ path: unsafe, reason: 'unsafe-reference' });
        continue;
      }
      // Its references are read from the base copy.
      const sources =
        item.kind === 'directory'
          ? [...baseEntries.keys()].filter(
              (entryPath) =>
                path.posix.dirname(entryPath) === item.path && /\.ya?ml$/.test(entryPath),
            )
          : [...baseEntries.keys()].filter((entryPath) => entryPath === compared);
      for (const source of sources) {
        const description = baseEntries.get(source);
        const [mode, type, oid] = description.split(' ');
        if (treeEntryKind({ mode, type }) !== 'file') {
          result.problems.push({ path: source, reason: 'unparsable-source' });
          continue;
        }
        const text = await baseReader.blobText(oid);
        let document;
        try {
          if (text === null) throw new YamlSubsetError('too-large', 0);
          document = parseWorkflowYaml(text);
        } catch (error) {
          if (!(error instanceof YamlSubsetError)) throw error;
          result.problems.push({ path: source, reason: 'unparsable-source', detail: error.reason });
          continue;
        }
        for (const reference of referencesOf(document)) {
          if (reference.unsafe) {
            result.problems.push({ path: source, reason: 'unsafe-reference' });
            continue;
          }
          queue.push({
            path: reference.path,
            kind: reference.kind === 'workflow' ? 'file' : 'action',
          });
        }
      }
    }
  }
  result.compared = unique(result.compared);
  if (result.differences.length > 0) {
    result.status = 'changed';
    result.reason = 'changed';
  } else if (result.problems.length > 0) {
    result.status = 'unprovable';
    result.reason = result.problems[0].reason;
  } else {
    result.status = 'ok';
    result.reason = 'identical';
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// ci-evidence-match

export const EVIDENCE_APP_SLUG = 'github-actions';
export const EVIDENCE_EVENT = 'pull_request';
export const EVIDENCE_TYPENAME = 'CheckRun';

// Per-instance outcomes, in the order they are checked, then the job-level `no-instances`.
// `missing` and `pending` are the only outcomes that are not yet final: no entry with the job's full
// identity has reported for the verified head, or its run is still in progress. Every other outcome
// but `complete` is final.
export const EVIDENCE_REASONS = Object.freeze([
  'not-detected',
  'no-instances',
  'missing',
  'ambiguous',
  'pending',
  'not-success',
  'complete',
]);

// `data.reason` values that mean "not yet": a later read of the same head may still be evidence.
export const EVIDENCE_NOT_YET_REASONS = Object.freeze(['missing', 'pending']);

// The identity an entry must carry to be this job's check run, each with the outcome a mismatch
// explains, in the order they are checked.
const EVIDENCE_IDENTITY = Object.freeze([
  ['not-check-run', (entry) => entry.typename === EVIDENCE_TYPENAME],
  ['wrong-app', (entry) => entry.appSlug === EVIDENCE_APP_SLUG],
  ['wrong-event', (entry) => entry.event === EVIDENCE_EVENT],
  ['wrong-workflow', (entry, job) => entry.workflowPath === job.workflowPath],
  ['wrong-head', (entry, job, headSha) => entry.headSha === headSha],
]);

// The values of a `missing` instance's `closestMismatch`: the first identity field the closest
// same-named entry fails. It is detail only and never a reason: a same-named push run, status
// context or other app's check is another check, and the job's own run may still appear.
export const EVIDENCE_MISMATCHES = Object.freeze(EVIDENCE_IDENTITY.map(([mismatch]) => mismatch));

// The index of the first identity field `entry` fails, or -1 when it is this job's check run.
function identityMismatch(entry, job, headSha) {
  return EVIDENCE_IDENTITY.findIndex(([, matches]) => !matches(entry, job, headSha));
}

function validateDetection(detection) {
  if (!detection || typeof detection !== 'object' || Array.isArray(detection)) {
    fail('INVALID_INPUT', 'detection must be a ci-detect result object', { field: 'detection' });
  }
  if (!DETECTION_STATUSES.includes(detection.status)) {
    fail('INVALID_INPUT', 'detection.status is not a ci-detect status', { field: 'detection' });
  }
  if (!Array.isArray(detection.detectedJobs)) {
    fail('INVALID_INPUT', 'detection.detectedJobs must be an array', { field: 'detection' });
  }
  for (const job of detection.detectedJobs) {
    const valid =
      job &&
      typeof job === 'object' &&
      typeof job.workflowPath === 'string' &&
      typeof job.jobId === 'string' &&
      Array.isArray(job.expectedInstances) &&
      job.expectedInstances.every((name) => typeof name === 'string' && name !== '');
    if (!valid) {
      fail('INVALID_INPUT', 'detection.detectedJobs holds a malformed job', { field: 'detection' });
    }
  }
}

// `group` holds every entry named like the instance. Only entries carrying the job's full identity
// can be its check run; a same-named push run, status context or other app's check is another check
// and only explains a miss. Without such an entry the instance is `missing`, a not-yet outcome: the
// job's own `pull_request` run may still appear. `closestMismatch` names the first identity field
// the closest same-named entry fails, or is null when no entry carries the name.
function instanceOutcome(group, job, headSha) {
  const matching = group.filter((entry) => identityMismatch(entry, job, headSha) === -1);
  // pr-status-read already collapsed superseded re-runs; two entries left with the job's full
  // identity are two distinct checks, and neither says which one this job is.
  if (matching.length > 1) return { outcome: 'ambiguous' };
  if (matching.length === 0) {
    if (group.length === 0) return { outcome: 'missing', closestMismatch: null };
    const closest = Math.max(...group.map((entry) => identityMismatch(entry, job, headSha)));
    return { outcome: 'missing', closestMismatch: EVIDENCE_IDENTITY[closest][0] };
  }
  const [entry] = matching;
  if (entry.status !== 'COMPLETED') return { outcome: 'pending' };
  if (entry.conclusion !== 'SUCCESS') {
    return {
      outcome: 'not-success',
      conclusion: typeof entry.conclusion === 'string' ? entry.conclusion : null,
    };
  }
  return { outcome: 'complete' };
}

// Evidence holds only when every detected job has its complete, non-empty expected instance set
// among the entries, each one a completed `CheckRun` of the `github-actions` app for a
// `pull_request` run of the detected workflow file on `headSha`, concluded exactly
// `SUCCESS`. `SKIPPED`, `NEUTRAL`, a missing instance and an ambiguous name are no evidence.
// `data.reason` is `missing` or `pending` (EVIDENCE_NOT_YET_REASONS) only while nothing failed
// finally, so a caller may read the same head again; any other non-`complete` reason is final. A
// final failure needs an entry with the job's full identity that is not `SUCCESS`, or an ambiguous
// name; same-named entries without that identity only fill a `missing` instance's
// `closestMismatch`, and `data.closestMismatch` repeats the first one while `data.reason` is
// `missing` (null otherwise).
export function matchEvidence(input) {
  validateKeys('ci-evidence-match', input);
  const { detection, checks, headSha } = input;
  validateDetection(detection);
  if (typeof headSha !== 'string' || !OBJECT_ID.test(headSha)) {
    fail('INVALID_INPUT', 'headSha must be a full lowercase object id', {
      field: 'headSha',
    });
  }
  if (!Array.isArray(checks) || checks.length > MAX_CHECK_ENTRIES) {
    fail('INVALID_INPUT', `checks must be an array of at most ${MAX_CHECK_ENTRIES} entries`, {
      field: 'checks',
    });
  }
  for (const entry of checks) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      fail('INVALID_INPUT', 'checks holds an entry that is not an object', { field: 'checks' });
    }
  }
  const result = {
    evidence: false,
    reason: 'not-detected',
    closestMismatch: null,
    headSha,
    jobs: [],
  };
  if (detection.status !== 'detected' || detection.detectedJobs.length === 0) return result;
  // `data.reason` is the first final failure; only when there is none, the first not-yet outcome,
  // so a final failure is never reported as something to wait for.
  let firstFinal = null;
  let firstNotYet = null;
  let firstMismatch = null;
  const record = (outcome) => {
    if (EVIDENCE_NOT_YET_REASONS.includes(outcome)) firstNotYet ??= outcome;
    else firstFinal ??= outcome;
  };
  for (const job of detection.detectedJobs) {
    const instances = job.expectedInstances.map((name) => {
      const outcome = instanceOutcome(
        checks.filter((entry) => entry.name === name),
        job,
        headSha,
      );
      if (outcome.outcome !== 'complete') record(outcome.outcome);
      if (outcome.closestMismatch) firstMismatch ??= outcome.closestMismatch;
      return { name, ...outcome };
    });
    const satisfied =
      instances.length > 0 && instances.every((instance) => instance.outcome === 'complete');
    if (instances.length === 0) record('no-instances');
    result.jobs.push({ workflowPath: job.workflowPath, jobId: job.jobId, satisfied, instances });
  }
  result.evidence = result.jobs.every((job) => job.satisfied);
  result.reason = result.evidence ? 'complete' : (firstFinal ?? firstNotYet);
  // Detail for a `missing` result only: what the closest same-named entry of the first missing
  // instance that has one lacks, so a report can say "reported only as a push run".
  if (result.reason === 'missing') result.closestMismatch = firstMismatch;
  return result;
}

// ---------------------------------------------------------------------------------------------
// quick-marker-scan

// The trailer the resolver's commit message carries for a conflict commit validated under `quick`.
export const QUICK_MARKER_KEY = 'Effective-Flow-Conflict-Validation';
export const QUICK_MARKER_VALUE = 'quick';
const MAX_SCANNED_COMMITS = 10000;
// `ok: false` reasons (`error.details.reason`), each a fail-closed "cannot tell".
export const QUICK_MARKER_FAILURES = Object.freeze([
  'shallow-repository',
  'base-ref-missing',
  'head-missing',
  'no-merge-base',
  'too-many-commits',
]);
const TRAILER_LINE = /^[A-Za-z0-9][A-Za-z0-9-]*: /;

// Whether `message` carries the exact trailer line `Effective-Flow-Conflict-Validation: quick`. A
// trailer is a line of the message's last paragraph, which must not be its first (the subject), and
// whose every line is a `Key: value` trailer or a whitespace-indented continuation of one. Key and
// value match exactly; only trailing whitespace of a line is ignored.
export function hasQuickMarker(message) {
  if (typeof message !== 'string') return false;
  const paragraphs = message
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.replace(/^\n+|\s+$/g, ''))
    .filter((paragraph) => paragraph !== '');
  if (paragraphs.length < 2) return false;
  const lines = paragraphs.at(-1).split('\n');
  if (!TRAILER_LINE.test(lines[0])) return false;
  if (!lines.every((line) => TRAILER_LINE.test(line) || /^[ \t]+\S/.test(line))) return false;
  return lines.some((line) => line.trimEnd() === `${QUICK_MARKER_KEY}: ${QUICK_MARKER_VALUE}`);
}

function scanFailure(reason, message) {
  fail('GIT_FAILED', message, { reason });
}

// The commits in `<merge-base(origin/<baseRef>, headSha)>..headSha` whose message carries the quick
// marker trailer. A shallow repository, missing objects, an unrelated history or an oversized range
// are `ok: false`, never "no marker": a caller that cannot tell treats the range as quick. A shallow
// clone is refused before anything else, because its cut-off history can hide the merge base or a
// marked commit while every Git call still succeeds.
export async function scanQuickMarkers(input, deps = {}) {
  validateKeys('quick-marker-scan', input);
  validateCwd(input.cwd);
  validateBranch(input.baseRef, 'baseRef');
  if (typeof input.headSha !== 'string' || !OBJECT_ID.test(input.headSha)) {
    fail('INVALID_INPUT', 'headSha must be a full lowercase object id', { field: 'headSha' });
  }
  const { cwd, baseRef, headSha } = input;
  const context = makeContext(deps);
  const shallow = (await gitOutput(context, cwd, ['rev-parse', '--is-shallow-repository'])).trim();
  if (shallow !== 'false') {
    scanFailure(
      'shallow-repository',
      shallow === 'true'
        ? 'the repository is a shallow clone, so its history cannot prove the range'
        : 'git rev-parse --is-shallow-repository printed neither true nor false',
    );
  }
  const commit = await baseCommit(context, cwd, baseRef);
  if (commit === null) {
    scanFailure('base-ref-missing', `refs/remotes/origin/${baseRef} does not exist`);
  }
  const head = await gitOutput(
    context,
    cwd,
    ['rev-parse', '--verify', '--quiet', `${headSha}^{commit}`],
    1,
  );
  if (head === null || head.trim() !== headSha) {
    scanFailure('head-missing', `the commit ${headSha} does not exist`);
  }
  const mergeBaseOutput = await gitOutput(context, cwd, ['merge-base', commit, headSha], 1);
  const mergeBase = mergeBaseOutput?.trim() ?? null;
  if (mergeBase === null || !OBJECT_ID.test(mergeBase)) {
    scanFailure('no-merge-base', `origin/${baseRef} and ${headSha} share no merge base`);
  }
  // `-z` ends every commit's record with NUL; each record is `<sha> NUL <raw message>`.
  const output = await gitOutput(context, cwd, [
    'log',
    '-z',
    '--no-show-signature',
    '--no-color',
    `--max-count=${MAX_SCANNED_COMMITS + 1}`,
    '--format=%H%x00%B',
    `${mergeBase}..${headSha}`,
    '--',
  ]);
  const fields = output === '' ? [] : output.replace(/\0$/, '').split('\0');
  if (fields.length % 2 !== 0) fail('GIT_FAILED', 'git log printed an unparseable record');
  const scanned = fields.length / 2;
  if (scanned > MAX_SCANNED_COMMITS) {
    scanFailure('too-many-commits', `more than ${MAX_SCANNED_COMMITS} commits to scan`);
  }
  const commits = [];
  for (let index = 0; index < fields.length; index += 2) {
    const sha = fields[index].replace(/^\n+/, '');
    if (!OBJECT_ID.test(sha)) fail('GIT_FAILED', 'git log printed an unparseable commit id');
    if (hasQuickMarker(fields[index + 1])) commits.push(sha);
  }
  return {
    baseRef,
    baseCommit: commit,
    headSha,
    mergeBase,
    scanned,
    commits,
    found: commits.length > 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Envelopes

const HANDLERS = Object.freeze({
  'ci-detect': detectCi,
  'ci-integrity': checkIntegrity,
  'ci-evidence-match': async (input) => matchEvidence(input),
  'quick-marker-scan': scanQuickMarkers,
});

export async function executeOperation(operation, input = {}, deps = {}) {
  try {
    if (!CONFLICT_VALIDATION_OPERATIONS.includes(operation)) {
      fail('INVALID_INPUT', `unknown operation: ${operation}`);
    }
    const data = await HANDLERS[operation](input, deps);
    return { ok: true, operation, data };
  } catch (error) {
    return errorEnvelope(operation, error);
  }
}

export function errorEnvelope(operation, error) {
  const normalized =
    error instanceof ConflictValidationError
      ? error
      : new ConflictValidationError(
          'INTERNAL_ERROR',
          error?.message ?? 'unexpected conflict-validation failure',
        );
  return {
    ok: false,
    operation: CONFLICT_VALIDATION_OPERATIONS.includes(operation) ? operation : null,
    error: {
      code: normalized.code,
      message: normalized.message,
      details: normalized.details ?? {},
      retryable: false,
    },
  };
}

export function exitCodeFor(envelope) {
  if (envelope.ok) return 0;
  return EXIT_CODES[envelope.error.code] ?? 1;
}
