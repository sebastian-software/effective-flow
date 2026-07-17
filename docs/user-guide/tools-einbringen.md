# Tool-Referenz: Änderungen einbringen

Diese Gruppe bringt fertige Änderungen ins Repository: einen Commit erzeugen und daraus einen
Pull-Request öffnen. Beide Tools führen bewusst **keine** eigene Projektvalidation (Linting,
Tests, Build-Checks) aus – dafür sind `code-validator` und `test-writer` bzw. die
Umsetzungs-Tools zuständig.

## `/effective-flow commit`

**Zweck:** Erzeugt eine beschreibende Commit-Message für bereits **gestagte** Änderungen und
führt den Commit per `git` aus. Committet ausschließlich, was schon `git add`-staged ist.

**Wann nutzen:** Wenn nur die aktuell gestagten Änderungen committet werden sollen, mit einer
passenden Conventional-Commit-Message.

**Typischer Aufruf:** `/effective-flow commit`

**Ein-/Ausgabe:** Eingabe ist der staged Diff. Ausgabe ist ein Commit mit
Conventional-Commit-Präfix (`feat:` neue Funktionalität, `fix:` Fehlerbehebung, `chore:`
Wartung, `docs:` Dokumentation, `refactor:` Strukturverbesserung ohne Verhaltensänderung,
`test:` Teständerung), Message auf Englisch, ohne `Co-Authored-By`-Zeilen.

**Zusammenspiel:** Wird typischerweise am Ende eines `/effective-flow build`-, `/effective-flow fix`-,
`/effective-flow refactor`-, `/effective-flow docs`- oder `/effective-flow maintain`-Laufs verwendet (die diese
Commit-Regeln intern ebenfalls befolgen) oder eigenständig für manuell gestagte Änderungen.
Respektiert bestehende Husky-Hooks (commitlint, prettier, lint); schlagen sie fehl, gibt
`commit` die Ursache knapp wieder, statt die Hooks zu umgehen. Bei mehreren unverbundenen
Themen im staged Diff schlägt es vor, zuerst zu splitten.

## `/effective-flow pr`

**Zweck:** Erstellt aus einem lokalen Branch – oder über einen frisch erzeugten
Delivery-Branch – einen Pull-Request auf dem erkannten Git-Host: GitHub über `gh` oder
Forgejo über `tea`. Erkennt den Host automatisch an der `origin`-URL, pusht den Branch bei
Bedarf, leitet Titel und Beschreibung aus den Commits ab und stellt den Checkout nach
erfolgreicher PR-Erstellung zurück.

**Wann nutzen:** Wenn fertige Änderungen auf einem Branch als Pull-Request zur Review
eingereicht werden sollen, statt sie direkt zu mergen.

**Typischer Aufruf:** `/effective-flow pr`

**Ein-/Ausgabe:** Eingabe ist der Head-Branch (Default: aktuell ausgecheckter Branch) und der
Basis-Branch (Default aus `delivery.baseBranch`, Legacy-Fallback `worktree.baseBranch`, sonst
`main`). Ausgabe ist die PR-URL, der Branch-Name und der finale lokale Checkout-Zustand.

**Conventional-Commit-Titel:** `pr` erzwingt einen PR-Titel mit gültigem Conventional-Commit-Typ
(`feat:`, `fix:`, `docs:`, `refactor:`, …), abgeleitet nach der **Wirkung** der Änderung bzw. dem
auslösenden Workflow; ein bereits gültiger, selbst gesetzter Titel bleibt erhalten. Das ist
wichtig, weil Repositories mit **Squash-Merge** den PR-Titel als Subject des einzigen Commits auf
dem Zielbranch übernehmen: Dort ist der PR-Titel Teil des Release-Vertrags, und
**release-please** leitet den Versions-Bump daraus ab. Ein untypisierter Titel führt trotz grüner
CI zu einem stillen No-Op-Release (keine Version, keine Auslieferung) – deshalb normalisiert `pr`
den Titel und fragt nur bei echter Mehrdeutigkeit nach.

**Zusammenspiel:** `pr` ist eine der drei möglichen Abschluss-Aktionen
(`delivery.completion: pr`), die `/effective-flow build`, `/effective-flow fix`, `/effective-flow refactor`,
`/effective-flow docs` und `/effective-flow maintain` am Ende ihres Delivery-/Worktree-Handbacks auslösen
können – neben `merge` und `branch`. `pr` lässt sich aber auch eigenständig aufrufen, etwa um
einen bereits vorbereiteten Liefer-Branch nachträglich als PR zu öffnen. Details zu
Liefer-Branch und Abschluss-Aktionen siehe [Worktree und Delivery](worktree-und-delivery.md);
die zugehörigen Config-Schlüssel siehe [Konfiguration](konfiguration.md).

## Weiterführend

- [Worktree und Delivery](worktree-und-delivery.md) – Liefer-Branch, Abschluss-Aktionen
  (`pr`/`merge`/`branch`)
- [Konfiguration](konfiguration.md) – `delivery.*`-Schlüssel im Detail
- [Tools: Umsetzen](tools-umsetzen.md) – die Workflows, die `commit` und `pr` typischerweise
  am Ende auslösen
