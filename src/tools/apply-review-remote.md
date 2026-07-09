---
description: "Interne Teil-Datei von apply-review: Issue-Tracker-Anbindung und kompletter Remote-Ablauf. Wird von tools/apply-review.md nur geladen, wenn der Tracker-Modus remote ist."
---

# Firmo Apply Review – Remote-Modus

Diese interne Teil-Datei wird von `tools/apply-review.md` geladen, sobald der Tracker-Modus `remote` ist (das Argument ist ein Epic- oder Finding-Issue). Sie enthält die vollständige Issue-Tracker-Anbindung und den Remote-Ablauf; im lokalen Modus wird sie nie geladen.

```include
issue-tracker
```

## Remote-Modus (Issue-Tracker)

Wenn der Tracker-Modus `remote` ist (siehe „Issue-Tracker-Anbindung (Remote-Modus)“), gelten die folgenden Anpassungen **zusätzlich** zum bzw. anstelle des lokalen Report-Flusses. Bestimme den Modus zu Beginn von Phase 1; der Argumenttyp hat dabei Vorrang vor der Config.

### Argument-Erkennung und Modusbestimmung

Klassifiziere das übergebene Argument über die „Apply-Quellen-Erkennung“ (Stufe A und – für Issue-Referenzen – Stufe B) und leite Modus und Sub-Modus aus dem Quelltyp ab:

- **`review-report`** (Report-Datei unter `.firmo/review/`) → `local` (bisheriges Verhalten, unverändert).
- **`review-epic`** (Issue mit `firmo-review-epic`-Label, Alt `sf-review-epic` gleichwertig) → `remote`, **Epic-Modus**: alle im Epic verlinkten Finding-Issues abarbeiten.
- **`review-finding`** (ein einzelnes Finding-Issue oder eine Liste von Finding-Issue-Referenzen) → `remote`, **Issue-Listen-Modus**: nur genau diese Findings abarbeiten. Das zugehörige Epic je Finding wird für das spätere Abhaken aus dem Sub-Issue ermittelt (`Epic`-Feld/Referenz), sofern vorhanden.
- **`remote` ohne Argument** → offene Epics auflisten und den User wählen lassen.
- **`plan`, `container-issue` oder `plain-issue`** → gehört nicht zu `{{SKILL:apply-review}}`: auf den zuständigen Skill verweisen (`{{SKILL:apply-plan}}` für Plan-Dateien, `{{SKILL:apply-issues}}` für sonstige Issues, oder `{{SKILL:apply}}` zum automatischen Routen) und beenden. Bei Delegation aus `{{SKILL:apply}}` sollte dieser Fall nicht auftreten; die Weiche bleibt als Schutz.

Der Argumenttyp hat Vorrang vor der Config (siehe „Modus bestimmen“ in der Tracker-Anbindung): `review-report` erzwingt `local`, `review-epic`/`review-finding` erzwingen `remote`. Bei `remote` vorab Host und CLI erkennen und die CLI-Verfügbarkeit prüfen; fehlt das CLI, klar abbrechen (kein stiller Fallback auf `local`).

### Phase 1 remote: Findings aus Issues lesen

Ersetzt das Einlesen der Report-Datei. Bestimme die abzuarbeitenden Finding-Issues (Epic-Task-Liste parsen bzw. übergebene Liste verwenden). Lies je Finding-Issue den vollständigen Body **und die Kommentare frisch vom Tracker** (Operation „Kommentare lesen“) und klassifiziere:

- **Label `wontfix`** → nicht umsetzen, ADR erstellen (Phase 3 remote).
- **bereits abgehakt/geschlossen** → überspringen.
- **Sub-Issue ohne Ziel-Aktion oder Prompt** (manuell verändert) → als nicht umsetzbar melden, nicht raten.
- **Entwicklerkommentar (Nicht-Firmo) vorhanden** → umsetzen **mit Kontext**: den Kommentartext als zusätzlichen Kontext an den Delegations-Skill mitgeben. Das ist das Remote-Äquivalent der lokalen „Entwickler-Anmerkung“ im Fall „Umsetzen mit Kontext“. Die bewusste Ablehnung läuft im Remote-Modus weiterhin **ausschließlich** über das Label `wontfix`, nicht über Kommentartext; Firmo-Kommentare (z. B. `<!-- … -->`-markierte Status- oder PR-Link-Kommentare) zählen nicht als Entwickler-Anmerkung.
- **sonst** → umsetzen.

Lege die Per-Finding-Tasks wie im lokalen Modus an; die Finding-ID ist die `R-XXXXXXX`-ID aus dem Issue-Titel.

### Phase 2 remote: Commit- und PR-Strategie

Die Commit-Strategie ist im Remote-Modus fest **„ein PR pro Finding“** — die lokale Commit-Strategie-Frage entfällt. Jedes umsetzbare Finding ist eine **eigene Sub-Gruppe** in einem eigenen Liefer-Branch, bevorzugt mit Worktree-Isolation. Basis-Branch und Branch-Namensbildung stützen sich auf den `delivery`-Config-Block: Branch `<delivery.branchPrefix>/apply-review/<R-ID-oder-slug>` ab `delivery.baseBranch` (Legacy-Fallback: alte `worktree.baseBranch`/`worktree.branchPrefix`-Werte). Dateiüberlappende Findings laufen sequenziell, um Arbeitsbaum-Konflikte zu vermeiden; die Union-Find-Zusammenfassung aus Phase 4.2 entfällt, weil jedes Finding einen eigenen Branch/PR braucht. Die Stash-Policy und der `/goal`-String werden wie im lokalen Modus behandelt.

### Phase 3 remote: ADR referenziert Issue

Für jedes `wontfix`-Finding ein ADR erstellen wie in Phase 3, jedoch mit Bezug auf Issue-Nummer und Epic statt auf ein Report-Finding (Kontext: `Issue #<nr>` und `Epic #<nr>`). Markiere das Finding im Epic später als `- [x] … — nicht umgesetzt (ADR <Nummer>)`.

### Phase 4 remote: Umsetzung, PR und Epic-Abhaken

Pro umsetzbarem Finding, in dessen Worktree:

1. Vorabanalyse und Umsetzung wie in Phase 4.1/4.3 über den passenden Delegations-Skill (`{{SKILL:fix}}`, `{{SKILL:refactor}}`, `{{SKILL:build}}`, `{{SKILL:docs}}`). Gib einen in Phase 1 remote erkannten Entwicklerkommentar als zusätzlichen Kontext an den Delegations-Skill mit.
2. Änderungen committen (Conventional-Commit-Message, keine internen Finding-IDs, kein `Co-Authored-By`), Branch pushen.
3. Über `{{SKILL:pr}}` genau einen PR gegen den Basis-Branch erstellen; im PR-Body `Closes #<Sub-Issue>` setzen.
4. **Direkt nach PR-Erstellung** den zugehörigen Eintrag im Epic-Body abhaken (`- [ ]` → `- [x]`, PR-Link anhängen) und optional den PR-Link als Kommentar ans Sub-Issue schreiben. Body vor dem Ändern frisch lesen und nur die betroffene Zeile umschalten.
5. **Schlägt die PR-Erstellung fehl** (Push abgelehnt, kein Commit): Finding als fehlgeschlagen markieren, Epic-Eintrag **nicht** abhaken, nächstes Finding fortsetzen.
6. **Fehlt ein zugeordnetes Epic** (Issue-Listen-Modus): Finding trotzdem umsetzen und PR erstellen; das Abhaken entfällt und wird dem User gemeldet.

### Phase 5 remote: Tracking-Oberfläche statt Report

Es wird keine Report-Datei aktualisiert. Stelle stattdessen sicher, dass alle Epic-Checkboxen und Sub-Issue-Kommentare/Labels den Endstand widerspiegeln (umgesetzt → abgehakt mit PR-Link, `wontfix` → abgehakt mit ADR-Referenz).

### Phase 7/8 remote

Finale Validierung und Zusammenfassung wie im lokalen Modus; die Zusammenfassung nennt zusätzlich Epic-URL, die erstellten PRs und die abgehakten Findings.
