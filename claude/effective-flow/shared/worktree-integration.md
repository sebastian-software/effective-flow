## Delivery- und Worktree-Integration

Dieser Baustein verknüpft code-ändernde Workflows mit Liefer-Branches, Pull-Requests und
Git-Worktrees. Die allgemeinen Werte für Basis-Branch, Branch-Namensbildung und
Abschluss-Aktion liegen im Config-Block `delivery`; der Block `worktree` steuert
ausschließlich, ob und wie die Umsetzung in einem separaten Git-Worktree läuft.

**Standardmäßig läuft die Umsetzung in einem eigenen Git-Worktree mit eigenem Branch**
(`worktree.enabled` Default `true`). Sobald in einem Worktree bzw. auf einem eigenen
Liefer-Branch gearbeitet wird, **ist Delivery implizit aktiv** und schließt per `merge`
(Default) oder `pr` ab. Es gibt keinen separaten `delivery.enabled`-Schalter mehr (siehe
„Delivery ist durch Worktree/Branch impliziert“).

Nur wenn der User ausdrücklich In-Place-Arbeit ohne Worktree verlangt und keine
Branch-/PR-/Merge-Aktion wünscht, verhält sich der Workflow wie ohne diesen Baustein: keine
erzwungene Branch-Erzeugung, keine erzwungenen Commits und keine automatische
PR-Erstellung.

`<plan.dir>` ist das Plan-Verzeichnis aus der Effective Flow-Konfiguration (Projektsetup-ADR) `plan.dir` (Default
`docs/plan`).

### Rollen der Config-Blöcke

- **`delivery`** beschreibt den Liefer-Branch und dessen Abschluss: Basis-Ref,
  Branch-Präfix, Abschluss-Aktion und Rückwechsel-Ziel.
- **`worktree`** beschreibt ausschließlich den Ausführungsort: ob ein Worktree
  verwendet wird, wo er liegt und welches Setup darin läuft.

Abgrenzung: Dieser Baustein ist **nicht** der per-Finding-Worktree-Mechanismus aus
``tools/apply-review.md`` (`applyReview.worktree`). Jener isoliert parallele lokale
Review-Findings und führt Commits per Cherry-Pick auf den aktuellen Branch zurück.
Dieser Baustein erzeugt Liefer-Branches für PR, Merge oder „nur Branch“. Beide
dürfen denselben physischen `baseDir` nutzen, da Session- und Pfad-Segmente
unterscheiden.

### Konfiguration

Falls die Effective Flow-Konfiguration (Projektsetup-ADR) entsprechende Werte festschreibt, überschreiben sie diese Defaults (Schema hier zur Illustration):

```json
{
  "delivery": {
    "baseBranch": "origin/main",
    "branchPrefix": "effective-flow",
    "completion": "merge",
    "returnBranch": "auto"
  },
  "worktree": {
    "enabled": true,
    "setup": "auto",
    "baseDir": ".effective-flow/.worktrees"
  }
}
```

Fehlende Werte haben diese Defaults:

- `delivery.baseBranch`: `"origin/main"`
- `delivery.branchPrefix`: `"effective-flow"`
- `delivery.completion`: `"merge"` (Merge in den Zielbranch als Standard-Abschluss)
- `delivery.returnBranch`: `"auto"` (lokaler Branch-Anteil aus `delivery.baseBranch`)
- `worktree.enabled`: `true` (Umsetzung läuft in einem eigenen Worktree)
- `worktree.setup`: `"auto"`
- `worktree.baseDir`: `.effective-flow/.worktrees`

Gültige Werte:

- `delivery.completion`: `"pr"`, `"merge"`, `"branch"`
- `delivery.returnBranch`: `"auto"` oder ein lokaler Branchname als String
- `worktree.enabled`: `true`, `false`
- `worktree.setup`: `"auto"`, `"none"` oder ein expliziter Setup-Befehl als String

`delivery.enabled` ist **entwertet**: Delivery wird nicht mehr über einen eigenen Schalter
aktiviert, sondern ist immer dann aktiv, wenn in einem Worktree/eigenen Branch gearbeitet
wird (siehe „Delivery ist durch Worktree/Branch impliziert“). Ein in einer Altconfig noch
vorhandenes `delivery.enabled` wird beim Lesen ignoriert und von der Config-Vollmigration
entfernt (siehe „Config-Migration“).

### Config-Migration

Das Lesen der Effective Flow-Konfiguration aus der Projektsetup-ADR und die einmalige Konsolidierung
einer Alt-Config auf das aktuelle Schema – insbesondere das Verschieben alter Lieferwerte aus
`worktree.baseBranch`/`worktree.branchPrefix`/`worktree.completion` nach `delivery.*` und das
Entfernen des entwerteten `delivery.enabled` – übernimmt der geteilte Baustein
„Config-Migration“ (`config-migration.md`) einmalig und zentral. Dieser Baustein führt **keine** eigene
per-Block-Migration mehr aus. Bis eine Config migriert ist, gilt beim Lesen: neuer Wert aus
`delivery.*` vor Legacy-Wert aus `worktree.*` vor Default; ein vorhandenes
`delivery.enabled` wird ignoriert.

### Modus bestimmen (Setup-Phase): Delivery ist durch Worktree/Branch impliziert

Bestimme zu Beginn der eigentlichen Umsetzungsarbeit den effektiven Modus:

- **Worktree-Ausführung ist standardmäßig aktiv** (`worktree.enabled` Default `true`). Sie
  bleibt nur aus, wenn `worktree.enabled: false` gesetzt ist oder der User ausdrücklich
  In-Place-Arbeit verlangt („ohne Worktree“, „direkt auf dem aktuellen Branch“).
- **Delivery ist aktiv, sobald in einem Worktree oder auf einem eigenen Liefer-Branch
  gearbeitet wird** – also im Default-Fall immer. Zusätzlich ist Delivery aktiv, wenn der
  User ausdrücklich PR-, Branch- oder Merge-Arbeit verlangt (auch bei In-Place-Arbeit; dann
  wird der Liefer-Branch im Haupt-Repo erzeugt).
- Ist der Worktree per Config deaktiviert (`worktree.enabled: false`), gib einen kurzen
  Hinweis aus, dass der (Default-)Worktree-Modus per Config aus ist. Verlangt der User dann
  auch keine Delivery-Aktion, führe keine weiteren Schritte aus diesem Baustein aus
  (In-Place ohne Delivery).

### Gemeinsame Vorbedingungen

Wenn Delivery oder Worktree aktiv ist:

1. `git` und bei Worktree-Ausführung `git worktree` müssen verfügbar sein.
2. `delivery.baseBranch` muss auflösbar sein. Ist es ein Remote-Ref (z. B.
   `origin/main`), zuerst `git fetch REMOTE BRANCH` ausführen, damit der Liefer-Branch
   auf dem aktuellen Remote-Stand startet.
3. Hat der aktuelle HEAD relevante uncommittete Änderungen oder lokale Commits, die
   nicht in `delivery.baseBranch` enthalten sind, weise darauf hin. Ein frisch aus dem
   Basis-Branch erzeugter Liefer-Branch enthält diese Arbeit nicht. Fahre nur fort,
   wenn der User den gewählten Modus bestätigt oder der Workflow einen sicheren
   Teil-Diff-PR nach unten beschriebenem Verfahren erzeugt.
4. Liefer-Branch-Namen bilden: `<delivery.branchPrefix>/<skill>/<slug>`, z. B.
   `firmo/build/user-login`. Den Slug aus dem Plan-Titel, der Aufgabenbeschreibung,
   dem Issue oder Finding ableiten. Existiert der Branch-Name bereits, ein
   numerisches Suffix anhängen und den gewählten Namen melden.

### Worktree-Ausführung

Wenn Worktree-Ausführung aktiv ist:

1. Repo-Namen bestimmen aus `basename "$(git rev-parse --show-toplevel)"` und als
   BaseDir `worktree.baseDir` (Default `.effective-flow/.worktrees`) verwenden. Worktree-Pfad:
   `BASE_DIR/REPO_NAME/SESSION_ID`.
2. Worktree und Liefer-Branch erzeugen:
   `git worktree add <WORKTREE_PATH> -b <BRANCH_NAME> <BASE_REF>`.
3. Setup gemäß `worktree.setup` im Worktree ausführen und den Modus vorher kurz
   anzeigen:
   - `auto` oder fehlend: nach Lockfile entscheiden – `pnpm-lock.yaml` →
     `pnpm install --frozen-lockfile --prefer-offline`, `package-lock.json` →
     `npm ci`, `yarn.lock` → `yarn install --frozen-lockfile`, `Cargo.toml` →
     `cargo fetch --locked`, `go.mod` → `go mod download`, `uv.lock` →
     `uv sync --frozen`, `poetry.lock` → `poetry install --sync`, keine bekannte
     Datei → kein Setup.
   - `none`: kein Setup ausführen.
   - String-Wert: dieses explizite Kommando im Worktree ausführen.
4. Alle nachfolgenden Phasen, die Code-, Test- oder Doku-Dateien erzeugen oder
   ändern, mit Arbeitsverzeichnis im Worktree ausführen. Das gilt auch für die
   Abschlussphase bis einschließlich finalem Validator/Formatter.

### In-Place-Delivery ohne Worktree

Wenn Delivery aktiv ist und Worktree-Ausführung aus bleibt:

1. Den ursprünglich ausgecheckten Branch merken.
2. Sicherstellen, dass der Arbeitsbaum keine uncommitteten Änderungen enthält, die
   nicht Teil des Liefer-Branches werden sollen. Wenn solche Änderungen existieren,
   nicht still stagen, stashen oder überschreiben; entweder User-Entscheidung einholen
   oder den Teil-Diff-PR über Worktree verwenden.
3. Liefer-Branch aus `delivery.baseBranch` erzeugen und auschecken.
4. Umsetzung, Tests, Validierung und finale Formatierung auf diesem Liefer-Branch
   ausführen.
5. Nach Abschluss gemäß „Handback und Abschluss-Aktion“ fortfahren.

### Teil-Diff-PR über Worktree

Wenn im Haupt-Checkout bereits Änderungen liegen, die nicht vollständig in den PR
gehören, ist ein separater Worktree der bevorzugte sichere Weg, sofern diese
Vorbedingungen erfüllt sind:

1. `git worktree` ist verfügbar.
2. `delivery.baseBranch` ist auflösbar und bei Remote-Refs aktualisierbar.
3. Der Workflow kennt eine explizite Liste der Dateien, die in den PR sollen.

Der Ablauf:

1. Frischen Worktree-Branch aus `delivery.baseBranch` erzeugen.
2. Nur die ausgewählten Lieferdateien aus dem Haupt-Checkout in den Worktree
   übernehmen. Zulässige Quellen für diese Auswahl sind Plan-Betroffene-Dateien,
   Review-Finding-Scope, Issue-Scope, vom Workflow erzeugte bekannte Dateien oder
   eine explizite User-Auswahl.
3. Im Worktree prüfen, ob die übernommenen Dateien gegenüber dem Basis-Ref einen
   sinnvollen Diff ergeben. Wenn nicht, abbrechen und keinen leeren PR erzeugen.
4. Im Worktree committen und `/effective-flow pr` gegen `delivery.baseBranch` ausführen.
5. Worktree entfernen, Liefer-Branch lokal belassen und Haupt-Checkout unverändert
   lassen. Nicht ausgewählte Änderungen im Haupt-Checkout bleiben unberührt.

Nicht erlaubt ist eine heuristische Teil-Diff-Auswahl nach „alle geänderten Dateien
außer <plan.dir>“. Der Workflow muss die einzuschließenden Dateien kennen oder
nachfragen. Dadurch bleiben parallel neu angelegte Pläne, `.effective-flow/`-State und andere
lokale Arbeitsdateien zuverlässig außerhalb des PRs.

### Was im Liefer-Branch liegt und was im Haupt-Repo bleibt

Datenhaltungs-Invariante: **Von den Effective Flow-Artefakten werden ausschließlich Pläne
committet.** Reviews (lokale Reports) und Investigationen bleiben immer lokal und
ungetrackt; im Remote-Modus werden Reviews stattdessen als Issues geführt (nie im Repo),
Investigationen bleiben in jedem Fall rein lokal (siehe „Issue-Tracker-Anbindung“ und
`/effective-flow investigate`).

- **Im Liefer-Branch:** die eigentlichen Code-, Test- und Doku-Deliverables des
  Workflows sowie – sofern der Workflow eine Plan-Datei geführt hat – deren finaler
  Zustand (im umgesetzten Fall die archivierte, umgesetzt-markierte Plan-Datei).
- **Nur im Haupt-Repo, nie committet:** reine Effective Flow-Buchhaltung und Laufzeitstatus, also
  alle übrigen `.effective-flow/`-Artefakte – `memory.json`, `cache.json`, lokale Review-Reports
  unter `.effective-flow/review/`, Investigations-Reports unter `.effective-flow/investigation/`,
  Config-Migrationsstatus und Wisdom-Dateien.

### Handback und Abschluss-Aktion (Abschlussphase)

Im Anschluss an die reguläre Abschlusslogik des Workflows (inklusive Goal-Verifikation).
Den finalen Statuswechsel der Plan-Datei auf `Umgesetzt`/`Implemented` und ihre
Archivierung übernimmt Schritt 1 unten am Delivery-Punkt – der umsetzende Workflow setzt
den Status also **nicht** vorab, sondern überlässt ihn dieser Phase (Ausnahme: In-Place ohne
Delivery, siehe Schritt 1):

**Bestehende PRs aktualisieren:** Wenn der Liefer-Branch bereits einen Pull-Request
hat und nachträglich Änderungen nötig sind, werden diese Änderungen immer als neue
Commits auf demselben PR-Branch erstellt und gepusht. Bestehende PR-Commits dürfen
nicht per `commit --amend`, interaktivem Rebase, Squash oder Force-Push
umgeschrieben werden. Scheitert ein normaler Push wegen divergierter Remote-History,
stoppe und melde den Konflikt, statt History zu überschreiben.

1. **Plan als umgesetzt markieren, archivieren und in den Liefer-Branch übernehmen:**
   Sofern der Workflow eine Plan-Datei geführt hat, ist dies der **Delivery-Punkt**, an dem
   der Plan als umgesetzt gilt (unmittelbar bevor der PR geöffnet bzw. der Liefer-Branch
   gemergt wird):
   - Setze den kanonischen Statusmarker auf `Umgesetzt`/`Implemented` (Markersprache
     erhalten: deutscher Marker → `**Planungsstatus:** Umgesetzt`, englischer →
     `**Plan status:** Implemented`).
   - Verschiebe die Plan-Datei per `git mv` nach `<plan.dir>/archive/` (Verzeichnis bei
     Bedarf anlegen), gemäß „Archiv umgesetzter Pläne“ der Plan-Datei-Konvention.
   - Lief die Umsetzung in einem Worktree oder Teil-Diff-Worktree, stelle diesen finalen,
     archivierten und umgesetzt-markierten Zustand im Worktree bereit (unter
     `<plan.dir>/archive/<datei>`). Markierung und Verschiebung werden **mitcommittet** und
     sind damit Teil des PRs/Merges (Umsetzungs-Doku). Die `.effective-flow/`-Artefakte bleiben im
     Haupt-Repo.
   - Führte der Workflow keine Plan-Datei, entfällt dieser Schritt.
   - Läuft der Workflow ausnahmsweise In-Place ohne Delivery (kein Worktree, keine
     Branch-/PR-/Merge-Aktion), führt der Workflow denselben Statuswechsel und
     Archiv-Move direkt im Arbeitsbaum aus; der abschließende Commit/Merge in den
     Zielbranch ist dann das Delivery-Event.
2. **Commit sicherstellen:** Alle beabsichtigten Änderungen im Liefer-Branch committen
   – Code-, Test- und Doku-Deliverables sowie die übernommene Plan-Datei – über die
   Commit-Logik aus `/effective-flow commit` (ausschließlich bekannte geänderte Dateien
   explizit stagen, konkrete Conventional-Commit-Message ableiten, niemals
   `Co-Authored-By`-Trailer setzen). Workflows, die ihre Arbeit bereits committet
   haben (z. B. `/effective-flow maintain` mit einem Commit pro Gruppe), committen hier nur
   noch die Plan-Datei nach, falls nötig. Gibt es nichts zu committen: den User
   informieren, einen automatisch erzeugten leeren Liefer-Branch entfernen und ohne
   PR/Merge enden.
3. **Abschluss-Aktion bestimmen:** Wenn `delivery.completion` einen gültigen Wert hat,
   diesen verwenden und kurz melden, dass die Aktion aus der Effective Flow-Konfiguration
   (Projektsetup-ADR) übernommen wurde. Sonst fragen:

Wenn Delivery aktiv war und kein gültiger Wert für `delivery.completion` gesetzt ist:

Verwende das `AskUserQuestion`-Tool mit folgenden Parametern:
- header: "Abschluss"
- question: "Wie soll der Liefer-Branch abgeschlossen werden?"
- multiSelect: false
- options:
  - label: "Pull-Request", description: "Branch pushen und über pr einen PR gegen den Basis-Branch erstellen"
  - label: "Merge", description: "Branch lokal in den Basis-Branch mergen, ohne PR"
  - label: "Nur Branch", description: "Branch im lokalen Repo belassen, keine weitere Aktion"

4. **Worktree zurückziehen:** Wenn ein Worktree beteiligt war, `git worktree remove
<WORKTREE_PATH>` ausführen; der Liefer-Branch bleibt im lokalen Repo erhalten.
   Schlägt das Entfernen wegen uncommitteter Reste fehl: zuerst sicherstellen, dass
   alles beabsichtigte committet ist; bleibt etwas übrig, den Worktree behalten und
   den Pfad melden.
5. **Aktion ausführen:**
   - `branch` / Nur Branch: Branch belassen, Namen und Hinweis zur späteren
     PR-Erstellung melden.
   - `merge`: Ziel ist der lokale Branch-Anteil von `delivery.baseBranch` oder der
     explizite `delivery.returnBranch`. Sicherstellen, dass der Ziel-Working-Tree
     sauber ist; sonst informieren statt zu mergen. Liegt der lokale Ziel-Branch
     hinter seinem Remote-Tracking-Ref, darauf hinweisen. Den Liefer-Branch mergen –
     Fast-Forward bevorzugen, sonst Merge-Commit; bei Konflikt stoppen, Branch
     belassen und User informieren, keine automatische Konfliktauflösung.
   - `pr`: an `/effective-flow pr` delegieren und Liefer-Branch, Basis-Branch sowie den
     Workflow-/Änderungstyp (`feat`/`fix`/`refactor`/`docs`/`chore` je nach umsetzendem
     Workflow und Wirkung) als Titel-Typ-Hinweis übergeben, damit der PR-Titel einen
     gültigen Conventional-Commit-Typ trägt — bei Squash-Merge ist er das Release-Signal.
6. **Checkout zurückstellen:** Nach erfolgreicher PR-Erstellung oder bei `branch` auf
   `delivery.returnBranch` bzw. bei `auto` auf den lokalen Branch-Anteil von
   `delivery.baseBranch` zurückwechseln, sofern der Arbeitsbaum sauber ist. Wenn der
   Rückwechsel scheitert, den tatsächlichen Branch als Seiteneffekt ausdrücklich
   melden.
