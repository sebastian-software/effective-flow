# 0055: Review- und Apply-Review-Anbindung an GitHub/Forgejo (Issue-Tracker)

**Planungsstatus:** Umgesetzt
**Quelle:** /plan
**Empfohlener Workflow:** Feature (`/build`)

## Anforderung

`sf-review` und `sf-apply-review` sollen neben dem bisherigen lokalen Betrieb einen
**Remote-Modus** unterstützen, in dem Findings über einen Issue-Tracker (GitHub via
`gh`, Forgejo via `tea`) statt über eine lokale Markdown-Report-Datei geführt werden.

Konkret:

- Es gibt zwei Modi: **`local`** (heutiges Verhalten, Markdown-Report unter
  `.sf-plugin/review/`) und **`remote`** (Findings als Issues). Im Remote-Modus wird
  das konkrete Werkzeug (GitHub/`gh` vs. Forgejo/`tea`) automatisch anhand der
  `origin`-URL erkannt — dieselbe Erkennung, die `{{SKILL:sf-pr}}` bereits nutzt.
- Der Modus wird in `{{SKILL:sf-setup}}` abgefragt und in `.sf-plugin/config.json`
  persistiert. Ist er dort nicht gesetzt, fragen `sf-review` und `sf-apply-review`
  beim ersten Aufruf einmalig nach und persistieren die Wahl.
- **`sf-review` im Remote-Modus:** legt pro Finding ein eigenes Issue an und ein
  Epic-Issue mit einer abhakbaren Liste der Finding-Issues. **Jeder Review-Lauf erzeugt
  ein neues Epic; ein bestehendes Epic wird nie erweitert.** **Dedup:** existiert ein
  Finding bereits als Issue (in einem früheren Epic oder als Issue ohne Epic), wird
  weder ein neues Issue mit gleichem Inhalt erzeugt noch im neuen Epic darauf verwiesen.
  Es wird **kein lokaler Report** geschrieben — jedes Finding-Issue muss **alle**
  Informationen enthalten, die zur späteren Umsetzung nötig sind, da eine andere
  LLM-Session das Issue ohne Zugriff auf diese Session abarbeiten kann.
- **`sf-apply-review` im Remote-Modus:** akzeptiert statt einer Report-Datei entweder
  ein **Epic-Issue** (dann werden alle verlinkten Finding-Issues abgearbeitet) oder eine
  **Liste konkreter Finding-Issues** (dann werden nur diese abgearbeitet). Es erstellt
  **pro Finding genau einen Pull-Request**. Nach Erstellung des PR für ein Finding wird
  der zugehörige Eintrag im zugehörigen Epic-Issue abgehakt. Findings mit Label
  `wontfix` werden nicht umgesetzt, sondern als ADR dokumentiert.

Begründung der Workflow-Empfehlung: Es entsteht neue Funktionalität (Integration eines
externen Issue-Trackers in zwei Orchestrator-Skills plus Setup und geteilter
Baustein). Das ist ein **Feature** und wird über `/build` umgesetzt, nicht als reine
Doku-Änderung.

## Architekturentscheidungen

- **Geteilter Baustein `skills/_shared/issue-tracker.md`.** Analog zu
  `worktree-integration.md` und `commit-message-rules.md` kapselt ein neuer Include die
  gesamte gemeinsame Logik: `tracker`-Config-Schema, Modusbestimmung, Host-Erkennung
  (`gh`/`tea`), Label-Konventionen sowie die kanonischen Issue- und Epic-Body-Formate.
  `sf-review` und `sf-apply-review` binden ihn über ` ```include ` ein. So bleibt genau
  eine Quelle der Wahrheit für Formate und CLI-Aufrufe; keine Duplikation.
- **Modus `local` vs. `remote`, Werkzeug per Autodetection.** Der Config-Wert ist
  bewusst `local`/`remote` (nicht `github`/`forgejo`), weil GitHub vs. Forgejo
  eindeutig aus der `origin`-URL ableitbar ist. Die Erkennung wird aus
  `{{SKILL:sf-pr}}` übernommen (Host enthält `github.com` → `gh`, sonst `tea`). Ein
  ausdrücklicher Per-Run-Hinweis des Users hat bei mehrdeutigem Host (z. B.
  GitHub Enterprise) Vorrang — konsistent mit `{{SKILL:sf-pr}}`.
- **Issues-only im Remote-Modus.** Im Remote-Modus wird kein Markdown-Report
  geschrieben. Das Epic-Issue plus die Finding-Issues sind die alleinige
  Tracking- und Inhaltsquelle. Damit ist der Fluss self-contained für eine fremde
  LLM-Session.
- **Finding-Nummerierung bleibt bestehen.** Die fortlaufende `R-XXXXXXX`-ID aus
  `.sf-plugin/memory.json` (`lastFindingNumber`) wird auch im Remote-Modus vergeben und
  in den Issue-Titel (`[R-XXXXXXX] <Titel>`) sowie in den Issue-Body geschrieben. Sie
  dient als stabile, tracker-unabhängige Referenz zwischen Epic, Sub-Issue und PR. Sie
  ist **kein Dedup-Schlüssel**, weil sie pro Lauf frisch vergeben wird.
- **Jeder `sf-review`-Lauf erzeugt ein neues Epic, mit inhaltlichem Dedup.** Ein
  bestehendes Epic wird nie erweitert. Vor dem Anlegen wird aber jedes Finding gegen
  bereits vorhandene Finding-Issues (über das Label `sf-review-finding`, unabhängig von
  Epic-Zugehörigkeit) abgeglichen. Der **Dedup-Schlüssel ist die inhaltliche
  Finding-Signatur** (Datei+Zeile, Bereich, Problem) — dieselbe Grundlage, die der
  lokale Modus in Phase 3 zur Duplikaterkennung nutzt, nicht die `R-XXXXXXX`-ID. Ein
  bereits existierendes Finding wird nicht neu als Issue angelegt und **nicht** im neuen
  Epic referenziert; das neue Epic listet nur die in diesem Lauf tatsächlich neu
  angelegten Finding-Issues.
- **`sf-apply-review` akzeptiert Epic-Issue oder Issue-Liste.** Ein Epic arbeitet alle
  verlinkten Finding-Issues ab; eine übergebene Liste konkreter Finding-Issues schränkt
  auf genau diese ein. In beiden Fällen wird der Eintrag im jeweils zugehörigen Epic nach
  PR-Erstellung abgehakt.
- **Ein PR pro Finding über die bestehende Worktree-Mechanik.** Im Remote-Modus wird
  jedes umsetzbare Finding als eigene Sub-Gruppe in einem eigenen Worktree/Branch
  umgesetzt und über `{{SKILL:sf-pr}}` als eigener PR abgeschlossen (`Closes #<Sub-Issue>`).
  Die Union-Find-Zusammenfassung dateiüberlappender Findings aus dem lokalen Modus
  entfällt hier, weil jedes Finding einen eigenen Branch/PR braucht; dateiüberlappende
  Findings laufen stattdessen sequenziell, um Arbeitsbaum-Konflikte zu vermeiden.
- **`wontfix` als Ablehnungssignal.** Im Remote-Modus ersetzt das Issue-Label
  `wontfix` die lokale „Entwickler-Anmerkung: Nicht umsetzen". Es steuert die
  ADR-Erstellung. Optionaler Begründungstext kommt aus dem Issue-Body/-Kommentar.
- **Sauberer Abbruch bei fehlendem CLI.** Fehlt `gh`/`tea` oder die Authentifizierung,
  bricht der Remote-Modus mit klarer Meldung und Behebungshinweis ab (kein halber
  Zustand), analog zu `{{SKILL:sf-pr}}`. Es wird nicht still auf `local` zurückgefallen;
  ein Fallback wird nur nach ausdrücklicher User-Zustimmung angeboten.

## Betroffene Dateien

| Datei                             | Beschreibung                                                                                                                                                                                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/_shared/issue-tracker.md` | **Neu.** Geteilter Baustein: `tracker`-Config-Schema + Migration, Modusbestimmung, Host-/CLI-Erkennung, Label-Konventionen, kanonische Issue- und Epic-Body-Formate, Beschreibung der Create-/Update-Operationen für `gh` und `tea`.                                          |
| `skills/sf-review/SKILL.md`       | `tracker`-Config laden, Erstaufruf-Abfrage, Include des neuen Bausteins; Phase 1 um Modus-/CLI-Bestimmung erweitern; Phase 4 (Bericht) um Remote-Zweig ergänzen (Finding-Issues + Epic statt Report-Datei), Finding-Nummerierung beibehalten.                                 |
| `skills/sf-apply-review/SKILL.md` | Include des neuen Bausteins; Argument um Epic-Issue-Referenz erweitern; Remote-Zweig für Phase 1 (Findings aus Issues lesen, `wontfix`-Klassifikation), Phase 4 (PR pro Finding), Phase 5 (Tracking-Oberfläche statt Report aktualisieren), Phase 3 (ADR referenziert Issue). |
| `skills/sf-setup/SKILL.md`        | `tracker`-Block ins Config-Schema und in die Presets aufnehmen; zentrale Verhaltensfrage `local`/`remote` in Schritt 4 ergänzen; Detailmodus (Schritt 5) um `tracker`-Schlüssel erweitern.                                                                                    |
| `README.md`                       | Abschnitt „Plugin-Konfiguration" um den `tracker`-Block und den Remote-Modus von Review/Apply-Review ergänzen (dieser Skill schreibt den Plan nur; die README-Änderung erfolgt später im `/build`-Lauf).                                                                      |

## Implementierungsdetails

### Vorgehen

1. **Geteilten Baustein `skills/_shared/issue-tracker.md` anlegen** mit:
   - **Config-Schema `tracker`:** `mode` (`local` | `remote`, Default `local`) und
     optional `remoteToolOverride` (`github` | `forgejo` | `auto`, Default `auto`) für
     mehrdeutige Hosts. Plus Config-Migration analog zu den bestehenden Bausteinen
     (fehlende Schlüssel nicht-destruktiv ergänzen, ungültiges JSON nicht überschreiben,
     `configMigration` in `memory.json` fortschreiben).
   - **Modusbestimmung:** Config-Wert als Basis; Per-Run-Wunsch des Users hat Vorrang;
     zusätzlich überschreibt der übergebene Argumenttyp den Modus für den Lauf
     (Report-Datei → `local`, Issue-Referenz → `remote`).
   - **Erstaufruf-Abfrage:** Ist `tracker.mode` nicht in der Config gesetzt und kein
     Per-Run-/Argument-Signal vorhanden, frage einmalig und persistiere die Wahl
     nicht-destruktiv in `.sf-plugin/config.json` (Muster wie `plan.markerLanguage`).
   - **Host-/CLI-Erkennung:** aus `{{SKILL:sf-pr}}` übernehmen — `origin`-URL lesen,
     `github.com` → `gh`, sonst `tea`; `remoteToolOverride` bzw. Per-Run-Hinweis hat
     Vorrang. CLI-Verfügbarkeit und Authentifizierung prüfen (`gh auth status` bzw.
     `tea`-Login); bei Fehlen klar abbrechen.
   - **Label-Konvention:** `sf-review-finding`, `sf-review-epic`, ein Aktions-Label je
     Ziel-Skill (`sf-fix`/`sf-refactor`/`sf-build`/`sf-docs`), ein Schweregrad-Label
     (`kritisch`/`wichtig`) und `wontfix`. Labels idempotent anlegen („already exists"
     tolerieren).
   - **Kanonische Body-Formate** (siehe unten „Issue- und Epic-Body-Format").
2. **`sf-review` erweitern:**
   - Include `issue-tracker` ergänzen; in Phase 1 Modus, Host und CLI bestimmen; bei
     `remote` CLI-Verfügbarkeit vorab prüfen.
   - Finding-Nummerierung aus `memory.json` unverändert lassen (auch remote fortlaufend).
   - In Phase 4 verzweigen: `local` wie bisher (Report-Datei). `remote` statt Report:
     - **Dedup zuerst:** die vorhandenen Finding-Issues am Tracker abfragen (Label
       `sf-review-finding`, offen und geschlossen) und jedes qualitätsgeprüfte Finding
       über die inhaltliche Signatur (Datei+Zeile, Bereich, Problem) dagegen abgleichen.
       Bereits vorhandene Findings aus der Anlageliste entfernen;
     - erst für die verbleibenden **neuen** Findings je eine `R-XXXXXXX`-ID vergeben
       (`memory.json` nur für tatsächlich angelegte Issues fortschreiben) und je ein Issue
       mit vollständigem Body und Labels anlegen;
     - ein **neues** Epic-Issue mit Titel `Code-Review YYYY-MM-DD[-N]` und Task-Liste
       ausschließlich der in diesem Lauf neu angelegten Finding-Issues anlegen;
       übersprungene Findings (Designentscheidungen) als nicht-abhakbaren Hinweisabschnitt
       im Epic-Body führen; bereits existierende (deduplizierte) Findings werden nicht
       referenziert;
     - `memory.json` mit der höchsten vergebenen Finding-Nummer schreiben (wie bisher);
     - dem User Epic-URL, Anzahl neu angelegter und Anzahl deduplizierter Findings melden.
   - Ein bestehendes Epic wird nie erweitert; jeder Lauf erzeugt ein neues Epic. Sind nach
     dem Dedup keine neuen Findings übrig, kein leeres Epic anlegen, sondern dem User
     melden, dass alle Findings bereits als Issues existieren.
3. **`sf-apply-review` erweitern:**
   - Include `issue-tracker` ergänzen; Argument-Erkennung:
     - Pfad zu `.md`-Report → `local` (wie bisher);
     - eine einzelne Issue-Referenz mit `sf-review-epic`-Label → `remote`, **Epic-Modus**
       (alle verlinkten Sub-Issues abarbeiten);
     - eine Liste von Finding-Issue-Referenzen (mehrere Nummern/`#…`/URLs oder ein einzelnes
       Finding-Issue ohne Epic-Label) → `remote`, **Issue-Listen-Modus** (nur genau diese
       Findings abarbeiten). Das zugehörige Epic je Finding wird für das spätere Abhaken
       aus dem Sub-Issue ermittelt (Referenz/Label), sofern vorhanden.
     - In `remote` ohne Argument die offenen Epics auflisten und den User wählen lassen.
   - Phase 1 remote: im Epic-Modus die Epic-Task-Liste parsen, im Issue-Listen-Modus die
     übergebene Liste verwenden; je Finding-Issue den vollständigen Body frisch vom Tracker
     lesen und klassifizieren:
     - Label `wontfix` → ADR (Phase 3), kein Code;
     - bereits abgehakt/geschlossen → überspringen;
     - sonst → umsetzen.
   - Phase 2/4 remote: Commit-Strategie ist fest „ein PR pro Finding". Jedes umsetzbare
     Finding ist eine eigene Sub-Gruppe in einem eigenen Worktree/Branch
     (`<branchPrefix>/apply-review/<R-ID-oder-slug>`, Basis `worktree.baseBranch`).
     Nach der Umsetzung: committen, Branch pushen, über `{{SKILL:sf-pr}}` einen PR gegen
     den Basis-Branch erstellen mit `Closes #<Sub-Issue>` im Body. Dateiüberlappende
     Findings sequenziell abarbeiten.
   - Direkt nach PR-Erstellung eines Findings: den entsprechenden Eintrag im Epic-Body
     abhaken (`- [ ]` → `- [x]`, PR-Link anhängen) und optional den PR-Link als Kommentar
     ans Sub-Issue schreiben.
   - Phase 3 remote: ADR referenziert Issue-Nummer und Epic statt Report-Finding; das
     `wontfix`-Finding im Epic als „nicht umgesetzt (ADR)" markieren.
   - Phase 5 remote: keine Report-Datei aktualisieren, sondern die Tracking-Oberfläche
     (Epic-Checkboxen, Sub-Issue-Kommentare/Labels).
   - Phase 7/8: finale Validierung und Zusammenfassung wie bisher; die Zusammenfassung
     nennt Epic-URL, erstellte PRs und abgehakte Findings.
4. **`sf-setup` erweitern:** `tracker`-Block ins Config-Schema aufnehmen, in beide
   Presets mit Default `mode: local` einbetten, in Schritt 4 die zentrale Frage
   `local`/`remote` stellen und im Detailmodus (Schritt 5) `tracker.mode` sowie
   optional `tracker.remoteToolOverride` abfragen.
5. **README** im Abschnitt „Plugin-Konfiguration" um den `tracker`-Block und die
   Remote-Modus-Erläuterung ergänzen.

### API-Anbindung

Externe CLIs statt HTTP-SDK, konsistent mit `{{SKILL:sf-pr}}`:

- **GitHub (`gh`):** `gh issue create`, `gh issue view --json`, `gh issue edit`
  (`--body-file` zum Body-Update), `gh issue comment`, `gh label create`,
  `gh pr create` (via `{{SKILL:sf-pr}}`).
- **Forgejo (`tea`):** `tea issue create`, `tea issue`/`tea issue view`,
  `tea issue edit`, `tea comment`, `tea labels create`, `tea pr create` (via
  `{{SKILL:sf-pr}}`). Flagnamen gegen die installierte `tea`-Version prüfen, falls ein
  Aufruf fehlschlägt (wie in `{{SKILL:sf-pr}}` vermerkt).

Der geteilte Baustein beschreibt diese Aufrufe abstrakt (Operation → Werkzeug-Mapping),
damit die beiden Orchestratoren dieselbe Beschreibung nutzen.

### Issue- und Epic-Body-Format

Ein **Finding-Issue** muss self-contained sein und mindestens enthalten: `R-XXXXXXX`-ID,
Schweregrad, Komplexität, Bereich, Datei+Zeile, Problem, Empfehlung, Ziel-Aktion
(einer der vier Skills) und den kopierbaren Prompt-Vorschlag. Das entspricht inhaltlich
dem heutigen Finding-Block des Markdown-Reports, damit `sf-apply-review` dieselben
Felder verarbeiten kann.

Das **Epic-Issue** enthält eine Task-Liste mit je einem Eintrag pro Finding-Issue, als
kürzestes klares Beispiel:

```markdown
- [ ] #123 [R-0000001] Kurztitel — Aktion: sf-fix
```

Plus einen nicht-abhakbaren Abschnitt „Übersprungen (Designentscheidungen)" für gefilterte
Findings. Das exakte Format wird kanonisch im geteilten Baustein festgelegt.

### Edge Cases

- **Fehlendes/nicht authentifiziertes CLI:** klar abbrechen, Behebungshinweis geben,
  keinen Teilzustand hinterlassen; kein stiller Fallback auf `local`.
- **Mehrdeutiger Host (GitHub Enterprise, unklare Domain):** `remoteToolOverride` bzw.
  Per-Run-Hinweis nutzen; ist beides unklar, den User fragen.
- **Re-Run von `sf-review`:** erzeugt ein neues Epic, dedupliziert aber gegen bestehende
  Finding-Issues (Signatur Datei+Zeile/Bereich/Problem). Schon vorhandene Findings werden
  nicht neu angelegt und nicht im neuen Epic referenziert. Bleiben keine neuen Findings,
  wird kein leeres Epic erzeugt.
- **Unsichere Dedup-Übereinstimmung** (teilweise Signatur-Überlappung, z. B. geänderte
  Zeilennummer bei gleichem Problem): im Zweifel als neues Finding behandeln und anlegen,
  statt fälschlich zu unterdrücken; die mögliche Verwandtschaft im Issue-Body notieren.
- **Epic-Issue-Argument zeigt auf ein Nicht-Epic** (fehlendes `sf-review-epic`-Label
  oder keine Task-Liste): als Issue-Listen-Modus mit genau diesem einen Finding behandeln,
  statt hart abzubrechen; ist das Issue auch kein Finding-Issue, melden und abbrechen.
- **Issue-Listen-Modus, Finding ohne zugeordnetes Epic:** Finding trotzdem umsetzen und
  PR erstellen; das Abhaken entfällt mangels Epic und wird dem User gemeldet.
- **Sub-Issue ohne Ziel-Aktion/Prompt** (manuell verändert): Finding als nicht
  umsetzbar melden, nicht raten.
- **PR-Erstellung schlägt fehl** (Push abgelehnt, kein Commit): Finding als
  fehlgeschlagen markieren, Epic-Eintrag **nicht** abhaken, nächstes Finding fortsetzen.
- **Epic-Body-Update-Konflikt** (parallele Änderung): Body vor dem Abhaken frisch lesen,
  gezielt nur die betroffene Zeile umschalten.
- **`tracker.mode: remote`, aber Report-Datei als Argument übergeben** (oder umgekehrt):
  Der Argumenttyp überschreibt den Config-Modus für diesen Lauf.
- **Kein Git-Repository / keine `origin`-Remote:** Remote-Modus nicht möglich; melden.

## Akzeptanzkriterien

- [x] `skills/_shared/issue-tracker.md` existiert und definiert `tracker`-Config-Schema
      (`mode`, optional `remoteToolOverride`), Migration, Modus-/Host-/CLI-Bestimmung,
      Label-Konvention und die kanonischen Issue-/Epic-Body-Formate an genau einer Stelle.
- [x] `skills/sf-review/SKILL.md` bindet den Baustein ein und beschreibt in Phase 1 und 4
      den Remote-Zweig: pro neuem Finding ein Issue, pro Lauf ein neues Epic (nie
      erweitert), inhaltlicher Dedup gegen bestehende Finding-Issues (Signatur, nicht
      R-ID) mit Ausschluss deduplizierter Findings aus dem neuen Epic, kein leeres Epic,
      kein lokaler Report, Finding-Nummerierung aus `memory.json` nur für neu angelegte
      Issues.
- [x] `skills/sf-apply-review/SKILL.md` akzeptiert entweder eine Epic-Issue-Referenz
      (alle Sub-Issues) oder eine Liste konkreter Finding-Issues (nur diese) als Argument,
      liest die Findings frisch vom Tracker, behandelt `wontfix` als ADR, erstellt pro
      umsetzbarem Finding genau einen PR (`Closes #<Sub-Issue>`) und hakt nach
      PR-Erstellung den zugehörigen Epic-Eintrag ab.
- [x] `skills/sf-setup/SKILL.md` enthält den `tracker`-Block im Config-Schema und in
      beiden Presets und fragt `mode` (`local`/`remote`) als zentralen Verhaltensschalter
      ab.
- [x] Der lokale Modus von `sf-review` und `sf-apply-review` bleibt unverändert
      (Markdown-Report, bestehende Commit-Strategien), wenn `tracker.mode` fehlt oder
      `local` ist und keine Issue-Referenz übergeben wird.
- [x] `node build.mjs` verarbeitet den neuen Include und die geänderten Skills fehlerfrei
      und erzeugt die dist-Artefakte, ohne unaufgelöste `{{SKILL:...}}`/` ```include `
      -Platzhalter zu hinterlassen.
- [x] Die README dokumentiert den `tracker`-Block und den Remote-Modus.

## Validierungsplan

- `node build.mjs` ausführen und prüfen, dass die Includes (`issue-tracker`) und
  Platzhalter in `dist/codex/skills/sf-review`, `dist/codex/skills/sf-apply-review` und
  den Claude-Command-Varianten korrekt aufgelöst sind.
- Manuelle Durchsicht der drei geänderten Skills und des neuen Bausteins gegen die
  Akzeptanzkriterien (Modus-Verzweigung vollständig, lokaler Pfad unverändert).
- Trockendurchlauf gegen ein Testrepo mit GitHub und optional Forgejo: `sf-review`
  remote → Finding-Issues + Epic; `sf-apply-review` mit Epic-Issue → PR pro Finding,
  Epic-Checkboxen gesetzt, `wontfix` → ADR. (Manuell, außerhalb dieses Plan-Skills.)

## Annahmen und offene Punkte

- **Annahme:** Der geteilte Baustein wird per ` ```include ` referenziert wie die
  bestehenden `_shared`-Dateien; `build.mjs` benötigt dafür keine Anpassung (Includes
  werden generisch über den Dateinamen aufgelöst).
- **Annahme:** `R-XXXXXXX`-IDs bleiben auch im Remote-Modus die stabile Referenz und
  werden in Issue-Titel und -Body geführt; `memory.json` bleibt im Haupt-Repo die Quelle
  der Nummerierung.
- **Annahme:** „Abhaken nach Abarbeitung" meint nach **PR-Erstellung** (nicht erst nach
  Merge); der PR schließt das Sub-Issue via `Closes #…` beim Merge automatisch.
- **Annahme:** Der PR-Basis-Branch und die Branch-Namensbildung im Remote-Apply-Review
  stützen sich auf den bestehenden `worktree`-Config-Block (`baseBranch`, `branchPrefix`);
  ein eigener Config-Zweig für Apply-Review-PRs wird nicht eingeführt.
- **Offen (bewusst als Annahme dokumentiert):** Exakte `tea`-Flagnamen können je
  Version abweichen; der Baustein verweist wie `{{SKILL:sf-pr}}` auf Prüfung gegen die
  installierte Version statt feste Flags festzuschreiben.

## Testergebnisse

**Datum:** 2026-07-05

Dieses Repository hat kein Test- oder Typecheck-Framework; die Validierungsfläche sind
der Build und der Formatter (`package.json`-Scripts `build` und `agent:check`).

| Prüfung                                   | Ergebnis                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| `node build.mjs`                          | grün (15 Skills, 11 Agents für Codex und Claude Code gebaut)             |
| Include-/Platzhalter-Auflösung in `dist/` | grün (keine unaufgelösten ` ```include `/`{{SKILL:}}`/`{{AGENT:}}` mehr) |
| `pnpm run agent:check` (`oxfmt --check`)  | grün (alle 103 Dateien korrekt formatiert)                               |
| ASK-Block-Kompilierung (Codex + Claude)   | grün (neue `Tracker`-Abfragen in `review` und `setup` korrekt gerendert) |

## Review-Findings

**Datum:** 2026-07-05
**Reviewer:** Selbst-/Konsistenz-Review (kein Code-Reviewer — reine Markdown-Skill-Texte)

### Zusammenfassung

| Status                  | Anzahl |
| ----------------------- | -----: |
| Behoben                 |      2 |
| Offen / Nicht umgesetzt |      0 |

Zwei Konsistenzbefunde wurden während der Umsetzung direkt behoben: ein ungültiger
Ordered-List-Marker (`2b.`) in `sf-review` Phase 1 sowie eine Include-Platzierung, die
die `###`-Unterabschnitte der Memory-Sektion fälschlich unter den Tracker-Abschnitt
verschachtelt hätte (Include ans Sektionsende verschoben). Keine offenen Findings.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       1 |
| Security    |        0 |       0 |       1 |
| Datenschutz |        0 |       0 |       1 |
| Fehlerfälle |        0 |       0 |       0 |
| Testbarkeit |        0 |       0 |       0 |
| Scope       |        0 |       1 |       0 |
| Wartbarkeit |        0 |       0 |       0 |

### Befunde

- **Scope, Wichtig:** Die README-Änderung liegt außerhalb der drei Kern-Skills. Sie ist
  bewusst in „Betroffene Dateien" aufgenommen, damit der `/build`-Lauf die Config-Doku
  konsistent hält; sie ist optional trennbar, falls der Umsetzungslauf sie separat halten
  will. Eingearbeitet: als eigener, klar abgegrenzter Punkt geführt.
- **Architektur, Hinweis:** Der geteilte Baustein bündelt bewusst Config, CLI-Erkennung
  und Body-Formate, um Duplikation zwischen `sf-review` und `sf-apply-review` zu
  vermeiden — konsistent mit `worktree-integration.md`.
- **Security, Hinweis:** Der Remote-Modus führt externe Prozesse (`gh`/`tea`) und
  Netzwerkzugriffe (Issue-/PR-Erstellung) neu ein. Es werden keine Secrets in der Config
  gespeichert; Authentifizierung liegt bei den CLIs selbst, wie bei `{{SKILL:sf-pr}}`.
- **Datenschutz, Hinweis:** Finding-Inhalte (inkl. Datei-Pfaden und Code-Bezügen) werden
  in Issues eines externen Trackers veröffentlicht. Das ist die ausdrücklich gewünschte
  Funktion; der Umsetzungslauf sollte im User-Hinweis klarstellen, dass Findings extern
  sichtbar werden.
