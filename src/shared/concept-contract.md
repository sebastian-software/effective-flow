## Concept artifact contract

Concepts describe **what application to build at all** — one step before an implementation plan.
This fragment is the single source of truth for where a concept lives, how it is named, which
status it carries, and which sections it consists of.

### Concept directory

`<concept.dir>` is the concept directory from the Effective Flow configuration (project-setup ADR)
`concept.dir` (default `docs/concept`). Concepts are project documentation and are committed like
plans; they are not runtime state.

- Create `<concept.dir>/` on the first write if it is missing.
- `<concept.dir>` and `<plan.dir>` must be **separate directories**, compared as canonical paths
  rather than as configured strings. Resolve both against the repository root and physically
  canonicalize them — resolving symlinks, `.`, `..`, trailing separators, and platform case
  behaviour — before comparing, so aliases such as `docs/plan`, `./docs/plan`, and `docs/plan/`
  cannot pass as different directories. Reject a configuration where the two resolve to the same
  directory **or** where one contains the other: a concept directory nested inside the plan
  directory would be enumerated by the plan resolvers, which is exactly the boundary this
  separation protects. Report both configured values with their resolved paths, abort instead of
  guessing, and refer the user to `{{SKILL:setup}}`.
- Concepts have no archive and no implemented state. A concept hands off to plans; the plan
  lifecycle owns implementation status.

### Concept file convention

- File name: `<concept.dir>/YYYY-MM-DD-<slug>.md`. `YYYY-MM-DD` is the creation date (ISO, e.g.
  from `date +%F`); `<slug>` is a kebab-case slug derived from the concept title (only `a–z`,
  `0–9`, hyphen).
- **No reservation, no stub, no number.** The file is written under its final name when the
  concept is actually written.
- **Name collision on the same day:** append a numeric suffix (`YYYY-MM-DD-<slug>-2.md`, `-3`, …).
  Never overwrite silently.
- The concept's H1 is the title without a number: `# <Title>`.
- Resolve a concept reference from a full path, the date-slug file name, or the title slug, and
  search only `<concept.dir>/`. If more than one file matches, ask; never heuristically pick the
  newest. A bare four-digit value is never a concept reference — it stays a legacy plan reference.

### Concept status convention

Concept files use exactly one canonical status marker in their header. The marker may be written in
either German or English:

- draft (German): `**Konzeptstatus:** Entwurf`
- elaborated (German): `**Konzeptstatus:** Ausgearbeitet`
- draft (English): `**Concept status:** Draft`
- elaborated (English): `**Concept status:** Elaborated`

Both marker forms are equivalent. Only one language is used per concept file. The marker is not an
independent language choice: it is part of the complete concept language resolved by "Language
resolution" (`language.workflow` for a new concept, or the preserved language of an existing one).

Rules:

- Write the status marker exactly as in the four canonical examples above, including bold, colon,
  and the capitalization of the marker keys and values.
- The concept status only applies when exactly one line with the prefix `**Konzeptstatus:**` or
  `**Concept status:**` is present. Multiple status lines (even in different languages) make the
  status unclear.
- The only valid value pairs are the four key-value combinations listed above. Mixed forms of a
  German key and an English value or vice versa are **not** valid.
- Other occurrences of „Entwurf“, „Ausgearbeitet“, "Draft", or "Elaborated" in review findings or
  body text do not count as a concept status.
- If the marker is missing, occurs multiple times, contains an invalid value, or uses a mixed form,
  the concept status is unclear. Do not automatically treat the concept as draft or elaborated.
- `Ausgearbeitet`/`Elaborated` is set only by the deep concept review, and only when no critical
  finding and no blocking open point remains.

### Bilingual field and section mapping

A concept uses one language throughout: status, header fields, sections, review prose, and open
points all use one column. Stable workflow values, skill references, and paths are not translated.

| Element             | German                                                            | English                                                  |
| ------------------- | ----------------------------------------------------------------- | -------------------------------------------------------- |
| Status field        | `**Konzeptstatus:**`                                              | `**Concept status:**`                                    |
| Source field        | `**Quelle:**`                                                     | `**Source:**`                                            |
| Problem section     | `## Problem und Motivation`                                       | `## Problem and motivation`                              |
| Users section       | `## Zielgruppen und Anwendungsfälle`                              | `## Target users and use cases`                          |
| Solution section    | `## Lösungsskizze`                                                | `## Solution sketch`                                     |
| Scope section       | `## Umfang`                                                       | `## Scope`                                               |
| In-scope subsection | `### Im Umfang (erste Version)`                                   | `### In scope (first version)`                           |
| Non-goals           | `### Nicht-Ziele`                                                 | `### Non-goals`                                          |
| Technical direction | `## Technische Richtung`                                          | `## Technical direction`                                 |
| Risks section       | `## Risiken und offene Fragen`                                    | `## Risks and open questions`                            |
| Roadmap section     | `## Roadmap und Arbeitspakete`                                    | `## Roadmap and work packages`                           |
| Review section      | `## Konzept-Review`                                               | `## Concept review`                                      |
| Review result       | `**Ergebnis:** Freigegeben` / `**Ergebnis:** Überarbeitung nötig` | `**Result:** Approved` / `**Result:** Revision required` |
| Open points         | `## Offene Punkte`                                                | `## Open points`                                         |
| Open-points empty   | `- Keine offenen Punkte.`                                         | `- No open points.`                                      |

Review summary areas, in this order: Produktpassung / Product fit, Umfang / Scope,
Technische Machbarkeit / Technical feasibility, Daten und Sicherheit / Data and security,
Risiken / Risks, Roadmap / Roadmap.

### Structural template (English form)

For `de`, render the complete German mapping above, including table headings and review prose; do
not partially translate this example.

```markdown
# [Concept title]

**Concept status:** Draft
**Source:** {{SKILL:concept}}

## Problem and motivation

[Which problem, for whom, and why it is worth solving]

## Target users and use cases

- [User group: the two or three use cases that matter most]

## Solution sketch

[What the application is, in a few paragraphs — recognizable, not specified]

## Scope

### In scope (first version)

- [Capability that the first usable version must have]

### Non-goals

- [Deliberately excluded, with a one-line reason]

## Technical direction

[Platform, stack candidates with a short rationale, coarse architecture, external systems, data
outline. Direction, not design.]

## Risks and open questions

- [Risk or open question and what it would affect]

## Roadmap and work packages

- Not elaborated yet (see `{{SKILL:review}} <concept-file>`).

## Concept review

**Result:** Not reviewed in depth yet

## Open points

- No open points.
```

### Roadmap section contract

The `## Roadmap and work packages` section is written by the deep concept review, not by the
initial concept.

- While the status is `Draft`, the section carries exactly one bullet: the empty state from the
  template above, which names the re-entry `{{SKILL:review}} <concept-file>`. The German form reads
  "Noch nicht ausgearbeitet" and names the same re-entry with `<Konzeptdatei>`.
- An elaborated concept lists ordered work packages. Each package names its goal, its rough scope,
  what would make it done, its dependencies on other packages, and one ready-to-paste handoff.
- The handoff is **self-contained text**: a complete `{{SKILL:plan}}` call whose requirement string
  names the work package and the concept file, so the planning workflow receives the context
  without any coupling between the two tools. Neither concept workflow creates, reads, or updates a
  plan file, and the concept keeps no list of the plans derived from it.

### ADR candidates

Durable decisions recorded in a concept are marked as ADR candidates with a one-line rationale so
the developer can decide later. Neither concept workflow writes an ADR, and neither asks for one.
