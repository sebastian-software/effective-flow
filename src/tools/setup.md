---
description: "Bereitet ein Zielprojekt für die Nutzung des Plugins vor: trägt .firmo/ idempotent in die .gitignore ein und hält dabei .firmo/config.json getrackt, und legt .firmo/config.json interaktiv an bzw. aktualisiert sie. Fragt die gewünschten Werte und das grundsätzliche Verhalten ab — hybrid über Presets und einen Detailmodus — und pflegt eine bestehende Config nicht-destruktiv. Verwende diesen Skill für das einmalige Setup oder zum Anpassen der Plugin-Konfiguration."
---

# Firmo Setup

Du bereitest ein Zielprojekt für die Nutzung des Plugins vor: `.gitignore`-Eintrag für `.firmo/` (Laufzeit-Status ignorieren, `config.json` aber getrackt lassen) und interaktive Pflege von `.firmo/config.json`.

## Ziel

- den Laufzeit-Status unter `.firmo/` idempotent in die `.gitignore` eintragen und dabei `.firmo/config.json` getrackt lassen (nur wenn der Soll-Zustand noch nicht hergestellt ist)
- `.firmo/config.json` interaktiv anlegen oder nicht-destruktiv aktualisieren
- gewünschte Werte und das grundsätzliche Verhalten beim User abfragen — hybrid über Presets und einen optionalen Detailmodus
- keine Projektvalidation wie Linting, Tests oder Build-Checks ausführen

```include
language-rules
```

```include
task-tracking
```

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor dem Schreiben und beachte ihre Vorgaben für Konfiguration, Dateiformate und projektweite Konventionen.

## Config-Schema

`.firmo/config.json` ist optional und steuert Defaults von vier Blöcken. Die jeweiligen Skills sind die maßgebliche Quelle für gültige Werte und Defaults; dieser Skill fasst sie nur zusammen und darf bei Schema-Erweiterungen nicht als alleinige Wahrheit gelten. Unbekannte Schlüssel einer bestehenden Config bleiben immer erhalten.

- **`review`** (Quelle: `{{SKILL:review}}`): `profile` (full/focused/fast), `autoConfirmScope` (bool), `designDecisionSources` (full/standard/minimal), `validation` (full/quick/off)
- **`applyReview`** (Quelle: `{{SKILL:apply-review}}`): `defaultCommitStrategy` (worktrees/single/none/`null` = beim Lauf fragen), `finalValidation` (full/changedScope/off), `stashPolicy` (interactive/keep/discard/apply), `worktree.baseDir`, `worktree.setup` (auto/none/Befehl)
- **`plan`** (Quelle: `{{SKILL:plan}}`): `markerLanguage` (de/en)
- **`worktree`** (Quelle: `src/shared/worktree-integration.md`): `enabled` (bool), `baseBranch` (Default `origin/main`), `branchPrefix` (Default `sf`), `completion` (pr/merge/branch/`null` = beim Lauf fragen), `setup` (auto/none/Befehl), `baseDir`
- **`tracker`** (Quelle: `src/shared/issue-tracker.md`): `mode` (local/remote, Default `local`), `remoteToolOverride` (auto/github/forgejo, Default `auto`)

Die zwei Presets sind vollständig hier definiert und setzen ausschließlich die Blöcke `review` und `applyReview`. Unabhängig vom Preset werden `plan.markerLanguage`, `worktree.enabled` (samt `worktree.completion` und `worktree.baseBranch`) und `tracker.mode` in Schritt 4 explizit erfragt.

Preset „Sichere Defaults":

| Schlüssel                           | Wert                      |
| ----------------------------------- | ------------------------- |
| `review.profile`                    | `"focused"`               |
| `review.autoConfirmScope`           | `false`                   |
| `review.designDecisionSources`      | `"standard"`              |
| `review.validation`                 | `"full"`                  |
| `applyReview.defaultCommitStrategy` | `null` (beim Lauf fragen) |
| `applyReview.finalValidation`       | `"full"`                  |
| `applyReview.stashPolicy`           | `"interactive"`           |
| `applyReview.worktree.baseDir`      | `".firmo/.worktrees"`     |
| `applyReview.worktree.setup`        | `"auto"`                  |

Preset „Schneller persönlicher Workflow":

| Schlüssel                           | Wert                  |
| ----------------------------------- | --------------------- |
| `review.profile`                    | `"fast"`              |
| `review.autoConfirmScope`           | `true`                |
| `review.designDecisionSources`      | `"minimal"`           |
| `review.validation`                 | `"quick"`             |
| `applyReview.defaultCommitStrategy` | `"worktrees"`         |
| `applyReview.finalValidation`       | `"changedScope"`      |
| `applyReview.stashPolicy`           | `"keep"`              |
| `applyReview.worktree.baseDir`      | `".firmo/.worktrees"` |
| `applyReview.worktree.setup`        | `"auto"`              |

Der schnelle Workflow setzt `review.validation` bewusst auf `"quick"` statt `"off"`: Ein Minimal-Check bleibt so auch im zügigen Solo-Flow erhalten.

## Workflow

### Schritt 1: .gitignore-Eintrag

Soll-Zustand: Der Laufzeit-Status unter `.firmo/` (z. B. `memory.json`, `cache.json`, `review/`, `.worktrees/`, Wisdom- und Investigation-Dateien) ist ignoriert, aber `.firmo/config.json` bleibt **getrackt**. Das erreicht das zweizeilige Pattern:

```gitignore
.firmo/*
!.firmo/config.json
```

Wichtige Git-Eigenheit: Ein pauschales `.firmo/` ignoriert das gesamte Verzeichnis, und eine spätere Negation kann eine Datei daraus **nicht** wieder einschließen, solange das Elternverzeichnis komplett ignoriert ist. Deshalb muss mit `.firmo/*` (Inhalte ignorieren, nicht das Verzeichnis selbst) plus `!.firmo/config.json` gearbeitet werden.

1. Prüfe, ob der Soll-Zustand bereits hergestellt ist — bei verfügbarem Git über zwei Aufrufe: `git check-ignore -q .firmo/config.json` muss mit Exit-Code 1 enden (`config.json` **nicht** ignoriert) und `git check-ignore -q .firmo/memory.json` mit Exit-Code 0 (Laufzeit-Status ignoriert). Ohne Git über einen Zeilenabgleich der `.gitignore`: das Pattern `.firmo/*` ist vorhanden und eine Negation `!.firmo/config.json` folgt darauf.
2. Falls der Soll-Zustand noch nicht hergestellt ist:
   - Migriere eine bestehende pauschale Ignore-Zeile: enthält die `.gitignore` eine Zeile, die `.firmo/` **oder das frühere `.sf-plugin/`** als Ganzes ignoriert (gängige Schreibweisen `.firmo/`, `.firmo`, `/.firmo/`, `.sf-plugin/`, `.sf-plugin`, `/.sf-plugin/`), ersetze diese Zeile durch die zwei Zeilen `.firmo/*` und `!.firmo/config.json`, statt zusätzlich anzuhängen. Sonst würde `config.json` weiterhin ignoriert oder ein Alt-Pattern bliebe wirkungslos zurück.
   - Fehlt jeder `.firmo/`-Eintrag, hänge die zwei Zeilen `.firmo/*` und `!.firmo/config.json` an. Stelle vor dem Anhängen einen abschließenden Zeilenumbruch sicher. Fehlt die `.gitignore`, lege sie mit diesen zwei Zeilen an.
   - Ist bereits `.firmo/*` vorhanden, aber die Negation `!.firmo/config.json` fehlt, ergänze nur die fehlende Negationszeile direkt darunter.
3. Falls der Soll-Zustand bereits hergestellt ist: nichts ändern und das knapp melden.
4. Ist das Projekt kein Git-Repository: weise darauf hin, dass eine `.gitignore` ohne Git wirkungslos ist, und frage, ob sie trotzdem geschrieben werden soll. Verwende dann denselben Zeilenabgleich wie oben statt `git check-ignore`. Die Config-Erstellung läuft unabhängig davon weiter.

### Schritt 2: Bestehende Config prüfen

1. Lies `.firmo/config.json`, falls vorhanden.
2. Bei gültigem JSON: verwende die vorhandenen Werte als Default-Vorbelegung der folgenden Fragen.
3. Bei ungültigem JSON: überschreibe nicht still. Informiere den User mit Pfad und Fehler und frage, ob die Datei neu angelegt (altes Backup/Überschreiben) oder der Lauf abgebrochen werden soll.

### Schritt 3: Preset wählen

```ask
header: Preset
question: Welche Grundkonfiguration soll verwendet werden?
options:
  - label: Sichere Defaults
    description: Konservative Defaults (Review focused, Validierung full, finalValidation full, stashPolicy interactive, Commit-Strategie beim Lauf fragen)
  - label: Schneller persönlicher Workflow
    description: Zügiger Solo-Flow (Review fast, Validierung quick, finalValidation changedScope, stashPolicy keep, Worktrees als Commit-Strategie)
  - label: Alles einzeln anpassen
    description: Detailmodus — jeden Schlüssel der vier Blöcke einzeln abfragen
```

Bei „Sichere Defaults" oder „Schneller persönlicher Workflow": verwende die Werte der entsprechenden Preset-Tabelle aus dem Config-Schema oben als Vorschlagswerte – nicht als bedingungsloses Überschreiben. Bei einer leeren oder fehlenden Config werden die Preset-Werte direkt übernommen. Existiert bereits eine Config und weicht ein vorhandener Wert vom Preset-Wert ab, überschreibe ihn **nicht** ungefragt: zeige die betroffenen Schlüssel als Vorher/Nachher-Liste und hole eine Bestätigung ein, bevor du sie änderst (siehe Schritt 6). Bei „Alles einzeln anpassen": gehe in Schritt 5 Block für Block vor.

### Schritt 4: Zentrale Verhaltensschalter (immer abfragen)

Diese Fragen werden in jedem Modus gestellt, weil sie das Kernverhalten bestimmen.

```ask
header: Worktree
question: Soll die Worktree-Integration (Arbeit in Git-Worktree + PR/Merge) aktiviert werden?
options:
  - label: Nein
    description: worktree.enabled = false (Default) — Workflows arbeiten in-place wie bisher
  - label: Ja
    description: worktree.enabled = true — Code-ändernde Workflows arbeiten in einem Worktree und schließen mit PR/Merge/Branch ab
```

```ask
when: die Worktree-Integration in der vorigen Frage aktiviert wurde
header: Abschluss
question: Welche Abschluss-Aktion soll der Worktree-Modus standardmäßig nutzen?
options:
  - label: Beim Lauf fragen
    description: worktree.completion = null — die Aktion wird pro Lauf erfragt
  - label: Pull-Request
    description: worktree.completion = pr
  - label: Merge
    description: worktree.completion = merge
  - label: Nur Branch
    description: worktree.completion = branch
```

Bei aktivierter Worktree-Integration: frage zusätzlich den Basis-Branch als Freitext ab (`worktree.baseBranch`, Default `origin/main`).

```ask
header: Marker
question: In welcher Sprache sollen die Statusmarker neuer Plan-Dateien stehen?
options:
  - label: Deutsch
    description: plan.markerLanguage = de
  - label: Englisch
    description: plan.markerLanguage = en
```

```ask
header: Tracker
question: Sollen Review-Findings lokal als Markdown-Report oder remote als Issues (GitHub/Forgejo) geführt werden?
options:
  - label: Lokal
    description: tracker.mode = local (Default) — Markdown-Report unter .firmo/review/
  - label: Remote
    description: tracker.mode = remote — Findings als Issues, Werkzeug automatisch aus origin (gh/tea)
```

Bei „Remote" den Werkzeug-Override nur bei Bedarf abfragen: Der Default `tracker.remoteToolOverride = auto` erkennt GitHub/Forgejo automatisch aus der `origin`-URL. Nur wenn der User einen mehrdeutigen Host hat (z. B. self-hosted GitHub Enterprise), als Freitext `github` oder `forgejo` erfassen; sonst `auto` belassen.

### Schritt 5: Detailmodus (nur bei „Alles einzeln anpassen")

Frage Block für Block jeden Schlüssel ab, jeweils mit den gültigen Werten aus dem Config-Schema oben und der vorhandenen bzw. Default-Belegung als Vorschlag:

1. `review`: `review.profile`, `review.autoConfirmScope`, `review.designDecisionSources`, `review.validation`
2. `applyReview`: `applyReview.defaultCommitStrategy`, `applyReview.finalValidation`, `applyReview.stashPolicy`, `applyReview.worktree.baseDir`, `applyReview.worktree.setup`
3. `plan`: `plan.markerLanguage` (bereits in Schritt 4 erfragt — übernehmen)
4. `worktree`: `worktree.enabled`, `worktree.baseBranch`, `worktree.branchPrefix`, `worktree.completion` (bereits in Schritt 4 erfragt — übernehmen), `worktree.setup`, `worktree.baseDir`
5. `tracker`: `tracker.mode` (bereits in Schritt 4 erfragt — übernehmen), `tracker.remoteToolOverride` (auto/github/forgejo)

Beachte: `applyReview.worktree.*` (Apply-Review-eigener Worktree-Mechanismus) und der Top-Level-`worktree.*`-Block sind getrennte, unabhängige Config-Pfade — verwechsle sie beim Abfragen und Mergen nicht.

Freitext-Werte (z. B. `baseBranch`, `branchPrefix`, `baseDir` oder ein expliziter `setup`-Befehl) als Freitext erfragen. Bei ungültiger Eingabe für einen enumerierten Schlüssel erneut fragen oder den Default verwenden und das melden.

### Schritt 6: Merge und Schreiben

1. Baue die Zielkonfiguration nicht-destruktiv: setze die bekannten Schlüssel auf die gewählten Werte, übernimm vorhandene gültige Werte für nicht abgefragte Schlüssel und lass unbekannte Schlüssel unverändert.
2. Das gilt auch für Preset-Werte: Ein Preset-Wert, der einen bereits vorhandenen, abweichenden Wert ersetzen würde, wird nur nach ausdrücklicher Bestätigung gesetzt. Zeige vor dem Schreiben eine Vorher/Nachher-Liste **aller** zu ändernden Schlüssel (egal ob aus Preset, Detailmodus oder zentralen Schaltern) und hole die Bestätigung ein. Ein vollständiges Überschreiben (Verwerfen vorhandener Werte) ebenfalls nur nach ausdrücklicher Bestätigung.
3. Lies eine vorhandene `config.json` direkt vor dem Schreiben noch einmal frisch ein, damit zwischenzeitliche Änderungen nicht verloren gehen.
4. Lege `.firmo/` an, falls nötig, und schreibe `config.json` als formatiertes, syntaktisch valides JSON.

### Schritt 7: Zusammenfassung

Melde dem User:

- ob der `.gitignore`-Eintrag (`.firmo/*` plus `!.firmo/config.json`) ergänzt, eine bestehende pauschale `.firmo/`- oder Alt-`.sf-plugin/`-Zeile dorthin migriert wurde oder der Soll-Zustand bereits hergestellt war — und dass `.firmo/config.json` dabei getrackt bleibt
- welches Preset bzw. der Detailmodus gewählt wurde
- die gesetzten zentralen Verhaltenswerte (`worktree.enabled`, ggf. `worktree.completion`/`worktree.baseBranch`, `plan.markerLanguage`, `tracker.mode` und ggf. `tracker.remoteToolOverride`)
- bei einer zuvor vorhandenen Config: welche Schlüssel gegenüber dem alten Stand geändert wurden (Vorher/Nachher)
- den Pfad der geschriebenen Config (`.firmo/config.json`)

## Regeln

- Ändere ausschließlich `.gitignore` (das zweizeilige `.firmo/`-Pattern bzw. dessen Migration) und `.firmo/config.json`; keine weiteren Setup-Schritte wie Deployment oder Git-Hooks.
- Überschreibe vorhandene Config-Werte und unbekannte Schlüssel niemals ungefragt.
- Hinterlasse bei einem Abbruch während der Fragen keine halb geschriebene Config; schreibe nur einmal am Ende.
- Starte keine Projektvalidation; Linting, Tests und Build-Checks sind Aufgabe anderer Skills wie `{{AGENT:code-validator}}`.
- Erstelle keine Commits; das Committen übernimmt der User oder `{{SKILL:commit}}`.
- Verarbeite oder speichere keine Secrets; die Config enthält ausschließlich Verhaltens-Defaults.
