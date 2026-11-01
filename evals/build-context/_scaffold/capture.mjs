// Shared sealing copies only complete host-coordinator observations; no run-authored success flags.
import { readRegular } from './transcript.mjs';
import { completionProblems, preparedOf } from './host-receipt.mjs';
import { CASES, SCHEMA, requireThat } from './protocol.mjs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
export const STATE_FILE = 'build-context-state.json';
export function captureState({ scenario, paths }) {
  const errors = [],
    variants = [];
  try {
    const manifest = JSON.parse(
        readRegular(resolve(paths.traceDir, 'build-context.private.json'), 256 * 1024),
      ),
      metadata = JSON.parse(readRegular(paths.runMetadata, 64 * 1024));
    requireThat(
      manifest.schema === SCHEMA && Array.isArray(manifest.variants),
      'missing host completion manifest',
    );
    for (const entry of manifest.variants) {
      requireThat(
        CASES[scenario].includes(entry.name) && !variants.some((v) => v.name === entry.name),
        'unknown/duplicate variant',
      );
      const run = JSON.parse(readRegular(entry.completion, 2 * 1024 * 1024)),
        prepared = preparedOf(run);
      requireThat(completionProblems(run).length === 0, 'invalid host completion provenance');
      requireThat(
        run.name === entry.name &&
          prepared.scenario === scenario &&
          prepared.variant === entry.name &&
          prepared.slot === metadata.slot,
        'foreign actual launch',
      );
      requireThat(
        isDeepStrictEqual(run.profile, metadata.profile),
        'observed root profile differs from prepared root receipt',
      );
      variants.push(run);
    }
  } catch (error) {
    errors.push(error.message);
  }
  return JSON.stringify({ schema: SCHEMA, scenario, variants, errors }) + '\n';
}
export function parseState(text) {
  try {
    const state = JSON.parse(text);
    requireThat(
      state.schema === SCHEMA &&
        Object.hasOwn(CASES, state.scenario) &&
        Array.isArray(state.variants) &&
        Array.isArray(state.errors) &&
        state.errors.every((e) => typeof e === 'string'),
      'malformed sealed build-context state',
    );
    return { state, problems: [] };
  } catch (error) {
    return { state: null, problems: [error.message] };
  }
}
