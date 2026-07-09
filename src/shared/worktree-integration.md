## Delivery- und Worktree-Integration

Dieser optionale Baustein verknüpft code-ändernde Workflows mit Liefer-Branches,
Pull-Requests und optionalen Git-Worktrees. Die allgemeinen Werte für Basis-Branch,
Branch-Namensbildung und Abschluss-Aktion liegen im Config-Block `delivery`; der
Block `worktree` steuert nur noch, ob und wie die Umsetzung in einem separaten
Git-Worktree läuft.

Ohne aktive Delivery- oder Worktree-Anforderung verhalten sich die Workflows wie
bisher: keine erzwungene Branch-Erzeugung, keine erzwungenen Commits und keine
automatische PR-Erstellung.

### Rollen der Config-Blöcke

- **`delivery`** beschreibt den Liefer-Branch und dessen Abschluss: Basis-Ref,
  Branch-Präfix, Abschluss-Aktion und Rückwechsel-Ziel.
- **`worktree`** beschreibt ausschließlich den Ausführungsort: ob ein Worktree
  verwendet wird, wo er liegt und welches Setup darin läuft.

Abgrenzung: Dieser Baustein ist **nicht** der per-Finding-Worktree-Mechanismus aus
`{{SKILL:apply-review}}` (`applyReview.worktree`). Jener isoliert parallele lokale
Review-Findings und führt Commits per Cherry-Pick auf den aktuellen Branch zurück.
Dieser Baustein erzeugt Liefer-Branches für PR, Merge oder „nur Branch“. Beide
dürfen denselben physischen `baseDir` nutzen, da Session- und Pfad-Segmente
unterscheiden.

### Konfiguration

Falls `.firmo/config.json` vorhanden ist, darf sie diese Defaults überschreiben:

```json
{
  "delivery": {
    "enabled": false,
    "baseBranch": "origin/main",
    "branchPrefix": "firmo",
    "completion": null,
    "returnBranch": "auto"
  },
  "worktree": {
    "enabled": false,
    "setup": "auto",
    "baseDir": ".firmo/.worktrees"
  }
}
```

Fehlende Werte haben diese Defaults:

- `delivery.enabled`: `false` (keine automatische Liefer-Branch-/PR-Erzeugung)
- `delivery.baseBranch`: `"origin/main"`
- `delivery.branchPrefix`: `"firmo"`
- `delivery.completion`: nicht gesetzt (Abschluss-Aktion wird gefragt, wenn Delivery
  aktiv ist)
- `delivery.returnBranch`: `"auto"` (lokaler Branch-Anteil aus `delivery.baseBranch`)
- `worktree.enabled`: `false` (kein separater Worktree)
- `worktree.setup`: `"auto"`
- `worktree.baseDir`: `.firmo/.worktrees`

Gültige Werte:

- `delivery.enabled`: `true`, `false`
- `delivery.completion`: `"pr"`, `"merge"`, `"branch"`
- `delivery.returnBranch`: `"auto"` oder ein lokaler Branchname als String
- `worktree.enabled`: `true`, `false`
- `worktree.setup`: `"auto"`, `"none"` oder ein expliziter Setup-Befehl als String

### Legacy-Fallback und Config-Migration

Ältere Configs können die allgemeinen Lieferwerte noch unter `worktree.*` tragen.
Lies Werte in dieser Reihenfolge:

1. neuer Wert aus `delivery.*`
2. Legacy-Wert aus `worktree.baseBranch`, `worktree.branchPrefix` oder
   `worktree.completion`
3. Default

Führe diese Prüfung einmalig beim ersten Lesen der Config im Lauf aus. Wenn
`.firmo/config.json` existiert, prüfe sie auf fehlende unterstützte `delivery`- und
`worktree`-Schlüssel.

- Ergänze fehlende `delivery.*`-Schlüssel nicht-destruktiv. Wenn ein Legacy-Wert in
  `worktree.baseBranch`, `worktree.branchPrefix` oder `worktree.completion` existiert
  und gültig ist, übernimm ihn in den entsprechenden `delivery.*`-Schlüssel; sonst
  verwende den Default.
- Ergänze fehlende Worktree-spezifische Schlüssel (`worktree.enabled`,
  `worktree.setup`, `worktree.baseDir`) mit den Defaults oben.
- Entferne alte allgemeine `worktree.*`-Schlüssel nicht automatisch. Sie bleiben als
  Legacy-Fallback lesbar.
- Erhalte vorhandene gültige Werte und unbekannte Schlüssel unverändert.
- Lies die Datei direkt vor dem Schreiben erneut frisch ein, damit zwischenzeitliche
  Änderungen nicht überschrieben werden.
- Wenn die Datei ungültiges JSON enthält: nicht schreiben, sichere Defaults für
  diesen Lauf verwenden und den User mit Pfad und Fehler informieren.
- Wenn ein bekannter Schlüssel einen ungültigen Wert enthält: nicht überschreiben,
  sicheren Default für diesen Lauf verwenden und den User über den Schlüssel
  informieren.
- Wenn die Migration Schlüssel ergänzt hat: teile dem User einmal in diesem
  Workflow-Lauf mit, dass `.firmo/config.json` migriert wurde, und nenne die
  ergänzten Schlüssel.
- Speichere nach erfolgreicher Migration den Status in `.firmo/memory.json` unter
  `configMigration.delivery`, ohne vorhandene Felder wie `lastFindingNumber` zu
  verlieren. Andere Unterschlüssel von `configMigration` (`review`, `applyReview`,
  `tracker`, `worktree`) unverändert erhalten.

Memory-Eintrag:

```json
{
  "configMigration": {
    "delivery": {
      "version": "delivery-lifecycle-v1",
      "appliedAt": "YYYY-MM-DDTHH:mm:ssZ",
      "addedKeys": ["delivery.enabled", "delivery.baseBranch"]
    }
  }
}
```

### Modus bestimmen (Setup-Phase)

Bestimme zu Beginn der eigentlichen Umsetzungsarbeit den effektiven Modus:

- Delivery ist aktiv, wenn `delivery.enabled: true` gesetzt ist oder der User im Lauf
  ausdrücklich PR-, Branch- oder Merge-Arbeit verlangt.
- Worktree-Ausführung ist aktiv, wenn `worktree.enabled: true` gesetzt ist oder der
  User ausdrücklich Worktree-Arbeit verlangt.
- Verlangt der User ausdrücklich In-Place-Arbeit („ohne Worktree“, „direkt auf dem
  aktuellen Branch“), bleibt die Worktree-Ausführung aus. Delivery kann trotzdem
  aktiv sein und dann im Haupt-Repo einen Liefer-Branch erzeugen.
- Ist weder Delivery noch Worktree aktiv: keine weiteren Schritte aus diesem
  Baustein ausführen.

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
   BaseDir `worktree.baseDir` (Default `.firmo/.worktrees`) verwenden. Worktree-Pfad:
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
4. Im Worktree committen und `{{SKILL:pr}}` gegen `delivery.baseBranch` ausführen.
5. Worktree entfernen, Liefer-Branch lokal belassen und Haupt-Checkout unverändert
   lassen. Nicht ausgewählte Änderungen im Haupt-Checkout bleiben unberührt.

Nicht erlaubt ist eine heuristische Teil-Diff-Auswahl nach „alle geänderten Dateien
außer docs/plan“. Der Workflow muss die einzuschließenden Dateien kennen oder
nachfragen. Dadurch bleiben parallel neu angelegte Pläne, `.firmo/`-State und andere
lokale Arbeitsdateien zuverlässig außerhalb des PRs.

### Was im Liefer-Branch liegt und was im Haupt-Repo bleibt

- **Im Liefer-Branch:** die eigentlichen Code-, Test- und Doku-Deliverables des
  Workflows sowie – sofern der Workflow eine Plan-Datei geführt hat – deren finaler
  Zustand.
- **Nur im Haupt-Repo:** reine Firmo-Buchhaltung und Laufzeitstatus, also alle
  `.firmo/`-Artefakte (`memory.json`, Review-Reports unter `.firmo/review/`,
  Config-Migrationsstatus und Wisdom-Dateien).

### Handback und Abschluss-Aktion (Abschlussphase)

Im Anschluss an die reguläre Abschlusslogik des Workflows (inklusive
Goal-Verifikation und Plan-Datei-Aktualisierung):

**Bestehende PRs aktualisieren:** Wenn der Liefer-Branch bereits einen Pull-Request
hat und nachträglich Änderungen nötig sind, werden diese Änderungen immer als neue
Commits auf demselben PR-Branch erstellt und gepusht. Bestehende PR-Commits dürfen
nicht per `commit --amend`, interaktivem Rebase, Squash oder Force-Push
umgeschrieben werden. Scheitert ein normaler Push wegen divergierter Remote-History,
stoppe und melde den Konflikt, statt History zu überschreiben.

1. **Plan-Datei in den Liefer-Branch übernehmen:** Sofern der Workflow eine
   Plan-Datei geführt hat und die Umsetzung in einem Worktree oder Teil-Diff-Worktree
   lief, stelle ihren finalen Zustand aus dem Haupt-Repo im Worktree unter demselben
   Pfad `docs/plan/NNNN-…md` bereit. Diese Datei wird mitcommittet und ist damit
   Teil des PRs. Die `.firmo/`-Artefakte bleiben im Haupt-Repo. Führte der Workflow
   keine Plan-Datei oder läuft er bereits im Liefer-Branch des Haupt-Repos, entfällt
   dieser Kopierschritt.
2. **Commit sicherstellen:** Alle beabsichtigten Änderungen im Liefer-Branch committen
   – Code-, Test- und Doku-Deliverables sowie die übernommene Plan-Datei – über die
   Commit-Logik aus `{{SKILL:commit}}` (ausschließlich bekannte geänderte Dateien
   explizit stagen, konkrete Conventional-Commit-Message ableiten, niemals
   `Co-Authored-By`-Trailer setzen). Workflows, die ihre Arbeit bereits committet
   haben (z. B. `{{SKILL:maintain}}` mit einem Commit pro Gruppe), committen hier nur
   noch die Plan-Datei nach, falls nötig. Gibt es nichts zu committen: den User
   informieren, einen automatisch erzeugten leeren Liefer-Branch entfernen und ohne
   PR/Merge enden.
3. **Abschluss-Aktion bestimmen:** Wenn `delivery.completion` einen gültigen Wert hat,
   diesen verwenden und kurz melden, dass die Aktion aus `.firmo/config.json`
   übernommen wurde. Sonst fragen:

```ask
when: Delivery aktiv war und kein gültiger Wert für `delivery.completion` gesetzt ist
header: Abschluss
question: Wie soll der Liefer-Branch abgeschlossen werden?
options:
  - label: Pull-Request
    description: Branch pushen und über pr einen PR gegen den Basis-Branch erstellen
  - label: Merge
    description: Branch lokal in den Basis-Branch mergen, ohne PR
  - label: Nur Branch
    description: Branch im lokalen Repo belassen, keine weitere Aktion
```

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
   - `pr`: an `{{SKILL:pr}}` delegieren und Liefer-Branch sowie Basis-Branch
     übergeben.
6. **Checkout zurückstellen:** Nach erfolgreicher PR-Erstellung oder bei `branch` auf
   `delivery.returnBranch` bzw. bei `auto` auf den lokalen Branch-Anteil von
   `delivery.baseBranch` zurückwechseln, sofern der Arbeitsbaum sauber ist. Wenn der
   Rückwechsel scheitert, den tatsächlichen Branch als Seiteneffekt ausdrücklich
   melden.
