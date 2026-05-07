# 0029: Reihenfolge der Commit-Strategie-Optionen in apply-review

## Anforderung

Im `sf-apply-review`-Skill wählt der User in Phase 2 zwischen drei Commit-Strategien:
einzelne Commits, einzelne Commits mit Worktree-Isolation oder keine Commits. Die
Reihenfolge der Optionen wird so geändert, dass „Einzeln mit Worktrees" als erste
Option erscheint, weil dies die häufigste Wahl ist und damit die schnellste
Auswahl per Default-Position ermöglicht.

## Architekturentscheidungen

- **Reine UX-Reihenfolge, kein Verhaltenswechsel:** Die drei Strategien selbst
  bleiben unverändert. Mutex, Worktree-Isolation und Cherry-Pick-Integration in
  den nachfolgenden Abschnitten der SKILL.md sind nicht betroffen.
- **Kontextueller Hinweis statt expliziter Default-Markierung:** „(häufigste Wahl)"
  wird als Beschreibungs-Suffix der ersten Option ergänzt, ohne ein neues
  „(Empfohlen)"-Pattern im Plugin einzuführen. Damit bleibt die Konvention der
  bestehenden ASK-Blöcke konsistent.
- **Frage-Text angepasst:** Die alte Frage „Soll jedes Finding einen eigenen
  Git-Commit bekommen?" war Ja/Nein-orientiert und passte schlecht zur neuen
  Erstoption „Einzeln mit Worktrees" (die ja auch committet, aber im Worktree).
  Die neue Frage „Welche Commit-Strategie soll für die Findings verwendet werden?"
  ist neutral gegenüber allen drei Optionen.
- **Konsistenz zwischen ASK-Block und Erklärungs-Bullets:** Die nachfolgenden
  Bullet-Erklärungen werden in dieselbe neue Reihenfolge gebracht, damit Frage und
  Erklärung visuell und logisch zusammenpassen.

## Betroffene Dateien

| Datei | Beschreibung |
|---|---|
| `skills/sf-apply-review/SKILL.md` | Reihenfolge der ASK-Optionen und nachfolgender Erklärungs-Bullets in Phase 2 angepasst, Frage-Text von Ja/Nein-Form auf neutrale Strategie-Auswahl umformuliert |

## Implementierungsdetails

### Vorher

```
question: Soll jedes Finding einen eigenen Git-Commit bekommen?
options:
  - label: Einzeln
  - label: Einzeln mit Worktrees
  - label: Keine Commits
```

### Nachher

```
question: Welche Commit-Strategie soll für die Findings verwendet werden?
options:
  - label: Einzeln mit Worktrees   (häufigste Wahl)
  - label: Einzeln
  - label: Keine Commits
```

Die Erklärungs-Bullets unter dem ASK-Block (Beschreibung der drei Strategien) sind
in dieselbe Reihenfolge gebracht. Alle weiteren Verweise auf die Strategien in
Phase 4.3, Phase 6 und in den Worktree- bzw. Mutex-Abschnitten bleiben unverändert,
da sie nur per Strategie-Name (Stringliteral) referenzieren und keine
Reihenfolge-Annahme treffen.

### Build und Validierung

- `node build.mjs` lief fehlerfrei durch.
- Output für Claude (`dist/claude/.../commands/apply-review.md`, Zeilen 184–197)
  und Codex (`dist/codex/skills/sf-apply-review/SKILL.md`, Zeilen 183–194) zeigen
  die neue Reihenfolge und den neuen Frage-Text identisch.

## Testergebnisse

Das Plugin hat kein automatisiertes Test-Setup. Die Validierung erfolgt
ausschließlich über den Build und manuelle Inspektion der dist-Outputs. Beide
Targets wurden inspiziert; Reihenfolge und Frage-Text sind korrekt übernommen.

## Review-Findings

**Datum:** 2026-05-07
**Reviewer:** keiner

Diese Änderung ist eine reine UX-Reihenfolgenanpassung in einem ASK-Block ohne
Verhaltens-, Logik- oder Schnittstellenwechsel. Eine separate Reviewer-Phase
(Frontend-/Node-Reviewer) wurde daher nicht gestartet. Eine spätere Auswertung
durch `/review` über mehrere Skills hinweg bleibt jederzeit möglich.
