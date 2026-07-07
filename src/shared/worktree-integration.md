## Worktree-Integration

Dieser optionale Baustein verknüpft Code-ändernde Workflows mit Git-Worktrees und Pull-Requests, damit parallel auf dem lokalen Repo gearbeitet werden kann. Er ist **opt-in** über `.firmo/config.json` und standardmäßig deaktiviert. Ist der Worktree-Modus inaktiv, verhält sich der Workflow unverändert wie ohne diesen Baustein – keine Worktree-Erzeugung, keine erzwungenen Commits.

Bei aktivem Modus wirkt die Integration in zwei Momenten:

- **Setup** zu Beginn der eigentlichen Umsetzungsarbeit: ein Worktree auf dem Basis-Branch wird erzeugt; alle Umsetzungs-, Test-, Validierungs- und Doku-Phasen laufen darin.
- **Handback** in der Abschlussphase: die Arbeit wird committet, das Worktree-Verzeichnis entfernt, der Liefer-Branch bleibt im lokalen Repo, und die gewählte Abschluss-Aktion (PR, Merge oder nur Branch) wird ausgeführt.

Abgrenzung: Dieser Baustein ist **nicht** der per-Finding-Worktree-Mechanismus aus `{{SKILL:apply-review}}` (`applyReview.worktree`). Jener isoliert parallele Findings und führt Commits per Cherry-Pick auf den aktuellen Branch zurück. Dieser Baustein erzeugt genau einen Liefer-Branch ab dem Basis-Branch für PR oder Merge. Beide dürfen denselben physischen `baseDir` nutzen, da sich Session- und Pfad-Segmente unterscheiden.

### Konfiguration

Der Worktree-Modus funktioniert ohne Konfigurationsdatei (dann bleibt er deaktiviert). Falls `.firmo/config.json` vorhanden ist, darf sie diese Defaults überschreiben:

```json
{
  "worktree": {
    "enabled": false,
    "baseBranch": "origin/main",
    "branchPrefix": "sf",
    "completion": null,
    "setup": "auto",
    "baseDir": ".firmo/.worktrees"
  }
}
```

Fehlende Werte haben diese Defaults:

- `worktree.enabled`: `false` (Feature aus)
- `worktree.baseBranch`: `"origin/main"`
- `worktree.branchPrefix`: `"sf"`
- `worktree.completion`: nicht gesetzt (Abschluss-Aktion wird gefragt)
- `worktree.setup`: `"auto"`
- `worktree.baseDir`: `.firmo/.worktrees`

Gültige Werte:

- `worktree.enabled`: `true`, `false`
- `worktree.completion`: `"pr"`, `"merge"`, `"branch"`
- `worktree.setup`: `"auto"`, `"none"` oder ein expliziter Setup-Befehl als String

### Config-Migration

Führe diese Prüfung einmalig beim ersten Lesen der Config im Lauf aus – im selben Schritt wie die Modusbestimmung unten, bevor das Worktree-Setup beginnt. Wenn `.firmo/config.json` existiert, prüfe sie auf fehlende unterstützte Worktree-Schlüssel.

- Ergänze fehlende Schlüssel mit den Defaults oben. Da `worktree.enabled` per Default `false` ist, bleibt das Opt-in auch nach automatischer Migration gewahrt.
- Erhalte vorhandene gültige Werte und unbekannte Schlüssel unverändert.
- Lies die Datei direkt vor dem Schreiben erneut frisch ein, damit zwischenzeitliche Änderungen nicht überschrieben werden.
- Wenn die Datei ungültiges JSON enthält: nicht schreiben, sichere Defaults für diesen Lauf verwenden und den User mit Pfad und Fehler informieren.
- Wenn ein bekannter Schlüssel einen ungültigen Wert enthält: nicht überschreiben, sicheren Default für diesen Lauf verwenden und den User über den Schlüssel informieren.
- Wenn die Migration Schlüssel ergänzt hat: teile dem User einmal in diesem Workflow-Lauf mit, dass `.firmo/config.json` migriert wurde, und nenne die ergänzten Schlüssel.
- Speichere nach erfolgreicher Migration den Status in `.firmo/memory.json` unter `configMigration.worktree`, ohne vorhandene Felder wie `lastFindingNumber` zu verlieren. Andere Unterschlüssel von `configMigration` (`review`, `applyReview`, `tracker`) unverändert erhalten.
- Legacy: Liegt in `configMigration` noch ein alter flacher Eintrag (Felder `version`/`appliedAt`/`addedKeys` direkt unter `configMigration`), darf er beim nächsten Schreiben in die Unterschlüssel-Form überführt bzw. ersetzt werden – die Migrationen sind idempotent config-getrieben; die Zuordnung zum Bereich ist optional per `addedKeys`-Präfix möglich.

Memory-Eintrag:

```json
{
  "configMigration": {
    "worktree": {
      "version": "worktree-integration-v1",
      "appliedAt": "YYYY-MM-DDTHH:mm:ssZ",
      "addedKeys": ["worktree.enabled", "worktree.baseBranch"]
    }
  }
}
```

### Modus bestimmen (Setup-Phase)

Bestimme zu Beginn der Umsetzungsarbeit den effektiven Modus:

- Basis ist `worktree.enabled` aus der Config.
- Ein Per-Run-Wunsch des Users hat Vorrang: Verlangt der User ausdrücklich PR-, Branch- oder Worktree-Arbeit, ist der Worktree-Modus aktiv, auch wenn `enabled: false`. Verlangt der User ausdrücklich In-Place-Arbeit („ohne Worktree", „direkt auf dem aktuellen Branch"), bleibt der bisherige In-Place-Modus aktiv, auch wenn `enabled: true`.
- Ist der Modus inaktiv: keine weiteren Schritte aus diesem Baustein ausführen.

### Worktree-Setup

Wenn der Worktree-Modus aktiv ist:

1. Vorbedingungen prüfen: `git worktree` ist verfügbar und der Basis-Ref ist auflösbar. Ist `worktree.baseBranch` ein Remote-Ref (z. B. `origin/main`) und es existiert kein passender Remote, oder der Ref lässt sich nicht auflösen: informiere den User und frage, ob In-Place fortgefahren oder abgebrochen werden soll. Wechsle nicht still auf einen anderen Branch. Hat der aktuelle HEAD relevante uncommittete Änderungen oder lokale Commits, die nicht in `worktree.baseBranch` enthalten sind: weise darauf hin, dass der frisch aus dem Basis-Branch erzeugte Worktree diese Arbeit nicht enthält, und hole eine Bestätigung ein.
2. Ist `worktree.baseBranch` ein Remote-Ref: zuerst den Stand holen (`git fetch <remote> <branch>`), damit der Worktree auf dem aktuellen Remote-Stand startet.
3. Repo-Namen bestimmen aus `basename "$(git rev-parse --show-toplevel)"` und als BaseDir `worktree.baseDir` (Default `.firmo/.worktrees`) verwenden. Worktree-Pfad: `BASE_DIR/REPO_NAME/SESSION_ID`.
4. Liefer-Branch-Namen bilden: `<branchPrefix>/<skill>/<slug>`, z. B. `sf/build/user-login`. Den Slug aus dem Plan-Titel oder der Aufgabenbeschreibung ableiten (Kebab-Case). Existiert der Branch-Name bereits, ein numerisches Suffix anhängen und den gewählten Namen melden.
5. Worktree und Liefer-Branch erzeugen: `git worktree add <WORKTREE_PATH> -b <BRANCH_NAME> <BASE_REF>`.
6. Setup gemäß `worktree.setup` im Worktree ausführen und den Modus vorher kurz anzeigen:
   - `auto` oder fehlend: nach Lockfile entscheiden – `pnpm-lock.yaml` → `pnpm install --frozen-lockfile --prefer-offline`, `package-lock.json` → `npm ci`, `yarn.lock` → `yarn install --frozen-lockfile`, `Cargo.toml` → `cargo fetch --locked`, `go.mod` → `go mod download`, `uv.lock` → `uv sync --frozen`, `poetry.lock` → `poetry install --sync`, keine bekannte Datei → kein Setup.
   - `none`: kein Setup ausführen.
   - String-Wert: dieses explizite Kommando im Worktree ausführen.
7. Alle nachfolgenden Phasen, die Code-, Test- oder Doku-Dateien erzeugen oder ändern, mit Arbeitsverzeichnis im Worktree ausführen. Das gilt auch für die Abschlussphase bis einschließlich Handback: der finale Validator-Lauf und der Formatter prüfen bzw. formatieren die Liefer-Dateien im Worktree, erst danach folgt `git worktree remove`.

### Was im Worktree liegt und was im Haupt-Repo bleibt

- **Im Worktree (Teil des Liefer-Branches):** die eigentlichen Code-, Test- und Doku-Deliverables des Workflows.
- **Im Liefer-Branch, aber im Haupt-Repo autorisiert – die Plan-Datei:** Die Plan-Datei unter `docs/plan/` gehört in ihrem finalen Zustand (Statusmarker auf abgeschlossen, Findings-Zusammenfassung, Verweis auf ausgelagerte Review-Reports) mit in den PR, damit der Plan mit dem Code reist, den er beschreibt. Sie wird weiterhin im Haupt-Repo autorisiert – dort laufen Nummern-Reservierung und Statusaktualisierung, und die `.firmo/`-Buchhaltung referenziert sie –, ihr finaler Stand wird aber beim Handback in den Worktree übernommen und dort mitcommittet (siehe „Handback"). Der Worktree entsteht frisch aus dem Basis-Branch und enthält die Plan-Datei zunächst nicht; das Handback bringt sie hinein. Weil der Plan damit auf dem Liefer-Branch entsteht, greift bis zum Merge die reguläre Kollisionsauflösung der Plan-Nummern-Konvention für über Branches erzeugte Pläne; Referenzen aus den Review-Reports lösen bis dahin über Nummer bzw. Slug auf.
- **Nur im Haupt-Repo (nicht im Liefer-Branch):** die reine Plugin-Buchhaltung und der Laufzeitstatus, also alle `.firmo/`-Artefakte (`memory.json`, Review-Reports unter `.firmo/review/`, Config-Migrationsstatus und die Wisdom-Datei). Diese Dateien werden immer im Haupt-Repo gelesen und geschrieben, nie im frisch aus dem Basis-Branch erzeugten Worktree. So bleibt der Liefer-Branch ein Deliverable-Diff aus Code, Tests, Doku und Plan-Datei, der spätere `{{SKILL:apply-review}}`-Fluss findet die Review-Reports im Haupt-Repo, und der Worktree enthält keine untrackten `.firmo/`-Reste, die `git worktree remove` blockieren würden.

### Handback und Abschluss-Aktion (Abschlussphase)

Im Anschluss an die reguläre Abschlusslogik des Workflows (inklusive Goal-Verifikation und Plan-Datei-Aktualisierung):

1. **Plan-Datei in den Liefer-Branch übernehmen:** Sofern der Workflow eine Plan-Datei geführt hat, stelle ihren finalen Zustand aus dem Haupt-Repo im Worktree unter demselben Pfad `docs/plan/NNNN-…md` bereit: in den Worktree kopieren bzw. dort anlegen, falls der Basis-Branch sie noch nicht enthält, sonst die im Worktree vorhandene Datei auf den finalen Stand bringen. Diese Datei wird im nächsten Schritt mitcommittet und ist damit Teil des PRs. Entferne anschließend die dadurch redundante, untrackte Plan-Datei aus dem Arbeitsbaum des Haupt-Repos, damit sie nicht dangling liegen bleibt und ein späterer `merge`-Abschluss nicht an einer „untracked working tree file"-Kollision scheitert. Die `.firmo/`-Artefakte (`memory.json`, Review-Reports, Wisdom-Datei) bleiben unverändert im Haupt-Repo. Führte der Workflow keine Plan-Datei, entfällt dieser Schritt.
2. **Commit sicherstellen:** Alle beabsichtigten Änderungen im Worktree committen – die Code-, Test- und Doku-Deliverables sowie die in Schritt 1 übernommene Plan-Datei – über die Commit-Logik aus `{{SKILL:commit}}` (ausschließlich die bekannten geänderten Dateien explizit stagen, eine konkrete Conventional-Commit-Message ableiten, niemals `Co-Authored-By`-Trailer setzen). Workflows, die ihre Arbeit bereits committet haben (z. B. `{{SKILL:maintain}}` mit einem Commit pro Gruppe), committen hier nur noch die in Schritt 1 übernommene Plan-Datei nach, falls sie noch nicht Teil eines Commits ist. Gibt es nichts zu committen: den User informieren, den leeren Liefer-Branch entfernen und ohne PR/Merge enden.
3. **Abschluss-Aktion bestimmen:** Wenn `worktree.completion` einen gültigen Wert hat, diesen verwenden und kurz melden, dass die Aktion aus `.firmo/config.json` übernommen wurde. Sonst fragen:

```ask
when: der Worktree-Modus aktiv war und kein gültiger Wert für `worktree.completion` gesetzt ist
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

4. **Worktree zurückziehen:** `git worktree remove <WORKTREE_PATH>` ausführen; der Liefer-Branch bleibt im lokalen Repo erhalten. Schlägt das Entfernen wegen uncommitteter Reste fehl: zuerst sicherstellen, dass alles committet ist; bleibt etwas übrig, den Worktree behalten und den Pfad melden.
5. **Aktion ausführen:**
   - `branch` / Nur Branch: den Branch belassen, seinen Namen und einen Hinweis zur späteren PR-Erstellung melden.
   - `merge`: Ziel ist der lokale Branch-Anteil von `worktree.baseBranch` (bei `origin/main` der lokale `main`). Vorgehen: den ursprünglich ausgecheckten Branch merken; sicherstellen, dass der aktuelle Arbeitsbaum sauber ist (sonst informieren statt zu mergen); den Ziel-Branch auschecken. Liegt der lokale Ziel-Branch hinter seinem Remote-Tracking-Ref, weise darauf hin (Fast-Forward kann sonst scheitern oder einen unerwarteten Merge-Commit erzeugen). Den Liefer-Branch mergen – Fast-Forward bevorzugen, sonst Merge-Commit; bei Konflikt stoppen, den Branch belassen und den User informieren, keine automatische Konfliktauflösung. Nach erfolgreichem Merge den ursprünglich ausgecheckten Branch wiederherstellen; ist das nicht möglich, den Branch-Wechsel als Seiteneffekt ausdrücklich melden.
   - `pr` / Pull-Request: an `{{SKILL:pr}}` delegieren und Liefer-Branch sowie Basis-Branch übergeben.
