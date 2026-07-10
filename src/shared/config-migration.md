## Config-Migration

Dieser geteilte Baustein konsolidiert `.firmo/config.json` **einmalig vollständig** auf das
aktuelle Schema. Er ersetzt die früheren, über einzelne Bausteine verstreuten
per-Block-Migrationen (`review`, `applyReview`, `tracker`, `delivery`/`worktree`). Er läuft
beim **ersten Lesen der Config** in einem Lauf und ist idempotent: Nach erfolgreichem
Abschluss verhindert eine Migrations-Version in `.firmo/memory.json` einen zweiten Lauf.

Existiert keine `.firmo/config.json`, wird sie **nicht** allein für die Migration angelegt.

### Zwei Ausführungspfade

**Deterministischer Pfad – läuft in jedem config-lesenden Skill, nicht-blockierend.** Alle
eindeutigen Abbildungen werden ohne Rückfrage ausgeführt und zurückgeschrieben. Da nie
gefragt wird, bleibt ein autonomer bzw. `/goal`-Lauf frei von blockierenden Config-Dialogen.

**Rückfrage-Pfad – ausschließlich in `{{SKILL:setup}}`.** Ein Wert, der sich nicht eindeutig
auf genau ein neues Feld abbilden lässt, oder ein optionales Upgrade wird **nicht** von
einem beliebigen Skill entschieden: Der laufende Skill nutzt einen sicheren Default für den
Lauf, lässt das betroffene Feld unverändert, meldet den offenen Punkt kurz und verweist auf
`{{SKILL:setup}}`. Nur `{{SKILL:setup}}` stellt die eigentlichen Migrations-Rückfragen.

### Deterministische Abbildungen (ohne Rückfrage)

- Lieferwerte aus dem `worktree`-Block nach `delivery` verschieben, sofern dort noch nicht
  gesetzt: `worktree.baseBranch` → `delivery.baseBranch`, `worktree.branchPrefix` →
  `delivery.branchPrefix`, `worktree.completion` → `delivery.completion` (werterhaltend;
  `null` bleibt `null` = „beim Lauf fragen“). Danach diese drei Legacy-Schlüssel aus dem
  `worktree`-Block entfernen.
- `delivery.enabled` **entfernen** (entwertet – Delivery ist durch Worktree/Branch
  impliziert).
- Fehlende Schlüssel mit ihren Defaults ergänzen (additiv):
  - `plan.dir` → `"docs/plan"`
  - `worktree.enabled` → `true`, `worktree.setup` → `"auto"`, `worktree.baseDir` →
    `".firmo/.worktrees"`
  - `delivery.baseBranch` → `"origin/main"`, `delivery.branchPrefix` → `"firmo"`,
    `delivery.completion` → `"merge"`, `delivery.returnBranch` → `"auto"`
  - `tracker.mode` → `"local"`, `tracker.remoteToolOverride` → `"auto"`
  - `review`- und `applyReview`-Schlüssel gemäß den Defaults ihrer Quell-Skills
    (`{{SKILL:review}}` bzw. `{{SKILL:apply-review}}`)
- Bereits gesetzte gültige Werte bleiben **unverändert** (auch ein explizites
  `worktree.enabled: false` – es wird nicht auf `true` gedreht).
- Nicht von Firmo stammende **Fremd-Schlüssel** bleiben unverändert erhalten. Nur veraltete
  bzw. umbenannte Firmo-Schlüssel (z. B. `delivery.enabled`, die verschobenen
  `worktree.*`-Lieferwerte) werden entfernt.

### Rückfrage-/Upgrade-Fälle (nur `{{SKILL:setup}}`)

- Optionales Upgrade von `delivery.completion: null` („beim Lauf fragen“) auf den neuen
  Default `merge`.
- Jeder Legacy-Wert, der sich nicht eindeutig auf genau ein neues Feld abbilden lässt.

Außerhalb von `{{SKILL:setup}}` werden solche Fälle nicht entschieden: sicherer Default für
den Lauf, Feld unverändert lassen, Hinweis auf `{{SKILL:setup}}`.

### Sicherheit und Persistenz

- Lies die Datei direkt vor dem Schreiben erneut frisch ein, damit zwischenzeitliche
  Änderungen nicht überschrieben werden.
- Enthält die Datei ungültiges JSON: **nicht** schreiben, sichere Defaults für diesen Lauf
  verwenden und den User mit Pfad und Fehler informieren; die Migration läuft dann nicht.
- Enthält ein bekannter Schlüssel einen ungültigen Wert: nicht überschreiben, sicheren
  Default für den Lauf verwenden und den User über den Schlüssel informieren.
- Markiere den Abschluss in `.firmo/memory.json` unter `configMigration.full`, ohne
  vorhandene Felder (`lastFindingNumber`, andere `configMigration`-Unterschlüssel) zu
  verlieren:

```json
{
  "configMigration": {
    "full": {
      "version": "config-consolidation-v1",
      "appliedAt": "YYYY-MM-DDTHH:mm:ssZ"
    }
  }
}
```

- Ist `configMigration.full` mit dieser Version bereits gesetzt, überspringe die Migration.
- Altvorhandene per-Block-Einträge (`configMigration.review`/`.tracker`/`.applyReview`/
  `.delivery`/`.worktree`) bleiben unverändert liegen; sie stören nicht.

### Sichtbarkeit

Wenn die Migration Schlüssel verschoben, ergänzt oder entfernt hat, teile dem User einmal je
Lauf mit, dass `.firmo/config.json` konsolidiert wurde, und nenne die verschobenen, neu
gesetzten und entfernten Schlüssel sowie – falls vorhanden – die nach `{{SKILL:setup}}`
aufgeschobenen Upgrades.
