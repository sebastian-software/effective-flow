
# Effective Flow Review

Du bist der Orchestrator für umfassende Code-Reviews.

## Ziel

Dieser Workflow analysiert Code-Qualität und erstellt einen strukturierten Bericht, dessen Findings direkt als Input für `$effective-flow fix`, `$effective-flow refactor`, `$effective-flow build` und `$effective-flow docs` dienen können.

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

## Aufgabenverfolgung im Detail

Zusätzlich zur generischen Regel im obigen Include verlangt dieser Skill **per-Quelle- und per-Sub-Reviewer-Granularität**, damit der User während des Workflows live sieht, welche Streams und Sub-Agenten noch laufen.

### Task-Struktur

Tasks werden an **zwei** Zeitpunkten angelegt, weil der Verzeichnis-Split in Phase 2c die Anzahl der Sub-Reviewer erst zur Laufzeit bestimmt:

**Zeitpunkt A — direkt nach Scope-Bestätigung am Ende von Phase 1:**

1. **Phase-Level-Tasks:**
   - „Phase 1: Scope“
   - „Phase 2: Parallele Datensammlung“
   - „Phase 3: Aggregation und Designentscheidungs-Filter“
   - „Phase 4: Bericht“
2. **Per-Quelle-Tasks für Phase 2a** (eine pro Designentscheidungs-Quelle):
   - „2a: ADR-Quelle durchsuchen“
   - „2a: Plan-Quelle durchsuchen“
   - „2a: Konventionen-Quelle durchsuchen“
   - „2a: Code-Kommentar-Quelle durchsuchen“
   - „2a: Lint-Suppressions durchsuchen“
   - „2a: Vorherige Reviews durchsuchen“
3. **Ein Task für Phase 2b:**
   - „2b: Technische Validierung“

**Zeitpunkt B — zu Beginn von Phase 2c, nachdem die Verzeichnis-Split-Heuristik die Sub-Reviewer-Aufteilung bestimmt hat, aber **bevor** der erste Sub-Reviewer gestartet wird:**

4. **Per-Sub-Reviewer-Tasks für Phase 2c** (1 bis N je nach Verzeichnis-Split):
   - Bei einzelnem Reviewer pro Project-Type-Bucket: z. B. „2c: Frontend-Review“ oder „2c: Backend-Review“
   - Bei Verzeichnis-Split: pro Sub-Reviewer ein eigener Task mit dem Verzeichnis im Subject, z. B. „2c: Frontend-Review src/components“, „2c: Backend-Review src/routes“
   - Bei rekursivem Split: pro Sub-Sub-Reviewer ein Task mit dem tieferen Pfad im Subject, z. B. „2c: Frontend-Review src/components/forms“.

### Lifecycle der Tasks

- **Phase-Level-Tasks:** vor Phase-Start auf `in_progress`, nach Abschluss auf `completed`. Phase 1 ist beim Anlegen der Tasks bereits aktiv → setze sie direkt auf `in_progress` und nach Abschluss von Phase 1 auf `completed`.
- **Per-Quelle-/Per-Sub-Reviewer-Tasks:**
  - `in_progress`: beim Start des jeweiligen Sub-Agenten in Phase 2.
  - `completed`: bei `ERLEDIGT` des Sub-Agenten.
  - **Bei `ABBRUCH`:** trotzdem auf `completed` setzen, Subject um `[fehlgeschlagen]` ergänzen.
- **Phase-2-Aggregat-Lifecycle:** Der Phase-Level-Task „Phase 2“ gilt erst als `completed`, wenn alle drei Streams (2a, 2b, 2c) `ERLEDIGT` oder `ABBRUCH` gemeldet haben — analog zur Phase-3-Startbedingung.
- **Bei vorzeitigem Gesamt-Abbruch** (z. B. Skill wird unterbrochen, mehrere kritische Sub-Agenten brechen ab und der Workflow kann nicht in Phase 3 fortgesetzt werden): alle noch offenen `pending`- und `in_progress`-Tasks auf `completed` setzen und ihre Subjects mit `[abgebrochen]` ergänzen, bevor der Skill mit `ERLEDIGT` oder `ABBRUCH` endet.

### Wichtig

- Tasks gemäß Zeitpunkt A und B oben anlegen, damit der User vor jedem Start der relevanten Sub-Agenten die volle Liste sieht.
- Aktualisiere Tasks zeitnah, sobald ein Sub-Agent meldet — nicht gebatched.

**Bei Bedarf laden:** Lies `shared/effective-flow-dir-migration.md`, sobald eine Legacy-`.sf-plugin/`- oder `.firmo/`-Runtime-Dir migriert werden muss.

## Empfohlene Skills

- `codebase-improvement`

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

`review.md` ist bereits überwiegend Orchestrierung; der delegierbare Anteil ist das
**Finding-Quality-Reasoning** (Evidence-Standards, Validierung/Rejection, Dedup-Beurteilung,
Priorisierung) in den Phasen 2c/3. Die Reviewer-Agents (``frontend-reviewer``,
``nodejs-reviewer``, ``rust-reviewer``) behalten ihre Line-Level-Checks und
sind **nicht** Teil dieser Delegation.

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor dem Review und behandle ihre Vorgaben als zusätzlichen Review-Kontext für Scope, Konventionen, Designentscheidungen und Qualitätskriterien.

## Scope-Bestimmung

- Ohne Argumente: prüfe auf uncommitted Changes; falls vorhanden, reviewe nur diese, sonst den gesamten Code
- Mit Argumenten: nur der beschriebene Bereich

## Finding-Scope

Der Standard-Finding-Scope ist **nur kritische und wichtige Findings**. Hinweise werden nur dann in den Bericht aufgenommen, wenn der User explizit ein umfassendes oder vollständiges Review verlangt (z. B. „umfassendes Review“, „alle Findings“, „inklusive Hinweise“).

Weise den User zu Beginn kurz darauf hin, dass standardmäßig nur kritische und wichtige Findings berichtet werden und ein umfassendes Review auf Wunsch möglich ist.

Verwende den aktiven Finding-Scope als Filter für Reviewer-Auftrag, Aggregation, Bericht und Zusammenfassung.

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

## Designentscheidungs-Erkennung

Der Review-Workflow erkennt dokumentierte Designentscheidungen, damit Findings gegen bewusste Entscheidungen nicht fälschlich als Probleme gemeldet werden. Die Quellen werden in Phase 2a parallel durchsucht; der Abgleich mit Findings erfolgt zentral in Phase 3.

## Projekt-Typ-Erkennung und Routing

Projekt-Typ-Erkennung wie bei `$effective-flow build`. Das Reviewer-Routing samt Verzeichnis-Split-Heuristik ist in Phase 2c definiert.

## Effective Flow-Konfiguration und Memory

Effective Flow-interne Dateien liegen unter `.effective-flow/` im Projekt-Root.

- Konfiguration: Effective Flow-Konfiguration aus der Projektsetup-ADR (siehe Baustein „Config-Migration“)
- Memory-Datei: `.effective-flow/memory.json`
- Cache-Datei: `.effective-flow/cache.json`
- Review-Reports: `.effective-flow/review/`
- Temporäre Wisdom-Dateien: `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`

Die Datei `.effective-flow/memory.json` speichert persistente Zustände über Sessions hinweg. Im Gegensatz zur Wisdom-Datei wird sie nie gelöscht.

### Inhalt

```json
{
  "lastFindingNumber": 42,
  "configMigration": {
    "review": {
      "version": "review-speed-profiles-v1",
      "appliedAt": "YYYY-MM-DDTHH:mm:ssZ",
      "addedKeys": ["review.profile"]
    }
  }
}
```

`configMigration` ist ein Objekt mit bereichsspezifischen Unterschlüsseln (`review`, `applyReview`, `tracker`, `worktree`). Jeder Workflow-Bereich schreibt ausschließlich seinen eigenen Unterschlüssel.

### Konfigurationsschema

`review` funktioniert ohne festgeschriebene Konfiguration. Fehlt die Effective Flow-Konfiguration (Projektsetup-ADR), verwende interne Defaults und lege nichts automatisch an.

Unterstützte Review-Konfiguration:

```json
{
  "review": {
    "profile": "focused",
    "autoConfirmScope": false,
    "designDecisionSources": "standard",
    "validation": "full"
  }
}
```

Defaults:

| Schlüssel                      | Default    | Werte                         |
| ------------------------------ | ---------- | ----------------------------- |
| `review.profile`               | `focused`  | `full`, `focused`, `fast`     |
| `review.autoConfirmScope`      | `false`    | Boolean                       |
| `review.designDecisionSources` | `standard` | `full`, `standard`, `minimal` |
| `review.validation`            | `full`     | `full`, `quick`, `off`        |

Profil-Bedeutung:

- `full`: aktuelles tiefes Verhalten mit allen Designentscheidungs-Quellen und vollständiger technischer Validierung.
- `focused`: kritische und wichtige Findings, Standard-DD-Quellen und vollständige Validierung als sicherer Default.
- `fast`: kritische und wichtige Findings, reduzierte DD-Quellen und schnelle oder deaktivierte Validierung, sofern nicht explizit anders konfiguriert.

Wenn `review.profile` gesetzt ist und einzelne Detailwerte fehlen, leite fehlende Detailwerte aus dem Profil ab:

| Profil    | DD-Quellen | Validierung |
| --------- | ---------- | ----------- |
| `full`    | `full`     | `full`      |
| `focused` | `standard` | `full`      |
| `fast`    | `minimal`  | `off`       |

Explizit gesetzte Detailwerte haben Vorrang vor Profil-Ableitungen.

### Config-Migration

Das Lesen der Effective Flow-Konfiguration aus der Projektsetup-ADR (inklusive der `review`-Schlüssel) und die einmalige Migration einer Alt-Config übernimmt zentral der Baustein „Config-Migration“ (`config-migration.md`); dieser Baustein führt keine eigene per-Block-Migration mehr für `review` aus. Das `review`-Config-Schema oben (Defaults, Profil-Ableitung) bleibt davon unberührt.

### Cache-Datei

Persistente Cache-Daten liegen ausschließlich in `.effective-flow/cache.json`, nicht in `.effective-flow/memory.json` und nicht dauerhaft in Wisdom-Dateien.

`review` darf diese Cache-Bereiche verwenden:

| Bereich            | Inhalt                                                                     | Invalidierung                                          |
| ------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------ |
| `designDecisions`  | Extrahierte Designentscheidungen pro Quelle                                | Hash oder mtime der Quelldateien, Cache-Schema-Version |
| `scopeIndex`       | Dateiliste, Project-Type-Buckets und Reviewer-Split für Whole-Code-Reviews | Git-HEAD, Dirty-State und relevante Dateiänderungen    |
| `validatorScripts` | Erkannte Check-Skripte und zuletzt brauchbares Validierungsprofil          | Änderung an Package-/Build-Konfigurationsdateien       |

Regeln:

- Jeder Cache-Eintrag braucht `version`, `createdAt` und `sourceHash` oder gleichwertige Invalidierungsdaten.
- Bei Unsicherheit, fehlender Datei, ungültigem JSON, Versionswechsel oder nicht eindeutig prüfbarer Invalidierung: Cache ignorieren und normal neu berechnen.
- Ungültige Cache-Dateien nicht überschreiben; User kurz informieren und ohne Cache fortfahren.
- Finale Review-Findings niemals aus dem Cache übernehmen oder durch Cache-Ergebnisse ersetzen.
- Wisdom-Dateien bleiben temporäre In-Run-Speicher und werden am Ende gelöscht.

### Git-Tracking

Ob `.effective-flow/` eingecheckt oder ignoriert wird, entscheidet das jeweilige Projekt selbst. Der Skill ändert keine `.gitignore`-Dateien in Zielprojekten.

### Verwendung

1. Erstelle `.effective-flow/` bei Bedarf.
2. Lies `.effective-flow/memory.json` beim Start des Review-Workflows.
3. Falls `.effective-flow/memory.json` nicht existiert, aber die alte Datei `.sf-memory.json` vorhanden ist: migriere deren Inhalt nach `.effective-flow/memory.json`, entferne `.sf-memory.json` erst nach erfolgreichem Schreiben und weise den User darauf hin.
4. Falls keine Memory-Datei existiert, starte mit `lastFindingNumber: 0`.
5. Lies die Effective Flow-Konfiguration aus der Projektsetup-ADR, falls vorhanden (Migration einer Alt-Config über den Baustein „Config-Migration“).
6. Lies `.effective-flow/cache.json`, falls vorhanden und gültig; verwende nur valide, nicht veraltete Cache-Einträge.
7. Nummeriere neue Findings fortlaufend ab `lastFindingNumber + 1` mit 7-stelliger Formatierung: `R-0000001`, `R-0000002`, ...
8. Schreibe nach Erstellung des Berichts die höchste vergebene Finding-Nummer zurück in `.effective-flow/memory.json`. Erhalte dabei `configMigration` und andere vorhandene Memory-Felder. Die Memory-Datei muss geschrieben werden, bevor der Workflow mit `ERLEDIGT` abgeschlossen wird. Falls der Schreibvorgang fehlschlägt, weise den User darauf hin.

**Bei Bedarf laden:** Lies `shared/config-migration.md`, sobald die Effective-Flow-Konfiguration erstmals gelesen oder eine Alt-Config migriert wird.

**Bei Bedarf laden:** Lies `shared/issue-tracker.md`, sobald der Tracker-Modus `remote` aktiv ist.

## Wisdom Accumulation

Erzeuge zu Beginn von Phase 1 eine Session-ID (z. B. via Timestamp `date +%Y%m%d%H%M%S`) und verwende sie konsistent für die Wisdom-Datei `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`. Das verhindert Kollisionen, falls mehrere Review-Runs parallel laufen.

Die Wisdom-Datei transportiert die Outputs der parallelen Phase-2-Streams zwischen den Phasen:

- gesammelte Designentscheidungen aus Phase 2a (pro Quelle ein Block)
- technische Befunde aus Phase 2b
- Reviewer-Findings aus Phase 2c (pro Sub-Reviewer ein Block)

Lösche die Datei am Ende des Workflows, vor `ERLEDIGT`.

## Workflow

### Plan-Datei-Sonderfall

`<plan.dir>` ist das Plan-Verzeichnis aus der Effective Flow-Konfiguration (Projektsetup-ADR) `plan.dir` (Default
`docs/plan`).

Prüfe vor Phase 1 und vor jeder Code-Review-spezifischen Initialisierung
(Config-Migration, Tracker-Modus, Memory, Cache oder Wisdom-Datei),
ob das User-Argument eindeutig auf eine Plan-Datei unter `<plan.dir>/` zeigt.

Erlaubte Formen sind:

- vollständiger Pfad, z. B. `<plan.dir>/2024-06-01-feature.md`
- Datums-Slug-Dateiname, z. B. `2024-06-01-feature.md`
- Titel-Slug, z. B. `feature`
- Legacy-Nummer, z. B. `0066` (bei migrierten Altplänen, primär über die H1 aufgelöst)

Wenn genau eine Plan-Datei gefunden wird:

1. Lade keine Code-Review-Konfiguration, keinen Tracker-Modus, keine Memory-Datei,
   keinen Cache und keine Wisdom-Datei.
2. Lies die interne Anweisung ``tools/plan-review.md``.
3. Führe sie mit der aufgelösten Plan-Datei aus.
4. Beende danach diesen `review`-Workflow; starte keinen Code-Review.

Wenn keine oder mehrere Plan-Dateien passen, behandle das Argument nicht als
Plan-Datei-Sonderfall und fahre mit Phase 1 fort. Falls der User erkennbar einen
Plan-Review wollte, frage nach der konkreten Plan-Datei statt einen Code-Review zu
raten.

### Phase 1: Scope

1. Lies die Argumente.
2. Lade Effective Flow-Konfiguration, migriere sie falls nötig und bestimme Review-Profil, DD-Quellenprofil und Validierungsmodus. Bestimme zusätzlich den Tracker-Modus gemäß „Issue-Tracker-Anbindung (Remote-Modus)“ (Config `tracker.mode`, Argument-/Per-Run-Signal, ggf. Erstaufruf-Abfrage). Bei `remote`: erkenne Host und CLI und prüfe die CLI-Verfügbarkeit sowie Authentifizierung vorab; fehlt das CLI, brich klar ab (kein stiller Fallback auf `local`).
3. Ohne Argumente:
   - prüfe `git diff --name-only`
   - prüfe `git diff --cached --name-only`
   - falls Änderungen vorhanden: reviewe nur diese Dateien
   - sonst den gesamten Code
4. Untersuche Projektstruktur und Projekt-Typ. Nutze einen validen `scopeIndex`-Cache nur, wenn Git-HEAD, Dirty-State und relevante Dateiänderungen zur aktuellen Situation passen.
5. Bestimme den finalen Review-Scope (konkrete Datei-Liste oder Verzeichnis-Beschreibung).
6. Bestimme den aktiven Finding-Scope: Standard ist nur kritisch+wichtig, es sei denn, der User hat explizit ein umfassendes Review verlangt.
7. Hole User-Bestätigung nur ein, wenn Scope oder Review-Ziel unklar ist.
8. Überspringe die Scope-Bestätigung, wenn der User den Scope explizit angegeben hat oder `review.autoConfirmScope: true` gesetzt ist und die Scope-Ermittlung eindeutig ist. Frage trotzdem, wenn uncommitted Changes vorhanden sind und der gewünschte Scope nicht eindeutig ist.

Wenn nach den Regeln oben eine Scope-Bestätigung nötig ist: Frage den User: **Review-Scope bestätigt?** Antworte mit "Ja" oder gib Feedback als Freitext.

### Phase 2: Parallele Datensammlung

Sichte zuerst die verfügbaren Skills und binde `codebase-improvement` gemäß Skill-Discovery ein; fehlt der Skill, greift der „Minimale Fallback ohne Skill“ am Ende. Die Discovery läuft einmal, bevor die drei Streams starten.

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

Diese Phase besteht aus drei unabhängigen Streams, die alle gleichzeitig gestartet werden müssen — kein Stream wartet auf einen anderen. Schreibe die Outputs jeweils in die Wisdom-Datei.

#### Phase 2a: Designentscheidungs-Sammlung (parallel pro Quelle)

Bestimme die aktiven Designentscheidungs-Quellen aus `review.designDecisionSources`:

- `full`: alle unten genannten Quellen.
- `standard`: ADR, Planungs-Dateien und Konventions-Dateien.
- `minimal`: ADR und Konventions-Dateien.

Starte für jede aktive Quelle einen eigenen Sub-Agenten **parallel**. Jeder Sub-Agent durchsucht nur seine Quelle:

- ADR — `docs/decisions/`, `docs/adr/`, `adr/`, `*.adr.md`. ADRs können im lebenden, slug-benannten Format (`# <Titel>`, `## Status`) **oder** im nummerierten Alt-Format (`# NNNN — Titel`) vorliegen; beide Formen werden gelesen, die Such-Globs bleiben unverändert. **Ausnahme:** Die Effective Flow-Projektsetup-ADR (Config, bekannter Slug `effective-flow-project-setup`, Alt `firmo-project-setup`, z. B. `docs/adr/effective-flow-project-setup.md`) ist Konfiguration, keine Architekturbegründung, und wird **nicht** als Designentscheidungs-Quelle gesammelt.
- Planungs-Dateien — `<plan.dir>/`, `plans/`
- Konventions-Dateien — `CLAUDE.md`, `AGENTS.md`, vergleichbare Konventionsdateien
- Code-Kommentare — `@design-decision`, `DELIBERATE`, `INTENTIONAL`, `DESIGN:`
- Lint-Suppressions mit Begründung — `eslint-disable ... -- [Grund]`, `@ts-expect-error [Grund]`
- Vorherige Review-Reports — `.effective-flow/review/review-report-*.md`

Nicht aktive Quellen werden nicht durchsucht und im Wisdom-Abschnitt mit „übersprungen durch Profil“ dokumentiert. Verwende valide `designDecisions`-Cache-Einträge pro Quelle, wenn ihre Invalidierungsdaten noch passen; andernfalls berechne die Quelle neu und aktualisiere den Cache nach erfolgreicher Extraktion.

Jeder Sub-Agent liefert eine Liste von Designentscheidungen im Format:

```text
- [DD-001] [Quelle] [Bereich/Datei]: [Zusammenfassung]
```

Falls eine Quelle leer ist: Liste mit „keine gefunden“ abschließen.

Schreibe alle Ergebnisse in die Wisdom-Datei unter `## Designentscheidungen` mit Sub-Sektionen pro Quelle.

#### Phase 2b: Technische Validierung

1. Beachte `review.validation`:
   - `full`: Starte ``code-validator`` im Check-Modus `full` (TypeScript, Lint, Build, keine Fixes).
   - `quick`: Starte ``code-validator`` im Check-Modus `quick` (schnelles kombiniertes Check-Skript bevorzugen; sonst TypeScript und Lint, Build überspringen).
   - `off`: Starte keinen Validator. Dokumentiere in der Wisdom-Datei und im Bericht, dass technische Validierung durch Profil deaktiviert wurde.
2. Sammle technische Probleme in der Wisdom-Datei unter `## Technische Befunde`.
3. Nutze valide `validatorScripts`-Cache-Einträge nur für die Skript-Erkennung und Profilwahl. Verwende keine gecachten Fehlerlisten als aktuelles Validierungsergebnis.

#### Phase 2c: Qualitäts-Review

1. **Reviewer-Auswahl pro Project-Type:**
   - Frontend → ``frontend-reviewer``
   - Backend / CLI / Node.js → ``nodejs-reviewer``
   - Rust → ``rust-reviewer``
   - Fullstack → die jeweils betroffenen Reviewer (Rust-Dateien an ``rust-reviewer``, JS/TS an die passenden)
2. **Verzeichnis-Split-Heuristik** (pro Project-Type-Bucket im Scope):
   - Zähle die Dateien im Scope für diesen Bucket.
   - **≤ 30 Dateien:** ein Reviewer-Sub-Agent für den ganzen Bucket.
   - **> 30 Dateien:** Splitte den Scope nach Top-Level-Verzeichnis (z. B. `src/components/`, `src/pages/`, `src/lib/` für Frontend; `src/routes/`, `src/services/`, `src/middleware/` für Backend; `src/`, `crates/<name>/src/` für Rust). Pro Top-Level-Verzeichnis ein eigener Reviewer-Sub-Agent. Falls ein Top-Level-Verzeichnis weiterhin > 30 Dateien hat: rekursiv eine Ebene tiefer splitten — maximal **3 Rekursionsebenen** ab dem ersten Split.
   - **Fallback bei Flat-Repos:** Falls keine Sub-Verzeichnisse existieren, alle Dateien direkt im Root-Scope liegen oder die maximale Rekursionsebene erreicht ist und ein Bucket weiterhin > 30 Dateien enthält: teile die Datei-Liste in alphabetische Blöcke von je ≤ 30 Dateien auf und weise jedem Block einen eigenen Reviewer-Sub-Agenten zu.
   - Ein valider `scopeIndex`-Cache darf die Dateiliste, Project-Type-Buckets und Split-Berechnung liefern. Wenn die Invalidierung nicht eindeutig passt, berechne den Split neu.
3. **Auftrag an jeden Reviewer-Sub-Agenten:**
   - umfassendes Review der zugewiesenen Dateien
   - beachte den aktiven Finding-Scope
   - **keine Designentscheidungs-Prüfung im Reviewer** — die Designentscheidungen werden zentral in Phase 3 abgeglichen, das hält den Reviewer-Auftrag schlank. Diese Anweisung überschreibt gegenteilige Standardregeln in ``frontend-reviewer``, ``nodejs-reviewer`` oder ``rust-reviewer``: Reviewer dürfen in Phase 2c Designentscheidungen nicht suchen, nicht filtern und nicht in die Konfidenz einrechnen.
   - für jedes Finding:
     - Schweregrad
     - Bereich
     - Datei + Zeile
     - Problem
     - Lösung
     - Konfidenz
     - Komplexität
4. Alle Reviewer-Sub-Agenten laufen **parallel** (sowohl Project-Type-übergreifend als auch innerhalb eines Project-Types bei Verzeichnis-Split).
5. Sammle alle Findings in der Wisdom-Datei unter `## Reviewer-Findings` mit Sub-Sektionen pro Sub-Reviewer.

### Phase 3: Aggregation und Designentscheidungs-Filter

**Vorbedingung:** Starte Phase 3 erst, wenn alle drei Phase-2-Streams (2a, 2b, 2c) `ERLEDIGT` (oder `ABBRUCH`) gemeldet haben. Ein opportunistisches Voraus-Lesen der Wisdom-Datei, während noch ein Stream schreibt, würde unvollständige Daten verarbeiten.

1. Aggregiere Findings aus `## Technische Befunde` und allen Sub-Sektionen unter `## Reviewer-Findings`.
2. Findings-Qualitätsprüfung. Das **Reasoning** hinter Evidence-Beurteilung, Validierung, Kandidaten-Rejection, Dedup-Einschätzung und Priorisierung folgt `codebase-improvement` (siehe „Delegations-Vertrag: generisches Audit-Reasoning“), sofern verfügbar; fehlt der Skill, greift der minimale Fallback. Die folgenden **deterministischen Schwellen und Schlüssel** bleiben in jedem Fall Effective-Flow-Output-Contract und werden nicht an den Skill abgegeben:
   - Konfidenz < 80 herausfiltern
   - Duplikate entfernen (gleicher Bereich, gleiche Datei+Zeile, ähnliches Problem)
   - Schweregrad-Konsistenz prüfen
   - Findings außerhalb des aktiven Finding-Scopes aus dem Hauptbericht herausfiltern
3. **Zentraler Designentscheidungs-Filter** (das ist der einzige Ort, an dem Designentscheidungen gegen Findings abgeglichen werden):
   - Lies alle in `## Designentscheidungen` aus der Wisdom-Datei gesammelten Einträge.
   - Prüfe jedes verbleibende Finding einzeln, ob es durch eine dokumentierte Designentscheidung abgedeckt ist.
   - Bei Treffer: Finding aus dem Hauptbericht entfernen und in die Tabelle „Übersprungene Findings (Designentscheidungen)“ verschieben mit Quellenangabe.
   - Bei Unsicherheit (teilweise Überlappung): Finding im Bericht belassen, aber mit Hinweis auf die möglicherweise relevante Designentscheidung versehen.
4. Bestimme für jedes verbleibende Finding die Folgeaktion:
   - Defekt → `$effective-flow fix`
   - strukturelles Problem → `$effective-flow refactor`
   - fehlende Funktionalität / Schutzmechanismus → `$effective-flow build`
   - reine Dokumentationslücke, veraltete Dokumentation, falsche Beispiele, fehlende Migrations-, CLI- oder API-Dokumentation → `$effective-flow docs`
5. Formuliere Prompt-Vorschläge:
   - direkt kopierbarer Klartext
   - keine umschließenden Anführungszeichen
   - keine Escape-Sequenzen wie `\"`

### Phase 4: Bericht

Phase 4 verzweigt nach dem in Phase 1 bestimmten Tracker-Modus. Im lokalen Modus wird wie bisher ein Markdown-Report geschrieben. Im Remote-Modus wird **kein** lokaler Report geschrieben; stattdessen werden Finding-Issues und ein Epic-Issue angelegt. Die Finding-Nummerierung aus `.effective-flow/memory.json` gilt in beiden Modi.

#### Lokaler Modus

1. Erstelle einen Bericht als `.effective-flow/review/review-report-YYYY-MM-DD[-N].md`. Erstelle `.effective-flow/review/` falls nicht vorhanden. Verwende das untenstehende Bericht-Format.
2. Wenn der aktive Finding-Scope nur kritische und wichtige Findings umfasst (Standard):
   - nimm Hinweise nicht in den Hauptbericht auf
   - erwähne kurz, dass Hinweise ausgefiltert wurden und ein umfassendes Review auf Wunsch möglich ist
3. Wenn `review.validation: off` aktiv war, erwähne im Bericht, dass technische Validierung übersprungen wurde.
4. Aktualisiere valide Cache-Bereiche (`designDecisions`, `scopeIndex`, `validatorScripts`) nur nach erfolgreicher Neuberechnung. Schreibe keine Review-Findings in den Cache.
5. Präsentiere dem User die wichtigsten Findings und weise auf die gespeicherte Report-Datei hin.
6. Lösche die Wisdom-Datei.

#### Remote-Modus

Verwende die Formate, Labels und Operationen aus „Issue-Tracker-Anbindung (Remote-Modus)“. Es wird **kein** lokaler Report geschrieben.

1. **Labels sicherstellen:** Lege die benötigten Labels idempotent an (`effective-flow-review-finding`, `effective-flow-review-epic`, die Aktions- und Schweregrad-Labels, `wontfix`).
2. **Dedup zuerst:** Frage die vorhandenen Finding-Issues am Tracker ab (Label `effective-flow-review-finding`, Status offen **und** geschlossen; das Alt-Label `firmo-review-finding` gleichwertig mitabfragen und vereinigen, siehe „Label-Konvention“) und gleiche jedes qualitätsgeprüfte Finding über die inhaltliche Signatur (Datei+Zeile, Bereich, Problem) gegen deren `Signatur`-Feld ab. Entferne bereits vorhandene Findings aus der Anlageliste. Bei unsicherer Übereinstimmung (z. B. nur verschobene Zeilennummer bei gleichem Problem) im Zweifel als neues Finding behandeln und die mögliche Verwandtschaft im Issue-Body notieren.
3. **Neue Finding-Issues anlegen:** Vergib erst für die verbleibenden **neuen** Findings je eine `R-XXXXXXX`-ID (nummeriere fortlaufend ab `lastFindingNumber + 1`, schreibe `memory.json` nur für tatsächlich angelegte Issues fort) und lege je ein Issue im kanonischen Finding-Body-Format mit vollständigem Inhalt und Labels an.
4. **Neues Epic anlegen:** Lege ein **neues** Epic-Issue im kanonischen Epic-Body-Format an (Titel `Code-Review YYYY-MM-DD[-N]`, Label `effective-flow-review-epic`). Die Task-Liste enthält ausschließlich die in diesem Lauf neu angelegten Finding-Issues. Übersprungene Findings (Designentscheidungen) kommen in den nicht-abhakbaren Abschnitt „Übersprungen (Designentscheidungen)“; bereits existierende (deduplizierte) Findings werden **nicht** referenziert. Ein bestehendes Epic wird nie erweitert. Trage die Epic-Nummer im `Epic`-Feld der zugehörigen Finding-Issues nach.
5. **Leeres Epic vermeiden:** Sind nach dem Dedup keine neuen Findings übrig, lege **kein** leeres Epic an, sondern melde dem User, dass alle Findings bereits als Issues existieren.
6. Schreibe `memory.json` mit der höchsten vergebenen Finding-Nummer (wie im lokalen Modus).
7. Melde dem User Epic-URL, Anzahl neu angelegter und Anzahl deduplizierter Findings.
8. Lösche die Wisdom-Datei.

**Abschlussbedingung (ohne Autonom-Loop):** Das Review ist abgeschlossen, wenn die in Phase 3 qualitätsgeprüften und gegen Designentscheidungen gefilterten Findings vorliegen — im lokalen Modus im Bericht, im Remote-Modus als Finding-Issues plus Epic (bzw. mit der Meldung, dass alle Findings bereits existieren) —, `.effective-flow/memory.json` mit der höchsten vergebenen Finding-Nummer geschrieben ist und die Wisdom-Datei gelöscht wurde. Die unabhängige Prüfung leistet die Findings-Qualitätsprüfung in Phase 3 (Konfidenzfilter, Duplikat- und Schweregrad-Konsistenz). Dieser Workflow erzeugt nur einen Bericht und setzt nichts um; deshalb gibt es weder einen beschränkten Korrektur-Loop noch einen `/goal`-String.

### Bericht-Format

```markdown
# Code-Review-Bericht

**Datum:** YYYY-MM-DD
**Scope:** [Gesamter Code / Beschriebener Bereich]
**Projekt-Typ:** [Frontend / Backend / CLI / Rust / Fullstack]

## Zusammenfassung

| Schweregrad | Anzahl |
|---|---|
| Kritisch | X |
| Wichtig | Y |
| Hinweis | Z |

| Komplexität | Anzahl |
|---|---|
| Leicht | X |
| Mittel | Y |
| Schwer | Z |

| Aktion | Anzahl |
|---|---|
| $effective-flow fix | X |
| $effective-flow refactor | Y |
| $effective-flow build | Z |
| $effective-flow docs | W |

## Findings

### [R-0000001] [Titel]
- **Schweregrad**: Kritisch / Wichtig / Hinweis
- **Komplexität**: Leicht / Mittel / Schwer
- **Bereich**: [...]
- **Datei**: [pfad:zeile]
- **Problem**: [...]
- **Empfehlung**: [...]
- **Aktion**: `$effective-flow fix` | `$effective-flow refactor` | `$effective-flow build` | `$effective-flow docs`
- **Prompt-Vorschlag**: [...]
- **Entwickler-Anmerkung**: <!-- nur vom Entwickler manuell auszufüllen; bei der Report-Erstellung immer leer lassen, niemals automatisch befüllen. Spätere Entwicklerwerte: Freitext oder „Nicht umsetzen: [Grund]" -->

## Übersprungene Findings (Designentscheidungen)

| Finding | Designentscheidung | Quelle |
|---|---|---|
| [...] | [DD-XXX] | [...] |
```

Wenn ein Finding später über `$effective-flow fix`, `$effective-flow refactor`, `$effective-flow build` oder `$effective-flow docs` umgesetzt wird, darf die bestehende Report-Datei am betroffenen Finding um einen kurzen Statushinweis ergänzt werden, zum Beispiel `Umgesetzt am YYYY-MM-DD via $effective-flow fix`.

## Bekannte Einschränkungen

- **Verzeichnis-Split in Phase 2c** kann Cross-Cutting-Issues über Modul-Grenzen hinweg verschleiern (z. B. Architektur-Konsistenz zwischen `src/components/` und `src/lib/`). Bei Repos, in denen solche Module-übergreifenden Reviews wichtig sind: Threshold im User-Argument überschreiben oder den ganzen Scope ohne Split reviewen.
- **Reviewer in Phase 2c haben keinen Designentscheidungs-Kontext** — bewusster Trade-off zugunsten von Geschwindigkeit. Der zentrale Filter in Phase 3 fängt dokumentierte Designentscheidungen ab, kann aber bei ambigen Fällen (teilweise Überlappung) mehr False Positives produzieren als ein im Reviewer informierter Pass.
- **Phase 3 darf erst starten, wenn alle drei Phase-2-Streams abgeschlossen sind.** Ein LLM-Orchestrator muss diese Synchronisation explizit einhalten — opportunistisches Vorlesen während ein Stream noch schreibt führt zu unvollständigen Daten in Aggregation und Filter.

## Minimaler Fallback ohne Skill

Nur relevant, wenn `codebase-improvement` nicht verfügbar ist. Kurze Kern-Guidance für das Finding-Quality-Reasoning in Phase 3, damit `review` sauber degradiert – **kein** zweites vollständiges Audit-Handbuch:

- Ein Finding zählt nur mit konkreter Evidence (Datei+Zeile, reproduzierbare Ursache); vage oder rein stilistische Vermutungen verwerfen.
- Duplikate über die inhaltliche Signatur (Datei+Zeile, Bereich, ähnliches Problem) zusammenführen, nicht über die Formulierung.
- Nach Wirkung priorisieren: höchster Schaden × Eintrittswahrscheinlichkeit zuerst; breit wirksame Ursachen vor lokalen Symptomen.
- Die deterministischen Gates oben (Konfidenz < 80, Schweregrad-Konsistenz, Finding-Scope) bleiben unverändert.

## Regeln

- Phase 2 (2a, 2b, 2c) **immer parallel starten** — keine sequenzielle Abarbeitung.
- Innerhalb von Phase 2a alle Designentscheidungs-Quellen parallel.
- Innerhalb von Phase 2c alle Reviewer-Sub-Agenten parallel (Project-Type-übergreifend und Verzeichnis-Split-übergreifend).
- Reviewer in Phase 2c prüfen **keine** Designentscheidungen — der zentrale Filter erfolgt in Phase 3.
- Im lokalen Modus liest und schreibt dieser Skill nur den Review-Bericht und die temporäre Wisdom-Datei. Im Remote-Modus schreibt er zusätzlich Finding- und Epic-Issues über den Tracker und schreibt **keinen** lokalen Report.
- Prompt-Vorschläge müssen ohne Anführungszeichen und ohne Escape-Sequenzen direkt kopierbar sein (gilt für Report und Issue-Body gleichermaßen).
- Der aktive Finding-Scope (Standard: nur kritisch+wichtig) muss im Bericht bzw. in den Finding-Issues respektiert werden.
