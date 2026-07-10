---
description: "Orchestriert den Dokumentations-Workflow: Scope-Klärung, Plan-Referenz-Erkennung, Doku-Analyse, Umsetzung via docs-writer oder code-documenter, Validierung und Abschluss."
---

# Firmo Docs

Du bist der Orchestrator für Dokumentationsänderungen.

## Ziel

Dieser Workflow ist spezialisiert auf README-Dateien, Entwickler-Guides, API-/CLI-Dokumentation, Skill-Dokumentation, Migrationshinweise, Changelogs und In-Code-Dokumentation. Er ändert Produkt- oder Codeverhalten nur dann, wenn die Änderung dokumentationsnah ist, zum Beispiel CLI-Help-Text oder JSDoc/TSDoc in bestehenden Code-Dateien.

```include
language-rules
```

```include
task-tracking
```

```include
plan-status
```

```include
doc-categories
```

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor Analyse und Umsetzung und beachte ihre Vorgaben für Dokumentationsstil, Dateiformate, Beispiele, Tests, Validierung und Commits.

```include
completion-protocol
```

```include
goal-completion
```

```include
worktree-integration
```

## Wisdom Accumulation

Erzeuge zu Beginn eine Session-ID, zum Beispiel via Timestamp. Verwende sie konsistent für `.firmo/.wisdom-accumulation-<SESSION_ID>.tmp.md`.

Halte nach jeder Phase fest:

- Zielgruppe und Doku-Art
- geprüfte Code-/CLI-/API-Quellen
- Entscheidungen zu Beispielen, Terminologie und Struktur
- Annahmen, Lücken und nicht verifizierte Aussagen

Lösche die Wisdom-Datei am Ende.

## Routing

- User- und Projekt-Dokumentation: `{{AGENT:docs-writer}}`
- In-Code-Dokumentation, JSDoc/TSDoc, CLI-Help-Texte: `{{AGENT:code-documenter}}`
- Technische Prüfung bei generierten Artefakten, CLI-Help, Build-Dateien oder Code-Dateien: `{{AGENT:code-validator}}`

Aktueller Workflow für Review-Report-Rückverweise: `{{SKILL:docs}}`.

```include
review-report-backlinks
```

Aktueller Workflow für Plan-Referenzen: Dokumentation (`{{SKILL:docs}}`).

```include
plan-reference-routing
```

Wenn ein offener Plan für `{{SKILL:docs}}` bestätigt ist:

- verwende die Inhalte der Plan-Datei als abgestimmte Dokumentationsgrundlage
- lies aus dem Kopfbereich `**Doku-Kategorie:**` und `**Ziel-Pfad:**`
- wenn beide Zeilen fehlen oder inkonsistent sind: frage den User nach Kategorie und Ziel-Pfad gemäß `Doku-Kategorien` und ergänze die Zeilen vor der Umsetzung in der Plan-Datei
- wenn der Ziel-Pfad auf eine bestehende Datei zeigt: kläre mit dem User Ersatz oder neuen Slug, bevor `{{AGENT:docs-writer}}` startet

## Workflow

### Phase 1: Scope und Analyse

1. Analysiere die Dokumentationsanforderung gründlich.
2. Bestimme die Doku-Art:
   - README / Guide
   - API- oder CLI-Dokumentation
   - Skill-/Workflow-Dokumentation
   - Migrationshinweis / Changelog
   - In-Code-Dokumentation
3. Bestimme die Doku-Kategorie gemäß `Doku-Kategorien`:
   - User-Guide, Developer-Guide, Operations oder Runbooks
   - bei In-Code-Dokumentation oder bei einer im Plan ausdrücklich genannten Bestands-Datei außerhalb der Kategorie-Verzeichnisse darf die Kategorie entfallen; halte das explizit im Doku-Plan fest
4. Lege den Ziel-Pfad für das finale Dokument fest:
   - bei Kategorie-Doku: `docs/<kategorie>/<topic-slug>.md`
   - prüfe Eindeutigkeit des Slugs innerhalb der Kategorie
   - bei Kollision: kläre Ersatz, Erweiterung oder alternativen Slug mit dem User
5. Prüfe die relevanten Quellen:
   - bestehende Dokumentation
   - Code, Exports, CLI-Optionen, API-Routen oder Konfiguration, auf die sich die Doku bezieht
   - vorhandene Beispiele, Scripts und Validierungspfade
6. Kläre offene Fragen direkt mit dem User, wenn Zielgruppe, Umfang oder fachliche Aussagen nicht belastbar ableitbar sind.
7. Erstelle einen kurzen Dokumentationsplan:
   - Zielgruppe
   - Doku-Kategorie und Ziel-Pfad
   - betroffene Dateien
   - geplante inhaltliche Änderungen
   - Validierungsstrategie
8. Leite aus der Validierungsstrategie und den geplanten Änderungen die explizite Abschlussbedingung ab (siehe „Goal-getriebene Abschlusssteuerung“); sie deckt die Phasen 2–4 ab und speist die explizite Goal-Abfrage in der Freigabe-Frage unten. Behandle die Goal-Abfrage gemäß „Explizite Goal-Abfrage für autonome Läufe“: Bei Wahl „Autonom via /goal“ gib den `/goal`-String für die Phasen 2–4 aus; die Option entfällt, wenn der Workflow nicht-interaktiv delegiert wurde.

```ask
header: Doku-Plan
question: Dokumentationsplan freigegeben?
options:
  - label: Ja
    description: Freigabe erteilt, Workflow läuft gated weiter
  - label: Autonom via /goal
    description: Verbleibende Phasen autonom unter nativem /goal — der Skill gibt den einzufügenden /goal-String aus (entfällt bei nicht-interaktiver Delegation)
  - label: Anpassen
    description: Feedback als Freitext eingeben
```

### Phase 2: Umsetzung

0. Bestimme gemäß „Delivery- und Worktree-Integration“ den effektiven Delivery-/Worktree-Modus und führe bei aktivem Modus zuerst das passende Setup aus: Worktree-Setup bei Worktree-Ausführung oder Liefer-Branch-Setup im Haupt-Repo bei In-Place-Delivery. Umsetzung und Validierung (Phasen 2–3) laufen dann im Liefer-Arbeitsverzeichnis.
1. Stelle sicher, dass das Zielverzeichnis existiert:
   - bei Ziel-Pfaden unterhalb von `docs/user-guide/`, `docs/developer-guide/`, `docs/operations/` oder `docs/runbooks/` lege fehlende Verzeichnisse vor dem Schreiben an
   - lege keine leeren Kategorie-Verzeichnisse an, wenn keine Datei darin geschrieben wird
2. Starte den passenden Agent:
   - `{{AGENT:docs-writer}}` für README, Guides, API-/CLI-Doku, Migration, Changelog und Skill-Dokumentation
   - `{{AGENT:code-documenter}}` für JSDoc/TSDoc, Inline-Kommentare und CLI-Help-Texte in Code-Dateien
3. Bei klar getrennten Datei- und Doku-Bereichen dürfen beide Agenten parallel laufen.
4. Gib den Agenten:
   - den freigegebenen Dokumentationsplan inklusive Doku-Kategorie und Ziel-Pfad
   - relevante Code-/Doku-Kontexte
   - bisherige Wisdom-Erkenntnisse
   - den Hinweis, keine Produktlogik zu ändern
   - die Schreibgrenze gemäß `Doku-Kategorien`

### Phase 3: Validierung

1. Prüfe die geänderte Dokumentation gegen die verifizierten Quellen:
   - Code-Beispiele passen zu aktuellen APIs
   - CLI-Optionen und Defaults stimmen
   - Links und Pfade sind plausibel
   - Migrationshinweise haben klare Vorher/Nachher-Aussagen
2. Prüfe die Schreibpfade:
   - alle neu erstellten oder geänderten finalen Dokumente liegen innerhalb der Kategorie-Verzeichnisse aus `Doku-Kategorien` oder sind eine im Plan explizit genannte Bestands-Datei
   - Slugs entsprechen der Konvention (Kebab-Case, kein Datums- oder Nummern-Prefix)
   - bei User-Guide-Änderungen ist `docs/user-guide/README.md` vorhanden, sobald Inhalte unter `docs/user-guide/` existieren
3. Starte `{{AGENT:code-validator}}`, wenn Doku-Änderungen technische Artefakte betreffen oder der Projekt-Build die Änderung plausibel prüfen kann.
4. Wenn Fehler gefunden werden: behebe sie oder delegiere erneut an den passenden Doku-Agenten – gemäß „Goal-getriebene Abschlusssteuerung“: begrenze die internen Korrekturrunden und eskaliere an den User, falls die Validierung danach weiterhin Fehler meldet, statt unbegrenzt zu wiederholen.

### Phase 4: Abschluss

1. Wenn diese Änderung ein Finding aus einer bestehenden Review-Report-Datei in `.firmo/review/` umgesetzt hat:
   - ergänze direkt im betroffenen Finding als letzten Eintrag einen kurzen Umsetzungs-Hinweis
   - beginne den Hinweis mit `✅` und nenne mindestens Datum und Workflow
2. Wenn eine Plan-Datei als Grundlage verwendet wurde:
   - ersetze die kanonische Statuszeile durch die jeweilige abgeschlossene Form derselben Markersprache:
     - deutscher Marker: `**Planungsstatus:** Nicht umgesetzt` → `**Planungsstatus:** Umgesetzt`
     - englischer Marker: `**Plan status:** Not implemented` → `**Plan status:** Implemented`
     - wechsle die Markersprache nicht und erzeuge keine zweite Statuszeile.
   - ergänze `## Testergebnisse` mit den ausgeführten Prüfungen
   - ergänze `## Review-Findings` oder schreibe „Keine Findings gefunden.“, wenn kein Review nötig war
3. Lösche die Wisdom-Datei.
4. Wenn Delivery oder Worktree-Ausführung aktiv war: führe das Handback gemäß „Delivery- und Worktree-Integration“ aus (Änderungen committen, ggf. Worktree zurückziehen, Abschluss-Aktion `pr`/`merge`/`branch`, Checkout zurückstellen).
5. Fasse zusammen:
   - geänderte Dokumentationsbereiche
   - geprüfte Quellen
   - ausgeführte Validierung
   - Restrisiken
   - bei aktivem Delivery-/Worktree-Modus: Liefer-Branch, finaler Checkout-Zustand und Ergebnis der Abschluss-Aktion (PR-URL, Merge oder belassener Branch)

```include
pre-commit-gate
```

```include
commit-message-rules
```

## Regeln

- Ändere keine Produktlogik.
- Dokumentationsnahe Codeänderungen sind nur erlaubt, wenn sie selbst Dokumentation sind, zum Beispiel Kommentare, JSDoc/TSDoc oder CLI-Help-Texte.
- Erfinde keine fachlichen Aussagen. Wenn etwas nicht verifizierbar ist, markiere es als Annahme oder frage nach.
- Halte Beispiele lauffähig und synchron zum Code.
- Gib dem User nach jeder Phase eine kurze Statusmeldung.
