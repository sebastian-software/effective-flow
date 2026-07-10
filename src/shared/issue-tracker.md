## Issue-Tracker-Anbindung (Remote-Modus)

Dieser geteilte Baustein verbindet `{{SKILL:review}}` und `{{SKILL:apply-review}}` mit einem externen Issue-Tracker (GitHub über `gh`, Forgejo über `tea`). Er ist **opt-in** über `.firmo/config.json` und standardmäßig deaktiviert (`local`). Im lokalen Modus verhalten sich beide Skills unverändert – Findings laufen über die Markdown-Report-Datei unter `.firmo/review/`, es werden keine Issues erzeugt und kein CLI aufgerufen.

Er kapselt die **gemeinsamen** Bausteine: das `tracker`-Config-Schema samt Migration, die Modusbestimmung, die Host- und CLI-Erkennung, die Label-Konvention, die kanonischen Issue- und Epic-Body-Formate sowie das Mapping der Tracker-Operationen auf `gh`/`tea`. Die eigentliche Orchestrierung – wann Issues **erstellt** (`{{SKILL:review}}`) und wann sie **gelesen und abgearbeitet** werden (`{{SKILL:apply-review}}`) – bleibt im jeweiligen Skill.

Zusätzlich nutzen `{{SKILL:apply-issues}}` und `{{SKILL:plan-issue}}` diesen Baustein, allerdings nur für die **werkzeug-generische Plumbing**: die Host- und CLI-Erkennung (unten), die Verfügbarkeits-/Auth-Prüfung, das Mapping der Tracker-Operationen auf `gh`/`tea` und die Fehlerfälle. Diese beiden Skills verarbeiten **beliebige** Menschen-Issues statt der von `{{SKILL:review}}` erzeugten Finding-Issues; sie sind **inhärent remote** und werten den `tracker.mode`-Umschalter (local/remote) **nicht** aus – sie brauchen lediglich ein Git-Repository, eine `origin`-Remote und ein authentifiziertes CLI. Die finding-/epic-spezifischen Abschnitte (Issue-Body-Format, Epic-Body-Format, `R-XXXXXXX`-Konvention) gelten nur für `{{SKILL:review}}`/`{{SKILL:apply-review}}`; die Checkbox-Abhak-Mechanik für Epic-Bodys nutzt `{{SKILL:apply-issues}}` bei Container-Issues sinngemäß mit.

### Konfiguration

Der Remote-Modus funktioniert ohne Konfigurationsdatei (dann bleibt er deaktiviert, `local`). Falls `.firmo/config.json` vorhanden ist, darf sie diese Defaults überschreiben:

```json
{
  "tracker": {
    "mode": "local",
    "remoteToolOverride": "auto"
  }
}
```

Fehlende Werte haben diese Defaults:

- `tracker.mode`: `"local"` (Feature aus)
- `tracker.remoteToolOverride`: `"auto"` (Werkzeug automatisch aus der `origin`-URL)

Gültige Werte:

- `tracker.mode`: `"local"`, `"remote"`
- `tracker.remoteToolOverride`: `"auto"`, `"github"`, `"forgejo"`

`remoteToolOverride` ist nur für mehrdeutige Hosts gedacht (z. B. self-hosted GitHub Enterprise, dessen Domain nicht `github.com` enthält). Bei `auto` entscheidet die Host-Erkennung unten.

### Config-Migration

Die Konsolidierung von `.firmo/config.json` (inklusive der `tracker`-Schlüssel) übernimmt zentral der Baustein „Config-Migration“ (`config-migration.md`); dieser Baustein führt keine eigene per-Block-Migration mehr für `tracker` aus. Das `tracker`-Config-Schema oben (Konfiguration, gültige Werte, Modusbestimmung, Erstaufruf-Abfrage) bleibt davon unberührt.

### Modus bestimmen

Bestimme zu Beginn des Laufs den effektiven Modus in dieser Reihenfolge (die erste zutreffende Regel gewinnt):

1. **Argumenttyp:** Der übergebene Argumenttyp überschreibt den Config-Modus für diesen Lauf. Eine Report-Datei (`*.md` unter `.firmo/review/`) erzwingt `local`; eine Issue-Referenz (Issue-Nummer, `#123` oder eine Issue-URL) erzwingt `remote`.
2. **Per-Run-Wunsch des Users:** Verlangt der User ausdrücklich Issue-/Tracker-Arbeit, ist `remote` aktiv; verlangt er ausdrücklich lokale Arbeit („lokal“, „ohne Issues“, „nur Report“), ist `local` aktiv.
3. **Config:** sonst gilt `tracker.mode` aus `.firmo/config.json`.
4. **Erstaufruf-Abfrage:** Ist `tracker.mode` nicht in der Config gesetzt und liefert weder Argument noch Per-Run-Wunsch ein Signal, führe die Erstaufruf-Abfrage unten aus.

### Erstaufruf-Abfrage und Persistenz

Nur wenn Schritt 4 oben greift (kein Config-Wert, kein Argument-/Per-Run-Signal):

```ask
header: Tracker
question: Sollen Review-Findings lokal als Markdown-Report oder remote als Issues (GitHub/Forgejo) geführt werden?
options:
  - label: Lokal
    description: tracker.mode = local — Markdown-Report unter .firmo/review/ (bisheriges Verhalten)
  - label: Remote
    description: tracker.mode = remote — Findings als Issues, Werkzeug automatisch aus origin (gh/tea)
```

Persistiere die Wahl anschließend nicht-destruktiv in `.firmo/config.json` unter `tracker.mode` (Muster wie `plan.markerLanguage` in `{{SKILL:plan}}`):

- Lies eine vorhandene `config.json` direkt vor dem Schreiben frisch ein und ergänze nur `tracker.mode`, ohne andere Felder zu verändern.
- Existiert die Datei nicht, lege sie minimal mit `{ "tracker": { "mode": "<wert>" } }` an.
- Gib eine kurze Statusmeldung aus, z. B. „Tracker-Modus `remote` in `.firmo/config.json` gespeichert."
- Schlägt das Schreiben fehl, gib einen knappen Hinweis aus und fahre mit dem gewählten Modus für diesen Lauf fort.

### Host- und CLI-Erkennung (nur Remote-Modus)

Bestimme im Remote-Modus das Werkzeug analog zu `{{SKILL:pr}}`:

1. **Vorbedingung:** Es ist ein Git-Repository mit einer `origin`-Remote vorhanden. Fehlt `origin` oder ist es kein Git-Repository, ist der Remote-Modus nicht möglich: klar melden und abbrechen.
2. **Werkzeug wählen:**
   - `tracker.remoteToolOverride: "github"` → `gh`; `"forgejo"` → `tea`.
   - sonst (`auto`): Lies die `origin`-URL (`git remote get-url origin`) und extrahiere daraus den Host robust für HTTPS- und SSH-Formen (`https://host/owner/repo.git`, `ssh://git@host/owner/repo.git`, `git@host:owner/repo.git`). Ist der Host exakt `github.com`, ist das Werkzeug `gh`; **für jeden anderen Host** wird Forgejo/Gitea angenommen und `tea` verwendet.
   - Ein ausdrücklicher Per-Run-Hinweis des Users zum Werkzeug hat bei mehrdeutigem Host (z. B. GitHub Enterprise) Vorrang. Ist der Host mehrdeutig und weder Override noch Per-Run-Hinweis vorhanden, frage den User nach dem gewünschten Werkzeug.
3. **Verfügbarkeit prüfen:** Stelle sicher, dass das gewählte CLI installiert und authentifiziert ist (`gh auth status` bzw. `tea` mit konfiguriertem Login). Fehlt das CLI oder die Authentifizierung: gib eine klare Fehlermeldung mit Behebungshinweis aus und brich ohne Seiteneffekt ab. Falle **nicht** still auf `local` zurück; biete einen Fallback auf `local` nur nach ausdrücklicher User-Zustimmung an.

### Label-Konvention

Verwende im Remote-Modus diese Labels und lege fehlende Labels idempotent an (eine „already exists“-Meldung tolerieren, nicht als Fehler behandeln):

| Label                                                      | Bedeutung                                                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `firmo-review-finding`                                     | markiert ein einzelnes Finding-Issue                                                     |
| `firmo-review-epic`                                        | markiert das Epic-/Tracking-Issue                                                        |
| `firmo-fix`, `firmo-refactor`, `firmo-build`, `firmo-docs` | Ziel-Aktion des Findings (genau eines pro Finding-Issue)                                 |
| `kritisch`, `wichtig`, `hinweis`                           | Schweregrad des Findings (genau eines pro Finding-Issue; `hinweis` für Hinweis-Findings) |
| `wontfix`                                                  | Finding bewusst nicht umsetzen → ADR statt Code                                          |
| `firmo-issue-done`                                         | von `{{SKILL:apply-issues}}` umgesetztes Issue (PR erstellt)                             |
| `firmo-needs-planning`                                     | von `{{SKILL:apply-issues}}` übersprungen; Planung via `{{SKILL:plan-issue}}` nötig      |

`wontfix` existiert auf vielen Trackern bereits; lege es nur an, falls es fehlt. `firmo-issue-done` und `firmo-needs-planning` gehören zum issue-getriebenen Fluss (`{{SKILL:apply-issues}}`/`{{SKILL:plan-issue}}`) und werden dort idempotent angelegt.

**Rückwärtskompatibilität (Alt-Präfix `sf-`):** Frühere Versionen nutzten das Präfix `sf-` statt `firmo-` (`sf-review-finding`, `sf-review-epic`, `sf-fix`/`sf-refactor`/`sf-build`/`sf-docs`, `sf-issue-done`, `sf-needs-planning`). Neu **angelegt oder gesetzt** wird ausschließlich das `firmo-`-Label; ein Upgrade bestehender Alt-Labels ist **nicht** nötig. Beim **Lesen, Auflisten, Deduplizieren und Erkennen** gilt jede `sf-`-Variante dauerhaft als gleichwertig zur zugehörigen `firmo-`-Variante:

- **Auflisten/Filtern** (Dedup, Epic-/Issue-Suche): `gh`/`tea` verknüpfen mehrere `--label`-Angaben mit UND-Semantik. Führe die Abfrage daher **je Präfix getrennt** aus (einmal `firmo-…`, einmal `sf-…`) und vereinige die Treffer über die Issue-Nummer.
- **Status-Label entfernen** (`firmo-needs-planning`, `firmo-issue-done`): entferne zusätzlich die Alt-`sf-`-Variante, falls vorhanden, damit ein Issue nicht durch ein liegengebliebenes Alt-Label „hängen“ bleibt.

### Issue-Body-Format (Finding-Issue)

Ein Finding-Issue muss **self-contained** sein: eine fremde LLM-Session muss es ohne Zugriff auf die erzeugende Session abarbeiten können. Es enthält dieselben inhaltlichen Felder wie ein Finding-Block des lokalen Report-Formats (siehe `{{SKILL:review}}`, „Bericht-Format“).

- **Titel:** `[R-XXXXXXX] <Kurztitel>`
- **Labels:** `firmo-review-finding`, das Aktions-Label und das Schweregrad-Label.
- **Body** (kanonisches Template):

```markdown
- **Schweregrad**: Kritisch / Wichtig / Hinweis
- **Komplexität**: Leicht / Mittel / Schwer
- **Bereich**: [...]
- **Datei**: [pfad:zeile]
- **Problem**: [...]
- **Empfehlung**: [...]
- **Aktion**: firmo-fix | firmo-refactor | firmo-build | firmo-docs
- **Prompt-Vorschlag**: [direkt kopierbarer Klartext, ohne umschließende Anführungszeichen, ohne Escape-Sequenzen]
- **Epic**: #<Epic-Nummer> (leer, falls kein Epic)
- **Signatur**: [pfad:zeile] · [Bereich] · [Kurzfassung des Problems]  <!-- Dedup-Schlüssel -->
```

Das Feld **Signatur** fixiert den inhaltlichen Dedup-Schlüssel (Datei+Zeile, Bereich, Problem). Es ist bewusst **nicht** die `R-XXXXXXX`-ID, weil diese pro Lauf frisch vergeben wird.

### Epic-Body-Format (Tracking-Issue)

- **Titel:** `Code-Review YYYY-MM-DD[-N]`
- **Labels:** `firmo-review-epic`
- **Body** (kanonisches Template):

```markdown
Code-Review vom YYYY-MM-DD · Scope: [Gesamter Code / Beschriebener Bereich] · Projekt-Typ: [...]

## Findings

- [ ] #<nr> [R-0000001] <Kurztitel> — Aktion: firmo-fix
- [ ] #<nr> [R-0000002] <Kurztitel> — Aktion: firmo-refactor

## Übersprungen (Designentscheidungen)

- #<nr-oder-keine> [R-XXXXXXX] <Kurztitel> — abgedeckt durch [DD-XXX] ([Quelle])
```

Regeln für die Task-Liste:

- Jeder Eintrag unter `## Findings` referenziert genau ein Finding-Issue über seine Nummer und trägt die `R-XXXXXXX`-ID sowie die Aktion.
- Die Sektion `## Übersprungen (Designentscheidungen)` verwendet **keine** Checkboxen und listet nur durch Designentscheidungen gefilterte Findings. Sie entfällt, wenn keine solchen Findings vorhanden sind.
- Das Abhaken erfolgt durch Umschalten `- [ ]` → `- [x]` und optionales Anhängen des PR-Links am Eintrag; ein bewusst nicht umgesetztes Finding wird als `- [x] … — nicht umgesetzt (ADR <Nummer>)` markiert.

### Tracker-Operationen (Werkzeug-Mapping)

Beschreibe alle Tracker-Zugriffe abstrakt als Operation und wähle das Kommando nach dem erkannten Werkzeug. Prüfe bei Forgejo die genauen Flagnamen gegen die installierte `tea`-Version, falls ein Aufruf fehlschlägt (wie in `{{SKILL:pr}}` vermerkt).

| Operation                                | GitHub (`gh`)                                                                     | Forgejo (`tea`)                                                                                      |
| ---------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Label anlegen (idempotent)               | `gh label create <name> --force`                                                  | `tea labels create --name <name>`                                                                    |
| Issue anlegen                            | `gh issue create --title … --body-file … --label …`                               | `tea issue create --title … --body … --labels …`                                                     |
| Issue lesen (Body + Labels + Status)     | `gh issue view <nr> --json title,body,labels,state`                               | `tea issue <nr>` bzw. `tea issue view <nr>`                                                          |
| Kommentare lesen (Klärungen, Idempotenz) | `gh issue view <nr> --json comments`                                              | `tea issue view <nr> --comments`, sonst Forgejo-API `GET /repos/<owner>/<repo>/issues/<nr>/comments` |
| Finding-Issues auflisten (für Dedup)     | `gh issue list --label firmo-review-finding --state all --json number,title,body` | `tea issues list --labels firmo-review-finding --state all`                                          |
| Offene Epics auflisten                   | `gh issue list --label firmo-review-epic --state open`                            | `tea issues list --labels firmo-review-epic --state open`                                            |
| Issue-Body aktualisieren (Epic abhaken)  | `gh issue edit <nr> --body-file …`                                                | `tea issue edit <nr> --body …`                                                                       |
| Kommentar hinzufügen (z. B. PR-Link)     | `gh issue comment <nr> --body …`                                                  | `tea comment <nr> …`                                                                                 |
| Label setzen/entfernen                   | `gh issue edit <nr> --add-label … --remove-label …`                               | `tea issue edit <nr> --labels …`                                                                     |
| Pull-Request erstellen                   | über `{{SKILL:pr}}`                                                               | über `{{SKILL:pr}}`                                                                                  |

Beim Epic-Body-Update gilt: Body vor dem Ändern frisch lesen, gezielt nur die betroffene Zeile umschalten und zurückschreiben, damit parallele Änderungen nicht verloren gehen.

Für die auflistenden Operationen (Dedup, Offene Epics) gilt die Rückwärtskompatibilität aus „Label-Konvention“: Abfrage je Präfix (`firmo-…` **und** `sf-…`) getrennt ausführen und über die Issue-Nummer vereinigen.

### Fehler- und Randfälle

- **Fehlendes/nicht authentifiziertes CLI:** klar abbrechen, Behebungshinweis geben, keinen Teilzustand hinterlassen; kein stiller Fallback auf `local`.
- **Kein Git-Repository / keine `origin`-Remote:** Remote-Modus nicht möglich; melden.
- **Mehrdeutiger Host:** `remoteToolOverride` bzw. Per-Run-Hinweis nutzen; ist beides unklar, den User fragen.
- **Argumenttyp widerspricht `tracker.mode`:** Der Argumenttyp überschreibt den Config-Modus für diesen Lauf (siehe „Modus bestimmen“).
