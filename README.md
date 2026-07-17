# Effective Flow

Effective Flow bündelt einen kompletten Software-Engineering-Workflow als Tools: von der Klärung
über die Umsetzung bis zur Übergabe – aufgerufen über `/effective-flow <tool>`, ausgeliefert als
**ein** Skill für **Claude Code** und **Codex**, gebaut aus einer einzigen Quelle.

Kein Sammelsurium einzelner Prompts, sondern ein durchgängiger Satz an Werkzeugen, die
sich gegenseitig kennen: `plan` empfiehlt den passenden Folge-Workflow, `build`, `fix`,
`refactor` und `docs` teilen dieselben Konventionen für Tests, Review und Abschluss, und
`commit`/`pr` schließen den Kreis bis zum Pull-Request.

## Warum Effective Flow

- **Ein Werkzeug für den ganzen Zyklus.** `investigate` und `plan` klären die Aufgabe,
  `build`, `fix`, `refactor`, `docs` und `maintain` setzen um, `review` prüft, `commit`
  und `pr` bringen die Änderung ein – ohne Bruch zwischen den Phasen.
- **Dünner Router, Lazy-Loading.** Effective Flow lädt beim Start nur den Tool-Katalog; die
  vollständige Anweisung eines Tools kommt erst beim Aufruf. Das hält Sessions schlank
  und verhindert, dass die Token-Grenze durch vorab geladene Tools erschöpft wird.
- **Eine Quelle, zwei Harnesses.** Claude Code und Codex laufen mit demselben Verhalten,
  gebaut aus einem einzigen `src/`-Baum – keine zwei Wahrheiten, die auseinanderlaufen.
- **Skill-Discovery statt starrem Preload.** Tools und Agents erkennen zur Laufzeit, welche
  Host-Skills verfügbar sind, und wenden sie situativ an, statt eine feste Liste
  vorzuladen.
- **Worktree und Delivery, wenn gewünscht.** Umsetzungs-Workflows können parallel in einem
  eigenen Git-Worktree laufen und am Ende automatisch mergen, einen Branch stehen lassen
  oder einen Pull-Request öffnen.
- **Läuft ohne Konfiguration, wächst mit ihr.** Effective Flow funktioniert direkt nach der
  Installation; wer Review-Tiefe, Worktree-Verhalten oder Issue-Tracker-Anbindung steuern
  will, tut das über eine einzige `.effective-flow/config.json`.

## Schnellstart

```sh
./install-skill.sh
```

Danach in Claude Code oder Codex `/effective-flow plan` aufrufen (Codex: `$effective-flow plan`), um mit
der Planung einer ersten Aufgabe zu starten.

## Weiterlesen

- **Nutzung:** [docs/user-guide/README.md](docs/user-guide/README.md) – Installation,
  Tool-Referenz, Konfiguration, Troubleshooting.
- **Technik:** [docs/developer-guide/README.md](docs/developer-guide/README.md) –
  Source-to-dist-Build, Router-Konzept, Beitrag zum Projekt.
