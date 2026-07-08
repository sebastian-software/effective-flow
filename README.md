# Firmo

Ein Software-Engineering-Workflow-Set für **Codex** und **Claude Code** — aus einer einzigen Quelle gebaut, ausgeliefert als **ein** Skill, das seine Tools über `/firmo <tool>` aufruft.

## Konzept

Firmo ist ein **dünnes Router-Skill** mit **Lazy-Loading**. Es enthält nur einen Tool-Katalog und eine Dispatch-Regel; die vollständige Anweisung eines Tools wird **erst bei Bedarf** aus `tools/<tool>.md` geladen. So bleibt die Session schlank und es entsteht keine Token-Exhaustion durch das Vorladen aller Tools.

Aufruf:

```text
/firmo <tool> [argumente]
```

Auf Codex wird dasselbe Skill über den Skill-Namen aufgerufen (z. B. `$firmo <tool>`); die Dispatch-Regel ist identisch. Ohne oder mit unbekanntem `<tool>` gibt der Router die Tool-Liste aus und tut sonst nichts.

Firmo unterscheidet zwei Bausteine:

| Typ       | Beschreibung                                  | Aufruf                                          |
| --------- | --------------------------------------------- | ----------------------------------------------- |
| **Tool**  | Workflow- oder Utility-Anweisung              | `/firmo <tool>` (lädt `tools/<tool>.md`)        |
| **Agent** | spezialisierter Worker (Implementer/Reviewer) | intern von Tools als Subagent (`agents/<name>`) |

## Tools

Die 15 über `/firmo <tool>` aufrufbaren Tools:

| Tool          | Beschreibung                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `build`       | Kompletter Feature-Workflow                                                                        |
| `fix`         | Bugfix-Workflow                                                                                    |
| `plan`        | Reine Implementierungsplanung ohne Code-Änderungen                                                 |
| `refactor`    | Refactoring-Workflow                                                                               |
| `docs`        | Dokumentations-Workflow                                                                            |
| `review`      | Umfassendes Code-Review                                                                            |
| `apply`       | Beliebige Apply-Quelle (Plan-Datei, Review-Report, Issue, Review-Epic) klassifizieren und umsetzen |
| `plan-issue`  | Übersprungene Issues einsammeln und Planung interaktiv vervollständigen                            |
| `maintain`    | Schlanke Wartung: Dependency-Updates, Audit-Fixes, Breaking-Change-Adaption                        |
| `commit`      | Commit-Message für gestagte Änderungen                                                             |
| `pr`          | Pull-Request aus einem Branch auf GitHub (`gh`) oder Forgejo (`tea`)                               |
| `setup`       | `.gitignore`-Eintrag + interaktive Pflege von `.firmo/config.json`                                 |
| `open-plans`  | Offene Plan-Dateien mit Kurzfassung auflisten                                                      |
| `investigate` | Fehler- und Verhaltensinvestigation (Analyse-only, Diagnose-Report)                                |
| `version`     | Firmo-Version inklusive Git-Kurzhash anzeigen                                                      |

`apply` lädt bei Bedarf eine passende **interne** Anweisung nach (`tools/apply-plan.md`, `tools/apply-review.md` oder `tools/apply-issues.md`), je nach erkannter Quelle. Diese internen Dateien sind nicht direkt über `/firmo` aufrufbar.

## Agents

Spezialisten, die von den Tools intern als Subagents delegiert werden (liegen unter `agents/`):

| Agent                | Beschreibung                        | Codex Model  | Claude Model |
| -------------------- | ----------------------------------- | ------------ | ------------ |
| `ui-implementer`     | Frontend-Implementierung            | gpt-5.5      | sonnet       |
| `nodejs-implementer` | Backend/CLI-Implementierung         | gpt-5.5      | opus         |
| `rust-implementer`   | Rust-Implementierung                | gpt-5.5      | opus         |
| `frontend-reviewer`  | Frontend-Review                     | gpt-5.5      | opus         |
| `nodejs-reviewer`    | Backend/CLI-Review                  | gpt-5.5      | opus         |
| `rust-reviewer`      | Rust-Review                         | gpt-5.5      | opus         |
| `code-validator`     | TypeScript, Lint, Build-Validierung | gpt-5.4-mini | haiku        |
| `code-documenter`    | In-Code-Dokumentation               | gpt-5.4-mini | sonnet       |
| `docs-writer`        | User-Dokumentation                  | gpt-5.4-mini | sonnet       |
| `test-writer`        | Unit-Tests                          | gpt-5.4-mini | sonnet       |
| `e2e-tester`         | E2E-Tests                           | gpt-5.4-mini | sonnet       |

## Auslieferung

Firmo wird als **Standard-Directory-Skill** ausgeliefert (ein Verzeichnis mit `SKILL.md`, `tools/` und `agents/`) — nicht mehr als Claude-Code-Plugin/Marketplace. Der Build erzeugt je Harness eine Variante:

| Ziel        | Pfad                                       |
| ----------- | ------------------------------------------ |
| Claude Code | `~/.claude/skills/firmo/` (`.md`-Agents)   |
| Codex       | `~/.agents/skills/firmo/` (`.toml`-Agents) |

Das gebaute Skill ist ein gewöhnliches Agent-Skill. Da das Repo derzeit **privat** ist, sind Installation via `npx skills` und Verknüpfung über dalo erst nach einer Veröffentlichung verfügbar; die primäre Installation läuft über das veröffentlichte Release-Archiv mit `./install-skill.sh` (siehe Abschnitt [Installation](#installation)).

Empfohlene Codex-Konfiguration (`~/.codex/config.toml`):

```toml
[agents]
max_threads = 6
max_depth = 1
```

## Installation

```sh
./install-skill.sh
```

Das Script:

1. lädt das Archiv der letzten verfügbaren GitHub-Release-Version herunter,
2. kopiert das Firmo-Skill nach `~/.claude/skills/firmo` und `~/.agents/skills/firmo`,
3. räumt alte `sf-*`-Skills, `~/.codex/agents/sf-*.toml` und den früheren Marketplace `sf-claude-plugin` auf.

Nur das `firmo`-Verzeichnis wird verwaltet: ein bestehender externer `~/.claude/skills`-Symlink (z. B. von dalo) und fremde Nachbar-Skills bleiben unangetastet.

Für Installation aus dem aktuell ausgecheckten Stand statt aus dem letzten Release:

```sh
./install-skill.sh local
```

Für Symlinks statt Kopien (Entwicklung):

```sh
./local-link.sh
```

Nur bauen (ohne Deployment):

```sh
node build.mjs
```

## Build

Firmo wird aus den Quellen unter `src/` gebaut, deren Layout die Ausgabe spiegelt: `src/SKILL.md` (Router), `src/tools/<name>.md`, `src/agents/<name>.md` und `src/shared/<name>.md` (Include-Fragmente). Der Ordner bestimmt die Kategorie (`tools/` → Tool, `agents/` → Agent); der Tool-/Agent-Name ist der Dateiname ohne `.md`. Der Build fügt alles zu einem einzigen `firmo`-Skill je Harness zusammen.

Die Quellen verwenden zwei Arten von Platzhaltern.

**Inline-Referenzen** stehen mitten im Text (auch im Frontmatter-`description:`-String) und nutzen die Mustache-Syntax `{{…}}`:

| Platzhalter   | Bedeutung                  | Ersetzung                                               |
| ------------- | -------------------------- | ------------------------------------------------------- |
| `{{SKILL:X}}` | Tool-Referenz              | `/firmo X` (exponiert) bzw. `` `tools/X.md` `` (intern) |
| `{{AGENT:X}}` | Agent-Referenz             | `` `X` `` bzw. `` `firmo-X` `` (Claude-Subagent)        |
| `{{VERSION}}` | Version inkl. Git-Kurzhash | eingesetzt                                              |

**Block-Direktiven** stehen auf eigenen Zeilen und nutzen einen Code-Fence mit Info-String. Der Fence-Interior bleibt gegen den Markdown-Formatter (oxfmt) wortwörtlich erhalten.

Ein `include`-Fence bettet die Shared-Datei `src/shared/<name>.md` ein:

```include
task-tracking
```

Ein `ask`-Fence erzeugt eine bedingte User-Frage (Claude Code: `AskUserQuestion`-Block, Codex: Freitextfrage):

```ask
header: Freigabe
question: Plan freigegeben?
type: approval
```

Zwei Guards sichern den Build ab: ein Frontmatter-Validitäts-Check (Descriptions strikt gequotet) und ein Version-Drift-Guard (Claude und Codex tragen dieselbe Version).

### Plan-Konventionen

Plan-Dateien in `docs/plan/` verwenden einen stabilen Statusmarker im Kopfbereich, wahlweise auf Deutsch oder Englisch:

```md
**Planungsstatus:** Nicht umgesetzt
**Empfohlener Workflow:** Feature (`/firmo build`)
```

```md
**Plan status:** Not implemented
**Empfohlener Workflow:** Feature (`/firmo build`)
```

Akzeptierte Werte sind `Nicht umgesetzt`/`Umgesetzt` (Deutsch) und `Not implemented`/`Implemented` (Englisch). Pro Plan-Datei wird nur eine Sprache verwendet; beim Statuswechsel auf abgeschlossen bleibt die Markersprache erhalten. Die Zeile `**Empfohlener Workflow:**` bleibt in beiden Markersprachen auf Deutsch. Nur diese kanonische Statuszeile zählt — andere Vorkommen von „Nicht umgesetzt“/„Umgesetzt“ in Fließtext oder Review-Findings nicht.

Plan-Dateien tragen einen vierstelligen Nummern-Prefix (`NNNN-titel-slug.md`); jede Nummer ist genau einmal vergeben und die Folge bleibt lückenlos. `plan` reserviert die Nummer zu Beginn über eine temporäre Plan-Datei, damit parallele Läufe nicht dieselbe Nummer wählen; Dubletten über getrennte Branches lösen die Workflows beim nächsten Scan in Planungsreihenfolge auf.

Neue Pläne enthalten eine Workflow-Empfehlung (Feature, Bugfix, Refactoring oder Dokumentation). Offene Pläne dienen direkt `/firmo build`, `/firmo fix`, `/firmo refactor` oder `/firmo docs` als Grundlage; alternativ liest `/firmo apply` die Empfehlung aus und übergibt an den passenden Workflow. Doku-Pläne führen im Kopf zusätzlich `**Doku-Kategorie:**` und `**Ziel-Pfad:**`. Die vier Doku-Kategorien `user-guide`, `developer-guide`, `operations` und `runbooks` sind in `src/shared/doc-categories.md` definiert.

## Goal-getriebene Abschlusssteuerung

Die Workflow-Tools `build`, `fix`, `refactor`, `docs` und `maintain` binden den gemeinsamen Baustein `src/shared/goal-completion.md` ein. Er fasst die internen „wiederhole bis fertig“-Schleifen zu einem einheitlichen Muster zusammen: eine vorab deklarierte, messbare Abschlussbedingung, unabhängige Verifikation über die im jeweiligen Workflow vorgesehenen Prüfungen (`code-validator` und, falls eine Review-Phase existiert, der passende Reviewer) sowie ein beschränkter Korrektur-Loop, der bei anhaltendem Fehlschlag an den User eskaliert statt unbegrenzt zu wiederholen.

Zusätzlich stellt jeder dieser Workflows an seiner Freigabe-Grenze eine **explizite Goal-Abfrage**: Ja/Nein-Freigaben erhalten eine dritte Option „Autonom via `/goal`", Auswahl-Gates eine knappe Folgefrage. Wählt der User die autonome Option, gibt der Workflow einen copy-paste-baren `/goal`-String aus, den man als neue Eingabe einfügt, um die verbleibenden Phasen unter dem nativen `/goal` (Codex und Claude Code) autonom laufen zu lassen; andernfalls läuft der Workflow unverändert gated weiter. Die Approval-Gates bleiben in jedem Fall erhalten. Läuft ein Workflow als nicht-interaktiver Sub-Agent von `apply` (Review-Modus), entfällt die Goal-Abfrage. `review` und `plan` nutzen nur die explizite, unabhängig geprüfte Abschlussbedingung ohne Autonom-Loop.

## Worktree-Integration

Die Code-ändernden Workflows `build`, `fix`, `refactor`, `docs` und `maintain` binden den gemeinsamen Baustein `src/shared/worktree-integration.md` ein. Er verknüpft diese Workflows optional mit Git-Worktrees und Pull-Requests, damit parallel auf dem lokalen Repo gearbeitet werden kann. Der Modus ist **opt-in** über `worktree.enabled` in `.firmo/config.json` und standardmäßig deaktiviert; ist er aus, verhalten sich die Workflows unverändert.

Bei aktivem Modus erzeugt der Workflow zu Beginn einen Git-Worktree auf dem konfigurierbaren Basis-Branch (`worktree.baseBranch`, Default `origin/main`) und führt dort alle Umsetzungs-, Test-, Validierungs- und Doku-Phasen aus. In der Abschlussphase committet er die Arbeit (über die `commit`-Logik), zieht den Worktree zurück und führt die Abschluss-Aktion aus (`worktree.completion`): einen Pull-Request über `pr`, einen lokalen Merge auf den Basis-Branch oder nur den belassenen Branch. Die Plan-Datei reist in ihrem finalen Zustand mit in den Liefer-Branch; nur die reine Firmo-Buchhaltung unter `.firmo/` (`memory.json`, Review-Reports, Wisdom-Datei) bleibt außerhalb des PRs im Haupt-Repo.

## Konfiguration

Projektlokale Laufzeitdaten liegen unter `.firmo/` im Zielprojekt:

| Datei                | Zweck                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.firmo/config.json` | Optionale Workflow-Defaults für Review, Apply-Review, Plan-Erstellung, Worktree-Integration und Issue-Tracker (z. B. `plan.markerLanguage`, `worktree.enabled`, `tracker.mode`) |
| `.firmo/memory.json` | Persistente Workflow-Zähler und Config-Migrationsstatus                                                                                                                         |
| `.firmo/cache.json`  | Invalidierbare Cache-Daten für wiederholte Reviews und Apply-Review-Läufe                                                                                                       |
| `.firmo/review/`     | Review-Reports                                                                                                                                                                  |

Die Tools funktionieren ohne `config.json`. Zum proaktiven Anlegen oder Anpassen dient `/firmo setup`: Es trägt den Laufzeit-Status unter `.firmo/` in die `.gitignore` ein (`.firmo/*` plus `!.firmo/config.json`), sodass `memory.json`, `cache.json`, Review-Reports und Worktrees ignoriert werden, `.firmo/config.json` als geteilte Projekt-Konfiguration aber getrackt bleibt. Eine bereits vorhandene pauschale `.firmo/`- oder Alt-`.sf-plugin/`-Zeile migriert es auf dieses Pattern. Die `config.json` pflegt es interaktiv über Presets oder einen Detailmodus, nicht-destruktiv für vorhandene Werte.

Ein Zielprojekt, das zuvor `.sf-plugin/` genutzt hat, wird beim ersten Firmo-Lauf, der Laufzeitdaten schreibt, **einmalig und nicht-destruktiv** nach `.firmo/` migriert (Inhalt kopiert, `.sf-plugin/` bleibt erhalten); bis dahin liest Firmo das alte Verzeichnis als Fallback. Details siehe `src/shared/firmo-dir-migration.md`.

`plan` nutzt `plan.markerLanguage` (`"de"` oder `"en"`), um die Markersprache neuer Plan-Dateien zu bestimmen (Config gewinnt; sonst Detection aus vorhandenen Plänen; sonst Rückfrage mit optionaler Persistenz).

`review` und `apply` (Review-Modus) binden den gemeinsamen Baustein `src/shared/issue-tracker.md` ein und steuern über `tracker.mode` (`"local"`/`"remote"`, Default `local`), ob Findings lokal als Markdown-Report unter `.firmo/review/` oder remote als Issues geführt werden. Der Modus ist **opt-in**. Im Remote-Modus erkennt Firmo das Werkzeug automatisch aus der `origin`-URL (GitHub über `gh`, sonst Forgejo über `tea`); `tracker.remoteToolOverride` (`auto`/`github`/`forgejo`) erzwingt bei mehrdeutigen Hosts ein Werkzeug. Die Tracker-Labels verwenden den `firmo-`-Präfix (`firmo-review-finding`, `firmo-review-epic`, `firmo-issue-done`, `firmo-needs-planning` sowie die Aktions-Labels `firmo-fix`/`firmo-refactor`/`firmo-build`/`firmo-docs`). Der frühere `sf-`-Präfix wird beim Lesen, Auflisten und Deduplizieren weiterhin als gleichwertig erkannt (dauerhafte Lese-Rückwärtskompatibilität), aber neu angelegt wird ausschließlich `firmo-`.

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
      "baseDir": ".firmo/.worktrees",
      "setup": "auto"
    }
  },
  "plan": {
    "markerLanguage": "de"
  },
  "worktree": {
    "enabled": false,
    "baseBranch": "origin/main",
    "branchPrefix": "firmo",
    "completion": null,
    "setup": "auto",
    "baseDir": ".firmo/.worktrees"
  },
  "tracker": {
    "mode": "local",
    "remoteToolOverride": "auto"
  }
}
```

`cache.json` darf nur invalidierbare Vorarbeiten enthalten (z. B. extrahierte Designentscheidungen, Scope-Indizes, erkannte Validator-Skripte). Finale Review-Findings, Konflikt- und Stash-Entscheidungen werden nicht gecacht.

## Struktur

```text
firmo/  (Repo)
├── src/                             # Source (spiegelt die Ausgabe, Platzhalter-Syntax)
│   ├── SKILL.md                     # Router (Tool-Katalog + Dispatch)
│   ├── tools/                       # ein .md je Tool → firmo/tools/*.md
│   │   ├── build.md
│   │   ├── plan-issue.md
│   │   └── ...
│   ├── agents/                      # ein .md je Agent → firmo/agents/*
│   │   ├── ui-implementer.md
│   │   └── ...
│   └── shared/                      # Include-Fragmente (`include`-Fence)
│       ├── firmo-dir-migration.md   # .sf-plugin/ → .firmo/ Migration + Fallback
│       ├── goal-completion.md       # Goal-getriebene Abschlusssteuerung + /goal-String
│       └── ...
├── docs/                            # Projekt-Dokumentation
│   ├── plan/                        # Implementierungspläne mit NNNN-Schema
│   ├── naming.md
│   ├── skill-migration-notes.md
│   └── (user-guide/ developer-guide/ operations/ runbooks/ — bei Bedarf angelegt, siehe src/shared/doc-categories.md)
├── dist/                            # Generiert (gitignored)
│   ├── claude/firmo/                # Router-SKILL.md + tools/*.md + agents/*.md
│   └── codex/firmo/                 # Router-SKILL.md + tools/*.md + agents/*.toml
├── build.mjs
├── install-skill.sh
└── local-link.sh
```

## Source-Frontmatter

Name und Kategorie ergeben sich aus Ablageort und Dateiname (`src/tools/<name>.md`, `src/agents/<name>.md`) — das Frontmatter trägt daher **kein** `name`- oder `type`-Feld mehr.

### Tools

```yaml
---
description: "..."
---
```

### Agents

```yaml
---
description: "..."
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
