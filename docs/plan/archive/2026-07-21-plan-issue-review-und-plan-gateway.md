# Plan-Issue-Review und Plan-Gateway angleichen

**Planungsstatus:** Umgesetzt
**Quelle:** $effective-flow plan
**Empfohlener Workflow:** Feature (`$effective-flow build`)

## Anforderung

Die beiden Planungseinstiege sollen sich aus Nutzersicht konsistent verhalten:

- Nach der interaktiven Planung eines Issues über `$effective-flow plan-issue` wird – wie nach
  einer lokalen Planung über `$effective-flow plan` – ein vertiefter interaktiver Plan-Review
  angeboten.
- `$effective-flow plan` wird zum Planungsgateway für explizite Issue-Referenzen. Erkennt es ein
  Issue, übergibt es die unveränderte Referenz an `$effective-flow plan-issue`, statt eine lokale
  Plan-Datei anzulegen.

Die Änderung ist ein Feature, weil sie das sichtbare Routing- und Interaktionsverhalten zweier
Tools erweitert. Die Issue-Planung bleibt kommentarzentriert: Das Issue und sein kanonischer
Planungskommentar sind weiterhin die einzige Quelle; es entsteht keine zusätzliche Datei unter
`<plan.dir>/`.

Planungsgrundlage ist der Repository-Stand `1cdd053` vom 21.07.2026. Der Arbeitsbaum enthält
bereits fremde Änderungen an `.gitignore`, `AGENTS.md`, der Projektsetup-ADR und anderen offenen
Plänen; die hier betroffenen Tool- und Testdateien waren bei der Analyse unverändert. Vor der
Umsetzung sind die genannten Quellstellen erneut zu lesen, falls sie sich inzwischen geändert
haben.

## Architekturentscheidungen

- **`plan` erkennt nur die Quelle, `plan-issue` besitzt den Trackerzustand.** `plan` nutzt die
  syntaktische Stufe A der bestehenden `apply-source-detection` und delegiert eine eindeutige
  Issue-Referenz mit dem Originalargument. Ob bereits ein kanonischer Planungskommentar existiert,
  prüft weiterhin ausschließlich `plan-issue` beim frischen Lesen von Body, Labels und Kommentaren.
  Dadurch gibt es keinen doppelten Tracker-Zugriff und keine zweite Definition von „bereits
  geplant“. Diese Variante wurde im vertieften Plan-Review ausdrücklich bestätigt.
- **Die Gateway-Erkennung folgt auf die read-only Konfigurationsauflösung.** Stage A benötigt
  `<plan.dir>`, um Planreferenzen und insbesondere die vierstellige Legacy-Präzedenz korrekt zu
  bestimmen. `plan` liest deshalb zuerst die Projektsetup-ADR und ermittelt `plan.dir`, lädt danach
  bei vorhandenem Argument die Source-Detection und verzweigt noch vor Planinventur,
  Planmigration, Rückfragen oder lokaler Artefakterstellung.
- **Die Schreibgrenze unterscheidet Router und delegierten Zielworkflow.** `plan` selbst schreibt
  im Gateway-Pfad weder lokal noch remote. Nach der Delegation gelten ausschließlich die strengere
  Issue-Kommentar-Grenze und die Trackeroperationen von `plan-issue`; der lokale Planpfad behält
  seine bisherige Beschränkung auf `<plan.dir>`. Die Toolanweisung benennt diese Übergabe
  ausdrücklich, damit ihre bisherige globale No-Remote-Write-Aussage nicht dem Gateway
  widerspricht.
- **Die bestehende Issue-Syntax und Präzedenz bleiben verbindlich.** `#123`, normale Issue-Nummern
  und Issue-URLs werden wie in der gemeinsamen Source-Detection erkannt. Eine nackte vierstellige
  Zahl bleibt wegen der Legacy-Planauflösung eine Planreferenz; ein vierstelliges Issue muss als
  `#1234` oder URL übergeben werden. Freier Anforderungstext bleibt im bisherigen lokalen
  `plan`-Workflow.
- **Eine vertiefte Review-Methodik, zwei Artefaktadapter.** Die interne Anweisung
  `src/tools/plan-review.md` wird von „Plan-Datei“ auf ein Planungsartefakt mit zwei klaren Modi
  verallgemeinert: lokale Plan-Datei oder kanonischer Issue-Planungskommentar. Der Review-Kern für
  Befunde, Entscheidungen, offene Punkte und Abschluss bleibt gemeinsam; nur Laden, Schreiben und
  Wiedereinstieg unterscheiden sich. Es entsteht kein zweiter Review-Workflow in
  `plan-issue.md` und kein neues öffentliches Tool.
- **Issue-Planungen erhalten vollständige Baseline-Parität.** Nach der interaktiven Klärung führt
  `plan-issue` – wie `plan` in seinen Phasen 4 bis 6 – automatisch Gap-Analyse, Planvalidierung und
  internen Plan-Review über `codebase-improvement` aus. Der kanonische Planungskommentar enthält
  deshalb bereits vor der optionalen Vertiefung Review-Ergebnis, Befundzusammenfassung und offene
  Punkte. Erst wenn keine kritischen Befunde mehr bestehen, wird der tiefe interaktive Review
  angeboten. Diese vollständige Parität wurde im vertieften Plan-Review ausdrücklich gewählt.
- **Issue-Review bleibt Eigentum von `plan-issue`.** Der interne Review erhält im Issue-Modus die
  bereits aufgelöste Issue-Referenz, den frisch gelesenen Planungskommentar und den von
  `plan-issue` ermittelten Trackeradapter. Ein späterer Wiedereinstieg erfolgt über
  `$effective-flow plan-issue <issue>`, nicht über eine Erweiterung des öffentlichen
  `$effective-flow review`-Gateways. Dessen bestehender Plan-Datei-Sonderfall bleibt unverändert.
- **Freigabelabel folgt der tatsächlichen Planungsreife.** `effective-flow-needs-planning` wird
  erst entfernt, wenn Klärung und automatische Qualitätsbaseline abgeschlossen und ein optional
  gestarteter tiefer Review ohne umsetzungsblockierende offene Punkte beendet wurde. Wird der tiefe
  Review übersprungen, reicht die bereits intern freigegebene Baseline. Endet eine Baseline- oder
  Review-Klärung mit offenen blockierenden Punkten, bleibt das Label gesetzt und der Kommentar
  dokumentiert den Wiedereinstieg.
- **Mehrere Issues werden artefaktweise abgeschlossen.** Für jedes Issue laufen Klärung,
  Qualitätsbaseline, Review-Angebot, Kommentaraktualisierung und Labelentscheidung vollständig
  durch, bevor das nächste beginnt. Diese Variante wurde im vertieften Plan-Review bestätigt. Ein
  abgebrochenes oder weiterhin blockiertes Issue behält sein Needs-Planning-Label, verhindert aber
  nicht die Bearbeitung der übrigen ausgewählten Issues.
- **Planungskommentare bleiben idempotent und maschinenlesbar.** Der vorhandene Kommentar mit
  `<!-- effective-flow-plan-issues -->` wird aktualisiert, nicht dupliziert. Für den Review ergänzt
  er sprachkonsistent einen Review-Abschnitt und einen Abschnitt für offene Punkte; der leere
  Zustand ist eindeutig. Der gemeinsame Tracker-Baustein erhält dafür eine konkrete Operation zum
  Aktualisieren eines Kommentars über dessen ID; die Umsetzung prüft die aktuelle `gh`-/`tea`- bzw.
  API-Syntax gegen die installierte CLI-Version. `apply-issues` darf einen solchen Kommentar nur
  dann als ausreichende Grundlage behandeln, wenn keine umsetzungsblockierenden offenen Punkte
  dokumentiert sind.
- **Verhaltensverträge werden gezielt getestet.** Kleine Node-Tests prüfen die stabilen
  Routing- und Handoff-Invarianten in den Toolquellen. Sie testen Marker, Toolreferenzen,
  Artefaktmodi und Label-/Open-Point-Regeln statt vollständiger Prosa-Snapshots.

## Betroffene Dateien

| Datei                                                                                  | Geplante Änderung                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/plan.md`                                                                    | Frontmatter, Zielbeschreibung und Schreibgrenze auf die Gateway-Rolle ausrichten; nach read-only Auflösung von `plan.dir` eindeutige Issue-Referenzen erkennen, Source-Detection bei Bedarf lazy laden, an `plan-issue` delegieren und den lokalen Planlauf danach beenden.                                                  |
| `src/shared/apply-source-detection.md`                                                 | Den bestehenden Stage-A-Vertrag um `plan` als Consumer dokumentieren, ohne Typen, Präzedenz oder Apply-Routing umzubauen.                                                                                                                                                                                                    |
| `src/shared/plan-input-gateway.md`                                                     | Den argumentabhängigen Gateway-Vertrag lazy ausliefern und darin die Source-Detection eager auflösen, damit `plan` sein Kontextbudget einhält und beide Harnesses Stage A vollständig erhalten.                                                                                                                              |
| `src/tools/plan-issue.md`                                                              | `codebase-improvement` und die zentrale Planqualitätsdelegation ergänzen; pro Issue Baseline-Gap-Analyse, Validierung und internen Review durchführen, danach den tiefen Review anbieten, die interne `plan-review`-Anweisung im Issue-Modus aufrufen und Wiedereinstieg sowie Label-Freigabe an den Review-Ausgang koppeln. |
| `src/tools/plan-review.md`                                                             | Den Review-Kern auf lokale Plan-Dateien und delegierte Issue-Planungskommentare ausrichten; artefaktspezifisches Laden, Schreiben, Open-Point-Pflege und Wiedereinstieg definieren.                                                                                                                                          |
| `src/shared/issue-tracker.md`                                                          | Eine idempotente Operation „Kommentar per ID aktualisieren“ für GitHub und Forgejo ergänzen, damit Review-Entscheidungen denselben Planungskommentar fortschreiben.                                                                                                                                                          |
| `src/scripts/remote-tracker-core.mjs`                                                  | Die inzwischen zentralisierte Trackermechanik um die ausführbare Operation `issue-comment-update` mit Provider-Probe, Dry-run, Fresh-read-Guard und normalisierter Rückgabe erweitern.                                                                                                                                       |
| `src/tools/apply-issues.md`                                                            | Einen Planungskommentar mit umsetzungsblockierenden offenen Punkten nicht mehr pauschal als ausreichende Grundlage werten.                                                                                                                                                                                                   |
| `test/workflow-contracts.test.mjs`                                                     | Neue fokussierte Vertragstests für Gateway, Review-Angebot, Artefaktadapter, Idempotenz und Readiness-Regel ergänzen.                                                                                                                                                                                                        |
| `test/remote-tracker.test.mjs`                                                         | GitHub-/Forgejo-Kommandos sowie Validierung, Dry-run, Fresh-/Stale-/Missing-/Unsupported- und Idempotenzpfade der Kommentaraktualisierung prüfen.                                                                                                                                                                            |
| `docs/developer-guide/skill-ownership.json`, `docs/developer-guide/skill-ownership.md` | `plan-issue` als Consumer des zentralen `codebase-improvement`-Vertrags maschinenlesbar und dokumentarisch ergänzen.                                                                                                                                                                                                         |
| `docs/user-guide/tools-understand.md`                                                  | `plan` als Issue-Gateway sowie Review-Angebot und Wiedereinstieg von `plan-issue` dokumentieren.                                                                                                                                                                                                                             |

`dist/` bleibt generierter und gitignorierter Build-Output und wird nicht direkt bearbeitet.
`src/tools/review.md`, Routerkatalog und öffentliche Toolliste bleiben außerhalb des Scopes, weil
kein neuer öffentlicher Einstieg entsteht und der bestehende Review-Aufruf weiterhin nur lokale
Plan-Dateien als Sonderfall behandelt.

## Implementierungsdetails

### 1. `plan` vor der lokalen Planung routen lassen

1. In einem frühen Gateway-Schritt zuerst die Projektsetup-ADR read-only auflösen und `plan.dir`
   bestimmen. Nur bei einem vorhandenen Argument anschließend die gemeinsame Source-Detection
   laden und Stufe A ausführen; dies geschieht vor Planinventur, Legacy-Migration, Rückfragen und
   lokaler Artefakterstellung.
2. Bei `issue-reference` das Originalargument unverändert an `$effective-flow plan-issue`
   übergeben und den lokalen `plan`-Workflow beenden. Weder `<plan.dir>` noch Trackerzustand werden
   vorher verändert.
3. Die harte Schreibgrenze so formulieren, dass `plan` im Gateway-Pfad selbst keine Seiteneffekte
   ausführt und nach der Übergabe ausschließlich die Issue-Kommentar-Grenze von `plan-issue` gilt.
4. Bei natürlichem Anforderungstext und allen nicht eindeutig als Issue erkannten Eingaben den
   bisherigen Planungsablauf unverändert fortsetzen. Die bestehende Präzedenz für vierstellige
   Legacy-Planreferenzen bleibt erhalten.
5. In `apply-source-detection.md` den neuen Stage-A-Consumer und seine enge Verantwortung ergänzen;
   Stage B und die bestehende Apply-Zuständigkeitstabelle bleiben unverändert.

### 2. Issue-Planung als reviewfähiges Artefakt abschließen

1. `plan-issue` um `codebase-improvement` als empfohlenen Skill und dieselbe zentrale
   Planqualitätsdelegation wie `plan` ergänzen. Nach der normalen Klärung je Issue automatisch die
   Gap-Analyse, Planvalidierung und den internen Plan-Review ausführen; kritische und wichtige
   Befunde einarbeiten oder als blockierende offene Punkte dokumentieren.
2. Den kanonischen Planungskommentar so erweitern, dass bereits die Baseline-Prüfung und danach ein
   vertiefter Review ihren aktuellen Status, eingearbeitete Befunde und offene Punkte im selben
   markierten Kommentar persistieren können. Vorhandene ältere Kommentare ohne diese Abschnitte
   werden bei Bedarf ergänzt, nicht durch einen zweiten Kommentar ersetzt.
3. Beim frischen Lesen die ID des aktuellen oder als Backward-Compatibility erkannten
   Planungskommentars erfassen. `issue-tracker.md` um eine abstrakte Update-Operation ergänzen und
   diese auf den aktuellen GitHub-/Forgejo-Weg abbilden; kann der konkrete Host einen Kommentar
   nicht aktualisieren, vor dem Schreiben klar abbrechen statt einen konkurrierenden Kommentar
   anzulegen.
4. Die Baseline-Prüfung in die Effective-Flow-Form normalisieren: messbare Akzeptanzkriterien,
   nachvollziehbarer Validierungsplan, sprachpassender Abschnitt für offene Punkte und
   Review-Scorecard. Kritische Befunde und umsetzungsblockierende Punkte wie im lokalen `plan`-Review
   direkt einarbeiten oder mit dem User klären. Bleiben sie offen, das Issue nicht freigeben und
   den optionalen tiefen Review noch nicht anbieten; stattdessen den Wiedereinstieg über
   `plan-issue` dokumentieren.
5. Sobald die Baseline keine kritischen Befunde mehr enthält, für jedes Issue einzeln dieselbe
   Frage wie im lokalen Planlauf anbieten: vertieften interaktiven Plan-Review jetzt starten oder
   später fortsetzen.
6. Bei „Ja“ `tools/plan-review.md` mit genau einem Issue, dem aktuellen Planungskommentar und dem
   bereits ermittelten Trackeradapter im Issue-Modus ausführen. Bei „Nein“ die Planung regulär
   freigeben und `$effective-flow plan-issue <issue>` als späteren Wiedereinstieg nennen.
7. Bei mehreren ausgewählten Issues Baseline, Gate, Kommentar und Label je Artefakt vollständig
   abschließen, bevor das nächste beginnt. Eine Antwort darf nicht stillschweigend auf weitere
   Issues übertragen werden; ein blockiertes Issue wird sauber persistiert und die Verarbeitung
   mit dem nächsten fortgesetzt.
8. Erst nach dem Gate den Readiness-Zustand abschließen: ohne blockierende offene Punkte das
   Needs-Planning-Label einschließlich Legacy-Variante entfernen; andernfalls das Label belassen
   und die offene Entscheidung im Kommentar festhalten. `effective-flow-issue-done` bleibt
   unverändert der späteren Umsetzung vorbehalten.

### 3. Internen Plan-Review artefaktneutral machen

1. Eingabe und harte Schreibgrenze auf zwei explizite Modi erweitern:
   - **Dateimodus:** genau eine Plan-Datei unter `<plan.dir>`, bestehendes Verhalten unverändert.
   - **Issue-Modus:** nur als Delegation von `plan-issue`, genau ein kanonischer
     Planungskommentar; erlaubt ist ausschließlich dessen Aktualisierung und die zugehörige
     Readiness-Rückgabe an den Aufrufer.
2. Laden, Normalisieren und Persistieren über kleine Artefaktadapter beschreiben. Der gemeinsame
   Review-Kern bewertet weiterhin Logik, Sicherheit, Datenschutz, Fehlerfälle, Testbarkeit, Scope
   und Wartbarkeit über `codebase-improvement` und trennt direkt einarbeitbare von
   entscheidungsbedürftigen Befunden.
3. Offene Punkte und Review-Ergebnis an die jeweilige Markdown-Ebene anpassen, ohne inhaltlich zwei
   Schemata zu erfinden. Die vorhandene Sprache des Artefakts wird erhalten; deutsche und englische
   Leerzustände werden eindeutig erkannt.
4. Nach jeder Entscheidung genau das aktive Artefakt aktualisieren. Im Issue-Modus bleibt der
   Marker erhalten und das Update ersetzt den bestehenden Planungskommentar idempotent.
5. Den Abschluss artefaktspezifisch formulieren: Dateimodus nennt wie bisher
   `$effective-flow review <plan-file>`, Issue-Modus `$effective-flow plan-issue <issue>`.

### 4. Umsetzung vor offenen Issue-Punkten schützen

1. In `apply-issues` die vorhandene Aussage präzisieren, dass der neueste kanonische
   Planungskommentar grundsätzlich die autoritative Spezifikation ist, aber nicht automatisch
   ausreichend ist.
2. Ein nichtleerer Abschnitt für offene Punkte oder eine im Review als blockierend markierte
   Annahme führt im bestehenden Sufficiency-Check zu `insufficient`; das Issue bleibt bzw. wird
   erneut `effective-flow-needs-planning` zugeordnet.
3. Alte Planungskommentare ohne Review-/Open-Point-Abschnitt bleiben kompatibel und werden wie
   bisher anhand von Zielverhalten, messbaren Akzeptanzkriterien und Dateihinweisen bewertet.

### 5. Dokumentation und Verträge absichern

1. Die Toolreferenz beschreibt die beiden neuen Nutzerwege mit ausführbaren Beispielen:
   `$effective-flow plan #123` delegiert an `plan-issue`; ein übersprungener tiefer Review wird
   über `$effective-flow plan-issue #123` wieder aufgenommen.
2. Vertragstests lesen die Source-Markdown-Dateien und prüfen semantisch schmale Invarianten:
   - `plan` lädt die gemeinsame Detection und referenziert genau den zuständigen
     `plan-issue`-Handoff;
   - `plan-issue` enthält das Review-Gate, den internen `plan-review`-Handoff und den
     artefaktspezifischen Wiedereinstieg;
   - `plan-review` nennt beide Artefaktmodi und erlaubt im Issue-Modus keine lokale Plan-Datei;
   - `issue-tracker` bietet das gezielte Kommentar-Update an und `apply-issues` behandelt
     dokumentierte blockierende offene Punkte als unzureichend.
3. Keine vollständigen Markdown-Snapshots einführen. Formulierungsänderungen ohne
   Vertragswirkung sollen die Tests nicht brechen.

## Edge Cases

- **Bereits geplanter Issue-Aufruf über `plan`:** Das Gateway delegiert trotzdem an
  `plan-issue`; dort wird der neueste kanonische Kommentar als Updatebasis verwendet. Ohne neue
  Klärungsanforderung kann direkt der tiefe Review angeboten werden.
- **Issue ohne Needs-Planning-Label:** Eine explizite Referenz ist weiterhin zulässig. Das
  Vorhandensein des Labels ist nur für die Sammlung ohne Argument erforderlich, nicht für eine
  direkte Planung.
- **Vierstellige nackte Zahl:** Bleibt eine Legacy-Planreferenz. Für Issue `1234` sind `#1234`
  oder die URL die eindeutigen Eingaben.
- **Mehrere Issue-Referenzen:** `plan` reicht die Liste unverändert weiter; `plan-issue` plant und
  reviewt sie nacheinander. Jedes Issue erhält sein eigenes Review-Gate; ein blockiertes Issue
  behält sein Label, ohne die übrigen zu blockieren. Gemischte oder syntaktisch mehrdeutige
  Argumente werden nicht geraten.
- **Vorhandener alter Planungskommentar:** Der Marker mit altem `firmo-`-Präfix bleibt beim Lesen
  kompatibel; beim nächsten Write-back wird nur die aktuelle `effective-flow-`-Variante
  geschrieben. Es entsteht kein konkurrierender zweiter Plan.
- **Review wird abgebrochen oder „später entscheiden“ gewählt:** Der aktuelle Kommentar bleibt
  der Wiedereinstiegspunkt, offene Punkte sind sichtbar und das Needs-Planning-Label bleibt gesetzt.
- **Review wird abgelehnt:** Die automatisch geprüfte und intern freigegebene Baseline wird
  freigegeben; das Label wird entfernt und die Zusammenfassung nennt den späteren Aufruf.
- **Trackerzugriff fehlt:** `plan` nimmt vor der Delegation keine Seiteneffekte vor;
  `plan-issue` bricht wie bisher mit dem vorhandenen Hinweis zu `origin`, CLI oder Authentifizierung
  ab.
- **Direkter lokaler Planlauf:** Ohne eindeutige Issue-Referenz bleiben Planerstellung,
  Plan-Datei-Review-Angebot und späterer Wiedereinstieg über `$effective-flow review <plan-file>`
  unverändert.

## Akzeptanzkriterien

- [x] Eine eindeutige Issue-Referenz als Argument von `$effective-flow plan` wird in den gebauten
      Claude- und Codex-Artefakten vor der lokalen Planerstellung an `$effective-flow plan-issue`
      delegiert; dabei wird keine Datei unter `<plan.dir>` erzeugt und das Originalargument bleibt
      erhalten.
- [x] Freier Anforderungstext und der bestehende lokale Plan-Datei-Workflow verhalten sich
      unverändert; die vierstellige Legacy-Planpräzedenz ist durch einen Vertragstest abgesichert.
- [x] `$effective-flow plan-issue` bietet nach der verlässlichen Planung jedes ausgewählten Issues
      den vertieften interaktiven Review an. Zuvor durchläuft jedes Issue dieselbe automatische
      Gap-Analyse, Planvalidierung und interne Planprüfung wie ein lokaler Plan. „Ja“ nutzt danach
      dieselbe interne `plan-review`-Methodik wie lokale Pläne, „Nein“ nennt
      `$effective-flow plan-issue <issue>` als Wiedereinstieg.
- [x] Bei einer Liste mehrerer Issues werden Baseline, Review-Gate, Kommentar und Label pro Issue
      atomar abgeschlossen. Antworten gelten nur für das aktive Issue; ein blockiertes Issue
      verhindert nicht die Bearbeitung der verbleibenden Liste.
- [x] Der Issue-Modus des internen Reviews aktualisiert ausschließlich den vorhandenen markierten
      Planungskommentar, erhält dessen Sprache und Marker, dokumentiert Review-Ergebnis sowie offene
      Punkte und erzeugt weder Plan-Datei noch zweiten Planungskommentar.
- [x] `issue-tracker.md` definiert für GitHub und Forgejo einen überprüften Weg, den anhand seiner
      ID gelesenen Planungskommentar zu aktualisieren; ein nicht unterstützter Update-Pfad bricht ohne
      konkurrierenden Ersatzkommentar ab.
- [x] Ein Issue mit umsetzungsblockierenden offenen Punkten behält
      `effective-flow-needs-planning` und wird von `apply-issues` als `insufficient` klassifiziert; bei
      abgeschlossenem oder bewusst übersprungenem Review ohne blockierende Punkte wird das Label
      entfernt und das Issue bleibt für `$effective-flow apply` ausführbar.
- [x] Der bestehende `$effective-flow review <plan-file>`-Einstieg und der lokale Dateimodus von
      `plan-review` bleiben durch die Vertragstests unverändert abgedeckt.
- [x] `docs/user-guide/tools-understand.md` erklärt Gateway, Review-Angebot und beide
      Wiedereinstiege konsistent mit den Toolquellen.
- [x] `pnpm agent:check`, `pnpm test` und `node build.mjs` laufen erfolgreich; die erzeugten
      Claude- und Codex-Tooldateien enthalten keine unaufgelösten Includes oder Platzhalter.

Zusammen bilden diese Kriterien eine messbare Abschlussbedingung: Beide Planungseinstiege routen
Issue- und Datei-Artefakte eindeutig, bieten denselben tiefen Review-Kern an, veröffentlichen nur
umsetzungsreife Issue-Planungen und bestehen alle projektspezifischen Checks, ohne bestehende lokale
Plan- oder Review-Pfade zu verändern.

## Validierungsplan

- `pnpm agent:check` – alle geänderten Markdown- und Testdateien entsprechen der
  oxfmt-Konfiguration.
- `pnpm test` – bestehende Build-Lib-Tests und die neuen Workflow-Vertragstests sind grün.
- `node build.mjs` – Referenzen, Includes, Frontmatter, Kontextbudget und beide Harness-Ausgaben
  werden erfolgreich validiert.
- Die gebauten Varianten von `tools/plan.md`, `tools/plan-issue.md` und
  `tools/plan-review.md` in `dist/claude/` und `dist/codex/` stichprobenartig prüfen: Claude nutzt
  `/effective-flow …`, Codex `$effective-flow …`, und `plan-review` bleibt intern.
- Manueller textbasierter Trockenlauf für fünf Pfade: freie Anforderung an `plan`, `plan #123`,
  bereits geplanter Issue, tiefer Review mit offenen Punkten und tiefer Review ohne offene Punkte.
- Vor Übergabe den Diff gegen `1cdd053` prüfen und sicherstellen, dass die bereits vorhandenen
  Änderungen an `.gitignore`, `AGENTS.md`, `docs/adr/` und den anderen offenen Plan-Dateien nicht
  verändert wurden.

## Umsetzungsergebnis

- Umgesetzt wurde auf `origin/develop` bei `87f4ed8`; die gegenüber der Planungsgrundlage neue
  zentrale Tracker-Helper-Architektur wurde innerhalb des Verhaltensscopes berücksichtigt.
- `plan` liefert den argumentabhängigen Gateway als lazy Fragment aus. Darin wird die gemeinsame
  Source-Detection eager aufgelöst; Claude und Codex enthalten dadurch den vollständigen
  Stage-A-Vertrag und den jeweils korrekt transformierten `plan-issue`-Handoff.
- `issue-comment-update` ist für GitHub und Forgejo ausführbar und durch positive Kommentar-ID,
  Dry-run-first, frisches Re-read, Expected-body-Hash, idempotenten Unchanged-Pfad sowie
  fail-closed Fehlerzustände abgesichert.
- `pnpm agent:check` ist grün, `pnpm test` besteht mit 309 von 309 Tests und `node build.mjs` ist
  grün. Der always-loaded `plan`-Core liegt bei 700 von erlaubten 700 Zeilen.
- Ein externer End-to-End-Tracker-Test wurde bewusst nicht ausgeführt: Die Änderung betrifft einen
  textbasierten Orchestrierungsvertrag und einen deterministischen CLI-Adapter ohne UI oder lokale
  Laufzeitanwendung. Source-Verträge, direkte Helper-Tests beider Provider und die gebauten
  Harness-Artefakte decken die relevanten Pfade ohne Remote-Mutation ab.
- Die unabhängige Schlussreview fand zunächst einen wichtigen Packaging-Befund und einen Hinweis
  zur Dateimodus-Reihenfolge. Beide wurden behoben und erneut geprüft; das finale Votum enthält
  keine offenen kritischen, wichtigen oder Hinweis-Befunde.

## Annahmen

- „Issue angegeben“ bedeutet eine nach der bestehenden Stage-A-Syntax eindeutige
  Issue-Referenz oder Referenzliste, nicht beliebiger Freitext, der beiläufig eine Issue-Nummer
  erwähnt.
- Der tiefe Review bleibt optional. Bei Ablehnung ist die zuvor automatisch gap-analysierte,
  validierte und intern geprüfte Baseline ausreichend, genau wie beim lokalen `plan`-Workflow.
- Für einen späteren Issue-Review bleibt `plan-issue` der öffentliche Einstieg; eine zusätzliche
  Issue-Erkennung in `review` ist nicht Teil dieser Änderung.
- Die geplante Erweiterung der Issue-Kommentarstruktur ist abwärtskompatibel, weil Marker und
  bestehende Pflichtabschnitte erhalten bleiben.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       4 |       1 |
| Security    |        0 |       0 |       0 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       1 |       1 |
| Testbarkeit |        0 |       0 |       1 |
| Scope       |        0 |       0 |       1 |
| Wartbarkeit |        0 |       1 |       1 |

### Befunde

- **Architektur (Hinweis, eingearbeitet):** `apply-source-detection.md` trägt einen
  Apply-spezifischen Namen. Eine Umbenennung würde viele bestehende Consumer berühren und ist für
  das Gateway nicht nötig; der Plan beschränkt sich auf den bereits als allgemein verfügbar
  dokumentierten Stage-A-Vertrag.
- **Architektur (Wichtig, eingearbeitet):** Der erste Entwurf setzte Stage A vor jede
  Konfigurationsauflösung, obwohl die Erkennung das konfigurierte `<plan.dir>` für Planreferenzen
  benötigt. Die Reihenfolge ist jetzt read-only Config-Auflösung → Source-Detection → erst danach
  der lokale Planworkflow.
- **Architektur (Wichtig, eingearbeitet):** Die bisherige harte Schreibgrenze von `plan` erlaubte
  ausschließlich Änderungen unter `<plan.dir>` und widersprach damit einer Remote-Delegation. Der
  Plan trennt nun die seiteneffektfreie Gateway-Verantwortung von der anschließend allein gültigen
  Issue-Kommentar-Grenze des Zielworkflows.
- **Architektur (Wichtig, entschieden):** Für bereits geplante Issues standen eine erneute
  Statusprüfung im Gateway oder die konsequente Übergabe an `plan-issue` zur Wahl. Bestätigt ist die
  schlanke Gateway-Variante: `plan` delegiert jede eindeutige Issue-Referenz; nur `plan-issue`
  unterscheidet anhand des aktuellen oder alten Planungsmarkers zwischen Neuplanung,
  Aktualisierung und Review.
- **Architektur (Wichtig, entschieden):** Für die Angleichung war offen, ob nur das sichtbare
  Angebot oder auch die automatische Qualitätsbaseline von `plan` übernommen wird. Gewählt ist
  vollständige Parität: `plan-issue` führt Gap-Analyse, Validierung und internen Review immer aus
  und bietet erst anschließend den gemeinsamen tiefen Review an.
- **Fehlerfälle (Hinweis, eingearbeitet):** Der Konflikt zwischen nackten vierstelligen
  Issue-Nummern und Legacy-Planreferenzen ist explizit festgelegt und erhält einen Testfall.
- **Fehlerfälle (Wichtig, entschieden):** Bei mehreren Issues war offen, ob alle Baselines zuerst
  gesammelt und anschließend gemeinsam reviewt werden oder jedes Artefakt sofort abgeschlossen
  wird. Bestätigt ist die artefaktweise Variante: Der Review-Ausgang eines Issues wird vollständig
  persistiert, bevor das nächste beginnt; Blockaden bleiben lokal zum betroffenen Issue.
- **Testbarkeit (Hinweis, eingearbeitet):** Reine Build-Validierung beweist das neue
  Orchestrierungsverhalten nicht. Deshalb sind schmale Source-Vertragstests vorgesehen, ohne die
  gesamte Prosa zu snapshotten.
- **Scope (Hinweis, eingearbeitet):** Das naheliegende Erweitern von `$effective-flow review` um
  Issue-Referenzen bleibt bewusst außen vor; der Wiedereinstieg läuft über `plan-issue`.
- **Wartbarkeit (Hinweis, eingearbeitet):** Eine zweite tiefe Review-Methodik direkt in
  `plan-issue.md` würde driften. Der Plan erweitert stattdessen den bestehenden internen Review um
  explizite Artefaktadapter.
- **Wartbarkeit (Wichtig, eingearbeitet):** Die bisherige Anweisung verspricht bereits das
  Aktualisieren eines Planungskommentars, obwohl die gemeinsame Operations-Tabelle nur Lesen und
  Neuanlegen abbildet. Die fehlende Update-Operation ist nun Teil des Scopes und verhindert, dass
  der tiefere Review doppelte Kommentare erzeugt.

## Offene Punkte

- Keine offenen Punkte.
