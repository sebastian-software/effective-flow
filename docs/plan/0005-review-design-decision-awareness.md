# 0005 — Designentscheidungs-Erkennung im /review Command

## Anforderung

Der `/review`-Command soll dokumentierte Designentscheidungen im Zielprojekt erkennen und Findings, die gegen bewusste Entscheidungen verstossen, nicht fälschlich als Probleme melden. Stattdessen werden sie transparent im Bericht als "übersprungene Findings" dokumentiert.

## Architekturentscheidungen

### Zwei-Ebenen-Erkennung

Designentscheidungen werden auf zwei Ebenen erkannt:

1. **Phase 1 (Explore-Agent):** Durchsucht das Projekt nach dokumentierten Designentscheidungen aus verschiedenen Quellen (ADR, docs/plan/, CLAUDE.md, Code-Kommentare, Lint-Suppressions, vorherige Review-Reports). Fasst sie als strukturierte Liste zusammen und gibt sie an nachfolgende Agents weiter.
2. **Reviewer-Agents:** Erhalten den Kontext und prüfen zusätzlich inline im Code auf Designentscheidungs-Kommentare.

**Begründung:** Reine Phase-1-Erkennung würde inline-Kommentare in Dateien verpassen, die der Explore-Agent nicht liest. Reine Reviewer-Erkennung würde ADR-Dateien und CLAUDE.md verpassen, da Reviewer nur den Review-Scope sehen.

### Drei-stufiges Matching in Reviewern

1. **Direkter Match:** Konfidenz auf 0, markiert mit DD-Referenz → wird vom Orchestrator herausgefiltert
2. **Indirekter Match:** Normal berichten, aber Designentscheidung erwähnen → Orchestrator entscheidet
3. **Kein Match:** Normal berichten

**Begründung:** Nicht alle Findings die eine Designentscheidung berühren sollen stumm gefiltert werden. Indirekte Matches könnten auf Seiteneffekte hinweisen die trotz bewusster Entscheidung beachtenswert sind.

### Transparenz statt stilles Filtern

Übersprungene Findings werden nicht gelöscht, sondern in einem eigenen Abschnitt "Übersprungene Findings (Designentscheidungen)" im Bericht aufgeführt — mit Referenz zur konkreten Designentscheidung.

**Begründung:** Der User soll nachvollziehen können, welche Findings übersprungen wurden und warum. Das ermöglicht auch die Erkennung veralteter Designentscheidungen.

## Betroffene Dateien

| Datei                                               | Änderung                                                                                                                                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sf-frontend-workflows/commands/review.md`          | Neue Section "Designentscheidungs-Erkennung" mit Quellen-Tabelle, erweiterte Phase 1 (Explore-Agent sucht DDs), erweiterter Reviewer-Auftrag in Phase 3, strukturierter DD-Abgleich in Phase 4, neuer Bericht-Abschnitt |
| `sf-frontend-workflows/agents/frontend-reviewer.md` | Neuer Abschnitt "Designentscheidungen respektieren", erweitertes Vorgehen, Ausgabeformat um Komplexität und Designentscheidung-Feld ergänzt                                                                             |
| `sf-frontend-workflows/agents/nodejs-reviewer.md`   | Identische Erweiterungen wie frontend-reviewer                                                                                                                                                                          |
| `README.md`                                         | Neue Section "Designentscheidungs-Erkennung", aktualisierte /review-Beschreibung                                                                                                                                        |

## Review-Findings

| Finding                                                  | Status                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------- |
| Ausgabeformat fehlte "Komplexität" (Kritisch)            | Behoben — Feld in beide Reviewer ergänzt                         |
| Ausgabeformat fehlte "Designentscheidung"-Feld (Wichtig) | Behoben — optionales Feld ergänzt                                |
| nodejs-reviewer Vorgehen-Reihenfolge unlogisch (Wichtig) | Behoben — DD-Abgleich nach Kategorisierung verschoben            |
| README ADR-Quellen unvollständig (Hinweis)               | Nicht umgesetzt — README ist Kurzübersicht, Details in review.md |
