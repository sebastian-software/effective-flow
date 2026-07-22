# Sichtbare Fortschrittsmeldungen für Goal-Läufe

**Planungsstatus:** Umgesetzt
**Quelle:** $effective-flow plan
**Empfohlener Workflow:** Feature (`$effective-flow build`)

## Anforderung

Wenn ein Effective-Flow-Workflow unter einem nativen Goal autonom weiterläuft, soll der User
den gesamten verbleibenden Ablauf nachvollziehen können. Dazu zeigt der Workflow zu Beginn eine
geordnete Aufgabenübersicht und meldet nach jeder größeren Phase den erreichten Stand im Chat.
Die Aufgabenübersicht und die Chatmeldungen ergänzen einander: Die Liste zeigt Gesamtumfang und
aktuellen Zustand, die Meldung nennt Ergebnis, nächsten Schritt und gegebenenfalls eine
Abweichung oder Blockade. Einzelne Shell-Befehle und internes Agentenrauschen werden nicht als
eigene Fortschrittsschritte ausgegeben.

Empfohlen wird **Feature (`$effective-flow build`)**, weil sich das sichtbare Verhalten autonomer
Goal-Läufe ändert. Die vorhandene Abschlussbedingung, Validierung und Begrenzung von
Korrekturschleifen bleiben unverändert.

Verifizierter Codekontext am Planungsstand `1cdd053` vom 2026-07-22:

- `src/shared/task-tracking.md` verlangt bei komplexen oder mehrphasigen Aufgaben bereits ein
  verfügbares TODO-/Task-Tracking-Tool, definiert aber weder eine vollständige initiale
  Phasenübersicht noch Wiederaufnahme und dynamisch entdeckte Schritte. Chatmeldungen sind dort
  nur der Fallback, wenn kein Task-Tool verfügbar ist.
- `src/shared/goal-completion.md` ist der zentrale Vertrag für autonome Goal-Läufe. Er definiert
  Abschlussbedingung, unabhängige Verifikation, Retry-Grenze und Goal-Form, koppelt den
  Goal-Start aber nicht verbindlich an eine Fortschrittsanzeige.
- Neun Tool-Quellen binden sowohl `task-tracking` als auch `goal-completion` ein:
  `apply-issues`, `apply-plan`, `apply-review`, `build`, `docs`, `fix`, `iterate`, `maintain`
  und `refactor`.
- Die genannten Workflows verlangen größtenteils bereits eine kurze Statusmeldung nach jeder
  Phase. `apply-review`, `apply-issues` und `review` besitzen darüber hinaus eigene Regeln für
  Findings, Issues, Quellen oder Sub-Reviewer. Diese spezifischere Granularität soll erhalten
  bleiben.
- `apply-issues` besitzt zusätzlich eine spezialisierte Goal-Form für seinen Batch-Scope. Sie
  benötigt den knappen Fortschrittssatz lokal, ersetzt aber nicht den zentral eingebetteten
  Vertrag.
- Der Umsetzungs-Drift-Check auf `bff15b3` hat bestätigt, dass der direkte Codex-Start über
  `create_goal` inzwischen umgesetzt ist. Die Fortschrittsanzeige gilt deshalb für manuelle und
  direkte Starts; der bestehende Transform und seine Tests bleiben unverändert.
- Die vier Implementierungsdateien werden in einem separaten Delivery-Worktree auf Basis von
  `bff15b3` geändert. Unabhängige Änderungen der Projektsetup-Migration und weitere neue Pläne im
  ursprünglichen Checkout bleiben unberührt.

## Architekturentscheidungen

- **Zentraler Goal-Vertrag mit enger Objective-Ausnahme:**
  `src/shared/goal-completion.md` erhält einen verbindlichen Abschnitt zur sichtbaren
  Fortschrittsführung. Alle Goal-fähigen Tools übernehmen ihn dadurch über ihren bestehenden
  Include, ohne den Ablauf in jeder Tool-Datei zu duplizieren. Nur das spezialisierte
  `apply-issues`-Objective wiederholt den knappen plattformneutralen Fortschrittssatz, weil es die
  kanonische Goal-Form für seinen Batch-Scope ersetzt; der vollständige Vertrag bleibt zentral.
- **Bestehendes Task-Tracking unverändert wiederverwenden:**
  `src/shared/task-tracking.md` bleibt der generische Mechanismus für verfügbare
  TODO-/Task-Tracking-Tools und wird nicht erweitert. Die strengere initiale Phasenübersicht,
  Wiederaufnahme und kumulative Chatmeldung sind eine eng begrenzte Sonderregel des
  Goal-Vertrags. Damit ändert dieses Vorhaben nicht das Verhalten sämtlicher nicht-goal-getriebener
  Tools und Agents. Spezifischere Regeln eines Tools – etwa Per-Finding-Tasks – haben weiterhin
  Vorrang.
- **TODO und Chat sind im Goal-Modus kumulativ:** Bei einem aktiven nativen Goal wird nach jeder
  größeren, nummerierten Workflow-Phase eine kurze Chatmeldung ausgegeben, auch wenn ein
  Task-Tracking-Tool verfügbar ist. Die bisherige Fallback-Regel in `task-tracking` bleibt für
  normale nicht-goal-getriebene Abläufe bestehen.
- **Genau ein Owner der Goal-Fortschrittsübersicht:** Der Workflow, der den verbleibenden
  Goal-Scope fachlich orchestriert, besitzt die sichtbare Phasenliste. `apply-plan` übergibt diese
  Verantwortung an den ermittelten Zielworkflow, bevor dessen Restphasen beginnen.
  `apply-issues` und `apply-review` behalten die Verantwortung für ihre Gesamtphasen und
  Issue-/Finding-Tasks; nicht-interaktiv delegierte Unterworkflows eröffnen keine konkurrierende
  Goal-Phasenliste. Ihre vorhandenen lokalen Task-Regeln dürfen nur in einem vom Harness
  isolierten Unterkontext eine eigene Detailansicht führen; andernfalls melden sie ihren Stand an
  den Owner zurück, der den zugehörigen Eintrag aktualisiert. Sie ersetzen oder überschreiben die
  übergeordnete Liste nicht.
- **Plattformneutrale Fähigkeiten:** Die Quellen nennen verfügbare TODO-/Task-Tracking-Fähigkeiten
  abstrakt und schreiben keine konkrete Codex- oder Claude-API fest. Das jeweilige Harness darf
  seine native Darstellung verwenden. Wenn dessen Plan-Tool nur einen aktiven Eintrag erlaubt,
  repräsentiert dieser die laufende Gesamtphase; ausdrücklich parallelisierte Detailarbeit wird
  über die vorhandenen tool-spezifischen Regeln und Chatmeldungen sichtbar gemacht.
- **Fortschrittsmeldung ist kein Gate:** Eine Meldung beendet oder pausiert den Workflow nicht.
  Nach der Ausgabe setzt der autonome Lauf ohne User-Antwort fort, sofern kein bereits
  definierter Approval-Konflikt oder echter Blocker vorliegt.
- **Wahrheitsgetreuer Lifecycle bis zum Abschluss:** Während eines begrenzten Korrekturlaufs
  bleibt die betroffene Phase aktiv und jede Korrekturrunde erhält eine knappe Statusmeldung.
  Übersprungene, fehlgeschlagene oder abgebrochene Schritte werden mit einem nativen Zustand oder
  – falls das Task-Tool keinen solchen Zustand besitzt – einem eindeutigen Suffix wie
  `[skipped]`, `[failed]` oder `[aborted]` abgeschlossen. Ein auf User-Entscheidung wartender
  Schritt wird nicht fälschlich als erledigt markiert. Vor dem Goal-Abschluss gleicht der Owner
  die gesamte Liste ab und berichtet das Endergebnis; kein bekannter Schritt bleibt ohne
  nachvollziehbaren Endzustand.
- **Goal-Objective trägt die Erwartung mit:** Die kanonische Goal-Form ergänzt knapp, dass eine
  sichtbare Phasenliste zu pflegen und nach jeder größeren Phase zu berichten ist. Damit bleibt
  die Anforderung auch beim manuellen Einfügen des `/goal`-Strings sowie beim direkten Codex-Start
  Bestandteil des Objectives. Das spezialisierte `apply-issues`-Objective trägt denselben Satz.
- **Keine neue Konfiguration:** Granularität und Ausgabeform werden als gemeinsamer
  Orchestrierungsvertrag festgelegt. Es entstehen keine neuen Projektsetup-Schlüssel und keine
  eigene persistente Fortschrittsdatei.

## Betroffene Dateien

| Datei                                | Beschreibung                                                                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/goal-completion.md`      | Verbindlichen Fortschrittsvertrag für aktive native Goals ergänzen und die kanonische Goal-Form um die sichtbare Fortschrittsführung erweitern. |
| `src/tools/apply-issues.md`          | Den Fortschrittssatz in das spezialisierte Batch-Objective übernehmen, ohne den zentralen Vertrag zu duplizieren.                               |
| `docs/user-guide/tools-implement.md` | Bei der autonomen Goal-Option die Phasenübersicht und Chatmeldungen als sichtbares Verhalten erklären.                                          |
| `docs/user-guide/glossary.md`        | Den Glossareintrag „Goal steering“ um Fortschrittsübersicht, Phasenmeldungen und den Fallback ohne Task-Tool ergänzen.                          |

`dist/` wird ausschließlich durch den Build erzeugt und nicht manuell geändert. Die neun
Tool-Quellen benötigen keine lokalen Wiederholungen des zentralen Vertrags. Die einzige lokale
Tool-Änderung ergänzt lediglich den Objective-Satz des vorhandenen `apply-issues`-Overrides.
`build.mjs` und `build-lib.mjs` benötigen keine Anpassung.

## Implementierungsdetails

### Vorgehen

1. In `src/shared/goal-completion.md` einen Abschnitt zur Fortschrittssichtbarkeit ergänzen:
   - Er gilt, sobald das native Goal aktiv ist – unabhängig davon, ob es manuell per `/goal` oder
     direkt durch Effective Flow gestartet wurde.
   - Ein Goal-Lauf verwendet die Aufgabenübersicht auch dann, wenn nur wenige Restphasen bestehen;
     dies ist die eng begrenzte Ausnahme von den Trivialitätsregeln des generischen Trackings.
   - Vor dem ersten verbleibenden Arbeitsschritt werden alle bekannten Restphasen in stabiler
     Reihenfolge angelegt. Statusänderungen erfolgen direkt beim Start und Abschluss; erst später
     bekannte Findings, Issues oder parallele Teilaufgaben werden ergänzt, sobald ihre Menge
     feststeht.
   - Bei einer Goal-Fortsetzung wird eine vorhandene passende Aufgabenliste abgeglichen und
     fortgeführt, statt dieselben Einträge erneut anzulegen. Spezifischere Tool-Regeln bleiben
     maßgeblich.
   - Der orchestrierende Owner führt genau eine Goal-Phasenliste. Router wie `apply-plan` geben
     die Verantwortung an den Zielworkflow weiter; nicht-interaktiv delegierte Unterworkflows
     erzeugen keine zweite Goal-Phasenliste. Eine lokale Detailansicht ist nur in einem
     harness-seitig isolierten Unterkontext zulässig; ohne Isolation meldet der Unterworkflow
     seinen Fortschritt an den Owner, statt dessen Liste zu ersetzen.
   - Ohne Task-Tool oder nach einem nicht behebbaren Task-Tool-Fehler nennt der Workflow die
     bekannten Restphasen kompakt im Chat und führt den Fortschritt dort weiter. Er behauptet
     keine erfolgreiche Listenaktualisierung, wenn diese fehlgeschlagen ist.
   - Nach jeder größeren Workflow-Phase folgt zusätzlich eine kurze Chatmeldung mit
     abgeschlossenem Schritt und Ergebnis, nächstem Schritt sowie nur bei Bedarf Abweichung oder
     Blocker.
   - Bei einem Validierungsfehler bleibt die Phase während der beschränkten Korrekturrunden aktiv;
     jede Runde wird als größerer Zwischenschritt gemeldet. Für Skip, terminalen Fehler und
     Abbruch wird der bestmögliche native Task-Zustand genutzt oder der abgeschlossene Eintrag mit
     dem im Projekt bereits verwendeten eindeutigen Suffix versehen.
   - Die Meldung ist ein Zwischenstand und kein Abschluss des Gesamtworkflows; der Lauf setzt
     anschließend selbstständig fort.
   - Unmittelbar vor der finalen Goal-Erfolgsmeldung gleicht der Owner alle bekannten Phasen und
     dynamischen Einträge ab. Er schließt das Goal erst nach erfüllter fachlicher
     Abschlussbedingung und einem sichtbaren Endzustand jedes bekannten Eintrags ab; beim
     Chat-Fallback übernimmt die Endzusammenfassung diesen Abgleich.
2. Die kanonische Goal-Form in `goal-completion.md` um einen knappen, plattformneutralen Satz zur
   sichtbaren Aufgabenliste und zu Phasenmeldungen erweitern. Falls der Plan zum direkten
   Codex-Goal-Start bereits umgesetzt wurde, dessen harness-spezifischen Transform und Tests vor
   der Änderung erneut lesen und sicherstellen, dass derselbe Objective-Text unverändert in den
   Codex-Aufruf beziehungsweise den Claude-Prompt gelangt. Den wortgleichen Satz außerdem in das
   spezialisierte Batch-Objective von `apply-issues` übernehmen.
3. `docs/user-guide/tools-implement.md` und `docs/user-guide/glossary.md` aktualisieren. Die Doku
   beschreibt die sichtbare Semantik, ohne eine bestimmte Harness-API oder UI-Darstellung zu
   versprechen.
4. Beide Harness-Ausgaben bauen und prüfen, dass der neue Abschnitt in allen neun generierten
   Goal-fähigen Tools vorkommt. Bestehende Per-Finding-/Per-Issue-Regeln stichprobenartig auf
   widerspruchsfreie Einbettung prüfen. Vor der Umsetzung die Consumer-Liste erneut aus den
   `goal-completion`-Includes ableiten; wenn sie sich gegenüber den verifizierten neun Tools
   geändert hat, Plan und Prüfumfang an den aktuellen Stand anpassen.

### Randfälle

- **Kein Task-Tracking-Tool verfügbar:** Der Workflow zeigt zu Beginn eine kompakte Liste der
  bekannten Restphasen im Chat und meldet dort weiterhin jede größere abgeschlossene Phase.
- **Task-Tracking-Tool fällt während des Laufs aus:** Der Fehler wird knapp gemeldet; der
  Workflow wechselt für die noch offenen Schritte zum Chat-Fallback, ohne eine erfolgreiche
  Task-Aktualisierung vorzutäuschen oder die fachliche Arbeit allein deshalb abzubrechen.
- **Goal wird automatisch fortgesetzt oder wieder aufgenommen:** Eine bereits vorhandene
  Aufgabenliste wird anhand der Phasenbezeichnungen fortgeführt. Nur neu entdeckte Schritte
  werden ergänzt; es entstehen keine Duplikate.
- **Parallele Teilaufgaben:** Die plattformnative Task-Darstellung darf eine laufende
  Gesamtphase als einzigen aktiven Eintrag führen. Die bestehenden detaillierten Regeln von
  `apply-review`, `apply-issues` und `review` bleiben für die feinere Darstellung maßgeblich und
  dürfen die Fähigkeiten des jeweiligen Task-Tools ausschöpfen.
- **Phase schlägt fehl oder benötigt eine Entscheidung:** Die Chatmeldung nennt den konkreten
  Zustand und den Blocker. Während eines begrenzten Retries bleibt die Phase aktiv; Skip,
  terminaler Fehler und Abbruch erhalten einen sichtbaren Endzustand. Der Workflow wartet nur
  dann auf den User, wenn seine bestehenden Eskalations- oder Approval-Regeln dies verlangen;
  ein solcher Schritt wird bis zur Entscheidung nicht als erledigt ausgegeben und die
  Statusanzeige selbst erzeugt kein neues Gate.
- **Delegation und Router-Handoff:** `apply-plan` erzeugt vor der Übergabe keine zweite Liste für
  die Implementierungsphasen. Bei `apply-issues` und `apply-review` bleibt die Gesamtübersicht
  beim übergeordneten Workflow; nicht-interaktive Unterworkflows nutzen ihre lokalen Detail-Tasks
  nur in einem isolierten Unterkontext. Andernfalls melden sie Status und Ergebnis an den Owner,
  ohne dessen Liste zu ersetzen.
- **Direkter Codex-Goal-Start bereits umgesetzt:** Der bestehende Transform übernimmt den
  erweiterten Objective-Text unverändert. `apply-issues` behält sein fachlich spezialisiertes
  Objective und ergänzt dort nur denselben Fortschrittssatz.
- **Sehr feine interne Schritte:** Shell-Befehle, einzelne Datei-Lesevorgänge und interne
  Sub-Agent-Nachrichten werden nicht als eigene Chatmeldung ausgegeben. Tool-spezifisch bereits
  definierte Findings, Issues, Quellen und Reviewer bleiben sichtbar.

## Akzeptanzkriterien

- [x] `src/shared/goal-completion.md` schreibt für jeden aktiven nativen Goal-Lauf eine sichtbare
      Aufgabenübersicht und eine zusätzliche Chatmeldung nach jeder größeren Workflow-Phase vor;
      dies gilt für manuell und direkt gestartete Goals.
- [x] Die Aufgabenübersicht enthält vor dem ersten verbleibenden Arbeitsschritt alle zu diesem
      Zeitpunkt bekannten Restphasen in Reihenfolge, wird bei jedem Start und Abschluss zeitnah
      aktualisiert und ergänzt dynamisch entdeckte Teilaufgaben ohne Duplikate.
- [x] Bei einer Goal-Fortsetzung wird eine vorhandene passende Aufgabenliste fortgeführt, statt
      neu angelegt; spezifischere Per-Finding-, Per-Issue-, Per-Quelle- und Per-Reviewer-Regeln
      bleiben unverändert wirksam.
- [x] Pro Goal-Lauf existiert genau ein Owner der Phasenübersicht: `apply-plan` übergibt die
      Verantwortung an den Zielworkflow, während `apply-issues` und `apply-review` ihre
      Gesamtübersicht behalten und nicht-interaktive Unterworkflows keine konkurrierende
      Goal-Phasenliste eröffnen. Eine lokale Detailansicht ist nur in einem isolierten
      Unterkontext zulässig; ohne Isolation aktualisiert ausschließlich der Owner die sichtbare
      Liste.
- [x] Jede Phasenmeldung nennt mindestens die abgeschlossene Phase mit Ergebnis und den nächsten
      Schritt; Abweichungen oder Blocker werden nur bei Bedarf ergänzt. Die Meldung pausiert oder
      beendet den autonomen Workflow nicht.
- [x] Bei einer beschränkten Korrekturschleife bleibt die Phase aktiv und jede Korrekturrunde
      wird knapp gemeldet. Übersprungene, fehlgeschlagene und abgebrochene Schritte erhalten
      einen eindeutigen Endzustand; ein auf User-Entscheidung wartender Schritt wird nicht als
      erledigt markiert.
- [x] Wenn kein Task-Tracking-Tool verfügbar ist oder dessen Aktualisierung dauerhaft fehlschlägt,
      nennt der Workflow die bekannten Restphasen im Chat und gibt danach dieselben
      Phasenmeldungen aus, ohne eine erfolgreiche Listenaktualisierung zu behaupten.
- [x] Vor der finalen Goal-Erfolgsmeldung sind alle bekannten Phasen und dynamischen Einträge
      abgeglichen und sichtbar erledigt, übersprungen, fehlgeschlagen oder abgebrochen; die
      fachliche Abschlussbedingung bleibt die maßgebliche Voraussetzung für den Goal-Abschluss.
- [x] Die kanonische Goal-Form enthält die plattformneutrale Anweisung, eine sichtbare
      Phasenübersicht zu pflegen und nach jeder größeren Phase zu berichten. Abschlussbedingung,
      Scope-Grenze, Validatoren und Retry-Limit bleiben fachlich unverändert. Das spezialisierte
      `apply-issues`-Objective enthält dieselbe Anweisung.
- [x] Der Build bettet den Fortschrittsvertrag in genau die neun Goal-fähigen Tools
      `apply-issues`, `apply-plan`, `apply-review`, `build`, `docs`, `fix`, `iterate`, `maintain`
      und `refactor` für Codex und Claude Code ein; die Quellen duplizieren den Vertrag nicht.
- [x] Die Nutzerdokumentation erklärt Aufgabenübersicht, Phasenmeldungen, automatisches
      Weiterlaufen und den Fallback ohne verfügbares Task-Tool, ohne eine konkrete UI zu
      garantieren.
- [x] Es entstehen keine neuen Approval-Gates, Konfigurationsschlüssel, Runtime-Dateien oder
      manuellen Änderungen unter `dist/`.
- [x] `pnpm agent:check`, `pnpm test` und `node build.mjs` laufen in dieser Reihenfolge
      erfolgreich.

## Validierungsplan

- `pnpm agent:check` ausführen; erwartet werden keine Formatierungsabweichungen.
- `pnpm test` ausführen; erwartet wird eine vollständig grüne `node:test`-Suite.
- `node build.mjs` ausführen; erwartet werden erfolgreiche Builds und Guards für beide
  Harnesses.
- In `dist/codex/effective-flow/tools/` und `dist/claude/effective-flow/tools/` prüfen, dass die
  neue Fortschrittssektion jeweils in genau den neun genannten Tool-Dateien enthalten ist und
  keine unaufgelösten Includes oder Referenzplatzhalter verbleiben.
- Die gerenderten Fassungen von `apply-review`, `apply-issues` und einem normalen Workflow wie
  `build` stichprobenartig prüfen: initiale Phasenübersicht, dynamische Detailregeln und
  Chatmeldungen dürfen sich nicht widersprechen.
- Die gerenderten Fassungen von `apply-plan`, `apply-issues` und `apply-review` zusätzlich auf
  eindeutiges Ownership prüfen: Router-Handoff beziehungsweise nicht-interaktive Delegationen
  dürfen keine zweite Goal-Phasenliste anlegen.
- Die Instruktionen anhand je eines gedanklichen Ablaufs für erfolgreichen Abschluss,
  Korrekturrunde, übersprungenen Schritt, terminalen Fehler, User-Blocker und Task-Tool-Ausfall
  prüfen. Jeder bekannte Eintrag muss vor dem Goal-Ende einen wahrheitsgetreuen sichtbaren Zustand
  besitzen oder im Chat-Fallback erklärt sein.
- Die kanonische Goal-Form in beiden Harness-Ausgaben vergleichen und verifizieren, dass
  Codex-Objective und Claude-`/goal`-Prompt denselben Fortschrittsauftrag tragen. Das
  spezialisierte `apply-issues`-Objective in beiden Ausgaben gesondert prüfen.

## Testergebnisse

- `pnpm agent:check`: bestanden, 237 Dateien geprüft.
- `pnpm test`: bestanden, 334 von 334 Tests.
- `node build.mjs`: bestanden; Claude-, Codex- und Portable-Ausgaben wurden erzeugt, die größten
  Always-loaded Cores liegen bei 700 von 700 Zeilen.
- `pnpm test:distribution`: bestanden, Offline-Distribution-Smoke-Test erfolgreich.
- Der Fortschrittsvertrag erscheint pro Harness genau einmal in genau den neun erwarteten Tools;
  keine unaufgelösten Includes oder Platzhalter. Das spezialisierte `apply-issues`-Objective trägt
  zusätzlich denselben Fortschrittssatz.

## Review-Befunde

- **Wichtig, behoben:** Der erste mehrzeilige Vertrag überschritt das Context-Budget des
  `build`-Kerns. Der vollständige Vertrag wurde ohne Guard-Änderung auf eine physische Zeile
  verdichtet; der Build liegt wieder bei 700 von 700 Zeilen.
- **Hinweis, behoben:** Die Überschrift „The three principles“ war nach Ergänzung des vierten
  Controls inkonsistent und heißt jetzt „Goal controls“.
- **Wichtig, behoben:** Das spezialisierte `apply-issues`-Objective enthielt den neuen
  Fortschrittssatz zunächst nicht. Der wortgleiche Satz wurde vor dessen Scope-Grenze ergänzt und
  in allen drei generierten Targets geprüft.
- **Wichtig, behoben:** Der Plan nannte diese notwendige Tool-Änderung zunächst nicht. Betroffene
  Dateien, Architekturentscheidung, Vorgehen, Akzeptanzkriterium und Validierungsplan bilden die
  enge Objective-Ausnahme jetzt ab.
- **Hinweise, behoben:** Veraltete Direktstart-Formulierungen und eine über einen Markdown-
  Softbreak getrennte Zusammensetzung wurden korrigiert. Der finale Review meldet keine offenen
  Befunde.

## Annahmen und offene Punkte

- „Größere Phase“ bezeichnet die nummerierten Phasen des jeweiligen Effective-Flow-Workflows.
  Bereits ausdrücklich definierte dynamische Einzelschritte bleiben zusätzliche sichtbare
  Tasks, lösen aber nicht automatisch jeweils eine eigene Chatmeldung aus.
- Die konkrete visuelle Darstellung der Aufgabenliste gehört dem jeweiligen Harness; Effective
  Flow garantiert den gepflegten Statusvertrag, nicht ein identisches UI in Codex und Claude
  Code.
- Der Direktstart-Plan war auf der Delivery-Basis bereits umgesetzt. Sein Objective-Transform und
  die zugehörigen Tests wurden vor der Änderung erneut gelesen und unverändert beibehalten.
- Das vorhandene spezialisierte `apply-issues`-Objective bleibt fachlich eigenständig. Deshalb
  übernimmt es lokal nur den wortgleichen Fortschrittssatz; der vollständige Vertrag bleibt
  zentral eingebunden.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       1 |       0 |
| Security    |        0 |       0 |       0 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       1 |       0 |
| Testbarkeit |        0 |       0 |       1 |
| Scope       |        0 |       1 |       1 |
| Wartbarkeit |        0 |       1 |       0 |

### Befunde

- **Architektur (Wichtig, eingearbeitet):** Der erste Entwurf legte nicht fest, wer bei
  `apply-plan` und den delegierenden Batch-Workflows die sichtbare Goal-Phasenliste besitzt.
  Ohne Single-Owner-Regel könnten Router, Orchestrator und Unterworkflow konkurrierende Listen
  anlegen. Der Plan weist die Übersicht jetzt dem fachlich verantwortlichen Orchestrator zu und
  regelt Handoff, isolierte Detailansichten und nicht-interaktive Delegationen ausdrücklich.
- **Fehlerfälle (Wichtig, eingearbeitet):** Retry, Skip, terminaler Fehler, Abbruch,
  User-Blocker und ein während des Laufs ausfallendes Task-Tool hatten keinen vollständigen
  sichtbaren Lifecycle. Der Plan hält laufende Korrekturen aktiv, verlangt eindeutige
  Endzustände, verhindert falsche Erledigt-Meldungen und definiert den Wechsel zum
  Chat-Fallback.
- **Wartbarkeit (Wichtig, eingearbeitet):** Vor dem Goal-Abschluss fehlte ein verbindlicher
  Abgleich zwischen fachlicher Abschlussbedingung und Fortschrittsübersicht. Der Owner muss nun
  alle bekannten Phasen und dynamischen Einträge versöhnen und einen sichtbaren Endzustand
  herstellen, bevor er den erfolgreichen Abschluss meldet.
- **Testbarkeit (Hinweis):** Der Build kann die Einbettung des Vertrags in beide Harnesses
  zuverlässig prüfen, nicht aber die spätere Befolgung jeder Fortschrittsanweisung durch jedes
  Modell. Der Validierungsplan kombiniert deshalb Build- und Inhaltsprüfungen mit einer
  stichprobenartigen Konsistenzprüfung der gerenderten Instruktionen.
- **Scope (Wichtig, eingearbeitet):** Eine Erweiterung von `src/shared/task-tracking.md` hätte das
  Verhalten aller komplexen Tools und Agents verändert, obwohl die Anforderung nur autonome
  Goal-Läufe betrifft. Der Plan lässt den generischen Baustein deshalb unverändert und verankert
  den strengeren Lifecycle ausschließlich in `src/shared/goal-completion.md`.
- **Scope (Hinweis, eingearbeitet):** Der zum Review-Zeitpunkt offene, auf der Delivery-Basis
  inzwischen umgesetzte Direktstart-Plan ändert dieselben zentralen Goal- und
  Dokumentationsdateien. Der Plan begrenzt die Überschneidung durch einen Drift-Check und die
  Vorgabe, keine zweite Goal-Start- oder Fortschrittslogik einzuführen.

## Offene Punkte

- Keine offenen Punkte.
