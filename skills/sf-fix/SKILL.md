---
name: sf-fix
description: "Orchestriert den Bugfix-Workflow als Codex-Skill: Investigation, Reproduktion, Gap Analysis, Diagnose-Validierung, minimaler Fix, Regressionstests, Validierung und Abschluss. Verwendet Skill-Wechsel wie $sf-ui-implementer, $sf-nodejs-implementer, $sf-test-writer und $sf-code-validator."
---

# SF Fix

Du bist der Orchestrator fuer den Bugfix-Workflow.

## Ziel

Dieser Workflow ist optimiert fuer das Finden und Beheben von Fehlern, ohne unnoetige Planungs- oder Dokumentationsphasen.

## Standard-Sprachregel

- Code, Bezeichner, Tests und Commits auf Englisch
- Dokumentation auf Deutsch
- bestehende Dokumentationssprache fortfuehren

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor Investigation und Fix und beachte ihre Vorgaben fuer Analyse, Implementierung, Tests, Validierung und Commits.

## Fertig-Protokoll

Wenn du interne Sub-Agenten einsetzt, muessen sie mit `ERLEDIGT` oder `ABBRUCH: [Grund]` enden.

Retry-Eskalation:

1. gleicher Auftrag mit Fortsetzungs-Hinweis
2. vereinfachter Auftrag
3. minimaler Auftrag
4. danach User fragen, wie weiter vorzugehen ist

## Wisdom Accumulation

Verwende `.wisdom-accumulation-<SESSION_ID>.tmp.md` fuer:

- verworfene Root-Cause-Hypothesen
- Reproduktionsschritte und Ergebnisse
- entdeckte Abhaengigkeiten und Seiteneffekte
- falsche Annahmen

Schreibe nach jeder Phase ein Summary und gib es an spaetere Phasen weiter. Loesche die Datei am Ende.

## Projekt-Typ-Erkennung

Wie bei `$sf-build-feature`.

## Routing

- Frontend: `$sf-ui-implementer`
- Backend / CLI / Node.js: `$sf-nodejs-implementer`
- Fullstack: beide, nur bei klarer Trennung parallel

## Workflow

### Phase 1: Investigation

1. Analysiere die Fehlerbeschreibung gruendlich.
2. Untersuche den relevanten Code lokal oder ueber einen internen Explore-Sub-Agenten.
3. Klaere offene Fragen direkt mit dem User:
   - wann tritt der Fehler auf
   - gibt es eine Fehlermeldung oder erwartetes vs. tatsaechliches Verhalten
   - seit wann besteht das Problem
4. Identifiziere die vermutliche Root Cause und die betroffenen Dateien.

### Phase 2: Reproduktion

1. Versuche den Bug zu reproduzieren:
   - `$sf-code-validator` fuer aktuellen technischen Zustand
   - falls moeglich: `$sf-test-writer` fuer einen fehlschlagenden Test, der das Verhalten dokumentiert
2. Fuehre eine Gap Analysis fuer Diagnose und Fix-Strategie durch:
   - Over-Engineering
   - unausgesprochene Annahmen
   - fehlende Akzeptanzkriterien
   - Edge Cases
   - Scope Creep
3. Fuehre eine Diagnose-Validierung durch:
   - Clarity: Root Cause und Datei/Zeile konkret benannt
   - Verification: Bug reproduzierbar
   - Context: Annahmen explizit markiert, Ziel <= 10% Raten
   - Fix-Scope: minimaler Fix klar definiert
4. Praesentiere dem User:
   - wo der Bug liegt
   - was die Root Cause ist
   - wie er reproduzierbar ist
   - Gap-Analysis-Erkenntnisse
   - Validierungs-Scorecard
5. Hole Freigabe ein, wenn Ursache oder Fix-Strategie nicht eindeutig sind.

### Phase 3: Fix

1. Starte den passenden Implementer-Skill:
   - `$sf-ui-implementer` oder `$sf-nodejs-implementer`
2. Gib einen praezisen Auftrag:
   - Root Cause
   - betroffene Dateien
   - gewuenschtes Verhalten nach dem Fix
   - Hinweis: minimale Aenderung, kein Refactoring

### Phase 4: Verifikation

Starte parallel, wenn moeglich:

1. `$sf-test-writer`
   - bestaetigt den fehlschlagenden Test aus Phase 2 oder schreibt einen Regressionstest
2. `$sf-code-validator`
   - TypeScript, Lint und Build

### Phase 5: Abschluss

1. Falls Fehler in Phase 4 gefunden wurden: behebe sie und wiederhole Phase 4.
2. Loesche die Wisdom-Datei.
3. Fasse zusammen:
   - Root Cause
   - Aenderungen
   - neue oder angepasste Tests
   - Restrisiken

## Regeln

- Starte unabhaengige Fachphasen parallel
- gib dem User nach jeder Phase eine kurze Statusmeldung
- behebe Fehler vor dem Fortfahren
- halte Aenderungen minimal
- gib internen Sub-Agenten das Fertig-Protokoll vor
