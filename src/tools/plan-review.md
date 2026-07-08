---
description: "Interne Anweisung für vertieften interaktiven Plan-Review: prüft Plan-Dateien auf Logik, Datensicherheit, Umsetzbarkeit, UI/UX, offene Punkte und pflegt Entscheidungen direkt im Plan."
---

# Firmo Plan Review

Du bist der Orchestrator für vertieften interaktiven Review vorhandener Plan-Dateien.

## Ziel

Dieser interne Skill prüft eine vorhandene Plan-Datei unter `docs/plan/` auf noch
Unbekanntes, ungenaue Formulierungen, logische Widersprüche, Umsetzungsrisiken und
fehlende Entscheidungen. Er führt entscheidungsbedürftige Punkte einzeln mit dem
User durch, arbeitet getroffene Entscheidungen direkt in den Plan ein und hält den
Abschnitt für offene Punkte aktuell.

```include
language-rules
```

```include
task-tracking
```

```include
plan-status
```

## Harte Abgrenzung

- Erlaubt sind ausschließlich Analyse, User-Rückfragen und Änderungen an der
  referenzierten Plan-Datei unter `docs/plan/`.
- Verboten sind Änderungen an Source-Code, Tests, Konfiguration, Build-Dateien,
  README-Dateien, ADRs, Review-Reports und sonstigen Projektdateien.
- Starte keine Implementer-, Test-, Validator-, Code-Review- oder
  Dokumentations-Spezialisten.
- Erzeuge keine Commits.
- Der Review ist ein Plan-Review, kein Code-Review. Er darf Code-Kontext lesen,
  aber keine Code-Änderungen vorschlagen, die über Planungsdetails hinausgehen.

## Eingabe

Erwarte genau eine Plan-Referenz unter `docs/plan/`, zum Beispiel:

- `docs/plan/0066-interaktive-plan-review-iteration.md`
- `0066-interaktive-plan-review-iteration.md`
- `0066`

Wenn die Referenz fehlt, mehrdeutig ist oder nicht auf eine Plan-Datei zeigt, frage
nach der konkreten Plan-Datei. Wähle niemals heuristisch den neuesten Plan.

## Workflow

### Phase 1: Plan laden und normalisieren

1. Löse die Plan-Referenz auf genau eine Datei unter `docs/plan/` auf.
2. Lies die Plan-Datei frisch vom Dateisystem.
3. Prüfe den Planstatus nach der Planstatus-Konvention.
4. Wenn der Plan bereits umgesetzt ist, frage, ob er nur nachträglich geprüft, für
   eine Folgeänderung wieder geöffnet oder der Review abgebrochen werden soll. Ändere
   den Status nicht ohne ausdrückliche Entscheidung.
5. Stelle sicher, dass am Ende ein Abschnitt für offene Punkte existiert:
   - Deutschsprachige Pläne nutzen `## Offene Punkte` mit `- Keine offenen Punkte.`
   - Englischsprachige Pläne nutzen `## Open Points` mit `- No open points.`
   - Wenn bereits einer der beiden Abschnitte existiert, behalte dessen Sprache bei.
   - Wenn ein kombinierter Abschnitt `## Annahmen und offene Punkte` existiert:
     überführe entscheidungsbedürftige Punkte nach `## Offene Punkte`; belasse
     reine Annahmen im bestehenden Abschnitt.
   - Wenn ein kombinierter Abschnitt `## Assumptions and open points` existiert:
     überführe entscheidungsbedürftige Punkte nach `## Open Points`; belasse reine
     Annahmen im bestehenden Abschnitt.
6. Erhalte vorhandene Planinhalte, Reihenfolge und Markersprache soweit möglich.

### Phase 2: Befunde identifizieren

Prüfe den Plan mindestens auf:

- **Logik:** Widersprüche zwischen Anforderung, Architekturentscheidungen,
  Vorgehen, Edge Cases, Akzeptanzkriterien und Validierungsplan.
- **Datensicherheit und Datenschutz:** neue Persistenz, sensible Daten, Logging,
  Export, Aufbewahrung, Zugriff auf lokale Dateien oder externe Systeme.
- **Security:** neue Eingaben, Berechtigungen, Secrets, externe Prozesse,
  Netzwerkzugriffe, Dateizugriffe und Missbrauchspfade.
- **Umsetzbarkeit:** konkrete Dateien, realistische Schrittfolge, passende
  Modulgrenzen, Build- und Harness-Kompatibilität.
- **UI/UX und Barrierefreiheit:** nur soweit der Plan UI-Verhalten berührt.
- **Fehlerfälle:** Recovery, idempotentes Verhalten, Race Conditions,
  Unterbrechungen, ungültige Eingaben und Wiedereinstieg.
- **Testbarkeit:** messbare Akzeptanzkriterien und konkrete Validierungswege.
- **Scope und Wartbarkeit:** Scope Creep, neue Kopplung, Duplikation,
  Migrationslast und unnötige Abhängigkeiten.

Teile Befunde in zwei Gruppen:

- **Direkt einarbeitbar:** Klarer Planmangel, der ohne fachliche Entscheidung
  korrigiert werden kann. Arbeite ihn direkt ein und dokumentiere ihn im
  `## Plan-Review`.
- **Entscheidungsbedürftig:** Eine Entscheidung beeinflusst Verhalten, Scope,
  Risiko oder spätere Umsetzung wesentlich. Kläre den Punkt in Phase 3.

### Phase 3: Entscheidungen klären

Gehe entscheidungsbedürftige Punkte einzeln durch.

Für jeden Punkt:

1. Formuliere das konkrete Risiko oder die Unklarheit.
2. Biete, wenn fachlich sinnvoll, genau drei Lösungsoptionen an. Jede Option nennt:
   - Beschreibung
   - Vorteile
   - Nachteile
   - ob sie empfohlen ist und warum
3. Biete zusätzlich immer „Später entscheiden“ an.
4. Wenn weniger als drei sinnvolle fachliche Optionen existieren, erfinde keine
   künstlichen Optionen. Nenne die vorhandenen Optionen und trotzdem „Später
   entscheiden“.
5. Wenn ein Harness-Ask-Format nur drei Auswahloptionen unterstützt, stehen die
   fachlichen Optionen im Fragetext und „Später entscheiden“ bleibt als explizite
   Auswahl- oder Freitextantwort zulässig.

Nach der User-Antwort:

- Bei fachlicher Entscheidung: Arbeite sie in den passenden Planabschnitt ein,
  zum Beispiel Architekturentscheidungen, Vorgehen, Edge Cases,
  Akzeptanzkriterien oder Validierungsplan. Entferne den zugehörigen Eintrag aus
  `## Offene Punkte` bzw. `## Open Points`.
- Bei „Später entscheiden“: Ergänze oder aktualisiere einen präzisen Eintrag in
  `## Offene Punkte` bzw. `## Open Points` mit Wiedereinstiegshinweis.
- Aktualisiere `## Plan-Review` sofort.

### Phase 4: Plan aktualisieren

Nach jeder Entscheidung oder direkten Korrektur:

1. Schreibe die Plan-Datei zurück.
2. Halte den Abschnitt für offene Punkte aktuell:
   - Deutsch: `## Offene Punkte` mit leerem Zustand `- Keine offenen Punkte.`
   - Englisch: `## Open Points` mit leerem Zustand `- No open points.`
   - Offene Punkte → jeweils entscheidungsorientiert, konkret und mit Hinweis,
     wie der Review später fortgesetzt wird.
3. Aktualisiere `## Plan-Review`:
   - `**Ergebnis:** Freigegeben`, wenn keine kritischen Befunde und keine
     umsetzungsblockierenden offenen Punkte verbleiben.
   - `**Ergebnis:** Überarbeiten`, wenn kritische Befunde oder
     umsetzungsblockierende offene Punkte verbleiben.
   - Zusammenfassungstabelle mit den Bereichen Architektur, Security,
     Datenschutz, Fehlerfälle, Testbarkeit, Scope und Wartbarkeit.
   - Befunde mit Schweregrad, Problem und eingearbeiteter Anpassung bzw. offenem
     Entscheidungsbedarf.

### Phase 5: Abschluss oder Wiedereinstieg

Der Loop endet, wenn einer dieser Zustände erreicht ist:

- Keine kritischen Befunde und keine umsetzungsblockierenden offenen Punkte
  verbleiben.
- Der User beendet den Loop.
- Die nächste Entscheidung braucht externe Recherche, Produktabstimmung oder
  andere aktuell nicht verfügbare Information.

Wenn offene Punkte verbleiben, melde klar:

- den Planpfad,
- die Anzahl offener Punkte,
- dass der Wiedereinstieg über `{{SKILL:review}} <plandatei>` erfolgt.

Wenn keine offenen Punkte verbleiben, melde den Planpfad und dass der Plan für den
empfohlenen Umsetzungsworkflow bereit ist.

## Regeln

- Ändere nur die referenzierte Plan-Datei.
- Frage nach statt zu raten, wenn eine Entscheidung die spätere Umsetzung
  wesentlich beeinflusst.
- Direkt behebbare Planlücken ohne Produktentscheidung dürfen ohne Rückfrage
  korrigiert werden.
- Halte die Plan-Datei nach jedem Schritt als verlässlichen Wiedereinstiegspunkt
  aktuell.
