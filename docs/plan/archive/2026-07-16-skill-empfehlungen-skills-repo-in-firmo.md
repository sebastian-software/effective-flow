# Skill-Empfehlungen aus dem skills-Repo in Firmo-Agents und -Tools verankern

**Planungsstatus:** Umgesetzt
**Quelle:** /firmo plan
**Empfohlener Workflow:** Feature (`/firmo build`)

## Anforderung

Im Repo `~/Developer/skills.sebastian-software.com` liegen bevorzugte Skills, die in den
Harnesses bereits installiert sind. Firmo spricht Skill-Empfehlungen im Sourcecode über
`## Empfohlene Skills`-Abschnitte aus (Mechanik: `src/shared/skill-discovery.md`). Zwei
Ziele:

1. **Bestehende Empfehlungen prüfen:** Wo ein skills-Repo-Skill einen bereits empfohlenen,
   generischen Host-Skill fachlich schlägt, wird er bevorzugt (Fallback-Notation `A › B`) –
   analog zu `effective-web › impeccable › frontend-design` (bereits umgesetzt, PR #90).
2. **Weitere Empfehlungsstellen finden:** Die skills-Repo-Skills gegen alle Agents und Tools
   prüfen und dort Empfehlungen aussprechen, wo sie fachlich klar passen.

Begründung der Workflow-Empfehlung: Die Änderung verändert das Verhalten von Firmo-Agents
und -Tools (welche Skills bevorzugt herangezogen werden) und führt ein neues Muster ein
(Empfehlungen auch in Tool-Quellen). Das ist eine additive Verhaltensänderung → Feature
(`/firmo build`). Es gibt keine Testsuite; Korrektheit sichern die Build-Guards in
`build.mjs` (`node build.mjs`) plus manuelle Sichtprüfung der `dist/`-Ausgabe beider
Harnesses.

### Ausgangsbefund (verifizierter Code-Kontext)

- `## Empfohlene Skills` tragen bislang **nur 4 Agents**:
  - `src/agents/code-documenter.md` und `src/agents/docs-writer.md` → `humanizer` (flach)
  - `src/agents/frontend-reviewer.md` und `src/agents/ui-implementer.md` →
    `effective-web › impeccable › frontend-design` (Fallback; `effective-web` ist bereits der
    präferierte skills-Repo-Skill – **keine Änderung nötig**)
- **Kein Tool** trägt bisher einen `## Empfohlene Skills`-Abschnitt. Der Mechanismus
  unterstützt den Tool-Scope aber ausdrücklich: `skill-discovery.md` („Fehlt ein solcher
  Abschnitt (z. B. bei Tools), entfällt dieser Punkt.") und die Config-Felder
  `skills.tools.<name>` (`src/tools/setup.md`, `src/shared/config-migration.md`).
- Diese 8 Tools binden den `skill-discovery`-Include bereits ein: `build`, `docs`, `fix`,
  `investigate`, `maintain`, `plan-issue`, `plan`, `refactor`. `pr` und `commit` binden ihn
  **nicht** ein.
- `metro-english` wird bislang **nirgends** referenziert; die im Auftrag genannte Analogie
  „metro-english › humanizer" ist das hier zu etablierende Muster, nicht ein bestehendes.

## Architekturentscheidungen

- **Fallback- statt Ersetzungs-Semantik:** Wo ein skills-Repo-Skill einen Host-Skill
  ablöst, wird `neu › alt` geschrieben (geordnete Präferenz, nie beide). Der generische
  Host-Skill bleibt als Fallback erhalten, falls das skills-Repo in einer Umgebung fehlt.
- **Relevanz-Gate trägt die Grenzfälle:** `skill-discovery.md` Schritt 2 bindet nur klar
  passende Skills ein (typisch 0–2). Dadurch sind auch schwächere Empfehlungen
  (software-architecture, port-codebases, effective-web für Tests) unschädlich: Sie greifen
  nur, wenn die konkrete Aufgabe passt, und bleiben sonst ein No-Op.
- **Präzedenz schützt vor Fremd-Workflows:** `skill-discovery.md` Schritt 5 stellt sicher,
  dass ein Skill nur das _Wie_ informiert. Skills mit eigenem Liefer-Default
  (`smart-dependency-updater` pusht standardmäßig PRs) überschreiben Firmos Workflow nicht;
  Firmos Delivery-/Scope-Regeln haben Vorrang. Das wird bei der maintain-Empfehlung als
  Kontext mitgegeben.
- **Tool-Empfehlungen als neues, aber mechanik-konformes Muster:** Empfehlungen in
  Tool-Quellen nutzen exakt denselben `## Empfohlene Skills`-Abschnitt und dieselbe
  Fallback-Notation wie Agents. Kein neuer Build-Guard, keine DSL-Erweiterung nötig.
- **`decision-records` bewusst ausgeklammert:** Der ADR-nahe Skill wird nicht hier, sondern
  im laufenden Plan `docs/plan/2026-07-16-lebende-adrs-und-projektsetup-config.md` behandelt,
  wo die ADR-Autorenschaft ohnehin überarbeitet wird (User-Entscheidung).
- **`commit` bleibt unberührt:** `metro-english` wird nicht in `commit.md` empfohlen. Die
  Commit-Message-Regeln (Conventional Commits, Englisch, knappe Form) haben Vorrang; lockere
  Prosa würde das Format brechen. `metro-english` greift nur bei PR-Beschreibungs-Prosa.
- **Ergebnisse des interaktiven Plan-Reviews (bestätigt):**
  - `port-codebases` bleibt bei `refactor`. Der Skill schließt zwar „kleine lokale
    Refactorings" aus, doch das Relevanz-Gate lädt ihn nur bei echten Ports/Migrationen; die
    nominale Spannung ist damit unschädlich, und `refactor` ist die inhaltlich nächste Stelle.
  - `smart-dependency-updater` bleibt ausschließlich bei `maintain`; keine Zweit-Empfehlung
    in `generic-implementer` (Duplikationsvermeidung).
  - `locale-typography` bleibt agent-seitig (`docs-writer`, `code-documenter`). Keine
    zusätzliche Tool-Empfehlung in `plan`/`docs`: `docs` delegiert an `docs-writer`, und
    `plan.md` trägt bereits eigene deutsche Typografie-Regeln.

## Betroffene Dateien

| Datei                           | Beschreibung                                                                                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/agents/code-documenter.md` | `humanizer` → `metro-english › humanizer` (Fallback); `locale-typography` ergänzen                                                                                               |
| `src/agents/docs-writer.md`     | wie code-documenter                                                                                                                                                              |
| `src/agents/nodejs-reviewer.md` | neuer `## Empfohlene Skills`-Abschnitt → `software-architecture` (Grenzfall)                                                                                                     |
| `src/agents/rust-reviewer.md`   | neuer `## Empfohlene Skills`-Abschnitt → `software-architecture` (Grenzfall)                                                                                                     |
| `src/agents/test-writer.md`     | neuer `## Empfohlene Skills`-Abschnitt → `effective-web` (Grenzfall, Frontend-Komponententests)                                                                                  |
| `src/agents/e2e-tester.md`      | neuer `## Empfohlene Skills`-Abschnitt → `effective-web` (Grenzfall, Frontend-E2E)                                                                                               |
| `src/tools/maintain.md`         | neuer `## Empfohlene Skills`-Abschnitt → `smart-dependency-updater`                                                                                                              |
| `src/tools/refactor.md`         | neuer `## Empfohlene Skills`-Abschnitt → `codebase-improvement`; `port-codebases` (Grenzfall)                                                                                    |
| `src/tools/pr.md`               | `skill-discovery`-Include ergänzen **und** `## Empfohlene Skills` → `metro-english › humanizer`                                                                                  |
| `src/tools/setup.md`            | Materialisierungstext (Zeile ~226) von „per-Agent" auf **per-Agent und per-Tool** (`skills.tools.<name>.include`) erweitern; Fallback-Beispiel auf `effective-web` aktualisieren |
| `dist/**`                       | Generiert über `node build.mjs`, **nicht** von Hand editiert (gitignored)                                                                                                        |

Nicht geändert (bewusst): `frontend-reviewer.md`, `ui-implementer.md` (bereits
`effective-web`-präferiert); `review.md` (`codebase-improvement` schließt „PR-only review
rounds" aus, `decision-records` verschoben); `commit.md`.

## Implementierungsdetails

### Vorgehen

1. **Agent-Empfehlungen anpassen (klare Treffer):**
   - In `code-documenter.md` und `docs-writer.md` die Zeile `- \`humanizer\``ersetzen durch`- \`metro-english › humanizer\` (Fallback)`und eine Zeile`- \`locale-typography\``ergänzen. Der Abschnitt liegt wie bisher zwischen dem`task-tracking`- und dem
`skill-discovery`-Include.
   - Begründung als knappe Prosa-Zeile pro Skill ist optional; die bestehende Konvention
     listet nur die Skill-Namen.
2. **Reviewer-Empfehlungen ergänzen (Grenzfall software-architecture):**
   - In `nodejs-reviewer.md` und `rust-reviewer.md` unmittelbar vor dem `skill-discovery`-
     Include einen `## Empfohlene Skills`-Abschnitt mit `- \`software-architecture\``einfügen.`frontend-reviewer` bleibt außen vor (Skill schließt Frontend-only-Architektur
     aus).
3. **Test-Agent-Empfehlungen ergänzen (Grenzfall effective-web):**
   - In `test-writer.md` und `e2e-tester.md` vor dem `skill-discovery`-Include einen
     `## Empfohlene Skills`-Abschnitt mit `- \`effective-web\``einfügen (greift nur bei
Frontend-Tests;`effective-web` deckt „frontend testing" ab).
4. **Tool-Empfehlungen einführen (neues Muster):**
   - `maintain.md`: unmittelbar vor dem `skill-discovery`-Include (aktuell im Workflow-
     Abschnitt) `## Empfohlene Skills` mit `- \`smart-dependency-updater\`` einfügen.
   - `refactor.md`: analog `- \`codebase-improvement\``und`- \`port-codebases\``
     (Grenzfall, nur bei echten Ports/Migrationen).
   - `pr.md`: den `skill-discovery`-Include ergänzen (nach den bestehenden Includes
     `language-rules`/`task-tracking`/`commit-message-rules`) und direkt davor
     `## Empfohlene Skills` mit `- \`metro-english › humanizer\` (Fallback)`.
5. **setup.md konsistent halten:**
   - Den Passus zur optionalen Materialisierung eingebauter Empfehlungen so erweitern, dass
     er neben `skills.agents.<name>.include` auch `skills.tools.<name>.include` abdeckt.
     Fallback-Regel (nur den primären Skill schreiben) bleibt gleich; das Beispiel von
     `impeccable › frontend-design` auf den aktuellen Stand (`effective-web › …`) heben.
6. **Bauen und prüfen:** `node build.mjs` ausführen; danach `pnpm agent:check` (oxfmt).

### Fallback-Notation (Referenz)

Die geordnete Präferenz wird exakt wie im Bestand geschrieben, ein Beispiel:
`metro-english › humanizer`. Trennzeichen ist `›` (U+203A), keine ASCII-Ersetzung.

### Edge Cases

- **Skill in einer Umgebung nicht installiert:** Fallback greift bzw. der Punkt entfällt
  still (durch `skill-discovery.md` abgedeckt) – kein Fehler.
- **Deutschsprachige Doku und `metro-english`:** `metro-english`/`humanizer` sind
  Englisch-orientiert; das Relevanz-Gate lädt sie nur bei englischem Zieltext. Für deutsche
  Prosa greift stattdessen `locale-typography`.
- **`pr.md` ohne bisherigen `skill-discovery`-Include:** Nach Ergänzung muss das Include-Ziel
  `src/shared/skill-discovery.md` existieren (tut es) – sonst schlägt der Include-Guard fehl.
- **`config.exclude`/`enabled: false`:** Harte Ausschalter greifen unverändert; ein
  ausgeschlossenes Fallback-Mitglied wird zugunsten des nächsten übersprungen.

## Akzeptanzkriterien

- [ ] `code-documenter.md` und `docs-writer.md` führen `metro-english › humanizer` (Fallback)
      **und** `locale-typography` im `## Empfohlene Skills`-Abschnitt.
- [ ] `nodejs-reviewer.md`, `rust-reviewer.md` (software-architecture), `test-writer.md`,
      `e2e-tester.md` (effective-web) tragen je einen neuen `## Empfohlene Skills`-Abschnitt.
- [ ] `maintain.md` (smart-dependency-updater), `refactor.md` (codebase-improvement +
      port-codebases) und `pr.md` (metro-english › humanizer) tragen je einen
      `## Empfohlene Skills`-Abschnitt; `pr.md` bindet zusätzlich den `skill-discovery`-
      Include ein.
- [ ] Fallback-Notation überall exakt `A › B` (mit `›`), Stil konsistent zum Bestand.
- [ ] `setup.md` beschreibt die Materialisierung eingebauter Empfehlungen für Agents **und**
      Tools (`skills.tools.<name>.include`).
- [ ] `decision-records` ist in diesem Plan **nicht** verankert (im ADR-Plan behandelt).
- [ ] `node build.mjs` läuft ohne Guard-Fehler durch; die neuen Abschnitte erscheinen in
      `dist/claude/` **und** `dist/codex/`; der Version-Drift-Guard bleibt grün.
- [ ] `pnpm agent:check` meldet keine Formatierungsabweichung.

## Validierungsplan

- `node build.mjs` – muss ohne Fehler durchlaufen (Include-, catalogHint-, Drift-Guards).
- Stichprobe in `dist/`: je ein Agent (`docs-writer`) und je ein Tool (`maintain`, `pr`) in
  beiden Harnesses auf den gerenderten `## Empfohlene Skills`-Abschnitt prüfen.
- `grep` über `dist/` bestätigt, dass die neuen Skill-Namen und die Fallback-Notation
  auftauchen und `pr` den `skill-discovery`-Include enthält.
- `pnpm agent:check` (oxfmt) sauber.

## Annahmen und offene Punkte

- **Legacy-Plan-Migration bewusst nicht ausgeführt:** In `docs/plan/` liegen noch ~69
  Pläne im Altformat (`NNNN-slug.md`). Die in `plan.md` beschriebene Bulk-Migration
  (NNNN → Datum, per `git mv`) wurde in diesem Lauf **nicht** durchgeführt, weil sie einen
  großen, zu diesem Auftrag fremden Diff erzeugt und mit dem laufenden Rename-Plan
  (`2026-07-16-rename-firmo-to-effective-flow.md`) kollidieren kann. Separat entscheiden.
- **`decision-records`** wird im ADR-Plan behandelt (User-Entscheidung), nicht hier.
- **`smart-dependency-updater` nur in `maintain`** (im interaktiven Plan-Review entschieden):
  `generic-implementer` bearbeitet zwar Dependency-Manifeste, aber `maintain` orchestriert
  den Lauf; eine Doppel-Empfehlung würde nur Duplikation erzeugen. Bewusst **nicht** in
  `generic-implementer`.
- **Nicht empfohlen (out of scope):** `consultant-profile`, `linkedin-posts`,
  `linkedin-social-selling`, `product-naming`, `web-legal-compliance` (kein SWE-Kernbezug);
  `pr-review` (überschneidet sich mit Firmos eigenem Review-Workflow); `product-management`
  (Scope-/What-Entscheidungen, überlappt mit `plan`).
- **`setup.md`-Beispiel** (`impeccable › frontend-design`) ist kosmetisch veraltet; die
  Aktualisierung auf `effective-web` ist Teil des Plans, aber nicht funktional kritisch.

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
| Scope       |        0 |       1 |       1 |
| Wartbarkeit |        0 |       1 |       0 |

### Befunde

- **Wartbarkeit / Wichtig:** `pr.md` und `setup.md` sind gekoppelt: Wird der
  `skill-discovery`-Include in `pr.md` ergänzt und ein per-Tool-Abschnitt eingeführt, muss
  `setup.md` die per-Tool-Materialisierung mit abdecken, sonst wird die Config-Materialisierung
  inkonsistent. → Beide Dateien in derselben Umsetzung ändern (in Betroffene Dateien und
  Akzeptanzkriterien verankert).
- **Scope / Wichtig:** Die Grenzfälle (software-architecture, port-codebases, effective-web
  für Tests) sind schwächere Treffer und könnten als Rauschen wirken. → Durch das
  Relevanz-Gate (`skill-discovery.md` Schritt 2) abgesichert; sie greifen nur bei passender
  Aufgabe. Bewusst als Grenzfall markiert.
- **Architektur / Hinweis:** Skills mit eigenem Liefer-Default (`smart-dependency-updater`
  pusht PRs) könnten Firmos Delivery-Modell zu überstimmen scheinen. → Präzedenzregel
  (Schritt 5) hält Firmos Workflow autoritativ; als Kontext dokumentiert.
- **Fehlerfälle / Hinweis:** Neuer `skill-discovery`-Include in `pr.md` verlangt ein
  existierendes Include-Ziel; vorhanden, daher unkritisch. Build-Guard fängt einen Fehler
  ohnehin ab.
- **Scope / Hinweis:** Nicht empfohlene Skills sind explizit gelistet, damit die Ablehnung
  nachvollziehbar bleibt und nicht später versehentlich „nachgeholt" wird.

### Interaktiver Plan-Review (2026-07-16)

Drei entscheidungsbedürftige Punkte wurden mit dem User geklärt und eingearbeitet; keine
kritischen Befunde, keine umsetzungsblockierenden offenen Punkte verbleiben:

- **`port-codebases`-Platzierung:** Bleibt bei `refactor` (Relevanz-Gate entschärft die
  „kein kleines Refactoring"-Ausschlussklausel).
- **`smart-dependency-updater`-Reichweite:** Nur `maintain`, nicht zusätzlich
  `generic-implementer` (Duplikationsvermeidung).
- **`locale-typography`-Reichweite:** Agent-seitig belassen; keine Tool-Empfehlung in
  `plan`/`docs`.

## Offene Punkte

- Keine offenen Punkte.

## Umsetzungshinweis

Zwischen Planerstellung und Umsetzung ist `origin/main` fortgeschritten: PR #93
(„prefer metro-english over humanizer in docs agents") hatte den `humanizer` →
`metro-english › humanizer`-Swap in `code-documenter` und `docs-writer` bereits gelandet.
Für diese beiden Agents wurde daher nur noch `locale-typography` ergänzt; der Swap war schon
vorhanden. Alle übrigen Punkte wurden wie geplant umgesetzt.

## Testergebnisse

**Datum:** 2026-07-16

- `node build.mjs`: grün, alle Guards bestanden (15 Tools + 6 intern, 13 Agents; beide
  Harnesses erzeugt).
- `pnpm agent:check` (oxfmt): alle geänderten Quell- und die Plan-Datei formatkonform.
- Sichtprüfung `dist/`: neue `## Empfohlene Skills`-Abschnitte in Claude (`dist/claude/…`)
  **und** Codex (`dist/codex/…`) gerendert; `pr` enthält jetzt den `skill-discovery`-Include.
- Keine projektweite Testsuite vorhanden (per Design); die Build-Guards sind die
  maßgebliche Prüfinstanz.

## Review-Findings

**Datum:** 2026-07-16
**Reviewer:** keiner (Selbst-Review)

### Zusammenfassung

| Status                  | Anzahl |
| ----------------------- | -----: |
| Behoben                 |      0 |
| Offen / Nicht umgesetzt |      0 |

Kein separater Reviewer-Subagent gestartet: reine Markdown-Instruktions-Edits ohne
Laufzeitverhalten, verifiziert über Build-Guards und Dist-Sichtprüfung in beiden Harnesses.
Keine Findings.
