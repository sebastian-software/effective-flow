---
name: sf-apply-review
description: "Liest eine Review-Report-Datei ein, wertet Entwickler-Anmerkungen aus, erstellt ADRs für abgelehnte Findings und delegiert umsetzbare Findings parallel an {{SKILL:sf-fix}}, {{SKILL:sf-refactor}} oder {{SKILL:sf-build-feature}}."
type: orchestrator
---

# SF Apply Review

Du bist der Orchestrator für die automatisierte Umsetzung von Review-Report-Findings.

## Ziel

Dieser Workflow liest eine bestehende Review-Report-Datei aus `docs/review/` ein, wertet die Entwickler-Anmerkungen pro Finding aus und delegiert die Umsetzung an die passenden Workflows. Findings, die bewusst nicht umgesetzt werden sollen, werden als ADRs dokumentiert.

{{INCLUDE:language-rules}}

{{INCLUDE:task-tracking}}

{{INCLUDE:commit-message-rules}}

## Aufgabenverfolgung im Detail

Zusätzlich zur generischen Regel im obigen Include verlangt dieser Skill **per-Finding-Granularität**, damit der User während des Workflows live sieht, wie viele Findings noch offen sind.

### Task-Struktur

Lege gleich zu Beginn von Phase 1 (nach erfolgreicher Report-Klassifikation) folgende Tasks an:

1. **Phase-Level-Tasks** für jede Workflow-Phase, in der Reihenfolge:
   - „Phase 1: Report einlesen und validieren"
   - „Phase 2: Commit-Strategie festlegen"
   - „Phase 3: ADR-Erstellung"
   - „Phase 4: Vorabanalyse und parallele Delegation"
   - „Phase 5: Report aktualisieren"
   - „Phase 6: Stash-Bereinigung"
   - „Phase 7: Finale Validierung"
   - „Phase 8: Zusammenfassung"
2. **Per-Finding-Tasks** für jedes umsetzbare Finding aus der Klassifikation in Phase 1 (nicht für „Bereits umgesetzt" oder „Nicht umsetzen"-Findings):
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

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie früh im Workflow und beachte ihre Vorgaben.

## Fertig-Protokoll

Wenn du interne Sub-Agenten einsetzt, müssen sie mit `ERLEDIGT` oder `ABBRUCH: [Grund]` enden.

Retry-Eskalation:

1. gleicher Auftrag mit Fortsetzungs-Hinweis
2. vereinfachter Auftrag
3. minimaler Auftrag
4. danach User fragen, wie weiter vorzugehen ist

## Wisdom Accumulation

Verwende `.wisdom-accumulation-<SESSION_ID>.tmp.md` für:

- Stash-Baseline aus Phase 1 (Liste der bereits vorhandenen Stash-Referenzen mit Beschreibungen und Commit-Hashes)
- Vorabanalyse pro Finding aus Phase 4.1 (betroffene Dateien, Root Cause / Anforderung, Implementierungsskizze, Risiken, Konfidenz)
- berechnete Sub-Gruppen aus Phase 4.2
- umgesetzte Findings und deren Ergebnis
- fehlgeschlagene Delegationen
- erzeugte ADRs

Schreibe nach jeder Phase ein Summary und gib es an spätere Phasen weiter. Lösche die Datei am Ende.

## Workflow

### Phase 1: Report einlesen und validieren

1. **Stash-Baseline erfassen:** Führe `git stash list` aus und merke dir die vollständige Liste der bereits vorhandenen Stash-Referenzen (z. B. `stash@{0}`, `stash@{1}`, ... mit ihren Beschreibungen). Halte die Baseline in der Wisdom-Datei fest, damit Phase 6 (Stash-Bereinigung) später neue, durch diesen Workflow entstandene Stashes davon abgrenzen kann. Falls `git stash list` leer ist: notiere „keine Baseline-Stashes".
2. Bestimme die Report-Datei:
   - falls als Argument übergeben: verwende diese Datei
   - sonst: suche nach `review-report-*.md` in `docs/review/`
   - bei mehreren Reports: frage den User welcher verwendet werden soll
   - falls kein Report gefunden: Fehlermeldung und Abbruch
3. **Lies die Datei frisch ein.** Da die Datei zwischen Konversationen gelöscht und neu erstellt werden kann, darf kein zuvor eingelesener Inhalt verwendet werden. Lies die Datei immer direkt vom Dateisystem.
4. Parse alle Findings (`### [R-XXXXXXX] ...`-Blöcke) mit:
   - Finding-ID und Titel
   - Schweregrad
   - Komplexität
   - Aktion (`{{SKILL:sf-fix}}`, `{{SKILL:sf-refactor}}`, `{{SKILL:sf-build-feature}}`)
   - Prompt-Vorschlag
   - Entwickler-Anmerkung (falls vorhanden)
   - Bereits vorhandene Umsetzungshinweise (✅)
5. Klassifiziere jedes Finding:
   - **Bereits umgesetzt:** Finding hat bereits einen ✅-Hinweis → überspringen
   - **Nicht umsetzen:** Entwickler-Anmerkung beginnt mit „Nicht umsetzen" → ADR erstellen
   - **Umsetzen:** Kein ✅-Hinweis und keine ablehnende Anmerkung → an Skill delegieren
   - **Umsetzen mit Kontext:** Entwickler-Anmerkung vorhanden, die nicht mit „Nicht umsetzen" beginnt → an Skill delegieren, Anmerkung als zusätzlichen Kontext mitgeben
6. Gib dem User eine Übersicht:

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

7. Falls keine umsetzbaren Findings vorhanden sind und keine ADRs zu erstellen sind: Kurzmeldung und Abbruch.

### Phase 2: Commit-Strategie

{{ASK}}
header: Commits
question: Soll jedes Finding einen eigenen Git-Commit bekommen?
options:
  - label: Einzeln
    description: Jedes Finding wird nach Umsetzung einzeln committet
  - label: Keine Commits
    description: Alle Änderungen werden ohne automatische Commits durchgeführt
{{/ASK}}

Halte die Antwort fest und gib sie an jeden delegierten Skill als Anweisung weiter:

- **Einzeln:** Nach jedem abgeschlossenen Finding die Änderungen committen. Verwende als Commit-Message das Format: `fix/refactor/feat: [Finding-ID] [Kurzbeschreibung]`. Setze **niemals** `Co-Authored-By`-Trailer (auch nicht für LLMs); das gilt für jeden Commit, der durch diesen Workflow oder einen delegierten Sub-Agenten erzeugt wird.
- **Keine Commits:** Keine automatischen Commits, der User committet selbst.

### Phase 3: ADR-Erstellung

Für jedes Finding mit „Nicht umsetzen"-Anmerkung:

1. Erstelle `docs/adr/` falls nicht vorhanden.
2. Bestimme die nächste freie ADR-Nummer.
3. Erstelle ein ADR-Dokument:

```markdown
# [Nummer] — [Finding-Titel]

## Status

Nicht umgesetzt

## Kontext

Review-Report: [Report-Dateiname], Finding [R-XXXXXXX]
Workflow: /apply-review

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
  - **Root Cause / aktuelles Verhalten** (für `{{SKILL:sf-fix}}` und `{{SKILL:sf-refactor}}`) bzw. **Anforderung** (für `{{SKILL:sf-build-feature}}`).
  - **Implementierungsskizze:** kurzer Plan in 2-5 Bullet-Points.
  - **Risiken und Datei-Abhängigkeiten:** mögliche Nebenwirkungen, Kollisionen mit anderen Findings.
  - **Konfidenz:** `Hoch` (Datei-Liste sicher), `Mittel` (Datei-Liste plausibel), `Niedrig` (File-Scope unsicher, z. B. großes Refactoring oder unklare Dependency).
- das Fertig-Protokoll

Schreibe das Ergebnis pro Finding in die Wisdom-Datei unter `## Vorabanalyse [R-XXXXXXX]`. Bei `ABBRUCH` markiere das Finding mit dem Status `fehlgeschlagen (Vorabanalyse)` in der Wisdom-Datei und überspringe es bei den folgenden Schritten. Diese Kennzeichnung erlaubt Phase 6 (Stash-Bereinigung), zwischen Vorabanalyse-Abbrüchen (kein Stash möglich, da nichts implementiert wurde) und Delegations-Abbrüchen (Stash kann existieren) zu unterscheiden.

#### Phase 4.2: Sub-Gruppen-Bildung (lokal im Orchestrator)

Für jede Aktionsgruppe (`{{SKILL:sf-fix}}`, `{{SKILL:sf-refactor}}`, `{{SKILL:sf-build-feature}}`) bilde Sub-Gruppen anhand der Datei-Listen aus Phase 4.1. Vorgehen explizit zweistufig:

1. **Partitioniere** die Findings der Aktionsgruppe in zwei Mengen:
   - **Konfidenz-Niedrig-Menge:** Findings mit Konfidenz `Niedrig` (File-Scope unsicher).
   - **Rest-Menge:** Findings mit Konfidenz `Hoch` oder `Mittel`.
2. Wende **Union-Find ausschließlich auf die Rest-Menge** an:
   - Initialisiere jedes Finding der Rest-Menge als eigene Sub-Gruppe.
   - Für jeden Datei-Pfad, der von mehr als einem Finding der Rest-Menge genannt wird: vereinige die Sub-Gruppen der beteiligten Findings.
   - Ergebnis: zwei Findings sind genau dann in derselben Sub-Gruppe, wenn sie über eine Kette von Datei-Überlappungen verbunden sind (auch transitiv: teilen A–B und B–C je eine Datei, ohne dass A–C direkt überlappen, landen A, B, C in derselben Sub-Gruppe; auch sternförmig: teilt A je eine Datei mit B und mit C, ohne dass B–C überlappen, landen ebenfalls alle drei in derselben Sub-Gruppe).
3. Füge **jedes Finding aus der Konfidenz-Niedrig-Menge als eigene Sub-Gruppe (Singleton)** zum Ergebnis hinzu — kein Risiko für Datei-Konflikte mit anderen.
4. Reihenfolge innerhalb einer Sub-Gruppe: Reihenfolge wie im Report (deterministisch). Keine Schweregrad-Sortierung — Schweregrade können Abhängigkeiten implizieren.
5. Ergebnis pro Aktionsgruppe: Liste von Sub-Gruppen, jede mit 1-N Findings.

Edge Cases:
- Sind alle Findings einer Aktionsgruppe Konfidenz `Niedrig`, entsteht pro Finding eine Singleton-Sub-Gruppe; der Union-Find-Schritt entfällt.
- Hat eine Aktionsgruppe genau ein Finding, ist das Ergebnis immer eine einzelne Sub-Gruppe (mit oder ohne Union-Find).
- Hat eine Aktionsgruppe keine Findings, entsteht keine Sub-Gruppe — der entsprechende Stream in Phase 4.3 entfällt.

Beispiel: Aktionsgruppe `{{SKILL:sf-fix}}` mit fünf Findings:
- F1, F2 betreffen `src/auth.ts` → Sub-Gruppe A (sequenziell)
- F3 betrifft `src/billing.ts` → Sub-Gruppe B (parallel zu A)
- F4, F5 betreffen `src/ui.tsx` → Sub-Gruppe C (parallel zu A und B, intern sequenziell)
Damit drei parallele Streams in dieser Aktionsgruppe statt einem.

#### Phase 4.3: Parallele Delegation

1. Starte für jede `(Aktionsgruppe × Sub-Gruppe)`-Kombination einen Delegations-Sub-Agenten. Alle laufen parallel; innerhalb eines Sub-Agenten werden seine Findings sequenziell abgearbeitet.
2. Jeder Delegations-Sub-Agent erhält im Prompt direkt eingebettet:
   - die Finding-Details (ID, Problem, Empfehlung, Prompt-Vorschlag, Datei)
   - die zugehörige Vorabanalyse aus Phase 4.1 als **inline-Kontext-Block** im Prompt — nicht als Verweis auf die Wisdom-Datei. Die Sub-Skills lesen die Wisdom-Datei nicht; sie verarbeiten nur den Prompt-Inhalt. Bette die Vorabanalyse vollständig ein, etwa unter der Überschrift `Vorabanalyse für dieses Finding:`.
   - die Entwickler-Anmerkung (falls vorhanden)
   - die Commit-Strategie aus Phase 2
   - den Auftrag, den passenden Skill aufzurufen:
     - Aktion fix: `Verwende den Skill {{SKILL:sf-fix}} für dieses Finding.`
     - Aktion refactor: `Verwende den Skill {{SKILL:sf-refactor}} für dieses Finding.`
     - Aktion build-feature: `Verwende den Skill {{SKILL:sf-build-feature}} für dieses Finding.`
   - den Prompt-Vorschlag aus dem Report als Aufgabenbeschreibung
   - **Stash-Konvention:** Falls während der Umsetzung dieses Findings irgendein Stash entsteht (durch einen Pre-Commit-Hook, einen manuellen `git stash` im Sub-Skill oder einen Tool-getriggerten Stash), **muss die Stash-Message die Finding-ID enthalten**, z. B. `apply-review R-XXXXXXX <kurze Beschreibung>`. Das ermöglicht der Stash-Bereinigung in Phase 6, den Stash zuverlässig dem Finding zuzuordnen.
   - das Fertig-Protokoll
3. Prüfe jeden Sub-Agenten auf `ERLEDIGT` oder `ABBRUCH`.
4. Bei `ABBRUCH`:
   - User informieren, Finding als `fehlgeschlagen (Delegation)` in der Wisdom-Datei markieren.
   - **Vor dem nächsten Finding derselben Sub-Gruppe:** prüfe via `git status`, ob der Arbeitsbaum sauber ist. Falls uncommittete Änderungen vorhanden sind (halbfertige Datei vom abgebrochenen Finding), frage den User, ob diese Änderungen gestasht (`git stash push -m "apply-review abort R-XXXXXXX"`) oder verworfen werden sollen, bevor das nächste Finding startet. Andernfalls würde das nächste Finding auf einem inkonsistenten Zustand arbeiten.
   - Mit dem nächsten Finding innerhalb derselben Sub-Gruppe fortfahren. Andere Sub-Gruppen laufen unabhängig weiter.
5. Gib dem User nach jeder abgeschlossenen Sub-Gruppe eine Statusmeldung mit dem Ergebnis pro Finding.

#### Bekannte Einschränkungen

- **Cross-Action-Datei-Konflikte** werden nicht erkannt: ein `{{SKILL:sf-fix}}`-Finding und ein `{{SKILL:sf-refactor}}`-Finding können dieselbe Datei betreffen und parallel laufen. Diese Situation war auch im sequenziellen Vorgängermodell möglich und ist in der Praxis selten. Bei einem Konflikt fängt die Stash-Bereinigung in Phase 6 die hinterlassenen Stashes auf.
- **Konfidenz-Niedrig-Findings** verzichten bewusst auf Parallelität, um Konflikte zu vermeiden — dafür bleiben sie zuverlässig isoliert.

### Phase 5: Report aktualisieren

1. Lies die Report-Datei erneut frisch vom Dateisystem ein. Die Datei könnte sich während der Umsetzung geändert haben.
2. Ergänze an jedem erfolgreich umgesetzten Finding als letzten Eintrag:
   `✅ Umgesetzt am YYYY-MM-DD via {{SKILL:sf-apply-review}}`
3. Ergänze an jedem Finding mit ADR als letzten Eintrag:
   `📋 ADR erstellt am YYYY-MM-DD: [ADR-Dateiname]`
4. Speichere die aktualisierte Report-Datei.

### Phase 6: Stash-Bereinigung

Während der Delegation in Phase 4 können die aufgerufenen Sub-Skills oder Pre-Commit-Hooks neue Stashes anlegen, die ohne Bereinigung zurückbleiben. Diese Phase findet und behandelt sie.

1. Führe `git stash list` aus und vergleiche das Ergebnis mit der in Phase 1 erfassten Baseline.
2. Bestimme die **neuen Stashes** als alle Einträge, die in der aktuellen Liste, aber nicht in der Baseline vorhanden sind. Vergleiche dabei nicht über `stash@{N}`-Indizes (verschieben sich), sondern über die vollständige Beschreibung (Branch + Commit-Hash + Subject) und idealerweise zusätzlich über die Stash-Commit-Hashes (`git stash list --format='%H %gs'`).
3. Falls keine neuen Stashes gefunden werden: gib kurz „Keine offenen Stashes aus diesem Lauf." aus und gehe zur nächsten Phase.
4. **Stash-Finding-Zuordnung:** Bestimme für jeden neuen Stash das zugehörige Finding über die folgenden Heuristiken — in dieser Priorität:

   1. **Stash-Message-Match (primär):** suche per Regex `R-\d{7}` in der Stash-Message. Bei Treffer ist die Zuordnung eindeutig.
   2. **Datei-Überlappung (Fallback):** falls keine ID in der Message: vergleiche die geänderten Dateien des Stashes (`git stash show --name-only stash@{N}`) mit den in der Wisdom-Datei je Finding protokollierten Dateien. Eine signifikante Überlappung gilt als Zuordnung.
   3. **Keine Zuordnung:** falls weder Message-Match noch klare Datei-Überlappung → der Stash gehört zu keinem Finding aus diesem Lauf (z. B. aus einem externen Pre-Commit-Hook).

5. **Klassifiziere jeden Stash:**

   **A. Finding komplett umgesetzt UND Stash-Inhalt vollständig im Commit für das Finding enthalten:**
   - Lies aus der Wisdom-Datei den Status des zugeordneten Findings. „Komplett umgesetzt" bedeutet: Status `ERLEDIGT` aus Phase 4.3.
   - Hole die Commits, die zu diesem Finding gehören (über die Commit-Strategie „Einzeln" exakt der Commit mit `[R-XXXXXXX]` in der Message; bei „Keine Commits" entfällt dieser Pfad — siehe Klassifikation D unten).
   - Vergleiche `git stash show -p stash@{N}` mit `git show <commit>` für die geänderten Dateien. Wenn der Stash-Diff inhaltlich vollständig im Finding-Commit aufgegangen ist (Stash-Inhalt ist eine Teilmenge der Commit-Änderungen) → **Stash ist Zwischenstand, nicht mehr benötigt**.

   **B. Finding komplett umgesetzt, aber Stash enthält Änderungen, die NICHT im Finding-Commit sind:**
   - Stash könnte vergessenen Teilfix oder ungenutzten Zwischenstand enthalten — User-Entscheidung erforderlich.

   **C. Finding fehlgeschlagen (Status `fehlgeschlagen (Delegation)` oder `fehlgeschlagen (Vorabanalyse)`):**
   - Stash ist potenziell die einzige Spur der Teilarbeit — User-Entscheidung erforderlich.

   **D. Kein Finding zugeordnet ODER Commit-Strategie „Keine Commits":**
   - Bei „Keine Commits" gibt es keinen Commit zum Vergleich → kein Auto-Drop möglich.
   - User-Entscheidung erforderlich.

6. **Behandle jeden Stash anhand seiner Klassifikation:**

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

   Stash-Frage (für die Klassen B, C und D):

{{ASK}}
header: Stash
question: Wie soll dieser Stash behandelt werden?
options:
  - label: Anwenden und löschen
    description: `git stash pop` ausführen und Inhalt in den Branch übernehmen
  - label: Verwerfen
    description: `git stash drop` ausführen, Inhalt geht verloren
  - label: Behalten
    description: Stash unverändert lassen
{{/ASK}}

7. Führe die User-Entscheidung aus:
   - **Anwenden und löschen:** `git stash pop stash@{N}`. Bei Konflikten: User informieren, manuelle Auflösung anbieten, Stash nicht automatisch droppen, bis der Konflikt aufgelöst ist.
   - **Verwerfen:** `git stash drop stash@{N}`.
   - **Behalten:** keine Aktion.
8. Wichtig: nach jeder `pop`/`drop`-Aktion verschieben sich die `stash@{N}`-Indizes. Lies die Liste daher nach jeder Aktion neu und matche über die in Schritt 2 erfasste Beschreibung/den Commit-Hash, nicht über alte Indizes.
9. Gib dem User eine kurze Statusmeldung über alle behandelten Stashes (automatisch verworfen, manuell behandelt, behalten).

### Phase 7: Finale Validierung

1. Prüfe ob im Projekt ein Validierungs-Script konfiguriert ist (z. B. `agent:check`, `typecheck`, `lint` in `package.json`).
2. Falls vorhanden: führe die verfügbaren Prüfungen aus (z. B. `pnpm agent:check`, `pnpm typecheck`, `pnpm lint`).
3. Falls Errors oder Warnings gefunden werden:
   - behebe alle Errors und Warnings
   - führe die Prüfungen erneut aus
   - wiederhole bis alle Prüfungen fehlerfrei durchlaufen
4. Falls in Phase 2 die Commit-Strategie „Einzeln" gewählt wurde und Fixes nötig waren: committe die Fixes mit einer Commit-Message wie `fix: resolve validation errors from final check`.
5. Falls kein Validierungs-Script vorhanden ist: überspringe diese Phase mit kurzer Meldung.
6. Gib dem User eine kurze Statusmeldung über das Ergebnis.

### Phase 8: Zusammenfassung

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
```

## Regeln

- Vorabanalyse (Phase 4.1) immer parallel pro Finding
- Delegation (Phase 4.3) parallel pro `(Aktionsgruppe × Sub-Gruppe)`; innerhalb einer Sub-Gruppe sequenziell, damit Datei-Konflikte und Commit-Reihenfolge sauber bleiben
- Die Report-Datei muss beim Start des Skills frisch vom Dateisystem gelesen werden
- Gib dem User nach jeder Phase eine kurze Statusmeldung
- Wenn ein delegierter Skill fehlschlägt: User informieren, nächstes Finding fortsetzen
- Überspringe bereits umgesetzte Findings (mit ✅) ohne Meldung
- Gib internen Sub-Agenten das Fertig-Protokoll vor
- Schreibe nach jeder abgeschlossenen Phase ein Wisdom-Summary
- Dieser Skill vergibt keine neuen Finding-IDs. Falls zukünftig neue Findings erstellt werden sollen, muss `.sf-memory.json` gelesen und aktualisiert werden (siehe `{{SKILL:sf-review}}`)
