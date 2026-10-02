## Canonical bilingual plan contract

Readers map these complete forms to the same internal meanings; writers choose one column and
use it consistently throughout the artifact:

<!-- plan-contract-mapping:start -->

| Meaning              | German                                              | English                                      |
| -------------------- | --------------------------------------------------- | -------------------------------------------- |
| Status, open         | `**Planungsstatus:** Nicht umgesetzt`               | `**Plan status:** Not implemented`           |
| Status, completed    | `**Planungsstatus:** Umgesetzt`                     | `**Plan status:** Implemented`               |
| Source               | `**Quelle:**`                                       | `**Source:**`                                |
| Workflow             | `**Empfohlener Workflow:**`                         | `**Recommended workflow:**`                  |
| Doc category         | `**Doku-Kategorie:**`                               | `**Doc category:**`                          |
| Target path          | `**Ziel-Pfad:**`                                    | `**Target path:**`                           |
| Requirement          | `## Anforderung`                                    | `## Requirement`                             |
| Architecture         | `## Architekturentscheidungen`                      | `## Architecture decisions`                  |
| Affected files       | `## Betroffene Dateien`                             | `## Affected files`                          |
| Implementation       | `## Implementierungsdetails`                        | `## Implementation details`                  |
| Approach             | `### Vorgehen`                                      | `### Approach`                               |
| Component structure  | `### Komponentenstruktur`                           | `### Component structure`                    |
| State management     | `### Zustandsverwaltung`                            | `### State management`                       |
| API integration      | `### API-Integration`                               | `### API integration`                        |
| Styling approach     | `### Styling-Ansatz`                                | `### Styling approach`                       |
| Accessibility        | `### Barrierefreiheit`                              | `### Accessibility`                          |
| Edge cases           | `### Randfälle`                                     | `### Edge cases`                             |
| Acceptance criteria  | `## Akzeptanzkriterien`                             | `## Acceptance criteria`                     |
| Validation plan      | `## Validierungsplan`                               | `## Validation plan`                         |
| Assumptions          | `## Annahmen und offene Punkte`                     | `## Assumptions and open points`             |
| Plan review          | `## Plan-Review`                                    | `## Plan review`                             |
| Review result        | `**Ergebnis:** Freigegeben` / `Überarbeitung nötig` | `**Result:** Approved` / `Revision required` |
| Review summary       | `### Zusammenfassung`                               | `### Summary`                                |
| Plan-review findings | `### Befunde`                                       | `### Findings`                               |
| Open points          | `## Offene Punkte`                                  | `## Open points`                             |
| Empty open points    | `- Keine offenen Punkte.`                           | `- No open points.`                          |
| Test results         | `## Testergebnisse`                                 | `## Test results`                            |
| Review findings      | `## Review-Befunde`                                 | `## Review findings`                         |

<!-- plan-contract-mapping:end -->

Template placeholders are fixed tokens. A German plan renders the German token wherever the
English template shows the English one; a finished plan replaces every token, the review-result
alternatives included, with real content:

<!-- plan-contract-placeholders:start -->

| Placeholder           | German                                                          | English                                                              |
| --------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| Title                 | `[Titel]`                                                       | `[Title]`                                                            |
| Requirement           | `[Anforderung, Ziel und Begründung der Workflow-Empfehlung]`    | `[Requirement, goal, and rationale for the workflow recommendation]` |
| Architecture decision | `[Entscheidung mit Begründung]`                                 | `[Decision with rationale]`                                          |
| Affected file change  | `[geplante Änderung]`                                           | `[planned change]`                                                   |
| Implementation step   | `[konkreter Implementierungsschritt]`                           | `[concrete implementation step]`                                     |
| Optional subsection   | `[Nur falls relevant]`                                          | `[Only if relevant]`                                                 |
| Edge case             | `[Randfall und erwartetes Verhalten]`                           | `[Edge case and expected behavior]`                                  |
| Acceptance criterion  | `[messbares Kriterium]`                                         | `[measurable criterion]`                                             |
| Validation step       | `[geplanter Test, geplante Prüfung oder manuelle Verifikation]` | `[planned test, check, or manual verification]`                      |
| Assumption            | `[Annahme oder bewusst dokumentierter offener Punkt]`           | `[Assumption or deliberately documented remaining point]`            |
| Plan-review finding   | `[Befund mit Bereich, Schweregrad, Problem und Anpassung]`      | `[Finding with area, severity, problem, and adjustment]`             |
| Review result         | `Freigegeben / Überarbeitung nötig`                             | `Approved / Revision required`                                       |

<!-- plan-contract-placeholders:end -->

Tables and finding prose follow the same rule. Plan file tables use `Datei` / `Beschreibung`
and review scorecards use `Bereich` / `Kritisch` / `Wichtig` / `Hinweis` in German; English uses
`File` / `Description` and `Area` / `Critical` / `Important` / `Note`. Review dates, reviewer
labels, summary statuses, and no-findings prose are likewise rendered wholly in the plan
language. Machine-stable values called out below are the only exceptions.

Workflow routing values and skill references remain stable: `Feature`, `Bugfix`, `Refactoring`,
`Documentation`, and the referenced `effective-flow build`/`effective-flow fix`/`effective-flow refactor`/
`effective-flow docs` token are not translated. Doc-category values and target paths likewise remain
`user-guide`, `developer-guide`, `operations`, `runbooks`, and their stable paths.

- A writer must not combine fields or sections from both columns. A mixed plan is unclear and is
  not automatically rewritten. A requested translation converts the complete plan contract.
