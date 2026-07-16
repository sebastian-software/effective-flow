# 0047: Goal-getriebene Abschlusssteuerung

**Planungsstatus:** Umgesetzt
**Quelle:** /plan
**Empfohlener Workflow:** Feature (`/build`)

## Anforderung

Die verstreuten Ad-hoc-Schleifen der Workflow-Skills („wiederhole bis Validator
grün", „zurück zu Phase 3“, „behebe und wiederhole Phase 4“) sollen durch ein
einheitliches, geteiltes Goal-Konzept ersetzt werden. Das Konzept übernimmt die
drei Prinzipien des nativen `/goal` (Codex und Claude Code), löst sich aber von
der konkreten `/goal`-Mechanik, weil ein Skill das native `/goal` nicht von innen
aufrufen kann:

1. **Explizite, messbare Abschlussbedingung**, vorab deklariert.
2. **Benannte unabhängige Verifikation** (Fremd- statt Selbsteinschätzung).
3. **Beschränkter Loop** mit klarer Terminierung und Escape-Hatch.

Zusätzlich gibt jeder geeignete Workflow an seiner Freigabe-Grenze einen
copy-paste-baren `/goal`-String aus, mit dem der User den Rest des Workflows
optional unter dem nativen `/goal` autonom laufen lassen kann (z. B. nachts).

### Begründung der Workflow-Empfehlung

Empfohlen wird **Feature (`/build`)**, nicht `/refactor`. Zwar ist der größte Teil
der Arbeit refactoring-artig (verstreute Loop-Formulierungen in einen geteilten
Baustein zusammenziehen), doch der Auftrag enthält eine **bewusste
Verhaltensänderung** (beschränkter Loop mit Escape-Hatch statt unbeschränktem
„wiederhole bis“) und eine **neue nutzersichtbare Ausgabe** (der `/goal`-String).
Beides sprengt die Verhaltens-Invarianz-Regel von `/refactor`. Wer den
`/goal`-String und die geänderte Loop-Terminierung als bewusst akzeptierte
Änderung betrachtet, kann den Plan alternativ über `/refactor` umsetzen; die
restlichen Umbauten sind dafür geeignet.

## Architekturentscheidungen

- **Neuer geteilter Baustein `skills/_shared/goal-completion.md`**, eingebunden
  über einen `include`-Fence (`goal-completion`). Konsistent mit dem bestehenden
  `_shared`-Muster (`plan-status`, `completion-protocol`, `pre-commit-gate` …).
  Der Build (`build.mjs`) löst `include`-Fences gegen `skills/_shared/<name>.md`
  auf; eine neue Datei wird damit ohne Build-Änderung in beide Plattformen
  (`dist/codex`, `dist/claude`) eingebettet.
- **Plattformneutralität:** Der Baustein ist reiner Anweisungstext und nennt
  keine plattformspezifischen Befehle. Der `/goal`-String nutzt die auf beiden
  Plattformen identische Form `/goal <text>` und bleibt damit portabel.
- **Approval-Gates bleiben unverändert.** Goal ersetzt ausschließlich die
  internen Validierungs-/Regressions-Loops, nicht die bewussten User-Gates. Der
  gated Default-Betrieb (ohne natives `/goal`) bleibt das Standardverhalten.
- **Emissionspunkt = Freigabe-Grenze.** Der `/goal`-String wird genau dort
  ausgegeben, wo der Workflow ohnehin auf Freigabe wartet und die messbare
  Bedingung (aus Akzeptanzkriterien/Validierungsplan) bereits feststeht. Der User
  wählt den Modus durch die Art seiner Antwort: normale Freigabe → gated;
  Einfügen des `/goal`-Strings → autonom.
- **Selbsttragender String:** Der ausgegebene `/goal`-String referenziert die
  Plan-Datei und weist an, die verbleibenden Workflow-Phasen zu durchlaufen
  (nicht „mach die Kriterien irgendwie grün“).
- **Differenzierte Tiefe je Skill:**
  - Voll (Bedingung + unabhängige Verifikation + beschränkter Loop +
    `/goal`-String): `sf-build`, `sf-fix`, `sf-refactor`, `sf-docs`,
    `sf-maintain`. Bei allen fünf liegt das einzige bzw. letzte Gate genau an der
    Freigabe-Grenze, danach folgt kein weiteres Gate — der Autonom-Modus läuft
    also ohne Stall durch.
  - Abgeschwächt (explizite, unabhängig geprüfte Abschlussbedingung, **kein**
    Autonom-Loop, **kein** `/goal`-String): `sf-review` (produziert nur einen
    Report), `sf-plan` (erzeugt die Bedingung, läuft nicht darauf zu).
- **Bewusst ausgeklammert:** `sf-apply-review` (späteres Stash-Gate in Phase 6
  nach der Commit-Strategie → bräuchte eine „spätere Gates → sichere Defaults“-
  Sonderregel). Als TODO in `TODO.md` vermerkt, separate spätere Umsetzung.
- **Utilities/Router** (`sf-commit`, `sf-version`, `sf-open-plans`,
  `sf-apply-plan`) bleiben unberührt — keine Completion-Loop-Semantik.

## Betroffene Dateien

| Datei                               | Beschreibung                                                                                                                                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/_shared/goal-completion.md` | **Neu.** Definiert Abschlussbedingung, unabhängige Verifikation, beschränkten Loop (Iterationsobergrenze + Escape-Hatch) und das Format des optionalen `/goal`-Strings.                                                           |
| `skills/sf-build/SKILL.md`          | Phase 5 Loop „Wiederhole bis der Validator bestanden meldet“ (Z. 268) und Phase-6-Abschlussbedingung auf den Baustein umstellen; `/goal`-String am Freigabe-Gate (Phase 1, Z. 232) ergänzen; `include goal-completion` einbinden. |
| `skills/sf-fix/SKILL.md`            | Phase 5 „behebe sie und wiederhole Phase 4“ (Z. 156) auf den Baustein umstellen; `/goal`-String am Fix-Strategie-Gate (Z. 115) ergänzen; Baustein einbinden.                                                                      |
| `skills/sf-refactor/SKILL.md`       | Phase-6-Regressions-Loop (Z. 178–181) auf den Baustein umstellen; `/goal`-String am Plan-Freigabe-Gate (Z. 104) ergänzen; Baustein einbinden.                                                                                     |
| `skills/sf-docs/SKILL.md`           | Phase-3-Reparatur-Loop (Z. 141) auf den Baustein umstellen; `/goal`-String am Doku-Plan-Gate (Z. 107) ergänzen; Baustein einbinden.                                                                                               |
| `skills/sf-maintain/SKILL.md`       | Phase-3-Reparatur-Loop (Z. 131–134) auf den Baustein umstellen; `/goal`-String am Update-Auswahl-Gate (Z. 98) ergänzen; Baustein einbinden.                                                                                       |
| `skills/sf-review/SKILL.md`         | Abgeschwächte Form: explizite, unabhängig geprüfte Abschlussbedingung für den Report ergänzen. Kein Autonom-Loop, kein `/goal`-String.                                                                                            |
| `skills/sf-plan/SKILL.md`           | Abgeschwächte Form: Akzeptanzkriterien so formulieren lassen, dass sie als Goal-Bedingung taugen (Quelle des späteren `/goal`-Strings). Minimaler Hinweis, keine Loop-Mechanik.                                                   |
| `README.md`                         | Den neuen `_shared`-Baustein in der Build-/Platzhalter-Sektion dokumentieren und die `/goal`-String-Nutzung kurz beschreiben (nutzerrelevante Verhaltensänderung).                                                                |
| `TODO.md`                           | Follow-up-Eintrag für `sf-apply-review` (wird im Zuge dieses Plans bereits gesetzt).                                                                                                                                              |

`dist/` ist generiert und gitignored — keine manuelle Änderung. `build.mjs`
benötigt voraussichtlich keine Änderung (bestehender `include`-Mechanismus).

## Implementierungsdetails

### Vorgehen

1. `skills/_shared/goal-completion.md` schreiben: Begriffe und Ablauf der drei
   Prinzipien, die Loop-Obergrenze samt Eskalations-/Escape-Verhalten und das
   `/goal`-String-Format als wiederverwendbarer Textbaustein.
2. In den fünf Voll-Skills jeweils den `include`-Fence einbinden, die bisherige
   Ad-hoc-Loop-Formulierung durch den Verweis auf das Goal-Konzept ersetzen und
   am Freigabe-Gate die `/goal`-String-Ausgabe ergänzen.
3. In `sf-review` und `sf-plan` die abgeschwächte Form ergänzen.
4. `README.md` aktualisieren.
5. `node build.mjs` ausführen und prüfen, dass der Baustein in beiden
   Plattform-Ausgaben in den betroffenen Skills auftaucht.
6. `pnpm agent:check` (oxfmt) ausführen; bei Bedarf `pnpm format`.

### `/goal`-String-Format

Der String referenziert die Plan-Datei, nennt die messbare Abschlussbedingung und
weist die verbleibenden Phasen an. Minimal-Skizze (kein finaler Wortlaut):

`/goal Setze docs/plan/NNNN-...md vollständig um: alle Akzeptanzkriterien erfüllt, Build/Lint/Tests grün, Reviewer ohne offene kritische Findings. Nichts außerhalb des Plan-Scopes ändern. Stoppe, wenn alle Kriterien halten.`

### Edge Cases

- **Loop konvergiert nicht:** Nach der definierten Iterationsobergrenze bricht der
  Baustein den internen Loop ab und eskaliert an den User, statt unbegrenzt zu
  laufen.
- **Autonom-Lauf trifft späteres Gate:** Tritt bei den fünf Voll-Skills nicht auf
  (kein Gate nach dem Emissionspunkt). Für `sf-apply-review` bewusst
  ausgeklammert.
- **Kein natives `/goal` vorhanden:** Der gated Default-Betrieb funktioniert
  unverändert; der `/goal`-String ist dann nur ein ungenutzter Hinweis.
- **Plattform-Abweichung der `/goal`-Syntax:** Der String bleibt auf den
  Bedingungstext beschränkt, der auf beiden Plattformen gleich interpretiert wird.

## Akzeptanzkriterien

- [ ] `skills/_shared/goal-completion.md` existiert und definiert Abschlussbedingung, unabhängige Verifikation, beschränkten Loop (Iterationsobergrenze + Escape-Hatch) und `/goal`-String-Format.
- [ ] `sf-build`, `sf-fix`, `sf-refactor`, `sf-docs`, `sf-maintain` binden den Baustein über `include goal-completion` ein und enthalten keine verstreute Ad-hoc-Loop-Formulierung mehr an den genannten Stellen.
- [ ] Jeder der fünf Voll-Skills gibt an seiner Freigabe-Grenze einen `/goal`-String aus, der die Plan-Datei referenziert und die restlichen Phasen anweist.
- [ ] Die bestehenden Approval-Gates sind unverändert; der gated Default-Betrieb bleibt Standard.
- [ ] `sf-review` und `sf-plan` enthalten die abgeschwächte Form (explizite, unabhängig geprüfte Abschlussbedingung) ohne Autonom-Loop und ohne `/goal`-String.
- [ ] `sf-apply-review` ist nicht geändert; ein Follow-up-TODO steht in `TODO.md`.
- [ ] `node build.mjs` läuft fehlerfrei; der Baustein-Text erscheint in `dist/codex` und `dist/claude` in den fünf Voll-Skills.
- [ ] `pnpm agent:check` meldet keine Formatierungsfehler.

## Validierungsplan

- `node build.mjs` ohne Fehler ausführen; in `dist/` prüfen, dass der eingebettete
  Baustein-Text in den fünf Voll-Skills vorhanden ist (z. B. per `grep`).
- Sichtprüfung der ersetzten Loop-Stellen anhand der oben genannten Zeilenanker.
- `pnpm agent:check` (oxfmt `--check`) für Formatierung.

## Annahmen und offene Punkte

- Natives `/goal` ist auf Codex (vom User für 0.142.4 bestätigt) und aktuellem
  Claude Code regulär als `/goal <text>` verfügbar; kein Feature-Flag nötig.
- Der `build.mjs`-`include`-Mechanismus löst neue `_shared`-Dateien ohne
  Build-Anpassung auf (durch bestehende Includes belegt).
- Der finale Wortlaut von Baustein und `/goal`-String wird in der Umsetzung
  festgelegt; dieser Plan legt nur Struktur und Anforderungen fest.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       1 |
| Security    |        0 |       0 |       0 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       0 |       1 |
| Testbarkeit |        0 |       1 |       0 |
| Scope       |        0 |       0 |       1 |
| Wartbarkeit |        0 |       0 |       0 |

### Befunde

- **Testbarkeit (Wichtig):** Das Repo hat keine Unit-Tests, nur `oxfmt`. Die
  Akzeptanzkriterien sind deshalb bewusst auf build-/grep-/Sichtprüfbare Aussagen
  gestützt statt auf Testläufe. Eingearbeitet im Validierungsplan.
- **Architektur (Hinweis):** Der neue Baustein erhöht die Zahl der `_shared`-
  Includes; vertretbar, da konsistent mit dem etablierten Muster.
- **Fehlerfälle (Hinweis):** Der Autonom-Modus hängt am korrekten Verhalten des
  nativen `/goal`. Da der gated Default unberührt bleibt, ist das Restrisiko auf
  den opt-in-Autonom-Fall begrenzt.
- **Scope (Hinweis):** `sf-apply-review` ist bewusst ausgeklammert und als TODO
  ausgelagert, um Scope Creep zu vermeiden.

## Testergebnisse

**Datum:** 2026-06-29

- `node build.mjs`: erfolgreich – 12 Skills / 9 Agents (Codex) und 12 Commands / 9 Agents (Claude Code).
- `pnpm agent:check` (oxfmt): keine Formatierungsfehler über 86 Dateien.
- Einbettung verifiziert: Der Baustein „Goal-getriebene Abschlusssteuerung“ erscheint in genau den fünf Voll-Skills (`sf-build`, `sf-fix`, `sf-refactor`, `sf-docs`, `sf-maintain`) in beiden Plattform-Ausgaben; `sf-review` und `sf-plan` binden ihn korrekt nicht ein.
- Platzhalter-Auflösung verifiziert: `{{AGENT:sf-code-validator}}` → `/code-validator` (Claude) bzw. `sf-code-validator` (Codex); keine unaufgelösten Platzhalter; der `/goal`-Beispielblock ist intakt.

## Review-Findings

**Datum:** 2026-06-29
**Reviewer:** sf-nodejs-reviewer

### Zusammenfassung

| Status                  | Anzahl |
| ----------------------- | -----: |
| Behoben                 |      5 |
| Offen / Nicht umgesetzt |      0 |

Alle Reviewer-Findings wurden vor Abschluss behoben – 1 Wichtig (README-Strukturbruch durch die neue H2-Überschrift) und 4 Hinweise (Reviewer-Prüfung in reviewerlosen Workflows, Auswahl-Gate in `sf-maintain`, stale `{{INCLUDE:…}}`-Kommentar im Struktur-Baum, Emissionsreihenfolge des `/goal`-Strings). Keine offenen Findings, deshalb kein externer Review-Report.
