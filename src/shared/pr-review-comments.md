## PR-Review-Kommentar-Anbindung

Dieser geteilte Baustein verbindet `{{SKILL:iterate}}` mit den Review-Kommentaren eines
bestehenden Pull-Requests (GitHub über `gh`, Forgejo über `tea`). Er kapselt das
**PR-spezifische Plumbing**, das `issue-tracker.md` bewusst nicht enthält: die PR-Auflösung,
das Lesen von Review-Threads, das Antworten auf einen Thread, das Auflösen eines Threads und
das Posten eines PR-Summary-Kommentars.

Abgrenzung zu `issue-tracker.md`: Jener Baustein ist auf **Issues** und den
`tracker.mode`-Umschalter zugeschnitten. PR-Review-Threads sind ein anderes API-Objekt.
`{{SKILL:iterate}}` ist – wie `{{SKILL:apply-issues}}`/`{{SKILL:plan-issue}}` – **inhärent
remote** im PR-Modus und wertet `tracker.mode` nicht aus; es braucht lediglich ein
Git-Repository, eine `origin`-Remote und ein authentifiziertes CLI. Die **Host- und
CLI-Erkennung** wird aus `issue-tracker.md` übernommen (nicht neu erfunden); dieser Baustein
ergänzt nur die PR-Operationen.

### Keine KI-Attribution

Füge Thread-Antworten und dem Summary-Kommentar keine KI-Attribution hinzu: keine „Generated
with Claude Code/Codex"-Footer, keine Agent-Session-Links (z. B. `https://claude.ai/code/…`)
und keine `Co-Authored-By`-Trailer – auch dann nicht, wenn der Harness sie als Default
anhängt. Antworttexte in natürlicher Sprache gemäß Sprachregeln.

### Host- und CLI-Erkennung

Bestimme das Werkzeug analog zu `{{SKILL:pr}}` und zur „Host- und CLI-Erkennung" in
`issue-tracker.md`:

1. **Vorbedingung:** Es ist ein Git-Repository mit einer `origin`-Remote vorhanden. Fehlt
   `origin` oder ist es kein Git-Repository, ist der PR-Modus nicht möglich: klar melden.
2. **Werkzeug wählen:** Lies die `origin`-URL (`git remote get-url origin`) und extrahiere den
   Host robust für HTTPS- und SSH-Formen. Ist der Host exakt `github.com`, ist das Werkzeug
   `gh`; für jeden anderen Host wird Forgejo/Gitea angenommen und `tea` verwendet. Ein
   ausdrücklicher Per-Run-Hinweis des Users hat bei mehrdeutigem Host (z. B. GitHub
   Enterprise) Vorrang; ist der Host mehrdeutig und weder Hinweis noch Override vorhanden,
   frage den User.
3. **Verfügbarkeit prüfen:** Stelle sicher, dass das gewählte CLI installiert und
   authentifiziert ist (`gh auth status` bzw. `tea` mit konfiguriertem Login). Fehlt das CLI
   oder die Authentifizierung: gib eine klare Fehlermeldung mit Behebungshinweis aus und brich
   ohne Seiteneffekt ab. Falle **nicht** still auf lokale Arbeit zurück; einen lokalen
   Fallback nur nach ausdrücklicher User-Zustimmung.

### PR-Auflösung

Löse den Ziel-PR aus dem Argument oder dem aktuellen Branch auf und bestimme PR-Nummer,
Head-Branch, Basis-Branch, URL und Status:

- **Aus Argument:** eine PR-Referenz ist eine bare Nummer (`42`), `#42` oder eine PR-URL. Eine
  PR-URL trägt das Segment `/pull/` (GitHub) bzw. `/pulls/` (Forgejo) – das unterscheidet sie
  von einer Issue-URL (`/issues/`).
- **Aus aktuellem Branch:** wenn keine PR-Referenz übergeben wurde, versuche den offenen PR des
  aktuell ausgecheckten Branch zu ermitteln.

| Operation               | GitHub (`gh`)                                                                       | Forgejo (`tea`)                                                       |
| ----------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| PR aus Nummer lesen     | `gh pr view <nr> --json number,headRefName,baseRefName,url,state,isCrossRepository` | `tea pr <nr>` bzw. Forgejo-API `GET /repos/<owner>/<repo>/pulls/<nr>` |
| PR aus aktuellem Branch | `gh pr view --json number,headRefName,baseRefName,url,state`                        | `tea pr list --state open` und über den Head-Branch filtern           |

Ist der PR bereits `merged`/`closed`: melden und keine Commits pushen (siehe Fehlerfälle in
`{{SKILL:iterate}}`).

### Review-Threads lesen (immer frisch)

Lies die Review-Kommentare **direkt vor** der Klassifikation frisch vom Host – Kommentare
können sich zwischen Läufen ändern. Erfasse pro Thread: Thread-ID, Autor (und ob Bot oder
Mensch), Datei + Zeile, Kommentartext und den `resolved`-Status.

| Operation                      | GitHub (`gh`)                                                               | Forgejo (`tea`)                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Inline-Review-Kommentare lesen | `gh api repos/<owner>/<repo>/pulls/<nr>/comments`                           | Forgejo-API `GET /repos/<owner>/<repo>/pulls/<nr>/reviews` bzw. `.../comments`                           |
| Thread-/Resolved-Status lesen  | GraphQL `pullRequest.reviewThreads` (Felder `id`, `isResolved`, `comments`) | best-effort über die Forgejo-API; ist der Resolved-Status nicht verfügbar, alle als unresolved behandeln |
| PR-Ebene-Kommentare lesen      | `gh pr view <nr> --json comments`                                           | `tea pr <nr> --comments`, sonst Forgejo-API                                                              |

Ermittle für die GraphQL-Abfrage `owner`/`repo` aus der `origin`-URL. Prüfe bei Forgejo die
genauen Flag-/Endpunktnamen gegen die installierte `tea`-Version, falls ein Aufruf
fehlschlägt (wie in `{{SKILL:pr}}` vermerkt).

### Auf einen Thread antworten

| Operation                      | GitHub (`gh`)                                                                    | Forgejo (`tea`)                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Auf Review-Kommentar antworten | `gh api repos/<owner>/<repo>/pulls/<nr>/comments/<comment-id>/replies -f body=…` | Forgejo-API `POST /repos/<owner>/<repo>/pulls/<nr>/reviews` mit Bezug auf den Kommentar |

Jede Antwort trägt den Marker `<!-- firmo-iterate -->` (siehe Idempotenz).

### Einen Thread auflösen

| Operation              | GitHub (`gh`)                                               | Forgejo (`tea`)                                                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review-Thread auflösen | GraphQL-Mutation `resolveReviewThread(input: { threadId })` | best-effort; unterstützt die installierte API/`tea`-Version das Auflösen nicht, **nur antworten** und im Summary vermerken, dass manuelles Auflösen nötig ist – **kein Abbruch** |

### Summary-Kommentar posten

| Operation           | GitHub (`gh`)                 | Forgejo (`tea`)                         |
| ------------------- | ----------------------------- | --------------------------------------- |
| PR-Kommentar posten | `gh pr comment <nr> --body …` | `tea comment <nr> …`, sonst Forgejo-API |

Es wird pro Lauf **genau ein** Summary-Kommentar mit Marker `<!-- firmo-iterate -->`
gepostet: welche Punkte umgesetzt, welche übersprungen und welche reinen Fragen als
offen/zurückgestellt gelistet sind.

### Idempotenz über den Effective Flow-Marker

Antworten und der Summary-Kommentar tragen den HTML-Marker `<!-- firmo-iterate -->`. Lies
die vorhandenen PR- und Review-Kommentare **vor jedem Schreiben** frisch: ein Thread, der
bereits `resolved` ist oder eine `<!-- firmo-iterate -->`-Antwort trägt, gilt als erledigt und
wird nicht erneut bearbeitet. So bleibt ein zweiter `{{SKILL:iterate}}`-Lauf auf demselben PR
sauber.

### Keine History-Umschreibung

Neue Arbeit geht ausschließlich als **neue Commits** auf den PR-Head-Branch und wird normal
gepusht – konsistent mit `{{SKILL:pr}}` und „Bestehende PRs aktualisieren" in der Delivery-
und Worktree-Integration. Kein `commit --amend`, kein Rebase, kein Squash, kein Force-Push.
Wird der Push wegen divergierter Remote-History abgelehnt, stoppe und melde den Konflikt,
statt History zu überschreiben.
