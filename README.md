# SF Frontend Workflows

Claude Code Plugin mit orchestrierten Workflows fuer Frontend-Entwicklung.

## Commands

| Command | Beschreibung |
|---|---|
| `/build-feature` | Kompletter Feature-Workflow: Planung, Implementierung, Docs, Tests, Review |
| `/fix` | Bugfix-Workflow: Investigation, Reproduktion, Fix, Verifikation |
| `/refactor` | Refactoring mit vorher/nachher-Validierung und Verhaltens-Invarianz |

## Agents

| Agent | Model | Aufgabe |
|---|---|---|
| ui-implementer | opus | Produktions-Code schreiben |
| frontend-reviewer | opus | Code-Review mit A11y, Performance, UI-Patterns |
| code-validator | sonnet | TypeScript, Linting, Build-Validierung |
| code-documenter | sonnet | JSDoc/TSDoc fuer neue/geaenderte Exports |
| docs-writer | sonnet | README/Guide-Updates |
| test-writer | sonnet | Unit- und Komponententests |
| e2e-tester | sonnet | End-to-End-Tests mit Playwright |

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
- **Wisdom Accumulation**: Erkenntnisse werden phasenuebergreifend weitergegeben
- **Model-Routing**: Kostenoptimierte Modellwahl pro Agent
- **Gap Analysis (Metis-Pattern)**: Adversariale Pruefung auf blinde Flecken
- **Plan-Validierung (Momus-Pattern)**: Messbare Qualitaetscheckliste
