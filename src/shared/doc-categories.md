## Doku-Kategorien

Finale Dokumente aus dem Doku-Workflow werden ausschließlich in einer der vier festen Kategorien unter `docs/` abgelegt.

| Kategorie       | Verzeichnis             | Zielgruppe                                                        |
| --------------- | ----------------------- | ----------------------------------------------------------------- |
| User-Guide      | `docs/user-guide/`      | End-User der Anwendung                                            |
| Developer-Guide | `docs/developer-guide/` | Entwickler, die am Projekt mitarbeiten                            |
| Operations      | `docs/operations/`      | Betrieb, Deployment, Monitoring, Infrastruktur                    |
| Runbooks        | `docs/runbooks/`        | Step-by-Step-Prozeduren für Incident-Response und Routineaufgaben |

### Dateinamen-Konvention

- topic-basierte Slugs in Kebab-Case, z. B. `installation.md`, `architecture.md`, `restart-database.md`
- kein Datums- oder Nummern-Prefix; das Datums-Slug-Schema (mit erhaltener Legacy-Nummer) ist exklusiv für das Plan-Verzeichnis `<plan.dir>/` (aus `.firmo/config.json` `plan.dir`, Default `docs/plan`)
- Slugs müssen innerhalb ihrer Kategorie eindeutig sein
- Dateiendung immer `.md`

### Verzeichnis-Regeln

- `docs/user-guide/README.md` als kuratierter Einstiegspunkt mit Lese-Reihenfolge ist Pflicht, sobald mindestens ein User-Guide-Dokument existiert.
- `docs/developer-guide/`, `docs/operations/` und `docs/runbooks/` haben standardmäßig keine README.
- In `docs/runbooks/` sind thematische Unterordner erlaubt, z. B. `docs/runbooks/database/restart.md`. Sie sind optional; Pflicht erst, wenn die flache Liste unübersichtlich wird.
- Leere Verzeichnisse werden nicht vorab angelegt. Ein Kategorie-Verzeichnis entsteht erst mit dem ersten Dokument darin.

### Schreibgrenze

- Der Doku-Workflow darf finale Dokumente ausschließlich in diese vier Verzeichnisse und deren Unterordner schreiben.
- Eine bestehende Datei außerhalb dieser Verzeichnisse (z. B. eine Top-Level-`README.md`) darf nur dann geändert werden, wenn sie ausdrücklich in der `Betroffene Dateien`-Tabelle der zugrunde liegenden Plan-Datei genannt ist.

### Plan-Kopfzeilen für Doku-Pläne

Plan-Dateien mit `**Empfohlener Workflow:** Dokumentation` enthalten im Kopf zusätzlich zwei Zeilen direkt unter der Workflow-Empfehlung:

- `**Doku-Kategorie:** user-guide | developer-guide | operations | runbooks`
- `**Ziel-Pfad:** docs/<kategorie>/<topic-slug>.md`

Regeln:

- Beide Zeilen müssen exakt so geschrieben sein, inklusive Fettdruck, Doppelpunkt und Kleinschreibung der Kategorie.
- Die Kategorie in `**Doku-Kategorie:**` muss zum Verzeichnis-Präfix in `**Ziel-Pfad:**` passen.
- Der Ziel-Pfad muss auf eine Datei innerhalb des passenden Kategorie-Verzeichnisses zeigen.
- Beispiel: `**Doku-Kategorie:** runbooks` zusammen mit `**Ziel-Pfad:** docs/runbooks/database/restart.md`.
