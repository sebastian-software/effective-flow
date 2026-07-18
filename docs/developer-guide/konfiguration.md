# Effective Flow configuration

The Effective Flow configuration **no longer** lives in `.effective-flow/config.json` but in a
living project-setup ADR. This document gives the developer-oriented overview; the binding
specification is in [`src/shared/config-migration.md`](../../src/shared/config-migration.md)
(locator, encoding, migration) and [`src/shared/adr-convention.md`](../../src/shared/adr-convention.md)
(living ADR model).

## Where the configuration lives

The tracked truth is a living ADR "Effective Flow project setup" (default slug
`effective-flow-project-setup`, default path `docs/adr/effective-flow-project-setup.md`). It
carries the config parameters with minimal prose as a **Markdown table** (`| Schlüssel | Wert |`)
with dotted keys. The file is located via the locator marker in `AGENTS.md`:

```md
**Effective Flow project setup:** docs/adr/effective-flow-project-setup.md
```

## Resolution order

When reading, the project-setup ADR is resolved in this order; the first matching step wins:

1. **AGENTS.md marker** – the line `**Effective Flow project setup:** <path>` (otherwise
   `CLAUDE.md` or a comparable convention file). A dead marker falls through and is reported.
2. **Default path/scan** – otherwise `docs/adr/effective-flow-project-setup.md` or a scan of the
   detected ADR directory (`docs/adr/`, `docs/decisions/`, `adr/`).
3. **Transition compatibility** – otherwise, transitionally, read a still-present
   `.effective-flow/config.json` and point to `/effective-flow setup`.
4. **Built-in defaults** – otherwise the defaults of the respective source skills.

The read path is non-blocking: it creates nothing and touches no Git.

## Table encoding (short form)

- **Boolean** → `true` / `false`.
- **String** → literal, unquoted (e.g. `focused`, `origin/main`).
- **`null`** → the literal token `null` (semantically "ask at run time").
- **Empty list** → `(leer)`.
- **Filled list** → comma-separated (e.g. `humanizer, distill`).
- **Nesting** → dotted keys (e.g. `applyReview.worktree.baseDir`).
- **Missing row** → key not set, the source skill's default applies (deliberately different from
  a present `null` row).

## `.effective-flow/` is gitignored

`.effective-flow/` is a pure runtime directory (`memory.json`, `cache.json`, `review/`,
`.worktrees/`) and is **completely** gitignored – there is no longer a tracked
`.effective-flow/config.json`. The one-time migration is handled by `/effective-flow setup`: it
creates the ADR table from the existing config content, writes the AGENTS.md marker, changes
`.gitignore` to a single `.effective-flow/`, and untracks the old `config.json`. Outside of
`/effective-flow setup` no migration takes place.

## Living ADR model

Effective Flow ADRs are **living documents**: mutable, numberless, and slug-named; the current
file is the truth, without a supersede chain. This deliberately deviates from the host skill
`decision-records` (which defines ADRs as immutable-after-accepted, numbered, and without config
values) – Effective Flow's convention takes precedence for Effective-Flow-generated ADRs because
it optimizes for a small LLM read context and the colocation of value and short rationale in one
tracked source. Details in [`src/shared/adr-convention.md`](../../src/shared/adr-convention.md).
