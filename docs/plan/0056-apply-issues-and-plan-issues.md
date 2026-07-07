# 0056: Issue-getriebene Umsetzung – `sf-apply-issues` und `sf-plan-issues`

**Planungsstatus:** Umgesetzt
**Quelle:** /plan
**Empfohlener Workflow:** Feature (`/build`)

## Anforderung

Analog zu `{{SKILL:sf-apply-plan}}` und `{{SKILL:sf-apply-review}}` sollen zwei neue Orchestrator-Skills entstehen, die **beliebige** GitHub- oder Forgejo-Issues (einzeln, als Liste oder als Container-/Epic-Issue mit Sub-Issue-Checkliste) entgegennehmen und über die vorhandenen Umsetzungs-Skills abarbeiten. Anders als bei `{{SKILL:sf-apply-review}}` sind das **keine** von `{{SKILL:sf-review}}` erzeugten, strukturierten Finding-Issues, sondern frei geschriebene Menschen-Issues ohne Plan- oder Finding-Struktur. Der Inhalt muss deshalb je Issue **analysiert**, klassifiziert und an den passenden Umsetzungs-Skill weitergegeben werden.

Reicht die Information für eine autonome Umsetzung nicht aus, wird das Issue **übersprungen** und markiert. Ein zweiter Skill sammelt die übersprungenen Issues ein und **vervollständigt die Planung** interaktiv. Alle Status-Updates werden als **Kommentare am jeweiligen Issue** angehängt.

Begründung der Workflow-Empfehlung: Es entstehen zwei neue Skill-Definitionen (`SKILL.md`) plus eine kleine Erweiterung eines geteilten Bausteins und der README. Das ist neue Funktionalität → **Feature** (`/build`).

Zwei bestätigte Beispiele als Referenz-Testfälle:

- **Container-Issue** wie `terminaro#198`: Audit-Epic mit phasenweiser Checkliste aus Sub-Issue-Referenzen, teils `[x]` (erledigt), teils `[ ]` (offen).
- **Einzel-Issue** wie `terminaro#192`: klarer „Befund“ plus konkreter „Copy-Vorschlag“ – direkt umsetzbar.

## Architekturentscheidungen

- **Zwei getrennte Skills**, gespiegelt an der vorhandenen Namenskonvention:
  - `sf-apply-issues` (`/apply-issues`): nimmt Issue-Referenz(en) entgegen, analysiert, routet ausreichend spezifizierte Issues an den passenden Umsetzungs-Skill, überspringt unzureichende.
  - `sf-plan-issues` (`/plan-issues`): sammelt die übersprungenen Issues ein, vervollständigt die Planung interaktiv und schreibt das Ergebnis als Kommentar zurück.
    Begründung: Sauber getrennte Zuständigkeiten (autonome Umsetzung vs. interaktive Planvervollständigung), analog zu `{{SKILL:sf-apply-plan}}`/`{{SKILL:sf-apply-review}}`.

- **Direktes Routing statt Plan-Datei.** Ausreichend spezifizierte Issues werden – wie im Remote-Modus von `{{SKILL:sf-apply-review}}` – **direkt** an `{{SKILL:sf-build}}`, `{{SKILL:sf-fix}}`, `{{SKILL:sf-refactor}}` oder `{{SKILL:sf-docs}}` delegiert (je ein Worktree/Branch/PR pro Issue). Die Umsetzungs-Workflows planen intern selbst. `sf-apply-issues` erzeugt **keine** `docs/plan/`-Datei. Begründung: vermeidet einen doppelten Planungsschritt und hält den Durchsatz hoch; das Issue bleibt Single Source of Truth.

- **Wiederverwendung der Tracker-Plumbing aus `skills/_shared/issue-tracker.md`.** Host-/CLI-Erkennung (`gh`/`tea`), Verfügbarkeits-/Auth-Prüfung, die Operation-→-Kommando-Zuordnung (Issue lesen, Kommentar hinzufügen, Issue-Body aktualisieren, Label setzen, Label idempotent anlegen) und die Fehlerfälle werden über `include` mitgenutzt. Begründung: kein Duplizieren funktionierender Plumbing; ein Ort für die Werkzeug-Unterschiede. Die beiden neuen Skills sind **inhärent remote** – der `tracker.mode`-Umschalter (local/remote) aus `{{SKILL:sf-review}}`/`{{SKILL:sf-apply-review}}` gilt für sie nicht; sie brauchen lediglich Git-Repo, `origin` und ein authentifiziertes CLI.

- **`skills/_shared/issue-tracker.md` wird minimal verallgemeinert**, nicht umgebaut: die Einleitung nennt zusätzlich die beiden neuen Consumer, und die Label-Tabelle bekommt die zwei neuen Labels. Die finding-/epic-spezifischen Abschnitte (Finding-Body-Format, Epic-Body-Format, `R-XXXXXXX`-Konvention) bleiben unverändert und werden von den neuen Skills schlicht nicht genutzt. Begründung: kein risikoreicher Refactor der bestehenden `{{SKILL:sf-review}}`-/`{{SKILL:sf-apply-review}}`-Pfade; das Verhalten dieser Skills bleibt bit-identisch.

- **Container-Erkennung über Checklisten-Heuristik.** Enthält ein Issue-Body eine Aufgabenliste mit Issue-Referenzen (`- [ ] #NNN …` / `- [x] #NNN …`), wird das Issue als Container behandelt: nur die **offenen** (`[ ]`) Sub-Issues werden einzeln eingelesen und verarbeitet, erledigte (`[x]`) übersprungen. Der Container gilt als Epic für das spätere Abhaken. Issues ohne solche Liste sind Einzel-Arbeitsitems. Begründung: deckt die beiden bestätigten Realfälle (`#198` Container, `#192` Einzel) ohne Sonderkonfiguration ab.

- **Delegation & PR-Strategie werden aus `{{SKILL:sf-apply-review}}`-Remote übernommen**, nicht neu erfunden: fest „ein PR pro Issue“, je eigener Worktree/Branch ab dem konfigurierten Basis-Branch, PR über `{{SKILL:sf-pr}}` mit `Closes #<Issue>`, dateiüberlappende Issues sequenziell. `sf-apply-issues` läuft die Umsetzungs-Sub-Agenten als **nicht-interaktive** Delegation (keine Goal-Abfrage im Sub-Skill), analog zu `{{SKILL:sf-apply-review}}`.

- **`sf-plan-issues` ist interaktiv und kommentar-zentriert (Variante A).** Es nutzt die Klärungs-Methodik von `{{SKILL:sf-plan}}` (Analyse + gezielte Rückfragen), schreibt aber das Ergebnis als **strukturierten Kommentar** zurück ans Issue und entfernt das „needs-planning“-Label, statt eine `docs/plan/`-Datei anzulegen. Begründung: Nutzer-Vorgabe „Updates als Kommentare“; das Issue bleibt die einzige Quelle, und `sf-apply-issues` kann es beim nächsten Lauf direkt abarbeiten.

## Betroffene Dateien

| Datei                             | Beschreibung                                                                                                                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/sf-apply-issues/SKILL.md` | **Neu.** Orchestrator: Issues einlesen/expandieren, analysieren/klassifizieren, ausreichend spezifizierte an Umsetzungs-Skills routen (PR pro Issue), unzureichende überspringen und markieren, Updates als Kommentare. |
| `skills/sf-plan-issues/SKILL.md`  | **Neu.** Orchestrator: mit `sf-needs-planning` markierte Issues einsammeln, Planung interaktiv via `sf-plan`-Methodik vervollständigen, Ergebnis als Kommentar zurückschreiben, Label entfernen.                        |
| `skills/_shared/issue-tracker.md` | **Bearbeiten.** Einleitung um die beiden neuen Consumer ergänzen; Label-Tabelle um `sf-issue-done` und `sf-needs-planning` erweitern. Finding-/Epic-Abschnitte unverändert.                                             |
| `README.md`                       | **Bearbeiten.** Skill-Katalog-Tabelle um beide Skills ergänzen; kurzer Abschnitt, der den issue-getriebenen Fluss beschreibt (analog zum bestehenden `issue-tracker`-Absatz).                                           |
| `TODO.md`                         | **Optional bearbeiten.** Erledigt-Eintrag für diese Anforderung ergänzen, falls gewünscht.                                                                                                                              |

`dist/` ist Build-Output von `build.mjs` und wird **nicht** von Hand editiert; die neuen Skills werden beim nächsten Build automatisch erfasst (Skills werden aus `skills/` auto-discovered, kein Manifest).

## Implementierungsdetails

### Vorgehen

1. `skills/_shared/issue-tracker.md` minimal verallgemeinern (Einleitung + Label-Tabelle), ohne die finding-/epic-spezifischen Abschnitte zu verändern.
2. `skills/sf-apply-issues/SKILL.md` mit den unten beschriebenen Phasen anlegen; geteilte Bausteine per `include` einbinden (`language-rules`, `task-tracking`, `commit-message-rules`, `issue-tracker`, `goal-completion`, `worktree-integration`, soweit einschlägig).
3. `skills/sf-plan-issues/SKILL.md` mit den unten beschriebenen Phasen anlegen; `include` von `language-rules`, `task-tracking`, `issue-tracker`, und die `sf-plan`-Klärungsmethodik referenzieren.
4. README-Skill-Katalog und Beschreibungsabschnitt ergänzen.
5. Build ausführen und prüfen, dass beide Skills korrekt nach `dist/claude` und `dist/codex` erzeugt werden und Includes/Platzhalter aufgelöst sind.

### `sf-apply-issues` – Phasen

**Phase 1 – Argument & Tracker-Setup.**

- Host-/CLI-Erkennung und Verfügbarkeits-/Auth-Prüfung gemäß `issue-tracker.md` (Abschnitt „Host- und CLI-Erkennung“). Vorbedingung: Git-Repo mit `origin`. Fehlt CLI/Auth/`origin`: klar melden und abbrechen, kein Teilzustand.
- Argument parsen: eine oder mehrere Issue-Referenzen (Nummer, `#123`, URL). Ist das Argument ein `docs/plan/`-Pfad: Hinweis auf `{{SKILL:sf-apply-plan}}` und Abbruch (falscher Skill).
- Ohne Argument: offene Issues auflisten, die weder `sf-issue-done` noch `sf-needs-planning` tragen, und den User die zu verarbeitenden Issues wählen lassen. Keine heuristische Auto-Auswahl.
- Benötigte Labels idempotent anlegen (`sf-issue-done`, `sf-needs-planning`; „already exists“ tolerieren).

**Phase 2 – Expansion & Arbeitsliste.**

- Jedes referenzierte Issue **frisch** vom Tracker lesen (Body, Labels, Status).
- Container-Erkennung: enthält der Body eine Checkliste mit Issue-Referenzen, expandiere auf die **offenen** (`[ ]`) Sub-Issue-Referenzen und merke das Container-Issue als Epic; `[x]`-Einträge überspringen. Sonst Einzel-Arbeitsitem.
- Bereits geschlossene oder mit `sf-issue-done` markierte Arbeitsitems überspringen (idempotent).
- Deduplizieren (dieselbe Issue-Nummer nur einmal). Ergebnis: flache Liste von Arbeitsitem-Issues, je mit optionaler Epic-Referenz.
- Per-Issue-Tasks anlegen (Aufgabenverfolgung, Granularität pro Issue) und dem User eine Übersichtstabelle zeigen (Gesamt / davon Container-expandiert / bereits erledigt übersprungen).

**Phase 3 – Analyse & Klassifikation (pro Arbeitsitem, parallelisierbar).**

- Je Arbeitsitem ein Analyse-Sub-Agent, der nur analysiert und nichts ändert. Er liest den Issue-Body und untersucht die Codebase, um zu liefern:
  - **Klassifikation** in Feature / Bugfix / Refactoring / Dokumentation (Definitionen aus `{{SKILL:sf-plan}}`, Phase 1 übernehmen) und daraus den Ziel-Skill.
  - **Ausreichend-Prüfung:** Lässt sich aus dem Issue ein klares Soll-Verhalten und mindestens ein **messbares Akzeptanzkriterium** ableiten, und gibt es genug Datei-/Bereichs-Hinweise, damit der Ziel-Workflow autonom starten kann? Ergebnis: `ausreichend` oder `unzureichend` mit konkreter Liste des Fehlenden.
  - **Prompt-Vorschlag** für den Ziel-Skill (direkt verwendbarer Klartext) und **Konfidenz** (Hoch/Mittel/Niedrig, analog zur Vorabanalyse in `{{SKILL:sf-apply-review}}`).
- Ergebnisse in der Wisdom-Datei je Issue festhalten.

**Phase 4 – Routing & Delegation.**

- **Ausreichend:** an den Ziel-Skill delegieren (`{{SKILL:sf-build}}` / `{{SKILL:sf-fix}}` / `{{SKILL:sf-refactor}}` / `{{SKILL:sf-docs}}`), je eigener Worktree/Branch, ein PR pro Issue über `{{SKILL:sf-pr}}` mit `Closes #<Issue>`. Delegation als nicht-interaktiver Sub-Agent (Fertig-Protokoll `ERLEDIGT`/`ABBRUCH`, Retry-Eskalation wie in `{{SKILL:sf-apply-review}}`). Dateiüberlappende Issues sequenziell.
  - Nach erfolgreicher PR-Erstellung: PR-Link als Kommentar ans Issue schreiben, Label `sf-issue-done` setzen, und – falls das Issue aus einem Container stammt – den zugehörigen Checklisten-Eintrag im Epic-Body abhaken (Body frisch lesen, nur die betroffene Zeile umschalten, PR-Link anhängen).
  - Schlägt die PR-Erstellung fehl: Issue als fehlgeschlagen markieren, Epic-Eintrag **nicht** abhaken, mit dem nächsten Issue fortfahren.
- **Unzureichend:** nicht implementieren. Label `sf-needs-planning` setzen und einen erklärenden Kommentar mit der Liste des Fehlenden und dem Hinweis auf `/plan-issues` anhängen.
- Commit-Strategie ist fest „ein PR pro Issue“ (keine Commit-Strategie-Frage). Basis-Branch/Branch-Namen aus dem `worktree`-Config-Block wie in `{{SKILL:sf-apply-review}}`-Remote.

**Phase 5 – Zusammenfassung.**

- Bericht: verarbeitete Issues, erstellte PRs (mit URL), übersprungene (`sf-needs-planning`) mit Grund, abgehakte Epic-Einträge. Hinweis, dass übersprungene Issues mit `/plan-issues` vervollständigt werden können.

**Kommentar-Vorlagen (kanonisch, kurze Literale).**

- Erledigt: `🤖 Umgesetzt via /apply-issues — PR #<nr>` (keine internen IDs, kein `Co-Authored-By`).
- Übersprungen: `⏭️ Übersprungen: Für eine autonome Umsetzung fehlen noch Angaben: <Liste>. Mit /plan-issues vervollständigen.`

### `sf-plan-issues` – Phasen

**Phase 1 – Tracker-Setup & Sammlung.**

- Host-/CLI-Erkennung wie oben. Offene Issues mit Label `sf-needs-planning` auflisten; alternativ akzeptiert der Skill explizite Issue-Referenzen. User wählt eines/mehrere/alle.

**Phase 2 – Planung je Issue (interaktiv).**

- Pro Issue die Klärungs-Methodik aus `{{SKILL:sf-plan}}` (Phase 1/2) anwenden: Issue-Body und Codebase analysieren, offene Punkte identifizieren (Soll-Verhalten, fachliche Regeln, technische Vorgaben, Abhängigkeiten, Edge Cases, Akzeptanzkriterien) und den User gezielt fragen. Unwichtige Restpunkte als Annahme dokumentieren statt zu blockieren.

**Phase 3 – Rückschreiben als Kommentar.**

- Die vervollständigte, strukturierte Spezifikation als Kommentar ans Issue schreiben. Kanonische Kommentar-Struktur: Klassifikation/empfohlener Workflow, Anforderung, Akzeptanzkriterien, betroffene Bereiche/Dateien, Edge Cases, Annahmen.
- Label `sf-needs-planning` entfernen (Planung abgeschlossen), damit `sf-apply-issues` das Issue beim nächsten Lauf als umsetzbar aufnimmt.
- Keine `docs/plan/`-Datei anlegen (Variante A).

**Phase 4 – Zusammenfassung.**

- Welche Issues geplant wurden; Hinweis, dass `/apply-issues` sie nun umsetzen kann. Dieser Skill implementiert selbst nichts.

### State-Management

Nicht relevant im klassischen Sinn; die einzige persistente Oberfläche ist der Issue-Tracker. Temporäre In-Run-Daten liegen in der Wisdom-Datei (`.sf-plugin/.wisdom-accumulation-<SESSION_ID>.tmp.md`) und werden am Ende gelöscht, wie in `{{SKILL:sf-apply-review}}`.

### API-Anbindung

Alle Tracker-Zugriffe laufen abstrakt als Operation über die Werkzeug-Zuordnung in `issue-tracker.md` (GitHub `gh` / Forgejo `tea`): Issue lesen, Kommentar hinzufügen, Issue-Body aktualisieren (Epic-Abhaken), Label anlegen/setzen. Bei Epic-Body-Updates gilt die bestehende Regel: Body vor dem Ändern frisch lesen, nur die betroffene Zeile umschalten.

### Barrierefreiheit

Nicht relevant – reine Orchestrator-/CLI-Skills ohne UI.

### Edge Cases

- **Issue nicht gefunden / kein Zugriff:** melden, Issue überspringen, nächstes fortsetzen.
- **Container mit unzureichendem Sub-Issue:** dieses Sub-Issue erhält `sf-needs-planning`; der Epic-Checklisten-Eintrag bleibt offen.
- **Mehrdeutiger Host (z. B. GitHub Enterprise):** `remoteToolOverride`/Per-Run-Hinweis wie in `issue-tracker.md`; sonst nachfragen.
- **Kein Git-Repo / keine `origin`:** Abbruch mit Hinweis.
- **Argument ist Plan-Datei-Pfad:** Hinweis auf `{{SKILL:sf-apply-plan}}`.
- **Re-Run-Idempotenz:** bereits `sf-issue-done`/geschlossene Issues überspringen; vor dem Anhängen eines Status-Kommentars prüfen, ob bereits ein gleichartiger Plugin-Kommentar existiert, um Doppel-Kommentare zu vermeiden.
- **Fehlgeschlagene Delegation/PR:** Issue nicht als erledigt markieren, Epic nicht abhaken, in der Zusammenfassung als fehlgeschlagen ausweisen.
- **Sehr große Container:** alle offenen Sub-Issues verarbeiten; falls eine Obergrenze greift, die ausgelassenen Issues explizit im Bericht nennen (kein stilles Kappen).
- **`sf-plan-issues` ohne markierte Issues:** Kurzmeldung „keine offenen `sf-needs-planning`-Issues" und Ende.

## Akzeptanzkriterien

- [ ] `skills/sf-apply-issues/SKILL.md` existiert mit gültigem Frontmatter (`name`, `description`, `type: orchestrator`) und den Phasen 1–5 wie oben; alle referenzierten `include`-Bausteine und `{{SKILL:…}}`-Platzhalter lösen im Build fehlerfrei auf.
- [ ] `skills/sf-plan-issues/SKILL.md` existiert mit gültigem Frontmatter und den Phasen 1–4; es implementiert selbst keinen Code und erzeugt keine `docs/plan/`-Datei.
- [ ] `sf-apply-issues` behandelt ein Container-Issue (Checkliste mit Sub-Issue-Referenzen wie `terminaro#198`) durch Expansion auf die offenen `[ ]`-Sub-Issues und ein Einzel-Issue (wie `terminaro#192`) als einzelnes Arbeitsitem; die Logik ist im Skill-Text eindeutig beschrieben.
- [ ] `sf-apply-issues` klassifiziert je Issue in Feature/Bugfix/Refactoring/Doku, entscheidet `ausreichend`/`unzureichend` anhand ableitbarer messbarer Akzeptanzkriterien und routet ausreichend spezifizierte Issues an genau einen der vier Umsetzungs-Skills (ein PR pro Issue), während unzureichende `sf-needs-planning` plus erklärenden Kommentar erhalten.
- [ ] Status-Updates werden ausschließlich als Kommentare am Issue angehängt; erfolgreiche Umsetzung setzt `sf-issue-done`, hakt ggf. den Epic-Eintrag ab und kommentiert den PR-Link – ohne `Co-Authored-By`.
- [ ] `sf-plan-issues` sammelt `sf-needs-planning`-Issues, führt die interaktive `sf-plan`-Klärung durch, schreibt die vervollständigte Spezifikation als Kommentar zurück und entfernt das Label.
- [ ] `skills/_shared/issue-tracker.md` nennt die beiden neuen Consumer und listet `sf-issue-done` und `sf-needs-planning`; die finding-/epic-spezifischen Abschnitte sind unverändert.
- [ ] `README.md` führt beide Skills im Katalog und beschreibt den issue-getriebenen Fluss.
- [ ] `node build.mjs` (bzw. der konfigurierte Build) läuft fehlerfrei durch und gibt beide neuen Skills für `dist/claude` und `dist/codex` aus; die Skill-Zähler erhöhen sich entsprechend.

## Validierungsplan

- Build ausführen und Erfolg sowie erhöhte Skill-Zahl prüfen; erzeugte `dist/claude/skills/sf-apply-issues` und `…/sf-plan-issues` stichprobenhaft auf aufgelöste Includes/Platzhalter sichten.
- Diff-Kontrolle: `dist`-Ausgabe der bestehenden `sf-review`/`sf-apply-review` bleibt durch die `issue-tracker.md`-Ergänzung inhaltlich unverändert (nur additive Einleitung/Labels).
- Manueller Trockenlauf-Review der Skill-Texte gegen die zwei Realfälle: `#198` muss als Container erkannt und auf offene Sub-Issues expandiert werden; `#192` muss als ausreichend spezifiziertes Einzel-Issue an einen Umsetzungs-Skill geroutet werden.
- Prüfen, dass beide Skills bei fehlendem CLI/`origin` sauber abbrechen (Textpfad im Skill), und dass `sf-plan-issues` keinen Code erzeugt.

## Annahmen und offene Punkte

- Skill-Namen `sf-apply-issues` und `sf-plan-issues` (Slash-Befehle `/apply-issues`, `/plan-issues`) sowie Label-Namen `sf-issue-done` und `sf-needs-planning` sind mit dem User bestätigt.
- Direktes Routing an die Umsetzungs-Skills (keine `docs/plan/`-Datei durch `sf-apply-issues`) ist bestätigt; die interne Planung übernimmt der jeweilige Umsetzungs-Workflow.
- `sf-plan-issues` ist kommentar-zentriert (Variante A): Rückschreiben als Issue-Kommentar, keine Plan-Datei – bestätigt.
- Worktree-/PR-Mechanik wird konzeptionell aus dem Remote-Modus von `{{SKILL:sf-apply-review}}` übernommen; feinere Parametrisierung (Basis-Branch, Setup-Profil) folgt dem bestehenden `worktree`-Config-Block und wird im Umsetzungs-Feature konkretisiert.
- Ob `TODO.md` einen Erledigt-Eintrag erhält, ist kosmetisch und im Umsetzungs-Feature optional.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       1 |
| Security    |        0 |       0 |       1 |
| Datenschutz |        0 |       0 |       1 |
| Fehlerfälle |        0 |       0 |       1 |
| Testbarkeit |        0 |       0 |       0 |
| Scope       |        0 |       0 |       1 |
| Wartbarkeit |        0 |       0 |       0 |

### Befunde

- **Architektur (Hinweis):** Die generische Tracker-Plumbing steckt weiterhin in `issue-tracker.md`, dessen Name und finding-/epic-lastige Abschnitte für die neuen, arbeitsitem-basierten Skills teils irrelevant sind. Bewusst so gewählt, um einen risikoreichen Refactor der laufenden `sf-review`/`sf-apply-review`-Pfade zu vermeiden; eine spätere Extraktion eines reinen `tracker-cli`-Bausteins bleibt möglich.
- **Security (Hinweis):** Die Skills rufen `gh`/`tea` gegen die konfigurierte `origin`-Remote und erstellen Branches/PRs. Keine neuen Secrets; die bestehende CLI-Authentifizierung wird wiederverwendet und bei Fehlen sauber abgebrochen (kein stiller Fallback).
- **Datenschutz (Hinweis):** Status-Updates werden als Issue-Kommentare veröffentlicht; damit landen Zusammenfassungen im (ggf. öffentlichen) Tracker. Das ist die ausdrücklich gewünschte Oberfläche; die Kommentare enthalten nur Umsetzungs-/Fehlt-Angaben, keine internen IDs oder Secrets.
- **Fehlerfälle (Hinweis):** Re-Run-Idempotenz ist über `sf-issue-done`/Status-Prüfung und eine Doppel-Kommentar-Vermeidung adressiert; fehlgeschlagene PRs hakern das Epic bewusst nicht ab.
- **Scope (Hinweis):** Umsetzung, Test, Review und Commit bleiben Sache der delegierten Umsetzungs-Skills; die neuen Skills sind reine Orchestratoren und erweitern die Umsetzungs-Workflows nicht.

## Testergebnisse

**Datum:** 2026-07-06
**Umsetzung via:** /build (Übergabe durch /apply-plan)

Deliverables sind Skill-Definitionen in Markdown; ein Unit-/E2E-Testrahmen für Skills existiert im Repo nicht. Maßgebliche Prüfung ist der Plugin-Build (`node build.mjs`), der Frontmatter, `include`-Auflösung und `{{SKILL:}}`-Platzhalter validiert.

- `node build.mjs`: **grün** – 17 Skills / 11 Agents nach `dist/codex/` und `dist/claude/` (vorher 15 Skills; beide neuen Skills ergänzt).
- `dist/claude` und `dist/codex` enthalten `sf-apply-issues` und `sf-plan-issues`.
- Auflösungs-Checks im Claude-Output: 0 unaufgelöste `{{…}}`-Platzhalter, 0 verbliebene `include`-Fences, Include-Inhalte präsent, Cross-Referenzen korrekt als `/command` (`/build`, `/fix`, `/refactor`, `/docs`, `/pr`, `/plan-issues`, `/apply-plan`).
- `issue-tracker.md`-Änderung rein additiv (Intro-Absatz + zwei Label-Zeilen); Finding-/Epic-Abschnitte unverändert → kein Verhaltens-Diff für `sf-review`/`sf-apply-review`.

## Review-Findings

**Datum:** 2026-07-06
**Reviewer:** keiner (kein Code-Reviewer anwendbar – Deliverables sind Markdown-Skill-Definitionen, kein Node-/Rust-Code)

### Zusammenfassung

| Status                  | Anzahl |
| ----------------------- | -----: |
| Behoben                 |      0 |
| Offen / Nicht umgesetzt |      0 |

Anstelle eines Code-Reviews wurde ein Konsistenz-Review gegen die Autoren-Konventionen durchgeführt (gültiges Frontmatter, durchgängige `{{SKILL:}}`-Platzhalter, korrekte Include-Namen, additive `issue-tracker.md`-Änderung, konsistenter nicht-interaktiver Delegations-Kontextmarker). Keine Findings.
