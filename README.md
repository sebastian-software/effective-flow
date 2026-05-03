# SF Skills

Dual-Platform Workflow-System für Codex und Claude Code — aus einer einzigen Quelle.

## Architektur

Das System unterscheidet drei Typen:

| Typ | Beschreibung | Codex | Claude Code |
|---|---|---|---|
| **Orchestrator** | Workflow-Steuerung | Skill (`$sf-*`) | Command (`/name`) |
| **Agent** | Spezialisierte Worker | Custom Agent (TOML) | Agent (Subagent) |
| **Utility** | Standalone-Tools | Skill (`$sf-*`) | Command (`/name`) |

### Orchestratoren (ruft User auf)

| Name | Beschreibung |
|---|---|
| `sf-build-feature` | Kompletter Feature-Workflow |
| `sf-fix` | Bugfix-Workflow |
| `sf-refactor` | Refactoring-Workflow |
| `sf-review` | Umfassendes Code-Review |
| `sf-commit` | Commit-Message für gestagte Änderungen |

### Agents (werden von Orchestratoren delegiert)

| Name | Beschreibung | Codex Model | Claude Model |
|---|---|---|---|
| `sf-ui-implementer` | Frontend-Implementierung | gpt-5.4 | sonnet |
| `sf-nodejs-implementer` | Backend/CLI-Implementierung | gpt-5.4 | opus |
| `sf-frontend-reviewer` | Frontend-Review | gpt-5.4 | opus |
| `sf-nodejs-reviewer` | Backend/CLI-Review | gpt-5.4 | opus |
| `sf-code-validator` | TypeScript, Lint, Build-Validierung | gpt-5.3-codex-spark | haiku |
| `sf-code-documenter` | In-Code-Dokumentation | gpt-5.3-codex-spark | sonnet |
| `sf-docs-writer` | User-Dokumentation | gpt-5.3-codex-spark | sonnet |
| `sf-test-writer` | Unit-Tests | gpt-5.3-codex-spark | sonnet |
| `sf-e2e-tester` | E2E-Tests | gpt-5.3-codex-spark | sonnet |

## Plattform-Deployment

| Ziel | Pfad |
|---|---|
| Codex Skills | `~/.agents/skills/sf-*/SKILL.md` |
| Codex Agents | `~/.codex/agents/sf-*.toml` |
| Claude Code Plugin | `~/.claude/plugins/sf-frontend-workflows/` |

Empfohlene Codex-Konfiguration (`~/.codex/config.toml`):

```toml
[agents]
max_threads = 6
max_depth = 1
```

## Installation

```sh
./local-update.sh
```

Das Script:
1. Baut für beide Plattformen (`dist/codex/`, `dist/claude/`)
2. Deployed Codex Skills nach `~/.agents/skills/`
3. Deployed Codex Agents nach `~/.codex/agents/`
4. Deployed Claude Code Plugin nach `~/.claude/plugins/`
5. Räumt alte Dateien aus `~/.codex/skills/` und `~/.claude/skills/` auf

Für Symlinks statt Kopien (Entwicklung):

```sh
./local-link.sh
```

## Build

Die Source-Dateien in `skills/` verwenden zwei Platzhalter-Typen:

| Platzhalter | Bedeutung | Claude Code | Codex Skill | Codex TOML |
|---|---|---|---|---|
| `{{SKILL:sf-X}}` | Orchestrator/Utility-Referenz | `/X` | `$sf-X` | `sf-X` |
| `{{AGENT:sf-X}}` | Agent/Worker-Referenz | `/X` | `sf-X` | `sf-X` |
| `{{INCLUDE:name}}` | Shared-Datei aus `skills/_shared/name.md` | Inhalt eingebettet | Inhalt eingebettet | Inhalt eingebettet |

Nur Build ausführen (ohne Deployment):

```sh
node build.mjs
```

## Struktur

```text
sf-claude-plugin/
├── skills/                          # Source (Platzhalter-Syntax)
│   ├── _shared/                     # Gemeinsame Inhalte ({{INCLUDE:…}})
│   │   └── language-rules.md        # Zentrale Sprach- und Typografie-Regeln
│   ├── sf-build-feature/SKILL.md    # type: orchestrator
│   ├── sf-ui-implementer/SKILL.md   # type: agent
│   └── ...
├── dist/                            # Generiert (gitignored)
│   ├── codex/
│   │   ├── skills/sf-*/SKILL.md     # Orchestratoren + Utilities
│   │   └── agents/sf-*.toml         # Worker als Custom Agents
│   └── claude/
│       └── sf-claude-plugin/
│           ├── .claude-plugin/marketplace.json
│           └── plugins/sf-frontend-workflows/
│               ├── commands/*.md     # Orchestratoren + Utilities
│               └── agents/*.md       # Worker als Agents
├── build.mjs
├── local-update.sh
└── local-link.sh
```

## Source-Frontmatter

### Orchestratoren

```yaml
---
name: sf-build-feature
description: "..."
type: orchestrator
---
```

### Agents

```yaml
---
name: sf-ui-implementer
description: "..."
type: agent
claude:
  model: sonnet
  color: cyan
  tools: [Read, Write, Edit, Bash, Glob, Grep]
  skills: [frontend-design, effective-ui-design]
codex:
  model: gpt-5.4
  model_reasoning_effort: high
  sandbox_mode: full
---
```

## Sprachregeln

Sofern der User nichts anderes verlangt:

- Code, Bezeichner, Tests und Commit-Messages sind auf Englisch
- Dokumentation ist auf Deutsch
- Bestehende Dokumentationssprache wird fortgeführt

## Migration

Details zu bewusst nicht 1:1 portierbaren Claude-Mechaniken stehen in [docs/skill-migration-notes.md](docs/skill-migration-notes.md).
