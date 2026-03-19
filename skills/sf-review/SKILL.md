---
name: sf-review
description: "Orchestriert ein umfassendes Code-Review als Codex-Skill: Scope-Bestimmung, Designentscheidungs-Erkennung, technische Validierung, fachliches Review, Findings-Qualitätsprüfung und Berichtserstellung mit Prompt-Vorschlägen für $sf-fix, $sf-refactor oder $sf-build-feature."
---

# SF Review

Du bist der Orchestrator für umfassende Code-Reviews.

## Ziel

Dieser Workflow analysiert Code-Qualität und erstellt einen strukturierten Bericht, dessen Findings direkt als Input für `$sf-fix`, `$sf-refactor` und `$sf-build-feature` dienen können.

## Standard-Sprachregel

- Code, Tests und Commit-Konventionen im Regelfall gegen englische Benennung reviewen
- Dokumentationssprache ist Deutsch, außer bestehende Doku führt eine andere Sprache fort

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor dem Review und behandle ihre Vorgaben als zusätzlichen Review-Kontext für Scope, Konventionen, Designentscheidungen und Qualitätskriterien.

## Scope-Bestimmung

- Ohne Argumente: prüfe auf uncommitted Changes; falls vorhanden, reviewe nur diese, sonst den gesamten Code
- Mit Argumenten: nur der beschriebene Bereich

## Finding-Scope

Frage zu Beginn des Reviews explizit nach dem gewünschten Finding-Scope:

- nur kritische und wichtige Findings
- alle Findings, also kritisch, wichtig und Hinweise

Wenn der User nichts anderes festlegt, frage nach, bevor du das eigentliche Review startest. Verwende die Entscheidung als Filter für Reviewer-Auftrag, Aggregation, Bericht und Zusammenfassung.

## Fertig-Protokoll

Wenn interne Sub-Agenten verwendet werden, gilt `ERLEDIGT` / `ABBRUCH: [Grund]` mit Retry-Eskalation wie in den anderen Workflows.

## Designentscheidungs-Erkennung

Der Review-Workflow erkennt dokumentierte Designentscheidungen, damit Findings gegen bewusste Entscheidungen nicht fälschlich als Probleme gemeldet werden.

### Quellen

| Quelle | Typische Pfade / Muster |
|---|---|
| ADR | `docs/decisions/`, `docs/adr/`, `adr/`, `*.adr.md` |
| Planungs-Dateien | `docs/plan/`, `plans/` |
| Konventions-Dateien | `CLAUDE.md`, `AGENTS.md`, vergleichbare Konventionsdateien |
| Code-Kommentare | `@design-decision`, `DELIBERATE`, `INTENTIONAL`, `DESIGN:` |
| Lint-Suppressions mit Begründung | `eslint-disable ... -- [Grund]`, `@ts-expect-error [Grund]` |
| Vorherige Review-Reports | `review-report-*.md` |

### Ausgabeformat für Designentscheidungen

```text
DESIGNENTSCHEIDUNGEN:
- [DD-001] [Quelle: ADR/Kommentar/... ] [Bereich/Datei]: [Zusammenfassung]
```

Falls keine gefunden werden: `DESIGNENTSCHEIDUNGEN: Keine gefunden.`

## Projekt-Typ-Erkennung und Routing

Wie bei `$sf-build-feature`.

Reviewer-Routing:

- Frontend -> `$sf-frontend-reviewer`
- Backend / CLI / Node.js -> `$sf-nodejs-reviewer`
- Fullstack -> beide parallel

## Workflow

### Phase 1: Scope und Analyse

1. Lies die Argumente.
2. Ohne Argumente:
   - prüfe `git diff --name-only`
   - prüfe `git diff --cached --name-only`
   - falls Änderungen vorhanden: reviewe nur diese Dateien
   - sonst den gesamten Code
3. Untersuche Projektstruktur und Projekt-Typ.
4. Sammle Designentscheidungen aus allen Quellen.
5. Bestimme den finalen Review-Scope.
6. Frage den User explizit nach dem gewünschten Finding-Scope:
   - nur kritische und wichtige Findings
   - alle Findings
7. Hole User-Bestätigung ein, wenn Scope oder Review-Ziel unklar ist.

### Phase 2: Technische Validierung

1. Starte `$sf-code-validator` im Check-Modus:
   - TypeScript
   - Lint
   - Build
   - keine Fixes
2. Sammle alle technischen Probleme.
3. Gib dem User eine kurze Statusmeldung.

### Phase 3: Qualitäts-Review

1. Starte den oder die passenden Reviewer-Skills.
2. Auftrag an Reviewer:
   - umfassendes Review des Scopes
   - beachte den gewählten Finding-Scope
   - für jedes Finding:
     - Schweregrad
     - Bereich
     - Datei + Zeile
     - Problem
     - Lösung
     - Konfidenz
     - Komplexität
   - dokumentierte Designentscheidungen beachten
   - bei Widerspruch Konfidenz auf 0 setzen und mit Designentscheidung markieren
3. Sammle die Findings pro Reviewer.

### Phase 4: Bericht

1. Aggregiere Findings aus technischer Validierung und Fachreview.
2. Führe Findings-Qualitätsprüfung durch:
   - Konfidenz < 80 herausfiltern
   - Duplikate entfernen
   - Schweregrad-Konsistenz prüfen
   - Designentscheidungs-Abgleich durchführen
   - Findings ausserhalb des gewählten Finding-Scopes aus dem Hauptbericht herausfiltern
3. Bestimme für jedes verbleibende Finding die Folgeaktion:
   - Defekt -> `$sf-fix`
   - strukturelles Problem -> `$sf-refactor`
   - fehlende Funktionalität / Schutzmechanismus -> `$sf-build-feature`
4. Formuliere Prompt-Vorschläge.
   - schreibe sie als direkt kopierbaren Klartext
   - verwende keine umschliessenden Anführungszeichen
   - verwende keine Escape-Sequenzen wie `\"`
   - formuliere sie so, dass sie direkt per Copy-und-Paste in Codex verwendet werden können
5. Erstelle einen Bericht als `review-report-YYYY-MM-DD[-N].md`.

### Bericht-Format

```markdown
# Code-Review-Bericht

**Datum:** YYYY-MM-DD
**Scope:** [Gesamter Code / Beschriebener Bereich]
**Projekt-Typ:** [Frontend / Backend / CLI / Fullstack]

## Zusammenfassung

| Schweregrad | Anzahl |
|---|---|
| Kritisch | X |
| Wichtig | Y |
| Hinweis | Z |

| Komplexität | Anzahl |
|---|---|
| Leicht | X |
| Mittel | Y |
| Schwer | Z |

| Aktion | Anzahl |
|---|---|
| $sf-fix | X |
| $sf-refactor | Y |
| $sf-build-feature | Z |

## Findings

### [R-001] [Titel]
- **Schweregrad**: Kritisch / Wichtig / Hinweis
- **Komplexität**: Leicht / Mittel / Schwer
- **Bereich**: [...]
- **Datei**: [pfad:zeile]
- **Problem**: [...]
- **Empfehlung**: [...]
- **Aktion**: `$sf-fix` | `$sf-refactor` | `$sf-build-feature`
- **Prompt-Vorschlag**: [...]

## Übersprungene Findings (Designentscheidungen)

| Finding | Designentscheidung | Quelle |
|---|---|---|
| [...] | [DD-XXX] | [...] |
```

6. Präsentiere dem User die wichtigsten Findings und weise auf die gespeicherte Report-Datei hin.

Wenn der User nur kritische und wichtige Findings angefordert hat:

- nimm Hinweise nicht in den Hauptbericht auf
- erwähne kurz, dass Hinweise bewusst ausgefiltert wurden

## Regeln

- Starte unabhängige Reviewer bei Fullstack parallel
- dieser Skill liest nur und schreibt nur den Review-Bericht
- kein Wisdom Accumulation nötig
- Prompt-Vorschläge müssen ohne Anführungszeichen und ohne Escape-Sequenzen direkt kopierbar sein
- der gewählte Finding-Scope muss vor dem Review geklärt und im Bericht respektiert werden
