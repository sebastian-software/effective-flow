# Modellprofile für Agenten und Aufrufer vervollständigen

**Planungsstatus:** Umgesetzt
**Quelle:** `$effective-flow plan`
**Empfohlener Workflow:** Feature (`$effective-flow build`)

## Anforderung

Effective Flow soll seine bereits vorhandene Modellstaffelung für Codex und Claude Code
vollständig und nachvollziehbar abbilden. Insbesondere sollen Claude-Subagenten eine explizite,
zur jeweiligen Rolle passende Effort-Stufe erhalten; UI- und Generic-Implementer sollen wie die
übrigen Implementer das qualitätsorientierte Opus-Modell verwenden. Die Build-Transformation,
Guards, Tests und Dokumentation sollen diese Matrix als gemeinsamen Vertrag behandeln.

Für das Modell des aufrufenden Hauptprozesses soll die Umsetzung die jeweils tatsächlich
unterstützte Harness-Semantik nutzen, ohne eine nur scheinbar dauerhafte oder die bewusste
Benutzerwahl überschreibende Vorgabe einzuführen. Die empfohlenen Standardwerte werden deshalb
verbindlich dokumentiert: Codex mit dem Alias `gpt-5.6` beziehungsweise Sol und `medium`, Claude
Code mit dem Alias `sonnet` und `high`. Schwierige Planungs-, Review- und
Integrationsaufgaben dürfen weiterhin bewusst mit einer höheren Stufe gestartet werden.

Die Änderung ist ein Feature, weil sie die ausgelieferten Claude-Agentenmetadaten, die
Build-Verträge und die dokumentierte Nutzung verändert. Sie ist keine reine Dokumentationsänderung.

Verifizierter Planungskontext vom 22.07.2026:

- Planungsbasis ist der Checkout `1cdd053`. Der Arbeitsbaum ist bereits durch unabhängige
  Setup-, Plan- und Gitignore-Änderungen dirty; insbesondere ist `AGENTS.md` verändert. Die
  Umsetzung muss diese Änderungen frisch einlesen und erhalten. Der Plan beschreibt deshalb den
  geprüften Working-Tree-Zustand und nicht ausschließlich `HEAD`.
- Die Umsetzung begann als Partial-Diff auf `origin/develop` (`994a339`) und wurde vor der
  Auslieferung auf die aktualisierte PR-Basis `d254b7e` integriert. Dort existieren zusätzlich
  `generic-product-implementer` und `generic-product-reviewer`; beide wurden nach demselben
  Rollenprinzip als Qualitätsrollen eingestuft.
- `src/agents/*.md` definiert für Codex bereits durchgängig eine zweistufige Matrix:
  anspruchsvolle Implementer und Reviewer verwenden `gpt-5.6-sol` mit `high`, unterstützende
  Rollen `gpt-5.6-luna` mit `medium`.
- Dieselben Agenten wählen für Claude zwar `opus`, `sonnet` oder `haiku`, enthalten aber keine
  `claude.effort`-Angabe. UI- und Generic-Implementer verwenden dort bislang `sonnet`, obwohl die
  vergleichbaren Codex-Rollen als qualitätskritische Implementer Sol/`high` erhalten.
- `code-validator` ist die einzige noch mit Haiku konfigurierte Rolle. Sie führt zwar keine
  Implementierung aus, muss aber projektspezifische Prüfskripte auswählen und Lint-, Typ- und
  Build-Fehler korrekt einordnen. Der archivierte Plan
  `docs/plan/archive/2026-07-16-0022-validator-parallelism.md` dokumentiert bereits zusätzliche
  Leitplanken gegen Haiku-spezifische Fehlentscheidungen bei genau diesen Aufgaben.
- `build.mjs` liest und rendert für Claude derzeit nur `model`, `color` und `tools`; für Codex
  werden `model` und `model_reasoning_effort` ausgegeben.
- `src/SKILL.md` ist ein gemeinsamer, dünner Router. `build.mjs` rekonstruiert dessen Frontmatter
  für beide Harnesses derzeit ausschließlich aus Name, Beschreibung und Argument-Hinweis.
- Die aktuelle Claude-Code-Dokumentation unterstützt `model` und `effort` sowohl in Skill- als
  auch Subagent-Frontmatter. Ein Skill-Override gilt jedoch nur für den aktuellen Turn; beim
  nächsten Benutzer-Prompt wird wieder das Sitzungsmodell verwendet. Quelle:
  https://code.claude.com/docs/en/slash-commands und
  https://code.claude.com/docs/en/model-config.
- Für Subagenten sind aktuell die Effort-Werte `low`, `medium`, `high`, `xhigh` und `max`
  dokumentiert; ihre tatsächliche Verfügbarkeit hängt vom gewählten Modell ab. Beim Modell gilt
  die Priorität `CLAUDE_CODE_SUBAGENT_MODEL`, aufrufspezifischer Modellparameter,
  Agenten-Frontmatter und schließlich Hauptmodell. Quelle:
  https://code.claude.com/docs/en/sub-agents.
- Die aktuelle Codex-Skill-Spezifikation dokumentiert für `SKILL.md` keinen Modell- oder
  Reasoning-Override. Modell und Reasoning werden auf Sitzungs-/Konfigurationsebene oder für
  Custom Agents gesetzt. Quelle: https://learn.chatgpt.com/docs/build-skills und
  https://learn.chatgpt.com/docs/models.
- Der Übergangswert `plan.markerLanguage = de` bestimmt mangels implementierter
  `language.workflow`-Konfiguration noch die gesamte Sprache dieses Plans. `$effective-flow setup`
  soll diesen Legacy-Wert später in die neue Sprachkonfiguration überführen.

## Architekturentscheidungen

- **Die vorhandene Codex-Matrix bleibt unverändert.** Sol/`high` bleibt für
  Implementer und Reviewer vorgesehen, Luna/`medium` für Dokumentation, Tests, E2E und
  Validierung. Die Änderung ergänzt fehlende Parität, ohne funktionierende Codex-Zuordnungen
  erneut umzubauen.
- **Claude stellt alle Implementer und spezialisierten Reviewer auf die Qualitätsstufe.**
  Node-, Rust-, UI- und Generic-Implementer sowie alle spezialisierten Reviewer verwenden
  `opus` mit `xhigh`. Alle unterstützenden Rollen einschließlich `code-validator` verwenden
  `sonnet` mit `medium`; Haiku entfällt aus der Standardmatrix. Damit folgt Claude derselben
  funktionalen Trennung wie Codex: das teurere Modell für Implementierung und Review, das
  ausgewogene Modell für unterstützende Phasen. Die Umstellung des Validators ist eine
  Zuverlässigkeits- und Wartbarkeitsentscheidung, keine unbewiesene Behauptung, Sonnet sei bei
  jeder Aufgabe billiger. Claude-Modellaliases bleiben versionsneutral und folgen der vom
  jeweiligen Provider aktuell empfohlenen Modellgeneration.
- **Source-Frontmatter bleibt die einzige Agentenquelle.** `build.mjs` übernimmt
  `claude.effort` in die ausgelieferten Claude-Agenten. `dist/` wird weiterhin ausschließlich
  generiert und nie direkt bearbeitet.
- **Ungültige oder fehlende Claude-Effort-Werte scheitern früh.** Eine kleine pure
  Normalisierungs-/Validierungsfunktion akzeptiert ausschließlich `low`, `medium`, `high`,
  `xhigh` und `max`. Der Build verlangt die Angabe für jeden ausgelieferten Claude-Agenten, damit
  neue Rollen nicht unbemerkt auf den Sitzungswert zurückfallen. Die modellabhängige
  Verfügbarkeit wird nicht als zweite, potenziell veraltende Kompatibilitätsmatrix dupliziert;
  die ausgelieferte Rollenmatrix verwendet nur aktuell belegte Kombinationen.
- **Das aufrufende Modell wird nicht im Router erzwungen.** Bei Claude wäre ein Router-Override
  zwar für den ersten Turn möglich, würde aber eine bewusst gewählte Opus-/höhere Effort-Sitzung
  ebenfalls auf Sonnet/`high` zurücksetzen und nach der nächsten Benutzereingabe ohnehin enden.
  Bei Codex existiert kein dokumentiertes entsprechendes Skill-Frontmatter. Ein zusätzlicher
  Orchestrator-Wrapper-Agent wird nicht eingeführt, weil er interaktive Gates, Gesprächskontext
  und Subagent-Nesting verändern würde. Stattdessen dokumentiert Effective Flow die
  aufrufenden Standardwerte und ihre bewussten Eskalationsfälle.
- **Keine globalen Benutzereinstellungen werden verändert.** Installation und
  `$effective-flow setup` schreiben weder `~/.codex/config.toml` noch
  `~/.claude/settings.json`. Die Dokumentation liefert kopierbare Beispiele; die Entscheidung
  bleibt beim Benutzer und bei verwalteten Organisationsrichtlinien.
- **Globale Subagent-Overrides bleiben ausdrücklich unerwünscht.** Die Dokumentation warnt vor
  `CLAUDE_CODE_SUBAGENT_MODEL`, weil diese Variable die differenzierte Agentenmatrix übersteuert.
- **Aktuelle externe Fähigkeiten werden bei der Umsetzung erneut verifiziert.** Wenn Claude
  `effort` in Subagent-Frontmatter oder die genannten Werte nicht mehr unterstützt, stoppt die
  Umsetzung vor einer abweichenden Ersatzlösung. Historische Plan-Dateien bleiben unverändert.

## Betroffene Dateien

| Datei                                                                     | Beschreibung                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/agents/*.md`                                                         | Für alle Claude-Subagenten die explizite rollenabhängige `effort`-Stufe ergänzen; UI- und Generic-Implementer auf `opus` sowie `code-validator` von `haiku` auf `sonnet` anheben, Codex-Werte, Tools, Sandboxen und Anweisungen ansonsten erhalten. |
| `build-lib.mjs`                                                           | Pure Validierung für unterstützte Claude-Effort-Werte ergänzen, damit der Vertrag isoliert testbar bleibt.                                                                                                                                          |
| `build.mjs`                                                               | `claude.effort` lesen, für jeden Agenten verpflichtend validieren und als `effort:` in die generierten Claude-Agenten schreiben.                                                                                                                    |
| `test/build-lib.test.mjs`                                                 | Zulässige, fehlende und ungültige Effort-Werte sowie das bestehende Nested-Frontmatter-Verhalten abdecken.                                                                                                                                          |
| `AGENTS.md`                                                               | Agenten-Frontmatter-Vertrag um Claude-Effort und die Trennung zwischen aufrufendem Modell und Subagenten ergänzen; bestehende uncommittete Änderungen erhalten.                                                                                     |
| `docs/developer-guide/architecture.md`                                    | Modell-/Effort-Matrix, Eigentum des aufrufenden Modells und Harness-Unterschiede erklären.                                                                                                                                                          |
| `docs/developer-guide/build-system.md`                                    | Claude-Effort-Transformation, Vollständigkeitsguard und generierte Felder dokumentieren.                                                                                                                                                            |
| `docs/user-guide/getting-started.md`                                      | Empfohlene aufrufende Defaults, Eskalationsfälle, Konfigurationsbeispiele und die Warnung vor globalen Subagent-Overrides ergänzen.                                                                                                                 |
| `docs/plan/archive/2026-07-22-modellprofile-fuer-agenten-und-aufrufer.md` | Diesen Implementierungsplan während Umsetzung und Abschluss fortschreiben und nach erfolgreicher Umsetzung archivieren.                                                                                                                             |

`src/SKILL.md` bleibt unverändert, weil ein statischer Router-Override weder harnessübergreifend
noch über interaktive Turns hinweg die gewünschte Semantik besitzt. `dist/` bleibt generierter,
gitignorierter Output.

## Implementierungsdetails

### Vorgehen

1. Vor den Änderungen die offiziellen Claude-Code- und Codex-Dokumentationsseiten erneut auf
   unterstützte Agenten-/Skill-Felder und Effort-Werte prüfen. Bei einer inkompatiblen Änderung
   den Plan anpassen, statt undokumentierte Metadaten auszugeben.
2. In `build-lib.mjs` einen kleinen Validator `normalizeClaudeEffort` für Claude-Effort
   ergänzen. Er akzeptiert `low`, `medium`, `high`, `xhigh` und `max`, liefert den Wert
   unverändert zurück und nennt bei Fehlern Agent sowie Quellpfad. Fehlende Werte werden in
   `build.mjs` als Vollständigkeitsfehler behandelt, nicht implizit ergänzt.
3. `build.mjs` erweitert die Claude-Agent-Transformation um `claude.effort`. Die Ausgabeordnung
   bleibt deterministisch: Name, Beschreibung, Modell, Effort, Farbe und Tools. Codex-Rendering
   und Router-Rendering bleiben funktional unverändert.
4. Alle Agentenquellen gemäß der folgenden Matrix ergänzen. Dabei UI- und Generic-Implementer von
   `sonnet` auf `opus` sowie `code-validator` von `haiku` auf `sonnet` anheben; übrige
   Modellzuordnungen und sämtliche Codex-Effort-Werte nicht verändern.
5. Die Unit-Tests um gültige Werte und präzise Fehlerfälle erweitern. Der normale Build dient
   zusätzlich als Integrationstest für Vollständigkeit und tatsächlich gerenderte Claude-Dateien.
6. Entwicklerdokumentation und `AGENTS.md` auf denselben Source-to-Dist-Vertrag bringen. In der
   Nutzerdokumentation die aufrufenden Standardwerte getrennt von den internen Agenten erklären
   und Konfigurationsbeispiele für beide Harnesses ergänzen.
7. CI-Sequenz ausführen und anschließend die generierten Claude- und Codex-Artefakte per Suche
   gegen die erwartete Matrix prüfen. Keine generierte Datei committen.

### Claude-Effort-Matrix

| Agent                         | Claude-Modell | Claude-Effort |
| ----------------------------- | ------------- | ------------- |
| `frontend-reviewer`           | `opus`        | `xhigh`       |
| `nodejs-reviewer`             | `opus`        | `xhigh`       |
| `rust-reviewer`               | `opus`        | `xhigh`       |
| `nodejs-implementer`          | `opus`        | `xhigh`       |
| `rust-implementer`            | `opus`        | `xhigh`       |
| `ui-implementer`              | `opus`        | `xhigh`       |
| `generic-implementer`         | `opus`        | `xhigh`       |
| `generic-product-implementer` | `opus`        | `xhigh`       |
| `generic-product-reviewer`    | `opus`        | `xhigh`       |
| `code-documenter`             | `sonnet`      | `medium`      |
| `docs-writer`                 | `sonnet`      | `medium`      |
| `marketing-writer`            | `sonnet`      | `medium`      |
| `test-writer`                 | `sonnet`      | `medium`      |
| `e2e-tester`                  | `sonnet`      | `medium`      |
| `code-validator`              | `sonnet`      | `medium`      |

### Aufrufendes Modell

- Codex-Nutzer erhalten als Standardbeispiel `model = "gpt-5.6"` und
  `model_reasoning_effort = "medium"`; für komplexe Planung, Reviews, Refactorings und
  `apply-review` wird eine temporäre Erhöhung auf `high` erläutert.
- Claude-Code-Nutzer erhalten als Standardbeispiel `"model": "sonnet"` und
  `"effortLevel": "high"`; für besonders anspruchsvolle Läufe wird `opus` mit einer höheren
  verfügbaren Effort-Stufe genannt.
- Die Beispiele werden als Benutzereinstellungen gekennzeichnet, nicht als Projektkonfiguration
  oder von Effective Flow erzwungene Werte. Organisationsrichtlinien und ausdrücklich gewählte
  Sitzungswerte haben Vorrang.

### Randfälle

- Ein neuer Agent ohne `claude.effort` muss den Build mit einer präzisen Meldung beenden, statt
  still den Sitzungswert zu erben.
- Ein unbekannter Effort-String, falsche Großschreibung oder ein nicht persistierbarer
  Spezialmodus darf nicht in `dist/claude/agents/` gelangen.
- Claude-Modellaliases können zukünftig auf neue Versionen zeigen; der Build validiert deshalb
  die Effort-Klasse, pinnt aber keine konkrete Claude-Versionsnummer und pflegt keine eigene
  Alias-zu-Effort-Kompatibilitätsmatrix.
- Haiku ist nicht grundsätzlich unwirtschaftlich: Bei API-Abrechnung muss Sonnet seine höheren
  Tokenpreise durch weniger Tokens, Wiederholungen oder Korrekturen ausgleichen. Effective Flow
  verwendet es dennoch nicht als Standard, weil keine verbleibende Rolle zugleich rein
  mechanisch, hochvolumig und fehlertolerant genug ist. Eine spätere Wiedereinführung erfordert
  einen repräsentativen A/B-Vergleich aus Erstlauf-Erfolg, Tokenverbrauch, Wiederholungen,
  Laufzeit und Gesamtkosten.
- Eine per Umgebung gesetzte Variable wie `CLAUDE_CODE_EFFORT_LEVEL` kann Frontmatter gemäß
  Claude-Code-Priorität übersteuern. Effective Flow versucht nicht, verwaltete Einstellungen zu
  umgehen.
- `CLAUDE_CODE_SUBAGENT_MODEL` würde alle differenzierten Modellangaben übersteuern und wird nur
  als Konfliktquelle dokumentiert, nie gesetzt.
- Ein aufrufspezifischer Claude-Modellparameter kann das Agenten-Frontmatter ebenfalls
  übersteuern. Die Dokumentation stellt die Source-Matrix deshalb als Effective-Flow-Standard
  dar, nicht als unübersteuerbare Laufzeitgarantie.
- Ein Benutzer darf den Hauptlauf bewusst stärker oder günstiger konfigurieren. Die internen
  Agenten behalten dennoch ihre Source-Matrix, sofern keine externe globale Override-Regel sie
  ersetzt.
- Falls während der Umsetzung die bereits veränderte `AGENTS.md` nicht konfliktfrei ergänzt
  werden kann, wird nur diese Dokumentationsanpassung gestoppt und mit dem Benutzer geklärt; die
  fremden Änderungen werden weder verworfen noch überschrieben.

## Akzeptanzkriterien

- [x] Jeder Agent unter `src/agents/*.md` enthält genau einen gültigen `claude.effort`-Wert gemäß
      der festgelegten Matrix; alle Implementer und spezialisierten Reviewer verwenden bei Claude
      `opus`/`xhigh`, alle unterstützenden Rollen einschließlich `code-validator` verwenden
      `sonnet`/`medium`, kein Agent verwendet standardmäßig Haiku und die komplette Codex-Matrix
      bleibt unverändert.
- [x] `build.mjs` erzeugt für jeden Claude-Agenten ein `effort:`-Feld und bricht bei fehlenden
      oder von `low`, `medium`, `high`, `xhigh`, `max` abweichenden Source-Werten mit Agent- und
      Pfadbezug ab; Unit-Tests decken jeden zulässigen Wert sowie fehlende, leere und unbekannte
      Werte ab.
- [x] Die generierten Codex-Agenten bleiben byte-inhaltlich bezüglich `model` und
      `model_reasoning_effort` bei ihrer bisherigen Sol-/Luna-Matrix; der Codex-Router enthält
      keine undokumentierten Modell-/Effort-Felder.
- [x] Nutzer- und Entwicklerdokumentation unterscheiden eindeutig zwischen dem vom Benutzer
      gewählten aufrufenden Modell, der nur turn-lokal verfügbaren und deshalb bewusst nicht
      verwendeten Claude-Skill-Override-Möglichkeit und den von Effective Flow definierten
      Subagenten.
- [x] Die Nutzerdokumentation enthält kopierbare Standardkonfigurationen für Codex
      (`gpt-5.6`/`medium`) und Claude Code (`sonnet`/`high`), erläutert die bewusste Eskalation
      für schwierige Läufe und warnt vor `CLAUDE_CODE_SUBAGENT_MODEL`.
- [x] Kein Installer, Setup-Workflow oder Build schreibt globale Codex-/Claude-Benutzereinstellungen
      oder führt einen zusätzlichen Wrapper-Orchestrator ein.
- [x] `pnpm agent:check`, `pnpm test` und `node build.mjs` laufen erfolgreich; eine anschließende
      Prüfung der generierten Artefakte bestätigt die erwarteten Claude- und Codex-Metadaten.
- [x] Außer den im Plan genannten Dateien entstehen keine fachlichen Änderungen; vorhandene
      uncommittete Änderungen bleiben erhalten.

Zusammen bilden diese Kriterien genau eine Abschlussbedingung: Die rollenabhängige Modell- und
Effort-Staffelung ist in Source, Transformation, Tests und Dokumentation konsistent, während die
Aufruferkonfiguration korrekt als benutzerkontrollierte Harness-Einstellung behandelt wird.

## Validierungsplan

- `pnpm agent:check` – Formatprüfung ohne Schreibzugriff auf Quellen.
- `pnpm test` – Unit-Tests einschließlich Claude-Effort-Validierung.
- `node build.mjs` – beide Harnesses erzeugen und alle Build-Guards ausführen.
- `rg -n "^(model|effort):" dist/claude/agents` – Claude-Modell-/Effort-Paare gegen die Matrix
  prüfen.
- `rg -n "^(model|model_reasoning_effort) =" dist/codex/agents` – unveränderte
  Codex-Matrix bestätigen.
- `rg -n "^(model|effort):" dist/claude/effective-flow/SKILL.md` und die entsprechende Suche im
  Codex-Router – bestätigen, dass kein irreführender, nur teilweise dauerhafter Aufrufer-Override
  ausgeliefert wird.
- `git diff --check` sowie `git status --short` – Whitespacefehler ausschließen und den Scope
  gegenüber den bereits vorhandenen fremden Änderungen kontrollieren.

## Testergebnisse

- `pnpm agent:check`: bestanden; 236 Dateien geprüft.
- `pnpm test`: bestanden; 334 von 334 Tests erfolgreich, keine Fehler oder übersprungenen Tests.
- `node build.mjs`: bestanden; 17 öffentliche Tools, 6 interne Tools und 15 Agenten für Claude,
  Codex und Portable erzeugt.
- Generierte Claude-Artefakte: 15 von 15 Agenten mit genau einem Modell- und Effort-Feld;
  9 Qualitätsrollen verwenden `opus`/`xhigh`, 6 Supportrollen `sonnet`/`medium`, kein Agent
  verwendet Haiku.
- Generierte Codex-Artefakte: Die Modell- und Reasoning-Felder aller 15 Agenten entsprechen
  exakt der aktuellen PR-Basis `d254b7e`; die Router enthalten keine Modell- oder
  Effort-Overrides.
- `git diff --check`: bestanden.

## Review-Befunde

Die abschließende technische Review über Implementierung, Tests, Dokumentation, generierte
Metadaten und Scope ergab keine kritischen oder wichtigen Befunde. Ein geringfügiger Befund zum
falschen Codex-Artefaktpfad im Validierungsplan wurde korrigiert und mit dem tatsächlichen
generierten Pfad `dist/codex/agents` verifiziert. Es verbleiben keine offenen Befunde. Die beiden
auf `origin/develop` zusätzlich vorhandenen Generic-Product-Agenten wurden ausdrücklich in die
Qualitätsstufe und die Review einbezogen.

## Annahmen und offene Punkte

- Annahme: Die Claude-Aliase `opus` und `sonnet` bleiben der geeignete versionsunabhängige
  Vertrag für ausgelieferte Subagenten.
- Annahme: Der Benutzerwunsch nach einem definierten aufrufenden Modell zielt auf einen
  verlässlichen Standard und nicht auf das Überschreiben einer ausdrücklich stärkeren
  Sitzungswahl. Deshalb wird die Einstellung dokumentiert, aber nicht statisch im Router
  erzwungen.
- Annahme: Die vorhandene Codex-Modellmatrix ist weiterhin beabsichtigt. Die Claude-Seite soll
  funktional gleichziehen: Alle Implementer und spezialisierten Reviewer dürfen bewusst das
  teurere Opus-Modell verwenden; unterstützende Rollen bleiben kostenoptimiert.
- Keine offene Entscheidung blockiert die Umsetzung. Falls die offizielle Harness-Dokumentation
  vor der Umsetzung abweicht, ist dies eine Stop-Bedingung für die betroffene Metadatenänderung.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       0 |
| Security    |        0 |       0 |       0 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       0 |       1 |
| Testbarkeit |        0 |       0 |       1 |
| Scope       |        0 |       0 |       0 |
| Wartbarkeit |        0 |       0 |       1 |

### Befunde

- **Architektur / Wichtig – eingearbeitet:** Ein statischer Claude-Router-Override wäre technisch
  möglich, aber nur turn-lokal und würde auch eine bewusst stärkere Sitzung überschreiben. Der
  Plan verzichtet deshalb auf diese scheinbare Garantie und trennt dokumentierte
  Aufruferstandards klar von verbindlichen Subagentenmetadaten. Der Benutzer hat das empfohlene
  Standardprofil Codex Sol/`medium` und Claude Sonnet/`high` in der interaktiven Tiefenprüfung
  bestätigt.
- **Fehlerfälle / Hinweis:** Externe Umgebungs- und Organisationsvorgaben können Agentenmetadaten
  übersteuern. Der Plan dokumentiert diese Priorität und versucht nicht, sie zu umgehen.
- **Wartbarkeit / Hinweis:** Eine zweite hartcodierte Modellmatrix in Build oder Dokumentation
  könnte driften. Der Build validiert deshalb nur Vollständigkeit und zulässige Werte; die
  konkrete Rollenzuordnung bleibt in den Agentenquellen und wird in der Dokumentation erklärend,
  nicht als zweite ausführbare Tabelle geführt.
- **Scope / Wichtig – nach Benutzerentscheidung eingearbeitet:** Die erste Fassung beließ UI- und
  Generic-Implementer bei Sonnet/`high`. Der Benutzer priorisiert auch für diese
  Implementierungsrollen die mit Codex vergleichbare Qualitätsstufe. Beide Rollen sind deshalb
  nun verbindlich mit Opus/`xhigh` geplant; Sonnet bleibt auf unterstützende Phasen begrenzt. In
  der interaktiven Tiefenprüfung hat der Benutzer `xhigh` anschließend ausdrücklich für alle
  Opus-Implementer und spezialisierten Reviewer bestätigt.
- **Zuverlässigkeit / Wichtig – nach Benutzerhinweis eingearbeitet:** Die pauschale These, Haiku
  verbrauche stets genug zusätzliche Tokens, um Sonnet günstiger zu machen, ist nicht belegt und
  hängt von Aufgabe, Abrechnungsmodell und Wiederholungsrate ab. Für Effective Flow bleibt aber
  nur der Validator als Haiku-Rolle; dessen vorhandene projektspezifische Leitplanken zeigen,
  dass die Aufgabe relevantes Urteilsvermögen verlangt. Der Plan setzt ihn deshalb auf
  Sonnet/`medium` und entfernt Haiku aus der Standardmatrix. Der Benutzer hat `medium` in der
  interaktiven Tiefenprüfung ausdrücklich als Effort-Stufe bestätigt.
- **Testbarkeit / Hinweis – in der Tiefenprüfung eingearbeitet:** Die erlaubten Claude-Effort-Werte
  und die externe Modell-Priorität waren nur abstrakt beschrieben. Der Plan benennt nun alle fünf
  dokumentierten Frontmatter-Werte, fordert positive und negative Unit-Tests und grenzt die
  Source-Matrix ausdrücklich von externen Laufzeit-Overrides ab.
- **Scope / Wichtig – nach Benutzerentscheidung eingearbeitet:** Eine zusätzliche Allowlist für
  Claude- oder Codex-Modellnamen würde zwar Tippfehler früher erkennen, den Build aber dauerhaft
  an zwei veränderliche Providerkataloge koppeln und über die Einführung des neuen Effort-Felds
  hinausgehen. Der Benutzer folgt der Empfehlung, ausschließlich `claude.effort` streng zu
  validieren und Modellwerte wie bisher durchzureichen.

## Offene Punkte

- Keine offenen Punkte.
