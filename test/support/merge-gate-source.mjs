import { readFileSync } from 'node:fs';

// `src/tools/merge-gate.md` keeps only the caller core – Phase 0, the run states and the dispatch –
// and defers the gate itself to `src/shared/merge-gate-delegated-run.md` behind one lazy pointer.
// Prose tests about the gate read both as one document: the core with that pointer replaced by the
// fragment, which is exactly what a delegated or inline run reads, in that order. A test about the
// split itself reads the two files separately.
export const DELEGATED_RUN_POINTER_RE =
  /```lazy-include\nmerge-gate-delegated-run\n(?:when:[^\n]*\n)?```\n?/;

export function mergeGateCore(root) {
  return readFileSync(new URL('src/tools/merge-gate.md', root), 'utf8');
}

export function mergeGateDelegatedRun(root) {
  return readFileSync(new URL('src/shared/merge-gate-delegated-run.md', root), 'utf8');
}

// Replaces the one delegated-run pointer of a merge-gate body – the source core or a built one –
// with the fragment body. More or fewer than one pointer throws instead of leaving the body
// unspliced, so a moved or duplicated pointer cannot turn a test vacuous.
export function spliceDelegatedRun(core, fragment, context = 'src/tools/merge-gate.md') {
  const pointers = core.match(new RegExp(DELEGATED_RUN_POINTER_RE.source, 'g')) ?? [];
  if (pointers.length !== 1) {
    throw new Error(
      `${context} must carry exactly one merge-gate-delegated-run pointer, found ${pointers.length}`,
    );
  }
  return core.replace(DELEGATED_RUN_POINTER_RE, () => fragment);
}

export function mergeGateWithDelegatedRun(root) {
  return spliceDelegatedRun(mergeGateCore(root), mergeGateDelegatedRun(root));
}
