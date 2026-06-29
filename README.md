# SF Skills

Dual-Platform Workflow-System für Codex und Claude Code — aus einer einzigen Quelle.

## Architektur

Das System unterscheidet drei Typen:

| Typ              | Beschreibung          | Codex               | Claude Code       |
| ---------------- | --------------------- | ------------------- | ----------------- |
| **Orchestrator** | Workflow-Steuerung    | Skill (`$sf-*`)     | Command (`/name`) |
| **Agent**        | Spezialisierte Worker | Custom Agent (TOML) | Agent (Subagent)  |
| **Utility**      | Standalone-Tools      | Skill (`$sf-*`)     | Command (`/name`) |

### Orchestratoren (ruft User auf)

| Name             | Beschreibung                                                                |
| ---------------- | --------------------------------------------------------------------------- |
| `sf-build`       | Kompletter Feature-Workflow                                                 |
| `sf-apply-plan`  | Offene Plan-Datei an passenden Workflow übergeben                           |
| `sf-plan`        | Reine Implementierungsplanung ohne Code-Änderungen                          |
| `sf-open-plans`  | Offene Plan-Dateien mit Kurzfassung auflisten                               |
| `sf-docs`        | Dokumentations-Workflow                                                     |
| `sf-fix`         | Bugfix-Workflow                                                             |
| `sf-refactor`    | Refactoring-Workflow                                                        |
| `sf-investigate` | Fehler- und Verhaltensinvestigation (Analyse-only, Diagnose-Report)         |
| `sf-review`      | Umfassendes Code-Review                                                     |
| `sf-maintain`    | Schlanke Wartung: Dependency-Updates, Audit-Fixes, Breaking-Change-Adaption |
| `sf-commit`      | Commit-Message für gestagte Änderungen                                      |
| `sf-pr`          | Pull-Request aus einem Branch auf GitHub (`gh`) oder Forgejo (`tea`)        |

### Agents (werden von Orchestratoren delegiert)

| Name                    | Beschreibung                        | Codex Model  | Claude Model |
| ----------------------- | ----------------------------------- | ------------ | ------------ |
| `sf-ui-implementer`     | Frontend-Implementierung            | gpt-5.5      | sonnet       |
| `sf-nodejs-implementer` | Backend/CLI-Implementierung         | gpt-5.5      | opus         |
| `sf-frontend-reviewer`  | Frontend-Review                     | gpt-5.5      | opus         |
| `sf-nodejs-reviewer`    | Backend/CLI-Review                  | gpt-5.5      | opus         |
| `sf-code-validator`     | TypeScript, Lint, Build-Validierung | gpt-5.4-mini | haiku        |
| `sf-code-documenter`    | In-Code-Dokumentation               | gpt-5.4-mini | sonnet       |
| `sf-docs-writer`        | User-Dokumentation                  | gpt-5.4-mini | sonnet       |
| `sf-test-writer`        | Unit-Tests                          | gpt-5.4-mini | sonnet       |
| `sf-e2e-tester`         | E2E-Tests                           | gpt-5.4-mini | sonnet       |

## Plattform-Deployment

| Ziel               | Pfad                                               |
| ------------------ | -------------------------------------------------- |
| Codex Skills       | `~/.agents/skills/sf-*/SKILL.md`                   |
| Codex Agents       | `~/.codex/agents/sf-*.toml`                        |
| Claude Code Plugin | `~/.claude/plugins/marketplaces/sf-claude-plugin/` |

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
4. Deployed Claude Code Plugin nach `~/.claude/plugins/marketplaces/sf-claude-plugin/`
5. Räumt alte Dateien aus `~/.codex/skills/` und `~/.claude/skills/` auf

Für Symlinks statt Kopien (Entwicklung):

```sh
./local-link.sh
```

## Build

Die Source-Dateien in `skills/` verwenden zwei Arten von Platzhaltern.

**Inline-Referenzen** stehen mitten im Text (auch im Frontmatter-`description:`-String) und nutzen die Mustache-Syntax `{{…}}`:

| Platzhalter      | Bedeutung                     | Claude Code | Codex Skill | Codex TOML |
| ---------------- | ----------------------------- | ----------- | ----------- | ---------- |
| `{{SKILL:sf-X}}` | Orchestrator/Utility-Referenz | `/X`        | `$sf-X`     | `sf-X`     |
| `{{AGENT:sf-X}}` | Agent/Worker-Referenz         | `/X`        | `sf-X`      | `sf-X`     |
| `{{VERSION}}`    | Version inkl. Git-Kurzhash    | eingesetzt  | eingesetzt  | eingesetzt |

**Block-Direktiven** stehen auf eigenen Zeilen und nutzen einen Code-Fence mit Info-String. Der Fence-Inhalt ist gegen Markdown-Formatter (oxfmt) robust, weil dessen Interior wortwörtlich erhalten bleibt.

Ein `include`-Fence bettet die Shared-Datei `skills/_shared/<name>.md` ein:

```include
task-tracking
```

Ein `ask`-Fence erzeugt eine bedingte User-Frage (Claude Code: `AskUserQuestion`-Block, Codex: Freitextfrage):

```ask
header: Freigabe
question: Plan freigegeben?
type: approval
```

Plan-Dateien verwenden einen stabilen Statusmarker im Kopfbereich. Der Marker darf wahlweise auf Deutsch oder auf Englisch geschrieben werden:

```md
**Planungsstatus:** Nicht umgesetzt
**Empfohlener Workflow:** Feature (`$sf-build`)
```

```md
**Plan status:** Not implemented
**Empfohlener Workflow:** Feature (`$sf-build`)
```

Akzeptierte Werte sind `Nicht umgesetzt`/`Umgesetzt` (Deutsch) und `Not implemented`/`Implemented` (Englisch). Pro Plan-Datei wird nur eine Sprache verwendet; beim Statuswechsel auf abgeschlossen bleibt die ursprüngliche Markersprache erhalten. Die Workflow-Empfehlung `**Empfohlener Workflow:**` bleibt in beiden Markersprachen auf Deutsch.

`sf-build`, `sf-fix`, `sf-refactor`, `sf-docs`, `sf-apply-plan` und `sf-open-plans` werten nur diese kanonische Statuszeile aus. Andere Vorkommen von „Nicht umgesetzt", „Umgesetzt", „Not implemented" oder „Implemented" in Review-Findings oder Fließtext zählen nicht als Planstatus.

Plan-Dateien tragen einen vierstelligen Nummern-Prefix (`NNNN-titel-slug.md`). Jede Nummer ist genau einmal vergeben und die Folge bleibt lückenlos. `sf-plan` reserviert die Nummer zu Beginn der Planung über eine temporäre Plan-Datei, damit parallel erstellte Pläne nicht dieselbe Nummer wählen. Entsteht über getrennte Branches dennoch eine Dublette, lösen die Workflows sie beim nächsten Scan in Planungsreihenfolge auf.

Neue Pläne enthalten zusätzlich eine Workflow-Empfehlung: Feature, Bugfix, Refactoring oder Dokumentation. Offene Pläne können direkt mit `sf-build`, `sf-fix`, `sf-refactor` oder `sf-docs` als Grundlage verwendet werden; alternativ liest `sf-apply-plan` die Empfehlung aus und übergibt den Plan an den passenden Workflow.

Doku-Pläne enthalten im Kopf zwei zusätzliche Zeilen, die das Ziel des finalen Dokuments festlegen:

```md
**Empfohlener Workflow:** Dokumentation (`$sf-docs`)
**Doku-Kategorie:** user-guide
**Ziel-Pfad:** docs/user-guide/installation.md
```

Die vier Doku-Kategorien `user-guide`, `developer-guide`, `operations` und `runbooks` sind in `skills/_shared/doc-categories.md` definiert und werden von `sf-plan`, `sf-docs`, `sf-docs-writer`, `sf-apply-plan` und `sf-open-plans` gemeinsam verwendet.

Nur Build ausführen (ohne Deployment):

```sh
node build.mjs
```

## Goal-getriebene Abschlusssteuerung

Die Workflow-Skills `sf-build`, `sf-fix`, `sf-refactor`, `sf-docs` und `sf-maintain` binden den gemeinsamen Baustein `skills/_shared/goal-completion.md` ein. Er fasst die internen „wiederhole bis fertig"-Schleifen zu einem einheitlichen Muster zusammen: eine vorab deklarierte, messbare Abschlussbedingung, unabhängige Verifikation über die im jeweiligen Workflow vorgesehenen Prüfungen (`sf-code-validator` und, falls eine Review-Phase existiert, der passende Reviewer) sowie ein beschränkter Korrektur-Loop, der bei anhaltendem Fehlschlag an den User eskaliert statt unbegrenzt zu wiederholen.

Zusätzlich gibt jeder dieser Workflows an seiner Freigabe-Grenze einen optionalen, copy-paste-baren `/goal`-String aus. Wer ihn als neue Eingabe einfügt, lässt die verbleibenden Phasen unter dem nativen `/goal` (Codex und Claude Code) autonom laufen; andernfalls läuft der Workflow unverändert gated weiter. Die Approval-Gates bleiben in jedem Fall erhalten. `sf-review` und `sf-plan` nutzen nur die explizite, unabhängig geprüfte Abschlussbedingung ohne Autonom-Loop und ohne `/goal`-String.

`sf-apply-review` bindet den Baustein ebenfalls ein: Es bündelt Commit-Strategie und die Stash-Behandlung (`applyReview.stashPolicy`) zu einem einzigen Up-front-Strategie-Gate in Phase 2, begrenzt den finalen Validierungs-Loop und gibt danach den `/goal`-String für die Phasen 3–8 aus. Mit `stashPolicy: keep` läuft die Finding-Abarbeitung ohne reguläre Rückfrage; verbleibende Stopps sind nur konfliktbedingte Eskalationen (z. B. ein `apply`-Merge-Konflikt bei der Stash-Bereinigung oder ein risikoreicher Cherry-Pick-Konflikt bei der Strategie „Einzeln mit Worktrees"). Der Default `interactive` erhält das bisherige Pro-Stash-Nachfragen.

## Worktree-Integration

Die Code-ändernden Workflows `sf-build`, `sf-fix`, `sf-refactor`, `sf-docs` und `sf-maintain` binden den gemeinsamen Baustein `skills/_shared/worktree-integration.md` ein. Er verknüpft diese Workflows optional mit Git-Worktrees und Pull-Requests, damit parallel auf dem lokalen Repo gearbeitet werden kann. Der Modus ist **opt-in** über `worktree.enabled` in `.sf-plugin/config.json` und standardmäßig deaktiviert; ist er aus, verhalten sich die Workflows unverändert – keine Worktree-Erzeugung und keine erzwungenen Commits. Einziger Unterschied: existiert bereits eine `.sf-plugin/config.json`, ergänzen die Workflows den `worktree`-Block einmalig nicht-destruktiv (Migration), wie bei den übrigen Config-Blöcken.

Bei aktivem Modus erzeugt der Workflow zu Beginn einen Git-Worktree auf dem konfigurierbaren Basis-Branch (`worktree.baseBranch`, Default `origin/main`) und führt dort alle Umsetzungs-, Test-, Validierungs- und Doku-Phasen aus. In der Abschlussphase committet er die Arbeit (über die `sf-commit`-Logik), zieht den Worktree zurück (das Verzeichnis wird entfernt, der Liefer-Branch bleibt im lokalen Repo) und führt die Abschluss-Aktion aus: einen Pull-Request über `sf-pr`, einen lokalen Merge auf den Basis-Branch oder nur den belassenen Branch. Die Aktion steuert `worktree.completion`; ohne gültigen Wert wird gefragt. Dieser Mechanismus ist getrennt vom per-Finding-Worktree von `sf-apply-review` (`applyReview.worktree`).

## Plugin-Konfiguration

Projektlokale Laufzeitdaten liegen unter `.sf-plugin/` im Zielprojekt:

| Datei                    | Zweck                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.sf-plugin/config.json` | Optionale Workflow-Defaults für Review, Apply-Review, Plan-Erstellung und Worktree-Integration (z. B. `plan.markerLanguage`, `worktree.enabled`) |
| `.sf-plugin/memory.json` | Persistente Workflow-Zähler und Config-Migrationsstatus                                                                                          |
| `.sf-plugin/cache.json`  | Invalidierbare Cache-Daten für wiederholte Reviews und Apply-Review-Läufe                                                                        |
| `.sf-plugin/review/`     | Review-Reports                                                                                                                                   |

Die Skills funktionieren ohne `config.json`. Wenn eine bestehende Config neue Schlüssel noch nicht enthält, migrieren `sf-review`, `sf-apply-review` und `sf-plan` sowie die Code-ändernden Workflows (für den `worktree`-Block) fehlende Defaults nicht-destruktiv und melden die ergänzten Schlüssel. Da `worktree.enabled` per Default `false` ist, bleibt die Worktree-Integration auch nach automatischer Migration deaktiviert. Der Migrationsstatus wird in `memory.json` gespeichert; wiederverwendbare Cache-Daten liegen separat in `cache.json`.

`sf-plan` nutzt `plan.markerLanguage` (`"de"` oder `"en"`), um die Sprache des kanonischen Statusmarkers neuer Plan-Dateien zu bestimmen. Reihenfolge: Config-Eintrag gewinnt; sonst leitet `sf-plan` die Sprache aus den vorhandenen Plan-Dateien ab; sonst fragt es per `AskUserQuestion` und bietet an, die Wahl zu persistieren. Bei eindeutiger Detection und existierender Config ohne den Schlüssel wird er nicht-destruktiv ergänzt.

Sicheres Default-Verhalten:

```json
{
  "review": {
    "profile": "focused",
    "autoConfirmScope": false,
    "designDecisionSources": "standard",
    "validation": "full"
  },
  "applyReview": {
    "defaultCommitStrategy": null,
    "finalValidation": "full",
    "stashPolicy": "interactive",
    "worktree": {
      "baseDir": ".sf-plugin/.worktrees",
      "setup": "auto"
    }
  },
  "plan": {
    "markerLanguage": "de"
  },
  "worktree": {
    "enabled": false,
    "baseBranch": "origin/main",
    "branchPrefix": "sf",
    "completion": null,
    "setup": "auto",
    "baseDir": ".sf-plugin/.worktrees"
  }
}
```

Schneller persönlicher Review-/Apply-Review-Workflow:

```json
{
  "review": {
    "profile": "fast",
    "autoConfirmScope": true,
    "designDecisionSources": "standard",
    "validation": "quick"
  },
  "applyReview": {
    "defaultCommitStrategy": "worktrees",
    "finalValidation": "changedScope",
    "stashPolicy": "keep",
    "worktree": {
      "baseDir": ".sf-plugin/.worktrees",
      "setup": "none"
    }
  }
}
```

`cache.json` darf nur invalidierbare Vorarbeiten enthalten, z. B. extrahierte Designentscheidungen, Scope-Indizes, erkannte Validator-Skripte oder Apply-Review-Voranalysen. Finale Review-Findings, Konfliktentscheidungen und Stash-Entscheidungen werden nicht gecacht.

## Struktur

```text
sf-claude-plugin/
├── skills/                          # Source (Platzhalter-Syntax)
│   ├── _shared/                     # Gemeinsame Inhalte (`include`-Fence)
│   │   ├── doc-categories.md        # Verzeichnis-Konvention für finale Dokumente
│   │   ├── goal-completion.md       # Goal-getriebene Abschlusssteuerung + /goal-String
│   │   ├── investigation-method.md  # Read-only-Investigation-Kern (sf-fix, sf-investigate)
│   │   ├── language-rules.md        # Zentrale Sprach- und Typografie-Regeln
│   │   ├── wisdom-accumulation.md   # Wisdom-Accumulation-Baustein (sf-fix, sf-investigate)
│   │   └── worktree-integration.md  # Opt-in Worktree + PR/Merge für Code-Workflows
│   ├── sf-apply-plan/SKILL.md       # type: orchestrator
│   ├── sf-build/SKILL.md            # type: orchestrator
│   ├── sf-docs/SKILL.md             # type: orchestrator
│   ├── sf-plan/SKILL.md             # type: orchestrator
│   ├── sf-ui-implementer/SKILL.md   # type: agent
│   └── ...
├── docs/                            # Projekt-Dokumentation (im Zielprojekt)
│   ├── plan/                        # Implementierungspläne mit NNNN-Schema
│   ├── user-guide/                  # End-User-Dokumentation, README.md als Einstieg
│   ├── developer-guide/             # Entwickler-Dokumentation, Architektur, Contribution
│   ├── operations/                  # Betrieb, Deployment, Monitoring, Infrastruktur
│   └── runbooks/                    # Step-by-Step-Prozeduren, optionale Sub-Topics
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
name: sf-build
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
  model: gpt-5.5
  model_reasoning_effort: high
  sandbox_mode: danger-full-access
---
```

## Sprachregeln

Sofern der User nichts anderes verlangt:

- Code, Bezeichner, Tests und Commit-Messages sind auf Englisch
- Dokumentation ist auf Deutsch
- Bestehende Dokumentationssprache wird fortgeführt

## Migration

Details zu bewusst nicht 1:1 portierbaren Claude-Mechaniken stehen in [docs/skill-migration-notes.md](docs/skill-migration-notes.md).
