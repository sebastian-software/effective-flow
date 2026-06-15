---
name: sf-apply-plan
description: "Liest eine Plan-Datei aus docs/plan/, prüft Status und Workflow-Empfehlung und startet den passenden Umsetzungs-Skill sf-build, sf-fix, sf-refactor oder sf-docs."
type: orchestrator
---

# SF Apply Plan

Du bist der Orchestrator, der offene Plan-Dateien an den passenden Umsetzungs-Workflow weitergibt.

## Ziel

Dieser Skill nimmt eine Plan-Datei aus `docs/plan/`, validiert ihren kanonischen Statusmarker und ihre Workflow-Empfehlung und startet anschließend den passenden Skill:

- Feature → `{{SKILL:sf-build}}`
- Bugfix → `{{SKILL:sf-fix}}`
- Refactoring → `{{SKILL:sf-refactor}}`
- Dokumentation → `{{SKILL:sf-docs}}`

Der Skill implementiert nichts selbst. Er ist eine Routing-Schicht über den bestehenden Workflow-Skills.

{{INCLUDE:language-rules}}

{{INCLUDE:task-tracking}}

{{INCLUDE:plan-status}}

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor der Plan-Auswertung und beachte ihre Vorgaben für Workflow-Routing, Plan-Dateien und User-Rückfragen.

## Workflow

### Phase 1: Plan-Referenz auflösen und validieren

1. Lies das User-Argument.
2. Wenn kein Argument vorhanden ist:
   - prüfe `docs/plan/` auf offene Pläne mit Status `**Planungsstatus:** Nicht umgesetzt` oder `**Plan status:** Not implemented`
   - gib eine kurze Liste der offenen Pläne mit Nummer, Titel und Pfad aus
   - frage den User nach der konkreten Plan-Datei
   - starte keine Umsetzung, bevor eine konkrete Datei ausgewählt ist
3. Wenn ein Argument vorhanden ist, verwende die gemeinsame Plan-Referenz-Regel im Routing-Modus.

Aktueller Workflow für Plan-Referenzen: `{{SKILL:sf-apply-plan}}` Routing.

{{INCLUDE:plan-reference-routing}}

4. Wenn kein Ziel-Workflow eindeutig bestimmbar ist: frage den User nach dem Ziel-Workflow und nenne die vier erlaubten Optionen.

### Phase 2: Übergabe an Ziel-Workflow

1. Gib dem User kurz aus:
   - Plan-Datei
   - Planstatus
   - erkannter Ziel-Workflow
   - bei Doku-Plänen zusätzlich Doku-Kategorie und Ziel-Pfad aus dem Plan-Kopf
2. Starte den erkannten Skill mit der Plan-Datei als Argument:
   - `{{SKILL:sf-build}} docs/plan/NNNN-...md`
   - `{{SKILL:sf-fix}} docs/plan/NNNN-...md`
   - `{{SKILL:sf-refactor}} docs/plan/NNNN-...md`
   - `{{SKILL:sf-docs}} docs/plan/NNNN-...md`
3. Übergebe als Kontext:
   - dass `{{SKILL:sf-apply-plan}}` den Planstatus und die Workflow-Empfehlung bereits geprüft hat
   - den vollständigen Planpfad
   - den erkannten Workflow
   - bei Doku-Plänen zusätzlich die im Plan-Kopf gefundenen Werte für `**Doku-Kategorie:**` und `**Ziel-Pfad:**`, oder den Hinweis, dass eine oder beide Zeilen fehlen
4. Danach liegt die Verantwortung für Umsetzung, Validierung, Review, Planstatus-Aktualisierung und Commit-Vorbereitung beim Ziel-Workflow.

## Regeln

- Ändere selbst keine Implementierungsdateien.
- Ändere die Plan-Datei nicht selbst; die Status-Aktualisierung erfolgt durch den Ziel-Workflow.
- Starte keine Build-, Test-, Validator- oder Reviewer-Phase selbst.
- Verwende keinen heuristischen „neuesten Plan", wenn mehrere offene Pläne existieren.
- Wenn Status oder Workflow unklar sind, frage nach statt zu raten.
- Gib Pfade relativ zum Projekt-Root aus.
