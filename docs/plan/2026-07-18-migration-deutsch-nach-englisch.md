# Migration der aktiven Repo-Inhalte von Deutsch nach Englisch

**Planungsstatus:** Nicht umgesetzt
**Quelle:** /firmo plan
**Empfohlener Workflow:** Refactoring (`/firmo refactor`)

## Anforderung

Der bewusst zweisprachige Zustand von Effective Flow (Code/Tests/Commits Englisch, **Doku und
Tool-Instruktionen Deutsch**) wird auf einen **englischen Default** umgestellt. Ziel ist, dass
alle **aktiven** produktrelevanten Inhalte – die Effective-Flow-Quellinstruktionen, die
Doku-Guides und die Sprach-Policy selbst – auf Englisch vorliegen und künftige Inhalte per
Default englisch entstehen.

Es ist ein **großer, verhaltenserhaltender Umbau** (kein Produkt-Funktionswechsel, nur die
Sprache der Instruktions- und Doku-Prosa sowie der generierten Tool-Ausgabe) und daher als
**Refactoring** eingestuft. Wegen des Umfangs wird er **phasenweise in mehreren PRs** umgesetzt;
nach jeder Phase bleibt der Build grün.

Begründung der Einstufung: Es entsteht keine neue Funktionalität und kein Bugfix; die
Tool-Logik, Platzhalter-Auflösung, Guards und Delivery bleiben unverändert – geändert wird die
**Sprache** des Inhalts und der generierten Ausgabe.

## Architekturentscheidungen

Aus der Klärung mit dem User:

- **Scope = alle aktiven Ebenen:** `src/**` (Tools, Agents, Shared-Includes, Router), die
  Doku-Guides unter `docs/` sowie die **Sprach-Policy** selbst. Auf `develop` gibt es **kein**
  `docs/adr/`-Verzeichnis; ADR-relevant ist nur der Shared-Include `src/shared/adr-convention.md`
  (deutsche Beispiele), der bereits in den 27 Shared-Dateien enthalten ist. `.github/`-Workflows
  wurden geprüft und sind bereits englisch (kein Scope).
- **Basis-Branch = `develop` (Branch-Modell aus #92, inzwischen gemergt).** Seit #92/#141/#144
  ist `develop` der **Source-/Integrations-Branch** und `main` der **Delivery-/Release-Branch**
  (nur `chore(delivery):`-Commits + gebautes `dist/`). Die Migration läuft daher gegen
  `origin/develop`; Worktrees und PRs gehen auf `develop`. `main` wird **nicht** angefasst –
  dort landet die englische Ausgabe automatisch über den regulären Release-/Delivery-Build. Kein
  Übersetzen der Delivery-Branch-Artefakte.
- **Neuer Touchpoint Progressive Disclosure (#140, gemergt):** Das `lazy-include`-Directive
  lagert mode-gated Shared-Fragmente aus. Betroffen von der Migration: (a) die weiterhin
  deutschen lazy-geladenen Fragmente unter `src/shared/`, (b) der **build-emittierte deutsche
  Pointer** `renderLazyPointer` in `build-lib.mjs` (`**Bei Bedarf laden:** Lies … sobald …`),
  (c) die deutschen `when`-Bedingungen in `lazy-include`/`ask`-Blöcken, (d) die Doku dazu
  (`build-system.md`, `architektur.md`).
- **Policy-Flip nur des Defaults – Deutsch bleibt erlaubt:** `src/shared/language-rules.md` und
  `AGENTS.md` werden so gedreht, dass der **Default** für Doku und Tool-Instruktionen künftig
  **Englisch** ist. **Deutsch bleibt eine ausdrücklich zulässige Projekt- und Markersprache** –
  es wird nicht deprecatet oder entfernt, sondern ist die nicht-Default-Option. Die Regel
  „Code/Tests/Commits Englisch" bleibt.
- **Historie bleibt deutsch:** Die **81 archivierten Pläne** (`docs/plan/archive/`) und der 1
  aktive Plan werden **nicht** übersetzt – Historie bzw. in Umsetzung. Nur der Default ab jetzt
  ist englisch.
- **Bilingual-Mechanik bleibt erstklassig:** Englisch wird der neue **Default**, aber die
  deutschen Statusmarker (`**Planungsstatus:**`), ihre Detection, die deutsche
  Typografie-/`locale-typography`-Anbindung (de-DE) und deutschsprachige `ask`-Texte bleiben
  **voll unterstützt** – nicht nur legacy-lesbar, sondern eine gleichwertige, wählbare Option
  (analog zur `sf-`/`firmo-`/`effective-flow-`-Label-Kompatibilität, aber ohne Deprecation).
  Die Marker-Detection/`plan.markerLanguage` bevorzugt bei fehlendem Signal Englisch, respektiert
  aber eine explizit deutsche Wahl.
- **Ein Terminologie-Glossar** (DE→EN) wird zuerst festgelegt und in allen Phasen konsistent
  angewandt, damit wiederkehrende Fachbegriffe über ~84 Dateien einheitlich übersetzt werden
  (z. B. Befund→finding, Umsetzer→implementer, Klärung→clarification, Freigabe→approval,
  Wartung→maintenance, Abgrenzung→scope boundary, Offene Punkte→Open Points).
- **Deutsch-gekoppelte Build-Guards werden mit-migriert:** Der Docs-Guard (#107) in `build.mjs`
  prüft aktuell den **deutschen** Satz `… teilen dasselbe Grundmuster` und deutsch-geslugte
  Dateinamen; er wird auf den englischen Zielsatz/-Dateien umgestellt.
- **Deutsch-geslugte Doku-Dateien werden auf englische Slugs umbenannt** (`git mv`, Cross-Links
  und Guard-Dateinamen aktualisiert). Fixiertes Mapping (alle unter `docs/user-guide/`):
  - `tools-verstehen.md` → `tools-understand.md`
  - `tools-umsetzen.md` → `tools-implement.md`
  - `tools-qualitaet.md` → `tools-quality.md`
  - `tools-einbringen.md` → `tools-deliver.md`
  - `tools-einrichten.md` → `tools-setup.md`
  - `konfiguration.md` → `configuration.md`
  - `glossar.md` → `glossary.md`
  - `worktree-und-delivery.md` → `worktree-and-delivery.md`
  - `getting-started.md`, `remote-tracker.md`, `skill-discovery.md`, `troubleshooting.md` und
    `README.md` behalten ihren bereits englischen Slug.

- **Übersetzungs-Strategie: delegiert und glossar-geführt.** Zuerst wird das DE→EN-Glossar als
  neues `docs/developer-guide/terminology.md` festgelegt (aus einem Term-Frequenz-Scan der
  wiederkehrenden Fachbegriffe geseedet); danach wird pro Ebene an Implementer-Agenten delegiert,
  mit striktem Glossar und einem Review je Phase. Das sichert die höchste Terminologie-Konsistenz
  über ~84 Dateien.
- **README bleibt englisch-only** (mit dem User bestätigt): keine deutsche Fassung und kein
  deutscher Pointer; Deutsch bleibt trotzdem eine zulässige Sprache für einzelne Guides/Marker.
- **Pläne werden nicht übersetzt.** Auf `develop` liegt **1** aktiver Plan
  (`docs/plan/2026-07-16-0033-gemini-cli-platform-target.md`) plus das 81er-Archiv; beide bleiben
  deutsch (in-Umsetzung-Pläne wandern nach Abschluss ins deutsche Archiv). Nur der
  Statusmarker-**Default** für **neue** Pläne wird englisch. (Diese Migrations-Plandatei selbst
  bleibt deutsch als Umsetzungs-Grundlage.)
- **Statusmarker-Default wird Englisch:** Neue Pläne entstehen per Default mit `**Plan status:**
Not implemented`; `plan.markerLanguage`-Default/Detection bevorzugt Englisch, **erlaubt aber
  eine explizit deutsche Wahl** (weiterhin gültige Marker, Detection und Config-Wert `"de"`).

## Betroffene Dateien

Nach Ebene gruppiert (Dateizahlen aus der Bestandsaufnahme):

| Bereich                                                  | Umfang                                                                                                                                                        | Geplante Änderung                                                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src/shared/*.md`                                        | 27 Dateien                                                                                                                                                    | Instruktions-Prosa DE→EN; Marker-/Typografie-Bausteine auf EN-Default + DE-Erkennung                                    |
| `src/tools/*.md`                                         | 23 Dateien                                                                                                                                                    | Prosa, Frontmatter-`description`, `catalogHint`, `ask`-Blöcke DE→EN                                                     |
| `src/agents/*.md`                                        | 13 Dateien                                                                                                                                                    | Agent-Instruktionen + Frontmatter DE→EN                                                                                 |
| `src/SKILL.md`                                           | 1 Datei                                                                                                                                                       | Router-Katalog + Dispatch-Prosa DE→EN                                                                                   |
| `src/shared/language-rules.md`                           | 1 Datei                                                                                                                                                       | Policy-Flip: Doku/Instruktionen = Englisch-**Default**; Deutsch bleibt ausdrücklich zulässige Option                    |
| `AGENTS.md`                                              | 1 Datei                                                                                                                                                       | bereits englisch; nur die Policy-Aussagen „Documentation = German" → „English by default, German permitted" drehen      |
| `build.mjs`                                              | 1 Datei                                                                                                                                                       | Docs-Guard (#107) auf englischen Satz/Slugs umstellen; Marker-Default EN                                                |
| `build-lib.mjs`                                          | 1 Datei                                                                                                                                                       | `renderLazyPointer`-Template DE→EN (`**Bei Bedarf laden:**` → englisch); deutsche Kommentare angleichen                 |
| `test/build-lib.test.mjs`                                | 1 Datei                                                                                                                                                       | Deutsche Fixtures/Assertions, die Sprache prüfen, an EN angleichen (inkl. Lazy-Pointer-Erwartung; Struktur unverändert) |
| `docs/developer-guide/*.md`                              | 7 Dateien                                                                                                                                                     | Prosa DE→EN                                                                                                             |
| `docs/user-guide/*.md`                                   | 13 Dateien                                                                                                                                                    | Prosa DE→EN; deutsche Slugs → englische Slugs (`git mv`) + Cross-Links                                                  |
| `README.md`                                              | 1 Datei                                                                                                                                                       | DE→EN                                                                                                                   |
| `docs/developer-guide/build-system.md`, `architektur.md` | Teil der 7                                                                                                                                                    | Progressive-Disclosure-/Build-Doku DE→EN (durch #140 erweitert)                                                         |
| **Nicht angefasst**                                      | `docs/plan/archive/` (81) + 1 aktiver Plan; **`main`** (Delivery-Branch, nur gebautes `dist/`); `.github/` (bereits englisch); **kein** `docs/adr/` vorhanden | Historie/in-Umsetzung bzw. Release-Artefakt – nie manuell übersetzen                                                    |

## Implementierungsdetails

### Vorgehen

Phasenweise, je Phase ein PR, Build/Tests/Format nach jeder Phase grün. Empfohlene Reihenfolge
(unten nach oben aufeinander aufbauend):

1. **Glossar + Policy-Grundlage.** Verbindliches DE→EN-Terminologie-Glossar festlegen (als
   Referenz für alle delegierten Übersetzungen; Ablage als kurzer Abschnitt im
   `docs/developer-guide/`). `language-rules.md` und `AGENTS.md` auf Englisch-**Default** drehen,
   Deutsch als weiterhin zulässige Option dokumentieren. Klein, setzt Richtung und Terminologie.
2. **Shared-Includes (`src/shared`, 27).** Zuerst, weil überall eingebettet. Enthält die
   Marker-/Status-/Typografie-Bausteine: EN-Default setzen, DE-Erkennung erhalten.
3. **Tools + Router (`src/tools` 23, `SKILL.md`).** Prosa, `description`, `catalogHint`,
   `ask`-Blöcke übersetzen (nur Textfelder der `ask`-Blöcke, DSL-Struktur unverändert).
4. **Agents (`src/agents`, 13).** Instruktionen + Frontmatter übersetzen.
5. **Build-Guards + Tooling.** `build.mjs`-Docs-Guard auf englischen Zielsatz/-Slugs umstellen,
   Marker-Default EN; `build-lib.mjs` `renderLazyPointer`-Template DE→EN; deutsche Test-Fixtures
   (inkl. Lazy-Pointer-Erwartung) angleichen. Muss mit der Doku-Phase konsistent sein.
6. **Doku-Guides + README (`docs/developer-guide` 7, `docs/user-guide` 13, `README.md`).** Prosa
   übersetzen, deutsche Slugs → englische Slugs (`git mv`), alle Cross-Links und die
   Guard-Dateinamen aktualisieren.
7. **Abschluss/Konsistenz.** `src/shared/adr-convention.md`-Beispiele auf englischen Default
   angleichen (die Datei wird bereits in Phase 2 mitübersetzt); Gesamt-Grep auf Rest-Deutsch,
   Cross-Link- und Guard-Konsistenz. Der 1 aktive Plan und das Archiv bleiben unberührt; nur der
   Marker-Default für neue Pläne ist EN. (Kein `docs/adr/` in diesem Repo.)

Alle Phasen laufen gegen **`origin/develop`** (Source-Branch, siehe Architekturentscheidungen);
`main` bleibt unangetastet. Übersetzung je Phase **delegiert an Implementer-Agenten** mit dem
verbindlichen Glossar; pro Datei getreue Übersetzung, Platzhalter (`{{SKILL:X}}`, `{{AGENT:X}}`,
`include`-/`lazy-include`-Fences, `ask`-Blöcke inkl. `when`-Bedingungen) **strukturell
unverändert** (nur Textinhalt übersetzen); danach `pnpm agent:check` + `pnpm test` +
`node build.mjs` grün.

### Edge Cases

- **`ask`-Block-DSL:** Nur `question`/`label`/`description`-Texte übersetzen; Einrückung und
  `options:`-Struktur exakt erhalten (der `parseAskBlock`-Parser ist strikt).
- **Statusmarker im Archiv:** Resolver/Guards dürfen die 81 deutschen Archiv-Pläne nicht als
  ungültig werten – DE-Marker-Erkennung bleibt aktiv.
- **Doku-Slug-Umbenennung:** Jeder Rename braucht ein Cross-Link- und Guard-Update im selben PR,
  sonst brechen Build-Guard (#107) und interne Links.
- **Gemischte Marker-Detection:** Während der Übergangszeit existieren EN- (neu) und DE-Pläne
  (Archiv) parallel; die `plan.markerLanguage`-Detection muss den gemischten Bestand tolerieren
  (Default EN, DE erkannt).
- **Deutsche Typografie:** `locale-typography`/deutscher Typografie-Fallback bleibt für die
  deutsch gebliebene Historie erhalten; neue englische Prosa nutzt en-US-Konventionen.
- **Version-Drift-Guard:** Claude- und Codex-Ausgabe müssen nach jeder Phase äquivalent bleiben.

## Akzeptanzkriterien

- [ ] `src/**` (Tools, Agents, Shared, Router) enthält in der **aktiven** Instruktions-Prosa,
      `description`, `catalogHint` und `ask`-Blöcken kein Deutsch mehr (außer bewusst als
      Rückwärtskompatibilität erhaltene DE-Marker/-Erkennung).
- [ ] `docs/developer-guide/` und `docs/user-guide/` sind vollständig englisch; deutsche
      Dateislugs sind auf englische umbenannt und alle internen Links aufgelöst; `README.md` ist
      englisch.
- [ ] `src/shared/language-rules.md` und `AGENTS.md` deklarieren Englisch als Doku-/Instruktions-
      **Default** und benennen Deutsch ausdrücklich als weiterhin **zulässige** Projekt-/Marker-
      sprache (kein Deprecation).
- [ ] Deutsch bleibt als Markersprache voll funktionsfähig: ein Plan mit `plan.markerLanguage:
"de"` bzw. deutschem Marker wird korrekt erzeugt und erkannt (Default ohne Signal = EN).
- [ ] Die 81 archivierten Pläne und der 1 aktive Plan sind **unverändert** deutsch (kein Diff im
      Archiv/an aktiven Plänen); `main` (Delivery-Branch) wird nicht manuell angefasst.
- [ ] Der build-emittierte Lazy-Include-Pointer (`renderLazyPointer`) und die `when`-Bedingungen
      sind englisch; das `lazy-include`-Directive funktioniert unverändert (Guards grün).
- [ ] `node build.mjs` (inkl. aller Guards, insbesondere Docs-Guard #107 und Version-Drift),
      `pnpm test` und `pnpm agent:check` sind grün; die generierten Claude- und Codex-Tools sind
      englisch und äquivalent, ohne Platzhalter-Leaks.
- [ ] Neue Pläne entstehen per Default mit englischem Statusmarker (`**Plan status:** Not
implemented`); deutsche Marker werden weiterhin korrekt erkannt.
- [ ] Terminologie ist über alle migrierten Dateien konsistent (Glossar angewandt).

## Validierungsplan

- Pro Phase (auf `develop`): `pnpm agent:check`, `pnpm test`, `node build.mjs`.
- `grep -rInP '[äöüÄÖÜß]' src docs/developer-guide docs/user-guide README.md build.mjs build-lib.mjs`
  findet nach Abschluss nur noch bewusst deutsche Token (Marker-/Typografie-Beispiele als
  weiterhin zulässige Option), keine Prosa; insbesondere ist der `renderLazyPointer`-Text
  englisch.
- Stichprobe generierter `dist/claude` + `dist/codex` Tool-/Agent-Dateien auf englische Ausgabe
  und saubere Platzhalter-Auflösung; Version-Drift-Guard grün.
- Cross-Link-Check der umbenannten Doku-Dateien (keine toten internen Links).
- Sichtprüfung, dass `docs/plan/archive/` unverändert ist (`git status`/`git diff` leer für das
  Archiv).

## Annahmen und offene Punkte

- Annahme: Der Umbau läuft in mehreren PRs; ein einzelner Riesen-PR ist wegen Review- und
  Konfliktlast nicht gewünscht.
- Annahme: `AGENTS.md` bleibt strukturell die cross-harness-Anleitung, nur die Sprach-Policy-
  Aussagen werden von „Doku = Deutsch" auf Englisch gedreht.
- Entscheidung (mit User bestätigt): README wird **englisch-only**, kein deutscher Pointer.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       1 |
| Security    |        0 |       0 |       0 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       1 |       0 |
| Testbarkeit |        0 |       0 |       1 |
| Scope       |        0 |       1 |       0 |
| Wartbarkeit |        0 |       0 |       1 |

### Befunde

- Fehlerfälle (Wichtig): Deutsch-gekoppelte Build-Guards und Doku-Slugs können den Build brechen,
  wenn Prosa und Guard/Links nicht im selben PR migriert werden. Eingearbeitet als Edge Case und
  als Phasen-Kopplung (Doku-Prosa + Slug-Rename + Guard-Update gemeinsam).
- Scope (Wichtig): „Komplette Migration" ist ohne Grenze uferlos; über die Klärung fest umrissen
  (aktive Ebenen + Policy-Flip, Historie ausgeschlossen, Bilingual-Mechanik als gleichwertige
  Option erhalten).
- Architektur/Testbarkeit/Wartbarkeit (Hinweis): Ein vorab fixiertes Terminologie-Glossar sichert
  konsistente Übersetzung über ~84 Dateien und erleichtert Review; als erste Phase verankert.
- Vertiefter interaktiver Review (2026-07-18): drei entscheidungsbedürftige Punkte geklärt und
  eingearbeitet — Doku-Slug-Mapping fixiert, aktive Pläne bleiben deutsch bis zur Archivierung,
  Übersetzung delegiert und glossar-geführt. Danach keine offenen Punkte mehr; Ergebnis
  **Freigegeben**.
- Re-Plan gegen `develop` (2026-07-18): Branch-Modell #92 (develop=Source, main=Delivery) und
  Progressive Disclosure #140 sind inzwischen gemergt. Eingearbeitet: Basis-Branch `develop`,
  `main` als Delivery-Branch ausgenommen, neuer Touchpoint `renderLazyPointer`/`lazy-include`
  (`build-lib.mjs`) + `build-system.md`/`architektur.md`. Dateizahlen unverändert (23/13/27/7/13,
  81 Archiv); durch #138 (self-contained Agents) wuchs das per-Datei-Volumen, aber keine neuen
  Ebenen.
- Zweiter vertiefter interaktiver Review (2026-07-18, gegen Code-Kontext auf `develop`): drei
  Korrektheitsbefunde direkt behoben — (1) kein `docs/adr/`-Verzeichnis vorhanden, „aktive
  ADRs"-Scope entfernt (nur `src/shared/adr-convention.md`, bereits gezählt); (2) es gibt **1**
  aktiven Plan (nicht null), bleibt deutsch; (3) `.github/`-Workflows geprüft und bereits
  englisch (kein Scope). Ein entscheidungsbedürftiger Punkt geklärt: README bleibt englisch-only.
  Glossar als `docs/developer-guide/terminology.md` präzisiert. Keine offenen Punkte; Ergebnis
  **Freigegeben**.

## Offene Punkte

- Keine offenen Punkte.
