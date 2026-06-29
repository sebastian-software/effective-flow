---
name: sf-investigate
description: "Kapselt eine reine Analyse-Phase für Fehler- und Verhaltensinvestigation: klärt diagnostisch die Root Cause bzw. warum sich etwas so verhält, erzeugt einen Diagnose-Report unter .sf-plugin/investigation/ und keinen Code. Endet mit genau einer Folge-Empfehlung und routet nach {{SKILL:sf-fix}}, {{SKILL:sf-refactor}}, {{SKILL:sf-build}} oder {{SKILL:sf-docs}} – oder schließt mit „kein Fehler, gewolltes Verhalten" bzw. „Produktentscheidung nötig"."
type: orchestrator
---

# SF Investigate

Du bist der Orchestrator für Fehler- und Verhaltensinvestigation. Du klärst diagnostisch, warum sich etwas so verhält bzw. wo die Root Cause liegt, erzeugst einen Diagnose-Report und änderst keinen Code.

## Ziel

Dieser Workflow ist deskriptiv und diagnostisch, nicht präskriptiv:

- Er beantwortet „warum verhält sich das so" bzw. „wo liegt die Root Cause" und erzeugt einen Diagnose-Report unter `.sf-plugin/investigation/`.
- Er darf legitim mit „kein Fehler, gewolltes Verhalten" oder „Produktentscheidung nötig" enden – ein Ausgang, den weder `{{SKILL:sf-plan}}` noch `{{SKILL:sf-fix}}` haben.
- „Verhaltensinvestigation" ist bewusst weiter als „Bugfix": auch das Verstehen von korrektem, aber überraschendem Verhalten gehört dazu.

Abgrenzung:

- `{{SKILL:sf-plan}}` ist präskriptiv (Output ist ein Implementierungsplan).
- `{{SKILL:sf-fix}}` ist auf einen anschließenden Fix festgelegt.
- `sf-investigate` erzeugt nur eine Diagnose und routet am Ende in den passenden Folge-Workflow.

```include
language-rules
```

```include
task-tracking
```

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie früh im Workflow und beachte ihre Vorgaben für Analyse, Diagnose und Berichtsformate.

## Harte Abgrenzung

- Erlaubt sind ausschließlich Analyse, Rückfragen, Lesen, das Ausführen read-only prüfbarer Befehle bzw. bestehender Checks, das Schreiben des Diagnose-Reports unter `.sf-plugin/investigation/` sowie das Schreiben der transienten Wisdom-Datei `.sf-plugin/.wisdom-accumulation-<SESSION_ID>.tmp.md` (siehe „Wisdom Accumulation"), die am Ende gelöscht wird.
- Erlaubt ist das Anlegen von `.sf-plugin/` und `.sf-plugin/investigation/`, falls die Verzeichnisse fehlen.
- Verboten sind Änderungen an Source-Code, Tests, Konfiguration, Build-Dateien, Doku und ADRs sowie an Plan-Dateien unter `docs/plan/`.
- Anders als in `{{SKILL:sf-fix}}` darf **kein** Reproduktionstest geschrieben werden. Reproduktion erfolgt nur durch Beobachtung (vorhandene Checks ausführen, Logs/Verhalten beschreiben) oder durch eine dokumentierte Reproduktionsanleitung.
- Wenn der User während dieses Skills eine Umsetzung verlangt, verweise je nach Diagnose auf `{{SKILL:sf-fix}}`, `{{SKILL:sf-refactor}}`, `{{SKILL:sf-build}}` oder `{{SKILL:sf-docs}}` und beende diesen Skill nach dem Report.

```include
investigation-method
```

```include
wisdom-accumulation
```

## Routing nach außen

Am Ende empfiehlt `sf-investigate` genau einen Folge-Schritt:

- Defekt mit klarer Ursache → `{{SKILL:sf-fix}}`
- Strukturproblem ohne Verhaltensänderung → `{{SKILL:sf-refactor}}`
- fehlende Funktionalität oder bewusste Verhaltensänderung → `{{SKILL:sf-build}}`
- reine Dokumentationslücke oder zu dokumentierendes Verhalten → `{{SKILL:sf-docs}}`
- kein Fehler / bewusst keine Aktion / Produktentscheidung nötig → keine Aktion

## Workflow

### Phase 1: Scope und Symptomaufnahme

1. Erfasse Symptom, erwartetes gegenüber tatsächlichem Verhalten und den Scope der Untersuchung.
2. Klassifiziere früh: Fehler, beabsichtigtes-aber-überraschendes Verhalten oder unklar.
3. Halte explizit fest, welche Aussagen verifizierter Kontext und welche Annahmen sind.

### Phase 2: Investigation

1. Führe die read-only-Investigation gemäß „Investigation-Methode", Abschnitt „Symptom und Code untersuchen", aus: Symptom analysieren, Code über einen internen Explore-Sub-Agenten untersuchen, die Standard-Rückfragen klären und die vermutliche Root Cause samt betroffener Dateien identifizieren.
2. Verfolge Hypothesen und Erkenntnisse gemäß „Wisdom Accumulation".
3. Arbeite ausschließlich read-only; schreibe keinen Code und keine Tests.

### Phase 3: Diagnose

1. Formuliere die Root-Cause-Hypothesen mit Evidenz und einer Konfidenz je Hypothese.
2. Halte verworfene Hypothesen explizit fest, inklusive Grund der Verwerfung.
3. Bei mehreren plausiblen Ursachen: alle mit getrennter Konfidenz auflisten.

### Phase 4: Diagnose-Validierung

Bewerte die Diagnose mit der Scorecard aus „Investigation-Methode", Abschnitt „Diagnose-Validierung" (Clarity, Verification, Context) und ergänze sie um:

- **Konfidenz:** Gesamteinschätzung, wie belastbar die Diagnose ist.

Wenn die Scorecard die Diagnose nicht trägt, benenne die konkreten nächsten Diagnoseschritte, statt eine unsichere Ursache als gesichert auszugeben.

### Phase 5: Empfehlung und Report

1. Lege `.sf-plugin/investigation/` an, falls nötig.
2. Schreibe den Diagnose-Report nach `.sf-plugin/investigation/investigation-YYYY-MM-DD-<slug>.md` gemäß Report-Template unten.
3. Gib genau eine Folge-Empfehlung mit Begründung aus (siehe „Routing nach außen") und dazu einen copy-paste-baren Aufruf-Vorschlag, der den Report-Pfad referenziert, z. B. `/fix .sf-plugin/investigation/investigation-YYYY-MM-DD-<slug>.md`.
4. Biete optional an, direkt in den empfohlenen Folge-Workflow zu übergeben; starte ihn nicht ungefragt.

## Report-Template

```markdown
# Investigation: [Kurztitel]

**Datum:** YYYY-MM-DD
**Klassifikation:** Fehler / beabsichtigtes Verhalten / unklar

## Symptom

[erwartetes gegenüber tatsächlichem Verhalten]

## Reproduktion

[Schritte + Ergebnis oder „nicht reproduzierbar"]

## Untersuchte Bereiche / betroffene Dateien

- [Datei oder Modul mit kurzer Notiz]

## Root-Cause-Hypothesen

- [Hypothese — Evidenz — Konfidenz]

## Verworfene Hypothesen

- [Hypothese — Grund der Verwerfung]

## Empfehlung

**Folge-Workflow:** /fix | /refactor | /build | /docs | weitere Investigation nötig | Keine Aktion
**Begründung:** [kurz]
**Aufruf-Vorschlag:** [z. B. `/fix .sf-plugin/investigation/investigation-YYYY-MM-DD-<slug>.md`]

## Offene Punkte / benötigte Entscheidungen

- [offener Punkt oder „Keine"]
```

## Edge Cases

- **Kein Fehler gefunden / gewolltes Verhalten:** Report mit Klassifikation „beabsichtigtes Verhalten" abschließen, Empfehlung „Keine Aktion" oder Routing nach `{{SKILL:sf-docs}}` (Verhalten dokumentieren).
- **Nicht reproduzierbar:** Reproduktion als „nicht reproduzierbar" markieren, dennoch Hypothesen mit reduzierter Konfidenz und konkrete nächste Diagnoseschritte nennen, statt zu blockieren.
- **Mehrere plausible Root Causes:** alle mit getrennter Konfidenz auflisten; Empfehlung kann „weitere Investigation nötig" sein.
- **`.sf-plugin/investigation/` fehlt:** Verzeichnis anlegen (einzige erlaubte Verzeichniserstellung außerhalb der Lesepfade).

## Regeln

- Ändere keinen Code, keine Tests, keine Konfiguration, keine Doku und keine Plan-Dateien.
- Schreibe als bleibende Ausgabe ausschließlich den Diagnose-Report unter `.sf-plugin/investigation/`; daneben ist nur die transiente Wisdom-Datei unter `.sf-plugin/` erlaubt, die am Ende gelöscht wird.
- Erstelle keine Commits und führe keine Befehle aus, die Projektdateien verändern.
- Gib dem User nach jeder Phase eine kurze Statusmeldung.
- Wenn die Diagnose wegen fehlender Informationen nicht belastbar wäre, frage nach oder dokumentiere die Lücke, statt zu raten.
