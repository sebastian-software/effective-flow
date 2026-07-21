# Effective Flow configuration

The tracked Effective Flow configuration is a living project-setup ADR, not runtime state. This
page summarizes the developer contract; the binding sources are
[`src/shared/config-migration.md`](../../src/shared/config-migration.md) for lookup, encoding, and
migration, [`src/shared/adr-convention.md`](../../src/shared/adr-convention.md) for the living ADR
model, and [`src/tools/setup.md`](../../src/tools/setup.md) for all Git-touching writes.

## Tracked source and runtime boundary

The tracked truth is a mutable, numberless ADR with the default slug and path
`docs/adr/effective-flow-project-setup.md`. A new ADR uses the configured technical-documentation
language: `# Effective Flow project setup` with `## Configuration`, or
`# Effective-Flow-Projektsetup` with `## Konfiguration`. Existing ADRs preserve their recognizable
envelope language on ordinary setup updates. The `.effective-flow/` directory contains only
runtime state such as `memory.json`, `cache.json`, `review/`, and `.worktrees/`; the entire
directory is gitignored with one `.effective-flow/` line.

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

Before its first authorized runtime write, every writing workflow also runs the marker-driven
legacy-directory prerequisite from
[`src/shared/effective-flow-dir-migration.md`](../../src/shared/effective-flow-dir-migration.md).
The marker `runtimeMigration.directory.version: 1` in `memory.json`, not the existence of the
target directory, proves completion. Without it, Effective Flow chooses `.firmo/` as the whole
source when present, otherwise `.sf-plugin/`, and copies only entries missing from
`.effective-flow/`. Existing target paths always win; `memory.json` receives a recursive
missing-key merge after a fresh re-read, and legacy `.worktrees/` is never copied. Any unsafe
memory input or carry-over failure leaves the marker unset and blocks the workflow-specific
write so a later run can retry. Legacy directories remain untouched until the user explicitly
runs `/effective-flow cleanup`.

All `memory.json` writers share the contract in
[`src/shared/memory-state.md`](../../src/shared/memory-state.md). They acquire the atomic
`.effective-flow/memory.lock` directory, record lock ownership, re-read and validate the complete
JSON object inside the lock, merge only their owned field or subtree, and replace the file through
a unique same-directory temporary file and atomic rename. Lock acquisition retries for at most 30
seconds; timeout reports the recorded owner, and a suspected orphan is removed only after explicit
confirmation. Invalid JSON or counters, permissions, disk exhaustion, and failed replacement all
fail closed without replacing the prior file or deleting foreign state.

Finding producers complete filtering and deduplication before reserving the exact nonzero range
they need. The range is persisted and the lock released before a report or remote issue is
published, so concurrent producers cannot duplicate IDs. Reservations are monotonic: a failure or
interruption after persistence may leave harmless gaps, but an ID is never rolled back or reused.
The runtime-directory marker, legacy `.sf-memory.json` migration, `labelMigration.sf`, and
`configMigration.adr` use the same mutation protocol and preserve unknown memory fields.

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

## Bilingual envelope and canonical table encoding

Readers bootstrap before language resolution by accepting `| Key | Value |` in the English
envelope and `| Schlüssel | Wert |` in the German envelope. Writers create a new envelope in
`language.documentation.technical` and preserve an existing envelope instead of translating it.
Keys and encoded values remain identical and English in both forms. Values use this encoding:

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

The complete German envelope—`# Effective-Flow-Projektsetup`, `Aktiv`/`Abgelöst`,
`## Kontext`, `## Konfiguration`, and `| Schlüssel | Wert |`—is canonical alongside the English
form. The former translated empty-list token `(leer)`, former marker spelling, and former slug
remain readable compatibility inputs. On write, setup keeps the recognized envelope language,
uses the stable `(empty)` value, and preserves known and unknown rows.

## Language configuration

`language.project` defaults to `en`. Optional `language.source`,
`language.documentation.user`, `language.documentation.technical`, `language.workflow`,
`language.forge`, and `language.git` overrides accept `de` or `en`; a missing override inherits
the project language. Artifact precedence, destination overlap, stable-token boundaries, and the
one-generation `plan.markerLanguage` migration are defined in the living
[project language policy](../adr/language-policy.md) and the binding
[`language-rules`](../../src/shared/language-rules.md) source.

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
