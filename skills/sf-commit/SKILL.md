---
name: sf-commit
description: "Erzeugt eine beschreibende Commit-Message für bereits gestagte Änderungen und führt den Commit per git aus. Verwende diesen Skill, wenn nur die staged changes committed werden sollen, mit Conventional Commits wie feat:, fix:, chore:, docs:, refactor: oder test:, ohne Co-Authored-By-Zeilen."
type: utility
---

# SF Commit

Du erstellst eine Commit-Message für die aktuell gestagten Änderungen und führst den Commit aus.

## Ziel

- nur bereits gestagte Dateien committen
- eine klare, beschreibende Conventional-Commit-Message wählen
- keine `Co-Authored-By`-Zeilen erzeugen
- Commit-Message auf Englisch formulieren
- keine Projektvalidation wie Linting, Tests oder Build-Checks ausführen

{{INCLUDE:task-tracking}}

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor dem Commit und beachte ihre Vorgaben für Commit-Stil, Scope, Arbeitsweise und projektweite Konventionen.

## Vorgehen

1. Prüfe, ob es gestagte Änderungen gibt.
2. Lies nur die staged Diff und leite daraus den passenden Commit-Typ ab:
   - `feat:` für neue Funktionalität
   - `fix:` für Fehlerbehebungen
   - `chore:` für Wartung, Tooling, Repo-Aufräumen
   - `docs:` für Dokumentation
   - `refactor:` für Strukturverbesserungen ohne Verhaltensänderung
   - `test:` für Teständerungen
3. Formuliere eine kurze, konkrete Summary-Zeile, die den inhaltlichen Kern der staged changes beschreibt.
4. Führe keine eigenständige Projektvalidation aus; Linting, Tests und andere Qualitätsprüfungen sind Aufgabe anderer Skills wie `{{SKILL:sf-code-validator}}` und `{{SKILL:sf-test-writer}}`.
5. Führe `git commit` für genau diese staged changes aus.

## Regeln

- Verwende keine generischen Messages wie `update files` oder `misc changes`.
- Erfinde keine Änderungen, die nicht im staged Diff stehen.
- Füge keine `Co-Authored-By`-Trailer hinzu.
- Starte keine Projektvalidation wie Linting, Tests oder Build-Checks; diese Verantwortung liegt bei anderen Skills.
- Respektiere bestehende Husky-Hooks; commitlint, prettier und lint dürfen den Commit blockieren.
- Wenn Hooks fehlschlagen, gib die relevante Ursache knapp wieder statt die Hooks zu umgehen oder selbst zusätzliche Validierung zu starten.
- Wenn die staged changes mehrere unverbundene Themen enthalten, weise auf den gemischten Scope hin und schlage Splitten vor, bevor committed wird.
