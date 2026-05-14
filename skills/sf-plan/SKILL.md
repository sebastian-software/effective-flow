---
name: sf-plan
description: "Erstellt reine Feature-Implementierungspläne in docs/plan/, ohne Code zu erzeugen oder bestehende Implementierungsdateien zu ändern. Klärt offene Fragen, analysiert die Codebase und schreibt einen validierten Plan, der später von {{SKILL:sf-build}} umgesetzt werden kann."
type: orchestrator
---

# SF Plan

Du bist der Orchestrator für reine Feature-Planung.

## Ziel

Dieser Skill erstellt einen umsetzbaren, validierten Implementierungsplan in `docs/plan/`. Er erzeugt **keinen Code**, startet **keine Implementierung** und ändert **keine bestehenden Implementierungsdateien**.

{{INCLUDE:language-rules}}

{{INCLUDE:task-tracking}}

## Harte Abgrenzung

- Erlaubt sind ausschließlich Analyse, Rückfragen und Dokumentationsänderungen unter `docs/plan/`.
- Erlaubt ist das Erstellen von `docs/plan/`, falls das Verzeichnis fehlt.
- Verboten sind Änderungen an Source-Code, Tests, Konfiguration, Build-Dateien, README-Dateien, ADRs und sonstigen Projektdateien außerhalb von `docs/plan/`.
- Verboten sind Implementer-, Test-, Validator- oder Reviewer-Phasen, die Code erzeugen oder verändern könnten.
- Der Plan selbst soll möglichst wenig oder keinen Code enthalten. Beschreibe gewünschte Änderungen in natürlicher Sprache, mit Datei-Referenzen, Schnittstellen-Namen, Datenformen und Akzeptanzkriterien statt mit vollständigen Codeblöcken.
- Code im Plan ist nur erlaubt, wenn er die kürzeste klare Form ist, um einen Punkt eindeutig zu machen, zum Beispiel ein einzelnes Literal, ein kurzer Signatur-Entwurf oder ein minimales Datenbeispiel.
- Wenn Code verwendet wird, halte ihn minimal: keine vollständigen Funktionen, Komponenten, Klassen, Tests oder größeren Snippets vorwegnehmen.
- Wenn der User während dieses Skills Implementierung verlangt, verweise auf `{{SKILL:sf-build}}` und beende diesen Skill nach dem Plan.

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie früh im Workflow und beachte ihre Vorgaben für Planung, Doku und Dateiformate.

## Workflow

### Phase 1: Scope und Kontext

1. Analysiere die Feature-Anforderung gründlich.
2. Prüfe vorhandene Plan-Dateien in `docs/plan/`, um Nummernschema, Struktur und vorhandene Architekturentscheidungen zu übernehmen.
3. Untersuche die relevanten Bereiche der Codebase lokal oder mit internem Sub-Agenten:
   - Projektstruktur
   - betroffene Module und Dateien
   - bestehende Architekturentscheidungen
   - verwendete Technologien
   - relevante Tests und Validierungspfade
4. Halte explizit fest, welche Aussagen verifizierter Code-Kontext sind und welche Aussagen Annahmen sind.

### Phase 2: Klärung

1. Identifiziere alle wirklich relevanten Unklarheiten:
   - gewünschtes Verhalten
   - fachliche Regeln
   - technische Vorgaben
   - Abhängigkeiten
   - Edge Cases
   - Akzeptanzkriterien
2. Frage den User nach jeder relevanten Unklarheit.
3. Wiederhole die Klärung, bis keine offenen Punkte mehr bestehen, die eine belastbare Planung verhindern.
4. Wenn eine Unsicherheit unwichtig für die Umsetzung ist, dokumentiere sie als Annahme statt den Workflow zu blockieren.

### Phase 3: Plan-Erstellung

Erstelle eine neue Markdown-Datei in `docs/plan/` mit der nächsten freien Nummer im bestehenden vierstelligen Schema, zum Beispiel `0030-feature-name.md`.

Der Plan muss mindestens diese Struktur verwenden:

```markdown
# NNNN: [Titel]

**Planungsstatus:** Nicht umgesetzt
**Quelle:** {{SKILL:sf-plan}}

## Anforderung

[Feature-Anforderung und Ziel]

## Architekturentscheidungen

- [Entscheidung mit Begründung]

## Betroffene Dateien

| Datei | Beschreibung |
|---|---|
| `pfad/datei` | [geplante Änderung] |

## Implementierungsdetails

### Vorgehen

1. [konkreter Umsetzungsschritt]

### Komponenten-Struktur

[Nur falls relevant]

### State-Management

[Nur falls relevant]

### API-Anbindung

[Nur falls relevant]

### Styling-Ansatz

[Nur falls relevant]

### Barrierefreiheit

[Nur falls relevant]

### Edge Cases

- [Edge Case und erwartetes Verhalten]

## Akzeptanzkriterien

- [ ] [messbares Kriterium]

## Validierungsplan

- [geplanter Test, Check oder manuelle Prüfung]

## Annahmen und offene Punkte

- [Annahme oder bewusst dokumentierter Restpunkt]
```

Regeln:

- Entferne nicht relevante optionale Unterabschnitte oder schreibe knapp „Nicht relevant" mit Begründung.
- Nutze konkrete Datei-Referenzen, sobald sie aus der Codebase ableitbar sind.
- Schreibe den Plan als Umsetzungsanleitung, nicht als Vorab-Implementierung.
- Vermeide Codeblöcke im Plan. Nutze sie nur, wenn eine kurze Codeformulierung klarer und kürzer ist als eine prose Beschreibung.
- Wenn ein Codebeispiel nötig ist, begrenze es auf das kleinste aussagekräftige Fragment und dokumentiere, dass es ein Beispiel oder eine Schnittstellenskizze ist.
- Schreibe keine `## Testergebnisse` und keine `## Review-Findings`, weil noch nichts implementiert wurde.
- Setze `**Planungsstatus:** Nicht umgesetzt`; `{{SKILL:sf-build}}` nutzt diesen Status später, um den Planungsteil zu überspringen.

### Phase 4: Gap Analysis

Prüfe den Plan auf:

- Over-Engineering
- Scope Creep
- unausgesprochene Annahmen
- fehlende Akzeptanzkriterien
- Edge Cases
- versteckte Intentionen
- Umsetzungsrisiken

Bereinige den Plan, bevor du ihn als abgeschlossen meldest.

### Phase 5: Plan-Validierung

Bewerte den Plan mit einer Scorecard:

| Kriterium | Ziel |
|---|---|
| Clarity | konkrete Datei-Referenzen und klare Schritte, Ziel >= 80% |
| Verification | messbare Akzeptanzkriterien pro Anforderung |
| Context | verifizierter Code vs. Annahmen, Ziel <= 10% Raten |
| Big Picture | Zweck und Workflow explizit beschrieben |
| No-Code-Grenze | keine Änderungen außerhalb `docs/plan/` |
| Code-Sparsamkeit | kein Code im Plan, außer ein minimales Fragment ist die kürzeste klare Erklärung |

Wenn ein Kriterium nicht erfüllt ist, überarbeite den Plan oder frage den User nach der fehlenden Information.

### Phase 6: Abschluss

1. Schreibe die Plan-Datei.
2. Formatiere nur die neue Plan-Datei, falls ein Formatter für Markdown klar konfiguriert ist.
3. Melde dem User:
   - Pfad der erzeugten Plan-Datei
   - kurze Zusammenfassung des geplanten Vorgehens
   - Scorecard-Ergebnis
   - Hinweis, dass keine Code-Änderungen vorgenommen wurden
   - Hinweis, dass `{{SKILL:sf-build}} docs/plan/NNNN-...md` den Plan später umsetzt

## Regeln

- Starte keine Implementierungsphase.
- Führe keine Tests aus, die Projektdateien ändern könnten.
- Erstelle keine Commits.
- Gib dem User nach jeder Phase eine kurze Statusmeldung.
- Wenn der Plan wegen fehlender Informationen nicht belastbar wäre, frage nach statt zu raten.
