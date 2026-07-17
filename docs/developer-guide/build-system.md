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

Ein `lazy-include`-Fence **verzögert** ein modus-gated Shared-Fragment (Progressive Disclosure,
siehe unten). Statt es eager zu inlinen, liefert der Build `src/shared/<name>.md` einmal pro
Harness als ladbare Datei `shared/<name>.md` aus und ersetzt das Direktiv durch einen
konditionalen Lade-Pointer am Entscheidungspunkt. Die `when:`-Zeile ist der Lade-Trigger und
wird im Pointer hinter „sobald " gerendert:

```lazy-include
worktree-integration
when: der Delivery-/Worktree-Modus bestimmt wird
```

→ wird zu: „**Bei Bedarf laden:** Lies `shared/worktree-integration.md`, sobald der
Delivery-/Worktree-Modus bestimmt wird." Ein Routine-Lauf, der den Modus nie erreicht, lädt das
Fragment nie.

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
- **Lazy-Include-Guards (#99):** (a) Kein Fragment darf in derselben Datei zugleich eager
  (` ```include `) **und** lazy (` ```lazy-include `) eingebunden sein (sonst würde der Block
  doppelt geladen). (b) Jedes lazy-referenzierte Fragment muss für **beide** Harnesses als
  `shared/<name>.md` ausgeliefert sein, damit der Lade-Pointer auf Claude Code und Codex
  auflöst. Die reine Prüflogik (`resolveLazyIncludes`, `collectIncludeNames`,
  `assertNoEagerLazyOverlap`) liegt in `build-lib.mjs` und ist in `test/build-lib.test.mjs`
  abgedeckt.
- **Kontext-Budget-Guard (#99):** Der always-loaded-Kern der größten Tools (`build`, `fix`,
  `docs`, `review`, `plan`) – die gebaute Tool-Datei ohne die lazy Fragmente – bleibt unter
  **700 Zeilen**. Der Build gibt die gemessenen Größen als Report aus und bricht ab, wenn ein
  Tool das Budget überschreitet.
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
- **Self-contained-Agent-Contract-Guard (#100):** Jede Agent-Description und jeder Agent-Body
  ist die vollständige Laufzeit-Metadaten- und Instruktionsgrundlage des Subagenten – er
  erhält zur Laufzeit keinen Geschwister- oder Historien-Kontext. Der Guard bricht den Build
  daher ab, wenn eine Agent-Quelle (Frontmatter **und** Body) ihre Bedeutung auf einen anderen
  Agenten abwälzt: Historien-Vergleiche („ursprüngliche(r) Agent", „original agent", „same
  depth as the …"), Relativ-zu-Geschwister-Scope („… wie der `<X>`-Reviewer/-Implementer/…")
  oder ein Cross-Agent-Shorthand als Contract-Ersatz („Wie bei `{{AGENT:…}}`"). Eine
  **legitime** Delegations-Referenz wie „an `{{AGENT:code-validator}}` delegieren" bleibt
  erlaubt – nur die „Wie bei `{{AGENT:…}}`"-Form ist blockiert. Die reine Prüflogik liegt als
  `findSelfReferentialContractPhrases` (mit der Blocklist `SELF_CONTAINED_CONTRACT_PATTERNS`)
  in `build-lib.mjs` und ist in `test/build-lib.test.mjs` abgedeckt.

## Tool oder Agent hinzufügen

Kurzfassung (kanonisch in [`AGENTS.md`](../../AGENTS.md), Abschnitt „Adding a tool or agent"):

1. Neue Quelldatei unter `src/tools/<name>.md` bzw. `src/agents/<name>.md` anlegen.
2. Um ein Tool über `/effective-flow` zu exponieren, den Namen in genau eine Gruppe von `TOOL_GROUPS` in
   `build.mjs` eintragen (die Array-/Gruppenreihenfolge bestimmt die Katalogreihenfolge im
   Router) und ein strikt gequotetes `catalogHint`-Frontmatter-Feld ergänzen.
3. `node build.mjs` ausführen. Die oben beschriebenen Guards decken fehlende Quellen, fehlende
   Include-Ziele, nicht unterstützte Codex-Sandbox-Modi sowie fehlende oder doppelte
   `TOOL_GROUPS`-Einträge ab.

## Progressive Disclosure über den Router hinaus

Der Top-Level-Router (`SKILL.md`) lädt nur den Tool-Katalog und die Dispatch-Regel; die
vollständige Anweisung eines Tools kommt erst beim Aufruf aus `tools/<tool>.md`. Diese
Progressive Disclosure setzt sich **innerhalb** eines Tools fort: Ein großes Tool inlinet nicht
mehr jedes Shared-Fragment eager, sondern verschiebt die **modus-gated** Blöcke hinter einen
`lazy-include`-Pointer (siehe „Platzhalter- und Direktiven-Syntax").

- **Kern-Flow bleibt inline** – Blöcke, die (fast) jeder Lauf braucht: `language-rules`,
  `task-tracking`, `skill-discovery`, `completion-protocol`, `commit-message-rules`,
  `pre-commit-gate`, `goal-completion`, `apply-clarity-gate`, `plan-status`.
- **Modus-gated Blöcke sind lazy** – nur bei erreichtem Zweig nötig: `config-migration`,
  `worktree-integration`, `issue-tracker`, `review-report-backlinks`,
  `unresolved-review-report`, `plan-numbering`, `plan-reference-routing`,
  `effective-flow-dir-migration`. Der Lade-Trigger (`when:`) sitzt am Entscheidungspunkt, an dem
  der Modus/Zweig bestimmt wird.

Das Fragment wird **einmal pro Harness** dedupliziert nach `dist/<harness>/effective-flow/shared/`
ausgeliefert und dort durch dieselbe Pipeline wie ein Tool-Body gerendert (geschachtelte eager
Includes, `{{VERSION}}`, Referenzen/`ask`). Ein Agent liest die Datei zur Laufzeit genauso nach,
wie der Router `tools/<tool>.md` oder `apply` seine `apply-*.md`-Geschwister nachlädt.

**Kontext-Budget.** Der always-loaded-Kern der fünf größten Tools bleibt unter **700 Zeilen**
(gemessen und beim Build erzwungen, siehe „Guards"); der Build gibt die Größen als Report aus.
Zum Vergleich vor der Umstellung: `build` 1185 → ~624, `fix` 917 → ~425, `docs` 925 → ~498,
`review` 787 → ~646, `plan` 723 → ~615 Zeilen. Der Rest wird nur bei erreichtem Modus geladen.

## Weiterführend

- [`architektur.md`](architektur.md) – Source-to-dist-Modell und Repo-Struktur.
- [`plan-konventionen.md`](plan-konventionen.md) – Plan-Datei-Schema.
- [`release-und-installation.md`](release-und-installation.md) – Versionsstempel und Release.
- [`AGENTS.md`](../../AGENTS.md) – kanonische Build- und Verhaltensregeln.
