# 0036: Dokumentations-Workflow als eigener Skill

**Planungsstatus:** Umgesetzt
**Quelle:** $sf-plan
**Empfohlener Workflow:** Feature (`$sf-build`)

## Anforderung

Es soll ein eigener Dokumentations-Skill entstehen, der analog zu `sf-build`, `sf-refactor` und `sf-fix` als Top-Level-Orchestrator arbeitet, aber auf Dokumentationsänderungen spezialisiert ist. Zusätzlich soll `sf-review` bei passenden Findings den neuen Dokumentations-Skill als Folgeaktion vorschlagen können.

Der Plan ist ein Feature-Plan, weil ein neuer nutzbarer Orchestrator samt Review-/Apply-Review-Integration ergänzt wird. Der spätere Skill selbst ist auf Dokumentation spezialisiert.

## Architekturentscheidungen

- **Neuer Orchestrator `sf-docs`:** Dokumentationsarbeit bekommt einen eigenen Top-Level-Skill statt weiter als docs-only Sonderfall in `sf-build` zu laufen.
- **Spezialisierte Delegation statt neuer Agent:** Der Orchestrator nutzt vorhandene Agents `sf-docs-writer`, `sf-code-documenter` und bei Bedarf `sf-code-validator`; dadurch bleibt die Architektur konsistent und vermeidet doppelte Doku-Implementierung.
- **Plan-Dateien als Grundlage erlauben:** `sf-docs` soll wie `sf-build`, `sf-fix` und `sf-refactor` offene Plan-Dateien aus `docs/plan/` lesen und anhand `**Planungsstatus:** Nicht umgesetzt` sowie `**Empfohlener Workflow:** Dokumentation` einordnen.
- **Review-Aktion erweitern:** `sf-review` soll dokumentationsbezogene Findings als `sf-docs` klassifizieren können, etwa fehlende README-Abschnitte, veraltete Beispiele, falsche CLI-Doku oder fehlende Migrationshinweise.
- **Apply-Review mitziehen:** Wenn `sf-review` `sf-docs` als Aktion ausgibt, muss `sf-apply-review` diese Findings ebenfalls gruppieren und delegieren können; sonst entstehen Reports, die nicht automatisiert anwendbar sind.
- **`sf-plan` empfiehlt künftig `sf-docs`:** Dokumentationspläne sollen nicht mehr `sf-build` docs-only empfehlen, sondern den neuen `sf-docs`-Workflow.

## Betroffene Dateien

| Datei                             | Beschreibung                                                               |
| --------------------------------- | -------------------------------------------------------------------------- |
| `skills/sf-docs/SKILL.md`         | Neuer Dokumentations-Orchestrator                                          |
| `skills/sf-plan/SKILL.md`         | Workflow-Empfehlung für Dokumentation auf `sf-docs` umstellen              |
| `skills/sf-build/SKILL.md`        | Dokumentations-Sonderfall reduzieren oder an `sf-docs` verweisen           |
| `skills/sf-review/SKILL.md`       | `sf-docs` als Finding-Aktion, Berichtsspalte und Prompt-Vorschlag ergänzen |
| `skills/sf-apply-review/SKILL.md` | `sf-docs`-Findings als Aktionsgruppe erkennen und delegieren               |
| `README.md`                       | Neuen Orchestrator und Plan-Empfehlung dokumentieren                       |
| `build.mjs`                       | Marketplace-Beschreibung um `docs` ergänzen                                |
| `docs/plan/0036-docs-skill.md`    | Audit-Trail dieser geplanten Änderung                                      |

## Implementierungsdetails

### Vorgehen

1. Neuen Skill `skills/sf-docs/SKILL.md` anlegen:
   - Frontmatter `name: sf-docs`, `type: orchestrator`.
   - Ziel: README, Guides, Skill-Doku, API-/CLI-Dokumentation, Migrationshinweise, Changelog- und In-Code-Dokumentation aktualisieren.
   - Bestehende Includes nutzen: `language-rules`, `task-tracking`, `plan-status`, `pre-commit-gate`, `commit-message-rules`.
2. Workflow von `sf-docs` definieren:
   - Intent-/Scope-Prüfung: nur Dokumentationsänderungen und dokumentationsnahe In-Code-Kommentare.
   - Plan-Referenzen: offene Plan-Dateien auflösen, Status prüfen, `**Empfohlener Workflow:** Dokumentation` bevorzugen, bei Feature/Bugfix/Refactoring warnen und passenden Skill nennen.
   - Analyse: bestehende Doku, Code-Referenzen, CLI-Ausgaben, Beispiele und relevante Review-Findings prüfen.
   - Planung/Freigabe: kurzer Dokumentationsplan mit betroffenen Dateien, Zielgruppe, Doku-Art und Validierung.
   - Umsetzung: `sf-docs-writer` für End-User-/Projekt-Doku und `sf-code-documenter` für In-Code-Dokumentation einsetzen; parallel nur bei klar getrennten Dateibereichen.
   - Validierung: mindestens Link-/Beispiel-/Build-Kontext prüfen; `sf-code-validator` verwenden, wenn Doku-Änderungen generierte Artefakte, Build-Dateien, CLI-Hilfetexte oder Code-Kommentare in kompilierten Dateien betreffen.
   - Abschluss: Planstatus auf `Umgesetzt` setzen, Review-Report-Rückverweise ergänzen, Wisdom-Datei löschen.
3. `sf-plan` aktualisieren:
   - Kategorie Dokumentation weiterhin erkennen.
   - Template-Zeile auf `**Empfohlener Workflow:** Dokumentation (`$sf-docs`)` ändern.
   - Abschluss-Hinweis um `$sf-docs docs/plan/NNNN-...md` ergänzen.
4. `sf-build` aktualisieren:
   - Bei eindeutigem Dokumentations-Intent an `sf-docs` verweisen oder nur dann fortfahren, wenn der User ausdrücklich `sf-build` erzwingt.
   - Bei referenzierten Plänen mit Empfehlung Dokumentation auf `sf-docs` hinweisen.
5. `sf-review` erweitern:
   - Beschreibung und Zieltext um `sf-docs` ergänzen.
   - Folgeaktion-Klassifikation erweitern:
     - Defekt → `sf-fix`
     - strukturelles Problem → `sf-refactor`
     - fehlende Funktionalität / Schutzmechanismus → `sf-build`
     - reine Dokumentationslücke, veraltete Dokumentation, falsche Beispiele, fehlende Migrations-/CLI-/API-Doku → `sf-docs`
   - Bericht-Format um `sf-docs` in Aktionstabelle und Finding-Aktion erweitern.
   - Prompt-Vorschläge für `sf-docs` als direkt kopierbaren Klartext formulieren.
6. `sf-apply-review` erweitern:
   - Beschreibung, Parsing und Aktionsgruppen um `sf-docs` ergänzen.
   - Vorabanalyse-Text für Doku-Findings anpassen: Fokus auf Dokumentationslücke, betroffene Dateien, Zielgruppe, zu aktualisierende Beispiele.
   - Delegationsauftrag in Phase 4.3 ergänzen: Aktion docs → `Verwende den Skill {{SKILL:sf-docs}} für dieses Finding.`
   - Parallelisierung nach Aktionsgruppe inklusive `sf-docs` beibehalten.
7. README und Marketplace-Beschreibung aktualisieren:
   - Orchestratoren-Tabelle um `sf-docs` ergänzen.
   - Plan-Workflow-Empfehlungen dokumentieren.
   - Build-/Deployment-Hinweise müssen keine neue Sonderlogik bekommen, weil `build.mjs` `sf-*`-Skill-Verzeichnisse automatisch aufnimmt.
8. Build und statische Prüfungen ausführen.

### Komponenten-Struktur

Nicht relevant im UI-Sinn. Die neue Struktur ist:

| Element              | Rolle                                                                             |
| -------------------- | --------------------------------------------------------------------------------- |
| `sf-docs`            | Top-Level-Orchestrator für Dokumentationsänderungen                               |
| `sf-docs-writer`     | Agent für README, Guides, API-/CLI-Doku, Migration und End-User-Doku              |
| `sf-code-documenter` | Agent für JSDoc/TSDoc, Kommentare und Code-nahe Dokumentation                     |
| `sf-code-validator`  | Optionaler Validator, wenn Doku-Änderungen technisch prüfbare Artefakte betreffen |

### State-Management

`sf-docs` soll analog zu den anderen Workflows eine temporäre Wisdom-Datei unter `.sf-plugin/.wisdom-accumulation-<SESSION_ID>.tmp.md` verwenden und am Ende löschen. Persistenter neuer State ist nicht erforderlich.

### API-Anbindung

Nicht relevant.

### Styling-Ansatz

Nicht relevant.

### Barrierefreiheit

Nur relevant, wenn Dokumentation UI-/Accessibility-Verhalten beschreibt. In diesem Fall soll `sf-docs` bestehende Accessibility-Aussagen gegen Code und Tests plausibilisieren, aber keine UI-Implementierung verändern.

### Edge Cases

- Ein Finding betrifft zugleich Codeverhalten und Dokumentation: `sf-review` soll die primäre Aktion nach dem eigentlichen Problem wählen. Wenn Codeverhalten falsch ist, bleibt `sf-fix`/`sf-build` primär; die Doku-Anpassung kann im Prompt erwähnt werden.
- Eine Dokumentationsänderung erfordert CLI-Help-Text im Code: `sf-docs` darf `sf-code-documenter` nutzen und Validierung starten, muss aber den Scope als dokumentationsnah begründen.
- Ein Plan empfiehlt Dokumentation, wird aber mit `sf-build`, `sf-fix` oder `sf-refactor` aufgerufen: der jeweilige Skill soll sichtbar auf `sf-docs` hinweisen.
- Alte Pläne ohne `**Empfohlener Workflow:**` bleiben nutzbar; `sf-docs` darf anhand Inhalt und Dateiscope entscheiden oder nachfragen.
- `sf-apply-review` erhält einen alten Report ohne `sf-docs`: bisherige Aktionen bleiben unverändert funktionsfähig.

## Akzeptanzkriterien

- [x] Es gibt einen neuen Orchestrator `sf-docs`.
- [x] `sf-docs` kann ohne Plan für reine Dokumentationsaufgaben genutzt werden.
- [x] `sf-docs` kann eine offene Plan-Datei als Grundlage nutzen.
- [x] `sf-plan` empfiehlt bei Dokumentationsaufgaben `sf-docs`.
- [x] `sf-build` verweist Dokumentationspläne und eindeutige Dokumentationsintents auf `sf-docs`.
- [x] `sf-review` kann Findings mit Aktion `sf-docs` ausgeben.
- [x] `sf-apply-review` kann Findings mit Aktion `sf-docs` delegieren.
- [x] README und Marketplace-Beschreibung nennen den neuen Workflow.
- [x] Generierte Codex- und Claude-Artefakte enthalten `sf-docs` bzw. `/docs`.

## Validierungsplan

- `node build.mjs`
- `node --check build.mjs`
- `rg -n "sf-docs|/docs|\\$sf-docs" skills README.md build.mjs dist/codex dist/claude`
- `rg -n "\\{\\{INCLUDE:|\\{\\{SKILL:|\\{\\{AGENT:|\\{\\{ASK" dist/codex dist/claude` muss keine untransformierten Platzhalter finden.
- Prüfen, dass `dist/codex/skills/sf-docs/SKILL.md` und `dist/claude/sf-claude-plugin/plugins/sf-frontend-workflows/commands/docs.md` erzeugt werden.

## Annahmen und offene Punkte

- Annahme: Der neue Orchestrator heißt `sf-docs`; für Claude Code entsteht daraus `/docs`.
- Annahme: Es wird kein neuer Agent benötigt, weil `sf-docs-writer` und `sf-code-documenter` die fachliche Umsetzung abdecken.
- Annahme: Reine Dokumentations-Findings sollen im Review-Report nicht als `sf-build` ausgegeben werden, sobald `sf-docs` existiert.
- Offener Punkt: Ob `sf-docs` bei jedem Lauf eine finale Projektvalidierung erzwingen soll oder nur bei technisch prüfbaren Doku-Änderungen. Empfehlung: kontextabhängig, aber Pre-Commit-Gate beibehalten.

## Testergebnisse

- `node build.mjs` erfolgreich ausgeführt. Ergebnis: Codex 10 Skills und 9 Agents, Claude Code 10 Commands und 9 Agents.
- `node --check build.mjs` erfolgreich ausgeführt.
- Gezielt geprüft, dass `dist/codex/skills/sf-docs/SKILL.md` und `dist/claude/sf-claude-plugin/plugins/sf-frontend-workflows/commands/docs.md` erzeugt wurden.
- Gezielt geprüft, dass `sf-docs`, `/docs` und `$sf-docs` in den relevanten Quell- und generierten Artefakten vorkommen.
- `rg` gegen `dist/codex` und `dist/claude` fand keine untransformierten `{{INCLUDE:...}}`, `{{SKILL:...}}`, `{{AGENT:...}}` oder `{{ASK}}`-Platzhalter.

## Review-Findings

**Datum:** 2026-05-19
**Reviewer:** lokal

### Zusammenfassung

| Schweregrad | Anzahl | Behoben | Offen |
| ----------- | -----: | ------: | ----: |
| Kritisch    |      0 |       0 |     0 |
| Wichtig     |      0 |       0 |     0 |
| Hinweis     |      0 |       0 |     0 |

| Komplexität | Anzahl |
| ----------- | -----: |
| Leicht      |      0 |
| Mittel      |      0 |
| Schwer      |      0 |

### Findings

Keine Findings gefunden.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       0 |
| Security    |        0 |       0 |       0 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       0 |       0 |
| Testbarkeit |        0 |       0 |       0 |
| Scope       |        0 |       0 |       0 |
| Wartbarkeit |        0 |       0 |       0 |

### Befunde

- Keine Befunde.
