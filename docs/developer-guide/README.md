# Developer Guide

Technischer Einstiegspunkt für Effective Flow – für Entwickler, die am Projekt mitarbeiten, und
für Softwarearchitekten, die einschätzen wollen, wie Effective Flow aufgebaut ist und ob es
technisch passt.

Effective Flow ist ein **Source-to-dist-Build**: `build.mjs` transformiert die Markdown-Quellen
unter `src/` in zwei harness-spezifische Skill-Verzeichnisse unter `dist/` (Claude Code und
Codex). Es gibt keine Laufzeitanwendung – du editierst `src/`, nie `dist/`.

## Lese-Reihenfolge

1. [Architektur](architektur.md) – Repository-Aufbau: Source-to-dist-Modell, der dünne Router
   mit Lazy-Loading und die Aufteilung auf die beiden Harnesses.
2. [Build-System](build-system.md) – wie `build.mjs` `src/` nach `dist/` transformiert:
   Aufruf, Platzhalter-Syntax, Build-Guards und die Unit-Test-Suite.
3. [Konfiguration](konfiguration.md) – die Effective Flow-Konfiguration in der lebenden
   Projektsetup-ADR, mit dem entwicklerorientierten Überblick über alle Config-Blöcke.
4. [Plan-Konventionen](plan-konventionen.md) – Namensschema, kanonische Status-Marker und
   Archivierung der Plan-Dateien unter `<plan.dir>/`.
5. [Skill-Ownership](skill-ownership.md) – die Grenze zwischen Effective-Flow-Orchestrierung
   und zentraler Skill-Expertise (geschichteter Vertrag) samt Ownership-Inventar über den
   aktuellen Skillset.
6. [Release und Installation](release-und-installation.md) – Versionierung über
   release-please, Veröffentlichung und Installation des gebauten Skills.
7. [Terminology](terminology.md) – verbindliches DE→EN-Glossar für die Sprach-Migration
   (Englisch als Default, Deutsch weiterhin zulässig).

## Siehe auch

- [`AGENTS.md`](../../AGENTS.md) – kanonische Konventionen zum Hinzufügen von Tools und
  Agenten sowie die verbindlichen Sprach-, Commit- und Versionierungsregeln.
- [User Guide](../user-guide/README.md) – Nutzung von Effective Flow (Installation,
  Tool-Referenz, Konfiguration, Troubleshooting).
