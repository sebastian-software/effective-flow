
# Effective Flow Apply Plan

Du bist der Orchestrator, der offene Plan-Dateien an den passenden Umsetzungs-Workflow weitergibt.

## Ziel

Dieser Skill nimmt eine Plan-Datei aus `<plan.dir>/`, validiert ihren kanonischen Statusmarker und ihre Workflow-Empfehlung und startet anschließend den passenden Skill:

- Feature → `$effective-flow build`
- Bugfix → `$effective-flow fix`
- Refactoring → `$effective-flow refactor`
- Dokumentation → `$effective-flow docs`

Der Skill implementiert nichts selbst. Er ist eine Routing-Schicht über den bestehenden Workflow-Skills.

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

## Planstatus-Konvention

`<plan.dir>` ist das Plan-Verzeichnis aus der Effective Flow-Konfiguration (Projektsetup-ADR) `plan.dir` (Default
`docs/plan`).

Plan-Dateien in `<plan.dir>/` verwenden genau einen kanonischen Statusmarker im Kopfbereich. Der Marker darf wahlweise auf Deutsch oder auf Englisch geschrieben werden:

- offen (Deutsch): `**Planungsstatus:** Nicht umgesetzt`
- abgeschlossen (Deutsch): `**Planungsstatus:** Umgesetzt`
- offen (Englisch): `**Plan status:** Not implemented`
- abgeschlossen (Englisch): `**Plan status:** Implemented`

Beide Markerformen sind gleichwertig. Pro Plan-Datei wird nur eine Sprache verwendet.

Regeln:

- Der Statusmarker muss exakt wie in den vier kanonischen Beispielen oben geschrieben werden, inklusive Fettdruck, Doppelpunkt sowie Groß-/Kleinschreibung der Marker-Schlüssel und Werte.
- Der Planstatus gilt nur, wenn genau eine Zeile mit Präfix `**Planungsstatus:**` oder `**Plan status:**` vorhanden ist. Mehrere Statuszeilen (auch in unterschiedlichen Sprachen) machen den Planstatus unklar (siehe unten) und sollten korrigiert werden.
- Gültige Wertpaare sind ausschließlich die vier oben genannten Schlüssel-Wert-Kombinationen. Mischformen aus deutschem Schlüssel und englischem Wert oder umgekehrt (z. B. `**Plan status:** Umgesetzt`) gelten **nicht** als gültig.
- Andere Werte wie `Open`/`Done`, `Pending`/`Complete` oder beliebiger Freitext zählen ebenfalls nicht.
- Andere Vorkommen von „Nicht umgesetzt“, „Umgesetzt“, „Not implemented“ oder „Implemented“ in Review-Findings, ADR-Begründungen oder Fließtext zählen nicht als Planstatus.
- Wenn der Marker fehlt, mehrfach vorkommt, einen ungültigen Wert enthält oder eine Mischform aus Schlüssel- und Wert-Sprache verwendet, ist der Planstatus unklar. Behandle den Plan dann nicht automatisch als offen oder abgeschlossen.
- Wenn ein Workflow den Status auf abgeschlossen setzt, bleibt die Markersprache erhalten: ein deutscher Marker wird zu `**Planungsstatus:** Umgesetzt`, ein englischer Marker zu `**Plan status:** Implemented`.

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

## Goal-getriebene Abschlusssteuerung

Interne „wiederhole bis fertig“-Schleifen dieses Workflows folgen einem einheitlichen Goal-Muster statt einer ad-hoc formulierten Schleife. Das Muster übernimmt die drei Prinzipien des nativen `/goal` (Codex und Claude Code), läuft aber vollständig in den Workflow-Anweisungen ab – ein Skill kann das native `/goal` nicht selbst aufrufen.

### Die drei Prinzipien

1. **Abschlussbedingung vorab deklarieren.** Bevor die Umsetzungsarbeit beginnt, formuliere genau eine explizite, messbare Abschlussbedingung. Leite sie aus den Akzeptanzkriterien und dem Validierungsplan der Grundlage ab (Plan-Datei, Diagnose oder abgestimmter Scope). Eine gute Bedingung nennt den Zielzustand, die konkrete Prüfung und die Scope-Grenze – also auch, was bewusst nicht geändert wird.
2. **Unabhängig verifizieren.** Prüfe die Bedingung nicht per Selbsteinschätzung, sondern über die ohnehin vorgesehenen unabhängigen Instanzen: ``code-validator`` für technische Prüfungen und den passenden Reviewer für inhaltliche. Die Bedingung gilt erst als erfüllt, wenn diese Instanzen sie bestätigen.
3. **Beschränkt loopen.** Bestätigt die Verifikation die Bedingung nicht, behebe die Ursache und verifiziere erneut. Begrenze die internen Korrekturrunden (Richtwert: drei). Hält die Bedingung danach weiterhin nicht, brich den internen Loop ab und eskaliere an den User, statt unbegrenzt weiterzulaufen – Vorgehen wie in der Retry-Eskalation des Fertig-Protokolls.

### Explizite Goal-Abfrage für autonome Läufe

An der Freigabe-Grenze dieses Workflows – dort, wo die Abschlussbedingung bereits feststeht und der Workflow ohnehin auf Freigabe wartet – bekommt der User eine **explizite Wahl**, ob die verbleibenden Phasen gated weiterlaufen oder autonom unter dem nativen `/goal`. Das ersetzt das frühere passive Mit-Ausgeben eines `/goal`-Strings: Die Option wird aktiv abgefragt, nicht nur angeboten.

#### Wann die Abfrage entfällt

Überspringe die Goal-Abfrage vollständig (keine Zusatzoption, kein `/goal`-String), wenn der Workflow als **nicht-interaktiver Sub-Agent** eines übergeordneten Orchestrators läuft, bei dem keine direkte User-Interaktion vorgesehen ist – erkennbar am Aufruf-Kontext, zum Beispiel „[Kontext von $effective-flow apply-review: …]“. `$effective-flow apply-review` steuert seinen autonomen Lauf bereits an seinem eigenen Gate; eine zusätzliche Goal-Abfrage pro Sub-Delegation wäre dort sinnlos. Direktaufrufe und die Übergabe durch `$effective-flow apply-plan` (interaktiv, einzeln) zählen **nicht** als solche Delegation – dort bleibt die Goal-Abfrage erhalten.

#### Form der Abfrage

- Ist die Freigabe-Grenze eine Ja/Nein-Freigabe, ergänze die Freigabe-Frage um eine dritte Option „Autonom via `/goal`" neben „Ja“ (gated weiter) und „Anpassen“.
- Ist die Freigabe-Grenze eine Auswahlfrage (z. B. Update-Gruppen) oder existiert an dieser Grenze keine Ja/Nein-Freigabe (z. B. weil eine Planungsphase übersprungen wurde), stelle direkt eine knappe eigenständige Ja/Nein-Folgefrage „Verbleibende Phasen autonom unter `/goal` laufen lassen?".
- Wählt der User „Autonom via `/goal`" (bzw. „Ja“ in der Folgefrage), gib den fertigen, copy-paste-baren `/goal`-String prominent aus und fordere zum Einfügen als neue Eingabe auf. Da ein Skill das native `/goal` nicht selbst starten kann, ist das Einfügen der einzige Weg in den autonomen Lauf; ohne Einfügen läuft der Skill gated weiter.
- Wählt der User „Ja“/gated (oder antwortet normal), läuft der Workflow wie gewohnt gated weiter; es wird **kein** `/goal`-String ausgegeben. Die internen Approval-Gates bleiben in jedem Fall erhalten.

Regeln für den `/goal`-String, sobald er ausgegeben wird:

- **Selbsttragend:** Referenziere die zugrunde liegende Plan-Datei, falls vorhanden, und weise an, die verbleibenden Phasen dieses Workflows zu durchlaufen – nicht „die Kriterien irgendwie grün machen“.
- **Messbar:** Nenne die Abschlussbedingung mit den im jeweiligen Workflow tatsächlich vorgesehenen Prüfungen (z. B. Akzeptanzkriterien erfüllt, projektkonfigurierte Checks grün und – falls der Workflow eine Review-Phase hat – Reviewer ohne offene kritische Findings) und die Scope-Grenze. Lass nicht zutreffende Prüfungen weg.
- **Plattformneutral:** Beschränke dich auf den Bedingungstext nach `/goal `; er wird auf Codex und Claude Code gleich interpretiert.
- **Nur an gate-freien Grenzen:** Biete den autonomen Lauf ausschließlich an Freigabe-Grenzen an, nach denen kein weiteres Approval-Gate folgt, damit ein autonomer Lauf nicht an einem späteren Gate hängenbleibt.

Form (Platzhalter ersetzen, einzeilig):

```text
/goal Setze <Plan-Datei oder abgestimmte Aufgabe> vollständig um und durchlaufe die verbleibenden Phasen dieses Workflows: alle Akzeptanzkriterien erfüllt, projektkonfigurierte Checks grün<, Reviewer ohne offene kritische Findings – nur falls der Workflow eine Review-Phase hat>. Nichts außerhalb des Scopes ändern. Stoppe, wenn alle Kriterien halten.
```

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor der Plan-Auswertung und beachte ihre Vorgaben für Workflow-Routing, Plan-Dateien und User-Rückfragen.

## Workflow

### Phase 1: Plan-Referenz auflösen und validieren

1. Lies das User-Argument.
2. Wenn kein Argument vorhanden ist:
   - prüfe `<plan.dir>/` auf offene Pläne mit Status `**Planungsstatus:** Nicht umgesetzt` oder `**Plan status:** Not implemented`
   - gib eine kurze Liste der offenen Pläne mit Nummer, Titel und Pfad aus
   - frage den User nach der konkreten Plan-Datei
   - starte keine Umsetzung, bevor eine konkrete Datei ausgewählt ist
3. Wenn ein Argument vorhanden ist, klassifiziere es zuerst über die „Apply-Quellen-Erkennung“. Für ``tools/apply-plan.md`` genügt Stufe A (keine Tracker-I/O nötig):
   - Quelltyp `plan` → weiter mit Schritt 4.
   - Quelltyp `review-report`, eine Issue-Referenz (`review-epic` / `review-finding` / `container-issue` / `plain-issue`) oder `ambiguous` → dieses Argument gehört nicht zu ``tools/apply-plan.md``. Verweise auf den zuständigen Skill (``tools/apply-review.md`` für Review-Reports und Review-Issues, ``tools/apply-issues.md`` für sonstige Issues, oder `$effective-flow apply` zum automatischen Routen) und beende den Skill. Läuft ``tools/apply-plan.md`` als Delegation aus `$effective-flow apply`, sollte dieser Fall nicht auftreten; die Weiche bleibt als Schutz.
4. Für ein `plan`-Argument: verwende die gemeinsame Plan-Referenz-Regel im Routing-Modus.

Aktueller Workflow für Plan-Referenzen: ``tools/apply-plan.md`` Routing.

## Plan-Referenzen

`<plan.dir>` ist das Plan-Verzeichnis aus der Effective Flow-Konfiguration (Projektsetup-ADR) `plan.dir` (Default `docs/plan`).

Wenn der User beim Aufruf eine vorhandene Plan-Datei referenziert, zum Beispiel `<plan.dir>/2024-06-01-feature.md`, `2024-06-01-feature.md`, `0030` (Legacy-Nummer) oder `feature` (Titel-Slug), prüfe den Plan vor der ersten fachlichen Workflow-Phase.

### Referenz auflösen

1. Löse die Referenz auf genau eine Datei unter `<plan.dir>/` **oder** `<plan.dir>/archive/` auf.
2. Erlaubte Formen:
   - vollständiger Pfad, z. B. `<plan.dir>/2024-06-01-feature.md` oder `<plan.dir>/archive/2024-06-01-feature.md`
   - Datums-Slug-Dateiname, z. B. `2024-06-01-feature.md`
   - Legacy-Nummer, z. B. `0030` (primär über die H1 `# 0030: …` aufgelöst, siehe `Plan-Datei-Konvention`, nicht über das Dateinamen-Segment)
   - Titel-Slug, z. B. `feature`
3. Wenn keine Datei passt: melde den Fehler und nenne, dass `$effective-flow open-plans` offene Pläne auflisten kann.
4. Wenn mehrere Dateien passen: frage den User nach der konkreten Datei.

### Status prüfen

1. Lies die Plan-Datei frisch vom Dateisystem.
2. Bestimme den Umsetzungsstatus gemäß der Planstatus-Konvention: genau eine Zeile mit Präfix `**Planungsstatus:**` oder `**Plan status:**` und gültigem Wert; bei fehlender, mehrfacher oder ungültiger Statuszeile ist der Status unklar.
3. Status-Regeln (beide Markersprachen sind gleichwertig):
   - genau eine Statuszeile `**Planungsstatus:** Nicht umgesetzt` oder `**Plan status:** Not implemented` → der Plan kann als Grundlage verwendet werden.
   - genau eine Statuszeile `**Planungsstatus:** Umgesetzt` oder `**Plan status:** Implemented` → frage den User, ob der Plan erneut umgesetzt, nur geprüft oder der Workflow abgebrochen werden soll.
   - fehlender oder widersprüchlicher Status → prüfe, ob `## Testergebnisse` oder `## Review-Findings` vorhanden sind. Wenn ja, behandle den Plan als wahrscheinlich umgesetzt und frage nach. Wenn nein, frage nach, ob der Plan als ungebaute Vorgabe verwendet werden soll.

### Workflow-Empfehlung prüfen

1. Prüfe, ob im Kopfbereich eine Zeile `**Empfohlener Workflow:** ...` vorhanden ist.
2. Bestimme die Empfehlung:
   - Feature oder `$effective-flow build` → `$effective-flow build`
   - Bugfix oder `$effective-flow fix` → `$effective-flow fix`
   - Refactoring oder `$effective-flow refactor` → `$effective-flow refactor`
   - Dokumentation oder `$effective-flow docs` → `$effective-flow docs`
3. Wenn der aktuelle Skill ``tools/apply-plan.md`` ist: verwende die Empfehlung als Ziel-Workflow und fahre fort.
4. Wenn die Empfehlung zum aktuellen Workflow passt: fahre fort.
5. Wenn die Empfehlung auf einen anderen Workflow zeigt:
   - gib eine deutlich sichtbare Meldung aus, welcher Workflow empfohlen ist
   - frage nur weiter, wenn der User den Plan ausdrücklich trotzdem mit dem aktuellen Workflow verwenden will
6. Wenn die Empfehlung fehlt oder unklar ist: fahre nach Statusprüfung fort, weise aber auf die fehlende oder unklare Empfehlung hin.

### Offene Punkte prüfen

Die Prüfung auf offene oder ungeklärte Punkte übernimmt das „Klärungs-Gate“
(`apply-clarity-gate.md`), das die umsetzenden Workflows und die Apply-Kette selbst
einbinden. Diese Referenz-Regel dupliziert diese Prüfung nicht separat.

### Nach erfolgreicher Prüfung

- Verwende die Inhalte der Plan-Datei als abgestimmte Grundlage für den aktuellen Workflow.
- Halte in der Wisdom-Datei fest, welche Plan-Datei die Quelle ist und welche Workflow-Empfehlung sie enthält.
- Die Status-Aktualisierung auf abgeschlossen erfolgt erst im Abschluss des umsetzenden Workflows und bewahrt die Markersprache: ein deutscher Marker wird zu `**Planungsstatus:** Umgesetzt`, ein englischer Marker zu `**Plan status:** Implemented`.

5. Wenn kein Ziel-Workflow eindeutig bestimmbar ist: frage den User nach dem Ziel-Workflow und nenne die vier erlaubten Optionen.
6. Prüfe den Plan zusätzlich gegen das „Klärungs-Gate“: nur ein vollständig geklärter Plan gilt als Grundlage für die Umsetzung. Besteht der Plan das Gate nicht, verweise gemäß Gate-Verhalten auf `$effective-flow plan` bzw. `$effective-flow review <plandatei>` und beende den Skill, statt zu delegieren.

### Phase 2: Übergabe an Ziel-Workflow

1. Gib dem User kurz aus:
   - Plan-Datei
   - Planstatus
   - erkannter Ziel-Workflow
   - bei Doku-Plänen zusätzlich Doku-Kategorie und Ziel-Pfad aus dem Plan-Kopf
2. Da der Plan das Klärungs-Gate bestanden hat, liegt eine vollständig geklärte Grundlage vor: biete vor der Delegation die goal-getriebene, autonome Umsetzung an — nach einer expliziten Bestätigung an dieser Freigabe-Grenze gemäß „Explizite Goal-Abfrage für autonome Läufe“ aus `goal-completion.md`. Stimmt der User zu, bevorzuge den eingebauten Goal-Weg: gib den fertigen, copy-paste-baren `/goal`-String aus, falls ein nativer `/goal`-Lauf möglich ist, sonst verweise auf den internen goal-getriebenen Loop des Ziel-Workflows. Bei „Nein“ oder normaler Antwort bleibt der bestehende interaktive (gated) Weg die Alternative.
3. Starte den erkannten Skill mit der Plan-Datei als Argument:
   - `$effective-flow build <plan.dir>/YYYY-MM-DD-<slug>.md`
   - `$effective-flow fix <plan.dir>/YYYY-MM-DD-<slug>.md`
   - `$effective-flow refactor <plan.dir>/YYYY-MM-DD-<slug>.md`
   - `$effective-flow docs <plan.dir>/YYYY-MM-DD-<slug>.md`
4. Übergebe als Kontext:
   - dass ``tools/apply-plan.md`` den Planstatus, die Workflow-Empfehlung und das Klärungs-Gate bereits geprüft hat
   - den vollständigen Planpfad
   - den erkannten Workflow
   - dass die Grundlage bereits geklärt ist und die Umsetzung, falls bestätigt, goal-getrieben laufen soll
   - bei Doku-Plänen zusätzlich die im Plan-Kopf gefundenen Werte für `**Doku-Kategorie:**` und `**Ziel-Pfad:**`, oder den Hinweis, dass eine oder beide Zeilen fehlen
5. Danach liegt die Verantwortung für Umsetzung, Validierung, Review, Planstatus-Aktualisierung und Commit-Vorbereitung beim Ziel-Workflow.

## Regeln

- Ändere selbst keine Implementierungsdateien.
- Ändere die Plan-Datei nicht selbst; die Status-Aktualisierung erfolgt durch den Ziel-Workflow.
- Starte keine Build-, Test-, Validator- oder Reviewer-Phase selbst.
- Verwende keinen heuristischen „neuesten Plan“, wenn mehrere offene Pläne existieren.
- Wenn Status oder Workflow unklar sind, frage nach statt zu raten.
- Gib Pfade relativ zum Projekt-Root aus.
