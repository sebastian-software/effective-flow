# 0049: Goal-Integration für sf-apply-review

**Planungsstatus:** Umgesetzt
**Quelle:** /plan
**Empfohlener Workflow:** Feature (`/build`)

## Anforderung

`sf-apply-review` arbeitet alle Findings in einem Loop ab und ist damit ein guter Kandidat für die Goal-getriebene Abschlusssteuerung (vgl. `0047`). In `0047` wurde der Skill bewusst ausgeklammert, weil interaktive Gates **nach** dem Emissionspunkt einen autonomen `/goal`-Lauf blockieren würden.

Beim genauen Lesen gibt es **zwei** solcher Stash-Gates plus einen unbeschränkten Loop:

- **Phase 6 (Stash-Bereinigung):** räumt git-Stashes auf, die während der Delegation in Phase 4 entstehen (Pre-Commit-Hooks, `git stash` in Sub-Skills). Sie vergleicht `git stash list` mit der Phase-1-Baseline, ordnet neue Stashes Findings zu und klassifiziert sie: **A** (Inhalt vollständig im Finding-Commit → Auto-Drop ohne Frage), **B** (umgesetzt, aber Extra-Änderungen), **C** (Finding fehlgeschlagen), **D** (keine Zuordnung / Strategie „Keine Commits"). Für B/C/D fragt sie interaktiv pro Stash: Anwenden und löschen / Verwerfen / Behalten.
- **Phase 4.3 (bedingt):** bricht ein Finding mit unsauberem Arbeitsbaum ab, fragt der Workflow vor dem nächsten Finding „stashen oder verwerfen?".
- **Phase 7:** unbeschränkter „wiederhole bis fehlerfrei"-Loop der finalen Validierung.

Konkrete Stashes existieren zu Beginn noch nicht, also lässt sich das Gate **nicht 1:1** an den Anfang verlegen. Die **Entscheidung** wird stattdessen als vorab gesetzte Policy festgelegt – analog zur bereits vorab entschiedenen Commit-Strategie. Nach einem einzigen Up-front-Strategie-Gate (Commit-Strategie + Stash-Policy) laufen die Phasen 3–8 autonom unter nativem `/goal`.

## Architekturentscheidungen

- **Neue Config `applyReview.stashPolicy`** mit Werten `interactive` | `keep` | `discard` | `apply`, analog zum bestehenden `applyReview.defaultCommitStrategy`. Default **`interactive`** = heutiges Verhalten unverändert. Autonom-sicherer Wert für unbeaufsichtigte Läufe: **`keep`** (kein Datenverlust, keine Blockade).
- **Config-Migration:** `stashPolicy` wird über den bestehenden `applyReview`-Migrationsmechanismus nicht-destruktiv mit `interactive` ergänzt, damit Bestandsverhalten erhalten bleibt. `configMigration` in `.sf-plugin/memory.json` wird wie gehabt fortgeschrieben.
- **Ein Up-front-Strategie-Gate in Phase 2:** Die Stash-Policy wird in dieselbe Phase-2-Entscheidung wie die Commit-Strategie integriert (gefragt nur, wenn `stashPolicy` nicht gültig in der Config gesetzt ist). Es entsteht kein separates spätes Gate mehr.
- **Phase 6 nutzt die Policy** (Klasse A bleibt unverändert Auto-Drop):
  - `interactive` → heutige Stash-Frage pro Stash (gated Default).
  - `keep` → Stash unverändert behalten und in Phase 8 berichten.
  - `discard` → `git stash drop`.
  - `apply` → `git stash pop`; bei Merge-Konflikt **nicht** droppen, sondern an den User eskalieren (auch im Autonom-Fall – Datenintegrität vor Autonomie).
- **Phase 4.3 nutzt dieselbe Policy:**
  - `interactive` → heutige Frage (stashen/verwerfen).
  - `keep` → mit Finding-ID stashen (Arbeit erhalten, Baum sauber, weiter).
  - `discard` → verwerfen.
  - `apply` → hier nicht sinnvoll (es geht ums Saubermachen vor dem nächsten Finding, nicht ums Zurückspielen); wird wie `keep` als „stashen" behandelt und so dokumentiert.
- **goal-completion-Baustein einbinden** (`include goal-completion`) und den Phase-7-Loop „wiederhole bis fehlerfrei" als beschränkten Loop mit Eskalation formulieren.
- **`/goal`-String-Emission** direkt nach dem Phase-2-Strategie-Gate; deckt die Phasen 3–8 ab. Selbsttragend: referenziert den Report und weist die verbleibenden Phasen an.
- **Abschlussbedingung von `sf-apply-review`:** alle umsetzbaren Findings verarbeitet (umgesetzt / ADR / fehlgeschlagen protokolliert), Report aktualisiert (Phase 5), Stash-Reste gemäß Policy behandelt (Phase 6), finale Validierung grün (Phase 7).
- **Gated Default unverändert:** Bei `stashPolicy = interactive` verhält sich der Skill exakt wie heute. Der einzige verbleibende Stopp-Punkt nach dem Gate ist der dokumentierte `apply`-Merge-Konflikt.

## Betroffene Dateien

| Datei                             | Beschreibung                                                                                                                                                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/sf-apply-review/SKILL.md` | Config-Schema um `stashPolicy` + Migration erweitern; Phase 2 zum kombinierten Strategie-Gate (Commit + Stash) mit `/goal`-String-Emission; Phase 4.3 und Phase 6 (Klassen B/C/D) policy-gesteuert; `include goal-completion`; Phase-7-Loop begrenzen; Phase 8 berichtet behaltene Stashes. |
| `README.md`                       | `applyReview.stashPolicy` in der Config-Doku und in den Default-/Schnell-Profil-JSON-Beispielen ergänzen; `sf-apply-review` im Abschnitt „Goal-getriebene Abschlusssteuerung" als nun einbezogen nennen.                                                                                    |
| `TODO.md`                         | Den Follow-up-Eintrag für `sf-apply-review` als erledigt markieren (durch den umsetzenden Workflow, außerhalb der Plan-Schreibgrenze).                                                                                                                                                      |

`dist/` ist generiert und gitignored. `build.mjs` braucht keine Änderung (bestehender `include`-Mechanismus). Der `goal-completion`-Baustein selbst (`skills/_shared/goal-completion.md`) bleibt unverändert; er ist generisch genug.

## Implementierungsdetails

### Vorgehen

1. Config-Schema in `sf-apply-review` um `applyReview.stashPolicy` erweitern (Werte, Default `interactive`, nicht-destruktive Migration analog `defaultCommitStrategy`).
2. Phase 2 zum kombinierten Up-front-Strategie-Gate machen: Commit-Strategie (bestehend) und Stash-Policy am selben Punkt; ask nur bei fehlendem gültigem Config-Wert. Danach den `/goal`-String emittieren.
3. Phase 4.3: die interaktive stash/discard-Frage durch policy-gesteuertes Verhalten ersetzen (`interactive` → weiterhin fragen).
4. Phase 6: Klassen B/C/D policy-gesteuert; Klasse A unverändert Auto-Drop; `apply`-Konflikt eskaliert.
5. `include goal-completion` einbinden und den Phase-7-Loop begrenzen.
6. Phase 8: automatisch behandelte und behaltene Stashes mit `git stash`-Referenz berichten.
7. README aktualisieren; `node build.mjs` und `pnpm agent:check` ausführen.

### Edge Cases

- **`apply` mit Merge-Konflikt:** Stash nicht droppen, an User eskalieren – auch im Autonom-Lauf. Einziger dokumentierter Rest-Stopp.
- **`keep`:** Stash-Reste bleiben erhalten; Phase 8 listet sie mit Referenz, damit der User sie manuell prüfen kann.
- **`discard`:** potenzieller Datenverlust – nur bei expliziter Wahl, niemals Default.
- **Bestandsconfig ohne `stashPolicy`:** Migration ergänzt `interactive`; Verhalten unverändert.
- **Phase 4.3 mit `apply`:** wie `keep`/stashen behandeln (apply dort nicht sinnvoll).
- **Klasse A:** bleibt in allen Policies Auto-Drop (Inhalt ist nachweislich im Commit, kein Risiko).

## Akzeptanzkriterien

- [ ] Config-Key `applyReview.stashPolicy` (`interactive`/`keep`/`discard`/`apply`, Default `interactive`) ist im Schema von `sf-apply-review` dokumentiert und wird nicht-destruktiv migriert.
- [ ] Phase 2 erfragt Commit-Strategie und Stash-Policy am selben Up-front-Gate (nur bei fehlendem Config-Wert) und emittiert danach den `/goal`-String mit Spanne Phasen 3–8.
- [ ] Phase 4.3 und Phase 6 (Klassen B/C/D) handeln gemäß `stashPolicy` ohne Rückfrage, außer bei `interactive`; Klasse A bleibt Auto-Drop.
- [ ] Bei `stashPolicy ≠ interactive` folgt nach dem Phase-2-Gate kein interaktives Approval-Gate mehr, außer dem dokumentierten `apply`-Merge-Konflikt.
- [ ] `sf-apply-review` bindet `goal-completion` ein; der Phase-7-Loop ist begrenzt und eskaliert bei anhaltendem Fehlschlag.
- [ ] Bei `stashPolicy = interactive` ist das Verhalten unverändert zum heutigen Stand.
- [ ] README dokumentiert `stashPolicy` und nennt `sf-apply-review` im Goal-Abschnitt.
- [ ] `node build.mjs` erfolgreich; `goal-completion` ist in `dist/codex` und `dist/claude` für `sf-apply-review` enthalten; `pnpm agent:check` ohne Fehler.

## Validierungsplan

- `node build.mjs` ausführen; in `dist/` prüfen, dass der `goal-completion`-Text in `sf-apply-review` beider Plattformen enthalten ist.
- Sichtprüfung der policy-gesteuerten Pfade in Phase 2, 4.3, 6 und 7 anhand der Zeilenanker.
- `pnpm agent:check` (oxfmt) für Formatierung.

## Annahmen und offene Punkte

- Der bestehende `applyReview`-Config-Migrationsmechanismus (Phase 1, `configMigration` in `memory.json`) kann um `stashPolicy` erweitert werden, analog zu `defaultCommitStrategy`.
- „In die Frage integrieren" wird so umgesetzt, dass die Stash-Policy am selben Phase-2-Gate wie die Commit-Strategie erfragt wird (eine gemeinsame Up-front-Strategie-Entscheidung), nicht als separater späterer Gate. Ob als ein kombiniertes oder zwei direkt benachbarte Auswahl-Asks gerendert wird, entscheidet die Umsetzung; empfohlen sind zwei gekoppelte Auswahlfragen am selben Gate, weil das Kreuzprodukt aus Commit-Strategie × Stash-Policy für eine einzelne Optionsliste zu groß ist.
- **Überlappung mit Plan `0048` (Worktree-Integration):** Beide Pläne berühren bei `sf-apply-review` die Phase-2-Region (Commit-Strategie / Worktree-Setup). Die Themen sind orthogonal (Stash-Policy vs. Worktree-Handoff), sollten aber beim Umsetzen koordiniert werden, falls beide gleichzeitig landen.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       1 |
| Security    |        0 |       0 |       0 |
| Datenschutz |        0 |       1 |       0 |
| Fehlerfälle |        0 |       0 |       1 |
| Testbarkeit |        0 |       0 |       0 |
| Scope       |        0 |       0 |       1 |
| Wartbarkeit |        0 |       0 |       0 |

### Befunde

- **Datenschutz/Datenintegrität (Wichtig):** `discard` kann Arbeit unwiederbringlich verwerfen. Eingearbeitet: `discard` ist niemals Default, der Autonom-Default ist `keep`, und `apply`-Konflikte eskalieren statt zu droppen.
- **Fehlerfälle (Hinweis):** `apply` in Phase 4.3 ist semantisch unpassend; im Plan als `keep`-Verhalten festgelegt.
- **Architektur (Hinweis):** Eine einzige Policy steuert zwei Stellen (4.3 und 6). Bewusst so gewählt, um die Up-front-Entscheidung schlank zu halten.
- **Scope (Hinweis):** Phase-7-Loop-Begrenzung ist eng mit `0047` verwandt, hier aber nötig, damit `sf-apply-review` vollständig goal-fähig wird.

## Testergebnisse

**Datum:** 2026-06-29

- `node build.mjs`: erfolgreich – 13 Skills / 9 Agents (Codex) und 13 Commands / 9 Agents (Claude Code).
- `pnpm agent:check` (oxfmt): keine Formatierungsfehler über 91 Dateien.
- Einbettung verifiziert: Der Baustein „Goal-getriebene Abschlusssteuerung" erscheint in `sf-apply-review` in beiden Plattform-Ausgaben; keine unaufgelösten `{{…}}`-Platzhalter.
- Umgesetzt: `applyReview.stashPolicy` (Schema, Defaults, gültige Werte, Migration); Phase 2 kombiniertes Commit-/Stash-Strategie-Gate mit `/goal`-String (Phasen 3–8); Phase 4.3 und Phase 6 (Klassen B/C/D) policy-gesteuert, Klasse A weiter Auto-Drop; `goal-completion` eingebunden; Phase-7-Loop begrenzt; Phase 8 berichtet behaltene Stashes; README dokumentiert `stashPolicy` und nennt `sf-apply-review` im Goal-Abschnitt.

## Review-Findings

**Datum:** 2026-06-29
**Reviewer:** sf-nodejs-reviewer

### Zusammenfassung

| Status           | Anzahl |
| ---------------- | -----: |
| Behoben          |      3 |
| Bewusst belassen |      1 |

Reviewer-Findings: 1 Wichtig (Absolut-Aussage „kein weiteres Gate" übersah Cherry-Pick-Konflikt der Worktrees-Strategie und seltenen verwaisten Lock → in `sf-apply-review` und README als konfliktbedingte Eskalationen reframed) und 3 Hinweise. Behoben: das Wichtig-Finding, der zweite Eskalations-Hinweis (verwaister Lock, in dieselbe Reframing-Aussage aufgenommen) und das veraltete Migrations-Beispiel (`addedKeys` auf den historischen Stand zurückgesetzt). Bewusst belassen: der Hinweis zu den Phase-6-Klassen-Bullets B/C/D – die Intro-Klausel rahmt sie bereits explizit als `interactive`-Fall. Keine offenen Findings, kein externer Review-Report.
