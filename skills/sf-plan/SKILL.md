---
name: sf-plan
description: "Erstellt reine Implementierungspläne in docs/plan/, ohne Code zu erzeugen oder bestehende Implementierungsdateien zu ändern. Empfiehlt, ob die Umsetzung als Feature, Bugfix, Refactoring oder Dokumentation über {{SKILL:sf-build}}, {{SKILL:sf-fix}}, {{SKILL:sf-refactor}} oder {{SKILL:sf-docs}} erfolgen soll."
type: orchestrator
---

# SF Plan

Du bist der Orchestrator für reine Implementierungsplanung.

## Ziel

Dieser Skill erstellt einen umsetzbaren, validierten Implementierungsplan in `docs/plan/`. Er empfiehlt den passenden nachfolgenden Workflow, erzeugt **keinen Code**, startet **keine Implementierung** und ändert **keine bestehenden Implementierungsdateien**.

{{INCLUDE:language-rules}}

{{INCLUDE:task-tracking}}

{{INCLUDE:plan-status}}

{{INCLUDE:doc-categories}}

## Harte Abgrenzung

- Erlaubt sind ausschließlich Analyse, Rückfragen und Dokumentationsänderungen unter `docs/plan/`.
- Erlaubt ist das Erstellen von `docs/plan/`, falls das Verzeichnis fehlt.
- Verboten sind Änderungen an Source-Code, Tests, Konfiguration, Build-Dateien, README-Dateien, ADRs und sonstigen Projektdateien außerhalb von `docs/plan/`.
- Verboten sind Implementer-, Test-, Validator- oder Reviewer-Phasen, die Code erzeugen oder verändern könnten.
- Der Plan selbst soll möglichst wenig oder keinen Code enthalten. Beschreibe gewünschte Änderungen in natürlicher Sprache, mit Datei-Referenzen, Schnittstellen-Namen, Datenformen und Akzeptanzkriterien statt mit vollständigen Codeblöcken.
- Code im Plan ist nur erlaubt, wenn er die kürzeste klare Form ist, um einen Punkt eindeutig zu machen, zum Beispiel ein einzelnes Literal, ein kurzer Signatur-Entwurf oder ein minimales Datenbeispiel.
- Wenn Code verwendet wird, halte ihn minimal: keine vollständigen Funktionen, Komponenten, Klassen, Tests oder größeren Snippets vorwegnehmen.
- Wenn der User während dieses Skills Implementierung verlangt, verweise je nach empfohlener Umsetzung auf `{{SKILL:sf-build}}`, `{{SKILL:sf-fix}}`, `{{SKILL:sf-refactor}}` oder `{{SKILL:sf-docs}}` und beende diesen Skill nach dem Plan.

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie früh im Workflow und beachte ihre Vorgaben für Planung, Doku und Dateiformate.

## Workflow

### Phase 1: Scope und Kontext

1. Analysiere die Anforderung gründlich.
2. Prüfe vorhandene Plan-Dateien in `docs/plan/`, um Nummernschema, Struktur und vorhandene Architekturentscheidungen zu übernehmen.
3. Untersuche die relevanten Bereiche der Codebase lokal oder mit internem Sub-Agenten:
   - Projektstruktur
   - betroffene Module und Dateien
   - bestehende Architekturentscheidungen
   - verwendete Technologien
   - relevante Tests und Validierungspfade
4. Klassifiziere die empfohlene Umsetzung:
   - **Feature:** neue Funktionalität, neues UI-Element, neue Seite, neue Integration oder verändertes Nutzerverhalten.
   - **Bugfix:** Fehler beheben, unerwartetes Verhalten korrigieren oder Regression beseitigen.
   - **Refactoring:** Struktur, Wartbarkeit oder Performance verbessern, ohne beabsichtigte Verhaltensänderung.
   - **Dokumentation:** README, Guides, API-Dokumentation, Kommentare oder sonstige Dokumentation ändern, ohne Produkt- oder Codeverhalten zu ändern.
5. Wenn die Klassifikation `Dokumentation` ist:
   - bestimme zusätzlich die Doku-Kategorie gemäß `Doku-Kategorien` (user-guide, developer-guide, operations, runbooks).
   - schlage einen topic-basierten Datei-Slug für das Zieldokument vor, der innerhalb der Kategorie eindeutig ist.
   - prüfe, ob der vorgeschlagene Ziel-Pfad unter `docs/<kategorie>/` bereits existiert. Bei Kollision schlage einen alternativen Slug vor oder kläre die Überschreibung später in Phase 2.
6. Halte explizit fest, welche Aussagen verifizierter Code-Kontext sind und welche Aussagen Annahmen sind.

### Phase 2: Klärung

1. Identifiziere alle wirklich relevanten Unklarheiten:
   - gewünschtes Verhalten
   - fachliche Regeln
   - technische Vorgaben
   - Abhängigkeiten
   - Edge Cases
   - Akzeptanzkriterien
   - bei Doku-Plänen zusätzlich: Doku-Kategorie und Ziel-Pfad, falls in Phase 1 nicht eindeutig bestimmbar
2. Frage den User nach jeder relevanten Unklarheit.
3. Wiederhole die Klärung, bis keine offenen Punkte mehr bestehen, die eine belastbare Planung verhindern.
4. Wenn eine Unsicherheit unwichtig für die Umsetzung ist, dokumentiere sie als Annahme statt den Workflow zu blockieren.

### Phase 3: Plan-Erstellung

Erstelle eine neue Markdown-Datei in `docs/plan/` mit der nächsten freien Nummer im bestehenden vierstelligen Schema, zum Beispiel `0030-feature-name.md`.

Bevor du den Plan schreibst, lege die Sprache des kanonischen Statusmarkers fest:

{{ASK}}
header: Marker
question: In welcher Sprache soll der Statusmarker im Plan-Kopf stehen?
options:
  - label: Deutsch
    description: Statuszeile **Planungsstatus:** Nicht umgesetzt — Default-Variante
  - label: Englisch
    description: Statuszeile **Plan status:** Not implemented
{{/ASK}}

Verwende die gewählte Sprache konsistent: deutscher Marker mit deutschen Werten, englischer Marker mit englischen Werten. Mische Marker-Schlüssel und Wert nicht. Übernimm keine Sprach-Erklärungen oder HTML-Kommentare aus den Beispielblöcken unten in die finale Plan-Datei.

Der Plan muss mindestens diese Struktur verwenden. Verwende je nach gewählter Markersprache eine der beiden Statuszeilen, nicht beide:

Statuszeile Deutsch:

```markdown
**Planungsstatus:** Nicht umgesetzt
```

Statuszeile Englisch:

```markdown
**Plan status:** Not implemented
```

Vollständiges Plan-Template (Statuszeile gemäß gewählter Markersprache einsetzen):

```markdown
# NNNN: [Titel]

**Planungsstatus:** Nicht umgesetzt
**Quelle:** {{SKILL:sf-plan}}
**Empfohlener Workflow:** Feature (`{{SKILL:sf-build}}`) / Bugfix (`{{SKILL:sf-fix}}`) / Refactoring (`{{SKILL:sf-refactor}}`) / Dokumentation (`{{SKILL:sf-docs}}`)
<!-- Nur bei Empfohlenem Workflow: Dokumentation: -->
**Doku-Kategorie:** user-guide | developer-guide | operations | runbooks
**Ziel-Pfad:** docs/<kategorie>/<topic-slug>.md

## Anforderung

[Anforderung, Ziel und Begründung der Workflow-Empfehlung]

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

## Plan-Review

**Ergebnis:** Freigegeben / Überarbeiten

### Zusammenfassung

| Bereich | Kritisch | Wichtig | Hinweis |
|---|---:|---:|---:|
| Architektur | 0 | 0 | 0 |
| Security | 0 | 0 | 0 |
| Datenschutz | 0 | 0 | 0 |
| Fehlerfälle | 0 | 0 | 0 |
| Testbarkeit | 0 | 0 | 0 |
| Scope | 0 | 0 | 0 |
| Wartbarkeit | 0 | 0 | 0 |

### Befunde

- Keine Befunde. / [Befund mit Bereich, Schweregrad, Problem und Anpassung]
```

Regeln:

- Entferne nicht relevante optionale Unterabschnitte oder schreibe knapp „Nicht relevant" mit Begründung.
- Nutze konkrete Datei-Referenzen, sobald sie aus der Codebase ableitbar sind.
- Schreibe den Plan als Umsetzungsanleitung, nicht als Vorab-Implementierung.
- Vermeide Codeblöcke im Plan. Nutze sie nur, wenn eine kurze Codeformulierung klarer und kürzer ist als eine prose Beschreibung.
- Wenn ein Codebeispiel nötig ist, begrenze es auf das kleinste aussagekräftige Fragment und dokumentiere, dass es ein Beispiel oder eine Schnittstellenskizze ist.
- Ergänze einen Abschnitt `## Plan-Review` gemäß Template. Er enthält ausschließlich Befunde auf Plan-Ebene, keine Code-Review-Findings.
- Schreibe keine `## Testergebnisse` und keine `## Review-Findings`, weil noch nichts implementiert wurde.
- Setze den kanonischen offenen Planstatus exakt entsprechend der in Phase 3 gewählten Markersprache: deutsch auf `**Planungsstatus:** Nicht umgesetzt` oder englisch auf `**Plan status:** Not implemented`; `{{SKILL:sf-build}}`, `{{SKILL:sf-fix}}`, `{{SKILL:sf-refactor}}` und `{{SKILL:sf-docs}}` nutzen diesen Status später, um die Planungs- bzw. Analysegrundlage zu erkennen.
- Setze genau eine Zeile `**Empfohlener Workflow:** ...` im Kopfbereich. Wähle eine der vier Kategorien Feature, Bugfix, Refactoring oder Dokumentation und nenne den passenden Skill in Klammern.
- Bei `**Empfohlener Workflow:** Dokumentation (`{{SKILL:sf-docs}}`)` setze direkt darunter die beiden zusätzlichen Zeilen `**Doku-Kategorie:** ...` und `**Ziel-Pfad:** ...` gemäß `Doku-Kategorien`. Lasse den HTML-Kommentar `<!-- Nur bei ... -->` und die beiden Zeilen für die anderen drei Workflows aus dem Kopfbereich weg.

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
| Workflow-Empfehlung | Feature, Bugfix, Refactoring oder Dokumentation ist begründet und zum Scope passend |
| Doku-Ziel | bei Doku-Plänen sind `**Doku-Kategorie:**` und `**Ziel-Pfad:**` gesetzt, gültig und konsistent zueinander |

Wenn ein Kriterium nicht erfüllt ist, überarbeite den Plan oder frage den User nach der fehlenden Information.

### Phase 6: Plan-Review

Führe vor dem Abschluss einen Review des Plans selbst durch. Dieser Review prüft die geplanten Änderungen auf Plan-Ebene und ist **kein Code-Review**.

Regeln:

- Starte keine normalen Reviewer-Skills, Implementer, Test-Writer oder Validatoren.
- Ändere weiterhin nur die Plan-Datei unter `docs/plan/`.
- Prüfe die geplanten Änderungen gegen den verifizierten Code-Kontext aus Phase 1.
- Gib keine vollständigen Codevorschläge aus; halte dich an die Code-Sparsamkeitsregel.

Prüfe mindestens diese Bereiche:

- **Architektur:** Passt der Plan zu bestehenden Patterns, Modulgrenzen, Zuständigkeiten und Abstraktionsebenen?
- **Security:** Führt der Plan neue Eingaben, Auth-/Permission-Pfade, Secrets, Netzwerkzugriffe, Dateizugriffe, externe Prozesse oder Persistenz ein?
- **Datenschutz:** Werden sensible Daten verarbeitet, geloggt, gespeichert, exportiert oder länger aufbewahrt?
- **Fehlerfälle:** Sind Failure Modes, Recovery, idempotentes Verhalten, Race Conditions und Edge Cases ausreichend abgedeckt?
- **Testbarkeit:** Sind Akzeptanzkriterien und Validierungsplan konkret genug, um die spätere Umsetzung zu prüfen?
- **Scope:** Enthält der Plan Scope Creep, versteckte Nebenfeatures oder zu vage Teilaufgaben?
- **Wartbarkeit:** Erzeugt der Plan unnötige Kopplung, neue Abhängigkeiten, Migrationslast oder schwer erweiterbare Strukturen?

Klassifiziere Befunde:

- **Kritisch:** Plan darf nicht abgeschlossen werden, bevor der Befund eingearbeitet ist.
- **Wichtig:** Befund soll eingearbeitet werden; wenn bewusst nicht, dokumentiere die Begründung im Plan.
- **Hinweis:** Optionaler Verbesserungs- oder Prüfpunkt.

Vorgehen:

1. Prüfe den Plan anhand der Bereiche oben.
2. Arbeite alle kritischen Befunde direkt in den Plan ein.
3. Arbeite wichtige Befunde ein oder dokumentiere im `## Plan-Review`, warum sie bewusst nicht umgesetzt werden.
4. Aktualisiere den Abschnitt `## Plan-Review` mit Ergebnis, Zusammenfassung und Befunden.
5. Wenn nach der Überarbeitung weiterhin kritische Befunde bestehen, frage den User nach der fehlenden Entscheidung und schließe den Plan nicht ab.

### Phase 7: Abschluss

1. Schreibe die Plan-Datei.
2. Formatiere nur die neue Plan-Datei, falls ein Formatter für Markdown klar konfiguriert ist.
3. Melde dem User:
   - Pfad der erzeugten Plan-Datei
   - kurze Zusammenfassung des geplanten Vorgehens
   - empfohlener Workflow mit Begründung
   - Scorecard-Ergebnis
   - Hinweis, dass keine Code-Änderungen vorgenommen wurden
   - Hinweis, welcher Skill-Aufruf den Plan später umsetzt, zum Beispiel `{{SKILL:sf-build}} docs/plan/NNNN-...md`, `{{SKILL:sf-fix}} docs/plan/NNNN-...md`, `{{SKILL:sf-refactor}} docs/plan/NNNN-...md` oder `{{SKILL:sf-docs}} docs/plan/NNNN-...md`

## Regeln

- Starte keine Implementierungsphase.
- Führe keine Tests aus, die Projektdateien ändern könnten.
- Erstelle keine Commits.
- Gib dem User nach jeder Phase eine kurze Statusmeldung.
- Wenn der Plan wegen fehlender Informationen nicht belastbar wäre, frage nach statt zu raten.
