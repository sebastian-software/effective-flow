# 0025: Codex-Modellversionen aktualisieren

## Anforderung

Die vorgeschlagenen Codex-Modelle in den Skill-Agenten und der README sollen gegen die aktuelle OpenAI-Modelllage geprüft und aktualisiert werden. Anlass ist die Verfügbarkeit von `gpt-5.5`.

## Architekturentscheidungen

- **Komplexe Codex-Agenten verwenden `gpt-5.5`:** Implementer und Reviewer bearbeiten anspruchsvolle Coding-, Architektur- und Review-Aufgaben. Die offizielle Codex-Dokumentation empfiehlt `gpt-5.5` für komplexe Coding-, Computer-Use-, Wissensarbeits- und Research-Workflows in Codex.
- **Unterstützende Agenten verwenden `gpt-5.4-mini`:** Validator, Dokumentations- und Test-Agenten bleiben bewusst auf einem schnelleren Modell. Die Codex-Dokumentation nennt `gpt-5.4-mini` als schnelle, effiziente Option für responsive Coding-Tasks und Subagents.
- **`gpt-5.3-codex-spark` wird nicht mehr als Default verwendet:** Das Modell ist laut Codex-Dokumentation eine Research Preview für near-instant Coding-Iteration. Für allgemeine Plugin-Defaults ist `gpt-5.4-mini` die stabilere Empfehlung.
- **Claude-Modellzuordnungen bleiben unverändert:** Die Anforderung betrifft nur GPT-/Codex-Modellnamen.
- **Historische Plan-Dateien bleiben unverändert:** Frühere Plan-Dateien dokumentieren damalige Entscheidungen und werden nicht nachträglich umgeschrieben.

Quellen:

- https://developers.openai.com/codex/models
- https://developers.openai.com/api/docs/models

## Betroffene Dateien

| Datei | Beschreibung |
|---|---|
| `skills/sf-ui-implementer/SKILL.md` | Codex-Modell von `gpt-5.4` auf `gpt-5.5` aktualisiert |
| `skills/sf-nodejs-implementer/SKILL.md` | Codex-Modell von `gpt-5.4` auf `gpt-5.5` aktualisiert |
| `skills/sf-frontend-reviewer/SKILL.md` | Codex-Modell von `gpt-5.4` auf `gpt-5.5` aktualisiert |
| `skills/sf-nodejs-reviewer/SKILL.md` | Codex-Modell von `gpt-5.4` auf `gpt-5.5` aktualisiert |
| `skills/sf-code-validator/SKILL.md` | Codex-Modell von `gpt-5.3-codex-spark` auf `gpt-5.4-mini` aktualisiert |
| `skills/sf-code-documenter/SKILL.md` | Codex-Modell von `gpt-5.3-codex-spark` auf `gpt-5.4-mini` aktualisiert |
| `skills/sf-docs-writer/SKILL.md` | Codex-Modell von `gpt-5.3-codex-spark` auf `gpt-5.4-mini` aktualisiert |
| `skills/sf-test-writer/SKILL.md` | Codex-Modell von `gpt-5.3-codex-spark` auf `gpt-5.4-mini` aktualisiert |
| `skills/sf-e2e-tester/SKILL.md` | Codex-Modell von `gpt-5.3-codex-spark` auf `gpt-5.4-mini` aktualisiert |
| `README.md` | Agent-Modelltabelle und Frontmatter-Beispiel synchronisiert |
| `docs/plan/0025-codex-model-version-update.md` | Diese Plan-Datei |

## Implementierungsdetails

### Neue Modellmatrix

| Agent | Codex Model |
|---|---|
| `sf-ui-implementer` | `gpt-5.5` |
| `sf-nodejs-implementer` | `gpt-5.5` |
| `sf-frontend-reviewer` | `gpt-5.5` |
| `sf-nodejs-reviewer` | `gpt-5.5` |
| `sf-code-validator` | `gpt-5.4-mini` |
| `sf-code-documenter` | `gpt-5.4-mini` |
| `sf-docs-writer` | `gpt-5.4-mini` |
| `sf-test-writer` | `gpt-5.4-mini` |
| `sf-e2e-tester` | `gpt-5.4-mini` |

### Build

`node build.mjs` wurde ausgeführt und erfolgreich abgeschlossen:

```text
Built:
  Codex:      7 skills, 9 agents  -> dist/codex/
  Claude Code: 7 commands, 9 agents -> dist/claude/sf-claude-plugin/
```

Die generierten Codex-Agent-TOML-Dateien enthalten die neue Modellmatrix. `dist/` ist nicht Teil der sichtbaren Git-Änderungen.

## Testergebnisse

- `node build.mjs` bestanden.
- `rg -n "gpt-5\.3-codex-spark" README.md skills dist/codex/agents` fand keine Treffer.
- `rg -n "gpt-5\.4($|[^-])" README.md skills dist/codex/agents` fand keine Treffer.
- `rg -n "gpt-5\.5|gpt-5\.4-mini" skills README.md dist/codex/agents` bestätigte die erwarteten neuen Modellwerte in Source, README und generierten Codex-Agenten.
- Die Plan-Datei selbst erwähnt alte Modellnamen nur als dokumentierte Vorher-Werte.
- Keine Unit- oder E2E-Tests ergänzt, da nur deklarative Agent-Konfiguration und Dokumentation geändert wurden.

## Review-Findings

Keine Findings gefunden.
