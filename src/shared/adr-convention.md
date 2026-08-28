## Living ADR model

Effective Flow keeps architecture decisions (ADRs) as **living documents**: mutable
Markdown files that always carry the currently valid state of a decision. There is
no numbering and no supersede chain; the current file is the truth. This
building block is the authoritative convention for all ADRs **produced by Effective Flow**.

A convention the project itself declares outranks the Effective Flow default. Resolve the file
name of every ADR through "Project-declared ADR naming convention" below, and use the form
described here wherever that resolution finds nothing.

### Form and location

This is the default form; it applies when the project declares no ADR naming convention of its
own and the observed evidence is inconclusive.

- **Location:** ADRs live in the project's detected ADR directory, default `docs/adr/`.
- **File name:** numberless, kebab-case slug — `docs/adr/<slug>.md` (e.g.
  `docs/adr/effective-flow-project-setup.md`).
- **Title:** an H1 with the descriptive title — `# <Title>` (no `NNNN` prefix).
- **Language:** a new ADR uses `language.documentation.technical` resolved through the shared
  language rule. An existing ADR keeps its clearly recognizable language unless translation was
  requested. Human-readable headings and values use one language consistently; slugs, paths,
  config keys, references, and other machine-stable tokens are unchanged.
- **Status:** a `## Status` section holds the current state. English values are `Active`,
  `Superseded`, `Not implemented`; German values are `Aktiv`, `Abgelöst`, `Nicht umgesetzt`.
  Both complete forms remain readable.
- **Mutability:** an existing ADR is updated **in place** when the decision changes
  (content and `## Status`), not duplicated or replaced by a successor record.
- **Concurrency:** read the file fresh immediately before writing.

### Referencing

References to ADRs use the **slug or title**, not a number, e.g.
`(ADR: <slug>)`. Slug references stay stable across content changes.

### Backward read compatibility for numbered legacy ADRs

Existing numbered legacy ADRs (`NNNN-*.md`, H1 `# NNNN — Title`) remain **readable and
resolvable by number**. There is **no** mandatory bulk rename; legacy ADRs are not
touched. New ADRs are created in the resolved convention, which is the living slug format wherever
the project declares nothing else and the observed evidence is inconclusive. This mirrors Effective Flow's
established compatibility line (plan numbers via H1, `firmo-`/`effective-flow-` labels).

### Relationship to the `effective-product` skill (declared convention + fallback)

The living slug model described above is the **declared ADR convention of this
repo**. The host skill `effective-product` is the domain owner for ADR craft (whether a
decision is even ADR-worthy, lifecycle, supersession, index); its Decision Records route
begins by **discovering the existing repository convention and following it**, rather than
enforcing its own. This very building block is that convention — so the skill authors
Effective Flow ADRs in the living slug format (location/file name/title/status/mutability as
above), not in an immutably numbered one.

The layered contract therefore applies (see `skill-discovery.md`):

- **`effective-product` is authoritative when present.** The skill decides **whether** a finding
  is a durable decision and — if so — authors it according to the convention declared here.
  If the target repo declares its **own** ADR convention (different directory,
  title/status format, index), the skill follows that; the living slug model is only the
  default when the repo declares nothing else.
- **Minimal fallback when the skill is absent.** If `effective-product` is unavailable (not
  installed, `skills.enabled: false`, or disabled via `exclude`), the
  calling tool itself authors according to the **minimal fallback structure**
  below — **no** silent invention of a second convention.

**Coexistence.** Where a project prefers to run a different ADR model, it declares that
convention in the target repo (the skill follows it) or toggles `effective-product` deliberately
via the `skills` config (`include`/`exclude`, also per-agent/-tool) on or off.

### Minimal fallback structure (only without `effective-product`)

A short core structure so that a calling tool can record a rejected decision as a living
slug ADR even without the skill — **not** a second full ADR handbook. Location, title, status,
and mutability as under "Form and location"; the file name follows the convention resolved by
"Project-declared ADR naming convention" below rather than the default form being re-imposed
here; read the file fresh before writing and update a thematically fitting existing ADR in place
at the path where it was found instead of duplicating:

```markdown
# [Title of the decision]

## Status

Not implemented

## Context

[Origin: review report + finding ID, or issue/epic number in remote mode]

## Decision

[Short rationale for why it is not implemented]

## Rationale

[Full developer note or `wontfix` rationale]

## Source finding

[Finding ID] from [source]: [short version of the problem]  <!-- traceable backlink -->
```

Only **durable** decisions are recorded this way; a pure delivery rejection without a
durable architectural effect stays in the review report or tracker artifact and is not forced into
an ADR.

```include
project-adr-convention
```
