## Worktree-Integration

Dieser optionale Baustein verknüpft Code-ändernde Workflows mit Git-Worktrees und Pull-Requests, damit parallel auf dem lokalen Repo gearbeitet werden kann. Er ist **opt-in** über `.sf-plugin/config.json` und standardmäßig deaktiviert. Ist der Worktree-Modus inaktiv, verhält sich der Workflow unverändert wie ohne diesen Baustein – keine Worktree-Erzeugung, keine erzwungenen Commits.

Bei aktivem Modus wirkt die Integration in zwei Momenten:

- **Setup** zu Beginn der eigentlichen Umsetzungsarbeit: ein Worktree auf dem Basis-Branch wird erzeugt; alle Umsetzungs-, Test-, Validierungs- und Doku-Phasen laufen darin.
- **Handback** in der Abschlussphase: die Arbeit wird committet, das Worktree-Verzeichnis entfernt, der Liefer-Branch bleibt im lokalen Repo, und die gewählte Abschluss-Aktion (PR, Merge oder nur Branch) wird ausgeführt.

Abgrenzung: Dieser Baustein ist **nicht** der per-Finding-Worktree-Mechanismus aus `{{SKILL:sf-apply-review}}` (`applyReview.worktree`). Jener isoliert parallele Findings und führt Commits per Cherry-Pick auf den aktuellen Branch zurück. Dieser Baustein erzeugt genau einen Liefer-Branch ab dem Basis-Branch für PR oder Merge. Beide dürfen denselben physischen `baseDir` nutzen, da sich Session- und Pfad-Segmente unterscheiden.

### Konfiguration

Der Worktree-Modus funktioniert ohne Konfigurationsdatei (dann bleibt er deaktiviert). Falls `.sf-plugin/config.json` vorhanden ist, darf sie diese Defaults überschreiben:

```json
{
  "worktree": {
    "enabled": false,
    "baseBranch": "origin/main",
    "branchPrefix": "sf",
    "completion": null,
    "setup": "auto",
    "baseDir": ".sf-plugin/.worktrees"
  }
}
```

Fehlende Werte haben diese Defaults:

- `worktree.enabled`: `false` (Feature aus)
- `worktree.baseBranch`: `"origin/main"`
- `worktree.branchPrefix`: `"sf"`
- `worktree.completion`: nicht gesetzt (Abschluss-Aktion wird gefragt)
- `worktree.setup`: `"auto"`
- `worktree.baseDir`: `.sf-plugin/.worktrees`

Gültige Werte:

- `worktree.enabled`: `true`, `false`
- `worktree.completion`: `"pr"`, `"merge"`, `"branch"`
- `worktree.setup`: `"auto"`, `"none"` oder ein expliziter Setup-Befehl als String

### Config-Migration

Führe diese Prüfung einmalig beim ersten Lesen der Config im Lauf aus – im selben Schritt wie die Modusbestimmung unten, bevor das Worktree-Setup beginnt. Wenn `.sf-plugin/config.json` existiert, prüfe sie auf fehlende unterstützte Worktree-Schlüssel.

- Ergänze fehlende Schlüssel mit den Defaults oben. Da `worktree.enabled` per Default `false` ist, bleibt das Opt-in auch nach automatischer Migration gewahrt.
- Erhalte vorhandene gültige Werte und unbekannte Schlüssel unverändert.
- Lies die Datei direkt vor dem Schreiben erneut frisch ein, damit zwischenzeitliche Änderungen nicht überschrieben werden.
- Wenn die Datei ungültiges JSON enthält: nicht schreiben, sichere Defaults für diesen Lauf verwenden und den User mit Pfad und Fehler informieren.
- Wenn ein bekannter Schlüssel einen ungültigen Wert enthält: nicht überschreiben, sicheren Default für diesen Lauf verwenden und den User über den Schlüssel informieren.
- Wenn die Migration Schlüssel ergänzt hat: teile dem User einmal in diesem Workflow-Lauf mit, dass `.sf-plugin/config.json` migriert wurde, und nenne die ergänzten Schlüssel.
- Speichere nach erfolgreicher Migration den Status in `.sf-plugin/memory.json` unter `configMigration`, ohne vorhandene Felder wie `lastFindingNumber` zu verlieren.

### Modus bestimmen (Setup-Phase)

Bestimme zu Beginn der Umsetzungsarbeit den effektiven Modus:

- Basis ist `worktree.enabled` aus der Config.
- Ein Per-Run-Wunsch des Users hat Vorrang: Verlangt der User ausdrücklich PR-, Branch- oder Worktree-Arbeit, ist der Worktree-Modus aktiv, auch wenn `enabled: false`. Verlangt der User ausdrücklich In-Place-Arbeit („ohne Worktree", „direkt auf dem aktuellen Branch"), bleibt der bisherige In-Place-Modus aktiv, auch wenn `enabled: true`.
- Ist der Modus inaktiv: keine weiteren Schritte aus diesem Baustein ausführen.

### Worktree-Setup

Wenn der Worktree-Modus aktiv ist:

1. Vorbedingungen prüfen: `git worktree` ist verfügbar und der Basis-Ref ist auflösbar. Ist `worktree.baseBranch` ein Remote-Ref (z. B. `origin/main`) und es existiert kein passender Remote, oder der Ref lässt sich nicht auflösen: informiere den User und frage, ob In-Place fortgefahren oder abgebrochen werden soll. Wechsle nicht still auf einen anderen Branch. Hat der aktuelle HEAD relevante uncommittete Änderungen oder lokale Commits, die nicht in `worktree.baseBranch` enthalten sind: weise darauf hin, dass der frisch aus dem Basis-Branch erzeugte Worktree diese Arbeit nicht enthält, und hole eine Bestätigung ein.
2. Ist `worktree.baseBranch` ein Remote-Ref: zuerst den Stand holen (`git fetch <remote> <branch>`), damit der Worktree auf dem aktuellen Remote-Stand startet.
3. Repo-Namen bestimmen aus `basename "$(git rev-parse --show-toplevel)"` und als BaseDir `worktree.baseDir` (Default `.sf-plugin/.worktrees`) verwenden. Worktree-Pfad: `BASE_DIR/REPO_NAME/SESSION_ID`.
4. Liefer-Branch-Namen bilden: `<branchPrefix>/<skill>/<slug>`, z. B. `sf/build/user-login`. Den Slug aus dem Plan-Titel oder der Aufgabenbeschreibung ableiten (Kebab-Case). Existiert der Branch-Name bereits, ein numerisches Suffix anhängen und den gewählten Namen melden.
5. Worktree und Liefer-Branch erzeugen: `git worktree add <WORKTREE_PATH> -b <BRANCH_NAME> <BASE_REF>`.
6. Setup gemäß `worktree.setup` im Worktree ausführen und den Modus vorher kurz anzeigen:
   - `auto` oder fehlend: nach Lockfile entscheiden – `pnpm-lock.yaml` → `pnpm install --frozen-lockfile --prefer-offline`, `package-lock.json` → `npm ci`, `yarn.lock` → `yarn install --frozen-lockfile`, `Cargo.toml` → `cargo fetch --locked`, `go.mod` → `go mod download`, `uv.lock` → `uv sync --frozen`, `poetry.lock` → `poetry install --sync`, keine bekannte Datei → kein Setup.
   - `none`: kein Setup ausführen.
   - String-Wert: dieses explizite Kommando im Worktree ausführen.
7. Alle nachfolgenden Phasen, die Code-, Test- oder Doku-Dateien erzeugen oder ändern, mit Arbeitsverzeichnis im Worktree ausführen. Das gilt auch für die Abschlussphase bis einschließlich Handback: der finale Validator-Lauf und der Formatter prüfen bzw. formatieren die Liefer-Dateien im Worktree, erst danach folgt `git worktree remove`.

### Was im Worktree liegt und was im Haupt-Repo bleibt

- **Im Worktree (Teil des Liefer-Branches):** die eigentlichen Code-, Test- und Doku-Deliverables des Workflows.
- **Im Haupt-Repo (nicht im Liefer-Branch):** projektbezogene Buchhaltung und Plugin-Laufzeitstatus. Dazu gehören die Plan-Datei unter `docs/plan/` inklusive ihrer Statusaktualisierung sowie alle `.sf-plugin/`-Artefakte (`memory.json`, Review-Reports unter `.sf-plugin/review/`, Config-Migrationsstatus und die Wisdom-Datei). Diese Dateien werden immer im Haupt-Repo gelesen und geschrieben, nie im frisch aus dem Basis-Branch erzeugten Worktree. So bleibt der Liefer-Branch ein sauberer Deliverable-Diff, der spätere `{{SKILL:sf-apply-review}}`-Fluss findet die Review-Reports im Haupt-Repo, und der Worktree enthält keine untrackten `.sf-plugin/`-Reste, die `git worktree remove` blockieren würden. Die Plan-Status-Aktualisierung wirkt dadurch lokal im Haupt-Repo und ist bewusst nicht Teil des PRs.

### Handback und Abschluss-Aktion (Abschlussphase)

Im Anschluss an die reguläre Abschlusslogik des Workflows (inklusive Goal-Verifikation und Plan-Datei-Aktualisierung):

1. **Commit sicherstellen:** Alle beabsichtigten Änderungen im Worktree committen – über die Commit-Logik aus `{{SKILL:sf-commit}}` (ausschließlich die bekannten geänderten Dateien explizit stagen, eine konkrete Conventional-Commit-Message ableiten, niemals `Co-Authored-By`-Trailer setzen). Workflows, die ihre Arbeit bereits committet haben (z. B. `{{SKILL:sf-maintain}}` mit einem Commit pro Gruppe), haben hier nichts mehr zu committen. Gibt es nichts zu committen: den User informieren, den leeren Liefer-Branch entfernen und ohne PR/Merge enden.
2. **Abschluss-Aktion bestimmen:** Wenn `worktree.completion` einen gültigen Wert hat, diesen verwenden und kurz melden, dass die Aktion aus `.sf-plugin/config.json` übernommen wurde. Sonst fragen:

```ask
when: der Worktree-Modus aktiv war und kein gültiger Wert für `worktree.completion` gesetzt ist
header: Abschluss
question: Wie soll der Liefer-Branch abgeschlossen werden?
options:
  - label: Pull-Request
    description: Branch pushen und über sf-pr einen PR gegen den Basis-Branch erstellen
  - label: Merge
    description: Branch lokal in den Basis-Branch mergen, ohne PR
  - label: Nur Branch
    description: Branch im lokalen Repo belassen, keine weitere Aktion
```

3. **Worktree zurückziehen:** `git worktree remove <WORKTREE_PATH>` ausführen; der Liefer-Branch bleibt im lokalen Repo erhalten. Schlägt das Entfernen wegen uncommitteter Reste fehl: zuerst sicherstellen, dass alles committet ist; bleibt etwas übrig, den Worktree behalten und den Pfad melden.
4. **Aktion ausführen:**
   - `branch` / Nur Branch: den Branch belassen, seinen Namen und einen Hinweis zur späteren PR-Erstellung melden.
   - `merge`: Ziel ist der lokale Branch-Anteil von `worktree.baseBranch` (bei `origin/main` der lokale `main`). Vorgehen: den ursprünglich ausgecheckten Branch merken; sicherstellen, dass der aktuelle Arbeitsbaum sauber ist (sonst informieren statt zu mergen); den Ziel-Branch auschecken. Liegt der lokale Ziel-Branch hinter seinem Remote-Tracking-Ref, weise darauf hin (Fast-Forward kann sonst scheitern oder einen unerwarteten Merge-Commit erzeugen). Den Liefer-Branch mergen – Fast-Forward bevorzugen, sonst Merge-Commit; bei Konflikt stoppen, den Branch belassen und den User informieren, keine automatische Konfliktauflösung. Nach erfolgreichem Merge den ursprünglich ausgecheckten Branch wiederherstellen; ist das nicht möglich, den Branch-Wechsel als Seiteneffekt ausdrücklich melden.
   - `pr` / Pull-Request: an `{{SKILL:sf-pr}}` delegieren und Liefer-Branch sowie Basis-Branch übergeben.
