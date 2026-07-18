---
name: effective-flow
description: "Effective Flow — Software-Engineering-Workflows als Tools, aufgerufen über $effective-flow <tool>. Dünnes Router-Skill mit Lazy-Loading: die vollständige Anweisung eines Tools wird erst gelesen, wenn das Tool aufgerufen wird. Tools: build, fix, plan, refactor, docs, review, apply, plan-issue, maintain, commit, pr, setup, cleanup, open-plans, investigate, version."
argument-hint: "[investigate|plan|open-plans|plan-issue|apply|build|fix|refactor|docs|maintain|iterate|review|commit|pr|setup|cleanup|version]"
---

# Effective Flow

Effective Flow bündelt einen kompletten Software-Engineering-Workflow als Tools, die über `$effective-flow <tool>` aufgerufen werden (Version 1.47.0 (997b2ed)).

Dieses Router-Skill ist bewusst **dünn**. Es enthält nur den Tool-Katalog und die Dispatch-Regel; die vollständige Anweisung eines Tools wird **erst bei Bedarf** aus `tools/<tool>.md` geladen. So bleibt die Session schlank und es entsteht keine Token-Exhaustion durch das Vorladen aller Tools.

## Aufruf

`$effective-flow <tool> [argumente]`

Auf Codex wird dasselbe Skill über den Skill-Namen aufgerufen (z. B. `$effective-flow <tool> [argumente]`); die Dispatch-Regel ist identisch.

## Dispatch-Regel

1. **Kein oder unbekanntes `<tool>`:** Gib die **gruppierte** Tool-Liste unten zur Orientierung aus, damit der User das passende Tool wählen kann, und führe sonst nichts aus. Rate nicht, welches Tool gemeint sein könnte.
2. **Gültiges `<tool>`:** Lies die Datei `tools/<tool>.md` in diesem Skill-Verzeichnis und befolge sie wörtlich. Reiche die restlichen Argumente unverändert an das Tool durch. Lies dabei **keine** weiteren Tool-Dateien — nur die eine, die dem aufgerufenen Tool entspricht.

Beim Tool `apply` kann die Anweisung ihrerseits eine passende **interne** Datei nachladen (`tools/apply-plan.md`, `tools/apply-review.md` oder `tools/apply-issues.md`), je nach erkannter Quelle. Diese internen Dateien sind nicht direkt über `$effective-flow` aufrufbar.

## Tools

Die Tools sind unten nach Nutzungsabsicht gruppiert.

### Verstehen, was zu tun ist
_Analyse & Planung, bevor Code entsteht_

- `$effective-flow investigate` — Findet die Ursache eines Fehlers oder überraschenden Verhaltens – reine Analyse, kein Code.
- `$effective-flow plan` — Klärt eine Aufgabe vollständig und schreibt einen umsetzbaren Plan – ohne Code.
- `$effective-flow open-plans` — Zeigt, welche Pläne noch offen sind, wenn du den Faden wieder aufnimmst.
- `$effective-flow plan-issue` — Vervollständigt die Planung für Issues, die noch Klärung brauchen.

### Eine Änderung umsetzen
_vom geklärten Plan/Issue zum Code_

- `$effective-flow apply` — Startet die Umsetzung aus einer fertigen Quelle (Plan, Issue oder Review-Finding).
- `$effective-flow build` — Setzt ein neues Feature vollständig um – Plan, Code, Tests, Review, Abschluss.
- `$effective-flow fix` — Behebt einen konkreten Bug mit minimalem, regressionsgesichertem Eingriff.
- `$effective-flow refactor` — Verbessert Struktur oder Lesbarkeit, ohne das Verhalten zu ändern.
- `$effective-flow docs` — Erstellt oder aktualisiert Dokumentation, ohne Produktverhalten zu ändern.
- `$effective-flow maintain` — Fährt wiederkehrende Wartung: Dependency-Updates und Security-Fixes.
- `$effective-flow iterate` — Führt PR-Review-Anmerkungen und Instruktionen als neue Commits zurück in einen bestehenden PR.

### Qualität sichern

- `$effective-flow review` — Prüft Code auf Qualität und Findings – oder tiefer einen vorhandenen Plan.

### Änderungen einbringen

- `$effective-flow commit` — Committet die gestageten Änderungen mit passender Commit-Message.
- `$effective-flow pr` — Öffnet aus deinem Branch einen Pull-Request (GitHub oder Forgejo).

### Einrichten & Infos

- `$effective-flow setup` — Richtet Effective Flow im Projekt ein – geführter Wizard, startet mit sicheren Defaults.
- `$effective-flow cleanup` — Räumt Migrations-Altlasten (`.firmo/`, alte Config, `firmo-`-Labels) nach Bestätigung auf.
- `$effective-flow version` — Zeigt die installierte Effective Flow-Version.

## Regeln

- Lade nie mehrere Tool-Dateien „auf Vorrat“; immer nur das aktuell aufgerufene Tool (plus ggf. die eine interne `apply`-Quelle).
- Spezialisten-Agents (Implementer, Reviewer, Validator, Test-/Docs-Writer …) sind **keine** `$effective-flow`-Tools; die Tools rufen sie intern als Subagents auf (auf Codex genestet unter `agents/`, auf Claude Code als registrierte `effective-flow-*`-Subagents).
