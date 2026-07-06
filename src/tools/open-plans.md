---
description: "Listet alle noch nicht umgesetzten Plan-Dateien aus docs/plan/ mit kurzer Zusammenfassung und prüft den kanonischen Planstatus-Marker."
---

# Firmo Open Plans

Du listest offene Implementierungspläne aus `docs/plan/`.

## Ziel

- alle Plan-Dateien mit kanonischem offenem Status finden — sowohl `**Planungsstatus:** Nicht umgesetzt` als auch `**Plan status:** Not implemented`
- pro offenem Plan eine kurze, hilfreiche Zusammenfassung ausgeben
- Pläne mit fehlendem oder unklarem Status nicht als offen ausgeben, sondern separat als „Status unklar" melden
- keine Dateien ändern
- keine Tests, Builds oder Validierungen ausführen

```include
language-rules
```

```include
task-tracking
```

```include
plan-status
```

## Vorgehen

1. Prüfe, ob `docs/plan/` existiert.
2. Lies alle Markdown-Dateien unter `docs/plan/` in numerisch-lexikografischer Reihenfolge.
3. Bestimme pro Datei den Planstatus ausschließlich über die erste Zeile mit Präfix `**Planungsstatus:**` oder `**Plan status:**`.
4. Klassifiziere (beide Markersprachen sind gleichwertig):
   - **Offen:** genau `**Planungsstatus:** Nicht umgesetzt` oder `**Plan status:** Not implemented`
   - **Abgeschlossen:** genau `**Planungsstatus:** Umgesetzt` oder `**Plan status:** Implemented`
   - **Status unklar:** keine Statuszeile, mehrere Statuszeilen oder anderer Wert
5. Ermittle für offene Pläne:
   - Plan-Nummer und Titel aus der ersten H1-Zeile
   - Pfad
   - empfohlener Workflow aus `**Empfohlener Workflow:** ...`
   - bei Doku-Plänen zusätzlich die Doku-Kategorie aus `**Doku-Kategorie:** ...`, falls vorhanden
   - kurze Zusammenfassung aus `## Anforderung`
   - optional wichtigste betroffene Dateien aus `## Betroffene Dateien`, falls kurz genug
6. Ausgabe:
   - Wenn offene Pläne existieren: Tabelle mit `Plan`, `Titel`, `Workflow`, `Kategorie`, `Pfad`, `Kurzfassung`
     - bei nicht-Doku-Plänen zeige in der Spalte `Kategorie` einen Bindestrich
     - bei Doku-Plänen ohne `**Doku-Kategorie:**`-Zeile zeige `unbekannt`
   - Danach eine kurze Liste mit Status-unklaren Plänen, falls vorhanden
   - Wenn mehrere Plan-Dateien dieselbe vierstellige Nummer tragen, weise gesondert darauf hin (diese Dublette verletzt die `Plan-Nummern-Konvention` und sollte über den passenden Workflow aufgelöst werden)
   - Wenn keine offenen Pläne existieren: klare Meldung „Keine offenen Pläne gefunden."

## Zusammenfassungsregeln

- Fasse die Anforderung in einem Satz zusammen.
- Nutze bevorzugt den ersten inhaltlichen Absatz unter `## Anforderung`.
- Wenn der Abschnitt fehlt, nutze den H1-Titel als Fallback.
- Entferne reine Meta-Sätze wie „Verifizierter Code-Kontext:" aus der Kurzfassung.
- Kürze lange Zusammenfassungen auf etwa 160 Zeichen.
- Erfinde keine Inhalte, die nicht in der Plan-Datei stehen.

## Regeln

- Ändere keine Dateien.
- Starte keine Implementierung und keine Validierung.
- Zähle Review-Finding-Status wie `Nicht umgesetzt` oder `Not implemented` nicht als Planstatus.
- Gib Pfade relativ zum Projekt-Root aus.
- Wenn `docs/plan/` fehlt oder keine Markdown-Dateien enthält, melde das knapp.
