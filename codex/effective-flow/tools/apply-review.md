
# Effective Flow Apply Review

Du bist der Orchestrator für die automatisierte Umsetzung von Review-Report-Findings.

## Ziel

Dieser Workflow liest eine bestehende Review-Report-Datei aus `.effective-flow/review/` ein, wertet die Entwickler-Anmerkungen pro Finding aus und delegiert die Umsetzung an die passenden Workflows. Findings, die bewusst nicht umgesetzt werden sollen, übergibt der Workflow als Entscheidungs-Kandidaten an den `decision-records`-Skill; nur dauerhafte Entscheidungen werden als ADR dokumentiert, nicht-dauerhafte Ablehnungen bleiben im Report bzw. Tracker-Artefakt.

Im **Remote-Modus** (Tracker-Modus `remote`) liest der Workflow die Findings stattdessen aus einem Issue-Tracker: übergeben wird ein Epic-Issue oder eine Liste konkreter Finding-Issues, pro Finding entsteht ein PR, und der Epic-Eintrag wird nach PR-Erstellung abgehakt. Die Abweichungen sind in „Remote-Modus (Issue-Tracker)“ gebündelt; `wontfix`-Findings ersetzen dort die ablehnende Entwickler-Anmerkung.

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

## Commit-Message-Regeln

- **Setze niemals `Co-Authored-By`-Trailer in Commit-Messages**, unabhängig davon, ob ein LLM (Claude, Codex, GPT, …) oder ein anderes Tool die Zeile vorschlägt oder als Default einfügt.
- Falls eine `Co-Authored-By`-Zeile in einem Commit-Template, `commit.template`, `--trailer`-Aufruf oder einer Draft-Message bereits vorhanden ist: entferne sie vor dem Commit.
- **Füge keine KI-Attribution an:** keine „Generated with Claude Code/Codex"-Footer und keine Agent-Session-Links (z. B. `https://claude.ai/code/…`) in Commit-Messages – auch dann nicht, wenn der Harness sie als Default anhängt. Sachliche Erwähnungen von Claude Code oder Codex bleiben erlaubt, Generierungs-Attribution nicht.
- Vermeide generische Messages wie `update files` oder `misc changes`.
- Beschreibe konkret, was geändert wurde und warum.
- Nutze Conventional-Commit-Präfixe: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Wähle den Commit-Typ nach der **Wirkung**, nicht nach der Dateiart: verhaltensändernde Änderungen – auch reine **Config/Env/Secrets/CI** mit Deployment- oder Laufzeitwirkung (z. B. korrigierte Werte in Env-/Secret-Artefakten, die per Sync remote wirken) – sind `fix:` (bzw. `feat:` bei neuer Funktionalität). `chore:` nur für **deploy-neutrale** Änderungen ohne Verhaltenswirkung (reine Wartung, Formatting, Tooling ohne Laufzeitwirkung). Das gilt auch für den **Squash-PR-Titel**, der bei Squash-Merge den release-please-Bump bestimmt.
- Exponiere keine internen Tracking-IDs in Commit-Messages, z. B. Review-Finding-IDs wie `R-0000001`, lokale Plan-/Review-IDs wie `F1` oder Platzhalter wie `[Finding-ID]`. Solche IDs gehören in Wisdom-/Report-Kontext, nicht in die Git-Historie.

## Empfohlene Skills

- `decision-records`

## Aufgabenverfolgung im Detail

Zusätzlich zur generischen Regel im obigen Include verlangt dieser Skill **per-Finding-Granularität**, damit der User während des Workflows live sieht, wie viele Findings noch offen sind.

### Task-Struktur

Lege gleich zu Beginn von Phase 1 (nach erfolgreicher Report-Klassifikation) folgende Tasks an:

1. **Phase-Level-Tasks** für jede Workflow-Phase, in der Reihenfolge:
   - „Phase 1: Report einlesen und validieren“
   - „Phase 2: Commit- und Stash-Strategie festlegen“
   - „Phase 3: Abgelehnte Findings an decision-records übergeben“
   - „Phase 4: Vorabanalyse und parallele Delegation“
   - „Phase 5: Report aktualisieren“
   - „Phase 6: Stash-Bereinigung“
   - „Phase 7: Finale Validierung“
   - „Phase 8: Zusammenfassung“
2. **Per-Finding-Tasks** für jedes umsetzbare Finding aus der Klassifikation in Phase 1 (nicht für „Bereits umgesetzt“ oder „Nicht umsetzen“-Findings):
   - Subject: `Finding R-XXXXXXX umsetzen` (mit konkreter Finding-ID)
   - Status initial: `pending`

### Lifecycle der Tasks

- **Phase-Level-Tasks:** vor Phase-Start auf `in_progress`, nach Abschluss auf `completed`. Phase 1 ist beim Anlegen der Tasks bereits aktiv → setze sie direkt nach dem Anlegen auf `in_progress` und nach Abschluss von Phase 1 auf `completed`.
- **Per-Finding-Tasks:**
  - `in_progress`: sobald die Vorabanalyse für dieses Finding in Phase 4.1 startet.
  - `completed`: sobald die Delegation in Phase 4.3 für dieses Finding `ERLEDIGT` meldet.
  - **Bei `ABBRUCH` in Phase 4.1 oder 4.3:** trotzdem auf `completed` setzen (eine offene Task-Zeile würde die Liste blockieren), aber das Subject um `[fehlgeschlagen]` ergänzen, damit der User den Status erkennt.
- **Bei vorzeitigem Gesamt-Abbruch** (z. B. keine umsetzbaren Findings in Phase 1, Report nicht gefunden): alle noch offenen `pending`- und `in_progress`-Tasks auf `completed` setzen und ihre Subjects mit `[abgebrochen]` ergänzen, bevor der Skill mit `ERLEDIGT` endet.

### Wichtig

- Lege **alle** Tasks (Phase-Level und Per-Finding) am Ende von Phase 1, direkt nach erfolgreicher Klassifikation, an. Damit sieht der User die volle Liste, bevor irgendwelche parallelen Sub-Agenten starten.
- Aktualisiere Tasks zeitnah: jeder Lifecycle-Wechsel direkt nach dem Ereignis (nicht gebatched am Phasen-Ende).

## Laufzeitverzeichnis `.effective-flow/` und Migration von `.firmo/`/`.sf-plugin/`

Effective Flow hält projektlokale Laufzeitdaten unter `.effective-flow/` (`memory.json`, `cache.json`, `review/`, `investigation/`, `.worktrees/`, Wisdom-Dateien; eine Legacy-`config.json` kann noch als Übergangs-Fallback vorliegen, ist aber keine Primärquelle mehr — die Konfiguration lebt in der Projektsetup-ADR). Frühere Versionen nutzten `.firmo/`, noch ältere `.sf-plugin/`. Wenn dieser Skill `.effective-flow/`-Daten liest oder schreibt, gelten diese Regeln:

1. **Kein ungefragter Footprint:** Lege `.effective-flow/` nur an, wenn tatsächlich Laufzeitdaten geschrieben werden. Ein Lauf ohne zu speichernde Daten erzeugt kein `.effective-flow/`.
2. **Fallback-Lesen:** Fehlt `.effective-flow/`, existiert aber ein älteres Laufzeitverzeichnis, lies die benötigten Dateien (`config.json`, `memory.json`, Report-/Investigation-Dateien …) aus dem jeweils vorhandenen Legacy-Verzeichnis — bevorzugt `.firmo/`, sonst `.sf-plugin/` —, solange noch nicht migriert wurde.
3. **Einmalige, nicht-destruktive Migration:** Sobald nach `.effective-flow/` geschrieben würde und noch kein `.effective-flow/` existiert, ein `.firmo/` oder `.sf-plugin/` aber vorhanden ist: lege `.effective-flow/` an und übernimm den vorhandenen Inhalt aus dem Legacy-Verzeichnis (bevorzugt `.firmo/` vor `.sf-plugin/`; kopieren, nicht verschieben), dann schreibe die Änderung in `.effective-flow/`. Existiert `.effective-flow/` bereits, findet **keine** erneute Migration statt (idempotent). Parallel-sicher: eine im Ziel bereits vorhandene Datei wird nicht überschrieben.
4. **Keine stille Löschung:** `.firmo/` und `.sf-plugin/` bleiben erhalten; das Aufräumen überlässt Effective Flow dem User.

Die `.gitignore`-Umstellung auf ein einzelnes `.effective-flow/` (inklusive Migration des früheren Zwei-Zeilen-Patterns `.effective-flow/*` plus `!.effective-flow/config.json` sowie einer pauschalen `.firmo/`- oder `.sf-plugin/`-Ignore-Zeile) übernimmt `$effective-flow setup`.

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie früh im Workflow und beachte ihre Vorgaben.

## Fertig-Protokoll

Wenn du interne Sub-Agenten einsetzt, gib ihnen dieses Antwortprotokoll vor:

- `ERLEDIGT` für vollständig abgeschlossen
- `ABBRUCH: [Grund]` für nicht erledigbar

Prüfung durch den Orchestrator:

1. `ERLEDIGT`: Phase abgeschlossen.
2. `ABBRUCH: [Grund]`: User informieren, Plan oder Auftrag anpassen und entscheiden, ob ein Retry sinnvoll ist.
3. Kein Stichwort: Retry mit Eskalation.

### Retry-Eskalation

Wenn ein interner Sub-Agent ohne `ERLEDIGT` oder `ABBRUCH` endet:

1. Retry 1: gleicher Auftrag mit Fortsetzungs-Hinweis
2. Retry 2: vereinfachter Auftrag mit reduziertem Scope
3. Retry 3: minimaler Auftrag nur für die kritischste Teilaufgabe
4. Nach 3 Fehlversuchen:
   - User informieren
   - Optionen als Freitext klären: manuell erledigen, mit nächster Phase fortfahren, Workflow abbrechen

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

## Wisdom Accumulation

Verwende `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md` für:

- Stash-Baseline aus Phase 1 (Liste der bereits vorhandenen Stash-Referenzen mit Beschreibungen und Commit-Hashes)
- Vorabanalyse pro Finding aus Phase 4.1 (betroffene Dateien, Root Cause / Anforderung, Implementierungsskizze, Risiken, Konfidenz)
- berechnete Komponenten aus Phase 4.2
- umgesetzte Findings und deren Ergebnis
- fehlgeschlagene Delegationen
- abgelehnte Findings und ihr Ergebnis (dauerhafte Entscheidung mit ADR-Slug bzw. nicht-dauerhaft ohne ADR)

Schreibe nach jeder Phase ein Summary und gib es an spätere Phasen weiter. Lösche die Datei am Ende.

## Effective Flow-Konfiguration

Effective Flow-interne Dateien liegen unter `.effective-flow/` im Projekt-Root.

- Konfiguration: Effective Flow-Konfiguration aus der Projektsetup-ADR (siehe Baustein „Config-Migration“)
- Memory-Datei: `.effective-flow/memory.json`
- Cache-Datei: `.effective-flow/cache.json`
- Review-Reports: `.effective-flow/review/`
- Temporäre Wisdom-Dateien: `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`

`apply-review` funktioniert ohne festgeschriebene Konfiguration. Falls die Effective Flow-Konfiguration (Projektsetup-ADR) Apply-Review-Werte festschreibt, überschreiben sie die Defaults (Schema hier zur Illustration):

```json
{
  "applyReview": {
    "defaultCommitStrategy": null,
    "finalValidation": "full",
    "stashPolicy": "interactive",
    "worktree": {
      "baseDir": ".effective-flow/.worktrees",
      "setup": "auto"
    }
  }
}
```

Fehlende Werte haben diese Defaults:

- `applyReview.defaultCommitStrategy`: nicht gesetzt (Commit-Strategie wird gefragt)
- `applyReview.finalValidation`: `full`
- `applyReview.stashPolicy`: `interactive` (heutiges interaktives Pro-Stash-Nachfragen)
- `applyReview.worktree.baseDir`: `.effective-flow/.worktrees`
- `applyReview.worktree.setup`: `auto`

Gültige Werte:

- `applyReview.defaultCommitStrategy`: `worktrees`, `single`, `none`
- `applyReview.finalValidation`: `full`, `changedScope`, `off`
- `applyReview.stashPolicy`: `interactive`, `keep`, `discard`, `apply`
- `applyReview.worktree.setup`: `auto`, `none` oder ein expliziter Setup-Befehl als String

### Config-Migration

Das Lesen der Effective Flow-Konfiguration aus der Projektsetup-ADR (inklusive der `applyReview`-Schlüssel) und die einmalige Migration einer Alt-Config übernimmt zentral der Baustein „Config-Migration“ (`config-migration.md`); dieser Baustein führt keine eigene per-Block-Migration mehr für `applyReview` aus. Das `applyReview`-Config-Schema oben (Konfiguration, gültige Werte) bleibt davon unberührt.

### Cache-Datei

Persistente Cache-Daten liegen ausschließlich in `.effective-flow/cache.json`, nicht in `.effective-flow/memory.json` und nicht dauerhaft in Wisdom-Dateien.

`apply-review` darf diesen Cache-Bereich verwenden:

| Bereich               | Inhalt                                                                                           | Invalidierung                                              |
| --------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `applyReviewAnalysis` | Vorabanalyse-Ergebnisse pro Report-Finding für unterbrochene oder wiederholte Apply-Review-Läufe | Report-Datei-Hash, Finding-ID, relevante Code-Datei-Hashes |

Regeln:

- Jeder Cache-Eintrag braucht `version`, `createdAt` und `sourceHash` oder gleichwertige Invalidierungsdaten.
- Bei Unsicherheit, fehlender Datei, ungültigem JSON, Versionswechsel oder nicht eindeutig prüfbarer Invalidierung: Cache ignorieren und normal neu berechnen.
- Ungültige Cache-Dateien nicht überschreiben; User kurz informieren und ohne Cache fortfahren.
- User-Entscheidungen zu Konflikten, Stashes oder ADR-Ablehnungen nicht cachen.
- Outputs fehlgeschlagener Delegationen nicht als Grundlage für spätere erfolgreiche Läufe verwenden.
- Wisdom-Dateien bleiben temporäre In-Run-Speicher und werden am Ende gelöscht.

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

## Remote-Modus (Issue-Tracker)

Ist der Tracker-Modus `remote` (das Argument ist ein Epic- oder Finding-Issue), lies **vor** dem lokalen Report-Fluss die interne Teil-Datei `tools/apply-review-remote.md` und befolge sie. Sie enthält die Issue-Tracker-Anbindung sowie den kompletten Remote-Ablauf (Phase 1–8 remote) und ersetzt bzw. ergänzt die entsprechenden lokalen Schritte. Im lokalen Modus (Report-Datei unter `.effective-flow/review/`) wird sie nicht geladen.

## Workflow

### Phase 1: Report einlesen und validieren

Bestimme zuerst den Tracker-Modus über die „Apply-Quellen-Erkennung“ (Report-Datei unter `.effective-flow/review/` → `local`; Epic-/Finding-Issue → `remote`). Ist er `remote`, lies und befolge die interne Teil-Datei `tools/apply-review-remote.md` (Phase 1 remote und folgende) statt der Report-Datei-Schritte 4–7 unten; die Config-, Stash- und Cache-Schritte gelten weiterhin.

1. Lade Effective Flow-Konfiguration, migriere sie falls nötig und bestimme Commit-Strategie-Default, Stash-Policy, Worktree-Defaults und finales Validierungsprofil.
2. Lies `.effective-flow/cache.json`, falls vorhanden und gültig. Verwende nur valide `applyReviewAnalysis`-Einträge.
3. **Stash-Baseline erfassen:** Führe `git stash list` aus und merke dir die vollständige Liste der bereits vorhandenen Stash-Referenzen (z. B. `stash@{0}`, `stash@{1}`, ... mit ihren Beschreibungen). Halte die Baseline in der Wisdom-Datei fest, damit Phase 6 (Stash-Bereinigung) später neue, durch diesen Workflow entstandene Stashes davon abgrenzen kann. Falls `git stash list` leer ist: notiere „keine Baseline-Stashes“.
4. Bestimme die Report-Datei:
   - falls als Argument übergeben: verwende diese Datei
   - sonst: suche nach `.effective-flow/review/review-report-*.md` in `.effective-flow/review/`
   - bei mehreren Reports: frage den User welcher verwendet werden soll
   - falls kein Report gefunden: Fehlermeldung und Abbruch
5. **Lies die Datei frisch ein.** Da die Datei zwischen Konversationen gelöscht und neu erstellt werden kann, darf kein zuvor eingelesener Inhalt verwendet werden. Lies die Datei immer direkt vom Dateisystem.
6. Parse alle Findings (`### [R-XXXXXXX] ...`-Blöcke) mit:
   - Finding-ID und Titel
   - Schweregrad
   - Komplexität
   - Aktion (`$effective-flow fix`, `$effective-flow refactor`, `$effective-flow build`, `$effective-flow docs`)
   - Prompt-Vorschlag
   - Entwickler-Anmerkung (falls vorhanden)
   - Bereits vorhandene Umsetzungshinweise (✅)
7. Klassifiziere jedes Finding:
   - **Bereits umgesetzt:** Finding hat bereits einen ✅-Hinweis → überspringen
   - **Nicht umsetzen:** Entwickler-Anmerkung beginnt mit „Nicht umsetzen“ → als Entscheidungs-Kandidat an `decision-records` (ADR nur bei dauerhafter Entscheidung)
   - **Umsetzen:** Kein ✅-Hinweis und keine ablehnende Anmerkung → an Skill delegieren
   - **Umsetzen mit Kontext:** Entwickler-Anmerkung vorhanden, die nicht mit „Nicht umsetzen“ beginnt → an Skill delegieren, Anmerkung als zusätzlichen Kontext mitgeben
8. Gib dem User eine Übersicht:

```markdown
**Report:** [Dateiname]
**Datum:** [Datum aus Report]

| Status | Anzahl |
|---|---|
| Umzusetzen | X |
| Nicht umsetzen (→ decision-records) | Y |
| Bereits umgesetzt | Z |
| Gesamt | N |
```

9. Falls keine umsetzbaren Findings vorhanden sind und keine abgelehnten Findings zu behandeln sind: Kurzmeldung und Abbruch.

### Phase 2: Commit- und Stash-Strategie

Diese Phase ist das einzige Up-front-Strategie-Gate des Workflows: Commit-Strategie und Stash-Policy werden hier gemeinsam festgelegt, bevor die Findings abgearbeitet werden. Danach folgt kein weiteres **reguläres** Approval-Gate; verbleibende Stopps sind ausschließlich konfliktbedingte Datenintegritäts-Eskalationen: ein `apply`-Merge-Konflikt in Phase 6, ein risikoreicher Cherry-Pick-Konflikt in Phase 4.3 bei der Strategie „Einzeln mit Worktrees“ und – selten – ein verwaister Commit-Lock bei der Strategie „Einzeln“. Tritt keine solche Eskalation auf, laufen die Phasen 3–8 unter nativem `/goal` autonom.

Wenn `applyReview.defaultCommitStrategy` gültig gesetzt ist, überspringe die ASK-Frage und verwende die konfigurierte Strategie:

- `worktrees` → **Einzeln mit Worktrees**
- `single` → **Einzeln**
- `none` → **Keine Commits**

Melde kurz, dass die Commit-Strategie aus der Effective Flow-Konfiguration (Projektsetup-ADR) übernommen wurde. Wenn kein gültiger Wert gesetzt ist, frage wie bisher:

Wenn kein gültiger Wert für `applyReview.defaultCommitStrategy` gesetzt ist: Frage den User: **Welche Commit-Strategie soll für die Findings verwendet werden?**
- Einzeln mit Worktrees -- Parallele Komponenten laufen in isolierten Git-Worktrees und werden anschließend zurückgeführt (häufigste Wahl)
- Einzeln -- Jedes Finding wird nach Umsetzung einzeln committet
- Keine Commits -- Alle Änderungen werden ohne automatische Commits durchgeführt

Halte die Antwort fest und gib sie an jeden delegierten Skill als Anweisung weiter:

- **Einzeln mit Worktrees:** Jede parallele Komponente arbeitet in einem eigenen Git-Worktree, committet dort die Findings einzeln und der Orchestrator führt die Commits danach sequenziell per `git cherry-pick` in den ursprünglichen Branch zurück. Commit-Messages folgen denselben Regeln wie bei `Einzeln`: konkrete Conventional-Commit-Message, keine internen Finding-IDs, kein `Co-Authored-By`.
- **Einzeln:** Nach jedem abgeschlossenen Finding die Änderungen committen. Verwende eine konkrete Conventional-Commit-Message ohne interne Finding-ID, z. B. `fix: clarify review decision filtering`. Setze **niemals** `Co-Authored-By`-Trailer (auch nicht für LLMs); das gilt für jeden Commit, der durch diesen Workflow oder einen delegierten Sub-Agenten erzeugt wird. Protokolliere die Zuordnung von Finding-ID zu Commit-Hash direkt nach jedem erfolgreichen Commit in der Wisdom-Datei.
- **Keine Commits:** Keine automatischen Commits, der User committet selbst.

#### Stash-Policy

Teil desselben Up-front-Gates: Die Stash-Policy legt vorab fest, wie die Stash-Bereinigung in Phase 6 (Klassen B/C/D) und das Abbruch-Aufräumen in Phase 4.3 mit hinterlassenen Stashes umgehen – ohne spätere Rückfrage. Konkrete Stashes existieren zu Beginn noch nicht; entschieden wird daher die Policy, nicht der Einzelfall.

Wenn `applyReview.stashPolicy` gültig gesetzt ist, überspringe die ASK-Frage und verwende den Wert; melde kurz, dass die Stash-Policy aus der Effective Flow-Konfiguration (Projektsetup-ADR) übernommen wurde. Wenn kein gültiger Wert gesetzt ist, frage am selben Gate wie die Commit-Strategie:

Wenn kein gültiger Wert für `applyReview.stashPolicy` gesetzt ist: Frage den User: **Wie sollen während des Laufs hinterlassene Stashes behandelt werden, wenn eine Entscheidung nötig ist?**
- Interaktiv -- Pro betroffenem Stash nachfragen (heutiges Verhalten, blockiert autonome Läufe)
- Behalten -- Unklare Stashes unverändert behalten und am Ende berichten (sicher für autonome Läufe)
- Verwerfen -- Unklare Stashes verwerfen (git stash drop) – möglicher Datenverlust
- Anwenden -- Unklare Stashes anwenden (git stash pop); bei Merge-Konflikt wird trotzdem nachgefragt

Werte-Zuordnung: Interaktiv → `interactive`, Behalten → `keep`, Verwerfen → `discard`, Anwenden → `apply`. Halte die gewählte Policy in der Wisdom-Datei fest. Für unbeaufsichtigte `/goal`-Läufe ist `keep` der sichere Wert; `interactive` blockiert solche Läufe an Phase 6 und Phase 4.3.

#### Optionaler `/goal`-String

Nachdem Commit-Strategie und Stash-Policy feststehen, gib gemäß „Goal-getriebene Abschlusssteuerung“ den optionalen `/goal`-String aus; er deckt die Phasen 3–8 ab. Der String referenziert die Report-Datei und weist an, die verbleibenden Phasen zu durchlaufen. Bei `stashPolicy != interactive` (empfohlen `keep`) laufen diese Phasen ohne reguläres Approval-Gate; verbleibende Stopps sind nur die konfliktbedingten Eskalationen aus der Phase-Einleitung (`apply`-Merge-Konflikt, risikoreicher Cherry-Pick-Konflikt bei Worktrees, selten ein verwaister Lock).

#### Commit-Mechanik je Strategie

Die detaillierte Mechanik der committenden Strategien – **Einzeln** (Git-Commit-Mutex) und **Einzeln mit Worktrees** (Worktree-Isolation samt Cherry-Pick-Konfliktbewertung) – steht in der internen Teil-Datei `tools/apply-review-commit-mechanics.md`. Lies sie, sobald in Phase 2 die Strategie feststeht und Commits erzeugt werden; bei **Keine Commits** entfällt sie. Die späteren Phasen verweisen für die Detailregeln auf diese Teil-Datei.

### Phase 3: Abgelehnte Findings → Entscheidungs-Kandidat (Delegation an `decision-records`)

Das ADR-Authoring besitzt der Host-Skill `decision-records` (Domänen-Owner: ADR-Würdigung, Repo-Konventions-Erkennung, Lifecycle, Supersession, Index). Dieser Workflow **autort kein ADR mehr selbst** und kodiert weder `docs/adr/`, noch Nummerierung, Status-Text oder ein festes Template. Firmo behält das **Mapping** (Finding + Entwickler-Anmerkung → Entscheidungs-Kandidat), den Approval-/Status-Fluss, den **Backlink** zu Report/Remote-Issue und das Tracking des Ergebnis-Artefakts in der Zusammenfassung.

Sichte zunächst die verfügbaren Skills:

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

Für jedes Finding mit „Nicht umsetzen“-Anmerkung (im Remote-Modus: `wontfix`-Finding, mit `wontfix`-Begründung statt Entwickler-Anmerkung):

1. **Entscheidungs-Kandidat bilden.** Fasse aus dem Finding und der Entwickler-Anmerkung einen Kandidaten zusammen: sprechender Titel, Kontext (Report-Dateiname + Finding-ID bzw. Issue-/Epic-Nummer), die Ablehnungs-Begründung (vollständige Anmerkung/`wontfix`-Text) und einen nachverfolgbaren **Backlink** zum Quell-Finding.
2. **An `decision-records` delegieren.** Übergib den Kandidaten an den Skill mit dem Auftrag, (a) zu **entscheiden, ob** eine dauerhafte Architektur-/Grundsatzentscheidung vorliegt, die eine ADR rechtfertigt, und (b) sie, falls ja, nach der **entdeckten Repo-Konvention** zu autoren. Die für dieses Repo deklarierte Konvention ist das lebende Slug-Modell aus `adr-convention.md` (Ort/Dateiname/Titel/Status/Mutabilität); deklariert das Zielprojekt eine eigene ADR-Konvention, folgt der Skill dieser. Constraint an den Skill: die ADR trägt den Backlink zum Finding und wird **nicht** zu einem Task-Status-Ledger; eine bestehende thematisch passende lebende ADR wird **in-place** aktualisiert statt dupliziert.
3. **Nicht-dauerhafte Ablehnung.** Stuft `decision-records` den Kandidaten als reine Delivery-Historie ohne dauerhafte Wirkung ein (kein ADR gerechtfertigt), wird **keine** ADR erzwungen — die Ablehnung bleibt im Review-Report bzw. (Remote-Modus) am Issue/Epic dokumentiert (siehe Phase 5).
4. **Minimaler Fallback (Skill fehlt).** Ist `decision-records` nicht verfügbar (nicht installiert, `skills.enabled: false` oder via `exclude` deaktiviert), autort dieser Workflow die dauerhafte Entscheidung selbst nach der **minimalen Fallback-Struktur** aus `adr-convention.md` (lebende Slug-ADR unter dem erkannten ADR-Verzeichnis, Default `docs/adr/<slug>.md`; bestehende thematisch passende ADR in-place aktualisieren, Datei vorher frisch einlesen). **Kein** Erfinden einer zweiten Konvention.
5. Gib dem User eine Statusmeldung über die erzeugten bzw. aktualisierten Records und referenziere jeden per Slug, z. B. `(ADR: <slug>)`; nenne die als nicht-dauerhaft eingestuften Ablehnungen separat.

### Phase 4: Vorabanalyse und parallele Delegation

Diese Phase besteht aus drei Teilschritten. Ziel: Maximierung der Parallelität, ohne den 1-Commit-pro-Finding-Vertrag zu brechen.

#### Phase 4.1: Vorabanalyse (parallel pro Finding)

Starte für **jedes umsetzbare Finding** einen Vorabanalyse-Sub-Agenten parallel. Diese Sub-Agenten implementieren nichts und ändern keine Dateien — sie analysieren nur.

Jeder Vorabanalyse-Sub-Agent erhält:

- die Finding-Details aus dem Report (ID, Problem, Empfehlung, Datei, Aktion)
- die Entwickler-Anmerkung (falls vorhanden)
- den Auftrag, den Code zu untersuchen und ein strukturiertes Analyse-Ergebnis zu liefern:
  - **Betroffene Dateien:** vollständige Liste aller Dateien, die wahrscheinlich angefasst werden (mehr als nur die im Report genannte primäre Datei).
  - **Root Cause / aktuelles Verhalten** (für `$effective-flow fix` und `$effective-flow refactor`), **Anforderung** (für `$effective-flow build`) bzw. **Dokumentationslücke und Zielgruppe** (für `$effective-flow docs`).
  - **Implementierungsskizze:** kurzer Plan in 2-5 Bullet-Points.
  - **Risiken und Datei-Abhängigkeiten:** mögliche Nebenwirkungen, Kollisionen mit anderen Findings.
  - **Konfidenz:** `Hoch` (Datei-Liste sicher), `Mittel` (Datei-Liste plausibel), `Niedrig` (File-Scope unsicher, z. B. großes Refactoring oder unklare Dependency).
- das Fertig-Protokoll

Schreibe das Ergebnis pro Finding in die Wisdom-Datei unter `## Vorabanalyse [R-XXXXXXX]`. Bei `ABBRUCH` markiere das Finding mit dem Status `fehlgeschlagen (Vorabanalyse)` in der Wisdom-Datei und überspringe es bei den folgenden Schritten. Diese Kennzeichnung erlaubt Phase 6 (Stash-Bereinigung), zwischen Vorabanalyse-Abbrüchen (kein Stash möglich, da nichts implementiert wurde) und Delegations-Abbrüchen (Stash kann existieren) zu unterscheiden.

Verwende einen validen `applyReviewAnalysis`-Cache-Eintrag nur dann, wenn Report-Datei-Hash, Finding-ID und relevante Code-Datei-Hashes zur aktuellen Situation passen. Wenn der Cache nicht eindeutig valide ist, führe die Vorabanalyse neu aus. Aktualisiere den Cache nur nach erfolgreicher Vorabanalyse; schreibe keine User-Entscheidungen oder fehlgeschlagenen Delegationsoutputs in den Cache.

#### Phase 4.2: Überlappungs-Komponenten bilden (lokal im Orchestrator)

Bilde die Parallelisierungs-Einheiten **global über alle umsetzbaren Findings aller Aktionsgruppen hinweg** (`$effective-flow fix`, `$effective-flow refactor`, `$effective-flow build`, `$effective-flow docs`), anhand der Datei-Listen aus Phase 4.1. Die Aktionsgruppe eines Findings bestimmt später nur, welcher Skill es umsetzt (Phase 4.3), **nicht** die Gruppierung: Zwei Findings, die dieselbe Datei anfassen, dürfen nie gleichzeitig laufen — auch dann nicht, wenn ihre Aktionen unterschiedlich sind. Vorgehen explizit zweistufig:

1. **Partitioniere** alle Findings (aktionsübergreifend) in zwei Mengen:
   - **Konfidenz-Niedrig-Menge:** Findings mit Konfidenz `Niedrig` (File-Scope unsicher).
   - **Rest-Menge:** Findings mit Konfidenz `Hoch` oder `Mittel`.
2. Wende **Union-Find auf die Rest-Menge aller Aktionsgruppen gemeinsam** an:
   - Initialisiere jedes Finding der Rest-Menge als eigene Komponente.
   - Für jeden Datei-Pfad, der von mehr als einem Finding der Rest-Menge genannt wird: vereinige die Komponenten der beteiligten Findings — unabhängig von deren Aktionsgruppe.
   - Ergebnis: zwei Findings sind genau dann in derselben Komponente, wenn sie über eine Kette von Datei-Überlappungen verbunden sind (auch transitiv: teilen A–B und B–C je eine Datei, ohne dass A–C direkt überlappen, landen A, B, C in derselben Komponente; auch sternförmig: teilt A je eine Datei mit B und mit C, ohne dass B–C überlappen, landen ebenfalls alle drei in derselben Komponente). Eine Komponente darf Findings mehrerer Aktionsgruppen enthalten.
3. Füge die **Konfidenz-Niedrig-Menge als eine gemeinsame Safety-Komponente** zum Ergebnis hinzu. Diese Komponente läuft intern sequenziell, weil der File-Scope unsicher ist und parallele Singleton-Streams sonst dieselbe Datei verändern könnten, ohne dass Union-Find den Konflikt erkennt.
4. Reihenfolge innerhalb einer Komponente: Reihenfolge wie im Report (deterministisch). Keine Schweregrad-Sortierung — Schweregrade können Abhängigkeiten implizieren. Jedes Finding behält seine Aktionsgruppe; sie entscheidet in Phase 4.3 den Ziel-Skill.
5. Reihenfolge **der Komponenten** untereinander: deterministisch nach der Report-Position ihres ersten Findings. Diese Reihenfolge ist zugleich die Integrationsreihenfolge im Worktree-Modus (Phase 4.3, Schritt 7).
6. Ergebnis: eine globale Liste von Überlappungs-Komponenten, jede mit 1-N Findings (ggf. gemischter Aktion).

Edge Cases:

- Sind alle Findings Konfidenz `Niedrig`, entsteht eine einzelne Safety-Komponente mit allen Findings; der Union-Find-Schritt entfällt.
- Gibt es genau ein umsetzbares Finding, ist das Ergebnis immer eine einzelne Komponente.
- Ein Finding, das mit keinem anderen Finding eine Datei teilt, bleibt eine eigene Komponente und läuft parallel zu den übrigen.

Beispiel (aktionsübergreifend) mit fünf Findings über mehrere Aktionen:

- F1 `[fix] src/auth.ts` und F2 `[refactor] src/auth.ts` → Komponente A (sequenziell, gemischte Aktion: F1 via `$effective-flow fix`, F2 via `$effective-flow refactor`)
- F3 `[fix] src/billing.ts` → Komponente B (parallel zu A)
- F4 `[docs] docs/guide.md` und F5 `[build] docs/guide.md` → Komponente C (parallel zu A und B, intern sequenziell)
  Drei parallele Streams. Die frühere getrennt-pro-Aktion-Gruppierung hätte F1 und F2 in verschiedene Streams gelegt und beide gleichzeitig auf `src/auth.ts` schreiben lassen.

#### Phase 4.3: Parallele Delegation

1. Starte für jede **Überlappungs-Komponente** aus Phase 4.2 einen Delegations-Sub-Agenten. Alle Komponenten laufen parallel (sie teilen sich per Konstruktion keine Datei); innerhalb eines Sub-Agenten werden seine Findings **sequenziell** in Komponenten-Reihenfolge abgearbeitet — auch wenn die Komponente Findings mehrerer Aktionsgruppen enthält.
   - Bei Commit-Strategie `Einzeln mit Worktrees`: erstelle vorher pro Komponente den Worktree gemäß der Worktree-Regeln und starte den Sub-Agenten mit diesem Worktree als Arbeitsverzeichnis.
2. Jeder Delegations-Sub-Agent erhält im Prompt direkt eingebettet:
   - die Finding-Details (ID, Problem, Empfehlung, Prompt-Vorschlag, Datei)
   - die zugehörige Vorabanalyse aus Phase 4.1 als **inline-Kontext-Block** im Prompt — nicht als Verweis auf die Wisdom-Datei. Die Sub-Skills lesen die Wisdom-Datei nicht; sie verarbeiten nur den Prompt-Inhalt. Bette die Vorabanalyse vollständig ein, etwa unter der Überschrift `Vorabanalyse für dieses Finding:`.
   - die Entwickler-Anmerkung (falls vorhanden)
   - die Commit-Strategie aus Phase 2
   - **Bei Commit-Strategie „Einzeln“:** die vollständige Git-Commit-Mutex-Regel aus `tools/apply-review-commit-mechanics.md`. Der Sub-Agent muss jeden Finding-Commit unter `.effective-flow/apply-review-commit.lock` ausführen, darf nur Finding-eigene Dateien stage-en und darf niemals `git add .`, `git add -A` oder `git commit -a` verwenden.
   - **Bei Commit-Strategie „Einzeln mit Worktrees“:** die vollständige Git-Worktree-Isolation-Regel aus `tools/apply-review-commit-mechanics.md`. Der Sub-Agent arbeitet ausschließlich im zugewiesenen Worktree, committet dort jedes Finding einzeln und protokolliert Commit-Hashes in der Wisdom-Datei. Der Sub-Agent darf nicht in den ursprünglichen Worktree wechseln.
   - den Auftrag, für **jedes** Finding den zu seiner Aktionsgruppe passenden Skill aufzurufen (bei gemischten Komponenten also pro Finding neu bestimmt):
     - Aktion fix: `Verwende den Skill $effective-flow fix für dieses Finding.`
     - Aktion refactor: `Verwende den Skill $effective-flow refactor für dieses Finding.`
     - Aktion build: `Verwende den Skill $effective-flow build für dieses Finding.`
     - Aktion docs: `Verwende den Skill $effective-flow docs für dieses Finding.`
   - den Prompt-Vorschlag aus dem Report als Aufgabenbeschreibung
   - **Stash-Konvention:** Falls während der Umsetzung dieses Findings irgendein Stash entsteht (durch einen Pre-Commit-Hook, einen manuellen `git stash` im Sub-Skill oder einen Tool-getriggerten Stash), **muss die Stash-Message die Finding-ID enthalten**, z. B. `apply-review R-XXXXXXX <kurze Beschreibung>`. Das ermöglicht der Stash-Bereinigung in Phase 6, den Stash zuverlässig dem Finding zuzuordnen.
   - den Hinweis, dass der Sub-Agent als **nicht-interaktiver** Delegations-Sub-Agent von `$effective-flow apply-review` läuft und daher die explizite Goal-Abfrage gemäß „Explizite Goal-Abfrage für autonome Läufe“ überspringt: keine Zusatzoption „Autonom via /goal“, kein `/goal`-String. `$effective-flow apply-review` steuert den autonomen Lauf an seinem eigenen Gate.
   - das Fertig-Protokoll
3. Prüfe jeden Sub-Agenten auf `ERLEDIGT` oder `ABBRUCH`.
4. Bei `ABBRUCH`:
   - User informieren, Finding als `fehlgeschlagen (Delegation)` in der Wisdom-Datei markieren.
   - **Vor dem nächsten Finding derselben Komponente:** prüfe via `git status`, ob der Arbeitsbaum sauber ist. Falls uncommittete Änderungen vorhanden sind (halbfertige Datei vom abgebrochenen Finding), räume den Arbeitsbaum gemäß der in Phase 2 festgelegten `stashPolicy` auf, bevor das nächste Finding startet – sonst arbeitet es auf inkonsistentem Zustand:
     - `interactive` → den User fragen, ob die Änderungen gestasht oder verworfen werden sollen.
     - `keep` und `apply` → mit Finding-ID stashen (`git stash push -m "apply-review abort R-XXXXXXX"`); `apply` ist hier nicht sinnvoll, da es ums Saubermachen vor dem nächsten Finding geht, und wird daher wie `keep` behandelt.
     - `discard` → die Änderungen verwerfen.

     Stashe in jedem Fall mit der Finding-ID in der Message, damit Phase 6 den Stash zuordnen kann.

   - Mit dem nächsten Finding innerhalb derselben Komponente fortfahren. Andere Komponenten laufen unabhängig weiter.

5. Gib dem User nach jeder abgeschlossenen Komponente eine Statusmeldung mit dem Ergebnis pro Finding.
6. **Synchronisationsbarriere vor Phase 5:** Starte Phase 5 erst, wenn **alle** in Phase 4.3 gestarteten Delegations-Sub-Agenten einen Endstatus geliefert haben (`ERLEDIGT` oder `ABBRUCH`).
7. Bei Commit-Strategie `Einzeln mit Worktrees`: integriere nach der Synchronisationsbarriere alle erfolgreichen Worktree-Branches sequenziell per `git cherry-pick` in den ursprünglichen Branch, und zwar in der **deterministischen Komponenten-Reihenfolge aus Phase 4.2, Schritt 5** (Komponenten nach Report-Position ihres ersten Findings; innerhalb einer Komponente die Finding-Commits in Komponenten-Reihenfolge). Diese feste Reihenfolge macht das Integrationsergebnis reproduzierbar. Phase 5 darf erst starten, wenn diese Integration abgeschlossen ist oder der Workflow wegen Konflikt/User-Entscheidung angehalten wurde.
8. Eine Statusmeldung nach einer abgeschlossenen Komponente ist **keine** Abschlussmeldung des Gesamt-Workflows und **kein** Halt. Nach jeder Statusmeldung prüfst du aktiv, welche Delegations-Komponenten noch laufen, wartest auf deren Endstatus und setzt Phase 4.3 fort, bis keine Komponente mehr offen ist.

#### Bekannte Einschränkungen

- **Cross-Action-Datei-Konflikte werden erkannt:** Die Überlappungs-Komponenten aus Phase 4.2 entstehen global über alle Aktionsgruppen. Findings, die dieselbe Datei betreffen, landen daher in derselben Komponente und laufen sequenziell — auch bei unterschiedlichen Aktionen schreiben sie nie gleichzeitig in einen Arbeitsbaum. Verbleibende Einschränkung: Die Erkennung ist nur so genau wie die Datei-Listen der Vorabanalyse (Phase 4.1). Fasst ein Finding zur Laufzeit eine in seiner Analyse nicht genannte Datei an, kann eine Überlappung unentdeckt bleiben; Konfidenz-Niedrig-Findings mit unsicherem File-Scope deckt hierfür die gemeinsame Safety-Komponente ab.
- **Konfidenz-Niedrig-Findings** laufen aktionsübergreifend in einer gemeinsamen Safety-Komponente sequenziell, weil ihr File-Scope unsicher ist.
- Der Git-Commit-Mutex isoliert nur Staging und Commit im ursprünglichen Worktree. Der Worktree-Modus isoliert zusätzlich Arbeitsbaum und Git-Index, verschiebt mögliche Konflikte aber in die sequenzielle Cherry-Pick-Integration (in deterministischer Komponenten-Reihenfolge).

### Phase 5: Report aktualisieren

**Vorbedingung:** Phase 5 darf erst starten, wenn die Synchronisationsbarriere aus Phase 4.3 erfüllt ist, also keine Delegations-Komponente mehr offen ist.

1. Lies die Report-Datei erneut frisch vom Dateisystem ein. Die Datei könnte sich während der Umsetzung geändert haben.
2. Ergänze an jedem erfolgreich umgesetzten Finding als letzten Eintrag:
   `✅ Umgesetzt am YYYY-MM-DD via Effective Flow Apply-Review`
3. Ergänze an jedem abgelehnten Finding als letzten Eintrag – je nach Einstufung durch `decision-records`:
   - dauerhafte Entscheidung mit ADR: `📋 ADR am YYYY-MM-DD angelegt/aktualisiert: nicht umgesetzt (ADR: <slug>)`
   - nicht-dauerhafte Ablehnung ohne ADR: `⏭️ Am YYYY-MM-DD als nicht umgesetzt dokumentiert (keine dauerhafte Entscheidung, kein ADR)`
4. Speichere die aktualisierte Report-Datei.

### Phase 6: Stash-Bereinigung

Während der Delegation in Phase 4 können die aufgerufenen Sub-Skills oder Pre-Commit-Hooks neue Stashes anlegen, die ohne Bereinigung zurückbleiben. Diese Phase findet und behandelt sie.

1. Führe `git stash list` aus und vergleiche das Ergebnis mit der in Phase 1 erfassten Baseline.
2. Bestimme die **neuen Stashes** als alle Einträge, die in der aktuellen Liste, aber nicht in der Baseline vorhanden sind. Vergleiche dabei nicht über `stash@{N}`-Indizes (verschieben sich), sondern über die vollständige Beschreibung (Branch + Commit-Hash + Subject) und idealerweise zusätzlich über die Stash-Commit-Hashes (`git stash list --format='%H %gs'`).
3. Falls keine neuen Stashes gefunden werden: gib kurz „Keine offenen Stashes aus diesem Lauf.“ aus und gehe zur nächsten Phase.
4. **Stash-Finding-Zuordnung:** Bestimme für jeden neuen Stash das zugehörige Finding über die folgenden Heuristiken — in dieser Priorität:

   1. **Stash-Message-Match (primär):** suche per Regex `R-\d{7}` in der Stash-Message. Bei Treffer ist die Zuordnung eindeutig.
   2. **Datei-Überlappung (Fallback):** falls keine ID in der Message: vergleiche die geänderten Dateien des Stashes (`git stash show --name-only stash@{N}`) mit den in der Wisdom-Datei je Finding protokollierten Dateien. Eine signifikante Überlappung gilt als Zuordnung.
   3. **Keine Zuordnung:** falls weder Message-Match noch klare Datei-Überlappung → der Stash gehört zu keinem Finding aus diesem Lauf (z. B. aus einem externen Pre-Commit-Hook).

5. **Klassifiziere jeden Stash:**

   **A. Finding komplett umgesetzt UND Stash-Inhalt vollständig im Commit für das Finding enthalten:**
   - Lies aus der Wisdom-Datei den Status des zugeordneten Findings. „Komplett umgesetzt“ bedeutet: Status `ERLEDIGT` aus Phase 4.3.
   - Hole die Commits, die zu diesem Finding gehören, aus der in Phase 4.3 protokollierten Wisdom-Zuordnung `Finding-ID -> Commit-Hash`; bei „Keine Commits“ entfällt dieser Pfad — siehe Klassifikation D unten.
   - Vergleiche `git stash show -p stash@{N}` mit `git show <commit>` für die geänderten Dateien. Wenn der Stash-Diff inhaltlich vollständig im Finding-Commit aufgegangen ist (Stash-Inhalt ist eine Teilmenge der Commit-Änderungen) → **Stash ist Zwischenstand, nicht mehr benötigt**.

   **B. Finding komplett umgesetzt, aber Stash enthält Änderungen, die NICHT im Finding-Commit sind:**
   - Stash könnte vergessenen Teilfix oder ungenutzten Zwischenstand enthalten — User-Entscheidung erforderlich.

   **C. Finding fehlgeschlagen (Status `fehlgeschlagen (Delegation)` oder `fehlgeschlagen (Vorabanalyse)`):**
   - Stash ist potenziell die einzige Spur der Teilarbeit — User-Entscheidung erforderlich.

   **D. Kein Finding zugeordnet ODER Commit-Strategie „Keine Commits“:**
   - Bei „Keine Commits“ gibt es keinen Commit zum Vergleich → kein Auto-Drop möglich.
   - User-Entscheidung erforderlich.

6. **Behandle jeden Stash anhand seiner Klassifikation:**

   **Stash-Policy aus Phase 2 anwenden:** Klasse A bleibt in allen Policies Auto-Drop. Die Klassen B/C/D folgen der `stashPolicy`. Die untenstehenden Klassen-Schritte beschreiben den Fall `stashPolicy = interactive` (Default), der pro Stash die Stash-Frage stellt. Bei den anderen Werten entfällt die Frage und du handelst direkt: `keep` → Stash unverändert behalten und für die Phase-8-Zusammenfassung als „behalten“ vermerken; `discard` → `git stash drop`; `apply` → `git stash pop` und bei Merge-Konflikt **nicht** droppen, sondern an den User eskalieren (einziger verbleibender Stopp im Autonom-Lauf).

   - **Klasse A:** Drop ohne Nachfrage.
     - `git stash drop stash@{N}`
     - Logge dem User: „Stash für `[R-XXXXXXX]` verworfen — Finding vollständig umgesetzt, Zwischenstand nicht mehr benötigt."

   - **Klasse B:** User informieren und nachfragen.
     - Zeige Stash-Beschreibung, betroffene Dateien und Hinweis: „Finding `[R-XXXXXXX]` wurde umgesetzt, der Stash enthält jedoch Änderungen, die nicht in den Commit eingeflossen sind — möglicherweise ein vergessener Teilfix."
     - Stelle die untenstehende Stash-Frage.

   - **Klasse C:** User informieren und nachfragen.
     - Zeige Stash-Beschreibung, betroffene Dateien und Hinweis: „Finding `[R-XXXXXXX]` ist fehlgeschlagen, der Stash könnte ein unvollständiger Versuch sein."
     - Stelle die untenstehende Stash-Frage.

   - **Klasse D:** User informieren und nachfragen.
     - Zeige Beschreibung und Inhalt (`git stash show -p stash@{N}`).
     - Stelle die untenstehende Stash-Frage ohne Finding-Bezug.

   Stash-Frage (für die Klassen B, C und D; nur bei `stashPolicy = interactive`):

Frage den User: **Wie soll dieser Stash behandelt werden?**
- Anwenden und löschen -- `git stash pop` ausführen und Inhalt in den Branch übernehmen
- Verwerfen -- `git stash drop` ausführen, Inhalt geht verloren
- Behalten -- Stash unverändert lassen

7. Führe die Entscheidung aus – die interaktive Antwort bei `stashPolicy = interactive`, sonst die Policy-Aktion aus Schritt 6:
   - **Anwenden und löschen:** `git stash pop stash@{N}`. Bei Konflikten: User informieren, manuelle Auflösung anbieten, Stash nicht automatisch droppen, bis der Konflikt aufgelöst ist.
   - **Verwerfen:** `git stash drop stash@{N}`.
   - **Behalten:** keine Aktion.
8. Wichtig: nach jeder `pop`/`drop`-Aktion verschieben sich die `stash@{N}`-Indizes. Lies die Liste daher nach jeder Aktion neu und matche über die in Schritt 2 erfasste Beschreibung/den Commit-Hash, nicht über alte Indizes.
9. Gib dem User eine kurze Statusmeldung über alle behandelten Stashes (automatisch verworfen, manuell behandelt, behalten). Halte die Liste der behaltenen Stashes (Referenz und Beschreibung) für die Phase-8-Zusammenfassung fest.

### Phase 7: Finale Validierung

1. Beachte `applyReview.finalValidation`:
   - `full`: aktuelles projektweites Qualitäts-Gate.
   - `changedScope`: verwende nur vorhandene schnelle oder scope-bewusste Checks, wenn das Projekt sie anbietet; erfinde keine eigenen Tool-Argumente. Falls kein solcher Check existiert, führe einen einmaligen Standard-Check aus und starte keine globale Fix-Schleife.
   - `off`: überspringe finale Validierung ausdrücklich, erstelle keinen Validierungsfix-Commit und nenne das Restrisiko in der Zusammenfassung.
2. Falls `off` aktiv ist: gehe nach kurzer Meldung zu Phase 8.
3. Prüfe ob im Projekt ein Validierungs-Script konfiguriert ist (z. B. `agent:check`, `typecheck`, `lint` in `package.json`).
4. Falls vorhanden: führe die verfügbaren Prüfungen gemäß Validierungsprofil aus (z. B. `pnpm agent:check`, `pnpm typecheck`, `pnpm lint`).
5. Falls Errors oder Warnings gefunden werden:
   - behebe alle Errors und Warnings, auch wenn sie nicht direkt aus den Findings dieses Laufs stammen. Die finale Validierung ist ein projektweiter Qualitäts-Gate, keine reine Finding-Scope-Prüfung.
   - Bei `changedScope`: behebe nur Fehler, die im geänderten Scope oder im einmaligen Standard-Check eindeutig durch diesen Lauf entstanden sind; wenn die Zuordnung unklar ist, informiere den User statt unrelated Fixes breit umzusetzen.
   - protokolliere in der Wisdom-Datei, welche Dateien durch finale Validierungsfixes geändert wurden und ob sie direkt zu Findings gehören oder unrelated Validation-Fixes sind.
   - führe die Prüfungen erneut aus
   - bei `full`: behebe und prüfe erneut gemäß „Goal-getriebene Abschlusssteuerung“; begrenze die internen Korrekturrunden und eskaliere an den User, falls die Prüfungen danach weiterhin fehlschlagen, statt unbegrenzt zu wiederholen
   - bei `changedScope`: wiederhole nur, wenn die betroffene Prüfung scope-bewusst oder schnell genug ist; andernfalls dokumentiere das Ergebnis und frage bei unklaren Restfehlern den User
6. Falls in Phase 2 die Commit-Strategie „Einzeln“ gewählt wurde und Fixes nötig waren:
   - verwende den Git-Commit-Mutex aus `tools/apply-review-commit-mechanics.md` für die gesamte finale Staging-/Commit-Sektion.
   - führe vor dem Staging `git status --porcelain` aus und unterscheide finale Validierungsfixes von bereits vorhandenen User-Änderungen.
   - stage ausschließlich Dateien, die durch die finale Validierungsfix-Schleife geändert wurden. Verwende keine pauschalen Befehle wie `git add .`, `git add -A` oder `git commit -a`.
   - prüfe `git diff --cached --name-only` und `git diff --cached`.
   - committe die Fixes mit einer Commit-Message wie `fix: resolve validation errors from final check`. Wenn unrelated Validation-Fixes enthalten sind, erwähne das konkret in der Commit-Message, z. B. `fix: resolve final validation errors including unrelated warnings`.
7. Falls kein Validierungs-Script vorhanden ist: überspringe diese Phase mit kurzer Meldung.
8. Gib dem User eine kurze Statusmeldung über das Ergebnis.

### Phase 8: Zusammenfassung

**Vorbedingung:** Phase 8 darf erst starten, wenn Phase 5 bis 7 vollständig abgeschlossen wurden. Eine frühere Zwischenmeldung beendet den Workflow nicht.

1. Lösche die Wisdom-Datei.
2. Gib dem User eine Zusammenfassung:

```markdown
**Apply-Review abgeschlossen**

| Status | Anzahl |
|---|---|
| Erfolgreich umgesetzt | X |
| ADR erstellt (dauerhafte Entscheidung) | Y |
| Abgelehnt ohne ADR (nicht-dauerhaft) | V |
| Fehlgeschlagen | Z |
| Übersprungen (bereits umgesetzt) | W |

[Falls Findings fehlgeschlagen sind:]
**Fehlgeschlagene Findings:**
- [R-XXXXXXX] [Titel]: [Grund]

[Falls Stashes behalten wurden (z. B. stashPolicy keep):]
**Behaltene Stashes:**
- `stash@{N}` [Beschreibung] — bitte manuell prüfen
```

## Regeln

- Vorabanalyse (Phase 4.1) immer parallel pro Finding
- Delegation (Phase 4.3) parallel pro **Überlappungs-Komponente** (global über alle Aktionsgruppen gebildet); innerhalb einer Komponente sequenziell, damit gleiche-Datei-Findings — auch aktionsübergreifend — nie gleichzeitig schreiben und die Commit-Reihenfolge sauber bleibt
- Nach dem Start der Delegation in Phase 4.3 aktiv auf **alle** Komponenten-Endstatus warten, bevor Phase 5 beginnt oder der Workflow endet
- Die Report-Datei muss beim Start des Skills frisch vom Dateisystem gelesen werden
- Gib dem User nach jeder Phase eine kurze Statusmeldung
- Wenn ein delegierter Skill fehlschlägt: User informieren, nächstes Finding fortsetzen
- Überspringe bereits umgesetzte Findings (mit ✅) ohne Meldung
- Gib internen Sub-Agenten das Fertig-Protokoll vor
- Schreibe nach jeder abgeschlossenen Phase ein Wisdom-Summary
- Dieser Skill vergibt keine neuen Finding-IDs. Falls zukünftig neue Findings erstellt werden sollen, muss `.effective-flow/memory.json` gelesen und aktualisiert werden (siehe `$effective-flow review`)
