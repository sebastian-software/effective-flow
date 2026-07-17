## Doku-Kategorien

Finale Dokumente aus dem Doku-Workflow werden ausschließlich in einer der vier festen Kategorien unter `docs/` abgelegt.

| Kategorie       | Verzeichnis             | Zielgruppe                                                        |
| --------------- | ----------------------- | ----------------------------------------------------------------- |
| User-Guide      | `docs/user-guide/`      | End-User der Anwendung                                            |
| Developer-Guide | `docs/developer-guide/` | Entwickler, die am Projekt mitarbeiten                            |
| Operations      | `docs/operations/`      | Betrieb, Deployment, Monitoring, Infrastruktur                    |
| Runbooks        | `docs/runbooks/`        | Step-by-Step-Prozeduren für Incident-Response und Routineaufgaben |

### Vorgegebene Standard-Doku-Struktur

Solange der User bzw. der zugrunde liegende Plan nichts anderes vorgibt, gilt für die
Projektdokumentation diese **Standard-Struktur** aus drei Rollen. Sie ist ein
Prosa-Default: Der Doku-Workflow wendet sie an, wenn keine abweichende Struktur verlangt
wird; ein ausdrücklicher Wunsch des Users (z. B. rein technische README ohne Marketing)
hat immer Vorrang. Es gibt dafür **kein** Config-Feld.

1. **Root-`README.md` – Marketing-Einstieg.** Eine Marketing-Seite komplett aus
   Benutzersicht: Nutzenversprechen zuerst, werbende Sprache erlaubt, kurz gehalten. Sie
   wird vom Marketing-Agenten erstellt (nicht vom sachlichen Doku-Agenten) und endet mit
   genau zwei weiterführenden Links (siehe unten).
2. **Benutzerdokumentation → `docs/user-guide/`.** Komplett aus Benutzersicht: beschreibt
   umfangreich Installation und Benutzung, optional mit FAQ und ähnlichen Ergänzungen.
   Einstieg ist `docs/user-guide/README.md`.
3. **Technische Dokumentation → `docs/developer-guide/`.** Für Entwickler und
   Softwarearchitekten: Entwickler bekommen einen Überblick über die Software,
   Softwarearchitekten können daraus ableiten, ob die Software aus technischer Sicht
   genutzt werden sollte. Einstieg ist `docs/developer-guide/README.md`.

**Zwei-Links-Regel für die Root-README.** Die Root-`README.md` endet mit genau zwei
Links, in dieser Reihenfolge:

- erster Link → `docs/user-guide/README.md` (Benutzerdokumentation)
- zweiter Link → `docs/developer-guide/README.md` (technische Dokumentation)

Ein Link wird nur gesetzt, wenn sein Ziel existiert oder im selben Doku-Lauf miterstellt
wird; sonst wird der Link ausgelassen und als offener Punkt vermerkt, damit keine toten
Links entstehen.

### Dateinamen-Konvention

- topic-basierte Slugs in Kebab-Case, z. B. `installation.md`, `architecture.md`, `restart-database.md`
- kein Datums- oder Nummern-Prefix; das Datums-Slug-Schema (mit erhaltener Legacy-Nummer) ist exklusiv für das Plan-Verzeichnis `<plan.dir>/` (aus `plan.dir` der Effective Flow-Konfiguration/Projektsetup-ADR, Default `docs/plan`)
- Slugs müssen innerhalb ihrer Kategorie eindeutig sein
- Dateiendung immer `.md`

### Verzeichnis-Regeln

- `docs/user-guide/README.md` als kuratierter Einstiegspunkt mit Lese-Reihenfolge ist Pflicht, sobald mindestens ein User-Guide-Dokument existiert.
- `docs/developer-guide/README.md` als kuratierter Einstiegspunkt ist Pflicht, sobald mindestens ein Developer-Guide-Dokument existiert. Er gibt Entwicklern einen Überblick und Softwarearchitekten eine Entscheidungsgrundlage und ist das Ziel des zweiten Links der Root-README (siehe „Vorgegebene Standard-Doku-Struktur“).
- `docs/operations/` und `docs/runbooks/` haben standardmäßig keine README.
- In `docs/runbooks/` sind thematische Unterordner erlaubt, z. B. `docs/runbooks/database/restart.md`. Sie sind optional; Pflicht erst, wenn die flache Liste unübersichtlich wird.
- Leere Verzeichnisse werden nicht vorab angelegt. Ein Kategorie-Verzeichnis entsteht erst mit dem ersten Dokument darin.

### Schreibgrenze

- Der Doku-Workflow darf finale Dokumente ausschließlich in diese vier Verzeichnisse und deren Unterordner schreiben.
- **Ausnahme Root-`README.md`:** Als Marketing-Einstieg der Standard-Doku-Struktur ist die Root-`README.md` ein sanktioniertes Schreibziel des Doku-Workflows und muss dafür nicht in jeder Plan-Tabelle einzeln genannt sein. Sie wird ausschließlich in dieser Marketing-Einstieg-Rolle geschrieben; existiert bereits eine Root-README, wird sie nicht still überschrieben, sondern der Ersatz mit dem User geklärt (analog zur Kollisionsregel für bestehende Ziel-Pfade).
- Jede **andere** bestehende Datei außerhalb dieser Verzeichnisse darf nur dann geändert werden, wenn sie ausdrücklich in der `Betroffene Dateien`-Tabelle der zugrunde liegenden Plan-Datei genannt ist.

### Plan-Kopfzeilen für Doku-Pläne

Plan-Dateien mit `**Empfohlener Workflow:** Dokumentation` enthalten im Kopf zusätzlich zwei Zeilen direkt unter der Workflow-Empfehlung:

- `**Doku-Kategorie:** user-guide | developer-guide | operations | runbooks`
- `**Ziel-Pfad:** docs/<kategorie>/<topic-slug>.md`

Regeln:

- Beide Zeilen müssen exakt so geschrieben sein, inklusive Fettdruck, Doppelpunkt und Kleinschreibung der Kategorie.
- Die Kategorie in `**Doku-Kategorie:**` muss zum Verzeichnis-Präfix in `**Ziel-Pfad:**` passen.
- Der Ziel-Pfad muss auf eine Datei innerhalb des passenden Kategorie-Verzeichnisses zeigen.
- Beispiel: `**Doku-Kategorie:** runbooks` zusammen mit `**Ziel-Pfad:** docs/runbooks/database/restart.md`.
- **Sonderfall Marketing-Einstieg:** Zielt der Doku-Plan auf die Root-`README.md`, wird `**Ziel-Pfad:** README.md` gesetzt und die Zeile `**Doku-Kategorie:**` **entfällt** – die Root-README ist keine der vier `docs/`-Kategorien. Nur in genau diesem Fall darf die Kategorie-Zeile fehlen; die Konsistenzregel „Kategorie passt zum Verzeichnis-Präfix“ bleibt für alle `docs/`-Ziele unverändert.
