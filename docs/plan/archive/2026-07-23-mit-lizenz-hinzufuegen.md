# MIT-Lizenz vollständig ausliefern

**Planungsstatus:** Umgesetzt
**Quelle:** `$effective-flow plan`
**Empfohlener Workflow:** Feature (`$effective-flow build`)

## Anforderung

Effective Flow soll unter der MIT-Lizenz mit dem Copyright-Vermerk
`Copyright 2016 Sebastian Software GmbH` veröffentlicht werden. Der Implementierungs-PR nimmt
`LICENSE` als kanonische, getrackte Root-Datei in den Source-Branch `develop` auf.
`scripts/stage-delivery.mjs` übernimmt dieselbe Datei anschließend bytegleich in den Root des
Consumer-Branches `main`. Der Build liefert den Lizenztext zusätzlich in allen tatsächlich
installierbaren beziehungsweise ausgelieferten Skill-Zielen für Claude, Codex und Portable aus;
`package.json` weist die Lizenz mit dem SPDX-Kurzbezeichner `MIT` aus.

Die Änderung ist ein Feature, weil sie die öffentlich ausgelieferten Repository- und
Distributionsartefakte um eine neue rechtliche Nutzungsgrundlage erweitert. Der standardisierte
Text und der SPDX-Kurzbezeichner folgen der von der Open Source Initiative veröffentlichten
[MIT-Lizenz](https://opensource.org/license/mit). Eine weitergehende rechtliche Bewertung oder
Änderung der Copyright-Inhaberschaft ist nicht Teil des Vorhabens.

Verifizierter Planungskontext vom 23.07.2026:

- Der aktualisierte Plan basiert auf dem Delivery-Checkout `b451d5b`, dem aktuellen
  `origin/develop` zum Planungszeitpunkt.
- Vor der Umsetzung existierte keine Root-Lizenzdatei; `package.json` enthielt kein
  `license`-Feld.
- `build.mjs` erzeugt atomar `dist/claude/effective-flow/`,
  `dist/codex/effective-flow/` und `dist/portable/effective-flow/`. Direkte Installationen
  verwenden die nativen Ziele, Manager und der Consumer-Branch das Portable-Ziel.
- `scripts/stage-delivery.mjs` ist der zentrale Eigentümer des `main`-Layouts.
- `.github/workflows/release.yml` archiviert den gesamten `dist/`-Baum und delegiert die
  `main`-Materialisierung an `scripts/stage-delivery.mjs`. Eine direkte Lizenzkopie im Workflow
  wäre architekturwidrig.
- `dist/` ist generiert und gitignoriert; es wird nicht direkt bearbeitet.

## Architekturentscheidungen

- **Eine kanonische Quelle auf `develop`.** Root-`LICENSE` enthält den vollständigen
  standardisierten MIT-Text mit der exakten Zeile
  `Copyright 2016 Sebastian Software GmbH`. Sämtliche Kopien entstehen bytegleich daraus.
- **Drei lizenzierte Build-Ziele.** Die gemeinsame Build-Schleife kopiert `LICENSE` in die
  Skill-Verzeichnisse für Claude, Codex und Portable. Ein Guard prüft alle drei Kopien vor dem
  atomaren Austausch von `dist/`.
- **Zentrale `main`-Materialisierung.** `scripts/stage-delivery.mjs` verwaltet Root-`LICENSE`,
  entfernt eine gegebenenfalls veraltete Zielkopie und kopiert die kanonische Datei nach
  `<delivery>/LICENSE`. Der vollständig kopierte Portable-Skill enthält zusätzlich
  `<delivery>/effective-flow/LICENSE`.
- **Keine parallele Workflow-Logik.** `.github/workflows/release.yml` bleibt funktional
  unverändert. Der Delivery-Kommentar beschreibt Root-`LICENSE` als Bestandteil des Payloads.
- **Explizite Distributionsverträge.** Offline-, Archiv- und Delivery-Smokes prüfen den
  kanonischen Lizenztext und seine Bytegleichheit. Vollständige Baumvergleiche sichern die Lizenz
  zusätzlich in direkten und managerbasierten Installationen ab.
- **Maschinenlesbare Metadaten ohne Lockfile-Änderung.** `package.json` enthält
  `"license": "MIT"`; `pnpm-lock.yaml` bleibt unverändert.

## Betroffene Dateien

| Datei                              | Tatsächliche Änderung                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `LICENSE`                          | Kanonischen MIT-Text mit dem vorgegebenen Copyright als getrackte Root-Datei hinzugefügt.                                             |
| `package.json`                     | SPDX-kompatibles Root-Feld `"license": "MIT"` ergänzt.                                                                                |
| `build.mjs`                        | Root-Lizenz in Claude-, Codex- und Portable-Skill kopiert und alle drei Zielkopien mit einem fail-closed Guard abgesichert.           |
| `scripts/stage-delivery.mjs`       | `LICENSE` als verwaltetes Root-Artefakt in das zentrale Delivery aufgenommen und bytegleich aus der kanonischen Datei materialisiert. |
| `scripts/distribution-smoke.mjs`   | Kanonischen Text, alle Build-Kopien, Archive, direkte Installationen und beide Delivery-Kopien geprüft.                               |
| `test/workflow-contracts.test.mjs` | Zentralen Staging-Vertrag sowie das Verbot einer direkten Lizenzkopie im Release-Workflow abgesichert.                                |
| `.github/workflows/release.yml`    | Ausschließlich den Delivery-Kommentar um Root-`LICENSE` ergänzt; keine funktionale Kopier- oder Paketierungslogik geändert.           |

`pnpm-lock.yaml`, `local-common.sh`, Installationsskripte und `src/` blieben unverändert.
`dist/` wurde ausschließlich über `node build.mjs` erzeugt. Der Produkt-Diff umfasst exakt die
sieben genannten Pfade; die Plan-Datei ist Abschlussdokumentation und zählt nicht zum
Produkt-Scope.

## Implementierungsdetails

### Vorgehen

1. Die sieben betroffenen Produktpfade wurden gegen `origin/develop` auf Basis `b451d5b`
   abgeglichen.
2. Root-`LICENSE` wurde mit dem vollständigen standardisierten MIT-Text und
   `Copyright 2016 Sebastian Software GmbH` angelegt.
3. `package.json` erhielt `"license": "MIT"` ohne Änderung an Version, Abhängigkeiten oder
   Lockfile.
4. `build.mjs` kopiert die erforderliche Root-Lizenz innerhalb der gemeinsamen
   Verbraucher-Schleife nach `dist/claude/effective-flow/LICENSE`,
   `dist/codex/effective-flow/LICENSE` und `dist/portable/effective-flow/LICENSE`. Ein
   Bytegleichheits-Guard läuft vor dem atomaren Swap.
5. `scripts/stage-delivery.mjs` entfernt eine vorhandene Root-`LICENSE` als verwaltetes Artefakt
   und kopiert die kanonische Datei nach `<work>/LICENSE`. Der vollständige Portable-Skill-Copy
   liefert `<work>/effective-flow/LICENSE`.
6. `scripts/distribution-smoke.mjs` prüft den exakten kanonischen MIT-Text, alle drei
   Build-Kopien, den Archivinhalt, direkte Installationen und beide Delivery-Kopien. Eine
   absichtlich veraltete Delivery-Lizenz wird im Offline-Smoke ersetzt.
7. `test/workflow-contracts.test.mjs` prüft die Reihenfolge des zentralen Stagings, den
   anschließenden Delivery-Smoke und das Fehlen direkter `cp`-, `install`- oder
   `rsync`-Lizenzlogik im Release-Workflow.
8. `.github/workflows/release.yml` benennt Root-`LICENSE` ausschließlich im vorhandenen
   Delivery-Kommentar; der funktionale Ablauf blieb unverändert.

### Randfälle

- Fehlt die kanonische Root-Lizenz oder weicht eine Build-Kopie ab, schlägt der Build vor dem
  atomaren Swap fehl.
- Eine veraltete `LICENSE` im vorhandenen `main`-Worktree wird durch den zentralen Stager ersetzt.
- Der Release-Workflow bleibt frei von paralleler Lizenzkopierlogik.
- Der englische Standardtext, der Copyright-Vermerk und `MIT` werden nicht durch deutsche
  Typografieregeln verändert.

## Akzeptanzkriterien

- [x] Root-`LICENSE` entspricht dem standardisierten MIT-Text und enthält genau
      `Copyright 2016 Sebastian Software GmbH`.
- [x] **Source-Branch `develop`:** Der lokale Implementierungs-PR-Vertrag enthält `LICENSE` als
      getrackte Root-Datei und ist vollständig validiert. Die Beobachtung auf
      `origin/develop:LICENSE` erfolgt erst nach dem Merge.
- [x] **Consumer-Branch `main`:** Der lokale Staging-Vertrag erzeugt Root-`LICENSE` bytegleich und
      ist vollständig validiert. Die Beobachtung auf `origin/main:LICENSE` erfolgt erst nach dem
      Release-/Delivery-Lauf.
- [x] `package.json` enthält genau `"license": "MIT"`; Version, Abhängigkeiten und
      `pnpm-lock.yaml` blieben unverändert.
- [x] `node build.mjs` erzeugt bytegleiche Lizenzkopien in Claude, Codex und Portable.
- [x] Der Offline-Smoke prüft alle drei Build-Ziele, ein daraus erzeugtes Archiv und einen
      gestagten Delivery-Baum; Archiv- und Delivery-Verträge sind validiert.
- [x] `scripts/stage-delivery.mjs` erzeugt bytegleich `<delivery>/LICENSE` und
      `<delivery>/effective-flow/LICENSE` und ersetzt eine vorhandene abweichende Root-Kopie.
- [x] `.github/workflows/release.yml` enthält keine direkte Lizenzkopierlogik und materialisiert
      `main` weiterhin ausschließlich über `scripts/stage-delivery.mjs`.
- [x] `pnpm agent:check`, `pnpm test`, `node build.mjs`, `pnpm test:distribution` und
      `git diff --check` sind erfolgreich.

## Validierungsplan

- `pnpm agent:check` – Format aller Änderungen prüfen.
- `pnpm test` – Unit- und Workflow-Contract-Tests ausführen.
- `node build.mjs` – atomaren Build und Lizenz-Guard für Claude, Codex und Portable ausführen.
- Drei Build-Vergleiche und zwei Delivery-Vergleiche – alle Kopien bytegleich nachweisen.
- `pnpm test:distribution` – Offline-Build, Archiv, Release-Installation und Delivery prüfen.
- SHA-256 über Root-, Build- und Delivery-Lizenzdateien – identischen Inhalt nachweisen.
- `git diff --check` und Scope-Vergleich – Whitespace und exakt sieben Produktpfade prüfen.
- Nach Merge beziehungsweise Delivery die Remote-Branch-Receipts für `develop` und `main`
  ergänzen.

## Annahmen und offene Punkte

- `2016` und `Sebastian Software GmbH` gelten gemäß Nutzeranforderung für Repository und
  Distributionen.
- Gemeint ist die OSI-Lizenz mit SPDX-Bezeichner `MIT`, nicht eine verwandte Variante wie
  `MIT-0`.
- Die Remote-Beobachtung auf `develop` und `main` ist ein Delivery-Receipt, keine offene
  Implementierungsentscheidung.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       0 |
| Sicherheit  |        0 |       0 |       0 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       0 |       0 |
| Testbarkeit |        0 |       0 |       0 |
| Scope       |        0 |       0 |       0 |
| Wartbarkeit |        0 |       0 |       0 |

### Befunde

- Keine Planbefunde.

## Testergebnisse

**Validierungsdatum:** 2026-07-23

| Prüfung                      | Ergebnis                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm agent:check`           | Erfolgreich, finaler Lauf ohne Warnung.                                                 |
| `pnpm test`                  | Erfolgreich: 335 von 335 Tests bestanden.                                               |
| `node build.mjs`             | Erfolgreich; Claude, Codex und Portable erzeugt.                                        |
| `pnpm test:distribution`     | Erfolgreich; Offline-, Archiv-, Installations- und Delivery-Verträge bestanden.         |
| Drei Build-`cmp`             | Erfolgreich für Claude, Codex und Portable.                                             |
| Zwei Delivery-`cmp`          | Erfolgreich für Root- und Portable-Lizenz.                                              |
| SHA-256, sechs Lizenzdateien | Alle sechs Dateien: `287fed902e90c9cd640b2c3fbc402649f822f8288a512370976b695e34e91413`. |
| `git diff --check`           | Erfolgreich, keine Whitespace-Fehler.                                                   |
| Produkt-Scope                | Exakt sieben Pfade.                                                                     |

Ein einmaliger pnpm-Sandbox-Zwischenfall war ein behobenes Umgebungsereignis und keine
Produktabweichung. Der finale Lauf war erfolgreich und ohne Warnung.

### Validierungs-Receipt

- **Basis:** `b451d5b`
- **Produktpfade:** 7
- **Lizenzdateien:** 6, bytegleich
- **SHA-256:** `287fed902e90c9cd640b2c3fbc402649f822f8288a512370976b695e34e91413`
- **Lokaler PR-/Staging-Vertrag:** vollständig validiert
- **Remote `develop`/`main`:** nach Merge beziehungsweise Delivery beobachtbar

## Review-Befunde

**Datum:** 2026-07-23
**Reviewer:** `effective-flow-code-validator`
**Externer Bericht:** `.effective-flow/review/review-report-2026-07-23-plan-mit-lizenz-hinzufuegen.md`

| Ergebnis                | Anzahl |
| ----------------------- | -----: |
| Behoben                 |      0 |
| Offen / nicht umgesetzt |      2 |

Die zwei offenen Befunde bleiben im externen Bericht und werden hier nicht im Volltext
dupliziert.

## Offene Punkte

- Keine offenen Punkte.
