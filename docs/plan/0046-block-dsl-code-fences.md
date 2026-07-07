# 0046: Block-DSL auf Code-Fences

**Planungsstatus:** Umgesetzt
**Quelle:** $sf-refactor
**Empfohlener Workflow:** Refactoring (`$sf-refactor`)

## Anforderung

Die block-level Build-DSL der Skill-Quellen soll von der Mustache-Syntax auf Markdown-Code-Fences umgestellt werden, damit oxfmt die Skill-Dateien formatieren kann, ohne die DSL zu zerstören. Auslöser war Befund 0045: oxfmt bricht `{{ASK}}`-Blöcke mit Options-Liste, weshalb `skills/**` bisher vom Formatter ausgeschlossen war.

Inline-Referenzen (`{{SKILL:…}}`, `{{AGENT:…}}`, `{{VERSION}}`) bleiben bewusst unverändert: sie stehen mitten im Text und im YAML-`description:`-String, wo ein Code-Fence (block-level) nicht möglich ist. `{{…}}` ist dort kontext-agnostisch und oxfmt-sicher.

## Architekturentscheidungen

- **Nur Block-Direktiven werden umgestellt:**
  - `{{INCLUDE:name}}` → ` ```include `-Fence mit dem Namen als Inhalt.
  - `{{ASK}}…{{/ASK}}` → ` ```ask `-Fence; der Innenblock (header/question/type/options) bleibt unverändert.
- **Info-String ohne bekannte Sprache** (`include`, `ask`): so wird der Fence-Interior von oxfmt garantiert nie umformatiert, auch unabhängig von `embeddedLanguageFormatting`.
- **`parseAskBlock` bleibt unangetastet** — nur die drei Erkennungs-Regexe in `build.mjs` (`resolveIncludes`, `transformAskClaude`, `transformAskCodex`) wechseln von `{{…}}` auf den Fence.
- **Verhaltens-Invarianz zweistufig bewiesen:**
  1. DSL + Parser umstellen, Skills noch unformatiert → `dist/` ist **byte-identisch** zur Baseline.
  2. `skills/**` aus `.oxfmtrc.json` entfernen und formatieren → `dist/`-Diff ist nach Normalisierung (Tabellenstriche kollabiert, Whitespace/Leerzeilen ignoriert) **leer**, also rein kosmetisch.
- **Folge:** `skills/**` ist nicht mehr vom Formatter ausgeschlossen; alle echten Markdown-Inhalte des Repos werden jetzt von oxfmt erfasst. Befund 0045 ist damit aufgehoben.

## Betroffene Dateien

| Datei                                     | Beschreibung                                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `skills/**/SKILL.md`                      | 87 Includes und 11 ASK-Blöcke in 21 bzw. 8 Dateien auf Fences umgestellt; anschließend von oxfmt formatiert |
| `build.mjs`                               | Regexe in `resolveIncludes`, `transformAskClaude`, `transformAskCodex` auf Fences umgestellt                |
| `.oxfmtrc.json`                           | `skills/**` aus `ignorePatterns` entfernt                                                                   |
| `README.md`                               | Build-Abschnitt: Inline-Referenzen vs. Block-Direktiven dokumentiert                                        |
| `docs/plan/0045-oxfmt-formatter-setup.md` | Verweis ergänzt, dass der Skill-Ausschluss aufgehoben wurde                                                 |

## Implementierungsdetails

### Vorgehen

1. Baseline: `node build.mjs`, `dist/` als Snapshot gesichert.
2. Deterministisches Einmal-Skript: `{{INCLUDE:name}}` und `{{ASK}}…{{/ASK}}` in allen `skills/**/SKILL.md` auf Fences umgestellt (87 + 11 Treffer), Skript danach entfernt.
3. `build.mjs`: `resolveIncludes` auf ` ```include\nname\n``` `, beide ASK-Transforms auf ` ```ask\n…\n``` ` umgestellt.
4. Verifikation A: Build → `diff -r` gegen Baseline → byte-identisch.
5. `.oxfmtrc.json`: `skills/**` entfernt; `pnpm format`; Rebuild.
6. Verifikation B: normalisierter Diff gegen Baseline → leer (nur kosmetisch); `pnpm agent:check` grün.

### Edge Cases

- `_shared`-Includes enthalten selbst keine DSL → keine Rekursionsprobleme.
- Include-Namen sind reine Kebab-Case-Bezeichner → der ` ```include `-Fence kann den Namen als einzige Inhaltszeile führen.
- Approval-ASK (ohne Options) und Options-ASK funktionieren beide unverändert, da `parseAskBlock` denselben Innenblock erhält.

## Akzeptanzkriterien

- [x] Keine `{{INCLUDE:…}}`-, `{{ASK}}`- oder `{{/ASK}}`-Vorkommen mehr in `skills/**`.
- [x] Inline `{{SKILL:…}}`, `{{AGENT:…}}`, `{{VERSION}}` unverändert.
- [x] `build.mjs` löst ` ```include `- und ` ```ask `-Fences korrekt auf.
- [x] `dist/` ist vor dem Formatieren byte-identisch zur Baseline.
- [x] Nach dem Formatieren ist der `dist/`-Diff rein kosmetisch (normalisierter Diff leer).
- [x] `skills/**` ist nicht mehr in `.oxfmtrc.json` ausgeschlossen; `pnpm agent:check` läuft grün.
- [x] README dokumentiert Inline- vs. Block-Syntax.

## Validierungsplan

- `node --check build.mjs`, `node build.mjs`.
- `diff -r <baseline> dist` (Stufe 1, byte-identisch).
- `diff -rwB` plus Strich-Normalisierung (Stufe 2, leer = kosmetisch).
- `rg` auf geleakte Fences/Platzhalter im `dist/` → keine.
- ASK-Optionszahlen je Command unverändert (`apply-review` 6, `build` 6, `plan` 4, `maintain` 4, je 2 bei den Approval-Workflows).
- `pnpm agent:check` grün über alle 82 Dateien.

## Annahmen und offene Punkte

- Annahme: Block-Direktiven stehen immer auf eigenen Zeilen; das gilt für alle vorhandenen Vorkommen.
- Offener Punkt: Ein optionaler Namespace-Prefix (` ```sf:ask `, ` ```sf:include `) wurde bewusst nicht gewählt, um den Build-Eingriff klein zu halten; nachrüstbar.

## Testergebnisse

- `node --check build.mjs` und `node build.mjs` fehlerfrei; unverändert 12 Codex-Skills, 9 Codex-Agents, 12 Claude-Commands, 9 Claude-Agents.
- Stufe-1-Diff gegen Baseline: byte-identisch.
- Stufe-2-Diff nach Formatierung: normalisiert leer → rein kosmetisch (Tabellenausrichtung, Leerzeilen).
- Keine geleakten Fences oder Platzhalter im `dist/`; ASK-Optionszahlen unverändert.
- `pnpm agent:check`: „All matched files use the correct format“ über 82 Dateien.

## Review-Findings

Keine Findings gefunden.
