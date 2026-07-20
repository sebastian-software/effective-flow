# Effective Flow configuration

The tracked Effective Flow configuration is a living project-setup ADR, not runtime state. This
page summarizes the developer contract; the binding sources are
[`src/shared/config-migration.md`](../../src/shared/config-migration.md) for lookup, encoding, and
migration, [`src/shared/adr-convention.md`](../../src/shared/adr-convention.md) for the living ADR
model, and [`src/tools/setup.md`](../../src/tools/setup.md) for all Git-touching writes.

## Tracked source and runtime boundary

The tracked truth is a mutable, numberless ADR titled `# Effective Flow project setup`, with the
default slug and path `docs/adr/effective-flow-project-setup.md`. It holds a `## Configuration`
Markdown table with minimal context. The `.effective-flow/` directory contains only runtime state
such as `memory.json`, `cache.json`, `review/`, and `.worktrees/`; the entire directory is
gitignored with one `.effective-flow/` line.

This table is a narrow, explicit exception to the usual separation of ADR rationale from exact
configuration values: the project-setup ADR is itself the owning tracked configuration artifact.
Other ADRs remain decision records and must not become configuration stores.

Every mutation below `.effective-flow/` is fail-closed and just-in-time. Immediately before a
runtime `mkdir`, copy, write, rename, deletion, lock, or worktree operation, the owning Git
worktree checks both the sentinel `.effective-flow/config.json` and the concrete target with
non-verbose `git check-ignore --no-index -- <path>`, then independently requires
`git ls-files -- .effective-flow/` to succeed with empty output. Missing Git, a non-repository,
a not-ignored path, tracked runtime state, or a command error preserves all state and routes to
`/effective-flow setup`. Ordinary workflows never repair `.gitignore`; setup is the sole owner.

The canonical convention-file locator is:

```md
**Effective Flow project setup:** docs/adr/effective-flow-project-setup.md
```

## Resolution order and ownership

Readers resolve configuration in this order:

1. the canonical marker in `AGENTS.md`, otherwise `CLAUDE.md` or a comparable convention file;
2. the default path, followed by a scan of the detected ADR directory (`docs/adr/`,
   `docs/decisions/`, or `adr/`);
3. transitional read-only legacy input;
4. each source tool's built-in defaults.

A dead marker is reported but falls through to the next step. The former
`**Firmo project setup:**` marker and `firmo-project-setup` slug are recognized for one
compatibility generation.

This deterministic read path creates nothing and touches no Git. `/effective-flow setup` is the
only workflow that creates or updates the ADR and marker, normalizes `.gitignore`, or migrates a
legacy config. Readers with no ADR may consume legacy values for the current run and direct the
user to setup; they do not perform migration themselves.

## Canonical table encoding

Writers emit a flat table headed exactly `| Key | Value |`. Values use this encoding:

- Boolean → `true` / `false`.
- String → literal and unquoted, for example `focused` or `origin/main`.
- Explicit run-time choice → literal `null`.
- Empty list → `(empty)`.
- Filled list → comma-separated values, for example `humanizer, distill`.
- Nested value → dotted key, for example `applyReview.worktree.baseDir`.
- Empty object → no rows.

A missing row means “key not set; use the source skill's default.” A present `null` row is an
explicit value and means “ask at run time” for keys that accept it. Readers must preserve this
distinction and treat invalid or ambiguous table values as errors for the affected key rather
than guessing.

```md
## Configuration

| Key                                 | Value                      |
| ----------------------------------- | -------------------------- |
| review.profile                      | focused                    |
| applyReview.defaultCommitStrategy   | null                       |
| applyReview.worktree.baseDir        | .effective-flow/.worktrees |
| skills.include                      | (empty)                    |
| worktree.enabled                    | true                       |
```

Unknown valid rows are retained across setup maintenance. The user guide's
[configuration reference](../user-guide/configuration.md) lists all current keys, values, and
defaults.

## Read-time backward compatibility

Existing ADRs written with `## Konfiguration`, the header `| Schlüssel | Wert |`, the empty-list
token `(leer)`, the statuses `Aktiv`/`Abgelöst`, the former marker spelling, or the former slug
remain readable. They are compatibility inputs only. On its next write, setup normalizes them to
the canonical English forms while preserving known and unknown rows.

## Migration compatibility

When no ADR is available, readers may transitionally read `.effective-flow/config.json` or the
older `.firmo/config.json` and point to `/effective-flow setup`. Setup converts those values to
the ADR table, writes the canonical marker, normalizes `.gitignore` to `.effective-flow/`, and
untracks an old tracked config with `git rm --cached` while leaving its content on disk. The
separate `/effective-flow cleanup` workflow may later remove confirmed remnants.

Outside setup, no migration occurs. The exact legacy procedure and idempotency contract remain in
[`src/shared/config-migration.md`](../../src/shared/config-migration.md) and
[`src/tools/setup.md`](../../src/tools/setup.md).

## Living ADR model

Effective Flow ADRs are mutable, numberless, slug-named documents whose current file is the truth.
The authoritative central
[`decision-records`](https://github.com/sebastian-software/skills.sebastian-software.com/tree/main/skills/decision-records) skill follows
a repository's declared convention. For Effective Flow-generated ADRs, the living lifecycle and
minimal fallback in [`src/shared/adr-convention.md`](../../src/shared/adr-convention.md) are that
declared convention, not a competing second playbook. Consult the central skill for ADR
worthiness, lifecycle, and authoring; this guide does not duplicate that playbook.
