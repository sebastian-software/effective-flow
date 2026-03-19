# 0009: Review-Report-Hinweise bei umgesetzten Findings

## Anforderung

Wenn mit `$sf-build-feature`, `$sf-fix` oder `$sf-refactor` ein Finding aus einer `review-report-*.md` Datei gelöst wird, soll in der betroffenen Report-Datei ein kurzer Hinweis ergänzt werden. Zusätzlich soll `$sf-review` dieses Muster explizit erlauben.

## Architekturentscheidungen

- **Leichtgewichtiger Rückverweis statt neuem Report-Schema**: Bestehende Review-Reports bleiben gültig; gelöste Findings erhalten nur einen kurzen Zusatzhinweis direkt am Finding.
- **Workflow-spezifischer Statushinweis**: Der Hinweis nennt mindestens Datum und auslösenden Workflow, zum Beispiel `Umgesetzt am YYYY-MM-DD via $sf-fix`.
- **Nur tatsächlich adressierte Findings aktualisieren**: Es werden keine pauschalen Sammelvermerke für einen gesamten Report verlangt.
- **Report-Format bleibt bei `$sf-review` verankert**: `$sf-review` definiert weiterhin das Berichtsformat und erlaubt die späteren Statushinweise explizit.

## Betroffene Dateien

| Datei | Beschreibung |
|---|---|
| `skills/sf-build-feature/SKILL.md` | Neue Regel und Review-/Abschluss-Schritte für kurze Hinweise in bestehenden Review-Reports |
| `skills/sf-fix/SKILL.md` | Neue Regel und Abschluss-Schritt für kurze Hinweise in bestehenden Review-Reports |
| `skills/sf-refactor/SKILL.md` | Neue Regel und Review-Schritt für kurze Hinweise in bestehenden Review-Reports |
| `skills/sf-review/SKILL.md` | Berichtsformat um Erlaubnis für nachträgliche Statushinweise ergänzt |

## Implementierungsdetails

Die drei umsetzenden Workflows erkennen referenzierte `review-report-*.md` Dateien als Eingabekontext und ergänzen nach erfolgreicher Bearbeitung eines Findings einen kurzen Vermerk direkt am betroffenen Finding. Der Hinweis bleibt bewusst knapp und dient der Nachvollziehbarkeit im bestehenden Report statt einer separaten Tracking-Struktur.

`$sf-review` wurde nicht so erweitert, dass der Bericht schon initial Statusfelder erzwingen muss. Stattdessen erlaubt die Doku eine spätere, minimale Ergänzung durch die ausführenden Workflows.

## Testergebnisse

Keine Laufzeit-Tests erforderlich, da nur Skill-Dokumentation und Plan-Dokumentation angepasst wurden.

## Review-Findings und deren Behebung

| Finding | Schweregrad | Status |
|---|---|---|
| Rückschreiben in bestehende Review-Reports war in den umsetzenden Workflows nicht beschrieben | Wichtig | Behoben |
| Berichtsformat in `$sf-review` erlaubte spätere Statushinweise nicht explizit | Wichtig | Behoben |
