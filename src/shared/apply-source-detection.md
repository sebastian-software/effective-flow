## Apply-Quellen-Erkennung

`<plan.dir>` ist das Plan-Verzeichnis aus der Firmo-Konfiguration (Projektsetup-ADR) `plan.dir` (Default
`docs/plan`).

Dieser geteilte Baustein ist die einzige Quelle der Wahrheit dafür, **welcher
Apply-Quelltyp** ein übergebenes Argument ist. Er wird von `{{SKILL:apply}}`
(Router) sowie von `{{SKILL:apply-plan}}`, `{{SKILL:apply-review}}` und
`{{SKILL:apply-issues}}` für die vorgelagerte Argument-Klassifikation genutzt.

Der Baustein klassifiziert nur und löst die Referenz auf ein Handle (Dateipfad bzw.
Issue-Nummer(n)) auf. Er trifft **keine** Umsetzungsentscheidung, ändert nichts und
liest keine Findings/Container-Inhalte tiefer als für die Klassifikation nötig. Die
type-spezifische Tiefenlogik (Planstatus, Finding-Parsing, Container-Expansion) bleibt
im jeweiligen Skill.

### Kanonische Quelltypen

| Typ               | Bedeutung                                                                                                  | Zuständiger Skill                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `plan`            | Plan-Datei unter `<plan.dir>/`                                                                             | `{{SKILL:apply-plan}}`                         |
| `review-report`   | Review-Report-Datei unter `.effective-flow/review/`                                                        | `{{SKILL:apply-review}}` (lokal)               |
| `review-epic`     | Tracking-/Epic-Issue eines `{{SKILL:review}}`-Laufs                                                        | `{{SKILL:apply-review}}` (remote, Epic)        |
| `review-finding`  | einzelnes Finding-Issue eines `{{SKILL:review}}`-Laufs                                                     | `{{SKILL:apply-review}}` (remote, Issue-Liste) |
| `container-issue` | generisches Issue mit Sub-Issue-Checkliste, ohne Review-Label (`effective-flow-review-*`/`firmo-review-*`) | `{{SKILL:apply-issues}}`                       |
| `plain-issue`     | frei geschriebenes Menschen-Issue                                                                          | `{{SKILL:apply-issues}}`                       |

Sonderergebnisse: `none` (kein/leeres Argument) und `ambiguous` (nicht eindeutig
auflösbar). `issue-reference` ist ein **Zwischenergebnis** aus Stufe A für eine noch
nicht in den Subtyp aufgelöste Issue-Referenz; Stufe B verfeinert es.

### Stufe A: syntaktische Klassifikation (nur Dateisystem)

Stufe A benötigt keine Tracker-I/O und steht jedem Skill zur Verfügung. Bestimme den
Typ in dieser Reihenfolge (erste zutreffende Regel gewinnt):

1. **Leeres/kein Argument** → `none`.
2. **Plan-Referenz** → `plan`, wenn sich das Argument auf genau eine Datei unter
   `<plan.dir>/` oder `<plan.dir>/archive/` auflöst. Erlaubte Formen wie in
   `plan-reference-routing`: vollständiger Pfad (`<plan.dir>/YYYY-MM-DD-…md`),
   Datums-Slug-Dateiname (`YYYY-MM-DD-…md`), Legacy-Nummer ohne Pfad (`NNNN`, primär
   über die H1 aufgelöst) oder – als Fallback – der Titel-Slug.
3. **Review-Report** → `review-report`, wenn das Argument ein `*.md`-Pfad unter
   `.effective-flow/review/` ist (bzw. ein Dateiname, der sich dort auflöst).
4. **Issue-Referenz** → `issue-reference` (weiter mit Stufe B), wenn das Argument eine
   bare Issue-Nummer (`123`), ein `#123` oder eine Issue-URL ist. Issue-URLs sind
   hostneutral: erkenne `https://<host>/<owner>/<repo>/issues/<nr>` und vergleichbare
   Forgejo-/Gitea-URL-Formen genauso wie GitHub-URLs. Mehrere solcher Referenzen werden
   als Liste behandelt und einzeln in Stufe B klassifiziert.
5. **Sonst** → `ambiguous`: das Argument löst sich zu keiner Kategorie auf oder passt
   gleichzeitig zu einer Plan- **und** einer Review-Datei. Nicht raten – der Aufrufer
   fragt nach (siehe „Mehrdeutigkeit und Fallbacks“).

Trennschärfe Plan vs. Report: primär über das Verzeichnis (`<plan.dir>/` bzw.
`<plan.dir>/archive/` vs. `.effective-flow/review/`), sekundär über den Kopf-Inhalt
(Planstatus-Marker `**Planungsstatus:**` / `**Plan status:**` vs.
`### [R-XXXXXXX]`-Finding-Blöcke). Eine vierstellige Nummer ohne Pfad ist immer eine
(Legacy-)Plan-Referenz, nie eine Issue-Referenz.

### Stufe B: Issue-Subtyp (Tracker)

Stufe B verfeinert eine `issue-reference` aus Stufe A in den konkreten Subtyp. Sie
setzt die Host-/CLI-Erkennung und Verfügbarkeitsprüfung aus `issue-tracker.md`
voraus; ein Skill, der Stufe B nutzt, bindet daher auch `issue-tracker.md` ein.
`{{SKILL:apply-plan}}` braucht Stufe B nicht – für einen Plan-Skill genügt Stufe A,
um eine Issue-Referenz als Fremdtyp zu erkennen und weiterzuleiten.

Lies je Issue Labels und Body **einmal frisch** vom Tracker und bestimme den Subtyp in
dieser Präzedenz – **Label vor Body-Struktur**:

1. Label `effective-flow-review-epic` (oder Alt `firmo-review-epic`) → `review-epic`.
2. Label `effective-flow-review-finding` (oder Alt `firmo-review-finding`) → `review-finding`.
3. kein Review-Label, aber der Body enthält eine Sub-Issue-Checkliste
   (`- [ ] #NNN …` / `- [x] #NNN …`) → `container-issue`.
4. sonst → `plain-issue`.

Sekundärsignal bei fehlendem Label (z. B. manuell entfernt): ein Titel im Format
`[R-XXXXXXX] …` zusammen mit einem `**Signatur**`-Feld im Body wird wie
`review-finding` behandelt. Bleibt der Subtyp danach unklar → `ambiguous`.

Warum Label vor Body: Ein `review-epic` trägt – wie ein generisches
`container-issue` – eine `- [ ] #NNN`-Checkliste. Das Label `effective-flow-review-epic` bzw.
`effective-flow-review-finding` (Alt-Präfix `firmo-` gleichwertig, siehe „Label-Konvention“ in
`issue-tracker.md`) ist der sichere Diskriminator und hat Vorrang vor der
Body-Struktur.

### Ownership und Modus

Aus dem finalen Quelltyp folgt genau ein zuständiger Skill und – bei
`{{SKILL:apply-review}}` – der Modus:

| Quelltyp          | Zuständiger Skill        | Modus / Hinweis                  |
| ----------------- | ------------------------ | -------------------------------- |
| `plan`            | `{{SKILL:apply-plan}}`   | –                                |
| `review-report`   | `{{SKILL:apply-review}}` | lokaler Report-Fluss             |
| `review-epic`     | `{{SKILL:apply-review}}` | Remote-Modus, Epic-Modus         |
| `review-finding`  | `{{SKILL:apply-review}}` | Remote-Modus, Issue-Listen-Modus |
| `container-issue` | `{{SKILL:apply-issues}}` | Container-Expansion im Skill     |
| `plain-issue`     | `{{SKILL:apply-issues}}` | Einzel-Arbeitsitem               |

Konsistenz mit `issue-tracker.md`: Die dortige Regel „Argumenttyp überschreibt den
Config-Modus" bleibt gültig – ein `review-report` erzwingt `local`, ein
`review-epic`/`review-finding` erzwingt `remote`. Dieser Baustein liefert genau diesen
Argumenttyp.

### Mehrdeutigkeit und Fallbacks

- **`none` (kein Argument):** nicht heuristisch das „neueste“ wählen. Der Aufrufer
  listet lokale Kandidaten (offene Pläne aus `<plan.dir>/`, Report-Dateien unter
  `.effective-flow/review/`) und fragt nach der konkreten Quelle. Ist der effektive
  Tracker-Modus `remote`, listet er zusätzlich offene Review-Epics (Label
  `effective-flow-review-epic`, inkl. Alt `firmo-review-epic`) als Kandidaten, da im
  Remote-Modus keine lokalen Report-Dateien existieren.
- **`ambiguous`:** die konkurrierenden Deutungen benennen und nachfragen, statt zu
  raten.
- **Gemischte Issue-Liste** (verschiedene Subtypen in einem Aufruf, z. B. `review-finding`
  und `plain-issue`): nicht raten. Den User bitten, die Liste nach Zieltyp zu trennen,
  bzw. – im Router – pro Issue routen. Konservativ: nachfragen.
- **Issue-Referenz, aber Tracker-CLI fehlt/nicht authentifiziert:** Stufe B kann nicht
  laufen → klare Fehlermeldung mit Behebungshinweis gemäß „Fehler- und Randfälle“ in
  `issue-tracker.md`; kein stiller Fallback auf einen lokalen Typ.
- **Nicht auflösbarer Pfad:** `ambiguous` → nachfragen bzw. Fehlermeldung; nenne, dass
  `{{SKILL:open-plans}}` offene Pläne auflisten kann.

### Verwendung durch die Skills

- **Router (`{{SKILL:apply}}`):** führt Stufe A und – für Issue-Referenzen –
  Stufe B aus, meldet den erkannten Typ und delegiert an den zuständigen Skill mit dem
  Original-Argument. Bei `none`/`ambiguous`/gemischter Liste: nachfragen.
- **Zuständigkeits-Skill (jeder der drei Apply-Skills):** klassifiziert das Argument
  früh über diesen Baustein. Passt der Typ zur eigenen Zuständigkeit → weiter mit der
  eigenen Tiefenlogik. Passt er nicht:
  - **Direktaufruf durch den User:** klar auf den zuständigen Skill (oder
    `{{SKILL:apply}}`) verweisen und beenden.
  - **Delegation aus `{{SKILL:apply}}`:** sollte nicht auftreten, da der Router
    korrekt geroutet hat; die Weiche bleibt als Schutz bestehen.
