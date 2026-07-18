
# Effective Flow Setup

Du bereitest ein Zielprojekt für die Nutzung von Effective Flow vor: `.gitignore`-Eintrag für das reine Laufzeit-Verzeichnis `.effective-flow/` und interaktive Pflege der Effective Flow-Konfiguration in einer lebenden **Projektsetup-ADR** (Default `docs/adr/effective-flow-project-setup.md`), auf die ein Marker in `AGENTS.md` verweist.

## Ziel

- das Laufzeit-Verzeichnis `.effective-flow/` komplett und idempotent in die `.gitignore` eintragen (nur wenn der Soll-Zustand noch nicht hergestellt ist)
- die Effective Flow-Konfiguration über einen geführten Wizard in die Projektsetup-ADR-Tabelle schreiben oder nicht-destruktiv aktualisieren und den `**Effective Flow project setup:**`-Marker in `AGENTS.md` (bzw. `CLAUDE.md`) setzen
- eine bestehende `.firmo/config.json` einmalig in die ADR migrieren und anschließend enttracken (Datei-Inhalt auf Platte belassen)
- immer von sicheren Defaults starten und dem User zwei Wege bieten: **Express** (Defaults übernehmen) oder **Geführt** (jede Option erklärt durchgehen)
- jede Option so erklären, dass sie auch ohne Vorwissen über die Arbeitsweise von Effective Flow verständlich ist
- bei einer vorhandenen Config bei jeder Auswahl den aktuell festgeschriebenen Wert anzeigen und vorauswählen
- keine Projektvalidation wie Linting, Tests oder Build-Checks ausführen

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

## Lebendes ADR-Modell

Effective Flow führt Architekturentscheidungen (ADRs) als **lebende Dokumente**: mutable
Markdown-Dateien, die stets den aktuell gültigen Stand einer Entscheidung tragen. Es gibt
keine Nummerierung und keine Supersede-Kette; die aktuelle Datei ist die Wahrheit. Dieser
Baustein ist die maßgebliche Konvention für alle **von Effective Flow erzeugten** ADRs.

### Form und Ort

- **Ort:** ADRs liegen im erkannten ADR-Verzeichnis des Projekts, Default `docs/adr/`.
- **Dateiname:** nummernlos, kebab-case-Slug — `docs/adr/<slug>.md` (z. B.
  `docs/adr/effective-flow-project-setup.md`).
- **Titel:** eine H1 mit dem sprechenden Titel — `# <Titel>` (kein `NNNN`-Präfix).
- **Status:** ein `## Status`-Abschnitt hält den aktuellen Zustand. Kanonische Werte:
  `Aktiv`, `Abgelöst`, `Nicht umgesetzt`.
- **Mutabilität:** eine bestehende ADR wird bei Änderung der Entscheidung **in-place**
  aktualisiert (Inhalt und `## Status`), nicht dupliziert oder per Nachfolge-Record ersetzt.
- **Nebenläufigkeit:** die Datei direkt vor dem Schreiben frisch einlesen.

### Referenzierung

Referenzen auf ADRs erfolgen über **Slug oder Titel**, nicht über eine Nummer, z. B.
`(ADR: <slug>)`. Slug-Referenzen bleiben über Inhaltsänderungen hinweg stabil.

### Rückwärts-Lese-Kompatibilität für nummerierte Alt-ADRs

Vorhandene nummerierte Alt-ADRs (`NNNN-*.md`, H1 `# NNNN — Titel`) bleiben **lesbar und per
Nummer auflösbar**. Es gibt **keine** verpflichtende Bulk-Umbenennung; Alt-ADRs werden nicht
angetastet. Neue ADRs entstehen ausschließlich im lebenden Slug-Format. Das spiegelt Effective Flows
etablierte Kompatibilitätslinie (Plan-Nummern per H1, `firmo-`/`effective-flow-`-Labels).

### Verhältnis zum `decision-records`-Skill (deklarierte Konvention + Fallback)

Das oben beschriebene lebende Slug-Modell ist die **deklarierte ADR-Konvention dieses
Repos**. Der Host-Skill `decision-records` ist der Domänen-Owner für die ADR-Craft (ob eine
Entscheidung überhaupt ADR-würdig ist, Lifecycle, Supersession, Index); seine erste
Operating-Regel ist, **die vorhandene Repo-Konvention zu entdecken und ihr zu folgen**, statt
eine eigene zu erzwingen. Genau dieser Baustein ist diese Konvention — der Skill autort
Effective-Flow-ADRs also im lebenden Slug-Format (Ort/Dateiname/Titel/Status/Mutabilität wie
oben), nicht in einem immutabel-nummerierten.

Damit gilt der geschichtete Vertrag (siehe `skill-discovery.md`):

- **`decision-records` maßgeblich, wenn vorhanden.** Der Skill entscheidet, **ob** ein Finding
  eine dauerhafte Entscheidung ist, und autort — falls ja — nach der hier deklarierten
  Konvention. Deklariert das Zielrepo eine **eigene** ADR-Konvention (anderes Verzeichnis,
  Titel-/Status-Format, Index), folgt der Skill dieser; das lebende Slug-Modell ist nur der
  Default, wenn das Repo nichts anderes deklariert.
- **Minimaler Fallback, wenn der Skill fehlt.** Ist `decision-records` nicht verfügbar (nicht
  installiert, `skills.enabled: false` oder via `exclude` deaktiviert), autort das
  aufrufende Tool selbst nach der **minimalen Fallback-Struktur** unten — **kein** stilles
  Erfinden einer zweiten Konvention.

Frühere Fassungen dieses Bausteins beschrieben das Slug-Modell als **bewusste Abweichung**
gegenüber einem angeblich immutabel/nummerierten `decision-records`-Skill. Diese Prämisse ist
überholt: `decision-records` unterstützt inzwischen ein deklariert-lebendes/mutables Modell
(opt-in) und folgt ohnehin der Repo-Konvention. Das lebende Slug-Modell ist deshalb keine
Divergenz mehr, sondern die vom Skill befolgte deklarierte Konvention.

**Koexistenz.** Wo ein Projekt lieber ein anderes ADR-Modell fährt, deklariert es dessen
Konvention im Zielrepo (der Skill folgt ihr) oder schaltet `decision-records` gezielt über die
`skills`-Config (`include`/`exclude`, auch per-Agent/-Tool) zu oder ab.

### Minimale Fallback-Struktur (nur ohne `decision-records`)

Kurze Kern-Struktur, damit ein aufrufendes Tool eine abgelehnte Entscheidung auch ohne den
Skill als lebende Slug-ADR festhalten kann — **kein** zweites vollständiges ADR-Handbuch. Ort
und Form wie unter „Form und Ort“; die Datei vor dem Schreiben frisch einlesen und eine
thematisch passende bestehende ADR in-place aktualisieren statt zu duplizieren:

```markdown
# [Titel der Entscheidung]

## Status

Nicht umgesetzt

## Kontext

[Herkunft: Review-Report + Finding-ID, bzw. Issue-/Epic-Nummer im Remote-Modus]

## Entscheidung

[Kurzbegründung, warum nicht umgesetzt wird]

## Begründung

[Vollständige Entwickler-Anmerkung bzw. `wontfix`-Begründung]

## Quell-Finding

[Finding-ID] aus [Quelle]: [Kurzfassung des Problems]  <!-- nachverfolgbarer Backlink -->
```

Nur **dauerhafte** Entscheidungen werden so festgehalten; eine reine Delivery-Ablehnung ohne
dauerhafte Architektur-Wirkung bleibt im Review-Report bzw. Tracker-Artefakt und wird nicht in
eine ADR gezwungen.

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

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor dem Schreiben und beachte ihre Vorgaben für Konfiguration, Dateiformate und projektweite Konventionen.

## Config-Schema

Die Effective Flow-Konfiguration ist optional und steuert Defaults der folgenden Blöcke. Ihre Wahrheit ist die Projektsetup-ADR-Tabelle (Encoding und Locator siehe Baustein oben). Die jeweiligen Skills sind die maßgebliche Quelle für gültige Werte und Defaults; dieser Skill fasst sie nur zusammen und darf bei Schema-Erweiterungen nicht als alleinige Wahrheit gelten. Unbekannte Schlüssel einer bestehenden Config bleiben immer erhalten.

- **`review`** (Quelle: `/effective-flow review`): `profile` (full/focused/fast), `autoConfirmScope` (bool), `designDecisionSources` (full/standard/minimal), `validation` (full/quick/off)
- **`applyReview`** (Quelle: ``tools/apply-review.md``): `defaultCommitStrategy` (worktrees/single/none/`null` = beim Lauf fragen), `finalValidation` (full/changedScope/off), `stashPolicy` (interactive/keep/discard/apply), `worktree.baseDir`, `worktree.setup` (auto/none/Befehl)
- **`plan`** (Quelle: `/effective-flow plan`): `markerLanguage` (de/en), `dir` (String, Default `docs/plan`) — Verzeichnis der Plan-Dateien
- **`delivery`** (Quelle: `/effective-flow build`, Abschnitt „Delivery- und Worktree-Integration“ – ebenso in den weiteren code-ändernden Workflows eingebettet): Delivery ist durch Worktree/Branch impliziert (kein eigener `enabled`-Schalter mehr) — `baseBranch` (Default `origin/main`), `branchPrefix` (Default `effective-flow`), `completion` (pr/merge/branch, Default `merge`), `returnBranch` (auto oder lokaler Branchname)
- **`worktree`** (Quelle: `/effective-flow build`, Abschnitt „Delivery- und Worktree-Integration“): `enabled` (bool, Default `true`), `setup` (auto/none/Befehl), `baseDir`
- **`tracker`** (Quelle: `/effective-flow review`, Abschnitt „Issue-Tracker-Anbindung“ – ebenso in ``tools/apply-review.md`` und den weiteren Tracker-Workflows eingebettet): `mode` (local/remote, Default `local`), `remoteToolOverride` (auto/github/forgejo, Default `auto`)
- **`skills`** (Quelle: Baustein „Skill-Discovery“): `enabled` (bool, Default `true` — schaltet die dynamische Skill-Nutzung), `include` (Liste — Skills projektweit bevorzugt einbinden), `exclude` (Liste — Skills nie anwenden), `agents.<name>` und `tools.<name>` (je `include`/`exclude` für einen einzelnen Agent bzw. ein einzelnes Tool). Schlüssel sind die Quell-Agent-/Tool-Namen (z. B. `ui-implementer`, `plan`).

### Sichere Defaults (die eine Basis)

Der Wizard startet **immer** von dieser einen benannten Sicher-Defaults-Basis. Sie umfasst
die konservativen `review`-/`applyReview`-Werte plus die Kern-Schalter (Werte in der
Tabellen-Encoding-Form der ADR):

| Schlüssel                         | Wert                                                    |
| --------------------------------- | ------------------------------------------------------- |
| review.profile                    | focused                                                 |
| review.autoConfirmScope           | false                                                   |
| review.designDecisionSources      | standard                                                |
| review.validation                 | full                                                    |
| applyReview.defaultCommitStrategy | null (beim Lauf fragen)                                 |
| applyReview.finalValidation       | full                                                    |
| applyReview.stashPolicy           | interactive                                             |
| applyReview.worktree.baseDir      | .effective-flow/.worktrees                              |
| applyReview.worktree.setup        | auto                                                    |
| worktree.enabled                  | true                                                    |
| delivery.completion               | merge                                                   |
| delivery.baseBranch               | origin/main                                             |
| tracker.mode                      | local                                                   |
| plan.dir                          | docs/plan                                               |
| plan.markerLanguage               | abgeleitet: aus vorhandenen Plänen erkennen, sonst `en` |

Es gibt bewusst **kein** zweites Preset mehr. Wer einen zügigeren Solo-Flow will (z. B.
`review.profile: fast`, `review.validation: quick`, `applyReview.finalValidation:
changedScope`), erreicht diese Werte einzeln über den geführten Weg (erweiterte
Einstellungen). Für `plan.markerLanguage` gilt kein fixer Wert: aus vorhandenen Plänen die
Marker-Sprache erkennen (Detection wie in `/effective-flow plan`); ohne eindeutiges Signal
Englisch.

## Workflow

### Schritt 1: .gitignore-Eintrag

Soll-Zustand: Das gesamte Laufzeit-Verzeichnis `.effective-flow/` (`config.json`-Migration ausgenommen — die Config lebt künftig in der ADR; Laufzeit-Dateien wie `memory.json`, `cache.json`, `review/`, `.worktrees/`) ist ignoriert. Das erreicht die eine Zeile:

```gitignore
.effective-flow/
```

Es gibt **kein** `!.effective-flow/config.json`-Ausnahme-Pattern mehr: Die Effective-Flow-Konfiguration wird nicht länger als getrackte `config.json` geführt, sondern in der Projektsetup-ADR. `.effective-flow/` ist damit reines Laufzeit-Verzeichnis und wird komplett ignoriert.

1. Prüfe, ob der Soll-Zustand bereits hergestellt ist — bei verfügbarem Git über: `git check-ignore -q .effective-flow/config.json` muss mit Exit-Code 0 enden (das Verzeichnis inklusive `config.json` ist ignoriert) und es darf **keine** `!.effective-flow/config.json`-Negationszeile mehr in der `.gitignore` stehen. Ohne Git über einen Zeilenabgleich der `.gitignore`: eine Zeile ignoriert `.effective-flow/` als Ganzes und es folgt **keine** `!.effective-flow/…`-Negationszeile.
2. Falls der Soll-Zustand noch nicht hergestellt ist:
   - Migriere das frühere Zwei-Zeilen-Pattern: enthält die `.gitignore` die Zeilen `.effective-flow/*` und `!.effective-flow/config.json` (alter Soll-Zustand mit getrackter `config.json`), ersetze **beide** durch die eine Zeile `.effective-flow/`.
   - Migriere Alt-Verzeichnis-Patterns der Vorgänger-Namen: ignoriert eine Zeile das frühere `.firmo/` oder `.sf-plugin/` (gängige Schreibweisen mit/ohne führenden bzw. abschließenden Slash, inklusive der alten `.firmo/*` + `!.firmo/config.json`-Zwei-Zeilen-Form), ersetze sie durch die eine Zeile `.effective-flow/`. Ein bereits vorhandenes pauschales `.effective-flow/` (bzw. `.effective-flow`, `/.effective-flow/`) auf `.effective-flow/` normalisieren und eine etwaige nachfolgende `!.effective-flow/config.json`-Negationszeile entfernen.
   - Fehlt jeder `.effective-flow/`-Eintrag, hänge die Zeile `.effective-flow/` an. Stelle vor dem Anhängen einen abschließenden Zeilenumbruch sicher. Fehlt die `.gitignore`, lege sie mit dieser einen Zeile an.
3. Falls der Soll-Zustand bereits hergestellt ist: nichts ändern und das knapp melden.
4. Ist das Projekt kein Git-Repository: weise darauf hin, dass eine `.gitignore` ohne Git wirkungslos ist, und frage, ob sie trotzdem geschrieben werden soll. Verwende dann denselben Zeilenabgleich wie oben statt `git check-ignore`. Die Config-Erstellung läuft unabhängig davon weiter.

### Schritt 2: ADR-Ort bestimmen und bestehende Config lesen

1. **ADR-Verzeichnis erkennen.** Suche eine vorhandene ADR-Konvention (in Anlehnung an die
   Such-Globs von `/effective-flow review`): `docs/adr/`, `docs/decisions/`, `adr/`. Nutze ein
   vorhandenes Verzeichnis. Existiert keines, ist der Default `docs/adr/`. Existieren
   **mehrere**, bevorzuge für die Projektsetup-ADR `docs/adr/`; nur bei echter
   Mehrdeutigkeit im geführten Weg nachfragen:

Wenn mehrere ADR-Verzeichnisse existieren und keines eindeutig `docs/adr/` ist:

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "ADR-Ort"
- question: "In welchem Verzeichnis soll die Effective Flow-Projektsetup-ADR liegen?"
- multiSelect: false
- options:
  - label: "docs/adr/", description: "Empfohlener Default für die Projektsetup-ADR"
  - label: "docs/decisions/", description: "Vorhandenes Verzeichnis nutzen"
  - label: "adr/", description: "Vorhandenes Verzeichnis nutzen"

2. **Projektsetup-ADR auflösen.** Löse eine bereits vorhandene Projektsetup-ADR über den
   Config-Locator auf (AGENTS.md-Marker `**Effective Flow project setup:** <pfad>` → Default-Pfad/Scan
   → Übergangs-`.firmo/config.json`; siehe Baustein oben). Zeigt ein Marker auf einen toten
   Pfad, falle in der Reihenfolge weiter und merke den veralteten Marker zur Korrektur vor.
3. **Aktuelle Werte bilden.** Bei vorhandener ADR: parse die `## Konfiguration`-Tabelle
   gemäß Encoding zu einem internen „Aktuelle-Werte“-Überblick (Schlüssel → aktuell
   festgeschriebener Wert). Existiert (noch) keine ADR, aber eine `.firmo/config.json`
   (Migrationsfall): lies deren Werte als aktuelle Werte und merke intern vor, dass migriert
   wird. Zeige den jeweiligen Wert bei jeder folgenden Frage an („aktuell festgeschrieben:
   …“) und verwende ihn als Vorauswahl. Fehlt ein Schlüssel, benenne die Vorauswahl als
   Default („aktuell nicht gesetzt – Default: …“).
4. **Ungültige Quelle.** Ist die ADR-Tabelle ungültig/mehrdeutig oder eine Alt-`config.json`
   kein gültiges JSON: überschreibe nicht still. Informiere den User mit Pfad und Fehler und
   frage, ob die Konfiguration neu angelegt (altes Backup/Überschreiben) oder der Lauf
   abgebrochen werden soll.

### Schritt 3: Express oder Geführt

Erkläre dem User kurz, dass Effective Flow mit sicheren Defaults sofort einsatzbereit ist und er nur
dann etwas anpassen muss, wenn er möchte. Biete dann die zwei Wege an:

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Setup-Weg"
- question: "Wie möchtest du die Effective Flow-Konfiguration einrichten?"
- multiSelect: false
- options:
  - label: "Express", description: "Sichere Defaults übernehmen (bei vorhandener Config deren aktuelle Werte behalten) — ein Bestätigungsschritt, dann fertig"
  - label: "Geführt", description: "Schritt für Schritt durch die Optionen — jede wird erklärt, ideal wenn du Effective Flow noch nicht kennst"

- **Express:** Bilde die Zielkonfiguration aus der Sicher-Defaults-Basis (Config-Schema oben)
  plus – falls eine gültige Config existiert – deren vorhandenen Werten. Leite
  `plan.markerLanguage` gemäß Basis ab (Detection, sonst Englisch). Springe direkt zu
  Schritt 6 (Merge und Schreiben); die Vorher/Nachher-Liste und Bestätigung dort stellen
  sicher, dass keine bestehende, abweichende Config still überschrieben wird.
- **Geführt:** Fahre mit Schritt 4 (Kern-Schalter) fort; danach folgt das optionale
  Erweitert-Gate (Schritt 5).

### Schritt 4: Kern-Schalter (nur im geführten Weg)

Diese vier Schalter bestimmen das Kernverhalten. Stelle **vor** jeder Frage eine kurze,
verständliche Erklärung voran (was ist das, warum ist es relevant, was bedeutet die Wahl) –
ohne Vorwissen über Effective Flow vorauszusetzen – und nenne dabei, ob und mit welchem Wert der
Schalter aktuell in der Config steht (siehe Schritt 2); wähle diesen Wert bzw. den sicheren
Default vor. Fachbegriffe bei erster Nennung in einem Satz erklären.

**Worktree.** Erkläre: Effective Flow setzt Änderungen standardmäßig in einem separaten Arbeitsbereich
mit eigenem Branch um (einem „Worktree"), damit dein aktueller Stand unberührt bleibt und die
Arbeit sauber gebündelt ist; „Nein" arbeitet direkt in deinem aktuellen Checkout.

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Worktree"
- question: "Soll die Umsetzung in einem separaten Git-Worktree laufen?"
- multiSelect: false
- options:
  - label: "Ja", description: "worktree.enabled = true (Default) — Umsetzung läuft in einem separaten Worktree mit eigenem Liefer-Branch"
  - label: "Nein", description: "worktree.enabled = false — In-Place ohne Worktree; Liefer-Branches werden bei Bedarf im Haupt-Repo erzeugt"

**Abschluss-Aktion.** Erkläre: Wie fertige Änderungen eingebracht werden. `merge` bringt sie
direkt in den Zielbranch, `pr` öffnet einen Pull-Request (Review vor dem Einbringen), `branch`
lässt den Branch nur liegen; „beim Lauf fragen" entscheidet jedes Mal neu.

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Abschluss"
- question: "Welche Abschluss-Aktion soll Effective Flow standardmäßig nutzen?"
- multiSelect: false
- options:
  - label: "Merge", description: "delivery.completion = merge (Default) — Branch lokal in den Basis-Branch mergen, ohne PR"
  - label: "Pull-Request", description: "delivery.completion = pr"
  - label: "Nur Branch", description: "delivery.completion = branch"
  - label: "Beim Lauf fragen", description: "delivery.completion = null — die Aktion wird pro Lauf erfragt"

Erkläre kurz den Basis-Branch (der Zweig, in den geliefert wird) und frage ihn als Freitext
ab (`delivery.baseBranch`, Default `origin/main`); das Rückwechsel-Ziel (`delivery.returnBranch`,
Default `auto`) nur optional.

**Marker-Sprache.** Erkläre: Die Sprache der kleinen Status-Markierung im Kopf von
Plan-Dateien (nur der Marker, nicht der Planinhalt). Vorauswahl: der aus vorhandenen Plänen
erkannte Wert; gibt es kein Signal, Englisch.

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Marker"
- question: "In welcher Sprache sollen die Statusmarker neuer Plan-Dateien stehen?"
- multiSelect: false
- options:
  - label: "Englisch", description: "plan.markerLanguage = en (Default, falls keine Sprache aus vorhandenen Plänen erkennbar ist)"
  - label: "Deutsch", description: "plan.markerLanguage = de"

**Tracker.** Erkläre: Wo Review-Findings landen – `local` als Markdown-Report im Projekt
(`.effective-flow/review/`) oder `remote` als Issues auf GitHub/Forgejo (nützlich für Teamarbeit).

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Tracker"
- question: "Sollen Review-Findings lokal als Markdown-Report oder remote als Issues (GitHub/Forgejo) geführt werden?"
- multiSelect: false
- options:
  - label: "Lokal", description: "tracker.mode = local (Default) — Markdown-Report unter .effective-flow/review/"
  - label: "Remote", description: "tracker.mode = remote — Findings als Issues, Werkzeug automatisch aus origin (gh/tea)"

Bei „Remote“ den Werkzeug-Override nur bei Bedarf abfragen: Der Default `tracker.remoteToolOverride = auto` erkennt GitHub/Forgejo automatisch aus der `origin`-URL. Nur wenn der User einen mehrdeutigen Host hat (z. B. self-hosted GitHub Enterprise), als Freitext `github` oder `forgejo` erfassen; sonst `auto` belassen.

### Schritt 5: Erweiterte Einstellungen (optionales Gate, nur im geführten Weg)

Die Kern-Schalter genügen für den Alltag. Alle übrigen Optionen sind seltener nötig; frage
daher zuerst, ob der User sie überhaupt anpassen will:

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Erweitert"
- question: "Möchtest du erweiterte Einstellungen (Review, Apply-Review, Pfade, Feinheiten) anpassen?"
- multiSelect: false
- options:
  - label: "Nein", description: "Sichere Defaults bzw. bestehende Werte behalten — empfohlen, wenn du Effective Flow noch kennenlernst"
  - label: "Ja", description: "Die restlichen Optionen einzeln durchgehen, jede erklärt"

Bei „Nein": alle erweiterten Schlüssel behalten den sicheren Default bzw. den bestehenden
Config-Wert; weiter zu Schritt 6. Bei „Ja": frage Block für Block jeden Schlüssel ab, jeweils
mit einer kurzen Erklärung, den gültigen Werten aus dem Config-Schema oben und dem aktuellen
Config-Wert bzw. Default als Vorauswahl:

1. `review`: `review.profile` (full/focused/fast — Tiefe des Reviews), `review.autoConfirmScope`, `review.designDecisionSources`, `review.validation`
2. `applyReview`: `applyReview.defaultCommitStrategy`, `applyReview.finalValidation`, `applyReview.stashPolicy`, `applyReview.worktree.baseDir`, `applyReview.worktree.setup`
3. `plan`: `plan.markerLanguage` (bereits in Schritt 4 erfragt — übernehmen), `plan.dir` (Freitext, Default `docs/plan` — Verzeichnis der Plan-Dateien)
4. `delivery`: `delivery.baseBranch` und `delivery.completion` (bereits in Schritt 4 erfragt — übernehmen), `delivery.branchPrefix`, `delivery.returnBranch`
5. `worktree`: `worktree.enabled` (bereits in Schritt 4 erfragt — übernehmen), `worktree.setup`, `worktree.baseDir`
6. `tracker`: `tracker.mode` (bereits in Schritt 4 erfragt — übernehmen), `tracker.remoteToolOverride` (auto/github/forgejo)
7. `skills`: `skills.enabled` (bool), `skills.include`/`skills.exclude` (globale Listen) sowie – als Fortgeschrittenen-Option – `skills.agents.<name>` und `skills.tools.<name>` für einzelne Agents/Tools. Biete zusätzlich optional an (nicht erzwingen), die eingebauten per-Agent- und per-Tool-Empfehlungen sichtbar als `skills.agents.<name>.include` bzw. `skills.tools.<name>.include` in die Config zu materialisieren; schreibe dabei bei einer Fallback-Empfehlung (`effective-web › impeccable › frontend-design`) nur den **primären** Skill (`effective-web`) — der Built-in-Fallback bleibt aktiv. Flache Empfehlungen (z. B. `locale-typography`) werden unverändert übernommen.

Wer den früheren „schnellen Solo-Workflow" möchte, setzt hier z. B. `review.profile: fast`,
`review.validation: quick` und `applyReview.finalValidation: changedScope`.

Beachte: `applyReview.worktree.*` (Apply-Review-eigener Worktree-Mechanismus), der Top-Level-`worktree.*`-Block (Ausführungsort) und der Top-Level-`delivery.*`-Block (Liefer-Branch/Abschluss) sind getrennte, unabhängige Config-Pfade — verwechsle sie beim Abfragen und Mergen nicht.

Freitext-Werte (z. B. `baseBranch`, `branchPrefix`, `returnBranch`, `baseDir` oder ein expliziter `setup`-Befehl) als Freitext erfragen. Bei ungültiger Eingabe für einen enumerierten Schlüssel erneut fragen oder den Default verwenden und das melden.

### Schritt 6: Merge und Schreiben

1. Baue die Zielkonfiguration nicht-destruktiv: setze die bekannten Schlüssel auf die gewählten Werte, übernimm vorhandene gültige Werte für nicht abgefragte Schlüssel und lass unbekannte Schlüssel unverändert.
2. Das gilt auch für die Sicher-Defaults: Ein Default-Wert, der einen bereits vorhandenen, abweichenden Config-Wert ersetzen würde, wird nur nach ausdrücklicher Bestätigung gesetzt. Zeige vor dem Schreiben eine Vorher/Nachher-Liste **aller** zu ändernden Schlüssel (egal ob aus Express-Basis, Kern-Schaltern oder erweiterten Einstellungen) und hole die Bestätigung ein. Ein vollständiges Überschreiben (Verwerfen vorhandener Werte) ebenfalls nur nach ausdrücklicher Bestätigung.
3. Löse die Projektsetup-ADR direkt vor dem Schreiben noch einmal frisch auf (Locator) und lies eine vorhandene ADR-Tabelle bzw. Alt-`config.json` frisch ein, damit zwischenzeitliche Änderungen nicht verloren gehen.
4. **Projektsetup-ADR schreiben.** Bestimme das ADR-Verzeichnis (Schritt 2) und schreibe die
   ADR unter `<adr-dir>/effective-flow-project-setup.md` (Default-Slug `effective-flow-project-setup`; ein Alt-Slug `firmo-project-setup` wird beim Scan gleichwertig erkannt und beim Schreiben auf den neuen Slug umgestellt) im
   lebenden ADR-Format:
   - H1 `# Effective Flow project setup`
   - `## Status` mit `Aktiv`
   - eine kurze `## Kontext`-Prosa (diese ADR hält die getrackte Effective Flow-Konfiguration; `.effective-flow/` ist reines Laufzeit-Verzeichnis)
   - `## Konfiguration` mit der Zwei-Spalten-Tabelle `| Schlüssel | Wert |`; je Schlüssel eine Zeile in der Tabellen-Encoding-Form (Boolean, unquoted String, Literal-`null`, `(leer)`, kommagetrennte Liste, dotted keys). Unbekannte Fremd-Schlüssel aus einer vorhandenen Quelle als eigene Zeilen erhalten.

   Beispiel-Skelett:

   ```markdown
   # Effective Flow project setup

   ## Status

   Aktiv

   ## Kontext

   Diese ADR hält die getrackte Effective Flow-Konfiguration dieses Projekts. `.effective-flow/` ist reines
   Laufzeit-Verzeichnis und komplett gitignored.

   ## Konfiguration

   | Schlüssel                         | Wert    |
   | --------------------------------- | ------- |
   | review.profile                    | focused |
   | applyReview.defaultCommitStrategy | null    |
   | worktree.enabled                  | true    |
   | tracker.mode                      | local   |
   ```

5. **AGENTS.md-Marker setzen.** Schreibe die kanonische Zeile `**Effective Flow project setup:** <adr-pfad>` nicht-destruktiv: bevorzugt in eine vorhandene `AGENTS.md`, sonst in eine vorhandene `CLAUDE.md`, sonst lege eine minimale `AGENTS.md` mit dieser Zeile an. Übrigen Inhalt unangetastet lassen; einen vorhandenen (ggf. veralteten) Marker aktualisieren statt duplizieren — das schließt einen Alt-Marker `**Firmo project setup:**` ein, der dabei auf die neue Schreibweise umgestellt wird.
6. **Migration und Enttracken (nur im Migrationsfall).** Wurde eine Alt-`.firmo/config.json` als Quelle gelesen:
   - Enttracke sie automatisch mit `git rm --cached .firmo/config.json`; den **Datei-Inhalt auf der Platte belassen** (Effective Flows Non-Destruktiv-Linie), das Aufräumen dem User überlassen. `git rm --cached` **staged** eine Index-Änderung, erzeugt aber **keinen** Commit — die Setup-Regel „erstellt keine Commits“ bleibt gewahrt.
   - Ist das Projekt kein Git-Repository oder die Datei nicht getrackt, überspringe das Enttracken und melde das.
   - Markiere den Migrationsabschluss idempotent in `.effective-flow/memory.json` unter `configMigration.adr` (`version` z. B. `config-to-adr-v1`, `appliedAt` Zeitstempel), ohne vorhandene `memory.json`-Felder zu verlieren. Ist dieser Marker bereits gesetzt, migriere nicht erneut.

### Schritt 7: Zusammenfassung

Melde dem User:

- ob die `.gitignore`-Zeile `.effective-flow/` ergänzt, ein früheres Zwei-Zeilen-Pattern (`.effective-flow/*` plus `!.effective-flow/config.json`) oder eine Alt-`.firmo/`-/`.sf-plugin/`-Zeile dorthin migriert wurde oder der Soll-Zustand bereits hergestellt war
- welcher Weg gewählt wurde (Express oder Geführt) und ob erweiterte Einstellungen angepasst wurden
- die gesetzten zentralen Verhaltenswerte (`worktree.enabled` [Default `true`], `delivery.completion` [Default `merge`] samt ggf. `delivery.baseBranch`/`delivery.returnBranch`, `plan.markerLanguage`, `tracker.mode` und ggf. `tracker.remoteToolOverride`) sowie `plan.dir`, falls gesetzt oder gegenüber dem Default geändert
- bei einer zuvor vorhandenen Config: welche Schlüssel gegenüber dem alten Stand geändert wurden (Vorher/Nachher)
- den Pfad der geschriebenen Projektsetup-ADR und den Ort des gesetzten `**Effective Flow project setup:**`-Markers (`AGENTS.md`/`CLAUDE.md`)
- im Migrationsfall: dass die Alt-`.firmo/config.json` per `git rm --cached` **gestaged entfernt** (Inhalt auf Platte belassen), aber **nicht** committet wurde — und dass der User das Aufräumen selbst übernimmt

## Regeln

- Ändere ausschließlich `.gitignore` (die `.effective-flow/`-Zeile bzw. deren Migration), die Projektsetup-ADR und den `**Effective Flow project setup:**`-Marker in `AGENTS.md`/`CLAUDE.md`; keine weiteren Setup-Schritte wie Deployment oder Git-Hooks.
- Überschreibe vorhandene Config-Werte und unbekannte Schlüssel niemals ungefragt.
- Hinterlasse bei einem Abbruch während der Fragen keine halb geschriebene ADR; schreibe nur einmal am Ende.
- Starte keine Projektvalidation; Linting, Tests und Build-Checks sind Aufgabe anderer Skills wie ``effective-flow-code-validator``.
- Erstelle keine Commits; das Committen übernimmt der User oder `/effective-flow commit`. Das Enttracken einer Alt-`config.json` staged nur eine Index-Änderung (`git rm --cached`), ohne zu committen.
- Verarbeite oder speichere keine Secrets; die Konfiguration enthält ausschließlich Verhaltens-Defaults.
