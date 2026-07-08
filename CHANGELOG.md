# Changelog

Alle nennenswerten Änderungen an Firmo werden in dieser Datei festgehalten.

Das Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
und das Projekt folgt [Semantic Versioning](https://semver.org/lang/de/).

Einträge vor der Einführung dieses Changelogs sind rückwirkend aus der Git-Historie
zusammengefasst und daher gröber als künftige Einträge.

## [Unreleased]

## [1.40.0] - 2026-07-08

### Changed

- Versionierungsregel präzisiert: Fixes, die per Pull Request ausgeliefert
  werden, erhöhen künftig die Patch-Version.

## [1.39.1] - 2026-07-08

### Fixed

- Codex-Ausgaben rendern Firmo-Aufrufhinweise als `$firmo ...` statt als
  `/firmo ...`.

### Added

- CI-Workflow (Format-Check, Tests, Build, Shellcheck) und Release-Workflow mit
  Tag-/`version.txt`-Konsistenzprüfung.
- Build-Guards: tote `{{SKILL:X}}`/`{{AGENT:X}}`-Referenzen und nicht strikt
  gequotete Descriptions brechen den Build ab.
- `node:test`-Suite für die extrahierten Build-Transformationen (`build-lib.mjs`).
- Schweregrad-Label `hinweis` für Hinweis-Findings im Remote-Modus.
- `CHANGELOG.md` (diese Datei); der Version-Bump-Fluss verlangt einen Eintrag.

### Changed

- `build.mjs` schreibt `dist/` atomar über ein temporäres Verzeichnis.
- Frontmatter-Parsing validiert Pflichtfelder und bricht bei nicht darstellbaren
  Formen ab statt still leere Werte zu liefern.
- Ausgelieferte Quellen sprechen durchgängig von „Firmo“/„Skill“ statt „Plugin“.
- Default für `worktree.branchPrefix` von `sf` auf `firmo` vereinheitlicht.
- `apply` ohne Argument bietet im Remote-Modus offene Review-Epics als Quellen an.
- Doku-Konsistenz: README/AGENTS.md, Strukturdiagramm, Plan-Statusmarker und
  deutsche Typografie repo-weit korrigiert.

### Removed

- Obsolete `TODO.md` (nur noch erledigte Alt-Einträge).

## [1.38.0]

### Changed

- Issue-Tracker-Labels von `sf-`- auf `firmo-`-Präfix migriert (`sf-` bleibt als
  Lese-Rückwärtskompatibilität erhalten).
- Statische Marketing-Homepage unter `site/` und projektweite Config mit sicheren
  Defaults ergänzt; `argument-hint` für die Slash-Command-Autovervollständigung.

## [1.37.0]

### Changed

- Umbenennung zu **Firmo**: einzelnes `/firmo <tool>`-Router-Skill mit
  Lazy-Loading; Quellen in eine gespiegelte `src/`-Struktur ohne `sf-`-Präfix
  verschoben; Claude-Agents als registrierte Subagents unter `~/.claude/agents`.

### Added

- Remote-Issue-Tracker-Modus für `review`/`apply-review`; `apply`-Router mit
  gemeinsamer Apply-Quellen-Erkennung; issue-getriebene Skills `apply-issues`
  und `plan-issue`.

## [1.36.0]

### Added

- Opt-in-Worktree-Integration und `pr`-Skill; `setup`-Skill für
  `.gitignore`/Config-Bootstrap; `investigate`-Analyse-Skill; Rust-Implementer-
  und -Reviewer-Agents; goal-getriebener Abschluss der Workflows.

## [1.35.1]

### Added

- Schlanker `maintain`-Orchestrator für Dependency-Wartung; `pnpm`/oxfmt-Tooling
  mit `agent:check`; garantiert eindeutige, sprachsensitive Plan-Statusmarker;
  Doku-Kategorien-Konvention.
