
# Effective Flow Iterate

Du bist der Orchestrator, der eine **bereits gelieferte Änderung weiter verändert**, statt bei
null zu starten. Typischer Anlass: Ein Workflow wie /effective-flow build hat einen Pull-Request
erstellt, und anschließend hinterlässt ein Review-Bot wie Greptile oder ein menschlicher
Reviewer Anmerkungen am PR, die wieder einfließen sollen. Das ist ein „Mini-Build": kleiner
Zyklus aus Kontext-Einlesen, Umsetzung, Validierung und Rücklieferung als neue Commits auf
demselben PR-Branch.

## Ziel

`iterate` deckt zwei Ziel-Modi ab:

1. **PR-Modus** (primär): ein bestehender PR, aufgelöst aus einer PR-Referenz (`#42`, Nummer,
   PR-URL) oder aus dem aktuell ausgecheckten Branch. Quelle der umzusetzenden Punkte sind die
   **PR-Review-Kommentare aller Reviewer** (Bots und Menschen) sowie optionale
   **Freitext-Instruktionen**. Ergebnis: neue Commits auf dem PR-Head-Branch, Antworten auf die
   adressierten Threads und ein Summary-Kommentar.
2. **Local-Modus**: kein PR vorhanden oder gemeint. `iterate` iteriert auf der letzten
   Änderung des aktuellen Branch (Diff gegenüber dem Basis-Branch) ausschließlich anhand der
   Freitext-Instruktionen und committet neue Commits, ohne zu pushen oder Kommentare zu posten.

`iterate` implementiert nicht selbst, sondern klassifiziert jeden Punkt und delegiert an
/effective-flow fix, /effective-flow refactor, /effective-flow build bzw. /effective-flow docs. Es schreibt niemals
bestehende PR-History um.

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

## Empfohlene Skills

- `metro-english › humanizer` (Fallback) – für die Thread-Antworten und den Summary-Kommentar

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

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie früh im Workflow und beachte ihre
Vorgaben für Implementierung, Commits, Branch-/PR-Konventionen und Qualitätskriterien.

## Laufzeitverzeichnis `.effective-flow/` und Migration von `.firmo/`/`.sf-plugin/`

Effective Flow hält projektlokale Laufzeitdaten unter `.effective-flow/` (`memory.json`, `cache.json`, `review/`, `investigation/`, `.worktrees/`, Wisdom-Dateien; eine Legacy-`config.json` kann noch als Übergangs-Fallback vorliegen, ist aber keine Primärquelle mehr — die Konfiguration lebt in der Projektsetup-ADR). Frühere Versionen nutzten `.firmo/`, noch ältere `.sf-plugin/`. Wenn dieser Skill `.effective-flow/`-Daten liest oder schreibt, gelten diese Regeln:

1. **Kein ungefragter Footprint:** Lege `.effective-flow/` nur an, wenn tatsächlich Laufzeitdaten geschrieben werden. Ein Lauf ohne zu speichernde Daten erzeugt kein `.effective-flow/`.
2. **Fallback-Lesen:** Fehlt `.effective-flow/`, existiert aber ein älteres Laufzeitverzeichnis, lies die benötigten Dateien (`config.json`, `memory.json`, Report-/Investigation-Dateien …) aus dem jeweils vorhandenen Legacy-Verzeichnis — bevorzugt `.firmo/`, sonst `.sf-plugin/` —, solange noch nicht migriert wurde.
3. **Einmalige, nicht-destruktive Migration:** Sobald nach `.effective-flow/` geschrieben würde und noch kein `.effective-flow/` existiert, ein `.firmo/` oder `.sf-plugin/` aber vorhanden ist: lege `.effective-flow/` an und übernimm den vorhandenen Inhalt aus dem Legacy-Verzeichnis (bevorzugt `.firmo/` vor `.sf-plugin/`; kopieren, nicht verschieben), dann schreibe die Änderung in `.effective-flow/`. Existiert `.effective-flow/` bereits, findet **keine** erneute Migration statt (idempotent). Parallel-sicher: eine im Ziel bereits vorhandene Datei wird nicht überschrieben.
4. **Keine stille Löschung:** `.firmo/` und `.sf-plugin/` bleiben erhalten; das Aufräumen überlässt Effective Flow dem User.

Die `.gitignore`-Umstellung auf ein einzelnes `.effective-flow/` (inklusive Migration des früheren Zwei-Zeilen-Patterns `.effective-flow/*` plus `!.effective-flow/config.json` sowie einer pauschalen `.firmo/`- oder `.sf-plugin/`-Ignore-Zeile) übernimmt `/effective-flow setup`.

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
2. **Unabhängig verifizieren.** Prüfe die Bedingung nicht per Selbsteinschätzung, sondern über die ohnehin vorgesehenen unabhängigen Instanzen: ``effective-flow-code-validator`` für technische Prüfungen und den passenden Reviewer für inhaltliche. Die Bedingung gilt erst als erfüllt, wenn diese Instanzen sie bestätigen.
3. **Beschränkt loopen.** Bestätigt die Verifikation die Bedingung nicht, behebe die Ursache und verifiziere erneut. Begrenze die internen Korrekturrunden (Richtwert: drei). Hält die Bedingung danach weiterhin nicht, brich den internen Loop ab und eskaliere an den User, statt unbegrenzt weiterzulaufen – Vorgehen wie in der Retry-Eskalation des Fertig-Protokolls.

### Explizite Goal-Abfrage für autonome Läufe

An der Freigabe-Grenze dieses Workflows – dort, wo die Abschlussbedingung bereits feststeht und der Workflow ohnehin auf Freigabe wartet – bekommt der User eine **explizite Wahl**, ob die verbleibenden Phasen gated weiterlaufen oder autonom unter dem nativen `/goal`. Das ersetzt das frühere passive Mit-Ausgeben eines `/goal`-Strings: Die Option wird aktiv abgefragt, nicht nur angeboten.

#### Wann die Abfrage entfällt

Überspringe die Goal-Abfrage vollständig (keine Zusatzoption, kein `/goal`-String), wenn der Workflow als **nicht-interaktiver Sub-Agent** eines übergeordneten Orchestrators läuft, bei dem keine direkte User-Interaktion vorgesehen ist – erkennbar am Aufruf-Kontext, zum Beispiel „[Kontext von /effective-flow apply-review: …]“. `/effective-flow apply-review` steuert seinen autonomen Lauf bereits an seinem eigenen Gate; eine zusätzliche Goal-Abfrage pro Sub-Delegation wäre dort sinnlos. Direktaufrufe und die Übergabe durch `/effective-flow apply-plan` (interaktiv, einzeln) zählen **nicht** als solche Delegation – dort bleibt die Goal-Abfrage erhalten.

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

## Delivery- und Worktree-Integration

Dieser Baustein verknüpft code-ändernde Workflows mit Liefer-Branches, Pull-Requests und
Git-Worktrees. Die allgemeinen Werte für Basis-Branch, Branch-Namensbildung und
Abschluss-Aktion liegen im Config-Block `delivery`; der Block `worktree` steuert
ausschließlich, ob und wie die Umsetzung in einem separaten Git-Worktree läuft.

**Standardmäßig läuft die Umsetzung in einem eigenen Git-Worktree mit eigenem Branch**
(`worktree.enabled` Default `true`). Sobald in einem Worktree bzw. auf einem eigenen
Liefer-Branch gearbeitet wird, **ist Delivery implizit aktiv** und schließt per `merge`
(Default) oder `pr` ab. Es gibt keinen separaten `delivery.enabled`-Schalter mehr (siehe
„Delivery ist durch Worktree/Branch impliziert“).

Nur wenn der User ausdrücklich In-Place-Arbeit ohne Worktree verlangt und keine
Branch-/PR-/Merge-Aktion wünscht, verhält sich der Workflow wie ohne diesen Baustein: keine
erzwungene Branch-Erzeugung, keine erzwungenen Commits und keine automatische
PR-Erstellung.

`<plan.dir>` ist das Plan-Verzeichnis aus der Effective Flow-Konfiguration (Projektsetup-ADR) `plan.dir` (Default
`docs/plan`).

### Rollen der Config-Blöcke

- **`delivery`** beschreibt den Liefer-Branch und dessen Abschluss: Basis-Ref,
  Branch-Präfix, Abschluss-Aktion und Rückwechsel-Ziel.
- **`worktree`** beschreibt ausschließlich den Ausführungsort: ob ein Worktree
  verwendet wird, wo er liegt und welches Setup darin läuft.

Abgrenzung: Dieser Baustein ist **nicht** der per-Finding-Worktree-Mechanismus aus
``tools/apply-review.md`` (`applyReview.worktree`). Jener isoliert parallele lokale
Review-Findings und führt Commits per Cherry-Pick auf den aktuellen Branch zurück.
Dieser Baustein erzeugt Liefer-Branches für PR, Merge oder „nur Branch“. Beide
dürfen denselben physischen `baseDir` nutzen, da Session- und Pfad-Segmente
unterscheiden.

### Konfiguration

Falls die Effective Flow-Konfiguration (Projektsetup-ADR) entsprechende Werte festschreibt, überschreiben sie diese Defaults (Schema hier zur Illustration):

```json
{
  "delivery": {
    "baseBranch": "origin/main",
    "branchPrefix": "effective-flow",
    "completion": "merge",
    "returnBranch": "auto"
  },
  "worktree": {
    "enabled": true,
    "setup": "auto",
    "baseDir": ".effective-flow/.worktrees"
  }
}
```

Fehlende Werte haben diese Defaults:

- `delivery.baseBranch`: `"origin/main"`
- `delivery.branchPrefix`: `"effective-flow"`
- `delivery.completion`: `"merge"` (Merge in den Zielbranch als Standard-Abschluss)
- `delivery.returnBranch`: `"auto"` (lokaler Branch-Anteil aus `delivery.baseBranch`)
- `worktree.enabled`: `true` (Umsetzung läuft in einem eigenen Worktree)
- `worktree.setup`: `"auto"`
- `worktree.baseDir`: `.effective-flow/.worktrees`

Gültige Werte:

- `delivery.completion`: `"pr"`, `"merge"`, `"branch"`
- `delivery.returnBranch`: `"auto"` oder ein lokaler Branchname als String
- `worktree.enabled`: `true`, `false`
- `worktree.setup`: `"auto"`, `"none"` oder ein expliziter Setup-Befehl als String

`delivery.enabled` ist **entwertet**: Delivery wird nicht mehr über einen eigenen Schalter
aktiviert, sondern ist immer dann aktiv, wenn in einem Worktree/eigenen Branch gearbeitet
wird (siehe „Delivery ist durch Worktree/Branch impliziert“). Ein in einer Altconfig noch
vorhandenes `delivery.enabled` wird beim Lesen ignoriert und von der Config-Vollmigration
entfernt (siehe „Config-Migration“).

### Config-Migration

Das Lesen der Effective Flow-Konfiguration aus der Projektsetup-ADR und die einmalige Konsolidierung
einer Alt-Config auf das aktuelle Schema – insbesondere das Verschieben alter Lieferwerte aus
`worktree.baseBranch`/`worktree.branchPrefix`/`worktree.completion` nach `delivery.*` und das
Entfernen des entwerteten `delivery.enabled` – übernimmt der geteilte Baustein
„Config-Migration“ (`config-migration.md`) einmalig und zentral. Dieser Baustein führt **keine** eigene
per-Block-Migration mehr aus. Bis eine Config migriert ist, gilt beim Lesen: neuer Wert aus
`delivery.*` vor Legacy-Wert aus `worktree.*` vor Default; ein vorhandenes
`delivery.enabled` wird ignoriert.

### Modus bestimmen (Setup-Phase): Delivery ist durch Worktree/Branch impliziert

Bestimme zu Beginn der eigentlichen Umsetzungsarbeit den effektiven Modus:

- **Worktree-Ausführung ist standardmäßig aktiv** (`worktree.enabled` Default `true`). Sie
  bleibt nur aus, wenn `worktree.enabled: false` gesetzt ist oder der User ausdrücklich
  In-Place-Arbeit verlangt („ohne Worktree“, „direkt auf dem aktuellen Branch“).
- **Delivery ist aktiv, sobald in einem Worktree oder auf einem eigenen Liefer-Branch
  gearbeitet wird** – also im Default-Fall immer. Zusätzlich ist Delivery aktiv, wenn der
  User ausdrücklich PR-, Branch- oder Merge-Arbeit verlangt (auch bei In-Place-Arbeit; dann
  wird der Liefer-Branch im Haupt-Repo erzeugt).
- Ist der Worktree per Config deaktiviert (`worktree.enabled: false`), gib einen kurzen
  Hinweis aus, dass der (Default-)Worktree-Modus per Config aus ist. Verlangt der User dann
  auch keine Delivery-Aktion, führe keine weiteren Schritte aus diesem Baustein aus
  (In-Place ohne Delivery).

### Gemeinsame Vorbedingungen

Wenn Delivery oder Worktree aktiv ist:

1. `git` und bei Worktree-Ausführung `git worktree` müssen verfügbar sein.
2. `delivery.baseBranch` muss auflösbar sein. Ist es ein Remote-Ref (z. B.
   `origin/main`), zuerst `git fetch REMOTE BRANCH` ausführen, damit der Liefer-Branch
   auf dem aktuellen Remote-Stand startet.
3. Hat der aktuelle HEAD relevante uncommittete Änderungen oder lokale Commits, die
   nicht in `delivery.baseBranch` enthalten sind, weise darauf hin. Ein frisch aus dem
   Basis-Branch erzeugter Liefer-Branch enthält diese Arbeit nicht. Fahre nur fort,
   wenn der User den gewählten Modus bestätigt oder der Workflow einen sicheren
   Teil-Diff-PR nach unten beschriebenem Verfahren erzeugt.
4. Liefer-Branch-Namen bilden: `<delivery.branchPrefix>/<skill>/<slug>`, z. B.
   `firmo/build/user-login`. Den Slug aus dem Plan-Titel, der Aufgabenbeschreibung,
   dem Issue oder Finding ableiten. Existiert der Branch-Name bereits, ein
   numerisches Suffix anhängen und den gewählten Namen melden.

### Worktree-Ausführung

Wenn Worktree-Ausführung aktiv ist:

1. Repo-Namen bestimmen aus `basename "$(git rev-parse --show-toplevel)"` und als
   BaseDir `worktree.baseDir` (Default `.effective-flow/.worktrees`) verwenden. Worktree-Pfad:
   `BASE_DIR/REPO_NAME/SESSION_ID`.
2. Worktree und Liefer-Branch erzeugen:
   `git worktree add <WORKTREE_PATH> -b <BRANCH_NAME> <BASE_REF>`.
3. Setup gemäß `worktree.setup` im Worktree ausführen und den Modus vorher kurz
   anzeigen:
   - `auto` oder fehlend: nach Lockfile entscheiden – `pnpm-lock.yaml` →
     `pnpm install --frozen-lockfile --prefer-offline`, `package-lock.json` →
     `npm ci`, `yarn.lock` → `yarn install --frozen-lockfile`, `Cargo.toml` →
     `cargo fetch --locked`, `go.mod` → `go mod download`, `uv.lock` →
     `uv sync --frozen`, `poetry.lock` → `poetry install --sync`, keine bekannte
     Datei → kein Setup.
   - `none`: kein Setup ausführen.
   - String-Wert: dieses explizite Kommando im Worktree ausführen.
4. Alle nachfolgenden Phasen, die Code-, Test- oder Doku-Dateien erzeugen oder
   ändern, mit Arbeitsverzeichnis im Worktree ausführen. Das gilt auch für die
   Abschlussphase bis einschließlich finalem Validator/Formatter.

### In-Place-Delivery ohne Worktree

Wenn Delivery aktiv ist und Worktree-Ausführung aus bleibt:

1. Den ursprünglich ausgecheckten Branch merken.
2. Sicherstellen, dass der Arbeitsbaum keine uncommitteten Änderungen enthält, die
   nicht Teil des Liefer-Branches werden sollen. Wenn solche Änderungen existieren,
   nicht still stagen, stashen oder überschreiben; entweder User-Entscheidung einholen
   oder den Teil-Diff-PR über Worktree verwenden.
3. Liefer-Branch aus `delivery.baseBranch` erzeugen und auschecken.
4. Umsetzung, Tests, Validierung und finale Formatierung auf diesem Liefer-Branch
   ausführen.
5. Nach Abschluss gemäß „Handback und Abschluss-Aktion“ fortfahren.

### Teil-Diff-PR über Worktree

Wenn im Haupt-Checkout bereits Änderungen liegen, die nicht vollständig in den PR
gehören, ist ein separater Worktree der bevorzugte sichere Weg, sofern diese
Vorbedingungen erfüllt sind:

1. `git worktree` ist verfügbar.
2. `delivery.baseBranch` ist auflösbar und bei Remote-Refs aktualisierbar.
3. Der Workflow kennt eine explizite Liste der Dateien, die in den PR sollen.

Der Ablauf:

1. Frischen Worktree-Branch aus `delivery.baseBranch` erzeugen.
2. Nur die ausgewählten Lieferdateien aus dem Haupt-Checkout in den Worktree
   übernehmen. Zulässige Quellen für diese Auswahl sind Plan-Betroffene-Dateien,
   Review-Finding-Scope, Issue-Scope, vom Workflow erzeugte bekannte Dateien oder
   eine explizite User-Auswahl.
3. Im Worktree prüfen, ob die übernommenen Dateien gegenüber dem Basis-Ref einen
   sinnvollen Diff ergeben. Wenn nicht, abbrechen und keinen leeren PR erzeugen.
4. Im Worktree committen und `/effective-flow pr` gegen `delivery.baseBranch` ausführen.
5. Worktree entfernen, Liefer-Branch lokal belassen und Haupt-Checkout unverändert
   lassen. Nicht ausgewählte Änderungen im Haupt-Checkout bleiben unberührt.

Nicht erlaubt ist eine heuristische Teil-Diff-Auswahl nach „alle geänderten Dateien
außer <plan.dir>“. Der Workflow muss die einzuschließenden Dateien kennen oder
nachfragen. Dadurch bleiben parallel neu angelegte Pläne, `.effective-flow/`-State und andere
lokale Arbeitsdateien zuverlässig außerhalb des PRs.

### Was im Liefer-Branch liegt und was im Haupt-Repo bleibt

Datenhaltungs-Invariante: **Von den Effective Flow-Artefakten werden ausschließlich Pläne
committet.** Reviews (lokale Reports) und Investigationen bleiben immer lokal und
ungetrackt; im Remote-Modus werden Reviews stattdessen als Issues geführt (nie im Repo),
Investigationen bleiben in jedem Fall rein lokal (siehe „Issue-Tracker-Anbindung“ und
`/effective-flow investigate`).

- **Im Liefer-Branch:** die eigentlichen Code-, Test- und Doku-Deliverables des
  Workflows sowie – sofern der Workflow eine Plan-Datei geführt hat – deren finaler
  Zustand (im umgesetzten Fall die archivierte, umgesetzt-markierte Plan-Datei).
- **Nur im Haupt-Repo, nie committet:** reine Effective Flow-Buchhaltung und Laufzeitstatus, also
  alle übrigen `.effective-flow/`-Artefakte – `memory.json`, `cache.json`, lokale Review-Reports
  unter `.effective-flow/review/`, Investigations-Reports unter `.effective-flow/investigation/`,
  Config-Migrationsstatus und Wisdom-Dateien.

### Handback und Abschluss-Aktion (Abschlussphase)

Im Anschluss an die reguläre Abschlusslogik des Workflows (inklusive Goal-Verifikation).
Den finalen Statuswechsel der Plan-Datei auf `Umgesetzt`/`Implemented` und ihre
Archivierung übernimmt Schritt 1 unten am Delivery-Punkt – der umsetzende Workflow setzt
den Status also **nicht** vorab, sondern überlässt ihn dieser Phase (Ausnahme: In-Place ohne
Delivery, siehe Schritt 1):

**Bestehende PRs aktualisieren:** Wenn der Liefer-Branch bereits einen Pull-Request
hat und nachträglich Änderungen nötig sind, werden diese Änderungen immer als neue
Commits auf demselben PR-Branch erstellt und gepusht. Bestehende PR-Commits dürfen
nicht per `commit --amend`, interaktivem Rebase, Squash oder Force-Push
umgeschrieben werden. Scheitert ein normaler Push wegen divergierter Remote-History,
stoppe und melde den Konflikt, statt History zu überschreiben.

1. **Plan als umgesetzt markieren, archivieren und in den Liefer-Branch übernehmen:**
   Sofern der Workflow eine Plan-Datei geführt hat, ist dies der **Delivery-Punkt**, an dem
   der Plan als umgesetzt gilt (unmittelbar bevor der PR geöffnet bzw. der Liefer-Branch
   gemergt wird):
   - Setze den kanonischen Statusmarker auf `Umgesetzt`/`Implemented` (Markersprache
     erhalten: deutscher Marker → `**Planungsstatus:** Umgesetzt`, englischer →
     `**Plan status:** Implemented`).
   - Verschiebe die Plan-Datei per `git mv` nach `<plan.dir>/archive/` (Verzeichnis bei
     Bedarf anlegen), gemäß „Archiv umgesetzter Pläne“ der Plan-Datei-Konvention.
   - Lief die Umsetzung in einem Worktree oder Teil-Diff-Worktree, stelle diesen finalen,
     archivierten und umgesetzt-markierten Zustand im Worktree bereit (unter
     `<plan.dir>/archive/<datei>`). Markierung und Verschiebung werden **mitcommittet** und
     sind damit Teil des PRs/Merges (Umsetzungs-Doku). Die `.effective-flow/`-Artefakte bleiben im
     Haupt-Repo.
   - Führte der Workflow keine Plan-Datei, entfällt dieser Schritt.
   - Läuft der Workflow ausnahmsweise In-Place ohne Delivery (kein Worktree, keine
     Branch-/PR-/Merge-Aktion), führt der Workflow denselben Statuswechsel und
     Archiv-Move direkt im Arbeitsbaum aus; der abschließende Commit/Merge in den
     Zielbranch ist dann das Delivery-Event.
2. **Commit sicherstellen:** Alle beabsichtigten Änderungen im Liefer-Branch committen
   – Code-, Test- und Doku-Deliverables sowie die übernommene Plan-Datei – über die
   Commit-Logik aus `/effective-flow commit` (ausschließlich bekannte geänderte Dateien
   explizit stagen, konkrete Conventional-Commit-Message ableiten, niemals
   `Co-Authored-By`-Trailer setzen). Workflows, die ihre Arbeit bereits committet
   haben (z. B. `/effective-flow maintain` mit einem Commit pro Gruppe), committen hier nur
   noch die Plan-Datei nach, falls nötig. Gibt es nichts zu committen: den User
   informieren, einen automatisch erzeugten leeren Liefer-Branch entfernen und ohne
   PR/Merge enden.
3. **Abschluss-Aktion bestimmen:** Wenn `delivery.completion` einen gültigen Wert hat,
   diesen verwenden und kurz melden, dass die Aktion aus der Effective Flow-Konfiguration
   (Projektsetup-ADR) übernommen wurde. Sonst fragen:

Wenn Delivery aktiv war und kein gültiger Wert für `delivery.completion` gesetzt ist:

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Abschluss"
- question: "Wie soll der Liefer-Branch abgeschlossen werden?"
- multiSelect: false
- options:
  - label: "Pull-Request", description: "Branch pushen und über pr einen PR gegen den Basis-Branch erstellen"
  - label: "Merge", description: "Branch lokal in den Basis-Branch mergen, ohne PR"
  - label: "Nur Branch", description: "Branch im lokalen Repo belassen, keine weitere Aktion"

4. **Worktree zurückziehen:** Wenn ein Worktree beteiligt war, `git worktree remove
<WORKTREE_PATH>` ausführen; der Liefer-Branch bleibt im lokalen Repo erhalten.
   Schlägt das Entfernen wegen uncommitteter Reste fehl: zuerst sicherstellen, dass
   alles beabsichtigte committet ist; bleibt etwas übrig, den Worktree behalten und
   den Pfad melden.
5. **Aktion ausführen:**
   - `branch` / Nur Branch: Branch belassen, Namen und Hinweis zur späteren
     PR-Erstellung melden.
   - `merge`: Ziel ist der lokale Branch-Anteil von `delivery.baseBranch` oder der
     explizite `delivery.returnBranch`. Sicherstellen, dass der Ziel-Working-Tree
     sauber ist; sonst informieren statt zu mergen. Liegt der lokale Ziel-Branch
     hinter seinem Remote-Tracking-Ref, darauf hinweisen. Den Liefer-Branch mergen –
     Fast-Forward bevorzugen, sonst Merge-Commit; bei Konflikt stoppen, Branch
     belassen und User informieren, keine automatische Konfliktauflösung.
   - `pr`: an `/effective-flow pr` delegieren und Liefer-Branch, Basis-Branch sowie den
     Workflow-/Änderungstyp (`feat`/`fix`/`refactor`/`docs`/`chore` je nach umsetzendem
     Workflow und Wirkung) als Titel-Typ-Hinweis übergeben, damit der PR-Titel einen
     gültigen Conventional-Commit-Typ trägt — bei Squash-Merge ist er das Release-Signal.
6. **Checkout zurückstellen:** Nach erfolgreicher PR-Erstellung oder bei `branch` auf
   `delivery.returnBranch` bzw. bei `auto` auf den lokalen Branch-Anteil von
   `delivery.baseBranch` zurückwechseln, sofern der Arbeitsbaum sauber ist. Wenn der
   Rückwechsel scheitert, den tatsächlichen Branch als Seiteneffekt ausdrücklich
   melden.

## PR-Review-Kommentar-Anbindung

Dieser geteilte Baustein verbindet `/effective-flow iterate` mit den Review-Kommentaren eines
bestehenden Pull-Requests (GitHub über `gh`, Forgejo über `tea`). Er kapselt das
**PR-spezifische Plumbing**, das `issue-tracker.md` bewusst nicht enthält: die PR-Auflösung,
das Lesen von Review-Threads, das Antworten auf einen Thread, das Auflösen eines Threads und
das Posten eines PR-Summary-Kommentars.

Abgrenzung zu `issue-tracker.md`: Jener Baustein ist auf **Issues** und den
`tracker.mode`-Umschalter zugeschnitten. PR-Review-Threads sind ein anderes API-Objekt.
`/effective-flow iterate` ist – wie ``tools/apply-issues.md``/`/effective-flow plan-issue` – **inhärent
remote** im PR-Modus und wertet `tracker.mode` nicht aus; es braucht lediglich ein
Git-Repository, eine `origin`-Remote und ein authentifiziertes CLI. Die **Host- und
CLI-Erkennung** wird aus `issue-tracker.md` übernommen (nicht neu erfunden); dieser Baustein
ergänzt nur die PR-Operationen.

### Keine KI-Attribution

Füge Thread-Antworten und dem Summary-Kommentar keine KI-Attribution hinzu: keine „Generated
with Claude Code/Codex"-Footer, keine Agent-Session-Links (z. B. `https://claude.ai/code/…`)
und keine `Co-Authored-By`-Trailer – auch dann nicht, wenn der Harness sie als Default
anhängt. Antworttexte in natürlicher Sprache gemäß Sprachregeln.

### Host- und CLI-Erkennung

Bestimme das Werkzeug analog zu `/effective-flow pr` und zur „Host- und CLI-Erkennung" in
`issue-tracker.md`:

1. **Vorbedingung:** Es ist ein Git-Repository mit einer `origin`-Remote vorhanden. Fehlt
   `origin` oder ist es kein Git-Repository, ist der PR-Modus nicht möglich: klar melden.
2. **Werkzeug wählen:** Lies die `origin`-URL (`git remote get-url origin`) und extrahiere den
   Host robust für HTTPS- und SSH-Formen. Ist der Host exakt `github.com`, ist das Werkzeug
   `gh`; für jeden anderen Host wird Forgejo/Gitea angenommen und `tea` verwendet. Ein
   ausdrücklicher Per-Run-Hinweis des Users hat bei mehrdeutigem Host (z. B. GitHub
   Enterprise) Vorrang; ist der Host mehrdeutig und weder Hinweis noch Override vorhanden,
   frage den User.
3. **Verfügbarkeit prüfen:** Stelle sicher, dass das gewählte CLI installiert und
   authentifiziert ist (`gh auth status` bzw. `tea` mit konfiguriertem Login). Fehlt das CLI
   oder die Authentifizierung: gib eine klare Fehlermeldung mit Behebungshinweis aus und brich
   ohne Seiteneffekt ab. Falle **nicht** still auf lokale Arbeit zurück; einen lokalen
   Fallback nur nach ausdrücklicher User-Zustimmung.

### PR-Auflösung

Löse den Ziel-PR aus dem Argument oder dem aktuellen Branch auf und bestimme PR-Nummer,
Head-Branch, Basis-Branch, URL und Status:

- **Aus Argument:** eine PR-Referenz ist eine bare Nummer (`42`), `#42` oder eine PR-URL. Eine
  PR-URL trägt das Segment `/pull/` (GitHub) bzw. `/pulls/` (Forgejo) – das unterscheidet sie
  von einer Issue-URL (`/issues/`).
- **Aus aktuellem Branch:** wenn keine PR-Referenz übergeben wurde, versuche den offenen PR des
  aktuell ausgecheckten Branch zu ermitteln.

| Operation               | GitHub (`gh`)                                                                       | Forgejo (`tea`)                                                       |
| ----------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| PR aus Nummer lesen     | `gh pr view <nr> --json number,headRefName,baseRefName,url,state,isCrossRepository` | `tea pr <nr>` bzw. Forgejo-API `GET /repos/<owner>/<repo>/pulls/<nr>` |
| PR aus aktuellem Branch | `gh pr view --json number,headRefName,baseRefName,url,state`                        | `tea pr list --state open` und über den Head-Branch filtern           |

Ist der PR bereits `merged`/`closed`: melden und keine Commits pushen (siehe Fehlerfälle in
`/effective-flow iterate`).

### Review-Threads lesen (immer frisch)

Lies die Review-Kommentare **direkt vor** der Klassifikation frisch vom Host – Kommentare
können sich zwischen Läufen ändern. Erfasse pro Thread: Thread-ID, Autor (und ob Bot oder
Mensch), Datei + Zeile, Kommentartext und den `resolved`-Status.

| Operation                      | GitHub (`gh`)                                                               | Forgejo (`tea`)                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Inline-Review-Kommentare lesen | `gh api repos/<owner>/<repo>/pulls/<nr>/comments`                           | Forgejo-API `GET /repos/<owner>/<repo>/pulls/<nr>/reviews` bzw. `.../comments`                           |
| Thread-/Resolved-Status lesen  | GraphQL `pullRequest.reviewThreads` (Felder `id`, `isResolved`, `comments`) | best-effort über die Forgejo-API; ist der Resolved-Status nicht verfügbar, alle als unresolved behandeln |
| PR-Ebene-Kommentare lesen      | `gh pr view <nr> --json comments`                                           | `tea pr <nr> --comments`, sonst Forgejo-API                                                              |

Ermittle für die GraphQL-Abfrage `owner`/`repo` aus der `origin`-URL. Prüfe bei Forgejo die
genauen Flag-/Endpunktnamen gegen die installierte `tea`-Version, falls ein Aufruf
fehlschlägt (wie in `/effective-flow pr` vermerkt).

### Auf einen Thread antworten

| Operation                      | GitHub (`gh`)                                                                    | Forgejo (`tea`)                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Auf Review-Kommentar antworten | `gh api repos/<owner>/<repo>/pulls/<nr>/comments/<comment-id>/replies -f body=…` | Forgejo-API `POST /repos/<owner>/<repo>/pulls/<nr>/reviews` mit Bezug auf den Kommentar |

Jede Antwort trägt den Marker `<!-- effective-flow-iterate -->` (siehe Idempotenz).

### Einen Thread auflösen

| Operation              | GitHub (`gh`)                                               | Forgejo (`tea`)                                                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review-Thread auflösen | GraphQL-Mutation `resolveReviewThread(input: { threadId })` | best-effort; unterstützt die installierte API/`tea`-Version das Auflösen nicht, **nur antworten** und im Summary vermerken, dass manuelles Auflösen nötig ist – **kein Abbruch** |

### Summary-Kommentar posten

| Operation           | GitHub (`gh`)                 | Forgejo (`tea`)                         |
| ------------------- | ----------------------------- | --------------------------------------- |
| PR-Kommentar posten | `gh pr comment <nr> --body …` | `tea comment <nr> …`, sonst Forgejo-API |

Es wird pro Lauf **genau ein** Summary-Kommentar mit Marker `<!-- effective-flow-iterate -->`
gepostet: welche Punkte umgesetzt, welche übersprungen und welche reinen Fragen als
offen/zurückgestellt gelistet sind.

### Idempotenz über den Effective Flow-Marker

Antworten und der Summary-Kommentar tragen den HTML-Marker `<!-- effective-flow-iterate -->`. Lies
die vorhandenen PR- und Review-Kommentare **vor jedem Schreiben** frisch: ein Thread, der
bereits `resolved` ist oder eine `<!-- effective-flow-iterate -->`-Antwort trägt, gilt als erledigt und
wird nicht erneut bearbeitet. **Backcompat (eine Generation):** ein noch vorhandener Alt-Marker
`<!-- firmo-iterate -->` aus einem früheren Lauf wird beim Lesen gleichwertig erkannt (kein
Doppel-Bearbeiten in-flight befindlicher Threads); neu geschrieben wird ausschließlich
`<!-- effective-flow-iterate -->`. So bleibt ein zweiter `/effective-flow iterate`-Lauf auf demselben PR
sauber.

### Keine History-Umschreibung

Neue Arbeit geht ausschließlich als **neue Commits** auf den PR-Head-Branch und wird normal
gepusht – konsistent mit `/effective-flow pr` und „Bestehende PRs aktualisieren" in der Delivery-
und Worktree-Integration. Kein `commit --amend`, kein Rebase, kein Squash, kein Force-Push.
Wird der Push wegen divergierter Remote-History abgelehnt, stoppe und melde den Konflikt,
statt History zu überschreiben.

## Wisdom Accumulation

Erzeuge zu Beginn eine Session-ID (z. B. via Timestamp) und verwende
`.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md` für:

- aufgelösten PR (Nummer, Head-/Basis-Branch, URL) bzw. den Local-Ziel-Diff
- gelesene Review-Threads mit Autor, Datei/Zeile und Resolved-Status
- Klassifikation pro Punkt (umsetzbar/nicht umsetzbar, Aktionstyp, bereits adressiert)
- umgesetzte Punkte, erzeugte Commits, beantwortete/aufgelöste Threads
- zurückgestellte reine Fragen und fehlgeschlagene Punkte

Schreibe nach jeder Phase ein Summary und gib es an spätere Phasen weiter. Lösche die Datei am
Ende.

## Workflow

### Phase 0: Ziel-Erkennung und Eingabe-Parsing

1. Trenne das Argument in eine optionale führende **PR-Referenz** und den restlichen
   **Freitext**. Eine PR-Referenz ist eine bare Nummer, `#42` oder eine PR-URL (Segment
   `/pull/` bzw. `/pulls/`, nicht `/issues/`).
2. Bestimme den Ziel-Modus:
   - PR-Referenz vorhanden **oder** der aktuelle Branch hat einen offenen PR → **PR-Modus**.
   - sonst → **Local-Modus**.
3. Bei Mehrdeutigkeit (z. B. eine bare Nummer, die auch ein Issue sein könnte) frage nach,
   statt zu raten.
4. `iterate` setzt immer eine **bestehende** Änderung fort; es gibt kein volles Intent-Gate wie
   in /effective-flow build.

### Phase 1: Kontext sammeln

- **PR-Modus:** Erkenne Host und CLI und prüfe die Verfügbarkeit (siehe
  „PR-Review-Kommentar-Anbindung"). Löse den PR auf und lies die Review-Threads **frisch**.
  Nimm die Freitext-Instruktionen als zusätzliche Punkte auf. Beziehe den PR-Head-Branch und
  stelle ihn in einem sauberen Checkout bzw. isolierten Worktree bereit (per Fetch/Pull ohne
  Rebase oder Force aktualisieren). Ist der PR bereits gemergt/geschlossen, melde das und biete
  optional den Local-Modus an.
- **Local-Modus:** Nimm den kompletten offenen Diff des aktuellen Branch gegenüber
  `delivery.baseBranch` (`git diff <base>...HEAD`) als Kontext. Quelle der umzusetzenden Punkte
  ist nur der Freitext.

### Phase 2: Klassifikation

Bestimme pro Punkt (Review-Thread bzw. Freitext-Instruktion):

1. **umsetzbar vs. nicht umsetzbar:**
   - reine Lob-/Info-Kommentare zählen nicht als umsetzbar.
   - **Nitpick- und niedrig-priorisierte Bot-Kommentare werden standardmäßig als umsetzbar
     mitgenommen** – das Freigabe-Gate in Phase 2.5 erlaubt dem User, einzelne abzuwählen.
   - **reine Fragen** ohne Codeänderungsbedarf werden nicht umgesetzt und **nicht automatisch
     inhaltlich beantwortet**; sie werden in der Zusammenfassung als offen/zurückgestellt
     gelistet, damit der User sie selbst beantwortet.
2. **bereits adressiert:** Thread ist `resolved` oder trägt eine `<!-- effective-flow-iterate -->`-
   Antwort → überspringen.
3. **Aktionstyp** ableiten:
   - /effective-flow fix für Bug/Korrektur,
   - /effective-flow refactor für Struktur ohne Verhaltensänderung,
   - /effective-flow build für neue kleine Funktionalität,
   - /effective-flow docs für reine Doku.
     Menschliche und Bot-Kommentare gleichwertig behandeln.
4. Lege pro umsetzbarem Punkt eine Task an (per-Punkt-Granularität).

### Phase 2.5: Freigabe

Zeige die klassifizierten Punkte (umsetzbar, übersprungen, zurückgestellte Fragen) und hole
eine Freigabe ein. Ohne Freigabe erfolgt **keine** außenwirksame Aktion (kein Push, kein
Kommentar). Behandle die Antwort gemäß „Explizite Goal-Abfrage für autonome Läufe": bei „Autonom
via /goal" gib den `/goal`-String für die Phasen 3–6 aus. Die Abfrage entfällt, wenn `iterate`
nicht-interaktiv delegiert wurde (z. B. durch /effective-flow apply-review).

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Freigabe"
- question: "Klassifizierte Punkte freigeben und umsetzen?"
- multiSelect: false
- options:
  - label: "Ja", description: "Freigabe erteilt, Umsetzung und Rücklieferung laufen gated weiter"
  - label: "Autonom via /goal", description: "Verbleibende Phasen autonom unter nativem /goal — der Skill gibt den einzufügenden /goal-String aus (entfällt bei nicht-interaktiver Delegation)"
  - label: "Anpassen", description: "Feedback als Freitext eingeben, z. B. einzelne Punkte abwählen"

### Phase 3: Umsetzung

1. Delegiere jeden umsetzbaren Punkt an den passenden Skill (/effective-flow fix, /effective-flow refactor,
   /effective-flow build oder /effective-flow docs), auf dem PR-Head-Branch (PR-Modus) bzw. dem aktuellen
   Branch (Local-Modus).
2. **Ein Commit pro Thread/Punkt** mit einer sauberen Conventional-Commit-Message ohne interne
   IDs oder Thread-Referenz und ohne `Co-Authored-By`. Dateiüberlappende Punkte laufen
   sequenziell, damit die Commits geordnet bleiben; unabhängige Punkte dürfen parallel umgesetzt
   werden.
3. Gib internen Delegations-Sub-Agenten das Fertig-Protokoll vor und prüfe auf `ERLEDIGT` oder
   `ABBRUCH`. Bei `ABBRUCH`: Punkt als fehlgeschlagen markieren und mit dem nächsten fortfahren.

### Phase 4: Validierung

1. Starte `effective-flow-code-validator` bzw. das projektweite Qualitäts-Gate.
2. Behebe gefundene Fehler und verifiziere erneut gemäß „Goal-getriebene Abschlusssteuerung":
   begrenze die internen Korrekturrunden und eskaliere an den User, falls die Prüfungen danach
   weiterhin fehlschlagen.

### Phase 5: Rücklieferung (nur PR-Modus)

1. Pushe den Head-Branch normal (kein Force). Schlägt der Push wegen divergierter Remote-History
   fehl: stoppe, melde den Konflikt, überschreibe keine History und löse keine Threads auf.
2. Antworte pro adressiertem Thread kurz und löse ihn auf (GitHub via GraphQL; Forgejo
   best-effort). Verwende den Marker `<!-- effective-flow-iterate -->`.
3. Poste **einen** Summary-Kommentar am PR (Marker `<!-- effective-flow-iterate -->`): welche Punkte
   umgesetzt bzw. übersprungen wurden und welche reinen Fragen offen/zurückgestellt sind (ohne
   inhaltliche Auto-Antwort).

### Phase 6: Zusammenfassung

1. Lösche die Wisdom-Datei.
2. Gib dem User eine Zusammenfassung:
   - Tabelle: umgesetzt / übersprungen / zurückgestellte Fragen / fehlgeschlagen
   - PR-URL, gepushte Commits, aufgelöste Threads, finaler Checkout-Zustand
   - im Local-Modus: welche Commits auf welchem Branch entstanden sind

## Regeln

## Pre-Commit-Gate

Vor jedem Commit müssen die im Projekt konfigurierten Prüfungen fehlerfrei durchlaufen. Typische Prüfungen sind Type-Checking, Linting und Tests — verwende die im Projekt definierten Scripts (z. B. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm agent:check`).

- Wenn eine Prüfung Fehler meldet: behebe die Fehler zuerst, dann prüfe erneut.
- Committe niemals Code, der diese Prüfungen nicht besteht.
- Diese Regel gilt auch dann, wenn eine separate Verifikationsphase existiert — sie ist eine zusätzliche Absicherung, kein Ersatz.

## Commit-Message-Regeln

- **Setze niemals `Co-Authored-By`-Trailer in Commit-Messages**, unabhängig davon, ob ein LLM (Claude, Codex, GPT, …) oder ein anderes Tool die Zeile vorschlägt oder als Default einfügt.
- Falls eine `Co-Authored-By`-Zeile in einem Commit-Template, `commit.template`, `--trailer`-Aufruf oder einer Draft-Message bereits vorhanden ist: entferne sie vor dem Commit.
- **Füge keine KI-Attribution an:** keine „Generated with Claude Code/Codex"-Footer und keine Agent-Session-Links (z. B. `https://claude.ai/code/…`) in Commit-Messages – auch dann nicht, wenn der Harness sie als Default anhängt. Sachliche Erwähnungen von Claude Code oder Codex bleiben erlaubt, Generierungs-Attribution nicht.
- Vermeide generische Messages wie `update files` oder `misc changes`.
- Beschreibe konkret, was geändert wurde und warum.
- Nutze Conventional-Commit-Präfixe: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Wähle den Commit-Typ nach der **Wirkung**, nicht nach der Dateiart: verhaltensändernde Änderungen – auch reine **Config/Env/Secrets/CI** mit Deployment- oder Laufzeitwirkung (z. B. korrigierte Werte in Env-/Secret-Artefakten, die per Sync remote wirken) – sind `fix:` (bzw. `feat:` bei neuer Funktionalität). `chore:` nur für **deploy-neutrale** Änderungen ohne Verhaltenswirkung (reine Wartung, Formatting, Tooling ohne Laufzeitwirkung). Das gilt auch für den **Squash-PR-Titel**, der bei Squash-Merge den release-please-Bump bestimmt.
- Exponiere keine internen Tracking-IDs in Commit-Messages, z. B. Review-Finding-IDs wie `R-0000001`, lokale Plan-/Review-IDs wie `F1` oder Platzhalter wie `[Finding-ID]`. Solche IDs gehören in Wisdom-/Report-Kontext, nicht in die Git-Historie.

- Lies die PR-Review-Kommentare beim Start und vor jedem Schreiben frisch vom Host.
- Schreibe niemals bestehende PR-History um (kein `commit --amend`, Rebase, Squash oder
  Force-Push); Änderungen gehen ausschließlich als neue Commits auf den PR-Head-Branch.
- Erstelle im PR-Modus keinen neuen Liefer-Branch und keinen neuen PR.
- Poste keine automatische inhaltliche Antwort auf reine Reviewer-Fragen; stelle sie zurück und
  liste sie im Summary.
- Setze niemals `Co-Authored-By`-Trailer und füge keine KI-Attribution in Commits,
  Thread-Antworten, Summary-Kommentar oder PR-Body ein.
- Gib dem User nach jeder Phase eine kurze Statusmeldung.
- Bei fehlendem oder nicht authentifiziertem CLI: sauber abbrechen, keine lokale Umsetzung
  heimlich pushen.
