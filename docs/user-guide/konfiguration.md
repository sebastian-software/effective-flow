# Konfiguration

Firmo funktioniert ohne jede Konfiguration – alle Tools starten von sicheren Defaults. Wer
Verhalten dauerhaft anpassen will (z. B. Merge statt Pull-Request, Remote-Tracker statt
lokalem Report, striktere Review-Tiefe), tut das über eine einzige Datei:
`.firmo/config.json`.

Diese Seite ist die vollständige Referenz aller Schlüssel. Die Guides
[Worktree und Delivery](./worktree-und-delivery.md), [Remote-Tracker](./remote-tracker.md)
und [Skill-Discovery](./skill-discovery.md) erklären die jeweilige Nutzung im Detail und
verlinken hierher für die genauen Feldwerte, statt sie zu duplizieren.

## Grundprinzip

- `.firmo/config.json` ist **optional**. Fehlt sie, gelten die unten dokumentierten Defaults.
- Ein Tool überschreibt vorhandene Werte **nie** ungefragt. Unbekannte Schlüssel (z. B. aus
  einer künftigen Version oder einem eigenen Zusatz) bleiben beim Schreiben unverändert
  erhalten.
- Eine ältere Config wird beim ersten Lesen automatisch auf das aktuelle Schema konsolidiert
  (verschobene, ergänzte oder entfernte Schlüssel – siehe „Migration einer bestehenden
  Config“ unten). Das passiert einmalig und ohne Rückfrage, außer bei mehrdeutigen Fällen.
- [`/firmo setup`](./tools-einrichten.md) ist der geführte Weg, diese Datei anzulegen oder zu
  pflegen – manuelles Bearbeiten funktioniert genauso, solange die Datei syntaktisch valides
  JSON bleibt.

## `.gitignore`-Eintrag

`/firmo setup` trägt beim ersten Lauf dieses zweizeilige Muster in die `.gitignore` ein:

```gitignore
.firmo/*
!.firmo/config.json
```

Grund für die zwei Zeilen: Git kann ein einmal komplett ignoriertes Verzeichnis nicht durch
eine spätere Negation teilweise wieder einschließen. `.firmo/*` ignoriert deshalb nur den
_Inhalt_ von `.firmo/` (Laufzeit-Status wie `memory.json`, `cache.json`, lokale
Review-Reports, Investigationen, Worktrees), während `!.firmo/config.json` die Config
gezielt davon ausnimmt. So bleibt `config.json` getrackt und teilbar im Repository, während
der übrige Laufzeit-Status – bewusst – lokal und ungetrackt bleibt.

## Vollständiges Beispiel

Die folgende Datei zeigt alle Blöcke mit ihren jeweiligen Defaultwerten:

```json
{
  "review": {
    "profile": "focused",
    "autoConfirmScope": false,
    "designDecisionSources": "standard",
    "validation": "full"
  },
  "applyReview": {
    "defaultCommitStrategy": null,
    "finalValidation": "full",
    "stashPolicy": "interactive",
    "worktree": {
      "baseDir": ".firmo/.worktrees",
      "setup": "auto"
    }
  },
  "plan": {
    "markerLanguage": "de",
    "dir": "docs/plan"
  },
  "delivery": {
    "baseBranch": "origin/main",
    "branchPrefix": "firmo",
    "completion": "merge",
    "returnBranch": "auto"
  },
  "worktree": {
    "enabled": true,
    "setup": "auto",
    "baseDir": ".firmo/.worktrees"
  },
  "tracker": {
    "mode": "local",
    "remoteToolOverride": "auto"
  },
  "skills": {
    "enabled": true,
    "include": [],
    "exclude": [],
    "agents": {},
    "tools": {}
  }
}
```

Jeder Block ist unabhängig optional; fehlt ein Block oder ein Schlüssel darin vollständig,
gilt jeweils der Default aus den Tabellen unten.

## Block `review`

Steuert die Tiefe und das Verhalten von [`/firmo review`](./tools-qualitaet.md).

| Schlüssel               | Werte                           | Default    | Bedeutung                                                                                                             |
| ----------------------- | ------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------- |
| `profile`               | `full` / `focused` / `fast`     | `focused`  | Umfang und Tiefe des Reviews                                                                                          |
| `autoConfirmScope`      | `true` / `false`                | `false`    | Erkannten Scope ohne Rückfrage übernehmen                                                                             |
| `designDecisionSources` | `full` / `standard` / `minimal` | `standard` | Wie umfassend nach dokumentierten Designentscheidungen gesucht wird, bevor ein Finding als bewusste Entscheidung gilt |
| `validation`            | `full` / `quick` / `off`        | `full`     | Umfang der abschließenden technischen Validierung                                                                     |

## Block `applyReview`

Steuert [`/firmo apply`](./tools-umsetzen.md) beim Abarbeiten von Review-Findings
(`apply-review`).

| Schlüssel               | Werte                                        | Default             | Bedeutung                                                                        |
| ----------------------- | -------------------------------------------- | ------------------- | -------------------------------------------------------------------------------- |
| `defaultCommitStrategy` | `worktrees` / `single` / `none` / `null`     | `null`              | `null` = die Strategie wird bei jedem Lauf erfragt                               |
| `finalValidation`       | `full` / `changedScope` / `off`              | `full`              | Umfang der abschließenden Validierung nach dem Abarbeiten aller Findings         |
| `stashPolicy`           | `interactive` / `keep` / `discard` / `apply` | `interactive`       | Umgang mit uncommitteten Änderungen im Arbeitsbaum vor dem Start                 |
| `worktree.baseDir`      | String                                       | `.firmo/.worktrees` | Basisverzeichnis für die **findingsinternen** Isolations-Worktrees (siehe unten) |
| `worktree.setup`        | `auto` / `none` / Freitext-Befehl            | `auto`              | Setup-Kommando je isoliertem Finding-Worktree                                    |

`applyReview.worktree.*` ist ein eigener, **von `worktree.*` (siehe unten) unabhängiger**
Mechanismus: Er isoliert die parallele Bearbeitung einzelner Findings und führt deren
Commits per Cherry-Pick auf den aktuellen Branch zurück. Details dazu und zur Abgrenzung
gegenüber dem Liefer-Worktree stehen in [Worktree und Delivery](./worktree-und-delivery.md).

## Block `plan`

Steuert [`/firmo plan`](./tools-verstehen.md) und alle Tools, die Plan-Dateien lesen oder
schreiben.

| Schlüssel        | Werte       | Default                                    | Bedeutung                                                      |
| ---------------- | ----------- | ------------------------------------------ | -------------------------------------------------------------- |
| `markerLanguage` | `de` / `en` | erkannt aus vorhandenen Plänen, sonst `en` | Sprache des Statusmarkers im Plan-Kopf (nicht des Planinhalts) |
| `dir`            | String      | `docs/plan`                                | Verzeichnis, in dem Plan-Dateien liegen (`<plan.dir>`)         |

## Block `delivery`

Beschreibt den Liefer-Branch: Basis-Ref, Namensbildung und Abschluss-Aktion. Es gibt
bewusst **keinen** eigenen `delivery.enabled`-Schalter mehr – Delivery ist immer dann aktiv,
wenn in einem Worktree oder auf einem eigenen Liefer-Branch gearbeitet wird (siehe
[Worktree und Delivery](./worktree-und-delivery.md)).

| Schlüssel      | Werte                          | Default       | Bedeutung                                                              |
| -------------- | ------------------------------ | ------------- | ---------------------------------------------------------------------- |
| `baseBranch`   | Git-Ref als String             | `origin/main` | Ausgangspunkt des Liefer-Branches                                      |
| `branchPrefix` | String                         | `firmo`       | Präfix der erzeugten Branch-Namen (`<branchPrefix>/<skill>/<slug>`)    |
| `completion`   | `pr` / `merge` / `branch`      | `merge`       | Abschluss-Aktion: PR öffnen, lokal mergen oder nur den Branch belassen |
| `returnBranch` | `auto` oder lokaler Branchname | `auto`        | Branch, zu dem nach Abschluss zurückgewechselt wird                    |

## Block `worktree`

Beschreibt ausschließlich den **Ausführungsort** der Umsetzung – nicht, ob geliefert wird.

| Schlüssel | Werte                             | Default             | Bedeutung                                            |
| --------- | --------------------------------- | ------------------- | ---------------------------------------------------- |
| `enabled` | `true` / `false`                  | `true`              | Läuft die Umsetzung in einem separaten Git-Worktree? |
| `setup`   | `auto` / `none` / Freitext-Befehl | `auto`              | Setup-Kommando im frisch erzeugten Worktree          |
| `baseDir` | String                            | `.firmo/.worktrees` | Basisverzeichnis aller Liefer-Worktrees              |

## Block `tracker`

Steuert, ob Review-Findings lokal als Markdown-Report oder als Issues auf einem
Remote-Tracker geführt werden. Details in [Remote-Tracker](./remote-tracker.md).

| Schlüssel            | Werte                         | Default | Bedeutung                                                   |
| -------------------- | ----------------------------- | ------- | ----------------------------------------------------------- |
| `mode`               | `local` / `remote`            | `local` | Findings als Markdown-Report oder als Issues                |
| `remoteToolOverride` | `auto` / `github` / `forgejo` | `auto`  | Erzwingt ein Werkzeug statt der Host-Erkennung aus `origin` |

## Block `skills`

Steuert die dynamische [Skill-Discovery](./skill-discovery.md) – also, ob und welche
Host-Skills (z. B. `humanizer`, `impeccable`, `context7`) die Tools und Agents zusätzlich zu
ihren eingebauten Anweisungen nutzen dürfen.

| Schlüssel       | Werte                          | Default | Bedeutung                                                              |
| --------------- | ------------------------------ | ------- | ---------------------------------------------------------------------- |
| `enabled`       | `true` / `false`               | `true`  | Schaltet die gesamte dynamische Skill-Nutzung global aus, wenn `false` |
| `include`       | Liste von Skill-Namen          | `[]`    | Skills projektweit zusätzlich bevorzugt einbinden                      |
| `exclude`       | Liste von Skill-Namen          | `[]`    | Skills, die nie angewendet werden                                      |
| `agents.<name>` | Objekt mit `include`/`exclude` | `{}`    | Wie oben, aber nur für den Agent `<name>` (z. B. `ui-implementer`)     |
| `tools.<name>`  | Objekt mit `include`/`exclude` | `{}`    | Wie oben, aber nur für das Tool `<name>` (z. B. `plan`)                |

`<name>` ist jeweils der Quell-Agent- bzw. Quell-Tool-Name, nicht der Anzeigename der
Skill-Beschreibung. Ein per `exclude` ausgeschlossenes Mitglied einer Fallback-Empfehlung
(`A › B`) wird übersprungen, der nächste Fallback greift stattdessen.

## Sichere Defaults im Überblick

Diese Werte bilden die eine Sicher-Defaults-Basis, von der `/firmo setup` immer ausgeht:

| Schlüssel                           | Wert                                       |
| ----------------------------------- | ------------------------------------------ |
| `review.profile`                    | `focused`                                  |
| `review.autoConfirmScope`           | `false`                                    |
| `review.designDecisionSources`      | `standard`                                 |
| `review.validation`                 | `full`                                     |
| `applyReview.defaultCommitStrategy` | `null` (beim Lauf fragen)                  |
| `applyReview.finalValidation`       | `full`                                     |
| `applyReview.stashPolicy`           | `interactive`                              |
| `applyReview.worktree.baseDir`      | `.firmo/.worktrees`                        |
| `applyReview.worktree.setup`        | `auto`                                     |
| `worktree.enabled`                  | `true`                                     |
| `delivery.completion`               | `merge`                                    |
| `delivery.baseBranch`               | `origin/main`                              |
| `tracker.mode`                      | `local`                                    |
| `plan.dir`                          | `docs/plan`                                |
| `plan.markerLanguage`               | aus vorhandenen Plänen erkannt, sonst `en` |

Es gibt bewusst kein zweites, „schnelleres“ Preset. Wer einen zügigeren Solo-Workflow will
(z. B. `review.profile: fast`, `review.validation: quick`,
`applyReview.finalValidation: changedScope`), stellt diese Werte einzeln über den geführten
Weg von `/firmo setup` ein.

## Wie `/firmo setup` die Config pflegt

[`/firmo setup`](./tools-einrichten.md) ist der einzige Ort, an dem sowohl der
`.gitignore`-Eintrag als auch `.firmo/config.json` geschrieben werden. Der Wizard bietet
dabei zwei Wege:

- **Express:** Sicher-Defaults-Basis plus – falls bereits eine gültige Config existiert –
  deren vorhandene Werte übernehmen. Ein Bestätigungsschritt mit Vorher/Nachher-Liste, dann
  fertig.
- **Geführt:** Vier Kern-Schalter (Worktree, Abschluss-Aktion, Marker-Sprache, Tracker)
  einzeln erklärt und abgefragt, danach optional ein Erweitert-Gate für alle übrigen
  Schlüssel inklusive `skills`.

In beiden Fällen gilt: Ein Wert, der eine bereits vorhandene, abweichende Config ersetzen
würde, wird nur nach ausdrücklicher Bestätigung geschrieben – nie still überschrieben.
Unbekannte Schlüssel bleiben in jedem Fall erhalten.

## Migration einer bestehenden Config

Jedes config-lesende Tool konsolidiert eine ältere `.firmo/config.json` beim ersten Lesen
automatisch auf das aktuelle Schema, unter anderem:

- alte Lieferwerte aus `worktree.baseBranch`/`worktree.branchPrefix`/`worktree.completion`
  werden – falls dort noch nicht gesetzt – nach `delivery.baseBranch`/`delivery.branchPrefix`/
  `delivery.completion` verschoben,
- das entwertete `delivery.enabled` wird entfernt (Delivery ist seit 1.4x durch
  Worktree/Branch impliziert),
- fehlende Schlüssel werden additiv mit ihren Defaults ergänzt.

Uneindeutige Fälle (z. B. das optionale Upgrade von `delivery.completion: null` auf den
neuen Default `merge`) werden **nicht** automatisch entschieden: Das aufrufende Tool nutzt
für den laufenden Aufruf einen sicheren Default, lässt den Wert unverändert und verweist auf
`/firmo setup`. Nur dort wird die eigentliche Migrations-Rückfrage gestellt.

## Siehe auch

- [Worktree und Delivery](./worktree-und-delivery.md) – Nutzung der Blöcke `delivery` und
  `worktree`
- [Remote-Tracker](./remote-tracker.md) – Nutzung des Blocks `tracker`
- [Skill-Discovery](./skill-discovery.md) – Nutzung des Blocks `skills`
- [Tools einrichten](./tools-einrichten.md) – `/firmo setup` und `/firmo version`
- [Glossar](./glossar.md) – Begriffe wie Worktree, Delivery, Finding
