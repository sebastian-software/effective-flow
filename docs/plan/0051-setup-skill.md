# 0051: Setup-Skill für .gitignore und Plugin-Konfiguration

**Planungsstatus:** Umgesetzt
**Quelle:** /plan
**Empfohlener Workflow:** Feature (`/build`)

## Anforderung

Es soll ein neuer Setup-Skill `sf-setup` entstehen, der ein Zielprojekt für die Nutzung des Plugins vorbereitet:

- Er trägt den Laufzeit-Status unter `.sf-plugin/` idempotent in die `.gitignore` des Zielprojekts ein und hält dabei `.sf-plugin/config.json` getrackt (Pattern `.sf-plugin/*` plus `!.sf-plugin/config.json`); er legt die `.gitignore` an, falls sie fehlt, und migriert eine bestehende pauschale `.sf-plugin/`-Zeile auf dieses Pattern.
- Er legt `.sf-plugin/config.json` an bzw. aktualisiert sie und fragt dabei die gewünschten Werte sowie das grundsätzlich gewünschte Verhalten beim User ab.
- Die Abfrage erfolgt hybrid: zuerst eine Preset-Auswahl („Sichere Defaults", „Schneller persönlicher Workflow", „Alles einzeln anpassen"); die zentralen Verhaltensschalter werden in jedem Modus explizit abgefragt; nur bei „Alles einzeln anpassen" geht der Skill Block für Block in die Tiefe.
- Eine bereits vorhandene `config.json` wird nicht-destruktiv aktualisiert (vorhandene Werte als Default vorbelegt, nur Geändertes/Fehlendes geschrieben); ein vollständiges Überschreiben erfolgt nur nach ausdrücklicher Bestätigung.

**Begründung der Workflow-Empfehlung:** Es entsteht neue Funktionalität (ein neuer interaktiver Skill plus Anpassungen an Build-Metadaten und README). Das ist eine Feature-Erweiterung des Plugins, daher `/build`.

## Architekturentscheidungen

- **Neuer Utility-Skill `sf-setup`:** Setup ist ein eigenständiges, vom User direkt aufrufbares Werkzeug (`/setup` in Claude Code, `$sf-setup` in Codex), kein Orchestrator über andere Skills. Typ `utility`, analog zu `sf-commit`.
- **Idempotenz für die `.gitignore`:** Der Eintrag wird nur ergänzt bzw. migriert, wenn der Soll-Zustand noch nicht hergestellt ist (Laufzeit-Status ignoriert, `config.json` getrackt). So ist wiederholtes Ausführen unschädlich.
- **`config.json` bleibt getrackt:** `config.json` ist die geteilte Projekt-Konfiguration und gehört in die Versionskontrolle, während der übrige `.sf-plugin/`-Inhalt lokaler Laufzeit-Status ist. Wegen der Git-Eigenheit, dass eine Negation eine Datei aus einem vollständig ignorierten Verzeichnis nicht wieder einschließen kann, ignoriert der Skill mit `.sf-plugin/*` (Inhalte, nicht das Verzeichnis) und nimmt `config.json` per `!.sf-plugin/config.json` aus.
- **Nicht-destruktive Config-Pflege:** Der Skill folgt demselben Prinzip wie die bestehende Config-Migration in `sf-review`, `sf-apply-review` und `sf-plan`: vorhandene gültige Werte und unbekannte Schlüssel bleiben erhalten; die Datei wird vor dem Schreiben frisch eingelesen. `sf-setup` ist die proaktive Erstkonfiguration, die spätere Laufzeit-Migrationen zu No-Ops macht.
- **Single Source of Truth für das Schema:** Der Skill kennt die vier Config-Blöcke (`review`, `applyReview`, `plan`, `worktree`) mit ihren gültigen Werten und Defaults. Diese sind bereits in den jeweiligen Skills und im README dokumentiert; `sf-setup` dupliziert die Schema-Erklärung knapp, verweist aber auf die Skills als maßgebliche Quelle.
- **Hybride Abfrage statt 15 Einzelfragen:** Presets reduzieren die Interaktionslast; die zentralen Verhaltensschalter (`worktree.enabled`, `worktree.completion`, `worktree.baseBranch`, `plan.markerLanguage`) werden immer explizit erfragt, weil sie das Kernverhalten bestimmen.
- **Build-System unverändert nutzbar:** `build.mjs` entdeckt `skills/sf-setup/` automatisch und transformiert die `ask`-Blöcke. Nur die hardcodierte Marketplace-Beschreibung/Tags werden um `setup` ergänzt.

## Betroffene Dateien

| Datei                      | Beschreibung                                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/sf-setup/SKILL.md` | **Neu.** Utility-Skill: `.gitignore`-Eintrag idempotent setzen, `config.json` interaktiv anlegen/aktualisieren (Presets + Detailmodus), nicht-destruktive Merge-Logik, Zusammenfassung. |
| `build.mjs`                | Marketplace-Beschreibung und Tags um den neuen Skill `setup` (bzw. Stichwort `configuration`) ergänzen.                                                                                 |
| `README.md`                | `sf-setup` in der Skill-Tabelle ergänzen; im Abschnitt „Plugin-Konfiguration" auf `sf-setup` als empfohlenen Weg zum Anlegen der `config.json` hinweisen.                               |

## Implementierungsdetails

### Vorgehen

1. Neuen Skill `skills/sf-setup/SKILL.md` schreiben (Frontmatter `type: utility`, Includes `language-rules`, `task-tracking`).
2. `build.mjs`-Marketplace-Metadaten um `setup` ergänzen.
3. README um `sf-setup` ergänzen (Skill-Tabelle und Hinweis im Konfigurationsabschnitt).
4. Build ausführen und prüfen, dass Codex- und Claude-Artefakte für `sf-setup` korrekt erzeugt werden (`ask`-Blöcke transformiert, keine unaufgelösten Includes).

### Ablauf des Skills

1. **Projektkonventionen:** Falls `AGENTS.md` existiert, vor dem Schreiben lesen und beachten.
2. **`.gitignore`-Eintrag:**
   - Soll-Zustand prüfen: Laufzeit-Status ignoriert, `config.json` getrackt (bei verfügbarem Git über `git check-ignore -q .sf-plugin/config.json` → Exit 1 und `git check-ignore -q .sf-plugin/memory.json` → Exit 0, sonst über einen Zeilenabgleich auf `.sf-plugin/*` plus folgende Negation `!.sf-plugin/config.json`).
   - Falls noch nicht hergestellt: eine bestehende pauschale Ignore-Zeile (`.sf-plugin/`, `.sf-plugin`, `/.sf-plugin/`) auf `.sf-plugin/*` plus `!.sf-plugin/config.json` migrieren; fehlt jeder Eintrag, die beiden Zeilen anhängen (mit korrektem Zeilenumbruch); fehlt die Datei, sie anlegen; ist `.sf-plugin/*` vorhanden, aber die Negation fehlt, nur die Negationszeile ergänzen.
   - Falls der Soll-Zustand bereits hergestellt ist: nichts ändern und das knapp melden.
3. **Bestehende Config prüfen:** `.sf-plugin/config.json` lesen, falls vorhanden. Bei gültigem JSON die vorhandenen Werte als Default-Vorbelegung der folgenden Fragen verwenden. Bei ungültigem JSON nicht still überschreiben, sondern den User informieren und fragen, ob neu angelegt (Backup/Überschreiben) oder abgebrochen werden soll.
4. **Preset-Auswahl** (siehe `ask` unten). „Sichere Defaults" und „Schneller persönlicher Workflow" entsprechen den beiden im README dokumentierten Beispiel-Konfigurationen; „Alles einzeln anpassen" startet den Detailmodus.
5. **Zentrale Verhaltensschalter immer abfragen** (auch in beiden Preset-Modi): `worktree.enabled`, und – falls aktiviert – `worktree.completion` und `worktree.baseBranch`; außerdem `plan.markerLanguage`.
6. **Detailmodus** (nur bei „Alles einzeln anpassen"): Block für Block alle Schlüssel abfragen, jeweils mit gültigen Werten und Default-Vorbelegung:
   - `review`: `profile` (full/focused/fast), `autoConfirmScope` (bool), `designDecisionSources` (full/standard/minimal), `validation` (full/quick/off)
   - `applyReview`: `defaultCommitStrategy` (worktrees/single/none/„fragen"), `finalValidation` (full/changedScope/off), `worktree.baseDir`, `worktree.setup` (auto/none/Befehl)
   - `plan`: `markerLanguage` (de/en)
   - `worktree`: `enabled` (bool), `baseBranch`, `branchPrefix`, `completion` (pr/merge/branch/„fragen"), `setup` (auto/none/Befehl), `baseDir`
7. **Merge und Schreiben:**
   - Nicht-destruktiv mit dem vorhandenen Inhalt mergen: bekannte Schlüssel mit den gewählten Werten setzen, unbekannte Schlüssel unverändert lassen.
   - Vollständiges Überschreiben (vorhandene Werte verwerfen) nur nach ausdrücklicher Bestätigung.
   - `.sf-plugin/`-Verzeichnis anlegen, falls nötig, und `config.json` als formatiertes JSON schreiben.
8. **Zusammenfassung:** melden, ob die `.gitignore` ergänzt wurde, welcher Preset/Detailmodus gewählt wurde, welche zentralen Verhaltenswerte gesetzt sind und wo die Config liegt.

### Abfragen (ask-Blöcke)

Die genaue Formulierung entsteht bei der Umsetzung. Mindestens nötig:

- Preset-Auswahl: „Sichere Defaults" / „Schneller persönlicher Workflow" / „Alles einzeln anpassen".
- `worktree.enabled`: Worktree-Integration aktivieren ja/nein.
- bei aktivierter Worktree-Integration: `worktree.completion` (Pull-Request / Merge / Nur Branch / beim Lauf fragen) und `worktree.baseBranch` (Default `origin/main`).
- `plan.markerLanguage`: Deutsch / Englisch.
- bei vorhandener Config und Wunsch nach Vollüberschreibung: Bestätigungsfrage.

### Edge Cases

- **Kein Git-Repository:** Eine `.gitignore` ohne Git ist wirkungslos. Den User darauf hinweisen und fragen, ob die `.gitignore` trotzdem geschrieben werden soll; die Config-Erstellung läuft unabhängig davon weiter.
- **Soll-Zustand bereits hergestellt:** keinen Doppeleintrag erzeugen.
- **Bestehende pauschale `.sf-plugin/`-Zeile:** auf `.sf-plugin/*` plus `!.sf-plugin/config.json` migrieren, damit `config.json` getrackt wird, statt zusätzlich anzuhängen.
- **`.gitignore` ohne abschließenden Zeilenumbruch:** vor dem Anhängen einen Zeilenumbruch sicherstellen.
- **Ungültiges JSON in bestehender Config:** nicht still überschreiben; informieren und Entscheidung einholen.
- **Teilweise vorhandene Config:** fehlende Blöcke/Schlüssel ergänzen, vorhandene gültige Werte und unbekannte Schlüssel erhalten.
- **Abbruch während der Fragen:** keine halb geschriebene Config hinterlassen; nur am Ende einmal schreiben.
- **Ungültige Freitext-Eingabe für einen Wert:** erneut fragen oder den Default verwenden und das melden.

## Akzeptanzkriterien

- [ ] `skills/sf-setup/SKILL.md` existiert mit `type: utility` und wird vom Build als Codex-Skill und Claude-Command (`/setup`) erzeugt.
- [ ] Der Skill stellt in der `.gitignore` den Soll-Zustand her (`.sf-plugin/*` plus `!.sf-plugin/config.json`), sodass der Laufzeit-Status ignoriert wird, `.sf-plugin/config.json` aber getrackt bleibt; er migriert eine bestehende pauschale `.sf-plugin/`-Zeile auf dieses Pattern, ändert nichts, wenn der Soll-Zustand bereits hergestellt ist, und legt die `.gitignore` an, falls sie fehlt.
- [ ] Der Skill bietet die Preset-Auswahl an und fragt die zentralen Verhaltensschalter (`worktree.enabled`, ggf. `worktree.completion`/`worktree.baseBranch`, `plan.markerLanguage`) in jedem Modus explizit ab.
- [ ] Im Detailmodus werden alle Schlüssel der vier Blöcke `review`, `applyReview`, `plan`, `worktree` mit gültigen Werten abgefragt.
- [ ] Eine bestehende `config.json` wird nicht-destruktiv aktualisiert (vorhandene gültige Werte und unbekannte Schlüssel bleiben erhalten); vollständiges Überschreiben passiert nur nach ausdrücklicher Bestätigung.
- [ ] Bei ungültigem JSON in der bestehenden Config wird nicht still überschrieben.
- [ ] Die geschriebene `config.json` ist syntaktisch valides, formatiertes JSON und enthält die gewählten Werte.
- [ ] `build.mjs` nennt `setup` in der Marketplace-Beschreibung; der Build läuft fehlerfrei.
- [ ] README listet `sf-setup` und verweist im Konfigurationsabschnitt auf den Skill.

## Validierungsplan

- `node build.mjs` ausführen und prüfen, dass `sf-setup` als Codex-Skill und Claude-Command erzeugt wird, die `ask`-Blöcke korrekt transformiert sind und keine unaufgelösten Include-Fences oder `{{…}}`-Platzhalter im `dist/` verbleiben.
- `pnpm agent:check` (oxfmt) grün über alle Dateien.
- Manuelle Durchsicht des generierten Skills: Ablaufreihenfolge (`.gitignore` → Config-Check → Preset → zentrale Fragen → ggf. Detailmodus → Merge/Schreiben → Zusammenfassung) und nicht-destruktive Merge-Beschreibung konsistent zum bestehenden Migrationsmuster. Prüfen, dass das `.gitignore`-Pattern `config.json` getrackt lässt: in einem Wegwerf-Repo `git check-ignore -q .sf-plugin/config.json` → Exit 1 und `git check-ignore -q .sf-plugin/memory.json` → Exit 0.
- Trockenlauf-Review des Config-Schemas gegen die maßgeblichen Skills (`sf-review`, `sf-apply-review`, `sf-plan`, Worktree-Include), damit gültige Werte und Defaults übereinstimmen.

## Annahmen und offene Punkte

- **Annahme:** Skill-Name `sf-setup` (Claude-Command `/setup`, Codex `$sf-setup`). Falls `/setup` kollidiert, bei der Umsetzung umbenennen.
- **Annahme:** Der Skill ist für Zielprojekte gedacht, die das Plugin nutzen; in diesem Plugin-Repo selbst ist `.sf-plugin/` pauschal ignoriert, dort würde der Skill auf das `config.json`-getrackt-Pattern migrieren.
- **Annahme:** Die `.gitignore`-Änderung betrifft ausschließlich den `.sf-plugin/`-Block (`.sf-plugin/*` plus `!.sf-plugin/config.json`); weitere Einträge (z. B. `dist/`) sind nicht Teil dieses Skills.
- **Annahme:** Die beiden Presets übernehmen die im README dokumentierten Beispiel-Konfigurationen und ergänzen den `worktree`-Block mit dessen Defaults (`enabled` wird explizit erfragt).
- **Offen (Umsetzung):** Ob `sf-setup` zusätzlich `applyReview.defaultCommitStrategy`/`worktree.completion` bewusst auf „beim Lauf fragen" (null) belassen kann, statt einen festen Wert zu erzwingen – Default-Empfehlung: „beim Lauf fragen" zulassen.

## Testergebnisse

**Datum:** 2026-06-29

Dieses Repo enthält kein Unit-Test-Framework; die Validierung erfolgt über Build und Formatter:

- `node build.mjs` erfolgreich: 15 Codex-Skills und 15 Claude-Commands (neu: `sf-setup` als Command `/setup`), 9 Agents. Die vier `ask`-Blöcke (Preset, `worktree.enabled`, `worktree.completion`, `plan.markerLanguage`) werden zu `AskUserQuestion` (Claude) bzw. Freitextfragen (Codex) transformiert; keine unaufgelösten `{{…}}`-Platzhalter oder Include-Fences im `dist/`.
- `pnpm agent:check` (oxfmt) grün über alle Dateien.

## Review-Findings

**Datum:** 2026-06-29
**Reviewer:** sf-nodejs-reviewer

### Zusammenfassung

| Status                  | Anzahl |
| ----------------------- | -----: |
| Behoben                 |      4 |
| Offen / Nicht umgesetzt |      0 |

Keine kritischen Findings. Das Config-Schema deckt sich mit den maßgeblichen Quellen (`sf-review`, `sf-apply-review` inkl. `stashPolicy`, `sf-plan`, `worktree-integration`). Ein wichtiges Finding (Preset-Anwendung durfte vorhandene Werte nicht ungefragt überschreiben) und drei Hinweise (voll qualifizierte Detail-Pfade, an README-Titel angelehnte Preset-Bezüge, `commit` in der Marketplace-Description ergänzt) wurden direkt eingearbeitet. Kein externer Review-Report nötig.

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
| Scope       |        0 |       0 |       1 |
| Wartbarkeit |        0 |       1 |       0 |

### Befunde

- **Wartbarkeit (Wichtig):** Das Config-Schema ist über mehrere Skills verteilt; ein eigener Setup-Skill, der es erneut kennt, droht bei künftigen Schema-Änderungen zu driften. Eingearbeitet durch die Entscheidung, dass `sf-setup` das Schema nur knapp dupliziert und die jeweiligen Skills als maßgebliche Quelle nennt; gültige Werte werden im Validierungsplan gegen diese Skills abgeglichen.
- **Architektur (Hinweis):** `sf-setup` überschneidet sich funktional mit der bestehenden Laufzeit-Config-Migration. Bewusst akzeptiert: Setup ist die proaktive Erstkonfiguration, die Migration der reaktive Fallback; beide folgen demselben nicht-destruktiven Prinzip.
- **Security (Hinweis):** Es werden keine Secrets verarbeitet oder gespeichert; die Config enthält ausschließlich Verhaltens-Defaults. `.gitignore`-Schreibzugriff ist auf das Anhängen einer Zeile begrenzt.
- **Fehlerfälle (Hinweis):** Ungültiges JSON, fehlende `.gitignore`, fehlendes Git, Teilkonfiguration und Abbruch während der Fragen sind als Edge Cases mit klarem Verhalten abgedeckt.
- **Scope (Hinweis):** Der Skill bleibt auf `.gitignore`-Eintrag und `config.json` begrenzt; keine weiteren Setup-Schritte (Deployment, Hooks) – das hält den Scope klar.
