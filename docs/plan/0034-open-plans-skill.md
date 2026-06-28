# 0034: Offene Pläne auflisten

**Planungsstatus:** Umgesetzt
**Quelle:** $sf-build

## Anforderung

Ein neuer Skill soll alle noch nicht umgesetzten Plan-Dateien in `docs/plan/` mit kurzer Zusammenfassung ausgeben. Zusätzlich soll der Marker für nicht umgesetzte Pläne stabilisiert werden, damit neue und bestehende Workflows nicht versehentlich andere „Nicht umgesetzt"-Vorkommen in Review-Findings oder Fließtext als Planstatus interpretieren.

## Architekturentscheidungen

- **Neuer Utility-Skill `sf-open-plans`:** Die Funktion ist ein lesender Hilfsbefehl und gehört daher als `type: utility` in ein eigenes Skill-Verzeichnis.
- **Kanonischer Planstatus als Shared Include:** Die Statusregeln werden in `skills/_shared/plan-status.md` zentral dokumentiert und in `sf-plan`, `sf-build` und `sf-open-plans` eingebunden.
- **Exakte Statuszeile statt Freitextsuche:** Nur die erste Zeile mit Präfix `**Planungsstatus:**` bestimmt den Planstatus. Damit zählen Review-Finding-Status wie „Nicht umgesetzt" nicht als offener Plan.
- **Unklare Pläne separat melden:** Alte Pläne ohne Statusmarker werden nicht automatisch als offen gewertet, sondern als „Status unklar" ausgegeben.

## Betroffene Dateien

| Datei                                | Beschreibung                                                            |
| ------------------------------------ | ----------------------------------------------------------------------- |
| `skills/_shared/plan-status.md`      | Neue zentrale Planstatus-Konvention                                     |
| `skills/sf-open-plans/SKILL.md`      | Neuer Utility-Skill zum Auflisten offener Pläne                         |
| `skills/sf-plan/SKILL.md`            | Kanonischen Statusmarker als Plan-Erzeugungsvertrag eingebunden         |
| `skills/sf-build/SKILL.md`           | Plan-Referenz- und Abschlusslogik auf kanonische Statuszeile präzisiert |
| `README.md`                          | `sf-open-plans` und Planstatus-Konvention dokumentiert                  |
| `build.mjs`                          | Marketplace-Beschreibung um `open-plans` ergänzt                        |
| `docs/plan/0034-open-plans-skill.md` | Audit-Trail dieser Änderung                                             |

## Implementierungsdetails

### Vorgehen

1. `skills/_shared/plan-status.md` mit den exakten Markern `**Planungsstatus:** Nicht umgesetzt` und `**Planungsstatus:** Umgesetzt` erstellen.
2. `sf-plan` so präzisieren, dass neue Plan-Dateien den offenen Marker exakt setzen.
3. `sf-build` so präzisieren, dass Plan-Referenzen und Abschluss nur die kanonische Statuszeile auswerten bzw. ersetzen.
4. `sf-open-plans` als Utility-Skill erstellen:
   - `docs/plan/*.md` lesen
   - offene Pläne über den exakten Marker finden
   - Kurzfassung aus `## Anforderung` ableiten
   - unklare Status separat melden
5. README und Marketplace-Beschreibung aktualisieren.
6. Build ausführen und generierte Codex-/Claude-Artefakte auf `sf-open-plans` und eingebettete Planstatus-Regeln prüfen.

### Komponenten-Struktur

Nicht relevant. Es handelt sich um Skill- und Build-Dokumentation ohne Runtime-Komponenten.

### State-Management

Nicht relevant. Der neue Skill liest ausschließlich lokale Plan-Dateien und speichert keinen Zustand.

### API-Anbindung

Nicht relevant.

### Styling-Ansatz

Nicht relevant.

### Barrierefreiheit

Nicht relevant.

### Edge Cases

- `docs/plan/` fehlt oder enthält keine Markdown-Dateien: `sf-open-plans` meldet das knapp.
- Plan-Datei enthält keinen Statusmarker: als „Status unklar" melden, nicht als offen.
- Plan-Datei enthält mehrere Statusmarker: als „Status unklar" melden.
- Plan-Datei enthält „Nicht umgesetzt" nur in Review-Findings: nicht als offen zählen.
- `## Anforderung` fehlt: H1-Titel als Zusammenfassungs-Fallback verwenden.

## Akzeptanzkriterien

- [x] Es gibt einen neuen Utility-Skill `sf-open-plans`.
- [x] `sf-open-plans` listet nur Pläne mit exakter Statuszeile `**Planungsstatus:** Nicht umgesetzt` als offen.
- [x] `sf-open-plans` gibt pro offenem Plan eine kurze Zusammenfassung aus.
- [x] Pläne mit fehlendem oder widersprüchlichem Status werden separat als „Status unklar" behandelt.
- [x] `sf-plan` und `sf-build` verwenden die zentrale Planstatus-Konvention.
- [x] README dokumentiert den neuen Skill und die Statusmarker-Regel.

## Validierungsplan

- `node build.mjs`
- `node --check build.mjs`
- Suche nach generiertem `sf-open-plans` in Codex und Claude.
- Suche nach eingebetteter Planstatus-Konvention in generierten Skills.
- Prüfen, dass keine untransformierten Includes in `dist/` verbleiben.

## Annahmen und offene Punkte

- Annahme: Alte Plan-Dateien ohne Statusmarker sollen nicht automatisch als offen gelten, weil ältere Dateien häufig bereits umgesetzt sind und Review-Findings ebenfalls „Nicht umgesetzt" enthalten können.
- Offener Punkt: Eine spätere Migration könnte historische Plan-Dateien nachträglich mit Statusmarkern versehen. Diese Änderung ist bewusst nicht Teil dieses Features.

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

- `node build.mjs` erfolgreich ausgeführt. Ergebnis: Codex 9 Skills und 9 Agents, Claude Code 9 Commands und 9 Agents.
- `node --check build.mjs` erfolgreich ausgeführt.
- `rg` gegen `dist/codex` und `dist/claude` fand keine untransformierten `{{INCLUDE:...}}`, `{{SKILL:...}}`, `{{AGENT:...}}` oder `{{ASK}}`-Platzhalter.
- Gezielt geprüft, dass `dist/codex/skills/sf-open-plans/SKILL.md` und `dist/claude/sf-claude-plugin/plugins/sf-frontend-workflows/commands/open-plans.md` erzeugt wurden.
- Gezielt geprüft, dass die Planstatus-Konvention in den generierten `sf-plan`, `sf-build` und `sf-open-plans`-Artefakten enthalten ist.
- Statische Marker-Prüfung mit `rg` zeigt aktuell als offenen Plan nur `docs/plan/0033-gemini-cli-platform-target.md`.

## Review-Findings

**Datum:** 2026-05-15
**Reviewer:** lokal

### Zusammenfassung

| Schweregrad | Anzahl | Behoben | Offen |
| ----------- | -----: | ------: | ----: |
| Kritisch    |      0 |       0 |     0 |
| Wichtig     |      0 |       0 |     0 |
| Hinweis     |      0 |       0 |     0 |

| Komplexität | Anzahl |
| ----------- | -----: |
| Leicht      |      0 |
| Mittel      |      0 |
| Schwer      |      0 |

### Findings

Keine Findings gefunden.
