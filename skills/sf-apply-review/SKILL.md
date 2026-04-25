---
name: sf-apply-review
description: "Liest eine Review-Report-Datei ein, wertet Entwickler-Anmerkungen aus, erstellt ADRs für abgelehnte Findings und delegiert umsetzbare Findings parallel an {{SKILL:sf-fix}}, {{SKILL:sf-refactor}} oder {{SKILL:sf-build-feature}}."
type: orchestrator
---

# SF Apply Review

Du bist der Orchestrator für die automatisierte Umsetzung von Review-Report-Findings.

## Ziel

Dieser Workflow liest eine bestehende Review-Report-Datei aus `docs/review/` ein, wertet die Entwickler-Anmerkungen pro Finding aus und delegiert die Umsetzung an die passenden Workflows. Findings, die bewusst nicht umgesetzt werden sollen, werden als ADRs dokumentiert.

{{INCLUDE:language-rules}}

{{INCLUDE:task-tracking}}

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie früh im Workflow und beachte ihre Vorgaben.

## Fertig-Protokoll

Wenn du interne Sub-Agenten einsetzt, müssen sie mit `ERLEDIGT` oder `ABBRUCH: [Grund]` enden.

Retry-Eskalation:

1. gleicher Auftrag mit Fortsetzungs-Hinweis
2. vereinfachter Auftrag
3. minimaler Auftrag
4. danach User fragen, wie weiter vorzugehen ist

## Wisdom Accumulation

Verwende `.wisdom-accumulation-<SESSION_ID>.tmp.md` für:

- umgesetzte Findings und deren Ergebnis
- fehlgeschlagene Delegationen
- erzeugte ADRs

Schreibe nach jeder Phase ein Summary und gib es an spätere Phasen weiter. Lösche die Datei am Ende.

## Workflow

### Phase 1: Report einlesen und validieren

1. Bestimme die Report-Datei:
   - falls als Argument übergeben: verwende diese Datei
   - sonst: suche nach `review-report-*.md` in `docs/review/`
   - bei mehreren Reports: frage den User welcher verwendet werden soll
   - falls kein Report gefunden: Fehlermeldung und Abbruch
2. **Lies die Datei frisch ein.** Da die Datei zwischen Konversationen gelöscht und neu erstellt werden kann, darf kein zuvor eingelesener Inhalt verwendet werden. Lies die Datei immer direkt vom Dateisystem.
3. Parse alle Findings (`### [R-XXXXXXX] ...`-Blöcke) mit:
   - Finding-ID und Titel
   - Schweregrad
   - Komplexität
   - Aktion (`{{SKILL:sf-fix}}`, `{{SKILL:sf-refactor}}`, `{{SKILL:sf-build-feature}}`)
   - Prompt-Vorschlag
   - Entwickler-Anmerkung (falls vorhanden)
   - Bereits vorhandene Umsetzungshinweise (✅)
4. Klassifiziere jedes Finding:
   - **Bereits umgesetzt:** Finding hat bereits einen ✅-Hinweis → überspringen
   - **Nicht umsetzen:** Entwickler-Anmerkung beginnt mit „Nicht umsetzen" → ADR erstellen
   - **Umsetzen:** Kein ✅-Hinweis und keine ablehnende Anmerkung → an Skill delegieren
   - **Umsetzen mit Kontext:** Entwickler-Anmerkung vorhanden, die nicht mit „Nicht umsetzen" beginnt → an Skill delegieren, Anmerkung als zusätzlichen Kontext mitgeben
5. Gib dem User eine Übersicht:

```markdown
**Report:** [Dateiname]
**Datum:** [Datum aus Report]

| Status | Anzahl |
|---|---|
| Umzusetzen | X |
| Nicht umsetzen (ADR) | Y |
| Bereits umgesetzt | Z |
| Gesamt | N |
```

6. Falls keine umsetzbaren Findings vorhanden sind und keine ADRs zu erstellen sind: Kurzmeldung und Abbruch.

### Phase 2: Commit-Strategie

{{ASK}}
header: Commits
question: Soll jedes Finding einen eigenen Git-Commit bekommen?
options:
  - label: Einzeln
    description: Jedes Finding wird nach Umsetzung einzeln committet
  - label: Keine Commits
    description: Alle Änderungen werden ohne automatische Commits durchgeführt
{{/ASK}}

Halte die Antwort fest und gib sie an jeden delegierten Skill als Anweisung weiter:

- **Einzeln:** Nach jedem abgeschlossenen Finding die Änderungen committen. Verwende als Commit-Message das Format: `fix/refactor/feat: [Finding-ID] [Kurzbeschreibung]`
- **Keine Commits:** Keine automatischen Commits, der User committet selbst.

### Phase 3: ADR-Erstellung

Für jedes Finding mit „Nicht umsetzen"-Anmerkung:

1. Erstelle `docs/adr/` falls nicht vorhanden.
2. Bestimme die nächste freie ADR-Nummer.
3. Erstelle ein ADR-Dokument:

```markdown
# [Nummer] — [Finding-Titel]

## Status

Nicht umgesetzt

## Kontext

Review-Report: [Report-Dateiname], Finding [R-XXXXXXX]
Workflow: /apply-review

## Entscheidung

[Grund aus der Entwickler-Anmerkung]

## Begründung

[Entwickler-Anmerkung vollständig]

## Quell-Finding

[R-XXXXXXX] aus [Report-Dateiname]: [Problem-Beschreibung aus dem Finding]
```

4. Gib dem User eine Statusmeldung über die erstellten ADRs.

### Phase 4: Delegation

1. Gruppiere die umsetzbaren Findings nach Aktion:
   - `{{SKILL:sf-fix}}`: alle Findings mit Aktion fix
   - `{{SKILL:sf-refactor}}`: alle Findings mit Aktion refactor
   - `{{SKILL:sf-build-feature}}`: alle Findings mit Aktion build-feature
2. Starte für jede Aktionsgruppe einen internen Sub-Agenten, der die Findings dieser Gruppe **sequenziell** abarbeitet. Verschiedene Aktionsgruppen dürfen **parallel** laufen.
3. Jeder Sub-Agent erhält:
   - die Finding-Details (ID, Problem, Empfehlung, Prompt-Vorschlag, Datei)
   - die Entwickler-Anmerkung als zusätzlichen Kontext (falls vorhanden)
   - die Commit-Strategie aus Phase 2
   - den Auftrag, den passenden Skill aufzurufen:
     - Findings mit Aktion fix: `Verwende den Skill {{SKILL:sf-fix}} für dieses Finding.`
     - Findings mit Aktion refactor: `Verwende den Skill {{SKILL:sf-refactor}} für dieses Finding.`
     - Findings mit Aktion build-feature: `Verwende den Skill {{SKILL:sf-build-feature}} für dieses Finding.`
   - den Prompt-Vorschlag aus dem Report als Aufgabenbeschreibung
   - das Fertig-Protokoll
4. Prüfe jeden Sub-Agenten auf `ERLEDIGT` oder `ABBRUCH`.
5. Bei `ABBRUCH`: User informieren, Finding als fehlgeschlagen markieren, mit dem nächsten Finding fortfahren.
6. Gib dem User nach jeder abgeschlossenen Aktionsgruppe eine Statusmeldung.

### Phase 5: Report aktualisieren

1. Lies die Report-Datei erneut frisch vom Dateisystem ein. Die Datei könnte sich während der Umsetzung geändert haben.
2. Ergänze an jedem erfolgreich umgesetzten Finding als letzten Eintrag:
   `✅ Umgesetzt am YYYY-MM-DD via {{SKILL:sf-apply-review}}`
3. Ergänze an jedem Finding mit ADR als letzten Eintrag:
   `📋 ADR erstellt am YYYY-MM-DD: [ADR-Dateiname]`
4. Speichere die aktualisierte Report-Datei.

### Phase 6: Finale Validierung

1. Prüfe ob im Projekt ein Validierungs-Script konfiguriert ist (z. B. `agent:check`, `typecheck`, `lint` in `package.json`).
2. Falls vorhanden: führe die verfügbaren Prüfungen aus (z. B. `pnpm agent:check`, `pnpm typecheck`, `pnpm lint`).
3. Falls Errors oder Warnings gefunden werden:
   - behebe alle Errors und Warnings
   - führe die Prüfungen erneut aus
   - wiederhole bis alle Prüfungen fehlerfrei durchlaufen
4. Falls in Phase 2 die Commit-Strategie „Einzeln" gewählt wurde und Fixes nötig waren: committe die Fixes mit einer Commit-Message wie `fix: resolve validation errors from final check`.
5. Falls kein Validierungs-Script vorhanden ist: überspringe diese Phase mit kurzer Meldung.
6. Gib dem User eine kurze Statusmeldung über das Ergebnis.

### Phase 7: Zusammenfassung

1. Lösche die Wisdom-Datei.
2. Gib dem User eine Zusammenfassung:

```markdown
**Apply-Review abgeschlossen**

| Status | Anzahl |
|---|---|
| Erfolgreich umgesetzt | X |
| ADR erstellt | Y |
| Fehlgeschlagen | Z |
| Übersprungen (bereits umgesetzt) | W |

[Falls Findings fehlgeschlagen sind:]
**Fehlgeschlagene Findings:**
- [R-XXXXXXX] [Titel]: [Grund]
```

## Regeln

- Starte verschiedene Aktionsgruppen parallel als Sub-Agenten
- Innerhalb einer Aktionsgruppe: sequenziell abarbeiten
- Die Report-Datei muss beim Start des Skills frisch vom Dateisystem gelesen werden
- Gib dem User nach jeder Phase eine kurze Statusmeldung
- Wenn ein delegierter Skill fehlschlägt: User informieren, nächstes Finding fortsetzen
- Überspringe bereits umgesetzte Findings (mit ✅) ohne Meldung
- Gib internen Sub-Agenten das Fertig-Protokoll vor
- Schreibe nach jeder abgeschlossenen Phase ein Wisdom-Summary
- Dieser Skill vergibt keine neuen Finding-IDs. Falls zukünftig neue Findings erstellt werden sollen, muss `.sf-memory.json` gelesen und aktualisiert werden (siehe `{{SKILL:sf-review}}`)
