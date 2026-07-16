# 0070: Firmo-Toolset-Vereinfachung

**Planungsstatus:** Umgesetzt
**Quelle:** /firmo plan
**Empfohlener Workflow:** Feature (`/firmo build`)

## Anforderung

Das Firmo-Toolset soll rund um sechs Grundideen vereinfacht und vereinheitlicht
werden. Kern ist, verstreute, teils redundante Mechanismen (Plan-Nummern-Reservierung,
getrennte `delivery`-/`worktree`-Schalter, uneinheitliche Datenhaltung) durch ein
einfacheres, konsistentes Modell zu ersetzen, ohne die spezialisierten
Umsetzungs-Skills (build/fix/refactor/docs) inhaltlich anzutasten.

Die sechs Aspekte:

1. **Git-Grundannahme.** Ein Repo wird immer via Git verwaltet und kann – muss aber
   nicht – einen Remote haben. Rein lokale Repos ohne Remote sind ein voll
   unterstützter Normalfall.
2. **Datenhaltung.** Zwei Modi. **Lokal:** Pläne, Reviews und Investigationen liegen
   im Repo; nur **Pläne** werden committet, Reviews und Investigationen bleiben lokal
   und ungetrackt. **Remote:** Issues der jeweiligen Systeme (GitHub via `gh`,
   Forgejo/Gitea via `tea`) werden genutzt.
3. **Worktree als Default.** Alle code-ändernden Umsetzungen laufen standardmäßig in
   einem eigenen Git-Worktree mit eigenem Branch, solange nicht explizit anders
   gewünscht.
4. **Zwei Einbring-Wege.** Merge des Worktree-Branches in den Zielbranch (Default,
   Zielbranch per Config) **oder** Pull-Request via GitHub/Forgejo.
5. **Pläne immer ins Repo.** Egal ob lokal oder remote gearbeitet wird, Pläne werden
   immer als Datei ins Repo geschrieben; Default `docs/plan/…`, per Config anderer
   Repo-Pfad möglich.
6. **`apply` als zentrales Umsetzungs-Tor.** `apply` nimmt wie bisher beliebige
   Planquellen (Pläne, Issues, Findings) über das bestehende Routing entgegen, bewertet
   aber zusätzlich, ob eine Grundlage **vollständig geklärt** und ohne Rückfrage
   umsetzbar ist. Ist sie das, wird die Umsetzung bevorzugt **goal-getrieben (autonom)**
   angestoßen; ist sie es nicht, geht die Grundlage in eine erneute Klärungsrunde.

Zusätzlich: **Plan-Dateinamen** tragen künftig ein ISO-Datums-Präfix statt einer
durchlaufenden Nummer, wodurch der komplexe Nummern-Reservierungs- und
Kollisionsmechanismus entfällt. Vollständig umgesetzte Pläne wandern nach
`docs/plan/archive/…`; der Umgesetzt-Marker bleibt in der Datei erhalten.

Begründung der Workflow-Empfehlung: Es handelt sich nicht um reines Refactoring – es
werden **beabsichtigte Verhaltensänderungen** eingeführt (Worktree-Default an,
Merge-Default, Datums-Naming, Archiv, Klärungs-Gate in `apply`). Damit ist `build`
der passende Umsetzungs-Workflow. Der Umfang ist groß; die Umsetzung sollte entlang
der unten nummerierten Workstreams schrittweise (je eigener Commit/PR) erfolgen.

## Architekturentscheidungen

- **Datums-Slug statt Nummern-Reservierung (Aspekt: Naming).** Neue Pläne heißen
  `YYYY-MM-DD-<slug>.md` ohne Nummer. Eindeutigkeit läuft allein über den Slug; bei
  Namenskollision am selben Tag wird ein numerisches Suffix `-2`, `-3`, … angehängt.
  Damit entfällt die gesamte Reservierungs-/Read-back-/Kollisionsauflösungs-Maschinerie
  aus `plan-numbering.md`. Bewusst in Kauf genommen: Mehrere Pläne desselben Tages sind
  nur alphabetisch, nicht sekundengenau chronologisch geordnet – ausreichend, da das
  Datum die grobe Ordnung liefert und der Slug den Inhalt.
- **Migration mit Datum + erhaltener Altnummer (Aspekt: Naming).** Bestehende
  `NNNN-slug.md` werden zu `YYYY-MM-DD-NNNN-slug.md`, wobei `YYYY-MM-DD` das
  Umstellungsdatum ist und `NNNN` als stabile Alt-Referenz erhalten bleibt. Migration
  ist ein **Bulk-Durchlauf** über das gesamte Plan-Verzeichnis, ausgelöst (a) beim
  Erstellen eines neuen Plans und (b) beim Einlesen eines Plans, wenn dabei ein
  Altformat entdeckt wird – **nicht** bei jedem Firmo-Aufruf. Der Format-Check
  (`^\d{4}-\d{2}-\d{2}-` = bereits migriert) macht die Migration idempotent.
- **Archiv für umgesetzte Pläne (Aspekt: Naming/Datenhaltung).** `docs/plan/` enthält
  nur offene oder in Umsetzung befindliche Pläne. Auflöser suchen in `<plan.dir>` **und**
  `<plan.dir>/archive`, `open-plans` listet nur die oberste Ebene. Der Marker bleibt bei
  der Verschiebung erhalten.
- **„Umgesetzt" = Delivery-Event; der Plan ist Umsetzungs-Doku im PR (Aspekt:
  Einbringen).** Ein Plan gilt genau dann als umgesetzt, wenn seine Umsetzung eingebracht
  wird – d. h. der PR **geöffnet** wird bzw. der Worktree-Branch in den Zielbranch
  **gemergt** wird. Zu diesem Zeitpunkt (noch im Liefer-Branch, **vor** PR-Erstellung/Merge)
  setzt der Workflow den Statusmarker auf `Umgesetzt`/`Implemented` und verschiebt die
  Plan-Datei per `git mv` nach `<plan.dir>/archive/…`. Diese Bewegung wird
  **mitcommittet**, sodass der archivierte, als umgesetzt markierte Plan als Dokumentation
  der Umsetzung Teil desselben PRs/Merges ist. Für die PR-Strategie bedeutet das: der Plan
  wird bereits mit dem Öffnen des PRs als umgesetzt geführt (optimistisch, unabhängig vom
  späteren Merge-Zeitpunkt des PRs).
- **Offene Pläne jederzeit einbringbar (Aspekt: Einbringen).** Die Plan-Datei selbst ist
  das einzige committete Datenartefakt und kann – auch **ohne** Umsetzung, im Status
  `Nicht umgesetzt` – jederzeit über einen der beiden Wege (PR oder Merge, je nach
  gewählter Strategie) in den Zielbranch eingebracht werden. Es gibt damit zwei getrennte
  Delivery-Momente: (1) der offene Plan → in den Zielbranch, jederzeit; (2) die Umsetzung
  samt archiviertem, umgesetzt-markiertem Plan → in den Zielbranch (= das „Umgesetzt"-Event
  oben).
- **Worktree impliziert Delivery (Aspekt: Worktree/Einbringen).** Der bisher separate
  Schalter `delivery.enabled` wird als Gate entwertet: Sobald in einem Worktree/eigenen
  Branch gearbeitet wird (Default), ist Delivery aktiv und schließt per `merge` (Default)
  oder `pr` ab. Opt-out ist In-Place-Arbeit ohne Worktree. `delivery.enabled` wird von der
  Config-Vollmigration aus der Datei **entfernt**; ein noch nicht migrierter Altbestand wird
  bis zur Migration beim Lesen toleriert (Wert ignoriert, kein Gate mehr). Nach der Migration
  existiert der Schlüssel nicht mehr.
- **Konfigurierbarer Plan-Pfad (Aspekt: Pläne ins Repo).** Neuer Config-Schlüssel
  `plan.dir` (Default `docs/plan`). Alle hartcodierten `docs/plan/`-Vorkommen lesen
  künftig `plan.dir`; das Archiv ist `<plan.dir>/archive`.
- **Klärungs-Gate als geteilter Baustein (Aspekt: apply).** Die Bewertung „vollständig
  geklärt?“ wird als neuer Shared-Baustein `apply-clarity-gate.md` gekapselt und
  **sowohl** in der Apply-Kette (`apply` → `apply-plan`/`apply-issues`/`apply-review`)
  **als auch** bei Direktaufrufen von `build`/`fix`/`refactor`/`docs` mit einer Plan-Datei
  angewandt (Entscheidung: „apply + Direktaufrufe"). Damit greift das Gate unabhängig vom
  Einstiegspunkt, ohne Logik zu duplizieren. Keine Annahmen außer absolut
  offensichtlichen; im Zweifel eine Klärungsrunde zu viel statt zu wenig.
- **Goal-getriebene Umsetzung, einmal bestätigt (Aspekt: apply).** Nach bestandenem Gate
  bietet `apply` an der letzten Freigabe-Grenze den autonomen, goal-getriebenen Lauf an
  und startet ihn **nach einer Bestätigung** – nicht ungefragt. Bevorzugt wird der
  eingebaute Goal-Weg: der Ziel-Workflow durchläuft seine verbleibenden Phasen unter dem
  bestehenden Baustein „Goal-getriebene Abschlusssteuerung" (`goal-completion.md`), und wo
  ein nativer `/goal`-Lauf möglich ist, wird der fertige `/goal`-String zum Einfügen
  ausgegeben (ein Skill kann `/goal` nicht selbst starten). Es wird kein neuer „Goal-Skill"
  eingeführt.
- **Investigationen immer lokal (Aspekt: Datenhaltung).** Investigationen bleiben in
  beiden Modi ausschließlich lokal unter `.firmo/investigation/` und werden nie als Issue
  geführt oder committet. Nur Reviews haben den local/remote-Umschalter.
- **Config wird einmalig vollständig migriert; deterministisch überall, Rückfragen nur in
  `setup` (Aspekt: Config-Konsolidierung).** Statt additiv nur fehlende Schlüssel zu ergänzen,
  wird `.firmo/config.json` **einmalig vollständig auf das neue, konsolidierte Schema
  umgeschrieben** (Entscheidung: „Config komplett migrieren"): veraltete/umbenannte
  Firmo-Schlüssel fallen raus, ihre Werte werden auf die neuen Felder abgebildet. Die
  verstreuten per-Block-Migrationen (heute in `worktree-integration.md` und
  `issue-tracker.md`) werden dazu in **einen** geteilten Baustein `config-migration.md`
  zusammengezogen. **Ausführungsmodell (Entscheidung „Deterministisch überall, Rückfragen nur
  in setup"):** Jeder config-lesende Skill führt beim ersten Config-Lesen die **eindeutigen,
  rückfragefreien** Abbildungen aus und schreibt zurück – nicht-blockierend, damit autonome
  Läufe nie an einem Config-Dialog hängen. Ein Fall, der eine echte User-Entscheidung
  braucht, wird **aufgeschoben**: ein sicherer Default gilt für den Lauf, und der User wird
  auf `/firmo setup` verwiesen; die eigentliche Migrations-Rückfrage stellt ausschließlich
  `setup`. Deterministische Abbildungen: Legacy-Lieferwerte
  `worktree.baseBranch`/`worktree.branchPrefix`/`worktree.completion` → `delivery.*` (inkl.
  werterhaltend `null` → `null` = „beim Lauf fragen"); `delivery.enabled` entfällt (entwertet);
  `plan.dir` mit Default `docs/plan` ergänzt; `worktree.enabled`, `tracker.*`, `review.*`,
  `applyReview.*`, `plan.markerLanguage` behalten ihren Wert. Fremd-Schlüssel (nicht von Firmo)
  bleiben erhalten. Der Abschluss wird mit einer Migrations-Version in `.firmo/memory.json`
  markiert, sodass die Vollmigration nur **einmal** läuft; bei ungültigem JSON wird nicht
  überschrieben, sondern der User informiert.
- **Worktree-Default `true`, Wert bleibt bei expliziter Vorgabe (Aspekt: Worktree-Default).**
  Der neue Default `true` greift für frische oder abwesende `worktree.enabled`-Schlüssel; ein
  bestehend explizit gesetztes `worktree.enabled: false` wird von der Vollmigration als
  gültiger Wert übernommen (direktes Mapping), nicht stillschweigend auf `true` gedreht. Ist
  der Worktree dadurch beim Lauf deaktiviert, gibt der Workflow einen kurzen Hinweis aus,
  dass der (Default-)Worktree-Modus per Config aus ist, damit die Abweichung vom neuen Default
  sichtbar bleibt.

## Betroffene Dateien

Die Änderungen betreffen ausschließlich Firmo-Quellen unter `src/` (Build erzeugt
`dist/`) sowie die Repo-Metadoku. Gruppiert nach Workstream (siehe Vorgehen).

| Datei                                                    | Geplante Änderung                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/plan-numbering.md`                           | Inhalt ersetzen: Reservierungs-/Nummern-/Kollisionsmaschinerie entfernen; neues Datums-Slug-Naming, Migrationsregel (NNNN→Datum), Archiv-Konvention. Dateiname bleibt, um Include-Churn zu vermeiden (Inhalt beschreibt jetzt „Plan-Naming“).                                                                                                                                                                                                                              |
| `src/shared/plan-reference-routing.md`                   | Referenzauflösung: Datums-Slug-Dateinamen, Legacy-Nummer **primär über H1 `# NNNN:`** (Dateinamen-Segment sekundär, um Kollision mit ziffern-Slugs zu vermeiden), Slug; Suche in `<plan.dir>` **und** `<plan.dir>/archive`.                                                                                                                                                                                                                                                |
| `src/shared/apply-source-detection.md`                   | Plan-Erkennung über `<plan.dir>` + Archiv; „vierstellige Nummer ohne Pfad“ nur noch als **Legacy**-Plan-Referenz.                                                                                                                                                                                                                                                                                                                                                          |
| `src/shared/worktree-integration.md`                     | `worktree.enabled` Default `true`; `delivery.completion` Default `merge`; `delivery.enabled` als Gate entwerten (Worktree impliziert Delivery); eigene per-Block-`delivery`/`worktree`-Legacy-Migration entfernen (geht in `config-migration.md` auf); Invariante „nur Pläne im Liefer-Branch/committet, `.firmo/` nie“ schärfen; Statuswechsel `Umgesetzt` + Archiv-Move am Delivery-Punkt (vor PR/Merge, mitcommittet); offene Pläne jederzeit per PR/Merge einbringbar. |
| `src/shared/plan-status.md`                              | Hinweis, dass der Marker auch in `<plan.dir>/archive` gilt; sonst unverändert.                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/shared/doc-categories.md`                           | NNNN-Exklusivitäts-Hinweis auf das neue Datums-Schema anpassen; Nummern als Legacy kennzeichnen.                                                                                                                                                                                                                                                                                                                                                                           |
| `src/shared/unresolved-review-report.md`                 | `docs/plan/NNNN`-Referenzen auf `<plan.dir>` + neues Naming aktualisieren.                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/shared/issue-tracker.md`                            | Klarstellen: Investigationen sind immer lokal; nur Reviews haben den local/remote-Umschalter. Konsolidierungstext. Eigene per-Block-`tracker`-Migration entfernen (geht in `config-migration.md` auf).                                                                                                                                                                                                                                                                     |
| `src/shared/config-migration.md` (neu)                   | Neuer Baustein: einmalige, vollständige Konsolidierung von `.firmo/config.json`. Zwei Pfade: deterministische, rückfragefreie Abbildungen laufen nicht-blockierend in jedem config-lesenden Skill; echte Rückfrage-Fälle werden aufgeschoben (sicherer Default für den Lauf, Hinweis auf `setup`) und nur in `setup` entschieden. Migrations-Version in `.firmo/memory.json`, ungültiges JSON nicht überschreiben. Ersetzt die verstreuten per-Block-Migrationen.          |
| `src/shared/apply-clarity-gate.md` (neu)                 | Neuer Baustein: Kriterien und Ablauf des „vollständig geklärt?"-Gates inkl. Rückverweis in die Klärung. Wird von `apply`, `apply-plan`, `apply-issues` und – für Direktaufrufe mit Plan-Datei – von `build`/`fix`/`refactor`/`docs` per `include` eingebunden.                                                                                                                                                                                                             |
| `src/tools/plan.md`                                      | Reservierungs-„erste Aktion“ und Nummernlogik entfernen; Datei erst in Phase 3/7 unter `<plan.dir>/YYYY-MM-DD-<slug>.md` schreiben; `plan.dir` konsultieren; Bulk-Migration beim Neu-Erstellen auslösen; Marker-Sprachlogik bleibt.                                                                                                                                                                                                                                        |
| `src/tools/apply.md`                                     | `apply-clarity-gate` einbinden; nach grünem Gate den autonomen Goal-Lauf anbieten (einmal bestätigen) und Kontext-Flag „vollständig geklärt → Goal” an Ziel-Skill; bei Unklarheit Rückverweis auf `plan`/`plan-issue`.                                                                                                                                                                                                                                                     |
| `src/tools/apply-plan.md`                                | `apply-clarity-gate` einbinden; goal-getriebene Delegation nach Bestätigung; Migration-on-ingest; Archiv-bewusste Auflösung.                                                                                                                                                                                                                                                                                                                                               |
| `src/tools/apply-issues.md`                              | `plan.dir`; Migration-on-ingest; `apply-clarity-gate` für frei geschriebene Issues (Rückverweis auf `plan-issue`).                                                                                                                                                                                                                                                                                                                                                         |
| `src/tools/apply-review.md`                              | Konsistenz mit neuem Worktree-Default/Merge; lokale Reports bleiben lokal; Archiv-Move nur, falls eine Plan-Datei geführt wird.                                                                                                                                                                                                                                                                                                                                            |
| `src/tools/build.md`, `fix.md`, `refactor.md`, `docs.md` | Worktree-Default an; `apply-clarity-gate` bei Direktaufruf mit Plan-Datei einbinden; Plan bei Abschluss nach Archiv verschieben; `plan.dir`; autonomer Goal-Lauf, wenn mit „geklärt”-Flag aufgerufen; Bulk-Migration bei Plan-Ingest; Hinweis, wenn Worktree per Config deaktiviert ist.                                                                                                                                                                                   |
| `src/tools/open-plans.md`                                | Nur `<plan.dir>` oberste Ebene listen (Archiv ausschließen); Datums-Naming; Nummer als Legacy behandeln.                                                                                                                                                                                                                                                                                                                                                                   |
| `src/tools/plan-review.md`                               | `plan.dir`; neues Naming in Beispielen/Referenzen.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/tools/plan-issue.md`                                | `plan.dir`; Pläne im neuen Naming schreiben.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/tools/investigate.md`                               | Klarstellen: Investigationen immer lokal unter `.firmo/investigation/`, nie committet; `plan.dir`-Referenzen falls vorhanden.                                                                                                                                                                                                                                                                                                                                              |
| `src/tools/maintain.md`                                  | Worktree-Default an (konsistent mit den übrigen code-ändernden Workflows).                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/tools/setup.md`                                     | Config-Schema: `plan.dir` neu; `worktree.enabled` Default `true`; `delivery.completion` Default `merge`; `delivery.enabled`-Frage entfernen; `config-migration` einbinden und als **einziger** Ort die aufgeschobenen Migrations-Rückfragen führen (inkl. optionalem `completion: null` → `merge`-Upgrade); Presets und Schritt-4-Fragen anpassen; Zusammenfassung erweitern.                                                                                              |
| `AGENTS.md`                                              | Abschnitt „Plan files“ auf Datums-Schema, Archiv und Legacy-Nummern aktualisieren.                                                                                                                                                                                                                                                                                                                                                                                         |
| `build.mjs`                                              | Nur falls ein Guard das NNNN-Schema prüft – prüfen und ggf. anpassen (Erwartung: kein Guard betroffen).                                                                                                                                                                                                                                                                                                                                                                    |

## Implementierungsdetails

### Vorgehen

Empfohlene Reihenfolge in sechs Workstreams; jeder Workstream ist ein in sich
abgeschlossener, testbarer Schritt (eigener Commit/PR):

1. **WS1 – Plan-Naming, Migration, Archiv.** `plan-numbering.md` neu fassen;
   `plan.md`, `plan-reference-routing.md`, `apply-source-detection.md`, `open-plans.md`,
   `doc-categories.md`, `unresolved-review-report.md`, `AGENTS.md` angleichen. Danach
   erzeugt `plan` Datums-Slug-Namen, und Auflöser verstehen Alt- wie Neuformat sowie das
   Archiv.
2. **WS2 – Config-Pfad `plan.dir`.** Schlüssel in `setup.md` und allen Skills, die
   `docs/plan/` hartcodiert lesen/schreiben, einführen; Default `docs/plan`. Hinweis zur
   Reihenfolge: WS1 arbeitet noch gegen das feste `docs/plan/`; die `<plan.dir>`-Referenzen
   in den WS1-Dateien werden erst mit WS2 wirksam (bis dahin ist `<plan.dir>` = `docs/plan`).
   Wer WS2 vorzieht, kann `plan.dir` gleich in WS1 mitführen – beide Reihenfolgen sind
   zulässig, solange am Ende kein hartcodierter Pfad zurückbleibt.
3. **WS3 – Worktree-Default + Delivery-Vereinfachung + Config-Vollmigration.**
   `worktree-integration.md` umstellen (`worktree.enabled` Default `true`,
   `delivery.completion` Default `merge`, `delivery.enabled` entwertet); Statuswechsel
   `Umgesetzt` **und** Archiv-Move am Delivery-Punkt (vor PR/Merge, mitcommittet)
   verankern; offene Pläne jederzeit per PR/Merge einbringbar dokumentieren. Neuen
   Baustein `config-migration.md` anlegen, der die einmalige Vollmigration der Config
   führt, und die per-Block-Migrationen aus `worktree-integration.md`/`issue-tracker.md`
   dorthin zusammenziehen; `setup.md`-Fragen/Presets nachziehen; Konsistenz in allen
   code-ändernden Workflows inkl. `maintain`.
4. **WS4 – Datenhaltung konsolidieren.** Invariante „nur Pläne committet; Reviews und
   Investigationen immer lokal“ in `worktree-integration.md`, `issue-tracker.md`,
   `investigate.md` schärfen; remote = Issues bleibt wie gehabt.
5. **WS5 – `apply` Klärungs-Gate.** Gate-Phase in `apply.md`/`apply-plan.md`/
   `apply-issues.md`; klare Kriterien und Rückverweis in die Klärung.
6. **WS6 – Goal-getriebene autonome Umsetzung.** Kontext-Flag von `apply` an die
   Ziel-Workflows; `build/fix/refactor/docs` durchlaufen bei gesetztem Flag ihre Phasen
   autonom unter `goal-completion.md`.

Nach jedem Workstream `node build.mjs` ausführen (Build ist die Prüfung; kein
Test-Suite vorhanden) und `pnpm agent:check` (oxfmt).

### Naming- und Migrationsregeln (WS1, Detail)

- **Neuer Plan:** `<plan.dir>/YYYY-MM-DD-<slug>.md`. `YYYY-MM-DD` = Erstellungsdatum
  (ISO, aus `date +%F`). `<slug>` = Kebab-Case aus Titel (`a–z`, `0–9`, `-`). Existiert
  der Name bereits, `-2`, `-3`, … anhängen. Keine Vorab-Reservierung: Die Datei wird
  erst beim Befüllen (Plan-Erstellungsphase) geschrieben.
- **Migration (Bulk):** Für jede Datei in `<plan.dir>`, deren Name mit `\d{4}-` (aber
  **nicht** `\d{4}-\d{2}-\d{2}-`) beginnt: umbenennen zu `YYYY-MM-DD-<originalname>`,
  `YYYY-MM-DD` = Umstellungsdatum; im Git-Repo `git mv`. H1 (`# NNNN: Titel`) bleibt
  unverändert (Nummer als stabile Referenz). Auslöser: Neu-Erstellung eines Plans; oder
  Einlesen, wenn dabei ein Altformat gefunden wird. Idempotent über den Format-Check.
- **Archiv (an das Delivery-Event gekoppelt):** Am Delivery-Punkt – unmittelbar bevor der
  PR geöffnet bzw. der Worktree-Branch gemergt wird, noch im Liefer-Branch – setzt der
  Workflow den Marker auf `Umgesetzt`/`Implemented` und verschiebt die Datei per `git mv`
  nach `<plan.dir>/archive/` (Verzeichnis bei Bedarf anlegen). Diese Verschiebung wird
  mitcommittet und ist damit Teil des PRs/Merges (Umsetzungs-Doku). Läuft der Workflow
  In-Place ohne Worktree, gilt der Merge/Commit in den Zielbranch als Delivery-Event.
- **Auflösung:** Referenz per vollem Pfad, Dateiname, Legacy-Nummer oder Slug; Suche in
  `<plan.dir>` und `<plan.dir>/archive`. Mehrfachtreffer → nachfragen.
- **Legacy-Nummer eindeutig auflösen (Kollision mit ziffern-Slugs vermeiden):** Eine
  Legacy-Nummer `NNNN` wird **primär über den H1-Marker** `# NNNN: …` aufgelöst, nicht über
  das Dateinamen-Segment. Grund: Ein neuer Plan mit einem Slug, der mit vier Ziffern beginnt
  (Titel „2024 Retrospektive" → `YYYY-MM-DD-2024-retrospektive.md`), ist vom migrierten
  Legacy-Muster `YYYY-MM-DD-NNNN-slug.md` am Dateinamen nicht unterscheidbar. Da nur
  migrierte Altpläne eine `# NNNN:`-H1 tragen (neue Pläne haben `# <Titel>` ohne Nummer),
  ist die H1 der sichere Diskriminator. Das Dateinamen-Segment dient nur als sekundäres
  Signal, wenn die H1 fehlt.

### Config-Vollmigration (WS3, Detail)

Der Baustein `config-migration.md` führt eine **einmalige** vollständige Konsolidierung
von `.firmo/config.json` durch (Trigger: erste Config-Berührung eines Skills; danach über
Migrations-Version in `.firmo/memory.json` gesperrt). Er trennt zwei Ausführungspfade:

**Deterministischer Pfad – läuft in jedem config-lesenden Skill, nicht-blockierend:**

- `worktree.baseBranch` → `delivery.baseBranch`
- `worktree.branchPrefix` → `delivery.branchPrefix`
- `worktree.completion` → `delivery.completion`, **werterhaltend** (gültiger Wert bleibt;
  `null` → `null` = „beim Lauf fragen"). Kein Prompt, weil `null` ein gültiger Zielwert ist.
- `delivery.enabled` → entfernen (entwertet)
- `plan.dir` ergänzen mit Default `docs/plan`, falls fehlend
- `worktree.enabled`, `worktree.setup`, `worktree.baseDir`, `tracker.*`, `review.*`,
  `applyReview.*`, `plan.markerLanguage` → Wert übernehmen (Feld bleibt)
- veraltete/umbenannte Firmo-Schlüssel nach dem Verschieben aus dem alten Block entfernen;
  nicht von Firmo stammende Fremd-Schlüssel unverändert erhalten
- Diese Abbildungen werden zurückgeschrieben und mit der Migrations-Version markiert. Da
  keine Rückfrage nötig ist, blockieren autonome/Goal-Läufe nie.

**Rückfrage-Pfad – ausschließlich in `setup`:**

- Ein Legacy-Wert, der sich nicht eindeutig auf genau ein neues Feld abbilden lässt, wird
  **nicht** von einem beliebigen Skill entschieden. Der laufende Skill nutzt einen sicheren
  Default für diesen Lauf, lässt das betroffene Feld unverändert, meldet den offenen Punkt
  und verweist auf `/firmo setup`.
- `setup` stellt die eigentlichen Migrations-Rückfragen (z. B. optionales Upgrade von
  `delivery.completion: null` auf den neuen Default `merge`) und schreibt die Wahl.
- Die Migrations-Version wird erst dann als „vollständig" markiert, wenn auch die
  aufgeschobenen Fälle in `setup` entschieden sind; der deterministische Teil darf davor
  bereits als eigener Teilschritt markiert werden, um Doppelarbeit zu vermeiden.

**Sicherheit und Sichtbarkeit:** vor dem Schreiben frisch einlesen; bei ungültigem JSON nicht
überschreiben, sondern mit Pfad und Fehler melden; einmal je Lauf melden, dass die Config
(teil-)migriert wurde, mit Liste der entfernten und neu gesetzten/verschobenen Schlüssel und
– falls vorhanden – der nach `setup` aufgeschobenen Punkte.

### Klärungs-Gate (WS5, Detail)

Der Baustein `apply-clarity-gate.md` definiert einmal die Kriterien für „nicht ohne
Rückfrage umsetzbar” (mindestens eines trifft zu → zurück in die Klärung, nicht umsetzen):

- Der Plan enthält einen nicht-leeren Abschnitt `## Offene Punkte` / `## Open Points`.
- Akzeptanzkriterien fehlen oder sind ohne benannte Prüfung/Messgröße formuliert.
- Der Plan enthält als Annahme markierte, umsetzungsrelevante Unklarheiten.
- Bei Issues/Findings: keine ausreichende, self-contained Umsetzungsbeschreibung.

Verhalten am Gate: keine Annahmen außer absolut offensichtlichen. Im Zweifel Rückverweis
– Pläne an `plan` (bzw. dessen vertieften Plan-Review), Issues an `plan-issue` – und
den Skill beenden, statt teilzurouten.

Das Gate greift an **beiden** Einstiegspunkten (Entscheidung „apply + Direktaufrufe”):
in der Apply-Kette und bei Direktaufruf von `build`/`fix`/`refactor`/`docs` mit einer
Plan-Datei. Beide binden denselben Baustein ein; die bestehende „Offene Punkte prüfen”-Logik
in `plan-reference-routing.md` geht darin auf, um Doppelpflege zu vermeiden.

### Goal-getriebene Umsetzung (WS6, Detail)

Nach grünem Gate an der letzten Freigabe-Grenze:

- `apply` (bzw. der direkt aufgerufene Workflow) bietet den autonomen Lauf an und startet
  ihn erst **nach einer Bestätigung**.
- Bevorzugt der eingebaute Goal-Weg: Ist ein nativer `/goal`-Lauf sinnvoll möglich, wird
  über die bestehende „Explizite Goal-Abfrage” aus `goal-completion.md` der fertige,
  copy-paste-bare `/goal`-String ausgegeben. Andernfalls durchläuft der Ziel-Workflow seine
  restlichen Phasen unter dem internen goal-getriebenen Loop.
- Läuft der Workflow als nicht-interaktive Sub-Delegation aus `apply`, gilt die bestehende
  Regel „Goal-Abfrage entfällt” aus `goal-completion.md` unverändert.

### State-Management

Nicht relevant (keine Laufzeit-State-Maschine; Firmo ist ein Source-to-Dist-Build). Die
Config-Vollmigration ist einmalig und wird über eine Migrations-Version in
`.firmo/memory.json` gegen Wiederholung gesperrt.

### API-Anbindung

Nicht relevant. Remote-Tracker (`gh`/`tea`) bleibt unverändert genutzt.

### Edge Cases

- **Kein Remote:** Merge-Default in den lokalen Zielbranch funktioniert ohne Remote;
  PR-Abschluss ist nur mit Remote möglich und wird sonst mit klarer Meldung abgelehnt.
- **Slug-Kollision am selben Tag:** numerisches Suffix `-2`, `-3`, …; kein stilles
  Überschreiben.
- **Umgesetzt-Timing:** Der Marker wird am Delivery-Punkt gesetzt – mit dem Öffnen des
  PRs bzw. dem Merge des Worktree-Branches; die Archiv-Verschiebung ist Teil desselben
  PRs/Merges. Ein optimistisch als umgesetzt markierter PR, der später nicht gemergt wird,
  wird bewusst in Kauf genommen (User-Entscheidung).
- **Teilweise umgesetzter Plan (mehrere Deliverys):** bleibt in `<plan.dir>` (nicht
  Archiv) und im Status `Nicht umgesetzt`, bis das Delivery-Event der finalen Umsetzung
  eintritt.
- **Offener Plan ohne Umsetzung einbringen:** eine Plan-Datei im Status `Nicht umgesetzt`
  kann jederzeit per PR oder Merge in den Zielbranch gebracht werden, ohne Archiv-Move und
  ohne Statuswechsel.
- **Legacy-Nummern-Referenz nach Migration:** `0048` löst weiter auf, primär über die
  H1 `# 0048: …` (siehe „Legacy-Nummer eindeutig auflösen"); das Dateinamen-Segment ist
  sekundär.
- **Neuer Plan mit ziffern-Slug:** Ein Titel wie „2024 Retrospektive" ergibt
  `YYYY-MM-DD-2024-retrospektive.md`. Weil die H1 (`# 2024 Retrospektive`, ohne
  `NNNN:`-Muster) keine Legacy-Nummer trägt, wird die Datei korrekt als neuer Plan behandelt
  und nicht als „Plan Nummer 2024" fehlinterpretiert.
- **PR-Strategie vs. `open-plans` auf dem Zielbranch:** Wird ein Plan optimistisch bei
  PR-Öffnung als umgesetzt markiert und ins Archiv verschoben, geschieht das zunächst nur im
  Liefer-Branch/PR. Auf dem Zielbranch (z. B. `main`) bleibt der Plan bis zum PR-Merge in
  `<plan.dir>` und wird dort weiter als offen gelistet. Diese vorübergehende Divergenz ist
  gewollt (Konsequenz der optimistischen Umgesetzt-Markierung); sie löst sich mit dem Merge
  auf bzw. bleibt korrekt „offen", falls der PR nie merged.
- **Doppelte Migration / gemischtes Verzeichnis:** Format-Check überspringt bereits
  migrierte Dateien; ein Verzeichnis mit Alt- und Neuformat konvergiert beim nächsten
  Trigger.
- **In-Place-Opt-out trotz Worktree-Default:** Per-Run-Wunsch („ohne Worktree“) oder
  `worktree.enabled: false` bleibt wirksam; dann keine erzwungene Branch-/Delivery-Erzeugung.
- **Ungültige/kaputte `config.json`:** sichere Defaults für den Lauf, User informieren,
  nicht überschreiben (bestehende Regel); die Vollmigration läuft dann nicht.
- **Nicht eindeutig abbildbarer Config-Wert:** außerhalb von `setup` wird nicht geraten und
  nicht geblockt – der Skill nutzt einen sicheren Default für den Lauf, lässt das Feld
  unverändert und verweist auf `/firmo setup`, das die Rückfrage stellt. So bleibt ein
  autonomer/Goal-Lauf frei von blockierenden Config-Dialogen.
- **Fremd-Schlüssel in der Config:** nicht von Firmo stammende Schlüssel bleiben bei der
  Vollmigration unverändert erhalten; nur veraltete/umbenannte Firmo-Schlüssel fallen raus.

## Akzeptanzkriterien

- [ ] `node build.mjs` und `pnpm agent:check` laufen nach jedem Workstream fehlerfrei
      durch (Build-Guards sind grün).
- [ ] `plan` erzeugt einen neuen Plan als `<plan.dir>/YYYY-MM-DD-<slug>.md` ohne Nummer
      und ohne Reservierungs-Stub; die Reservierungs-/Kollisionsabschnitte existieren
      nicht mehr in `plan-numbering.md`.
- [ ] Ein Altplan `NNNN-slug.md` wird beim nächsten Plan-Erstellen oder -Einlesen bulk
      zu `YYYY-MM-DD-NNNN-slug.md` migriert; der Trigger feuert nicht bei jedem
      Firmo-Aufruf; die H1-Nummer bleibt unverändert.
- [ ] Eine Legacy-Nummern-Referenz (z. B. `0048`) und ein Slug lösen nach Migration
      weiterhin korrekt auf, inklusive Treffern im Archiv.
- [ ] Am Delivery-Punkt (vor PR-Öffnung/Merge) setzt der Workflow den Umgesetzt-Marker
      und verschiebt die Plan-Datei nach `<plan.dir>/archive/`; diese Verschiebung ist Teil
      desselben PRs/Merges (Umsetzungs-Doku), und `open-plans` listet Archiv-Pläne nicht.
- [ ] Eine offene Plan-Datei (Status `Nicht umgesetzt`) lässt sich jederzeit per PR oder
      Merge in den Zielbranch einbringen, ohne Archiv-Move und ohne Statuswechsel.
- [ ] `worktree.enabled` ist per Default aktiv und `delivery.completion` per Default
      `merge`; ein expliziter In-Place-Wunsch oder `worktree.enabled: false` deaktiviert
      den Worktree; `delivery.enabled` ist entfernt.
- [ ] Die Config wird einmalig vollständig auf das neue Schema migriert: Legacy-Lieferwerte
      aus `worktree.*` landen in `delivery.*`, `delivery.enabled` und andere veraltete
      Firmo-Keys werden entfernt, `plan.dir` ergänzt; Fremd-Schlüssel bleiben erhalten; ein
      Migrations-Marker in `.firmo/memory.json` verhindert einen zweiten Lauf.
- [ ] Der deterministische Migrationsteil läuft in jedem config-lesenden Skill
      nicht-blockierend; ein echter Rückfrage-Fall wird außerhalb von `setup` aufgeschoben
      (sicherer Default, Hinweis auf `setup`), sodass ein autonomer/Goal-Lauf nie an einem
      Config-Dialog hängenbleibt; nur `setup` stellt die Migrations-Rückfragen.
- [ ] Ein bestehend explizites `worktree.enabled: false` wird von der Vollmigration als Wert
      übernommen (nicht auf `true` gedreht); ist der Worktree dadurch aus, weist der Workflow
      beim Lauf darauf hin.
- [ ] Der Zielbranch ist über `delivery.baseBranch` konfigurierbar; Merge ohne Remote
      funktioniert, PR verlangt einen Remote.
- [ ] `plan.dir` ist konfigurierbar (Default `docs/plan`); kein Skill liest/schreibt
      Pläne mehr hartcodiert unter `docs/plan/`.
- [ ] Datenhaltung ist dokumentiert und umgesetzt: nur Pläne werden committet; Reviews
      (`.firmo/review/`) und Investigationen (`.firmo/investigation/`) bleiben lokal und
      ungetrackt; Remote-Modus führt Reviews als Issues.
- [ ] Das Klärungs-Gate (`apply-clarity-gate`) weist eine nicht vollständig geklärte
      Grundlage (nicht-leere offene Punkte, fehlende messbare Akzeptanzkriterien) in eine
      Klärungsrunde zurück, statt umzusetzen – sowohl über `apply` als auch bei Direktaufruf
      von `build`/`fix`/`refactor`/`docs` mit einer Plan-Datei.
- [ ] Nach grünem Gate wird der autonome, goal-getriebene Lauf erst nach Bestätigung
      gestartet und nutzt bevorzugt den eingebauten Goal-Weg (`/goal`-String bzw. interner
      Loop).
- [ ] Investigationen bleiben in beiden Modi lokal unter `.firmo/investigation/` und
      werden nie als Issue geführt.
- [ ] `setup` fragt/schreibt die neuen bzw. geänderten Defaults konsistent und
      nicht-destruktiv; bestehende und unbekannte Config-Schlüssel bleiben erhalten.

## Validierungsplan

- Nach jedem Workstream: `node build.mjs` (erzeugt `dist/` für Claude und Codex; Guards
  inkl. Version-Drift müssen grün sein) und `pnpm agent:check` (oxfmt --check).
- Manuelle Durchsicht der erzeugten `dist/`-Router/Tools auf korrekt aufgelöste
  `{{SKILL}}`/`{{AGENT}}`-Platzhalter in den geänderten Dateien.
- Manuelle Trockenprüfung der Naming-/Migrations-/Archiv-Regeln an einem Kopie-Verzeichnis
  von `docs/plan/` (Alt→Neu-Umbenennung, Referenzauflösung Nummer/Slug, Archiv-Suche).
- Manuelle Prüfung der Config-Vollmigration an einer Kopie einer Alt-`config.json`, in zwei
  Läufen: (a) über einen beliebigen code-ändernden Skill – die deterministischen Abbildungen
  (`worktree.*`-Lieferwerte → `delivery.*`, `delivery.enabled` raus, `plan.dir` ergänzt,
  `completion: null` werterhaltend, Fremd-Schlüssel bleiben) laufen ohne Prompt; (b) über
  `/firmo setup` – die aufgeschobenen Rückfragen (optionales `completion`-Upgrade) werden
  gestellt. Ein zweiter Lauf ändert nichts mehr (Migrations-Marker greift).
- Prüfen, dass ein simulierter autonomer/Goal-Lauf mit migrationsbedürftiger Config nicht an
  einem Config-Dialog blockiert.
- Grep-Check, dass keine hartcodierten `docs/plan/`-Pfade in Skills verbleiben, die
  `plan.dir` respektieren sollen.

## Annahmen und offene Punkte

- Annahme: `plan-numbering.md` behält seinen Dateinamen (nur Inhalt wird ersetzt), um
  Include-Referenzen nicht flächig anfassen zu müssen; falls beim Umsetzen ein
  sprechenderer Name gewünscht ist, wären alle `include`-Stellen mitzuziehen.
- Annahme: Es existiert kein Build-Guard, der das NNNN-Schema erzwingt; `build.mjs` wird
  beim Umsetzen kurz gegengeprüft und nur bei Bedarf angepasst.
- Entschieden (vertiefter Review): „Goal-Skill” meint den vorhandenen Baustein
  `goal-completion.md` bzw. den nativen `/goal`-Weg, nicht ein neu einzuführendes Tool.
- Entschieden (vertiefter Review): Investigationen haben keinen Remote-Modus; sie bleiben
  immer lokal.
- Annahme: Das Datums-Präfix migrierter Altpläne ist das Umstellungsdatum (alle am
  selben Tag migrierten Altpläne teilen dasselbe Datum; die erhaltene `NNNN` liefert die
  Feinordnung).

## Testergebnisse

Umgesetzt über `/firmo apply` → `/firmo build` in sechs Workstreams (je eigener Commit) plus
einer Konsistenz-Runde, in-place auf dem Branch `firmo/build/firmo-toolset-vereinfachung`:

- `9697be2` WS1 – Datums-Slug-Naming, Migration, Archiv-Konvention (`plan-numbering.md` neu, plus Auflösung/Erkennung/open-plans/doc-categories/AGENTS).
- `147fa43` WS2 – konfigurierbarer `plan.dir` (Default `docs/plan`).
- `ac2381a` WS3a – Worktree-Default `true`, Merge-Default, `delivery.enabled` entwertet, Status+Archiv-Move am Delivery-Punkt.
- `d3f03d7` WS3b – zentraler Baustein `config-migration.md` (Voll­migration, deterministisch überall, Rückfragen nur in setup).
- `73815c5` WS4 – Datenhaltungs-Invariante (nur Pläne committet; Reviews/Investigationen lokal; Investigationen immer lokal).
- `a909543` WS5+WS6 – `apply-clarity-gate.md` (Gate in apply-Kette **und** Direktaufrufen) plus goal-getriebene, einmal bestätigte Umsetzung.
- `dd713a0` Konsistenz – verbliebene `NNNN`/`0066`-Beispielpfade auf Datums-Slug.

Validierung nach jedem Workstream: `node build.mjs` grün (beide Harnesses, Guards inkl.
Version-Drift und Ask-Header-Länge) und `pnpm agent:check` grün (oxfmt, 144 Dateien). Es gibt
keine Test-Suite; der Build ist die maßgebliche Prüfung.

Hinweis zur Laufzeit-Migration: Die bestehenden Alt-Pläne unter `docs/plan/` wurden bewusst
**nicht** bulk-umbenannt – die Umstellung auf das Datums-Schema erfolgt gemäß Plan zur
Laufzeit beim nächsten Plan-Erstellen/-Einlesen mit dem neuen Build.

## Review-Findings

Keine offenen kritischen Findings. Der zweistufige Plan-Review (Erstplanung + `/firmo review`)
ist im Abschnitt `## Plan-Review` dokumentiert; alle dort erhobenen Befunde wurden vor der
Umsetzung eingearbeitet.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

Kumuliert über beide Review-Runden; alle Befunde eingearbeitet oder entschieden.

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       1 |       1 |
| Security    |        0 |       0 |       0 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       2 |       2 |
| Testbarkeit |        0 |       0 |       0 |
| Scope       |        0 |       1 |       1 |
| Wartbarkeit |        0 |       0 |       1 |

### Befunde

- **Scope (Wichtig):** Der Plan bündelt sechs Workstreams in einer Grundlage. Bewusst
  so gewählt (User-Entscheidung „Ein Gesamtplan”), aber die Umsetzung sollte strikt pro
  Workstream committen/liefern, um Reviewbarkeit und Rollback-Fähigkeit zu erhalten.
  Eingearbeitet über die nummerierte WS-Reihenfolge und die Commit/PR-je-Workstream-Vorgabe.
- **Architektur (Hinweis):** `delivery.enabled` wird entwertet **und** von der
  Config-Vollmigration aus der Datei entfernt, sodass keine zwei Wahrheiten dauerhaft
  bestehen bleiben. Die Vollmigration bildet die Legacy-`worktree.*`-Lieferwerte auf
  `delivery.*` ab; ein bestehend explizites `worktree.enabled: false` bleibt als Wert
  erhalten, mit Hinweis bei deaktiviertem Worktree.
- **Fehlerfälle (Hinweis):** Ohne sekundengenaue Ordnung same-day ist die
  Slug-Kollisionsregel (`-2`, `-3`) die einzige Eindeutigkeitsgarantie – bewusst als
  Vereinfachung akzeptiert.
- **Wartbarkeit (Hinweis):** `plan-numbering.md` unter altem Dateinamen mit neuem Inhalt
  ist ein Kompromiss zugunsten geringer Include-Churn; als Annahme dokumentiert. Das
  Klärungs-Gate wird bewusst als **einziger** geteilter Baustein (`apply-clarity-gate.md`)
  geführt, den apply-Kette und Direktaufrufe gemeinsam einbinden, statt die Logik zu
  duplizieren (vertieft geklärt: „apply + Direktaufrufe”).

### Vertiefter Plan-Review – geklärte Entscheidungen

- **Config-Migration:** die Config wird einmalig **vollständig** auf das neue Schema
  migriert (alte Werte raus, auf neue Felder abbilden); ein explizites
  `worktree.enabled: false` bleibt als Wert erhalten, mit Hinweis beim Lauf. (Ersetzt die
  frühere „Nur fehlende Keys"-Entscheidung.)
- **Ort des Klärungs-Gates:** apply-Kette **und** Direktaufrufe von
  `build`/`fix`/`refactor`/`docs`, über den geteilten Baustein `apply-clarity-gate.md`.
- **Goal-Autonomie:** nach grünem Gate erst nach Bestätigung; bevorzugt der eingebaute
  Goal-Weg (`/goal`-String bzw. interner Loop).
- **Investigationen:** in beiden Modi immer lokal, nie als Issue.
- **Ausführungsort der Config-Migration (2. Review-Runde):** deterministische Abbildungen
  laufen überall nicht-blockierend; echte Rückfragen ausschließlich in `setup`, sonst
  aufgeschoben mit sicherem Default. Schützt autonome/Goal-Läufe vor blockierenden Dialogen.

### Vertiefter Plan-Review – 2. Runde (via `/firmo review`)

Fünf neue Befunde aus den zwischenzeitlichen Änderungsrunden; vier direkt eingearbeitet,
einer entschieden:

- **Fehlerfälle (Wichtig, entschieden):** Interaktive Config-Vollmigration könnte autonome
  Läufe blockieren → Ausführungsmodell „deterministisch überall, Rückfragen nur in setup"
  eingearbeitet (siehe „Config-Vollmigration (WS3, Detail)").
- **Logik (Wichtig, direkt behoben):** Widerspruch zu `delivery.enabled` („bleibt lesbar"
  vs. „wird entfernt") aufgelöst – die Vollmigration entfernt den Schlüssel; vor Migration
  wird er beim Lesen nur toleriert.
- **Fehlerfälle (Wichtig, direkt behoben):** Neuer Plan mit ziffern-Slug
  (`YYYY-MM-DD-2024-…`) kollidierte mit dem Legacy-Muster `YYYY-MM-DD-NNNN-…`. Legacy-Nummer
  wird jetzt primär über die H1 `# NNNN:` aufgelöst.
- **Scope (Hinweis, direkt behoben):** Sequencing WS1 vs. `plan.dir` (WS2) präzisiert –
  `<plan.dir>` wird erst mit WS2 wirksam, bis dahin `docs/plan`.
- **Fehlerfälle (Hinweis, direkt behoben):** State-Divergenz bei PR-Strategie (Zielbranch
  listet Plan bis Merge als offen) als bewusste, temporäre Konsequenz dokumentiert.

## Offene Punkte

- Keine offenen Punkte.
