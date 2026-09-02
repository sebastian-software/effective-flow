## Configuration edge cases and read compatibility

These are the circumstance-gated parts of the Effective Flow configuration contract: the legacy
marker and slug tolerances of the config locator, the ranking that resolves a several-match scan,
the transitional JSON fallback, and the two `tracker.*` state keys only an `external` target
resolves. The ordered resolution steps and the table encoding they extend live in the "Effective
Flow configuration (project setup ADR)" building block (`config-migration.md`), which every source
that loads this one carries.

### Legacy setup marker (locator step 1)

**Backcompat (one generation):** a still-present legacy marker
`**Firmo project setup:** <path>` is recognized as equivalent on read; {{SKILL:setup}}
converts it non-destructively to the new spelling on the next run.

### Read tolerance and several-match ranking (locator step 2)

A file matches the locator's scan when its stem equals `effective-flow-project-setup` or the
legacy slug `firmo-project-setup` after stripping an optional leading `^\d+[-_]` numeric prefix,
**and** its body carries a canonical configuration envelope (see step 2 of the core). Both the
numeric prefix and the legacy slug are read-side tolerance; they do not decide
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

### Transitional compatibility (locator step 3)

Only transitionally — establish or reuse the verified execution-location receipt and resolve the
fallback from `RUNTIME_STATE_ROOT`: read a still-present absolute
`<RUNTIME_STATE_ROOT>/.effective-flow/config.json` handle (otherwise
`<RUNTIME_STATE_ROOT>/.firmo/config.json`) and point to {{SKILL:setup}}. Never inspect a
same-named fallback below a linked `EXECUTION_ROOT`. A missing, bare, moved, unsafe, or
repository-mismatched runtime root blocks the fallback. This read path creates **nothing**
and touches **no** Git.

### External tracker state keys (table encoding)

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
