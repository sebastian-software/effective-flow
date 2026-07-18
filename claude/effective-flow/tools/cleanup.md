
# Effective Flow Cleanup

Du räumst die Altlasten auf, die Effective Flows Migrationen bewusst hinterlassen. Alle Migrationen sind **non-destruktiv** und verweisen das eigentliche Löschen ausdrücklich an den User (siehe `effective-flow-dir-migration.md`: „das Aufräumen überlässt Effective Flow dem User"; `/effective-flow setup`: die enttrackte Alt-`config.json` bleibt „auf Platte belassen"). Dieser Skill ist der sanktionierte, user-gesteuerte Pfad, der diese Finalisierung übernimmt — und die **einzige** Stelle, die Altdaten tatsächlich löscht.

## Ziel

- alle veralteten Migrations-Artefakte im aktuellen Projekt erfassen (Discovery)
- sie gegen ihr neues Gegenstück prüfen und feststellen, ob noch etwas übernommen werden soll (Carry-over)
- jeden Übernahme-Kandidaten vom User bestätigen lassen und Bestätigtes übernehmen
- die Altdaten anschließend **git-aware** und nur nach expliziter Bestätigung löschen (Dry-Run zuerst)
- niemals löschen, bevor das neue Gegenstück existiert und der Carry-over abgeschlossen bzw. bewusst verworfen ist
- keinen Commit erstellen und kein Backup-Verzeichnis anlegen
- ein No-Op mit klarer Meldung sein, wenn keine Altlasten vorhanden sind

## Sprachregel

- Code, Bezeichner und Tests auf Englisch
- Dokumentationsinhalte auf Deutsch, außer bestehende Doku führt eine andere Sprache fort
- Commit-Messages auf Englisch

Die deutsche Repository-Locale ist **de-DE**.

### Typografie

Locale-spezifische Typografie sichtbarer Prosa – Anführungszeichen, Gedankenstriche,
Umlaute und ß, geschützte Leerzeichen, Zahlen- und Datumsformate – besitzt der zentrale
Skill `locale-typography`. Beim Schreiben oder Bearbeiten sichtbarer deutscher Prosa ist
dessen `de-DE`-Guidance maßgeblich; Effective Flow führt hier bewusst keine zweite
Typografie-Checkliste.

Fehlt der Skill (nicht installiert, `skills.enabled: false` oder via `exclude`
deaktiviert), gilt als minimaler Fallback für deutschen Text: echte Umlaute und ß statt
ASCII-Ersatz (ae, oe, ue, ss), typografische Anführungszeichen „…“ statt gerader und
Halbgeviertstrich – statt Bindestrich.

## Aufgabenverfolgung

Wenn mehrere Aufgaben zu erledigen sind, verwende ein verfügbares TODO- oder Task-Tracking-Tool (z. B. `TaskCreate`/`TaskUpdate`, `TodoWrite` oder ein vergleichbares Tool), um eine Aufgabenliste anzulegen. Setze jede Aufgabe vor Beginn auf „in Arbeit“ und nach Abschluss auf „erledigt“.

Falls kein Task-Tool verfügbar ist, gib dem User stattdessen eine kurze Fortschrittsmeldung nach jedem abgeschlossenen Schritt.

### Wann verwenden

- bei drei oder mehr Teilaufgaben oder Schritten
- bei komplexen Aufträgen mit mehreren Phasen
- wenn der User mehrere Aufgaben gleichzeitig nennt

### Wann nicht verwenden

- bei einer einzelnen, trivialen Aufgabe
- wenn der Auftrag in weniger als drei einfachen Schritten erledigt ist

## Laufzeitverzeichnis `.effective-flow/` und Migration von `.firmo/`/`.sf-plugin/`

Effective Flow hält projektlokale Laufzeitdaten unter `.effective-flow/` (`memory.json`, `cache.json`, `review/`, `investigation/`, `.worktrees/`, Wisdom-Dateien; eine Legacy-`config.json` kann noch als Übergangs-Fallback vorliegen, ist aber keine Primärquelle mehr — die Konfiguration lebt in der Projektsetup-ADR). Frühere Versionen nutzten `.firmo/`, noch ältere `.sf-plugin/`. Wenn dieser Skill `.effective-flow/`-Daten liest oder schreibt, gelten diese Regeln:

1. **Kein ungefragter Footprint:** Lege `.effective-flow/` nur an, wenn tatsächlich Laufzeitdaten geschrieben werden. Ein Lauf ohne zu speichernde Daten erzeugt kein `.effective-flow/`.
2. **Fallback-Lesen:** Fehlt `.effective-flow/`, existiert aber ein älteres Laufzeitverzeichnis, lies die benötigten Dateien (`config.json`, `memory.json`, Report-/Investigation-Dateien …) aus dem jeweils vorhandenen Legacy-Verzeichnis — bevorzugt `.firmo/`, sonst `.sf-plugin/` —, solange noch nicht migriert wurde.
3. **Einmalige, nicht-destruktive Migration:** Sobald nach `.effective-flow/` geschrieben würde und noch kein `.effective-flow/` existiert, ein `.firmo/` oder `.sf-plugin/` aber vorhanden ist: lege `.effective-flow/` an und übernimm den vorhandenen Inhalt aus dem Legacy-Verzeichnis (bevorzugt `.firmo/` vor `.sf-plugin/`; kopieren, nicht verschieben), dann schreibe die Änderung in `.effective-flow/`. Existiert `.effective-flow/` bereits, findet **keine** erneute Migration statt (idempotent). Parallel-sicher: eine im Ziel bereits vorhandene Datei wird nicht überschrieben.
4. **Keine stille Löschung:** `.firmo/` und `.sf-plugin/` bleiben erhalten; das Aufräumen überlässt Effective Flow dem User.

Die `.gitignore`-Umstellung auf ein einzelnes `.effective-flow/` (inklusive Migration des früheren Zwei-Zeilen-Patterns `.effective-flow/*` plus `!.effective-flow/config.json` sowie einer pauschalen `.firmo/`- oder `.sf-plugin/`-Ignore-Zeile) übernimmt `/effective-flow setup`.

## Effective-Flow-Konfiguration (Projektsetup-ADR)

Die getrackte Wahrheit für die Effective-Flow-Konfiguration ist eine lebende ADR „Effective
Flow project setup“ (Default-Slug `effective-flow-project-setup`, siehe Baustein „Lebendes
ADR-Modell“). Sie trägt die Config-Parameter mit minimaler Prosa als **Markdown-Tabelle**. Es
gibt **keine** `.effective-flow/config.json` mehr als Config-Quelle; `.effective-flow/` ist
reines Laufzeit-Verzeichnis (`memory.json`, `cache.json`, `review/`, `.worktrees/`) und wird
komplett gitignored.

### Config-Locator (Auflösungsreihenfolge)

Beim Lesen der Konfiguration wird die Projektsetup-ADR in dieser Reihenfolge aufgelöst; der
erste greifende Schritt gewinnt:

1. **AGENTS.md-Marker.** Die kanonische Zeile `**Effective Flow project setup:** <pfad>` in
   `AGENTS.md`, sonst in `CLAUDE.md` bzw. einer vergleichbaren Konventionsdatei → die ADR
   unter `<pfad>` lesen. **Backcompat (eine Generation):** ein noch vorhandener Alt-Marker
   `**Firmo project setup:** <pfad>` wird beim Lesen gleichwertig erkannt; /effective-flow setup
   stellt ihn beim nächsten Lauf nicht-destruktiv auf die neue Schreibweise um. Zeigt der
   Marker auf einen Pfad, unter dem **keine** ADR liegt (toter/veralteter Marker), nicht dort
   stehenbleiben, sondern in dieser Reihenfolge weiterfallen und den veralteten Marker melden
   (Korrektur in /effective-flow setup).
2. **Default-Pfad/Scan.** Sonst `docs/adr/effective-flow-project-setup.md` (der Alt-Slug
   `firmo-project-setup` wird beim Scan gleichwertig erkannt) bzw. ein Scan des erkannten
   ADR-Verzeichnisses (`docs/adr/`, `docs/decisions/`, `adr/`) nach der Projektsetup-ADR.
3. **Übergangs-Kompatibilität.** Sonst — nur übergangsweise — eine noch vorhandene
   `.effective-flow/config.json` (sonst eine Legacy-`.firmo/config.json`) lesen und auf
   /effective-flow setup hinweisen. Dieser Lesepfad legt **nichts** an und berührt **kein** Git.
4. **Eingebaute Defaults.** Sonst die Defaults der jeweiligen Quell-Skills verwenden.

Der deterministische Lesepfad beliebiger Tools ist nicht-blockierend: Er liest die ADR (bzw.
den Übergangs-Fallback), erzeugt aber selbst keine Datei und mutiert kein Git. Das Anlegen
der ADR, der Marker und die Migration passieren ausschließlich im git-berührenden Pfad von
/effective-flow setup.

### Tabellen-Encoding (verbindlich für Schreiber und Leser)

Die Config-Parameter stehen als flache Markdown-Tabelle mit zwei Spalten
`| Schlüssel | Wert |`. Schreiber (/effective-flow setup, Migration) und Leser (alle Tools)
interpretieren die Werte identisch nach dieser Kodierung:

- **Boolean** → `true` / `false`.
- **String** → literal, unquoted (z. B. `focused`, `origin/main`).
- **`null`** (semantisch „beim Lauf fragen“, z. B. `applyReview.defaultCommitStrategy`) →
  das Literal-Token `null`.
- **Leere Liste** → `(leer)`.
- **Gefüllte Liste** → kommagetrennt (z. B. `humanizer, distill`).
- **Verschachtelung** → dotted keys (z. B. `applyReview.worktree.baseDir`,
  `skills.agents.ui-implementer.include`); ein leeres Objekt hat keine Unterzeilen.
- **Fehlende Zeile = Schlüssel nicht gesetzt → Default des Quell-Skills.** Bewusst
  verschieden von einer vorhandenen Zeile mit Wert `null` (expliziter Wert, semantisch „beim
  Lauf fragen“). Beispiel: keine `delivery.completion`-Zeile → Default `merge`; eine
  `delivery.completion | null`-Zeile → beim Lauf fragen.

Das Lesen eines einzelnen Werts ist ein trivialer Zeilen-Lookup (Zeile mit dotted key →
Wertzelle). Beispiel-Ausschnitt (Schnittstellenskizze, kein vollständiger Inhalt):

```markdown
## Konfiguration

| Schlüssel                         | Wert    |
| --------------------------------- | ------- |
| review.profile                    | focused |
| applyReview.defaultCommitStrategy | null    |
| skills.exclude                    | (leer)  |
| worktree.enabled                  | true    |
```

Ist die Tabelle ungültig oder mehrdeutig (fehlender Schlüssel, unbekanntes Encoding): einen
sicheren Default für den Lauf verwenden, den User über den betroffenen Schlüssel
informieren, **nicht** raten.

### Einmalige Migration Legacy-`config.json` → Projektsetup-ADR

Die Migration einer bestehenden `.effective-flow/config.json` bzw. Legacy-`.firmo/config.json`
in die Projektsetup-ADR ist **git-berührend** und läuft ausschließlich im
/effective-flow setup-Pfad. Sie erzeugt die ADR-Tabelle aus dem aktuellen Config-Inhalt (Encoding
wie oben), schreibt den AGENTS.md-Marker `**Effective Flow project setup:**`, stellt
`.gitignore` auf ein einzelnes `.effective-flow/` um und enttrackt die Alt-`config.json`
(`git rm --cached`, Datei-Inhalt auf Platte belassen). Der genaue Ablauf inklusive
Idempotenz-Markierung steht in /effective-flow setup.

Außerhalb von /effective-flow setup findet **keine** Migration statt: Der deterministische
Lesepfad legt nichts an und berührt kein Git; er liest bei fehlender ADR ersatzweise eine
noch vorhandene `.effective-flow/config.json` (sonst `.firmo/config.json`) und weist auf
/effective-flow setup hin.

## Issue-Tracker-Anbindung (Remote-Modus)

Dieser geteilte Baustein verbindet `/effective-flow review` und ``tools/apply-review.md`` mit einem externen Issue-Tracker (GitHub über `gh`, Forgejo über `tea`). Er ist **opt-in** über die Effective Flow-Konfiguration (Projektsetup-ADR) und standardmäßig deaktiviert (`local`). Im lokalen Modus verhalten sich beide Skills unverändert – Findings laufen über die Markdown-Report-Datei unter `.effective-flow/review/`, es werden keine Issues erzeugt und kein CLI aufgerufen.

Der local/remote-Umschalter (`tracker.mode`) betrifft ausschließlich **Reviews**. **Investigationen** (`/effective-flow investigate`) sind davon ausgenommen und bleiben in jedem Modus rein lokal unter `.effective-flow/investigation/` (nie committet, nie als Issue). Von den Effective Flow-Artefakten werden ausschließlich **Pläne** committet.

Er kapselt die **gemeinsamen** Bausteine: das `tracker`-Config-Schema samt Migration, die Modusbestimmung, die Host- und CLI-Erkennung, die Label-Konvention, die kanonischen Issue- und Epic-Body-Formate sowie das Mapping der Tracker-Operationen auf `gh`/`tea`. Die eigentliche Orchestrierung – wann Issues **erstellt** (`/effective-flow review`) und wann sie **gelesen und abgearbeitet** werden (``tools/apply-review.md``) – bleibt im jeweiligen Skill.

Zusätzlich nutzen ``tools/apply-issues.md`` und `/effective-flow plan-issue` diesen Baustein, allerdings nur für die **werkzeug-generische Plumbing**: die Host- und CLI-Erkennung (unten), die Verfügbarkeits-/Auth-Prüfung, das Mapping der Tracker-Operationen auf `gh`/`tea` und die Fehlerfälle. Diese beiden Skills verarbeiten **beliebige** Menschen-Issues statt der von `/effective-flow review` erzeugten Finding-Issues; sie sind **inhärent remote** und werten den `tracker.mode`-Umschalter (local/remote) **nicht** aus – sie brauchen lediglich ein Git-Repository, eine `origin`-Remote und ein authentifiziertes CLI. Die finding-/epic-spezifischen Abschnitte (Issue-Body-Format, Epic-Body-Format, `R-XXXXXXX`-Konvention) gelten nur für `/effective-flow review`/``tools/apply-review.md``; die Checkbox-Abhak-Mechanik für Epic-Bodys nutzt ``tools/apply-issues.md`` bei Container-Issues sinngemäß mit.

### Konfiguration

Der Remote-Modus funktioniert ohne festgeschriebene Konfiguration (dann bleibt er deaktiviert, `local`). Falls die Effective Flow-Konfiguration (Projektsetup-ADR) entsprechende Werte festschreibt, überschreiben sie diese Defaults (Schema hier zur Illustration):

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

Das Lesen der Effective Flow-Konfiguration aus der Projektsetup-ADR (inklusive der `tracker`-Schlüssel) und die einmalige Migration einer Alt-Config übernimmt zentral der Baustein „Config-Migration“ (`config-migration.md`); dieser Baustein führt keine eigene per-Block-Migration mehr für `tracker` aus. Das `tracker`-Config-Schema oben (Konfiguration, gültige Werte, Modusbestimmung, Erstaufruf-Abfrage) bleibt davon unberührt.

### Modus bestimmen

Bestimme zu Beginn des Laufs den effektiven Modus in dieser Reihenfolge (die erste zutreffende Regel gewinnt):

1. **Argumenttyp:** Der übergebene Argumenttyp überschreibt den Config-Modus für diesen Lauf. Eine Report-Datei (`*.md` unter `.effective-flow/review/`) erzwingt `local`; eine Issue-Referenz (Issue-Nummer, `#123` oder eine Issue-URL) erzwingt `remote`.
2. **Per-Run-Wunsch des Users:** Verlangt der User ausdrücklich Issue-/Tracker-Arbeit, ist `remote` aktiv; verlangt er ausdrücklich lokale Arbeit („lokal“, „ohne Issues“, „nur Report“), ist `local` aktiv.
3. **Config:** sonst gilt `tracker.mode` aus der Effective Flow-Konfiguration (Projektsetup-ADR).
4. **Erstaufruf-Abfrage:** Ist `tracker.mode` nicht in der Config gesetzt und liefert weder Argument noch Per-Run-Wunsch ein Signal, führe die Erstaufruf-Abfrage unten aus.

### Erstaufruf-Abfrage

Nur wenn Schritt 4 oben greift (kein Config-Wert, kein Argument-/Per-Run-Signal):

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Tracker"
- question: "Sollen Review-Findings lokal als Markdown-Report oder remote als Issues (GitHub/Forgejo) geführt werden?"
- multiSelect: false
- options:
  - label: "Lokal", description: "tracker.mode = local — Markdown-Report unter .effective-flow/review/ (bisheriges Verhalten)"
  - label: "Remote", description: "tracker.mode = remote — Findings als Issues, Werkzeug automatisch aus origin (gh/tea)"

Verwende die gewählte Antwort als Tracker-Modus **für diesen Lauf**. Schreibe sie **nicht** selbst in die Konfiguration — das dauerhafte Festschreiben von `tracker.mode` in der Projektsetup-ADR übernimmt ausschließlich `/effective-flow setup`. Weise den User kurz darauf hin, z. B. „Tracker-Modus `remote` für diesen Lauf verwendet; dauerhaft festschreiben über `/effective-flow setup`.“

### Host- und CLI-Erkennung (nur Remote-Modus)

Bestimme im Remote-Modus das Werkzeug analog zu `/effective-flow pr`:

1. **Vorbedingung:** Es ist ein Git-Repository mit einer `origin`-Remote vorhanden. Fehlt `origin` oder ist es kein Git-Repository, ist der Remote-Modus nicht möglich: klar melden und abbrechen.
2. **Werkzeug wählen:**
   - `tracker.remoteToolOverride: "github"` → `gh`; `"forgejo"` → `tea`.
   - sonst (`auto`): Lies die `origin`-URL (`git remote get-url origin`) und extrahiere daraus den Host robust für HTTPS- und SSH-Formen (`https://host/owner/repo.git`, `ssh://git@host/owner/repo.git`, `git@host:owner/repo.git`). Ist der Host exakt `github.com`, ist das Werkzeug `gh`; **für jeden anderen Host** wird Forgejo/Gitea angenommen und `tea` verwendet.
   - Ein ausdrücklicher Per-Run-Hinweis des Users zum Werkzeug hat bei mehrdeutigem Host (z. B. GitHub Enterprise) Vorrang. Ist der Host mehrdeutig und weder Override noch Per-Run-Hinweis vorhanden, frage den User nach dem gewünschten Werkzeug.
3. **Verfügbarkeit prüfen:** Stelle sicher, dass das gewählte CLI installiert und authentifiziert ist (`gh auth status` bzw. `tea` mit konfiguriertem Login). Fehlt das CLI oder die Authentifizierung: gib eine klare Fehlermeldung mit Behebungshinweis aus und brich ohne Seiteneffekt ab. Falle **nicht** still auf `local` zurück; biete einen Fallback auf `local` nur nach ausdrücklicher User-Zustimmung an.

### Label-Konvention

Verwende im Remote-Modus diese Labels und lege fehlende Labels idempotent an (eine „already exists“-Meldung tolerieren, nicht als Fehler behandeln):

| Label                                                                                          | Bedeutung                                                                                |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `effective-flow-review-finding`                                                                | markiert ein einzelnes Finding-Issue                                                     |
| `effective-flow-review-epic`                                                                   | markiert das Epic-/Tracking-Issue                                                        |
| `effective-flow-fix`, `effective-flow-refactor`, `effective-flow-build`, `effective-flow-docs` | Ziel-Aktion des Findings (genau eines pro Finding-Issue)                                 |
| `kritisch`, `wichtig`, `hinweis`                                                               | Schweregrad des Findings (genau eines pro Finding-Issue; `hinweis` für Hinweis-Findings) |
| `wontfix`                                                                                      | Finding bewusst nicht umsetzen → ADR statt Code                                          |
| `effective-flow-issue-done`                                                                    | von ``tools/apply-issues.md`` umgesetztes Issue (PR erstellt)                             |
| `effective-flow-needs-planning`                                                                | von ``tools/apply-issues.md`` übersprungen; Planung via `/effective-flow plan-issue` nötig      |

`wontfix` existiert auf vielen Trackern bereits; lege es nur an, falls es fehlt. `effective-flow-issue-done` und `effective-flow-needs-planning` gehören zum issue-getriebenen Fluss (``tools/apply-issues.md``/`/effective-flow plan-issue`) und werden dort idempotent angelegt.

**Rückwärtskompatibilität (Alt-Präfix `firmo-`):** Frühere Versionen nutzten das Präfix `firmo-` statt `effective-flow-` (`firmo-review-finding`, `firmo-review-epic`, `firmo-fix`/`firmo-refactor`/`firmo-build`/`firmo-docs`, `firmo-issue-done`, `firmo-needs-planning`). Neu **angelegt oder gesetzt** wird ausschließlich das `effective-flow-`-Label; ein Upgrade bestehender `firmo-`-Labels ist **nicht** nötig. Beim **Lesen, Auflisten, Deduplizieren und Erkennen** gilt jede `firmo-`-Variante dauerhaft als gleichwertig zur zugehörigen `effective-flow-`-Variante:

- **Auflisten/Filtern** (Dedup, Epic-/Issue-Suche): `gh`/`tea` verknüpfen mehrere `--label`-Angaben mit UND-Semantik. Führe die Abfrage daher **je Präfix getrennt** aus (einmal `effective-flow-…`, einmal `firmo-…`) und vereinige die Treffer über die Issue-Nummer.
- **Status-Label entfernen** (`effective-flow-needs-planning`, `effective-flow-issue-done`): entferne zusätzlich die Alt-`firmo-`-Variante, falls vorhanden, damit ein Issue nicht durch ein liegengebliebenes Alt-Label „hängen“ bleibt.

**Einmalige `sf-`-Label-Migration:** Das noch ältere Präfix `sf-` (`sf-review-finding`, `sf-review-epic`, `sf-fix`/`sf-refactor`/`sf-build`/`sf-docs`, `sf-issue-done`, `sf-needs-planning`) wird **nicht** mehr laufend erkannt, sondern **einmal pro Repo migriert**. Beim **ersten** Remote-Tracker-Zugriff — sofern der Marker `labelMigration.sf.done` in `.effective-flow/memory.json` fehlt und ein authentifiziertes CLI vorliegt — zieht eine idempotente Migration jedes noch vorhandene `sf-<x>`-Label auf `effective-flow-<x>` um: erst `effective-flow-<x>` am Issue ergänzen, dann `sf-<x>` entfernen (nicht umgekehrt, damit ein Abbruch kein Issue unklassifiziert zurücklässt). Danach den Marker setzen. Findet die Migration keine `sf-`-Labels, ist sie ein geräuschloser No-Op. Ist der Marker gesetzt, entfällt jeder weitere Scan — laufende Operationen kennen nur `effective-flow-` und `firmo-`. `sf-` wird ausschließlich in dieser Migration referenziert.

### Keine KI-Attribution in Issue-Bodys und -Kommentaren

Füge Issue-Bodys, Epic-Bodys und Kommentaren keine KI-Attribution hinzu: keine „Generated with Claude Code/Codex"-Footer, keine Agent-Session-Links (z. B. `https://claude.ai/code/…`) und keine `Co-Authored-By`-Trailer – auch dann nicht, wenn der Harness sie als Default anhängt. Sachliche Erwähnungen von Claude Code oder Codex als Ziel-Harness sind erlaubt, Generierungs-Attribution nicht.

### Issue-Body-Format (Finding-Issue)

Ein Finding-Issue muss **self-contained** sein: eine fremde LLM-Session muss es ohne Zugriff auf die erzeugende Session abarbeiten können. Es enthält dieselben inhaltlichen Felder wie ein Finding-Block des lokalen Report-Formats (siehe `/effective-flow review`, „Bericht-Format“).

- **Titel:** `[R-XXXXXXX] <Kurztitel>`
- **Labels:** `effective-flow-review-finding`, das Aktions-Label und das Schweregrad-Label.
- **Body** (kanonisches Template):

```markdown
- **Schweregrad**: Kritisch / Wichtig / Hinweis
- **Komplexität**: Leicht / Mittel / Schwer
- **Bereich**: [...]
- **Datei**: [pfad:zeile]
- **Problem**: [...]
- **Empfehlung**: [...]
- **Aktion**: effective-flow-fix | effective-flow-refactor | effective-flow-build | effective-flow-docs
- **Prompt-Vorschlag**: [direkt kopierbarer Klartext, ohne umschließende Anführungszeichen, ohne Escape-Sequenzen]
- **Epic**: #<Epic-Nummer> (leer, falls kein Epic)
- **Signatur**: [pfad:zeile] · [Bereich] · [Kurzfassung des Problems]  <!-- Dedup-Schlüssel -->
```

Das Feld **Signatur** fixiert den inhaltlichen Dedup-Schlüssel (Datei+Zeile, Bereich, Problem). Es ist bewusst **nicht** die `R-XXXXXXX`-ID, weil diese pro Lauf frisch vergeben wird.

### Epic-Body-Format (Tracking-Issue)

- **Titel:** `Code-Review YYYY-MM-DD[-N]`
- **Labels:** `effective-flow-review-epic`
- **Body** (kanonisches Template):

```markdown
Code-Review vom YYYY-MM-DD · Scope: [Gesamter Code / Beschriebener Bereich] · Projekt-Typ: [...]

## Findings

- [ ] #<nr> [R-0000001] <Kurztitel> — Aktion: effective-flow-fix
- [ ] #<nr> [R-0000002] <Kurztitel> — Aktion: effective-flow-refactor

## Übersprungen (Designentscheidungen)

- #<nr-oder-keine> [R-XXXXXXX] <Kurztitel> — abgedeckt durch [DD-XXX] ([Quelle])
```

Regeln für die Task-Liste:

- Jeder Eintrag unter `## Findings` referenziert genau ein Finding-Issue über seine Nummer und trägt die `R-XXXXXXX`-ID sowie die Aktion.
- Die Sektion `## Übersprungen (Designentscheidungen)` verwendet **keine** Checkboxen und listet nur durch Designentscheidungen gefilterte Findings. Sie entfällt, wenn keine solchen Findings vorhanden sind.
- Das Abhaken erfolgt durch Umschalten `- [ ]` → `- [x]` und optionales Anhängen des PR-Links am Eintrag; ein bewusst nicht umgesetztes Finding wird per Slug-Referenz als `- [x] … — nicht umgesetzt (ADR: <slug>)` markiert.

### Tracker-Operationen (Werkzeug-Mapping)

Beschreibe alle Tracker-Zugriffe abstrakt als Operation und wähle das Kommando nach dem erkannten Werkzeug. Prüfe bei Forgejo die genauen Flagnamen gegen die installierte `tea`-Version, falls ein Aufruf fehlschlägt (wie in `/effective-flow pr` vermerkt).

| Operation                                | GitHub (`gh`)                                                                              | Forgejo (`tea`)                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Label anlegen (idempotent)               | `gh label create <name> --force`                                                           | `tea labels create --name <name>`                                                                    |
| Issue anlegen                            | `gh issue create --title … --body-file … --label …`                                        | `tea issue create --title … --body … --labels …`                                                     |
| Issue lesen (Body + Labels + Status)     | `gh issue view <nr> --json title,body,labels,state`                                        | `tea issue <nr>` bzw. `tea issue view <nr>`                                                          |
| Kommentare lesen (Klärungen, Idempotenz) | `gh issue view <nr> --json comments`                                                       | `tea issue view <nr> --comments`, sonst Forgejo-API `GET /repos/<owner>/<repo>/issues/<nr>/comments` |
| Finding-Issues auflisten (für Dedup)     | `gh issue list --label effective-flow-review-finding --state all --json number,title,body` | `tea issues list --labels effective-flow-review-finding --state all`                                 |
| Offene Epics auflisten                   | `gh issue list --label effective-flow-review-epic --state open`                            | `tea issues list --labels effective-flow-review-epic --state open`                                   |
| Issue-Body aktualisieren (Epic abhaken)  | `gh issue edit <nr> --body-file …`                                                         | `tea issue edit <nr> --body …`                                                                       |
| Kommentar hinzufügen (z. B. PR-Link)     | `gh issue comment <nr> --body …`                                                           | `tea comment <nr> …`                                                                                 |
| Label setzen/entfernen                   | `gh issue edit <nr> --add-label … --remove-label …`                                        | `tea issue edit <nr> --labels …`                                                                     |
| Pull-Request erstellen                   | über `/effective-flow pr`                                                                        | über `/effective-flow pr`                                                                                  |

Beim Epic-Body-Update gilt: Body vor dem Ändern frisch lesen, gezielt nur die betroffene Zeile umschalten und zurückschreiben, damit parallele Änderungen nicht verloren gehen.

Für die auflistenden Operationen (Dedup, Offene Epics) gilt die Rückwärtskompatibilität aus „Label-Konvention“: Abfrage je Präfix (`effective-flow-…` **und** `firmo-…`) getrennt ausführen und über die Issue-Nummer vereinigen.

### Fehler- und Randfälle

- **Fehlendes/nicht authentifiziertes CLI:** klar abbrechen, Behebungshinweis geben, keinen Teilzustand hinterlassen; kein stiller Fallback auf `local`.
- **Kein Git-Repository / keine `origin`-Remote:** Remote-Modus nicht möglich; melden.
- **Mehrdeutiger Host:** `remoteToolOverride` bzw. Per-Run-Hinweis nutzen; ist beides unklar, den User fragen.
- **Argumenttyp widerspricht `tracker.mode`:** Der Argumenttyp überschreibt den Config-Modus für diesen Lauf (siehe „Modus bestimmen“).

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor dem Aufräumen und beachte ihre Vorgaben für Dateiformate, Konfiguration und projektweite Konventionen.

## Harte Abgrenzung

- **Nur das aktuelle Projekt.** Dieser Skill fasst **keine** globale Skill-Installation an (z. B. `~/.claude/skills/effective-flow` oder `~/.claude/skills/firmo`, `firmo-*`/`effective-flow-*`-Agents). Das Entfernen alter installierter Skills/Agents erledigen die Deploy-Skripte, nicht dieses Tool.
- **Neues nie löschen.** Das aktive Laufzeitverzeichnis `.effective-flow/` (bis auf einen ausdrücklich als veraltet erkannten Legacy-Inhalt darin, siehe Altlast-Klassen) und die Projektsetup-ADR werden **nie** gelöscht.
- **Kein Auto-Commit.** Der Skill staged höchstens `git rm`-Änderungen und entfernt ungetrackte Dateien physisch; er committet nicht. Das Committen übernimmt der User oder `/effective-flow commit`.
- **Kein Backup.** Für nicht git-wiederherstellbare Artefakte wird bewusst kein Backup-Verzeichnis angelegt; das Sicherheitsnetz ist die explizite Bestätigung.
- **Keine Config schreiben.** Übernahme von Config-Werten schreibt dieser Skill nicht selbst in die Projektsetup-ADR — dafür ist `/effective-flow setup` zuständig (siehe Phase 3).
- **Nur mit Zustimmung löschen.** Jede Löschung erfolgt erst nach Dry-Run und ausdrücklicher Bestätigung.

## Altlast-Klassen

Der Skill kennt genau diese vier Klassen von Migrations-Altlasten und je ihr neues Gegenstück:

| Klasse                       | Altlast                                                                                                                                    | Neues Gegenstück                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Runtime-Verzeichnisse        | `.firmo/`, `.sf-plugin/` (nach Migration bewusst belassen)                                                                                 | `.effective-flow/`                             |
| Legacy-`config.json`         | enttrackte `.firmo/config.json` bzw. eine Legacy-`config.json` in einem Runtime-Verzeichnis                                                | Projektsetup-ADR (siehe `/effective-flow setup`)     |
| Legacy-`.gitignore`-Einträge | veraltete Ignore-Zeilen für `.firmo/`/`.sf-plugin/` bzw. das alte Zwei-Zeilen-Pattern `.effective-flow/*` + `!.effective-flow/config.json` | die eine Zeile `.effective-flow/`              |
| `firmo-`-Labels              | `firmo-review-finding`, `firmo-review-epic`, `firmo-fix`/`-refactor`/`-build`/`-docs`, `firmo-issue-done`, `firmo-needs-planning` am Issue | die `effective-flow-`-Variante am selben Issue |

`sf-`-Labels sind **kein** eigenständiges Ziel: Sie werden bereits durch die einmalige `sf-`-Label-Migration (siehe „Label-Konvention" in `issue-tracker.md`) auf `effective-flow-` gezogen. Dieser Skill räumt nur noch verbliebene `firmo-`-Labels ab.

## Workflow

### Phase 1: Discovery / Bestandsaufnahme

1. Erfasse die vorhandenen Altlasten im Projekt-Root:
   - **Runtime-Verzeichnisse:** existiert `.firmo/` und/oder `.sf-plugin/`?
   - **Legacy-`config.json`:** existiert `.firmo/config.json`, `.sf-plugin/config.json` oder eine als veraltet erkennbare `config.json` in `.effective-flow/` (Übergangs-Fallback, dessen Werte in die ADR gehören)?
   - **`.gitignore`:** enthält sie veraltete Zeilen für `.firmo/`/`.sf-plugin/` oder das alte Zwei-Zeilen-Pattern?
   - **`firmo-`-Labels:** nur im Remote-Modus mit authentifiziertem CLI (siehe „Host- und CLI-Erkennung" in `issue-tracker.md`) — liste Issues mit `firmo-`-Labels je Präfix getrennt auf. Fehlt Remote-Modus, Git-Repository, `origin` oder ein authentifiziertes CLI, überspringe diese Klasse und melde das knapp.
2. Bestimme je vorhandener Altlast, ob ihr **neues Gegenstück** existiert (`.effective-flow/`, Projektsetup-ADR bzw. `effective-flow-`-Labels).
3. Sind keine Altlasten vorhanden, ist der Lauf ein **No-Op**: melde das klar und beende.
4. Gib dem User eine kompakte Bestandsaufnahme aus (Klasse → gefundene Artefakte → ob ein neues Gegenstück existiert).

### Phase 2: Carry-over-Prüfung (lesen + vergleichen)

Lies die Altlasten und ermittle, ob noch etwas übernommen werden muss, bevor gelöscht wird:

- **Runtime-Verzeichnisse:** Vergleiche den Inhalt des Legacy-Verzeichnisses (bevorzugt `.firmo/` vor `.sf-plugin/`) mit `.effective-flow/`. Sammle Dateien, die im Legacy-Verzeichnis vorhanden sind, in `.effective-flow/` aber **fehlen** (oder inhaltlich abweichen/neuer sind), als Übernahme-Kandidaten. Reine Laufzeit-Artefakte (`cache.json`, `.worktrees/`) sind in der Regel verzichtbar; benenne sie als solche.
- **Legacy-`config.json`:** Parse sie. Ist sie kein gültiges JSON, ist sie **keine** Carry-over-Quelle: melde Pfad und Fehler und behandle die Datei nur als Löschkandidat (nach Bestätigung). Bei gültigem JSON vergleiche jeden gesetzten Wert mit der Projektsetup-ADR; nicht abgebildete Werte sind Übernahme-Kandidaten.
- **`.gitignore`/Labels:** kein Datei-Carry-over. Für Labels gilt der add-before-remove-Schritt in Phase 5.

### Phase 3: Carry-over bestätigen und übernehmen

Lege dem User die Übernahme-Kandidaten gruppiert vor und hole je Gruppe die Entscheidung ein. Übernimm nur ausdrücklich bestätigte Kandidaten.

Wenn es gibt Runtime-Datei-Kandidaten, die in `.effective-flow/` fehlen oder abweichen:

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Übernehmen"
- question: "Welche Dateien aus dem Alt-Laufzeitverzeichnis sollen nach `.effective-flow/` übernommen werden, bevor es gelöscht wird?"
- multiSelect: false
- options:
  - label: "Alle übernehmen", description: "Jede aufgelistete Datei nach .effective-flow/ kopieren (vorhandene Dateien im Ziel nicht überschreiben)"
  - label: "Einzeln auswählen", description: "Pro Datei entscheiden, welche übernommen und welche verworfen wird"
  - label: "Nichts übernehmen", description: "Keine Datei übernehmen — der gesamte Alt-Inhalt wird zur Löschung freigegeben"

- **Runtime-Dateien:** Bestätigtes nach `.effective-flow/` kopieren (nicht verschieben); eine im Ziel bereits vorhandene Datei **nicht** überschreiben. Abgelehntes bleibt Löschkandidat.
- **Config-Werte:** Schreibe abweichende Werte **nicht selbst** in die ADR. Lege sie offen und verweise auf `/effective-flow setup` zur Übernahme. Gib die betroffenen Schlüssel konkret aus, damit der User sie in `/effective-flow setup` bestätigen kann. Erst wenn die Werte in der ADR stehen oder der User sie ausdrücklich verwirft, gilt die Legacy-`config.json` als übernahmefrei und damit löschbar.
- **Labels:** kein Datei-Carry-over; die Übernahme erfolgt in Phase 5 als add-`effective-flow-`-vor-remove-`firmo-`.

### Phase 4: Dry-Run-Vorschau

Liste vor jeder Löschung genau auf, was entfernt wird — **ohne** schon zu löschen:

1. Je Artefakt: Pfad bzw. Label und die Klasse.
2. Je Datei/Verzeichnis den Git-Status: **getrackt**, **ungetrackt** oder **gitignored**. Getrackte sind über die Git-Historie wiederherstellbar; ungetrackte/gitignorte Artefakte (`.effective-flow/`, `.firmo/`, `.sf-plugin/` sind gitignored) sind **nicht** über Git wiederherstellbar.
3. Warne bei dirty Working Tree und empfehle, vorher zu committen/stashen, damit ein `git rm`-Staging sauber ist.
4. Weise für jede Altlast nach, dass ihr neues Gegenstück existiert und der Carry-over abgeschlossen bzw. bewusst verworfen ist. Fehlt das neue Gegenstück (z. B. `.effective-flow/` existiert nicht, weil die Migration noch nicht lief), biete diese Altlast **nicht** zur Löschung an: melde das und verweise darauf, dass ein normaler Tool-Lauf die Migration nach `.effective-flow/` auslöst.
5. **Verschachtelte Klassen koppeln:** Eine Legacy-`config.json` liegt physisch **innerhalb** eines Runtime-Verzeichnisses (z. B. `.firmo/config.json` in `.firmo/`). Biete das enthaltende Runtime-Verzeichnis (Klasse „Runtime-Verzeichnisse") **nicht** zur Löschung an, solange die enthaltene Legacy-`config.json` (Klasse „Legacy-`config.json`") noch offenen Carry-over hat — sonst nähme das Löschen des Verzeichnisses die noch nicht übernommene `config.json` mit. Erst wenn deren Werte in der ADR stehen oder ausdrücklich verworfen sind, gilt auch das enthaltende Verzeichnis als löschbar.

### Phase 5: Löschung bestätigen und git-aware ausführen

Hole die Bestätigung **artefakt-klassen-weise** ein und führe die Löschung erst danach aus.

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Löschen"
- question: "Die oben gelisteten Altlasten jetzt entfernen? Getrackte Dateien via `git rm` (über die Historie wiederherstellbar), ungetrackte/gitignorte Verzeichnisse werden physisch und unwiderruflich entfernt."
- multiSelect: false
- options:
  - label: "Ja, wie gelistet entfernen", description: "Getrackte via git rm (gestaged, kein Commit); ungetrackte/gitignorte physisch löschen; firmo-Labels vom Issue lösen"
  - label: "Nur getrackte entfernen", description: "Nur die git-wiederherstellbaren, getrackten Artefakte via git rm; ungetrackte Verzeichnisse und Labels vorerst behalten"
  - label: "Abbrechen", description: "Nichts löschen; die Bestandsaufnahme bleibt bestehen"

Führe je Klasse aus:

- **Getrackte Dateien:** via `git rm` entfernen (staged, **kein** Commit). Bei ungetrackt/gitignored greift `git rm` nicht.
- **Ungetrackte/gitignorte Verzeichnisse** (`.firmo/`, `.sf-plugin/`, eine gitignorte Legacy-`config.json`): physisch entfernen — nur nach der ausdrücklichen „unwiderruflich"-Bestätigung oben, ohne Backup.
- **`.gitignore`:** entferne nur eindeutig veraltete Zeilen (`.firmo/`, `.sf-plugin/`, altes Zwei-Zeilen-Pattern). Stelle sicher, dass `.effective-flow/` weiterhin ignoriert bleibt; Fremdzeilen unangetastet lassen. Die kanonische `.gitignore`-Normalisierung ist Sache von `/effective-flow setup`; entferne hier nur die Alt-Reste.
- **`firmo-`-Labels:** nur im Remote-Modus mit CLI. Ergänze zuerst `effective-flow-<x>` am Issue, **dann** löse `firmo-<x>` vom Issue (add-new vor remove-old, damit bei Abbruch kein Issue unklassifiziert bleibt). Die Label-**Definition** im Tracker bleibt bestehen — führe **kein** `label delete` aus. Nutze das Werkzeug-Mapping aus `issue-tracker.md` (`--add-label`/`--remove-label` bzw. `tea issue edit`).

Brich bei jedem Fehler (z. B. `git rm` scheitert, Tracker nicht erreichbar) kontrolliert ab: melde den Teilzustand und lösche nichts, dessen neues Gegenstück nicht gesichert ist.

### Phase 6: Abschluss

Melde dem User:

- was übernommen wurde (Dateien nach `.effective-flow/`) und welche Config-Werte an `/effective-flow setup` verwiesen wurden
- was gelöscht wurde, getrennt nach getrackt (via `git rm`, gestaged) und physisch entfernt
- welche `.gitignore`-Zeilen entfernt wurden
- welche `firmo-`-Labels von wie vielen Issues gelöst wurden (bzw. dass die Label-Klasse übersprungen wurde)
- was bewusst verbleibt und warum
- dass **kein** Commit erstellt wurde; verweise für die gestageten Änderungen auf `/effective-flow commit`

## Regeln

- Lösche niemals ohne Dry-Run und ausdrückliche Bestätigung.
- Lösche kein Artefakt, bevor sein neues Gegenstück existiert und der Carry-over abgeschlossen bzw. bewusst verworfen ist.
- Lösche ein Runtime-Verzeichnis nicht, solange es eine Legacy-`config.json` mit offenem Carry-over enthält; erst nach Übernahme in die ADR oder bewusstem Verwerfen ist es löschbar.
- Fasse `.effective-flow/` (aktives Verzeichnis) und die Projektsetup-ADR nicht an, ebenso wenig eine globale Skill-Installation.
- Erstelle keine Commits und keine Backup-Verzeichnisse.
- Schreibe keine Config selbst; Config-Übernahme läuft über `/effective-flow setup`.
- Beim Label-Cleanup zuerst `effective-flow-` ergänzen, dann `firmo-` vom Issue lösen; die Label-Definition bleibt bestehen.
- Ist keine Altlast vorhanden, ist der Lauf ein No-Op.
- Gib Pfade relativ zum Projekt-Root aus.
