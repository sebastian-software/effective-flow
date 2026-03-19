# 0011: Review-Report-Hinweise mit Checkmark und Endposition

## Anforderung

Wenn `$sf-build-feature`, `$sf-refactor` oder `$sf-fix` ein Finding in einer bestehenden `review-report-*.md` Datei als umgesetzt markieren, soll dieser Hinweis der letzte Eintrag zum Finding sein und einen grünen Haken enthalten, damit er visuell schnell gefunden werden kann.

## Architekturentscheidungen

- **Einheitliches Muster fuer alle umsetzenden Workflows**: Feature-, Refactor- und Fix-Workflow verwenden dieselbe Konvention fuer Umsetzungs-Hinweise in Review-Reports.
- **Endposition pro Finding**: Der Umsetzungs-Hinweis wird explizit als letzter Eintrag am betroffenen Finding gefordert, damit spaetere Leser nicht innerhalb des Findings suchen muessen.
- **Visueller Marker mit `✅`**: Der gruene Haken ist Teil des vorgeschriebenen Formats und dient als schneller visueller Anker in laengeren Review-Reports.
- **Weiterhin knapper Statushinweis**: Trotz Markierung bleibt der Eintrag kurz und nennt mindestens Datum und ausloesenden Workflow.

## Betroffene Dateien

| Datei | Beschreibung |
|---|---|
| `skills/sf-build-feature/SKILL.md` | Rueckverweis-Regeln und Review-Schritt um Endposition und Checkmark erweitert |
| `skills/sf-refactor/SKILL.md` | Rueckverweis-Regeln und Review-Schritt um Endposition und Checkmark erweitert |
| `skills/sf-fix/SKILL.md` | Rueckverweis-Regeln und Abschluss-Schritt um Endposition und Checkmark erweitert |

## Implementierungsdetails

Die bestehenden Regeln fuer Review-Report-Rueckverweise wurden in allen drei Skills praezisiert. Statt eines allgemein formulierten Statushinweises verlangen die Skills nun explizit einen letzten Eintrag direkt am Finding, der mit `✅` beginnt und mindestens Datum sowie Workflow nennt.

## Testergebnisse

Keine Laufzeit-Tests ausgefuehrt, da nur Skill-Dokumentation und Plan-Dokumentation angepasst wurden.

## Review-Findings und deren Behebung

| Finding | Schweregrad | Status |
|---|---|---|
| Umsetzungs-Hinweise in Review-Reports waren in Position und visueller Markierung nicht eindeutig definiert | Wichtig | Behoben |
