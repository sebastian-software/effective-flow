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
   under `<path>`. **Backcompat (one generation):** a still-present legacy marker
   `**Firmo project setup:** <path>` is recognized as equivalent on read; {{SKILL:setup}}
   converts it non-destructively to the new spelling on the next run. If the
   marker points to a path under which **no** ADR lives (dead/stale marker), do not stay
   there, but fall through in this order and report the stale marker
   (correction in {{SKILL:setup}}).
2. **Default path/scan.** Otherwise `docs/adr/effective-flow-project-setup.md` or a scan of the
   detected ADR directory (`docs/adr/`, `docs/decisions/`, `adr/`) for the project setup ADR. A
   file matches that scan when its stem equals `effective-flow-project-setup` or the legacy slug
   `firmo-project-setup` after stripping an optional leading `^\d+[-_]` numeric prefix, **and**
   its body carries one of the canonical configuration envelopes listed under "Table encoding"
   below. Both the numeric prefix and the legacy slug are read-side tolerance; they do not decide
   what a new file is named. That tolerance widens the scan to a family of names, so **several**
   files can match inside this one step; "the first matching step wins" ranks the four steps, not
   the matches within a step. Rank the matches by one **ordered** comparison rather than by two
   independent preferences: prefer the current slug `effective-flow-project-setup` over the legacy
   `firmo-project-setup` first, and only among files carrying the same slug prefer an unprefixed
   stem over a prefixed one. Stated as two independent preferences,
   `0001-effective-flow-project-setup.md` and `firmo-project-setup.md` would each win one and
   neither would survive both. If more than one match still ties at the top of that ranking, report
   every matching path and fall through to the next step instead of picking one. Falling through
   here is not the same result as finding nothing: a tool that **writes** configuration ends its run
   on a reported several-match result, reporting every matching path so its user resolves the
   duplicates by hand, and never reads it as "no project setup ADR exists", because writing a new
   ADR into that state adds a further one beside the matches already reported.
3. **Transitional compatibility.** Otherwise — only transitionally — establish or reuse the
   verified execution-location receipt and resolve the fallback from `RUNTIME_STATE_ROOT`: read
   a still-present absolute `<RUNTIME_STATE_ROOT>/.effective-flow/config.json` handle (otherwise
   `<RUNTIME_STATE_ROOT>/.firmo/config.json`) and point to {{SKILL:setup}}. Never inspect a
   same-named fallback below a linked `EXECUTION_ROOT`. A missing, bare, moved, unsafe, or
   repository-mismatched runtime root blocks the fallback. This read path creates **nothing**
   and touches **no** Git.
4. **Built-in defaults.** Otherwise use the defaults of the respective source skills.

The deterministic read path of any tool is non-blocking: It reads the ADR (or
the transitional fallback), but itself creates no file and mutates no Git. Creating
the ADR, the markers and the migration happen exclusively in the Git-touching path of
{{SKILL:setup}}.

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
- **`tracker.externalStartedState`** → a nullable string containing the external connection's stable
  state ID, or its exact accepted token only when that connection exposes no ID. Missing or `null`
  means unset and never authorizes a guessed transition. Readers validate a non-null value against a
  fresh list of writable states in the exact configured tracker context before every implementation
  run; stale, terminal, read-only, cross-context, and display-name-only matches fail closed before
  code. Only `{{SKILL:setup}}` writes a confirmed tracker-verified suggestion. The fixed post-merge
  observation grace period has no configuration key.
- **`tracker.externalDoneState`** → a nullable string containing the external connection's stable
  **terminal** state ID, or its exact accepted token only when that connection exposes no ID. Missing
  or `null` means unset and never authorizes a guessed transition. Readers validate a non-null value
  against a fresh list of writable states in the exact configured tracker context before the offered
  post-merge terminal transition; stale, non-terminal, read-only, cross-context, not-done-category,
  and display-name-only matches make that transition unavailable instead of guessing, and never
  abort a run whose merge already succeeded. That transition is not the only reader: the post-merge
  observation of an issue found already terminal resolves the same value by the same rules, and a
  value that fails there makes that issue's reconciliation unavailable rather than its transition.
  Only `{{SKILL:setup}}` writes a confirmed
  tracker-verified suggestion. The completion assessment behind the offer has no configuration key of its own.

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
