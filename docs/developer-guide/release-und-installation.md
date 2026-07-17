# Release und Installation

Dieses Dokument beschreibt, wie Effective Flow versioniert, veröffentlicht und installiert wird.
Kanonische Versionierungsregeln stehen in [`AGENTS.md`](../../AGENTS.md), Abschnitt
„Versioning"; hier folgen die konkreten Mechanismen (release-please, Installations-Skripte,
Versionsstempel).

## Versionierung mit release-please

Die Release-Versionierung übernimmt [release-please](https://github.com/googleapis/release-please).
Single Source of Truth für die aktuell veröffentlichte Version ist
`.release-please-manifest.json` (Feld `"."`); Versionen werden **nicht** von Hand in Feature-
oder Fix-Commits erhöht. Conventional-Commit-Nachrichten steuern den nächsten Release-PR,
Changelog-Einträge, Tags, GitHub-Releases und den Upload des Release-Archivs.

Der Release-Workflow (`.github/workflows/release.yml`) läuft bei jedem Push auf `main`:

1. `pnpm agent:check` (Formatprüfung) und `node --test` (Unit-Tests).
2. `node build.mjs` baut die Distribution nach `dist/`.
3. `release-please-action` erstellt bzw. aktualisiert den Release-PR und, sobald gemerged, den
   Git-Tag und das GitHub-Release.
4. Bei einem tatsächlich erstellten Release wird `dist/` als `effective-flow-<tag>.tar.gz` gepackt und an
   das GitHub-Release angehängt.

Da `release-please-config.json` das einzelne Paket `.` unter dem Namen `effective-flow` führt, tragen die
Releases **komponenten-Tags** der Form `effective-flow-vX.Y.Z` (z. B. `effective-flow-v1.45.0`) statt eines
bloßen `vX.Y.Z`.

## Versionsstempel und Drift-Guard

Der Build stempelt `<Manifest-Version> (<Git-Kurzhash>)` (z. B. `1.45.0 (01bd063)`) in beide
Router-Ausgaben (`dist/claude/effective-flow/SKILL.md` und `dist/codex/effective-flow/SKILL.md`). Ein
**Versions-Drift-Guard** lässt den Build fehlschlagen, falls Claude- und Codex-Ausgabe nicht
denselben Versionsstring tragen – Details siehe
[`build-system.md`](build-system.md#guards).

## Installation

```sh
./install-skill.sh
```

Das Skript:

1. lädt das Archiv der zuletzt veröffentlichten GitHub-Release-Version herunter
   (`gh release download`, Muster `effective-flow-*.tar.gz`),
2. kopiert das Effective Flow-Skill nach `~/.claude/skills/effective-flow` und `~/.agents/skills/effective-flow`,
3. registriert die Claude-Agenten unter `~/.claude/agents/effective-flow-*.md` (Claude Code entdeckt in
   Skills verschachtelte Agenten nicht automatisch),
4. räumt veraltete `sf-*`-Skills, `~/.codex/agents/sf-*.toml` und den früheren Marketplace
   `sf-claude-plugin` auf.

Verwaltet wird ausschließlich das `effective-flow`-Unterverzeichnis: ein bestehender externer
`~/.claude/skills`-Symlink (z. B. von einem anderen Tool) und fremde Nachbar-Skills bleiben
unangetastet.

### Installation aus dem lokalen Checkout

```sh
./install-skill.sh local
```

Baut den aktuellen Checkout (statt ein Release herunterzuladen) und deployt ihn identisch zur
Standard-Installation – nützlich, um einen unveröffentlichten Stand lokal zu testen.

### Entwicklung: Symlink statt Kopie

```sh
./local-link.sh
```

Baut den aktuellen Checkout und verknüpft `dist/` per Symlink in die Harness-Verzeichnisse, statt
zu kopieren. Änderungen an `src/` werden so nach einem erneuten `node build.mjs` ohne erneute
Installation wirksam.

Beide Installationswege teilen sich dieselbe Deployment-Logik in `local-common.sh`; nur die
Installationsstrategie (`cp -R` vs. `ln -s`) und die abschließende Meldung unterscheiden sich.

### Nur bauen, ohne Deployment

```sh
node build.mjs
```

## Weiterführend

- [`build-system.md`](build-system.md) – Build-Ablauf und Guards, inklusive Versionsstempel.
- [`architektur.md`](architektur.md) – Repo-Struktur und Zwei-Harness-Split.
- [`AGENTS.md`](../../AGENTS.md) – kanonische Versionierungsregeln.
