# Tool-Referenz: Qualität sichern

Diese Gruppe umfasst genau ein Tool: `review`. Es prüft bestehenden Code auf Qualität und
liefert strukturierte Findings, die direkt als Input für die Umsetzungs-Tools dienen.

## `/firmo review`

**Zweck:** Orchestriert ein umfassendes Code-Review – oder, wenn das Argument eindeutig auf
eine Plan-Datei zeigt, einen vertieften interaktiven Plan-Review. Beim Code-Review laufen drei
Datensammlungs-Phasen parallel: Designentscheidungs-Erkennung (ADRs, Pläne, Konventionen,
Code-Kommentare, Lint-Suppressions, frühere Reviews), technische Validierung
(TypeScript/Lint/Build) und ein projekttyp-passender Reviewer-Pass. Danach werden Findings
aggregiert, gegen dokumentierte Designentscheidungen gefiltert (damit bewusste Entscheidungen
nicht fälschlich als Problem gemeldet werden) und berichtet.

**Wann nutzen:** Vor einem Merge, nach einem größeren Umsetzungslauf oder immer dann, wenn
unabhängig von einem laufenden Workflow eine Qualitätsprüfung des Codes gewünscht ist. Auch
geeignet, um einen bestehenden Plan vor der Umsetzung vertieft gegenzuprüfen.

**Typischer Aufruf:**

- `/firmo review` – ohne Argument: reviewt uncommitted Changes, falls vorhanden, sonst den
  gesamten Code
- `/firmo review <Bereich>` – reviewt nur den beschriebenen Bereich
- `/firmo review <plandatei>` – startet stattdessen den vertieften interaktiven
  Plan-Review für diese Plan-Datei

**Ein-/Ausgabe:**

- Standard-Finding-Scope ist **nur kritisch + wichtig**; Hinweise erscheinen nur bei
  explizit gewünschtem umfassendem Review.
- Im lokalen Tracker-Modus (Default): Ausgabe ist ein Bericht unter
  `.firmo/review/review-report-YYYY-MM-DD[-N].md` mit Finding-Tabelle, Schweregrad,
  Komplexität, Datei+Zeile, Empfehlung und vorgeschlagener Folgeaktion.
- Im Remote-Tracker-Modus (`tracker.mode: remote`): kein lokaler Report, stattdessen ein
  Finding-Issue je neuem Finding plus ein Epic-Issue, das sie bündelt; bereits vorhandene
  Findings werden dedupliziert.
- Findings werden fortlaufend nummeriert (`R-0000001`, `R-0000002`, …) und in
  `.firmo/memory.json` verfolgt.

**Zusammenspiel:** Jedes Finding trägt eine Empfehlung für die passende Folgeaktion –
`/firmo fix` (Defekt), `/firmo refactor` (Strukturproblem), `/firmo build` (fehlende
Funktionalität) oder `/firmo docs` (Dokumentationslücke). Der entstandene Report bzw. das
Epic wird typischerweise über `/firmo apply` aufgegriffen. Verhalten und Tiefe des Reviews
lassen sich über `review.profile` (`full`/`focused`/`fast`) in `.firmo/config.json` steuern,
siehe [Konfiguration](konfiguration.md). Der Remote-Modus ist in
[Remote-Tracker](remote-tracker.md) beschrieben.

## Weiterführend

- [Tools: Umsetzen](tools-umsetzen.md) – wie Findings in `fix`/`refactor`/`build`/`docs`
  einfließen
- [Konfiguration](konfiguration.md) – `review.*`-Schlüssel im Detail
- [Remote-Tracker](remote-tracker.md) – Finding-Issues, Epics, Labels
