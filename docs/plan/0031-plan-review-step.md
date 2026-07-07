# 0031: Plan-Review im Plan-Skill

**Planungsstatus:** Umgesetzt

## Anforderung

Der `sf-plan`-Skill soll vor dem Abschluss einen Review-Schritt erhalten, der den
erstellten Plan auf Plan-Ebene prüft. Der Review soll insbesondere
architektonische Probleme, Security-Risiken und weitere Umsetzungsrisiken
erkennen, ohne Code zu erzeugen oder einen normalen Code-Review zu starten.

## Architekturentscheidungen

- **Plan-Review statt Code-Review:** Der neue Schritt bewertet den Plan selbst,
  nicht bereits implementierten Code. Dadurch bleibt `sf-plan` ein reiner
  Planungs-Skill.
- **Keine Reviewer-Skills:** `sf-frontend-reviewer` und `sf-nodejs-reviewer`
  werden nicht gestartet, weil sie auf Code-Review ausgelegt sind. Der Review ist
  eine interne Checkliste im `sf-plan`-Workflow.
- **Blockierende kritische Befunde:** Kritische Plan-Befunde müssen vor Abschluss
  eingearbeitet werden. Wenn dafür eine Produkt- oder Architekturentscheidung
  fehlt, fragt der Skill den User.
- **Audit im Plan:** Jeder erzeugte Plan erhält einen Abschnitt `## Plan-Review`
  mit Ergebnis, Zusammenfassung und Befunden. Damit kann `sf-build` später auf
  einen geprüften Plan aufsetzen.
- **No-Code-Grenze bleibt erhalten:** Der Review darf keine Implementierung
  starten und muss die bestehende Code-Sparsamkeitsregel einhalten.

## Betroffene Dateien

| Datei                                                                         | Beschreibung                                                                                                      |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `skills/sf-plan/SKILL.md`                                                     | Plan-Template um `## Plan-Review` erweitert; neue Phase 6 „Plan-Review“ ergänzt; Abschluss auf Phase 7 verschoben |
| `docs/plan/0031-plan-review-step.md`                                          | Audit-Trail dieser Änderung                                                                                       |
| `dist/codex/skills/sf-plan/SKILL.md`                                          | Generierter Codex-Skill nach Build                                                                                |
| `dist/claude/sf-claude-plugin/plugins/sf-frontend-workflows/commands/plan.md` | Generierter Claude-Command nach Build                                                                             |

## Implementierungsdetails

Der Plan-Review prüft mindestens:

- Architektur: bestehende Patterns, Modulgrenzen, Zuständigkeiten und
  Abstraktionsebenen
- Security: neue Eingaben, Auth-/Permission-Pfade, Secrets, Netzwerkzugriffe,
  Dateizugriffe, externe Prozesse und Persistenz
- Datenschutz: sensible Daten, Logging, Speicherung, Export und Aufbewahrung
- Fehlerfälle: Failure Modes, Recovery, idempotentes Verhalten, Race Conditions
  und Edge Cases
- Testbarkeit: konkrete Akzeptanzkriterien und Validierungsplan
- Scope: Scope Creep, versteckte Nebenfeatures und vage Teilaufgaben
- Wartbarkeit: Kopplung, Abhängigkeiten, Migrationslast und Erweiterbarkeit

Befunde werden als `Kritisch`, `Wichtig` oder `Hinweis` klassifiziert. Kritische
Befunde blockieren den Abschluss. Wichtige Befunde werden eingearbeitet oder mit
Begründung im Plan dokumentiert. Hinweise bleiben optional.

## Testergebnisse

- `node build.mjs` lief fehlerfrei durch.
- Die generierten Codex- und Claude-Ausgaben enthalten die neue Phase
  `Plan-Review` sowie das `## Plan-Review`-Template.
- `git diff --check` lief ohne Befund.

## Review-Findings

**Datum:** 2026-05-14
**Reviewer:** keiner

Diese Änderung betrifft ausschließlich Skill-Workflow-Dokumente und generierte
Plugin-Artefakte. Eine separate Reviewer-Phase wurde nicht gestartet; die
Validierung erfolgte über Build und gezielte Inspektion der generierten Outputs.
