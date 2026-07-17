# Build-System

`build.mjs` transformiert die Markdown-Quellen unter `src/` in zwei harness-spezifische
Skill-Verzeichnisse unter `dist/claude/` und `dist/codex/`. Dieses Dokument beschreibt Aufruf,
Platzhalter-Syntax und Build-Guards. Konventionen zum Hinzufügen von Tools und Agenten sind in
[`AGENTS.md`](../../AGENTS.md) kanonisch beschrieben; hier folgt nur eine kurze Zusammenfassung.

## Aufruf

```sh
node build.mjs   # baut beide Harnesses nach dist/ (alias: pnpm build)
pnpm test        # führt die Unit-Test-Suite aus (node:test)
pnpm format      # formatiert mit oxfmt (Markdown + JS)
pnpm agent:check # oxfmt --check, CI-Modus ohne Schreibzugriff
```

Paketmanager ist **pnpm** (`packageManager: pnpm@11.9.0`). Die Korrektheit ruht auf zwei
komplementären Schichten: einer `node:test`-Unit-Suite (`pnpm test`, `test/build-lib.test.mjs`),
die die reinen `build-lib.mjs`-Transforms abdeckt (Frontmatter-Parsing, `{{SKILL:X}}`/`{{AGENT:X}}`-
und `include`-Auflösung, Body-Rendering, Description-Quoting), **und** den Build-Guards (siehe
„Guards"), die beim `node build.mjs`-Lauf greifen – die Unit-Tests sichern die Transform-Logik,
die Guards die Vollständigkeit und Konsistenz der Quellen. Nach jeder Quelländerung gilt dieselbe
Reihenfolge wie in CI: `pnpm agent:check` (Format), `pnpm test` (Unit-Tests), dann `node build.mjs`
(Build + Guards).

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

**Keine Legacy-Aliase.** Namen aus der Zeit vor der Umbenennung – also `{{SKILL:sf-…}}` oder
`{{AGENT:sf-…}}` mit dem alten `sf-`-Präfix – werden **nicht** auf ihre aktuellen Namen
abgebildet. Der Referenz-Guard lehnt sie mit einer Migrationsmeldung ab („drop the `sf-`
prefix"), statt still eine tote `tools/sf-….md`- bzw. `sf-…`-Referenz zu rendern. Verwende in den
Quellen immer den aktuellen, präfixlosen Namen.

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
  `{{AGENT:X}}` auf eine existierende `src/agents/X.md` zeigen. Ein Legacy-`sf-`-Präfix (siehe
  „Keine Legacy-Aliase" oben) wird gezielt mit einer Migrationsmeldung abgelehnt. Derselbe Guard
  läuft auch beim Rendern (`transformRefs`), sodass kein akzeptierter Platzhalter je ein
  nicht-existentes Ziel erzeugen kann.
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
- **Doku-Landing-Page-Guard:** Enthält eine README-pflichtige Doku-Kategorie
  (`docs/user-guide/`, `docs/developer-guide/`) mindestens ein Dokument, muss dort eine
  `README.md` als kuratierte Landing-Page liegen (Regel aus `src/shared/doc-categories.md`);
  sonst bricht der Build ab. So kann der verpflichtende technische Einstiegspunkt nicht
  unbemerkt verschwinden. Die reine Prüflogik liegt als `missingCategoryReadmes` in
  `build-lib.mjs` und ist in `test/build-lib.test.mjs` abgedeckt.

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
