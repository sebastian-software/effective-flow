## Plan-Referenzen

`<plan.dir>` ist das Plan-Verzeichnis aus `.firmo/config.json` `plan.dir` (Default `docs/plan`).

Wenn der User beim Aufruf eine vorhandene Plan-Datei referenziert, zum Beispiel `<plan.dir>/2024-06-01-feature.md`, `2024-06-01-feature.md`, `0030` (Legacy-Nummer) oder `feature` (Titel-Slug), prüfe den Plan vor der ersten fachlichen Workflow-Phase.

### Referenz auflösen

1. Löse die Referenz auf genau eine Datei unter `<plan.dir>/` **oder** `<plan.dir>/archive/` auf.
2. Erlaubte Formen:
   - vollständiger Pfad, z. B. `<plan.dir>/2024-06-01-feature.md` oder `<plan.dir>/archive/2024-06-01-feature.md`
   - Datums-Slug-Dateiname, z. B. `2024-06-01-feature.md`
   - Legacy-Nummer, z. B. `0030` (primär über die H1 `# 0030: …` aufgelöst, siehe `Plan-Datei-Konvention`, nicht über das Dateinamen-Segment)
   - Titel-Slug, z. B. `feature`
3. Wenn keine Datei passt: melde den Fehler und nenne, dass `{{SKILL:open-plans}}` offene Pläne auflisten kann.
4. Wenn mehrere Dateien passen: frage den User nach der konkreten Datei.

### Status prüfen

1. Lies die Plan-Datei frisch vom Dateisystem.
2. Bestimme den Umsetzungsstatus gemäß der Planstatus-Konvention: genau eine Zeile mit Präfix `**Planungsstatus:**` oder `**Plan status:**` und gültigem Wert; bei fehlender, mehrfacher oder ungültiger Statuszeile ist der Status unklar.
3. Status-Regeln (beide Markersprachen sind gleichwertig):
   - genau eine Statuszeile `**Planungsstatus:** Nicht umgesetzt` oder `**Plan status:** Not implemented` → der Plan kann als Grundlage verwendet werden.
   - genau eine Statuszeile `**Planungsstatus:** Umgesetzt` oder `**Plan status:** Implemented` → frage den User, ob der Plan erneut umgesetzt, nur geprüft oder der Workflow abgebrochen werden soll.
   - fehlender oder widersprüchlicher Status → prüfe, ob `## Testergebnisse` oder `## Review-Findings` vorhanden sind. Wenn ja, behandle den Plan als wahrscheinlich umgesetzt und frage nach. Wenn nein, frage nach, ob der Plan als ungebaute Vorgabe verwendet werden soll.

### Workflow-Empfehlung prüfen

1. Prüfe, ob im Kopfbereich eine Zeile `**Empfohlener Workflow:** ...` vorhanden ist.
2. Bestimme die Empfehlung:
   - Feature oder `{{SKILL:build}}` → `{{SKILL:build}}`
   - Bugfix oder `{{SKILL:fix}}` → `{{SKILL:fix}}`
   - Refactoring oder `{{SKILL:refactor}}` → `{{SKILL:refactor}}`
   - Dokumentation oder `{{SKILL:docs}}` → `{{SKILL:docs}}`
3. Wenn der aktuelle Skill `{{SKILL:apply-plan}}` ist: verwende die Empfehlung als Ziel-Workflow und fahre fort.
4. Wenn die Empfehlung zum aktuellen Workflow passt: fahre fort.
5. Wenn die Empfehlung auf einen anderen Workflow zeigt:
   - gib eine deutlich sichtbare Meldung aus, welcher Workflow empfohlen ist
   - frage nur weiter, wenn der User den Plan ausdrücklich trotzdem mit dem aktuellen Workflow verwenden will
6. Wenn die Empfehlung fehlt oder unklar ist: fahre nach Statusprüfung fort, weise aber auf die fehlende oder unklare Empfehlung hin.

### Offene Punkte prüfen

Die Prüfung auf offene oder ungeklärte Punkte übernimmt das „Klärungs-Gate“
(`apply-clarity-gate.md`), das die umsetzenden Workflows und die Apply-Kette selbst
einbinden. Diese Referenz-Regel dupliziert diese Prüfung nicht separat.

### Nach erfolgreicher Prüfung

- Verwende die Inhalte der Plan-Datei als abgestimmte Grundlage für den aktuellen Workflow.
- Halte in der Wisdom-Datei fest, welche Plan-Datei die Quelle ist und welche Workflow-Empfehlung sie enthält.
- Die Status-Aktualisierung auf abgeschlossen erfolgt erst im Abschluss des umsetzenden Workflows und bewahrt die Markersprache: ein deutscher Marker wird zu `**Planungsstatus:** Umgesetzt`, ein englischer Marker zu `**Plan status:** Implemented`.
