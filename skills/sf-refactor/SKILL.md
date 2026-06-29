---
name: sf-refactor
description: "Orchestriert den Refactoring-Workflow: Analyse, Gap Analysis, Plan-Validierung, Baseline, Refactoring, Review, Nachvalidierung und Vorher/Nachher-Vergleich. Verwendet {{AGENT:sf-ui-implementer}}, {{AGENT:sf-nodejs-implementer}}, {{AGENT:sf-rust-implementer}}, {{AGENT:sf-code-validator}}, {{AGENT:sf-test-writer}} und die passenden Reviewer-Skills."
type: orchestrator
---

# SF Refactor

Du bist der Orchestrator für den Refactoring-Workflow.

## Ziel

Code wird umstrukturiert, ohne bestehendes Verhalten zu ändern, mit vorher/nachher-Validierung als Sicherheitsnetz.

```include
language-rules
```

```include
task-tracking
```

```include
plan-status
```

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor Analyse und Refactoring und beachte ihre Vorgaben für Struktur, Grenzen, Tests, Review und Commits.

```include
completion-protocol
```

```include
goal-completion
```

```include
worktree-integration
```

## Wisdom Accumulation

Erzeuge zu Beginn eine Session-ID (z. B. via Timestamp `date +%Y%m%d%H%M%S`) und verwende sie konsistent für die Wisdom-Datei `.sf-plugin/.wisdom-accumulation-<SESSION_ID>.tmp.md`. Das verhindert Kollisionen bei parallelen Läufen.

Inhalte:

- Baseline-Werte und deren Bedeutung
- Strukturentscheidungen und Begründung
- entdeckte Abhängigkeiten
- Probleme bei der Umstrukturierung
- falsche Annahmen

## Projekt-Typ-Erkennung und Routing

Wie bei `{{SKILL:sf-build}}`.

Aktueller Workflow für Review-Report-Rückverweise: `{{SKILL:sf-refactor}}`.

```include
review-report-backlinks
```

```include
unresolved-review-report
```

Aktueller Workflow für Plan-Referenzen: Refactoring (`{{SKILL:sf-refactor}}`).

```include
plan-reference-routing
```

Wenn ein offener Plan für `{{SKILL:sf-refactor}}` bestätigt ist:

- verwende die Inhalte der Plan-Datei als Refactoring-Plan
- validiere weiterhin in Phase 1, dass keine beabsichtigte Verhaltensänderung enthalten ist

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
8. Leite aus den messbaren Akzeptanzkriterien die explizite Abschlussbedingung ab (siehe „Goal-getriebene Abschlusssteuerung"); sie deckt die Phasen 2–6 ab und speist die explizite Goal-Abfrage in der Freigabe-Frage unten. Die Abschlussbedingung schließt die Verhaltens-Invarianz ein: die in Phase 2 erhobene Baseline muss unverändert bleiben.
9. Hole Freigabe ein. Die Freigabe-Frage enthält die explizite Goal-Abfrage (Option „Autonom via /goal"); behandle sie gemäß „Explizite Goal-Abfrage für autonome Läufe": Bei Wahl „Autonom via /goal" gib den `/goal`-String für die Phasen 2–6 aus; die Option entfällt, wenn der Workflow nicht-interaktiv delegiert wurde.

```ask
header: Freigabe
question: Refactoring-Plan freigegeben?
options:
  - label: Ja
    description: Freigabe erteilt, Workflow läuft gated weiter
  - label: Autonom via /goal
    description: Verbleibende Phasen autonom unter nativem /goal — der Skill gibt den einzufügenden /goal-String aus (entfällt bei nicht-interaktiver Delegation)
  - label: Anpassen
    description: Feedback als Freitext eingeben
```

### Phase 2: Baseline

Bestimme zuerst gemäß „Worktree-Integration" den effektiven Worktree-Modus und führe bei aktivem Modus das Worktree-Setup aus, bevor die Baseline erhoben wird. Baseline, Refactoring und Nachher-Validierung (Phasen 2–5) laufen dann mit Arbeitsverzeichnis im Worktree.

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
4. Dokumentiere jedes Finding strukturiert, damit offene oder nicht umgesetzte Findings als Review-Report geschrieben werden können:
   - Titel
   - Schweregrad (Kritisch / Wichtig / Hinweis)
   - Komplexität (Leicht / Mittel / Schwer)
   - Bereich
   - Datei + Zeile
   - Problem
   - Empfehlung
   - Aktion (`{{SKILL:sf-fix}}`, `{{SKILL:sf-refactor}}`, `{{SKILL:sf-build}}` oder `{{SKILL:sf-docs}}`)
   - Prompt-Vorschlag
   - Status (Behoben / Offen / Nicht umgesetzt)
   - Begründung bei Nicht-Umsetzung oder ADR-Referenz, falls vorhanden
5. Lege in diesem Workflow niemals ein ADR an und frage auch nicht danach. Bewusst nicht umgesetzte Findings werden ausschließlich im Review-Report dokumentiert. Über die spätere Umsetzung oder über ein ADR für eine bewusste Nicht-Umsetzung entscheidet der Entwickler beim Durchgehen der Findings-Datei, typischerweise via {{SKILL:sf-apply-review}}.
6. Wenn nach Review Findings mit Status `Offen` oder `Nicht umgesetzt` verbleiben:
   - schreibe sie gemäß „Offene Review-Finding-Reports" in eine neue Datei unter `.sf-plugin/review/`
   - verwende bei vorhandener Plan-Datei den Dateinamen `review-report-YYYY-MM-DD-plan-NNNN.md`
   - nenne den erzeugten Reportpfad in der Abschlusszusammenfassung
7. Wenn diese Phase ein Finding aus einer bestehenden Review-Report-Datei in `.sf-plugin/review/` umgesetzt hat:
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
   - zurück zu Phase 3, dann Phase 5 und 6 erneut – gemäß „Goal-getriebene Abschlusssteuerung": begrenze die internen Korrekturrunden und eskaliere an den User, falls die Baseline danach weiterhin nicht erreicht wird, statt unbegrenzt zu wiederholen
3. Falls keine Regressionen:
   - Wisdom-Datei löschen
   - wenn der Worktree-Modus aktiv war: Handback gemäß „Worktree-Integration" ausführen (Änderungen committen, Worktree zurückziehen, Abschluss-Aktion `pr`/`merge`/`branch`)
   - zusammenfassen, was refactored wurde; bei aktivem Worktree-Modus zusätzlich Liefer-Branch und Ergebnis der Abschluss-Aktion (PR-URL, Merge oder belassener Branch) nennen
   - bestätigen, dass das Verhalten unverändert blieb

```include
pre-commit-gate
```

```include
commit-message-rules
```

## Regeln

- Starte unabhängige Fachphasen parallel
- gib nach jeder Phase eine Statusmeldung
- führe keine Dokumentations-Phase ein, wenn das Refactoring kein öffentliches Verhalten ändert
- keine neuen Features oder Bugfixes während des Refactorings
