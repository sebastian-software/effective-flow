# Codex-Goals direkt aus Effective Flow starten

**Planungsstatus:** Umgesetzt
**Quelle:** $effective-flow plan
**Empfohlener Workflow:** Feature (`$effective-flow build`)

## Anforderung

Wenn ein User an einem expliziten Goal-Gate „Autonomous via `/goal`“ auswählt, soll Effective
Flow in Codex nicht mehr zuerst einen `/goal`-Prompt zum erneuten Einfügen ausgeben. Stattdessen
soll der Codex-Pfad versuchen, das bereits formulierte Goal direkt über die verfügbare
`create_goal`-Capability zu starten. Claude Code kann ein Goal weiterhin nicht selbst starten und
behält deshalb den bisherigen copy-paste-fähigen `/goal`-Prompt bei. Dasselbe gilt für den
portablen Manager-Target, der keine garantiert aufrufbare `create_goal`-Capability besitzt.

Die Änderung ist ein Feature, weil sie das sichtbare Interaktionsverhalten nach einer bestehenden
Goal-Auswahl verbessert, ohne die Auswahl selbst oder die anschließenden Workflow-Phasen zu
verändern.

Verifizierter Code-Kontext am Planungsstand `1cdd053` vom 2026-07-21:

- `src/shared/goal-completion.md` ist der zentrale, von den implementierenden Workflows
  eingebundene Vertrag für Abschlussbedingung, Goal-Gate, Schleifenbegrenzung und `/goal`-Form.
  Er behauptet derzeit plattformübergreifend, ein Skill könne das native Goal nicht selbst
  starten, und verlangt deshalb immer die Ausgabe eines Prompts.
- Explizite Goal-Auswahlstellen existieren in `build`, `fix`, `refactor`, `docs`, `maintain`,
  `iterate`, `apply-plan` und `apply-issues`. Mehrere dieser Dateien wiederholen derzeit die
  Prompt-Ausgabe in Phasenbeschreibung oder Optionsbeschreibung.
- `apply-review` gibt nach seinem Strategie-Gate einen optionalen `/goal`-String ohne separate
  Goal-Auswahl aus. Dieser Sonderfall darf kein Goal ungefragt direkt starten und bleibt daher bei
  seinem bisherigen Prompt-Handoff.
- `build-lib.mjs` besitzt mit `renderBody`, den ASK-Transforms und den Referenz-Transforms bereits
  den zentralen, unit-getesteten Ort für harness-spezifische Source-Transformationen.
- Zwischen Planung und Umsetzung wurde auf `origin/develop` zusätzlich ein portabler
  Manager-Target eingeführt. Die Umsetzung basiert deshalb auf `d0a5f54` und behandelt neben den
  beiden nativen Targets auch Portable ausdrücklich als prompt-only Pfad.
- `AGENTS.md` dokumentiert die kanonische Placeholder-/Directive-Syntax für Source-Autoren. Ein
  neuer Goal-Start-Platzhalter muss dort zusätzlich zur ausführlicheren Build-System-Dokumentation
  eingetragen werden.
- Die aktuelle Codex-Sitzung stellt `create_goal` mit dem Pflichtfeld `objective` und dem nur bei
  ausdrücklicher Vorgabe zu setzenden optionalen `token_budget` bereit. Das aktuelle öffentliche
  Codex-Handbuch beschreibt zugleich weiterhin `/goal` als manuellen Einstieg in Goal Mode. Der
  direkte Pfad muss deshalb Capability-basiert sein und einen Prompt-Fallback behalten.
- Die Benutzerdokumentation in `docs/user-guide/tools-implement.md` und
  `docs/user-guide/glossary.md` beschreibt momentan ausschließlich die Ausgabe und das manuelle
  Einfügen des `/goal`-Strings.
- Der Arbeitsbaum war bei der Planung nicht sauber: `AGENTS.md`, `.gitignore`, die Entfernung von
  `.effective-flow/config.json`, das neue Projektsetup-ADR und der offene Sprachkonfigurationsplan
  sind bereits vorhandene fremde Änderungen. Die Umsetzung darf sie nicht zurücksetzen oder
  überschreiben.

## Architekturentscheidungen

- **Harness-spezifischer Build-Transform statt verteilter Laufzeit-Erkennung:** Ein neuer,
  schmaler Goal-Start-Platzhalter wird wie die bestehenden ASK- und Referenz-Platzhalter in
  `build-lib.mjs` je Harness gerendert. So erhält das Codex-Artefakt eine eindeutige
  `create_goal`-Anweisung; Claude Code und Portable erhalten ausschließlich den bisherigen
  Prompt-Handoff.
- **Zentraler Vertrag bleibt maßgeblich:** Die vollständige Auswahl- und Fallback-Semantik bleibt
  in `src/shared/goal-completion.md` und dem direkt folgenden
  `src/shared/goal-start-action.md`. Nur die acht expliziten Gates binden das Action-Fragment ein;
  dadurch bleibt der prompt-only Sonderfall `apply-review` eindeutig isoliert. Tool-Dateien
  benennen nur Phasenspanne und konkrete Abschlussbedingung; widersprüchliche lokale Aussagen wie
  „emit the `/goal` string“ werden durch einen Verweis auf die zentrale Goal-Start-Aktion ersetzt.
- **Gleiche Objective-Semantik auf beiden Pfaden:** Codex übergibt als `objective` genau den Text,
  der im Claude-Prompt hinter `/goal ` steht. Dadurch bleiben Ergebnis, Constraints,
  Verifikationskriterien und Scope-Grenze identisch.
- **Kein implizites Budget:** Der direkte Codex-Aufruf setzt kein `token_budget`, sofern der User
  nicht ausdrücklich eines verlangt hat. Das entspricht dem Vertrag der Capability und vermeidet
  eine neue Effective-Flow-Policy.
- **Fehlerabhängiger Fallback:** Ist `create_goal` im konkreten Codex-Surface nicht verfügbar oder
  schlägt der Aufruf aus einem technischen Grund fehl, berichtet der Workflow dies knapp und gibt
  den vollständigen `/goal`-Prompt aus. Lehnt die Capability den Start wegen eines bereits
  aktiven, nicht abgeschlossenen Goals ab, wird dagegen kein neuer Prompt ausgegeben: Der
  Workflow meldet den Goal-Konflikt und wartet auf eine User-Entscheidung, ohne das bestehende
  Goal zu ersetzen, zu bearbeiten oder zu beenden. In keinem Fehlerfall wechselt er
  stillschweigend zur gated Ausführung.
- **Nur nach ausdrücklicher Goal-Wahl:** „Yes“ am dreigliedrigen Gate, „Adjust“, normale Antworten
  und das Weglassen des Goal-Gates bei nicht-interaktiver Delegation bleiben unverändert.
  `apply-review` startet wegen seines bloß optional ausgegebenen Prompts weiterhin kein Goal
  automatisch.
- **Kein zweiter Goal-Vertrag:** Es entsteht weder eine neue Konfiguration noch eine separate
  Goal-Abstraktion. Der neue Transform erweitert den vorhandenen Source-to-Dist-Vertrag nur um die
  eine tatsächlich plattformabhängige Aktion.

## Betroffene Dateien

| Datei                                  | Beschreibung                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/goal-completion.md`        | Zentralen Auswahlvertrag einschließlich eindeutiger Antwortsemantik für dreigliedrige und eigenständige Goal-Fragen präzisieren.                              |
| `src/shared/goal-start-action.md`      | Harness-spezifische Startaktion zentral für genau die acht expliziten Gates bereitstellen.                                                                    |
| `src/tools/build.md`                   | Beide Goal-Gates und deren Optionsbeschreibung auf die zentrale harness-spezifische Startaktion verweisen lassen.                                             |
| `src/tools/fix.md`                     | Goal-Auswahl für Phasen 3–5 von fester Prompt-Ausgabe auf die zentrale Startaktion umstellen.                                                                 |
| `src/tools/refactor.md`                | Goal-Auswahl für Phasen 2–6 entsprechend neutralisieren.                                                                                                      |
| `src/tools/docs.md`                    | Goal-Auswahl für Phasen 2–4 entsprechend neutralisieren.                                                                                                      |
| `src/tools/maintain.md`                | Eigenständige Goal-Folgefrage und Optionsbeschreibung auf direkten Start beziehungsweise Fallback ausrichten.                                                 |
| `src/tools/iterate.md`                 | Goal-Auswahl für Phasen 3–6 auf den zentralen Vertrag umstellen.                                                                                              |
| `src/tools/apply-plan.md`              | Nach erfolgreichem Clarification Gate den bestätigten Codex-Goal direkt starten; Claude, Portable und Codex-Fallback behalten den Prompt.                     |
| `src/tools/apply-issues.md`            | Explizites Goal-Gate und konkrete Issue-Objective auf die zentrale Startaktion umstellen, ohne Issue-Auswahl oder Delegation zu verändern.                    |
| `build-lib.mjs`                        | Einen reinen harness-spezifischen Goal-Start-Transform ergänzen und in `renderBody` zwischen ASK- und Referenz-Transformation integrieren.                    |
| `test/build-lib.test.mjs`              | Codex-, Claude- und End-to-End-Fälle für den neuen Platzhalter einschließlich vollständiger Ersetzung abdecken.                                               |
| `docs/user-guide/tools-implement.md`   | Codex-Direktstart und Fehlerpfade sowie den Prompt-Handoff in Claude Code und Portable erklären.                                                              |
| `docs/user-guide/glossary.md`          | Den Glossareintrag „Goal steering“ auf die drei Harness-Pfade und den Fallback aktualisieren.                                                                 |
| `docs/developer-guide/build-system.md` | Den neuen Goal-Start-Platzhalter, seine Transform-Reihenfolge und die drei Ausgaben dokumentieren.                                                            |
| `AGENTS.md`                            | Die kanonische Placeholder-Tabelle um den Goal-Start-Platzhalter ergänzen und dabei die bereits vorhandene uncommittete Projektsetup-Markeränderung erhalten. |

## Implementierungsdetails

### Vorgehen

1. Vor Änderungen den Arbeitsbaum erneut lesen und sicherstellen, dass keine der oben genannten
   Source-, Test- oder Dokumentationsdateien zwischenzeitlich fremd geändert wurde. Bei einem
   semantischen Konflikt anhalten; die bereits vorhandenen Setup- und Planänderungen weder
   zurücksetzen noch in diese Änderung hineinziehen.
2. In `build-lib.mjs` eine kleine reine Transform-Funktion für einen eindeutig benannten
   Goal-Start-Platzhalter ergänzen. `renderBody` wendet sie nach der ASK-Transformation und vor
   den Referenz-Transforms an, damit der neue Schritt in der bestehenden zentralen Render-Pipeline
   liegt und vor der Ausgabe vollständig aufgelöst wird.
3. Für Codex eine Anweisung rendern, die nach bestätigter Goal-Auswahl `create_goal` mit dem
   vorbereiteten Objective aufruft, `token_budget` ohne User-Vorgabe auslässt und nach Erfolg in
   die bereits benannten Restphasen übergeht. Bei fehlender Capability oder technischem Fehler
   wird der vollständige `/goal`-Prompt samt knapper Ursache ausgegeben. Meldet der Aufruf ein
   bereits aktives Goal, wird stattdessen der Konflikt berichtet und auf eine User-Entscheidung
   gewartet.
4. Für Claude Code und Portable ausschließlich den bisherigen Handoff rendern: vollständigen
   einzeiligen `/goal`-Prompt prominent ausgeben und zum Einfügen als neue Eingabe auffordern.
   Keine `create_goal`-Capability erwähnen oder vortäuschen.
5. `src/shared/goal-completion.md` und das getrennte Action-Fragment auf den Platzhalter umstellen.
   Die dortige Form des Goals bleibt kanonisch; der Text nach `/goal ` ist zugleich das
   Codex-Objective. Ergänzen, dass ein direkter Start nur nach ausdrücklicher Goal-Auswahl erfolgt
   und ein fehlgeschlagener Start nicht als Zustimmung zur gated Ausführung gilt.
6. Die acht expliziten Goal-Auswahlstellen so bereinigen, dass sie Phasenspanne und
   Abschlussbedingung weiterhin konkret nennen, die Aktion nach der Auswahl aber ausschließlich
   aus dem zentralen Vertrag beziehen. Optionsbeschreibungen werden plattformneutral formuliert,
   damit die generierten Codex- und Claude-Fragen nicht jeweils die falsche Aktion versprechen.
7. Den Sonderfall `apply-review` gegen Regression prüfen: Sein optionaler Prompt ohne explizite
   Goal-Auswahl bleibt ein Prompt und darf den neuen direkten Start nicht auslösen.
8. Benutzer-, Entwickler- und Autoren-Dokumentation aktualisieren. Die Benutzerdokumentation
   unterscheidet sichtbar zwischen erfolgreichem Codex-Direktstart, Codex-Fallback und
   Claude-Prompt, ohne eine Verfügbarkeit von `create_goal` für jedes Codex-Surface zu
   versprechen. `docs/developer-guide/build-system.md` und die kanonische Tabelle in `AGENTS.md`
   beschreiben denselben neuen Platzhalter und seine beiden Ausgaben.
9. Die Build-Transform-Tests ergänzen: direkte Funktionsfälle für beide Harnesses und ein
   End-to-End-Fall über `renderBody`. Die Tests müssen außerdem belegen, dass im gerenderten
   Ergebnis kein Goal-Start-Platzhalter übrig bleibt.

### Rückwärtskompatibilität und Fehlerfälle

- Wenn `create_goal` ein bereits aktives, nicht abgeschlossenes Goal ablehnt, gilt dies als
  eigener Konfliktfall: Ursache knapp melden, keinen `/goal`-Prompt ausgeben und auf eine
  ausdrückliche User-Entscheidung warten. Vorhandene Goals werden weder ersetzt, bearbeitet noch
  automatisch beendet.
- Wenn ein Codex-Surface nur den manuellen `/goal`-Einstieg, aber keine aufrufbare Capability
  anbietet, funktioniert derselbe Prompt-Fallback wie bisher.
- Wenn `create_goal` aus einem anderen technischen Grund fehlschlägt, wird ebenfalls der
  vollständige Prompt-Fallback ausgegeben; der Fehler wird nicht als aktives Goal geraten, wenn
  die Capability ihn nicht entsprechend meldet.
- Wenn der direkte Aufruf erfolgreich ist, wird der Prompt nicht zusätzlich ausgegeben und es
  entsteht kein zweites Goal.
- Wenn der User gated fortfahren oder anpassen möchte, wird `create_goal` nicht aufgerufen.
- Nicht-interaktive Sub-Agent-Delegationen erhalten weiterhin weder Goal-Option noch Prompt noch
  direkten Goal-Aufruf.
- Das Objective enthält keine internen IDs, die nach den bestehenden Regeln nicht in den
  Goal-String gehören; werkzeugspezifische Schlüssel bleiben außerhalb des sichtbaren Texts.
- Ein Transform-Tippfehler darf nicht still in `dist/` landen. Der Unit-Test und die bestehende
  Build-/Sichtprüfung sichern die vollständige Ersetzung des kanonischen Platzhalters ab.

### Abgrenzung

- Keine Änderung an Goal-Pause, -Resume, -Edit, -Clear, Persistenz oder automatischer
  Fortsetzung.
- Keine neue Goal-Konfiguration und kein automatisch gewähltes Token-Budget.
- Keine Änderung der Abschlussbedingungen, Retry-Grenzen, Validatoren oder Reviewer.
- Keine direkte Goal-Aktivierung ohne vorausgehende ausdrückliche Auswahl am bestehenden Gate.
- Keine Änderung des `apply-review`-Interaktionsmodells und keine allgemeine Neugestaltung der
  ASK-Block-Syntax.
- Keine manuelle Bearbeitung von `dist/`; alle drei Harness-Ausgaben entstehen ausschließlich aus
  `src/` über den Build.

## Akzeptanzkriterien

- [x] In allen acht expliziten Goal-Gates führt die Auswahl „Autonomous via `/goal`“ im
      generierten Codex-Artefakt zuerst zu genau einem `create_goal`-Versuch mit der vollständig
      abgeleiteten Abschlussbedingung als `objective`; ohne ausdrückliche User-Vorgabe wird kein
      `token_budget` gesetzt.
- [x] Nach erfolgreichem Codex-Aufruf läuft der jeweilige Workflow in den bereits definierten
      Restphasen weiter und gibt keinen zusätzlichen `/goal`-Prompt aus.
- [x] Fehlt `create_goal` oder schlägt der Codex-Aufruf aus einem technischen Grund fehl, werden
      Ursache und vollständiger copy-paste-fähiger `/goal`-Prompt ausgegeben; der Workflow
      behauptet weder einen gestarteten Goal-Lauf noch wechselt er still zur gated Ausführung.
- [x] Wird der Direktstart wegen eines bereits aktiven Goals abgelehnt, meldet der Workflow den
      Konflikt, gibt keinen neuen `/goal`-Prompt aus und wartet auf eine User-Entscheidung, ohne
      das vorhandene Goal zu ersetzen, zu bearbeiten oder zu beenden.
- [x] In den generierten Claude-Code- und Portable-Artefakten bleibt an denselben Auswahlstellen
      ausschließlich der bisherige `/goal`-Prompt-Handoff erhalten; es gibt keine Anweisung zum
      direkten `create_goal`-Aufruf.
- [x] Beim dreigliedrigen Gate bleiben „Yes“ und „Adjust“ Nicht-Goal-Pfade; bei der eigenständigen
      Folgefrage autorisieren nur „Yes“ beziehungsweise „Autonomous via `/goal`“ den Goal-Pfad.
      Normale Antworten und nicht-interaktive Delegationen lösen in keinem der drei Harnesses
      einen Goal-Start aus; `apply-review` startet ohne neue ausdrückliche Goal-Auswahl ebenfalls
      kein Goal.
- [x] Codex, Claude und Portable verwenden dieselbe inhaltliche Abschlussbedingung: Das
      Codex-`objective` entspricht exakt dem Text hinter `/goal ` im Claude-, Portable-
      beziehungsweise Fallback-Prompt.
- [x] Benutzer-, Entwickler- und Autoren-Dokumentation beschreiben Direktstart, Prompt-Handoff,
      Fallback und Placeholder-Vertrag konsistent mit den generierten Artefakten.
- [x] `pnpm agent:check`, `pnpm test` und `node build.mjs` bestehen; gezielte Inspektionen der
      generierten Codex- und Claude-Dateien finden keinen unaufgelösten Goal-Start-Platzhalter und
      keine widersprüchliche alte „immer Prompt ausgeben“-Anweisung an den acht Gates.

Gemeinsame messbare Abschlussbedingung: Alle acht bestätigungspflichtigen Goal-Gates starten in
Codex bei verfügbarer Capability genau ein Goal mit der abgeleiteten Bedingung und ohne implizites
Budget, fallen bei fehlender Capability oder technischem Startfehler auf den vollständigen Prompt
zurück, halten bei einem bereits aktiven Goal ohne Zustandsänderung zur User-Entscheidung an,
behalten in Claude Code und Portable den Prompt-Handoff und lassen alle Nicht-Goal-Pfade
unverändert; die drei CI-Befehle laufen mit Exit-Code 0 und die generierten Artefakte erfüllen die
gezielten Inhaltsprüfungen.

## Validierungsplan

- `pnpm agent:check` – sämtliche geänderten Markdown- und JavaScript-Dateien entsprechen oxfmt.
- `pnpm test` – die neuen Goal-Start-Transformfälle und alle bestehenden Build-Transformtests
  bestehen.
- `node build.mjs` – alle drei Harnesses werden vollständig erzeugt und alle bestehenden Guards
  bestehen.
- Mit `rg` in `dist/codex/effective-flow/` prüfen, dass die acht expliziten Goal-Gates den
  direkten `create_goal`-Versuch, Objective-Regel und Prompt-Fallback enthalten, aber keine
  bedingungslose Prompt-only-Anweisung mehr.
- Mit `rg` in `dist/claude/effective-flow/` prüfen, dass dieselben Gates den `/goal`-Prompt-Handoff
  enthalten und keine direkte `create_goal`-Anweisung.
- Dieselbe Prüfung in `dist/portable/effective-flow/` für den portablen prompt-only Pfad
  wiederholen.
- Mit `rg` in allen drei Dist-Bäumen prüfen, dass der neue Source-Platzhalter vollständig ersetzt
  ist.
- `apply-review` in allen drei Dist-Bäumen gezielt lesen und bestätigen, dass sein optionaler
  Prompt-Handoff ohne explizite Goal-Auswahl kein Goal direkt startet.
- Die fünf Laufzeitszenarien anhand der generierten Instructions durchgehen: Codex-Erfolg,
  Codex-Capability fehlt beziehungsweise technischer Fehler mit Prompt-Fallback, Codex-Aufruf
  scheitert wegen aktivem Goal ohne Prompt oder Zustandsänderung, Claude-Code-Auswahl und
  Portable-Auswahl.
- Vor Abschluss `git diff --check` und einen gezielten Diff gegen die bei Start vorhandenen
  fremden Änderungen ausführen; bei `AGENTS.md` insbesondere bestätigen, dass der bereits
  vorhandene Projektsetup-Marker erhalten blieb.

## Annahmen und offene Punkte

- Entscheidung aus dem vertieften Review: Der Fallback ist fehlerabhängig. Fehlende Capability
  und technische Fehler verwenden den bisherigen Prompt; ein bereits aktives Goal führt zu einer
  Konfliktmeldung und einer User-Entscheidung, ohne Prompt-Ausgabe oder automatische
  Zustandsänderung.
- Annahme: Die aufrufbare Capability heißt in den unterstützten Codex-Surfaces `create_goal` und
  akzeptiert die aktuell sichtbare Form mit `objective` sowie optionalem `token_budget`. Weil das
  öffentliche Handbuch nur den manuellen `/goal`-Einstieg garantiert, bleibt die Capability-Prüfung
  zur Laufzeit verpflichtend.
- Annahme: Ein erfolgreicher `create_goal`-Aufruf aktiviert die bestehende Goal-Fortsetzung des
  Harnesses; Effective Flow implementiert keine eigene Persistenz oder Scheduling-Schleife.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       1 |       1 |
| Security    |        0 |       0 |       0 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       1 |       1 |
| Testbarkeit |        0 |       0 |       1 |
| Scope       |        0 |       0 |       1 |
| Wartbarkeit |        0 |       0 |       1 |

### Befunde

- **Wichtig – Architektur/Dokumentation (eingearbeitet):** `AGENTS.md` ist die kanonische
  Source-Autorenreferenz für Placeholder und Directives. Der erste Entwurf nannte nur die
  ausführliche Build-System-Dokumentation. Der Plan nimmt `AGENTS.md` nun ausdrücklich in Scope
  und schützt zugleich dessen bereits vorhandene fremde Projektsetup-Änderung.
- **Hinweis – Architektur/Wartbarkeit:** Die Differenz gehört in die bestehende
  harness-spezifische Build-Pipeline. Ein einzelner zentraler Platzhalter verhindert, dass acht
  Workflow-Dateien jeweils eigene Codex-/Claude-Verzweigungen pflegen.
- **Hinweis – Fehlerfälle:** Die öffentliche Codex-Dokumentation garantiert den manuellen
  `/goal`-Einstieg, während die aktuelle Sitzung zusätzlich `create_goal` anbietet. Der Plan
  behandelt den Tool-Aufruf deshalb als bevorzugten Versuch und bewahrt bei fehlender Capability
  oder technischem Fehler den dokumentierten Prompt-Pfad als Fallback.
- **Wichtig – Fehlerfälle (im vertieften Review entschieden und eingearbeitet):** Ein einheitlicher
  Prompt-Fallback könnte bei einem bereits aktiven Goal dessen Zustand unerwartet beeinflussen.
  Fehlende Capability und technische Fehler verwenden nun den bisherigen Prompt; ein explizit
  gemeldeter aktiver-Goal-Konflikt hält ohne Prompt oder Zustandsänderung zur User-Entscheidung an.
- **Hinweis – Testbarkeit:** Der direkte Produktzustand lässt sich in diesem reinen
  Source-to-Dist-Repository nicht als Integrationstest starten. Reine Transformtests,
  Harness-Artefaktprüfungen und konkret benannte Laufzeitszenarien sichern den Instruktionsvertrag
  proportional ab.
- **Hinweis – Scope:** `apply-review` besitzt derzeit keinen ausdrücklichen Goal-Auswahlschritt.
  Ein automatischer Direktstart dort würde die User-Autorisierung erweitern und bleibt bewusst
  außerhalb dieser Änderung.

## Offene Punkte

- Keine offenen Punkte.

## Umsetzungsergebnis

- `{{GOAL_START}}` wird zentral in `build-lib.mjs` für native Codex-, Claude- und
  Portable-Ausgaben transformiert. Codex erhält den direkten Startversuch; Claude und Portable
  behalten den Prompt-Handoff.
- Das neue Shared Fragment `goal-start-action` wird ausschließlich von den acht expliziten
  Goal-Gates eingebunden. `apply-review` behält dadurch eindeutig seinen optionalen prompt-only
  Sonderfall.
- Die Antwortsemantik unterscheidet das dreigliedrige Gate und die eigenständige Ja/Nein-Frage:
  Nur „Autonomous via `/goal`“ beziehungsweise „Yes“ auf die eigenständige Folgefrage autorisiert
  den autonomen Start.
- Reine Transformtests und datengetriebene Regressionstests rendern alle acht echten Gate-Sources
  für Codex, Claude und Portable sowie den negativen `apply-review`-Fall.

### Abschlussvalidierung

- `pnpm agent:check`: Exit-Code 0
- `pnpm test`: Exit-Code 0, 280 von 280 Tests bestanden
- `node build.mjs`: Exit-Code 0, alle drei Targets erzeugt
- `git diff --check`: Exit-Code 0
- Artefaktprüfung: exakt acht Codex-Tools mit je einer `create_goal`-Anweisung; keine solche
  Anweisung in `apply-review`, Claude oder Portable; kein verbleibendes `{{GOAL_START}}` unter
  `dist/`.

### Umsetzungsreview

| ID    | Schweregrad | Befund                                                           | Ergebnis |
| ----- | ----------- | ---------------------------------------------------------------- | -------- |
| F-001 | Wichtig     | Widersprüchliche „Yes“-Semantik der eigenständigen Goal-Frage    | Behoben  |
| F-002 | Wichtig     | Direkte Startanweisung erreichte auch den `apply-review`-Prompt  | Behoben  |
| F-003 | Hinweis     | Keine Regressionstests über die acht echten Gate-Sources         | Behoben  |
| F-004 | Hinweis     | Plan berücksichtigte den neuen Portable-Target nicht vollständig | Behoben  |
| F-005 | Wichtig     | Bestehende `maintain`-Optionslabels wurden sichtbar verändert    | Behoben  |
| F-006 | Hinweis     | Plan qualifizierte den gated „Yes“-Pfad nicht nach Gate-Form     | Behoben  |

Keine weiteren kritischen, wichtigen oder Hinweis-Befunde wurden gemeldet.
