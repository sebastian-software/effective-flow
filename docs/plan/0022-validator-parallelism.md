# 0022: Parallelisierung des Code-Validators

**Planungsstatus:** Umgesetzt

## Anforderung

`sf-code-validator` schneller machen, ohne Genauigkeit zu verschlechtern. Drei Prüfungen (TypeScript, Linting, Build) liefen bisher sequenziell, obwohl sie read-only und unabhängig sind. Speedup soll durch Parallelisierung, Cache-Awareness und Monorepo-Orchestrator-Nutzung erreicht werden — keine Prüfung wird gestrichen oder gekürzt.

## Architekturentscheidungen

- **Parallele Ausführung der drei Prüfungen:** TypeScript, Lint, Build laufen über `run_in_background: true` gleichzeitig. Aktive Wartelogik mit Timeout (120 s) sammelt Outputs, deterministische Sektions-Reihenfolge im Bericht.
- **Cache-Awareness ohne Konfigurations-Änderung:** Der Validator nutzt vorhandene Caches (Composite-TypeScript, ESLint-Cache aus dem Script, Monorepo-Orchestratoren), modifiziert aber keine Skripte oder Configs. CLI-Flags wie `--build` oder `--cache` werden nur dann ergänzt, wenn die Voraussetzung (`composite: true` bzw. existierender Flag im Script) klar erfüllt ist.
- **Monorepo-Priorität:** Bei mehreren verfügbaren Orchestratoren feste Reihenfolge — `turbo`/`nx` zuerst, dann Top-Level-Script, dann `pnpm -r`. Nie zwei gleichzeitig starten.
- **Graceful-Degradation für fehlende Skripte:** Wenn ein Script nicht existiert, Sektion als `ÜBERSPRUNGEN` markieren statt direkten Tool-Aufruf — verhindert, dass haiku-Modelle eigenmächtig `tsc`/`eslint` direkt aufrufen.
- **Race-Condition-Fallback mit konkreten Erkennungssignalen:** Erkennung über stdout/stderr-Strings (`EBUSY`, `lock`, `cache conflict` etc.) und Mehrfach-Failures, nicht über vage „Beobachtung“.
- **Cross-Section-Korrelation im Aggregations-Schritt:** Build- und TypeScript-Fehler, die dieselbe Datei betreffen, werden im Build-Abschnitt referenziert statt dupliziert.
- **Bewusste Verzichte:** Kein File-Scoped-Lint/TypeCheck (Cross-File-Issues könnten verfehlt werden), kein Build-Skip (Bundling-Fehler bleiben sichtbar), keine eigenmächtige Cache-Aktivierung.

## Erwarteter Speedup

Beispiel-Repo: TypeCheck 30 s, Lint 15 s, Build 60 s.

- **Heute (sequenziell):** 105 s.
- **Mit Parallelisierung:** max(30, 15, 60) = 60 s → ~43% schneller.
- **Mit Cache-Hits bei Re-Run:** ~10 s → ~90% schneller bei iterativen Fix-Zyklen.
- **Monorepo mit 4 Packages und Top-Level-Orchestrator:** zusätzlich ~75% schneller als sequenziell pro Package.

## Betroffene Dateien

| Datei                                     | Beschreibung                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/sf-code-validator/SKILL.md`       | Vorgehen-Sektion auf parallele Ausführung mit `run_in_background: true` umgestellt; neue Aggregations-Sub-Sektion mit Wartelogik, Timeout, deterministischer Reihenfolge und Cross-Section-Korrelation; Cache-Awareness präzisiert mit konkreten Voraussetzungen; Monorepo-Orchestrator-Prioritätsreihenfolge; Graceful-Degradation-Regel für fehlende Skripte; Race-Condition-Erkennungssignale im Regel-Block |
| `docs/plan/0022-validator-parallelism.md` | Diese Plan-Datei                                                                                                                                                                                                                                                                                                                                                                                                |

## Implementierungsdetails

### Vorgehen-Schritte

- Schritt 2: explizite Skip-Regel für fehlende Skripte → Sektion `ÜBERSPRUNGEN`, keine Direkt-Aufrufe.
- Schritt 3: Parallele Hintergrund-Bash-Aufrufe pro Prüfung; Non-Blocking-Failure-Regel.
- Schritt 4: Cache-Awareness mit klaren Voraussetzungen (`composite: true`, vorhandene Flags).
- Schritt 5: Monorepo-Orchestrator-Priorität (turbo/nx → Top-Level-Script → `pnpm -r`).

### Aggregations-Sektion

- Aktive Wartelogik: alle drei Prozesse abwarten, dann Bericht.
- Timeout: 120 s pro Prüfung → `TIMEOUT`-Markierung.
- Deterministische Reihenfolge: TypeScript → Linting → Build.
- Cross-Section-Korrelation: gleiche Datei/Symbol → im Build-Abschnitt referenzieren.

### Regeln

- Drei Hauptprüfungen immer parallel.
- Vorhandene Caches nutzen, keine Config-Änderung.
- Race-Condition-Fallback mit konkreten Symptom-Strings.

## Review-Findings

**Datum:** 2026-05-03
**Reviewer:** feature-dev:code-reviewer (extern)

### Zusammenfassung

| Schweregrad | Anzahl | Behoben | Offen |
| ----------- | ------ | ------- | ----- |
| Kritisch    | 1      | 1       | 0     |
| Wichtig     | 4      | 4       | 0     |
| Hinweis     | 1      | 1       | 0     |

| Komplexität | Anzahl |
| ----------- | ------ |
| Leicht      | 4      |
| Mittel      | 2      |
| Schwer      | 0      |

### Findings

#### [F1] Race-Condition-Kriterium zu vage für haiku-Modell

- **Schweregrad**: Kritisch
- **Komplexität**: Leicht
- **Bereich**: Regeln / Fallback-Logik
- **Datei**: skills/sf-code-validator/SKILL.md:95
- **Problem**: Die ursprüngliche Regel sagte „bei beobachteten Race-Conditions“ — ein haiku-Modell kann das nicht operationalisieren, weil ihm nur stdout/stderr und Exit-Codes zur Verfügung stehen.
- **Empfehlung**: Erkennungssignale konkret als String-Matches und Failure-Patterns formulieren (`EBUSY`, `lock`, `cache conflict`, mehrere parallele Failures trotz vorheriger Einzel-Erfolge).
- **Status**: Behoben

#### [F2] Fehlende Graceful-Degradation für fehlende Scripts

- **Schweregrad**: Wichtig
- **Komplexität**: Leicht
- **Bereich**: Vorgehen / Edge Cases
- **Datei**: skills/sf-code-validator/SKILL.md:50-65
- **Problem**: Bei fehlendem Lint- oder Build-Script war unklar, ob das Modell direkt `tsc`/`eslint` aufruft oder die Sektion überspringt — haiku-Modelle tendieren zu halluzinierten Direktaufrufen.
- **Empfehlung**: Explizite Regel: Sektion als `ÜBERSPRUNGEN` markieren, keine Direkt-Aufrufe ohne User-Genehmigung.
- **Status**: Behoben

#### [F3] Konkurrierende Monorepo-Orchestratoren ohne Priorisierungsregel

- **Schweregrad**: Wichtig
- **Komplexität**: Leicht
- **Bereich**: Monorepo-Parallelität
- **Datei**: skills/sf-code-validator/SKILL.md:62
- **Problem**: Wenn ein Repo sowohl `turbo.json` als auch ein Top-Level-Script besitzt, hatte der Validator keine Vorgabe, welcher Orchestrator verwendet werden soll — Risiko: zwei gleichzeitige Orchestratoren mit Cache-Konflikten.
- **Empfehlung**: Feste Priorität: `turbo`/`nx` → Top-Level-Script → `pnpm -r`. Nie zwei gleichzeitig.
- **Status**: Behoben

#### [F4] Cache-Awareness ermöglicht implizite Argument-Änderungen

- **Schweregrad**: Wichtig
- **Komplexität**: Mittel
- **Bereich**: Cache-Awareness
- **Datei**: skills/sf-code-validator/SKILL.md:57-61
- **Problem**: Formulierungen wie „`tsc --build` für inkrementelles Type-Checking" ohne Voraussetzungs-Check würden ein haiku-Modell verleiten, `--build` blind anzuhängen — was bei nicht-composite Projekten direkt fehlschlägt. Ähnliches Risiko bei `eslint --cache`.
- **Empfehlung**: Voraussetzungen explizit machen (`composite: true`-Check für `--build`, vorhandener Flag im Script für `--cache`); ansonsten Skript unverändert lassen.
- **Status**: Behoben

#### [F5] Aggregations-Wartelogik ungenügend definiert

- **Schweregrad**: Wichtig
- **Komplexität**: Mittel
- **Bereich**: Aggregation
- **Datei**: skills/sf-code-validator/SKILL.md:66-68
- **Problem**: Nach `run_in_background: true` startet das Modell die Prozesse, aber es war nicht spezifiziert, wie es auf alle warten soll — Risiko, dass der Bericht vor Abschluss der Prozesse geschrieben wird. Auch kein Timeout für hängende Prozesse.
- **Empfehlung**: Aktive Wartelogik vor Bericht-Erstellung; Timeout 120 s pro Prüfung mit `TIMEOUT`-Markierung.
- **Status**: Behoben

#### [F6] Verlust der sequenziellen Korrelation zwischen TypeScript- und Build-Fehlern

- **Schweregrad**: Hinweis
- **Komplexität**: Leicht
- **Bereich**: Vollständigkeit gegenüber dem alten Workflow
- **Datei**: skills/sf-code-validator/SKILL.md:48-65
- **Problem**: Im sequenziellen Modell konnte das Modell Build-Fehler im Kontext zuvor gesehener TypeScript-Fehler interpretieren. Bei Parallelität fehlt diese implizite Korrelation, ohne expliziten Hinweis.
- **Empfehlung**: Cross-Section-Korrelation in der Aggregations-Sektion: gleiche Datei/Symbol → im Build-Abschnitt auf TypeScript-Fehler verweisen statt duplizieren.
- **Status**: Behoben
