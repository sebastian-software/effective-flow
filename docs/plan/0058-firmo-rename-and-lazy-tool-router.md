# 0058: Firmo – Umbenennung, Skill-Auslieferung und Lazy-Tool-Router (`/firmo <tool>`)

**Planungsstatus:** Umgesetzt
**Quelle:** /plan
**Empfohlener Workflow:** Feature (`/build`)

**Umsetzung:** In vier Teilplänen umgesetzt — [0059](0059-firmo-config-dir-rename-and-migration.md) (`.firmo/`-Verzeichnis + Migration), [0060](0060-firmo-router-lazy-loading-and-build.md) (Router, Lazy-Loading, `build.mjs`), [0061](0061-firmo-delivery-npx-skills-dalo.md) (Auslieferung als Directory-Skill) und [0062](0062-firmo-documentation.md) (Dokumentation) — alle „Umgesetzt".

## Anforderung

Das Produkt wird von „SF Skills" (`sf-*`) in **Firmo** umbenannt und grundlegend anders ausgeliefert und aufgerufen:

1. **Umbenennung** überall `sf-*` → `firmo` (Produktname, Skill-/Tool-/Agent-Namen, interne Referenzen, Doku, Build-Konstanten, Deploy-Skripte, Laufzeitverzeichnis).
2. **Keine Claude-Code-Plugin-/Marketplace-Auslieferung mehr.** Statt eines Plugins wird ein **einzelnes Skill** ausgeliefert.
3. **Ein Router-Skill mit Lazy-Loading** nach dem Vorbild von [pbakaus/impeccable](https://github.com/pbakaus/impeccable): Alle Tools werden als `/firmo <tool> <…>` aufgerufen. Das Router-Skill selbst ist dünn; die vollständigen Tool-Anweisungen werden **nur bei Bedarf** geladen, um Session-/Token-Exhaustion zu vermeiden.

Vom User in der Klärung bestätigte Rahmenentscheidungen:

- **Plattform-Scope:** multi-harness mit Fokus **Claude Code und Codex** (dual bleibt erhalten).
- **Auslieferung:** als Standard-Agent-Skill, installierbar via **`npx skills`**; zukünftig zusätzlich via **[sebastian-software/dalo](https://github.com/sebastian-software/dalo)**, falls passend. Kein Plugin/Marketplace.
- **Laufzeitverzeichnis:** `.sf-plugin/` → `.firmo/` **mit Migration**.
- **Tool-Oberfläche reduzieren** auf genau diese 15 Tools: `build`, `fix`, `plan`, `refactor`, `docs`, `review`, `apply`, `plan-issue`, `maintain`, `commit`, `pr`, `setup`, `open-plans`, `investigate`, `version`.

Begründung der Workflow-Empfehlung: Es entstehen neue nutzer-sichtbare Fähigkeiten (Router-Skill, Lazy-Loading, neuer Aufruf `/firmo <tool>`, neue Auslieferung) plus umfangreiche strukturelle Änderungen an Quelle, Build und Doku → **Feature**. Die Umsetzung ist bewusst als ein zusammenhängendes Feature geplant, kann aber gestaffelt werden (siehe „Annahmen und offene Punkte").

## Aufteilung in Teilpläne (Staffelung)

Auf Wunsch wird 0058 **gestaffelt** umgesetzt. Dieser Master-Plan bleibt die vollständige Referenz (Architektur, Learnings, Akzeptanzkriterien); die tatsächliche Umsetzung läuft über vier einzeln prüfbare Teilpläne, deren Grenzen so gewählt sind, dass jeder Teil den Build grün hält (der `sf-`-Präfix wandert zu Teil 2, weil er mit `build.mjs` verzahnt ist):

| Teil | Plan                                                  | Inhalt                                                                                                            | Empf. Workflow |
| ---- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------- |
| 1    | [0059](0059-firmo-config-dir-rename-and-migration.md) | `.sf-plugin/` → `.firmo/` + Migration/Fallback + `package.json`/`.gitignore` (build.mjs & `sf-`-Präfix unberührt) | Refactoring    |
| 2    | [0060](0060-firmo-router-lazy-loading-and-build.md)   | Router, Lazy-Loading, `build.mjs`-Umbau, `sf-*` → `firmo`, `apply-*` intern, `plan-issue`                         | Feature        |
| 3    | [0061](0061-firmo-delivery-npx-skills-dalo.md)        | Auslieferung via `npx skills`/dalo, Deploy-Skripte, Plugin/Marketplace entfernen, Cleanup                         | Refactoring    |
| 4    | [0062](0062-firmo-documentation.md)                   | README + `docs/` auf Firmo-Stand                                                                                  | Dokumentation  |

0058 selbst wird nicht direkt umgesetzt; sein Status wird auf `Umgesetzt` gesetzt, sobald 0059–0062 abgeschlossen sind.

## Architekturentscheidungen

- **Ein universelles `firmo`-Skill-Verzeichnis** als Auslieferungseinheit, gültig für Claude Code (`~/.claude/skills/firmo/` bzw. projektlokal `.claude/skills/firmo/`) und Codex (`~/.agents/skills/firmo/`). Standard-Directory-Skill-Layout (`SKILL.md` + Unterdateien), damit sowohl `npx skills` als auch `dalo` es ohne Sonderfall installieren/linken können.
- **Dünner Router (`SKILL.md`).** Enthält nur (a) den Tool-Katalog (15 Namen + je eine Kurzbeschreibung) und (b) die Dispatch-Regel. Er lädt **keine** Tool-Inhalte inline.
- **Lazy-Loading über Progressive Disclosure.** Bei `/firmo <tool>` liest der Agent gezielt `tools/<tool>.md` aus dem Skill-Verzeichnis und befolgt sie; andere Tool-Dateien werden nicht gelesen. `/firmo` ohne Argument gibt die Tool-Liste aus. Unbekanntes Tool → Hinweis + Liste. Restargumente werden an das Tool durchgereicht. Das gilt für Claude Code (`/firmo …`) und Codex (`$firmo …` bzw. Codex-Skill-Aufruf) analog.
- **Agents bleiben interne Subagents.** Die 12 Spezialisten (`ui-implementer`, `nodejs-implementer`, `rust-implementer`, `frontend-reviewer`, `nodejs-reviewer`, `rust-reviewer`, `code-validator`, `code-documenter`, `docs-writer`, `test-writer`, `e2e-tester`) werden **nicht** Teil der `/firmo <tool>`-Oberfläche. Sie liegen als Subagents unter `firmo/agents/*.md` (in den Skill genestet, von Claude Code und Codex auto-discovered) und werden von den Tools intern aufgerufen. Kein `sf-`-Präfix mehr.
- **Reduzierte Tool-Oberfläche mit `apply`-Konsolidierung.** Exponiert werden genau die 15 gelisteten Tools. Die bisherigen `apply-plan`, `apply-review`, `apply-issues` sind **keine** Top-Level-Tools mehr; ihre Logik bleibt erhalten und wird als **intern, lazy geladene** Instruktionsdateien von `apply` genutzt (Quellenerkennung Plan/Review/Issue/Epic → passende interne Anweisung). So sinkt die Oberfläche ohne Funktionsverlust. `plan-issues` wird als `/firmo plan-issue` exponiert (Namensschreibweise laut User).
- **`build.mjs` erzeugt weiterhin dual, aber ein Skill je Harness.** Claude-Ausgabe: **kein** `marketplace.json`/`plugins/`-Layout mehr, sondern ein `firmo/`-Skill (Router + `tools/` + `agents/`). Codex-Ausgabe: ebenfalls ein `firmo/`-Skill mit genesteten `agents/` statt separater `~/.codex/agents/*.toml`. Eine gemeinsame universelle Ausgabe (`dist/…/firmo/`) dient als Quelle für `npx skills`/`dalo`.
- **Platzhalter-Semantik bleibt, Zielwerte ändern sich.** `{{SKILL:sf-X}}` → `/firmo X` (Claude) bzw. `$firmo X`/Codex-Analog; `{{AGENT:sf-X}}` → interne Subagent-Referenz `X`; `{{VERSION}}` unverändert. Neu: eine Markierung „internes Tool" (für `apply-*`), damit diese nicht in den Router-Katalog wandern, aber als lazy ladbare Datei gebaut werden.
- **`.sf-plugin/` → `.firmo/` mit Migration.** Alle Quell-/Doku-Referenzen umstellen; `setup` und die config-lesenden Tools migrieren ein vorhandenes `.sf-plugin/` einmalig nicht-destruktiv nach `.firmo/` und lesen das alte Verzeichnis als Fallback, solange `.firmo/` fehlt. `.gitignore`-Block entsprechend (`.firmo/*` plus `!.firmo/config.json`).
- **Deploy-/Link-Skripte statt Plugin.** `local-update.sh`/`local-link.sh` installieren/linken das `firmo`-Skill nach `~/.claude/skills/firmo` und `~/.agents/skills/firmo`; die Plugin-/Marketplace-Pfade und `claude-link-plugin.sh` entfallen. Cleanup entfernt alte `sf-*`-Skills und den alten Marketplace `sf-claude-plugin`.

## Betroffene Dateien

| Datei                                             | Beschreibung                                                                                                                                                                                                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build.mjs`                                       | Kernumbau: universelles Ein-Skill-Layout (Router + `tools/` + `agents/`) für Claude **und** Codex; Marketplace/Plugin-Ausgabe entfernen; Platzhalter-Transforms auf `/firmo <tool>` und Subagent-Referenzen; „internes Tool"-Markierung; Codex-Agents nesten statt TOML |
| `skills/_router/SKILL.md` (neu)                   | Router-Template: Tool-Katalog (15) + Dispatch-/Lazy-Load-Regel; Quelle für die generierte `firmo/SKILL.md`                                                                                                                                                              |
| `skills/sf-*/SKILL.md` (27)                       | `sf-`-Präfix entfernen; Frontmatter-`type` beibehalten; interne Referenzen bleiben Platzhalter; `apply-plan`/`apply-review`/`apply-issues` als „intern" markieren; `plan-issues` → `plan-issue`                                                                         |
| `skills/_shared/*.md`                             | `.sf-plugin/` → `.firmo/`; Aufruf-Referenzen (`$sf-*`, `/…`) über Platzhalter/Text konsistent auf Firmo                                                                                                                                                                 |
| `package.json`                                    | `name` `sf-claude-plugin` → `firmo`; `description`; Scripts prüfen                                                                                                                                                                                                      |
| `README.md`                                       | Neufassung: Firmo, `/firmo <tool>`, Lazy-Loading, Auslieferung via `npx skills`/`dalo`, kein Plugin; Struktur-, Deployment- und Konfig-Abschnitte anpassen                                                                                                              |
| `local-update.sh`, `local-link.sh`                | Ziel `~/.claude/skills/firmo` + `~/.agents/skills/firmo`; Marketplace-Pfad entfernen; Cleanup alter `sf-*` + `sf-claude-plugin`                                                                                                                                         |
| `claude-link-plugin.sh`                           | entfernen (Plugin-Marketplace entfällt)                                                                                                                                                                                                                                 |
| `.gitignore` (Repo)                               | falls `.sf-plugin/` referenziert → `.firmo/`                                                                                                                                                                                                                            |
| `docs/naming.md`, `docs/skill-migration-notes.md` | Referenzen/Beispiele auf Firmo/`/firmo` aktualisieren                                                                                                                                                                                                                   |
| `version.txt`, `.oxfmtrc.json`                    | voraussichtlich unverändert (nur prüfen)                                                                                                                                                                                                                                |

Hinweis: Laufzeitartefakte unter `.sf-plugin/` im Repo selbst sind gitignored und kein Quellcode; sie werden nicht Teil der Umsetzung, nur die Referenzen in Quelle/Doku.

## Implementierungsdetails

### Vorgehen

1. **Namensabbildung festlegen.** `sf-<x>` → Tool/Agent `<x>` ohne Präfix; `plan-issues` → `plan-issue`; interne (`apply-plan`, `apply-review`, `apply-issues`) als nicht-exponiert kennzeichnen.
2. **Router-Template** `skills/_router/SKILL.md` anlegen: Frontmatter (`name: firmo`, Beschreibung) + Tool-Katalog + Dispatch-Regel „lies `tools/<tool>.md` und befolge es; sonst Liste anzeigen".
3. **`build.mjs` umbauen** (siehe unten): universelles `firmo/`-Layout je Harness erzeugen, Marketplace/Plugin-Zweig entfernen, Transforms anpassen, Codex-Agents nesten.
4. **Quelle umbenennen/markieren:** `sf-`-Präfixe aus Verzeichnis-/Dateinamen und aus dem Build-Scan entfernen; `type`-Frontmatter beibehalten; interne Tools kennzeichnen.
5. **`.sf-plugin/` → `.firmo/`** in `_shared` und allen Tool-Quellen ersetzen; Migrations-/Fallback-Logik in `setup` und den config-lesenden Tools ergänzen; `.gitignore`-Block umstellen.
6. **Deploy/Link-Skripte** auf Skill-Ziele umstellen; `claude-link-plugin.sh` entfernen; Cleanup ergänzen.
7. **Doku** (README + docs) neu fassen.
8. **Validierung** gemäß Validierungsplan.

### Router-/Lazy-Load-Mechanik

- `firmo/SKILL.md` (generiert) enthält den Katalog der 15 Tools und die Regel: bei `/firmo <tool> <args>` genau `tools/<tool>.md` lesen und wörtlich befolgen, Argumente durchreichen, keine weiteren Tool-Dateien laden; bei fehlendem/unbekanntem `<tool>` die Liste ausgeben.
- Jede Tool-Anweisung liegt vollständig in `firmo/tools/<tool>.md` (Body des bisherigen Orchestrators/Utility). Interne Anweisungen (`apply-plan`/`apply-review`/`apply-issues`) liegen z. B. unter `firmo/tools/_apply/<source>.md` und werden nur von `apply` referenziert.
- Subagents unter `firmo/agents/<agent>.md` werden von den Tools bei Bedarf aufgerufen.

### `build.mjs` – zentrale Änderungen (natürlichsprachlich)

- Scan `skills/` künftig ohne `sf-`-Filter; Kategorisierung über Frontmatter `type` (`orchestrator`/`utility` → Tool, `agent` → Subagent) plus „intern"-Flag.
- Claude-Zweig: statt `commands/*.md` + `agents/*.md` + `marketplace.json` ein Verzeichnis `firmo/` mit generierter `SKILL.md` (aus Router-Template + Katalog), `tools/<tool>.md`, `agents/<agent>.md`.
- Codex-Zweig: analog ein `firmo/`-Skill mit `tools/` und genesteten `agents/`; separate Agent-TOMLs entfallen.
- Transforms: `{{SKILL:sf-X}}` → `/firmo X` (Claude) bzw. Codex-Analog; `{{AGENT:sf-X}}` → Subagent-Referenz `X`; `include`/`ask`/`{{VERSION}}` unverändert.
- Ausgabeziel so wählen, dass ein Standard-Directory-Skill entsteht, das `npx skills` und `dalo` direkt konsumieren können.

### Konfig-Migration `.sf-plugin/` → `.firmo/`

- `setup` legt/aktualisiert `.firmo/config.json` und trägt `.firmo/*` (+ `!.firmo/config.json`) in `.gitignore` ein.
- config-lesende Tools (`plan`, `review`, `apply`, `maintain`, …): wenn `.firmo/` fehlt, aber `.sf-plugin/` existiert → einmalige nicht-destruktive Migration nach `.firmo/`; bis dahin altes Verzeichnis lesend als Fallback nutzen. Keine stille Löschung von `.sf-plugin/`.

### Auslieferung

- Primär: `npx skills` installiert das `firmo`-Skill in die Harness-Skill-Ordner. Deploy-Skripte im Repo bilden das lokal ab (Copy/Symlink nach `~/.claude/skills/firmo`, `~/.agents/skills/firmo`).
- Zukunft/optional: `dalo` nimmt das Repo als Git-Source und linkt `firmo` in die Zielordner (Codex `~/.agents/skills`, Claude `~/.claude/skills`) – passt, weil Firmo ein Standard-Directory-Skill ist; kein Sonderformat nötig.
- Cleanup: alte `sf-*`-Skills, `~/.codex/agents/sf-*.toml` und der Marketplace `sf-claude-plugin` werden bei Install/Update entfernt.

### Edge Cases

- **`/firmo` ohne Tool** → Tool-Liste, kein Fehler.
- **Unbekanntes Tool** (`/firmo foo`) → Hinweis + Liste, keine Ausführung.
- **Argumente mit Leerzeichen/Pfaden** (`/firmo build docs/plan/0058-…md`) → unverändert an das Tool durchreichen.
- **Codex-Aufrufsyntax** weicht ab (`$firmo`/Skill-Discovery) → Router-Text harness-neutral formulieren.
- **Bestehende `.sf-plugin/`-Projekte** → Migration greift genau einmal; parallele Läufe dürfen sie nicht doppelt ausführen.
- **Interne `apply`-Quellen** → `apply` lädt nur die zur erkannten Quelle passende interne Datei (kein Vorabladen aller).
- **Kollision mit real vorhandenem `firmo`-Skill** im Zielordner → Install/dalo überschreibt nicht ungefragt (dalo blockt `blocked_by_same_name_skill`); Deploy-Skripte entfernen nur eigene Altstände.
- **Bestehender externer `~/.claude/skills`-Symlink** → nicht durch ein reales Verzeichnis ersetzen; sonst brechen fremde Skills (Lehre aus #295/#308).
- **Fremdes Projekt ohne Firmo-Nutzung** → kein `.firmo/` anlegen; Router/Tools bleiben footprint-frei bis zum ersten bewussten Lauf (Lehre aus #344).

## Akzeptanzkriterien

- [ ] `node build.mjs` erzeugt je Harness **ein** Skill-Verzeichnis `firmo/` mit `SKILL.md` (Router), `tools/<tool>.md` für die 15 exponierten Tools und `agents/<agent>.md` für die 12 Agents; **keine** `marketplace.json`, kein `plugins/`- und kein separates Codex-Agent-TOML-Layout.
- [ ] Die Router-`SKILL.md` enthält ausschließlich Tool-Katalog + Dispatch-Regel; kein Tool-Body ist inline enthalten (Tool-Inhalte liegen nur in `tools/<tool>.md`).
- [ ] `/firmo` (ohne Argument) listet genau die 15 Tools; `/firmo <tool>` bewirkt das Laden und Befolgen von `tools/<tool>.md`; unbekanntes Tool zeigt die Liste.
- [ ] In der gebauten Ausgabe und in allen nutzer-sichtbaren Referenzen existiert **kein** `sf-`-Präfix mehr; Quell-Platzhalter `{{SKILL:…}}`/`{{AGENT:…}}` transformieren zu `/firmo <tool>` bzw. Subagent-Referenzen.
- [ ] Die 15 Tools entsprechen exakt der Vorgabe; `apply-plan`/`apply-review`/`apply-issues` sind nicht als Top-Level-Tools sichtbar, ihre Funktion ist über `apply` (Quellenerkennung + intern lazy geladene Anweisung) weiterhin erreichbar; `plan-issue` ist vorhanden.
- [ ] `.sf-plugin/` ist in Quelle und Doku durch `.firmo/` ersetzt; `setup` schreibt `.firmo/`-`.gitignore`-Muster; config-lesende Tools migrieren ein vorhandenes `.sf-plugin/` einmalig nicht-destruktiv und lesen es bis dahin als Fallback.
- [ ] Das gebaute `firmo`-Skill ist als Standard-Directory-Skill via `npx skills` installierbar und als `dalo`-Source linkbar (Ziele Claude `~/.claude/skills/firmo`, Codex `~/.agents/skills/firmo`); `local-update.sh`/`local-link.sh` deployen dorthin; `claude-link-plugin.sh` ist entfernt.
- [ ] `README.md` beschreibt Firmo, `/firmo <tool>`, Lazy-Loading und die Skill-Auslieferung (npx skills/dalo); keine Plugin-/Marketplace-Anleitung mehr.
- [ ] Das ausgelieferte `firmo`-Skill enthält nur laufzeitnötige Dateien (SKILL.md, `tools/`, `agents/`, minimale `scripts/`); **keine** `node_modules`, `dist/`, Build- oder Doku-Artefakte (Lehre aus impeccable #107).
- [ ] Firmo legt `.firmo/` **nicht** ungefragt in Projekten ohne Firmo-Nutzung an; Laufzeitartefakte werden am nächsten Projekt-Root aufgelöst (Lehre aus #344/#305).
- [ ] Install/Link überschreibt **keinen** bestehenden externen `~/.claude/skills`-Symlink und keine fremden Skills; für `npx skills` wird die Copy-Variante (`--copy`) unterstützt/empfohlen (Lehre aus #295/#308/#148).
- [ ] Der Build stellt sicher, dass Claude- und Codex-Ausgabe **dieselbe** Version tragen (Guard gegen Version-Drift, Lehre aus #274/#278).
- [ ] Generiertes Frontmatter ist strikt valide (Descriptions mit Doppelpunkt quotiert, exakte Schlüssel); ein Build-Check verhindert lautloses Nicht-Laden, insbesondere auf Codex (Lehre aus #67/#102/#49).

## Validierungsplan

- `node build.mjs` läuft fehlerfrei; Ausgabe-Layout (Router, `tools/`, `agents/`, kein Marketplace) manuell inspizieren.
- Smoke-Test: gebautes `firmo`-Skill nach `.claude/skills/firmo` (bzw. `~/.agents/skills/firmo`) kopieren/linken; `/firmo` zeigt Liste, `/firmo plan` lädt `tools/plan.md`, `/firmo apply <plan>` erkennt Quelle und lädt die interne Anweisung.
- Grep-Gegenprüfung: `sf-` und `.sf-plugin` erscheinen weder in `dist/` noch in nutzer-sichtbaren Quelltexten (Ausnahme: bewusste Migrations-/Cleanup-Logik).
- Referenz-Konsistenz: alle `{{SKILL:…}}`/`{{AGENT:…}}` lösen korrekt auf; keine toten `/sf-*`- oder `$sf-*`-Verweise.
- `npx oxfmt --check` (bzw. Projekt-Formatter) auf geänderte Markdown-/JS-Dateien.
- Migrations-Test: Projekt mit vorhandenem `.sf-plugin/` → nach erstem config-lesenden Toollauf existiert `.firmo/`, Daten erhalten, `.sf-plugin/` nicht still gelöscht.

## Learnings (aus pbakaus/impeccable)

Auswertung **aller 137 gemergten PRs und 90 geschlossenen Issues** von [pbakaus/impeccable](https://github.com/pbakaus/impeccable). Impeccable verfolgt einen anderen Zweck (Frontend-Design-Guidance mit Detektor, Browser-Live-Mode, Extension), ist in **Verpackung, Router-Modell und Multi-Harness-Auslieferung** aber ein direktes Vorbild. Festgehalten sind nur die übertragbaren Lehren; rein impeccable-spezifische Themen sind am Ende abgegrenzt.

1. **Ein-Skill-Router bewährt sich.** Impeccable hat 18 Standalone-Skills zu einem `/impeccable` mit Sub-Commands konsolidiert (PR #109) – bestätigt Firmos `/firmo <tool>`. Achtung: Standalone-Shortcut-Aliase kollidieren mit Harness-Defaults (`/quieter` kaperte Claude Codes `/q`, Issue #70). → Firmo bleibt strikt bei `/firmo <tool>`; optionale „Pins" nur mit Alias-Kollisionsprüfung.
2. **Skills laden nur bei exaktem Frontmatter.** Falsche/unquotierte Werte verhindern das Laden **lautlos**: `user-invokable`→`user-invocable` ließ Skills gar nicht im `/`-Menü erscheinen (#49/#57); ein unquotierter Doppelpunkt in `description` brach Codex-Load und GitHub-Preview (#67/#102/#108). → Firmo-Build muss Descriptions strikt quoten (macht `build.mjs` bereits) und Frontmatter als Build-Check validieren.
3. **Codex: Agents nesten, keinen TOML-Sidecar.** Impeccable hat den separaten `.codex/agents/*.toml`-Sidecar entfernt und nutzt nur noch im Skill genestete `agents/` (Codex auto-discovered) – PR #173, ausgelöst durch #180/#161. → Bestätigt Firmos Nesting-Entscheidung direkt.
4. **Codex-Manifeste sind schema-strikt.** Codex lehnte das Hook-Manifest ab, weil `hooks.json` ein top-level `description` enthielt (#330/#333); `npx skills add` konnte teils nicht nach Codex installieren (#75). → Firmo liefert **keinen** Hook aus (Vorteil) und muss Codex-Discovery aktiv testen; keine harness-fremden Felder in generierten Dateien.
5. **Kein ungefragter Footprint – Opt-in + Projekt-Root.** Impeccables Auto-Hook legte `.impeccable/` in **jedem** Projekt an (auch ungenutzten), nicht wegräumbar (#344→#346), und keyte Artefakte fälschlich ans Start-CWD statt an den Projekt-Root (#305). → Firmo legt `.firmo/` **nur bei tatsächlicher Nutzung** an, nie ungefragt in fremden Repos, und löst den Projekt-Root (`.git`/`package.json`/`.firmo`) für Monorepos auf. Firmo hat bewusst **keinen** Auto-Hook → das Problem entfällt weitgehend.
6. **Config: shared vs. per-dev trennen, Consent statt Automatik.** Impeccable vereinheitlichte auf `.impeccable/config.json` (getrackt) + `.impeccable/config.local.json` (per-dev, gitignored) und machte Automatik zur bewussten Wahl (#245); Transparenz „was läuft beim Klonen" war ein Thema (#215/#216). → Firmos `.firmo/`: `config.json` getrackt, `memory.json`/`cache.json`/`review/`/`.worktrees` ephemeral & gitignored (bereits so); markierter gitignore-Block via `setup`; keine stille Automatik.
7. **`npx skills`-Install hat Symlink-Fallstricke.** Der Default-Symlink `.claude/skills/x`→`.agents/skills/x` wird still übersprungen (kein `.claude/`, Windows-Rechte) → Skript-Pfade brechen; Fix war `--copy` durchreichen (#148/#140). Und: der Installer darf einen **bestehenden externen** `~/.claude/skills`-Symlink nicht durch ein reales Verzeichnis ersetzen, sonst brechen alle anderen Skills (#295→#308). → Firmo-Doku/-Skripte bieten die Copy-Variante an und überschreiben vorhandene Symlinks/fremde Skills nie (dalo respektiert das ohnehin).
8. **Schlank ausliefern.** Der Claude-Plugin-Cache war 291 MB, 99,9 % ungenutzt (node_modules, `public/`, vor-transformierte Harness-Kopien) – #107. → Firmo liefert nur das schlanke Skill (SKILL.md + `tools/` + `agents/` + minimale `scripts/`); keine `node_modules`, kein Build, keine Doku/`dist`. Das Skill-statt-Plugin-Modell ist hier klar im Vorteil.
9. **Installer laut fehlschlagen lassen.** Stille Fehlschläge bei Node-Versionen/Extraktion/Windows (#250/#253/#246/#244/#198/#21/#284/#43) und ein CLI, das unbekannte Subcommands als „detect-Target" schluckte (exit 0) (#266/#267→#270). → Firmo-Router und -Skripte: unbekanntes `<tool>`/Kommando → klare Meldung, nie stilles Fehlrouten; robuste, plattformneutrale Installation. Firmo ist reines Markdown + kleine `.mjs` → von Haus aus weniger fragil.
10. **Version-Drift zwischen Ausgaben verhindern.** Der Plugin-Kanal hinkte Skill-Releases hinterher (#274); der Build guardt seither Drift (#278). → Firmo-Build: `{{VERSION}}` konsistent in Claude- und Codex-Ausgabe; Build-Guard gegen divergierende Versionen.
11. **Monorepo/Projekt-Scope früh mitdenken.** Wiederkehrend: projekt-scoped Kontext, Ziel-Auswahl, Kontext außerhalb des Repo-Roots (#213/#282/#202/#123/#119). → Firmos `.firmo/`-Auflösung + gitignore müssen nested Workspaces (`apps/web/.firmo/`) und unanchored Patterns beherrschen.
12. **Struktur/Build/Prose als Disziplin.** Factory-Build, geteilte Protokolle, native Subagent-Pipeline, Prose-Linting (STYLE.md/validateProse), diszipliniertes Entfernen veralteter Migration (#138/#71/#37/#152/#134/#240/#126). → Firmo hat `build.mjs` + `_shared` + Agents; Learning: geteilte Bausteine erhalten, Migrationscode später entfernen, Pfade projekt-CWD-relativ auflösen, optional Prose-Check.

**Bewusst nicht übernommen (impeccable-spezifisch, anderer Zweck):** Browser-Live-Mode, Anti-Pattern-Detektor (+45 Regeln), Chrome/Firefox-Extension, `DESIGN.md`/`PRODUCT.md`-Designkontext, AI-slop-Regeln, automatischer Design-Hook. Diese verursachten einen Großteil von impeccables Issues (Live-Mode-Races, Detector-Crashes, Extension-Bugs, Hook-Footprint) und sind für Firmos Zweck (Dev-Lifecycle-Workflows) irrelevant. Firmo bleibt bewusst schlank: kein Auto-Hook, kein Browser-Modus, kein Detektor.

## Annahmen und offene Punkte

- **`apply`-Konsolidierung (Interpretation von „reduzieren"):** Angenommen wird, dass `apply-plan`/`apply-review`/`apply-issues` als **interne, lazy geladene** Anweisungen erhalten bleiben und nur aus der Top-Level-Oberfläche verschwinden (kein Funktionsverlust). Falls stattdessen vollständiges Zusammenführen in eine einzige `apply`-Datei **oder** ersatzloses Entfernen gewünscht ist, bitte kurz bestätigen – das ändert Umfang und Betroffene Dateien.
- **`plan-issue` vs. `plan-issues`:** Tool wird laut User-Schreibweise als `plan-issue` exponiert (bisher `plan-issues`). Falls `plan-issues` beibehalten werden soll, ist das eine reine Namensanpassung.
- **Codex-Agent-Mechanik:** Durch impeccable **bestätigt** (PR #173 „Drop the .codex/agents sidecar; rely on nested skill agents"): Agents werden unter dem `firmo`-Skill genestet (Codex auto-discovered), separate `~/.codex/agents/*.toml` entfallen. Die ursprünglich offene Frage ist damit zugunsten Nesting entschieden; nur falls ausdrücklich TOML-Custom-Agents gewünscht sind, würde der Codex-Zweig hybrid.
- **Staffelung:** Der Plan ist als ein Feature formuliert, lässt sich aber in Teilpläne schneiden (1: Umbenennung + Config-Migration; 2: Router + Lazy-Loading + `build.mjs`; 3: Auslieferung npx skills/dalo + Skripte; 4: Doku). Bei Wunsch als separate Pläne umsetzbar.
- **`dalo`-Eignung** ist „zukünftig, falls passend": Die Struktur ist dalo-kompatibel; eine aktive dalo-Integration/-Release ist **nicht** Teil dieses Plans, nur die Kompatibilität.
- Der exakte Wortlaut der Router-Dispatch-Regel und der Subagent-Aufrufsyntax je Harness wird bei der Umsetzung finalisiert; hier bewusst nur als Schnittstellenskizze beschrieben.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       1 |       1 |
| Security    |        0 |       0 |       1 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       1 |       0 |
| Testbarkeit |        0 |       0 |       1 |
| Scope       |        0 |       1 |       0 |
| Wartbarkeit |        0 |       0 |       1 |

### Befunde

- **Architektur (Wichtig):** Der `apply`-Router muss die internen Quell-Anweisungen strikt lazy laden (nur die erkannte Quelle), sonst kehrt die Token-Last durch die Hintertür zurück. Als Akzeptanzkriterium und Edge Case verankert.
- **Fehlerfälle (Wichtig):** Config-Migration `.sf-plugin/` → `.firmo/` muss idempotent und parallel-sicher sein (keine Doppelmigration, keine stille Löschung). Als Kriterium und Migrations-Test verankert.
- **Scope (Wichtig):** „Reduzieren" ist mehrdeutig (Oberfläche kürzen vs. Skills löschen/mergen). Bewusst als konservative Interpretation gewählt und in „Annahmen" zur Bestätigung offengelegt, um Over-Engineering/versehentlichen Funktionsverlust zu vermeiden.
- **Architektur (Hinweis):** Dual-Harness-Router muss aufrufsyntax-neutral formuliert sein (`/firmo` vs. `$firmo`/Codex-Discovery).
- **Security/Wartbarkeit/Testbarkeit (Hinweis):** Install/Link darf fremde, gleichnamige `firmo`-Skills nicht überschreiben (dalo-Blockverhalten nutzen); Grep-Gegenproben und Smoke-Test sichern Konsistenz.
- **Hinweis (Learnings):** Auswertung von 137 gemergten PRs und 90 geschlossenen Issues aus impeccable ergänzt (Abschnitt „Learnings"). Zentrale übertragbare Lehren – schlanke Auslieferung (#107), Opt-in-Footprint/Projekt-Root (#344/#305), `npx skills`-Symlink-Fallstricke (#148/#295/#308), Codex-Agent-Nesting (#173), strikte Frontmatter-Validität (#67/#102), Version-Drift-Guard (#274/#278) – sind als Akzeptanzkriterien und Edge Cases verankert.
