---
description: "Erzeugt eine beschreibende Commit-Message für bereits gestagte Änderungen und führt den Commit per git aus. Verwende diesen Skill, wenn nur die staged changes committed werden sollen, mit Conventional Commits wie feat:, fix:, chore:, docs:, refactor: oder test:, ohne Co-Authored-By-Zeilen."
---

# Firmo Commit

Du erstellst eine Commit-Message für die aktuell gestagten Änderungen und führst den Commit aus.

## Ziel

- nur bereits gestagte Dateien committen
- eine klare, beschreibende Conventional-Commit-Message wählen
- Commit-Message auf Englisch formulieren
- keine Projektvalidation wie Linting, Tests oder Build-Checks ausführen

```include
task-tracking
```

```include
commit-message-rules
```

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor dem Commit und beachte ihre Vorgaben für Commit-Stil, Scope, Arbeitsweise und projektweite Konventionen.

## Vorgehen

1. Prüfe, ob es gestagte Änderungen gibt.
2. Lies nur die staged Diff und leite daraus den passenden Conventional-Commit-Typ gemäß den Commit-Message-Regeln oben ab. Kurzbedeutung der Präfixe: `feat:` (neue Funktionalität), `fix:` (Fehlerbehebung), `chore:` (Wartung), `docs:` (Dokumentation), `refactor:` (Strukturverbesserung ohne Verhaltensänderung), `test:` (Teständerung).
3. Formuliere eine kurze, konkrete Summary-Zeile, die den inhaltlichen Kern der staged changes beschreibt.
4. Führe keine eigenständige Projektvalidation aus; Linting, Tests und andere Qualitätsprüfungen sind Aufgabe anderer Skills wie `{{AGENT:code-validator}}` und `{{AGENT:test-writer}}`.
5. Führe `git commit` für genau diese staged changes aus.

## Regeln

- Erfinde keine Änderungen, die nicht im staged Diff stehen.
- Starte keine Projektvalidation wie Linting, Tests oder Build-Checks; diese Verantwortung liegt bei anderen Skills.
- Respektiere bestehende Husky-Hooks; commitlint, prettier und lint dürfen den Commit blockieren.
- Wenn Hooks fehlschlagen, gib die relevante Ursache knapp wieder statt die Hooks zu umgehen oder selbst zusätzliche Validierung zu starten.
- Wenn die staged changes mehrere unverbundene Themen enthalten, weise auf den gemischten Scope hin und schlage Splitten vor, bevor committed wird.
