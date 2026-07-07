# Apply-Review Cherry-Pick-Konfliktbewertung

**Planungsstatus:** Umgesetzt

## Anforderung

Wenn `sf-apply-review` Worktree-Commits per `git cherry-pick` integriert und ein Konflikt entsteht, soll nicht mehr pauschal beim Benutzer nachgefragt werden. Risikoarme Konflikte sollen nach Untersuchung automatisch gelöst werden. Nur risikoreiche oder unklare Konflikte sollen mit einer kompakten Bewertung an den Benutzer eskaliert werden.

## Architekturentscheidungen

- **Zweistufige Konfliktbehandlung:** Jeder Cherry-Pick-Konflikt wird erst untersucht und als risikoarm oder risikoreich bewertet.
- **Fail-closed bei Unsicherheit:** Unklare Konflikte gelten als risikoreich und werden nicht automatisch gelöst.
- **Eng begrenzter Auto-Resolve:** Automatische Auflösung darf nur konfliktbetroffene Dateien bearbeiten und nur explizit diese Dateien stage-en.
- **Audit-Trail:** Risiko-Level, Auflösungsstrategie und Begründung werden in der Wisdom-Datei protokolliert.
- **Bessere User-Entscheidung:** Bei Eskalation erhält der Benutzer Commit, Branch, Dateien, Konflikttyp, Ursache, Risiko-Begründung und mögliche Optionen.

## Betroffene Dateien

| Datei                             | Beschreibung                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `skills/sf-apply-review/SKILL.md` | Erweitert die Worktree-Cherry-Pick-Integration um Konfliktbewertung, risikoarme Auto-Auflösung und risikobasierte User-Eskalation |

## Implementierungsdetails

Die bisherige Regel „bei Cherry-Pick-Konflikt stoppen und User informieren“ wurde ersetzt durch:

1. Konfliktzustand erfassen:
   - `git status --porcelain`
   - Konfliktdateien
   - Commit, Worktree-Branch und Finding-Zuordnung
   - Konfliktmarker und betroffene Abschnitte
2. Risiko bewerten:
   - risikoarm nur bei kleinen, lokalen, eindeutig kombinierbaren Konflikten
   - risikoreich bei Produktionscode, Tests mit Verhaltensaussage, APIs, Schemas, Migrationen, Lockfiles, Konfiguration oder unklarem Kontext
3. Risikoarme Konflikte automatisch lösen:
   - nur konfliktbetroffene Dateien bearbeiten
   - Konfliktmarker entfernen
   - explizit betroffene Dateien stage-en
   - `git cherry-pick --continue`
4. Risikoreiche oder unklare Konflikte eskalieren:
   - Bewertung und Optionen an den Benutzer ausgeben
   - keine automatische Auflösung ohne Benutzerentscheidung

## Testergebnisse

- `node --check build.mjs`
- `node build.mjs`
- `git diff --check`
- Suche nach der alten pauschalen Cherry-Pick-Abbruchregel

## Review-Findings

**Datum:** 2026-05-05
**Reviewer:** keiner

Keine Reviewer gestartet, weil die Änderung ausschließlich Skill-Orchestrierungsdokumentation betrifft und keine Runtime-Codepfade verändert.
