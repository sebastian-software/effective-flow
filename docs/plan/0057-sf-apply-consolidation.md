# 0057: sf-apply Skill – Router über die apply-\* Skills

**Planungsstatus:** Umgesetzt
**Quelle:** /plan
**Empfohlener Workflow:** Feature (`/build`)

## Anforderung

Es gibt heute drei getrennte Umsetzungs-Router: `{{SKILL:sf-apply-plan}}` (Plan-Dateien
aus `docs/plan/`), `{{SKILL:sf-apply-review}}` (Review-Report-Dateien lokal bzw.
Finding-/Epic-Issues remote) und `{{SKILL:sf-apply-issues}}` (frei geschriebene
GitHub-/Forgejo-Issues und Container-Issues). Der User muss vorab selbst wissen,
welcher der drei Skills für seine Quelle zuständig ist.

Ziel ist ein neuer, dünner Einstiegs-Skill `{{SKILL:sf-apply}}`, der eine beliebige
übergebene Quelle **automatisch klassifiziert** und an den passenden bestehenden Skill
**delegiert**. Die eigentliche Typ-Erkennung wird in einen neuen geteilten Baustein
`apply-source-detection` gezogen und **direkt konsolidiert**: auch die drei
bestehenden Skills nutzen diesen Baustein künftig für ihre Argument-Klassifikation,
sodass die Erkennung nur noch an einer Stelle lebt.

Begründung der Workflow-Empfehlung: Es entsteht neue Funktionalität (ein zusätzlicher
Skill plus ein neuer geteilter Baustein) – daher Feature (`/build`). Die Anpassung der
drei bestehenden Skills ist Teil desselben Vorhabens (gemeinsamer Baustein), aber
untergeordnet.

### Abgrenzung (Nicht-Ziele)

- Die drei bestehenden Skills bleiben eigenständig und direkt aufrufbar; sie werden
  **nicht** entfernt und **nicht** deprecated.
- Kein Inline-Merge der umfangreichen Phasenlogik (Worktrees, Stash-Policy, ADRs,
  Klassifikation) in einen Mega-Skill. `{{SKILL:sf-apply}}` ist reine Routing-Schicht.
- Keine Änderung an der fachlichen Umsetzung, den PR-/Commit-Strategien oder der
  Tracker-Anbindung der bestehenden Skills – nur die vorgelagerte Argument-Erkennung
  wird auf den gemeinsamen Baustein umgestellt.

## Architekturentscheidungen

- **Router statt Merge:** `{{SKILL:sf-apply}}` (`type: orchestrator`) delegiert an
  `{{SKILL:sf-apply-plan}}` / `{{SKILL:sf-apply-review}}` / `{{SKILL:sf-apply-issues}}`,
  analog zum bestehenden Muster in `{{SKILL:sf-apply-plan}}` Phase 2 (Aufruf
  `{{SKILL:sf-build}} docs/plan/…`). Kein eigener Umsetzungscode.
- **Ein geteilter Erkennungs-Baustein:** Neuer Include `apply-source-detection.md`
  wird die einzige Quelle der Wahrheit für „welcher Apply-Quelltyp ist dieses
  Argument". Er wird per ` ```include ``` ` von `{{SKILL:sf-apply}}` und den drei
  bestehenden Skills eingebunden (Build inlint ihn automatisch).
- **Zweistufige Erkennung**, damit rein lokale Skills keine Tracker-I/O auslösen:
  - **Stufe A (syntaktisch, nur Dateisystem):** klassifiziert das Argument in
    `plan`, `review-report`, eine Issue-Referenz oder `none`.
  - **Stufe B (Tracker, nur für Issue-Referenzen):** verfeinert eine Issue-Referenz
    in `review-epic`, `review-finding`, `container-issue` oder `plain-issue`. Stufe B
    baut auf der Host-/CLI-Erkennung aus `issue-tracker.md` auf und dupliziert sie
    nicht.
- **Kanonische Quelltypen (Enum):** `plan`, `review-report`, `review-epic`,
  `review-finding`, `container-issue`, `plain-issue`; Sonderfälle `none` (kein/leeres
  Argument) und `ambiguous` (nicht eindeutig auflösbar).
- **Präzedenz Label vor Body-Struktur:** Ein `review-epic` enthält – wie ein
  generisches Container-Issue – eine `- [ ] #NNN`-Checkliste. Das Label
  `sf-review-epic` bzw. `sf-review-finding` ist der entscheidende, sichere
  Diskriminator und hat Vorrang vor der Body-Struktur.
- **Konsistenz mit `issue-tracker.md`:** Die dortige Regel „Argumenttyp überschreibt
  den Config-Modus" bleibt gültig; der neue Baustein liefert genau diesen Argumenttyp.
- **Automatische Registrierung:** `build.mjs` entdeckt `sf-*`-Verzeichnisse
  automatisch. Ein neues Verzeichnis `skills/sf-apply/` mit `SKILL.md` genügt; keine
  manuelle Registrierung nötig.

## Betroffene Dateien

| Datei                                      | Beschreibung                                                                                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `skills/_shared/apply-source-detection.md` | **Neu.** Geteilter Baustein: kanonisches Quelltyp-Enum, zweistufige Erkennung (Stufe A/B), Präzedenz, Ownership-Mapping, Ambiguitäts-/Fallback-Regeln.                                                                   |
| `skills/sf-apply/SKILL.md`                 | **Neu.** Dünner Router (`type: orchestrator`): bindet den Baustein ein, klassifiziert das Argument, meldet den erkannten Typ und delegiert an den zuständigen Skill.                                                     |
| `skills/sf-apply-plan/SKILL.md`            | **Ändern.** Argument-Erkennung in Phase 1 auf den Baustein umstellen (Stufe A); Fremdtypen an den zuständigen Skill verweisen. `plan-reference-routing` bleibt für die tiefe Status-/Empfehlungsprüfung.                 |
| `skills/sf-apply-review/SKILL.md`          | **Ändern.** Bisherigen Abschnitt „Argument-Erkennung und Modusbestimmung“ durch den Baustein ersetzen (Stufe A + B); report/epic/finding/list-Fälle daraus ableiten.                                                     |
| `skills/sf-apply-issues/SKILL.md`          | **Ändern.** Argument-Prüfung in Phase 1/2 auf den Baustein umstellen; `plan`/`review-report` sowie `review-epic`/`review-finding` an den zuständigen Skill verweisen, `container-issue`/`plain-issue` selbst übernehmen. |
| `build.mjs`                                | **Optional.** Plugin-Beschreibungstext (`plugins[].description`, Skill-Aufzählung) um `apply` ergänzen. Reiner Anzeigetext, keine Funktionsänderung.                                                                     |

`dist/` ist generiert und wird nicht von Hand geändert; die neuen Artefakte
(`dist/claude/**/commands/apply.md`, `dist/codex/skills/sf-apply/SKILL.md`) entstehen
beim Build.

## Implementierungsdetails

### Vorgehen

1. Baustein `skills/_shared/apply-source-detection.md` schreiben (Erkennungslogik,
   siehe unten).
2. Router-Skill `skills/sf-apply/SKILL.md` schreiben, der den Baustein einbindet und
   delegiert.
3. Die drei bestehenden Skills auf den Baustein umstellen (nur die vorgelagerte
   Argument-Klassifikation; type-spezifische Tiefenlogik bleibt).
4. Optional: Plugin-Beschreibung in `build.mjs` ergänzen.
5. Build ausführen und Artefakte prüfen (siehe Validierungsplan).

### Baustein `apply-source-detection`

Der Baustein beschreibt (in Prosa/Tabellen, ohne ausführbaren Code) folgenden Ablauf.

**Stufe A – syntaktische Klassifikation (nur Dateisystem, keine Tracker-I/O):**

| Argument                                                                     | Ergebnis-Typ             |
| ---------------------------------------------------------------------------- | ------------------------ |
| leer / nicht vorhanden                                                       | `none`                   |
| Pfad, Dateiname oder vierstellige Nummer, der/die unter `docs/plan/` auflöst | `plan`                   |
| `*.md`-Pfad unter `.sf-plugin/review/`                                       | `review-report`          |
| Issue-Referenz: bare Nummer, `#123` oder Issue-URL (auch mehrere)            | → Stufe B                |
| Token passt gleichzeitig zu einer Plan- **und** einer Review-Datei           | `ambiguous`              |
| Pfad/Token, der zu keiner der Kategorien auflöst                             | `ambiguous` (nachfragen) |

Trennschärfe Plan vs. Report: primär über das Verzeichnis (`docs/plan/` vs.
`.sf-plugin/review/`), sekundär über den Kopf-Marker (`**Planungsstatus:**` /
`**Plan status:**` vs. `### [R-XXXXXXX]`-Blöcke). Nummernauflösung analog zu
`plan-reference-routing` (Pfad / Dateiname / Nummer / Slug-Fallback).

**Stufe B – Issue-Subtyp (Tracker, nur für Issue-Referenzen):**

Setzt Host-/CLI-Erkennung und Verfügbarkeitsprüfung aus `issue-tracker.md` voraus;
liest Labels und Body je Issue einmal frisch.

| Signal (in dieser Präzedenz)                            | Ergebnis-Typ      |
| ------------------------------------------------------- | ----------------- |
| Label `sf-review-epic`                                  | `review-epic`     |
| Label `sf-review-finding`                               | `review-finding`  |
| kein Review-Label, Body enthält `- [ ] #NNN`-Checkliste | `container-issue` |
| sonst                                                   | `plain-issue`     |

Sekundärsignal bei fehlendem Label (z. B. manuell entfernt): Titel `[R-XXXXXXX]`
zusammen mit einem `**Signatur**`-Feld im Body ⇒ wie `review-finding` behandeln.
Bleibt es danach unklar ⇒ `ambiguous`.

**Ownership-Mapping (Ergebnis des Bausteins):**

| Quelltyp          | Zuständiger Skill           | Modus                |
| ----------------- | --------------------------- | -------------------- |
| `plan`            | `{{SKILL:sf-apply-plan}}`   | –                    |
| `review-report`   | `{{SKILL:sf-apply-review}}` | lokal                |
| `review-epic`     | `{{SKILL:sf-apply-review}}` | remote (Epic)        |
| `review-finding`  | `{{SKILL:sf-apply-review}}` | remote (Issue-Liste) |
| `container-issue` | `{{SKILL:sf-apply-issues}}` | –                    |
| `plain-issue`     | `{{SKILL:sf-apply-issues}}` | –                    |

Der Baustein liefert als Ergebnis: erkannter Quelltyp, aufgelöstes Handle
(Dateipfad bzw. Issue-Nummer(n)) und zuständiger Skill. Er trifft **keine**
Umsetzungsentscheidung und ändert nichts.

### Router `sf-apply`

- Frontmatter: `type: orchestrator`, deutsche `description`, die den Zweck
  („beliebige Apply-Quelle klassifizieren und an den passenden Skill delegieren“)
  zusammenfasst und die vier möglichen Ziele nennt.
- Bindet `language-rules`, `task-tracking` und `apply-source-detection` ein.
- **Phase 1 – Erkennung:** Baustein ausführen. Bei `none`: lokale Kandidaten
  auflisten (offene Pläne aus `docs/plan/` analog `{{SKILL:sf-open-plans}}`;
  Report-Dateien unter `.sf-plugin/review/`) und den User nach der konkreten Quelle
  fragen; **keine** heuristische Auto-Auswahl. Bei `ambiguous`: die konkurrierenden
  Deutungen nennen und nachfragen.
- **Phase 2 – Delegation:** erkannten Quelltyp, aufgelöstes Handle und Zielskill kurz
  ausgeben, dann den zuständigen Skill mit dem Original-Argument starten
  (`{{SKILL:sf-apply-plan}} <arg>` / `{{SKILL:sf-apply-review}} <arg>` /
  `{{SKILL:sf-apply-issues}} <arg>`). Danach liegt die gesamte Verantwortung beim
  Zielskill.
- Regeln: keine Implementierungs-, Validierungs- oder Review-Phase selbst; nichts
  ändern außer der Delegation; bei Unklarheit fragen statt raten.

### Integration in die bestehenden Skills

Gemeinsames Muster: Jeder Skill ruft früh in Phase 1 den Baustein für die
**Top-Level-Klassifikation** auf. Passt der Typ zur eigenen Zuständigkeit → weiter mit
der bestehenden type-spezifischen Tiefenlogik. Passt er nicht:

- **Direktaufruf durch den User:** klar auf den zuständigen Skill (oder
  `{{SKILL:sf-apply}}`) verweisen und beenden – wie es `{{SKILL:sf-apply-issues}}`
  heute schon für Plan-Pfade tut.
- **Delegation aus `{{SKILL:sf-apply}}`:** sollte nicht auftreten (Router hat korrekt
  geroutet); die Weiche bleibt als Schutz bestehen.

- `{{SKILL:sf-apply-plan}}`: Stufe A bestätigt `plan` bzw. verweist Fremdtypen weiter;
  danach unverändert `plan-reference-routing` (Status-/Empfehlungsprüfung).
- `{{SKILL:sf-apply-review}}`: der bisherige Abschnitt „Argument-Erkennung und
  Modusbestimmung" (Report-Datei ⇒ lokal; Epic-Label ⇒ Epic-Modus; Finding-Liste ⇒
  Issue-Listen-Modus) wird durch den Baustein ersetzt und leitet Modus und
  Epic-/Listen-Fall aus `review-report` / `review-epic` / `review-finding` ab.
- `{{SKILL:sf-apply-issues}}`: `plan`/`review-report` sowie `review-epic`/`review-finding`
  werden an den zuständigen Skill verwiesen (Review-Findings gehören zu
  `{{SKILL:sf-apply-review}}`); `container-issue`/`plain-issue` übernimmt der Skill
  selbst, die bestehende Container-Expansion in Phase 2 bleibt.

### Edge Cases

- **Kein Argument (`none`):** lokale Kandidaten listen und fragen; nie automatisch das
  „neueste“ wählen.
- **Token passt zu Plan- und Report-Datei (`ambiguous`):** beide Deutungen nennen,
  nachfragen.
- **Gemischte Issue-Liste** (z. B. Finding- und Plain-Issues in einem Aufruf):
  nicht raten; den User bitten, die Liste nach Zieltyp zu trennen, oder den Router
  pro Issue routen lassen. Im Plan als bewusst konservativ behandelt: nachfragen.
- **Review-Issue ohne Label:** Sekundärsignal (`[R-XXXXXXX]` + `**Signatur**`);
  sonst `ambiguous`.
- **Issue-Referenz, aber Tracker-CLI fehlt/nicht authentifiziert:** Stufe B kann nicht
  laufen ⇒ klare Fehlermeldung mit Behebungshinweis aus `issue-tracker.md`, kein
  stiller Fallback.
- **Plan-Pfad mit Status „Umgesetzt“:** klassifiziert trotzdem als `plan`; der
  Umsetzungs-/Status-Sonderfall bleibt Sache von `plan-reference-routing`.
- **Nicht auflösbarer Pfad:** `ambiguous` ⇒ nachfragen bzw. Fehlermeldung.

## Akzeptanzkriterien

- [ ] `skills/_shared/apply-source-detection.md` existiert und dokumentiert alle sechs
      kanonischen Quelltypen plus `none`/`ambiguous`, die zweistufige Erkennung, die
      Präzedenz „Label vor Body-Struktur“ und das Ownership-Mapping.
- [ ] `skills/sf-apply/SKILL.md` existiert mit `type: orchestrator`, bindet
      `apply-source-detection` per ` ```include ``` ` ein und delegiert an genau einen
      der drei Skills bzw. fragt bei `none`/`ambiguous` nach.
- [ ] Die drei bestehenden Skills binden `apply-source-detection` ein und nutzen es für
      die Top-Level-Argument-Klassifikation; Fremdtypen werden an den zuständigen Skill
      verwiesen.
- [ ] `pnpm build` läuft mit Exit-Code 0; die Build-Summary weist einen Skill mehr aus,
      und es erscheint kein „Include file not found“.
- [ ] Der Build erzeugt `dist/claude/sf-claude-plugin/plugins/sf-frontend-workflows/commands/apply.md`
      und `dist/codex/skills/sf-apply/SKILL.md`, und der Detection-Baustein ist in diese
      Artefakte inlined.
- [ ] `pnpm agent:check` (`oxfmt --check`) ist für die geänderten Markdown-Dateien grün.

## Validierungsplan

- `pnpm build` ausführen: Exit 0, Summary-Skillzahl +1, kein Include-Fehler.
- In den generierten Artefakten (`commands/apply.md`, `dist/codex/skills/sf-apply/SKILL.md`)
  prüfen, dass der Detection-Abschnitt inlined ist und `{{SKILL:…}}` korrekt zu `/…`
  bzw. `$…` transformiert wurde.
- `pnpm agent:check` für Formatierung.
- Dispatch-Trockenlauf-Matrix (manuell gegen den Baustein geprüft), erwartete
  Zuordnung: Plan-Pfad/Nummer → `{{SKILL:sf-apply-plan}}`; Report-Datei →
  `{{SKILL:sf-apply-review}}` lokal; Epic-Issue → `{{SKILL:sf-apply-review}}` remote/Epic;
  Finding-Issue → `{{SKILL:sf-apply-review}}` remote/Liste; Container-Issue und
  Plain-Issue → `{{SKILL:sf-apply-issues}}`; leeres Argument → Nachfrage;
  doppeldeutiges Token → Nachfrage.

## Annahmen und offene Punkte

- Annahme: Die drei bestehenden Skills bleiben dauerhaft eigenständig aufrufbar
  (bestätigt); `{{SKILL:sf-apply}}` ist ein zusätzlicher Einstiegspunkt, kein Ersatz.
- Annahme: Die Konsolidierung der Erkennung in die drei Skills ist gewünscht
  (bestätigt) und Teil dieses Plans.
- Annahme: Das Command wird als `/apply` ausgeliefert (Build leitet den Command-Namen
  aus dem Skill-Namen ohne `sf-`-Präfix ab).
- Offen (bewusst nachrangig): Ob die Plugin-Beschreibung in `build.mjs` sowie README
  angepasst werden – als optionaler Anzeige-Feinschliff eingestuft, nicht
  umsetzungskritisch. Die `build.mjs`-Beschreibung wurde umgesetzt (Aufnahme von
  `apply` in die Skill-Aufzählung); die README wurde nicht angefasst.

## Testergebnisse

**Datum:** 2026-07-06

- `pnpm build`: Exit 0. Build-Summary meldet **18 Skills** (zuvor 17, also +1 durch
  `sf-apply`) und 11 Agents; kein „Include file not found“.
- Artefakt-Prüfung: `dist/claude/…/commands/apply.md` und
  `dist/codex/skills/sf-apply/SKILL.md` existieren und enthalten den inlined
  Detection-Baustein. `{{SKILL:…}}` ist korrekt transformiert (Claude `/apply-plan`,
  `/apply-review`, `/apply-issues`; Codex `$sf-apply-plan`, `$sf-apply-review`,
  `$sf-apply-issues`); keine `{{SKILL:` mehr in den Artefakten.
- Der Detection-Baustein ist zusätzlich in den Artefakten der drei bestehenden
  Skills (`commands/apply-plan.md`, `apply-review.md`, `apply-issues.md`) inlined.
- `pnpm agent:check` (`oxfmt --check`): „All matched files use the correct format“.

Es gibt kein Unit-Test-Framework für die Skills (`package.json` ohne `test`-Script);
Build und Formatter sind die objektiven Validatoren dieses Markdown-Plugins.

## Review-Findings

**Datum:** 2026-07-06
**Reviewer:** keiner (Self-Review im Build-Workflow; kein separater Reviewer-Skill
gestartet, da reines Skill-/Markdown-Authoring und über Build/Formatter verifiziert)

### Zusammenfassung

| Status                  | Anzahl |
| ----------------------- | -----: |
| Behoben                 |      0 |
| Offen / Nicht umgesetzt |      0 |

Keine Findings gefunden.

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

- Architektur (Hinweis): Der neue Baustein überschneidet sich inhaltlich mit der
  „Modus bestimmen“-Sektion in `issue-tracker.md`. Der Plan adressiert das, indem
  Stufe B auf `issue-tracker.md` aufsetzt statt zu duplizieren; eine spätere
  Straffung von `issue-tracker.md` kann ein Folgeplan sein.
- Fehlerfälle (Hinweis): Gemischte Issue-Listen sind bewusst konservativ (nachfragen)
  gelöst, um Fehlrouting zu vermeiden; ein späteres Per-Issue-Routing im Router bleibt
  als mögliche Erweiterung offen.
- Scope (Hinweis): Die optionale `build.mjs`-Beschreibungsanpassung ist als
  Nicht-Ziel/optionaler Feinschliff markiert, um den Kern-Scope klein zu halten.
