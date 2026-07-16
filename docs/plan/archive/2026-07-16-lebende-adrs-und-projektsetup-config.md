# Lebende ADRs und Projektsetup-Config-ADR

**Planungsstatus:** Umgesetzt
**Quelle:** /firmo plan
**Empfohlener Workflow:** Feature (`/firmo build`)

## Anforderung

Firmo soll seine Architekturentscheidungen (ADRs) nicht mehr wie Pläne als
geordnete, nummerierte, immutable Dokumente führen, sondern als **lebende ADRs**:
mutable Dateien, die stets die aktuell gültigen Regeln bzw. Entscheidungen enthalten.

Als konkrete Anwendung dieses Modells wandert der gesamte Inhalt von
`.firmo/config.json` in eine einzige lebende ADR „Firmo project setup" (Default-Slug
`firmo-project-setup`). Weil Ort und Dateiname der ADR projektabhängig sind und Firmo
jederzeit schnellen Zugriff braucht, verweist eine kurze, kanonische Marker-Zeile
`**Firmo project setup:**` in `AGENTS.md` (oder einer vergleichbaren Konventionsdatei)
auf die Projektsetup-ADR. Die Config-Parameter
stehen dort mit minimaler Prosa als **Markdown-Tabelle**, damit der LLM-Kontext klein
bleibt.

Eine bestehende `.firmo/config.json` wird einmalig in die ADR migriert. Danach ist
`.firmo/` reines Laufzeit-Verzeichnis und wird **komplett** über `.gitignore`
ignoriert (kein `!.firmo/config.json`-Ausnahme-Pattern mehr).

Begründung der Workflow-Empfehlung: Es entsteht neue, beobachtbare Funktionalität
(lebendes ADR-Modell, Config-Quelle in Markdown, geänderter `.gitignore`-Sollzustand)
plus eine Migration. Das ist ein Feature-/Verhaltenswechsel, kein reines Refactoring,
und berührt viele Quelldateien koordiniert — daher `/firmo build`. Die Lieferung
erfolgt in einem Rutsch (im Plan-Review fixiert), mit einer Schrittfolge, die den
Build zwischenstufig grün hält.

## Architekturentscheidungen

- **Lebendes ADR-Modell (allgemein).** ADRs werden als mutable, nummernlose,
  slug-benannte Dokumente definiert, die den jeweils aktuellen Stand einer
  Entscheidung tragen. Ein `## Status`-Feld hält den aktuellen Zustand (z. B.
  `Aktiv`, `Abgelöst`, `Nicht umgesetzt`). Referenziert wird per Slug/Titel, nicht
  per Nummer. Dies wird in einem neuen geteilten Baustein `src/shared/adr-convention.md`
  zentral beschrieben und von den ADR-erzeugenden und -lesenden Tools eingebunden.
- **Rückwärts-Lese-Kompatibilität für nummerierte ADRs.** Vorhandene Alt-ADRs
  (`NNNN-*.md`, H1 `# NNNN — Titel`) bleiben lesbar und per Nummer auflösbar; es gibt
  **keine** verpflichtende Bulk-Umbenennung. Neue ADRs entstehen im lebenden
  Slug-Format. Das spiegelt Firmos etablierte Kompatibilitätslinie (Plan-Nummern per
  H1, `sf-`/`firmo-`-Labels).
- **Projektsetup-ADR als alleinige Config-Quelle.** Die getrackte Wahrheit für die
  Firmo-Konfiguration ist die lebende ADR (Default `docs/adr/firmo-project-setup.md`).
  Es gibt **keine** `.firmo/config.json` mehr — weder getrackt noch als abgeleitete
  gitignorte Datei. Tools lesen die Config aus der ADR.
- **Config-Serialisierung als flache Markdown-Tabelle.** Zwei Spalten
  `| Schlüssel | Wert |`, Verschachtelung über dotted keys, definierte Kodierung für
  Booleans, `null`, leere und gefüllte Listen. Eine eindeutige Encoding-Spezifikation
  ist Teil des Bausteins, damit Schreiber (`setup`, Migration) und Leser (alle Tools)
  identisch interpretieren.
- **Schlanke Consumer-Referenz (Anti-Bloat).** Die volle Spezifikation (Locator-
  Fallbacks, Encoding, Migration) lebt in **einem** Baustein, den nur `setup` und der
  Migrationspfad vollständig laden. Die ~30 config-lesenden Tools bekommen **keinen**
  Voll-Include, sondern nur einen kurzen Inline-Pointer („Firmo-Konfiguration aus der
  Projektsetup-ADR, Locator via AGENTS.md-Marker"). Das Lesen eines einzelnen Werts ist
  ein trivialer Zeilen-Lookup (Zeile mit dotted key → Wertzelle) und braucht die volle
  Encoding-Spezifikation nicht. Das wahrt Firmos dokumentiertes Lazy-Loading-/Anti-Bloat-
  Prinzip (siehe `AGENTS.md`, `src/SKILL.md`) und hält den DRY-Anspruch (eine Quelle),
  ohne jede Datei aufzublähen.
- **AGENTS.md-Marker als Locator.** Eine kanonische Zeile
  `**Firmo project setup:** <pfad>` in `AGENTS.md` (bzw. `CLAUDE.md`/vergleichbar) macht
  die ADR grep-bar auffindbar. Der Marker-Schlüssel ist bewusst englisch, passend zur
  cross-harness-englischen Führung von `AGENTS.md`. Der Default-ADR-Slug ist
  `firmo-project-setup`. Definierte Auflösungsreihenfolge mit Fallbacks garantiert
  Robustheit, auch wenn der Marker fehlt.
- **`.firmo/` komplett ignorieren.** Der `.gitignore`-Sollzustand wird von
  `.firmo/*` + `!.firmo/config.json` auf ein einzelnes `.firmo/` umgestellt.
  Laufzeit-Referenzen (`memory.json`, `cache.json`, `review/`, `.worktrees/`) bleiben
  unverändert bestehen.
- **Migration nur im git-berührenden Pfad.** Das eigentliche Anlegen der ADR, das
  Schreiben des AGENTS.md-Markers, die `.gitignore`-Umstellung und das **automatische
  Enttracken** von `.firmo/config.json` (`git rm --cached`, Datei-Inhalt auf Platte
  belassen) passieren ausschließlich in `/firmo setup` (interaktiv, git-mutierend). Der
  deterministische, nicht-blockierende Config-Lesepfad beliebiger Tools legt **nichts**
  an und berührt kein Git — er liest bei fehlender ADR ersatzweise eine noch vorhandene
  Alt-`config.json` und weist auf `/firmo setup` hin.

- **Lieferung in einem Rutsch.** Der gesamte Umbau (Config-ADR + Locator + `.gitignore`
  - Migration **und** allgemeiner lebender-ADR-/wontfix-Umbau) wird in einem `/firmo build`
    und einem PR geliefert. Bewusst gewählt trotz größerem Blast-Radius; die
    Umsetzungsschritte unten sind entsprechend so geordnet, dass der Build zwischenstufig
    grün bleibt.

- **Bewusste Abweichung vom `decision-records`-Skill.** Der Host-Skill
  `decision-records` (skills.sebastian-software.com) definiert ADRs als
  _immutabel-nach-accepted_, _nummeriert_, _eine-Entscheidung-pro-Record_ und _nur
  Rationale, keine Config-Werte_. Firmo weicht hier **bewusst** ab; die
  `adr-convention.md` ist für Firmo-erzeugte ADRs die maßgebliche Konvention und hat
  Vorrang. Begründung je Punkt:
  - _Mutabilität (lebend statt supersede-Kette):_ Firmo optimiert auf **kleinen,
    eindeutigen LLM-Lesekontext**. „Die aktuelle Datei = die Wahrheit" ist ein trivialer
    Read; eine Supersede-Historie zwänge jeden Leser, erst den gültigen Record aus einer
    Kette zu ermitteln — genau der Kontext-Overhead, den Firmo vermeidet.
  - _Config-Werte in der ADR:_ Für den eng umrissenen Fall „Projektsetup" ist die
    Kolokation von Wert + Kurzbegründung in **einer** getrackten, menschenlesbaren Quelle
    gewollt — nur so kann `.firmo/` komplett gitignored werden.
  - _Nummernlos/Slug + ein Bündel-Record:_ Slug-Referenzen sind stabil; die
    Locator-Auffindbarkeit (ein Marker → eine Datei) und der kleine Kontext wiegen hier
    schwerer als „eine Entscheidung pro Record".
  - _Koexistenz:_ Wo ein Projekt lieber das klassische `decision-records`-Modell fährt,
    kann es den Skill für Firmo-Agents/-Tools per `skills`-Config gezielt zu- oder
    abschalten; Firmos eigene ADR-Konvention bleibt davon unberührt. Diese Abweichung
    wird in `adr-convention.md` und im Developer-Guide explizit vermerkt.

## Betroffene Dateien

### Neu

| Datei                          | Beschreibung                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/adr-convention.md` | Lebendes ADR-Modell: Ort/Locator, Slug-Naming, Mutabilität, `## Status`-Semantik, Slug-Referenzierung, Rückwärts-Lese-Kompatibilität für Alt-Nummern. Enthält einen expliziten Abschnitt **„Abweichung vom `decision-records`-Skill"** mit den drei Divergenzpunkten und der Begründung (siehe Architekturentscheidung); benennt diese Konvention als maßgeblich für Firmo-erzeugte ADRs. |

### Geändert — Config-Quelle und `.firmo/`

| Datei                                                   | Beschreibung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/config-migration.md`                        | **Config-Source-Baustein** — bevorzugt in-place umschreiben (Include-Ziel-Name `config-migration` beibehalten, um Include-Churn zu vermeiden): Config-Locator + Auflösungsreihenfolge (AGENTS.md-Marker → Default-Pfad/Scan → Alt-`config.json` → Defaults), Tabellen-Encoding-Spezifikation, einmalige Migration `config.json` → Projektsetup-ADR. Alte In-Place-JSON-Konsolidierung entfällt. Eine Umbenennung (z. B. nach `firmo-config.md`) ist optional und nur zulässig, wenn **alle** ` ```include `-Fences atomar umgehängt werden (Build-Guard).                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/tools/setup.md`                                    | Schritt 1 auf einzelnes `.firmo/`-Ignore umstellen (inkl. Migration des Zwei-Zeilen-Patterns); Config in ADR-Tabelle schreiben statt `config.json`; ADR-Pfad ermitteln/erfragen (Default `docs/adr/`); AGENTS.md-Marker schreiben; „aktuelle Werte" aus der ADR lesen; Migrations-Rückfragen anpassen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ~30 Dateien mit `.firmo/config.json`-Config-Lesestellen | Config-Lesereferenz auf einen **schlanken Inline-Pointer** („Firmo-Konfiguration aus der Projektsetup-ADR") umstellen — **kein** Voll-Include (Anti-Bloat, siehe Architekturentscheidung). Laufzeit-`.firmo/`-Referenzen (`memory.json`, `cache.json`, `review/`, `.worktrees/`) unangetastet lassen. Betroffen u. a.: `src/shared/skill-discovery.md`, `src/shared/worktree-integration.md`, `src/shared/issue-tracker.md`, `src/shared/plan-numbering.md`, `src/shared/plan-status.md`, `src/shared/doc-categories.md`, `src/shared/apply-source-detection.md`, `src/tools/plan.md`, `src/tools/review.md`, `src/tools/apply-review.md`, `src/tools/apply-review-remote.md`, `src/tools/build.md`, `src/tools/fix.md`, `src/tools/refactor.md`, `src/tools/docs.md`, `src/tools/maintain.md`, `src/tools/open-plans.md`, `src/tools/plan-issue.md`, `src/tools/investigate.md`, `src/tools/commit.md`, `src/tools/pr.md`, `src/agents/code-validator.md`. |

### Geändert — lebendes ADR-Modell und wontfix-ADRs

| Datei                                                             | Beschreibung                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/apply-review.md`                                       | Phase 3 „ADR-Erstellung": statt nächster freier Nummer eine lebende, slug-benannte ADR anlegen/aktualisieren; Statusmeldung und Report-Rückverweis per Slug.                                                                                                                                        |
| `src/tools/apply-review-remote.md`                                | Phase 3 remote: wontfix-ADR als lebende Slug-ADR; Epic-/Issue-Abhaken mit Slug-Referenz statt `(ADR <Nummer>)`.                                                                                                                                                                                     |
| `src/shared/unresolved-review-report.md`                          | Status-Format `Nicht umgesetzt (ADR XXX)` → Slug-Referenz (z. B. `Nicht umgesetzt (ADR: <slug>)`).                                                                                                                                                                                                  |
| `src/shared/issue-tracker.md`                                     | Abhak-Konvention `- [x] … — nicht umgesetzt (ADR <Nummer>)` → Slug-Referenz; `wontfix`-Beschreibung anpassen.                                                                                                                                                                                       |
| `src/tools/build.md`, `src/tools/fix.md`, `src/tools/refactor.md` | ADR-Referenzhinweise bei bewusster Nicht-Umsetzung auf Slug-Referenz umstellen; unveränderte Regel „legen selbst kein ADR an" bleibt.                                                                                                                                                               |
| `src/tools/review.md`                                             | Phase 2a ADR-Quelle: Format-agnostisch bestätigen; Hinweis, dass ADRs lebend/slug sein können; Such-Globs unverändert. Die Projektsetup-ADR (Config, bekannter Slug `firmo-project-setup`) von der Designentscheidungs-Sammlung **ausnehmen** — sie ist Konfiguration, keine Architekturbegründung. |
| `AGENTS.md` (Zielprojekt-Verhalten)                               | Verhalten dokumentieren: Firmo schreibt/liest den `**Firmo project setup:**`-Marker. Für dieses Repo selbst geschieht das bei der Eigen-Migration durch `setup`.                                                                                                                                    |
| `docs/developer-guide/`                                           | Doku der neuen Config-Quelle und des lebenden ADR-Modells aktualisieren (Doku-Phase des Build bzw. Folge-Doku).                                                                                                                                                                                     |

### Vermutlich unverändert

| Datei       | Beschreibung                                                                                                                                                                                                                                 |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build.mjs` | Neue Bausteine sind `include`-Ziele (automatisch aufgelöst); kein neues Tool, keine `TOOL_GROUPS`/`EXPOSED_TOOLS`-Änderung; Config-Schema in `setup.md` bleibt Prosa. In Phase 1 der Umsetzung verifizieren, dass keine Guard betroffen ist. |

## Implementierungsdetails

### Vorgehen

1. `src/shared/adr-convention.md` schreiben: lebendes ADR-Modell allgemein.
2. `src/shared/config-migration.md` zum **Config-Source-Baustein** umschreiben (Locator,
   Auflösungsreihenfolge, Tabellen-Encoding, Migration), Include-Ziel-Name beibehalten.
   **Build-Guard beachten:** Eine optionale Umbenennung erfordert atomares Umhängen
   **aller** ` ```include config-migration `-Fences im selben Schritt, sonst schlägt der
   Guard „include target missing" fehl — daher bevorzugt in-place umschreiben.
3. `setup.md` überarbeiten (`.gitignore`, ADR-Schreiben, Pfad-Ermittlung,
   AGENTS.md-Marker, Migration, Anzeige aktueller Werte).
4. wontfix-ADR-Pfad in `apply-review.md` und `apply-review-remote.md` auf lebende
   Slug-ADRs umstellen; abhängige Referenzen in `issue-tracker.md`,
   `unresolved-review-report.md`, `build.md`, `fix.md`, `refactor.md` nachziehen.
5. Config-Lesestellen projektweit auf den schlanken Inline-Pointer umbiegen (Sweep über
   die ~30 Dateien); Laufzeit-`.firmo/`-Referenzen bewusst auslassen.
6. `node build.mjs` nach **jedem** Schritt grün halten; abschließend `pnpm agent:check`
   (oxfmt) sauber.
7. Doku im Developer-Guide aktualisieren.

### Tabellen-Encoding (Kern-Spezifikation)

Kanonische Kodierung für die Config-Tabelle in der Projektsetup-ADR, verbindlich für
Schreiber und Leser (im Config-Source-Baustein `config-migration.md` ausformuliert):

- Boolean → `true` / `false`
- String → literal, unquoted (z. B. `focused`, `origin/main`)
- `null` (semantisch „beim Lauf fragen", z. B. `applyReview.defaultCommitStrategy`) →
  Literal-Token `null`
- Leere Liste → `(leer)`
- Gefüllte Liste → kommagetrennt (z. B. `humanizer, distill`)
- Verschachtelung → dotted keys (z. B. `applyReview.worktree.baseDir`,
  `skills.agents.ui-implementer.include`); leeres Objekt = keine Unterzeilen
- **Fehlende Zeile = Schlüssel nicht gesetzt → Default des Quell-Skills.** Bewusst
  verschieden von einer vorhandenen Zeile mit Wert `null` (expliziter Wert, semantisch
  „beim Lauf fragen"). Beispiel: keine `delivery.completion`-Zeile → Default `merge`;
  eine `delivery.completion | null`-Zeile → beim Lauf fragen.

Beispiel-Ausschnitt (Schnittstellenskizze, kein vollständiger Inhalt):

```markdown
## Konfiguration

| Schlüssel | Wert |
|---|---|
| review.profile | focused |
| applyReview.defaultCommitStrategy | null |
| skills.exclude | (leer) |
| worktree.enabled | true |
```

### Auflösungsreihenfolge (Config-Locator)

1. Marker `**Firmo project setup:** <pfad>` in `AGENTS.md`, dann `CLAUDE.md`/vergleichbar
   → ADR unter `<pfad>` lesen.
2. Sonst Default `docs/adr/firmo-project-setup.md` bzw. Scan des erkannten ADR-Verzeichnisses.
3. Sonst — Übergangs-Kompatibilität — vorhandene `.firmo/config.json` lesen und auf
   `/firmo setup` hinweisen (kein Anlegen, kein Git).
4. Sonst eingebaute Defaults.

### ADR-Verzeichnis bestimmen (setup)

- Vorhandene ADR-Konvention erkennen (in Anlehnung an die Such-Globs von `review`:
  `docs/adr/`, `docs/decisions/`, `adr/`). Vorhandenes Verzeichnis nutzen.
- Sonst Default `docs/adr/`. Bei Unklarheit im geführten Weg per `ask`-Fence erfragen.

### AGENTS.md-Marker-Handhabung (setup)

- Vorhandene `AGENTS.md` bevorzugen; sonst `CLAUDE.md`, falls vorhanden; sonst minimale
  `AGENTS.md` mit dem Marker anlegen (bzw. erfragen).
- Marker nicht-destruktiv setzen/aktualisieren; übrigen Inhalt unangetastet lassen.

### Migration `.firmo/config.json` → Projektsetup-ADR (setup)

- ADR aus dem aktuellen Config-Inhalt erzeugen (Tabelle gemäß Encoding).
- AGENTS.md-Marker schreiben.
- `.gitignore` auf einzelnes `.firmo/` umstellen (Zwei-Zeilen-Pattern und Alt-Patterns
  `.firmo/`, `/.firmo/`, `.sf-plugin/` migrieren).
- `.firmo/config.json` automatisch enttracken (`git rm --cached`); Datei-Inhalt auf
  Platte belassen (Firmos Non-Destruktiv-Linie), Aufräumen dem User überlassen. Ist das
  Projekt kein Git-Repo oder die Datei ungetrackt, den Schritt überspringen und melden.
  Hinweis: `git rm --cached` **staged** eine Index-Änderung, erstellt aber **keinen**
  Commit — Setups Regel „erstellt keine Commits" bleibt gewahrt. In der
  Abschluss-Zusammenfassung erwähnen, dass eine gestagte Entfernung vorliegt.
- Abschluss in `.firmo/memory.json` markieren (idempotent).

### Edge Cases

- **Kein `AGENTS.md` und kein `CLAUDE.md`.** setup legt minimale `AGENTS.md` mit Marker
  an oder erfragt es; der Locator fällt sonst auf Default-Pfad/Scan zurück.
- **ADR fehlt, aber Alt-`config.json` vorhanden.** Übergangs-Lesen aus `config.json` +
  Hinweis; keine stille Neuanlage außerhalb von `setup`.
- **Toter/veralteter Marker-Pfad.** Zeigt der AGENTS.md-Marker auf einen Pfad, unter dem
  keine ADR liegt, nicht dort stehenbleiben, sondern in der Auflösungsreihenfolge auf
  Default-Pfad/Scan weiterfallen und den veralteten Marker melden (in `setup` korrigieren).
- **Mehrere ADR-Verzeichnisse.** Existieren mehrere (`docs/adr/`, `docs/decisions/`,
  `adr/`), für die Projektsetup-ADR `docs/adr/` bevorzugen; bei echter Mehrdeutigkeit im
  geführten `setup` per `ask`-Fence erfragen, sonst Default.
- **Ungültige/mehrdeutige Tabelle** (fehlender Schlüssel, unbekanntes Encoding). Sicheren
  Default für den Lauf verwenden, User über Schlüssel informieren, nicht raten — analog
  zur bisherigen Config-Sicherheitsregel.
- **Projekt ist kein Git-Repo.** `.gitignore` wirkungslos; Hinweis wie bisher; ADR und
  Marker trotzdem schreibbar.
- **Vorhandene nummerierte Alt-ADRs.** Bleiben lesbar/auflösbar; nicht umbenennen.
- **Nebenläufiges Schreiben.** Datei direkt vor dem Schreiben frisch einlesen.

## Akzeptanzkriterien

- [ ] `node build.mjs` läuft fehlerfrei und `pnpm agent:check` (oxfmt) ist sauber.
- [ ] Es existiert ein Baustein, der ADRs als lebend/nummernlos/slug-benannt definiert,
      inklusive Rückwärts-Lese-Kompatibilität für nummerierte Alt-ADRs.
- [ ] Es existiert eine eindeutige Tabellen-Encoding-Spezifikation, die alle heutigen
      Config-Typen abdeckt (Boolean, String, `null`, leere/gefüllte Liste, dotted keys).
- [ ] Der Config-Locator ist mit vollständiger Auflösungsreihenfolge (AGENTS.md-Marker →
      Default/Scan → Alt-`config.json` → Defaults) beschrieben.
- [ ] `setup` stellt den `.gitignore`-Sollzustand auf ein einzelnes `.firmo/` her
      (inkl. Migration des Zwei-Zeilen-Patterns) und schreibt Config als ADR-Tabelle
      plus AGENTS.md-Marker; kein `!.firmo/config.json` bleibt zurück.
- [ ] Der wontfix-ADR-Pfad (`apply-review`, `apply-review-remote`) erzeugt lebende
      Slug-ADRs; alle `(ADR <Nummer>)`-Referenzen in Reports/Issue-Tracker/Workflows
      sind auf Slug-Referenzen umgestellt.
- [ ] Keine Firmo-Anweisung liest Config mehr aus `.firmo/config.json` als primäre
      Quelle; Laufzeit-`.firmo/`-Referenzen (memory/cache/review/worktrees) bleiben intakt.
- [ ] Eine Migration `.firmo/config.json` → Projektsetup-ADR ist im setup-Pfad
      beschrieben und idempotent markiert; die Alt-`config.json` wird dabei automatisch
      per `git rm --cached` enttrackt (Inhalt auf Platte belassen).
- [ ] Der Locator-Marker `**Firmo project setup:**` und der Default-Slug
      `firmo-project-setup` werden konsistent in Baustein, `setup` und Doku verwendet.

## Validierungsplan

- `node build.mjs` und `pnpm agent:check` als Kern-Gate (es gibt keine Testsuite).
- Grep-Prüfungen: keine verbliebene primäre Config-Lesestelle auf `.firmo/config.json`;
  kein `!.firmo/config.json` in generierten `setup`-Anweisungen; keine `(ADR <Nummer>)`-
  Referenzen mehr im wontfix-Pfad.
- Manuelle Durchsicht der generierten `dist/claude/` und `dist/codex/` Ausgaben für
  `setup`, `apply-review`, den Config-Source-Baustein und `adr-convention` auf konsistente
  Platzhalter-Auflösung (`{{SKILL:…}}`, `{{AGENT:…}}`, `include`).
- Trockendurchlauf der Migrationslogik gedanklich gegen die reale `.firmo/config.json`
  dieses Repos (verschachtelte `applyReview.worktree.*`, leere `skills`-Listen,
  `applyReview.defaultCommitStrategy: null`).

## Annahmen und offene Punkte

- **Annahme:** Neue Bausteine erfordern keine `build.mjs`-Änderung (nur `include`-Ziele);
  in Umsetzungs-Phase 1 zu verifizieren.
- **Annahme:** Markersprache Deutsch (Config `plan.markerLanguage: de`, bestehende Pläne
  deutsch).
- **Fixiert (Plan-Review):** Lieferung in einem Rutsch (ein `/firmo build`, ein PR);
  automatisches Enttracken der Alt-`config.json` per `git rm --cached`; Locator-Marker
  `**Firmo project setup:**` und Default-Slug `firmo-project-setup`.
- **Nachgelagert (orthogonal, nicht Teil dieses Plans):** In `docs/plan/` liegen ~69
  `NNNN-*.md` im Altformat, die neuesten Pläne bereits im Datumsformat. Die
  Firmo-Plan-Konvention sieht eine Bulk-Umbenennung `NNNN → Datum` vor; sie wurde bewusst
  **nicht** ausgeführt (disproportional, `git mv` über 69 Dateien, Maintainer hat sie
  sichtbar belassen). Separat zu entscheiden, ob/wann diese Migration gefahren wird —
  berührt diesen Plan nicht.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       1 |       1 |
| Security    |        0 |       0 |       0 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       0 |       4 |
| Testbarkeit |        0 |       0 |       0 |
| Scope       |        0 |       1 |       0 |
| Wartbarkeit |        0 |       0 |       2 |

### Befunde

Erste Runde (interner + vertiefter Review):

- **Scope (Wichtig, eingearbeitet):** „Alle ADRs lebend" zieht den wontfix-ADR-Umbau
  samt Referenz-Migration in den Scope — der größte Risiko-/Aufwandstreiber. Im
  vertieften Review entschieden: Lieferung in einem Rutsch (ein PR). Die Vorgehens-
  Reihenfolge ist so gewählt, dass der Build zwischenstufig grün bleibt; das mindert
  das Blast-Radius-Risiko, ohne den Scope zu splitten.
- **Architektur (Wichtig, entschieden):** Konsistenz-Abgleich mit dem Host-Skill
  `decision-records` ergab drei Divergenzen — Mutabilität (lebend vs. immutabel+supersede),
  Config-Werte in der ADR (vs. „nur Rationale") und nummernlos/Bündel-Record (vs.
  nummeriert/eine-Entscheidung-pro-Record). Entscheidung des Maintainers: **bewusst
  abweichen**; Firmos `adr-convention.md` ist maßgeblich. Begründung und Koexistenz-Regel
  sind als Architekturentscheidung „Bewusste Abweichung vom `decision-records`-Skill"
  eingearbeitet. (Der Skill teilt weiterhin die „keine privaten Dot-Folder"-Linie — die
  erfüllt der Plan.)
- **Fehlerfälle (Hinweis):** Die Tabellen-Encoding-Spezifikation ist der neuralgische
  Punkt (nummernlose ADR-Referenzen und dotted-key/Listen-Parsing). Sie muss vor den
  Consumer-Umbauten stehen und mit realen Config-Werten dieses Repos gegengeprüft werden.
- **Wartbarkeit (Hinweis, eingearbeitet):** Der ~30-Dateien-Sweep läuft jetzt über einen
  schlanken Inline-Pointer + eine einzige Baustein-Quelle (Architekturentscheidung),
  nicht per dupliziertem Prosa-Text — DRY ohne Kontext-Bloat.

Zweite Runde (`/firmo review` des Plans, alle direkt eingearbeitet):

- **Scope/Logik (eingearbeitet):** Veralteter Verweis „Lieferung in Stufen möglich" in
  der Anforderung auf die getroffene Ein-Rutsch-Entscheidung korrigiert.
- **Architektur (Hinweis, eingearbeitet):** Anti-Bloat-Architekturentscheidung ergänzt:
  Consumer bekommen einen kurzen Inline-Pointer, kein Voll-Include; Leser machen triviale
  Zeilen-Lookups.
- **Fehlerfälle (Hinweis, eingearbeitet):** Build-Guard-Reihenfolge fixiert — Umbenennen/
  Entfernen eines `include`-Ziels erfordert atomares Umhängen aller Includer, sonst bricht
  „include target missing"; Empfehlung, Ziel-Namen wiederzuverwenden.
- **Fehlerfälle (Hinweis, eingearbeitet):** Encoding um „fehlende Zeile = Schlüssel nicht
  gesetzt → Default" ergänzt, klar abgegrenzt gegen explizites `null`.
- **Fehlerfälle (Hinweis, eingearbeitet):** Zwei Edge Cases ergänzt — toter Marker-Pfad
  fällt auf Default/Scan weiter; mehrere ADR-Verzeichnisse mit `docs/adr/`-Tie-Break.
- **Architektur (Hinweis, eingearbeitet):** Explizit gemacht, dass `git rm --cached` eine
  Index-Änderung staged, aber keinen Commit erzeugt (Setup-Regel gewahrt).

Dritte Runde (erneuter `/firmo review`, alle direkt eingearbeitet):

- **Wartbarkeit (Hinweis, eingearbeitet):** Interne Inkonsistenz behoben — statt einer
  neuen `firmo-config.md` plus geänderter `config-migration.md` wird der bestehende
  Baustein `config-migration.md` in-place zum Config-Source-Baustein umgeschrieben
  (Include-Ziel-Name bleibt); Rename nur optional mit atomarem Umhängen. Beseitigt den
  Widerspruch zwischen „Neu"-Tabelle und Vorgehen und das Build-Guard-Risiko.
- **Fehlerfälle (Hinweis, eingearbeitet):** `review` nimmt die Projektsetup-Config-ADR
  (Slug `firmo-project-setup`) von der Designentscheidungs-Sammlung aus — Config-Werte
  sind keine Architekturbegründungen.

## Offene Punkte

- Keine offenen Punkte.

## Testergebnisse

**Datum:** 2026-07-16

- `node build.mjs`: fehlerfrei (15 Tools + 6 intern, 13 Agents, Claude + Codex).
- `pnpm agent:check` (oxfmt --check): sauber, alle 171 Dateien korrekt formatiert.
- `pnpm test` (`node --test`, `test/build-lib.test.mjs`): 29/29 bestanden, 0 Fehler.
- Konsistenz-Greps: keine primäre Config-Lesestelle mehr auf `.firmo/config.json`
  (verbleibende Treffer nur in Transition/Legacy: `setup.md`, `config-migration.md`,
  `firmo-dir-migration.md`); keine nummerierten `(ADR <Nummer>)`-Referenzen; `.gitignore`-
  Soll-Zustand einzelnes `.firmo/` auch im generierten `dist/`.

## Review-Findings

**Datum:** 2026-07-16
**Reviewer:** unabhängiger Review-Agent (Instruktions-/Konsistenz-Review gegen die Akzeptanzkriterien)

### Zusammenfassung

| Status                  | Anzahl |
| ----------------------- | -----: |
| Behoben                 |      3 |
| Offen / Nicht umgesetzt |      0 |

Alle 9 Akzeptanzkriterien als erfüllt bestätigt. Behoben: (1) **Wichtig** —
`src/shared/firmo-dir-migration.md` nannte noch den alten `.gitignore`-Soll-Zustand
(`.firmo/*` + `!.firmo/config.json`) und schleppte den Widerspruch über 5 inlinete Tools
ins `dist/`; auf einzelnes `.firmo/` korrigiert. (2)+(3) **Hinweis** — verschachtelte
Klammern aus dem Config-Sweep (`doc-categories.md`, `unresolved-review-report.md`,
`AGENTS.md`) geglättet. Keine offenen oder ausgelagerten Findings; kein externer
Review-Report nötig.
