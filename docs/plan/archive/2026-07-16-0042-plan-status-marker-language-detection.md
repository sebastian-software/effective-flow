# 0042: Auto-Detection der Marker-Sprache in sf-plan

**Planungsstatus:** Umgesetzt
**Quelle:** `/plan`
**Empfohlener Workflow:** Feature (`/build`)

## Anforderung

`sf-plan` fragt aktuell beim Erstellen einer neuen Plan-Datei in Phase 3 _immer_ aktiv nach der Markersprache (Deutsch oder Englisch). Das ist unnötig, wenn bereits Plan-Dateien im Repository existieren und diese eine eindeutige Sprache verwenden.

Der Workflow soll die Markersprache in einer klaren Prioritätsreihenfolge bestimmen: Wenn `.sf-plugin/config.json` einen gültigen Wert für `plan.markerLanguage` enthält, gewinnt diese Vorgabe. Sonst wird die Sprache automatisch aus dem bestehenden `docs/plan/`-Bestand abgeleitet. Erst wenn keine der beiden Quellen eine Antwort liefert, wird der User gefragt. Zusätzlich wird die Entscheidung optional in `.sf-plugin/config.json` persistiert, damit Folge-Läufe konsistent bleiben.

Regeln:

- `.sf-plugin/config.json` enthält `plan.markerLanguage` mit gültigem Wert → diese Vorgabe übernehmen, alles andere überspringen
- sonst ausschließlich deutsche Marker im Bestand → Deutsch automatisch übernehmen
- sonst ausschließlich englische Marker im Bestand → Englisch automatisch übernehmen
- sonst (gemischter Bestand oder kein erkennbarer Marker) → fragen
- nach Frage: User darf entscheiden, ob die Wahl in der Config-Datei gespeichert wird

### Begründung der Workflow-Empfehlung

Das ist eine neue Verhaltensänderung in der Plan-Erstellung — `sf-plan` bekommt eine Detection-Phase plus optionalen Config-Schreib- und Migrationspfad. Daher `/build`.

## Architekturentscheidungen

- **Config-Eintrag gewinnt:** Wenn `.sf-plugin/config.json` einen gültigen `plan.markerLanguage` enthält, ist dieser autoritativ. Detection und Frage werden übersprungen. Begründung: der User hat die Wahl explizit fixiert; das soll respektiert werden, auch wenn der Bestand inzwischen anders aussieht.
- **Detection ist die zweite Quelle:** Ohne Config-Eintrag wird der bestehende Plan-Bestand ausgewertet. Eindeutig deutsch oder eindeutig englisch → Übernahme. Sonst gilt das Ergebnis als nicht eindeutig.
- **Frage nur als letzter Schritt:** Wenn weder Config noch Detection eine Antwort liefern, wird die bestehende `AskUserQuestion` aufgerufen.
- **Optionale Persistenz nach Frage:** Nach der `AskUserQuestion` zur Markersprache stellt `sf-plan` eine zweite Frage, ob die Wahl in `.sf-plugin/config.json` gespeichert werden soll. Default-Option: speichern (bequemer Default, vermeidet wiederholte Rückfragen).
- **Nicht-destruktive Config-Migration bei eindeutiger Detection:** Wenn `.sf-plugin/config.json` existiert, aber den Schlüssel `plan.markerLanguage` noch nicht enthält, und die Detection eindeutig ist, ergänzt `sf-plan` den Schlüssel mit dem erkannten Wert. Andere Felder in der Config bleiben unverändert. Der User wird über die Migration informiert. Wenn die Config-Datei nicht existiert, wird sie nicht nur für diese Migration erzeugt.
- **Config-Schema-Erweiterung minimal halten:** Neue Sektion `plan` mit dem einzigen Schlüssel `markerLanguage`. Werte: `"de"` oder `"en"`. Andere Werte → ignorieren und wie „nicht gesetzt“ behandeln, plus User-Hinweis.
- **Transparenz:** Jede automatische Entscheidung (Config-Übernahme, Detection, Config-Migration) wird mit einer einzeiligen Statusmeldung an den User kommuniziert, damit nichts unsichtbar passiert.
- **Keine Änderung an `sf-build` Phase 7 Fallback:** Der Fall „keine Plan-Datei vorhanden“ bleibt bei deutschem Default; dort existiert kein Detection-Pool und keine andere Quelle.

## Betroffene Dateien

| Datei                                                     | Beschreibung                                                                                                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/sf-plan/SKILL.md`                                 | Phase 3 umstellen: Detection-Schritt, Config-Konsultation als Fallback, `AskUserQuestion` als Letztinstanz, Folgeschritt zur Persistenz, Migration bei eindeutiger Detection. |
| `README.md`                                               | Tabelle der `.sf-plugin/`-Dateien um den neuen Config-Schlüssel `plan.markerLanguage` ergänzen; Default-Config-Beispiel um neue Sektion erweitern.                            |
| `docs/plan/0042-plan-status-marker-language-detection.md` | Diese Plan-Datei.                                                                                                                                                             |

Nicht angefasst (Designentscheidung):

| Datei                                                                                                                                                | Grund                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `skills/sf-build/SKILL.md`                                                                                                                           | Phase-7-Fallback „keine Plan-Datei vorhanden“ hat keinen Detection-Pool und greift nicht auf die Plan-Erstellung von `sf-plan` zurück. Deutscher Default bleibt korrekt. |
| `skills/_shared/plan-status.md`, `plan-reference-routing.md`                                                                                         | Konventionsdokumente; die Detection- und Config-Logik ist `sf-plan`-spezifisch und gehört nicht in die geteilte Konvention.                                              |
| `skills/sf-fix/SKILL.md`, `skills/sf-refactor/SKILL.md`, `skills/sf-docs/SKILL.md`, `skills/sf-apply-plan/SKILL.md`, `skills/sf-open-plans/SKILL.md` | Erstellen keine neuen Plan-Dateien; Markersprache spielt dort nur lesend eine Rolle, und das funktioniert seit 0041 bereits beidsprachig.                                |

## Implementierungsdetails

### Vorgehen

1. In `skills/sf-plan/SKILL.md` Phase 3 vor der bestehenden `AskUserQuestion` einen Config- und Detection-Block einfügen.
2. Schritt-Reihenfolge in Phase 3:
   1. **Config-Konsultation:**
      - Lies `.sf-plugin/config.json`, falls die Datei existiert und syntaktisch valides JSON ist.
      - Wenn `plan.markerLanguage` gesetzt und gültig (`"de"` oder `"en"`): übernimm den Wert als Markersprache, gib eine Statusmeldung aus, z. B. „Markersprache aus `.sf-plugin/config.json` übernommen: Englisch.", überspringe Detection, `AskUserQuestion` und Persistenzfrage.
      - Wenn der Wert ungültig ist: ignoriere ihn, gib einen kurzen Hinweis aus und fahre mit Detection fort.
      - Wenn die Datei nicht lesbar ist: kurzer Hinweis, fahre mit Detection fort.
   2. **Detection aus `docs/plan/`:**
      - Lies alle `.md`-Dateien unter `docs/plan/` (ohne neue Verzeichnisse anzulegen, ohne andere Dateien zu schreiben).
      - Bestimme pro Datei den Planstatus über die kanonische Regel (erste Zeile mit Präfix `**Planungsstatus:**` oder `**Plan status:**` mit gültigem Wert).
      - Zähle Plans mit deutschem Marker und Plans mit englischem Marker.
      - Ergebnis: `de`, `en` oder `nicht eindeutig` (gemischter Bestand oder kein gültiger Marker gefunden).
   3. **Nicht-destruktive Config-Migration bei eindeutiger Detection (nur wenn `.sf-plugin/config.json` existiert):**
      - Lies `.sf-plugin/config.json`.
      - Falls Pfad `plan.markerLanguage` fehlt: ergänze ihn mit dem Detection-Ergebnis, behalte alle anderen Felder unverändert, schreibe die Datei.
      - Informiere den User mit einer Statuszeile, z. B. „Config-Migration: `plan.markerLanguage = de` aus Detection ergänzt."
      - Falls der Schlüssel bereits gesetzt ist: keine Aktion (Config gewann bereits in Schritt 1, dieser Migrationspfad wird unter normalen Umständen gar nicht erreicht — er ist nur relevant, wenn der Wert in Schritt 1 als ungültig verworfen wurde).
   4. **Nutzung der Detection bei eindeutigem Ergebnis:**
      - Verwende die erkannte Sprache als Markersprache der neuen Plan-Datei.
      - Gib eine einzeilige Statusmeldung aus, z. B. „Markersprache aus 12 vorhandenen Plänen erkannt: Deutsch.“
      - Überspringe `AskUserQuestion` und Persistenzfrage.
   5. **`AskUserQuestion` zur Markersprache (nur bei nicht eindeutiger Detection und ohne gültige Config-Vorgabe):**
      - Bleibt strukturell wie bisher (`Marker`-Header, Optionen Deutsch/Englisch).
      - Ergänze in der Frage einen kurzen Hinweis, warum gefragt wird (Mischbestand / kein erkennbarer Marker / Config nicht gesetzt).
   6. **Persistenz nach Frage:**
      - Stelle eine zweite `AskUserQuestion`: „Soll die gewählte Markersprache in `.sf-plugin/config.json` als `plan.markerLanguage` gespeichert werden?"
      - Optionen: `Ja` (Default empfohlen) / `Nein`.
      - Bei `Ja`:
        - Lege `.sf-plugin/config.json` an, falls nötig (nur Sektion `plan` mit `markerLanguage`).
        - Bei bestehender Config: ergänze nicht-destruktiv den Schlüssel.
        - Statusmeldung an User.
3. Den restlichen Phase-3-Ablauf (konsistente Sprachwahl, Beispielblöcke, Template) unverändert lassen.
4. In `README.md` die `.sf-plugin/`-Tabelle und das Default-Config-Beispiel um `plan.markerLanguage` erweitern. Die Beschreibung der Config-Migration (analog zu review/applyReview) explizit erwähnen.
5. `node build.mjs` ausführen und prüfen, dass die generierten Artefakte unter `dist/codex/` und `dist/claude/` die neue Detection-Anleitung enthalten.

### Edge Cases

- **Config gesetzt, Detection unterscheidet sich:** Config gewinnt (autoritativ). Detection und Frage werden übersprungen. Status-Hinweis erwähnt die Quelle, damit der User sieht, dass die Config greift.
- **Config gesetzt mit ungültigem Wert (z. B. `"fr"`):** Wert wird ignoriert, kurzer Hinweis an den User, dann ganz normal Detection-Pfad und ggf. Frage.
- **Config existiert, aber `plan.markerLanguage` fehlt:** Schritt 1 liefert nichts. Detection läuft. Bei eindeutiger Detection wird der Schlüssel via Migration ergänzt.
- **Leeres oder fehlendes `docs/plan/`:** Detection ergibt `nicht eindeutig`. Ohne Config-Vorgabe → Frage.
- **Plan-Dateien existieren, aber alle mit Status „unklar“:** Wie oben — Detection 0/0 → `nicht eindeutig`.
- **Plan-Datei mit Mischform (z. B. `**Plan status:** Umgesetzt`):** Bereits durch Konvention als „unklar“ klassifiziert; zählt nicht.
- **Zwei Statuszeilen unterschiedlicher Sprache in einer Datei:** Nur die erste zählt, konsistent zur Konvention.
- **Detection eindeutig, Config existiert nicht:** Detection wird übernommen; es wird _keine_ neue Config-Datei nur für die Migration erzeugt.
- **`.sf-plugin/config.json` ist syntaktisch defekt:** Schritt 1 fällt durch, Detection läuft normal, Migration entfällt. Kurzer Hinweis an den User.
- **Persistenz fehlschlägt (Schreibfehler):** Statusmeldung an User mit Fehlerursache; der Plan-Lauf bricht deshalb nicht ab.

## Akzeptanzkriterien

- [ ] `skills/sf-plan/SKILL.md` Phase 3 beschreibt die Reihenfolge Config → Detection → `AskUserQuestion`.
- [ ] Ein gültiger `plan.markerLanguage` aus `.sf-plugin/config.json` wird ohne Detection und ohne Frage übernommen.
- [ ] Ein ungültiger Wert in der Config wird ignoriert und führt zu einem klaren Hinweis und Detection-Pfad.
- [ ] Der Detection-Schritt nutzt ausschließlich die erste kanonische Statuszeile pro Datei.
- [ ] Bei ausschließlich deutschen Markern wird die Markersprache automatisch auf Deutsch gesetzt; bei ausschließlich englischen Markern automatisch auf Englisch.
- [ ] Bei eindeutiger Detection und vorhandener `.sf-plugin/config.json` ohne `plan.markerLanguage` wird der Schlüssel nicht-destruktiv ergänzt.
- [ ] Bei nicht eindeutiger Detection und fehlendem Config-Eintrag wird der User per `AskUserQuestion` gefragt.
- [ ] Nach der Frage stellt `sf-plan` eine zweite `AskUserQuestion`, ob die Wahl in `.sf-plugin/config.json` persistiert werden soll.
- [ ] Bei Zustimmung wird die Config (oder ein minimaler neuer Eintrag) angelegt bzw. nicht-destruktiv erweitert.
- [ ] Statusmeldungen erklären jede automatische Entscheidung in einer Zeile.
- [ ] `README.md` dokumentiert den neuen Config-Schlüssel und die Migration.
- [ ] `node build.mjs` läuft fehlerfrei.
- [ ] Bestehende Plan-Dateien bleiben unverändert.
- [ ] `sf-build` Phase 7 Fallback bleibt unverändert (deutscher Default).

## Validierungsplan

- `node build.mjs` ohne Fehler.
- Inspektion `dist/claude/.../commands/plan.md`: Detection-Block, Config-Logik und beide `AskUserQuestion`-Blöcke vorhanden.
- Inspektion `dist/codex/skills/sf-plan/SKILL.md`: analoge Anweisungen als Codex-Freitext.
- Manuelle Stichproben gegen die Anweisungen:
  - Config mit `markerLanguage = "en"` gesetzt, Bestand egal → Config-Übernahme, kein Ask.
  - Config nicht gesetzt, eindeutig Deutsch im Bestand → Detection-Übernahme, kein Ask.
  - Config existiert ohne Schlüssel, eindeutig Englisch im Bestand → Detection-Übernahme + Config-Migration.
  - Config nicht gesetzt, gemischter Bestand → Ask + Persistenzfrage.
  - Config mit ungültigem Wert, leerer Plan-Bestand → Hinweis, Detection erfolglos, Ask + Persistenzfrage.
- Manuelle Validierung der README-Ergänzung anhand der vorhandenen Tabelle und des Default-Beispiels.

## Annahmen und offene Punkte

- Annahme: Eine bestehende `.sf-plugin/config.json` ist im JSON-Format und kann konservativ um Felder erweitert werden, ohne Kommentare oder Reihenfolge zu zerstören. Falls die Config-Datei vom User gerade exotisch formatiert wird, ist eine minimale Strukturänderung beim Schreiben akzeptabel.
- Annahme: Andere Workflows brauchen keine eigene Markersprach-Logik. `sf-plan` ist die einzige Stelle, die neue Plan-Dateien erstellt; alle anderen Skills lesen den Marker nur.

## Testergebnisse

| Prüfung                                                                      | Status    |
| ---------------------------------------------------------------------------- | --------- |
| `node build.mjs` (Codex + Claude)                                            | bestanden |
| Build-Output enthält Schritte 1–6 und beide ASK-Blöcke (Marker + Persistenz) | bestanden |
| Stichprobe: „überspringe Schritte 2 bis 6“ propagiert in `dist/`             | bestanden |
| Stichprobe: Schritt 3 fordert syntaktisch valides JSON                       | bestanden |
| README-Tabelle, Erklärtext und Default-Beispiel ergänzt                      | bestanden |

## Review-Findings

**Datum:** 2026-06-16
**Reviewer:** sf-nodejs-reviewer

### Zusammenfassung

| Status                  | Anzahl |
| ----------------------- | -----: |
| Behoben                 |      6 |
| Offen / Nicht umgesetzt |      1 |
| Positivbefunde          |      3 |

Nicht umgesetzt: F7 (Plan-Datei nutzt Claude-Notation `/build` statt Platzhalter) — bewusste Entscheidung, da Plan-Dateien Anwender-Output sind und konsistent mit Plan 0041 sowie der bisherigen Plan-Datei-Konvention bleiben sollen. Kein ADR notwendig, weil rein dokumentarische Wahl ohne Verhalten.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       0 |
| Security    |        0 |       0 |       0 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       0 |       1 |
| Testbarkeit |        0 |       0 |       0 |
| Scope       |        0 |       0 |       0 |
| Wartbarkeit |        0 |       0 |       0 |

### Befunde

- **Hinweis (Fehlerfälle):** Eine klare Mehrheit (z. B. 28 Deutsch / 2 Englisch) führt weiterhin zum Mischbestand-Pfad statt zur Mehrheitswahl. Risiko minimal, weil die Config dann übernommen oder gefragt wird; in Mischbeständen ist die explizite Entscheidung besser als eine implizite Mehrheit.
