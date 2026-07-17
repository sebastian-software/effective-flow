# Troubleshooting und FAQ

Häufige Fragen und Fehlerbilder rund um Effective Flow – sortiert nach Thema. Führt eine Meldung dich
hierher, prüfe zuerst den passenden Abschnitt, bevor du einen Lauf wiederholst.

## „gh: command not found“ oder „tea: command not found“

Der [Remote-Tracker](./remote-tracker.md) und `/effective-flow pr` benötigen im Remote-Modus ein
installiertes und authentifiziertes CLI:

- **GitHub** (Host `github.com`): [`gh`](https://cli.github.com/) installieren, danach
  `gh auth login` bzw. `gh auth status` zur Prüfung.
- **Forgejo/Gitea** (jeder andere Host): `tea` installieren und mit dem jeweiligen Login
  konfigurieren.

Fehlt das CLI oder ist es nicht authentifiziert, bricht Effective Flow bewusst **klar ab**, statt
still auf den lokalen Modus zurückzufallen – so bleibst du nie im Unklaren darüber, ob ein
Finding tatsächlich als Issue angelegt wurde. Einen Fallback auf `local` bietet Effective Flow nur an,
wenn du ihm ausdrücklich zustimmst. Prüfe danach mit `git remote get-url origin`, ob der
richtige Host erkannt wird; bei mehrdeutigen Hosts (z. B. GitHub Enterprise) hilft
`tracker.remoteToolOverride` in der [Konfiguration](./konfiguration.md#block-tracker).

## Worktree-Konflikte und uncommittete Änderungen

Effective Flow arbeitet standardmäßig in einem separaten [Worktree](./worktree-und-delivery.md) und
rührt deinen aktuellen Checkout dabei nicht an. Zwei Situationen führen dennoch zu einer
Rückfrage statt eines automatischen Weiterlaufs:

- **Uncommittete Änderungen im Haupt-Checkout**, wenn ausnahmsweise ohne Worktree
  (`worktree.enabled: false`) geliefert werden soll: Effective Flow staged, stasht oder überschreibt
  diese Änderungen nie still. Committe oder stashe sie manuell, oder lass die Umsetzung
  regulär im Default-Worktree laufen.
- **Entfernen des Worktrees schlägt fehl**, weil darin noch uncommittete Reste liegen: Der
  Worktree bleibt dann bewusst bestehen, Effective Flow meldet den Pfad. Prüfe die Reste manuell
  (`git -C <Worktree-Pfad> status`) und committe oder verwirf sie, bevor du
  `git worktree remove <Pfad>` erneut versuchst.

Ein Merge-Konflikt beim Abschluss (`delivery.completion: merge`) wird ebenfalls nie
automatisch aufgelöst: Effective Flow stoppt, belässt den Liefer-Branch und informiert dich, damit du
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
Annahmen. Effective Flow bricht in diesem Fall nicht mitten in der Umsetzung ab, sondern verweist
zurück auf die Klärung:

- eine Plan-Datei geht an [`/effective-flow plan`](./tools-verstehen.md) bzw. dessen vertieften Review
  (`/effective-flow review <plandatei>`),
- ein Issue oder Finding geht an [`/effective-flow plan-issue`](./tools-verstehen.md).

Ergänze dort die fehlenden Angaben und rufe das umsetzende Tool anschließend erneut auf.

## Falsche oder unerwartete Marker-Sprache in Plan-Dateien

Der Statusmarker im Kopf einer Plan-Datei (z. B. `**Planungsstatus:** Nicht umgesetzt` bzw.
`**Plan status:** Not implemented`) folgt `plan.markerLanguage` aus
`.effective-flow/config.json`. Ist der Schlüssel dort nicht gesetzt, erkennt Effective Flow die Sprache aus
bereits vorhandenen Plan-Dateien im Verzeichnis `<plan.dir>`; findet sich kein eindeutiges
Signal, ist der Default Englisch. Nur der Marker selbst folgt dieser Einstellung – der
restliche Planinhalt bleibt unabhängig davon in der Sprache verfasst, in der der Plan
geschrieben wurde.

Um die Sprache dauerhaft festzulegen, setze `plan.markerLanguage` explizit über
[`/effective-flow setup`](./tools-einrichten.md) (Kern-Schalter „Marker“) oder trage sie manuell in
`.effective-flow/config.json` ein (siehe [Konfiguration](./konfiguration.md#block-plan)).

## Es existiert keine `.effective-flow/config.json`

Das ist kein Fehlerzustand. Ohne Config-Datei arbeitet jedes Tool mit den in
[Konfiguration](./konfiguration.md#sichere-defaults-im-überblick) dokumentierten sicheren
Defaults – Worktree an, Abschluss per Merge, lokaler Tracker, Marker-Sprache aus Erkennung
bzw. Englisch. Eine Config wird auch dann **nicht automatisch angelegt**, nur weil ein Tool
läuft; sie entsteht ausschließlich über [`/effective-flow setup`](./tools-einrichten.md) oder durch
manuelles Anlegen. Willst du von den Defaults abweichen, ist `/effective-flow setup` der einfachste
Weg – der Express-Weg übernimmt die sicheren Defaults nach einer einzigen Bestätigung.

## Alte `.firmo/`-/`.sf-plugin/`-Verzeichnisse oder `firmo-`-Labels loswerden

Effective Flow migriert projektlokale Altdaten (`.firmo/`, `.sf-plugin/`, `firmo-`-Labels)
**non-destruktiv**: Es kopiert bei Bedarf und liest das Alte als Fallback, löscht es aber nie
von selbst. Bleiben nach einer Migration also Alt-Verzeichnisse, eine enttrackte
`.firmo/config.json` oder `firmo-`-Labels zurück, ist das **kein Fehler**, sondern Absicht.

Zum endgültigen Aufräumen dient [`/effective-flow cleanup`](./tools-einrichten.md): Es zeigt
zuerst eine Bestandsaufnahme und eine Dry-Run-Vorschau, fragt vor jedem Löschen und entfernt
getrackte Dateien via `git rm` (über die Git-Historie wiederherstellbar), ungetrackte
Verzeichnisse erst nach ausdrücklicher Bestätigung. Es committet nicht und legt kein Backup
an – die gestageten Änderungen bringst du danach mit
[`/effective-flow commit`](./tools-einbringen.md) ein.

## Siehe auch

- [Konfiguration](./konfiguration.md) – vollständige Feldreferenz
- [Worktree und Delivery](./worktree-und-delivery.md)
- [Remote-Tracker](./remote-tracker.md)
- [Glossar](./glossar.md)
