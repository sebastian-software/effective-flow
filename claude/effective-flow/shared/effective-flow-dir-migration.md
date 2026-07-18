## Runtime directory `.effective-flow/` and migration from `.firmo/`/`.sf-plugin/`

Effective Flow keeps project-local runtime data under `.effective-flow/` (`memory.json`, `cache.json`, `review/`, `investigation/`, `.worktrees/`, wisdom files; a legacy `config.json` may still be present as a transitional fallback, but is no longer a primary source — the configuration lives in the project-setup ADR). Earlier versions used `.firmo/`, still older ones `.sf-plugin/`. When this skill reads or writes `.effective-flow/` data, these rules apply:

1. **No unrequested footprint:** Create `.effective-flow/` only when runtime data is actually written. A run with no data to save produces no `.effective-flow/`.
2. **Fallback reading:** If `.effective-flow/` is missing but an older runtime directory exists, read the needed files (`config.json`, `memory.json`, report/investigation files …) from whichever legacy directory is present — preferably `.firmo/`, otherwise `.sf-plugin/` — as long as migration has not yet happened.
3. **One-time, non-destructive migration:** As soon as a write to `.effective-flow/` would occur and no `.effective-flow/` exists yet, but a `.firmo/` or `.sf-plugin/` is present: create `.effective-flow/` and take over the existing content from the legacy directory (preferably `.firmo/` over `.sf-plugin/`; copy, do not move), then write the change into `.effective-flow/`. If `.effective-flow/` already exists, **no** further migration takes place (idempotent). Parallel-safe: a file already present in the target is not overwritten.
4. **No silent deletion:** `.firmo/` and `.sf-plugin/` are preserved; Effective Flow leaves the cleanup to the user.

The `.gitignore` switch to a single `.effective-flow/` (including migration of the earlier two-line pattern `.effective-flow/*` plus `!.effective-flow/config.json` as well as a blanket `.firmo/` or `.sf-plugin/` ignore line) is handled by `/effective-flow setup`.
