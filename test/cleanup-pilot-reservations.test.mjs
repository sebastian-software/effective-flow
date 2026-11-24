import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { PILOT_MEASUREMENT_OPERATIONS } from '../src/scripts/pilot-measurement-core.mjs';

// Wiring of the orphaned pilot reservation class into `cleanup`: the tool's eager core only points
// at the lazy fragment `cleanup-pilot-reservations`, which owns the helper calls, the per-item
// confirmation and the refusal outcomes.

const flat = (relative) =>
  readFileSync(new URL(relative, import.meta.url), 'utf8').replace(/\s+/g, ' ');
const cleanup = flat('../src/tools/cleanup.md');
const fragment = flat('../src/shared/cleanup-pilot-reservations.md');

// Invariant: the class is loaded only when the pilot namespace exists, and every phase that
// handles the other classes hands this one to its fragment.
test('cleanup points every phase of the pilot reservation class at its lazy fragment', () => {
  assert.match(
    cleanup,
    /```lazy-include cleanup-pilot-reservations when: Phase 1 step 4 finds the directory `<RUNTIME_STATE_ROOT>\/\.effective-flow\/model-tiering-pilot\/` ```/,
  );
  assert.match(
    cleanup,
    /\*\*Pilot reservations:\*\* when `\.effective-flow\/model-tiering-pilot\/` exists, inventory them as `cleanup-pilot-reservations` defines/,
  );
  assert.match(cleanup, /List pilot reservations as `cleanup-pilot-reservations` defines/);
  assert.match(
    cleanup,
    /\*\*Pilot reservations:\*\* ask and abandon as `cleanup-pilot-reservations` defines/,
  );
  assert.match(cleanup, /pilot reservations by workflow, age, `liveness` and `stale`/);
  assert.match(cleanup, /abandoned pilot reservations/);
  assert.match(cleanup, /pilot-reservation or worktree removal candidates/);
});

// Invariant: the scope boundary, the rules and the catalog text name the one runtime rewrite the
// class allows, and only through the helper.
test('cleanup names the abandonment in its scope boundary, rules and catalog text', () => {
  assert.match(
    cleanup,
    /no other active runtime file is a cleanup target\. The one current runtime-state rewrite is a confirmed open pilot reservation, which `abandon-reservation` finalizes as `abandoned` instead of deleting it/,
  );
  assert.match(
    cleanup,
    /Close a pilot reservation only through `abandon-reservation`, never by editing its record/,
  );
  assert.match(cleanup, /or a confirmed `abandon-reservation`, which guards itself/);
  assert.match(
    cleanup,
    /description: "[^"]*open pilot measurement reservations it abandons through the pilot helper once their session is proven gone or their staleness is confirmed/,
  );
  assert.match(cleanup, /catalogHint: "[^"]*orphaned planning claims and pilot reservations\."/);
});

// Invariant: cleanup never judges orphanhood itself; it offers only a proven-dead or stale item,
// asks per item, warns that a stale run may be live, and keeps every refused item.
test('the fragment offers only proven-dead or confirmed-stale reservations, one at a time', () => {
  for (const operation of ['list-reservations', 'abandon-reservation']) {
    assert.ok(PILOT_MEASUREMENT_OPERATIONS.includes(operation), operation);
  }
  assert.match(fragment, /Cleanup never judges orphanhood itself/);
  assert.match(
    fragment,
    /call `list-reservations` with exactly `runtimeStateRoot` and `repositoryIdentity`/,
  );
  assert.match(
    fragment,
    /An item with `proof: "process-dead"` is a candidate with that proof, one with `stale: true` and no proof a candidate only for explicit stale confirmation; every other item is kept with its `liveness`/,
  );
  // An abandonment interrupted before its receipt drain is offered again to finish it.
  assert.match(
    fragment,
    /A `state: "pending-drain"` item \(`proof: "already-abandoned"`\) is an abandonment interrupted before it drained the run's timing receipts, which close admission for every later run; it is a candidate with that proof/,
  );
  assert.match(
    fragment,
    /provably gone on this host, which needs Linux `\/proc` and the same host binding/,
  );
  // A live recorded parent of a gone session proves nothing: unknown, so the 24-hour path applies.
  assert.match(
    fragment,
    /Only the session itself reads `alive`; with it gone and a recorded parent still running, .* liveness is `unknown`, so after a crash the record usually shows `unknown` and the 24-hour path applies/,
  );
  assert.match(
    fragment,
    /A wrapped call \(contrary to the direct-invocation rule\) can still read `dead` while the session runs when the ancestor chain ends at a pid-namespace boundary or at init, or when more wrapper levels than the two recorded parents lie between the helper and the session/,
  );
  assert.match(fragment, /A stale reservation may still belong to a live long run/);
  assert.match(
    fragment,
    /An open `merge-gate` observation carries no owner proof and is never offered/,
  );
  assert.match(fragment, /ask once per candidate, never for all at once/);
  const asks = [...fragment.matchAll(/```ask (.*?)```/g)].map(([, body]) => body);
  assert.equal(asks.length, 1);
  assert.match(asks[0], /when: a pilot reservation is listed as a candidate; ask once per item/);
  assert.match(asks[0], /the run may still be live/);
  assert.match(asks[0], /label: Abandon .* label: Keep/);
  assert.match(
    fragment,
    /call `abandon-reservation` with exactly `runtimeStateRoot`, `repositoryIdentity`, `generationId` \(from the listing\), `itemId`, `recordDigest`, `confirmation: true` and either the item's `"proof"` \(`"process-dead"` or `"already-abandoned"`\) or `"confirmStale": true`/,
  );
  assert.match(
    fragment,
    /`INVALID_STATE` \(the proof or staleness no longer holds\), `STALE_REVIEW` \(the record changed\), `NOT_FOUND` \(already closed\) and every other error keep it/,
  );
  assert.match(fragment, /never `itemId`, `recordDigest` or another payload value/);
  assert.match(fragment, /the next cleanup run lists it as `pending-drain`/);
});
