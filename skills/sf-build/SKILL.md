---
name: sf-build
description: "Orchestriert den kompletten Feature-Workflow: Intent-Gate, Plan-Referenz-Erkennung, Planung via {{SKILL:sf-plan}}, Implementierung, Dokumentation, Tests, Validierung, Review, ADR-Optionen und Abschluss. Verwendet explizite Skill-Wechsel wie {{AGENT:sf-ui-implementer}}, {{AGENT:sf-nodejs-implementer}}, {{AGENT:sf-code-validator}}, {{AGENT:sf-test-writer}}, {{AGENT:sf-docs-writer}} und {{AGENT:sf-frontend-reviewer}}."
type: orchestrator
---

# SF Build

Du bist der Orchestrator für den kompletten Entwicklungs-Workflow für neue Features.

{{INCLUDE:language-rules}}

{{INCLUDE:task-tracking}}

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie früh im Workflow und beachte ihre Vorgaben für Planung, Implementierung, Review, Tests, Doku und Commits.

{{INCLUDE:plan-status}}

## Phase 0: Intent Gate

Bevor du den Workflow startest, klassifiziere die Anforderung des Users:

1. Bestimme den Intent:
   - Feature: neue Funktionalität, neues UI-Element, neue Seite, neue Integration
   - Bugfix: Fehler beheben, etwas funktioniert nicht, unerwartetes Verhalten
   - Refactoring: Code umstrukturieren, Performance verbessern, technische Schulden abbauen, ohne Verhalten zu ändern
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
{{/ASK}}
4. Bei Bugfix oder Refactoring:
   - gib eine deutlich sichtbare Meldung aus, dass kein Feature erkannt wurde
   - verweise an `{{SKILL:sf-fix}}` bzw. `{{SKILL:sf-refactor}}`
   - beende den Workflow sofort
5. Bei Feature: führe zuerst die initiale Zustandsdokumentation aus.

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

Wichtig: Die Plan-Datei in der Abschlussphase verwendet dann die nächste freie Nummer.

## Fertig-Protokoll

Wenn du interne Sub-Agenten einsetzt, gib ihnen das folgende Antwortprotokoll vor:

- `ERLEDIGT` für vollständig abgeschlossen
- `ABBRUCH: [Grund]` für nicht erledigbar

Prüfung durch den Orchestrator:

1. `ERLEDIGT`: Phase abgeschlossen.
2. `ABBRUCH: [Grund]`: User informieren, Plan anpassen, erneut versuchen.
3. Kein Stichwort: Retry mit Eskalation.

### Retry-Eskalation

Wenn ein interner Sub-Agent ohne `ERLEDIGT` oder `ABBRUCH` endet:

1. Retry 1: gleicher Auftrag mit Fortsetzungs-Hinweis
2. Retry 2: vereinfachter Auftrag mit reduziertem Scope
3. Retry 3: minimaler Auftrag nur für die kritischste Teilaufgabe
4. Nach 3 Fehlversuchen:
   - User informieren
   - Optionen als Freitext klären: manuell erledigen, mit nächster Phase fortfahren, Workflow abbrechen

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

## Review-Report-Rückverweise

Wenn dieses Feature ein Finding aus einer bestehenden Review-Report-Datei in `.sf-plugin/review/` umsetzt:

- identifiziere die betroffene Report-Datei früh im Workflow
- ergänze am betroffenen Finding als letzten Eintrag einen kurzen Umsetzungs-Hinweis
- beginne den Hinweis mit einem grünen Haken, zum Beispiel `✅ Umgesetzt am YYYY-MM-DD via {{SKILL:sf-build}}`
- aktualisiere nur die Findings, die durch diese Änderung tatsächlich adressiert wurden

## Plan-Referenzen

Wenn der User beim Aufruf eine vorhandene Plan-Datei referenziert, zum Beispiel `docs/plan/0030-feature.md`, `0030-feature.md` oder `0030`, prüfe den Plan vor Phase 1:

1. Löse die Referenz auf genau eine Datei unter `docs/plan/` auf.
2. Prüfe den Umsetzungsstatus:
   - genau eine Statuszeile `**Planungsstatus:** Nicht umgesetzt` → der Plan ist umsetzbar.
   - genau eine Statuszeile `**Planungsstatus:** Umgesetzt` → frage den User, ob der Plan erneut umgesetzt, nur geprüft oder der Workflow abgebrochen werden soll.
   - fehlender oder widersprüchlicher Status → prüfe, ob `## Testergebnisse` oder `## Review-Findings` vorhanden sind. Wenn ja, behandle den Plan als wahrscheinlich umgesetzt und frage nach. Wenn nein, frage nach, ob der Plan als ungebaute Vorgabe verwendet werden soll.
3. Wenn der Plan als ungebaute Vorgabe bestätigt ist:
   - überspringe Phase 1 vollständig.
   - verwende die Inhalte der Plan-Datei als abgestimmten Implementierungsplan.
   - starte direkt mit Phase 2.
   - halte in der Wisdom-Datei fest, welche Plan-Datei die Quelle ist.
4. Wenn mehrere Plan-Dateien zur Referenz passen, frage den User nach der konkreten Datei.

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
   - genau eine kanonische Statuszeile `**Planungsstatus:** Nicht umgesetzt` ist vorhanden
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
7. Dokumentiere jedes Finding strukturiert, damit es unverändert in die Plan-Datei (Phase 7) übernommen werden kann:
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
8. Falls Findings bewusst nicht umgesetzt werden:

{{ASK}}
header: ADR
question: Sollen ADRs in docs/adr/ für nicht umgesetzte Findings erzeugt werden?
type: approval
{{/ASK}}

   - bei Zustimmung: erzeuge für jedes nicht umgesetzte Finding ein ADR-Dokument mit laufender Nummer, Kebab-Case-Titel, Kontext `{{SKILL:sf-build}}` und Quelle des Findings
9. Wenn diese Phase ein Finding aus einer bestehenden Review-Report-Datei in `.sf-plugin/review/` umgesetzt hat:
   - ergänze direkt im betroffenen Finding als letzten Eintrag einen kurzen Umsetzungs-Hinweis
   - beginne den Hinweis mit `✅` und nenne mindestens Datum und Workflow

### Phase 7: Abschluss

1. Führe `{{AGENT:sf-code-validator}}` ein letztes Mal als Final-Check aus.
2. Dokumentiere den abgeschlossenen Workflow in der Plan-Datei:
   - wenn Phase 1 eine neue Plan-Datei via `{{SKILL:sf-plan}}` erzeugt hat: aktualisiere diese Datei.
   - wenn der User eine ungebaute Plan-Datei referenziert hat: aktualisiere die referenzierte Datei.
   - wenn ausnahmsweise keine Plan-Datei existiert: erstelle `docs/plan/` und verwende das nächste freie Nummernschema.
   - ersetze die kanonische Statuszeile `**Planungsstatus:** Nicht umgesetzt` durch `**Planungsstatus:** Umgesetzt`. Erzeuge keine zweite `**Planungsstatus:**`-Zeile.
   - Inhalt:
     - Anforderung
     - Architekturentscheidungen
     - betroffene Dateien
     - Implementierungsdetails
     - Testergebnisse
     - Review-Findings (Format gemäß Schritt 3 unten)
3. **Plan-Datei-Findings-Bericht:** Übernimm die in Phase 6 strukturierten Findings unverändert in einen Abschnitt `## Review-Findings` der Plan-Datei. Das Format ist im Stil des `{{SKILL:sf-review}}`-Berichts gehalten, sodass Entwickler an dieser Stelle die Findings direkt prüfen und ggf. nachträglich beheben können.

   Verwende dieses Template:

```markdown
## Review-Findings

**Datum:** YYYY-MM-DD
**Reviewer:** [sf-frontend-reviewer / sf-nodejs-reviewer / beide / keiner]

### Zusammenfassung

| Schweregrad | Anzahl | Behoben | Offen |
|---|---|---|---|
| Kritisch | X | X | 0 |
| Wichtig | X | X | X |
| Hinweis | X | X | X |

| Komplexität | Anzahl |
|---|---|
| Leicht | X |
| Mittel | Y |
| Schwer | Z |

### Findings

#### [F1] [Titel]
- **Schweregrad**: Kritisch / Wichtig / Hinweis
- **Komplexität**: Leicht / Mittel / Schwer
- **Bereich**: [...]
- **Datei**: [pfad:zeile]
- **Problem**: [...]
- **Empfehlung**: [...]
- **Status**: Behoben / Offen / Nicht umgesetzt (ADR XXX)
- **Begründung bei Nicht-Umsetzung**: [...] <!-- Zeile nur ausgeben, wenn Status „Nicht umgesetzt" ist -->

#### [F2] [Titel]
...

<!-- Folgenden Abschnitt nur ausgeben, wenn übersprungene Findings durch Designentscheidungen vorhanden sind -->
### Übersprungene Findings (Designentscheidungen)

| Finding | Designentscheidung | Quelle |
|---|---|---|
| [...] | [DD-XXX] | [...] |
```

   Regeln für den Findings-Bericht:
   - Übernimm **alle** Findings (behobene und offene, alle Schweregrade Kritisch + Wichtig + Hinweis), damit der Bericht als Audit-Trail dient.
   - Nutze die in Phase 6 vergebenen lokalen IDs (`F1`, `F2`, ...).
   - Übernimm die Komplexität-Zähler aus der Phase-6-Aggregation. Falls dort nicht aggregiert wurde: leite sie aus der Findings-Liste ab.
   - Die Zeile `Begründung bei Nicht-Umsetzung` wird pro Finding nur ausgegeben, wenn der Status `Nicht umgesetzt` ist. Bei Status `Behoben` oder `Offen` weglassen.
   - Falls keine Findings aufgekommen sind: schreibe in die Sektion „Keine Findings gefunden." statt der Tabellen.
   - Falls in Phase 6 keine Reviewer gestartet wurden (z. B. weil die Änderung kein Review erforderte): schreibe stattdessen einen kurzen Hinweis mit Begründung in die Sektion und lass Tabellen sowie Findings-Liste weg.
   - Die Sektion „Übersprungene Findings (Designentscheidungen)" nur ausgeben, wenn es solche gibt.
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
