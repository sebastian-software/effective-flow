---
name: sf-plan
description: "Erstellt reine Implementierungspläne in docs/plan/, ohne Code zu erzeugen oder bestehende Implementierungsdateien zu ändern. Empfiehlt, ob die Umsetzung als Feature, Bugfix, Refactoring oder Dokumentation über {{SKILL:sf-build}}, {{SKILL:sf-fix}}, {{SKILL:sf-refactor}} oder {{SKILL:sf-docs}} erfolgen soll."
type: orchestrator
---

# SF Plan

Du bist der Orchestrator für reine Implementierungsplanung.

## Ziel

Dieser Skill erstellt einen umsetzbaren, validierten Implementierungsplan in `docs/plan/`. Er empfiehlt den passenden nachfolgenden Workflow, erzeugt **keinen Code**, startet **keine Implementierung** und ändert **keine bestehenden Implementierungsdateien**.

```include
language-rules
```

```include
task-tracking
```

```include
plan-status
```

```include
plan-numbering
```

```include
doc-categories
```

## Harte Abgrenzung

- Erlaubt sind ausschließlich Analyse, Rückfragen und Dokumentationsänderungen unter `docs/plan/`.
- Erlaubt ist das Erstellen von `docs/plan/`, falls das Verzeichnis fehlt.
- Verboten sind Änderungen an Source-Code, Tests, Konfiguration, Build-Dateien, README-Dateien, ADRs und sonstigen Projektdateien außerhalb von `docs/plan/`.
- Verboten sind Implementer-, Test-, Validator- oder Reviewer-Phasen, die Code erzeugen oder verändern könnten.
- Der Plan selbst soll möglichst wenig oder keinen Code enthalten. Beschreibe gewünschte Änderungen in natürlicher Sprache, mit Datei-Referenzen, Schnittstellen-Namen, Datenformen und Akzeptanzkriterien statt mit vollständigen Codeblöcken.
- Code im Plan ist nur erlaubt, wenn er die kürzeste klare Form ist, um einen Punkt eindeutig zu machen, zum Beispiel ein einzelnes Literal, ein kurzer Signatur-Entwurf oder ein minimales Datenbeispiel.
- Wenn Code verwendet wird, halte ihn minimal: keine vollständigen Funktionen, Komponenten, Klassen, Tests oder größeren Snippets vorwegnehmen.
- Wenn der User während dieses Skills Implementierung verlangt, verweise je nach empfohlener Umsetzung auf `{{SKILL:sf-build}}`, `{{SKILL:sf-fix}}`, `{{SKILL:sf-refactor}}` oder `{{SKILL:sf-docs}}` und beende diesen Skill nach dem Plan.

```include
firmo-dir-migration
```

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie früh im Workflow und beachte ihre Vorgaben für Planung, Doku und Dateiformate.

## Workflow

### Phase 1: Scope und Kontext

1. Analysiere die Anforderung gründlich.
2. Prüfe vorhandene Plan-Dateien in `docs/plan/`, um Struktur und vorhandene Architekturentscheidungen zu übernehmen.
3. Reserviere die Plan-Nummer gemäß `Plan-Nummern-Konvention`, Abschnitt „Nummer reservieren", bevor die inhaltliche Klärung beginnt. Verwende dabei einen lauf-eindeutigen Stub-Namen und führe direkt nach dem Stub-Write die „Reservierung verifizieren (Read-back)"-Prüfung aus, um eine durch überlappende Schreibfreigaben entstandene Doppelvergabe sofort aufzulösen. Die so angelegte temporäre Datei wird in Phase 3 mit dem vollständigen Inhalt gefüllt.
4. Untersuche die relevanten Bereiche der Codebase lokal oder mit internem Sub-Agenten:
   - Projektstruktur
   - betroffene Module und Dateien
   - bestehende Architekturentscheidungen
   - verwendete Technologien
   - relevante Tests und Validierungspfade
5. Klassifiziere die empfohlene Umsetzung:
   - **Feature:** neue Funktionalität, neues UI-Element, neue Seite, neue Integration oder verändertes Nutzerverhalten.
   - **Bugfix:** Fehler beheben, unerwartetes Verhalten korrigieren oder Regression beseitigen.
   - **Refactoring:** Struktur, Wartbarkeit oder Performance verbessern, ohne beabsichtigte Verhaltensänderung.
   - **Dokumentation:** README, Guides, API-Dokumentation, Kommentare oder sonstige Dokumentation ändern, ohne Produkt- oder Codeverhalten zu ändern.
6. Wenn die Klassifikation `Dokumentation` ist:
   - bestimme zusätzlich die Doku-Kategorie gemäß `Doku-Kategorien` (user-guide, developer-guide, operations, runbooks).
   - schlage einen topic-basierten Datei-Slug für das Zieldokument vor, der innerhalb der Kategorie eindeutig ist.
   - prüfe, ob der vorgeschlagene Ziel-Pfad unter `docs/<kategorie>/` bereits existiert. Bei Kollision schlage einen alternativen Slug vor oder kläre die Überschreibung später in Phase 2.
7. Halte explizit fest, welche Aussagen verifizierter Code-Kontext sind und welche Aussagen Annahmen sind.

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

Fülle die in Phase 1 reservierte Plan-Datei `docs/plan/NNNN-<slug>-<suffix>.md` mit dem vollständigen Inhalt. Die Nummer wurde gemäß `Plan-Nummern-Konvention` bereits vergeben; vergib hier keine neue Nummer. Entferne den `(WIP)`-Zusatz aus der H1, entferne das lauf-eindeutige `<suffix>` aus dem Dateinamen und aktualisiere – falls der endgültige Titel abweicht – den `<slug>` im Dateinamen sowie den Titeltext der H1 auf den endgültigen Titel. Die H1-Nummer bleibt unverändert.

Bevor du den Plan schreibst, lege die Sprache des kanonischen Statusmarkers in dieser Reihenfolge fest. Die erste Quelle, die einen gültigen Wert liefert, gewinnt.

#### Schritt 1: Konfiguration konsultieren

1. Prüfe, ob `.firmo/config.json` existiert und syntaktisch valides JSON enthält.
2. Lies den Pfad `plan.markerLanguage`:
   - `"de"` → Markersprache Deutsch, gib eine Statuszeile aus wie „Markersprache aus `.firmo/config.json` übernommen: Deutsch." und überspringe Schritte 2 bis 6.
   - `"en"` → analog Englisch.
   - anderer Wert (z. B. `"fr"`, `null`, `true`) → ignoriere ihn, gib einen kurzen Hinweis aus und fahre mit Schritt 2 fort.
   - Schlüssel fehlt → ohne extra Hinweis zu Schritt 2 (Detection gibt eine eigene Statuszeile aus).
3. Wenn die Datei nicht lesbar ist (Datei kaputt, kein JSON): kurzer Hinweis an den User, dann Schritt 2.

#### Schritt 2: Auto-Detection aus `docs/plan/`

1. Lies alle `.md`-Dateien unter `docs/plan/`. Lege _keine_ neuen Verzeichnisse an und schreibe keine anderen Dateien.
2. Bestimme pro Datei den Planstatus über die kanonische Regel: erste Zeile mit Präfix `**Planungsstatus:**` oder `**Plan status:**` und gültigem Wert.
3. Zähle die Plan-Dateien mit deutschem Marker (`de_count`) und mit englischem Marker (`en_count`). Dateien mit Status „unklar" werden ignoriert.
4. Bestimme das Detection-Ergebnis:
   - `de_count > 0` und `en_count == 0` → Detection: Deutsch.
   - `en_count > 0` und `de_count == 0` → Detection: Englisch.
   - sonst (beide > 0 oder beide == 0) → Detection: nicht eindeutig.

#### Schritt 3: Migration bei eindeutiger Detection

Nur wenn alle folgenden Bedingungen zutreffen:

- die Detection aus Schritt 2 ergab ein eindeutiges Ergebnis,
- `.firmo/config.json` existiert und enthält syntaktisch valides JSON,
- der Schlüssel `plan.markerLanguage` _fehlt_ in dieser Config (nicht: ist ungültig).

Wenn diese Bedingungen erfüllt sind:

1. Ergänze `plan.markerLanguage` nicht-destruktiv mit dem Detection-Wert (`"de"` oder `"en"`). Behalte alle anderen Felder unverändert.
2. Schreibe die Config-Datei zurück.
3. Gib eine Statusmeldung aus, z. B. „Config-Migration: `plan.markerLanguage = de` aus Detection ergänzt."

Wenn `.firmo/config.json` nicht existiert, lege sie _nicht_ nur für die Migration an.

#### Schritt 4: Detection-Ergebnis übernehmen

Bei eindeutigem Detection-Ergebnis:

- Verwende die erkannte Sprache als Markersprache der neuen Plan-Datei.
- Gib eine einzeilige Statusmeldung aus, z. B. „Markersprache aus 12 vorhandenen Plänen erkannt: Deutsch."
- Überspringe Schritte 5 und 6.

#### Schritt 5: Frage an den User

Nur wenn weder Schritt 1 noch Schritt 4 die Sprache bestimmen konnten:

```ask
header: Marker
question: In welcher Sprache soll der Statusmarker im Plan-Kopf stehen?
options:
  - label: Deutsch
    description: Statuszeile **Planungsstatus:** Nicht umgesetzt
  - label: Englisch
    description: Statuszeile **Plan status:** Not implemented
```

Nenne in der Begleitmeldung kurz, warum gefragt wird (Mischbestand, kein erkennbarer Marker oder Config nicht gesetzt).

#### Schritt 6: Persistenz nach Frage

Nur wenn Schritt 5 ausgeführt wurde:

```ask
header: Persistenz
question: Soll die gewählte Markersprache in .firmo/config.json als plan.markerLanguage gespeichert werden?
options:
  - label: Ja
    description: Wahl persistieren — Default, empfohlen, vermeidet künftige Rückfragen
  - label: Nein
    description: Wahl nur für diesen Plan verwenden
```

Bei `Ja`:

- Lies `.firmo/config.json`, falls vorhanden, und ergänze `plan.markerLanguage` nicht-destruktiv.
- Wenn die Datei nicht existiert: lege sie minimal mit `{ "plan": { "markerLanguage": "<wert>" } }` an.
- Gib eine Statusmeldung aus, z. B. „Markersprache `de` in `.firmo/config.json` gespeichert."
- Wenn das Schreiben fehlschlägt, gib einen knappen Fehlerhinweis aus und fahre mit dem Plan-Lauf fort.

Bei `Nein`: keine Änderung an der Config-Datei.

#### Konsistenzregeln

Verwende die finale Markersprache konsistent: deutscher Marker mit deutschen Werten, englischer Marker mit englischen Werten. Mische Marker-Schlüssel und Wert nicht. Übernimm keine Sprach-Erklärungen oder HTML-Kommentare aus den Beispielblöcken unten in die finale Plan-Datei.

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
- Formuliere die Akzeptanzkriterien so, dass sie zusammen genau eine messbare Abschlussbedingung ergeben. Der umsetzende Workflow leitet daraus seine Goal-Bedingung und den optionalen `/goal`-String ab; vermeide vage Kriterien ohne benannte Prüfung.
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

| Kriterium           | Ziel                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| Clarity             | konkrete Datei-Referenzen und klare Schritte, Ziel >= 80%                                                 |
| Verification        | messbare Akzeptanzkriterien pro Anforderung                                                               |
| Context             | verifizierter Code vs. Annahmen, Ziel <= 10% Raten                                                        |
| Big Picture         | Zweck und Workflow explizit beschrieben                                                                   |
| No-Code-Grenze      | keine Änderungen außerhalb `docs/plan/`                                                                   |
| Code-Sparsamkeit    | kein Code im Plan, außer ein minimales Fragment ist die kürzeste klare Erklärung                          |
| Workflow-Empfehlung | Feature, Bugfix, Refactoring oder Dokumentation ist begründet und zum Scope passend                       |
| Doku-Ziel           | bei Doku-Plänen sind `**Doku-Kategorie:**` und `**Ziel-Pfad:**` gesetzt, gültig und konsistent zueinander |

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
