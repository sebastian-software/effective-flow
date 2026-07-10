# 0069: Codex GPT-5.6 Modelle aktualisieren

**Planungsstatus:** Umgesetzt
**Quelle:** $firmo plan
**Empfohlener Workflow:** Feature (`$firmo build`)

## Anforderung

Die aktiven Codex-Modellzuordnungen in Firmos Agent-Quellen sollen auf die neuen GPT-5.6-Codex-Modelle aktualisiert werden. Anlass ist die neue Modellfamilie mit `gpt-5.6-sol`, `gpt-5.6-terra` und `gpt-5.6-luna`.

Die Umsetzung ist ein Feature, weil sich die ausgelieferte Agent-Konfiguration für zukünftige Firmo-Nutzer ändert. Es handelt sich nicht um eine reine Dokumentationsänderung: `src/agents/*.md` ist die Quelle für die generierten Codex-Agenten unter `dist/codex/`.

Verifizierter Code-Kontext:

- Die Codex-Modelle stehen in den Frontmattern von `src/agents/*.md` unter `codex.model`.
- `build.mjs` liest diese Werte und schreibt sie als `model = "..."` in die generierten Codex-Agent-TOML-Dateien.
- `README.md` enthält eine Agent-Modelltabelle und ein Frontmatter-Beispiel, die mit den Quellen synchron bleiben müssen.
- `.firmo/config.json` setzt `plan.markerLanguage` auf `de`; deshalb verwendet diese Plan-Datei den deutschen Statusmarker.

Quellen für die Modellentscheidung:

- Der vom User bereitgestellte Screenshot zeigt `gpt-5.6-sol` als neuestes frontier agentic coding model, `gpt-5.6-terra` als balanciertes Modell und `gpt-5.6-luna` als schnelles, günstiges Modell.
- Die offizielle OpenAI/Codex-Modellseite nennt dieselben Modell-IDs und bestätigt `codex -m gpt-5.6-luna` sowie die Einordnung von Luna als schnellstes und günstigstes GPT-5.6-Modell der Familie: https://developers.openai.com/codex/models

## Architekturentscheidungen

- **Komplexe Implementer und Reviewer verwenden `gpt-5.6-sol`:** Implementierungs- und Review-Agenten treffen Architektur-, Sicherheits- und Codequalitätsentscheidungen. Sie sollen daher das frontier agentic coding model nutzen.
- **Unterstützende Agenten verwenden `gpt-5.6-luna`:** Validator, Dokumentations- und Test-Agenten bleiben auf ein schnelleres und günstigeres Modell ausgerichtet. Das entspricht der bisherigen Trennung zwischen komplexen High-Reasoning-Agenten und unterstützenden Medium-Reasoning-Agenten.
- **Sol bleibt Standard für Implementer und Reviewer:** Die offizielle OpenAI-Modellseite beschreibt `gpt-5.6-terra` zwar als natürlichen Startpunkt für Arbeit, die bisher GPT-5.5 nutzte. Firmo priorisiert für Implementer und Reviewer aber Ergebnisqualität vor Geschwindigkeit und Kosten, weil diese Agenten Architektur-, Sicherheits-, Implementierungs- und Review-Entscheidungen treffen. Terra bleibt ein möglicher Kandidat für ein späteres Fast-Profile, wird aber nicht Teil der Standardmatrix dieses Plans.
- **Claude-Modellzuordnungen bleiben unverändert:** Die Anforderung betrifft nur Codex-/OpenAI-Modellnamen.
- **Historische Plan-Dateien bleiben unverändert:** Frühere Pläne dokumentieren damalige Entscheidungen und sollen nicht nachträglich umgeschrieben werden.

## Betroffene Dateien

| Datei                                     | Beschreibung                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| `src/agents/ui-implementer.md`            | Codex-Modell von `gpt-5.5` auf `gpt-5.6-sol` aktualisieren                        |
| `src/agents/nodejs-implementer.md`        | Codex-Modell von `gpt-5.5` auf `gpt-5.6-sol` aktualisieren                        |
| `src/agents/rust-implementer.md`          | Codex-Modell von `gpt-5.5` auf `gpt-5.6-sol` aktualisieren                        |
| `src/agents/generic-implementer.md`       | Codex-Modell von `gpt-5.5` auf `gpt-5.6-sol` aktualisieren                        |
| `src/agents/frontend-reviewer.md`         | Codex-Modell von `gpt-5.5` auf `gpt-5.6-sol` aktualisieren                        |
| `src/agents/nodejs-reviewer.md`           | Codex-Modell von `gpt-5.5` auf `gpt-5.6-sol` aktualisieren                        |
| `src/agents/rust-reviewer.md`             | Codex-Modell von `gpt-5.5` auf `gpt-5.6-sol` aktualisieren                        |
| `src/agents/code-validator.md`            | Codex-Modell von `gpt-5.4-mini` auf `gpt-5.6-luna` aktualisieren                  |
| `src/agents/code-documenter.md`           | Codex-Modell von `gpt-5.4-mini` auf `gpt-5.6-luna` aktualisieren                  |
| `src/agents/docs-writer.md`               | Codex-Modell von `gpt-5.4-mini` auf `gpt-5.6-luna` aktualisieren                  |
| `src/agents/test-writer.md`               | Codex-Modell von `gpt-5.4-mini` auf `gpt-5.6-luna` aktualisieren                  |
| `src/agents/e2e-tester.md`                | Codex-Modell von `gpt-5.4-mini` auf `gpt-5.6-luna` aktualisieren                  |
| `README.md`                               | Agent-Modelltabelle und Frontmatter-Beispiel mit der neuen Matrix synchronisieren |
| `docs/plan/0069-codex-gpt-5-6-modelle.md` | Diese Plan-Datei                                                                  |

## Implementierungsdetails

### Vorgehen

1. Alle aktiven Codex-Modellwerte in `src/agents/*.md` gemäß der neuen Matrix ändern.
2. `model_reasoning_effort` unverändert lassen: komplexe Agenten bleiben `high`, unterstützende Agenten bleiben `medium`.
3. Claude-Frontmatter, Beschreibungen, Tool-Listen, Sandbox-Modi und Agent-Inhalte unverändert lassen.
4. `README.md` synchronisieren: Agent-Modelltabelle und Frontmatter-Beispiel müssen dieselben Codex-Modellwerte zeigen wie die Quellen.
5. `node build.mjs` ausführen, damit die Build-Guards und die generierten Codex-Agenten die neue Matrix bestätigen.
6. Suchprüfungen gegen aktive Quellen, README und generierte Codex-Agenten ausführen, um alte aktive Modellwerte und unerwartete GPT-5.6-Zuordnungen auszuschließen.

### Neue Modellmatrix

| Agent                 | Codex Model    |
| --------------------- | -------------- |
| `ui-implementer`      | `gpt-5.6-sol`  |
| `nodejs-implementer`  | `gpt-5.6-sol`  |
| `rust-implementer`    | `gpt-5.6-sol`  |
| `generic-implementer` | `gpt-5.6-sol`  |
| `frontend-reviewer`   | `gpt-5.6-sol`  |
| `nodejs-reviewer`     | `gpt-5.6-sol`  |
| `rust-reviewer`       | `gpt-5.6-sol`  |
| `code-validator`      | `gpt-5.6-luna` |
| `code-documenter`     | `gpt-5.6-luna` |
| `docs-writer`         | `gpt-5.6-luna` |
| `test-writer`         | `gpt-5.6-luna` |
| `e2e-tester`          | `gpt-5.6-luna` |

### Komponenten-Struktur

Nicht relevant. Die Änderung betrifft deklarative Agent-Frontmatter und synchronisierte README-Dokumentation, keine Laufzeitkomponenten.

### State-Management

Nicht relevant. Es werden keine Persistenzformate, Laufzeitdaten oder `.firmo/`-State-Strukturen geändert.

### API-Anbindung

Nicht relevant. Die Änderung führt keine neue API-Anbindung ein. Sie aktualisiert ausschließlich Modell-IDs, die von Codex beim Agentenstart interpretiert werden.

### Barrierefreiheit

Nicht relevant. Es gibt keine UI-Änderung.

### Edge Cases

- Historische Pläne wie `docs/plan/0025-codex-model-version-update.md` dürfen weiterhin alte Modellnamen enthalten.
- `gpt-5.6-terra` darf in diesem Plan und optional in erläuternder README-Prosa als nicht gewählter Kandidat erwähnt werden, aber nicht als aktiver Agent-Default erscheinen.
- Falls `node build.mjs` wegen unbekannter Modellnamen nicht fehlschlägt, müssen die Suchprüfungen trotzdem bestätigen, dass die generierten Codex-Agenten die erwarteten Werte enthalten.
- Falls offizielle OpenAI-Dokumentation während der Umsetzung andere Empfehlungen nennt, soll die Umsetzung die aktuelle Dokumentation erneut prüfen und den Plan nur mit expliziter Begründung abweichend anwenden.

## Akzeptanzkriterien

- [ ] Alle aktiven Codex-Agent-Quellen unter `src/agents/*.md` verwenden nur noch `gpt-5.6-sol` für Implementer/Reviewer und `gpt-5.6-luna` für Validator/Dokumentations-/Test-Agenten.
- [ ] `README.md` nennt in der Agent-Modelltabelle und im Frontmatter-Beispiel dieselben Codex-Modellwerte wie `src/agents/*.md`.
- [ ] `node build.mjs` läuft erfolgreich durch.
- [ ] Die generierten Dateien unter `dist/codex/firmo/agents/` enthalten die erwartete neue Modellmatrix.
- [ ] In aktiven Quellen, README und generierten Codex-Agenten gibt es keine verbleibenden aktiven Treffer für `gpt-5.5` oder `gpt-5.4-mini`; historische Plan-Dateien sind von dieser Prüfung ausgenommen.

## Validierungsplan

- `node build.mjs`
- `rg -n "gpt-5\\.5|gpt-5\\.4-mini" src/agents README.md dist/codex/firmo/agents`
- `rg -n "gpt-5\\.6-sol|gpt-5\\.6-luna|gpt-5\\.6-terra" src/agents README.md dist/codex/firmo/agents`
- Manuelle Prüfung, dass `gpt-5.6-terra` nicht versehentlich als aktiver Agent-Default gesetzt wurde.

## Annahmen und offene Punkte

- Annahme: Die im Screenshot gezeigten Modell-IDs sind für Codex-Agent-Frontmatter zulässige Modellstrings.
- Annahme: Die bestehende Zweiteilung `gpt-5.5` für komplexe Agenten und `gpt-5.4-mini` für unterstützende Agenten soll erhalten bleiben und nur auf die passenden GPT-5.6-Modelle übertragen werden.
- Kein offener Punkt blockiert die Umsetzung. Sollte OpenAI die offizielle Modellseite vor der Umsetzung ändern, ist die Modellmatrix vor dem Edit erneut zu verifizieren.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       0 |
| Security    |        0 |       0 |       0 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       0 |       1 |
| Testbarkeit |        0 |       0 |       0 |
| Scope       |        0 |       0 |       0 |
| Wartbarkeit |        0 |       0 |       0 |

### Befunde

- **Architektur / Wichtig:** Die Zuordnung bisheriger `gpt-5.5`-Agenten zu `gpt-5.6-sol` ist eine Kosten-/Leistungsentscheidung. Entscheidung im Review: Firmo priorisiert für Implementer und Reviewer Ergebnisqualität vor Geschwindigkeit und Kosten; deshalb bleibt `gpt-5.6-sol` die Standardwahl. Der Befund ist eingearbeitet.
- **Fehlerfälle / Hinweis:** Die Plan-Umsetzung hängt von aktuellen OpenAI-Modellverfügbarkeiten ab. Der Plan enthält deshalb die Vorgabe, die offizielle Modellseite vor der Umsetzung erneut zu prüfen und bei abweichender Empfehlung bewusst zu begründen.

## Offene Punkte

- Keine offenen Punkte.

## Testergebnisse

- `pnpm build` bestanden; `build.mjs` erzeugte die Claude- und Codex-Artefakte erfolgreich.
- `rg -n "gpt-5\\.5|gpt-5\\.4-mini" src/agents README.md dist/codex/firmo/agents` fand keine Treffer.
- `rg -n "gpt-5\\.6-sol|gpt-5\\.6-luna|gpt-5\\.6-terra" src/agents README.md dist/codex/firmo/agents` bestätigte die erwarteten `gpt-5.6-sol`- und `gpt-5.6-luna`-Werte in Quellen, README und generierten Codex-Agenten.
- `rg -n "gpt-5\\.6-terra" src/agents README.md dist/codex/firmo/agents` fand keine Treffer; Terra ist nicht als aktiver Agent-Default gesetzt.
- `pnpm agent:check` bestanden.
- `pnpm test` bestanden.
