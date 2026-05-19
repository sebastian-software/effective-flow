# 0035: Workflow-Empfehlung in Plan-Dateien

**Planungsstatus:** Umgesetzt
**Quelle:** $sf-build

## Anforderung

`sf-plan` soll in neuen Plan-Dateien empfehlen, ob die Umsetzung als Feature, Refactoring, Dokumentation oder Fix behandelt werden soll. Zusätzlich sollen nicht nur `sf-build`, sondern auch `sf-refactor` und `sf-fix` eine offene Plan-Datei als Grundlage für ihren Workflow verwenden können.

## Architekturentscheidungen

- **Explizite Empfehlung im Plan-Kopf:** Neue Pläne erhalten einen kanonischen Kopfwert `**Empfohlener Workflow:** ...`, damit nachfolgende Skills die passende Ausführungsart schnell erkennen können.
- **Keine harte Kopplung an nur einen Skill:** Der Plan bleibt eine Vorgabe in `docs/plan/`; `sf-build`, `sf-fix` und `sf-refactor` entscheiden anhand ihres eigenen Workflows, wie sie die Vorgabe verwenden.
- **Feature-/Dokumentationspläne bleiben bei `sf-build`:** Für reine Dokumentationsänderungen gibt es keinen eigenen Top-Level-Orchestrator, daher wird `sf-build` als docs-only Implementierungsworkflow empfohlen.
- **Bugfix- und Refactoring-Pläne werden zielgerichtet geroutet:** `sf-build` weist bei referenzierten Plänen mit Empfehlung Bugfix oder Refactoring auf `sf-fix` bzw. `sf-refactor` hin, statt den Feature-Workflow zu erzwingen.

## Betroffene Dateien

| Datei | Beschreibung |
|---|---|
| `skills/sf-plan/SKILL.md` | Workflow-Empfehlung klassifizieren und in neue Plan-Dateien schreiben |
| `skills/sf-build/SKILL.md` | Plan-Referenzen anhand der Empfehlung einordnen |
| `skills/sf-fix/SKILL.md` | Offene Plan-Dateien als Bugfix-Grundlage erlauben |
| `skills/sf-refactor/SKILL.md` | Offene Plan-Dateien als Refactoring-Grundlage erlauben |
| `README.md` | Plan-Empfehlung und nutzende Skills dokumentieren |
| `docs/plan/0035-plan-workflow-recommendation.md` | Audit-Trail dieser Änderung |

## Implementierungsdetails

### Vorgehen

1. `sf-plan` um Workflow-Klassifikation ergänzen:
   - Feature
   - Bugfix
   - Refactoring
   - Dokumentation
2. Plan-Template um `**Empfohlener Workflow:** ...` erweitern.
3. `sf-build` so präzisieren, dass referenzierte offene Pläne mit Empfehlung Bugfix oder Refactoring an den passenden Skill verwiesen werden.
4. `sf-fix` und `sf-refactor` um Plan-Referenz-Erkennung ergänzen:
   - Plan-Datei eindeutig auflösen
   - Statusmarker prüfen
   - passende Empfehlung bevorzugen
   - Planinhalt als Vorgabe für Diagnose bzw. Analyse verwenden
5. README ergänzen.
6. Build ausführen und generierte Codex-/Claude-Artefakte prüfen.

### Komponenten-Struktur

Nicht relevant. Es handelt sich um Skill- und Workflow-Dokumentation.

### State-Management

Nicht relevant.

### API-Anbindung

Nicht relevant.

### Styling-Ansatz

Nicht relevant.

### Barrierefreiheit

Nicht relevant.

### Edge Cases

- Alte Plan-Dateien ohne `**Empfohlener Workflow:**` bleiben nutzbar; der ausführende Skill darf anhand des Inhalts fortfahren oder nachfragen.
- Ein Bugfix-Plan, der versehentlich über `sf-build` aufgerufen wird, soll nicht still als Feature umgesetzt werden.
- Ein Refactoring-Plan, der über `sf-fix` aufgerufen wird, soll nicht still als Bugfix behandelt werden.
- Dokumentationspläne können über `sf-build` umgesetzt werden, müssen aber als docs-only Scope behandelt werden.

## Akzeptanzkriterien

- [x] Neue Pläne enthalten eine Empfehlung für Feature, Bugfix, Refactoring oder Dokumentation.
- [x] `sf-plan` beschreibt, wie die Empfehlung zu wählen ist.
- [x] `sf-build` berücksichtigt die Empfehlung bei Plan-Referenzen.
- [x] `sf-fix` kann eine offene Plan-Datei als Bugfix-Vorgabe verwenden.
- [x] `sf-refactor` kann eine offene Plan-Datei als Refactoring-Vorgabe verwenden.
- [x] Alte Pläne ohne Empfehlung bleiben handhabbar.

## Validierungsplan

- `node build.mjs`
- `node --check build.mjs`
- Suche nach eingebetteter Workflow-Empfehlung in generierten `sf-plan`-Artefakten.
- Suche nach Plan-Referenz-Regeln in generierten `sf-build`, `sf-fix` und `sf-refactor`-Artefakten.
- Prüfen, dass keine untransformierten Platzhalter in `dist/` verbleiben.

## Annahmen und offene Punkte

- Annahme: Es soll kein eigener Top-Level-Workflow nur für Dokumentationsänderungen eingeführt werden.
- Annahme: Der neue Plan-Kopfwert ist optional für alte Pläne und verpflichtend für neu erzeugte Pläne.

## Testergebnisse

- `node build.mjs` erfolgreich ausgeführt. Ergebnis: Codex 9 Skills und 9 Agents, Claude Code 9 Commands und 9 Agents.
- `node --check build.mjs` erfolgreich ausgeführt.
- Gezielt geprüft, dass `Empfohlener Workflow` in den generierten `sf-plan`-Artefakten enthalten ist.
- Gezielt geprüft, dass Plan-Referenz-Regeln in den generierten `sf-build`, `sf-fix` und `sf-refactor`-Artefakten enthalten sind.
- `rg` gegen `dist/codex` und `dist/claude` fand keine untransformierten `{{INCLUDE:...}}`, `{{SKILL:...}}`, `{{AGENT:...}}` oder `{{ASK}}`-Platzhalter.

## Review-Findings

**Datum:** 2026-05-19
**Reviewer:** lokal

### Zusammenfassung

| Schweregrad | Anzahl | Behoben | Offen |
|---|---:|---:|---:|
| Kritisch | 0 | 0 | 0 |
| Wichtig | 0 | 0 | 0 |
| Hinweis | 0 | 0 | 0 |

| Komplexität | Anzahl |
|---|---:|
| Leicht | 0 |
| Mittel | 0 |
| Schwer | 0 |

### Findings

Keine Findings gefunden.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich | Kritisch | Wichtig | Hinweis |
|---|---:|---:|---:|
| Architektur | 0 | 0 | 0 |
| Security | 0 | 0 | 0 |
| Datenschutz | 0 | 0 | 0 |
| Fehlerfälle | 0 | 0 | 0 |
| Testbarkeit | 0 | 0 | 0 |
| Scope | 0 | 0 | 0 |
| Wartbarkeit | 0 | 0 | 0 |

### Befunde

- Keine Befunde.
