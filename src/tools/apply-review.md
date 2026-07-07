---
description: "Liest eine Review-Report-Datei ein, wertet Entwickler-Anmerkungen aus, erstellt ADRs für abgelehnte Findings und delegiert umsetzbare Findings parallel an {{SKILL:fix}}, {{SKILL:refactor}}, {{SKILL:build}} oder {{SKILL:docs}}."
---

# Firmo Apply Review

Du bist der Orchestrator für die automatisierte Umsetzung von Review-Report-Findings.

## Ziel

Dieser Workflow liest eine bestehende Review-Report-Datei aus `.firmo/review/` ein, wertet die Entwickler-Anmerkungen pro Finding aus und delegiert die Umsetzung an die passenden Workflows. Findings, die bewusst nicht umgesetzt werden sollen, werden als ADRs dokumentiert.

Im **Remote-Modus** (Tracker-Modus `remote`) liest der Workflow die Findings stattdessen aus einem Issue-Tracker: übergeben wird ein Epic-Issue oder eine Liste konkreter Finding-Issues, pro Finding entsteht ein PR, und der Epic-Eintrag wird nach PR-Erstellung abgehakt. Die Abweichungen sind in „Remote-Modus (Issue-Tracker)“ gebündelt; `wontfix`-Findings ersetzen dort die ablehnende Entwickler-Anmerkung.

```include
language-rules
```

```include
task-tracking
```

```include
commit-message-rules
```

## Aufgabenverfolgung im Detail

Zusätzlich zur generischen Regel im obigen Include verlangt dieser Skill **per-Finding-Granularität**, damit der User während des Workflows live sieht, wie viele Findings noch offen sind.

### Task-Struktur

Lege gleich zu Beginn von Phase 1 (nach erfolgreicher Report-Klassifikation) folgende Tasks an:

1. **Phase-Level-Tasks** für jede Workflow-Phase, in der Reihenfolge:
   - „Phase 1: Report einlesen und validieren“
   - „Phase 2: Commit- und Stash-Strategie festlegen“
   - „Phase 3: ADR-Erstellung“
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

```include
firmo-dir-migration
```

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie früh im Workflow und beachte ihre Vorgaben.

```include
completion-protocol
```

```include
goal-completion
```

## Wisdom Accumulation

Verwende `.firmo/.wisdom-accumulation-<SESSION_ID>.tmp.md` für:

- Stash-Baseline aus Phase 1 (Liste der bereits vorhandenen Stash-Referenzen mit Beschreibungen und Commit-Hashes)
- Vorabanalyse pro Finding aus Phase 4.1 (betroffene Dateien, Root Cause / Anforderung, Implementierungsskizze, Risiken, Konfidenz)
- berechnete Sub-Gruppen aus Phase 4.2
- umgesetzte Findings und deren Ergebnis
- fehlgeschlagene Delegationen
- erzeugte ADRs

Schreibe nach jeder Phase ein Summary und gib es an spätere Phasen weiter. Lösche die Datei am Ende.

## Firmo-Konfiguration

Firmo-interne Dateien liegen unter `.firmo/` im Projekt-Root.

- Konfiguration: `.firmo/config.json`
- Memory-Datei: `.firmo/memory.json`
- Cache-Datei: `.firmo/cache.json`
- Review-Reports: `.firmo/review/`
- Temporäre Wisdom-Dateien: `.firmo/.wisdom-accumulation-<SESSION_ID>.tmp.md`

`apply-review` funktioniert ohne Konfigurationsdatei. Falls `.firmo/config.json` vorhanden ist, darf sie Apply-Review-Defaults überschreiben:

```json
{
  "applyReview": {
    "defaultCommitStrategy": null,
    "finalValidation": "full",
    "stashPolicy": "interactive",
    "worktree": {
      "baseDir": ".firmo/.worktrees",
      "setup": "auto"
    }
  }
}
```

Fehlende Werte haben diese Defaults:

- `applyReview.defaultCommitStrategy`: nicht gesetzt (Commit-Strategie wird gefragt)
- `applyReview.finalValidation`: `full`
- `applyReview.stashPolicy`: `interactive` (heutiges interaktives Pro-Stash-Nachfragen)
- `applyReview.worktree.baseDir`: `.firmo/.worktrees`
- `applyReview.worktree.setup`: `auto`

Gültige Werte:

- `applyReview.defaultCommitStrategy`: `worktrees`, `single`, `none`
- `applyReview.finalValidation`: `full`, `changedScope`, `off`
- `applyReview.stashPolicy`: `interactive`, `keep`, `discard`, `apply`
- `applyReview.worktree.setup`: `auto`, `none` oder ein expliziter Setup-Befehl als String

### Config-Migration

Wenn `.firmo/config.json` existiert, prüfe sie beim Start auf fehlende unterstützte Apply-Review-Schlüssel.

- Ergänze fehlende Schlüssel mit den Defaults oben.
- Erhalte vorhandene gültige Werte und unbekannte Schlüssel unverändert.
- Lies die Datei direkt vor dem Schreiben erneut frisch ein, damit zwischenzeitliche Änderungen nicht überschrieben werden.
- Wenn die Datei ungültiges JSON enthält: nicht schreiben, sichere Defaults für diesen Lauf verwenden und den User mit Pfad und Fehler informieren.
- Wenn ein bekannter Schlüssel einen ungültigen Wert enthält: nicht überschreiben, sicheren Default für diesen Lauf verwenden und den User über den Schlüssel informieren.
- Wenn die Migration Schlüssel ergänzt hat: teile dem User einmal in diesem Workflow-Lauf mit, dass `.firmo/config.json` migriert wurde, nenne die ergänzten Schlüssel und weise darauf hin, dass die Defaults das bisherige sichere Verhalten erhalten.
- Speichere nach erfolgreicher Migration den Status in `.firmo/memory.json` unter `configMigration.applyReview`, ohne vorhandene Felder wie `lastFindingNumber` zu verlieren. Andere Unterschlüssel von `configMigration` (`review`, `tracker`, `worktree`) unverändert erhalten. Die `applyReview.worktree.*`-Schlüssel gehören zu `configMigration.applyReview`, nicht zu `configMigration.worktree`.
- Legacy: Liegt in `configMigration` noch ein alter flacher Eintrag (Felder `version`/`appliedAt`/`addedKeys` direkt unter `configMigration`), darf er beim nächsten Schreiben in die Unterschlüssel-Form überführt bzw. ersetzt werden – die Migrationen sind idempotent config-getrieben; die Zuordnung zum Bereich ist optional per `addedKeys`-Präfix möglich.

Geplanter Memory-Eintrag:

```json
{
  "configMigration": {
    "applyReview": {
      "version": "apply-review-speed-profiles-v1",
      "appliedAt": "YYYY-MM-DDTHH:mm:ssZ",
      "addedKeys": ["applyReview.finalValidation", "applyReview.worktree.baseDir"]
    }
  }
}
```

### Cache-Datei

Persistente Cache-Daten liegen ausschließlich in `.firmo/cache.json`, nicht in `.firmo/memory.json` und nicht dauerhaft in Wisdom-Dateien.

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

```include
apply-source-detection
```

## Remote-Modus (Issue-Tracker)

Ist der Tracker-Modus `remote` (das Argument ist ein Epic- oder Finding-Issue), lies **vor** dem lokalen Report-Fluss die interne Teil-Datei `tools/apply-review-remote.md` und befolge sie. Sie enthält die Issue-Tracker-Anbindung sowie den kompletten Remote-Ablauf (Phase 1–8 remote) und ersetzt bzw. ergänzt die entsprechenden lokalen Schritte. Im lokalen Modus (Report-Datei unter `.firmo/review/`) wird sie nicht geladen.

## Workflow

### Phase 1: Report einlesen und validieren

Bestimme zuerst den Tracker-Modus über die „Apply-Quellen-Erkennung“ (Report-Datei unter `.firmo/review/` → `local`; Epic-/Finding-Issue → `remote`). Ist er `remote`, lies und befolge die interne Teil-Datei `tools/apply-review-remote.md` (Phase 1 remote und folgende) statt der Report-Datei-Schritte 4–7 unten; die Config-, Stash- und Cache-Schritte gelten weiterhin.

1. Lade Firmo-Konfiguration, migriere sie falls nötig und bestimme Commit-Strategie-Default, Stash-Policy, Worktree-Defaults und finales Validierungsprofil.
2. Lies `.firmo/cache.json`, falls vorhanden und gültig. Verwende nur valide `applyReviewAnalysis`-Einträge.
3. **Stash-Baseline erfassen:** Führe `git stash list` aus und merke dir die vollständige Liste der bereits vorhandenen Stash-Referenzen (z. B. `stash@{0}`, `stash@{1}`, ... mit ihren Beschreibungen). Halte die Baseline in der Wisdom-Datei fest, damit Phase 6 (Stash-Bereinigung) später neue, durch diesen Workflow entstandene Stashes davon abgrenzen kann. Falls `git stash list` leer ist: notiere „keine Baseline-Stashes“.
4. Bestimme die Report-Datei:
   - falls als Argument übergeben: verwende diese Datei
   - sonst: suche nach `.firmo/review/review-report-*.md` in `.firmo/review/`
   - bei mehreren Reports: frage den User welcher verwendet werden soll
   - falls kein Report gefunden: Fehlermeldung und Abbruch
5. **Lies die Datei frisch ein.** Da die Datei zwischen Konversationen gelöscht und neu erstellt werden kann, darf kein zuvor eingelesener Inhalt verwendet werden. Lies die Datei immer direkt vom Dateisystem.
6. Parse alle Findings (`### [R-XXXXXXX] ...`-Blöcke) mit:
   - Finding-ID und Titel
   - Schweregrad
   - Komplexität
   - Aktion (`{{SKILL:fix}}`, `{{SKILL:refactor}}`, `{{SKILL:build}}`, `{{SKILL:docs}}`)
   - Prompt-Vorschlag
   - Entwickler-Anmerkung (falls vorhanden)
   - Bereits vorhandene Umsetzungshinweise (✅)
7. Klassifiziere jedes Finding:
   - **Bereits umgesetzt:** Finding hat bereits einen ✅-Hinweis → überspringen
   - **Nicht umsetzen:** Entwickler-Anmerkung beginnt mit „Nicht umsetzen“ → ADR erstellen
   - **Umsetzen:** Kein ✅-Hinweis und keine ablehnende Anmerkung → an Skill delegieren
   - **Umsetzen mit Kontext:** Entwickler-Anmerkung vorhanden, die nicht mit „Nicht umsetzen“ beginnt → an Skill delegieren, Anmerkung als zusätzlichen Kontext mitgeben
8. Gib dem User eine Übersicht:

```markdown
**Report:** [Dateiname]
**Datum:** [Datum aus Report]

| Status | Anzahl |
|---|---|
| Umzusetzen | X |
| Nicht umsetzen (ADR) | Y |
| Bereits umgesetzt | Z |
| Gesamt | N |
```

9. Falls keine umsetzbaren Findings vorhanden sind und keine ADRs zu erstellen sind: Kurzmeldung und Abbruch.

### Phase 2: Commit- und Stash-Strategie

Diese Phase ist das einzige Up-front-Strategie-Gate des Workflows: Commit-Strategie und Stash-Policy werden hier gemeinsam festgelegt, bevor die Findings abgearbeitet werden. Danach folgt kein weiteres **reguläres** Approval-Gate; verbleibende Stopps sind ausschließlich konfliktbedingte Datenintegritäts-Eskalationen: ein `apply`-Merge-Konflikt in Phase 6, ein risikoreicher Cherry-Pick-Konflikt in Phase 4.3 bei der Strategie „Einzeln mit Worktrees“ und – selten – ein verwaister Commit-Lock bei der Strategie „Einzeln“. Tritt keine solche Eskalation auf, laufen die Phasen 3–8 unter nativem `/goal` autonom.

Wenn `applyReview.defaultCommitStrategy` gültig gesetzt ist, überspringe die ASK-Frage und verwende die konfigurierte Strategie:

- `worktrees` → **Einzeln mit Worktrees**
- `single` → **Einzeln**
- `none` → **Keine Commits**

Melde kurz, dass die Commit-Strategie aus `.firmo/config.json` übernommen wurde. Wenn kein gültiger Wert gesetzt ist, frage wie bisher:

```ask
when: kein gültiger Wert für `applyReview.defaultCommitStrategy` gesetzt ist
header: Commits
question: Welche Commit-Strategie soll für die Findings verwendet werden?
options:
  - label: Einzeln mit Worktrees
    description: Parallele Sub-Gruppen laufen in isolierten Git-Worktrees und werden anschließend zurückgeführt (häufigste Wahl)
  - label: Einzeln
    description: Jedes Finding wird nach Umsetzung einzeln committet
  - label: Keine Commits
    description: Alle Änderungen werden ohne automatische Commits durchgeführt
```

Halte die Antwort fest und gib sie an jeden delegierten Skill als Anweisung weiter:

- **Einzeln mit Worktrees:** Jede parallele Sub-Gruppe arbeitet in einem eigenen Git-Worktree, committet dort die Findings einzeln und der Orchestrator führt die Commits danach sequenziell per `git cherry-pick` in den ursprünglichen Branch zurück. Commit-Messages folgen denselben Regeln wie bei `Einzeln`: konkrete Conventional-Commit-Message, keine internen Finding-IDs, kein `Co-Authored-By`.
- **Einzeln:** Nach jedem abgeschlossenen Finding die Änderungen committen. Verwende eine konkrete Conventional-Commit-Message ohne interne Finding-ID, z. B. `fix: clarify review decision filtering`. Setze **niemals** `Co-Authored-By`-Trailer (auch nicht für LLMs); das gilt für jeden Commit, der durch diesen Workflow oder einen delegierten Sub-Agenten erzeugt wird. Protokolliere die Zuordnung von Finding-ID zu Commit-Hash direkt nach jedem erfolgreichen Commit in der Wisdom-Datei.
- **Keine Commits:** Keine automatischen Commits, der User committet selbst.

#### Stash-Policy

Teil desselben Up-front-Gates: Die Stash-Policy legt vorab fest, wie die Stash-Bereinigung in Phase 6 (Klassen B/C/D) und das Abbruch-Aufräumen in Phase 4.3 mit hinterlassenen Stashes umgehen – ohne spätere Rückfrage. Konkrete Stashes existieren zu Beginn noch nicht; entschieden wird daher die Policy, nicht der Einzelfall.

Wenn `applyReview.stashPolicy` gültig gesetzt ist, überspringe die ASK-Frage und verwende den Wert; melde kurz, dass die Stash-Policy aus `.firmo/config.json` übernommen wurde. Wenn kein gültiger Wert gesetzt ist, frage am selben Gate wie die Commit-Strategie:

```ask
when: kein gültiger Wert für `applyReview.stashPolicy` gesetzt ist
header: Stashes
question: Wie sollen während des Laufs hinterlassene Stashes behandelt werden, wenn eine Entscheidung nötig ist?
options:
  - label: Interaktiv
    description: Pro betroffenem Stash nachfragen (heutiges Verhalten, blockiert autonome Läufe)
  - label: Behalten
    description: Unklare Stashes unverändert behalten und am Ende berichten (sicher für autonome Läufe)
  - label: Verwerfen
    description: Unklare Stashes verwerfen (git stash drop) – möglicher Datenverlust
  - label: Anwenden
    description: Unklare Stashes anwenden (git stash pop); bei Merge-Konflikt wird trotzdem nachgefragt
```

Werte-Zuordnung: Interaktiv → `interactive`, Behalten → `keep`, Verwerfen → `discard`, Anwenden → `apply`. Halte die gewählte Policy in der Wisdom-Datei fest. Für unbeaufsichtigte `/goal`-Läufe ist `keep` der sichere Wert; `interactive` blockiert solche Läufe an Phase 6 und Phase 4.3.

#### Optionaler `/goal`-String

Nachdem Commit-Strategie und Stash-Policy feststehen, gib gemäß „Goal-getriebene Abschlusssteuerung“ den optionalen `/goal`-String aus; er deckt die Phasen 3–8 ab. Der String referenziert die Report-Datei und weist an, die verbleibenden Phasen zu durchlaufen. Bei `stashPolicy != interactive` (empfohlen `keep`) laufen diese Phasen ohne reguläres Approval-Gate; verbleibende Stopps sind nur die konfliktbedingten Eskalationen aus der Phase-Einleitung (`apply`-Merge-Konflikt, risikoreicher Cherry-Pick-Konflikt bei Worktrees, selten ein verwaister Lock).

#### Commit-Mechanik je Strategie

Die detaillierte Mechanik der committenden Strategien – **Einzeln** (Git-Commit-Mutex) und **Einzeln mit Worktrees** (Worktree-Isolation samt Cherry-Pick-Konfliktbewertung) – steht in der internen Teil-Datei `tools/apply-review-commit-mechanics.md`. Lies sie, sobald in Phase 2 die Strategie feststeht und Commits erzeugt werden; bei **Keine Commits** entfällt sie. Die späteren Phasen verweisen für die Detailregeln auf diese Teil-Datei.

### Phase 3: ADR-Erstellung

Für jedes Finding mit „Nicht umsetzen“-Anmerkung:

1. Erstelle `docs/adr/` falls nicht vorhanden.
2. Bestimme die nächste freie ADR-Nummer.
3. Erstelle ein ADR-Dokument:

```markdown
# [Nummer] — [Finding-Titel]

## Status

Nicht umgesetzt

## Kontext

Review-Report: [Report-Dateiname], Finding [R-XXXXXXX]
Workflow: Firmo Apply-Review

## Entscheidung

[Grund aus der Entwickler-Anmerkung]

## Begründung

[Entwickler-Anmerkung vollständig]

## Quell-Finding

[R-XXXXXXX] aus [Report-Dateiname]: [Problem-Beschreibung aus dem Finding]
```

4. Gib dem User eine Statusmeldung über die erstellten ADRs.

### Phase 4: Vorabanalyse und parallele Delegation

Diese Phase besteht aus drei Teilschritten. Ziel: Maximierung der Parallelität, ohne den 1-Commit-pro-Finding-Vertrag zu brechen.

#### Phase 4.1: Vorabanalyse (parallel pro Finding)

Starte für **jedes umsetzbare Finding** einen Vorabanalyse-Sub-Agenten parallel. Diese Sub-Agenten implementieren nichts und ändern keine Dateien — sie analysieren nur.

Jeder Vorabanalyse-Sub-Agent erhält:

- die Finding-Details aus dem Report (ID, Problem, Empfehlung, Datei, Aktion)
- die Entwickler-Anmerkung (falls vorhanden)
- den Auftrag, den Code zu untersuchen und ein strukturiertes Analyse-Ergebnis zu liefern:
  - **Betroffene Dateien:** vollständige Liste aller Dateien, die wahrscheinlich angefasst werden (mehr als nur die im Report genannte primäre Datei).
  - **Root Cause / aktuelles Verhalten** (für `{{SKILL:fix}}` und `{{SKILL:refactor}}`), **Anforderung** (für `{{SKILL:build}}`) bzw. **Dokumentationslücke und Zielgruppe** (für `{{SKILL:docs}}`).
  - **Implementierungsskizze:** kurzer Plan in 2-5 Bullet-Points.
  - **Risiken und Datei-Abhängigkeiten:** mögliche Nebenwirkungen, Kollisionen mit anderen Findings.
  - **Konfidenz:** `Hoch` (Datei-Liste sicher), `Mittel` (Datei-Liste plausibel), `Niedrig` (File-Scope unsicher, z. B. großes Refactoring oder unklare Dependency).
- das Fertig-Protokoll

Schreibe das Ergebnis pro Finding in die Wisdom-Datei unter `## Vorabanalyse [R-XXXXXXX]`. Bei `ABBRUCH` markiere das Finding mit dem Status `fehlgeschlagen (Vorabanalyse)` in der Wisdom-Datei und überspringe es bei den folgenden Schritten. Diese Kennzeichnung erlaubt Phase 6 (Stash-Bereinigung), zwischen Vorabanalyse-Abbrüchen (kein Stash möglich, da nichts implementiert wurde) und Delegations-Abbrüchen (Stash kann existieren) zu unterscheiden.

Verwende einen validen `applyReviewAnalysis`-Cache-Eintrag nur dann, wenn Report-Datei-Hash, Finding-ID und relevante Code-Datei-Hashes zur aktuellen Situation passen. Wenn der Cache nicht eindeutig valide ist, führe die Vorabanalyse neu aus. Aktualisiere den Cache nur nach erfolgreicher Vorabanalyse; schreibe keine User-Entscheidungen oder fehlgeschlagenen Delegationsoutputs in den Cache.

#### Phase 4.2: Sub-Gruppen-Bildung (lokal im Orchestrator)

Für jede Aktionsgruppe (`{{SKILL:fix}}`, `{{SKILL:refactor}}`, `{{SKILL:build}}`, `{{SKILL:docs}}`) bilde Sub-Gruppen anhand der Datei-Listen aus Phase 4.1. Vorgehen explizit zweistufig:

1. **Partitioniere** die Findings der Aktionsgruppe in zwei Mengen:
   - **Konfidenz-Niedrig-Menge:** Findings mit Konfidenz `Niedrig` (File-Scope unsicher).
   - **Rest-Menge:** Findings mit Konfidenz `Hoch` oder `Mittel`.
2. Wende **Union-Find ausschließlich auf die Rest-Menge** an:
   - Initialisiere jedes Finding der Rest-Menge als eigene Sub-Gruppe.
   - Für jeden Datei-Pfad, der von mehr als einem Finding der Rest-Menge genannt wird: vereinige die Sub-Gruppen der beteiligten Findings.
   - Ergebnis: zwei Findings sind genau dann in derselben Sub-Gruppe, wenn sie über eine Kette von Datei-Überlappungen verbunden sind (auch transitiv: teilen A–B und B–C je eine Datei, ohne dass A–C direkt überlappen, landen A, B, C in derselben Sub-Gruppe; auch sternförmig: teilt A je eine Datei mit B und mit C, ohne dass B–C überlappen, landen ebenfalls alle drei in derselben Sub-Gruppe).
3. Füge die **Konfidenz-Niedrig-Menge als eine gemeinsame Safety-Sub-Gruppe** zum Ergebnis hinzu. Diese Gruppe läuft intern sequenziell, weil der File-Scope unsicher ist und parallele Singleton-Streams sonst dieselbe Datei verändern könnten, ohne dass Union-Find den Konflikt erkennt.
4. Reihenfolge innerhalb einer Sub-Gruppe: Reihenfolge wie im Report (deterministisch). Keine Schweregrad-Sortierung — Schweregrade können Abhängigkeiten implizieren.
5. Ergebnis pro Aktionsgruppe: Liste von Sub-Gruppen, jede mit 1-N Findings.

Edge Cases:

- Sind alle Findings einer Aktionsgruppe Konfidenz `Niedrig`, entsteht eine einzelne Safety-Sub-Gruppe mit allen Findings; der Union-Find-Schritt entfällt.
- Hat eine Aktionsgruppe genau ein Finding, ist das Ergebnis immer eine einzelne Sub-Gruppe (mit oder ohne Union-Find).
- Hat eine Aktionsgruppe keine Findings, entsteht keine Sub-Gruppe — der entsprechende Stream in Phase 4.3 entfällt.

Beispiel: Aktionsgruppe `{{SKILL:fix}}` mit fünf Findings:

- F1, F2 betreffen `src/auth.ts` → Sub-Gruppe A (sequenziell)
- F3 betrifft `src/billing.ts` → Sub-Gruppe B (parallel zu A)
- F4, F5 betreffen `src/ui.tsx` → Sub-Gruppe C (parallel zu A und B, intern sequenziell)
  Damit drei parallele Streams in dieser Aktionsgruppe statt einem.

#### Phase 4.3: Parallele Delegation

1. Starte für jede `(Aktionsgruppe × Sub-Gruppe)`-Kombination einen Delegations-Sub-Agenten. Alle laufen parallel; innerhalb eines Sub-Agenten werden seine Findings sequenziell abgearbeitet.
   - Bei Commit-Strategie `Einzeln mit Worktrees`: erstelle vorher pro Sub-Gruppe den Worktree gemäß der Worktree-Regeln und starte den Sub-Agenten mit diesem Worktree als Arbeitsverzeichnis.
2. Jeder Delegations-Sub-Agent erhält im Prompt direkt eingebettet:
   - die Finding-Details (ID, Problem, Empfehlung, Prompt-Vorschlag, Datei)
   - die zugehörige Vorabanalyse aus Phase 4.1 als **inline-Kontext-Block** im Prompt — nicht als Verweis auf die Wisdom-Datei. Die Sub-Skills lesen die Wisdom-Datei nicht; sie verarbeiten nur den Prompt-Inhalt. Bette die Vorabanalyse vollständig ein, etwa unter der Überschrift `Vorabanalyse für dieses Finding:`.
   - die Entwickler-Anmerkung (falls vorhanden)
   - die Commit-Strategie aus Phase 2
   - **Bei Commit-Strategie „Einzeln“:** die vollständige Git-Commit-Mutex-Regel aus `tools/apply-review-commit-mechanics.md`. Der Sub-Agent muss jeden Finding-Commit unter `.firmo/apply-review-commit.lock` ausführen, darf nur Finding-eigene Dateien stage-en und darf niemals `git add .`, `git add -A` oder `git commit -a` verwenden.
   - **Bei Commit-Strategie „Einzeln mit Worktrees“:** die vollständige Git-Worktree-Isolation-Regel aus `tools/apply-review-commit-mechanics.md`. Der Sub-Agent arbeitet ausschließlich im zugewiesenen Worktree, committet dort jedes Finding einzeln und protokolliert Commit-Hashes in der Wisdom-Datei. Der Sub-Agent darf nicht in den ursprünglichen Worktree wechseln.
   - den Auftrag, den passenden Skill aufzurufen:
     - Aktion fix: `Verwende den Skill {{SKILL:fix}} für dieses Finding.`
     - Aktion refactor: `Verwende den Skill {{SKILL:refactor}} für dieses Finding.`
     - Aktion build: `Verwende den Skill {{SKILL:build}} für dieses Finding.`
     - Aktion docs: `Verwende den Skill {{SKILL:docs}} für dieses Finding.`
   - den Prompt-Vorschlag aus dem Report als Aufgabenbeschreibung
   - **Stash-Konvention:** Falls während der Umsetzung dieses Findings irgendein Stash entsteht (durch einen Pre-Commit-Hook, einen manuellen `git stash` im Sub-Skill oder einen Tool-getriggerten Stash), **muss die Stash-Message die Finding-ID enthalten**, z. B. `apply-review R-XXXXXXX <kurze Beschreibung>`. Das ermöglicht der Stash-Bereinigung in Phase 6, den Stash zuverlässig dem Finding zuzuordnen.
   - den Hinweis, dass der Sub-Agent als **nicht-interaktiver** Delegations-Sub-Agent von `/firmo apply-review` läuft und daher die explizite Goal-Abfrage gemäß „Explizite Goal-Abfrage für autonome Läufe“ überspringt: keine Zusatzoption „Autonom via /goal“, kein `/goal`-String. `/firmo apply-review` steuert den autonomen Lauf an seinem eigenen Gate.
   - das Fertig-Protokoll
3. Prüfe jeden Sub-Agenten auf `ERLEDIGT` oder `ABBRUCH`.
4. Bei `ABBRUCH`:
   - User informieren, Finding als `fehlgeschlagen (Delegation)` in der Wisdom-Datei markieren.
   - **Vor dem nächsten Finding derselben Sub-Gruppe:** prüfe via `git status`, ob der Arbeitsbaum sauber ist. Falls uncommittete Änderungen vorhanden sind (halbfertige Datei vom abgebrochenen Finding), räume den Arbeitsbaum gemäß der in Phase 2 festgelegten `stashPolicy` auf, bevor das nächste Finding startet – sonst arbeitet es auf inkonsistentem Zustand:
     - `interactive` → den User fragen, ob die Änderungen gestasht oder verworfen werden sollen.
     - `keep` und `apply` → mit Finding-ID stashen (`git stash push -m "apply-review abort R-XXXXXXX"`); `apply` ist hier nicht sinnvoll, da es ums Saubermachen vor dem nächsten Finding geht, und wird daher wie `keep` behandelt.
     - `discard` → die Änderungen verwerfen.

     Stashe in jedem Fall mit der Finding-ID in der Message, damit Phase 6 den Stash zuordnen kann.

   - Mit dem nächsten Finding innerhalb derselben Sub-Gruppe fortfahren. Andere Sub-Gruppen laufen unabhängig weiter.

5. Gib dem User nach jeder abgeschlossenen Sub-Gruppe eine Statusmeldung mit dem Ergebnis pro Finding.
6. **Synchronisationsbarriere vor Phase 5:** Starte Phase 5 erst, wenn **alle** in Phase 4.3 gestarteten Delegations-Sub-Agenten einen Endstatus geliefert haben (`ERLEDIGT` oder `ABBRUCH`).
7. Bei Commit-Strategie `Einzeln mit Worktrees`: integriere nach der Synchronisationsbarriere alle erfolgreichen Worktree-Branches sequenziell per `git cherry-pick` in den ursprünglichen Branch. Phase 5 darf erst starten, wenn diese Integration abgeschlossen ist oder der Workflow wegen Konflikt/User-Entscheidung angehalten wurde.
8. Eine Statusmeldung nach einer abgeschlossenen Sub-Gruppe ist **keine** Abschlussmeldung des Gesamt-Workflows und **kein** Halt. Nach jeder Statusmeldung prüfst du aktiv, welche Delegations-Sub-Gruppen noch laufen, wartest auf deren Endstatus und setzt Phase 4.3 fort, bis keine Sub-Gruppe mehr offen ist.

#### Bekannte Einschränkungen

- **Cross-Action-Datei-Konflikte** werden nicht erkannt: Findings aus unterschiedlichen Aktionsgruppen wie `{{SKILL:fix}}`, `{{SKILL:refactor}}`, `{{SKILL:build}}` oder `{{SKILL:docs}}` können dieselbe Datei betreffen und parallel laufen. Diese Situation war auch im sequenziellen Vorgängermodell möglich und ist in der Praxis selten. Bei einem Konflikt fängt die Stash-Bereinigung in Phase 6 die hinterlassenen Stashes auf.
- **Konfidenz-Niedrig-Findings** laufen pro Aktionsgruppe in einer gemeinsamen Safety-Sub-Gruppe sequenziell, weil ihr File-Scope unsicher ist.
- Der Git-Commit-Mutex isoliert nur Staging und Commit im ursprünglichen Worktree. Der Worktree-Modus isoliert zusätzlich Arbeitsbaum und Git-Index, verschiebt mögliche Konflikte aber in die sequenzielle Cherry-Pick-Integration.

### Phase 5: Report aktualisieren

**Vorbedingung:** Phase 5 darf erst starten, wenn die Synchronisationsbarriere aus Phase 4.3 erfüllt ist, also keine Delegations-Sub-Gruppe mehr offen ist.

1. Lies die Report-Datei erneut frisch vom Dateisystem ein. Die Datei könnte sich während der Umsetzung geändert haben.
2. Ergänze an jedem erfolgreich umgesetzten Finding als letzten Eintrag:
   `✅ Umgesetzt am YYYY-MM-DD via Firmo Apply-Review`
3. Ergänze an jedem Finding mit ADR als letzten Eintrag:
   `📋 ADR erstellt am YYYY-MM-DD: [ADR-Dateiname]`
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

```ask
header: Stash
question: Wie soll dieser Stash behandelt werden?
options:
  - label: Anwenden und löschen
    description: `git stash pop` ausführen und Inhalt in den Branch übernehmen
  - label: Verwerfen
    description: `git stash drop` ausführen, Inhalt geht verloren
  - label: Behalten
    description: Stash unverändert lassen
```

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
| ADR erstellt | Y |
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
- Delegation (Phase 4.3) parallel pro `(Aktionsgruppe × Sub-Gruppe)`; innerhalb einer Sub-Gruppe sequenziell, damit Datei-Konflikte und Commit-Reihenfolge sauber bleiben
- Nach dem Start der Delegation in Phase 4.3 aktiv auf **alle** Sub-Gruppen-Endstatus warten, bevor Phase 5 beginnt oder der Workflow endet
- Die Report-Datei muss beim Start des Skills frisch vom Dateisystem gelesen werden
- Gib dem User nach jeder Phase eine kurze Statusmeldung
- Wenn ein delegierter Skill fehlschlägt: User informieren, nächstes Finding fortsetzen
- Überspringe bereits umgesetzte Findings (mit ✅) ohne Meldung
- Gib internen Sub-Agenten das Fertig-Protokoll vor
- Schreibe nach jeder abgeschlossenen Phase ein Wisdom-Summary
- Dieser Skill vergibt keine neuen Finding-IDs. Falls zukünftig neue Findings erstellt werden sollen, muss `.firmo/memory.json` gelesen und aktualisiert werden (siehe `{{SKILL:review}}`)
