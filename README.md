# SF Codex Skills

Dieses Repository ist jetzt ein reines Skill-System fuer Codex. Die alte Claude-Code-Plugin-Struktur wurde entfernt.

## Nutzung

Die frueheren Slash-Commands sind jetzt Skills:

| Vorher | Jetzt |
|---|---|
| `/build-feature` | `$sf-build-feature` |
| `/fix` | `$sf-fix` |
| `/refactor` | `$sf-refactor` |
| `/review` | `$sf-review` |

Die frueheren Agents sind ebenfalls Skills:

| Vorher | Jetzt |
|---|---|
| `ui-implementer` | `$sf-ui-implementer` |
| `nodejs-implementer` | `$sf-nodejs-implementer` |
| `frontend-reviewer` | `$sf-frontend-reviewer` |
| `nodejs-reviewer` | `$sf-nodejs-reviewer` |
| `code-validator` | `$sf-code-validator` |
| `code-documenter` | `$sf-code-documenter` |
| `docs-writer` | `$sf-docs-writer` |
| `test-writer` | `$sf-test-writer` |
| `e2e-tester` | `$sf-e2e-tester` |
| `commit` | `$sf-commit` |

## Installation

Zum lokalen Sync nach Codex:

```sh
./local-update.sh
```

Das Script kopiert alle Skill-Ordner aus `skills/` nach `${CODEX_HOME:-$HOME/.codex}/skills`.

## Struktur

```text
skills/
  sf-build-feature/
    SKILL.md
  sf-fix/
    SKILL.md
  sf-refactor/
    SKILL.md
  sf-review/
    SKILL.md
  sf-ui-implementer/
    SKILL.md
  sf-nodejs-implementer/
    SKILL.md
  sf-frontend-reviewer/
    SKILL.md
  sf-nodejs-reviewer/
    SKILL.md
  sf-code-validator/
    SKILL.md
  sf-code-documenter/
    SKILL.md
  sf-docs-writer/
    SKILL.md
  sf-test-writer/
    SKILL.md
  sf-e2e-tester/
    SKILL.md
  sf-commit/
    SKILL.md
```

## Orchestrierung

Die Workflow-Skills bleiben Orchestratoren, rufen Spezialphasen aber nicht mehr ueber Claude-Agent-Calls auf. Stattdessen verwenden sie explizite Rollenwechsel im Prompt, zum Beispiel:

```text
Verwende den Skill $sf-ui-implementer fuer diese Phase.
```

Wenn Aufgaben sauber getrennt und parallelisierbar sind, ist das interne Sub-Agent-Pattern vorgesehen. Wenn der naechste Schritt direkt vom Ergebnis abhaengt, bleibt die Arbeit lokal auf dem kritischen Pfad.

## Sprachregeln

Sofern der User nichts anderes verlangt, gilt fuer alle Skills:

- Code, Bezeichner, Tests und Commit-Messages sind auf Englisch.
- Dokumentation ist auf Deutsch.
- Wenn bereits Dokumentation vorhanden ist, wird deren bestehende Sprache fortgefuehrt.

## Inhalte

- Workflow-Skills fuer Feature, Fix, Refactor und Review
- Rollen-Skills fuer Implementierung, Review, Validierung, Doku und Tests
- Designentscheidungs-respektierende Reviews
- Routing fuer Frontend, Backend, CLI und Fullstack

## Migration

Entfernt wurden:

- Claude-Plugin-Manifeste
- `commands/`
- `agents/`
- Claude-spezifische Aufrufmuster wie `AskUserQuestion`

Ersetzt wurden sie durch:

- `skills/<name>/SKILL.md`
- Skill-Namen mit `$`-Aufrufkonvention
- Codex-kompatible Orchestrierung ueber Rollenwechsel im Prompt

Details zu bewusst nicht 1:1 portierbaren Claude-Mechaniken stehen in [docs/skill-migration-notes.md](/Users/bs5/Developer/sf-claude-plugin/docs/skill-migration-notes.md).
