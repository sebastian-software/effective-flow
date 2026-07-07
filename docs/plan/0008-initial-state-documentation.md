# 0008: Initiale Zustandsdokumentation im build-feature Workflow

**Planungsstatus:** Umgesetzt

## Anforderung

Wenn `/build-feature` aufgerufen wird und es noch keinen Plan in `docs/plan/` gibt, soll vor allen Code-Änderungen der aktuelle Zustand in eine erste, initiale Plan-Datei geschrieben werden. Der eigentliche Feature-Plan wird dann als zweite Datei (0002) geschrieben.

## Architekturentscheidungen

- **Platzierung im Workflow:** Neuer konditionaler Abschnitt "Initiale Zustandsdokumentation" zwischen Phase 0 (Intent Gate) und dem Fertig-Protokoll — keine Umnummerierung der bestehenden Phasen nötig
- **Prüflogik:** Prüfe ob `docs/plan/` existiert UND mindestens eine `.md`-Datei enthält. Leeres Verzeichnis zählt als "kein Plan vorhanden"
- **Template-Sprache:** Deutsch, konsistent mit den neueren Plan-Dateien (ab 0003)
- **Wisdom-Integration:** Expliziter Wisdom-Summary-Block nach der initialen Dokumentation, damit Erkenntnisse des frühen Explore-Agents nicht verloren gehen
- **Verweis in Phase 0:** Formulierung "der Abschnitt enthält eigene Prüflogik" statt "(falls zutreffend)" um Mehrdeutigkeit zu vermeiden

## Betroffene Dateien

| Datei                                             | Änderung                                                                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `sf-frontend-workflows/commands/build-feature.md` | Neuer Abschnitt "Initiale Zustandsdokumentation" (Zeilen 31-72), aktualisierter Verweis in Phase 0 Schritt 4 (Zeile 29) |

## Implementierungsdetails

- Der neue Abschnitt wird nur aktiv wenn `docs/plan/` nicht existiert oder keine `.md`-Dateien enthält
- Bei Aktivierung: Explore-Agent erfasst Projektzustand, schreibt `0001-initial-state.md` im bestehenden Plan-Format
- Phase 7 verwendet automatisch die nächste freie Nummer (z.B. 0002)
- Wisdom-Summary wird nach Erstellung der initialen Plan-Datei geschrieben

## Testergebnisse

- Validierung: BESTANDEN (Markdown-Syntax korrekt, JSON valide, Logik konsistent)
- Kein Test-Framework vorhanden (reines Markdown/JSON-Projekt)

## Review-Findings und deren Behebung

| Finding                                                      | Schweregrad | Status                                              |
| ------------------------------------------------------------ | ----------- | --------------------------------------------------- |
| R-001: Template-Format Deutsch/Englisch Inkonsistenz         | Hinweis     | Nicht umgesetzt — passt zur neueren Konvention      |
| R-002: Edge Case fremdes Projekt mit bestehendem docs/plan/  | Hinweis     | Nicht umgesetzt — theoretisch, praktisch irrelevant |
| R-003: Expliziter Fertig-Protokoll-Hinweis für Explore-Agent | Hinweis     | Nicht umgesetzt — generische Regeln decken es ab    |
| R-004: Verweis in Phase 0 Schritt 4 mehrdeutig               | Wichtig     | Behoben — klarere Formulierung                      |
| R-005: Wisdom-Accumulation-Lücke                             | Wichtig     | Behoben — Wisdom-Summary-Block ergänzt              |
