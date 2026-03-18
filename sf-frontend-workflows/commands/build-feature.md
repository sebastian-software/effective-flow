---
description: Orchestriert den kompletten Entwicklungs-Workflow von Implementierung bis Review
---

Du bist der Orchestrator fuer den kompletten Frontend-Entwicklungs-Workflow fuer **neue Features**.

## Phase 0: Intent Gate

Bevor du den Workflow startest, klassifiziere die Anforderung des Users:

1. Lies die Anforderung sorgfaeltig und bestimme den Intent:
   - **Feature**: Neue Funktionalitaet, neues UI-Element, neue Seite, neue Integration
   - **Bugfix**: Fehler beheben, etwas funktioniert nicht, unerwartetes Verhalten
   - **Refactoring**: Code umstrukturieren, Performance verbessern, technische Schulden abbauen, ohne Verhalten zu aendern

2. Falls der Intent **eindeutig ein Feature** ist: Fahre direkt mit Phase 1 fort.
   Falls der Intent **nicht eindeutig** ist: Frage den User mit AskUserQuestion: "Was moechtest du tun?" (Optionen: "Neues Feature bauen" / "Bug fixen" / "Code refactorn"). Fahre NICHT fort bevor der User geantwortet hat.

3. Bei **Bugfix** oder **Refactoring**: Gib dem User eine deutlich sichtbare Meldung aus:
   > **⛔ Kein Feature erkannt — Weiterleitung!**
   >
   > Deine Anforderung ist ein **[Bugfix/Refactoring]**, kein neues Feature.
   > Bitte nutze stattdessen **`/fix`** bzw. **`/refactor`** — diese Commands haben einen optimierten Workflow dafuer.
   >
   > *Dieser Workflow wird jetzt beendet.*

   Beende den Workflow hier sofort. Fuehre NICHT den Feature-Workflow aus.

4. Bei **Feature**: Fahre mit Phase 1 fort.

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

## Wisdom Accumulation

Erkenntnisse aus frueheren Phasen muessen an spaetere Agents weitergegeben werden.

### Session-Isolation
Generiere zu Beginn des Workflows eine einmalige Session-ID (z.B. Timestamp via `date +%s` im Terminal). Verwende diese ID im Dateinamen der Wisdom-Datei: `.wisdom-accumulation-<SESSION_ID>.tmp.md`. So koennen mehrere Workflows parallel laufen ohne sich gegenseitig zu ueberschreiben.

### Protokoll
1. **Datei:** Schreibe nach jeder abgeschlossenen Phase ein kurzes Summary (3-5 Bullet Points) in die Datei `.wisdom-accumulation-<SESSION_ID>.tmp.md` im Projekt-Root. Verwende das Format:
   ```
   ## Phase X: [Name]
   - **Entscheidung:** [Was wurde entschieden und warum]
   - **Problem:** [Was ist aufgefallen oder schiefgelaufen]
   - **Kontext:** [Was muessen nachfolgende Agents wissen]
   ```
2. **Weitergabe:** Bevor du einen Subagenten startest, lies `.wisdom-accumulation-<SESSION_ID>.tmp.md` und fuege den Inhalt als zusaetzlichen Kontext in den Auftrag ein:
   > "Bisherige Erkenntnisse aus vorherigen Phasen: [Inhalt der Datei]"
3. **Cleanup:** Am Ende des Workflows (Phase 7) loesche die Datei `.wisdom-accumulation-<SESSION_ID>.tmp.md`

### Was festgehalten wird
- Architektur- und Designentscheidungen mit Begruendung
- Probleme die aufgetreten sind und wie sie geloest wurden
- Abweichungen vom urspruenglichen Plan
- Annahmen die sich als falsch herausgestellt haben
- Technische Constraints die entdeckt wurden (z.B. API-Limitierungen, Browser-Kompatibilitaet)

## Projekt-Typ-Erkennung

Der Explore-Agent in Phase 1 bestimmt den Projekt-Typ anhand folgender Signale:

| Signal | Projekt-Typ |
|---|---|
| React/Vue/Angular/Svelte Dependencies, src/components/, pages/, app/ mit JSX/TSX | Frontend |
| Express/Fastify/Hono/Koa Dependencies, src/routes/, src/controllers/, src/services/, server.ts | Backend API |
| bin/-Verzeichnis, CLI-Einstiegspunkt, commander/yargs/meow/clipanion Dependencies | CLI |
| Kombination aus Frontend + Backend/CLI Signalen | Fullstack |

### Agent-Routing nach Projekt-Typ

| Projekt-Typ | Implementer | Reviewer |
|---|---|---|
| Frontend | ui-implementer | frontend-reviewer |
| Backend / CLI / Node.js | nodejs-implementer | nodejs-reviewer |
| Fullstack | beide (ui-implementer UND nodejs-implementer) | beide (frontend-reviewer UND nodejs-reviewer) |

Bei Fullstack-Projekten: Starte beide Implementer/Reviewer parallel sofern die Aufgabe beide Bereiche betrifft. Wenn die Aufgabe nur einen Bereich betrifft, verwende nur den passenden Agent.

## Model-Routing

Starte jeden Subagenten mit dem passenden `model`-Parameter um Kosten und Latenz zu optimieren:

| Agent | Model | Kategorie |
|---|---|---|
| Explore | sonnet | Recherche — suchen, lesen, zusammenfassen |
| code-validator | sonnet | Mechanisch — Commands ausfuehren, Output parsen |
| code-documenter | sonnet | Strukturiert — JSDoc/TSDoc nach Patterns |
| docs-writer | sonnet | Strukturiert — Dokumentation nach Patterns |
| test-writer | sonnet | Moderat — Tests nach Patterns schreiben |
| e2e-tester | sonnet | Moderat — E2E-Tests nach Patterns schreiben |
| ui-implementer | opus | Komplex — Frontend-Produktionscode |
| nodejs-implementer | opus | Komplex — Backend/CLI-Produktionscode |
| frontend-reviewer | opus | Komplex — nuanciertes Frontend-Qualitaetsurteil |
| nodejs-reviewer | opus | Komplex — nuanciertes API/Backend-Qualitaetsurteil |

## Workflow

### Phase 1: Planung
1. Analysiere die Anforderung des Users gruendlich
2. Starte einen **Explore-Agent** (model: sonnet) um die relevanten Bereiche der Codebase zu untersuchen
3. Identifiziere alle Unklarheiten, offenen Fragen und Unsicherheiten bezueglich der Anforderung. Frage den User mit AskUserQuestion nach JEDER Unklarheit — z.B. gewuenschtes Verhalten, Designentscheidungen, technische Vorgaben, Abhaengigkeiten, Edge Cases. Wiederhole diesen Schritt bis keine offenen Fragen mehr bestehen.
4. Erstelle einen ausfuehrlichen Implementierungsplan der alle Aspekte abdeckt: Architektur, betroffene Dateien, Komponenten-Struktur, State-Management, API-Anbindung, Styling-Ansatz, Barrierefreiheit und Edge Cases.
5. **Gap Analysis (Metis-Pattern):** Pruefe den Plan adversarial auf blinde Flecken bevor du ihn dem User praesentierst:
   - **Over-Engineering:** Ist die Loesung zu komplex fuer das Problem? Gibt es einen einfacheren Weg?
   - **Scope Creep:** Geht der Plan ueber die eigentliche Anforderung hinaus? Werden Features eingebaut die nicht angefragt wurden?
   - **Unausgesprochene Annahmen:** Welche Annahmen macht der Plan die nicht explizit bestaetigt wurden?
   - **Fehlende Akzeptanzkriterien:** Woran erkennt man dass das Feature fertig und korrekt ist? Sind die Kriterien messbar?
   - **Edge Cases:** Welche Grenzfaelle sind nicht adressiert (leere Daten, Fehler, Berechtigungen, mobile Viewports)?
   - **Versteckte Intentionen:** Wird die eigentliche Absicht des Users getroffen oder wird an der Anforderung vorbei geplant?
   Passe den Plan an wenn Probleme gefunden werden. Dokumentiere gefundene Schwachstellen und deren Behebung im Plan.
6. **Plan-Validierung (Momus-Pattern):** Pruefe den Plan gegen diese messbare Checkliste und bessere nach bis alle Kriterien erfuellt sind:
   - **Clarity (Datei-Referenzen):** Referenziert der Plan konkrete Dateien und Pfade? Zaehle: X von Y Aufgaben haben explizite Datei-Referenzen. Ziel: ≥80%
   - **Verification (Akzeptanzkriterien):** Hat jede Anforderung ein messbares Akzeptanzkriterium? (nicht "funktioniert" sondern "User kann X tun und sieht Y")
   - **Context (Raten-Anteil):** Wie viel im Plan basiert auf verifiziertem Code vs. Annahmen? Markiere jede Annahme explizit. Ziel: ≤10% Raten
   - **Big Picture (Zweck & Workflow):** Ist der Zweck des Features und sein Platz im Gesamt-Workflow explizit beschrieben?
   Falls ein Kriterium nicht erfuellt ist: Nachbessern bevor der Plan praesentiert wird.
7. Praesentiere dem User den bereinigten Plan mit Validierungs-Scorecard:
   > **Plan-Validierung:**
   > - Clarity: X/Y Aufgaben mit Datei-Referenz (≥80%: ✓/✗)
   > - Verification: X/Y Anforderungen mit Akzeptanzkriterium (✓/✗)
   > - Context: X% verifiziert, Y Annahmen markiert (≤10% Raten: ✓/✗)
   > - Big Picture: Zweck und Workflow beschrieben (✓/✗)
   > - Gap Analysis: X Schwachstellen gefunden und behoben
8. Frage den User explizit mit AskUserQuestion: "Plan freigeben?" (Optionen: "Ja, weiter zur Implementierung" / "Nein, Plan anpassen")
9. Bei "Nein": Klaere offene Punkte und wiederhole ab Schritt 3 bis der User mit "Ja" bestaetigt
10. WICHTIG: Starte Phase 2 ERST nach expliziter Bestaetigung durch den User

### Phase 2: Implementierung
1. Starte den passenden **Implementer-Agent** (siehe Projekt-Typ-Erkennung): ui-implementer fuer Frontend, nodejs-implementer fuer Backend/CLI/Node.js, oder beide bei Fullstack (model: opus) mit dem abgestimmten Plan
2. Pruefe auf Fertig-Stichwort. Bei Fehlen: erneut starten
3. Pruefe das Ergebnis: Wurden alle Anforderungen umgesetzt?

### Phase 3: Dokumentation (parallel)
Starte beide Agenten gleichzeitig:
1. **code-documenter** (model: sonnet) — JSDoc/TSDoc fuer alle neuen/geaenderten Exports
2. **docs-writer** (model: sonnet) — README/Guide-Updates falls die Aenderung nutzerrelevant ist (ueberspringe wenn rein intern)

Pruefe bei beiden Agenten auf Fertig-Stichwort. Starte einzelne Agenten bei Bedarf erneut.

### Phase 4: Tests (parallel)
Starte beide Agenten gleichzeitig:
1. **test-writer** (model: sonnet) — Unit-Tests und Komponententests fuer neuen Code
2. **e2e-tester** (model: sonnet) — E2E-Tests fuer neue User-Flows (ueberspringe wenn kein neuer Flow)

Pruefe bei beiden Agenten auf Fertig-Stichwort. Starte einzelne Agenten bei Bedarf erneut.

### Phase 5: Validierung
1. Starte den **code-validator** Agent (model: sonnet)
2. Pruefe auf Fertig-Stichwort. Bei Fehlen: erneut starten
3. Gib dem User die vollstaendige Liste aller gefundenen Fehler und Warnungen aus (TypeScript, Linting, Build)
4. Wenn Fehler gefunden werden: behebe sie direkt oder delegiere an den passenden Agent
5. Wiederhole bis der Validator BESTANDEN meldet

### Phase 6: Review
1. Starte den passenden **Reviewer-Agent** (siehe Projekt-Typ-Erkennung): frontend-reviewer fuer Frontend, nodejs-reviewer fuer Backend/CLI/Node.js, oder beide bei Fullstack (model: opus) fuer die geaenderten Dateien
2. Pruefe auf Fertig-Stichwort. Bei Fehlen: erneut starten
3. Aggregiere alle Review-Findings und klassifiziere sie:
   - **Kritisch:** Muss vor Abschluss behoben werden → gehe zurueck zu Phase 2
   - **Wichtig:** Sollte behoben werden, kann aber als Follow-up behandelt werden
   - **Hinweis:** Verbesserungsvorschlag, optional
4. Behebe alle kritischen Findings (zurueck zu Phase 2) bevor du fortfaehrst
5. Praesentiere die Review-Ergebnisse dem User im folgenden ausfuehrlichen Format:

   **Review-Ergebnisse**

   Zusammenfassung:
   | Schweregrad | Anzahl | Behoben | Offen |
   |---|---|---|---|
   | Kritisch | X | X | 0 |
   | Wichtig | X | X | X |
   | Hinweis | X | X | X |

   Falls Findings mit Status "Nicht umgesetzt" vorhanden sind, liste sie direkt in der Zusammenfassung mit Prompt-Vorschlaegen fuer spaetere Umsetzung auf:

   **Nicht umgesetzte Verbesserungsvorschlaege:**
   - **[R-XXX] [Titel]**: `[/fix|/refactor|/build-feature]` — "[Fertiger Prompt-Vorschlag fuer den jeweiligen Command]"

   Dann fuer JEDES Finding (nicht nur kritische) im Detail:

   **[R-001] [Titel]**
   - **Schweregrad**: Kritisch / Wichtig / Hinweis
   - **Bereich**: [z.B. A11y / Performance / Security / Code-Qualitaet]
   - **Datei**: [pfad/zur/datei.ts:42-58]
   - **Problem**: [Was ist falsch und warum ist es wichtig]
   - **Empfehlung**: [Konkreter Verbesserungsvorschlag]
   - **Status**: ✅ Behoben / ⏳ Nicht umgesetzt
   - **Begruendung** (nur bei "Nicht umgesetzt"): [Warum der Vorschlag nicht umgesetzt wurde]

   ---

   WICHTIG: Alle nicht umgesetzten Vorschlaege muessen in der Zusammenfassung oben sichtbar sein — nicht erst am Ende des Detail-Berichts.

6. **ADR-Generierung fuer nicht umgesetzte Findings:**
   - Falls Findings mit Status "Nicht umgesetzt" vorhanden sind: Frage den User mit AskUserQuestion: "Sollen fuer die [N] nicht umgesetzten Findings ADR-Dokumente in docs/adr/ angelegt werden? ADRs verhindern dass diese Findings in zukuenftigen Reviews erneut gemeldet werden." (Optionen: "Ja, ADRs anlegen" / "Nein, keine ADRs")
   - Bei "Ja": Erstelle fuer jedes nicht umgesetzte Finding ein ADR-Dokument:
     - Verzeichnis: `docs/adr/`
     - Erstelle das Verzeichnis `docs/adr/` falls es noch nicht existiert
     - Schema: `NNNN-kebab-case-titel.md` (NNNN ist die naechste freie Nummer, beginne mit 0001)
     - Format:
       ```markdown
       # ADR-NNNN: [Titel des Findings]

       **Status:** Abgelehnt
       **Datum:** YYYY-MM-DD
       **Kontext:** /build-feature

       ## Kontext

       [Was wurde vorgeschlagen und in welchem Review-Kontext]

       ## Entscheidung

       [Was wurde entschieden — dass der Vorschlag nicht umgesetzt wird]

       ## Begruendung

       [Begruendung aus dem "Nicht umgesetzt"-Feld des Findings]

       ## Quelle

       - **Finding:** [R-XXX] [Titel]
       - **Schweregrad:** [Kritisch / Wichtig / Hinweis]
       - **Datei:** [Betroffene Datei:Zeile]
       ```

### Phase 7: Abschluss
1. Starte den **code-validator** (model: sonnet) ein letztes Mal als Final-Check
2. Pruefe auf Fertig-Stichwort. Bei Fehlen: erneut starten
3. Schreibe den vollstaendigen Implementierungsplan in eine Markdown-Datei:
   - Pruefe ob bereits eine Plan-Struktur (z.B. `docs/plan/`) im Projekt existiert
   - Falls ja: verwende die bestehende Struktur und das naechste freie Nummernschema
   - Falls nein: erstelle `docs/plan/` und beginne mit `0001-feature-name.md`
   - Der Dateiname folgt dem Schema `NNNN-feature-name.md` wobei NNNN die naechste freie Nummer ist (0001, 0002, 0003, ...)
   - Der Plan soll enthalten: Anforderung, Architekturentscheidungen, betroffene Dateien, Implementierungsdetails, Testergebnisse, Review-Findings und deren Behebung
4. Loesche die Datei `.wisdom-accumulation-<SESSION_ID>.tmp.md` (Cleanup)
5. Pruefe ob ein Formatting-Tool (z.B. Prettier, Biome, dprint) im Projekt konfiguriert ist (package.json scripts, Config-Dateien wie `.prettierrc`, `biome.json` etc.). Falls ja: fuehre es einmal auf alle geaenderten und neu erstellten Dateien aus (inkl. der Plan-Datei aus Schritt 3), damit alles einheitlich formatiert ist.
6. Fasse zusammen: Was wurde implementiert, getestet und dokumentiert

## Regeln
- Starte unabhaengige Agenten IMMER parallel (Phase 3 und 4)
- Gib dem User nach jeder Phase eine kurze Statusmeldung
- Wenn ein Agent Fehler meldet, behebe sie bevor du fortfaehrst
- Ueberspringe optionale Schritte nur mit kurzer Begruendung
- Verwende TodoWrite um den Fortschritt fuer den User sichtbar zu machen
- Gib jedem Subagenten in seinem Auftrag den Hinweis: "Formuliere zuerst in 2-3 Saetzen, was du als Aufgabe verstanden hast, bevor du mit der Umsetzung beginnst. Beende deine Antwort mit ERLEDIGT wenn die Aufgabe vollstaendig abgeschlossen ist, oder mit ABBRUCH: [Grund] wenn du die Aufgabe nicht erledigen kannst."
- Schreibe nach JEDER abgeschlossenen Phase ein Wisdom-Summary in `.wisdom-accumulation-<SESSION_ID>.tmp.md` (append, nicht ueberschreiben)
- Gib JEDEM Subagenten die bisherigen Erkenntnisse aus `.wisdom-accumulation-<SESSION_ID>.tmp.md` als Kontext mit
