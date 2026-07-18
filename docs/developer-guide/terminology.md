# Terminology (DE → EN)

Binding glossary for the German → English migration of Effective Flow (see the migration plan
under `docs/plan/`). Every translation of source instructions or documentation uses these
canonical terms so the wording stays consistent across all ~84 files. English is the default
language; German remains a permitted project and marker language.

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

| German                                                          | English                                              |
| --------------------------------------------------------------- | ---------------------------------------------------- |
| `**Planungsstatus:** Nicht umgesetzt`                           | `**Plan status:** Not implemented`                   |
| `**Planungsstatus:** Umgesetzt`                                 | `**Plan status:** Implemented`                       |
| `**Empfohlener Workflow:**`                                     | `**Recommended workflow:**`                          |
| `**Doku-Kategorie:**`                                           | `**Doc category:**`                                  |
| `**Ziel-Pfad:**`                                                | `**Target path:**`                                   |
| `## Anforderung`                                                | `## Requirement`                                     |
| `## Architekturentscheidungen`                                  | `## Architecture decisions`                          |
| `## Betroffene Dateien`                                         | `## Affected files`                                  |
| `## Implementierungsdetails`                                    | `## Implementation details`                          |
| `## Akzeptanzkriterien`                                         | `## Acceptance criteria`                             |
| `## Validierungsplan`                                           | `## Validation plan`                                 |
| `## Annahmen und offene Punkte`                                 | `## Assumptions and open points`                     |
| `## Offene Punkte` / `- Keine offenen Punkte.`                  | `## Open Points` / `- No open points.`               |
| `## Plan-Review` · `**Ergebnis:** Freigegeben` / `Überarbeiten` | `## Plan review` · `**Result:** Approved` / `Revise` |
| `## Zusammenfassung` · `## Befunde`                             | `## Summary` · `## Findings`                         |

Note: the German artifact fields stay valid (a plan may be authored in German). The mapping
defines the English default form.

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
| Markersprache               | marker language                        |
| Empfohlene Skills           | Recommended skills                     |
| Projektkonventionen         | project conventions                    |
| Ziel                        | goal / target (per context)            |
| Nutzungsabsicht             | usage intent                           |
| Zielgruppe                  | audience                               |

## Doc slugs (planned renames)

German-slugged docs are renamed to English slugs in the documentation phase (`git mv` + update
cross-links and build guards). The binding mapping lives in the migration plan under
`docs/plan/`.
