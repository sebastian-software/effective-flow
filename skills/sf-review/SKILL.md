---
name: sf-review
description: "Orchestriert ein umfassendes Code-Review als Codex-Skill: Scope-Bestimmung, Designentscheidungs-Erkennung, technische Validierung, fachliches Review, Findings-Qualitaetspruefung und Berichtserstellung mit Prompt-Vorschlaegen fuer $sf-fix, $sf-refactor oder $sf-build-feature."
---

# SF Review

Du bist der Orchestrator fuer umfassende Code-Reviews.

## Ziel

Dieser Workflow analysiert Code-Qualitaet und erstellt einen strukturierten Bericht, dessen Findings direkt als Input fuer `$sf-fix`, `$sf-refactor` und `$sf-build-feature` dienen koennen.

## Standard-Sprachregel

- Code, Tests und Commit-Konventionen im Regelfall gegen englische Benennung reviewen
- Dokumentationssprache ist Deutsch, ausser bestehende Doku fuehrt eine andere Sprache fort

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor dem Review und behandle ihre Vorgaben als zusaetzlichen Review-Kontext fuer Scope, Konventionen, Designentscheidungen und Qualitaetskriterien.

## Scope-Bestimmung

- Ohne Argumente: pruefe auf uncommitted Changes; falls vorhanden, reviewe nur diese, sonst den gesamten Code
- Mit Argumenten: nur der beschriebene Bereich

## Fertig-Protokoll

Wenn interne Sub-Agenten verwendet werden, gilt `ERLEDIGT` / `ABBRUCH: [Grund]` mit Retry-Eskalation wie in den anderen Workflows.

## Designentscheidungs-Erkennung

Der Review-Workflow erkennt dokumentierte Designentscheidungen, damit Findings gegen bewusste Entscheidungen nicht faelschlich als Probleme gemeldet werden.

### Quellen

| Quelle | Typische Pfade / Muster |
|---|---|
| ADR | `docs/decisions/`, `docs/adr/`, `adr/`, `*.adr.md` |
| Planungs-Dateien | `docs/plan/`, `plans/` |
| Konventions-Dateien | `CLAUDE.md`, `AGENTS.md`, vergleichbare Konventionsdateien |
| Code-Kommentare | `@design-decision`, `DELIBERATE`, `INTENTIONAL`, `DESIGN:` |
| Lint-Suppressions mit Begruendung | `eslint-disable ... -- [Grund]`, `@ts-expect-error [Grund]` |
| Vorherige Review-Reports | `review-report-*.md` |

### Ausgabeformat fuer Designentscheidungen

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
   - pruefe `git diff --name-only`
   - pruefe `git diff --cached --name-only`
   - falls Aenderungen vorhanden: reviewe nur diese Dateien
   - sonst den gesamten Code
3. Untersuche Projektstruktur und Projekt-Typ.
4. Sammle Designentscheidungen aus allen Quellen.
5. Bestimme den finalen Review-Scope.
6. Hole User-Bestaetigung ein, wenn Scope oder Review-Ziel unklar ist.

### Phase 2: Technische Validierung

1. Starte `$sf-code-validator` im Check-Modus:
   - TypeScript
   - Lint
   - Build
   - keine Fixes
2. Sammle alle technischen Probleme.
3. Gib dem User eine kurze Statusmeldung.

### Phase 3: Qualitaets-Review

1. Starte den oder die passenden Reviewer-Skills.
2. Auftrag an Reviewer:
   - umfassendes Review des Scopes
   - fuer jedes Finding:
     - Schweregrad
     - Bereich
     - Datei + Zeile
     - Problem
     - Loesung
     - Konfidenz
     - Komplexitaet
   - dokumentierte Designentscheidungen beachten
   - bei Widerspruch Konfidenz auf 0 setzen und mit Designentscheidung markieren
3. Sammle die Findings pro Reviewer.

### Phase 4: Bericht

1. Aggregiere Findings aus technischer Validierung und Fachreview.
2. Fuehre Findings-Qualitaetspruefung durch:
   - Konfidenz < 80 herausfiltern
   - Duplikate entfernen
   - Schweregrad-Konsistenz pruefen
   - Designentscheidungs-Abgleich durchfuehren
3. Bestimme fuer jedes verbleibende Finding die Folgeaktion:
   - Defekt -> `$sf-fix`
   - strukturelles Problem -> `$sf-refactor`
   - fehlende Funktionalitaet / Schutzmechanismus -> `$sf-build-feature`
4. Formuliere Prompt-Vorschlaege.
   - schreibe sie als direkt kopierbaren Klartext
   - verwende keine umschliessenden Anfuehrungszeichen
   - verwende keine Escape-Sequenzen wie `\"`
   - formuliere sie so, dass sie direkt per Copy-und-Paste in Codex verwendet werden koennen
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

| Komplexitaet | Anzahl |
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
- **Komplexitaet**: Leicht / Mittel / Schwer
- **Bereich**: [...]
- **Datei**: [pfad:zeile]
- **Problem**: [...]
- **Empfehlung**: [...]
- **Aktion**: `$sf-fix` | `$sf-refactor` | `$sf-build-feature`
- **Prompt-Vorschlag**: [...]

## Uebersprungene Findings (Designentscheidungen)

| Finding | Designentscheidung | Quelle |
|---|---|---|
| [...] | [DD-XXX] | [...] |
```

6. Praesentiere dem User die wichtigsten Findings und weise auf die gespeicherte Report-Datei hin.

## Regeln

- Starte unabhaengige Reviewer bei Fullstack parallel
- dieser Skill liest nur und schreibt nur den Review-Bericht
- kein Wisdom Accumulation noetig
- Prompt-Vorschlaege muessen ohne Anfuehrungszeichen und ohne Escape-Sequenzen direkt kopierbar sein
