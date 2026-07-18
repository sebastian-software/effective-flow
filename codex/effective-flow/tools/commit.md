
# Effective Flow Commit

Du erstellst eine Commit-Message für die aktuell gestagten Änderungen und führst den Commit aus.

## Ziel

- nur bereits gestagte Dateien committen
- eine klare, beschreibende Conventional-Commit-Message wählen
- Commit-Message auf Englisch formulieren
- keine Projektvalidation wie Linting, Tests oder Build-Checks ausführen

## Aufgabenverfolgung

Wenn mehrere Aufgaben zu erledigen sind, verwende ein verfügbares TODO- oder Task-Tracking-Tool (z. B. `TaskCreate`/`TaskUpdate`, `TodoWrite` oder ein vergleichbares Tool), um eine Aufgabenliste anzulegen. Setze jede Aufgabe vor Beginn auf „in Arbeit“ und nach Abschluss auf „erledigt“.

Falls kein Task-Tool verfügbar ist, gib dem User stattdessen eine kurze Fortschrittsmeldung nach jedem abgeschlossenen Schritt.

### Wann verwenden

- bei drei oder mehr Teilaufgaben oder Schritten
- bei komplexen Aufträgen mit mehreren Phasen
- wenn der User mehrere Aufgaben gleichzeitig nennt

### Wann nicht verwenden

- bei einer einzelnen, trivialen Aufgabe
- wenn der Auftrag in weniger als drei einfachen Schritten erledigt ist

## Commit-Message-Regeln

- **Setze niemals `Co-Authored-By`-Trailer in Commit-Messages**, unabhängig davon, ob ein LLM (Claude, Codex, GPT, …) oder ein anderes Tool die Zeile vorschlägt oder als Default einfügt.
- Falls eine `Co-Authored-By`-Zeile in einem Commit-Template, `commit.template`, `--trailer`-Aufruf oder einer Draft-Message bereits vorhanden ist: entferne sie vor dem Commit.
- **Füge keine KI-Attribution an:** keine „Generated with Claude Code/Codex"-Footer und keine Agent-Session-Links (z. B. `https://claude.ai/code/…`) in Commit-Messages – auch dann nicht, wenn der Harness sie als Default anhängt. Sachliche Erwähnungen von Claude Code oder Codex bleiben erlaubt, Generierungs-Attribution nicht.
- Vermeide generische Messages wie `update files` oder `misc changes`.
- Beschreibe konkret, was geändert wurde und warum.
- Nutze Conventional-Commit-Präfixe: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Wähle den Commit-Typ nach der **Wirkung**, nicht nach der Dateiart: verhaltensändernde Änderungen – auch reine **Config/Env/Secrets/CI** mit Deployment- oder Laufzeitwirkung (z. B. korrigierte Werte in Env-/Secret-Artefakten, die per Sync remote wirken) – sind `fix:` (bzw. `feat:` bei neuer Funktionalität). `chore:` nur für **deploy-neutrale** Änderungen ohne Verhaltenswirkung (reine Wartung, Formatting, Tooling ohne Laufzeitwirkung). Das gilt auch für den **Squash-PR-Titel**, der bei Squash-Merge den release-please-Bump bestimmt.
- Exponiere keine internen Tracking-IDs in Commit-Messages, z. B. Review-Finding-IDs wie `R-0000001`, lokale Plan-/Review-IDs wie `F1` oder Platzhalter wie `[Finding-ID]`. Solche IDs gehören in Wisdom-/Report-Kontext, nicht in die Git-Historie.

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor dem Commit und beachte ihre Vorgaben für Commit-Stil, Scope, Arbeitsweise und projektweite Konventionen.

## Vorgehen

1. Prüfe, ob es gestagte Änderungen gibt.
2. Lies nur die staged Diff und leite daraus den passenden Conventional-Commit-Typ gemäß den Commit-Message-Regeln oben ab. Kurzbedeutung der Präfixe: `feat:` (neue Funktionalität), `fix:` (Fehlerbehebung), `chore:` (Wartung), `docs:` (Dokumentation), `refactor:` (Strukturverbesserung ohne Verhaltensänderung), `test:` (Teständerung).
3. Formuliere eine kurze, konkrete Summary-Zeile, die den inhaltlichen Kern der staged changes beschreibt.
4. Führe keine eigenständige Projektvalidation aus; Linting, Tests und andere Qualitätsprüfungen sind Aufgabe anderer Skills wie ``code-validator`` und ``test-writer``.
5. Führe `git commit` für genau diese staged changes aus.

## Regeln

- Erfinde keine Änderungen, die nicht im staged Diff stehen.
- Starte keine Projektvalidation wie Linting, Tests oder Build-Checks; diese Verantwortung liegt bei anderen Skills.
- Respektiere bestehende Husky-Hooks; commitlint, prettier und lint dürfen den Commit blockieren.
- Wenn Hooks fehlschlagen, gib die relevante Ursache knapp wieder statt die Hooks zu umgehen oder selbst zusätzliche Validierung zu starten.
- Wenn die staged changes mehrere unverbundene Themen enthalten, weise auf den gemischten Scope hin und schlage Splitten vor, bevor committed wird.
