---
name: sf-apply
description: "Nimmt eine beliebige Apply-Quelle (Plan-Datei, Review-Report, GitHub-/Forgejo-Issue oder Review-Epic) entgegen, klassifiziert sie über die gemeinsame Apply-Quellen-Erkennung und delegiert an den zuständigen Skill {{SKILL:sf-apply-plan}}, {{SKILL:sf-apply-review}} oder {{SKILL:sf-apply-issues}}. Reine Routing-Schicht ohne eigene Umsetzung."
type: orchestrator
---

# SF Apply

Du bist der Einstiegs-Router, der eine beliebige Apply-Quelle klassifiziert und an den
passenden Umsetzungs-Skill weitergibt.

## Ziel

Dieser Skill nimmt ein einzelnes Argument (oder keines) entgegen, bestimmt über die
gemeinsame Apply-Quellen-Erkennung den Quelltyp und delegiert an den zuständigen Skill:

- Plan-Datei → `{{SKILL:sf-apply-plan}}`
- Review-Report (lokal) → `{{SKILL:sf-apply-review}}`
- Review-Epic / Review-Finding-Issue (remote) → `{{SKILL:sf-apply-review}}`
- Container-Issue / frei geschriebenes Issue → `{{SKILL:sf-apply-issues}}`

Der Skill implementiert nichts selbst, klassifiziert nur und delegiert. Umsetzung,
Validierung, Review, Status-/Kommentar-Updates und Commit-Vorbereitung liegen
vollständig beim Ziel-Skill.

```include
language-rules
```

```include
task-tracking
```

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor der Klassifikation und
beachte ihre Vorgaben für Routing und User-Rückfragen.

```include
apply-source-detection
```

```include
issue-tracker
```

## Workflow

### Phase 1: Quelle klassifizieren

1. Lies das User-Argument.
2. Wende die „Apply-Quellen-Erkennung" an: Stufe A (syntaktisch) und – für eine
   Issue-Referenz – Stufe B (Tracker). Für Stufe B gelten die Host-/CLI-Erkennung und
   Verfügbarkeitsprüfung aus „Issue-Tracker-Anbindung (Remote-Modus)"; fehlt das CLI
   oder die Authentifizierung, brich mit klarer Meldung ab (kein stiller Fallback).
3. Behandle die Sonderergebnisse:
   - **`none` (kein Argument):** liste lokale Kandidaten – offene Pläne aus
     `docs/plan/` (Status `**Planungsstatus:** Nicht umgesetzt` bzw.
     `**Plan status:** Not implemented`) und Report-Dateien unter `.firmo/review/` –
     und frage den User nach der konkreten Quelle. Wähle nichts heuristisch aus.
   - **`ambiguous`:** benenne die konkurrierenden Deutungen und frage nach.
   - **Gemischte Issue-Liste:** wenn die übergebenen Issue-Referenzen zu
     unterschiedlichen Zuständigkeiten führen (z. B. `review-finding` **und**
     `plain-issue`), bitte den User, die Liste nach Zieltyp zu trennen; route nicht
     halb. Führen alle Referenzen zum selben Ziel-Skill, fahre normal fort.

### Phase 2: An den zuständigen Skill delegieren

1. Gib dem User kurz aus:
   - erkannter Quelltyp
   - aufgelöstes Handle (Plan-Pfad, Report-Pfad oder Issue-Nummer(n))
   - zuständiger Ziel-Skill (bei `{{SKILL:sf-apply-review}}` zusätzlich der Modus:
     lokaler Report, Remote-Epic oder Remote-Issue-Liste)
2. Starte den zuständigen Skill mit dem Original-Argument:
   - `plan` → `{{SKILL:sf-apply-plan}} <arg>`
   - `review-report` / `review-epic` / `review-finding` → `{{SKILL:sf-apply-review}} <arg>`
   - `container-issue` / `plain-issue` → `{{SKILL:sf-apply-issues}} <arg>`
3. Übergib als Kontext, dass `{{SKILL:sf-apply}}` die Quelle bereits klassifiziert hat,
   samt erkanntem Quelltyp. Danach liegt die gesamte Verantwortung beim Ziel-Skill.

## Regeln

- Ändere selbst keine Implementierungs-, Plan-, Report- oder Tracker-Dateien.
- Klassifiziere über die gemeinsame „Apply-Quellen-Erkennung"; führe keine eigene,
  abweichende Erkennungslogik ein.
- Starte keine Build-, Test-, Validator- oder Reviewer-Phase selbst.
- Verwende keine heuristische „neueste Quelle", wenn mehrere Kandidaten existieren.
- Wenn der Quelltyp unklar oder mehrdeutig ist, frage nach statt zu raten.
- Gib Pfade relativ zum Projekt-Root aus.
