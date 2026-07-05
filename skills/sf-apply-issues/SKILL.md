---
name: sf-apply-issues
description: "Nimmt einen oder mehrere GitHub-/Forgejo-Issues (einzeln, als Liste oder als Container-Issue mit Sub-Issue-Checkliste) entgegen, analysiert und klassifiziert den Inhalt und routet ausreichend spezifizierte Issues an {{SKILL:sf-build}}, {{SKILL:sf-fix}}, {{SKILL:sf-refactor}} oder {{SKILL:sf-docs}} (ein PR pro Issue). Unzureichend spezifizierte Issues werden übersprungen und für {{SKILL:sf-plan-issues}} markiert. Status-Updates laufen als Issue-Kommentare."
type: orchestrator
---

# SF Apply Issues

Du bist der Orchestrator, der beliebige Issues aus einem externen Tracker analysiert und an den passenden Umsetzungs-Workflow weitergibt.

## Ziel

Dieser Skill nimmt eine oder mehrere Issue-Referenzen (GitHub über `gh`, Forgejo über `tea`) entgegen und arbeitet sie über die bestehenden Umsetzungs-Skills ab. Anders als `{{SKILL:sf-apply-review}}` verarbeitet er **keine** von `{{SKILL:sf-review}}` erzeugten, strukturierten Finding-Issues, sondern **frei geschriebene Menschen-Issues** ohne Plan- oder Finding-Struktur. Deshalb wird jeder Issue-Inhalt zuerst **analysiert und klassifiziert**, bevor er geroutet wird:

- Feature → `{{SKILL:sf-build}}`
- Bugfix → `{{SKILL:sf-fix}}`
- Refactoring → `{{SKILL:sf-refactor}}`
- Dokumentation → `{{SKILL:sf-docs}}`

Reicht die Information für eine autonome Umsetzung nicht aus, wird das Issue **übersprungen**, mit Label `sf-needs-planning` markiert und per Kommentar erklärt. `{{SKILL:sf-plan-issues}}` sammelt diese Issues später ein und vervollständigt die Planung.

Der Skill implementiert nichts selbst. Er ist eine Analyse- und Routing-Schicht über den bestehenden Workflow-Skills. Alle Status-Updates werden **als Kommentare am jeweiligen Issue** angehängt.

```include
language-rules
```

```include
task-tracking
```

```include
commit-message-rules
```

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie früh im Workflow und beachte ihre Vorgaben für Routing, Commits und User-Rückfragen.

## Fertig-Protokoll

Wenn du interne Sub-Agenten (Analyse oder Delegation) einsetzt, müssen sie mit `ERLEDIGT` oder `ABBRUCH: [Grund]` enden.

Retry-Eskalation:

1. gleicher Auftrag mit Fortsetzungs-Hinweis
2. vereinfachter Auftrag
3. minimaler Auftrag
4. danach User fragen, wie weiter vorzugehen ist

```include
goal-completion
```

## Wisdom Accumulation

Verwende `.sf-plugin/.wisdom-accumulation-<SESSION_ID>.tmp.md` für:

- die aufgelöste Arbeitsliste (Issue-Nummer, optionale Epic-Referenz)
- die Analyse pro Issue (Klassifikation, ausreichend/unzureichend, Ziel-Skill, Prompt-Vorschlag, Konfidenz, Fehlendes)
- erstellte PRs und abgehakte Epic-Einträge
- übersprungene Issues mit Grund
- fehlgeschlagene Delegationen

Schreibe nach jeder Phase ein Summary und gib es an spätere Phasen weiter. Lösche die Datei am Ende.

## Tracker-Anbindung

Dieser Skill ist **inhärent remote**: er arbeitet immer gegen den Issue-Tracker der `origin`-Remote. Der `tracker.mode`-Umschalter aus `{{SKILL:sf-review}}`/`{{SKILL:sf-apply-review}}` wird **nicht** ausgewertet. Aus dem folgenden geteilten Baustein nutzt dieser Skill nur die werkzeug-generische Plumbing: Host- und CLI-Erkennung, Verfügbarkeits-/Auth-Prüfung, das Operation-→-Kommando-Mapping und die Fehlerfälle. Die finding-/epic-spezifischen Body-Formate gelten hier nicht; die Checkbox-Abhak-Mechanik für Epic-Bodys wird bei Container-Issues sinngemäß mitgenutzt.

```include
issue-tracker
```

## Kommentar-Konventionen

Alle Status-Updates werden als Issue-Kommentare geschrieben (Operation „Kommentar hinzufügen" aus dem Mapping oben). Verwende diese kanonischen Vorlagen und beginne jeden Plugin-Kommentar mit der Markierung `<!-- sf-apply-issues -->`, damit spätere Läufe eigene Kommentare erkennen und Doppel-Kommentare vermeiden:

- **Umgesetzt:** `🤖 Umgesetzt via /apply-issues — PR #<nr>` (keine internen IDs, kein `Co-Authored-By`).
- **Übersprungen:** `⏭️ Übersprungen: Für eine autonome Umsetzung fehlen noch Angaben: <Liste des Fehlenden>. Mit /plan-issues vervollständigen.`
- **Fehlgeschlagen:** `⚠️ Umsetzung fehlgeschlagen: <kurzer Grund>. Issue bleibt offen.`

Exponiere in Kommentaren keine internen Tracking-IDs oder Session-Details.

## Workflow

### Phase 1: Argument & Tracker-Setup

1. Bestimme Host und CLI und prüfe die Verfügbarkeit/Authentifizierung gemäß „Host- und CLI-Erkennung" im eingebundenen Baustein. Vorbedingung: Git-Repository mit `origin`-Remote. Fehlt `origin`, das CLI oder die Authentifizierung: klar melden und ohne Seiteneffekt abbrechen (kein stiller Fallback).
2. Lies das User-Argument als eine oder mehrere Issue-Referenzen (Nummer, `#123` oder Issue-URL, beliebig gemischt).
   - Ist das Argument ein Pfad zu einer `docs/plan/`-Datei: weise darauf hin, dass dafür `{{SKILL:sf-apply-plan}}` zuständig ist, und beende den Skill.
   - Ohne Argument: liste offene Issues, die weder `sf-issue-done` noch `sf-needs-planning` tragen, und frage den User, welche verarbeitet werden sollen. Verwende **keine** heuristische Auto-Auswahl.
3. Lege die benötigten Labels idempotent an (`sf-issue-done`, `sf-needs-planning`; eine „already exists"-Meldung tolerieren).

### Phase 2: Expansion & Arbeitsliste

1. Lies jedes referenzierte Issue **frisch** vom Tracker (Body, Labels, Status).
2. **Container-Erkennung:** Enthält der Body eine Aufgabenliste mit Issue-Referenzen (`- [ ] #NNN …` / `- [x] #NNN …`), behandle das Issue als Container:
   - expandiere auf die **offenen** (`- [ ]`) Sub-Issue-Referenzen und merke das Container-Issue als Epic für das spätere Abhaken,
   - überspringe erledigte (`- [x]`) Einträge,
   - lies anschließend jedes offene Sub-Issue frisch vom Tracker.
     Enthält der Body keine solche Liste, ist das Issue selbst ein Einzel-Arbeitsitem.
3. Überspringe Arbeitsitems, die bereits geschlossen sind oder das Label `sf-issue-done` tragen (Idempotenz).
4. Dedupliziere die Arbeitsliste (dieselbe Issue-Nummer nur einmal, auch wenn sie über mehrere Container erreichbar ist).
5. Ergebnis: flache Liste von Arbeitsitem-Issues, je mit optionaler Epic-Referenz. Halte sie in der Wisdom-Datei fest.
6. Lege pro Arbeitsitem eine Task an (Aufgabenverfolgung mit per-Issue-Granularität) und gib dem User eine Übersicht:

```markdown
| Status | Anzahl |
|---|---|
| Zu analysieren | X |
| davon aus Container expandiert | C |
| bereits erledigt (übersprungen) | Z |
| Gesamt | N |
```

7. Falls die Arbeitsliste leer ist: Kurzmeldung und Abbruch.

### Phase 3: Analyse & Klassifikation (parallel pro Arbeitsitem)

Starte für **jedes Arbeitsitem** einen Analyse-Sub-Agenten parallel. Diese Sub-Agenten implementieren nichts und ändern keine Dateien — sie analysieren nur.

Jeder Analyse-Sub-Agent erhält den Issue-Body und den Auftrag, die Codebase zu untersuchen und ein strukturiertes Ergebnis zu liefern:

- **Klassifikation:** Feature / Bugfix / Refactoring / Dokumentation (Definitionen wie in `{{SKILL:sf-plan}}`, Phase 1) und daraus der Ziel-Skill (`{{SKILL:sf-build}}` / `{{SKILL:sf-fix}}` / `{{SKILL:sf-refactor}}` / `{{SKILL:sf-docs}}`).
- **Ausreichend-Prüfung:** Lässt sich aus dem Issue ein klares Soll-Verhalten und mindestens ein **messbares Akzeptanzkriterium** ableiten, und gibt es genug Datei-/Bereichs-Hinweise, damit der Ziel-Workflow autonom starten kann? Ergebnis: `ausreichend` oder `unzureichend`. Bei `unzureichend`: konkrete Liste des Fehlenden (offene fachliche Fragen, fehlende Akzeptanzkriterien, unklarer Scope).
- **Prompt-Vorschlag:** direkt verwendbarer Klartext-Auftrag für den Ziel-Skill.
- **Konfidenz:** `Hoch` / `Mittel` / `Niedrig` bezüglich des Datei-Scopes (analog zur Vorabanalyse in `{{SKILL:sf-apply-review}}`).
- **Betroffene Dateien:** beste Schätzung der berührten Dateien (für die Konfliktbetrachtung in Phase 4).

Schreibe jedes Ergebnis in die Wisdom-Datei. Im Zweifel gilt ein Issue als `unzureichend` — lieber sauber an `{{SKILL:sf-plan-issues}}` übergeben als auf unklarer Grundlage implementieren.

### Phase 4: Routing & Delegation

Die Commit-/PR-Strategie ist fest **„ein PR pro Issue"** (keine Commit-Strategie-Frage). Jedes umsetzbare Issue ist eine eigene Sub-Gruppe in einem eigenen Worktree/Branch, analog zum Remote-Modus von `{{SKILL:sf-apply-review}}` (Phase 4 remote): Branch ab dem Basis-Branch aus dem `worktree`-Config-Block, ein PR über `{{SKILL:sf-pr}}`. Dateiüberlappende Issues laufen sequenziell, um Arbeitsbaum-Konflikte zu vermeiden; nicht überlappende laufen parallel.

**Unzureichende Issues (`unzureichend`):**

1. Nicht implementieren.
2. Label `sf-needs-planning` setzen.
3. Übersprungen-Kommentar mit der Liste des Fehlenden anhängen (Vorlage oben), sofern nicht bereits ein gleichlautender Plugin-Kommentar existiert.
4. Task auf `completed` mit Zusatz `[übersprungen]`.

**Ausreichende Issues (`ausreichend`), je Issue in dessen Worktree:**

1. An den in Phase 3 bestimmten Ziel-Skill delegieren und den Prompt-Vorschlag als Aufgabenbeschreibung mitgeben:
   - Feature: `Verwende den Skill {{SKILL:sf-build}} für dieses Issue.`
   - Bugfix: `Verwende den Skill {{SKILL:sf-fix}} für dieses Issue.`
   - Refactoring: `Verwende den Skill {{SKILL:sf-refactor}} für dieses Issue.`
   - Dokumentation: `Verwende den Skill {{SKILL:sf-docs}} für dieses Issue.`
     Der Delegations-Sub-Agent läuft als **nicht-interaktive** Delegation (Kontext-Hinweis „[Kontext von /apply-issues: …]"): keine explizite Goal-Abfrage, kein `/goal`-String, Fertig-Protokoll `ERLEDIGT`/`ABBRUCH`.
2. Änderungen committen (Conventional-Commit-Message, keine internen IDs, kein `Co-Authored-By`) und den Branch über `{{SKILL:sf-pr}}` als genau einen PR gegen den Basis-Branch führen; im PR-Body `Closes #<Issue>` setzen.
3. **Direkt nach PR-Erstellung:** PR-Link als Kommentar ans Issue schreiben (Vorlage „Umgesetzt"), Label `sf-issue-done` setzen und – falls das Issue aus einem Container stammt – den zugehörigen Checklisten-Eintrag im Epic-Body abhaken (Epic-Body frisch lesen, nur die betroffene Zeile `- [ ]` → `- [x]` umschalten und den PR-Link anhängen).
4. Task auf `completed`.

**Fehlerfälle:**

- Schlägt die Delegation (`ABBRUCH`) oder die PR-Erstellung fehl: Issue **nicht** als erledigt markieren, `sf-issue-done` nicht setzen, den Epic-Eintrag **nicht** abhaken, einen Fehlgeschlagen-Kommentar anhängen und mit dem nächsten Issue fortfahren. Task auf `completed` mit Zusatz `[fehlgeschlagen]`.
- Fehlt einem aus einer Liste übergebenen Issue ein zugeordnetes Epic: trotzdem umsetzen und PR erstellen; das Abhaken entfällt und wird dem User gemeldet.

Gib nach jedem abgeschlossenen Issue eine kurze Statusmeldung.

### Phase 5: Zusammenfassung

Berichte dem User:

- verarbeitete Issues mit Ergebnis (umgesetzt / übersprungen / fehlgeschlagen)
- erstellte PRs mit URL
- übersprungene Issues (`sf-needs-planning`) mit Grund und dem Hinweis, dass `{{SKILL:sf-plan-issues}}` die Planung vervollständigen kann
- abgehakte Epic-Einträge, falls Container verarbeitet wurden

Lösche anschließend die Wisdom-Datei.

## Regeln

- Ändere selbst keine Implementierungsdateien; die Umsetzung liegt bei den delegierten Workflows.
- Erzeuge keine `docs/plan/`-Datei; die interne Planung übernimmt der jeweilige Umsetzungs-Workflow.
- Verwende keinen heuristischen „neuesten Issue", wenn mehrere Kandidaten existieren.
- Im Zweifel über die Ausreichend-Prüfung: als `unzureichend` behandeln und an `{{SKILL:sf-plan-issues}}` verweisen, statt zu raten.
- Setze niemals `Co-Authored-By`-Trailer und exponiere keine internen IDs in Commits oder Kommentaren.
- Gib dem User nach jeder Phase eine kurze Statusmeldung.
