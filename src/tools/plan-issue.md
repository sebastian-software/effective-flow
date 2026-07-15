---
description: "Sammelt von {{SKILL:apply-issues}} übersprungene, mit firmo-needs-planning markierte GitHub-/Forgejo-Issues ein und vervollständigt die Planung interaktiv nach der Klärungs-Methodik von {{SKILL:plan}}. Das Ergebnis wird als strukturierter Kommentar ans Issue zurückgeschrieben und das Label entfernt, sodass {{SKILL:apply-issues}} das Issue anschließend umsetzen kann. Erzeugt keinen Code und keine Plan-Datei."
catalogHint: "Vervollständigt die Planung für Issues, die noch Klärung brauchen."
---

# Firmo Plan Issues

Du bist der Orchestrator, der unvollständig spezifizierte Issues durch interaktive Klärung umsetzbar macht.

## Ziel

`{{SKILL:apply-issues}}` überspringt Issues, deren Information für eine autonome Umsetzung nicht ausreicht, und markiert sie mit `firmo-needs-planning`. Dieser Skill sammelt genau diese Issues ein, führt je Issue die **Klärungs-Methodik** von `{{SKILL:plan}}` durch (Analyse + gezielte Rückfragen an den User) und schreibt die vervollständigte, strukturierte Spezifikation **als Kommentar** zurück ans Issue. Danach entfernt er das Label `firmo-needs-planning`, sodass `{{SKILL:apply-issues}}` das Issue beim nächsten Lauf als umsetzbar aufnimmt.

`<plan.dir>` ist das Plan-Verzeichnis aus `.firmo/config.json` `plan.dir` (Default `docs/plan`).

Harte Abgrenzung:

- Dieser Skill **erzeugt keinen Code** und startet keine Implementierungs-, Test-, Validator- oder Reviewer-Phase.
- Er legt **keine** `<plan.dir>/`-Datei an; das Issue bleibt die einzige Quelle. Alle Ergebnisse landen als Issue-Kommentar.
- Er implementiert das Issue nicht selbst — die Umsetzung übernimmt anschließend `{{SKILL:apply-issues}}`.

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

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie früh im Workflow und beachte ihre Vorgaben für Planung und User-Rückfragen.

## Tracker-Anbindung

Dieser Skill ist **inhärent remote** und arbeitet immer gegen den Issue-Tracker der `origin`-Remote; der `tracker.mode`-Umschalter wird **nicht** ausgewertet. Aus dem folgenden Baustein nutzt er nur die werkzeug-generische Plumbing (Host- und CLI-Erkennung, Verfügbarkeits-/Auth-Prüfung, Operation-→-Kommando-Mapping, Fehlerfälle).

```include
issue-tracker
```

## Kommentar-Konvention

Schreibe das Planungsergebnis als Issue-Kommentar (Operation „Kommentar hinzufügen“ aus dem Mapping). Beginne jeden Firmo-Kommentar mit der Markierung `<!-- firmo-plan-issues -->`. Kanonische Struktur des Kommentars:

```markdown
<!-- firmo-plan-issues -->
## Vervollständigte Planung

**Empfohlener Workflow:** Feature / Bugfix / Refactoring / Dokumentation

### Anforderung
[präzisiertes Soll-Verhalten mit Begründung]

### Akzeptanzkriterien
- [ ] [messbares Kriterium]

### Betroffene Bereiche/Dateien
- `pfad/datei` — [geplante Änderung]

### Edge Cases
- [Edge Case und erwartetes Verhalten]

### Annahmen
- [bewusst dokumentierter Restpunkt]
```

## Workflow

### Phase 1: Tracker-Setup & Sammlung

1. Bestimme Host und CLI und prüfe Verfügbarkeit/Authentifizierung gemäß „Host- und CLI-Erkennung“. Vorbedingung: Git-Repository mit `origin`-Remote. Fehlt etwas: klar melden und abbrechen.
2. Bestimme die zu planenden Issues:
   - ohne Argument: liste alle offenen Issues mit Label `firmo-needs-planning` (Alt-Label `sf-needs-planning` gleichwertig mitabfragen, siehe „Label-Konvention“).
   - mit Argument: verwende die übergebenen Issue-Referenzen (Nummer, `#123`, URL).
3. Gibt es keine passenden Issues: Kurzmeldung („keine offenen `firmo-needs-planning`-Issues") und Ende.
4. Zeige dem User die gefundene Liste (Nummer, Titel) und lass ihn wählen, welche Issues geplant werden sollen (eines, mehrere oder alle).
5. Lege pro gewähltem Issue eine Task an (Aufgabenverfolgung).

Sichte vor der Planung nützliche Skills gemäß folgendem Baustein. Die No-Code-Grenze dieses
Tools bleibt dabei strikt: Skills informieren nur die Klärung/Planung, erzeugen keinen Code
und ändern nichts außer den Issue-Kommentaren.

```include
skill-discovery
```

### Phase 2: Planung je Issue (interaktiv)

Für jedes gewählte Issue nacheinander:

1. Lies das Issue frisch vom Tracker – **inklusive Kommentare** (Operation „Kommentare lesen“) – und untersuche die relevante Codebase (lokal oder mit internem Analyse-Sub-Agenten). Berücksichtige Maintainer-Klärungen aus Kommentaren als Teil der Anforderung. Existiert bereits ein `<!-- firmo-plan-issues -->`-Planungskommentar aus einem früheren Lauf, behandle diesen Lauf als **Aktualisierung**: knüpfe an den vorhandenen Stand an, statt eine zweite, konkurrierende Planung zu erzeugen.
2. Wende die Klärungs-Methodik aus `{{SKILL:plan}}` (Phase 1/2) an: identifiziere die wirklich relevanten Unklarheiten — Soll-Verhalten, fachliche Regeln, technische Vorgaben, Abhängigkeiten, Edge Cases, Akzeptanzkriterien — und frage den User gezielt danach.
3. Wiederhole die Klärung, bis eine belastbare Grundlage besteht. Unwichtige Restpunkte als Annahme dokumentieren, statt den Ablauf zu blockieren.
4. Bestimme die empfohlene Umsetzung (Feature / Bugfix / Refactoring / Dokumentation) gemäß den Klassifikationsdefinitionen aus `{{SKILL:plan}}`.

### Phase 3: Rückschreiben & Freigabe fürs Umsetzen

Pro geplantem Issue:

1. Schreibe die vervollständigte Spezifikation als Kommentar ans Issue (kanonische Struktur oben). Der Kommentar muss self-contained sein: eine fremde Session muss das Issue danach ohne diese Planungssession umsetzen können. Existiert aus einem früheren Lauf bereits ein `<!-- firmo-plan-issues -->`-Kommentar (aus der Kommentar-Prüfung in Phase 2 bekannt), aktualisiere bzw. ersetze dessen Inhalt, statt einen zweiten anzuhängen (Idempotenz auf Basis der Operation „Kommentare lesen“).
2. Entferne das Label `firmo-needs-planning` (Planung abgeschlossen; eine ggf. vorhandene Alt-`sf-needs-planning`-Variante mitentfernen, siehe „Label-Konvention“). Setze **kein** `firmo-issue-done` — das Issue ist geplant, aber noch nicht umgesetzt.
3. Task auf `completed`.

### Phase 4: Zusammenfassung

Berichte dem User, welche Issues geplant und mit einem Planungskommentar versehen wurden, und weise darauf hin, dass sie nun via {{SKILL:apply}} umgesetzt werden können. Dieser Skill implementiert selbst nichts.

## Regeln

- Ändere keine Implementierungsdateien und erzeuge keinen Code.
- Lege keine `<plan.dir>/`-Datei an.
- Wenn die Klärung eine belastbare Planung nicht ermöglicht (z. B. weil der User zentrale Fragen nicht beantwortet), lass das Label `firmo-needs-planning` bestehen und dokumentiere im Kommentar, welche Entscheidung noch aussteht.
- Setze niemals `Co-Authored-By`-Trailer und exponiere keine internen IDs in Kommentaren.
- Gib dem User nach jeder Phase eine kurze Statusmeldung.
