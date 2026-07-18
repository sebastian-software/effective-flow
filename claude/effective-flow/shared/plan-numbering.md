## Plan-Datei-Konvention (Naming, Migration, Archiv)

Das Plan-Verzeichnis ist über die Effective Flow-Konfiguration (Projektsetup-ADR) `plan.dir` konfigurierbar (Default
`docs/plan`). Im Folgenden steht `<plan.dir>` für dieses Verzeichnis, `<plan.dir>/archive`
für sein Archiv.

Plan-Dateien liegen unter `<plan.dir>/`. Der Dateiname trägt ein **ISO-Datums-Präfix**
statt einer durchlaufenden Nummer. Dadurch entfällt jede Nummern-Reservierung und
Kollisionsauflösung: Ein Plan wird schlicht beim Befüllen unter seinem endgültigen Namen
geschrieben.

### Neuer Plan: Datum + Slug

- Dateiname: `<plan.dir>/YYYY-MM-DD-<slug>.md`. `YYYY-MM-DD` ist das Erstellungsdatum
  (ISO, z. B. aus `date +%F`). `<slug>` ist ein Kebab-Case-Slug aus dem Titel (nur `a–z`,
  `0–9`, Bindestrich).
- **Keine Vorab-Reservierung, kein Stub, keine Nummer.** Die Datei entsteht erst, wenn der
  Plan tatsächlich geschrieben wird. Es gibt keinen Reservierungs-Zeitstempel, keinen
  Read-back und keine Umnummerierung.
- **Namenskollision am selben Tag:** Existiert der Name bereits, hänge ein numerisches
  Suffix an (`YYYY-MM-DD-<slug>-2.md`, `-3`, …). Kein stilles Überschreiben.
- Die H1 des Plans ist der Titel ohne Nummer: `# <Titel>`.

### Migration alter Pläne (NNNN → Datum)

Frühere Pläne trugen einen vierstelligen Nummern-Prefix (`NNNN-slug.md`, z. B.
`0030-feature-name.md`). Diese werden **einmalig** auf das Datums-Schema umgestellt:

- Zielname: `YYYY-MM-DD-NNNN-slug.md`, wobei `YYYY-MM-DD` das **Umstellungsdatum** ist und
  die alte `NNNN` als stabile Referenz erhalten bleibt. Die H1 (`# NNNN: Titel`) bleibt
  **unverändert** – die Nummer bleibt dort als Referenzanker.
- Umbenennung im Git-Repo mit `git mv`, um die Historie zu erhalten.
- **Bulk-Durchlauf** über das gesamte Plan-Verzeichnis. Format-Check pro Datei: Ein Name,
  der mit vier Ziffern und Bindestrich beginnt (`^\d{4}-`), aber **nicht** bereits ein
  Datums-Präfix trägt (`^\d{4}-\d{2}-\d{2}-`), ist Altformat und wird migriert. Bereits
  migrierte Dateien werden übersprungen (idempotent).
- **Auslöser:** (a) beim Erstellen eines neuen Plans und (b) beim Einlesen eines Plans,
  wenn dabei ein Altformat entdeckt wird. **Nicht** bei jedem Effective Flow-Aufruf – nur bei
  Plan-Erstellung oder Plan-Einlesen, um keine Zeit zu verlieren.

### Archiv umgesetzter Pläne

`<plan.dir>/` enthält nur **offene** oder **in Umsetzung** befindliche Pläne. Ein
vollständig umgesetzter Plan wird nach `<plan.dir>/archive/` verschoben; der
Umgesetzt-Marker bleibt in der Datei erhalten.

- Der Verschiebe-Zeitpunkt ist an das **Delivery-Event** gekoppelt (PR geöffnet bzw.
  Worktree-Branch gemergt): Der umsetzende Workflow setzt den Statusmarker auf
  `Umgesetzt`/`Implemented` und verschiebt die Datei per `git mv` nach `<plan.dir>/archive/`
  (Verzeichnis bei Bedarf anlegen), noch im Liefer-Branch, sodass die Verschiebung Teil
  desselben PRs/Merges ist (Umsetzungs-Doku). Details siehe „Delivery- und
  Worktree-Integration“.
- `/effective-flow open-plans` listet nur die oberste Ebene von `<plan.dir>/`, nicht das Archiv.
- Auflöser (siehe unten) suchen in `<plan.dir>/` **und** `<plan.dir>/archive/`.

### Plan-Referenz auflösen

Eine Plan-Referenz kann sein: vollständiger Pfad, Dateiname, Legacy-Nummer oder
Titel-Slug. Suche in `<plan.dir>/` **und** `<plan.dir>/archive/`.

- **Legacy-Nummer eindeutig auflösen:** Eine vierstellige Nummer `NNNN` wird **primär über
  die H1** `# NNNN: …` aufgelöst, nicht über das Dateinamen-Segment. Grund: Ein neuer Plan
  mit einem Slug, der mit vier Ziffern beginnt (Titel „2024 Retrospektive“ →
  `YYYY-MM-DD-2024-retrospektive.md`), ist vom migrierten Legacy-Muster
  `YYYY-MM-DD-NNNN-slug.md` am Dateinamen nicht unterscheidbar. Nur migrierte Altpläne
  tragen eine `# NNNN:`-H1; neue Pläne haben `# <Titel>` ohne Nummer. Die H1 ist damit der
  sichere Diskriminator; das Dateinamen-Segment ist nur sekundäres Signal, wenn die H1
  fehlt.
- **Slug** ist der stabile Anker für neue Pläne (die keine Nummer tragen).
- Passt mehr als eine Datei, frage nach; wähle nie heuristisch die „neueste“.
