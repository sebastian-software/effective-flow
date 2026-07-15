# Troubleshooting und FAQ

Häufige Fragen und Fehlerbilder rund um Firmo – sortiert nach Thema. Führt eine Meldung dich
hierher, prüfe zuerst den passenden Abschnitt, bevor du einen Lauf wiederholst.

## „gh: command not found“ oder „tea: command not found“

Der [Remote-Tracker](./remote-tracker.md) und `/firmo pr` benötigen im Remote-Modus ein
installiertes und authentifiziertes CLI:

- **GitHub** (Host `github.com`): [`gh`](https://cli.github.com/) installieren, danach
  `gh auth login` bzw. `gh auth status` zur Prüfung.
- **Forgejo/Gitea** (jeder andere Host): `tea` installieren und mit dem jeweiligen Login
  konfigurieren.

Fehlt das CLI oder ist es nicht authentifiziert, bricht Firmo bewusst **klar ab**, statt
still auf den lokalen Modus zurückzufallen – so bleibst du nie im Unklaren darüber, ob ein
Finding tatsächlich als Issue angelegt wurde. Einen Fallback auf `local` bietet Firmo nur an,
wenn du ihm ausdrücklich zustimmst. Prüfe danach mit `git remote get-url origin`, ob der
richtige Host erkannt wird; bei mehrdeutigen Hosts (z. B. GitHub Enterprise) hilft
`tracker.remoteToolOverride` in der [Konfiguration](./konfiguration.md#block-tracker).

## Worktree-Konflikte und uncommittete Änderungen

Firmo arbeitet standardmäßig in einem separaten [Worktree](./worktree-und-delivery.md) und
rührt deinen aktuellen Checkout dabei nicht an. Zwei Situationen führen dennoch zu einer
Rückfrage statt eines automatischen Weiterlaufs:

- **Uncommittete Änderungen im Haupt-Checkout**, wenn ausnahmsweise ohne Worktree
  (`worktree.enabled: false`) geliefert werden soll: Firmo staged, stasht oder überschreibt
  diese Änderungen nie still. Committe oder stashe sie manuell, oder lass die Umsetzung
  regulär im Default-Worktree laufen.
- **Entfernen des Worktrees schlägt fehl**, weil darin noch uncommittete Reste liegen: Der
  Worktree bleibt dann bewusst bestehen, Firmo meldet den Pfad. Prüfe die Reste manuell
  (`git -C <Worktree-Pfad> status`) und committe oder verwirf sie, bevor du
  `git worktree remove <Pfad>` erneut versuchst.

Ein Merge-Konflikt beim Abschluss (`delivery.completion: merge`) wird ebenfalls nie
automatisch aufgelöst: Firmo stoppt, belässt den Liefer-Branch und informiert dich, damit du
den Konflikt gezielt beheben kannst.

## „Das Klärungs-Gate wurde nicht bestanden“

Bevor ein umsetzendes Tool (`build`, `fix`, `refactor`, `docs`, `apply`) eine Plan-Datei, ein
Issue oder ein Review-Finding tatsächlich umsetzt, prüft es, ob die Grundlage **vollständig
geklärt** ist. Das Gate schlägt insbesondere dann fehl, wenn:

- die Plan-Datei noch einen Abschnitt „Offene Punkte“ mit echten Einträgen enthält,
- messbare Akzeptanzkriterien fehlen oder ohne konkrete Prüfung formuliert sind,
- als Annahme markierte Punkte das Verhalten, den Scope oder das Risiko der Umsetzung
  wesentlich beeinflussen,
- ein Issue oder Finding die gewünschte Umsetzung nicht eigenständig genug beschreibt, um es
  ohne Rückfrage abzuarbeiten.

Das ist **kein Fehler**, sondern eine bewusste Sicherung gegen Umsetzung auf Basis von
Annahmen. Firmo bricht in diesem Fall nicht mitten in der Umsetzung ab, sondern verweist
zurück auf die Klärung:

- eine Plan-Datei geht an [`/firmo plan`](./tools-verstehen.md) bzw. dessen vertieften Review
  (`/firmo review <plandatei>`),
- ein Issue oder Finding geht an [`/firmo plan-issue`](./tools-verstehen.md).

Ergänze dort die fehlenden Angaben und rufe das umsetzende Tool anschließend erneut auf.

## Falsche oder unerwartete Marker-Sprache in Plan-Dateien

Der Statusmarker im Kopf einer Plan-Datei (z. B. `**Planungsstatus:** Nicht umgesetzt` bzw.
`**Plan status:** Not implemented`) folgt `plan.markerLanguage` aus
`.firmo/config.json`. Ist der Schlüssel dort nicht gesetzt, erkennt Firmo die Sprache aus
bereits vorhandenen Plan-Dateien im Verzeichnis `<plan.dir>`; findet sich kein eindeutiges
Signal, ist der Default Englisch. Nur der Marker selbst folgt dieser Einstellung – der
restliche Planinhalt bleibt unabhängig davon in der Sprache verfasst, in der der Plan
geschrieben wurde.

Um die Sprache dauerhaft festzulegen, setze `plan.markerLanguage` explizit über
[`/firmo setup`](./tools-einrichten.md) (Kern-Schalter „Marker“) oder trage sie manuell in
`.firmo/config.json` ein (siehe [Konfiguration](./konfiguration.md#block-plan)).

## Es existiert keine `.firmo/config.json`

Das ist kein Fehlerzustand. Ohne Config-Datei arbeitet jedes Tool mit den in
[Konfiguration](./konfiguration.md#sichere-defaults-im-überblick) dokumentierten sicheren
Defaults – Worktree an, Abschluss per Merge, lokaler Tracker, Marker-Sprache aus Erkennung
bzw. Englisch. Eine Config wird auch dann **nicht automatisch angelegt**, nur weil ein Tool
läuft; sie entsteht ausschließlich über [`/firmo setup`](./tools-einrichten.md) oder durch
manuelles Anlegen. Willst du von den Defaults abweichen, ist `/firmo setup` der einfachste
Weg – der Express-Weg übernimmt die sicheren Defaults nach einer einzigen Bestätigung.

## Siehe auch

- [Konfiguration](./konfiguration.md) – vollständige Feldreferenz
- [Worktree und Delivery](./worktree-und-delivery.md)
- [Remote-Tracker](./remote-tracker.md)
- [Glossar](./glossar.md)
