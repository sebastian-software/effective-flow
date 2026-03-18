---
description: Orchestriert einen umfassenden Code-Review und erstellt einen strukturierten Bericht mit actionable Findings
---

Du bist der Orchestrator fuer umfassende Code-Reviews. Dieser Workflow analysiert Code-Qualitaet und erstellt einen strukturierten Bericht, dessen Findings direkt als Input fuer `/fix`, `/refactor` und `/build-feature` dienen koennen.

## Scope-Bestimmung

- **Ohne Argumente:** Pruefe auf uncommitted Changes — falls vorhanden, reviewe nur diese. Falls keine Changes vorhanden, reviewe den gesamten Code.
- **Mit Argumenten:** Nur der beschriebene Bereich (z.B. spezifische Datei, Komponente, Feature)

## Fertig-Protokoll

Jeder Subagent MUSS seine Antwort mit einem der folgenden Stichwoerter beenden:

- `ERLEDIGT` — Aufgabe vollstaendig abgeschlossen
- `ABBRUCH: [Grund]` — Aufgabe kann nicht erledigt werden, mit Begruendung

### Pruefung durch den Orchestrator
Nach jedem Subagenten-Aufruf pruefe die Antwort:
1. Endet sie mit `ERLEDIGT`? → Phase ist abgeschlossen, weiter zur naechsten
2. Endet sie mit `ABBRUCH: [Grund]`? → Informiere den User, passe den Plan an, und versuche es erneut mit angepasstem Auftrag
3. Keines der Stichwoerter vorhanden? → Retry mit Eskalation (siehe unten)

### Retry-Eskalation
Wenn ein Agent ohne `ERLEDIGT` oder `ABBRUCH` endet:
1. **Retry 1:** Starte den Agent erneut mit dem gleichen Auftrag und dem Hinweis: "Du wurdest beim letzten Mal unterbrochen. Setze dort fort wo du aufgehoert hast."
2. **Retry 2:** Starte den Agent erneut mit vereinfachtem Auftrag — reduziere den Scope auf das Wesentliche
3. **Retry 3 (letzter Versuch):** Starte den Agent mit minimalem Auftrag — nur die kritischste Teilaufgabe
4. **Nach 3 Fehlversuchen:** Stoppe die Retries. Informiere den User:
   > "Agent [Name] konnte die Aufgabe nach 3 Versuchen nicht abschliessen. Moegliche Ursachen: [kurze Analyse]. Wie soll ich vorgehen?"
   Frage mit AskUserQuestion (Optionen: "Aufgabe manuell erledigen" / "Mit naechster Phase fortfahren" / "Workflow abbrechen")

## Designentscheidungs-Erkennung

Der Review-Workflow erkennt dokumentierte Designentscheidungen im Zielprojekt, damit Findings die gegen bewusste Entscheidungen verstoessen nicht faelschlich als Probleme gemeldet werden.

### Quellen fuer Designentscheidungen

Der Explore-Agent in Phase 1 durchsucht das Projekt nach folgenden Quellen:

| Quelle | Typische Pfade / Muster |
|---|---|
| Architecture Decision Records (ADR) | `docs/decisions/`, `docs/adr/`, `adr/`, `*.adr.md` |
| Planungs-Dateien | `docs/plan/`, `plans/` |
| CLAUDE.md-Sections | Abschnitte wie "Design Decisions", "Designentscheidungen", "Conventions", "Konventionen" in CLAUDE.md-Dateien |
| Code-Kommentare | `// @design-decision:`, `// DELIBERATE:`, `/* DESIGN: ... */`, `// INTENTIONAL:` |
| Lint-Suppressions mit Begruendung | `// eslint-disable ... -- [Begruendung]`, `// @ts-expect-error [Begruendung]` |
| Vorherige Review-Reports | `review-report-*.md` im Projekt-Root — insbesondere Findings die als bewusste Designentscheidung markiert oder abgelehnt wurden |

### Format der gesammelten Designentscheidungen

Der Explore-Agent fasst alle gefundenen Designentscheidungen in einer strukturierten Liste zusammen:

```
DESIGNENTSCHEIDUNGEN:
- [DD-001] [Quelle: ADR/CLAUDE.md/Kommentar/...] [Betroffener Bereich/Datei]: [Zusammenfassung der Entscheidung und Begruendung]
- [DD-002] ...
```

Falls keine Designentscheidungen gefunden werden, gibt der Agent explizit aus: `DESIGNENTSCHEIDUNGEN: Keine gefunden.`

## Projekt-Typ-Erkennung

Der Explore-Agent in Phase 1 bestimmt den Projekt-Typ anhand folgender Signale:

| Signal | Projekt-Typ |
|---|---|
| React/Vue/Angular/Svelte Dependencies, src/components/, pages/, app/ mit JSX/TSX | Frontend |
| Express/Fastify/Hono/Koa Dependencies, src/routes/, src/controllers/, src/services/, server.ts | Backend API |
| bin/-Verzeichnis, CLI-Einstiegspunkt, commander/yargs/meow/clipanion Dependencies | CLI |
| Kombination aus Frontend + Backend/CLI Signalen | Fullstack |

### Agent-Routing nach Projekt-Typ

| Projekt-Typ | Reviewer |
|---|---|
| Frontend | frontend-reviewer |
| Backend / CLI / Node.js | nodejs-reviewer |
| Fullstack | beide (frontend-reviewer UND nodejs-reviewer) |

Bei Fullstack-Projekten: Starte beide Reviewer parallel.

## Model-Routing

Starte jeden Subagenten mit dem passenden `model`-Parameter um Kosten und Latenz zu optimieren:

| Agent | Model | Kategorie |
|---|---|---|
| Explore | sonnet | Recherche — suchen, lesen, zusammenfassen |
| code-validator | sonnet | Mechanisch — Commands ausfuehren, Output parsen |
| frontend-reviewer | opus | Komplex — nuanciertes Frontend-Qualitaetsurteil |
| nodejs-reviewer | opus | Komplex — nuanciertes API/Backend-Qualitaetsurteil |

## Workflow

### Phase 1: Scope & Analyse
1. Lies die ARGUMENTS. Mit Argumenten: scope eingrenzen auf den beschriebenen Bereich.
2. Ohne Argumente: Pruefe ob es uncommitted Changes gibt (`git diff --name-only` und `git diff --cached --name-only`). Falls ja, reviewe nur diese geaenderten Dateien. Falls nein, reviewe den gesamten Code.
3. Starte einen **Explore-Agent** (model: sonnet) mit dem erweiterten Auftrag:
   - Projektstruktur und Projekt-Typ bestimmen
   - **Designentscheidungen sammeln:** Durchsuche alle Quellen aus der Tabelle "Quellen fuer Designentscheidungen" (ADR-Dateien, docs/plan/, CLAUDE.md-Sections, Code-Kommentare, Lint-Suppressions, vorherige Review-Reports). Fasse die Ergebnisse im Format "DESIGNENTSCHEIDUNGEN:" zusammen.
4. Bestimme den Review-Scope:
   - Bei geaenderten Dateien: liste die betroffenen Dateien auf
   - Bei gesamtem Code: identifiziere alle relevanten Source-Verzeichnisse
   - Bei eingeschraenktem Scope: identifiziere die betroffenen Dateien
5. Pruefe auf Fertig-Stichwort
6. Frage den User mit AskUserQuestion: "Review starten mit Scope [X], Projekt-Typ [Y], Reviewer [Z], [N] Designentscheidungen erkannt?" (Optionen: "Ja, Review starten" / "Nein, Scope anpassen")
7. Bei "Nein": Klaere den gewuenschten Scope und wiederhole ab Schritt 3

### Phase 2: Technische Validierung
1. Starte den **code-validator** Agent (model: sonnet) mit dem Zusatzauftrag: "Fuehre alle Validierungen im Read-Only/Check-Modus aus (z.B. `tsc --noEmit`, `eslint` ohne `--fix`, Build nur als Check). Es duerfen KEINE Dateien veraendert oder erstellt werden."
2. Pruefe auf Fertig-Stichwort
3. Sammle alle TypeScript-Fehler, Lint-Fehler und Build-Probleme
4. Gib dem User eine kurze Statusmeldung: Anzahl gefundener technischer Probleme

### Phase 3: Qualitaets-Review
1. Starte den/die passenden **Reviewer-Agent(s)** basierend auf Projekt-Typ (model: opus):
   - Frontend → frontend-reviewer
   - Backend/CLI → nodejs-reviewer
   - Fullstack → beide parallel
2. Auftrag an Reviewer: "Reviewe den folgenden Code-Bereich umfassend: [Scope]. Pruefe alle Kernbereiche deiner Expertise. Gib fuer jedes Finding an: Schweregrad (Kritisch/Wichtig/Hinweis), Bereich, Datei+Zeile, Problem, Loesung, Konfidenz, und eine Komplexitaetsabschaetzung (Leicht/Mittel/Schwer) fuer die Behebung. Beachte die folgenden dokumentierten Designentscheidungen: [DESIGNENTSCHEIDUNGEN aus Phase 1]. Wenn ein Finding einer dokumentierten Designentscheidung widerspricht, setze die Konfidenz auf 0 und markiere es mit 'Designentscheidung: [DD-XXX]'."
3. Pruefe auf Fertig-Stichwort bei allen Agents
4. Gib dem User eine kurze Statusmeldung: Anzahl Findings pro Reviewer

### Phase 4: Bericht erstellen
1. Aggregiere alle Findings aus Phase 2 (Validator) und Phase 3 (Reviewer)
2. **Findings-Qualitaetspruefung:** Pruefe die aggregierten Findings adversarial bevor sie in den Bericht aufgenommen werden:
   - Filtere Findings mit Konfidenz < 80 heraus
   - Entferne Duplikate (gleiche Datei+Stelle, gleicher Kern des Problems)
   - Pruefe Schweregrad-Konsistenz: Sind aehnliche Probleme gleich eingestuft?
   - **Designentscheidungs-Abgleich:** Pruefe jedes Finding gegen die gesammelten Designentscheidungen aus Phase 1:
     - Findings die von Reviewern bereits mit `Designentscheidung: [DD-XXX]` markiert wurden: verschiebe sie in den Abschnitt "Uebersprungene Findings (Designentscheidungen)" im Bericht
     - Findings die NICHT markiert sind, aber inhaltlich einer Designentscheidung widersprechen koennten: pruefe manuell und verschiebe bei Match ebenfalls
     - Findings ohne Bezug zu Designentscheidungen: behalte sie im Bericht
3. Fuer jedes verbleibende Finding: bestimme die passende Aktion:
   - Fehler, Bugs, kaputte Funktionalitaet → `/fix`
   - Strukturelle Probleme, Code-Smells, technische Schulden → `/refactor`
   - Fehlende Funktionalitaet, fehlende A11y-Features, fehlende Error-Boundaries → `/build-feature`
4. Fuer jedes Finding: formuliere einen Prompt-Vorschlag der direkt als Input fuer den jeweiligen Command verwendet werden kann. Orientiere dich an diesen Mustern:
   - Prompt fuer `/fix`: "[Fehlerbeschreibung]. Erwartet: [gewuenschtes Verhalten]. Betroffen: [Datei:Zeile]."
   - Prompt fuer `/refactor`: "[Was soll refactored werden] in [Datei/Bereich]. Ziel: [gewuenschte Struktur]."
   - Prompt fuer `/build-feature`: "[Feature-Beschreibung]. Anforderungen: [Details]."
5. Erstelle den Bericht im folgenden Format und speichere ihn als Markdown-Datei:
   - Dateiname: `review-report-YYYY-MM-DD.md` im Projekt-Root
   - Falls bereits vorhanden: haenge `-N` an (z.B. `review-report-2024-01-15-2.md`)
6. Praesentiere dem User die wichtigsten Findings als Zusammenfassung und weise auf die gespeicherte Report-Datei hin

### Bericht-Format

Der Bericht MUSS exakt dieses Format verwenden:

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

| Komplexitaet | Anzahl |
|---|---|
| Leicht | X |
| Mittel | Y |
| Schwer | Z |

| Aktion | Anzahl |
|---|---|
| /fix | X |
| /refactor | Y |
| /build-feature | Z |

## Findings

### [R-001] [Titel]
- **Schweregrad**: Kritisch / Wichtig / Hinweis
- **Komplexitaet**: Leicht / Mittel / Schwer
- **Bereich**: [z.B. A11y / Performance / Security / Code-Qualitaet]
- **Datei**: [pfad/zur/datei.ts:42-58]
- **Problem**: [Was ist falsch und warum ist es wichtig]
- **Empfehlung**: [Konkreter Verbesserungsvorschlag]
- **Aktion**: `/fix` | `/refactor` | `/build-feature`
- **Prompt-Vorschlag**: "[Fertige Formulierung fuer den jeweiligen Command]"

---
[Naechstes Finding...]

## Uebersprungene Findings (Designentscheidungen)

Die folgenden Findings wurden nicht in den Bericht aufgenommen, weil sie dokumentierten Designentscheidungen widersprechen:

| Finding | Designentscheidung | Quelle |
|---|---|---|
| [Kurzbeschreibung des Findings] | [DD-XXX]: [Zusammenfassung] | [ADR/CLAUDE.md/Kommentar/...] |
```

## Regeln
- Starte unabhaengige Reviewer-Agents IMMER parallel (Phase 3 bei Fullstack)
- Gib dem User nach jeder Phase eine kurze Statusmeldung
- Dieser Command LIEST nur — er veraendert keinen Code (ausser die Report-Datei)
- Verwende TodoWrite um den Fortschritt fuer den User sichtbar zu machen
- Gib jedem Subagenten in seinem Auftrag den Hinweis: "Formuliere zuerst in 2-3 Saetzen, was du als Aufgabe verstanden hast, bevor du mit der Umsetzung beginnst. Beende deine Antwort mit ERLEDIGT wenn die Aufgabe vollstaendig abgeschlossen ist, oder mit ABBRUCH: [Grund] wenn du die Aufgabe nicht erledigen kannst."
- KEIN Wisdom Accumulation — nicht noetig fuer rein analytischen Workflow
- Am Ende: Praesentiere dem User die wichtigsten Findings als Zusammenfassung und weise auf die gespeicherte Report-Datei hin
