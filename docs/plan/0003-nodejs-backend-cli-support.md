# 0003: Node.js Backend- und CLI-Unterstuetzung

## Anforderung

Das Plugin soll neben Frontend-Entwicklung auch Node.js Backend-Code, CLI-Tools und allgemeine Node.js-Anwendungen unterstuetzen. Die bestehenden Commands (`/build-feature`, `/fix`, `/refactor`) sollen automatisch erkennen ob Frontend oder Backend/CLI und die passenden Agents waehlen.

## Architekturentscheidungen

- **Erweiterung statt neues Plugin:** Neue Agents werden im bestehenden Plugin `sf-frontend-workflows` hinzugefuegt, kein separates Plugin. Begruendung: Einfachere Installation, gemeinsame Infrastruktur (Wisdom Accumulation, Retry-Eskalation).
- **Framework-agnostisch:** Keine Bindung an ein bestimmtes Framework (Express, Fastify, NestJS). Der Agent passt sich dem im Projekt verwendeten Framework an.
- **Auto-Detection:** Die Commands erkennen den Projekt-Typ anhand von Dateisystem-Signalen und package.json Dependencies und routen automatisch zum passenden Agent.
- **Fullstack-Support:** Bei Projekten die sowohl Frontend als auch Backend enthalten, werden beide Agent-Paare parallel gestartet.

## Betroffene Dateien

### Neue Dateien

| Datei | Beschreibung |
|---|---|
| `sf-frontend-workflows/agents/nodejs-implementer.md` | Node.js-Implementierungs-Agent: Backend APIs, CLI-Tools, Node.js-Apps, DB, Error Handling, Security, Logging |
| `sf-frontend-workflows/agents/nodejs-reviewer.md` | Node.js-Review-Agent: API Design, Security (OWASP), Performance, Error Handling, CLI Quality |

### Geaenderte Dateien

| Datei | Aenderung |
|---|---|
| `sf-frontend-workflows/agents/test-writer.md` | Backend-Test-Patterns ergaenzt (API-Tests, CLI-Tests, DB-Tests) |
| `sf-frontend-workflows/agents/e2e-tester.md` | API-Integrationstests und CLI-Smoke-Tests ergaenzt |
| `sf-frontend-workflows/agents/code-documenter.md` | Generalisiert von "Frontend" zu "TypeScript/JavaScript", REST/CLI-Docs ergaenzt |
| `sf-frontend-workflows/agents/docs-writer.md` | Generalisiert, API-Dokumentation und CLI-Dokumentation ergaenzt |
| `sf-frontend-workflows/agents/ui-implementer.md` | Umlaut-Korrektur (ae statt ä) |
| `sf-frontend-workflows/commands/build-feature.md` | Auto-Detection, Agent-Routing, Model-Routing-Tabelle erweitert |
| `sf-frontend-workflows/commands/fix.md` | Auto-Detection, Agent-Routing, Model-Routing-Tabelle erweitert |
| `sf-frontend-workflows/commands/refactor.md` | Auto-Detection, Agent-Routing, Model-Routing-Tabelle erweitert |
| `.claude-plugin/marketplace.json` | Description und Tags erweitert |
| `sf-frontend-workflows/.claude-plugin/plugin.json` | Description erweitert |
| `README.md` | Neue Agents dokumentiert, Auto-Detection beschrieben |

## Implementierungsdetails

### Auto-Detection-Mechanismus

Der Explore-Agent in Phase 1 jedes Workflows bestimmt den Projekt-Typ:

| Signal | Projekt-Typ |
|---|---|
| React/Vue/Angular/Svelte Dependencies, src/components/, JSX/TSX | Frontend |
| Express/Fastify/Hono/Koa Dependencies, src/routes/, src/controllers/ | Backend API |
| bin/, commander/yargs/meow Dependencies | CLI |
| Kombination | Fullstack |

### Agent-Routing

| Projekt-Typ | Implementer | Reviewer |
|---|---|---|
| Frontend | ui-implementer | frontend-reviewer |
| Backend / CLI / Node.js | nodejs-implementer | nodejs-reviewer |
| Fullstack | beide parallel | beide parallel |

### Model-Routing

| Agent | Model |
|---|---|
| nodejs-implementer | opus |
| nodejs-reviewer | opus |

## Review-Findings und Behebung

| Finding | Schweregrad | Behebung |
|---|---|---|
| nodejs-implementer hatte model: sonnet statt opus | Kritisch | Frontmatter auf model: opus geaendert |
| nodejs-implementer fehlte color-Feld | Wichtig | color: cyan hinzugefuegt |
| Fehlender Logging-Abschnitt im nodejs-implementer | Wichtig | Logging-Abschnitt ergaenzt |
| Umlaut in ui-implementer.md | Wichtig | "praezise" statt "präzise" |

## Testergebnisse

Nicht anwendbar — das Projekt besteht ausschliesslich aus Markdown- und JSON-Dateien ohne Build-System oder Test-Framework.
