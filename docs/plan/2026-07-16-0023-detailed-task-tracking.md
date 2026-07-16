# 0023: Detailliertere TODO-Listen für apply-review und review

**Planungsstatus:** Umgesetzt

## Anforderung

Bei `sf-apply-review` und `sf-review` ist die TODO-Liste während der Ausführung zu grob. Der User sieht nicht, wie viele Findings (apply-review) bzw. Quellen/Sub-Reviewer (review) noch offen sind. Die Per-Item-Granularität soll als Live-Fortschrittsanzeige dienen.

## Architekturentscheidungen

- **Keine Änderung am shared Include `_shared/task-tracking.md`** — er wird von 16 anderen Skills verwendet, eine Änderung dort würde alle Skills betreffen. Skill-spezifische Granularität gehört in den jeweiligen Skill.
- **Inline-Sektion „Aufgabenverfolgung im Detail“** direkt nach `{{INCLUDE:task-tracking}}` in beiden Skills.
- **sf-apply-review:** Phase-Level-Tasks (1-8) plus Per-Finding-Tasks für jedes umsetzbare Finding. Alle Tasks werden am Ende von Phase 1 nach erfolgreicher Klassifikation angelegt — ein einziger Anlage-Zeitpunkt, klar definiert.
- **sf-review:** Phase-Level-Tasks (1-4), Per-Quelle-Tasks für 2a, ein Task für 2b, **plus** Per-Sub-Reviewer-Tasks für 2c. Anlage zu **zwei** Zeitpunkten: A (am Ende von Phase 1) für Phasen, 2a, 2b; B (zu Beginn von Phase 2c, nach Verzeichnis-Split-Berechnung) für Sub-Reviewer-Tasks. Grund: der Verzeichnis-Split bestimmt erst zur Laufzeit, wie viele Sub-Reviewer benötigt werden.
- **ABBRUCH einzelner Tasks:** trotzdem auf `completed` setzen mit Subject-Suffix `[fehlgeschlagen]`, damit die Liste nicht mit hängenden „in_progress“-Zeilen blockiert.
- **Vorzeitiger Gesamt-Abbruch** (z. B. keine umsetzbaren Findings, Skill-Unterbrechung): alle offenen Tasks auf `completed` mit Suffix `[abgebrochen]`.
- **Phase-2-Aggregat-Lifecycle in sf-review:** Phase-Level-Task „Phase 2“ gilt erst als `completed`, wenn alle drei Streams ERLEDIGT/ABBRUCH gemeldet haben — analog zur Phase-3-Startbedingung.

## Betroffene Dateien

| Datei                                      | Beschreibung                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `skills/sf-apply-review/SKILL.md`          | Neue Sektion „Aufgabenverfolgung im Detail“ mit Phase-Level + Per-Finding-Tasks, Lifecycle-Regeln inkl. ABBRUCH und vorzeitigem Gesamt-Abbruch   |
| `skills/sf-review/SKILL.md`                | Neue Sektion mit zweistufiger Anlage (Zeitpunkt A und B), Per-Quelle/Per-Sub-Reviewer-Tasks, Phase-2-Aggregat-Lifecycle und Gesamt-Abbruch-Regel |
| `docs/plan/0023-detailed-task-tracking.md` | Diese Plan-Datei                                                                                                                                 |

## Implementierungsdetails

### sf-apply-review

- 8 Phase-Level-Tasks (Phase 1-8) plus eine Per-Finding-Task pro umsetzbares Finding.
- Lifecycle: pending bei Anlage in Phase 1; in_progress beim Start der Vorabanalyse (Phase 4.1); completed nach Phase 4.3 ERLEDIGT.
- ABBRUCH: completed mit `[fehlgeschlagen]`.
- Vorzeitiger Gesamt-Abbruch: alle offenen Tasks completed mit `[abgebrochen]`.

### sf-review

- 4 Phase-Level-Tasks (Phase 1-4).
- 6 Per-Quelle-Tasks für 2a + 1 Task für 2b → angelegt bei Zeitpunkt A (Ende Phase 1).
- N Per-Sub-Reviewer-Tasks für 2c → angelegt bei Zeitpunkt B (Beginn Phase 2c, nach Verzeichnis-Split).
- ABBRUCH und Gesamt-Abbruch analog.

### Beispiel — apply-review mit 5 Findings

```
1. Phase 1: Report einlesen und validieren        [completed]
2. Phase 2: Commit-Strategie festlegen            [in_progress]
...
9. Finding R-0000041 umsetzen                     [pending]
10. Finding R-0000042 umsetzen                    [pending]
...
```

### Beispiel — review mit Verzeichnis-Split

```
1. Phase 1: Scope                                    [completed]
2. Phase 2: Parallele Datensammlung                  [in_progress]
3. Phase 3: Aggregation und Designentscheidungs-Filter [pending]
...
12. 2c: Frontend-Review src/components               [in_progress]
13. 2c: Frontend-Review src/pages                    [pending]
14. 2c: Backend-Review src/routes                    [in_progress]
```

## Review-Findings

**Datum:** 2026-05-03
**Reviewer:** feature-dev:code-reviewer (extern)

### Zusammenfassung

| Schweregrad | Anzahl | Behoben | Offen |
| ----------- | ------ | ------- | ----- |
| Kritisch    | 0      | 0       | 0     |
| Wichtig     | 4      | 4       | 0     |
| Hinweis     | 1      | 1       | 0     |

| Komplexität | Anzahl |
| ----------- | ------ |
| Leicht      | 4      |
| Mittel      | 1      |
| Schwer      | 0      |

### Findings

#### [F1] Per-Finding-Tasks-Anlage in sf-apply-review widersprüchlich

- **Schweregrad**: Wichtig
- **Komplexität**: Leicht
- **Bereich**: Interne Konsistenz, Lifecycle-Klarheit
- **Datei**: skills/sf-apply-review/SKILL.md:25-51
- **Problem**: „zu Beginn von Phase 1“ und „vor Phase 4“ wurden nebeneinander erwähnt — beide korrekt, aber als zweideutiger Interpretationsspielraum für einen LLM-Orchestrator.
- **Empfehlung**: Eindeutig auf einen Zeitpunkt konsolidieren: am Ende von Phase 1 nach Klassifikation.
- **Status**: Behoben

#### [F2] Zero-Finding-Edge-Case lässt Tasks hängen

- **Schweregrad**: Wichtig
- **Komplexität**: Leicht
- **Bereich**: Edge Cases, LLM-Orchestrator-Klarheit
- **Datei**: skills/sf-apply-review/SKILL.md:36-38, :119
- **Problem**: Bei vorzeitigem Gesamt-Abbruch (keine Findings, Report nicht gefunden) bleiben angelegte Phase-Level-Tasks auf pending oder in_progress, ohne Cleanup-Regel.
- **Empfehlung**: Lifecycle-Regel ergänzen: alle offenen Tasks auf completed setzen mit Subject-Suffix `[abgebrochen]`.
- **Status**: Behoben

#### [F3] Rekursiver Verzeichnis-Split in sf-review erlaubt keine Phase-1-Anlage der 2c-Tasks

- **Schweregrad**: Wichtig
- **Komplexität**: Mittel
- **Bereich**: LLM-Orchestrator-Klarheit, Edge Cases
- **Datei**: skills/sf-review/SKILL.md:41-44, :55-57, :182-183
- **Problem**: Die ursprüngliche Anweisung „Tasks anlegen, sobald der Scope in Phase 1 bestätigt ist“ widerspricht dem Verzeichnis-Split, der erst in Phase 2c zur Laufzeit berechnet wird.
- **Empfehlung**: Zwei Anlage-Zeitpunkte (A und B) explizit unterscheiden: A am Ende Phase 1 für Phasen + 2a + 2b, B zu Beginn Phase 2c für Sub-Reviewer.
- **Status**: Behoben

#### [F4] Phase-2-Aggregat-Lifecycle in sf-review nicht explizit

- **Schweregrad**: Hinweis
- **Komplexität**: Leicht
- **Bereich**: Lifecycle-Klarheit
- **Datei**: skills/sf-review/SKILL.md:47
- **Problem**: Phase 2 wird als Phase-Level-Task geführt, aber Phase 2 ist erst vollständig, wenn alle drei Streams (2a, 2b, 2c) abgeschlossen sind. Nicht explizit dokumentiert.
- **Empfehlung**: Lifecycle-Hinweis ergänzen, analog zur Phase-3-Startbedingung.
- **Status**: Behoben

#### [F5] ABBRUCH-Handling für Gesamt-Workflow fehlt in sf-review

- **Schweregrad**: Wichtig
- **Komplexität**: Leicht
- **Bereich**: ABBRUCH-Handling, Konsistenz mit sf-apply-review
- **Datei**: skills/sf-review/SKILL.md:48-51
- **Problem**: Per-Sub-Agent-ABBRUCH war abgedeckt; Gesamt-Workflow-Abbruch nicht. Asymmetrisch zu sf-apply-review.
- **Empfehlung**: Analog zu F2 eine Cleanup-Regel ergänzen.
- **Status**: Behoben
