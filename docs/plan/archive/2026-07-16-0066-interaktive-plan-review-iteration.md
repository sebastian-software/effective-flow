# 0066: Interaktive Plan-Review-Iteration

**Planungsstatus:** Umgesetzt
**Quelle:** /firmo plan
**Empfohlener Workflow:** Feature (`/firmo build`)

## Anforderung

Der Planungsmodus soll erweitert werden, damit Pläne vor der Umsetzung nicht nur
einmal intern gegengeprüft werden, sondern gezielt auf noch Unbekanntes,
Ungenaues und logische Widersprüche geprüft und iterativ mit dem User geklärt
werden können.

Am Ende einer normalen Planung soll der User gefragt werden, ob ein vertiefter
Plan-Review gestartet werden soll. Dieser Review soll den Plan insbesondere auf
Logik, Datensicherheit, Umsetzbarkeit, UI-/UX-Fragen, Fehlerfälle, Testbarkeit
und Scope prüfen. Jeder klärungsbedürftige Punkt wird einzeln mit dem User
durchgegangen. Wenn möglich, werden drei Lösungsoptionen mit Vor- und Nachteilen
sowie einer Empfehlung angeboten. Der User kann immer „Später entscheiden“
wählen.

Getroffene Entscheidungen werden direkt in den Plan eingearbeitet. Punkte ohne
Entscheidung werden in einer Liste `## Offene Punkte` am Ende des Plans
dokumentiert und dort aktuell gehalten. Der Review-Loop läuft, bis der Plan keine
kritischen Logikfehler und keine umsetzungsblockierenden Unklarheiten mehr
enthält. Der User kann jederzeit aussteigen und später über
`/firmo review <plandatei>` an derselben Plan-Datei weiterarbeiten.

Begründung der Workflow-Empfehlung: Es entsteht neues Verhalten in den
Firmo-Orchestratoren `plan` und `review` sowie eine interne wiederverwendbare
Plan-Review-Anweisung. Das ist neue Funktionalität und damit ein Feature.

## Architekturentscheidungen

- **Interne Plan-Review-Anweisung statt neuem Top-Level-Tool:** Die neue Logik
  wird als internes `src/tools/plan-review.md` umgesetzt und nicht in
  `EXPOSED_TOOLS` aufgenommen. Begründung: Der Router soll laut bestehender
  Architektur schlank bleiben; interne Tools wie `apply-plan` zeigen bereits,
  dass nicht jede wiederverwendbare Anweisung als sichtbares `/firmo <tool>`
  erscheinen muss.
- **Zwei Einstiegspunkte, eine Quelle der Wahrheit:** `src/tools/plan.md` startet
  den Plan-Review optional am Ende der Planung; `src/tools/review.md` erkennt
  Plan-Dateien unter `docs/plan/` früh und lädt dieselbe interne Anweisung. So
  gibt es keine doppelte Review-Methodik.
- **`/firmo review <plandatei>` ist Plan-Review, kein Code-Review:** Wenn das
  Argument eindeutig eine Plan-Datei ist, verzweigt `review` vor seiner normalen
  Scope-Bestimmung und vor Code-Review-spezifischer Config-, Cache-, Tracker-
  oder Wisdom-Initialisierung in den Plan-Review-Modus. Alle anderen Argumente
  behalten den bisherigen Code-Review-Fluss.
- **Plan-Datei ist persistenter Zustand:** Offene Punkte, Entscheidungen,
  Review-Status und Wiedereinstiegsposition werden ausschließlich in der
  Plan-Datei dokumentiert. Es wird kein zusätzlicher Runtime-State unter
  `.firmo/` benötigt.
- **Dedizierter Abschnitt für offene Punkte:** Neue und nachbearbeitete Pläne
  erhalten am Ende einen sprach passenden Abschnitt mit offenen Entscheidungen:
  deutsch `## Offene Punkte`, englisch `## Open Points`. Sobald eine
  Entscheidung getroffen und in den Plan eingearbeitet ist, wird der Punkt aus
  dieser Liste entfernt.
- **Kein automatisches Raten bei blockierenden Unklarheiten:** Der Review darf
  nicht durch Annahmen „grün“ werden, wenn eine Entscheidung die Umsetzung
  wesentlich beeinflusst. Solche Punkte bleiben offen oder werden mit dem User
  entschieden.
- **Weiterhin reine Planungsgrenze:** Plan-Review darf nur Plan-Dateien unter
  `docs/plan/` ändern. Keine Implementierungsdateien, kein Build-Output, keine
  Tests, keine Commits.

## Betroffene Dateien

| Datei                                                 | Beschreibung                                                                                                                                                                                                          |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/plan-review.md`                            | Neue interne Anweisung für vertieften, interaktiven Plan-Review mit Klärungsloop, Optionsformat, Entscheidungseinbau und sprachsensitiver Pflege von `## Offene Punkte` bzw. `## Open Points`.                        |
| `src/tools/plan.md`                                   | Am Ende der Planung optionalen Einstieg in den vertieften Plan-Review ergänzen; Plan-Template um sprach passende offene Punkte erweitern; Abschlussmeldung auf Review-Status hinweisen.                               |
| `src/tools/review.md`                                 | Frontmatter-Beschreibung und frühe Plan-Datei-Erkennung ergänzen; bei Plan-Argument nicht den Code-Review-Workflow starten, sondern vor Code-Review-Config/Wisdom `tools/plan-review.md` laden und ausführen.         |
| `src/shared/plan-reference-routing.md`                | Routing-Regel für Plan-Dateien um Prüfung von `## Offene Punkte` und `## Open Points` erweitern: Bei offenen Punkten warnen und bewusste User-Bestätigung verlangen, bevor ein Umsetzungs-Workflow fortfährt.         |
| `src/shared/apply-source-detection.md`                | Optional prüfen, ob die bestehende Plan-Referenz-Klassifikation sinnvoll referenziert werden kann; nur ändern, wenn die Umsetzung dadurch Duplikation vermeidet.                                                      |
| `build.mjs`                                           | Voraussichtlich keine Änderung: interne Tool-Dateien werden bereits gebaut, aber nicht im Router-Katalog exponiert. Nur ändern, falls ein Guard für interne `{{SKILL:plan-review}}`-Referenzen angepasst werden muss. |
| `docs/plan/0066-interaktive-plan-review-iteration.md` | Plan und Audit-Trail dieser Änderung.                                                                                                                                                                                 |

## Implementierungsdetails

### Vorgehen

1. `src/tools/plan-review.md` als interne Tool-Anweisung anlegen.
   - Frontmatter mit strikt gequoteter `description`.
   - `language-rules`, `task-tracking`, `plan-status` und bei Bedarf
     `plan-reference-routing` einbinden.
   - Klare Schreibgrenze: ausschließlich die referenzierte Plan-Datei unter
     `docs/plan/` darf geändert werden.
2. In `src/tools/plan.md` nach dem bestehenden `Phase 6: Plan-Review` ein
   optionales Gate ergänzen:
   - Wenn der initiale Plan keine kritischen Befunde mehr hat, frage:
     „Vertieften interaktiven Plan-Review jetzt starten?“
   - Optionen: „Ja, jetzt prüfen“ und „Nein, später“.
   - Bei „Ja“: `tools/plan-review.md` mit der gerade erzeugten Plan-Datei als
     Kontext laden.
   - Bei „Nein“: Plan unverändert offen lassen und in der Abschlussmeldung den
     Wiedereinstieg über `/firmo review <plandatei>` nennen.
3. Das Plan-Template in `src/tools/plan.md` um einen eigenständigen Abschnitt
   für offene Punkte erweitern.
   - Deutschsprachige Pläne nutzen `## Offene Punkte` mit
     `- Keine offenen Punkte.`
   - Englischsprachige Pläne nutzen `## Open Points` mit `- No open points.`
   - Offene Punkte müssen entscheidungsorientiert formuliert sein und eine
     Wiedereinstiegsnotiz enthalten, wenn der User „Später entscheiden“ gewählt
     hat.
4. In `src/tools/review.md` Phase 1 erweitern:
   - Argument als ersten Workflow-Schritt syntaktisch prüfen, bevor
     Code-Review-spezifische Config-Migration, Tracker-Modus, Wisdom-Datei,
     Memory-Datei oder Cache-Datei initialisiert werden.
   - Wenn es eindeutig auf eine Datei unter `docs/plan/` zeigt, wird der
     normale Code-Review-Scope übersprungen.
   - Dann `tools/plan-review.md` laden und ausführen.
   - Wenn das Argument nicht eindeutig ist, bleibt der bestehende
     Code-Review-Workflow erhalten und fragt wie bisher nach dem Scope, sofern
     nötig.
   - Die `description` von `src/tools/review.md` wird so erweitert, dass der
     Router-Katalog den Plan-Datei-Sonderfall sichtbar macht.
5. Die interne Plan-Review-Anweisung definiert den Review-Loop:
   - Plan frisch lesen und Status, Workflow-Empfehlung, Akzeptanzkriterien,
     Validierungsplan, Annahmen, Plan-Review und `## Offene Punkte`
     auswerten.
   - Prüfen auf Logikfehler, unklare Begriffe, fehlende Entscheidungen,
     Datensicherheits-/Datenschutzlücken, Security-Risiken, Race Conditions,
     Recovery, UI-/UX-Unklarheiten, Barrierefreiheit, Testbarkeit,
     Umsetzbarkeit, Scope Creep und Wartbarkeit.
   - Befunde in entscheidungsbedürftige Punkte und direkt behebbare Planlücken
     trennen.
   - Direkt behebbare Planlücken ohne fachliche Entscheidung in den Plan
     einarbeiten.
   - Entscheidungsbedürftige Punkte einzeln mit dem User klären.
6. Für jede interaktive Klärung gilt das kanonische Optionsformat:
   - Wenn möglich genau drei fachliche Optionen.
   - Jede Option enthält kurze Beschreibung, Vorteile, Nachteile und
     Empfehlungshinweis.
   - Zusätzlich immer eine vierte Option „Später entscheiden“.
   - Die Empfehlung muss begründet sein und darf die anderen Optionen nicht
     verstecken.
   - Wenn ein Harness-Ask-Format nicht mehr als drei Auswahloptionen darstellen
     kann, müssen die drei fachlichen Optionen im Fragetext stehen und
     „Später entscheiden“ als explizite Auswahl- oder Freitextantwort zulässig
     sein. Der User darf dadurch nicht gezwungen werden, sofort fachlich zu
     entscheiden.
7. Nach jeder User-Entscheidung wird die Plan-Datei sofort aktualisiert:
   - Entscheidung in den passenden Abschnitt einarbeiten, zum Beispiel
     Architekturentscheidungen, Implementierungsdetails, Edge Cases,
     Akzeptanzkriterien oder Validierungsplan.
   - Den zugehörigen Eintrag aus `## Offene Punkte` bzw. `## Open Points`
     entfernen.
   - Bei „Später entscheiden“ den Punkt in `## Offene Punkte` bzw.
     `## Open Points` aufnehmen oder aktualisieren.
   - `## Plan-Review` mit aktuellem Ergebnis, Zusammenfassung und Befunden
     aktualisieren.
8. Der Loop endet, wenn einer dieser Zustände erreicht ist:
   - keine kritischen Befunde und keine umsetzungsblockierenden offenen Punkte
     mehr vorhanden sind,
   - der User den Loop beendet,
   - die nächste Entscheidung externe Recherche, Produktabstimmung oder andere
     nicht verfügbare Information braucht.
9. Die gemeinsame Plan-Referenz-Regel ergänzen, damit `build`, `fix`,
   `refactor`, `docs` und `apply-plan` konsistent reagieren, wenn eine
   referenzierte Plan-Datei noch offene Punkte enthält:
   - Offene Punkte aus `## Offene Punkte` bzw. `## Open Points` kurz anzeigen.
   - Warnen, dass der Plan noch nicht vollständig entschieden ist.
   - User-Bestätigung einholen, bevor der Ziel-Workflow fortfährt.
   - Ohne Bestätigung abbrechen und auf
     `/firmo review <plandatei>` als Klärungsweg verweisen.
10. Build und Formatierung prüfen.

### Komponenten-Struktur

Nicht relevant für ein UI-Komponentensystem; betroffen sind textbasierte
Orchestrator-Anweisungen und Build-Transformationen.

### State-Management

Persistenter Zustand liegt in der Plan-Datei:

- `## Offene Punkte` enthält in deutschsprachigen Plänen aktuell offene, noch
  nicht entschiedene Punkte.
- `## Open Points` ist das englische Gegenstück für englischsprachige Pläne.
- `## Plan-Review` enthält den letzten Review-Status, die Befundzusammenfassung
  und Hinweise auf eingearbeitete oder bewusst offene Befunde.
- Entscheidungen werden nicht zusätzlich als separate Datenstruktur gespeichert,
  sondern in die semantisch passenden Planabschnitte eingearbeitet.

Temporäre Laufzeitdaten dürfen während eines Review-Laufs im Gesprächskontext
oder in Aufgabenverfolgung existieren, werden aber nicht in `.firmo/` persistiert.

### API-Anbindung

Nicht relevant. Es werden keine neuen Netzwerk- oder Tracker-Zugriffe geplant.

### Styling-Ansatz

Nicht relevant. Die Änderung betrifft CLI-/Skill-Verhalten und Markdown-Pläne,
keine visuelle Oberfläche.

### Barrierefreiheit

Für die interaktiven Fragen müssen die Optionen textlich vollständig verständlich
sein. Die empfohlene Option darf nicht nur über Reihenfolge oder Hervorhebung
erkennbar sein, sondern muss im Text als Empfehlung begründet werden.

### Edge Cases

- **Bestehender Plan ohne Abschnitt für offene Punkte:** Am Ende je nach
  Plansprache `## Offene Punkte` oder `## Open Points` hinzufügen.
- **Bestehender Plan mit kombiniertem Abschnitt `## Annahmen und offene Punkte`:**
  Annahmen dort oder in `## Annahmen` belassen; entscheidungsbedürftige offene
  Punkte in den neuen Abschnitt `## Offene Punkte` überführen.
- **Englischer Plan mit kombiniertem Abschnitt
  `## Assumptions and open points`:** Annahmen dort oder in `## Assumptions`
  belassen; entscheidungsbedürftige offene Punkte in `## Open Points`
  überführen.
- **Planstatus bereits umgesetzt:** `review <plandatei>` fragt, ob der Plan nur
  nachträglich geprüft oder für eine Folgeänderung wieder geöffnet werden soll;
  ohne Zustimmung wird der Status nicht verändert.
- **Plan-Datei nicht eindeutig auflösbar:** keine Heuristik für „neuester Plan“;
  User nach konkreter Datei fragen oder auf `/firmo open-plans` verweisen.
- **User wählt wiederholt „Später entscheiden“:** Punkte bleiben in
  `## Offene Punkte`; der Loop darf sauber beendet werden und meldet, dass der
  Plan noch nicht vollständig entscheidungsreif ist.
- **Mehr als drei sinnvolle Lösungsoptionen:** auf die drei tragfähigsten
  Optionen reduzieren und bei Bedarf erwähnen, warum Alternativen verworfen
  wurden.
- **Weniger als drei sinnvolle Lösungsoptionen:** keine künstlichen Optionen
  erfinden; vorhandene Optionen mit Vor-/Nachteilen darstellen und trotzdem
  „Später entscheiden“ anbieten.
- **Direkt behebbare Inkonsistenz ohne Produktentscheidung:** Plan korrigieren
  und im `## Plan-Review` als eingearbeitet dokumentieren, ohne den User unnötig
  zu befragen.
- **Abbruch oder Unterbrechung während des Loops:** zuletzt bearbeiteter Stand
  bleibt in der Plan-Datei; offene Punkte enthalten die noch ausstehenden
  Entscheidungen.
- **Konflikt mit normalem Code-Review-Scope:** `review` behandelt eine eindeutige
  Plan-Datei immer als Plan-Review. Wer die Plan-Datei selbst als Markdown-Code
  reviewen will, muss einen expliziten Code-Review-Scope formulieren.
- **Projekt mit ungültiger `.firmo/config.json`:** Der Plan-Review-Zweig in
  `review <plandatei>` darf nicht durch Code-Review-Config-Migration blockiert
  werden, weil der Plan-Review seine eigene, dateibasierte Schreibgrenze hat.
  Code-Review-Config wird nur im normalen Code-Review-Zweig geladen.
- **Plan mit offenen Punkten wird zur Umsetzung referenziert:** Die gemeinsame
  Plan-Referenz-Regel warnt, zeigt die offenen Punkte an und verlangt bewusste
  User-Bestätigung. Ohne Bestätigung wird nicht umgesetzt; der User wird auf
  `/firmo review <plandatei>` verwiesen.

## Akzeptanzkriterien

- [x] `src/tools/plan-review.md` existiert als interne Tool-Anweisung, wird von
      `node build.mjs` gebaut, aber nicht im Router-Katalog unter `/firmo`
      angezeigt.
- [x] `src/tools/plan.md` fragt am Ende einer erfolgreichen Planung, ob ein
      vertiefter interaktiver Plan-Review jetzt gestartet werden soll, und nennt
      bei Ablehnung den Wiedereinstieg über `/firmo review <plandatei>`.
- [x] `src/tools/review.md` beschreibt im Frontmatter den Plan-Datei-Sonderfall,
      erkennt eindeutige Plan-Datei-Argumente unter `docs/plan/` vor dem
      normalen Code-Review-Scope und vor Code-Review-Config/Wisdom und lädt
      dafür `tools/plan-review.md`.
- [x] Der Plan-Review prüft mindestens Logik, Datensicherheit, Datenschutz,
      Security, Umsetzbarkeit, UI/UX, Fehlerfälle, Testbarkeit, Scope und
      Wartbarkeit.
- [x] Jeder entscheidungsbedürftige Punkt wird einzeln geklärt; wenn fachlich
      möglich, mit drei Optionen inklusive Vor-/Nachteilen und begründeter
      Empfehlung.
- [x] Jede Klärungsfrage bietet immer die Option „Später entscheiden“.
- [x] Die Umsetzung bleibt harness-kompatibel, auch wenn ein Ask-Renderer nur
      drei Auswahloptionen unterstützt: Drei fachliche Optionen plus „Später
      entscheiden“ müssen für den User trotzdem eindeutig auswählbar sein.
- [x] Getroffene Entscheidungen werden in die passenden Planabschnitte
      eingearbeitet und aus `## Offene Punkte` entfernt.
- [x] Nicht entschiedene Punkte werden in `## Offene Punkte` am Ende der
      Plan-Datei oder bei englischen Plänen in `## Open Points` aufgenommen oder
      aktualisiert.
- [x] Der Umgang der Umsetzungs-Workflows mit referenzierten Plänen, die noch
      `## Offene Punkte` oder `## Open Points` enthalten, ist in
      `src/shared/plan-reference-routing.md` als Warnung mit bewusster
      User-Bestätigung geregelt; ohne Bestätigung bricht der Workflow ab.
- [x] Der Review-Loop kann sauber enden, wenn keine kritischen Befunde und keine
      umsetzungsblockierenden offenen Punkte mehr vorhanden sind, und kann
      später über `/firmo review <plandatei>` auf derselben Datei fortgesetzt
      werden.
- [x] `node build.mjs` läuft erfolgreich; `pnpm agent:check` meldet keine
      Formatierungsfehler.

## Validierungsplan

- `node build.mjs` ausführen und prüfen, dass `dist/claude/firmo/tools/plan-review.md`
  sowie `dist/codex/firmo/tools/plan-review.md` existieren.
- Generierten Router in `dist/claude/firmo/SKILL.md` und
  `dist/codex/firmo/SKILL.md` prüfen: `plan-review` darf nicht im Tool-Katalog
  erscheinen.
- Generierte `plan`- und `review`-Tool-Dateien prüfen: Referenzen auf
  `tools/plan-review.md` müssen aufgelöst sein und keine `{{SKILL:…}}`-
  Platzhalter zurücklassen.
- Mit einer absichtlich ungültigen `.firmo/config.json` in einer temporären
  Kopie prüfen, dass `review docs/plan/0066-interaktive-plan-review-iteration.md`
  den Plan-Review-Zweig beschreiben würde, ohne die Code-Review-Config zu
  migrieren oder daran zu scheitern.
- `pnpm agent:check` ausführen.
- Manueller Trockenlauf anhand einer vorhandenen offenen Plan-Datei:
  `review <plandatei>` muss in den Plan-Review-Modus gehen, offene Punkte
  aktualisieren und keine Implementierungsdateien ändern.

## Annahmen

- Der Build unterstützt interne Tool-Dateien bereits: Alle Markdown-Dateien unter
  `src/tools/` werden gebaut; nur `EXPOSED_TOOLS` bestimmt den sichtbaren
  Router-Katalog.
- Eine Referenz `{{SKILL:plan-review}}` rendert für ein nicht exponiertes Tool als
  Dateipfad `tools/plan-review.md`, analog zu bestehenden internen Tools.
- Der bestehende `review`-Workflow kann sicher vor der Code-Review-spezifischen
  Initialisierung verzweigen, ohne das Verhalten normaler Code-Reviews zu
  ändern.
- Die Plan-Datei genügt als persistenter Zustand für Wiedereinstieg und offene
  Punkte; zusätzliche `.firmo/`-Daten würden mehr Kopplung erzeugen als Nutzen.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       2 |
| Security    |        0 |       0 |       0 |
| Datenschutz |        0 |       0 |       1 |
| Fehlerfälle |        0 |       0 |       3 |
| Testbarkeit |        0 |       0 |       1 |
| Scope       |        0 |       0 |       1 |
| Wartbarkeit |        0 |       0 |       2 |

### Befunde

- **Architektur (Hinweis):** Ein neues sichtbares Tool wäre einfacher zu
  entdecken, würde aber die bewusst reduzierte Router-Oberfläche erweitern.
  Eingearbeitet: Die Funktion wird intern umgesetzt und über bestehende
  Einstiegspunkte `plan` und `review <plandatei>` erreichbar.
- **Datenschutz (Hinweis):** Der Review kann Datensicherheits- und
  Datenschutzfragen im Plan dokumentieren. Es werden keine neuen externen
  Speicherorte eingeführt; persistiert wird nur in der Plan-Datei.
- **Fehlerfälle (Hinweis):** Unterbrechungen während des interaktiven Loops
  könnten sonst Kontext verlieren. Eingearbeitet: Offene Punkte und
  Review-Status werden nach jeder Entscheidung in der Plan-Datei aktualisiert.
- **Scope (Hinweis):** Der Wunsch „bis der Plan logikfehlerfrei ist“ kann nicht
  als absolute Garantie umgesetzt werden. Eingearbeitet: Abschlussbedingung ist
  operationalisiert als keine kritischen Befunde und keine
  umsetzungsblockierenden offenen Punkte im geprüften Plan.
- **Wartbarkeit (Hinweis):** `plan` und `review` dürfen keine getrennten
  Plan-Review-Regeln entwickeln. Eingearbeitet: beide laden dieselbe interne
  Anweisung.
- **Architektur (Hinweis):** `review` initialisiert heute Code-Review-Config,
  Tracker, Memory, Cache und Wisdom in Phase 1. Eingearbeitet: Der Plan-Datei-
  Sonderfall muss vor dieser Initialisierung abzweigen, damit ein Plan-Review
  nicht an Code-Review-spezifischem Zustand hängt.
- **Fehlerfälle (Hinweis):** Eine ungültige `.firmo/config.json` könnte sonst
  einen Plan-Review über `/firmo review <plandatei>` blockieren. Eingearbeitet:
  Der Plan-Review-Zweig lädt Code-Review-Config nicht.
- **Testbarkeit (Hinweis):** Die bisherige Validierung prüfte nicht, ob
  Ask-Renderer mit nur drei Auswahloptionen den Pflichtausstieg „Später
  entscheiden“ darstellen können. Eingearbeitet: Harness-kompatible
  Fallback-Regel und Akzeptanzkriterium ergänzt.
- **Fehlerfälle (Hinweis):** Ein User kann eine Plan-Datei mit offenen Punkten
  direkt an `build`, `fix`, `refactor`, `docs` oder `apply-plan` übergeben.
  Eingearbeitet: Die gemeinsame Plan-Referenz-Regel warnt, zeigt die offenen
  Punkte an und verlangt bewusste Bestätigung; ohne Bestätigung wird auf
  `/firmo review <plandatei>` verwiesen.
- **Wartbarkeit/i18n (Hinweis):** Der Begriff `## Offene Punkte` war zunächst
  fest auf Deutsch formuliert. Eingearbeitet: englischsprachige Pläne nutzen
  `## Open Points` mit `- No open points.`, Routing und Plan-Review erkennen
  beide Abschnittsnamen.

## Offene Punkte

- Keine offenen Punkte.

## Testergebnisse

**Datum:** 2026-07-08
**Umsetzung via:** `/firmo apply docs/plan/0066-interaktive-plan-review-iteration.md`

- `node build.mjs`: erfolgreich. Der Build erzeugt weiterhin 15 exponierte Tools
  und nun 6 interne Tools; `plan-review` wird für Claude Code und Codex als
  internes Tool gebaut.
- Existenz geprüft: `dist/claude/firmo/tools/plan-review.md` und
  `dist/codex/firmo/tools/plan-review.md` sind vorhanden.
- Router geprüft: `plan-review` erscheint nicht als `/firmo plan-review` im
  generierten Router-Katalog.
- Referenzprüfung im generierten Output: `plan` und `review` verweisen auf
  `tools/plan-review.md`.
- Bilinguale Offene-Punkte-Regel geprüft: Source und generierter Output erkennen
  `## Offene Punkte` / `- Keine offenen Punkte.` sowie `## Open Points` /
  `- No open points.`.
- `pnpm agent:check`: erfolgreich, alle 135 gematchten Dateien korrekt
  formatiert.
- `pnpm test`: erfolgreich, 28 Node-Tests bestanden.

## Review-Findings

**Datum:** 2026-07-08
**Reviewer:** keiner

### Zusammenfassung

| Status                  | Anzahl |
| ----------------------- | -----: |
| Behoben                 |      2 |
| Offen / Nicht umgesetzt |      0 |

Review während der Umsetzung ohne externen Reviewer-Subagenten durchgeführt, da
die Änderung ausschließlich Workflow-Markdown und Build-Transformation betrifft.
Zwei Hinweise wurden gefunden und behoben:

- Das neue `## Offene Punkte`-Template in `src/tools/plan.md` kombinierte
  zunächst `- Keine offenen Punkte.` mit einem Platzhalter in derselben Zeile,
  während die Routing-Regel genau diese Zeile als maschinell eindeutigen
  Leerzustand erwartet. Das Template wurde auf exakt `- Keine offenen Punkte.`
  korrigiert.
- Der Abschnitt für offene Punkte war zunächst fest deutsch formuliert. Das wurde
  sprachsensitiv korrigiert: deutsche Pläne verwenden `## Offene Punkte` /
  `- Keine offenen Punkte.`, englische Pläne `## Open Points` /
  `- No open points.`; Routing und Plan-Review erkennen beide Varianten.

Keine offenen Findings, kein externer Review-Report.
