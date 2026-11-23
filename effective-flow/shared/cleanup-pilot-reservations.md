## Pilot reservations in cleanup

An open pilot workflow reservation below `.effective-flow/model-tiering-pilot/` that its run never
finalized, because the session crashed or the run was aborted, keeps activation `busy` and
aggregation closed. Only its own run holds the capability for `reconcile-record`; cleanup closes it
through the pilot helper's `abandon-reservation` instead, which finalizes it as `abandoned` and
touches no product file and no other record. Cleanup never judges orphanhood itself: a reservation
is abandoned only under the proof `process-dead` (its session process and its recorded parent
processes are provably gone on this host, which needs Linux `/proc` and the same host binding) or
after its staleness (older than 24 hours) is explicitly confirmed, and the helper checks both, and
that the record is unchanged, again under its lock. "Process gone" means the reserving session and
its recorded ancestors (up to two parent processes) are all gone. Only the session itself reads
`alive`; with it gone and a recorded parent still running, such as the terminal or supervisor it
ran under or the session above a wrapper, liveness is `unknown`, so after a crash the record
usually shows `unknown` and the 24-hour path applies. A wrapped call (contrary to the
direct-invocation rule) can still read `dead` while the session runs when the ancestor chain ends at
a pid-namespace boundary or at init, or when more wrapper levels than the two recorded parents lie
between the helper and the session. A stale reservation may
still belong to a live long run, which then records nothing more. An open `merge-gate` observation
carries no owner proof and is never offered; it still clears only by `begin-review` and
`discard-generation` with the pilot disabled.

Call `node <skill-root>/scripts/pilot-measurement.mjs <operation>` with one JSON object on stdin
and accept only its single JSON envelope on stdout. `runtimeStateRoot` is `RUNTIME_STATE_ROOT` and
`repositoryIdentity` the repository identity of the execution-location receipt. Report only the
operation, the error code and the closed outcome, never `itemId`, `recordDigest` or another
payload value. `LOCKED` changed nothing: re-send the identical payload at most twice more, after
about two and then about five seconds, then keep the item.

- **Inventory (Phase 1 step 4):** call `list-reservations` with exactly `runtimeStateRoot` and
  `repositoryIdentity`. `generationStatus: "absent"`, `protocolCurrent: false` (an earlier
  protocol's generation, whose exit stays review and discard) or an error lists nothing. Each item
  of `reservations` carries `itemId`, `state`, `workflow`, `ageMs`, `stale`, `liveness` (`dead`,
  `alive` or `unknown`, the latter for a gone session whose recorded parent still runs, another
  host, boot or pid namespace, an unresolved owner or an unreadable process table), `proof` and
  `recordDigest`. An item with `proof: "process-dead"` is
  a candidate with that proof, one with `stale: true` and no proof a candidate only for explicit
  stale confirmation; every other item is kept with its `liveness`. A `state: "pending-drain"`
  item (`proof: "already-abandoned"`) is an abandonment interrupted before it drained the run's
  timing receipts, which close admission for every later run; it is a candidate with that proof.
- **Dry run (Phase 4 step 7):** list each item by workflow, age, `liveness` and `stale`, with
  "process gone", "stale, may still be running" or "abandoned, receipts left" for a candidate and
  its reason for a kept one; a `pending-drain` item has no age or liveness and shows "none".
- **Confirmation (Phase 5):** ask once per candidate, never for all at once.

If a pilot reservation is listed as a candidate; ask once per item: Ask the user: **Abandon the open pilot record of a <workflow> run, age <age>, liveness <liveness>, under <process gone, confirmed staleness: the run may still be live and then records nothing more, or an earlier abandonment that left timing receipts>?**
- Abandon -- Check it again and finalize it as abandoned only while its proof or staleness still holds; product files stay unchanged
- Keep -- Leave it open; it keeps activation busy until a later cleanup run

- **Execution (Phase 5):** for each confirmed item call `abandon-reservation` with exactly
  `runtimeStateRoot`, `repositoryIdentity`, `generationId` (from the listing), `itemId`,
  `recordDigest`, `confirmation: true` and either the item's `"proof"` (`"process-dead"` or
  `"already-abandoned"`) or `"confirmStale": true`. `abandoned` (with `basis`) finalized it;
  `INVALID_STATE` (the proof or staleness no longer holds), `STALE_REVIEW` (the record changed),
  `NOT_FOUND` (already closed) and every other error keep it. After `WRITE_FAILED` or another
  error the record may already be abandoned with receipts left; the next cleanup run lists it as
  `pending-drain`.
