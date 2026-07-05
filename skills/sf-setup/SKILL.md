---
name: sf-setup
description: "Bereitet ein Zielprojekt für die Nutzung des Plugins vor: trägt .sf-plugin/ idempotent in die .gitignore ein und hält dabei .sf-plugin/config.json getrackt, und legt .sf-plugin/config.json interaktiv an bzw. aktualisiert sie. Fragt die gewünschten Werte und das grundsätzliche Verhalten ab — hybrid über Presets und einen Detailmodus — und pflegt eine bestehende Config nicht-destruktiv. Verwende diesen Skill für das einmalige Setup oder zum Anpassen der Plugin-Konfiguration."
type: utility
---

# SF Setup

Du bereitest ein Zielprojekt für die Nutzung des Plugins vor: `.gitignore`-Eintrag für `.sf-plugin/` (Laufzeit-Status ignorieren, `config.json` aber getrackt lassen) und interaktive Pflege von `.sf-plugin/config.json`.

## Ziel

- den Laufzeit-Status unter `.sf-plugin/` idempotent in die `.gitignore` eintragen und dabei `.sf-plugin/config.json` getrackt lassen (nur wenn der Soll-Zustand noch nicht hergestellt ist)
- `.sf-plugin/config.json` interaktiv anlegen oder nicht-destruktiv aktualisieren
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

`.sf-plugin/config.json` ist optional und steuert Defaults von vier Blöcken. Die jeweiligen Skills sind die maßgebliche Quelle für gültige Werte und Defaults; dieser Skill fasst sie nur zusammen und darf bei Schema-Erweiterungen nicht als alleinige Wahrheit gelten. Unbekannte Schlüssel einer bestehenden Config bleiben immer erhalten.

- **`review`** (Quelle: `{{SKILL:sf-review}}`): `profile` (full/focused/fast), `autoConfirmScope` (bool), `designDecisionSources` (full/standard/minimal), `validation` (full/quick/off)
- **`applyReview`** (Quelle: `{{SKILL:sf-apply-review}}`): `defaultCommitStrategy` (worktrees/single/none/`null` = beim Lauf fragen), `finalValidation` (full/changedScope/off), `stashPolicy` (interactive/keep/discard/apply), `worktree.baseDir`, `worktree.setup` (auto/none/Befehl)
- **`plan`** (Quelle: `{{SKILL:sf-plan}}`): `markerLanguage` (de/en)
- **`worktree`** (Quelle: `skills/_shared/worktree-integration.md`): `enabled` (bool), `baseBranch` (Default `origin/main`), `branchPrefix` (Default `sf`), `completion` (pr/merge/branch/`null` = beim Lauf fragen), `setup` (auto/none/Befehl), `baseDir`
- **`tracker`** (Quelle: `skills/_shared/issue-tracker.md`): `mode` (local/remote, Default `local`), `remoteToolOverride` (auto/github/forgejo, Default `auto`)

Die zwei Presets entsprechen den im README im Abschnitt „Plugin-Konfiguration" dokumentierten Beispiel-Konfigurationen: „Sichere Defaults" übernimmt den Block unter der README-Überschrift „Sicheres Default-Verhalten", „Schneller persönlicher Workflow" den Block unter „Schneller persönlicher Review-/Apply-Review-Workflow". Beide ergänzen den `worktree`-Block mit dessen Defaults und den `tracker`-Block mit `mode: local`; `worktree.enabled` und `tracker.mode` werden in jedem Modus explizit erfragt.

## Workflow

### Schritt 1: .gitignore-Eintrag

Soll-Zustand: Der Laufzeit-Status unter `.sf-plugin/` (z. B. `memory.json`, `cache.json`, `review/`, `.worktrees/`, Wisdom- und Investigation-Dateien) ist ignoriert, aber `.sf-plugin/config.json` bleibt **getrackt**. Das erreicht das zweizeilige Pattern:

```gitignore
.sf-plugin/*
!.sf-plugin/config.json
```

Wichtige Git-Eigenheit: Ein pauschales `.sf-plugin/` ignoriert das gesamte Verzeichnis, und eine spätere Negation kann eine Datei daraus **nicht** wieder einschließen, solange das Elternverzeichnis komplett ignoriert ist. Deshalb muss mit `.sf-plugin/*` (Inhalte ignorieren, nicht das Verzeichnis selbst) plus `!.sf-plugin/config.json` gearbeitet werden.

1. Prüfe, ob der Soll-Zustand bereits hergestellt ist — bei verfügbarem Git über zwei Aufrufe: `git check-ignore -q .sf-plugin/config.json` muss mit Exit-Code 1 enden (`config.json` **nicht** ignoriert) und `git check-ignore -q .sf-plugin/memory.json` mit Exit-Code 0 (Laufzeit-Status ignoriert). Ohne Git über einen Zeilenabgleich der `.gitignore`: das Pattern `.sf-plugin/*` ist vorhanden und eine Negation `!.sf-plugin/config.json` folgt darauf.
2. Falls der Soll-Zustand noch nicht hergestellt ist:
   - Migriere eine bestehende pauschale Ignore-Zeile: enthält die `.gitignore` eine Zeile, die `.sf-plugin/` als Ganzes ignoriert (gängige Schreibweisen `.sf-plugin/`, `.sf-plugin`, `/.sf-plugin/`), ersetze diese Zeile durch die zwei Zeilen `.sf-plugin/*` und `!.sf-plugin/config.json`, statt zusätzlich anzuhängen. Sonst würde `config.json` weiterhin ignoriert.
   - Fehlt jeder `.sf-plugin/`-Eintrag, hänge die zwei Zeilen `.sf-plugin/*` und `!.sf-plugin/config.json` an. Stelle vor dem Anhängen einen abschließenden Zeilenumbruch sicher. Fehlt die `.gitignore`, lege sie mit diesen zwei Zeilen an.
   - Ist bereits `.sf-plugin/*` vorhanden, aber die Negation `!.sf-plugin/config.json` fehlt, ergänze nur die fehlende Negationszeile direkt darunter.
3. Falls der Soll-Zustand bereits hergestellt ist: nichts ändern und das knapp melden.
4. Ist das Projekt kein Git-Repository: weise darauf hin, dass eine `.gitignore` ohne Git wirkungslos ist, und frage, ob sie trotzdem geschrieben werden soll. Verwende dann denselben Zeilenabgleich wie oben statt `git check-ignore`. Die Config-Erstellung läuft unabhängig davon weiter.

### Schritt 2: Bestehende Config prüfen

1. Lies `.sf-plugin/config.json`, falls vorhanden.
2. Bei gültigem JSON: verwende die vorhandenen Werte als Default-Vorbelegung der folgenden Fragen.
3. Bei ungültigem JSON: überschreibe nicht still. Informiere den User mit Pfad und Fehler und frage, ob die Datei neu angelegt (altes Backup/Überschreiben) oder der Lauf abgebrochen werden soll.

### Schritt 3: Preset wählen

```ask
header: Preset
question: Welche Grundkonfiguration soll verwendet werden?
options:
  - label: Sichere Defaults
    description: Konservative Defaults (Review focused, volle Validierung, interaktive Stash-Behandlung)
  - label: Schneller persönlicher Workflow
    description: Zügiger Solo-Flow (Review fast, changedScope-Validierung, Worktrees als Commit-Strategie, stashPolicy keep)
  - label: Alles einzeln anpassen
    description: Detailmodus — jeden Schlüssel der vier Blöcke einzeln abfragen
```

Bei „Sichere Defaults" oder „Schneller persönlicher Workflow": verwende die entsprechende Beispiel-Konfiguration als Vorschlagswerte – nicht als bedingungsloses Überschreiben. Bei einer leeren oder fehlenden Config werden die Preset-Werte direkt übernommen. Existiert bereits eine Config und weicht ein vorhandener Wert vom Preset-Wert ab, überschreibe ihn **nicht** ungefragt: zeige die betroffenen Schlüssel als Vorher/Nachher-Liste und hole eine Bestätigung ein, bevor du sie änderst (siehe Schritt 6). Bei „Alles einzeln anpassen": gehe in Schritt 5 Block für Block vor.

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
    description: tracker.mode = local (Default) — Markdown-Report unter .sf-plugin/review/
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
4. Lege `.sf-plugin/` an, falls nötig, und schreibe `config.json` als formatiertes, syntaktisch valides JSON.

### Schritt 7: Zusammenfassung

Melde dem User:

- ob der `.gitignore`-Eintrag (`.sf-plugin/*` plus `!.sf-plugin/config.json`) ergänzt, eine bestehende pauschale `.sf-plugin/`-Zeile dorthin migriert wurde oder der Soll-Zustand bereits hergestellt war — und dass `.sf-plugin/config.json` dabei getrackt bleibt
- welches Preset bzw. der Detailmodus gewählt wurde
- die gesetzten zentralen Verhaltenswerte (`worktree.enabled`, ggf. `worktree.completion`/`worktree.baseBranch`, `plan.markerLanguage`, `tracker.mode` und ggf. `tracker.remoteToolOverride`)
- bei einer zuvor vorhandenen Config: welche Schlüssel gegenüber dem alten Stand geändert wurden (Vorher/Nachher)
- den Pfad der geschriebenen Config (`.sf-plugin/config.json`)

## Regeln

- Ändere ausschließlich `.gitignore` (das zweizeilige `.sf-plugin/`-Pattern bzw. dessen Migration) und `.sf-plugin/config.json`; keine weiteren Setup-Schritte wie Deployment oder Git-Hooks.
- Überschreibe vorhandene Config-Werte und unbekannte Schlüssel niemals ungefragt.
- Hinterlasse bei einem Abbruch während der Fragen keine halb geschriebene Config; schreibe nur einmal am Ende.
- Starte keine Projektvalidation; Linting, Tests und Build-Checks sind Aufgabe anderer Skills wie `{{AGENT:sf-code-validator}}`.
- Erstelle keine Commits; das Committen übernimmt der User oder `{{SKILL:sf-commit}}`.
- Verarbeite oder speichere keine Secrets; die Config enthält ausschließlich Verhaltens-Defaults.
