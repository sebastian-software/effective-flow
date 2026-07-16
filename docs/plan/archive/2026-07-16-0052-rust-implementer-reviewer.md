# 0052: Rust-Implementer und Rust-Reviewer

**Planungsstatus:** Umgesetzt
**Quelle:** /plan
**Empfohlener Workflow:** Feature (`/build`)

## Anforderung

Analog zu den bestehenden Backend-Agents `sf-nodejs-implementer` und
`sf-nodejs-reviewer` sollen zwei neue Agent-Skills für Rust entstehen:
`sf-rust-implementer` und `sf-rust-reviewer`. Sie bilden dieselbe fachliche Tiefe
ab wie ihre Node.js-Pendants, jedoch auf die Rust-Welt zugeschnitten (Cargo,
Ownership/Borrowing, `Result`-Fehlerbehandlung, Clippy, `rustfmt`, Trait-Design,
`unsafe`, async/Tokio).

Zusätzlich sollen die neuen Agents vollständig in die Orchestratoren
(`sf-build`, `sf-fix`, `sf-refactor`, `sf-review`, `sf-maintain`) eingebunden
werden, damit Rust-Projekte erkannt und korrekt geroutet werden. Damit ein
End-to-End-Rust-Workflow tatsächlich validiert und getestet wird, erhalten
`sf-code-validator` und `sf-test-writer` eine minimale Cargo-Awareness (Variante
b aus der Klärung).

Begründung der Workflow-Empfehlung: Es entsteht neue Funktionalität (zwei neue
Agents plus erweiterte Routing-/Erkennungslogik in mehreren Skills). Das ist ein
Feature und gehört in den `/build`-Workflow, nicht in Bugfix, Refactoring oder
reine Dokumentation.

## Architekturentscheidungen

- **Zwei neue `type: agent`-Skills.** Jeder Worker im Projekt ist ein
  `skills/sf-*/SKILL.md` mit `type: agent`. `build.mjs` entdeckt jeden `sf-*`-
  Ordner automatisch (`readdirSync(SOURCE_DIR).filter(startsWith('sf-'))`) und
  erzeugt daraus sowohl einen Claude-Agent (`dist/.../agents/<short>.md`) als auch
  einen Codex-Agent (`dist/codex/agents/sf-*.toml`). **Es ist keine Änderung an
  `build.mjs` nötig** – neue Ordner reichen aus. `dist/` ist generierter Output und
  wird nicht von Hand bearbeitet.
- **Strikte Spiegelung der Node.js-Agents.** Frontmatter-Struktur, Modellwahl und
  Tool-Sets werden von den Node.js-Agents übernommen, damit die neuen Agents sich
  konsistent in den Bestand einfügen:
  - `sf-rust-implementer`: `claude.model: opus`, `claude.color: cyan`,
    `tools: [Read, Write, Edit, Bash, Glob, Grep]`; `codex.model: gpt-5.5`,
    `model_reasoning_effort: high`, `sandbox_mode: danger-full-access`.
  - `sf-rust-reviewer`: `claude.model: opus`, `claude.color: red`,
    `tools: [Read, Glob, Grep]`; `codex.model: gpt-5.5`,
    `model_reasoning_effort: high`, `sandbox_mode: read-only`.
  - Begründung: identische Modell-/Sandbox-Wahl wie die Node.js-Agents; abweichende
    Werte nur, wenn ein konkreter Grund dokumentiert ist (hier keiner).
- **Wiederverwendung geteilter Includes.** Beide Agents nutzen dieselben
  `include`-Blöcke wie die Node.js-Agents (`language-rules`, `task-tracking`; der
  Implementer zusätzlich `pre-commit-gate` und `commit-message-rules`). Keine neuen
  Shared-Includes nötig.
- **„Rust“ als eigener Projekt-Typ.** Die zentrale Projekt-Typ-Erkennung in
  `sf-build` wird um Rust erweitert. Gemischte Repos (z. B. Tauri/WASM mit Rust +
  JS-Frontend) werden wie „Fullstack“ behandelt: Rust-Dateien zu den Rust-Agents,
  JS/TS-Dateien zu den bestehenden Agents.
- **Zentrale Erkennung, lokale Routing-Zeilen.** `sf-fix`, `sf-refactor` und
  `sf-review` verweisen für die Erkennung auf „Wie bei `sf-build`". Ihre jeweils
  eigenen, explizit aufgezählten Routing-Listen (Frontend/Backend) müssen aber um
  eine Rust-Zeile ergänzt werden, sonst greift das neue Routing dort nicht.
- **Minimale Cargo-Awareness statt eigener Rust-Validator/Test-Agents.** Gemäß
  Variante b erhalten `sf-code-validator` und `sf-test-writer` lediglich einen
  zusätzlichen Hinweis, Cargo-Toolchains zu erkennen und die passenden Kommandos
  zu verwenden. Es werden bewusst **keine** separaten `sf-rust-validator`/
  `sf-rust-test-writer`-Agents angelegt (Variante c verworfen, um den Agent-Bestand
  schlank zu halten).
- **`{{AGENT:...}}`-Token-Konvention.** Verweise zwischen Skills nutzen
  ausschließlich die `{{AGENT:sf-…}}`- bzw. `{{SKILL:sf-…}}`-Platzhalter, die der
  Build pro Ziel (Claude `/x`, Codex `$x`/`x`) auflöst. Keine hartkodierten
  Skill-Namen.

## Betroffene Dateien

| Datei                                 | Beschreibung                                                                                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `skills/sf-rust-implementer/SKILL.md` | **Neu.** Agent-Skill (`type: agent`) für Rust-Implementierung, gespiegelt an `sf-nodejs-implementer`, mit Rust-spezifischen Abschnitten.                                                   |
| `skills/sf-rust-reviewer/SKILL.md`    | **Neu.** Agent-Skill (`type: agent`) für Rust-Review, gespiegelt an `sf-nodejs-reviewer`, mit Rust-spezifischen Prüffeldern.                                                               |
| `skills/sf-build/SKILL.md`            | Projekt-Typ-Tabelle um Rust-Signale erweitern; Routing-Tabelle um Rust-Zeile (Implementer/Reviewer); Delegationsregeln- und Implementer-Auswahlliste in Phase 2 um Rust ergänzen.          |
| `skills/sf-fix/SKILL.md`              | Routing-Liste um Rust-Zeile (`{{AGENT:sf-rust-implementer}}`) ergänzen; Implementer-Auswahl in der Fix-Phase um Rust erweitern; Frontmatter-`description` ggf. um Rust-Erwähnung ergänzen. |
| `skills/sf-refactor/SKILL.md`         | Frontmatter-`description` um Rust ergänzen; falls eine eigene Routing-Auflistung vorhanden ist, Rust-Zeile ergänzen (Erkennung bleibt „Wie bei `sf-build`").                               |
| `skills/sf-review/SKILL.md`           | Reviewer-Routing in Phase 2c um Rust → `{{AGENT:sf-rust-reviewer}}` ergänzen; Projekt-Typ-Label und Verzeichnis-Split-Heuristik um typische Rust-Pfade (`src/`, `crates/`) erweitern.      |
| `skills/sf-maintain/SKILL.md`         | Implementer-Routing (Major-Bump-Anpassung) und Reviewer-Routing um Rust-Zeilen ergänzen.                                                                                                   |
| `skills/sf-code-validator/SKILL.md`   | Minimale Cargo-Awareness: Erkennung von `Cargo.toml`/Cargo-Workspace und Nutzung von `cargo build`, `cargo clippy`, `cargo fmt --check` zusätzlich zu den package.json-Scripts.            |
| `skills/sf-test-writer/SKILL.md`      | Minimale Cargo-Awareness: Rust-Tests (`cargo test`, `#[test]`, Unit-Tests im Modul, Integrationstests unter `tests/`) als zusätzliches Muster neben den JS/TS-Test-Patterns.               |
| `README.md`                           | Agent-Tabelle um zwei Zeilen (`sf-rust-implementer`, `sf-rust-reviewer`) ergänzen; ggf. Plugin-Beschreibung/Tags um „rust“ erweitern.                                                      |

Nicht angefasst: `build.mjs` (Auto-Discovery genügt), `dist/**` (generierter
Output), übrige Skills ohne Domänen-Routing.

## Implementierungsdetails

### Vorgehen

1. **`sf-rust-implementer` anlegen.** Frontmatter wie unter
   „Architekturentscheidungen“ beschrieben. Body spiegelt die Struktur von
   `sf-nodejs-implementer` (Includes `language-rules`, `task-tracking`; am Ende
   `pre-commit-gate`, `commit-message-rules`) und ersetzt die Node-Abschnitte durch
   Rust-Themen:
   - **Projektstruktur/Cargo:** `Cargo.toml`/`Cargo.lock`, Workspaces, Crates,
     Module (`mod`), Sichtbarkeit (`pub`), Feature-Flags.
   - **Fehlerbehandlung:** `Result`/`Option`, `?`-Operator, eigene Error-Typen,
     `thiserror`/`anyhow` projektabhängig, kein `unwrap`/`expect` in Produktivpfaden.
   - **Ownership & Typen:** Ownership/Borrowing/Lifetimes idiomatisch, sinnvolle
     Trait-Abstraktionen, `From`/`Into`, Generics statt Duplikation.
   - **Nebenläufigkeit:** async/`tokio` bzw. `async-std` projektabhängig, `Send`/
     `Sync`, Vermeidung von Daten-Races, sinnvoller Einsatz von Kanälen.
   - **`unsafe`:** nur mit Begründung, gekapselt, mit Sicherheits-Invarianten als
     Kommentar.
   - **CLI (falls zutreffend):** `clap` o. ä., saubere Trennung stdout/stderr,
     korrekte Exit-Codes, `--help`.
   - **Toolchain:** `cargo fmt`, `cargo clippy`, Tests via `cargo test`;
     `pnpm`-/npx-Regel entfällt, stattdessen Cargo-Konventionen.
   - **Dateilänge:** wie bei Node.js – aufteilen statt komprimieren (z. B. Module
     pro Verantwortlichkeit), bestehende Kommentare nicht kürzen.
2. **`sf-rust-reviewer` anlegen.** Frontmatter wie beschrieben. Body spiegelt
   `sf-nodejs-reviewer`: Includes, Abschnitt „Designentscheidungen respektieren“
   (Verweis auf `{{AGENT:sf-frontend-reviewer}}` beibehalten), identisches
   Ausgabeformat (Schweregrad, Komplexität, Bereich, Datei/Stelle, Problem, Lösung,
   Konfidenz, Designentscheidung) und dieselben Regeln (nur Konfidenz ≥ 80, nur
   lesen, File-Splitting statt Kompression). Prüffelder auf Rust zugeschnitten:
   - Memory Safety, korrekter `unsafe`-Einsatz, fehlende Invarianten.
   - Fehlerbehandlung: unbehandelte `Result`, `unwrap`/`expect`/`panic!` in
     Bibliotheks-/Produktivpfaden, sinnvolle Error-Typen.
   - Idiomatik/Clippy: vermeidbare Klonungen, ineffiziente Allokationen,
     unnötige Lebenszeiten, fehlende `#[must_use]` wo sinnvoll.
   - Nebenläufigkeit: Blockieren des async-Executors, Deadlocks, fehlende
     `Send`/`Sync`-Garantien.
   - API-Design: öffentliche Schnittstellen, Trait-Bounds, Semver-Auswirkungen.
   - Security: Eingabevalidierung, Integer-Overflow-Annahmen, Umgang mit Secrets.
3. **`sf-build` erweitern.** In der Projekt-Typ-Tabelle eine Rust-Zeile ergänzen
   (Signale: `Cargo.toml`, `src/main.rs`, `src/lib.rs`, `crates/`, `.rs`-Dateien,
   Cargo-Workspace) und in der Routing-Tabelle die Zeile
   „Rust → `{{AGENT:sf-rust-implementer}}` / `{{AGENT:sf-rust-reviewer}}`".
   Fullstack-Hinweis ergänzen: Rust + JS/TS gemischt wie Fullstack behandeln.
   In Delegationsregeln und Phase-2-Implementer-Auswahl Rust-Zeile aufnehmen.
4. **`sf-fix`, `sf-refactor`, `sf-maintain` erweitern.** In den expliziten
   Routing-Listen jeweils eine Rust-Zeile ergänzen; Erkennung bleibt zentral „Wie
   bei `sf-build`". Frontmatter-`description` der Orchestratoren, die Implementer/
   Reviewer aufzählen, um die Rust-Agents ergänzen, soweit sinnvoll.
5. **`sf-review` erweitern.** Reviewer-Routing (Phase 2c) um
   „Rust → `{{AGENT:sf-rust-reviewer}}`" ergänzen; Verzeichnis-Split-Heuristik um
   Rust-typische Pfade (`src/`, `crates/<name>/src/`) erweitern; Projekt-Typ-Label
   im Report-Template um „Rust“ ergänzen.
6. **`sf-code-validator` und `sf-test-writer` um Cargo-Awareness ergänzen.**
   Jeweils ein knapper Abschnitt/Absatz: Cargo-Projekt erkennen (`Cargo.toml`) und
   die passenden Kommandos verwenden – Validator: `cargo build`, `cargo clippy
--all-targets`, `cargo fmt --check`; Test-Writer: `cargo test`, Unit-Tests im
   Modul (`#[cfg(test)] mod tests`) und Integrationstests unter `tests/`. Die
   bestehende JS/TS-Logik bleibt unverändert und Default; Cargo ist additiv.
7. **README aktualisieren.** Zwei Zeilen in der Agent-Tabelle ergänzen
   (`sf-rust-implementer` → Rust-Implementierung, opus; `sf-rust-reviewer` →
   Rust-Review, opus; Codex jeweils gpt-5.5). Optional Plugin-Beschreibung/Tags
   um „rust“ erweitern.
8. **Build ausführen** (`node build.mjs`) und prüfen, dass die Agent-Zahlen steigen
   und die neuen Dateien unter `dist/` erscheinen. Build erfolgt im
   `/build`-Workflow, nicht in diesem Plan.

### Komponenten-Struktur

Nicht relevant – es geht um Markdown-Skill-Definitionen, keine UI-Komponenten.

### State-Management

Nicht relevant.

### API-Anbindung

Nicht relevant.

### Styling-Ansatz

Nicht relevant.

### Barrierefreiheit

Nicht relevant.

### Edge Cases

- **Gemischtes Repo (Rust + JS/TS).** Erkennung muss beide Domänen melden und wie
  Fullstack routen; reine `.rs`-Änderungen dürfen nicht fälschlich an die Node.js-
  Agents gehen und umgekehrt.
- **Rust-Workspace mit mehreren Crates.** Erkennung über Workspace-`Cargo.toml`;
  Verzeichnis-Split in `sf-review` soll `crates/<name>/` als Split-Einheit erlauben.
- **Kein Cargo trotz `.rs`-Dateien** (z. B. Skripte). Konservativ als Rust
  behandeln, aber Validator/Test-Writer dürfen Cargo-Kommandos nur bei vorhandener
  `Cargo.toml` ausführen.
- **`unsafe`-Code im Review.** Reviewer muss `unsafe`-Blöcke gezielt prüfen statt
  pauschal abzulehnen; fehlende Sicherheits-Begründung ist ein Finding.
- **Build-Auto-Discovery.** Neue Ordner ohne gültige `SKILL.md`-Frontmatter
  (`type`) lassen den Build mit Fehler abbrechen – Frontmatter muss vollständig sein.

## Akzeptanzkriterien

- [x] `skills/sf-rust-implementer/SKILL.md` existiert mit `type: agent`, gültiger
      `claude`-/`codex`-Frontmatter (Modelle/Tools/Sandbox wie spezifiziert) und
      den Includes `language-rules`, `task-tracking`, `pre-commit-gate`,
      `commit-message-rules`.
- [x] `skills/sf-rust-reviewer/SKILL.md` existiert mit `type: agent`, `tools:
[Read, Glob, Grep]`, `sandbox_mode: read-only`, dem gespiegelten
      Ausgabeformat und der Regel „nur Findings mit Konfidenz ≥ 80“.
- [x] `node build.mjs` läuft fehlerfrei durch und erzeugt
      `dist/claude/.../agents/rust-implementer.md`,
      `dist/claude/.../agents/rust-reviewer.md` sowie
      `dist/codex/agents/sf-rust-implementer.toml` und
      `dist/codex/agents/sf-rust-reviewer.toml`; die Agent-Zähler in der
      Build-Zusammenfassung steigen entsprechend.
- [x] `sf-build` enthält Rust in Projekt-Typ-Tabelle und Routing-Tabelle und
      verweist über `{{AGENT:sf-rust-implementer}}`/`{{AGENT:sf-rust-reviewer}}`.
- [x] `sf-fix`, `sf-refactor`, `sf-review`, `sf-maintain` routen Rust auf die neuen
      Agents (in `sf-review` auf den Reviewer in Phase 2c).
- [x] `sf-code-validator` und `sf-test-writer` beschreiben die Cargo-Kommandos
      (`cargo build`/`clippy`/`fmt`/`test`) additiv, ohne die JS/TS-Logik zu
      verändern.
- [x] README listet beide neuen Agents in der Agent-Tabelle.
- [x] Es werden keine Dateien außerhalb von `skills/`, `README.md` (und dem
      generierten `dist/` durch den Build) geändert; `build.mjs` bleibt unverändert.

## Validierungsplan

- `node build.mjs` ausführen und Exit-Code sowie Build-Zusammenfassung prüfen
  (neue Agent-Zahlen, erwartete Dateien unter `dist/`).
- Verifizieren, dass `{{AGENT:sf-rust-implementer}}`/`{{AGENT:sf-rust-reviewer}}`
  in den generierten Claude-Agenten korrekt zu `/rust-implementer` bzw.
  `/rust-reviewer` und in den Codex-Artefakten passend aufgelöst werden.
- Per `grep` bestätigen, dass jede der fünf Orchestrator-Dateien mindestens eine
  Rust-Routing-Referenz enthält.
- Sichtprüfung der beiden neuen `SKILL.md` gegen die Node.js-Vorlagen auf
  strukturelle Gleichwertigkeit (Includes, Ausgabeformat, Regeln).
- Manuelle Stichprobe: einen kleinen fiktiven Rust-Scope gedanklich durch
  `sf-build`/`sf-review` führen und prüfen, dass das Routing greift.

## Annahmen und offene Punkte

- **Annahme:** Modell- und Sandbox-Wahl der Rust-Agents entspricht exakt den
  Node.js-Agents (opus/gpt-5.5; Implementer full-access, Reviewer read-only). Falls
  Rust-Builds längere Laufzeiten/andere Ressourcen erfordern, kann das später
  angepasst werden – kein Blocker für die Planung.
- **Annahme:** Die minimale Cargo-Awareness in Validator/Test-Writer genügt für
  gängige Cargo-Projekte; exotische Build-Systeme (Bazel, `cargo-make`, custom
  xtask) sind nicht Teil dieses Plans.
- **Annahme:** Konkrete Crate-Wahl für Fehlerbehandlung/CLI (`anyhow`/`thiserror`/
  `clap`) wird nicht vorgeschrieben, sondern projektabhängig erkannt; die Agents
  formulieren Empfehlungen relativ zum vorhandenen Stack.
- **Offen (bewusst, nicht-blockierend):** Ob die Plugin-Tags/Marketplace-
  Beschreibung in `build.mjs`/README zwingend „rust“ enthalten sollen, ist
  kosmetisch; Standard ist ergänzen, da konsistent mit „nodejs“.
- **Offen (bewusst):** Variante c (eigene Rust-Validator/Test-Writer-Agents) wurde
  verworfen. Sollte sich die additive Cargo-Awareness als zu eng erweisen, ist ein
  Folgeplan möglich.

## Testergebnisse

**Datum:** 2026-06-29

Für Markdown-Agent-Definitionen gibt es kein Unit-Test-Framework; die Verifikation
erfolgt über den Build und objektive Checks:

- `node build.mjs` läuft fehlerfrei durch. Agent-Zähler von 9 → 11 (Claude und
  Codex je 11 Agents); die vier neuen Artefakte
  `dist/.../agents/rust-implementer.md`, `rust-reviewer.md`,
  `dist/codex/agents/sf-rust-implementer.toml` und `sf-rust-reviewer.toml` wurden
  erzeugt.
- Generierte Frontmatter geprüft: Implementer `model: opus`/`color: cyan`/volle
  Tools bzw. Codex `gpt-5.5`/`high`/`danger-full-access`; Reviewer `opus`/`red`/
  `Read, Glob, Grep` bzw. Codex `read-only`. Includes sind aufgelöst.
- Token-Auflösung verifiziert: `{{AGENT:sf-rust-*}}` → `/rust-*` (Claude) bzw.
  `sf-rust-*` (Codex); Cross-Reference `{{AGENT:sf-frontend-reviewer}}` löst korrekt
  auf.
- Rust-Routing in allen fünf Orchestratoren per `grep` bestätigt (sf-build 4,
  sf-fix 3, sf-refactor 1, sf-review 3, sf-maintain 2 Referenzen).
- `build.mjs` unverändert (Auto-Discovery genügt); `oxfmt` über alle geänderten
  Dateien fehlerfrei.

## Review-Findings

**Datum:** 2026-06-29
**Reviewer:** Self-Review (Orchestrator; spezialisierte Reviewer für Markdown-Agent-Definitionen nicht sinnvoll)

### Zusammenfassung

| Status                  | Anzahl |
| ----------------------- | -----: |
| Behoben                 |      0 |
| Offen / Nicht umgesetzt |      0 |

Keine Findings gefunden. Die Umsetzung erfüllt alle Akzeptanzkriterien; der
bewusst nicht in `build.mjs` aufgenommene „rust“-Marketplace-Tag ist als
kosmetischer offener Punkt dokumentiert (Akzeptanzkriterium: `build.mjs` bleibt
unverändert).

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
| Wartbarkeit |        0 |       0 |       0 |

### Befunde

- **Architektur (Hinweis):** Die Projekt-Typ-Erkennung ist in `sf-build`
  zentralisiert, aber `sf-fix`/`sf-refactor`/`sf-maintain` führen eigene Routing-
  Listen. Der Plan adressiert das, indem jede Liste explizit ergänzt wird; bei
  künftigen Domänen bleibt diese Duplikation eine bekannte Wartungsstelle.
- **Security (Hinweis):** Rust-spezifisches Risiko ist primär `unsafe`-Code; der
  Reviewer-Auftrag deckt das explizit als Prüffeld ab, statt es generisch zu
  behandeln.
- **Fehlerfälle (Hinweis):** Gemischte Repos und Cargo-lose `.rs`-Dateien sind als
  Edge Cases erfasst; Validator/Test-Writer führen Cargo-Kommandos nur bei
  vorhandener `Cargo.toml` aus.
- **Scope (Hinweis):** Variante b ist umgesetzt; Variante c (eigene Rust-Validator/
  Test-Writer-Agents) ist bewusst ausgeschlossen und als Folgeoption dokumentiert,
  um Scope Creep zu vermeiden.
