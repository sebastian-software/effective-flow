# Erste Schritte

## Installation

```sh
./install-skill.sh
```

Das Script lädt das Archiv der letzten verfügbaren GitHub-Release-Version herunter und
installiert Effective Flow als Skill-Verzeichnis nach `~/.claude/skills/effective-flow` (Claude Code) und
`~/.agents/skills/effective-flow` (Codex). Alte `sf-*`-Skills und der frühere Marketplace-Plugin-Pfad
werden dabei aufgeräumt; ein bestehender externer `~/.claude/skills`-Symlink und fremde
Nachbar-Skills bleiben unangetastet.

Zwei Varianten für die Entwicklung am Effective Flow-Repo selbst:

```sh
./install-skill.sh local  # baut den aktuell ausgecheckten Stand und kopiert ihn
./local-link.sh           # baut und verlinkt dist/ per Symlink statt zu kopieren
```

## Erster Aufruf

In Claude Code:

```text
/effective-flow
```

In Codex:

```text
$effective-flow
```

Ohne oder mit unbekanntem `<tool>` gibt der Router nur die gruppierte Tool-Liste aus und
tut sonst nichts – das ist der schnellste Weg, sich einen Überblick zu verschaffen. Sobald
du ein konkretes Tool nennst (`/effective-flow plan`, `/effective-flow build`, …), lädt Effective Flow dessen
vollständige Anweisung nach und arbeitet danach.

## Der typische Flow: Plan → Build → Pull-Request

Für eine neue Funktionalität oder eine größere Änderung ist das der übliche Dreischritt:

1. **`/effective-flow plan "<Beschreibung der Aufgabe>"`** klärt die Anforderung, stellt bei Bedarf
   Rückfragen und schreibt einen umsetzbaren Plan nach `docs/plan/` – noch ohne
   Code-Änderung. Am Ende nennt `plan` den genauen Pfad der erzeugten Plan-Datei
   (etwa `docs/plan/2026-07-17-user-login.md`) und empfiehlt den passenden
   Folge-Workflow (meist `build`).
2. **`/effective-flow build docs/plan/2026-07-17-user-login.md`** übergibt genau diese
   Plan-Datei und setzt sie um: Implementierung, Tests, Doku, Validierung und Review in
   einem Lauf. Reiche den in Schritt 1 gemeldeten Pfad ausdrücklich weiter – `build`
   verarbeitet nur den übergebenen Handle und rät **nicht** die neueste Plan-Datei.
   Standardmäßig (`worktree.enabled: true`) läuft das in einem eigenen Git-Worktree auf
   einem eigenen Liefer-Branch, sodass dein aktueller Checkout unberührt bleibt.
3. **Abschluss** richtet sich nach `delivery.completion`: lokal auf den Basis-Branch
   mergen (Default), den Branch stehen lassen oder – bei `completion: "pr"` oder auf
   Nachfrage im Workflow – direkt einen Pull-Request öffnen. Ohne Worktree oder bei
   stehen gelassenem Branch holst du den Pull-Request manuell nach:
   **`/effective-flow pr`** öffnet ihn aus dem aktuellen Branch auf GitHub (`gh`) oder Forgejo
   (`tea`), inklusive aus den Commits abgeleitetem Titel und Beschreibung.

In Codex ist die Syntax identisch – nur das Präfix wechselt von `/effective-flow` zu
`$effective-flow`. Der Handoff lautet dort also `$effective-flow plan "<Beschreibung der Aufgabe>"`
und anschließend `$effective-flow build docs/plan/2026-07-17-user-login.md`.

Details zu Worktree, Liefer-Branch und den drei Abschlussarten stehen in
[Worktree und Delivery](worktree-und-delivery.md); die vollständige Tool-Referenz für
`plan`, `build` und `pr` in [Tools verstehen](tools-verstehen.md),
[Tools umsetzen](tools-umsetzen.md) und [Tools einbringen](tools-einbringen.md).

## Kurze Rezepte

### Ein konkreter Bug

Für einen bereits klar umrissenen Fehler lohnt sich die volle Planungsphase meist nicht:

```text
/effective-flow fix "Login-Formular zeigt keine Fehlermeldung bei falschem Passwort"
```

`fix` investigiert, reproduziert, behebt minimal und sichert die Änderung mit
Regressionstests ab – ohne separate Plan-Datei.

### Ein Fehler mit unklarer Ursache

Ist unklar, woran ein Bug überhaupt liegt, geht der Analyse eine eigene Phase voraus:

```text
/effective-flow investigate "Bestellungen verschwinden gelegentlich aus der Übersicht"
```

`investigate` liefert einen reinen Diagnose-Report, ohne etwas zu ändern. Mit der
gefundenen Ursache folgt danach `/effective-flow fix`.

### Dokumentation aktualisieren

```text
/effective-flow docs "README für das neue CLI-Flag ergänzen"
```

`docs` erstellt oder aktualisiert Dokumentation, ohne Produkt- oder Codeverhalten zu
ändern (Ausnahme: dokumentationsnahe Änderungen wie CLI-Hilfetexte oder JSDoc/TSDoc in
bestehenden Dateien).

## Wie es weitergeht

Die vollständige Tool-Referenz, Guides zu Konfiguration, Worktree/Delivery,
Remote-Tracker und Skill-Discovery sowie Troubleshooting und Glossar findest du im
[Benutzer-Guide-Index](README.md).
