# Skill-Discovery und Skill-Konfiguration in Firmo-Tools und Agents

**Planungsstatus:** Umgesetzt
**Quelle:** /firmo plan
**Empfohlener Workflow:** Feature (`/firmo build`)

## Anforderung

Die Umsetzer-Tools (`build`, `fix`, `refactor`, `docs`, `maintain`), die
Analyse-/Planungs-Tools (`plan`, `plan-issue`, `investigate`) und **alle** Firmo-Agents
(Implementer, Producer und Reviewer/Validator) sollen **vor** der eigentlichen Umsetzung,
Planung bzw. Prüfung die in der Host-Umgebung vorhandenen Skills sichten, ihre Relevanz
für die konkrete Aufgabe beurteilen und die nützlichen Skills einbinden. Bei den
Analyse-/Planungs-Tools bleibt deren **No-Code-Grenze** strikt erhalten: Skills informieren
Analyse und Plan, erzeugen aber keinen Code.

Bewusst **nicht** direkt eingebunden werden `review`, `apply`/`apply-plan`/`apply-review`/
`apply-issues`, `commit`, `pr`, `setup`, `open-plans`, `version`: `review` erreicht Skills
über seine delegierten Reviewer-Agents, die Apply-Tools über die Umsetzungs-Tools, an die
sie routen; die übrigen erzeugen weder Code noch Analyse und brauchen keine Discovery.

Ziel ist, dass Firmo domänenspezifische Skills, die im Zielprojekt oder in der
Host-Umgebung installiert sind (z. B. `frontend-design`, `impeccable`, `copywriting`,
`audit`, `critique`, projekteigene Skills), automatisch nutzt, statt sie zu ignorieren. Die Auswahl soll **aufgabenabhängig** erfolgen: nur klar relevante
Skills werden eingebunden, irrelevante nicht.

Das bisherige **statische Preload** über das `skills:`-Frontmatter der Agents wird dabei
**vollständig entfernt** und durch zwei harness-neutrale, laufzeitbasierte Mechanismen
ersetzt: (1) **eingebaute per-Agent-Empfehlungen** in der Agent-Quelle (universeller
Default, „bevorzuge diese Skills, falls verfügbar") und (2) einen optionalen
`skills`-Block in `.firmo/config.json`, mit dem ein Projekt Skills global, per-Agent oder
per-Tool verbindlich einbinden (`include`) bzw. ausschließen (`exclude`) und die dynamische
Skill-Nutzung ganz abschalten kann (`enabled`). So lässt sich die Skill-Nutzung
projektspezifisch steuern, ohne die ausgelieferten Skill-Definitionen zu ändern.

Begründung der Workflow-Empfehlung: Es entsteht neues Verhalten (eine bisher nicht
vorhandene Discovery-/Einbindungs-Phase, ein neues Config-Feld, Entfernen des Preloads)
in den ausgelieferten Skill-Definitionen. Das ist eine funktionale Erweiterung → Feature
(`/firmo build`). Es ist kein reines Refactoring (Verhalten ändert sich) und keine reine
Doku-Änderung.

## Architekturentscheidungen

### Drei Hebel, alle harness-neutral und laufzeitbasiert

1. **Dynamische Discovery (Kern der Aufgabe):** Ein harness-neutraler Prosa-Baustein
   weist Tools und Agents an, vor der Umsetzung die verfügbaren Skills zu sichten,
   Relevanz zu prüfen und passende Skills aufzurufen. Auf Claude über das `Skill`-Tool
   und den in den Kontext eingespielten Skill-Katalog; auf Codex über dessen
   Skill-Mechanismus (`/skills` bzw. `skills/list`). Der Baustein nennt keinen
   harness-spezifischen Mechanismus namentlich.

2. **Eingebaute per-Agent-Empfehlungen (ersetzt das Preload):** Jeder Agent, der bisher
   ein `skills:`-Frontmatter hatte, trägt seine kuratierten Skills künftig als kurze
   Empfehlungsliste in der **Agent-Prosa** (Abschnitt „Empfohlene Skills"). Der
   Discovery-Baustein behandelt sie als „bevorzugt anwenden, falls verfügbar". Das ist
   der universelle Default: Er ist in Firmos Quelle eingebaut, gilt in **jedem** Projekt
   ohne weitere Einrichtung, wirkt auf **beiden** Harnesses und wird **on-demand**
   geladen (kein permanenter Kontext-Ballast).

3. **Config-Steuerung (`.firmo/config.json` `skills`):** Projektspezifische
   `include`/`exclude`-Listen (global, per-Agent und per-Tool) und der `enabled`-Schalter
   überschreiben bzw. ergänzen die Built-in-Empfehlungen zur Laufzeit.

### Warum das Preload entfällt

Das `skills:`-Frontmatter lud Skill-Inhalte unbedingt beim Agent-Start in den Kontext.
Nachteile, die mit dem Entfernen wegfallen: Es war **Claude-spezifisch** (Codex hat kein
solches Feld), kostete **Kontext-Tokens bei jedem Lauf** unabhängig von Relevanz, war
**nicht sichtbar/editierbar** (in `dist/` gebacken) und referenzierte Skills, die im
Zielprojekt gar nicht installiert sein müssen. Die eingebauten Empfehlungen liefern
denselben kuratierten Nutzen, aber harness-neutral, on-demand und über Config
überschreibbar. Funktionaler Unterschied: Eine Empfehlung ist „bevorzugt anwenden, wenn
relevant und verfügbar" statt „bedingungslos im Kontext" — für die betroffenen,
quasi-immer-relevanten Skills praktisch gleichwertig, kostet aber einen Tool-Call und
eine Relevanz-Entscheidung.

### Volle Harness-Neutralität

Da kein Preload mehr existiert, ist das Feature in seiner **Capability vollständig
harness-neutral**: Auf Claude und Codex gelten dieselben Empfehlungen und dieselbe
Config-Steuerung. Der einzige harness-spezifische Rest ist ein reines **Mechanik**-Detail
(siehe nächster Abschnitt): das `Skill`-Tool in der Claude-Frontmatter.

### `Skill`-Tool für dynamische Invocation (Claude)

Damit ein Claude-Subagent einen Skill zur Laufzeit aufrufen kann, muss `Skill` in seiner
`claude.tools:`-Liste stehen. Deshalb wird `Skill` den `claude.tools:`-Listen **aller**
in Scope stehenden Agents hinzugefügt — **einschließlich der Reviewer** (`frontend-reviewer`,
`nodejs-reviewer`, `rust-reviewer`, `code-validator`). Ihr read-only-Charakter bleibt
gewahrt: `Skill` selbst mutiert keine Dateien, und die Reviewer besitzen weiterhin kein
`Write`/`Edit`/`Bash` (`code-validator` behält sein bestehendes `Bash` für Lint-/
Build-Checks). Der Codex-Zweig wertet `claude.tools` nicht aus; die Änderung wirkt sich
nur auf den Claude-Output aus.

### Config-Schema und effektive Politik

**Schema (global + per-Agent + per-Tool):**

```json
{
  "skills": {
    "enabled": true,
    "include": ["mein-projekt-skill"],
    "exclude": ["humanizer"],
    "agents": { "ui-implementer": { "include": [], "exclude": [] } },
    "tools": { "plan": { "include": [], "exclude": [] } }
  }
}
```

**Felder:**

- `enabled` (bool, Default `true`): gate für die **gesamte** dynamische Skill-Ebene. `false`
  = keine Laufzeit-Skills (weder Empfehlungen noch freie Discovery).
- `include` (Liste): Skills, die **zusätzlich bevorzugt** berücksichtigt werden — v. a.
  projekteigene. Ein nicht installierter Skill wird still ignoriert.
- `exclude` (Liste): Skills, die **nie** eingebunden werden — überstimmt auch eine
  Built-in-Empfehlung und ein `include`.
- `agents.<name>`: dieselben Felder je Agent. Schlüssel ist der **Quell-Agent-Name**
  (`ui-implementer`, nicht `firmo-ui-implementer`), damit harness-neutral.
- `tools.<name>`: dieselben Felder je Tool. Schlüssel ist der **Tool-Name**
  (`plan`, `build`, `fix`, `refactor`, `docs`, `maintain`, `plan-issue`, `investigate`).
  Wirkt nur bei den Tools, die den Discovery-Baustein tragen; ein Eintrag für ein Tool
  ohne Baustein (z. B. `commit`) ist ein No-Op.

**Effektive „bevorzugt"-Menge zur Laufzeit** (für einen Agent bzw. ein Tool):
`(Built-in-Empfehlungen ∪ include_global ∪ include_scope) − (exclude_global ∪ exclude_scope)`,
wobei `scope` bei einem Agent `agents.<name>` und bei einem Tool `tools.<name>` ist.
`exclude` gewinnt immer; der Scope-Eintrag ergänzt global (Union der Includes, Union der
Excludes). Tools haben keine Built-in-Empfehlungen (die stehen nur in Agents), profitieren
aber von `include`/`exclude`. Zusätzlich darf der Baustein aufgabenabhängig weitere
relevante Katalog-Skills einbinden, sofern nicht in `exclude`. Alles greift nur, wenn
`enabled` nicht `false` ist.

Ist eine Built-in-Empfehlung als **Fallback-Gruppe** notiert (`A › B`), trägt sie nicht
`A` und `B` zugleich zur Menge bei, sondern den **ersten verfügbaren, nicht
ausgeschlossenen** Skill der Gruppe. Config-`include`/`exclude` bleiben flache Listen
(keine Fallback-Gruppen); `exclude` eines Gruppenmitglieds überspringt es zugunsten des
nächsten Fallbacks. Nennt ein `include` explizit ein Fallback-Mitglied (z. B.
`frontend-design`, während die Gruppe `impeccable` bevorzugt), gilt das als bewusste
Nutzer-Entscheidung und wird respektiert — es kann dann neben dem bevorzugten Gruppen-Skill
stehen; die Fallback-Ordnung steuert nur den **Built-in-Beitrag**, nicht ein explizites
`include`.

**Konsum:** Der Discovery-Baustein liest den `skills`-Block best-effort selbst (Tools und
Agents haben `Read`). Fehlt Block oder Datei, gilt der Default (`enabled: true`, leere
Listen → nur Built-in-Empfehlungen greifen). Ein Agent liest global + `agents.<name>`, ein
Tool liest global + `tools.<name>` (jeweils nach eigenem Quell-Namen). Die additive **Default-Ergänzung** des Blocks
läuft ausschließlich über die bestehende Config-Migration in den config-lesenden Tools;
Agents lesen nur, migrieren nicht.

### Setup materialisiert die Defaults optional sichtbar

`/firmo setup` bietet an (nicht erzwungen), die per-Agent-Empfehlungen explizit als
`skills.agents.<name>.include` in die `.firmo/config.json` zu schreiben. Dann sind die
Defaults an einer Stelle sichtbar und editierbar. Lehnt der User ab, bleiben sie rein
eingebaut (virtuell) und die Config enthält nur selbst gesetzte Überschreibungen.

Bei einer **Fallback-Gruppen-Empfehlung** (`impeccable › frontend-design`) schreibt die
Materialisierung nur den **primären** Skill (`["impeccable"]`), nicht die Gruppen-Syntax
(die das flache `include` nicht kennt). Der Built-in-Fallback (`frontend-design`) bleibt
als Firmo-Sicherheitsnetz aktiv, falls das Primäre fehlt — die Materialisierung ist damit
verlustfrei und ohne Momentaufnahme-Staleness. Flache Empfehlungen (`humanizer`) werden
unverändert übernommen.

### Präzedenz und Sicherheit

Ein eingebundener Skill informiert das **Wie**, überschreibt aber nie das **Was**: Der
abgestimmte Plan, `AGENTS.md`/Projektkonventionen und Firmos eigene Sprach-, Commit- und
Scope-Regeln haben immer Vorrang. Ein Skill, der Scope erweitern, neue Dependencies
einführen oder den Plan verletzen würde, wird nicht eigenmächtig angewendet. `exclude`
und `enabled: false` sind harte Aus-Schalter.

### Build-Änderungen

Das Entfernen aller `skills:`-Frontmatter macht die `claudeSkills`-Behandlung in
`build.mjs` (aktuell Zeilen ~320/337 plus ggf. `getNestedList`) zu **totem Code**. Sie
wird entfernt, damit kein ungenutzter Pfad zurückbleibt. Der `include`-Mechanismus und die
freie `tools:`-Liste werden vom Build bereits unterstützt; das Anlegen von
`src/shared/skill-discovery.md` erfüllt den Include-Guard. Sonst bleibt `build.mjs`
unverändert.

## Betroffene Dateien

| Datei                               | Beschreibung                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/shared/skill-discovery.md`     | **Neu.** Harness-neutraler Prosa-Baustein „Skill-Discovery vor der Umsetzung": Discovery, Relevanzprüfung, Einbindung, Präzedenz, Sparsamkeit; bezieht die im Agent genannten „Empfohlenen Skills" bevorzugt ein; enthält einen querschnittlichen Library-Doku-Hinweis (aktuelle-Doku-Skills wie `context7` bei Bedarf); liest den `skills`-Block aus `.firmo/config.json` (global + per-Agent + per-Tool, `enabled`/`include`/`exclude`). Knapp wie `task-tracking.md`. |
| `src/agents/ui-implementer.md`      | Frontmatter `skills:` **entfernen**; Prosa-Abschnitt „Empfohlene Skills" (`impeccable › frontend-design` Fallback) ergänzen; `Skill` zu `claude.tools`; Include einbinden.                                                                                                                                                                                                                                                                                               |
| `src/agents/frontend-reviewer.md`   | Frontmatter `skills:` **entfernen**; „Empfohlene Skills" (`impeccable › frontend-design` Fallback); `Skill` zu `claude.tools`; Include.                                                                                                                                                                                                                                                                                                                                  |
| `src/agents/e2e-tester.md`          | Frontmatter `skills:` **entfernen** (ersatzlos, keine Built-in-Empfehlung — siehe Kuration); `Skill` zu `claude.tools`; Include.                                                                                                                                                                                                                                                                                                                                         |
| `src/agents/code-documenter.md`     | Frontmatter `skills:` (copy-editing) **entfernen**; „Empfohlene Skills" (humanizer); `Skill` zu `claude.tools`; Include.                                                                                                                                                                                                                                                                                                                                                 |
| `src/agents/docs-writer.md`         | Frontmatter `skills:` (copywriting, copy-editing, humanizer) **entfernen**; „Empfohlene Skills" (humanizer); `Skill` zu `claude.tools`; Include.                                                                                                                                                                                                                                                                                                                         |
| `src/agents/nodejs-implementer.md`  | `Skill` zu `claude.tools`; Include. Keine Built-in-Empfehlung (rein dynamisch).                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/agents/rust-implementer.md`    | `Skill` zu `claude.tools`; Include. Keine Built-in-Empfehlung.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/agents/generic-implementer.md` | `Skill` zu `claude.tools`; Include. Keine Built-in-Empfehlung.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/agents/test-writer.md`         | `Skill` zu `claude.tools`; Include. Keine Built-in-Empfehlung.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/agents/nodejs-reviewer.md`     | `Skill` zu `claude.tools`; Include.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/agents/rust-reviewer.md`       | `Skill` zu `claude.tools`; Include.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/agents/code-validator.md`      | `Skill` zu `claude.tools`; Include.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/tools/build.md`                | Include vor der Implementierungsphase einbinden.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/tools/fix.md`                  | Include vor Phase 3 (Fix) einbinden.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/tools/refactor.md`             | Include vor der Refactoring-Phase einbinden.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/tools/docs.md`                 | Include vor der Doku-Umsetzungsphase einbinden.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/tools/maintain.md`             | Include vor der Umsetzungsphase einbinden.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/tools/plan.md`                 | Include vor der Plan-Erstellung einbinden; **No-Code-Grenze** des Tools bleibt strikt — Skills (z. B. `shape`, `impeccable`) informieren nur den Planinhalt.                                                                                                                                                                                                                                                                                                             |
| `src/tools/plan-issue.md`           | Include vor der Klärungs-/Planungsphase einbinden; No-Code-Grenze bleibt strikt.                                                                                                                                                                                                                                                                                                                                                                                         |
| `src/tools/investigate.md`          | Include vor der Analysephase einbinden; No-Code-Grenze bleibt strikt (reine Ursachenanalyse).                                                                                                                                                                                                                                                                                                                                                                            |
| `src/shared/config-migration.md`    | `skills`-Block zu den additiven Defaults ergänzen (`enabled: true`, `include: []`, `exclude: []`, `agents: {}`, `tools: {}`), nicht-destruktiv; Fremd-Schlüssel bleiben erhalten.                                                                                                                                                                                                                                                                                        |
| `src/tools/setup.md`                | Wizard um den `skills`-Block erweitern (`enabled`-Schalter, globale `include`/`exclude`, per-Agent **und** per-Tool als fortgeschrittene Optionen) **und** die optionale Materialisierung der Built-in-Empfehlungen in die Config anbieten; bestehende Werte anzeigen, nicht-destruktiv.                                                                                                                                                                                 |
| `build.mjs`                         | Toten `claudeSkills`-Emissionspfad entfernen (kein Agent trägt mehr `skills:`).                                                                                                                                                                                                                                                                                                                                                                                          |
| `AGENTS.md`                         | Kurzabschnitt: Skill-Discovery, Built-in-Empfehlungen statt Preload, `.firmo/config.json` `skills`-Block, volle Harness-Neutralität.                                                                                                                                                                                                                                                                                                                                     |

## Implementierungsdetails

### Built-in-Empfehlungen pro Agent

Basis sind die heutigen Preloads, mit zwei bewussten Kurations-Änderungen (siehe unten):

| Agent               | Empfohlene Skills                       |
| ------------------- | --------------------------------------- |
| `ui-implementer`    | impeccable › frontend-design (Fallback) |
| `frontend-reviewer` | impeccable › frontend-design (Fallback) |
| `code-documenter`   | humanizer                               |
| `docs-writer`       | humanizer                               |

**Notation:** Eine flache Liste (mehrere kommagetrennte Skills) bedeutet „alle bei
Relevanz bevorzugen". `A › B (Fallback)` ist eine **geordnete Präferenz**:
bevorzuge `A`; nur falls `A` nicht verfügbar (oder per `exclude` ausgeschlossen), nutze
`B`. Der Discovery-Baustein nimmt aus einer Fallback-Gruppe den ersten verfügbaren,
nicht ausgeschlossenen Skill — nie beide gleichzeitig.

Alle übrigen Agents haben keine Built-in-Empfehlung und nutzen ausschließlich freie
Discovery plus Config.

**Bewusste Abweichungen vom bisherigen Preload-Bestand:**

- **`effective-ui-design` wird überall entfernt (deprecated).** Der Skill ist inzwischen
  deprecated und entfällt als Empfehlung bei `ui-implementer` und `frontend-reviewer`. Der
  `e2e-tester` trug ihn als einzige Alt-Zuordnung und verliert damit seine Empfehlung
  ersatzlos — was ohnehin gerechtfertigt war: ein Design-Authoring-Skill passt schlecht zu
  einem Agent, der UI _testet_ statt sie zu _bauen_.
- **`impeccable` bevorzugt bei `ui-implementer` und `frontend-reviewer`, `frontend-design`
  als Fallback.** `impeccable` ist der breitere Nachfolger von `frontend-design`: Beide
  erzeugen „production-grade frontend interfaces / real working code", aber `impeccable`
  deckt zusätzlich redesign/critique/audit/polish, ein Design-Law-System und
  Kontext-Gathering ab. Sie gleichzeitig zu empfehlen wäre redundant. Daher geordnete
  Präferenz `impeccable › frontend-design`: bevorzuge `impeccable`, nutze `frontend-design`
  nur, wenn `impeccable` nicht verfügbar ist. Der Fallback bleibt drin, weil fremde
  Projekte evtl. nur `frontend-design` installiert haben. Nicht bei Nicht-UI-Agents.
- **`code-documenter`: `copy-editing` → `humanizer`.** `copy-editing` ist ein
  **Marketing-Copy**-Skill und passt schlecht zu In-Code-Doku (JSDoc/TSDoc, Kommentare,
  CLI-Hilfe). Ersetzt durch `humanizer` (natürlicher, unaufdringlicher Schreibstil),
  der auf jeden geschriebenen Text passt — bei terser In-Code-Doku etwas leichter, aber
  sinnvoll.
- **`docs-writer`: nur `humanizer`.** `copywriting` und `copy-editing` sind
  **Marketing-Copy**-Skills und würden einen Marketing-Ton in **technische** Doku (README,
  Developer-/API-/CLI-Guides) drücken — meist falsch. Beide gestrichen; `humanizer` bleibt,
  weil natürlicher Schreibstil auch für technische Doku gilt.

Damit lauten die effektiven Empfehlungen: Frontend `impeccable › frontend-design (Fallback)`,
`code-documenter` und `docs-writer` je `humanizer`. Alle übrigen Agents haben keine
Built-in-Empfehlung.

### Vorgehen

1. `src/shared/skill-discovery.md` anlegen (deutsche Doku-Prosa, knapp, harness-neutral):
   - Vor Umsetzung/Prüfung die verfügbaren Skills sichten.
   - Die im Agent unter „Empfohlene Skills" genannten Skills **bevorzugt** anwenden, falls
     verfügbar und für die konkrete Aufgabe relevant. Fallback-Notation `A › B` beachten:
     den ersten verfügbaren, nicht ausgeschlossenen Skill der Gruppe wählen, nie beide.
   - Relevanz zur **konkreten** Aufgabe beurteilen; nur klar passende Skills einbinden
     (typisch 0–2). Keine Skills „auf Verdacht" — Token-Sparsamkeit.
   - Präzedenz: Plan, `AGENTS.md`, Projektkonventionen und Firmos Regeln schlagen jeden
     Skill. Kein eigenmächtiger Scope-Zuwachs, keine neuen Dependencies wegen eines Skills.
   - Config lesen: `skills`-Block aus `.firmo/config.json` best-effort — global plus den
     eigenen Scope-Eintrag (Agents lesen `agents.<name>`, Tools lesen `tools.<name>`, je
     nach eigenem Quell-Namen). Effektive „bevorzugt"-Menge bilden (Built-in ∪ include −
     exclude); `exclude` immer respektieren; bei `enabled: false` die gesamte dynamische
     Skill-Nutzung überspringen. Fehlt der Block, gilt der Default.
   - Orchestrator↔Agent-Koordination: Hat ein Tool bereits Skills gesichtet und dem Agent
     mitgegeben, führt der Agent keine redundante Voll-Discovery durch.
   - Library-Doku-Hinweis (querschnittlich, nicht per-Agent): Wird gegen eine unbekannte
     oder aktuelle Library/ein Framework gearbeitet, aktuelle-Doku-Skills (z. B. `context7`)
     nutzen, falls verfügbar, statt aus Erinnerung zu raten. Nur bei Bedarf; kein Zwang.
   - Kurz melden, welche Skills genutzt wurden (bzw. dass keiner passte).
   - Neutralität: kein harness-spezifischer Tool-/Kommandoname wird festgeschrieben.
2. Bei allen fünf Agents mit heutigem `skills:`-Frontmatter (`ui-implementer`,
   `frontend-reviewer`, `e2e-tester`, `code-documenter`, `docs-writer`) das Frontmatter
   `skills:` entfernen. Bei den vier Empfehlungs-Agents zusätzlich einen kurzen
   Prosa-Abschnitt „## Empfohlene Skills" mit der Liste aus obiger Tabelle ergänzen; der
   `e2e-tester` erhält keinen solchen Abschnitt.
3. In **jeden** Agent den `include`-Fence direkt nach dem `task-tracking`-Include setzen
   und `Skill` an das Ende der `claude.tools`-Liste hängen.
4. In `build.md`, `fix.md`, `refactor.md`, `docs.md`, `maintain.md` den `include`-Fence
   unmittelbar vor der Umsetzungsphase setzen. In `plan.md`, `plan-issue.md`,
   `investigate.md` den Fence vor der Plan-/Analysephase setzen und dabei die
   **No-Code-Grenze** des jeweiligen Tools ausdrücklich bekräftigen: Skills informieren nur
   Analyse und Plan, erzeugen keinen Code und ändern nichts außerhalb der erlaubten Ziele
   (`plan`: nur die Plan-Datei; `plan-issue`: nur Issue-Kommentare; `investigate`: nur der
   Investigation-Report unter `.firmo/investigation/`).
5. `src/shared/config-migration.md`: `skills`-Block (`enabled: true`, `include: []`,
   `exclude: []`, `agents: {}`, `tools: {}`) als additiven Default aufnehmen,
   nicht-destruktiv.
6. `src/tools/setup.md`: Wizard um den `skills`-Block (inkl. per-Agent- und
   per-Tool-Feinsteuerung als fortgeschrittene Optionen) und die optionale
   Empfehlungs-Materialisierung erweitern; bestehende Werte anzeigen, nicht-destruktiv.
7. `build.mjs`: toten `claudeSkills`-Pfad entfernen; prüfen, dass keine anderen Stellen
   `getNestedList`/`skills` benötigen.
8. `node build.mjs` ausführen: beide Harness-Outputs fehlerfrei, `Skill` in den
   Claude-Agent-`tools`, **kein** `skills:`-Frontmatter mehr in `dist/claude/agents/`,
   Codex-Output konsistent.
9. `pnpm format` bzw. `pnpm agent:check` sauber.

### Edge Cases

- **Keine Skills vorhanden / keiner passt:** Baustein ist ein No-Op; Umsetzung läuft
  normal weiter, ohne Fehler oder Blockade.
- **Empfohlener Skill nicht installiert:** wird still übersprungen; kein Fehler. (Die
  frühere Preload-Fehlerklasse „fehlt im Zielprojekt" entfällt komplett, da es kein
  Preload mehr gibt.)
- **`include`-Skill nicht installiert:** wird still ignoriert.
- **Skill widerspricht Plan/Konventionen:** wird nicht angewendet; Präzedenzregel greift;
  Abweichung wird kurz erwähnt.
- **`enabled: false`:** keinerlei Laufzeit-Skills — auch keine Empfehlungen; Umsetzung
  läuft ohne Skill-Ebene.
- **Ungültiger `skills`-Block:** bei ungültigem JSON oder Feldwert Default für den Lauf
  verwenden und User knapp informieren (analog bestehender Config-Fehlerbehandlung).
- **Mehrere plausible Skills:** nur die klar relevanten einbinden; Sparsamkeit vor
  Vollständigkeit.

## Akzeptanzkriterien

- [ ] `src/shared/skill-discovery.md` existiert, ist harness-neutral formuliert, nennt
      keinen harness-spezifischen Tool-/Kommandonamen und enthält den querschnittlichen
      Library-Doku-Hinweis (aktuelle-Doku-Skills wie `context7` bei Bedarf).
- [ ] **Kein** Agent trägt mehr ein `skills:`-Frontmatter; die vier Empfehlungs-Agents
      (`ui-implementer`, `frontend-reviewer`, `code-documenter`, `docs-writer`) haben
      stattdessen einen Prosa-Abschnitt „Empfohlene Skills" gemäß Kurationstabelle
      (`ui-implementer`/`frontend-reviewer`: `impeccable › frontend-design` Fallback); der
      `e2e-tester` hat `skills:` entfernt und **keine** Empfehlung.
- [ ] Der Baustein interpretiert die Fallback-Notation `A › B` korrekt: erster verfügbarer,
      nicht ausgeschlossener Skill der Gruppe, nie beide gleichzeitig.
- [ ] Alle acht Tools (`build`, `fix`, `refactor`, `docs`, `maintain`, `plan`, `plan-issue`,
      `investigate`) und alle zwölf Agents binden den Baustein via `include`-Fence ein; bei
      `plan`/`plan-issue`/`investigate` bleibt die No-Code-Grenze erhalten.
- [ ] Alle zwölf Agents — inkl. der vier Reviewer/Validator — haben `Skill` in ihrer
      `claude.tools`-Liste; read-only-Reviewer haben weiterhin kein `Write`/`Edit`/`Bash`
      (Ausnahme: `code-validator` behält `Bash`). Codex-Frontmatter unverändert.
- [ ] Der Baustein liest den `skills`-Block (global + per-Agent via `agents.<name>` +
      per-Tool via `tools.<name>`) und honoriert `enabled`/`include`/`exclude` inkl.
      Präzedenz (`exclude` schlägt `include`/Empfehlung, Scope-Eintrag ergänzt global); fehlt
      der Block, gilt der Default.
- [ ] `config-migration.md` ergänzt den `skills`-Block nicht-destruktiv als additiven
      Default; `setup.md` deckt ihn ab und bietet die optionale Materialisierung der
      Empfehlungen an.
- [ ] `build.mjs` enthält keinen `claudeSkills`-Emissionspfad mehr.
- [ ] `node build.mjs` läuft fehlerfrei (alle Guards grün); Claude-Dist enthält **kein**
      `skills:`-Frontmatter mehr; `pnpm agent:check` ist grün.

## Validierungsplan

- `node build.mjs` als maßgeblicher Check (kein Test-Suite im Repo).
- `grep` über `dist/claude/agents/`: **kein** `skills:`-Frontmatter mehr vorhanden.
- Stichprobe Claude-Dist: `dist/claude/agents/firmo-ui-implementer.md` hat kein `skills:`,
  aber den Abschnitt „Empfohlene Skills" und `Skill` in `tools:`;
  `firmo-nodejs-implementer.md` hat `Skill` in `tools:` und den Discovery-Text.
- Stichprobe Codex-Dist: `dist/codex/firmo/agents/ui-implementer.toml` enthält den
  Discovery-Text und „Empfohlene Skills" in `developer_instructions`, Frontmatter
  unverändert.
- Stichprobe Tool: `dist/*/firmo/tools/fix.md` enthält den Include an der Umsetzungsphase;
  `dist/*/firmo/tools/plan.md` enthält ihn an der Plan-Phase samt No-Code-Hinweis.
- Config-Verhalten manuell durchspielen: Test-`.firmo/config.json` mit `skills.exclude`,
  `skills.agents.<name>.include` **und** `skills.tools.<name>.include`, `enabled: false` —
  prüfen, dass ein Agent seinen `agents.<name>` und ein Tool (z. B. `plan`) seinen
  `tools.<name>` liest, dass Präzedenz greift (Scope + global, `exclude` vor
  `include`/Empfehlung, `enabled: false` aus) und ohne Block der Default gilt.
- `pnpm agent:check` (oxfmt) ohne Findings.

## Annahmen und offene Punkte

- **Entschieden (Preload-Ersatz):** Frontmatter `skills:` wird entfernt; per-Agent-
  Empfehlungen als eingebauter Quell-Default plus Config-Override; kein Preload mehr.
- **Entschieden (Setup-Materialisierung):** `setup` bietet optional an, die Empfehlungen
  sichtbar in die `.firmo/config.json` zu schreiben (nicht erzwungen).
- **Entschieden (Reviewer-Tool):** Reviewer/Validator erhalten das volle `Skill`-Tool;
  read-only-Charakter bleibt gewahrt.
- **Entschieden (Config):** `skills`-Block wird in dieses Feature integriert; Schema
  global + per-Agent + per-Tool mit `enabled`/`include`/`exclude`.
- **Annahme (Config-Konsum):** Agents lesen den `skills`-Block selbst best-effort; die
  Default-/Migrations-Ergänzung bleibt den config-lesenden Tools vorbehalten. Falls
  Agent-seitiges Lesen unerwünscht ist, kann der Orchestrator die effektive Politik im
  Delegations-Prompt mitgeben (Fallback, kein Blocker).
- **Annahme (Build-Guard):** Kein Guard erzwingt ein `skills:`-Feld; das Entfernen bricht
  den Build nicht. Während der Umsetzung gegenprüfen; falls doch ein Guard hängt, wird er
  mit angepasst.
- **Bewusst nicht migriert:** Im Plan-Verzeichnis liegen noch Alt-Pläne im
  `NNNN-slug.md`-Format. Die laut Plan-Konvention fällige Bulk-Migration (~69 `git mv`)
  wird hier bewusst **nicht** ausgeführt, um den Arbeitsbaum nicht ungefragt umzuschreiben.
  Wiedereinstieg: eigener Lauf.

## Testergebnisse

**Datum:** 2026-07-15

- `node build.mjs`: fehlerfrei (Claude: 15 Tools + 6 intern, 12 Agents; Codex: dito).
- `pnpm agent:check` (oxfmt): grün.
- Dist-Stichproben: **kein** `skills:`-Frontmatter mehr in `dist/claude/agents/`; `Skill` in
  `claude.tools` aller 12 Agents; Skill-Discovery-Include in allen 12 Agents und 8 Tools;
  „Empfohlene Skills" nur bei den 4 kuratierten Agents; Fallback-Notation `impeccable ›
frontend-design` in Claude- und Codex-Ausgabe vorhanden; e2e-tester mit Include, ohne
  Empfehlung.
- Kein Test-Suite im Repo (Korrektheit über Build-Guards, siehe `AGENTS.md`); daher keine
  Unit-/E2E-Tests.

## Review-Findings

**Datum:** 2026-07-15
**Reviewer:** nodejs-reviewer (Code- und Struktur-Review)

### Zusammenfassung

| Status                  | Anzahl |
| ----------------------- | -----: |
| Behoben                 |      1 |
| Offen / Nicht umgesetzt |      0 |

- **F1 (Hinweis, behoben):** `src/tools/setup.md` nannte „fünf Blöcke", die Aufzählung hat
  mit dem neuen `skills`-Block sieben → zählunabhängig auf „der folgenden Blöcke" geändert.

Keine kritischen oder wichtigen Findings; kein externer Review-Report nötig.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       1 |       2 |
| Security    |        0 |       0 |       1 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       0 |       2 |
| Testbarkeit |        0 |       0 |       0 |
| Scope       |        0 |       2 |       1 |
| Wartbarkeit |        0 |       1 |       1 |

### Befunde

- **Scope (Wichtig, eingearbeitet):** „Alle Agents inkl. Reviewer" schließt Reviewer/
  Validator ein. Entschieden: Reviewer erhalten das volle `Skill`-Tool; read-only bleibt
  gewahrt. Baustein neutral formuliert („Umsetzung bzw. Prüfung").
- **Scope (Wichtig, bewusst erweitert):** Preload-Entfernung + Built-in-Empfehlungen +
  Config-Block + `build.mjs`-Cleanup + Ausweitung auf die Analyse-/Planungs-Tools
  (`plan`, `plan-issue`, `investigate`) vergrößern den Scope über die reine Umsetzung
  hinaus. Bewusste User-Entscheidungen; klar abgegrenzt und über Akzeptanzkriterien/
  Validierung abgedeckt. Bei den Analyse-/Planungs-Tools schützt die bekräftigte
  No-Code-Grenze davor, dass ein Skill dort Code erzeugt.
- **Architektur (Hinweis):** Ein geteilter Baustein hält das Verhalten konsistent;
  einheitliche Position nach `task-tracking` reduziert Drift; Orchestrator↔Agent-
  Koordination verhindert doppelte Discovery.
- **Architektur (Hinweis):** Preload-Entfernung macht das Feature capability-seitig
  vollständig harness-neutral und beseitigt die frühere „Preload fehlt im Zielprojekt"-
  Fehlerklasse restlos; Built-in-Empfehlungen erhalten den kuratierten Nutzen universell.
- **Security (Hinweis):** Dynamisch aufgerufene Fremd-Skills könnten Anweisungen
  einbringen. Präzedenzregel plus `exclude`/`enabled: false` begrenzen das Risiko;
  read-only-Reviewer können keine Dateien mutieren.
- **Fehlerfälle (Hinweis):** No-Op bei fehlenden Skills und ungültigem Config-Block ist
  explizit gefordert, damit nichts blockiert.

**Zweiter vertiefter Review (nach Config-/Scope-/Fallback-Erweiterungen):**

- **Architektur (Wichtig, eingearbeitet):** `setup`-Materialisierung traf ungeklärt auf
  Fallback-Gruppen (flaches `include` kann `A › B` nicht ausdrücken). Entschieden:
  Materialisierung schreibt nur den **primären** Skill; der Built-in-Fallback bleibt aktiv
  → verlustfrei, kein Staleness.
- **Wartbarkeit (Wichtig, eingearbeitet):** Veralteter/kaputt formatierter Eintrag
  „Entschieden (Config)" (fehlendes per-Tool, oxfmt-`+`→`-`-Glitch) korrigiert.
- **Scope (Hinweis, eingearbeitet):** Die bewusst **nicht** eingebundenen Tools (`review`,
  `apply*`, `commit`, `pr`, `setup`, `open-plans`, `version`) sind jetzt explizit in der
  Anforderung benannt, inkl. wie `review`/`apply*` Skills indirekt erreichen.
- **Fehlerfälle (Hinweis, eingearbeitet):** No-Code-Ziel von `investigate`
  (`.firmo/investigation/`-Report) ergänzt; `include`-vs-Fallback-Interaktion geklärt
  (explizites `include` schlägt die Built-in-Ordnung nicht).

## Offene Punkte

- Keine offenen Punkte.
