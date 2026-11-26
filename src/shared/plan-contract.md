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
| Issue                | `**Issue:**`                                        | `**Issue:**`                                 |
| Requirement          | `## Anforderung`                                    | `## Requirement`                             |
| Outcome checkpoint   | `## Ergebnis-Checkpoint`                            | `## Outcome checkpoint`                      |
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
`Documentation`, and the referenced `{{SKILL:build}}`/`{{SKILL:fix}}`/`{{SKILL:refactor}}`/
`{{SKILL:docs}}` token are not translated. Doc-category values and target paths likewise remain
`user-guide`, `developer-guide`, `operations`, `runbooks`, and their stable paths.
The optional `**Issue:** #<N>` header uses a machine-stable label and issue reference in both
languages; it contributes no language evidence and is the last header line, after any Doc category
and Target path fields.

- A writer must not combine fields or sections from both columns. A mixed plan is unclear and is
  not automatically rewritten. A requested translation converts the complete plan contract.

### Single review-result line

The plan-review section, `##` in a plan file and `###` in a planning comment, holds exactly one
review-result line, directly below its heading and followed by the current summary and findings.
A pass is one run of `plan` (its Phase 6 review or a re-planning) or of `plan-review`, interactive
or delegated. At its first write of the section, a pass moves any previous summary and findings
into one history subsection; later writes in the same pass update the current result, summary and
findings in place. The unattended deep review that follows the internal review in the same `plan`
run is its own `plan-review` pass, so the internal review becomes history.

A history subsection sits one level below the section (`###` in a file, `####` in a comment) and
carries its own Summary and Findings one level deeper. Its heading is
`Review history (<YYYY-MM-DD>, <tool>)`, in German `Review-Verlauf (<YYYY-MM-DD>, <tool>)`. The
heading carries the date and tool of the pass that recorded the moved result, or of the superseding
pass when that is unknown. The subsection starts with plain history text that never begins with the
result label: `Result at that time: <value>`, in German `Ergebnis damals: <value>`. History
subsections follow the current Findings, newest first, before the open-points section.

A pass never deletes earlier history and never adds a second result line or a subsection with its
own result line. When the section already holds more than one result line, the writing pass keeps
one current line directly below the heading, placing it there when none sits there, set to the value
this pass decided. The line that supplied that value, the one this pass wrote or the one a caller's
fallback chose, leaves no history entry. Every other line moves into the history form above, even
when its value equals the kept value; when the line directly below the heading did not supply the
kept value, its earlier value becomes the opening `Result at that time:` / `Ergebnis damals:`
line of the history subsection this pass creates at its first write, never a bare line in the
current section.

### Compact outcome checkpoint

New local plans and canonical planning comments include this short section after Requirement
(a planning comment uses `###`); legacy sources remain valid without it. Keep these prose fields
in the artifact language, with no JSON fence or schema. Values name the verified repository/target
and primary reference, original acceptance/safety/support boundaries, evaluated attempt and evidence
delta, cumulative investment/components/remaining proof, and any bounded decision/authorization:

| English                       | German                            |
| ----------------------------- | --------------------------------- |
| `**Primary source:**`         | `**Primäre Quelle:**`             |
| `**Original outcome:**`       | `**Ursprüngliches Ergebnis:**`    |
| `**Last evaluated attempt:**` | `**Zuletzt bewerteter Versuch:**` |
| `**No-progress count:**`      | `**Versuche ohne Fortschritt:**`  |
| `**Cumulative approach:**`    | `**Bisheriger Ansatz:**`          |
| `**Continuation decision:**`  | `**Fortsetzungsentscheidung:**`   |

A fresh baseline has no evaluated attempt, count `0` and no special decision; do not invent costs.
Revisions preserve the original baseline, earlier owner changes and decision reasons. Children
retain their verified parent association rather than independent state. Detailed transitions and
source-write ownership belong only to `shared/outcome-continuation.md`, loaded on continuation,
unknown history or expansion; missing new fields alone never forces a new planning artifact.
