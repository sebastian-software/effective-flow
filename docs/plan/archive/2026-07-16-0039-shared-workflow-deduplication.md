# 0039: Shared Workflow Deduplication

**Planungsstatus:** Umgesetzt
**Quelle:** $sf-build
**Empfohlener Workflow:** Refactoring (`$sf-refactor`)

## Anforderung

Die wiederholten Anweisungen für Plan-Referenz-Erkennung, Review-Report-Rückverweise und Fertig-/Retry-Protokoll sollen aus den einzelnen Workflow-Skills in gemeinsame Includes unter `skills/_shared/` verschoben werden.

## Architekturentscheidungen

- Drei neue Shared-Includes bündeln die gemeinsame Mechanik:
  - `completion-protocol.md`
  - `review-report-backlinks.md`
  - `plan-reference-routing.md`
- Die workflow-spezifischen Skills behalten nur noch kurze Hinweise zum erwarteten Workflow und zu ihrer jeweiligen Anschlussphase.
- Bestehende, getestete Speziallogik bleibt dort erhalten, wo sie tatsächlich workflow-spezifisch ist.

## Betroffene Dateien

| Datei                                       | Beschreibung                                                    |
| ------------------------------------------- | --------------------------------------------------------------- |
| `skills/_shared/completion-protocol.md`     | Gemeinsames `ERLEDIGT`-/`ABBRUCH`- und Retry-Protokoll          |
| `skills/_shared/review-report-backlinks.md` | Gemeinsame Regeln für Rückverweise in bestehende Review-Reports |
| `skills/_shared/plan-reference-routing.md`  | Gemeinsame Planauflösung, Statusprüfung und Workflow-Empfehlung |
| `skills/sf-build/SKILL.md`                  | Duplikate durch Includes ersetzen                               |
| `skills/sf-fix/SKILL.md`                    | Duplikate durch Includes ersetzen                               |
| `skills/sf-refactor/SKILL.md`               | Duplikate durch Includes ersetzen                               |
| `skills/sf-docs/SKILL.md`                   | Duplikate durch Includes ersetzen                               |
| `skills/sf-apply-plan/SKILL.md`             | Plan-Routing auf Shared-Regel ausrichten                        |

## Akzeptanzkriterien

- [x] Die drei Shared-Includes existieren.
- [x] `sf-build`, `sf-fix`, `sf-refactor` und `sf-docs` nutzen die Includes.
- [x] `sf-apply-plan` nutzt die Plan-Referenz-Shared-Regel oder verweist darauf ohne doppelte Status-/Workflow-Logik.
- [x] `node build.mjs` und `node --check build.mjs` bestehen.
- [x] Generierte Artefakte enthalten keine untransformierten Platzhalter.

## Validierungsplan

- `node build.mjs`
- `node --check build.mjs`
- `rg -n "\\{\\{INCLUDE:|\\{\\{SKILL:|\\{\\{AGENT:|\\{\\{ASK" dist/codex dist/claude`
- `git diff --check`

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       0 |
| Security    |        0 |       0 |       0 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       0 |       0 |
| Testbarkeit |        0 |       0 |       0 |
| Scope       |        0 |       0 |       0 |
| Wartbarkeit |        0 |       0 |       0 |

### Befunde

- Keine Befunde.

## Testergebnisse

- `node build.mjs` erfolgreich: Codex- und Claude-Code-Artefakte wurden erzeugt.
- `node --check build.mjs` erfolgreich.
- `rg -n "\\{\\{INCLUDE:|\\{\\{SKILL:|\\{\\{AGENT:|\\{\\{ASK" dist/codex dist/claude` ohne Treffer.
- `git diff --check` erfolgreich.

## Review-Findings

Keine Findings gefunden.
