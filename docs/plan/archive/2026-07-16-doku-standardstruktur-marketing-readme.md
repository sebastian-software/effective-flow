# Vorgegebene Doku-Standardstruktur mit Marketing-README

**Planungsstatus:** Umgesetzt
**Quelle:** /firmo plan
**Empfohlener Workflow:** Feature (`/firmo build`)

## Anforderung

Firmo soll für die Projektdokumentation eine **Standard-Struktur vorgeben**, die
greift, solange der User bzw. der zugrunde liegende Plan nichts anderes bestimmt.
Die Struktur besteht aus drei Rollen:

1. **Root-`README.md`** – eine **Marketing-Seite komplett aus Benutzersicht**. Sie
   wird mit **Marketing-Skills** erstellt (nicht mit dem sachlichen Doku-Stil) und
   verlinkt an ihrem Ende genau zwei weiterführende Dokumentationen.
2. **Benutzerdokumentation** (erster Link) – komplett aus Benutzersicht, beschreibt
   umfangreich Installation und Benutzung der Software im Repo, optional mit FAQ und
   ähnlichen Ergänzungen. Sie lebt im bestehenden `docs/user-guide/`.
3. **Technische Dokumentation** (zweiter Link) – für Entwickler und
   Softwarearchitekten. Entwickler bekommen einen Überblick über die Software,
   Softwarearchitekten können daraus ableiten, ob die Software aus technischer Sicht
   genutzt werden sollte. Sie lebt im bestehenden `docs/developer-guide/`.

Begründung der Workflow-Empfehlung: Es entsteht **neue Funktionalität** im
Firmo-Produkt – eine neue prosaische Doku-Konvention, ein neuer Marketing-Agent und
neues Routing im Doku-Workflow. Das verändert das Verhalten der Firmo-Tools in
Zielprojekten und ist damit ein **Feature**, kein reines Umschreiben von Doku. (Die
Doku-Änderung betrifft `src/`-Tool-Anweisungen, nicht `docs/`; die Firmo-eigene
Doku-Kategorie-Schreibgrenze ist hier nicht einschlägig.)

### Vom User in der Klärung bestätigte Rahmenentscheidungen

- **Override-Mechanismus: nur Prosa-Default.** Kein neues Config-Feld. Die Struktur
  steht als Konvention in `src/shared/doc-categories.md`; „überschreiben“ heißt: der
  User bzw. Plan gibt im Auftrag ausdrücklich etwas anderes vor. `config-migration.md`
  und der Setup-Wizard bleiben unangetastet.
- **Marketing-Umsetzung: neuer `marketing-writer`-Agent.** Ein dedizierter Agent
  erstellt ausschließlich die Root-`README.md`-Marketingseite; `docs-writer` bleibt
  marketingfrei und für die Guides zuständig.
- **Scope: nur Tooling (`src/`).** Dieser Plan ändert nur die Firmo-Konvention und das
  Tooling. Die README dieses Repos selbst wird hier **nicht** neu geschrieben (der
  laufende Rename-Plan berührt sie ohnehin separat).
- **Initiales Doku-Setup: Scaffold-Modus in `/firmo docs`, kein eigenes Tool.** Der
  One-Shot-Bootstrap der drei Teile wird als Modus in `docs.md` umgesetzt, nicht als
  neues Top-Level-Tool.

## Architekturentscheidungen

- **Prosa-Default statt Config.** Die Standard-Struktur wird ausschließlich als
  Konvention in `doc-categories.md` beschrieben. Das erhält Firmos Prinzip „läuft ohne
  Konfiguration“ und vermeidet Kollisionen mit dem parallel geplanten Umzug der
  Config in eine lebende ADR (siehe Annahmen). Da `doc-categories.md` bereits per
  ` ```include ` in `plan.md`, `docs.md` und `docs-writer.md` eingebettet ist,
  propagiert die neue Sektion automatisch in alle drei Ausgaben – keine Duplizierung.
- **Root-`README.md` als eigene Doku-Rolle, nicht als fünfte Kategorie.** Die vier
  bestehenden Kategorien (`user-guide`, `developer-guide`, `operations`, `runbooks`)
  bleiben unter `docs/`. Die Root-README ist ein separater Top-Level-Marketing-Einstieg
  außerhalb von `docs/` und bekommt eine eigene, klar umrissene Behandlung samt
  Ausnahme in der Schreibgrenze.
- **Dedizierter `marketing-writer`-Agent** statt Erweiterung von `docs-writer`. So
  bleibt die Regel „keine Marketing-Sprache“ für Guides erhalten, während die
  Marketing-Sprache für die Root-README explizit einem eigenen Agenten mit eigenen
  empfohlenen Skills (`copywriting`, `copy-editing`, `marketing-psychology`)
  vorbehalten ist. Agents werden vom Build automatisch aus `src/agents/` erkannt
  (kein Registry-Array); `{{AGENT:marketing-writer}}` wird durch die Build-Guard
  gegen die Agent-Quellen aufgelöst.
- **`docs/developer-guide/README.md` wird verpflichtender Einstiegspunkt** – analog
  zum bereits verpflichtenden `docs/user-guide/README.md`, sobald mindestens ein
  Developer-Guide-Dokument existiert. Das gibt der technischen Doku einen kuratierten
  Einstieg, auf den der zweite README-Link stabil zeigen kann. Das ändert die
  bisherige Regel „`docs/developer-guide/` hat standardmäßig keine README“.
- **Kanonische Link-Ziele.** Erster Link → `docs/user-guide/README.md`, zweiter Link →
  `docs/developer-guide/README.md`. Ein Link wird nur gesetzt, wenn sein Ziel existiert
  (oder im selben Doku-Lauf miterstellt wird), damit keine toten Links entstehen.
- **Plan-Kopf für den Marketing-Einstieg: Kategorie entfällt.** Ein plan-getriebener
  Doku-Lauf adressiert die Root-README über `**Ziel-Pfad:** README.md`; die Zeile
  `**Doku-Kategorie:**` **entfällt** in genau diesem Fall. Ein expliziter Sonderfall in
  `doc-categories.md` erlaubt das Fehlen der Kategorie, wenn der Ziel-Pfad die
  Root-`README.md` ist. Die bestehende Konsistenzregel „Kategorie passt zum
  Verzeichnis-Präfix“ bleibt für die vier `docs/`-Kategorien unverändert; es entsteht
  keine Pseudo-Kategorie.
- **Initiales Doku-Setup als Scaffold-Modus in `/firmo docs`, kein eigenes Tool.** Ein
  Bootstrap für ein frisches Projekt ist fachlich ein breit gefasster Docs-Lauf, kein
  neuer Werkzeugtyp. Statt eines Top-Level-Tools (`docs-init`) bekommt `docs.md` einen
  erkennbaren Initial-Setup-Modus, der `marketing-writer` (Root-README) und
  `docs-writer` (beide Kategorie-Einstiege) in **einem** Lauf koordiniert, sodass die
  zwei README-Links am Ende garantiert auflösen. Das erhält den dünnen Router, vermeidet
  ein Orchestrierungs-Duplikat (Routing, Validierung, Delivery/Worktree,
  Goal-Completion, Commit-Gate leben bereits in `docs.md`) und verhindert die
  Namenskollision mit dem bestehenden `{{SKILL:setup}}`-Config-Wizard.

## Betroffene Dateien

| Datei                            | Beschreibung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/shared/doc-categories.md`   | Neue Sektion „Vorgegebene Standard-Doku-Struktur“ ergänzen: drei Rollen (Marketing-Root-README, Benutzerdoku, technische Doku), Prosa-Override-Hinweis, kanonische Link-Ziele und Zwei-Links-Regel. `docs/developer-guide/README.md` als Pflicht-Einstieg ergänzen (bisherige „keine README“-Regel dafür anpassen). Schreibgrenze so erweitern, dass die Root-`README.md` als sanktioniertes Marketing-Ziel des Doku-Workflows gilt (ohne dass sie in jeder Plan-Tabelle einzeln genannt sein muss). Plan-Kopf-Sonderfall ergänzen: bei `**Ziel-Pfad:** README.md` entfällt `**Doku-Kategorie:**`; die Konsistenzregel „Kategorie passt zum Verzeichnis-Präfix“ bleibt für die vier `docs/`-Kategorien unverändert.                        |
| `src/agents/marketing-writer.md` | **Neuer Agent.** Erstellt ausschließlich die Root-`README.md`-Marketingseite aus Benutzersicht. Empfohlene Skills, Marketing-Sprache erlaubt, Pflicht-Abschluss mit den zwei Links. Includes `language-rules`, `task-tracking`, `skill-discovery`, `doc-categories`. Frontmatter mit `claude:`- und `codex:`-Config.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/tools/docs.md`              | Routing ergänzen: Root-README-Marketing-Einstieg → `{{AGENT:marketing-writer}}`; Benutzerdoku → `{{AGENT:docs-writer}}` in `user-guide`; technische Doku → `{{AGENT:docs-writer}}` in `developer-guide`. Phase-1-Scope erkennt die Standard-Struktur; Phase-3-Validierung prüft die zwei Abschluss-Links und den Marketing-Charakter der Root-README; Ersatzklärung bei bestehender Root-README. **Initial-Setup-/Scaffold-Modus** ergänzen: bei Auftrag „Projektdokumentation initial aufsetzen“ oder fehlender Struktur koordinierter Ein-Lauf, der `marketing-writer` und `docs-writer` (beide Kategorie-Einstiege) so orchestriert, dass die zwei README-Links garantiert auflösen; nutzt die vorhandene Phasen-/Delivery-Maschinerie. |
| `src/agents/docs-writer.md`      | Klarstellen, dass die Root-Marketing-README **nicht** vom `docs-writer` erstellt wird (Delegation an `marketing-writer`); „README-Dateien“-Kernaufgabe auf Nicht-Root-/Kategorie-Einstiegs-READMEs eingrenzen; „keine Marketing-Sprache“ bleibt. Regel für `docs/developer-guide/README.md`-Einstiegspunkt analog zu `user-guide` ergänzen.                                                                                                                                                                                                                                                                                                                                                                                                |
| `dist/**` (generiert)            | Nur via `node build.mjs` neu erzeugt, nicht von Hand editiert. Kontrolliert, dass die Propagation und der neue Agent in beiden Harnesses erscheinen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Nicht betroffen (bewusst): `src/shared/config-migration.md`, `src/tools/setup.md`
(kein Config-Feld), `src/SKILL.md` (Router listet nur Tools, keine Agents),
`build.mjs` (Agents werden automatisch erkannt), README/Doku dieses Repos (Scope).

## Implementierungsdetails

### Vorgehen

1. `src/shared/doc-categories.md`: Sektion „Vorgegebene Standard-Doku-Struktur“
   einfügen. Inhalt: die drei Rollen, der Prosa-Override-Satz („gilt als Default,
   sofern User/Plan nichts anderes vorgibt“), die zwei kanonischen Link-Ziele und die
   Bedingung „Link nur, wenn Ziel existiert“.
2. In derselben Datei die Verzeichnis-Regeln anpassen: `docs/developer-guide/README.md`
   wird Pflicht-Einstieg, sobald ein Developer-Guide-Dokument existiert (Symmetrie zu
   `user-guide`).
3. In derselben Datei die Schreibgrenze erweitern: Root-`README.md` ist ein erlaubtes
   Ziel des Doku-Workflows in der Marketing-Einstieg-Rolle. Für plan-getriebene Läufe
   den Kopf-Sonderfall ergänzen: `**Ziel-Pfad:** README.md` ist für den
   Marketing-Einstieg zulässig und `**Doku-Kategorie:**` entfällt dann; die
   Konsistenzregel „Kategorie passt zum Verzeichnis-Präfix“ bleibt für die vier
   `docs/`-Kategorien unverändert.
4. Neuen Agent `src/agents/marketing-writer.md` schreiben (Frontmatter + Body, siehe
   „Komponenten-Struktur“).
5. `src/tools/docs.md`: Routing-Liste und Phase-1/Phase-3-Schritte um die
   Standard-Struktur, die Marketing-Einstieg-Erkennung und die Zwei-Links-Validierung
   ergänzen. Ersatzklärung bei bestehender Root-README (analog zur vorhandenen
   „Ziel-Pfad zeigt auf bestehende Datei“-Regel).
   5a. `src/tools/docs.md`: Initial-Setup-/Scaffold-Modus ergänzen. Trigger: expliziter
   Auftrag „Projektdokumentation initial aufsetzen“ **oder** noch keine Doku-Struktur
   vorhanden. Ablauf: in einem Lauf `marketing-writer` für die Root-README und
   `docs-writer` für `docs/user-guide/README.md` (plus erste Guides) und
   `docs/developer-guide/README.md` koordinieren; Reihenfolge so, dass die zwei
   README-Links auf existierende Ziele zeigen. Bei bestehender Struktur greift der
   normale (nicht-scaffoldende) Pfad; kein stilles Überschreiben.
6. `src/agents/docs-writer.md`: Abgrenzung zum `marketing-writer` und
   `developer-guide/README.md`-Einstieg ergänzen.
7. `node build.mjs` ausführen; Guards und Version-Drift-Guard müssen grün sein.
   `pnpm format` bzw. `pnpm agent:check` (oxfmt) für die geänderten Quellen.

### Komponenten-Struktur

`src/agents/marketing-writer.md` (Skizze, keine Vorab-Implementierung):

- **Frontmatter:** `description` (streng doppelt-gequotet), `claude:` (Modell `sonnet`,
  `tools: [Read, Write, Edit, Bash, Glob, Grep, Skill]`, `color`), `codex:` (Modell
  analog `docs-writer`, `sandbox_mode: workspace-write`). Kein `name`/`type` (kommt aus
  dem Pfad).
- **Includes:** `language-rules`, `task-tracking`, `skill-discovery`, `doc-categories`.
- **Empfohlene Skills:** `copywriting`, `copy-editing`, `marketing-psychology` (als
  „prefer if available“, greifen via Skill-Discovery des Hosts).
- **Kernauftrag:** Root-`README.md` als Marketing-Seite aus Benutzersicht; klarer
  Nutzen/Nutzenversprechen statt Feature-Aufzählung; endet mit genau zwei Links
  (Benutzerdoku, technische Doku).
- **Regeln:** Marketing-Sprache **erlaubt**; keine erfundenen Fakten/Claims; nur
  Benutzersicht; keine Produktlogik ändern; schreibt ausschließlich die Root-README.

### State-Management

Nicht relevant – reine Anweisungs-/Konventionsänderung ohne Laufzeitzustand.

### API-Anbindung

Nicht relevant.

### Styling-Ansatz

Nicht relevant (Textquellen). Formatierung via oxfmt gemäß `AGENTS.md`.

### Barrierefreiheit

Nicht relevant.

### Edge Cases

- **Bestehende Root-README (nicht Marketing).** Der Doku-Workflow überschreibt nicht
  stillschweigend: Er behandelt die Root-README nur dann als Marketing-Einstieg, wenn
  der Doku-Auftrag den Projekt-Einstieg/Überblick betrifft, und klärt den Ersatz mit
  dem User (analog zur bestehenden „Ziel-Pfad zeigt auf bestehende Datei“-Regel).
- **Fehlende Ziel-Doku.** Existiert `docs/user-guide/README.md` oder
  `docs/developer-guide/README.md` noch nicht, wird der jeweilige Link nur gesetzt,
  wenn das Ziel im selben Lauf miterstellt wird; sonst wird der Link ausgelassen und
  im Doku-Plan als offener Punkt vermerkt.
- **User überschreibt die Struktur.** Gibt der User/Plan eine andere Struktur vor
  (z. B. rein technische README ohne Marketing), folgt der Workflow der Vorgabe; der
  Prosa-Default greift nur mangels anderer Anweisung.
- **Monorepo / mehrere Pakete.** Außerhalb des Scopes; angenommen wird eine einzelne
  Root-README.
- **Scaffold auf teilweise vorhandener Struktur.** Existiert bereits ein Teil (z. B.
  `docs/user-guide/`), scaffoldet der Modus nur die fehlenden Teile und verlinkt die
  vorhandenen; bestehende Dateien werden nicht still überschrieben, sondern wie im
  Normalpfad über die Ersatzklärung behandelt.

## Akzeptanzkriterien

- [ ] `src/shared/doc-categories.md` enthält eine Sektion, die die drei Rollen
      (Marketing-Root-README, Benutzerdoku unter `docs/user-guide/`, technische Doku unter
      `docs/developer-guide/`), den Prosa-Override-Hinweis, die zwei kanonischen Link-Ziele
      und die Zwei-Links-Regel benennt.
- [ ] `doc-categories.md` macht `docs/developer-guide/README.md` zum verpflichtenden
      Einstieg (sobald ein Developer-Guide-Dokument existiert) und erweitert die
      Schreibgrenze um die Root-`README.md` als sanktioniertes Marketing-Ziel.
- [ ] `doc-categories.md` definiert den Plan-Kopf-Sonderfall: bei
      `**Ziel-Pfad:** README.md` entfällt `**Doku-Kategorie:**`; die Präfix-Konsistenzregel
      für die vier `docs/`-Kategorien bleibt unverändert.
- [ ] `src/agents/marketing-writer.md` existiert, empfiehlt die drei Marketing-Skills,
      erlaubt Marketing-Sprache, verlangt den Abschluss mit genau zwei Links und bindet die
      vier Includes ein.
- [ ] `src/tools/docs.md` routet den Root-README-Marketing-Einstieg zum
      `marketing-writer`, erkennt die Standard-Struktur in Phase 1 und validiert die zwei
      Abschluss-Links in Phase 3.
- [ ] `src/tools/docs.md` enthält einen Initial-Setup-/Scaffold-Modus, der bei
      entsprechendem Auftrag oder fehlender Struktur Root-README und beide
      Kategorie-Einstiege in einem Lauf so erzeugt, dass die zwei README-Links auflösen;
      bestehende Struktur wird nicht still überschrieben. Es wird **kein** neues Top-Level-Tool
      eingeführt (Router/`TOOL_GROUPS` unverändert).
- [ ] `src/agents/docs-writer.md` beansprucht die Root-Marketing-README nicht mehr und
      spiegelt den `developer-guide/README.md`-Einstieg wider.
- [ ] `node build.mjs` läuft fehlerfrei durch (alle Guards inkl. Version-Drift grün);
      in `dist/claude/agents/firmo-marketing-writer.md` und
      `dist/codex/**/agents/marketing-writer.toml` erscheint der neue Agent; die neue
      `doc-categories`-Sektion erscheint in den generierten `plan`-, `docs`- und
      `docs-writer`-Ausgaben.
- [ ] `pnpm agent:check` (oxfmt) meldet keine Formatabweichungen für die geänderten
      Quellen.
- [ ] `src/shared/config-migration.md` und `src/tools/setup.md` sind unverändert (kein
      Config-Feld eingeführt).

## Validierungsplan

- `node build.mjs` ausführen und Exit-Code prüfen; anschließend die generierten
  `dist`-Artefakte für beide Harnesses auf den neuen Agent und die propagierte
  `doc-categories`-Sektion sichten.
- `pnpm agent:check` für die oxfmt-Konformität.
- Manuelle Durchsicht: `{{AGENT:marketing-writer}}` löst auf; Prosa-Override-Hinweis,
  Zwei-Links-Regel und Schreibgrenzen-Ausnahme sind vorhanden und widerspruchsfrei zur
  bestehenden Kategorie-Logik.

## Annahmen und offene Punkte

- **Annahme:** Agents brauchen keine Registrierung in `build.mjs` – bestätigt durch
  `readdirSync(AGENTS_DIR)` und die `{{AGENT:X}}`-Auflösungs-Guard.
- **Annahme:** Modellwahl `sonnet` (Claude) für `marketing-writer`, konsistent mit
  `docs-writer`; bei Bedarf im Build anpassbar.
- **Abhängigkeit / Merge-Reihenfolge:** Die zwei offenen Pläne
  `2026-07-16-rename-firmo-to-effective-flow.md` (Rebrand, berührt `doc-categories.md`
  und README) und `2026-07-16-lebende-adrs-und-projektsetup-config.md` (Config-Umzug in
  lebende ADR, ändert die Config-Lesereferenz in `doc-categories.md`) editieren
  dieselbe Datei. Wer zuletzt merged, muss `doc-categories.md` reconcilen. Der
  Prosa-Only-Ansatz hält diese Kopplung minimal (keine Config-Berührung).
- **Bewusst offen:** Ob der Firmo-eigene Repo-README-/Developer-Guide-Einstieg an die
  neue Konvention angeglichen wird, ist hier ausgeklammert (Scope: nur Tooling) und
  kann als Folgeaufgabe über `/firmo docs` erfolgen.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       1 |
| Security    |        0 |       0 |       1 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       0 |       1 |
| Testbarkeit |        0 |       0 |       0 |
| Scope       |        0 |       0 |       1 |
| Wartbarkeit |        0 |       0 |       1 |

### Befunde

- **Architektur (Hinweis):** Root-README als eigene Rolle statt fünfter Kategorie hält
  die `docs/`-Kategorie-Logik sauber; die Sonderbehandlung ist an einer Stelle
  (`doc-categories.md`) gebündelt und propagiert per Include – keine Duplizierung.
- **Security (Hinweis):** Die Schreibgrenzen-Ausnahme erlaubt dem Doku-Workflow, die
  Root-`README.md` zu schreiben. Das Risiko wird durch die Ersatzklärung bei
  bestehender README und die Bindung an die Marketing-Einstieg-Rolle begrenzt; keine
  neuen Secrets/Netz-/Prozesspfade.
- **Fehlerfälle (Hinweis):** Tote Links werden durch die Bedingung „Link nur, wenn Ziel
  existiert“ vermieden; fehlende Ziele werden als offener Punkt vermerkt.
- **Scope (Hinweis):** Klar auf `src/` begrenzt; kein Config-Feld, keine Änderung an
  diesem Repo; die Kopplung zu den zwei offenen Plänen ist als Merge-Reihenfolge
  dokumentiert.
- **Wartbarkeit (Hinweis):** Ein zusätzlicher Agent erhöht die Wartungsfläche minimal;
  die klare Trennung Marketing vs. sachliche Doku überwiegt. Das initiale Doku-Setup
  wird bewusst als Scaffold-Modus in `docs.md` gelöst statt als eigenes Tool – der
  dünne Router und die `TOOL_GROUPS` bleiben unverändert, die vorhandene
  Delivery-/Goal-Maschinerie wird wiederverwendet.

## Testergebnisse

**Datum:** 2026-07-16
**Workflow:** /firmo build

- `node build.mjs` – erfolgreich: 15 Tools (+6 intern) und **13 Agents** (vorher 12; `marketing-writer` neu) in beide Harnesses gebaut; alle Guards inkl. Version-Drift grün. `{{AGENT:marketing-writer}}` löst gegen die Agent-Quelle auf.
- Artefakt-Check: `dist/claude/agents/firmo-marketing-writer.md` und `dist/codex/firmo/agents/marketing-writer.toml` vorhanden. Die neue `doc-categories`-Sektion „Vorgegebene Standard-Doku-Struktur“ propagiert nach `plan`, `docs`, `docs-writer` und `marketing-writer`.
- `pnpm exec oxfmt --check` über alle fünf Lieferdateien – formatkonform.
- `src/shared/config-migration.md`, `src/tools/setup.md` und `build.mjs` unverändert (kein Config-Feld, kein neues Tool).

## Review-Findings

**Datum:** 2026-07-16
**Reviewer:** Self-Review (Generic, build-guard-gestützt)

### Zusammenfassung

| Status                  | Anzahl |
| ----------------------- | -----: |
| Behoben                 |      0 |
| Offen / Nicht umgesetzt |      0 |

Keine Findings gefunden. Die Build-Guards (Include-/Agent-Auflösung, Description-Quoting, Version-Drift) und der oxfmt-Check bestätigen die Konsistenz; die Nummerierung in `docs.md` Phase 3 wurde beim Einfügen korrigiert.

## Offene Punkte

- Keine offenen Punkte.
