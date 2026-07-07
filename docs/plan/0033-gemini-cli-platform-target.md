# 0033: Gemini-CLI-Plattform-Target

**Planungsstatus:** Nicht umgesetzt
**Quelle:** $sf-plan

## Anforderung

Das bestehende Skill-Set soll zusätzlich zu Codex und Claude Code auch für Gemini CLI ausgeliefert werden können. Ziel ist ein drittes Build-Ziel unter `dist/gemini/`, das die vorhandenen Orchestratoren, Utilities und spezialisierten Agents in Gemini-kompatible Extension-Artefakte transformiert.

Verifizierter Code-Kontext:

- `build.mjs` erzeugt aktuell genau zwei Targets: `dist/codex/` und `dist/claude/`.
- `build.mjs` verarbeitet Skill-Quellen aus `skills/sf-*`, löst `{{INCLUDE:...}}`, transformiert `{{SKILL:...}}`, `{{AGENT:...}}` und `{{ASK}}` plattformspezifisch.
- Orchestratoren und Utilities werden für Codex als `SKILL.md` und für Claude Code als Command-Markdown generiert.
- Agents werden für Codex als TOML Custom Agents und für Claude Code als Agent-Markdown generiert.
- `README.md`, `local-update.sh` und `local-link.sh` dokumentieren und deployen aktuell nur Codex und Claude Code.
- Der aktuelle Build zählt 8 Skills und 9 Agents.

Externer Kontext aus Gemini-CLI-Dokumentation:

- Gemini CLI Extensions verwenden ein `gemini-extension.json` im Extension-Root.
- Gemini CLI Custom Commands liegen als TOML-Dateien unter `commands/`; der Command-Name ergibt sich aus dem Pfad.
- Gemini CLI unterstützt Extension-Inhalte wie Custom Commands, Agent Skills unter `skills/`, Subagents unter `agents/`, MCP-Server, Policies und `GEMINI.md`.
- Gemini CLI Subagents sind laut Dokumentation ein Preview-Feature. Der Plan behandelt Subagent-Parität daher als vorsichtig zu validierenden Teil, nicht als garantiert gleichwertig zu Claude/Codex.

## Architekturentscheidungen

- **Drittes Build-Target statt separater Codepfad:** `build.mjs` bleibt die zentrale Single-Source-Pipeline. Gemini wird analog zu Codex und Claude aus denselben `skills/sf-*`-Quellen erzeugt.
- **MVP mit Commands + Skills + Agents:** Das Gemini-Target soll Orchestratoren als Commands, alle Skills als Agent Skills und spezialisierte Worker als Subagents generieren. Falls Subagents in der Zielumgebung nicht stabil genug sind, bleiben Agent Skills und Commands trotzdem nutzbar.
- **Gemini Extension als Auslieferungsformat:** `dist/gemini/sf-claude-plugin/` erhält ein `gemini-extension.json`, `commands/`, `skills/`, `agents/` und optional `GEMINI.md`.
- **Command-Namespace `sf`:** Orchestratoren und Utilities werden als Gemini Commands unter `commands/sf/*.toml` erzeugt, damit die Befehle als `/sf:build`, `/sf:review`, `/sf:apply-review` usw. erscheinen.
- **ASK bleibt textbasiert:** Gemini bekommt keine Claude-ähnliche `AskUserQuestion`-UI-Transformation. `{{ASK}}` wird wie bei Codex zu einer bedingten Textfrage transformiert.
- **Keine Shell-Injection im ersten Schritt:** Gemini Custom Commands unterstützen `!{...}`, aber der erste Port soll keine zusätzlichen Shell-Injections in Commands einführen. Die vorhandenen Workflow-Anweisungen steuern Tool-Nutzung im Modell statt über vorab injizierte Shell-Ausgaben.
- **Tool- und Modell-Mapping konservativ:** Gemini-Agent-Frontmatter erhält Gemini-kompatible Toolnamen und Modellnamen über explizite Mapping-Funktionen. Unsichere Claude-/Codex-spezifische Werte werden nicht blind übernommen.

## Betroffene Dateien

| Datei                                          | Beschreibung                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `build.mjs`                                    | Neues Gemini-Dist-Target, Manifest-Erzeugung, Command-TOML-, Skill- und Subagent-Generatoren, Placeholder-/ASK-Transforms für Gemini |
| `README.md`                                    | Architektur-, Build-, Struktur- und Deployment-Dokumentation um Gemini CLI erweitern                                                 |
| `local-link.sh`                                | Optionales lokales Linken der Gemini Extension per `gemini extensions link` oder dokumentierter manueller Fallback                   |
| `local-update.sh`                              | Optionales lokales Aktualisieren/Installieren der Gemini Extension oder Hinweis auf getrennten Gemini-Installationsschritt           |
| `docs/skill-migration-notes.md`                | Notizen zu Gemini-spezifischen Abweichungen ergänzen                                                                                 |
| `docs/plan/0033-gemini-cli-platform-target.md` | Audit-Trail dieser Planung                                                                                                           |

## Implementierungsdetails

### Vorgehen

1. Konstanten in `build.mjs` ergänzen:
   - `DIST_GEMINI`
   - Gemini-Extension-Name
   - Gemini-Extension-Ausgabepfad
2. Clean-/Create-Phase erweitern:
   - `dist/gemini/` löschen und neu anlegen
   - Unterverzeichnisse `commands/sf/`, `skills/` und `agents/` erstellen
3. Gemini-Placeholder-Transforms ergänzen:
   - `{{SKILL:sf-build}}` → `/sf:build`
   - `{{SKILL:sf-apply-review}}` → `/sf:apply-review`
   - `{{AGENT:sf-code-validator}}` → `sf-code-validator` oder eindeutige Subagent-Referenz nach Gemini-Konvention
   - `{{ASK}}` → bedingte Textfrage mit Optionen, analog zu Codex
4. Gemini-Command-Generator ergänzen:
   - Für `type: orchestrator` und `type: utility` jeweils eine TOML-Datei unter `commands/sf/` erzeugen.
   - `description` aus der Skill-Frontmatter übernehmen.
   - `prompt` als multiline TOML-String aus dem transformierten Body schreiben.
   - Command-Dateinamen aus dem `sf-`-Präfix ableiten, z. B. `sf-apply-review` → `commands/sf/apply-review.toml`.
5. Gemini-Agent-Skills generieren:
   - Für alle `skills/sf-*` ein Verzeichnis unter `dist/gemini/sf-claude-plugin/skills/<skill-name>/SKILL.md` erzeugen.
   - Includes und Platzhalter transformieren.
   - Frontmatter minimal halten: `name` und bereinigte `description`.
   - Orchestratoren, Utilities und Agents einschließen, damit Gemini Skills auch unabhängig von Commands aktivierbar sind.
6. Gemini-Subagents generieren:
   - Für `type: agent` Markdown-Dateien unter `agents/` erzeugen.
   - YAML-Frontmatter mit `name`, `description`, `kind`, `tools`, optionalem `model` und konservativen Limits erzeugen.
   - Toolnamen über Mapping übersetzen, z. B. Claude `Read` zu Gemini `read_file`, `Grep` zu `grep_search`, `Bash` zu `run_shell_command`.
   - Wenn ein Tool nicht eindeutig mapbar ist, weglassen und im Build eine Warnung ausgeben.
7. Gemini-Manifest erzeugen:
   - `gemini-extension.json` mit `name`, `version`, `description` und optional `contextFileName`.
   - Keine `excludeTools` setzen, sofern nicht explizit nötig; Policies bleiben ein späterer Schritt.
8. Optionales `GEMINI.md` erzeugen oder kopieren:
   - Kurzer Kontext, dass die Extension aus denselben `skills/`-Quellen wie Codex und Claude erzeugt wird.
   - Hinweise zur deutschen Dokumentationssprache und zu den `/sf:*` Commands.
9. Build-Summary erweitern:
   - Ausgabe für Gemini Commands, Skills und Agents ergänzen.
10. README aktualisieren:

- „Dual-Platform“ zu „Multi-Platform“ ändern.
- Tabelle für Codex, Claude Code und Gemini CLI ergänzen.
- Installations-/Link-Hinweise für Gemini CLI ergänzen.

11. Lokale Deployment-Skripte entscheiden:

- Minimal: Gemini nicht automatisch deployen, aber Pfad und `gemini extensions link dist/gemini/sf-claude-plugin` im README dokumentieren.
- Optional: `local-link.sh` um Gemini-Link erweitern, falls `gemini` im PATH vorhanden ist; bei fehlendem CLI nur warnen.
- Optional: `local-update.sh` mit bewusstem Hinweis, dass Gemini Extension-Updates bei aktiver Session erst nach Neustart sichtbar sind.

12. Keine Änderung an fachlichen Skill-Inhalten vornehmen, außer Gemini-spezifische Transformationsartefakte erfordern minimale Plattformhinweise.

### Komponenten-Struktur

Geplante Gemini-Ausgabe:

| Pfad                                                 | Inhalt                                          |
| ---------------------------------------------------- | ----------------------------------------------- |
| `dist/gemini/sf-claude-plugin/gemini-extension.json` | Gemini Extension Manifest                       |
| `dist/gemini/sf-claude-plugin/GEMINI.md`             | Optionaler Extension-Kontext                    |
| `dist/gemini/sf-claude-plugin/commands/sf/*.toml`    | Slash Commands wie `/sf:build` und `/sf:review` |
| `dist/gemini/sf-claude-plugin/skills/sf-*/SKILL.md`  | Agent Skills für alle Source-Skills             |
| `dist/gemini/sf-claude-plugin/agents/*.md`           | Gemini Subagents für `type: agent`              |

### API-Anbindung

Nicht relevant. Es werden keine externen APIs angebunden. Der Port erzeugt statische Extension-Artefakte aus lokalen Markdown-/TOML-/JSON-Dateien.

### Styling-Ansatz

Nicht relevant. Es gibt keine UI-Komponenten.

### Barrierefreiheit

Nicht relevant für die Build-Pipeline. Die Markdown-/TOML-Ausgaben sollen aber lesbar strukturiert bleiben.

### Edge Cases

- Wenn Gemini CLI nicht installiert ist, darf `node build.mjs` trotzdem erfolgreich laufen; nur optionale Link-/Update-Skripte dürfen eine Warnung ausgeben.
- Wenn Gemini Subagent-Toolnamen nicht eindeutig mapbar sind, darf der Build nicht still falsche Tools eintragen. Entweder warnen und weglassen oder das Mapping explizit ergänzen.
- Wenn TOML-Prompts dreifache Anführungszeichen oder problematische Sequenzen enthalten, muss der Generator TOML korrekt escapen oder eine robuste Literal-String-Strategie verwenden.
- Wenn zwei Commands mit demselben Namen entstehen, muss der Build deterministisch abbrechen.
- Wenn Gemini CLI seine Subagent-Preview-Syntax ändert, soll der Command-/Skill-Teil weiterhin unabhängig nutzbar bleiben.
- Wenn `{{ASK}}` eine `when:`-Bedingung enthält, muss Gemini die Bedingung textuell behalten.

## Akzeptanzkriterien

- [ ] `node build.mjs` erzeugt zusätzlich `dist/gemini/sf-claude-plugin/`.
- [ ] `dist/gemini/sf-claude-plugin/gemini-extension.json` enthält Name, Version und Beschreibung.
- [ ] Für alle Orchestratoren und Utilities existiert eine Gemini Command-TOML-Datei unter `commands/sf/`.
- [ ] Für alle `skills/sf-*` existiert ein Gemini Agent Skill unter `skills/<skill-name>/SKILL.md`.
- [ ] Für alle `type: agent`-Skills existiert ein Gemini Subagent unter `agents/`.
- [ ] `{{SKILL:...}}`, `{{AGENT:...}}`, `{{INCLUDE:...}}` und `{{ASK}}` sind in Gemini-Ausgaben vollständig transformiert.
- [ ] Bedingte `{{ASK}}`-Blöcke bleiben in Gemini als bedingte Textfragen erhalten.
- [ ] Build-Summary zeigt Gemini Commands, Skills und Agents.
- [ ] README dokumentiert Gemini CLI als drittes Target inklusive Link-/Installationshinweis.
- [ ] `node --check build.mjs` besteht.

## Validierungsplan

- `node --check build.mjs`
- `node build.mjs`
- `rg` gegen `dist/gemini/`, um untransformierte Platzhalter zu finden:
  - `{{SKILL:`
  - `{{AGENT:`
  - `{{INCLUDE:`
  - `{{ASK`
- `rg` gegen `dist/gemini/commands/`, um erwartete Command-Dateien zu prüfen.
- `rg` gegen `dist/gemini/agents/`, um Toolnamen und Frontmatter-Felder zu prüfen.
- Falls Gemini CLI lokal verfügbar ist:
  - `gemini extensions link dist/gemini/sf-claude-plugin`
  - Gemini CLI neu starten oder Commands neu laden, soweit unterstützt.
  - `/commands list` prüfen.
  - `/sf:version` oder `/sf:plan` als Smoke-Test verwenden.
- Falls Gemini CLI nicht verfügbar ist: Validierung auf statische Artefakte und Build-Syntax beschränken und das im Abschluss dokumentieren.

## Annahmen und offene Punkte

- Annahme: Der erste Gemini-Port zielt auf Gemini CLI, nicht auf Gemini Web, AI Studio oder IDE-spezifische Gemini-Code-Assist-Oberflächen.
- Annahme: Commands und Agent Skills sind stabil genug für den MVP; Subagents sind wegen Preview-Status gesondert zu beobachten.
- Annahme: Gemini CLI kann Extension Commands aus `commands/` und Skills aus `skills/` gemeinsam laden.
- Offener Punkt: Exaktes Gemini-Modell-Mapping für die bestehenden Codex-/Claude-Modellklassen muss bei der Umsetzung final gewählt werden.
- Offener Punkt: Ob `local-update.sh` Gemini automatisch installieren/aktualisieren soll oder nur `local-link.sh` für Entwicklung erweitert wird, kann während der Umsetzung anhand der lokalen Gemini-CLI-Verfügbarkeit entschieden werden.
- Offener Punkt: Gemini-spezifische Policies können später ergänzt werden; sie sind nicht Teil des MVP.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       1 |
| Security    |        0 |       0 |       1 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       0 |       1 |
| Testbarkeit |        0 |       0 |       0 |
| Scope       |        0 |       0 |       0 |
| Wartbarkeit |        0 |       0 |       0 |

### Befunde

- **Hinweis – Architektur:** Gemini Subagents sind laut externer Dokumentation Preview. Der Plan begrenzt das Risiko, indem Commands und Agent Skills als stabiler MVP unabhängig von Subagent-Parität erzeugt werden.
- **Hinweis – Security:** Gemini Custom Commands unterstützen Shell-Injection mit Bestätigung. Der Plan führt im ersten Schritt keine neuen `!{...}`-Shell-Injections ein und reduziert damit zusätzliche Tool-Bestätigungen und Sicherheitsrisiken.
- **Hinweis – Fehlerfälle:** Gemini CLI ist eventuell lokal nicht installiert. Der Plan verlangt, dass der Build auch ohne Gemini CLI funktioniert und nur optionale Deployment-Schritte warnen.
