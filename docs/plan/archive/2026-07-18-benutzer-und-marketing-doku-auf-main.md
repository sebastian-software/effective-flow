# Benutzer- und Marketing-Doku auf dem Auslieferungs-Branch main sichtbar machen

**Planungsstatus:** Umgesetzt
**Quelle:** /firmo plan
**Empfohlener Workflow:** Feature (`/firmo build`)

## Anforderung

Der Auslieferungs-Branch `main` trägt heute nur den maschinell gepushten Skill-Payload
(`claude/` + `codex/`) und einen **veralteten 2-Zeilen-Seed-README**. Die eigentliche
konsumentenorientierte Dokumentation ist auf `main` nicht sichtbar — obwohl `main` der
Default-Branch ist und damit die Landefläche für jeden, der das Repo auf GitHub öffnet.

Ziel: Der Release-Prozess veröffentlicht die **endbenutzerorientierte** Dokumentation
zusätzlich auf `main`, sodass eine klare Trennung dreier Doku-Klassen entsteht:

- **Entwickler-Doku** (`docs/developer-guide/`) — bleibt **develop-only** (Skill-Interna,
  Build-System, Architektur).
- **Benutzer-Doku** (`docs/user-guide/`) — wird **auf `main` veröffentlicht**.
- **Marketing-Einstieg** (`README.md`, „Marketing entry" aus dem jüngsten README-Split) —
  wird **auf `main` veröffentlicht** (ersetzt den Seed-README).

Die Marketing-Landingpage `site/index.html` bleibt bewusst **develop-only** (Entscheidung des
Maintainers; ein Pages-Deployment ist ein möglicher Folgeplan).

**Begründung Workflow-Empfehlung:** Es entsteht neues Auslieferungsverhalten im
CI-Release-Step plus eine testbare Rewrite-Transformation und begleitende Doku — ein
abgeschlossenes Feature mit Guard/Test, kein reiner Bugfix und keine reine Doku-Änderung.

## Architekturentscheidungen

- **Doku-Split entlang der Branch-Grenze.** `main` = konsumentenorientiert (README-Einstieg +
  `docs/user-guide/` + gebauter Skill-Payload); `develop` = Quelle + Entwickler-Doku. Damit
  wird die vom Maintainer gewünschte Dreiteilung (Entwickler / Benutzer / Marketing)
  strukturell an der Branch-Grenze verankert. Ergänzt das bestehende Zwei-Branch-Modell aus
  Issue #92.
- **Verwalteter Payload-Umfang auf `main` erweitert.** Der Deliver-Step verwaltet ab jetzt
  genau diese Pfade auf `main`: `README.md`, `claude/`, `codex/`, `docs/user-guide/`. Jeder
  wird beim Release deterministisch **ersetzt** (erst entfernen, dann kopieren — wie schon bei
  `claude/`/`codex/`), sodass keine veralteten Dateien zurückbleiben. `docs/developer-guide/`
  wird **nie** nach `main` geliefert.
- **Link-Rewrite als testbare, reine Transformation.** Die gelieferten Dateien enthalten
  relative Links in die Entwickler-Doku, die auf `main` ins Leere zeigen würden (verifiziert:
  1 Link im Root-README + 5 Links in drei `docs/user-guide/`-Dateien). Eine **reine Funktion**
  (analog zum bestehenden `build-lib.mjs`-Muster) schreibt beim Delivery jeden Link, der in
  `developer-guide/` zeigt, auf eine **absolute develop-URL** um:
  - im Root-`README.md`: `docs/developer-guide/<pfad>` → `https://github.com/sebastian-software/effective-flow/blob/develop/docs/developer-guide/<pfad>`
  - in `docs/user-guide/*.md`: `../developer-guide/<pfad>` → dieselbe absolute URL.

  Die Basis-URL wird aus dem Repo abgeleitet (CI: `GITHUB_REPOSITORY`), nicht hart kodiert, um
  die Funktion testbar und repo-portabel zu halten. `blob/develop` (nicht `tree/`), weil die
  Ziele Dateien sind. Die Transformation ist **idempotent** und lässt alle übrigen Links
  (user-guide-intern, extern) unberührt. Reine Text-Vorkommen von `docs/developer-guide/`
  (kein Markdown-Link, z. B. beschreibender Fließtext) werden **nicht** angefasst.

- **Rewrite in der Quelle bewusst vermieden.** `develop` behält saubere **relative** Links
  (dort funktionieren sie). Die Absolutierung passiert nur im Liefer-Artefakt auf `main`. So
  bleibt die Quelle lesbar und branch-neutral.
- **Append-only bleibt.** Kein Force-Push; frischer `chore(delivery):`-Commit wie gehabt —
  Konsumenten-Pins bleiben stabil.
- **Dezenter Auslieferungs-Hinweis nur auf `main`.** Der Deliver-Step hängt eine kurze Fußzeile
  an das auf `main` gelieferte `README.md` an: `main` ist der maschinell verwaltete
  Auslieferungs-Branch, Quelle und Beiträge liegen auf `develop`. Das verhindert, dass Besucher
  des Default-Branch versehentlich den überschriebenen `main` editieren. Die Fußzeile lebt **nur**
  im Liefer-Artefakt (nicht in der Quelle) und wird idempotent angehängt (kein doppeltes
  Anhängen bei erneuter Lieferung). Der develop-`README.md` bleibt unverändert.

## Betroffene Dateien

| Datei                                              | Beschreibung                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/release.yml`                    | Deliver-Step erweitern: nach dem Kopieren von `claude/`/`codex/` zusätzlich `README.md` und `docs/user-guide/` in das `main`-Worktree spiegeln (verwaltete Pfade erst `rm -rf`, dann kopieren); vor dem Commit die Link-Rewrite-Transformation über das gelieferte README + `docs/user-guide/` laufen lassen (Basis-URL aus `GITHUB_REPOSITORY`) und die Auslieferungs-Fußzeile an das `main`-README anhängen.                                                              |
| `build-lib.mjs`                                    | Reine, exportierte Funktionen: `rewriteDeveloperGuideLinks(markdown, { repo, sourceBranch, fromRoot })` (ersetzt Markdown-Links in `developer-guide/` durch absolute `blob/<sourceBranch>`-URLs; idempotent; lässt andere Links unberührt; zwei Eingangsformen `docs/developer-guide/…` aus Root-README und `../developer-guide/…` aus user-guide) sowie `appendDeliveryFooter(markdown, { repo, sourceBranch })` (hängt die dezente Auslieferungs-Fußzeile idempotent an). |
| `scripts/deliver-docs.mjs` _(neu, optional)_       | Dünner CLI-Wrapper, den der CI-Step aufruft: liest die gelieferten Markdown-Dateien im Worktree, wendet die reine Funktion an, schreibt zurück. Alternativ inline via `node -e` im Step — Entscheidung in der Umsetzung; die Logik lebt in jedem Fall in `build-lib.mjs` (testbar).                                                                                                                                                                                         |
| `test/build-lib.test.mjs`                          | `node:test`-Fälle für beide Funktionen: Rewrite (Root-README-Form, user-guide-Form, Idempotenz, „andere Links unberührt", „reiner Fließtext ohne Link unberührt") und Footer (angehängt, idempotent).                                                                                                                                                                                                                                                                       |
| `docs/developer-guide/release-und-installation.md` | Doku-Payload auf `main` beschreiben (README + user-guide), die Dreiteilung der Doku-Klassen, den Link-Rewrite und die Auslieferungs-Fußzeile dokumentieren. **Bestehende Aussage „`main` trägt ausschließlich das gebaute `dist/`" korrigieren** (main trägt nun zusätzlich README + user-guide).                                                                                                                                                                           |
| `docs/developer-guide/architektur.md`              | Zwei-Branch-Modell um die Doku-Sichtbarkeit ergänzen (main = konsumentenorientiert inkl. user-guide; developer-guide develop-only).                                                                                                                                                                                                                                                                                                                                         |

## Implementierungsdetails

### Vorgehen

1. Reine Funktion in `build-lib.mjs` implementieren, die einen Markdown-String und den Kontext
   (`repo`, `sourceBranch=develop`, ob Root-README oder user-guide) entgegennimmt und
   developer-guide-Links absolutiert. Nur echte Markdown-Link-Ziele (`](…)`) anfassen.
2. `node:test`-Fälle in `test/build-lib.test.mjs` ergänzen (siehe Edge Cases).
3. Deliver-Step in `release.yml` erweitern:
   - Nach `cp -R dist/claude`/`dist/codex`: `rm -rf "$work/README.md" "$work/docs/user-guide"`,
     dann `README.md` und `docs/user-guide/` aus dem develop-Checkout ins Worktree kopieren
     (`docs/`-Verzeichnis bei Bedarf anlegen).
   - Rewrite über die kopierten Dateien laufen lassen (`GITHUB_REPOSITORY` als Basis) und die
     Auslieferungs-Fußzeile an das `main`-README anhängen.
   - Wie bisher: `git add -A`, nur committen/pushen, wenn es Änderungen gibt; kein Force-Push.
4. Entwickler-Doku (`release-und-installation.md`, `architektur.md`) um das Doku-Modell, den
   Rewrite und die Fußzeile ergänzen; veraltete „main = ausschließlich dist/"-Aussagen korrigieren.
5. `pnpm agent:check`, `pnpm test`, `node build.mjs` grün stellen.

### Edge Cases

- **Root-README vs. user-guide-Pfadtiefe:** Root-README verlinkt `docs/developer-guide/…`,
  user-guide verlinkt `../developer-guide/…`. Beide Formen müssen auf dieselbe absolute URL
  abgebildet werden.
- **Idempotenz:** Ein bereits absoluter develop-Link wird nicht erneut umgeschrieben; die
  Auslieferungs-Fußzeile wird nicht ein zweites Mal angehängt.
- **Nicht-Link-Vorkommen:** `docs/user-guide/tools-umsetzen.md` nennt `docs/developer-guide/`
  als reinen Text (Kategorie-Aufzählung, kein Link) — unangetastet lassen.
- **user-guide-interne Links** (Geschwisterdateien, z. B. `getting-started.md`) bleiben relativ
  und lösen auf `main` auf, da das ganze `docs/user-guide/` geliefert wird.
- **Stale-Purge:** Wird eine user-guide-Datei auf `develop` gelöscht, darf sie auf `main` nicht
  überleben → verwaltete Pfade vor dem Kopieren vollständig entfernen.
- **Kein Release, keine Lieferung:** Der Step bleibt release-gated (`release_created == 'true'`).

## Akzeptanzkriterien

- [ ] Nach einem Release trägt `main` die vollständige `README.md` (Marketing-Einstieg aus
      `develop`) statt des Seed-READMEs sowie das komplette `docs/user-guide/`.
- [ ] `docs/developer-guide/` ist auf `main` **nicht** vorhanden.
- [ ] Jeder Markdown-Link, der in die Entwickler-Doku zeigt, ist in den auf `main` gelieferten
      Dateien eine absolute `https://github.com/sebastian-software/effective-flow/blob/develop/docs/developer-guide/…`-URL
      (verifiziert: der 1 Link im README + die 5 Links in `docs/user-guide/`); kein relativer
      `](../developer-guide/…)` oder `](docs/developer-guide/…)` bleibt übrig.
- [ ] user-guide-interne relative Links lösen auf `main` auf (kein toter Link).
- [ ] Das auf `main` gelieferte `README.md` trägt die dezente Auslieferungs-Fußzeile (Verweis auf
      `develop` als Quelle/Beitragsziel); der develop-`README.md` bleibt ohne Fußzeile.
- [ ] `claude/`/`codex/`-Auslieferung und das Append-only-/Kein-Force-Push-Verhalten bleiben
      unverändert.
- [ ] Die Rewrite- und die Footer-Funktion sind in `build-lib.mjs` gekapselt und durch `node:test`
      abgedeckt (Rewrite: Root-Form, user-guide-Form, Idempotenz, Fremd-Link-/Fließtext-Schonung;
      Footer: angehängt, idempotent).
- [ ] `docs/developer-guide/release-und-installation.md` und `architektur.md` beschreiben die
      Doku-Dreiteilung und den auf `main` gelieferten Doku-Payload; keine Doku behauptet mehr,
      `main` trage „ausschließlich das gebaute `dist/`".
- [ ] `pnpm agent:check`, `pnpm test`, `node build.mjs` grün.

## Validierungsplan

- `node:test`-Suite (`pnpm test`) deckt die Rewrite-Funktion ab.
- **Trockenlauf lokal:** Rewrite + Footer über eine Kopie von `README.md` + `docs/user-guide/`
  laufen lassen und per Grep sicherstellen, dass kein `](../developer-guide` / `](docs/developer-guide`
  mehr vorkommt, die absoluten URLs gesetzt sind und die Fußzeile genau einmal vorhanden ist.
- **Konsistenz-Grep:** `docs/`-Quelle nach „ausschließlich"/„nur … dist" durchsuchen, damit keine
  veraltete „main = nur dist/"-Aussage stehenbleibt.
- **Nach dem ersten Release nach Merge:** `git fetch origin main` und prüfen, dass der Baum
  `README.md` (voll, mit Fußzeile), `docs/user-guide/` (alle Dateien) und `claude/`+`codex/`
  enthält, aber kein `docs/developer-guide/`; Stichprobe der umgeschriebenen Links.

## Annahmen und offene Punkte

- **Privates Repo:** Absolute develop-Links lösen bis zur Veröffentlichung nur für berechtigte
  Nutzer auf (hängt an #143). Bei aktuell einzigem Konsumenten akzeptabel; wird mit „public"
  automatisch korrekt.
- **`site/index.html`** bleibt per Maintainer-Entscheidung develop-only. Ein GitHub-Pages- oder
  main-Deployment der Marketing-Landingpage ist ein möglicher Folgeplan, nicht Teil dieses Plans.
- **`CHANGELOG.md`** wird nicht nach `main` geliefert (kein user-facing Payload dieses Plans);
  bewusst develop-only. Bei Bedarf später ergänzbar.
- **Mechanik-Variante:** Statt des Deliver-Step-Rewrites wäre eine quellseitige absolute URL in
  `develop` denkbar; bewusst zugunsten sauberer relativer Quell-Links + einer einzigen
  getesteten Transformation verworfen.
- **`scripts/deliver-docs.mjs` vs. Inline-`node -e`:** Verpackung offen; die Kernlogik liegt in
  jedem Fall testbar in `build-lib.mjs`.

## Plan-Review

**Ergebnis:** Freigegeben

### Zusammenfassung

| Bereich     | Kritisch | Wichtig | Hinweis |
| ----------- | -------: | ------: | ------: |
| Architektur |        0 |       0 |       1 |
| Security    |        0 |       0 |       1 |
| Datenschutz |        0 |       0 |       0 |
| Fehlerfälle |        0 |       1 |       1 |
| Testbarkeit |        0 |       0 |       0 |
| Scope       |        0 |       0 |       1 |
| Wartbarkeit |        0 |       1 |       0 |

### Befunde

- **Fehlerfälle (Wichtig, eingearbeitet):** Vollständigkeit des Link-Rewrites verifiziert — der
  Root-README hat **nur** zwei Links (`docs/user-guide/README.md` relativ ok,
  `docs/developer-guide/README.md` per Rewrite), keine weiteren toten Root-Links
  (`install-skill.sh`, `site/`, `LICENSE`, Bilder). Die user-guide-Seite escaped nur nach
  `../developer-guide/` (6 Links gesamt), keine sonstigen `../`/absoluten Links. Der Rewrite-Scope
  ist damit nachweislich vollständig.
- **Wartbarkeit (Wichtig, eingearbeitet):** Bestehende Doku-Aussage „`main` trägt ausschließlich
  das gebaute `dist/`" wird durch diesen Plan unwahr; Korrektur als Akzeptanzkriterium und
  Konsistenz-Grep aufgenommen, damit die Doku nicht widersprüchlich wird.
- **Architektur (Hinweis):** Die Doku-Lieferung hängt sich an denselben release-gated
  Deliver-Step wie der Skill-Payload. Das hält alles an einem Ort; sollte der Step wachsen, ist
  ein Auslagern in `scripts/deliver-docs.mjs` der natürliche Schnitt (bereits als Option
  vorgesehen).
- **Security (Hinweis):** Der Rewrite erzeugt absolute Links auf ein privates Repo — kein
  Geheimnis-Leak, aber die Links sind erst nach Veröffentlichung öffentlich nutzbar (an #143
  vermerkt).
- **Fehlerfälle (Hinweis):** Verwaltete Pfade werden vor dem Kopieren entfernt, um Stale-Dateien
  zu vermeiden — wichtig, damit auf `develop` gelöschte user-guide-Dateien nicht auf `main`
  überleben. Fußzeile und Rewrite sind idempotent. Als Edge Case und Akzeptanzkriterium erfasst.
- **Scope (Hinweis):** `site/`-Deployment und `CHANGELOG`-Lieferung sind bewusst außen vor (als
  offene Punkte dokumentiert), um den Plan auf die gewünschte Doku-Sichtbarkeit zu begrenzen. Der
  Auslieferungs-Hinweis auf `main` wurde als dezente Fußzeile entschieden (nur im Liefer-Artefakt).

## Offene Punkte

- Keine offenen Punkte.

## Testergebnisse

**Datum:** 2026-07-18

- `pnpm test` — 58/58 grün, inkl. neuer Fälle für `rewriteDeveloperGuideLinks` (Root-Form,
  user-guide-Form, jede Verschachtelungstiefe `(?:../)+developer-guide/`, Idempotenz,
  Fremd-Link- und Fließtext-Schonung, Argument-Guard) und `appendDeliveryFooter`
  (angehängt, idempotent, Argument-Guard).
- `pnpm agent:check` — Format sauber (183 Dateien).
- `node build.mjs` — grün; Always-loaded-Budget eingehalten.
- Trockenlauf `scripts/deliver-docs.mjs` gegen echte Kopien von `README.md` + `docs/user-guide/`:
  keine relativen developer-guide-Links mehr, 6 absolute `blob/develop`-URLs gesetzt, Fußzeile
  genau einmal, zweiter Lauf idempotent; verschachtelter `../../developer-guide/`-Fall korrekt.

## Review-Findings

**Datum:** 2026-07-18
**Reviewer:** nodejs-reviewer

### Zusammenfassung

| Status                  | Anzahl |
| ----------------------- | -----: |
| Behoben                 |      3 |
| Bewusst nicht umgesetzt |      2 |

Alle Findings waren Schweregrad **Hinweis** (0 Kritisch, 0 Wichtig); keine offenen kritischen Findings.

- **Behoben:** (a) Rewrite deckt jede user-guide-Verschachtelungstiefe ab
  (`(?:../)+developer-guide/`); (b) der Deliver-Step purged zusätzlich `docs/developer-guide/`
  (selbstheilende „main trägt nie developer-guide"-Invariante); (c) `deliver-docs.mjs` meldet
  fehlende Pfade sauber über `fail()` statt Roh-Stacktrace.
- **Bewusst nicht umgesetzt:** (d) ein `)` in einem Link-Ziel würde das Subpath-Capture beenden —
  rein theoretisch (keine solchen Dateien unter `docs/developer-guide/`), als Einschränkung im
  Code-Kommentar dokumentiert; (e) der fehlende `concurrency`-Guard im Release-Workflow ist
  **vorbestehend** (nicht durch diese Änderung eingeführt) und niedrig-riskant, da Releases über
  release-please-Merges serialisiert sind — als möglicher separater Follow-up notiert.
