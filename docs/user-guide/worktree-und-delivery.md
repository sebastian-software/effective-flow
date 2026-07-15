# Worktree und Delivery

Sobald ein Firmo-Tool Code, Tests oder Dokumentation ändert (`build`, `fix`, `refactor`,
`docs`, `maintain`, `apply`), stellt sich dieselbe Frage zweimal: **Wo** läuft die Arbeit,
und **wie** kommt das Ergebnis zurück in deinen Zielbranch? Beides regeln zwei getrennte,
unabhängige Konfigurationsblöcke – `worktree` für den Ausführungsort, `delivery` für den
Liefer-Branch und dessen Abschluss. Die genauen Feldwerte stehen in
[Konfiguration](./konfiguration.md#block-worktree) – dieser Guide erklärt das Zusammenspiel.

## Worktree: der Ausführungsort

Standardmäßig (`worktree.enabled: true`) läuft die Umsetzung **nicht** in deinem aktuellen
Checkout, sondern in einem separaten Git-Worktree mit eigenem Branch. Das hat zwei Vorteile:

- Dein aktueller Arbeitsstand – auch uncommittete Änderungen – bleibt unberührt.
- Die gesamte Arbeit eines Laufs ist von Anfang an sauber auf einem eigenen Branch gebündelt.

Der Worktree entsteht unter `<worktree.baseDir>/<Repo-Name>/<Session-ID>` (Default-Basis
`.firmo/.worktrees`) und wird per `git worktree add` zusammen mit dem Liefer-Branch angelegt.
Anschließend läuft dort – je nach `worktree.setup` – automatisch die passende
Abhängigkeits-Installation (erkannt am Lockfile, z. B. `pnpm install --frozen-lockfile` bei
`pnpm-lock.yaml`), gar kein Setup (`none`) oder ein von dir angegebener Befehl.

Wer ausdrücklich in seinem aktuellen Checkout arbeiten möchte – etwa für einen schnellen,
nicht gelieferten Probelauf –, setzt `worktree.enabled: false` oder verlangt das explizit im
Auftrag („ohne Worktree“, „direkt auf dem aktuellen Branch“).

## Delivery: der Liefer-Branch

Es gibt bewusst **keinen** eigenen `delivery.enabled`-Schalter mehr. Delivery ist immer dann
aktiv, wenn im Worktree oder auf einem eigenen Liefer-Branch gearbeitet wird – im
Default-Fall also immer. Der Liefer-Branch heißt
`<delivery.branchPrefix>/<skill>/<slug>` (z. B. `firmo/build/user-login`), abgeleitet aus
Plan-Titel, Aufgabenbeschreibung, Issue oder Finding; bei einer Namenskollision hängt Firmo
ein numerisches Suffix an und meldet den gewählten Namen.

Als Ausgangspunkt dient `delivery.baseBranch` (Default `origin/main`). Ist das ein
Remote-Ref, holt Firmo vorher per `git fetch` den aktuellen Stand, damit der Liefer-Branch
nicht veraltet startet.

### Nur In-Place, ohne Worktree

Ist `worktree.enabled: false`, aber weiterhin eine Liefer-Aktion (PR, Merge, Branch)
gewünscht, erzeugt Firmo den Liefer-Branch direkt im Haupt-Repo statt in einem Worktree.
Enthält dein aktueller Arbeitsbaum dann uncommittete Änderungen, die nicht Teil des
Liefer-Branches werden sollen, fragt Firmo nach, statt sie still zu stagen, zu stashen oder
zu überschreiben.

### Was committet wird und was lokal bleibt

Von den Firmo-Artefakten wird **ausschließlich die Plan-Datei** committet – und auch das
nur, sofern der Workflow eine geführt hat. Alle übrigen `.firmo/`-Artefakte
(`memory.json`, `cache.json`, lokale Review-Reports, Investigationen, Worktrees selbst)
bleiben reine Buchhaltung im Haupt-Repo und werden nie in den Liefer-Branch übernommen.

## Abschluss-Aktion (`delivery.completion`)

Nach Abschluss der eigentlichen Arbeit entscheidet `delivery.completion` (Default `merge`),
was mit dem fertigen Liefer-Branch passiert:

| Wert     | Verhalten                                                                                                                                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `merge`  | Branch wird lokal per Fast-Forward oder Merge-Commit in `delivery.baseBranch` gemergt. Bei Konflikt stoppt Firmo, belässt den Branch und informiert dich – keine automatische Konfliktauflösung. |
| `pr`     | Branch wird gepusht, [`/firmo pr`](./tools-einbringen.md) öffnet einen Pull-Request gegen `delivery.baseBranch`.                                                                                 |
| `branch` | Der Branch bleibt einfach im lokalen Repo liegen; du entscheidest später selbst über PR oder Merge.                                                                                              |

Ist `delivery.completion` nicht gesetzt (`null`), fragt Firmo bei jedem Lauf erneut nach der
gewünschten Aktion.

Ist ein Worktree beteiligt, entfernt Firmo ihn nach erfolgreichem Abschluss automatisch
(`git worktree remove`); der Liefer-Branch selbst bleibt im lokalen Repo erhalten. Schlägt
das Entfernen wegen uncommitteter Reste fehl, bleibt der Worktree bestehen und Firmo meldet
den Pfad.

### Bestehende Pull-Requests aktualisieren

Braucht ein bereits eröffneter Pull-Request nachträglich Änderungen, kommen diese immer als
**neue Commits** auf denselben Branch – niemals per `commit --amend`, interaktivem Rebase,
Squash oder Force-Push. Scheitert ein normaler Push wegen divergierter Remote-History, stoppt
Firmo und meldet den Konflikt, statt die History zu überschreiben.

## Plan-Datei: Statuswechsel am Delivery-Punkt

Führte der Workflow eine Plan-Datei, markiert Firmo sie erst unmittelbar am Delivery-Punkt –
also kurz bevor der PR geöffnet oder der Branch gemergt wird – als umgesetzt und verschiebt
sie nach `<plan.dir>/archive/`. Dieser Statuswechsel wird mitcommittet und ist damit Teil des
PRs bzw. Merges. Details zum Plan-Format stehen in [Tools verstehen](./tools-verstehen.md).

## Zusammenspiel mit `/firmo pr`

Bei `delivery.completion: pr` delegiert der abschließende Schritt an
[`/firmo pr`](./tools-einbringen.md) und übergibt Liefer- und Basis-Branch. `/firmo pr` selbst
kennt keinen eigenen Worktree-Modus – es setzt voraus, dass der Branch bereits existiert und
gepusht werden kann, und kümmert sich nur um die PR-Erstellung (inklusive Host-Erkennung für
`gh` bzw. `tea`, siehe [Remote-Tracker](./remote-tracker.md)). Rufst du `/firmo pr` direkt für
einen manuell erstellten Branch auf, gelten dieselben Regeln zu Basis-Branch und
Nicht-Umschreiben bestehender PR-Commits wie oben beschrieben.

## Abgrenzung: der Apply-Review-eigene Worktree

`applyReview.worktree.*` (siehe [Konfiguration](./konfiguration.md#block-applyreview)) ist
ein **eigener, unabhängiger** Mechanismus von [`/firmo apply`](./tools-umsetzen.md) beim
Abarbeiten von Review-Findings: Er isoliert die **parallele** Bearbeitung mehrerer Findings in
separaten Worktrees und führt deren Commits per Cherry-Pick auf deinen aktuellen Branch
zurück – er erzeugt also **keinen** Liefer-Branch im Sinne dieses Guides. Beide Mechanismen
können denselben physischen `baseDir` nutzen, da sie unterschiedliche Session- und
Pfadsegmente verwenden; verwechsle sie bei der Konfiguration nicht.

## Siehe auch

- [Konfiguration](./konfiguration.md) – vollständige Feldreferenz für `delivery` und
  `worktree`
- [Tools umsetzen](./tools-umsetzen.md) – Tools, die diesen Mechanismus nutzen
- [Tools einbringen](./tools-einbringen.md) – `/firmo commit` und `/firmo pr`
- [Troubleshooting](./troubleshooting.md) – Worktree-Konflikte und uncommittete Änderungen
- [Glossar](./glossar.md) – Worktree, Delivery, Liefer-Branch
