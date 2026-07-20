# 0033: Gemini-CLI-Plattform-Target

**Planungsstatus:** Nicht umgesetzt
**Empfohlener Workflow:** Feature (`/effective-flow build`)

## Ziel

Effective Flow erhält Gemini CLI als viertes Build-Artefakt: neben den nativen Targets für
Claude Code und Codex sowie dem portablen Manager-Target entsteht eine installierbare
Gemini-CLI-Extension. Alle vier Artefakte werden aus derselben Source-to-Dist-Pipeline erzeugt;
Gemini führt keinen separaten Bestand an Workflow-Anweisungen ein.

Der Scope umfasst ausschließlich Gemini CLI. Gemini Web, Google AI Studio und IDE-spezifische
Gemini-Code-Assist-Oberflächen sind nicht Teil dieses Vorhabens.

## Verifizierter Ist-Zustand

### Quellen und Build

- `src/SKILL.md` ist der dünne Router. Er veröffentlicht den gruppierten Tool-Katalog und lädt
  nur das konkret aufgerufene `tools/<tool>.md`.
- `src/tools/` enthält aktuell 17 über `TOOL_GROUPS` abgeleitete, öffentlich aufrufbare Tools
  und 6 interne Tools. Die Zahlen werden im Build nicht dupliziert, sondern aus
  `TOOL_GROUPS` und der Source-Discovery abgeleitet.
- `src/agents/` enthält aktuell 15 Agent-Verträge. Auch deren Anzahl wird aus den vorhandenen
  Quelldateien abgeleitet.
- `src/shared/` enthält eager eingebundene und über `lazy-include` ausgelieferte Fragmente.
- `src/scripts/` enthält die laufzeitrelevanten, abhängigkeitsfreien Ressourcen
  `remote-tracker.mjs` und `remote-tracker-core.mjs`.
- `build-lib.mjs` besitzt die reinen Parser, Renderer und Guards; `build.mjs` übernimmt
  Dateisystem-I/O, Source-Discovery, Artefakt-Erzeugung, Build-Zusammenfassung und Guards.
- `test/build-lib.test.mjs` prüft die reinen Transformationen. Weitere repositoryweite Tests
  prüfen Ausführungs- und Dokumentationsverträge.
- Der Build erzeugt derzeit `dist/claude/`, `dist/codex/` und `dist/portable/` zunächst unter
  `dist.tmp/`. Erst nach allen Guards wird der vollständige Baum atomar auf `dist/` getauscht;
  bei einem Fehler bleibt das vorherige `dist/` erhalten.
- Die semantische Release-Version stammt aus `.release-please-manifest.json`. Der Router-Stempel
  ergänzt den Git-Kurz-Hash; ein Guard verhindert Versionsdrift zwischen Targets.
- `pnpm test:distribution` prüft Build, Release-Archiv, Installer und den auf `main` gestagten
  portablen Auslieferungsbaum.

### Bestehende Auslieferung

- `develop` ist der Source- und Release-Please-Branch.
- Der Default-Branch `main` ist vertraglich für genau einen portablen
  `effective-flow/`-Manager-Kandidaten plus Consumer-Dokumentation reserviert. Er enthält keine
  nativen Wrapper und darf keinen zweiten `skills/effective-flow/`-Kandidaten bekommen.
- Das Release-Archiv enthält die nativen Claude-/Codex-Artefakte und das portable Target.
- `install-skill.sh`, `local-common.sh` und `local-link.sh` bedienen die bestehende native
  Claude-Code-/Codex-Installation beziehungsweise deren lokale Entwicklung. Sie werden nicht
  zum Gemini-Installer erweitert.

## Verbindliche Gemini-CLI-Verträge

Die Planung basiert auf der offiziellen Dokumentation für Gemini CLI v0.39.1:

- [Extension-Referenz](https://github.com/google-gemini/gemini-cli/blob/v0.39.1/docs/extensions/reference.md)
- [Extension-Veröffentlichung](https://github.com/google-gemini/gemini-cli/blob/v0.39.1/docs/extensions/releasing.md)
- [Custom Commands](https://github.com/google-gemini/gemini-cli/blob/v0.39.1/docs/cli/custom-commands.md)
- [Agent Skills](https://github.com/google-gemini/gemini-cli/blob/v0.39.1/docs/cli/creating-skills.md)
- [Subagents](https://github.com/google-gemini/gemini-cli/blob/v0.39.1/docs/core/subagents.md)

Unmittelbar vor der Implementierung werden diese fünf Quellen erneut gegen die dann aktuelle
Gemini-CLI-Version geprüft. Das gilt insbesondere für Subagents, da ihr Vertrag in v0.39.1 noch
Preview ist. Widerspricht der aktuelle Vertrag der hier festgelegten Manifest-, Command-, Skill-
oder Agent-Struktur, stoppt die Umsetzung mit einer konkreten Inkompatibilitätsmeldung; sie lässt
keine Agents stillschweigend weg und behauptet keine unbestätigte Plattformparität.

## Architekturentscheidungen

### Ein viertes Target in derselben Pipeline

`build.mjs` erhält `dist.tmp/gemini/effective-flow/` als viertes Ziel. Nach erfolgreichem
atomarem Swap liegt die Extension unter `dist/gemini/effective-flow/`. Die bestehenden drei
Targets ändern ihre Bedeutung und Installationsverträge nicht.

Die Gemini-Struktur lautet:

```text
dist/gemini/effective-flow/
├── gemini-extension.json
├── commands/
│   └── effective-flow/
│       └── <exposed-tool>.toml
├── skills/
│   └── effective-flow/
│       ├── SKILL.md
│       ├── tools/
│       │   └── <exposed-or-internal-tool>.md
│       ├── shared/
│       │   └── <lazy-fragment>.md
│       └── scripts/
│           ├── remote-tracker.mjs
│           └── remote-tracker-core.mjs
└── agents/
    └── effective-flow-<agent>.md
```

`dist/` bleibt generiert und gitignoriert. Die Umsetzung bearbeitet keine dortigen Dateien als
Quellen.

### Router, Commands und Argumente

- `skills/effective-flow/SKILL.md` bleibt der einzige Gemini Agent Skill und behält das
  Progressive-Disclosure-Modell des dünnen Routers bei.
- Alle Source-Tools – öffentlich und intern – werden unter
  `skills/effective-flow/tools/` ausgeliefert. Interne Tools bleiben ausschließlich
  routergeladene Dateien.
- Für jedes aus `TOOL_GROUPS` abgeleitete öffentliche Tool entsteht genau eine Datei
  `commands/effective-flow/<tool>.toml`. Der pfadbasierte Namespace ergibt den vorgesehenen
  Befehl `/effective-flow:<tool>`.
- Interne Tools erhalten keine Command-Datei. Der Build leitet die Sollmenge der Commands aus
  `EXPOSED_TOOLS` ab und prüft auf fehlende, zusätzliche oder kollidierende Namen.
- Jede Command-Datei enthält `description` und einen mit dem vorhandenen `tomlString`-Ansatz
  sicher serialisierten `prompt`. Der Prompt delegiert exakt an den Router und das benannte
  Tool; Gemini ersetzt dabei sein eigenes `{{args}}` durch die Benutzerargumente.
- `{{args}}` wird bei der Effective-Flow-Transformation ausdrücklich geschützt und bleibt
  bytegetreu in der erzeugten TOML-Datei erhalten. Leere Argumente sind zulässig.
- Es wird kein `!{...}` eingebaut. Die Extension führt daher durch die Command-Erzeugung keine
  Shell-Befehle vorab aus.
- Extension-Commands haben gemäß Gemini CLI v0.39.1 die niedrigste Priorität. Kollidiert ein
  Extension-Command mit einem gleichnamigen Projekt- oder User-Command, stellt Gemini den
  Extension-Command automatisch zusätzlich unter einem aus Extension-Name, Punkt und bisherigem
  Command-Namen gebildeten Fallback bereit. Für den normalen Befehl `/effective-flow:plan` der
  Extension `effective-flow` ist der abgeleitete Fallback deshalb
  `/effective-flow.effective-flow:plan`; allgemein gilt hier
  `/effective-flow.effective-flow:<tool>`. Der feste `effective-flow`-Unterordner minimiert
  Konflikte. Dokumentation und Tests zeigen sowohl den normalen konfliktfreien Namen als auch
  diesen exakten Fallback und behandeln die tatsächliche `/help`-Anzeige als maßgeblich.

### Rendering der Source-Syntax

Der Gemini-Renderer wird als reine Transformation in `build-lib.mjs` ergänzt und durch
`build.mjs` mit denselben bekannten Tool-/Agent-Mengen wie die bestehenden Renderer aufgerufen.
Er behandelt die Source-Syntax wie folgt:

| Source-Syntax                           | Gemini-Ausgabe                                                                     |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `{{SKILL:X}}` für ein öffentliches Tool | `/effective-flow:X`                                                                |
| `{{SKILL:X}}` für ein internes Tool     | `` `tools/X.md` ``                                                                 |
| `{{AGENT:X}}`                           | `` `effective-flow-X` ``                                                           |
| `{{VERSION}}`                           | Release-Please-Version plus Git-Kurz-Hash im Router-/Textkontext                   |
| `include`                               | eager eingebetteter Inhalt aus `src/shared/X.md`                                   |
| `lazy-include`                          | Gemini-kompatibler Ladezeiger auf `shared/X.md`; Fragment wird einmal ausgeliefert |
| `ask`                                   | bedingte, textbasierte Frage mit erhaltenen Optionen und Bedingungen               |

Die routerinternen Generator-Platzhalter für Katalog, Invocation und Worker-Auflösung werden
ebenfalls vor dem Schreiben vollständig ersetzt. Der Abschluss-Guard darf in keiner
Gemini-Markdown- oder TOML-Datei ungelöste Effective-Flow-Platzhalter oder Direktiven finden.
Geminis `{{args}}` ist die einzige bewusst verbleibende Mustache-Sequenz in Command-Prompts.

### Agents und plattformspezifische Metadaten

- Jeder Vertrag unter `src/agents/*.md` erhält einen expliziten `gemini:`-Block. Er enthält die
  für diesen Agent freigegebenen Gemini-Toolnamen und nur solche weiteren Felder, die die vor der
  Implementierung revalidierte Subagent-Spezifikation unterstützt.
- Der Renderer liest ausschließlich diesen `gemini:`-Block. Er leitet weder Modell- oder
  Toolwerte noch Sandbox-Einstellungen aus `claude:` oder `codex:` ab.
- Wenn kein Gemini-Modell festgelegt ist, wird das Feld bewusst weggelassen und Gemini verwendet
  seinen dokumentierten Standard. Es wird kein Claude-/Codex-Modellname als Fallback übernommen.
- Ein in Gemini nicht vorhandenes Sandbox-Feld wird nicht simuliert. Unbekannte Gemini-Felder,
  Toolnamen oder unvollständige Pflichtmetadaten brechen den Build mit Dateipfad und Agent-Namen
  ab.
- Aus jeder Agent-Quelle entsteht genau ein Preview-Subagent
  `agents/effective-flow-<agent>.md`. Sein YAML-Frontmatter deklariert denselben
  `effective-flow-<agent>`-Namen, die bereinigte Beschreibung und die expliziten Gemini-Werte;
  sein Body stammt aus dem gemeinsamen Agent-Vertrag.

### Manifest und bewusst ausgelassene Features

`gemini-extension.json` wird deterministisch mit `JSON.stringify` erzeugt und enthält genau die
für den gewählten MVP benötigten Felder: den Namen `effective-flow`, die semantische Version aus
`.release-please-manifest.json` und die Extension-Beschreibung.

Es gibt kein `GEMINI.md` und kein `contextFileName`: immer geladener Extension-Kontext würde den
dünnen Router und Lazy Loading unterlaufen. Ohne konkrete Produktanforderung werden außerdem
keine MCP-Server, Settings, Policies, Themes, Hooks oder `excludeTools` in das Manifest
aufgenommen.

## Auslieferungsdesign

### Dedizierter Branch `gemini`

Der Default-Branch `main` bleibt unverändert der einzige portable Manager-Kandidat. Die
Gemini-Extension wird stattdessen auf einem dedizierten, maschinell verwalteten Branch
`gemini` veröffentlicht. Dessen Repository-Root ist eine exakte, installierbare Kopie des Inhalts
von `dist/gemini/effective-flow/`; `gemini-extension.json` liegt also direkt am Branch-Root.

Die Benutzerinstallation lautet:

```sh
gemini extensions install https://github.com/sebastian-software/effective-flow --ref gemini
```

Die lokale Entwicklung verwendet das gebaute Target direkt:

```sh
gemini extensions link dist/gemini/effective-flow
```

`install-skill.sh`, `local-common.sh` und `local-link.sh` bleiben auf Claude Code und Codex
begrenzt. Sie rufen Gemini nicht auf und ein fehlendes `gemini`-Binary beeinflusst den normalen
Build nicht.

### Staging und Release-Workflow

- `scripts/stage-delivery.mjs` erhält neben der unveränderten `main`-Staging-Funktion einen
  expliziten Gemini-Modus. Dieser leert ausschließlich den verifizierten Gemini-Branch-Worktree
  und kopiert den Inhalt von `dist/gemini/effective-flow/` an dessen Root. Die portable
  `stageDelivery`-Funktion und ihr Ein-Kandidaten-Guard bleiben unverändert.
- `.github/workflows/release.yml` baut und prüft weiterhin auf `develop`. Bei einer von
  Release Please erzeugten Version wird zusätzlich zum Archiv und zu `main` ein Worktree des
  vorab angelegten, maschinell verwalteten Branches `gemini` erstellt, über den Gemini-Modus
  gestagt, statisch geprüft, als neuer nicht erzwungener Delivery-Commit geschrieben und nach
  `gemini` gepusht.
- Der Workflow prüft anschließend, dass der Remote-Branch auf genau diesem Commit steht und dass
  dessen Root dem gebauten Extension-Baum entspricht. Ein fehlender Branch, ein abweichender
  Baum oder ein zweiter Extension-Root lässt die Release-Auslieferung sichtbar fehlschlagen.
- `scripts/distribution-smoke.mjs` erhält einen Gemini-Layout- und
  Gemini-Delivery-Modus. Der Offline-Smoke prüft das vierte Target und das gestagte Branch-Root;
  der Archiv-Smoke erwartet das Gemini-Target zusätzlich. Der bestehende `main`-Smoke erwartet
  weiterhin exakt einen portablen Kandidaten und keine Target-Wrapper.
- Die Release-Dokumentation beschreibt die einmalige Anlage des Branches `gemini`; danach wird er
  ausschließlich durch den Release-Workflow fortgeschrieben. Es gibt keinen Force-Push.

## Betroffene Quelldateien der späteren Umsetzung

| Datei oder Bereich                                      | Geplante Änderung                                                                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `build-lib.mjs`                                         | Reine Gemini-Referenz-, Body-, Command- und Agent-Metadaten-Transformationen sowie statische Guards ergänzen                                     |
| `build.mjs`                                             | Viertes Target, Source-Discovery-Verwendung, Verzeichnisse, Manifest/Commands/Skills/Agents, Zusammenfassung, Guards und atomaren Swap erweitern |
| `test/build-lib.test.mjs`                               | Unit-Tests für Gemini-Rendering, `{{args}}`-Erhalt, TOML-Escaping, Metadaten und Fehlerfälle ergänzen                                            |
| weitere bestehende `test/*.test.mjs` nach Zuständigkeit | Repositoryweite Build- und Vertragschecks auf vier Targets erweitern                                                                             |
| `src/agents/*.md`                                       | Für alle aus der Source-Discovery gefundenen Agents explizite `gemini:`-Metadaten ergänzen                                                       |
| `src/SKILL.md`, `src/tools/*.md`, `src/shared/*.md`     | Nur ändern, falls die gemeinsame Formulierung einen verifizierten Gemini-neutralen Hinweis benötigt; keine Gemini-Kopie der Verträge anlegen     |
| `AGENTS.md`                                             | Build-Architektur, Target-Regeln und Agent-Frontmatter für Gemini dokumentieren                                                                  |
| `scripts/stage-delivery.mjs`                            | Separaten Gemini-Branch-Staging-Modus ergänzen, ohne den `main`-Vertrag zu lockern                                                               |
| `scripts/distribution-smoke.mjs`                        | Gemini-Build-, Archiv- und Branch-Root-Checks ergänzen                                                                                           |
| `.github/workflows/release.yml`                         | Geprüfte Auslieferung auf den Branch `gemini` ergänzen                                                                                           |
| `package.json`                                          | Beschreibung von zwei Harnesses auf die aktuelle Multi-Target-Auslieferung aktualisieren; vorhandene Check-Skripte beibehalten                   |
| `README.md`                                             | Gemini CLI als drittes natives Laufzeitziel, Installation über `--ref gemini` und lokalen Link dokumentieren                                     |
| `docs/user-guide/README.md`                             | Gemini-Einstieg und Navigation zu Installation, Nutzung und Fehlerdiagnose ergänzen                                                              |
| `docs/user-guide/getting-started.md`                    | Gemini-Installation, Befehlsnamespace und erste Nutzung ergänzen                                                                                 |
| `docs/user-guide/troubleshooting.md`                    | Command-Konflikte samt exaktem Punkt-Fallback, Preview-Subagents und Branch-/Installationsdiagnose ergänzen                                      |
| `docs/user-guide/glossary.md`                           | Harness-Begriff und Aufrufsyntax um Gemini CLI, `/effective-flow:<tool>` und den Konflikt-Fallback erweitern                                     |
| `docs/developer-guide/README.md`                        | Architekturübersicht auf Gemini erweitern                                                                                                        |
| `docs/developer-guide/architecture.md`                  | Viertes Build-Target und getrennte Branch-Auslieferung dokumentieren                                                                             |
| `docs/developer-guide/build-system.md`                  | Renderer, Direktiven, Guards, Metadaten und Validierung für Gemini dokumentieren                                                                 |
| `docs/developer-guide/release-and-installation.md`      | Vier-Target-Archiv sowie Lebenszyklus, Installation und Prüfung des dedizierten Branches `gemini` dokumentieren                                  |
| `docs/developer-guide/skill-ownership.md`               | Orchestrierungsverantwortung von „Claude/Codex transformation“ auf Gemini-/Multi-Target-Transformation erweitern                                 |
| `docs/developer-guide/skill-ownership.json`             | Mit dem Guide maschinell abgleichen; nur bearbeiten, falls sich dabei eine strukturierte Beziehung oder Klassifikation tatsächlich ändert        |

`dist/**` ist ausschließlich Build-Ausgabe und keine Liste direkt zu editierender Quelldateien.

## Umsetzungsschritte

1. Die fünf offiziellen Gemini-Quellen frisch prüfen und die unterstützten Manifest-, Command-,
   Skill- und Preview-Subagent-Felder protokollieren. Bei Inkompatibilität vor dem ersten
   Produktcode-Schritt abbrechen.
2. In `build-lib.mjs` den Gemini-Harness ergänzen: Referenzen, `ask`, Lazy-Ladezeiger,
   Command-Prompt/TOML-Serialisierung und explizite Agent-Metadaten rein transformieren. Unit-Tests
   zuerst um positive und negative Fälle erweitern.
3. Alle `src/agents/*.md` um validierte `gemini:`-Blöcke ergänzen. Die Toolmenge pro Agent wird
   fachlich aus dessen Vertrag abgeleitet und gegen die offizielle Gemini-Toolliste geprüft.
4. In `build.mjs` `DIST_GEMINI` und die Extension-Verzeichnisse unter `dist.tmp/` ergänzen.
   Manifest, genau einen Router-Skill, alle Tool-Ressourcen, abgeleitete Lazy-Fragmente,
   Runtime-Scripts, Commands nur für öffentliche Tools und einen Subagent pro Agent-Quelle
   erzeugen.
5. Die vorhandenen Guards und die Build-Zusammenfassung auf Gemini erweitern: Mengen werden aus
   `TOOL_GROUPS`, Tool-Dateien, Agent-Dateien, Lazy-Fragmenten und Runtime-Script-Liste abgeleitet,
   nicht als neue feste Zahlen gepflegt.
6. Staging, Distribution-Smoke und Release-Workflow um den dedizierten Branch `gemini` ergänzen;
   den `main`-Ein-Kandidaten-Vertrag unverändert testen.
7. README, User Guide, Developer Guide und `AGENTS.md` auf die verifizierte Zielarchitektur und
   die beiden nativen Gemini-Befehle für Installation und lokalen Link aktualisieren.
8. Die vollständige Validierung ausführen und bei lokal vorhandenem Gemini CLI zusätzlich den
   nativen Smoke-Test durchführen.

## Edge Cases und Fehlerverhalten

- **Gemini CLI fehlt lokal:** Alle statischen Checks und der normale Build bleiben verpflichtend
  und erfolgreich möglich. Nur der native Smoke wird mit dokumentiertem Grund übersprungen.
- **Preview-Schema hat sich geändert:** Der Build verwirft oder schätzt keine Metadaten. Die
  Umsetzung stoppt vor der Auslieferung und nennt den inkompatiblen Vertrag.
- **Command-Namenskonflikt:** Der Build verhindert interne Duplikate. Bei einer Kollision gewinnt
  der Projekt-/User-Command den normalen Namen; Gemini CLI v0.39.1 stellt den Extension-Command
  mit vorangestelltem Extension-Namen und Punkt bereit. Aus `/effective-flow:plan` wird für diese
  Extension `/effective-flow.effective-flow:plan`. Statische Dokumentationschecks sichern diese
  konkrete Form; ein nativer Smoke bestätigt sie über `/help` in einer isoliert erzeugten
  Kollision, statt sie ohne laufendes Gemini CLI als praktisch getestet auszugeben.
- **TOML-Sonderzeichen oder mehrzeilige Prompts:** Der bestehende Basic-String-Serializer wird
  genutzt und mit Anführungszeichen, Backslashes, Zeilenumbrüchen und `{{args}}` getestet; es gibt
  keine ungeschützten dreifachen Anführungszeichen.
- **Leere Command-Argumente:** Der Prompt bleibt gültig und übergibt eine leere Argumentmenge an
  das fest benannte Tool.
- **Agent-Metadaten fehlen oder sind unbekannt:** Der Build bricht mit Source-Pfad und Feld ab,
  statt Claude-/Codex-Werte zu übernehmen oder einen Agent auszulassen.
- **Lazy-Fragment oder Runtime-Script fehlt:** Der Build bricht vor dem atomaren Swap ab; das
  vorherige `dist/` bleibt vollständig erhalten.
- **Gemini-Branch fehlt oder enthält Fremddateien:** Der Release-Schritt bricht vor dem Push ab.
  Der verifizierte Stager darf ausschließlich seinen separaten Worktree verändern und erzeugt
  einen exakten Extension-Root.
- **Default-Branch-Regressionsrisiko:** Der bestehende Delivery-Smoke beweist weiterhin genau
  einen portablen Kandidaten unter `effective-flow/`; Gemini wird weder nach `main` kopiert noch
  von den Claude-/Codex-Shell-Installern verwaltet.

## Akzeptanzkriterien

- [ ] `node build.mjs` erzeugt zusätzlich die oben definierte Struktur unter
      `dist/gemini/effective-flow/`, ohne die bestehenden Claude-, Codex- oder Portable-Layouts zu
      verändern.
- [ ] `gemini-extension.json` ist valides JSON und enthält exakt den Namen `effective-flow`, die
      semantische Release-Please-Version und die Beschreibung; nicht benötigte Manifest-Features
      sowie `GEMINI.md` und `contextFileName` fehlen.
- [ ] Die Command-Menge entspricht exakt den aus `TOOL_GROUPS` abgeleiteten öffentlichen Tools;
      interne Tools besitzen keine Command-Datei. Jede Datei liegt unter
      `commands/effective-flow/<tool>.toml` und ergibt `/effective-flow:<tool>`.
- [ ] Jede Command-TOML ist statisch valide, besitzt `prompt` und `description`, enthält genau den
      vorgesehenen Toolnamen und bewahrt Geminis `{{args}}`; kein Artefakt enthält `!{...}`.
- [ ] `skills/effective-flow/` enthält den dünnen Router, alle öffentlichen und internen Tools,
      alle abgeleiteten Lazy-Fragmente und die beiden aus `src/scripts/` entdeckten
      Runtime-Ressourcen.
- [ ] Alle Effective-Flow-Source-Direktiven und Generator-Platzhalter sind in Gemini-Artefakten
      vollständig gerendert. `{{args}}` bleibt ausschließlich dort erhalten, wo ein Gemini-Command
      Argumente entgegennimmt.
- [ ] Für jede entdeckte Agent-Quelle existiert genau ein
      `agents/effective-flow-<agent>.md` mit validem YAML-Frontmatter, übereinstimmendem
      namespaced Namen, Beschreibung und ausschließlich expliziten `gemini:`-Werten.
- [ ] Kein Gemini-Agent übernimmt Modell-, Tool- oder Sandbox-Werte aus `claude:` oder `codex:`;
      unbekannte Felder und Tools erzeugen einen klaren Build-Fehler.
- [ ] Der Versionsstempel ist in Claude, Codex, Portable und Gemini konsistent; das Manifest nutzt
      die semantische Version ohne Git-Hash.
- [ ] Build- und Distribution-Guards beweisen für alle vier Targets vollständige
      Lazy-Ressourcen, Runtime-Scripts, aufgelöste Agent-Referenzen und das Fehlen fremder
      Harness-Parameter.
- [ ] Der Branch `main` enthält nach dem Staging weiterhin genau den einen portablen
      `effective-flow/`-Kandidaten plus Consumer-Dokumentation und keine Gemini-Extension.
- [ ] Der maschinell verwaltete Branch `gemini` enthält am Root exakt den gebauten Extension-Baum
      und ist mit
      `gemini extensions install https://github.com/sebastian-software/effective-flow --ref gemini`
      installierbar.
- [ ] Die lokale Entwicklung ist mit
      `gemini extensions link dist/gemini/effective-flow` dokumentiert;
      `install-skill.sh`, `local-common.sh` und `local-link.sh` bleiben Claude-/Codex-spezifisch.
- [ ] Bei einem Projekt-/User-Command-Konflikt dokumentieren User Guide und Troubleshooting den
      v0.39.1-Fallback exakt als `/effective-flow.effective-flow:<tool>`; für
      `/effective-flow:plan` steht das konkrete Beispiel `/effective-flow.effective-flow:plan`.
- [ ] README, Benutzer- und Entwicklerdokumentation beschreiben dieselbe Vier-Target-Architektur,
      denselben Command-Namespace und dass Subagents vor der Umsetzung erneut als Preview-Vertrag
      geprüft werden.
- [ ] `docs/user-guide/README.md`, `getting-started.md`, `troubleshooting.md`, `glossary.md` sowie
      `docs/developer-guide/README.md`, `architecture.md`, `build-system.md`,
      `release-and-installation.md` und `skill-ownership.md` widersprechen weder dem
      Vier-Target- noch dem getrennten `main`-/`gemini`-Branch-Vertrag. Der
      Skill-Ownership-Guide und `skill-ownership.json` bleiben durch den bestehenden
      Ownership-Guard strukturell abgeglichen; eine reine Harness-Formulierungsänderung erzeugt
      keine erfundene Beziehung im Manifest.

## Validierung

Die spätere Umsetzung führt in dieser Reihenfolge mindestens aus:

```sh
pnpm agent:check
pnpm test
node build.mjs
pnpm test:distribution
```

Zusätzlich prüfen Build-Guards und Tests statisch:

1. JSON-Parsing und exakte erlaubte Schlüssel von `gemini-extension.json`;
2. TOML-Syntax des unterstützten Command-Subsets, Pflichtfelder, Escaping und unverändertes
   `{{args}}`;
3. YAML-Frontmatter, Pflichtfelder und erlaubte Gemini-Metadaten jedes Preview-Subagents;
4. exakte, aus den Quellen abgeleitete Tool-, Command- und Agent-Mengen;
5. vollständige Lazy-Fragmente und Runtime-Scripts in allen vier Targets;
6. identische Versionsstempel und semantische Manifest-Version;
7. keine ungelösten `{{SKILL:...}}`, `{{AGENT:...}}`, `{{VERSION}}`, `include`,
   `lazy-include`, `ask` oder routerinternen Platzhalter in erzeugten Artefakten;
8. `{{args}}` nur in Gemini-Commands und nirgendwo eine neu erzeugte `!{...}`-Shell-Injection;
9. bytegleichen Gemini-Build- und Branch-Root sowie den unveränderten Ein-Kandidaten-Vertrag von
   `main`;
10. einen fehlgeschlagenen Build vor dem atomaren Swap, bei dem das vorherige `dist/` erhalten
    bleibt;
11. den exakten dokumentierten Konflikt-Fallback `/effective-flow.effective-flow:plan` sowie die
    widerspruchsfreie Vier-Target-/Branch-Terminologie in allen im Datei-Inventar genannten
    kanonischen Benutzer- und Entwicklerdokumenten.

Wenn `gemini` lokal verfügbar ist, kommt nach den statischen Checks ein nativer Smoke hinzu:

1. `gemini extensions link dist/gemini/effective-flow` in einer isolierten Testkonfiguration;
2. Extension- und Command-Liste über `/help` prüfen;
3. einen argumentlosen Befehl wie `/effective-flow:version` und einen Befehl mit Argumenten
   ausführen;
4. in der isolierten Testkonfiguration einen Projekt-Command erzeugen, der mit
   `/effective-flow:plan` kollidiert; über `/help` bestätigen, dass der Projekt-Command den
   normalen Namen und die Extension den Fallback `/effective-flow.effective-flow:plan` erhält,
   und diesen Fallback einmal aufrufen;
5. einen Workflow mit Agent-Delegation prüfen;
6. den Link anschließend über die dokumentierte Gemini-Extension-Verwaltung entfernen.

Ist Gemini CLI nicht installiert, wird nur dieser native Block als übersprungen protokolliert;
alle statischen und repositoryeigenen Checks bleiben verpflichtend.

## Offene Punkte

- Keine offenen Punkte.

## Plan-Review

**Ergebnis:** Freigegeben

- Die Source-to-Dist-, Atomic-Swap- und Release-Please-Verträge entsprechen dem aktuellen
  Repository.
- Die Tool- und Agent-Mengen werden aus den Quellen abgeleitet; der aktuelle Snapshot von
  17 öffentlichen plus 6 internen Tools und 15 Agents ist nur verifizierter Kontext.
- `main` bleibt frei von einem konkurrierenden Gemini-Skill-Kandidaten. Der dedizierte Branch
  `gemini` erfüllt den installierbaren Root-Vertrag ohne die portable Manager-Auslieferung zu
  schwächen.
- Preview-Subagents sind verbindlicher Scope, aber durch Revalidierung, strikte Metadaten-Guards
  und einen klaren Abbruchpfad abgesichert.
- Die Validierung deckt reine Transformationen, generierte Artefakte, Distribution, Branch-
  Staging und – sofern verfügbar – Gemini CLI selbst ab.
