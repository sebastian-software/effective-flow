# 0061: Firmo Teil 3 – Auslieferung (npx skills / dalo) und Skripte statt Plugin

**Planungsstatus:** Nicht umgesetzt
**Quelle:** /plan
**Empfohlener Workflow:** Refactoring (`/refactor`)

## Anforderung

Teil 3 der Staffelung von [0058](0058-firmo-rename-and-lazy-tool-router.md). Stellt die Auslieferung vom Claude-Plugin/Marketplace auf ein **Standard-Directory-Skill** um, das via **`npx skills`** installierbar und **dalo**-kompatibel ist. Setzt Teil 2 (0060) voraus (Ein-Skill-Layout existiert).

## Scope-Abgrenzung

- **In Scope:** universelles Ausgabe-Layout (`dist/…/firmo/`) als konsumierbares Directory-Skill; `local-update.sh`/`local-link.sh` auf `~/.claude/skills/firmo` + `~/.agents/skills/firmo` umstellen (mit `--copy`-Empfehlung, Symlink-Schutz); `claude-link-plugin.sh` entfernen; Cleanup alter `sf-*`-Skills, `~/.codex/agents/sf-*.toml` und Marketplace `sf-claude-plugin`.
- **Nicht in Scope:** README/Doku (Teil 4); ein eigenständiger `npx firmo`-Installer (optionaler Folgeplan); aktive dalo-Integration/-Release (nur Kompatibilität).

## Betroffene Dateien

| Datei                   | Beschreibung                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `local-update.sh`       | Ziel `~/.claude/skills/firmo` + `~/.agents/skills/firmo`; Marketplace-Pfad entfernen; bestehende externe Symlinks/fremde Skills nicht überschreiben; Cleanup alter `sf-*`/Marketplace |
| `local-link.sh`         | analog auf Skill-Link umstellen                                                                                                                                                       |
| `claude-link-plugin.sh` | entfernen (Plugin-Marketplace entfällt)                                                                                                                                               |
| `build.mjs`             | ggf. Ausgabe-Zielpfade für universelles Directory-Skill finalisieren                                                                                                                  |

## Implementierungsdetails

Delivery-Details und die konkreten Learnings (npx-skills-Symlink-Fallstricke `--copy`, externen `~/.claude/skills`-Symlink nicht ersetzen, schlanke Payload ohne `node_modules`/`dist`) siehe [0058](0058-firmo-rename-and-lazy-tool-router.md), Abschnitte „Auslieferung", „Learnings" und die zugehörigen Akzeptanzkriterien/Edge Cases.

## Akzeptanzkriterien

- [ ] Das gebaute `firmo`-Skill ist ein Standard-Directory-Skill, via `npx skills` installierbar und als dalo-Source linkbar (Ziele Claude `~/.claude/skills/firmo`, Codex `~/.agents/skills/firmo`).
- [ ] Ausgeliefert wird nur Laufzeitnötiges (SKILL.md, `tools/`, `agents/`, minimale `scripts/`); keine `node_modules`, `dist/`, Build-/Doku-Artefakte.
- [ ] `local-update.sh`/`local-link.sh` deployen dorthin; `claude-link-plugin.sh` ist entfernt; Cleanup entfernt alte `sf-*`/`sf-claude-plugin`.
- [ ] Install/Link überschreibt keinen bestehenden externen `~/.claude/skills`-Symlink und keine fremden Skills; `--copy`-Variante unterstützt/empfohlen.

## Validierungsplan

- Dry-Run der Skripte gegen ein temporäres HOME/Skills-Verzeichnis; Ergebnis-Layout prüfen.
- Symlink-Schutz gezielt testen (vorhandener Symlink bleibt erhalten).
- Grep-Gegenprobe: keine Marketplace-/Plugin-Pfade mehr in Skripten.
