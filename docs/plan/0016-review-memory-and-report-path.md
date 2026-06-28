# 0016: Review-Memory und Report-Pfad

## Anforderung

1. Persistente Memory-Datei `.sf-memory.json` für fortlaufende Finding-Nummerierung
2. Finding-Nummernschema von 3-stellig (R-001) auf 7-stellig (R-0000001) erweitern
3. Review-Report-Speicherort von Projekt-Root nach `docs/review/` verschieben

## Architekturentscheidungen

- **Memory-Datei als JSON:** `.sf-memory.json` im Projekt-Root speichert `{"lastFindingNumber": <number>}`. Minimales Format, maschinenlesbar.
- **Kein .gitignore-Eintrag:** Das jeweilige Projekt entscheidet selbst, ob die Datei versioniert wird.
- **Keine Migration:** Bestehende Review-Reports im Projekt-Root bleiben unverändert, nur neue Reports landen in `docs/review/`.
- **7-stellige Nummern:** Ermöglicht bis zu 9.999.999 Findings ohne Formatwechsel.

## Betroffene Dateien

| Datei                              | Beschreibung                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------- |
| `skills/sf-review/SKILL.md`        | Memory-Logik hinzugefügt, Nummernformat auf 7-stellig, Report-Pfad auf `docs/review/` |
| `skills/sf-apply-review/SKILL.md`  | Report-Suchpfad auf `docs/review/`, R-XXX auf R-XXXXXXX, Hinweis auf Memory-Datei     |
| `skills/sf-build-feature/SKILL.md` | Report-Referenzen auf `docs/review/`                                                  |
| `skills/sf-fix/SKILL.md`           | Report-Referenzen auf `docs/review/`                                                  |
| `skills/sf-refactor/SKILL.md`      | Report-Referenzen auf `docs/review/`                                                  |

## Implementierungsdetails

### Memory-Datei `.sf-memory.json`

- Wird beim Start des Review-Workflows gelesen
- Falls nicht vorhanden: Zähler startet bei 0
- Nach Erstellung des Berichts wird der neue Zählerstand zurückgeschrieben
- Schreibvorgang ist Pflicht vor Workflow-Abschluss

### Finding-Nummerierung

- Format: `R-0000001` (7-stellig, null-gepadded)
- Fortlaufend über alle Review-Sessions hinweg
- Platzhalter in Templates: `R-XXXXXXX`

### Report-Pfad

- Neuer Pfad: `docs/review/review-report-YYYY-MM-DD[-N].md`
- `docs/review/` wird bei Bedarf automatisch erstellt
- Alle 5 Skills referenzieren konsistent den neuen Pfad

## Review-Findings und deren Behebung

| Finding                                  | Schweregrad | Status                                                       |
| ---------------------------------------- | ----------- | ------------------------------------------------------------ |
| Memory-Write Timing ohne Rollback-Schutz | Kritisch    | Behoben: Pflicht-Schreibvorgang vor ERLEDIGT dokumentiert    |
| Git-Tracking nicht explizit dokumentiert | Wichtig     | Behoben: Hinweis "Projekt entscheidet selbst" ergänzt        |
| sf-apply-review ohne Memory-Hinweis      | Wichtig     | Behoben: Regel ergänzt, dass keine neuen IDs vergeben werden |
