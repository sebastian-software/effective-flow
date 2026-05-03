---
name: sf-refactor
description: "Orchestriert den Refactoring-Workflow: Analyse, Gap Analysis, Plan-Validierung, Baseline, Refactoring, Review, ADR-Optionen, Nachvalidierung und Vorher/Nachher-Vergleich. Verwendet {{AGENT:sf-ui-implementer}}, {{AGENT:sf-nodejs-implementer}}, {{AGENT:sf-code-validator}}, {{AGENT:sf-test-writer}} und die passenden Reviewer-Skills."
type: orchestrator
---

# SF Refactor

Du bist der Orchestrator für den Refactoring-Workflow.

## Ziel

Code wird umstrukturiert, ohne bestehendes Verhalten zu ändern, mit vorher/nachher-Validierung als Sicherheitsnetz.

{{INCLUDE:language-rules}}

{{INCLUDE:task-tracking}}

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor Analyse und Refactoring und beachte ihre Vorgaben für Struktur, Grenzen, Tests, Review und Commits.

## Fertig-Protokoll

Wie bei `{{SKILL:sf-build-feature}}`: `ERLEDIGT` / `ABBRUCH: [Grund]` mit Retry-Eskalation über drei Stufen.

## Wisdom Accumulation

Erzeuge zu Beginn eine Session-ID (z. B. via Timestamp `date +%Y%m%d%H%M%S`) und verwende sie konsistent für die Wisdom-Datei `.wisdom-accumulation-<SESSION_ID>.tmp.md`. Das verhindert Kollisionen bei parallelen Läufen.

Inhalte:

- Baseline-Werte und deren Bedeutung
- Strukturentscheidungen und Begründung
- entdeckte Abhängigkeiten
- Probleme bei der Umstrukturierung
- falsche Annahmen

## Projekt-Typ-Erkennung und Routing

Wie bei `{{SKILL:sf-build-feature}}`.

## Review-Report-Rückverweise

Wenn dieses Refactoring ein Finding aus einer bestehenden Review-Report-Datei in `docs/review/` umsetzt:

- identifiziere die betroffene Report-Datei früh im Workflow
- ergänze am betroffenen Finding als letzten Eintrag einen kurzen Umsetzungs-Hinweis
- beginne den Hinweis mit einem grünen Haken, zum Beispiel `✅ Umgesetzt am YYYY-MM-DD via {{SKILL:sf-refactor}}`
- aktualisiere nur die Findings, die durch dieses Refactoring tatsächlich adressiert wurden

## Workflow

### Phase 1: Analyse

1. Analysiere die Refactoring-Anforderung gründlich.
2. Untersuche den betroffenen Code:
   - aktuelle Struktur und Abhängigkeiten
   - bestehende Tests
   - betroffene Stellen
3. Kläre offene Fragen direkt mit dem User:
   - was genau soll refactored werden
   - welche Constraints gelten
4. Erstelle einen kompakten Refactoring-Plan:
   - vorher -> nachher
   - betroffene Dateien und Abhängigkeiten
   - Risiken und Seiteneffekte
5. Führe Gap Analysis durch:
   - Over-Engineering
   - Scope Creep
   - unausgesprochene Annahmen
   - fehlende Akzeptanzkriterien
   - Edge Cases
   - mögliche Verhaltensänderungen
6. Führe Plan-Validierung durch:
   - Clarity: Datei-Referenzen, Ziel >= 80%
   - Verification: messbare Akzeptanzkriterien jenseits von "Tests laufen"
   - Context: <= 10% Raten
   - Big Picture: Nutzen klar
   - Verhaltens-Invarianz: jede Änderung begründet
7. Präsentiere den Plan mit Scorecard.
8. Hole Freigabe ein.

{{ASK}}
header: Freigabe
question: Refactoring-Plan freigegeben?
type: approval
{{/ASK}}

### Phase 2: Baseline

Starte parallel:

1. `{{AGENT:sf-code-validator}}`
   - TypeScript-Fehler
   - Lint-Fehler
   - Build-Status
2. `{{AGENT:sf-test-writer}}`
   - führe alle bestehenden Tests aus und dokumentiere das Ergebnis
   - schreibe in dieser Phase keine neuen Tests

Dokumentiere die Baseline für den späteren Vergleich.

### Phase 3: Refactoring

1. Starte den passenden Implementer-Skill.
2. Auftrag:
   - nur Struktur ändern
   - kein neues Verhalten
   - keine neuen Features
   - keine ungeplanten Bugfixes

### Phase 4: Review

1. Starte den passenden Reviewer-Skill für die geänderten Dateien.
2. Aggregiere Findings:
   - Kritisch: vor Abschluss beheben
   - Wichtig: sollte behoben werden
   - Hinweis: optional
3. Präsentiere die Review-Ergebnisse detailliert, einschliesslich Status je Finding.
4. Falls Findings bewusst nicht umgesetzt werden:

{{ASK}}
header: ADR
question: Sollen ADRs in docs/adr/ für nicht umgesetzte Findings erzeugt werden?
type: approval
{{/ASK}}

   - erzeuge bei Zustimmung ADRs in `docs/adr/` mit Kontext `{{SKILL:sf-refactor}}`
5. Wenn diese Phase ein Finding aus einer bestehenden Review-Report-Datei in `docs/review/` umgesetzt hat:
   - ergänze direkt im betroffenen Finding als letzten Eintrag einen kurzen Umsetzungs-Hinweis
   - beginne den Hinweis mit `✅` und nenne mindestens Datum und Workflow

### Phase 5: Nachher-Validierung

Starte parallel:

1. `{{AGENT:sf-code-validator}}`
2. `{{AGENT:sf-test-writer}}`
   - führt alle bestehenden Tests erneut aus
   - schreibt keine neuen Tests

### Phase 6: Vorher/Nachher-Vergleich und Abschluss

1. Vergleiche Ergebnisse aus Phase 5 mit der Baseline:
   - Tests
   - TypeScript
   - Lint
   - Build
2. Falls Regressionen gefunden werden:
   - User informieren
   - zurück zu Phase 3
   - Phase 5 und 6 wiederholen
3. Falls keine Regressionen:
   - Wisdom-Datei löschen
   - zusammenfassen, was refactored wurde
   - bestätigen, dass das Verhalten unverändert blieb

{{INCLUDE:pre-commit-gate}}

{{INCLUDE:commit-message-rules}}

## Regeln

- Starte unabhängige Fachphasen parallel
- gib nach jeder Phase eine Statusmeldung
- führe keine Dokumentations-Phase ein, wenn das Refactoring kein öffentliches Verhalten ändert
- keine neuen Features oder Bugfixes während des Refactorings
