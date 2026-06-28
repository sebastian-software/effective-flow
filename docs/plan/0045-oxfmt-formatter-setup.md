# 0045: oxfmt-Formatter-Setup

**Planungsstatus:** Umgesetzt
**Quelle:** $sf-build
**Empfohlener Workflow:** Feature (`$sf-build`)

## Anforderung

Das Repository soll erstmals ein verwaltetes Dependency-Management und einen einheitlichen Formatter erhalten:

1. Eine `package.json` (verwaltet über **pnpm**) als Grundlage für Dev-Dependencies einführen.
2. **oxfmt** (oxc-Formatter) als Dev-Dependency installieren und konfigurieren.
3. oxfmt auf alle unterstützten Dateien des Repos anwenden.
4. Ein Script `agent:check` in der `package.json` einführen, das oxfmt im Prüfmodus (`--check`) ausführt.

## Architekturentscheidungen

- **Paketmanager pnpm:** `package.json` erhält `"packageManager": "pnpm@<version>"` und `"private": true`. Das Repo ist kein npm-Publikationsziel, sondern ein Build-Tooling-Repo; die Dependency dient nur dem lokalen Formatter.
- **oxfmt als einziger Formatter:** Installation als `devDependency`. Aufruf über pnpm-Scripts:
  - `format` → `oxfmt` (schreibt)
  - `agent:check` → `oxfmt --check` (prüft ohne zu schreiben; Exit-Code ungleich 0 bei Abweichungen)
- **Konfiguration via `.oxfmtrc.json`:**
  - `ignorePatterns` (gitignore-Syntax) schließt generierte und laufzeitlokale Pfade aus: `dist/**`, `node_modules/**`, `.sf-plugin/**` sowie `skills/**` (siehe Befund unten).
  - `embeddedLanguageFormatting: "off"` — eingebettete Code-Blöcke (`js`, `json`, `markdown` …) in Skill- und Plan-Dateien sind bewusst gestaltete Beispiele/Templates (teils mit Platzhalter-Syntax wie `{{INCLUDE:…}}`). Sie dürfen nicht rekursiv umformatiert werden.
  - `singleQuote: true` — `build.mjs` nutzt durchgängig Single Quotes; das hält den JS-Diff klein und die bestehende Stilkonvention bei.
- **Kein Plugin-Output betroffen:** Das Setup ändert nur Repo-Quellen (`build.mjs`, Markdown) und Tooling. Der generierte Plugin-Inhalt unter `dist/` ändert sich dadurch nicht. Daher **kein** Versions-Bump von `version.txt` und keine Änderung an der Marketplace-Beschreibung.
- **Sicherheit vor Bulk-Reformat:** oxfmt wird zuerst an einer Stichprobe (Plan-Datei mit Tabelle und deutscher Typografie) im `--check`-Modus und mit Diff geprüft, bevor es repo-weit schreibt. Beschädigt oxfmt deutsche Typografie (`„…"`, `–`) oder Markdown-Tabellen, wird der Bulk-Lauf gestoppt und der User informiert.

## Betroffene Dateien

| Datei                                                                        | Beschreibung                                                                                         |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `package.json`                                                               | Neu: pnpm-verwaltet, `private`, `packageManager`, devDep `oxfmt`, Scripts `format` und `agent:check` |
| `pnpm-lock.yaml`                                                             | Neu: Lockfile aus `pnpm install`                                                                     |
| `.oxfmtrc.json`                                                              | Neu: oxfmt-Konfiguration mit `ignorePatterns`, `embeddedLanguageFormatting`, `singleQuote`           |
| `.gitignore`                                                                 | `node_modules/` ergänzen                                                                             |
| `build.mjs`                                                                  | Durch oxfmt formatiert (Stil unverändert dank `singleQuote`)                                         |
| `*.md` (87 Dateien, ohne `dist/`, `.sf-plugin/`, `node_modules/`, `TODO.md`) | Durch oxfmt formatiert                                                                               |
| `docs/plan/0045-oxfmt-formatter-setup.md`                                    | Plan nach Umsetzung abschließen                                                                      |

## Implementierungsdetails

### Vorgehen

1. `package.json` anlegen (`private: true`, `packageManager: pnpm@<aktuelle Version>`, `devDependencies.oxfmt`, Scripts `format` und `agent:check`).
2. `.oxfmtrc.json` mit den oben genannten Optionen anlegen.
3. `.gitignore` um `node_modules/` ergänzen.
4. `pnpm install` ausführen (erzeugt `pnpm-lock.yaml` und installiert oxfmt).
5. **Stichprobe:** `pnpm exec oxfmt --check` über eine repräsentative Plan-Datei und einen Vergleichs-Diff prüfen; sicherstellen, dass Typografie und Tabellen erhalten bleiben.
6. Bei sauberer Stichprobe `pnpm format` repo-weit ausführen.
7. Diff sichten, insbesondere Plan-Dateien (Typografie/Tabellen) und `build.mjs` (Funktionsfähigkeit).
8. `pnpm agent:check` muss anschließend ohne Abweichung durchlaufen.
9. `node build.mjs` muss weiterhin fehlerfrei bauen (Reformat von `build.mjs` darf das Build-Ergebnis nicht verändern).

### Edge Cases

- oxfmt verändert deutsche Typografie oder Tabellen: Bulk-Lauf stoppen, `embeddedLanguageFormatting`/Optionen prüfen oder Markdown vom Formatter ausnehmen, User informieren.
- oxfmt respektiert `.gitignore` nicht automatisch: `ignorePatterns` deckt die kritischen Pfade explizit ab.
- Reformatiertes `build.mjs` ist syntaktisch kaputt: über `node --check build.mjs` und einen anschließenden Build absichern.
- `.sf-plugin/`-Review-Reports (Markdown) dürfen nicht angefasst werden: über `ignorePatterns` ausgeschlossen.

## Akzeptanzkriterien

- [x] `package.json` existiert, ist pnpm-verwaltet (`packageManager`, `private`) und enthält die devDependency `oxfmt`.
- [x] `package.json` enthält ein Script `agent:check`, das `oxfmt --check` ausführt, sowie ein `format`-Script.
- [x] `.oxfmtrc.json` schließt `dist/**`, `node_modules/**`, `.sf-plugin/**` und `skills/**` aus.
- [x] `.gitignore` ignoriert `node_modules/`.
- [x] oxfmt wurde auf alle unterstützten Dateien angewendet; `pnpm agent:check` läuft ohne Abweichung durch.
- [x] `node build.mjs` baut nach dem Reformat weiterhin fehlerfrei.
- [x] Deutsche Typografie und Markdown-Tabellen in den Plan-Dateien bleiben inhaltlich unverändert.
- [x] Der Planstatus dieser Datei wird nach Umsetzung auf `Umgesetzt` gesetzt.

## Validierungsplan

- `pnpm install` erfolgreich; `pnpm-lock.yaml` erzeugt.
- `pnpm exec oxfmt --check` an Stichprobe vor Bulk-Lauf.
- `pnpm agent:check` nach dem Bulk-Lauf → keine Abweichung.
- `node --check build.mjs` und `node build.mjs` → fehlerfrei, gleiche Artefaktanzahl wie zuvor.
- `git diff --stat` sichten; Stichproben-Diff einer Plan-Datei auf erhaltene Typografie/Tabellen prüfen.

## Annahmen und offene Punkte

- Annahme: „Alle unterstützten Dateien" umfasst die im Repo real vorkommenden oxfmt-Sprachen, praktisch JavaScript (`build.mjs`) und Markdown; `.sh`, `.txt` und `.gitignore` werden von oxfmt nicht verarbeitet.
- Annahme: Single-Quote-Stil ist gewünscht, um den `build.mjs`-Diff klein zu halten. Falls oxfmt-Defaults (Double Quotes) bevorzugt werden, ist das eine Ein-Zeilen-Änderung in `.oxfmtrc.json`.
- Annahme: Kein Versions-Bump, da der distribuierte Plugin-Inhalt unverändert bleibt.
- Offener Punkt: Eine spätere Erweiterung könnte oxfmt zusätzlich in `local-update.sh` oder einen Git-Hook einbinden; das ist nicht Teil dieser Umsetzung.

## Befund: Skill-Quelldateien sind keine formatierbare Markdown

Die Stichprobe vor dem Bulk-Lauf hat einen Build-Breaker aufgedeckt:

- Die `skills/*.md` enthalten eine Build-DSL (`{{ASK}}`-Blöcke mit `  - label:`/`description:`-Zeilen, `{{INCLUDE:…}}`-Direktiven).
- oxfmt interpretiert die eingerückten `  - label:`-Zeilen als verschachtelte Markdown-Liste und entrückt sie auf Spalte 0, fügt nach `options:` eine Leerzeile ein und zieht `{{/ASK}}` in das letzte Listenelement.
- Der `parseAskBlock`-Parser in `build.mjs` erwartet `options:\s*\n` direkt gefolgt von `\s+-\s+label:`-Zeilen. Nach dem Reformat erzeugt der Build **stillschweigend** (Exit 0) ein kaputtes `/maintain`-Command ohne Optionen.

Konsequenz: `skills/**` wird per `ignorePatterns` vom Formatter ausgenommen. Die Skill-Quellen sind Build-Eingaben, keine Prosa-Dokumentation; ihre Formatierung wird durch den Build-Determinismus und den Platzhalter-Leak-Check abgesichert, nicht durch oxfmt. Formatiert werden ausschließlich echte Markdown-Dokumente (`README.md`, `docs/**`) und `build.mjs`.

## Testergebnisse

- `pnpm install` erfolgreich; `pnpm-lock.yaml` erzeugt, oxfmt 0.56.0 installiert.
- Stichprobe an `docs/plan/0044-maintain-skill.md`: nur Tabellen-Spaltenausrichtung geändert; deutsche Typografie (`„…"`, `–`) und Inhalt unverändert.
- Stichprobe an `skills/*.md`: Build-Breaker erkannt (siehe Befund), Schaden zurückgerollt, `skills/**` ausgeschlossen.
- Bulk-Lauf `pnpm format`: 50 Dateien formatiert (`README.md`, `docs/**`, `build.mjs`, `package.json`, `.oxfmtrc.json`).
- `pnpm agent:check` → „All matched files use the correct format", Exit 0.
- `node --check build.mjs` → fehlerfrei.
- `node build.mjs` → unverändert 12 Codex-Skills, 9 Codex-Agents, 12 Claude-Code-Commands, 9 Claude-Code-Agents.
- `rg "\{\{INCLUDE:|\{\{SKILL:|\{\{AGENT:|\{\{ASK" dist/codex dist/claude` → keine Platzhalter-Leaks; `/maintain` enthält weiterhin 4 ASK-Optionen.

## Review-Findings

Keine Findings gefunden. Der einzige relevante Befund (Skill-DSL-Inkompatibilität) wurde während der Umsetzung adressiert und ist oben dokumentiert.
