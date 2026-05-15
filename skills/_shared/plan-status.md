## Planstatus-Konvention

Plan-Dateien in `docs/plan/` verwenden genau einen kanonischen Statusmarker im Kopfbereich:

- offen: `**Planungsstatus:** Nicht umgesetzt`
- abgeschlossen: `**Planungsstatus:** Umgesetzt`

Regeln:

- Der Statusmarker muss exakt geschrieben werden, inklusive Fettdruck, Doppelpunkt und Groß-/Kleinschreibung.
- Nur die erste Zeile mit Präfix `**Planungsstatus:**` bestimmt den Planstatus.
- Andere Vorkommen von „Nicht umgesetzt" oder „Umgesetzt" in Review-Findings, ADR-Begründungen oder Fließtext zählen nicht als Planstatus.
- Wenn der Marker fehlt, mehrfach vorkommt oder einen anderen Wert enthält, ist der Planstatus unklar. Behandle den Plan dann nicht automatisch als offen oder abgeschlossen.
