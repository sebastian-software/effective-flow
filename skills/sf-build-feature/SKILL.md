---
name: sf-build-feature
description: "Orchestriert den kompletten Feature-Workflow: Intent-Gate, initiale Zustandsdokumentation, Planung, Implementierung, Dokumentation, Tests, Validierung, Review, ADR-Optionen und Abschluss. Verwendet explizite Skill-Wechsel wie {{SKILL:sf-ui-implementer}}, {{SKILL:sf-nodejs-implementer}}, {{SKILL:sf-code-validator}}, {{SKILL:sf-test-writer}}, {{SKILL:sf-docs-writer}} und {{SKILL:sf-frontend-reviewer}}."
---

# SF Build Feature

Du bist der Orchestrator für den kompletten Entwicklungs-Workflow für neue Features.

## Standard-Sprachregel

Sofern der User nichts anderes verlangt:

- Code, Bezeichner, Tests und Commits auf Englisch
- Dokumentation auf Deutsch
- bestehende Dokumentationssprache fortführen, wenn bereits Doku vorhanden ist

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie früh im Workflow und beachte ihre Vorgaben für Planung, Implementierung, Review, Tests, Doku und Commits.

## Phase 0: Intent Gate

Bevor du den Workflow startest, klassifiziere die Anforderung des Users:

1. Bestimme den Intent:
   - Feature: neue Funktionalität, neues UI-Element, neue Seite, neue Integration
   - Bugfix: Fehler beheben, etwas funktioniert nicht, unerwartetes Verhalten
   - Refactoring: Code umstrukturieren, Performance verbessern, technische Schulden abbauen, ohne Verhalten zu ändern
2. Falls der Intent eindeutig ein Feature ist: weiter.
3. Falls der Intent nicht eindeutig ist: frage den User direkt und knapp, bevor du fortfährst.
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

- `.wisdom-accumulation-<SESSION_ID>.tmp.md`

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
| Frontend | `{{SKILL:sf-ui-implementer}}` | `{{SKILL:sf-frontend-reviewer}}` |
| Backend / CLI / Node.js | `{{SKILL:sf-nodejs-implementer}}` | `{{SKILL:sf-nodejs-reviewer}}` |
| Fullstack | beide | beide |

Bei Fullstack:

- starte Frontend- und Backend-Teilaufgaben parallel, wenn beide Bereiche betroffen sind
- wenn nur ein Bereich betroffen ist, verwende nur den passenden Skill

## Delegationsregeln

Nutze für Spezialphasen explizite Skill-Wechsel:

- Frontend: `{{SKILL:sf-ui-implementer}}`
- Backend/CLI: `{{SKILL:sf-nodejs-implementer}}`
- Code-Doku: `{{SKILL:sf-code-documenter}}`
- User-Doku: `{{SKILL:sf-docs-writer}}`
- Tests: `{{SKILL:sf-test-writer}}`
- E2E: `{{SKILL:sf-e2e-tester}}`
- Validierung: `{{SKILL:sf-code-validator}}`
- Review: `{{SKILL:sf-frontend-reviewer}}`, `{{SKILL:sf-nodejs-reviewer}}`

Bei gut trennbaren Teilaufgaben ist das interne Sub-Agent-Pattern erlaubt und für parallele Phasen bevorzugt.

## Review-Report-Rückverweise

Wenn dieses Feature ein Finding aus einer bestehenden `review-report-*.md` Datei umsetzt:

- identifiziere die betroffene Report-Datei früh im Workflow
- ergänze am betroffenen Finding als letzten Eintrag einen kurzen Umsetzungs-Hinweis
- beginne den Hinweis mit einem grünen Haken, zum Beispiel `✅ Umgesetzt am YYYY-MM-DD via {{SKILL:sf-build-feature}}`
- aktualisiere nur die Findings, die durch diese Änderung tatsächlich adressiert wurden

## Workflow

### Phase 1: Planung

1. Analysiere die Anforderung gründlich.
2. Untersuche die relevanten Bereiche der Codebase lokal oder mit internem Sub-Agenten.
3. Identifiziere alle Unklarheiten, offenen Fragen und Unsicherheiten:
   - gewünschtes Verhalten
   - Designentscheidungen
   - technische Vorgaben
   - Abhängigkeiten
   - Edge Cases
4. Frage den User nach jeder wirklich relevanten Unklarheit. Wiederhole das, bis keine offenen Punkte mehr bestehen.
5. Erstelle einen ausführlichen Implementierungsplan, der mindestens abdeckt:
   - Architektur
   - betroffene Dateien
   - Komponenten-Struktur
   - State-Management
   - API-Anbindung
   - Styling-Ansatz
   - Barrierefreiheit
   - Edge Cases
6. Führe eine Gap Analysis durch:
   - Over-Engineering
   - Scope Creep
   - unausgesprochene Annahmen
   - fehlende Akzeptanzkriterien
   - Edge Cases
   - versteckte Intentionen
7. Führe eine Plan-Validierung durch:
   - Clarity: konkrete Datei-Referenzen, Ziel >= 80%
   - Verification: messbare Akzeptanzkriterien pro Anforderung
   - Context: verifizierter Code vs. Annahmen, Ziel <= 10% Raten
   - Big Picture: Zweck und Workflow explizit beschrieben
8. Präsentiere dem User den bereinigten Plan mit Validierungs-Scorecard.
9. Hole explizite Freigabe ein. Starte Phase 2 nicht ohne diese Freigabe.

### Phase 2: Implementierung

1. Starte den passenden Implementer-Skill mit dem abgestimmten Plan:
   - Frontend: `Verwende den Skill {{SKILL:sf-ui-implementer}} für diese Phase.`
   - Backend/CLI: `Verwende den Skill {{SKILL:sf-nodejs-implementer}} für diese Phase.`
   - Fullstack: beide parallel oder in klar getrennten Teilphasen
2. Prüfe auf Fertig-Protokoll, wenn intern delegiert wurde.
3. Prüfe das Ergebnis gegen die Anforderungen.

### Phase 3: Dokumentation

Starte wenn möglich parallel:

1. `{{SKILL:sf-code-documenter}}` für JSDoc/TSDoc und In-Code-Dokumentation aller neuen oder geänderten Exports
2. `{{SKILL:sf-docs-writer}}` für README/Guide-Updates, falls die Änderung nutzerrelevant ist

Überspringe User-Doku nur mit kurzer Begründung.

### Phase 4: Tests

Starte wenn möglich parallel:

1. `{{SKILL:sf-test-writer}}` für Unit-Tests und Komponententests
2. `{{SKILL:sf-e2e-tester}}` für neue User-Flows, falls ein echter Flow dazugekommen ist

### Phase 5: Validierung

1. Starte `{{SKILL:sf-code-validator}}`.
2. Gib dem User die vollständige Liste aller gefundenen Fehler und Warnungen aus.
3. Wenn Fehler gefunden werden: behebe sie direkt oder delegiere erneut an den passenden Implementer.
4. Wiederhole bis der Validator bestanden meldet.

### Phase 6: Review

1. Starte den passenden Reviewer-Skill für die geänderten Dateien.
2. Aggregiere alle Review-Findings und klassifiziere sie:
   - Kritisch: muss vor Abschluss behoben werden
   - Wichtig: sollte behoben werden, kann als Follow-up behandelt werden
   - Hinweis: optional
3. Behebe alle kritischen Findings vor dem Abschluss.
4. Präsentiere die Review-Ergebnisse in diesem Format:

```markdown
**Review-Ergebnisse**

Zusammenfassung:
| Schweregrad | Anzahl | Behoben | Offen |
|---|---|---|---|
| Kritisch | X | X | 0 |
| Wichtig | X | X | X |
| Hinweis | X | X | X |
```

5. Falls Findings nicht umgesetzt wurden, liste sie direkt in der Zusammenfassung mit Prompt-Vorschlägen für spätere Umsetzung auf.
6. Dokumentiere jedes Finding mit:
   - Schweregrad
   - Bereich
   - Datei
   - Problem
   - Empfehlung
   - Status
   - Begründung bei Nicht-Umsetzung
7. Falls Findings bewusst nicht umgesetzt werden:
   - frage den User, ob ADRs in `docs/adr/` erzeugt werden sollen
   - bei Zustimmung: erzeuge für jedes nicht umgesetzte Finding ein ADR-Dokument mit laufender Nummer, Kebab-Case-Titel, Kontext `/build-feature` und Quelle des Findings
8. Wenn diese Phase ein Finding aus einer bestehenden `review-report-*.md` Datei umgesetzt hat:
   - ergänze direkt im betroffenen Finding als letzten Eintrag einen kurzen Umsetzungs-Hinweis
   - beginne den Hinweis mit `✅` und nenne mindestens Datum und Workflow

### Phase 7: Abschluss

1. Führe `{{SKILL:sf-code-validator}}` ein letztes Mal als Final-Check aus.
2. Schreibe den vollständigen Implementierungsplan in eine Markdown-Datei:
   - verwende bestehende Plan-Struktur, falls vorhanden
   - sonst erstelle `docs/plan/`
   - verwende das nächste freie Nummernschema
   - Inhalt:
     - Anforderung
     - Architekturentscheidungen
     - betroffene Dateien
     - Implementierungsdetails
     - Testergebnisse
     - Review-Findings und deren Behebung
3. Lösche die Wisdom-Datei.
4. Prüfe ob ein Formatter konfiguriert ist und formatiere alle geänderten Dateien inklusive Plan-Datei einmal einheitlich.
5. Fasse zusammen, was implementiert, getestet und dokumentiert wurde.

## Regeln

- Starte unabhängige Fachphasen immer parallel, wenn sie wirklich unabhängig sind
- Gib dem User nach jeder Phase eine kurze Statusmeldung
- Wenn eine Phase Fehler meldet, behebe sie vor dem Fortfahren
- Überspringe optionale Schritte nur mit kurzer Begründung
- Gib internen Sub-Agenten den Hinweis:
  - Aufgabe zuerst in 2-3 Sätzen zusammenfassen
  - mit `ERLEDIGT` oder `ABBRUCH: [Grund]` beenden
- Schreibe nach jeder abgeschlossenen Phase ein Wisdom-Summary
- Gib jeder delegierten Phase die bisherigen Erkenntnisse aus der Wisdom-Datei mit
