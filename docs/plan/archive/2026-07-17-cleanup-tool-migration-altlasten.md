# Cleanup-Tool für Migrations-Altlasten (`/effective-flow cleanup`)

**Planungsstatus:** Umgesetzt
**Quelle:** /firmo plan
**Empfohlener Workflow:** Feature (`/firmo build`)

## Anforderung

Effective Flow braucht ein neues Tool `cleanup`, das die durch Migrationen bewusst hinterlassenen Altlasten aufräumt. Alle bestehenden Migrationen sind **non-destruktiv** und verweisen das eigentliche Löschen ausdrücklich an den User („das Aufräumen überlässt Effective Flow dem User", `effective-flow-dir-migration.md`; „das Aufräumen dem User überlassen", `setup.md`). `cleanup` ist der sanktionierte, user-gesteuerte Pfad, der diese Finalisierung übernimmt.

Ablauf laut Anforderung: **alle veralteten Dateien lesen → prüfen, ob noch etwas übernommen werden soll (vom User bestätigen lassen) → danach die alten Daten löschen.**

Vom User in der Klärung bestätigte Rahmenentscheidungen:

- **Scope (alle vier Altlast-Klassen):** (1) Runtime-Verzeichnisse `.firmo/` und `.sf-plugin/`; (2) enttrackte/Legacy-`config.json` (`.firmo/config.json` bzw. eine Legacy-`config.json` im Runtime-Dir, deren Werte in die Projektsetup-ADR migriert wurden); (3) Legacy-`.gitignore`-Einträge; (4) `firmo-*`-Labels im Remote-Issue-Tracker.
- **Löschmodell:** git-aware und sicher — Dry-Run-Vorschau zuerst; getrackte Dateien via `git rm` (über Historie wiederherstellbar); ungetrackte/gitignorte Artefakte nur nach expliziter, artefakt-spezifischer Bestätigung; Warnung bei dirty Working Tree; nie ohne Bestätigung löschen.
- **Tool-Name:** `cleanup`, Gruppe „Einrichten & Infos" (neben `setup`).

Begründung der Workflow-Empfehlung: Es entsteht ein **neues, nutzer-sichtbares Tool** samt Doku → **Feature**. Das Tool ist komplementär zur laufenden Rename-Umstellung (siehe [2026-07-16-rename-firmo-to-effective-flow](2026-07-16-rename-firmo-to-effective-flow.md)) und zu `setup`, das die Migrationen non-destruktiv anstößt.

## Architekturentscheidungen

- **Einziger destruktiver Pfad, immer explizit.** Alle Migrationen bleiben non-destruktiv; `cleanup` ist die einzige Stelle, die Altdaten tatsächlich entfernt — ausschließlich nach Dry-Run und expliziter Bestätigung. Das erhält Effective Flows Non-Destruktiv-Linie und macht das Löschen zu einer bewussten, gesonderten Handlung.
- **Reihenfolge-Sicherheit gegen Datenverlust.** Eine Altlast wird erst zur Löschung angeboten, wenn ihr **neues Gegenstück existiert** und der Carry-over abgeschlossen bzw. bewusst verworfen ist: `.firmo/`/`.sf-plugin/` nur löschen, wenn `.effective-flow/` existiert; eine Legacy-`config.json` nur, wenn ihre Werte in der Projektsetup-ADR stehen (oder ausdrücklich verworfen wurden). So kann kein noch nicht übernommener Inhalt verloren gehen.
- **git-aware Löschung mit klarer Tracked/Untracked-Unterscheidung.** Getrackte Artefakte werden via `git rm` entfernt (staged, über die Git-Historie wiederherstellbar). Die Runtime-Verzeichnisse (`.effective-flow/`, `.firmo/`, `.sf-plugin/`) sind gitignored und damit **nicht** über Git wiederherstellbar → ihr physisches Entfernen erfolgt nur nach expliziter, artefakt-spezifischer Bestätigung mit „unwiderruflich"-Warnung. Es wird **kein** Backup-Verzeichnis angelegt (bewusste Entscheidung, konsistent zum git-aware-Löschmodell); das Sicherheitsnetz ist die explizite Bestätigung, nicht eine Kopie.
- **Config-Carry-over an `setup` delegieren.** `cleanup` erkennt Werte in einer Legacy-`config.json`, die (noch) nicht in der Projektsetup-ADR stehen, schreibt sie aber **nicht selbst** in die ADR. `setup` bleibt alleiniger Owner der ADR-/AGENTS.md-Marker-Logik: `cleanup` legt die abweichenden Werte offen und übergibt bzw. verweist auf `{{SKILL:setup}}` für die Übernahme, bevor die Alt-`config.json` zur Löschung freigegeben wird. Keine doppelte ADR-Schreiblogik, keine Divergenz.
- **Kein Auto-Commit (analog `setup`).** `cleanup` staged höchstens `git rm`-Änderungen und entfernt ungetrackte Dateien physisch; es committet nicht. Das Committen übernimmt der User oder `{{SKILL:commit}}`.
- **Label-Cleanup über die issue-tracker-Mechanik, nur von Issues lösen.** Nur im Remote-Modus mit authentifiziertem CLI; sonst sauber übersprungen mit Meldung. „Carry-over" bedeutet hier: an jedem Issue `effective-flow-<x>` ergänzen (add-new **vor** remove-old, wie bei der bestehenden `sf-`-Label-Migration), dann `firmo-<x>` **vom Issue lösen**. Die Label-**Definition** im Tracker bleibt bestehen (kein `label delete`), damit geschlossene/historische Zuordnungen nicht über das Nötige hinaus verändert werden.
- **Scope-Grenze: nur aktuelles Projekt.** `cleanup` fasst **keine** globale Skill-Installation an (`~/.claude/skills/effective-flow`/`firmo`, `firmo-*`/`effective-flow-*`-Agents) — das erledigen die Deploy-Skripte (`local-common.sh`). Ebenso werden `.effective-flow/` (das neue Laufzeitverzeichnis) und die Projektsetup-ADR **nie** gelöscht.
- **Idempotent und re-run-sicher.** Sind keine Altlasten vorhanden, ist der Lauf ein No-Op mit klarer Meldung.

## Betroffene Dateien

| Datei                                 | Beschreibung                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/cleanup.md` (neu)          | Tool-Anweisung mit den Phasen Discovery → Carry-over-Prüfung → Bestätigung → Dry-Run → git-aware Löschung → Abschluss. Frontmatter `description` und `catalogHint` (beide strikt doppelt gequotet). Includes: `language-rules`, `task-tracking`, `effective-flow-dir-migration`, `config-migration`, `issue-tracker`. Mehrstufige Bestätigungen als ` ```ask `-Fences. |
| `build.mjs`                           | `cleanup` in genau eine TOOL_GROUPS-Gruppe aufnehmen („Einrichten & Infos", nach `setup`). `EXPOSED_TOOLS` wird daraus abgeleitet; der catalogHint-Guard erzwingt den Frontmatter-Eintrag.                                                                                                                                                                             |
| `src/SKILL.md`                        | Frontmatter-`description`: die aufgezählte Tool-Liste um `cleanup` ergänzen (die sichtbare Katalog-Ausgabe kommt aus `{{TOOL_CATALOG}}` und aktualisiert sich automatisch).                                                                                                                                                                                            |
| `docs/user-guide/tools-einrichten.md` | `cleanup` dokumentieren: Zweck, vierteiliger Scope, Ablauf und Sicherheitsmodell (git-aware, keine stille Löschung, kein Auto-Commit).                                                                                                                                                                                                                                 |
| `docs/user-guide/troubleshooting.md`  | Kurzer Verweis auf `cleanup` beim Thema „Alt-Verzeichnisse/Alt-Labels loswerden".                                                                                                                                                                                                                                                                                      |
| `test/build-lib.test.mjs`             | Nur falls Tool-Listen/-Zählungen hart getestet werden: prüfen und ggf. anpassen; `node --test` grün halten.                                                                                                                                                                                                                                                            |

## Implementierungsdetails

### Vorgehen

1. **Discovery / Bestandsaufnahme.** Vorhandene Altlasten im Projekt erfassen: Runtime-Verzeichnisse `.firmo/`, `.sf-plugin/`; Legacy-`config.json` (in `.firmo/`, `.sf-plugin/` oder als Übergangs-Fallback in `.effective-flow/`); veraltete `.gitignore`-Zeilen (`.firmo/`, `.sf-plugin/`, altes Zwei-Zeilen-Pattern `.effective-flow/*` + `!.effective-flow/config.json`); im Remote-Modus mit CLI die `firmo-*`-Labels. Neues Gegenstück je Klasse bestimmen (`.effective-flow/`, Projektsetup-ADR, `effective-flow-*`). Keine Altlast → No-Op-Meldung und Ende.
2. **Carry-over-Prüfung (lesen + vergleichen).** Runtime-Dirs: Dateien, die im Legacy-Verzeichnis vorhanden, aber in `.effective-flow/` fehlen (oder abweichen/neuer sind), als Übernahme-Kandidaten sammeln. Legacy-`config.json`: parsen und jeden gesetzten Wert gegen die Projektsetup-ADR abgleichen; nicht abgebildete Werte als Kandidaten. `.gitignore`/Labels: kein Datei-Carry-over (Labels: siehe add-before-remove).
3. **Bestätigung Carry-over.** Kandidaten dem User vorlegen (gruppiert, mit „alle übernehmen"/Einzelwahl). Bestätigtes übernehmen: Runtime-Datei nach `.effective-flow/` kopieren; fehlendes `effective-flow-<x>`-Label am Issue ergänzen. Abweichende Config-Werte **nicht** selbst in die ADR schreiben, sondern offenlegen und an `{{SKILL:setup}}` übergeben/verweisen (Owner der ADR-Logik). Abgelehntes bleibt zur Löschung.
4. **Dry-Run-Vorschau.** Genau auflisten, was entfernt wird: Verzeichnisse, Dateien, `.gitignore`-Zeilen, Labels. Je Artefakt tracked/untracked/ignored kennzeichnen; bei dirty Working Tree warnen.
5. **Bestätigung + git-aware Löschung.** Explizite, artefakt-klassen-weise Bestätigung. Getrackte via `git rm` (staged, kein Commit); gitignorte/ungetrackte Verzeichnisse physisch entfernen — nur nach ausdrücklicher „unwiderruflich"-Bestätigung, ohne Backup. Labels: `effective-flow-<x>` ergänzen, dann `firmo-<x>` **vom Issue lösen** (Label-Definition bleibt bestehen). `.gitignore` normalisieren (nur eindeutig veraltete Zeilen; `.effective-flow/` bleibt ignoriert; Fremdzeilen unangetastet).
6. **Abschluss.** Bericht: was übernommen, was gelöscht, was verbleibt; dass kein Commit erstellt wurde (ggf. gestaged); Hinweis auf `{{SKILL:commit}}`.

### Edge Cases

- **Kein Git-Repo:** Tracked-Klassifikation entfällt; alles gilt als physisch und wird nur nach Bestätigung entfernt.
- **`.effective-flow/` fehlt (Migration noch nicht gelaufen):** `cleanup` migriert nicht selbst (das tun die config-lesenden Tools); es warnt und bietet an, den Runtime-Dir erst nach Carry-over zu entfernen, oder verweist auf einen normalen Tool-Lauf, der die Migration auslöst. Kein Löschen ohne existierendes Gegenstück.
- **Ungültiges JSON in Legacy-`config.json`:** nicht als Carry-over-Quelle nutzbar; Datei nur nach ausdrücklicher Bestätigung löschen (kein stiller Verlust), Pfad und Fehler melden.
- **Remote-Label-Abbruch mitten im Umzug:** add-`effective-flow-` vor remove-`firmo-` lässt kein Issue unklassifiziert; Wiederholung ist idempotent.
- **Local-Modus / kein CLI:** Label-Cleanup sauber überspringen mit Meldung, restliche Klassen normal abarbeiten.
- **Re-Run:** ohne verbliebene Altlasten No-Op.

## Akzeptanzkriterien

- [ ] `src/tools/cleanup.md` existiert mit gültigem, strikt doppelt gequotetem `description` und `catalogHint`; `node build.mjs` läuft grün (catalogHint- und Gruppen-Guards erfüllt).
- [ ] `cleanup` ist in genau einer TOOL_GROUPS-Gruppe registriert und erscheint im generierten Router-Katalog beider Harnesses als `/effective-flow cleanup` bzw. `$effective-flow cleanup`.
- [ ] Der Tool-Ablauf umfasst nachweislich: Discovery aller vier Altlast-Klassen → Read/Compare der Carry-over-Kandidaten → User-Bestätigung Carry-over → Dry-Run-Vorschau → explizite Löschbestätigung → git-aware Löschung → Abschlussbericht.
- [ ] Kein Artefakt wird gelöscht, bevor sein neues Gegenstück existiert und der Carry-over bestätigt bzw. bewusst verworfen ist; es wird nie ohne explizite Bestätigung gelöscht; es wird kein Commit erstellt und kein Backup-Verzeichnis angelegt.
- [ ] Config-Carry-over wird nicht von `cleanup` in die ADR geschrieben, sondern offengelegt und an `setup` übergeben; eine Alt-`config.json` wird erst nach Übernahme (oder bewusstem Verwerfen) zur Löschung freigegeben.
- [ ] Label-Cleanup läuft nur im Remote-Modus mit CLI, ergänzt `effective-flow-` vor dem Lösen von `firmo-` vom Issue, lässt die Label-Definition bestehen (kein `label delete`), und wird im Local-Modus/ohne CLI mit Meldung übersprungen.
- [ ] Die Scope-Grenze ist dokumentiert: keine globale Skill-Installation, nur Projektartefakte; `.effective-flow/` und die Projektsetup-ADR werden nie gelöscht.
- [ ] `node --test` und `pnpm agent:check` sind grün; `docs/user-guide/tools-einrichten.md` nennt und beschreibt `cleanup`.

## Validierungsplan

- `node build.mjs` grün; der generierte Router-Katalog beider Harnesses enthält `cleanup` mit seinem catalogHint.
- Include-Auflösung (`effective-flow-dir-migration`, `config-migration`, `issue-tracker`, `language-rules`, `task-tracking`) in Claude- und Codex-Ausgabe für `cleanup` verifizieren.
- `node --test` und `pnpm agent:check` (`oxfmt --check`) grün.
- Trocken-Durchdenken gegen ein Beispielprojekt mit `.firmo/` + `.firmo/config.json` + Legacy-`.gitignore` + `firmo-`-Labels: prüfen, dass Carry-over- und Lösch-Reihenfolge datenverlustfrei sind und das No-Op-Verhalten bei leerem Zustand greift.
- Prosa-Review: Sicherheitsregeln (git-aware, keine stille Löschung, kein Auto-Commit, Reihenfolge-Sicherheit, Scope-Grenze) konsistent mit `setup.md` und `effective-flow-dir-migration.md`.

## Annahmen und offene Punkte

- **Tool-Gruppe:** `cleanup` wird in „Einrichten & Infos" (neben `setup`) eingeordnet. Falls eine eigene Gruppe „Migration/Wartung" gewünscht ist, anpassen.
- **Kein Backup (entschieden):** Für die gitignorten, nicht git-wiederherstellbaren Runtime-Verzeichnisse wird bewusst **kein** Backup-Verzeichnis angelegt; Sicherheitsnetz ist die explizite „unwiderruflich"-Bestätigung (konsistent zum gewählten git-aware-Löschmodell).
- **Codex-Ask-Format:** Die mehrstufigen Bestätigungen werden als ` ```ask `-Fences formuliert; die exakte Frageführung entsteht bei der Umsetzung.
- **`sf-`-Labels:** werden bereits durch die einmalige `sf-`-Label-Migration nach `effective-flow-` gezogen und sind daher **kein** eigenständiges cleanup-Ziel; `cleanup` behandelt nur noch verbliebene `firmo-`-Labels.

## Testergebnisse

Umgesetzt am 2026-07-17 via `/firmo build` (In-Place ohne Delivery, kein Commit).

- `node build.mjs`: **grün** — 17 Tools (inkl. `cleanup`) + 6 intern, 13 Agents, beide Harnesses.
- `node --test`: **grün** — 29/29 (das Fixture `exposedTools` ist fix, daher kein Test-Update für das neue Tool nötig).
- `pnpm agent:check` (`oxfmt --check`): **grün** über alle 176 Dateien.
- Generierter Router-Katalog beider Harnesses enthält `cleanup` mit catalogHint: `/effective-flow cleanup` (Claude) bzw. `$effective-flow cleanup` (Codex); `argument-hint` enthält `cleanup`; die Tool-Datei wird in beide Harnesses ausgeliefert.
- Include-Auflösung in der gebauten `cleanup.md` verifiziert: `language-rules`, `task-tracking`, `effective-flow-dir-migration`, `config-migration`, `issue-tracker` sind inline.

## Review-Findings

**Datum:** 2026-07-17
**Reviewer:** unabhängiger Review (general-purpose) gegen Plan, `setup.md` und die Shared-Bausteine

### Zusammenfassung

| Status                  | Anzahl |
| ----------------------- | -----: |
| Behoben                 |      3 |
| Offen / Nicht umgesetzt |      0 |

- **Wichtig (behoben):** Der Plan listet `config-migration` als Include; er wurde ergänzt. `cleanup` braucht den ADR-Config-Locator und das Tabellen-Encoding daraus, um die Projektsetup-ADR zu lokalisieren und Werte zu vergleichen.
- **Wichtig (behoben):** Datenverlust-Pfad — eine Legacy-`config.json` liegt physisch **in** `.firmo/`; das Löschen des Verzeichnisses (Klasse 1) hätte die Config-Carry-over-Sperre (Klasse 2) umgangen. Kopplung ergänzt (Phase 4 Schritt 5, Phase-5-Löschschritt-Voraussetzung und Regeln): ein Runtime-Verzeichnis ist erst löschbar, wenn eine enthaltene Legacy-`config.json` übernommen oder bewusst verworfen ist.
- **Hinweis (behoben):** Frontmatter-Typografie `„unwiderruflich\"` → `„unwiderruflich"` vereinheitlicht.

Kein Commit erstellt (In-Place ohne Delivery); die Änderungen liegen unversioniert im Arbeitsbaum zur Durchsicht.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       1 |
| Security    |        0 |       0 |       0 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       2 |       0 |
| Testbarkeit |        0 |       0 |       1 |
| Scope       |        0 |       2 |       0 |
| Wartbarkeit |        0 |       0 |       1 |

### Befunde

- **Fehlerfälle (Wichtig, eingearbeitet):** Löschung vor abgeschlossenem Carry-over bzw. vor existierendem neuem Gegenstück würde Daten unwiederbringlich verlieren. Eingearbeitet als „Reihenfolge-Sicherheit"-Architekturregel und als Akzeptanzkriterium.
- **Fehlerfälle (Wichtig, eingearbeitet):** Remote-Label-Löschung ist nicht über Git wiederherstellbar und asymmetrisch zum git-aware-Modell. Entscheidung des Users: nur `firmo-` **vom Issue lösen**, Label-Definition bleibt bestehen; add-`effective-flow-` vor remove; nur im Remote-Modus mit CLI, sonst übersprungen; explizite Bestätigung.
- **Scope (Wichtig, eingearbeitet):** Abgrenzung zur globalen Skill-Installation nötig, damit `cleanup` nicht die Deploy-Skript-Aufgaben übernimmt oder `.effective-flow/`/ADR löscht. Als Scope-Grenze und Akzeptanzkriterium festgehalten.
- **Scope (Wichtig, eingearbeitet):** Config-Carry-over-Zuständigkeit. Entscheidung des Users: `cleanup` schreibt nicht selbst in die ADR, sondern delegiert an `setup` (Owner der ADR-/Marker-Logik). Als Architekturregel und Akzeptanzkriterium festgehalten.
- **Fehlerfälle (Hinweis, entschieden):** Sicherheitsnetz für gitignorte, nicht git-wiederherstellbare Runtime-Verzeichnisse — Entscheidung des Users: kein Backup-Verzeichnis; Sicherheitsnetz ist die explizite „unwiderruflich"-Bestätigung. Commit-Verhalten — kein Auto-Commit (analog `setup`).
- **Architektur (Hinweis):** Die Altlast-Definition könnte künftig als eigener Shared-Baustein zentralisiert werden, wenn weitere Tools sie brauchen; aktuell nur von `cleanup` genutzt → inline.
- **Testbarkeit (Hinweis):** Ohne Laufzeit-Testsuite wird die Korrektheit über Build-Guards, `node --test` und Prosa-/Dry-Run-Review abgesichert; entspricht der Repo-Konvention.
- **Wartbarkeit (Hinweis):** `cleanup` nutzt bestehende Bausteine (issue-tracker, effective-flow-dir-migration, config-migration) statt eigener Migrationslogik und bleibt so konsistent bei künftigen Änderungen.

## Offene Punkte

- Keine offenen Punkte.
