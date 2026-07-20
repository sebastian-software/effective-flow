## Runtime directory `.effective-flow/` and migration from `.firmo/`/`.sf-plugin/`

Effective Flow keeps project-local runtime data under `.effective-flow/` (`memory.json`,
`cache.json`, `review/`, `investigation/`, `.worktrees/`, and wisdom files; a legacy
`config.json` may still be present as transitional input, but configuration migration to the
project-setup ADR is owned by `{{SKILL:setup}}`). Earlier versions used `.firmo/`, and still older
ones used `.sf-plugin/`.

Every workflow that can mutate `.effective-flow/` must load this fragment after
“Runtime-state write safety” and run the following prerequisite before its **first** runtime
write. Merely finding `.effective-flow/` does not prove that migration ran. The stable,
versioned completion marker is the JSON value `runtimeMigration.directory.version: 1` in
`.effective-flow/memory.json`.

Resolve every current and legacy runtime path from the retained, verified
`RUNTIME_STATE_ROOT`. All reads, inventories, copies, collision decisions, and the final memory
write use absolute handles below that main checkout. Never scan or mutate a legacy/current
runtime tree below a linked execution worktree.

1. **Read without creating anything.** Read the absolute
   `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle when present. A valid
   marker makes the prerequisite a no-op. A missing marker starts the migration scan even when
   `.effective-flow/` already contains a transitional `config.json`, wisdom file, report, cache,
   worktree, or unrelated memory fields. Do not create a runtime footprint during a read-only
   run; this prerequisite is activated only because a workflow-specific runtime write is already
   authorized and imminent.
2. **Choose exactly one legacy source.** Use the whole `<RUNTIME_STATE_ROOT>/.firmo/` tree when
   it exists; otherwise use `<RUNTIME_STATE_ROOT>/.sf-plugin/` when it exists. If both exist, do
   not combine them. Preserve both legacy
   directories unchanged. If neither exists, proceed directly to the final marker update as part
   of the already-authorized first runtime write, without a separate eager migration write.
3. **Validate before carrying state over.** Inventory the selected source without mutation. All
   entries required for the merge must be readable. If either present `memory.json` is invalid
   JSON, is not a JSON object, or cannot be read, a safe memory merge is impossible: report the
   path and error, leave the completion marker unset, perform none of the workflow-specific
   runtime writes, and retry on a later run. Do not reinterpret configuration or migrate it to an
   ADR here; that remains `{{SKILL:setup}}`’s responsibility.
4. **Merge the directory tree without replacing target state.** Walk the chosen legacy tree
   recursively, except for the entire `.worktrees/` subtree: legacy worktrees are path-registered
   and remain only in the legacy directory. For every other relative path, an existing target
   path wins regardless of type, timestamp, or content. Create only missing target directories
   and copy only missing files—including `cache.json`, report or investigation trees, and wisdom
   files—using no-clobber or exclusive-create semantics so a target that appears concurrently
   still wins. Apply “Runtime-state write safety” separately and immediately before each concrete
   `mkdir` or copy target. Treat `memory.json` specially under step 5 instead of copying it as a
   normal file. A copy, read, or guard failure stops the merge, leaves the marker unset, preserves
   both legacy directories and all target entries already carried over, blocks the
   workflow-specific runtime write with an actionable error, and allows the next run to retry
   the remaining missing paths.
5. **Merge memory recursively, target wins.** Recursively add legacy object keys that are absent
   from the target; at every scalar, array, object, or type conflict preserve the target value.
   Immediately before the final memory update, re-read the retained absolute
   `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle, validate it
   again, and repeat the missing-key merge against that freshest object so unrelated concurrent
   fields are not discarded. Reuse the repository-wide memory mutation contract when available;
   do not introduce a migration-specific lock, finding-number reservation, or competing atomic
   writer. After every directory copy has succeeded, add
   `runtimeMigration.directory.version: 1` to the freshly merged object and write it under the
   loaded runtime-state safety contract. Never reduce or replace existing counters, migration
   markers, status, or unrelated fields.
6. **Certify only success.** The marker is the final migration mutation and is written only after
   all safe carry-over work succeeds. A run with no legacy source records it as part of the first
   authorized runtime write. Once version `1` is present, later prerequisites skip the legacy
   scan and are idempotent. An interrupted or concurrent run with no marker retries; it never
   deletes legacy data, overwrites target paths, or treats a partially populated target as proof
   of completion.

The `.gitignore` switch to a single `.effective-flow/` entry—including migration of the earlier
two-line pattern `.effective-flow/*` plus `!.effective-flow/config.json`, as well as a blanket
`.firmo/` or `.sf-plugin/` ignore line—is handled only by `{{SKILL:setup}}`. Deletion of preserved
legacy directories remains an explicit, user-confirmed responsibility of `{{SKILL:cleanup}}`.
