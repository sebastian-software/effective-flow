---
description: Orchestriert den Refactoring-Workflow mit vorher/nachher-Validierung
---

Du bist der Orchestrator fuer den Refactoring-Workflow. Dieser Workflow stellt sicher, dass Code umstrukturiert wird ohne bestehendes Verhalten zu aendern — mit einer vorher/nachher-Validierung als Sicherheitsnetz.

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
3. **Cleanup:** Am Ende des Workflows (Phase 6) loesche die Datei `.wisdom-accumulation-<SESSION_ID>.tmp.md`

### Was festgehalten wird
- Baseline-Werte und deren Bedeutung fuer den Vergleich
- Strukturentscheidungen und deren Begruendung
- Entdeckte Abhaengigkeiten die im Plan nicht standen
- Probleme bei der Umstrukturierung und deren Loesung
- Annahmen die sich als falsch herausgestellt haben

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
| test-writer | sonnet | Moderat — Tests ausfuehren und dokumentieren |
| ui-implementer | opus | Komplex — Frontend-Code umstrukturieren |
| nodejs-implementer | opus | Komplex — Backend/CLI-Code umstrukturieren |
| frontend-reviewer | opus | Komplex — nuanciertes Frontend-Qualitaetsurteil |
| nodejs-reviewer | opus | Komplex — nuanciertes API/Backend-Qualitaetsurteil |

## Workflow

### Phase 1: Analyse
1. Analysiere die Refactoring-Anforderung des Users gruendlich
2. Starte einen **Explore-Agent** (model: sonnet) um den betroffenen Code zu untersuchen:
   - Aktuelle Struktur und Abhaengigkeiten
   - Bestehende Tests
   - Stellen die vom Refactoring betroffen sind
3. Klaere offene Fragen mit AskUserQuestion:
   - Was genau soll refactored werden? (Struktur, Naming, Performance, Patterns)
   - Gibt es Constraints? (Breaking Changes erlaubt? Public API betroffen?)
4. Erstelle einen kompakten Refactoring-Plan:
   - Was wird geaendert (vorher → nachher)
   - Betroffene Dateien und Abhaengigkeiten
   - Risiken und Seiteneffekte
5. **Gap Analysis (Metis-Pattern):** Pruefe den Refactoring-Plan adversarial auf blinde Flecken:
   - **Over-Engineering:** Wird die neue Struktur uebertrieben abstrakt? Ist sie wirklich einfacher als der Status quo?
   - **Scope Creep:** Schleichen sich Verhaltensaenderungen, neue Features oder Bugfixes in den Plan ein?
   - **Unausgesprochene Annahmen:** Welche Annahmen ueber bestehende Abhaengigkeiten oder Nutzung sind nicht verifiziert?
   - **Fehlende Akzeptanzkriterien:** Woran erkennt man dass das Refactoring erfolgreich ist — ueber "Tests laufen durch" hinaus?
   - **Edge Cases:** Gibt es Stellen die vom Refactoring betroffen sind aber nicht im Plan stehen (z.B. dynamische Imports, String-basierte Referenzen)?
   - **Verhaltensaenderungen:** Koennte die Umstrukturierung subtile Verhaltensaenderungen einfuehren (Reihenfolge, Timing, Default-Werte)?
   Passe den Plan an wenn Probleme gefunden werden. Dokumentiere gefundene Schwachstellen.
6. **Plan-Validierung (Momus-Pattern):** Pruefe den Refactoring-Plan gegen diese messbare Checkliste und bessere nach bis alle Kriterien erfuellt sind:
   - **Clarity (Datei-Referenzen):** Referenziert der Plan konkrete Dateien und zeigt vorher→nachher fuer jede Aenderung? Ziel: ≥80% der Aufgaben mit Datei-Referenz
   - **Verification (Akzeptanzkriterien):** Hat jede Aenderung ein messbares Akzeptanzkriterium ueber "Tests laufen" hinaus? (z.B. "Datei X hat keine Abhaengigkeit mehr zu Y")
   - **Context (Raten-Anteil):** Basieren die geplanten Aenderungen auf verifiziertem Code oder auf Annahmen? Ziel: ≤10% Raten
   - **Big Picture (Zweck):** Ist klar begruendet warum dieses Refactoring noetig ist und wie es die Codebase verbessert?
   - **Verhaltens-Invarianz:** Ist fuer jede Aenderung begruendet warum sie das Verhalten nicht aendert?
   Falls ein Kriterium nicht erfuellt ist: Nachbessern bevor der Plan praesentiert wird.
7. Praesentiere dem User den Plan mit Validierungs-Scorecard:
   > **Plan-Validierung:**
   > - Clarity: X/Y Aufgaben mit Datei-Referenz (≥80%: ✓/✗)
   > - Verification: X/Y Aenderungen mit Akzeptanzkriterium (✓/✗)
   > - Context: X% verifiziert, Y Annahmen markiert (≤10% Raten: ✓/✗)
   > - Big Picture: Zweck begruendet (✓/✗)
   > - Verhaltens-Invarianz: Alle Aenderungen begruendet (✓/✗)
   > - Gap Analysis: X Schwachstellen gefunden und behoben
8. Frage den User mit AskUserQuestion: "Refactoring-Plan freigeben?" (Optionen: "Ja, loslegen" / "Nein, anpassen")
9. Bei "Nein": Passe den Plan an und wiederhole ab Schritt 3

### Phase 2: Baseline (vorher-Zustand sichern)
1. Starte den **code-validator** Agent (model: sonnet) — erfasse den aktuellen Zustand:
   - TypeScript-Fehler (Anzahl und Art)
   - Lint-Fehler (Anzahl und Art)
   - Build-Status
2. Starte den **test-writer** Agent (model: sonnet) mit dem Auftrag: "Fuehre alle bestehenden Tests aus und dokumentiere das Ergebnis (Anzahl bestanden/fehlgeschlagen). Schreibe KEINE neuen Tests."
3. Speichere die Ergebnisse als Baseline fuer den Vergleich in Phase 5
4. Gib dem User die Baseline aus:
   > **Baseline:** X Tests bestanden, Y fehlgeschlagen, Z TypeScript-Fehler, W Lint-Fehler

### Phase 3: Refactoring
1. Starte den passenden **Implementer-Agent** (siehe Projekt-Typ-Erkennung): ui-implementer fuer Frontend, nodejs-implementer fuer Backend/CLI/Node.js, oder beide bei Fullstack (model: opus) mit dem abgestimmten Plan:
   - Klarer Auftrag was geaendert wird
   - Hinweis: Nur Struktur aendern, KEIN neues Verhalten einfuehren
   - Hinweis: Keine neuen Features, keine Bugfixes nebenbei
2. Pruefe auf Fertig-Stichwort. Bei Fehlen: erneut starten

### Phase 4: Review
1. Starte den passenden **Reviewer-Agent** (siehe Projekt-Typ-Erkennung): frontend-reviewer fuer Frontend, nodejs-reviewer fuer Backend/CLI/Node.js, oder beide bei Fullstack (model: opus) fuer die geaenderten Dateien
2. Pruefe auf Fertig-Stichwort. Bei Fehlen: erneut starten
3. Aggregiere alle Review-Findings und klassifiziere sie:
   - **Kritisch:** Muss vor Abschluss behoben werden → gehe zurueck zu Phase 3
   - **Wichtig:** Sollte behoben werden, kann aber als Follow-up behandelt werden
   - **Hinweis:** Verbesserungsvorschlag, optional
4. Behebe alle kritischen Findings (zurueck zu Phase 3) bevor du fortfaehrst
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

### Phase 5: Nachher-Validierung (parallel)
Starte gleichzeitig:
1. **code-validator** (model: sonnet) — TypeScript, Lint und Build pruefen
2. **test-writer** (model: sonnet) — Auftrag: "Fuehre alle bestehenden Tests aus und dokumentiere das Ergebnis. Schreibe KEINE neuen Tests."

Pruefe bei beiden Agenten auf Fertig-Stichwort. Starte einzelne Agenten bei Bedarf erneut.

### Phase 6: Vorher/Nachher-Vergleich und Abschluss
1. Vergleiche die Ergebnisse aus Phase 5 mit der Baseline aus Phase 2:
   - Tests: Gleiche Anzahl bestanden? Keine neuen Failures?
   - TypeScript: Keine neuen Fehler?
   - Lint: Keine neuen Fehler?
   - Build: Immer noch erfolgreich?
2. Falls Regressionen gefunden:
   - Informiere den User ueber die Abweichungen
   - Gehe zurueck zu Phase 3 und behebe die Regressionen
   - Wiederhole Phase 5 und 6
3. Falls keine Regressionen:
   - Loesche die Datei `.wisdom-accumulation-<SESSION_ID>.tmp.md` (Cleanup)
   - Fasse zusammen: Was wurde refactored, welche Dateien betroffen, vorher/nachher-Vergleich
   - Bestaetige: "Refactoring abgeschlossen. Verhalten unveraendert."

## Regeln
- Starte unabhaengige Agenten IMMER parallel (Phase 2 und 5)
- Gib dem User nach jeder Phase eine kurze Statusmeldung
- Wenn ein Agent Fehler meldet, behebe sie bevor du fortfaehrst
- KEINE neuen Features oder Bugfixes waehrend des Refactorings
- KEINE Dokumentations-Phase — Refactoring aendert kein oeffentliches Verhalten
- Verwende TodoWrite um den Fortschritt fuer den User sichtbar zu machen
- Gib jedem Subagenten in seinem Auftrag den Hinweis: "Formuliere zuerst in 2-3 Saetzen, was du als Aufgabe verstanden hast, bevor du mit der Umsetzung beginnst. Beende deine Antwort mit ERLEDIGT wenn die Aufgabe vollstaendig abgeschlossen ist, oder mit ABBRUCH: [Grund] wenn du die Aufgabe nicht erledigen kannst."
- Schreibe nach JEDER abgeschlossenen Phase ein Wisdom-Summary in `.wisdom-accumulation-<SESSION_ID>.tmp.md` (append, nicht ueberschreiben)
- Gib JEDEM Subagenten die bisherigen Erkenntnisse aus `.wisdom-accumulation-<SESSION_ID>.tmp.md` als Kontext mit
