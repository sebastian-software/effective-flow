# 0015: Apply-Review-Skill — Automatisierte Umsetzung von Review-Report-Findings

## Anforderung

Neuer Orchestrator-Skill `sf-apply-review`, der eine bestehende Review-Report-Datei einliest, Entwickler-Anmerkungen pro Finding auswertet und die Umsetzung an bestehende Skills delegiert. Findings, die bewusst nicht umgesetzt werden sollen, werden als ADRs dokumentiert. Der Report wird um ein Feld `Entwickler-Anmerkung` erweitert, das der Entwickler vorab befüllt.

## Architekturentscheidungen

### Vorab-Annotation statt interaktiver Abfrage

Der Entwickler editiert die Review-Report-Datei vor dem Skill-Start und trägt Anmerkungen direkt im Report ein. Der Skill fragt nicht interaktiv pro Finding.

**Begründung:** Ermöglicht dem Entwickler, alle Findings in Ruhe zu bewerten, bevor der automatisierte Prozess startet.

### Delegation an bestehende Skills

Der Skill implementiert Findings nicht selbst, sondern delegiert an `sf-fix`, `sf-refactor` und `sf-build-feature` — je nach `Aktion`-Feld im Finding.

**Begründung:** Vermeidet Duplikation der Workflow-Logik und nutzt die bewährten Fach-Workflows.

### Parallele Ausführung nach Aktionsgruppe

Findings werden nach Aktion gruppiert. Verschiedene Aktionsgruppen laufen parallel als Sub-Agenten, innerhalb einer Gruppe sequenziell.

**Begründung:** Maximiert Parallelisierung, vermeidet aber Konflikte bei Findings, die denselben Workflow nutzen.

### Frisches Einlesen nur beim Skill-Start

Die Report-Datei wird beim Start des Skills frisch vom Dateisystem gelesen, nicht zwischen den Phasen. Grund: Die Datei kann zwischen Konversationen gelöscht und neu erstellt werden.

### Commit-Strategie als User-Entscheidung

Vor der Umsetzung wird gefragt, ob jedes Finding einen eigenen Git-Commit bekommen soll.

## Betroffene Dateien

| Datei                             | Beschreibung                                                  |
| --------------------------------- | ------------------------------------------------------------- |
| `skills/sf-apply-review/SKILL.md` | Neuer Orchestrator-Skill                                      |
| `skills/sf-review/SKILL.md`       | Review-Report-Format um `Entwickler-Anmerkung`-Feld erweitert |

## Implementierungsdetails

### Neues Feld im Review-Report-Format

```markdown
- **Entwickler-Anmerkung**: <!-- leer lassen, Freitext, oder „Nicht umsetzen: [Grund]" -->
```

Konvention:

- Leer oder fehlend: Finding wird umgesetzt
- Freitext: Finding wird umgesetzt, Text als Kontext weitergegeben
- „Nicht umsetzen: [Grund]": Finding wird übersprungen, ADR wird erstellt

### Skill-Workflow

1. Report einlesen und Findings klassifizieren
2. Commit-Strategie abfragen
3. ADRs für abgelehnte Findings erstellen
4. Umsetzbare Findings parallel nach Aktionsgruppe delegieren
5. Report mit Umsetzungshinweisen aktualisieren
6. Zusammenfassung ausgeben

## Testergebnisse

Build erfolgreich mit 7 Skills und 9 Agents. Placeholder-Transformation korrekt.

## Review-Findings und deren Behebung

| Finding                                              | Schweregrad | Status                                                                                                                                   |
| ---------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `Entwickler-Anmerkung`-Feld ohne Formathinweis       | Wichtig     | Behoben — HTML-Kommentar als Platzhalter ergänzt                                                                                         |
| ASK-Block mit Ja/Nein statt beschreibenden Labels    | Wichtig     | Behoben — auf Einzeln/Keine Commits umgestellt                                                                                           |
| `sf-review` nutzt nicht `{{INCLUDE:language-rules}}` | Kritisch    | Behoben — zentrale Sprachregeln mit `docs/plan/0013-central-language-rules.md` eingeführt; `skills/sf-review/SKILL.md` nutzt den Include |
