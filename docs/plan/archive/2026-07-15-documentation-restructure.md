# Dokumentation neu strukturieren: Marketing-README, Benutzer- und Entwicklerdoku

**Planungsstatus:** Umgesetzt
**Quelle:** /firmo plan
**Empfohlener Workflow:** Dokumentation (`/firmo docs`)
**Doku-Kategorie:** user-guide
**Ziel-Pfad:** docs/user-guide/README.md

## Anforderung

Die heutige `README.md` vermischt drei Zielgruppen: **Marketing** (Konzept, Pitch),
**Anleitung** (Installation, Aufruf) und **Technik** (Build, Plan-Konventionen,
Goal-Steuerung, Worktree, Konfiguration, Struktur, Frontmatter). Das soll sauber getrennt
werden:

1. **`README.md`** wird ein **reiner Marketing-Einstieg** (plus Mini-Quickstart) und
   verweist auf die Benutzerdokumentation.
2. **Benutzerdokumentation** unter `docs/user-guide/`: ein „Getting Started" für die übliche
   Nutzung **und** eine ausführliche, nach Intent gruppierte Tool-Referenz, ergänzt um
   Guides zu Konfiguration, Worktree/Delivery, Remote-Tracker und Skill-Discovery sowie
   Troubleshooting/FAQ und ein Glossar.
3. **Technische Dokumentation** getrennt unter `docs/developer-guide/` (Architektur,
   Build-System, Plan-Konventionen, Release/Installation). `AGENTS.md` bleibt die
   **kanonische** Quelle für Agent-Verhaltensregeln; die Developer-Guide-Dokumente
   verweisen darauf, statt zu duplizieren.

Begründung der Workflow-Empfehlung: Es werden ausschließlich Dokumente erstellt/umgeschrieben,
ohne Produkt- oder Codeverhalten zu ändern → **Dokumentation (`/firmo docs`)**.

### Doku-Kategorie und Multi-Kategorie-Hinweis

Der Kopf nennt die **primäre** Kategorie `user-guide` (Hauptdeliverable) mit Ziel-Pfad
`docs/user-guide/README.md`. Dieser Plan spannt **bewusst** über mehrere Ziele: die
Top-Level-`README.md` (ausdrücklich in „Betroffene Dateien" genannt, daher gemäß
Doku-Schreibgrenze änderbar) und die Kategorie `developer-guide`. Die vollständige
Zielmenge steht in „Betroffene Dateien".

## Architekturentscheidungen

- **Drei Zielgruppen, drei Orte:** Marketing (`README.md`), End-User (`docs/user-guide/`),
  Projekt-Entwickler (`docs/developer-guide/`). Trennung entlang der bestehenden
  Firmo-Doku-Kategorien (`src/shared/doc-categories.md`).
- **Tool-Referenz nach Intent gruppiert** (Entscheidung): fünf Dokumente entlang der
  Router-Gruppen aus `src/SKILL.md` (Verstehen, Umsetzen, Qualität, Einbringen, Einrichten).
  Das spiegelt die Nutzer-Mentalmodelle und den Router-Katalog wider und hält die Pflege
  überschaubarer als 15 Einzeldateien.
- **`AGENTS.md` bleibt kanonisch, developer-guide fasst zusammen + verlinkt** (Entscheidung):
  Agent-Verhaltensregeln, Build-Guards, Commit-/No-AI-Attribution-Regeln bleiben dort die
  Wahrheit. Inhalte, die `AGENTS.md` bereits kanonisch abdeckt (Platzhalter-/Direktiven-Syntax,
  Guards, „Tool/Agent hinzufügen"), werden im `developer-guide` **kurz zusammengefasst und
  auf `AGENTS.md` verlinkt** — **nicht** voll dupliziert. Nur README-exklusive Architektur-/
  Übersichts-Prosa wird vollständig nach `developer-guide` überführt. Das vermeidet doppelte
  Pflege und den Konflikt „überführen vs. nicht duplizieren".
- **README als Marketing + Mini-Quickstart, Deutsch** (Entscheidung): Pitch/Nutzen, eine
  knappe Installations-/Erststart-Zeile, dann Verweise in die Benutzerdoku. Sprache Deutsch
  (Projektregel, Status quo; Benutzerdoku ebenfalls deutsch).
- **Inhalt wandert, entsteht nicht neu:** README-exklusive technische Abschnitte werden nach
  `developer-guide` **überführt und auf Stand 1.45.0 aktualisiert** (siehe „Veraltete Inhalte"
  unten); AGENTS.md-Überschneidungen werden dort nur zusammengefasst + verlinkt. Die bereits
  archivierten `docs/plan/archive/naming.md` und `docs/plan/archive/skill-migration-notes.md`
  dienen als Quellmaterial und bleiben im Archiv.
- **Eine Restrukturierung, ein Umsetzungslauf** (Entscheidung): Der gesamte Plan wird in
  **einem** `/firmo docs`-Lauf umgesetzt (ein Deliverable, ein PR), trotz Multi-Kategorie-Scope.
- **Ton:** Deutsch. Für die Marketing-README werden bei der
  Umsetzung die Skills `copywriting`/`marketing-psychology` und `effective-german-typography-skill`
  herangezogen; für die technischen/prosaigen Texte `humanizer`/`copy-editing` (soweit im
  Zielumfeld verfügbar — Skill-Discovery entscheidet zur Laufzeit).

### Veraltete Inhalte, die bei der Migration korrigiert werden müssen

- Das Agent-Frontmatter-Beispiel in `README.md` zeigt noch ein statisches
  `skills:`-Preload. Seit 1.45.0 gibt es **kein** solches Preload mehr; stattdessen
  `## Empfohlene Skills`-Prosa plus dynamische Skill-Discovery. Die neue Developer-Guide-Doku
  muss den 1.45.0-Stand beschreiben.
- Der README-Konfigurationsblock nennt `worktree.enabled` Default `false` und kein
  `delivery`/`skills`-Schema. Der aktuelle Stand (konsolidiertes `delivery`, `skills`-Block,
  Worktree-Default) gemäß `src/tools/setup.md`/`src/shared/config-migration.md` ist maßgeblich.
- Aussagen zur Plan-Nummerierung (`NNNN`-Schema) sind veraltet; aktuell gilt das
  ISO-Datums-Slug-Schema mit Archiv (`src/tools/plan.md`).

## Betroffene Dateien

| Datei                                              | Beschreibung                                                                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `README.md`                                        | **Umschreiben** zu reinem Marketing-Einstieg + Mini-Quickstart + Verweisen; technische Abschnitte entfernt (wandern nach `developer-guide`).                                   |
| `docs/user-guide/README.md`                        | **Neu.** Kuratierter Einstieg mit empfohlener Lese-Reihenfolge (Pflicht-Index der Kategorie).                                                                                  |
| `docs/user-guide/getting-started.md`               | **Neu.** Installation, Erststart, typischer Flow (`plan` → `build` → PR) plus kurze Rezepte.                                                                                   |
| `docs/user-guide/tools-verstehen.md`               | **Neu.** `investigate`, `plan`, `open-plans`, `plan-issue`.                                                                                                                    |
| `docs/user-guide/tools-umsetzen.md`                | **Neu.** `apply`, `build`, `fix`, `refactor`, `docs`, `maintain`.                                                                                                              |
| `docs/user-guide/tools-qualitaet.md`               | **Neu.** `review`.                                                                                                                                                             |
| `docs/user-guide/tools-einbringen.md`              | **Neu.** `commit`, `pr`.                                                                                                                                                       |
| `docs/user-guide/tools-einrichten.md`              | **Neu.** `setup`, `version`.                                                                                                                                                   |
| `docs/user-guide/konfiguration.md`                 | **Neu.** Vollständige `.firmo/config.json`-Referenz (review, applyReview, plan, delivery, worktree, tracker, **skills**) + `setup`-Wizard.                                     |
| `docs/user-guide/worktree-und-delivery.md`         | **Neu.** Liefer-Branch, Worktree, PR/Merge/Branch-Abschluss.                                                                                                                   |
| `docs/user-guide/remote-tracker.md`                | **Neu.** Remote-Issue-Modus (GitHub `gh` / Forgejo `tea`), Labels, lokaler vs. Remote-Modus.                                                                                   |
| `docs/user-guide/skill-discovery.md`               | **Neu.** Wie Firmo Host-Skills nutzt (Empfehlungen, Fallback) und wie man sie per `skills`-Config steuert (global/per-Agent/per-Tool).                                         |
| `docs/user-guide/troubleshooting.md`               | **Neu.** FAQ und häufige Probleme (fehlendes `gh`/`tea`, Worktree-Konflikte, Klärungs-Gate, Marker-Sprache).                                                                   |
| `docs/user-guide/glossar.md`                       | **Neu.** Begriffe: Tool, Agent, Plan, Worktree, Delivery, Finding, Klärungs-Gate, Goal-Steuerung, Skill-Discovery.                                                             |
| `docs/developer-guide/architektur.md`              | **Neu.** Source-to-dist-Modell, dünner Router + Lazy-Loading, `tools/`/`agents/`/`shared/`, Zwei-Harness-Split; verweist auf `AGENTS.md`.                                      |
| `docs/developer-guide/build-system.md`             | **Neu.** `build.mjs`, Platzhalter-/Direktiven-Syntax (`{{SKILL}}`/`{{AGENT}}`/`{{VERSION}}`, `include`/`ask`-Fences), Guards, Tool/Agent hinzufügen; verweist auf `AGENTS.md`. |
| `docs/developer-guide/plan-konventionen.md`        | **Neu.** Plan-Datei-Namensschema (ISO-Datum-Slug), Statusmarker, Archiv, Doku-Kategorien.                                                                                      |
| `docs/developer-guide/release-und-installation.md` | **Neu.** release-please, `install-skill.sh`/`local-link.sh`, Versionsstempel/Drift-Guard.                                                                                      |
| `AGENTS.md`                                        | **Nicht ändern** in diesem Plan (bleibt kanonisch). Nur als Verweisziel referenziert. Aufnahme in diese Tabelle dient der Klarstellung, nicht der Änderung.                    |

## Implementierungsdetails

### Vorgehen

1. **README.md** auf Marketing + Mini-Quickstart reduzieren: Pitch (kompletter
   SE-Workflow als Tools, ein Skill, zwei Harnesses, Lazy-Loading), Nutzenpunkte, eine
   knappe Install-/Erststart-Zeile, dann klare Verweise nach `docs/user-guide/README.md`
   (Nutzung) und `docs/developer-guide/architektur.md` (Technik). Marketing-Ton, deutsche
   Typografie.
2. **`docs/user-guide/README.md`** als Index mit empfohlener Lese-Reihenfolge anlegen
   (Getting Started → Tool-Referenz → Guides → Troubleshooting/Glossar).
3. **Getting Started** schreiben: Installation (aus `install-skill.sh`), erster Aufruf,
   der typische Ende-zu-Ende-Flow (`/firmo plan` → `/firmo build` → PR), 2–3 kurze Rezepte.
4. **Tool-Referenz (5 Dokumente)** entlang der Router-Gruppen; je Tool: Zweck, wann nutzen,
   typischer Aufruf, Ein-/Ausgaben, Zusammenspiel mit anderen Tools. Quellen: die
   `catalogHint`- und Ziel-Beschreibungen der Tools unter `src/tools/*`.
5. **Guides** (Konfiguration, Worktree/Delivery, Remote-Tracker, Skill-Discovery) aus den
   maßgeblichen Quellen ableiten: `src/tools/setup.md`, `src/shared/config-migration.md`,
   `src/shared/worktree-integration.md`, `src/shared/issue-tracker.md`,
   `src/shared/skill-discovery.md`.
6. **Troubleshooting/FAQ** und **Glossar** aus den wiederkehrenden Fehler-/Begriffsmustern
   der Tools zusammentragen.
7. **Developer-Guide (4 Dokumente)**: technische README-Abschnitte überführen und auf
   1.45.0 aktualisieren; wo `AGENTS.md` bereits kanonisch ist, verlinken statt duplizieren.
8. **Querverweise** setzen: README → user-guide/developer-guide; user-guide-Index →
   alle Unterdokumente; Guides ↔ Konfiguration; developer-guide → `AGENTS.md`.
9. Keine toten Links; jeder genannte Pfad existiert nach der Umsetzung.

### Namens- und Verzeichnisregeln

- Alle user-guide-/developer-guide-Slugs sind kebab-case, `.md`, innerhalb ihrer Kategorie
  eindeutig (gemäß `Doku-Kategorien`).
- `docs/user-guide/README.md` ist Pflicht-Einstieg der Kategorie. `developer-guide` hat
  konventionsgemäß **keine** README.
- Leere Kategorie-Verzeichnisse werden nicht vorab angelegt; sie entstehen mit dem ersten
  Dokument.

### Edge Cases

- **Top-Level-README außerhalb der Kategorien:** Nur zulässig, weil `README.md` ausdrücklich
  in „Betroffene Dateien" steht (Doku-Schreibgrenze).
- **Überschneidung Konfig-Guide ↔ Worktree-/Tracker-Guide:** `konfiguration.md` ist die
  Schlüssel-Referenz; die Guides erklären die Nutzung. Doppelinhalt vermeiden, gegenseitig
  verlinken.
- **Veraltete Quellinhalte:** README-Technik nicht 1:1 übernehmen (skills-Preload, NNNN,
  worktree-Default) — auf 1.45.0 aktualisieren.
- **Sprachkonsistenz:** durchgängig Deutsch; englische Fachbegriffe (Tool, Agent, Worktree,
  Pull-Request) beibehalten, aber im Glossar erklären.

## Akzeptanzkriterien

- [ ] `README.md` enthält nur noch Marketing + Mini-Quickstart + Verweise; **keine**
      technischen Abschnitte (Build, Struktur, Frontmatter, Konfig-Schema) mehr und keinen
      veralteten `skills:`-Preload-Verweis.
- [ ] `docs/user-guide/README.md` existiert als Index mit Lese-Reihenfolge und verlinkt alle
      user-guide-Dokumente.
- [ ] `docs/user-guide/getting-started.md` beschreibt Installation, Erststart und den
      typischen `plan`→`build`→PR-Flow.
- [ ] Die Tool-Referenz deckt **alle 15 Tools** in fünf intent-gruppierten Dokumenten ab.
- [ ] Je ein Guide für Konfiguration, Worktree/Delivery, Remote-Tracker und Skill-Discovery
      existiert; plus `troubleshooting.md` und `glossar.md`.
- [ ] `docs/developer-guide/` enthält `architektur.md`, `build-system.md`,
      `plan-konventionen.md`, `release-und-installation.md`; alle verweisen auf `AGENTS.md`
      statt dessen Regeln zu duplizieren und spiegeln den Stand 1.45.0.
- [ ] Alle internen Querverweise/Links sind gültig (kein toter Link); `AGENTS.md` bleibt
      inhaltlich unverändert.
- [ ] Alle neuen/geänderten Dateien sind deutschsprachig und mit `pnpm agent:check` (oxfmt)
      formatkonform.

## Validierungsplan

- Manuelle Sichtprüfung: `README.md` enthält keine der migrierten Technik-Abschnitte mehr
  (grep nach „## Build", „## Struktur", „## Source-Frontmatter", „skills: [").
- Link-Check: jeder relative Link in den neuen Dokumenten zeigt auf eine existierende Datei
  (z. B. per einfachem grep/Skript über `docs/`); insbesondere README → user-guide/developer-guide.
- Vollständigkeitscheck Tool-Referenz: alle 15 Tool-Namen kommen in genau einem
  Referenz-Dokument vor.
- `pnpm agent:check` (oxfmt) ohne Findings über die geänderten Markdown-Dateien.
- Gegenprüfung 1.45.0-Aktualität: kein `skills:`-Preload, kein `NNNN`-Plan-Schema, korrektes
  `delivery`/`skills`-Config-Schema in der neuen Doku.

## Annahmen

- **Annahme:** `AGENTS.md` bleibt in Englisch (bewusste cross-harness-Ausnahme) und
  unverändert; die Developer-Guide-Doku ist Deutsch und verweist darauf.
- **Annahme:** `worktree-und-delivery.md` und `remote-tracker.md` werden als zwei fokussierte
  Dokumente geführt (aus der einen Auswahl „Worktree/Delivery & Remote-Tracker"); bei
  Umsetzung darf zu einem Dokument zusammengelegt werden, falls dünn.
- **Annahme:** Rezepte/„typische Workflows" liegen in `getting-started.md`, nicht in einem
  eigenen Dokument.
- **Bewusst nicht enthalten:** Migration der 69 Alt-Pläne (`NNNN` → Datum) im
  Plan-Verzeichnis — separate, tangentiale Aufgabe.
- **Bewusst nicht enthalten:** `operations/` und `runbooks/` (für Firmo als Quell-Repo
  aktuell nicht einschlägig).

## Testergebnisse

**Datum:** 2026-07-15

- **Scope:** Nur `README.md` geändert; `docs/user-guide/` (13 Dateien) und
  `docs/developer-guide/` (4 Dateien) neu; `AGENTS.md` **unverändert** (`git diff` leer);
  keine Änderung außerhalb des Plan-Scopes.
- **README-Sauberkeit:** keine technischen Abschnitte mehr (grep auf Build/Struktur/
  Frontmatter/Konfiguration/`skills: [`/`NNNN` negativ).
- **Tool-Abdeckung:** alle **15 Tools** in genau einer intent-gruppierten Referenz
  (verstehen/umsetzen/qualitaet/einbringen/einrichten) mit eigener Sektion.
- **Link-Check:** 161 relative Links über 19 Dateien geprüft, **0 tote Links**.
- **Formatter:** `pnpm agent:check` (oxfmt) grün über 164 Dateien.

## Review-Findings

**Datum:** 2026-07-15
**Reviewer:** firmo-docs-writer (4 parallele Batches) + Orchestrator-Validierung
(Link-Check, Tool-Abdeckung, README-Sauberkeit, Formatter)

Keine Findings gefunden. Alle vier Doku-Batches endeten mit `ERLEDIGT`; die
Orchestrator-Validierung (Scope, Links, Tool-Abdeckung, Formatter, AGENTS.md-Unversehrtheit)
war ohne kritische oder wichtige Befunde.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       1 |
| Security    |        0 |       0 |       0 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       0 |       1 |
| Testbarkeit |        0 |       0 |       0 |
| Scope       |        0 |       1 |       0 |
| Wartbarkeit |        0 |       0 |       1 |

### Befunde

- **Scope (Wichtig, dokumentiert):** Der Plan spannt über drei Ziele (Top-Level-README,
  user-guide, developer-guide) und ~18 Dateien. Bewusst als eine kohärente Restrukturierung
  gewählt; über „Betroffene Dateien" und Akzeptanzkriterien klar abgegrenzt. Die
  single-`Doku-Kategorie`-Kopfzeile nennt die primäre Kategorie, der Multi-Kategorie-Charakter
  ist explizit vermerkt.
- **Architektur (Hinweis):** Trennung entlang der bestehenden Doku-Kategorien; `AGENTS.md`
  bleibt Single Source of Truth für Agent-Regeln → keine Duplikationslast.
- **Fehlerfälle (Hinweis):** Risiko toter Links und veralteter Inhalte explizit als
  Akzeptanzkriterium/Validierung adressiert.
- **Wartbarkeit (Hinweis):** Intent-Gruppierung (5 statt 15 Tool-Dateien) und
  Verweis-statt-Duplikat gegenüber `AGENTS.md` halten die künftige Pflege niedrig.

**Vertiefter interaktiver Review (eingearbeitet):**

- **Struktur (direkt behoben):** Redundante Abschnitte „Annahmen und offene Punkte" +
  „Offene Punkte" in „## Annahmen" und „## Offene Punkte" getrennt.
- **Wartbarkeit (entschieden):** Überschneidung migrierter README-Technik ↔ `AGENTS.md`
  aufgelöst — `developer-guide` fasst AGENTS.md-kanonische Inhalte nur zusammen und verlinkt,
  dupliziert sie nicht.
- **Scope (entschieden):** README-Sprache Deutsch; Umsetzung in **einem** `/firmo docs`-Lauf
  (ein PR).

## Offene Punkte

- Keine offenen Punkte.
