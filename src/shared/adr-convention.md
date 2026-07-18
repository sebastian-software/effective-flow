## Living ADR model

Effective Flow keeps architecture decisions (ADRs) as **living documents**: mutable
Markdown files that always carry the currently valid state of a decision. There is
no numbering and no supersede chain; the current file is the truth. This
building block is the authoritative convention for all ADRs **produced by Effective Flow**.

### Form and location

- **Location:** ADRs live in the project's detected ADR directory, default `docs/adr/`.
- **File name:** numberless, kebab-case slug — `docs/adr/<slug>.md` (e.g.
  `docs/adr/effective-flow-project-setup.md`).
- **Title:** an H1 with the descriptive title — `# <Title>` (no `NNNN` prefix).
- **Status:** a `## Status` section holds the current state. Canonical values (English by
  default): `Active`, `Superseded`, `Not implemented`. The former German values `Aktiv`,
  `Abgelöst`, `Nicht umgesetzt` stay recognized when reading an existing ADR.
- **Mutability:** an existing ADR is updated **in place** when the decision changes
  (content and `## Status`), not duplicated or replaced by a successor record.
- **Concurrency:** read the file fresh immediately before writing.

### Referencing

References to ADRs use the **slug or title**, not a number, e.g.
`(ADR: <slug>)`. Slug references stay stable across content changes.

### Backward read compatibility for numbered legacy ADRs

Existing numbered legacy ADRs (`NNNN-*.md`, H1 `# NNNN — Title`) remain **readable and
resolvable by number**. There is **no** mandatory bulk rename; legacy ADRs are not
touched. New ADRs are created exclusively in the living slug format. This mirrors Effective Flow's
established compatibility line (plan numbers via H1, `firmo-`/`effective-flow-` labels).

### Relationship to the `decision-records` skill (declared convention + fallback)

The living slug model described above is the **declared ADR convention of this
repo**. The host skill `decision-records` is the domain owner for ADR craft (whether a
decision is even ADR-worthy, lifecycle, supersession, index); its first
operating rule is to **discover the existing repo convention and follow it**, rather than
enforcing its own. This very building block is that convention — so the skill authors
Effective Flow ADRs in the living slug format (location/file name/title/status/mutability as
above), not in an immutably numbered one.

The layered contract therefore applies (see `skill-discovery.md`):

- **`decision-records` is authoritative when present.** The skill decides **whether** a finding
  is a durable decision and — if so — authors it according to the convention declared here.
  If the target repo declares its **own** ADR convention (different directory,
  title/status format, index), the skill follows that; the living slug model is only the
  default when the repo declares nothing else.
- **Minimal fallback when the skill is absent.** If `decision-records` is unavailable (not
  installed, `skills.enabled: false`, or disabled via `exclude`), the
  calling tool itself authors according to the **minimal fallback structure**
  below — **no** silent invention of a second convention.

Earlier versions of this building block described the slug model as a **deliberate divergence**
from an allegedly immutable/numbered `decision-records` skill. That premise is
outdated: `decision-records` now supports a declared living/mutable model (opt-in)
and follows the repo convention anyway. The living slug model is therefore no longer a
divergence but the declared convention the skill follows.

**Coexistence.** Where a project prefers to run a different ADR model, it declares that
convention in the target repo (the skill follows it) or toggles `decision-records` deliberately via the
`skills` config (`include`/`exclude`, also per-agent/-tool) on or off.

### Minimal fallback structure (only without `decision-records`)

A short core structure so that a calling tool can record a rejected decision as a living
slug ADR even without the skill — **not** a second full ADR handbook. Location
and form as under "Form and location"; read the file fresh before writing and update a
thematically fitting existing ADR in place instead of duplicating:

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
