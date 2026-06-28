# 0019: Review-Findings-Bericht in Plan-Dateien

## Anforderung

Wenn `sf-build-feature` in Phase 7 die Plan-Datei in `docs/plan/` schreibt, soll diese auch einen ausführlichen Bericht aller Review-Findings im Stil des `sf-review`-Berichts enthalten. Dadurch kann der Entwickler später direkt an der Plan-Datei prüfen, welche Findings beim Feature aufgetreten sind, welche behoben wurden und welche offen blieben — ohne eine separate Review-Report-Datei suchen zu müssen.

## Architekturentscheidungen

- **Nur `sf-build-feature` betroffen:** `sf-fix` und `sf-refactor` bleiben unverändert. Diese Workflows schreiben aktuell keine Plan-Datei.
- **Lokale Finding-IDs (`F1`, `F2`, ...):** Keine Schreibrechte auf `.sf-memory.json` notwendig, IDs gelten nur innerhalb eines Workflow-Laufs. Konsistent zu sf-review-IDs durch klares Präfix (`F` statt `R`) unterscheidbar.
- **Format spiegelt `sf-review`:** Zusammenfassungs-Tabelle (Schweregrad, Komplexität), Detail-Findings mit allen Feldern, Übersprungene Findings (Designentscheidungen). Zusätzlich pro Finding ein `Status`-Feld (Behoben / Offen / Nicht umgesetzt).
- **Alle Schweregrade einschließen:** Anders als der sf-review-Default (nur Kritisch + Wichtig) liefert der Reviewer hier auch Hinweise, damit der Plan-Bericht als vollständiger Audit-Trail dient.
- **Phase 6 erfasst, Phase 7 rendert:** Die Strukturierung der Findings (lokale ID, Komplexität, Komplexität-Aggregation) erfolgt in Phase 6, sodass Phase 7 die Daten unverändert in die Plan-Datei übernehmen kann.
- **Edge Cases per Regel und Inline-Kommentar:** Konditionale Sektionen (Begründung bei Nicht-Umsetzung, Übersprungene Findings) werden sowohl im Template-Body per HTML-Kommentar als auch in einer separaten Regelliste markiert, um LLM-Mehrdeutigkeit zu reduzieren.

## Betroffene Dateien

| Datei                                         | Beschreibung                                                                                                                                                                                                      |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/sf-build-feature/SKILL.md`            | Phase 6 erweitert um lokale Finding-IDs, Komplexität-Aggregation und expliziten Reviewer-Auftrag (alle Schweregrade); Phase 7 erweitert um detailliertes `## Review-Findings`-Template plus Regeln für Edge Cases |
| `docs/plan/0019-plan-file-review-findings.md` | Diese Plan-Datei — erste Anwendung des neuen Findings-Bericht-Formats                                                                                                                                             |

## Implementierungsdetails

### Phase 6 (Review)

- Schritt 1 erweitert: Reviewer-Auftrag fordert ausdrücklich alle Schweregrade (Kritisch + Wichtig + Hinweis), abweichend vom `sf-review`-Default.
- Schritt 3 (neu): Vergabe lokaler Finding-IDs `F1`, `F2`, ... in Aggregations-Reihenfolge.
- Schritt 5 erweitert: Live-Zusammenfassung enthält zusätzlich eine Komplexität-Tabelle, damit Phase 7 die Aggregate ohne Re-Derivation übernehmen kann.
- Schritt 7 erweitert: Strukturierte Erfassung pro Finding um Komplexität ergänzt; Reihenfolge der Felder synchron zum Phase-7-Template.
- Bestehender Nummerierungsfehler (zwei Punkte „8.") korrigiert.

### Phase 7 (Abschluss)

- Schritt 2 Inhaltsliste passt Eintrag „Review-Findings" mit Verweis auf Schritt 3 an.
- Schritt 3 (neu): Vollständiges Template `## Review-Findings` mit:
  - Datum + Reviewer-Header
  - Zusammenfassungs-Tabelle (Schweregrad / Anzahl / Behoben / Offen)
  - Komplexität-Tabelle
  - Findings-Liste mit allen Feldern aus Phase 6 plus konditionaler `Begründung bei Nicht-Umsetzung`-Zeile (per Inline-HTML-Kommentar)
  - Optionale Sektion „Übersprungene Findings (Designentscheidungen)" (per Inline-HTML-Kommentar)
- Schritte 4-6 entsprechen bisherigen Schritten 3-5 (umnummeriert).

### Regeln für den Bericht

- Alle Findings (behoben + offen, Kritisch + Wichtig + Hinweis) übernehmen.
- Lokale Finding-IDs aus Phase 6 wiederverwenden.
- Komplexität-Aggregat aus Phase 6 übernehmen, sonst aus Findings-Liste ableiten.
- `Begründung bei Nicht-Umsetzung` nur bei Status `Nicht umgesetzt`.
- Bei keinen Findings: Sektion mit „Keine Findings gefunden." statt Tabellen.
- Bei keinem Reviewer-Lauf: kurzer Hinweis mit Begründung statt Tabellen.
- Sektion „Übersprungene Findings (Designentscheidungen)" nur, wenn vorhanden.

## Review-Findings

**Datum:** 2026-05-02
**Reviewer:** feature-dev:code-reviewer (extern, da Plugin-Skill-Definition kein klassisches Frontend/Backend ist)

### Zusammenfassung

| Schweregrad | Anzahl | Behoben | Offen |
| ----------- | ------ | ------- | ----- |
| Kritisch    | 0      | 0       | 0     |
| Wichtig     | 5      | 5       | 0     |
| Hinweis     | 1      | 1       | 0     |

| Komplexität | Anzahl |
| ----------- | ------ |
| Leicht      | 5      |
| Mittel      | 1      |
| Schwer      | 0      |

### Findings

#### [F1] Phase-6-Zusammenfassungstemplate hartkodierter `0` in „Offen"-Spalte

- **Schweregrad**: Wichtig
- **Komplexität**: Leicht
- **Bereich**: Konsistenz Phase 6 / Phase 7
- **Datei**: skills/sf-build-feature/SKILL.md:289-294
- **Problem**: Im Live-Zusammenfassungs-Template in Phase 6 stand `| Kritisch | X | X | 0 |`. Der hartkodierte `0` ist während der laufenden Review-Phase irreführend — kritische Findings können noch offen sein, bevor sie behoben werden.
- **Empfehlung**: Hartkodierten `0` durch `X` ersetzen und Hinweis ergänzen, dass die Spalte „Offen" für „Kritisch" vor Abschluss 0 sein muss.
- **Status**: Behoben

#### [F2] Komplexität-Aggregation fehlte in Phase 6, ungetriggert für Phase 7

- **Schweregrad**: Wichtig
- **Komplexität**: Leicht
- **Bereich**: Konsistenz mit sf-review-Berichtsformat
- **Datei**: skills/sf-build-feature/SKILL.md:346-358
- **Problem**: Das Phase-7-Template enthält eine Komplexität-Tabelle, aber Phase 6 hatte keine Anweisung, diese Aggregate zu erzeugen. Ein LLM-Orchestrator könnte die Daten in Phase 7 nicht mehr ableiten oder müsste sie neu berechnen.
- **Empfehlung**: Komplexität-Tabelle ins Phase-6-Live-Template aufnehmen und in Phase-7-Regeln Re-Derivation als Fallback explizit benennen.
- **Status**: Behoben

#### [F3] Feld „Begründung bei Nicht-Umsetzung" unkonditional im Template

- **Schweregrad**: Wichtig
- **Komplexität**: Leicht
- **Bereich**: Klarheit für LLM-Orchestrator
- **Datei**: skills/sf-build-feature/SKILL.md:366-370
- **Problem**: Das Phase-7-Template listet die Zeile `Begründung bei Nicht-Umsetzung` für jedes Finding, ohne Konditional-Marker. Ein LLM würde die Zeile auch bei behobenen oder offenen Findings ausgeben, was Audit-Trail-Müll erzeugt.
- **Empfehlung**: Inline-HTML-Kommentar an die Zeile anhängen und in den Regeln explizit klarstellen: nur bei Status `Nicht umgesetzt`.
- **Status**: Behoben

#### [F4] „Übersprungene Findings (Designentscheidungen)"-Sektion unkonditional im Template

- **Schweregrad**: Wichtig
- **Komplexität**: Leicht
- **Bereich**: Klarheit für LLM-Orchestrator
- **Datei**: skills/sf-build-feature/SKILL.md:374-378
- **Problem**: Die Sektion erschien immer im Template-Body. Die Regel zur Konditionalität stand erst nach dem Template-Block — LLMs folgen tendenziell dem Template-Body wörtlich.
- **Empfehlung**: Inline-HTML-Kommentar direkt vor der Sektion einfügen, damit die Konditionalität co-located mit dem Template-Element erscheint.
- **Status**: Behoben

#### [F5] Reviewer-Scope nicht explizit, Hinweis-Findings könnten gefiltert werden

- **Schweregrad**: Wichtig
- **Komplexität**: Mittel
- **Bereich**: Konsistenz mit sf-review Finding-Scope-Regel
- **Datei**: skills/sf-build-feature/SKILL.md:276
- **Problem**: `sf-review` filtert standardmäßig Hinweis-Findings heraus. Wenn `sf-build-feature` denselben Reviewer-Skill aufruft, könnte dieser Hinweis-Findings ebenfalls weglassen — was dem Anspruch eines vollständigen Audit-Trails widerspricht.
- **Empfehlung**: Phase 6 Schritt 1 erweitern um expliziten Auftrag an den Reviewer, alle Schweregrade zu liefern, abweichend vom sf-review-Standard.
- **Status**: Behoben

#### [F6] Cross-Reference „Plan-Datei-Findings-Bericht unten" mehrdeutig

- **Schweregrad**: Hinweis
- **Komplexität**: Leicht
- **Bereich**: Klarheit für LLM-Orchestrator
- **Datei**: skills/sf-build-feature/SKILL.md:334
- **Problem**: Forward-Referenz „unten" wird von einem LLM, das Listen sequenziell verarbeitet, möglicherweise als Look-Ahead missverstanden.
- **Empfehlung**: Konkrete Schritt-Referenz statt „unten" verwenden.
- **Status**: Behoben
