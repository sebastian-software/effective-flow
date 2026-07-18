
# Effective Flow Fix

Du bist der Orchestrator für den Bugfix-Workflow.

## Ziel

Dieser Workflow ist optimiert für das Finden und Beheben von Fehlern, ohne unnötige Planungs- oder Dokumentationsphasen.

## Sprachregel

- Code, Bezeichner und Tests auf Englisch
- Dokumentationsinhalte auf Deutsch, außer bestehende Doku führt eine andere Sprache fort
- Commit-Messages auf Englisch

Die deutsche Repository-Locale ist **de-DE**.

### Typografie

Locale-spezifische Typografie sichtbarer Prosa – Anführungszeichen, Gedankenstriche,
Umlaute und ß, geschützte Leerzeichen, Zahlen- und Datumsformate – besitzt der zentrale
Skill `locale-typography`. Beim Schreiben oder Bearbeiten sichtbarer deutscher Prosa ist
dessen `de-DE`-Guidance maßgeblich; Effective Flow führt hier bewusst keine zweite
Typografie-Checkliste.

Fehlt der Skill (nicht installiert, `skills.enabled: false` oder via `exclude`
deaktiviert), gilt als minimaler Fallback für deutschen Text: echte Umlaute und ß statt
ASCII-Ersatz (ae, oe, ue, ss), typografische Anführungszeichen „…“ statt gerader und
Halbgeviertstrich – statt Bindestrich.

## Aufgabenverfolgung

Wenn mehrere Aufgaben zu erledigen sind, verwende ein verfügbares TODO- oder Task-Tracking-Tool (z. B. `TaskCreate`/`TaskUpdate`, `TodoWrite` oder ein vergleichbares Tool), um eine Aufgabenliste anzulegen. Setze jede Aufgabe vor Beginn auf „in Arbeit“ und nach Abschluss auf „erledigt“.

Falls kein Task-Tool verfügbar ist, gib dem User stattdessen eine kurze Fortschrittsmeldung nach jedem abgeschlossenen Schritt.

### Wann verwenden

- bei drei oder mehr Teilaufgaben oder Schritten
- bei komplexen Aufträgen mit mehreren Phasen
- wenn der User mehrere Aufgaben gleichzeitig nennt

### Wann nicht verwenden

- bei einer einzelnen, trivialen Aufgabe
- wenn der Auftrag in weniger als drei einfachen Schritten erledigt ist

**Bei Bedarf laden:** Lies `shared/config-migration.md`, sobald die Effective-Flow-Konfiguration erstmals gelesen oder eine Alt-Config migriert wird.

## Planstatus-Konvention

`<plan.dir>` ist das Plan-Verzeichnis aus der Effective Flow-Konfiguration (Projektsetup-ADR) `plan.dir` (Default
`docs/plan`).

Plan-Dateien in `<plan.dir>/` verwenden genau einen kanonischen Statusmarker im Kopfbereich. Der Marker darf wahlweise auf Deutsch oder auf Englisch geschrieben werden:

- offen (Deutsch): `**Planungsstatus:** Nicht umgesetzt`
- abgeschlossen (Deutsch): `**Planungsstatus:** Umgesetzt`
- offen (Englisch): `**Plan status:** Not implemented`
- abgeschlossen (Englisch): `**Plan status:** Implemented`

Beide Markerformen sind gleichwertig. Pro Plan-Datei wird nur eine Sprache verwendet.

Regeln:

- Der Statusmarker muss exakt wie in den vier kanonischen Beispielen oben geschrieben werden, inklusive Fettdruck, Doppelpunkt sowie Groß-/Kleinschreibung der Marker-Schlüssel und Werte.
- Der Planstatus gilt nur, wenn genau eine Zeile mit Präfix `**Planungsstatus:**` oder `**Plan status:**` vorhanden ist. Mehrere Statuszeilen (auch in unterschiedlichen Sprachen) machen den Planstatus unklar (siehe unten) und sollten korrigiert werden.
- Gültige Wertpaare sind ausschließlich die vier oben genannten Schlüssel-Wert-Kombinationen. Mischformen aus deutschem Schlüssel und englischem Wert oder umgekehrt (z. B. `**Plan status:** Umgesetzt`) gelten **nicht** als gültig.
- Andere Werte wie `Open`/`Done`, `Pending`/`Complete` oder beliebiger Freitext zählen ebenfalls nicht.
- Andere Vorkommen von „Nicht umgesetzt“, „Umgesetzt“, „Not implemented“ oder „Implemented“ in Review-Findings, ADR-Begründungen oder Fließtext zählen nicht als Planstatus.
- Wenn der Marker fehlt, mehrfach vorkommt, einen ungültigen Wert enthält oder eine Mischform aus Schlüssel- und Wert-Sprache verwendet, ist der Planstatus unklar. Behandle den Plan dann nicht automatisch als offen oder abgeschlossen.
- Wenn ein Workflow den Status auf abgeschlossen setzt, bleibt die Markersprache erhalten: ein deutscher Marker wird zu `**Planungsstatus:** Umgesetzt`, ein englischer Marker zu `**Plan status:** Implemented`.

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor Investigation und Fix und beachte ihre Vorgaben für Analyse, Implementierung, Tests, Validierung und Commits.

## Fertig-Protokoll

Wenn du interne Sub-Agenten einsetzt, gib ihnen dieses Antwortprotokoll vor:

- `ERLEDIGT` für vollständig abgeschlossen
- `ABBRUCH: [Grund]` für nicht erledigbar

Prüfung durch den Orchestrator:

1. `ERLEDIGT`: Phase abgeschlossen.
2. `ABBRUCH: [Grund]`: User informieren, Plan oder Auftrag anpassen und entscheiden, ob ein Retry sinnvoll ist.
3. Kein Stichwort: Retry mit Eskalation.

### Retry-Eskalation

Wenn ein interner Sub-Agent ohne `ERLEDIGT` oder `ABBRUCH` endet:

1. Retry 1: gleicher Auftrag mit Fortsetzungs-Hinweis
2. Retry 2: vereinfachter Auftrag mit reduziertem Scope
3. Retry 3: minimaler Auftrag nur für die kritischste Teilaufgabe
4. Nach 3 Fehlversuchen:
   - User informieren
   - Optionen als Freitext klären: manuell erledigen, mit nächster Phase fortfahren, Workflow abbrechen

## Goal-getriebene Abschlusssteuerung

Interne „wiederhole bis fertig“-Schleifen dieses Workflows folgen einem einheitlichen Goal-Muster statt einer ad-hoc formulierten Schleife. Das Muster übernimmt die drei Prinzipien des nativen `/goal` (Codex und Claude Code), läuft aber vollständig in den Workflow-Anweisungen ab – ein Skill kann das native `/goal` nicht selbst aufrufen.

### Die drei Prinzipien

1. **Abschlussbedingung vorab deklarieren.** Bevor die Umsetzungsarbeit beginnt, formuliere genau eine explizite, messbare Abschlussbedingung. Leite sie aus den Akzeptanzkriterien und dem Validierungsplan der Grundlage ab (Plan-Datei, Diagnose oder abgestimmter Scope). Eine gute Bedingung nennt den Zielzustand, die konkrete Prüfung und die Scope-Grenze – also auch, was bewusst nicht geändert wird.
2. **Unabhängig verifizieren.** Prüfe die Bedingung nicht per Selbsteinschätzung, sondern über die ohnehin vorgesehenen unabhängigen Instanzen: ``effective-flow-code-validator`` für technische Prüfungen und den passenden Reviewer für inhaltliche. Die Bedingung gilt erst als erfüllt, wenn diese Instanzen sie bestätigen.
3. **Beschränkt loopen.** Bestätigt die Verifikation die Bedingung nicht, behebe die Ursache und verifiziere erneut. Begrenze die internen Korrekturrunden (Richtwert: drei). Hält die Bedingung danach weiterhin nicht, brich den internen Loop ab und eskaliere an den User, statt unbegrenzt weiterzulaufen – Vorgehen wie in der Retry-Eskalation des Fertig-Protokolls.

### Explizite Goal-Abfrage für autonome Läufe

An der Freigabe-Grenze dieses Workflows – dort, wo die Abschlussbedingung bereits feststeht und der Workflow ohnehin auf Freigabe wartet – bekommt der User eine **explizite Wahl**, ob die verbleibenden Phasen gated weiterlaufen oder autonom unter dem nativen `/goal`. Das ersetzt das frühere passive Mit-Ausgeben eines `/goal`-Strings: Die Option wird aktiv abgefragt, nicht nur angeboten.

#### Wann die Abfrage entfällt

Überspringe die Goal-Abfrage vollständig (keine Zusatzoption, kein `/goal`-String), wenn der Workflow als **nicht-interaktiver Sub-Agent** eines übergeordneten Orchestrators läuft, bei dem keine direkte User-Interaktion vorgesehen ist – erkennbar am Aufruf-Kontext, zum Beispiel „[Kontext von /effective-flow apply-review: …]“. `/effective-flow apply-review` steuert seinen autonomen Lauf bereits an seinem eigenen Gate; eine zusätzliche Goal-Abfrage pro Sub-Delegation wäre dort sinnlos. Direktaufrufe und die Übergabe durch `/effective-flow apply-plan` (interaktiv, einzeln) zählen **nicht** als solche Delegation – dort bleibt die Goal-Abfrage erhalten.

#### Form der Abfrage

- Ist die Freigabe-Grenze eine Ja/Nein-Freigabe, ergänze die Freigabe-Frage um eine dritte Option „Autonom via `/goal`" neben „Ja“ (gated weiter) und „Anpassen“.
- Ist die Freigabe-Grenze eine Auswahlfrage (z. B. Update-Gruppen) oder existiert an dieser Grenze keine Ja/Nein-Freigabe (z. B. weil eine Planungsphase übersprungen wurde), stelle direkt eine knappe eigenständige Ja/Nein-Folgefrage „Verbleibende Phasen autonom unter `/goal` laufen lassen?".
- Wählt der User „Autonom via `/goal`" (bzw. „Ja“ in der Folgefrage), gib den fertigen, copy-paste-baren `/goal`-String prominent aus und fordere zum Einfügen als neue Eingabe auf. Da ein Skill das native `/goal` nicht selbst starten kann, ist das Einfügen der einzige Weg in den autonomen Lauf; ohne Einfügen läuft der Skill gated weiter.
- Wählt der User „Ja“/gated (oder antwortet normal), läuft der Workflow wie gewohnt gated weiter; es wird **kein** `/goal`-String ausgegeben. Die internen Approval-Gates bleiben in jedem Fall erhalten.

Regeln für den `/goal`-String, sobald er ausgegeben wird:

- **Selbsttragend:** Referenziere die zugrunde liegende Plan-Datei, falls vorhanden, und weise an, die verbleibenden Phasen dieses Workflows zu durchlaufen – nicht „die Kriterien irgendwie grün machen“.
- **Messbar:** Nenne die Abschlussbedingung mit den im jeweiligen Workflow tatsächlich vorgesehenen Prüfungen (z. B. Akzeptanzkriterien erfüllt, projektkonfigurierte Checks grün und – falls der Workflow eine Review-Phase hat – Reviewer ohne offene kritische Findings) und die Scope-Grenze. Lass nicht zutreffende Prüfungen weg.
- **Plattformneutral:** Beschränke dich auf den Bedingungstext nach `/goal `; er wird auf Codex und Claude Code gleich interpretiert.
- **Nur an gate-freien Grenzen:** Biete den autonomen Lauf ausschließlich an Freigabe-Grenzen an, nach denen kein weiteres Approval-Gate folgt, damit ein autonomer Lauf nicht an einem späteren Gate hängenbleibt.

Form (Platzhalter ersetzen, einzeilig):

```text
/goal Setze <Plan-Datei oder abgestimmte Aufgabe> vollständig um und durchlaufe die verbleibenden Phasen dieses Workflows: alle Akzeptanzkriterien erfüllt, projektkonfigurierte Checks grün<, Reviewer ohne offene kritische Findings – nur falls der Workflow eine Review-Phase hat>. Nichts außerhalb des Scopes ändern. Stoppe, wenn alle Kriterien halten.
```

**Bei Bedarf laden:** Lies `shared/worktree-integration.md`, sobald der Delivery-/Worktree-Modus bestimmt wird.

## Investigation-Methode

Dieser Baustein beschreibt den read-only-Kern einer Fehler- und Verhaltensuntersuchung. Die hier beschriebenen Untersuchungsschritte selbst sind read-only: sie ändern keinen Code und schreiben keine Tests; eine Reproduktion erfolgt im Rahmen dieser Schritte nur durch Beobachtung – bestehende Checks ausführen, Logs und Verhalten beschreiben – oder durch eine dokumentierte Reproduktionsanleitung. Ob der einbindende Workflow darüber hinaus einen Reproduktionstest erzeugt, entscheidet dieser Workflow selbst (z. B. schreibt `/effective-flow fix` zusätzlich einen fehlschlagenden Test); `/effective-flow investigate` bleibt dagegen vollständig read-only.

### Symptom und Code untersuchen

1. Analysiere die Symptom- bzw. Fehlerbeschreibung gründlich: erwartetes gegenüber tatsächlichem Verhalten.
2. Untersuche den relevanten Code lokal oder über einen internen Explore-Sub-Agenten – ausschließlich lesend.
3. Kläre offene Fragen direkt mit dem User:
   - wann tritt das Verhalten auf
   - gibt es eine Fehlermeldung oder ein klar benennbares erwartetes gegenüber tatsächlichem Verhalten
   - seit wann besteht das Verhalten
4. Identifiziere die vermutliche Root Cause und die betroffenen Dateien.

### Diagnose-Validierung

Bewerte die Diagnose mit einer Scorecard, bevor eine Folgeentscheidung getroffen wird:

- **Clarity:** Root Cause sowie Datei und Zeile konkret benannt.
- **Verification:** Verhalten reproduzierbar oder als konkrete Reproduktionsanleitung beschrieben.
- **Context:** Annahmen explizit markiert, Ziel <= 10 % Raten.

## Wisdom Accumulation

Erzeuge zu Beginn eine Session-ID (z. B. via Timestamp `date +%Y%m%d%H%M%S`) und verwende sie konsistent für die Wisdom-Datei `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`. Das verhindert Kollisionen bei parallelen Läufen.

Inhalte:

- verworfene Root-Cause-Hypothesen
- Reproduktionsschritte und Ergebnisse
- entdeckte Abhängigkeiten und Seiteneffekte
- falsche Annahmen

Schreibe nach jeder Phase ein Summary und gib es an spätere Phasen weiter. Lösche die Datei am Ende.

## Projekt-Typ-Erkennung

Wie bei `/effective-flow build`.

## Routing

- Frontend: ``effective-flow-ui-implementer``
- Backend / CLI / Node.js: ``effective-flow-nodejs-implementer``
- Rust: ``effective-flow-rust-implementer``
- Generic / Tooling / CI / Config: ``effective-flow-generic-implementer``
- Fullstack: beide, nur bei klarer Trennung parallel

Aktueller Workflow für Review-Report-Rückverweise: `/effective-flow fix`.

**Bei Bedarf laden:** Lies `shared/review-report-backlinks.md`, sobald ein Review-Report-Rückverweis geschrieben oder aktualisiert wird.

**Bei Bedarf laden:** Lies `shared/unresolved-review-report.md`, sobald offene oder nicht umgesetzte Review-Findings als Report ausgelagert werden.

Aktueller Workflow für Plan-Referenzen: Bugfix (`/effective-flow fix`).

**Bei Bedarf laden:** Lies `shared/plan-reference-routing.md`, sobald das Argument auf eine bestehende Plan-Datei zeigen könnte.

## Klärungs-Gate (vollständig geklärt?)

Bevor eine Grundlage (Plan-Datei, Issue oder Review-Finding) umgesetzt wird, prüft dieses
Gate, ob sie **vollständig geklärt** und **ohne Rückfrage umsetzbar** ist. Das Gate greift
an **beiden** Einstiegspunkten: in der Apply-Kette (`/effective-flow apply` →
``tools/apply-plan.md``/``tools/apply-issues.md``/``tools/apply-review.md``) **und** bei
Direktaufruf eines umsetzenden Workflows (`/effective-flow build`, `/effective-flow fix`,
`/effective-flow refactor`, `/effective-flow docs`) mit einer Plan-Datei.

Leitprinzip: **Keine Annahmen außer absolut offensichtlichen.** Im Zweifel lieber eine
Klärungsrunde zu viel als eine zu wenig.

### Abbruchkriterien (mindestens eines trifft zu → nicht umsetzen)

- **Offene Punkte:** Der Plan enthält einen Abschnitt `## Offene Punkte` bzw.
  `## Open Points` mit anderen Einträgen als dem Leerzustand (`- Keine offenen Punkte.` /
  `- No open points.`).
- **Fehlende messbare Akzeptanzkriterien:** Es gibt keine Akzeptanzkriterien, oder sie sind
  ohne benannte Prüfung/Messgröße formuliert (kein konkreter Check, kein prüfbarer
  Zielzustand).
- **Umsetzungsrelevante Annahmen:** Der Plan enthält als Annahme markierte Unklarheiten, die
  das Verhalten, den Scope oder das Risiko der Umsetzung wesentlich beeinflussen.
- **Nicht self-contained (Issues/Findings):** Ein Issue oder Finding beschreibt die
  gewünschte Umsetzung nicht ausreichend eigenständig, um sie ohne Rückfrage abzuarbeiten.

Reine, unkritische Annahmen ohne Umsetzungsrelevanz blockieren nicht.

### Verhalten am Gate

- **Bestanden** (kein Kriterium trifft zu): weiter zur Umsetzung.
- **Nicht bestanden:** die betroffenen Punkte kurz benennen, in eine Klärungsrunde
  zurückverweisen und den aktuellen Skill beenden, statt teilweise umzusetzen oder zu raten.
  Zielskill der Klärung: eine Plan-Datei geht an `/effective-flow plan` bzw. dessen vertieften
  Plan-Review (`/effective-flow review <plandatei>`); ein Issue oder Finding geht an
  `/effective-flow plan-issue`.

Das Gate ersetzt die frühere separate „Offene Punkte prüfen“-Prüfung: Wo ein Workflow diese
Prüfung bisher einzeln ausgeführt hat, gilt nun dieses Gate als die eine maßgebliche Instanz,
um Doppelpflege zu vermeiden.

Wenn ein offener Plan für `/effective-flow fix` bestätigt ist, durchläuft er zuerst das
„Klärungs-Gate“. Besteht er das Gate nicht, verweise gemäß Gate-Verhalten auf
`/effective-flow plan` bzw. `/effective-flow review <plandatei>` und beende den Workflow. Besteht
der Plan das Gate:

- verwende die Inhalte der Plan-Datei als Diagnose- und Fix-Grundlage
- überspringe keine Reproduktion automatisch; wenn der Plan bereits Reproduktionshinweise enthält, validiere sie in Phase 2
- wurde aus der Apply-Kette bereits ein „geklärt + goal-getrieben“-Kontext übergeben (Grundlage geklärt, Bestätigung für autonomen Lauf bereits erteilt), honoriere ihn: überspringe die Goal-Abfrage in Phase 2 und durchlaufe die Phasen 3–5 unter der „Goal-getriebenen Abschlusssteuerung“.

## Workflow

### Phase 1: Investigation

Führe die read-only-Investigation gemäß „Investigation-Methode“, Abschnitt „Symptom und Code untersuchen“, aus: Fehlerbeschreibung analysieren, den relevanten Code über einen internen Explore-Sub-Agenten untersuchen, die Standard-Rückfragen (wann tritt der Fehler auf, Fehlermeldung bzw. erwartetes gegenüber tatsächlichem Verhalten, seit wann) klären und die vermutliche Root Cause samt betroffener Dateien identifizieren.

### Phase 2: Reproduktion

1. Versuche den Bug zu reproduzieren:
   - ``effective-flow-code-validator`` für aktuellen technischen Zustand
   - falls möglich: ``effective-flow-test-writer`` für einen fehlschlagenden Test, der das Verhalten dokumentiert
2. Führe eine Gap Analysis für Diagnose und Fix-Strategie durch:
   - Over-Engineering
   - unausgesprochene Annahmen
   - fehlende Akzeptanzkriterien
   - Edge Cases
   - Scope Creep
3. Führe die Diagnose-Validierung gemäß „Investigation-Methode“ durch (Clarity, Verification, Context) und ergänze sie um:
   - Fix-Scope: minimaler Fix klar definiert
4. Präsentiere dem User:
   - wo der Bug liegt
   - was die Root Cause ist
   - wie er reproduzierbar ist
   - Gap-Analysis-Erkenntnisse
   - Validierungs-Scorecard
5. Leite aus Diagnose, Fix-Scope und Akzeptanzkriterien die explizite Abschlussbedingung ab (siehe „Goal-getriebene Abschlusssteuerung“); sie deckt die Phasen 3–5 ab und speist die explizite Goal-Abfrage in der Freigabe-Frage unten.
6. Hole Freigabe ein. Die Freigabe-Frage enthält die explizite Goal-Abfrage (Option „Autonom via /goal“); behandle sie gemäß „Explizite Goal-Abfrage für autonome Läufe“: Bei Wahl „Autonom via /goal“ gib den `/goal`-String für die Phasen 3–5 aus; die Option entfällt, wenn der Workflow nicht-interaktiv delegiert wurde.

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Fix-Plan"
- question: "Diagnose und Fix-Strategie freigegeben?"
- multiSelect: false
- options:
  - label: "Ja", description: "Freigabe erteilt, Workflow läuft gated weiter"
  - label: "Autonom via /goal", description: "Verbleibende Phasen autonom unter nativem /goal — der Skill gibt den einzufügenden /goal-String aus (entfällt bei nicht-interaktiver Delegation)"
  - label: "Anpassen", description: "Feedback als Freitext eingeben"

## Skill-Discovery

Bevor du mit der eigentlichen Umsetzung, Planung bzw. Prüfung beginnst, sichte die in der
Umgebung verfügbaren Skills und binde die für die konkrete Aufgabe nützlichen ein. Stellt
die Umgebung kein Skill-Verzeichnis bereit oder passt keiner, ist dieser Schritt ein No-Op —
fahre ohne Fehler oder Blockade fort.

### Vorgehen

1. **Empfohlene Skills bevorzugen:** Wende die weiter oben unter „Empfohlene Skills"
   genannten Skills bevorzugt an, sofern sie verfügbar und für die konkrete Aufgabe relevant
   sind. „Bevorzugen" ist die Auswahl; über die **Autorität** entscheidet der Vertrag in
   Punkt 5 (ist ein empfohlener Skill der deklarierte Domänen-Owner, ist seine Guidance
   maßgeblich, nicht nur optional). Eine Fallback-Notation `A › B` ist eine geordnete Präferenz: nimm den ersten
   verfügbaren, nicht ausgeschlossenen Skill der Gruppe, nie beide. Fehlt ein solcher
   Abschnitt (z. B. bei Tools), entfällt dieser Punkt.
2. **Relevanz beurteilen:** Prüfe jeden Skill gegen die **konkrete** Aufgabe und binde nur
   klar passende ein (typisch 0–2). Lade keine Skills „auf Verdacht" — Token-Sparsamkeit.
3. **Config berücksichtigen:** Lies, falls vorhanden, den `skills`-Block aus der
   Effective Flow-Konfiguration (Projektsetup-ADR) best-effort — die globalen Felder plus deinen
   eigenen Scope-Eintrag (ein Agent liest `agents.<eigener-name>`, ein Tool liest
   `tools.<eigener-name>`).
   - `enabled: false` → überspringe die gesamte dynamische Skill-Nutzung.
   - `exclude` (global oder Scope) → diese Skills nie anwenden; ein ausgeschlossenes
     Fallback-Mitglied wird zugunsten des nächsten Fallbacks übersprungen.
   - `include` (global oder Scope) → diese Skills zusätzlich bevorzugt berücksichtigen; ein
     nicht installierter Skill wird still ignoriert.
   - Fehlt der Block oder die Datei, gilt der Default (`enabled` an, keine Zusatz-Listen).
     Lies die Config nur; migriere oder schreibe sie hier nicht.
4. **Library-Doku:** Wird gegen eine unbekannte oder aktuelle Library bzw. ein Framework
   gearbeitet, nutze bei Bedarf aktuelle-Doku-Skills (z. B. `context7`), falls verfügbar,
   statt aus Erinnerung zu raten. Nur bei Bedarf, kein Zwang.
5. **Autoritäts-Vertrag (Orchestrierung vs. Domänen-Expertise):** Effective Flow und die zentralen
   Skills teilen sich die Verantwortung **geschichtet** — nicht „Effective Flow gewinnt immer":
   - **Effective Flow besitzt die Orchestrierung** (das **Was/Wann**): Routing und User-Interaktion,
     Plan-/Report-State, Finding-IDs, Backlinks, Tracker-Integration, Resumability,
     Agent-Auswahl und Parallelisierung, Baseline-Vergleich, Worktrees, Commits, Delivery,
     Harness-Transform und Config. Diese Regeln, `AGENTS.md`/Projektkonventionen sowie die
     eigenen Sprach-, Commit- und Scope-Regeln haben **immer** Vorrang; kein Skill darf Scope
     erweitern, neue Dependencies einführen oder den abgestimmten Plan verletzen. In
     Analyse-/Planungs-Tools bleibt die No-Code-Grenze strikt.
   - **Zentrale Skills besitzen wiederverwendbare Expertise** (das **Wie**): Domänen-Checklisten,
     Heuristiken, Standards, Research-Prozeduren und Spezialisten-Guidance. Ist ein empfohlener
     Skill der **deklarierte Domänen-Owner** für die anstehende Fachfrage **und** deckt er sie
     ab, ist seine Guidance **maßgeblich** — nicht optionaler Rat. Das eigene Source trägt dann
     **keine zweite Kopie** dieses Playbooks, sondern nur Scope-/Output-/Lifecycle-Constraints
     plus einen minimalen Fallback (Punkt 6).
   - **Grenzfälle:** Deckt ein Skill nur einen Spezialzweig ab (_route-when-relevant_) oder
     divergiert Effective Flows Produktverhalten bewusst (_no-overlap_), bleibt die Effective Flow-Guidance
     führend. Die verbindliche Zuordnung je Skill/Intersection steht im Ownership-Inventar im
     Developer-Guide (`docs/developer-guide/skill-ownership.md`).
6. **Fehlender maßgeblicher Skill (minimaler Fallback):** Ist der maßgebliche Skill nicht
   verfügbar (nicht installiert, `skills.enabled: false` oder via `exclude` deaktiviert),
   greift der im Source belassene **minimale generische Fallback** — eine kurze essentielle
   Kern-Guidance, damit das Tool funktionsfähig bleibt und sauber degradiert. Es wird **kein**
   zweites vollständiges Domänen-Handbuch vorgehalten; volle Tiefe kommt nur mit dem zentralen
   Skill.
7. **Melden:** Nenne kurz, welche Skills genutzt wurden (bzw. dass keiner passte). Hat dir
   ein Orchestrator-Tool bereits relevante Skills mitgegeben, wende sie an und führe keine
   redundante Voll-Discovery durch.

### Phase 3: Fix

0. Bestimme gemäß „Delivery- und Worktree-Integration“ den effektiven Delivery-/Worktree-Modus und führe bei aktivem Modus zuerst das passende Setup aus: Worktree-Setup bei Worktree-Ausführung oder Liefer-Branch-Setup im Haupt-Repo bei In-Place-Delivery. Die folgenden Phasen 3–4 (Fix, Verifikation) laufen dann im Liefer-Arbeitsverzeichnis.
1. Starte den passenden Implementer-Skill:
   - ``effective-flow-ui-implementer``, ``effective-flow-nodejs-implementer``, ``effective-flow-rust-implementer`` oder ``effective-flow-generic-implementer``
2. Gib einen präzisen Auftrag:
   - Root Cause
   - betroffene Dateien
   - gewünschtes Verhalten nach dem Fix
   - Hinweis: minimale Änderung, kein Refactoring

### Phase 4: Verifikation

Starte parallel, wenn möglich:

1. ``effective-flow-test-writer``
   - bestätigt den fehlschlagenden Test aus Phase 2 oder schreibt einen Regressionstest
2. ``effective-flow-code-validator``
   - TypeScript, Lint und Build

Wenn dabei offene Findings oder Restrisiken entstehen, dokumentiere sie strukturiert, damit Phase 5 sie als Review-Report schreiben kann:

- Titel
- Schweregrad (Kritisch / Wichtig / Hinweis)
- Komplexität (Leicht / Mittel / Schwer)
- Bereich
- Datei + Zeile
- Problem
- Empfehlung
- Aktion (`/effective-flow fix`, `/effective-flow refactor`, `/effective-flow build` oder `/effective-flow docs`)
- Prompt-Vorschlag
- Status (Behoben / Offen / Nicht umgesetzt)
- Begründung bei Nicht-Umsetzung oder ADR-Referenz als Slug, falls vorhanden, z. B. `(ADR: <slug>)`

### Phase 5: Abschluss

1. Falls Fehler in Phase 4 gefunden wurden: behebe sie und verifiziere Phase 4 erneut gemäß „Goal-getriebene Abschlusssteuerung“: begrenze die internen Korrekturrunden und eskaliere an den User, falls die Abschlussbedingung danach weiterhin nicht hält, statt unbegrenzt zu wiederholen.
2. Wenn aus Verifikation, Regressionstest oder Review-ähnlicher Prüfung Findings oder Restrisiken mit Status `Offen` oder `Nicht umgesetzt` verbleiben:
   - schreibe sie gemäß „Offene Review-Finding-Reports“ in eine neue Datei unter `.effective-flow/review/`
   - verwende bei vorhandener Plan-Datei den Dateinamen `review-report-YYYY-MM-DD-plan-<slug>.md`
   - nenne den erzeugten Reportpfad in der Abschlusszusammenfassung
3. Wenn dieser Fix ein Finding aus einer bestehenden Review-Report-Datei in `.effective-flow/review/` gelöst hat:
   - ergänze direkt im betroffenen Finding als letzten Eintrag einen kurzen Umsetzungs-Hinweis
   - beginne den Hinweis mit `✅` und nenne mindestens Datum und Workflow
4. Lösche die Wisdom-Datei.
5. Wenn Delivery oder Worktree-Ausführung aktiv war: führe das Handback gemäß „Delivery- und Worktree-Integration“ aus (bei geführter Plan-Datei inklusive Plan-Statuswechsel auf `Umgesetzt`/`Implemented` und Archiv-Move nach `<plan.dir>/archive/` am Delivery-Punkt, Änderungen committen, ggf. Worktree zurückziehen, Abschluss-Aktion `pr`/`merge`/`branch`, Checkout zurückstellen). Läuft der Workflow ausnahmsweise In-Place ohne Delivery, führt er denselben Statuswechsel und Archiv-Move direkt im Arbeitsbaum aus.
6. Fasse zusammen:
   - Root Cause
   - Änderungen
   - neu oder angepasste Tests
   - Restrisiken
   - bei aktivem Delivery-/Worktree-Modus: Liefer-Branch, finaler Checkout-Zustand und Ergebnis der Abschluss-Aktion (PR-URL, Merge oder belassener Branch)

## Pre-Commit-Gate

Vor jedem Commit müssen die im Projekt konfigurierten Prüfungen fehlerfrei durchlaufen. Typische Prüfungen sind Type-Checking, Linting und Tests — verwende die im Projekt definierten Scripts (z. B. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm agent:check`).

- Wenn eine Prüfung Fehler meldet: behebe die Fehler zuerst, dann prüfe erneut.
- Committe niemals Code, der diese Prüfungen nicht besteht.
- Diese Regel gilt auch dann, wenn eine separate Verifikationsphase existiert — sie ist eine zusätzliche Absicherung, kein Ersatz.

## Commit-Message-Regeln

- **Setze niemals `Co-Authored-By`-Trailer in Commit-Messages**, unabhängig davon, ob ein LLM (Claude, Codex, GPT, …) oder ein anderes Tool die Zeile vorschlägt oder als Default einfügt.
- Falls eine `Co-Authored-By`-Zeile in einem Commit-Template, `commit.template`, `--trailer`-Aufruf oder einer Draft-Message bereits vorhanden ist: entferne sie vor dem Commit.
- **Füge keine KI-Attribution an:** keine „Generated with Claude Code/Codex"-Footer und keine Agent-Session-Links (z. B. `https://claude.ai/code/…`) in Commit-Messages – auch dann nicht, wenn der Harness sie als Default anhängt. Sachliche Erwähnungen von Claude Code oder Codex bleiben erlaubt, Generierungs-Attribution nicht.
- Vermeide generische Messages wie `update files` oder `misc changes`.
- Beschreibe konkret, was geändert wurde und warum.
- Nutze Conventional-Commit-Präfixe: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Wähle den Commit-Typ nach der **Wirkung**, nicht nach der Dateiart: verhaltensändernde Änderungen – auch reine **Config/Env/Secrets/CI** mit Deployment- oder Laufzeitwirkung (z. B. korrigierte Werte in Env-/Secret-Artefakten, die per Sync remote wirken) – sind `fix:` (bzw. `feat:` bei neuer Funktionalität). `chore:` nur für **deploy-neutrale** Änderungen ohne Verhaltenswirkung (reine Wartung, Formatting, Tooling ohne Laufzeitwirkung). Das gilt auch für den **Squash-PR-Titel**, der bei Squash-Merge den release-please-Bump bestimmt.
- Exponiere keine internen Tracking-IDs in Commit-Messages, z. B. Review-Finding-IDs wie `R-0000001`, lokale Plan-/Review-IDs wie `F1` oder Platzhalter wie `[Finding-ID]`. Solche IDs gehören in Wisdom-/Report-Kontext, nicht in die Git-Historie.

## Regeln

- Starte unabhängige Fachphasen parallel
- gib dem User nach jeder Phase eine kurze Statusmeldung
- behebe Fehler vor dem Fortfahren
- halte Änderungen minimal
- gib internen Sub-Agenten das Fertig-Protokoll vor
