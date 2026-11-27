// Capture owns deterministic publication checks, private duplicate comparison and hash-bound
// writes. Third-party prose never leaves this module. Hashes detect tampering, not authorship.
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { executeOperation as trackerOperation } from './remote-tracker-core.mjs';
import { scanEntries } from './plan-publication-core.mjs';
import {
  MAX_INPUT_BYTES,
  RuntimeStateError,
  atomicWrite,
  createNoClobber,
  ensureGuardedDirectory,
  gitBaseEnv,
  guardedUnlink,
  readRuntimeInputFile,
  resolveRuntimeRoot,
} from './runtime-state-guard.mjs';

export { MAX_INPUT_BYTES };
export const CAPTURE_OPERATIONS = Object.freeze(['context-read', 'build', 'apply', 'run-remove']);
export const STALE_RUNTIME_MS = 24 * 60 * 60 * 1000;
export const RECOVERY_CLOCK_SKEW_MS = 2 * 60 * 1000;
const SEGMENTS = ['.effective-flow', 'capture', 'inputs'];
const RUN = '\\d{4}-\\d{2}-\\d{2}-[a-f0-9]{8}';
const RUN_PATTERN = new RegExp(`^${RUN}$`);
const OUTPUT = new RegExp(
  `^(context|writeset|state|lock|apply)-(${RUN})(?:-([a-z0-9-]{1,64}))?\\.json$`,
);
const INPUT = new RegExp(`^input-(${RUN})-[a-z]+-[1-9]\\d{0,3}\\.json$`);
const EXCLUSIVE_TEMP = new RegExp(`^\\.capture-(?:lock-)?(${RUN})-[a-f0-9]{16}\\.tmp$`);
const INTERNAL_LABEL = /^(?:effective-flow|firmo|sf)-/i;
const STOPWORDS = new Set(
  (
    'the and for with from this that into when then are was were has have had does not can should would could will issue bug feature ' +
    'der die das den dem des ein eine einer einen einem eines und oder mit von für fuer bei auf aus ist sind war wird werden nicht auch als zum zur im in an zu'
  ).split(' '),
);
export const SESSION_LINK_PATTERNS = Object.freeze([
  /https?:\/\/(?:www\.)?claude\.ai\/code(?:\/|\b)/i,
  /https?:\/\/(?:www\.)?(?:chatgpt\.com|chat\.openai\.com)\/(?:c|share)\//i,
]);
const SECTIONS = {
  en: [
    'Problem',
    'Current state (verified references)',
    'Proposal',
    'Acceptance criteria',
    'Open questions',
  ],
  de: [
    'Problem',
    'Aktueller Stand (geprüfte Referenzen)',
    'Vorschlag',
    'Akzeptanzkriterien',
    'Offene Fragen',
  ],
};
export class CaptureError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CaptureError';
    this.code = code;
    this.details = details;
  }
}
const fail = (code, message, details) => {
  throw new CaptureError(code, message, details);
};
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value))
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
export const contentHash = (value) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
function seal(value) {
  const { hash: _old, ...data } = value;
  return { ...data, hash: contentHash(data) };
}
function unseal(value) {
  if (!object(value)) fail('TAMPERED_INPUT', 'missing persisted object');
  const { hash, ...data } = value;
  if (hash !== contentHash(data)) fail('TAMPERED_INPUT', 'persisted hash does not match');
  return value;
}
const now = (deps) => new Date(deps.now ? deps.now() : Date.now());
function text(value, field, max = 65536) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0'))
    fail('INVALID_PAYLOAD', `invalid ${field}`);
  return value;
}
function runId(value) {
  if (!RUN_PATTERN.test(value)) fail('INVALID_PAYLOAD', 'invalid runId');
  return value;
}
function draftId(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(value))
    fail('INVALID_PAYLOAD', 'invalid draft id');
  return value;
}
function stopped(input) {
  if (input.visibility === 'hidden' || input.target?.visibility === 'hidden') return 'hidden-mode';
  if (input.target?.kind !== 'forge')
    return (
      { local: 'local-mode', external: 'external-unsupported', unset: 'unset-mode' }[
        input.target?.kind
      ] ?? 'unset-mode'
    );
  return null;
}
function runtimeContext(deps) {
  return { runner: deps.runner, env: gitBaseEnv(deps.env) };
}
async function location(root, deps, create = false) {
  const ctx = runtimeContext(deps);
  await resolveRuntimeRoot(ctx, root);
  let directory = ctx.cwd;
  for (const segment of SEGMENTS) {
    directory = path.join(directory, segment);
    if (create) await ensureGuardedDirectory(ctx, directory);
    else {
      const info = fs.lstatSync(directory, { throwIfNoEntry: false });
      if (!info) return { ctx, directory: null };
      if (info.isSymbolicLink() || !info.isDirectory())
        fail('UNSAFE_RUNTIME_STATE', 'capture directory is not a real directory');
    }
  }
  return { ctx, directory };
}
async function persist(ctx, file, value, exclusive = false) {
  const sealed = seal({ ...value, inputFile: file });
  const bytes = `${JSON.stringify(sealed)}\n`;
  if (Buffer.byteLength(bytes) > MAX_INPUT_BYTES)
    fail('BOUNDS_EXCEEDED', 'capture state exceeds the input bound');
  if (exclusive) {
    const result = await createNoClobber(ctx, file, bytes, {
      tempPrefix: `.capture-${runId(value.runId)}-`,
    });
    if (!result.created) fail('ALREADY_APPLIED', 'capture state already exists');
  } else await atomicWrite(ctx, file, bytes);
  return sealed;
}
async function read(file, deps, kind) {
  const match = typeof file === 'string' && OUTPUT.exec(path.basename(file));
  if (!match || match[1] !== kind) fail('INVALID_PAYLOAD', `expected ${kind} file reference`);
  const result = await readRuntimeInputFile(
    file,
    SEGMENTS,
    false,
    runtimeContext(deps),
    (type, message) =>
      new CaptureError(
        type === 'guard' || type === 'directory' ? 'UNSAFE_RUNTIME_STATE' : 'INVALID_PAYLOAD',
        message,
      ),
    { namePattern: OUTPUT, strict: true },
  );
  unseal(result);
  if (
    result.inputFile !== file ||
    path.join(result.runtimeStateRoot, ...SEGMENTS, path.basename(file)) !== file ||
    result.runId !== match[2]
  )
    fail('TAMPERED_INPUT', 'capture reference belongs to another run or root');
  return result;
}
function fileAt(directory, kind, id, suffix = '') {
  return path.join(directory, `${kind}-${runId(id)}${suffix ? `-${suffix}` : ''}.json`);
}
async function withLock(root, id, deps, callback) {
  const { ctx, directory } = await location(root, deps, true);
  const file = fileAt(directory, 'lock', id);
  const result = await createNoClobber(ctx, file, JSON.stringify({ pid: process.pid }), {
    tempPrefix: `.capture-lock-${id}-`,
  });
  if (!result.created) fail('CAPTURE_LOCKED', 'another operation holds this capture run');
  try {
    return await callback(ctx, directory);
  } finally {
    await guardedUnlink(ctx, file);
  }
}
async function remote(operation, context, payload, deps, apply = false) {
  const envelope = await (deps.trackerOperation ?? trackerOperation)(
    operation,
    {
      cwd: context.cwd,
      ...(context.repository ? { repository: context.repository } : {}),
      ...(context.target?.provider ? { provider: context.target.provider } : {}),
      ...payload,
    },
    { runner: deps.runner, apply },
  );
  if (!envelope.ok) fail(envelope.error?.code ?? 'FORGE_FAILED', `${operation} failed`);
  return envelope.data;
}
export function titleTokens(title) {
  return [
    ...new Set(
      String(title)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .split(/\s+/)
        .filter((token) => token.length >= 3 && !STOPWORDS.has(token)),
    ),
  ].sort();
}
// Only repository-relative paths below the root count. Hub files like README.md do not.
export function repositoryPaths(value) {
  return [
    ...new Set(
      (String(value).match(/(?<![\w/:.~-])(?:\.?[\w-]+\/)+[\w.\/-]+/gu) ?? [])
        .map((token) => token.replace(/[.,:;]+$/, ''))
        .filter(
          (token) =>
            !token.startsWith('/') &&
            !token.includes('..') &&
            !token.endsWith('/') &&
            !token.startsWith('http'),
        ),
    ),
  ].sort();
}
export function duplicateCandidates(draft, issues, verified) {
  const tokens = new Set(titleTokens(draft.title));
  const paths = new Set(verified.flatMap(repositoryPaths));
  const draftPaths = repositoryPaths(`${draft.title}\n${draft.body}`).filter((value) =>
    paths.has(value),
  );
  return issues
    .flatMap((issue) => {
      const shared = issue.tokens.filter((token) => tokens.has(token)).length;
      const union = new Set([...tokens, ...issue.tokens]).size;
      const score = union ? shared / union : 0;
      const pathMatch = draftPaths.some((value) => issue.paths.includes(value));
      return (score >= 0.5 && shared >= 2) || (score >= 0.25 && pathMatch)
        ? [{ number: issue.number, state: issue.state, url: issue.url, score }]
        : [];
    })
    .sort((a, b) => b.score - a.score || b.number - a.number)
    .slice(0, 3);
}
function sections(body, language) {
  const names = SECTIONS[language];
  if (!names) fail('INVALID_PAYLOAD', 'language must be en or de');
  const result = new Map();
  let current = null;
  let fenced = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = !fenced && /^## (.+)$/.exec(line);
    if (heading) {
      const name = heading[1];
      if (!names.includes(name) || result.has(name))
        fail('DRAFT_REJECTED', 'unknown or repeated draft section');
      const previous = [...result.keys()].at(-1);
      if (previous && names.indexOf(previous) >= names.indexOf(name))
        fail('DRAFT_REJECTED', 'draft sections are out of order');
      current = name;
      result.set(current, []);
    } else if (current) result.get(current).push(line);
    else if (line.trim()) fail('DRAFT_REJECTED', 'body must start with a section');
  }
  for (const index of [0, 2])
    if (!result.get(names[index])?.join('\n').trim())
      fail('DRAFT_REJECTED', `missing required section: ${names[index]}`);
  for (const [name, lines] of result)
    if (!lines.join('\n').trim()) fail('DRAFT_REJECTED', `omit empty section: ${name}`);
  return result;
}
function pathReference(token) {
  // Sections and line references are checked verbatim by the leaf; only the file part goes to Git.
  const bare = token
    .split('#')[0]
    .replace(/:\d+(?:-\d+)?$/, '')
    .replace(/\/$/, '');
  return (bare.includes('/') || /\.[a-z0-9]+$/i.test(bare)) &&
    !bare.startsWith('/') &&
    !bare.includes('://')
    ? bare
    : null;
}
export async function checkDraft(draft, { language, verified, baseSha, cwd }, deps) {
  text(draft.title, 'title', 256);
  text(draft.body, 'body');
  if (/[\r\n]/.test(draft.title)) fail('DRAFT_REJECTED', 'title must be one line');
  const scan = scanEntries(
    [
      { field: 'title', text: draft.title },
      { field: 'body', text: draft.body },
    ],
    'interactive',
  );
  if (scan.blocking.length)
    fail('DRAFT_REJECTED', 'publication scanner blocked the draft', { findings: scan.findings });
  const combined = `${draft.title}\n${draft.body}`;
  if (SESSION_LINK_PATTERNS.some((pattern) => pattern.test(combined)))
    fail('DRAFT_REJECTED', 'hosted agent session link');
  if (combined.includes('<!--')) fail('DRAFT_REJECTED', 'HTML comments are forbidden');
  if (!/^[a-f0-9]{40,64}$/.test(baseSha))
    fail('INVALID_PAYLOAD', 'baseSha must be an immutable Git oid');
  if (!Array.isArray(verified) || verified.some((value) => typeof value !== 'string'))
    fail('INVALID_PAYLOAD', 'verified must be a token array');
  const current = sections(draft.body, language).get(SECTIONS[language][1])?.join('\n') ?? '';
  for (const match of current.matchAll(/`([^`\n]+)`/g)) {
    const token = match[1];
    if (!verified.includes(token))
      fail('DRAFT_REJECTED', 'unverified reference in Current state', { reference: token });
    const file = pathReference(token);
    if (file) {
      if (file.startsWith('-') || file.split('/').some((part) => part === '..' || part === '.'))
        fail('DRAFT_REJECTED', 'unsafe repository reference');
      const result = await deps.runner({
        executable: 'git',
        args: ['--no-replace-objects', '-C', cwd, 'cat-file', '-e', `${baseSha}:${file}`],
        env: gitBaseEnv(deps.env),
        timeoutMs: 10000,
      });
      if (result.status !== 0)
        fail('DRAFT_REJECTED', 'reference does not exist at base', { reference: token });
    }
  }
  return scan.findings.filter((finding) => finding.confidence === 'lower');
}
async function contextRead(input, deps) {
  const reason = stopped(input);
  if (reason) return { stopped: true, reason };
  text(input.cwd, 'cwd');
  const { ctx, directory } = await location(input.runtimeStateRoot, deps, true);
  const start = now(deps);
  const id = `${start.toISOString().slice(0, 10)}-${(deps.randomBytes ?? randomBytes)(4).toString('hex')}`;
  // Mint a removable run before any forge call. Failures return its id for the caller's exit rule.
  const contextFile = fileAt(directory, 'context', id);
  const shell = {
    runId: id,
    runtimeStateRoot: ctx.cwd,
    cwd: input.cwd,
    target: input.target,
    startedAt: start.toISOString(),
  };
  await persist(ctx, contextFile, shell, true);
  try {
    return await withLock(ctx.cwd, id, deps, async (lockCtx, dir) => {
      const repository = await remote('repository-resolve', shell, {}, deps);
      if (!repository || !['github', 'forgejo'].includes(repository.provider))
        fail('UNSUPPORTED_CAPABILITY', 'capture supports GitHub and Forgejo only');
      const context = { ...shell, repository };
      const notices = [];
      let labels = [];
      try {
        const listed = (await remote('label-list', context, {}, deps)).result;
        if (!Array.isArray(listed)) fail('INVALID_PAYLOAD', 'incomplete label list');
        labels = [
          ...new Set(
            listed
              .map((label) => label.name)
              .filter((name) => typeof name === 'string' && !INTERNAL_LABEL.test(name)),
          ),
        ].sort();
      } catch {
        notices.push('labels-unavailable');
      }
      const since = new Date(start.getTime() - 90 * STALE_RUNTIME_MS)
        .toISOString()
        .replace(/\.\d{3}Z$/, 'Z');
      const open = (await remote('issue-list', context, { state: 'open' }, deps)).result;
      const closed = (await remote('issue-list', context, { state: 'closed', since }, deps)).result;
      if (!Array.isArray(open) || !Array.isArray(closed))
        fail('INVALID_PAYLOAD', 'incomplete duplicate inventory');
      let viewer = null;
      try {
        viewer = (await remote('viewer-read', context, {}, deps)).result?.login ?? null;
      } catch {
        /* unknown writes cannot be recovered without identity */
      }
      const issues = [
        ...new Map(
          [...open, ...closed].map((issue) => [
            issue.number,
            {
              number: issue.number,
              state: issue.state,
              url: issue.url,
              author: issue.author?.login ?? null,
              createdAt: issue.createdAt ?? null,
              tokens: titleTokens(issue.title),
              paths: repositoryPaths(`${issue.title}\n${issue.body}`),
            },
          ]),
        ).values(),
      ];
      await persist(lockCtx, contextFile, { ...context, labels, issues, viewer });
      await persist(lockCtx, fileAt(dir, 'state', id), { ...shell, drafts: {} }, true);
      return { runId: id, contextFile, labels, notices };
    });
  } catch (error) {
    error.details = { runId: id, ...error.details };
    throw error;
  }
}
function deriveEntries(data) {
  const { draft, candidates, contextHash, baseSha, verified, warnings, revision } = data;
  const common = {
    draftId: draft.id,
    title: draft.title,
    body: draft.body,
    labels: draft.labels,
    classification: draft.classification,
    contextHash,
    baseSha,
    verified,
    warnings,
    revision,
  };
  return [
    { ...common, id: `${draft.id}:${revision}:create`, action: 'create', target: null },
    ...candidates.map((candidate) => ({
      ...common,
      id: `${draft.id}:${revision}:comment:${candidate.number}`,
      action: 'comment',
      target: candidate.number,
    })),
  ].map((entry) => seal(entry));
}
async function build(input, deps) {
  const context = await read(input.contextFile, deps, 'context');
  return withLock(context.runtimeStateRoot, context.runId, deps, async (ctx, directory) => {
    const stateFile = fileAt(directory, 'state', context.runId);
    const state = await read(stateFile, deps, 'state');
    const raw = input.draft;
    if (!object(raw)) fail('INVALID_PAYLOAD', 'draft must be an object');
    const id = draftId(raw.id);
    const previous = Object.hasOwn(state.drafts, id) ? state.drafts[id] : undefined;
    if (!previous && Object.keys(state.drafts).length >= 10)
      fail('BOUNDS_EXCEEDED', 'at most ten drafts per run');
    if (previous?.revision >= 1) fail('DRAFT_REJECTED', 'only one revision is allowed');
    if (fs.existsSync(fileAt(directory, 'apply', context.runId, id)))
      fail('ALREADY_APPLIED', 'this draft already has an apply stamp');
    const classification = raw.classification === 'clean' ? 'clean' : 'flagged';
    if (previous?.classification === 'flagged' && classification !== 'flagged')
      fail('DRAFT_REJECTED', 'revision cannot downgrade security classification');
    if (previous && input.baseSha !== previous.baseSha)
      fail('DRAFT_REJECTED', 'revision must use the same base SHA');
    const proposed = Array.isArray(raw.labels) ? raw.labels : [];
    const labels = [
      ...new Set(
        proposed.filter((label) => context.labels.includes(label) && !INTERNAL_LABEL.test(label)),
      ),
    ];
    const removedLabels = proposed.filter((label) => !labels.includes(label));
    const draft = { id, title: raw.title, body: raw.body, labels, classification };
    const verified = input.verified;
    const warnings = await checkDraft(
      draft,
      { language: input.language, verified, baseSha: input.baseSha, cwd: context.cwd },
      deps,
    );
    const candidates = duplicateCandidates(draft, context.issues, verified);
    const revision = previous ? 1 : 0;
    const data = {
      runId: context.runId,
      runtimeStateRoot: context.runtimeStateRoot,
      cwd: context.cwd,
      contextFile: context.inputFile,
      contextHash: context.hash,
      labelSet: context.labels,
      language: input.language,
      baseSha: input.baseSha,
      verified,
      draft,
      candidates,
      warnings,
      revision,
    };
    const entries = deriveEntries(data);
    const file = fileAt(directory, 'writeset', context.runId, `${id}-${revision}`);
    const set = await persist(ctx, file, { ...data, entries }, true);
    await persist(ctx, stateFile, {
      ...state,
      drafts: {
        ...state.drafts,
        [id]: { revision, classification, baseSha: input.baseSha, writeSetHash: set.hash },
      },
    });
    return {
      writeSetFile: file,
      removedLabels,
      previews: entries.map((entry) => ({ ...entry, candidates })),
    };
  });
}
async function recoverCreate(context, entry, deps) {
  if (!context.viewer) return { status: 'unknown', reason: 'viewer-unavailable' };
  let listed;
  try {
    listed = (await remote('issue-list', context, { state: 'open' }, deps)).result;
  } catch {
    return { status: 'unknown', reason: 'recovery-read-failed' };
  }
  if (!Array.isArray(listed)) return { status: 'unknown', reason: 'recovery-read-failed' };
  const earliest = Date.parse(context.startedAt) - RECOVERY_CLOCK_SKEW_MS;
  const matches = listed.filter(
    (issue) =>
      issue.title === entry.title &&
      issue.author?.login?.toLowerCase() === context.viewer.toLowerCase() &&
      Date.parse(issue.createdAt) >= earliest,
  );
  if (matches.length > 1) return { status: 'unknown', reason: 'ambiguous' };
  if (matches.length !== 1) return { status: 'unknown', reason: 'no-match' };
  return { status: 'recovered', number: matches[0].number };
}
async function apply(input, deps) {
  const set = await read(input.writeSetFile, deps, 'writeset');
  return withLock(set.runtimeStateRoot, set.runId, deps, async (ctx, directory) => {
    const context = await read(set.contextFile, deps, 'context');
    if (
      context.hash !== set.contextHash ||
      context.runId !== set.runId ||
      context.cwd !== set.cwd ||
      contentHash(context.labels) !== contentHash(set.labelSet)
    )
      fail('TAMPERED_INPUT', 'write set context changed');
    const state = await read(fileAt(directory, 'state', set.runId), deps, 'state');
    if (state.drafts[set.draft.id]?.writeSetHash !== set.hash)
      fail('SUPERSEDED_DRAFT', 'write set belongs to a superseded draft');
    if (!Array.isArray(input.selected) || input.selected.length !== 1)
      fail('INVALID_PAYLOAD', 'select exactly one entry per draft');
    const selection = input.selected[0];
    const entry = set.entries.find((item) => item.id === selection.id);
    if (!entry || entry.hash !== selection.hash)
      fail('TAMPERED_INPUT', 'selection hash is stale or foreign');
    unseal(entry);
    if (!['create', 'comment'].includes(entry.action))
      fail('INVALID_PAYLOAD', 'invalid capture action');
    if (
      !['clean', 'flagged'].includes(entry.classification) ||
      entry.classification !== set.draft.classification
    )
      fail('DRAFT_REJECTED', 'invalid or inconsistent security classification');
    if (entry.labels.some((label) => INTERNAL_LABEL.test(label) || !context.labels.includes(label)))
      fail('DRAFT_REJECTED', 'foreign or internal label');
    if (
      entry.action === 'comment' &&
      !set.candidates.some((candidate) => candidate.number === entry.target)
    )
      fail('DRAFT_REJECTED', 'foreign comment target');
    const warnings = await checkDraft(
      set.draft,
      { language: set.language, verified: set.verified, baseSha: set.baseSha, cwd: set.cwd },
      deps,
    );
    const candidates = duplicateCandidates(set.draft, context.issues, set.verified);
    if (
      contentHash(candidates) !== contentHash(set.candidates) ||
      contentHash(warnings) !== contentHash(set.warnings)
    )
      fail('TAMPERED_INPUT', 'draft check or candidates changed');
    const expected = deriveEntries(set).find((item) => item.id === selection.id);
    if (contentHash(expected) !== contentHash(entry))
      fail('TAMPERED_INPUT', 'entry is not derived from the checked draft');
    if (entry.classification === 'flagged' && selection.disclosure !== 'confirmed')
      fail('DISCLOSURE_REQUIRED', 'flagged draft requires disclosure confirmation');
    if (entry.classification === 'clean' && Object.hasOwn(selection, 'disclosure'))
      fail('INVALID_PAYLOAD', 'clean draft must not carry disclosure');
    const acknowledgements = selection.acknowledged ?? [];
    if (
      !Array.isArray(acknowledgements) ||
      warnings.some((warning) => !acknowledgements.includes(warning.id)) ||
      acknowledgements.some((id) => !warnings.some((warning) => warning.id === id))
    )
      fail(
        'ACKNOWLEDGEMENT_REQUIRED',
        'acknowledge every lower-confidence finding for this entry hash',
      );
    const ledgerFile = fileAt(directory, 'apply', set.runId, set.draft.id);
    const ledger = {
      runId: set.runId,
      runtimeStateRoot: set.runtimeStateRoot,
      draftId: set.draft.id,
      entryHash: entry.hash,
      status: 'pending',
    };
    // Exclusive creation is the once-only boundary, including process loss before settlement.
    await persist(ctx, ledgerFile, ledger, true);
    let number = entry.target;
    let status = 'written';
    let reason;
    try {
      if (entry.action === 'create') {
        const created = await remote(
          'issue-create',
          context,
          { payload: { title: entry.title, body: entry.body, labels: entry.labels } },
          deps,
          true,
        );
        number = created.result?.number;
        if (!Number.isSafeInteger(number) || number < 1)
          fail('UNKNOWN_OUTCOME', 'create returned no issue number');
      } else
        await remote(
          'issue-comment',
          context,
          { number, payload: { body: entry.body } },
          deps,
          true,
        );
    } catch {
      const recovery =
        entry.action === 'create'
          ? await recoverCreate(context, entry, deps)
          : { status: 'unknown', reason: 'comment-outcome-unknown' };
      ({ status, number, reason } = recovery);
    }
    await persist(ctx, ledgerFile, {
      ...ledger,
      status: status === 'unknown' ? 'unknown' : 'written',
      ...(number ? { number } : {}),
    });
    if (status === 'unknown') return { status, reason };
    if (entry.action === 'comment') {
      // Never read an existing thread's prose, including its title, back into the model context.
      const candidate = set.candidates.find((item) => item.number === number);
      return { status, action: 'comment', result: { number, url: candidate.url } };
    }
    try {
      const issue = (await remote('issue-read', context, { number }, deps)).result;
      return {
        status,
        action: entry.action,
        result: { number, title: issue.title, url: issue.url, labels: issue.labels },
        requestedLabels: entry.labels,
        labelsDiffer:
          entry.action === 'create' &&
          contentHash([...(issue.labels ?? [])].sort()) !== contentHash([...entry.labels].sort()),
      };
    } catch {
      return {
        status,
        action: entry.action,
        number,
        url: `https://${context.repository.host}/${context.repository.owner}/${context.repository.repository}/issues/${number}`,
        postReadFailed: true,
      };
    }
  });
}
function runtimeFiles(directory, id) {
  return fs.readdirSync(directory).flatMap((name) => {
    // atomicWrite temporaries retain their target's run id and belong to the same cleanup.
    const targetName = name.replace(/^\.(.+\.json)\.[a-f0-9]{16}\.tmp$/, '$1');
    const output = OUTPUT.exec(targetName);
    const input = INPUT.exec(targetName);
    const fileRun = output?.[2] ?? input?.[1] ?? EXCLUSIVE_TEMP.exec(name)?.[1];
    if (!fileRun || (id && fileRun !== id)) return [];
    const file = path.join(directory, name);
    const info = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!info) return [];
    if (!info.isFile() || info.isSymbolicLink())
      fail('UNSAFE_RUNTIME_STATE', 'capture state is not a regular file');
    return [{ file, info, runId: fileRun, lock: output?.[1] === 'lock' }];
  });
}
async function runRemove(input, deps) {
  const { ctx, directory } = await location(input.runtimeStateRoot, deps);
  if (!directory) return { removed: [] };
  if (input.runId !== undefined) runId(input.runId);
  const ids = [...new Set(runtimeFiles(directory, input.runId).map((file) => file.runId))];
  const removed = [];
  for (const id of ids) {
    const files = runtimeFiles(directory, id);
    if (
      !input.runId &&
      files.some(({ info }) => now(deps).getTime() - info.mtimeMs < STALE_RUNTIME_MS)
    )
      continue;
    const locked = files.find((entry) => entry.lock);
    if (locked) {
      // A stale crashed helper must not retain drafts forever. A live pid, unreadable or malformed
      // lock stays untouched; pid reuse may preserve stale data but can never delete an active run.
      const lock = await readRuntimeInputFile(
        locked.file,
        SEGMENTS,
        false,
        ctx,
        (_kind, message) => new CaptureError('UNSAFE_RUNTIME_STATE', message),
        { namePattern: OUTPUT, strict: true },
      );
      let alive = true;
      if (Number.isSafeInteger(lock.pid) && lock.pid > 0) {
        try {
          process.kill(lock.pid, 0);
        } catch (error) {
          if (error.code === 'ESRCH') alive = false;
        }
      }
      if (alive) {
        if (input.runId) fail('CAPTURE_LOCKED', 'cannot remove a running capture operation');
        continue;
      }
      await guardedUnlink(ctx, locked.file);
    }
    try {
      await withLock(input.runtimeStateRoot, id, deps, async (lockCtx) => {
        const current = runtimeFiles(directory, id).filter((entry) => !entry.lock);
        // Recheck after taking the lock: another build may have refreshed this run meanwhile.
        if (
          !input.runId &&
          current.some(({ info }) => now(deps).getTime() - info.mtimeMs < STALE_RUNTIME_MS)
        )
          return;
        for (const { file } of current) {
          await guardedUnlink(lockCtx, file);
          removed.push(file);
        }
      });
    } catch (error) {
      if (!input.runId && error.code === 'CAPTURE_LOCKED') continue;
      throw error;
    }
  }
  return { removed };
}
const HANDLERS = { 'context-read': contextRead, build, apply, 'run-remove': runRemove };
export async function executeOperation(operation, input = {}, deps = {}) {
  try {
    if (!CAPTURE_OPERATIONS.includes(operation) || !object(input))
      fail('INVALID_PAYLOAD', 'unknown operation or invalid input');
    if (Object.keys(input).length === 1 && Object.hasOwn(input, 'inputFile')) {
      input = await readRuntimeInputFile(
        input.inputFile,
        SEGMENTS,
        true,
        runtimeContext(deps),
        (kind, message) => new CaptureError('INVALID_PAYLOAD', message),
        { namePattern: INPUT, strict: true },
      );
    }
    const data = await HANDLERS[operation](input, deps);
    return { ok: true, operation, data };
  } catch (error) {
    return errorEnvelope(operation, error);
  }
}
export function errorEnvelope(operation, error) {
  const code =
    error instanceof RuntimeStateError ? 'UNSAFE_RUNTIME_STATE' : (error.code ?? 'INTERNAL_ERROR');
  return {
    ok: false,
    operation: operation ?? null,
    error: { code, message: error.message ?? 'capture failed', details: error.details ?? {} },
  };
}
export function exitCodeFor(envelope) {
  return envelope.ok
    ? 0
    : ['INVALID_PAYLOAD', 'DRAFT_REJECTED', 'TAMPERED_INPUT'].includes(envelope.error.code)
      ? 2
      : 1;
}
