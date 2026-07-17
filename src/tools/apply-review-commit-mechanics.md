---
description: "Interne Teil-Datei von apply-review: Git-Commit-Mutex, Worktree-Isolation und Cherry-Pick-Konfliktbewertung. Wird von tools/apply-review.md nur geladen, wenn eine committende Strategie gewählt wurde."
---

# Firmo Apply Review – Commit-Mechanik

Diese interne Teil-Datei wird von `tools/apply-review.md` geladen, sobald in Phase 2 die Commit-Strategie `Einzeln` oder `Einzeln mit Worktrees` feststeht. Bei `Keine Commits` wird sie nicht benötigt.

#### Git-Commit-Mutex für „Einzeln“

Wenn die Commit-Strategie **Einzeln** gewählt wurde, gilt für alle Delegations-Sub-Agenten ein globaler Commit-Mutex. Der Mutex schützt die gesamte kritische Git-Sektion, nicht nur den finalen `git commit`.

Ziel: Parallele Sub-Agenten dürfen gleichzeitig Dateien bearbeiten, aber niemals gleichzeitig Staging oder Commit durchführen. Dadurch darf ein Finding-Commit nur Änderungen dieses Findings enthalten.

Mutex-Konvention:

- Lock-Pfad: `.effective-flow/apply-review-commit.lock`
- Lock-Erwerb: atomar per `mkdir .effective-flow/apply-review-commit.lock`
- Lock-Inhalt: schreibe nach erfolgreichem Erwerb eine kurze Owner-Datei, z. B. `owner`, mit Finding-ID, Sub-Gruppe und Timestamp.
- Lock-Freigabe: lösche nur den Lock, den du selbst erworben hast, nach Commit-Erfolg, Commit-Abbruch oder Fehlerbehandlung.
- Wenn der Lock bereits existiert: warten und erneut versuchen. Falls der Lock offensichtlich verwaist wirkt, den User fragen, bevor er entfernt wird.

Kritische Sektion unter dem Lock:

1. Führe `git status --porcelain` aus.
2. Wenn bereits staged changes vorhanden sind, die nicht eindeutig zu diesem Finding gehören: **nicht committen**, User informieren und mit `ABBRUCH` für dieses Finding enden. Fremde staged changes dürfen nicht übernommen oder bereinigt werden.
3. Stage ausschließlich die Dateien, die aus der Vorabanalyse und der tatsächlichen Umsetzung dieses Findings bekannt sind. Verwende keine pauschalen Befehle wie `git add .`, `git add -A` oder `git commit -a`.
4. Prüfe `git diff --cached --name-only`. Die Liste darf nur Dateien dieses Findings enthalten.
5. Prüfe `git diff --cached`, ob der staged Diff inhaltlich zum aktuellen Finding gehört.
6. Führe den Commit mit der in Phase 2 festgelegten Message aus.
7. Ermittle direkt danach den Commit-Hash mit `git rev-parse HEAD` und protokolliere in der Wisdom-Datei die Zuordnung `Finding-ID -> Commit-Hash`.
8. Führe direkt danach `git status --porcelain` aus und protokolliere in der Wisdom-Datei, ob noch uncommittete Änderungen anderer paralleler Findings im Arbeitsbaum liegen. Diese Reständerungen sind erlaubt, solange sie nicht staged und nicht Teil des aktuellen Commits sind.

Falls eine Prüfung in der kritischen Sektion fehlschlägt, muss der Sub-Agent seine eigenen staged changes soweit eindeutig möglich wieder unstagen, den Lock freigeben und `ABBRUCH: [Grund]` melden.

#### Git-Worktree-Isolation für „Einzeln mit Worktrees“

Wenn die Commit-Strategie **Einzeln mit Worktrees** gewählt wurde, gilt statt des Git-Commit-Mutex eine Worktree-Isolation pro Delegations-Sub-Gruppe.

Vorbedingungen:

- Der ursprüngliche Arbeitsbaum muss vor dem Erstellen der Worktrees sauber sein (`git status --porcelain` leer), abgesehen von ignorierten Firmo-Dateien unter `.effective-flow/`.
- `git worktree` muss verfügbar sein.
- Lies die Firmo-Konfiguration (Projektsetup-ADR), falls vorhanden. Fehlt sie oder enthält sie keine Worktree-Werte, verwende die Defaults.

Worktree-Pfade:

1. Bestimme den Repo-Namen aus `basename "$(git rev-parse --show-toplevel)"`.
2. Verwende als BaseDir `applyReview.worktree.baseDir` aus der Firmo-Konfiguration (Projektsetup-ADR) oder den Default `.effective-flow/.worktrees`.
3. Erstelle Worktrees unter:
   `BASE_DIR/REPO_NAME/SESSION_ID/GROUP_NAME`
4. `GROUP_NAME` muss deterministisch, kurz und dateisystemtauglich sein, z. B. `fix-1`, `refactor-2`, `build-1` oder eine slugifizierte Sub-Gruppen-Beschreibung.

Der Default liegt bewusst innerhalb des Projekt-Roots. Dadurch bleiben Worktree-Erstellung, Dateiänderungen und Setup-Kommandos in der üblichen Workspace-Sandbox. Externe BaseDirs sind nur zu verwenden, wenn sie explizit in der Firmo-Konfiguration (Projektsetup-ADR) festgeschrieben sind und die Umgebung Schreib- und Ausführungsrechte dafür erlaubt.

Branch-Konvention:

- Pro Sub-Gruppe: `apply-review/<SESSION_ID>/<GROUP_NAME>`
- Erstelle den Worktree mit:
  `git worktree add <WORKTREE_PATH> -b <BRANCH_NAME> HEAD`

Setup-Erkennung im Worktree:

- `applyReview.worktree.setup: "auto"` oder fehlender Wert:
  - `pnpm-lock.yaml` → `pnpm install --frozen-lockfile --prefer-offline`
  - `package-lock.json` → `npm ci`
  - `yarn.lock` → `yarn install --frozen-lockfile`
  - `Cargo.toml` → `cargo fetch --locked`
  - `go.mod` → `go mod download`
  - `uv.lock` → `uv sync --frozen`
  - `poetry.lock` → `poetry install --sync`
  - keine bekannte Datei → kein Setup
- `applyReview.worktree.setup: "none"`: kein Setup ausführen.
- `applyReview.worktree.setup` als String: dieses explizite Setup-Kommando im Worktree ausführen.

Git Hooks werden für dieses Setup nicht verwendet. Das Setup ist ein expliziter `apply-review`-Schritt, damit es sichtbar, reproduzierbar und auf den temporären Worktree begrenzt bleibt.

Zeige vor dem Ausführen des Worktree-Setups kurz an, welcher Setup-Modus aktiv ist und welches Kommando geplant ist. Bei `setup: "none"` wird kein Install-/Fetch-Kommando ausgeführt; wenn ein Sub-Agent später wegen fehlender Dependencies scheitert, nenne das Setup-Profil in der Zusammenfassung als mögliche Ursache.

Delegation im Worktree:

- Starte den Delegations-Sub-Agenten mit Arbeitsverzeichnis `<WORKTREE_PATH>`.
- Gib ihm die Commit-Strategie `Einzeln mit Worktrees` weiter.
- Innerhalb des Worktrees committen Sub-Agenten nach jedem Finding einzeln, ohne interne Finding-ID in der Commit-Message.
- Protokolliere in der Wisdom-Datei pro Finding: Worktree-Pfad, Branch, Commit-Hash, Commit-Message.

Integration zurück in den ursprünglichen Branch:

1. Warte auf alle Worktree-Sub-Gruppen-Endstatus.
2. Für jede erfolgreiche Sub-Gruppe: ermittle die neuen Commits auf ihrem Branch seit `HEAD` des ursprünglichen Branches.
3. Führe die Commits im ursprünglichen Worktree sequenziell mit `git cherry-pick <commit>` zurück.
4. Bei Cherry-Pick-Konflikt: führe zuerst die Cherry-Pick-Konfliktbewertung aus. Löse risikoarme Konflikte direkt; frage den User nur bei risikoreichen oder unklaren Konflikten.
5. Nach erfolgreicher Integration und Validierung: Worktree entfernen (`git worktree remove <WORKTREE_PATH>`) und den temporären Branch löschen (`git branch -d <BRANCH_NAME>`).
6. Bei fehlgeschlagener Sub-Gruppe: Worktree und Branch zunächst behalten, Pfade in der Zusammenfassung nennen und User-Entscheidung zum Cleanup einholen.

Cherry-Pick-Konfliktbewertung:

1. Erfasse den Konfliktzustand:
   - `git status --porcelain`
   - betroffene Konfliktdateien
   - aktueller Commit, Worktree-Branch und Finding-Zuordnung aus der Wisdom-Datei
   - Konfliktmarker und betroffene Abschnitte pro Datei
2. Bewerte das Risiko pro Datei und für den gesamten Konflikt.

Ein Konflikt gilt nur dann als **risikoarm**, wenn alle Bedingungen erfüllt sind:

- Der Konflikt ist klein, lokal begrenzt und eindeutig verständlich.
- Die betroffenen Änderungen sind additiv oder mechanisch kombinierbar.
- Es gibt keine widersprüchlichen fachlichen Aussagen.
- Es sind keine Codepfade mit nicht offensichtlicher Laufzeitlogik betroffen.
- Die Auflösung erfordert keine neue Architektur- oder Produktentscheidung.

Typische risikoarme Fälle:

- identische Änderungen auf beiden Seiten
- additive Markdown- oder Dokumentationsabschnitte, die beide erhalten bleiben können
- unabhängige Einträge in Listen, Tabellen oder Changelogs
- triviale Reihenfolge-Konflikte ohne semantische Bedeutung
- Formatierungs- oder Kommentar-Konflikte ohne Einfluss auf Verhalten

Ein Konflikt gilt als **risikoreich**, sobald mindestens eine Bedingung zutrifft:

- Produktionscode, Tests mit Verhaltensaussage, öffentliche APIs, Schemas, Migrationen, Lockfiles oder Build-/Runtime-Konfigurationen sind betroffen.
- Beide Seiten ändern dieselbe Logik, denselben Kontrollfluss, dieselbe Datenstruktur oder dieselbe Fehlermeldung mit unterschiedlicher Bedeutung.
- Die Auflösung könnte Verhalten entfernen, verdecken oder neu kombinieren.
- Der Konfliktbereich ist groß, verteilt oder ohne vollständigen Kontext nicht sicher bewertbar.
- Eine automatische Auflösung würde Annahmen über Produktverhalten, Architektur oder Priorität zwischen Findings treffen.

Bei Unsicherheit ist der Konflikt als risikoreich zu behandeln.

Automatische Auflösung risikoarmer Konflikte:

1. Bearbeite ausschließlich die konfliktbetroffenen Dateien.
2. Erhalte beide Seiten, wenn sie unabhängig und additiv sind.
3. Entferne Konfliktmarker vollständig.
4. Stage nur die aufgelösten Konfliktdateien mit expliziten Pfaden.
5. Führe `git cherry-pick --continue` aus.
6. Protokolliere in der Wisdom-Datei: Commit, Worktree-Branch, betroffene Dateien, Risiko-Level, Auflösungsstrategie und Begründung.

User-Abfrage bei risikoreichen oder unklaren Konflikten:

Stoppe die Integration und gib dem User eine kompakte Konfliktbewertung:

- Commit und Worktree-Branch
- betroffene Dateien
- Konflikttyp pro Datei
- vermutete Ursache
- Risiko-Level mit Begründung
- vorgeschlagene Optionen:
  - manuell lösen
  - konkrete Auflösungsstrategie vorgeben
  - Commit überspringen
  - Workflow abbrechen

Führe keine automatische Konfliktauflösung durch, solange der User keine Richtung vorgegeben hat.
