# 0017: Task-Tracking Include

**Planungsstatus:** Umgesetzt

## Anforderung

Alle Skills sollen bei mehreren Aufgaben eine TODO-Liste (`TaskCreate`/`TaskUpdate`) verwenden, um den Fortschritt zu verfolgen.

## Architekturentscheidungen

- **Shared Include:** Gemeinsame Datei `_shared/task-tracking.md` statt Kopie in jedem Skill, analog zum bestehenden `_shared/language-rules.md`
- **Alle Skills:** Include in alle 15 Skills eingefügt, auch in triviale wie `sf-commit` und `sf-version` — die Anweisung enthält explizite Ausnahmen für triviale Einzelaufgaben
- **Einfügestelle:** Nach dem Sprachregel-Block (ob Include oder inline)

## Betroffene Dateien

| Datei                                   | Beschreibung                                      |
| --------------------------------------- | ------------------------------------------------- |
| `skills/_shared/task-tracking.md`       | Neue gemeinsame Anweisung zur TODO-Listen-Nutzung |
| `skills/sf-apply-review/SKILL.md`       | Include eingefügt                                 |
| `skills/sf-build-feature/SKILL.md`      | Include eingefügt                                 |
| `skills/sf-code-documenter/SKILL.md`    | Include eingefügt                                 |
| `skills/sf-code-validator/SKILL.md`     | Include eingefügt                                 |
| `skills/sf-commit/SKILL.md`             | Include eingefügt                                 |
| `skills/sf-docs-writer/SKILL.md`        | Include eingefügt                                 |
| `skills/sf-e2e-tester/SKILL.md`         | Include eingefügt                                 |
| `skills/sf-fix/SKILL.md`                | Include eingefügt                                 |
| `skills/sf-frontend-reviewer/SKILL.md`  | Include eingefügt                                 |
| `skills/sf-nodejs-implementer/SKILL.md` | Include eingefügt                                 |
| `skills/sf-nodejs-reviewer/SKILL.md`    | Include eingefügt                                 |
| `skills/sf-refactor/SKILL.md`           | Include eingefügt                                 |
| `skills/sf-review/SKILL.md`             | Include eingefügt                                 |
| `skills/sf-test-writer/SKILL.md`        | Include eingefügt                                 |
| `skills/sf-ui-implementer/SKILL.md`     | Include eingefügt                                 |
| `skills/sf-version/SKILL.md`            | Include eingefügt                                 |

## Implementierungsdetails

Die Include-Datei definiert:

- **Wann verwenden:** 3+ Teilaufgaben, komplexe Aufträge mit Phasen, mehrere vom User genannte Aufgaben
- **Wann nicht:** Einzelne triviale Aufgabe, weniger als 3 einfache Schritte
- **Vorgehen:** `TaskCreate` zum Anlegen, `TaskUpdate` mit `in_progress` beim Start und `completed` nach Abschluss
