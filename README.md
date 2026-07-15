# Firmo

Firmo bündelt einen kompletten Software-Engineering-Workflow als Tools: von der Klärung
über die Umsetzung bis zur Übergabe – aufgerufen über `/firmo <tool>`, ausgeliefert als
**ein** Skill für **Claude Code** und **Codex**, gebaut aus einer einzigen Quelle.

Kein Sammelsurium einzelner Prompts, sondern ein durchgängiger Satz an Werkzeugen, die
sich gegenseitig kennen: `plan` empfiehlt den passenden Folge-Workflow, `build`, `fix`,
`refactor` und `docs` teilen dieselben Konventionen für Tests, Review und Abschluss, und
`commit`/`pr` schließen den Kreis bis zum Pull-Request.

## Warum Firmo

- **Ein Werkzeug für den ganzen Zyklus.** `investigate` und `plan` klären die Aufgabe,
  `build`, `fix`, `refactor`, `docs` und `maintain` setzen um, `review` prüft, `commit`
  und `pr` bringen die Änderung ein – ohne Bruch zwischen den Phasen.
- **Dünner Router, Lazy-Loading.** Firmo lädt beim Start nur den Tool-Katalog; die
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
- **Läuft ohne Konfiguration, wächst mit ihr.** Firmo funktioniert direkt nach der
  Installation; wer Review-Tiefe, Worktree-Verhalten oder Issue-Tracker-Anbindung steuern
  will, tut das über eine einzige `.firmo/config.json`.

## Schnellstart

```sh
./install-skill.sh
```

Danach in Claude Code oder Codex `/firmo plan` aufrufen (Codex: `$firmo plan`), um mit
der Planung einer ersten Aufgabe zu starten.

## Weiterlesen

- **Nutzung:** [docs/user-guide/README.md](docs/user-guide/README.md) – Installation,
  Tool-Referenz, Konfiguration, Troubleshooting.
- **Technik:** [docs/developer-guide/architektur.md](docs/developer-guide/architektur.md) –
  Source-to-dist-Build, Router-Konzept, Beitrag zum Projekt.
