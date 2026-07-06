# 0059: Firmo Teil 1 – Laufzeitverzeichnis `.sf-plugin/` → `.firmo/` + Migration + Metadaten

**Planungsstatus:** Umgesetzt
**Quelle:** /plan
**Empfohlener Workflow:** Refactoring (`/refactor`)

## Anforderung

Teil 1 der Staffelung von [0058](0058-firmo-rename-and-lazy-tool-router.md) (Master-Plan mit vollständiger Architektur, Learnings und Akzeptanzkriterien). Dieser Teil ist **verhaltensnah/refactoring-artig** und hält den Build grün, weil er `build.mjs` und den `sf-`-Skill-Präfix **nicht** anfasst.

Ziel: das projektlokale Laufzeitverzeichnis von `.sf-plugin/` auf `.firmo/` umstellen – in den Skill-Quellen, in `.gitignore` und `package.json` – und die Skills so ergänzen, dass ein vorhandenes `.sf-plugin/` in Zielprojekten **einmalig nicht-destruktiv nach `.firmo/` migriert** und bis dahin als Fallback gelesen wird.

## Scope-Abgrenzung

- **In Scope:** `.sf-plugin/` → `.firmo/` in `skills/**` (inkl. `_shared/`), Repo-`.gitignore`, `package.json` (`name`, `description`); Migrations-/Fallback-Logik in `setup` und den config-lesenden Tools.
- **Nicht in Scope (spätere Teile):** `sf-`-Skill-/Tool-/Agent-Präfix und Aufruf-Referenzen (`/build`, `$sf-build`) → Teil 2 (0060); `build.mjs`-Umbau/Router/Lazy-Loading → Teil 2; Deploy-Skripte/Auslieferung → Teil 3 (0061); README/Doku → Teil 4 (0062).
- **Unverändert:** historische Plan-Dateien unter `docs/plan/` (dokumentieren den damaligen Stand; keine Massenumschreibung); die `.sf-plugin/`-Laufzeitartefakte des Repos selbst (gitignored).

## Betroffene Dateien

| Datei                                   | Beschreibung                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `skills/_shared/*.md` (7)               | `.sf-plugin/` → `.firmo/` in allen Referenzen (Pfade, Beispiele, Config-Schema-Snippets)               |
| `skills/sf-*/SKILL.md` (13 mit Treffer) | `.sf-plugin/` → `.firmo/`; `setup`- und config-lesende Tools zusätzlich um Migration/Fallback ergänzen |
| `.gitignore` (Repo)                     | `.sf-plugin/`-Muster → `.firmo/*` plus `!.firmo/config.json`                                           |
| `package.json`                          | `name` `sf-claude-plugin` → `firmo`; `description` an Firmo anpassen                                   |

## Implementierungsdetails

### Vorgehen

1. Mechanische Ersetzung `.sf-plugin` → `.firmo` in `skills/**` (inkl. `_shared/`). Kontrolle: alle Vorkommen sind Pfad-/Verzeichnisreferenzen; keine ungewollten Treffer.
2. `.gitignore` auf `.firmo/*` + `!.firmo/config.json` umstellen (markierter Block wie bei `setup`).
3. `package.json` `name`/`description` aktualisieren.
4. **Migration/Fallback** ergänzen:
   - `setup`: schreibt/aktualisiert `.firmo/config.json` und trägt `.firmo/*` (+ `!.firmo/config.json`) in `.gitignore` ein; migriert eine bestehende pauschale `.sf-plugin/`-Zeile mit.
   - config-lesende Tools (`plan`, `review`, `apply`, `maintain`, `investigate` sowie `_shared/issue-tracker.md`, `worktree-integration.md`): wenn `.firmo/` fehlt, aber `.sf-plugin/` existiert → einmalige, nicht-destruktive Migration nach `.firmo/` (idempotent, parallel-sicher, keine stille Löschung); bis dahin `.sf-plugin/` lesend als Fallback.
5. `node build.mjs` ausführen und Ausgabe stichprobenartig auf `.firmo/` prüfen.

### Migrations-Prinzipien (Lehre aus 0058/impeccable #344)

- Kein ungefragter Footprint: `.firmo/` nur anlegen, wenn ein Tool tatsächlich läuft/schreibt.
- Idempotent und parallel-sicher; ein bereits migriertes Projekt wird nicht erneut migriert.
- `.sf-plugin/` wird nicht still gelöscht (nur gelesen, bis `.firmo/` existiert).

## Akzeptanzkriterien

- [ ] `grep -r '\.sf-plugin' skills` liefert **0** Treffer; alle Referenzen in `skills/**` nutzen `.firmo/`.
- [ ] `.gitignore` nutzt `.firmo/*` + `!.firmo/config.json`; `package.json` `name` = `firmo`, Beschreibung aktualisiert.
- [ ] `setup` und die config-lesenden Tools beschreiben eine einmalige, nicht-destruktive Migration `.sf-plugin/` → `.firmo/` mit Fallback-Lesen (idempotent, keine stille Löschung).
- [ ] `node build.mjs` läuft fehlerfrei; die generierte Ausgabe referenziert `.firmo/`, nicht `.sf-plugin/`.
- [ ] Historische Plan-Dateien unter `docs/plan/` sind unverändert; `sf-`-Präfix, Router und Auslieferung sind unangetastet (Scope-Grenze).

## Validierungsplan

- `grep -rc '\.sf-plugin' skills` = 0; `grep -rc '\.firmo' skills` > 0.
- `node build.mjs` grün; Ausgabe-Stichprobe auf `.firmo/`.
- `pnpm agent:check` / `oxfmt --check` grün auf geänderten Dateien.
- Migrations-Prosa in `setup` + mind. `plan`/`review`/`apply` vorhanden und konsistent.

## Annahmen und offene Punkte

- Aufruf-Referenzen (`/build`, `$sf-build`) und Skill-Verzeichnisnamen bleiben in Teil 1 bewusst unverändert; sie ändern sich zusammen mit dem Router in Teil 2, um den Build durchgehend grün zu halten.

## Testergebnisse

- `node build.mjs`: **grün** (18 Skills/Tools, 11 Agents); generierte Ausgabe referenziert `.firmo/`.
- `pnpm agent:check` (`oxfmt --check`): **grün** über alle Dateien.
- Grep-Gegenprobe: `.sf-plugin` in `skills/` nur noch bewusst im Migrations-Baustein (`_shared/firmo-dir-migration.md`) und in `sf-setup` (Legacy-`.gitignore`-Migration); keine unbeabsichtigten Runtime-Referenzen.
- Include-Auflösung von `firmo-dir-migration` in beiden Harness-Ausgaben (Claude-Commands + Codex-Skills) für `plan`, `review`, `apply-review`, `maintain`, `investigate` verifiziert.

## Review-Findings

**Datum:** 2026-07-06
**Reviewer:** Selbst-Review des Orchestrators gegen die Akzeptanzkriterien (spezialisierter `sf-nodejs-reviewer` in diesem Lauf nicht separat gestartet — reine Markdown-/Metadaten-Änderung ohne Laufzeitcode; unabhängige Verifikation über Build + Format).

### Zusammenfassung

| Status                  | Anzahl |
| ----------------------- | -----: |
| Behoben                 |      0 |
| Offen / Nicht umgesetzt |      0 |

Keine kritischen Findings. Umgesetzte Ergänzungen gegenüber dem Ausgangsplan:

- Neuer Baustein `skills/_shared/firmo-dir-migration.md` (einmalige, idempotente, nicht-destruktive Migration `.sf-plugin/` → `.firmo/` + Fallback-Lesen + kein ungefragter Footprint), eingebunden in `plan`, `review`, `apply-review`, `maintain`, `investigate`.
- `sf-setup`: `.gitignore`-Migration erkennt zusätzlich Alt-`.sf-plugin/`-Zeilen; Zusammenfassung entsprechend ergänzt.
- Die aktive Verzeichnis-Datenmigration liegt bewusst bei den config-lesenden Tools (nicht in `sf-setup`, dessen Charter auf `.gitignore` + `config.json` beschränkt ist).

Kein Commit erstellt (auf ausdrückliche Ansage bzw. am Ende der Staffelung).
