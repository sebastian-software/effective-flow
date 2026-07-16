---
description: "Erstellt aus einem lokalen Branch oder über einen frischen Delivery-Branch einen Pull-Request auf GitHub (über gh) oder Forgejo (über tea). Erkennt den Host an der origin-URL, pusht den Branch bei Bedarf, leitet Titel und Beschreibung aus den Commits ab, stellt den Checkout nach erfolgreicher PR-Erstellung zurück und meldet die PR-URL."
catalogHint: "Öffnet aus deinem Branch einen Pull-Request (GitHub oder Forgejo)."
---

# Firmo PR

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

```include
language-rules
```

```include
task-tracking
```

```include
commit-message-rules
```

## Empfohlene Skills

- `metro-english › humanizer` (Fallback)

```include
skill-discovery
```

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor der PR-Erstellung und beachte ihre Vorgaben für Branch-Namen, PR-Titel, PR-Beschreibung und projektweite Konventionen.

## Eingaben

- **Head-Branch:** der Liefer-Branch. Default: der aktuell ausgecheckte Branch.
- **Lifecycle-Modus:** optionaler Auftrag, einen Liefer-Branch frisch aus dem
  Basis-Ref zu erzeugen oder einen bereits vorbereiteten Delivery-Branch
  abzuschließen.
- **Basis-Branch:** das PR-Ziel. Default: der Branch-Anteil aus
  `delivery.baseBranch` in `.firmo/config.json` (bei `origin/main` also `main`);
  Legacy-Fallback: `worktree.baseBranch`; fehlt die Config, `main`.
- **Rückwechsel-Ziel:** Default aus `delivery.returnBranch`; bei `auto` der lokale
  Branch-Anteil aus `delivery.baseBranch`.
- **Titel/Beschreibung:** optional vorgegeben. Fehlen sie, leite sie aus den Commits ab.

## Vorgehen

1. **Config und Modus bestimmen:**
   - Lies `.firmo/config.json`, falls vorhanden. Verwende `delivery.baseBranch`,
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
7. **Titel und Beschreibung ableiten:** Bestimme die Commits des Head-Branches gegenüber dem Remote-Tracking-Ref des Basis-Branches (`origin/<basis-branch>`, nicht dem lokalen Branch-Anteil – der lokale Basis-Branch kann hinter dem Remote liegen und fremde Commits einschleppen). Leite daraus einen konkreten PR-Titel im Conventional-Commit-Stil und eine kurze Beschreibung der Änderungen ab. Referenziere eine zugehörige Plan-Datei aus `<plan.dir>/` (dem Plan-Verzeichnis aus `.firmo/config.json` `plan.dir`, Default `docs/plan`), falls vorhanden. Setze keine internen Tracking-IDs, keine `Co-Authored-By`-Trailer und keine KI-Attribution (keine „Generated with Claude Code/Codex"-Footer, keine Agent-Session-Links wie `https://claude.ai/code/…`) in PR-Titel oder -Beschreibung – auch dann nicht, wenn der Harness sie als Default anhängt.
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
- Starte keine Projektvalidation wie Linting, Tests oder Build-Checks; diese Verantwortung liegt bei anderen Skills wie `{{AGENT:code-validator}}`.
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
