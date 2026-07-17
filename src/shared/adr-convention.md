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

### Abweichung vom `decision-records`-Skill

Der Host-Skill `decision-records` definiert ADRs als _immutabel-nach-accepted_,
_nummeriert_, _eine-Entscheidung-pro-Record_ und _nur Rationale, keine Config-Werte_. Effective Flow
weicht hier **bewusst** ab; diese Konvention hat für Effective Flow-erzeugte ADRs Vorrang. Begründung
je Divergenzpunkt:

- **Mutabilität (lebend statt Supersede-Kette).** Effective Flow optimiert auf kleinen, eindeutigen
  LLM-Lesekontext. „Die aktuelle Datei = die Wahrheit“ ist ein trivialer Read; eine
  Supersede-Historie zwänge jeden Leser, erst den gültigen Record aus einer Kette zu
  ermitteln — genau der Kontext-Overhead, den Effective Flow vermeidet.
- **Config-Werte in der ADR.** Für den eng umrissenen Fall „Projektsetup“ ist die Kolokation
  von Wert und Kurzbegründung in **einer** getrackten, menschenlesbaren Quelle gewollt — nur
  so kann `.effective-flow/` komplett gitignored werden.
- **Nummernlos/Slug und ein Bündel-Record.** Slug-Referenzen sind stabil; die
  Locator-Auffindbarkeit (ein Marker → eine Datei) und der kleine Kontext wiegen hier
  schwerer als „eine Entscheidung pro Record“.

**Koexistenz.** Wo ein Projekt lieber das klassische `decision-records`-Modell fährt, kann es
den Skill für Effective Flow-Agents und -Tools gezielt über die `skills`-Config (`include`/`exclude`,
auch per-Agent/-Tool) zu- oder abschalten. Effective Flows eigene ADR-Konvention bleibt davon
unberührt.
