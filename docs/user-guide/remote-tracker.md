# Remote-Tracker

[`/effective-flow review`](./tools-qualitaet.md) und die Review-Abarbeitung in
[`/effective-flow apply`](./tools-umsetzen.md) können Findings auf zwei Arten führen: lokal als
Markdown-Report oder remote als Issues auf GitHub oder Forgejo. Dieser Guide erklärt beide
Modi und wie du zwischen ihnen wechselst; die Feldreferenz steht in
[Konfiguration](./konfiguration.md#block-tracker).

## Lokaler Modus (Default)

Ohne weitere Konfiguration (`tracker.mode: local`) verhalten sich Review und
Findings-Abarbeitung wie gewohnt: Findings landen in einer Markdown-Report-Datei unter
`.effective-flow/review/`, es wird kein externes CLI aufgerufen und keine Netzwerkverbindung benötigt.
Dieser Report bleibt – wie der gesamte Laufzeit-Status unter `.effective-flow/` – lokal und
ungetrackt.

## Remote-Modus

Mit `tracker.mode: remote` erzeugt `/effective-flow review` für jedes Finding stattdessen ein Issue
auf deinem Git-Hosting-Dienst, gebündelt unter einem Epic-/Tracking-Issue. `/effective-flow apply`
liest diese Issues anschließend wieder ein und arbeitet sie ab.

Wichtig: Der lokal/remote-Umschalter betrifft **ausschließlich Reviews**.
[Investigationen](./tools-verstehen.md) bleiben in jedem Modus rein lokal unter
`.effective-flow/investigation/` – sie werden nie committet und nie als Issue angelegt. Von den
Effective Flow-Artefakten wird ausschließlich die Plan-Datei committet (siehe
[Worktree und Delivery](./worktree-und-delivery.md)).

### Werkzeug-Erkennung

Effective Flow unterscheidet nicht selbst zwischen GitHub und Forgejo, sondern liest die
`origin`-Remote deines Repositories:

- Host exakt `github.com` → Werkzeug `gh`
- jeder andere Host → Werkzeug `tea` (Forgejo/Gitea)

Bei einem mehrdeutigen Host (z. B. selbst gehostetes GitHub Enterprise) erzwingst du das
Werkzeug über `tracker.remoteToolOverride: github` oder `forgejo`; im Default `auto`
entscheidet die automatische Erkennung. Voraussetzung ist in jedem Fall ein
Git-Repository mit `origin`-Remote sowie ein installiertes und authentifiziertes CLI
(`gh auth status` bzw. das entsprechende `tea`-Login) – fehlt eines davon, bricht Effective Flow mit
einer klaren Fehlermeldung ab, statt still auf `local` zurückzufallen (siehe
[Troubleshooting](./troubleshooting.md)).

### Modus je Lauf bestimmen

Effective Flow bestimmt den effektiven Modus in dieser Reihenfolge:

1. **Argumenttyp:** Übergibst du eine Report-Datei, erzwingt das `local`; übergibst du eine
   Issue-Nummer oder -URL, erzwingt das `remote` – unabhängig von der Config.
2. **Ausdrücklicher Wunsch im Auftrag:** „als Issues“ bzw. „nur lokal, ohne Issues“.
3. **Config:** sonst gilt `tracker.mode` aus `.effective-flow/config.json`.
4. **Erstaufruf-Abfrage:** Ist nichts davon gesetzt, fragt Effective Flow einmalig nach und speichert
   die Antwort nicht-destruktiv in `.effective-flow/config.json`.

### Labels

Im Remote-Modus vergibt Effective Flow Labels mit dem Präfix `effective-flow-` und legt fehlende
Labels bei Bedarf idempotent an:

| Label                                                                                             | Bedeutung                                                            |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `effective-flow-review-finding`                                                                   | einzelnes Finding-Issue                                              |
| `effective-flow-review-epic`                                                                      | Epic-/Tracking-Issue                                                 |
| `effective-flow-fix` / `effective-flow-refactor` / `effective-flow-build` / `effective-flow-docs` | Ziel-Aktion des Findings (genau eine pro Finding-Issue)              |
| `kritisch` / `wichtig` / `hinweis`                                                                | Schweregrad (genau einer pro Finding-Issue)                          |
| `wontfix`                                                                                         | bewusst nicht umgesetzt (ADR statt Code)                             |
| `effective-flow-issue-done`                                                                       | von `/effective-flow apply` (issue-getrieben) umgesetzt, PR erstellt |
| `effective-flow-needs-planning`                                                                   | übersprungen, Klärung über `/effective-flow plan-issue` nötig        |

Neu angelegt oder gesetzt wird nur noch `effective-flow-…`; beim Lesen, Auflisten und
Deduplizieren zählt zusätzlich das Vorgänger-Präfix `firmo-` weiterhin als gleichwertig (eine
Generation Backcompat) – ein manuelles Umbenennen ist also nicht nötig. Das noch ältere Präfix
`sf-` wird beim ersten Remote-Zugriff **einmalig** auf `effective-flow-` migriert und danach
nicht mehr laufend erkannt.

## Zusammenspiel mit issue-getriebenen Tools

Neben `/effective-flow review`/`/effective-flow apply` nutzen auch [`/effective-flow apply` (Issue-Modus)](./tools-umsetzen.md)
und [`/effective-flow plan-issue`](./tools-verstehen.md) dieselbe Host- und CLI-Erkennung sowie dasselbe
Werkzeug-Mapping – allerdings für **beliebige** Issues, nicht nur für von Effective Flow erzeugte
Findings. Diese beiden Tools sind inhärent remote: Sie werten `tracker.mode` nicht aus,
sondern brauchen lediglich ein Git-Repository mit `origin`-Remote und ein authentifiziertes
CLI.

## Siehe auch

- [Konfiguration](./konfiguration.md) – vollständige Feldreferenz für `tracker`
- [Tools Qualität](./tools-qualitaet.md) – `/effective-flow review`
- [Tools umsetzen](./tools-umsetzen.md) – `/effective-flow apply`
- [Troubleshooting](./troubleshooting.md) – fehlendes oder nicht authentifiziertes CLI
- [Glossar](./glossar.md) – Finding, Tracker
