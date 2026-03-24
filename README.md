# SF Skills

Dual-Platform Skills für Codex und Claude Code.

## Plattformen

| Plattform | Aufruf | Zielverzeichnis |
|---|---|---|
| Codex | `$sf-<name>` | `~/.codex/skills/` |
| Claude Code | `/sf-<name>` | `~/.claude/skills/` |

## Skills

| Skill | Beschreibung |
|---|---|
| `sf-build-feature` | Orchestriert den kompletten Feature-Workflow |
| `sf-fix` | Bugfix-Workflow |
| `sf-refactor` | Refactoring-Workflow |
| `sf-review` | Umfassendes Code-Review |
| `sf-commit` | Commit-Message für gestagte Änderungen |
| `sf-ui-implementer` | Frontend-Implementierung |
| `sf-nodejs-implementer` | Backend/CLI-Implementierung |
| `sf-frontend-reviewer` | Frontend-Review |
| `sf-nodejs-reviewer` | Backend/CLI-Review |
| `sf-code-validator` | TypeScript, Lint, Build-Validierung |
| `sf-code-documenter` | In-Code-Dokumentation |
| `sf-docs-writer` | User-Dokumentation |
| `sf-test-writer` | Unit-Tests |
| `sf-e2e-tester` | E2E-Tests |

## Installation

```sh
./local-update.sh
```

Das Script:
1. Baut die Skills für beide Plattformen (`dist/codex/`, `dist/claude/`)
2. Kopiert sie nach `~/.codex/skills/` und `~/.claude/skills/`

Für Symlinks statt Kopien:

```sh
./local-link.sh
```

## Build

Die Source-Dateien in `skills/` verwenden Platzhalter-Syntax:

```
{{SKILL:sf-commit}}
```

Zur Build-Zeit wird transformiert:
- Codex: `$sf-commit`
- Claude Code: `/sf-commit`

Nur Build ausführen (ohne Deployment):

```sh
./build.sh
```

## Struktur

```text
sf-claude-plugin/
├── skills/                    # Source (Platzhalter-Syntax)
│   ├── sf-build-feature/SKILL.md
│   └── ...
├── dist/                      # Generiert (gitignored)
│   ├── codex/                 # $sf-* Syntax
│   └── claude/                # /sf-* Syntax
├── build.sh
├── local-update.sh
└── local-link.sh
```

## Orchestrierung

Die Workflow-Skills verwenden explizite Skill-Wechsel im Prompt:

```text
Verwende den Skill {{SKILL:sf-ui-implementer}} für diese Phase.
```

## Sprachregeln

Sofern der User nichts anderes verlangt:

- Code, Bezeichner, Tests und Commit-Messages sind auf Englisch
- Dokumentation ist auf Deutsch
- Bestehende Dokumentationssprache wird fortgeführt

## Migration

Details zu bewusst nicht 1:1 portierbaren Claude-Mechaniken stehen in [docs/skill-migration-notes.md](/Users/bs5/Developer/sf-claude-plugin/docs/skill-migration-notes.md).
