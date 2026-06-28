# 0044: Maintain-Skill

**Planungsstatus:** Umgesetzt
**Quelle:** $sf-build
**Empfohlener Workflow:** Feature (`$sf-build`)

## Anforderung

Es soll ein neuer, bewusst schlanker Orchestrator `sf-maintain` entstehen, der wiederkehrende Wartungsarbeiten an einem Zielprojekt steuert. Der scharfe Fokus liegt auf drei Aufgaben:

1. **Dependency-Updates** (outdated Packages hochziehen, gruppiert nach Patch/Minor/Major),
2. **Security-/Audit-Fixes** (z. B. `npm audit` / `pnpm audit`),
3. **Breaking-Change-Adaption** bei Major-Bumps (Code an geänderte APIs anpassen).

Der Skill implementiert nichts selbst, sondern orchestriert die vorhandenen Worker. Er ist explizit **kein** Sammeltopf für beliebige Wartung (kein Dead-Code-Sweep, kein Formatting, kein Config-Tuning – das decken `sf-refactor` und `sf-code-validator` ab) und **kein** Scheduler (das übernehmen Renovate/Dependabot).

## Architekturentscheidungen

- `sf-maintain` wird als `type: orchestrator` unter `skills/sf-maintain/SKILL.md` angelegt, damit `build.mjs` daraus den Codex-Skill `$sf-maintain` und das Claude-Code-Command `/maintain` erzeugt. Die automatische `sf-*`-Verzeichnis-Erkennung im Build genügt; es ist keine strukturelle Build-Änderung nötig.
- Delegation an bestehende Worker statt neuer Agent: `sf-code-validator` (Build/Lint/Types), `sf-test-writer` (bestehende Tests als Regression ausführen, keine neuen schreiben), `sf-ui-implementer`/`sf-nodejs-implementer` (Breaking-Change-Code-Anpassung), `sf-frontend-reviewer`/`sf-nodejs-reviewer` (Review nur wenn Code angepasst wurde).
- Vorher/Nachher-Sicherheitsnetz analog `sf-refactor`: grüne Baseline vor dem ersten Bump, Regressionsabgleich nach jeder Gruppe.
- Gruppenweises Vorgehen mit User-Gate: sichere Updates (Patch/Minor mit grüner Validierung) als Batch, Major-Bumps einzeln mit Migrationshinweis. Entscheidung über `{{ASK}}`.
- Package-Manager-Erkennung über Lockfile (`pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `bun.lockb` → bun, sonst `package-lock.json`/npm). Befehle werden aus dem erkannten Manager abgeleitet, keine Hardcodierung auf npm.
- Wiederverwendung der gemeinsamen Includes (`language-rules`, `task-tracking`, `completion-protocol`, `pre-commit-gate`, `commit-message-rules`) für Konsistenz mit den übrigen Orchestratoren.
- Bewusst **ohne** Plan-Datei-/Planstatus-Maschinerie: `sf-maintain` ist ein wiederkehrender Pflegelauf, kein planbasierter Feature-Workflow. Es schreibt keinen `docs/plan/`-Eintrag, kann aber offene Findings als Review-Report auslagern.

## Betroffene Dateien

| Datei                              | Beschreibung                                                           |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `skills/sf-maintain/SKILL.md`      | Neuer Orchestrator für Dependency-/Audit-Wartung mit Worker-Delegation |
| `README.md`                        | Orchestratoren-Tabelle um `sf-maintain` ergänzen                       |
| `build.mjs`                        | Marketplace-Plugin-Beschreibung um `maintain` ergänzen                 |
| `version.txt`                      | Minor-Bump auf 1.35.0 (neues Feature)                                  |
| `docs/plan/0044-maintain-skill.md` | Plan nach Umsetzung abschließen                                        |

## Implementierungsdetails

### Workflow des Skills

- **Phase 0 – Scope-Gate:** Bestätigen, dass es um Wartung (Deps/Audit) geht; bei Feature/Bugfix/Refactoring an den passenden Workflow verweisen. Package-Manager und Projekt-Typ erkennen.
- **Phase 1 – Scan:** Outdated-Dependencies und Audit-Befunde des erkannten Managers sammeln, klassifizieren (Patch/Minor/Major, Security-relevant, Tests vorhanden?). Ergebnis als Gruppenübersicht präsentieren und per `{{ASK}}` klären, welche Gruppen umgesetzt werden.
- **Phase 2 – Baseline:** Parallel `{{AGENT:sf-code-validator}}` und bestehende Tests via `{{AGENT:sf-test-writer}}` ausführen, um eine grüne Ausgangsbasis zu dokumentieren.
- **Phase 3 – Apply pro Gruppe:** Je Gruppe Bump anwenden → bei Breaking Changes Changelog/Migration lesen und Code über den passenden Implementer anpassen → `{{AGENT:sf-code-validator}}` + Tests → bei Erfolg ein sauberer Commit pro Gruppe. Schlägt eine Gruppe fehl und ist nicht reparabel, wird sie zurückgerollt und als „manuell" markiert.
- **Phase 4 – Review:** Nur wenn Code für Breaking Changes angepasst wurde, den passenden Reviewer auf die geänderten Dateien ansetzen.
- **Phase 5 – Report & Abschluss:** Zusammenfassen, was durchging und was manuelle Entscheidung braucht. Offene Findings gemäß `unresolved-review-report` nach `.sf-plugin/review/` auslagern.

### Konsistenz mit bestehenden Skills

- Frontmatter, Platzhalter-Syntax und Include-Nutzung exakt wie bei `sf-refactor`/`sf-fix`.
- Projekt-Typ-Erkennung und Implementer-/Reviewer-Routing per Verweis auf `{{SKILL:sf-build}}`, nicht dupliziert.
- `{{INCLUDE:pre-commit-gate}}` und `{{INCLUDE:commit-message-rules}}` für commitnahe Phasen.

### Edge Cases

- Kein Lockfile / kein `package.json`: Scope-Gate meldet, dass kein unterstütztes Node-Projekt erkannt wurde, und bricht ab.
- Keine outdated Dependencies und keine Audit-Befunde: früh und sauber beenden („nichts zu tun").
- Rote Baseline (Tests/Build schon vor Updates kaputt): nicht updaten, sondern an `sf-fix` verweisen, da Regressionen sonst nicht unterscheidbar sind.
- Major-Bump ohne Tests im betroffenen Bereich: ausdrücklich als erhöhtes Risiko markieren und einzeln bestätigen lassen.
- Monorepo/Workspaces: im ersten Wurf auf das Wurzel-Manifest fokussieren; Workspace-weite Strategie als offener Punkt.

## Akzeptanzkriterien

- [x] `skills/sf-maintain/SKILL.md` existiert mit `type: orchestrator` und beschreibt den 6-phasigen Wartungs-Workflow.
- [x] Der Skill delegiert ausschließlich an bestehende Worker und führt kein neues Agent-Frontmatter ein.
- [x] `node build.mjs` erzeugt `dist/codex/skills/sf-maintain/SKILL.md` und `dist/claude/sf-claude-plugin/plugins/sf-frontend-workflows/commands/maintain.md`.
- [x] Die generierten Artefakte enthalten keine untransformierten `{{INCLUDE:...}}`, `{{SKILL:...}}`, `{{AGENT:...}}` oder `{{ASK}}`-Platzhalter.
- [x] README listet `sf-maintain` in der Orchestratoren-Tabelle; die Marketplace-Beschreibung in `build.mjs` nennt `maintain`.
- [x] Der Planstatus dieser Datei wird nach Umsetzung auf `Umgesetzt` gesetzt.

## Validierungsplan

- `node --check build.mjs`
- `node build.mjs`
- `rg -n "\{\{INCLUDE:|\{\{SKILL:|\{\{AGENT:|\{\{ASK" dist/codex dist/claude`
- Prüfen, dass `dist/codex/skills/sf-maintain/SKILL.md` und `dist/claude/sf-claude-plugin/plugins/sf-frontend-workflows/commands/maintain.md` erzeugt werden.
- Sichtprüfung des generierten `/maintain`-Commands auf saubere Platzhalter-Auflösung der `{{ASK}}`-Blöcke.

## Annahmen und offene Punkte

- Annahme: Der Skill bleibt bewusst Node/JS-fokussiert (npm/pnpm/yarn/bun), passend zum übrigen Plugin-Scope.
- Annahme: Kein eigener Plan-Datei-Eintrag pro Lauf; Wartung ist wiederkehrend, nicht planbasiert.
- Offener Punkt: Workspace-/Monorepo-weite Update-Strategie und automatische Batch-Mehrgruppen-Commits sind nicht Teil dieser Umsetzung.

## Testergebnisse

- `node --check build.mjs` bestanden.
- `node build.mjs` bestanden; erzeugt 12 Codex-Skills, 9 Codex-Agents, 12 Claude-Code-Commands und 9 Claude-Code-Agents (vorher 11 Skills/Commands).
- `rg -n "\{\{INCLUDE:|\{\{SKILL:|\{\{AGENT:|\{\{ASK" dist/codex dist/claude` fand keine untransformierten Platzhalter.
- `dist/codex/skills/sf-maintain/SKILL.md` und `dist/claude/sf-claude-plugin/plugins/sf-frontend-workflows/commands/maintain.md` werden erzeugt.
- Sichtprüfung: `{{ASK}}`-Block wird für Claude als `AskUserQuestion`-Parameterliste und für Codex als Freitextfrage korrekt aufgelöst.

## Review-Findings

Keine Findings gefunden.
