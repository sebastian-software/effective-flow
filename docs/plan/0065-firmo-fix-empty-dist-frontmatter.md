# 0065: Firmo Bugfix – leere `dist`-Markdown-Dateien durch Frontmatter-Strip-Bug

**Planungsstatus:** Umgesetzt
**Quelle:** /fix
**Empfohlener Workflow:** Bugfix (`/firmo fix`)

## Symptom

Nach dem Quell-Layout-Refactor ([0064](0064-firmo-source-layout-src.md), PR #5) waren die generierten Markdown-Dateien unter `dist/` weitestgehend leer: alle `dist/*/firmo/tools/*.md` hatten **0 Bytes**, die Agent-Dateien nur eine leere Frontmatter. Der Router (`SKILL.md`) war intakt.

## Root Cause

Beim Refactor wurde `name`/`type` aus dem Frontmatter der Quellen entfernt mit:

```
perl -0777 -i -pe 's{\A(---\n)([\s\S]*?\n)(---\n)}{"$1".($2 =~ s/^(?:name|type):.*\n//mgr)."$3"}e'
```

Die **innere** Substitution `$2 =~ s/.../.../r` setzt bei ihrer Ausführung die Match-Variablen `$1`/`$2`/`$3` zurück (jede Regex-Operation tut das). Da `"$3"` im Ersetzungsstring **nach** der inneren Substitution interpoliert wird, war `$3` (das schließende `---\n`) zu diesem Zeitpunkt bereits `undef` → leer. `"$1"` überlebte, weil es davor interpoliert wurde.

Ergebnis: Die Quellen verloren ihr schließendes `---`. Der anschließende `pnpm format`-Lauf (oxfmt) interpretierte den nun ungültigen Frontmatter-Block als Markdown (Thematic Breaks), fügte Leerzeilen ein und verlor die YAML-Einrückung der `claude:`/`codex:`-Blöcke. `build.mjs` (`extractBody`) findet ohne schließendes `---` keinen Body → leere Ausgabe. Der Router blieb heil, weil er nicht gestrippt wurde.

Nur die 29 Tool-/Agent-Quellen waren betroffen; `src/SKILL.md` und `src/shared/*` (ohne Strip) waren korrekt.

## Fix

Die 29 Quellen aus der pristinen Version (`HEAD~1`, vor dem Refactor-Commit) regeneriert und dabei einen **korrekten** Strip verwendet, der die Match-Variable vor der inneren Substitution sichert:

```
s{\A(---\n.*?\n---\n)}{my $b=$1; $b=~s/^(?:name|type):.*\n//mg; $b}se
```

Dazu erneut die Refactor-Transforms angewandt (Platzhalter entpräfixen, `plan-issues` → `plan-issue`, `skills/_shared/` → `src/shared/`). `build.mjs`, README, `src/SKILL.md` und `src/shared/*` blieben unverändert.

## Testergebnisse

- Jede Quelle unter `src/tools/`+`src/agents/` hat wieder genau zwei `---` (valide Frontmatter) und korrekte YAML-Einrückung.
- `node build.mjs` grün; **0** Dateien mit 0 Bytes in `dist` (vorher: alle Tools). `dist/claude/firmo/tools/build.md` 57 KB statt 0.
- `pnpm format` gefolgt von erneutem Build: Ausgabe bleibt nicht-leer (oxfmt zerlegt valide Frontmatter nicht).
- 0 verbliebene `{{…:sf-…}}`-Platzhalter; Agent-Namespacing (`firmo-*`) und Codex-Nesting unverändert.
- `pnpm agent:check` grün.

## Lehre

Innerhalb eines `s{}{}e`-Ersetzungscodes **keine** weitere Regex-Operation ausführen und danach noch auf `$1`/`$2`/… zugreifen — die äußeren Captures werden überschrieben. Erst in lokale Variablen sichern, dann verarbeiten. Zudem: Build-Verifikation nicht nur an Zähl-Ausgaben festmachen, sondern an der tatsächlichen **Inhaltsgröße** der Artefakte.
