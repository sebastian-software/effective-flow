# Plan-Konventionen

Plan-Dateien entstehen über `/effective-flow plan` (rein planend, kein Code) und liegen unter
`<plan.dir>/`, konfigurierbar via `plan.dir` in der Effective Flow-Konfiguration (Projektsetup-ADR,
Default `docs/plan`). Dieses
Dokument beschreibt das Namensschema, die Statusmarker und den Lebenszyklus der Plan-Dateien.
Quelle ist [`src/tools/plan.md`](../../src/tools/plan.md); Agenten-Verhaltensregeln für Plan-
Dateien stehen kanonisch in [`AGENTS.md`](../../AGENTS.md), Abschnitt „Plan files (`docs/plan/`)".

## Namensschema: ISO-Datum-Slug

Neue Plan-Dateien tragen **kein** durchlaufendes Nummern-Präfix mehr. Der Dateiname ist
`<plan.dir>/YYYY-MM-DD-<slug>.md`:

- `YYYY-MM-DD` ist das Erstellungsdatum (ISO, z. B. via `date +%F`).
- `<slug>` ist ein Kebab-Case-Slug aus dem endgültigen Titel (nur `a`–`z`, `0`–`9`,
  Bindestrich).
- Die H1 im Dokument ist der Titel ohne Nummer: `# <Titel>`.

Es gibt **keine Vorab-Reservierung, keinen Stub und keine Nummer**: Die Datei entsteht direkt
unter ihrem endgültigen Namen, sobald der Plan tatsächlich geschrieben wird – anders als beim
früheren vierstelligen `NNNN`-Schema, das eine Nummernreservierung zu Beginn erforderte. Eine
Namenskollision am selben Tag wird durch ein numerisches Suffix aufgelöst
(`YYYY-MM-DD-<slug>-2.md`, `-3`, …); ein stilles Überschreiben findet nicht statt.

### Migration alter Pläne (`NNNN` → Datum)

Ältere Pläne mit dem vierstelligen Präfix (`NNNN-slug.md`) werden **einmalig** umgestellt:

- Zielname: `YYYY-MM-DD-NNNN-slug.md`, wobei `YYYY-MM-DD` das **Umstellungsdatum** ist und die
  alte `NNNN` als stabile Referenz erhalten bleibt.
- Die H1 (`# NNNN: Titel`) bleibt dabei **unverändert** – die Nummer bleibt dort als
  Referenzanker.
- Die Umbenennung erfolgt per `git mv`, um die Historie zu erhalten, und läuft als Bulk-Vorgang
  über das gesamte Plan-Verzeichnis.
- Auslöser sind ausschließlich das Erstellen eines neuen Plans oder das Einlesen eines Plans im
  Altformat – nicht jeder Effective Flow-Aufruf.

Die Auflösung einer Legacy-Nummer erfolgt primär über die H1 `# NNNN: …`, nicht über das
Dateinamen-Segment, da ein neuer, nummerähnlicher Titel-Slug sonst nicht eindeutig vom
migrierten Altformat unterscheidbar wäre.

## Statusmarker (Deutsch/Englisch)

Jeder Plan trägt im Kopfbereich genau eine kanonische Statuszeile, wahlweise auf Deutsch oder
Englisch:

```md
**Planungsstatus:** Nicht umgesetzt
```

```md
**Plan status:** Not implemented
```

Akzeptierte Werte sind `Nicht umgesetzt`/`Umgesetzt` (Deutsch) beziehungsweise
`Not implemented`/`Implemented` (Englisch). Pro Plan-Datei wird nur eine Sprache verwendet; beim
Statuswechsel auf abgeschlossen bleibt die einmal gewählte Markersprache erhalten. Die Zeile
`**Empfohlener Workflow:**` bleibt unabhängig von der Markersprache immer auf Deutsch. Nur diese
kanonische Statuszeile zählt als Status – andere Vorkommen der Begriffe in Fließtext oder
Review-Findings sind irrelevant.

Die Markersprache wird beim Anlegen eines Plans in dieser Reihenfolge bestimmt: `plan.markerLanguage`
aus der Effective Flow-Konfiguration (Projektsetup-ADR) → Auto-Detection aus vorhandenen Plänen → Rückfrage an
den User. Persistiert wird eine Entscheidung über `/effective-flow setup` in der Projektsetup-ADR, nicht mehr
in `.effective-flow/config.json`.

## Archiv umgesetzter Pläne

`<plan.dir>/` enthält nur **offene** oder **in Umsetzung** befindliche Pläne. Sobald ein Plan
vollständig umgesetzt ist, setzt der umsetzende Workflow den Statusmarker auf
`Umgesetzt`/`Implemented` und verschiebt die Datei per `git mv` nach `<plan.dir>/archive/`
(Verzeichnis bei Bedarf angelegt) – noch im selben Liefer-Branch, sodass die Verschiebung Teil
desselben Pull-Requests bzw. Merges ist. `/effective-flow open-plans` listet nur die oberste Ebene von
`<plan.dir>/`, nicht das Archiv; Auflöser für Plan-Referenzen (Pfad, Dateiname, Legacy-Nummer
oder Titel-Slug) durchsuchen dagegen sowohl `<plan.dir>/` als auch `<plan.dir>/archive/`.

## Doku-Kategorien

Pläne mit `**Empfohlener Workflow:** Dokumentation` tragen im Kopf zwei zusätzliche Zeilen:

```md
**Doku-Kategorie:** user-guide | developer-guide | operations | runbooks
**Ziel-Pfad:** docs/<kategorie>/<topic-slug>.md
```

Die vier Kategorien sind in [`src/shared/doc-categories.md`](../../src/shared/doc-categories.md)
definiert:

| Kategorie       | Verzeichnis             | Zielgruppe                                                        |
| --------------- | ----------------------- | ----------------------------------------------------------------- |
| User-Guide      | `docs/user-guide/`      | End-User der Anwendung                                            |
| Developer-Guide | `docs/developer-guide/` | Entwickler, die am Projekt mitarbeiten                            |
| Operations      | `docs/operations/`      | Betrieb, Deployment, Monitoring, Infrastruktur                    |
| Runbooks        | `docs/runbooks/`        | Step-by-Step-Prozeduren für Incident-Response und Routineaufgaben |

Kategorie und Ziel-Pfad müssen zueinander passen; der Ziel-Pfad muss innerhalb des jeweiligen
Kategorie-Verzeichnisses liegen. `docs/user-guide/README.md` und
`docs/developer-guide/README.md` sind als kuratierte Einstiegspunkte Pflicht, sobald mindestens
ein User-Guide- bzw. Developer-Guide-Dokument existiert; `operations` und `runbooks` haben
standardmäßig keine README. Slugs sind topic-basiertes Kebab-Case ohne Datums-
oder Nummern-Präfix und müssen innerhalb ihrer Kategorie eindeutig sein – das Datums-Slug-Schema
mit erhaltener Legacy-Nummer bleibt exklusiv dem Plan-Verzeichnis vorbehalten.

## Weiterführend

- [`architektur.md`](architektur.md) – Repo-Struktur, in der `<plan.dir>/` eingeordnet ist.
- [`release-und-installation.md`](release-und-installation.md) – Versionierung und Release.
- [`AGENTS.md`](../../AGENTS.md) – kanonische Plan-Datei-Regeln.
