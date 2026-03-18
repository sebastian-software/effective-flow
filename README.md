# SF Frontend Workflows

Claude Code Plugin mit orchestrierten Workflows fuer Frontend-Entwicklung und Node.js Backend/CLI-Projekte.

## Commands

| Command | Beschreibung |
|---|---|
| `/build-feature` | Kompletter Feature-Workflow: Planung, Implementierung, Docs, Tests, Review |
| `/fix` | Bugfix-Workflow: Investigation, Reproduktion, Fix, Verifikation |
| `/refactor` | Refactoring mit vorher/nachher-Validierung und Verhaltens-Invarianz |
| `/review` | Umfassendes Code-Review mit strukturiertem Bericht, Designentscheidungs-Erkennung und actionable Findings |

## Agents

| Agent | Model | Aufgabe |
|---|---|---|
| ui-implementer | opus | Frontend-Produktionscode schreiben |
| nodejs-implementer | opus | Backend/CLI-Produktionscode schreiben |
| frontend-reviewer | opus | Code-Review mit A11y, Performance, UI-Patterns |
| nodejs-reviewer | opus | Code-Review mit API Design, Security, Performance |
| code-validator | sonnet | TypeScript, Linting, Build-Validierung |
| code-documenter | sonnet | JSDoc/TSDoc fuer neue/geaenderte Exports |
| docs-writer | sonnet | README/Guide-Updates |
| test-writer | sonnet | Unit- und Komponententests |
| e2e-tester | sonnet | End-to-End-Tests mit Playwright |

## Auto-Detection

Die Commands erkennen automatisch den Projekt-Typ (Frontend, Backend API, CLI, Fullstack) anhand von Dateisystem-Signalen und package.json Dependencies. Basierend darauf werden die passenden Implementer- und Reviewer-Agents ausgewaehlt. Bei Fullstack-Projekten arbeiten Frontend- und Backend-Agents parallel.

## Designentscheidungs-Erkennung

Der `/review`-Command erkennt dokumentierte Designentscheidungen im Zielprojekt und filtert Findings heraus, die bewussten Entscheidungen widersprechen. Erkannte Quellen:

- Architecture Decision Records (ADR) in `docs/decisions/`, `docs/adr/`
- Planungs-Dateien in `docs/plan/`
- CLAUDE.md-Sections (z.B. "Design Decisions", "Konventionen")
- Code-Kommentare (`// @design-decision:`, `// DELIBERATE:`, `// INTENTIONAL:`)
- Lint-Suppressions mit Begruendung (`// eslint-disable ... -- [Grund]`)
- Vorherige Review-Reports (`review-report-*.md`)

Uebersprungene Findings werden im Bericht transparent im Abschnitt "Uebersprungene Findings (Designentscheidungen)" dokumentiert.

## ADR-Generierung

Wenn Review-Findings bewusst nicht umgesetzt werden, bieten `/build-feature`, `/refactor` und `/review` an, diese Entscheidungen als Architecture Decision Records (ADR) in `docs/adr/` zu dokumentieren. Der User wird gefragt ob ADRs angelegt werden sollen — es passiert nicht automatisch. Die generierten ADRs werden bei zukuenftigen `/review`-Laeufen automatisch erkannt und verhindern, dass dieselben Findings erneut gemeldet werden.

## Installation

1. Plugin in `settings.json` als Custom Marketplace registrieren:

```json
{
  "enabledPlugins": {
    "sf-frontend-workflows@sf-claude-plugin": true
  }
}
```

2. Falls noetig, den Marketplace-Pfad in der Claude Code Config hinterlegen (siehe unten).

## Gemeinsame Patterns

Alle Workflows nutzen:
- **Fertig-Protokoll**: Agents enden mit `ERLEDIGT` oder `ABBRUCH: [Grund]`
- **Retry-Eskalation**: 3 Versuche mit zunehmendem Scope-Reduktion
- **Wisdom Accumulation**: Erkenntnisse werden phasenuebergreifend weitergegeben (nicht genutzt von `/review`, da rein analytisch)
- **Model-Routing**: Kostenoptimierte Modellwahl pro Agent
- **Gap Analysis (Metis-Pattern)**: Adversariale Pruefung auf blinde Flecken
- **Plan-Validierung (Momus-Pattern)**: Messbare Qualitaetscheckliste
