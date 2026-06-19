# 0043: Eindeutige Plan-Nummern garantieren

**Planungsstatus:** Umgesetzt
**Quelle:** /build
**Empfohlener Workflow:** Feature (`/build`)

## Anforderung

Neue Plan-Dateien in `docs/plan/` sollen immer eine einmalige vierstellige Nummer
bekommen. Bisher berechnet jeder Skill die nächste Nummer unabhängig als
„höchste vorhandene + 1". Werden mehrere Pläne parallel entwickelt (z. B. auf
getrennten Git-Branches oder in derselben Arbeitskopie kurz nacheinander),
wählen beide dieselbe Nummer und kollidieren. Im Repo existiert bereits eine
solche Dublette mit der Nummer `0031`.

Rahmenbedingungen aus der Abstimmung:

- **Keine Lücken:** Die Nummernfolge bleibt lückenlos (`0001`, `0002`, …).
- **Frühe Reservierung:** Die Nummer wird ganz am Anfang der Planung gewählt und
  sofort durch eine temporäre Plan-Datei belegt, damit eine parallele Planung in
  derselben Arbeitskopie nicht dieselbe Nummer zieht – auch wenn eine Kollision
  später ohnehin aufgelöst würde.
- **Planungsreihenfolge:** Pläne bleiben möglichst in der Reihenfolge ihres
  Planungsstarts. Das ist besonders wichtig für bereits umgesetzte Pläne, deren
  Nummer als stabile Referenz dient.

Begründung der Workflow-Empfehlung: Es entsteht eine neue, bisher nicht
vorhandene Konvention samt Reservierungs- und Auflösungsmechanismus (neue
Funktionalität im Plugin-Verhalten) → Feature.

## Architekturentscheidungen

- **Max+1 bleibt der Default:** Bei der Erstellung wird weiterhin die höchste
  vorhandene vierstellige Nummer + 1 vergeben. Neue Pläne sind die jüngsten und
  landen damit automatisch am Ende der Folge – konsistent mit der
  Planungsreihenfolge. Das vierstellige `NNNN-`Schema bleibt unverändert.
- **Frühe Nummern-Reservierung:** Bereits zu Beginn der Planung (vor der
  Klärungsphase) wird die Nummer bestimmt und eine temporäre Plan-Datei
  `docs/plan/NNNN-<slug>.md` mit minimalem Kopf (H1 + Statusmarker
  „Nicht umgesetzt") geschrieben. Eine parallele Planung in derselben
  Arbeitskopie sieht die Nummer dann als belegt und wählt `NNNN+1`. Die Datei
  wird im Verlauf der Planung mit dem vollständigen Inhalt gefüllt.
- **Eindeutigkeits-Invariante, lückenlos:** Jede vierstellige Nummer ist genau
  einmal vergeben und die Folge bleibt lückenlos.
- **Kollisionsauflösung in Planungsreihenfolge:** Entdeckt ein Skill beim Scannen
  von `docs/plan/` eine doppelt vergebene Nummer (typischer Fall nach dem Merge
  paralleler Branches), wird die Folge so umnummeriert, dass sie wieder
  eindeutig, lückenlos und in Planungsstart-Reihenfolge ist. Die Datei mit
  früherem Planungsstart behält ihren Platz; die später geplante Datei wird an
  ihrer chronologisch korrekten Position eingefügt, nachfolgende Nummern rücken
  um eins auf. Da Kollisionen über isolierte Branches nicht zur Erstellzeit
  verhindert werden können, ist diese Auflösung beim nächsten Scan der
  verlässliche Garant für Eindeutigkeit.
- **Zentrale Regel als Shared-Include:** Die Nummernvergabe (Reservierung,
  Max+1, Eindeutigkeit, lückenlose Planungsreihenfolge, Auflösung) wird in einer
  neuen Datei `skills/_shared/plan-numbering.md` einmal definiert und per
  `{{INCLUDE:plan-numbering}}` in `sf-plan` und `sf-build` eingebunden (DRY,
  analog zu Plan 0039).
- **Bestandsbereinigung der `0031`-Dublette nach Planungsreihenfolge:** Beide
  `0031`-Pläne sind umgesetzt. Maßgeblich ist der Planungsstart (Datei-Anlage):
  - `0031-plan-review-step.md` (2026-05-14) behält `0031`.
  - `0031-doc-category-directories.md` (2026-06-15 15:53) gehört chronologisch
    zwischen `0039` (2026-05-22) und das alte `0040` (2026-06-15 23:28) → wird
    `0040`.
  - altes `0040-multilingual-plan-status-marker.md` → `0041`.
  - altes `0041-plan-status-marker-language-detection.md` → `0042`.
  - `0032`…`0039` bleiben unverändert. Nur drei Dateien ändern sich.

## Betroffene Dateien

| Datei | Beschreibung |
|---|---|
| `skills/_shared/plan-numbering.md` | **Neu.** Zentrale Regel: frühe Reservierung, Max+1, Eindeutigkeit, lückenlose Planungsreihenfolge, Kollisionsauflösung. |
| `skills/sf-plan/SKILL.md` | Phase 1 um frühe Reservierung ergänzen; Zeile 77 (Plan-Erstellung) auf zentrale Regel umstellen; `{{INCLUDE:plan-numbering}}` einbinden. |
| `skills/sf-build/SKILL.md` | Zeile 96 und 316 (Abschluss-Nummernvergabe) auf zentrale Regel umstellen; `{{INCLUDE:plan-numbering}}` einbinden. |
| `skills/sf-open-plans/SKILL.md` | Optionaler Hinweis: doppelte Nummern beim Auflisten melden. |
| `README.md` | NNNN-Schema-Abschnitt um Eindeutigkeits- und Lückenfreiheitszusage ergänzen. |
| `docs/plan/0031-doc-category-directories.md` → `0040-doc-category-directories.md` | Umbenennen + H1 anpassen (war Dublette). |
| `docs/plan/0040-multilingual-plan-status-marker.md` → `0041-…` | Umbenennen + H1 anpassen. |
| `docs/plan/0041-plan-status-marker-language-detection.md` → `0042-…` | Umbenennen + H1 anpassen. |
| `dist/**`, `sf-frontend-workflows/**` | Generierte Artefakte: nach Änderung der Skills via `build.mjs` neu erzeugen. |

## Implementierungsdetails

### Vorgehen

1. `skills/_shared/plan-numbering.md` erstellen (H2-Überschrift
   „Plan-Nummern-Konvention", wie andere Shared-Includes).
2. In `sf-plan` `{{INCLUDE:plan-numbering}}` einbinden, die frühe Reservierung in
   Phase 1 verankern und Zeile 77 durch einen Verweis auf die zentrale Regel
   ersetzen.
3. In `sf-build` `{{INCLUDE:plan-numbering}}` einbinden und Zeile 96/316 auf die
   zentrale Regel umstellen.
4. `sf-open-plans` um einen optionalen Duplikat-Hinweis ergänzen.
5. `README.md` aktualisieren.
6. Bestandsbereinigung der `0031`-Dublette per `git mv` (Historie erhalten),
   absteigend ausgeführt, um Zwischen­kollisionen zu vermeiden:
   `0041`→`0042`, `0040`→`0041`, `0031-doc-category-directories`→`0040`; jeweils
   H1 `# NNNN: …` anpassen.
7. `build.mjs` ausführen, damit `dist/` und `sf-frontend-workflows/` konsistent
   sind.

### Regelinhalt `plan-numbering.md`

- **Reservierung (zu Planungsbeginn):** `docs/plan/` nach Muster
  `^(\d{4})-.*\.md$` scannen, höchste Nummer ermitteln, neue Nummer = höchste + 1
  (vierstellig nullgepolstert; existiert keine, `0001`). Sofort eine temporäre
  Plan-Datei mit dieser Nummer und minimalem Kopf schreiben, um die Nummer zu
  belegen.
- **Eindeutig & lückenlos, Stabilität vor Lückenfreiheit:** Jede Nummer höchstens
  einmal; die Folge bleibt im Normalbetrieb ohne Lücken. Die Nummer eines bereits
  umgesetzten Plans wird nicht verändert; routinemäßige Läufe nummerieren nicht
  selbsttätig um. Eine Lücke wird nur durch Aufrücken noch nicht umgesetzter Pläne
  geschlossen.
- **Kollisionsauflösung:** Tragen mehrere Dateien dieselbe Nummer, wird nach
  Planungsstart (erster einführender Commit via
  `git log --diff-filter=A --follow --format=%aI`; bei Gleichstand lexikografisch
  kleinerer Dateiname) sortiert und die Folge lückenlos in dieser Reihenfolge neu
  durchnummeriert. Beim Umnummerieren: Datei umbenennen (`git mv`), H1
  `# NNNN: …` anpassen, Referenzen mitziehen. Umgesetzte Pläne möglichst wenig
  verschieben. Nur-lesende Skills melden Dubletten; die Auflösung übernehmen
  schreibende Workflows.

### Edge Cases

- Keine Plan-Dateien vorhanden → erste Nummer `0001`.
- Lücken sind nicht erlaubt; entsteht (z. B. durch Löschen) eine Lücke, wird sie
  beim nächsten Scan durch Aufrücken geschlossen.
- Branch-übergreifende Kollision wird erst nach dem Merge sichtbar → Auflösung
  beim nächsten Skill-Lauf, der `docs/plan/` scannt.
- Bricht die Planung nach der Reservierung ab, bleibt eine temporäre Datei mit
  Status „Nicht umgesetzt" zurück; sie ist ein regulärer offener Plan und nimmt
  ihre Nummer dauerhaft ein (keine Lücke).
- ADR-Nummerierung (`sf-apply-review`) ist nicht betroffen (separates Schema).

## Akzeptanzkriterien

- [ ] `skills/_shared/plan-numbering.md` existiert und definiert frühe
  Reservierung, Max+1, Eindeutigkeit, Lückenfreiheit und Auflösung in
  Planungsreihenfolge.
- [ ] `sf-plan` reserviert die Nummer zu Planungsbeginn und verweist auf die
  zentrale Regel; `sf-build` verweist ebenfalls darauf.
- [ ] In `docs/plan/` trägt jede vierstellige Nummer genau eine Datei; die Folge
  `0001`…`0043` ist lückenlos und in Planungsreihenfolge.
- [ ] `0031-doc-category-directories` ist `0040`, altes `0040`/`0041` sind
  `0041`/`0042`; `0031`–`0039` unverändert.
- [ ] Jede umbenannte Datei hat eine zur neuen Nummer passende H1.
- [ ] `dist/` und `sf-frontend-workflows/` sind neu gebaut und enthalten den
  neuen Include.

## Validierungsplan

- `sf-code-validator` über die geänderten Dateien.
- Verifikation: keine doppelten vierstelligen Prefixe und keine Lücken in
  `docs/plan/`.
- Verifikation: jede umbenannte Datei hat H1 == Dateinummer.
- `build.mjs` läuft fehlerfrei; generierte Ausgaben enthalten den Include-Inhalt.

## Annahmen und offene Punkte

- Annahme: Keine externen Cross-Referenzen auf die Plan-Nummern `0040`–`0041`
  außerhalb der Plan-Dateien (per Repo-weitem Grep bestätigt).
- Annahme: Markersprache des neuen Plans ist Deutsch (Mehrheit der Pläne).
- Hinweis: Die frühe Reservierung verhindert Kollisionen nur innerhalb derselben
  Arbeitskopie; branch-übergreifend bleibt die Auflösung beim Merge der
  Garant.
- Bewusst ausgeklammert: Vereinheitlichung der ADR-Nummernvergabe (gleiches
  Kollisionsmuster, aber nicht Teil dieser Anforderung).

## Testergebnisse

- `node build.mjs` läuft fehlerfrei (11 Skills, 9 Agents); der neue Include
  `{{INCLUDE:plan-numbering}}` ist in den generierten Ausgaben für `sf-plan` und
  `sf-build` eingebettet, keine unaufgelösten `{{INCLUDE:…}}`-Platzhalter.
- `docs/plan/` enthält keine doppelten vierstelligen Prefixe und keine Lücken
  (höchste Nummer `0043`); jede umbenannte Datei hat eine zur Dateinummer
  passende H1.
- `sf-plan` Phase 1 ist korrekt von 1 bis 7 nummeriert.
- Kein automatisiertes Test-Framework im Repo (kein `package.json`); die
  Verifikation erfolgt über Build- und Integritätschecks.

## Review-Findings

**Datum:** 2026-06-19
**Reviewer:** sf-nodejs-reviewer

### Zusammenfassung

| Status | Anzahl |
|---|---:|
| Behoben | 9 |
| Offen / Nicht umgesetzt | 0 |

Alle Findings (1× Kritisch, 3× Wichtig, 5× Hinweis) wurden im Workflow behoben;
eine Bestätigungs-Review hat die Auflösung verifiziert. Keine offenen Findings,
daher kein externer Review-Report und keine ADRs.
