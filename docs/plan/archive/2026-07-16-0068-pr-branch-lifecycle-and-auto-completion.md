# 0068: PR-Branch-Lifecycle und automatische Abschlussaktionen

**Planungsstatus:** Umgesetzt
**Quelle:** $firmo plan
**Empfohlener Workflow:** Feature (`$firmo build`)

## Anforderung

`$firmo pr` soll nicht mehr nur aus einem bereits vorhandenen lokalen Branch einen
Pull-Request erstellen können. Der PR-Workflow soll optional den kompletten
Branch-Lifecycle übernehmen: frischen Liefer-Branch aus einem konfigurierbaren
Basis-Ref erzeugen, Änderungen dort aufnehmen, Pull-Request erstellen und danach
den lokalen Checkout wieder in einen sauberen Zielzustand bringen.

Gleichzeitig soll die heutige Bindung zentraler Werte an den `worktree`-Block
aufgelöst werden. Werte wie Basis-Branch, Branch-Präfix und Abschluss-Aktion
gelten nicht nur für Worktrees, sondern allgemein für Liefer-Branches und PRs.
Außerdem sollen code-ändernde Workflows, die in-place arbeiten, nach erfolgreicher
Umsetzung je nach Konfiguration ebenfalls automatisch committen und einen PR,
Merge oder belassenen Branch erzeugen können. Das betrifft insbesondere
`{{SKILL:build}}`, `{{SKILL:fix}}`, `{{SKILL:refactor}}`, `{{SKILL:docs}}`,
`{{SKILL:maintain}}`, `{{SKILL:apply-review}}` im Remote-Modus und
`{{SKILL:apply-issues}}`.

Begründung der Workflow-Empfehlung: Es entsteht neues Nutzerverhalten über mehrere
Skills hinweg, inklusive neuer Config-Semantik, Migration und verändertem
Abschluss-Lifecycle. Das ist eine Feature-Erweiterung und soll über
`$firmo build` umgesetzt werden.

## Architekturentscheidungen

- **Neuer Top-Level-Config-Block `delivery`:** Gemeinsame Liefer-Branch- und
  Abschlusswerte werden aus `worktree.*` in `delivery.*` generalisiert. Der
  Worktree-Block bleibt für echte Worktree-spezifische Werte zuständig.
- **Nicht-destruktive Migration:** Bestehende Werte aus `worktree.baseBranch`,
  `worktree.branchPrefix` und `worktree.completion` werden nach `delivery.*`
  übernommen, ohne alte Schlüssel sofort zu löschen. Alte Schlüssel bleiben für
  eine Übergangsphase als Fallback lesbar.
- **Worktree bleibt Ausführungsmodus, Delivery ist Abschlussmodus:** `worktree.enabled`,
  `worktree.setup` und `worktree.baseDir` steuern weiterhin nur, ob und wie in
  einem Worktree gearbeitet wird. `delivery.completion` steuert unabhängig davon,
  ob ein fertiger Liefer-Branch als PR, Merge oder nur Branch abgeschlossen wird.
- **`$firmo pr` bekommt zwei Modi:** Der bestehende Modus „bestehenden Head-Branch
  veröffentlichen“ bleibt erhalten. Neu ist ein Lifecycle-Modus, der einen Branch
  frisch aus `delivery.baseBranch` erzeugt und nach PR-Erstellung auf den lokalen
  Zielbranch zurückwechselt.
- **In-place Workflows erzeugen bei Bedarf einen Liefer-Branch:** Wenn kein
  Worktree aktiv ist, aber `delivery.completion` eine Abschluss-Aktion verlangt
  oder der User ausdrücklich einen PR wünscht, wird vor der Umsetzung ein
  Liefer-Branch aus dem Basis-Ref erzeugt und ausgecheckt. Dadurch entstehen
  PRs nicht mehr aus einem beliebigen aktuellen Branch.
- **Teil-Diff-PRs bevorzugt über Worktree isolieren:** Wenn der aktuelle
  Haupt-Checkout zusätzliche Änderungen enthält, die nicht in den PR sollen
  (z. B. neu reservierte Plan-Dateien oder lokale Koordinationsdateien), und einer
  Worktree-Erzeugung nichts im Weg steht, darf der PR-Lifecycle einen frischen
  Worktree aus `delivery.baseBranch` erzeugen und nur die explizit ausgewählten
  Lieferdateien dorthin übernehmen. So kann im Haupt-Checkout parallel weiter
  geplant werden, ohne die PR-Erzeugung oder den PR-Diff zu verunreinigen.
- **Keine stillen Branch-Wechsel bei lokaler Arbeit:** Enthält der aktuelle
  Arbeitsbaum uncommittete Änderungen oder lokale Commits, die nicht im Basis-Ref
  enthalten sind, muss der Workflow den Zustand melden und eine Entscheidung
  verlangen. Der Branch-Lifecycle darf solche Arbeit nicht still ausblenden oder
  überschreiben.
- **PR-Erstellung bleibt ohne Projektvalidation:** `$firmo pr` validiert nicht
  selbst. Build-, Test- und Lint-Prüfungen bleiben Aufgabe der aufrufenden
  Umsetzungs-Workflows vor dem Abschluss.
- **Apply-Remote-Flows nutzen dieselbe Delivery-Config:** `apply-review` remote
  und `apply-issues` behalten „ein PR pro Finding/Issue“, lesen Basis-Branch und
  Branch-Präfix künftig aber aus `delivery.*` statt aus `worktree.*`.

## Betroffene Dateien

| Datei                                | Beschreibung                                                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/worktree-integration.md` | Umbau zum allgemeinen Delivery-/Worktree-Lifecycle: `delivery.*` einführen, Worktree-spezifische und allgemeine Abschlusslogik trennen, In-place-Liefer-Branch-Modus ergänzen.              |
| `src/tools/pr.md`                    | Lifecycle-Modus ergänzen: frischen Branch aus Basis-Ref erzeugen, vorhandene Änderungen aufnehmen bzw. bestehenden Head-Branch veröffentlichen, PR erstellen, danach sauber zurückwechseln. |
| `src/tools/setup.md`                 | Config-Schema und Fragen von `worktree.baseBranch`/`worktree.completion` auf `delivery.baseBranch`/`delivery.completion` umstellen; Worktree-Frage auf echten Worktree-Modus reduzieren.    |
| `src/tools/build.md`                 | Abschlussphase so anpassen, dass Delivery-Abschluss auch ohne aktiven Worktree möglich ist; Zusammenfassung um Delivery-Ergebnis erweitern.                                                 |
| `src/tools/fix.md`                   | Analog zu `build`: In-place-Liefer-Branch und automatische Abschlussaktion unterstützen.                                                                                                    |
| `src/tools/refactor.md`              | Analog zu `build`: In-place-Liefer-Branch und automatische Abschlussaktion unterstützen.                                                                                                    |
| `src/tools/docs.md`                  | Analog zu `build`: In-place-Liefer-Branch und automatische Abschlussaktion unterstützen.                                                                                                    |
| `src/tools/maintain.md`              | Abschlusslogik auf `delivery.*` umstellen; vorhandene Gruppen-Commits weiterhin respektieren.                                                                                               |
| `src/tools/apply-review-remote.md`   | Basis-Branch und Branch-Namensbildung von `worktree.*` auf `delivery.*` umstellen.                                                                                                          |
| `src/tools/apply-issues.md`          | „Ein PR pro Issue“ auf `delivery.*` umstellen und die Delegation an `{{SKILL:pr}}` mit dem neuen Lifecycle-Kontext präzisieren.                                                             |
| `src/shared/issue-tracker.md`        | Nur falls nötig: Verweise auf PR-Erstellung sprachlich an die neue Delivery-Terminologie anpassen.                                                                                          |

## Implementierungsdetails

### Vorgehen

1. `delivery`-Config-Schema in `src/shared/worktree-integration.md` einführen:
   `enabled`, `baseBranch`, `branchPrefix`, `completion` und optional
   `returnBranch`. Defaults: `enabled: false`, `baseBranch: origin/main`,
   `branchPrefix: firmo`, `completion: null`, `returnBranch: auto`.
2. `worktree`-Config auf Worktree-spezifische Werte reduzieren:
   `enabled`, `setup`, `baseDir`. Alte allgemeine Schlüssel in `worktree.*`
   bleiben als Legacy-Fallback lesbar.
3. Config-Migration ergänzen: fehlende `delivery.*`-Werte nicht-destruktiv aus
   vorhandenen `worktree.*`-Werten ableiten, sonst Defaults verwenden. Migration
   unter `configMigration.delivery` protokollieren und bestehende
   `configMigration.worktree`-Einträge erhalten.
4. Den gemeinsamen Lifecycle in zwei Phasen beschreiben:
   - **Setup:** Entweder Worktree-Branch aus `delivery.baseBranch` erzeugen oder,
     bei in-place Delivery, im Haupt-Repo einen Liefer-Branch aus
     `delivery.baseBranch` erzeugen und auschecken.
   - **Handback:** Änderungen committen, optional Plan-Datei übernehmen,
     Abschluss-Aktion aus `delivery.completion` ausführen und anschließend auf den
     Zielbranch zurückwechseln.
5. `$firmo pr` um einen expliziten Lifecycle-Modus erweitern. Eingaben:
   `headBranch` für bestehenden Branch oder `createBranchFromBase` mit Slug und
   optionaler Aufgabenbeschreibung. Ohne Lifecycle-Hinweis bleibt der heutige
   kompatible Modus erhalten.
6. `$firmo pr` verwendet künftig `delivery.baseBranch` als Default-Basis. Die
   PR-Basis ist der Branch-Anteil des Basis-Refs, also bei `origin/main` der Wert
   `main`.
7. In den code-ändernden Workflows die Abschlussbedingung erweitern: Wenn Delivery
   aktiv ist oder der User ausdrücklich PR/Branch/Merge verlangt, muss vor der
   Implementierung ein Liefer-Branch vorbereitet und nach erfolgreicher
   Validierung abgeschlossen werden, auch wenn `worktree.enabled` false ist.
8. Teil-Diff-PRs ergänzen: Wenn bereits Änderungen im Haupt-Checkout existieren,
   die nicht vollständig in den PR sollen, und `git worktree` verfügbar ist, kann
   der Workflow einen frischen Delivery-Worktree erzeugen und nur die bekannten
   Deliverable-Dateien in diesen Worktree übernehmen. Die Auswahl muss aus dem
   Workflow-Kontext stammen (Plan-Datei, Review-Finding, Issue-Scope oder explizite
   User-Auswahl), nicht aus einem pauschalen `git add`.
9. Remote-Apply-Flows auf `delivery.*` umstellen: `apply-review-remote.md` und
   `apply-issues.md` verwenden `delivery.baseBranch` und `delivery.branchPrefix`
   für Branches und PRs.
10. `setup` so ändern, dass es Worktree-Ausführung und Delivery-Abschluss getrennt
    abfragt: „in Worktree arbeiten?“ und „Änderungen automatisch als PR/Merge/Branch
    abschließen?“.
11. Build- und Formatprüfungen ausführen und generierte Artefakte auf aufgelöste
    Includes/Platzhalter prüfen.

### Config-Modell

Geplanter Zielzustand:

- `delivery.enabled`: aktiviert automatische Liefer-Branch- und Abschlusslogik auch
  ohne Worktree.
- `delivery.baseBranch`: Basis-Ref für neue Liefer-Branches und PR-Ziel-Default.
- `delivery.branchPrefix`: Präfix für automatisch erzeugte Liefer-Branches.
- `delivery.completion`: `pr`, `merge`, `branch` oder `null` für Nachfrage.
- `delivery.returnBranch`: `auto` oder expliziter lokaler Branchname; bei `auto`
  wird aus `delivery.baseBranch` der lokale Branch-Anteil abgeleitet.
- `worktree.enabled`: führt Umsetzung in einem Git-Worktree aus.
- `worktree.setup`: Setup-Kommando im Worktree.
- `worktree.baseDir`: Basisverzeichnis für Worktrees.

Legacy-Leseordnung:

1. Neuer Wert aus `delivery.*`.
2. Alter Wert aus `worktree.baseBranch`, `worktree.branchPrefix` oder
   `worktree.completion`.
3. Default.

### Branch-Lifecycle ohne Worktree

Wenn Delivery aktiv ist und Worktree inaktiv bleibt:

1. Basis-Ref auflösen. Remote-Refs wie `origin/main` vorab per
   `git fetch REMOTE BRANCH` aktualisieren.
2. Aktuellen Branch und Arbeitsbaumzustand erfassen.
3. Bei uncommitteten Änderungen oder lokalen Commits außerhalb des Basis-Refs den
   User informieren und nicht automatisch fortfahren.
4. Liefer-Branch `<delivery.branchPrefix>/<skill>/<slug>` aus dem Basis-Ref
   erzeugen und auschecken. Bei Namenskollision ein numerisches Suffix anhängen.
5. Umsetzung, Tests, Validierung und finale Formatierung auf diesem Liefer-Branch
   ausführen.
6. Geänderte Dateien explizit stagen und über die bestehende Commit-Logik
   committen. Wenn nichts zu committen ist, keinen leeren PR erzeugen.
7. Abschluss-Aktion aus `delivery.completion` ausführen oder fragen:
   - `pr`: `$firmo pr` mit Head-Branch, Basis-Branch und optionalem Body-Kontext.
   - `merge`: in lokalen Zielbranch wechseln und Liefer-Branch mergen.
   - `branch`: Branch belassen und Namen melden.
8. Nach erfolgreicher PR-Erstellung oder bei `branch` auf `delivery.returnBranch`
   bzw. den abgeleiteten lokalen Zielbranch zurückwechseln, sofern der Arbeitsbaum
   sauber ist. Bei Konflikt oder dirty State den tatsächlichen Checkout-Zustand
   melden.

### Teil-Diff-PR über Worktree

Wenn im Haupt-Checkout bereits Änderungen liegen, die nicht vollständig in den PR
gehören, ist ein separater Worktree der bevorzugte sichere Weg, sofern diese
Vorbedingungen erfüllt sind:

1. `git worktree` ist verfügbar.
2. `delivery.baseBranch` ist auflösbar und bei Remote-Refs aktualisierbar.
3. Der Workflow kennt eine explizite Liste der Dateien, die in den PR sollen.

Der Ablauf:

1. Frischen Worktree-Branch aus `delivery.baseBranch` erzeugen.
2. Nur die ausgewählten Lieferdateien aus dem Haupt-Checkout in den Worktree
   übernehmen. Beispiele für zulässige Quellen sind Plan-Betroffene-Dateien,
   Review-Finding-Scope, Issue-Scope, vom Workflow erzeugte bekannte Dateien oder
   eine explizite User-Auswahl.
3. Im Worktree prüfen, ob die übernommenen Dateien gegenüber dem Basis-Ref einen
   sinnvollen Diff ergeben. Wenn nicht, abbrechen und keinen leeren PR erzeugen.
4. Im Worktree committen und `$firmo pr` gegen `delivery.baseBranch` ausführen.
5. Worktree entfernen, Liefer-Branch lokal belassen und Haupt-Checkout unverändert
   lassen. Nicht ausgewählte Änderungen im Haupt-Checkout bleiben unberührt.

Nicht erlaubt ist eine heuristische Teil-Diff-Auswahl nach „alle geänderten
Dateien außer docs/plan“. Der Workflow muss die einzuschließenden Dateien kennen
oder nachfragen. Dadurch bleiben parallel neu angelegte Pläne, `.firmo/`-State und
andere lokale Arbeitsdateien zuverlässig außerhalb des PRs.

### `$firmo pr` Lifecycle-Modus

Der neue Modus soll folgende Fälle abdecken:

- **Bestehender Branch:** Heutiges Verhalten bleibt: Branch pushen, PR erstellen,
  URL melden.
- **Frischer Branch aus Basis:** `$firmo pr` erzeugt einen neuen Branch aus
  `delivery.baseBranch`, übernimmt die freigegebenen Änderungen durch den
  aufrufenden Workflow bzw. arbeitet auf dem bereits vorbereiteten Liefer-Branch,
  erstellt den PR und wechselt danach zurück.
- **Cleanup:** Nach erfolgreichem PR bleibt der Liefer-Branch lokal erhalten, weil
  er den PR-Head darstellt. Entfernt wird nur ein temporärer Worktree, falls einer
  beteiligt ist. Der lokale Checkout wird auf den Zielbranch zurückgestellt.

`$firmo pr` darf keine Tests oder Builds starten und keine Änderungen erfinden. Es
soll fehlende Commits, leere Branches, fehlendes `origin`, fehlende Authentifizierung
oder divergierte Remote-History sauber melden und ohne destructive Aktion stoppen.

### Edge Cases

- **Worktree- und Delivery-Config widersprechen sich:** Worktree kann aus sein,
  während Delivery aktiv ist. Das ist ein gültiger in-place Branch-Lifecycle.
- **Legacy-Config enthält nur `worktree.baseBranch`:** Migration übernimmt den Wert
  nach `delivery.baseBranch`; alte Config bleibt lesbar.
- **Aktueller Branch ist bereits der Liefer-Branch:** Kein neuer Branch erzeugen,
  sondern den vorhandenen Branch validieren und als Head verwenden.
- **Dirty Working Tree vor Branch-Erzeugung:** Nicht stagen, stashen oder
  überschreiben; Entscheidung vom User verlangen.
- **Teil-Diff-PR mit unklarem Datei-Scope:** Nicht raten. Entweder User nach den
  einzuschließenden Dateien fragen oder den bestehenden Branch-/In-place-Pfad
  verwenden.
- **Leerer Diff nach Umsetzung:** Kein PR, kein Merge; leeren Liefer-Branch
  entfernen, wenn er automatisch erzeugt wurde und keine Commits enthält.
- **PR-Erstellung schlägt nach Push fehl:** Branch bleibt lokal und remote
  erhalten; Issue-/Epic-Status wird nicht als erledigt markiert.
- **Rückwechsel auf Zielbranch scheitert:** Tatsächlichen Branch melden und keine
  weiteren Git-Aktionen versuchen.
- **Self-hosted GitHub:** Bestehender `tracker.remoteToolOverride` bzw.
  Per-Run-Hinweis bleibt relevant; keine neuen Secrets in Config speichern.

## Akzeptanzkriterien

- [ ] `src/shared/worktree-integration.md` beschreibt `delivery.*` als allgemeine
      Branch-/Completion-Config und `worktree.*` nur noch für Worktree-Ausführung.
- [ ] Bestehende Configs mit `worktree.baseBranch`, `worktree.branchPrefix` und
      `worktree.completion` werden nicht-destruktiv nach `delivery.*` migriert und
      bleiben als Legacy-Fallback lesbar.
- [ ] `$firmo pr` kann weiterhin einen bestehenden lokalen Branch als PR öffnen und
      zusätzlich einen Lifecycle-Modus mit frischem Branch aus `delivery.baseBranch`
      und anschließendem Rückwechsel ausführen.
- [ ] `build`, `fix`, `refactor`, `docs` und `maintain` können bei aktivem
      `delivery.enabled` oder ausdrücklichem PR-Wunsch auch ohne Worktree einen
      Liefer-Branch aus dem Basis-Ref erzeugen, validieren, committen und gemäß
      `delivery.completion` abschließen.
- [ ] Worktree-basierte Workflows nutzen weiterhin Worktrees, lesen Basis-Branch,
      Branch-Präfix und Abschluss-Aktion aber aus `delivery.*`.
- [ ] Wenn ein PR nur aus einem bekannten Teil der lokalen Änderungen bestehen
      soll, kann der Workflow einen frischen Worktree aus `delivery.baseBranch`
      erzeugen, ausschließlich die ausgewählten Dateien übernehmen und den
      Haupt-Checkout unverändert lassen.
- [ ] `apply-review` im Remote-Modus und `apply-issues` verwenden `delivery.*` für
      Basis-Branch, Branch-Namen und PR-Ziel und behalten „ein PR pro
      Finding/Issue“ bei.
- [ ] `setup` fragt Worktree-Ausführung und automatische Delivery-Abschlussaktion
      getrennt ab und schreibt die neue Config nicht-destruktiv.
- [ ] Bei `delivery.enabled: false`, `worktree.enabled: false` und ohne
      ausdrücklichen PR-/Branch-Wunsch bleibt das bisherige In-place-Verhalten ohne
      automatische Commits oder PRs erhalten.
- [ ] `node build.mjs` und `pnpm agent:check` laufen nach Umsetzung erfolgreich.

## Validierungsplan

- `node build.mjs` ausführen und prüfen, dass alle Includes und
  `{{SKILL:...}}`-Platzhalter in `dist/` aufgelöst sind.
- `pnpm agent:check` ausführen.
- Generierte Codex- und Claude-Ausgaben von `pr`, `setup`, `build`, `fix`,
  `refactor`, `docs`, `maintain`, `apply-review-remote` und `apply-issues`
  stichprobenhaft prüfen.
- Manuelle Szenario-Prüfung im Skill-Text:
  - bestehender Branch → `$firmo pr` erstellt PR wie bisher,
  - Worktree aktiv → Branch aus `delivery.baseBranch`, Worktree entfernen, PR/Merge/Branch,
  - Worktree aus + Delivery aktiv → in-place Liefer-Branch aus `delivery.baseBranch`,
    PR-Erstellung und Rückwechsel,
  - Teil-Diff-PR → nur ausgewählte Dateien im Worktree-Branch, parallel im
    Haupt-Checkout liegende Plan-Dateien bleiben außerhalb des PRs,
  - Delivery aus → unverändertes Verhalten.
- Config-Migrationspfad gegen eine Config mit altem `worktree.baseBranch` und ohne
  `delivery` prüfen.

## Annahmen und offene Punkte

- Annahme: Der neue Config-Block heißt `delivery`, weil er Branch-, PR- und
  Abschlussverhalten beschreibt, ohne Worktree-Ausführung vorauszusetzen.
- Annahme: `delivery.enabled` ist erforderlich, damit automatische Commits/PRs ohne
  Worktree weiterhin opt-in bleiben und bestehende Workflows nicht überraschend
  Branches erzeugen.
- Annahme: Automatisch erzeugte PR-Branches bleiben lokal erhalten; „Cleanup“ meint
  Worktree entfernen und Checkout zurückstellen, nicht den PR-Head-Branch löschen.
- Annahme: Für `merge` wird der lokale Branch-Anteil aus `delivery.baseBranch`
  verwendet, bei `origin/main` also `main`.
- Annahme: Teil-Diff-PRs sind nur sicher, wenn der Workflow den Dateiscope kennt
  oder der User ihn explizit bestätigt; pauschale Ausschlussheuristiken sind nicht
  ausreichend.
- Umsetzung: Aufrufende Workflows delegieren den vorbereiteten Liefer-Branch und
  Basis-Branch explizit an `$firmo pr`; `$firmo pr` unterscheidet Bestandsmodus und
  Lifecycle-Modus im eigenen Vorgehen.

## Testergebnisse

**Datum:** 2026-07-09

- `node build.mjs`: erfolgreich. Der Build erzeugt die Claude- und Codex-Artefakte
  mit aufgelösten Includes und Platzhaltern.
- `pnpm agent:check`: erfolgreich. Alle Markdown- und JS-Dateien entsprechen dem
  konfigurierten oxfmt-Format.
- Manuelle Diff-Prüfung: `delivery.*` ist als allgemeine Branch-/Completion-Config
  beschrieben, `worktree.*` bleibt auf Worktree-Ausführung beschränkt, und die
  Remote-Apply-Flows verwenden für Basis-Branch und Branch-Präfix die neue
  Delivery-Terminologie mit Legacy-Fallback.

## Review-Findings

**Datum:** 2026-07-09
**Reviewer:** keiner (Änderung betrifft Skill-Anweisungen in Markdown; Build- und
Format-Checks sind die maßgeblichen Projektprüfungen)

Keine Findings gefunden.

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
| Scope       |        0 |       0 |       1 |
| Wartbarkeit |        0 |       0 |       1 |

### Befunde

- **Architektur (Hinweis):** `delivery` und `worktree` erzeugen eine zusätzliche
  Konzeptebene. Der Plan begrenzt das Risiko, indem `worktree` nur noch
  Ausführungsmodus und `delivery` nur noch Liefer-/Abschlussmodus ist.
- **Security (Hinweis):** PR-Erstellung nutzt vorhandene CLI-Authentifizierung über
  `gh`/`tea`; es werden keine Tokens oder Credentials in `.firmo/config.json`
  gespeichert.
- **Fehlerfälle (Hinweis):** Dirty Worktrees, leere Diffs, fehlende Auth, Push-/PR-
  Fehler und fehlschlagender Rückwechsel sind explizit als Stop-and-report-Pfade
  geplant.
- **Scope (Hinweis):** Der Plan ändert mehrere Workflow-Texte, bleibt aber auf
  Branch-/PR-Lifecycle und Config-Migration begrenzt. Keine neue Tracker- oder
  Review-Funktionalität ist enthalten.
- **Wartbarkeit (Hinweis):** Die gemeinsame Logik sollte möglichst im Shared-Baustein
  bleiben; Tool-Dateien sollen nur Phasen-Hooks und workflow-spezifische
  Zusammenfassungen enthalten.

## Offene Punkte

- Keine offenen Punkte.
