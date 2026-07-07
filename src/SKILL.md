---
name: firmo
description: "Firmo — Software-Engineering-Workflows als Tools, aufgerufen über /firmo <tool>. Dünnes Router-Skill mit Lazy-Loading: die vollständige Anweisung eines Tools wird erst gelesen, wenn das Tool aufgerufen wird. Tools: build, fix, plan, refactor, docs, review, apply, plan-issue, maintain, commit, pr, setup, open-plans, investigate, version."
---

# Firmo

Firmo bündelt einen kompletten Software-Engineering-Workflow als Tools, die über `/firmo <tool>` aufgerufen werden (Version {{VERSION}}).

Dieses Router-Skill ist bewusst **dünn**. Es enthält nur den Tool-Katalog und die Dispatch-Regel; die vollständige Anweisung eines Tools wird **erst bei Bedarf** aus `tools/<tool>.md` geladen. So bleibt die Session schlank und es entsteht keine Token-Exhaustion durch das Vorladen aller Tools.

## Aufruf

`/firmo <tool> [argumente]`

Auf Codex wird dasselbe Skill über den Skill-Namen aufgerufen (z. B. `$firmo <tool> [argumente]`); die Dispatch-Regel ist identisch.

## Dispatch-Regel

1. **Kein oder unbekanntes `<tool>`:** Gib die Tool-Liste unten aus und führe sonst nichts aus. Rate nicht, welches Tool gemeint sein könnte.
2. **Gültiges `<tool>`:** Lies die Datei `tools/<tool>.md` in diesem Skill-Verzeichnis und befolge sie wörtlich. Reiche die restlichen Argumente unverändert an das Tool durch. Lies dabei **keine** weiteren Tool-Dateien — nur die eine, die dem aufgerufenen Tool entspricht.

Beim Tool `apply` kann die Anweisung ihrerseits eine passende **interne** Datei nachladen (`tools/apply-plan.md`, `tools/apply-review.md` oder `tools/apply-issues.md`), je nach erkannter Quelle. Diese internen Dateien sind nicht direkt über `/firmo` aufrufbar.

## Tools

{{TOOL_CATALOG}}

## Regeln

- Lade nie mehrere Tool-Dateien „auf Vorrat“; immer nur das aktuell aufgerufene Tool (plus ggf. die eine interne `apply`-Quelle).
- Spezialisten-Agents (Implementer, Reviewer, Validator, Test-/Docs-Writer …) sind **keine** `/firmo`-Tools; die Tools rufen sie intern als Subagents auf (auf Codex genestet unter `agents/`, auf Claude Code als registrierte `firmo-*`-Subagents).
