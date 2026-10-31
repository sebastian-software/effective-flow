## Runtime directory `.effective-flow/` and migration from `.firmo/`/`.sf-plugin/`

Effective Flow keeps project-local runtime data under `.effective-flow/` (`memory.json`,
`cache.json`, `review/`, `investigation/`, `merge-gate/` delegation messages, `.worktrees/`, and
wisdom files; a legacy `config.json` may still be present as transitional input, but configuration
migration to the project-setup ADR is owned by `{{SKILL:setup}}`). Earlier versions used `.firmo/`,
and still older ones used `.sf-plugin/`.

Every workflow that can mutate `.effective-flow/` must load this fragment after
“Runtime-state write safety” and run the following prerequisite before its **first** runtime
write. Merely finding `.effective-flow/` does not prove that migration ran. The stable,
versioned completion marker is the JSON value `runtimeMigration.directory.version: 1` in
`.effective-flow/memory.json`.

```include
memory-state
```

## Migration prerequisite steps

1. **Read without creating anything.** Read the absolute
   `<RUNTIME_STATE_ROOT>/.effective-flow/memory.json` handle when present. A valid marker makes the
   prerequisite a no-op. Do not create a runtime footprint during a read-only run; this
   prerequisite runs only because a workflow-specific runtime write is already authorized and
   imminent.
2. **Migrate through the helper.** Without the marker, call `memory migrate-directory` as shown in
   “Memory operations”. The helper reads `.firmo/` when it exists, otherwise `.sf-plugin/`, from
   `RUNTIME_STATE_ROOT` only; copies only missing entries without ever replacing a target, excluding
   `.worktrees/`; merges the legacy `memory.json` so that existing values win; and writes the marker
   last. Without a legacy source it writes the marker alone.
3. **Handle the outcome.**
   - Success: report `result.source`, `result.copiedCount`, and `result.keptCount`. Report every
     `result.skipped` entry (a symlink or special file that was never followed or copied) with its
     path and type, and `result.skippedCount`.
   - `MIGRATION_NOT_NEEDED`: a concurrent run already wrote the marker; continue.
   - `LEGACY_MEMORY_INVALID` or `MIGRATION_INCOMPLETE` (`reason`: `copy-failed` or
     `target-missing`): the marker stays unset and the copied files stay. Report the path and
     reason, perform none of the workflow-specific runtime writes, and leave the retry to a later
     run.
   - Every other result follows “Memory operations”.

Both legacy directories stay unchanged. The `.gitignore` switch to a single `.effective-flow/`
entry—including migration of the earlier two-line pattern `.effective-flow/*` plus
`!.effective-flow/config.json`, as well as a blanket `.firmo/` or `.sf-plugin/` ignore line—is
handled only by `{{SKILL:setup}}`. Deletion of preserved legacy directories remains an explicit,
user-confirmed responsibility of `{{SKILL:cleanup}}`.
