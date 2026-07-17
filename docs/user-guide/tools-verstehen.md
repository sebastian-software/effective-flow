# Tool-Referenz: Verstehen, was zu tun ist

Diese Gruppe deckt Analyse und Planung ab – **bevor** Code entsteht. Alle vier Tools sind
reine Lesephasen oder schreiben ausschließlich in dafür vorgesehene Ablagen
(`.effective-flow/investigation/`, `<plan.dir>/` bzw. einen Issue-Kommentar); keines ändert
Source-Code, Tests oder Konfiguration.

`<plan.dir>` ist das Plan-Verzeichnis aus `.effective-flow/config.json` → `plan.dir` (Default
`docs/plan`, siehe [Konfiguration](konfiguration.md)).

## `/effective-flow investigate`

**Zweck:** Kapselt eine reine Diagnose-Phase für Fehler und überraschendes Verhalten. Klärt,
_warum_ sich etwas so verhält bzw. wo die Root Cause liegt, und erzeugt einen Diagnose-Report
– ohne eine Zeile Code zu ändern. Anders als `plan` und `fix` darf `investigate` legitim mit
„kein Fehler, gewolltes Verhalten“ oder „Produktentscheidung nötig“ enden.

**Wann nutzen:** Wenn unklar ist, ob überhaupt ein Fehler vorliegt, oder wenn die Ursache
eines Symptoms erst verstanden werden muss, bevor man festlegt, welcher Umsetzungs-Workflow
passt.

**Typischer Aufruf:** `/effective-flow investigate <Symptombeschreibung>`

**Ein-/Ausgabe:** Eingabe ist die Beschreibung des beobachteten Verhaltens. Ausgabe ist
`.effective-flow/investigation/investigation-YYYY-MM-DD-<slug>.md` mit Symptom, Reproduktion,
Root-Cause-Hypothesen samt Konfidenz, verworfenen Hypothesen und genau einer
Folge-Empfehlung. Investigations-Reports sind immer lokal: Sie werden nie committet und nie
als Issue geführt, auch nicht im Remote-Tracker-Modus.

**Zusammenspiel:** Die Empfehlung routet nach `/effective-flow fix` (Defekt mit klarer Ursache),
`/effective-flow refactor` (Strukturproblem ohne Verhaltensänderung), `/effective-flow build` (fehlende
Funktionalität oder bewusste Verhaltensänderung) oder `/effective-flow docs` (reine
Dokumentationslücke) – inklusive eines copy-paste-baren Folgeaufrufs, der den Report-Pfad
referenziert.

## `/effective-flow plan`

**Zweck:** Erstellt einen umsetzbaren, validierten Implementierungsplan in `<plan.dir>/`,
ohne Code zu erzeugen oder bestehende Implementierungsdateien zu ändern. Klärt offene Fragen
interaktiv mit dem User, bis eine belastbare Grundlage besteht, und empfiehlt den passenden
Umsetzungs-Workflow (Feature, Bugfix, Refactoring oder Dokumentation).

**Wann nutzen:** Bevor eine größere Änderung umgesetzt wird und die Anforderung, ihre
Akzeptanzkriterien oder Architekturentscheidungen noch nicht feststehen.

**Typischer Aufruf:** `/effective-flow plan <Anforderung>`

**Ein-/Ausgabe:** Eingabe ist die Anforderung in natürlicher Sprache. Ausgabe ist
`<plan.dir>/YYYY-MM-DD-<slug>.md` mit Statuszeile (`**Planungsstatus:** Nicht umgesetzt` bzw.
`**Plan status:** Not implemented`), empfohlenem Workflow, Architekturentscheidungen,
betroffenen Dateien, Akzeptanzkriterien, Validierungsplan und einem eigenen
Plan-Review-Abschnitt. Bei Doku-Plänen ergänzt der Kopf `**Doku-Kategorie:**` und
`**Ziel-Pfad:**` gemäß der Doku-Kategorien-Konvention.

**Zusammenspiel:** Der fertige Plan wird später mit `/effective-flow build <plandatei>`,
`/effective-flow fix <plandatei>`, `/effective-flow refactor <plandatei>` oder `/effective-flow docs <plandatei>`
umgesetzt; jedes dieser Tools prüft die Plan-Datei zuerst gegen das Klärungs-Gate. Optional
bietet `plan` direkt im Anschluss einen vertieften interaktiven Plan-Review an; wird er
übersprungen, lässt er sich später über `/effective-flow review <plandatei>` nachholen.

## `/effective-flow open-plans`

**Zweck:** Listet alle noch nicht umgesetzten Plan-Dateien aus `<plan.dir>/` mit kurzer
Zusammenfassung auf und prüft dabei den kanonischen Planstatus-Marker. Ändert keine Dateien
und führt keine Tests, Builds oder Validierungen aus.

**Wann nutzen:** Beim Wiedereinstieg nach einer Pause, um zu sehen, welche Pläne noch offen
sind, oder als Überblick vor der Priorisierung.

**Typischer Aufruf:** `/effective-flow open-plans`

**Ein-/Ausgabe:** Keine Eingabe nötig. Ausgabe ist eine Tabelle (Plan, Titel, Workflow,
Doku-Kategorie, Pfad, Kurzfassung) der offenen Pläne, ergänzt um eine Liste der Pläne mit
unklarem Status (fehlende, mehrfache oder ungültige Statuszeile).

**Zusammenspiel:** Reiner Lesezugriff als Sprungbrett zu `/effective-flow build`, `/effective-flow fix`,
`/effective-flow refactor`, `/effective-flow docs` (je nach empfohlenem Workflow der gelisteten Pläne) oder
`/effective-flow review <plandatei>`.

## `/effective-flow plan-issue`

**Zweck:** Sammelt Issues ein, die `/effective-flow apply` (genauer: der interne
Issue-Umsetzungs-Workflow) wegen fehlender Informationen übersprungen und mit dem Label
`effective-flow-needs-planning` markiert hat. Vervollständigt die Planung je Issue interaktiv nach
derselben Klärungs-Methodik wie `/effective-flow plan` und schreibt das Ergebnis als strukturierten
Kommentar an das Issue zurück. Erzeugt weder Code noch eine Plan-Datei – das Issue bleibt die
einzige Quelle.

**Wann nutzen:** Im Remote-Tracker-Modus, wenn Issues liegen, die für eine autonome Umsetzung
noch zu wenig Information enthalten.

**Typischer Aufruf:** `/effective-flow plan-issue [Issue-Referenz(en)]`

**Ein-/Ausgabe:** Ohne Argument werden alle offenen `effective-flow-needs-planning`-Issues zur Auswahl
gelistet; mit Argument werden die übergebenen Issue-Referenzen (Nummer, `#123`, URL)
verwendet. Ausgabe ist ein Kommentar am Issue mit vervollständigter Anforderung,
Akzeptanzkriterien, betroffenen Bereichen und Annahmen; anschließend wird das Label
`effective-flow-needs-planning` entfernt.

**Zusammenspiel:** Dieses Tool ist inhärent remote und arbeitet immer gegen den
Issue-Tracker der `origin`-Remote (siehe [Remote-Tracker](remote-tracker.md)); der
`tracker.mode`-Umschalter gilt hier nicht. Nach Abschluss kann `/effective-flow apply` das nun geplante
Issue umsetzen.

## Weiterführend

- [Konfiguration](konfiguration.md) – `plan.dir`, `plan.markerLanguage` und weitere Defaults
- [Remote-Tracker](remote-tracker.md) – Issue-Modus, Labels, lokaler vs. Remote-Modus
- [Skill-Discovery](skill-discovery.md) – wie diese Tools Host-Skills zur Analyse heranziehen
- [Tools: Umsetzen](tools-umsetzen.md) – wie Pläne, Reports und Issues umgesetzt werden
