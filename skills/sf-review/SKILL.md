---
name: sf-review
description: "Orchestriert ein umfassendes Code-Review: Scope-Bestimmung, Designentscheidungs-Erkennung, technische Validierung, fachliches Review, Findings-Qualitätsprüfung und Berichtserstellung mit Prompt-Vorschlägen für {{SKILL:sf-fix}}, {{SKILL:sf-refactor}} oder {{SKILL:sf-build-feature}}."
type: orchestrator
---

# SF Review

Du bist der Orchestrator für umfassende Code-Reviews.

## Ziel

Dieser Workflow analysiert Code-Qualität und erstellt einen strukturierten Bericht, dessen Findings direkt als Input für `{{SKILL:sf-fix}}`, `{{SKILL:sf-refactor}}` und `{{SKILL:sf-build-feature}}` dienen können.

{{INCLUDE:language-rules}}

{{INCLUDE:task-tracking}}

## Aufgabenverfolgung im Detail

Zusätzlich zur generischen Regel im obigen Include verlangt dieser Skill **per-Quelle- und per-Sub-Reviewer-Granularität**, damit der User während des Workflows live sieht, welche Streams und Sub-Agenten noch laufen.

### Task-Struktur

Tasks werden an **zwei** Zeitpunkten angelegt, weil der Verzeichnis-Split in Phase 2c die Anzahl der Sub-Reviewer erst zur Laufzeit bestimmt:

**Zeitpunkt A — direkt nach Scope-Bestätigung am Ende von Phase 1:**

1. **Phase-Level-Tasks:**
   - „Phase 1: Scope"
   - „Phase 2: Parallele Datensammlung"
   - „Phase 3: Aggregation und Designentscheidungs-Filter"
   - „Phase 4: Bericht"
2. **Per-Quelle-Tasks für Phase 2a** (eine pro Designentscheidungs-Quelle):
   - „2a: ADR-Quelle durchsuchen"
   - „2a: Plan-Quelle durchsuchen"
   - „2a: Konventionen-Quelle durchsuchen"
   - „2a: Code-Kommentar-Quelle durchsuchen"
   - „2a: Lint-Suppressions durchsuchen"
   - „2a: Vorherige Reviews durchsuchen"
3. **Ein Task für Phase 2b:**
   - „2b: Technische Validierung"

**Zeitpunkt B — zu Beginn von Phase 2c, nachdem die Verzeichnis-Split-Heuristik die Sub-Reviewer-Aufteilung bestimmt hat, aber **bevor** der erste Sub-Reviewer gestartet wird:**

4. **Per-Sub-Reviewer-Tasks für Phase 2c** (1 bis N je nach Verzeichnis-Split):
   - Bei einzelnem Reviewer pro Project-Type-Bucket: z. B. „2c: Frontend-Review" oder „2c: Backend-Review"
   - Bei Verzeichnis-Split: pro Sub-Reviewer ein eigener Task mit dem Verzeichnis im Subject, z. B. „2c: Frontend-Review src/components", „2c: Backend-Review src/routes"
   - Bei rekursivem Split: pro Sub-Sub-Reviewer ein Task mit dem tieferen Pfad im Subject, z. B. „2c: Frontend-Review src/components/forms".

### Lifecycle der Tasks

- **Phase-Level-Tasks:** vor Phase-Start auf `in_progress`, nach Abschluss auf `completed`. Phase 1 ist beim Anlegen der Tasks bereits aktiv → setze sie direkt auf `in_progress` und nach Abschluss von Phase 1 auf `completed`.
- **Per-Quelle-/Per-Sub-Reviewer-Tasks:**
  - `in_progress`: beim Start des jeweiligen Sub-Agenten in Phase 2.
  - `completed`: bei `ERLEDIGT` des Sub-Agenten.
  - **Bei `ABBRUCH`:** trotzdem auf `completed` setzen, Subject um `[fehlgeschlagen]` ergänzen.
- **Phase-2-Aggregat-Lifecycle:** Der Phase-Level-Task „Phase 2" gilt erst als `completed`, wenn alle drei Streams (2a, 2b, 2c) `ERLEDIGT` oder `ABBRUCH` gemeldet haben — analog zur Phase-3-Startbedingung.
- **Bei vorzeitigem Gesamt-Abbruch** (z. B. Skill wird unterbrochen, mehrere kritische Sub-Agenten brechen ab und der Workflow kann nicht in Phase 3 fortgesetzt werden): alle noch offenen `pending`- und `in_progress`-Tasks auf `completed` setzen und ihre Subjects mit `[abgebrochen]` ergänzen, bevor der Skill mit `ERLEDIGT` oder `ABBRUCH` endet.

### Wichtig

- Tasks gemäß Zeitpunkt A und B oben anlegen, damit der User vor jedem Start der relevanten Sub-Agenten die volle Liste sieht.
- Aktualisiere Tasks zeitnah, sobald ein Sub-Agent meldet — nicht gebatched.

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor dem Review und behandle ihre Vorgaben als zusätzlichen Review-Kontext für Scope, Konventionen, Designentscheidungen und Qualitätskriterien.

## Scope-Bestimmung

- Ohne Argumente: prüfe auf uncommitted Changes; falls vorhanden, reviewe nur diese, sonst den gesamten Code
- Mit Argumenten: nur der beschriebene Bereich

## Finding-Scope

Der Standard-Finding-Scope ist **nur kritische und wichtige Findings**. Hinweise werden nur dann in den Bericht aufgenommen, wenn der User explizit ein umfassendes oder vollständiges Review verlangt (z. B. „umfassendes Review", „alle Findings", „inklusive Hinweise").

Weise den User zu Beginn kurz darauf hin, dass standardmässig nur kritische und wichtige Findings berichtet werden und ein umfassendes Review auf Wunsch möglich ist.

Verwende den aktiven Finding-Scope als Filter für Reviewer-Auftrag, Aggregation, Bericht und Zusammenfassung.

## Fertig-Protokoll

Wenn interne Sub-Agenten verwendet werden, gilt `ERLEDIGT` / `ABBRUCH: [Grund]` mit Retry-Eskalation wie in den anderen Workflows.

## Designentscheidungs-Erkennung

Der Review-Workflow erkennt dokumentierte Designentscheidungen, damit Findings gegen bewusste Entscheidungen nicht fälschlich als Probleme gemeldet werden. Die Quellen werden in Phase 2a parallel durchsucht; der Abgleich mit Findings erfolgt zentral in Phase 3.

## Projekt-Typ-Erkennung und Routing

Projekt-Typ-Erkennung wie bei `{{SKILL:sf-build-feature}}`. Das Reviewer-Routing samt Verzeichnis-Split-Heuristik ist in Phase 2c definiert.

## Memory-Datei

Die Datei `.sf-memory.json` im Projekt-Root speichert persistente Zustände über Sessions hinweg. Im Gegensatz zur Wisdom-Datei wird sie nie gelöscht.

### Inhalt

```json
{
  "lastFindingNumber": 42
}
```

### Git-Tracking

Ob `.sf-memory.json` eingecheckt oder ignoriert wird, entscheidet das jeweilige Projekt selbst. Der Skill ändert keine `.gitignore`-Dateien.

### Verwendung

1. Lies `.sf-memory.json` beim Start des Review-Workflows. Falls die Datei nicht existiert, starte mit `lastFindingNumber: 0`.
2. Nummeriere neue Findings fortlaufend ab `lastFindingNumber + 1` mit 7-stelliger Formatierung: `R-0000001`, `R-0000002`, ...
3. Schreibe nach Erstellung des Berichts die höchste vergebene Finding-Nummer zurück in `.sf-memory.json`. Die Memory-Datei muss geschrieben werden, bevor der Workflow mit `ERLEDIGT` abgeschlossen wird. Falls der Schreibvorgang fehlschlägt, weise den User darauf hin.

## Wisdom Accumulation

Erzeuge zu Beginn von Phase 1 eine Session-ID (z. B. via Timestamp `date +%Y%m%d%H%M%S`) und verwende sie konsistent für die Wisdom-Datei `.wisdom-accumulation-<SESSION_ID>.tmp.md`. Das verhindert Kollisionen, falls mehrere Review-Runs parallel laufen.

Die Wisdom-Datei transportiert die Outputs der parallelen Phase-2-Streams zwischen den Phasen:

- gesammelte Designentscheidungen aus Phase 2a (pro Quelle ein Block)
- technische Befunde aus Phase 2b
- Reviewer-Findings aus Phase 2c (pro Sub-Reviewer ein Block)

Lösche die Datei am Ende des Workflows, vor `ERLEDIGT`.

## Workflow

### Phase 1: Scope

1. Lies die Argumente.
2. Ohne Argumente:
   - prüfe `git diff --name-only`
   - prüfe `git diff --cached --name-only`
   - falls Änderungen vorhanden: reviewe nur diese Dateien
   - sonst den gesamten Code
3. Untersuche Projektstruktur und Projekt-Typ.
4. Bestimme den finalen Review-Scope (konkrete Datei-Liste oder Verzeichnis-Beschreibung).
5. Bestimme den aktiven Finding-Scope: Standard ist nur kritisch+wichtig, es sei denn, der User hat explizit ein umfassendes Review verlangt.
6. Hole User-Bestätigung ein, wenn Scope oder Review-Ziel unklar ist.

{{ASK}}
header: Review-Scope
question: Review-Scope bestätigt?
type: approval
{{/ASK}}

### Phase 2: Parallele Datensammlung

Diese Phase besteht aus drei unabhängigen Streams, die alle gleichzeitig gestartet werden müssen — kein Stream wartet auf einen anderen. Schreibe die Outputs jeweils in die Wisdom-Datei.

#### Phase 2a: Designentscheidungs-Sammlung (parallel pro Quelle)

Starte für jede der folgenden Quellen einen eigenen Sub-Agenten **parallel**. Jeder Sub-Agent durchsucht nur seine Quelle:

- ADR — `docs/decisions/`, `docs/adr/`, `adr/`, `*.adr.md`
- Planungs-Dateien — `docs/plan/`, `plans/`
- Konventions-Dateien — `CLAUDE.md`, `AGENTS.md`, vergleichbare Konventionsdateien
- Code-Kommentare — `@design-decision`, `DELIBERATE`, `INTENTIONAL`, `DESIGN:`
- Lint-Suppressions mit Begründung — `eslint-disable ... -- [Grund]`, `@ts-expect-error [Grund]`
- Vorherige Review-Reports — `docs/review/review-report-*.md`

Jeder Sub-Agent liefert eine Liste von Designentscheidungen im Format:

```text
- [DD-001] [Quelle] [Bereich/Datei]: [Zusammenfassung]
```

Falls eine Quelle leer ist: Liste mit „keine gefunden" abschließen.

Schreibe alle Ergebnisse in die Wisdom-Datei unter `## Designentscheidungen` mit Sub-Sektionen pro Quelle.

#### Phase 2b: Technische Validierung

1. Starte `{{AGENT:sf-code-validator}}` im Check-Modus (TypeScript, Lint, Build, keine Fixes).
2. Sammle technische Probleme in der Wisdom-Datei unter `## Technische Befunde`.

#### Phase 2c: Qualitäts-Review

1. **Reviewer-Auswahl pro Project-Type:**
   - Frontend → `{{AGENT:sf-frontend-reviewer}}`
   - Backend / CLI / Node.js → `{{AGENT:sf-nodejs-reviewer}}`
   - Fullstack → beide
2. **Verzeichnis-Split-Heuristik** (pro Project-Type-Bucket im Scope):
   - Zähle die Dateien im Scope für diesen Bucket.
   - **≤ 30 Dateien:** ein Reviewer-Sub-Agent für den ganzen Bucket.
   - **> 30 Dateien:** Splitte den Scope nach Top-Level-Verzeichnis (z. B. `src/components/`, `src/pages/`, `src/lib/` für Frontend; `src/routes/`, `src/services/`, `src/middleware/` für Backend). Pro Top-Level-Verzeichnis ein eigener Reviewer-Sub-Agent. Falls ein Top-Level-Verzeichnis weiterhin > 30 Dateien hat: rekursiv eine Ebene tiefer splitten — maximal **3 Rekursionsebenen** ab dem ersten Split.
   - **Fallback bei Flat-Repos:** Falls keine Sub-Verzeichnisse existieren, alle Dateien direkt im Root-Scope liegen oder die maximale Rekursionsebene erreicht ist und ein Bucket weiterhin > 30 Dateien enthält: teile die Datei-Liste in alphabetische Blöcke von je ≤ 30 Dateien auf und weise jedem Block einen eigenen Reviewer-Sub-Agenten zu.
3. **Auftrag an jeden Reviewer-Sub-Agenten:**
   - umfassendes Review der zugewiesenen Dateien
   - beachte den aktiven Finding-Scope
   - **keine Designentscheidungs-Prüfung im Reviewer** — die Designentscheidungen werden zentral in Phase 3 abgeglichen, das hält den Reviewer-Auftrag schlank
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
2. Findings-Qualitätsprüfung:
   - Konfidenz < 80 herausfiltern
   - Duplikate entfernen (gleicher Bereich, gleiche Datei+Zeile, ähnliches Problem)
   - Schweregrad-Konsistenz prüfen
   - Findings ausserhalb des aktiven Finding-Scopes aus dem Hauptbericht herausfiltern
3. **Zentraler Designentscheidungs-Filter** (das ist der einzige Ort, an dem Designentscheidungen gegen Findings abgeglichen werden):
   - Lies alle in `## Designentscheidungen` aus der Wisdom-Datei gesammelten Einträge.
   - Prüfe jedes verbleibende Finding einzeln, ob es durch eine dokumentierte Designentscheidung abgedeckt ist.
   - Bei Treffer: Finding aus dem Hauptbericht entfernen und in die Tabelle „Übersprungene Findings (Designentscheidungen)" verschieben mit Quellenangabe.
   - Bei Unsicherheit (teilweise Überlappung): Finding im Bericht belassen, aber mit Hinweis auf die möglicherweise relevante Designentscheidung versehen.
4. Bestimme für jedes verbleibende Finding die Folgeaktion:
   - Defekt → `{{SKILL:sf-fix}}`
   - strukturelles Problem → `{{SKILL:sf-refactor}}`
   - fehlende Funktionalität / Schutzmechanismus → `{{SKILL:sf-build-feature}}`
5. Formuliere Prompt-Vorschläge:
   - direkt kopierbarer Klartext
   - keine umschliessenden Anführungszeichen
   - keine Escape-Sequenzen wie `\"`

### Phase 4: Bericht

1. Erstelle einen Bericht als `docs/review/review-report-YYYY-MM-DD[-N].md`. Erstelle `docs/review/` falls nicht vorhanden. Verwende das untenstehende Bericht-Format.
2. Wenn der aktive Finding-Scope nur kritische und wichtige Findings umfasst (Standard):
   - nimm Hinweise nicht in den Hauptbericht auf
   - erwähne kurz, dass Hinweise ausgefiltert wurden und ein umfassendes Review auf Wunsch möglich ist
3. Präsentiere dem User die wichtigsten Findings und weise auf die gespeicherte Report-Datei hin.
4. Lösche die Wisdom-Datei.

### Bericht-Format

```markdown
# Code-Review-Bericht

**Datum:** YYYY-MM-DD
**Scope:** [Gesamter Code / Beschriebener Bereich]
**Projekt-Typ:** [Frontend / Backend / CLI / Fullstack]

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
| {{SKILL:sf-fix}} | X |
| {{SKILL:sf-refactor}} | Y |
| {{SKILL:sf-build-feature}} | Z |

## Findings

### [R-0000001] [Titel]
- **Schweregrad**: Kritisch / Wichtig / Hinweis
- **Komplexität**: Leicht / Mittel / Schwer
- **Bereich**: [...]
- **Datei**: [pfad:zeile]
- **Problem**: [...]
- **Empfehlung**: [...]
- **Aktion**: `{{SKILL:sf-fix}}` | `{{SKILL:sf-refactor}}` | `{{SKILL:sf-build-feature}}`
- **Prompt-Vorschlag**: [...]
- **Entwickler-Anmerkung**: <!-- leer lassen, Freitext, oder „Nicht umsetzen: [Grund]" -->

## Übersprungene Findings (Designentscheidungen)

| Finding | Designentscheidung | Quelle |
|---|---|---|
| [...] | [DD-XXX] | [...] |
```

Wenn ein Finding später über `{{SKILL:sf-fix}}`, `{{SKILL:sf-refactor}}` oder `{{SKILL:sf-build-feature}}` umgesetzt wird, darf die bestehende Report-Datei am betroffenen Finding um einen kurzen Statushinweis ergänzt werden, zum Beispiel `Umgesetzt am YYYY-MM-DD via {{SKILL:sf-fix}}`.

## Bekannte Einschränkungen

- **Verzeichnis-Split in Phase 2c** kann Cross-Cutting-Issues über Modul-Grenzen hinweg verschleiern (z. B. Architektur-Konsistenz zwischen `src/components/` und `src/lib/`). Bei Repos, in denen solche Module-übergreifenden Reviews wichtig sind: Threshold im User-Argument überschreiben oder den ganzen Scope ohne Split reviewen.
- **Reviewer in Phase 2c haben keinen Designentscheidungs-Kontext** — bewusster Trade-off zugunsten von Geschwindigkeit. Der zentrale Filter in Phase 3 fängt dokumentierte Designentscheidungen ab, kann aber bei ambigen Fällen (teilweise Überlappung) mehr False Positives produzieren als ein im Reviewer informierter Pass.
- **Phase 3 darf erst starten, wenn alle drei Phase-2-Streams abgeschlossen sind.** Ein LLM-Orchestrator muss diese Synchronisation explizit einhalten — opportunistisches Vorlesen während ein Stream noch schreibt führt zu unvollständigen Daten in Aggregation und Filter.

## Regeln

- Phase 2 (2a, 2b, 2c) **immer parallel starten** — keine sequenzielle Abarbeitung.
- Innerhalb von Phase 2a alle Designentscheidungs-Quellen parallel.
- Innerhalb von Phase 2c alle Reviewer-Sub-Agenten parallel (Project-Type-übergreifend und Verzeichnis-Split-übergreifend).
- Reviewer in Phase 2c prüfen **keine** Designentscheidungen — der zentrale Filter erfolgt in Phase 3.
- Dieser Skill liest nur und schreibt nur den Review-Bericht und die temporäre Wisdom-Datei.
- Prompt-Vorschläge müssen ohne Anführungszeichen und ohne Escape-Sequenzen direkt kopierbar sein.
- Der aktive Finding-Scope (Standard: nur kritisch+wichtig) muss im Bericht respektiert werden.
