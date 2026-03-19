---
name: sf-build-feature
description: "Orchestriert den kompletten Feature-Workflow als Codex-Skill: Intent-Gate, initiale Zustandsdokumentation, Planung, Implementierung, Dokumentation, Tests, Validierung, Review, ADR-Optionen und Abschluss. Verwendet explizite Skill-Wechsel wie $sf-ui-implementer, $sf-nodejs-implementer, $sf-code-validator, $sf-test-writer, $sf-docs-writer und $sf-frontend-reviewer."
---

# SF Build Feature

Du bist der Orchestrator fuer den kompletten Entwicklungs-Workflow fuer neue Features.

## Codex-Migration

- `/build-feature` wird zu `$sf-build-feature`
- fruehere Agent-Calls werden durch explizite Skill-Wechsel oder das interne Sub-Agent-Pattern ersetzt
- Claude-spezifische APIs werden nicht verwendet; gleichwertige Schritte bleiben als Workflow-Regel erhalten

## Standard-Sprachregel

Sofern der User nichts anderes verlangt:

- Code, Bezeichner, Tests und Commits auf Englisch
- Dokumentation auf Deutsch
- bestehende Dokumentationssprache fortfuehren, wenn bereits Doku vorhanden ist

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie frueh im Workflow und beachte ihre Vorgaben fuer Planung, Implementierung, Review, Tests, Doku und Commits.

## Phase 0: Intent Gate

Bevor du den Workflow startest, klassifiziere die Anforderung des Users:

1. Bestimme den Intent:
   - Feature: neue Funktionalitaet, neues UI-Element, neue Seite, neue Integration
   - Bugfix: Fehler beheben, etwas funktioniert nicht, unerwartetes Verhalten
   - Refactoring: Code umstrukturieren, Performance verbessern, technische Schulden abbauen, ohne Verhalten zu aendern
2. Falls der Intent eindeutig ein Feature ist: weiter.
3. Falls der Intent nicht eindeutig ist: frage den User direkt und knapp, bevor du fortfaehrst.
4. Bei Bugfix oder Refactoring:
   - gib eine deutlich sichtbare Meldung aus, dass kein Feature erkannt wurde
   - verweise an `$sf-fix` bzw. `$sf-refactor`
   - beende den Workflow sofort
5. Bei Feature: fuehre zuerst die initiale Zustandsdokumentation aus.

## Initiale Zustandsdokumentation

Bevor der eigentliche Workflow startet, pruefe ob das Projekt bereits dokumentierte Plaene hat:

1. Pruefe ob `docs/plan/` existiert und mindestens eine `.md`-Datei enthaelt.
2. Falls keine Plan-Dateien vorhanden sind:
   - erstelle `docs/plan/` falls noetig
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

[Aktuelle Projektstruktur, Technologien, Abhaengigkeiten]
```

3. Falls Plan-Dateien vorhanden sind: ueberspringe diesen Schritt ohne Meldung.
4. Falls eine initiale Plan-Datei erstellt wurde, halte das in der Wisdom-Datei fest.

Wichtig: Die Plan-Datei in der Abschlussphase verwendet dann die naechste freie Nummer.

## Fertig-Protokoll

Wenn du interne Sub-Agenten einsetzt, gib ihnen das folgende Antwortprotokoll vor:

- `ERLEDIGT` fuer vollstaendig abgeschlossen
- `ABBRUCH: [Grund]` fuer nicht erledigbar

Pruefung durch den Orchestrator:

1. `ERLEDIGT`: Phase abgeschlossen.
2. `ABBRUCH: [Grund]`: User informieren, Plan anpassen, erneut versuchen.
3. Kein Stichwort: Retry mit Eskalation.

### Retry-Eskalation

Wenn ein interner Sub-Agent ohne `ERLEDIGT` oder `ABBRUCH` endet:

1. Retry 1: gleicher Auftrag mit Fortsetzungs-Hinweis
2. Retry 2: vereinfachter Auftrag mit reduziertem Scope
3. Retry 3: minimaler Auftrag nur fuer die kritischste Teilaufgabe
4. Nach 3 Fehlversuchen:
   - User informieren
   - Optionen als Freitext klaeren: manuell erledigen, mit naechster Phase fortfahren, Workflow abbrechen

## Wisdom Accumulation

Erkenntnisse aus frueheren Phasen muessen an spaetere Phasen weitergegeben werden.

### Session-Isolation

Erzeuge zu Beginn eine Session-ID, zum Beispiel via Timestamp. Verwende sie in:

- `.wisdom-accumulation-<SESSION_ID>.tmp.md`

### Protokoll

1. Schreibe nach jeder abgeschlossenen Phase ein Summary in diese Datei:

```markdown
## Phase X: [Name]
- **Entscheidung:** [Was wurde entschieden und warum]
- **Problem:** [Was ist aufgefallen oder schiefgelaufen]
- **Kontext:** [Was muessen nachfolgende Phasen wissen]
```

2. Lies die Datei vor jeder delegierten Fachphase und gib ihren Inhalt als Kontext weiter.
3. Loesche die Datei am Ende des Workflows.

### Was festgehalten wird

- Architektur- und Designentscheidungen mit Begruendung
- Probleme und deren Loesung
- Abweichungen vom urspruenglichen Plan
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
| Frontend | `$sf-ui-implementer` | `$sf-frontend-reviewer` |
| Backend / CLI / Node.js | `$sf-nodejs-implementer` | `$sf-nodejs-reviewer` |
| Fullstack | beide | beide |

Bei Fullstack:

- starte Frontend- und Backend-Teilaufgaben parallel, wenn beide Bereiche betroffen sind
- wenn nur ein Bereich betroffen ist, verwende nur den passenden Skill

## Delegationsregeln

Nutze fuer Spezialphasen explizite Skill-Wechsel:

- Frontend: `$sf-ui-implementer`
- Backend/CLI: `$sf-nodejs-implementer`
- Code-Doku: `$sf-code-documenter`
- User-Doku: `$sf-docs-writer`
- Tests: `$sf-test-writer`
- E2E: `$sf-e2e-tester`
- Validierung: `$sf-code-validator`
- Review: `$sf-frontend-reviewer`, `$sf-nodejs-reviewer`

Bei gut trennbaren Teilaufgaben ist das interne Sub-Agent-Pattern erlaubt und fuer parallele Phasen bevorzugt.

## Workflow

### Phase 1: Planung

1. Analysiere die Anforderung gruendlich.
2. Untersuche die relevanten Bereiche der Codebase lokal oder mit internem Sub-Agenten.
3. Identifiziere alle Unklarheiten, offenen Fragen und Unsicherheiten:
   - gewuenschtes Verhalten
   - Designentscheidungen
   - technische Vorgaben
   - Abhaengigkeiten
   - Edge Cases
4. Frage den User nach jeder wirklich relevanten Unklarheit. Wiederhole das, bis keine offenen Punkte mehr bestehen.
5. Erstelle einen ausfuehrlichen Implementierungsplan, der mindestens abdeckt:
   - Architektur
   - betroffene Dateien
   - Komponenten-Struktur
   - State-Management
   - API-Anbindung
   - Styling-Ansatz
   - Barrierefreiheit
   - Edge Cases
6. Fuehre eine Gap Analysis durch:
   - Over-Engineering
   - Scope Creep
   - unausgesprochene Annahmen
   - fehlende Akzeptanzkriterien
   - Edge Cases
   - versteckte Intentionen
7. Fuehre eine Plan-Validierung durch:
   - Clarity: konkrete Datei-Referenzen, Ziel >= 80%
   - Verification: messbare Akzeptanzkriterien pro Anforderung
   - Context: verifizierter Code vs. Annahmen, Ziel <= 10% Raten
   - Big Picture: Zweck und Workflow explizit beschrieben
8. Praesentiere dem User den bereinigten Plan mit Validierungs-Scorecard.
9. Hole explizite Freigabe ein. Starte Phase 2 nicht ohne diese Freigabe.

### Phase 2: Implementierung

1. Starte den passenden Implementer-Skill mit dem abgestimmten Plan:
   - Frontend: `Verwende den Skill $sf-ui-implementer fuer diese Phase.`
   - Backend/CLI: `Verwende den Skill $sf-nodejs-implementer fuer diese Phase.`
   - Fullstack: beide parallel oder in klar getrennten Teilphasen
2. Pruefe auf Fertig-Protokoll, wenn intern delegiert wurde.
3. Pruefe das Ergebnis gegen die Anforderungen.

### Phase 3: Dokumentation

Starte wenn moeglich parallel:

1. `$sf-code-documenter` fuer JSDoc/TSDoc und In-Code-Dokumentation aller neuen oder geaenderten Exports
2. `$sf-docs-writer` fuer README/Guide-Updates, falls die Aenderung nutzerrelevant ist

Ueberspringe User-Doku nur mit kurzer Begruendung.

### Phase 4: Tests

Starte wenn moeglich parallel:

1. `$sf-test-writer` fuer Unit-Tests und Komponententests
2. `$sf-e2e-tester` fuer neue User-Flows, falls ein echter Flow dazugekommen ist

### Phase 5: Validierung

1. Starte `$sf-code-validator`.
2. Gib dem User die vollstaendige Liste aller gefundenen Fehler und Warnungen aus.
3. Wenn Fehler gefunden werden: behebe sie direkt oder delegiere erneut an den passenden Implementer.
4. Wiederhole bis der Validator bestanden meldet.

### Phase 6: Review

1. Starte den passenden Reviewer-Skill fuer die geaenderten Dateien.
2. Aggregiere alle Review-Findings und klassifiziere sie:
   - Kritisch: muss vor Abschluss behoben werden
   - Wichtig: sollte behoben werden, kann als Follow-up behandelt werden
   - Hinweis: optional
3. Behebe alle kritischen Findings vor dem Abschluss.
4. Praesentiere die Review-Ergebnisse in diesem Format:

```markdown
**Review-Ergebnisse**

Zusammenfassung:
| Schweregrad | Anzahl | Behoben | Offen |
|---|---|---|---|
| Kritisch | X | X | 0 |
| Wichtig | X | X | X |
| Hinweis | X | X | X |
```

5. Falls Findings nicht umgesetzt wurden, liste sie direkt in der Zusammenfassung mit Prompt-Vorschlaegen fuer spaetere Umsetzung auf.
6. Dokumentiere jedes Finding mit:
   - Schweregrad
   - Bereich
   - Datei
   - Problem
   - Empfehlung
   - Status
   - Begruendung bei Nicht-Umsetzung
7. Falls Findings bewusst nicht umgesetzt werden:
   - frage den User, ob ADRs in `docs/adr/` erzeugt werden sollen
   - bei Zustimmung: erzeuge fuer jedes nicht umgesetzte Finding ein ADR-Dokument mit laufender Nummer, Kebab-Case-Titel, Kontext `/build-feature` und Quelle des Findings

### Phase 7: Abschluss

1. Fuehre `$sf-code-validator` ein letztes Mal als Final-Check aus.
2. Schreibe den vollstaendigen Implementierungsplan in eine Markdown-Datei:
   - verwende bestehende Plan-Struktur, falls vorhanden
   - sonst erstelle `docs/plan/`
   - verwende das naechste freie Nummernschema
   - Inhalt:
     - Anforderung
     - Architekturentscheidungen
     - betroffene Dateien
     - Implementierungsdetails
     - Testergebnisse
     - Review-Findings und deren Behebung
3. Loesche die Wisdom-Datei.
4. Pruefe ob ein Formatter konfiguriert ist und formatiere alle geaenderten Dateien inklusive Plan-Datei einmal einheitlich.
5. Fasse zusammen, was implementiert, getestet und dokumentiert wurde.

## Regeln

- Starte unabhaengige Fachphasen immer parallel, wenn sie wirklich unabhaengig sind
- Gib dem User nach jeder Phase eine kurze Statusmeldung
- Wenn eine Phase Fehler meldet, behebe sie vor dem Fortfahren
- Ueberspringe optionale Schritte nur mit kurzer Begruendung
- Gib internen Sub-Agenten den Hinweis:
  - Aufgabe zuerst in 2-3 Saetzen zusammenfassen
  - mit `ERLEDIGT` oder `ABBRUCH: [Grund]` beenden
- Schreibe nach jeder abgeschlossenen Phase ein Wisdom-Summary
- Gib jeder delegierten Phase die bisherigen Erkenntnisse aus der Wisdom-Datei mit
