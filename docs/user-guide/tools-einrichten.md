# Tool-Referenz: Einrichten & Infos

Diese Gruppe deckt das einmalige Einrichten eines Projekts und einen Info-Befehl ab.

## `/effective-flow setup`

**Zweck:** Bereitet ein Zielprojekt für die Nutzung von Effective Flow vor: trägt `.effective-flow/` idempotent
in die `.gitignore` ein (Laufzeit-Status wie `memory.json`, `cache.json`, `review/` oder
`.worktrees/` wird ignoriert, `.effective-flow/config.json` bleibt dabei **getrackt**) und legt
`.effective-flow/config.json` über einen geführten Wizard an bzw. aktualisiert sie nicht-destruktiv.
Startet immer von sicheren Defaults und bietet zwei Wege: **Express** (Defaults bzw.
vorhandene Werte übernehmen) oder **Geführt** (jede Option einzeln erklärt).

**Wann nutzen:** Beim ersten Einsatz von Effective Flow in einem Projekt, oder später, um einzelne
Einstellungen (Worktree, Abschluss-Aktion, Marker-Sprache, Tracker-Modus, erweiterte
Review-/Apply-Review-Werte, Skill-Discovery) anzupassen.

**Typischer Aufruf:** `/effective-flow setup`

**Ein-/Ausgabe:** Keine notwendige Eingabe außer den Antworten auf die Wizard-Fragen. Ausgabe
ist die angepasste `.gitignore` und `.effective-flow/config.json`; bei einer bereits vorhandenen Config
zeigt der Wizard vor jeder Frage den aktuell festgeschriebenen Wert und ändert nur nach
ausdrücklicher Bestätigung.

**Zusammenspiel:** `setup` ist der einzige Ort, an dem aufgeschobene Config-Migrations-
Rückfragen entschieden werden; andere Tools schieben unklare Migrationsfälle nur mit einem
sicheren Default auf. Die hier gesetzten Werte (`review.*`, `applyReview.*`, `plan.*`,
`delivery.*`, `worktree.*`, `tracker.*`, `skills.*`) steuern das Verhalten aller anderen
Tools – die vollständige Schema-Referenz steht in [Konfiguration](konfiguration.md).

## `/effective-flow cleanup`

**Zweck:** Räumt die Altlasten auf, die Effective Flows Migrationen bewusst hinterlassen. Er
erfasst vier Klassen von Altlasten im aktuellen Projekt – Alt-Laufzeitverzeichnisse
`.firmo/`/`.sf-plugin/`, eine enttrackte oder Legacy-`config.json`, veraltete
`.gitignore`-Zeilen und `firmo-`-Labels im Remote-Issue-Tracker –, liest sie, prüft gegen
ihr neues Gegenstück, ob noch etwas übernommen werden soll, lässt jeden Übernahme-Kandidaten
bestätigen und löscht die Altdaten danach **git-aware** und nur nach ausdrücklicher
Bestätigung.

**Wann nutzen:** Nachdem Effective Flow ein Projekt von einer älteren Version (`.firmo/`,
`.sf-plugin/`, `firmo-`-Labels) auf den aktuellen Stand migriert hat und du die bewusst
belassenen Altdaten endgültig loswerden willst. Alle Migrationen selbst sind
non-destruktiv; `cleanup` ist der einzige Pfad, der wirklich löscht.

**Typischer Aufruf:** `/effective-flow cleanup`

**Ein-/Ausgabe:** Keine Eingabe außer den Bestätigungen. Der Skill zeigt zuerst eine
Bestandsaufnahme, dann eine Dry-Run-Vorschau der Löschung; getrackte Dateien entfernt er via
`git rm` (über die Git-Historie wiederherstellbar), ungetrackte/gitignorte Verzeichnisse
physisch und unwiderruflich nach expliziter Bestätigung. Er erstellt **keinen** Commit und
kein Backup, fasst weder `.effective-flow/` noch die Projektsetup-ADR noch eine globale
Skill-Installation an und ist ein No-Op, wenn keine Altlasten vorhanden sind.

**Zusammenspiel:** Config-Werte aus einer Legacy-`config.json` übernimmt `cleanup` nicht
selbst – es verweist dafür auf [`/effective-flow setup`](#effective-flow-setup), den Owner
der Projektsetup-ADR. Für die gestageten `git rm`-Änderungen ist danach
[`/effective-flow commit`](tools-einbringen.md) zuständig.

## `/effective-flow version`

**Zweck:** Zeigt die aktuell installierte Effective Flow-Version inklusive Git-Kurzhash an.

**Wann nutzen:** Um zu prüfen, welche Effective Flow-Version installiert ist, etwa vor einem
Bug-Report oder nach einem Update.

**Typischer Aufruf:** `/effective-flow version`

**Ein-/Ausgabe:** Keine Eingabe. Ausgabe ist ein einzeiliger Versionsstring; es werden keine
Dateien geändert.

**Zusammenspiel:** Die angezeigte Version stammt aus `.release-please-manifest.json` und wird
über release-please gepflegt (Versionen und `CHANGELOG.md` entstehen automatisch aus
Conventional-Commit-Messages, nicht manuell). Details zu Release- und Installationsprozess
siehe [Release und Installation](../developer-guide/release-und-installation.md).

## Weiterführend

- [Konfiguration](konfiguration.md) – vollständige `.effective-flow/config.json`-Referenz
- [Worktree und Delivery](worktree-und-delivery.md) – Auswirkung von `worktree.*`/`delivery.*`
- [Remote-Tracker](remote-tracker.md) – Auswirkung von `tracker.*`
- [Skill-Discovery](skill-discovery.md) – Auswirkung von `skills.*`
- [Release und Installation](../developer-guide/release-und-installation.md) – wie Effective Flow
  installiert und versioniert wird
