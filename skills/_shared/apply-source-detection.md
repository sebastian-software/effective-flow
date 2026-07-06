## Apply-Quellen-Erkennung

Dieser geteilte Baustein ist die einzige Quelle der Wahrheit dafür, **welcher
Apply-Quelltyp** ein übergebenes Argument ist. Er wird von `{{SKILL:sf-apply}}`
(Router) sowie von `{{SKILL:sf-apply-plan}}`, `{{SKILL:sf-apply-review}}` und
`{{SKILL:sf-apply-issues}}` für die vorgelagerte Argument-Klassifikation genutzt.

Der Baustein klassifiziert nur und löst die Referenz auf ein Handle (Dateipfad bzw.
Issue-Nummer(n)) auf. Er trifft **keine** Umsetzungsentscheidung, ändert nichts und
liest keine Findings/Container-Inhalte tiefer als für die Klassifikation nötig. Die
type-spezifische Tiefenlogik (Planstatus, Finding-Parsing, Container-Expansion) bleibt
im jeweiligen Skill.

### Kanonische Quelltypen

| Typ               | Bedeutung                                                     | Zuständiger Skill                                 |
| ----------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| `plan`            | Plan-Datei unter `docs/plan/`                                 | `{{SKILL:sf-apply-plan}}`                         |
| `review-report`   | Review-Report-Datei unter `.firmo/review/`                    | `{{SKILL:sf-apply-review}}` (lokal)               |
| `review-epic`     | Tracking-/Epic-Issue eines `{{SKILL:sf-review}}`-Laufs        | `{{SKILL:sf-apply-review}}` (remote, Epic)        |
| `review-finding`  | einzelnes Finding-Issue eines `{{SKILL:sf-review}}`-Laufs     | `{{SKILL:sf-apply-review}}` (remote, Issue-Liste) |
| `container-issue` | generisches Issue mit Sub-Issue-Checkliste, ohne Review-Label | `{{SKILL:sf-apply-issues}}`                       |
| `plain-issue`     | frei geschriebenes Menschen-Issue                             | `{{SKILL:sf-apply-issues}}`                       |

Sonderergebnisse: `none` (kein/leeres Argument) und `ambiguous` (nicht eindeutig
auflösbar). `issue-reference` ist ein **Zwischenergebnis** aus Stufe A für eine noch
nicht in den Subtyp aufgelöste Issue-Referenz; Stufe B verfeinert es.

### Stufe A: syntaktische Klassifikation (nur Dateisystem)

Stufe A benötigt keine Tracker-I/O und steht jedem Skill zur Verfügung. Bestimme den
Typ in dieser Reihenfolge (erste zutreffende Regel gewinnt):

1. **Leeres/kein Argument** → `none`.
2. **Plan-Referenz** → `plan`, wenn sich das Argument auf genau eine Datei unter
   `docs/plan/` auflöst. Erlaubte Formen wie in `plan-reference-routing`: vollständiger
   Pfad (`docs/plan/NNNN-…md`), Dateiname (`NNNN-…md`), vierstellige Nummer (`NNNN`)
   oder – als Fallback – der Titel-Slug.
3. **Review-Report** → `review-report`, wenn das Argument ein `*.md`-Pfad unter
   `.firmo/review/` ist (bzw. ein Dateiname, der sich dort auflöst).
4. **Issue-Referenz** → `issue-reference` (weiter mit Stufe B), wenn das Argument eine
   bare Issue-Nummer (`123`), ein `#123` oder eine Issue-URL ist. Mehrere solcher
   Referenzen werden als Liste behandelt und einzeln in Stufe B klassifiziert.
5. **Sonst** → `ambiguous`: das Argument löst sich zu keiner Kategorie auf oder passt
   gleichzeitig zu einer Plan- **und** einer Review-Datei. Nicht raten – der Aufrufer
   fragt nach (siehe „Mehrdeutigkeit und Fallbacks").

Trennschärfe Plan vs. Report: primär über das Verzeichnis (`docs/plan/` vs.
`.firmo/review/`), sekundär über den Kopf-Inhalt (Planstatus-Marker
`**Planungsstatus:**` / `**Plan status:**` vs. `### [R-XXXXXXX]`-Finding-Blöcke). Eine
vierstellige Nummer ohne Pfad ist immer eine Plan-Referenz, nie eine Issue-Referenz.

### Stufe B: Issue-Subtyp (Tracker)

Stufe B verfeinert eine `issue-reference` aus Stufe A in den konkreten Subtyp. Sie
setzt die Host-/CLI-Erkennung und Verfügbarkeitsprüfung aus `issue-tracker.md`
voraus; ein Skill, der Stufe B nutzt, bindet daher auch `issue-tracker.md` ein.
`{{SKILL:sf-apply-plan}}` braucht Stufe B nicht – für einen Plan-Skill genügt Stufe A,
um eine Issue-Referenz als Fremdtyp zu erkennen und weiterzuleiten.

Lies je Issue Labels und Body **einmal frisch** vom Tracker und bestimme den Subtyp in
dieser Präzedenz – **Label vor Body-Struktur**:

1. Label `sf-review-epic` → `review-epic`.
2. Label `sf-review-finding` → `review-finding`.
3. kein Review-Label, aber der Body enthält eine Sub-Issue-Checkliste
   (`- [ ] #NNN …` / `- [x] #NNN …`) → `container-issue`.
4. sonst → `plain-issue`.

Sekundärsignal bei fehlendem Label (z. B. manuell entfernt): ein Titel im Format
`[R-XXXXXXX] …` zusammen mit einem `**Signatur**`-Feld im Body wird wie
`review-finding` behandelt. Bleibt der Subtyp danach unklar → `ambiguous`.

Warum Label vor Body: Ein `review-epic` trägt – wie ein generisches
`container-issue` – eine `- [ ] #NNN`-Checkliste. Das Label `sf-review-epic` bzw.
`sf-review-finding` ist der sichere Diskriminator und hat Vorrang vor der
Body-Struktur.

### Ownership und Modus

Aus dem finalen Quelltyp folgt genau ein zuständiger Skill und – bei
`{{SKILL:sf-apply-review}}` – der Modus:

| Quelltyp          | Zuständiger Skill           | Modus / Hinweis                  |
| ----------------- | --------------------------- | -------------------------------- |
| `plan`            | `{{SKILL:sf-apply-plan}}`   | –                                |
| `review-report`   | `{{SKILL:sf-apply-review}}` | lokaler Report-Fluss             |
| `review-epic`     | `{{SKILL:sf-apply-review}}` | Remote-Modus, Epic-Modus         |
| `review-finding`  | `{{SKILL:sf-apply-review}}` | Remote-Modus, Issue-Listen-Modus |
| `container-issue` | `{{SKILL:sf-apply-issues}}` | Container-Expansion im Skill     |
| `plain-issue`     | `{{SKILL:sf-apply-issues}}` | Einzel-Arbeitsitem               |

Konsistenz mit `issue-tracker.md`: Die dortige Regel „Argumenttyp überschreibt den
Config-Modus" bleibt gültig – ein `review-report` erzwingt `local`, ein
`review-epic`/`review-finding` erzwingt `remote`. Dieser Baustein liefert genau diesen
Argumenttyp.

### Mehrdeutigkeit und Fallbacks

- **`none` (kein Argument):** nicht heuristisch das „neueste" wählen. Der Aufrufer
  listet lokale Kandidaten (offene Pläne aus `docs/plan/`, Report-Dateien unter
  `.firmo/review/`) und fragt nach der konkreten Quelle.
- **`ambiguous`:** die konkurrierenden Deutungen benennen und nachfragen, statt zu
  raten.
- **Gemischte Issue-Liste** (verschiedene Subtypen in einem Aufruf, z. B. `review-finding`
  und `plain-issue`): nicht raten. Den User bitten, die Liste nach Zieltyp zu trennen,
  bzw. – im Router – pro Issue routen. Konservativ: nachfragen.
- **Issue-Referenz, aber Tracker-CLI fehlt/nicht authentifiziert:** Stufe B kann nicht
  laufen → klare Fehlermeldung mit Behebungshinweis gemäß „Fehler- und Randfälle" in
  `issue-tracker.md`; kein stiller Fallback auf einen lokalen Typ.
- **Nicht auflösbarer Pfad:** `ambiguous` → nachfragen bzw. Fehlermeldung; nenne, dass
  `{{SKILL:sf-open-plans}}` offene Pläne auflisten kann.

### Verwendung durch die Skills

- **Router (`{{SKILL:sf-apply}}`):** führt Stufe A und – für Issue-Referenzen –
  Stufe B aus, meldet den erkannten Typ und delegiert an den zuständigen Skill mit dem
  Original-Argument. Bei `none`/`ambiguous`/gemischter Liste: nachfragen.
- **Zuständigkeits-Skill (jeder der drei Apply-Skills):** klassifiziert das Argument
  früh über diesen Baustein. Passt der Typ zur eigenen Zuständigkeit → weiter mit der
  eigenen Tiefenlogik. Passt er nicht:
  - **Direktaufruf durch den User:** klar auf den zuständigen Skill (oder
    `{{SKILL:sf-apply}}`) verweisen und beenden.
  - **Delegation aus `{{SKILL:sf-apply}}`:** sollte nicht auftreten, da der Router
    korrekt geroutet hat; die Weiche bleibt als Schutz bestehen.
