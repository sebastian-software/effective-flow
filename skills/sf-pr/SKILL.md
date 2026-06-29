---
name: sf-pr
description: "Erstellt aus einem lokalen Branch einen Pull-Request auf GitHub (über gh) oder Forgejo (über tea). Erkennt den Host an der origin-URL, pusht den Branch bei Bedarf, leitet Titel und Beschreibung aus den Commits ab und meldet die PR-URL. Verwende diesen Skill, wenn aus dem aktuellen oder einem angegebenen Branch ein PR gegen einen Basis-Branch erstellt werden soll."
type: utility
---

# SF PR

Du erstellst aus einem lokalen Branch einen Pull-Request auf dem erkannten Git-Host.

## Ziel

- aus einem Liefer-Branch einen Pull-Request gegen einen Basis-Branch erstellen
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

## Projektkonventionen

Wenn im Projekt eine `AGENTS.md` vorhanden ist, lies sie vor der PR-Erstellung und beachte ihre Vorgaben für Branch-Namen, PR-Titel, PR-Beschreibung und projektweite Konventionen.

## Eingaben

- **Head-Branch:** der Liefer-Branch. Default: der aktuell ausgecheckte Branch.
- **Basis-Branch:** das PR-Ziel. Default: der Branch-Anteil aus `worktree.baseBranch` in `.sf-plugin/config.json` (bei `origin/main` also `main`); fehlt die Config, `main`.
- **Titel/Beschreibung:** optional vorgegeben. Fehlen sie, leite sie aus den Commits ab.

## Vorgehen

1. **Vorbedingungen prüfen:**
   - Es ist ein Git-Repository mit einer `origin`-Remote vorhanden. Fehlt `origin`, kann kein PR erstellt werden: klar melden und abbrechen.
   - Der Head-Branch existiert lokal.
2. **Host erkennen:** Lies die `origin`-URL (`git remote get-url origin`). Enthält der Host `github.com`, ist das Werkzeug `gh`. Andernfalls wird Forgejo angenommen und `tea` verwendet. Bei mehrdeutigem Host (z. B. self-hosted GitHub Enterprise oder unklare Domain) berücksichtige einen ausdrücklichen Per-Run-Hinweis des Users zum gewünschten Werkzeug.
3. **Werkzeug-Verfügbarkeit prüfen:** Stelle sicher, dass das gewählte CLI installiert und authentifiziert ist (`gh auth status` bzw. `tea` mit konfiguriertem Login). Fehlt das CLI oder die Authentifizierung: gib eine klare Fehlermeldung mit Behebungshinweis aus und brich ohne Seiteneffekt ab. Der Branch bleibt für eine spätere manuelle PR-Erstellung erhalten.
4. **Branch pushen:** Pushe den Head-Branch nach `origin`, falls dort noch nicht vorhanden oder nicht aktuell (`git push -u origin <head-branch>`). Wird der Push abgelehnt (z. B. divergierte Remote-History): melde die Ursache knapp und brich ab, statt den Remote-Stand zu überschreiben.
5. **Titel und Beschreibung ableiten:** Bestimme die Commits des Head-Branches gegenüber dem Remote-Tracking-Ref des Basis-Branches (`origin/<basis-branch>`, nicht dem lokalen Branch-Anteil – der lokale Basis-Branch kann hinter dem Remote liegen und fremde Commits einschleppen). Leite daraus einen konkreten PR-Titel im Conventional-Commit-Stil und eine kurze Beschreibung der Änderungen ab. Referenziere eine zugehörige Plan-Datei aus `docs/plan/`, falls vorhanden. Setze keine internen Tracking-IDs und keine `Co-Authored-By`-Trailer.
6. **PR erstellen:**
   - GitHub: `gh pr create --base <basis-branch> --head <head-branch> --title <titel> --body <beschreibung>`.
   - Forgejo: `tea pr create` mit den entsprechenden Optionen für Basis-Branch, Head-Branch, Titel und Beschreibung. Prüfe die genauen Flagnamen gegen die installierte `tea`-Version, falls ein Aufruf fehlschlägt.
7. **Ergebnis melden:** Gib die PR-URL und den Branch-Namen aus.

## Regeln

- Erstelle keinen PR aus einem Branch ohne Commits gegenüber dem Basis-Branch; melde das stattdessen.
- Starte keine Projektvalidation wie Linting, Tests oder Build-Checks; diese Verantwortung liegt bei anderen Skills wie `{{AGENT:sf-code-validator}}`.
- Überschreibe niemals Remote-History und erzwinge keinen Push.
- Wenn CLI oder Authentifizierung fehlen, brich sauber ab, ohne einen halben Zustand zu hinterlassen.
- Setze niemals `Co-Authored-By`-Trailer in Commits, PR-Titeln oder PR-Beschreibungen.
