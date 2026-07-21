# Terminology (DE → EN)

Binding bilingual glossary for Effective Flow artifacts. Every German or English plan, review,
or translated instruction uses these canonical terms so writers and readers agree. The target
project's project-setup ADR chooses the language for each communication surface; German and
English remain equally valid artifact languages.

## How to use

- Translate the recurring domain terms exactly as listed here. If a term is missing, pick the
  clearest idiomatic English equivalent, then add it to this table so later phases stay
  consistent.
- Leave **placeholders and directives unchanged**: `{{SKILL:X}}`, `{{AGENT:X}}`, `{{FIRMO}}`,
  ` ```include `, ` ```lazy-include `, ` ```ask ` fences and their `when:` keys keep their
  structure; only the human-readable text is translated.
- Keep proper nouns as-is: **Effective Flow**, **Claude**, **Codex**, tool and agent names
  (`build`, `plan`, `code-validator`, …), label prefixes (`effective-flow-`, `firmo-`, `sf-`).

## Canonical artifact fields (must match exactly)

These strings are matched by build guards, resolvers, or conventions — translate them verbatim
as given, never paraphrased.

| German                                                                 | English                                                         |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| `**Planungsstatus:** Nicht umgesetzt`                                  | `**Plan status:** Not implemented`                              |
| `**Planungsstatus:** Umgesetzt`                                        | `**Plan status:** Implemented`                                  |
| `**Empfohlener Workflow:**`                                            | `**Recommended workflow:**`                                     |
| `**Doku-Kategorie:**`                                                  | `**Doc category:**`                                             |
| `**Ziel-Pfad:**`                                                       | `**Target path:**`                                              |
| `## Anforderung`                                                       | `## Requirement`                                                |
| `## Architekturentscheidungen`                                         | `## Architecture decisions`                                     |
| `## Betroffene Dateien`                                                | `## Affected files`                                             |
| `## Implementierungsdetails`                                           | `## Implementation details`                                     |
| `## Akzeptanzkriterien`                                                | `## Acceptance criteria`                                        |
| `## Validierungsplan`                                                  | `## Validation plan`                                            |
| `## Annahmen und offene Punkte`                                        | `## Assumptions and open points`                                |
| `## Offene Punkte` / `- Keine offenen Punkte.`                         | `## Open points` / `- No open points.`                          |
| `## Plan-Review` · `**Ergebnis:** Freigegeben` / `Überarbeitung nötig` | `## Plan review` · `**Result:** Approved` / `Revision required` |
| `## Zusammenfassung` · `## Befunde`                                    | `## Summary` · `## Findings`                                    |

Note: the German artifact fields stay valid (a plan may be authored in German). The mapping
defines the equivalent English form. A writer selects one column for an entire artifact; it never
mixes columns. Readers accept both columns and normalize them to the same internal meanings.

## Language configuration terms

| German                                | English                          | Configuration key                  |
| ------------------------------------- | -------------------------------- | ---------------------------------- |
| Projektsprache                        | project language                 | `language.project`                 |
| Source-Sprache                        | source language                  | `language.source`                  |
| Sprache der Benutzerdokumentation     | user-documentation language      | `language.documentation.user`      |
| Sprache der technischen Dokumentation | technical-documentation language | `language.documentation.technical` |
| Workflow-Sprache                      | workflow language                | `language.workflow`                |
| Forge-Sprache                         | Forge language                   | `language.forge`                   |
| Git-Sprache                           | Git language                     | `language.git`                     |

The keys and their `de`/`en` values are machine-facing and are never translated. The same applies
to label names, HTML idempotency markers, finding IDs, action values, file paths,
Conventional-Commit types, branch slugs, schemas, and internal runtime/wisdom headings. Visible
headings, field names, and displayed values follow the artifact language; stable routing values
and references do not.

## Recurring domain terms

| German                      | English                                |
| --------------------------- | -------------------------------------- |
| Umsetzung                   | implementation                         |
| Umsetzer                    | implementer                            |
| Verhalten                   | behavior                               |
| Verhaltens-Invarianz        | behavior invariance                    |
| Liefer-Branch               | delivery branch                        |
| Auslieferung / Delivery     | delivery                               |
| Abschluss                   | completion                             |
| Abschlussbedingung          | completion condition                   |
| Baustein / Bausteine        | building block(s) / shared fragment(s) |
| Erkennung                   | detection                              |
| Auflösung                   | resolution                             |
| Freigabe                    | approval                               |
| Klärung                     | clarification                          |
| Klärungs-Gate               | clarification gate                     |
| Entscheidung                | decision                               |
| Delegation                  | delegation                             |
| Konfidenz                   | confidence                             |
| Schweregrad                 | severity                               |
| Komplexität                 | complexity                             |
| Befund / Befunde            | finding / findings                     |
| Grundlage                   | basis                                  |
| Anforderung                 | requirement                            |
| Vorgehen                    | approach                               |
| Abgrenzung                  | scope boundary                         |
| Scope-Gate                  | scope gate                             |
| Rückfrage                   | follow-up question                     |
| Rückwärtskompatibilität     | backward compatibility                 |
| Vorbedingung                | precondition                           |
| Statusmeldung               | status update                          |
| Fortschrittsmeldung         | progress update                        |
| Zusammenfassung             | summary                                |
| Übersicht                   | overview                               |
| Übersprungen / übersprungen | skipped                                |
| Umbenennung                 | rename                                 |
| Wartung                     | maintenance                            |
| Aufgabenverfolgung          | task tracking                          |
| Sichtprüfung                | spot check                             |
| Umgebung                    | environment                            |
| Verzeichnis                 | directory                              |
| Markersprache (legacy)      | marker language (legacy)               |
| Empfohlene Skills           | Recommended skills                     |
| Projektkonventionen         | project conventions                    |
| Ziel                        | goal / target (per context)            |
| Nutzungsabsicht             | usage intent                           |
| Zielgruppe                  | audience                               |

## Doc slugs (planned renames)

German-slugged docs are renamed to English slugs in the documentation phase (`git mv` + update
cross-links and build guards). The binding mapping lives in the migration plan under
`docs/plan/`.
