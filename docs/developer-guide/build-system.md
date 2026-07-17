# Build-System

`build.mjs` transformiert die Markdown-Quellen unter `src/` in zwei harness-spezifische
Skill-Verzeichnisse unter `dist/claude/` und `dist/codex/`. Dieses Dokument beschreibt Aufruf,
Platzhalter-Syntax und Build-Guards. Konventionen zum Hinzufügen von Tools und Agenten sind in
[`AGENTS.md`](../../AGENTS.md) kanonisch beschrieben; hier folgt nur eine kurze Zusammenfassung.

## Aufruf

```sh
node build.mjs   # baut beide Harnesses nach dist/ (alias: pnpm build)
pnpm format      # formatiert mit oxfmt (Markdown + JS)
pnpm agent:check # oxfmt --check, CI-Modus ohne Schreibzugriff
```

Paketmanager ist **pnpm** (`packageManager: pnpm@11.9.0`). Es gibt keine klassische Testsuite;
Korrektheit wird über die Build-Guards erzwungen (siehe unten) – nach jeder Quelländerung ist
`node build.mjs` die maßgebliche Prüfung.

Der Build schreibt zunächst in ein temporäres Verzeichnis (`dist.tmp/`) und tauscht es erst nach
einem vollständig erfolgreichen Lauf atomar gegen `dist/`. Schlägt der Build fehl, bleibt das
vorherige `dist/` unangetastet.

## Platzhalter- und Direktiven-Syntax

Die Quellen verwenden zwei Arten von Platzhaltern, die der Build auflöst – ihre Expansion wird
nie von Hand geschrieben.

**Inline-Referenzen** stehen mitten im Text (auch im Frontmatter-`description:`-String) und
nutzen die Mustache-Syntax `{{…}}`:

| Platzhalter   | Bedeutung                      | Ersetzung                                                         |
| ------------- | ------------------------------ | ----------------------------------------------------------------- |
| `{{SKILL:X}}` | Tool-Referenz                  | `/effective-flow X` (exponiert) bzw. `` `tools/X.md` `` (intern)  |
| `{{AGENT:X}}` | Agent-Referenz                 | `` `X` `` (Codex) bzw. `` `effective-flow-X` `` (Claude-Subagent) |
| `{{VERSION}}` | Version inklusive Git-Kurzhash | Manifest-Version + `git rev-parse --short HEAD`                   |

**Block-Direktiven** stehen auf eigenen Zeilen als Code-Fence mit Info-String. Der Fence-Interior
bleibt gegen den Markdown-Formatter (oxfmt) wortwörtlich erhalten
(`embeddedLanguageFormatting: off`).

Ein `include`-Fence bettet die Shared-Datei `src/shared/<name>.md` ein:

```include
task-tracking
```

Ein `ask`-Fence erzeugt eine bedingte User-Frage (Claude Code: `AskUserQuestion`-Block, Codex:
Freitextfrage):

```ask
header: Freigabe
question: Plan freigegeben?
type: approval
```

## Guards

Der Build bricht mit einer Fehlermeldung ab, wenn einer dieser Guards verletzt ist:

- **Frontmatter-/Quoting-Guard:** `description` (und bei exponierten Tools zusätzlich
  `catalogHint`) muss strikt doppelt gequotet sein.
- **Referenz-Guard:** Jedes `{{SKILL:X}}` muss auf eine existierende `src/tools/X.md`, jedes
  `{{AGENT:X}}` auf eine existierende `src/agents/X.md` zeigen.
- **Include-Ziel-Guard:** Jede ` ```include ` -Fence muss auf eine existierende
  `src/shared/<name>.md` zeigen.
- **`catalogHint`-Guard:** Jedes in `TOOL_GROUPS` gelistete (exponierte) Tool braucht ein
  nicht-leeres, strikt gequotetes `catalogHint`-Feld – die Zeile, die der Router-Katalog je Tool
  anzeigt.
- **`TOOL_GROUPS`-Vollständigkeits-Guard:** Jedes exponierte Tool steht in genau einer Gruppe;
  Duplikate oder ein Tool ohne passende Quelldatei lassen den Build fehlschlagen.
- **Codex-Sandbox-Guard:** Ein in `codex.sandbox_mode` angegebener Wert muss zu den von Codex
  unterstützten Modi gehören.
- **Versions-Drift-Guard:** Der in beide Router-Ausgaben gestempelte Versionsstring
  (`<Manifest-Version> (<Git-Kurzhash>)`) muss in Claude- und Codex-Ausgabe identisch sein.

## Tool oder Agent hinzufügen

Kurzfassung (kanonisch in [`AGENTS.md`](../../AGENTS.md), Abschnitt „Adding a tool or agent"):

1. Neue Quelldatei unter `src/tools/<name>.md` bzw. `src/agents/<name>.md` anlegen.
2. Um ein Tool über `/effective-flow` zu exponieren, den Namen in genau eine Gruppe von `TOOL_GROUPS` in
   `build.mjs` eintragen (die Array-/Gruppenreihenfolge bestimmt die Katalogreihenfolge im
   Router) und ein strikt gequotetes `catalogHint`-Frontmatter-Feld ergänzen.
3. `node build.mjs` ausführen. Die oben beschriebenen Guards decken fehlende Quellen, fehlende
   Include-Ziele, nicht unterstützte Codex-Sandbox-Modi sowie fehlende oder doppelte
   `TOOL_GROUPS`-Einträge ab.

## Weiterführend

- [`architektur.md`](architektur.md) – Source-to-dist-Modell und Repo-Struktur.
- [`plan-konventionen.md`](plan-konventionen.md) – Plan-Datei-Schema.
- [`release-und-installation.md`](release-und-installation.md) – Versionsstempel und Release.
- [`AGENTS.md`](../../AGENTS.md) – kanonische Build- und Verhaltensregeln.
