# Benutzer-Guide

Dieser Guide richtet sich an alle, die Effective Flow in einem Projekt **nutzen** – über
`/effective-flow <tool>` in Claude Code oder Codex. Für Architektur, Build und Beitrag zum
Effective Flow-Repo selbst siehe stattdessen den
[Developer-Guide](../developer-guide/architektur.md).

## Empfohlene Lese-Reihenfolge

Neu bei Effective Flow? Lies in dieser Reihenfolge:

1. [Erste Schritte](getting-started.md) – Installation, erster Aufruf, der typische
   Ablauf von der Planung bis zum Pull-Request.
2. Tool-Referenz, gruppiert nach Absicht:
   - [Verstehen, was zu tun ist](tools-verstehen.md) – `investigate`, `plan`,
     `open-plans`, `plan-issue`.
   - [Eine Änderung umsetzen](tools-umsetzen.md) – `apply`, `build`, `fix`,
     `refactor`, `docs`, `maintain`, `iterate`.
   - [Qualität sichern](tools-qualitaet.md) – `review`.
   - [Änderungen einbringen](tools-einbringen.md) – `commit`, `pr`.
   - [Einrichten & Infos](tools-einrichten.md) – `setup`, `version`.
3. Vertiefende Guides:
   - [Konfiguration](konfiguration.md) – die vollständige
     `.effective-flow/config.json`-Referenz.
   - [Worktree und Delivery](worktree-und-delivery.md) – paralleles Arbeiten in
     Git-Worktrees, Liefer-Branch, Pull-Request/Merge/Branch-Abschluss.
   - [Remote-Tracker](remote-tracker.md) – Findings und Issues auf GitHub oder
     Forgejo statt lokal führen.
   - [Skill-Discovery](skill-discovery.md) – wie Effective Flow Host-Skills erkennt und wie
     man das steuert.
4. Bei Problemen: [Troubleshooting](troubleshooting.md).
5. Unbekannter Begriff? [Glossar](glossar.md).

## Alle Dokumente dieser Kategorie

| Dokument                                             | Inhalt                                               |
| ---------------------------------------------------- | ---------------------------------------------------- |
| [getting-started.md](getting-started.md)             | Installation, erster Aufruf, typischer Flow, Rezepte |
| [tools-verstehen.md](tools-verstehen.md)             | Tool-Referenz: Analyse & Planung                     |
| [tools-umsetzen.md](tools-umsetzen.md)               | Tool-Referenz: Umsetzung                             |
| [tools-qualitaet.md](tools-qualitaet.md)             | Tool-Referenz: Review                                |
| [tools-einbringen.md](tools-einbringen.md)           | Tool-Referenz: Commit & Pull-Request                 |
| [tools-einrichten.md](tools-einrichten.md)           | Tool-Referenz: Setup & Version                       |
| [konfiguration.md](konfiguration.md)                 | Vollständige `.effective-flow/config.json`-Referenz  |
| [worktree-und-delivery.md](worktree-und-delivery.md) | Worktree, Liefer-Branch, Abschlussarten              |
| [remote-tracker.md](remote-tracker.md)               | Remote-Issue-Modus (GitHub/Forgejo)                  |
| [skill-discovery.md](skill-discovery.md)             | Host-Skill-Erkennung und -Steuerung                  |
| [troubleshooting.md](troubleshooting.md)             | FAQ und häufige Probleme                             |
| [glossar.md](glossar.md)                             | Begriffe von Tool bis Skill-Discovery                |
