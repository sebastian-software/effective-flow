# 0038: Externe Workflow-Finding-Reports

**Planungsstatus:** Umgesetzt
**Quelle:** $sf-refactor
**Empfohlener Workflow:** Refactoring (`$sf-refactor`)

## Anforderung

Offene oder bewusst nicht umgesetzte Review-Findings aus `sf-build`, `sf-refactor` und `sf-fix` sollen nicht mehr nur in Plan-Dateien untergehen. Stattdessen sollen diese Findings in eine `.sf-plugin/review/review-report-...md`-Datei im Format des `sf-review`-Skills geschrieben werden. Wenn die Umsetzung auf einer Plan-Datei basiert, soll der Report im Dateinamen oder mindestens im Header auf den Ursprungsplan verweisen.

## Architekturentscheidungen

- Eine gemeinsame Include-Datei `skills/_shared/unresolved-review-report.md` definiert Dateinamen, Planreferenz und R-ID-Vergabe, damit `sf-build`, `sf-refactor` und `sf-fix` konsistent bleiben.
- Das konkrete Report-Template bleibt im getesteten `sf-review`-Skill kanonisch; der Shared-Block referenziert dieses Format nur und ergänzt workflow-spezifische Header.
- Externe Reports verwenden globale `R-XXXXXXX`-IDs und aktualisieren `.sf-plugin/memory.json`, analog zu `sf-review`.
- `sf-build` schreibt offene Findings nicht mehr vollständig in die Plan-Datei, sondern hält dort nur eine kompakte Zusammenfassung und den Reportpfad fest.
- `sf-refactor` und `sf-fix` behalten ihre Workflow-Struktur, dokumentieren offene Findings aber strukturiert genug für das gemeinsame Reportformat.

## Betroffene Dateien

| Datei                                                 | Beschreibung                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `skills/_shared/unresolved-review-report.md`          | Gemeinsame Regeln für externe Reports offener Workflow-Findings                                        |
| `skills/sf-build/SKILL.md`                            | Offene Findings in externen Report auslagern, Plan-Datei nur mit Zusammenfassung/Verweis aktualisieren |
| `skills/sf-refactor/SKILL.md`                         | Offene Review-Findings als externe Reports schreiben                                                   |
| `skills/sf-fix/SKILL.md`                              | Offene Verifikations-/Restrisiko-Findings als externe Reports schreiben                                |
| `docs/plan/0038-external-workflow-finding-reports.md` | Plan und Abschlussdokumentation                                                                        |

## Implementierungsdetails

### Vorgehen

1. Gemeinsames Include für offene Workflow-Findings erstellen.
2. Report-Dateinamen mit Planreferenz definieren: `review-report-YYYY-MM-DD-plan-NNNN.md`.
3. Report-Header um `Ursprungsplan`, `Quell-Workflow` und `Quell-Review` ergänzen.
4. R-ID-Vergabe über `.sf-plugin/memory.json` dokumentieren.
5. `sf-build` so ändern, dass offene Findings nicht vollständig in die Plan-Datei kopiert werden.
6. `sf-refactor` und `sf-fix` so erweitern, dass offene Findings strukturiert für den Report vorliegen.
7. Build und Placeholder-Transformation prüfen.

## Akzeptanzkriterien

- [x] `sf-build`, `sf-refactor` und `sf-fix` enthalten die gemeinsame Report-Regel.
- [x] Offene Findings werden als `.sf-plugin/review/review-report-YYYY-MM-DD-plan-NNNN.md` beschrieben, wenn ein Ursprungsplan vorhanden ist.
- [x] Der Report verwendet das kanonische `sf-review`-Format mit `R-XXXXXXX`-IDs.
- [x] Plan-Dateien enthalten bei offenen Findings nur noch eine Zusammenfassung und den Reportpfad.
- [x] Codex- und Claude-Code-Artefakte werden korrekt generiert.

## Validierungsplan

- `node build.mjs`
- `node --check build.mjs`
- `rg -n "\\{\\{INCLUDE:|\\{\\{SKILL:|\\{\\{AGENT:|\\{\\{ASK" dist/codex dist/claude`
- `rg -n "Offene Review-Finding-Reports|review-report-YYYY-MM-DD-plan|lastFindingNumber|Ursprungsplan" dist/codex dist/claude`
- `git diff --check`

## Annahmen und offene Punkte

- Annahme: Behobene Findings müssen nicht zusätzlich in externe Reports, weil sie im Workflow abgeschlossen wurden.
- Annahme: Kritische Findings werden weiterhin vor Abschluss behoben; ein kritisches Finding darf nur nach ausdrücklicher User-Entscheidung offen im Report verbleiben.
- Offener Punkt: Eine spätere Version könnte `sf-apply-review` um spezielle Gruppierung für planbezogene Reports erweitern. Das bestehende Reportformat bleibt bereits kompatibel.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       0 |
| Security    |        0 |       0 |       0 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       0 |       0 |
| Testbarkeit |        0 |       0 |       0 |
| Scope       |        0 |       0 |       0 |
| Wartbarkeit |        0 |       0 |       0 |

### Befunde

- Keine Befunde.

## Testergebnisse

- `node build.mjs` bestanden; erzeugt wurden 11 Codex-Skills, 9 Codex-Agents, 11 Claude-Code-Commands und 9 Claude-Code-Agents.
- `node --check build.mjs` bestanden.
- Placeholder-Scan gegen `dist/codex` und `dist/claude` fand keine untransformierten Platzhalter.
- Gezielte Suche bestätigte die neuen Report-Regeln in den generierten Build-, Refactor- und Fix-Artefakten.
- Der Shared-Block wurde gegen `sf-review` dedupliziert und enthält nur noch Workflow-spezifische Ergänzungen.
- `git diff --check` bestanden.

## Review-Findings

Keine Findings gefunden.
