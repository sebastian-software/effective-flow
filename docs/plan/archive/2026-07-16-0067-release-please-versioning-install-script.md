# 0067: Release-please-Versionierung und Installationsskript

**Planungsstatus:** Umgesetzt

**Empfohlener Workflow:** Feature / `$firmo build`

## Anforderung

Das Repository soll von manueller Versionierung auf release-please umgestellt werden.
`CHANGELOG.md` soll das release-please-Format verwenden. `local-update.sh` soll in
`install-skill.sh` umbenannt werden. `install-skill.sh` installiert standardmäßig die
letzte verfügbare Release-Version; nur mit Zusatzparameter wird der aktuell
ausgecheckte Stand gebaut und installiert. `local-link.sh` bleibt unverändert.

## Architekturentscheidungen

- `.release-please-manifest.json` ersetzt `version.txt` als Versionsquelle. Der Build
  liest den Root-Eintrag `"."`, den release-please im Release-PR aktualisiert.
- `release-please-config.json` nutzt `release-type: "simple"` für das Root-Paket.
  Das passt zum Repository, weil es kein npm-Paket veröffentlicht, sondern ein
  generiertes Skill-Archiv als GitHub-Release-Asset ausliefert.
- Der Release-Workflow läuft auf `main`, führt die bestehenden Checks aus, startet
  `googleapis/release-please-action@v4` im Manifest-Modus und lädt bei erzeugtem
  Release das gebaute `firmo-<tag>.tar.gz` als Asset hoch.
- `install-skill.sh` nutzt ohne Argument `gh release download` für das letzte
  Release-Archiv. Mit beliebigem Zusatzargument bleibt der bisherige lokale
  Build-und-Copy-Fluss verfügbar.
- `local-common.sh` kapselt nun zwei Pfade: Deployment aus vorhandenem `dist/` und
  Deployment nach lokalem Build. Dadurch bleibt `local-link.sh` als Entwicklungsweg
  kompatibel.

## Betroffene Dateien

| Datei                                            | Änderung                                                       |
| ------------------------------------------------ | -------------------------------------------------------------- |
| `.release-please-manifest.json`                  | Neue release-please-Versionsquelle                             |
| `release-please-config.json`                     | Neue release-please-Konfiguration                              |
| `.github/workflows/release.yml`                  | Release-PR/GitHub-Release über release-please, Asset-Upload    |
| `.github/workflows/ci.yml`                       | Shellcheck-Ziel auf `install-skill.sh` aktualisiert            |
| `build.mjs`                                      | Versionsstempel aus Manifest statt `version.txt`               |
| `CHANGELOG.md`                                   | release-please-kompatible Versionsüberschriften und Kategorien |
| `local-update.sh` → `install-skill.sh`           | Umbenennung und neues Default-Verhalten                        |
| `local-common.sh`                                | Deployment aus Release-Archiv oder lokalem Build               |
| `README.md`, `AGENTS.md`, `src/tools/version.md` | Versionierungs- und Installationsdoku aktualisiert             |

## Implementierungsdetails

- `build.mjs` validiert, dass `.release-please-manifest.json` einen semver-kompatiblen
  Root-Eintrag enthält, und nutzt diesen Wert für `{{VERSION}}`.
- Das Release-Archiv bleibt kompatibel mit dem bisherigen Layout (`claude/…`,
  `codex/…`), weil der Workflow weiterhin `tar -czf … -C dist .` verwendet.
- Der Installer kann über `FIRMO_REPO=owner/repo` auf ein anderes GitHub-Repository
  zeigen; sonst wird `origin` ausgewertet und bei Bedarf `fastner/firmo` verwendet.

## Testergebnisse

- `node build.mjs`
- `merge-stdout pnpm agent:check`
- `node --test`
- `shellcheck --severity=error install-skill.sh local-link.sh`

## Review-Findings

**Datum:** 2026-07-08
**Reviewer:** keiner

Keine Findings gefunden.
