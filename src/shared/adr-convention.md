## Lebendes ADR-Modell

Effective Flow führt Architekturentscheidungen (ADRs) als **lebende Dokumente**: mutable
Markdown-Dateien, die stets den aktuell gültigen Stand einer Entscheidung tragen. Es gibt
keine Nummerierung und keine Supersede-Kette; die aktuelle Datei ist die Wahrheit. Dieser
Baustein ist die maßgebliche Konvention für alle **von Effective Flow erzeugten** ADRs.

### Form und Ort

- **Ort:** ADRs liegen im erkannten ADR-Verzeichnis des Projekts, Default `docs/adr/`.
- **Dateiname:** nummernlos, kebab-case-Slug — `docs/adr/<slug>.md` (z. B.
  `docs/adr/effective-flow-project-setup.md`).
- **Titel:** eine H1 mit dem sprechenden Titel — `# <Titel>` (kein `NNNN`-Präfix).
- **Status:** ein `## Status`-Abschnitt hält den aktuellen Zustand. Kanonische Werte:
  `Aktiv`, `Abgelöst`, `Nicht umgesetzt`.
- **Mutabilität:** eine bestehende ADR wird bei Änderung der Entscheidung **in-place**
  aktualisiert (Inhalt und `## Status`), nicht dupliziert oder per Nachfolge-Record ersetzt.
- **Nebenläufigkeit:** die Datei direkt vor dem Schreiben frisch einlesen.

### Referenzierung

Referenzen auf ADRs erfolgen über **Slug oder Titel**, nicht über eine Nummer, z. B.
`(ADR: <slug>)`. Slug-Referenzen bleiben über Inhaltsänderungen hinweg stabil.

### Rückwärts-Lese-Kompatibilität für nummerierte Alt-ADRs

Vorhandene nummerierte Alt-ADRs (`NNNN-*.md`, H1 `# NNNN — Titel`) bleiben **lesbar und per
Nummer auflösbar**. Es gibt **keine** verpflichtende Bulk-Umbenennung; Alt-ADRs werden nicht
angetastet. Neue ADRs entstehen ausschließlich im lebenden Slug-Format. Das spiegelt Effective Flows
etablierte Kompatibilitätslinie (Plan-Nummern per H1, `firmo-`/`effective-flow-`-Labels).

### Verhältnis zum `decision-records`-Skill (deklarierte Konvention + Fallback)

Das oben beschriebene lebende Slug-Modell ist die **deklarierte ADR-Konvention dieses
Repos**. Der Host-Skill `decision-records` ist der Domänen-Owner für die ADR-Craft (ob eine
Entscheidung überhaupt ADR-würdig ist, Lifecycle, Supersession, Index); seine erste
Operating-Regel ist, **die vorhandene Repo-Konvention zu entdecken und ihr zu folgen**, statt
eine eigene zu erzwingen. Genau dieser Baustein ist diese Konvention — der Skill autort
Effective-Flow-ADRs also im lebenden Slug-Format (Ort/Dateiname/Titel/Status/Mutabilität wie
oben), nicht in einem immutabel-nummerierten.

Damit gilt der geschichtete Vertrag (siehe `skill-discovery.md`):

- **`decision-records` maßgeblich, wenn vorhanden.** Der Skill entscheidet, **ob** ein Finding
  eine dauerhafte Entscheidung ist, und autort — falls ja — nach der hier deklarierten
  Konvention. Deklariert das Zielrepo eine **eigene** ADR-Konvention (anderes Verzeichnis,
  Titel-/Status-Format, Index), folgt der Skill dieser; das lebende Slug-Modell ist nur der
  Default, wenn das Repo nichts anderes deklariert.
- **Minimaler Fallback, wenn der Skill fehlt.** Ist `decision-records` nicht verfügbar (nicht
  installiert, `skills.enabled: false` oder via `exclude` deaktiviert), autort das
  aufrufende Tool selbst nach der **minimalen Fallback-Struktur** unten — **kein** stilles
  Erfinden einer zweiten Konvention.

Frühere Fassungen dieses Bausteins beschrieben das Slug-Modell als **bewusste Abweichung**
gegenüber einem angeblich immutabel/nummerierten `decision-records`-Skill. Diese Prämisse ist
überholt: `decision-records` unterstützt inzwischen ein deklariert-lebendes/mutables Modell
(opt-in) und folgt ohnehin der Repo-Konvention. Das lebende Slug-Modell ist deshalb keine
Divergenz mehr, sondern die vom Skill befolgte deklarierte Konvention.

**Koexistenz.** Wo ein Projekt lieber ein anderes ADR-Modell fährt, deklariert es dessen
Konvention im Zielrepo (der Skill folgt ihr) oder schaltet `decision-records` gezielt über die
`skills`-Config (`include`/`exclude`, auch per-Agent/-Tool) zu oder ab.

### Minimale Fallback-Struktur (nur ohne `decision-records`)

Kurze Kern-Struktur, damit ein aufrufendes Tool eine abgelehnte Entscheidung auch ohne den
Skill als lebende Slug-ADR festhalten kann — **kein** zweites vollständiges ADR-Handbuch. Ort
und Form wie unter „Form und Ort“; die Datei vor dem Schreiben frisch einlesen und eine
thematisch passende bestehende ADR in-place aktualisieren statt zu duplizieren:

```markdown
# [Titel der Entscheidung]

## Status

Nicht umgesetzt

## Kontext

[Herkunft: Review-Report + Finding-ID, bzw. Issue-/Epic-Nummer im Remote-Modus]

## Entscheidung

[Kurzbegründung, warum nicht umgesetzt wird]

## Begründung

[Vollständige Entwickler-Anmerkung bzw. `wontfix`-Begründung]

## Quell-Finding

[Finding-ID] aus [Quelle]: [Kurzfassung des Problems]  <!-- nachverfolgbarer Backlink -->
```

Nur **dauerhafte** Entscheidungen werden so festgehalten; eine reine Delivery-Ablehnung ohne
dauerhafte Architektur-Wirkung bleibt im Review-Report bzw. Tracker-Artefakt und wird nicht in
eine ADR gezwungen.
