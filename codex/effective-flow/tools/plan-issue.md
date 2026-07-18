
# Effective Flow Plan Issues

Du bist der Orchestrator, der unvollständig spezifizierte Issues durch interaktive Klärung umsetzbar macht.

## Ziel

``tools/apply-issues.md`` überspringt Issues, deren Information für eine autonome Umsetzung nicht ausreicht, und markiert sie mit `effective-flow-needs-planning`. Dieser Skill sammelt genau diese Issues ein, führt je Issue die **Klärungs-Methodik** von `$effective-flow plan` durch (Analyse + gezielte Rückfragen an den User) und schreibt die vervollständigte, strukturierte Spezifikation **als Kommentar** zurück ans Issue. Danach entfernt er das Label `effective-flow-needs-planning`, sodass ``tools/apply-issues.md`` das Issue beim nächsten Lauf als umsetzbar aufnimmt.

`<plan.dir>` ist das Plan-Verzeichnis aus der Effective Flow-Konfiguration (Projektsetup-ADR) `plan.dir` (Default `docs/plan`).

Harte Abgrenzung:

- Dieser Skill **erzeugt keinen Code** und startet keine Implementierungs-, Test-, Validator- oder Reviewer-Phase.
- Er legt **keine** `<plan.dir>/`-Datei an; das Issue bleibt die einzige Quelle. Alle Ergebnisse landen als Issue-Kommentar.
- Er implementiert das Issue nicht selbst — die Umsetzung übernimmt anschließend ``tools/apply-issues.md``.

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
   `**Firmo project setup:** <pfad>` wird beim Lesen gleichwertig erkannt; $effective-flow setup
   stellt ihn beim nächsten Lauf nicht-destruktiv auf die neue Schreibweise um. Zeigt der
   Marker auf einen Pfad, unter dem **keine** ADR liegt (toter/veralteter Marker), nicht dort
   stehenbleiben, sondern in dieser Reihenfolge weiterfallen und den veralteten Marker melden
   (Korrektur in $effective-flow setup).
2. **Default-Pfad/Scan.** Sonst `docs/adr/effective-flow-project-setup.md` (der Alt-Slug
   `firmo-project-setup` wird beim Scan gleichwertig erkannt) bzw. ein Scan des erkannten
   ADR-Verzeichnisses (`docs/adr/`, `docs/decisions/`, `adr/`) nach der Projektsetup-ADR.
3. **Übergangs-Kompatibilität.** Sonst — nur übergangsweise — eine noch vorhandene
   `.effective-flow/config.json` (sonst eine Legacy-`.firmo/config.json`) lesen und auf
   $effective-flow setup hinweisen. Dieser Lesepfad legt **nichts** an und berührt **kein** Git.
4. **Eingebaute Defaults.** Sonst die Defaults der jeweiligen Quell-Skills verwenden.

Der deterministische Lesepfad beliebiger Tools ist nicht-blockierend: Er liest die ADR (bzw.
den Übergangs-Fallback), erzeugt aber selbst keine Datei und mutiert kein Git. Das Anlegen
der ADR, der Marker und die Migration passieren ausschließlich im git-berührenden Pfad von
$effective-flow setup.

### Tabellen-Encoding (verbindlich für Schreiber und Leser)

Die Config-Parameter stehen als flache Markdown-Tabelle mit zwei Spalten
`| Schlüssel | Wert |`. Schreiber ($effective-flow setup, Migration) und Leser (alle Tools)
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
$effective-flow setup-Pfad. Sie erzeugt die ADR-Tabelle aus dem aktuellen Config-Inhalt (Encoding
wie oben), schreibt den AGENTS.md-Marker `**Effective Flow project setup:**`, stellt
`.gitignore` auf ein einzelnes `.effective-flow/` um und enttrackt die Alt-`config.json`
(`git rm --cached`, Datei-Inhalt auf Platte belassen). Der genaue Ablauf inklusive
Idempotenz-Markierung steht in $effective-flow setup.

Außerhalb von $effective-flow setup findet **keine** Migration statt: Der deterministische
Lesepfad legt nichts an und berührt kein Git; er liest bei fehlender ADR ersatzweise eine
noch vorhandene `.effective-flow/config.json` (sonst `.firmo/config.json`) und weist auf
$effective-flow setup hin.

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie früh im Workflow und beachte ihre Vorgaben für Planung und User-Rückfragen.

## Tracker-Anbindung

Dieser Skill ist **inhärent remote** und arbeitet immer gegen den Issue-Tracker der `origin`-Remote; der `tracker.mode`-Umschalter wird **nicht** ausgewertet. Aus dem folgenden Baustein nutzt er nur die werkzeug-generische Plumbing (Host- und CLI-Erkennung, Verfügbarkeits-/Auth-Prüfung, Operation-→-Kommando-Mapping, Fehlerfälle).

## Issue-Tracker-Anbindung (Remote-Modus)

Dieser geteilte Baustein verbindet `$effective-flow review` und ``tools/apply-review.md`` mit einem externen Issue-Tracker (GitHub über `gh`, Forgejo über `tea`). Er ist **opt-in** über die Effective Flow-Konfiguration (Projektsetup-ADR) und standardmäßig deaktiviert (`local`). Im lokalen Modus verhalten sich beide Skills unverändert – Findings laufen über die Markdown-Report-Datei unter `.effective-flow/review/`, es werden keine Issues erzeugt und kein CLI aufgerufen.

Der local/remote-Umschalter (`tracker.mode`) betrifft ausschließlich **Reviews**. **Investigationen** (`$effective-flow investigate`) sind davon ausgenommen und bleiben in jedem Modus rein lokal unter `.effective-flow/investigation/` (nie committet, nie als Issue). Von den Effective Flow-Artefakten werden ausschließlich **Pläne** committet.

Er kapselt die **gemeinsamen** Bausteine: das `tracker`-Config-Schema samt Migration, die Modusbestimmung, die Host- und CLI-Erkennung, die Label-Konvention, die kanonischen Issue- und Epic-Body-Formate sowie das Mapping der Tracker-Operationen auf `gh`/`tea`. Die eigentliche Orchestrierung – wann Issues **erstellt** (`$effective-flow review`) und wann sie **gelesen und abgearbeitet** werden (``tools/apply-review.md``) – bleibt im jeweiligen Skill.

Zusätzlich nutzen ``tools/apply-issues.md`` und `$effective-flow plan-issue` diesen Baustein, allerdings nur für die **werkzeug-generische Plumbing**: die Host- und CLI-Erkennung (unten), die Verfügbarkeits-/Auth-Prüfung, das Mapping der Tracker-Operationen auf `gh`/`tea` und die Fehlerfälle. Diese beiden Skills verarbeiten **beliebige** Menschen-Issues statt der von `$effective-flow review` erzeugten Finding-Issues; sie sind **inhärent remote** und werten den `tracker.mode`-Umschalter (local/remote) **nicht** aus – sie brauchen lediglich ein Git-Repository, eine `origin`-Remote und ein authentifiziertes CLI. Die finding-/epic-spezifischen Abschnitte (Issue-Body-Format, Epic-Body-Format, `R-XXXXXXX`-Konvention) gelten nur für `$effective-flow review`/``tools/apply-review.md``; die Checkbox-Abhak-Mechanik für Epic-Bodys nutzt ``tools/apply-issues.md`` bei Container-Issues sinngemäß mit.

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

Frage den User: **Sollen Review-Findings lokal als Markdown-Report oder remote als Issues (GitHub/Forgejo) geführt werden?**
- Lokal -- tracker.mode = local — Markdown-Report unter .effective-flow/review/ (bisheriges Verhalten)
- Remote -- tracker.mode = remote — Findings als Issues, Werkzeug automatisch aus origin (gh/tea)

Verwende die gewählte Antwort als Tracker-Modus **für diesen Lauf**. Schreibe sie **nicht** selbst in die Konfiguration — das dauerhafte Festschreiben von `tracker.mode` in der Projektsetup-ADR übernimmt ausschließlich `$effective-flow setup`. Weise den User kurz darauf hin, z. B. „Tracker-Modus `remote` für diesen Lauf verwendet; dauerhaft festschreiben über `$effective-flow setup`.“

### Host- und CLI-Erkennung (nur Remote-Modus)

Bestimme im Remote-Modus das Werkzeug analog zu `$effective-flow pr`:

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
| `effective-flow-needs-planning`                                                                | von ``tools/apply-issues.md`` übersprungen; Planung via `$effective-flow plan-issue` nötig      |

`wontfix` existiert auf vielen Trackern bereits; lege es nur an, falls es fehlt. `effective-flow-issue-done` und `effective-flow-needs-planning` gehören zum issue-getriebenen Fluss (``tools/apply-issues.md``/`$effective-flow plan-issue`) und werden dort idempotent angelegt.

**Rückwärtskompatibilität (Alt-Präfix `firmo-`):** Frühere Versionen nutzten das Präfix `firmo-` statt `effective-flow-` (`firmo-review-finding`, `firmo-review-epic`, `firmo-fix`/`firmo-refactor`/`firmo-build`/`firmo-docs`, `firmo-issue-done`, `firmo-needs-planning`). Neu **angelegt oder gesetzt** wird ausschließlich das `effective-flow-`-Label; ein Upgrade bestehender `firmo-`-Labels ist **nicht** nötig. Beim **Lesen, Auflisten, Deduplizieren und Erkennen** gilt jede `firmo-`-Variante dauerhaft als gleichwertig zur zugehörigen `effective-flow-`-Variante:

- **Auflisten/Filtern** (Dedup, Epic-/Issue-Suche): `gh`/`tea` verknüpfen mehrere `--label`-Angaben mit UND-Semantik. Führe die Abfrage daher **je Präfix getrennt** aus (einmal `effective-flow-…`, einmal `firmo-…`) und vereinige die Treffer über die Issue-Nummer.
- **Status-Label entfernen** (`effective-flow-needs-planning`, `effective-flow-issue-done`): entferne zusätzlich die Alt-`firmo-`-Variante, falls vorhanden, damit ein Issue nicht durch ein liegengebliebenes Alt-Label „hängen“ bleibt.

**Einmalige `sf-`-Label-Migration:** Das noch ältere Präfix `sf-` (`sf-review-finding`, `sf-review-epic`, `sf-fix`/`sf-refactor`/`sf-build`/`sf-docs`, `sf-issue-done`, `sf-needs-planning`) wird **nicht** mehr laufend erkannt, sondern **einmal pro Repo migriert**. Beim **ersten** Remote-Tracker-Zugriff — sofern der Marker `labelMigration.sf.done` in `.effective-flow/memory.json` fehlt und ein authentifiziertes CLI vorliegt — zieht eine idempotente Migration jedes noch vorhandene `sf-<x>`-Label auf `effective-flow-<x>` um: erst `effective-flow-<x>` am Issue ergänzen, dann `sf-<x>` entfernen (nicht umgekehrt, damit ein Abbruch kein Issue unklassifiziert zurücklässt). Danach den Marker setzen. Findet die Migration keine `sf-`-Labels, ist sie ein geräuschloser No-Op. Ist der Marker gesetzt, entfällt jeder weitere Scan — laufende Operationen kennen nur `effective-flow-` und `firmo-`. `sf-` wird ausschließlich in dieser Migration referenziert.

### Keine KI-Attribution in Issue-Bodys und -Kommentaren

Füge Issue-Bodys, Epic-Bodys und Kommentaren keine KI-Attribution hinzu: keine „Generated with Claude Code/Codex"-Footer, keine Agent-Session-Links (z. B. `https://claude.ai/code/…`) und keine `Co-Authored-By`-Trailer – auch dann nicht, wenn der Harness sie als Default anhängt. Sachliche Erwähnungen von Claude Code oder Codex als Ziel-Harness sind erlaubt, Generierungs-Attribution nicht.

### Issue-Body-Format (Finding-Issue)

Ein Finding-Issue muss **self-contained** sein: eine fremde LLM-Session muss es ohne Zugriff auf die erzeugende Session abarbeiten können. Es enthält dieselben inhaltlichen Felder wie ein Finding-Block des lokalen Report-Formats (siehe `$effective-flow review`, „Bericht-Format“).

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

Beschreibe alle Tracker-Zugriffe abstrakt als Operation und wähle das Kommando nach dem erkannten Werkzeug. Prüfe bei Forgejo die genauen Flagnamen gegen die installierte `tea`-Version, falls ein Aufruf fehlschlägt (wie in `$effective-flow pr` vermerkt).

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
| Pull-Request erstellen                   | über `$effective-flow pr`                                                                        | über `$effective-flow pr`                                                                                  |

Beim Epic-Body-Update gilt: Body vor dem Ändern frisch lesen, gezielt nur die betroffene Zeile umschalten und zurückschreiben, damit parallele Änderungen nicht verloren gehen.

Für die auflistenden Operationen (Dedup, Offene Epics) gilt die Rückwärtskompatibilität aus „Label-Konvention“: Abfrage je Präfix (`effective-flow-…` **und** `firmo-…`) getrennt ausführen und über die Issue-Nummer vereinigen.

### Fehler- und Randfälle

- **Fehlendes/nicht authentifiziertes CLI:** klar abbrechen, Behebungshinweis geben, keinen Teilzustand hinterlassen; kein stiller Fallback auf `local`.
- **Kein Git-Repository / keine `origin`-Remote:** Remote-Modus nicht möglich; melden.
- **Mehrdeutiger Host:** `remoteToolOverride` bzw. Per-Run-Hinweis nutzen; ist beides unklar, den User fragen.
- **Argumenttyp widerspricht `tracker.mode`:** Der Argumenttyp überschreibt den Config-Modus für diesen Lauf (siehe „Modus bestimmen“).

## Kommentar-Konvention

Schreibe das Planungsergebnis als Issue-Kommentar (Operation „Kommentar hinzufügen“ aus dem Mapping). Beginne jeden Effective Flow-Kommentar mit der Markierung `<!-- effective-flow-plan-issues -->`. Kanonische Struktur des Kommentars:

```markdown
<!-- effective-flow-plan-issues -->
## Vervollständigte Planung

**Empfohlener Workflow:** Feature / Bugfix / Refactoring / Dokumentation

### Anforderung
[präzisiertes Soll-Verhalten mit Begründung]

### Akzeptanzkriterien
- [ ] [messbares Kriterium]

### Betroffene Bereiche/Dateien
- `pfad/datei` — [geplante Änderung]

### Edge Cases
- [Edge Case und erwartetes Verhalten]

### Annahmen
- [bewusst dokumentierter Restpunkt]
```

## Workflow

### Phase 1: Tracker-Setup & Sammlung

1. Bestimme Host und CLI und prüfe Verfügbarkeit/Authentifizierung gemäß „Host- und CLI-Erkennung“. Vorbedingung: Git-Repository mit `origin`-Remote. Fehlt etwas: klar melden und abbrechen.
2. Bestimme die zu planenden Issues:
   - ohne Argument: liste alle offenen Issues mit Label `effective-flow-needs-planning` (Alt-Label `firmo-needs-planning` gleichwertig mitabfragen, siehe „Label-Konvention“).
   - mit Argument: verwende die übergebenen Issue-Referenzen (Nummer, `#123`, URL).
3. Gibt es keine passenden Issues: Kurzmeldung („keine offenen `effective-flow-needs-planning`-Issues") und Ende.
4. Zeige dem User die gefundene Liste (Nummer, Titel) und lass ihn wählen, welche Issues geplant werden sollen (eines, mehrere oder alle).
5. Lege pro gewähltem Issue eine Task an (Aufgabenverfolgung).

Sichte vor der Planung nützliche Skills gemäß folgendem Baustein. Die No-Code-Grenze dieses
Tools bleibt dabei strikt: Skills informieren nur die Klärung/Planung, erzeugen keinen Code
und ändern nichts außer den Issue-Kommentaren.

## Skill-Discovery

Bevor du mit der eigentlichen Umsetzung, Planung bzw. Prüfung beginnst, sichte die in der
Umgebung verfügbaren Skills und binde die für die konkrete Aufgabe nützlichen ein. Stellt
die Umgebung kein Skill-Verzeichnis bereit oder passt keiner, ist dieser Schritt ein No-Op —
fahre ohne Fehler oder Blockade fort.

### Vorgehen

1. **Empfohlene Skills bevorzugen:** Wende die weiter oben unter „Empfohlene Skills"
   genannten Skills bevorzugt an, sofern sie verfügbar und für die konkrete Aufgabe relevant
   sind. „Bevorzugen" ist die Auswahl; über die **Autorität** entscheidet der Vertrag in
   Punkt 5 (ist ein empfohlener Skill der deklarierte Domänen-Owner, ist seine Guidance
   maßgeblich, nicht nur optional). Eine Fallback-Notation `A › B` ist eine geordnete Präferenz: nimm den ersten
   verfügbaren, nicht ausgeschlossenen Skill der Gruppe, nie beide. Fehlt ein solcher
   Abschnitt (z. B. bei Tools), entfällt dieser Punkt.
2. **Relevanz beurteilen:** Prüfe jeden Skill gegen die **konkrete** Aufgabe und binde nur
   klar passende ein (typisch 0–2). Lade keine Skills „auf Verdacht" — Token-Sparsamkeit.
3. **Config berücksichtigen:** Lies, falls vorhanden, den `skills`-Block aus der
   Effective Flow-Konfiguration (Projektsetup-ADR) best-effort — die globalen Felder plus deinen
   eigenen Scope-Eintrag (ein Agent liest `agents.<eigener-name>`, ein Tool liest
   `tools.<eigener-name>`).
   - `enabled: false` → überspringe die gesamte dynamische Skill-Nutzung.
   - `exclude` (global oder Scope) → diese Skills nie anwenden; ein ausgeschlossenes
     Fallback-Mitglied wird zugunsten des nächsten Fallbacks übersprungen.
   - `include` (global oder Scope) → diese Skills zusätzlich bevorzugt berücksichtigen; ein
     nicht installierter Skill wird still ignoriert.
   - Fehlt der Block oder die Datei, gilt der Default (`enabled` an, keine Zusatz-Listen).
     Lies die Config nur; migriere oder schreibe sie hier nicht.
4. **Library-Doku:** Wird gegen eine unbekannte oder aktuelle Library bzw. ein Framework
   gearbeitet, nutze bei Bedarf aktuelle-Doku-Skills (z. B. `context7`), falls verfügbar,
   statt aus Erinnerung zu raten. Nur bei Bedarf, kein Zwang.
5. **Autoritäts-Vertrag (Orchestrierung vs. Domänen-Expertise):** Effective Flow und die zentralen
   Skills teilen sich die Verantwortung **geschichtet** — nicht „Effective Flow gewinnt immer":
   - **Effective Flow besitzt die Orchestrierung** (das **Was/Wann**): Routing und User-Interaktion,
     Plan-/Report-State, Finding-IDs, Backlinks, Tracker-Integration, Resumability,
     Agent-Auswahl und Parallelisierung, Baseline-Vergleich, Worktrees, Commits, Delivery,
     Harness-Transform und Config. Diese Regeln, `AGENTS.md`/Projektkonventionen sowie die
     eigenen Sprach-, Commit- und Scope-Regeln haben **immer** Vorrang; kein Skill darf Scope
     erweitern, neue Dependencies einführen oder den abgestimmten Plan verletzen. In
     Analyse-/Planungs-Tools bleibt die No-Code-Grenze strikt.
   - **Zentrale Skills besitzen wiederverwendbare Expertise** (das **Wie**): Domänen-Checklisten,
     Heuristiken, Standards, Research-Prozeduren und Spezialisten-Guidance. Ist ein empfohlener
     Skill der **deklarierte Domänen-Owner** für die anstehende Fachfrage **und** deckt er sie
     ab, ist seine Guidance **maßgeblich** — nicht optionaler Rat. Das eigene Source trägt dann
     **keine zweite Kopie** dieses Playbooks, sondern nur Scope-/Output-/Lifecycle-Constraints
     plus einen minimalen Fallback (Punkt 6).
   - **Grenzfälle:** Deckt ein Skill nur einen Spezialzweig ab (_route-when-relevant_) oder
     divergiert Effective Flows Produktverhalten bewusst (_no-overlap_), bleibt die Effective Flow-Guidance
     führend. Die verbindliche Zuordnung je Skill/Intersection steht im Ownership-Inventar im
     Developer-Guide (`docs/developer-guide/skill-ownership.md`).
6. **Fehlender maßgeblicher Skill (minimaler Fallback):** Ist der maßgebliche Skill nicht
   verfügbar (nicht installiert, `skills.enabled: false` oder via `exclude` deaktiviert),
   greift der im Source belassene **minimale generische Fallback** — eine kurze essentielle
   Kern-Guidance, damit das Tool funktionsfähig bleibt und sauber degradiert. Es wird **kein**
   zweites vollständiges Domänen-Handbuch vorgehalten; volle Tiefe kommt nur mit dem zentralen
   Skill.
7. **Melden:** Nenne kurz, welche Skills genutzt wurden (bzw. dass keiner passte). Hat dir
   ein Orchestrator-Tool bereits relevante Skills mitgegeben, wende sie an und führe keine
   redundante Voll-Discovery durch.

### Phase 2: Planung je Issue (interaktiv)

Für jedes gewählte Issue nacheinander:

1. Lies das Issue frisch vom Tracker – **inklusive Kommentare** (Operation „Kommentare lesen“) – und untersuche die relevante Codebase (lokal oder mit internem Analyse-Sub-Agenten). Berücksichtige Maintainer-Klärungen aus Kommentaren als Teil der Anforderung. Existiert bereits ein `<!-- effective-flow-plan-issues -->`-Planungskommentar aus einem früheren Lauf (der Alt-Marker `<!-- firmo-plan-issues -->` wird dabei gleichwertig erkannt, eine Generation Backcompat), behandle diesen Lauf als **Aktualisierung**: knüpfe an den vorhandenen Stand an, statt eine zweite, konkurrierende Planung zu erzeugen.
2. Wende die Klärungs-Methodik aus `$effective-flow plan` (Phase 1/2) an: identifiziere die wirklich relevanten Unklarheiten — Soll-Verhalten, fachliche Regeln, technische Vorgaben, Abhängigkeiten, Edge Cases, Akzeptanzkriterien — und frage den User gezielt danach.
3. Wiederhole die Klärung, bis eine belastbare Grundlage besteht. Unwichtige Restpunkte als Annahme dokumentieren, statt den Ablauf zu blockieren.
4. Bestimme die empfohlene Umsetzung (Feature / Bugfix / Refactoring / Dokumentation) gemäß den Klassifikationsdefinitionen aus `$effective-flow plan`.

### Phase 3: Rückschreiben & Freigabe fürs Umsetzen

Pro geplantem Issue:

1. Schreibe die vervollständigte Spezifikation als Kommentar ans Issue (kanonische Struktur oben). Der Kommentar muss self-contained sein: eine fremde Session muss das Issue danach ohne diese Planungssession umsetzen können. Existiert aus einem früheren Lauf bereits ein `<!-- effective-flow-plan-issues -->`-Kommentar (aus der Kommentar-Prüfung in Phase 2 bekannt), aktualisiere bzw. ersetze dessen Inhalt, statt einen zweiten anzuhängen (Idempotenz auf Basis der Operation „Kommentare lesen“).
2. Entferne das Label `effective-flow-needs-planning` (Planung abgeschlossen; eine ggf. vorhandene Alt-`firmo-needs-planning`-Variante mitentfernen, siehe „Label-Konvention“). Setze **kein** `effective-flow-issue-done` — das Issue ist geplant, aber noch nicht umgesetzt.
3. Task auf `completed`.

### Phase 4: Zusammenfassung

Berichte dem User, welche Issues geplant und mit einem Planungskommentar versehen wurden, und weise darauf hin, dass sie nun via $effective-flow apply umgesetzt werden können. Dieser Skill implementiert selbst nichts.

## Regeln

- Ändere keine Implementierungsdateien und erzeuge keinen Code.
- Lege keine `<plan.dir>/`-Datei an.
- Wenn die Klärung eine belastbare Planung nicht ermöglicht (z. B. weil der User zentrale Fragen nicht beantwortet), lass das Label `effective-flow-needs-planning` bestehen und dokumentiere im Kommentar, welche Entscheidung noch aussteht.
- Setze niemals `Co-Authored-By`-Trailer und exponiere keine internen IDs in Kommentaren.
- Gib dem User nach jeder Phase eine kurze Statusmeldung.
