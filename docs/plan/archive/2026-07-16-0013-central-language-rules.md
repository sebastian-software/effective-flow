# 0013: Zentrale Sprachregeldatei

**Planungsstatus:** Umgesetzt

## Anforderung

Zentrale Datei mit Sprach- und Typografie-Regeln erstellen. Bei deutschen Texten sollen Umlaute korrekt verwendet werden (keine ASCII-Ersetzungen). Die Regeln sollen in alle Skills eingebunden werden, die Code oder Dokumentation schreiben.

## Architekturentscheidungen

- Neuer Include-Mechanismus `{{INCLUDE:name}}` in build.mjs, der Inhalte aus `skills/_shared/name.md` einbettet
- Zentrale Regeldatei unter `skills/_shared/language-rules.md`
- Alle 9 Agent-Skills verwenden die zentrale Datei
- Orchestratoren behalten ihre eigene Standard-Sprachregel (delegieren ohnehin an Agents)
- `sf-commit` behält seine eigene Englisch-Regel (Commits brauchen keine Typografie-Regeln)

## Betroffene Dateien

| Datei                                   | Beschreibung                                                                |
| --------------------------------------- | --------------------------------------------------------------------------- |
| `skills/_shared/language-rules.md`      | Neue zentrale Sprachregeldatei                                              |
| `build.mjs`                             | `SHARED_DIR`, `resolveIncludes()` hinzugefügt                               |
| `skills/sf-ui-implementer/SKILL.md`     | Inline-Sprachregel durch Include ersetzt                                    |
| `skills/sf-nodejs-implementer/SKILL.md` | Inline-Sprachregel durch Include ersetzt                                    |
| `skills/sf-code-validator/SKILL.md`     | Inline-Sprachregel durch Include ersetzt, Zusatzregeln beibehalten          |
| `skills/sf-code-documenter/SKILL.md`    | Include hinzugefügt (hatte keine Sprachregel)                               |
| `skills/sf-docs-writer/SKILL.md`        | Include hinzugefügt (hatte keine Sprachregel)                               |
| `skills/sf-test-writer/SKILL.md`        | Include hinzugefügt (hatte keine Sprachregel)                               |
| `skills/sf-e2e-tester/SKILL.md`         | Include hinzugefügt (hatte keine Sprachregel)                               |
| `skills/sf-frontend-reviewer/SKILL.md`  | Include hinzugefügt (hatte keine Sprachregel)                               |
| `skills/sf-nodejs-reviewer/SKILL.md`    | Include hinzugefügt (hatte keine Sprachregel)                               |
| `README.md`                             | Platzhalter-Tabelle und Strukturbaum aktualisiert, ASCII-Umlaute korrigiert |

## Implementierungsdetails

### Include-Mechanismus

`resolveIncludes(body)` ersetzt `{{INCLUDE:name}}`-Platzhalter durch den Inhalt von `skills/_shared/name.md`. Die Auflösung geschieht vor allen anderen Platzhalter-Transforms, sodass Includes selbst weitere Platzhalter enthalten können.

### Sprachregeln

Die zentrale Datei definiert:

- Code, Bezeichner und Tests auf Englisch
- Dokumentation auf Deutsch (außer bestehende Doku führt andere Sprache fort)
- Commit-Messages auf Englisch
- Deutsche Typografie: korrekte Umlaute, Anführungszeichen, Gedankenstriche
