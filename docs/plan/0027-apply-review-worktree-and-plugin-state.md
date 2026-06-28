# Apply-Review Worktree-Isolation und Plugin-State

## Anforderung

`sf-apply-review` soll optional parallele Findings in getrennten Git-Worktrees bearbeiten können, damit Änderungen paralleler Agenten nicht in falsche Commits geraten. Zusätzlich sollen vom Plugin erzeugte operative Dateien unter `.sf-plugin/` liegen. Temporäre Dateien beginnen mit einem Punkt.

## Entscheidungen

- **Commit-Strategie statt globaler Aktivierung:** Worktrees sind eine auswählbare Commit-Strategie in `apply-review` (`Einzeln mit Worktrees`). Eine separate Aktivierung in der Config ist nicht notwendig.
- **Konfigurationsort:** Plugin-Konfiguration liegt unter `.sf-plugin/config.json`.
- **Worktree-BaseDir:** Default ist `.sf-plugin/.worktrees`, damit temporäre Worktrees innerhalb der üblichen Projekt-Sandbox liegen.
- **Optional projektgeteiltes BaseDir:** Worktrees liegen unter `BASE_DIR/REPO_NAME/SESSION_ID/GROUP_NAME`, damit mehrere Repositories denselben BaseDir nutzen können, wenn ein externer BaseDir explizit konfiguriert wird.
- **Explizites Setup:** Das Worktree-Setup wird durch `apply-review` ausgeführt, nicht durch Git Hooks. Standard ist automatische Erkennung bekannter Projektdateien; `setup: "none"` deaktiviert Setup, ein String definiert ein explizites Kommando.
- **Plugin-State:** Persistente Memory liegt künftig unter `.sf-plugin/memory.json`; alte `.sf-memory.json` wird beim Review-Start migriert.

## Umsetzung

| Datei                              | Änderung                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `.gitignore`                       | Ignoriert `.sf-plugin/` als zentralen Plugin-State-Ort                                                  |
| `skills/sf-apply-review/SKILL.md`  | Neue Commit-Strategie `Einzeln mit Worktrees`, Worktree-Pfade, Setup-Erkennung, Cherry-Pick-Integration |
| `skills/sf-review/SKILL.md`        | Memory- und Report-Pfade nach `.sf-plugin/`, Migration von `.sf-memory.json`                            |
| `skills/sf-build-feature/SKILL.md` | Review-Report-Rückverweise nach `.sf-plugin/review/`                                                    |
| `skills/sf-fix/SKILL.md`           | Wisdom- und Review-Report-Pfade nach `.sf-plugin/`                                                      |
| `skills/sf-refactor/SKILL.md`      | Wisdom- und Review-Report-Pfade nach `.sf-plugin/`                                                      |

## Validierung

- Build der Plugin-Artefakte mit `node build.mjs`
- Syntaxprüfung mit `node --check build.mjs`
- Suche nach veralteten operativen Pfaden in Skill-Dateien
- Lokale Migration bestehender ignorierter Plugin-Dateien nach `.sf-plugin/`

## Review

Keine kritischen oder wichtigen Findings in der Selbstprüfung. Restrisiko: Der Worktree-Modus ist eine Skill-Orchestrierungsanweisung und kein ausführbarer Runtime-Code; die tatsächliche Robustheit hängt davon ab, dass der ausführende Agent die beschriebenen Schritte exakt befolgt.
