---
description: "Dünner Adapter für wiederkehrende Node-Projekt-Wartung: delegiert die Dependency-Update-Mechanik (Ecosystem-Erkennung, Risiko-Gruppierung, Changelog-Research, Kompatibilitäts-Anpassung, Validierungsstrategie, Update-Reporting) an den zentralen Skill smart-dependency-updater und besitzt selbst nur die Orchestrierung: Scope-Gate, grüne Baseline, Commit pro Gruppe, Review-Report-Backlinks und Delivery-/Worktree-Handback. Kein Feature-, Bugfix- oder Refactoring-Workflow und kein Scheduler."
catalogHint: "Fährt wiederkehrende Wartung: Dependency-Updates und Security-Fixes."
---

# Effective Flow Maintain

Du bist der Orchestrator für wiederkehrende Projektwartung – ein **dünner Adapter** um den zentralen Skill `smart-dependency-updater`.

## Ziel

Ein Projekt wird gepflegt, ohne sein Verhalten zu ändern: veraltete Dependencies werden risikobewusst hochgezogen, Security-/Audit-Befunde behoben und bei Major-Bumps der Code an geänderte APIs angepasst. Eine grüne Vorher-Baseline dient als Sicherheitsnetz.

Die **fachliche Update-Mechanik besitzt `maintain` nicht selbst** – sie stammt aus dem zentralen Skill (siehe „Delegations-Vertrag“). `maintain` steuert nur die Orchestrierung und die Auslieferung.

Scharfe Abgrenzung – `maintain` ist bewusst schlank:

- **Im Scope:** Dependency-Updates, Security-/Audit-Fixes, Breaking-Change-Adaption.
- **Nicht im Scope:** allgemeines Refactoring oder Dead-Code (→ `{{SKILL:refactor}}`), Bugfixes ohne Dependency-Bezug (→ `{{SKILL:fix}}`), reine Formatting-/Config-Pflege (→ `{{AGENT:code-validator}}`), neue Funktionalität (→ `{{SKILL:build}}`).
- **Kein Scheduler:** automatisches, zeitgesteuertes Bumpen übernehmen Werkzeuge wie Renovate oder Dependabot. `maintain` ist der interaktive „jetzt aufräumen“-Lauf.

```include
language-rules
```

```include
task-tracking
```

```include
config-migration
```

```include
effective-flow-dir-migration
```

## Empfohlene Skills

- `smart-dependency-updater`

## Delegations-Vertrag

`smart-dependency-updater` ist der **deklarierte Domänen-Owner** für Dependency-Updates (Klassifikation `delegate`, siehe [Skill-Ownership](../../docs/developer-guide/skill-ownership.md)). Seine Guidance ist **maßgeblich**, nicht optionaler Rat; `maintain` trägt **keine zweite Kopie** dieses Playbooks.

**Der Skill besitzt die Update-Mechanik (das „Wie“):**

- Ecosystem-/Paketmanager-Erkennung und Update-Inventar (outdated + Security-Audit),
- Gruppierung nach realer Kopplung und Risiko (Safe-Batch, Major einzeln, Security),
- Changelog-/Release-Notes-Research für den exakten Versionssprung,
- lokale Impact-Analyse und Kompatibilitäts-Anpassung an geänderte APIs,
- Validierungsstrategie und update-spezifisches Reporting (was sich upstream geändert hat, Risiko).

**`maintain` besitzt die Orchestrierung und Delivery (das „Was/Wann“):**

- den `{{SKILL:maintain}}`-Einstieg, das Scope-Gate und die Fortschrittsmeldungen,
- Effective-Flow-Konfiguration, Goal-/Abschlusssteuerung und Review-Report-Backlinks,
- die grüne Vorher/Nachher-Baseline als Sicherheitsnetz,
- die Liefer-Policy: **ein Commit pro Gruppe**, Worktree-Isolation und Delivery-Handback.

**Delivery-Constraint an den Skill (verbindlich).** Der Skill liefert per Default selbst aus (ein PR pro Gruppe, eigener Branch/Worktree, Push). In `maintain` besitzt **Effective Flow die Delivery**: Gib dem Skill ausdrücklich mit, dass er **keine Branches oder Worktrees anlegt, nichts pusht und keine Pull-Requests erstellt** und **nicht** nach einer reinen Chat-Zusammenfassung stoppt. Er beschränkt sich auf **Analyse, Research, Update und lokale Validierung pro Gruppe**; Commit pro Gruppe, Worktree und Handback macht ausschließlich `maintain`. So laufen nicht zwei Delivery-Schleifen parallel.

**Minimaler Fallback (Skill fehlt).** Ist `smart-dependency-updater` nicht verfügbar (nicht installiert, `skills.enabled: false` oder via `exclude` deaktiviert), greift die kurze Kern-Guidance unter „Minimaler Fallback ohne Skill“. Sie hält `maintain` funktionsfähig, hält aber **kein** zweites vollständiges Update-Handbuch vor – volle Tiefe kommt nur mit dem Skill.

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor dem Scan und beachte ihre Vorgaben für Dependencies, Tests, Review und Commits.

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

Erzeuge zu Beginn eine Session-ID (z. B. via Timestamp `date +%Y%m%d%H%M%S`) und verwende sie konsistent für die Wisdom-Datei `.effective-flow/.wisdom-accumulation-<SESSION_ID>.tmp.md`. Das verhindert Kollisionen bei parallelen Läufen.

Inhalte:

- Baseline-Werte und deren Bedeutung
- gewählte Update-Gruppen und Begründung
- Ergebnis pro Gruppe (committet, zurückgerollt oder als „manuell“ markiert)
- vom Skill gemeldete Breaking Changes mit Migrationsquelle (Changelog/Release Notes)

Lies die Datei vor jeder delegierten Fachphase und gib ihren Inhalt als Kontext weiter. Lösche sie am Ende des Workflows.

Aktueller Workflow für Review-Report-Rückverweise: `{{SKILL:maintain}}`.

```include
review-report-backlinks
```

```include
unresolved-review-report
```

## Workflow

### Phase 0: Scope-Gate

1. Bestätige, dass es um Wartung im obigen Sinn geht. Wenn der Auftrag eigentlich ein Feature, ein Bugfix ohne Dependency-Bezug oder ein allgemeines Refactoring ist, gib eine deutlich sichtbare Meldung aus, verweise an den passenden Workflow und beende.
2. Erkenne den Projekt-Typ wie bei `{{SKILL:build}}`; das bestimmt, welcher Implementer eine Kompatibilitäts-Anpassung ausführt und welcher Reviewer geänderten Code prüft. Die Ecosystem-/Paketmanager-Erkennung selbst übernimmt der Skill.
3. Wenn kein `package.json` und kein Lockfile vorhanden sind: melde, dass kein unterstütztes Node-Projekt erkannt wurde, und beende.

### Phase 1: Skill-Discovery und Delivery-Setup

1. Sichte die verfügbaren Skills und binde `smart-dependency-updater` gemäß Skill-Discovery ein. Fehlt er, greift der „Minimale Fallback ohne Skill“ am Ende.

```include
skill-discovery
```

2. Bestimme gemäß „Delivery- und Worktree-Integration“ den effektiven Delivery-/Worktree-Modus und führe bei aktivem Modus das passende Setup aus (Worktree-Setup bei Worktree-Ausführung oder Liefer-Branch-Setup im Haupt-Repo bei In-Place-Delivery), **bevor** Baseline und Updates laufen. Alle folgenden Phasen laufen im Liefer-Arbeitsverzeichnis, damit die Commits pro Gruppe direkt auf dem Liefer-Branch entstehen.

### Phase 2: Baseline

Starte parallel im Liefer-Arbeitsverzeichnis:

1. `{{AGENT:code-validator}}` – Type-Checking, Lint, Build-Status.
2. `{{AGENT:test-writer}}` – führe ausschließlich die bestehenden Tests aus und dokumentiere das Ergebnis; schreibe in dieser Phase keine neuen Tests.

Dokumentiere die Baseline. Wenn die Baseline bereits rot ist (Build/Tests vor jedem Update kaputt): updaten nicht, sondern an `{{SKILL:fix}}` verweisen, da spätere Regressionen sonst nicht von Altlasten unterscheidbar sind.

### Phase 3: Delegierte Update-Umsetzung

Folge für die eigentliche Update-Arbeit dem `smart-dependency-updater`-Skill unter dem oben festgelegten **Delivery-Constraint**. Der Skill übernimmt: Update-Inventar (outdated + Audit), Gruppierung nach Risiko und Kopplung, Changelog-/Migrations-Research, lokale Impact-Analyse und Kompatibilitäts-Anpassung sowie die Validierungsstrategie pro Gruppe. `maintain` steuert die Orchestrierung, das Auswahl-Gate und die Auslieferung um diese Arbeit herum.

1. **Auswahl-Gate:** Präsentiere die vom Skill vorgeschlagenen Gruppen und kläre, welche jetzt umgesetzt werden.

```ask
header: Updates
question: Welche der vorgeschlagenen Update-Gruppen sollen jetzt umgesetzt werden?
options:
  - label: Alle sicheren
    description: Safe-Batch (Patch/Minor) und Security-Fixes automatisch, Major-Bumps überspringen
  - label: Auch Major
    description: Zusätzlich die Major-Bumps einzeln mit Breaking-Change-Adaption
  - label: Nur Security
    description: Ausschließlich Audit-/Security-Fixes anwenden
  - label: Auswahl
    description: Konkrete Gruppen als Freitext benennen
```

2. Leite aus der gewählten Update-Auswahl die explizite Abschlussbedingung ab (umgesetzte Gruppen, Baseline-Abgleich grün, Reviewer ohne offene kritische Findings bei Code-Anpassungen; siehe „Goal-getriebene Abschlusssteuerung“); sie deckt die Phasen 3–5 ab. Da das Update-Gate eine Auswahlfrage ist, stelle direkt nach der Auswahl die eigenständige Goal-Folgefrage gemäß „Explizite Goal-Abfrage für autonome Läufe“. Bei Wahl „Autonom via /goal“ gib den `/goal`-String für die Phasen 3–5 aus; die Folgefrage entfällt, wenn der Workflow nicht-interaktiv delegiert wurde.

```ask
when: der Workflow interaktiv läuft und nicht als nicht-interaktiver Sub-Agent (z. B. durch {{FIRMO}} apply-review) delegiert wurde
header: Goal
question: Verbleibende Phasen autonom unter /goal laufen lassen?
options:
  - label: Gated weiter
    description: Workflow läuft mit den üblichen Stopps weiter
  - label: Autonom via /goal
    description: Verbleibende Phasen autonom unter nativem /goal — der Skill gibt den einzufügenden /goal-String aus
```

3. Arbeite die freigegebenen Gruppen **nacheinander** ab. Für jede Gruppe wendet der Skill den Versionssprung an, aktualisiert das Lockfile über den erkannten Manager, recherchiert Breaking Changes und passt bei Bedarf lokalen Code an die geänderte API an – ausgeführt über den in Phase 0 bestimmten Implementer (`{{AGENT:ui-implementer}}`, `{{AGENT:nodejs-implementer}}`, `{{AGENT:rust-implementer}}` bzw. `{{AGENT:generic-implementer}}` für Tooling/CI/Config; Auftrag: nur an die geänderte API anpassen, kein neues Verhalten). Danach gleicht `maintain` gegen die Baseline ab:
   - grün → **ein sauberer Commit pro Gruppe** (siehe Commit-Regeln), aussagekräftige Message, z. B. `chore(deps): …`.
   - rot und reparabel → Anpassung über den Implementer nachziehen, erneut validieren – gemäß „Goal-getriebene Abschlusssteuerung“ die internen Korrekturrunden begrenzen; bleibt die Gruppe danach rot, wie „nicht sinnvoll reparabel“ behandeln statt unbegrenzt zu wiederholen.
   - rot und nicht sinnvoll reparabel → Gruppe zurückrollen (Manifest und Lockfile auf den Stand vor der Gruppe) und als „manuell“ markieren.
4. Halte Ergebnis und Begründung je Gruppe in der Wisdom-Datei fest.

### Phase 4: Review

Nur wenn in Phase 3 Code für Breaking Changes angepasst wurde:

1. Starte den passenden Reviewer für die geänderten Dateien (`{{AGENT:frontend-reviewer}}`, `{{AGENT:nodejs-reviewer}}` bzw. `{{AGENT:rust-reviewer}}`).
2. Behebe kritische Findings vor dem Abschluss.
3. Wenn Findings mit Status `Offen` oder `Nicht umgesetzt` verbleiben, schreibe sie gemäß „Offene Review-Finding-Reports“ in eine neue Datei unter `.effective-flow/review/` und nenne den Reportpfad in der Abschlusszusammenfassung.

Reine Dependency-Bumps ohne Code-Anpassung brauchen kein Reviewer-Pass; vermerke das kurz.

### Phase 5: Report und Abschluss

1. Führe `{{AGENT:code-validator}}` ein letztes Mal als Final-Check aus.
2. Fasse auf Basis des update-spezifischen Reportings aus dem Skill zusammen:
   - welche Gruppen umgesetzt und committet wurden (mit Versionssprüngen),
   - welche Audit-Befunde behoben wurden,
   - welche Updates als „manuell“ zurückgestellt wurden und warum,
   - Verweis auf einen ausgelagerten Review-Report, falls vorhanden.
3. Bestätige, dass das Verhalten unverändert blieb (Baseline-Abgleich grün).
4. Lösche die Wisdom-Datei.
5. Wenn Delivery oder Worktree-Ausführung aktiv war: führe das Handback gemäß „Delivery- und Worktree-Integration“ aus. Die Commits pro Gruppe liegen bereits auf dem Liefer-Branch; das Handback zieht ggf. den Worktree zurück, führt die Abschluss-Aktion `pr`/`merge`/`branch` aus und stellt den Checkout zurück. Nenne Liefer-Branch, finalen Checkout-Zustand und Ergebnis in der Zusammenfassung.

```include
pre-commit-gate
```

```include
commit-message-rules
```

## Minimaler Fallback ohne Skill

Nur relevant, wenn `smart-dependency-updater` nicht verfügbar ist. Kurze Kern-Guidance, damit `maintain` sauber degradiert – **kein** zweites vollständiges Update-Handbuch:

- Paketmanager am Lockfile erkennen (`pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `bun.lockb` → bun, sonst `package-lock.json`/npm) und alle Befehle daraus ableiten – nie auf npm hardcodieren.
- Veraltete Dependencies (`outdated`) und Security-Befunde (`audit`) über den erkannten Manager sammeln.
- Grob gruppieren: Safe-Batch (Patch/Minor ohne bekannte Breaking Changes), Major einzeln (mit Changelog-Hinweis), Security separat.
- Pro Gruppe: Bump anwenden, Lockfile über den Manager aktualisieren, gegen die Baseline validieren; grün → ein Commit pro Gruppe, rot → zurückrollen und als „manuell“ markieren.
- Bei Major-Bumps Changelog/Release Notes lesen und Code nur an die geänderte API anpassen (kein neues Verhalten).

## Regeln

- Starte unabhängige Phasen (Baseline-Validierung und Tests) parallel.
- Gib nach jeder Phase eine kurze Statusmeldung.
- Ein Commit pro Gruppe, nicht ein Sammelcommit über alle Updates.
- Niemals updaten, solange die Baseline rot ist.
- Keine neuen Features, keine ungeplanten Bugfixes und kein allgemeines Refactoring im Wartungslauf.
- Bei unklarem Risiko (Major ohne Tests im betroffenen Bereich) einzeln bestätigen lassen, statt im Batch durchzuwinken.
- Delivery bleibt bei `maintain`: der delegierte Skill legt keine Branches/PRs an und pusht nicht.
