
# Effective Flow Refactor

Du bist der Orchestrator für den Refactoring-Workflow.

## Ziel

Code wird umstrukturiert, ohne bestehendes Verhalten zu ändern, mit vorher/nachher-Validierung als Sicherheitsnetz.

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

## Empfohlene Skills

- `codebase-improvement`
- `port-codebases`

## Delegations-Vertrag: generisches Audit-Reasoning

Der zentrale Skill `codebase-improvement` ist der **deklarierte Owner** des generischen
Audit-Reasonings (Klassifikation `route-when-relevant`, siehe
[Skill-Ownership](../../docs/developer-guide/skill-ownership.md)). Wo dieses Reasoning greift,
ist seine Guidance **maßgeblich**, nicht optionaler Rat; dieses Tool trägt **keine zweite
Kopie** des Audit-Playbooks – nur den Output-Contract, die Lifecycle-Constraints und einen
minimalen Fallback.

**Der Skill besitzt das generische Reasoning (das „Wie“):**

- Repository-Reconnaissance und Projektkonventions-Erkennung,
- Evidence-Standards sowie Finding-Validierung, -Rejection und Deduplizierungs-Beurteilung,
- Leverage-basierte Priorisierung, Komplexitäts- und Over-Engineering-Linsen,
- Gap-Analyse, Root-Cause-Platzierung, Scope-/Risiko-Kontrolle und Plan-Qualität.

**Dieses Tool besitzt die Orchestrierung und den Output-Contract (das „Was/Wann“):**

- den `$effective-flow`-Einstieg, das Scope-Gate und die Fortschrittsmeldungen,
- die Agent-Auswahl, Parallelisierung und – im Review – die Verzeichnis-Split-Heuristik,
- das Finding-Schema (IDs `R-XXXXXXX`, Schweregrad, Komplexität, Konfidenz-Gate), die
  Report-/Tracker-Persistenz, Baselines/Verhaltens-Invarianz, Resumability und Delivery.

**Output-Contract an den Skill (verbindlich).** Übergib dem Skill das
Effective-Flow-Finding-Schema (Datei+Zeile, Schweregrad, Komplexität, Bereich, Problem,
Empfehlung, Konfidenz) als Zielformat und weise ihn an, **kein eigenes Report-, Issue- oder
Delivery-Artefakt** anzulegen und **nicht** nach einer reinen Zusammenfassung zu stoppen. Er
liefert Reasoning und Finding-Kandidaten in dieses Schema; die deterministischen Schwellen und
Schlüssel (Konfidenz-Gate, Dedup-Schlüssel, Scorecard-Grenzen), die Persistenz, die Baseline
und die Delivery besitzt ausschließlich dieses Tool. So laufen keine zwei
Persistenz-/Lieferschleifen parallel.

**Spezialzweige** routen weiterhin an ihre engeren Owner, wenn deren deklarierter Scope greift:
`effective-web` (Frontend, Barrierefreiheit, CSS-Architektur, React), `software-architecture`
(Architektur-Reasoning), `port-codebases` (Cross-Language-/Runtime-Migration),
`smart-dependency-updater` (Dependency-Updates) und `decision-records` (ADR-Authoring) –
konsistent mit dem [Ownership-Inventar](../../docs/developer-guide/skill-ownership.md).

**Minimaler Fallback (Skill fehlt).** Ist `codebase-improvement` nicht verfügbar (nicht
installiert, `skills.enabled: false` oder via `exclude` deaktiviert), greift die kurze
Kern-Guidance im Abschnitt „Minimaler Fallback ohne Skill“ dieses Tools. Sie hält den Workflow
funktionsfähig, hält aber **kein** zweites vollständiges Audit-Handbuch vor – volle Tiefe kommt
nur mit dem Skill.

`refactor.md` trägt mehr Inline-Reasoning als `$effective-flow review`; der delegierbare Anteil ist
die **Gap-Analyse und Plan-Validierung** in Phase 1 (Root-Cause, Komplexität/Over-Engineering,
Scope, Risiko, Refactor-Plan-Qualität). Der Cross-Language-/Runtime-Migrations-Zweig routet
weiterhin an `port-codebases`. Baseline, Verhaltens-Invarianz, Reports und Delivery bleiben
Effective-Flow-Contract.

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor Analyse und Refactoring und beachte ihre Vorgaben für Struktur, Grenzen, Tests, Review und Commits.

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
4. Im Worktree committen und `$effective-flow pr` gegen `delivery.baseBranch` ausführen.
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
`$effective-flow investigate`).

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
   Commit-Logik aus `$effective-flow commit` (ausschließlich bekannte geänderte Dateien
   explizit stagen, konkrete Conventional-Commit-Message ableiten, niemals
   `Co-Authored-By`-Trailer setzen). Workflows, die ihre Arbeit bereits committet
   haben (z. B. `$effective-flow maintain` mit einem Commit pro Gruppe), committen hier nur
   noch die Plan-Datei nach, falls nötig. Gibt es nichts zu committen: den User
   informieren, einen automatisch erzeugten leeren Liefer-Branch entfernen und ohne
   PR/Merge enden.
3. **Abschluss-Aktion bestimmen:** Wenn `delivery.completion` einen gültigen Wert hat,
   diesen verwenden und kurz melden, dass die Aktion aus der Effective Flow-Konfiguration
   (Projektsetup-ADR) übernommen wurde. Sonst fragen:

Wenn Delivery aktiv war und kein gültiger Wert für `delivery.completion` gesetzt ist: Frage den User: **Wie soll der Liefer-Branch abgeschlossen werden?**
- Pull-Request -- Branch pushen und über pr einen PR gegen den Basis-Branch erstellen
- Merge -- Branch lokal in den Basis-Branch mergen, ohne PR
- Nur Branch -- Branch im lokalen Repo belassen, keine weitere Aktion

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
   - `pr`: an `$effective-flow pr` delegieren und Liefer-Branch, Basis-Branch sowie den
     Workflow-/Änderungstyp (`feat`/`fix`/`refactor`/`docs`/`chore` je nach umsetzendem
     Workflow und Wirkung) als Titel-Typ-Hinweis übergeben, damit der PR-Titel einen
     gültigen Conventional-Commit-Typ trägt — bei Squash-Merge ist er das Release-Signal.
6. **Checkout zurückstellen:** Nach erfolgreicher PR-Erstellung oder bei `branch` auf
   `delivery.returnBranch` bzw. bei `auto` auf den lokalen Branch-Anteil von
   `delivery.baseBranch` zurückwechseln, sofern der Arbeitsbaum sauber ist. Wenn der
   Rückwechsel scheitert, den tatsächlichen Branch als Seiteneffekt ausdrücklich
   melden.

## Wisdom Accumulation

Erzeuge zu Beginn eine Session-ID (z. B. via Timestamp `date +%Y%m%d%H%M%S`) und verwende sie konsistent für die Wisdom-Datei `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`. Das verhindert Kollisionen bei parallelen Läufen.

Inhalte:

- Baseline-Werte und deren Bedeutung
- Strukturentscheidungen und Begründung
- entdeckte Abhängigkeiten
- Probleme bei der Umstrukturierung
- falsche Annahmen

## Projekt-Typ-Erkennung und Routing

Wie bei `$effective-flow build`.

Nutze ``generic-implementer`` für Refactorings an CI/CD, Tooling, Build-/Release-Konfiguration, Dependency-Manifesten, Container-Konfiguration und anderen Artefakten, die keinem Sprach-Implementer eindeutig gehören.

Aktueller Workflow für Review-Report-Rückverweise: `$effective-flow refactor`.

## Review-Report-Rückverweise

Wenn dieser Workflow ein Finding aus einer bestehenden Review-Report-Datei in `.effective-flow/review/` umsetzt:

- identifiziere die betroffene Report-Datei früh im Workflow
- ergänze am betroffenen Finding als letzten Eintrag einen kurzen Umsetzungs-Hinweis
- beginne den Hinweis mit einem grünen Haken, zum Beispiel `✅ Umgesetzt am YYYY-MM-DD via [aktueller Workflow]`
- aktualisiere nur die Findings, die durch diesen Workflow tatsächlich adressiert wurden
- wenn mehrere Reports oder Findings infrage kommen, frage nach statt pauschal zu markieren

## Offene Review-Finding-Reports

Wenn ein Workflow-Review Findings erzeugt, die vor Abschluss nicht direkt behoben werden, schreibe diese offenen Findings zusätzlich in eine Review-Report-Datei unter `.effective-flow/review/`.

Ziel:

- Offene oder bewusst nicht umgesetzte Findings gehen nicht in langen Plan-Dateien unter.
- ``tools/apply-review.md`` kann die Findings später im bekannten Reportformat verarbeiten.
- Die Plan-Datei bleibt Abschlussdokumentation und verweist nur auf den externen Report.

Gilt für Findings mit Status:

- `Offen`
- `Nicht umgesetzt`
- `Nicht umgesetzt (ADR: <slug>)` oder vergleichbare ADR-Status

Nicht in den externen Report übernehmen:

- Findings mit Status `Behoben`
- Findings, die während des Workflows direkt gefixt wurden
- rein informative Reviewer-Kommentare ohne konkrete Empfehlung

### Report-Pfad

1. Erstelle `.effective-flow/review/` falls nötig.
2. Wenn der Workflow eine Plan-Datei als Grundlage hat, verwende bevorzugt:
   - `.effective-flow/review/review-report-YYYY-MM-DD-plan-<slug>.md`
   - bei Kollision: `.effective-flow/review/review-report-YYYY-MM-DD-plan-<slug>-1.md`, `-2`, ...
3. Wenn keine Plan-Datei als Grundlage existiert, verwende:
   - `.effective-flow/review/review-report-YYYY-MM-DD-WORKFLOW.md`
   - bei Kollision: `.effective-flow/review/review-report-YYYY-MM-DD-WORKFLOW-1.md`, `-2`, ...
4. Schreibe oben im Report immer die Herkunft:
   - `**Ursprungsplan:** [Pfad oder „Keiner"]`
   - `**Quell-Workflow:** $effective-flow build / $effective-flow fix / $effective-flow refactor / $effective-flow maintain`
   - `**Quell-Review:** [Reviewer-Skill oder Phase]`

### Finding-IDs und Memory

Dieser Report verwendet dieselben globalen Finding-IDs wie `$effective-flow review`.

1. Lies `.effective-flow/memory.json`, falls vorhanden.
2. Falls die Datei fehlt, starte mit `lastFindingNumber: 0`.
3. Nummeriere neue Findings fortlaufend ab `lastFindingNumber + 1` mit sieben Stellen, z. B. `R-0000021`.
4. Schreibe nach dem Report die höchste vergebene Nummer zurück nach `.effective-flow/memory.json`.
5. Erhalte vorhandene Felder wie `configMigration` unverändert.
6. Wenn Memory nicht geschrieben werden kann, informiere den User und nenne den Reportpfad trotzdem.

### Reportformat

Verwende das kanonische Bericht-Format aus `$effective-flow review` Abschnitt „Bericht-Format“. Dupliziere das Template hier nicht und weiche nicht davon ab.

Zusätzliche Header-Felder für Workflow-Reports:

- Setze direkt unter `**Projekt-Typ:** ...` diese drei Zeilen:
  - `**Ursprungsplan:** [<plan.dir>/YYYY-MM-DD-<slug>.md oder Keiner]` (`<plan.dir>` ist das Plan-Verzeichnis aus `plan.dir` der Effective Flow-Konfiguration/Projektsetup-ADR, Default `docs/plan`)
  - `**Quell-Workflow:** [$effective-flow build / $effective-flow fix / $effective-flow refactor / $effective-flow maintain]`
  - `**Quell-Review:** [Reviewer oder Phase]`
- Alle Tabellen und Finding-Blöcke bleiben im `$effective-flow review`-Format.
- Die `## Übersprungene Findings (Designentscheidungen)`-Sektion wird nur ausgegeben, wenn solche Findings vorhanden sind.

Regeln:

- Kritische Findings dürfen nur dann in diesem Report verbleiben, wenn der User ausdrücklich entschieden hat, den Workflow trotz offenem kritischem Finding abzuschließen.
- Bestimme die Aktion wie bei `$effective-flow review`: Defekt → `$effective-flow fix`, Strukturproblem → `$effective-flow refactor`, fehlende Funktionalität oder Schutzmechanismus → `$effective-flow build`, reine Dokumentationslücke → `$effective-flow docs`.
- Trage niemals automatisch etwas in `Entwickler-Anmerkung` ein. Dieses Feld ist ausschließlich für manuelle Notizen des Entwicklers reserviert und bleibt in automatisch erzeugten Reports leer. Wenn ein Finding bewusst nicht umgesetzt wurde und ein ADR existiert, vermerke die ADR-Referenz im `Status` per Slug, z. B. `Nicht umgesetzt (ADR: <slug>)`.
- Gib dem User nach dem Schreiben den Reportpfad aus.

Aktueller Workflow für Plan-Referenzen: Refactoring (`$effective-flow refactor`).

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

Wenn ein offener Plan für `$effective-flow refactor` bestätigt ist, durchläuft er zuerst das
„Klärungs-Gate“. Besteht er das Gate nicht, verweise gemäß Gate-Verhalten auf
`$effective-flow plan` bzw. `$effective-flow review <plandatei>` und beende den Workflow. Besteht
der Plan das Gate:

- verwende die Inhalte der Plan-Datei als Refactoring-Plan
- validiere weiterhin in Phase 1, dass keine beabsichtigte Verhaltensänderung enthalten ist
- wurde aus der Apply-Kette bereits ein „geklärt + goal-getrieben“-Kontext übergeben (Grundlage geklärt, Bestätigung für autonomen Lauf bereits erteilt), honoriere ihn: überspringe die Goal-Abfrage in Phase 1 und durchlaufe die Phasen 2–6 unter der „Goal-getriebenen Abschlusssteuerung“.

## Workflow

### Phase 1: Analyse

1. Analysiere die Refactoring-Anforderung gründlich.
2. Untersuche den betroffenen Code:
   - aktuelle Struktur und Abhängigkeiten
   - bestehende Tests
   - betroffene Stellen
3. Kläre offene Fragen direkt mit dem User:
   - was genau soll refactored werden
   - welche Constraints gelten
4. Erstelle einen kompakten Refactoring-Plan:
   - vorher -> nachher
   - betroffene Dateien und Abhängigkeiten
   - Risiken und Seiteneffekte
5. Führe die Gap Analysis durch. Das **Reasoning** (Root-Cause-Platzierung, Over-Engineering-/Komplexitäts-Linse, Scope-Kontrolle, Risiko, unausgesprochene Annahmen, Edge Cases) folgt `codebase-improvement` (siehe „Delegations-Vertrag: generisches Audit-Reasoning“), sofern verfügbar; fehlt der Skill, greift der minimale Fallback. Effective-Flow-spezifisch bleibt die Prüfung auf **mögliche Verhaltensänderungen** (Refactoring darf kein Verhalten ändern) und **fehlende messbare Akzeptanzkriterien**.
6. Führe die Plan-Validierung durch. Die inhaltliche Beurteilung (ist der Refactor-Plan tragfähig, ausführbar, richtig geschnitten) folgt demselben Skill; die folgenden **deterministischen Scorecard-Schwellen** und die **Verhaltens-Invarianz** bleiben Effective-Flow-Output-Contract und werden nicht an den Skill abgegeben:
   - Clarity: Datei-Referenzen, Ziel >= 80%
   - Verification: messbare Akzeptanzkriterien jenseits von "Tests laufen"
   - Context: <= 10% Raten
   - Big Picture: Nutzen klar
   - Verhaltens-Invarianz: jede Änderung begründet
7. Präsentiere den Plan mit Scorecard.
8. Leite aus den messbaren Akzeptanzkriterien die explizite Abschlussbedingung ab (siehe „Goal-getriebene Abschlusssteuerung“); sie deckt die Phasen 2–6 ab und speist die explizite Goal-Abfrage in der Freigabe-Frage unten. Die Abschlussbedingung schließt die Verhaltens-Invarianz ein: die in Phase 2 erhobene Baseline muss unverändert bleiben.
9. Hole Freigabe ein. Die Freigabe-Frage enthält die explizite Goal-Abfrage (Option „Autonom via /goal“); behandle sie gemäß „Explizite Goal-Abfrage für autonome Läufe“: Bei Wahl „Autonom via /goal“ gib den `/goal`-String für die Phasen 2–6 aus; die Option entfällt, wenn der Workflow nicht-interaktiv delegiert wurde.

Frage den User: **Refactoring-Plan freigegeben?**
- Ja -- Freigabe erteilt, Workflow läuft gated weiter
- Autonom via /goal -- Verbleibende Phasen autonom unter nativem /goal — der Skill gibt den einzufügenden /goal-String aus (entfällt bei nicht-interaktiver Delegation)
- Anpassen -- Feedback als Freitext eingeben

### Phase 2: Baseline

Bestimme zuerst gemäß „Delivery- und Worktree-Integration“ den effektiven Delivery-/Worktree-Modus und führe bei aktivem Modus das passende Setup aus, bevor die Baseline erhoben wird: Worktree-Setup bei Worktree-Ausführung oder Liefer-Branch-Setup im Haupt-Repo bei In-Place-Delivery. Baseline, Refactoring und Nachher-Validierung (Phasen 2–5) laufen dann im Liefer-Arbeitsverzeichnis.

Starte parallel:

1. ``code-validator``
   - TypeScript-Fehler
   - Lint-Fehler
   - Build-Status
2. ``test-writer``
   - führe alle bestehenden Tests aus und dokumentiere das Ergebnis
   - schreibe in dieser Phase keine neuen Tests

Dokumentiere die Baseline für den späteren Vergleich.

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

### Phase 3: Refactoring

1. Starte den passenden Implementer-Skill.
2. Auftrag:
   - nur Struktur ändern
   - kein neues Verhalten
   - keine neuen Features
   - keine ungeplanten Bugfixes

### Phase 4: Review

1. Starte den passenden Reviewer-Skill für die geänderten Dateien.
2. Aggregiere Findings:
   - Kritisch: vor Abschluss beheben
   - Wichtig: sollte behoben werden
   - Hinweis: optional
3. Präsentiere die Review-Ergebnisse detailliert, einschließlich Status je Finding.
4. Dokumentiere jedes Finding strukturiert, damit offene oder nicht umgesetzte Findings als Review-Report geschrieben werden können:
   - Titel
   - Schweregrad (Kritisch / Wichtig / Hinweis)
   - Komplexität (Leicht / Mittel / Schwer)
   - Bereich
   - Datei + Zeile
   - Problem
   - Empfehlung
   - Aktion (`$effective-flow fix`, `$effective-flow refactor`, `$effective-flow build` oder `$effective-flow docs`)
   - Prompt-Vorschlag
   - Status (Behoben / Offen / Nicht umgesetzt)
   - Begründung bei Nicht-Umsetzung oder ADR-Referenz als Slug, falls vorhanden, z. B. `(ADR: <slug>)`
5. Lege in diesem Workflow niemals ein ADR an und frage auch nicht danach. Bewusst nicht umgesetzte Findings werden ausschließlich im Review-Report dokumentiert. Über die spätere Umsetzung oder über ein ADR für eine bewusste Nicht-Umsetzung entscheidet der Entwickler beim Durchgehen der Findings-Datei, typischerweise via `tools/apply-review.md`.
6. Wenn nach Review Findings mit Status `Offen` oder `Nicht umgesetzt` verbleiben:
   - schreibe sie gemäß „Offene Review-Finding-Reports“ in eine neue Datei unter `.effective-flow/review/`
   - verwende bei vorhandener Plan-Datei den Dateinamen `review-report-YYYY-MM-DD-plan-<slug>.md`
   - nenne den erzeugten Reportpfad in der Abschlusszusammenfassung
7. Wenn diese Phase ein Finding aus einer bestehenden Review-Report-Datei in `.effective-flow/review/` umgesetzt hat:
   - ergänze direkt im betroffenen Finding als letzten Eintrag einen kurzen Umsetzungs-Hinweis
   - beginne den Hinweis mit `✅` und nenne mindestens Datum und Workflow

### Phase 5: Nachher-Validierung

Starte parallel:

1. ``code-validator``
2. ``test-writer``
   - führt alle bestehenden Tests erneut aus
   - schreibt keine neuen Tests

### Phase 6: Vorher/Nachher-Vergleich und Abschluss

1. Vergleiche Ergebnisse aus Phase 5 mit der Baseline:
   - Tests
   - TypeScript
   - Lint
   - Build
2. Falls Regressionen gefunden werden:
   - User informieren
   - zurück zu Phase 3, dann Phase 5 und 6 erneut – gemäß „Goal-getriebene Abschlusssteuerung“: begrenze die internen Korrekturrunden und eskaliere an den User, falls die Baseline danach weiterhin nicht erreicht wird, statt unbegrenzt zu wiederholen
3. Falls keine Regressionen:
   - Wisdom-Datei löschen
   - wenn Delivery oder Worktree-Ausführung aktiv war: Handback gemäß „Delivery- und Worktree-Integration“ ausführen (bei geführter Plan-Datei inklusive Plan-Statuswechsel auf `Umgesetzt`/`Implemented` und Archiv-Move nach `<plan.dir>/archive/` am Delivery-Punkt, Änderungen committen, ggf. Worktree zurückziehen, Abschluss-Aktion `pr`/`merge`/`branch`, Checkout zurückstellen). Läuft der Workflow ausnahmsweise In-Place ohne Delivery, führt er denselben Statuswechsel und Archiv-Move direkt im Arbeitsbaum aus.
   - zusammenfassen, was refactored wurde; bei aktivem Delivery-/Worktree-Modus zusätzlich Liefer-Branch, finalen Checkout-Zustand und Ergebnis der Abschluss-Aktion (PR-URL, Merge oder belassener Branch) nennen
   - bestätigen, dass das Verhalten unverändert blieb

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

## Minimaler Fallback ohne Skill

Nur relevant, wenn `codebase-improvement` nicht verfügbar ist. Kurze Kern-Guidance für die Gap-Analyse und Plan-Validierung in Phase 1, damit `refactor` sauber degradiert – **kein** zweites vollständiges Audit-Handbuch:

- Die Ursache am richtigen Ort platzieren: das strukturelle Problem selbst angehen, nicht das nächstgelegene Symptom.
- Scope eng halten: nur die geplante Umstrukturierung; keine Features, keine Bugfixes, kein Gold-Plating (Over-Engineering-Linse).
- Risiko nach Blast-Radius bewerten: breit genutzte oder untestbare Stellen vorsichtiger und in kleineren Schritten.
- Die deterministischen Scorecard-Schwellen oben (Clarity >= 80%, Context <= 10% Raten) und die Verhaltens-Invarianz bleiben unverändert.

## Regeln

- Starte unabhängige Fachphasen parallel
- gib nach jeder Phase eine Statusmeldung
- führe keine Dokumentations-Phase ein, wenn das Refactoring kein öffentliches Verhalten ändert
- keine neuen Features oder Bugfixes während des Refactorings
