---
name: sf-review
description: "Orchestriert ein umfassendes Code-Review: Scope-Bestimmung, Designentscheidungs-Erkennung, technische Validierung, fachliches Review, Findings-Qualitätsprüfung und Berichtserstellung mit Prompt-Vorschlägen für {{SKILL:sf-fix}}, {{SKILL:sf-refactor}} oder {{SKILL:sf-build-feature}}."
type: orchestrator
---

# SF Review

Du bist der Orchestrator für umfassende Code-Reviews.

## Ziel

Dieser Workflow analysiert Code-Qualität und erstellt einen strukturierten Bericht, dessen Findings direkt als Input für `{{SKILL:sf-fix}}`, `{{SKILL:sf-refactor}}` und `{{SKILL:sf-build-feature}}` dienen können.

## Standard-Sprachregel

- Code, Tests und Commit-Konventionen im Regelfall gegen englische Benennung reviewen
- Dokumentationssprache ist Deutsch, außer bestehende Doku führt eine andere Sprache fort

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor dem Review und behandle ihre Vorgaben als zusätzlichen Review-Kontext für Scope, Konventionen, Designentscheidungen und Qualitätskriterien.

## Scope-Bestimmung

- Ohne Argumente: prüfe auf uncommitted Changes; falls vorhanden, reviewe nur diese, sonst den gesamten Code
- Mit Argumenten: nur der beschriebene Bereich

## Finding-Scope

Der Standard-Finding-Scope ist **nur kritische und wichtige Findings**. Hinweise werden nur dann in den Bericht aufgenommen, wenn der User explizit ein umfassendes oder vollständiges Review verlangt (z. B. „umfassendes Review", „alle Findings", „inklusive Hinweise").

Weise den User zu Beginn kurz darauf hin, dass standardmässig nur kritische und wichtige Findings berichtet werden und ein umfassendes Review auf Wunsch möglich ist.

Verwende den aktiven Finding-Scope als Filter für Reviewer-Auftrag, Aggregation, Bericht und Zusammenfassung.

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

Wie bei `{{SKILL:sf-build-feature}}`.

Reviewer-Routing:

- Frontend -> `{{AGENT:sf-frontend-reviewer}}`
- Backend / CLI / Node.js -> `{{AGENT:sf-nodejs-reviewer}}`
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
6. Bestimme den aktiven Finding-Scope: Standard ist nur kritisch+wichtig, es sei denn, der User hat explizit ein umfassendes Review verlangt.
7. Hole User-Bestätigung ein, wenn Scope oder Review-Ziel unklar ist.

{{ASK}}
header: Review-Scope
question: Review-Scope bestätigt?
type: approval
{{/ASK}}

### Phase 2: Technische Validierung

1. Starte `{{AGENT:sf-code-validator}}` im Check-Modus:
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
   - beachte den aktiven Finding-Scope
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
   - Findings ausserhalb des aktiven Finding-Scopes aus dem Hauptbericht herausfiltern
3. Dokumentations- und ADR-Gegenprüfung:
   - lies alle in Phase 1 gesammelten Designentscheidungen sowie die Quellen aus der Tabelle unter „Designentscheidungs-Erkennung" (ADRs, Planungs-Dateien, Konventions-Dateien, Code-Kommentare, Lint-Suppressions, vorherige Review-Reports) noch einmal gezielt
   - prüfe jedes nach Schritt 2 verbliebene Finding einzeln, ob es durch eine dokumentierte Designentscheidung, eine ADR, eine Konvention oder einen begründeten Code-Kommentar bereits als bewusste Entscheidung abgedeckt ist
   - bei Treffer: Finding aus dem Hauptbericht entfernen und in die Tabelle „Übersprungene Findings (Designentscheidungen)" verschieben mit Quellenangabe
   - bei Unsicherheit (teilweise Überlappung): Finding im Bericht belassen, aber mit Hinweis auf die möglicherweise relevante Designentscheidung versehen
4. Bestimme für jedes verbleibende Finding die Folgeaktion:
   - Defekt -> `{{SKILL:sf-fix}}`
   - strukturelles Problem -> `{{SKILL:sf-refactor}}`
   - fehlende Funktionalität / Schutzmechanismus -> `{{SKILL:sf-build-feature}}`
5. Formuliere Prompt-Vorschläge.
   - schreibe sie als direkt kopierbaren Klartext
   - verwende keine umschliessenden Anführungszeichen
   - verwende keine Escape-Sequenzen wie `\"`
   - formuliere sie so, dass sie direkt per Copy-und-Paste verwendet werden können
6. Erstelle einen Bericht als `review-report-YYYY-MM-DD[-N].md`.

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
| {{SKILL:sf-fix}} | X |
| {{SKILL:sf-refactor}} | Y |
| {{SKILL:sf-build-feature}} | Z |

## Findings

### [R-001] [Titel]
- **Schweregrad**: Kritisch / Wichtig / Hinweis
- **Komplexität**: Leicht / Mittel / Schwer
- **Bereich**: [...]
- **Datei**: [pfad:zeile]
- **Problem**: [...]
- **Empfehlung**: [...]
- **Aktion**: `{{SKILL:sf-fix}}` | `{{SKILL:sf-refactor}}` | `{{SKILL:sf-build-feature}}`
- **Prompt-Vorschlag**: [...]
- **Entwickler-Anmerkung**: <!-- leer lassen, Freitext, oder „Nicht umsetzen: [Grund]" -->

## Übersprungene Findings (Designentscheidungen)

| Finding | Designentscheidung | Quelle |
|---|---|---|
| [...] | [DD-XXX] | [...] |
```

Wenn ein Finding später über `{{SKILL:sf-fix}}`, `{{SKILL:sf-refactor}}` oder `{{SKILL:sf-build-feature}}` umgesetzt wird, darf die bestehende Report-Datei am betroffenen Finding um einen kurzen Statushinweis ergänzt werden, zum Beispiel `Umgesetzt am YYYY-MM-DD via {{SKILL:sf-fix}}`.

7. Präsentiere dem User die wichtigsten Findings und weise auf die gespeicherte Report-Datei hin.

Wenn der aktive Finding-Scope nur kritische und wichtige Findings umfasst (Standard):

- nimm Hinweise nicht in den Hauptbericht auf
- erwähne kurz, dass Hinweise ausgefiltert wurden und ein umfassendes Review auf Wunsch möglich ist

## Regeln

- Starte unabhängige Reviewer bei Fullstack parallel
- dieser Skill liest nur und schreibt nur den Review-Bericht
- kein Wisdom Accumulation nötig
- Prompt-Vorschläge müssen ohne Anführungszeichen und ohne Escape-Sequenzen direkt kopierbar sein
- der aktive Finding-Scope (Standard: nur kritisch+wichtig) muss im Bericht respektiert werden
