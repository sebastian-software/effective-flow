# 0032: Zeitoptimierung für Review und Apply-Review

**Planungsstatus:** Umgesetzt
**Quelle:** $sf-plan

## Anforderung

Der Workflow aus `sf-review` und anschließendem `sf-apply-review` soll schneller und mit weniger Bestätigungen laufen. Der typische Ablauf ist:

- `sf-review` läuft häufig über den gesamten Code.
- Im Bericht werden überwiegend nur kritische und wichtige Findings genutzt.
- Der Entwickler ergänzt manuell Anmerkungen im Review-Report.
- `sf-apply-review` setzt die akzeptierten Findings um.

Zwei Engpässe sollen reduziert werden:

- häufige Bestätigungen für wiederkehrende Bash-Skripte und Auswahlfragen
- lange Laufzeit in Review- und Apply-Review-Phasen

Verifizierter Code-Kontext:

- `skills/sf-review/SKILL.md` filtert standardmäßig bereits auf kritische und wichtige Findings.
- `skills/sf-review/SKILL.md` startet Designentscheidungs-Suche, Validator und Reviewer parallel, führt aber weiterhin Scope-Bestätigung, Designentscheidungs-Suche über mehrere Quellen und technische Validierung aus.
- `skills/sf-apply-review/SKILL.md` fragt immer nach der Commit-Strategie, kann Worktrees mit automatischem Setup verwenden und führt am Ende eine projektweite finale Validierung aus.
- `skills/sf-code-validator/SKILL.md` führt vorhandene TypeScript-, Lint- und Build-Skripte parallel aus, behandelt diese aber ausdrücklich als potenziell schreibende Bash-Kommandos.
- `.sf-plugin/config.json` ist bereits als optionaler Plugin-Konfigurationsort etabliert.

Annahme:

- Die häufigen Bash-Bestätigungen entstehen vor allem aus Validierungs-, Build-, Install- und Worktree-Setup-Kommandos, nicht aus rein lesenden `rg`-/`git diff`-Aufrufen.

## Architekturentscheidungen

- **Keine weitere aggressive Parallelisierung als Haupthebel:** `sf-review`, `sf-apply-review` und `sf-code-validator` sind bereits parallelisiert. Zusätzliche Parallelität erhöht eher Sub-Agent-Overhead, Tool-Bestätigungen und Konfliktrisiko.
- **Konfigurierbare Speed-Profile statt globaler Verhaltensänderung:** Bestehende sichere Defaults bleiben erhalten. Häufige persönliche Workflow-Entscheidungen werden über `.sf-plugin/config.json` vorgegeben.
- **Review-Fast-Path für Whole-Code-Reviews:** Wenn der User den gesamten Code explizit oder per Konfiguration als Standardscope festlegt, soll `sf-review` die Scope-Bestätigung überspringen dürfen.
- **Validierungsprofil getrennt von Review-Tiefe:** Ein Review kann weiterhin kritische und wichtige Findings liefern, ohne zwingend alle Build-/Lint-/Typecheck-Skripte im Review-Lauf auszuführen.
- **Apply-Review-Defaults aus Konfiguration:** Commit-Strategie, Worktree-Setup und finale Validierung sollen aus `.sf-plugin/config.json` vorbelegt werden können, damit wiederkehrende Auswahlfragen und Install-Kommandos entfallen.
- **Config-Migrationsstatus in Memory, Cache separat:** `.sf-plugin/memory.json` speichert nur den Status der zuletzt angewendeten Config-Migration. Wiederverwendbare Review-/Apply-Review-Caches liegen in einer eigenen Cache-Datei, damit Finding-Nummern, Migration und Cache-Daten nicht vermischt werden.
- **Sicherheitskritische Eskalationen bleiben erhalten:** Konflikte, unklare Stashes, risikoreiche Cherry-Picks und unsaubere Worktrees dürfen nicht stumm übersprungen werden.

## Betroffene Dateien

| Datei                                                  | Beschreibung                                                                                                                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/sf-review/SKILL.md`                            | Konfigurationslesung, Review-Speed-Profile, Scope-Autobestätigung, Designentscheidungs-Quellenprofile und Validator-Modus ergänzen                                                      |
| `skills/sf-apply-review/SKILL.md`                      | Apply-Review-Defaults aus `.sf-plugin/config.json`, optionales Überspringen der Commit-Strategie-Frage, Worktree-Setup-Profil, finale Validierungsprofile und Config-Migration ergänzen |
| `skills/sf-code-validator/SKILL.md`                    | Check-Modi für `full`, `quick` und `off` beschreiben, damit `sf-review` ihn gezielt steuern kann                                                                                        |
| `build.mjs`                                            | `{{ASK}}`-Transformation um optionale `when:`-Bedingung erweitert, damit Claude Code bedingte Fragen weiter als UI-Fragen anzeigen kann                                                 |
| `README.md`                                            | Kurze Dokumentation der empfohlenen `.sf-plugin/config.json`-Profile für schnelle Review-/Apply-Review-Läufe                                                                            |
| `docs/plan/0032-review-apply-review-speed-profiles.md` | Audit-Trail dieser Planung                                                                                                                                                              |

## Implementierungsdetails

### Vorgehen

1. In `skills/sf-review/SKILL.md` eine frühe Konfigurationslesung ergänzen:
   - `.sf-plugin/config.json` lesen, falls vorhanden.
   - Fehlende Werte mit aktuellen Defaults behandeln.
   - Ungültige Werte melden und auf sichere Defaults zurückfallen.
2. Review-Profil einführen:
   - `full`: aktuelles Verhalten.
   - `focused`: kritische und wichtige Findings, Standard-DD-Quellen, Validator nur wenn eindeutig konfiguriert oder vom User angefordert.
   - `fast`: kritische und wichtige Findings, reduzierte DD-Quellen, Validator überspringen oder nur ein explizites schnelles Check-Skript verwenden.
3. Scope-Bestätigung in `sf-review` bedingt überspringen:
   - Bei explizitem User-Scope, zum Beispiel „gesamter Code" oder konkreten Pfaden.
   - Bei Konfiguration `review.autoConfirmScope: true`.
   - Weiterhin fragen, wenn Scope-Ermittlung widersprüchlich ist, uncommitted Changes vorhanden sind und der gewünschte Scope nicht eindeutig ist.
4. Designentscheidungs-Suche profilieren:
   - `full`: alle aktuellen Quellen.
   - `standard`: ADRs, Pläne, Konventionsdateien.
   - `minimal`: nur ADRs und Konventionsdateien.
   - Vorherige Review-Reports und Code-Kommentar-Scans nur in `full` oder bei expliziter User-Anforderung.
5. Validator-Modus aus `sf-review` an `sf-code-validator` weitergeben:
   - `full`: TypeScript, Lint, Build wie bisher.
   - `quick`: ein vorhandenes kombiniertes Schnellskript bevorzugen, sonst TypeScript und Lint, Build überspringen.
   - `off`: technische Validierung überspringen und im Bericht transparent dokumentieren.
6. In `skills/sf-apply-review/SKILL.md` die Commit-Strategie aus Konfiguration vorbesetzen:
   - Wenn `applyReview.defaultCommitStrategy` gültig gesetzt ist, Phase-2-ASK überspringen und die Strategie kurz melden.
   - Wenn kein gültiger Wert gesetzt ist, aktuelles ASK-Verhalten beibehalten.
7. Worktree-Setup zeitoptimieren:
   - Bestehendes `applyReview.worktree.setup` beibehalten.
   - Empfohlenes Schnellprofil dokumentieren: `none` für Repositories, in denen Worktrees auf vorhandene Abhängigkeiten zugreifen oder Setup nicht nötig ist.
   - Bei `auto` weiterhin bekannte Install-/Fetch-Kommandos ausführen, aber vorab anzeigen, welches Setup geplant ist.
8. Finale Validierung in `sf-apply-review` profilieren:
   - `full`: aktuelles projektweites Gate.
   - `changedScope`: nur Prüfungen, die das Projekt als schnelle oder scope-bewusste Checks anbietet; sonst einmaliger Standard-Check ohne globale Fix-Schleife.
   - `off`: überspringen, wenn der User oder die Konfiguration das ausdrücklich festlegt; Zusammenfassung muss das Restrisiko nennen.
9. Config-Migration ergänzen:
   - Beim Start von `sf-review` und `sf-apply-review` `.sf-plugin/config.json` lesen, falls vorhanden.
   - Wenn die Datei fehlt, keine Datei automatisch erzeugen; stattdessen interne Defaults verwenden.
   - Wenn die Datei existiert, aber neue Schlüssel fehlen, diese zur Laufzeit mit Defaults ergänzen und die Datei aktualisieren.
   - Vor dem Schreiben die vorhandene Datei erneut frisch einlesen, damit keine zwischenzeitlichen Änderungen überschrieben werden.
   - Bei ungültigem JSON nicht schreiben, sichere Defaults verwenden und den User mit Pfad und Fehler kurz informieren.
   - Bei unbekannten Schlüsseln diese unverändert erhalten.
   - Nach erfolgreicher Migration den User einmal pro Workflow-Lauf darauf hinweisen, welche Defaults ergänzt wurden.
   - Den angewendeten Config-Migrationsstand in `.sf-plugin/memory.json` speichern, damit spätere Läufe erkennen können, welche Migration bereits kommuniziert wurde.
10. Separate Cache-Datei ergänzen:

- Wiederverwendbare Cache-Daten nicht in `.sf-plugin/memory.json` und nicht dauerhaft in Wisdom-Dateien speichern.
- Neue Datei `.sf-plugin/cache.json` verwenden.
- Cache-Datei nur für invalidierbare Metadaten und Extrakte verwenden, nicht für finale Review-Findings.
- Bei ungültigem Cache oder Versionswechsel Cache ignorieren und später neu schreiben.

11. `README.md` um ein knappes Beispiel für ein schnelles persönliches Profil, die Migrationsstrategie und die Cache-Datei ergänzen.
12. Build und gezielte Inspektion der generierten Codex- und Claude-Artefakte als spätere Validierung einplanen.

### Konfigurationsform

Die genaue JSON-Form soll minimal bleiben. Geplante Schlüssel:

| Schlüssel                           | Werte                         | Wirkung                                  |
| ----------------------------------- | ----------------------------- | ---------------------------------------- |
| `review.profile`                    | `full`, `focused`, `fast`     | Bündelt Review-Defaults                  |
| `review.autoConfirmScope`           | Boolean                       | Überspringt eindeutige Scope-Bestätigung |
| `review.designDecisionSources`      | `full`, `standard`, `minimal` | Steuert DD-Suchaufwand                   |
| `review.validation`                 | `full`, `quick`, `off`        | Steuert Validator-Aufwand im Review      |
| `applyReview.defaultCommitStrategy` | `worktrees`, `single`, `none` | Überspringt Commit-Strategie-Frage       |
| `applyReview.finalValidation`       | `full`, `changedScope`, `off` | Steuert finale Validierung               |
| `applyReview.worktree.setup`        | `auto`, `none` oder String    | Bestehender Worktree-Setup-Schlüssel     |

### Default-Konfiguration

Wenn `.sf-plugin/config.json` fehlt oder einzelne Schlüssel fehlen, gelten diese Defaults:

| Schlüssel                           | Default                 | Begründung                                                                                                                       |
| ----------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `review.profile`                    | `focused`               | Entspricht dem etablierten Standard, nur kritische und wichtige Findings zu berichten, ohne ein vollständiges Audit zu erzwingen |
| `review.autoConfirmScope`           | `false`                 | Verhindert versehentliches Whole-Code-Review oder falschen Scope bei mehrdeutiger Lage                                           |
| `review.designDecisionSources`      | `standard`              | Hält ADRs, Pläne und Konventionsdateien abgedeckt, spart aber teure breite Scans                                                 |
| `review.validation`                 | `full`                  | Bewahrt den bisherigen sicheren Review-Default                                                                                   |
| `applyReview.defaultCommitStrategy` | nicht gesetzt           | Bewahrt die bestehende explizite Commit-Strategie-Auswahl                                                                        |
| `applyReview.finalValidation`       | `full`                  | Bewahrt das bisherige projektweite Qualitäts-Gate                                                                                |
| `applyReview.worktree.baseDir`      | `.sf-plugin/.worktrees` | Entspricht dem bestehenden Worktree-Default                                                                                      |
| `applyReview.worktree.setup`        | `auto`                  | Entspricht dem bestehenden Setup-Default                                                                                         |

Für den persönlichen Schnellmodus kann der User diese Defaults bewusst überschreiben. Der Plan ändert also die sichere Ausgangslage nicht, macht aber häufige Entscheidungen dauerhaft konfigurierbar.

### Config-Migration

Die Migration soll leichtgewichtig und transparent sein:

1. Wenn `.sf-plugin/config.json` nicht existiert:
   - keine automatische Datei anlegen
   - interne Defaults verwenden
   - in der Abschlussmeldung optional darauf hinweisen, dass eine Konfigurationsdatei für schnellere Folgeläufe angelegt werden kann
2. Wenn `.sf-plugin/config.json` existiert:
   - fehlende neue Schlüssel mit den Default-Werten ergänzen
   - vorhandene Werte unverändert lassen, sofern sie gültig sind
   - unbekannte Schlüssel unverändert erhalten
   - Datei im bestehenden JSON-Stil möglichst stabil schreiben
3. Wenn ungültige Werte vorhanden sind:
   - den konkreten Schlüssel nennen
   - für diesen Lauf den sicheren Default verwenden
   - den ungültigen Wert nicht automatisch überschreiben, damit keine Benutzerentscheidung verloren geht
4. Wenn die Migration erfolgreich Schlüssel ergänzt:
   - dem User kurz mitteilen, dass `.sf-plugin/config.json` migriert wurde
   - die ergänzten Schlüssel nennen
   - erklären, dass die Defaults das bisherige sichere Verhalten erhalten
5. Nach erfolgreicher Migration den Migrationsstatus in `.sf-plugin/memory.json` aktualisieren:
   - vorhandene Felder wie `lastFindingNumber` unverändert erhalten
   - ein Feld `configMigration` ergänzen oder aktualisieren
   - mindestens `version`, `appliedAt` und die Liste der ergänzten Schlüssel speichern
   - dieser Status dient nur der Nachvollziehbarkeit und zur Vermeidung wiederholter Migrationshinweise

Geplante Memory-Erweiterung:

| Schlüssel                   | Bedeutung                                       |
| --------------------------- | ----------------------------------------------- |
| `configMigration.version`   | Version des zuletzt angewendeten Config-Schemas |
| `configMigration.appliedAt` | Zeitpunkt der letzten erfolgreichen Migration   |
| `configMigration.addedKeys` | Beim letzten Migrationslauf ergänzte Schlüssel  |

### Cache-Datei

Alle wiederverwendbaren Cache-Daten liegen außerhalb von `.sf-plugin/memory.json` in `.sf-plugin/cache.json`.

Grundregeln:

- `memory.json` bleibt für dauerhafte Workflow-Zähler und Migrationsstatus zuständig.
- `cache.json` enthält ausschließlich invalidierbare Cache-Daten.
- Wisdom-Dateien bleiben temporäre In-Run-Speicher und werden am Ende gelöscht.
- Persistente Caches dürfen Review-Findings nicht ersetzen; sie dürfen nur Vorarbeiten beschleunigen.
- Jeder Cache-Eintrag benötigt mindestens `version`, `sourceHash` oder vergleichbare Invalidierungsdaten und `createdAt`.
- Bei Unsicherheit wird der Cache ignoriert, nicht verwendet.

Geplante Cache-Bereiche:

| Bereich               | Inhalt                                                                                           | Invalidierung                                              |
| --------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `designDecisions`     | Extrahierte Designentscheidungen pro Quelle                                                      | Hash oder mtime der Quelldateien, Cache-Schema-Version     |
| `scopeIndex`          | Dateiliste, Project-Type-Buckets und Reviewer-Split für Whole-Code-Reviews                       | Git-HEAD, Dirty-State und relevante Dateiänderungen        |
| `validatorScripts`    | Erkannte Check-Skripte und zuletzt brauchbares Validierungsprofil                                | Änderung an Package-/Build-Konfigurationsdateien           |
| `applyReviewAnalysis` | Vorabanalyse-Ergebnisse pro Report-Finding für unterbrochene oder wiederholte Apply-Review-Läufe | Report-Datei-Hash, Finding-ID, relevante Code-Datei-Hashes |

Nicht gecacht werden:

- finale Review-Findings
- User-Entscheidungen zu Konflikten, Stashes oder ADR-Ablehnungen
- Outputs fehlerhafter Validator-Läufe als Grundlage für spätere erfolgreiche Läufe

Wenn `.sf-plugin/cache.json` ungültiges JSON enthält, soll der Workflow:

- die Cache-Datei nicht überschreiben
- den Cache für diesen Lauf ignorieren
- den User kurz informieren
- mit normaler Neuberechnung fortfahren

### Empfohlenes Profil für den beschriebenen Workflow

Für den beschriebenen persönlichen Workflow ist dieses Zielprofil sinnvoll:

- Review: `focused` oder `fast`
- Scope-Autobestätigung: aktiviert, wenn Whole-Code-Review der Normalfall ist
- Designentscheidungs-Quellen: `standard`
- Review-Validierung: `quick` oder `off`, wenn die finale Apply-Review-Validierung maßgeblich sein soll
- Apply-Review-Commitstrategie: `worktrees`
- Worktree-Setup: `none`, wenn Dependencies nicht pro Worktree installiert werden müssen
- Finale Validierung: `changedScope` oder `full`, je nachdem ob das Zielprojekt zuverlässige schnelle Checks anbietet

### Nicht-Ziele

- Keine Entfernung der bestehenden sicheren Standardpfade.
- Keine automatische Bestätigung destruktiver Aktionen.
- Keine automatische Konfliktlösung über die bereits definierte risikoarme Cherry-Pick-Konfliktbewertung hinaus.
- Keine Änderung an der Finding-Schweregrad-Logik; kritische und wichtige Findings bleiben der Standard.

### Edge Cases

- Wenn `review.validation: off` gesetzt ist, muss der Bericht klar markieren, dass technische Checks nicht ausgeführt wurden.
- Wenn `review.autoConfirmScope: true` gesetzt ist, aber Scope-Erkennung mehrdeutig ist, muss weiterhin gefragt werden.
- Wenn `applyReview.defaultCommitStrategy: worktrees` gesetzt ist und der Arbeitsbaum nicht sauber ist, darf der Worktree-Modus nicht automatisch starten.
- Wenn `applyReview.worktree.setup: none` gesetzt ist und ein Sub-Agent wegen fehlender Dependencies scheitert, soll die Zusammenfassung das Setup-Profil als mögliche Ursache nennen.
- Wenn `applyReview.finalValidation: off` gesetzt ist, darf kein Validierungsfix-Commit entstehen.
- Wenn `.sf-plugin/cache.json` fehlt, ungültig oder veraltet ist, muss der Workflow ohne Cache korrekt weiterlaufen.
- Wenn ein Cache-Eintrag nicht eindeutig invalidierbar ist, darf er nicht verwendet werden.

## Akzeptanzkriterien

- [x] `sf-review` liest `.sf-plugin/config.json` und nutzt sichere Defaults, wenn die Datei fehlt.
- [x] Bestehende `.sf-plugin/config.json`-Dateien werden um fehlende neue Default-Schlüssel ergänzt, ohne unbekannte Schlüssel zu entfernen.
- [x] Der User wird nach erfolgreicher Config-Migration kurz über Pfad und ergänzte Schlüssel informiert.
- [x] Bei ungültigem JSON oder ungültigen Werten wird nicht destruktiv migriert; der Workflow nutzt sichere Defaults und meldet den Grund.
- [x] `.sf-plugin/memory.json` speichert den Config-Migrationsstatus, ohne vorhandene Memory-Felder wie `lastFindingNumber` zu verlieren.
- [x] Wiederverwendbare Cache-Daten werden ausschließlich in `.sf-plugin/cache.json` gespeichert, nicht in `.sf-plugin/memory.json`.
- [x] Ungültige oder veraltete Cache-Einträge werden ignoriert und führen nicht zum Workflow-Abbruch.
- [x] `sf-review` kann bei eindeutigem Scope oder `review.autoConfirmScope: true` ohne Scope-ASK starten.
- [x] `sf-review` unterstützt mindestens die Profile `full`, `focused` und `fast`.
- [x] `sf-review` kann technische Validierung im Review-Lauf per Konfiguration auf `full`, `quick` oder `off` setzen.
- [x] `sf-apply-review` kann die Commit-Strategie aus Konfiguration übernehmen und die Phase-2-Frage überspringen.
- [x] `sf-apply-review` unterstützt konfigurierbare finale Validierung mit `full`, `changedScope` und `off`.
- [x] README dokumentiert ein kompaktes Schnellprofil für den beschriebenen Workflow.
- [x] Ungültige Konfigurationswerte führen zu Warnung und sicherem Default, nicht zu Workflow-Abbruch.
- [x] Generierte Codex- und Claude-Artefakte enthalten die neuen Regeln nach `node build.mjs`.

## Validierungsplan

- `node build.mjs` ausführen.
- Generierte Dateien unter `dist/codex/skills/` und `dist/claude/` gezielt auf neue Profile, ASK-Bypass-Regeln und Konfigurationsschlüssel prüfen.
- Mit `rg` prüfen, dass alte sichere Defaults weiterhin dokumentiert sind.
- Manuelle Trockenprüfung anhand von drei Konfigurationsfällen:
  - keine `.sf-plugin/config.json`
  - schnelles Profil mit Whole-Code-Review
  - ungültige Werte mit Fallback-Warnung
  - bestehende `.sf-plugin/config.json` mit fehlenden neuen Schlüsseln
- Manuelle Trockenprüfung anhand von drei Cache-Fällen:
  - keine `.sf-plugin/cache.json`
  - gültiger Cache mit unveränderten Quellen
  - ungültiger oder veralteter Cache

## Annahmen und offene Punkte

- Annahme: Zeitgewinn entsteht stärker durch weniger verpflichtende Validierungs-/Setup-Kommandos und weniger User-Interaktion als durch weitere Sub-Agent-Parallelität.
- Annahme: Für viele Zielprojekte reicht im Review-Lauf ein schneller oder ausgeschalteter Validator, wenn `sf-apply-review` anschließend validiert.
- Annahme: Cache-Daten bringen vor allem bei wiederholten Whole-Code-Reviews und wiederholten Apply-Review-Läufen auf demselben Report messbaren Nutzen.
- Offener Punkt für die Umsetzung: Ob `changedScope` generisch ausführbar ist, hängt vom Zielprojekt ab. Ohne vorhandenes scope-bewusstes Skript sollte der Skill auf einen einmaligen Standard-Check oder `full` zurückfallen, statt eigene Tool-Argumente zu erfinden.
- Offener Punkt für die Umsetzung: Die konkrete `sourceHash`-Strategie muss pro Cache-Bereich festgelegt werden. Wenn Hashing zu teuer ist, kann mtime plus Dateigröße als schwächerer, aber schnellerer Invalidierungsmechanismus verwendet werden.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       0 |
| Security    |        0 |       0 |       0 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       0 |       2 |
| Testbarkeit |        0 |       0 |       0 |
| Scope       |        0 |       0 |       0 |
| Wartbarkeit |        0 |       0 |       0 |

### Befunde

- **Hinweis – Fehlerfälle:** `changedScope` ist nicht in jedem Projekt zuverlässig generisch ableitbar. Der Plan deckt das durch den offenen Punkt und den Fallback auf vorhandene Skripte ab.
- **Hinweis – Cache-Invalidierung:** Persistente Caches können veralten, wenn die Invalidierung zu grob ist. Der Plan begrenzt das Risiko, indem unsichere Cache-Einträge ignoriert werden müssen und finale Review-Findings nicht gecacht werden.

## Testergebnisse

- `node build.mjs` erfolgreich ausgeführt. Ergebnis: Codex 8 Skills und 9 Agents, Claude Code 8 Commands und 9 Agents.
- `node --check build.mjs` erfolgreich ausgeführt.
- Gezielt geprüft, dass die generierten Codex- und Claude-Artefakte die neuen Profile, Config-Migration, `memory.json`-Migrationsstatus, `.sf-plugin/cache.json`, `applyReview.defaultCommitStrategy`, `applyReview.finalValidation` und Validator-Modi enthalten.
- Gezielt geprüft, dass die neue Scope-Bestätigung in `sf-review` und die Commit-Strategie-Frage in `sf-apply-review` in Claude Code wieder als bedingte `AskUserQuestion`-UI-Fragen gerendert werden.
- Gezielt geprüft, dass Codex dieselben Fragen als bedingte Textfragen rendert.

## Review-Findings

**Datum:** 2026-05-14
**Reviewer:** lokal

### Zusammenfassung

| Schweregrad | Anzahl | Behoben | Offen |
| ----------- | -----: | ------: | ----: |
| Kritisch    |      0 |       0 |     0 |
| Wichtig     |      2 |       2 |     0 |
| Hinweis     |      0 |       0 |     0 |

| Komplexität | Anzahl |
| ----------- | -----: |
| Leicht      |      2 |
| Mittel      |      0 |
| Schwer      |      0 |

### Findings

#### [F1] Bedingte Fragen wurden als unbedingte ASK-Blöcke gerendert

- **Schweregrad**: Wichtig
- **Komplexität**: Leicht
- **Bereich**: Skill-Orchestrierung / ASK-Transformation
- **Datei**: `skills/sf-review/SKILL.md`, `skills/sf-apply-review/SKILL.md`
- **Problem**: Die neue Scope-Autobestätigung und die konfigurierte Commit-Strategie sollten Fragen überspringen können. Die ursprüngliche Umsetzung ließ jedoch `{{ASK}}`-Blöcke stehen, die im generierten Output weiterhin als unbedingte User-Fragen erschienen.
- **Empfehlung**: Die beiden optionalen Fragen als bedingte Textanweisungen formulieren, damit sie nur bei fehlendem Default oder unklarem Scope gestellt werden.
- **Status**: Behoben

#### [F2] Claude-Code-UI ging durch entfernte ASK-Blöcke verloren

- **Schweregrad**: Wichtig
- **Komplexität**: Leicht
- **Bereich**: Skill-Orchestrierung / Plattform-UX
- **Datei**: `build.mjs`, `skills/sf-review/SKILL.md`, `skills/sf-apply-review/SKILL.md`
- **Problem**: Die Korrektur zu F1 entfernte die `{{ASK}}`-Blöcke vollständig. Dadurch konnte Claude Code keine strukturierte `AskUserQuestion`-UI mehr anzeigen, obwohl die Fragen nur bedingt gestellt werden sollten.
- **Empfehlung**: `{{ASK}}` um ein optionales `when:`-Feld erweitern und die beiden Fragen wieder als bedingte ASK-Blöcke formulieren.
- **Status**: Behoben
