# iterate-Tool: Review-Anmerkungen und Instruktionen zurück in eine Änderung führen

**Planungsstatus:** Umgesetzt
**Quelle:** /firmo plan
**Empfohlener Workflow:** Feature (`/firmo build`)

## Anforderung

Neben den bestehenden umsetzenden Tools (`build`, `fix`, `refactor`, `docs`) fehlt ein Tool, das eine **bereits gelieferte Änderung weiter verändert**, statt bei null zu starten. Typischer Anlass: `/firmo build` (oder ein anderer Workflow) ist gelaufen und hat einen Pull-Request erstellt; anschließend hinterlässt ein Review-Bot wie **Greptile** (oder ein menschlicher Reviewer) Anmerkungen am PR, die wieder in den PR einfließen sollen. Das ist ein „Mini-Build" auf einer bestehenden Änderung: kleiner Zyklus aus Kontext-Einlesen, Umsetzung, Validierung und Rücklieferung als **neue Commits auf demselben PR-Branch**.

Das neue Tool heißt `iterate` und wird über `/firmo iterate` aufgerufen. Es deckt zwei Ziel-Modi ab:

1. **PR-Modus** — primärer Fall: ein bestehender PR (per Argument `#42` / URL oder aus dem aktuell ausgecheckten Branch aufgelöst). Quelle der umzusetzenden Punkte sind die **PR-Review-Kommentare aller Reviewer** (Bots wie Greptile **und** Menschen) sowie optional zusätzliche **Freitext-Instruktionen**, die der User dem Tool mitgibt.
2. **Local-Modus** — kein PR vorhanden/gemeint: das Tool iteriert auf der **letzten Codeänderung im Repo** (aktueller Liefer-Branch bzw. jüngster Commit) ausschließlich anhand der **Freitext-Instruktionen** des Users, da es dann keine PR-Kommentare zu lesen gibt.

**Begründung der Workflow-Empfehlung (Feature):** `iterate` ist neue Funktionalität — ein neues, exponiertes `/firmo`-Tool mit eigener Quelldatei, Router-Registrierung und einem neuen geteilten Baustein. Es ändert Produktverhalten (neuer Einstiegspunkt), ist kein reiner Bugfix und keine reine Umstrukturierung. Umgesetzt wird es über `/firmo build`.

### Abgrenzung zu bestehenden Tools (wichtig — kein Duplikat)

Die Codebase hat bereits `apply-review`, aber **keine** Ingestion von PR-Review-Kommentaren:

| Bestehendes                   | Quelle                               | Warum es die Anforderung nicht abdeckt                                                                                                                                                                                                                                           |
| ----------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apply-review` (lokal)        | Report-Datei unter `.firmo/review/`  | Liest Firmos eigene Markdown-Reports, nicht die am PR hinterlassenen Kommentare.                                                                                                                                                                                                 |
| `apply-review` (remote)       | Issue-Tracker (Epic-/Finding-Issues) | Liest **Issues**; die vorhandene „Kommentare lesen"-Operation (`gh issue view --json comments`) betrifft Issues, nicht PR-Review-Threads. Der „Ziel-PR"-Zweig fügt zwar Commits an einen bestehenden PR an, wird aber durch Finding-Issues getrieben, nicht durch PR-Kommentare. |
| `apply-issues` / `plan-issue` | beliebige Issues                     | Issue-zentriert, kein PR-Review-Kontext.                                                                                                                                                                                                                                         |

`iterate` schließt genau diese Lücke: **PR-Review-Kommentare (Threads) → neue Commits auf dem PR-Branch**, plus ein direkter Freitext-Kanal und ein Local-Fallback auf die letzte Änderung.

## Architekturentscheidungen

- **Neues, exponiertes Tool `src/tools/iterate.md`.** Der User hat es ausdrücklich als eigenes Tool gewünscht („es sollte … auch ein tool geben"). Registrierung in `build.mjs` in der Intent-Gruppe **„Eine Änderung umsetzen"** (`TOOL_GROUPS`), neben `apply`, `build`, `fix`, `refactor`, `docs`, `maintain`. Position: nach `apply`/`build`/`fix`/`refactor`/`docs`/`maintain`, konkret als letztes Element der Gruppe (es setzt eine schon existierende Änderung fort). Eigenes `catalogHint` (Pflicht, streng doppelt-gequotet).
- **`iterate` ist ein Orchestrator, kein neuer Implementer.** Wie `build` und `apply-review` klassifiziert es jeden umzusetzenden Punkt und delegiert an die bestehenden Umsetzer `{{SKILL:fix}}`, `{{SKILL:refactor}}`, `{{SKILL:build}}` bzw. `{{SKILL:docs}}` (bei Sub-Agent-Bedarf an die Implementer-/Reviewer-Agents). Es führt keine eigene Sprach-Implementierungslogik ein.
- **Zwei Ziel-Modi in einem Tool** (PR-Modus / Local-Modus), bestimmt in einer frühen Ziel-Erkennungs-Phase; der Argumenttyp (PR-Referenz vorhanden?) und ein Per-Run-Wunsch des Users entscheiden, analog zur Modusbestimmung in `issue-tracker.md`.
- **Eingabe-Modell:** `/firmo iterate [<PR-Ref>] [<Freitext-Instruktionen>]`. Eine führende PR-Referenz (`#42`, bare Nummer, PR-URL) ist optional; der Rest ist Freitext. Ohne PR-Referenz versucht das Tool, aus dem aktuellen Branch einen offenen PR aufzulösen; gelingt das nicht, greift der Local-Modus. Die PR-Referenz muss klar von einer Issue-Referenz getrennt bleiben (PR-URL-Segment `/pull/` bzw. `/pulls/` statt `/issues/`); bei bloßer Nummer entscheidet der Kontext (aktueller Branch-PR) bzw. eine Rückfrage.
- **Neuer geteilter Baustein `src/shared/pr-review-comments.md`.** Er kapselt das PR-spezifische Plumbing, das `issue-tracker.md` nicht enthält: PR-Auflösung, Lesen von Review-Threads (inline Review-Kommentare + zugehörige Konversationen), Antworten auf einen Thread, Auflösen eines Threads und Posten eines PR-Summary-Kommentars — je gemappt auf GitHub (`gh` / `gh api` / GraphQL) und Forgejo (`tea` / Forgejo-API). Die **Host- und CLI-Erkennung sowie die Verfügbarkeits-/Auth-Prüfung** werden aus `issue-tracker.md` wiederverwendet (nicht neu erfunden); nur die PR-Operationen kommen hinzu. Grund für einen eigenen Baustein statt Erweiterung von `issue-tracker.md`: Letzterer ist bewusst auf **Issues** und den `tracker.mode`-Umschalter zugeschnitten; PR-Review-Threads sind ein anderes API-Objekt und `iterate` ist — wie `apply-issues`/`plan-issue` — inhärent remote und wertet `tracker.mode` nicht aus.
- **Keine History-Umschreibung.** Änderungen gehen ausschließlich als **neue Commits** auf den PR-Head-Branch und werden normal gepusht — konsistent mit `pr.md` und „Bestehende PRs aktualisieren" in `worktree-integration.md`. Kein `commit --amend`, kein Rebase/Squash, kein Force-Push. Wird der Push wegen divergierter Remote-History abgelehnt, stoppt das Tool und meldet den Konflikt.
- **Host-Abdeckung GitHub + Forgejo**, konsistent mit `pr.md`. GitHub-Thread-Auflösung erfordert die GraphQL-Mutation `resolveReviewThread` (Thread-IDs aus `pullRequest.reviewThreads`); Forgejo/Gitea löst Konversationen best-effort auf (falls die installierte API/`tea`-Version es nicht unterstützt, wird nur geantwortet und das im Summary vermerkt — kein Abbruch).
- **Idempotenz über einen Firmo-Marker.** Antworten und der Summary-Kommentar tragen einen HTML-Marker `<!-- firmo-iterate -->`. Vor dem Schreiben liest das Tool die vorhandenen PR-Kommentare frisch; bereits mit diesem Marker beantwortete/aufgelöste Threads gelten als erledigt und werden nicht doppelt bearbeitet. So bleibt ein zweiter `iterate`-Lauf auf demselben PR sauber.
- **Keine KI-Attribution** in Antworten, Summary-Kommentar, Commit-Messages oder PR-Body (AGENTS.md-Regel; kein `Co-Authored-By`, keine „Generated with …"-Footer, keine Agent-Session-Links). Antworttexte in natürlicher Sprache gemäß Sprachregeln.
- **Delivery/Worktree-Wiederverwendung.** Im PR-Modus wird der PR-Head-Branch bezogen und in einem sauberen Checkout oder isolierten Worktree bearbeitet (Muster „neuer Commit auf existierendem PR" aus `apply-review-remote.md`, Phase 2 remote). Es wird **kein neuer Liefer-Branch und kein neuer PR** erzeugt.
- **Commit-Granularität: ein Commit pro Thread/Punkt.** Jeder umgesetzte Review-Thread bzw. jede Freitext-Instruktion wird ein eigener Commit (feinste Nachvollziehbarkeit, Thread ↔ Commit gut zuordenbar; entspricht dem `apply-review`-Default „Einzeln"). Die Commit-Messages bleiben **saubere Conventional-Commits ohne interne IDs** — insbesondere **keine** Thread-/Kommentar-Referenz in der Message (konsistent mit `commit-message-rules`: „keine internen Finding-IDs"). Die Zuordnung Thread → Commit wird stattdessen über die Thread-Antwort in Phase 5 und den Summary-Kommentar hergestellt, nicht über den Commit-Text.
- **Local-Modus-Ziel: aktueller Branch gegenüber Basis-Branch.** „Letzte Codeänderung im Repo" heißt der komplette offene Diff des aktuellen Branch gegenüber `delivery.baseBranch` (`git diff <base>...HEAD`) — symmetrisch zum PR-Modus, der auf dem gesamten PR-Diff arbeitet. Nicht nur der letzte Commit und nicht nur der Arbeitsbaum.
- **Freigabe-Gate vor außenwirksamen Aktionen.** Nach der Klassifikation zeigt `iterate` die umzusetzenden Punkte und holt **eine** Freigabe ein (Optionen `Ja` / `Autonom via /goal` / `Anpassen`, analog `build` Phase 1 und „Explizite Goal-Abfrage für autonome Läufe"). Erst danach laufen Umsetzung, Push, Thread-Antworten/Auflösen und Summary — im Autonom-Fall goal-getrieben ohne weitere reguläre Gates. Bei nicht-interaktiver Delegation entfällt die Abfrage.

## Betroffene Dateien

| Datei                              | Beschreibung                                                                                                                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/tools/iterate.md`             | **Neu.** Orchestrator-Tool-Quelle mit Frontmatter (`description`, `catalogHint`), Includes und dem Tool-Workflow (Ziel-Erkennung, Kontext, Klassifikation, Delegation, Validierung, Rücklieferung, Zusammenfassung).      |
| `src/shared/pr-review-comments.md` | **Neu.** Geteilter Baustein: PR-Auflösung und PR-Review-Thread-Operationen (lesen, antworten, auflösen, Summary posten) gemappt auf `gh`/GraphQL und `tea`/Forgejo-API; nutzt Host-/CLI-Erkennung aus `issue-tracker.md`. |
| `build.mjs`                        | `iterate` in `TOOL_GROUPS` (Gruppe „Eine Änderung umsetzen") aufnehmen. `EXPOSED_TOOLS` ist davon abgeleitet; Router-Katalog und `argumentHint` werden regeneriert.                                                       |
| `AGENTS.md`                        | Optional: einen Satz im „What this repo is"-Kontext bzw. bei den Tool-nahen Hinweisen ergänzen, falls `iterate` erwähnenswert ist (nur wenn ohne Scope-Ausweitung sinnvoll; sonst weglassen).                             |
| `dist/**`                          | Generiert durch `node build.mjs` — nicht von Hand editieren (gitignored).                                                                                                                                                 |

> Hinweis zur No-Code-Grenze dieses Plans: Die tatsächlichen Änderungen an `src/**` und `build.mjs` nimmt erst `/firmo build` vor. Dieser Plan beschreibt sie nur.

## Implementierungsdetails

### Vorgehen (Umsetzung via `/firmo build`)

1. **`src/shared/pr-review-comments.md` anlegen.** Baustein mit:
   - **Host-/CLI-Erkennung** per Wiederverwendung der Regeln aus `issue-tracker.md` (origin-URL → `gh` für `github.com`, sonst `tea`/Forgejo; `remoteToolOverride`/Per-Run-Hinweis für mehrdeutige Hosts). Verfügbarkeits-/Auth-Prüfung wie dort; fehlt das CLI/Auth → klare Fehlermeldung, kein stiller Fallback.
   - **PR-Auflösung:** aus Argument (`#42`, Nummer, PR-URL) oder aus dem aktuellen Branch (GitHub: `gh pr view --json number,headRefName,baseRefName,url,state`; Forgejo: entsprechende `tea`/API-Abfrage). Ergebnis: PR-Nummer, Head-Branch, Basis-Branch, URL, Status.
   - **Review-Threads lesen (frisch):** GitHub inline Review-Kommentare via `gh api repos/{owner}/{repo}/pulls/{n}/comments` und Thread-/Resolved-Status via GraphQL `pullRequest.reviewThreads` (Felder `isResolved`, `id`, `comments`); PR-Ebene-Kommentare via `gh pr view --json comments`. Forgejo: `tea`/Forgejo-API für PR-Review-Kommentare. Pro Thread festhalten: Thread-ID, Autor (Bot/Mensch), Datei + Zeile, Kommentartext, `resolved`-Status.
   - **Auf Thread antworten:** GitHub `gh api ... /pulls/{n}/comments/{id}/replies` (bzw. Review-Reply-Endpoint); Forgejo entsprechend.
   - **Thread auflösen:** GitHub GraphQL-Mutation `resolveReviewThread(threadId)`; Forgejo best-effort (falls nicht unterstützt: nur Antwort, Vermerk im Summary).
   - **Summary-Kommentar posten:** GitHub `gh pr comment <n> --body …`; Forgejo `tea`/API. Marker `<!-- firmo-iterate -->` in Antworten und Summary.
   - **Idempotenz-Regel:** vor jedem Schreiben Kommentare frisch lesen; mit `<!-- firmo-iterate -->` bereits behandelte Threads überspringen.
   - **Keine-KI-Attribution-Regel** (Verweis auf AGENTS.md / `commit-message-rules`).
2. **`src/tools/iterate.md` anlegen** mit dem unten beschriebenen Workflow, folgenden Includes und `## Empfohlene Skills` (`metro-english › humanizer` für die Antwort-/Summary-Texte, analog `pr.md`):
   - `language-rules`, `task-tracking`, `config-migration`, `commit-message-rules`, `firmo-dir-migration`, `completion-protocol`, `goal-completion`, `pre-commit-gate`, `skill-discovery`, `worktree-integration` (für den Bezug/Isolation des PR-Head-Branches) und den neuen `pr-review-comments`.
3. **`build.mjs`** — `iterate` in die Gruppe „Eine Änderung umsetzen" von `TOOL_GROUPS` aufnehmen (als letztes Tool der Gruppe). Keine weiteren Änderungen nötig: `EXPOSED_TOOLS`, Router-Katalog und `argumentHint` leiten sich ab. Die Build-Guards prüfen Existenz der Quelle und das gequotete `catalogHint`.
4. **`node build.mjs`** ausführen; sicherstellen, dass beide Harnesses (Claude, Codex) bauen und die Version-Drift-Guard grün bleibt.
5. **`pnpm format` / `pnpm agent:check`** über die neuen Markdown-Quellen laufen lassen.

### Tool-Workflow von `iterate` (in `src/tools/iterate.md` zu beschreiben)

- **Phase 0 — Ziel-Erkennung & Eingabe-Parsing.** Argument in optionale PR-Referenz + Freitext trennen. Ziel-Modus bestimmen: PR-Referenz vorhanden **oder** aktueller Branch hat offenen PR → **PR-Modus**; sonst → **Local-Modus**. Bei Mehrdeutigkeit (z. B. bare Nummer könnte Issue sein) nachfragen statt raten. Intent-Gate wie in `build`/`apply` ist hier schlank: `iterate` setzt immer eine **bestehende** Änderung fort.
- **Phase 1 — Kontext sammeln.**
  - PR-Modus: PR auflösen, Review-Threads frisch lesen (via `pr-review-comments`), zusätzlich Freitext-Instruktionen aufnehmen. Head-Branch beziehen und in sauberem Checkout/Worktree bereitstellen (aktualisieren per Fetch/Pull ohne Rebase/Force).
  - Local-Modus: den kompletten offenen Diff des aktuellen Branch gegenüber `delivery.baseBranch` (`git diff <base>...HEAD`) als Kontext nehmen; Quelle der umzusetzenden Punkte ist nur der Freitext.
- **Phase 2 — Klassifikation.** Pro Punkt (Thread bzw. Instruktion) bestimmen:
  - **umsetzbar vs. nicht umsetzbar:** reine Lob-/Info-Kommentare zählen nicht als umsetzbar. **Nitpick-/niedrig-priorisierte Bot-Kommentare werden standardmäßig als umsetzbar mitgenommen** — das Freigabe-Gate in Phase 2.5 erlaubt dem User, einzelne abzuwählen. **Reine Fragen** ohne Codeänderungsbedarf werden nicht umgesetzt und **nicht automatisch inhaltlich beantwortet**; sie werden in der Zusammenfassung (Phase 5/6) als offen/zurückgestellt gelistet, damit der User sie selbst beantwortet.
  - **bereits adressiert** (Thread `resolved` oder mit `<!-- firmo-iterate -->`-Antwort) → überspringen.
  - **Aktionstyp** ableiten: `{{SKILL:fix}}` (Bug/Korrektur), `{{SKILL:refactor}}` (Struktur ohne Verhaltensänderung), `{{SKILL:build}}` (neue kleine Funktionalität), `{{SKILL:docs}}` (nur Doku). Menschliche und Bot-Kommentare gleichwertig behandeln; Bot-Kommentare dürfen als weniger verbindlich markiert werden, wenn sie erkennbar generisch sind.
  - Per-Punkt-Task anlegen (analog per-Finding-Granularität in `apply-review`).
- **Phase 2.5 — Freigabe.** Klassifizierte Punkte anzeigen und Freigabe einholen (`Ja` / `Autonom via /goal` / `Anpassen`, siehe „Explizite Goal-Abfrage für autonome Läufe"). Ohne Freigabe keine außenwirksame Aktion. Bei nicht-interaktiver Delegation entfällt die Abfrage.
- **Phase 3 — Umsetzung.** Umsetzbare Punkte an den passenden Skill delegieren, auf dem PR-Head-Branch (PR-Modus) bzw. aktuellen Branch (Local-Modus). **Ein Commit pro Thread/Punkt** (saubere Conventional-Commit-Message ohne interne IDs/Thread-Referenz, kein `Co-Authored-By`). Dateiüberlappende Punkte laufen sequenziell (damit die Commits geordnet bleiben), unabhängige dürfen parallel umgesetzt werden; die Detail-Mechanik bleibt bewusst schlanker als der volle `apply-review`-Union-Find-Apparat und referenziert ihn nur bei Bedarf.
- **Phase 4 — Validierung.** `{{AGENT:code-validator}}` bzw. das projektweite Qualitäts-Gate gemäß „Goal-getriebene Abschlusssteuerung"; Fehler beheben, begrenzte Runden, dann eskalieren.
- **Phase 5 — Rücklieferung (nur PR-Modus).** Head-Branch normal pushen (kein Force). Pro adressiertem Thread: kurze Antwort posten und Thread auflösen (GitHub GraphQL; Forgejo best-effort). Am Ende **einen** Summary-Kommentar am PR mit Marker `<!-- firmo-iterate -->`: welche Punkte umgesetzt/übersprungen wurden und welche reinen Fragen als offen/zurückgestellt gelistet sind (ohne inhaltliche Auto-Antwort). Schlägt der Push fehl → Punkte als nicht geliefert melden, Threads nicht auflösen.
- **Phase 6 — Zusammenfassung.** Tabelle (umgesetzt / übersprungen / zurückgestellte Fragen / fehlgeschlagen), PR-URL, gepushte Commits, aufgelöste Threads, finaler Checkout-Zustand. Im Local-Modus: welche Commits auf welchem Branch entstanden sind.

### Edge Cases

- **Kein PR und keine Freitext-Instruktion:** nichts zu tun — kurz melden und beenden (keine leeren Commits, keine leeren Kommentare).
- **PR bereits gemergt/geschlossen:** melden; keine Commits pushen. Optional Local-Modus anbieten, wenn der User trotzdem an der letzten Änderung arbeiten will.
- **Alle Threads bereits `resolved`/adressiert und kein Freitext:** melden „nichts Offenes" und beenden.
- **Nur nicht-umsetzbare Kommentare (Fragen/Lob):** keine Codeänderung; reine Fragen werden **zurückgestellt und im Summary gelistet** (keine automatische inhaltliche Antwort), keinen Summary-Commit erzwingen.
- **Push abgelehnt (divergierte Remote-History):** stoppen, Konflikt melden, keine History überschreiben, Threads nicht auflösen.
- **CLI/Auth fehlt:** sauber abbrechen mit Behebungshinweis; lokale Umsetzung nicht heimlich pushen.
- **Forgejo ohne Thread-Resolve-Support:** nur antworten, im Summary vermerken, dass manuelles Auflösen nötig ist.
- **Uncommittete Fremdänderungen im Haupt-Checkout:** nicht still stagen/stashen; Worktree-Isolation nutzen oder nachfragen (wie `worktree-integration`).
- **Bare Nummer mehrdeutig (PR vs. Issue):** nachfragen; nicht heuristisch raten.

## Akzeptanzkriterien

- [ ] `/firmo iterate` ist im Router-Katalog unter „Eine Änderung umsetzen" gelistet, mit einer `catalogHint`-Zeile; `node build.mjs` läuft für beide Harnesses fehlerfrei durch (inkl. `catalogHint`-, Include-Target- und Version-Drift-Guards).
- [ ] `src/tools/iterate.md` existiert, ist streng-gequotet im Frontmatter und bindet die genannten Includes ein; `pnpm agent:check` meldet keine Formatfehler.
- [ ] `src/shared/pr-review-comments.md` existiert und wird von `iterate.md` per `include`-Fence referenziert; der Include-Target-Guard im Build ist grün.
- [ ] Im **PR-Modus** liest das Tool die PR-Review-Threads aller Reviewer frisch, setzt umsetzbare Punkte als neue Commits auf dem PR-Head-Branch um (kein Force-Push/Amend/Rebase), pusht sie, antwortet pro adressiertem Thread, löst ihn auf (GitHub) und postet genau einen `<!-- firmo-iterate -->`-Summary-Kommentar.
- [ ] Zusätzliche **Freitext-Instruktionen** nach der PR-Referenz werden als weitere umzusetzende Punkte behandelt.
- [ ] Jeder umgesetzte Thread/Punkt wird als **eigener Commit** geschrieben; die Commit-Messages enthalten keine internen IDs/Thread-Referenzen und kein `Co-Authored-By`.
- [ ] Vor der ersten außenwirksamen Aktion (Push/Kommentar) zeigt das Tool die klassifizierten Punkte und holt eine Freigabe (`Ja` / `Autonom via /goal` / `Anpassen`); bei nicht-interaktiver Delegation entfällt sie.
- [ ] Im **Local-Modus** (kein PR) nimmt das Tool den Diff `git diff <base>...HEAD` (aktueller Branch gegenüber `delivery.baseBranch`) als Kontext, iteriert anhand der Freitext-Instruktionen und committet neue Commits, ohne zu pushen oder Kommentare zu posten.
- [ ] Ein zweiter `iterate`-Lauf auf demselben PR ist idempotent: bereits aufgelöste bzw. mit `<!-- firmo-iterate -->` beantwortete Threads werden übersprungen.
- [ ] Antworten, Summary, Commits und PR-Body enthalten **keine** KI-Attribution und kein `Co-Authored-By`.
- [ ] GitHub und Forgejo werden unterstützt; fehlt CLI/Auth, bricht das Tool sauber ab.

## Validierungsplan

- `node build.mjs` — muss für Claude und Codex ohne Guard-Fehler durchlaufen (primäres Korrektheits-Gate dieses Repos; kein Test-Suite vorhanden).
- `pnpm agent:check` — oxfmt-Check über die neuen Markdown-Quellen.
- Manuelle Sichtprüfung des generierten Router-Katalogs in `dist/claude/` und `dist/codex/`: `iterate` erscheint in der Gruppe „Eine Änderung umsetzen" mit korrektem `catalogHint`; `argumentHint` enthält `iterate`.
- Manuelle Sichtprüfung, dass `src/tools/iterate.md` keine vollständigen Codeblöcke, sondern Prosa-Anweisungen enthält (konsistent mit den übrigen Tool-Quellen).
- Optionaler realer Rauch-Test (außerhalb dieses Repos, in einem Projekt mit offenem PR): `/firmo iterate <PR>` gegen einen Greptile-kommentierten PR ausführen und Commit + Thread-Antwort + Summary prüfen.

## Annahmen und offene Punkte

- **Annahme:** GitHub-Thread-Auflösung erfordert die GraphQL-Mutation `resolveReviewThread`; die genauen `gh api`/GraphQL-Aufrufe verifiziert der Implementer gegen die installierte `gh`-Version (ggf. via Context7/aktuelle Doku). Forgejo-Resolve ist best-effort.
- **Annahme:** `iterate` wertet `tracker.mode` (local/remote) **nicht** aus — es ist inhärent remote im PR-Modus (braucht nur Git-Repo, `origin`, authentifiziertes CLI) und rein lokal im Local-Modus. Das entspricht der Behandlung von `apply-issues`/`plan-issue` in `issue-tracker.md`.
- **Annahme:** Reuse der Delegations-Skills `fix`/`refactor`/`build`/`docs` genügt; `iterate` braucht keinen eigenen Implementer-Agent.
- **Annahme:** Die Parallelitäts-Tiefe der Umsetzung startet schlank (dateiüberlappende Punkte sequenziell, unabhängige parallel) und referenziert den vollen `apply-review`-Union-Find-Apparat nur bei Bedarf.

## Umsetzung

**Datum:** 2026-07-17 · **Workflow:** /firmo build

Umgesetzt wie geplant:

- `src/shared/pr-review-comments.md` neu angelegt (PR-Auflösung, Review-Thread-Lesen, Antworten, Auflösen, Summary-Kommentar; `gh`/GraphQL + `tea`/Forgejo-API; Host-/CLI-Erkennung aus `issue-tracker.md` wiederverwendet).
- `src/tools/iterate.md` neu angelegt (Orchestrator mit Phasen 0–6, PR- und Local-Modus, Freigabe-Gate, ein Commit pro Punkt, Delegation an `fix`/`refactor`/`build`/`docs`, Reine-Fragen-Zurückstellung, Nitpicks als umsetzbar).
- `build.mjs`: `iterate` als letztes Tool der Gruppe „Eine Änderung umsetzen" in `TOOL_GROUPS` ergänzt.

### Testergebnisse

- `node build.mjs`: grün für Claude und Codex; alle Guards (Dead-Reference, `catalogHint`, Version-Drift, Include-Target) bestanden. 16 exponierte Tools (vorher 15).
- `pnpm agent:check` (oxfmt --check): keine Formatfehler.
- Router-Katalog beider Harnesses enthält `/firmo iterate` in der Gruppe „Eine Änderung umsetzen"; `argument-hint` enthält `iterate`. Includes, `ask`-Fence und Platzhalter im generierten `dist/`-Tool sauber aufgelöst, keine Reststellen `{{…}}`.

### Review-Findings

**Reviewer:** keiner (Änderung besteht aus Markdown-Skill-Quellen + einzeiliger `build.mjs`-Registrierung). Das maßgebliche Qualitäts-Gate dieses Repos sind die Build-Guards und oxfmt; beide grün. Keine offenen Findings.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

Schweregrade zählen alle Befunde inklusive der im vertieften Review bereits eingearbeiteten (behobenen).

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       1 |
| Security    |        0 |       1 |       0 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       1 |       1 |
| Testbarkeit |        0 |       0 |       1 |
| Scope       |        0 |       1 |       2 |
| Wartbarkeit |        0 |       0 |       1 |

### Befunde

- **Scope (Wichtig):** Der Freitext-Kanal und der Local-Modus erweitern das ursprünglich genannte Greptile-Szenario. Bewusst aufgenommen auf ausdrücklichen User-Wunsch („auch eingaben nach dem Tool für Änderungen am PR oder der letzten Codeänderung im Repo"). Eingegrenzt durch klare Modus-Erkennung in Phase 0, die im vertieften Plan-Review festgelegte Local-Ziel-Definition (Branch gegenüber Basis) und die Edge-Case-Liste, damit kein unkontrollierter Scope entsteht.
- **Fehlerfälle (behoben, vertiefter Review):** Commit-Granularität war zunächst offen — festgelegt auf **ein Commit pro Thread/Punkt** mit sauberen Messages ohne interne IDs. Damit ist die Thread↔Commit-Zuordnung eindeutig geregelt und in Phase 3 sowie den Akzeptanzkriterien verankert.
- **Security (behoben, vertiefter Review):** Ein **Freigabe-Gate** vor der ersten außenwirksamen Aktion (Push/Kommentar) wurde ergänzt (Phase 2.5), zusätzlich zu Kein-Force-Push, Kein-History-Rewrite, Keine-KI-Attribution und dem Idempotenz-Marker gegen Kommentar-Spam.
- **Scope (behoben, 2. Review-Runde):** Reine Reviewer-Fragen — der zuvor offene Punkt — sind festgelegt: **keine automatische inhaltliche Antwort**, sondern Zurückstellen und Auflisten im Summary (Phase 2/5/6). Der Punkt ist damit geschlossen, `## Offene Punkte` ist leer.
- **Scope (behoben, 2. Review-Runde):** Umgang mit Bot-**Nitpicks** festgelegt: standardmäßig als umsetzbar mitnehmen, das Freigabe-Gate erlaubt Abwählen (Phase 2). Konsistent mit der Nutzerwahl „Alle Reviewer".
- **Architektur (Hinweis):** Eigener Baustein `pr-review-comments.md` statt Erweiterung von `issue-tracker.md` — begründet über die unterschiedlichen API-Objekte (PR-Review-Threads vs. Issues) und die Wiederverwendung nur der Host-/CLI-Plumbing.
- **Fehlerfälle (Hinweis):** Push-Ablehnung, fehlendes CLI, gemergter PR, Forgejo-Resolve-Lücke und Mehrdeutigkeit sind in „Edge Cases" abgedeckt.
- **Testbarkeit (Hinweis):** Da kein Test-Suite existiert, ist `node build.mjs` das primäre Gate; die inhaltliche Wirkung wird über einen manuellen Rauch-Test gegen einen realen PR geprüft.
- **Wartbarkeit (Hinweis):** Delegation an bestehende Skills und Wiederverwendung geteilter Bausteine hält die Kopplung gering; kein neuer Agent nötig.

## Offene Punkte

- Keine offenen Punkte.
