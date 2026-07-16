# 0018: Finale Validierung in apply-review

**Planungsstatus:** Umgesetzt

## Anforderung

Nach Abschluss aller Delegations-Phasen in `/apply-review` soll eine finale Code-Überprüfung laufen, die projektspezifische Check-Scripts ausführt und alle gefundenen Errors und Warnings behebt.

## Architekturentscheidungen

- **Neue Phase 6:** „Finale Validierung“ zwischen Report-Update (Phase 5) und Zusammenfassung (Phase 7)
- **Fix-Schleife:** Errors und Warnings werden nicht nur gemeldet, sondern behoben und erneut geprüft
- **Optionalität:** Falls kein Validierungs-Script im Projekt vorhanden ist, wird die Phase übersprungen

## Betroffene Dateien

| Datei                             | Beschreibung                                           |
| --------------------------------- | ------------------------------------------------------ |
| `skills/sf-apply-review/SKILL.md` | Neue Phase 6 eingefügt, bisherige Phase 6 wird Phase 7 |

## Implementierungsdetails

Die Phase prüft auf verfügbare Scripts wie `pnpm agent:check`, `pnpm typecheck`, `pnpm lint` und führt diese aus. Bei Fehlern werden diese behoben und die Prüfungen wiederholt, bis alles fehlerfrei ist. Dies fängt Regressionsfehler auf, die einzelne Sub-Agenten bei der Umsetzung von Findings hinterlassen haben.
