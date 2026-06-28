# 0030: Reiner Planungs-Skill für Feature-Workflows

## Anforderung

Es soll ein reiner Planungs-Skill entstehen, der ausschließlich einen
Implementierungsplan in `docs/plan/` erzeugt und explizit keinen Code schreibt.
Der bestehende `sf-build`-Workflow soll seinen Planungsteil auslagern und
den neuen Planungs-Skill verwenden. Wenn `sf-build` mit einer bereits
erzeugten, noch nicht umgesetzten Plan-Datei aufgerufen wird, soll die
Planungsphase übersprungen und der Plan direkt umgesetzt werden.

## Architekturentscheidungen

- **Neuer Orchestrator `sf-plan`:** Der Planungsmodus ist ein eigener
  Orchestrator-Skill, damit User ihn direkt per `$sf-plan` bzw. in Claude
  per `/plan` aufrufen können.
- **Harte No-Code-Grenze im Plan-Skill:** `sf-plan` darf nur unter
  `docs/plan/` schreiben. Damit ist die Abgrenzung nicht nur implizit durch den
  Namen, sondern als Workflow-Regel dokumentiert.
- **Code-Sparsamkeit im Plan:** Plan-Dateien sollen keine vorweggenommene
  Implementierung enthalten. Codebeispiele sind nur erlaubt, wenn ein minimales
  Fragment die kürzeste klare Erklärung ist.
- **Plan-Status als Übergabevertrag:** Plan-Dateien aus `sf-plan`
  enthalten `**Planungsstatus:** Nicht umgesetzt`. `sf-build` nutzt
  diesen Status, um referenzierte Pläne ohne erneute Planung umzusetzen.
- **Abschluss aktualisiert denselben Plan:** Wenn ein Plan umgesetzt wurde,
  aktualisiert `sf-build` die referenzierte oder frisch erzeugte
  Plan-Datei und setzt den Status auf `Umgesetzt`, statt einen zweiten Plan als
  Duplikat zu erzeugen.
- **Build-System bleibt unverändert:** Der vorhandene `build.mjs` erkennt alle
  `skills/sf-*`-Verzeichnisse automatisch. Ein neues Skill-Verzeichnis reicht
  aus, um Codex- und Claude-Artefakte zu erzeugen.

## Betroffene Dateien

| Datei                                                                          | Beschreibung                                                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `skills/sf-plan/SKILL.md`                                                      | Neuer Orchestrator für reine Feature-Planung mit No-Code-Regeln, Plan-Template, Gap Analysis und Scorecard    |
| `skills/sf-build/SKILL.md`                                                     | Planung an `sf-plan` delegiert, Plan-Referenz-Erkennung ergänzt, Abschluss aktualisiert bestehende Plan-Datei |
| `build.mjs`                                                                    | Marketplace-Beschreibung um `plan` ergänzt                                                                    |
| `README.md`                                                                    | Neuen Orchestrator in Übersicht und Struktur dokumentiert                                                     |
| `docs/plan/0030-plan-skill.md`                                                 | Audit-Trail dieser Änderung                                                                                   |
| `dist/codex/skills/sf-plan/SKILL.md`                                           | Generierter Codex-Skill nach Build                                                                            |
| `dist/codex/skills/sf-build/SKILL.md`                                          | Generierter Codex-Skill nach Build                                                                            |
| `dist/claude/sf-claude-plugin/plugins/sf-frontend-workflows/commands/plan.md`  | Generierter Claude-Command nach Build                                                                         |
| `dist/claude/sf-claude-plugin/plugins/sf-frontend-workflows/commands/build.md` | Generierter Claude-Command nach Build                                                                         |

## Implementierungsdetails

### Neuer Planungs-Skill

`sf-plan` führt Scope-Analyse, Codebase-Kontext, Klärungsfragen, Plan-
Erstellung, Gap Analysis und Plan-Validierung aus. Er schreibt eine neue Datei in
`docs/plan/` mit der nächsten freien vierstelligen Nummer und dem Status
`Nicht umgesetzt`.

Der Skill verbietet ausdrücklich Änderungen außerhalb von `docs/plan/`, Commits,
Implementierungsphasen und Agenten, die Code erzeugen könnten. Dadurch kann er als
reiner Vorbereitungsmodus verwendet werden.

Zusätzlich verlangt `sf-plan`, dass der Plan selbst keine Vorab-Implementierung
enthält. Geplante Änderungen werden primär in natürlicher Sprache, mit
Datei-Referenzen, Schnittstellen-Namen, Datenformen und Akzeptanzkriterien
beschrieben. Code ist nur als kleinstes aussagekräftiges Fragment erlaubt, wenn
das kürzer und klarer ist als eine reine Beschreibung.

### Anpassung in `sf-build`

Vor Phase 1 erkennt `sf-build` Plan-Referenzen wie
`docs/plan/0030-feature.md`, `0030-feature.md` oder `0030`. Bei eindeutigem
Status `Nicht umgesetzt` wird Phase 1 übersprungen und Phase 2 nutzt die
Plan-Datei als abgestimmten Implementierungsplan.

Ohne Plan-Referenz startet Phase 1 den neuen `sf-plan`-Skill. Nach dessen
Abschluss liest `sf-build` die Plan-Datei, prüft Status,
Akzeptanzkriterien, Validierungsplan und Datei-Konkretheit, fragt nach Freigabe
und beginnt erst danach mit der Implementierung.

### Abschlussverhalten

Phase 7 schreibt nicht mehr grundsätzlich eine neue Plan-Datei. Stattdessen wird
die aus Phase 1 oder aus der User-Referenz stammende Plan-Datei aktualisiert,
Testergebnisse und Review-Findings werden ergänzt, und der Planungsstatus wird
auf `Umgesetzt` gesetzt.

## Testergebnisse

- `node build.mjs` lief fehlerfrei durch.
- Der Build erzeugte 8 Codex-Skills und 8 Claude-Commands, darunter
  `sf-plan`.
- Die generierten Outputs für Codex und Claude enthalten die neue
  Plan-Referenz-Logik in `sf-build`.

## Review-Findings

**Datum:** 2026-05-14
**Reviewer:** keiner

Diese Änderung betrifft ausschließlich Skill-Workflow-Dokumente und generierte
Plugin-Artefakte. Eine separate Reviewer-Phase wurde nicht gestartet; die
Validierung erfolgte über den Build und gezielte Inspektion der generierten
Outputs.
