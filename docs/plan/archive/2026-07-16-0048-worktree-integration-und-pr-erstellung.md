# 0048: Worktree-Integration und PR-Erstellung für Code-ändernde Skills

**Planungsstatus:** Umgesetzt
**Quelle:** /plan
**Empfohlener Workflow:** Feature (`/build`)

## Anforderung

Die Code-ändernden Skills sollen besser mit GitHub- und Forgejo-Pull-Requests verknüpft werden und paralleles Arbeiten auf dem lokalen Repo ermöglichen. Konkret:

- Für die aktiv Code verändernden Skills `sf-build`, `sf-fix`, `sf-refactor`, `sf-docs` und `sf-maintain` soll – wenn das Feature aktiv ist und nicht ausdrücklich anders verlangt – ein Git-Worktree auf einem konfigurierbaren Basis-Branch (Default `origin/main`) erzeugt werden. Die gesamte Implementierungsarbeit läuft in diesem Worktree.
- Nach Abschluss der Arbeit wird der geänderte Code als Branch im lokalen Repo „zurückgezogen“: Da der Worktree dasselbe `.git` teilt, ist der dort erzeugte Liefer-Branch bereits Teil des lokalen Repos; das Worktree-Verzeichnis wird entfernt und der Branch bleibt erhalten.
- Aus diesem Branch kann ein Pull-Request erstellt werden. Die PR-Erstellung wird ein eigener neuer Skill `sf-pr`, der GitHub (über `gh`) und Forgejo (über `tea`) unterstützt.
- Ist kein PR gewünscht, gibt es optional einen Merge zurück auf den Basis-Branch.
- Das Gesamtpaket ist **opt-in** über `.sf-plugin/config.json`, weil nicht jedes Repo über GitHub oder Forgejo gehostet ist. Ist das Feature deaktiviert (Default), verhalten sich die fünf Skills exakt wie heute.
- Der Basis-Branch für die Worktrees ist konfigurierbar, Default `origin/main`.

**Begründung der Workflow-Empfehlung:** Es entstehen neue Funktionalität (ein neuer Skill `sf-pr`, ein neues Verhalten „Worktree + Branch + PR/Merge“ in fünf Skills) und ein neues Shared-Include. Das ist eine Feature-Erweiterung des Plugins, daher `/build`.

## Architekturentscheidungen

- **Zentrales Shared-Include `worktree-integration.md`:** Das gesamte Lebenszyklus-Verhalten (Config-Schema, Opt-in-Erkennung, Worktree-Setup, Handback, Abschluss-Aktion) wird einmal in `skills/_shared/worktree-integration.md` beschrieben und per ` ```include ` in alle fünf Code-ändernden Skills eingebunden. So bleibt das Verhalten konsistent und an einer Stelle wartbar – analog zu bestehenden Includes wie `pre-commit-gate` oder `goal-completion`.
- **Eigener Top-Level-Config-Block `worktree`:** Weil das Feature mehrere Skills betrifft, bekommt es einen eigenen Top-Level-Namespace in `.sf-plugin/config.json`, getrennt vom bestehenden `applyReview.worktree`. Die Config-Migration folgt dem etablierten nicht-destruktiven Muster der anderen Skills.
- **Opt-in mit Default „aus“:** `worktree.enabled` ist standardmäßig `false`. Nur bei `true` (oder expliziter Anforderung im Lauf) wird der Worktree-Modus aktiv. Damit bleibt das bisherige In-Place-Verhalten der fünf Skills der Default.
- **Liefer-Branch = Worktree-Branch:** Der Worktree wird direkt mit dem Liefer-Branch erzeugt (`git worktree add <PATH> -b <BRANCH> <BASE_REF>`). „Zurückziehen“ bedeutet: Worktree-Verzeichnis entfernen, Branch bleibt im lokalen Repo. Es wird **kein** separater Branch via cherry-pick/rebase erzeugt (vom User bestätigt).
- **Commit-Pflicht über `sf-commit`-Logik:** Damit Branch/PR sinnvoll sind, committen die Skills ihre Arbeit im Worktree. Die Commit-Logik aus `sf-commit` (explizites Stagen der bekannten Dateien, Conventional-Commit-Message, keine `Co-Authored-By`-Trailer) wird wiederverwendet (vom User bestätigt). `sf-maintain` behält seine bestehende „ein Commit pro Gruppe“-Logik; diese Commits entstehen dann einfach im Worktree.
- **Abschluss-Aktion config-gesteuert mit Ask-Fallback:** `worktree.completion` steuert die Abschluss-Aktion (`pr` / `merge` / `branch`). Ist kein gültiger Wert gesetzt, wird gefragt – analog zu `applyReview.defaultCommitStrategy`.
- **Neuer Skill `sf-pr` (Typ `utility`):** Die PR-Erstellung ist ein eigenständiger Skill, der sowohl von den fünf Skills (bei `completion: "pr"`) als auch direkt (`/pr`) aufrufbar ist. Host-Erkennung über die `origin`-Remote-URL: `github.com` → `gh`, sonst → Forgejo via `tea`.
- **`sf-apply-review` bleibt unberührt:** Dessen bestehender Worktree-Mechanismus (per-Finding-Parallelisierung mit cherry-pick zurück auf den aktuellen Branch, Plan 0027) verfolgt ein anderes Ziel und ist **nicht** Teil dieses Plans.
- **Build-System unverändert nutzbar:** `build.mjs` entdeckt `skills/sf-pr/` automatisch und löst das neue Include automatisch auf. Lediglich die hardcodierte Marketplace-Beschreibung/Tags werden um `pr` ergänzt.

## Betroffene Dateien

| Datei                                    | Beschreibung                                                                                                                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/_shared/worktree-integration.md` | **Neu.** Beschreibt Config-Schema `worktree.*`, Config-Migration, Opt-in/Per-Run-Override-Erkennung, Worktree-Setup, Handback (Worktree entfernen, Branch behalten) und die drei Abschluss-Aktionen `pr`/`merge`/`branch`. |
| `skills/sf-pr/SKILL.md`                  | **Neu.** Utility-Skill zur PR-Erstellung: Host-Erkennung, Branch-Push, Titel/Body-Ableitung, `gh`- bzw. `tea`-Aufruf, Fehlerbehandlung.                                                                                    |
| `skills/sf-build/SKILL.md`               | Worktree-Include einbinden; Setup-Phase um Worktree-Erzeugung, Abschlussphase um Commit + Handback + Abschluss-Aktion erweitern.                                                                                           |
| `skills/sf-fix/SKILL.md`                 | Analog zu `sf-build`.                                                                                                                                                                                                      |
| `skills/sf-refactor/SKILL.md`            | Analog zu `sf-build`.                                                                                                                                                                                                      |
| `skills/sf-docs/SKILL.md`                | Analog zu `sf-build`.                                                                                                                                                                                                      |
| `skills/sf-maintain/SKILL.md`            | Analog; zusätzlich Abstimmung mit der bestehenden „ein Commit pro Gruppe“-Logik (Commits entstehen im Worktree).                                                                                                           |
| `build.mjs`                              | Marketplace-Beschreibung und Tags um den neuen Skill `pr` bzw. Stichworte wie `git`, `pull-request`, `worktree` ergänzen.                                                                                                  |

## Implementierungsdetails

### Vorgehen

1. Shared-Include `skills/_shared/worktree-integration.md` schreiben: Config-Schema, Migration, Opt-in-Logik, Setup, Handback, Abschluss-Aktionen.
2. Neuen Skill `skills/sf-pr/SKILL.md` schreiben (Frontmatter `type: utility`, Includes `language-rules`, `task-tracking`, `commit-message-rules`).
3. Die fünf Code-ändernden Skills um den Include und um die Setup-/Abschluss-Schritte erweitern.
4. `build.mjs`-Marketplace-Metadaten um `pr` ergänzen.
5. Build ausführen und prüfen, dass Codex- und Claude-Artefakte für `sf-pr` und die geänderten Skills korrekt erzeugt werden (Include korrekt aufgelöst, `{{SKILL:sf-pr}}` → `/pr` bzw. `$pr`).

### Config-Schema `worktree`

Geplanter Block in `.sf-plugin/config.json` (Defaults bewusst rückwärtskompatibel):

```json
{
  "worktree": {
    "enabled": false,
    "baseBranch": "origin/main",
    "branchPrefix": "sf",
    "completion": null,
    "setup": "auto",
    "baseDir": ".sf-plugin/.worktrees"
  }
}
```

Defaults bei fehlendem Wert:

- `worktree.enabled`: `false` (Feature aus)
- `worktree.baseBranch`: `"origin/main"`
- `worktree.branchPrefix`: `"sf"`
- `worktree.completion`: nicht gesetzt → Abschluss-Aktion wird gefragt
- `worktree.setup`: `"auto"`
- `worktree.baseDir`: `.sf-plugin/.worktrees`

Gültige Werte:

- `worktree.enabled`: `true`, `false`
- `worktree.completion`: `"pr"`, `"merge"`, `"branch"`
- `worktree.setup`: `"auto"`, `"none"` oder ein expliziter Setup-Befehl als String (Setup-Erkennung identisch zur bestehenden Worktree-Setup-Tabelle in `sf-apply-review`: `pnpm-lock.yaml` → `pnpm install --frozen-lockfile --prefer-offline`, `package-lock.json` → `npm ci`, usw.)

**Config-Migration:** Nicht-destruktiv nach dem etablierten Muster (fehlende Schlüssel mit Defaults ergänzen, gültige Werte und unbekannte Schlüssel erhalten, Datei vor dem Schreiben frisch einlesen, bei ungültigem JSON Defaults nutzen und User informieren, Migration in `.sf-plugin/memory.json` unter `configMigration` protokollieren). Da `worktree.enabled` per Default `false` ist, bleibt das Opt-in auch nach automatischer Migration gewahrt. Die Migration wird von jedem Skill durchgeführt, der den Include nutzt (idempotent, durch Re-Read abgesichert).

### Opt-in- und Per-Run-Override-Erkennung

In der jeweils ersten/Setup-Phase jedes der fünf Skills wird der effektive Modus bestimmt:

- Basis: `worktree.enabled` aus der Config.
- Per-Run-Override hat Vorrang: Verlangt der User im Lauf ausdrücklich PR/Branch/Worktree-Arbeit, wird der Worktree-Modus aktiviert, auch wenn `enabled: false`. Verlangt er ausdrücklich In-Place-Arbeit („ohne Worktree“, „direkt auf dem aktuellen Branch“), bleibt der heutige Modus aktiv, auch wenn `enabled: true`.
- Ist der Modus inaktiv, läuft der Skill unverändert wie heute (keine Verhaltensänderung).

### Worktree-Setup (Setup-Phase)

Bei aktivem Modus, beschrieben im Include:

1. Vorbedingungen prüfen: `git worktree` verfügbar; Basis-Ref auflösbar.
2. Ist `baseBranch` ein Remote-Ref (z. B. `origin/main`): zuerst `git fetch <remote> <branch>`, damit der Worktree auf dem aktuellen Remote-Stand startet.
3. Worktree-Pfad bestimmen analog `sf-apply-review`: `BASE_DIR/REPO_NAME/SESSION_ID` (mit `REPO_NAME` aus `basename "$(git rev-parse --show-toplevel)"`, `BASE_DIR` aus `worktree.baseDir`).
4. Liefer-Branch-Name `BRANCH = <branchPrefix>/<skill>/<slug>` (z. B. `sf/build/user-login`), Slug aus Plan-Titel oder Aufgabenbeschreibung. Bei Namenskollision numerisches Suffix anhängen.
5. Worktree erzeugen: `git worktree add <PATH> -b <BRANCH> <BASE_REF>`.
6. Setup gemäß `worktree.setup` im Worktree ausführen (Modus vorher kurz anzeigen).
7. Alle nachfolgenden Sub-Agenten (Implementer, Validator, Test-Writer, Doc-Writer) mit Arbeitsverzeichnis = Worktree-Pfad starten.

### Handback und Abschluss-Aktion (Abschlussphase)

Im Anschluss an die normale Abschlusslogik des jeweiligen Skills (inkl. Goal-Verifikation):

1. **Commit sicherstellen:** Alle beabsichtigten Änderungen im Worktree committen – über die Commit-Logik aus `sf-commit` (explizit nur die bekannten Dateien stagen, Conventional-Commit-Message ableiten, keine `Co-Authored-By`-Trailer). `sf-maintain` hat seine Commits bereits pro Gruppe erzeugt. Gibt es nichts zu committen: informieren, leeren Branch entfernen, ohne PR/Merge enden.
2. **Abschluss-Aktion bestimmen:** `worktree.completion` aus der Config; sonst fragen:

```ask
when: kein gültiger Wert für `worktree.completion` gesetzt ist und der Worktree-Modus aktiv war
header: Abschluss
question: Wie soll der Liefer-Branch abgeschlossen werden?
options:
  - label: Pull-Request
    description: Branch pushen und über sf-pr einen PR gegen den Basis-Branch erstellen
  - label: Merge
    description: Branch lokal in den Basis-Branch mergen, ohne PR
  - label: Nur Branch
    description: Branch im lokalen Repo belassen, keine weitere Aktion
```

3. **Worktree zurückziehen:** `git worktree remove <PATH>`; der Branch bleibt im lokalen Repo erhalten.
4. **Aktion ausführen:**
   - `branch`: Branch belassen, Name und Hinweis zur späteren PR-Erstellung melden.
   - `merge`: Ziel-Branch ist der lokale Branch-Anteil von `baseBranch` (bei `origin/main` der lokale `main`). Ziel-Working-Tree muss sauber sein, sonst informieren statt zu mergen. Fast-Forward bevorzugen, sonst Merge-Commit; bei Konflikt stoppen, Branch belassen und User informieren.
   - `pr`: an `{{SKILL:sf-pr}}` delegieren mit Liefer-Branch und Basis-Branch.

### sf-pr (neuer Skill)

- **Eingaben:** Head-Branch (Default: aktueller Branch), Basis-Branch (Default: Branch-Anteil aus `worktree.baseBranch`, sonst `main`), optional Titel/Body.
- **Host-Erkennung:** `origin`-URL auswerten. `github.com` → `gh`; sonst Forgejo → `tea`. Bei mehrdeutigen Hosts (z. B. self-hosted) optional über einen Per-Run-Hinweis übersteuerbar.
- **Vorbedingungen:** Liefer-Branch existiert; `origin` vorhanden; das jeweilige CLI installiert und authentifiziert. Fehlt das CLI oder die Authentifizierung, klare Fehlermeldung mit Behebungshinweis und Abbruch ohne Seiteneffekt.
- **Push:** Branch nach `origin` pushen (`git push -u origin <branch>`), falls noch nicht vorhanden. Bei abgelehntem Push informieren.
- **Titel/Body:** aus den Commits des Branches ableiten (Conventional-Commit-Stil), Plan-Datei referenzieren, falls vorhanden. Keine internen Finding-IDs, keine `Co-Authored-By`-Trailer.
- **PR-Erstellung:** GitHub via `gh pr create --base <base> --head <branch> --title … --body …`; Forgejo via `tea pr create` mit den entsprechenden Base/Head/Title/Description-Optionen. Die exakten `tea`-Flagnamen sind bei der Umsetzung gegen die installierte `tea`-Version zu verifizieren.
- **Ausgabe:** PR-URL und Branch-Name melden.

### Edge Cases

- **Kein `origin` / Basis-Ref nicht auflösbar:** Feature kann nicht greifen. User informieren und fragen, ob In-Place fortgefahren oder abgebrochen werden soll. Nicht still auf einen falschen Branch wechseln.
- **Branch-Namenskollision:** numerisches Suffix anhängen, gewählten Namen melden.
- **Nichts zu committen:** keinen leeren PR/Branch erzeugen; melden und sauber beenden.
- **`merge` mit dirty Ziel-Working-Tree:** nicht mergen, informieren; Branch belassen.
- **Merge-Konflikt beim Handback:** stoppen, Branch und Konfliktzustand melden, keine automatische Auflösung.
- **`git worktree remove` schlägt fehl (uncommittete Reste):** zuerst sicherstellen, dass alles committet ist; verbleibt etwas, Worktree behalten und Pfad melden.
- **CLI fehlt/nicht authentifiziert (`gh`/`tea`):** klare Meldung, kein Teil-Zustand; Branch bleibt für späteren manuellen PR erhalten.
- **Feature deaktiviert:** alle fünf Skills verhalten sich exakt wie heute (Regressionsfreiheit ist Akzeptanzkriterium).

## Akzeptanzkriterien

- [ ] `skills/_shared/worktree-integration.md` existiert und dokumentiert Config-Schema, Migration, Opt-in/Override, Setup, Handback und die drei Abschluss-Aktionen.
- [ ] Bei `worktree.enabled: false` und ohne Per-Run-Override verhalten sich `sf-build`, `sf-fix`, `sf-refactor`, `sf-docs`, `sf-maintain` unverändert (keine Worktree-Erzeugung, keine erzwungenen Commits).
- [ ] Bei aktivem Modus erzeugt der Skill einen Worktree auf `worktree.baseBranch` (Default `origin/main`), arbeitet dort und committet das Ergebnis.
- [ ] Nach Abschluss ist das Worktree-Verzeichnis entfernt und der Liefer-Branch im lokalen Repo vorhanden.
- [ ] `worktree.completion` steuert die Abschluss-Aktion; ohne gültigen Wert wird gefragt; `pr`, `merge`, `branch` funktionieren wie beschrieben.
- [ ] `sf-pr` erstellt für ein GitHub-`origin` per `gh` und für ein Forgejo-`origin` per `tea` einen PR und meldet die PR-URL; fehlende/nicht authentifizierte CLIs führen zu einer klaren Fehlermeldung ohne Seiteneffekt.
- [ ] `worktree.baseBranch` ist konfigurierbar und wird als Basis-Ref und (Branch-Anteil) als PR-/Merge-Ziel verwendet.
- [ ] `build.mjs` erzeugt Artefakte für `sf-pr`; die Marketplace-Beschreibung nennt `pr`.
- [ ] Die Config-Migration ergänzt den `worktree`-Block nicht-destruktiv und protokolliert ihn unter `configMigration`.

## Validierungsplan

- `node build.mjs` ausführen und prüfen, dass `sf-pr` als Codex-Skill und Claude-Command erzeugt wird und das neue Include in allen fünf Skills korrekt aufgelöst ist (keine unaufgelösten ` ```include `-Blöcke, `{{SKILL:sf-pr}}` korrekt transformiert).
- Manuelle Durchsicht der fünf generierten Skill-Artefakte: Setup- und Abschluss-Schritte vorhanden, Reihenfolge gegenüber Goal-Completion stimmig.
- Trockenlauf-Review des Config-Schemas gegen das bestehende Migrationsmuster (`sf-apply-review`, `sf-review`) auf Konsistenz.
- Markdown-Formatter (oxfmt) nur auf die neuen/geänderten Dateien anwenden, falls konfiguriert.
- Verifikation der `tea`-Flagnamen gegen die tatsächlich installierte `tea`-Version während der Umsetzung.

## Annahmen und offene Punkte

- **Annahme:** Neuer Skill heißt `sf-pr` (Claude-Command `/pr`, Codex `$pr`). Falls `/pr` mit einem bestehenden Befehl kollidiert, bei der Umsetzung umbenennen.
- **Annahme:** Config-Namespace ist der Top-Level-Block `worktree`, getrennt von `applyReview.worktree`. Beide dürfen denselben physischen `baseDir` nutzen, da Session-/Pfad-Segmente unterscheiden.
- **Annahme:** `sf-apply-review` ist nicht Teil dieses Plans.
- **Offen (Umsetzung):** Exakte `tea`-CLI-Syntax wird gegen die installierte Version verifiziert; ggf. ist ein Per-Run-Host-Override für self-hosted GitHub-Enterprise-Domains nötig.
- **Optional (bewusst zurückgestellt):** Eine Extraktion der reinen Commit-Kernlogik aus `sf-commit` in ein eigenes Shared-Include wäre denkbar, um Duplizierung zu vermeiden. Vorerst wird die `sf-commit`-Logik referenziert/wiederverwendet, ohne `sf-commit` selbst zu ändern – das hält den Scope klein.

## Testergebnisse

**Datum:** 2026-06-29

Dieses Repo enthält kein Unit-Test-Framework; die Umsetzung besteht aus Markdown-Skill-Instruktionen, einem Shared-Include und einer Daten-Änderung an `build.mjs`. Die Validierung erfolgt daher über Build und Formatter:

- `node build.mjs` erfolgreich: 13 Codex-Skills und 13 Claude-Commands (neu: `sf-pr`), 9 Agents. Das Include `worktree-integration` wird in allen fünf Code-ändernden Skills aufgelöst; `{{SKILL:sf-pr}}` wird korrekt zu `/pr` (Claude) bzw. `$sf-pr` (Codex) transformiert; keine unaufgelösten Platzhalter oder Include-Fences im `dist/`.
- `pnpm agent:check` (oxfmt) grün über alle 90 Dateien.

## Review-Findings

**Datum:** 2026-06-29
**Reviewer:** sf-nodejs-reviewer

### Zusammenfassung

| Status                  | Anzahl |
| ----------------------- | -----: |
| Behoben                 |      8 |
| Offen / Nicht umgesetzt |      1 |

Keine kritischen Findings. Drei wichtige Findings (Plan-/State-Trennung Worktree vs. Haupt-Repo, `.sf-plugin/`-State im Haupt-Repo, Merge-Ablauf) und fünf Hinweise wurden direkt eingearbeitet. Der einzige offene Hinweis (GitHub-Enterprise-Host-Erkennung in `sf-pr`) ist bewusst nicht als Heuristik umgesetzt; er ist durch den bereits vorhandenen Per-Run-Host-Override abgedeckt und als offener Punkt unter „Annahmen und offene Punkte“ dokumentiert. Da keine offenen kritischen oder wichtigen Findings verbleiben, wurde kein externer Review-Report ausgelagert.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       1 |
| Security    |        0 |       0 |       1 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       0 |       1 |
| Testbarkeit |        0 |       0 |       0 |
| Scope       |        0 |       1 |       0 |
| Wartbarkeit |        0 |       0 |       1 |

### Befunde

- **Scope (Wichtig):** Die Commit-Pflicht ändert das bisher überwiegend In-Place-und-nicht-committende Verhalten von vier Skills. Eingearbeitet durch klare Bindung an den Opt-in: ohne aktiven Worktree-Modus bleibt das heutige Verhalten unverändert (eigenes Akzeptanzkriterium für Regressionsfreiheit).
- **Architektur (Hinweis):** Zwei getrennte Worktree-Mechanismen (`applyReview.worktree` und `worktree`) existieren parallel. Bewusst akzeptiert, da unterschiedliche Ziele (cherry-pick auf aktuellen Branch vs. eigener Liefer-Branch für PR). In den Skills klar benennen, um Verwechslung zu vermeiden.
- **Security (Hinweis):** PR-Erstellung nutzt vorhandene CLI-Authentifizierung (`gh`/`tea`); es werden keine Tokens in der Config gespeichert. Fehlende Authentifizierung führt zu sauberem Abbruch ohne Seiteneffekt.
- **Fehlerfälle (Hinweis):** Merge-/Worktree-Remove-/Push-Fehler sind als Edge Cases mit „stoppen und informieren, Branch belassen“ abgedeckt; keine automatische Konfliktauflösung.
- **Wartbarkeit (Hinweis):** Das Lebenszyklus-Verhalten liegt in einem einzigen Shared-Include, was Drift zwischen den fünf Skills vermeidet; die optionale Commit-Kern-Extraktion ist als zurückgestellter Punkt dokumentiert.
