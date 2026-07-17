# Architektur

Dieses Dokument beschreibt, wie Effective Flow als Repository aufgebaut ist: das Source-to-dist-Modell,
den Router mit Lazy-Loading und die Aufteilung auf die beiden Harnesses Claude Code und Codex.
Verhaltensregeln für Agenten (Sprachregeln, Commit-Konventionen, No-AI-Attribution, Plan-Datei-
Konventionen) stehen kanonisch in [`AGENTS.md`](../../AGENTS.md) – dieses Dokument verweist
darauf, statt sie zu duplizieren.

## Source-to-dist-Modell

Effective Flow ist **kein** Laufzeitprodukt, sondern ein Build: `build.mjs` liest die Markdown-Quellen
unter `src/` und erzeugt daraus zwei harness-spezifische Skill-Verzeichnisse unter `dist/`.

- Bearbeitet wird ausschließlich `src/`. `dist/` ist generiert und gitignored – Änderungen dort
  gehen beim nächsten Build verloren.
- Das Quell-Layout **spiegelt die Ausgabe**: Der Ordner bestimmt die Kategorie, der Dateiname
  ohne `.md` den Namen. Es gibt daher kein `name`- oder `type`-Feld im Frontmatter.
- Details zum Build-Ablauf, den Platzhaltern und den Guards stehen in
  [`build-system.md`](build-system.md).

## Dünner Router mit Lazy-Loading

`src/SKILL.md` ist der Router: ein Tool-Katalog plus Dispatch-Regel, sonst nichts. Er lädt
niemals alle Tools vor, sondern verweist beim Aufruf `/effective-flow <tool>` (Claude) bzw.
`$effective-flow <tool>` (Codex) genau auf die eine passende `tools/<tool>.md`. Dieses Lazy-Loading hält
die Session schlank und vermeidet Token-Exhaustion durch unnötig vorgeladene Tool-Anweisungen.

Ohne oder mit unbekanntem `<tool>` gibt der Router nur die Tool-Liste aus und tut sonst nichts.

Dieselbe Progressive Disclosure wirkt **innerhalb** eines Tools: modus-gated Shared-Fragmente
(z. B. Worktree-Delivery, Remote-Tracker, Report-Handling) werden nicht mehr eager inlined,
sondern per `lazy-include` erst am Entscheidungspunkt nachgeladen. Details und das
Kontext-Budget stehen in [`build-system.md`](build-system.md) unter „Progressive Disclosure
über den Router hinaus".

Effective Flow kennt zwei Bausteintypen:

| Typ       | Beschreibung                                   | Aufruf                                            |
| --------- | ---------------------------------------------- | ------------------------------------------------- |
| **Tool**  | Workflow- oder Utility-Anweisung               | `/effective-flow <tool>` (lädt `tools/<tool>.md`) |
| **Agent** | spezialisierter Worker (Implementer, Reviewer) | intern von Tools als Subagent (`agents/<name>`)   |

## Quell-Verzeichnisse

```text
src/
├── SKILL.md      # Router: Tool-Katalog + Dispatch, keine Tool-Inhalte
├── tools/        # ein .md je Tool → dist/<harness>/effective-flow/tools/<name>.md
├── agents/       # ein .md je Agent → dist/<harness>/agents/<name>
└── shared/       # Include-Fragmente, eingebettet via `include`-Fence
```

- **`src/tools/<name>.md`**: Ein Tool ist nur dann über `/effective-flow <name>` aufrufbar, wenn sein
  Name in genau einer Gruppe von `TOOL_GROUPS` in `build.mjs` steht (siehe
  [`build-system.md`](build-system.md)). Nicht gelistete Tools (z. B. `apply-plan`,
  `apply-review`, `apply-issues`) sind **intern**: gebaut, aber nicht im Router-Katalog
  sichtbar; `apply` lädt die passende interne Anweisung je nach erkannter Quelle nach.
- **`src/agents/<name>.md`**: Agenten sind **keine** `/effective-flow`-Tools. Workflow-Tools rufen sie
  intern als Subagenten auf. Das Frontmatter trägt Konfiguration je Harness unter den Schlüsseln
  `claude:` und `codex:` (Modell, Farbe, Tools/Sandbox).
- **`src/shared/<name>.md`**: Include-Fragmente, die per ` ```include ` -Fence in Tools und
  Agenten eingebettet werden (z. B. `language-rules`, `task-tracking`, `skill-discovery`,
  `goal-completion`, `worktree-integration`).

## Zwei-Harness-Split

Der Build erzeugt aus derselben Quelle zwei unabhängige Ausgaben:

| Harness     | Ziel                          | Agenten-Format                                                                                                                                                                         |
| ----------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | `dist/claude/effective-flow/` | eigenständige `.md`-Subagenten unter `dist/claude/agents/`, namensraum-präfixiert `effective-flow-<name>.md` (Claude Code entdeckt in Skills verschachtelte Agenten nicht automatisch) |
| Codex       | `dist/codex/effective-flow/`  | `.toml`-Agenten verschachtelt unter `dist/codex/effective-flow/agents/<name>.toml`                                                                                                     |

Beide Ausgaben tragen denselben Versionsstempel (siehe
[`release-und-installation.md`](release-und-installation.md)); ein Build-Guard verhindert
Versions-Drift zwischen den Harnesses.

## Repo-Struktur im Überblick

```text
effective-flow/                        (Repo)
├── src/                      # Quellen (siehe oben)
├── docs/                     # Projekt-Dokumentation
│   ├── plan/                 # Implementierungspläne (ISO-Datum-Slug, siehe plan-konventionen.md)
│   ├── user-guide/           # End-User-Dokumentation
│   └── developer-guide/      # dieses Dokument und seine Nachbarn
├── dist/                     # Generiert, gitignored
│   ├── claude/effective-flow/         # Router-SKILL.md + tools/*.md, Agenten separat unter dist/claude/agents/
│   └── codex/effective-flow/          # Router-SKILL.md + tools/*.md + agents/*.toml
├── build.mjs                 # Build-Skript (siehe build-system.md)
├── install-skill.sh          # Installation aus Release bzw. lokalem Checkout
└── local-link.sh             # Build + Symlink für die Entwicklung
```

## Weiterführend

- [`build-system.md`](build-system.md) – Build-Ablauf, Platzhalter-Syntax, Guards.
- [`plan-konventionen.md`](plan-konventionen.md) – Namensschema und Lebenszyklus der Plan-Dateien.
- [`release-und-installation.md`](release-und-installation.md) – Versionierung und Installation.
- [`AGENTS.md`](../../AGENTS.md) – kanonische Agenten-Verhaltensregeln, Skill-Discovery, Commit-
  und No-AI-Attribution-Regeln.
