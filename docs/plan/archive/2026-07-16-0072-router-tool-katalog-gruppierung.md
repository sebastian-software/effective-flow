# 0072: Router-Tool-Katalog gruppieren und entscheidungsorientiert beschreiben

**Planungsstatus:** Umgesetzt
**Quelle:** /firmo plan
**Empfohlener Workflow:** Feature (`/firmo build`)

## Anforderung

Wenn der Firmo-Skill **ohne** (oder mit unbekanntem) Tool aufgerufen wird, gibt der
Router aktuell eine **flache** Tool-Liste aus – je Zeile der erste Satz der
implementierungs­orientierten Frontmatter-`description` eines Tools. Das hilft wenig bei
der Frage „Welches Tool ist für mein Anliegen das richtige?".

Ziel dieses Anschlussplans (zu 0070 und 0071): Die Tool-Liste im Router wird **gruppiert**
und je Tool mit einer **nutzungs- und entscheidungsorientierten** Kurzbeschreibung
ausgegeben, sodass ein Nutzer schnell erkennt, welches Tool zu seinem Anliegen passt.

Zwei im Klärungslauf getroffene Entscheidungen prägen den Plan:

- **Gruppierung nach Intent** (Nutzerabsicht), fünf Gruppen mit kurzer „Wann"-Zeile, wo
  sie den Nutzen erhöht:
  1. **Verstehen, was zu tun ist** _(Analyse & Planung, bevor Code entsteht)_ –
     `investigate`, `plan`, `open-plans`, `plan-issue`
  2. **Eine Änderung umsetzen** _(vom geklärten Plan/Issue zum Code)_ – `apply`, `build`,
     `fix`, `refactor`, `docs`
  3. **Qualität sichern** – `review`
  4. **Änderungen einbringen** – `commit`, `pr`
  5. **Einrichten & Infos** – `setup`, `version`
- **Neue Quelle der Kurzbeschreibung:** ein **neues Frontmatter-Feld** je Tool (statt die
  bestehende implementierungs­orientierte `description` umzuschreiben, die zusätzlich für
  Autocomplete und – bei Agents – Subagent-Beschreibungen genutzt wird).

## Architekturentscheidungen

- **Gruppen + Reihenfolge zentral in `build.mjs` (eine Quelle).** Die heutige flache
  Konstante `EXPOSED_TOOLS` (Reihenfolge = Katalogreihenfolge) wird durch eine gruppierte
  Struktur `TOOL_GROUPS` ersetzt: eine geordnete Liste von Gruppen, je Gruppe ein Titel,
  eine optionale „Wann"-Zeile und die geordnete Tool-Namensliste. `EXPOSED_TOOLS` wird aus
  `TOOL_GROUPS` **abgeleitet** (flach), damit die bestehenden Nutzungen (Autocomplete-Hint,
  Guards, Zähler) unverändert weiterlaufen und Gruppierung wie Reihenfolge an genau einer
  Stelle definiert sind.
- **Neues Frontmatter-Feld `catalogHint` je Tool.** Jede exponierte Tool-Quelle
  (`src/tools/<name>.md`) erhält ein neues, strikt in Anführungszeichen gesetztes Feld
  (Arbeitsname `catalogHint`) mit **einer** nutzungsorientierten Kurzbeschreibung. `build.mjs`
  liest dieses Feld und verwendet es im Katalog **verbatim** – nicht mehr
  `firstSentence(description)`. Die bestehende `description` bleibt unverändert und weiter
  für Autocomplete/Subagent-Beschreibung zuständig.
- **Rendering im Build, kein Laufzeit-Verhalten.** Der gruppierte Katalog wird wie bisher
  über den Platzhalter `{{TOOL_CATALOG}}` zur Buildzeit in `SKILL.md` eingesetzt. Die
  Dispatch-Regel bleibt: bei „kein/unbekanntes Tool" gibt der Router die (nun gruppierte)
  Liste aus. Es entsteht keine neue Laufzeitlogik.
- **Harness-Neutralität bleibt erhalten.** Gruppentitel und „Wann"-Zeilen sind
  harness-neutral; nur das Aufruf-Präfix der Tool-Zeilen unterscheidet sich weiterhin
  (`/firmo` für Claude, `$firmo` für Codex) über die bestehende `skillInvocation`-Logik.
- **Guards halten Katalog und Quellen synchron.** Neue Build-Guards stellen sicher, dass
  (a) jedes exponierte Tool genau einer Gruppe zugeordnet ist (vollständige, überschneidungs­freie
  Abdeckung, keine unbekannten Namen) und (b) jedes exponierte Tool ein nicht-leeres, strikt
  quotiertes `catalogHint` besitzt. So schlägt der Build fehl, wenn ein neues Tool ohne
  Gruppe oder ohne Nutzungsbeschreibung ergänzt wird.

## Betroffene Dateien

| Datei                                                                                                                                                                                                           | Geplante Änderung                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build.mjs`                                                                                                                                                                                                     | `EXPOSED_TOOLS` durch geordnete Struktur `TOOL_GROUPS` (Titel, optionale „Wann"-Zeile, Tool-Liste) ersetzen und `EXPOSED_TOOLS` daraus ableiten; `catalogForHarness` auf gruppiertes Rendering umstellen (Gruppentitel als `###`, optionale Intro-Zeile, Tool-Zeilen mit `catalogHint` statt `firstSentence(description)`); `catalogHint` aus Tool-Frontmatter lesen; neue Guards (Gruppen-Abdeckung, `catalogHint`-Pflicht + strikte Quotierung). |
| `src/tools/build.md`, `fix.md`, `plan.md`, `refactor.md`, `docs.md`, `review.md`, `apply.md`, `plan-issue.md`, `maintain.md`, `commit.md`, `pr.md`, `setup.md`, `open-plans.md`, `investigate.md`, `version.md` | Je ein neues Frontmatter-Feld `catalogHint` mit nutzungs-/entscheidungsorientierter Kurzbeschreibung (eine Aussage, „wann greife ich dazu"). Bestehende `description` unverändert.                                                                                                                                                                                                                                                                 |
| `src/SKILL.md`                                                                                                                                                                                                  | Dispatch-Regel 1 knapp anpassen, sodass klar ist, dass die **gruppierte** Liste zur Orientierung ausgegeben wird; `{{TOOL_CATALOG}}`-Platzhalter bleibt. Optional ein Einleitungssatz über dem Katalog.                                                                                                                                                                                                                                            |
| `AGENTS.md`                                                                                                                                                                                                     | Abschnitt „Adding a tool" ergänzen: neues Pflicht-Frontmatter-Feld `catalogHint` und Zuordnung zu einer Gruppe in `TOOL_GROUPS`; Hinweis auf die Guards.                                                                                                                                                                                                                                                                                           |

Hinweis: `maintain` war in den fünf Gruppen der Klärung nicht namentlich genannt; die
Zuordnung (Gruppe „Eine Änderung umsetzen") wird in `## Implementierungsdetails` verbindlich
festgelegt.

## Implementierungsdetails

### Vorgehen

1. **`TOOL_GROUPS` einführen (`build.mjs`).** Geordnete Gruppenstruktur gemäß den fünf
   Intent-Gruppen anlegen; `maintain` der Gruppe „Eine Änderung umsetzen" zuordnen (Wartung
   ist eine code-ändernde Umsetzung). `EXPOSED_TOOLS` aus `TOOL_GROUPS` flach ableiten
   (Reihenfolge = Konkatenation der Gruppen in Gruppen-Reihenfolge), damit Autocomplete-Hint,
   Guards und Zähler unverändert funktionieren.
2. **`catalogHint` je Tool ergänzen (`src/tools/*.md`).** Pro Tool eine kurze,
   entscheidungsorientierte Zeile schreiben. Schreibrichtlinie: eine Aussage, aktiv,
   nutzerseitig, idealerweise „wann/wozu". Beispiele (Formulierung final beim Umsetzen):
   - `plan`: „Klärt eine Aufgabe vollständig und schreibt einen umsetzbaren Plan – ohne Code."
   - `fix`: „Behebt einen konkreten Bug mit minimalem, regressions­gesichertem Eingriff."
   - `apply`: „Startet die Umsetzung aus einer fertigen Quelle (Plan, Issue, Review-Finding)."
   - `open-plans`: „Zeigt, welche Pläne noch offen sind, wenn du den Faden wieder aufnimmst."
3. **Gruppiertes Rendering (`build.mjs`).** `catalogForHarness` erzeugt pro Gruppe eine
   `###`-Überschrift, optional die „Wann"-Zeile, dann die Tool-Zeilen im Format
   `- \`<invocation> <name>\` — <catalogHint>`. Aufruf-Präfix weiter über `skillInvocation`.
4. **Guards ergänzen (`build.mjs`).** Prüfen, dass die Vereinigung aller Gruppen-Tools exakt
   der Menge der exponierten Tools entspricht (keine fehlenden, doppelten oder unbekannten
   Namen) und dass jedes exponierte Tool ein nicht-leeres, strikt doppelt-quotiertes
   `catalogHint` trägt. Fehlerausgabe analog zu den bestehenden Guards.
5. **Router-Text & Doku (`src/SKILL.md`, `AGENTS.md`).** Dispatch-Regel 1 so schärfen, dass
   die gruppierte Orientierungsliste gemeint ist; `AGENTS.md` um das neue Pflichtfeld und die
   Gruppenzuordnung erweitern.
6. **Build & Prüfung.** `node build.mjs` und `pnpm agent:check` grün; erzeugte
   `dist/claude/…/SKILL.md` und `dist/codex/…` auf korrektes gruppiertes Layout und korrekte
   Präfixe sichten.

### Gruppen- und Rendering-Modell

- Gruppenreihenfolge und Mitgliedschaft wie in `## Anforderung`; `maintain` in Gruppe 2.
- „Wann"-Zeile ist **pro Gruppe optional**. Gemäß abgestimmtem Layout tragen mindestens die
  Gruppen 1 und 2 eine solche Zeile; für die übrigen ist sie optional und knapp zu halten.
- Der Katalog bleibt vollständig statisch im gebauten `SKILL.md`; die Ausgabe bei
  „kein/unbekanntes Tool" ist unverändert eine reine Wiedergabe dieses Katalogs.

### State-Management

Nicht relevant (Source-to-Dist-Build ohne Laufzeit-State).

### API-Anbindung

Nicht relevant.

### Edge Cases

- **Neues Tool ohne Gruppe/`catalogHint`:** Build-Guard schlägt fehl (gewollt), damit der
  Katalog nie unvollständig oder inkonsistent wird.
- **Codex-Harness:** Gruppentitel/„Wann"-Zeilen identisch; nur die Tool-Zeilen nutzen
  `$firmo`. Verifizieren, dass die Präfix-Ersetzung ausschließlich die Aufrufzeilen trifft.
- **Interne Tools (`apply-plan` etc.):** nicht in `TOOL_GROUPS`/`EXPOSED_TOOLS`, erscheinen
  weiterhin nicht im Katalog.
- **Router-Frontmatter-`description`** (die flache „Tools: …"-Aufzählung) bleibt unberührt;
  sie ist Skill-Metadaten, nicht der ausgegebene Katalog.
- **Autocomplete-Hint** (`argumentHint`) bleibt eine flache Namensliste aus dem abgeleiteten
  `EXPOSED_TOOLS`; die Gruppierung betrifft nur den sichtbaren Katalogtext.

## Akzeptanzkriterien

- [ ] `node build.mjs` und `pnpm agent:check` laufen fehlerfrei; die neuen Guards sind aktiv.
- [ ] Der gebaute Router (`dist/claude/**/SKILL.md` und `dist/codex/**`) gibt die Tools in
      den fünf Intent-Gruppen mit Überschriften aus; Gruppen 1 und 2 tragen ihre „Wann"-Zeile.
- [ ] Jede Tool-Zeile zeigt die neue `catalogHint`-Kurzbeschreibung (nutzungsorientiert),
      nicht mehr den ersten Satz der implementierungs­orientierten `description`.
- [ ] Alle 15 exponierten Tools erscheinen genau einmal, jeweils in genau einer Gruppe;
      `maintain` ist in „Eine Änderung umsetzen".
- [ ] Ein Build mit einem exponierten Tool **ohne** `catalogHint` oder **ohne**
      Gruppenzuordnung schlägt mit klarer Fehlermeldung fehl.
- [ ] Claude-Katalog nutzt `/firmo <tool>`, Codex-Katalog `$firmo <tool>`; Gruppentitel und
      „Wann"-Zeilen sind in beiden identisch.
- [ ] `argumentHint`/Autocomplete bleibt eine vollständige flache Namensliste; kein Tool
      fehlt durch die Umstellung.
- [ ] `AGENTS.md` dokumentiert das neue Pflichtfeld und die Gruppenzuordnung.

## Validierungsplan

- `node build.mjs` (beide Harnesses) und `pnpm agent:check` (oxfmt) grün.
- Sichtprüfung der erzeugten `SKILL.md` beider Harnesses: Gruppen, „Wann"-Zeilen,
  `catalogHint`-Texte, korrekte `/firmo`- bzw. `$firmo`-Präfixe.
- Negativtest: temporär ein `catalogHint` entfernen bzw. ein Tool aus `TOOL_GROUPS` weglassen
  und prüfen, dass der Build gezielt fehlschlägt.
- Diff-Kontrolle, dass `description`, Autocomplete-Hint und interne Tools unverändert sind.

## Annahmen und offene Punkte

- Annahme: Feldname `catalogHint`; ein anderer sprechender Name (z. B. `usage`) ist beim
  Umsetzen zulässig, solange Build-Leseseite und `AGENTS.md` konsistent sind.
- Annahme: `maintain` gehört in Gruppe „Eine Änderung umsetzen"; falls eine eigene
  Wartungs-Einordnung gewünscht ist, beim Umsetzen anpassen.
- Annahme: Die „Wann"-Zeilen der Gruppen 3–5 bleiben optional/knapp; verbindlich sind nur
  die für Gruppen 1 und 2 aus dem abgestimmten Layout.
- Abhängigkeit (aktualisiert): **0070 und 0071 sind bereits auf `main` gemergt** – es gibt
  keine Parallel-Umsetzung und damit keine Merge-Konflikte mehr. Dieser Plan setzt auf dem
  aktuellen Stand auf: `build.mjs` ist unverändert (flaches `EXPOSED_TOOLS`,
  `firstSentence(description)`-Katalog, kein `TOOL_GROUPS`), `src/SKILL.md` nutzt weiterhin
  den flachen `{{TOOL_CATALOG}}`, und `catalogHint` existiert noch nirgends. Das neue
  `catalogHint`-Feld wird in die aktuellen Frontmatter-Blöcke der 15 Tools ergänzt – bei
  `setup.md` in das seit 0071 auf den Wizard umgestellte Frontmatter (die neue `catalogHint`
  soll den Setup-Wizard nutzungsorientiert beschreiben, z. B. „Richtet Firmo im Projekt ein –
  geführter Wizard, startet mit sicheren Defaults").

## Testergebnisse

Umgesetzt über `/firmo apply` → `/firmo build` in-place auf dem Branch
`firmo/build/router-catalog-groups`, Commit `3a0b64f` (`feat(router): group the tool catalog
by intent with usage hints`):

- `build.mjs`: flaches `EXPOSED_TOOLS` durch `TOOL_GROUPS` (fünf Intent-Gruppen) ersetzt und `EXPOSED_TOOLS` daraus abgeleitet; `catalogForHarness` auf gruppiertes Rendering umgestellt (Gruppentitel `###`, optionale „Wann"-Zeile, Tool-Zeilen mit `catalogHint`); neue Guards (genau eine Gruppe je Tool, `catalogHint` Pflicht + strikt quotiert); ungenutzter `firstSentence`-Import entfernt.
- Alle 15 exponierten Tools um ein Frontmatter-Feld `catalogHint` (nutzungsorientierte Zeile) ergänzt; `description` unverändert.
- `src/SKILL.md`: Dispatch-Regel 1 auf „gruppierte Liste zur Orientierung" geschärft, Einleitungssatz über dem Katalog; `{{TOOL_CATALOG}}` unverändert.
- `AGENTS.md`: Abschnitt „Adding a tool" um `catalogHint`-Pflicht und `TOOL_GROUPS`-Zuordnung erweitert.

Validierung: `node build.mjs` grün (beide Harnesses), `pnpm agent:check` grün (144 Dateien).
Sichtprüfung der erzeugten `dist/claude/…/SKILL.md` (Präfix `/firmo`) und
`dist/codex/…/SKILL.md` (Präfix `$firmo`): fünf `###`-Gruppen mit `catalogHint`-Zeilen,
Gruppen 1 und 2 mit „Wann"-Zeile. Keine Test-Suite; der Build ist die maßgebliche Prüfung.

## Review-Findings

Keine offenen kritischen Findings. Die Änderung ist auf Router-Katalog, ein Frontmatter-Feld
und das Build-Rendering begrenzt; Tool-Verhalten und Dispatch-Logik bleiben unberührt.

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
| Scope       |        0 |       0 |       1 |
| Wartbarkeit |        0 |       0 |       1 |

### Befunde

- **Architektur (Hinweis):** `EXPOSED_TOOLS` aus `TOOL_GROUPS` abzuleiten hält Reihenfolge
  und Gruppierung an einer Stelle; die bestehenden Nutzungen (Guards, Autocomplete, Zähler)
  bleiben dadurch unverändert kompatibel.
- **Fehlerfälle (Hinweis):** Die neuen Guards fangen fehlende Gruppen-/`catalogHint`-Angaben
  zur Buildzeit ab, sodass ein inkonsistenter Katalog nicht ausgeliefert werden kann.
- **Scope (Hinweis):** Bewusst eng gehalten – nur Router-Katalog, ein Frontmatter-Feld und
  Build-Rendering; keine Änderung an Tool-Verhalten oder Dispatch-Logik.
- **Wartbarkeit (Hinweis):** 0070/0071 sind gemergt; die frühere Parallel-Abhängigkeit ist
  aufgelöst. Beim Umsetzen nur darauf achten, dass die neue `catalogHint` von `setup.md` zum
  seit 0071 geänderten Wizard-Frontmatter passt (siehe „Annahmen und offene Punkte“).

## Offene Punkte

- Keine offenen Punkte.
