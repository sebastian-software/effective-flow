# 0021: Parallelisierung des Review-Workflows

## Anforderung

`sf-review` soll deutlich schneller werden, ohne Genauigkeit zu verlieren. Da Reviews read-only sind, bietet sich aggressive Parallelisierung an. Speziell: Designentscheidungs-Erkennung pro Quelle parallel, Validator und Reviewer gleichzeitig, und bei großen Codebases zusätzlich Reviewer nach Verzeichnis aufgeteilt — Frontend-/Backend-Reviewer waren bereits parallel und bleiben es.

## Architekturentscheidungen

- **Phasen-Reorganisation in 4 Phasen statt 4 mit anderer Struktur:**
  - Phase 1 verschlankt: nur Scope, Project-Type, Finding-Scope, User-Bestätigung. Designentscheidungs-Erkennung wandert in Phase 2a.
  - Phase 2 enthält drei parallele Streams: 2a (Designentscheidungs-Sammlung pro Quelle parallel), 2b (Validator), 2c (Reviewer mit Verzeichnis-Split).
  - Phase 3: zentrale Aggregation und Designentscheidungs-Filter. Reviewer in 2c führen den Filter NICHT durch (bewusster Trade-off).
  - Phase 4: Bericht schreiben, präsentieren, Wisdom-Datei löschen.
- **Verzeichnis-Split-Heuristik:** > 30 Dateien pro Project-Type-Bucket triggert Split nach Top-Level-Verzeichnis, rekursiv max. 3 Ebenen tief; Fallback für Flat-Repos: alphabetische Blöcke à 30 Dateien.
- **Designentscheidungs-Filter zentral in Phase 3:** spart Tokens und Zeit pro Reviewer; akzeptiert leicht erhöhtes False-Positive-Risiko bei ambigen Fällen, dokumentiert in „Bekannte Einschränkungen".
- **Wisdom-Datei** mit Session-ID als Zwischenspeicher zwischen den parallelen Phase-2-Streams und Phase 3.
- **Explizite Synchronisations-Barriere:** Phase 3 darf erst starten, wenn alle drei Phase-2-Streams `ERLEDIGT`/`ABBRUCH` gemeldet haben.

## Erwarteter Speedup

Beispiel: Fullstack-Repo mit 80 Dateien (40 Frontend, 40 Backend), 5 Designentscheidungs-Quellen.

- Heute: ~20 Einheiten sequenziell.
- Mit Plan: ~9 Einheiten → **~55% Speedup**.

Bei kleinen Repos (< 30 Dateien): primärer Speedup aus Phase 2a/2b/2c-Parallelität → ~30%.

## Betroffene Dateien

| Datei                                  | Beschreibung                                                                                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/sf-review/SKILL.md`            | Phasen-Reorganisation: Phase 1 schlank, neue Phase 2 mit 2a/2b/2c parallel, Phase 3 mit zentralem Filter, Phase 4 Bericht; Wisdom-Sektion eingeführt; Bekannte-Einschränkungen-Block ergänzt; Header-Sections vereinfacht |
| `docs/plan/0021-review-parallelism.md` | Diese Plan-Datei                                                                                                                                                                                                          |

## Implementierungsdetails

### Phase 1 — Scope

- Reduziert auf Argumente lesen, Scope bestimmen, Project-Type erkennen, Finding-Scope wählen, User-Bestätigung.
- Session-ID am Anfang erzeugen für die Wisdom-Datei.

### Phase 2 — Parallele Datensammlung

**2a — Designentscheidungs-Sammlung:** ein Sub-Agent pro Quelle (ADR / Plan / Konventionen / Code-Kommentare / Lint-Suppressions / vorherige Reviews) — alle parallel. Output unter `## Designentscheidungen` in der Wisdom-Datei mit Sub-Sektionen pro Quelle.

**2b — Technische Validierung:** `sf-code-validator` im Check-Modus. Output unter `## Technische Befunde`.

**2c — Qualitäts-Review:** Reviewer-Auswahl pro Project-Type, Verzeichnis-Split bei > 30 Dateien (max. 3 Rekursionsebenen, Fallback für Flat-Repos), Reviewer-Auftrag ohne Designentscheidungs-Prüfung. Output unter `## Reviewer-Findings` mit Sub-Sektionen pro Sub-Reviewer.

### Phase 3 — Aggregation und Designentscheidungs-Filter

- Vorbedingung: alle drei 2x-Streams abgeschlossen.
- Aggregation, Qualitätsprüfung (Konfidenz, Duplikate, Schweregrad).
- Zentraler Designentscheidungs-Filter — einziger Ort für DD-Abgleich.
- Aktion-Bestimmung pro Finding (`sf-fix` / `sf-refactor` / `sf-build-feature`).
- Prompt-Vorschläge formulieren.

### Phase 4 — Bericht

- Bericht-Datei `docs/review/review-report-YYYY-MM-DD[-N].md` schreiben.
- Hinweis-Findings beim Standard-Scope ausfiltern.
- User-Präsentation.
- Wisdom-Datei löschen.

## Review-Findings

**Datum:** 2026-05-03
**Reviewer:** feature-dev:code-reviewer (extern)

### Zusammenfassung

| Schweregrad | Anzahl | Behoben | Offen |
| ----------- | ------ | ------- | ----- |
| Kritisch    | 1      | 1       | 0     |
| Wichtig     | 3      | 3       | 0     |
| Hinweis     | 1      | 1       | 0     |

| Komplexität | Anzahl |
| ----------- | ------ |
| Leicht      | 4      |
| Mittel      | 1      |
| Schwer      | 0      |

### Findings

#### [F1] Wisdom-Datei-Lifecycle: Phase-3-Aggregation kann starten bevor alle Phase-2-Writes abgeschlossen sind

- **Schweregrad**: Kritisch
- **Komplexität**: Mittel
- **Bereich**: Wisdom Accumulation / Phase 2-3 Synchronisation
- **Datei**: skills/sf-review/SKILL.md:103, :156
- **Problem**: Phase 2 startet drei gleichzeitige Streams (2a, 2b, 2c). Phase 3 setzt implizit voraus, dass alle drei abgeschlossen sind, ohne explizite Join-Bedingung. Ein LLM-Orchestrator könnte opportunistisch früher mit Phase 3 beginnen.
- **Empfehlung**: Explizite Join-Barriere zu Beginn von Phase 3: „Starte Phase 3 erst, wenn alle drei Phase-2-Streams `ERLEDIGT` (oder `ABBRUCH`) gemeldet haben."
- **Status**: Behoben

#### [F2] Verzeichnis-Split-Heuristik deckt Flat-Repos und unklares Rekursionsende nicht ab

- **Schweregrad**: Wichtig
- **Komplexität**: Leicht
- **Bereich**: Phase 2c — Verzeichnis-Split-Heuristik
- **Datei**: skills/sf-review/SKILL.md:140
- **Problem**: Bei Flat-Repos (alle Dateien direkt in einem Root-Verzeichnis) gibt es keine Top-Level-Verzeichnisse zum Splitten. Außerdem ist die maximale Rekursionstiefe nicht explizit definiert.
- **Empfehlung**: Maximale Rekursionstiefe von 3 Ebenen festlegen + Fallback-Regel: alphabetische Blöcke von je ≤ 30 Dateien.
- **Status**: Behoben

#### [F3] Verlust der Designentscheidungs-Awareness in Reviewern erhöht False-Positive-Risiko

- **Schweregrad**: Wichtig
- **Komplexität**: Mittel
- **Bereich**: Phase 2c — Reviewer-Auftrag / Phase 3 — Designentscheidungs-Filter
- **Datei**: skills/sf-review/SKILL.md:144, :164-168
- **Problem**: Reviewer kennen keine Designentscheidungen mehr. Bei „Unsicherheit (teilweise Überlappung)" bleibt das Finding im Bericht — ohne Reviewer-Kontext, was die False-Positive-Rate erhöhen kann.
- **Empfehlung**: Bewusster Trade-off — als „Bekannte Einschränkung" dokumentieren, statt den Reviewer-Auftrag wieder komplexer zu machen.
- **Status**: Behoben

#### [F5] Bekannte Einschränkungen unvollständig

- **Schweregrad**: Hinweis
- **Komplexität**: Leicht
- **Bereich**: Bekannte Einschränkungen
- **Datei**: skills/sf-review/SKILL.md:239-241
- **Problem**: Block nennt nur den Verzeichnis-Split-Trade-off, schweigt über Reviewer-DD-Kontext-Verlust und Phase-3-Synchronisation.
- **Empfehlung**: Zwei zusätzliche Punkte ergänzen.
- **Status**: Behoben (deckt F3 mit ab)

#### [F6] Session-ID-Erzeugung für Wisdom-Datei nicht dokumentiert

- **Schweregrad**: Wichtig
- **Komplexität**: Leicht
- **Bereich**: Wisdom Accumulation
- **Datei**: skills/sf-review/SKILL.md:72
- **Problem**: `<SESSION_ID>` wird referenziert, aber nicht erklärt. Bei parallelen Review-Runs könnten Wisdom-Dateien kollidieren.
- **Empfehlung**: Session-ID-Erzeugung am Anfang von Phase 1 dokumentieren (Timestamp `date +%Y%m%d%H%M%S`).
- **Status**: Behoben
