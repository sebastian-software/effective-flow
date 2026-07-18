
# Effective Flow Apply

Du bist der Einstiegs-Router, der eine beliebige Apply-Quelle klassifiziert und an den
passenden Umsetzungs-Skill weitergibt.

## Ziel

Dieser Skill nimmt ein einzelnes Argument (oder keines) entgegen, bestimmt über die
gemeinsame Apply-Quellen-Erkennung den Quelltyp und delegiert an den zuständigen Skill:

- Plan-Datei → ``tools/apply-plan.md``
- Review-Report (lokal) → ``tools/apply-review.md``
- Review-Epic / Review-Finding-Issue (remote) → ``tools/apply-review.md``
- Container-Issue / frei geschriebenes Issue → ``tools/apply-issues.md``

Der Skill implementiert nichts selbst, klassifiziert nur und delegiert. Umsetzung,
Validierung, Review, Status-/Kommentar-Updates und Commit-Vorbereitung liegen
vollständig beim Ziel-Skill.

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

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor der Klassifikation und
beachte ihre Vorgaben für Routing und User-Rückfragen.

## Apply-Quellen-Erkennung

`<plan.dir>` ist das Plan-Verzeichnis aus der Effective Flow-Konfiguration (Projektsetup-ADR) `plan.dir` (Default
`docs/plan`).

Dieser geteilte Baustein ist die einzige Quelle der Wahrheit dafür, **welcher
Apply-Quelltyp** ein übergebenes Argument ist. Er wird von `$effective-flow apply`
(Router) sowie von ``tools/apply-plan.md``, ``tools/apply-review.md`` und
``tools/apply-issues.md`` für die vorgelagerte Argument-Klassifikation genutzt.

Der Baustein klassifiziert nur und löst die Referenz auf ein Handle (Dateipfad bzw.
Issue-Nummer(n)) auf. Er trifft **keine** Umsetzungsentscheidung, ändert nichts und
liest keine Findings/Container-Inhalte tiefer als für die Klassifikation nötig. Die
type-spezifische Tiefenlogik (Planstatus, Finding-Parsing, Container-Expansion) bleibt
im jeweiligen Skill.

### Kanonische Quelltypen

| Typ               | Bedeutung                                                                                                  | Zuständiger Skill                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `plan`            | Plan-Datei unter `<plan.dir>/`                                                                             | ``tools/apply-plan.md``                         |
| `review-report`   | Review-Report-Datei unter `.effective-flow/review/`                                                        | ``tools/apply-review.md`` (lokal)               |
| `review-epic`     | Tracking-/Epic-Issue eines `$effective-flow review`-Laufs                                                        | ``tools/apply-review.md`` (remote, Epic)        |
| `review-finding`  | einzelnes Finding-Issue eines `$effective-flow review`-Laufs                                                     | ``tools/apply-review.md`` (remote, Issue-Liste) |
| `container-issue` | generisches Issue mit Sub-Issue-Checkliste, ohne Review-Label (`effective-flow-review-*`/`firmo-review-*`) | ``tools/apply-issues.md``                       |
| `plain-issue`     | frei geschriebenes Menschen-Issue                                                                          | ``tools/apply-issues.md``                       |

Sonderergebnisse: `none` (kein/leeres Argument) und `ambiguous` (nicht eindeutig
auflösbar). `issue-reference` ist ein **Zwischenergebnis** aus Stufe A für eine noch
nicht in den Subtyp aufgelöste Issue-Referenz; Stufe B verfeinert es.

### Stufe A: syntaktische Klassifikation (nur Dateisystem)

Stufe A benötigt keine Tracker-I/O und steht jedem Skill zur Verfügung. Bestimme den
Typ in dieser Reihenfolge (erste zutreffende Regel gewinnt):

1. **Leeres/kein Argument** → `none`.
2. **Plan-Referenz** → `plan`, wenn sich das Argument auf genau eine Datei unter
   `<plan.dir>/` oder `<plan.dir>/archive/` auflöst. Erlaubte Formen wie in
   `plan-reference-routing`: vollständiger Pfad (`<plan.dir>/YYYY-MM-DD-…md`),
   Datums-Slug-Dateiname (`YYYY-MM-DD-…md`), Legacy-Nummer ohne Pfad (`NNNN`, primär
   über die H1 aufgelöst) oder – als Fallback – der Titel-Slug.
3. **Review-Report** → `review-report`, wenn das Argument ein `*.md`-Pfad unter
   `.effective-flow/review/` ist (bzw. ein Dateiname, der sich dort auflöst).
4. **Issue-Referenz** → `issue-reference` (weiter mit Stufe B), wenn das Argument eine
   bare Issue-Nummer (`123`), ein `#123` oder eine Issue-URL ist. Issue-URLs sind
   hostneutral: erkenne `https://<host>/<owner>/<repo>/issues/<nr>` und vergleichbare
   Forgejo-/Gitea-URL-Formen genauso wie GitHub-URLs. Mehrere solcher Referenzen werden
   als Liste behandelt und einzeln in Stufe B klassifiziert.
5. **Sonst** → `ambiguous`: das Argument löst sich zu keiner Kategorie auf oder passt
   gleichzeitig zu einer Plan- **und** einer Review-Datei. Nicht raten – der Aufrufer
   fragt nach (siehe „Mehrdeutigkeit und Fallbacks“).

Trennschärfe Plan vs. Report: primär über das Verzeichnis (`<plan.dir>/` bzw.
`<plan.dir>/archive/` vs. `.effective-flow/review/`), sekundär über den Kopf-Inhalt
(Planstatus-Marker `**Planungsstatus:**` / `**Plan status:**` vs.
`### [R-XXXXXXX]`-Finding-Blöcke). Eine vierstellige Nummer ohne Pfad ist immer eine
(Legacy-)Plan-Referenz, nie eine Issue-Referenz.

### Stufe B: Issue-Subtyp (Tracker)

Stufe B verfeinert eine `issue-reference` aus Stufe A in den konkreten Subtyp. Sie
setzt die Host-/CLI-Erkennung und Verfügbarkeitsprüfung aus `issue-tracker.md`
voraus; ein Skill, der Stufe B nutzt, bindet daher auch `issue-tracker.md` ein.
``tools/apply-plan.md`` braucht Stufe B nicht – für einen Plan-Skill genügt Stufe A,
um eine Issue-Referenz als Fremdtyp zu erkennen und weiterzuleiten.

Lies je Issue Labels und Body **einmal frisch** vom Tracker und bestimme den Subtyp in
dieser Präzedenz – **Label vor Body-Struktur**:

1. Label `effective-flow-review-epic` (oder Alt `firmo-review-epic`) → `review-epic`.
2. Label `effective-flow-review-finding` (oder Alt `firmo-review-finding`) → `review-finding`.
3. kein Review-Label, aber der Body enthält eine Sub-Issue-Checkliste
   (`- [ ] #NNN …` / `- [x] #NNN …`) → `container-issue`.
4. sonst → `plain-issue`.

Sekundärsignal bei fehlendem Label (z. B. manuell entfernt): ein Titel im Format
`[R-XXXXXXX] …` zusammen mit einem `**Signatur**`-Feld im Body wird wie
`review-finding` behandelt. Bleibt der Subtyp danach unklar → `ambiguous`.

Warum Label vor Body: Ein `review-epic` trägt – wie ein generisches
`container-issue` – eine `- [ ] #NNN`-Checkliste. Das Label `effective-flow-review-epic` bzw.
`effective-flow-review-finding` (Alt-Präfix `firmo-` gleichwertig, siehe „Label-Konvention“ in
`issue-tracker.md`) ist der sichere Diskriminator und hat Vorrang vor der
Body-Struktur.

### Ownership und Modus

Aus dem finalen Quelltyp folgt genau ein zuständiger Skill und – bei
``tools/apply-review.md`` – der Modus:

| Quelltyp          | Zuständiger Skill        | Modus / Hinweis                  |
| ----------------- | ------------------------ | -------------------------------- |
| `plan`            | ``tools/apply-plan.md``   | –                                |
| `review-report`   | ``tools/apply-review.md`` | lokaler Report-Fluss             |
| `review-epic`     | ``tools/apply-review.md`` | Remote-Modus, Epic-Modus         |
| `review-finding`  | ``tools/apply-review.md`` | Remote-Modus, Issue-Listen-Modus |
| `container-issue` | ``tools/apply-issues.md`` | Container-Expansion im Skill     |
| `plain-issue`     | ``tools/apply-issues.md`` | Einzel-Arbeitsitem               |

Konsistenz mit `issue-tracker.md`: Die dortige Regel „Argumenttyp überschreibt den
Config-Modus" bleibt gültig – ein `review-report` erzwingt `local`, ein
`review-epic`/`review-finding` erzwingt `remote`. Dieser Baustein liefert genau diesen
Argumenttyp.

### Mehrdeutigkeit und Fallbacks

- **`none` (kein Argument):** nicht heuristisch das „neueste“ wählen. Der Aufrufer
  listet lokale Kandidaten (offene Pläne aus `<plan.dir>/`, Report-Dateien unter
  `.effective-flow/review/`) und fragt nach der konkreten Quelle. Ist der effektive
  Tracker-Modus `remote`, listet er zusätzlich offene Review-Epics (Label
  `effective-flow-review-epic`, inkl. Alt `firmo-review-epic`) als Kandidaten, da im
  Remote-Modus keine lokalen Report-Dateien existieren.
- **`ambiguous`:** die konkurrierenden Deutungen benennen und nachfragen, statt zu
  raten.
- **Gemischte Issue-Liste** (verschiedene Subtypen in einem Aufruf, z. B. `review-finding`
  und `plain-issue`): nicht raten. Den User bitten, die Liste nach Zieltyp zu trennen,
  bzw. – im Router – pro Issue routen. Konservativ: nachfragen.
- **Issue-Referenz, aber Tracker-CLI fehlt/nicht authentifiziert:** Stufe B kann nicht
  laufen → klare Fehlermeldung mit Behebungshinweis gemäß „Fehler- und Randfälle“ in
  `issue-tracker.md`; kein stiller Fallback auf einen lokalen Typ.
- **Nicht auflösbarer Pfad:** `ambiguous` → nachfragen bzw. Fehlermeldung; nenne, dass
  `$effective-flow open-plans` offene Pläne auflisten kann.

### Verwendung durch die Skills

- **Router (`$effective-flow apply`):** führt Stufe A und – für Issue-Referenzen –
  Stufe B aus, meldet den erkannten Typ und delegiert an den zuständigen Skill mit dem
  Original-Argument. Bei `none`/`ambiguous`/gemischter Liste: nachfragen.
- **Zuständigkeits-Skill (jeder der drei Apply-Skills):** klassifiziert das Argument
  früh über diesen Baustein. Passt der Typ zur eigenen Zuständigkeit → weiter mit der
  eigenen Tiefenlogik. Passt er nicht:
  - **Direktaufruf durch den User:** klar auf den zuständigen Skill (oder
    `$effective-flow apply`) verweisen und beenden.
  - **Delegation aus `$effective-flow apply`:** sollte nicht auftreten, da der Router
    korrekt geroutet hat; die Weiche bleibt als Schutz bestehen.

## Klärungs-Gate (vollständig geklärt?)

Bevor eine Grundlage (Plan-Datei, Issue oder Review-Finding) umgesetzt wird, prüft dieses
Gate, ob sie **vollständig geklärt** und **ohne Rückfrage umsetzbar** ist. Das Gate greift
an **beiden** Einstiegspunkten: in der Apply-Kette (`$effective-flow apply` →
``tools/apply-plan.md``/``tools/apply-issues.md``/``tools/apply-review.md``) **und** bei
Direktaufruf eines umsetzenden Workflows (`$effective-flow build`, `$effective-flow fix`,
`$effective-flow refactor`, `$effective-flow docs`) mit einer Plan-Datei.

Leitprinzip: **Keine Annahmen außer absolut offensichtlichen.** Im Zweifel lieber eine
Klärungsrunde zu viel als eine zu wenig.

### Abbruchkriterien (mindestens eines trifft zu → nicht umsetzen)

- **Offene Punkte:** Der Plan enthält einen Abschnitt `## Offene Punkte` bzw.
  `## Open Points` mit anderen Einträgen als dem Leerzustand (`- Keine offenen Punkte.` /
  `- No open points.`).
- **Fehlende messbare Akzeptanzkriterien:** Es gibt keine Akzeptanzkriterien, oder sie sind
  ohne benannte Prüfung/Messgröße formuliert (kein konkreter Check, kein prüfbarer
  Zielzustand).
- **Umsetzungsrelevante Annahmen:** Der Plan enthält als Annahme markierte Unklarheiten, die
  das Verhalten, den Scope oder das Risiko der Umsetzung wesentlich beeinflussen.
- **Nicht self-contained (Issues/Findings):** Ein Issue oder Finding beschreibt die
  gewünschte Umsetzung nicht ausreichend eigenständig, um sie ohne Rückfrage abzuarbeiten.

Reine, unkritische Annahmen ohne Umsetzungsrelevanz blockieren nicht.

### Verhalten am Gate

- **Bestanden** (kein Kriterium trifft zu): weiter zur Umsetzung.
- **Nicht bestanden:** die betroffenen Punkte kurz benennen, in eine Klärungsrunde
  zurückverweisen und den aktuellen Skill beenden, statt teilweise umzusetzen oder zu raten.
  Zielskill der Klärung: eine Plan-Datei geht an `$effective-flow plan` bzw. dessen vertieften
  Plan-Review (`$effective-flow review <plandatei>`); ein Issue oder Finding geht an
  `$effective-flow plan-issue`.

Das Gate ersetzt die frühere separate „Offene Punkte prüfen“-Prüfung: Wo ein Workflow diese
Prüfung bisher einzeln ausgeführt hat, gilt nun dieses Gate als die eine maßgebliche Instanz,
um Doppelpflege zu vermeiden.

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

## Workflow

### Phase 1: Quelle klassifizieren

1. Lies das User-Argument.
2. Wende die „Apply-Quellen-Erkennung“ an: Stufe A (syntaktisch) und – für eine
   Issue-Referenz – Stufe B (Tracker). Für Stufe B gelten die Host-/CLI-Erkennung und
   Verfügbarkeitsprüfung aus „Issue-Tracker-Anbindung (Remote-Modus)“; fehlt das CLI
   oder die Authentifizierung, brich mit klarer Meldung ab (kein stiller Fallback).
3. Behandle die Sonderergebnisse:
   - **`none` (kein Argument):** liste lokale Kandidaten – offene Pläne aus
     `<plan.dir>/` (Status `**Planungsstatus:** Nicht umgesetzt` bzw.
     `**Plan status:** Not implemented`) und Report-Dateien unter `.effective-flow/review/`.
     Ist der effektive Tracker-Modus `remote` (siehe „Issue-Tracker-Anbindung“),
     liste zusätzlich offene Review-Epics (Label `effective-flow-review-epic`, inkl. Alt
     `firmo-review-epic`) als Kandidaten auf – im Remote-Modus werden keine lokalen
     Report-Dateien geschrieben, sodass sonst keine Quelle angeboten würde. Frage
     danach den User nach der konkreten Quelle. Wähle nichts heuristisch aus.
   - **`ambiguous`:** benenne die konkurrierenden Deutungen und frage nach.
   - **Gemischte Issue-Liste:** wenn die übergebenen Issue-Referenzen zu
     unterschiedlichen Zuständigkeiten führen (z. B. `review-finding` **und**
     `plain-issue`), bitte den User, die Liste nach Zieltyp zu trennen; route nicht
     halb. Führen alle Referenzen zum selben Ziel-Skill, fahre normal fort.

### Phase 2: An den zuständigen Skill delegieren

1. Gib dem User kurz aus:
   - erkannter Quelltyp
   - aufgelöstes Handle (Plan-Pfad, Report-Pfad oder Issue-Nummer(n))
   - zuständiger Ziel-Skill (bei ``tools/apply-review.md`` zusätzlich der Modus:
     lokaler Report, Remote-Epic oder Remote-Issue-Liste)
2. Starte den zuständigen Skill mit dem Original-Argument:
   - `plan` → ``tools/apply-plan.md` <arg>`
   - `review-report` / `review-epic` / `review-finding` → ``tools/apply-review.md` <arg>`
   - `container-issue` / `plain-issue` → ``tools/apply-issues.md` <arg>`
3. Übergib als Kontext, dass `$effective-flow apply` die Quelle bereits klassifiziert hat,
   samt erkanntem Quelltyp. Danach liegt die gesamte Verantwortung beim Ziel-Skill.
4. Der Ziel-Skill prüft die Grundlage selbst gegen das „Klärungs-Gate“, bevor er
   umsetzt. `$effective-flow apply` selbst führt diese Prüfung nicht aus und implementiert
   nichts. Bei geklärter Grundlage bevorzugt der Ziel-Skill nach einer Bestätigung die
   goal-getriebene, autonome Umsetzung (siehe „Explizite Goal-Abfrage für autonome
   Läufe“ in `goal-completion.md`).

## Regeln

- Ändere selbst keine Implementierungs-, Plan-, Report- oder Tracker-Dateien.
- Klassifiziere über die gemeinsame „Apply-Quellen-Erkennung“; führe keine eigene,
  abweichende Erkennungslogik ein.
- Starte keine Build-, Test-, Validator- oder Reviewer-Phase selbst.
- Verwende keine heuristische „neueste Quelle“, wenn mehrere Kandidaten existieren.
- Wenn der Quelltyp unklar oder mehrdeutig ist, frage nach statt zu raten.
- Gib Pfade relativ zum Projekt-Root aus.
