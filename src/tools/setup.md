---
description: "Bereitet ein Zielprojekt für die Nutzung von Firmo vor: trägt .firmo/ idempotent in die .gitignore ein und hält dabei .firmo/config.json getrackt, und legt .firmo/config.json über einen geführten Wizard an bzw. aktualisiert sie. Startet immer von sicheren Defaults, bietet einen Express- und einen geführten Weg, erklärt jede Option auch für Firmo-Neulinge und zeigt bei vorhandener Config die aktuell festgeschriebenen Werte. Pflegt eine bestehende Config nicht-destruktiv. Verwende diesen Skill für das einmalige Setup oder zum Anpassen der Firmo-Konfiguration."
catalogHint: "Richtet Firmo im Projekt ein – geführter Wizard, startet mit sicheren Defaults."
---

# Firmo Setup

Du bereitest ein Zielprojekt für die Nutzung von Firmo vor: `.gitignore`-Eintrag für `.firmo/` (Laufzeit-Status ignorieren, `config.json` aber getrackt lassen) und interaktive Pflege von `.firmo/config.json`.

## Ziel

- den Laufzeit-Status unter `.firmo/` idempotent in die `.gitignore` eintragen und dabei `.firmo/config.json` getrackt lassen (nur wenn der Soll-Zustand noch nicht hergestellt ist)
- `.firmo/config.json` über einen geführten Wizard anlegen oder nicht-destruktiv aktualisieren
- immer von sicheren Defaults starten und dem User zwei Wege bieten: **Express** (Defaults übernehmen) oder **Geführt** (jede Option erklärt durchgehen)
- jede Option so erklären, dass sie auch ohne Vorwissen über die Arbeitsweise von Firmo verständlich ist
- bei einer vorhandenen Config bei jeder Auswahl den aktuell festgeschriebenen Wert anzeigen und vorauswählen
- keine Projektvalidation wie Linting, Tests oder Build-Checks ausführen

```include
language-rules
```

```include
task-tracking
```

```include
config-migration
```

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor dem Schreiben und beachte ihre Vorgaben für Konfiguration, Dateiformate und projektweite Konventionen.

## Config-Schema

`.firmo/config.json` ist optional und steuert Defaults der folgenden Blöcke. Die jeweiligen Skills sind die maßgebliche Quelle für gültige Werte und Defaults; dieser Skill fasst sie nur zusammen und darf bei Schema-Erweiterungen nicht als alleinige Wahrheit gelten. Unbekannte Schlüssel einer bestehenden Config bleiben immer erhalten.

- **`review`** (Quelle: `{{SKILL:review}}`): `profile` (full/focused/fast), `autoConfirmScope` (bool), `designDecisionSources` (full/standard/minimal), `validation` (full/quick/off)
- **`applyReview`** (Quelle: `{{SKILL:apply-review}}`): `defaultCommitStrategy` (worktrees/single/none/`null` = beim Lauf fragen), `finalValidation` (full/changedScope/off), `stashPolicy` (interactive/keep/discard/apply), `worktree.baseDir`, `worktree.setup` (auto/none/Befehl)
- **`plan`** (Quelle: `{{SKILL:plan}}`): `markerLanguage` (de/en), `dir` (String, Default `docs/plan`) — Verzeichnis der Plan-Dateien
- **`delivery`** (Quelle: `{{SKILL:build}}`, Abschnitt „Delivery- und Worktree-Integration“ – ebenso in den weiteren code-ändernden Workflows eingebettet): Delivery ist durch Worktree/Branch impliziert (kein eigener `enabled`-Schalter mehr) — `baseBranch` (Default `origin/main`), `branchPrefix` (Default `firmo`), `completion` (pr/merge/branch, Default `merge`), `returnBranch` (auto oder lokaler Branchname)
- **`worktree`** (Quelle: `{{SKILL:build}}`, Abschnitt „Delivery- und Worktree-Integration“): `enabled` (bool, Default `true`), `setup` (auto/none/Befehl), `baseDir`
- **`tracker`** (Quelle: `{{SKILL:review}}`, Abschnitt „Issue-Tracker-Anbindung“ – ebenso in `{{SKILL:apply-review}}` und den weiteren Tracker-Workflows eingebettet): `mode` (local/remote, Default `local`), `remoteToolOverride` (auto/github/forgejo, Default `auto`)
- **`skills`** (Quelle: Baustein „Skill-Discovery“): `enabled` (bool, Default `true` — schaltet die dynamische Skill-Nutzung), `include` (Liste — Skills projektweit bevorzugt einbinden), `exclude` (Liste — Skills nie anwenden), `agents.<name>` und `tools.<name>` (je `include`/`exclude` für einen einzelnen Agent bzw. ein einzelnes Tool). Schlüssel sind die Quell-Agent-/Tool-Namen (z. B. `ui-implementer`, `plan`).

### Sichere Defaults (die eine Basis)

Der Wizard startet **immer** von dieser einen benannten Sicher-Defaults-Basis. Sie umfasst
die konservativen `review`-/`applyReview`-Werte plus die Kern-Schalter:

| Schlüssel                           | Wert                                                    |
| ----------------------------------- | ------------------------------------------------------- |
| `review.profile`                    | `"focused"`                                             |
| `review.autoConfirmScope`           | `false`                                                 |
| `review.designDecisionSources`      | `"standard"`                                            |
| `review.validation`                 | `"full"`                                                |
| `applyReview.defaultCommitStrategy` | `null` (beim Lauf fragen)                               |
| `applyReview.finalValidation`       | `"full"`                                                |
| `applyReview.stashPolicy`           | `"interactive"`                                         |
| `applyReview.worktree.baseDir`      | `".firmo/.worktrees"`                                   |
| `applyReview.worktree.setup`        | `"auto"`                                                |
| `worktree.enabled`                  | `true`                                                  |
| `delivery.completion`               | `"merge"`                                               |
| `delivery.baseBranch`               | `"origin/main"`                                         |
| `tracker.mode`                      | `"local"`                                               |
| `plan.dir`                          | `"docs/plan"`                                           |
| `plan.markerLanguage`               | abgeleitet: aus vorhandenen Plänen erkennen, sonst `en` |

Es gibt bewusst **kein** zweites Preset mehr. Wer einen zügigeren Solo-Flow will (z. B.
`review.profile: fast`, `review.validation: quick`, `applyReview.finalValidation:
changedScope`), erreicht diese Werte einzeln über den geführten Weg (erweiterte
Einstellungen). Für `plan.markerLanguage` gilt kein fixer Wert: aus vorhandenen Plänen die
Marker-Sprache erkennen (Detection wie in `{{SKILL:plan}}`); ohne eindeutiges Signal
Englisch.

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
2. Bei gültigem JSON: bilde einen internen „Aktuelle-Werte"-Überblick (Schlüssel → aktuell festgeschriebener Wert). Zeige diesen Wert bei jeder folgenden Frage an („aktuell in der Config: …") und verwende ihn als Vorauswahl. Fehlt ein Schlüssel, benenne die Vorauswahl als Default („aktuell nicht gesetzt – Default: …").
3. Bei ungültigem JSON: überschreibe nicht still. Informiere den User mit Pfad und Fehler und frage, ob die Datei neu angelegt (altes Backup/Überschreiben) oder der Lauf abgebrochen werden soll.

### Schritt 3: Express oder Geführt

Erkläre dem User kurz, dass Firmo mit sicheren Defaults sofort einsatzbereit ist und er nur
dann etwas anpassen muss, wenn er möchte. Biete dann die zwei Wege an:

```ask
header: Setup-Weg
question: Wie möchtest du die Firmo-Konfiguration einrichten?
options:
  - label: Express
    description: Sichere Defaults übernehmen (bei vorhandener Config deren aktuelle Werte behalten) — ein Bestätigungsschritt, dann fertig
  - label: Geführt
    description: Schritt für Schritt durch die Optionen — jede wird erklärt, ideal wenn du Firmo noch nicht kennst
```

- **Express:** Bilde die Zielkonfiguration aus der Sicher-Defaults-Basis (Config-Schema oben)
  plus – falls eine gültige Config existiert – deren vorhandenen Werten. Leite
  `plan.markerLanguage` gemäß Basis ab (Detection, sonst Englisch). Springe direkt zu
  Schritt 6 (Merge und Schreiben); die Vorher/Nachher-Liste und Bestätigung dort stellen
  sicher, dass keine bestehende, abweichende Config still überschrieben wird.
- **Geführt:** Fahre mit Schritt 4 (Kern-Schalter) fort; danach folgt das optionale
  Erweitert-Gate (Schritt 5).

### Schritt 4: Kern-Schalter (nur im geführten Weg)

Diese vier Schalter bestimmen das Kernverhalten. Stelle **vor** jeder Frage eine kurze,
verständliche Erklärung voran (was ist das, warum ist es relevant, was bedeutet die Wahl) –
ohne Vorwissen über Firmo vorauszusetzen – und nenne dabei, ob und mit welchem Wert der
Schalter aktuell in der Config steht (siehe Schritt 2); wähle diesen Wert bzw. den sicheren
Default vor. Fachbegriffe bei erster Nennung in einem Satz erklären.

**Worktree.** Erkläre: Firmo setzt Änderungen standardmäßig in einem separaten Arbeitsbereich
mit eigenem Branch um (einem „Worktree"), damit dein aktueller Stand unberührt bleibt und die
Arbeit sauber gebündelt ist; „Nein" arbeitet direkt in deinem aktuellen Checkout.

```ask
header: Worktree
question: Soll die Umsetzung in einem separaten Git-Worktree laufen?
options:
  - label: Ja
    description: worktree.enabled = true (Default) — Umsetzung läuft in einem separaten Worktree mit eigenem Liefer-Branch
  - label: Nein
    description: worktree.enabled = false — In-Place ohne Worktree; Liefer-Branches werden bei Bedarf im Haupt-Repo erzeugt
```

**Abschluss-Aktion.** Erkläre: Wie fertige Änderungen eingebracht werden. `merge` bringt sie
direkt in den Zielbranch, `pr` öffnet einen Pull-Request (Review vor dem Einbringen), `branch`
lässt den Branch nur liegen; „beim Lauf fragen" entscheidet jedes Mal neu.

```ask
header: Abschluss
question: Welche Abschluss-Aktion soll Firmo standardmäßig nutzen?
options:
  - label: Merge
    description: delivery.completion = merge (Default) — Branch lokal in den Basis-Branch mergen, ohne PR
  - label: Pull-Request
    description: delivery.completion = pr
  - label: Nur Branch
    description: delivery.completion = branch
  - label: Beim Lauf fragen
    description: delivery.completion = null — die Aktion wird pro Lauf erfragt
```

Erkläre kurz den Basis-Branch (der Zweig, in den geliefert wird) und frage ihn als Freitext
ab (`delivery.baseBranch`, Default `origin/main`); das Rückwechsel-Ziel (`delivery.returnBranch`,
Default `auto`) nur optional.

**Marker-Sprache.** Erkläre: Die Sprache der kleinen Status-Markierung im Kopf von
Plan-Dateien (nur der Marker, nicht der Planinhalt). Vorauswahl: der aus vorhandenen Plänen
erkannte Wert; gibt es kein Signal, Englisch.

```ask
header: Marker
question: In welcher Sprache sollen die Statusmarker neuer Plan-Dateien stehen?
options:
  - label: Englisch
    description: plan.markerLanguage = en (Default, falls keine Sprache aus vorhandenen Plänen erkennbar ist)
  - label: Deutsch
    description: plan.markerLanguage = de
```

**Tracker.** Erkläre: Wo Review-Findings landen – `local` als Markdown-Report im Projekt
(`.firmo/review/`) oder `remote` als Issues auf GitHub/Forgejo (nützlich für Teamarbeit).

```ask
header: Tracker
question: Sollen Review-Findings lokal als Markdown-Report oder remote als Issues (GitHub/Forgejo) geführt werden?
options:
  - label: Lokal
    description: tracker.mode = local (Default) — Markdown-Report unter .firmo/review/
  - label: Remote
    description: tracker.mode = remote — Findings als Issues, Werkzeug automatisch aus origin (gh/tea)
```

Bei „Remote“ den Werkzeug-Override nur bei Bedarf abfragen: Der Default `tracker.remoteToolOverride = auto` erkennt GitHub/Forgejo automatisch aus der `origin`-URL. Nur wenn der User einen mehrdeutigen Host hat (z. B. self-hosted GitHub Enterprise), als Freitext `github` oder `forgejo` erfassen; sonst `auto` belassen.

### Schritt 5: Erweiterte Einstellungen (optionales Gate, nur im geführten Weg)

Die Kern-Schalter genügen für den Alltag. Alle übrigen Optionen sind seltener nötig; frage
daher zuerst, ob der User sie überhaupt anpassen will:

```ask
header: Erweitert
question: Möchtest du erweiterte Einstellungen (Review, Apply-Review, Pfade, Feinheiten) anpassen?
options:
  - label: Nein
    description: Sichere Defaults bzw. bestehende Werte behalten — empfohlen, wenn du Firmo noch kennenlernst
  - label: Ja
    description: Die restlichen Optionen einzeln durchgehen, jede erklärt
```

Bei „Nein": alle erweiterten Schlüssel behalten den sicheren Default bzw. den bestehenden
Config-Wert; weiter zu Schritt 6. Bei „Ja": frage Block für Block jeden Schlüssel ab, jeweils
mit einer kurzen Erklärung, den gültigen Werten aus dem Config-Schema oben und dem aktuellen
Config-Wert bzw. Default als Vorauswahl:

1. `review`: `review.profile` (full/focused/fast — Tiefe des Reviews), `review.autoConfirmScope`, `review.designDecisionSources`, `review.validation`
2. `applyReview`: `applyReview.defaultCommitStrategy`, `applyReview.finalValidation`, `applyReview.stashPolicy`, `applyReview.worktree.baseDir`, `applyReview.worktree.setup`
3. `plan`: `plan.markerLanguage` (bereits in Schritt 4 erfragt — übernehmen), `plan.dir` (Freitext, Default `docs/plan` — Verzeichnis der Plan-Dateien)
4. `delivery`: `delivery.baseBranch` und `delivery.completion` (bereits in Schritt 4 erfragt — übernehmen), `delivery.branchPrefix`, `delivery.returnBranch`
5. `worktree`: `worktree.enabled` (bereits in Schritt 4 erfragt — übernehmen), `worktree.setup`, `worktree.baseDir`
6. `tracker`: `tracker.mode` (bereits in Schritt 4 erfragt — übernehmen), `tracker.remoteToolOverride` (auto/github/forgejo)
7. `skills`: `skills.enabled` (bool), `skills.include`/`skills.exclude` (globale Listen) sowie – als Fortgeschrittenen-Option – `skills.agents.<name>` und `skills.tools.<name>` für einzelne Agents/Tools. Biete zusätzlich optional an (nicht erzwingen), die eingebauten per-Agent-Empfehlungen sichtbar als `skills.agents.<name>.include` in die Config zu materialisieren; schreibe dabei bei einer Fallback-Empfehlung (`impeccable › frontend-design`) nur den **primären** Skill (`["impeccable"]`) — der Built-in-Fallback bleibt aktiv. Flache Empfehlungen (`humanizer`) werden unverändert übernommen.

Wer den früheren „schnellen Solo-Workflow" möchte, setzt hier z. B. `review.profile: fast`,
`review.validation: quick` und `applyReview.finalValidation: changedScope`.

Beachte: `applyReview.worktree.*` (Apply-Review-eigener Worktree-Mechanismus), der Top-Level-`worktree.*`-Block (Ausführungsort) und der Top-Level-`delivery.*`-Block (Liefer-Branch/Abschluss) sind getrennte, unabhängige Config-Pfade — verwechsle sie beim Abfragen und Mergen nicht.

Freitext-Werte (z. B. `baseBranch`, `branchPrefix`, `returnBranch`, `baseDir` oder ein expliziter `setup`-Befehl) als Freitext erfragen. Bei ungültiger Eingabe für einen enumerierten Schlüssel erneut fragen oder den Default verwenden und das melden.

### Schritt 6: Merge und Schreiben

1. Baue die Zielkonfiguration nicht-destruktiv: setze die bekannten Schlüssel auf die gewählten Werte, übernimm vorhandene gültige Werte für nicht abgefragte Schlüssel und lass unbekannte Schlüssel unverändert.
2. Das gilt auch für die Sicher-Defaults: Ein Default-Wert, der einen bereits vorhandenen, abweichenden Config-Wert ersetzen würde, wird nur nach ausdrücklicher Bestätigung gesetzt. Zeige vor dem Schreiben eine Vorher/Nachher-Liste **aller** zu ändernden Schlüssel (egal ob aus Express-Basis, Kern-Schaltern oder erweiterten Einstellungen) und hole die Bestätigung ein. Ein vollständiges Überschreiben (Verwerfen vorhandener Werte) ebenfalls nur nach ausdrücklicher Bestätigung.
3. Lies eine vorhandene `config.json` direkt vor dem Schreiben noch einmal frisch ein, damit zwischenzeitliche Änderungen nicht verloren gehen.
4. Lege `.firmo/` an, falls nötig, und schreibe `config.json` als formatiertes, syntaktisch valides JSON.
5. **Aufgeschobene Migrations-Rückfragen stellen:** `{{SKILL:setup}}` ist gemäß „Config-Migration“ der **einzige** Ort, an dem die aufgeschobenen Migrations-Rückfragen und -Upgrades entschieden werden; andere Skills schieben solche Fälle nur mit einem sicheren Default auf. Wurde beim Einlesen der Alt-Config ein optionales Upgrade erkannt (aktuell: `delivery.completion: null` → neuer Default `merge`), biete es hier als eigene Frage an, bevor der Merge aus Schritt 1–2 geschrieben wird:

```ask
when: eine Alt-Config konsolidiert wird und delivery.completion aktuell null ist ("beim Lauf fragen")
header: Upgrade
question: delivery.completion von "beim Lauf fragen" (null) auf den neuen Default merge umstellen?
options:
  - label: Ja
    description: delivery.completion = merge — Branch künftig standardmäßig ohne Rückfrage mergen
  - label: Nein
    description: delivery.completion bleibt null — die Abschluss-Aktion wird weiterhin bei jedem Lauf erfragt
```

Bei „Ja“ setze `delivery.completion = "merge"` im zu schreibenden Merge-Ergebnis; bei „Nein“ bleibt der Wert `null` unverändert. Markiere die Config-Vollmigration in `.firmo/memory.json` (`configMigration.full`) erst als abgeschlossen, nachdem diese Rückfrage beantwortet oder als „kein Upgrade anstehend“ übersprungen wurde.

### Schritt 7: Zusammenfassung

Melde dem User:

- ob der `.gitignore`-Eintrag (`.firmo/*` plus `!.firmo/config.json`) ergänzt, eine bestehende pauschale `.firmo/`- oder Alt-`.sf-plugin/`-Zeile dorthin migriert wurde oder der Soll-Zustand bereits hergestellt war — und dass `.firmo/config.json` dabei getrackt bleibt
- welcher Weg gewählt wurde (Express oder Geführt) und ob erweiterte Einstellungen angepasst wurden
- die gesetzten zentralen Verhaltenswerte (`worktree.enabled` [Default `true`], `delivery.completion` [Default `merge`] samt ggf. `delivery.baseBranch`/`delivery.returnBranch`, `plan.markerLanguage`, `tracker.mode` und ggf. `tracker.remoteToolOverride`) sowie `plan.dir`, falls gesetzt oder gegenüber dem Default geändert
- bei einer zuvor vorhandenen Config: welche Schlüssel gegenüber dem alten Stand geändert wurden (Vorher/Nachher)
- den Pfad der geschriebenen Config (`.firmo/config.json`)

## Regeln

- Ändere ausschließlich `.gitignore` (das zweizeilige `.firmo/`-Pattern bzw. dessen Migration) und `.firmo/config.json`; keine weiteren Setup-Schritte wie Deployment oder Git-Hooks.
- Überschreibe vorhandene Config-Werte und unbekannte Schlüssel niemals ungefragt.
- Hinterlasse bei einem Abbruch während der Fragen keine halb geschriebene Config; schreibe nur einmal am Ende.
- Starte keine Projektvalidation; Linting, Tests und Build-Checks sind Aufgabe anderer Skills wie `{{AGENT:code-validator}}`.
- Erstelle keine Commits; das Committen übernimmt der User oder `{{SKILL:commit}}`.
- Verarbeite oder speichere keine Secrets; die Config enthält ausschließlich Verhaltens-Defaults.
