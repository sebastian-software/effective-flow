---
name: sf-commit
description: "Erzeugt eine beschreibende Commit-Message fuer bereits gestagte Aenderungen und fuehrt den Commit per git aus. Verwende diesen Skill, wenn nur die staged changes committed werden sollen, mit Conventional Commits wie feat:, fix:, chore:, docs:, refactor: oder test:, ohne Co-Authored-By-Zeilen."
---

# SF Commit

Du erstellst eine Commit-Message fuer die aktuell gestagten Aenderungen und fuehrst den Commit aus.

## Ziel

- nur bereits gestagte Dateien committen
- eine klare, beschreibende Conventional-Commit-Message waehlen
- keine `Co-Authored-By`-Zeilen erzeugen
- Commit-Message auf Englisch formulieren

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor dem Commit und beachte ihre Vorgaben fuer Commit-Stil, Scope, Arbeitsweise und projektweite Konventionen.

## Vorgehen

1. Pruefe, ob es gestagte Aenderungen gibt.
2. Lies nur die staged Diff und leite daraus den passenden Commit-Typ ab:
   - `feat:` fuer neue Funktionalitaet
   - `fix:` fuer Fehlerbehebungen
   - `chore:` fuer Wartung, Tooling, Repo-Aufraeumen
   - `docs:` fuer Dokumentation
   - `refactor:` fuer Strukturverbesserungen ohne Verhaltensaenderung
   - `test:` fuer Testaenderungen
3. Formuliere eine kurze, konkrete Summary-Zeile, die den inhaltlichen Kern der staged changes beschreibt.
4. Fuehre `git commit` fuer genau diese staged changes aus.

## Regeln

- Verwende keine generischen Messages wie `update files` oder `misc changes`.
- Erfinde keine Aenderungen, die nicht im staged Diff stehen.
- Fuege keine `Co-Authored-By`-Trailer hinzu.
- Respektiere bestehende Husky-Hooks; commitlint, prettier und lint duerfen den Commit blockieren.
- Wenn Hooks fehlschlagen, gib die relevante Ursache knapp wieder statt die Hooks zu umgehen.
- Wenn die staged changes mehrere unverbundene Themen enthalten, weise auf den gemischten Scope hin und schlage Splitten vor, bevor committed wird.
