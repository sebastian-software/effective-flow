# 0007 — File-Splitting statt Zeilen-Eindampfen bei zu langen Dateien

## Anforderung

Wenn beim Ueberpruefen des Codes festgestellt wird, dass eine Datei zu viele Zeilen hat (z.B. durch Linting-Rules wie `max-lines`), soll nicht versucht werden Zeilen einzudampfen oder Kommentare zu loeschen. Lesbarkeit ist oberstes Ziel. Stattdessen soll die Datei in mehrere logisch zusammenhaengende Dateien aufgesplittet werden.

## Architekturentscheidungen

### Regel in allen code-schreibenden und code-bewertenden Agents

Die Regel wurde in alle 6 relevanten Agents eingefuegt — nicht nur in die Implementer. Dadurch ist sichergestellt, dass die Philosophie "Splitting statt Komprimierung" durchgaengig im gesamten Workflow gilt.

**Begruendung:** Wenn nur die Implementer die Regel kennen, koennten Reviewer-Agents trotzdem "Kommentare kuerzen" als Loesung vorschlagen — was dann zu einem Widerspruch fuehrt.

### Kontextspezifische Splitting-Beispiele

Die Beispiele fuer sinnvolle Splitting-Ziele sind an den jeweiligen Agent-Kontext angepasst:
- Frontend: Komponente, Hook, Utility, Types, Constants
- Backend: Routes, Services, Validators, Types, Constants, Middleware
- Tests: Pro Feature, pro Komponente, Unit vs. Integration

### Validator als Empfehler, nicht als Fixer

Der code-validator bekommt nur einen Hinweis fuer die Loesungs-Empfehlung, nicht die volle Regel. Er fixt nicht selbst.

## Betroffene Dateien

| Datei | Aenderung |
|---|---|
| `sf-frontend-workflows/agents/ui-implementer.md` | Neue Section "Dateilaenge und Lesbarkeit" |
| `sf-frontend-workflows/agents/nodejs-implementer.md` | Gleiche Section, Backend-spezifische Beispiele |
| `sf-frontend-workflows/agents/code-validator.md` | Neue Regel fuer File-Length-Finding-Empfehlungen |
| `sf-frontend-workflows/agents/frontend-reviewer.md` | Neue Regel in Regeln-Section |
| `sf-frontend-workflows/agents/nodejs-reviewer.md` | Neue Regel in Regeln-Section |
| `sf-frontend-workflows/agents/test-writer.md` | Neue Regel in Regeln-Section |

## Review-Findings

| Finding | Status |
|---|---|
| Fehlende Regel in frontend-reviewer.md und nodejs-reviewer.md (Wichtig) | Behoben |
| Fehlende Regel in test-writer.md (Wichtig) | Behoben |
