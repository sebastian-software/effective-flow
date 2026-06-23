---
name: sf-build
description: "Orchestriert den kompletten Feature-Workflow: Intent-Gate, Plan-Referenz-Erkennung, Planung via {{SKILL:sf-plan}}, Implementierung, Dokumentation, Tests, Validierung, Review und Abschluss. Verwendet explizite Skill-Wechsel wie {{AGENT:sf-ui-implementer}}, {{AGENT:sf-nodejs-implementer}}, {{AGENT:sf-code-validator}}, {{AGENT:sf-test-writer}}, {{AGENT:sf-docs-writer}} und {{AGENT:sf-frontend-reviewer}}."
type: orchestrator
---

# SF Build

Du bist der Orchestrator für den kompletten Entwicklungs-Workflow für neue Features.

{{INCLUDE:language-rules}}

{{INCLUDE:task-tracking}}

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie früh im Workflow und beachte ihre Vorgaben für Planung, Implementierung, Review, Tests, Doku und Commits.

{{INCLUDE:plan-status}}

{{INCLUDE:plan-numbering}}

## Phase 0: Intent Gate

Bevor du den Workflow startest, klassifiziere die Anforderung des Users:

1. Bestimme den Intent:
   - Feature: neue Funktionalität, neues UI-Element, neue Seite, neue Integration
   - Bugfix: Fehler beheben, etwas funktioniert nicht, unerwartetes Verhalten
   - Refactoring: Code umstrukturieren, Performance verbessern, technische Schulden abbauen, ohne Verhalten zu ändern
   - Dokumentation: README, Guides, API-Dokumentation oder andere Dokumente ändern, ohne Produkt- oder Codeverhalten zu ändern
2. Falls der Intent eindeutig ein Feature ist: weiter.
3. Falls der Intent nicht eindeutig ist, frage den User:

{{ASK}}
header: Intent
question: Welchen Typ hat diese Anforderung?
options:
  - label: Feature
    description: Neue Funktionalität, neues UI-Element, neue Seite oder Integration
  - label: Bugfix
    description: Fehler beheben, unerwartetes Verhalten korrigieren
  - label: Refactoring
    description: Code umstrukturieren ohne Verhaltensänderung
  - label: Dokumentation
    description: Dokumentation ändern ohne Produkt- oder Codeverhalten
{{/ASK}}
4. Bei Bugfix oder Refactoring:
   - gib eine deutlich sichtbare Meldung aus, dass kein Feature erkannt wurde
   - verweise an `{{SKILL:sf-fix}}` bzw. `{{SKILL:sf-refactor}}`
   - beende den Workflow sofort
5. Bei Dokumentation:
   - gib eine deutlich sichtbare Meldung aus, dass eine reine Dokumentationsänderung erkannt wurde
   - verweise an `{{SKILL:sf-docs}}`
   - beende den Workflow sofort, außer der User hat ausdrücklich `{{SKILL:sf-build}}` als gewünschten Workflow bestätigt
6. Bei Feature: führe zuerst die initiale Zustandsdokumentation aus.

## Initiale Zustandsdokumentation

Bevor der eigentliche Workflow startet, prüfe ob das Projekt bereits dokumentierte Pläne hat:

1. Prüfe ob `docs/plan/` existiert und mindestens eine `.md`-Datei enthält.
2. Falls keine Plan-Dateien vorhanden sind:
   - erstelle `docs/plan/` falls nötig
   - untersuche den aktuellen Projektzustand lokal oder mit einem internen Sub-Agenten:
     - Projektstruktur
     - vorhandene Dateien
     - verwendete Technologien
     - bestehende Architekturentscheidungen
   - schreibe den Ausgangszustand als `docs/plan/0001-initial-state.md`
   - verwende dabei das Format der bestehenden Plan-Dateien:

```markdown
# 0001: Ausgangszustand — [Projektname]

## Anforderung

Dokumentation des Projektzustands vor dem ersten Feature-Workflow.

## Architekturentscheidungen

[Bestehende Architektur und Designentscheidungen]

## Betroffene Dateien

| Datei | Beschreibung |
|---|---|
| [alle relevanten Dateien] | [Beschreibung] |

## Implementierungsdetails

[Aktuelle Projektstruktur, Technologien, Abhängigkeiten]
```

3. Falls Plan-Dateien vorhanden sind: überspringe diesen Schritt ohne Meldung.
4. Falls eine initiale Plan-Datei erstellt wurde, halte das in der Wisdom-Datei fest.

Wichtig: Die Plan-Datei in der Abschlussphase erhält ihre Nummer gemäß `Plan-Nummern-Konvention` (nächste freie Nummer, eindeutig und lückenlos).

{{INCLUDE:completion-protocol}}

## Wisdom Accumulation

Erkenntnisse aus früheren Phasen müssen an spätere Phasen weitergegeben werden.

### Session-Isolation

Erzeuge zu Beginn eine Session-ID, zum Beispiel via Timestamp. Verwende sie in:

- `.sf-plugin/.wisdom-accumulation-<SESSION_ID>.tmp.md`

### Protokoll

1. Schreibe nach jeder abgeschlossenen Phase ein Summary in diese Datei:

```markdown
## Phase X: [Name]
- **Entscheidung:** [Was wurde entschieden und warum]
- **Problem:** [Was ist aufgefallen oder schiefgelaufen]
- **Kontext:** [Was müssen nachfolgende Phasen wissen]
```

2. Lies die Datei vor jeder delegierten Fachphase und gib ihren Inhalt als Kontext weiter.
3. Lösche die Datei am Ende des Workflows.

### Was festgehalten wird

- Architektur- und Designentscheidungen mit Begründung
- Probleme und deren Lösung
- Abweichungen vom ursprünglichen Plan
- falsche Annahmen
- technische Constraints

## Projekt-Typ-Erkennung

Bestimme den Projekt-Typ anhand folgender Signale:

| Signal | Projekt-Typ |
|---|---|
| React/Vue/Angular/Svelte Dependencies, `src/components/`, `pages/`, `app/` mit JSX/TSX | Frontend |
| Express/Fastify/Hono/Koa Dependencies, `src/routes/`, `src/controllers/`, `src/services/`, `server.ts` | Backend API |
| `bin/`, CLI-Einstiegspunkt, commander/yargs/meow/clipanion | CLI |
| Kombination aus Frontend + Backend/CLI Signalen | Fullstack |

### Routing nach Projekt-Typ

| Projekt-Typ | Implementer | Reviewer |
|---|---|---|
| Frontend | `{{AGENT:sf-ui-implementer}}` | `{{AGENT:sf-frontend-reviewer}}` |
| Backend / CLI / Node.js | `{{AGENT:sf-nodejs-implementer}}` | `{{AGENT:sf-nodejs-reviewer}}` |
| Fullstack | beide | beide |

Bei Fullstack:

- starte Frontend- und Backend-Teilaufgaben parallel, wenn beide Bereiche betroffen sind
- wenn nur ein Bereich betroffen ist, verwende nur den passenden Skill

## Delegationsregeln

Nutze für Spezialphasen explizite Skill-Wechsel:

- Planung: `{{SKILL:sf-plan}}`
- Frontend: `{{AGENT:sf-ui-implementer}}`
- Backend/CLI: `{{AGENT:sf-nodejs-implementer}}`
- Code-Doku: `{{AGENT:sf-code-documenter}}`
- User-Doku: `{{AGENT:sf-docs-writer}}`
- Tests: `{{AGENT:sf-test-writer}}`
- E2E: `{{AGENT:sf-e2e-tester}}`
- Validierung: `{{AGENT:sf-code-validator}}`
- Review: `{{AGENT:sf-frontend-reviewer}}`, `{{AGENT:sf-nodejs-reviewer}}`

Bei gut trennbaren Teilaufgaben ist das interne Sub-Agent-Pattern erlaubt und für parallele Phasen bevorzugt.

Aktueller Workflow für Review-Report-Rückverweise: `{{SKILL:sf-build}}`.

{{INCLUDE:review-report-backlinks}}

{{INCLUDE:unresolved-review-report}}

Aktueller Workflow für Plan-Referenzen: Feature (`{{SKILL:sf-build}}`).

{{INCLUDE:plan-reference-routing}}

Wenn ein offener Plan für `{{SKILL:sf-build}}` bestätigt ist:

- überspringe Phase 1 vollständig
- verwende die Inhalte der Plan-Datei als abgestimmten Implementierungsplan
- starte direkt mit Phase 2

Ein referenzierter ungebauter Plan ersetzt nur die Planungsphase. Initiale Zustandsdokumentation, Review-Report-Rückverweise, Implementierung, Dokumentation, Tests, Validierung, Review und Abschluss laufen weiterhin normal.

## Workflow

### Phase 1: Planung

Wenn keine ungebaute Plan-Datei referenziert wurde:

1. Starte `{{SKILL:sf-plan}}` mit der Feature-Anforderung.
2. Weise den Planungs-Skill ausdrücklich an:
   - nur `docs/plan/` zu ändern
   - keinen Code zu erzeugen
   - keine Implementierungs-, Test-, Validator- oder Reviewer-Skills zu starten
   - offene Fragen zu klären, bevor der Plan geschrieben wird
3. Übernimm die erzeugte Plan-Datei als abgestimmten Implementierungsplan.
4. Lies die Plan-Datei vollständig und prüfe:
   - genau eine kanonische Statuszeile `**Planungsstatus:** Nicht umgesetzt` oder `**Plan status:** Not implemented` ist vorhanden
   - Akzeptanzkriterien sind messbar
   - Validierungsplan ist vorhanden
   - betroffene Dateien sind konkret genug für Phase 2
5. Präsentiere dem User die Plan-Datei mit kurzer Validierungs-Scorecard.
6. Hole explizite Freigabe ein. Starte Phase 2 nicht ohne diese Freigabe.

Wenn `{{SKILL:sf-plan}}` wegen fehlender Informationen abbricht, frage den User nach den offenen Punkten und starte die Planung danach erneut.

{{ASK}}
header: Freigabe
question: Implementierungsplan freigegeben?
type: approval
{{/ASK}}

### Phase 2: Implementierung

1. Starte den passenden Implementer-Skill mit dem abgestimmten Plan:
   - Frontend: `Verwende den Skill {{AGENT:sf-ui-implementer}} für diese Phase.`
   - Backend/CLI: `Verwende den Skill {{AGENT:sf-nodejs-implementer}} für diese Phase.`
   - Fullstack: beide parallel oder in klar getrennten Teilphasen
2. Prüfe auf Fertig-Protokoll, wenn intern delegiert wurde.
3. Prüfe das Ergebnis gegen die Anforderungen.

### Phase 3: Dokumentation

Starte wenn möglich parallel:

1. `{{AGENT:sf-code-documenter}}` für JSDoc/TSDoc und In-Code-Dokumentation aller neuen oder geänderten Exports
2. `{{AGENT:sf-docs-writer}}` für README/Guide-Updates, falls die Änderung nutzerrelevant ist

Überspringe User-Doku nur mit kurzer Begründung.

### Phase 4: Tests

Starte wenn möglich parallel:

1. `{{AGENT:sf-test-writer}}` für Unit-Tests und Komponententests
2. `{{AGENT:sf-e2e-tester}}` für neue User-Flows, falls ein echter Flow dazugekommen ist

### Phase 5: Validierung

1. Starte `{{AGENT:sf-code-validator}}`.
2. Gib dem User die vollständige Liste aller gefundenen Fehler und Warnungen aus.
3. Wenn Fehler gefunden werden: behebe sie direkt oder delegiere erneut an den passenden Implementer.
4. Wiederhole bis der Validator bestanden meldet.

### Phase 6: Review

1. Starte den passenden Reviewer-Skill für die geänderten Dateien. Weise den Reviewer ausdrücklich an, **alle Schweregrade** zu liefern (Kritisch + Wichtig + Hinweis), damit der spätere Plan-Datei-Bericht als vollständiger Audit-Trail dient — abweichend vom `{{SKILL:sf-review}}`-Standard, der nur Kritisch + Wichtig liefert.
2. Aggregiere alle Review-Findings und klassifiziere sie:
   - Kritisch: muss vor Abschluss behoben werden
   - Wichtig: sollte behoben werden, kann als Follow-up behandelt werden
   - Hinweis: optional
3. Vergib jedem Finding eine lokale ID in der Reihenfolge der Aggregation: `F1`, `F2`, `F3`, ... Diese IDs gelten nur innerhalb dieses Workflow-Laufs und werden später in der Plan-Datei wiederverwendet.
4. Behebe alle kritischen Findings vor dem Abschluss.
5. Präsentiere die Review-Ergebnisse in diesem Format. Aggregiere zusätzlich die Komplexität-Zähler, damit Phase 7 sie ohne erneute Ableitung übernehmen kann:

```markdown
**Review-Ergebnisse**

Zusammenfassung:
| Schweregrad | Anzahl | Behoben | Offen |
|---|---|---|---|
| Kritisch | X | X | X |
| Wichtig | X | X | X |
| Hinweis | X | X | X |

| Komplexität | Anzahl |
|---|---|
| Leicht | X |
| Mittel | Y |
| Schwer | Z |
```

Hinweis: Vor Abschluss muss die Spalte „Offen" für „Kritisch" 0 sein.

6. Falls Findings nicht umgesetzt wurden, liste sie direkt in der Zusammenfassung mit Prompt-Vorschlägen für spätere Umsetzung auf.
7. Dokumentiere jedes Finding strukturiert, damit offene oder nicht umgesetzte Findings in einen externen Review-Report übernommen werden können:
   - lokale ID (`F1`, `F2`, ...)
   - Titel
   - Schweregrad (Kritisch / Wichtig / Hinweis)
   - Komplexität (Leicht / Mittel / Schwer)
   - Bereich
   - Datei + Zeile
   - Problem
   - Empfehlung
   - Status (Behoben / Offen / Nicht umgesetzt)
   - Begründung bei Nicht-Umsetzung (inkl. ADR-Referenz, falls vorhanden)
8. Lege in diesem Workflow niemals ein ADR an und frage auch nicht danach. Bewusst nicht umgesetzte Findings werden ausschließlich im Review-Report dokumentiert. Über die spätere Umsetzung oder über ein ADR für eine bewusste Nicht-Umsetzung entscheidet der Entwickler beim Durchgehen der Findings-Datei, typischerweise via {{SKILL:sf-apply-review}}.
9. Wenn nach Review Findings mit Status `Offen` oder `Nicht umgesetzt` verbleiben:
   - schreibe sie gemäß „Offene Review-Finding-Reports" in eine neue Datei unter `.sf-plugin/review/`
   - verwende bei vorhandener Plan-Datei den Dateinamen `review-report-YYYY-MM-DD-plan-NNNN.md`
   - halte den erzeugten Reportpfad für Phase 7 fest
10. Wenn diese Phase ein Finding aus einer bestehenden Review-Report-Datei in `.sf-plugin/review/` umgesetzt hat:
   - ergänze direkt im betroffenen Finding als letzten Eintrag einen kurzen Umsetzungs-Hinweis
   - beginne den Hinweis mit `✅` und nenne mindestens Datum und Workflow

### Phase 7: Abschluss

1. Führe `{{AGENT:sf-code-validator}}` ein letztes Mal als Final-Check aus.
2. Dokumentiere den abgeschlossenen Workflow in der Plan-Datei:
   - wenn Phase 1 eine neue Plan-Datei via `{{SKILL:sf-plan}}` erzeugt hat: aktualisiere diese Datei.
   - wenn der User eine ungebaute Plan-Datei referenziert hat: aktualisiere die referenzierte Datei.
   - wenn ausnahmsweise keine Plan-Datei existiert: erstelle `docs/plan/` und vergib die Nummer gemäß `Plan-Nummern-Konvention` (nächste freie Nummer, eindeutig und lückenlos); nutze für die neue Plan-Datei den deutschen Marker (`**Planungsstatus:** Umgesetzt`) als Default — eine explizite Sprachwahl ist in diesem Fall nicht vorgesehen.
   - ersetze die kanonische Statuszeile durch die jeweilige abgeschlossene Form derselben Markersprache:
     - deutscher Marker: `**Planungsstatus:** Nicht umgesetzt` → `**Planungsstatus:** Umgesetzt`
     - englischer Marker: `**Plan status:** Not implemented` → `**Plan status:** Implemented`
     - wechsle die Markersprache nicht und erzeuge keine zweite Statuszeile.
   - Inhalt:
     - Anforderung
     - Architekturentscheidungen
     - betroffene Dateien
     - Implementierungsdetails
     - Testergebnisse
     - Review-Ergebnis und Verweis auf externe Review-Reports, falls offene Findings ausgelagert wurden
3. **Plan-Datei-Findings-Zusammenfassung:** Schreibe in der Plan-Datei nur eine kompakte Zusammenfassung. Offene oder nicht umgesetzte Findings werden nicht vollständig in die Plan-Datei kopiert, sondern in den externen Review-Report aus Phase 6 geschrieben.

   Verwende dieses Template:

```markdown
## Review-Findings

**Datum:** YYYY-MM-DD
**Reviewer:** [sf-frontend-reviewer / sf-nodejs-reviewer / beide / keiner]

### Zusammenfassung

| Status | Anzahl |
|---|---:|
| Behoben | X |
| Offen / Nicht umgesetzt | Y |

**Externer Review-Report:** `.sf-plugin/review/review-report-YYYY-MM-DD-plan-NNNN.md` <!-- nur ausgeben, wenn offene Findings ausgelagert wurden -->

Keine Findings gefunden. <!-- nur ausgeben, wenn keine Findings aufgekommen sind -->
```

   Regeln für den Findings-Bericht:
   - Kopiere offene oder nicht umgesetzte Findings nicht vollständig in die Plan-Datei.
   - Wenn offene oder nicht umgesetzte Findings existieren, nenne den externen Review-Report aus Phase 6.
   - Behobene Findings dürfen knapp gezählt werden; vollständige behobene Finding-Details sind in der Plan-Datei nicht erforderlich.
   - Falls keine Findings aufgekommen sind: schreibe in die Sektion „Keine Findings gefunden." statt der Tabellen.
   - Falls in Phase 6 keine Reviewer gestartet wurden (z. B. weil die Änderung kein Review erforderte): schreibe stattdessen einen kurzen Hinweis mit Begründung in die Sektion.
4. Lösche die Wisdom-Datei.
5. Prüfe ob ein Formatter konfiguriert ist und formatiere alle geänderten Dateien inklusive Plan-Datei einmal einheitlich.
6. Fasse zusammen, was implementiert, getestet und dokumentiert wurde.

## Regeln

{{INCLUDE:pre-commit-gate}}

{{INCLUDE:commit-message-rules}}

- Starte unabhängige Fachphasen immer parallel, wenn sie wirklich unabhängig sind
- Gib dem User nach jeder Phase eine kurze Statusmeldung
- Wenn eine Phase Fehler meldet, behebe sie vor dem Fortfahren
- Überspringe optionale Schritte nur mit kurzer Begründung
- Gib internen Sub-Agenten den Hinweis:
  - Aufgabe zuerst in 2-3 Sätzen zusammenfassen
  - mit `ERLEDIGT` oder `ABBRUCH: [Grund]` beenden
- Schreibe nach jeder abgeschlossenen Phase ein Wisdom-Summary
- Gib jeder delegierten Phase die bisherigen Erkenntnisse aus der Wisdom-Datei mit
