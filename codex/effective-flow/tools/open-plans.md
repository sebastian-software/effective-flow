
# Effective Flow Open Plans

Du listest offene Implementierungspläne aus `<plan.dir>/`.

`<plan.dir>` ist das Plan-Verzeichnis aus der Effective Flow-Konfiguration (Projektsetup-ADR) `plan.dir` (Default
`docs/plan`).

## Ziel

- alle Plan-Dateien mit kanonischem offenem Status finden — sowohl `**Planungsstatus:** Nicht umgesetzt` als auch `**Plan status:** Not implemented`
- pro offenem Plan eine kurze, hilfreiche Zusammenfassung ausgeben
- Pläne mit fehlendem oder unklarem Status nicht als offen ausgeben, sondern separat als „Status unklar“ melden
- keine Dateien ändern
- keine Tests, Builds oder Validierungen ausführen

## Sprachregel

- Code, Bezeichner und Tests auf Englisch
- Dokumentationsinhalte auf Deutsch, außer bestehende Doku führt eine andere Sprache fort
- Commit-Messages auf Englisch

Die deutsche Repository-Locale ist **de-DE**.

### Typografie

Locale-spezifische Typografie sichtbarer Prosa – Anführungszeichen, Gedankenstriche,
Umlaute und ß, geschützte Leerzeichen, Zahlen- und Datumsformate – besitzt der zentrale
Skill `locale-typography`. Beim Schreiben oder Bearbeiten sichtbarer deutscher Prosa ist
dessen `de-DE`-Guidance maßgeblich; Effective Flow führt hier bewusst keine zweite
Typografie-Checkliste.

Fehlt der Skill (nicht installiert, `skills.enabled: false` oder via `exclude`
deaktiviert), gilt als minimaler Fallback für deutschen Text: echte Umlaute und ß statt
ASCII-Ersatz (ae, oe, ue, ss), typografische Anführungszeichen „…“ statt gerader und
Halbgeviertstrich – statt Bindestrich.

## Aufgabenverfolgung

Wenn mehrere Aufgaben zu erledigen sind, verwende ein verfügbares TODO- oder Task-Tracking-Tool (z. B. `TaskCreate`/`TaskUpdate`, `TodoWrite` oder ein vergleichbares Tool), um eine Aufgabenliste anzulegen. Setze jede Aufgabe vor Beginn auf „in Arbeit“ und nach Abschluss auf „erledigt“.

Falls kein Task-Tool verfügbar ist, gib dem User stattdessen eine kurze Fortschrittsmeldung nach jedem abgeschlossenen Schritt.

### Wann verwenden

- bei drei oder mehr Teilaufgaben oder Schritten
- bei komplexen Aufträgen mit mehreren Phasen
- wenn der User mehrere Aufgaben gleichzeitig nennt

### Wann nicht verwenden

- bei einer einzelnen, trivialen Aufgabe
- wenn der Auftrag in weniger als drei einfachen Schritten erledigt ist

## Planstatus-Konvention

`<plan.dir>` ist das Plan-Verzeichnis aus der Effective Flow-Konfiguration (Projektsetup-ADR) `plan.dir` (Default
`docs/plan`).

Plan-Dateien in `<plan.dir>/` verwenden genau einen kanonischen Statusmarker im Kopfbereich. Der Marker darf wahlweise auf Deutsch oder auf Englisch geschrieben werden:

- offen (Deutsch): `**Planungsstatus:** Nicht umgesetzt`
- abgeschlossen (Deutsch): `**Planungsstatus:** Umgesetzt`
- offen (Englisch): `**Plan status:** Not implemented`
- abgeschlossen (Englisch): `**Plan status:** Implemented`

Beide Markerformen sind gleichwertig. Pro Plan-Datei wird nur eine Sprache verwendet.

Regeln:

- Der Statusmarker muss exakt wie in den vier kanonischen Beispielen oben geschrieben werden, inklusive Fettdruck, Doppelpunkt sowie Groß-/Kleinschreibung der Marker-Schlüssel und Werte.
- Der Planstatus gilt nur, wenn genau eine Zeile mit Präfix `**Planungsstatus:**` oder `**Plan status:**` vorhanden ist. Mehrere Statuszeilen (auch in unterschiedlichen Sprachen) machen den Planstatus unklar (siehe unten) und sollten korrigiert werden.
- Gültige Wertpaare sind ausschließlich die vier oben genannten Schlüssel-Wert-Kombinationen. Mischformen aus deutschem Schlüssel und englischem Wert oder umgekehrt (z. B. `**Plan status:** Umgesetzt`) gelten **nicht** als gültig.
- Andere Werte wie `Open`/`Done`, `Pending`/`Complete` oder beliebiger Freitext zählen ebenfalls nicht.
- Andere Vorkommen von „Nicht umgesetzt“, „Umgesetzt“, „Not implemented“ oder „Implemented“ in Review-Findings, ADR-Begründungen oder Fließtext zählen nicht als Planstatus.
- Wenn der Marker fehlt, mehrfach vorkommt, einen ungültigen Wert enthält oder eine Mischform aus Schlüssel- und Wert-Sprache verwendet, ist der Planstatus unklar. Behandle den Plan dann nicht automatisch als offen oder abgeschlossen.
- Wenn ein Workflow den Status auf abgeschlossen setzt, bleibt die Markersprache erhalten: ein deutscher Marker wird zu `**Planungsstatus:** Umgesetzt`, ein englischer Marker zu `**Plan status:** Implemented`.

## Vorgehen

1. Prüfe, ob `<plan.dir>/` existiert.
2. Lies alle Markdown-Dateien auf der obersten Ebene von `<plan.dir>/` in lexikografischer Reihenfolge (Datums-Slug-Namen sortieren dadurch chronologisch). Schließe `<plan.dir>/archive/` aus.
3. Bestimme pro Datei den Planstatus über die kanonische Ein-Marker-Regel der Planstatus-Konvention: genau eine Zeile mit Präfix `**Planungsstatus:**` oder `**Plan status:**` und gültigem Wert.
4. Klassifiziere (beide Markersprachen sind gleichwertig):
   - **Offen:** genau `**Planungsstatus:** Nicht umgesetzt` oder `**Plan status:** Not implemented`
   - **Abgeschlossen:** genau `**Planungsstatus:** Umgesetzt` oder `**Plan status:** Implemented`
   - **Status unklar:** keine Statuszeile, mehrere Statuszeilen oder anderer Wert
5. Ermittle für offene Pläne:
   - Titel aus der ersten H1-Zeile (bei migrierten Legacy-Plänen inklusive der dort erhaltenen Nummer, z. B. `# 0030: Titel`)
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
   - Wenn mehrere Plan-Dateien denselben Datums-Slug-Namen tragen, weise gesondert darauf hin (diese Dublette verletzt die `Plan-Datei-Konvention` und sollte über den passenden Workflow aufgelöst werden)
   - Wenn keine offenen Pläne existieren: klare Meldung „Keine offenen Pläne gefunden.“

## Zusammenfassungsregeln

- Fasse die Anforderung in einem Satz zusammen.
- Nutze bevorzugt den ersten inhaltlichen Absatz unter `## Anforderung`.
- Wenn der Abschnitt fehlt, nutze den H1-Titel als Fallback.
- Entferne reine Meta-Sätze wie „Verifizierter Code-Kontext:“ aus der Kurzfassung.
- Kürze lange Zusammenfassungen auf etwa 160 Zeichen.
- Erfinde keine Inhalte, die nicht in der Plan-Datei stehen.

## Regeln

- Ändere keine Dateien.
- Starte keine Implementierung und keine Validierung.
- Zähle Review-Finding-Status wie `Nicht umgesetzt` oder `Not implemented` nicht als Planstatus.
- Gib Pfade relativ zum Projekt-Root aus.
- Wenn `<plan.dir>/` fehlt oder keine Markdown-Dateien enthält, melde das knapp.
