## Offene Review-Finding-Reports

Wenn ein Workflow-Review Findings erzeugt, die vor Abschluss nicht direkt behoben werden, schreibe diese offenen Findings zusätzlich in eine Review-Report-Datei unter `.sf-plugin/review/`.

Ziel:

- Offene oder bewusst nicht umgesetzte Findings gehen nicht in langen Plan-Dateien unter.
- `{{SKILL:sf-apply-review}}` kann die Findings später im bekannten Reportformat verarbeiten.
- Die Plan-Datei bleibt Abschlussdokumentation und verweist nur auf den externen Report.

Gilt für Findings mit Status:

- `Offen`
- `Nicht umgesetzt`
- `Nicht umgesetzt (ADR XXX)` oder vergleichbare ADR-Status

Nicht in den externen Report übernehmen:

- Findings mit Status `Behoben`
- Findings, die während des Workflows direkt gefixt wurden
- rein informative Reviewer-Kommentare ohne konkrete Empfehlung

### Report-Pfad

1. Erstelle `.sf-plugin/review/` falls nötig.
2. Wenn der Workflow eine Plan-Datei als Grundlage hat, verwende bevorzugt:
   - `.sf-plugin/review/review-report-YYYY-MM-DD-plan-NNNN.md`
   - bei Kollision: `.sf-plugin/review/review-report-YYYY-MM-DD-plan-NNNN-1.md`, `-2`, ...
3. Wenn keine Plan-Datei als Grundlage existiert, verwende:
   - `.sf-plugin/review/review-report-YYYY-MM-DD-WORKFLOW.md`
   - bei Kollision: `.sf-plugin/review/review-report-YYYY-MM-DD-WORKFLOW-1.md`, `-2`, ...
4. Schreibe oben im Report immer die Herkunft:
   - `**Ursprungsplan:** [Pfad oder „Keiner"]`
   - `**Quell-Workflow:** {{SKILL:sf-build}} / {{SKILL:sf-fix}} / {{SKILL:sf-refactor}}`
   - `**Quell-Review:** [Reviewer-Skill oder Phase]`

### Finding-IDs und Memory

Dieser Report verwendet dieselben globalen Finding-IDs wie `{{SKILL:sf-review}}`.

1. Lies `.sf-plugin/memory.json`, falls vorhanden.
2. Falls die Datei fehlt, starte mit `lastFindingNumber: 0`.
3. Nummeriere neue Findings fortlaufend ab `lastFindingNumber + 1` mit sieben Stellen, z. B. `R-0000021`.
4. Schreibe nach dem Report die höchste vergebene Nummer zurück nach `.sf-plugin/memory.json`.
5. Erhalte vorhandene Felder wie `configMigration` unverändert.
6. Wenn Memory nicht geschrieben werden kann, informiere den User und nenne den Reportpfad trotzdem.

### Reportformat

Verwende das kanonische Bericht-Format aus `{{SKILL:sf-review}}` Abschnitt „Bericht-Format". Dupliziere das Template hier nicht und weiche nicht davon ab.

Zusätzliche Header-Felder für Workflow-Reports:

- Setze direkt unter `**Projekt-Typ:** ...` diese drei Zeilen:
  - `**Ursprungsplan:** [docs/plan/NNNN-...md oder Keiner]`
  - `**Quell-Workflow:** [{{SKILL:sf-build}} / {{SKILL:sf-fix}} / {{SKILL:sf-refactor}}]`
  - `**Quell-Review:** [Reviewer oder Phase]`
- Alle Tabellen und Finding-Blöcke bleiben im `{{SKILL:sf-review}}`-Format.
- Die `## Übersprungene Findings (Designentscheidungen)`-Sektion wird nur ausgegeben, wenn solche Findings vorhanden sind.

Regeln:

- Kritische Findings dürfen nur dann in diesem Report verbleiben, wenn der User ausdrücklich entschieden hat, den Workflow trotz offenem kritischem Finding abzuschließen.
- Bestimme die Aktion wie bei `{{SKILL:sf-review}}`: Defekt → `{{SKILL:sf-fix}}`, Strukturproblem → `{{SKILL:sf-refactor}}`, fehlende Funktionalität oder Schutzmechanismus → `{{SKILL:sf-build}}`, reine Dokumentationslücke → `{{SKILL:sf-docs}}`.
- Trage niemals automatisch etwas in `Entwickler-Anmerkung` ein. Dieses Feld ist ausschließlich für manuelle Notizen des Entwicklers reserviert und bleibt in automatisch erzeugten Reports leer. Wenn ein Finding bewusst nicht umgesetzt wurde und ein ADR existiert, vermerke die ADR-Referenz im `Status`, z. B. `Nicht umgesetzt (ADR 0003)`.
- Gib dem User nach dem Schreiben den Reportpfad aus.
