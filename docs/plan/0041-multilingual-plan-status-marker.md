# 0041: Mehrsprachiger Plan-Status-Marker (Deutsch + Englisch)

**Planungsstatus:** Umgesetzt
**Quelle:** `/plan`
**Empfohlener Workflow:** Feature (`/build`)

## Anforderung

Der kanonische Plan-Status-Marker im Kopfbereich von Plan-Dateien unter `docs/plan/` soll zusätzlich zur deutschen Form `**Planungsstatus:**` auch die englische Form `**Plan status:**` als gleichwertig akzeptieren. Die zugehörigen Werte erweitern sich entsprechend:

- Deutsch: `Nicht umgesetzt` / `Umgesetzt`
- Englisch: `Not implemented` / `Implemented`

Damit können Pläne wahlweise auf Deutsch oder Englisch verfasst werden, ohne den Status-Detektor in den Workflows zu brechen. Die Workflow-Empfehlung `**Empfohlener Workflow:**` bleibt in dieser Iteration bewusst Deutsch — nur der Status-Marker wird mehrsprachig.

### Begründung der Workflow-Empfehlung

Es handelt sich um neue Funktionalität (Englisch-Erkennung) in der Plan-Konvention sowie in allen Workflow-Skills, die diese Konvention lesen oder schreiben. Daher `/build` als Workflow.

## Architekturentscheidungen

- **Marker bleibt kanonisch eindeutig pro Plan-Datei:** Nur die erste Zeile mit Präfix `**Planungsstatus:**` _oder_ `**Plan status:**` bestimmt den Planstatus. Diese Regel ersetzt die bisherige Einsprach-Regel im Shared-Include.
- **Wertpaare sind fest definiert und nicht erweiterbar:** Akzeptierte Werte sind ausschließlich `Nicht umgesetzt` / `Umgesetzt` (de) und `Not implemented` / `Implemented` (en). Keine weiteren Aliase wie `Open`/`Done` oder `Pending`/`Complete`. Begründung: minimaler Erkennungsaufwand, klare Konvention.
- **Mixed-Form ist ungültig und führt zu „Status unklar“:** Nach Review-Klarstellung gelten nur die vier kanonischen Schlüssel-Wert-Kombinationen. Eine Zeile wie `**Plan status:** Umgesetzt` wird nicht als abgeschlossen erkannt, sondern führt zum Status `unklar`. Damit bleibt `sf-open-plans` konsistent mit `plan-status.md` und `plan-reference-routing.md`.
- **sf-plan fragt aktiv nach der Markersprache:** Beim Erstellen eines neuen Plans fragt `/plan` den User per `AskUserQuestion`, ob der Marker deutsch oder englisch sein soll. Default-Option: Deutsch (bestehende Konvention).
- **Workflow-Abschlüsse erhalten die Originalsprache:** Wenn `/build`, `/docs`, `/fix` oder `/refactor` den Status auf erledigt setzen, ersetzen sie ausschließlich den vorhandenen Marker durch sein eigensprachliches Gegenstück (`Nicht umgesetzt` → `Umgesetzt` bzw. `Not implemented` → `Implemented`).
- **Bestehende Plan-Dateien bleiben unverändert:** Keine Migration vorhandener `docs/plan/`-Dateien nötig. Sie bleiben weiterhin gültig.
- **README dokumentiert beide Formen:** Die Plugin-Doku zeigt beide Markervarianten, damit Nutzer wissen, dass beide Sprachen erlaubt sind.

## Betroffene Dateien

| Datei                                      | Beschreibung                                                                                                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/_shared/plan-status.md`            | Konvention um englischen Marker und Werte erweitern; Detektor-Regel auf „erste Zeile mit Präfix `**Planungsstatus:**` ODER `**Plan status:**`" umstellen.                                                     |
| `skills/_shared/plan-reference-routing.md` | Status-Prüf-Regeln im Routing um Englisch ergänzen; Statuszeilen-Beispiele beidsprachig führen; Status-Update-Hinweis um Sprachenerhalt erweitern.                                                            |
| `skills/sf-open-plans/SKILL.md`            | Klassifikation `Offen` / `Abgeschlossen` / `Status unklar` um englische Werte ergänzen.                                                                                                                       |
| `skills/sf-plan/SKILL.md`                  | Phase 3 (Plan-Erstellung) um Frage zur Markersprache erweitern; Template mit Platzhalter, der je nach Wahl deutsch oder englisch eingesetzt wird; Regelnabschnitt: Akzeptanzkriterien explizit erweitern.     |
| `skills/sf-build/SKILL.md`                 | Statusprüfung in Phase 1 (Plan-Validierung) und Status-Update in Phase 7 (Abschluss) so anpassen, dass beide Sprachen erkannt werden und das Update die Originalsprache erhält.                               |
| `skills/sf-docs/SKILL.md`                  | Status-Update in Phase 4 (Abschluss) analog auf Sprachenerhalt umstellen.                                                                                                                                     |
| `skills/sf-apply-plan/SKILL.md`            | Auflistung offener Pläne in Phase 1 um englische Statuszeile erweitern.                                                                                                                                       |
| `README.md`                                | Doku der Marker-Konvention ergänzen — beide Formen darstellen, kurz erläutern, dass der Status pro Plan-Datei einsprachig verwendet wird; Hinweis, dass `**Empfohlener Workflow:**` weiterhin Deutsch bleibt. |

Nicht angefasst (Designentscheidung):

| Datei                         | Grund                                                                                                                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `skills/sf-fix/SKILL.md`      | Enthält keine direkte Status-Update-Stelle im Abschluss; verwendet `{{INCLUDE:plan-status}}` und `{{INCLUDE:plan-reference-routing}}` und übernimmt die mehrsprachige Konvention damit transitiv. Bestehende Asymmetrie (kein eigenes Status-Update) bleibt unverändert. |
| `skills/sf-refactor/SKILL.md` | Wie `sf-fix`.                                                                                                                                                                                                                                                            |

## Implementierungsdetails

### Vorgehen

1. `skills/_shared/plan-status.md` überarbeiten:
   - Beide Marker als gleichwertig dokumentieren.
   - Werte tabellarisch oder als Aufzählung mit beiden Sprachen.
   - Detektor-Regel: erste Zeile mit Präfix `**Planungsstatus:**` oder `**Plan status:**`.
   - Einsprachigkeit pro Plan-Datei als Empfehlung notieren (Mixed darf erkannt werden, soll aber nicht gezielt erzeugt werden).
2. `skills/_shared/plan-reference-routing.md` analog erweitern:
   - Status-Prüf-Regeln auf beide Marker und beide Wertpaare ausweiten.
   - Hinweis ergänzen: Status-Update erhält die Markersprache.
3. `skills/sf-open-plans/SKILL.md`:
   - Klassifikation auf beide Wertpaare erweitern.
   - „Status unklar“ gilt weiterhin bei fehlendem, doppeltem oder unbekanntem Marker.
4. `skills/sf-plan/SKILL.md`:
   - In Phase 3 vor dem Schreiben der Plan-Datei eine neue `AskUserQuestion` ergänzen, die nach Markersprache fragt (Optionen: Deutsch (Default), Englisch).
   - Template um `{{MARKER_LINE}}`-Erläuterung erweitern (im Plan-Text bleiben beide Beispiel-Marker explizit nebeneinander dokumentiert).
   - Regelabschnitt anpassen: „Setze den kanonischen offenen Planstatus exakt auf `**Planungsstatus:** Nicht umgesetzt` ODER `**Plan status:** Not implemented`."
5. `skills/sf-build/SKILL.md`:
   - Phase 1 Validierung: beide Markerformen als gültig anerkennen.
   - Phase 7 Abschluss: Status-Update so formulieren, dass die vorhandene Markersprache erhalten bleibt.
6. `skills/sf-docs/SKILL.md`:
   - Phase 4 analog zu sf-build, Sprachenerhalt beim Update.
7. `skills/sf-apply-plan/SKILL.md`:
   - Phase 1 Listing der offenen Pläne: beide Markerformen prüfen.
8. `skills/sf-fix/SKILL.md` und `skills/sf-refactor/SKILL.md`:
   - Direkt nach Anpassung verifizieren, ob die spezifischen Skill-Texte ebenfalls Status-Aktualisierungen direkt enthalten oder rein über `{{INCLUDE:plan-status}}` laufen. Wenn direkter Text vorhanden ist, Sprachenerhalt analog ergänzen.
9. `README.md`:
   - Abschnitt „Plan-Dateien verwenden einen stabilen Statusmarker im Kopfbereich“ um zweites Code-Beispiel ergänzen, das die englische Variante zeigt.
   - Erklärungstext um „Marker und Werte können wahlweise auf Deutsch oder Englisch verwendet werden“ ergänzen.
10. `node build.mjs` ausführen und prüfen, dass die generierten Artefakte unter `dist/` die neue Konvention korrekt enthalten.

### Edge Cases

- **Mixed Marker und Werte (z. B. `**Plan status:** Umgesetzt`):** Status `unklar` — explizit als ungültige Mischform behandelt.
- **Mehrere Statuszeilen unterschiedlicher Sprache im selben Plan:** Die zuerst stehende Zeile zählt; weitere werden ignoriert, sind aber unerwünscht und sollen korrigiert werden.
- **Bestehende Pläne ohne Änderung:** Unverändert gültig (deutsche Marker).
- **README erwähnt Marker mehrfach:** Beide Code-Blöcke ergänzt, sodass kein veraltetes Beispiel zurückbleibt.
- **`sf-build` ohne vorhandene Plan-Datei (Fallback):** Bei erstmaliger Plan-Erzeugung im Abschluss verwendet `sf-build` den deutschen Marker als Default — keine Sprachwahl per Frage.

## Akzeptanzkriterien

- [ ] `skills/_shared/plan-status.md` beschreibt sowohl `**Planungsstatus:**` als auch `**Plan status:**` als gleichwertige Marker mit zugehörigen Werten.
- [ ] `skills/_shared/plan-reference-routing.md` prüft Status anhand beider Marker und Wertpaare.
- [ ] `skills/sf-open-plans/SKILL.md` klassifiziert offene Pläne korrekt für beide Markersprachen.
- [ ] `skills/sf-plan/SKILL.md` fragt beim Erstellen eines neuen Plans aktiv nach der Markersprache (`AskUserQuestion`).
- [ ] `skills/sf-build/SKILL.md` aktualisiert beim Abschluss die Markersprache, die in der Plan-Datei vorhanden ist, ohne sie zu wechseln.
- [ ] `skills/sf-docs/SKILL.md` verhält sich analog zum Sprachenerhalt.
- [ ] `skills/sf-apply-plan/SKILL.md` erkennt offene Pläne in beiden Markersprachen.
- [ ] `skills/sf-fix/SKILL.md` und `skills/sf-refactor/SKILL.md` bleiben unverändert; ihre Konsistenz mit der mehrsprachigen Konvention entsteht transitiv über die aktualisierten `{{INCLUDE:plan-status}}` und `{{INCLUDE:plan-reference-routing}}`. Die bestehende Asymmetrie (kein eigenes Status-Update) wird als Out-of-scope dokumentiert.
- [ ] `README.md` zeigt beide Markerformen und nennt explizit, dass die Workflow-Empfehlung weiterhin auf Deutsch bleibt.
- [ ] `node build.mjs` läuft fehlerfrei und erzeugt aktualisierte Artefakte unter `dist/codex` und `dist/claude`.
- [ ] Bestehende Plan-Dateien bleiben unverändert.

## Validierungsplan

- `node build.mjs` ohne Fehler.
- `rg "Planungsstatus|Plan status" skills/` zeigt nur erwartete Stellen.
- Manuelle Sichtkontrolle der überarbeiteten Skill-Texte auf konsistente Beschreibung beider Markersprachen.
- Stichprobe: eine deutsche und eine englische Statuszeile gegen die neue `plan-status.md`-Regel halten und bestätigen, dass beide korrekt klassifiziert werden.
- Stichprobe gegen die Status-Update-Regel: deutsche Statuszeile → `Umgesetzt`; englische Statuszeile → `Implemented`.

## Annahmen und offene Punkte

- Bestätigt: `sf-fix` und `sf-refactor` enthalten weder direkte Marker-Stellen noch Status-Updates. Sie übernehmen die Konvention transitiv über `{{INCLUDE:plan-status}}` und `{{INCLUDE:plan-reference-routing}}`. Bestehende Asymmetrie bleibt out-of-scope.
- Annahme: Es gibt keine maschinelle Statusabfrage außerhalb der Skills (z. B. CI-Scripts), die auf den Marker matcht. Wenn doch, ist eine separate Anpassung dort nötig (nicht Teil dieses Plans).
- Werte wie `Open`/`Done` oder `Pending`/`Complete` werden bewusst nicht akzeptiert. Falls später gewünscht, lässt sich die Konvention erneut erweitern.

## Testergebnisse

| Prüfung                                               | Status                                                |
| ----------------------------------------------------- | ----------------------------------------------------- |
| `node build.mjs` (Codex + Claude)                     | bestanden                                             |
| Markersuche in `dist/` (Plan status / Planungsstatus) | beide Marker in allen relevanten Artefakten vorhanden |
| Stichprobe Statuszeile Deutsch                        | als offen erkannt                                     |
| Stichprobe Statuszeile Englisch                       | als offen erkannt                                     |
| Stichprobe Mixed (`**Plan status:** Umgesetzt`)       | als unklar erkannt — Konvention konsistent            |
| Manuelle Sichtkontrolle Konventionsdokumente          | konsistent                                            |

## Review-Findings

**Datum:** 2026-06-15
**Reviewer:** sf-nodejs-reviewer

### Zusammenfassung

| Status                  | Anzahl |
| ----------------------- | -----: |
| Behoben                 |     10 |
| Offen / Nicht umgesetzt |      0 |

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

- **Hinweis (Fehlerfälle):** Mixed-Marker werden zwar akzeptiert, aber nicht aktiv unterbunden. Wenn ein User versehentlich `**Plan status:** Umgesetzt` schreibt, gilt der Plan als abgeschlossen. Risiko ist gering, weil der User den Marker bewusst setzt; Doku-Hinweis auf konsistente Sprache ist ausreichend.
