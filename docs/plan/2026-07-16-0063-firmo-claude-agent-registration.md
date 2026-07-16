# 0063: Firmo Nachtrag – Claude-Agent-Registrierung unter `~/.claude/agents/firmo-*`

**Planungsstatus:** Umgesetzt
**Quelle:** /plan
**Empfohlener Workflow:** Bugfix (`/firmo fix`)

## Anforderung

Nachtrag zur Firmo-Migration ([0058](0058-firmo-rename-and-lazy-tool-router.md)). Teil 2 hat die 11 Spezialisten-Agents genestet unter `firmo/agents/` ausgeliefert — in Anlehnung an pbakaus/impeccable. Diese genestete Auto-Discovery ist jedoch eine **Codex**-Eigenschaft; **Claude Code** entdeckt Subagents laut offizieller Doku ausschließlich aus `~/.claude/agents/`, `.claude/agents/` oder dem `agents/`-Verzeichnis eines Plugins — **nicht** aus einem skill-internen `agents/`-Ordner.

Folge: Auf Claude Code liefen die Tools zwar (Router + Lazy-Loading + `tools/`), aber jede Delegation an einen Spezialisten (`ui-implementer`, `nodejs-reviewer`, `code-validator` …) ging ins Leere. Dieser Plan behebt das für Claude Code, ohne Codex zu verändern.

## Lösung

- **Claude:** Agents werden als registrierte Subagents nach `~/.claude/agents/` ausgeliefert, mit `firmo-`-Namespace gegen Kollisionen (`firmo-ui-implementer.md` …). Der Claude-Build transformiert `{{AGENT:sf-X}}` → `firmo-X` und setzt das Frontmatter-`name`-Feld entsprechend.
- **Codex:** unverändert — genestete Agents unter `firmo/agents/*.toml`, Referenzen bleiben bare `X` (Codex-Auto-Discovery greift).

## Betroffene Dateien

| Datei                     | Beschreibung                                                                                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build.mjs`               | Harness-spezifischer `{{AGENT}}`-Transform (`firmo-X` für Claude); Claude-Agents nach `dist/claude/agents/firmo-*.md` mit namespaced `name`; kein genestetes `firmo/agents/` mehr für Claude |
| `skills/_router/SKILL.md` | Agent-Hinweis harness-neutral formuliert (Codex genestet, Claude registrierte `firmo-*`)                                                                                                     |
| `local-update.sh`         | zusätzlich `dist/claude/agents/firmo-*.md` → `~/.claude/agents/` kopieren (idempotent, Cleanup vorab)                                                                                        |
| `local-link.sh`           | analog per Symlink                                                                                                                                                                           |

## Akzeptanzkriterien

- [x] `node build.mjs` grün; Claude: `dist/claude/firmo/` ohne `agents/`, 11 Agents unter `dist/claude/agents/firmo-*.md` mit `name: firmo-<X>`; Codex: 11 genestete `.toml` unverändert.
- [x] Claude-Tool-Bodies referenzieren Agents als `firmo-<X>`, Codex-Tool-Bodies als bare `<X>`.
- [x] Deploy legt Claude-Agents nach `~/.claude/agents/firmo-*.md`, das Skill (nur `SKILL.md` + `tools/`) nach `~/.claude/skills/firmo`, Codex nach `~/.agents/skills/firmo` (nested).
- [x] Externer `~/.claude/skills`-Symlink, fremde Skills und fremde Agents bleiben unangetastet; wiederholter Lauf ist idempotent.

## Testergebnisse

- `node build.mjs` grün: Claude 15 Tools (+3 intern) + 11 Agents (`dist/claude/agents/firmo-*.md`), Codex 15 Tools (+3 intern) + 11 nested Agents.
- Referenz-Gegenprobe: `tools/build.md` referenziert `firmo-ui-implementer` (Claude) bzw. bare `ui-implementer` (Codex); Frontmatter-`name` entsprechend (`firmo-ui-implementer` vs. `ui-implementer`).
- Deploy-Dry-Run gegen temporäres HOME: 11 `firmo-*.md` in `~/.claude/agents/`, Skill ohne `agents/`, Codex nested 11; externer skills-Symlink, fremde Skill und fremder Agent (`my-own-agent.md`) erhalten; zweiter Lauf idempotent (kein Doppeln).
- `pnpm agent:check` (`oxfmt --check`) grün; `sh -n` grün für beide Skripte.
