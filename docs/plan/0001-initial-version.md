# 0001: Erste Version — sf-frontend-workflows Plugin

## Anforderung

Ein Claude Code Plugin für orchestrierte Frontend-Entwicklungs-Workflows mit spezialisierten Agents und Commands erstellen.

## Architekturentscheidungen

- **Plugin-Struktur:** Marketplace-Manifest (`.claude-plugin/marketplace.json`) als Einstiegspunkt, Plugin-Definition in eigenem Unterverzeichnis (`sf-frontend-workflows/.claude-plugin/plugin.json`)
- **Orchestrierte Commands:** Drei Haupt-Workflows (`build-feature`, `fix`, `refactor`) als Slash-Commands die spezialisierte Agents koordinieren
- **Spezialisierte Agents:** Sieben Agents mit klar definierten Verantwortlichkeiten (ui-implementer, code-validator, frontend-reviewer, code-documenter, test-writer, e2e-tester, docs-writer)
- **Wisdom Accumulation:** Session-isolierte `.wisdom-accumulation.tmp.md`-Dateien mit eindeutigen Session-IDs um Konflikte bei parallelen Workflows zu vermeiden

## Betroffene Dateien

| Datei                                               | Beschreibung                                           |
| --------------------------------------------------- | ------------------------------------------------------ |
| `.claude-plugin/marketplace.json`                   | Marketplace-Manifest mit Plugin-Metadaten (v1.0.0)     |
| `README.md`                                         | Projektbeschreibung und Installationsanleitung         |
| `sf-frontend-workflows/.claude-plugin/plugin.json`  | Plugin-Definition mit Agent- und Command-Registrierung |
| `sf-frontend-workflows/agents/ui-implementer.md`    | Agent für UI-Komponenten und Frontend-Code             |
| `sf-frontend-workflows/agents/code-validator.md`    | Agent für Linting, Type-Checking, Build-Validierung    |
| `sf-frontend-workflows/agents/frontend-reviewer.md` | Agent für Frontend-spezifisches Code-Review            |
| `sf-frontend-workflows/agents/code-documenter.md`   | Agent für In-Code-Dokumentation (JSDoc, TSDoc)         |
| `sf-frontend-workflows/agents/test-writer.md`       | Agent für Unit-/Integrationstests                      |
| `sf-frontend-workflows/agents/e2e-tester.md`        | Agent für Playwright E2E-Tests                         |
| `sf-frontend-workflows/agents/docs-writer.md`       | Agent für End-User-Dokumentation                       |
| `sf-frontend-workflows/commands/build-feature.md`   | Workflow: Feature-Implementierung bis Review           |
| `sf-frontend-workflows/commands/fix.md`             | Workflow: Bugfix von Diagnose bis Validierung          |
| `sf-frontend-workflows/commands/refactor.md`        | Workflow: Refactoring mit vorher/nachher-Validierung   |

## Implementierungsdetails

- Commands orchestrieren Agents in einer definierten Reihenfolge mit Zwischenergebnissen
- Jeder Command sammelt Erkenntnisse in einer session-isolierten Wisdom-Datei (`SESSION_ID` als Präfix)
- Agents laufen teilweise parallel (z.B. Validator + Reviewer), teilweise sequenziell (Implementierung vor Review)

## Commits

| Hash      | Beschreibung                                                                 |
| --------- | ---------------------------------------------------------------------------- |
| `9a196d3` | feat: add sf-frontend-workflows plugin with orchestrated agents and commands |
| `ed88fd4` | feat: add session-isolated wisdom accumulation for parallel workflows        |

## Testergebnisse

Nicht anwendbar — initialer Commit ohne bestehenden Review-Prozess.

## Review-Findings und Behebung

Keine — initialer Commit.
