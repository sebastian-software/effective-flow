# 0005 — Designentscheidungs-Erkennung im /review Command

## Anforderung

Der `/review`-Command soll dokumentierte Designentscheidungen im Zielprojekt erkennen und Findings, die gegen bewusste Entscheidungen verstossen, nicht faelschlich als Probleme melden. Stattdessen werden sie transparent im Bericht als "uebersprungene Findings" dokumentiert.

## Architekturentscheidungen

### Zwei-Ebenen-Erkennung

Designentscheidungen werden auf zwei Ebenen erkannt:

1. **Phase 1 (Explore-Agent):** Durchsucht das Projekt nach dokumentierten Designentscheidungen aus verschiedenen Quellen (ADR, docs/plan/, CLAUDE.md, Code-Kommentare, Lint-Suppressions, vorherige Review-Reports). Fasst sie als strukturierte Liste zusammen und gibt sie an nachfolgende Agents weiter.
2. **Reviewer-Agents:** Erhalten den Kontext und pruefen zusaetzlich inline im Code auf Designentscheidungs-Kommentare.

**Begruendung:** Reine Phase-1-Erkennung wuerde inline-Kommentare in Dateien verpassen, die der Explore-Agent nicht liest. Reine Reviewer-Erkennung wuerde ADR-Dateien und CLAUDE.md verpassen, da Reviewer nur den Review-Scope sehen.

### Drei-stufiges Matching in Reviewern

1. **Direkter Match:** Konfidenz auf 0, markiert mit DD-Referenz → wird vom Orchestrator herausgefiltert
2. **Indirekter Match:** Normal berichten, aber Designentscheidung erwaehnen → Orchestrator entscheidet
3. **Kein Match:** Normal berichten

**Begruendung:** Nicht alle Findings die eine Designentscheidung beruehren sollen stumm gefiltert werden. Indirekte Matches koennten auf Seiteneffekte hinweisen die trotz bewusster Entscheidung beachtenswert sind.

### Transparenz statt stilles Filtern

Uebersprungene Findings werden nicht geloescht, sondern in einem eigenen Abschnitt "Uebersprungene Findings (Designentscheidungen)" im Bericht aufgefuehrt — mit Referenz zur konkreten Designentscheidung.

**Begruendung:** Der User soll nachvollziehen koennen, welche Findings uebersprungen wurden und warum. Das ermoeglicht auch die Erkennung veralteter Designentscheidungen.

## Betroffene Dateien

| Datei | Aenderung |
|---|---|
| `sf-frontend-workflows/commands/review.md` | Neue Section "Designentscheidungs-Erkennung" mit Quellen-Tabelle, erweiterte Phase 1 (Explore-Agent sucht DDs), erweiterter Reviewer-Auftrag in Phase 3, strukturierter DD-Abgleich in Phase 4, neuer Bericht-Abschnitt |
| `sf-frontend-workflows/agents/frontend-reviewer.md` | Neuer Abschnitt "Designentscheidungen respektieren", erweitertes Vorgehen, Ausgabeformat um Komplexitaet und Designentscheidung-Feld ergaenzt |
| `sf-frontend-workflows/agents/nodejs-reviewer.md` | Identische Erweiterungen wie frontend-reviewer |
| `README.md` | Neue Section "Designentscheidungs-Erkennung", aktualisierte /review-Beschreibung |

## Review-Findings

| Finding | Status |
|---|---|
| Ausgabeformat fehlte "Komplexitaet" (Kritisch) | Behoben — Feld in beide Reviewer ergaenzt |
| Ausgabeformat fehlte "Designentscheidung"-Feld (Wichtig) | Behoben — optionales Feld ergaenzt |
| nodejs-reviewer Vorgehen-Reihenfolge unlogisch (Wichtig) | Behoben — DD-Abgleich nach Kategorisierung verschoben |
| README ADR-Quellen unvollstaendig (Hinweis) | Nicht umgesetzt — README ist Kurzuebersicht, Details in review.md |
