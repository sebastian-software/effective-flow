# 0050: sf-investigate Skill

**Planungsstatus:** Umgesetzt
**Quelle:** /plan
**Empfohlener Workflow:** Feature (`/build`)

## Anforderung

Es soll ein neuer Orchestrator-Skill `sf-investigate` entstehen, der – analog zu `/plan` – eine reine **Analyse-Phase** kapselt, aber für **Fehler- und Verhaltensinvestigation** statt für Implementierungsplanung.

Abgrenzung zu den bestehenden Skills:

- `/plan` ist **präskriptiv**: Output ist ein Implementierungsplan (was geändert werden soll, betroffene Dateien, Akzeptanzkriterien).
- `/fix` ist auf das Beheben eines Fehlers **festgelegt**: Die Investigation in Phase 1–2 ist an einen anschließenden Fix gekoppelt.
- `sf-investigate` ist **deskriptiv/diagnostisch**: Es klärt „warum verhält sich das so" bzw. „wo liegt die Root Cause", erzeugt einen Diagnose-Report und **keinen Code**. Es darf legitim mit „kein Fehler, gewolltes Verhalten" oder „Produktentscheidung nötig" enden – ein Ausgang, den weder `/plan` noch `/fix` haben.

Das Wort „Verhaltensinvestigation" ist bewusst weiter als „Bugfix": Es deckt auch das Verstehen von korrektem, aber überraschendem Verhalten ab (kein Fehler).

Begründung der Workflow-Empfehlung: Die Umsetzung fügt neue Funktionalität (einen neuen Skill plus Shared-Bausteine) hinzu und passt einen bestehenden Skill an. Das ist ein **Feature**, daher Umsetzung über `/build`.

## Architekturentscheidungen

- **Skill-Typ `orchestrator`.** `sf-investigate` steuert eine mehrphasige Analyse, spawnt interne Explore-Sub-Agenten, stellt Rückfragen und schreibt einen Report. Damit wird es – wie alle Orchestratoren – zu einem Codex-Skill (`$sf-investigate`) und einem Claude-Command (`/investigate`). Der Build entdeckt `skills/sf-*/` automatisch; keine Manifest-Registrierung nötig.

- **Analyse-only mit eigener Schreibgrenze.** Harte Abgrenzung wie bei `/plan`, aber mit anderem Schreibziel: erlaubt sind ausschließlich Analyse, Rückfragen, Lesen, das Ausführen **read-only** prüfbarer Befehle/bestehender Checks sowie das Schreiben des Diagnose-Reports unter `.sf-plugin/investigation/`. Verboten sind Änderungen an Source-Code, Tests, Konfiguration, Build-Dateien, Doku und ADRs. Insbesondere darf – anders als in `/fix` – **kein** Reproduktionstest geschrieben werden; Reproduktion erfolgt nur durch Beobachtung (vorhandene Checks ausführen, Logs/Verhalten beschreiben) oder durch eine dokumentierte Reproduktionsanleitung.

- **Transienter Report unter `.sf-plugin/investigation/`.** Der Diagnose-Report ist punktuell und wird wie Review-Reports unter `.sf-plugin/` abgelegt, Dateiname `investigation-YYYY-MM-DD-<slug>.md`. Bewusst **nicht** unter `docs/`: Das vermeidet ein zweites Nummernsystem, verschmutzt `docs/plan/` und `sf-open-plans` nicht und spiegelt den Point-in-time-Charakter wider. Dauerhafte Verhaltens-Dokumentation entsteht nur, wenn die Empfehlung nach `/docs` routet.

- **Routing nach außen in die vier bestehenden Workflows.** Am Ende empfiehlt `sf-investigate` genau einen Folge-Schritt: Bugfix (`/fix`), Refactoring (`/refactor`), Feature/Verhaltensänderung (`/build`), Dokumentation (`/docs`) oder „Keine Aktion / Produktentscheidung nötig". Es gibt jeweils einen copy-paste-baren Aufruf-Vorschlag aus, der den Report-Pfad referenziert.

- **Dedup mit `/fix` über zwei neue Shared-Bausteine.** Die heute in `sf-fix` inline stehende Investigation-Kernlogik und die Wisdom-Accumulation werden nach `_shared/` herausgezogen und von beiden Skills per Include-Fence eingebunden. Das folgt dem etablierten Dedup-Muster (Plan 0039) und hält die Methodik an einer Stelle.
  - `_shared/investigation-method.md`: read-only-Kern (Symptom analysieren, Code via Explore-Sub-Agent untersuchen, Standard-Rückfragen wie „wann tritt es auf", „Fehlermeldung", „seit wann", Root Cause und betroffene Dateien identifizieren, Diagnose-Validierungs-Scorecard).
  - `_shared/wisdom-accumulation.md`: Session-ID, Dateipfad, Inhalte (verworfene Hypothesen, Reproduktionsschritte, Abhängigkeiten, falsche Annahmen), Summary pro Phase, Löschung am Ende.
  - Die test-basierte Reproduktion (`{{AGENT:sf-test-writer}}`) bleibt **ausschließlich** in `sf-fix`, weil der Shared-Kern read-only sein muss.

- **Kein Goal-/Commit-Apparat.** `sf-investigate` ändert keinen Code und committet nicht. Daher ohne `goal-completion` (kein Autonom-Loop/`/goal`-String, wie bei `/plan` und `/review`), ohne `pre-commit-gate` und ohne `commit-message-rules`. Es nutzt nur die explizite Diagnose-Validierungs-Scorecard.

## Betroffene Dateien

| Datei                                    | Beschreibung                                                                                                                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/sf-investigate/SKILL.md`         | **Neu.** Orchestrator-Skill für Fehler- und Verhaltensinvestigation (Frontmatter, Phasen, Report-Template, Routing).                                                                     |
| `skills/_shared/investigation-method.md` | **Neu.** Read-only-Investigation-Kern, eingebunden von `sf-investigate` und `sf-fix`.                                                                                                    |
| `skills/_shared/wisdom-accumulation.md`  | **Neu.** Wisdom-Accumulation-Baustein, eingebunden von `sf-investigate` und `sf-fix`.                                                                                                    |
| `skills/sf-fix/SKILL.md`                 | **Ändern.** Inline-Wisdom-Accumulation und die read-only-Investigation-Kernteile durch Include-Verweise ersetzen; test-basierte Reproduktion bleibt inline. Verhalten bleibt äquivalent. |
| `README.md`                              | **Ändern.** `sf-investigate` in die Orchestratoren-Tabelle und ggf. in die Struktur-/`_shared`-Auflistung aufnehmen.                                                                     |
| `build.mjs`                              | **Ändern.** Die hartkodierte `marketplace`-Plugin-`description` um „investigate" ergänzen (kosmetisch, für Konsistenz).                                                                  |

## Implementierungsdetails

### Vorgehen

1. `_shared/wisdom-accumulation.md` anlegen: bestehenden „Wisdom Accumulation"-Block aus `sf-fix` 1:1 als Baustein extrahieren (mit `## Wisdom Accumulation`-Überschrift).
2. `_shared/investigation-method.md` anlegen: read-only-Kern aus `sf-fix` Phase 1 + Diagnose-Validierungs-Scorecard aus Phase 2 zusammenführen, frei von test-schreibender Reproduktion.
3. `sf-fix/SKILL.md` umstellen: Wisdom-Block und die ausgelagerten Kernteile durch Include-Verweise ersetzen, test-basierte Reproduktion (`{{AGENT:sf-test-writer}}`) und alle Fix-/Verifikations-/Abschluss-Phasen unverändert lassen.
4. `sf-investigate/SKILL.md` neu schreiben (Phasen siehe unten), `language-rules`, `task-tracking`, `investigation-method` und `wisdom-accumulation` einbinden.
5. README-Orchestratoren-Tabelle und `build.mjs`-Beschreibung ergänzen.
6. `node build.mjs` ausführen und die erzeugten Artefakte prüfen.

### Skill-Struktur (`sf-investigate`)

Frontmatter: `name: sf-investigate`, `type: orchestrator`, deutschsprachige `description`, die Zweck (Fehler- und Verhaltensinvestigation), Analyse-only-Charakter und Routing nach `/fix`, `/refactor`, `/build`, `/docs` nennt und die Platzhalter `{{SKILL:...}}` verwendet.

Phasenfolge:

1. **Scope und Symptomaufnahme** – Symptom, erwartetes vs. tatsächliches Verhalten und Scope erfassen; früh klassifizieren: Fehler, beabsichtigtes-aber-überraschendes Verhalten oder unklar.
2. **Investigation** – über `investigation-method` (Explore-Sub-Agent, Standard-Rückfragen, Root-Cause- und Datei-Identifikation); Hypothesen-Tracking über `wisdom-accumulation`; ausschließlich read-only.
3. **Diagnose** – Root-Cause-Hypothesen mit Evidenz und Konfidenz, verworfene Hypothesen explizit festhalten.
4. **Diagnose-Validierung** – Scorecard: Clarity (Root Cause + Datei/Zeile benannt), Verification (reproduzierbar oder Reproduktionsanleitung), Context (Annahmen markiert, Ziel <= 10 % Raten), Konfidenz.
5. **Empfehlung und Report** – Report unter `.sf-plugin/investigation/` schreiben, genau eine Folge-Empfehlung mit Begründung und copy-paste-barem Aufruf ausgeben; optional Übergabe anbieten.

### Report-Template (`.sf-plugin/investigation/investigation-YYYY-MM-DD-<slug>.md`)

Abschnitte: Symptom · Klassifikation (Fehler / beabsichtigtes Verhalten / unklar) · Reproduktion (Schritte + Ergebnis oder „nicht reproduzierbar") · Untersuchte Bereiche / betroffene Dateien · Root-Cause-Hypothesen (Evidenz, Konfidenz) · Verworfene Hypothesen · Empfehlung (Workflow + Begründung + Prompt-Vorschlag) · Offene Punkte / benötigte Entscheidungen.

### Edge Cases

- **Kein Fehler gefunden / gewolltes Verhalten:** Report schließt mit Klassifikation „beabsichtigtes Verhalten" und Empfehlung „Keine Aktion" oder Routing nach `/docs` (Verhalten dokumentieren).
- **Nicht reproduzierbar:** Reproduktion als „nicht reproduzierbar" markieren, dennoch Hypothesen mit reduzierter Konfidenz und konkrete nächste Diagnoseschritte nennen, statt zu blockieren.
- **Mehrere plausible Root Causes:** alle mit getrennter Konfidenz auflisten; Empfehlung kann „weitere Investigation nötig" sein.
- **`.sf-plugin/investigation/` fehlt:** Verzeichnis anlegen (einzige erlaubte Verzeichniserstellung außerhalb der Lesepfade).

## Akzeptanzkriterien

- [ ] `node build.mjs` läuft fehlerfrei durch und erzeugt `dist/claude/.../commands/investigate.md` sowie `dist/codex/skills/sf-investigate/SKILL.md`.
- [ ] `sf-investigate/SKILL.md` deklariert `type: orchestrator` und eine harte Schreibgrenze, die nur `.sf-plugin/investigation/` als Schreibziel erlaubt und Code-/Test-/Config-/Doku-Änderungen ausschließt.
- [ ] Die beiden neuen `_shared/`-Bausteine existieren und werden sowohl von `sf-investigate` als auch von `sf-fix` per Include-Fence eingebunden; alle Includes lösen im Build auf.
- [ ] `sf-fix` baut weiterhin fehlerfrei und behält sein bestehendes Verhalten (test-basierte Reproduktion, Fix-/Verifikations-/Abschluss-Phasen unverändert).
- [ ] `sf-investigate` routet am Ende auf genau eine der Optionen `/fix`, `/refactor`, `/build`, `/docs` oder „Keine Aktion" und gibt einen Aufruf-Vorschlag mit Report-Pfad aus.
- [ ] README listet `sf-investigate` in der Orchestratoren-Tabelle.

## Validierungsplan

- `node build.mjs` ausführen; Exit-Code 0 und Summary mit erhöhter Skill-/Command-Zahl prüfen.
- In `dist/` stichprobenartig prüfen, dass die Platzhalter in `investigate.md` korrekt nach `/fix`, `/refactor`, `/build`, `/docs` transformiert wurden und die beiden Includes inlined sind.
- `dist`-Variante von `sf-fix` gegen die alte Fassung vergleichen, um inhaltliche Äquivalenz nach der Extraktion zu bestätigen.
- Manuelles Read-through von `sf-investigate/SKILL.md` gegen die Schreibgrenze (keine Code-/Test-Schritte enthalten).

## Annahmen und offene Punkte

- **Annahme:** Markersprache Deutsch (aus vorhandenen Plänen erkannt; keine `.sf-plugin/config.json` vorhanden). Für `sf-investigate` selbst ist kein `markerLanguage`-Mechanismus nötig, da es keine Plan-Dateien mit Statusmarker erzeugt.
- **Offen (umkehrbar):** Ablageort des Reports – Empfehlung `.sf-plugin/investigation/` (transient). Alternative wäre ein dauerhaftes `docs/investigation/`-Verzeichnis mit eigenem Nummernschema; bewusst nicht gewählt wegen Zusatzkomplexität.
- **Offen (umkehrbar):** Tiefe der `sf-fix`-Refaktorierung – minimal (nur Wisdom-Block teilen) bis vollständig (kompletter read-only-Kern geteilt). Plan setzt die mittlere Variante an: Wisdom-Block + read-only-Investigation-Kern teilen, test-basierte Reproduktion in `sf-fix` belassen.
- **Bewusst außerhalb des Scopes:** Eine 5. Kategorie „Investigation" in `/plan`/`sf-apply-plan` und das Einlesen vorhandener Plan-Dateien durch `sf-investigate` (`plan-reference-routing`). Beides wäre ein eigenes Folge-Feature.
- **Bewusst außerhalb des Scopes:** Deployment-Skripte (`local-update.sh`/`local-link.sh`) – sie kopieren generische `dist/`-Ausgaben und brauchen keine Anpassung für einen zusätzlichen Skill.

## Testergebnisse

**Datum:** 2026-06-29

Dieses Repo enthält kein Unit-Test-Framework; die Validierung erfolgt über Build und Formatter:

- `node build.mjs` erfolgreich: 14 Codex-Skills und 14 Claude-Commands (neu: `sf-investigate`), 9 Agents. Beide neuen Includes (`investigation-method`, `wisdom-accumulation`) lösen in `sf-investigate` und `sf-fix` auf; `{{SKILL:…}}`-Platzhalter werden korrekt transformiert; keine unaufgelösten Platzhalter oder Include-Fences im `dist/`. Die `investigate`-Routing-Platzhalter erscheinen als `/fix`, `/refactor`, `/build`, `/docs`.
- `dist`-Vorher/Nachher-Vergleich von `sf-fix`: nur die erwartete Restrukturierung (inlinte `Investigation-Methode`-Sektion, Phase 1 und Diagnose-Validierung referenzieren sie, `Fix-Scope` erhalten, Wisdom-Block byte-identisch). Worktree-Integration aus Plan 0048 (Phase-3-Setup, Phase-5-Handback) und die test-basierte Reproduktion bleiben intakt.
- `pnpm agent:check` (oxfmt) grün über alle Dateien.

## Review-Findings

**Datum:** 2026-06-29
**Reviewer:** sf-nodejs-reviewer

### Zusammenfassung

| Status                  | Anzahl |
| ----------------------- | -----: |
| Behoben                 |      3 |
| Offen / Nicht umgesetzt |      0 |

Keine kritischen Findings. Zwei wichtige Findings (kategorisches Testverbot im geteilten `investigation-method` widersprach `sf-fix` Phase 2; Wisdom-Datei-Schreibpfad widersprach der „ausschließlich"-Schreibgrenze von `sf-investigate`) und ein Hinweis (fehlende Option „weitere Investigation nötig" im Report-Template) wurden direkt eingearbeitet. Kein externer Review-Report nötig.

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
| Wartbarkeit |        0 |       0 |       0 |

### Befunde

- Architektur (Hinweis): Die Extraktion nach `_shared/` berührt `sf-fix`. Risiko durch den im Validierungsplan vorgesehenen `dist`-Vorher/Nachher-Vergleich abgedeckt; Verhalten muss äquivalent bleiben.
- Fehlerfälle (Hinweis): Der „nicht reproduzierbar"-Pfad ist als Edge Case behandelt, damit die Investigation nicht blockiert, sondern mit reduzierter Konfidenz und nächsten Schritten abschließt.
- Scope (Hinweis): sf-plan-Routing-Integration und Plan-Referenz-Konsum sind bewusst ausgeklammert, um den Plan auf den eigentlichen Skill zu fokussieren.
