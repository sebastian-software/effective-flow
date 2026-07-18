
# Effective Flow PR

Du erstellst aus einem lokalen Branch oder über einen frischen Delivery-Branch einen
Pull-Request auf dem erkannten Git-Host.

## Ziel

- aus einem Liefer-Branch einen Pull-Request gegen einen Basis-Branch erstellen
- optional einen frischen Liefer-Branch aus `delivery.baseBranch` erzeugen
- nach erfolgreicher PR-Erstellung den lokalen Checkout auf den Zielbranch
  zurückstellen
- GitHub über `gh` und Forgejo über `tea` unterstützen
- den Host automatisch an der `origin`-Remote-URL erkennen
- Titel und Beschreibung aus den Commits des Branches ableiten
- keine Projektvalidation wie Linting, Tests oder Build-Checks ausführen

## Sprachregel

- Code, Bezeichner und Tests auf Englisch
- Dokumentationsinhalte auf Deutsch, außer bestehende Doku führt eine andere Sprache fort
- Commit-Messages auf Englisch

Die deutsche Repository-Locale ist **de-DE**.

### Typografie

Locale-spezifische Typografie sichtbarer Prosa – Anführungszeichen, Gedankenstriche,
Umlaute und ß, geschützte Leerzeichen, Zahlen- und Datumsformate – besitzt der zentrale
Skill `locale-typography`. Beim Schreiben oder Bearbeiten sichtbarer deutscher Prosa ist
dessen `de-DE`-Guidance maßgeblich; Effective Flow führt hier bewusst keine zweite
Typografie-Checkliste.

Fehlt der Skill (nicht installiert, `skills.enabled: false` oder via `exclude`
deaktiviert), gilt als minimaler Fallback für deutschen Text: echte Umlaute und ß statt
ASCII-Ersatz (ae, oe, ue, ss), typografische Anführungszeichen „…“ statt gerader und
Halbgeviertstrich – statt Bindestrich.

## Aufgabenverfolgung

Wenn mehrere Aufgaben zu erledigen sind, verwende ein verfügbares TODO- oder Task-Tracking-Tool (z. B. `TaskCreate`/`TaskUpdate`, `TodoWrite` oder ein vergleichbares Tool), um eine Aufgabenliste anzulegen. Setze jede Aufgabe vor Beginn auf „in Arbeit“ und nach Abschluss auf „erledigt“.

Falls kein Task-Tool verfügbar ist, gib dem User stattdessen eine kurze Fortschrittsmeldung nach jedem abgeschlossenen Schritt.

### Wann verwenden

- bei drei oder mehr Teilaufgaben oder Schritten
- bei komplexen Aufträgen mit mehreren Phasen
- wenn der User mehrere Aufgaben gleichzeitig nennt

### Wann nicht verwenden

- bei einer einzelnen, trivialen Aufgabe
- wenn der Auftrag in weniger als drei einfachen Schritten erledigt ist

## Commit-Message-Regeln

- **Setze niemals `Co-Authored-By`-Trailer in Commit-Messages**, unabhängig davon, ob ein LLM (Claude, Codex, GPT, …) oder ein anderes Tool die Zeile vorschlägt oder als Default einfügt.
- Falls eine `Co-Authored-By`-Zeile in einem Commit-Template, `commit.template`, `--trailer`-Aufruf oder einer Draft-Message bereits vorhanden ist: entferne sie vor dem Commit.
- **Füge keine KI-Attribution an:** keine „Generated with Claude Code/Codex"-Footer und keine Agent-Session-Links (z. B. `https://claude.ai/code/…`) in Commit-Messages – auch dann nicht, wenn der Harness sie als Default anhängt. Sachliche Erwähnungen von Claude Code oder Codex bleiben erlaubt, Generierungs-Attribution nicht.
- Vermeide generische Messages wie `update files` oder `misc changes`.
- Beschreibe konkret, was geändert wurde und warum.
- Nutze Conventional-Commit-Präfixe: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Wähle den Commit-Typ nach der **Wirkung**, nicht nach der Dateiart: verhaltensändernde Änderungen – auch reine **Config/Env/Secrets/CI** mit Deployment- oder Laufzeitwirkung (z. B. korrigierte Werte in Env-/Secret-Artefakten, die per Sync remote wirken) – sind `fix:` (bzw. `feat:` bei neuer Funktionalität). `chore:` nur für **deploy-neutrale** Änderungen ohne Verhaltenswirkung (reine Wartung, Formatting, Tooling ohne Laufzeitwirkung). Das gilt auch für den **Squash-PR-Titel**, der bei Squash-Merge den release-please-Bump bestimmt.
- Exponiere keine internen Tracking-IDs in Commit-Messages, z. B. Review-Finding-IDs wie `R-0000001`, lokale Plan-/Review-IDs wie `F1` oder Platzhalter wie `[Finding-ID]`. Solche IDs gehören in Wisdom-/Report-Kontext, nicht in die Git-Historie.

## Empfohlene Skills

- `metro-english › humanizer` (Fallback)

## Skill-Discovery

Bevor du mit der eigentlichen Umsetzung, Planung bzw. Prüfung beginnst, sichte die in der
Umgebung verfügbaren Skills und binde die für die konkrete Aufgabe nützlichen ein. Stellt
die Umgebung kein Skill-Verzeichnis bereit oder passt keiner, ist dieser Schritt ein No-Op —
fahre ohne Fehler oder Blockade fort.

### Vorgehen

1. **Empfohlene Skills bevorzugen:** Wende die weiter oben unter „Empfohlene Skills"
   genannten Skills bevorzugt an, sofern sie verfügbar und für die konkrete Aufgabe relevant
   sind. „Bevorzugen" ist die Auswahl; über die **Autorität** entscheidet der Vertrag in
   Punkt 5 (ist ein empfohlener Skill der deklarierte Domänen-Owner, ist seine Guidance
   maßgeblich, nicht nur optional). Eine Fallback-Notation `A › B` ist eine geordnete Präferenz: nimm den ersten
   verfügbaren, nicht ausgeschlossenen Skill der Gruppe, nie beide. Fehlt ein solcher
   Abschnitt (z. B. bei Tools), entfällt dieser Punkt.
2. **Relevanz beurteilen:** Prüfe jeden Skill gegen die **konkrete** Aufgabe und binde nur
   klar passende ein (typisch 0–2). Lade keine Skills „auf Verdacht" — Token-Sparsamkeit.
3. **Config berücksichtigen:** Lies, falls vorhanden, den `skills`-Block aus der
   Effective Flow-Konfiguration (Projektsetup-ADR) best-effort — die globalen Felder plus deinen
   eigenen Scope-Eintrag (ein Agent liest `agents.<eigener-name>`, ein Tool liest
   `tools.<eigener-name>`).
   - `enabled: false` → überspringe die gesamte dynamische Skill-Nutzung.
   - `exclude` (global oder Scope) → diese Skills nie anwenden; ein ausgeschlossenes
     Fallback-Mitglied wird zugunsten des nächsten Fallbacks übersprungen.
   - `include` (global oder Scope) → diese Skills zusätzlich bevorzugt berücksichtigen; ein
     nicht installierter Skill wird still ignoriert.
   - Fehlt der Block oder die Datei, gilt der Default (`enabled` an, keine Zusatz-Listen).
     Lies die Config nur; migriere oder schreibe sie hier nicht.
4. **Library-Doku:** Wird gegen eine unbekannte oder aktuelle Library bzw. ein Framework
   gearbeitet, nutze bei Bedarf aktuelle-Doku-Skills (z. B. `context7`), falls verfügbar,
   statt aus Erinnerung zu raten. Nur bei Bedarf, kein Zwang.
5. **Autoritäts-Vertrag (Orchestrierung vs. Domänen-Expertise):** Effective Flow und die zentralen
   Skills teilen sich die Verantwortung **geschichtet** — nicht „Effective Flow gewinnt immer":
   - **Effective Flow besitzt die Orchestrierung** (das **Was/Wann**): Routing und User-Interaktion,
     Plan-/Report-State, Finding-IDs, Backlinks, Tracker-Integration, Resumability,
     Agent-Auswahl und Parallelisierung, Baseline-Vergleich, Worktrees, Commits, Delivery,
     Harness-Transform und Config. Diese Regeln, `AGENTS.md`/Projektkonventionen sowie die
     eigenen Sprach-, Commit- und Scope-Regeln haben **immer** Vorrang; kein Skill darf Scope
     erweitern, neue Dependencies einführen oder den abgestimmten Plan verletzen. In
     Analyse-/Planungs-Tools bleibt die No-Code-Grenze strikt.
   - **Zentrale Skills besitzen wiederverwendbare Expertise** (das **Wie**): Domänen-Checklisten,
     Heuristiken, Standards, Research-Prozeduren und Spezialisten-Guidance. Ist ein empfohlener
     Skill der **deklarierte Domänen-Owner** für die anstehende Fachfrage **und** deckt er sie
     ab, ist seine Guidance **maßgeblich** — nicht optionaler Rat. Das eigene Source trägt dann
     **keine zweite Kopie** dieses Playbooks, sondern nur Scope-/Output-/Lifecycle-Constraints
     plus einen minimalen Fallback (Punkt 6).
   - **Grenzfälle:** Deckt ein Skill nur einen Spezialzweig ab (_route-when-relevant_) oder
     divergiert Effective Flows Produktverhalten bewusst (_no-overlap_), bleibt die Effective Flow-Guidance
     führend. Die verbindliche Zuordnung je Skill/Intersection steht im Ownership-Inventar im
     Developer-Guide (`docs/developer-guide/skill-ownership.md`).
6. **Fehlender maßgeblicher Skill (minimaler Fallback):** Ist der maßgebliche Skill nicht
   verfügbar (nicht installiert, `skills.enabled: false` oder via `exclude` deaktiviert),
   greift der im Source belassene **minimale generische Fallback** — eine kurze essentielle
   Kern-Guidance, damit das Tool funktionsfähig bleibt und sauber degradiert. Es wird **kein**
   zweites vollständiges Domänen-Handbuch vorgehalten; volle Tiefe kommt nur mit dem zentralen
   Skill.
7. **Melden:** Nenne kurz, welche Skills genutzt wurden (bzw. dass keiner passte). Hat dir
   ein Orchestrator-Tool bereits relevante Skills mitgegeben, wende sie an und führe keine
   redundante Voll-Discovery durch.

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor der PR-Erstellung und beachte ihre Vorgaben für Branch-Namen, PR-Titel, PR-Beschreibung und projektweite Konventionen.

## Eingaben

- **Head-Branch:** der Liefer-Branch. Default: der aktuell ausgecheckte Branch.
- **Lifecycle-Modus:** optionaler Auftrag, einen Liefer-Branch frisch aus dem
  Basis-Ref zu erzeugen oder einen bereits vorbereiteten Delivery-Branch
  abzuschließen.
- **Basis-Branch:** das PR-Ziel. Default: der Branch-Anteil aus
  `delivery.baseBranch` aus der Effective Flow-Konfiguration (Projektsetup-ADR; bei `origin/main` also `main`);
  Legacy-Fallback: `worktree.baseBranch`; fehlt die Config, `main`.
- **Rückwechsel-Ziel:** Default aus `delivery.returnBranch`; bei `auto` der lokale
  Branch-Anteil aus `delivery.baseBranch`.
- **Titel/Beschreibung:** optional vorgegeben; ein vorgegebener Titel ohne gültigen Conventional-Commit-Typ wird in Schritt 7 normalisiert. Fehlen sie, leite sie aus den Commits und dem Workflow-/Änderungstyp ab.
- **Titel-Typ-Hinweis:** optionaler Workflow-/Änderungstyp aus einem Delivery-Handback (z. B. `feat`, `fix`, `refactor`, `docs`), der die Typ-Wahl in Schritt 7 speist.

## Vorgehen

1. **Config und Modus bestimmen:**
   - Lies die Effective Flow-Konfiguration (Projektsetup-ADR), falls vorhanden. Verwende `delivery.baseBranch`,
     `delivery.branchPrefix` und `delivery.returnBranch`; falle für
     `baseBranch`/`branchPrefix` auf alte `worktree.*`-Werte zurück.
   - Wenn der Aufruf ausdrücklich einen frischen Branch verlangt oder aus einem
     Delivery-/Worktree-Handback kommt, ist der Lifecycle-Modus aktiv. Sonst bleibt
     der kompatible Bestandsmodus aktiv.
2. **Vorbedingungen prüfen:**
   - Es ist ein Git-Repository mit einer `origin`-Remote vorhanden. Fehlt `origin`, kann kein PR erstellt werden: klar melden und abbrechen.
   - Im Bestandsmodus existiert der Head-Branch lokal. Im Lifecycle-Modus existiert
     entweder ein vorbereiteter Liefer-Branch lokal oder der neue Liefer-Branch wird
     in Schritt 3 erzeugt.
3. **Lifecycle-Branch vorbereiten, falls verlangt:**
   - Merke den aktuell ausgecheckten Branch.
   - Ist ein bereits vorbereiteter Liefer-Branch übergeben, verwende ihn als Head.
   - Soll ein neuer Liefer-Branch erzeugt werden: löse `delivery.baseBranch` auf,
     aktualisiere Remote-Refs per `git fetch REMOTE BRANCH`, bilde einen Branch-Namen
     `<delivery.branchPrefix>/pr/<slug>` und erzeuge ihn aus dem Basis-Ref.
   - Wenn der aktuelle Arbeitsbaum Änderungen enthält, die nicht sicher zum PR
     gehören: nicht stagen, stashen oder überschreiben. Frage nach einer
     expliziten Dateiauswahl oder brich ab.
4. **Host erkennen:** Lies die `origin`-URL (`git remote get-url origin`) und extrahiere daraus den Host robust für HTTPS- und SSH-Formen (`https://host/owner/repo.git`, `ssh://git@host/owner/repo.git`, `git@host:owner/repo.git`). Ist der Host exakt `github.com`, ist das Werkzeug `gh`. Für jeden anderen Host wird Forgejo/Gitea angenommen und `tea` verwendet. Bei mehrdeutigem Host (z. B. self-hosted GitHub Enterprise oder unklare Domain) berücksichtige einen ausdrücklichen Per-Run-Hinweis des Users zum gewünschten Werkzeug.
5. **Werkzeug-Verfügbarkeit prüfen:** Stelle sicher, dass das gewählte CLI installiert und authentifiziert ist (`gh auth status` bzw. `tea` mit konfiguriertem Login). Fehlt das CLI oder die Authentifizierung: gib eine klare Fehlermeldung mit Behebungshinweis aus und brich ohne Seiteneffekt ab. Der Branch bleibt für eine spätere manuelle PR-Erstellung erhalten.
6. **Branch pushen:** Pushe den Head-Branch nach `origin`, falls dort noch nicht vorhanden oder nicht aktuell (`git push -u origin <head-branch>`). Wird der Push abgelehnt (z. B. divergierte Remote-History): melde die Ursache knapp und brich ab, statt den Remote-Stand zu überschreiben.
   Wenn für den Head-Branch bereits ein PR existiert, werden nachträgliche Änderungen
   ausschließlich als neue Commits auf diesem Branch gepusht. Schreibe bestehende
   PR-History nicht per `commit --amend`, Rebase, Squash oder Force-Push um.
7. **PR-Titel und -Beschreibung ableiten (gültigen Conventional-Commit-Titel erzwingen):** Bestimme die Commits des Head-Branches gegenüber dem Remote-Tracking-Ref des Basis-Branches (`origin/<basis-branch>`, nicht dem lokalen Branch-Anteil – der lokale Basis-Branch kann hinter dem Remote liegen und fremde Commits einschleppen). Leite daraus eine kurze Beschreibung der Änderungen ab und referenziere eine zugehörige Plan-Datei aus `<plan.dir>/` (dem Plan-Verzeichnis aus der Effective Flow-Konfiguration (Projektsetup-ADR) `plan.dir`, Default `docs/plan`), falls vorhanden.

   Der **PR-Titel muss ein gültiger Conventional Commit** sein — Form `<typ>[(scope)][!]: <beschreibung>` mit einem Typ aus den „Commit-Message-Regeln" (oben eingebettet). Das ist verpflichtend, weil der Titel bei Squash-Merge zur Subject des einzigen Commits auf dem Zielbranch wird und release-please daraus den Versions-Bump ableitet; ein untypisierter Titel erzeugt ein No-Op-Release (kein Bump, keine Auslieferung), obwohl CI grün bleibt. Bestimme den Titel in dieser Reihenfolge:
   - **Gültigen Titel erhalten:** Trägt ein vom User oder aus dem Delivery-Handback übergebener Titel bereits einen gültigen Typ (inklusive optionalem `(scope)` und Breaking-Marker `!`), übernimm ihn unverändert.
   - **Typ nach Wirkung wählen:** Sonst wähle den Typ nach der **Wirkung** der Änderung gemäß „Commit-Message-Regeln" und — falls vorhanden — dem übergebenen Titel-Typ-Hinweis: `feat` für neues Produktverhalten, `fix` für Korrekturen, `docs` für reine Doku, `refactor` für verhaltenserhaltende Umstrukturierung, `chore`/`build`/`ci` bzw. ein Dependency-Typ für Wartung. Umfasst der Branch mehrere Wirkungen, richtet sich der Typ nach der stärksten Wirkung (wie beim Squash-Subject), nicht nach dem jüngsten Commit.
   - **Untypisiertes Subject normalisieren:** Hat ein sonst passender Titel kein gültiges Präfix, präfixe ihn mit dem klassifizierten Typ, statt ihn untypisiert zu lassen; optionalen `(scope)`/`!`-Marker dabei valide halten.
   - **Nur bei echter Mehrdeutigkeit fragen:** Lässt sich die Wirkung nicht eindeutig einem Typ zuordnen, frage den User kurz nach dem Typ. Rate nicht.
   - **Selbst-Check vor dem Erstellen:** Passt der Titel nicht auf das Muster `<typ>[(scope)][!]: …` mit einem der erlaubten Typen, bilde ihn neu — emittiere in Schritt 8 **nie** einen untypisierten Titel.

   Setze keine internen Tracking-IDs, keine `Co-Authored-By`-Trailer und keine KI-Attribution (keine „Generated with Claude Code/Codex"-Footer, keine Agent-Session-Links wie `https://claude.ai/code/…`) in PR-Titel oder -Beschreibung – auch dann nicht, wenn der Harness sie als Default anhängt.

8. **PR erstellen:**
   - GitHub: `gh pr create --base <basis-branch> --head <head-branch> --title <titel> --body <beschreibung>`.
   - Forgejo: `tea pr create` mit den entsprechenden Optionen für Basis-Branch, Head-Branch, Titel und Beschreibung. Prüfe die genauen Flagnamen gegen die installierte `tea`-Version, falls ein Aufruf fehlschlägt.
9. **Checkout zurückstellen:** Nach erfolgreicher PR-Erstellung auf
   `delivery.returnBranch` bzw. bei `auto` auf den lokalen Branch-Anteil von
   `delivery.baseBranch` zurückwechseln, sofern der Arbeitsbaum sauber ist. Wenn der
   Rückwechsel scheitert, melde den tatsächlichen Branch ausdrücklich. Der
   PR-Head-Branch bleibt lokal und remote erhalten.
10. **Ergebnis melden:** Gib die PR-URL, den Branch-Namen und den finalen lokalen
    Checkout-Zustand aus.

## Regeln

- Erstelle keinen PR aus einem Branch ohne Commits gegenüber dem Basis-Branch; melde das stattdessen.
- Starte keine Projektvalidation wie Linting, Tests oder Build-Checks; diese Verantwortung liegt bei anderen Skills wie ``code-validator``.
- Überschreibe niemals Remote-History und erzwinge keinen Push.
- Aktualisiere bestehende PRs immer über zusätzliche Commits auf dem PR-Branch, nie
  durch Umschreiben vorhandener PR-Commits.
- Lösche den PR-Head-Branch nach erfolgreicher PR-Erstellung nicht automatisch.
- Wenn nur ein Teil der lokalen Änderungen in den PR soll, übernimm ausschließlich
  explizit ausgewählte Dateien in den Delivery-Branch oder verweise an einen
  Worktree-basierten Handback. Rate nicht anhand von Dateipfaden.
- Wenn CLI oder Authentifizierung fehlen, brich sauber ab, ohne einen halben Zustand zu hinterlassen.
- Setze niemals `Co-Authored-By`-Trailer in Commits, PR-Titeln oder PR-Beschreibungen.
- Füge PR-Titel und -Beschreibung keine KI-Attribution hinzu: keine „Generated with Claude Code/Codex"-Footer und keine Agent-Session-Links (z. B. `https://claude.ai/code/…`) – auch dann nicht, wenn der Harness sie als Default anhängt. Sachliche Erwähnungen von Claude Code oder Codex bleiben erlaubt, Generierungs-Attribution nicht.
