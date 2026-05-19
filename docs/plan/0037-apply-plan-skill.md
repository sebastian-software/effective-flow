# 0037: Apply-Plan-Skill

**Planungsstatus:** Umgesetzt
**Quelle:** $sf-build
**Empfohlener Workflow:** Feature (`$sf-build`)

## Anforderung

Es soll ein neuer Skill `sf-apply-plan` entstehen, der eine Plan-Datei aus `docs/plan/` einliest, den kanonischen Planstatus und die Workflow-Empfehlung prüft und die Umsetzung an den passenden Workflow weitergibt. Der Skill ist ein Komfort-Orchestrator für offene Pläne und ersetzt keine Implementierungslogik.

## Architekturentscheidungen

- `sf-apply-plan` wird als `type: orchestrator` unter `skills/sf-apply-plan/SKILL.md` angelegt, damit Codex daraus `$sf-apply-plan` und Claude Code daraus `/apply-plan` generiert.
- Der Skill implementiert nicht selbst, sondern routet strikt anhand `**Empfohlener Workflow:**` an `$sf-build`, `$sf-fix`, `$sf-refactor` oder `$sf-docs`.
- Der Skill nutzt dieselbe Planstatus-Konvention wie die bestehenden Workflow-Skills und behandelt fehlende, mehrdeutige oder bereits umgesetzte Statuswerte konservativ.
- `build.mjs` muss nicht strukturell erweitert werden, weil es alle `skills/sf-*`-Verzeichnisse automatisch scannt. Nur Marketplace-/README-Texte müssen `apply-plan` nennen.

## Betroffene Dateien

| Datei | Beschreibung |
|---|---|
| `skills/sf-apply-plan/SKILL.md` | Neuer Orchestrator für Plan-Auflösung, Statusprüfung und Workflow-Routing |
| `README.md` | Orchestratoren-Tabelle und Plan-Workflow-Dokumentation ergänzen |
| `build.mjs` | Marketplace-Beschreibung um `apply-plan` ergänzen |
| `docs/plan/0037-apply-plan-skill.md` | Plan nach Umsetzung abschließen |

## Implementierungsdetails

### Vorgehen

1. Neuen Skill `sf-apply-plan` mit Frontmatter `type: orchestrator` erstellen.
2. Argumentauflösung für Plan-Dateien beschreiben:
   - direkte Pfade wie `docs/plan/0033-gemini-cli-platform-target.md`
   - Dateinamen wie `0033-gemini-cli-platform-target.md`
   - Nummern wie `0033`
3. Statusprüfung exakt über die erste Zeile mit Präfix `**Planungsstatus:**` definieren.
4. Workflow-Empfehlung im Kopfbereich auswerten und eindeutig auf `$sf-build`, `$sf-fix`, `$sf-refactor` oder `$sf-docs` mappen.
5. Bei offenem Plan den passenden Workflow mit der Plan-Datei als Argument starten.
6. Bei unklarem oder bereits umgesetztem Plan nachfragen statt automatisch zu starten.
7. README und Marketplace-Beschreibung aktualisieren.
8. Build ausführen und generierte Codex-/Claude-Artefakte prüfen.

### Edge Cases

- Mehrere Plan-Dateien passen zu einer Nummer oder einem Namen: User nach der konkreten Datei fragen.
- Planstatus fehlt oder ist widersprüchlich: nicht automatisch umsetzen.
- Plan ist bereits `Umgesetzt`: User fragen, ob erneut umgesetzt, nur geprüft oder abgebrochen werden soll.
- Workflow-Empfehlung fehlt oder ist nicht eindeutig: User um Ziel-Workflow bitten.
- Workflow-Empfehlung ist zwar erkennbar, enthält aber keinen Skill-Namen: anhand der Kategorie Feature, Bugfix, Refactoring oder Dokumentation routen.

## Akzeptanzkriterien

- [x] `skills/sf-apply-plan/SKILL.md` existiert und beschreibt den Routing-Workflow.
- [x] `node build.mjs` erzeugt Codex- und Claude-Code-Artefakte für `apply-plan`.
- [x] README listet `sf-apply-plan` als Orchestrator.
- [x] Die generierten Artefakte enthalten keine untransformierten `{{INCLUDE:...}}`, `{{SKILL:...}}`, `{{AGENT:...}}` oder `{{ASK}}`-Platzhalter.
- [x] Der Planstatus dieser Datei wird nach Umsetzung auf `Umgesetzt` gesetzt.

## Validierungsplan

- `node build.mjs`
- `node --check build.mjs`
- `rg -n "\\{\\{INCLUDE:|\\{\\{SKILL:|\\{\\{AGENT:|\\{\\{ASK" dist/codex dist/claude`
- Prüfen, dass `dist/codex/skills/sf-apply-plan/SKILL.md` und `dist/claude/sf-claude-plugin/plugins/sf-frontend-workflows/commands/apply-plan.md` erzeugt werden.

## Annahmen und offene Punkte

- Annahme: Der Skill soll nicht selbst parallelisieren oder implementieren, sondern den bestehenden Workflow-Skills den Plan als Argument übergeben.
- Annahme: Wenn keine Plan-Datei angegeben ist, soll der Skill offene Pläne anzeigen und nach einer konkreten Auswahl fragen statt blind den neuesten Plan zu verwenden.
- Offener Punkt: Eine spätere Version könnte mehrere offene Pläne in einem Batch routen; das ist nicht Teil dieser Umsetzung.

## Plan-Review

**Ergebnis:** Freigegeben

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

- Keine Befunde.

## Testergebnisse

- `node build.mjs` bestanden; erzeugt wurden 11 Codex-Skills, 9 Codex-Agents, 11 Claude-Code-Commands und 9 Claude-Code-Agents.
- `node --check build.mjs` bestanden.
- `rg -n "\\{\\{INCLUDE:|\\{\\{SKILL:|\\{\\{AGENT:|\\{\\{ASK" dist/codex dist/claude` fand keine untransformierten Platzhalter.
- `test -f dist/codex/skills/sf-apply-plan/SKILL.md && test -f dist/claude/sf-claude-plugin/plugins/sf-frontend-workflows/commands/apply-plan.md` bestätigt beide generierten Artefakte.
- `git diff --check` bestanden.

## Review-Findings

Keine Findings gefunden.
