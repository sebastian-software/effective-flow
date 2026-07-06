# 0064: Firmo Nachtrag – Quell-Layout `skills/sf-*` → `src/{tools,agents,shared}`

**Planungsstatus:** Umgesetzt
**Quelle:** /plan
**Empfohlener Workflow:** Refactoring (`/firmo refactor`)

## Anforderung

Nach der Firmo-Migration lagen die Quellen noch unter `skills/sf-*/SKILL.md` — mit `sf-`-Präfix und dem irreführenden Container-Namen `skills/` (es sind keine eigenständigen Skills mehr, sondern die Bausteine des einen `firmo`-Skills). Das Quell-Layout soll die Ausgabe spiegeln und ohne Präfix auskommen.

## Lösung

Neues, ausgabespiegelndes Layout unter `src/`:

```
src/
├── SKILL.md            # Router  → dist/*/firmo/SKILL.md
├── tools/<name>.md     #         → firmo/tools/<name>.md
├── agents/<name>.md    #         → firmo/agents/<name>
└── shared/<name>.md    # Include-Fragmente
```

- Präfix `sf-` entfällt; Tool-/Agent-Name = Dateiname ohne `.md`.
- Kategorie ergibt sich aus dem Ordner (`tools/` vs. `agents/`) statt aus dem Frontmatter-`type`.
- Frontmatter trägt kein `name`/`type` mehr (nur `description` bzw. bei Agents zusätzlich `claude:`/`codex:`).
- `plan-issues` → `plan-issue` (Dateiname = Tool-Name; Build-Override entfällt).
- Platzhalter `{{SKILL:sf-X}}`/`{{AGENT:sf-X}}` → `{{SKILL:X}}`/`{{AGENT:X}}`.
- **Unverändert:** Ausgabe-Layout (`dist/*/firmo/`), Tracker-Labels (`sf-review-finding` etc.), Deploy-Skripte, Claude-Agent-Namespacing (`firmo-*`).

## Betroffene Dateien

| Datei                  | Beschreibung                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/**` → `src/**` | 29 Quellen per `git mv` in `src/tools/`, `src/agents/`, `src/shared/` + `src/SKILL.md`; Präfix weg; flache `.md`-Dateien                                                              |
| `build.mjs`            | Discovery über `src/tools/` + `src/agents/` (Ordner statt `type`); `SOURCE_DIR`/`SHARED_DIR`/`ROUTER_SRC`; `stripPrefix`/`TOOL_NAME_OVERRIDES` entfernt; Platzhalter-Regex ohne `sf-` |
| `src/**/*.md`          | `name`/`type`-Frontmatter entfernt; Platzhalter entpräfixt; Baustein-Pfade `skills/_shared/` → `src/shared/`                                                                          |
| `README.md`            | Abschnitte Build/Struktur/Source-Frontmatter auf `src/`-Layout                                                                                                                        |

## Akzeptanzkriterien

- [x] `node build.mjs` grün; identische Ausgabe wie vorher (15 Tools + 3 intern + 11 Agents je Harness; Claude-Agents als `firmo-*` unter `dist/claude/agents/`).
- [x] Keine `sf-`-Präfixe in Quell-Dateinamen/Platzhaltern mehr; Tracker-Labels bewusst erhalten.
- [x] `src/`-Layout spiegelt die Ausgabe; `skills/`-Verzeichnis existiert nicht mehr.
- [x] Router-Katalog listet 15 Tools inkl. `/firmo plan-issue`; keine unaufgelösten `{{…}}` und keine `/sf-`/`$sf-` in `dist/`.
- [x] `pnpm agent:check` (`oxfmt --check`) grün.

## Testergebnisse

- `git mv` von 29 Quellen nach `src/` (18 Tools, 11 Agents, 18 Shared-Fragmente, Router); `skills/` entfernt.
- Frontmatter-Strip: `name`/`type` aus allen Tool-/Agent-Frontmattern entfernt (das verbliebene `type: approval` ist ein `ask`-Block-Feld im Body und bleibt korrekt).
- `node build.mjs` grün; Ausgabe unverändert; `dist`: 0 `{{…}}`, 0 `/sf-`/`$sf-`; Katalog 15 Tools inkl. `/firmo plan-issue`.
- `statSync`-Import (nun ungenutzt) entfernt.
- `pnpm agent:check` grün.
