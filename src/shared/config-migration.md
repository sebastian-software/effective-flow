## Effective Flow configuration (project setup ADR)

The tracked truth for the Effective Flow configuration is a living ADR "Effective
Flow project setup" (default slug `effective-flow-project-setup`, see fragment "Living
ADR model"). It carries the config parameters with minimal prose as a **Markdown table**. There
is **no** `.effective-flow/config.json` as a config source anymore; `.effective-flow/` is a
pure runtime directory (`memory.json`, `cache.json`, `review/`, `.worktrees/`) and is
completely gitignored.

### Config locator (resolution order)

When reading the configuration, the project setup ADR is resolved in this order; the
first matching step wins:

1. **AGENTS.md marker.** The canonical line `**Effective Flow project setup:** <path>` in
   `AGENTS.md`, otherwise in `CLAUDE.md` or a comparable convention file → read the ADR
   under `<path>`. The legacy spelling `**Firmo project setup:** <path>` is recognized as
   equivalent on read; the spelling stays here because it is the **detection** predicate, while
   what that recognition then triggers belongs to the deferred building block below. If the
   marker points to a path under which **no** ADR lives
   (dead/stale marker), do not stay there, but fall through in this order and report the stale
   marker (correction in {{SKILL:setup}}).
2. **Default path/scan.** Otherwise `docs/adr/effective-flow-project-setup.md` or a scan of the
   detected ADR directory (`docs/adr/`, `docs/decisions/`, `adr/`) for the project setup ADR. A
   file matches that scan when its stem equals `effective-flow-project-setup`, **and** its body
   carries one of the canonical configuration envelopes listed under "Table encoding" below. The
   stem comparison is deliberately tolerant of a legacy slug and a numeric prefix, so this one
   step can match **several** files; that tolerance and the ordered ranking which resolves a
   several-match state belong to the deferred building block below, not to this step.
3. **Transitional compatibility.** Otherwise — only transitionally — the legacy
   `<RUNTIME_STATE_ROOT>/.effective-flow/config.json` (otherwise
   `<RUNTIME_STATE_ROOT>/.firmo/config.json`) read fallback, whose complete contract is the
   deferred building block's.
4. **Built-in defaults.** Otherwise use the defaults of the respective source skills.

The deterministic read path of any tool is non-blocking: It reads the ADR (or
the transitional fallback), but itself creates no file and mutates no Git. Creating
the ADR, the markers and the migration happen exclusively in the Git-touching path of
{{SKILL:setup}}.

```lazy-include
config-migration-edge-cases
when: the locator finds no ADR whose stem is exactly the current slug, its scan matches several files, a legacy setup marker or legacy slug is present, the transitional `.effective-flow/config.json` / `.firmo/config.json` fallback must be read, or a `tracker.mode: external` run resolves `tracker.externalStartedState` or `tracker.externalDoneState`
```

### Table encoding (binding for writers and readers)

The config parameters stand as a flat Markdown table with two columns. Readers bootstrap before
they know the configured language by accepting both canonical envelopes: English
`## Configuration` with `| Key | Value |`, and German `## Konfiguration` with
`| Schlüssel | Wert |`. They likewise recognize `## Context`/`## Kontext`, `## Status`,
`Active`/`Aktiv` and `Superseded`/`Abgelöst`. The former German empty-list token `(leer)` is
accepted on legacy reads only. Config keys and newly written encoded values remain identical and
English in both envelopes, including `(empty)`. Writers ({{SKILL:setup}}, migration) and readers
(all tools) interpret values identically. A normal update preserves the existing ADR envelope
language; changing `language.documentation.technical` does not translate an existing ADR.

- **Boolean** → `true` / `false`.
- **String** → literal, unquoted (e.g. `focused`, `origin/main`).
- **`null`** (semantically "ask at run time", e.g. `applyReview.defaultCommitStrategy`) →
  the literal token `null`.
- **Empty list** → `(empty)`.
- **Filled list** → comma-separated (e.g. `humanizer, distill`).
- **Nesting** → dotted keys (e.g. `applyReview.worktree.baseDir`,
  `skills.agents.ui-implementer.include`); an empty object has no sub-lines.
- **Missing line = key not set → default of the source skill.** Deliberately
  different from a present line with value `null` (an explicit value, semantically "ask at
  run time"). Example: no `delivery.completion` line → default `merge`; a
  `delivery.completion | null` line → ask at run time.
- **`delivery.prReview`** → the literal string `ask` (default), `always`, or `off`; it governs the
  automatic PR review publication after a delivery. No `delivery.prReview` line → default `ask`,
  per the rule above.
- **`tracker.externalStartedState`** and **`tracker.externalDoneState`** → nullable state IDs read
  only by a `tracker.mode: external` run; their per-key notes are the deferred building block's.

Reading a single value is a trivial line lookup (line with dotted key →
value cell). Example excerpt (interface sketch, not full content):

```markdown
## Configuration

| Key                         | Value    |
| --------------------------------- | ------- |
| review.profile                    | focused |
| applyReview.defaultCommitStrategy | null    |
| skills.exclude                    | (empty)  |
| worktree.enabled                  | true    |
```

If the table is invalid or ambiguous (missing key, unknown encoding): use a
safe default for the run, inform the user about the affected key,
do **not** guess.
